from __future__ import annotations

from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "app" / "static"

OSD_VERSION = "6.0.2"
OSD_BASE = (
    "https://cdn.jsdelivr.net/npm/"
    f"openseadragon@{OSD_VERSION}"
)

TARGET = STATIC / "vendor" / "openseadragon"
TARGET.mkdir(parents=True, exist_ok=True)

assets = {
    "openseadragon.min.js": (
        OSD_BASE
        + "/build/openseadragon/"
        "openseadragon.min.js"
    ),
    "LICENSE.txt": OSD_BASE + "/LICENSE.txt",
}

for filename, url in assets.items():
    destination = TARGET / filename
    print(f"Downloading {filename} for Desktop build...")
    urlretrieve(url, destination)

    if (
        not destination.is_file()
        or destination.stat().st_size < 100
    ):
        raise SystemExit(
            f"ERROR: invalid downloaded Desktop asset: {destination}"
        )

print(f"OK: OpenSeadragon {OSD_VERSION} prepared for Desktop")
print(f"OK: {TARGET / 'openseadragon.min.js'}")
