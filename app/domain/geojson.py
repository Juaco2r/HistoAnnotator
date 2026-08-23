from __future__ import annotations

import re
import uuid
from typing import Any

import numpy as np
from fastapi import HTTPException
from shapely.geometry import (
    GeometryCollection,
    MultiPolygon,
    Polygon,
    mapping,
    shape,
)
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid

# Keep the same validation contract that app/main.py uses for class colors.
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _rgb_from_hex(value: str) -> list[int] | None:
    if not isinstance(value, str) or not COLOR_RE.fullmatch(value):
        return None
    raw = value.lstrip("#")
    return [int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)]


def _rgb_from_color_rgb(value: Any) -> list[int] | None:
    try:
        packed = int(value) & 0xFFFFFF
    except (TypeError, ValueError):
        return None
    return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]


def _normalize_rgb(value: Any) -> list[int] | None:
    if isinstance(value, (list, tuple)) and len(value) >= 3:
        try:
            return [max(0, min(255, int(round(float(channel))))) for channel in value[:3]]
        except (TypeError, ValueError):
            return None
    if isinstance(value, str):
        return _rgb_from_hex(value)
    return None


def _polygonal_only(geom):
    """Return only Polygon/MultiPolygon components from a Shapely geometry."""
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, Polygon):
        return geom
    if isinstance(geom, MultiPolygon):
        return geom
    if isinstance(geom, GeometryCollection):
        parts = []
        for child in geom.geoms:
            polygonal = _polygonal_only(child)
            if isinstance(polygonal, Polygon):
                parts.append(polygonal)
            elif isinstance(polygonal, MultiPolygon):
                parts.extend(list(polygonal.geoms))
        if not parts:
            return None
        merged = unary_union(parts)
        return _polygonal_only(merged)
    return None


def _orient_polygonal(geom):
    if isinstance(geom, Polygon):
        return orient(geom, sign=1.0)
    if isinstance(geom, MultiPolygon):
        return MultiPolygon([orient(part, sign=1.0) for part in geom.geoms if not part.is_empty and part.area > 0])
    return geom


def _coordinates_are_finite(value: Any) -> bool:
    if isinstance(value, (list, tuple)):
        return all(_coordinates_are_finite(item) for item in value)
    if isinstance(value, (int, float)):
        return bool(np.isfinite(value))
    return True


def _sanitize_area_geometry(geometry: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    """Repair area geometry so QuPath/JTS can safely import it.

    HistoAnnotator drawing tools may temporarily create self-intersections,
    duplicate closing segments or tiny line remnants.  QuPath's GeoJSON
    importer converts coordinates into JTS geometries and can fail with a
    generic 'Reduction failed, possible invalid input' error for malformed
    polygons.  This function performs a topology-preserving repair, removes
    non-area fragments, and normalizes ring orientation before export/save.
    """
    if not _coordinates_are_finite(geometry.get("coordinates")):
        return None, True
    try:
        geom = shape(geometry)
    except Exception:
        return None, True
    changed = False
    if geom.is_empty:
        return None, True
    if not geom.is_valid:
        try:
            geom = make_valid(geom)
            changed = True
        except Exception:
            try:
                geom = geom.buffer(0)
                changed = True
            except Exception:
                return None, True
    polygonal = _polygonal_only(geom)
    if polygonal is None or polygonal.is_empty:
        return None, True
    # A second pass catches invalidities introduced by collection reduction.
    if not polygonal.is_valid:
        try:
            polygonal = _polygonal_only(make_valid(polygonal))
            changed = True
        except Exception:
            polygonal = _polygonal_only(polygonal.buffer(0))
            changed = True
    if polygonal is None or polygonal.is_empty:
        return None, True
    if isinstance(polygonal, MultiPolygon):
        parts = [part for part in polygonal.geoms if part.is_valid and part.area > 1e-9]
        if not parts:
            return None, True
        polygonal = parts[0] if len(parts) == 1 else MultiPolygon(parts)
    elif isinstance(polygonal, Polygon) and polygonal.area <= 1e-9:
        return None, True
    polygonal = _orient_polygonal(polygonal)
    cleaned = mapping(polygonal)
    if cleaned != geometry:
        changed = True
    return cleaned, changed


def _qupath_properties(source_properties: dict[str, Any]) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "objectType": str(
            source_properties.get("objectType")
            or source_properties.get("object_type")
            or "annotation"
        ),
        "isLocked": bool(
            source_properties.get("isLocked", False)
        ),
    }

    classification = source_properties.get("classification")
    if (
        isinstance(classification, dict)
        and str(classification.get("name", "")).strip()
    ):
        name = str(classification["name"]).strip()
        color = _normalize_rgb(classification.get("color"))

        if color is None:
            color = _rgb_from_color_rgb(
                classification.get("colorRGB")
            )

        if color is None:
            histo_source = source_properties.get("histoannotator")
            if isinstance(histo_source, dict):
                color = _rgb_from_hex(
                    str(histo_source.get("color", ""))
                )

        normalized_classification: dict[str, Any] = {
            "name": name
        }

        if color is not None:
            normalized_classification["color"] = color

        properties["classification"] = normalized_classification

    histo_source = source_properties.get("histoannotator")
    histo: dict[str, Any] = (
        dict(histo_source)
        if isinstance(histo_source, dict)
        else {}
    )

    histo["schemaVersion"] = 1

    role = str(
        histo.get("role") or "annotation"
    ).strip().lower()

    histo["role"] = (
        role
        if role in {"annotation", "roi", "artifact"}
        else "annotation"
    )

    # Phase D4 Artifact classification-role synchronization
    classification_name = str(
        properties.get("classification", {}).get("name", "")
    ).strip()

    current_role = str(
        histo.get("role") or "annotation"
    ).strip().lower()

    if current_role == "roi":
        histo["role"] = "roi"
    elif classification_name.casefold() == "artifact":
        histo["role"] = "artifact"
    else:
        histo["role"] = "annotation"

    workflow_source = histo.get("workflow")
    workflow_source = (
        dict(workflow_source)
        if isinstance(workflow_source, dict)
        else {}
    )

    decision = str(
        workflow_source.get("reviewDecision") or ""
    ).strip().lower()

    if decision not in {"correct", "maybe", "later"}:
        decision = ""

    legacy_review = source_properties.get("histoannotatorReview")
    if not decision and isinstance(legacy_review, dict):
        legacy_status = str(
            legacy_review.get("status") or ""
        ).strip().lower()

        if legacy_status in {"correct", "maybe", "later"}:
            decision = legacy_status

            legacy_reviewed_at = str(
                legacy_review.get("reviewedAt") or ""
            ).strip()

            if legacy_reviewed_at:
                workflow_source.setdefault(
                    "reviewedAt",
                    legacy_reviewed_at,
                )

    raw_status = str(
        workflow_source.get("status") or ""
    ).strip().lower()

    if raw_status == "approved":
        lifecycle_status = "Approved"
    elif raw_status == "reviewed":
        lifecycle_status = "Reviewed"
    elif raw_status == "draft":
        lifecycle_status = "Draft"
    else:
        lifecycle_status = (
            "Reviewed"
            if decision == "correct"
            else "Draft"
        )

    if decision in {"maybe", "later"}:
        lifecycle_status = "Draft"

    workflow: dict[str, Any] = {
        "status": lifecycle_status,
        "reviewDecision": decision or None,
        "reviewer": (
            str(workflow_source.get("reviewer") or "").strip()
            or None
        ),
        "reviewedAt": (
            str(workflow_source.get("reviewedAt") or "").strip()
            or None
        ),
        "approvedAt": (
            str(workflow_source.get("approvedAt") or "").strip()
            or None
        ),
    }

    histo["workflow"] = workflow

    provenance_source = histo.get("provenance")
    provenance_source = (
        dict(provenance_source)
        if isinstance(provenance_source, dict)
        else {}
    )

    provenance: dict[str, Any] = {}

    for key in (
        "createdAt",
        "modifiedAt",
        "createdWith",
        "modifiedWith",
        "createdDevice",
        "modifiedDevice",
    ):
        value = str(
            provenance_source.get(key) or ""
        ).strip()

        if value:
            provenance[key] = value

    try:
        version = int(
            provenance_source.get("version")
            or 0
        )
    except (TypeError, ValueError):
        version = 0

    if version > 0:
        provenance["version"] = version

    histo["provenance"] = provenance
    properties["histoannotator"] = histo

    for key in (
        "name",
        "description",
        "measurements",
    ):
        if key in source_properties:
            value = source_properties[key]

            if key == "measurements" and isinstance(value, list):
                cleaned_measurements = []

                for item in value:
                    if isinstance(item, dict):
                        cleaned = {}

                        for k, v in item.items():
                            if (
                                isinstance(v, float)
                                and not np.isfinite(v)
                            ):
                                continue
                            cleaned[k] = v

                        cleaned_measurements.append(cleaned)
                    else:
                        cleaned_measurements.append(item)

                value = cleaned_measurements

            properties[key] = value

    return properties


def sanitize_qupath_feature_collection(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise HTTPException(status_code=422, detail="The document must be a GeoJSON FeatureCollection")
    output = []
    repaired = 0
    dropped = 0
    for feature in payload["features"]:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            dropped += 1
            continue
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            dropped += 1
            continue
        geometry_type = geometry.get("type")
        if geometry_type in {"Polygon", "MultiPolygon"}:
            cleaned_geometry, changed = _sanitize_area_geometry(geometry)
            if cleaned_geometry is None:
                dropped += 1
                continue
            if changed:
                repaired += 1
            geometry = cleaned_geometry
        elif geometry_type in {"Point", "MultiPoint", "LineString", "MultiLineString"}:
            if not _coordinates_are_finite(geometry.get("coordinates")):
                dropped += 1
                continue
        else:
            dropped += 1
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        output.append({
            "type": "Feature",
            "id": str(feature.get("id") or uuid.uuid4()),
            "geometry": geometry,
            "properties": _qupath_properties(properties),
        })
    return {"type": "FeatureCollection", "features": output}, {"repaired": repaired, "dropped": dropped, "features": len(output)}


def normalize_geojson(payload: dict[str, Any], relative: str) -> dict[str, Any]:
    # Repair annotations at save time as well as at export time so invalid
    # self-intersections never accumulate in the central annotation store.
    normalized, _report = sanitize_qupath_feature_collection(payload)
    return normalized


