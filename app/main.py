from __future__ import annotations
from datetime import datetime, timezone

import base64
import errno
import hashlib
import io
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Iterator

import qrcode
import openslide
import numpy as np
import cv2
from sklearn.ensemble import ExtraTreesClassifier
from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from openslide import ImageSlide, OpenSlide
from openslide.deepzoom import DeepZoomGenerator
from PIL import Image, ImageDraw, UnidentifiedImageError
from shapely.geometry import GeometryCollection, LineString, MultiPolygon, Polygon, mapping, shape, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.validation import make_valid

# Shared backend runtime/configuration extracted from main.py.
if __package__:
    from .core.runtime import *
else:
    from core.runtime import *



app = FastAPI(title=APP_TITLE, docs_url="/api/docs", redoc_url=None)

# Allow the installed Capacitor Android client to communicate with
# the HistoAnnotator API. Capacitor serves its Android WebView from
# http://localhost by default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "https://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")

# Backend domain/service modules. Star imports are intentional compatibility
# facades during the incremental refactor: existing callers and characterization
# tests continue to resolve the historic main.py symbols unchanged.
if __package__:
    from .imaging.service import *
    from .analysis.common import *
    from .analysis.tissue import *
    from .analysis.geometry_routes import *
    from .analysis.statistics import *
    from .learning.service import *
    from .analysis.anthracosis import *
    from .analysis.hdab import *

    from .imaging.service import router as _imaging_router
    from .analysis.geometry_routes import router as _geometry_router
    from .analysis.statistics import router as _statistics_router
    from .learning.service import (
        capabilities_router as _learning_capabilities_router,
        suggest_router as _learning_suggest_router,
    )
    from .analysis.anthracosis import router as _anthracosis_router
else:
    from imaging.service import *
    from analysis.common import *
    from analysis.tissue import *
    from analysis.geometry_routes import *
    from analysis.statistics import *
    from learning.service import *
    from analysis.anthracosis import *
    from analysis.hdab import *

    from imaging.service import router as _imaging_router
    from analysis.geometry_routes import router as _geometry_router
    from analysis.statistics import router as _statistics_router
    from learning.service import (
        capabilities_router as _learning_capabilities_router,
        suggest_router as _learning_suggest_router,
    )
    from analysis.anthracosis import router as _anthracosis_router




# Annotation storage lives in app/storage/annotations.py.  Keep the historic
# main.py helper names as compatibility facades because scientific, Batch, and
# Interactive Learning code still call them directly during this incremental
# refactor.
if __package__:
    from .storage.annotations import (
        annotation_files as _storage_annotation_files,
        annotation_path as _storage_annotation_path,
        create_annotation_document as _storage_create_annotation_document,
        delete_annotation_document as _storage_delete_annotation_document,
        empty_feature_collection,
        normalize_annotation_file,
        read_annotation_document as _storage_read_annotation_document,
        save_annotation_document as _storage_save_annotation_document,
    )
else:
    from storage.annotations import (
        annotation_files as _storage_annotation_files,
        annotation_path as _storage_annotation_path,
        create_annotation_document as _storage_create_annotation_document,
        delete_annotation_document as _storage_delete_annotation_document,
        empty_feature_collection,
        normalize_annotation_file,
        read_annotation_document as _storage_read_annotation_document,
        save_annotation_document as _storage_save_annotation_document,
    )


def annotation_path(relative: str, annotation_file: str = "Default") -> Path:
    return _storage_annotation_path(
        ANNOTATION_ROOT,
        relative,
        annotation_file,
    )


def annotation_files(relative: str) -> list[str]:
    return _storage_annotation_files(
        ANNOTATION_ROOT,
        relative,
    )




# GeoJSON / QuPath domain functions live in app/domain/geojson.py.
# They are imported with their existing names so all current internal callers,
# external behavior, and characterization tests keep the same API surface.
#
# HistoAnnotator runs in two supported import modes:
#   Docker:  uvicorn main:app       (__package__ is empty)
#   Desktop: from app.main import app (__package__ == "app")
if __package__:
    from .domain.geojson import (
        _coordinates_are_finite,
        _normalize_rgb,
        _orient_polygonal,
        _polygonal_only,
        _qupath_properties,
        _rgb_from_color_rgb,
        _rgb_from_hex,
        _sanitize_area_geometry,
        normalize_geojson,
        sanitize_qupath_feature_collection,
    )
else:
    from domain.geojson import (
        _coordinates_are_finite,
        _normalize_rgb,
        _orient_polygonal,
        _polygonal_only,
        _qupath_properties,
        _rgb_from_color_rgb,
        _rgb_from_hex,
        _sanitize_area_geometry,
        normalize_geojson,
        sanitize_qupath_feature_collection,
    )


@app.get("/health/live")
def health_live() -> dict[str, Any]:
    return {"status": "ok", "version": "1.4.0-dev-F2.6.2"}


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": "1.2.0",
        "imageRoot": str(IMAGE_ROOT),
        "imageRootExists": IMAGE_ROOT.exists(),
        "imageRootWritable": os.access(IMAGE_ROOT, os.W_OK),
        "annotationRoot": str(ANNOTATION_ROOT),
        "preparedRoot": str(PREPARED_ROOT),
        "preparedRootExists": PREPARED_ROOT.exists(),
        "uploadRoot": str(UPLOAD_ROOT),
        "prepareThresholdMB": PREPARE_THRESHOLD_MB,
        "tileSize": TILE_SIZE,
        "tileJpegQuality": TILE_JPEG_QUALITY,
        "maxUploadGB": MAX_UPLOAD_GB,
        "vipsAvailable": shutil.which("vips") is not None,
    }


@app.get("/api/classes")
def get_classes() -> dict[str, Any]:
    return {"classes": load_classes()}


@app.put("/api/classes")
def put_classes(payload: Any = Body(...)) -> dict[str, Any]:
    classes = validate_classes(payload)
    atomic_write_json(CLASSES_PATH, {"classes": classes, "updatedAtUnix": int(time.time())})
    return {"saved": True, "classes": classes}

app.include_router(_imaging_router)




# ============================================================
# Scientific multichannel fluorescence display
# ============================================================






@app.post("/api/images/{image_id}/detect-tissue")
def detect_tissue(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    # Fast reduced-resolution ROI helper; output is level-0 geometry.
    sensitivity = max(
        0.0,
        min(
            100.0,
            float(payload.get("sensitivity", 50)),
        ),
    )

    smoothing = max(
        0.0,
        min(
            100.0,
            float(payload.get("smoothing", 45)),
        ),
    )

    min_island_pct = max(
        0.0,
        min(
            5.0,
            float(payload.get("minIslandPct", 0.05)),
        ),
    )

    fill_holes = bool(
        payload.get("fillHoles", True)
    )

    max_size = max(
        1024,
        min(
            4096,
            int(payload.get("maxSize", 2048)),
        ),
    )

    thumbnail, source_width, source_height = (
        _tissue_thumbnail(
            image_id,
            max_size,
        )
    )

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

    rgb = np.asarray(
        thumbnail,
        dtype=np.uint8,
    )

    if (
        rgb.ndim != 3
        or rgb.shape[2] < 3
    ):
        raise HTTPException(
            status_code=422,
            detail="The image could not be converted to RGB",
        )

    gray = cv2.cvtColor(
        rgb,
        cv2.COLOR_RGB2GRAY,
    )

    hsv = cv2.cvtColor(
        rgb,
        cv2.COLOR_RGB2HSV,
    )

    saturation = hsv[:, :, 1].astype(
        np.float32
    )

    darkness = (
        255.0
        - gray.astype(np.float32)
    )

    score = np.clip(
        darkness
        + 0.55 * saturation,
        0,
        255,
    ).astype(np.uint8)

    otsu_threshold, _ = cv2.threshold(
        score,
        0,
        255,
        cv2.THRESH_BINARY
        + cv2.THRESH_OTSU,
    )

    threshold = float(
        np.clip(
            otsu_threshold
            - (sensitivity - 50.0) * 0.65,
            8.0,
            245.0,
        )
    )

    mask = (
        score >= threshold
    ).astype(np.uint8) * 255

    kernel_radius = max(
        1,
        int(round(1 + smoothing / 16.0)),
    )

    kernel_size = kernel_radius * 2 + 1

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size),
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        kernel,
    )

    opening_kernel_size = max(
        3,
        max(1, kernel_radius // 2) * 2 + 1,
    )

    opening_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (
            opening_kernel_size,
            opening_kernel_size,
        ),
    )

    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        opening_kernel,
    )

    component_count, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            mask,
            connectivity=8,
        )
    )

    clean = np.zeros_like(mask)

    minimum_component_area = max(
        4,
        int(
            rgb.shape[0]
            * rgb.shape[1]
            * (min_island_pct / 100.0)
        ),
    )

    for label in range(
        1,
        component_count,
    ):
        area = int(
            stats[label, cv2.CC_STAT_AREA]
        )

        if area >= minimum_component_area:
            clean[labels == label] = 255

    geometry = _tissue_mask_to_geometry(
        clean,
        source_width,
        source_height,
        fill_holes=fill_holes,
        min_island_fraction=(
            min_island_pct / 100.0
        ),
        smoothing=smoothing,
    )

    if geometry is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "No tissue area was detected. "
                "Try increasing Sensitivity or decreasing Minimum tissue."
            ),
        )

    detected_pixels = int(
        np.count_nonzero(clean)
    )

    total_pixels = max(
        1,
        int(clean.size),
    )

    return {
        "geometry": geometry,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "previewWidth": int(rgb.shape[1]),
        "previewHeight": int(rgb.shape[0]),
        "detectedFraction": (
            detected_pixels / total_pixels
        ),
        "detector": {
            "name": "thumbnail-color-v1",
            "sensitivity": sensitivity,
            "smoothing": smoothing,
            "minIslandPct": min_island_pct,
            "fillHoles": fill_holes,
            "maxSize": max_size,
            "otsuThreshold": float(otsu_threshold),
            "effectiveThreshold": threshold,
        },
    }



@app.post("/api/geometry/tissue-roi-preview")
def tissue_roi_preview(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    geometry = _polygonal_geometry(payload.get("geometry"))

    if geometry.is_empty:
        raise HTTPException(
            status_code=422,
            detail="Tissue ROI geometry is empty",
        )

    requested_percent = max(
        0.0,
        min(
            50.0,
            float(
                payload.get(
                    "externalBorderExclusionPct",
                    0,
                )
                or 0
            ),
        ),
    )

    effective, actual_percent, width_px = (
        _stats_exclude_external_border(
            geometry,
            requested_percent,
        )
    )

    if effective.is_empty:
        raise HTTPException(
            status_code=422,
            detail="External border exclusion removed the complete Tissue ROI",
        )

    return {
        "geometry": _geometry_json(effective),
        "originalAreaPx2": float(geometry.area),
        "effectiveAreaPx2": float(effective.area),
        "requestedPercent": float(requested_percent),
        "actualPercent": float(actual_percent),
        "widthPx": float(width_px),
    }

app.include_router(_geometry_router)
app.include_router(_statistics_router)





@app.get("/api/annotations/{image_id}/files")
def get_annotation_files(image_id: str) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    return {"files": annotation_files(relative)}


@app.post("/api/annotations/{image_id}/files")
def create_annotation_file(image_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(str(payload.get("name") or ""))
    if name.casefold() == "default":
        return {"created": False, "name": "Default", "files": annotation_files(relative)}
    _storage_create_annotation_document(
        ANNOTATION_ROOT,
        relative,
        name,
        atomic_write_json,
    )
    return {"created": True, "name": name, "files": annotation_files(relative)}


@app.delete("/api/annotations/{image_id}/files")
def delete_annotation_file(
    image_id: str,
    file: str = Query(...),
) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)
    deleted = _storage_delete_annotation_document(
        ANNOTATION_ROOT,
        relative,
        name,
    )
    return {
        "deleted": deleted,
        "name": name,
        "files": annotation_files(relative),
    }


@app.get("/api/annotations/{image_id}")
def get_annotations(image_id: str, file: str = Query("Default")) -> JSONResponse:
    _, relative = safe_image_path(image_id)
    payload = _storage_read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        file,
        error_prefix="Could not read GeoJSON",
    )
    return JSONResponse(payload)


@app.put("/api/annotations/{image_id}")
def put_annotations(
    image_id: str,
    payload: dict[str, Any] = Body(...),
    file: str = Query("Default"),
    compact: bool = Query(False),
) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)
    normalized, report = sanitize_qupath_feature_collection(payload)

    # Phase F2.6.2: compact acknowledgement is safe only when the exact
    # normalized server document equals the submitted client document.
    # Any normalization difference falls back to the full response.
    normalized_changed = normalized != payload

    destination = _storage_save_annotation_document(
        ANNOTATION_ROOT,
        relative,
        name,
        normalized,
        atomic_write_json,
    )

    response: dict[str, Any] = {
        "saved": True,
        "features": len(normalized.get("features", [])),
        "annotationFile": name,
        "relativePath": str(destination.relative_to(ANNOTATION_ROOT)),
        "report": report,
        "compactAck": bool(compact and not normalized_changed),
        "normalizedChanged": bool(normalized_changed),
    }

    if not compact or normalized_changed:
        response["featureCollection"] = normalized

    return response


@app.get("/api/annotations/{image_id}/download")
def download_annotations(image_id: str, file: str = Query("Default")) -> Response:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)
    suffix = "" if name.casefold() == "default" else f".{name}"
    filename = f"{Path(relative).name}{suffix}.geojson"
    collection = _storage_read_annotation_document(
        ANNOTATION_ROOT,
        relative,
        name,
        error_prefix="Could not read annotation file",
    )
    collection, _report = sanitize_qupath_feature_collection(collection)
    body = json.dumps(collection, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    return Response(body, media_type="application/geo+json", headers={"Content-Disposition": f'attachment; filename="{filename}"'})



# ========================================================================
# Phase G1 — pairing, annotation-file copy, image bounds
# Desktop/Web renders a QR containing only the user-visible HistoAnnotator
# server URL. Android already knows how to scan that URL and test /api/images.
# No deployment address is hard-coded here.
# ========================================================================

@app.get("/api/pairing/qr.png")
def pairing_qr_png(server: str = Query(...)) -> Response:
    value = str(server or "").strip().rstrip("/")

    if (
        not value
        or len(value) > 512
        or re.match(r"^https?://", value, flags=re.IGNORECASE) is None
    ):
        raise HTTPException(
            status_code=422,
            detail="Pairing address must be an http:// or https:// URL",
        )

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(value)
    qr.make(fit=True)

    image = qr.make_image(
        fill_color="black",
        back_color="white",
    )

    stream = BytesIO()
    image.save(stream, format="PNG")

    return Response(
        stream.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )

app.include_router(_learning_capabilities_router)
app.include_router(_anthracosis_router)
app.include_router(_learning_suggest_router)




# ============================================================================
# Phase IL1 — interactive learning foundation
#
# Exploratory appearance model:
# - positives: current annotations of the target class
# - negatives: other biological annotations when available, otherwise
#   unlabeled valid tissue
# - features: RGB + optical density + saturation + darkness + local gradient
# - classifier: standardized diagonal-distance two-centroid model
# - inference: reduced-resolution thumbnail only
#
# Suggestions are transient. This endpoint never writes annotation files.
# ============================================================================




@app.get("/service-worker.js")
def service_worker() -> FileResponse:
    return FileResponse(
        Path(__file__).parent / "static" / "service-worker.js",
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-store"},
    )


@app.get("/", response_class=HTMLResponse)
def index() -> FileResponse:
    return FileResponse(Path(__file__).parent / "static" / "index.html", headers={"Cache-Control": "no-store"})

# ======================================================================
# Phase F2.0 — Quantitative H-DAB analysis
#
# Non-destructive native-resolution pixel quantification:
# Tissue ROI -> external border exclusion -> Artifact exclusion ->
# Anthracosis exclusion -> H/DAB optical-density deconvolution.
#
# No Positive/Negative GeoJSON is generated in F2.0.
# ======================================================================



@app.post(
    "/api/images/{image_id}/analyze-hdab"
)
def analyze_hdab_quantitative(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    from math import ceil, floor

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

    threshold_mode = str(
        payload.get(
            "thresholdMode",
            "auto",
        )
        or "auto"
    ).strip().lower()

    if threshold_mode not in {
        "auto",
        "manual",
    }:
        raise HTTPException(
            status_code=422,
            detail=(
                "thresholdMode must be auto or manual"
            ),
        )

    try:
        requested_threshold_od = float(
            payload.get(
                "thresholdOd",
                0.30,
            )
            or 0.30
        )
    except (TypeError, ValueError):
        requested_threshold_od = 0.30

    requested_threshold_od = max(
        0.0,
        min(
            6.0,
            requested_threshold_od,
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

    histogram_bins = 4096
    maximum_od = 6.0

    path, relative = safe_image_path(
        image_id
    )

    image_types = _read_image_types()
    image_type = str(
        image_types.get(
            relative,
            "he",
        )
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

    handle = get_slide(
        render_path
    )
    slide = handle.slide

    if not hasattr(
        slide,
        "read_region",
    ):
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

    (
        valid_geometry,
        geometry_report,
    ) = _f20_hdab_valid_geometry(
        collection,
        full_width=full_width,
        full_height=full_height,
    )

    matrix, names = _stain_matrix(
        "hdab"
    )
    inverse = np.linalg.inv(
        matrix
    )
    dab_index = int(
        names["dab"]
    )

    histogram = np.zeros(
        histogram_bins,
        dtype=np.int64,
    )

    valid_pixel_count = 0
    dab_sum = 0.0

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

    tiles_planned = 0
    tiles_processed = 0
    tiles_skipped = 0

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
                _polygonal_only(
                    valid_geometry.intersection(
                        tile_box
                    )
                )
                or GeometryCollection()
            )

            if tile_geometry.is_empty:
                tiles_skipped += 1
                continue

            tile_image = slide.read_region(
                (
                    int(tile_x),
                    int(tile_y),
                ),
                0,
                (
                    int(tile_width),
                    int(tile_height),
                ),
            ).convert("RGB")

            rgb = np.asarray(
                tile_image,
                dtype=np.float32,
            )

            valid_mask = (
                _f11_geometry_mask_window(
                    tile_geometry,
                    origin_x=tile_x,
                    origin_y=tile_y,
                    width=tile_width,
                    height=tile_height,
                )
            )

            if not np.any(
                valid_mask
            ):
                tiles_skipped += 1
                continue

            optical_density = -np.log(
                np.clip(
                    (rgb + 1.0)
                    / 256.0,
                    1e-6,
                    1.0,
                )
            )

            concentrations = (
                optical_density
                @ inverse
            )

            dab_concentration = np.clip(
                concentrations[
                    ...,
                    dab_index,
                ],
                0.0,
                maximum_od,
            )

            values = dab_concentration[
                valid_mask
            ]

            if values.size == 0:
                tiles_skipped += 1
                continue

            local_histogram, _edges = (
                np.histogram(
                    values,
                    bins=histogram_bins,
                    range=(
                        0.0,
                        maximum_od,
                    ),
                )
            )

            histogram += (
                local_histogram.astype(
                    np.int64,
                    copy=False,
                )
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

    if threshold_mode == "auto":
        threshold_od = (
            _f20_otsu_threshold_from_histogram(
                histogram,
                maximum_od=maximum_od,
            )
        )
        threshold_method = (
            "otsu-dab-optical-density-v1"
        )
    else:
        threshold_od = float(
            requested_threshold_od
        )
        threshold_method = (
            "manual-dab-optical-density-v1"
        )

    bin_centers = (
        (
            np.arange(
                histogram_bins,
                dtype=np.float64,
            )
            + 0.5
        )
        * (
            maximum_od
            / histogram_bins
        )
    )

    positive_pixel_count = int(
        np.sum(
            histogram[
                bin_centers
                >= threshold_od
            ]
        )
    )

    positive_pixel_count = max(
        0,
        min(
            valid_pixel_count,
            positive_pixel_count,
        ),
    )

    negative_pixel_count = (
        valid_pixel_count
        - positive_pixel_count
    )

    positive_percent = (
        100.0
        * positive_pixel_count
        / valid_pixel_count
    )

    negative_percent = (
        100.0
        - positive_percent
    )

    mean_dab_od = (
        dab_sum
        / valid_pixel_count
    )

    return {
        "method":
            "quantitative-hdab-native-v1",
        "threshold": {
            "mode":
                threshold_mode,
            "method":
                threshold_method,
            "dabOpticalDensity":
                float(threshold_od),
            "requestedDabOpticalDensity":
                float(requested_threshold_od),
            "histogramBins":
                int(histogram_bins),
            "maximumDabOpticalDensity":
                float(maximum_od),
        },
        "analysis": {
            "imageType":
                image_type,
            "analysisRegion":
                (
                    "Tissue ROI - External border "
                    "- Artifact - Anthracosis"
                ),
            "analysisResolution":
                "native-level-0",
            "tileSize":
                int(tile_size),
            "imageWidth":
                int(full_width),
            "imageHeight":
                int(full_height),
            **geometry_report,
        },
        "results": {
            "validPixels":
                int(valid_pixel_count),
            "validAreaPx2":
                float(valid_pixel_count),
            "positivePixels":
                int(positive_pixel_count),
            "positiveAreaPx2":
                float(positive_pixel_count),
            "negativePixels":
                int(negative_pixel_count),
            "negativeAreaPx2":
                float(negative_pixel_count),
            "positivePercent":
                float(positive_percent),
            "negativePercent":
                float(negative_percent),
            "meanDabOpticalDensity":
                float(mean_dab_od),
        },
        "tiles": {
            "planned":
                int(tiles_planned),
            "processed":
                int(tiles_processed),
            "skipped":
                int(tiles_skipped),
        },
        "stains": {
            "hematoxylin":
                STAIN_HEMATOXYLIN.astype(
                    float
                ).tolist(),
            "dab":
                STAIN_DAB.astype(
                    float
                ).tolist(),
        },
    }

# ======================================================================
# Phase F2.1 — H-DAB Positive preview + Accept
# ======================================================================

@app.post("/api/classes/ensure-positive")
def _f21_ensure_positive_class() -> dict[str, Any]:
    positive_default = {
        "name": "Positive",
        "color": "#ff6b6b",
    }

    with CONFIG_LOCK:
        try:
            stored: Any = json.loads(
                CLASSES_PATH.read_text(
                    encoding="utf-8"
                )
            )
        except (OSError, json.JSONDecodeError):
            stored = [
                dict(item)
                for item in DEFAULT_CLASSES
            ]

        payload_kind = "list"

        if isinstance(stored, list):
            class_items = stored
        elif isinstance(stored, dict):
            candidate = stored.get("classes")
            if isinstance(candidate, list):
                class_items = candidate
                payload_kind = "dict"
            else:
                class_items = [
                    dict(item)
                    for item in DEFAULT_CLASSES
                ]
                stored = {
                    **stored,
                    "classes": class_items,
                }
                payload_kind = "dict"
        else:
            class_items = [
                dict(item)
                for item in DEFAULT_CLASSES
            ]
            stored = class_items

        existing = None

        for item in class_items:
            if (
                isinstance(item, dict)
                and str(
                    item.get("name")
                    or ""
                ).strip().casefold()
                == "positive"
            ):
                existing = item
                break

        created = False

        if existing is None:
            existing = dict(
                positive_default
            )
            class_items.append(
                existing
            )
            created = True

            if payload_kind == "dict":
                stored["classes"] = class_items
            else:
                stored = class_items

            atomic_write_json(
                CLASSES_PATH,
                stored,
            )

        return {
            "class": {
                "name": str(
                    existing.get(
                        "name",
                        "Positive",
                    )
                    or "Positive"
                ),
                "color": str(
                    existing.get(
                        "color",
                        "#ff6b6b",
                    )
                    or "#ff6b6b"
                ),
            },
            "created": bool(created),
        }


@app.post(
    "/api/images/{image_id}/analyze-hdab-preview"
)
def analyze_hdab_positive_preview(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    from math import ceil, floor
    from shapely.affinity import translate as shapely_translate

    result = analyze_hdab_quantitative(
        image_id,
        payload,
    )

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

    threshold_od = float(
        result.get(
            "threshold",
            {},
        ).get(
            "dabOpticalDensity",
            0.0,
        )
        or 0.0
    )

    tile_size = int(
        result.get(
            "analysis",
            {},
        ).get(
            "tileSize",
            1024,
        )
        or 1024
    )

    tile_size = min(
        2048,
        max(
            512,
            tile_size,
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

    handle = get_slide(
        render_path
    )
    slide = handle.slide

    full_width, full_height = map(
        int,
        slide.dimensions,
    )

    valid_geometry, _geometry_report = (
        _f20_hdab_valid_geometry(
            collection,
            full_width=full_width,
            full_height=full_height,
        )
    )

    matrix, names = _stain_matrix(
        "hdab"
    )

    inverse = np.linalg.inv(
        matrix
    )

    dab_index = int(
        names["dab"]
    )

    maximum_od = float(
        result.get(
            "threshold",
            {},
        ).get(
            "maximumDabOpticalDensity",
            6.0,
        )
        or 6.0
    )

    min_x, min_y, max_x, max_y = (
        valid_geometry.bounds
    )

    start_x = max(
        0,
        int(
            floor(
                min_x / tile_size
            )
            * tile_size
        ),
    )
    start_y = max(
        0,
        int(
            floor(
                min_y / tile_size
            )
            * tile_size
        ),
    )
    stop_x = min(
        full_width,
        int(
            ceil(
                max_x / tile_size
            )
            * tile_size
        ),
    )
    stop_y = min(
        full_height,
        int(
            ceil(
                max_y / tile_size
            )
            * tile_size
        ),
    )

    spatial_group_size_px = 2048
    spatial_groups: dict[
        tuple[int, int],
        list[Any],
    ] = {}

    exact_positive_pixels = 0
    preview_tiles_processed = 0
    preview_tiles_skipped = 0
    vectorized_tiles = 0

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

            tile_box = box(
                float(tile_x),
                float(tile_y),
                float(tile_x + tile_width),
                float(tile_y + tile_height),
            )

            if not valid_geometry.intersects(
                tile_box
            ):
                preview_tiles_skipped += 1
                continue

            tile_geometry = (
                _polygonal_only(
                    valid_geometry.intersection(
                        tile_box
                    )
                )
                or GeometryCollection()
            )

            if tile_geometry.is_empty:
                preview_tiles_skipped += 1
                continue

            tile_image = slide.read_region(
                (
                    int(tile_x),
                    int(tile_y),
                ),
                0,
                (
                    int(tile_width),
                    int(tile_height),
                ),
            ).convert("RGB")

            rgb = np.asarray(
                tile_image,
                dtype=np.float32,
            )

            valid_mask = (
                _f11_geometry_mask_window(
                    tile_geometry,
                    origin_x=tile_x,
                    origin_y=tile_y,
                    width=tile_width,
                    height=tile_height,
                )
            )

            if not np.any(
                valid_mask
            ):
                preview_tiles_skipped += 1
                continue

            optical_density = -np.log(
                np.clip(
                    (rgb + 1.0)
                    / 256.0,
                    1e-6,
                    1.0,
                )
            )

            concentrations = (
                optical_density
                @ inverse
            )

            dab_concentration = np.clip(
                concentrations[
                    ...,
                    dab_index,
                ],
                0.0,
                maximum_od,
            )

            positive_mask = (
                valid_mask
                & (
                    dab_concentration
                    >= threshold_od
                )
            )

            local_positive_pixels = int(
                np.count_nonzero(
                    positive_mask
                )
            )

            exact_positive_pixels += (
                local_positive_pixels
            )

            preview_tiles_processed += 1

            if local_positive_pixels < 1:
                continue

            local_geometry = (
                _il1_mask_to_geometry(
                    positive_mask,
                    1.0,
                    1.0,
                )
            )

            if local_geometry.is_empty:
                continue

            global_geometry = (
                shapely_translate(
                    local_geometry,
                    xoff=float(tile_x),
                    yoff=float(tile_y),
                )
            )

            # F2.1.1:
            # positive_mask was already clipped to valid H-DAB tissue
            # before contour vectorization. A second vector/vector
            # intersection is redundant and can fail on sub-pixel contour
            # topology. Repair the contour geometry itself instead.
            if (
                not global_geometry.is_empty
                and not global_geometry.is_valid
            ):
                global_geometry = make_valid(
                    global_geometry
                )

            global_geometry = (
                _polygonal_only(
                    global_geometry
                )
                or GeometryCollection()
            )

            if global_geometry.is_empty:
                continue

            group_key = (
                int(
                    tile_x
                    // spatial_group_size_px
                ),
                int(
                    tile_y
                    // spatial_group_size_px
                ),
            )

            spatial_groups.setdefault(
                group_key,
                [],
            ).append(
                global_geometry
            )

            vectorized_tiles += 1

    detections: list[
        dict[str, Any]
    ] = []

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
        items = spatial_groups[
            group_key
        ]

        grouped_geometry = (
            items[0]
            if len(items) == 1
            else unary_union(items)
        )

        if (
            not grouped_geometry.is_empty
            and not grouped_geometry.is_valid
        ):
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

        detections.append(
            {
                "id":
                    f"hdab-positive-group-{feature_index}",
                "geometry":
                    mapping(
                        grouped_geometry
                    ),
                "areaPx2":
                    float(
                        grouped_geometry.area
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

    valid_pixels = int(
        result.get(
            "results",
            {},
        ).get(
            "validPixels",
            0,
        )
        or 0
    )

    exact_positive_pixels = max(
        0,
        min(
            valid_pixels,
            exact_positive_pixels,
        ),
    )

    exact_negative_pixels = (
        valid_pixels
        - exact_positive_pixels
    )

    exact_positive_percent = (
        100.0
        * exact_positive_pixels
        / valid_pixels
        if valid_pixels > 0
        else 0.0
    )

    exact_negative_percent = (
        100.0
        - exact_positive_percent
    )

    result["results"][
        "positivePixels"
    ] = int(
        exact_positive_pixels
    )
    result["results"][
        "positiveAreaPx2"
    ] = float(
        exact_positive_pixels
    )
    result["results"][
        "negativePixels"
    ] = int(
        exact_negative_pixels
    )
    result["results"][
        "negativeAreaPx2"
    ] = float(
        exact_negative_pixels
    )
    result["results"][
        "positivePercent"
    ] = float(
        exact_positive_percent
    )
    result["results"][
        "negativePercent"
    ] = float(
        exact_negative_percent
    )

    result["detections"] = (
        detections
    )

    result["preview"] = {
        "className":
            "Positive",
        "returnedFeatures":
            int(
                len(detections)
            ),
        "spatialGroupSizePx":
            int(
                spatial_group_size_px
            ),
        "tilesProcessed":
            int(
                preview_tiles_processed
            ),
        "tilesSkipped":
            int(
                preview_tiles_skipped
            ),
        "vectorizedTiles":
            int(
                vectorized_tiles
            ),
        "vectorization":
            "native-mask-contours-spatial-pack-v1",
        "geometryNote":
            (
                "Quantitative pixel counts are exact. "
                "Preview/accepted geometry is contour-vectorized "
                "for editable annotation display."
            ),
    }

    return result

# ======================================================================
# Phase F2.2 — Advanced quantitative H-DAB
#
# Adds:
# - Auto Otsu
# - Auto weighted object variance (WOV; delta -1..1)
# - Fixed/manual DAB optical-density threshold
# - Optional Gaussian smoothing in DAB-OD space
# - Optional minimum Positive object area
# - Fast current-view live preview for parameter tuning
#
# Full-slide valid mask remains:
# Tissue ROI - external border - Artifact - Anthracosis
# ======================================================================




@app.post(
    "/api/images/{image_id}/analyze-hdab-v2-preview"
)
def analyze_hdab_v2_preview(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    from shapely.affinity import (
        translate as shapely_translate,
    )

    collection = _f22_collection(payload)
    params = _f22_parameters(payload)

    (
        slide,
        _relative,
        image_type,
        full_width,
        full_height,
        inverse,
        dab_index,
    ) = _f22_prepare_slide(image_id)

    (
        valid_geometry,
        geometry_report,
    ) = _f20_hdab_valid_geometry(
        collection,
        full_width=full_width,
        full_height=full_height,
    )

    histogram_pass = _f22_histogram_pass(
        slide,
        valid_geometry,
        full_width=full_width,
        full_height=full_height,
        inverse=inverse,
        dab_index=dab_index,
        params=params,
    )

    threshold_od, threshold_method = (
        _f22_threshold_from_histogram(
            histogram_pass["histogram"],
            params,
        )
    )

    tile_size = int(params["tileSize"])
    maximum_od = float(params["maximumOd"])
    sigma_px = float(
        params["smoothingSigmaPx"]
    )

    valid_pixel_count = int(
        histogram_pass["validPixels"]
    )

    exact_raw_positive_pixels = 0
    raw_group_geometries: list[Any] = []
    preview_tiles_processed = 0
    preview_tiles_skipped = 0
    vectorized_tiles = 0
    spatial_group_size_px = 2048

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

            tile_box = box(
                float(tile_x),
                float(tile_y),
                float(tile_x + tile_width),
                float(tile_y + tile_height),
            )

            if not valid_geometry.intersects(
                tile_box
            ):
                preview_tiles_skipped += 1
                continue

            tile_geometry = (
                _f22_safe_tile_geometry(
                    valid_geometry,
                    tile_box,
                )
            )

            if tile_geometry.is_empty:
                preview_tiles_skipped += 1
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
                preview_tiles_skipped += 1
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

            positive_mask = (
                valid_mask
                & (
                    dab
                    >= float(threshold_od)
                )
            )

            local_positive_pixels = int(
                np.count_nonzero(
                    positive_mask
                )
            )
            exact_raw_positive_pixels += (
                local_positive_pixels
            )
            preview_tiles_processed += 1

            if local_positive_pixels < 1:
                continue

            local_geometry = _il1_mask_to_geometry(
                positive_mask,
                1.0,
                1.0,
                max_contours=250_000,
                fragmentation_detail=(
                    "H-DAB Positive mask is too fragmented to vectorize "
                    "safely at native resolution. The mask exceeded "
                    "250,000 contours in one tile. Increase Gaussian "
                    "smoothing or enable a minimum Positive-object area "
                    "filter."
                ),
            )

            if (
                local_geometry is None
                or local_geometry.is_empty
            ):
                continue

            global_geometry = shapely_translate(
                local_geometry,
                xoff=float(tile_x),
                yoff=float(tile_y),
            )

            if (
                not global_geometry.is_empty
                and not global_geometry.is_valid
            ):
                global_geometry = make_valid(
                    global_geometry
                )

            global_geometry = (
                _polygonal_only(
                    global_geometry
                )
                or GeometryCollection()
            )

            if global_geometry.is_empty:
                continue

            raw_group_geometries.append(
                global_geometry
            )
            vectorized_tiles += 1

    small_enabled = bool(
        params["smallObjectFilterEnabled"]
    )
    minimum_area_px2 = float(
        params["minimumObjectAreaPx2"]
    )

    objects_before = 0
    objects_after = 0
    removed_objects = 0
    removed_area_px2 = 0.0

    if raw_group_geometries:
        merged = (
            raw_group_geometries[0]
            if len(raw_group_geometries) == 1
            else unary_union(
                raw_group_geometries
            )
        )
        raw_parts = _f22_polygon_parts(
            merged
        )
    else:
        raw_parts = []

    objects_before = int(len(raw_parts))

    if (
        small_enabled
        and minimum_area_px2 > 0
    ):
        kept_parts = [
            part
            for part in raw_parts
            if float(part.area)
            >= minimum_area_px2
        ]
        removed_parts = [
            part
            for part in raw_parts
            if float(part.area)
            < minimum_area_px2
        ]

        objects_after = int(
            len(kept_parts)
        )
        removed_objects = int(
            len(removed_parts)
        )
        removed_area_px2 = float(
            sum(
                float(part.area)
                for part in removed_parts
            )
        )

        detections = _f22_package_parts(
            kept_parts,
            spatial_group_size_px=
                spatial_group_size_px,
        )

        filtered_positive_area_px2 = float(
            sum(
                float(part.area)
                for part in kept_parts
            )
        )

        positive_area_px2 = max(
            0.0,
            min(
                float(valid_pixel_count),
                filtered_positive_area_px2,
            ),
        )

        quantification_basis = (
            "vectorized-final-positive-mask-after-minimum-area-filter"
        )
    else:
        objects_after = objects_before
        detections = _f22_package_parts(
            raw_parts,
            spatial_group_size_px=
                spatial_group_size_px,
        )

        positive_area_px2 = float(
            max(
                0,
                min(
                    valid_pixel_count,
                    exact_raw_positive_pixels,
                ),
            )
        )

        quantification_basis = (
            "native-threshold-pixels"
        )

    negative_area_px2 = max(
        0.0,
        float(valid_pixel_count)
        - positive_area_px2,
    )

    positive_percent = (
        100.0
        * positive_area_px2
        / float(valid_pixel_count)
        if valid_pixel_count > 0
        else 0.0
    )
    negative_percent = (
        100.0 - positive_percent
    )

    mean_dab_od = (
        float(histogram_pass["dabSum"])
        / float(valid_pixel_count)
        if valid_pixel_count > 0
        else 0.0
    )

    return {
        "method":
            "quantitative-hdab-native-v2",
        "threshold": {
            "mode":
                str(params["thresholdMode"]),
            "method":
                threshold_method,
            "dabOpticalDensity":
                float(threshold_od),
            "requestedDabOpticalDensity":
                float(params["thresholdOd"]),
            "weightedObjectVarianceDelta":
                float(params["wovDelta"]),
            "histogramBins":
                int(params["histogramBins"]),
            "maximumDabOpticalDensity":
                float(maximum_od),
        },
        "processing": {
            "gaussianSmoothing": {
                "enabled":
                    bool(
                        params[
                            "smoothingEnabled"
                        ]
                    ),
                "sigma":
                    float(
                        params[
                            "smoothingSigma"
                        ]
                    ),
                "unit":
                    str(
                        params[
                            "smoothingUnit"
                        ]
                    ),
                "sigmaPx":
                    float(sigma_px),
                "space":
                    "DAB-optical-density",
            },
            "smallObjectFilter": {
                "enabled":
                    bool(small_enabled),
                "minimumArea":
                    float(
                        params[
                            "minimumObjectArea"
                        ]
                    ),
                "unit":
                    str(
                        params[
                            "minimumObjectAreaUnit"
                        ]
                    ),
                "minimumAreaPx2":
                    float(minimum_area_px2),
                "objectsBefore":
                    int(objects_before),
                "objectsAfter":
                    int(objects_after),
                "removedObjects":
                    int(removed_objects),
                "removedAreaPx2":
                    float(removed_area_px2),
            },
            "calibrationMpp":
                (
                    float(params["mpp"])
                    if float(params["mpp"]) > 0
                    else None
                ),
            "quantificationBasis":
                quantification_basis,
        },
        "analysis": {
            "imageType": image_type,
            "analysisRegion":
                (
                    "Tissue ROI - External border "
                    "- Artifact - Anthracosis"
                ),
            "analysisResolution":
                "native-level-0",
            "tileSize":
                int(tile_size),
            "imageWidth":
                int(full_width),
            "imageHeight":
                int(full_height),
            **geometry_report,
        },
        "results": {
            "validPixels":
                int(valid_pixel_count),
            "validAreaPx2":
                float(valid_pixel_count),
            "rawPositivePixels":
                int(
                    exact_raw_positive_pixels
                ),
            "positivePixels":
                int(
                    round(
                        positive_area_px2
                    )
                ),
            "positiveAreaPx2":
                float(
                    positive_area_px2
                ),
            "negativePixels":
                int(
                    round(
                        negative_area_px2
                    )
                ),
            "negativeAreaPx2":
                float(
                    negative_area_px2
                ),
            "positivePercent":
                float(positive_percent),
            "negativePercent":
                float(negative_percent),
            "meanDabOpticalDensity":
                float(mean_dab_od),
        },
        "tiles":
            histogram_pass["tiles"],
        "preview": {
            "className": "Positive",
            "returnedFeatures":
                int(len(detections)),
            "spatialGroupSizePx":
                int(
                    spatial_group_size_px
                ),
            "tilesProcessed":
                int(
                    preview_tiles_processed
                ),
            "tilesSkipped":
                int(
                    preview_tiles_skipped
                ),
            "vectorizedTiles":
                int(vectorized_tiles),
            "vectorization":
                "native-mask-contours-spatial-pack-v3",
            "maximumContoursPerTile":
                250_000,
            "interactiveLearningContourLimitApplied":
                False,
        },
        "detections": detections,
        "stains": {
            "hematoxylin":
                STAIN_HEMATOXYLIN.astype(
                    float
                ).tolist(),
            "dab":
                STAIN_DAB.astype(
                    float
                ).tolist(),
        },
    }


@app.post(
    "/api/images/{image_id}/analyze-hdab-live-preview"
)
def analyze_hdab_live_preview(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    from shapely.affinity import (
        translate as shapely_translate,
    )

    collection = _f22_collection(payload)
    params = _f22_parameters(payload)

    (
        slide,
        _relative,
        image_type,
        full_width,
        full_height,
        inverse,
        dab_index,
    ) = _f22_prepare_slide(image_id)

    (
        valid_geometry,
        _geometry_report,
    ) = _f20_hdab_valid_geometry(
        collection,
        full_width=full_width,
        full_height=full_height,
    )

    region = payload.get("region")
    if not isinstance(region, dict):
        raise HTTPException(
            status_code=422,
            detail=(
                "region is required for live preview"
            ),
        )

    x = _f22_float(
        region.get("x"),
        0.0,
        0.0,
        float(full_width),
    )
    y = _f22_float(
        region.get("y"),
        0.0,
        0.0,
        float(full_height),
    )
    width = _f22_float(
        region.get("width"),
        512.0,
        1.0,
        float(full_width),
    )
    height = _f22_float(
        region.get("height"),
        512.0,
        1.0,
        float(full_height),
    )

    max_side = 1536.0
    width = min(width, max_side)
    height = min(height, max_side)

    x = min(
        x,
        max(
            0.0,
            float(full_width) - width,
        ),
    )
    y = min(
        y,
        max(
            0.0,
            float(full_height) - height,
        ),
    )

    read_x = int(np.floor(x))
    read_y = int(np.floor(y))

    read_width = int(
        min(
            full_width - read_x,
            max(1, np.ceil(width)),
        )
    )
    read_height = int(
        min(
            full_height - read_y,
            max(1, np.ceil(height)),
        )
    )

    region_box = box(
        float(read_x),
        float(read_y),
        float(read_x + read_width),
        float(read_y + read_height),
    )

    region_geometry = _f22_safe_tile_geometry(
        valid_geometry,
        region_box,
    )

    if region_geometry.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Current live-preview region contains "
                "no valid H-DAB tissue"
            ),
        )

    valid_mask = _f11_geometry_mask_window(
        region_geometry,
        origin_x=read_x,
        origin_y=read_y,
        width=read_width,
        height=read_height,
    )

    if not np.any(valid_mask):
        raise HTTPException(
            status_code=422,
            detail=(
                "Current live-preview region contains "
                "no valid H-DAB pixels"
            ),
        )

    dab = _f22_read_dab_tile(
        slide,
        tile_x=read_x,
        tile_y=read_y,
        tile_width=read_width,
        tile_height=read_height,
        full_width=full_width,
        full_height=full_height,
        inverse=inverse,
        dab_index=dab_index,
        maximum_od=float(
            params["maximumOd"]
        ),
        sigma_px=float(
            params[
                "smoothingSigmaPx"
            ]
        ),
    )

    values = dab[valid_mask]

    histogram, _edges = np.histogram(
        values,
        bins=int(
            params["histogramBins"]
        ),
        range=(
            0.0,
            float(params["maximumOd"]),
        ),
    )

    threshold_od, threshold_method = (
        _f22_threshold_from_histogram(
            histogram,
            params,
        )
    )

    positive_mask = (
        valid_mask
        & (
            dab >= float(threshold_od)
        )
    )

    raw_positive_pixels = int(
        np.count_nonzero(
            positive_mask
        )
    )

    removed_objects = 0
    removed_pixels = 0

    if (
        bool(
            params[
                "smallObjectFilterEnabled"
            ]
        )
        and float(
            params[
                "minimumObjectAreaPx2"
            ]
        ) > 0
        and raw_positive_pixels > 0
    ):
        try:
            import cv2
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Small-object H-DAB filtering requires "
                    "opencv-python-headless"
                ),
            ) from exc

        (
            count,
            labels,
            stats,
            _centroids,
        ) = cv2.connectedComponentsWithStats(
            positive_mask.astype(
                np.uint8
            ),
            connectivity=8,
        )

        filtered = np.zeros_like(
            positive_mask,
            dtype=bool,
        )

        minimum_area = float(
            params[
                "minimumObjectAreaPx2"
            ]
        )

        for label in range(
            1,
            int(count),
        ):
            left = int(
                stats[
                    label,
                    cv2.CC_STAT_LEFT,
                ]
            )
            top = int(
                stats[
                    label,
                    cv2.CC_STAT_TOP,
                ]
            )
            component_width = int(
                stats[
                    label,
                    cv2.CC_STAT_WIDTH,
                ]
            )
            component_height = int(
                stats[
                    label,
                    cv2.CC_STAT_HEIGHT,
                ]
            )
            area = int(
                stats[
                    label,
                    cv2.CC_STAT_AREA,
                ]
            )

            touches_live_boundary = (
                left <= 0
                or top <= 0
                or (
                    left + component_width
                ) >= read_width
                or (
                    top + component_height
                ) >= read_height
            )

            if (
                area >= minimum_area
                or touches_live_boundary
            ):
                filtered[
                    labels == label
                ] = True
            else:
                removed_objects += 1
                removed_pixels += int(area)

        positive_mask = filtered

    final_positive_pixels = int(
        np.count_nonzero(
            positive_mask
        )
    )

    local_geometry = (
        _il1_mask_to_geometry(
            positive_mask,
            1.0,
            1.0,
            max_contours=250_000,
            fragmentation_detail=(
                "H-DAB live-preview mask is too fragmented to vectorize "
                "safely. The preview exceeded 250,000 contours. Increase "
                "Gaussian smoothing or enable a minimum Positive-object "
                "area filter."
            ),
        )
        if final_positive_pixels > 0
        else GeometryCollection()
    )

    if (
        local_geometry is not None
        and not local_geometry.is_empty
    ):
        geometry = shapely_translate(
            local_geometry,
            xoff=float(read_x),
            yoff=float(read_y),
        )

        if not geometry.is_valid:
            geometry = make_valid(
                geometry
            )

        geometry = (
            _polygonal_only(geometry)
            or GeometryCollection()
        )
    else:
        geometry = GeometryCollection()

    detections = (
        [
            {
                "id":
                    "hdab-live-positive",
                "geometry":
                    mapping(geometry),
                "areaPx2":
                    float(geometry.area),
            }
        ]
        if not geometry.is_empty
        else []
    )

    valid_pixels = int(
        np.count_nonzero(valid_mask)
    )
    negative_pixels = max(
        0,
        valid_pixels
        - final_positive_pixels,
    )

    positive_percent = (
        100.0
        * final_positive_pixels
        / valid_pixels
        if valid_pixels > 0
        else 0.0
    )

    return {
        "method":
            "quantitative-hdab-live-preview-v1",
        "threshold": {
            "mode":
                str(params["thresholdMode"]),
            "method":
                threshold_method,
            "dabOpticalDensity":
                float(threshold_od),
            "requestedDabOpticalDensity":
                float(params["thresholdOd"]),
            "weightedObjectVarianceDelta":
                float(params["wovDelta"]),
        },
        "processing": {
            "gaussianSmoothing": {
                "enabled":
                    bool(
                        params[
                            "smoothingEnabled"
                        ]
                    ),
                "sigma":
                    float(
                        params[
                            "smoothingSigma"
                        ]
                    ),
                "unit":
                    str(
                        params[
                            "smoothingUnit"
                        ]
                    ),
                "sigmaPx":
                    float(
                        params[
                            "smoothingSigmaPx"
                        ]
                    ),
            },
            "smallObjectFilter": {
                "enabled":
                    bool(
                        params[
                            "smallObjectFilterEnabled"
                        ]
                    ),
                "minimumArea":
                    float(
                        params[
                            "minimumObjectArea"
                        ]
                    ),
                "unit":
                    str(
                        params[
                            "minimumObjectAreaUnit"
                        ]
                    ),
                "minimumAreaPx2":
                    float(
                        params[
                            "minimumObjectAreaPx2"
                        ]
                    ),
                "removedObjects":
                    int(removed_objects),
                "removedPixels":
                    int(removed_pixels),
                "liveBoundaryObjectsPreserved":
                    True,
            },
            "calibrationMpp":
                (
                    float(params["mpp"])
                    if float(params["mpp"]) > 0
                    else None
                ),
        },
        "analysis": {
            "imageType": image_type,
            "analysisRegion":
                "current-view-live-preview",
            "analysisResolution":
                "native-level-0",
            "region": {
                "x": int(read_x),
                "y": int(read_y),
                "width": int(read_width),
                "height": int(read_height),
                "maxSidePx":
                    int(max_side),
            },
        },
        "results": {
            "validPixels":
                int(valid_pixels),
            "validAreaPx2":
                float(valid_pixels),
            "rawPositivePixels":
                int(raw_positive_pixels),
            "positivePixels":
                int(
                    final_positive_pixels
                ),
            "positiveAreaPx2":
                float(
                    final_positive_pixels
                ),
            "negativePixels":
                int(negative_pixels),
            "negativeAreaPx2":
                float(negative_pixels),
            "positivePercent":
                float(positive_percent),
            "negativePercent":
                float(
                    100.0
                    - positive_percent
                ),
            "meanDabOpticalDensity":
                float(
                    np.mean(
                        values,
                        dtype=np.float64,
                    )
                ),
        },
        "preview": {
            "className": "Positive",
            "returnedFeatures":
                int(len(detections)),
            "live": True,
        },
        "detections": detections,
    }

