#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/histoannotator}"
ENV_FILE="$PROJECT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "File not found: $ENV_FILE" >&2
  exit 1
fi

cp -a "$ENV_FILE" "$ENV_FILE.backup-v051-$(date +%Y%m%d-%H%M%S)"

sudo mkdir -p \
  /srv/histoannotator/uploads \
  /srv/histoannotator/cache \
  /srv/histoannotator/prepared \
  /srv/histoannotator/annotations

sudo chown -R "$USER:$(id -gn)" /srv/histoannotator

cat <<'MSG'
HistoAnnotator v0.5.1 is prepared.
No new environment variables are required.
The Docker image will install Shapely for reliable Brush, Add, and Subtract geometry operations.
MSG

grep -E '^(IMAGE_ROOT|ANNOTATION_ROOT|TILE_CACHE_ROOT|PREPARED_ROOT|UPLOAD_ROOT)=' "$ENV_FILE" || true
