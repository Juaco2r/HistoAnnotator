#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$HOME/histoannotator}"
cd "$ROOT"
if [[ -f .env ]]; then cp -a .env ".env.backup-v060-$(date +%Y%m%d-%H%M%S)"; fi
mkdir -p /srv/histoannotator/annotations /srv/histoannotator/cache /srv/histoannotator/prepared /srv/histoannotator/uploads
cat <<'EOF'
HistoAnnotator v0.6.0 prepared.
Existing IMAGE_ROOT and annotation data were preserved.
EOF
