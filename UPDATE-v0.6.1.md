# HistoAnnotator v0.6.1

Fixes the Pathologist-mode Freehand pause controls.

- Complete / Inner contour / Cancel are hidden while the stylus is actively drawing.
- The controls appear immediately after pen-up, when the freehand segment has been appended to the draft.
- They remain enabled and tappable during the pause.
- Pausing a Pathologist freehand segment no longer enters the backend geometry-busy state.
- Pointer cancellation refreshes the contextual controls correctly.

This update is intended for v0.6.0 and does not alter images, annotation files, classes, or `.env`.
