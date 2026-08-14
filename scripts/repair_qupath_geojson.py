#!/usr/bin/env python3
"""Repair a HistoAnnotator/GeoJSON annotation file for QuPath import.

Usage:
  python3 repair_qupath_geojson.py input.geojson output.geojson

Requires Shapely >= 2.0.
"""
from __future__ import annotations
import json
import math
import sys
import uuid
from pathlib import Path

from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid


def polygonal_only(geom):
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    if isinstance(geom, GeometryCollection):
        parts = []
        for child in geom.geoms:
            p = polygonal_only(child)
            if isinstance(p, Polygon):
                parts.append(p)
            elif isinstance(p, MultiPolygon):
                parts.extend(p.geoms)
        return polygonal_only(unary_union(parts)) if parts else None
    return None


def clean_area(geometry):
    geom = shape(geometry)
    changed = False
    if not geom.is_valid:
        geom = make_valid(geom)
        changed = True
    geom = polygonal_only(geom)
    if geom is None or geom.is_empty:
        return None, True
    if not geom.is_valid:
        geom = polygonal_only(make_valid(geom))
        changed = True
    if geom is None or geom.is_empty:
        return None, True
    if isinstance(geom, Polygon):
        if geom.area <= 1e-9:
            return None, True
        geom = orient(geom, sign=1.0)
    else:
        parts = [orient(p, sign=1.0) for p in geom.geoms if p.is_valid and p.area > 1e-9]
        if not parts:
            return None, True
        geom = parts[0] if len(parts) == 1 else MultiPolygon(parts)
    return mapping(geom), changed


def finite_value(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: finite_value(v) for k, v in value.items() if finite_value(v) is not None}
    if isinstance(value, list):
        return [finite_value(v) for v in value if finite_value(v) is not None]
    return value


def main(src: Path, dst: Path):
    payload = json.loads(src.read_text(encoding="utf-8"))
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise SystemExit("Input must be a GeoJSON FeatureCollection")
    output = []
    repaired = dropped = 0
    for feature in payload["features"]:
        if not isinstance(feature, dict) or feature.get("type") != "Feature" or not isinstance(feature.get("geometry"), dict):
            dropped += 1
            continue
        geometry = feature["geometry"]
        if geometry.get("type") in {"Polygon", "MultiPolygon"}:
            geometry, changed = clean_area(geometry)
            if geometry is None:
                dropped += 1
                continue
            repaired += int(changed)
        props = finite_value(feature.get("properties") if isinstance(feature.get("properties"), dict) else {})
        object_type = props.pop("object_type", None)
        props["objectType"] = props.get("objectType") or object_type or "annotation"
        props["isLocked"] = bool(props.get("isLocked", False))
        output.append({
            "type": "Feature",
            "id": str(feature.get("id") or uuid.uuid4()),
            "geometry": geometry,
            "properties": props,
        })
    repaired_payload = {"type": "FeatureCollection", "features": output}
    dst.write_text(json.dumps(repaired_payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(output)} features to {dst}")
    print(f"Repaired: {repaired}; dropped: {dropped}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: repair_qupath_geojson.py input.geojson output.geojson")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
