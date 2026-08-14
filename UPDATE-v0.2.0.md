# HistoAnnotator v0.2.0 diagnostic update

Changes:
- Replaces OpenSeadragon MouseTracker drawing with native Pointer Events.
- Accepts pen, mouse, or one finger in annotation modes.
- Navigation is enabled only while the Mover tool is selected.
- Shows a diagnostic strip with input type, zoom, and tile failures.
- Loads JPG/PNG/WebP directly at original resolution.
- Keeps WSI/TIFF on the Deep Zoom tile path.
- Disables and unregisters the old service worker cache.
- Fixes the image placeholder visibility.
- Raises JPEG tile quality and starts a fresh tile cache namespace.
