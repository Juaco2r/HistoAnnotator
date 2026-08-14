# HistoAnnotator v0.8.0 — Offline-first + QuPath-safe GeoJSON

## Offline-first
- Installs a real service worker and caches the HistoAnnotator application shell.
- Automatically caches image tiles while browsing.
- `File > Download for offline` preloads the current image/display into persistent browser cache.
- Review quality caches pyramid levels up to 1/4 linear resolution; Full caches every level.
- `File > Offline files` lists/removes offline image packages without deleting annotations.
- `File > Sync now` synchronizes pending annotation files and classes.
- Image catalog, image metadata, annotation-file lists, current viewport and annotations are stored in IndexedDB.
- If the VPN/server is unavailable, the image picker falls back to images explicitly downloaded for offline use.
- Annotation files can be created and used while offline.
- When connectivity returns, pending drafts synchronize automatically.

## QuPath GeoJSON repair
- Every annotation save is validated through Shapely.
- Self-intersecting polygons, touching holes and geometry collections are repaired with `make_valid` and reduced to Polygon/MultiPolygon geometry.
- Empty/non-area fragments and non-finite coordinates are removed.
- Polygon rings are normalized before storage/export.
- QuPath export now calls a server-side validation endpoint before download and reports repaired/dropped objects.
- Existing stored annotation downloads are sanitized as well.
- `scripts/repair_qupath_geojson.py` can repair an already exported GeoJSON file.

## Important
- Offline image data is stored by the browser and may consume substantial tablet storage.
- The app requests persistent browser storage, but Android/Chrome ultimately controls quota.
- Offline packages currently cover the display variant active when downloaded (e.g. original H&E, Hematoxylin-only, DAB-only). Cache another variant while online if needed.
- The native Android/Capacitor wrapper remains a later step; v0.8.0 already allows the installed PWA to open and annotate downloaded images without VPN/network access.
