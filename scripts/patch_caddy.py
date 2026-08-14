#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path

MARKER_START = "# BEGIN HISTOANNOTATOR"
MARKER_END = "# END HISTOANNOTATOR"
BLOCK = f"""        {MARKER_START}
        handle_path /annotator/* {{
            reverse_proxy histoannotator:8000
        }}
        {MARKER_END}
"""


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: patch_caddy.py /ruta/al/Caddyfile", file=sys.stderr)
        return 2

    path = Path(sys.argv[1]).expanduser().resolve()
    if not path.is_file():
        print(f"No existe: {path}", file=sys.stderr)
        return 2

    text = path.read_text(encoding="utf-8")
    if MARKER_START in text:
        print("La ruta de HistoAnnotator ya existe; no se cambió el archivo.")
        return 0

    lines = text.splitlines(keepends=True)
    insert_at = None
    for index, line in enumerate(lines):
        if line.strip() == "route {":
            insert_at = index + 1
            break

    if insert_at is None:
        print("No encontré un bloque 'route {' en el Caddyfile.", file=sys.stderr)
        return 1

    backup = path.with_name(f"{path.name}.backup-histoannotator-{datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(path, backup)
    lines.insert(insert_at, BLOCK)
    path.write_text("".join(lines), encoding="utf-8")

    print(f"Caddyfile actualizado. Respaldo: {backup}")
    print("Ruta añadida: /annotator/* -> histoannotator:8000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
