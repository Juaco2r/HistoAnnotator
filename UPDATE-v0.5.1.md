# HistoAnnotator v0.5.1 — area editing and current-class annotation list

This update keeps the QuPath-compatible GeoJSON model introduced in v0.5.0 and adds editing behavior closer to QuPath.

## Changes

- Brush strokes are converted to a clean painted area with round joins/caps.
- The stylus centerline/path is not stored in the annotation.
- `New`, `Add`, and `Subtract` are available for Brush, Wand, Freehand, Polygon, and Rectangle.
- `Add` unions the drawn area with the selected annotation.
- `Subtract` removes the drawn area from the selected annotation.
- The selected object's ID, class, name, description, measurements, and lock state are preserved while editing.
- A subtraction may create holes or multiple disconnected areas; these are stored as valid Polygon/MultiPolygon GeoJSON.
- The right panel has a collapsible list showing only annotations in the active class.
- Selecting an item in the list selects it and moves the viewer to it.
- Annotation holes use even-odd rendering and hit-testing.
- Desktop shortcuts: hold Shift while starting a Brush/Wand/Freehand/Rectangle stroke to add; hold Alt to subtract. Tablet users should use the explicit New/Add/Subtract control.

## Important

- Add/Subtract and final Brush cleanup use the local HistoAnnotator backend on Krypton. If the connection drops during one of those operations, the existing annotation is left unchanged.
- New manual annotations continue to be saved locally first and synchronized automatically.
