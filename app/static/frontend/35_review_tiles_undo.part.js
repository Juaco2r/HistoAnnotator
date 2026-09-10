// ========================================================================
// Review Tiles + Review Undo v1
//
// Existing single-annotation Review remains unchanged. This module adds:
//   - Review Undo: returns to the previous reviewed/corrected item.
//   - "By tiles…" scope.
//   - Exact Valid Tissue grid from the server (ROI -> border -> Artifact).
//   - Multiple colored annotations visible together in one tissue tile.
//   - Tap-to-toggle multi-selection while Select is active.
//   - Accept selected / Accept all & next.
// ========================================================================

const PHASE_REVIEW_TILE_SCOPE =
  "__tiles__";

const PHASE_REVIEW_UNDO_LIMIT =
  50;

let phaseReviewUndoHistory =
  [];

let phaseReviewTileState = {
  active:
    false,

  tiles:
    [],

  currentIndex:
    0,

  reviewedTileIds:
    new Set(),

  serverExact:
    false,

  tileSizePx:
    0,

  tileLabel:
    "",

  analysis:
    null,
};


function phaseReviewTileCurrent() {
  if (
    !phaseReviewTileState.active
    || !phaseReviewTileState
      .tiles.length
  ) {
    return null;
  }

  return (
    phaseReviewTileState
      .tiles[
        phaseReviewTileState
          .currentIndex
      ]
    || null
  );
}


function phaseReviewTileFeatureBounds(
  feature
) {
  return phaseF26GeometryBounds(
    feature?.geometry
  );
}


function phaseReviewTileBoundsIntersect(
  left,
  right
) {
  if (
    !left
    || !right
  ) {
    return false;
  }

  return !(
    left.maxX
      < right.minX
    || left.minX
      > right.maxX
    || left.maxY
      < right.minY
    || left.minY
      > right.maxY
  );
}


function phaseReviewTileRectBounds(
  tile
) {
  if (!tile) {
    return null;
  }

  return {
    minX:
      Number(
        tile.x
      ),

    minY:
      Number(
        tile.y
      ),

    maxX:
      Number(
        tile.x
      )
      + Number(
          tile.width
        ),

    maxY:
      Number(
        tile.y
      )
      + Number(
          tile.height
        ),
  };
}


// ------------------------------------------------------------------------
// Cellular Tile Review ownership v1
//
// Tissue ROI defines the review grid but is never itself a review target.
// In Cellular Annotation, a biological cell belongs to exactly one tile,
// using the nucleus centroid when available and otherwise the cellular
// geometry centroid. Persistent coordinates remain untouched.
// ------------------------------------------------------------------------

let phaseReviewTileCellOwnerPointMap =
  null;


function phaseReviewTileCellularActive() {
  return Boolean(
    typeof phaseCellDocumentIsCellular
      === "function"
    && phaseCellDocumentIsCellular()
  );
}


function phaseReviewTileCellId(
  feature
) {
  const histo =
    feature?.properties
      ?.histoannotator
    || {};

  const cell =
    histo.cell
    || {};

  return String(
    cell.cellId
    ?? histo.cellId
    ?? feature?.properties?.cellId
    ?? feature?.cellId
    ?? ""
  );
}


function phaseReviewTileEmbeddedNucleusGeometry(
  feature
) {
  return (
    feature?.nucleusGeometry
    || feature?.properties
      ?.nucleusGeometry
    || feature?.properties
      ?.histoannotator
      ?.cell
      ?.nucleusGeometry
    || null
  );
}


function phaseReviewTileGeometryCentroid(
  geometry
) {
  if (
    !geometry
    || typeof geometry !== "object"
  ) {
    return null;
  }

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : (
          geometry.type === "MultiPolygon"
            ? geometry.coordinates
            : []
        );

  let best =
    null;

  let bestArea =
    -1;

  for (
    const polygon
    of polygons
  ) {
    const ring =
      Array.isArray(polygon)
        ? polygon[0]
        : null;

    if (
      !Array.isArray(ring)
      || ring.length < 3
    ) {
      continue;
    }

    let twiceArea =
      0;

    let weightedX =
      0;

    let weightedY =
      0;

    let fallbackX =
      0;

    let fallbackY =
      0;

    let fallbackCount =
      0;

    for (
      let index = 0;
      index < ring.length;
      index += 1
    ) {
      const current =
        ring[index];

      const next =
        ring[
          (index + 1)
          % ring.length
        ];

      if (
        !Array.isArray(current)
        || current.length < 2
      ) {
        continue;
      }

      const x =
        Number(current[0]);

      const y =
        Number(current[1]);

      if (
        Number.isFinite(x)
        && Number.isFinite(y)
      ) {
        fallbackX += x;
        fallbackY += y;
        fallbackCount += 1;
      }

      if (
        !Array.isArray(next)
        || next.length < 2
      ) {
        continue;
      }

      const nx =
        Number(next[0]);

      const ny =
        Number(next[1]);

      if (
        !Number.isFinite(x)
        || !Number.isFinite(y)
        || !Number.isFinite(nx)
        || !Number.isFinite(ny)
      ) {
        continue;
      }

      const cross =
        x * ny
        - nx * y;

      twiceArea += cross;

      weightedX +=
        (x + nx)
        * cross;

      weightedY +=
        (y + ny)
        * cross;
    }

    const absoluteArea =
      Math.abs(
        twiceArea
      );

    let point =
      null;

    if (
      absoluteArea > 1e-9
    ) {
      point = {
        x:
          weightedX
          / (3 * twiceArea),

        y:
          weightedY
          / (3 * twiceArea),
      };

    } else if (
      fallbackCount
    ) {
      point = {
        x:
          fallbackX
          / fallbackCount,

        y:
          fallbackY
          / fallbackCount,
      };
    }

    if (
      point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && absoluteArea > bestArea
    ) {
      best =
        point;

      bestArea =
        absoluteArea;
    }
  }

  return best;
}


function phaseReviewTileCellRepresentativeScore(
  feature
) {
  if (
    phaseReviewTileEmbeddedNucleusGeometry(
      feature
    )
  ) {
    return 4;
  }

  const cell =
    feature?.properties
      ?.histoannotator
      ?.cell
    || {};

  const descriptor =
    [
      cell.geometryRole,
      cell.role,
      cell.part,
      cell.objectType,
      feature?.properties
        ?.objectType,
      feature?.properties
        ?.name,
      featureId(
        feature
      ),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  if (
    descriptor.includes(
      "nucleus"
    )
    || descriptor.includes(
      "nuclei"
    )
  ) {
    return 3;
  }

  if (
    descriptor.includes(
      "body"
    )
  ) {
    return 1;
  }

  return 2;
}


function phaseReviewTileBuildCellOwnerPointMap() {
  const chosen =
    new Map();

  for (
    const feature
    of (
      featureCollection.features
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

    const cellId =
      phaseReviewTileCellId(
        feature
      );

    const key =
      cellId
        ? `cell:${cellId}`
        : `feature:${String(
            featureId(
              feature
            )
            || ""
          )}`;

    const nucleusGeometry =
      phaseReviewTileEmbeddedNucleusGeometry(
        feature
      );

    const geometry =
      nucleusGeometry
      || feature.geometry;

    const point =
      phaseReviewTileGeometryCentroid(
        geometry
      );

    if (!point) {
      continue;
    }

    const score =
      phaseReviewTileCellRepresentativeScore(
        feature
      );

    const previous =
      chosen.get(
        key
      );

    if (
      !previous
      || score > previous.score
    ) {
      chosen.set(
        key,
        {
          point,
          score,
        }
      );
    }
  }

  const result =
    new Map();

  for (
    const [key, value]
    of chosen.entries()
  ) {
    result.set(
      key,
      value.point
    );
  }

  return result;
}


function phaseReviewTileCellOwnerPoint(
  feature
) {
  const cellId =
    phaseReviewTileCellId(
      feature
    );

  const key =
    cellId
      ? `cell:${cellId}`
      : `feature:${String(
          featureId(
            feature
          )
          || ""
        )}`;

  const cached =
    phaseReviewTileCellOwnerPointMap
      ?.get(
        key
      );

  if (cached) {
    return cached;
  }

  const geometry =
    phaseReviewTileEmbeddedNucleusGeometry(
      feature
    )
    || feature.geometry;

  return phaseReviewTileGeometryCentroid(
    geometry
  );
}


function phaseReviewTilePointInTile(
  point,
  tile
) {
  if (
    !point
    || !tile
  ) {
    return false;
  }

  const bounds =
    phaseReviewTileRectBounds(
      tile
    );

  if (!bounds) {
    return false;
  }

  return (
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= bounds.minX
    && point.x < bounds.maxX
    && point.y >= bounds.minY
    && point.y < bounds.maxY
  );
}



function phaseReviewTileFeatureInTile(
  feature,
  tile =
    phaseReviewTileCurrent()
) {
  if (!tile) {
    return false;
  }

  if (
    phaseReviewTileCellularActive()
  ) {
    if (
      !phaseCellIsCellularFeature(
        feature
      )
    ) {
      return false;
    }

    return phaseReviewTilePointInTile(
      phaseReviewTileCellOwnerPoint(
        feature
      ),
      tile
    );
  }

  if (
    !phaseDIsAnnotationFeature(
      feature
    )
  ) {
    return false;
  }

  const id =
    String(
      featureId(
        feature
      )
      || ""
    );

  if (
    id
    && Array.isArray(
      tile.annotationIds
    )
    && tile.annotationIds
      .map(String)
      .includes(
        id
      )
  ) {
    return true;
  }

  const featureBounds =
    phaseReviewTileFeatureBounds(
      feature
    );

  return phaseReviewTileBoundsIntersect(
    featureBounds,
    phaseReviewTileRectBounds(
      tile
    )
  );
}


function phaseReviewTileFeatures(
  tile =
    phaseReviewTileCurrent()
) {
  if (!tile) {
    return [];
  }

  const cellular =
    phaseReviewTileCellularActive();

  const previousOwnerPointMap =
    phaseReviewTileCellOwnerPointMap;

  if (cellular) {
    phaseReviewTileCellOwnerPointMap =
      phaseReviewTileBuildCellOwnerPointMap();
  }

  try {
    return (
      featureCollection.features
      || []
    ).filter(
      (feature) =>
        phaseReviewTileFeatureInTile(
          feature,
          tile
        )
    );

  } finally {
    phaseReviewTileCellOwnerPointMap =
      previousOwnerPointMap;
  }
}


function phaseReviewTilePendingFeatures(
  tile =
    phaseReviewTileCurrent()
) {
  return phaseReviewTileFeatures(
    tile
  ).filter(
    (feature) =>
      reviewStatus(
        feature
      )
      !== "correct"
  );
}


function phaseReviewSnapshot(
  label
) {
  return {
    label:
      String(
        label
        || "Review action"
      ),

    featureCollection:
      deepClone(
        featureCollection
      ),

    reviewState:
      deepClone(
        reviewState
      ),

    selectedIds:
      [
        ...selectedIds
      ],

    selectedId:
      selectedId
        ? String(
            selectedId
          )
        : null,

    currentClassName:
      currentClass
        ?.name
      || "",

    undoLength:
      undoStack.length,

    redoStack:
      deepClone(
        redoStack
      ),

    tileState: {
      active:
        Boolean(
          phaseReviewTileState
            .active
        ),

      currentIndex:
        Number(
          phaseReviewTileState
            .currentIndex
          || 0
        ),

      reviewedTileIds:
        [
          ...phaseReviewTileState
            .reviewedTileIds
        ],
    },
  };
}


function phaseReviewPushUndo(
  label
) {
  if (
    !reviewState.active
  ) {
    return;
  }

  phaseReviewUndoHistory.push(
    phaseReviewSnapshot(
      label
    )
  );

  if (
    phaseReviewUndoHistory.length
      > PHASE_REVIEW_UNDO_LIMIT
  ) {
    phaseReviewUndoHistory.shift();
  }

  phaseReviewUpdateUndoButton();
}


function phaseReviewUpdateUndoButton() {
  const button =
    document.getElementById(
      "phaseReviewUndoButton"
    );

  if (!button) {
    return;
  }

  const snapshot =
    phaseReviewUndoHistory[
      phaseReviewUndoHistory.length
      - 1
    ];

  button.disabled =
    !snapshot;

  button.title =
    snapshot
      ? (
          `Undo review action: ${
            snapshot.label
          }`
        )
      : "No previous review action";
}


function phaseReviewUndoAction() {
  const snapshot =
    phaseReviewUndoHistory.pop();

  if (!snapshot) {
    setStatus(
      "No previous review action",
      "local"
    );

    phaseReviewUpdateUndoButton();
    return;
  }

  featureCollection =
    deepClone(
      snapshot.featureCollection
    );

  reviewState =
    deepClone(
      snapshot.reviewState
    );

  selectedIds =
    new Set(
      snapshot.selectedIds
        .map(String)
    );

  selectedId =
    snapshot.selectedId
      ? String(
          snapshot.selectedId
        )
      : null;

  implicitSelectionId =
    null;

  currentClass =
    classes.find(
      (item) =>
        item.name
          === snapshot
            .currentClassName
    )
    || currentClass
    || classes[0];

  undoStack =
    undoStack.slice(
      0,
      Math.max(
        0,
        Number(
          snapshot.undoLength
          || 0
        )
      )
    );

  redoStack =
    deepClone(
      snapshot.redoStack
      || []
    );

  if (
    snapshot.tileState
      ?.active
    && phaseReviewTileState
      .tiles.length
  ) {
    phaseReviewTileState.active =
      true;

    phaseReviewTileState.currentIndex =
      Math.max(
        0,
        Math.min(
          phaseReviewTileState
            .tiles.length
            - 1,
          Number(
            snapshot.tileState
              .currentIndex
            || 0
          )
        )
      );

    phaseReviewTileState.reviewedTileIds =
      new Set(
        (
          snapshot.tileState
            .reviewedTileIds
          || []
        ).map(String)
      );

    phaseReviewRenderTilePanel();
    phaseReviewZoomToCurrentTile();

  } else {
    phaseReviewTileState.active =
      false;

    phaseReviewRenderStandardUi();

    const feature =
      currentReviewFeature();

    if (feature) {
      populateReviewClassSelect(
        feature
      );

      zoomToReviewFeature(
        feature
      );
    }

    updateReviewProgress();
  }

  markChanged();
  updateControls();
  drawAnnotations();

  setStatus(
    (
      `Review undo: ${
        snapshot.label
      }`
    ),
    "saved"
  );

  phaseReviewUpdateUndoButton();
}


function phaseReviewEnsureUndoUi() {
  const header =
    els.reviewPanel
      ?.querySelector(
        ".review-header"
      );

  if (
    header
    && !document.getElementById(
      "phaseReviewUndoButton"
    )
  ) {
    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "phase-review-header-actions";

    const undoButton =
      document.createElement(
        "button"
      );

    undoButton.id =
      "phaseReviewUndoButton";

    undoButton.type =
      "button";

    undoButton.className =
      "small-button";

    undoButton.textContent =
      "↶ Undo review";

    undoButton.addEventListener(
      "click",
      phaseReviewUndoAction
    );

    const exitButton =
      els.exitReviewModeButton;

    if (exitButton) {
      exitButton.replaceWith(
        actions
      );

      actions.append(
        undoButton,
        exitButton
      );
    } else {
      header.append(
        actions
      );
    }
  }

  phaseReviewUpdateUndoButton();
}


function phaseReviewTileCalibrationMpp() {
  const effective =
    Number(
      effectiveCalibration()
        ?.mpp
    );

  if (
    Number.isFinite(
      effective
    )
    && effective > 0
  ) {
    return effective;
  }

  const x =
    Number(
      currentInfo
        ?.mppX
    );

  const y =
    Number(
      currentInfo
        ?.mppY
    );

  if (
    Number.isFinite(x)
    && x > 0
    && Number.isFinite(y)
    && y > 0
  ) {
    return Math.sqrt(
      x * y
    );
  }

  if (
    Number.isFinite(x)
    && x > 0
  ) {
    return x;
  }

  if (
    Number.isFinite(y)
    && y > 0
  ) {
    return y;
  }

  return null;
}


function phaseReviewEnsureTileSetupUi() {
  if (
    !els.reviewScopeSelect
    || document.getElementById(
      "phaseReviewTileSetup"
    )
  ) {
    return;
  }

  const field =
    els.reviewScopeSelect.closest(
      "label"
    );

  if (!field) {
    return;
  }

  const box =
    document.createElement(
      "div"
    );

  box.id =
    "phaseReviewTileSetup";

  box.className =
    "phase-review-tile-setup";

  box.hidden =
    true;

  box.innerHTML = `
    <div>
      <strong>Tile review</strong>
      <small>
        The valid review area follows Tissue ROI,
        external-border exclusion and Artifact exclusion.
      </small>
    </div>

    <div class="phase-review-tile-size-row">
      <label>
        <span>Tile size</span>
        <input id="phaseReviewTileSize"
               type="number"
               min="128"
               step="1">
      </label>

      <label>
        <span>Unit</span>
        <select id="phaseReviewTileUnit">
          <option value="um">µm</option>
          <option value="px">px</option>
        </select>
      </label>
    </div>

    <small id="phaseReviewTileSetupHint"></small>
  `;

  field.insertAdjacentElement(
    "afterend",
    box
  );

  const mpp =
    phaseReviewTileCalibrationMpp();

  const size =
    document.getElementById(
      "phaseReviewTileSize"
    );

  const unit =
    document.getElementById(
      "phaseReviewTileUnit"
    );

  if (mpp) {
    size.value =
      "1000";

    unit.value =
      "um";

  } else {
    size.value =
      "2048";

    unit.value =
      "px";
  }

  unit.addEventListener(
    "change",
    phaseReviewTileUpdateSetupHint
  );

  size.addEventListener(
    "input",
    phaseReviewTileUpdateSetupHint
  );

  phaseReviewTileUpdateSetupHint();
}


function phaseReviewTileUpdateSetupHint() {
  const box =
    document.getElementById(
      "phaseReviewTileSetup"
    );

  if (!box) {
    return;
  }

  const hint =
    document.getElementById(
      "phaseReviewTileSetupHint"
    );

  const size =
    Number(
      document.getElementById(
        "phaseReviewTileSize"
      )?.value
      || 0
    );

  const unit =
    String(
      document.getElementById(
        "phaseReviewTileUnit"
      )?.value
      || "px"
    );

  const mpp =
    phaseReviewTileCalibrationMpp();

  if (
    unit === "um"
    && !mpp
  ) {
    hint.textContent =
      (
        "No physical calibration is available. "
        + "Choose px or add calibration first."
      );

    return;
  }

  const px =
    unit === "um"
      ? (
          size
          / mpp
        )
      : size;

  hint.textContent =
    (
      Number.isFinite(px)
      && px > 0
    )
      ? (
          `≈ ${Math.round(px).toLocaleString()} px per tile`
        )
      : "Choose a positive tile size.";
}


function phaseReviewTileSetupVisible() {
  const box =
    document.getElementById(
      "phaseReviewTileSetup"
    );

  if (!box) {
    return;
  }

  box.hidden =
    els.reviewScopeSelect
      ?.value
      !== PHASE_REVIEW_TILE_SCOPE;
}


function phaseReviewTileSizeConfig() {
  const size =
    Number(
      document.getElementById(
        "phaseReviewTileSize"
      )?.value
      || 0
    );

  const unit =
    String(
      document.getElementById(
        "phaseReviewTileUnit"
      )?.value
      || "px"
    );

  if (
    !Number.isFinite(size)
    || size <= 0
  ) {
    throw new Error(
      "Choose a positive tile size"
    );
  }

  if (unit === "um") {
    const mpp =
      phaseReviewTileCalibrationMpp();

    if (!mpp) {
      throw new Error(
        "Physical tile size requires image calibration"
      );
    }

    const tileSizePx =
      size / mpp;

    return {
      tileSizePx,
      label:
        `${size.toLocaleString()} µm`,
    };
  }

  return {
    tileSizePx:
      size,

    label:
      `${Math.round(size).toLocaleString()} px`,
  };
}


function phaseReviewEnsureTilePanel() {
  if (
    !els.reviewPanel
    || document.getElementById(
      "phaseReviewTilePanel"
    )
  ) {
    return;
  }

  const panel =
    document.createElement(
      "section"
    );

  panel.id =
    "phaseReviewTilePanel";

  panel.className =
    "phase-review-tile-panel";

  panel.hidden =
    true;

  panel.innerHTML = `
    <div class="phase-review-tile-nav">
      <button id="phaseReviewPrevTile"
              type="button">
        ← Previous tile
      </button>

      <strong id="phaseReviewTileCounter">
        Tile —
      </strong>

      <button id="phaseReviewNextTile"
              type="button">
        Next tile →
      </button>
    </div>

    <div id="phaseReviewTileMeta"
         class="phase-review-tile-meta">
    </div>

    <div class="phase-review-tile-selection-head">
      <strong>Tile objects</strong>

      <div>
        <button id="phaseReviewSelectPending"
                type="button">
          Select pending
        </button>

        <button id="phaseReviewClearTileSelection"
                type="button">
          Clear
        </button>
      </div>
    </div>

    <div id="phaseReviewTileAnnotationList"
         class="phase-review-tile-list">
    </div>

    <div class="phase-review-tile-actions">
      <button id="phaseReviewAcceptSelected"
              type="button">
        ✓ Accept selected
      </button>

      <button id="phaseReviewAcceptAllTile"
              type="button">
        ✓ Accept all & next
      </button>
    </div>

    <p class="review-help">
      Select mode: tap an annotation to toggle it.
      
    </p>
  `;

  els.reviewPanel.append(
    panel
  );

  document.getElementById(
    "phaseReviewPrevTile"
  )?.addEventListener(
    "click",
    () =>
      phaseReviewMoveTile(
        -1
      )
  );

  document.getElementById(
    "phaseReviewNextTile"
  )?.addEventListener(
    "click",
    () =>
      phaseReviewMoveTile(
        1
      )
  );

  document.getElementById(
    "phaseReviewSelectPending"
  )?.addEventListener(
    "click",
    phaseReviewSelectPendingTile
  );

  document.getElementById(
    "phaseReviewClearTileSelection"
  )?.addEventListener(
    "click",
    () => {
      clearSelectedFeatures(
        false
      );

      updateControls();
      drawAnnotations();
      phaseReviewRenderTilePanel();
    }
  );

  document.getElementById(
    "phaseReviewAcceptSelected"
  )?.addEventListener(
    "click",
    phaseReviewAcceptSelectedTile
  );

  document.getElementById(
    "phaseReviewAcceptAllTile"
  )?.addEventListener(
    "click",
    phaseReviewAcceptAllTile
  );
}


function phaseReviewStandardReviewNodes() {
  return [
    els.reviewPanel
      ?.querySelector(
        ".review-class-label"
      ),

    els.reviewPanel
      ?.querySelector(
        ".review-class-row"
      ),

    els.reviewPanel
      ?.querySelector(
        ".review-help"
      ),
  ].filter(Boolean);
}


function phaseReviewRenderStandardUi() {
  const tilePanel =
    document.getElementById(
      "phaseReviewTilePanel"
    );

  if (tilePanel) {
    tilePanel.hidden =
      true;
  }

  for (
    const node
    of phaseReviewStandardReviewNodes()
  ) {
    node.hidden =
      false;
  }

  if (els.reviewDecisionBar) {
    els.reviewDecisionBar.hidden =
      !reviewState.active;
  }
}


function phaseReviewRenderTileUi() {
  const tilePanel =
    document.getElementById(
      "phaseReviewTilePanel"
    );

  if (tilePanel) {
    tilePanel.hidden =
      false;
  }

  for (
    const node
    of phaseReviewStandardReviewNodes()
  ) {
    node.hidden =
      true;
  }

  if (els.reviewDecisionBar) {
    els.reviewDecisionBar.hidden =
      true;
  }
}


function phaseReviewTileCurrentFeatureIds() {
  return new Set(
    phaseReviewTileFeatures()
      .map(
        (feature) =>
          String(
            featureId(
              feature
            )
          )
      )
  );
}


function phaseReviewTileSelectionIds() {
  const allowed =
    phaseReviewTileCurrentFeatureIds();

  return [
    ...selectedIds
  ].filter(
    (id) =>
      allowed.has(
        String(id)
      )
  );
}


function phaseReviewTileSetSelection(
  ids
) {
  const allowed =
    phaseReviewTileCurrentFeatureIds();

  const clean =
    (
      ids
      || []
    ).map(String)
      .filter(
        (id) =>
          allowed.has(id)
      );

  setMultiSelection(
    clean,
    clean[clean.length - 1]
      || null
  );

  updateControls();
  drawAnnotations();
  phaseReviewRenderTilePanel();
}


function phaseReviewSelectPendingTile() {
  phaseReviewTileSetSelection(
    phaseReviewTilePendingFeatures()
      .map(
        (feature) =>
          featureId(
            feature
          )
      )
  );
}


function phaseReviewTileMaybeMarkReviewed() {
  const tile =
    phaseReviewTileCurrent();

  if (!tile) {
    return;
  }

  const features =
    phaseReviewTileFeatures(
      tile
    );

  if (
    features.length
    && features.every(
      (feature) =>
        reviewStatus(
          feature
        )
          === "correct"
    )
  ) {
    phaseReviewTileState
      .reviewedTileIds
      .add(
        String(
          tile.id
        )
      );
  }
}


function phaseReviewRenderTileProgress() {
  const total =
    phaseReviewTileState
      .tiles.length;

  const reviewed =
    phaseReviewTileState
      .reviewedTileIds
      .size;

  const percent =
    total
      ? Math.round(
          100
          * reviewed
          / total
        )
      : 100;

  if (els.reviewProgressFill) {
    els.reviewProgressFill
      .style.width =
      `${percent}%`;
  }

  if (els.reviewProgressText) {
    els.reviewProgressText
      .textContent =
      (
        `${reviewed} / ${total} tiles reviewed`
        + ` · ${percent}%`
      );
  }

  if (els.reviewRemainingText) {
    els.reviewRemainingText
      .textContent =
      (
        `Remaining tiles: ${
          Math.max(
            0,
            total - reviewed
          )
        }`
      );
  }
}


function phaseReviewRenderTilePanel() {
  if (
    !phaseReviewTileState.active
  ) {
    return;
  }

  phaseReviewRenderTileUi();
  phaseReviewTileMaybeMarkReviewed();

  const tile =
    phaseReviewTileCurrent();

  const features =
    phaseReviewTileFeatures(
      tile
    );

  const pending =
    features.filter(
      (feature) =>
        reviewStatus(
          feature
        )
          !== "correct"
    );

  const selected =
    new Set(
      phaseReviewTileSelectionIds()
    );

  const counter =
    document.getElementById(
      "phaseReviewTileCounter"
    );

  if (counter) {
    counter.textContent =
      (
        `Tile ${
          phaseReviewTileState
            .currentIndex + 1
        } / ${
          phaseReviewTileState
            .tiles.length
        }`
      );
  }

  const validPercent =
    Number(
      tile?.validFraction
      || 0
    )
    * 100;

  const meta =
    document.getElementById(
      "phaseReviewTileMeta"
    );

  if (meta) {
    meta.innerHTML = `
      <span>
        <strong>${features.length}</strong>
        annotations
      </span>

      <span>
        <strong>${pending.length}</strong>
        pending
      </span>

      <span>
        <strong>${validPercent.toFixed(1)}%</strong>
        valid tissue
      </span>

      <span>
        <strong>${phaseReviewTileState.serverExact ? "Exact ROI" : "Approx."}</strong>
        tile grid
      </span>
    `;
  }

  const list =
    document.getElementById(
      "phaseReviewTileAnnotationList"
    );

  if (list) {
    list.innerHTML =
      "";

    if (!features.length) {
      const empty =
        document.createElement(
          "p"
        );

      empty.className =
        "phase-review-tile-empty";

      empty.textContent =
        (
          "No annotations intersect this tile. "
          + "You can inspect the tissue and continue."
        );

      list.append(
        empty
      );

    } else {
      for (
        const feature
        of features
      ) {
        const id =
          String(
            featureId(
              feature
            )
          );

        const row =
          document.createElement(
            "label"
          );

        row.className =
          "phase-review-tile-row";

        const checkbox =
          document.createElement(
            "input"
          );

        checkbox.type =
          "checkbox";

        checkbox.checked =
          selected.has(
            id
          );

        checkbox.addEventListener(
          "change",
          () => {
            const next =
              new Set(
                phaseReviewTileSelectionIds()
              );

            if (
              checkbox.checked
            ) {
              next.add(
                id
              );

            } else {
              next.delete(
                id
              );
            }

            phaseReviewTileSetSelection(
              [
                ...next
              ]
            );
          }
        );

        const swatch =
          document.createElement(
            "span"
          );

        swatch.className =
          "phase-review-tile-swatch";

        swatch.style.background =
          colorForFeature(
            feature
          );

        const copy =
          document.createElement(
            "span"
          );

        copy.className =
          "phase-review-tile-row-copy";

        const className =
          document.createElement(
            "strong"
          );

        className.textContent =
          getFeatureClassName(
            feature
          );

        const status =
          document.createElement(
            "small"
          );

        status.textContent =
          reviewStatus(
            feature
          );

        copy.append(
          className,
          status
        );

        row.append(
          checkbox,
          swatch,
          copy
        );

        list.append(
          row
        );
      }
    }
  }

  if (els.reviewCurrentText) {
    els.reviewCurrentText
      .textContent =
      (
        `Tile ${
          phaseReviewTileState
            .currentIndex + 1
        } · ${features.length} annotations`
        + ` · ${pending.length} pending`
      );
  }

  if (els.reviewScopeLabel) {
    els.reviewScopeLabel
      .textContent =
      (
        `By tiles · ${
          phaseReviewTileState
            .tileLabel
        }`
      );
  }

  phaseReviewRenderTileProgress();
  phaseReviewUpdateUndoButton();
}


function phaseReviewZoomToTile(
  tile
) {
  if (
    !tile
    || !viewer
    || !viewer.world
      ?.getItemCount?.()
  ) {
    return;
  }

  const item =
    viewer.world.getItemAt(
      0
    );

  if (!item) {
    return;
  }

  const pad =
    Math.max(
      8,
      Number(
        tile.width
      )
      * 0.04
    );

  const left =
    Math.max(
      0,
      Number(
        tile.x
      )
      - pad
    );

  const top =
    Math.max(
      0,
      Number(
        tile.y
      )
      - pad
    );

  const width =
    Number(
      tile.width
    )
    + 2 * pad;

  const height =
    Number(
      tile.height
    )
    + 2 * pad;

  const topLeft =
    item.imageToViewportCoordinates(
      left,
      top
    );

  const bottomRight =
    item.imageToViewportCoordinates(
      left + width,
      top + height
    );

  viewer.viewport.fitBounds(
    new OpenSeadragon.Rect(
      topLeft.x,
      topLeft.y,
      Math.max(
        0.000001,
        bottomRight.x
        - topLeft.x
      ),
      Math.max(
        0.000001,
        bottomRight.y
        - topLeft.y
      )
    ),
    true
  );
}


function phaseReviewZoomToCurrentTile() {
  phaseReviewZoomToTile(
    phaseReviewTileCurrent()
  );
}


function phaseReviewMoveTile(
  delta
) {
  if (
    !phaseReviewTileState.active
    || !phaseReviewTileState
      .tiles.length
  ) {
    return;
  }

  clearSelectedFeatures(
    false
  );

  phaseReviewTileState.currentIndex =
    (
      phaseReviewTileState
        .currentIndex
      + delta
      + phaseReviewTileState
        .tiles.length
    )
    % phaseReviewTileState
        .tiles.length;

  phaseReviewRenderTilePanel();
  updateControls();
  drawAnnotations();
  phaseReviewZoomToCurrentTile();
}


function phaseReviewMoveToNextUnreviewedTile() {
  const tiles =
    phaseReviewTileState
      .tiles;

  if (!tiles.length) {
    return;
  }

  const start =
    phaseReviewTileState
      .currentIndex;

  for (
    let offset = 1;
    offset <= tiles.length;
    offset += 1
  ) {
    const index =
      (
        start
        + offset
      ) % tiles.length;

    if (
      !phaseReviewTileState
        .reviewedTileIds
        .has(
          String(
            tiles[index].id
          )
        )
    ) {
      phaseReviewTileState
        .currentIndex =
        index;

      clearSelectedFeatures(
        false
      );

      phaseReviewRenderTilePanel();
      updateControls();
      drawAnnotations();
      phaseReviewZoomToCurrentTile();

      return;
    }
  }

  setStatus(
    "All tiles have been reviewed",
    "saved"
  );

  phaseReviewRenderTilePanel();
}


function phaseReviewAcceptSelectedTile() {
  if (
    !phaseReviewTileState.active
  ) {
    return;
  }

  const ids =
    phaseReviewTileSelectionIds();

  if (!ids.length) {
    setStatus(
      "Select one or more annotations in this tile",
      "local"
    );
    return;
  }

  phaseReviewPushUndo(
    "Accept selected annotations"
  );

  pushUndo();

  const idSet =
    new Set(
      ids.map(String)
    );

  let changed =
    0;

  for (
    const feature
    of phaseReviewTileFeatures()
  ) {
    if (
      !idSet.has(
        String(
          featureId(
            feature
          )
        )
      )
    ) {
      continue;
    }

    if (
      reviewStatus(
        feature
      )
      !== "correct"
    ) {
      setReviewStatus(
        feature,
        "correct"
      );

      changed += 1;
    }
  }

  if (changed) {
    markChanged();
  }

  clearSelectedFeatures(
    false
  );

  phaseReviewTileMaybeMarkReviewed();
  phaseReviewRenderTilePanel();
  updateControls();
  drawAnnotations();

  setStatus(
    (
      `Accepted ${changed} annotation${
        changed === 1
          ? ""
          : "s"
      } in this tile`
    ),
    "saved"
  );
}


function phaseReviewAcceptAllTile() {
  if (
    !phaseReviewTileState.active
  ) {
    return;
  }

  const tile =
    phaseReviewTileCurrent();

  if (!tile) {
    return;
  }

  phaseReviewPushUndo(
    "Accept all annotations in tile"
  );

  const features =
    phaseReviewTileFeatures(
      tile
    );

  const changing =
    features.filter(
      (feature) =>
        reviewStatus(
          feature
        )
          !== "correct"
    );

  if (
    changing.length
  ) {
    pushUndo();

    for (
      const feature
      of changing
    ) {
      setReviewStatus(
        feature,
        "correct"
      );
    }

    markChanged();
  }

  phaseReviewTileState
    .reviewedTileIds
    .add(
      String(
        tile.id
      )
    );

  clearSelectedFeatures(
    false
  );

  phaseReviewRenderTilePanel();
  updateControls();
  drawAnnotations();

  setStatus(
    (
      `Accepted tile ${
        phaseReviewTileState
          .currentIndex + 1
      }`
    ),
    "saved"
  );

  phaseReviewMoveToNextUnreviewedTile();
}


function phaseReviewTileFallbackGrid(
  tileSizePx
) {
  const imageWidth =
    Number(
      currentInfo
        ?.width
      || 0
    );

  const imageHeight =
    Number(
      currentInfo
        ?.height
      || 0
    );

  let bounds =
    null;

  const roiFeatures =
    (
      featureCollection.features
      || []
    ).filter(
      (feature) =>
        phaseDIsTissueRoi(
          feature
        )
    );

  for (
    const roi
    of roiFeatures
  ) {
    const effective =
      phaseDEffectivePreviewForRoi(
        roi
      );

    const geometry =
      effective
        ?.geometry
      || roi.geometry;

    const candidate =
      phaseF26GeometryBounds(
        geometry
      );

    if (!candidate) {
      continue;
    }

    if (!bounds) {
      bounds = {
        ...candidate,
      };

    } else {
      bounds.minX =
        Math.min(
          bounds.minX,
          candidate.minX
        );

      bounds.minY =
        Math.min(
          bounds.minY,
          candidate.minY
        );

      bounds.maxX =
        Math.max(
          bounds.maxX,
          candidate.maxX
        );

      bounds.maxY =
        Math.max(
          bounds.maxY,
          candidate.maxY
        );
    }
  }

  if (!bounds) {
    bounds = {
      minX:
        0,

      minY:
        0,

      maxX:
        imageWidth,

      maxY:
        imageHeight,
    };
  }

  if (
    !Number.isFinite(
      bounds.maxX
    )
    || !Number.isFinite(
      bounds.maxY
    )
    || bounds.maxX
      <= bounds.minX
    || bounds.maxY
      <= bounds.minY
  ) {
    throw new Error(
      "Could not determine a review region"
    );
  }

  const startX =
    Math.floor(
      bounds.minX
      / tileSizePx
    )
    * tileSizePx;

  const startY =
    Math.floor(
      bounds.minY
      / tileSizePx
    )
    * tileSizePx;

  const tiles =
    [];

  let number =
    0;

  for (
    let y = startY;
    y < bounds.maxY;
    y += tileSizePx
  ) {
    for (
      let x = startX;
      x < bounds.maxX;
      x += tileSizePx
    ) {
      number += 1;

      if (number > 5000) {
        throw new Error(
          "Tile size is too small; choose a larger tile size"
        );
      }

      const tile = {
        id:
          `fallback-${number}`,

        number,

        x,

        y,

        width:
          tileSizePx,

        height:
          tileSizePx,

        validFraction:
          1,

        annotationIds:
          [],
      };

      tile.annotationIds =
        phaseReviewTileFeatures(
          tile
        ).map(
          (feature) =>
            String(
              featureId(
                feature
              )
            )
        );

      tiles.push(
        tile
      );
    }
  }

  return {
    tiles,
    analysis: {
      source:
        roiFeatures.length
          ? "tissue-roi-bounds-fallback"
          : "full-image-fallback",
    },
  };
}


async function phaseReviewLoadTiles(
  tileSizePx
) {
  if (
    !currentImage
    || !currentInfo
  ) {
    throw new Error(
      "Open an image before Tile review"
    );
  }

  if (
    !currentImage.localNative
  ) {
    try {
      const response =
        await apiFetch(
          `${API}/geojson/review-tiles`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                featureCollection,
                imageWidth:
                  Number(
                    currentInfo.width
                    || 0
                  ),

                imageHeight:
                  Number(
                    currentInfo.height
                    || 0
                  ),

                tileSizePx,
              }),

            timeoutMs:
              60000,
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.detail
          || `HTTP ${response.status}`
        );
      }

      return {
        ...payload,
        serverExact:
          true,
      };

    } catch (error) {
      console.warn(
        "Exact tile grid unavailable; using local fallback",
        error
      );
    }
  }

  return {
    ...phaseReviewTileFallbackGrid(
      tileSizePx
    ),

    tileSizePx,
    serverExact:
      false,
  };
}


async function phaseReviewStartTileMode() {
  clearReviewAutoExitTimer();

  let config;

  try {
    config =
      phaseReviewTileSizeConfig();

  } catch (error) {
    window.alert(
      error.message
    );
    return;
  }

  setStatus(
    "Preparing Valid Tissue tile grid…",
    "local"
  );

  let payload;

  try {
    payload =
      await phaseReviewLoadTiles(
        config.tileSizePx
      );

  } catch (error) {
    setStatus(
      (
        `Could not prepare Tile review: ${
          error.message
        }`
      ),
      "error"
    );
    return;
  }

  const tiles =
    Array.isArray(
      payload.tiles
    )
      ? payload.tiles
      : [];

  if (!tiles.length) {
    window.alert(
      "No review tiles intersect the Valid Tissue region."
    );
    return;
  }

  phaseReviewUndoHistory =
    [];

  phaseReviewTileState = {
    active:
      true,

    tiles,

    currentIndex:
      0,

    reviewedTileIds:
      new Set(),

    serverExact:
      Boolean(
        payload.serverExact
      ),

    tileSizePx:
      Number(
        payload.tileSizePx
        || config.tileSizePx
      ),

    tileLabel:
      config.label,

    analysis:
      payload.analysis
      || null,
  };

  reviewState.active =
    true;

  reviewState.scope =
    PHASE_REVIEW_TILE_SCOPE;

  reviewState.scopeIds =
    (
      featureCollection.features
      || []
    ).filter(
      phaseDIsAnnotationFeature
    ).map(
      (feature) =>
        String(
          featureId(
            feature
          )
        )
    );

  reviewState.queue =
    [];

  reviewState.maybeQueue =
    [];

  reviewState.laterQueue =
    [];

  reviewState.phase =
    "tiles";

  reviewState.currentId =
    null;

  clearSelectedFeatures(
    false
  );

  els.reviewPanel.hidden =
    false;

  if (els.reviewDecisionBar) {
    els.reviewDecisionBar.hidden =
      true;
  }

  phaseReviewRenderTileUi();

  if (
    mode !== "select"
  ) {
    setMode(
      "select"
    );
  }

  annotationsVisible =
    true;

  if (els.eyeButton) {
    els.eyeButton.classList
      .add(
        "active"
      );

    els.eyeButton.textContent =
      "👁";
  }

  phaseReviewRenderTilePanel();
  updateControls();
  drawAnnotations();
  phaseReviewZoomToCurrentTile();

  setStatus(
    (
      `Tile review ready · ${
        tiles.length
      } tile${
        tiles.length === 1
          ? ""
          : "s"
      } · ${
        payload.serverExact
          ? "exact Valid Tissue"
          : "local ROI-bounds fallback"
      }`
    ),
    payload.serverExact
      ? "saved"
      : "local"
  );
}


function phaseReviewTileDrawBoundary() {
  if (
    !phaseReviewTileState.active
  ) {
    return;
  }

  const tile =
    phaseReviewTileCurrent();

  if (!tile) {
    return;
  }

  const topLeft =
    screenPointFromImage([
      Number(
        tile.x
      ),
      Number(
        tile.y
      ),
    ]);

  const bottomRight =
    screenPointFromImage([
      Number(
        tile.x
      )
      + Number(
          tile.width
        ),

      Number(
        tile.y
      )
      + Number(
          tile.height
        ),
    ]);

  if (
    !topLeft
    || !bottomRight
  ) {
    return;
  }

  ctx.save();

  ctx.strokeStyle =
    "#ffd43b";

  ctx.lineWidth =
    2.5;

  ctx.setLineDash([
    8,
    5,
  ]);

  ctx.strokeRect(
    Math.min(
      topLeft.x,
      bottomRight.x
    ),
    Math.min(
      topLeft.y,
      bottomRight.y
    ),
    Math.abs(
      bottomRight.x
      - topLeft.x
    ),
    Math.abs(
      bottomRight.y
      - topLeft.y
    )
  );

  ctx.restore();
}


// ------------------------------------------------------------------------
// Add Tile review to the existing Review setup dropdown.
// ------------------------------------------------------------------------

const phaseReviewTilesBasePopulateScopeOptions =
  populateReviewScopeOptions;

populateReviewScopeOptions =
  function phaseReviewTilesPopulateScopeOptions() {
    const previous =
      els.reviewScopeSelect
        ?.value
      || "all";

    const result =
      phaseReviewTilesBasePopulateScopeOptions();

    if (
      els.reviewScopeSelect
      && ![
        ...els.reviewScopeSelect.options
      ].some(
        (option) =>
          option.value
            === PHASE_REVIEW_TILE_SCOPE
      )
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        PHASE_REVIEW_TILE_SCOPE;

      option.textContent =
        "By tiles…";

      els.reviewScopeSelect.append(
        option
      );
    }

    if (
      previous
        === PHASE_REVIEW_TILE_SCOPE
    ) {
      els.reviewScopeSelect.value =
        PHASE_REVIEW_TILE_SCOPE;
    }

    phaseReviewEnsureTileSetupUi();
    phaseReviewTileSetupVisible();

    return result;
  };


const phaseReviewTilesBaseStartReview =
  startReviewMode;

startReviewMode =
  function phaseReviewTilesStartReview(
    scope = "all"
  ) {
    phaseReviewUndoHistory =
      [];

    phaseReviewUpdateUndoButton();

    if (
      scope
        === PHASE_REVIEW_TILE_SCOPE
    ) {
      void phaseReviewStartTileMode();
      return;
    }

    phaseReviewTileState.active =
      false;

    phaseReviewRenderStandardUi();

    return phaseReviewTilesBaseStartReview(
      scope
    );
  };


// ------------------------------------------------------------------------
// Review Undo for standard single-annotation Review.
// ------------------------------------------------------------------------

const phaseReviewTilesBaseApplyDecision =
  applyReviewDecision;

applyReviewDecision =
  function phaseReviewUndoApplyDecision(
    decision
  ) {
    if (
      reviewState.active
      && !phaseReviewTileState
        .active
    ) {
      phaseReviewPushUndo(
        (
          `Decision: ${
            String(
              decision
            )
          }`
        )
      );
    }

    return phaseReviewTilesBaseApplyDecision(
      decision
    );
  };


const phaseReviewTilesBaseAssignClass =
  assignReviewFeatureClass;

assignReviewFeatureClass =
  function phaseReviewUndoAssignClass(
    className
  ) {
    if (
      reviewState.active
      && !phaseReviewTileState
        .active
    ) {
      const feature =
        currentReviewFeature();

      const previous =
        feature
          ? getFeatureClassName(
              feature
            )
          : "";

      if (
        previous
        && previous !== className
      ) {
        phaseReviewPushUndo(
          (
            `Class ${
              previous
            } → ${
              className
            }`
          )
        );
      }
    }

    return phaseReviewTilesBaseAssignClass(
      className
    );
  };


// ------------------------------------------------------------------------
// Tile Review drawing: show every annotation in the current tile.
// ------------------------------------------------------------------------

const phaseReviewTilesBaseDrawGeometry =
  drawGeometry;

drawGeometry =
  function phaseReviewTilesDrawGeometry(
    feature
  ) {
    if (
      phaseReviewTileState.active
      && !phaseReviewTileFeatureInTile(
        feature
      )
    ) {
      return;
    }

    return phaseReviewTilesBaseDrawGeometry(
      feature
    );
  };


const phaseReviewTilesBaseDrawAnnotations =
  phaseF13DrawAnnotationsBase;

phaseF13DrawAnnotationsBase =
  function phaseReviewTilesDrawAnnotations(
    ...args
  ) {
    if (
      !phaseReviewTileState.active
    ) {
      return phaseReviewTilesBaseDrawAnnotations(
        ...args
      );
    }

    const wasReviewActive =
      reviewState.active;

    // The base Review renderer normally isolates currentId.
    // Tile Review deliberately shows all colored annotations in the tile.
    reviewState.active =
      false;

    try {
      return phaseReviewTilesBaseDrawAnnotations(
        ...args
      );

    } finally {
      reviewState.active =
        wasReviewActive;

      phaseReviewTileDrawBoundary();
    }
  };


// Restrict Select hit-testing to annotations actually visible in the tile.
const phaseReviewTilesBaseHitTest =
  hitTest;

hitTest =
  function phaseReviewTilesHitTest(
    point
  ) {
    const id =
      phaseReviewTilesBaseHitTest(
        point
      );

    if (
      !phaseReviewTileState.active
      || !id
    ) {
      return id;
    }

    const feature =
      findFeature(
        id
      );

    return (
      feature
      && phaseReviewTileFeatureInTile(
        feature
      )
    )
      ? id
      : null;
  };


// In Tile Review, a normal Select tap toggles membership in the
// multi-selection instead of replacing the whole selection.
const phaseReviewTilesBaseSetSingleSelection =
  setSingleSelection;

setSingleSelection =
  function phaseReviewTilesSetSingleSelection(
    id,
    implicit = false
  ) {
    if (
      phaseReviewTileState.active
      && mode === "select"
      && id
      && !implicit
    ) {
      const feature =
        findFeature(
          id
        );

      if (
        !feature
        || !phaseReviewTileFeatureInTile(
          feature
        )
      ) {
        return;
      }

      const next =
        new Set(
          selectedIds
        );

      const key =
        String(
          id
        );

      if (
        next.has(
          key
        )
      ) {
        next.delete(
          key
        );

      } else {
        next.add(
          key
        );
      }

      setMultiSelection(
        [
          ...next
        ],
        key
      );

      updateControls();
      drawAnnotations();
      phaseReviewRenderTilePanel();

      return;
    }

    return phaseReviewTilesBaseSetSingleSelection(
      id,
      implicit
    );
  };


// ------------------------------------------------------------------------
// Exit cleanup.
// ------------------------------------------------------------------------

const phaseReviewTilesBaseExitReview =
  exitReviewMode;

exitReviewMode =
  function phaseReviewTilesExitReview() {
    phaseReviewTileState.active =
      false;

    phaseReviewUndoHistory =
      [];

    phaseReviewRenderStandardUi();
    phaseReviewUpdateUndoButton();

    return phaseReviewTilesBaseExitReview();
  };


phaseReviewEnsureUndoUi();
phaseReviewEnsureTileSetupUi();
phaseReviewEnsureTilePanel();

els.reviewScopeSelect
  ?.addEventListener(
    "change",
    phaseReviewTileSetupVisible
  );

// ========================================================================
// Tile Review session persistence v1
//
// Local/browser-only workflow state. This does not alter annotation geometry,
// scientific metrics, ROI geometry, or level-0 coordinates.
//
// Stored per image/document + tile size + effective ROI signature:
//   - current tile
//   - reviewed tile ids
//
// On re-entering "By tiles..." the user can resume the previous location or
// start from Tile 1. Starting from Tile 1 intentionally keeps annotation
// reviewStatus values already saved in the document.
// ========================================================================

const PHASE_REVIEW_TILE_SESSION_STORAGE_VERSION =
  1;

const PHASE_REVIEW_TILE_SESSION_STORAGE_PREFIX =
  "histoannotator:tile-review-session:v1:";


function phaseReviewTileSessionHash(
  value
) {
  const text =
    String(
      value
      || ""
    );

  let hash =
    2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^=
      text.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return (
    hash >>> 0
  ).toString(16);
}


function phaseReviewTileSessionImageIdentity() {
  const image =
    currentImage
    || {};

  const info =
    currentInfo
    || {};

  const primary =
    image.id
    ?? image.imageId
    ?? image.path
    ?? image.url
    ?? image.src
    ?? image.name
    ?? image.filename
    ?? info.id
    ?? info.imageId
    ?? info.path
    ?? info.name
    ?? "";

  const parts = [
    String(primary || ""),
    String(
      info.width
      ?? ""
    ),
    String(
      info.height
      ?? ""
    ),
    String(
      image.localNative
        ? "local"
        : "remote"
    ),
  ];

  return parts.join("|");
}


function phaseReviewTileSessionEffectiveRoiSignature() {
  const roiPayload =
    (
      featureCollection.features
      || []
    )
      .filter(
        (feature) =>
          typeof phaseDIsTissueRoi
            === "function"
          && phaseDIsTissueRoi(
            feature
          )
      )
      .map(
        (roi) => {
          const effective =
            typeof phaseDEffectivePreviewForRoi
              === "function"
              ? phaseDEffectivePreviewForRoi(
                  roi
                )
              : null;

          return {
            id:
              String(
                featureId(
                  roi
                )
                || ""
              ),

            geometry:
              effective?.geometry
              || roi.geometry
              || null,
          };
        }
      );

  return phaseReviewTileSessionHash(
    JSON.stringify(
      roiPayload
    )
  );
}


function phaseReviewTileSessionStorageKey() {
  const identity =
    phaseReviewTileSessionImageIdentity();

  if (!identity) {
    return null;
  }

  return (
    PHASE_REVIEW_TILE_SESSION_STORAGE_PREFIX
    + phaseReviewTileSessionHash(
        identity
      )
  );
}


function phaseReviewTileSessionRead() {
  const key =
    phaseReviewTileSessionStorageKey();

  if (!key) {
    return null;
  }

  try {
    const payload =
      JSON.parse(
        localStorage.getItem(
          key
        )
        || "null"
      );

    if (
      !payload
      || Number(
        payload.version
      )
        !== PHASE_REVIEW_TILE_SESSION_STORAGE_VERSION
    ) {
      return null;
    }

    return payload;

  } catch (error) {
    console.warn(
      "Could not read Tile Review session",
      error
    );

    return null;
  }
}


function phaseReviewTileSessionClear() {
  const key =
    phaseReviewTileSessionStorageKey();

  if (!key) {
    return;
  }

  try {
    localStorage.removeItem(
      key
    );
  } catch (error) {
    console.warn(
      "Could not clear Tile Review session",
      error
    );
  }
}


function phaseReviewTileSessionWrite() {
  if (
    !phaseReviewTileState.active
    || !phaseReviewTileState
      .tiles.length
  ) {
    return;
  }

  const key =
    phaseReviewTileSessionStorageKey();

  if (!key) {
    return;
  }

  const currentTile =
    phaseReviewTileCurrent();

  const payload = {
    version:
      PHASE_REVIEW_TILE_SESSION_STORAGE_VERSION,

    savedAt:
      Date.now(),

    imageIdentity:
      phaseReviewTileSessionImageIdentity(),

    roiSignature:
      phaseReviewTileSessionEffectiveRoiSignature(),

    tileSizePx:
      Number(
        phaseReviewTileState
          .tileSizePx
        || 0
      ),

    tileLabel:
      String(
        phaseReviewTileState
          .tileLabel
        || ""
      ),

    tileCount:
      phaseReviewTileState
        .tiles.length,

    currentIndex:
      Number(
        phaseReviewTileState
          .currentIndex
        || 0
      ),

    currentTileId:
      String(
        currentTile?.id
        || ""
      ),

    reviewedTileIds: [
      ...phaseReviewTileState
        .reviewedTileIds
    ].map(String),
  };

  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        payload
      )
    );

  } catch (error) {
    console.warn(
      "Could not persist Tile Review session",
      error
    );
  }
}


function phaseReviewTileSessionMatchesCurrentGrid(
  saved
) {
  if (
    !saved
    || !phaseReviewTileState
      .tiles.length
  ) {
    return false;
  }

  const currentTileSize =
    Number(
      phaseReviewTileState
        .tileSizePx
      || 0
    );

  const savedTileSize =
    Number(
      saved.tileSizePx
      || 0
    );

  const sizeTolerance =
    Math.max(
      0.01,
      Math.abs(
        currentTileSize
      )
      * 1e-6
    );

  return (
    String(
      saved.imageIdentity
      || ""
    )
      === phaseReviewTileSessionImageIdentity()
    && String(
      saved.roiSignature
      || ""
    )
      === phaseReviewTileSessionEffectiveRoiSignature()
    && Number(
      saved.tileCount
    )
      === phaseReviewTileState
        .tiles.length
    && Math.abs(
      savedTileSize
      - currentTileSize
    )
      <= sizeTolerance
  );
}


function phaseReviewTileSessionRestore(
  saved
) {
  if (
    !phaseReviewTileSessionMatchesCurrentGrid(
      saved
    )
  ) {
    return false;
  }

  const savedTileId =
    String(
      saved.currentTileId
      || ""
    );

  let index =
    -1;

  if (savedTileId) {
    index =
      phaseReviewTileState
        .tiles
        .findIndex(
          (tile) =>
            String(
              tile?.id
              || ""
            )
              === savedTileId
        );
  }

  if (index < 0) {
    index =
      Math.max(
        0,
        Math.min(
          phaseReviewTileState
            .tiles.length
            - 1,
          Number(
            saved.currentIndex
          )
          || 0
        )
      );
  }

  phaseReviewTileState.currentIndex =
    index;

  phaseReviewTileState.reviewedTileIds =
    new Set(
      (
        saved.reviewedTileIds
        || []
      ).map(String)
    );

  clearSelectedFeatures(
    false
  );

  phaseReviewRenderTilePanel();
  phaseReviewZoomToCurrentTile();

  return true;
}


function phaseReviewTileSessionOfferResume() {
  const saved =
    phaseReviewTileSessionRead();

  if (
    !phaseReviewTileSessionMatchesCurrentGrid(
      saved
    )
  ) {
    if (saved) {
      phaseReviewTileSessionClear();
    }

    phaseReviewTileSessionWrite();
    return;
  }

  const savedIndex =
    Math.max(
      0,
      Math.min(
        phaseReviewTileState
          .tiles.length
          - 1,
        Number(
          saved.currentIndex
        )
        || 0
      )
    );

  const reviewedCount =
    Array.isArray(
      saved.reviewedTileIds
    )
      ? saved.reviewedTileIds.length
      : 0;

  const hasProgress =
    savedIndex > 0
    || reviewedCount > 0;

  if (!hasProgress) {
    phaseReviewTileSessionWrite();
    return;
  }

  const resume =
    window.confirm(
      (
        `Resume previous Tile Review at Tile ${
          savedIndex + 1
        } / ${
          phaseReviewTileState.tiles.length
        }?\n\n`
        + `Reviewed tiles saved: ${reviewedCount}\n\n`
        + "OK = Resume\n"
        + "Cancel = Start from Tile 1 "
        + "(keeps accepted annotation statuses)"
      )
    );

  if (resume) {
    const restored =
      phaseReviewTileSessionRestore(
        saved
      );

    if (restored) {
      setStatus(
        (
          `Resumed Tile Review at Tile ${
            phaseReviewTileState
              .currentIndex + 1
          }`
        ),
        "saved"
      );
    }

    phaseReviewTileSessionWrite();
    return;
  }

  phaseReviewTileState.currentIndex =
    0;

  phaseReviewTileState.reviewedTileIds =
    new Set();

  clearSelectedFeatures(
    false
  );

  phaseReviewRenderTilePanel();
  phaseReviewZoomToCurrentTile();
  phaseReviewTileSessionWrite();

  setStatus(
    (
      "Started Tile Review from Tile 1. "
      + "Previously accepted annotation statuses were kept."
    ),
    "local"
  );
}


const phaseReviewTileSessionBaseMoveTile =
  phaseReviewMoveTile;

phaseReviewMoveTile =
  function phaseReviewTileSessionMoveTile(
    ...args
  ) {
    const result =
      phaseReviewTileSessionBaseMoveTile(
        ...args
      );

    phaseReviewTileSessionWrite();

    return result;
  };


const phaseReviewTileSessionBaseAcceptSelected =
  phaseReviewAcceptSelectedTile;

phaseReviewAcceptSelectedTile =
  function phaseReviewTileSessionAcceptSelected(
    ...args
  ) {
    const result =
      phaseReviewTileSessionBaseAcceptSelected(
        ...args
      );

    phaseReviewTileSessionWrite();

    return result;
  };


const phaseReviewTileSessionBaseAcceptAll =
  phaseReviewAcceptAllTile;

phaseReviewAcceptAllTile =
  function phaseReviewTileSessionAcceptAll(
    ...args
  ) {
    const result =
      phaseReviewTileSessionBaseAcceptAll(
        ...args
      );

    phaseReviewTileSessionWrite();

    return result;
  };


const phaseReviewTileSessionBaseUndoAction =
  phaseReviewUndoAction;

phaseReviewUndoAction =
  function phaseReviewTileSessionUndoAction(
    ...args
  ) {
    const result =
      phaseReviewTileSessionBaseUndoAction(
        ...args
      );

    phaseReviewTileSessionWrite();

    return result;
  };


const phaseReviewTileSessionBaseStartTileMode =
  phaseReviewStartTileMode;

phaseReviewStartTileMode =
  async function phaseReviewTileSessionStartTileMode(
    ...args
  ) {
    const result =
      await phaseReviewTileSessionBaseStartTileMode(
        ...args
      );

    if (
      phaseReviewTileState.active
      && phaseReviewTileState
        .tiles.length
    ) {
      phaseReviewTileSessionOfferResume();
    }

    return result;
  };


if (
  typeof window
  !== "undefined"
) {
  window.addEventListener(
    "beforeunload",
    phaseReviewTileSessionWrite
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState
          === "hidden"
      ) {
        phaseReviewTileSessionWrite();
      }
    }
  );

  window.__histoannotatorTileReviewSession = {
    read:
      phaseReviewTileSessionRead,

    save:
      phaseReviewTileSessionWrite,

    clear:
      phaseReviewTileSessionClear,
  };
}

