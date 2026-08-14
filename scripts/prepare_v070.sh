#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$HOME/histoannotator}"
cd "$ROOT"
if [[ -f .env ]]; then
  cp -a .env ".env.backup-v070-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p /srv/histoannotator/annotations /srv/histoannotator/cache /srv/histoannotator/prepared /srv/histoannotator/uploads
printf '%s\n' 'HistoAnnotator v0.7.0 prepared. Existing .env, images and annotations were preserved.'
