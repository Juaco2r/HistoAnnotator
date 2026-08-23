from __future__ import annotations
from datetime import datetime, timezone

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
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import openslide
import numpy as np
from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from openslide import ImageSlide, OpenSlide
from openslide.deepzoom import DeepZoomGenerator
from PIL import Image, UnidentifiedImageError

if __package__ and __package__.startswith("app."):
    from ..core.runtime import (
        ANNOTATION_ROOT, CLASSES_PATH, CONFIG_LOCK, DIRECT_RASTER_SUFFIXES,
        IMAGE_ROOT, IMAGE_TYPES_PATH, MAX_SCAN_FILES, MAX_UPLOAD_BYTES,
        MAX_UPLOAD_GB, PREPARED_ROOT, PREPARE_THRESHOLD_BYTES,
        PREPARE_THRESHOLD_MB, SUPPORTED_SUFFIXES, TILE_CACHE_ROOT,
        TILE_JPEG_QUALITY, TILE_SIZE, UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_MB,
        UPLOAD_ROOT, atomic_write_json, encode_image_id, iter_image_files,
        load_classes, safe_image_path, validate_classes,
    )
    from ..storage.annotations import annotation_path as _storage_annotation_path
else:
    from core.runtime import (
        ANNOTATION_ROOT, CLASSES_PATH, CONFIG_LOCK, DIRECT_RASTER_SUFFIXES,
        IMAGE_ROOT, IMAGE_TYPES_PATH, MAX_SCAN_FILES, MAX_UPLOAD_BYTES,
        MAX_UPLOAD_GB, PREPARED_ROOT, PREPARE_THRESHOLD_BYTES,
        PREPARE_THRESHOLD_MB, SUPPORTED_SUFFIXES, TILE_CACHE_ROOT,
        TILE_JPEG_QUALITY, TILE_SIZE, UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_MB,
        UPLOAD_ROOT, atomic_write_json, encode_image_id, iter_image_files,
        load_classes, safe_image_path, validate_classes,
    )
    from storage.annotations import annotation_path as _storage_annotation_path

router = APIRouter()


def annotation_path(relative: str, annotation_file: str = "Default") -> Path:
    return _storage_annotation_path(ANNOTATION_ROOT, relative, annotation_file)


PREP_JOBS: dict[str, dict[str, Any]] = {}
PREP_LOCK = threading.RLock()

@dataclass
class SlideHandle:
    path: Path
    source_kind: str
    slide: openslide.AbstractSlide
    deepzoom: DeepZoomGenerator

    @property
    def dimensions(self) -> tuple[int, int]:
        return self.slide.dimensions

    def close(self) -> None:
        try:
            self.slide.close()
        except Exception:  # noqa: BLE001
            pass


_SLIDE_LOCAL = threading.local()


def _open_slide(path: Path) -> SlideHandle:
    try:
        vendor = openslide.OpenSlide.detect_format(str(path))
    except Exception:  # noqa: BLE001
        vendor = None

    if vendor:
        slide: openslide.AbstractSlide = OpenSlide(str(path))
        source_kind = f"openslide:{vendor}"
    else:
        try:
            pil_image = Image.open(path)
            pil_image.seek(0)
            pil_image.load()
            if pil_image.mode not in {"RGB", "RGBA"}:
                pil_image = pil_image.convert("RGB")
            slide = ImageSlide(pil_image)
            source_kind = "raster"
        except (UnidentifiedImageError, OSError) as exc:
            raise RuntimeError(
                "This format cannot be opened directly. Prepare it locally or convert it to a pyramidal TIFF."
            ) from exc

    return SlideHandle(
        path=path,
        source_kind=source_kind,
        slide=slide,
        deepzoom=DeepZoomGenerator(slide, tile_size=TILE_SIZE, overlap=0, limit_bounds=False),
    )


def clear_slide_cache() -> None:
    cache = getattr(_SLIDE_LOCAL, "handles", None)
    if not cache:
        return
    for handle in cache.values():
        handle.close()
    cache.clear()


def get_slide(path: Path) -> SlideHandle:
    stat = path.stat()
    key = (str(path), stat.st_mtime_ns, stat.st_size, TILE_SIZE)
    cache: dict[tuple[Any, ...], SlideHandle] = getattr(_SLIDE_LOCAL, "handles", None)
    if cache is None:
        cache = {}
        _SLIDE_LOCAL.handles = cache
    if key in cache:
        return cache[key]
    while len(cache) >= 4:
        _, old = cache.popitem()
        old.close()
    try:
        handle = _open_slide(path)
    except RuntimeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except openslide.OpenSlideError as exc:
        raise HTTPException(status_code=415, detail=f"OpenSlide could not open the image: {exc}") from exc
    cache[key] = handle
    return handle


def source_signature(path: Path, relative: str) -> dict[str, Any]:
    stat = path.stat()
    return {
        "relative": relative,
        "size": stat.st_size,
        "mtimeNs": stat.st_mtime_ns,
    }


def preparation_key(path: Path, relative: str) -> str:
    signature = source_signature(path, relative)
    raw = f"prep-v1|{signature['relative']}|{signature['size']}|{signature['mtimeNs']}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def preparation_dir(path: Path, relative: str) -> Path:
    return PREPARED_ROOT / preparation_key(path, relative)


def preparation_manifest(path: Path, relative: str) -> Path:
    return preparation_dir(path, relative) / "manifest.json"


def preparation_required(path: Path) -> bool:
    return path.suffix.lower() not in DIRECT_RASTER_SUFFIXES and path.stat().st_size >= PREPARE_THRESHOLD_BYTES


def read_ready_manifest(path: Path, relative: str) -> dict[str, Any] | None:
    manifest_path = preparation_manifest(path, relative)
    if not manifest_path.exists():
        return None
    try:
        with manifest_path.open("r", encoding="utf-8") as stream:
            manifest = json.load(stream)
        if manifest.get("signature") != source_signature(path, relative):
            return None
        render_path = (manifest_path.parent / manifest["renderFile"]).resolve()
        render_path.relative_to(PREPARED_ROOT)
        if not render_path.is_file():
            return None
        manifest["renderPath"] = str(render_path)
        return manifest
    except (OSError, json.JSONDecodeError, KeyError, ValueError):
        return None


def resolve_render_path(path: Path, relative: str) -> Path:
    manifest = read_ready_manifest(path, relative)
    return Path(manifest["renderPath"]) if manifest else path


def job_snapshot(image_id: str, path: Path, relative: str) -> dict[str, Any]:
    if not preparation_required(path):
        return {
            "imageId": image_id,
            "state": "not_required",
            "ready": True,
            "progress": 100,
            "message": "Local preparation is not required",
        }
    manifest = read_ready_manifest(path, relative)
    if manifest:
        return {
            "imageId": image_id,
            "state": "ready",
            "ready": True,
            "progress": 100,
            "message": "Image is ready on the local SSD",
            "sourceKind": manifest.get("sourceKind"),
        }
    with PREP_LOCK:
        job = PREP_JOBS.get(image_id)
        if job:
            return dict(job)
    return {
        "imageId": image_id,
        "state": "pending",
        "ready": False,
        "progress": 0,
        "message": "The large image must be prepared on the local SSD",
    }


def set_job(image_id: str, **updates: Any) -> None:
    with PREP_LOCK:
        job = PREP_JOBS.setdefault(
            image_id,
            {"imageId": image_id, "state": "queued", "ready": False, "progress": 0, "message": "Queued"},
        )
        job.update(updates)
        job["updatedAtUnix"] = int(time.time())


def convert_to_pyramidal_tiff(source: Path, destination: Path) -> str:
    # Convert a non-pyramidal/generic image to a tiled pyramidal TIFF.
    try:
        destination.unlink()
    except FileNotFoundError:
        pass

    pyvips_error: Exception | None = None
    try:
        import pyvips

        image = pyvips.Image.new_from_file(
            str(source),
            access="sequential",
        )
        image.tiffsave(
            str(destination),
            tile=True,
            pyramid=True,
            bigtiff=True,
            compression="deflate",
            tile_width=TILE_SIZE,
            tile_height=TILE_SIZE,
        )
        if destination.is_file() and destination.stat().st_size > 0:
            return "pyvips"
        raise RuntimeError("pyvips did not create the output TIFF")
    except Exception as exc:  # noqa: BLE001
        pyvips_error = exc
        try:
            destination.unlink()
        except FileNotFoundError:
            pass

    vips_cli = shutil.which("vips")
    if vips_cli:
        command = [
            vips_cli,
            "tiffsave",
            str(source),
            str(destination),
            "--tile",
            "--pyramid",
            "--bigtiff",
            "--compression",
            "deflate",
            "--tile-width",
            str(TILE_SIZE),
            "--tile-height",
            str(TILE_SIZE),
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=None,
            check=False,
        )
        if result.returncode == 0 and destination.is_file():
            return "vips-cli"
        detail = (
            result.stderr
            or result.stdout
            or "unknown libvips command error"
        ).strip()[-1200:]
        raise RuntimeError(
            f"libvips could not convert the image: {detail}"
        )

    detail = str(pyvips_error or "pyvips is unavailable")
    raise RuntimeError(
        "Could not prepare this image. "
        "The Desktop package needs its bundled pyvips/libvips runtime, "
        f"but conversion failed: {detail}"
    )


def prepare_image_worker(image_id: str, source: Path, relative: str) -> None:
    prep_dir = preparation_dir(source, relative)
    prep_dir.mkdir(parents=True, exist_ok=True)
    local_source = prep_dir / f"source{source.suffix.lower()}"
    local_part = prep_dir / f"source{source.suffix.lower()}.part"
    pyramid_path = prep_dir / "pyramid.tif"
    pyramid_part = prep_dir / "pyramid.part.tif"
    try:
        total = max(1, source.stat().st_size)
        for stale in (local_source, local_part):
            try:
                stale.unlink()
            except OSError:
                pass

        linked = False
        try:
            if source.stat().st_dev == prep_dir.stat().st_dev:
                os.link(source, local_source)
                linked = True
                set_job(
                    image_id,
                    state="linking",
                    progress=60,
                    copiedBytes=total,
                    totalBytes=total,
                    message="Local file linked without duplicating several GB",
                )
        except OSError:
            linked = False

        if not linked:
            set_job(image_id, state="copying", progress=1, message="Copying image to the local SSD…")
            copied = 0
            with source.open("rb") as src, local_part.open("wb") as dst:
                while True:
                    chunk = src.read(32 * 1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
                    copied += len(chunk)
                    progress = min(58, 1 + int((copied / total) * 57))
                    set_job(
                        image_id,
                        state="copying",
                        progress=progress,
                        copiedBytes=copied,
                        totalBytes=total,
                        message=f"Copying to SSD: {progress}%",
                    )
            os.replace(local_part, local_source)

        try:
            vendor = openslide.OpenSlide.detect_format(str(local_source))
        except Exception:  # noqa: BLE001
            vendor = None

        if vendor and str(vendor).lower() not in {"generic-tiff", "generic tiff"}:
            render_path = local_source
            source_kind = f"openslide:{vendor}"
            message = "WSI copied to the local SSD"
        else:
            set_job(
                image_id,
                state="converting",
                progress=62,
                message="Converting to pyramidal TIFF; this may take several minutes…",
            )
            conversion_engine = convert_to_pyramidal_tiff(
                local_source,
                pyramid_part,
            )
            os.replace(pyramid_part, pyramid_path)
            try:
                vendor = openslide.OpenSlide.detect_format(str(pyramid_path))
            except Exception:  # noqa: BLE001
                vendor = None
            if not vendor:
                raise RuntimeError("The converted TIFF is still not recognized by OpenSlide")
            render_path = pyramid_path
            source_kind = f"openslide:{vendor}"
            message = f"Image converted and prepared on the local SSD ({conversion_engine})"
            try:
                local_source.unlink()
            except OSError:
                pass

        manifest = {
            "signature": source_signature(source, relative),
            "renderFile": render_path.name,
            "sourceKind": source_kind,
            "message": message,
            "createdAtUnix": int(time.time()),
        }
        atomic_write_json(prep_dir / "manifest.json", manifest)
        clear_slide_cache()
        set_job(image_id, state="ready", ready=True, progress=100, message=message, sourceKind=source_kind)
    except Exception as exc:  # noqa: BLE001
        for temporary in (local_part, pyramid_part):
            try:
                temporary.unlink()
            except OSError:
                pass
        set_job(image_id, state="error", ready=False, progress=0, message=str(exc))


def cache_tile_path(path: Path, level: int, col: int, row: int, variant: str = "original") -> Path:
    stat = path.stat()
    fingerprint = hashlib.sha256(
        f"tile-v5|{path}|{stat.st_mtime_ns}|{stat.st_size}|{TILE_SIZE}|{TILE_JPEG_QUALITY}|{variant}".encode("utf-8")
    ).hexdigest()[:24]
    return TILE_CACHE_ROOT / fingerprint / str(level) / f"{col}_{row}.jpeg"


STAIN_HEMATOXYLIN = np.array([0.65, 0.70, 0.29], dtype=np.float32)


STAIN_EOSIN = np.array([0.2159, 0.8012, 0.5581], dtype=np.float32)


STAIN_DAB = np.array([0.27, 0.57, 0.78], dtype=np.float32)


def _unit_vector(vector: np.ndarray) -> np.ndarray:
    length = float(np.linalg.norm(vector))
    if length <= 0:
        return vector
    return vector / length


def _stain_matrix(image_type: str) -> tuple[np.ndarray, dict[str, int]]:
    first = _unit_vector(STAIN_HEMATOXYLIN.copy())
    second = _unit_vector((STAIN_DAB if image_type == "hdab" else STAIN_EOSIN).copy())
    residual = _unit_vector(np.cross(first, second))
    matrix = np.stack([first, second, residual], axis=0)
    names = {"hematoxylin": 0, "dab" if image_type == "hdab" else "eosin": 1}
    return matrix, names


def apply_display_transform(image: Image.Image, view: str = "original", image_type: str = "he", rgb: str = "111") -> Image.Image:
    if image.mode != "RGB":
        image = image.convert("RGB")
    view = (view or "original").lower()
    image_type = (image_type or "he").lower()
    if view == "original":
        return image
    array = np.asarray(image, dtype=np.float32)
    if view == "none":
        return Image.fromarray(np.full(array.shape, 255, dtype=np.uint8), mode="RGB")
    if view == "rgbmask":
        mask = [(rgb + "000")[:3][index] == "1" for index in range(3)]
        output = array.copy()
        # Fluorescence-style channel toggling: disabled channels contribute no light.
        for index, enabled in enumerate(mask):
            if not enabled:
                output[..., index] = 0
        return Image.fromarray(np.clip(output, 0, 255).astype(np.uint8), mode="RGB")
    if view in {"hematoxylin", "eosin", "dab"}:
        matrix, names = _stain_matrix("hdab" if image_type == "hdab" else "he")
        if view not in names:
            return image
        # Standard optical-density color deconvolution. This is intended for
        # visualization, not quantitative measurement.
        od = -np.log(np.clip((array + 1.0) / 256.0, 1e-6, 1.0))
        inverse = np.linalg.inv(matrix)
        concentrations = od @ inverse
        concentration = np.clip(concentrations[..., names[view]], 0.0, 6.0)
        intensity = np.exp(-concentration) * 255.0
        output = np.repeat(intensity[..., None], 3, axis=2)
        return Image.fromarray(np.clip(output, 0, 255).astype(np.uint8), mode="RGB")
    return image


_IF_MULTICHANNEL_CACHE: dict[tuple, dict | None] = {}


_IF_MULTICHANNEL_LOCK = threading.Lock()


_IF_DEFAULT_COLORS = [
    "#0000ff",  # blue
    "#00ff00",  # green
    "#ff0000",  # red
    "#ff00ff",  # magenta
    "#00ffff",  # cyan
    "#ffff00",  # yellow
    "#ff7300",  # orange
    "#ffffff",  # white
]


def _if_channel_slice(
    array,
    meta: dict,
    channel: int,
    y0: int,
    y1: int,
    x0: int,
    x1: int,
    step: int = 1,
):
    """Read only one spatial ROI from one scientific channel."""
    step = max(1, int(step))

    slicer = [0] * array.ndim
    slicer[int(meta["channelAxisIndex"])] = int(channel)
    slicer[int(meta["yAxisIndex"])] = slice(int(y0), int(y1), step)
    slicer[int(meta["xAxisIndex"])] = slice(int(x0), int(x1), step)

    return np.asarray(array[tuple(slicer)])


def _if_infer_allowed_range(dtype, observed_max: float) -> tuple[float, float]:
    dtype = np.dtype(dtype)

    if np.issubdtype(dtype, np.integer):
        info = np.iinfo(dtype)

        if info.min >= 0:
            dtype_bits = int(info.bits)

            try:
                needed_bits = max(
                    1,
                    int(np.ceil(np.log2(max(1.0, float(observed_max) + 1.0))))
                )
            except Exception:
                needed_bits = dtype_bits

            # Scientific microscopy commonly stores 10/12/14-bit
            # acquisitions inside uint16 containers.
            if 8 < dtype_bits <= 16:
                needed_bits = max(12, needed_bits)

            standard_bits = [8, 10, 12, 14, 16, 20, 24, 32, 64]

            chosen_bits = next(
                (
                    bit
                    for bit in standard_bits
                    if bit >= needed_bits and bit <= dtype_bits
                ),
                dtype_bits,
            )

            if chosen_bits < 63:
                maximum = min(
                    float(info.max),
                    float((1 << chosen_bits) - 1),
                )
            else:
                maximum = float(info.max)

            return 0.0, max(1.0, maximum)

        return float(info.min), float(info.max)

    return 0.0, max(1.0, float(observed_max))


def scientific_multichannel_info(path: Path) -> dict | None:
    """Inspect TIFF scientific channel structure without converting it to RGB.

    A real C axis is preferred. For non-OME TIFFs such as D1_Crop.tif,
    a small leading Z-like axis may be interpreted as channels later when the
    user explicitly marks the image as Fluorescence.
    """
    try:
        stat = path.stat()
    except OSError:
        return None

    key = (
        str(path),
        int(stat.st_mtime_ns),
        int(stat.st_size),
    )

    with _IF_MULTICHANNEL_LOCK:
        if key in _IF_MULTICHANNEL_CACHE:
            return _IF_MULTICHANNEL_CACHE[key]

    result = None

    try:
        import tifffile
        import xml.etree.ElementTree as ET

        lower = path.name.lower()

        if not lower.endswith((".tif", ".tiff")):
            raise ValueError("Not TIFF")

        with tifffile.TiffFile(str(path)) as tif:
            series = tif.series[0]

            shape = tuple(int(v) for v in series.shape)
            axes = str(getattr(series, "axes", "") or "")

            if len(shape) != 3 or len(axes) != 3:
                raise ValueError(
                    f"Only 3-D multichannel TIFF is enabled initially: "
                    f"shape={shape}, axes={axes}"
                )

            if "Y" not in axes or "X" not in axes:
                raise ValueError(
                    f"No spatial Y/X axes: {axes}"
                )

            y_axis = axes.index("Y")
            x_axis = axes.index("X")

            assumed_channel_axis = False

            if "C" in axes:
                channel_axis = axes.index("C")

            elif (
                y_axis == 1
                and x_axis == 2
                and 2 <= shape[0] <= 16
                and axes.endswith("YX")
            ):
                # Non-OME scientific TIFFs frequently lose semantic channel
                # metadata and tifffile labels the leading dimension Z/Q/I.
                # We expose it as a channel candidate; HistoAnnotator only uses
                # this interpretation when Image type == Fluorescence.
                channel_axis = 0
                assumed_channel_axis = True

            else:
                raise ValueError(
                    f"No suitable channel axis: shape={shape}, axes={axes}"
                )

            channel_count = int(shape[channel_axis])

            if channel_count < 2 or channel_count > 16:
                raise ValueError(
                    f"Unsupported channel count: {channel_count}"
                )

            width = int(shape[x_axis])
            height = int(shape[y_axis])

            names = [
                f"Channel {i + 1}"
                for i in range(channel_count)
            ]

            # Use true OME channel names when available.
            if tif.ome_metadata:
                try:
                    root = ET.fromstring(tif.ome_metadata)

                    ome_channels = [
                        elem
                        for elem in root.iter()
                        if elem.tag.endswith("Channel")
                    ]

                    for i, elem in enumerate(
                        ome_channels[:channel_count]
                    ):
                        name = str(
                            elem.attrib.get("Name") or ""
                        ).strip()

                        if name:
                            names[i] = name

                except Exception:
                    pass

            meta = {
                "scientificMultichannel": True,
                "width": width,
                "height": height,
                "shape": list(shape),
                "axes": axes,
                "dtype": str(series.dtype),
                "channelAxisIndex": int(channel_axis),
                "yAxisIndex": int(y_axis),
                "xAxisIndex": int(x_axis),
                "channelCount": channel_count,
                "assumedChannelAxis": assumed_channel_axis,
                "ome": bool(tif.ome_metadata),
                "regionAccess": "memmap",
            }

        # Stable whole-image display ranges.
        # Sampling is sparse and read directly through the memory map.
        mm = tifffile.memmap(str(path), series=0)

        total_spatial_pixels = max(1, width * height)
        target_samples = 300_000

        step = max(
            1,
            int(
                np.ceil(
                    np.sqrt(
                        total_spatial_pixels
                        / float(target_samples)
                    )
                )
            ),
        )

        channels = []

        for c in range(channel_count):
            sample = _if_channel_slice(
                mm,
                meta,
                c,
                0,
                height,
                0,
                width,
                step=step,
            )

            values = np.asarray(
                sample,
                dtype=np.float64,
            ).reshape(-1)

            values = values[np.isfinite(values)]

            if values.size:
                observed_min = float(values.min())
                observed_max = float(values.max())

                allowed_min, allowed_max = (
                    _if_infer_allowed_range(
                        mm.dtype,
                        observed_max,
                    )
                )

                lo = float(
                    np.percentile(values, 1.0)
                )
                hi = float(
                    np.percentile(values, 99.0)
                )

                lo = max(
                    allowed_min,
                    min(lo, allowed_max),
                )

                hi = max(
                    allowed_min,
                    min(hi, allowed_max),
                )

                if hi <= lo:
                    lo = max(
                        allowed_min,
                        observed_min,
                    )
                    hi = min(
                        allowed_max,
                        observed_max,
                    )

                if hi <= lo:
                    lo = allowed_min
                    hi = allowed_max

            else:
                allowed_min = 0.0
                allowed_max = 1.0
                lo = 0.0
                hi = 1.0
                observed_min = 0.0
                observed_max = 0.0

            channels.append({
                "index": c,
                "name": names[c],
                "color": _IF_DEFAULT_COLORS[
                    c % len(_IF_DEFAULT_COLORS)
                ],
                "visible": True,
                "minDisplay": float(lo),
                "maxDisplay": float(hi),
                "allowedMin": float(allowed_min),
                "allowedMax": float(allowed_max),
                "observedMin": float(observed_min),
                "observedMax": float(observed_max),
                "gamma": 1.0,
                "brightness": 100.0,
            })

        try:
            del mm
        except Exception:
            pass

        result = {
            **meta,
            "channels": channels,
        }

    except Exception:
        result = None

    with _IF_MULTICHANNEL_LOCK:
        # Remove stale versions of this same file.
        stale = [
            cache_key
            for cache_key in _IF_MULTICHANNEL_CACHE
            if cache_key[0] == str(path)
            and cache_key != key
        ]

        for cache_key in stale:
            _IF_MULTICHANNEL_CACHE.pop(
                cache_key,
                None,
            )

        _IF_MULTICHANNEL_CACHE[key] = result

    return result


def _if_parse_float_list(
    raw: str,
    defaults: list[float],
) -> list[float]:
    if not raw:
        return list(defaults)

    values = []

    for item in str(raw).split(","):
        try:
            values.append(float(item))
        except Exception:
            values.append(float("nan"))

    output = []

    for i, default in enumerate(defaults):
        if i < len(values) and np.isfinite(values[i]):
            output.append(float(values[i]))
        else:
            output.append(float(default))

    return output


def _if_parse_enabled(
    raw: str,
    count: int,
) -> list[bool]:
    if not raw:
        return [True] * count

    clean = "".join(
        ch
        for ch in str(raw)
        if ch in "01"
    )

    return [
        clean[i] == "1"
        if i < len(clean)
        else True
        for i in range(count)
    ]


def _if_parse_colors(
    raw: str,
    defaults: list[str],
) -> list[str]:
    if not raw:
        return list(defaults)

    supplied = [
        item.strip()
        for item in str(raw).split(",")
    ]

    output = []

    for i, default in enumerate(defaults):
        value = (
            supplied[i]
            if i < len(supplied)
            else default
        )

        value = value.lstrip("#")

        if not re.fullmatch(
            r"[0-9a-fA-F]{6}",
            value,
        ):
            value = default.lstrip("#")

        output.append("#" + value.lower())

    return output


def _if_render_settings(
    meta: dict,
    enabled: str = "",
    minimums: str = "",
    maximums: str = "",
    gammas: str = "",
    brightness: str = "",
    colors: str = "",
) -> dict:
    channels = meta["channels"]

    return {
        "enabled": _if_parse_enabled(
            enabled,
            len(channels),
        ),
        "minimums": _if_parse_float_list(
            minimums,
            [
                float(ch["minDisplay"])
                for ch in channels
            ],
        ),
        "maximums": _if_parse_float_list(
            maximums,
            [
                float(ch["maxDisplay"])
                for ch in channels
            ],
        ),
        "gammas": _if_parse_float_list(
            gammas,
            [
                float(ch.get("gamma", 1.0))
                for ch in channels
            ],
        ),
        "brightness": _if_parse_float_list(
            brightness,
            [
                float(
                    ch.get(
                        "brightness",
                        100.0,
                    )
                )
                for ch in channels
            ],
        ),
        "colors": _if_parse_colors(
            colors,
            [
                str(ch["color"])
                for ch in channels
            ],
        ),
    }


def _if_resize_float_plane(
    plane: np.ndarray,
    width: int,
    height: int,
) -> np.ndarray:
    plane = np.asarray(
        plane,
        dtype=np.float32,
    )

    width = max(1, int(width))
    height = max(1, int(height))

    if plane.shape == (height, width):
        return plane

    image = Image.fromarray(
        plane,
        mode="F",
    )

    image = image.resize(
        (width, height),
        Image.Resampling.BILINEAR,
    )

    return np.asarray(
        image,
        dtype=np.float32,
    )


def render_scientific_multichannel_region(
    path: Path,
    meta: dict,
    x: int,
    y: int,
    width: int,
    height: int,
    output_width: int,
    output_height: int,
    settings: dict,
) -> Image.Image:
    """Render scientific raw channels to RGB for display only."""
    import tifffile

    image_width = int(meta["width"])
    image_height = int(meta["height"])

    x0 = max(
        0,
        min(int(x), image_width - 1),
    )

    y0 = max(
        0,
        min(int(y), image_height - 1),
    )

    x1 = max(
        x0 + 1,
        min(
            image_width,
            x0 + int(width),
        ),
    )

    y1 = max(
        y0 + 1,
        min(
            image_height,
            y0 + int(height),
        ),
    )

    output_width = max(
        1,
        int(output_width),
    )

    output_height = max(
        1,
        int(output_height),
    )

    source_width = x1 - x0
    source_height = y1 - y0

    # Downsample while reading the memory map, rather than materializing
    # a huge full-resolution ROI and resizing afterwards.
    step_x = max(
        1,
        int(
            np.floor(
                source_width
                / float(output_width)
            )
        ),
    )

    step_y = max(
        1,
        int(
            np.floor(
                source_height
                / float(output_height)
            )
        ),
    )

    step = max(
        1,
        min(step_x, step_y),
    )

    mm = tifffile.memmap(
        str(path),
        series=0,
    )

    rgb = np.zeros(
        (
            output_height,
            output_width,
            3,
        ),
        dtype=np.float32,
    )

    for c in range(
        int(meta["channelCount"])
    ):
        if not settings["enabled"][c]:
            continue

        raw = _if_channel_slice(
            mm,
            meta,
            c,
            y0,
            y1,
            x0,
            x1,
            step=step,
        )

        raw = _if_resize_float_plane(
            raw,
            output_width,
            output_height,
        )

        lo = float(
            settings["minimums"][c]
        )

        hi = float(
            settings["maximums"][c]
        )

        if not np.isfinite(lo):
            lo = 0.0

        if (
            not np.isfinite(hi)
            or hi <= lo
        ):
            hi = lo + 1.0

        channel = np.nan_to_num(
            raw,
            nan=lo,
            posinf=hi,
            neginf=lo,
        )

        channel = np.clip(
            (channel - lo) / (hi - lo),
            0.0,
            1.0,
        )

        gamma = float(
            settings["gammas"][c]
        )

        gamma = max(
            0.05,
            min(20.0, gamma),
        )

        if abs(gamma - 1.0) > 1e-6:
            # QuPath-like display gamma:
            # >1 brightens mid-tones.
            channel = np.power(
                channel,
                1.0 / gamma,
            )

        brightness_factor = max(
            0.0,
            float(
                settings["brightness"][c]
            ) / 100.0,
        )

        if brightness_factor != 1.0:
            channel = np.clip(
                channel * brightness_factor,
                0.0,
                1.0,
            )

        color = (
            settings["colors"][c]
            .lstrip("#")
        )

        color_vector = np.asarray(
            [
                int(color[0:2], 16),
                int(color[2:4], 16),
                int(color[4:6], 16),
            ],
            dtype=np.float32,
        ) / 255.0

        rgb += (
            channel[..., None]
            * color_vector[
                None,
                None,
                :
            ]
        )

    try:
        del mm
    except Exception:
        pass

    rgb = (
        np.clip(rgb, 0.0, 1.0)
        * 255.0
    ).astype(np.uint8)

    return Image.fromarray(
        rgb,
        mode="RGB",
    )


@router.get("/api/images")
def list_images() -> dict[str, Any]:
    images: list[dict[str, Any]] = []
    for path in iter_image_files() or []:
        try:
            stat = path.stat()
        except OSError:
            continue
        relative = path.relative_to(IMAGE_ROOT).as_posix()
        manifest = read_ready_manifest(path, relative)
        images.append({
            "id": encode_image_id(relative),
            "name": path.name,
            "relativePath": relative,
            "sizeBytes": stat.st_size,
            "modifiedUnix": int(stat.st_mtime),
            "hasAnnotations": annotation_path(relative).exists() or any((ANNOTATION_ROOT / f"{relative}.annotations").glob("*.geojson")),
            "needsPreparation": preparation_required(path),
            "prepared": bool(manifest),
        })
    return {"images": images, "truncated": len(images) >= MAX_SCAN_FILES}


@router.get("/api/images/{image_id}/prepare")
def get_prepare_status(image_id: str) -> dict[str, Any]:
    path, relative = safe_image_path(image_id)
    return job_snapshot(image_id, path, relative)


@router.post("/api/images/{image_id}/prepare")
def start_prepare(image_id: str) -> dict[str, Any]:
    path, relative = safe_image_path(image_id)
    snapshot = job_snapshot(image_id, path, relative)
    if snapshot.get("ready"):
        return snapshot
    with PREP_LOCK:
        current = PREP_JOBS.get(image_id)
        if current and current.get("state") in {"queued", "copying", "converting"}:
            return dict(current)
        PREP_JOBS[image_id] = {
            "imageId": image_id,
            "state": "queued",
            "ready": False,
            "progress": 0,
            "message": "Preparation started",
            "updatedAtUnix": int(time.time()),
        }
        thread = threading.Thread(
            target=prepare_image_worker,
            args=(image_id, path, relative),
            name=f"prepare-{image_id[:8]}",
            daemon=True,
        )
        thread.start()
    return dict(PREP_JOBS[image_id])


def _safe_metadata_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        if isinstance(value, (tuple, list)) and len(value) == 2:
            denominator = float(value[1])
            if denominator == 0:
                return None
            number = float(value[0]) / denominator
        else:
            number = float(value)
        return number if np.isfinite(number) else None
    except (TypeError, ValueError, OverflowError, ZeroDivisionError):
        return None


def _physical_size_to_um(value: Any, unit: Any) -> float | None:
    number = _safe_metadata_float(value)
    if number is None or number <= 0:
        return None

    normalized = str(unit or "µm").strip().lower().replace("μ", "µ")
    scale = {
        "µm": 1.0, "um": 1.0,
        "micrometer": 1.0, "micrometre": 1.0,
        "micrometers": 1.0, "micrometres": 1.0,
        "nm": 0.001, "nanometer": 0.001, "nanometre": 0.001,
        "mm": 1000.0, "millimeter": 1000.0, "millimetre": 1000.0,
        "cm": 10000.0, "centimeter": 10000.0, "centimetre": 10000.0,
        "m": 1_000_000.0,
    }.get(normalized)
    return number * scale if scale is not None else None


def _tiff_resolution_to_mpp(resolution: Any, unit: Any) -> float | None:
    value = _safe_metadata_float(resolution)
    if value is None or value <= 0:
        return None

    unit_name = getattr(unit, "name", None)
    raw_unit = str(unit_name or unit or "").strip().upper()

    if raw_unit in {"2", "INCH", "RESUNIT.INCH"} or "INCH" in raw_unit:
        return 25400.0 / value
    if raw_unit in {"3", "CENTIMETER", "CENTIMETRE", "RESUNIT.CENTIMETER"} or "CENTI" in raw_unit:
        return 10000.0 / value
    return None


def _image_calibration_info(path: Path, properties: Any) -> dict[str, Any]:
    # Read explicit metadata only; do not infer magnification from image size.
    mpp_x = _safe_metadata_float(properties.get(openslide.PROPERTY_NAME_MPP_X))
    mpp_y = _safe_metadata_float(properties.get(openslide.PROPERTY_NAME_MPP_Y))
    objective_power = _safe_metadata_float(properties.get("openslide.objective-power"))

    sources: list[str] = []
    if mpp_x is not None or mpp_y is not None:
        sources.append("OpenSlide MPP")
    if objective_power is not None:
        sources.append("OpenSlide objective")

    if path.name.lower().endswith((".tif", ".tiff")):
        try:
            import tifffile
            import xml.etree.ElementTree as ET

            with tifffile.TiffFile(str(path)) as tif:
                if tif.ome_metadata:
                    try:
                        root = ET.fromstring(tif.ome_metadata)
                        pixels = next((e for e in root.iter() if e.tag.endswith("Pixels")), None)

                        if pixels is not None:
                            if mpp_x is None:
                                mpp_x = _physical_size_to_um(
                                    pixels.attrib.get("PhysicalSizeX"),
                                    pixels.attrib.get("PhysicalSizeXUnit") or "µm",
                                )
                            if mpp_y is None:
                                mpp_y = _physical_size_to_um(
                                    pixels.attrib.get("PhysicalSizeY"),
                                    pixels.attrib.get("PhysicalSizeYUnit") or "µm",
                                )
                            if mpp_x is not None or mpp_y is not None:
                                sources.append("OME-TIFF physical size")

                        if objective_power is None:
                            objectives = {
                                str(e.attrib.get("ID")): e
                                for e in root.iter()
                                if e.tag.endswith("Objective") and e.attrib.get("ID")
                            }
                            objective_id = None
                            for e in root.iter():
                                if e.tag.endswith("ObjectiveSettings"):
                                    objective_id = e.attrib.get("ID")
                                    if objective_id:
                                        break

                            objective = objectives.get(str(objective_id)) if objective_id else None
                            if objective is None and len(objectives) == 1:
                                objective = next(iter(objectives.values()))

                            if objective is not None:
                                objective_power = _safe_metadata_float(
                                    objective.attrib.get("NominalMagnification")
                                )
                                if objective_power is not None:
                                    sources.append("OME-TIFF objective")
                    except Exception:
                        pass

                if (mpp_x is None or mpp_y is None) and len(tif.pages):
                    page = tif.pages[0]
                    x_tag = page.tags.get("XResolution")
                    y_tag = page.tags.get("YResolution")
                    unit_tag = page.tags.get("ResolutionUnit")
                    unit = unit_tag.value if unit_tag is not None else None

                    if mpp_x is None and x_tag is not None:
                        mpp_x = _tiff_resolution_to_mpp(x_tag.value, unit)
                    if mpp_y is None and y_tag is not None:
                        mpp_y = _tiff_resolution_to_mpp(y_tag.value, unit)

                    if mpp_x is not None or mpp_y is not None:
                        sources.append("TIFF resolution tags")
        except Exception:
            pass

    if mpp_x is not None and mpp_y is None:
        mpp_y = mpp_x
        sources.append("Y assumed equal to X")
    elif mpp_y is not None and mpp_x is None:
        mpp_x = mpp_y
        sources.append("X assumed equal to Y")

    return {
        "mppX": mpp_x,
        "mppY": mpp_y,
        "objectivePower": objective_power,
        "calibrationAvailable": bool(mpp_x is not None and mpp_y is not None),
        "calibrationSource": "; ".join(dict.fromkeys(sources)) if sources else None,
    }


def _calibration_overrides_path() -> Path:
    return IMAGE_TYPES_PATH.with_name("image_calibration_overrides.json")


def _read_calibration_overrides() -> dict[str, dict[str, Any]]:
    path = _calibration_overrides_path()
    with CONFIG_LOCK:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    if not isinstance(payload, dict):
        return {}

    result: dict[str, dict[str, Any]] = {}
    for key, value in payload.items():
        if isinstance(key, str) and isinstance(value, dict):
            result[key] = value
    return result


def _write_calibration_overrides(
    payload: dict[str, dict[str, Any]],
) -> None:
    path = _calibration_overrides_path()
    with CONFIG_LOCK:
        atomic_write_json(path, payload)


def _positive_float_or_none(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not __import__("math").isfinite(parsed) or parsed <= 0:
        return None
    return parsed


def _calibration_override_for_relative(
    relative: str,
) -> dict[str, Any] | None:
    value = _read_calibration_overrides().get(relative)
    if not isinstance(value, dict):
        return None

    mpp_x = _positive_float_or_none(value.get("mppX"))
    mpp_y = _positive_float_or_none(value.get("mppY"))
    objective_power = _positive_float_or_none(
        value.get("objectivePower")
    )

    # Overrides may be partial. A valid native field always wins.
    if (
        not (mpp_x is not None and mpp_y is not None)
        and objective_power is None
    ):
        return None

    return {
        **value,
        "mppX": mpp_x,
        "mppY": mpp_y,
        "objectivePower": objective_power,
    }


@router.get("/api/images/{image_id}/info")
def image_info(image_id: str) -> dict[str, Any]:
    path, relative = safe_image_path(image_id)
    if preparation_required(path) and not read_ready_manifest(path, relative):
        raise HTTPException(status_code=409, detail="The large image must be prepared locally before it can be opened")
    render_path = resolve_render_path(path, relative)
    handle = get_slide(render_path)
    width, height = handle.dimensions
    properties = handle.slide.properties
    multichannel = scientific_multichannel_info(path)
    native_calibration = _image_calibration_info(path, properties)
    calibration = dict(native_calibration)
    calibration_override = _calibration_override_for_relative(relative)

    calibration_mpp_override_applied = False
    calibration_objective_override_applied = False

    # Native/embedded values are authoritative field-by-field.
    # Only missing MPP or missing objective can be inherited.
    if calibration_override is not None:
        native_has_mpp = bool(
            native_calibration.get("calibrationAvailable")
        )
        override_has_mpp = bool(
            calibration_override.get("mppX") is not None
            and calibration_override.get("mppY") is not None
        )

        if not native_has_mpp and override_has_mpp:
            calibration["mppX"] = calibration_override["mppX"]
            calibration["mppY"] = calibration_override["mppY"]
            calibration["calibrationAvailable"] = True
            calibration_mpp_override_applied = True

        native_objective = _positive_float_or_none(
            native_calibration.get("objectivePower")
        )
        override_objective = _positive_float_or_none(
            calibration_override.get("objectivePower")
        )

        if native_objective is None and override_objective is not None:
            calibration["objectivePower"] = override_objective
            calibration_objective_override_applied = True

        if (
            calibration_mpp_override_applied
            or calibration_objective_override_applied
        ):
            native_source = str(
                native_calibration.get("calibrationSource") or ""
            ).strip()
            override_source = str(
                calibration_override.get("source")
                or "HistoAnnotator calibration override"
            ).strip()
            calibration["calibrationSource"] = "; ".join(
                dict.fromkeys(
                    value
                    for value in (native_source, override_source)
                    if value
                )
            )

    calibration_override_applied = bool(
        calibration_mpp_override_applied
        or calibration_objective_override_applied
    )

    def float_property(key: str) -> float | None:
        value = properties.get(key)
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "id": image_id,
        "name": path.name,
        "relativePath": relative,
        "width": width,
        "height": height,
        "tileSize": TILE_SIZE,
        "tileOverlap": 0,
        "levelCount": handle.deepzoom.level_count,
        "sourceKind": handle.source_kind,
        "directRaster": path.suffix.lower() in DIRECT_RASTER_SUFFIXES,
        "preparedLocally": render_path != path,
        "mppX": calibration["mppX"],
        "mppY": calibration["mppY"],
        "objectivePower": calibration["objectivePower"],
        "calibrationAvailable": calibration["calibrationAvailable"],
        "calibrationSource": calibration["calibrationSource"],
        "calibrationNativeAvailable": bool(
            native_calibration.get("calibrationAvailable")
        ),
        "calibrationNativeObjectiveAvailable": bool(
            _positive_float_or_none(
                native_calibration.get("objectivePower")
            ) is not None
        ),
        "calibrationOverrideApplied": bool(calibration_override_applied),
        "calibrationMppOverrideApplied": bool(
            calibration_mpp_override_applied
        ),
        "calibrationObjectiveOverrideApplied": bool(
            calibration_objective_override_applied
        ),
        "calibrationOverrideSourceImageId": (
            calibration_override.get("sourceImageId")
            if calibration_override_applied and calibration_override
            else None
        ),
        "calibrationOverrideSourceImage": (
            calibration_override.get("sourceImage")
            if calibration_override_applied and calibration_override
            else None
        ),
        "multichannel": multichannel,
    }


def _read_image_types() -> dict[str, str]:
    with CONFIG_LOCK:
        try:
            payload = json.loads(IMAGE_TYPES_PATH.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}


@router.put("/api/images/{image_id}/calibration-override")
def put_image_calibration_override(
    image_id: str,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    path, relative = safe_image_path(image_id)
    render_path = resolve_render_path(path, relative)
    handle = get_slide(render_path)
    native_calibration = _image_calibration_info(
        path,
        handle.slide.properties,
    )

    native_mpp_x = _positive_float_or_none(
        native_calibration.get("mppX")
    )
    native_mpp_y = _positive_float_or_none(
        native_calibration.get("mppY")
    )
    native_has_mpp = bool(
        native_mpp_x is not None
        and native_mpp_y is not None
    )
    native_objective = _positive_float_or_none(
        native_calibration.get("objectivePower")
    )

    requested_mpp_x = _positive_float_or_none(payload.get("mppX"))
    requested_mpp_y = _positive_float_or_none(payload.get("mppY"))
    requested_objective = _positive_float_or_none(
        payload.get("objectivePower")
    )

    if (requested_mpp_x is None) != (requested_mpp_y is None):
        raise HTTPException(
            status_code=422,
            detail="mppX and mppY must be supplied together",
        )

    requested_has_mpp = bool(
        requested_mpp_x is not None
        and requested_mpp_y is not None
    )

    if requested_has_mpp and (
        requested_mpp_x > 100.0
        or requested_mpp_y > 100.0
    ):
        raise HTTPException(
            status_code=422,
            detail="MPP values above 100 µm/px are not accepted",
        )

    if requested_objective is not None and requested_objective > 200.0:
        raise HTTPException(
            status_code=422,
            detail="Objective power above 200x is not accepted",
        )

    if not requested_has_mpp and requested_objective is None:
        raise HTTPException(
            status_code=422,
            detail="No calibration value was supplied",
        )

    overrides = _read_calibration_overrides()
    previous = (
        overrides.get(relative)
        if isinstance(overrides.get(relative), dict)
        else {}
    )

    record_mpp_x = _positive_float_or_none(previous.get("mppX"))
    record_mpp_y = _positive_float_or_none(previous.get("mppY"))
    record_objective = _positive_float_or_none(
        previous.get("objectivePower")
    )

    mpp_applied = False
    objective_applied = False

    if not native_has_mpp and requested_has_mpp:
        record_mpp_x = requested_mpp_x
        record_mpp_y = requested_mpp_y
        mpp_applied = True

    if native_objective is None and requested_objective is not None:
        record_objective = requested_objective
        objective_applied = True

    if not mpp_applied and not objective_applied:
        return {
            "applied": False,
            "reason": "native-values-present",
            "mppApplied": False,
            "objectiveApplied": False,
            "mppX": native_mpp_x,
            "mppY": native_mpp_y,
            "objectivePower": native_objective,
            "calibrationSource": native_calibration.get(
                "calibrationSource"
            ),
        }

    source_image_id = str(payload.get("sourceImageId") or "").strip()
    source_image = str(payload.get("sourceImage") or "").strip()

    record = {
        "mppX": record_mpp_x,
        "mppY": record_mpp_y,
        "objectivePower": record_objective,
        "source": (
            f"Batch base image: {source_image}"
            if source_image
            else "Batch base image"
        ),
        "sourceImageId": source_image_id or None,
        "sourceImage": source_image or None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "method": "batch-base-image-partial-inheritance-v1",
    }

    overrides[relative] = record
    _write_calibration_overrides(overrides)

    effective_mpp_x = native_mpp_x if native_has_mpp else record_mpp_x
    effective_mpp_y = native_mpp_y if native_has_mpp else record_mpp_y
    effective_objective = (
        native_objective
        if native_objective is not None
        else record_objective
    )

    return {
        "applied": True,
        "mppApplied": bool(mpp_applied),
        "objectiveApplied": bool(objective_applied),
        "mppX": effective_mpp_x,
        "mppY": effective_mpp_y,
        "objectivePower": effective_objective,
        "source": record["source"],
        "calibrationAvailable": bool(
            effective_mpp_x is not None
            and effective_mpp_y is not None
        ),
        "calibrationNativeAvailable": bool(native_has_mpp),
        "calibrationNativeObjectiveAvailable": bool(
            native_objective is not None
        ),
        "calibrationOverrideApplied": True,
        "calibrationMppOverrideApplied": bool(mpp_applied),
        "calibrationObjectiveOverrideApplied": bool(objective_applied),
    }


@router.get("/api/images/{image_id}/display-config")
def get_image_display_config(image_id: str) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    image_types = _read_image_types()
    return {"imageType": image_types.get(relative, "he")}


@router.put("/api/images/{image_id}/display-config")
def put_image_display_config(image_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    image_type = str(payload.get("imageType") or "he").lower()
    if image_type not in {"he", "hdab", "fluorescence", "rgb"}:
        raise HTTPException(status_code=422, detail="Unsupported image type")
    with CONFIG_LOCK:
        image_types = _read_image_types()
        image_types[relative] = image_type
        atomic_write_json(IMAGE_TYPES_PATH, image_types)
    return {"imageType": image_type}


@router.get("/api/images/{image_id}/original")
def image_original(image_id: str) -> Response:
    path, _ = safe_image_path(image_id)
    media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = media_types.get(path.suffix.lower())
    if media_type is None:
        raise HTTPException(status_code=415, detail="Direct loading is only available for JPG, PNG, and WebP")
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/api/images/{image_id}/download")
def download_original_image(image_id: str) -> FileResponse:
    path, _ = safe_image_path(image_id)
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/api/images/{image_id}/tiles/{level}/{col}_{row}.jpeg")
def image_tile(
    image_id: str,
    level: int,
    col: int,
    row: int,
    view: str = Query("original"),
    image_type: str = Query("he"),
    rgb: str = Query("111"),
    if_enabled: str = Query(""),
    if_min: str = Query(""),
    if_max: str = Query(""),
    if_gamma: str = Query(""),
    if_brightness: str = Query(""),
    if_colors: str = Query(""),
) -> Response:
    path, relative = safe_image_path(image_id)
    if preparation_required(path) and not read_ready_manifest(path, relative):
        raise HTTPException(status_code=409, detail="Image is not ready yet")
    render_path = resolve_render_path(path, relative)
    handle = get_slide(render_path)
    if level < 0 or level >= handle.deepzoom.level_count:
        raise HTTPException(status_code=404, detail="Invalid Deep Zoom level")
    cols, rows = handle.deepzoom.level_tiles[level]
    if col < 0 or row < 0 or col >= cols or row >= rows:
        raise HTTPException(status_code=404, detail="Tile is out of range")

    if_meta = (
        scientific_multichannel_info(path)
        if str(image_type).lower() == "fluorescence"
        else None
    )

    if if_meta:
        import hashlib

        render_signature = "|".join([
            str(if_enabled),
            str(if_min),
            str(if_max),
            str(if_gamma),
            str(if_brightness),
            str(if_colors),
        ])

        variant = (
            "ifmc-"
            + hashlib.sha1(
                render_signature.encode("utf-8")
            ).hexdigest()[:24]
        )

        cache_source = path

    else:
        variant = f"{view}|{image_type}|{rgb}"
        cache_source = render_path

    cached = cache_tile_path(
        cache_source,
        level,
        col,
        row,
        variant,
    )

    if cached.exists():
        return FileResponse(
            cached,
            media_type="image/jpeg",
            headers={
                "Cache-Control":
                "public, max-age=31536000, immutable"
            },
        )

    if if_meta:
        level_width, level_height = (
            handle.deepzoom.level_dimensions[level]
        )

        level_x0 = int(col) * TILE_SIZE
        level_y0 = int(row) * TILE_SIZE

        level_x1 = min(
            int(level_width),
            level_x0 + TILE_SIZE,
        )

        level_y1 = min(
            int(level_height),
            level_y0 + TILE_SIZE,
        )

        target_width = max(
            1,
            level_x1 - level_x0,
        )

        target_height = max(
            1,
            level_y1 - level_y0,
        )

        downsample = 2 ** (
            (handle.deepzoom.level_count - 1)
            - int(level)
        )

        source_x0 = (
            level_x0 * downsample
        )

        source_y0 = (
            level_y0 * downsample
        )

        source_x1 = min(
            int(if_meta["width"]),
            level_x1 * downsample,
        )

        source_y1 = min(
            int(if_meta["height"]),
            level_y1 * downsample,
        )

        settings = _if_render_settings(
            if_meta,
            enabled=if_enabled,
            minimums=if_min,
            maximums=if_max,
            gammas=if_gamma,
            brightness=if_brightness,
            colors=if_colors,
        )

        try:
            tile = (
                render_scientific_multichannel_region(
                    path,
                    if_meta,
                    source_x0,
                    source_y0,
                    max(
                        1,
                        source_x1 - source_x0,
                    ),
                    max(
                        1,
                        source_y1 - source_y0,
                    ),
                    target_width,
                    target_height,
                    settings,
                )
            )

        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500,
                detail=(
                    "Could not generate "
                    f"multichannel tile: {exc}"
                ),
            ) from exc

    else:
        try:
            tile = handle.deepzoom.get_tile(
                level,
                (col, row),
            )

        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Could not generate tile: {exc}"
                ),
            ) from exc

    if tile.mode == "RGBA":
        background = Image.new("RGB", tile.size, "white")
        background.paste(tile, mask=tile.getchannel("A"))
        tile = background
    elif tile.mode != "RGB":
        tile = tile.convert("RGB")

    if not if_meta:
        tile = apply_display_transform(
            tile,
            view=view,
            image_type=image_type,
            rgb=rgb,
        )

    if cached.exists():
        return FileResponse(cached, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})
    cached.parent.mkdir(parents=True, exist_ok=True)
    temporary = cached.with_name(f"{cached.name}.{threading.get_ident()}.tmp")
    tile.save(temporary, format="JPEG", quality=TILE_JPEG_QUALITY, subsampling=0, optimize=False)
    try:
        os.replace(temporary, cached)
    except OSError:
        try:
            temporary.unlink()
        except OSError:
            pass
    return FileResponse(cached, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/api/images/{image_id}/region.png")
def image_region(
    image_id: str,
    x: int = Query(...),
    y: int = Query(...),
    width: int = Query(..., ge=1),
    height: int = Query(..., ge=1),
    max_size: int = Query(768, ge=128, le=1536),
    view: str = Query("original"),
    image_type: str = Query("he"),
    rgb: str = Query("111"),
    if_enabled: str = Query(""),
    if_min: str = Query(""),
    if_max: str = Query(""),
    if_gamma: str = Query(""),
    if_brightness: str = Query(""),
    if_colors: str = Query(""),
) -> Response:
    """Return a clipped RGB image region for interactive tools such as Wand.

    Coordinates are level-0 image pixels. The returned PNG may be downsampled;
    exact source and output dimensions are included in response headers so the
    browser can map a mask back to the original image coordinates.
    """
    path, relative = safe_image_path(image_id)
    if preparation_required(path) and not read_ready_manifest(path, relative):
        raise HTTPException(status_code=409, detail="Image is not ready yet")
    render_path = resolve_render_path(path, relative)
    handle = get_slide(render_path)
    if_meta = (
        scientific_multichannel_info(path)
        if str(image_type).lower() == "fluorescence"
        else None
    )

    if if_meta:
        image_width = int(if_meta["width"])
        image_height = int(if_meta["height"])
    else:
        image_width, image_height = (
            handle.dimensions
        )

    x0 = max(
        0,
        min(int(x), image_width - 1),
    )

    y0 = max(
        0,
        min(int(y), image_height - 1),
    )

    source_width = max(
        1,
        min(
            int(width),
            image_width - x0,
        ),
    )

    source_height = max(
        1,
        min(
            int(height),
            image_height - y0,
        ),
    )

    if if_meta:
        scale = min(
            1.0,
            max_size
            / max(
                source_width,
                source_height,
            ),
        )

        output_width = max(
            1,
            round(source_width * scale),
        )

        output_height = max(
            1,
            round(source_height * scale),
        )

        settings = _if_render_settings(
            if_meta,
            enabled=if_enabled,
            minimums=if_min,
            maximums=if_max,
            gammas=if_gamma,
            brightness=if_brightness,
            colors=if_colors,
        )

        try:
            region = (
                render_scientific_multichannel_region(
                    path,
                    if_meta,
                    x0,
                    y0,
                    source_width,
                    source_height,
                    output_width,
                    output_height,
                    settings,
                )
            )

        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500,
                detail=(
                    "Could not read multichannel "
                    f"image region: {exc}"
                ),
            ) from exc

    else:
        requested_downsample = max(
            1.0,
            source_width / max_size,
            source_height / max_size,
        )

        level = int(
            handle.slide.get_best_level_for_downsample(
                requested_downsample
            )
        )

        level_downsample = float(
            handle.slide.level_downsamples[level]
        )

        level_width = max(
            1,
            int(
                (
                    source_width
                    + level_downsample
                    - 1
                )
                // level_downsample
            ),
        )

        level_height = max(
            1,
            int(
                (
                    source_height
                    + level_downsample
                    - 1
                )
                // level_downsample
            ),
        )

        try:
            region = handle.slide.read_region(
                (x0, y0),
                level,
                (
                    level_width,
                    level_height,
                ),
            ).convert("RGB")

        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Could not read image region: {exc}"
                ),
            ) from exc

        scale = min(
            1.0,
            max_size
            / max(
                region.width,
                region.height,
            ),
        )

        if scale < 1.0:
            output_size = (
                max(
                    1,
                    round(
                        region.width * scale
                    ),
                ),
                max(
                    1,
                    round(
                        region.height * scale
                    ),
                ),
            )

            region = region.resize(
                output_size,
                Image.Resampling.BILINEAR,
            )

        region = apply_display_transform(
            region,
            view=view,
            image_type=image_type,
            rgb=rgb,
        )

    buffer = io.BytesIO()
    region.save(buffer, format="PNG", optimize=False)
    headers = {
        "Cache-Control": "private, no-store",
        "X-Region-X": str(x0),
        "X-Region-Y": str(y0),
        "X-Region-Width": str(source_width),
        "X-Region-Height": str(source_height),
        "X-Output-Width": str(region.width),
        "X-Output-Height": str(region.height),
    }
    return Response(buffer.getvalue(), media_type="image/png", headers=headers)


UPLOAD_ID_RE = re.compile(r"^[0-9a-f]{24}$")


def safe_upload_name(raw_name: str) -> str:
    name = Path(str(raw_name).replace("\\", "/")).name.strip()
    name = re.sub(r"[^\w.()\- +]", "_", name, flags=re.UNICODE)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name or len(name) > 220:
        raise HTTPException(status_code=422, detail="Invalid file name")
    if Path(name).suffix.lower() not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Unsupported image format")
    return name


def upload_session_dir(upload_id: str) -> Path:
    if not UPLOAD_ID_RE.fullmatch(upload_id):
        raise HTTPException(status_code=400, detail="Invalid upload identifier")
    destination = (UPLOAD_ROOT / upload_id).resolve()
    try:
        destination.relative_to(UPLOAD_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid upload path") from exc
    return destination


def upload_meta_path(upload_id: str) -> Path:
    return upload_session_dir(upload_id) / "meta.json"


def read_upload_meta(upload_id: str) -> dict[str, Any]:
    path = upload_meta_path(upload_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Upload not found")
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Upload metadata is corrupted") from exc


def unique_image_destination(filename: str) -> Path:
    candidate = IMAGE_ROOT / filename
    if not candidate.exists():
        return candidate
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    for index in range(1, 10000):
        candidate = IMAGE_ROOT / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
    raise HTTPException(status_code=409, detail="Could not create a unique file name")


def upload_response(meta: dict[str, Any], part_path: Path | None = None) -> dict[str, Any]:
    offset = part_path.stat().st_size if part_path and part_path.exists() else int(meta.get("offset", 0))
    return {
        "uploadId": meta["uploadId"],
        "filename": meta["filename"],
        "targetName": meta["targetName"],
        "size": meta["size"],
        "offset": offset,
        "chunkSize": UPLOAD_CHUNK_BYTES,
        "complete": bool(meta.get("complete")),
        "imageId": meta.get("imageId"),
    }


@router.post("/api/uploads/init")
def init_upload(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    filename = safe_upload_name(str(payload.get("filename", "")))
    try:
        size = int(payload.get("size", -1))
        last_modified = int(payload.get("lastModified", 0))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid file size") from exc
    if size <= 0 or size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"The file size must be between 1 byte and {MAX_UPLOAD_GB} GB")

    signature = f"upload-v1|{filename}|{size}|{last_modified}"
    upload_id = hashlib.sha256(signature.encode("utf-8")).hexdigest()[:24]
    session = upload_session_dir(upload_id)
    session.mkdir(parents=True, exist_ok=True)
    meta_path = session / "meta.json"
    part_path = session / "payload.part"

    if meta_path.exists():
        meta = read_upload_meta(upload_id)
        target = IMAGE_ROOT / meta.get("targetName", "")
        if meta.get("complete") and target.is_file():
            meta["imageId"] = encode_image_id(target.relative_to(IMAGE_ROOT).as_posix())
            return upload_response(meta)
        return upload_response(meta, part_path)

    target = unique_image_destination(filename)
    meta = {
        "uploadId": upload_id,
        "filename": filename,
        "targetName": target.name,
        "size": size,
        "lastModified": last_modified,
        "complete": False,
        "createdAtUnix": int(time.time()),
    }
    atomic_write_json(meta_path, meta)
    return upload_response(meta, part_path)


@router.get("/api/uploads/{upload_id}")
def get_upload_status(upload_id: str) -> dict[str, Any]:
    meta = read_upload_meta(upload_id)
    return upload_response(meta, upload_session_dir(upload_id) / "payload.part")


@router.put("/api/uploads/{upload_id}/chunk")
async def upload_chunk(
    upload_id: str,
    request: Request,
    offset: int = Query(ge=0),
) -> dict[str, Any]:
    meta = read_upload_meta(upload_id)
    if meta.get("complete"):
        return upload_response(meta)
    body = await request.body()
    if not body or len(body) > UPLOAD_CHUNK_BYTES:
        raise HTTPException(status_code=413, detail=f"Each block must be between 1 byte and {UPLOAD_CHUNK_MB} MB")
    session = upload_session_dir(upload_id)
    part_path = session / "payload.part"
    current = part_path.stat().st_size if part_path.exists() else 0
    if offset < current and offset + len(body) <= current:
        return upload_response(meta, part_path)
    if offset != current:
        raise HTTPException(status_code=409, detail=f"Expected offset: {current}")
    if current + len(body) > int(meta["size"]):
        raise HTTPException(status_code=413, detail="The block exceeds the declared file size")
    with part_path.open("ab") as stream:
        stream.write(body)
    meta["offset"] = part_path.stat().st_size
    meta["updatedAtUnix"] = int(time.time())
    atomic_write_json(session / "meta.json", meta)
    return upload_response(meta, part_path)


@router.post("/api/uploads/{upload_id}/complete")
def complete_upload(upload_id: str) -> dict[str, Any]:
    meta = read_upload_meta(upload_id)
    session = upload_session_dir(upload_id)
    part_path = session / "payload.part"
    expected = int(meta["size"])
    actual = part_path.stat().st_size if part_path.exists() else 0
    if actual != expected:
        raise HTTPException(status_code=409, detail=f"Incomplete upload: {actual} of {expected} bytes")
    IMAGE_ROOT.mkdir(parents=True, exist_ok=True)
    target = (IMAGE_ROOT / meta["targetName"]).resolve()
    try:
        target.relative_to(IMAGE_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid upload destination") from exc
    if target.exists():
        target = unique_image_destination(meta["filename"])
        meta["targetName"] = target.name
    temporary_target = target.with_name(f".{target.name}.uploading")
    try:
        os.replace(part_path, temporary_target)
    except OSError as exc:
        if exc.errno != errno.EXDEV:
            raise HTTPException(status_code=500, detail=f"Could not move the image: {exc}") from exc
        try:
            shutil.copy2(part_path, temporary_target)
            part_path.unlink()
        except OSError as copy_exc:
            raise HTTPException(status_code=500, detail=f"Could not copy the image: {copy_exc}") from copy_exc
    os.replace(temporary_target, target)
    relative = target.relative_to(IMAGE_ROOT).as_posix()
    meta.update({
        "complete": True,
        "completedAtUnix": int(time.time()),
        "imageId": encode_image_id(relative),
        "targetName": target.name,
        "offset": expected,
    })
    atomic_write_json(session / "meta.json", meta)
    return upload_response(meta)


@router.delete("/api/uploads/{upload_id}")
def cancel_upload(upload_id: str) -> dict[str, Any]:
    session = upload_session_dir(upload_id)
    if session.exists():
        shutil.rmtree(session, ignore_errors=True)
    return {"cancelled": True, "uploadId": upload_id}


__all__ = ['PREP_JOBS', 'PREP_LOCK', 'SlideHandle', '_SLIDE_LOCAL', '_open_slide', 'clear_slide_cache', 'get_slide', 'source_signature', 'preparation_key', 'preparation_dir', 'preparation_manifest', 'preparation_required', 'read_ready_manifest', 'resolve_render_path', 'job_snapshot', 'set_job', 'convert_to_pyramidal_tiff', 'prepare_image_worker', 'cache_tile_path', 'STAIN_HEMATOXYLIN', 'STAIN_EOSIN', 'STAIN_DAB', '_unit_vector', '_stain_matrix', 'apply_display_transform', '_IF_MULTICHANNEL_CACHE', '_IF_MULTICHANNEL_LOCK', '_IF_DEFAULT_COLORS', '_if_channel_slice', '_if_infer_allowed_range', 'scientific_multichannel_info', '_if_parse_float_list', '_if_parse_enabled', '_if_parse_colors', '_if_render_settings', '_if_resize_float_plane', 'render_scientific_multichannel_region', 'list_images', 'get_prepare_status', 'start_prepare', '_safe_metadata_float', '_physical_size_to_um', '_tiff_resolution_to_mpp', '_image_calibration_info', '_calibration_overrides_path', '_read_calibration_overrides', '_write_calibration_overrides', '_positive_float_or_none', '_calibration_override_for_relative', 'image_info', '_read_image_types', 'put_image_calibration_override', 'get_image_display_config', 'put_image_display_config', 'image_original', 'download_original_image', 'image_tile', 'image_region', 'UPLOAD_ID_RE', 'safe_upload_name', 'upload_session_dir', 'upload_meta_path', 'read_upload_meta', 'unique_image_destination', 'upload_response', 'init_upload', 'get_upload_status', 'upload_chunk', 'complete_upload', 'cancel_upload']
