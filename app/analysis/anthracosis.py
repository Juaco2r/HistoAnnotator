from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, Body, HTTPException
from PIL import Image, ImageDraw
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

from .common import (
    _f11_geometry_mask_window, _f11_valid_analysis_geometry,
    _il1_feature_class, _il1_feature_role, _il1_mask_to_geometry,
    _il1_polygon_parts, _polygonal_geometry,
)

if __package__ and __package__.startswith("app."):
    from ..core.runtime import safe_image_path
    from ..domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from ..imaging.service import get_slide, preparation_required, read_ready_manifest, resolve_render_path
else:
    from core.runtime import safe_image_path
    from domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from imaging.service import get_slide, preparation_required, read_ready_manifest, resolve_render_path

router = APIRouter()

def _f13_black_seed_growth_mask(
    rgb: np.ndarray,
    *,
    valid_mask: np.ndarray,
    sensitivity: float,
    min_component_pixels: int,
    growth_radius: int,
    final_mask_dilate_px: int,
) -> tuple[np.ndarray, dict[str, float]]:
    # F1.3 Anthracosis detector:
    # - very strict black seeds
    # - bounded connected growth into lighter / slightly brown edges
    #
    # Hue is not trusted for near-black pixels. It is used only to prevent
    # strongly blue hematoxylin from becoming part of the grown boundary.
    rgb_u8 = np.asarray(
        rgb,
        dtype=np.uint8,
    )

    hsv = cv2.cvtColor(
        rgb_u8,
        cv2.COLOR_RGB2HSV,
    )

    hue = hsv[:, :, 0].astype(
        np.float32
    )
    saturation = hsv[:, :, 1].astype(
        np.float32
    )
    value = hsv[:, :, 2].astype(
        np.float32
    )

    rgb_f = rgb_u8.astype(
        np.float32
    )
    chroma = (
        np.max(rgb_f, axis=2)
        - np.min(rgb_f, axis=2)
    )

    sensitivity01 = (
        float(sensitivity)
        / 100.0
    )

    # F1.5: seed identity is deliberately VERY restrictive.
    #
    # Ultra-dark branch:
    #   near-black pixels are allowed to seed from V + chroma alone because
    #   H/S become numerically unstable at extremely low intensity.
    #
    # At sensitivity 50:
    #   ultra-dark seed: V <= 31, chroma <= 13
    #   primary seed:    V <= 40, S <= 50, chroma <= 14
    #   neutral seed:    V <= 47, S <= 21, chroma <= 9
    #
    # Sensitivity changes these limits only slightly.
    ultra_dark_value_limit = (
        28.0
        + 6.0 * sensitivity01
    )

    seed_value_limit = (
        35.0
        + 10.0 * sensitivity01
    )
    seed_saturation_limit = (
        46.0
        + 8.0 * sensitivity01
    )

    neutral_seed_value_limit = (
        42.0
        + 10.0 * sensitivity01
    )
    neutral_seed_saturation_limit = (
        18.0
        + 6.0 * sensitivity01
    )

    # Hue rejection is applied only to the normal seed branch.
    # For extremely dark pixels hue is numerically unstable, so chroma and
    # V/S are more trustworthy than H.
    chromatic = (
        saturation >= 55.0
    )

    brown_hue = (
        (hue >= 4.0)
        & (hue <= 32.0)
    )

    blue_hue = (
        (hue >= 92.0)
        & (hue <= 138.0)
    )

    seed_hue_reject = (
        chromatic
        & (
            brown_hue
            | blue_hue
        )
        & (
            value > 40.0
        )
    )

    ultra_dark_seed = (
        (
            value
            <= ultra_dark_value_limit
        )
        & (
            chroma <= 13.0
        )
    )

    primary_seed = (
        (value <= seed_value_limit)
        & (
            saturation
            <= seed_saturation_limit
        )
        & (
            chroma <= 14.0
        )
        & ~seed_hue_reject
    )

    neutral_seed = (
        (
            value
            <= neutral_seed_value_limit
        )
        & (
            saturation
            <= neutral_seed_saturation_limit
        )
        & (
            chroma <= 9.0
        )
    )

    seed_mask = (
        (
            ultra_dark_seed
            | primary_seed
            | neutral_seed
        )
        & valid_mask
    )

    # The final area is intentionally more permissive than the seed.
    # Brownish / lighter pixels are allowed ONLY if reached by bounded
    # growth from a true black seed.
    grow_value_limit = (
        145.0
        + 24.0 * sensitivity01
    )
    grow_saturation_limit = (
        118.0
        + 18.0 * sensitivity01
    )

    light_neutral_value_limit = (
        165.0
        + 20.0 * sensitivity01
    )
    light_neutral_saturation_limit = (
        68.0
        + 16.0 * sensitivity01
    )

    # Strong blue remains excluded from the final grown border.
    blue_boundary_reject = (
        (saturation >= 82.0)
        & (hue >= 90.0)
        & (hue <= 140.0)
    )

    growth_mask = (
        (
            (
                value
                <= grow_value_limit
            )
            & (
                saturation
                <= grow_saturation_limit
            )
        )
        | (
            (
                value
                <= light_neutral_value_limit
            )
            & (
                saturation
                <= light_neutral_saturation_limit
            )
        )
    )

    growth_mask = (
        growth_mask
        & ~blue_boundary_reject
        & valid_mask
    )

    growth_mask |= seed_mask

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (3, 3),
    )

    grown = seed_mask.copy()

    # Bounded morphological reconstruction:
    # unlike the F1.2 connected-component flood, this cannot run across a
    # large DAB region just because one black pixel touches it.
    iterations = max(
        0,
        int(growth_radius),
    )

    for _ in range(iterations):
        expanded = (
            cv2.dilate(
                grown.astype(np.uint8),
                kernel,
                iterations=1,
            )
            > 0
        )

        expanded &= growth_mask

        if np.array_equal(
            expanded,
            grown,
        ):
            break

        grown = expanded

    # Only close tiny one-pixel gaps after growth.
    grown = (
        cv2.morphologyEx(
            grown.astype(np.uint8) * 255,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=1,
        )
        > 0
    )

    grown &= valid_mask

    labels_count, labels, stats, _centroids = (
        cv2.connectedComponentsWithStats(
            grown.astype(np.uint8),
            connectivity=8,
        )
    )

    cleaned = np.zeros_like(
        grown,
        dtype=bool,
    )

    minimum = max(
        1,
        int(min_component_pixels),
    )

    for label in range(
        1,
        int(labels_count),
    ):
        area = int(
            stats[
                label,
                cv2.CC_STAT_AREA,
            ]
        )

        if area < minimum:
            continue

        component = (
            labels == label
        )

        # Final safety: every accepted component must still contain a seed.
        if not np.any(
            component
            & seed_mask
        ):
            continue

        cleaned[component] = True

    if int(final_mask_dilate_px) > 0:
        dilate_radius = max(
            0,
            int(final_mask_dilate_px),
        )
        dilate_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (
                dilate_radius * 2 + 1,
                dilate_radius * 2 + 1,
            ),
        )
        cleaned = (
            cv2.dilate(
                cleaned.astype(np.uint8),
                dilate_kernel,
                iterations=1,
            )
            > 0
        )
        cleaned &= valid_mask

    return cleaned, {
        "ultraDarkValueLimit":
            float(ultra_dark_value_limit),
        "seedValueLimit":
            float(seed_value_limit),
        "seedSaturationLimit":
            float(seed_saturation_limit),
        "neutralSeedValueLimit":
            float(neutral_seed_value_limit),
        "neutralSeedSaturationLimit":
            float(neutral_seed_saturation_limit),
        "growValueLimit":
            float(grow_value_limit),
        "growSaturationLimit":
            float(grow_saturation_limit),
        "lightNeutralValueLimit":
            float(light_neutral_value_limit),
        "lightNeutralSaturationLimit":
            float(light_neutral_saturation_limit),
        "growthRadius":
            int(growth_radius),
        "finalMaskDilatePx":
            int(final_mask_dilate_px),
        "minimumComponentPixels":
            int(min_component_pixels),
    }


@router.post("/api/images/{image_id}/detect-anthracosis")
def detect_anthracosis(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    from math import ceil, floor
    from shapely.affinity import translate as shapely_translate

    collection_payload = payload.get(
        "featureCollection"
    )

    if not isinstance(
        collection_payload,
        dict,
    ):
        raise HTTPException(
            status_code=422,
            detail="featureCollection is required",
        )

    collection, _report = (
        sanitize_qupath_feature_collection(
            collection_payload
        )
    )

    sensitivity = min(
        100.0,
        max(
            0.0,
            float(
                payload.get(
                    "sensitivity",
                    50,
                )
                or 50
            ),
        ),
    )

    tile_size = min(
        2048,
        max(
            512,
            int(
                payload.get(
                    "tileSize",
                    1024,
                )
                or 1024
            ),
        ),
    )

    overlap = min(
        tile_size // 4,
        max(
            0,
            int(
                payload.get(
                    "overlap",
                    64,
                )
                or 64
            ),
        ),
    )

    min_component_pixels = min(
        512,
        max(
            1,
            int(
                payload.get(
                    "minComponentPixels",
                    1,
                )
                or 1
            ),
        ),
    )

    growth_radius = min(
        32,
        max(
            0,
            int(
                payload.get(
                    "growthRadius",
                    8,
                )
                or 0
            ),
        ),
    )

    final_mask_dilate_px = min(
        8,
        max(
            0,
            int(
                payload.get(
                    "finalMaskDilatePx",
                    0,
                )
                or 0
            ),
        ),
    )

    microdeposit_vector_max_pixels = min(
        16,
        max(
            1,
            int(
                payload.get(
                    "microdepositVectorMaxPixels",
                    4,
                )
                or 4
            ),
        ),
    )

    maximum_components = min(
        50000,
        max(
            1,
            int(
                payload.get(
                    "maxComponents",
                    50000,
                )
                or 50000
            ),
        ),
    )

    path, relative = safe_image_path(
        image_id
    )

    if (
        preparation_required(path)
        and not read_ready_manifest(
            path,
            relative,
        )
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
    slide = handle.slide

    if not hasattr(
        slide,
        "read_region",
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Native tiled Anthracosis detection "
                "requires read_region support for this image"
            ),
        )

    full_width, full_height = map(
        int,
        slide.dimensions,
    )

    (
        valid_geometry,
        artifact_count,
    ) = _f11_valid_analysis_geometry(
        collection,
        full_width=full_width,
        full_height=full_height,
    )

    valid_area = float(
        valid_geometry.area
    )

    if (
        valid_geometry.is_empty
        or valid_area < 1.0
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Valid Tissue is too small "
                "for Auto Anthracosis"
            ),
        )

    min_x, min_y, max_x, max_y = (
        valid_geometry.bounds
    )

    start_x = max(
        0,
        int(
            floor(
                min_x
                / tile_size
            )
            * tile_size
        ),
    )
    start_y = max(
        0,
        int(
            floor(
                min_y
                / tile_size
            )
            * tile_size
        ),
    )

    stop_x = min(
        full_width,
        int(
            ceil(
                max_x
                / tile_size
            )
            * tile_size
        ),
    )
    stop_y = min(
        full_height,
        int(
            ceil(
                max_y
                / tile_size
            )
            * tile_size
        ),
    )

    polygons: list[Polygon] = []
    tiles_planned = 0
    tiles_processed = 0
    tiles_skipped = 0
    candidate_pixels = 0
    microdeposit_components_rescued = 0
    microdeposit_pixels_rescued = 0
    threshold_payload: dict[str, float] | None = None

    for core_y in range(
        start_y,
        stop_y,
        tile_size,
    ):
        core_height = min(
            tile_size,
            full_height - core_y,
        )
        if core_height <= 0:
            continue

        for core_x in range(
            start_x,
            stop_x,
            tile_size,
        ):
            core_width = min(
                tile_size,
                full_width - core_x,
            )
            if core_width <= 0:
                continue

            tiles_planned += 1

            core_box = box(
                float(core_x),
                float(core_y),
                float(
                    core_x
                    + core_width
                ),
                float(
                    core_y
                    + core_height
                ),
            )

            if not valid_geometry.intersects(
                core_box
            ):
                tiles_skipped += 1
                continue

            read_x = max(
                0,
                core_x - overlap,
            )
            read_y = max(
                0,
                core_y - overlap,
            )
            read_x2 = min(
                full_width,
                core_x
                + core_width
                + overlap,
            )
            read_y2 = min(
                full_height,
                core_y
                + core_height
                + overlap,
            )

            read_width = (
                read_x2 - read_x
            )
            read_height = (
                read_y2 - read_y
            )

            if (
                read_width <= 0
                or read_height <= 0
            ):
                tiles_skipped += 1
                continue

            read_box = box(
                float(read_x),
                float(read_y),
                float(read_x2),
                float(read_y2),
            )

            window_geometry = (
                valid_geometry.intersection(
                    read_box
                )
            )

            window_geometry = (
                _polygonal_only(
                    window_geometry
                )
                or GeometryCollection()
            )

            if window_geometry.is_empty:
                tiles_skipped += 1
                continue

            tile_image = slide.read_region(
                (
                    int(read_x),
                    int(read_y),
                ),
                0,
                (
                    int(read_width),
                    int(read_height),
                ),
            ).convert("RGB")

            rgb = np.asarray(
                tile_image,
                dtype=np.uint8,
            )

            valid_mask = (
                _f11_geometry_mask_window(
                    window_geometry,
                    origin_x=read_x,
                    origin_y=read_y,
                    width=read_width,
                    height=read_height,
                )
            )

            if not np.any(valid_mask):
                tiles_skipped += 1
                continue

            (
                prediction,
                local_thresholds,
            ) = _f13_black_seed_growth_mask(
                rgb,
                valid_mask=valid_mask,
                sensitivity=sensitivity,
                min_component_pixels=
                    min_component_pixels,
                growth_radius=
                    growth_radius,
                final_mask_dilate_px=
                    final_mask_dilate_px,
            )

            threshold_payload = (
                local_thresholds
            )

            local_pixels = int(
                np.count_nonzero(
                    prediction
                )
            )

            candidate_pixels += (
                local_pixels
            )
            tiles_processed += 1

            if local_pixels == 0:
                continue

            # F1.6 microdeposit vector rescue.
            #
            # cv2.findContours can return fewer than 3 contour points for
            # single-pixel / very short components. Those pixels are real in
            # the level-0 detection mask but cannot form a Polygon through the
            # normal contour path. Rescue only these tiny components by
            # converting their native pixel cells directly to geometry.
            vector_mask = prediction.copy()

            (
                micro_labels_count,
                micro_labels,
                micro_stats,
                _micro_centroids,
            ) = cv2.connectedComponentsWithStats(
                prediction.astype(
                    np.uint8
                ),
                connectivity=8,
            )

            for micro_label in range(
                1,
                int(micro_labels_count),
            ):
                micro_area = int(
                    micro_stats[
                        micro_label,
                        cv2.CC_STAT_AREA,
                    ]
                )

                if (
                    micro_area < 1
                    or micro_area
                    > microdeposit_vector_max_pixels
                ):
                    continue

                micro_component = (
                    micro_labels
                    == micro_label
                )

                ys, xs = np.nonzero(
                    micro_component
                )

                if len(xs) == 0:
                    continue

                pixel_cells = [
                    box(
                        float(x),
                        float(y),
                        float(x + 1),
                        float(y + 1),
                    )
                    for y, x in zip(
                        ys.tolist(),
                        xs.tolist(),
                    )
                ]

                local_micro_geometry = unary_union(
                    pixel_cells
                )

                if local_micro_geometry.is_empty:
                    continue

                global_micro_geometry = (
                    shapely_translate(
                        local_micro_geometry,
                        xoff=float(read_x),
                        yoff=float(read_y),
                    )
                )

                clipped_micro = (
                    global_micro_geometry.intersection(
                        valid_geometry
                    )
                )

                clipped_micro = (
                    _polygonal_only(
                        clipped_micro
                    )
                    or GeometryCollection()
                )

                appended_micro = False

                for micro_part in _il1_polygon_parts(
                    clipped_micro
                ):
                    if (
                        not micro_part.is_empty
                        and micro_part.area > 0
                    ):
                        polygons.append(
                            micro_part
                        )
                        appended_micro = True

                if appended_micro:
                    vector_mask[
                        micro_component
                    ] = False

                    microdeposit_components_rescued += 1
                    microdeposit_pixels_rescued += (
                        micro_area
                    )

            # Normal components continue through the existing contour path.
            # Tiny rescued pixels are removed first to prevent duplicates.
            if np.any(vector_mask):
                local_geometry = (
                    _il1_mask_to_geometry(
                        vector_mask,
                        1.0,
                        1.0,
                    )
                )

                if not local_geometry.is_empty:
                    global_geometry = (
                        shapely_translate(
                            local_geometry,
                            xoff=float(read_x),
                            yoff=float(read_y),
                        )
                    )

                    for polygon in _il1_polygon_parts(
                        global_geometry
                    ):
                        if polygon.area < float(
                            min_component_pixels
                        ):
                            continue

                        clipped = polygon.intersection(
                            valid_geometry
                        )
                        clipped = (
                            _polygonal_only(clipped)
                            or GeometryCollection()
                        )

                        for part in _il1_polygon_parts(
                            clipped
                        ):
                            if part.area >= float(
                                min_component_pixels
                            ):
                                polygons.append(part)

    if polygons:
        merged = unary_union(polygons)

        if not merged.is_valid:
            merged = make_valid(merged)

        merged = (
            _polygonal_only(merged)
            or GeometryCollection()
        )
    else:
        merged = GeometryCollection()

    parts: list[Polygon] = []

    for polygon in _il1_polygon_parts(
        merged
    ):
        if polygon.area < float(
            min_component_pixels
        ):
            continue

        tolerance = (
            0.30
            if polygon.area < 250.0
            else 0.55
        )

        simplified = polygon.simplify(
            tolerance,
            preserve_topology=True,
        )

        simplified = (
            _polygonal_only(
                simplified
            )
            or GeometryCollection()
        )

        for part in _il1_polygon_parts(
            simplified
        ):
            if part.area >= float(
                min_component_pixels
            ):
                parts.append(part)

    parts.sort(
        key=lambda polygon:
            float(polygon.area),
        reverse=True,
    )

    total_components_before_cap = int(
        len(parts)
    )

    truncated = (
        total_components_before_cap
        > maximum_components
    )

    parts = parts[
        :maximum_components
    ]

    returned_component_count = int(
        len(parts)
    )

    # F1.9: preserve every component geometry, but package nearby components
    # into spatial MultiPolygon annotations. This avoids creating 10k-50k
    # separate frontend features while keeping exact component boundaries.
    spatial_group_size_px = 2048

    spatial_groups: dict[
        tuple[int, int],
        list[Polygon],
    ] = {}

    for part in parts:
        min_part_x, min_part_y, max_part_x, max_part_y = (
            part.bounds
        )

        center_x = (
            float(min_part_x)
            + float(max_part_x)
        ) * 0.5

        center_y = (
            float(min_part_y)
            + float(max_part_y)
        ) * 0.5

        group_key = (
            int(
                center_x
                // spatial_group_size_px
            ),
            int(
                center_y
                // spatial_group_size_px
            ),
        )

        spatial_groups.setdefault(
            group_key,
            [],
        ).append(part)

    detections: list[dict[str, Any]] = []

    for feature_index, group_key in enumerate(
        sorted(
            spatial_groups.keys(),
            key=lambda item: (
                item[1],
                item[0],
            ),
        ),
        start=1,
    ):
        group_parts = spatial_groups[
            group_key
        ]

        if len(group_parts) == 1:
            grouped_geometry = (
                group_parts[0]
            )
        else:
            grouped_geometry = unary_union(
                group_parts
            )

            if not grouped_geometry.is_valid:
                grouped_geometry = make_valid(
                    grouped_geometry
                )

            grouped_geometry = (
                _polygonal_only(
                    grouped_geometry
                )
                or GeometryCollection()
            )

        if grouped_geometry.is_empty:
            continue

        group_area = float(
            sum(
                part.area
                for part in group_parts
            )
        )

        detections.append(
            {
                "id":
                    f"anthracosis-group-{feature_index}",
                "geometry":
                    mapping(
                        grouped_geometry
                    ),
                "areaPx2":
                    group_area,
                "componentCount":
                    int(
                        len(group_parts)
                    ),
                "spatialGroup": {
                    "column":
                        int(group_key[0]),
                    "row":
                        int(group_key[1]),
                    "sizePx":
                        int(
                            spatial_group_size_px
                        ),
                },
            }
        )

    returned_feature_count = int(
        len(detections)
    )

    detected_area = float(
        sum(
            part.area
            for part in parts
        )
    )

    coverage_percent = (
        100.0
        * detected_area
        / valid_area
        if valid_area > 0
        else 0.0
    )

    thresholds = (
        threshold_payload
        or {
            "ultraDarkValueLimit": 0.0,
            "seedValueLimit": 0.0,
            "seedSaturationLimit": 0.0,
            "neutralSeedValueLimit": 0.0,
            "neutralSeedSaturationLimit": 0.0,
            "growValueLimit": 0.0,
            "growSaturationLimit": 0.0,
            "lightNeutralValueLimit": 0.0,
            "lightNeutralSaturationLimit": 0.0,
            "growthRadius": int(growth_radius),
            "finalMaskDilatePx": int(final_mask_dilate_px),
            "minimumComponentPixels": int(min_component_pixels),
        }
    )

    model_payload = {
        "type":
            "dark-pigment-hsv-ultradark-seed-growth-dilate-v6",
        "method":
            "dark-pigment-hsv-ultradark-seed-growth-dilate-v6",
        "sensitivity":
            float(sensitivity),
        "analysisResolution":
            "native-level-0",
        "tileSize":
            int(tile_size),
        "overlap":
            int(overlap),
        "minComponentPixels":
            int(min_component_pixels),
        "growthRadius":
            int(growth_radius),
        "finalMaskDilatePx":
            int(final_mask_dilate_px),
        "microdepositVectorMaxPixels":
            int(microdeposit_vector_max_pixels),
        "vectorization":
            "contour-plus-pixel-cell-rescue-v1",
        "frontendPacking":
            "spatial-multipolygon-v1",
        "spatialGroupSizePx":
            int(spatial_group_size_px),
        "analysisRegion":
            "Tissue ROI - Artifact",
        **thresholds,
    }

    return {
        "detections": detections,
        "model": model_payload,
        "summary": {
            "artifactCount":
                int(artifact_count),
            "tilesPlanned":
                int(tiles_planned),
            "tilesProcessed":
                int(tiles_processed),
            "tilesSkipped":
                int(tiles_skipped),
            "candidatePixelsNative":
                int(candidate_pixels),
            "microdepositComponentsRescuedTileRaw":
                int(microdeposit_components_rescued),
            "microdepositPixelsRescuedTileRaw":
                int(microdeposit_pixels_rescued),
            "returnedDetections":
                int(returned_component_count),
            "returnedFeatures":
                int(returned_feature_count),
            "totalComponentsBeforeSafetyCap":
                int(total_components_before_cap),
            "spatialGroupSizePx":
                int(spatial_group_size_px),
            "detectedAreaPx2":
                float(detected_area),
            "validAreaPx2":
                float(valid_area),
            "coveragePercent":
                float(coverage_percent),
            "truncated":
                bool(truncated),
        },
    }


__all__ = ['_f13_black_seed_growth_mask', 'detect_anthracosis']
