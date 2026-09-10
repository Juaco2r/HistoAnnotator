// ========================================================================
// Evaluation Offline Package v1
//
// Adds explicit full offline preparation and portable evaluation packages.
// Scientific evaluation is unchanged.
// ========================================================================

const PHASE_EVAL_OFFLINE_SCHEMA_VERSION = 1;
const PHASE_EVAL_OFFLINE_KIND = "histoannotator-evaluation-package";


function phaseEvalOfflineClasses(result = phaseEvalLastResult) {
  const rows =
    Array.isArray(result?.rows)
      ? result.rows
      : [];

  return [
    ...new Set(
      rows
        .map(
          (row) =>
            String(
              row?.className
              || ""
            ).trim()
        )
        .filter(Boolean)
    ),
  ];
}


function phaseEvalOfflineVisualIsComplete(visual) {
  if (
    !visual
    || typeof visual !== "object"
  ) {
    return false;
  }

  if (!Array.isArray(visual.regions)) {
    return true;
  }

  return visual.regions.every(
    (region) =>
      !region
      || !region.geometry
      || typeof region.geometry === "object"
  );
}


function phaseEvalOfflineState(record = phaseEvalCacheCurrentRecord) {
  if (
    !record
    || !record.result
  ) {
    return {
      total: 0,
      cached: 0,
      complete: false,
      classes: [],
    };
  }

  const classes =
    phaseEvalOfflineClasses(
      record.result
    );

  const visualByClass =
    (
      record.visualByClass
      && typeof record.visualByClass === "object"
    )
      ? record.visualByClass
      : {};

  const cached =
    classes.filter(
      (className) =>
        phaseEvalOfflineVisualIsComplete(
          visualByClass[className]
        )
    ).length;

  return {
    total:
      classes.length,

    cached,

    complete:
      Boolean(
        classes.length
        && cached === classes.length
      ),

    classes,
  };
}


function phaseEvalOfflineEnsureUi() {
  phaseEvalCacheEnsureUi();

  const parent =
    document.getElementById(
      "phaseEvalPreviousPanel"
    );

  if (
    !parent
    || document.getElementById(
      "phaseEvalOfflinePanel"
    )
  ) {
    return;
  }

  const panel =
    document.createElement(
      "div"
    );

  panel.id =
    "phaseEvalOfflinePanel";

  panel.className =
    "phase-eval-offline-panel";

  panel.innerHTML = `
    <div class="phase-eval-offline-head">
      <div>
        <strong>Offline evaluation</strong>
        <small id="phaseEvalOfflineState">
          Open or calculate an evaluation first.
        </small>
      </div>

      <span id="phaseEvalOfflineBadge"
            class="phase-eval-offline-badge">
        Not saved
      </span>
    </div>

    <div class="phase-eval-offline-actions">
      <button id="phaseEvalSaveOfflineButton"
              type="button">
        Save for offline
      </button>

      <button id="phaseEvalDownloadPackageButton"
              type="button">
        Download package
      </button>

      <button id="phaseEvalImportPackageButton"
              type="button">
        Import package
      </button>
    </div>

    <input id="phaseEvalImportPackageInput"
           type="file"
           accept=".json,.histo-eval.json,application/json"
           hidden>

    <div id="phaseEvalOfflineProgress"
         class="phase-eval-offline-progress"
         hidden>
      <div>
        <span id="phaseEvalOfflineProgressText"></span>
        <strong id="phaseEvalOfflineProgressCount"></strong>
      </div>

      <div class="phase-eval-offline-progress-track">
        <div id="phaseEvalOfflineProgressFill"></div>
      </div>
    </div>

    <small class="phase-eval-offline-note">
      Save for offline pre-computes every Visual Review class and stores it
      locally. Download package makes a portable backup for another device.
    </small>
  `;

  parent.append(
    panel
  );

  document.getElementById(
    "phaseEvalSaveOfflineButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseEvalOfflineSaveAll();
    }
  );

  document.getElementById(
    "phaseEvalDownloadPackageButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseEvalOfflineDownloadPackage();
    }
  );

  document.getElementById(
    "phaseEvalImportPackageButton"
  )?.addEventListener(
    "click",
    () => {
      document.getElementById(
        "phaseEvalImportPackageInput"
      )?.click();
    }
  );

  document.getElementById(
    "phaseEvalImportPackageInput"
  )?.addEventListener(
    "change",
    (event) => {
      const file =
        event.target?.files?.[0];

      if (file) {
        void phaseEvalOfflineImportPackage(
          file
        );
      }

      event.target.value =
        "";
    }
  );

  phaseEvalOfflineRenderState();
}


function phaseEvalOfflineRenderState(message = "") {
  const stateElement =
    document.getElementById(
      "phaseEvalOfflineState"
    );

  const badge =
    document.getElementById(
      "phaseEvalOfflineBadge"
    );

  const saveButton =
    document.getElementById(
      "phaseEvalSaveOfflineButton"
    );

  const downloadButton =
    document.getElementById(
      "phaseEvalDownloadPackageButton"
    );

  if (
    !stateElement
    || !badge
  ) {
    return;
  }

  const record =
    phaseEvalCacheCurrentRecord;

  const state =
    phaseEvalOfflineState(
      record
    );

  if (
    !record
    || !record.result
  ) {
    stateElement.textContent =
      message
      || "Open or calculate an evaluation first.";

    badge.textContent =
      "Not saved";

    badge.classList.remove(
      "complete"
    );

    if (saveButton) {
      saveButton.disabled =
        true;
    }

    if (downloadButton) {
      downloadButton.disabled =
        true;
    }

    return;
  }

  stateElement.textContent =
    message
    || (
      `${state.cached} / ${state.total} Visual Review classes cached locally`
    );

  badge.textContent =
    state.complete
      ? "Offline ready"
      : `${state.cached}/${state.total}`;

  badge.classList.toggle(
    "complete",
    state.complete
  );

  if (saveButton) {
    saveButton.disabled =
      !state.total;
  }

  if (downloadButton) {
    downloadButton.disabled =
      false;
  }
}


function phaseEvalOfflineProgress(current, total, label) {
  const box =
    document.getElementById(
      "phaseEvalOfflineProgress"
    );

  const text =
    document.getElementById(
      "phaseEvalOfflineProgressText"
    );

  const count =
    document.getElementById(
      "phaseEvalOfflineProgressCount"
    );

  const fill =
    document.getElementById(
      "phaseEvalOfflineProgressFill"
    );

  if (!box) {
    return;
  }

  box.hidden =
    false;

  if (text) {
    text.textContent =
      String(
        label
        || "Saving…"
      );
  }

  if (count) {
    count.textContent =
      `${current}/${total}`;
  }

  if (fill) {
    fill.style.width =
      `${
        total
          ? Math.max(
              0,
              Math.min(
                100,
                100 * current / total
              )
            )
          : 0
      }%`;
  }
}


function phaseEvalOfflineHideProgress() {
  const box =
    document.getElementById(
      "phaseEvalOfflineProgress"
    );

  if (box) {
    box.hidden =
      true;
  }
}


async function phaseEvalOfflineRequestPersistentStorage() {
  try {
    if (
      navigator.storage?.persist
    ) {
      return Boolean(
        await navigator.storage.persist()
      );
    }
  } catch (_) {}

  return false;
}


async function phaseEvalOfflineFetchVisual(result, targetClass) {
  if (
    !currentImage
    || !result
    || !targetClass
  ) {
    throw new Error(
      "Evaluation context is incomplete"
    );
  }

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

            reviewScale:
              phaseEvalVisualGetReviewScale(),

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

  return payload;
}


async function phaseEvalOfflineEnsureCurrentRecord() {
  if (!phaseEvalLastResult) {
    return null;
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

  return record;
}


async function phaseEvalOfflineSaveAll() {
  const result =
    phaseEvalLastResult
    || phaseEvalCacheCurrentRecord?.result
    || null;

  if (
    !result
    || !currentImage
  ) {
    phaseEvalSetStatus(
      "Calculate or open an evaluation before saving it offline.",
      "error"
    );

    return;
  }

  const classes =
    phaseEvalOfflineClasses(
      result
    );

  if (!classes.length) {
    phaseEvalSetStatus(
      "This evaluation has no mapped classes to cache.",
      "error"
    );

    return;
  }

  const button =
    document.getElementById(
      "phaseEvalSaveOfflineButton"
    );

  if (button) {
    button.disabled =
      true;
  }

  const persisted =
    await phaseEvalOfflineRequestPersistentStorage();

  try {
    if (!phaseEvalLastResult) {
      phaseEvalLastResult =
        phaseEvalCacheClone(
          result
        );
    }

    let record =
      await phaseEvalOfflineEnsureCurrentRecord();

    if (!record) {
      throw new Error(
        "Could not create local evaluation record"
      );
    }

    record.visualByClass =
      (
        record.visualByClass
        && typeof record.visualByClass === "object"
      )
        ? record.visualByClass
        : {};

    record.reviewDecisions =
      (
        record.reviewDecisions
        && typeof record.reviewDecisions === "object"
      )
        ? record.reviewDecisions
        : {};

    let done =
      0;

    for (
      const targetClass
      of classes
    ) {
      const existing =
        record.visualByClass[
          targetClass
        ];

      if (
        phaseEvalOfflineVisualIsComplete(
          existing
        )
      ) {
        done += 1;

        phaseEvalOfflineProgress(
          done,
          classes.length,
          `${targetClass} · already cached`
        );

        continue;
      }

      phaseEvalOfflineProgress(
        done,
        classes.length,
        `Calculating ${targetClass}…`
      );

      phaseEvalSetStatus(
        (
          `Saving evaluation offline · ${targetClass}`
          + ` · ${done + 1}/${classes.length}`
        ),
        "local"
      );

      const visual =
        await phaseEvalOfflineFetchVisual(
          result,
          targetClass
        );

      record.visualByClass[
        targetClass
      ] =
        phaseEvalCacheClone(
          visual
        );

      record.savedAt =
        new Date()
          .toISOString();

      await phaseEvalCachePut(
        record
      );

      phaseEvalCacheCurrentRecord =
        record;

      done += 1;

      phaseEvalOfflineProgress(
        done,
        classes.length,
        `${targetClass} · saved`
      );
    }

    record.offlineSchemaVersion =
      PHASE_EVAL_OFFLINE_SCHEMA_VERSION;

    record.offlineComplete =
      true;

    record.offlineClasses =
      [
        ...classes,
      ];

    record.offlineSavedAt =
      new Date()
        .toISOString();

    record.persistentStorageGranted =
      Boolean(
        persisted
      );

    await phaseEvalCachePut(
      record
    );

    phaseEvalCacheCurrentRecord =
      record;

    phaseEvalCacheRenderPanel(
      record,
      (
        `Offline ready · ${classes.length}/${classes.length} visual classes`
      )
    );

    phaseEvalOfflineRenderState(
      (
        `All ${classes.length} Visual Review classes are available offline`
      )
    );

    phaseEvalSetStatus(
      (
        `Evaluation saved for offline use · ${classes.length}/${classes.length} visual classes`
      ),
      "saved"
    );

  } catch (error) {
    phaseEvalOfflineRenderState(
      `Offline save stopped: ${error.message}`
    );

    phaseEvalSetStatus(
      `Could not finish offline evaluation: ${error.message}`,
      "error"
    );

  } finally {
    phaseEvalOfflineHideProgress();

    if (button) {
      button.disabled =
        false;
    }
  }
}


function phaseEvalOfflineSafeName(value) {
  return String(
    value
    || "evaluation"
  )
    .replace(
      /[^A-Za-z0-9._-]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    )
    .slice(
      0,
      70
    )
    || "evaluation";
}


function phaseEvalOfflinePackageFromRecord(record) {
  if (
    !record
    || !record.result
  ) {
    throw new Error(
      "No cached evaluation is available"
    );
  }

  const state =
    phaseEvalOfflineState(
      record
    );

  return {
    kind:
      PHASE_EVAL_OFFLINE_KIND,

    schemaVersion:
      PHASE_EVAL_OFFLINE_SCHEMA_VERSION,

    exportedAt:
      new Date()
        .toISOString(),

    app:
      "HistoAnnotator",

    complete:
      state.complete,

    classCount:
      state.total,

    cachedClassCount:
      state.cached,

    record:
      phaseEvalCacheClone(
        record
      ),
  };
}


async function phaseEvalOfflineDownloadPackage() {
  const record =
    phaseEvalCacheCurrentRecord;

  if (
    !record
    || !record.result
  ) {
    phaseEvalSetStatus(
      "Open a cached evaluation before downloading a package.",
      "error"
    );

    return;
  }

  try {
    const packagePayload =
      phaseEvalOfflinePackageFromRecord(
        record
      );

    const blob =
      new Blob(
        [
          JSON.stringify(
            packagePayload
          ),
        ],
        {
          type:
            "application/json",
        }
      );

    const filename =
      (
        `${phaseEvalOfflineSafeName(record.imageId)}`
        + `__${phaseEvalOfflineSafeName(record.candidateFile)}`
        + `__vs__${phaseEvalOfflineSafeName(record.referenceFile)}`
        + ".histo-eval.json"
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        "a"
      );

    anchor.href =
      url;

    anchor.download =
      filename;

    anchor.style.display =
      "none";

    document.body.append(
      anchor
    );

    anchor.click();
    anchor.remove();

    setTimeout(
      () => {
        URL.revokeObjectURL(
          url
        );
      },
      1500
    );

    const state =
      phaseEvalOfflineState(
        record
      );

    phaseEvalSetStatus(
      (
        `Evaluation package downloaded · ${state.cached}/${state.total} visual classes`
      ),
      "saved"
    );

  } catch (error) {
    phaseEvalSetStatus(
      `Could not download evaluation package: ${error.message}`,
      "error"
    );
  }
}


function phaseEvalOfflineValidatePackage(payload) {
  if (
    !payload
    || typeof payload !== "object"
    || payload.kind !== PHASE_EVAL_OFFLINE_KIND
    || Number(payload.schemaVersion)
      !== PHASE_EVAL_OFFLINE_SCHEMA_VERSION
    || !payload.record
    || typeof payload.record !== "object"
    || !payload.record.result
  ) {
    throw new Error(
      "This is not a supported HistoAnnotator evaluation package"
    );
  }

  return payload.record;
}


async function phaseEvalOfflineImportPackage(file) {
  if (!file) {
    return;
  }

  try {
    const payload =
      JSON.parse(
        await file.text()
      );

    const record =
      phaseEvalOfflineValidatePackage(
        payload
      );

    if (!currentImage) {
      throw new Error(
        "Open the corresponding image before importing the evaluation package"
      );
    }

    if (
      String(record.imageId)
      !== String(currentImage.id)
    ) {
      throw new Error(
        (
          `Package image is "${record.imageId}", `
          + `but current image is "${currentImage.id}"`
        )
      );
    }

    record.cacheId =
      String(
        record.cacheId
        || phaseEvalCacheIdFromResult(
          record.result
        )
      );

    record.importedAt =
      new Date()
        .toISOString();

    record.visualByClass =
      (
        record.visualByClass
        && typeof record.visualByClass === "object"
      )
        ? record.visualByClass
        : {};

    record.reviewDecisions =
      (
        record.reviewDecisions
        && typeof record.reviewDecisions === "object"
      )
        ? record.reviewDecisions
        : {};

    await phaseEvalCachePut(
      record
    );

    phaseEvalCacheCurrentRecord =
      record;

    phaseEvalLastResult =
      phaseEvalCacheClone(
        record.result
      );

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

    phaseEvalRenderResults(
      phaseEvalLastResult
    );

    if (refs.exportCsv) {
      refs.exportCsv.disabled =
        !phaseEvalLastResult?.rows?.length;
    }

    const state =
      phaseEvalOfflineState(
        record
      );

    phaseEvalCacheRenderPanel(
      record,
      (
        `Imported package · ${state.cached}/${state.total} visual classes`
      )
    );

    phaseEvalOfflineRenderState(
      (
        `${state.cached}/${state.total} Visual Review classes available locally`
      )
    );

    phaseEvalSetStatus(
      (
        `Evaluation package imported · ${state.cached}/${state.total} visual classes`
      ),
      "saved"
    );

  } catch (error) {
    phaseEvalSetStatus(
      `Could not import evaluation package: ${error.message}`,
      "error"
    );
  }
}


// Preserve review decisions/offline metadata if the same evaluation result
// is re-saved into the existing IndexedDB cache record.
const phaseEvalOfflineBaseCacheSaveResult =
  phaseEvalCacheSaveResult;

phaseEvalCacheSaveResult =
  async function phaseEvalOfflineCacheSaveResult(result) {
    const previousRecord =
      phaseEvalCacheCurrentRecord;

    const record =
      await phaseEvalOfflineBaseCacheSaveResult(
        result
      );

    if (
      record
      && previousRecord
      && phaseEvalCacheRecordMatchesResult(
        previousRecord,
        result
      )
    ) {
      if (
        previousRecord.reviewDecisions
        && typeof previousRecord.reviewDecisions === "object"
      ) {
        record.reviewDecisions =
          phaseEvalCacheClone(
            previousRecord.reviewDecisions
          );
      }

      for (
        const key
        of [
          "offlineSchemaVersion",
          "offlineComplete",
          "offlineClasses",
          "offlineSavedAt",
          "persistentStorageGranted",
        ]
      ) {
        if (
          previousRecord[key]
          !== undefined
        ) {
          record[key] =
            phaseEvalCacheClone(
              previousRecord[key]
            );
        }
      }

      await phaseEvalCachePut(
        record
      );

      phaseEvalCacheCurrentRecord =
        record;
    }

    phaseEvalOfflineEnsureUi();
    phaseEvalOfflineRenderState();

    return record;
  };


const phaseEvalOfflineBaseCacheRenderPanel =
  phaseEvalCacheRenderPanel;

phaseEvalCacheRenderPanel =
  function phaseEvalOfflineCacheRenderPanel(
    record,
    stateText = ""
  ) {
    phaseEvalOfflineBaseCacheRenderPanel(
      record,
      stateText
    );

    phaseEvalOfflineEnsureUi();
    phaseEvalOfflineRenderState();
  };


phaseEvalOfflineEnsureUi();
phaseEvalOfflineRenderState();
