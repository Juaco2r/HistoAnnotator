from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def run_server(runtime_file: str | Path) -> int:
    runtime_path = (
        Path(runtime_file)
        .expanduser()
        .resolve()
    )

    payload = json.loads(
        runtime_path.read_text(
            encoding="utf-8"
        )
    )

    project_root = (
        Path(payload["project_root"])
        .expanduser()
        .resolve()
    )

    image_root = (
        Path(payload["image_root"])
        .expanduser()
        .resolve()
    )

    data_root = (
        Path(payload["data_root"])
        .expanduser()
        .resolve()
    )

    host = str(
        payload.get(
            "host",
            "127.0.0.1",
        )
    )

    port = int(
        payload.get(
            "port",
            8765,
        )
    )

    if not image_root.is_dir():
        raise SystemExit(
            f"Image directory does not exist: "
            f"{image_root}"
        )

    storage = {
        "ANNOTATION_ROOT":
            data_root / "annotations",
        "TILE_CACHE_ROOT":
            data_root / "cache",
        "PREPARED_ROOT":
            data_root / "prepared",
        "UPLOAD_ROOT":
            data_root / "uploads",
    }

    for directory in storage.values():
        directory.mkdir(
            parents=True,
            exist_ok=True,
        )

    os.environ["IMAGE_ROOT"] = str(
        image_root
    )

    for key, directory in storage.items():
        os.environ[key] = str(
            directory
        )

    os.environ.setdefault(
        "APP_TITLE",
        "HistoAnnotator",
    )

    if str(project_root) not in sys.path:
        sys.path.insert(
            0,
            str(project_root),
        )

    import uvicorn
    from app.main import app

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=False,
    )

    return 0
