from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException
from PIL import Image
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.ops import unary_union
from shapely.validation import make_valid

from .common import _geometry_json

if __package__ and __package__.startswith("app."):
    from ..core.runtime import safe_image_path
    from ..domain.geojson import _polygonal_only
    from ..imaging.service import get_slide, preparation_required, read_ready_manifest, resolve_render_path
else:
    from core.runtime import safe_image_path
    from domain.geojson import _polygonal_only
    from imaging.service import get_slide, preparation_required, read_ready_manifest, resolve_render_path

def _tissue_thumbnail(
    image_id: str,
    max_size: int,
) -> tuple[Image.Image, int, int]:
    path, relative = safe_image_path(image_id)

    if (
        preparation_required(path)
        and not read_ready_manifest(path, relative)
    ):
        raise HTTPException(
            status_code=409,
            detail="Image is not ready yet",
        )

    render_path = resolve_render_path(
        path,
        relative,
    )

    handle = get_slide(render_path)
    source_width, source_height = handle.dimensions

    thumbnail = handle.slide.get_thumbnail(
        (max_size, max_size)
    ).convert("RGB")

    return (
        thumbnail,
        int(source_width),
        int(source_height),
    )


def _tissue_mask_to_geometry(
    mask: np.ndarray,
    source_width: int,
    source_height: int,
    *,
    fill_holes: bool,
    min_island_fraction: float,
    smoothing: float,
) -> dict[str, Any] | None:
    try:
        import cv2
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Tissue detection requires "
                "opencv-python-headless"
            ),
        ) from exc

    height, width = mask.shape[:2]

    if width <= 0 or height <= 0:
        return None

    minimum_area = max(
        4.0,
        float(width * height)
        * max(0.0, min_island_fraction),
    )

    contour_mode = (
        cv2.RETR_EXTERNAL
        if fill_holes
        else cv2.RETR_CCOMP
    )

    contours, hierarchy = cv2.findContours(
        mask,
        contour_mode,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    if not contours:
        return None

    hierarchy_row = (
        hierarchy[0]
        if hierarchy is not None
        and len(hierarchy)
        else None
    )

    scale_x = (
        float(source_width)
        / float(width)
    )
    scale_y = (
        float(source_height)
        / float(height)
    )

    epsilon = max(
        0.5,
        0.6
        + float(smoothing) * 0.035,
    )

    def scaled_ring(contour):
        approximated = cv2.approxPolyDP(
            contour,
            epsilon,
            True,
        )

        raw = approximated.reshape(-1, 2)

        return [
            (
                float(point[0]) * scale_x,
                float(point[1]) * scale_y,
            )
            for point in raw
        ]

    polygons = []

    for index, contour in enumerate(contours):
        if cv2.contourArea(contour) < minimum_area:
            continue

        if (
            hierarchy_row is not None
            and hierarchy_row[index][3] != -1
        ):
            continue

        exterior = scaled_ring(contour)

        if len(exterior) < 3:
            continue

        holes = []

        if (
            not fill_holes
            and hierarchy_row is not None
        ):
            child = int(
                hierarchy_row[index][2]
            )

            while child != -1:
                hole_contour = contours[child]

                if (
                    cv2.contourArea(hole_contour)
                    >= 4.0
                ):
                    hole = scaled_ring(
                        hole_contour
                    )

                    if len(hole) >= 3:
                        holes.append(hole)

                child = int(
                    hierarchy_row[child][0]
                )

        try:
            polygon = Polygon(
                exterior,
                holes,
            )

            if not polygon.is_valid:
                polygon = make_valid(
                    polygon
                )

            polygon = _polygonal_only(
                polygon
            )

            if (
                polygon is not None
                and not polygon.is_empty
            ):
                polygons.append(
                    polygon
                )
        except Exception:
            continue

    if not polygons:
        return None

    merged = unary_union(polygons)

    if not merged.is_valid:
        merged = make_valid(merged)

    merged = _polygonal_only(merged)

    if (
        merged is None
        or merged.is_empty
    ):
        return None

    simplify_level0 = max(
        scale_x,
        scale_y,
    ) * max(
        0.0,
        min(2.0, float(smoothing) / 40.0),
    )

    return _geometry_json(
        merged,
        simplify_level0,
    )


__all__ = ['_tissue_thumbnail', '_tissue_mask_to_geometry']
