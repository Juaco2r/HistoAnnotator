#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/app/static"
DEST="$ROOT/android-app/www"
NODE_MODULES="$ROOT/android-app/node_modules"

echo "Preparing HistoAnnotator Android web assets..."

NATIVE_SERVER="${HISTOANNOTATOR_NATIVE_SERVER:-}"

if [[ -z "$NATIVE_SERVER" ]]; then
  echo "ERROR: HISTOANNOTATOR_NATIVE_SERVER is not set."
  echo
  echo "Example:"
  echo "  HISTOANNOTATOR_NATIVE_SERVER=https://your-server.example/annotator bash scripts/build_android_web.sh"
  exit 1
fi

export NATIVE_SERVER

rm -rf "$DEST"
mkdir -p "$DEST/static"

# Root application files
cp "$SOURCE/index.html" "$DEST/index.html"
cp "$SOURCE/service-worker.js" "$DEST/service-worker.js"


# Static frontend assets, excluding local backups
(
  cd "$SOURCE"
  tar \
    --exclude='index.html' \
    --exclude='service-worker.js' \
    --exclude='*.bak' \
    --exclude='*.bak-*' \
    --exclude='*.backup*' \
    --exclude='*~' \
    -cf - .
) | (
  cd "$DEST/static"
  tar -xf -
)

# Inject the Android backend URL at build time. The public source tree
# intentionally contains no deployment-specific server address.
python3 - "$DEST/static/app.js" <<'PYNATIVE'
import json
import os
import sys
from pathlib import Path

p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")

placeholder = '"__HISTOANNOTATOR_NATIVE_SERVER__"'

if placeholder not in text:
    raise SystemExit(
        "ERROR: native server placeholder was not found in app.js"
    )

server = os.environ["NATIVE_SERVER"].rstrip("/")

text = text.replace(
    placeholder,
    json.dumps(server),
    1,
)

p.write_text(text, encoding="utf-8")
print(f"✓ Native backend configured: {server}")
PYNATIVE


# OpenSeadragon is downloaded during the Docker build for the web version.
# Android needs its own local copy inside the APK.
OSD_JS="$(find "$NODE_MODULES/openseadragon" \
  -type f \
  -path '*/build/openseadragon/openseadragon.min.js' \
  -print \
  -quit)"

if [[ -z "$OSD_JS" ]]; then
  echo "ERROR: OpenSeadragon JavaScript was not found."
  echo "Run: cd android-app && npm install openseadragon@6.0.2"
  exit 1
fi

mkdir -p "$DEST/static/vendor/openseadragon"
cp "$OSD_JS" \
  "$DEST/static/vendor/openseadragon/openseadragon.min.js"

OSD_LICENSE="$(find "$NODE_MODULES/openseadragon" \
  -maxdepth 2 \
  -type f \
  -iname 'LICENSE*' \
  -print \
  -quit || true)"

if [[ -n "$OSD_LICENSE" ]]; then
  cp "$OSD_LICENSE" \
    "$DEST/static/vendor/openseadragon/LICENSE.txt"
fi

echo
echo "Android web assets prepared:"
echo "  Source: $SOURCE"
echo "  Target: $DEST"
echo


# ---------------------------------------------------------
# Android offline geometry engine
# ---------------------------------------------------------
POLYGON_CLIPPING_JS="$NODE_MODULES/polygon-clipping/dist/polygon-clipping.umd.js"

if [[ ! -f "$POLYGON_CLIPPING_JS" ]]; then
  echo "ERROR: polygon-clipping is not installed."
  echo "Run: cd android-app && npm install polygon-clipping@0.15.7"
  exit 1
fi

mkdir -p "$DEST/static/vendor/polygon-clipping"

cp \
  "$POLYGON_CLIPPING_JS" \
  "$DEST/static/vendor/polygon-clipping/polygon-clipping.umd.js"

# Load polygon-clipping before HistoAnnotator's app.js.
python3 - "$DEST/index.html" <<'PYHTML'
from pathlib import Path
import sys

p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")

script = (
    '  <script src="./static/vendor/polygon-clipping/'
    'polygon-clipping.umd.js"></script>\n'
)

if "polygon-clipping.umd.js" not in text:
    target = next(
        (
            line
            for line in text.splitlines()
            if '<script src="./static/app.js' in line
            and '</script>' in line
        ),
        None,
    )

    if target is None:
        raise SystemExit("ERROR: app.js script tag not found")

    text = text.replace(
        target,
        script + target,
        1
    )

p.write_text(text, encoding="utf-8")
PYHTML

echo "✓ polygon-clipping included"

find "$DEST" -maxdepth 5 -type f | sort
