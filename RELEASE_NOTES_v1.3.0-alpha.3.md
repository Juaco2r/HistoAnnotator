# HistoAnnotator v1.3.0-alpha.3

Pre-release checkpoint for the new annotation workflow, Tissue ROI analysis region, Artifact handling, and valid-tissue statistics.

## Highlights

- Focus Mode with configurable keyboard shortcuts and compact class access.
- Review workflow with Draft / Reviewed / Approved lifecycle, review decisions, provenance, and batch workflow actions.
- Tissue ROI as a protected structural analysis region.
- Manual Tissue ROI drawing and server-side tissue detection.
- Non-destructive external Tissue ROI border exclusion with persistent base/effective ROI visualization.
- Built-in Artifact class:
  - always available;
  - normal drawing/editing/reclassification;
  - included in Review Mode and provenance;
  - reserved class name/configuration;
  - used as an exclusion mask for valid-tissue statistics.
- Valid Tissue statistics:
  - Tissue ROI or full image as analysis base;
  - optional external border exclusion;
  - Artifact union subtraction;
  - biological class areas reported against the remaining valid tissue.
- Fill unannotated tissue:
  - computes remaining valid tissue after existing annotations;
  - interactive preview;
  - choose the target class before creating a Polygon/MultiPolygon annotation.
- Annotation-file deletion with Default protection and local-first synchronization safeguards.
- UI refinements for compact annotation-file controls and non-blocking remaining-tissue preview.

## Research-software status

This is a pre-release research/testing build. It is not clinically validated medical software.
