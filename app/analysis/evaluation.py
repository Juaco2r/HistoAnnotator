from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
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

    try:
        geometry = shape(geometry_payload)
    except Exception:
        return None

    if geometry.is_empty:
        return None

    if not geometry.is_valid:
        try:
            geometry = make_valid(geometry)
        except Exception:
            return None

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

    geometry = unary_union(items) if len(items) > 1 else items[0]
    if not geometry.is_valid:
        geometry = make_valid(geometry)

    return _polygonal_only(geometry) or GeometryCollection()


def _mapped_geometries(
    collection_payload: dict[str, Any],
    mapping_payload: Any,
    *,
    bounds: Any | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    collection, sanitize_report = sanitize_qupath_feature_collection(
        collection_payload
    )

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
            geometry = geometry.intersection(bounds)
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
        try:
            result = left.intersection(right)
        except Exception:
            result = make_valid(left).intersection(make_valid(right))

    elif operation == "difference":
        if right is None or getattr(right, "is_empty", True):
            result = left
        else:
            try:
                result = left.difference(right)
            except Exception:
                result = make_valid(left).difference(make_valid(right))

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
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for component in _eval_visual_components(geometry):
        min_x, min_y, max_x, max_y = component.bounds
        rows.append(
            {
                "kind": kind,
                "candidateClass": candidate_class,
                "referenceClass": reference_class,
                "areaPx2": float(component.area),
                "bbox": [
                    float(min_x),
                    float(min_y),
                    float(max_x),
                    float(max_y),
                ],
                "geometry": _eval_visual_geometry_payload(component),
            }
        )

    return rows


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

    candidate_all = _union_geometries(
        [
            geometry
            for geometry in candidate.values()
            if geometry is not None
            and not geometry.is_empty
        ]
    )

    reference_all = _union_geometries(
        [
            geometry
            for geometry in reference.values()
            if geometry is not None
            and not geometry.is_empty
        ]
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

            # Only return wrong-class pairs relevant to the selected class.
            if (
                candidate_name != target
                and reference_name != target
            ):
                continue

            mismatch = _eval_visual_binary(
                candidate_geometry,
                reference_geometry,
                "intersection",
            )

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
                )
            )

    wrong_class = _union_geometries(
        mismatch_geometries
    )

    region_rows.extend(
        _eval_visual_region_rows(
            unmatched_candidate,
            kind="candidate_only",
            candidate_class=target,
            reference_class=None,
        )
    )

    region_rows.extend(
        _eval_visual_region_rows(
            missed_reference,
            kind="reference_only",
            candidate_class=None,
            reference_class=target,
        )
    )

    region_rows.sort(
        key=lambda row: float(row.get("areaPx2") or 0.0),
        reverse=True,
    )

    total_region_count = len(region_rows)
    safe_max_regions = max(
        1,
        min(
            5000,
            int(max_regions or 500),
        ),
    )

    visible_regions = region_rows[:safe_max_regions]

    for index, row in enumerate(visible_regions, start=1):
        row["id"] = f"error-{index}"

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
                    if geometry is not None
                    and not geometry.is_empty
                    else 0.0
                ),
                "geometry": _eval_visual_geometry_payload(
                    geometry
                ),
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
    """
    Enrich Visual Review with target-oriented composition and exact
    class-pair mismatch geometries.

    The underlying scientific overlay still comes from
    visual_evaluation_feature_collections(), so Dice/IoU and review share
    the same mapping and Ground Truth valid-region rules.
    """
    result = visual_evaluation_feature_collections(
        candidate_payload,
        reference_payload,
        target_class=target_class,
        candidate_mapping=candidate_mapping,
        reference_mapping=reference_mapping,
        image_width=image_width,
        image_height=image_height,
        max_regions=max_regions,
    )

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
                (
                    float(image_width),
                    float(image_height),
                ),
                (0.0, float(image_height)),
            ]
        )

    candidate, _, _ = _mapped_geometries(
        candidate_payload,
        candidate_mapping,
        bounds=bounds,
    )

    reference, _, _ = _mapped_geometries(
        reference_payload,
        reference_mapping,
        bounds=bounds,
    )

    (
        candidate,
        reference,
        _valid_region,
        evaluation_region,
    ) = _evaluation_valid_scope_from_reference_v3(
        candidate,
        reference,
        reference_payload,
        bounds=bounds,
    )

    target = str(
        target_class
        or ""
    ).strip()

    empty = GeometryCollection()

    candidate_target = candidate.get(
        target,
        empty,
    )

    reference_target = reference.get(
        target,
        empty,
    )

    candidate_all = _union_geometries(
        [
            geometry
            for geometry in candidate.values()
            if geometry is not None
            and not geometry.is_empty
        ]
    )

    reference_all = _union_geometries(
        [
            geometry
            for geometry in reference.values()
            if geometry is not None
            and not geometry.is_empty
        ]
    )

    candidate_other = _union_geometries(
        [
            geometry
            for class_name, geometry
            in candidate.items()
            if class_name != target
            and geometry is not None
            and not geometry.is_empty
        ]
    )

    reference_other = _union_geometries(
        [
            geometry
            for class_name, geometry
            in reference.items()
            if class_name != target
            and geometry is not None
            and not geometry.is_empty
        ]
    )

    agreement = _eval_visual_binary(
        candidate_target,
        reference_target,
        "intersection",
    )

    # Ground Truth perspective:
    # "Of the GT target, what did Candidate call it?"
    reference_wrong = _eval_visual_binary(
        reference_target,
        candidate_other,
        "intersection",
    )

    # If Candidate also marks the target here, count the area as correct.
    reference_wrong = _eval_visual_binary(
        reference_wrong,
        candidate_target,
        "difference",
    )

    reference_missed = _eval_visual_binary(
        reference_target,
        candidate_all,
        "difference",
    )

    # Candidate perspective:
    # "Of Candidate target, what does the GT call it?"
    candidate_wrong = _eval_visual_binary(
        candidate_target,
        reference_other,
        "intersection",
    )

    # If GT also marks the target here, count the area as correct.
    candidate_wrong = _eval_visual_binary(
        candidate_wrong,
        reference_target,
        "difference",
    )

    candidate_unmatched = _eval_visual_binary(
        candidate_target,
        reference_all,
        "difference",
    )

    reference_denominator = _eval_v4_area(
        reference_target
    )

    candidate_denominator = _eval_v4_area(
        candidate_target
    )

    agreement_area = _eval_v4_area(
        agreement
    )

    reference_wrong_area = _eval_v4_area(
        reference_wrong
    )

    reference_missed_area = _eval_v4_area(
        reference_missed
    )

    candidate_wrong_area = _eval_v4_area(
        candidate_wrong
    )

    candidate_unmatched_area = _eval_v4_area(
        candidate_unmatched
    )

    mismatch_layers: list[dict[str, Any]] = []
    reference_breakdown: list[dict[str, Any]] = []
    candidate_breakdown: list[dict[str, Any]] = []

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

        mismatch = _eval_visual_binary(
            geometry,
            reference_target,
            "intersection",
        )

        mismatch = _eval_visual_binary(
            mismatch,
            candidate_target,
            "difference",
        )

        if mismatch.is_empty:
            continue

        area = _eval_v4_area(
            mismatch
        )

        pair_index = len(
            mismatch_layers
        )

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
                "geometry": _eval_visual_geometry_payload(
                    mismatch
                ),
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

        mismatch = _eval_visual_binary(
            candidate_target,
            geometry,
            "intersection",
        )

        mismatch = _eval_visual_binary(
            mismatch,
            reference_target,
            "difference",
        )

        if mismatch.is_empty:
            continue

        area = _eval_v4_area(
            mismatch
        )

        pair_index = len(
            mismatch_layers
        )

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
                "geometry": _eval_visual_geometry_payload(
                    mismatch
                ),
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
        key=lambda item: float(
            item["areaPx2"]
        ),
        reverse=True,
    )

    candidate_breakdown.sort(
        key=lambda item: float(
            item["areaPx2"]
        ),
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

    # Make every individual review item explain its importance as a
    # percentage of the relevant selected-class target, rather than pixels.
    for region in result.get(
        "regions",
        [],
    ):
        candidate_class = str(
            region.get(
                "candidateClass"
            )
            or ""
        )

        reference_class = str(
            region.get(
                "referenceClass"
            )
            or ""
        )

        area = float(
            region.get(
                "areaPx2"
            )
            or 0.0
        )

        if (
            reference_class == target
            and candidate_class != target
        ):
            denominator = reference_denominator
            perspective = "referenceTarget"

        elif (
            candidate_class == target
            and reference_class != target
        ):
            denominator = candidate_denominator
            perspective = "candidateTarget"

        elif (
            region.get("kind")
            == "reference_only"
        ):
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




@router.post("/api/annotations/{image_id}/evaluation-visual")
def visual_evaluation_annotation_files(
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

    target_class = str(
        payload.get("targetClass") or ""
    ).strip()

    if not target_class:
        raise HTTPException(
            status_code=400,
            detail="targetClass is required",
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

    try:
        result = visual_evaluation_feature_collections_v4(
            candidate_collection,
            reference_collection,
            target_class=target_class,
            candidate_mapping=candidate_mapping,
            reference_mapping=reference_mapping,
            image_width=width,
            image_height=height,
            max_regions=int(payload.get("maxRegions") or 500),
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

    return result



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
