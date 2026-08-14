# HistoAnnotator v0.7.0 — Selection & display tools

Cumulative update over v0.6.1.

## Annotation selection
- Select by tapping inside an annotation.
- Draw a freehand selection lasso: annotations fully contained by the lasso are selected.
- Shift + tap / lasso adds to the current selection on desktop.
- Contextual bottom bar provides Delete for one or many selected annotations.
- When 2+ selected annotations share the same class: Merge, Intersect, and Subtract are available.
- For area selection, the largest selected annotation is made the primary object; Subtract removes all other selected areas from it.
- Annotation list no longer contains per-row delete buttons.

## Circle / ellipse
- New Circle tool.
- Construction modes: Center → radius, or Edge → opposite edge.
- Width and Height scaling turn the base circle into an ellipse when required.

## Display controls
- Top-level eye button toggles all annotations.
- Sun button opens display-only controls.
- Brightness changes only the viewer presentation and never alters the original image or annotations.
- File menu image type: Brightfield H&E (default), Brightfield H-DAB, Fluorescence/RGB, RGB/Other. The image type is shared through the server; brightness/channel visibility remain per-device display preferences.
- H&E: Hematoxylin and Eosin views.
- H-DAB: Hematoxylin and DAB views.
- Fluorescence/RGB: R/G/B visibility toggles. True >3-channel IF support remains future work.
- Wand reads the currently displayed channel representation.

## Backend
- Boolean geometry endpoint adds intersection.
- Selection endpoint uses Shapely `covers` to select annotations fully inside a lasso.
- Tile and region endpoints support display transforms.
- Brightfield stain views use standard optical-density color deconvolution with QuPath default H/E/DAB stain vectors.
