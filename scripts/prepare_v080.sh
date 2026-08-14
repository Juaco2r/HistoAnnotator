#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$HOME/histoannotator}"
cd "$ROOT"
if [[ -f .env ]]; then
  cp -a .env ".env.before-v080-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p /srv/histoannotator/annotations /srv/histoannotator/cache /srv/histoannotator/prepared /srv/histoannotator/uploads
printf '%s\n' 'HistoAnnotator v0.8.0 prepared. Existing .env, images, annotations and caches were preserved.'
printf '%s\n' 'After the first online load, use File > Download for offline before disconnecting the VPN.'
