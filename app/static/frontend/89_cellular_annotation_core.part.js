// ========================================================================
// Cellular Annotation Core v1
//
// Separate cellular annotation documents from tissue annotation documents.
// QuPath cell GeoJSON is auto-detected during normal GeoJSON import.
//
// Independent cellular axes:
//   Cell type:
//     Unassigned | Tumor | Immune | Macrophage | Fibroblast | Endothelial
//   Marker status:
//     Unclassified | Positive | Negative
//
// IMPORTANT:
//   Positive/Negative are marker status, never cell type.
//   Missing cell class => Unassigned.
//   Missing marker status => Unclassified.
// ========================================================================

const PHASE_CELL_SCHEMA_VERSION =
  1;

const PHASE_CELL_TYPES = [
  {
    value: "unassigned",
    label: "Unassigned",
    color: "#9ca3af",
  },
  {
    value: "tumor",
    label: "Tumor",
    color: "#ef4444",
  },
  {
    value: "immune",
    label: "Immune",
    color: "#a855f7",
  },
  {
    value: "macrophage",
    label: "Macrophage",
    color: "#f59e0b",
  },
  {
    value: "fibroblast",
    label: "Fibroblast",
    color: "#22c55e",
  },
  {
    value: "endothelial",
    label: "Endothelial",
    color: "#06b6d4",
  },
];

const PHASE_CELL_MARKER_STATUSES = [
  {
    value: "unclassified",
    label: "Unclassified",
    color: "#9ca3af",
  },
  {
    value: "positive",
    label: "Positive",
    color: "#ef4444",
  },
  {
    value: "negative",
    label: "Negative",
    color: "#3b82f6",
  },
];

let phaseCellDisplayState = {
  showCells:
    true,

  colorBy:
    "markerStatus",

  markerFilter:
    "all",

  cellTypeFilter:
    "all",
};


function phaseCellCanonicalCellType(
  value
) {
  const text =
    String(
      value
      || ""
    )
      .trim()
      .toLowerCase()
      .replaceAll(
        "_",
        " "
      )
      .replaceAll(
        "-",
        " "
      )
      .replace(
        /\s+/g,
        " "
      );

  const aliases = {
    "tumor":
      "tumor",

    "tumour":
      "tumor",

    "tumor cell":
      "tumor",

    "tumour cell":
      "tumor",

    "immune":
      "immune",

    "immune cell":
      "immune",

    "immunitary":
      "immune",

    "immunitary cell":
      "immune",

    "macrophage":
      "macrophage",

    "macrophague":
      "macrophage",

    "fibroblast":
      "fibroblast",

    "endothelial":
      "endothelial",

    "endothelial cell":
      "endothelial",

    "unassigned":
      "unassigned",

    "unclassified":
      "unassigned",

    "unknown":
      "unassigned",
  };

  return (
    aliases[text]
    || "unassigned"
  );
}


function phaseCellCanonicalMarkerStatus(
  value
) {
  const text =
    String(
      value
      || ""
    )
      .trim()
      .toLowerCase()
      .replaceAll(
        "_",
        " "
      )
      .replaceAll(
        "-",
        " "
      )
      .replace(
        /\s+/g,
        " "
      );

  if (
    text === "positive"
    || text.startsWith(
      "positive "
    )
  ) {
    return "positive";
  }

  if (
    text === "negative"
    || text.startsWith(
      "negative "
    )
  ) {
    return "negative";
  }

  if (
    text === "unclassified"
    || text === "unassigned"
    || text === "unknown"
    || !text
  ) {
    return "unclassified";
  }

  return "unclassified";
}


function phaseCellTypeDefinition(
  value
) {
  const canonical =
    phaseCellCanonicalCellType(
      value
    );

  return (
    PHASE_CELL_TYPES.find(
      (item) =>
        item.value
          === canonical
    )
    || PHASE_CELL_TYPES[0]
  );
}


function phaseCellMarkerDefinition(
  value
) {
  const canonical =
    phaseCellCanonicalMarkerStatus(
      value
    );

  return (
    PHASE_CELL_MARKER_STATUSES.find(
      (item) =>
        item.value
          === canonical
    )
    || PHASE_CELL_MARKER_STATUSES[0]
  );
}


function phaseCellFeatureObjectType(
  feature
) {
  return String(
    feature
      ?.properties
      ?.objectType
    || feature
      ?.properties
      ?.object_type
    || ""
  )
    .trim()
    .toLowerCase();
}


function phaseCellFeatureMetadata(
  feature
) {
  const histo =
    feature
      ?.properties
      ?.histoannotator;

  return (
    histo
    && typeof histo
      === "object"
    && histo.cell
    && typeof histo.cell
      === "object"
  )
    ? histo.cell
    : {};
}


function phaseCellIsCellularFeature(
  feature
) {
  const histo =
    feature
      ?.properties
      ?.histoannotator;

  if (
    String(
      histo?.level
      || ""
    )
      .trim()
      .toLowerCase()
      === "cellular"
  ) {
    return true;
  }

  const objectType =
    phaseCellFeatureObjectType(
      feature
    );

  return [
    "cell",
    "nucleus",
    "cell nucleus",
  ].includes(
    objectType
  );
}


function phaseCellDocumentIsCellular() {
  return (
    featureCollection
      ?.features
      || []
  ).some(
    phaseCellIsCellularFeature
  );
}


function phaseCellSourceClassification(
  feature
) {
  return String(
    feature
      ?.properties
      ?.classification
      ?.name
    || ""
  ).trim();
}


function phaseCellMarkerStatus(
  feature
) {
  const cell =
    phaseCellFeatureMetadata(
      feature
    );

  const explicit =
    cell.markerStatus
    ?? feature
      ?.properties
      ?.markerStatus
    ?? feature
      ?.properties
      ?.marker_status;

  if (
    explicit !== undefined
    && explicit !== null
    && String(explicit).trim()
  ) {
    return phaseCellCanonicalMarkerStatus(
      explicit
    );
  }

  const classification =
    phaseCellSourceClassification(
      feature
    );

  return phaseCellCanonicalMarkerStatus(
    classification
  );
}


function phaseCellType(
  feature
) {
  const cell =
    phaseCellFeatureMetadata(
      feature
    );

  const explicit =
    cell.cellType
    ?? feature
      ?.properties
      ?.cellType
    ?? feature
      ?.properties
      ?.cell_type;

  if (
    explicit !== undefined
    && explicit !== null
    && String(explicit).trim()
  ) {
    return phaseCellCanonicalCellType(
      explicit
    );
  }

  const classification =
    phaseCellSourceClassification(
      feature
    );

  const normalized =
    phaseCellCanonicalCellType(
      classification
    );

  const raw =
    String(
      classification
      || ""
    )
      .trim()
      .toLowerCase();

  const classificationIsKnownCellType =
    [
      "tumor",
      "tumour",
      "tumor cell",
      "tumour cell",
      "immune",
      "immune cell",
      "immunitary",
      "immunitary cell",
      "macrophage",
      "macrophague",
      "fibroblast",
      "endothelial",
      "endothelial cell",
    ].includes(
      raw
    );

  return (
    classificationIsKnownCellType
      ? normalized
      : "unassigned"
  );
}


function phaseCellPart(
  feature
) {
  const cell =
    phaseCellFeatureMetadata(
      feature
    );

  const explicit =
    String(
      cell.part
      || ""
    )
      .trim()
      .toLowerCase();

  if (
    [
      "cell",
      "nucleus",
      "body",
    ].includes(
      explicit
    )
  ) {
    return (
      explicit === "body"
        ? "cell"
        : explicit
    );
  }

  const objectType =
    phaseCellFeatureObjectType(
      feature
    );

  return (
    objectType.includes(
      "nucleus"
    )
      ? "nucleus"
      : "cell"
  );
}


function phaseCellImportedFeature(
  sourceFeature
) {
  const sourceProperties =
    sourceFeature
      ?.properties
    && typeof sourceFeature
      .properties === "object"
      ? sourceFeature.properties
      : {};

  const sourceHisto =
    sourceProperties
      .histoannotator
    && typeof sourceProperties
      .histoannotator
      === "object"
      ? deepClone(
          sourceProperties
            .histoannotator
        )
      : {};

  const sourceClassification =
    sourceProperties
      .classification
    && typeof sourceProperties
      .classification
      === "object"
      ? deepClone(
          sourceProperties
            .classification
        )
      : {};

  const markerStatus =
    phaseCellMarkerStatus(
      sourceFeature
    );

  const cellType =
    phaseCellType(
      sourceFeature
    );

  const part =
    phaseCellPart(
      sourceFeature
    );

  const sourceObjectId =
    String(
      sourceFeature?.id
      || uid()
    );

  const sourceObjectType =
    String(
      sourceProperties
        .objectType
      || sourceProperties
        .object_type
      || "cell"
    );

  const now =
    new Date()
      .toISOString();

  const baseMetadata =
    phaseCCreateMetadata();

  const histo = {
    ...baseMetadata,
    ...sourceHisto,

    schemaVersion:
      PHASE_C_SCHEMA_VERSION,

    role:
      "annotation",

    level:
      "cellular",

    cell: {
      ...(
        sourceHisto.cell
        && typeof sourceHisto.cell
          === "object"
          ? deepClone(
              sourceHisto.cell
            )
          : {}
      ),

      schemaVersion:
        PHASE_CELL_SCHEMA_VERSION,

      cellId:
        String(
          sourceHisto
            ?.cell
            ?.cellId
          || sourceObjectId
        ),

      part,

      markerStatus,

      cellType,

      source:
        String(
          sourceHisto
            ?.cell
            ?.source
          || "qupath"
        ),

      sourceObjectId,

      sourceObjectType,

      sourceClassification:
        String(
          sourceClassification
            ?.name
          || ""
        )
        || null,
    },

    provenance: {
      ...(
        baseMetadata
          .provenance
        || {}
      ),
      ...(
        sourceHisto
          .provenance
        || {}
      ),

      importedAt:
        now,

      importSource:
        "qupath-cell-geojson",
    },
  };

  const markerDefinition =
    phaseCellMarkerDefinition(
      markerStatus
    );

  const classification = {
    ...sourceClassification,

    name:
      markerDefinition.label,
  };

  if (
    !Array.isArray(
      classification.color
    )
    && classification.colorRGB
      === undefined
  ) {
    classification.color =
      hexToRgbArray(
        markerDefinition.color
      );
  }

  const properties = {
    objectType:
      "cell",

    isLocked:
      false,

    classification,

    histoannotator:
      histo,
  };

  for (
    const key
    of [
      "name",
      "description",
      "measurements",
    ]
  ) {
    if (
      key
      in sourceProperties
    ) {
      properties[key] =
        deepClone(
          sourceProperties[
            key
          ]
        );
    }
  }

  return {
    type:
      "Feature",

    id:
      sourceObjectId,

    geometry:
      deepClone(
        sourceFeature.geometry
      ),

    properties,
  };
}


// QuPath nucleusGeometry expansion v2
//
// QuPath PathCellObject exports may contain:
//   geometry         -> cell-body contour
//   nucleusGeometry  -> nucleus contour
//
// HistoAnnotator expands them into two editable GeoJSON features sharing
// the same biological cellId.
function phaseCellValidGeometryPayload(
  geometry
) {
  return Boolean(
    geometry
    && typeof geometry
      === "object"
    && (
      geometry.type
        === "Polygon"
      || geometry.type
        === "MultiPolygon"
    )
    && Array.isArray(
      geometry.coordinates
    )
    && geometry.coordinates.length
  );
}


function phaseCellImportedFeatures(
  sourceFeature
) {
  const body =
    phaseCellImportedFeature(
      sourceFeature
    );

  const bodyCell =
    body
      ?.properties
      ?.histoannotator
      ?.cell;

  if (
    bodyCell
    && typeof bodyCell
      === "object"
  ) {
    bodyCell.part =
      "cell";
  }

  body.properties.objectType =
    "cell";

  const nucleusGeometry =
    sourceFeature
      ?.nucleusGeometry;

  if (
    !phaseCellValidGeometryPayload(
      nucleusGeometry
    )
  ) {
    return [
      body,
    ];
  }

  const cellId =
    String(
      bodyCell?.cellId
      || body.id
    );

  const nucleusId =
    `${String(body.id)}::nucleus`;

  const nucleusHisto =
    deepClone(
      body.properties
        .histoannotator
    );

  nucleusHisto.level =
    "cellular";

  nucleusHisto.role =
    "annotation";

  nucleusHisto.cell = {
    ...(
      nucleusHisto.cell
      || {}
    ),

    schemaVersion:
      PHASE_CELL_SCHEMA_VERSION,

    cellId,

    part:
      "nucleus",

    parentBodyId:
      String(
        body.id
      ),

    source:
      "qupath",

    sourceObjectId:
      String(
        body.id
      ),

    sourceObjectType:
      "nucleusGeometry",
  };

  const nucleusProperties = {
    objectType:
      "nucleus",

    isLocked:
      false,

    classification:
      deepClone(
        body.properties
          .classification
      ),

    histoannotator:
      nucleusHisto,
  };

  const nucleus = {
    type:
      "Feature",

    id:
      nucleusId,

    geometry:
      deepClone(
        nucleusGeometry
      ),

    properties:
      nucleusProperties,
  };

  return [
    body,
    nucleus,
  ];
}


function phaseCellPayloadCellFeatures(
  payload
) {
  if (
    payload?.type
      !== "FeatureCollection"
    || !Array.isArray(
      payload.features
    )
  ) {
    return [];
  }

  return payload.features.filter(
    (feature) =>
      feature?.type
        === "Feature"
      && feature.geometry
      && phaseCellIsCellularFeature(
        feature
      )
  );
}


function phaseCellPayloadLooksCellular(
  payload
) {
  return (
    phaseCellPayloadCellFeatures(
      payload
    ).length > 0
  );
}


function phaseCellSuggestedFileName(
  file
) {
  const raw =
    String(
      file?.name
      || "Cellular Annotation"
    )
      .replace(
        /\.geojson$/i,
        ""
      )
      .replace(
        /\.json$/i,
        ""
      )
      .trim();

  const clean =
    raw
      .replace(
        /[^A-Za-z0-9 _.-]+/g,
        "_"
      )
      .slice(
        0,
        70
      )
      .trim()
    || "Cellular Annotation";

  const base =
    clean.toLowerCase()
      .includes(
        "cell"
      )
      ? clean
      : `${clean} Cells`;

  if (
    !annotationFiles.includes(
      base
    )
  ) {
    return base;
  }

  for (
    let index = 2;
    index < 1000;
    index += 1
  ) {
    const suffix =
      ` ${index}`;

    const candidate =
      (
        base.slice(
          0,
          Math.max(
            1,
            80
              - suffix.length
          )
        )
        + suffix
      );

    if (
      !annotationFiles.includes(
        candidate
      )
    ) {
      return candidate;
    }
  }

  return (
    `Cells ${Date.now()}`
      .slice(
        0,
        80
      )
  );
}


function phaseCellImportSummary(
  cellFeatures
) {
  const summary = {
    total:
      cellFeatures.length,

    positive:
      0,

    negative:
      0,

    unclassified:
      0,

    unassigned:
      0,

    nucleusGeometries:
      0,
  };

  for (
    const feature
    of cellFeatures
  ) {
    if (
      phaseCellValidGeometryPayload(
        feature?.nucleusGeometry
      )
    ) {
      summary.nucleusGeometries +=
        1;
    }
    const marker =
      phaseCellMarkerStatus(
        feature
      );

    const type =
      phaseCellType(
        feature
      );

    if (
      marker
      === "positive"
    ) {
      summary.positive += 1;

    } else if (
      marker
      === "negative"
    ) {
      summary.negative += 1;

    } else {
      summary.unclassified += 1;
    }

    if (
      type
      === "unassigned"
    ) {
      summary.unassigned += 1;
    }
  }

  return summary;
}


async function phaseCellImportPayload(
  file,
  payload
) {
  if (!currentImage) {
    throw new Error(
      "Open an image before importing cellular annotations"
    );
  }

  const sourceCells =
    phaseCellPayloadCellFeatures(
      payload
    );

  if (!sourceCells.length) {
    throw new Error(
      "No cellular objects were detected"
    );
  }

  const summary =
    phaseCellImportSummary(
      sourceCells
    );

  const skipped =
    Math.max(
      0,
      Number(
        payload.features
          ?.length
        || 0
      )
      - sourceCells.length
    );

  const proceed =
    window.confirm(
      (
        "QuPath cellular annotation detected.\n\n"
        + `Cells: ${summary.total.toLocaleString()}\n`
        + `Positive: ${summary.positive.toLocaleString()}\n`
        + `Negative: ${summary.negative.toLocaleString()}\n`
        + `Marker Unclassified: ${summary.unclassified.toLocaleString()}\n`
        + `Cell type Unassigned: ${summary.unassigned.toLocaleString()}\n`
        + `Nucleus geometries: ${summary.nucleusGeometries.toLocaleString()}\n`
        + (
          skipped
            ? `Non-cell objects skipped: ${skipped.toLocaleString()}\n`
            : ""
        )
        + "\nImport as a separate Cellular Annotation file?"
      )
    );

  if (!proceed) {
    return;
  }

  const suggested =
    phaseCellSuggestedFileName(
      file
    );

  const rawName =
    window.prompt(
      "Cellular annotation file name",
      suggested
    );

  if (
    rawName === null
  ) {
    return;
  }

  const name =
    String(
      rawName
    ).trim();

  if (
    !name
    || !/^[A-Za-z0-9 _.-]{1,80}$/.test(
      name
    )
    || name === "."
    || name === ".."
  ) {
    throw new Error(
      "Invalid annotation file name"
    );
  }

  if (
    annotationFiles.includes(
      name
    )
  ) {
    throw new Error(
      (
        `Annotation file "${name}" already exists. `
        + "Choose another name."
      )
    );
  }

  if (dirty) {
    await saveAnnotations(
      false
    );
  }

  const normalizedCells =
    sourceCells.flatMap(
      phaseCellImportedFeatures
    );

  annotationFiles.push(
    name
  );

  currentAnnotationFile =
    name;

  await putMeta(
    `files:${currentImage.id}`,
    annotationFiles
  );

  renderAnnotationFileOptions();

  featureCollection =
    normalizeFeatureCollectionClient({
      type:
        "FeatureCollection",

      features:
        normalizedCells,
    });

  featureCollection.features
    .forEach(
      featureId
    );

  clearSelectedFeatures(
    false
  );

  undoStack =
    [];

  redoStack =
    [];

  pathologistDraft =
    null;

  activeDraft =
    null;

  pointerState =
    null;

  currentLocalRevision =
    0;

  currentLastSyncedRevision =
    0;

  currentPendingChangeCount =
    0;

  dirty =
    false;

  localDraftState =
    "New cellular annotation";

  await persistLocalDraft(
    false,
    currentImage,
    featureCollection
  );

  markChanged();

  await saveAnnotations(
    false
  );

  renderAnnotationFileOptions();
  phaseCellRenderPanel();
  updateControls();
  updateDiagnostics();
  drawAnnotations();

  setStatus(
    (
      `Imported ${sourceCells.length.toLocaleString()} cells`
      + ` · ${summary.nucleusGeometries.toLocaleString()} nuclei`
      + ` · ${name}`
      + " · saved locally first"
    ),
    "saved"
  );
}


function phaseCellFeatureMatchesFilters(
  feature
) {
  if (
    !phaseCellIsCellularFeature(
      feature
    )
  ) {
    return false;
  }

  if (
    !phaseCellDisplayState
      .showCells
  ) {
    return false;
  }

  const marker =
    phaseCellMarkerStatus(
      feature
    );

  const cellType =
    phaseCellType(
      feature
    );

  if (
    phaseCellDisplayState
      .markerFilter
      !== "all"
    && marker
      !== phaseCellDisplayState
        .markerFilter
  ) {
    return false;
  }

  if (
    phaseCellDisplayState
      .cellTypeFilter
      !== "all"
    && cellType
      !== phaseCellDisplayState
        .cellTypeFilter
  ) {
    return false;
  }

  return true;
}


function phaseCellColor(
  feature
) {
  if (
    phaseCellDisplayState
      .colorBy
      === "cellType"
  ) {
    return phaseCellTypeDefinition(
      phaseCellType(
        feature
      )
    ).color;
  }

  return phaseCellMarkerDefinition(
    phaseCellMarkerStatus(
      feature
    )
  ).color;
}


function phaseCellSelectedFeatures() {
  return (
    featureCollection
      ?.features
      || []
  ).filter(
    (feature) =>
      phaseCellIsCellularFeature(
        feature
      )
      && selectedIds.has(
        String(
          featureId(
            feature
          )
        )
      )
  );
}


function phaseCellCounts() {
  const counts = {
    total:
      0,

    marker: {
      positive:
        0,
      negative:
        0,
      unclassified:
        0,
    },

    cellType:
      Object.fromEntries(
        PHASE_CELL_TYPES.map(
          (item) => [
            item.value,
            0,
          ]
        )
      ),

    part: {
      cell:
        0,
      nucleus:
        0,
    },
  };

  for (
    const feature
    of (
      featureCollection
        ?.features
      || []
    )
  ) {
    if (
      !phaseCellIsCellularFeature(
        feature
      )
    ) {
      continue;
    }

    counts.total += 1;

    const marker =
      phaseCellMarkerStatus(
        feature
      );

    const cellType =
      phaseCellType(
        feature
      );

    const part =
      phaseCellPart(
        feature
      );

    counts.marker[
      marker
    ] = (
      counts.marker[
        marker
      ]
      || 0
    ) + 1;

    counts.cellType[
      cellType
    ] = (
      counts.cellType[
        cellType
      ]
      || 0
    ) + 1;

    counts.part[
      part
    ] = (
      counts.part[
        part
      ]
      || 0
    ) + 1;
  }

  return counts;
}


function phaseCellPercent(
  count,
  total
) {
  if (!total) {
    return "0.0%";
  }

  return (
    (
      100
      * Number(count)
      / Number(total)
    ).toFixed(
      1
    )
    + "%"
  );
}


function phaseCellEnsurePanel() {
  if (
    document.getElementById(
      "phaseCellPanel"
    )
  ) {
    return;
  }

  const classPanel =
    document.getElementById(
      "classPanel"
    );

  const classSection =
    classPanel
      ?.querySelector(
        ".class-section"
      );

  if (
    !classPanel
    || !classSection
  ) {
    return;
  }

  const section =
    document.createElement(
      "section"
    );

  section.id =
    "phaseCellPanel";

  section.className =
    "phase-cell-panel";

  section.hidden =
    true;

  section.innerHTML = `
    <div class="phase-cell-heading">
      <div>
        <h2>Cellular Annotation</h2>
        <span id="phaseCellDocumentSummary">
          0 cells
        </span>
      </div>

      <label class="phase-cell-visible-toggle">
        <input id="phaseCellVisible"
               type="checkbox"
               checked>
        <span>Show cells</span>
      </label>
    </div>

    <div class="phase-cell-controls-grid">
      <label>
        <span>Color by</span>
        <select id="phaseCellColorBy">
          <option value="markerStatus">
            Marker status
          </option>
          <option value="cellType">
            Cell type
          </option>
        </select>
      </label>

      <label>
        <span>Marker filter</span>
        <select id="phaseCellMarkerFilter">
          <option value="all">All</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
          <option value="unclassified">Unclassified</option>
        </select>
      </label>

      <label>
        <span>Cell type filter</span>
        <select id="phaseCellTypeFilter">
          <option value="all">All</option>
          <option value="unassigned">Unassigned</option>
          <option value="tumor">Tumor</option>
          <option value="immune">Immune</option>
          <option value="macrophage">Macrophage</option>
          <option value="fibroblast">Fibroblast</option>
          <option value="endothelial">Endothelial</option>
        </select>
      </label>
    </div>

    <div class="phase-cell-edit-card">
      <div class="phase-cell-edit-head">
        <strong>Edit selected cells</strong>
        <span id="phaseCellSelectedCount">
          0 selected
        </span>
      </div>

      <div class="phase-cell-edit-row">
        <select id="phaseCellEditType"
                aria-label="Cell type">
          <option value="unassigned">Unassigned</option>
          <option value="tumor">Tumor</option>
          <option value="immune">Immune</option>
          <option value="macrophage">Macrophage</option>
          <option value="fibroblast">Fibroblast</option>
          <option value="endothelial">Endothelial</option>
        </select>

        <button id="phaseCellApplyType"
                type="button">
          Apply cell type
        </button>
      </div>

      <div class="phase-cell-edit-row">
        <select id="phaseCellEditMarker"
                aria-label="Marker status">
          <option value="unclassified">Unclassified</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>

        <button id="phaseCellApplyMarker"
                type="button">
          Apply marker
        </button>
      </div>
    </div>

    <div class="phase-cell-stats">
      <div class="phase-cell-stats-title">
        Cellular summary
      </div>

      <div id="phaseCellMarkerStats"
           class="phase-cell-stat-list">
      </div>

      <details class="phase-cell-type-details">
        <summary>Counts by cell type</summary>
        <div id="phaseCellTypeStats"
             class="phase-cell-stat-list">
        </div>
      </details>
    </div>

    <p class="phase-cell-note">
      
      
      
    </p>
  `;

  classSection.insertAdjacentElement(
    "beforebegin",
    section
  );

  document.getElementById(
    "phaseCellVisible"
  )?.addEventListener(
    "change",
    (event) => {
      phaseCellDisplayState
        .showCells =
        Boolean(
          event.target.checked
        );

      drawAnnotations();
    }
  );

  document.getElementById(
    "phaseCellColorBy"
  )?.addEventListener(
    "change",
    (event) => {
      phaseCellDisplayState
        .colorBy =
        String(
          event.target.value
          || "markerStatus"
        );

      drawAnnotations();
    }
  );

  document.getElementById(
    "phaseCellMarkerFilter"
  )?.addEventListener(
    "change",
    (event) => {
      phaseCellDisplayState
        .markerFilter =
        String(
          event.target.value
          || "all"
        );

      drawAnnotations();
      phaseCellRenderPanel();
    }
  );

  document.getElementById(
    "phaseCellTypeFilter"
  )?.addEventListener(
    "change",
    (event) => {
      phaseCellDisplayState
        .cellTypeFilter =
        String(
          event.target.value
          || "all"
        );

      drawAnnotations();
      phaseCellRenderPanel();
    }
  );

  document.getElementById(
    "phaseCellApplyType"
  )?.addEventListener(
    "click",
    phaseCellApplySelectedType
  );

  document.getElementById(
    "phaseCellApplyMarker"
  )?.addEventListener(
    "click",
    phaseCellApplySelectedMarker
  );
}


function phaseCellRenderPanel() {
  phaseCellEnsurePanel();

  const panel =
    document.getElementById(
      "phaseCellPanel"
    );

  const classSection =
    document
      .getElementById(
        "classPanel"
      )
      ?.querySelector(
        ".class-section"
      );

  if (!panel) {
    return;
  }

  const cellular =
    phaseCellDocumentIsCellular();

  panel.hidden =
    !cellular;

  if (classSection) {
    classSection.hidden =
      cellular;
  }

  if (!cellular) {
    return;
  }

  const counts =
    phaseCellCounts();

  const selected =
    phaseCellSelectedFeatures();

  const selectedCount =
    document.getElementById(
      "phaseCellSelectedCount"
    );

  if (selectedCount) {
    selectedCount.textContent =
      (
        `${selected.length.toLocaleString()} selected`
      );
  }

  const summary =
    document.getElementById(
      "phaseCellDocumentSummary"
    );

  if (summary) {
    summary.textContent =
      (
        `${counts.total.toLocaleString()} cellular object`
        + `${counts.total === 1 ? "" : "s"}`
      );
  }

  const markerStats =
    document.getElementById(
      "phaseCellMarkerStats"
    );

  if (markerStats) {
    markerStats.innerHTML =
      PHASE_CELL_MARKER_STATUSES.map(
        (item) => {
          const value =
            Number(
              counts.marker[
                item.value
              ]
              || 0
            );

          return `
            <div>
              <span>
                <i style="background:${item.color}"></i>
                ${item.label}
              </span>
              <strong>
                ${value.toLocaleString()}
                <small>${phaseCellPercent(value, counts.total)}</small>
              </strong>
            </div>
          `;
        }
      ).join("");
  }

  const typeStats =
    document.getElementById(
      "phaseCellTypeStats"
    );

  if (typeStats) {
    typeStats.innerHTML =
      PHASE_CELL_TYPES.map(
        (item) => {
          const value =
            Number(
              counts.cellType[
                item.value
              ]
              || 0
            );

          return `
            <div>
              <span>
                <i style="background:${item.color}"></i>
                ${item.label}
              </span>
              <strong>
                ${value.toLocaleString()}
                <small>${phaseCellPercent(value, counts.total)}</small>
              </strong>
            </div>
          `;
        }
      ).join("");
  }

  const visible =
    document.getElementById(
      "phaseCellVisible"
    );

  if (visible) {
    visible.checked =
      Boolean(
        phaseCellDisplayState
          .showCells
      );
  }

  const colorBy =
    document.getElementById(
      "phaseCellColorBy"
    );

  if (colorBy) {
    colorBy.value =
      phaseCellDisplayState
        .colorBy;
  }

  const markerFilter =
    document.getElementById(
      "phaseCellMarkerFilter"
    );

  if (markerFilter) {
    markerFilter.value =
      phaseCellDisplayState
        .markerFilter;
  }

  const typeFilter =
    document.getElementById(
      "phaseCellTypeFilter"
    );

  if (typeFilter) {
    typeFilter.value =
      phaseCellDisplayState
        .cellTypeFilter;
  }

  if (
    selected.length
      === 1
  ) {
    const editType =
      document.getElementById(
        "phaseCellEditType"
      );

    const editMarker =
      document.getElementById(
        "phaseCellEditMarker"
      );

    if (editType) {
      editType.value =
        phaseCellType(
          selected[0]
        );
    }

    if (editMarker) {
      editMarker.value =
        phaseCellMarkerStatus(
          selected[0]
        );
    }
  }
}


function phaseCellEnsureMetadata(
  feature
) {
  feature.properties ||=
    {};

  const properties =
    feature.properties;

  properties.histoannotator =
    phaseCNormalizeMetadata(
      properties
    );

  const histo =
    properties.histoannotator;

  histo.role =
    "annotation";

  histo.level =
    "cellular";

  histo.cell =
    (
      histo.cell
      && typeof histo.cell
        === "object"
    )
      ? histo.cell
      : {};

  histo.cell.schemaVersion =
    PHASE_CELL_SCHEMA_VERSION;

  histo.cell.cellId =
    String(
      histo.cell.cellId
      || featureId(
          feature
        )
    );

  histo.cell.part =
    phaseCellPart(
      feature
    );

  histo.cell.markerStatus =
    phaseCellMarkerStatus(
      feature
    );

  histo.cell.cellType =
    phaseCellType(
      feature
    );

  histo.cell.source =
    String(
      histo.cell.source
      || "histoannotator"
    );

  return histo.cell;
}


function phaseCellApplySelectedType() {
  const selected =
    phaseCellSelectedFeatures();

  if (!selected.length) {
    setStatus(
      "Select one or more cells first",
      "error"
    );
    return;
  }

  const select =
    document.getElementById(
      "phaseCellEditType"
    );

  const cellType =
    phaseCellCanonicalCellType(
      select?.value
    );

  pushUndo();

  for (
    const feature
    of selected
  ) {
    const cell =
      phaseCellEnsureMetadata(
        feature
      );

    cell.cellType =
      cellType;
  }

  markChanged();
  phaseCellRenderPanel();

  setStatus(
    (
      `Cell type → ${
        phaseCellTypeDefinition(
          cellType
        ).label
      } · ${selected.length.toLocaleString()} cell`
      + `${selected.length === 1 ? "" : "s"}`
    ),
    "saved"
  );
}


function phaseCellApplySelectedMarker() {
  const selected =
    phaseCellSelectedFeatures();

  if (!selected.length) {
    setStatus(
      "Select one or more cells first",
      "error"
    );
    return;
  }

  const select =
    document.getElementById(
      "phaseCellEditMarker"
    );

  const markerStatus =
    phaseCellCanonicalMarkerStatus(
      select?.value
    );

  const marker =
    phaseCellMarkerDefinition(
      markerStatus
    );

  pushUndo();

  for (
    const feature
    of selected
  ) {
    const cell =
      phaseCellEnsureMetadata(
        feature
      );

    cell.markerStatus =
      markerStatus;

    feature.properties ||=
      {};

    feature.properties.classification = {
      ...(
        feature.properties
          .classification
        || {}
      ),

      name:
        marker.label,

      color:
        hexToRgbArray(
          marker.color
        ),
    };
  }

  markChanged();
  phaseCellRenderPanel();

  setStatus(
    (
      `Marker status → ${marker.label}`
      + ` · ${selected.length.toLocaleString()} cell`
      + `${selected.length === 1 ? "" : "s"}`
    ),
    "saved"
  );
}


// ------------------------------------------------------------------------
// Normal GeoJSON import: automatically branch to cellular import.
// ------------------------------------------------------------------------

const phaseCellBaseImportGeoJson =
  importGeoJson;

importGeoJson =
  async function phaseCellImportGeoJson(
    file
  ) {
    if (
      !file
      || !currentImage
    ) {
      return;
    }

    let payload;

    try {
      payload =
        JSON.parse(
          await file.text()
        );

    } catch (_) {
      return phaseCellBaseImportGeoJson(
        file
      );
    }

    if (
      !phaseCellPayloadLooksCellular(
        payload
      )
    ) {
      return phaseCellBaseImportGeoJson(
        file
      );
    }

    try {
      await phaseCellImportPayload(
        file,
        payload
      );

    } catch (error) {
      setStatus(
        (
          `Cellular GeoJSON import failed: ${
            error.message
          }`
        ),
        "error"
      );

    } finally {
      if (els.importInput) {
        els.importInput.value =
          "";
      }
    }
  };


// ------------------------------------------------------------------------
// Cellular display overrides.
// ------------------------------------------------------------------------

const phaseCellBaseColorForFeature =
  colorForFeature;

colorForFeature =
  function phaseCellColorForFeature(
    feature
  ) {
    if (
      phaseCellDocumentIsCellular()
      && phaseCellIsCellularFeature(
        feature
      )
    ) {
      return phaseCellColor(
        feature
      );
    }

    return phaseCellBaseColorForFeature(
      feature
    );
  };


const phaseCellBaseDrawGeometry =
  drawGeometry;

drawGeometry =
  function phaseCellDrawGeometry(
    feature
  ) {
    if (
      phaseCellDocumentIsCellular()
    ) {
      const isTissueRoi =
        typeof phaseDIsTissueRoi
          === "function"
        && phaseDIsTissueRoi(
          feature
        );

      if (
        !isTissueRoi
        && (
          !phaseCellIsCellularFeature(
            feature
          )
          || !phaseCellFeatureMatchesFilters(
            feature
          )
        )
      ) {
        return;
      }
    }

    return phaseCellBaseDrawGeometry(
      feature
    );
  };


const phaseCellBaseHitTest =
  hitTest;

hitTest =
  function phaseCellHitTest(
    point
  ) {
    const id =
      phaseCellBaseHitTest(
        point
      );

    if (
      !id
      || !phaseCellDocumentIsCellular()
    ) {
      return id;
    }

    const feature =
      findFeature(
        id
      );

    if (!feature) {
      return null;
    }

    if (
      typeof phaseDIsTissueRoi
        === "function"
      && phaseDIsTissueRoi(
        feature
      )
    ) {
      return id;
    }

    if (
      !phaseCellIsCellularFeature(
        feature
      )
      || !phaseCellFeatureMatchesFilters(
        feature
      )
    ) {
      return null;
    }

    return id;
  };


// ------------------------------------------------------------------------
// Keep the cellular panel synchronized with file changes, selection and Undo.
// ------------------------------------------------------------------------

const phaseCellBaseUpdateControls =
  updateControls;

updateControls =
  function phaseCellUpdateControls(
    ...args
  ) {
    const result =
      phaseCellBaseUpdateControls(
        ...args
      );

    phaseCellRenderPanel();

    return result;
  };


const phaseCellBaseLoadSelectedAnnotationFile =
  loadSelectedAnnotationFile;

loadSelectedAnnotationFile =
  async function phaseCellLoadSelectedAnnotationFile(
    name
  ) {
    const result =
      await phaseCellBaseLoadSelectedAnnotationFile(
        name
      );

    phaseCellDisplayState = {
      showCells:
        true,

      colorBy:
        "markerStatus",

      markerFilter:
        "all",

      cellTypeFilter:
        "all",
    };

    phaseCellRenderPanel();
    drawAnnotations();

    return result;
  };


phaseCellEnsurePanel();
phaseCellRenderPanel();
