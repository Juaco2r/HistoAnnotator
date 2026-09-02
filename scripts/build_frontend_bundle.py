#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
from pathlib import Path

PARTS = [
    "00_runtime_state.part.js",
    "10_viewer_display_storage.part.js",
    "20_annotations_geometry_history.part.js",
    "30_review_statistics.part.js",
    "40_hdab_protocols.part.js",
    "50_batch_files_platform.part.js",
    "55_reference_evaluation.part.js",
    "60_interactive_learning.part.js",
    "70_event_bindings.part.js",
    "80_anthracosis_frontend.part.js",
    "85_detailed_additional_tools.part.js",
    "86_detailed_il_refinements.part.js",
    "87_report_builder.part.js",
    "88_notes_handwriting_share.part.js",
    "89_capture_note_modes.part.js",
    "90_bootstrap.part.js"
]

EXPECTED_BASELINE_SHA256 = "80f71029ae1db779a01727469657d34a39be3e48c4ed143dcc716759cc48ef7a"


def root_from_script() -> Path:
    return Path(__file__).resolve().parents[1]


def bundle_bytes(root: Path) -> bytes:
    source_root = root / "app" / "static" / "frontend"
    chunks = []
    for name in PARTS:
        path = source_root / name
        if not path.is_file():
            raise FileNotFoundError(f"Missing frontend source part: {path}")
        chunks.append(path.read_bytes())
    return b"".join(chunks)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build/check HistoAnnotator's generated app/static/app.js bundle."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify that app.js exactly matches the modular source parts",
    )
    parser.add_argument(
        "--print-sha",
        action="store_true",
        help="print the reconstructed bundle SHA-256",
    )
    args = parser.parse_args()

    root = root_from_script()
    target = root / "app" / "static" / "app.js"
    generated = bundle_bytes(root)
    digest = sha256(generated)

    if args.print_sha:
        print(digest)

    if args.check:
        if not target.is_file():
            print(f"ERROR: generated bundle target is missing: {target}", file=sys.stderr)
            return 1
        current = target.read_bytes()
        if current != generated:
            print("ERROR: app/static/app.js is out of sync with app/static/frontend parts.", file=sys.stderr)
            print(f"  generated SHA256: {digest}", file=sys.stderr)
            print(f"  current   SHA256: {sha256(current)}", file=sys.stderr)
            print("Run: python3 scripts/build_frontend_bundle.py", file=sys.stderr)
            return 1
        print(f"Frontend bundle OK: {digest}")
        return 0

    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".app.js.", dir=str(target.parent))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(generated)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, target)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)

    print(f"Built {target}")
    print(f"SHA256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
