// ========================================================================
// Reference Evaluation — Visual Review v1
//
// Scientific geometry is computed by the same mapped-union backend used for
// Dice. This module only renders exact returned level-0 geometries.
// ========================================================================

let phaseEvalVisualData = null;
let phaseEvalVisualRegionIndex = -1;
let phaseEvalVisualViewerHandlersBound = false;
let phaseEvalVisualPreviousAnnotationVisibility = "";
let phaseEvalVisualLoadingSequence = 0;

const PHASE_EVAL_VISUAL_DEFAULTS = {
  agreement: true,
  candidate_only: true,
  reference_only: true,
  wrong_class: true,
};


function phaseEvalVisualEnsureUi() {
  const refs = phaseEvalRefs();

  if (
    !document.getElementById(
      "phaseEvalVisualReviewButton"
    )
    && refs.exportCsv
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.id =
      "phaseEvalVisualReviewButton";

    button.type =
      "button";

    button.textContent =
      "Visual review";

    button.disabled =
      true;

    button.addEventListener(
      "click",
      () => {
        void phaseEvalVisualOpen();
      }
    );

    refs.exportCsv.insertAdjacentElement(
      "afterend",
      button
    );
  }

  const shell =
    document.querySelector(
      ".viewer-shell"
    );

  if (
    shell
    && !document.getElementById(
      "phaseEvalVisualCanvas"
    )
  ) {
    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.id =
      "phaseEvalVisualCanvas";

    canvas.className =
      "phase-eval-visual-canvas";

    canvas.hidden =
      true;

    shell.append(
      canvas
    );
  }

  if (
    shell
    && !document.getElementById(
      "phaseEvalVisualDock"
    )
  ) {
    const dock =
      document.createElement(
        "section"
      );

    dock.id =
      "phaseEvalVisualDock";

    dock.className =
      "phase-eval-visual-dock";

    dock.hidden =
      true;

    dock.innerHTML = `
      <div class="phase-eval-visual-header">
        <div>
          <strong>Visual evaluation</strong>
          <small id="phaseEvalVisualPair"></small>
        </div>

        <div class="phase-eval-visual-header-actions">
          <button id="phaseEvalVisualMetricsButton"
                  type="button">
            Metrics
          </button>

          <button id="phaseEvalVisualCloseButton"
                  type="button">
            Close
          </button>
        </div>
      </div>

      <label class="phase-eval-visual-class-field">
        <span>Evaluation class</span>
        <select id="phaseEvalVisualClass"></select>
      </label>

      <div class="phase-eval-visual-legend">
        <label>
          <input type="checkbox"
                 data-eval-visual-layer="agreement"
                 checked>
          <span class="phase-eval-visual-dot agreement"></span>
          Agreement
        </label>

        <label>
          <input type="checkbox"
                 data-eval-visual-layer="candidate_only"
                 checked>
          <span class="phase-eval-visual-dot candidate-only"></span>
          Candidate only
        </label>

        <label>
          <input type="checkbox"
                 data-eval-visual-layer="reference_only"
                 checked>
          <span class="phase-eval-visual-dot reference-only"></span>
          Reference only
        </label>

        <label>
          <input type="checkbox"
                 data-eval-visual-layer="wrong_class"
                 checked>
          <span class="phase-eval-visual-dot wrong-class"></span>
          Wrong class
        </label>
      </div>

      <label class="phase-eval-visual-opacity">
        <span>
          Overlay opacity
          <output id="phaseEvalVisualOpacityValue">42%</output>
        </span>

        <input id="phaseEvalVisualOpacity"
               type="range"
               min="10"
               max="85"
               step="5"
               value="42">
      </label>

      <div id="phaseEvalVisualSummary"
           class="phase-eval-visual-summary">
        Choose a class.
      </div>

      <div class="phase-eval-visual-nav">
        <button id="phaseEvalVisualPrevButton"
                type="button">
          ← Previous error
        </button>

        <button id="phaseEvalVisualNextButton"
                type="button">
          Next error →
        </button>
      </div>

      <div id="phaseEvalVisualRegion"
           class="phase-eval-visual-region">
        No error region selected.
      </div>

      <div id="phaseEvalVisualStatus"
           class="phase-eval-visual-status">
      </div>
    `;

    shell.append(
      dock
    );

    document.getElementById(
      "phaseEvalVisualCloseButton"
    )?.addEventListener(
      "click",
      phaseEvalVisualClose
    );

    document.getElementById(
      "phaseEvalVisualMetricsButton"
    )?.addEventListener(
      "click",
      phaseEvalVisualBackToMetrics
    );

    document.getElementById(
      "phaseEvalVisualClass"
    )?.addEventListener(
      "change",
      () => {
        void phaseEvalVisualLoadClass();
      }
    );

    document.getElementById(
      "phaseEvalVisualOpacity"
    )?.addEventListener(
      "input",
      phaseEvalVisualOpacityChanged
    );

    document.getElementById(
      "phaseEvalVisualPrevButton"
    )?.addEventListener(
      "click",
      () => {
        phaseEvalVisualStepRegion(
          -1
        );
      }
    );

    document.getElementById(
      "phaseEvalVisualNextButton"
    )?.addEventListener(
      "click",
      () => {
        phaseEvalVisualStepRegion(
          1
        );
      }
    );

    for (
      const input
      of dock.querySelectorAll(
        "[data-eval-visual-layer]"
      )
    ) {
      input.addEventListener(
        "change",
        phaseEvalVisualDraw
      );
    }
  }
}


function phaseEvalVisualSetStatus(
  message,
  error = false
) {
  const element =
    document.getElementById(
      "phaseEvalVisualStatus"
    );

  if (!element) {
    return;
  }

  element.textContent =
    String(
      message
      || ""
    );

  element.classList.toggle(
    "error",
    Boolean(error)
  );
}


function phaseEvalVisualAvailableRows() {
  return Array.isArray(
    phaseEvalLastResult?.rows
  )
    ? phaseEvalLastResult.rows
    : [];
}


function phaseEvalVisualPopulateClasses() {
  const select =
    document.getElementById(
      "phaseEvalVisualClass"
    );

  if (!select) {
    return;
  }

  const rows =
    [...phaseEvalVisualAvailableRows()]
      .sort(
        (left, right) => {
          const leftDice =
            Number(
              left?.dice
            );

          const rightDice =
            Number(
              right?.dice
            );

          if (
            Number.isFinite(leftDice)
            && Number.isFinite(rightDice)
          ) {
            return leftDice - rightDice;
          }

          return String(
            left?.className
            || ""
          ).localeCompare(
            String(
              right?.className
              || ""
            )
          );
        }
      );

  select.innerHTML =
    "";

  for (
    const row
    of rows
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      String(
        row.className
        || ""
      );

    option.textContent =
      (
        `${row.className}`
        + ` · Dice ${phaseEvalFormatMetric(row.dice)}`
      );

    select.append(
      option
    );
  }
}


function phaseEvalVisualCurrentClass() {
  return String(
    document.getElementById(
      "phaseEvalVisualClass"
    )?.value
    || ""
  ).trim();
}


function phaseEvalVisualLayerEnabled(
  layerId
) {
  const input =
    document.querySelector(
      `[data-eval-visual-layer="${layerId}"]`
    );

  return Boolean(
    input?.checked
  );
}


function phaseEvalVisualOpacityChanged() {
  const slider =
    document.getElementById(
      "phaseEvalVisualOpacity"
    );

  const output =
    document.getElementById(
      "phaseEvalVisualOpacityValue"
    );

  const value =
    Math.max(
      10,
      Math.min(
        85,
        Number(
          slider?.value
          || 42
        )
      )
    );

  if (output) {
    output.textContent =
      `${Math.round(value)}%`;
  }

  phaseEvalVisualDraw();
}


function phaseEvalVisualCanvasContext() {
  const canvas =
    document.getElementById(
      "phaseEvalVisualCanvas"
    );

  if (!canvas) {
    return null;
  }

  const shell =
    document.querySelector(
      ".viewer-shell"
    );

  if (!shell) {
    return null;
  }

  const width =
    Math.max(
      1,
      shell.clientWidth
    );

  const height =
    Math.max(
      1,
      shell.clientHeight
    );

  const ratio =
    Math.max(
      1,
      Number(
        window.devicePixelRatio
        || 1
      )
    );

  const targetWidth =
    Math.round(
      width * ratio
    );

  const targetHeight =
    Math.round(
      height * ratio
    );

  if (
    canvas.width
      !== targetWidth
    || canvas.height
      !== targetHeight
  ) {
    canvas.width =
      targetWidth;

    canvas.height =
      targetHeight;

    canvas.style.width =
      `${width}px`;

    canvas.style.height =
      `${height}px`;
  }

  const context =
    canvas.getContext(
      "2d"
    );

  context.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );

  context.clearRect(
    0,
    0,
    width,
    height
  );

  return {
    canvas,
    context,
    width,
    height,
  };
}


function phaseEvalVisualPathRing(
  context,
  ring
) {
  if (
    !Array.isArray(
      ring
    )
    || ring.length < 2
  ) {
    return false;
  }

  let started =
    false;

  for (
    const point
    of ring
  ) {
    if (
      !Array.isArray(
        point
      )
      || point.length < 2
    ) {
      continue;
    }

    const screen =
      screenPointFromImage(
        point
      );

    if (!screen) {
      continue;
    }

    if (!started) {
      context.moveTo(
        screen.x,
        screen.y
      );

      started =
        true;

    } else {
      context.lineTo(
        screen.x,
        screen.y
      );
    }
  }

  if (started) {
    context.closePath();
  }

  return started;
}


function phaseEvalVisualGeometryPath(
  context,
  geometry
) {
  if (
    !geometry
    || typeof geometry
      !== "object"
  ) {
    return false;
  }

  let drawn =
    false;

  if (
    geometry.type
      === "Polygon"
  ) {
    for (
      const ring
      of geometry.coordinates
        || []
    ) {
      drawn =
        phaseEvalVisualPathRing(
          context,
          ring
        )
        || drawn;
    }

    return drawn;
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
      for (
        const ring
        of polygon
        || []
      ) {
        drawn =
          phaseEvalVisualPathRing(
            context,
            ring
          )
          || drawn;
      }
    }

    return drawn;
  }

  if (
    geometry.type
      === "GeometryCollection"
  ) {
    for (
      const child
      of geometry.geometries
        || []
    ) {
      drawn =
        phaseEvalVisualGeometryPath(
          context,
          child
        )
        || drawn;
    }
  }

  return drawn;
}


function phaseEvalVisualDrawLayer(
  context,
  layer,
  opacity
) {
  if (
    !layer?.geometry
    || !phaseEvalVisualLayerEnabled(
      layer.id
    )
  ) {
    return;
  }

  context.save();

  context.beginPath();

  const hasPath =
    phaseEvalVisualGeometryPath(
      context,
      layer.geometry
    );

  if (hasPath) {
    context.globalAlpha =
      opacity;

    context.fillStyle =
      String(
        layer.color
        || "#ffffff"
      );

    try {
      context.fill(
        "evenodd"
      );
    } catch (_) {
      context.fill();
    }

    context.globalAlpha =
      Math.min(
        1,
        opacity + 0.28
      );

    context.strokeStyle =
      String(
        layer.color
        || "#ffffff"
      );

    context.lineWidth =
      1.5;

    context.stroke();
  }

  context.restore();
}


function phaseEvalVisualDraw() {
  const frame =
    phaseEvalVisualCanvasContext();

  if (!frame) {
    return;
  }

  if (
    !phaseEvalVisualData
  ) {
    return;
  }

  const slider =
    document.getElementById(
      "phaseEvalVisualOpacity"
    );

  const opacity =
    Math.max(
      0.1,
      Math.min(
        0.85,
        Number(
          slider?.value
          || 42
        ) / 100
      )
    );

  const layers =
    Array.isArray(
      phaseEvalVisualData.layers
    )
      ? phaseEvalVisualData.layers
      : [];

  // Wrong-class is last so orange remains visible over red/blue.
  const order = [
    "reference_only",
    "candidate_only",
    "agreement",
    "wrong_class",
  ];

  for (
    const layerId
    of order
  ) {
    const layer =
      layers.find(
        (item) =>
          item.id
          === layerId
      );

    if (layer) {
      phaseEvalVisualDrawLayer(
        frame.context,
        layer,
        opacity
      );
    }
  }
}


function phaseEvalVisualArea(
  value
) {
  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? `${formatStatNumber(number, 2)} px²`
    : "—";
}


function phaseEvalVisualRenderSummary() {
  const summary =
    document.getElementById(
      "phaseEvalVisualSummary"
    );

  if (!summary) {
    return;
  }

  const data =
    phaseEvalVisualData;

  if (!data) {
    summary.textContent =
      "No visual comparison loaded.";

    return;
  }

  const layerById =
    new Map(
      (
        data.layers
        || []
      ).map(
        (layer) => [
          layer.id,
          layer,
        ]
      )
    );

  const agreement =
    layerById.get(
      "agreement"
    );

  const candidateOnly =
    layerById.get(
      "candidate_only"
    );

  const referenceOnly =
    layerById.get(
      "reference_only"
    );

  const wrongClass =
    layerById.get(
      "wrong_class"
    );

  summary.innerHTML = `
    <div>
      <span>Class</span>
      <strong>${escapeHtml(String(data.targetClass || ""))}</strong>
    </div>
    <div>
      <span>Agreement</span>
      <strong>${phaseEvalVisualArea(agreement?.areaPx2)}</strong>
    </div>
    <div>
      <span>Candidate only</span>
      <strong>${phaseEvalVisualArea(candidateOnly?.areaPx2)}</strong>
    </div>
    <div>
      <span>Reference only</span>
      <strong>${phaseEvalVisualArea(referenceOnly?.areaPx2)}</strong>
    </div>
    <div>
      <span>Wrong class</span>
      <strong>${phaseEvalVisualArea(wrongClass?.areaPx2)}</strong>
    </div>
  `;

  const regions =
    Array.isArray(
      data.regions
    )
      ? data.regions
      : [];

  const prev =
    document.getElementById(
      "phaseEvalVisualPrevButton"
    );

  const next =
    document.getElementById(
      "phaseEvalVisualNextButton"
    );

  if (prev) {
    prev.disabled =
      !regions.length;
  }

  if (next) {
    next.disabled =
      !regions.length;
  }
}


function phaseEvalVisualRegionLabel(
  region
) {
  if (!region) {
    return "No error region selected.";
  }

  const candidate =
    region.candidateClass
      ? String(
          region.candidateClass
        )
      : "none";

  const reference =
    region.referenceClass
      ? String(
          region.referenceClass
        )
      : "none";

  let kind =
    "Error";

  if (
    region.kind
      === "wrong_class"
  ) {
    kind =
      "Wrong class";

  } else if (
    region.kind
      === "candidate_only"
  ) {
    kind =
      "Candidate only / false positive";

  } else if (
    region.kind
      === "reference_only"
  ) {
    kind =
      "Reference only / false negative";
  }

  return (
    `${kind}`
    + ` · Candidate: ${candidate}`
    + ` · Reference: ${reference}`
    + ` · ${phaseEvalVisualArea(region.areaPx2)}`
  );
}


function phaseEvalVisualRenderRegion() {
  const element =
    document.getElementById(
      "phaseEvalVisualRegion"
    );

  if (!element) {
    return;
  }

  const regions =
    Array.isArray(
      phaseEvalVisualData?.regions
    )
      ? phaseEvalVisualData.regions
      : [];

  if (
    phaseEvalVisualRegionIndex < 0
    || phaseEvalVisualRegionIndex
      >= regions.length
  ) {
    element.textContent =
      regions.length
        ? (
            `${regions.length} navigable error region(s). `
            + "Use Next error to inspect them."
          )
        : "No error regions for this class.";

    return;
  }

  const region =
    regions[
      phaseEvalVisualRegionIndex
    ];

  element.innerHTML = `
    <strong>
      Error ${phaseEvalVisualRegionIndex + 1}
      / ${regions.length}
    </strong>
    <span>
      ${escapeHtml(
        phaseEvalVisualRegionLabel(
          region
        )
      )}
    </span>
  `;
}


function phaseEvalVisualZoomRegion(
  region
) {
  const bbox =
    region?.bbox;

  if (
    !Array.isArray(
      bbox
    )
    || bbox.length < 4
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

  const minX =
    Number(
      bbox[0]
    );

  const minY =
    Number(
      bbox[1]
    );

  const maxX =
    Number(
      bbox[2]
    );

  const maxY =
    Number(
      bbox[3]
    );

  if (
    ![
      minX,
      minY,
      maxX,
      maxY,
    ].every(
      Number.isFinite
    )
  ) {
    return;
  }

  const width =
    Math.max(
      1,
      maxX - minX
    );

  const height =
    Math.max(
      1,
      maxY - minY
    );

  const padX =
    Math.max(
      20,
      width * 0.35
    );

  const padY =
    Math.max(
      20,
      height * 0.35
    );

  try {
    const topLeft =
      item.imageToViewportCoordinates(
        minX - padX,
        minY - padY
      );

    const bottomRight =
      item.imageToViewportCoordinates(
        maxX + padX,
        maxY + padY
      );

    const rect =
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
      );

    viewer.viewport.fitBounds(
      rect,
      true
    );

  } catch (error) {
    console.warn(
      "Could not zoom to evaluation error region",
      error
    );
  }
}


function phaseEvalVisualStepRegion(
  delta
) {
  const regions =
    Array.isArray(
      phaseEvalVisualData?.regions
    )
      ? phaseEvalVisualData.regions
      : [];

  if (!regions.length) {
    phaseEvalVisualRegionIndex =
      -1;

    phaseEvalVisualRenderRegion();

    return;
  }

  phaseEvalVisualRegionIndex =
    (
      phaseEvalVisualRegionIndex
      + delta
      + regions.length
    ) % regions.length;

  const region =
    regions[
      phaseEvalVisualRegionIndex
    ];

  phaseEvalVisualRenderRegion();
  phaseEvalVisualZoomRegion(
    region
  );
}


function phaseEvalVisualBindViewer() {
  if (
    phaseEvalVisualViewerHandlersBound
    || !viewer?.addHandler
  ) {
    return;
  }

  viewer.addHandler(
    "animation",
    phaseEvalVisualDraw
  );

  viewer.addHandler(
    "resize",
    phaseEvalVisualDraw
  );

  viewer.addHandler(
    "open",
    phaseEvalVisualDraw
  );

  phaseEvalVisualViewerHandlersBound =
    true;

  window.addEventListener(
    "resize",
    phaseEvalVisualDraw
  );
}


function phaseEvalVisualUnbindViewer() {
  if (
    !phaseEvalVisualViewerHandlersBound
  ) {
    return;
  }

  if (
    viewer?.removeHandler
  ) {
    viewer.removeHandler(
      "animation",
      phaseEvalVisualDraw
    );

    viewer.removeHandler(
      "resize",
      phaseEvalVisualDraw
    );

    viewer.removeHandler(
      "open",
      phaseEvalVisualDraw
    );
  }

  window.removeEventListener(
    "resize",
    phaseEvalVisualDraw
  );

  phaseEvalVisualViewerHandlersBound =
    false;
}


async function phaseEvalVisualLoadClass() {
  const targetClass =
    phaseEvalVisualCurrentClass();

  const result =
    phaseEvalLastResult;

  if (
    !targetClass
    || !result
    || !currentImage
  ) {
    return;
  }

  const sequence =
    ++phaseEvalVisualLoadingSequence;

  phaseEvalVisualSetStatus(
    `Calculating spatial review for ${targetClass}…`
  );

  try {
    const response =
      await apiFetch(
        `${API}/annotations/${currentImage.id}/evaluation-visual`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              candidateFile:
                result.candidateFile,

              referenceFile:
                result.referenceFile,

              candidateMapping:
                result.mapping
                  ?.candidateMapping
                || {},

              referenceMapping:
                result.mapping
                  ?.referenceMapping
                || {},

              targetClass,

              maxRegions:
                500,
            }),

          timeoutMs:
            180000,
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

    if (
      sequence
      !== phaseEvalVisualLoadingSequence
    ) {
      return;
    }

    phaseEvalVisualData =
      payload;

    phaseEvalVisualRegionIndex =
      -1;

    phaseEvalVisualRenderSummary();
    phaseEvalVisualRenderRegion();
    phaseEvalVisualDraw();

    const regionNote =
      payload.regionsTruncated
        ? (
            ` Showing largest ${payload.regions?.length || 0}`
            + ` of ${payload.regionCount || 0} regions.`
          )
        : (
            ` ${payload.regionCount || 0} error region(s).`
          );

    phaseEvalVisualSetStatus(
      `Visual review ready.${regionNote}`
    );

  } catch (error) {
    phaseEvalVisualData =
      null;

    phaseEvalVisualRegionIndex =
      -1;

    phaseEvalVisualDraw();
    phaseEvalVisualRenderSummary();
    phaseEvalVisualRenderRegion();

    phaseEvalVisualSetStatus(
      `Visual review failed: ${error.message}`,
      true
    );
  }
}


async function phaseEvalVisualOpen() {
  phaseEvalVisualEnsureUi();

  const rows =
    phaseEvalVisualAvailableRows();

  if (
    !phaseEvalLastResult
    || !rows.length
  ) {
    phaseEvalSetStatus(
      "Calculate Dice before opening Visual review.",
      "error"
    );

    return;
  }

  const evalOverlay =
    document.getElementById(
      "referenceEvaluationModal"
    );

  if (evalOverlay) {
    evalOverlay.hidden =
      true;
  }

  const canvas =
    document.getElementById(
      "phaseEvalVisualCanvas"
    );

  const dock =
    document.getElementById(
      "phaseEvalVisualDock"
    );

  if (canvas) {
    canvas.hidden =
      false;
  }

  if (dock) {
    dock.hidden =
      false;
  }

  const annotationCanvas =
    document.getElementById(
      "annotationCanvas"
    );

  if (annotationCanvas) {
    phaseEvalVisualPreviousAnnotationVisibility =
      annotationCanvas.style
        .visibility
      || "";

    annotationCanvas.style.visibility =
      "hidden";
  }

  const pair =
    document.getElementById(
      "phaseEvalVisualPair"
    );

  if (pair) {
    pair.textContent =
      (
        `${phaseEvalLastResult.candidateFile}`
        + " vs "
        + `${phaseEvalLastResult.referenceFile}`
      );
  }

  for (
    const [
      layerId,
      checked,
    ]
    of Object.entries(
      PHASE_EVAL_VISUAL_DEFAULTS
    )
  ) {
    const input =
      document.querySelector(
        `[data-eval-visual-layer="${layerId}"]`
      );

    if (input) {
      input.checked =
        checked;
    }
  }

  phaseEvalVisualPopulateClasses();
  phaseEvalVisualBindViewer();

  await phaseEvalVisualLoadClass();
}


function phaseEvalVisualRestoreAnnotations() {
  const annotationCanvas =
    document.getElementById(
      "annotationCanvas"
    );

  if (annotationCanvas) {
    annotationCanvas.style.visibility =
      phaseEvalVisualPreviousAnnotationVisibility;
  }
}


function phaseEvalVisualClose() {
  ++phaseEvalVisualLoadingSequence;

  phaseEvalVisualData =
    null;

  phaseEvalVisualRegionIndex =
    -1;

  const canvas =
    document.getElementById(
      "phaseEvalVisualCanvas"
    );

  const dock =
    document.getElementById(
      "phaseEvalVisualDock"
    );

  if (canvas) {
    canvas.hidden =
      true;

    const context =
      canvas.getContext(
        "2d"
      );

    context?.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  if (dock) {
    dock.hidden =
      true;
  }

  phaseEvalVisualRestoreAnnotations();
  phaseEvalVisualUnbindViewer();
}


function phaseEvalVisualBackToMetrics() {
  phaseEvalVisualClose();

  const evalOverlay =
    document.getElementById(
      "referenceEvaluationModal"
    );

  if (evalOverlay) {
    evalOverlay.hidden =
      false;
  }
}


// Keep the Visual review button synchronized with the existing evaluation.
const phaseEvalVisualBaseRenderResults =
  phaseEvalRenderResults;

phaseEvalRenderResults =
  function phaseEvalVisualRenderResults(
    result
  ) {
    const output =
      phaseEvalVisualBaseRenderResults(
        result
      );

    phaseEvalVisualEnsureUi();

    const button =
      document.getElementById(
        "phaseEvalVisualReviewButton"
      );

    if (button) {
      button.disabled =
        !Array.isArray(
          result?.rows
        )
        || !result.rows.length;
    }

    return output;
  };


const phaseEvalVisualBaseOpen =
  phaseEvalOpen;

phaseEvalOpen =
  async function phaseEvalVisualEvaluationOpen() {
    phaseEvalVisualClose();

    const output =
      await phaseEvalVisualBaseOpen();

    phaseEvalVisualEnsureUi();

    const button =
      document.getElementById(
        "phaseEvalVisualReviewButton"
      );

    if (button) {
      button.disabled =
        true;
    }

    return output;
  };


phaseEvalVisualEnsureUi();

// Reference ROI scope indicator.
function phaseEvalVisualRenderScopeBadge() {
  const dock =
    document.getElementById(
      "phaseEvalVisualDock"
    );

  if (!dock) return;

  let badge =
    document.getElementById(
      "phaseEvalVisualScopeBadge"
    );

  if (!badge) {
    badge =
      document.createElement(
        "div"
      );

    badge.id =
      "phaseEvalVisualScopeBadge";

    badge.className =
      "phase-eval-visual-scope-badge";

    const summary =
      document.getElementById(
        "phaseEvalVisualSummary"
      );

    summary?.insertAdjacentElement(
      "beforebegin",
      badge
    );
  }

  const data =
    phaseEvalVisualData;

  if (
    data?.evaluationRegion
      === "reference-roi"
  ) {
    const area =
      Number(
        data.referenceRoi
          ?.areaPx2
        || 0
      );

    badge.textContent =
      (
        "Evaluation scope: Ground Truth ROI"
        + (
            area > 0
              ? ` · ${formatStatNumber(area, 2)} px²`
              : ""
          )
      );

    badge.hidden =
      false;

  } else {
    badge.textContent =
      "Evaluation scope: full image";

    badge.hidden =
      false;
  }
}


const phaseEvalRoiBaseRenderSummary =
  phaseEvalVisualRenderSummary;

phaseEvalVisualRenderSummary =
  function phaseEvalRoiRenderSummary() {
    const result =
      phaseEvalRoiBaseRenderSummary();

    phaseEvalVisualRenderScopeBadge();

    return result;
  };
