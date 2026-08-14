#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Contenedor ==="
sudo docker compose ps

echo
echo "=== Salud local ==="
curl -fsS http://127.0.0.1:8020/health | python3 -m json.tool

echo
echo "=== Red Docker ==="
sudo docker network inspect cytomine_host_network \
  --format '{{range .Containers}}{{println .Name .IPv4Address}}{{end}}' \
  | grep -E 'histoannotator|caddy' || true
