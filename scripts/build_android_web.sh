#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# app.js is generated from the modular frontend source parts.
python3 "$ROOT/scripts/build_frontend_bundle.py" --check
SOURCE="$ROOT/app/static"
DEST="$ROOT/android-app/www"
NODE_MODULES="$ROOT/android-app/node_modules"

echo "Preparing HistoAnnotator Android web assets..."

NATIVE_SERVER="${HISTOANNOTATOR_NATIVE_SERVER:-}"
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

server = os.environ.get("NATIVE_SERVER", "").rstrip("/")

if server:
    text = text.replace(
        placeholder,
        json.dumps(server),
        1,
    )
    print(f"✓ Optional build-time default server configured: {server}")
else:
    print("✓ No server baked into APK; select it at runtime")

p.write_text(text, encoding="utf-8")
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


# ---------------------------------------------------------
# Android local TIFF engine (GeoTIFF.js)
# ---------------------------------------------------------
GEOTIFF_DIST="$NODE_MODULES/geotiff/dist-browser"

if [[ ! -d "$GEOTIFF_DIST" ]]; then
  echo "ERROR: geotiff browser bundle is not installed."
  echo "Run: cd android-app && npm install --save-exact geotiff@3.0.5"
  exit 1
fi

mkdir -p "$DEST/static/vendor/geotiff"
cp -a "$GEOTIFF_DIST"/. "$DEST/static/vendor/geotiff/"

GEOTIFF_ENTRY_REL="$(
  cd "$NODE_MODULES/geotiff"
  node - <<'NODE'
const pkg = require("./package.json");
const value = pkg.jsdelivr || pkg.unpkg || "dist-browser/geotiff.js";
console.log(String(value).replace(/^\.?\//, ""));
NODE
)"

GEOTIFF_ENTRY_BASENAME="$(basename "$GEOTIFF_ENTRY_REL")"

if [[ ! -f "$DEST/static/vendor/geotiff/$GEOTIFF_ENTRY_BASENAME" ]]; then
  FALLBACK="$(
    find "$DEST/static/vendor/geotiff" \
      -maxdepth 1 \
      -type f \
      \( -name 'geotiff.js' -o -name 'main.js' \) \
      -print \
      -quit
  )"

  if [[ -z "$FALLBACK" ]]; then
    echo "ERROR: GeoTIFF.js browser entry was not found."
    exit 1
  fi

  GEOTIFF_ENTRY_BASENAME="$(basename "$FALLBACK")"
fi

python3 - "$DEST/index.html" "$GEOTIFF_ENTRY_BASENAME" <<'PYGEOTIFF'
from pathlib import Path
import sys

p = Path(sys.argv[1])
entry = sys.argv[2]
text = p.read_text(encoding="utf-8")
script = f'  <script src="./static/vendor/geotiff/{entry}"></script>\n'

if "/vendor/geotiff/" not in text:
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
    text = text.replace(target, script + target, 1)

p.write_text(text, encoding="utf-8")
PYGEOTIFF

echo "✓ geotiff.js included"

find "$DEST" -maxdepth 5 -type f | sort
