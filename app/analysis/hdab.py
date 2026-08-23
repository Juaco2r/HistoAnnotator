from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException
from shapely.geometry import GeometryCollection, box, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

from .common import (
    _f11_geometry_mask_window, _f1_annotation_class_union,
    _il1_mask_to_geometry, _il1_polygon_parts, _polygonal_geometry,
    _stats_exclude_external_border,
)

if __package__ and __package__.startswith("app."):
    from ..core.runtime import safe_image_path
    from ..domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from ..imaging.service import (
        STAIN_DAB, STAIN_HEMATOXYLIN, _read_image_types, _stain_matrix,
        get_slide, preparation_required, read_ready_manifest, resolve_render_path,
    )
else:
    from core.runtime import safe_image_path
    from domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from imaging.service import (
        STAIN_DAB, STAIN_HEMATOXYLIN, _read_image_types, _stain_matrix,
        get_slide, preparation_required, read_ready_manifest, resolve_render_path,
    )

def _f20_hdab_valid_geometry(
    collection: dict[str, Any],
    *,
    full_width: int,
    full_height: int,
) -> tuple[Any, dict[str, Any]]:
    image_bounds = box(
        0.0,
        0.0,
        float(full_width),
        float(full_height),
    )

    tissue_geometries: list[Any] = []
    artifact_geometries: list[Any] = []

    artifact_count = 0
    anthracosis_count = 0

    border_enabled = False
    border_percent = 0.0

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties", {})
        histo = properties.get("histoannotator", {})

        role = str(
            histo.get("role", "annotation")
        ).strip().lower()

        class_name = str(
            properties
            .get("classification", {})
            .get("name")
            or "Unclassified"
        ).strip()

        class_cf = class_name.casefold()

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

        roi_meta = histo.get("roi", {})
        roi_kind = (
            str(
                roi_meta.get("kind", "tissue")
            ).strip().lower()
            if isinstance(roi_meta, dict)
            else "tissue"
        )

        if role == "roi" and roi_kind == "tissue":
            tissue_geometries.append(geometry)

            if isinstance(roi_meta, dict):
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

            continue

        if (
            role == "artifact"
            or class_cf == "artifact"
        ):
            artifact_count += 1
            artifact_geometries.append(
                geometry
            )
            continue

        if (
            role == "annotation"
            and class_cf == "anthracosis"
        ):
            anthracosis_count += 1

    if not tissue_geometries:
        raise HTTPException(
            status_code=422,
            detail=(
                "Quantitative H-DAB analysis requires "
                "a Tissue ROI"
            ),
        )

    tissue_roi = unary_union(
        tissue_geometries
    )

    if (
        not tissue_roi.is_empty
        and not tissue_roi.is_valid
    ):
        tissue_roi = make_valid(
            tissue_roi
        )

    tissue_roi = (
        _polygonal_only(
            tissue_roi.intersection(
                image_bounds
            )
        )
        or GeometryCollection()
    )

    if tissue_roi.is_empty:
        raise HTTPException(
            status_code=422,
            detail="Tissue ROI is empty inside the image",
        )

    base_area = float(
        tissue_roi.area
    )

    requested_border = (
        border_percent
        if border_enabled
        else 0.0
    )

    (
        post_border_region,
        actual_border_percent,
        border_width_px,
    ) = _stats_exclude_external_border(
        tissue_roi,
        requested_border,
    )

    post_border_region = (
        _polygonal_only(
            post_border_region
        )
        or GeometryCollection()
    )

    if post_border_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "External border exclusion removed "
                "the complete Tissue ROI"
            ),
        )

    post_border_area = float(
        post_border_region.area
    )

    if artifact_geometries:
        artifact_union = unary_union(
            artifact_geometries
        )

        if (
            not artifact_union.is_empty
            and not artifact_union.is_valid
        ):
            artifact_union = make_valid(
                artifact_union
            )

        artifact_union = (
            _polygonal_only(
                artifact_union.intersection(
                    post_border_region
                )
            )
            or GeometryCollection()
        )
    else:
        artifact_union = GeometryCollection()

    artifact_area = (
        float(artifact_union.area)
        if not artifact_union.is_empty
        else 0.0
    )

    clean_after_artifact = (
        post_border_region.difference(
            artifact_union
        )
        if not artifact_union.is_empty
        else post_border_region
    )

    clean_after_artifact = (
        _polygonal_only(
            clean_after_artifact
        )
        or GeometryCollection()
    )

    if clean_after_artifact.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Artifact exclusion removed the complete "
                "H-DAB analysis region"
            ),
        )

    anthracosis_union = (
        _f1_annotation_class_union(
            collection,
            "anthracosis",
        )
    )

    if not anthracosis_union.is_empty:
        anthracosis_union = (
            _polygonal_only(
                anthracosis_union.intersection(
                    clean_after_artifact
                )
            )
            or GeometryCollection()
        )

    anthracosis_area = (
        float(anthracosis_union.area)
        if not anthracosis_union.is_empty
        else 0.0
    )

    valid_geometry = (
        clean_after_artifact.difference(
            anthracosis_union
        )
        if not anthracosis_union.is_empty
        else clean_after_artifact
    )

    if (
        not valid_geometry.is_empty
        and not valid_geometry.is_valid
    ):
        valid_geometry = make_valid(
            valid_geometry
        )

    valid_geometry = (
        _polygonal_only(
            valid_geometry
        )
        or GeometryCollection()
    )

    if valid_geometry.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Anthracosis exclusion removed the complete "
                "H-DAB analysis region"
            ),
        )

    return valid_geometry, {
        "baseAreaPx2":
            float(base_area),
        "postBorderAreaPx2":
            float(post_border_area),
        "externalBorderEnabled":
            bool(border_enabled),
        "externalBorderRequestedPct":
            float(requested_border),
        "externalBorderActualPct":
            float(actual_border_percent),
        "externalBorderWidthPx":
            float(border_width_px),
        "artifactCount":
            int(artifact_count),
        "artifactAreaPx2":
            float(artifact_area),
        "anthracosisCount":
            int(anthracosis_count),
        "anthracosisAreaPx2":
            float(anthracosis_area),
        "validGeometryAreaPx2":
            float(valid_geometry.area),
    }


def _f20_otsu_threshold_from_histogram(
    histogram: np.ndarray,
    *,
    maximum_od: float,
) -> float:
    counts = np.asarray(
        histogram,
        dtype=np.float64,
    )

    if counts.ndim != 1 or counts.size < 2:
        return 0.0

    total = float(
        np.sum(counts)
    )

    if total <= 0:
        return 0.0

    centers = (
        (
            np.arange(
                counts.size,
                dtype=np.float64,
            )
            + 0.5
        )
        * (
            float(maximum_od)
            / float(counts.size)
        )
    )

    cumulative_weight = np.cumsum(
        counts
    )
    cumulative_sum = np.cumsum(
        counts * centers
    )

    total_sum = float(
        cumulative_sum[-1]
    )

    foreground_weight = (
        total
        - cumulative_weight
    )

    valid = (
        (cumulative_weight > 0)
        & (foreground_weight > 0)
    )

    if not np.any(valid):
        return float(
            centers[
                int(
                    np.argmax(counts)
                )
            ]
        )

    background_mean = np.zeros_like(
        centers
    )
    foreground_mean = np.zeros_like(
        centers
    )

    background_mean[valid] = (
        cumulative_sum[valid]
        / cumulative_weight[valid]
    )

    foreground_mean[valid] = (
        (
            total_sum
            - cumulative_sum[valid]
        )
        / foreground_weight[valid]
    )

    between_variance = np.zeros_like(
        centers
    )

    between_variance[valid] = (
        cumulative_weight[valid]
        * foreground_weight[valid]
        * (
            background_mean[valid]
            - foreground_mean[valid]
        )
        ** 2
    )

    best_index = int(
        np.argmax(
            between_variance
        )
    )

    return float(
        centers[best_index]
    )


def _f22_float(
    value: Any,
    default: float,
    low: float,
    high: float,
) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float(default)

    if not np.isfinite(number):
        number = float(default)

    return max(float(low), min(float(high), number))


def _f22_parameters(
    payload: dict[str, Any],
) -> dict[str, Any]:
    threshold_mode = str(
        payload.get("thresholdMode", "auto_otsu")
        or "auto_otsu"
    ).strip().lower()

    aliases = {
        "auto": "auto_otsu",
        "otsu": "auto_otsu",
        "wov": "auto_wov",
        "fixed": "manual",
    }
    threshold_mode = aliases.get(
        threshold_mode,
        threshold_mode,
    )

    if threshold_mode not in {
        "auto_otsu",
        "auto_wov",
        "manual",
    }:
        raise HTTPException(
            status_code=422,
            detail=(
                "thresholdMode must be auto_otsu, "
                "auto_wov, or manual"
            ),
        )

    threshold_od = _f22_float(
        payload.get("thresholdOd", 0.30),
        0.30,
        0.0,
        6.0,
    )

    wov_delta = _f22_float(
        payload.get("wovDelta", 0.25),
        0.25,
        -1.0,
        1.0,
    )

    smoothing_enabled = bool(
        payload.get("smoothingEnabled", False)
    )
    smoothing_sigma = _f22_float(
        payload.get("smoothingSigma", 1.0),
        1.0,
        0.0,
        25.0,
    )

    small_filter_enabled = bool(
        payload.get("smallObjectFilterEnabled", False)
    )
    minimum_object_area = _f22_float(
        payload.get("minimumObjectArea", 25.0),
        25.0,
        0.0,
        1_000_000.0,
    )

    mpp = _f22_float(
        payload.get("mpp", 0.0),
        0.0,
        0.0,
        1000.0,
    )

    tile_size = int(
        _f22_float(
            payload.get("tileSize", 1024),
            1024,
            512,
            2048,
        )
    )

    if mpp > 0:
        smoothing_sigma_px = smoothing_sigma / mpp
        minimum_object_area_px2 = (
            minimum_object_area / (mpp * mpp)
        )
        smoothing_unit = "um"
        area_unit = "um2"
    else:
        smoothing_sigma_px = smoothing_sigma
        minimum_object_area_px2 = minimum_object_area
        smoothing_unit = "px"
        area_unit = "px2"

    smoothing_sigma_px = max(
        0.0,
        min(64.0, float(smoothing_sigma_px)),
    )

    minimum_object_area_px2 = max(
        0.0,
        float(minimum_object_area_px2),
    )

    return {
        "thresholdMode": threshold_mode,
        "thresholdOd": float(threshold_od),
        "wovDelta": float(wov_delta),
        "smoothingEnabled": bool(smoothing_enabled),
        "smoothingSigma": float(smoothing_sigma),
        "smoothingSigmaPx": float(
            smoothing_sigma_px
            if smoothing_enabled
            else 0.0
        ),
        "smoothingUnit": smoothing_unit,
        "smallObjectFilterEnabled": bool(
            small_filter_enabled
        ),
        "minimumObjectArea": float(
            minimum_object_area
        ),
        "minimumObjectAreaPx2": float(
            minimum_object_area_px2
            if small_filter_enabled
            else 0.0
        ),
        "minimumObjectAreaUnit": area_unit,
        "mpp": float(mpp),
        "tileSize": int(tile_size),
        "maximumOd": 6.0,
        "histogramBins": 4096,
    }


def _f22_weighted_object_variance_threshold(
    histogram: np.ndarray,
    *,
    maximum_od: float,
    delta: float,
) -> float:
    # Weighted object variance in DAB optical-density space.
    #
    # High OD = Positive/object class.
    # Low OD = background/negative class.
    #
    # score(t) =
    #   P_object * mu_object^2
    #   + P_background^(1 + delta) * mu_background^2
    #
    # delta = 0 is equivalent to the Otsu objective up to the
    # threshold-independent global-mean term. Positive delta gives
    # greater relative weight to a sparse high-OD object class.
    counts = np.asarray(
        histogram,
        dtype=np.float64,
    )

    if counts.ndim != 1 or counts.size < 2:
        return 0.0

    total = float(np.sum(counts))
    if total <= 0:
        return 0.0

    centers = (
        (
            np.arange(
                counts.size,
                dtype=np.float64,
            )
            + 0.5
        )
        * (
            float(maximum_od)
            / float(counts.size)
        )
    )

    background_count = np.cumsum(counts)
    background_sum = np.cumsum(
        counts * centers
    )

    total_sum = float(background_sum[-1])
    object_count = total - background_count
    object_sum = total_sum - background_sum

    valid = (
        (background_count > 0)
        & (object_count > 0)
    )

    if not np.any(valid):
        return _f20_otsu_threshold_from_histogram(
            counts,
            maximum_od=maximum_od,
        )

    p_background = np.zeros_like(centers)
    p_object = np.zeros_like(centers)
    mu_background = np.zeros_like(centers)
    mu_object = np.zeros_like(centers)

    p_background[valid] = (
        background_count[valid] / total
    )
    p_object[valid] = (
        object_count[valid] / total
    )

    mu_background[valid] = (
        background_sum[valid]
        / background_count[valid]
    )
    mu_object[valid] = (
        object_sum[valid]
        / object_count[valid]
    )

    score = np.full_like(
        centers,
        -np.inf,
    )

    score[valid] = (
        p_object[valid]
        * np.square(mu_object[valid])
        + np.power(
            p_background[valid],
            1.0 + float(delta),
        )
        * np.square(mu_background[valid])
    )

    best_index = int(np.argmax(score))
    return float(centers[best_index])


def _f22_threshold_from_histogram(
    histogram: np.ndarray,
    params: dict[str, Any],
) -> tuple[float, str]:
    mode = str(params["thresholdMode"])

    if mode == "auto_otsu":
        return (
            float(
                _f20_otsu_threshold_from_histogram(
                    histogram,
                    maximum_od=float(
                        params["maximumOd"]
                    ),
                )
            ),
            "otsu-dab-optical-density-v1",
        )

    if mode == "auto_wov":
        return (
            float(
                _f22_weighted_object_variance_threshold(
                    histogram,
                    maximum_od=float(
                        params["maximumOd"]
                    ),
                    delta=float(
                        params["wovDelta"]
                    ),
                )
            ),
            "weighted-object-variance-dab-optical-density-v1",
        )

    return (
        float(params["thresholdOd"]),
        "manual-dab-optical-density-v1",
    )


def _f22_dab_concentration(
    rgb: np.ndarray,
    *,
    inverse: np.ndarray,
    dab_index: int,
    maximum_od: float,
    sigma_px: float,
) -> np.ndarray:
    optical_density = -np.log(
        np.clip(
            (
                np.asarray(
                    rgb,
                    dtype=np.float32,
                )
                + 1.0
            )
            / 256.0,
            1e-6,
            1.0,
        )
    )

    concentrations = optical_density @ inverse

    dab = np.clip(
        concentrations[..., int(dab_index)],
        0.0,
        float(maximum_od),
    ).astype(
        np.float32,
        copy=False,
    )

    if sigma_px > 0:
        try:
            import cv2
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Gaussian H-DAB smoothing requires "
                    "opencv-python-headless"
                ),
            ) from exc

        dab = cv2.GaussianBlur(
            dab,
            (0, 0),
            sigmaX=float(sigma_px),
            sigmaY=float(sigma_px),
            borderType=cv2.BORDER_REPLICATE,
        )

    return dab


def _f22_read_dab_tile(
    slide: Any,
    *,
    tile_x: int,
    tile_y: int,
    tile_width: int,
    tile_height: int,
    full_width: int,
    full_height: int,
    inverse: np.ndarray,
    dab_index: int,
    maximum_od: float,
    sigma_px: float,
) -> np.ndarray:
    if sigma_px <= 0:
        image = slide.read_region(
            (int(tile_x), int(tile_y)),
            0,
            (int(tile_width), int(tile_height)),
        ).convert("RGB")

        return _f22_dab_concentration(
            np.asarray(
                image,
                dtype=np.float32,
            ),
            inverse=inverse,
            dab_index=dab_index,
            maximum_od=maximum_od,
            sigma_px=0.0,
        )

    pad = int(
        min(
            192,
            max(
                1,
                np.ceil(
                    3.0 * float(sigma_px)
                ),
            ),
        )
    )

    read_x = max(0, int(tile_x) - pad)
    read_y = max(0, int(tile_y) - pad)

    read_x2 = min(
        int(full_width),
        int(tile_x) + int(tile_width) + pad,
    )
    read_y2 = min(
        int(full_height),
        int(tile_y) + int(tile_height) + pad,
    )

    read_width = max(1, read_x2 - read_x)
    read_height = max(1, read_y2 - read_y)

    image = slide.read_region(
        (int(read_x), int(read_y)),
        0,
        (int(read_width), int(read_height)),
    ).convert("RGB")

    dab = _f22_dab_concentration(
        np.asarray(
            image,
            dtype=np.float32,
        ),
        inverse=inverse,
        dab_index=dab_index,
        maximum_od=maximum_od,
        sigma_px=float(sigma_px),
    )

    offset_x = int(tile_x - read_x)
    offset_y = int(tile_y - read_y)

    return dab[
        offset_y:offset_y + int(tile_height),
        offset_x:offset_x + int(tile_width),
    ]


def _f22_prepare_slide(
    image_id: str,
) -> tuple[
    Any,
    str,
    str,
    int,
    int,
    np.ndarray,
    int,
]:
    path, relative = safe_image_path(image_id)

    image_types = _read_image_types()
    image_type = str(
        image_types.get(relative, "he")
        or "he"
    ).strip().lower()

    if image_type != "hdab":
        raise HTTPException(
            status_code=422,
            detail=(
                "Quantitative H-DAB analysis is only "
                "available when Image type is Brightfield H-DAB"
            ),
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

    if not hasattr(slide, "read_region"):
        raise HTTPException(
            status_code=422,
            detail=(
                "Quantitative H-DAB analysis requires "
                "native read_region support"
            ),
        )

    full_width, full_height = map(
        int,
        slide.dimensions,
    )

    matrix, names = _stain_matrix("hdab")
    inverse = np.linalg.inv(matrix)
    dab_index = int(names["dab"])

    return (
        slide,
        relative,
        image_type,
        full_width,
        full_height,
        inverse,
        dab_index,
    )


def _f22_collection(
    payload: dict[str, Any],
) -> dict[str, Any]:
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
    return collection


def _f22_tile_bounds(
    valid_geometry: Any,
    *,
    tile_size: int,
    full_width: int,
    full_height: int,
) -> tuple[int, int, int, int]:
    from math import ceil, floor

    min_x, min_y, max_x, max_y = (
        valid_geometry.bounds
    )

    start_x = max(
        0,
        int(
            floor(min_x / tile_size)
            * tile_size
        ),
    )
    start_y = max(
        0,
        int(
            floor(min_y / tile_size)
            * tile_size
        ),
    )
    stop_x = min(
        int(full_width),
        int(
            ceil(max_x / tile_size)
            * tile_size
        ),
    )
    stop_y = min(
        int(full_height),
        int(
            ceil(max_y / tile_size)
            * tile_size
        ),
    )

    return start_x, start_y, stop_x, stop_y


def _f22_safe_tile_geometry(
    valid_geometry: Any,
    tile_box: Any,
) -> Any:
    try:
        return (
            _polygonal_only(
                valid_geometry.intersection(
                    tile_box
                )
            )
            or GeometryCollection()
        )
    except Exception:
        repaired = make_valid(valid_geometry)
        return (
            _polygonal_only(
                repaired.intersection(
                    tile_box
                )
            )
            or GeometryCollection()
        )


def _f22_histogram_pass(
    slide: Any,
    valid_geometry: Any,
    *,
    full_width: int,
    full_height: int,
    inverse: np.ndarray,
    dab_index: int,
    params: dict[str, Any],
) -> dict[str, Any]:
    tile_size = int(params["tileSize"])
    histogram_bins = int(
        params["histogramBins"]
    )
    maximum_od = float(params["maximumOd"])
    sigma_px = float(
        params["smoothingSigmaPx"]
    )

    histogram = np.zeros(
        histogram_bins,
        dtype=np.int64,
    )

    valid_pixel_count = 0
    dab_sum = 0.0
    tiles_planned = 0
    tiles_processed = 0
    tiles_skipped = 0

    (
        start_x,
        start_y,
        stop_x,
        stop_y,
    ) = _f22_tile_bounds(
        valid_geometry,
        tile_size=tile_size,
        full_width=full_width,
        full_height=full_height,
    )

    for tile_y in range(
        start_y,
        stop_y,
        tile_size,
    ):
        tile_height = min(
            tile_size,
            full_height - tile_y,
        )
        if tile_height <= 0:
            continue

        for tile_x in range(
            start_x,
            stop_x,
            tile_size,
        ):
            tile_width = min(
                tile_size,
                full_width - tile_x,
            )
            if tile_width <= 0:
                continue

            tiles_planned += 1

            tile_box = box(
                float(tile_x),
                float(tile_y),
                float(tile_x + tile_width),
                float(tile_y + tile_height),
            )

            if not valid_geometry.intersects(
                tile_box
            ):
                tiles_skipped += 1
                continue

            tile_geometry = (
                _f22_safe_tile_geometry(
                    valid_geometry,
                    tile_box,
                )
            )

            if tile_geometry.is_empty:
                tiles_skipped += 1
                continue

            valid_mask = (
                _f11_geometry_mask_window(
                    tile_geometry,
                    origin_x=tile_x,
                    origin_y=tile_y,
                    width=tile_width,
                    height=tile_height,
                )
            )

            if not np.any(valid_mask):
                tiles_skipped += 1
                continue

            dab = _f22_read_dab_tile(
                slide,
                tile_x=tile_x,
                tile_y=tile_y,
                tile_width=tile_width,
                tile_height=tile_height,
                full_width=full_width,
                full_height=full_height,
                inverse=inverse,
                dab_index=dab_index,
                maximum_od=maximum_od,
                sigma_px=sigma_px,
            )

            values = dab[valid_mask]

            if values.size < 1:
                tiles_skipped += 1
                continue

            local_histogram, _edges = np.histogram(
                values,
                bins=histogram_bins,
                range=(0.0, maximum_od),
            )

            histogram += local_histogram.astype(
                np.int64,
                copy=False,
            )

            valid_pixel_count += int(
                values.size
            )
            dab_sum += float(
                np.sum(
                    values,
                    dtype=np.float64,
                )
            )
            tiles_processed += 1

    if valid_pixel_count < 1:
        raise HTTPException(
            status_code=422,
            detail=(
                "No valid H-DAB tissue pixels remained "
                "after ROI/exclusion masks"
            ),
        )

    return {
        "histogram": histogram,
        "validPixels": int(valid_pixel_count),
        "dabSum": float(dab_sum),
        "tiles": {
            "planned": int(tiles_planned),
            "processed": int(tiles_processed),
            "skipped": int(tiles_skipped),
        },
    }


def _f22_polygon_parts(
    geometry: Any,
) -> list[Any]:
    if geometry is None or geometry.is_empty:
        return []

    if not geometry.is_valid:
        geometry = make_valid(geometry)

    geometry = (
        _polygonal_only(geometry)
        or GeometryCollection()
    )

    return [
        part
        for part in _il1_polygon_parts(
            geometry
        )
        if (
            not part.is_empty
            and part.area > 0
        )
    ]


def _f22_package_parts(
    parts: list[Any],
    *,
    spatial_group_size_px: int = 2048,
) -> list[dict[str, Any]]:
    spatial_groups: dict[
        tuple[int, int],
        list[Any],
    ] = {}

    for part in parts:
        if (
            part is None
            or part.is_empty
            or part.area <= 0
        ):
            continue

        min_x, min_y, max_x, max_y = (
            part.bounds
        )

        center_x = (
            float(min_x)
            + float(max_x)
        ) * 0.5
        center_y = (
            float(min_y)
            + float(max_y)
        ) * 0.5

        key = (
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
            key,
            [],
        ).append(part)

    detections: list[
        dict[str, Any]
    ] = []

    for index, key in enumerate(
        sorted(
            spatial_groups.keys(),
            key=lambda item: (
                item[1],
                item[0],
            ),
        ),
        start=1,
    ):
        group = spatial_groups[key]

        geometry = (
            group[0]
            if len(group) == 1
            else unary_union(group)
        )

        if (
            not geometry.is_empty
            and not geometry.is_valid
        ):
            geometry = make_valid(geometry)

        geometry = (
            _polygonal_only(geometry)
            or GeometryCollection()
        )

        if geometry.is_empty:
            continue

        detections.append(
            {
                "id":
                    f"hdab-positive-group-{index}",
                "geometry":
                    mapping(geometry),
                "areaPx2":
                    float(geometry.area),
                "spatialGroup": {
                    "column": int(key[0]),
                    "row": int(key[1]),
                    "sizePx": int(
                        spatial_group_size_px
                    ),
                },
            }
        )

    return detections


__all__ = ['_f20_hdab_valid_geometry', '_f20_otsu_threshold_from_histogram', '_f22_float', '_f22_parameters', '_f22_weighted_object_variance_threshold', '_f22_threshold_from_histogram', '_f22_dab_concentration', '_f22_read_dab_tile', '_f22_prepare_slide', '_f22_collection', '_f22_tile_bounds', '_f22_safe_tile_geometry', '_f22_histogram_pass', '_f22_polygon_parts', '_f22_package_parts']
