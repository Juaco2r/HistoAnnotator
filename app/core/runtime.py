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

Image.MAX_IMAGE_PIXELS = None

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


__all__ = ['APP_TITLE', 'IMAGE_ROOT', 'ANNOTATION_ROOT', 'TILE_CACHE_ROOT', 'PREPARED_ROOT', 'UPLOAD_ROOT', 'MAX_SCAN_FILES', 'PREPARE_THRESHOLD_MB', 'PREPARE_THRESHOLD_BYTES', 'TILE_SIZE', 'TILE_JPEG_QUALITY', 'UPLOAD_CHUNK_MB', 'UPLOAD_CHUNK_BYTES', 'MAX_UPLOAD_GB', 'MAX_UPLOAD_BYTES', 'SUPPORTED_SUFFIXES', 'DIRECT_RASTER_SUFFIXES', 'DEFAULT_CLASSES', 'COLOR_RE', 'CLASSES_PATH', 'IMAGE_TYPES_PATH', 'CONFIG_LOCK', 'encode_image_id', 'decode_image_id', 'safe_image_path', 'iter_image_files', 'atomic_write_json', 'validate_classes', 'load_classes']
