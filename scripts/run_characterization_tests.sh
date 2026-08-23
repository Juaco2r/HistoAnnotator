#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Checking modular frontend bundle..."
python3 "$ROOT/scripts/build_frontend_bundle.py" --check

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required to run characterization tests." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is required to run characterization tests." >&2
  exit 1
fi

IMAGE_ID="$(docker compose images -q histoannotator 2>/dev/null | head -n 1 || true)"

if [[ -z "$IMAGE_ID" ]]; then
  echo "No HistoAnnotator image found. Building the existing production image first..."
  docker compose build histoannotator
  IMAGE_ID="$(docker compose images -q histoannotator | head -n 1)"
fi

if [[ -z "$IMAGE_ID" ]]; then
  echo "ERROR: unable to resolve the HistoAnnotator Docker image." >&2
  exit 1
fi

echo "Using Docker image: $IMAGE_ID"
echo "Testing source tree mounted read-only from: $ROOT/app"

docker run --rm \
  -e IMAGE_ROOT=/tmp/histoannotator-tests/images \
  -e ANNOTATION_ROOT=/tmp/histoannotator-tests/annotations \
  -e TILE_CACHE_ROOT=/tmp/histoannotator-tests/cache \
  -e PREPARED_ROOT=/tmp/histoannotator-tests/prepared \
  -e UPLOAD_ROOT=/tmp/histoannotator-tests/uploads \
  -v "$ROOT/app:/app:ro" \
  -v "$ROOT/tests:/tests:ro" \
  "$IMAGE_ID" \
  sh -lc '
    mkdir -p \
      /tmp/histoannotator-tests/images \
      /tmp/histoannotator-tests/annotations \
      /tmp/histoannotator-tests/cache \
      /tmp/histoannotator-tests/prepared \
      /tmp/histoannotator-tests/uploads
    cd /app
    PYTHONPATH=/app python -m unittest discover -s /tests -p "test_*.py" -v
  '
echo
echo "Running frontend characterization tests with Node.js..."

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 22+ is required for frontend characterization tests." >&2
  exit 1
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node.js 22+ is required; found $NODE_VERSION." >&2
  exit 1
fi

shopt -s nullglob
FRONTEND_TESTS=("$ROOT"/tests/test_frontend_*.mjs)
shopt -u nullglob

if (( ${#FRONTEND_TESTS[@]} == 0 )); then
  echo "ERROR: no frontend characterization tests were found." >&2
  exit 1
fi

HISTOANNOTATOR_ROOT="$ROOT" node --test "${FRONTEND_TESTS[@]}"
