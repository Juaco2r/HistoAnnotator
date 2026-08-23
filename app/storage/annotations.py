from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException

ANNOTATION_FILE_RE = re.compile(r"^[A-Za-z0-9 _.-]{1,80}$")


def normalize_annotation_file(value: str | None) -> str:
    name = (value or "Default").strip() or "Default"
    if not ANNOTATION_FILE_RE.fullmatch(name) or name in {".", ".."}:
        raise HTTPException(status_code=422, detail="Invalid annotation file name")
    return name


def annotation_path(
    annotation_root: Path,
    relative: str,
    annotation_file: str = "Default",
) -> Path:
    name = normalize_annotation_file(annotation_file)
    if name.casefold() == "default":
        destination = (annotation_root / f"{relative}.geojson").resolve()
    else:
        destination = (
            annotation_root
            / f"{relative}.annotations"
            / f"{name}.geojson"
        ).resolve()
    try:
        destination.relative_to(annotation_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid annotation path") from exc
    return destination


def annotation_files(annotation_root: Path, relative: str) -> list[str]:
    names: list[str] = ["Default"]
    folder = (annotation_root / f"{relative}.annotations").resolve()
    try:
        folder.relative_to(annotation_root)
    except ValueError:
        return names
    if folder.is_dir():
        for path in sorted(
            folder.glob("*.geojson"),
            key=lambda item: item.name.casefold(),
        ):
            name = path.stem
            if name and name.casefold() != "default":
                names.append(name)
    return names


def empty_feature_collection(relative: str) -> dict[str, Any]:
    # QuPath exchanges annotation objects as a plain GeoJSON FeatureCollection.
    # The image association is kept by HistoAnnotator's filename, not by adding
    # non-standard collection properties.
    return {"type": "FeatureCollection", "features": []}


def create_annotation_document(
    annotation_root: Path,
    relative: str,
    name: str,
    write_json: Callable[[Path, Any], None],
) -> Path:
    path = annotation_path(annotation_root, relative, name)
    if path.exists():
        raise HTTPException(
            status_code=409,
            detail="An annotation file with this name already exists",
        )
    write_json(path, empty_feature_collection(relative))
    return path


def delete_annotation_document(
    annotation_root: Path,
    relative: str,
    name: str,
) -> bool:
    if name.casefold() == "default":
        raise HTTPException(
            status_code=409,
            detail="The Default annotation file cannot be deleted",
        )

    path = annotation_path(annotation_root, relative, name)
    deleted = False
    if path.exists():
        try:
            path.unlink()
            deleted = True
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Could not delete annotation file: {exc}",
            ) from exc

    backup = path.with_suffix(path.suffix + ".bak")
    if backup.exists():
        try:
            backup.unlink()
        except OSError:
            pass

    try:
        if (
            path.parent != annotation_root
            and path.parent.is_dir()
            and not any(path.parent.iterdir())
        ):
            path.parent.rmdir()
    except OSError:
        pass

    return deleted


def read_annotation_document(
    annotation_root: Path,
    relative: str,
    annotation_file: str,
    *,
    error_prefix: str,
) -> dict[str, Any]:
    path = annotation_path(annotation_root, relative, annotation_file)
    if not path.exists():
        return empty_feature_collection(relative)
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"{error_prefix}: {exc}",
        ) from exc


def save_annotation_document(
    annotation_root: Path,
    relative: str,
    name: str,
    payload: dict[str, Any],
    write_json: Callable[[Path, Any], None],
) -> Path:
    destination = annotation_path(annotation_root, relative, name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        shutil.copy2(
            destination,
            destination.with_suffix(destination.suffix + ".bak"),
        )
    write_json(destination, payload)
    return destination
