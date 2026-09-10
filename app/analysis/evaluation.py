from __future__ import annotations

import copy
import hashlib
import json
import time
from contextvars import ContextVar
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response
from shapely import affinity
from shapely.geometry import GeometryCollection, Polygon, shape
from shapely.ops import unary_union
from shapely.validation import make_valid
from .common import _stats_exclude_external_border

if __package__ and __package__.startswith("app."):
    from ..core.runtime import ANNOTATION_ROOT, safe_image_path
    from ..domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from ..imaging.service import (
        get_slide,
        preparation_required,
        read_ready_manifest,
        resolve_render_path,
    )
    from ..storage.annotations import (
        normalize_annotation_file,
        read_annotation_document,
        read_annotation_metadata,
        save_annotation_metadata,
        normalize_annotation_file_metadata,
    )
else:
    from core.runtime import ANNOTATION_ROOT, safe_image_path
    from domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from imaging.service import (
        get_slide,
        preparation_required,
        read_ready_manifest,
        resolve_render_path,
    )
    from storage.annotations import (
        normalize_annotation_file,
        read_annotation_document,
        read_annotation_metadata,
        save_annotation_metadata,
        normalize_annotation_file_metadata,
    )

router = APIRouter()

EVALUATION_SCHEMA_VERSION = 1
EVALUATION_METHOD = "polygonal-union-dice-v1"


# Visual Review performance profiling is opt-in per /evaluation-visual request.
# Scientific /evaluate calls do not activate this ContextVar.
_EVAL_VISUAL_PERF: ContextVar[dict[str, Any] | None] = ContextVar(
    "histoannotator_eval_visual_perf",
    default=None,
)


def _eval_visual_perf_start() -> float | None:
    return time.perf_counter() if _EVAL_VISUAL_PERF.get() is not None else None


def _eval_visual_perf_add_ms(key: str, started: float | None) -> None:
    perf = _EVAL_VISUAL_PERF.get()
    if perf is None or started is None:
        return
    perf[key] = round(
        float(perf.get(key, 0.0))
        + (time.perf_counter() - started) * 1000.0,
        3,
    )


def _eval_visual_perf_inc(key: str, amount: int = 1) -> None:
    perf = _EVAL_VISUAL_PERF.get()
    if perf is None:
        return
    perf[key] = int(perf.get(key, 0)) + int(amount)


def _eval_visual_coordinate_vertex_count(value: Any) -> int:
    """Count XY coordinate pairs in a GeoJSON coordinates tree."""
    if not isinstance(value, (list, tuple)):
        return 0
    if (
        len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        return 1
    return sum(_eval_visual_coordinate_vertex_count(item) for item in value)


def _eval_visual_geometry_vertex_count(payload: Any) -> int:
    if not isinstance(payload, dict):
        return 0
    geometry_type = str(payload.get("type") or "")
    if geometry_type == "GeometryCollection":
        return sum(
            _eval_visual_geometry_vertex_count(item)
            for item in payload.get("geometries", [])
        )
    return _eval_visual_coordinate_vertex_count(payload.get("coordinates"))


def _eval_visual_response_vertex_count(value: Any) -> int:
    """Count geometry coordinates in a response without counting bbox arrays."""
    if isinstance(value, dict):
        geometry_type = str(value.get("type") or "")
        if geometry_type in {"Polygon", "MultiPolygon", "GeometryCollection"}:
            return _eval_visual_geometry_vertex_count(value)
        return sum(_eval_visual_response_vertex_count(item) for item in value.values())
    if isinstance(value, list):
        return sum(_eval_visual_response_vertex_count(item) for item in value)
    return 0


def _canonical_json_sha256(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _class_name(feature: dict[str, Any]) -> str:
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return "Unclassified"

    classification = properties.get("classification")
    if isinstance(classification, dict):
        name = str(classification.get("name") or "").strip()
        if name:
            return name

    legacy = str(properties.get("class_name") or "").strip()
    return legacy or "Unclassified"


def _feature_role(feature: dict[str, Any]) -> str:
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return "annotation"

    histo = properties.get("histoannotator")
    if not isinstance(histo, dict):
        return "annotation"

    return str(histo.get("role") or "annotation").strip().lower()


def _safe_polygonal_geometry(feature: dict[str, Any]) -> Any | None:
    geometry_payload = feature.get("geometry")
    if not isinstance(geometry_payload, dict):
        return None

    parse_started = _eval_visual_perf_start()
    try:
        geometry = shape(geometry_payload)
    except Exception:
        _eval_visual_perf_add_ms("geometryParseMs", parse_started)
        _eval_visual_perf_inc("geometryParseErrors")
        return None
    _eval_visual_perf_add_ms("geometryParseMs", parse_started)
    _eval_visual_perf_inc("geometryParsed")

    if geometry.is_empty:
        return None

    if not geometry.is_valid:
        valid_started = _eval_visual_perf_start()
        try:
            geometry = make_valid(geometry)
        except Exception:
            _eval_visual_perf_add_ms("makeValidMs", valid_started)
            _eval_visual_perf_inc("makeValidErrors")
            return None
        _eval_visual_perf_add_ms("makeValidMs", valid_started)
        _eval_visual_perf_inc("makeValidCalls")

    geometry = _polygonal_only(geometry)
    if geometry is None or geometry.is_empty:
        return None

    return geometry


def _mapping_lookup(
    source_name: str,
    mapping_payload: Any,
) -> str | None:
    mapping = mapping_payload if isinstance(mapping_payload, dict) else {}

    if source_name in mapping:
        target = mapping[source_name]
    else:
        target = source_name
        folded = source_name.casefold()
        for key, value in mapping.items():
            if str(key).casefold() == folded:
                target = value
                break

    if target is None:
        return None

    normalized = str(target).strip()
    if not normalized:
        return None

    if normalized.casefold() in {"ignore", "__ignore__", "(ignore)"}:
        return None

    return normalized


def _union_geometries(items: list[Any]) -> Any:
    if not items:
        return GeometryCollection()

    union_started = _eval_visual_perf_start()
    geometry = unary_union(items) if len(items) > 1 else items[0]
    _eval_visual_perf_add_ms("unionMs", union_started)
    _eval_visual_perf_inc("unionCalls")
    _eval_visual_perf_inc("unionInputGeometries", len(items))

    if not geometry.is_valid:
        valid_started = _eval_visual_perf_start()
        geometry = make_valid(geometry)
        _eval_visual_perf_add_ms("makeValidMs", valid_started)
        _eval_visual_perf_inc("makeValidCalls")

    return _polygonal_only(geometry) or GeometryCollection()


def _mapped_geometries(
    collection_payload: dict[str, Any],
    mapping_payload: Any,
    *,
    bounds: Any | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    sanitize_started = _eval_visual_perf_start()
    collection, sanitize_report = sanitize_qupath_feature_collection(
        collection_payload
    )
    _eval_visual_perf_add_ms("sanitizeMs", sanitize_started)
    _eval_visual_perf_inc("sanitizeCalls")

    mapped_groups: dict[str, list[Any]] = {}
    source_groups: dict[str, list[Any]] = {}
    source_counts: dict[str, int] = {}

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        # Tissue ROI and other ROI helper objects are not semantic classes.
        if _feature_role(feature) == "roi":
            continue

        geometry = _safe_polygonal_geometry(feature)
        if geometry is None:
            continue

        if bounds is not None:
            clip_started = _eval_visual_perf_start()
            geometry = geometry.intersection(bounds)
            _eval_visual_perf_add_ms("boundsClipMs", clip_started)
            _eval_visual_perf_inc("boundsClipCalls")
            geometry = _polygonal_only(geometry)
            if geometry is None or geometry.is_empty:
                continue

        source_name = _class_name(feature)
        source_groups.setdefault(source_name, []).append(geometry)
        source_counts[source_name] = source_counts.get(source_name, 0) + 1

        target_name = _mapping_lookup(source_name, mapping_payload)
        if target_name is None:
            continue

        mapped_groups.setdefault(target_name, []).append(geometry)

    source_rows = []
    for source_name in sorted(source_groups, key=str.casefold):
        geometry = _union_geometries(source_groups[source_name])
        source_rows.append(
            {
                "className": source_name,
                "count": source_counts[source_name],
                "areaPx2": float(geometry.area),
            }
        )

    mapped = {
        target_name: _union_geometries(items)
        for target_name, items in mapped_groups.items()
    }

    return mapped, source_rows, sanitize_report



def _evaluation_source_classes_fast(
    collection_payload: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    features = collection_payload.get("features", [])
    if not isinstance(features, list):
        features = []

    counts: dict[str, int] = {}
    polygon_features = 0
    roi_features = 0
    ignored_geometry_features = 0
    invalid_features = 0

    for feature in features:
        if not isinstance(feature, dict):
            invalid_features += 1
            continue

        if _feature_role(feature) == "roi":
            roi_features += 1
            continue

        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            invalid_features += 1
            continue

        geometry_type = str(geometry.get("type") or "").strip()
        if geometry_type not in {"Polygon", "MultiPolygon"}:
            ignored_geometry_features += 1
            continue

        source_name = _class_name(feature)
        counts[source_name] = counts.get(source_name, 0) + 1
        polygon_features += 1

    rows = [
        {
            "className": source_name,
            "count": count,
            "areaPx2": None,
        }
        for source_name, count in sorted(
            counts.items(),
            key=lambda item: item[0].casefold(),
        )
    ]

    report = {
        "mode": "metadata-only-class-scan",
        "inputFeatures": len(features),
        "polygonFeatures": polygon_features,
        "roiFeatures": roi_features,
        "ignoredGeometryFeatures": ignored_geometry_features,
        "invalidFeatures": invalid_features,
    }

    return rows, report



def _eval_visual_binary(
    left: Any,
    right: Any,
    operation: str,
) -> Any:
    if left is None or getattr(left, "is_empty", True):
        return GeometryCollection()

    if operation == "intersection":
        if right is None or getattr(right, "is_empty", True):
            return GeometryCollection()
        binary_started = _eval_visual_perf_start()
        try:
            result = left.intersection(right)
        except Exception:
            repair_started = _eval_visual_perf_start()
            repaired_left = make_valid(left)
            repaired_right = make_valid(right)
            _eval_visual_perf_add_ms("binaryRepairMs", repair_started)
            _eval_visual_perf_inc("binaryRepairCalls")
            result = repaired_left.intersection(repaired_right)
        _eval_visual_perf_add_ms("intersectionMs", binary_started)
        _eval_visual_perf_inc("intersectionCalls")

    elif operation == "difference":
        if right is None or getattr(right, "is_empty", True):
            result = left
        else:
            binary_started = _eval_visual_perf_start()
            try:
                result = left.difference(right)
            except Exception:
                repair_started = _eval_visual_perf_start()
                repaired_left = make_valid(left)
                repaired_right = make_valid(right)
                _eval_visual_perf_add_ms("binaryRepairMs", repair_started)
                _eval_visual_perf_inc("binaryRepairCalls")
                result = repaired_left.difference(repaired_right)
            _eval_visual_perf_add_ms("differenceMs", binary_started)
            _eval_visual_perf_inc("differenceCalls")

    else:
        raise ValueError(f"Unsupported visual-evaluation operation: {operation}")

    result = _polygonal_only(result)
    return result or GeometryCollection()


def _eval_visual_geometry_payload(
    geometry: Any,
) -> dict[str, Any] | None:
    if geometry is None or getattr(geometry, "is_empty", True):
        return None

    payload = getattr(geometry, "__geo_interface__", None)
    return payload if isinstance(payload, dict) else None


def _eval_visual_components(
    geometry: Any,
) -> list[Any]:
    if geometry is None or getattr(geometry, "is_empty", True):
        return []

    geometry_type = str(getattr(geometry, "geom_type", ""))

    if geometry_type == "Polygon":
        return [geometry]

    if geometry_type in {"MultiPolygon", "GeometryCollection"}:
        output: list[Any] = []
        for item in getattr(geometry, "geoms", []):
            output.extend(_eval_visual_components(item))
        return output

    return []


def _eval_visual_region_rows(
    geometry: Any,
    *,
    kind: str,
    candidate_class: str | None,
    reference_class: str | None,
    defer_geometry_payload: bool = False,
) -> list[dict[str, Any]]:
    """Build review-region rows, optionally deferring expensive GeoJSON payloads.

    Visual Review sorts all components by area but only returns max_regions.
    Deferring bbox/GeoJSON materialization avoids serializing thousands of
    discarded polygons while preserving the exact selected region geometries.
    """
    rows: list[dict[str, Any]] = []

    for component in _eval_visual_components(geometry):
        row: dict[str, Any] = {
            "kind": kind,
            "candidateClass": candidate_class,
            "referenceClass": reference_class,
            "areaPx2": float(component.area),
        }

        if defer_geometry_payload:
            row["_geometryObject"] = component
            _eval_visual_perf_inc("regionRowsDeferred")
        else:
            min_x, min_y, max_x, max_y = component.bounds
            row["bbox"] = [
                float(min_x),
                float(min_y),
                float(max_x),
                float(max_y),
            ]
            row["geometry"] = _eval_visual_geometry_payload(component)

        rows.append(row)

    return rows


# Visual Review shared-preparation optimization v1
#
# The old v4 path mapped/sanitized/clipped Candidate + Ground Truth twice:
# once in visual_evaluation_feature_collections() and again in v4.  This
# private context performs that work once and is reused by both layers.
# Scientific /evaluate is intentionally untouched.
def _eval_visual_prepare_context(
    candidate_payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    target_class: str,
    candidate_mapping: Any = None,
    reference_mapping: Any = None,
    image_width: float | None = None,
    image_height: float | None = None,
) -> dict[str, Any]:
    prepare_started = _eval_visual_perf_start()
    bounds = None

    if (
        image_width is not None
        and image_height is not None
        and float(image_width) > 0
        and float(image_height) > 0
    ):
        bounds = Polygon(
            [
                (0.0, 0.0),
                (float(image_width), 0.0),
                (float(image_width), float(image_height)),
                (0.0, float(image_height)),
            ]
        )

    candidate, _, candidate_report = _mapped_geometries(
        candidate_payload,
        candidate_mapping,
        bounds=bounds,
    )

    reference, _, reference_report = _mapped_geometries(
        reference_payload,
        reference_mapping,
        bounds=bounds,
    )

    (
        candidate,
        reference,
        evaluation_roi,
        evaluation_region,
    ) = _evaluation_valid_scope_from_reference_v3(
        candidate,
        reference,
        reference_payload,
        bounds=bounds,
    )

    target = str(target_class or "").strip()
    available_classes = sorted(
        set(candidate) | set(reference),
        key=str.casefold,
    )

    if not target:
        raise ValueError("targetClass is required")

    if target not in available_classes:
        raise ValueError(
            f'Class "{target}" is not available after mapping'
        )

    empty = GeometryCollection()
    candidate_target = candidate.get(target, empty)
    reference_target = reference.get(target, empty)

    candidate_all = _union_geometries(
        [
            geometry
            for geometry in candidate.values()
            if geometry is not None and not geometry.is_empty
        ]
    )

    reference_all = _union_geometries(
        [
            geometry
            for geometry in reference.values()
            if geometry is not None and not geometry.is_empty
        ]
    )

    context = {
        "bounds": bounds,
        "candidate": candidate,
        "reference": reference,
        "candidateReport": candidate_report,
        "referenceReport": reference_report,
        "evaluationRoi": evaluation_roi,
        "evaluationRegion": evaluation_region,
        "target": target,
        "availableClasses": available_classes,
        "candidateTarget": candidate_target,
        "referenceTarget": reference_target,
        "candidateAll": candidate_all,
        "referenceAll": reference_all,
        # Filled by the base overlay and reused by v4.
        "pairIntersections": {},
    }

    _eval_visual_perf_add_ms("sharedPrepareMs", prepare_started)
    _eval_visual_perf_inc("sharedPrepareCalls")
    return context


def visual_evaluation_feature_collections(
    candidate_payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    target_class: str,
    candidate_mapping: Any = None,
    reference_mapping: Any = None,
    image_width: float | None = None,
    image_height: float | None = None,
    max_regions: int = 500,
    _prepared_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prepared = _prepared_context
    if prepared is None:
        prepared = _eval_visual_prepare_context(
            candidate_payload,
            reference_payload,
            target_class=target_class,
            candidate_mapping=candidate_mapping,
            reference_mapping=reference_mapping,
            image_width=image_width,
            image_height=image_height,
        )
    else:
        _eval_visual_perf_inc("preparedContextReuse")

    candidate = prepared["candidate"]
    reference = prepared["reference"]
    candidate_report = prepared["candidateReport"]
    reference_report = prepared["referenceReport"]
    evaluation_roi = prepared["evaluationRoi"]
    evaluation_region = prepared["evaluationRegion"]
    target = prepared["target"]
    available_classes = prepared["availableClasses"]
    candidate_target = prepared["candidateTarget"]
    reference_target = prepared["referenceTarget"]
    candidate_all = prepared["candidateAll"]
    reference_all = prepared["referenceAll"]

    agreement = _eval_visual_binary(
        candidate_target,
        reference_target,
        "intersection",
    )

    candidate_only = _eval_visual_binary(
        candidate_target,
        reference_target,
        "difference",
    )

    reference_only = _eval_visual_binary(
        reference_target,
        candidate_target,
        "difference",
    )

    unmatched_candidate = _eval_visual_binary(
        candidate_target,
        reference_all,
        "difference",
    )

    missed_reference = _eval_visual_binary(
        reference_target,
        candidate_all,
        "difference",
    )

    # Cache exact class-pair intersections because v4 needs the same pairs.
    pair_intersections = prepared.setdefault("pairIntersections", {})

    mismatch_items: list[dict[str, Any]] = []
    mismatch_geometries: list[Any] = []
    region_rows: list[dict[str, Any]] = []

    for candidate_name, candidate_geometry in candidate.items():
        if candidate_geometry.is_empty:
            continue

        for reference_name, reference_geometry in reference.items():
            if (
                reference_geometry.is_empty
                or candidate_name == reference_name
            ):
                continue

            if (
                candidate_name != target
                and reference_name != target
            ):
                continue

            pair_key = (candidate_name, reference_name)
            mismatch = _eval_visual_binary(
                candidate_geometry,
                reference_geometry,
                "intersection",
            )
            pair_intersections[pair_key] = mismatch

            if mismatch.is_empty:
                continue

            mismatch_geometries.append(mismatch)

            mismatch_items.append(
                {
                    "candidateClass": candidate_name,
                    "referenceClass": reference_name,
                    "areaPx2": float(mismatch.area),
                }
            )

            region_rows.extend(
                _eval_visual_region_rows(
                    mismatch,
                    kind="wrong_class",
                    candidate_class=candidate_name,
                    reference_class=reference_name,
                    defer_geometry_payload=True,
                )
            )

    wrong_class = _union_geometries(mismatch_geometries)

    region_rows.extend(
        _eval_visual_region_rows(
            unmatched_candidate,
            kind="candidate_only",
            candidate_class=target,
            reference_class=None,
            defer_geometry_payload=True,
        )
    )

    region_rows.extend(
        _eval_visual_region_rows(
            missed_reference,
            kind="reference_only",
            candidate_class=None,
            reference_class=target,
            defer_geometry_payload=True,
        )
    )

    region_rows.sort(
        key=lambda row: float(row.get("areaPx2") or 0.0),
        reverse=True,
    )

    total_region_count = len(region_rows)
    safe_max_regions = max(
        1,
        min(5000, int(max_regions or 500)),
    )
    visible_regions = region_rows[:safe_max_regions]

    materialize_started = _eval_visual_perf_start()
    for index, row in enumerate(visible_regions, start=1):
        component = row.pop("_geometryObject", None)
        if component is not None:
            min_x, min_y, max_x, max_y = component.bounds
            row["bbox"] = [
                float(min_x),
                float(min_y),
                float(max_x),
                float(max_y),
            ]
            row["geometry"] = _eval_visual_geometry_payload(component)
        row["id"] = f"error-{index}"

    _eval_visual_perf_add_ms("regionMaterializeMs", materialize_started)
    _eval_visual_perf_inc("regionCandidates", total_region_count)
    _eval_visual_perf_inc("regionSerialized", len(visible_regions))

    # Reuse these exact base geometries in v4 instead of recomputing them.
    prepared["agreement"] = agreement
    prepared["candidateUnmatched"] = unmatched_candidate
    prepared["referenceMissed"] = missed_reference

    layer_specs = [
        (
            "agreement",
            "Agreement / same class",
            "#22c55e",
            agreement,
        ),
        (
            "candidate_only",
            "Candidate only",
            "#ef4444",
            unmatched_candidate,
        ),
        (
            "reference_only",
            "Reference only / missed",
            "#3b82f6",
            missed_reference,
        ),
        (
            "wrong_class",
            "Wrong class",
            "#f59e0b",
            wrong_class,
        ),
    ]

    layers = []

    for layer_id, label, color, geometry in layer_specs:
        layers.append(
            {
                "id": layer_id,
                "label": label,
                "color": color,
                "areaPx2": (
                    float(geometry.area)
                    if geometry is not None and not geometry.is_empty
                    else 0.0
                ),
                "geometry": _eval_visual_geometry_payload(geometry),
            }
        )

    mismatch_items.sort(
        key=lambda item: float(item["areaPx2"]),
        reverse=True,
    )

    return {
        "schemaVersion": 1,
        "method": "visual-evaluation-overlay-v1",
        "coordinateSpace": "level-0-image-pixels",
        "evaluationRegion": evaluation_region,
        "evaluationScopeGeometry": _evaluation_scope_geometry_payload_v3(
            evaluation_roi
        ),
        "referenceRoi": _evaluation_reference_roi_payload(
            evaluation_roi
        ),
        "targetClass": target,
        "availableClasses": available_classes,
        "layers": layers,
        "mismatches": mismatch_items,
        "regions": visible_regions,
        "regionCount": total_region_count,
        "regionsTruncated": total_region_count > len(visible_regions),
        "candidate": {
            "sanitizeReport": candidate_report,
        },
        "reference": {
            "sanitizeReport": reference_report,
        },
    }


def _evaluation_reference_roi_geometry(
    reference_payload: dict[str, Any],
    *,
    bounds: Any | None = None,
) -> Any:
    collection, _ = sanitize_qupath_feature_collection(
        reference_payload
    )

    roi_geometries: list[Any] = []

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        if _feature_role(feature) != "roi":
            continue

        geometry = _safe_polygonal_geometry(feature)

        if geometry is None:
            continue

        if bounds is not None:
            try:
                geometry = geometry.intersection(bounds)
            except Exception:
                geometry = make_valid(geometry).intersection(
                    make_valid(bounds)
                )

            geometry = (
                _polygonal_only(geometry)
                or GeometryCollection()
            )

        if not geometry.is_empty:
            roi_geometries.append(geometry)

    return _union_geometries(roi_geometries)


def _evaluation_clip_to_reference_roi(
    mapped: dict[str, Any],
    reference_roi: Any,
) -> dict[str, Any]:
    if (
        reference_roi is None
        or getattr(reference_roi, "is_empty", True)
    ):
        return mapped

    clipped: dict[str, Any] = {}

    for class_name, geometry in mapped.items():
        if (
            geometry is None
            or getattr(geometry, "is_empty", True)
        ):
            clipped[class_name] = GeometryCollection()
            continue

        try:
            result = geometry.intersection(reference_roi)
        except Exception:
            result = make_valid(geometry).intersection(
                make_valid(reference_roi)
            )

        clipped[class_name] = (
            _polygonal_only(result)
            or GeometryCollection()
        )

    return clipped


def _evaluation_scope_from_reference(
    candidate: dict[str, Any],
    reference: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    bounds: Any | None = None,
) -> tuple[dict[str, Any], dict[str, Any], Any, str]:
    reference_roi = _evaluation_reference_roi_geometry(
        reference_payload,
        bounds=bounds,
    )

    if (
        reference_roi is None
        or getattr(reference_roi, "is_empty", True)
    ):
        return (
            candidate,
            reference,
            GeometryCollection(),
            "full-image-bounds",
        )

    return (
        _evaluation_clip_to_reference_roi(
            candidate,
            reference_roi,
        ),
        _evaluation_clip_to_reference_roi(
            reference,
            reference_roi,
        ),
        reference_roi,
        "reference-roi",
    )


def _evaluation_reference_roi_payload(
    reference_roi: Any,
) -> dict[str, Any]:
    present = bool(
        reference_roi is not None
        and not getattr(reference_roi, "is_empty", True)
    )

    geometry = None

    if present:
        payload = getattr(
            reference_roi,
            "__geo_interface__",
            None,
        )
        if isinstance(payload, dict):
            geometry = payload

    return {
        "present": present,
        "source": "reference" if present else None,
        "areaPx2": (
            float(reference_roi.area)
            if present
            else 0.0
        ),
        "geometry": geometry,
    }



def _evaluation_reference_valid_region_v3(
    reference_payload: dict[str, Any],
    *,
    bounds: Any | None = None,
) -> tuple[Any, str]:
    """
    Evaluation valid region from Ground Truth / Reference only.

    Scope contract:
      1. union Tissue ROI features from the Reference document;
      2. clip to image bounds;
      3. if the ROI carries externalBorderExclusion, apply the same
         area-percentage erosion used by HistoAnnotator statistics/H-DAB;
      4. Candidate-side ROI never changes the evaluation region.
    """
    collection, _ = sanitize_qupath_feature_collection(
        reference_payload
    )

    tissue_geometries: list[Any] = []

    border_enabled = False
    border_percent = 0.0

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        if _feature_role(feature) != "roi":
            continue

        properties = feature.get("properties", {})
        if not isinstance(properties, dict):
            properties = {}

        histo = properties.get("histoannotator", {})
        if not isinstance(histo, dict):
            histo = {}

        roi_meta = histo.get("roi", {})
        if not isinstance(roi_meta, dict):
            roi_meta = {}

        roi_kind = str(
            roi_meta.get("kind", "tissue")
            or "tissue"
        ).strip().lower()

        if roi_kind != "tissue":
            continue

        geometry = _safe_polygonal_geometry(
            feature
        )

        if geometry is None:
            continue

        tissue_geometries.append(
            geometry
        )

        border_meta = roi_meta.get(
            "externalBorderExclusion"
        )

        if isinstance(border_meta, dict):
            border_enabled = bool(
                border_meta.get(
                    "enabled",
                    False,
                )
            )

            try:
                border_percent = max(
                    0.0,
                    min(
                        50.0,
                        float(
                            border_meta.get(
                                "percent",
                                0,
                            )
                            or 0
                        ),
                    ),
                )
            except (TypeError, ValueError):
                border_percent = 0.0

    if not tissue_geometries:
        return (
            GeometryCollection(),
            "full-image-bounds",
        )

    tissue_roi = _union_geometries(
        tissue_geometries
    )

    if bounds is not None:
        try:
            tissue_roi = tissue_roi.intersection(
                bounds
            )
        except Exception:
            tissue_roi = make_valid(
                tissue_roi
            ).intersection(
                make_valid(
                    bounds
                )
            )

        tissue_roi = (
            _polygonal_only(
                tissue_roi
            )
            or GeometryCollection()
        )

    if tissue_roi.is_empty:
        return (
            GeometryCollection(),
            "full-image-bounds",
        )

    requested_border = (
        border_percent
        if border_enabled
        else 0.0
    )

    if requested_border <= 0:
        return (
            tissue_roi,
            "reference-roi",
        )

    (
        inner_roi,
        _actual_percent,
        _border_width_px,
    ) = _stats_exclude_external_border(
        tissue_roi,
        requested_border,
    )

    inner_roi = (
        _polygonal_only(
            inner_roi
        )
        or GeometryCollection()
    )

    if inner_roi.is_empty:
        raise ValueError(
            "Ground Truth external border exclusion removed "
            "the complete Tissue ROI"
        )

    return (
        inner_roi,
        "reference-roi-inner",
    )


def _evaluation_clip_to_valid_region_v3(
    mapped: dict[str, Any],
    valid_region: Any,
) -> dict[str, Any]:
    if (
        valid_region is None
        or getattr(
            valid_region,
            "is_empty",
            True,
        )
    ):
        return mapped

    output: dict[str, Any] = {}

    for class_name, geometry in mapped.items():
        if (
            geometry is None
            or getattr(
                geometry,
                "is_empty",
                True,
            )
        ):
            output[class_name] = GeometryCollection()
            continue

        try:
            clipped = geometry.intersection(
                valid_region
            )
        except Exception:
            clipped = make_valid(
                geometry
            ).intersection(
                make_valid(
                    valid_region
                )
            )

        output[class_name] = (
            _polygonal_only(
                clipped
            )
            or GeometryCollection()
        )

    return output


def _evaluation_valid_scope_from_reference_v3(
    candidate: dict[str, Any],
    reference: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    bounds: Any | None = None,
) -> tuple[
    dict[str, Any],
    dict[str, Any],
    Any,
    str,
]:
    valid_region, mode = (
        _evaluation_reference_valid_region_v3(
            reference_payload,
            bounds=bounds,
        )
    )

    if (
        valid_region is None
        or getattr(
            valid_region,
            "is_empty",
            True,
        )
    ):
        return (
            candidate,
            reference,
            GeometryCollection(),
            "full-image-bounds",
        )

    return (
        _evaluation_clip_to_valid_region_v3(
            candidate,
            valid_region,
        ),
        _evaluation_clip_to_valid_region_v3(
            reference,
            valid_region,
        ),
        valid_region,
        mode,
    )


def _evaluation_scope_geometry_payload_v3(
    geometry: Any,
) -> dict[str, Any] | None:
    if (
        geometry is None
        or getattr(
            geometry,
            "is_empty",
            True,
        )
    ):
        return None

    payload = getattr(
        geometry,
        "__geo_interface__",
        None,
    )

    return (
        payload
        if isinstance(
            payload,
            dict,
        )
        else None
    )


def evaluate_feature_collections(
    candidate_payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    candidate_mapping: Any = None,
    reference_mapping: Any = None,
    image_width: float | None = None,
    image_height: float | None = None,
) -> dict[str, Any]:
    bounds = None
    if (
        image_width is not None
        and image_height is not None
        and float(image_width) > 0
        and float(image_height) > 0
    ):
        bounds = Polygon(
            [
                (0.0, 0.0),
                (float(image_width), 0.0),
                (float(image_width), float(image_height)),
                (0.0, float(image_height)),
            ]
        )

    candidate, candidate_sources, candidate_report = _mapped_geometries(
        candidate_payload,
        candidate_mapping,
        bounds=bounds,
    )
    reference, reference_sources, reference_report = _mapped_geometries(
        reference_payload,
        reference_mapping,
        bounds=bounds,
    )

    (
        candidate,
        reference,
        evaluation_roi,
        evaluation_region,
    ) = _evaluation_valid_scope_from_reference_v3(
        candidate,
        reference,
        reference_payload,
        bounds=bounds,
    )

    target_names = sorted(
        set(candidate) | set(reference),
        key=str.casefold,
    )

    rows: list[dict[str, Any]] = []
    sum_candidate = 0.0
    sum_reference = 0.0
    sum_intersection = 0.0

    for class_name in target_names:
        candidate_geometry = candidate.get(class_name, GeometryCollection())
        reference_geometry = reference.get(class_name, GeometryCollection())

        candidate_area = (
            float(candidate_geometry.area)
            if not candidate_geometry.is_empty
            else 0.0
        )
        reference_area = (
            float(reference_geometry.area)
            if not reference_geometry.is_empty
            else 0.0
        )

        intersection_area = 0.0
        if (
            not candidate_geometry.is_empty
            and not reference_geometry.is_empty
        ):
            try:
                intersection = candidate_geometry.intersection(
                    reference_geometry
                )
            except Exception:
                intersection = make_valid(candidate_geometry).intersection(
                    make_valid(reference_geometry)
                )

            intersection = _polygonal_only(intersection) or GeometryCollection()
            if not intersection.is_empty:
                intersection_area = float(intersection.area)

        denominator = candidate_area + reference_area
        union_area = candidate_area + reference_area - intersection_area

        dice = (
            2.0 * intersection_area / denominator
            if denominator > 0
            else 1.0
        )
        iou = (
            intersection_area / union_area
            if union_area > 0
            else 1.0
        )
        precision = (
            intersection_area / candidate_area
            if candidate_area > 0
            else None
        )
        recall = (
            intersection_area / reference_area
            if reference_area > 0
            else None
        )

        rows.append(
            {
                "className": class_name,
                "candidateAreaPx2": candidate_area,
                "referenceAreaPx2": reference_area,
                "intersectionAreaPx2": intersection_area,
                "unionAreaPx2": union_area,
                "dice": float(dice),
                "iou": float(iou),
                "precision": (
                    float(precision)
                    if precision is not None
                    else None
                ),
                "recall": (
                    float(recall)
                    if recall is not None
                    else None
                ),
            }
        )

        sum_candidate += candidate_area
        sum_reference += reference_area
        sum_intersection += intersection_area

    macro_dice = (
        sum(row["dice"] for row in rows) / len(rows)
        if rows
        else None
    )
    macro_iou = (
        sum(row["iou"] for row in rows) / len(rows)
        if rows
        else None
    )

    micro_denominator = sum_candidate + sum_reference
    micro_union = sum_candidate + sum_reference - sum_intersection

    micro_dice = (
        2.0 * sum_intersection / micro_denominator
        if micro_denominator > 0
        else None
    )
    micro_iou = (
        sum_intersection / micro_union
        if micro_union > 0
        else None
    )

    return {
        "schemaVersion": EVALUATION_SCHEMA_VERSION,
        "method": EVALUATION_METHOD,
        "coordinateSpace": "level-0-image-pixels",
        "evaluationRegion": evaluation_region,
        "evaluationScopeGeometry": _evaluation_scope_geometry_payload_v3(
            evaluation_roi
        ),
        "referenceRoi": _evaluation_reference_roi_payload(
            evaluation_roi
        ),
        "rows": rows,
        "summary": {
            "classCount": len(rows),
            "macroDice": macro_dice,
            "macroIoU": macro_iou,
            "microDice": micro_dice,
            "microIoU": micro_iou,
        },
        "candidate": {
            "sourceClasses": candidate_sources,
            "sanitizeReport": candidate_report,
        },
        "reference": {
            "sourceClasses": reference_sources,
            "sanitizeReport": reference_report,
        },
    }


def _image_dimensions(image_id: str) -> tuple[str, int, int]:
    path, relative = safe_image_path(image_id)

    if (
        preparation_required(path)
        and not read_ready_manifest(path, relative)
    ):
        raise HTTPException(
            status_code=409,
            detail="Image is not ready yet",
        )

    render_path = resolve_render_path(path, relative)
    handle = get_slide(render_path)
    width, height = handle.dimensions
    return relative, int(width), int(height)


@router.get("/api/annotations/{image_id}/file-meta")
def get_annotation_file_metadata(
    image_id: str,
    file: str = Query("Default"),
) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)

    return {
        "annotationFile": name,
        "metadata": read_annotation_metadata(
            ANNOTATION_ROOT,
            relative,
            name,
        ),
    }


@router.put("/api/annotations/{image_id}/file-meta")
def put_annotation_file_metadata(
    image_id: str,
    payload: dict[str, Any] = Body(...),
    file: str = Query("Default"),
) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)
    metadata = normalize_annotation_file_metadata(payload)

    save_annotation_metadata(
        ANNOTATION_ROOT,
        relative,
        name,
        metadata,
    )

    return {
        "saved": True,
        "annotationFile": name,
        "metadata": metadata,
    }


@router.get("/api/annotations/{image_id}/evaluation-info")
def get_evaluation_info(
    image_id: str,
    file: str = Query("Default"),
) -> dict[str, Any]:
    relative, width, height = _image_dimensions(image_id)
    name = normalize_annotation_file(file)

    collection = read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        name,
        error_prefix="Could not read evaluation annotation file",
    )

    source_classes, report = _evaluation_source_classes_fast(
        collection
    )

    return {
        "annotationFile": name,
        "documentChecksum": _canonical_json_sha256(collection),
        "metadata": read_annotation_metadata(
            ANNOTATION_ROOT,
            relative,
            name,
        ),
        "classes": source_classes,
        "imageWidth": width,
        "imageHeight": height,
        "report": report,
    }




def _eval_v4_area(
    geometry: Any,
) -> float:
    if (
        geometry is None
        or getattr(
            geometry,
            "is_empty",
            True,
        )
    ):
        return 0.0

    return float(
        geometry.area
    )


def _eval_v4_percent(
    area: float,
    denominator: float,
) -> float:
    if denominator <= 0:
        return 0.0

    return max(
        0.0,
        min(
            100.0,
            100.0
            * float(area)
            / float(denominator),
        ),
    )


def visual_evaluation_feature_collections_v4(
    candidate_payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    target_class: str,
    candidate_mapping: Any = None,
    reference_mapping: Any = None,
    image_width: float | None = None,
    image_height: float | None = None,
    max_regions: int = 500,
) -> dict[str, Any]:
    """Enrich Visual Review while reusing the base overlay preparation.

    Mapping, sanitization, valid-region clipping, whole-class unions, agreement,
    unmatched target geometries, and class-pair intersections are shared with
    the base Visual Review overlay. Scientific /evaluate remains unchanged.
    """
    prepared = _eval_visual_prepare_context(
        candidate_payload,
        reference_payload,
        target_class=target_class,
        candidate_mapping=candidate_mapping,
        reference_mapping=reference_mapping,
        image_width=image_width,
        image_height=image_height,
    )

    result = visual_evaluation_feature_collections(
        candidate_payload,
        reference_payload,
        target_class=target_class,
        candidate_mapping=candidate_mapping,
        reference_mapping=reference_mapping,
        image_width=image_width,
        image_height=image_height,
        max_regions=max_regions,
        _prepared_context=prepared,
    )

    candidate = prepared["candidate"]
    reference = prepared["reference"]
    evaluation_region = prepared["evaluationRegion"]
    target = prepared["target"]
    candidate_target = prepared["candidateTarget"]
    reference_target = prepared["referenceTarget"]
    candidate_all = prepared["candidateAll"]
    reference_all = prepared["referenceAll"]

    candidate_other = _union_geometries(
        [
            geometry
            for class_name, geometry in candidate.items()
            if class_name != target
            and geometry is not None
            and not geometry.is_empty
        ]
    )

    reference_other = _union_geometries(
        [
            geometry
            for class_name, geometry in reference.items()
            if class_name != target
            and geometry is not None
            and not geometry.is_empty
        ]
    )

    agreement = prepared.get("agreement")
    if agreement is None:
        agreement = _eval_visual_binary(
            candidate_target,
            reference_target,
            "intersection",
        )

    reference_wrong = _eval_visual_binary(
        reference_target,
        candidate_other,
        "intersection",
    )
    reference_wrong = _eval_visual_binary(
        reference_wrong,
        candidate_target,
        "difference",
    )

    reference_missed = prepared.get("referenceMissed")
    if reference_missed is None:
        reference_missed = _eval_visual_binary(
            reference_target,
            candidate_all,
            "difference",
        )

    candidate_wrong = _eval_visual_binary(
        candidate_target,
        reference_other,
        "intersection",
    )
    candidate_wrong = _eval_visual_binary(
        candidate_wrong,
        reference_target,
        "difference",
    )

    candidate_unmatched = prepared.get("candidateUnmatched")
    if candidate_unmatched is None:
        candidate_unmatched = _eval_visual_binary(
            candidate_target,
            reference_all,
            "difference",
        )

    reference_denominator = _eval_v4_area(reference_target)
    candidate_denominator = _eval_v4_area(candidate_target)
    agreement_area = _eval_v4_area(agreement)
    reference_wrong_area = _eval_v4_area(reference_wrong)
    reference_missed_area = _eval_v4_area(reference_missed)
    candidate_wrong_area = _eval_v4_area(candidate_wrong)
    candidate_unmatched_area = _eval_v4_area(candidate_unmatched)

    mismatch_layers: list[dict[str, Any]] = []
    reference_breakdown: list[dict[str, Any]] = []
    candidate_breakdown: list[dict[str, Any]] = []
    pair_intersections = prepared.get("pairIntersections", {})

    # Candidate class != target over GT target.
    for candidate_name, geometry in sorted(
        candidate.items(),
        key=lambda item: item[0].casefold(),
    ):
        if (
            candidate_name == target
            or geometry is None
            or geometry.is_empty
        ):
            continue

        pair_key = (candidate_name, target)
        if pair_key in pair_intersections:
            mismatch = pair_intersections[pair_key]
            _eval_visual_perf_inc("pairIntersectionCacheHits")
        else:
            mismatch = _eval_visual_binary(
                geometry,
                reference_target,
                "intersection",
            )
            _eval_visual_perf_inc("pairIntersectionCacheMisses")

        mismatch = _eval_visual_binary(
            mismatch,
            candidate_target,
            "difference",
        )

        if mismatch.is_empty:
            continue

        area = _eval_v4_area(mismatch)
        pair_index = len(mismatch_layers)

        mismatch_layers.append(
            {
                "pairIndex": pair_index,
                "direction": "reference-target",
                "candidateClass": candidate_name,
                "referenceClass": target,
                "areaPx2": area,
                "percentOfTarget": _eval_v4_percent(
                    area,
                    reference_denominator,
                ),
                "geometry": _eval_visual_geometry_payload(mismatch),
            }
        )

        reference_breakdown.append(
            {
                "className": candidate_name,
                "pairIndex": pair_index,
                "areaPx2": area,
                "percentOfTarget": _eval_v4_percent(
                    area,
                    reference_denominator,
                ),
            }
        )

    # Candidate target over GT class != target.
    for reference_name, geometry in sorted(
        reference.items(),
        key=lambda item: item[0].casefold(),
    ):
        if (
            reference_name == target
            or geometry is None
            or geometry.is_empty
        ):
            continue

        pair_key = (target, reference_name)
        if pair_key in pair_intersections:
            mismatch = pair_intersections[pair_key]
            _eval_visual_perf_inc("pairIntersectionCacheHits")
        else:
            mismatch = _eval_visual_binary(
                candidate_target,
                geometry,
                "intersection",
            )
            _eval_visual_perf_inc("pairIntersectionCacheMisses")

        mismatch = _eval_visual_binary(
            mismatch,
            reference_target,
            "difference",
        )

        if mismatch.is_empty:
            continue

        area = _eval_v4_area(mismatch)
        pair_index = len(mismatch_layers)

        mismatch_layers.append(
            {
                "pairIndex": pair_index,
                "direction": "candidate-target",
                "candidateClass": target,
                "referenceClass": reference_name,
                "areaPx2": area,
                "percentOfTarget": _eval_v4_percent(
                    area,
                    candidate_denominator,
                ),
                "geometry": _eval_visual_geometry_payload(mismatch),
            }
        )

        candidate_breakdown.append(
            {
                "className": reference_name,
                "pairIndex": pair_index,
                "areaPx2": area,
                "percentOfTarget": _eval_v4_percent(
                    area,
                    candidate_denominator,
                ),
            }
        )

    reference_breakdown.sort(
        key=lambda item: float(item["areaPx2"]),
        reverse=True,
    )
    candidate_breakdown.sort(
        key=lambda item: float(item["areaPx2"]),
        reverse=True,
    )

    result["reviewSchemaVersion"] = 4
    result["evaluationRegion"] = evaluation_region

    result["perspectives"] = {
        "referenceTarget": {
            "label": "Ground Truth target",
            "targetClass": target,
            "denominatorAreaPx2": reference_denominator,
            "correctAreaPx2": agreement_area,
            "wrongClassAreaPx2": reference_wrong_area,
            "unmatchedAreaPx2": reference_missed_area,
            "correctPercent": _eval_v4_percent(
                agreement_area,
                reference_denominator,
            ),
            "wrongClassPercent": _eval_v4_percent(
                reference_wrong_area,
                reference_denominator,
            ),
            "unmatchedPercent": _eval_v4_percent(
                reference_missed_area,
                reference_denominator,
            ),
            "unmatchedLabel": "Missed",
            "mismatchClasses": reference_breakdown,
        },
        "candidateTarget": {
            "label": "Candidate target",
            "targetClass": target,
            "denominatorAreaPx2": candidate_denominator,
            "correctAreaPx2": agreement_area,
            "wrongClassAreaPx2": candidate_wrong_area,
            "unmatchedAreaPx2": candidate_unmatched_area,
            "correctPercent": _eval_v4_percent(
                agreement_area,
                candidate_denominator,
            ),
            "wrongClassPercent": _eval_v4_percent(
                candidate_wrong_area,
                candidate_denominator,
            ),
            "unmatchedPercent": _eval_v4_percent(
                candidate_unmatched_area,
                candidate_denominator,
            ),
            "unmatchedLabel": "No GT match",
            "mismatchClasses": candidate_breakdown,
        },
    }

    result["mismatchLayers"] = mismatch_layers

    for region in result.get("regions", []):
        candidate_class = str(region.get("candidateClass") or "")
        reference_class = str(region.get("referenceClass") or "")
        area = float(region.get("areaPx2") or 0.0)

        if reference_class == target and candidate_class != target:
            denominator = reference_denominator
            perspective = "referenceTarget"
        elif candidate_class == target and reference_class != target:
            denominator = candidate_denominator
            perspective = "candidateTarget"
        elif region.get("kind") == "reference_only":
            denominator = reference_denominator
            perspective = "referenceTarget"
        else:
            denominator = candidate_denominator
            perspective = "candidateTarget"

        region["percentOfTarget"] = _eval_v4_percent(
            area,
            denominator,
        )
        region["targetPerspective"] = perspective

    return result


def _eval_visual_normalize_review_scale(
    value: Any,
) -> float:
    try:
        scale = float(
            value
        )
    except (
        TypeError,
        ValueError,
    ):
        return 0.0625

    for allowed in (
        1.0,
        0.5,
        0.25,
        0.125,
        0.0625,
    ):
        if abs(
            scale - allowed
        ) < 1e-9:
            return allowed

    return 0.0625


def _eval_visual_scaled_collection(
    payload: dict[str, Any],
    scale_factor: float,
    *,
    profile_label: str = "review",
) -> dict[str, Any]:
    pipeline_started = time.perf_counter()
    copy_started = time.perf_counter()
    output = copy.deepcopy(
        payload
    )
    _eval_visual_perf_add_ms(f"{profile_label}CopyMs", copy_started)

    if scale_factor == 1.0:
        return output

    features = output.get(
        "features",
        [],
    )

    if not isinstance(
        features,
        list,
    ):
        return output

    perf = _EVAL_VISUAL_PERF.get()
    if perf is not None:
        perf[f"{profile_label}InputFeatures"] = len(features)
        vertex_started = time.perf_counter()
        perf[f"{profile_label}InputVertices"] = sum(
            _eval_visual_geometry_vertex_count(feature.get("geometry"))
            for feature in features
            if isinstance(feature, dict)
        )
        _eval_visual_perf_add_ms("profilingVertexCountMs", vertex_started)

        if scale_factor == 1.0:
            perf[f"{profile_label}ReviewVertices"] = perf[f"{profile_label}InputVertices"]
            perf[f"{profile_label}ScalePipelineMs"] = round(
                (time.perf_counter() - pipeline_started) * 1000.0,
                3,
            )

    if scale_factor == 1.0:
        return output

    # 0.75 review px == 12 level-0 px at the default 1/16 scale.
    simplify_tolerance = 0.75

    for feature in features:
        if not isinstance(
            feature,
            dict,
        ):
            continue

        geometry_payload = feature.get(
            "geometry"
        )

        if not isinstance(
            geometry_payload,
            dict,
        ):
            continue

        parse_started = time.perf_counter()
        try:
            geometry = shape(
                geometry_payload
            )
        except Exception:
            _eval_visual_perf_add_ms(f"{profile_label}ScaleParseMs", parse_started)
            _eval_visual_perf_inc(f"{profile_label}ScaleParseErrors")
            continue
        _eval_visual_perf_add_ms(f"{profile_label}ScaleParseMs", parse_started)

        if geometry.is_empty:
            continue

        if not geometry.is_valid:
            valid_started = time.perf_counter()
            try:
                geometry = make_valid(
                    geometry
                )
            except Exception:
                _eval_visual_perf_add_ms(f"{profile_label}ScaleMakeValidMs", valid_started)
                _eval_visual_perf_inc(f"{profile_label}ScaleMakeValidErrors")
                continue
            _eval_visual_perf_add_ms(f"{profile_label}ScaleMakeValidMs", valid_started)
            _eval_visual_perf_inc(f"{profile_label}ScaleMakeValidCalls")

        geometry = (
            _polygonal_only(
                geometry
            )
            or GeometryCollection()
        )

        if geometry.is_empty:
            continue

        scale_started = time.perf_counter()
        scaled = affinity.scale(
            geometry,
            xfact=scale_factor,
            yfact=scale_factor,
            origin=(
                0.0,
                0.0,
            ),
        )
        _eval_visual_perf_add_ms(f"{profile_label}AffinityScaleMs", scale_started)

        if not scaled.is_empty:
            simplify_started = time.perf_counter()
            try:
                simplified = scaled.simplify(
                    simplify_tolerance,
                    preserve_topology=True,
                )
            except Exception:
                simplified = scaled
            _eval_visual_perf_add_ms(f"{profile_label}SimplifyMs", simplify_started)
            _eval_visual_perf_inc(f"{profile_label}SimplifyCalls")

            if (
                simplified is not None
                and not simplified.is_empty
            ):
                scaled = simplified

        scaled = (
            _polygonal_only(
                scaled
            )
            or GeometryCollection()
        )

        if scaled.is_empty:
            continue

        geometry_out = getattr(
            scaled,
            "__geo_interface__",
            None,
        )

        if isinstance(
            geometry_out,
            dict,
        ):
            feature["geometry"] = geometry_out

    if perf is not None:
        vertex_started = time.perf_counter()
        perf[f"{profile_label}ReviewVertices"] = sum(
            _eval_visual_geometry_vertex_count(feature.get("geometry"))
            for feature in features
            if isinstance(feature, dict)
        )
        _eval_visual_perf_add_ms("profilingVertexCountMs", vertex_started)
        perf[f"{profile_label}ScalePipelineMs"] = round(
            (time.perf_counter() - pipeline_started) * 1000.0,
            3,
        )

    return output


def _eval_visual_restore_geometry_payload(
    payload: dict[str, Any],
    inverse_scale: float,
) -> dict[str, Any]:
    try:
        geometry = shape(
            payload
        )
    except Exception:
        return payload

    restored = affinity.scale(
        geometry,
        xfact=inverse_scale,
        yfact=inverse_scale,
        origin=(
            0.0,
            0.0,
        ),
    )

    output = getattr(
        restored,
        "__geo_interface__",
        None,
    )

    return (
        output
        if isinstance(
            output,
            dict,
        )
        else payload
    )


def _eval_visual_restore_result_level0(
    value: Any,
    review_scale: float,
) -> Any:
    if review_scale == 1.0:
        return value

    inverse = (
        1.0
        / review_scale
    )

    if isinstance(
        value,
        dict,
    ):
        geometry_type = str(
            value.get(
                "type"
            )
            or ""
        )

        if geometry_type in {
            "Polygon",
            "MultiPolygon",
            "GeometryCollection",
        }:
            return _eval_visual_restore_geometry_payload(
                value,
                inverse,
            )

        output: dict[str, Any] = {}

        for child_key, child_value in value.items():
            if (
                child_key == "bbox"
                and isinstance(
                    child_value,
                    list,
                )
                and len(
                    child_value
                ) >= 4
            ):
                output[
                    child_key
                ] = [
                    float(item)
                    * inverse
                    for item
                    in child_value
                ]

            elif (
                str(
                    child_key
                )
                .casefold()
                .endswith(
                    "areapx2"
                )
                and isinstance(
                    child_value,
                    (
                        int,
                        float,
                    ),
                )
            ):
                output[
                    child_key
                ] = (
                    float(
                        child_value
                    )
                    * inverse
                    * inverse
                )

            else:
                output[
                    child_key
                ] = _eval_visual_restore_result_level0(
                    child_value,
                    review_scale,
                )

        return output

    if isinstance(
        value,
        list,
    ):
        return [
            _eval_visual_restore_result_level0(
                item,
                review_scale,
            )
            for item in value
        ]

    return value


def visual_evaluation_feature_collections_scaled(
    candidate_payload: dict[str, Any],
    reference_payload: dict[str, Any],
    *,
    target_class: str,
    candidate_mapping: Any = None,
    reference_mapping: Any = None,
    image_width: float | None = None,
    image_height: float | None = None,
    max_regions: int = 500,
    review_scale: Any = None,
    profile_performance: bool = False,
) -> dict[str, Any]:
    scale = _eval_visual_normalize_review_scale(
        review_scale
    )

    perf: dict[str, Any] | None = {} if profile_performance else None
    perf_token = _EVAL_VISUAL_PERF.set(perf) if perf is not None else None
    total_started = time.perf_counter()

    try:
        candidate_review = _eval_visual_scaled_collection(
            candidate_payload,
            scale,
            profile_label="candidate",
        )

        reference_review = _eval_visual_scaled_collection(
            reference_payload,
            scale,
            profile_label="reference",
        )

        review_width = (
            float(
                image_width
            )
            * scale
            if image_width is not None
            else None
        )

        review_height = (
            float(
                image_height
            )
            * scale
            if image_height is not None
            else None
        )

        v4_started = time.perf_counter()
        result = visual_evaluation_feature_collections_v4(
            candidate_review,
            reference_review,
            target_class=target_class,
            candidate_mapping=candidate_mapping,
            reference_mapping=reference_mapping,
            image_width=review_width,
            image_height=review_height,
            max_regions=max_regions,
        )

        _eval_visual_perf_add_ms("visualV4Ms", v4_started)

        restore_started = time.perf_counter()
        result = _eval_visual_restore_result_level0(
            result,
            scale,
        )
        _eval_visual_perf_add_ms("restoreLevel0Ms", restore_started)

        result["reviewScale"] = scale
        result["metricsResolution"] = "level-0"
        result["reviewResolution"] = (
            "full"
            if scale == 1.0
            else (
                "half"
                if scale == 0.5
                else (
                    "quarter"
                    if scale == 0.25
                    else (
                        "eighth"
                        if scale == 0.125
                        else "sixteenth"
                    )
                )
            )
        )
        result["reviewApproximation"] = (
            "visual-only-scaled-simplified"
            if scale != 1.0
            else "full-resolution"
        )

        if perf is not None:
            vertex_started = time.perf_counter()
            perf["responseGeometryVertices"] = _eval_visual_response_vertex_count(result)
            _eval_visual_perf_add_ms("profilingVertexCountMs", vertex_started)
            perf["reviewScale"] = scale
            perf["targetClass"] = str(target_class or "")
            perf["outputLayers"] = len(result.get("layers") or [])
            perf["outputRegions"] = len(result.get("regions") or [])
            perf["regionCount"] = int(result.get("regionCount") or 0)
            perf["mismatchLayers"] = len(result.get("mismatchLayers") or [])
            perf["visualComputeTotalMs"] = round(
                (time.perf_counter() - total_started) * 1000.0,
                3,
            )
            result["performanceProfile"] = perf

        return result
    finally:
        if perf_token is not None:
            _EVAL_VISUAL_PERF.reset(perf_token)


def _eval_visual_direct_json_response(
    result: dict[str, Any],
) -> Response:
    """Return Visual Review JSON without FastAPI recursive response encoding.

    This transport optimization is intentionally limited to /evaluation-visual.
    Scientific /evaluate keeps its existing response path and level-0 metrics.
    """
    body = json.dumps(
        result,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")

    return Response(
        content=body,
        media_type="application/json",
    )


@router.post("/api/annotations/{image_id}/evaluation-visual")
def visual_evaluation_annotation_files(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> Response:
    profile_performance = bool(payload.get("profilePerformance"))
    endpoint_started = time.perf_counter()

    dimensions_started = time.perf_counter()
    relative, width, height = _image_dimensions(image_id)
    dimensions_ms = (time.perf_counter() - dimensions_started) * 1000.0

    candidate_file = normalize_annotation_file(
        str(payload.get("candidateFile") or "Default")
    )

    reference_file = normalize_annotation_file(
        str(payload.get("referenceFile") or "Default")
    )

    target_class = str(
        payload.get("targetClass") or ""
    ).strip()

    if not target_class:
        raise HTTPException(
            status_code=400,
            detail="targetClass is required",
        )

    candidate_read_started = time.perf_counter()
    candidate_collection = read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        candidate_file,
        error_prefix="Could not read candidate annotation file",
    )
    candidate_read_ms = (time.perf_counter() - candidate_read_started) * 1000.0

    reference_read_started = time.perf_counter()
    reference_collection = read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        reference_file,
        error_prefix="Could not read reference annotation file",
    )
    reference_read_ms = (time.perf_counter() - reference_read_started) * 1000.0

    candidate_mapping = payload.get("candidateMapping")
    reference_mapping = payload.get("referenceMapping")

    try:
        result = visual_evaluation_feature_collections_scaled(
            candidate_collection,
            reference_collection,
            target_class=target_class,
            candidate_mapping=candidate_mapping,
            reference_mapping=reference_mapping,
            image_width=width,
            image_height=height,
            max_regions=int(payload.get("maxRegions") or 500),
            review_scale=payload.get("reviewScale"),
            profile_performance=profile_performance,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    mapping_snapshot = {
        "candidateMapping": (
            candidate_mapping
            if isinstance(candidate_mapping, dict)
            else {}
        ),
        "referenceMapping": (
            reference_mapping
            if isinstance(reference_mapping, dict)
            else {}
        ),
    }

    metadata_started = time.perf_counter()
    result.update(
        {
            "imageId": image_id,
            "imageRelativePath": relative,
            "imageWidth": width,
            "imageHeight": height,
            "candidateFile": candidate_file,
            "referenceFile": reference_file,
            "candidateDocumentChecksum": _canonical_json_sha256(candidate_collection),
            "referenceDocumentChecksum": _canonical_json_sha256(reference_collection),
            "candidateMetadata": read_annotation_metadata(
                ANNOTATION_ROOT,
                relative,
                candidate_file,
            ),
            "referenceMetadata": read_annotation_metadata(
                ANNOTATION_ROOT,
                relative,
                reference_file,
            ),
            "mapping": mapping_snapshot,
            "mappingChecksum": _canonical_json_sha256(
                mapping_snapshot
            ),
        }
    )

    if profile_performance:
        perf = result.get("performanceProfile")
        if not isinstance(perf, dict):
            perf = {}
            result["performanceProfile"] = perf

        perf["imageDimensionsMs"] = round(dimensions_ms, 3)
        perf["candidateReadMs"] = round(candidate_read_ms, 3)
        perf["referenceReadMs"] = round(reference_read_ms, 3)
        perf["metadataChecksumMs"] = round(
            (time.perf_counter() - metadata_started) * 1000.0,
            3,
        )
        perf["responseFastPath"] = True

        serialize_started = time.perf_counter()
        encoded = json.dumps(
            result,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        perf["responseSerializeEstimateMs"] = round(
            (time.perf_counter() - serialize_started) * 1000.0,
            3,
        )
        perf["responseBytesEstimate"] = len(encoded)
        perf["endpointTotalMs"] = round(
            (time.perf_counter() - endpoint_started) * 1000.0,
            3,
        )

        print(
            "[VisualReview PERF] "
            + json.dumps(perf, sort_keys=True, ensure_ascii=False),
            flush=True,
        )

    response_encode_started = time.perf_counter()
    response = _eval_visual_direct_json_response(result)
    response_encode_ms = (time.perf_counter() - response_encode_started) * 1000.0
    response_bytes = len(response.body)

    response.headers["X-Histo-Visual-Fast-Path"] = "1"
    response.headers["X-Histo-Visual-Response-Bytes"] = str(response_bytes)
    response.headers["X-Histo-Visual-Response-Encode-Ms"] = f"{response_encode_ms:.3f}"
    response.headers["Server-Timing"] = (
        f"histo_visual_response_encode;dur={response_encode_ms:.3f}"
    )

    if profile_performance:
        print(
            "[VisualReview RESPONSE PERF] "
            + json.dumps(
                {
                    "fastPath": True,
                    "responseEncodeMs": round(response_encode_ms, 3),
                    "responseBytes": response_bytes,
                    "endpointThroughEncodeMs": round(
                        (time.perf_counter() - endpoint_started) * 1000.0,
                        3,
                    ),
                },
                sort_keys=True,
            ),
            flush=True,
        )

    return response



@router.post("/api/annotations/{image_id}/evaluate")
def evaluate_annotation_files(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    relative, width, height = _image_dimensions(image_id)

    candidate_file = normalize_annotation_file(
        str(payload.get("candidateFile") or "Default")
    )
    reference_file = normalize_annotation_file(
        str(payload.get("referenceFile") or "Default")
    )

    candidate_collection = read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        candidate_file,
        error_prefix="Could not read candidate annotation file",
    )
    reference_collection = read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        reference_file,
        error_prefix="Could not read reference annotation file",
    )

    candidate_mapping = payload.get("candidateMapping")
    reference_mapping = payload.get("referenceMapping")

    result = evaluate_feature_collections(
        candidate_collection,
        reference_collection,
        candidate_mapping=candidate_mapping,
        reference_mapping=reference_mapping,
        image_width=width,
        image_height=height,
    )

    mapping_snapshot = {
        "candidateMapping": (
            candidate_mapping
            if isinstance(candidate_mapping, dict)
            else {}
        ),
        "referenceMapping": (
            reference_mapping
            if isinstance(reference_mapping, dict)
            else {}
        ),
    }

    result.update(
        {
            "imageId": image_id,
            "imageRelativePath": relative,
            "imageWidth": width,
            "imageHeight": height,
            "candidateFile": candidate_file,
            "referenceFile": reference_file,
            "candidateDocumentChecksum": _canonical_json_sha256(candidate_collection),
            "referenceDocumentChecksum": _canonical_json_sha256(reference_collection),
            "candidateMetadata": read_annotation_metadata(
                ANNOTATION_ROOT,
                relative,
                candidate_file,
            ),
            "referenceMetadata": read_annotation_metadata(
                ANNOTATION_ROOT,
                relative,
                reference_file,
            ),
            "mapping": mapping_snapshot,
            "mappingChecksum": _canonical_json_sha256(mapping_snapshot),
        }
    )

    return result


__all__ = [
    "EVALUATION_SCHEMA_VERSION",
    "EVALUATION_METHOD",
    "_mapping_lookup",
    "_mapped_geometries",
    "evaluate_feature_collections",
    "get_annotation_file_metadata",
    "put_annotation_file_metadata",
    "get_evaluation_info",
    "evaluate_annotation_files",
]
