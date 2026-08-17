from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path


DESKTOP_VERSION = "1.2.0"


def bundled_root() -> Path:
    return (
        Path(__file__)
        .resolve()
        .parents[1]
    )


def self_test() -> int:
    test_root = (
        Path(tempfile.gettempdir())
        / "HistoAnnotatorDesktopSelfTest"
    )

    image_root = (
        test_root / "images"
    )

    data_root = (
        test_root / "data"
    )

    image_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    for name in (
        "annotations",
        "cache",
        "prepared",
        "uploads",
    ):
        (
            data_root / name
        ).mkdir(
            parents=True,
            exist_ok=True,
        )

    os.environ["IMAGE_ROOT"] = str(
        image_root
    )
    os.environ["ANNOTATION_ROOT"] = str(
        data_root / "annotations"
    )
    os.environ["TILE_CACHE_ROOT"] = str(
        data_root / "cache"
    )
    os.environ["PREPARED_ROOT"] = str(
        data_root / "prepared"
    )
    os.environ["UPLOAD_ROOT"] = str(
        data_root / "uploads"
    )

    import openslide
    import pyvips
    import app.main as backend
    import desktop.server_runner as server_runner
    import desktop.desktop_app as desktop_app

    static_dir = (
        Path(backend.__file__)
        .resolve()
        .parent
        / "static"
    )

    pyvips_test_file = test_root / "pyvips-self-test.tif"
    try:
        pyvips.Image.black(32, 32).tiffsave(
            str(pyvips_test_file),
            tile=True,
            pyramid=True,
            bigtiff=True,
        )
        pyvips_runtime_ok = (
            pyvips_test_file.is_file()
            and pyvips_test_file.stat().st_size > 0
        )
    except Exception:
        pyvips_runtime_ok = False

    result = {
        "desktop_version":
            DESKTOP_VERSION,
        "openslide_python":
            getattr(
                openslide,
                "__version__",
                "unknown",
            ),
        "openslide_library":
            getattr(
                openslide,
                "__library_version__",
                "unknown",
            ),
        "pyvips_runtime": pyvips_runtime_ok,
        "backend_title":
            backend.app.title,
        "desktop_import":
            callable(desktop_app.run_desktop),
        "server_import":
            callable(server_runner.run_server),
        "static_index":
            (
                static_dir
                / "index.html"
            ).is_file(),
        "openseadragon_asset":
            (
                static_dir
                / "vendor"
                / "openseadragon"
                / "openseadragon.min.js"
            ).is_file(),
        "bundled_root":
            str(
                bundled_root()
            ),
    }

    print(
        json.dumps(
            result,
            indent=2,
        )
    )

    if not result["pyvips_runtime"]:
        return 7

    if not result["static_index"]:
        return 3

    if not result["openseadragon_asset"]:
        return 6

    if not result["desktop_import"]:
        return 4

    if not result["server_import"]:
        return 5

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        add_help=True
    )

    parser.add_argument(
        "--server-runtime",
        default="",
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
    )

    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if args.server_runtime:
        from desktop.server_runner import (
            run_server,
        )

        return run_server(
            args.server_runtime
        )

    from desktop.desktop_app import (
        run_desktop,
    )

    return run_desktop()


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
