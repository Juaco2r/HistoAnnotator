#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/app/static"
DEST="$ROOT/android-app/www"
NODE_MODULES="$ROOT/android-app/node_modules"

echo "Preparing HistoAnnotator Android web assets..."

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

find "$DEST" -maxdepth 5 -type f | sort
