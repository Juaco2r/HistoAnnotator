// ========================================================================
// Visual Review workflow v4
//
// - Eye toggle for the underlying annotation layer.
// - Percentage donut instead of raw px summary cards.
// - Ground Truth target is the fixed review perspective.
// - Tap a mismatch class to show only that class-pair geometry.
// - Individual error card emphasizes Candidate classification + %.
// - Review decision: Candidate error / GT error / Unclear.
// - Decisions persist inside the local evaluation cache.
// ========================================================================

let phaseEvalReviewV4Perspective =
  "referenceTarget";

let phaseEvalReviewV4PairFilter =
  null;


function phaseEvalReviewV4Percent(
  value
) {
  const number =
    Number(
      value
    );

  if (!Number.isFinite(number)) {
    return "0.0%";
  }

  return (
    `${number.toFixed(1)}%`
  );
}


function phaseEvalReviewV4EnsureUi() {
  const dock =
    document.getElementById(
      "phaseEvalVisualDock"
    );

  if (!dock) {
    return;
  }

  const actions =
    dock.querySelector(
      ".phase-eval-visual-header-actions"
    );

  if (
    actions
    && !document.getElementById(
      "phaseEvalReviewAnnotationsButton"
    )
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.id =
      "phaseEvalReviewAnnotationsButton";

    button.type =
      "button";

    button.className =
      "phase-eval-review-eye";

    button.addEventListener(
      "click",
      phaseEvalReviewV4ToggleAnnotations
    );

    actions.prepend(
      button
    );
  }

  const summary =
    document.getElementById(
      "phaseEvalVisualSummary"
    );

  if (
    summary
    && !document.getElementById(
      "phaseEvalReviewReferenceNote"
    )
  ) {
    const note =
      document.createElement(
        "div"
      );

    note.id =
      "phaseEvalReviewReferenceNote";

    note.className =
      "phase-eval-review-reference-note";

    note.textContent =
      "Ground Truth is the fixed reference.";

    summary.insertAdjacentElement(
      "beforebegin",
      note
    );
  }
}


function phaseEvalReviewV4AnnotationCanvas() {
  return document.getElementById(
    "annotationCanvas"
  );
}


function phaseEvalReviewV4AnnotationsVisible() {
  const canvas =
    phaseEvalReviewV4AnnotationCanvas();

  if (!canvas) {
    return false;
  }

  return (
    canvas.style.visibility
      !== "hidden"
  );
}


function phaseEvalReviewV4UpdateEye() {
  const button =
    document.getElementById(
      "phaseEvalReviewAnnotationsButton"
    );

  if (!button) {
    return;
  }

  const visible =
    phaseEvalReviewV4AnnotationsVisible();

  button.textContent =
    visible
      ? "👁 Annotations"
      : "◉ Annotations";

  button.title =
    (
      `${visible ? "Hide" : "Show"} annotation layer`
      + (
          currentAnnotationFile
            ? ` (${currentAnnotationFile})`
            : ""
        )
    );

  button.setAttribute(
    "aria-pressed",
    visible
      ? "true"
      : "false"
  );

  button.classList.toggle(
    "active",
    visible
  );
}


function phaseEvalReviewV4ToggleAnnotations() {
  const canvas =
    phaseEvalReviewV4AnnotationCanvas();

  if (!canvas) {
    return;
  }

  canvas.style.visibility =
    phaseEvalReviewV4AnnotationsVisible()
      ? "hidden"
      : "visible";

  phaseEvalReviewV4UpdateEye();
}


function phaseEvalReviewV4PerspectiveData() {
  return (
    phaseEvalVisualData
      ?.perspectives
      ?.referenceTarget
    || null
  );
}


function phaseEvalReviewV4PairByIndex(
  pairIndex
) {
  return (
    (
      phaseEvalVisualData
        ?.mismatchLayers
      || []
    ).find(
      (item) =>
        Number(
          item.pairIndex
        )
          === Number(
            pairIndex
          )
        && item.direction
          === "reference-target"
    )
    || null
  );
}


function phaseEvalReviewV4SetPairFilter(
  pairIndex
) {
  const pair =
    phaseEvalReviewV4PairByIndex(
      pairIndex
    );

  phaseEvalReviewV4PairFilter =
    pair;

  // Filtering a Wrong class is exploratory:
  // preserve the current WSI viewport and zoom.
  phaseEvalVisualRegionIndex =
    -1;

  phaseEvalVisualRenderRegion();
  phaseEvalReviewV4RenderComposition();
  phaseEvalVisualDraw();
}


function phaseEvalReviewV4ClearPairFilter() {
  phaseEvalReviewV4PairFilter =
    null;

  phaseEvalVisualRegionIndex =
    -1;

  phaseEvalVisualRenderRegion();
  phaseEvalReviewV4RenderComposition();
  phaseEvalVisualDraw();
}


function phaseEvalReviewV4RenderComposition() {
  phaseEvalReviewV4EnsureUi();

  const summary =
    document.getElementById(
      "phaseEvalVisualSummary"
    );

  if (!summary) {
    return;
  }

  const perspective =
    phaseEvalReviewV4PerspectiveData();

  if (!perspective) {
    summary.innerHTML =
      "<div class=\"phase-eval-review-empty\">No percentage composition available.</div>";

    return;
  }

  const correct =
    Number(
      perspective.correctPercent
      || 0
    );

  const wrong =
    Number(
      perspective.wrongClassPercent
      || 0
    );

  const unmatched =
    Number(
      perspective.unmatchedPercent
      || 0
    );

  const correctEnd =
    correct;

  const wrongEnd =
    Math.min(
      100,
      correct + wrong
    );

  const chartBackground =
    (
      `conic-gradient(`
      + `#22c55e 0% ${correctEnd}%, `
      + `#f59e0b ${correctEnd}% ${wrongEnd}%, `
      + `#3b82f6 ${wrongEnd}% 100%)`
    );

  const mismatchRows =
    Array.isArray(
      perspective.mismatchClasses
    )
      ? perspective.mismatchClasses
      : [];

  const mismatchButtons =
    mismatchRows.map(
      (item) => {
        const active =
          Number(
            phaseEvalReviewV4PairFilter
              ?.pairIndex
          )
            === Number(
              item.pairIndex
            );

        return `
          <button type="button"
                  class="phase-eval-review-mismatch-chip${active ? " active" : ""}"
                  data-eval-pair-index="${Number(item.pairIndex)}">
            <strong>${escapeHtml(String(item.className || ""))}</strong>
            <span>${phaseEvalReviewV4Percent(item.percentOfTarget)}</span>
          </button>
        `;
      }
    ).join("");

  const perspectiveLabel =
    "Of Ground Truth target";

  summary.innerHTML = `
    <div class="phase-eval-review-composition">
      <div class="phase-eval-review-donut"
           style="background:${chartBackground}">
        <div>
          <strong>${phaseEvalReviewV4Percent(correct)}</strong>
          <small>correct</small>
        </div>
      </div>

      <div class="phase-eval-review-composition-copy">
        <strong>${escapeHtml(String(phaseEvalVisualData?.targetClass || ""))}</strong>
        <small>${perspectiveLabel}</small>

        <div class="phase-eval-review-composition-legend">
          <span><i class="correct"></i>Correct ${phaseEvalReviewV4Percent(correct)}</span>
          <span><i class="wrong"></i>Wrong class ${phaseEvalReviewV4Percent(wrong)}</span>
          <span><i class="missed"></i>${escapeHtml(String(perspective.unmatchedLabel || "Unmatched"))} ${phaseEvalReviewV4Percent(unmatched)}</span>
        </div>
      </div>
    </div>

    <div class="phase-eval-review-mismatch-breakdown">
      <div class="phase-eval-review-breakdown-head">
        <strong>
          Candidate classifications where GT is
          ${escapeHtml(String(phaseEvalVisualData?.targetClass || ""))}
        </strong>
        ${
          phaseEvalReviewV4PairFilter
            ? `<button type="button" id="phaseEvalReviewShowAllPairs">Show all Wrong</button>`
            : ""
        }
      </div>

      ${
        mismatchButtons
        || "<small>No wrong-class overlap for this perspective.</small>"
      }
    </div>
  `;

  for (
    const button
    of summary.querySelectorAll(
      "[data-eval-pair-index]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        phaseEvalReviewV4SetPairFilter(
          Number(
            button.dataset
              .evalPairIndex
          )
        );
      }
    );
  }

  document.getElementById(
    "phaseEvalReviewShowAllPairs"
  )?.addEventListener(
    "click",
    phaseEvalReviewV4ClearPairFilter
  );

}


function phaseEvalReviewV4RegionKey(
  region
) {
  if (!region) {
    return "";
  }

  const bbox =
    Array.isArray(
      region.bbox
    )
      ? region.bbox.map(
          (value) =>
            Number(
              value
            ).toFixed(
              2
            )
        ).join(",")
      : "";

  return [
    String(
      phaseEvalVisualData
        ?.targetClass
      || ""
    ),

    String(
      region.kind
      || ""
    ),

    String(
      region.candidateClass
      || ""
    ),

    String(
      region.referenceClass
      || ""
    ),

    bbox,
  ].join(
    "|"
  );
}


function phaseEvalReviewV4DecisionFor(
  region
) {
  const key =
    phaseEvalReviewV4RegionKey(
      region
    );

  return (
    phaseEvalCacheCurrentRecord
      ?.reviewDecisions
      ?.[key]
    || null
  );
}


async function phaseEvalReviewV4SetDecision(
  region,
  decision
) {
  if (!region) {
    return;
  }

  let record =
    phaseEvalCacheCurrentRecord;

  if (
    !phaseEvalCacheRecordMatchesResult(
      record,
      phaseEvalLastResult
    )
  ) {
    record =
      await phaseEvalCacheSaveResult(
        phaseEvalLastResult
      );
  }

  if (!record) {
    return;
  }

  record.reviewDecisions =
    (
      record.reviewDecisions
      && typeof record.reviewDecisions
        === "object"
    )
      ? record.reviewDecisions
      : {};

  const key =
    phaseEvalReviewV4RegionKey(
      region
    );

  if (!decision) {
    delete record.reviewDecisions[
      key
    ];

  } else {
    record.reviewDecisions[
      key
    ] = {
      decision,
      savedAt:
        new Date()
          .toISOString(),

      targetClass:
        String(
          phaseEvalVisualData
            ?.targetClass
          || ""
        ),

      candidateClass:
        region.candidateClass
        || null,

      referenceClass:
        region.referenceClass
        || null,

      percentOfTarget:
        Number(
          region.percentOfTarget
          || 0
        ),

      bbox:
        Array.isArray(
          region.bbox
        )
          ? [...region.bbox]
          : null,
    };
  }

  record.savedAt =
    new Date()
      .toISOString();

  await phaseEvalCachePut(
    record
  );

  phaseEvalCacheCurrentRecord =
    record;

  phaseEvalVisualRenderRegion();
}


function phaseEvalReviewV4DecisionCounts() {
  const decisions =
    Object.values(
      phaseEvalCacheCurrentRecord
        ?.reviewDecisions
      || {}
    ).filter(
      (item) =>
        String(
          item.targetClass
          || ""
        )
          === String(
            phaseEvalVisualData
              ?.targetClass
            || ""
          )
    );

  const counts = {
    total:
      decisions.length,

    candidate_error:
      0,

    gt_error:
      0,

    unclear:
      0,
  };

  for (
    const item
    of decisions
  ) {
    if (
      item.decision
      in counts
    ) {
      counts[
        item.decision
      ] += 1;
    }
  }

  return counts;
}


function phaseEvalReviewV4RenderRegion() {
  const element =
    document.getElementById(
      "phaseEvalVisualRegion"
    );

  if (!element) {
    return;
  }

  const regions =
    Array.isArray(
      phaseEvalVisualData
        ?.regions
    )
      ? phaseEvalVisualData
          .regions
      : [];

  if (
    phaseEvalVisualRegionIndex < 0
    || phaseEvalVisualRegionIndex
      >= regions.length
  ) {
    const counts =
      phaseEvalReviewV4DecisionCounts();

    const totalRegions =
      Math.max(
        regions.length,
        Number(
          phaseEvalVisualData
            ?.regionCount
          || 0
        )
      );

    element.innerHTML = `
      <strong>
        ${regions.length} navigable of
        ${totalRegions.toLocaleString()}
        total error region(s)
      </strong>
      <span>
        Reviewed ${counts.total}
        · Candidate errors ${counts.candidate_error}
        · GT errors ${counts.gt_error}
        · Unclear ${counts.unclear}
      </span>
    `;

    return;
  }

  const region =
    regions[
      phaseEvalVisualRegionIndex
    ];

  const decision =
    phaseEvalReviewV4DecisionFor(
      region
    );

  const candidateClass =
    String(
      region.candidateClass
      || "No candidate annotation"
    );

  const referenceClass =
    String(
      region.referenceClass
      || "No Ground Truth annotation"
    );

  const percent =
    phaseEvalReviewV4Percent(
      region.percentOfTarget
    );

  const target =
    String(
      phaseEvalVisualData
        ?.targetClass
      || ""
    );

  const totalRegions =
    Math.max(
      regions.length,
      Number(
        phaseEvalVisualData
          ?.regionCount
        || 0
      )
    );

  element.innerHTML = `
    <div class="phase-eval-review-error-head">
      <small>
        Error ${phaseEvalVisualRegionIndex + 1} / ${regions.length}
        navigable · ${totalRegions.toLocaleString()} total
      </small>
      <strong>${escapeHtml(candidateClass)}</strong>
      <span>Candidate classification</span>
    </div>

    <div class="phase-eval-review-error-compare">
      <span>
        GT: <strong>${escapeHtml(referenceClass)}</strong>
      </span>

      <span>
        <strong>${percent}</strong>
        of ${escapeHtml(target)} target
      </span>
    </div>

    <div class="phase-eval-review-decision-title">
      Document this discrepancy
    </div>

    <div class="phase-eval-review-decisions">
      <button type="button"
              data-eval-decision="candidate_error"
              class="${decision?.decision === "candidate_error" ? "active" : ""}">
        Candidate error
      </button>

      <button type="button"
              data-eval-decision="gt_error"
              class="${decision?.decision === "gt_error" ? "active" : ""}">
        GT error
      </button>

      <button type="button"
              data-eval-decision="unclear"
              class="${decision?.decision === "unclear" ? "active" : ""}">
        Unclear
      </button>

      ${
        decision
          ? `<button type="button" data-eval-decision="" class="clear">Clear</button>`
          : ""
      }
    </div>
  `;

  for (
    const button
    of element.querySelectorAll(
      "[data-eval-decision]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        void phaseEvalReviewV4SetDecision(
          region,
          button.dataset
            .evalDecision
          || ""
        );
      }
    );
  }
}


function phaseEvalReviewV4OverlayContext() {
  const canvas =
    document.getElementById(
      "phaseEvalVisualCanvas"
    );

  if (
    !canvas
    || canvas.hidden
  ) {
    return null;
  }

  const ratio =
    Math.max(
      1,
      Number(
        window.devicePixelRatio
        || 1
      )
    );

  const context =
    canvas.getContext(
      "2d"
    );

  if (!context) {
    return null;
  }

  context.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );

  return context;
}


function phaseEvalReviewV4DrawPairFilter(
  context
) {
  const pair =
    phaseEvalReviewV4PairFilter;

  if (
    !pair
    || !pair.geometry
  ) {
    return;
  }

  context.save();
  context.beginPath();

  const drawn =
    phaseEvalVisualGeometryPath(
      context,
      pair.geometry
    );

  if (drawn) {
    const opacity =
      Math.max(
        0.1,
        Math.min(
          0.85,
          Number(
            document.getElementById(
              "phaseEvalVisualOpacity"
            )?.value
            || 50
          ) / 100
        )
      );

    context.globalAlpha =
      opacity;

    context.fillStyle =
      "#f59e0b";

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
        opacity + 0.3
      );

    context.strokeStyle =
      "#f59e0b";

    context.lineWidth =
      2;

    context.stroke();
  }

  context.restore();
}


// Suppress the all-wrong-class orange union while a class-pair filter is active.
const phaseEvalReviewV4BaseLayerEnabled =
  phaseEvalVisualLayerEnabled;

phaseEvalVisualLayerEnabled =
  function phaseEvalReviewV4LayerEnabled(
    layerId
  ) {
    if (
      layerId
        === "wrong_class"
      && phaseEvalReviewV4PairFilter
    ) {
      return false;
    }

    return phaseEvalReviewV4BaseLayerEnabled(
      layerId
    );
  };


const phaseEvalReviewV4BaseDraw =
  phaseEvalVisualDraw;

phaseEvalVisualDraw =
  function phaseEvalReviewV4Draw() {
    const result =
      phaseEvalReviewV4BaseDraw();

    const context =
      phaseEvalReviewV4OverlayContext();

    if (context) {
      phaseEvalReviewV4DrawPairFilter(
        context
      );
    }

    return result;
  };


// Replace px summary with percentage composition.
const phaseEvalReviewV4BaseRenderSummary =
  phaseEvalVisualRenderSummary;

phaseEvalVisualRenderSummary =
  function phaseEvalReviewV4RenderSummary() {
    const result =
      phaseEvalReviewV4BaseRenderSummary();

    phaseEvalReviewV4RenderComposition();

    return result;
  };


// Replace compact error sentence with actionable audit card.
phaseEvalVisualRenderRegion =
  phaseEvalReviewV4RenderRegion;


// Old cached v3 payloads need one refresh to gain perspectives/pair layers.
const phaseEvalReviewV4BaseLoadClass =
  phaseEvalVisualLoadClass;

phaseEvalVisualLoadClass =
  async function phaseEvalReviewV4LoadClass() {
    phaseEvalReviewV4PairFilter =
      null;

    const targetClass =
      phaseEvalVisualCurrentClass();

    const record =
      phaseEvalCacheCurrentRecord;

    const cached =
      record
        ?.visualByClass
        ?.[targetClass];

    if (
      cached
      && Number(
        cached.reviewSchemaVersion
        || 0
      ) < 4
    ) {
      delete record.visualByClass[
        targetClass
      ];

      try {
        await phaseEvalCachePut(
          record
        );
      } catch (_) {}
    }

    await phaseEvalReviewV4BaseLoadClass();

    phaseEvalReviewV4RenderComposition();
    phaseEvalVisualRenderRegion();
    phaseEvalVisualDraw();
  };


// Preserve review decisions when a calculation with the same cache identity
// is saved again. Changed annotation checksums create a new cache identity.
const phaseEvalReviewV4BaseSaveResult =
  phaseEvalCacheSaveResult;

phaseEvalCacheSaveResult =
  async function phaseEvalReviewV4SaveResult(
    result
  ) {
    const previous =
      phaseEvalCacheCurrentRecord;

    const record =
      await phaseEvalReviewV4BaseSaveResult(
        result
      );

    if (
      record
      && previous
      && previous.cacheId
        === record.cacheId
      && previous.reviewDecisions
    ) {
      record.reviewDecisions =
        phaseEvalCacheClone(
          previous.reviewDecisions
        );

      await phaseEvalCachePut(
        record
      );

      phaseEvalCacheCurrentRecord =
        record;
    }

    return record;
  };


const phaseEvalReviewV4BaseVisualOpen =
  phaseEvalVisualOpen;

phaseEvalVisualOpen =
  async function phaseEvalReviewV4VisualOpen() {
    phaseEvalReviewV4Perspective =
      "referenceTarget";

    phaseEvalReviewV4PairFilter =
      null;

    const result =
      await phaseEvalReviewV4BaseVisualOpen();

    phaseEvalReviewV4EnsureUi();
    phaseEvalReviewV4UpdateEye();
    phaseEvalReviewV4RenderComposition();
    phaseEvalVisualRenderRegion();

    return result;
  };


const phaseEvalReviewV4BaseVisualClose =
  phaseEvalVisualClose;

phaseEvalVisualClose =
  function phaseEvalReviewV4VisualClose() {
    phaseEvalReviewV4PairFilter =
      null;

    const result =
      phaseEvalReviewV4BaseVisualClose();

    phaseEvalReviewV4UpdateEye();

    return result;
  };



function phaseEvalReviewV4UpdateRegionStatus() {
  const regions =
    Array.isArray(
      phaseEvalVisualData
        ?.regions
    )
      ? phaseEvalVisualData
          .regions
      : [];

  const total =
    Math.max(
      regions.length,
      Number(
        phaseEvalVisualData
          ?.regionCount
        || 0
      )
    );

  phaseEvalVisualSetStatus(
    `Visual Review ready. ${regions.length} navigable of `
    + `${total.toLocaleString()} total error region(s).`
  );
}


const phaseEvalReviewGtBaseLoadClass =
  phaseEvalVisualLoadClass;

phaseEvalVisualLoadClass =
  async function phaseEvalReviewGtLoadClass() {
    await phaseEvalReviewGtBaseLoadClass();

    phaseEvalReviewV4Perspective =
      "referenceTarget";

    phaseEvalReviewV4PairFilter =
      null;

    phaseEvalReviewV4RenderComposition();
    phaseEvalVisualRenderRegion();
    phaseEvalVisualDraw();
    phaseEvalReviewV4UpdateRegionStatus();
  };



function phaseEvalReviewV4FilteredRegionIndices() {
  const regions =
    Array.isArray(
      phaseEvalVisualData
        ?.regions
    )
      ? phaseEvalVisualData
          .regions
      : [];

  const pair =
    phaseEvalReviewV4PairFilter;

  if (!pair) {
    return regions.map(
      (_region, index) =>
        index
    );
  }

  const indices = [];

  for (
    let index = 0;
    index < regions.length;
    index += 1
  ) {
    const region =
      regions[index];

    if (
      String(
        region?.candidateClass
        || ""
      )
        === String(
          pair.candidateClass
          || ""
        )
      && String(
        region?.referenceClass
        || ""
      )
        === String(
          pair.referenceClass
          || ""
        )
    ) {
      indices.push(
        index
      );
    }
  }

  return indices;
}


const phaseEvalReviewV4BaseStepRegion =
  phaseEvalVisualStepRegion;

phaseEvalVisualStepRegion =
  function phaseEvalReviewV4FilteredStepRegion(
    delta
  ) {
    const pair =
      phaseEvalReviewV4PairFilter;

    if (!pair) {
      return phaseEvalReviewV4BaseStepRegion(
        delta
      );
    }

    const regions =
      Array.isArray(
        phaseEvalVisualData
          ?.regions
      )
        ? phaseEvalVisualData
            .regions
        : [];

    const indices =
      phaseEvalReviewV4FilteredRegionIndices();

    if (!indices.length) {
      phaseEvalVisualRegionIndex =
        -1;

      phaseEvalVisualRenderRegion();
      phaseEvalVisualDraw();

      return;
    }

    const currentPosition =
      indices.indexOf(
        phaseEvalVisualRegionIndex
      );

    let nextPosition;

    if (currentPosition < 0) {
      nextPosition =
        delta < 0
          ? indices.length - 1
          : 0;

    } else {
      nextPosition =
        (
          currentPosition
          + delta
          + indices.length
        ) % indices.length;
    }

    phaseEvalVisualRegionIndex =
      indices[
        nextPosition
      ];

    const region =
      regions[
        phaseEvalVisualRegionIndex
      ];

    phaseEvalVisualRenderRegion();

    // Previous/Next error deliberately centers the WSI.
    phaseEvalVisualZoomRegion(
      region
    );

    phaseEvalVisualDraw();
  };


phaseEvalReviewV4EnsureUi();
