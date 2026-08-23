# Reference / Ground Truth Evaluation v1

HistoAnnotator assigns evaluation metadata to the **annotation file**, so a
file drawn directly in HistoAnnotator can be declared a Ground Truth just as
an imported file can.

Two independent concepts are stored:

- **Role**: Regular annotation, Ground truth, Model prediction, Consensus, or
  Other reference.
- **Source**: Manual/unspecified, Pathologist, Model, External dataset/tool, or
  Mixed/consensus.

For a pathologist-created gold standard:

```text
Role:   Ground truth
Source: Pathologist
```

Role/source metadata are stored in a sidecar JSON file. They do not rewrite the
annotation GeoJSON.

## Per-class evaluation

Open **Evaluate / Ground truth…** under the Annotation file selector.

1. Choose Candidate and Reference.
2. Load classes.
3. Map source classes to evaluation/HistoAnnotator classes.
4. Map several source classes to the same target to merge them.
5. Choose **Ignore** for classes that must not participate.
6. Calculate the metrics.

The engine unions all polygonal features of each mapped class before
comparison, avoiding double counting overlapping polygons.

Reported metrics:

- Dice
- IoU / Jaccard
- Precision
- Recall
- Macro Dice / IoU
- Micro Dice / IoU

Mappings can be stored as reusable local presets, useful for an external model
or dataset whose labels differ systematically from HistoAnnotator.

Evaluation v1 uses full-image bounds in level-0 pixel coordinates. Partial
ground-truth coverage ROIs and TP/FP/FN viewer overlays are intentionally left
for the next iteration.
