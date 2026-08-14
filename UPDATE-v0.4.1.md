# HistoAnnotator v0.4.1 — UI and input update

Install this update over v0.4.0. It does not change `.env`, stored images, GeoJSON files, local drafts, or Docker volumes.

## Changes

- The finger/stylus guide is displayed only before an image is selected.
- The bottom-right OpenSeadragon navigator has been removed to increase usable annotation space.
- The lower status label is now compact: version plus synchronization state only.
- The class panel is compact by default and shows each class with its annotation count.
- **Manage** expands the class panel and reveals add, edit, delete, image-size, and synchronization controls.
- In **Move** mode, the stylus can pan the image just like a finger or mouse.
- New brush annotations keep their GeoJSON polygon geometry but are rendered as smooth, rounded strokes instead of irregular polygon outlines.
- The complete visible interface and backend error messages are now in English.

## Brush compatibility

Brush annotations created in v0.4.1 store the centerline and image-space radius in their `histoannotator` metadata. This produces smoother rendering at every zoom level. Older brush annotations without this metadata continue to render using their existing polygon geometry.

## SAM status

This update does not yet include the SAM Magic Wand. GPU and Docker support can be added in the separate v0.5 SAM service without changing the annotations created by v0.4.1.
