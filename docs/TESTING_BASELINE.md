# HistoAnnotator characterization-test baseline

Baseline under test:

- Commit: `844199345e166a94fd17b97dd14afd2333d261de`
- Branch at audit time: `v1.4.0-interactive-learning`
- Safety tag: `pre-modular-refactor-2026-08-23`
- Audited archive SHA-256: `41516c9713702786df10ea2c30e89b2864bae73f5dc1b11ee9e9c6eac45da966`

## Purpose

These tests freeze observable behavior before the modular refactor. They are not intended to improve algorithms or fix behavior.

For a commit whose purpose is structural refactoring:

- production outputs must remain unchanged;
- a failing characterization test is treated as a regression;
- expected values are not updated merely to make a refactor pass;
- scientific or functional changes require a separate explicit commit.

## Initial scope (Phase 1A)

This first slice freezes:

- image-ID encoding/decoding;
- annotation-file naming rules;
- canonical `Artifact` class behavior;
- empty FeatureCollection contract;
- Statistics use of Tissue ROI / full-image fallback;
- Artifact subtraction from the valid region;
- Anthracosis subtraction from all non-Anthracosis classes;
- same-class union area rather than summed overlapping area;
- Positive-by-Class numerator/denominator semantics;
- External Border as a percentage of Tissue ROI area.

No production source file is modified by Phase 1A.

## Running the suite

From the repository root:

```bash
./scripts/run_characterization_tests.sh
```

The script uses the existing HistoAnnotator Docker image for dependencies, but mounts the current repository `app/` directory read-only at `/app`. This prevents a stale Docker image from hiding source-code changes.

If the application image does not yet exist locally, the runner builds the existing production Docker image first.

## Next characterization slices

Planned independent commits:

1. Tissue ROI / Artifact / Anthracosis algorithm fixtures.
2. H-DAB deterministic pixel/geometry fixtures.
3. GeoJSON import/export and QuPath compatibility.
4. Local persistence / IndexedDB / synchronization ordering.
5. Undo/Redo and Review/Focus/shortcuts.
6. Protocols and Batch Analysis.
7. Interactive Learning contracts.
8. Web/Android/Desktop/Docker platform smoke tests.
