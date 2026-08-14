#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="${1:-$HOME/histoannotator}"
cd "$PROJECT_DIR"
if [ -f .env ]; then
  cp -a .env ".env.before-v061-$(date +%Y%m%d-%H%M%S)"
fi
printf '%s\n' 'HistoAnnotator v0.6.1 prepared. Existing .env and data paths were preserved.'
