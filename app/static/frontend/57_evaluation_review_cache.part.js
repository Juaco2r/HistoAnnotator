// ========================================================================
// Evaluation Review refinements v3
//
// - Persistent IndexedDB cache for metrics + visited Visual Review classes.
// - Open previous / Re-evaluate workflow.
// - Yellow boundary around currently selected error region.
// - Cyan dashed valid-evaluation-scope outline.
// - Explicit per-class Dice wording in metrics.
// ========================================================================

const PHASE_EVAL_CACHE_DB =
  "histoannotator-evaluation-cache-v1";

const PHASE_EVAL_CACHE_STORE =
  "evaluations";

const PHASE_EVAL_CACHE_VERSION =
  1;

const PHASE_EVAL_CACHE_MAX_PER_IMAGE =
  6;

let phaseEvalCacheDbPromise =
  null;

let phaseEvalCacheCurrentRecord =
  null;


function phaseEvalCacheClone(value) {
  if (
    typeof structuredClone
      === "function"
  ) {
    return structuredClone(
      value
    );
  }

  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function phaseEvalCacheOpenDb() {
  if (
    phaseEvalCacheDbPromise
  ) {
    return phaseEvalCacheDbPromise;
  }

  phaseEvalCacheDbPromise =
    new Promise(
      (resolve, reject) => {
        const request =
          indexedDB.open(
            PHASE_EVAL_CACHE_DB,
            PHASE_EVAL_CACHE_VERSION
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            if (
              !db.objectStoreNames
                .contains(
                  PHASE_EVAL_CACHE_STORE
                )
            ) {
              const store =
                db.createObjectStore(
                  PHASE_EVAL_CACHE_STORE,
                  {
                    keyPath:
                      "cacheId",
                  }
                );

              store.createIndex(
                "imageId",
                "imageId",
                {
                  unique:
                    false,
                }
              );
            }
          };

        request.onsuccess =
          () =>
            resolve(
              request.result
            );

        request.onerror =
          () =>
            reject(
              request.error
              || new Error(
                "Could not open evaluation cache"
              )
            );
      }
    );

  return phaseEvalCacheDbPromise;
}


async function phaseEvalCacheAllForImage(
  imageId
) {
  const db =
    await phaseEvalCacheOpenDb();

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          PHASE_EVAL_CACHE_STORE,
          "readonly"
        );

      const store =
        transaction.objectStore(
          PHASE_EVAL_CACHE_STORE
        );

      const index =
        store.index(
          "imageId"
        );

      const request =
        index.getAll(
          String(
            imageId
            || ""
          )
        );

      request.onsuccess =
        () => {
          const rows =
            Array.isArray(
              request.result
            )
              ? request.result
              : [];

          rows.sort(
            (
              left,
              right
            ) =>
              String(
                right.savedAt
                || ""
              ).localeCompare(
                String(
                  left.savedAt
                  || ""
                )
              )
          );

          resolve(
            rows
          );
        };

      request.onerror =
        () =>
          reject(
            request.error
            || new Error(
              "Could not read evaluation cache"
            )
          );
    }
  );
}


async function phaseEvalCachePut(
  record
) {
  const db =
    await phaseEvalCacheOpenDb();

  await new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          PHASE_EVAL_CACHE_STORE,
          "readwrite"
        );

      const store =
        transaction.objectStore(
          PHASE_EVAL_CACHE_STORE
        );

      store.put(
        record
      );

      transaction.oncomplete =
        () =>
          resolve();

      transaction.onerror =
        () =>
          reject(
            transaction.error
            || new Error(
              "Could not save evaluation cache"
            )
          );

      transaction.onabort =
        () =>
          reject(
            transaction.error
            || new Error(
              "Evaluation cache transaction aborted"
            )
          );
    }
  );

  await phaseEvalCachePrune(
    record.imageId
  );
}


async function phaseEvalCacheDelete(
  cacheId
) {
  const db =
    await phaseEvalCacheOpenDb();

  await new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          PHASE_EVAL_CACHE_STORE,
          "readwrite"
        );

      transaction.objectStore(
        PHASE_EVAL_CACHE_STORE
      ).delete(
        cacheId
      );

      transaction.oncomplete =
        () =>
          resolve();

      transaction.onerror =
        () =>
          reject(
            transaction.error
          );
    }
  );
}


async function phaseEvalCachePrune(
  imageId
) {
  const rows =
    await phaseEvalCacheAllForImage(
      imageId
    );

  for (
    const record
    of rows.slice(
      PHASE_EVAL_CACHE_MAX_PER_IMAGE
    )
  ) {
    try {
      await phaseEvalCacheDelete(
        record.cacheId
      );
    } catch (_) {}
  }
}


function phaseEvalCacheIdFromResult(
  result
) {
  return [
    String(
      result?.imageId
      || currentImage?.id
      || ""
    ),

    String(
      result?.candidateFile
      || ""
    ),

    String(
      result?.referenceFile
      || ""
    ),

    String(
      result?.mappingChecksum
      || "no-map"
    ),

    String(
      result?.candidateDocumentChecksum
      || "candidate-unknown"
    ),

    String(
      result?.referenceDocumentChecksum
      || "reference-unknown"
    ),
  ].join(
    "::"
  );
}


function phaseEvalCacheRecordMatchesResult(
  record,
  result
) {
  if (
    !record
    || !result
  ) {
    return false;
  }

  return (
    String(
      record.imageId
    )
      === String(
        result.imageId
        || currentImage?.id
        || ""
      )

    && String(
      record.candidateFile
    )
      === String(
        result.candidateFile
        || ""
      )

    && String(
      record.referenceFile
    )
      === String(
        result.referenceFile
        || ""
      )

    && String(
      record.mappingChecksum
      || ""
    )
      === String(
        result.mappingChecksum
        || ""
      )

    && String(
      record.candidateDocumentChecksum
      || ""
    )
      === String(
        result.candidateDocumentChecksum
        || ""
      )

    && String(
      record.referenceDocumentChecksum
      || ""
    )
      === String(
        result.referenceDocumentChecksum
        || ""
      )
  );
}


async function phaseEvalCacheSaveResult(
  result
) {
  if (
    !result
    || !currentImage
  ) {
    return null;
  }

  const cacheId =
    phaseEvalCacheIdFromResult(
      result
    );

  let existing =
    null;

  try {
    const rows =
      await phaseEvalCacheAllForImage(
        currentImage.id
      );

    existing =
      rows.find(
        (item) =>
          item.cacheId
          === cacheId
      )
      || null;

  } catch (_) {}

  const record = {
    schemaVersion:
      1,

    cacheId,

    imageId:
      String(
        result.imageId
        || currentImage.id
      ),

    candidateFile:
      String(
        result.candidateFile
        || ""
      ),

    referenceFile:
      String(
        result.referenceFile
        || ""
      ),

    mappingChecksum:
      String(
        result.mappingChecksum
        || ""
      ),

    candidateDocumentChecksum:
      String(
        result.candidateDocumentChecksum
        || ""
      ),

    referenceDocumentChecksum:
      String(
        result.referenceDocumentChecksum
        || ""
      ),

    savedAt:
      new Date()
        .toISOString(),

    result:
      phaseEvalCacheClone(
        result
      ),

    visualByClass:
      (
        existing
        ?.visualByClass
        && typeof existing.visualByClass
          === "object"
      )
        ? existing.visualByClass
        : {},
  };

  await phaseEvalCachePut(
    record
  );

  phaseEvalCacheCurrentRecord =
    record;

  return record;
}


async function phaseEvalCacheSaveVisual(
  targetClass,
  visualData
) {
  if (
    !phaseEvalLastResult
    || !visualData
  ) {
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

  record.visualByClass =
    (
      record.visualByClass
      && typeof record.visualByClass
        === "object"
    )
      ? record.visualByClass
      : {};

  record.visualByClass[
    String(
      targetClass
    )
  ] =
    phaseEvalCacheClone(
      visualData
    );

  record.savedAt =
    new Date()
      .toISOString();

  try {
    await phaseEvalCachePut(
      record
    );

    phaseEvalCacheCurrentRecord =
      record;

  } catch (error) {
    console.warn(
      "Could not cache Visual Review",
      error
    );
  }
}


function phaseEvalCacheEnsureUi() {
  const refs =
    phaseEvalRefs();

  if (
    !refs.results
    || document.getElementById(
      "phaseEvalPreviousPanel"
    )
  ) {
    return;
  }

  const panel =
    document.createElement(
      "section"
    );

  panel.id =
    "phaseEvalPreviousPanel";

  panel.className =
    "phase-eval-previous-panel";

  panel.hidden =
    true;

  panel.innerHTML = `
    <div class="phase-eval-previous-copy">
      <strong>Previous evaluation</strong>
      <span id="phaseEvalPreviousSummary"></span>
      <small id="phaseEvalPreviousState"></small>
    </div>

    <div class="phase-eval-previous-actions">
      <button id="phaseEvalOpenPreviousButton"
              type="button">
        Open previous
      </button>

      <button id="phaseEvalReevaluateButton"
              type="button">
        Re-evaluate
      </button>
    </div>
  `;

  refs.results.insertAdjacentElement(
    "beforebegin",
    panel
  );

  document.getElementById(
    "phaseEvalOpenPreviousButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseEvalCacheOpenPrevious();
    }
  );

  document.getElementById(
    "phaseEvalReevaluateButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseEvalCacheReevaluate();
    }
  );
}


function phaseEvalCacheDateLabel(
  iso
) {
  try {
    return new Date(
      iso
    ).toLocaleString();
  } catch (_) {
    return String(
      iso
      || ""
    );
  }
}


function phaseEvalCacheRenderPanel(
  record,
  stateText = ""
) {
  phaseEvalCacheEnsureUi();

  const panel =
    document.getElementById(
      "phaseEvalPreviousPanel"
    );

  const summary =
    document.getElementById(
      "phaseEvalPreviousSummary"
    );

  const state =
    document.getElementById(
      "phaseEvalPreviousState"
    );

  if (!panel) {
    return;
  }

  if (!record) {
    panel.hidden =
      true;

    return;
  }

  panel.hidden =
    false;

  if (summary) {
    const visualCount =
      Object.keys(
        record.visualByClass
        || {}
      ).length;

    summary.textContent =
      (
        `${record.candidateFile}`
        + " vs "
        + `${record.referenceFile}`
        + ` · ${phaseEvalCacheDateLabel(record.savedAt)}`
        + ` · ${visualCount} cached visual class`
        + (
            visualCount === 1
              ? ""
              : "es"
          )
      );
  }

  if (state) {
    state.textContent =
      stateText
      || "Stored locally on this device.";
  }
}


async function phaseEvalCacheRefreshPanel() {
  if (!currentImage) {
    return;
  }

  try {
    const rows =
      await phaseEvalCacheAllForImage(
        currentImage.id
      );

    const refs =
      phaseEvalRefs();

    const candidate =
      String(
        refs.candidate
          ?.value
        || ""
      );

    const reference =
      String(
        refs.reference
          ?.value
        || ""
      );

    const exact =
      rows.find(
        (record) =>
          record.candidateFile
            === candidate
          && record.referenceFile
            === reference
      );

    const record =
      exact
      || rows[0]
      || null;

    phaseEvalCacheCurrentRecord =
      record;

    phaseEvalCacheRenderPanel(
      record
    );

  } catch (error) {
    console.warn(
      "Could not read previous evaluation cache",
      error
    );
  }
}


async function phaseEvalCacheValidateRecord(
  record
) {
  if (
    !record
    || !currentImage
  ) {
    return;
  }

  try {
    const [
      candidateInfo,
      referenceInfo,
    ] =
      await Promise.all([
        phaseEvalLoadInfo(
          record.candidateFile
        ),
        phaseEvalLoadInfo(
          record.referenceFile
        ),
      ]);

    const candidateCurrent =
      String(
        candidateInfo
          ?.documentChecksum
        || ""
      );

    const referenceCurrent =
      String(
        referenceInfo
          ?.documentChecksum
        || ""
      );

    const same =
      (
        candidateCurrent
          === String(
            record.candidateDocumentChecksum
            || ""
          )
        && referenceCurrent
          === String(
            record.referenceDocumentChecksum
            || ""
          )
      );

    phaseEvalCacheRenderPanel(
      record,
      same
        ? "Inputs unchanged · cached evaluation is current."
        : (
            "Annotation files changed since this evaluation. "
            + "Open previous is allowed, but Re-evaluate is recommended."
          )
    );

  } catch (_) {
    phaseEvalCacheRenderPanel(
      record,
      "Could not verify freshness. Cached result remains available."
    );
  }
}


async function phaseEvalCacheOpenPrevious() {
  const record =
    phaseEvalCacheCurrentRecord;

  if (
    !record
    || !record.result
  ) {
    return;
  }

  const refs =
    phaseEvalRefs();

  if (refs.candidate) {
    refs.candidate.value =
      record.candidateFile;
  }

  if (refs.reference) {
    refs.reference.value =
      record.referenceFile;
  }

  phaseEvalLastResult =
    phaseEvalCacheClone(
      record.result
    );

  phaseEvalRenderResults(
    phaseEvalLastResult
  );

  if (refs.exportCsv) {
    refs.exportCsv.disabled =
      !phaseEvalLastResult
        ?.rows
        ?.length;
  }

  phaseEvalSetStatus(
    (
      "Opened cached evaluation · "
      + phaseEvalCacheDateLabel(
          record.savedAt
        )
    ),
    "local"
  );

  await phaseEvalCacheValidateRecord(
    record
  );
}


async function phaseEvalCacheReevaluate() {
  const record =
    phaseEvalCacheCurrentRecord;

  if (
    !record
    || !currentImage
  ) {
    return;
  }

  const refs =
    phaseEvalRefs();

  if (refs.candidate) {
    refs.candidate.value =
      record.candidateFile;
  }

  if (refs.reference) {
    refs.reference.value =
      record.referenceFile;
  }

  phaseEvalCandidateInfo =
    null;

  phaseEvalReferenceInfo =
    null;

  await phaseEvalLoadMappings();

  const mapping =
    record.result
      ?.mapping
    || {};

  phaseEvalApplyMapping(
    refs.candidateMap,
    mapping.candidateMapping
      || {}
  );

  phaseEvalApplyMapping(
    refs.referenceMap,
    mapping.referenceMapping
      || {}
  );

  await phaseEvalRun();
}


// ------------------------------------------------------------------------
// Metrics render: explicitly communicate per-class Dice and real scope.
// ------------------------------------------------------------------------

const phaseEvalReviewBaseRenderResults =
  phaseEvalRenderResults;

phaseEvalRenderResults =
  function phaseEvalReviewRenderResults(
    result
  ) {
    const output =
      phaseEvalReviewBaseRenderResults(
        result
      );

    const refs =
      phaseEvalRefs();

    const scopeLabel =
      result?.evaluationRegion
        === "reference-roi-inner"
        ? (
            "Ground Truth inner ROI "
            + "(external border exclusion applied)"
          )
        : (
            result?.evaluationRegion
              === "reference-roi"
            ? "Ground Truth ROI"
            : "full-image bounds"
          );

    const note =
      refs.results
        ?.querySelector(
          ".stats-note"
        );

    if (note) {
      note.textContent =
        (
          `${String(result?.method || "")}`
          + " · level-0 image pixels"
          + ` · ${scopeLabel}`
          + " · Dice is calculated independently for each mapped class"
          + ` · mapping ${String(result?.mappingChecksum || "").slice(0, 12)}`
        );
    }

    return output;
  };


// ------------------------------------------------------------------------
// Save a completed calculation.
// ------------------------------------------------------------------------

const phaseEvalCacheBaseRun =
  phaseEvalRun;

phaseEvalRun =
  async function phaseEvalCachedRun() {
    const previous =
      phaseEvalLastResult;

    await phaseEvalCacheBaseRun();

    if (
      phaseEvalLastResult
      && phaseEvalLastResult
        !== previous
    ) {
      try {
        const record =
          await phaseEvalCacheSaveResult(
            phaseEvalLastResult
          );

        phaseEvalCacheRenderPanel(
          record,
          "New evaluation saved locally."
        );

      } catch (error) {
        console.warn(
          "Could not save evaluation cache",
          error
        );
      }
    }
  };


// ------------------------------------------------------------------------
// Cache Visual Review per visited class.
// ------------------------------------------------------------------------

const phaseEvalCacheBaseVisualLoadClass =
  phaseEvalVisualLoadClass;

phaseEvalVisualLoadClass =
  async function phaseEvalCachedVisualLoadClass() {
    const targetClass =
      phaseEvalVisualCurrentClass();

    const record =
      phaseEvalCacheCurrentRecord;

    if (
      targetClass
      && phaseEvalCacheRecordMatchesResult(
        record,
        phaseEvalLastResult
      )
      && record.visualByClass
      && record.visualByClass[
        targetClass
      ]
      && phaseEvalVisualCachedReviewScale(
        record.visualByClass[
          targetClass
        ]
      )
        === phaseEvalVisualGetReviewScale()
      && (
        !Array.isArray(
          record.visualByClass[
            targetClass
          ]?.regions
        )
        || record.visualByClass[
            targetClass
          ].regions.length === 0
        || record.visualByClass[
            targetClass
          ].regions.every(
            (region) =>
              region
              && region.geometry
              && typeof region.geometry
                === "object"
          )
      )
    ) {
      phaseEvalVisualData =
        phaseEvalCacheClone(
          record.visualByClass[
            targetClass
          ]
        );

      phaseEvalVisualRegionIndex =
        -1;

      phaseEvalVisualRenderSummary();
      phaseEvalVisualRenderRegion();
      phaseEvalVisualDraw();

      phaseEvalVisualSetStatus(
        (
          `Loaded cached Visual Review for ${targetClass}. `
          + "Use Re-evaluate from Metrics if source annotations changed."
        )
      );

      return;
    }

    await phaseEvalCacheBaseVisualLoadClass();

    if (
      phaseEvalVisualData
      && targetClass
    ) {
      await phaseEvalCacheSaveVisual(
        targetClass,
        phaseEvalVisualData
      );
    }
  };


// ------------------------------------------------------------------------
// Overlay refinements:
// - cyan dashed outline = actual evaluation scope
// - yellow outline = selected error region bounds
// ------------------------------------------------------------------------

function phaseEvalReviewOverlayContext() {
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


function phaseEvalReviewDrawScope(
  context
) {
  const geometry =
    phaseEvalVisualData
      ?.evaluationScopeGeometry
    || phaseEvalVisualData
      ?.referenceRoi
      ?.geometry
    || null;

  if (!geometry) {
    return;
  }

  context.save();
  context.beginPath();

  const drawn =
    phaseEvalVisualGeometryPath(
      context,
      geometry
    );

  if (drawn) {
    context.globalAlpha =
      0.96;

    context.strokeStyle =
      "#22d3ee";

    context.lineWidth =
      2.4;

    context.setLineDash(
      [8, 5]
    );

    context.stroke();
  }

  context.restore();
}


function phaseEvalReviewDrawCurrentError(
  context
) {
  const regions =
    Array.isArray(
      phaseEvalVisualData
        ?.regions
    )
      ? phaseEvalVisualData
          .regions
      : [];

  const region =
    regions[
      phaseEvalVisualRegionIndex
    ];

  if (!region) {
    return;
  }

  const geometry =
    region.geometry;

  if (
    geometry
    && typeof geometry
      === "object"
  ) {
    context.save();
    context.beginPath();

    const drawn =
      phaseEvalVisualGeometryPath(
        context,
        geometry
      );

    if (drawn) {
      context.globalAlpha =
        1;

      context.strokeStyle =
        "#fde047";

      context.lineWidth =
        3.5;

      context.lineJoin =
        "round";

      context.lineCap =
        "round";

      context.setLineDash(
        []
      );

      context.shadowColor =
        "rgba(0, 0, 0, 0.75)";

      context.shadowBlur =
        2;

      context.stroke();
    }

    context.restore();
    return;
  }

  // Legacy cached payload fallback only.
  const bbox =
    region.bbox;

  if (
    !Array.isArray(
      bbox
    )
    || bbox.length < 4
  ) {
    return;
  }

  const topLeft =
    screenPointFromImage([
      Number(bbox[0]),
      Number(bbox[1]),
    ]);

  const bottomRight =
    screenPointFromImage([
      Number(bbox[2]),
      Number(bbox[3]),
    ]);

  if (
    !topLeft
    || !bottomRight
  ) {
    return;
  }

  context.save();

  context.globalAlpha =
    0.72;

  context.strokeStyle =
    "#fde047";

  context.lineWidth =
    2;

  context.setLineDash(
    [5, 4]
  );

  context.strokeRect(
    Math.min(
      topLeft.x,
      bottomRight.x
    ),
    Math.min(
      topLeft.y,
      bottomRight.y
    ),
    Math.max(
      2,
      Math.abs(
        bottomRight.x
        - topLeft.x
      )
    ),
    Math.max(
      2,
      Math.abs(
        bottomRight.y
        - topLeft.y
      )
    )
  );

  context.restore();
}


const phaseEvalReviewBaseVisualDraw =
  phaseEvalVisualDraw;

phaseEvalVisualDraw =
  function phaseEvalReviewVisualDraw() {
    const result =
      phaseEvalReviewBaseVisualDraw();

    const context =
      phaseEvalReviewOverlayContext();

    if (context) {
      phaseEvalReviewDrawScope(
        context
      );

      phaseEvalReviewDrawCurrentError(
        context
      );
    }

    return result;
  };


const phaseEvalReviewBaseStepRegion =
  phaseEvalVisualStepRegion;

phaseEvalVisualStepRegion =
  function phaseEvalReviewStepRegion(
    delta
  ) {
    const result =
      phaseEvalReviewBaseStepRegion(
        delta
      );

    phaseEvalVisualDraw();

    return result;
  };


// ------------------------------------------------------------------------
// Evaluation modal open: show previous local evaluation when available.
// ------------------------------------------------------------------------

const phaseEvalCacheBaseOpen =
  phaseEvalOpen;

phaseEvalOpen =
  async function phaseEvalCacheOpen() {
    const output =
      await phaseEvalCacheBaseOpen();

    phaseEvalCacheEnsureUi();

    await phaseEvalCacheRefreshPanel();

    const refs =
      phaseEvalRefs();

    for (
      const select
      of [
        refs.candidate,
        refs.reference,
      ]
    ) {
      if (
        select
        && !select.dataset
          .evalCacheBound
      ) {
        select.dataset
          .evalCacheBound =
          "1";

        select.addEventListener(
          "change",
          () => {
            void phaseEvalCacheRefreshPanel();
          }
        );
      }
    }

    return output;
  };


phaseEvalCacheEnsureUi();
