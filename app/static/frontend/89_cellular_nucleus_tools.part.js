// ========================================================================
// Cellular Nucleus Editing + compact sidebar UI v1
//
// Extends Cellular Annotation Core v1 with:
//   - explicit Cell body / Nucleus geometry parts
//   - Part filter (All / Cell bodies / Nuclei)
//   - manual creation of missing nuclei/cell bodies
//   - Add/Subtract/Delete editing for selected cellular geometry
//   - nucleus -> selected parent cell linkage through shared cellId
//   - biological counts deduplicated by cellId
//   - clear nucleus geometry status
//   - nucleus-first hit testing when filters are active
//
// QuPath note:
// Nucleus measurements do NOT imply that a nucleus contour exists. A nucleus
// is visible/editable only when a nucleus geometry is actually present.
// ========================================================================

// Cellular left-toolbar nucleus mode v2
//
// In a Cellular Annotation document, the existing left-side Annotation
// drawing tools create nucleus geometry. The duplicate right-side geometry
// toolbar is intentionally not used.
let phaseCellCreationPart =
  "nucleus";


function phaseCellPartLabel(
  part
) {
  return (
    String(part)
      === "nucleus"
      ? "Nucleus"
      : "Cell body"
  );
}


function phaseCellCellId(
  feature
) {
  const metadata =
    phaseCellFeatureMetadata(
      feature
    );

  return String(
    metadata.cellId
    || featureId(
      feature
    )
  );
}


function phaseCellBodyForCellId(
  cellId
) {
  const key =
    String(
      cellId
      || ""
    );

  if (!key) {
    return null;
  }

  return (
    featureCollection
      ?.features
      || []
  ).find(
    (feature) =>
      phaseCellIsCellularFeature(
        feature
      )
      && phaseCellPart(
        feature
      )
        === "cell"
      && phaseCellCellId(
        feature
      )
        === key
  ) || null;
}


function phaseCellNucleiForCellId(
  cellId
) {
  const key =
    String(
      cellId
      || ""
    );

  if (!key) {
    return [];
  }

  return (
    featureCollection
      ?.features
      || []
  ).filter(
    (feature) =>
      phaseCellIsCellularFeature(
        feature
      )
      && phaseCellPart(
        feature
      )
        === "nucleus"
      && phaseCellCellId(
        feature
      )
        === key
  );
}


function phaseCellSelectedPrimary() {
  if (
    !selectedId
  ) {
    return null;
  }

  const feature =
    findFeature(
      selectedId
    );

  return (
    feature
    && phaseCellIsCellularFeature(
      feature
    )
      ? feature
      : null
  );
}


function phaseCellSelectedBodyForLink() {
  const selected =
    phaseCellSelectedPrimary();

  if (
    selected
    && phaseCellPart(
      selected
    )
      === "cell"
  ) {
    return selected;
  }

  if (
    selected
    && phaseCellPart(
      selected
    )
      === "nucleus"
  ) {
    return phaseCellBodyForCellId(
      phaseCellCellId(
        selected
      )
    );
  }

  return null;
}


function phaseCellUniqueBiologicalCounts() {
  const byCellId =
    new Map();

  let geometryTotal =
    0;

  let bodyCount =
    0;

  let nucleusCount =
    0;

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

    geometryTotal += 1;

    const part =
      phaseCellPart(
        feature
      );

    if (
      part === "nucleus"
    ) {
      nucleusCount += 1;
    } else {
      bodyCount += 1;
    }

    const cellId =
      phaseCellCellId(
        feature
      );

    const current =
      byCellId.get(
        cellId
      );

    // Prefer cell-body metadata when both body and nucleus exist.
    if (
      !current
      || (
        part === "cell"
        && current.part
          !== "cell"
      )
    ) {
      byCellId.set(
        cellId,
        {
          feature,
          part,
        }
      );
    }
  }

  const marker = {
    positive:
      0,

    negative:
      0,

    unclassified:
      0,
  };

  const cellType =
    Object.fromEntries(
      PHASE_CELL_TYPES.map(
        (item) => [
          item.value,
          0,
        ]
      )
    );

  for (
    const item
    of byCellId.values()
  ) {
    const markerStatus =
      phaseCellMarkerStatus(
        item.feature
      );

    const type =
      phaseCellType(
        item.feature
      );

    marker[
      markerStatus
    ] = (
      marker[
        markerStatus
      ]
      || 0
    ) + 1;

    cellType[
      type
    ] = (
      cellType[
        type
      ]
      || 0
    ) + 1;
  }

  return {
    total:
      byCellId.size,

    geometryTotal,

    marker,

    cellType,

    part: {
      cell:
        bodyCount,

      nucleus:
        nucleusCount,
    },
  };
}


// ------------------------------------------------------------------------
// Counts become biological-cell counts (deduplicated by shared cellId).
// Geometry/body/nucleus counts remain available separately.
// ------------------------------------------------------------------------

const phaseCellNucleusBaseCounts =
  phaseCellCounts;

phaseCellCounts =
  function phaseCellNucleusCounts() {
    if (
      !phaseCellDocumentIsCellular()
    ) {
      return phaseCellNucleusBaseCounts();
    }

    return phaseCellUniqueBiologicalCounts();
  };


// ------------------------------------------------------------------------
// Part filter.
// ------------------------------------------------------------------------

const phaseCellNucleusBaseMatchesFilters =
  phaseCellFeatureMatchesFilters;

phaseCellFeatureMatchesFilters =
  function phaseCellNucleusMatchesFilters(
    feature
  ) {
    if (
      !phaseCellNucleusBaseMatchesFilters(
        feature
      )
    ) {
      return false;
    }

    const partFilter =
      String(
        phaseCellDisplayState
          .partFilter
        || "all"
      );

    if (
      partFilter === "all"
    ) {
      return true;
    }

    return (
      phaseCellPart(
        feature
      )
      === partFilter
    );
  };


// ------------------------------------------------------------------------
// Nucleus drawing style: same biological color, distinct dashed boundary.
// ------------------------------------------------------------------------

const phaseCellNucleusBaseDrawGeometry =
  drawGeometry;

drawGeometry =
  function phaseCellNucleusDrawGeometry(
    feature
  ) {
    if (
      !phaseCellDocumentIsCellular()
      || !phaseCellIsCellularFeature(
        feature
      )
      || phaseCellPart(
        feature
      )
        !== "nucleus"
    ) {
      return phaseCellNucleusBaseDrawGeometry(
        feature
      );
    }

    ctx.save();

    ctx.setLineDash([
      4,
      2,
    ]);

    const previousFilled =
      annotationsFilled;

    // Keep nuclei visually distinct from cell bodies and avoid hiding
    // the underlying nuclear morphology.
    annotationsFilled =
      false;

    try {
      return phaseCellNucleusBaseDrawGeometry(
        feature
      );

    } finally {
      annotationsFilled =
        previousFilled;

      ctx.restore();
    }
  };


// ------------------------------------------------------------------------
// Cellular hit test that respects the active part/marker/type filters.
//
// The original core wrapper validates only the first base hit. If a hidden
// cell body sits above a visible nucleus, that can make the nucleus
// impossible to select. Here we search visible cellular features directly.
// ------------------------------------------------------------------------

const phaseCellNucleusBaseHitTest =
  hitTest;

hitTest =
  function phaseCellNucleusHitTest(
    point
  ) {
    if (
      !phaseCellDocumentIsCellular()
    ) {
      return phaseCellNucleusBaseHitTest(
        point
      );
    }

    const features =
      featureCollection
        ?.features
      || [];

    for (
      let index =
        features.length - 1;
      index >= 0;
      index -= 1
    ) {
      const feature =
        features[
          index
        ];

      if (
        !phaseCellFeatureMatchesFilters(
          feature
        )
      ) {
        continue;
      }

      const geometry =
        feature.geometry;

      if (
        !geometry
      ) {
        continue;
      }

      if (
        geometry.type
          === "Polygon"
        && pointInPolygon(
          point,
          geometry.coordinates
        )
      ) {
        return featureId(
          feature
        );
      }

      if (
        geometry.type
          === "MultiPolygon"
      ) {
        for (
          const polygon
          of geometry.coordinates
            || []
        ) {
          if (
            pointInPolygon(
              point,
              polygon
            )
          ) {
            return featureId(
              feature
            );
          }
        }
      }
    }

    return null;
  };


// ------------------------------------------------------------------------
// Convert every newly drawn geometry in a cellular document into an
// explicit cell-body or nucleus feature.
// ------------------------------------------------------------------------

function phaseCellNucleusSelectedDefaults() {
  const typeSelect =
    document.getElementById(
      "phaseCellEditType"
    );

  const markerSelect =
    document.getElementById(
      "phaseCellEditMarker"
    );

  return {
    cellType:
      phaseCellCanonicalCellType(
        typeSelect?.value
        || "unassigned"
      ),

    markerStatus:
      phaseCellCanonicalMarkerStatus(
        markerSelect?.value
        || "unclassified"
      ),
  };
}


function phaseCellNucleusUpdateCreatedUndo(
  feature
) {
  const entry =
    undoStack[
      undoStack.length - 1
    ];

  if (
    !entry
    || !phaseF261IsCreatedUndoEntry(
      entry
    )
  ) {
    return;
  }

  if (
    String(
      featureId(
        entry.feature
      )
    )
      !== String(
        featureId(
          feature
        )
      )
  ) {
    return;
  }

  entry.feature =
    phaseF261FastClone(
      feature
    );
}


function phaseCellNucleusConvertCreated(
  feature,
  part,
  parentBody = null
) {
  if (
    !feature
  ) {
    return;
  }

  const normalizedPart =
    part === "nucleus"
      ? "nucleus"
      : "cell";

  feature.properties ||=
    {};

  feature.properties.objectType =
    normalizedPart === "nucleus"
      ? "nucleus"
      : "cell";

  const defaults =
    phaseCellNucleusSelectedDefaults();

  const cell =
    phaseCellEnsureMetadata(
      feature
    );

  cell.part =
    normalizedPart;

  cell.source =
    "manual";

  cell.sourceObjectType =
    feature.properties
      .objectType;

  cell.sourceObjectId =
    String(
      featureId(
        feature
      )
    );

  if (
    normalizedPart
      === "nucleus"
    && parentBody
  ) {
    cell.cellId =
      phaseCellCellId(
        parentBody
      );

    cell.parentBodyId =
      String(
        featureId(
          parentBody
        )
      );

    cell.cellType =
      phaseCellType(
        parentBody
      );

    cell.markerStatus =
      phaseCellMarkerStatus(
        parentBody
      );

  } else {
    cell.cellId =
      String(
        featureId(
          feature
        )
      );

    cell.parentBodyId =
      null;

    cell.cellType =
      defaults.cellType;

    cell.markerStatus =
      defaults.markerStatus;
  }

  const marker =
    phaseCellMarkerDefinition(
      cell.markerStatus
    );

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

  feature.properties.isLocked =
    false;

  phaseCellNucleusUpdateCreatedUndo(
    feature
  );
}


function phaseCellNucleusBodyContainsPoint(
  feature,
  point
) {
  if (
    !feature
    || !Array.isArray(
      point
    )
  ) {
    return false;
  }

  const geometry =
    feature.geometry;

  if (
    geometry?.type
      === "Polygon"
  ) {
    return pointInPolygon(
      point,
      geometry.coordinates
    );
  }

  if (
    geometry?.type
      === "MultiPolygon"
  ) {
    return (
      geometry.coordinates
      || []
    ).some(
      (polygon) =>
        pointInPolygon(
          point,
          polygon
        )
    );
  }

  return false;
}


function phaseCellNucleusFindContainingBody(
  nucleusGeometry
) {
  const bounds =
    phaseF26GeometryBounds(
      nucleusGeometry
    );

  if (!bounds) {
    return null;
  }

  const center = [
    (
      Number(bounds.minX)
      + Number(bounds.maxX)
    ) / 2,

    (
      Number(bounds.minY)
      + Number(bounds.maxY)
    ) / 2,
  ];

  const candidates =
    (
      featureCollection
        ?.features
      || []
    )
      .filter(
        (feature) =>
          phaseCellIsCellularFeature(
            feature
          )
          && phaseCellPart(
            feature
          )
            === "cell"
          && phaseCellNucleusBodyContainsPoint(
            feature,
            center
          )
      )
      .map(
        (feature) => {
          const featureBounds =
            phaseF26GeometryBounds(
              feature.geometry
            );

          const area =
            featureBounds
              ? (
                  Math.max(
                    0,
                    featureBounds.maxX
                      - featureBounds.minX
                  )
                  * Math.max(
                      0,
                      featureBounds.maxY
                        - featureBounds.minY
                    )
                )
              : Number.POSITIVE_INFINITY;

          return {
            feature,
            area,
          };
        }
      )
      .sort(
        (left, right) =>
          left.area
          - right.area
      );

  return (
    candidates[0]
      ?.feature
    || null
  );
}


const phaseCellNucleusBaseCommitGeometry =
  commitGeometry;

commitGeometry =
  async function phaseCellNucleusCommitGeometry(
    geometry,
    metadata = {},
    operation = editOperation
  ) {
    const cellularNew =
      Boolean(
        phaseCellDocumentIsCellular()
        && operation
          === "new"
        && phaseDActiveRole
          === "annotation"
      );

    // In Cellular mode, normal Annotation New drawing means nucleus.
    const requestedPart =
      cellularNew
        ? "nucleus"
        : (
            phaseCellCreationPart
              === "nucleus"
              ? "nucleus"
              : "cell"
          );

    if (
      cellularNew
    ) {
      phaseCellCreationPart =
        "nucleus";
    }

    const parentBody =
      (
        cellularNew
        && requestedPart
          === "nucleus"
      )
        ? (
            phaseCellSelectedBodyForLink()
            || phaseCellNucleusFindContainingBody(
                 geometry
               )
          )
        : null;

    const beforeIds =
      cellularNew
        ? new Set(
            (
              featureCollection
                ?.features
              || []
            ).map(
              (feature) =>
                String(
                  featureId(
                    feature
                  )
                )
            )
          )
        : null;

    const result =
      await phaseCellNucleusBaseCommitGeometry(
        geometry,
        metadata,
        operation
      );

    if (
      !result
      || !cellularNew
    ) {
      return result;
    }

    const created =
      (
        featureCollection
          ?.features
        || []
      ).find(
        (feature) =>
          !beforeIds.has(
            String(
              featureId(
                feature
              )
            )
          )
      )
      || (
        selectedId
          ? findFeature(
              selectedId
            )
          : null
      );

    if (
      !created
    ) {
      return result;
    }

    phaseCellNucleusConvertCreated(
      created,
      requestedPart,
      parentBody
    );

    // The base commit already persisted the geometry. Persist again after
    // attaching the cellular semantic metadata.
    markChanged();

    phaseCellRenderPanel();
    drawAnnotations();

    if (
      requestedPart
        === "nucleus"
    ) {
      setStatus(
        parentBody
          ? (
              "Nucleus created and linked to selected cell body"
            )
          : (
              "Nucleus-only cell created · Cell type Unassigned unless selected above"
            ),
        "saved"
      );

    } else {
      setStatus(
        "Cell body created",
        "saved"
      );
    }

    return result;
  };


// ------------------------------------------------------------------------
// Explicit drawing/editing actions.
// ------------------------------------------------------------------------

function phaseCellNucleusPrepareAnnotationRole() {
  if (
    typeof phaseDSetActiveRole
      === "function"
  ) {
    phaseDSetActiveRole(
      "annotation",
      false
    );
  }
}


function phaseCellNucleusStartDraw(
  part,
  tool = "freehand"
) {
  if (
    !phaseCellDocumentIsCellular()
  ) {
    return;
  }

  phaseCellNucleusPrepareAnnotationRole();

  phaseCellCreationPart =
    part === "nucleus"
      ? "nucleus"
      : "cell";

  setEditOperation(
    "new"
  );

  setMode(
    tool
  );

  const parent =
    (
      phaseCellCreationPart
        === "nucleus"
    )
      ? phaseCellSelectedBodyForLink()
      : null;

  setStatus(
    phaseCellCreationPart
      === "nucleus"
      ? (
          parent
            ? (
                "Draw nucleus · it will be linked to the selected cell body"
              )
            : (
                "Draw nucleus · select a cell body first if you want to link the nucleus to that cell"
              )
        )
      : "Draw a new cell body",
    "local"
  );

  phaseCellRenderPanel();
}


function phaseCellNucleusStartEdit(
  operation
) {
  const selected =
    phaseCellSelectedPrimary();

  if (
    !selected
  ) {
    setStatus(
      "Select a cell body or nucleus first",
      "error"
    );
    return;
  }

  phaseCellNucleusPrepareAnnotationRole();

  setEditOperation(
    operation
  );

  setMode(
    "freehand"
  );

  setStatus(
    (
      `${operation === "add" ? "Add to" : "Subtract from"} `
      + phaseCellPartLabel(
          phaseCellPart(
            selected
          )
        )
      + " · draw the correction"
    ),
    "local"
  );
}


function phaseCellNucleusDeleteSelected() {
  const selected =
    phaseCellSelectedFeatures();

  if (
    !selected.length
  ) {
    setStatus(
      "Select a cell body or nucleus first",
      "error"
    );
    return;
  }

  const nuclei =
    selected.filter(
      (feature) =>
        phaseCellPart(
          feature
        )
          === "nucleus"
    ).length;

  const bodies =
    selected.length
      - nuclei;

  deleteSelectedAnnotations();

  setStatus(
    (
      `Deleted ${selected.length.toLocaleString()} cellular geometr`
      + `${selected.length === 1 ? "y" : "ies"}`
      + (
          nuclei || bodies
            ? ` · ${bodies} bod${bodies === 1 ? "y" : "ies"}, ${nuclei} nucleus`
            : ""
        )
    ),
    "saved"
  );

  phaseCellRenderPanel();
  drawAnnotations();
}


// ------------------------------------------------------------------------
// Sidebar UI.
// ------------------------------------------------------------------------

function phaseCellNucleusEnsureUi() {
  const panel =
    document.getElementById(
      "phaseCellPanel"
    );

  if (
    !panel
  ) {
    return;
  }

  const visibleLabel =
    panel.querySelector(
      ".phase-cell-visible-toggle span"
    );

  if (
    visibleLabel
  ) {
    visibleLabel.textContent =
      "Show annotations";
  }

  if (
    !document.getElementById(
      "phaseCellGeometryStatus"
    )
  ) {
    const heading =
      panel.querySelector(
        ".phase-cell-heading"
      );

    const status =
      document.createElement(
        "div"
      );

    status.id =
      "phaseCellGeometryStatus";

    status.className =
      "phase-cell-geometry-status";

    heading?.insertAdjacentElement(
      "afterend",
      status
    );
  }

  if (
    !document.getElementById(
      "phaseCellPartFilter"
    )
  ) {
    const grid =
      panel.querySelector(
        ".phase-cell-controls-grid"
      );

    const field =
      document.createElement(
        "label"
      );

    field.innerHTML = `
      <span>Geometry</span>
      <select id="phaseCellPartFilter">
        <option value="all">All geometries</option>
        <option value="cell">Cell bodies</option>
        <option value="nucleus">Nuclei</option>
      </select>
    `;

    grid?.append(
      field
    );

    document.getElementById(
      "phaseCellPartFilter"
    )?.addEventListener(
      "change",
      (event) => {
        phaseCellDisplayState
          .partFilter =
          String(
            event.target.value
            || "all"
          );

        clearSelectedFeatures(
          false
        );

        updateControls();
        drawAnnotations();
        phaseCellRenderPanel();
      }
    );
  }

  // Use the existing left-side annotation toolbar instead of duplicating
  // drawing/editing buttons in this sidebar.
  document.getElementById(
    "phaseCellGeometryTools"
  )?.remove();

  if (
    !document.getElementById(
      "phaseCellLeftToolsNote"
    )
  ) {
    const grid =
      panel.querySelector(
        ".phase-cell-controls-grid"
      );

    const note =
      document.createElement(
        "div"
      );

    note.id =
      "phaseCellLeftToolsNote";

    note.className =
      "phase-cell-left-tools-note";

    note.textContent =
      (
        "Cellular mode:  "
        + ""
      );

    grid?.insertAdjacentElement(
      "afterend",
      note
    );
  }

}


function phaseCellNucleusRenderStatus() {
  if (
    !phaseCellDocumentIsCellular()
  ) {
    return;
  }

  const counts =
    phaseCellCounts();

  const status =
    document.getElementById(
      "phaseCellGeometryStatus"
    );

  if (
    status
  ) {
    status.innerHTML = `
      <div>
        <strong>${counts.total.toLocaleString()}</strong>
        <span>cells</span>
      </div>

      <div>
        <strong>${Number(counts.part?.cell || 0).toLocaleString()}</strong>
        <span>bodies</span>
      </div>

      <div>
        <strong>${Number(counts.part?.nucleus || 0).toLocaleString()}</strong>
        <span>nuclei</span>
      </div>
    `;

    status.classList.toggle(
      "no-nuclei",
      !Number(
        counts.part?.nucleus
        || 0
      )
    );
  }

  const summary =
    document.getElementById(
      "phaseCellDocumentSummary"
    );

  if (
    summary
  ) {
    summary.textContent =
      (
        `${counts.total.toLocaleString()} cells`
        + ` · ${Number(counts.part?.cell || 0).toLocaleString()} bodies`
        + ` · ${Number(counts.part?.nucleus || 0).toLocaleString()} nuclei`
      );
  }

  const partFilter =
    document.getElementById(
      "phaseCellPartFilter"
    );

  if (
    partFilter
  ) {
    partFilter.value =
      String(
        phaseCellDisplayState
          .partFilter
        || "all"
      );
  }

  const badge =
    document.getElementById(
      "phaseCellCreationBadge"
    );

  if (
    badge
  ) {
    badge.textContent =
      `New: ${phaseCellPartLabel(phaseCellCreationPart)}`;
  }

  let emptyNote =
    document.getElementById(
      "phaseCellNucleusEmptyNote"
    );

  if (
    !Number(
      counts.part?.nucleus
      || 0
    )
  ) {
    if (
      !emptyNote
    ) {
      emptyNote =
        document.createElement(
          "div"
        );

      emptyNote.id =
        "phaseCellNucleusEmptyNote";

      emptyNote.className =
        "phase-cell-nucleus-empty-note";

      document.getElementById(
        "phaseCellGeometryStatus"
      )?.insertAdjacentElement(
        "afterend",
        emptyNote
      );
    }

    emptyNote.textContent =
      (
        "No nucleus geometries are stored in this annotation. "
        + "If the source QuPath GeoJSON contains nucleusGeometry, re-import it to recover those contours. "
        + "Otherwise use the normal Annotation drawing tools on the left to add nuclei."
      );

  } else if (
    emptyNote
  ) {
    emptyNote.remove();
  }

  const selected =
    phaseCellSelectedPrimary();

  const addButton =
    document.getElementById(
      "phaseCellAddSelected"
    );

  const subtractButton =
    document.getElementById(
      "phaseCellSubtractSelected"
    );

  const deleteButton =
    document.getElementById(
      "phaseCellDeleteSelectedGeometry"
    );

  const disabled =
    !selected;

  if (addButton) {
    addButton.disabled =
      disabled;
  }

  if (subtractButton) {
    subtractButton.disabled =
      disabled;
  }

  if (deleteButton) {
    deleteButton.disabled =
      !phaseCellSelectedFeatures()
        .length;
  }
}


const phaseCellNucleusBaseRenderPanel =
  phaseCellRenderPanel;

phaseCellRenderPanel =
  function phaseCellNucleusRenderPanel(
    ...args
  ) {
    const result =
      phaseCellNucleusBaseRenderPanel(
        ...args
      );

    phaseCellNucleusEnsureUi();
    phaseCellNucleusRenderStatus();

    return result;
  };


// Initialize part filter for documents loaded before this module.
phaseCellDisplayState.partFilter =
  phaseCellDisplayState.partFilter
  || "all";

phaseCellNucleusEnsureUi();
phaseCellNucleusRenderStatus();
