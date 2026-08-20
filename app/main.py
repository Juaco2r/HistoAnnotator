from __future__ import annotations

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

Image.MAX_IMAGE_PIXELS = None

APP_TITLE = os.getenv("APP_TITLE", "HistoAnnotator")
IMAGE_ROOT = Path(os.getenv("IMAGE_ROOT", "/data/images")).resolve()
ANNOTATION_ROOT = Path(os.getenv("ANNOTATION_ROOT", "/data/annotations")).resolve()
TILE_CACHE_ROOT = Path(os.getenv("TILE_CACHE_ROOT", "/data/cache")).resolve()
PREPARED_ROOT = Path(os.getenv("PREPARED_ROOT", "/data/prepared")).resolve()
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "/data/uploads")).resolve()
MAX_SCAN_FILES = max(1, int(os.getenv("MAX_SCAN_FILES", "5000")))
PREPARE_THRESHOLD_MB = max(1, int(os.getenv("PREPARE_THRESHOLD_MB", "128")))
PREPARE_THRESHOLD_BYTES = PREPARE_THRESHOLD_MB * 1024 * 1024
TILE_SIZE = min(1024, max(128, int(os.getenv("TILE_SIZE", "512"))))
TILE_JPEG_QUALITY = min(100, max(70, int(os.getenv("TILE_JPEG_QUALITY", "90"))))
UPLOAD_CHUNK_MB = min(64, max(2, int(os.getenv("UPLOAD_CHUNK_MB", "8"))))
UPLOAD_CHUNK_BYTES = UPLOAD_CHUNK_MB * 1024 * 1024
MAX_UPLOAD_GB = min(500, max(1, int(os.getenv("MAX_UPLOAD_GB", "50"))))
MAX_UPLOAD_BYTES = MAX_UPLOAD_GB * 1024 * 1024 * 1024

SUPPORTED_SUFFIXES = {
    ".svs", ".ndpi", ".scn", ".mrxs", ".vms", ".vmu", ".bif",
    ".tif", ".tiff", ".jpg", ".jpeg", ".png", ".webp", ".bmp",
}
DIRECT_RASTER_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_CLASSES = [
    {"name": "Tumor", "color": "#ff6b6b"},
    {"name": "Stroma", "color": "#4dabf7"},
    {"name": "Necrosis", "color": "#ffd43b"},
    {"name": "Anthracosis", "color": "#9775fa"},
    {"name": "Artifact", "color": "#69db7c"},
]
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

ANNOTATION_ROOT.mkdir(parents=True, exist_ok=True)
TILE_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
PREPARED_ROOT.mkdir(parents=True, exist_ok=True)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
CLASSES_PATH = ANNOTATION_ROOT / "_config" / "classes.json"
IMAGE_TYPES_PATH = ANNOTATION_ROOT / "_config" / "image_types.json"
CONFIG_LOCK = threading.RLock()

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

PREP_JOBS: dict[str, dict[str, Any]] = {}
PREP_LOCK = threading.RLock()


def encode_image_id(relative_path: str) -> str:
    raw = relative_path.encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_image_id(image_id: str) -> str:
    try:
        padding = "=" * (-len(image_id) % 4)
        return base64.urlsafe_b64decode(image_id + padding).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image identifier") from exc


def safe_image_path(image_id: str) -> tuple[Path, str]:
    relative = decode_image_id(image_id)
    candidate = (IMAGE_ROOT / relative).resolve()
    try:
        candidate.relative_to(IMAGE_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Path is outside the image repository") from exc
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return candidate, relative


def iter_image_files() -> Iterator[Path]:
    if not IMAGE_ROOT.exists():
        return
    count = 0
    for root, dirs, files in os.walk(IMAGE_ROOT):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            if name.startswith("."):
                continue
            path = Path(root) / name
            if path.suffix.lower() in SUPPORTED_SUFFIXES:
                yield path
                count += 1
                if count >= MAX_SCAN_FILES:
                    return


ANNOTATION_FILE_RE = re.compile(r"^[A-Za-z0-9 _.-]{1,80}$")

def normalize_annotation_file(value: str | None) -> str:
    name = (value or "Default").strip() or "Default"
    if not ANNOTATION_FILE_RE.fullmatch(name) or name in {".", ".."}:
        raise HTTPException(status_code=422, detail="Invalid annotation file name")
    return name

def annotation_path(relative: str, annotation_file: str = "Default") -> Path:
    name = normalize_annotation_file(annotation_file)
    if name.casefold() == "default":
        destination = (ANNOTATION_ROOT / f"{relative}.geojson").resolve()
    else:
        destination = (ANNOTATION_ROOT / f"{relative}.annotations" / f"{name}.geojson").resolve()
    try:
        destination.relative_to(ANNOTATION_ROOT)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid annotation path") from exc
    return destination

def annotation_files(relative: str) -> list[str]:
    names: list[str] = ["Default"]
    folder = (ANNOTATION_ROOT / f"{relative}.annotations").resolve()
    try:
        folder.relative_to(ANNOTATION_ROOT)
    except ValueError:
        return names
    if folder.is_dir():
        for path in sorted(folder.glob("*.geojson"), key=lambda item: item.name.casefold()):
            name = path.stem
            if name and name.casefold() != "default":
                names.append(name)
    return names


def empty_feature_collection(relative: str) -> dict[str, Any]:
    # QuPath exchanges annotation objects as a plain GeoJSON FeatureCollection.
    # The image association is kept by HistoAnnotator's filename, not by adding
    # non-standard collection properties.
    return {"type": "FeatureCollection", "features": []}


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    os.replace(temporary, path)


def validate_classes(payload: Any) -> list[dict[str, str]]:
    classes = payload.get("classes") if isinstance(payload, dict) else payload

    if not isinstance(classes, list) or not classes:
        raise HTTPException(
            status_code=422,
            detail="At least one class is required",
        )

    if len(classes) > 100:
        raise HTTPException(
            status_code=422,
            detail="A maximum of 100 classes is allowed",
        )

    artifact_name = "Artifact"
    artifact_color = "#69db7c"

    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    artifact_seen = False

    for index, item in enumerate(classes):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid class at index {index}",
            )

        name = str(item.get("name", "")).strip()
        color = str(item.get("color", "")).strip()

        if not name:
            raise HTTPException(
                status_code=422,
                detail=f"Class name is required at index {index}",
            )

        if name.casefold() == artifact_name.casefold():
            if not artifact_seen:
                normalized.append({
                    "name": artifact_name,
                    "color": artifact_color,
                })
                artifact_seen = True
                seen.add(artifact_name.casefold())
            continue

        key = name.casefold()
        if key in seen:
            raise HTTPException(
                status_code=422,
                detail=f"Duplicate class name: {name}",
            )

        if not COLOR_RE.fullmatch(color):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid color for class: {name}",
            )

        seen.add(key)
        normalized.append({
            "name": name,
            "color": color.lower(),
        })

    if not artifact_seen:
        normalized.append({
            "name": artifact_name,
            "color": artifact_color,
        })

    if len(normalized) > 100:
        raise HTTPException(
            status_code=422,
            detail="A maximum of 100 classes is allowed including Artifact",
        )

    return normalized


def load_classes() -> list[dict[str, str]]:
    if not CLASSES_PATH.exists():
        return DEFAULT_CLASSES
    try:
        with CLASSES_PATH.open("r", encoding="utf-8") as stream:
            return validate_classes(json.load(stream))
    except (OSError, json.JSONDecodeError, HTTPException):
        return DEFAULT_CLASSES


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


@app.get("/health/live")
def health_live() -> dict[str, Any]:
    return {"status": "ok", "version": "1.4.0-dev-IL8.3"}


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



# ============================================================
# Scientific multichannel fluorescence display
# ============================================================

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



@app.get("/api/images")
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


@app.get("/api/images/{image_id}/prepare")
def get_prepare_status(image_id: str) -> dict[str, Any]:
    path, relative = safe_image_path(image_id)
    return job_snapshot(image_id, path, relative)


@app.post("/api/images/{image_id}/prepare")
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


@app.get("/api/images/{image_id}/info")
def image_info(image_id: str) -> dict[str, Any]:
    path, relative = safe_image_path(image_id)
    if preparation_required(path) and not read_ready_manifest(path, relative):
        raise HTTPException(status_code=409, detail="The large image must be prepared locally before it can be opened")
    render_path = resolve_render_path(path, relative)
    handle = get_slide(render_path)
    width, height = handle.dimensions
    properties = handle.slide.properties
    multichannel = scientific_multichannel_info(path)
    calibration = _image_calibration_info(path, properties)

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
        "multichannel": multichannel,
    }


def _read_image_types() -> dict[str, str]:
    with CONFIG_LOCK:
        try:
            payload = json.loads(IMAGE_TYPES_PATH.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

@app.get("/api/images/{image_id}/display-config")
def get_image_display_config(image_id: str) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    image_types = _read_image_types()
    return {"imageType": image_types.get(relative, "he")}

@app.put("/api/images/{image_id}/display-config")
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


@app.get("/api/images/{image_id}/original")
def image_original(image_id: str) -> Response:
    path, _ = safe_image_path(image_id)
    media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = media_types.get(path.suffix.lower())
    if media_type is None:
        raise HTTPException(status_code=415, detail="Direct loading is only available for JPG, PNG, and WebP")
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/images/{image_id}/download")
def download_original_image(image_id: str) -> FileResponse:
    path, _ = safe_image_path(image_id)
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
        headers={"Cache-Control": "private, no-store"},
    )


@app.get("/api/images/{image_id}/tiles/{level}/{col}_{row}.jpeg")
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


@app.get("/api/images/{image_id}/region.png")
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


@app.post("/api/uploads/init")
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


@app.get("/api/uploads/{upload_id}")
def get_upload_status(upload_id: str) -> dict[str, Any]:
    meta = read_upload_meta(upload_id)
    return upload_response(meta, upload_session_dir(upload_id) / "payload.part")


@app.put("/api/uploads/{upload_id}/chunk")
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


@app.post("/api/uploads/{upload_id}/complete")
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


@app.delete("/api/uploads/{upload_id}")
def cancel_upload(upload_id: str) -> dict[str, Any]:
    session = upload_session_dir(upload_id)
    if session.exists():
        shutil.rmtree(session, ignore_errors=True)
    return {"cancelled": True, "uploadId": upload_id}



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


@app.post("/api/geometry/brush")
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


@app.post("/api/geometry/boolean")
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


@app.post("/api/geometry/select")
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


@app.post("/api/geojson/statistics")
def geojson_statistics(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    if payload.get("type") == "FeatureCollection":
        collection_payload = payload
        image_width = 0.0
        image_height = 0.0
    else:
        collection_payload = payload.get("featureCollection")

        if not isinstance(collection_payload, dict):
            raise HTTPException(
                status_code=422,
                detail="featureCollection is required",
            )

        image_width = max(
            0.0,
            float(payload.get("imageWidth", 0) or 0),
        )
        image_height = max(
            0.0,
            float(payload.get("imageHeight", 0) or 0),
        )

    collection, report = sanitize_qupath_feature_collection(
        collection_payload
    )

    image_region = GeometryCollection()
    if image_width > 0 and image_height > 0:
        image_region = Polygon([
            (0.0, 0.0),
            (image_width, 0.0),
            (image_width, image_height),
            (0.0, image_height),
        ])

    tissue_geometries: list[Any] = []
    artifact_geometries: list[Any] = []
    artifact_count = 0

    border_enabled = False
    border_percent = 0.0

    annotation_records: list[tuple[str, Any]] = []

    for feature in collection.get("features", []):
        properties = feature.get("properties", {})
        histo = properties.get("histoannotator", {})

        role = str(
            histo.get("role", "annotation")
        ).strip().lower()

        classification_name = str(
            properties
            .get("classification", {})
            .get("name")
            or "Unclassified"
        ).strip()

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue

        try:
            geometry = _polygonal_geometry(geometry_payload)
        except HTTPException:
            continue

        if geometry.is_empty:
            continue

        roi_meta = histo.get("roi", {})
        roi_kind = (
            str(roi_meta.get("kind", "tissue")).strip().lower()
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
                        border_meta.get("enabled", False)
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

        is_artifact = (
            role == "artifact"
            or classification_name.casefold()
            == "artifact"
        )

        if is_artifact:
            artifact_count += 1
            artifact_geometries.append(geometry)
            continue

        if role != "annotation":
            continue

        annotation_records.append(
            (classification_name or "Unclassified", geometry)
        )

    tissue_roi = (
        unary_union(tissue_geometries)
        if tissue_geometries
        else GeometryCollection()
    )

    if not tissue_roi.is_empty and not tissue_roi.is_valid:
        tissue_roi = make_valid(tissue_roi)

    tissue_roi = (
        _polygonal_only(tissue_roi)
        if not tissue_roi.is_empty
        else None
    )

    has_tissue_roi = (
        tissue_roi is not None
        and not tissue_roi.is_empty
    )

    if has_tissue_roi:
        analysis_base = tissue_roi

        if not image_region.is_empty:
            clipped = analysis_base.intersection(
                image_region
            )
            analysis_base = (
                _polygonal_only(clipped)
                or GeometryCollection()
            )

        analysis_source = "tissue-roi"
    else:
        analysis_base = image_region
        analysis_source = "full-image"

    if analysis_base.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Statistics require either a valid Tissue ROI "
                "or valid image dimensions"
            ),
        )

    base_area = float(analysis_base.area)

    requested_border = (
        border_percent
        if has_tissue_roi and border_enabled
        else 0.0
    )

    post_border_region, actual_border, border_width = (
        _stats_exclude_external_border(
            analysis_base,
            requested_border,
        )
    )

    if post_border_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "The Tissue ROI external-border exclusion removed "
                "the complete analysis region"
            ),
        )

    post_border_area = float(
        post_border_region.area
    )

    artifact_union = GeometryCollection()

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
            _polygonal_only(artifact_union)
            or GeometryCollection()
        )

        if not artifact_union.is_empty:
            artifact_union = artifact_union.intersection(
                post_border_region
            )
            artifact_union = (
                _polygonal_only(artifact_union)
                or GeometryCollection()
            )

    artifact_area = (
        float(artifact_union.area)
        if not artifact_union.is_empty
        else 0.0
    )

    valid_region = (
        post_border_region.difference(
            artifact_union
        )
        if not artifact_union.is_empty
        else post_border_region
    )

    if not valid_region.is_valid:
        valid_region = make_valid(valid_region)

    valid_region = (
        _polygonal_only(valid_region)
        or GeometryCollection()
    )

    if valid_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Artifact exclusion removed the complete "
                "analysis region"
            ),
        )

    valid_area = float(valid_region.area)

    grouped_valid: dict[str, list[Any]] = {}
    grouped_counts: dict[str, int] = {}
    class_names: set[str] = set()
    all_valid: list[Any] = []

    for class_name, geometry in annotation_records:
        class_names.add(class_name)

        effective = geometry.intersection(
            valid_region
        )
        effective = _polygonal_only(
            effective
        )

        if (
            effective is None
            or effective.is_empty
        ):
            continue

        grouped_valid.setdefault(
            class_name,
            [],
        ).append(effective)

        grouped_counts[class_name] = (
            grouped_counts.get(class_name, 0)
            + 1
        )

        all_valid.append(effective)

    rows = []

    for class_name in sorted(
        class_names,
        key=str.casefold,
    ):
        items = grouped_valid.get(
            class_name,
            [],
        )

        merged = (
            unary_union(items)
            if items
            else GeometryCollection()
        )

        area = (
            float(merged.area)
            if not merged.is_empty
            else 0.0
        )

        rows.append({
            "className": class_name,
            "count": int(
                grouped_counts.get(
                    class_name,
                    0,
                )
            ),
            "areaPx2": area,
            "percentValid": (
                100.0 * area / valid_area
                if valid_area > 0
                else 0.0
            ),
        })

    all_union = (
        unary_union(all_valid)
        if all_valid
        else GeometryCollection()
    )

    total_area = (
        float(all_union.area)
        if not all_union.is_empty
        else 0.0
    )

    artifact_percent = (
        100.0
        * artifact_area
        / post_border_area
        if post_border_area > 0
        else 0.0
    )

    return {
        "rows": rows,
        "totalAnnotations": int(
            sum(grouped_counts.values())
        ),
        "totalUnionAreaPx2": total_area,
        "totalPercentValid": (
            100.0 * total_area / valid_area
            if valid_area > 0
            else 0.0
        ),
        "analysis": {
            "source": analysis_source,
            "roiPresent": bool(
                has_tissue_roi
            ),
            "imageAreaPx2": (
                float(image_region.area)
                if not image_region.is_empty
                else 0.0
            ),
            "baseAreaPx2": base_area,
            "postBorderAreaPx2": post_border_area,
            "externalBorderEnabled": bool(
                has_tissue_roi
                and border_enabled
            ),
            "externalBorderRequestedPct": float(
                requested_border
            ),
            "externalBorderActualPct": float(
                actual_border
            ),
            "externalBorderWidthPx": float(
                border_width
            ),
            "artifactCount": int(
                artifact_count
            ),
            "artifactAreaPx2": artifact_area,
            "artifactPercentPostBorder": float(
                artifact_percent
            ),
            "validAreaPx2": valid_area,
        },
        "report": report,
    }


@app.post("/api/geojson/fill-unannotated")
def geojson_fill_unannotated(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    collection_payload = payload.get("featureCollection")
    if not isinstance(collection_payload, dict):
        raise HTTPException(status_code=422, detail="featureCollection is required")

    image_width = max(0.0, float(payload.get("imageWidth", 0) or 0))
    image_height = max(0.0, float(payload.get("imageHeight", 0) or 0))
    collection, report = sanitize_qupath_feature_collection(collection_payload)

    image_region = GeometryCollection()
    if image_width > 0 and image_height > 0:
        image_region = Polygon([
            (0.0, 0.0),
            (image_width, 0.0),
            (image_width, image_height),
            (0.0, image_height),
        ])

    tissue_geometries: list[Any] = []
    artifact_geometries: list[Any] = []
    annotation_geometries: list[Any] = []
    border_enabled = False
    border_percent = 0.0

    for feature in collection.get("features", []):
        properties = feature.get("properties", {})
        histo = properties.get("histoannotator", {})
        role = str(histo.get("role", "annotation")).strip().lower()
        class_name = str(
            properties.get("classification", {}).get("name") or "Unclassified"
        ).strip()

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue
        try:
            geometry = _polygonal_geometry(geometry_payload)
        except HTTPException:
            continue
        if geometry.is_empty:
            continue

        roi_meta = histo.get("roi", {})
        roi_kind = (
            str(roi_meta.get("kind", "tissue")).strip().lower()
            if isinstance(roi_meta, dict)
            else "tissue"
        )

        if role == "roi" and roi_kind == "tissue":
            tissue_geometries.append(geometry)
            if isinstance(roi_meta, dict):
                border_meta = roi_meta.get("externalBorderExclusion")
                if isinstance(border_meta, dict):
                    border_enabled = bool(border_meta.get("enabled", False))
                    try:
                        border_percent = max(
                            0.0,
                            min(50.0, float(border_meta.get("percent", 0) or 0)),
                        )
                    except (TypeError, ValueError):
                        border_percent = 0.0
            continue

        if role == "artifact" or class_name.casefold() == "artifact":
            artifact_geometries.append(geometry)
            continue

        if role == "annotation":
            annotation_geometries.append(geometry)

    tissue_roi = unary_union(tissue_geometries) if tissue_geometries else GeometryCollection()
    if not tissue_roi.is_empty and not tissue_roi.is_valid:
        tissue_roi = make_valid(tissue_roi)
    tissue_polygonal = _polygonal_only(tissue_roi) if not tissue_roi.is_empty else None
    has_tissue_roi = tissue_polygonal is not None and not tissue_polygonal.is_empty

    if has_tissue_roi:
        analysis_base = tissue_polygonal
        if not image_region.is_empty:
            clipped = analysis_base.intersection(image_region)
            clipped_polygonal = _polygonal_only(clipped)
            analysis_base = clipped_polygonal if clipped_polygonal is not None else GeometryCollection()
        analysis_source = "tissue-roi"
    else:
        analysis_base = image_region
        analysis_source = "full-image"

    if analysis_base.is_empty:
        raise HTTPException(
            status_code=422,
            detail="Fill unannotated tissue requires a valid Tissue ROI or valid image dimensions",
        )

    requested_border = border_percent if has_tissue_roi and border_enabled else 0.0
    post_border_region, actual_border, border_width = _stats_exclude_external_border(
        analysis_base,
        requested_border,
    )
    if post_border_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail="The external-border exclusion removed the complete analysis region",
        )

    artifact_union = GeometryCollection()
    if artifact_geometries:
        artifact_union = unary_union(artifact_geometries)
        if not artifact_union.is_empty and not artifact_union.is_valid:
            artifact_union = make_valid(artifact_union)
        artifact_polygonal = _polygonal_only(artifact_union)
        artifact_union = artifact_polygonal if artifact_polygonal is not None else GeometryCollection()
        if not artifact_union.is_empty:
            artifact_union = artifact_union.intersection(post_border_region)
            artifact_polygonal = _polygonal_only(artifact_union)
            artifact_union = artifact_polygonal if artifact_polygonal is not None else GeometryCollection()

    valid_region = (
        post_border_region.difference(artifact_union)
        if not artifact_union.is_empty
        else post_border_region
    )
    if not valid_region.is_empty and not valid_region.is_valid:
        valid_region = make_valid(valid_region)
    valid_polygonal = _polygonal_only(valid_region)
    valid_region = valid_polygonal if valid_polygonal is not None else GeometryCollection()
    if valid_region.is_empty:
        raise HTTPException(status_code=422, detail="Artifact exclusion removed the complete valid tissue region")

    annotated_union = GeometryCollection()
    if annotation_geometries:
        annotated_union = unary_union(annotation_geometries)
        if not annotated_union.is_empty and not annotated_union.is_valid:
            annotated_union = make_valid(annotated_union)
        annotated_polygonal = _polygonal_only(annotated_union)
        annotated_union = annotated_polygonal if annotated_polygonal is not None else GeometryCollection()
        if not annotated_union.is_empty:
            annotated_union = annotated_union.intersection(valid_region)
            annotated_polygonal = _polygonal_only(annotated_union)
            annotated_union = annotated_polygonal if annotated_polygonal is not None else GeometryCollection()

    remaining = (
        valid_region.difference(annotated_union)
        if not annotated_union.is_empty
        else valid_region
    )
    if not remaining.is_empty and not remaining.is_valid:
        remaining = make_valid(remaining)
    remaining_polygonal = _polygonal_only(remaining)
    remaining = remaining_polygonal if remaining_polygonal is not None else GeometryCollection()

    valid_area = float(valid_region.area)
    annotated_area = float(annotated_union.area) if not annotated_union.is_empty else 0.0
    remaining_area = float(remaining.area) if not remaining.is_empty else 0.0
    artifact_area = float(artifact_union.area) if not artifact_union.is_empty else 0.0

    return {
        "geometry": mapping(remaining) if not remaining.is_empty else None,
        "validAreaPx2": valid_area,
        "annotatedAreaPx2": annotated_area,
        "remainingAreaPx2": remaining_area,
        "remainingPercentValid": 100.0 * remaining_area / valid_area if valid_area > 0 else 0.0,
        "annotationCount": len(annotation_geometries),
        "analysis": {
            "source": analysis_source,
            "roiPresent": bool(has_tissue_roi),
            "externalBorderEnabled": bool(has_tissue_roi and border_enabled),
            "externalBorderRequestedPct": float(requested_border),
            "externalBorderActualPct": float(actual_border),
            "externalBorderWidthPx": float(border_width),
            "artifactAreaPx2": artifact_area,
        },
        "report": report,
    }


@app.post("/api/geojson/qupath-export")
def qupath_export(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    collection, report = sanitize_qupath_feature_collection(payload)
    return {"featureCollection": collection, "report": report}


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
    path = annotation_path(relative, name)
    if path.exists():
        raise HTTPException(status_code=409, detail="An annotation file with this name already exists")
    atomic_write_json(path, empty_feature_collection(relative))
    return {"created": True, "name": name, "files": annotation_files(relative)}


@app.delete("/api/annotations/{image_id}/files")
def delete_annotation_file(
    image_id: str,
    file: str = Query(...),
) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)

    if name.casefold() == "default":
        raise HTTPException(status_code=409, detail="The Default annotation file cannot be deleted")

    path = annotation_path(relative, name)
    deleted = False
    if path.exists():
        try:
            path.unlink()
            deleted = True
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not delete annotation file: {exc}") from exc

    backup = path.with_suffix(path.suffix + ".bak")
    if backup.exists():
        try:
            backup.unlink()
        except OSError:
            pass

    try:
        if path.parent != ANNOTATION_ROOT and path.parent.is_dir() and not any(path.parent.iterdir()):
            path.parent.rmdir()
    except OSError:
        pass

    return {
        "deleted": deleted,
        "name": name,
        "files": annotation_files(relative),
    }


@app.get("/api/annotations/{image_id}")
def get_annotations(image_id: str, file: str = Query("Default")) -> JSONResponse:
    _, relative = safe_image_path(image_id)
    path = annotation_path(relative, file)
    if not path.exists():
        return JSONResponse(empty_feature_collection(relative))
    try:
        with path.open("r", encoding="utf-8") as stream:
            payload = json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Could not read GeoJSON: {exc}") from exc
    return JSONResponse(payload)


@app.put("/api/annotations/{image_id}")
def put_annotations(image_id: str, payload: dict[str, Any] = Body(...), file: str = Query("Default")) -> dict[str, Any]:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)
    normalized, report = sanitize_qupath_feature_collection(payload)
    destination = annotation_path(relative, name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        shutil.copy2(destination, destination.with_suffix(destination.suffix + ".bak"))
    atomic_write_json(destination, normalized)
    return {
        "saved": True,
        "features": len(normalized.get("features", [])),
        "annotationFile": name,
        "relativePath": str(destination.relative_to(ANNOTATION_ROOT)),
        "featureCollection": normalized,
        "report": report,
    }


@app.get("/api/annotations/{image_id}/download")
def download_annotations(image_id: str, file: str = Query("Default")) -> Response:
    _, relative = safe_image_path(image_id)
    name = normalize_annotation_file(file)
    path = annotation_path(relative, name)
    suffix = "" if name.casefold() == "default" else f".{name}"
    filename = f"{Path(relative).name}{suffix}.geojson"
    if not path.exists():
        collection = empty_feature_collection(relative)
    else:
        try:
            collection = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=500, detail=f"Could not read annotation file: {exc}") from exc
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


def _il1_mask_to_geometry(
    mask: np.ndarray,
    scale_x: float,
    scale_y: float,
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

    if len(contours) > 20000:
        raise HTTPException(
            status_code=422,
            detail=(
                "Suggestions are too fragmented at this sensitivity. "
                "Increase smoothing or lower sensitivity."
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



# ============================================================================
# Phase IL2 - feedback learning and suggestion decisions
# ============================================================================


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


# Phase IL2.1 - class dropdown, inline edit, finer suggestions

# ========================================================================
# Phase IL6 - multi-image training sources
# ========================================================================

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



# ========================================================================
# Phase IL8 - similarity-aware auxiliary training
#
# Auxiliary sources remain explicitly user-selected. Their influence is
# reduced when tissue appearance differs from the current image.
# ========================================================================

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
        "appearanceDescriptor":
            appearance_descriptor,
    }


@app.post("/api/interactive-learning/{image_id}/suggest")
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
