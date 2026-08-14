# HistoAnnotator v0.5.0 — QuPath-style Wand and annotation compatibility

This cumulative update is installed over the existing HistoAnnotator project. It keeps `.env`, images, prepared images, tile cache, annotations, and local IndexedDB drafts.

## Added

- QuPath-style **Wand** based on connected pixel similarity within a zoom-dependent circular search area.
- Wand settings for similarity, search area, and visible-color versus brightness comparison.
- Wand runs on the visible RGB representation and does not use SAM or any AI model.
- The search area has a constant screen radius: zooming in creates finer selections; zooming out permits broader selections.
- Server endpoint that reads only the requested image region, not the whole WSI.

## QuPath annotation compatibility

- New annotations are stored as GeoJSON `Feature` objects with:
  - `properties.objectType = "annotation"`
  - `properties.classification.name`
  - `properties.classification.color = [R, G, B]`
  - `properties.isLocked`
  - UUID in the top-level `id`
- Existing HistoAnnotator and older QuPath color forms are normalized during import.
- Export creates a plain QuPath-compatible `FeatureCollection` without HistoAnnotator-only metadata.
- Annotation names, descriptions, measurements, and locked state are preserved when present.
- Class colors are used for outlines/fills; the selected annotation uses a yellow outline, following QuPath's default selection behavior.
- File menu includes show/hide and fill/unfill annotation controls.
- Brush, Freehand, Polygon, Rectangle, and Wand all save as standard area annotations rather than tool-specific geometry formats.

## Important differences from QuPath

The Wand is intentionally similar, but not a byte-for-byte reimplementation of QuPath internals. It uses the visible RGB or brightness values returned by HistoAnnotator. It currently creates a new annotation per Wand tap; additive/subtractive editing of an existing annotation is not part of this release.
