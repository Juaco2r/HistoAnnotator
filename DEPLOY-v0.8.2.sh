#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Copy the files in this update over the HistoAnnotator project root, then run:"
echo "  docker compose build --no-cache histoannotator"
echo "  docker compose up -d histoannotator"
echo "  docker compose logs --tail=80 histoannotator"
