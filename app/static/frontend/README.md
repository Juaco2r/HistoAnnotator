# HistoAnnotator frontend source layout

`app/static/app.js` remains the runtime bundle loaded by Web, Desktop, and Android.
It is now a **generated artifact** assembled from the ordered source parts in this
directory.

This deliberately preserves HistoAnnotator's existing single-IIFE runtime and
shared lexical state. The architectural audit found extensive cross-domain
dependencies, so forcing ES-module boundaries in one step would change scoping,
initialization ordering, Android build behavior, and potentially scientific
workflows. The initial refactor therefore modularizes the maintained source
without rewriting runtime semantics.

## Edit workflow

1. Edit the appropriate `*.part.js` source file here.
2. Run:

   `python3 scripts/build_frontend_bundle.py`

3. Verify:

   `python3 scripts/build_frontend_bundle.py --check`

4. Run the characterization suite.

Do **not** edit `app/static/app.js` directly. The characterization runner and the
Android asset build both check that the generated bundle is synchronized.

## Source domains

- `00_runtime_state.part.js` — original lines 1–5,932: runtime config, global state, Android connection/local files, IndexedDB/sync, classes.
- `10_viewer_display_storage.part.js` — original lines 5,933–13,264: scientific display, viewer, offline/local image access, annotation file/image loading.
- `20_annotations_geometry_history.part.js` — original lines 13,265–14,819: large-annotation renderer, undo/redo, drawing, geometry, hit-testing.
- `30_review_statistics.part.js` — original lines 14,820–15,874: Review workflow, fill-unannotated, statistics/export helpers.
- `40_hdab_protocols.part.js` — original lines 15,875–19,776: H-DAB preview/live analysis UI and reproducible analysis protocols.
- `50_batch_files_platform.part.js` — original lines 19,777–26,417: batch orchestration, file/import-export/platform helpers and related workflows.
- `60_interactive_learning.part.js` — original lines 26,418–34,514: Interactive Learning models A/B/C, training sources, suggestions, evaluation.
- `70_event_bindings.part.js` — original lines 34,515–35,134: central DOM/event binding.
- `80_anthracosis_frontend.part.js` — original lines 35,135–35,825: Anthracosis preview/acceptance frontend.
- `90_bootstrap.part.js` — original lines 35,826–35,988: initialization/bootstrap.

## Runtime contract

Concatenating these files in manifest order must reproduce exactly the runtime
bundle. At the point this source modularization was introduced, the reconstructed
bundle is byte-identical to the pre-refactor `app.js`.

This is an intentional intermediate architecture: future feature work can move
individual domains from source parts to true runtime modules when their shared
state dependencies have been explicitly narrowed, without requiring another
monolithic rewrite.
