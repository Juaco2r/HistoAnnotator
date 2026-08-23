from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageDraw
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

if __package__ and __package__.startswith("app."):
    from ..domain.geojson import _polygonal_only
else:
    from domain.geojson import _polygonal_only

def _polygonal_geometry(value: Any):
    """Return a valid Polygon/MultiPolygon or an empty GeometryCollection."""
    try:
        geometry = shape(value) if isinstance(value, dict) else value
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Invalid geometry: {exc}") from exc
    if geometry.is_empty:
        return GeometryCollection()
    if not geometry.is_valid:
        geometry = make_valid(geometry)
    if isinstance(geometry, (Polygon, MultiPolygon)):
        return geometry
    polygons = []
    if isinstance(geometry, GeometryCollection):
        stack = list(geometry.geoms)
        while stack:
            item = stack.pop()
            if isinstance(item, Polygon):
                polygons.append(item)
            elif isinstance(item, MultiPolygon):
                polygons.extend(item.geoms)
            elif isinstance(item, GeometryCollection):
                stack.extend(item.geoms)
    if not polygons:
        return GeometryCollection()
    merged = unary_union(polygons)
    if not merged.is_valid:
        merged = make_valid(merged)
    return merged


def _geometry_json(geometry: Any, simplify_tolerance: float = 0.0) -> dict[str, Any] | None:
    """Return a robust Polygon/MultiPolygon representation.

    Simplification is an optimization only. A valid geometry must never be
    discarded just because simplification collapses a thin or complex region.
    """
    polygonal = _polygonal_geometry(geometry)

    if polygonal.is_empty:
        return None

    original = polygonal

    if simplify_tolerance > 0:
        try:
            simplified = polygonal.simplify(
                float(simplify_tolerance),
                preserve_topology=True,
            )
            simplified = _polygonal_geometry(simplified)

            # Keep the simplified geometry only if it remains usable.
            if not simplified.is_empty:
                polygonal = simplified
            else:
                polygonal = original

        except Exception:
            polygonal = original

    if polygonal.is_empty:
        return None

    if not polygonal.is_valid:
        polygonal = _polygonal_geometry(make_valid(polygonal))

    if polygonal.is_empty:
        return None

    return mapping(polygonal)


def _stats_polygon_parts(geometry: Any) -> list[Polygon]:
    polygonal = _polygonal_geometry(geometry)

    if polygonal.is_empty:
        return []

    if isinstance(polygonal, Polygon):
        return [polygonal]

    if isinstance(polygonal, MultiPolygon):
        return [
            part
            for part in polygonal.geoms
            if not part.is_empty
            and part.area > 0
        ]

    return []


def _stats_exterior_only_erode(
    geometry: Any,
    distance: float,
):
    # Shrink only exterior rings. Internal holes are subtracted again at their
    # original location instead of being expanded by a normal negative buffer.
    polygonal = _polygonal_geometry(geometry)

    if polygonal.is_empty:
        return GeometryCollection()

    if distance <= 0:
        return polygonal

    output_parts: list[Any] = []

    for part in _stats_polygon_parts(
        polygonal
    ):
        try:
            exterior_shell = Polygon(
                part.exterior.coords
            )

            eroded_shell = exterior_shell.buffer(
                -float(distance)
            )

            eroded_shell = _polygonal_only(
                eroded_shell
            )

            if (
                eroded_shell is None
                or eroded_shell.is_empty
            ):
                continue

            hole_polygons = []

            for interior in part.interiors:
                try:
                    hole = Polygon(
                        interior.coords
                    )

                    if (
                        not hole.is_empty
                        and hole.area > 0
                    ):
                        hole_polygons.append(
                            hole
                        )
                except Exception:
                    continue

            if hole_polygons:
                holes = unary_union(
                    hole_polygons
                )

                eroded_shell = (
                    eroded_shell.difference(
                        holes
                    )
                )

            if not eroded_shell.is_valid:
                eroded_shell = make_valid(
                    eroded_shell
                )

            eroded_shell = _polygonal_only(
                eroded_shell
            )

            if (
                eroded_shell is not None
                and not eroded_shell.is_empty
            ):
                output_parts.append(
                    eroded_shell
                )
        except Exception:
            continue

    if not output_parts:
        return GeometryCollection()

    merged = unary_union(
        output_parts
    )

    if not merged.is_valid:
        merged = make_valid(merged)

    polygonal = _polygonal_only(
        merged
    )

    return (
        polygonal
        if polygonal is not None
        else GeometryCollection()
    )


def _stats_exclude_external_border(
    tissue_geometry: Any,
    requested_percent: float,
) -> tuple[Any, float, float]:
    # requested_percent is percentage of Tissue ROI area, not width/height.
    # A binary search finds the inward exterior distance matching that area.
    tissue = _polygonal_geometry(
        tissue_geometry
    )

    if tissue.is_empty:
        return (
            GeometryCollection(),
            0.0,
            0.0,
        )

    original_area = float(
        tissue.area
    )

    if original_area <= 0:
        return (
            GeometryCollection(),
            0.0,
            0.0,
        )

    percent = max(
        0.0,
        min(
            50.0,
            float(requested_percent),
        ),
    )

    if percent <= 0:
        return (
            tissue,
            0.0,
            0.0,
        )

    target_area = (
        original_area
        * (1.0 - percent / 100.0)
    )

    min_x, min_y, max_x, max_y = (
        tissue.bounds
    )

    span = max(
        float(max_x - min_x),
        float(max_y - min_y),
        1.0,
    )

    low = 0.0
    high = span

    best_geometry = tissue
    best_distance = 0.0
    best_error = abs(
        original_area - target_area
    )

    for _ in range(6):
        candidate = (
            _stats_exterior_only_erode(
                tissue,
                high,
            )
        )

        candidate_area = float(
            candidate.area
        ) if not candidate.is_empty else 0.0

        error = abs(
            candidate_area - target_area
        )

        if error < best_error:
            best_geometry = candidate
            best_distance = high
            best_error = error

        if candidate_area <= target_area:
            break

        high *= 2.0

    for _ in range(36):
        middle = (
            low + high
        ) / 2.0

        candidate = (
            _stats_exterior_only_erode(
                tissue,
                middle,
            )
        )

        candidate_area = float(
            candidate.area
        ) if not candidate.is_empty else 0.0

        error = abs(
            candidate_area - target_area
        )

        if error < best_error:
            best_geometry = candidate
            best_distance = middle
            best_error = error

        if candidate_area > target_area:
            low = middle
        else:
            high = middle

    valid_area = float(
        best_geometry.area
    ) if not best_geometry.is_empty else 0.0

    actual_percent = (
        100.0
        * max(
            0.0,
            original_area - valid_area,
        )
        / original_area
    )

    return (
        best_geometry,
        actual_percent,
        best_distance,
    )


def _il1_feature_role(feature: dict[str, Any]) -> str:
    try:
        value = (
            feature.get("properties", {})
            .get("histoannotator", {})
            .get("role", "annotation")
        )
    except AttributeError:
        value = "annotation"
    return str(value or "annotation").strip().lower()


def _il1_feature_class(feature: dict[str, Any]) -> str:
    try:
        value = (
            feature.get("properties", {})
            .get("classification", {})
            .get("name", "")
        )
    except AttributeError:
        value = ""
    return str(value or "").strip()


def _il1_mask_to_geometry(
    mask: np.ndarray,
    scale_x: float,
    scale_y: float,
    *,
    max_contours: int | None = 20_000,
    fragmentation_detail: str | None = None,
) -> Any:
    """
    IL5.1: convert the thumbnail mask directly to vector contours instead
    of rebuilding it from rectangular row-runs.
    """
    binary = (
        np.asarray(mask, dtype=np.uint8) > 0
    ).astype(np.uint8) * 255

    if not np.any(binary):
        return GeometryCollection()

    contours, hierarchy = cv2.findContours(
        binary,
        cv2.RETR_CCOMP,
        cv2.CHAIN_APPROX_NONE,
    )

    if hierarchy is None or not contours:
        return GeometryCollection()

    if (
        max_contours is not None
        and len(contours) > int(max_contours)
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                fragmentation_detail
                or (
                    "Suggestions are too fragmented at this sensitivity. "
                    "Increase smoothing or lower sensitivity."
                )
            ),
        )

    hierarchy = hierarchy[0]

    def refined_ring(
        contour: np.ndarray,
    ) -> list[tuple[float, float]]:
        if contour is None or len(contour) < 3:
            return []

        perimeter = float(
            cv2.arcLength(contour, True)
        )

        # Remove thumbnail-pixel stair steps without morphologically
        # expanding or eroding the predicted mask.
        epsilon = float(
            np.clip(
                perimeter * 0.0010,
                0.35,
                0.85,
            )
        )

        approximated = cv2.approxPolyDP(
            contour,
            epsilon,
            True,
        )

        points = (
            approximated.reshape(-1, 2)
            .astype(np.float64, copy=False)
        )

        if points.shape[0] < 3:
            points = (
                contour.reshape(-1, 2)
                .astype(np.float64, copy=False)
            )

        if points.shape[0] < 3:
            return []

        # Conservative coordinate-domain refinement only.
        if points.shape[0] >= 10:
            smoothed = (
                np.roll(points, 2, axis=0)
                + 2.0 * np.roll(points, 1, axis=0)
                + 3.0 * points
                + 2.0 * np.roll(points, -1, axis=0)
                + np.roll(points, -2, axis=0)
            ) / 9.0

            points = (
                0.70 * points
                + 0.30 * smoothed
            )

        return [
            (
                float(x) * scale_x,
                float(y) * scale_y,
            )
            for x, y in points
        ]

    polygons: list[Any] = []

    for index, contour in enumerate(contours):
        if int(hierarchy[index][3]) != -1:
            continue

        exterior = refined_ring(contour)
        if len(exterior) < 3:
            continue

        holes: list[list[tuple[float, float]]] = []
        child = int(hierarchy[index][2])

        while child != -1:
            hole = refined_ring(contours[child])
            if len(hole) >= 3:
                holes.append(hole)
            child = int(hierarchy[child][0])

        try:
            polygon = Polygon(exterior, holes)
        except Exception:
            continue

        if polygon.is_empty:
            continue

        try:
            polygon = make_valid(polygon)
        except Exception:
            pass

        for part in _il1_polygon_parts(polygon):
            if not part.is_empty and part.area > 0:
                polygons.append(part)

    if not polygons:
        return GeometryCollection()

    geometry = unary_union(polygons)

    try:
        geometry = make_valid(geometry)
    except Exception:
        pass

    return geometry


def _il1_polygon_parts(geometry: Any) -> list[Polygon]:
    if geometry is None or geometry.is_empty:
        return []

    if isinstance(geometry, Polygon):
        return [geometry]

    if isinstance(geometry, MultiPolygon):
        return [
            item
            for item in geometry.geoms
            if not item.is_empty
        ]

    if isinstance(geometry, GeometryCollection):
        output: list[Polygon] = []
        for item in geometry.geoms:
            output.extend(_il1_polygon_parts(item))
        return output

    return []


def _f1_annotation_class_union(
    collection: dict[str, Any],
    wanted_class: str,
):
    wanted_cf = str(wanted_class or "").strip().casefold()
    geometries: list[Any] = []

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        role = _il1_feature_role(feature)
        if role != "annotation":
            continue

        class_cf = _il1_feature_class(feature).strip().casefold()
        if class_cf != wanted_cf:
            continue

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue

        try:
            geometry = _polygonal_geometry(geometry_payload)
        except HTTPException:
            continue

        if not geometry.is_empty:
            geometries.append(geometry)

    if not geometries:
        return GeometryCollection()

    merged = unary_union(geometries)

    if not merged.is_valid:
        merged = make_valid(merged)

    return (
        _polygonal_only(merged)
        or GeometryCollection()
    )


def _f11_geometry_mask_window(
    geometry: Any,
    *,
    origin_x: int,
    origin_y: int,
    width: int,
    height: int,
) -> np.ndarray:
    # Rasterize a level-0 Shapely geometry into one native-resolution tile.
    width = max(1, int(width))
    height = max(1, int(height))

    mask_image = Image.new(
        "L",
        (width, height),
        0,
    )
    draw = ImageDraw.Draw(mask_image)

    def local_points(coords):
        return [
            (
                float(x) - float(origin_x),
                float(y) - float(origin_y),
            )
            for x, y, *_rest in coords
        ]

    def paint_polygon(polygon: Polygon) -> None:
        exterior = local_points(
            polygon.exterior.coords
        )
        if len(exterior) >= 3:
            draw.polygon(
                exterior,
                fill=255,
            )

        for interior in polygon.interiors:
            hole = local_points(
                interior.coords
            )
            if len(hole) >= 3:
                draw.polygon(
                    hole,
                    fill=0,
                )

    if isinstance(geometry, Polygon):
        paint_polygon(geometry)
    elif isinstance(geometry, MultiPolygon):
        for polygon in geometry.geoms:
            paint_polygon(polygon)
    elif isinstance(geometry, GeometryCollection):
        for part in geometry.geoms:
            if isinstance(part, Polygon):
                paint_polygon(part)
            elif isinstance(part, MultiPolygon):
                for polygon in part.geoms:
                    paint_polygon(polygon)

    return (
        np.asarray(
            mask_image,
            dtype=np.uint8,
        )
        > 0
    )


def _f11_union_role_geometries(
    collection: dict[str, Any],
    *,
    role_name: str | None = None,
    class_name: str | None = None,
):
    role_cf = (
        str(role_name).strip().casefold()
        if role_name is not None
        else None
    )
    class_cf_wanted = (
        str(class_name).strip().casefold()
        if class_name is not None
        else None
    )

    geometries: list[Any] = []

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        role = _il1_feature_role(feature)
        feature_class_cf = (
            _il1_feature_class(feature)
            .strip()
            .casefold()
        )

        if (
            role_cf is not None
            and role != role_cf
        ):
            continue

        if (
            class_cf_wanted is not None
            and feature_class_cf != class_cf_wanted
        ):
            continue

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue

        try:
            geometry = _polygonal_geometry(
                geometry_payload
            )
        except HTTPException:
            continue

        if not geometry.is_empty:
            geometries.append(geometry)

    if not geometries:
        return GeometryCollection()

    merged = unary_union(geometries)

    if not merged.is_valid:
        merged = make_valid(merged)

    return (
        _polygonal_only(merged)
        or GeometryCollection()
    )


def _f11_valid_analysis_geometry(
    collection: dict[str, Any],
    *,
    full_width: int,
    full_height: int,
):
    roi_geometry = _f11_union_role_geometries(
        collection,
        role_name="roi",
    )

    if roi_geometry.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Auto Anthracosis requires a Tissue ROI. "
                "Create or detect Tissue ROI first."
            ),
        )

    image_bounds = box(
        0.0,
        0.0,
        float(full_width),
        float(full_height),
    )

    roi_geometry = roi_geometry.intersection(
        image_bounds
    )

    roi_geometry = (
        _polygonal_only(roi_geometry)
        or GeometryCollection()
    )

    artifact_geometries: list[Any] = []
    artifact_count = 0

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        role = _il1_feature_role(feature)
        class_cf = (
            _il1_feature_class(feature)
            .strip()
            .casefold()
        )

        if not (
            role == "artifact"
            or class_cf == "artifact"
        ):
            continue

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue

        try:
            geometry = _polygonal_geometry(
                geometry_payload
            )
        except HTTPException:
            continue

        if geometry.is_empty:
            continue

        artifact_count += 1
        artifact_geometries.append(geometry)

    if artifact_geometries:
        artifact_union = unary_union(
            artifact_geometries
        )
        if not artifact_union.is_valid:
            artifact_union = make_valid(
                artifact_union
            )
        artifact_union = (
            _polygonal_only(artifact_union)
            or GeometryCollection()
        )
    else:
        artifact_union = GeometryCollection()

    valid_geometry = (
        roi_geometry.difference(
            artifact_union
        )
        if not artifact_union.is_empty
        else roi_geometry
    )

    valid_geometry = (
        _polygonal_only(valid_geometry)
        or GeometryCollection()
    )

    return valid_geometry, artifact_count


__all__ = ['_polygonal_geometry', '_geometry_json', '_stats_polygon_parts', '_stats_exterior_only_erode', '_stats_exclude_external_border', '_il1_feature_role', '_il1_feature_class', '_il1_mask_to_geometry', '_il1_polygon_parts', '_f1_annotation_class_union', '_f11_geometry_mask_window', '_f11_union_role_geometries', '_f11_valid_analysis_geometry']
