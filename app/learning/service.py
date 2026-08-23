from __future__ import annotations

import hashlib
import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from fastapi import APIRouter, Body, HTTPException
from PIL import Image, ImageDraw
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

if __package__ and __package__.startswith("app."):
    from ..analysis.common import (
        _il1_feature_class, _il1_feature_role, _il1_mask_to_geometry,
        _il1_polygon_parts, _stats_exclude_external_border,
    )
    from ..core.runtime import ANNOTATION_ROOT, TILE_CACHE_ROOT, safe_image_path
    from ..domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from ..imaging.service import (
        _read_image_types, get_slide, preparation_required, read_ready_manifest,
        resolve_render_path, source_signature,
    )
    from ..storage.annotations import (
        annotation_path as _storage_annotation_path,
        empty_feature_collection,
        normalize_annotation_file,
    )
else:
    from analysis.common import (
        _il1_feature_class, _il1_feature_role, _il1_mask_to_geometry,
        _il1_polygon_parts, _stats_exclude_external_border,
    )
    from core.runtime import ANNOTATION_ROOT, TILE_CACHE_ROOT, safe_image_path
    from domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
    from imaging.service import (
        _read_image_types, get_slide, preparation_required, read_ready_manifest,
        resolve_render_path, source_signature,
    )
    from storage.annotations import (
        annotation_path as _storage_annotation_path,
        empty_feature_collection,
        normalize_annotation_file,
    )

capabilities_router = APIRouter()
suggest_router = APIRouter()


def annotation_path(relative: str, annotation_file: str = "Default") -> Path:
    return _storage_annotation_path(ANNOTATION_ROOT, relative, annotation_file)


def _il1_geometry_mask(
    geometry_payload: Any,
    width: int,
    height: int,
    scale_x: float,
    scale_y: float,
) -> np.ndarray:
    mask_image = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask_image)

    try:
        geometry = shape(geometry_payload)
    except Exception:
        return np.zeros((height, width), dtype=bool)

    def scaled_points(coords: Any) -> list[tuple[float, float]]:
        output: list[tuple[float, float]] = []
        for item in coords:
            try:
                x = float(item[0]) / scale_x
                y = float(item[1]) / scale_y
            except (
                TypeError,
                ValueError,
                IndexError,
                ZeroDivisionError,
            ):
                continue
            output.append((x, y))
        return output

    def paint_polygon(polygon: Polygon) -> None:
        exterior = scaled_points(polygon.exterior.coords)
        if len(exterior) >= 3:
            draw.polygon(exterior, fill=255)

        for interior in polygon.interiors:
            hole = scaled_points(interior.coords)
            if len(hole) >= 3:
                draw.polygon(hole, fill=0)

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

    return np.asarray(mask_image, dtype=np.uint8) > 0


def _il1_feature_cube(rgb: np.ndarray) -> np.ndarray:
    rgb_f = np.asarray(rgb, dtype=np.float32) / 255.0

    optical_density = -np.log(
        np.clip(
            (rgb_f * 255.0 + 1.0) / 256.0,
            1e-4,
            1.0,
        )
    )

    maximum = np.max(rgb_f, axis=2)
    minimum = np.min(rgb_f, axis=2)
    saturation = (
        (maximum - minimum)
        / np.maximum(maximum, 1e-4)
    )
    darkness = 1.0 - np.mean(rgb_f, axis=2)

    gray = np.mean(rgb_f, axis=2)
    dx = np.abs(
        np.diff(
            gray,
            axis=1,
            prepend=gray[:, :1],
        )
    )
    dy = np.abs(
        np.diff(
            gray,
            axis=0,
            prepend=gray[:1, :],
        )
    )
    gradient = np.clip(dx + dy, 0.0, 1.0)

    return np.dstack([
        rgb_f,
        optical_density,
        saturation,
        darkness,
        gradient,
    ]).astype(np.float32, copy=False)


def _il1_sample_features(
    feature_cube: np.ndarray,
    mask: np.ndarray,
    maximum: int,
    rng: np.random.Generator,
) -> np.ndarray:
    flat_indices = np.flatnonzero(mask.reshape(-1))

    if flat_indices.size == 0:
        return np.empty(
            (0, feature_cube.shape[2]),
            dtype=np.float32,
        )

    if flat_indices.size > maximum:
        flat_indices = rng.choice(
            flat_indices,
            size=maximum,
            replace=False,
        )

    flattened = feature_cube.reshape(
        -1,
        feature_cube.shape[2],
    )
    return flattened[flat_indices]


def _il1_majority_smooth(
    mask: np.ndarray,
    passes: int,
) -> np.ndarray:
    result = np.asarray(mask, dtype=bool)

    for _ in range(max(0, int(passes))):
        padded = np.pad(
            result.astype(np.uint8),
            1,
            mode="constant",
        )
        counts = np.zeros(
            result.shape,
            dtype=np.uint8,
        )

        for dy in range(3):
            for dx in range(3):
                counts += padded[
                    dy:dy + result.shape[0],
                    dx:dx + result.shape[1],
                ]

        result = counts >= 5

    return result


def _il2_feedback_items(
    payload: dict[str, Any],
    key: str,
) -> list[dict[str, Any]]:
    feedback = payload.get("feedback")
    if not isinstance(feedback, dict):
        return []

    items = feedback.get(key, [])
    if not isinstance(items, list):
        return []

    return [
        item
        for item in items
        if isinstance(item, dict)
    ]


def _il2_feedback_mask(
    items: list[dict[str, Any]],
    geometry_key: str,
    width: int,
    height: int,
    scale_x: float,
    scale_y: float,
) -> np.ndarray:
    result = np.zeros(
        (height, width),
        dtype=bool,
    )

    for item in items:
        geometry_payload = item.get(
            geometry_key
        )
        if not geometry_payload:
            continue

        result |= _il1_geometry_mask(
            geometry_payload,
            width,
            height,
            scale_x,
            scale_y,
        )

    return result


def _il6_read_annotation_collection(
    relative: str,
    annotation_file: str,
) -> dict[str, Any]:
    path = annotation_path(
        relative,
        annotation_file,
    )

    if not path.exists():
        return empty_feature_collection(
            relative
        )

    try:
        with path.open(
            "r",
            encoding="utf-8",
        ) as stream:
            payload = json.load(
                stream
            )
    except (
        OSError,
        json.JSONDecodeError,
    ) as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not read training annotation file "
                f'"{annotation_file}": {exc}'
            ),
        ) from exc

    collection, _report = (
        sanitize_qupath_feature_collection(
            payload
        )
    )

    return collection


def _il6_cap_sample_pool(
    batches: list[np.ndarray],
    maximum: int,
    rng: np.random.Generator,
    feature_count: int,
) -> np.ndarray:
    usable = [
        batch
        for batch in batches
        if (
            isinstance(batch, np.ndarray)
            and batch.ndim == 2
            and batch.shape[0] > 0
        )
    ]

    if not usable:
        return np.empty(
            (0, feature_count),
            dtype=np.float32,
        )

    combined = np.vstack(
        usable
    ).astype(
        np.float32,
        copy=False,
    )

    if combined.shape[0] <= maximum:
        return combined

    indices = rng.choice(
        combined.shape[0],
        size=maximum,
        replace=False,
    )

    return combined[indices]


_IL8_APPEARANCE_SCALE_FLOOR = np.asarray(
    [
        0.08,
        0.08,
        0.08,
        0.12,
        0.12,
        0.12,
        0.08,
        0.08,
        0.04,
    ],
    dtype=np.float32,
)


def _il8_appearance_descriptor(
    feature_cube: np.ndarray,
    valid_mask: np.ndarray,
    maximum: int = 20000,
) -> dict[str, Any] | None:
    if (
        not isinstance(feature_cube, np.ndarray)
        or feature_cube.ndim != 3
        or feature_cube.shape[2] < 9
        or not isinstance(valid_mask, np.ndarray)
        or valid_mask.shape != feature_cube.shape[:2]
    ):
        return None

    mask = np.asarray(
        valid_mask,
        dtype=bool,
    ).copy()

    # Avoid white slide/background dominating similarity when no Tissue ROI
    # exists. Saturation and darkness are feature channels 6 and 7.
    tissue_like = (
        mask
        & (
            (feature_cube[:, :, 6] >= 0.08)
            | (feature_cube[:, :, 7] >= 0.05)
        )
    )

    if int(np.count_nonzero(tissue_like)) >= 256:
        mask = tissue_like

    flat_indices = np.flatnonzero(
        mask.reshape(-1)
    )

    if flat_indices.size == 0:
        return None

    if flat_indices.size > maximum:
        selector = np.linspace(
            0,
            flat_indices.size - 1,
            num=maximum,
            dtype=np.int64,
        )
        flat_indices = flat_indices[selector]

    flattened = feature_cube.reshape(
        -1,
        feature_cube.shape[2],
    )
    values = flattened[flat_indices].astype(
        np.float32,
        copy=False,
    )

    median = np.median(
        values,
        axis=0,
    ).astype(
        np.float32,
        copy=False,
    )
    q25 = np.percentile(
        values,
        25,
        axis=0,
    ).astype(
        np.float32,
        copy=False,
    )
    q75 = np.percentile(
        values,
        75,
        axis=0,
    ).astype(
        np.float32,
        copy=False,
    )
    iqr = np.maximum(
        q75 - q25,
        0.0,
    ).astype(
        np.float32,
        copy=False,
    )

    return {
        "median": median,
        "iqr": iqr,
        "samples": int(values.shape[0]),
    }


def _il8_appearance_similarity(
    reference: dict[str, Any] | None,
    source: dict[str, Any] | None,
) -> dict[str, Any]:
    if not reference or not source:
        similarity = 0.50
        return {
            "similarity": similarity,
            "distance": None,
            "label": "unknown",
            "weight": 0.20 + 0.65 * (similarity ** 1.35),
        }

    reference_median = np.asarray(
        reference.get("median", []),
        dtype=np.float32,
    )
    source_median = np.asarray(
        source.get("median", []),
        dtype=np.float32,
    )
    reference_iqr = np.asarray(
        reference.get("iqr", []),
        dtype=np.float32,
    )
    source_iqr = np.asarray(
        source.get("iqr", []),
        dtype=np.float32,
    )

    if (
        reference_median.shape != (9,)
        or source_median.shape != (9,)
        or reference_iqr.shape != (9,)
        or source_iqr.shape != (9,)
    ):
        similarity = 0.50
        return {
            "similarity": similarity,
            "distance": None,
            "label": "unknown",
            "weight": 0.20 + 0.65 * (similarity ** 1.35),
        }

    pooled_scale = np.maximum(
        0.5 * (
            reference_iqr
            + source_iqr
        ),
        _IL8_APPEARANCE_SCALE_FLOOR,
    )

    location_z = (
        source_median
        - reference_median
    ) / pooled_scale

    location_distance = float(
        np.sqrt(
            np.mean(
                np.square(location_z)
            )
        )
    )

    reference_spread = np.maximum(
        reference_iqr,
        _IL8_APPEARANCE_SCALE_FLOOR,
    )
    source_spread = np.maximum(
        source_iqr,
        _IL8_APPEARANCE_SCALE_FLOOR,
    )

    spread_distance = float(
        np.sqrt(
            np.mean(
                np.square(
                    np.log(
                        source_spread
                        / reference_spread
                    )
                )
            )
        )
    )

    distance = (
        0.80 * location_distance
        + 0.20 * spread_distance
    )

    # IL8.2: stricter appearance tolerance.
    #
    # IL8 used exp(-0.50 * distance), which compressed clearly different
    # slides into the 60-70% range. A steeper decay separates visually
    # different staining/scanner appearances while preserving a continuous
    # score instead of hard-rejecting user-selected sources.
    similarity = float(
        np.clip(
            np.exp(-0.85 * distance),
            0.0,
            1.0,
        )
    )

    if similarity >= 0.85:
        label = "very similar"
    elif similarity >= 0.65:
        label = "similar"
    elif similarity >= 0.50:
        label = "moderate"
    elif similarity >= 0.30:
        label = "different"
    else:
        label = "very different"

    # Non-linear influence makes medium/different sources contribute
    # progressively less, while a near-identical auxiliary still reaches
    # the intentional 0.85x ceiling.
    weight = float(
        np.clip(
            0.20
            + 0.65
            * (
                similarity ** 1.35
            ),
            0.20,
            0.85,
        )
    )

    return {
        "similarity": similarity,
        "distance": float(distance),
        "label": label,
        "weight": weight,
    }


def _il8_weight_sample_batch(
    batch: np.ndarray,
    weight: float,
    rng: np.random.Generator,
) -> np.ndarray:
    if (
        not isinstance(batch, np.ndarray)
        or batch.ndim != 2
        or batch.shape[0] == 0
    ):
        return batch

    safe_weight = float(
        np.clip(
            weight,
            0.0,
            1.0,
        )
    )

    keep = int(
        round(
            batch.shape[0]
            * safe_weight
        )
    )
    keep = max(
        1,
        min(
            batch.shape[0],
            keep,
        ),
    )

    if keep >= batch.shape[0]:
        return batch

    indices = rng.choice(
        batch.shape[0],
        size=keep,
        replace=False,
    )
    return batch[indices]


def _il6_auxiliary_training_samples(
    image_id: str,
    annotation_file: str,
    target_class: str,
    max_side: int,
    rng: np.random.Generator,
) -> dict[str, Any]:
    annotation_file = normalize_annotation_file(
        annotation_file
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
            detail=(
                "Training source image is not ready: "
                f"{path.name}"
            ),
        )

    image_types = _read_image_types()
    image_type = str(
        image_types.get(
            relative,
            "he",
        )
        or "he"
    ).lower()

    if image_type == "fluorescence":
        raise HTTPException(
            status_code=422,
            detail=(
                "Fluorescence images cannot currently "
                "be used as Interactive Learning sources"
            ),
        )

    collection = _il6_read_annotation_collection(
        relative,
        annotation_file,
    )

    features = collection.get(
        "features",
        [],
    )

    render_path = resolve_render_path(
        path,
        relative,
    )
    handle = get_slide(render_path)

    full_width, full_height = map(
        int,
        handle.slide.dimensions,
    )

    # Phase IL8.3 - multisource performance and timeout
    #
    # Auxiliary images provide training examples and appearance descriptors;
    # they are not the image being segmented. 768 px retains substantially
    # more pixels than the 4k/source sampling budgets require while reducing
    # feature-cube work by ~44% versus 1024 px. Current-image inference stays
    # at the requested IL5.1 maxSide (normally 1600).
    training_side = min(
        768,
        max(
            512,
            int(max_side),
        ),
    )

    thumbnail = handle.slide.get_thumbnail(
        (
            training_side,
            training_side,
        )
    ).convert("RGB")

    rgb = np.asarray(
        thumbnail,
        dtype=np.uint8,
    )

    thumb_height, thumb_width = rgb.shape[:2]

    if thumb_width <= 1 or thumb_height <= 1:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not create training thumbnail "
                f"for {path.name}"
            ),
        )

    scale_x = full_width / float(thumb_width)
    scale_y = full_height / float(thumb_height)

    roi_geometries: list[Any] = []

    artifact_mask = np.zeros(
        (thumb_height, thumb_width),
        dtype=bool,
    )
    positive_mask = np.zeros_like(
        artifact_mask
    )
    explicit_negative_mask = np.zeros_like(
        artifact_mask
    )
    all_annotation_mask = np.zeros_like(
        artifact_mask
    )

    target_cf = target_class.casefold()
    target_annotations = 0
    negative_annotations = 0

    border_enabled = False
    border_percent = 0.0

    for feature in features:
        if not isinstance(feature, dict):
            continue

        role = _il1_feature_role(feature)
        class_name = _il1_feature_class(feature)
        class_cf = class_name.casefold()

        geometry_payload = feature.get(
            "geometry"
        )

        if not geometry_payload:
            continue

        if role == "roi":
            try:
                roi_geometry = shape(
                    geometry_payload
                )
            except Exception:
                continue

            if not roi_geometry.is_empty:
                roi_geometries.append(
                    roi_geometry
                )

            roi_meta = (
                feature
                .get("properties", {})
                .get("histoannotator", {})
                .get("roi", {})
            )

            border_meta = (
                roi_meta.get(
                    "externalBorderExclusion"
                )
                if isinstance(
                    roi_meta,
                    dict,
                )
                else None
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
                except (
                    TypeError,
                    ValueError,
                ):
                    border_percent = 0.0

            continue

        feature_mask = _il1_geometry_mask(
            geometry_payload,
            thumb_width,
            thumb_height,
            scale_x,
            scale_y,
        )

        if not np.any(feature_mask):
            continue

        if (
            role == "artifact"
            or class_cf == "artifact"
            or (
                class_cf == "anthracosis"
                and target_cf != "anthracosis"
            )
        ):
            artifact_mask |= feature_mask
            continue

        if role != "annotation":
            continue

        all_annotation_mask |= feature_mask

        if class_cf == target_cf:
            target_annotations += 1
            positive_mask |= feature_mask
        else:
            negative_annotations += 1
            explicit_negative_mask |= feature_mask

    if roi_geometries:
        roi_geometry = unary_union(
            roi_geometries
        )

        if not roi_geometry.is_valid:
            roi_geometry = make_valid(
                roi_geometry
            )

        roi_geometry = (
            _polygonal_only(
                roi_geometry
            )
            or GeometryCollection()
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
            _polygonal_only(
                roi_geometry
            )
            or GeometryCollection()
        )

        if (
            border_enabled
            and border_percent > 0
            and not roi_geometry.is_empty
        ):
            (
                roi_geometry,
                _actual_border,
                _border_width,
            ) = _stats_exclude_external_border(
                roi_geometry,
                border_percent,
            )

        if roi_geometry.is_empty:
            valid_mask = np.zeros(
                (
                    thumb_height,
                    thumb_width,
                ),
                dtype=bool,
            )
        else:
            valid_mask = _il1_geometry_mask(
                mapping(
                    roi_geometry
                ),
                thumb_width,
                thumb_height,
                scale_x,
                scale_y,
            )
    else:
        valid_mask = np.ones(
            (
                thumb_height,
                thumb_width,
            ),
            dtype=bool,
        )

    valid_mask &= ~artifact_mask

    positive_mask &= valid_mask
    explicit_negative_mask &= valid_mask
    explicit_negative_mask &= ~positive_mask
    all_annotation_mask &= valid_mask

    positive_pixels = int(
        np.count_nonzero(
            positive_mask
        )
    )

    target_present = bool(
        target_annotations > 0
        and positive_pixels >= 12
    )

    # Auxiliary annotation files may be partially labeled. Therefore
    # unlabeled tissue is never silently interpreted as negative.
    negative_mask = explicit_negative_mask

    if target_present:
        negative_source = (
            "other explicitly annotated classes"
        )
        positive_limit = 4000
        negative_limit = 4000
    else:
        negative_source = (
            "target-absent explicit annotated classes only"
        )
        positive_limit = 0
        negative_limit = 1000

    feature_cube = _il1_feature_cube(
        rgb
    )

    appearance_descriptor = (
        _il8_appearance_descriptor(
            feature_cube,
            valid_mask,
        )
    )

    positive_samples = (
        _il1_sample_features(
            feature_cube,
            positive_mask,
            positive_limit,
            rng,
        )
        if positive_limit > 0
        else np.empty(
            (
                0,
                feature_cube.shape[2],
            ),
            dtype=np.float32,
        )
    )

    negative_samples = _il1_sample_features(
        feature_cube,
        negative_mask,
        negative_limit,
        rng,
    )

    return {
        "imageId": image_id,
        "imageName": path.name,
        "annotationFile": annotation_file,
        "targetPresent": target_present,
        "targetAnnotations": target_annotations,
        "negativeAnnotations": negative_annotations,
        "positiveSamples": positive_samples,
        "negativeSamples": negative_samples,
        "negativeSource": negative_source,
        "_deepRgb": rgb,
        "_deepValidMask": valid_mask,
        "_deepPositiveMask": positive_mask,
        "_deepNegativeMask": negative_mask,
        "_deepExplicitNegativeMask": explicit_negative_mask,
        "appearanceDescriptor":
            appearance_descriptor,
    }


def _il10_deep_runtime_capabilities() -> dict[str, Any]:
    # IL10.1: torch + torchvision readiness and automatic device selection.
    runtime: dict[str, Any] = {
        "available": False,
        "ready": False,
        "torch": False,
        "torchvision": False,
        "devicePolicy": "auto",
        "device": "cpu",
        "accelerator": None,
        "torchVersion": None,
        "torchvisionVersion": None,
        "reason": None,
    }
    try:
        import torch
        runtime["torch"] = True
        runtime["torchVersion"] = str(getattr(torch, "__version__", "") or "")
    except Exception as exc:
        runtime["reason"] = f"PyTorch import failed: {type(exc).__name__}: {exc}"
        return runtime
    try:
        import torchvision
        runtime["torchvision"] = True
        runtime["torchvisionVersion"] = str(getattr(torchvision, "__version__", "") or "")
    except Exception as exc:
        runtime["reason"] = f"torchvision import failed: {type(exc).__name__}: {exc}"
        return runtime

    device = "cpu"
    accelerator = None
    try:
        if bool(torch.cuda.is_available()):
            device = "cuda"
            accelerator = str(torch.cuda.get_device_name(0) or "CUDA")
        elif hasattr(torch.backends, "mps") and bool(torch.backends.mps.is_available()):
            device = "mps"
            accelerator = "Apple Metal / MPS"
    except Exception:
        device = "cpu"
        accelerator = None

    runtime.update({
        "available": True,
        "ready": True,
        "device": device,
        "accelerator": accelerator,
    })
    return runtime


@capabilities_router.get("/api/interactive-learning/capabilities")
def interactive_learning_capabilities() -> dict[str, Any]:
    runtime = _il10_deep_runtime_capabilities()
    deep_runtime = (
        _il10_deep_runtime_capabilities()
    )

    return {
        "devicePolicy": "auto",
        "deepRuntime": deep_runtime,
        "embeddingCache":
            _il10_b_embedding_cache_status(),
        "models": [
            {
                "id": "A",
                "label": "Classical",
                "available": True,
                "approach": (
                    "engineered appearance features "
                    "+ Extra Trees"
                ),
                "device": "cpu",
            },
            {
                "id": "B",
                "label": "Deep Features",
                "available": bool(runtime.get("ready", False)),
                "approach": (
                    "pretrained deep embeddings "
                    "+ lightweight classifier"
                ),
                "device": "auto",
            },
            {
                "id": "C",
                "label": "Deep Spatial",
                "available": bool(
                    runtime.get(
                        "ready",
                        False,
                    )
                ),
                "approach": (
                    "frozen ResNet18 spatial embeddings "
                    "+ weighted multi-image convolutional segmentation head"
                ),
                "device": "auto",
            },
        ],
    }


_IL10_B_BACKBONES: dict[str, Any] = {}


def _il10_b_device(torch_module: Any) -> str:
    try:
        if bool(torch_module.cuda.is_available()):
            return "cuda"
    except Exception:
        pass
    try:
        if hasattr(torch_module.backends, "mps") and bool(torch_module.backends.mps.is_available()):
            return "mps"
    except Exception:
        pass
    return "cpu"


def _il10_b_backbone(torch_module: Any, device: str) -> Any:
    cached = _IL10_B_BACKBONES.get(device)
    if cached is not None:
        return cached
    from torchvision.models import ResNet18_Weights, resnet18
    model = resnet18(weights=ResNet18_Weights.DEFAULT)
    backbone = torch_module.nn.Sequential(
        model.conv1, model.bn1, model.relu, model.maxpool,
        model.layer1, model.layer2,
    )
    backbone.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    backbone = backbone.to(device)
    _IL10_B_BACKBONES[device] = backbone
    return backbone


def _il10_b_sample_embeddings(embeddings, mask, maximum, rng):
    if embeddings.ndim != 3 or mask.shape != embeddings.shape[:2]:
        raise ValueError("Deep embedding grid and mask are incompatible")
    indices = np.flatnonzero(mask.reshape(-1))
    dims = int(embeddings.shape[2])
    if indices.size == 0:
        return np.empty((0, dims), dtype=np.float32)
    if indices.size > maximum:
        indices = rng.choice(indices, size=maximum, replace=False)
    return embeddings.reshape(-1, dims)[indices].astype(np.float32, copy=False)


def _il10_b_embedding_grid(
    rgb: np.ndarray,
    torch_module: Any,
    device: str,
    maximum_side: int,
) -> tuple[np.ndarray, int, int]:
    import torch.nn.functional as F

    height, width = map(
        int,
        rgb.shape[:2],
    )

    scale = min(
        1.0,
        float(maximum_side)
        / float(max(height, width)),
    )

    analysis_height = max(
        32,
        int(round(height * scale)),
    )

    analysis_width = max(
        32,
        int(round(width * scale)),
    )

    tensor = torch_module.from_numpy(
        np.ascontiguousarray(rgb)
    ).permute(
        2,
        0,
        1,
    ).unsqueeze(0).float()

    tensor = tensor / 255.0

    if (
        analysis_height != height
        or analysis_width != width
    ):
        tensor = F.interpolate(
            tensor,
            size=(
                analysis_height,
                analysis_width,
            ),
            mode="bilinear",
            align_corners=False,
        )

    mean = torch_module.tensor(
        [
            0.485,
            0.456,
            0.406,
        ],
        dtype=tensor.dtype,
    ).view(
        1,
        3,
        1,
        1,
    )

    std = torch_module.tensor(
        [
            0.229,
            0.224,
            0.225,
        ],
        dtype=tensor.dtype,
    ).view(
        1,
        3,
        1,
        1,
    )

    tensor = (tensor - mean) / std

    if device == "cpu":
        try:
            torch_module.set_num_threads(
                min(
                    8,
                    max(
                        1,
                        int(os.cpu_count() or 1),
                    ),
                )
            )
        except Exception:
            pass

    backbone = _il10_b_backbone(
        torch_module,
        device,
    )

    tensor = tensor.to(device)

    with torch_module.inference_mode():
        output = backbone(tensor)

    embeddings = (
        output[0]
        .detach()
        .float()
        .cpu()
        .permute(
            1,
            2,
            0,
        )
        .numpy()
        .astype(
            np.float32,
            copy=False,
        )
    )

    return (
        embeddings,
        analysis_height,
        analysis_width,
    )


_IL10_B_EMBEDDING_CACHE_VERSION = (
    "resnet18-layer2-imagenet1k-v1-cache1"
)


_IL10_B_EMBEDDING_CACHE_ROOT = (
    TILE_CACHE_ROOT
    / "interactive-learning"
    / "deep-features"
)


_IL10_B_EMBEDDING_MEMORY_CACHE: dict[
    str,
    np.ndarray,
] = {}


_IL10_B_EMBEDDING_CACHE_LOCK = (
    threading.RLock()
)


_IL10_B_EMBEDDING_CACHE_DIAGNOSTICS: dict[str, Any] = {
    "keyErrors": 0,
    "readErrors": 0,
    "writeErrors": 0,
    "memoryHits": 0,
    "diskHits": 0,
    "computed": 0,
    "writes": 0,
    "lastError": None,
}


def _il10_b_cache_note(
    key: str,
    message: str | None = None,
) -> None:
    if key in {
        "keyErrors",
        "readErrors",
        "writeErrors",
        "memoryHits",
        "diskHits",
        "computed",
        "writes",
    }:
        _IL10_B_EMBEDDING_CACHE_DIAGNOSTICS[key] = (
            int(
                _IL10_B_EMBEDDING_CACHE_DIAGNOSTICS.get(
                    key,
                    0,
                )
            )
            + 1
        )

    if message is not None:
        _IL10_B_EMBEDDING_CACHE_DIAGNOSTICS[
            "lastError"
        ] = message

        print(
            f"[HistoAnnotator IL10 cache] {message}",
            flush=True,
        )


def _il10_b_embedding_cache_max_bytes() -> int:
    try:
        gigabytes = int(
            os.getenv(
                "IL_DEEP_CACHE_GB",
                "12",
            )
            or "12"
        )
    except Exception:
        gigabytes = 12

    gigabytes = min(
        200,
        max(
            1,
            gigabytes,
        ),
    )

    return (
        gigabytes
        * 1024
        * 1024
        * 1024
    )


def _il10_b_embedding_cache_status() -> dict[str, Any]:
    root = _IL10_B_EMBEDDING_CACHE_ROOT

    files = 0
    bytes_used = 0

    try:
        if root.is_dir():
            for path in root.glob(
                "*.npy"
            ):
                try:
                    stat = path.stat()
                except OSError:
                    continue

                files += 1
                bytes_used += int(
                    stat.st_size
                )
    except Exception:
        pass

    return {
        "enabled":
            True,
        "persistent":
            True,
        "backend":
            "tile-cache",
        "version":
            _IL10_B_EMBEDDING_CACHE_VERSION,
        "entries":
            int(files),
        "bytes":
            int(bytes_used),
        "maxBytes":
            int(
                _il10_b_embedding_cache_max_bytes()
            ),
        "memoryEntries":
            int(
                len(
                    _IL10_B_EMBEDDING_MEMORY_CACHE
                )
            ),
        "root":
            str(
                _IL10_B_EMBEDDING_CACHE_ROOT
            ),
        "diagnostics":
            dict(
                _IL10_B_EMBEDDING_CACHE_DIAGNOSTICS
            ),
    }


def _il10_b_embedding_cache_key(
    image_id: str,
    rgb: np.ndarray,
    maximum_side: int,
) -> tuple[str, Path]:
    image_path, relative = safe_image_path(
        image_id
    )

    signature = source_signature(
        image_path,
        relative,
    )

    height, width = map(
        int,
        rgb.shape[:2],
    )

    raw = "|".join([
        _IL10_B_EMBEDDING_CACHE_VERSION,
        str(
            signature[
                "relative"
            ]
        ),
        str(
            signature[
                "size"
            ]
        ),
        str(
            signature[
                "mtimeNs"
            ]
        ),
        str(
            int(maximum_side)
        ),
        str(
            width
        ),
        str(
            height
        ),
    ])

    key = hashlib.sha256(
        raw.encode(
            "utf-8"
        )
    ).hexdigest()[:32]

    return (
        key,
        _IL10_B_EMBEDDING_CACHE_ROOT
        / f"{key}.npy",
    )


def _il10_b_embedding_memory_get(
    key: str,
) -> np.ndarray | None:
    with _IL10_B_EMBEDDING_CACHE_LOCK:
        embeddings = (
            _IL10_B_EMBEDDING_MEMORY_CACHE
            .get(key)
        )

        if embeddings is None:
            return None

        # Refresh insertion order without adding another dependency.
        _IL10_B_EMBEDDING_MEMORY_CACHE.pop(
            key,
            None,
        )

        _IL10_B_EMBEDDING_MEMORY_CACHE[
            key
        ] = embeddings

        return embeddings


def _il10_b_embedding_memory_put(
    key: str,
    embeddings: np.ndarray,
) -> None:
    with _IL10_B_EMBEDDING_CACHE_LOCK:
        _IL10_B_EMBEDDING_MEMORY_CACHE.pop(
            key,
            None,
        )

        _IL10_B_EMBEDDING_MEMORY_CACHE[
            key
        ] = embeddings

        while (
            len(
                _IL10_B_EMBEDDING_MEMORY_CACHE
            )
            > 4
        ):
            oldest = next(
                iter(
                    _IL10_B_EMBEDDING_MEMORY_CACHE
                )
            )

            _IL10_B_EMBEDDING_MEMORY_CACHE.pop(
                oldest,
                None,
            )


def _il10_b_embedding_cache_prune() -> None:
    root = _IL10_B_EMBEDDING_CACHE_ROOT
    maximum = (
        _il10_b_embedding_cache_max_bytes()
    )

    try:
        files: list[
            tuple[float, int, Path]
        ] = []

        total = 0

        for path in root.glob(
            "*.npy"
        ):
            try:
                stat = path.stat()
            except OSError:
                continue

            size = int(
                stat.st_size
            )

            total += size

            files.append(
                (
                    float(
                        stat.st_mtime
                    ),
                    size,
                    path,
                )
            )

        if total <= maximum:
            return

        files.sort(
            key=lambda item:
                item[0]
        )

        target = int(
            maximum * 0.90
        )

        for _, size, path in files:
            if total <= target:
                break

            try:
                path.unlink()
            except OSError:
                continue

            total -= size

    except Exception:
        # Cache maintenance must never break Interactive Learning.
        return


def _il10_b_cached_embedding_grid(
    rgb: np.ndarray,
    torch_module: Any,
    device: str,
    maximum_side: int,
    image_id: str,
) -> tuple[
    np.ndarray,
    int,
    int,
    dict[str, Any],
]:
    height, width = map(
        int,
        rgb.shape[:2],
    )

    scale = min(
        1.0,
        float(maximum_side)
        / float(
            max(
                height,
                width,
            )
        ),
    )

    analysis_height = max(
        32,
        int(
            round(
                height * scale
            )
        ),
    )

    analysis_width = max(
        32,
        int(
            round(
                width * scale
            )
        ),
    )

    cache_key = None
    cache_path = None

    try:
        (
            cache_key,
            cache_path,
        ) = _il10_b_embedding_cache_key(
            image_id,
            rgb,
            maximum_side,
        )
    except Exception as exc:
        _il10_b_cache_note(
            "keyErrors",
            (
                "key: "
                f"{type(exc).__name__}: {exc}"
            ),
        )
        cache_key = None
        cache_path = None

    if cache_key:
        memory = (
            _il10_b_embedding_memory_get(
                cache_key
            )
        )

        if memory is not None:
            _il10_b_cache_note(
                "memoryHits"
            )

            return (
                memory,
                analysis_height,
                analysis_width,
                {
                    "hit":
                        True,
                    "source":
                        "memory",
                    "key":
                        cache_key,
                    "persistent":
                        True,
                },
            )

    if (
        cache_key
        and cache_path is not None
        and cache_path.is_file()
    ):
        try:
            loaded = np.load(
                cache_path,
                allow_pickle=False,
            )

            if (
                isinstance(
                    loaded,
                    np.ndarray,
                )
                and loaded.ndim == 3
                and loaded.shape[2] > 0
            ):
                embeddings = loaded.astype(
                    np.float32,
                    copy=False,
                )

                try:
                    os.utime(
                        cache_path,
                        None,
                    )
                except OSError:
                    pass

                _il10_b_embedding_memory_put(
                    cache_key,
                    embeddings,
                )

                _il10_b_cache_note(
                    "diskHits"
                )

                return (
                    embeddings,
                    analysis_height,
                    analysis_width,
                    {
                        "hit":
                            True,
                        "source":
                            "disk",
                        "key":
                            cache_key,
                        "persistent":
                            True,
                    },
                )

        except Exception as exc:
            _il10_b_cache_note(
                "readErrors",
                (
                    "read: "
                    f"{type(exc).__name__}: {exc}"
                ),
            )

            try:
                cache_path.unlink()
            except OSError:
                pass

    (
        embeddings,
        analysis_height,
        analysis_width,
    ) = _il10_b_embedding_grid(
        rgb,
        torch_module,
        device,
        maximum_side,
    )

    embeddings = embeddings.astype(
        np.float32,
        copy=False,
    )

    _il10_b_cache_note(
        "computed"
    )

    # RAM reuse is independent from disk persistence.
    if cache_key:
        _il10_b_embedding_memory_put(
            cache_key,
            embeddings,
        )

    if (
        cache_key
        and cache_path is not None
    ):
        try:
            with _IL10_B_EMBEDDING_CACHE_LOCK:
                cache_path.parent.mkdir(
                    parents=True,
                    exist_ok=True,
                )

                temp_path = (
                    cache_path.parent
                    / (
                        f".{cache_path.name}."
                        f"{uuid.uuid4().hex}.tmp"
                    )
                )

                try:
                    with temp_path.open(
                        "wb"
                    ) as stream:
                        np.save(
                            stream,
                            embeddings,
                            allow_pickle=False,
                        )

                    os.replace(
                        temp_path,
                        cache_path,
                    )

                finally:
                    try:
                        temp_path.unlink(
                            missing_ok=True
                        )
                    except OSError:
                        pass

            _il10_b_cache_note(
                "writes"
            )

            _il10_b_embedding_cache_prune()

        except Exception as exc:
            # Disk cache is an optimization only; keep B functional,
            # but surface the failure for diagnosis.
            _il10_b_cache_note(
                "writeErrors",
                (
                    "write: "
                    f"{type(exc).__name__}: {exc}"
                ),
            )

    return (
        embeddings,
        analysis_height,
        analysis_width,
        {
            "hit":
                False,
            "source":
                "computed",
            "key":
                cache_key,
            "persistent":
                bool(
                    cache_key
                ),
        },
    )


def _il10_b_mask_occupancy(
    mask: np.ndarray,
    grid_height: int,
    grid_width: int,
) -> np.ndarray:
    import torch
    import torch.nn.functional as F

    source_height, source_width = map(
        int,
        mask.shape[:2],
    )

    tensor = torch.from_numpy(
        np.asarray(
            mask,
            dtype=np.float32,
        )
    ).view(
        1,
        1,
        source_height,
        source_width,
    )

    return (
        F.interpolate(
            tensor,
            size=(
                grid_height,
                grid_width,
            ),
            mode="area",
        )[0, 0]
        .numpy()
        .astype(
            np.float32,
            copy=False,
        )
    )


def _il10_b_descriptor(
    embeddings: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    grid_height, grid_width = map(
        int,
        embeddings.shape[:2],
    )

    occupancy = _il10_b_mask_occupancy(
        valid_mask,
        grid_height,
        grid_width,
    )

    valid_grid = occupancy >= 0.10

    flat = embeddings.reshape(
        -1,
        embeddings.shape[2],
    )

    indices = np.flatnonzero(
        valid_grid.reshape(-1)
    )

    if indices.size:
        descriptor = np.mean(
            flat[indices],
            axis=0,
        )
    else:
        descriptor = np.mean(
            flat,
            axis=0,
        )

    descriptor = np.asarray(
        descriptor,
        dtype=np.float32,
    )

    norm = float(
        np.linalg.norm(descriptor)
    )

    if norm > 1e-8:
        descriptor = descriptor / norm

    return descriptor


def _il10_b_similarity(
    current_descriptor: np.ndarray,
    source_descriptor: np.ndarray,
) -> float:
    current = np.asarray(
        current_descriptor,
        dtype=np.float32,
    )

    source = np.asarray(
        source_descriptor,
        dtype=np.float32,
    )

    if (
        current.shape != source.shape
        or current.size == 0
    ):
        return 0.0

    denominator = float(
        np.linalg.norm(current)
        * np.linalg.norm(source)
    )

    if denominator <= 1e-8:
        return 0.0

    cosine = float(
        np.dot(current, source)
        / denominator
    )

    cosine = float(
        np.clip(
            cosine,
            -1.0,
            1.0,
        )
    )

    distance = max(
        0.0,
        1.0 - cosine,
    )

    similarity = float(
        np.exp(
            -2.5 * distance
        )
    )

    return float(
        np.clip(
            similarity,
            0.0,
            1.0,
        )
    )


def _il10_b_similarity_label(
    similarity: float,
    same_physical_image: bool,
) -> str:
    if same_physical_image:
        return "same image"

    if similarity >= 0.82:
        return "very similar"

    if similarity >= 0.65:
        return "similar"

    if similarity >= 0.45:
        return "moderate"

    return "distant"


def _il10_b_effective_weight(
    similarity: float,
    target_present: bool,
) -> tuple[float, float | None]:
    weight = float(
        np.clip(
            (
                0.20
                + 0.65
                * (
                    float(similarity)
                    ** 1.35
                )
            ),
            0.20,
            0.85,
        )
    )

    target_absent_cap = (
        None
        if target_present
        else 0.45
    )

    if target_absent_cap is not None:
        weight = min(
            weight,
            target_absent_cap,
        )

    return (
        float(weight),
        target_absent_cap,
    )


def _il10_b_cap_weighted_pool(
    batches: list[tuple[np.ndarray, float]],
    maximum: int,
    rng: np.random.Generator,
    feature_count: int,
) -> tuple[np.ndarray, np.ndarray]:
    feature_batches: list[np.ndarray] = []
    weight_batches: list[np.ndarray] = []

    for batch, weight in batches:
        if (
            not isinstance(batch, np.ndarray)
            or batch.ndim != 2
            or batch.shape[0] < 1
        ):
            continue

        feature_batches.append(
            batch.astype(
                np.float32,
                copy=False,
            )
        )

        weight_batches.append(
            np.full(
                batch.shape[0],
                float(weight),
                dtype=np.float32,
            )
        )

    if not feature_batches:
        return (
            np.empty(
                (
                    0,
                    feature_count,
                ),
                dtype=np.float32,
            ),
            np.empty(
                (0,),
                dtype=np.float32,
            ),
        )

    features = np.vstack(
        feature_batches
    ).astype(
        np.float32,
        copy=False,
    )

    weights = np.concatenate(
        weight_batches
    ).astype(
        np.float32,
        copy=False,
    )

    if features.shape[0] <= maximum:
        return (
            features,
            weights,
        )

    probabilities = np.maximum(
        weights,
        1e-4,
    ).astype(
        np.float64,
        copy=False,
    )

    probabilities /= np.sum(
        probabilities
    )

    indices = rng.choice(
        features.shape[0],
        size=maximum,
        replace=False,
        p=probabilities,
    )

    return (
        features[indices],
        weights[indices],
    )


def _il10_b_auxiliary_source(
    source_result: dict[str, Any],
    current_descriptor: np.ndarray,
    current_image_id: str,
    source_image_id: str,
    torch_module: Any,
    device: str,
    rng: np.random.Generator,
) -> dict[str, Any]:
    rgb = source_result[
        "_deepRgb"
    ]

    valid_mask = source_result[
        "_deepValidMask"
    ]

    positive_mask = source_result[
        "_deepPositiveMask"
    ]

    explicit_negative_mask = source_result[
        "_deepExplicitNegativeMask"
    ]

    target_present = bool(
        source_result[
            "targetPresent"
        ]
    )

    negative_mask = (
        source_result[
            "_deepNegativeMask"
        ]
        if target_present
        else explicit_negative_mask
    )

    maximum_side = (
        896
        if device == "cuda"
        else 704
    )

    (
        embeddings,
        _,
        _,
        embedding_cache,
    ) = _il10_b_cached_embedding_grid(
        rgb,
        torch_module,
        device,
        maximum_side,
        source_image_id,
    )

    grid_height, grid_width = map(
        int,
        embeddings.shape[:2],
    )

    source_descriptor = _il10_b_descriptor(
        embeddings,
        valid_mask,
    )

    same_physical_image = (
        str(source_image_id)
        == str(current_image_id)
    )

    similarity = (
        1.0
        if same_physical_image
        else _il10_b_similarity(
            current_descriptor,
            source_descriptor,
        )
    )

    (
        effective_weight,
        target_absent_cap,
    ) = _il10_b_effective_weight(
        similarity,
        target_present,
    )

    positive_occupancy = _il10_b_mask_occupancy(
        positive_mask,
        grid_height,
        grid_width,
    )

    negative_occupancy = _il10_b_mask_occupancy(
        negative_mask,
        grid_height,
        grid_width,
    )

    positive_grid = (
        positive_occupancy >= 0.05
    )

    if (
        target_present
        and np.count_nonzero(
            positive_grid
        ) < 8
    ):
        positive_grid = (
            positive_occupancy > 0.0
        )

    negative_grid = (
        negative_occupancy >= 0.35
    )

    if np.count_nonzero(
        negative_grid
    ) < 8:
        negative_grid = (
            negative_occupancy > 0.0
        )

    positive_limit = (
        max(
            400,
            int(
                round(
                    2600
                    * (
                        effective_weight
                        / 0.85
                    )
                )
            ),
        )
        if target_present
        else 0
    )

    negative_limit = (
        max(
            400,
            int(
                round(
                    2600
                    * (
                        effective_weight
                        / 0.85
                    )
                )
            ),
        )
        if target_present
        else max(
            100,
            int(
                round(
                    700
                    * (
                        effective_weight
                        / 0.45
                    )
                )
            ),
        )
    )

    positive_samples = (
        _il10_b_sample_embeddings(
            embeddings,
            positive_grid,
            positive_limit,
            rng,
        )
        if positive_limit > 0
        else np.empty(
            (
                0,
                embeddings.shape[2],
            ),
            dtype=np.float32,
        )
    )

    negative_samples = _il10_b_sample_embeddings(
        embeddings,
        negative_grid,
        negative_limit,
        rng,
    )

    return {
        "positiveSamples":
            positive_samples,
        "negativeSamples":
            negative_samples,
        "appearanceSimilarity":
            float(similarity),
        "similarityLabel":
            _il10_b_similarity_label(
                similarity,
                same_physical_image,
            ),
        "effectiveWeight":
            float(effective_weight),
        "targetAbsentWeightCap":
            target_absent_cap,
        "samePhysicalImage":
            bool(
                same_physical_image
            ),
        "similarityBasis":
            "deep-resnet18-cosine",
        "embeddingCacheHit":
            bool(
                embedding_cache[
                    "hit"
                ]
            ),
        "embeddingCacheSource":
            embedding_cache[
                "source"
            ],
        "embeddingCacheKey":
            embedding_cache[
                "key"
            ],
    }


def _il10_b_deep_feature_probability_map(
    rgb: np.ndarray,
    positive_mask: np.ndarray,
    negative_mask: np.ndarray,
    positive_feedback_mask: np.ndarray,
    negative_feedback_mask: np.ndarray,
    valid_mask: np.ndarray,
    sensitivity: float,
    rng: np.random.Generator,
    *,
    image_id: str,
    current_annotation_file: str,
    target_class: str,
    training_mode: str,
    raw_training_sources: list[Any],
    max_side: int,
) -> dict[str, Any]:
    try:
        import torch
        import torch.nn.functional as F
        import torchvision  # noqa: F401
        from sklearn.linear_model import (
            LogisticRegression,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Deep Features requires PyTorch, "
                "torchvision and scikit-learn: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    if (
        rgb.ndim != 3
        or rgb.shape[2] != 3
        or rgb.shape[:2]
        != positive_mask.shape
        or valid_mask.shape
        != positive_mask.shape
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Features received an "
                "invalid RGB/mask layout"
            ),
        )

    original_height, original_width = map(
        int,
        rgb.shape[:2],
    )

    requested_device = _il10_b_device(
        torch
    )

    maximum_side = (
        1280
        if requested_device == "cuda"
        else 896
    )

    used_device = requested_device
    fallback_reason = None

    try:
        (
            embeddings,
            analysis_height,
            analysis_width,
            current_embedding_cache,
        ) = _il10_b_cached_embedding_grid(
            rgb,
            torch,
            requested_device,
            maximum_side,
            image_id,
        )
    except Exception as exc:
        if requested_device == "cpu":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Deep Features backbone "
                    "inference failed on CPU: "
                    f"{type(exc).__name__}: {exc}"
                ),
            ) from exc

        fallback_reason = (
            f"{requested_device} failed; "
            "CPU fallback used: "
            f"{type(exc).__name__}: {exc}"
        )

        try:
            if requested_device == "cuda":
                torch.cuda.empty_cache()
        except Exception:
            pass

        used_device = "cpu"

        (
            embeddings,
            analysis_height,
            analysis_width,
            current_embedding_cache,
        ) = _il10_b_cached_embedding_grid(
            rgb,
            torch,
            "cpu",
            896,
            image_id,
        )

    grid_height, grid_width = map(
        int,
        embeddings.shape[:2],
    )

    current_descriptor = _il10_b_descriptor(
        embeddings,
        valid_mask,
    )

    pos_occ = _il10_b_mask_occupancy(
        positive_mask,
        grid_height,
        grid_width,
    )

    neg_occ = _il10_b_mask_occupancy(
        negative_mask,
        grid_height,
        grid_width,
    )

    pos_feedback_occ = _il10_b_mask_occupancy(
        positive_feedback_mask,
        grid_height,
        grid_width,
    )

    neg_feedback_occ = _il10_b_mask_occupancy(
        negative_feedback_mask,
        grid_height,
        grid_width,
    )

    positive_grid = pos_occ >= 0.05

    if np.count_nonzero(
        positive_grid
    ) < 12:
        positive_grid = pos_occ > 0.0

    negative_grid = neg_occ >= 0.45

    if np.count_nonzero(
        negative_grid
    ) < 12:
        negative_grid = neg_occ >= 0.15

    if np.count_nonzero(
        negative_grid
    ) < 12:
        negative_grid = neg_occ > 0.0

    positive_samples = _il10_b_sample_embeddings(
        embeddings,
        positive_grid,
        8000,
        rng,
    )

    negative_samples = _il10_b_sample_embeddings(
        embeddings,
        negative_grid,
        8000,
        rng,
    )

    positive_feedback_samples = _il10_b_sample_embeddings(
        embeddings,
        pos_feedback_occ > 0.0,
        3000,
        rng,
    )

    negative_feedback_samples = _il10_b_sample_embeddings(
        embeddings,
        neg_feedback_occ > 0.0,
        3000,
        rng,
    )

    current_positive = positive_samples
    current_negative = negative_samples

    if positive_feedback_samples.shape[0]:
        current_positive = np.vstack([
            current_positive,
            positive_feedback_samples,
        ])

    if negative_feedback_samples.shape[0]:
        current_negative = np.vstack([
            current_negative,
            negative_feedback_samples,
        ])

    auxiliary_positive_batches: list[
        tuple[np.ndarray, float]
    ] = []

    auxiliary_negative_batches: list[
        tuple[np.ndarray, float]
    ] = []

    training_source_reports: list[
        dict[str, Any]
    ] = []

    if training_mode == "set":
        seen_sources: set[
            tuple[str, str]
        ] = set()

        for source in raw_training_sources[:12]:
            if not isinstance(
                source,
                dict,
            ):
                continue

            source_image_id = str(
                source.get(
                    "imageId",
                    "",
                )
                or ""
            ).strip()

            source_file = normalize_annotation_file(
                str(
                    source.get(
                        "annotationFile",
                        "Default",
                    )
                    or "Default"
                )
            )

            if not source_image_id:
                continue

            source_key = (
                source_image_id,
                source_file.casefold(),
            )

            if source_key in seen_sources:
                continue

            seen_sources.add(
                source_key
            )

            if (
                source_image_id == image_id
                and source_file.casefold()
                == current_annotation_file.casefold()
            ):
                continue

            source_result = _il6_auxiliary_training_samples(
                source_image_id,
                source_file,
                target_class,
                min(
                    896,
                    max(
                        512,
                        int(max_side),
                    ),
                ),
                rng,
            )

            deep_source = _il10_b_auxiliary_source(
                source_result,
                current_descriptor,
                image_id,
                source_image_id,
                torch,
                used_device,
                rng,
            )

            weight = float(
                deep_source[
                    "effectiveWeight"
                ]
            )

            if (
                deep_source[
                    "positiveSamples"
                ].shape[0]
            ):
                auxiliary_positive_batches.append(
                    (
                        deep_source[
                            "positiveSamples"
                        ],
                        weight,
                    )
                )

            if (
                deep_source[
                    "negativeSamples"
                ].shape[0]
            ):
                auxiliary_negative_batches.append(
                    (
                        deep_source[
                            "negativeSamples"
                        ],
                        weight,
                    )
                )

            training_source_reports.append({
                "imageId":
                    source_result[
                        "imageId"
                    ],
                "imageName":
                    source_result[
                        "imageName"
                    ],
                "annotationFile":
                    source_result[
                        "annotationFile"
                    ],
                "targetClass":
                    target_class,
                "targetPresent":
                    bool(
                        source_result[
                            "targetPresent"
                        ]
                    ),
                "targetAnnotations":
                    int(
                        source_result[
                            "targetAnnotations"
                        ]
                    ),
                "negativeAnnotations":
                    int(
                        source_result.get(
                            "negativeAnnotations",
                            0,
                        )
                    ),
                "positiveSamples":
                    int(
                        deep_source[
                            "positiveSamples"
                        ].shape[0]
                    ),
                "negativeSamples":
                    int(
                        deep_source[
                            "negativeSamples"
                        ].shape[0]
                    ),
                "negativeSource":
                    (
                        source_result[
                            "negativeSource"
                        ]
                        if source_result[
                            "targetPresent"
                        ]
                        else (
                            "explicit annotated "
                            "non-target classes only"
                        )
                    ),
                "appearanceSimilarity":
                    float(
                        deep_source[
                            "appearanceSimilarity"
                        ]
                    ),
                "similarityLabel":
                    deep_source[
                        "similarityLabel"
                    ],
                "effectiveWeight":
                    float(
                        deep_source[
                            "effectiveWeight"
                        ]
                    ),
                "targetAbsentWeightCap":
                    deep_source[
                        "targetAbsentWeightCap"
                    ],
                "samePhysicalImage":
                    bool(
                        deep_source[
                            "samePhysicalImage"
                        ]
                    ),
                "similarityBasis":
                    deep_source[
                        "similarityBasis"
                    ],
                "embeddingCacheHit":
                    bool(
                        deep_source[
                            "embeddingCacheHit"
                        ]
                    ),
                "embeddingCacheSource":
                    deep_source[
                        "embeddingCacheSource"
                    ],
                "embeddingCacheKey":
                    deep_source[
                        "embeddingCacheKey"
                    ],
            })

    feature_count = int(
        embeddings.shape[2]
    )

    (
        auxiliary_positive,
        auxiliary_positive_weights,
    ) = _il10_b_cap_weighted_pool(
        auxiliary_positive_batches,
        12000,
        rng,
        feature_count,
    )

    (
        auxiliary_negative,
        auxiliary_negative_weights,
    ) = _il10_b_cap_weighted_pool(
        auxiliary_negative_batches,
        12000,
        rng,
        feature_count,
    )

    positive_parts: list[
        np.ndarray
    ] = []

    positive_weight_parts: list[
        np.ndarray
    ] = []

    negative_parts: list[
        np.ndarray
    ] = []

    negative_weight_parts: list[
        np.ndarray
    ] = []

    if current_positive.shape[0]:
        positive_parts.append(
            current_positive
        )
        positive_weight_parts.append(
            np.ones(
                current_positive.shape[0],
                dtype=np.float32,
            )
        )

    if auxiliary_positive.shape[0]:
        positive_parts.append(
            auxiliary_positive
        )
        positive_weight_parts.append(
            auxiliary_positive_weights
        )

    if current_negative.shape[0]:
        negative_parts.append(
            current_negative
        )
        negative_weight_parts.append(
            np.ones(
                current_negative.shape[0],
                dtype=np.float32,
            )
        )

    if auxiliary_negative.shape[0]:
        negative_parts.append(
            auxiliary_negative
        )
        negative_weight_parts.append(
            auxiliary_negative_weights
        )

    training_positive = (
        np.vstack(
            positive_parts
        ).astype(
            np.float32,
            copy=False,
        )
        if positive_parts
        else np.empty(
            (
                0,
                feature_count,
            ),
            dtype=np.float32,
        )
    )

    training_negative = (
        np.vstack(
            negative_parts
        ).astype(
            np.float32,
            copy=False,
        )
        if negative_parts
        else np.empty(
            (
                0,
                feature_count,
            ),
            dtype=np.float32,
        )
    )

    positive_weights = (
        np.concatenate(
            positive_weight_parts
        ).astype(
            np.float32,
            copy=False,
        )
        if positive_weight_parts
        else np.empty(
            (0,),
            dtype=np.float32,
        )
    )

    negative_weights = (
        np.concatenate(
            negative_weight_parts
        ).astype(
            np.float32,
            copy=False,
        )
        if negative_weight_parts
        else np.empty(
            (0,),
            dtype=np.float32,
        )
    )

    if training_positive.shape[0] < 8:
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Features needs positive "
                "examples in the current image "
                "or at least one selected "
                "training source."
            ),
        )

    if training_negative.shape[0] < 8:
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Features needs negative/"
                "context examples in the current "
                "image or selected training sources."
            ),
        )

    training_x = np.vstack([
        training_positive,
        training_negative,
    ]).astype(
        np.float32,
        copy=False,
    )

    training_y = np.concatenate([
        np.ones(
            training_positive.shape[0],
            dtype=np.uint8,
        ),
        np.zeros(
            training_negative.shape[0],
            dtype=np.uint8,
        ),
    ])

    training_weights = np.concatenate([
        positive_weights,
        negative_weights,
    ]).astype(
        np.float32,
        copy=False,
    )

    classifier = LogisticRegression(
        solver="liblinear",
        class_weight="balanced",
        C=1.0,
        max_iter=300,
        random_state=1729,
    )

    try:
        classifier.fit(
            training_x,
            training_y,
            sample_weight=
                training_weights,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Features could not fit "
                "the weighted multi-image "
                "classifier: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    flat_embeddings = embeddings.reshape(
        -1,
        embeddings.shape[2],
    )

    probability_grid = (
        classifier.predict_proba(
            flat_embeddings
        )[:, 1]
        .reshape(
            grid_height,
            grid_width,
        )
        .astype(
            np.float32,
            copy=False,
        )
    )

    probability_map = (
        F.interpolate(
            torch.from_numpy(
                probability_grid
            ).view(
                1,
                1,
                grid_height,
                grid_width,
            ),
            size=(
                original_height,
                original_width,
            ),
            mode="bilinear",
            align_corners=False,
        )[0, 0]
        .numpy()
        .astype(
            np.float32,
            copy=False,
        )
    )

    probability_threshold = float(
        np.clip(
            (
                0.50
                + (
                    (
                        50.0
                        - float(
                            sensitivity
                        )
                    )
                    / 50.0
                )
                * 0.20
            ),
            0.25,
            0.75,
        )
    )

    return {
        "positiveSamples":
            training_positive,
        "negativeSamples":
            training_negative,
        "positiveFeedbackSamples":
            positive_feedback_samples,
        "negativeFeedbackSamples":
            negative_feedback_samples,
        "probabilityMap":
            probability_map,
        "threshold":
            probability_threshold,
        "trainingSources":
            training_source_reports,
        "auxiliaryPositiveSamples":
            int(
                auxiliary_positive.shape[0]
            ),
        "auxiliaryNegativeSamples":
            int(
                auxiliary_negative.shape[0]
            ),
        "model": {
            "type":
                "deep-features-resnet18-v2",
            "learningModel":
                "B",
            "learningModelLabel":
                "Deep Features",
            "backbone":
                (
                    "resnet18-layer2-"
                    "imagenet1k-v1"
                ),
            "embeddingDimensions":
                int(
                    embeddings.shape[2]
                ),
            "embeddingStrideApprox":
                8,
            "classifier":
                (
                    "weighted-logistic-"
                    "regression"
                ),
            "trainingUnits":
                "embedding-grid-cells",
            "analysisInputWidth":
                int(
                    analysis_width
                ),
            "analysisInputHeight":
                int(
                    analysis_height
                ),
            "deepGridWidth":
                int(
                    grid_width
                ),
            "deepGridHeight":
                int(
                    grid_height
                ),
            "computeDevice":
                used_device,
            "devicePolicy":
                "auto",
            "acceleratorUsed":
                used_device
                in {
                    "cuda",
                    "mps",
                },
            "deviceFallbackReason":
                fallback_reason,
            "multiImage":
                training_mode == "set",
            "similarityBasis":
                "deep-resnet18-cosine",
            "currentImageWeight":
                1.0,
            "auxiliaryPositiveMaximumTotal":
                12000,
            "auxiliaryNegativeMaximumTotal":
                12000,
            "targetAbsentAuxiliaryWeightCap":
                0.45,
            "embeddingCacheVersion":
                _IL10_B_EMBEDDING_CACHE_VERSION,
            "embeddingCachePersistent":
                True,
            "currentEmbeddingCacheHit":
                bool(
                    current_embedding_cache[
                        "hit"
                    ]
                ),
            "currentEmbeddingCacheSource":
                current_embedding_cache[
                    "source"
                ],
            "currentEmbeddingCacheKey":
                current_embedding_cache[
                    "key"
                ],
            "auxiliaryEmbeddingCacheHits":
                int(
                    sum(
                        1
                        for report
                        in training_source_reports
                        if bool(
                            report.get(
                                "embeddingCacheHit"
                            )
                        )
                    )
                ),
            "auxiliaryEmbeddingCacheMisses":
                int(
                    sum(
                        1
                        for report
                        in training_source_reports
                        if not bool(
                            report.get(
                                "embeddingCacheHit"
                            )
                        )
                    )
                ),
        },
    }


def _il11_c_mask_to_grid(
    mask: np.ndarray,
    grid_height: int,
    grid_width: int,
    torch_module: Any,
) -> np.ndarray:
    import torch.nn.functional as F

    tensor = torch_module.from_numpy(
        np.asarray(mask, dtype=np.float32)
    ).view(
        1,
        1,
        int(mask.shape[0]),
        int(mask.shape[1]),
    )

    pooled = F.adaptive_max_pool2d(
        tensor,
        (int(grid_height), int(grid_width)),
    )

    return (
        pooled[0, 0]
        .detach()
        .cpu()
        .numpy()
        > 0.0
    )


def _il11_c_embedding_descriptor(
    embeddings: np.ndarray,
    valid_grid: np.ndarray | None = None,
) -> np.ndarray:
    if (
        embeddings.ndim != 3
        or embeddings.shape[2] <= 0
    ):
        return np.empty(
            (0,),
            dtype=np.float32,
        )

    flat = embeddings.reshape(
        -1,
        embeddings.shape[2],
    ).astype(
        np.float32,
        copy=False,
    )

    if (
        isinstance(valid_grid, np.ndarray)
        and valid_grid.shape == embeddings.shape[:2]
        and np.any(valid_grid)
    ):
        flat = flat[
            valid_grid.reshape(-1)
        ]

    if flat.shape[0] == 0:
        return np.empty(
            (embeddings.shape[2],),
            dtype=np.float32,
        )

    if flat.shape[0] > 20000:
        step = max(
            1,
            flat.shape[0] // 20000,
        )
        flat = flat[::step][:20000]

    norms = np.linalg.norm(
        flat,
        axis=1,
        keepdims=True,
    )

    normalized = (
        flat
        / np.maximum(
            norms,
            1e-6,
        )
    )

    descriptor = np.mean(
        normalized,
        axis=0,
        dtype=np.float64,
    ).astype(
        np.float32,
    )

    descriptor_norm = float(
        np.linalg.norm(
            descriptor
        )
    )

    if descriptor_norm > 1e-6:
        descriptor = (
            descriptor
            / descriptor_norm
        ).astype(
            np.float32,
            copy=False,
        )

    return descriptor


def _il11_c_embedding_similarity(
    current_descriptor: np.ndarray,
    auxiliary_descriptor: np.ndarray,
    same_physical_image: bool,
) -> float:
    if same_physical_image:
        return 1.0

    if (
        current_descriptor.ndim != 1
        or auxiliary_descriptor.ndim != 1
        or current_descriptor.size == 0
        or auxiliary_descriptor.size == 0
        or current_descriptor.shape != auxiliary_descriptor.shape
    ):
        return 0.0

    current_norm = float(
        np.linalg.norm(
            current_descriptor
        )
    )

    auxiliary_norm = float(
        np.linalg.norm(
            auxiliary_descriptor
        )
    )

    if (
        current_norm <= 1e-6
        or auxiliary_norm <= 1e-6
    ):
        return 0.0

    cosine = float(
        np.dot(
            current_descriptor,
            auxiliary_descriptor,
        )
        / (
            current_norm
            * auxiliary_norm
        )
    )

    cosine = float(
        np.clip(
            cosine,
            -1.0,
            1.0,
        )
    )

    distance = max(
        0.0,
        1.0 - cosine,
    )

    similarity = float(
        np.exp(
            -2.5 * distance
        )
    )

    return float(
        np.clip(
            similarity,
            0.0,
            1.0,
        )
    )


def _il11_c_auxiliary_source(
    source_image_id: str,
    annotation_file: str,
    target_class: str,
    torch_module: Any,
    device: str,
    current_relative: str,
    current_descriptor: np.ndarray,
) -> dict[str, Any]:
    annotation_file = normalize_annotation_file(
        annotation_file
    )

    path, relative = safe_image_path(
        source_image_id
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
            detail=(
                "Training source image is not ready: "
                f"{path.name}"
            ),
        )

    image_types = _read_image_types()

    image_type = str(
        image_types.get(
            relative,
            "he",
        )
        or "he"
    ).lower()

    if image_type == "fluorescence":
        raise HTTPException(
            status_code=422,
            detail=(
                "Fluorescence images cannot currently "
                "be used as Deep Spatial training sources"
            ),
        )

    collection = _il6_read_annotation_collection(
        relative,
        annotation_file,
    )

    features = collection.get(
        "features",
        [],
    )

    render_path = resolve_render_path(
        path,
        relative,
    )

    handle = get_slide(
        render_path
    )

    full_width, full_height = map(
        int,
        handle.slide.dimensions,
    )

    maximum_side = (
        896
        if device == "cuda"
        else 704
    )

    thumbnail = handle.slide.get_thumbnail(
        (
            maximum_side,
            maximum_side,
        )
    ).convert(
        "RGB"
    )

    rgb = np.asarray(
        thumbnail,
        dtype=np.uint8,
    )

    thumb_height, thumb_width = rgb.shape[:2]

    if (
        thumb_width <= 1
        or thumb_height <= 1
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not create Deep Spatial training "
                f"thumbnail for {path.name}"
            ),
        )

    scale_x = (
        full_width
        / float(thumb_width)
    )

    scale_y = (
        full_height
        / float(thumb_height)
    )

    roi_mask = np.zeros(
        (
            thumb_height,
            thumb_width,
        ),
        dtype=bool,
    )

    roi_present = False

    artifact_mask = np.zeros_like(
        roi_mask
    )

    positive_mask = np.zeros_like(
        roi_mask
    )

    explicit_negative_mask = np.zeros_like(
        roi_mask
    )

    all_annotation_mask = np.zeros_like(
        roi_mask
    )

    target_cf = target_class.casefold()

    target_annotations = 0
    negative_annotations = 0

    for feature in features:
        if not isinstance(feature, dict):
            continue

        role = _il1_feature_role(
            feature
        )

        class_name = _il1_feature_class(
            feature
        )

        class_cf = class_name.casefold()

        geometry_payload = feature.get(
            "geometry"
        )

        if not geometry_payload:
            continue

        feature_mask = _il1_geometry_mask(
            geometry_payload,
            thumb_width,
            thumb_height,
            scale_x,
            scale_y,
        )

        if not np.any(
            feature_mask
        ):
            continue

        if role == "roi":
            roi_present = True
            roi_mask |= feature_mask
            continue

        if (
            role == "artifact"
            or class_cf == "artifact"
            or (
                class_cf == "anthracosis"
                and target_cf != "anthracosis"
            )
        ):
            artifact_mask |= feature_mask
            continue

        if role != "annotation":
            continue

        all_annotation_mask |= feature_mask

        if class_cf == target_cf:
            target_annotations += 1
            positive_mask |= feature_mask
        else:
            negative_annotations += 1
            explicit_negative_mask |= feature_mask

    valid_mask = (
        roi_mask.copy()
        if roi_present
        else np.ones_like(roi_mask)
    )

    valid_mask &= ~artifact_mask

    positive_mask &= valid_mask
    explicit_negative_mask &= valid_mask
    explicit_negative_mask &= ~positive_mask
    all_annotation_mask &= valid_mask

    positive_pixels = int(
        np.count_nonzero(
            positive_mask
        )
    )

    target_present = bool(
        target_annotations > 0
        and positive_pixels >= 12
    )

    if target_present:
        explicit_pixels = int(
            np.count_nonzero(
                explicit_negative_mask
            )
        )

        minimum_explicit = max(
            32,
            int(
                positive_pixels
                * 0.15
            ),
        )

        if explicit_pixels >= minimum_explicit:
            negative_mask = explicit_negative_mask
            negative_source = (
                "other annotated classes"
            )
        else:
            negative_mask = (
                valid_mask
                & ~positive_mask
                & ~all_annotation_mask
            )
            negative_source = (
                "unlabeled valid tissue"
            )

    else:
        # Target-absent auxiliaries are safe weak negatives only.
        positive_mask = np.zeros_like(
            valid_mask
        )

        negative_mask = explicit_negative_mask

        negative_source = (
            "target-absent explicit annotated negatives"
        )

    (
        embeddings,
        analysis_height,
        analysis_width,
        cache_info,
    ) = _il10_b_cached_embedding_grid(
        rgb,
        torch_module,
        device,
        maximum_side,
        source_image_id,
    )

    grid_height, grid_width, _dims = map(
        int,
        embeddings.shape,
    )

    positive_grid = _il11_c_mask_to_grid(
        positive_mask,
        grid_height,
        grid_width,
        torch_module,
    )

    negative_grid = _il11_c_mask_to_grid(
        negative_mask,
        grid_height,
        grid_width,
        torch_module,
    )

    valid_grid = _il11_c_mask_to_grid(
        valid_mask,
        grid_height,
        grid_width,
        torch_module,
    )

    negative_grid &= ~positive_grid

    same_physical_image = bool(
        relative == current_relative
    )

    descriptor = _il11_c_embedding_descriptor(
        embeddings,
        valid_grid,
    )

    similarity = _il11_c_embedding_similarity(
        current_descriptor,
        descriptor,
        same_physical_image,
    )

    effective_weight = float(
        np.clip(
            0.20
            + 0.65
            * (
                similarity
                ** 1.35
            ),
            0.20,
            0.85,
        )
    )

    if not target_present:
        effective_weight = min(
            effective_weight,
            0.45,
        )

    positive_cells = int(
        np.count_nonzero(
            positive_grid
        )
    )

    negative_cells = int(
        np.count_nonzero(
            negative_grid
        )
    )

    return {
        "imageId": source_image_id,
        "imageName": path.name,
        "relative": relative,
        "annotationFile": annotation_file,
        "targetPresent": target_present,
        "targetAnnotations": target_annotations,
        "negativeAnnotations": negative_annotations,
        "negativeSource": negative_source,
        "embeddings": embeddings,
        "positiveGrid": positive_grid,
        "negativeGrid": negative_grid,
        "validGrid": valid_grid,
        "positiveGridCells": positive_cells,
        "negativeGridCells": negative_cells,
        "samePhysicalImage": same_physical_image,
        "deepSimilarity": similarity,
        "appearanceSimilarity": similarity,
        "effectiveWeight": effective_weight,
        "analysisInputWidth": int(
            analysis_width
        ),
        "analysisInputHeight": int(
            analysis_height
        ),
        "embeddingCacheHit": bool(
            cache_info.get(
                "hit"
            )
        ),
        "embeddingCacheSource": cache_info.get(
            "source"
        ),
        "embeddingCacheKey": cache_info.get(
            "key"
        ),
    }


def _il11_c_spatial_probability_map(
    image_id: str,
    rgb: np.ndarray,
    positive_mask: np.ndarray,
    negative_mask: np.ndarray,
    positive_feedback_mask: np.ndarray,
    negative_feedback_mask: np.ndarray,
    valid_mask: np.ndarray,
    sensitivity: float,
    rng: np.random.Generator,
    current_annotation_file: str,
    target_class: str,
    training_mode: str,
    raw_training_sources: list[Any],
    max_side: int,
) -> dict[str, Any]:
    try:
        import torch
        import torch.nn as nn
        import torch.nn.functional as F
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Deep Spatial requires PyTorch: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    if (
        rgb.ndim != 3
        or rgb.shape[2] != 3
        or rgb.shape[:2] != positive_mask.shape
        or rgb.shape[:2] != negative_mask.shape
        or rgb.shape[:2] != valid_mask.shape
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Spatial received an invalid RGB/mask layout"
            ),
        )

    original_height, original_width = map(
        int,
        rgb.shape[:2],
    )

    current_path, current_relative = safe_image_path(
        image_id
    )

    requested_device = _il10_b_device(
        torch
    )

    current_maximum_side = (
        1280
        if requested_device == "cuda"
        else 896
    )

    used_device = requested_device
    fallback_reason = None

    try:
        (
            embeddings,
            analysis_height,
            analysis_width,
            cache_info,
        ) = _il10_b_cached_embedding_grid(
            rgb,
            torch,
            requested_device,
            current_maximum_side,
            image_id,
        )

    except RuntimeError as exc:
        if requested_device != "cuda":
            raise

        used_device = "cpu"
        current_maximum_side = 896

        fallback_reason = (
            "CUDA embedding extraction failed; "
            f"used CPU fallback: {type(exc).__name__}"
        )

        (
            embeddings,
            analysis_height,
            analysis_width,
            cache_info,
        ) = _il10_b_cached_embedding_grid(
            rgb,
            torch,
            used_device,
            current_maximum_side,
            image_id,
        )

    (
        grid_height,
        grid_width,
        embedding_dimensions,
    ) = map(
        int,
        embeddings.shape,
    )

    base_positive_grid = _il11_c_mask_to_grid(
        positive_mask,
        grid_height,
        grid_width,
        torch,
    )

    base_negative_grid = _il11_c_mask_to_grid(
        negative_mask,
        grid_height,
        grid_width,
        torch,
    )

    feedback_positive_grid = _il11_c_mask_to_grid(
        positive_feedback_mask,
        grid_height,
        grid_width,
        torch,
    )

    feedback_negative_grid = _il11_c_mask_to_grid(
        negative_feedback_mask,
        grid_height,
        grid_width,
        torch,
    )

    current_valid_grid = _il11_c_mask_to_grid(
        valid_mask,
        grid_height,
        grid_width,
        torch,
    )

    training_positive_grid = (
        base_positive_grid
        | feedback_positive_grid
    )

    training_negative_grid = (
        base_negative_grid
        | feedback_negative_grid
    )

    training_positive_grid &= (
        ~feedback_negative_grid
    )

    training_negative_grid &= (
        ~feedback_positive_grid
    )

    training_negative_grid &= (
        ~training_positive_grid
    )

    current_positive_cells = int(
        np.count_nonzero(
            training_positive_grid
        )
    )

    current_negative_cells = int(
        np.count_nonzero(
            training_negative_grid
        )
    )

    current_descriptor = _il11_c_embedding_descriptor(
        embeddings,
        current_valid_grid,
    )

    training_sets = []

    if (
        current_positive_cells > 0
        or current_negative_cells > 0
    ):
        training_sets.append({
            "imageId": image_id,
            "imageName": current_path.name,
            "annotationFile": current_annotation_file,
            "embeddings": embeddings,
            "positiveGrid": training_positive_grid,
            "negativeGrid": training_negative_grid,
            "feedbackPositiveGrid": feedback_positive_grid,
            "feedbackNegativeGrid": feedback_negative_grid,
            "effectiveWeight": 1.0,
            "current": True,
        })

    training_source_reports = []
    seen_sources = set()

    if training_mode == "set":
        for source in raw_training_sources[:12]:
            if not isinstance(source, dict):
                continue

            source_image_id = str(
                source.get(
                    "imageId",
                    "",
                )
                or ""
            ).strip()

            source_file = normalize_annotation_file(
                str(
                    source.get(
                        "annotationFile",
                        "Default",
                    )
                    or "Default"
                )
            )

            if not source_image_id:
                continue

            source_key = (
                source_image_id,
                source_file.casefold(),
            )

            if source_key in seen_sources:
                continue

            seen_sources.add(
                source_key
            )

            if (
                source_image_id == image_id
                and source_file.casefold()
                == current_annotation_file.casefold()
            ):
                continue

            source_result = _il11_c_auxiliary_source(
                source_image_id,
                source_file,
                target_class,
                torch,
                used_device,
                current_relative,
                current_descriptor,
            )

            source_positive_cells = int(
                source_result[
                    "positiveGridCells"
                ]
            )

            source_negative_cells = int(
                source_result[
                    "negativeGridCells"
                ]
            )

            if (
                source_positive_cells <= 0
                and source_negative_cells <= 0
            ):
                continue

            training_sets.append({
                "imageId": source_result[
                    "imageId"
                ],
                "imageName": source_result[
                    "imageName"
                ],
                "annotationFile": source_result[
                    "annotationFile"
                ],
                "embeddings": source_result[
                    "embeddings"
                ],
                "positiveGrid": source_result[
                    "positiveGrid"
                ],
                "negativeGrid": source_result[
                    "negativeGrid"
                ],
                "feedbackPositiveGrid": np.zeros_like(
                    source_result[
                        "positiveGrid"
                    ]
                ),
                "feedbackNegativeGrid": np.zeros_like(
                    source_result[
                        "negativeGrid"
                    ]
                ),
                "effectiveWeight": float(
                    source_result[
                        "effectiveWeight"
                    ]
                ),
                "current": False,
            })

            training_source_reports.append({
                "imageId": source_result[
                    "imageId"
                ],
                "imageName": source_result[
                    "imageName"
                ],
                "annotationFile": source_result[
                    "annotationFile"
                ],
                "targetPresent": bool(
                    source_result[
                        "targetPresent"
                    ]
                ),
                "targetAnnotations": int(
                    source_result[
                        "targetAnnotations"
                    ]
                ),
                "negativeAnnotations": int(
                    source_result[
                        "negativeAnnotations"
                    ]
                ),
                "positiveSamples": source_positive_cells,
                "negativeSamples": source_negative_cells,
                "positiveGridCells": source_positive_cells,
                "negativeGridCells": source_negative_cells,
                "negativeSource": source_result[
                    "negativeSource"
                ],
                "samePhysicalImage": bool(
                    source_result[
                        "samePhysicalImage"
                    ]
                ),
                "deepSimilarity": float(
                    source_result[
                        "deepSimilarity"
                    ]
                ),
                "appearanceSimilarity": float(
                    source_result[
                        "appearanceSimilarity"
                    ]
                ),
                "effectiveWeight": float(
                    source_result[
                        "effectiveWeight"
                    ]
                ),
                "similarityLabel": (
                    "same image"
                    if source_result[
                        "samePhysicalImage"
                    ]
                    else "deep spatial"
                ),
                "targetAbsentWeightCap": (
                    None
                    if source_result[
                        "targetPresent"
                    ]
                    else 0.45
                ),
                "embeddingCacheHit": bool(
                    source_result[
                        "embeddingCacheHit"
                    ]
                ),
                "embeddingCacheSource": source_result[
                    "embeddingCacheSource"
                ],
                "embeddingCacheKey": source_result[
                    "embeddingCacheKey"
                ],
            })

    total_positive_cells = sum(
        int(
            np.count_nonzero(
                item[
                    "positiveGrid"
                ]
            )
        )
        for item in training_sets
    )

    total_negative_cells = sum(
        int(
            np.count_nonzero(
                item[
                    "negativeGrid"
                ]
            )
        )
        for item in training_sets
    )

    if total_positive_cells < 2:
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Spatial needs positive annotations covering "
                "at least two deep-grid cells in the current image "
                "or selected training sources."
            ),
        )

    if total_negative_cells < 2:
        raise HTTPException(
            status_code=422,
            detail=(
                "Deep Spatial needs negative/context examples "
                "covering at least two deep-grid cells in the "
                "current image or selected training sources."
            ),
        )

    positive_batches = []
    negative_batches = []

    for item in training_sets:
        item_embeddings = item[
            "embeddings"
        ]

        positive_batches.append(
            _il10_b_sample_embeddings(
                item_embeddings,
                item[
                    "positiveGrid"
                ],
                (
                    8000
                    if item[
                        "current"
                    ]
                    else 3000
                ),
                rng,
            )
        )

        negative_batches.append(
            _il10_b_sample_embeddings(
                item_embeddings,
                item[
                    "negativeGrid"
                ],
                (
                    8000
                    if item[
                        "current"
                    ]
                    else 3000
                ),
                rng,
            )
        )

    positive_samples = _il6_cap_sample_pool(
        positive_batches,
        12000,
        rng,
        embedding_dimensions,
    )

    negative_samples = _il6_cap_sample_pool(
        negative_batches,
        12000,
        rng,
        embedding_dimensions,
    )

    positive_feedback_samples = _il10_b_sample_embeddings(
        embeddings,
        feedback_positive_grid,
        3000,
        rng,
    )

    negative_feedback_samples = _il10_b_sample_embeddings(
        embeddings,
        feedback_negative_grid,
        3000,
        rng,
    )

    hidden_1 = min(
        64,
        max(
            24,
            embedding_dimensions // 2,
        ),
    )

    hidden_2 = min(
        32,
        max(
            16,
            hidden_1 // 2,
        ),
    )

    torch.manual_seed(
        1729
    )

    if used_device == "cuda":
        try:
            torch.cuda.manual_seed_all(
                1729
            )
        except Exception:
            pass

    head = nn.Sequential(
        nn.Conv2d(
            embedding_dimensions,
            hidden_1,
            kernel_size=3,
            padding=1,
        ),
        nn.ReLU(
            inplace=True
        ),
        nn.Conv2d(
            hidden_1,
            hidden_2,
            kernel_size=3,
            padding=2,
            dilation=2,
        ),
        nn.ReLU(
            inplace=True
        ),
        nn.Conv2d(
            hidden_2,
            1,
            kernel_size=1,
        ),
    ).to(
        used_device
    )

    optimizer = torch.optim.AdamW(
        head.parameters(),
        lr=0.01,
        weight_decay=1e-4,
    )

    class_balance = float(
        np.clip(
            total_negative_cells
            / float(
                max(
                    1,
                    total_positive_cells,
                )
            ),
            0.25,
            4.0,
        )
    )

    positive_weight = torch.tensor(
        class_balance,
        dtype=torch.float32,
        device=used_device,
    )

    training_epochs = (
        (
            90
            if used_device == "cuda"
            else 60
        )
        if training_mode == "current"
        else (
            24
            if used_device == "cuda"
            else 16
        )
    )

    prepared_batches = []

    for item in training_sets:
        item_embeddings = item[
            "embeddings"
        ]

        item_grid_height, item_grid_width = (
            item_embeddings.shape[:2]
        )

        feature_tensor = (
            torch.from_numpy(
                np.ascontiguousarray(
                    item_embeddings.transpose(
                        2,
                        0,
                        1,
                    )
                )
            )
            .unsqueeze(0)
            .float()
            .to(used_device)
        )

        label_numpy = np.zeros(
            (
                item_grid_height,
                item_grid_width,
            ),
            dtype=np.float32,
        )

        label_numpy[
            item[
                "positiveGrid"
            ]
        ] = 1.0

        train_numpy = (
            item[
                "positiveGrid"
            ]
            | item[
                "negativeGrid"
            ]
        ).astype(
            np.float32
        )

        supervision_weight_numpy = np.ones(
            (
                item_grid_height,
                item_grid_width,
            ),
            dtype=np.float32,
        )

        if item[
            "current"
        ]:
            supervision_weight_numpy[
                item[
                    "feedbackPositiveGrid"
                ]
                | item[
                    "feedbackNegativeGrid"
                ]
            ] = 2.5

        prepared_batches.append({
            "featureTensor": feature_tensor,
            "labelTensor": (
                torch.from_numpy(
                    label_numpy
                )
                .view(
                    1,
                    1,
                    item_grid_height,
                    item_grid_width,
                )
                .to(used_device)
            ),
            "trainTensor": (
                torch.from_numpy(
                    train_numpy
                )
                .view(
                    1,
                    1,
                    item_grid_height,
                    item_grid_width,
                )
                .to(used_device)
            ),
            "supervisionWeightTensor": (
                torch.from_numpy(
                    supervision_weight_numpy
                )
                .view(
                    1,
                    1,
                    item_grid_height,
                    item_grid_width,
                )
                .to(used_device)
            ),
            "effectiveWeight": float(
                item[
                    "effectiveWeight"
                ]
            ),
            "current": bool(
                item[
                    "current"
                ]
            ),
        })

    final_loss = None

    head.train()

    for _epoch in range(
        training_epochs
    ):
        optimizer.zero_grad(
            set_to_none=True
        )

        total_loss = None
        total_source_weight = 0.0

        for batch in prepared_batches:
            logits = head(
                batch[
                    "featureTensor"
                ]
            )

            pixel_loss = (
                F.binary_cross_entropy_with_logits(
                    logits,
                    batch[
                        "labelTensor"
                    ],
                    reduction="none",
                    pos_weight=positive_weight,
                )
            )

            weighted_mask = (
                batch[
                    "trainTensor"
                ]
                * batch[
                    "supervisionWeightTensor"
                ]
            )

            supervised_loss = (
                (
                    pixel_loss
                    * weighted_mask
                ).sum()
                / weighted_mask.sum().clamp_min(
                    1.0
                )
            )

            probability = torch.sigmoid(
                logits
            )

            spatial_x = (
                probability[
                    :,
                    :,
                    :,
                    1:,
                ]
                - probability[
                    :,
                    :,
                    :,
                    :-1,
                ]
            ).abs().mean()

            spatial_y = (
                probability[
                    :,
                    :,
                    1:,
                    :,
                ]
                - probability[
                    :,
                    :,
                    :-1,
                    :,
                ]
            ).abs().mean()

            source_loss = (
                supervised_loss
                + 0.01
                * (
                    spatial_x
                    + spatial_y
                )
            )

            source_weight = float(
                batch[
                    "effectiveWeight"
                ]
            )

            weighted_source_loss = (
                source_loss
                * source_weight
            )

            total_loss = (
                weighted_source_loss
                if total_loss is None
                else (
                    total_loss
                    + weighted_source_loss
                )
            )

            total_source_weight += source_weight

        if total_loss is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Deep Spatial did not find usable "
                    "training supervision."
                ),
            )

        loss = (
            total_loss
            / max(
                total_source_weight,
                1e-6,
            )
        )

        loss.backward()
        optimizer.step()

        final_loss = float(
            loss.detach().cpu()
        )

    head.eval()

    current_batch = None

    for batch in prepared_batches:
        if batch[
            "current"
        ]:
            current_batch = batch
            break

    if current_batch is None:
        current_feature_tensor = (
            torch.from_numpy(
                np.ascontiguousarray(
                    embeddings.transpose(
                        2,
                        0,
                        1,
                    )
                )
            )
            .unsqueeze(0)
            .float()
            .to(used_device)
        )
    else:
        current_feature_tensor = current_batch[
            "featureTensor"
        ]

    with torch.inference_mode():
        logits = head(
            current_feature_tensor
        )

        probability_grid = torch.sigmoid(
            logits
        )

        probability_map = (
            F.interpolate(
                probability_grid,
                size=(
                    original_height,
                    original_width,
                ),
                mode="bilinear",
                align_corners=False,
            )[0, 0]
            .detach()
            .cpu()
            .numpy()
            .astype(
                np.float32,
                copy=False,
            )
        )

    threshold = float(
        np.clip(
            0.50
            + (
                (
                    50.0
                    - float(
                        sensitivity
                    )
                )
                / 50.0
            )
            * 0.20,
            0.25,
            0.75,
        )
    )

    auxiliary_cache_hits = sum(
        1
        for item in training_source_reports
        if item.get(
            "embeddingCacheHit"
        )
    )

    auxiliary_cache_misses = sum(
        1
        for item in training_source_reports
        if not item.get(
            "embeddingCacheHit"
        )
    )

    return {
        "positiveSamples": positive_samples,
        "negativeSamples": negative_samples,
        "positiveFeedbackSamples": positive_feedback_samples,
        "negativeFeedbackSamples": negative_feedback_samples,
        "probabilityMap": probability_map,
        "threshold": threshold,
        "trainingSources": training_source_reports,
        "model": {
            "type": "deep-spatial-resnet18-head-v2",
            "learningModel": "C",
            "learningModelLabel": "Deep Spatial",
            "backbone": "resnet18-layer2-imagenet1k-v1",
            "encoderTrainable": False,
            "segmentationHead": (
                "conv3x3-relu-dilated3x3-relu-conv1x1"
            ),
            "headTrainable": True,
            "trainingMode": training_mode,
            "trainingUnits": (
                "spatial-embedding-grid-cells"
            ),
            "embeddingDimensions": embedding_dimensions,
            "embeddingStrideApprox": 8,
            "spatialContext": (
                "convolutional-neighbourhood"
            ),
            "analysisInputWidth": int(
                analysis_width
            ),
            "analysisInputHeight": int(
                analysis_height
            ),
            "deepGridWidth": grid_width,
            "deepGridHeight": grid_height,
            "positiveGridCells": total_positive_cells,
            "negativeGridCells": total_negative_cells,
            "currentPositiveGridCells": current_positive_cells,
            "currentNegativeGridCells": current_negative_cells,
            "trainingEpochs": training_epochs,
            "trainingImages": len(
                training_sets
            ),
            "finalTrainingLoss": final_loss,
            "computeDevice": used_device,
            "devicePolicy": "auto",
            "acceleratorUsed": (
                used_device
                in {
                    "cuda",
                    "mps",
                }
            ),
            "deviceFallbackReason": fallback_reason,
            "embeddingCacheHit": bool(
                cache_info.get(
                    "hit"
                )
            ),
            "embeddingCacheSource": cache_info.get(
                "source"
            ),
            "embeddingCacheKey": cache_info.get(
                "key"
            ),
            "auxiliaryEmbeddingCacheHits": auxiliary_cache_hits,
            "auxiliaryEmbeddingCacheMisses": auxiliary_cache_misses,
        },
    }


@suggest_router.post("/api/interactive-learning/{image_id}/suggest")
def interactive_learning_suggest(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    target_class = str(
        payload.get("targetClass", "")
    ).strip()

    if not target_class:
        raise HTTPException(
            status_code=422,
            detail="targetClass is required",
        )

    learning_model = str(
        payload.get(
            "learningModel",
            "A",
        )
        or "A"
    ).strip().upper()

    if learning_model not in {
        "A",
        "B",
        "C",
    }:
        raise HTTPException(
            status_code=422,
            detail="learningModel must be A, B or C",
        )

    if target_class.casefold() == "artifact":
        raise HTTPException(
            status_code=422,
            detail=(
                "Artifact is an exclusion class and cannot "
                "be an IL1 target"
            ),
        )

    collection_payload = payload.get(
        "featureCollection"
    )
    if not isinstance(collection_payload, dict):
        raise HTTPException(
            status_code=422,
            detail="featureCollection is required",
        )

    collection, _report = sanitize_qupath_feature_collection(
        collection_payload
    )
    features = collection.get("features", [])

    max_side = min(
        1600,
        max(
            512,
            int(payload.get("maxSide", 1280) or 1280),
        ),
    )
    sensitivity = min(
        100.0,
        max(
            0.0,
            float(
                payload.get("sensitivity", 50)
                or 50
            ),
        ),
    )
    smoothing = min(
        100.0,
        max(
            0.0,
            float(
                payload.get("smoothing", 45)
                or 45
            ),
        ),
    )
    min_area_percent = min(
        5.0,
        max(
            0.0,
            float(
                payload.get("minAreaPercent", 0.02)
                or 0.02
            ),
        ),
    )
    max_suggestions = min(
        80,
        max(
            1,
            int(
                payload.get("maxSuggestions", 40)
                or 40
            ),
        ),
    )
    exclude_annotated = bool(
        payload.get("excludeAnnotated", True)
    )

    training_mode = str(
        payload.get(
            "trainingMode",
            "current",
        )
        or "current"
    ).strip().lower()

    if training_mode not in {
        "current",
        "set",
    }:
        training_mode = "current"

    current_annotation_file = normalize_annotation_file(
        str(
            payload.get(
                "currentAnnotationFile",
                "Default",
            )
            or "Default"
        )
    )

    raw_training_sources = (
        payload.get(
            "trainingSources",
            [],
        )
        if training_mode == "set"
        else []
    )

    if not isinstance(
        raw_training_sources,
        list,
    ):
        raw_training_sources = []

    raw_training_sources = raw_training_sources[:12]

    # Phase IL10.1 - B is functional for the current image.
    # Multi-image deep embedding extraction/caching is deferred to IL10.2.
    # Phase IL11.1 - C supports Current image and
    # Selected training set. Prediction remains current-image only.
    if learning_model == "C":
        deep_runtime = _il10_deep_runtime_capabilities()
        if not bool(deep_runtime.get("ready")):
            raise HTTPException(
                status_code=503,
                detail=(
                    "C · Deep Spatial is unavailable on this server: "
                    + str(
                        deep_runtime.get("reason")
                        or "PyTorch/torchvision runtime is not ready"
                    )
                ),
            )


    if learning_model == "B":
        deep_runtime = _il10_deep_runtime_capabilities()
        if not bool(deep_runtime.get("ready")):
            raise HTTPException(
                status_code=503,
                detail=(
                    "B · Deep Features is unavailable on this server: "
                    + str(deep_runtime.get("reason") or "PyTorch/torchvision runtime is not ready")
                ),
            )

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

    full_width, full_height = map(
        int,
        handle.slide.dimensions,
    )

    thumbnail = handle.slide.get_thumbnail(
        (max_side, max_side)
    ).convert("RGB")

    rgb = np.asarray(
        thumbnail,
        dtype=np.uint8,
    )

    thumb_height, thumb_width = rgb.shape[:2]

    if thumb_width <= 1 or thumb_height <= 1:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not create a usable learning "
                "thumbnail"
            ),
        )

    scale_x = full_width / float(thumb_width)
    scale_y = full_height / float(thumb_height)

    roi_mask = np.zeros(
        (thumb_height, thumb_width),
        dtype=bool,
    )
    roi_present = False

    artifact_mask = np.zeros_like(roi_mask)
    positive_mask = np.zeros_like(roi_mask)
    hard_positive_mask = np.zeros_like(roi_mask)
    reclassified_negative_mask = np.zeros_like(roi_mask)
    explicit_negative_mask = np.zeros_like(roi_mask)
    all_annotation_mask = np.zeros_like(roi_mask)

    positive_annotation_count = 0
    accepted_feedback_count = 0
    edited_feedback_count = 0
    reclassified_feedback_count = 0
    negative_annotation_count = 0
    artifact_count = 0

    target_cf = target_class.casefold()

    for feature in features:
        if not isinstance(feature, dict):
            continue

        role = _il1_feature_role(feature)
        class_name = _il1_feature_class(feature)
        class_cf = class_name.casefold()

        geometry_payload = feature.get("geometry")
        if not geometry_payload:
            continue

        feature_mask = _il1_geometry_mask(
            geometry_payload,
            thumb_width,
            thumb_height,
            scale_x,
            scale_y,
        )

        if not np.any(feature_mask):
            continue

        if role == "roi":
            roi_present = True
            roi_mask |= feature_mask
            continue

        if (
            role == "artifact"
            or class_cf == "artifact"
        ):
            artifact_count += 1
            artifact_mask |= feature_mask
            continue

        if (
            class_cf == "anthracosis"
            and target_cf != "anthracosis"
        ):
            artifact_mask |= feature_mask
            continue

        if role != "annotation":
            continue

        all_annotation_mask |= feature_mask

        il_metadata = (
            feature.get("properties", {})
            .get("histoannotator", {})
            .get("interactiveLearning", {})
        )

        if not isinstance(il_metadata, dict):
            il_metadata = {}

        il_source = str(
            il_metadata.get("source", "")
            or ""
        ).strip().upper()

        il_decision = str(
            il_metadata.get("decision", "")
            or ""
        ).strip().lower()

        original_target = str(
            il_metadata.get(
                "originalTargetClass",
                "",
            )
            or ""
        ).strip().casefold()

        if class_cf == target_cf:
            positive_annotation_count += 1
            positive_mask |= feature_mask

            if il_source.startswith("IL"):
                hard_positive_mask |= feature_mask

                if il_decision == "edited":
                    edited_feedback_count += 1
                elif il_decision == "reclassified":
                    reclassified_feedback_count += 1
                else:
                    accepted_feedback_count += 1
        else:
            negative_annotation_count += 1
            explicit_negative_mask |= feature_mask

            if (
                il_source.startswith("IL")
                and il_decision == "reclassified"
                and original_target == target_cf
            ):
                reclassified_negative_mask |= feature_mask

    valid_mask = (
        roi_mask.copy()
        if roi_present
        else np.ones_like(roi_mask)
    )
    valid_mask &= ~artifact_mask

    positive_mask &= valid_mask
    hard_positive_mask &= valid_mask
    reclassified_negative_mask &= valid_mask
    explicit_negative_mask &= valid_mask
    explicit_negative_mask &= ~positive_mask
    all_annotation_mask &= valid_mask

    rejected_feedback = _il2_feedback_items(
        payload,
        "rejected",
    )
    edited_feedback = _il2_feedback_items(
        payload,
        "edited",
    )

    rejected_feedback_mask = (
        _il2_feedback_mask(
            rejected_feedback,
            "geometry",
            thumb_width,
            thumb_height,
            scale_x,
            scale_y,
        )
        & valid_mask
    )

    edited_original_mask = (
        _il2_feedback_mask(
            edited_feedback,
            "originalGeometry",
            thumb_width,
            thumb_height,
            scale_x,
            scale_y,
        )
        & valid_mask
    )

    edited_corrected_mask = (
        _il2_feedback_mask(
            edited_feedback,
            "correctedGeometry",
            thumb_width,
            thumb_height,
            scale_x,
            scale_y,
        )
        & valid_mask
    )

    edited_removed_mask = (
        edited_original_mask
        & ~edited_corrected_mask
    )

    hard_negative_mask = (
        rejected_feedback_mask
        | edited_removed_mask
        | reclassified_negative_mask
    )

    hard_negative_mask &= ~positive_mask

    positive_pixels = int(
        np.count_nonzero(positive_mask)
    )
    valid_pixels = int(
        np.count_nonzero(valid_mask)
    )

    if (
        training_mode == "current"
        and (
            positive_annotation_count < 1
            or positive_pixels < 24
        )
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                f'Class "{target_class}" needs more '
                "annotated area before Interactive Learning "
                "can suggest regions."
            ),
        )

    if valid_pixels < 64:
        raise HTTPException(
            status_code=422,
            detail=(
                "The valid tissue region is too small "
                "for Interactive Learning"
            ),
        )

    explicit_negative_pixels = int(
        np.count_nonzero(
            explicit_negative_mask
        )
    )

    minimum_explicit_negative = max(
        64,
        int(positive_pixels * 0.20),
    )

    if (
        training_mode == "set"
        and positive_pixels < 24
    ):
        # If the current document has no target example, its unlabeled
        # tissue must not become a huge negative pool.
        negative_mask = explicit_negative_mask
        negative_source = "current explicit annotated classes"
    elif (
        explicit_negative_pixels
        >= minimum_explicit_negative
    ):
        negative_mask = explicit_negative_mask
        negative_source = "other annotated classes"
    else:
        negative_mask = (
            valid_mask
            & ~positive_mask
            & ~all_annotation_mask
        )
        negative_source = "unlabeled valid tissue"

    negative_pixels = int(
        np.count_nonzero(negative_mask)
    )

    if (
        training_mode == "current"
        and negative_pixels < 24
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Interactive Learning needs negative/context "
                "examples. Annotate another class or leave "
                "some valid tissue unannotated."
            ),
        )

    feature_cube = _il1_feature_cube(rgb)
    rng = np.random.default_rng(1729)
    deep_model_info: dict[str, Any] = {}

    if learning_model == "C":
        deep_result = _il11_c_spatial_probability_map(
            image_id,
            rgb,
            positive_mask,
            negative_mask,
            hard_positive_mask,
            hard_negative_mask,
            valid_mask,
            sensitivity,
            rng,
            current_annotation_file,
            target_class,
            training_mode,
            raw_training_sources,
            max_side,
        )
        positive_samples = deep_result["positiveSamples"]
        negative_samples = deep_result["negativeSamples"]
        positive_feedback_samples = deep_result[
            "positiveFeedbackSamples"
        ]
        negative_feedback_samples = deep_result[
            "negativeFeedbackSamples"
        ]
        tree_workers = 0
        probability_map = deep_result["probabilityMap"]
        probability_threshold = float(
            deep_result["threshold"]
        )
        deep_model_info = dict(
            deep_result["model"]
        )

        # IL11.1c: preserve Deep Spatial auxiliary-source reports.
        training_source_reports = list(
            deep_result.get(
                "trainingSources"
            )
            or deep_result.get(
                "trainingSourceReports"
            )
            or deep_model_info.get(
                "trainingSources"
            )
            or deep_model_info.get(
                "trainingSourceReports"
            )
            or []
        )

    elif learning_model == "B":
        deep_result = _il10_b_deep_feature_probability_map(
            rgb,
            positive_mask,
            negative_mask,
            hard_positive_mask,
            hard_negative_mask,
            valid_mask,
            sensitivity,
            rng,
            image_id=image_id,
            current_annotation_file=current_annotation_file,
            target_class=target_class,
            training_mode=training_mode,
            raw_training_sources=raw_training_sources,
            max_side=max_side,
        )

        positive_samples = deep_result[
            "positiveSamples"
        ]
        negative_samples = deep_result[
            "negativeSamples"
        ]
        positive_feedback_samples = deep_result[
            "positiveFeedbackSamples"
        ]
        negative_feedback_samples = deep_result[
            "negativeFeedbackSamples"
        ]

        training_source_reports = list(
            deep_result[
                "trainingSources"
            ]
        )

        tree_workers = 0

        probability_map = deep_result[
            "probabilityMap"
        ]

        probability_threshold = float(
            deep_result[
                "threshold"
            ]
        )

        deep_model_info = dict(
            deep_result[
                "model"
            ]
        )

    else:

        positive_samples = _il1_sample_features(
            feature_cube,
            positive_mask,
            40000,
            rng,
        )
        negative_samples = _il1_sample_features(
            feature_cube,
            negative_mask,
            40000,
            rng,
        )

        positive_feedback_samples = (
            _il1_sample_features(
                feature_cube,
                hard_positive_mask,
                12000,
                rng,
            )
        )

        negative_feedback_samples = (
            _il1_sample_features(
                feature_cube,
                hard_negative_mask,
                12000,
                rng,
            )
        )

        if positive_feedback_samples.shape[0]:
            positive_samples = np.vstack([
                positive_samples,
                positive_feedback_samples,
            ])

        if negative_feedback_samples.shape[0]:
            negative_samples = np.vstack([
                negative_samples,
                negative_feedback_samples,
            ])

        # IL8 reference appearance is always the currently viewed image.
        current_appearance_descriptor = (
            _il8_appearance_descriptor(
                feature_cube,
                valid_mask,
            )
        )

        # Phase IL6: selected image + annotation-file sources.
        training_source_reports: list[dict[str, Any]] = []
        auxiliary_positive_batches: list[np.ndarray] = []
        auxiliary_negative_batches: list[np.ndarray] = []

        if training_mode == "set":
            seen_sources: set[tuple[str, str]] = set()

            for source in raw_training_sources:
                if not isinstance(source, dict):
                    continue

                source_image_id = str(
                    source.get(
                        "imageId",
                        "",
                    )
                    or ""
                ).strip()

                source_file = normalize_annotation_file(
                    str(
                        source.get(
                            "annotationFile",
                            "Default",
                        )
                        or "Default"
                    )
                )

                if not source_image_id:
                    continue

                source_key = (
                    source_image_id,
                    source_file.casefold(),
                )

                if source_key in seen_sources:
                    continue

                seen_sources.add(source_key)

                # Live current document already uses transient featureCollection,
                # including local edits not yet synchronized.
                if (
                    source_image_id == image_id
                    and source_file.casefold()
                    == current_annotation_file.casefold()
                ):
                    continue

                source_result = _il6_auxiliary_training_samples(
                    source_image_id,
                    source_file,
                    target_class,
                    max_side,
                    rng,
                )

                same_physical_image = (
                    source_image_id == image_id
                )

                if same_physical_image:
                    # Same WSI pixels: annotation-file choice changes labels,
                    # not tissue appearance. This is the positive control for
                    # IL8 similarity and must be exactly 1.00.
                    similarity = {
                        "similarity": 1.0,
                        "distance": 0.0,
                        "label": "same image",
                        "weight": 0.85,
                    }
                else:
                    similarity = (
                        _il8_appearance_similarity(
                            current_appearance_descriptor,
                            source_result.get(
                                "appearanceDescriptor"
                            ),
                        )
                    )

                target_absent_weight_cap = None

                if not bool(
                    source_result[
                        "targetPresent"
                    ]
                ):
                    # A target-absent source can only contribute explicit
                    # negatives, so it should never approach the influence of
                    # a source containing positive examples of the target.
                    target_absent_weight_cap = 0.45
                    similarity["weight"] = min(
                        float(
                            similarity["weight"]
                        ),
                        target_absent_weight_cap,
                    )

                weighted_positive = (
                    _il8_weight_sample_batch(
                        source_result[
                            "positiveSamples"
                        ],
                        similarity["weight"],
                        rng,
                    )
                )
                weighted_negative = (
                    _il8_weight_sample_batch(
                        source_result[
                            "negativeSamples"
                        ],
                        similarity["weight"],
                        rng,
                    )
                )

                auxiliary_positive_batches.append(
                    weighted_positive
                )
                auxiliary_negative_batches.append(
                    weighted_negative
                )

                training_source_reports.append({
                    "imageId": source_result["imageId"],
                    "imageName": source_result["imageName"],
                    "annotationFile": source_result["annotationFile"],
                    "targetPresent": bool(
                        source_result["targetPresent"]
                    ),
                    "targetAnnotations": int(
                        source_result["targetAnnotations"]
                    ),
                    "negativeAnnotations": int(
                        source_result["negativeAnnotations"]
                    ),
                    "positiveSamplesRaw": int(
                        source_result["positiveSamples"].shape[0]
                    ),
                    "negativeSamplesRaw": int(
                        source_result["negativeSamples"].shape[0]
                    ),
                    "positiveSamples": int(
                        weighted_positive.shape[0]
                    ),
                    "negativeSamples": int(
                        weighted_negative.shape[0]
                    ),
                    "negativeSource": source_result["negativeSource"],
                    "appearanceSimilarity": float(
                        similarity["similarity"]
                    ),
                    "appearanceDistance": (
                        float(
                            similarity["distance"]
                        )
                        if similarity["distance"] is not None
                        else None
                    ),
                    "similarityLabel": similarity["label"],
                    "effectiveWeight": float(
                        similarity["weight"]
                    ),
                    "samePhysicalImage": bool(
                        same_physical_image
                    ),
                    "targetAbsentWeightCap": (
                        float(
                            target_absent_weight_cap
                        )
                        if target_absent_weight_cap
                        is not None
                        else None
                    ),
                    "descriptorSamples": int(
                        (
                            source_result.get(
                                "appearanceDescriptor"
                            )
                            or {}
                        ).get(
                            "samples",
                            0,
                        )
                    ),
                })

            # Auxiliary budgets remain below the current image 40k/40k budget.
            auxiliary_positive = _il6_cap_sample_pool(
                auxiliary_positive_batches,
                12000,
                rng,
                feature_cube.shape[2],
            )

            auxiliary_negative = _il6_cap_sample_pool(
                auxiliary_negative_batches,
                12000,
                rng,
                feature_cube.shape[2],
            )

            if auxiliary_positive.shape[0]:
                positive_samples = np.vstack([
                    positive_samples,
                    auxiliary_positive,
                ])

            if auxiliary_negative.shape[0]:
                negative_samples = np.vstack([
                    negative_samples,
                    auxiliary_negative,
                ])

        if positive_samples.shape[0] < 24:
            raise HTTPException(
                status_code=422,
                detail=(
                    f'Class "{target_class}" needs positive examples '
                    "in the current image or at least one selected "
                    "training source."
                ),
            )

        if negative_samples.shape[0] < 24:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Interactive Learning needs negative/context "
                    "examples in the current image or selected "
                    "training sources."
                ),
            )

        # Phase IL4 - nonlinear Extra Trees appearance model
        training_x = np.vstack([
            positive_samples,
            negative_samples,
        ]).astype(
            np.float32,
            copy=False,
        )

        training_y = np.concatenate([
            np.ones(
                positive_samples.shape[0],
                dtype=np.uint8,
            ),
            np.zeros(
                negative_samples.shape[0],
                dtype=np.uint8,
            ),
        ])

        tree_workers = min(
            4,
            max(
                1,
                int(os.cpu_count() or 1),
            ),
        )

        classifier = ExtraTreesClassifier(
            n_estimators=48,
            max_depth=18,
            min_samples_leaf=8,
            max_features="sqrt",
            class_weight="balanced",
            random_state=1729,
            n_jobs=tree_workers,
        )

        classifier.fit(
            training_x,
            training_y,
        )

        classes = [
            int(value)
            for value
            in classifier.classes_.tolist()
        ]

        if 1 not in classes:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Interactive Learning could not "
                    "train a positive class."
                ),
            )

        positive_column = classes.index(1)

        probability_threshold = float(
            np.clip(
                (
                    0.50
                    + (
                        (50.0 - sensitivity)
                        / 50.0
                    )
                    * 0.20
                ),
                0.30,
                0.70,
            )
        )

        flat_features = feature_cube.reshape(
            -1,
            feature_cube.shape[2],
        )

        probability_flat = np.empty(
            flat_features.shape[0],
            dtype=np.float32,
        )

        inference_chunk = 200000

        for chunk_start in range(
            0,
            flat_features.shape[0],
            inference_chunk,
        ):
            chunk_end = min(
                flat_features.shape[0],
                chunk_start + inference_chunk,
            )

            chunk_probability = (
                classifier.predict_proba(
                    flat_features[
                        chunk_start:
                        chunk_end
                    ]
                )[:, positive_column]
            )

            probability_flat[
                chunk_start:
                chunk_end
            ] = chunk_probability.astype(
                np.float32,
                copy=False,
            )

        probability_map = (
            probability_flat.reshape(
                thumb_height,
                thumb_width,
            )
        )

    candidate_mask = valid_mask.copy()

    if exclude_annotated:
        candidate_mask &= ~all_annotation_mask
    else:
        candidate_mask &= ~positive_mask

    prediction = (
        (
            probability_map
            >= probability_threshold
        )
        & candidate_mask
    )

    smoothing_passes = int(
        round(
            (smoothing / 100.0) * 3.0
        )
    )

    prediction = _il1_majority_smooth(
        prediction,
        smoothing_passes,
    )
    prediction &= candidate_mask

    predicted_pixels = int(
        np.count_nonzero(prediction)
    )

    model_payload = {
        "type": "extra-trees-v1",
        "estimators": 48,
        "maxDepth": 18,
        "minSamplesLeaf": 8,
        "workers": tree_workers,
        "targetClass": target_class,
        "positiveAnnotations":
            positive_annotation_count,
        "negativeAnnotations":
            negative_annotation_count,
        "positiveTrainingPixels":
            int(positive_samples.shape[0]),
        "negativeTrainingPixels":
            int(negative_samples.shape[0]),
        "positiveFeedbackPixels":
            int(positive_feedback_samples.shape[0]),
        "negativeFeedbackPixels":
            int(negative_feedback_samples.shape[0]),
        "acceptedFeedbackAnnotations":
            accepted_feedback_count,
        "editedFeedbackAnnotations":
            edited_feedback_count,
        "reclassifiedFeedbackAnnotations":
            reclassified_feedback_count,
        "rejectedFeedbackRegions":
            len(rejected_feedback),
        "editedFeedbackRegions":
            len(edited_feedback),
        "feedbackUsed":
            bool(
                positive_feedback_samples.shape[0]
                or negative_feedback_samples.shape[0]
            ),
        "negativeSource": negative_source,
        "thumbnailWidth": thumb_width,
        "thumbnailHeight": thumb_height,
        "sensitivity": sensitivity,
        "smoothing": smoothing,
        "analysisRegion": (
            "Tissue ROI - Artifact"
            if roi_present
            else "Full image - Artifact"
        ),
    }

    model_payload["learningModel"] = learning_model
    model_payload["devicePolicy"] = "auto"
    if learning_model == "B":
        model_payload.update(deep_model_info)
        model_payload.update({
            "type": "deep-features-resnet18-v1",
            "estimators": None,
            "maxDepth": None,
            "minSamplesLeaf": None,
            "workers": 0,
        })
    elif learning_model == "C":
        model_payload.update(
            deep_model_info
        )
        model_payload.update({
            "type": "deep-spatial-resnet18-head-v2",
            "estimators": None,
            "maxDepth": None,
            "minSamplesLeaf": None,
            "workers": 0,
        })
    else:
        model_payload["learningModelLabel"] = "Classical"
        model_payload["computeDevice"] = "cpu"
        model_payload["acceleratorUsed"] = False

    model_payload["trainingMode"] = training_mode
    model_payload["currentImagePriority"] = {
        "basePositiveMaximum": 40000,
        "baseNegativeMaximum": 40000,
        "feedbackMaximumPerSign": 12000,
        "auxiliaryPositiveMaximumTotal": 12000,
        "auxiliaryNegativeMaximumTotal": 12000,
        "targetAbsentAuxiliaryNegativeMaximumPerSource": 1000,
        "auxiliaryUnlabeledTissueUsedAsNegative": False,
        "auxiliarySimilarityWeightRange": [
            0.20,
            0.85,
        ],
        "targetAbsentAuxiliaryWeightMaximum": 0.45,
    }
    model_payload["trainingSources"] = training_source_reports
    if learning_model == "B":
        model_payload["currentImagePriority"] = {
            "basePositiveMaximum": 8000,
            "baseNegativeMaximum": 8000,
            "feedbackMaximumPerSign": 3000,
            "auxiliaryPositiveMaximumTotal": 12000,
            "auxiliaryNegativeMaximumTotal": 12000,
            "representation": "resnet18-layer2-grid",
        }


    if learning_model == "C":
        model_payload["currentImagePriority"] = {
            "basePositiveMaximum": 8000,
            "baseNegativeMaximum": 8000,
            "feedbackMaximumPerSign": 3000,
            "auxiliaryPositiveMaximumTotal": 12000,
            "auxiliaryNegativeMaximumTotal": 12000,
            "auxiliarySourcesMaximum": 12,
            "targetAbsentAuxiliaryUsesExplicitNegativesOnly": True,
            "targetAbsentAuxiliaryWeightMaximum": 0.45,
            "representation": "resnet18-layer2-spatial-head",
            "spatialTraining": True,
            "encoderFrozen": True,
            "predictionImage": "current-only",
        }

    model_payload["auxiliaryWeighting"] = {
        "strategy":
            "robust-tissue-appearance-v1",
        "features":
            9,
        "descriptor":
            "median + IQR",
        "currentImageWeight":
            1.0,
        "auxiliaryWeightMinimum":
            0.20,
        "auxiliaryWeightMaximum":
            0.85,
        "targetAbsentAuxiliaryWeightMaximum":
            0.45,
        "similarityDecay":
            0.85,
        "weightExponent":
            1.35,
        "samePhysicalImageSimilarity":
            1.0,
        "unlabeledAuxiliaryTissueAsNegative":
            False,
    }

    if learning_model == "C":
        model_payload["auxiliaryWeighting"] = {
            "strategy": "deep-spatial-embedding-cosine-v1",
            "descriptor": (
                "mean L2-normalized ResNet18 layer2 embeddings"
            ),
            "currentImageWeight": 1.0,
            "auxiliaryWeightMinimum": 0.20,
            "auxiliaryWeightMaximum": 0.85,
            "targetAbsentAuxiliaryWeightMaximum": 0.45,
            "similarityDecay": 2.5,
            "weightExponent": 1.35,
            "samePhysicalImageSimilarity": 1.0,
            "targetAbsentUsesExplicitNegativesOnly": True,
            "predictionImage": "current-only",
        }

    if training_source_reports:
        model_payload[
            "meanAuxiliaryAppearanceSimilarity"
        ] = float(
            np.mean([
                float(
                    item.get(
                        "appearanceSimilarity",
                        0.5,
                    )
                )
                for item in training_source_reports
            ])
        )
    else:
        model_payload[
            "meanAuxiliaryAppearanceSimilarity"
        ] = None

    model_payload["auxiliarySourcesUsed"] = len(
        training_source_reports
    )
    model_payload["auxiliaryTargetPresentSources"] = sum(
        1
        for item in training_source_reports
        if item.get("targetPresent")
    )
    model_payload["auxiliaryTargetAbsentSources"] = sum(
        1
        for item in training_source_reports
        if not item.get("targetPresent")
    )

    if predicted_pixels == 0:
        return {
            "suggestions": [],
            "model": model_payload,
            "summary": {
                "predictedPixelsThumbnail": 0,
                "candidatePixelsThumbnail": int(
                    np.count_nonzero(
                        candidate_mask
                    )
                ),
                "validPixelsThumbnail":
                    valid_pixels,
                "artifactCount":
                    artifact_count,
                "returnedSuggestions": 0,
            },
        }

    geometry = _il1_mask_to_geometry(
        prediction,
        scale_x,
        scale_y,
    )

    image_bounds = box(
        0.0,
        0.0,
        float(full_width),
        float(full_height),
    )
    geometry = geometry.intersection(
        image_bounds
    )

    valid_area_approx = (
        valid_pixels
        * scale_x
        * scale_y
    )

    min_area_px2 = max(
        scale_x * scale_y * 3.0,
        valid_area_approx
        * (min_area_percent / 100.0),
    )

    # IL5.1: preserve more of the higher-resolution refined contour.
    simplify_tolerance = max(
        scale_x,
        scale_y,
    ) * 0.25

    candidates: list[dict[str, Any]] = []

    for polygon in _il1_polygon_parts(
        geometry
    ):
        if polygon.area < min_area_px2:
            continue

        simplified = polygon.simplify(
            simplify_tolerance,
            preserve_topology=True,
        )

        if simplified.is_empty:
            continue

        for part in _il1_polygon_parts(
            simplified
        ):
            if part.area < min_area_px2:
                continue

            point = part.representative_point()

            tx = min(
                thumb_width - 1,
                max(
                    0,
                    int(point.x / scale_x),
                ),
            )
            ty = min(
                thumb_height - 1,
                max(
                    0,
                    int(point.y / scale_y),
                ),
            )

            x0 = max(
                0,
                tx - 2,
            )
            x1 = min(
                thumb_width,
                tx + 3,
            )
            y0 = max(
                0,
                ty - 2,
            )
            y1 = min(
                thumb_height,
                ty + 3,
            )

            confidence = float(
                np.mean(
                    probability_map[
                        y0:y1,
                        x0:x1,
                    ]
                )
            )

            confidence = float(
                np.clip(
                    confidence,
                    0.0,
                    1.0,
                )
            )

            local_features = np.mean(
                feature_cube[
                    y0:y1,
                    x0:x1,
                ],
                axis=(0, 1),
            ).astype(
                np.float32,
                copy=False,
            )

            candidates.append({
                "geometry": mapping(part),
                "areaPx2": float(part.area),
                "confidence":
                    float(confidence),

                # Phase IL5 transient sampling metadata.
                "_thumbX": float(tx),
                "_thumbY": float(ty),
                "_appearance": local_features,
                "_order": len(candidates),
            })

    # Phase IL5 - spatial and visual diversity sampling
    max_candidate_area = max(
        1.0,
        max(
            (
                float(
                    item.get(
                        "areaPx2",
                        0.0,
                    )
                )
                for item in candidates
            ),
            default=1.0,
        ),
    )

    def candidate_priority(
        item: dict[str, Any],
    ) -> float:
        confidence_value = float(
            np.clip(
                float(
                    item.get(
                        "confidence",
                        0.5,
                    )
                ),
                0.0,
                1.0,
            )
        )

        uncertainty = (
            1.0
            - min(
                1.0,
                abs(
                    confidence_value
                    - 0.5
                )
                * 2.0,
            )
        )

        area_value = max(
            0.0,
            float(
                item.get(
                    "areaPx2",
                    0.0,
                )
            ),
        )

        area_score = (
            np.log1p(area_value)
            / np.log1p(
                max_candidate_area
            )
        )

        return float(
            0.80 * uncertainty
            + 0.20 * area_score
        )

    if candidates:
        appearance_matrix = np.vstack([
            np.asarray(
                item["_appearance"],
                dtype=np.float32,
            )
            for item in candidates
        ])

        appearance_center = np.mean(
            appearance_matrix,
            axis=0,
        )

        appearance_spread = np.std(
            appearance_matrix,
            axis=0,
        )

        appearance_spread = np.where(
            appearance_spread < 1e-4,
            1.0,
            appearance_spread,
        )

        appearance_z = (
            appearance_matrix
            - appearance_center
        ) / appearance_spread

        for item, vector in zip(
            candidates,
            appearance_z,
        ):
            item["_appearanceZ"] = vector

    thumb_diagonal = max(
        1.0,
        float(
            np.hypot(
                thumb_width,
                thumb_height,
            )
        ),
    )

    spatial_scale = max(
        1.0,
        thumb_diagonal * 0.25,
    )

    visual_dimension = max(
        1.0,
        float(
            feature_cube.shape[2]
        ),
    )

    def candidate_diversity(
        candidate: dict[str, Any],
        selected: list[dict[str, Any]],
    ) -> float:
        if not selected:
            return 1.0

        candidate_x = float(candidate.get("_thumbX", 0.0))
        candidate_y = float(candidate.get("_thumbY", 0.0))

        spatial_distances = []
        for other in selected:
            distance = float(
                np.hypot(
                    candidate_x - float(other.get("_thumbX", 0.0)),
                    candidate_y - float(other.get("_thumbY", 0.0)),
                )
            )
            spatial_distances.append(
                min(
                    1.0,
                    distance / spatial_scale,
                )
            )

        spatial_diversity = min(spatial_distances)

        candidate_vector = np.asarray(
            candidate.get(
                "_appearanceZ",
                np.zeros(
                    feature_cube.shape[2],
                    dtype=np.float32,
                ),
            ),
            dtype=np.float32,
        )

        visual_distances = []
        for other in selected:
            other_vector = np.asarray(
                other.get(
                    "_appearanceZ",
                    np.zeros_like(candidate_vector),
                ),
                dtype=np.float32,
            )

            distance = float(
                np.linalg.norm(
                    candidate_vector - other_vector
                )
                / np.sqrt(visual_dimension)
            )

            visual_distances.append(
                float(
                    1.0
                    - np.exp(
                        -max(
                            0.0,
                            distance,
                        )
                    )
                )
            )

        visual_diversity = min(visual_distances)

        return float(
            0.55 * spatial_diversity
            + 0.45 * visual_diversity
        )

    selected_candidates: list[dict[str, Any]] = []
    remaining_candidates = list(candidates)

    while (
        remaining_candidates
        and len(selected_candidates) < max_suggestions
    ):
        best_index = 0
        best_key = None

        for index, item in enumerate(remaining_candidates):
            base_priority = candidate_priority(item)
            diversity = candidate_diversity(
                item,
                selected_candidates,
            )

            selection_score = float(
                0.70 * base_priority
                + 0.30 * diversity
            )

            key = (
                selection_score,
                base_priority,
                float(item.get("areaPx2", 0.0)),
                -int(item.get("_order", 0)),
            )

            if best_key is None or key > best_key:
                best_key = key
                best_index = index

        selected_candidates.append(
            remaining_candidates.pop(best_index)
        )

    suggestions = []

    for index, item in enumerate(
        selected_candidates,
        start=1,
    ):
        suggestions.append({
            "id": f"il1-{index}",
            "geometry": item["geometry"],
            "areaPx2": float(item["areaPx2"]),
            "confidence": float(item["confidence"]),
        })

    model_payload[
        "selectionStrategy"
    ] = "active-diversity-v1"

    model_payload[
        "selectionBaseWeight"
    ] = 0.70

    model_payload[
        "selectionDiversityWeight"
    ] = 0.30

    model_payload[
        "spatialDiversityWeight"
    ] = 0.55

    model_payload[
        "visualDiversityWeight"
    ] = 0.45

    model_payload["threshold"] = float(
        probability_threshold
    )

    return {
        "suggestions": suggestions,
        "model": model_payload,
        "summary": {
            "predictedPixelsThumbnail":
                predicted_pixels,
            "candidatePixelsThumbnail": int(
                np.count_nonzero(
                    candidate_mask
                )
            ),
            "validPixelsThumbnail":
                valid_pixels,
            "artifactCount":
                artifact_count,
            "returnedSuggestions":
                len(suggestions),
        },
    }


__all__ = ['_il1_geometry_mask', '_il1_feature_cube', '_il1_sample_features', '_il1_majority_smooth', '_il2_feedback_items', '_il2_feedback_mask', '_il6_read_annotation_collection', '_il6_cap_sample_pool', '_IL8_APPEARANCE_SCALE_FLOOR', '_il8_appearance_descriptor', '_il8_appearance_similarity', '_il8_weight_sample_batch', '_il6_auxiliary_training_samples', '_il10_deep_runtime_capabilities', 'interactive_learning_capabilities', '_IL10_B_BACKBONES', '_il10_b_device', '_il10_b_backbone', '_il10_b_sample_embeddings', '_il10_b_embedding_grid', '_IL10_B_EMBEDDING_CACHE_VERSION', '_IL10_B_EMBEDDING_CACHE_ROOT', '_IL10_B_EMBEDDING_MEMORY_CACHE', '_IL10_B_EMBEDDING_CACHE_LOCK', '_IL10_B_EMBEDDING_CACHE_DIAGNOSTICS', '_il10_b_cache_note', '_il10_b_embedding_cache_max_bytes', '_il10_b_embedding_cache_status', '_il10_b_embedding_cache_key', '_il10_b_embedding_memory_get', '_il10_b_embedding_memory_put', '_il10_b_embedding_cache_prune', '_il10_b_cached_embedding_grid', '_il10_b_mask_occupancy', '_il10_b_descriptor', '_il10_b_similarity', '_il10_b_similarity_label', '_il10_b_effective_weight', '_il10_b_cap_weighted_pool', '_il10_b_auxiliary_source', '_il10_b_deep_feature_probability_map', '_il11_c_mask_to_grid', '_il11_c_embedding_descriptor', '_il11_c_embedding_similarity', '_il11_c_auxiliary_source', '_il11_c_spatial_probability_map', 'interactive_learning_suggest']
