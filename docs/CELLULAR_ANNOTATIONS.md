# Cellular Annotations

Cellular annotations are stored as a separate annotation document from
tissue-region annotations.

## Independent classifications

Every cellular object has two independent biological labels:

### Cell type

- `unassigned` (default)
- `tumor`
- `immune`
- `macrophage`
- `fibroblast`
- `endothelial`

If an imported object does not contain an explicit cellular class, HistoAnnotator
stores `cellType: "unassigned"`.

### Marker status

- `unclassified` (default)
- `positive`
- `negative`

QuPath `classification.name = "Positive"` or `"Negative"` is interpreted as
marker status and is not converted into a cell type.

If marker status is absent, HistoAnnotator stores
`markerStatus: "unclassified"`.

## Feature metadata

```json
{
  "properties": {
    "objectType": "cell",
    "classification": {
      "name": "Positive"
    },
    "measurements": {
      "Cell: Area": 100.0,
      "Nucleus: Area": 40.0
    },
    "histoannotator": {
      "role": "annotation",
      "level": "cellular",
      "cell": {
        "schemaVersion": 1,
        "cellId": "source-object-id",
        "part": "cell",
        "markerStatus": "positive",
        "cellType": "unassigned",
        "source": "qupath"
      }
    }
  }
}
```

`part` supports `cell` and `nucleus`. Multiple geometries may later share one
`cellId`, allowing one biological cell to contain both cell-body and nuclear
geometry without double-counting it.

## QuPath import

The normal GeoJSON import detects QuPath objects with `objectType: "cell"` and
offers to create a separate Cellular Annotation file. Non-cell helper/parent
objects in the same GeoJSON are not imported into the cellular document.

Original QuPath measurements are preserved.
