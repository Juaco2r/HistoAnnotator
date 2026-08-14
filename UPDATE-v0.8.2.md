# HistoAnnotator v0.8.2 — Reliable local-first Files

## Fixes
- Removes the broken v0.8.1 compatibility patch that introduced a JavaScript syntax error.
- Replaces the malformed v0.8.1 service worker with a valid service worker.
- Files now renders immediately from IndexedDB instead of waiting for the server/VPN.
- Remote catalog refresh uses a 6-second timeout and never blocks the local list.
- Downloaded images open immediately from local metadata and cached tiles.
- Online/VPN reachability is checked after local opening, without blocking the viewer.
- Offline downloads persist partial progress and reuse already cached tiles after interruption/restart.
- Offline files view now shows completed and partial downloads and can open completed copies directly.
- File status distinguishes Downloaded, Partial download, Online only, and Sync pending.
- Online-only files remain visible from the cached catalog and are disabled when the server/VPN is known to be unavailable.
- Shift drawing and Shift multi-select use the existing native implementation from v0.8.0; no duplicate compatibility layer is needed.

## Deployment
Rebuild the Docker image so the static files and OpenSeadragon vendor asset are regenerated:

```bash
docker compose build --no-cache histoannotator
docker compose up -d histoannotator
```

Then open `/annotator/?v=082`. The v0.8.2 service worker removes older shell caches during activation.
