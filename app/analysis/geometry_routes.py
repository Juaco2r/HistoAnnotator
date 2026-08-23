from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException
from shapely.geometry import LineString, shape
from shapely.ops import unary_union

from .common import _geometry_json, _polygonal_geometry

router = APIRouter()

@router.post("/api/geometry/brush")
def create_brush_geometry(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    points = payload.get("points")
    radius = float(payload.get("radius", 0))
    simplify_tolerance = max(0.0, float(payload.get("simplifyTolerance", 0)))
    if not isinstance(points, list) or not points:
        raise HTTPException(status_code=422, detail="Brush points are required")
    if len(points) > 20000:
        raise HTTPException(status_code=422, detail="Brush stroke has too many points")
    clean: list[tuple[float, float]] = []
    for index, point in enumerate(points):
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise HTTPException(status_code=422, detail=f"Invalid brush point at index {index}")
        try:
            clean.append((float(point[0]), float(point[1])))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"Invalid brush point at index {index}") from exc
    if radius <= 0 or radius > 1_000_000:
        raise HTTPException(status_code=422, detail="Invalid brush radius")
    if len(clean) == 1:
        geometry = shape({"type": "Point", "coordinates": clean[0]}).buffer(radius, quad_segs=10)
    else:
        # Round cap/join produce a true painted area rather than preserving the
        # stylus path as an annotation-specific representation.
        geometry = LineString(clean).buffer(radius, quad_segs=10, cap_style="round", join_style="round")
    result = _geometry_json(geometry, simplify_tolerance)
    if result is None:
        raise HTTPException(status_code=422, detail="The brush stroke produced no area")
    return {"geometry": result}


@router.post("/api/geometry/boolean")
def boolean_geometry(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    operation = str(payload.get("operation", "")).strip().lower()
    if operation not in {"union", "difference", "intersection"}:
        raise HTTPException(status_code=422, detail="operation must be union, difference, or intersection")
    subject = _polygonal_geometry(payload.get("subject"))
    operand = _polygonal_geometry(payload.get("operand"))
    simplify_tolerance = max(0.0, float(payload.get("simplifyTolerance", 0)))
    if subject.is_empty:
        raise HTTPException(status_code=422, detail="The selected annotation has no polygonal area")
    if operand.is_empty:
        raise HTTPException(status_code=422, detail="The drawn area has no polygonal area")
    try:
        if operation == "union":
            result = subject.union(operand)
        elif operation == "intersection":
            result = subject.intersection(operand)
        else:
            result = subject.difference(operand)
    except Exception as exc:  # noqa: BLE001
        # A zero-width cleanup fixes many self-intersection edge cases while
        # preserving the general area the user drew.
        try:
            clean_subject = subject.buffer(0)
            clean_operand = operand.buffer(0)
            if operation == "union":
                result = clean_subject.union(clean_operand)
            elif operation == "intersection":
                result = clean_subject.intersection(clean_operand)
            else:
                result = clean_subject.difference(clean_operand)
        except Exception as retry_exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Could not edit annotation geometry: {retry_exc}") from exc
    return {"geometry": _geometry_json(result, simplify_tolerance)}


@router.post("/api/geometry/select")
def select_geometries(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    region = _polygonal_geometry(payload.get("region"))
    if region.is_empty:
        raise HTTPException(status_code=422, detail="Selection region has no area")
    items = payload.get("features")
    if not isinstance(items, list):
        raise HTTPException(status_code=422, detail="features must be a list")
    ids: list[str] = []
    for item in items[:20000]:
        if not isinstance(item, dict) or "geometry" not in item:
            continue
        try:
            geometry = _polygonal_geometry(item.get("geometry"))
        except HTTPException:
            continue
        if geometry.is_empty:
            continue
        # Select annotations with any geometric intersection, including
        # partial overlap and boundary contact.
        if region.intersects(geometry):
            ids.append(str(item.get("id", "")))
    return {"ids": ids}


__all__ = ['create_brush_geometry', 'boolean_geometry', 'select_geometries']
