#!/usr/bin/env bash
set -euo pipefail

ROOT="${HISTOANNOTATOR_ROOT:-$HOME/histoannotator}"
cd "$ROOT"

echo "================ DESKTOP DEV1B VALIDATION ================"

python3 -m py_compile \
  desktop/__init__.py \
  desktop/config.py \
  desktop/network.py \
  desktop/server_runner.py \
  desktop/server_control.py \
  desktop/desktop_app.py \
  desktop/entrypoint.py

grep -q 'name: Desktop Windows Dev Build' \
  .github/workflows/desktop-windows-dev.yml

grep -q 'actions/checkout@v7' \
  .github/workflows/desktop-windows-dev.yml

grep -q 'actions/setup-python@v7' \
  .github/workflows/desktop-windows-dev.yml

grep -q 'actions/upload-artifact@v4' \
  .github/workflows/desktop-windows-dev.yml

grep -q 'openslide-bin' \
  requirements-desktop.txt

grep -q 'HistoAnnotatorDesktop' \
  HistoAnnotatorDesktop.spec

git diff --check

echo "✓ Desktop Python syntax OK"
echo "✓ GitHub Actions workflow present"
echo "✓ OpenSlide binary dependency present"
echo "✓ PyInstaller spec present"
echo "✓ Git diff clean"
