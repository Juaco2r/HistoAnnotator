from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
from shapely.geometry import GeometryCollection, Polygon, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

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
        "evaluationRegion": "full-image-bounds",
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

    bounds = Polygon(
        [
            (0.0, 0.0),
            (float(width), 0.0),
            (float(width), float(height)),
            (0.0, float(height)),
        ]
    )

    _, source_classes, report = _mapped_geometries(
        collection,
        {},
        bounds=bounds,
    )

    return {
        "annotationFile": name,
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
