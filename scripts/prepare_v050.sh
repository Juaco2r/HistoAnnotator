#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/histoannotator}"
ENV_FILE="$PROJECT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "File not found: $ENV_FILE" >&2
  exit 1
fi

cp -a "$ENV_FILE" "$ENV_FILE.backup-v050-$(date +%Y%m%d-%H%M%S)"

ensure_setting() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

ensure_setting UPLOAD_ROOT /srv/histoannotator/uploads
ensure_setting TILE_SIZE 512
ensure_setting TILE_JPEG_QUALITY 90
ensure_setting UPLOAD_CHUNK_MB 8
ensure_setting MAX_UPLOAD_GB 50

sudo mkdir -p \
  /srv/histoannotator/uploads \
  /srv/histoannotator/cache \
  /srv/histoannotator/prepared \
  /srv/histoannotator/annotations

sudo chown -R "$USER:$(id -gn)" /srv/histoannotator

echo "HistoAnnotator v0.5.0 configuration prepared:"
grep -E '^(IMAGE_ROOT|ANNOTATION_ROOT|TILE_CACHE_ROOT|PREPARED_ROOT|UPLOAD_ROOT|TILE_SIZE|TILE_JPEG_QUALITY|UPLOAD_CHUNK_MB|MAX_UPLOAD_GB)=' "$ENV_FILE"
