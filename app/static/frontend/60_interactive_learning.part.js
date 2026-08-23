// Suggestions stay outside featureCollection until Accept/Edit.
// Therefore Review, Statistics, GeoJSON and sync remain unchanged.
// ========================================================================

const PHASE_IL1_REJECTION_KEY =
  "histoannotator.il1.rejections.v1";

// ========================================================================
// Phase IL10.0 - multi-model framework
//
// A = current classical Extra Trees workflow.
// B/C are registered now so UI, backend payloads and evaluation can use a
// stable model identifier before the deep implementations are introduced.
// Deep models will use server-side device="auto": CUDA/MPS when available,
// otherwise CPU.
// ========================================================================

const PHASE_IL10_MODEL_KEY =
  "histoannotator.il10.learningModel.v1";

let phaseIL10Capabilities =
  null;


function phaseIL10LearningModel() {
  const select =
    document.getElementById(
      "phaseIL10ModelSelect"
    );

  const value =
    String(
      select?.value
      || localStorage.getItem(
        PHASE_IL10_MODEL_KEY
      )
      || "A"
    )
      .trim()
      .toUpperCase();

  return ["A", "B", "C"].includes(value)
    ? value
    : "A";
}


function phaseIL10ModelLabel(
  value = phaseIL10LearningModel()
) {
  if (value === "B") {
    return "B · Deep Features";
  }

  if (value === "C") {
    return "C · Deep Spatial";
  }

  return "A · Classical";
}


function phaseIL10ModelOption(
  value
) {
  return document.querySelector(
    `#phaseIL10ModelSelect option[value="${value}"]`
  );
}


function phaseIL10RenderCapabilities() {
  const status =
    document.getElementById(
      "phaseIL10ModelStatus"
    );

  if (!status) return;

  const capabilities =
    phaseIL10Capabilities;

  if (!capabilities) {
    status.textContent =
      "A uses CPU · deep models will use GPU automatically when available.";
    return;
  }

  const models =
    Array.isArray(capabilities.models)
      ? capabilities.models
      : [];

  for (const value of ["A", "B", "C"]) {
    const option =
      phaseIL10ModelOption(value);

    const model =
      models.find(
        (item) =>
          String(item?.id || "")
            .toUpperCase()
          === value
      );

    if (option) {
      option.disabled =
        !Boolean(model?.available);
    }
  }

  const deep =
    capabilities.deepRuntime
    || {};

  const device =
    String(
      deep.recommendedDevice
      || "cpu"
    ).toUpperCase();

  if (deep.torchInstalled) {
    const hardware =
      deep.deviceName
        ? ` · ${deep.deviceName}`
        : "";

    status.textContent =
      `Deep runtime ready · auto device: ${device}${hardware}`;
  } else {
    status.textContent =
      "A ready · deep runtime will be installed for B/C; CPU fallback remains supported.";
  }

  const select =
    document.getElementById(
      "phaseIL10ModelSelect"
    );

  if (
    select
    && select.selectedOptions?.[0]
      ?.disabled
  ) {
    select.value = "A";
    localStorage.setItem(
      PHASE_IL10_MODEL_KEY,
      "A"
    );
  }
}


async function phaseIL10LoadCapabilities() {
  try {
    const response =
      await apiFetch(
        `${API}/interactive-learning/capabilities`,
        {
          timeoutMs: 5000,
        }
      );

    phaseIL10Capabilities =
      await response.json();

    phaseIL10RenderCapabilities();
  } catch (_) {
    phaseIL10Capabilities =
      null;

    phaseIL10RenderCapabilities();
  }
}


function phaseIL10InitializeModelSelector() {
  const select =
    document.getElementById(
      "phaseIL10ModelSelect"
    );

  if (!select) return;

  const stored =
    String(
      localStorage.getItem(
        PHASE_IL10_MODEL_KEY
      )
      || "A"
    )
      .trim()
      .toUpperCase();

  select.value =
    ["A", "B", "C"].includes(stored)
      ? stored
      : "A";

  if (
    select.selectedOptions?.[0]
      ?.disabled
  ) {
    select.value = "A";
  }

  select.addEventListener(
    "change",
    () => {
      const model =
        phaseIL10LearningModel();

      localStorage.setItem(
        PHASE_IL10_MODEL_KEY,
        model
      );

      phaseIL1ClearSuggestions(
        `${phaseIL10ModelLabel(model)} selected. Run Learn & suggest.`,
        true
      );

      try {
        phaseIL7RenderStatus();
      } catch (_) {}
    }
  );

  phaseIL10RenderCapabilities();
  phaseIL10LoadCapabilities();
}



let phaseIL1State = {
  open: false,
  busy: false,
  suggestions: [],
  index: 0,
  targetClass: null,
  model: null,
  summary: null,
  documentKey: null,
  applyingSuggestion: false,
};



// ========================================================================
// Phase IL6 - multi-image training sources
// ========================================================================

const PHASE_IL6_SOURCE_MODE_KEY =
  "histoannotator.il6.sourceMode.v1";

const PHASE_IL6_SOURCES_KEY =
  "histoannotator.il6.trainingSources.v1";

let phaseIL6TrainingSources =
  phaseIL6LoadTrainingSources();

let phaseIL6SourceStatus =
  new Map();


// ========================================================================
// Phase IL8.1 - persist similarity reports in training-set UI
// ========================================================================

let phaseIL8SourceReports =
  new Map();


function phaseIL8StoredReport(
  imageId,
  annotationFile,
  targetClass
) {
  const key =
    phaseIL6SourceKey(
      imageId,
      annotationFile
    );

  const report =
    phaseIL8SourceReports.get(
      key
    );

  if (!report) return null;

  const currentTarget =
    String(
      targetClass || ""
    )
      .trim()
      .toLowerCase();

  const reportTarget =
    String(
      report.targetClass || ""
    )
      .trim()
      .toLowerCase();

  if (
    currentTarget
    && reportTarget
    && currentTarget !== reportTarget
  ) {
    return null;
  }

  return report;
}


function phaseIL8FormatStoredSourceStatus(
  report,
  targetClass,
  targetCount
) {
  const annotations =
    Number(
      report?.targetAnnotations
      ?? targetCount
      ?? 0
    );

  const similarity =
    Number(
      report?.deepSimilarity
      ?? report?.appearanceSimilarity
    );

  const weight =
    Number(
      report?.effectiveWeight
    );

  const learningModel =
    String(
      report?.learningModel
      || ""
    ).toUpperCase();

  const samePhysicalImage =
    Boolean(
      report?.samePhysicalImage
    );

  let label =
    String(
      report?.similarityLabel
      || ""
    ).trim();

  if (!label) {
    if (samePhysicalImage) {
      label = "same image";
    } else if (learningModel === "C") {
      label = "deep spatial";
    } else if (learningModel === "B") {
      label = "deep";
    } else {
      label = "similarity";
    }
  }

  const targetText =
    annotations > 0
      ? (
          `${targetClass}: ${annotations} annotation`
          + `${annotations === 1 ? "" : "s"}`
        )
      : (
          `${targetClass}: 0`
          + " · explicit negatives only"
        );

  const similarityText =
    Number.isFinite(similarity)
      ? (
          `${label}`
          + ` ${Math.round(similarity * 100)}%`
        )
      : "";

  const weightText =
    Number.isFinite(weight)
      ? `weight ${weight.toFixed(2)}x`
      : "";

  const cap =
    Number(
      report?.targetAbsentWeightCap
      ?? (
        annotations < 1
          ? 0.45
          : NaN
      )
    );

  const capText =
    (
      Number.isFinite(cap)
      && annotations < 1
    )
      ? `negative-only cap ${cap.toFixed(2)}x`
      : "";

  const positiveGridCells =
    Number(
      report?.positiveGridCells
    );

  const negativeGridCells =
    Number(
      report?.negativeGridCells
    );

  const spatialCellsText =
    (
      learningModel === "C"
      && (
        Number.isFinite(positiveGridCells)
        || Number.isFinite(negativeGridCells)
      )
    )
      ? (
          `grid +${Math.max(0, Number(positiveGridCells) || 0)}`
          + ` / -${Math.max(0, Number(negativeGridCells) || 0)}`
        )
      : "";

  const cacheSource =
    String(
      report?.embeddingCacheSource
      || ""
    ).trim();

  const cacheText =
    (
      learningModel === "C"
      && cacheSource
    )
      ? `cache ${cacheSource}`
      : "";

  return [
    targetText,
    similarityText,
    weightText,
    capText,
    spatialCellsText,
    cacheText,
  ]
    .filter(Boolean)
    .join(" · ");
}


function phaseIL6LoadTrainingSources() {
  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          PHASE_IL6_SOURCES_KEY
        )
        || "[]"
      );

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          item
          && item.imageId
      )
      .map(
        (item) => ({
          imageId:
            String(item.imageId),
          annotationFile:
            String(
              item.annotationFile
              || "Default"
            ),
        })
      )
      .slice(0, 12);
  } catch (_) {
    return [];
  }
}


function phaseIL6SaveTrainingSources() {
  localStorage.setItem(
    PHASE_IL6_SOURCES_KEY,
    JSON.stringify(
      phaseIL6TrainingSources
    )
  );
}


function phaseIL6TrainingMode() {
  const select =
    document.getElementById(
      "phaseIL6SourceSelect"
    );

  return (
    select?.value === "set"
      ? "set"
      : "current"
  );
}


function phaseIL6SourceKey(
  imageId,
  annotationFile
) {
  return (
    `${String(imageId || "")}::`
    + `${String(annotationFile || "Default")}`
  );
}


function phaseIL6TrainingPayload() {
  if (
    phaseIL6TrainingMode()
    !== "set"
  ) {
    return [];
  }

  const currentKey =
    phaseIL6SourceKey(
      currentImage?.id,
      currentAnnotationFile
    );

  return (
    phaseIL6TrainingSources
      .filter(
        (item) =>
          phaseIL6SourceKey(
            item.imageId,
            item.annotationFile
          ) !== currentKey
      )
      .map(
        (item) => ({
          imageId: item.imageId,
          annotationFile:
            item.annotationFile,
        })
      )
      .slice(0, 12)
  );
}


function phaseIL6UpdateSourceUi() {
  const mode =
    phaseIL6TrainingMode();

  const row =
    document.getElementById(
      "phaseIL6TrainingSetRow"
    );

  const summary =
    document.getElementById(
      "phaseIL6TrainingSetSummary"
    );

  if (row) {
    row.hidden =
      mode !== "set";
  }

  if (summary) {
    const count =
      phaseIL6TrainingPayload()
        .length;

    summary.textContent =
      count
        ? (
            `${count} auxiliary source`
            + `${count === 1 ? "" : "s"}`
            + " + current image"
          )
        : "Current image + no auxiliary sources";
  }
}


async function phaseIL6FilesForImage(
  imageId
) {
  const response =
    await apiFetch(
      `${API}/annotations/${imageId}/files`,
      {
        timeoutMs: 10000,
      }
    );

  const payload =
    await response.json();

  return (
    Array.isArray(payload?.files)
    && payload.files.length
      ? payload.files
      : ["Default"]
  );
}


async function phaseIL6PopulateFileSelect() {
  const imageSelect =
    document.getElementById(
      "phaseIL6ImageSelect"
    );

  const fileSelect =
    document.getElementById(
      "phaseIL6FileSelect"
    );

  const message =
    document.getElementById(
      "phaseIL6TrainingMessage"
    );

  if (
    !imageSelect
    || !fileSelect
  ) {
    return;
  }

  const imageId =
    String(
      imageSelect.value
      || ""
    );

  fileSelect.innerHTML = "";

  if (!imageId) {
    fileSelect.disabled = true;
    return;
  }

  fileSelect.disabled = true;

  try {
    const files =
      await phaseIL6FilesForImage(
        imageId
      );

    for (const name of files) {
      const option =
        document.createElement(
          "option"
        );

      option.value = name;
      option.textContent = name;
      fileSelect.append(option);
    }

    fileSelect.disabled = false;

    if (message) {
      message.textContent = "";
    }
  } catch (error) {
    if (message) {
      message.textContent =
        `Could not load annotation files: ${error.message}`;
    }
  }
}


function phaseIL6TargetCount(
  collection,
  targetClass
) {
  const wanted =
    String(targetClass || "")
      .trim()
      .toLowerCase();

  if (!wanted) return 0;

  return (
    collection?.features
    || []
  ).filter(
    (feature) => {
      const role =
        String(
          feature?.properties
            ?.histoannotator
            ?.role
          || "annotation"
        ).toLowerCase();

      const className =
        String(
          feature?.properties
            ?.classification
            ?.name
          || ""
        ).trim().toLowerCase();

      return (
        role === "annotation"
        && className === wanted
      );
    }
  ).length;
}


async function phaseIL6RefreshSourceStatus(
  item
) {
  const targetClass =
    String(
      phaseIL1Refs()
        .classSelect
        ?.value
      || ""
    ).trim();

  if (!targetClass) return;

  const key =
    phaseIL6SourceKey(
      item.imageId,
      item.annotationFile
    );

  phaseIL6SourceStatus.set(
    key,
    "Checking target class…"
  );

  phaseIL6RenderTrainingSources();

  try {
    const response =
      await apiFetch(
        `${API}/annotations/${item.imageId}`
        + `?file=${encodeURIComponent(item.annotationFile)}`,
        {
          timeoutMs: 10000,
        }
      );

    const collection =
      normalizeFeatureCollectionClient(
        await response.json()
      );

    const count =
      phaseIL6TargetCount(
        collection,
        targetClass
      );

    const storedReport =
      phaseIL8StoredReport(
        item.imageId,
        item.annotationFile,
        targetClass
      );

    const samePhysicalImage =
      String(item.imageId)
      === String(
        currentImage?.id
      );

    let fallbackStatus;

    if (samePhysicalImage) {
      const fallbackWeight =
        count > 0
          ? 0.85
          : 0.45;

      fallbackStatus =
        (
          count > 0
            ? (
                `${targetClass}: ${count} annotation`
                + `${count === 1 ? "" : "s"}`
              )
            : (
                `${targetClass}: 0`
                + " · explicit negatives only"
              )
        )
        + " · same image 100%"
        + ` · weight ${fallbackWeight.toFixed(2)}x`
        + (
            count > 0
              ? ""
              : " · negative-only cap 0.45x"
          );
    } else {
      fallbackStatus =
        count > 0
          ? (
              `${targetClass}: ${count} annotation`
              + `${count === 1 ? "" : "s"}`
            )
          : (
              `${targetClass}: 0`
              + " · explicit negatives only"
            );
    }

    phaseIL6SourceStatus.set(
      key,
      storedReport
        ? phaseIL8FormatStoredSourceStatus(
            storedReport,
            targetClass,
            count
          )
        : fallbackStatus
    );
  } catch (error) {
    phaseIL6SourceStatus.set(
      key,
      `Unavailable: ${error.message}`
    );
  }

  phaseIL6RenderTrainingSources();
}


function phaseIL6RenderTrainingSources() {
  const list =
    document.getElementById(
      "phaseIL6TrainingList"
    );

  if (!list) return;

  list.innerHTML = "";

  if (!phaseIL6TrainingSources.length) {
    const empty =
      document.createElement("p");

    empty.className =
      "phase-il6-empty";

    empty.textContent =
      "No auxiliary training sources selected.";

    list.append(empty);
    phaseIL6UpdateSourceUi();
    return;
  }

  for (
    const item
    of phaseIL6TrainingSources
  ) {
    const row =
      document.createElement("div");

    row.className =
      "phase-il6-source-row";

    const text =
      document.createElement("div");

    text.className =
      "phase-il6-source-text";

    const image =
      (images || []).find(
        (candidate) =>
          String(candidate.id)
          === String(item.imageId)
      );

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      image?.name
      || item.imageId;

    const file =
      document.createElement(
        "span"
      );

    file.textContent =
      `Annotation file: ${item.annotationFile}`;

    const status =
      document.createElement(
        "small"
      );

    const key =
      phaseIL6SourceKey(
        item.imageId,
        item.annotationFile
      );

    const currentTargetClass =
      String(
        phaseIL1Refs()
          .classSelect
          ?.value
        || phaseIL1State.targetClass
        || ""
      ).trim();

    const storedReport =
      phaseIL8StoredReport(
        item.imageId,
        item.annotationFile,
        currentTargetClass
      );

    status.textContent =
      storedReport
        ? phaseIL8FormatStoredSourceStatus(
            storedReport,
            currentTargetClass,
            storedReport.targetAnnotations
          )
        : (
            phaseIL6SourceStatus.get(
              key
            )
            || "Target status not checked yet"
          );

    text.append(
      title,
      file,
      status
    );

    const remove =
      document.createElement(
        "button"
      );

    remove.type =
      "button";
    remove.textContent =
      "Remove";

    remove.addEventListener(
      "click",
      () => {
        phaseIL6TrainingSources =
          phaseIL6TrainingSources
            .filter(
              (candidate) =>
                phaseIL6SourceKey(
                  candidate.imageId,
                  candidate.annotationFile
                ) !== key
            );

        phaseIL6SourceStatus.delete(
          key
        );

        phaseIL8SourceReports.delete(
          key
        );

        phaseIL6SaveTrainingSources();
        phaseIL6RenderTrainingSources();
      }
    );

    row.append(
      text,
      remove
    );

    list.append(row);
  }

  phaseIL6UpdateSourceUi();
}


async function phaseIL6RefreshAllSourceStatus() {
  phaseIL6SourceStatus.clear();

  for (
    const item
    of phaseIL6TrainingSources
  ) {
    await phaseIL6RefreshSourceStatus(
      item
    );
  }
}


async function phaseIL6OpenTrainingSet() {
  // Phase IL8.2: an exact current image + current annotation-file pair
  // is already included automatically. Remove stale copies from the
  // auxiliary list, but keep same image + DIFFERENT annotation file.
  const currentKey =
    phaseIL6SourceKey(
      currentImage?.id,
      currentAnnotationFile
    );

  const beforeCleanup =
    phaseIL6TrainingSources.length;

  phaseIL6TrainingSources =
    phaseIL6TrainingSources.filter(
      (item) =>
        phaseIL6SourceKey(
          item.imageId,
          item.annotationFile
        ) !== currentKey
    );

  if (
    phaseIL6TrainingSources.length
    !== beforeCleanup
  ) {
    phaseIL6SourceStatus.delete(
      currentKey
    );

    phaseIL8SourceReports.delete(
      currentKey
    );

    phaseIL6SaveTrainingSources();
  }

  const overlay =
    document.getElementById(
      "phaseIL6TrainingOverlay"
    );

  const imageSelect =
    document.getElementById(
      "phaseIL6ImageSelect"
    );

  if (
    !overlay
    || !imageSelect
  ) {
    return;
  }

  imageSelect.innerHTML = "";

  const candidates =
    (images || [])
      .filter(
        (image) =>
          !image?.localNative
          && (
            image?.hasAnnotations
            || String(image?.id)
               === String(
                 currentImage?.id
               )
          )
      )
      .sort(
        (a, b) =>
          String(a?.name || "")
            .localeCompare(
              String(b?.name || "")
            )
      );

  for (const image of candidates) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      image.id;

    option.textContent =
      image.name
      + (
          String(image.id)
          === String(
            currentImage?.id
          )
            ? " · current"
            : ""
        );

    imageSelect.append(option);
  }

  if (
    currentImage?.id
    && candidates.some(
      (item) =>
        String(item.id)
        === String(
          currentImage.id
        )
    )
  ) {
    imageSelect.value =
      currentImage.id;
  }

  overlay.hidden = false;

  await phaseIL6PopulateFileSelect();

  phaseIL6RenderTrainingSources();

  phaseIL6RefreshAllSourceStatus()
    .catch(
      (error) =>
        console.warn(
          "Could not refresh IL6 training source status",
          error
        )
    );
}


function phaseIL6CloseTrainingSet() {
  const overlay =
    document.getElementById(
      "phaseIL6TrainingOverlay"
    );

  if (overlay) {
    overlay.hidden = true;
  }

  phaseIL6UpdateSourceUi();
}


async function phaseIL6AddTrainingSource() {
  const imageSelect =
    document.getElementById(
      "phaseIL6ImageSelect"
    );

  const fileSelect =
    document.getElementById(
      "phaseIL6FileSelect"
    );

  const message =
    document.getElementById(
      "phaseIL6TrainingMessage"
    );

  const imageId =
    String(
      imageSelect?.value
      || ""
    );

  const annotationFile =
    String(
      fileSelect?.value
      || "Default"
    );

  if (!imageId) return;

  const key =
    phaseIL6SourceKey(
      imageId,
      annotationFile
    );

  const currentKey =
    phaseIL6SourceKey(
      currentImage?.id,
      currentAnnotationFile
    );

  if (key === currentKey) {
    if (message) {
      message.textContent =
        "The current image + annotation file is already included automatically with higher priority.";
    }
    return;
  }

  if (
    phaseIL6TrainingSources
      .some(
        (item) =>
          phaseIL6SourceKey(
            item.imageId,
            item.annotationFile
          ) === key
      )
  ) {
    if (message) {
      message.textContent =
        "That image + annotation file is already selected.";
    }
    return;
  }

  if (
    phaseIL6TrainingSources.length
    >= 12
  ) {
    if (message) {
      message.textContent =
        "A maximum of 12 auxiliary sources is supported.";
    }
    return;
  }

  const item = {
    imageId,
    annotationFile,
  };

  phaseIL6TrainingSources.push(
    item
  );

  phaseIL6SaveTrainingSources();
  phaseIL6RenderTrainingSources();

  if (message) {
    message.textContent = "";
  }

  await phaseIL6RefreshSourceStatus(
    item
  );
}


function phaseIL6EnsureTrainingSetUi() {
  if (
    document.getElementById(
      "phaseIL6TrainingOverlay"
    )
  ) {
    return;
  }

  const overlay =
    document.createElement("div");

  overlay.id =
    "phaseIL6TrainingOverlay";

  overlay.className =
    "phase-il6-training-overlay";

  overlay.hidden = true;

  overlay.innerHTML = `
    <section class="phase-il6-training-card"
             role="dialog"
             aria-labelledby="phaseIL6TrainingTitle">
      <div class="phase-il6-training-header">
        <div>
          <h3 id="phaseIL6TrainingTitle">
            Training set
          </h3>
          <p>
            Choose an image and the annotation file
            that should contribute examples.
          </p>
        </div>
        <button id="phaseIL6TrainingClose"
                type="button"
                aria-label="Close">×</button>
      </div>

      <div class="phase-il6-add-grid">
        <label>
          <span>Image</span>
          <select id="phaseIL6ImageSelect"></select>
        </label>

        <label>
          <span>Annotation file</span>
          <select id="phaseIL6FileSelect"></select>
        </label>

        <button id="phaseIL6AddSource"
                type="button">
          Add source
        </button>
      </div>

      <p id="phaseIL6TrainingMessage"
         class="phase-il6-message"></p>

      <div class="phase-il6-priority-note">
        Current image = highest priority.
        Auxiliary influence adapts to visual similarity.
        Only explicitly annotated non-target classes
        are used as auxiliary negatives.
      </div>

      <div id="phaseIL6TrainingList"
           class="phase-il6-training-list"></div>

      <div class="phase-il6-training-footer">
        <button id="phaseIL6TrainingDone"
                type="button">
          Done
        </button>
      </div>
    </section>
  `;

  document.body.append(
    overlay
  );

  document
    .getElementById(
      "phaseIL6ImageSelect"
    )
    ?.addEventListener(
      "change",
      () =>
        phaseIL6PopulateFileSelect()
    );

  document
    .getElementById(
      "phaseIL6AddSource"
    )
    ?.addEventListener(
      "click",
      () =>
        phaseIL6AddTrainingSource()
    );

  document
    .getElementById(
      "phaseIL6TrainingClose"
    )
    ?.addEventListener(
      "click",
      phaseIL6CloseTrainingSet
    );

  document
    .getElementById(
      "phaseIL6TrainingDone"
    )
    ?.addEventListener(
      "click",
      phaseIL6CloseTrainingSet
    );

  overlay.addEventListener(
    "click",
    (event) => {
      if (event.target === overlay) {
        phaseIL6CloseTrainingSet();
      }
    }
  );
}


function phaseIL6BindSourceControls() {
  const refs =
    phaseIL1Refs();

  if (refs.sourceSelect) {
    const stored =
      localStorage.getItem(
        PHASE_IL6_SOURCE_MODE_KEY
      );

    refs.sourceSelect.value =
      stored === "set"
        ? "set"
        : "current";

    refs.sourceSelect.addEventListener(
      "change",
      () => {
        localStorage.setItem(
          PHASE_IL6_SOURCE_MODE_KEY,
          phaseIL6TrainingMode()
        );

        phaseIL6UpdateSourceUi();
      }
    );
  }

  refs.manageTrainingSet
    ?.addEventListener(
      "click",
      () =>
        phaseIL6OpenTrainingSet()
    );

  refs.classSelect
    ?.addEventListener(
      "change",
      () => {
        phaseIL6SourceStatus.clear();
        phaseIL8SourceReports.clear();
      }
    );

  phaseIL6UpdateSourceUi();
}


// ========================================================================
// Phase IL7 - conservative learning stability / saturation
// ========================================================================

const PHASE_IL7_HISTORY_PREFIX =
  "histoannotator.il7.learningHistory.v2::";


function phaseIL7SourceSignature(
  trainingMode,
  trainingSources
) {
  if (trainingMode !== "set") {
    return "current";
  }

  const sources =
    Array.isArray(trainingSources)
      ? trainingSources
      : [];

  return (
    "set:"
    + sources
      .map(
        (item) =>
          `${item?.imageId || ""}::${item?.annotationFile || "Default"}`
      )
      .sort()
      .join("|")
  );
}


function phaseIL7HistoryKey({
  targetClass,
  trainingMode,
  trainingSources,
  learningModel,
}) {
  if (!currentImage?.id) {
    return null;
  }

  return (
    PHASE_IL7_HISTORY_PREFIX
    + encodeURIComponent(
        [
          currentImage.id,
          currentAnnotationFile
            || "Default",
          String(
            targetClass || ""
          ).toLowerCase(),
          phaseIL92NormalizeLearningModel(
            learningModel
          ),
          phaseIL7SourceSignature(
            trainingMode,
            trainingSources
          ),
        ].join("||")
      )
  );
}


function phaseIL7ReadHistory(key) {
  if (!key) return [];

  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(key)
        || "[]"
      );

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (_) {
    return [];
  }
}


function phaseIL7WriteHistory(
  key,
  history
) {
  if (!key) return;

  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        history.slice(-12)
      )
    );
  } catch (_) {}
}


function phaseIL7MeanUncertainty(
  suggestions
) {
  const values =
    (
      Array.isArray(suggestions)
        ? suggestions
        : []
    )
      .map(
        (item) =>
          Number(
            item?._activeLearning
              ?.uncertainty
          )
      )
      .filter(Number.isFinite);

  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    )
    / values.length
  );
}


function phaseIL7FeedbackSnapshot(
  summary
) {
  return {
    accepted:
      Math.max(
        0,
        Number(
          summary?.accepted || 0
        )
      ),
    rejected:
      Math.max(
        0,
        Number(
          summary?.rejected || 0
        )
      ),
    edited:
      Math.max(
        0,
        Number(
          summary?.edited || 0
        )
      ),
    reclassified:
      Math.max(
        0,
        Number(
          summary?.reclassified || 0
        )
      ),
  };
}


function phaseIL7FeedbackDelta(
  current,
  previous
) {
  const delta = {};

  for (
    const key
    of [
      "accepted",
      "rejected",
      "edited",
      "reclassified",
    ]
  ) {
    delta[key] =
      Math.max(
        0,
        Number(
          current?.[key] || 0
        )
        - Number(
            previous?.[key] || 0
          )
      );
  }

  // Edited target annotations are also present among accepted target
  // Features, so remove that overlap when estimating clean accepts.
  delta.cleanAccepted =
    Math.max(
      0,
      delta.accepted
      - delta.edited
    );

  delta.corrections =
    delta.rejected
    + delta.edited
    + delta.reclassified;

  delta.reviewed =
    delta.cleanAccepted
    + delta.corrections;

  delta.correctionRate =
    delta.reviewed > 0
      ? (
          delta.corrections
          / delta.reviewed
        )
      : null;

  return delta;
}


function phaseIL7EvaluateStatus({
  history,
  uncertainty,
  suggestionCount,
  delta,
}) {
  // Phase IL9.1 - review-performance stability refinement
  //
  // Active Learning deliberately surfaces difficult/uncertain candidates.
  // Absolute uncertainty is therefore secondary to reviewer performance.

  if (suggestionCount < 1) {
    return {
      state:
        "no-suggestions",
      label:
        "No suggestions",
      reason:
        "No candidate regions were returned at the current settings.",
      recentReviewed:
        0,
      recentCorrectionRate:
        null,
      recentAcceptanceRate:
        null,
      uncertaintyChange:
        null,
    };
  }

  if (!history.length) {
    const firstCorrectionRate =
      Number.isFinite(
        Number(
          delta?.correctionRate
        )
      )
        ? Number(
            delta.correctionRate
          )
        : null;

    return {
      state:
        "building",
      label:
        "Building",
      reason:
        "First measured learning round.",
      recentReviewed:
        Math.max(
          0,
          Number(
            delta?.reviewed || 0
          )
        ),
      recentCorrectionRate:
        firstCorrectionRate,
      recentAcceptanceRate:
        Number.isFinite(
          firstCorrectionRate
        )
          ? (
              1
              - firstCorrectionRate
            )
          : null,
      uncertaintyChange:
        null,
    };
  }

  const previous =
    history[
      history.length - 1
    ];

  const previousUncertainty =
    Number(
      previous?.uncertainty
    );

  const uncertaintyChange =
    (
      Number.isFinite(uncertainty)
      && Number.isFinite(
        previousUncertainty
      )
    )
      ? Math.abs(
          uncertainty
          - previousUncertainty
        )
      : null;

  const previousWindow = {
    reviewed:
      Math.max(
        0,
        Number(
          previous
            ?.reviewedSincePrevious
          || 0
        )
      ),
    corrections:
      Math.max(
        0,
        Number(
          previous
            ?.correctionsSincePrevious
          || 0
        )
      ),
  };

  const currentWindow = {
    reviewed:
      Math.max(
        0,
        Number(
          delta?.reviewed || 0
        )
      ),
    corrections:
      Math.max(
        0,
        Number(
          delta?.corrections || 0
        )
      ),
  };

  const recentWindows =
    [
      previousWindow,
      currentWindow,
    ].filter(
      (item) =>
        item.reviewed > 0
    );

  const recentReviewed =
    recentWindows.reduce(
      (sum, item) =>
        sum + item.reviewed,
      0
    );

  const recentCorrections =
    recentWindows.reduce(
      (sum, item) =>
        sum + item.corrections,
      0
    );

  const recentCorrectionRate =
    recentReviewed > 0
      ? (
          recentCorrections
          / recentReviewed
        )
      : null;

  const recentAcceptanceRate =
    Number.isFinite(
      recentCorrectionRate
    )
      ? (
          1
          - recentCorrectionRate
        )
      : null;

  const currentCorrectionRate =
    Number.isFinite(
      Number(
        delta?.correctionRate
      )
    )
      ? Number(
          delta.correctionRate
        )
      : null;

  const enoughRounds =
    history.length >= 2;

  const twoReviewedWindows =
    recentWindows.length >= 2;

  const enoughRecentReviewed =
    recentReviewed >= 8;

  const highRecentAcceptance =
    Number.isFinite(
      recentAcceptanceRate
    )
    && recentAcceptanceRate >= 0.80;

  const lowRecentCorrection =
    Number.isFinite(
      recentCorrectionRate
    )
    && recentCorrectionRate <= 0.20;

  const latestWindowAcceptable =
    Number.isFinite(
      currentCorrectionRate
    )
    && currentCorrectionRate <= 0.25;

  const uncertaintyNotExploding =
    !Number.isFinite(
      uncertaintyChange
    )
    || uncertaintyChange <= 0.25;

  if (
    enoughRounds
    && twoReviewedWindows
    && enoughRecentReviewed
    && highRecentAcceptance
    && lowRecentCorrection
    && latestWindowAcceptable
    && uncertaintyNotExploding
  ) {
    return {
      state:
        "stable",
      label:
        "Stable",
      reason:
        "Recent review performance is consistently high with few corrections.",
      recentReviewed,
      recentCorrectionRate,
      recentAcceptanceRate,
      uncertaintyChange,
    };
  }

  const moderateRecentCorrection =
    Number.isFinite(
      recentCorrectionRate
    )
    && recentCorrectionRate <= 0.35;

  const usefulRecentReview =
    recentReviewed >= 6;

  const latestReasonable =
    Number.isFinite(
      currentCorrectionRate
    )
    && currentCorrectionRate <= 0.35;

  if (
    enoughRounds
    && usefulRecentReview
    && (
      moderateRecentCorrection
      || latestReasonable
    )
  ) {
    return {
      state:
        "stabilizing",
      label:
        "Stabilizing",
      reason:
        "Recent review performance is improving; another consistent round can confirm stability.",
      recentReviewed,
      recentCorrectionRate,
      recentAcceptanceRate,
      uncertaintyChange,
    };
  }

  return {
    state:
      "improving",
    label:
      "Improving",
    reason:
      "Reviewer corrections remain useful for the learner.",
    recentReviewed,
    recentCorrectionRate,
    recentAcceptanceRate,
    uncertaintyChange,
  };
}


function phaseIL7RenderStatus(
  entry = null
) {
  const element =
    document.getElementById(
      "phaseIL7Stability"
    );

  if (!element) return;

  if (!entry) {
    const refs =
      phaseIL1Refs();

    const targetClass =
      String(
        refs.classSelect?.value
        || ""
      ).trim();

    const trainingMode =
      phaseIL6TrainingMode();

    const trainingSources =
      phaseIL6TrainingPayload();

    const learningModel =
      phaseIL92SelectedLearningModel();

    const key =
      phaseIL7HistoryKey({
        targetClass,
        trainingMode,
        trainingSources,
        learningModel,
      });

    const history =
      phaseIL7ReadHistory(key);

    entry =
      history.length
        ? history[
            history.length - 1
          ]
        : null;
  }

  if (!entry) {
    element.dataset.state =
      "unassessed";

    element.textContent =
      "Learning: not assessed";

    element.title =
      "Run Learn & suggest to start measuring learning stability.";

    return;
  }

  element.dataset.state =
    entry.state
    || "unassessed";

  element.textContent =
    `Learning: ${entry.label || "not assessed"}`;

  const details = [
    entry.reason,
  ];

  if (
    Number.isFinite(
      Number(
        entry.recentAcceptanceRate
      )
    )
  ) {
    details.push(
      `recent acceptance ${(
        Number(
          entry.recentAcceptanceRate
        ) * 100
      ).toFixed(0)}%`
    );
  }

  if (
    Number.isFinite(
      Number(
        entry.recentCorrectionRate
      )
    )
  ) {
    details.push(
      `recent correction ${(
        Number(
          entry.recentCorrectionRate
        ) * 100
      ).toFixed(0)}%`
    );
  }

  if (
    Number(
      entry.recentReviewed
      || 0
    ) > 0
  ) {
    details.push(
      `recent reviewed ${Number(
        entry.recentReviewed
      )}`
    );
  }

  if (
    Number.isFinite(
      Number(entry.uncertainty)
    )
  ) {
    details.push(
      `candidate uncertainty ${(
        Number(
          entry.uncertainty
        ) * 100
      ).toFixed(0)}%`
    );
  }

  details.push(
    `round ${Number(
      entry.round || 1
    )}`
  );

  element.title =
    details
      .filter(Boolean)
      .join(" · ");
}


function phaseIL7RecordRound({
  targetClass,
  trainingMode,
  trainingSources,
  learningModel,
  suggestions,
  feedbackSummary,
}) {
  const key =
    phaseIL7HistoryKey({
      targetClass,
      trainingMode,
      trainingSources,
      learningModel,
    });

  if (!key) return null;

  const history =
    phaseIL7ReadHistory(key);

  const feedback =
    phaseIL7FeedbackSnapshot(
      feedbackSummary
    );

  const previousFeedback =
    history.length
      ? history[
          history.length - 1
        ]?.feedback
      : null;

  const delta =
    phaseIL7FeedbackDelta(
      feedback,
      previousFeedback
    );

  const uncertainty =
    phaseIL7MeanUncertainty(
      suggestions
    );

  const suggestionCount =
    Array.isArray(suggestions)
      ? suggestions.length
      : 0;

  const status =
    phaseIL7EvaluateStatus({
      history,
      uncertainty,
      suggestionCount,
      delta,
    });

  const entry = {
    round:
      (
        Number(
          history[
            history.length - 1
          ]?.round || 0
        )
        + 1
      ),
    createdAt:
      new Date().toISOString(),
    learningModel:
      phaseIL92NormalizeLearningModel(
        learningModel
      ),
    learningModelLabel:
      phaseIL92LearningModelLabel(
        learningModel
      ),
    state:
      status.state,
    label:
      status.label,
    reason:
      status.reason,
    uncertainty:
      Number.isFinite(uncertainty)
        ? uncertainty
        : null,
    suggestionCount,
    correctionRate:
      Number.isFinite(
        delta.correctionRate
      )
        ? delta.correctionRate
        : null,
    recentReviewed:
      Math.max(
        0,
        Number(
          status.recentReviewed
          || 0
        )
      ),
    recentCorrectionRate:
      Number.isFinite(
        Number(
          status.recentCorrectionRate
        )
      )
        ? Number(
            status.recentCorrectionRate
          )
        : null,
    recentAcceptanceRate:
      Number.isFinite(
        Number(
          status.recentAcceptanceRate
        )
      )
        ? Number(
            status.recentAcceptanceRate
          )
        : null,
    uncertaintyChange:
      Number.isFinite(
        Number(
          status.uncertaintyChange
        )
      )
        ? Number(
            status.uncertaintyChange
          )
        : null,
    reviewedSincePrevious:
      delta.reviewed,
    correctionsSincePrevious:
      delta.corrections,
    feedback,
  };

  history.push(entry);
  phaseIL7WriteHistory(
    key,
    history
  );
  phaseIL7RenderStatus(entry);

  return entry;
}


function phaseIL7Initialize() {
  const refs =
    phaseIL1Refs();

  refs.classSelect
    ?.addEventListener(
      "change",
      () =>
        phaseIL7RenderStatus()
    );

  refs.sourceSelect
    ?.addEventListener(
      "change",
      () =>
        phaseIL7RenderStatus()
    );

  const modelSelect =
    phaseIL92LearningModelSelect();

  if (
    modelSelect
    && !modelSelect.dataset.il7Bound
  ) {
    modelSelect.dataset.il7Bound =
      "true";

    modelSelect.addEventListener(
      "change",
      () =>
        phaseIL7RenderStatus()
    );
  }

  phaseIL7RenderStatus();
  phaseIL9Initialize();
}



// ========================================================================
// Phase IL8 - compact similarity feedback for selected training sources
// ========================================================================

function phaseIL8ApplySourceReports(
  model
) {
  const reports =
    Array.isArray(
      model?.trainingSources
    )
      ? model.trainingSources
      : [];

  if (!reports.length) {
    return;
  }

  const targetClass =
    String(
      model?.targetClass
      || phaseIL1State.targetClass
      || ""
    ).trim();

  const learningModel =
    String(
      model?.learningModel
      || ""
    ).toUpperCase();

  for (const report of reports) {
    const key =
      phaseIL6SourceKey(
        report.imageId,
        report.annotationFile
      );

    const storedReport = {
      ...report,
      targetClass,
      learningModel,
    };

    phaseIL8SourceReports.set(
      key,
      storedReport
    );

    phaseIL6SourceStatus.set(
      key,
      phaseIL8FormatStoredSourceStatus(
        storedReport,
        targetClass,
        report.targetAnnotations
      )
    );
  }

  phaseIL6RenderTrainingSources();
}


// ========================================================================
// Phase IL9 - learning evaluation and CSV report
//
// Local-only evaluation metadata. No geometry, model weights or images are
// copied into this history. A configuration is:
// image + annotation file + target class + learning model + source mode + selected sources.
// ========================================================================

const PHASE_IL9_HISTORY_PREFIX =
  "histoannotator.il9.evaluation.v2::";

let phaseIL9ActiveContext =
  null;


function phaseIL92NormalizeLearningModel(
  value
) {
  const normalized =
    String(value || "")
      .trim()
      .toUpperCase();

  return ["A", "B", "C"]
    .includes(normalized)
      ? normalized
      : "A";
}


function phaseIL92LearningModelLabel(
  value
) {
  const learningModel =
    phaseIL92NormalizeLearningModel(
      value
    );

  if (learningModel === "B") {
    return "Deep Features";
  }

  if (learningModel === "C") {
    return "Deep Spatial";
  }

  return "Classical";
}


function phaseIL92LearningModelSelect() {
  for (
    const id
    of [
      "phaseIL1ModelSelect",
      "phaseIL10ModelSelect",
      "phaseIL1LearningModelSelect",
    ]
  ) {
    const candidate =
      document.getElementById(id);

    if (
      candidate?.tagName
      === "SELECT"
    ) {
      return candidate;
    }
  }

  const overlay =
    document.getElementById(
      "phaseIL1Overlay"
    );

  for (
    const select
    of overlay
      ?.querySelectorAll("select")
      || []
  ) {
    const values =
      new Set(
        Array.from(
          select.options || []
        ).map(
          (option) =>
            String(
              option.value || ""
            )
              .trim()
              .toUpperCase()
        )
      );

    if (
      values.has("A")
      && values.has("B")
      && values.has("C")
    ) {
      return select;
    }
  }

  return null;
}


function phaseIL92SelectedLearningModel() {
  return phaseIL92NormalizeLearningModel(
    phaseIL92LearningModelSelect()
      ?.value
    || phaseIL1State.model
      ?.learningModel
    || "A"
  );
}


function phaseIL9Uid(prefix = "il9") {
  try {
    if (window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
  } catch (_) {}

  return (
    `${prefix}-${Date.now()}-`
    + Math.random()
      .toString(36)
      .slice(2, 10)
  );
}


function phaseIL9CurrentConfig() {
  const refs =
    phaseIL1Refs();

  const targetClass =
    String(
      refs.classSelect?.value
      || phaseIL1State.targetClass
      || ""
    ).trim();

  const trainingMode =
    phaseIL6TrainingMode();

  const trainingSources =
    phaseIL6TrainingPayload();

  const learningModel =
    phaseIL92SelectedLearningModel();

  const learningModelLabel =
    phaseIL92LearningModelLabel(
      learningModel
    );

  return {
    imageId:
      String(
        currentImage?.id || ""
      ),
    imageName:
      String(
        currentImage?.name || ""
      ),
    annotationFile:
      String(
        currentAnnotationFile
        || "Default"
      ),
    targetClass,
    learningModel,
    learningModelLabel,
    trainingMode,
    trainingSources:
      trainingSources.map(
        (item) => ({
          imageId:
            String(
              item?.imageId || ""
            ),
          annotationFile:
            String(
              item?.annotationFile
              || "Default"
            ),
        })
      ),
    sourceSignature:
      phaseIL7SourceSignature(
        trainingMode,
        trainingSources
      ),
  };
}


function phaseIL9StorageKey(
  config = phaseIL9CurrentConfig()
) {
  if (
    !config?.imageId
    || !config?.targetClass
  ) {
    return null;
  }

  const learningModel =
    phaseIL92NormalizeLearningModel(
      config.learningModel
    );

  return (
    PHASE_IL9_HISTORY_PREFIX
    + encodeURIComponent(
        [
          config.imageId,
          config.annotationFile,
          config.targetClass
            .toLowerCase(),
          learningModel,
          config.sourceSignature,
        ].join("||")
      )
  );
}


function phaseIL9EmptyStore(config) {
  const learningModel =
    phaseIL92NormalizeLearningModel(
      config?.learningModel
    );

  return {
    schemaVersion: 2,
    configuration: {
      imageId:
        config.imageId,
      imageName:
        config.imageName,
      annotationFile:
        config.annotationFile,
      targetClass:
        config.targetClass,
      learningModel,
      learningModelLabel:
        String(
          config.learningModelLabel
          || phaseIL92LearningModelLabel(
            learningModel
          )
        ),
      trainingMode:
        config.trainingMode,
      sourceSignature:
        config.sourceSignature,
      trainingSources:
        deepClone(
          config.trainingSources
        ),
    },
    sessions: [],
  };
}


function phaseIL9ReadStore(
  key,
  config = null
) {
  if (!key) {
    return config
      ? phaseIL9EmptyStore(config)
      : null;
  }

  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(key)
        || "null"
      );

    if (
      parsed
      && typeof parsed === "object"
      && Array.isArray(
        parsed.sessions
      )
    ) {
      return parsed;
    }
  } catch (_) {}

  return config
    ? phaseIL9EmptyStore(config)
    : null;
}


function phaseIL9WriteStore(
  key,
  store
) {
  if (!key || !store) return;

  store.sessions =
    (
      Array.isArray(
        store.sessions
      )
        ? store.sessions
        : []
    )
      .slice(-20)
      .map(
        (session) => ({
          ...session,
          rounds:
            (
              Array.isArray(
                session?.rounds
              )
                ? session.rounds
                : []
            ).slice(-60),
        })
      );

  try {
    localStorage.setItem(
      key,
      JSON.stringify(store)
    );
  } catch (error) {
    console.warn(
      "IL9 evaluation history could not be saved",
      error
    );
  }
}


function phaseIL9NewSessionRecord(
  config
) {
  return {
    id:
      phaseIL9Uid("session"),
    startedAt:
      new Date().toISOString(),
    endedAt:
      null,
    imageId:
      config.imageId,
    imageName:
      config.imageName,
    annotationFile:
      config.annotationFile,
    targetClass:
      config.targetClass,
    trainingMode:
      config.trainingMode,
    sourceSignature:
      config.sourceSignature,
    trainingSources:
      deepClone(
        config.trainingSources
      ),
    rounds: [],
  };
}


function phaseIL9EnsureSession(
  store,
  config
) {
  let session =
    store.sessions[
      store.sessions.length - 1
    ];

  if (
    !session
    || session.endedAt
  ) {
    session =
      phaseIL9NewSessionRecord(
        config
      );

    store.sessions.push(
      session
    );
  }

  return session;
}


function phaseIL9RoundMetrics(
  round
) {
  const decisions =
    Object.values(
      round?.decisions || {}
    );

  const reviewed =
    decisions.length;

  const accepted =
    decisions.filter(
      (item) =>
        item?.decision
        === "accepted"
        && !item?.edited
    ).length;

  const rejected =
    decisions.filter(
      (item) =>
        item?.decision
        === "rejected"
    ).length;

  const reclassified =
    decisions.filter(
      (item) =>
        item?.decision
        === "reclassified"
    ).length;

  const edited =
    decisions.filter(
      (item) =>
        Boolean(
          item?.edited
        )
        || item?.decision
          === "edited"
    ).length;

  const corrections =
    decisions.filter(
      (item) =>
        item?.decision
          !== "accepted"
        || Boolean(
          item?.edited
        )
    ).length;

  const later =
    new Set(
      Array.isArray(
        round?.laterIds
      )
        ? round.laterIds
        : []
    ).size;

  return {
    reviewed,
    accepted,
    rejected,
    edited,
    reclassified,
    later,
    corrections,
    acceptanceRate:
      reviewed > 0
        ? accepted / reviewed
        : null,
    correctionRate:
      reviewed > 0
        ? corrections / reviewed
        : null,
    editRate:
      reviewed > 0
        ? edited / reviewed
        : null,
    reclassificationRate:
      reviewed > 0
        ? reclassified / reviewed
        : null,
  };
}


function phaseIL9SessionMetrics(
  session
) {
  const rounds =
    Array.isArray(
      session?.rounds
    )
      ? session.rounds
      : [];

  const totals = {
    reviewed: 0,
    accepted: 0,
    rejected: 0,
    edited: 0,
    reclassified: 0,
    later: 0,
    corrections: 0,
  };

  let stableRound =
    null;

  for (const round of rounds) {
    const metrics =
      phaseIL9RoundMetrics(
        round
      );

    for (
      const key
      of Object.keys(totals)
    ) {
      totals[key] +=
        Number(
          metrics[key] || 0
        );
    }

    if (
      stableRound === null
      && String(
        round?.stabilityState
        || ""
      ) === "stable"
    ) {
      stableRound =
        Number(
          round?.round || 0
        )
        || null;
    }
  }

  return {
    ...totals,
    rounds:
      rounds.length,
    stableRound,
    acceptanceRate:
      totals.reviewed > 0
        ? (
            totals.accepted
            / totals.reviewed
          )
        : null,
    correctionRate:
      totals.reviewed > 0
        ? (
            totals.corrections
            / totals.reviewed
          )
        : null,
  };
}


function phaseIL9Mean(
  values
) {
  const usable =
    values
      .map(Number)
      .filter(
        Number.isFinite
      );

  if (!usable.length) {
    return null;
  }

  return (
    usable.reduce(
      (sum, value) =>
        sum + value,
      0
    )
    / usable.length
  );
}


function phaseIL9SourceMetrics(
  model
) {
  const reports =
    Array.isArray(
      model?.trainingSources
    )
      ? model.trainingSources
      : [];

  const similarities =
    reports.map(
      (item) =>
        item?.appearanceSimilarity
    );

  const weights =
    reports.map(
      (item) =>
        item?.effectiveWeight
    );

  const usableSimilarities =
    similarities
      .map(Number)
      .filter(
        Number.isFinite
      );

  return {
    auxiliarySourceCount:
      reports.length,
    meanAuxiliarySimilarity:
      phaseIL9Mean(
        similarities
      ),
    minAuxiliarySimilarity:
      usableSimilarities.length
        ? Math.min(
            ...usableSimilarities
          )
        : null,
    maxAuxiliarySimilarity:
      usableSimilarities.length
        ? Math.max(
            ...usableSimilarities
          )
        : null,
    meanAuxiliaryWeight:
      phaseIL9Mean(
        weights
      ),
  };
}


function phaseIL9SuggestionId(
  suggestion
) {
  return String(
    suggestion?.id || ""
  );
}


function phaseIL9MutateActiveRound(
  mutate
) {
  const context =
    phaseIL9ActiveContext;

  if (!context?.key) {
    return false;
  }

  const store =
    phaseIL9ReadStore(
      context.key
    );

  if (!store) return false;

  const session =
    store.sessions.find(
      (item) =>
        String(item?.id || "")
        === String(
          context.sessionId || ""
        )
    );

  if (!session) {
    return false;
  }

  const round =
    (session.rounds || [])
      .find(
        (item) =>
          String(item?.id || "")
          === String(
            context.roundId || ""
          )
      );

  if (!round) {
    return false;
  }

  mutate(
    round,
    session,
    store
  );

  phaseIL9WriteStore(
    context.key,
    store
  );

  phaseIL9RenderProgress(
    context.key
  );

  return true;
}


function phaseIL9RecordDecisionById(
  suggestionId,
  decision,
  {
    edited = false,
  } = {}
) {
  const id =
    String(
      suggestionId || ""
    );

  if (!id) return;

  const normalized =
    String(
      decision || ""
    ).toLowerCase();

  const allowed =
    new Set([
      "accepted",
      "rejected",
      "edited",
      "reclassified",
    ]);

  if (!allowed.has(normalized)) {
    return;
  }

  phaseIL9MutateActiveRound(
    (round) => {
      round.decisions =
        round.decisions
        && typeof round.decisions
          === "object"
          ? round.decisions
          : {};

      if (round.decisions[id]) {
        return;
      }

      round.decisions[id] = {
        decision:
          normalized,
        edited:
          Boolean(edited)
          || normalized === "edited",
        decidedAt:
          new Date().toISOString(),
      };

      round.lastActionAt =
        new Date().toISOString();
    }
  );
}


function phaseIL9RecordDecision(
  suggestion,
  decision,
  options = {}
) {
  phaseIL9RecordDecisionById(
    phaseIL9SuggestionId(
      suggestion
    ),
    decision,
    options
  );
}


function phaseIL9RecordLater(
  suggestion
) {
  const id =
    phaseIL9SuggestionId(
      suggestion
    );

  if (!id) return;

  phaseIL9MutateActiveRound(
    (round) => {
      const ids =
        new Set(
          Array.isArray(
            round.laterIds
          )
            ? round.laterIds
            : []
        );

      ids.add(id);

      round.laterIds =
        [...ids];

      round.lastActionAt =
        new Date().toISOString();
    }
  );
}


function phaseIL9StartRound({
  config,
  learningStartedAt,
  model,
  suggestions,
  stabilityEntry,
  sensitivity,
  smoothing,
  minAreaPercent,
  excludeAnnotated,
}) {
  const learningModel =
    phaseIL92NormalizeLearningModel(
      model?.learningModel
      || config?.learningModel
    );

  const learningModelLabel =
    String(
      model?.learningModelLabel
      || config?.learningModelLabel
      || phaseIL92LearningModelLabel(
        learningModel
      )
    );

  config = {
    ...config,
    learningModel,
    learningModelLabel,
  };

  const key =
    phaseIL9StorageKey(
      config
    );

  if (!key) return;

  const store =
    phaseIL9ReadStore(
      key,
      config
    );

  store.configuration = {
    imageId:
      config.imageId,
    imageName:
      config.imageName,
    annotationFile:
      config.annotationFile,
    targetClass:
      config.targetClass,
    learningModel,
    learningModelLabel,
    trainingMode:
      config.trainingMode,
    sourceSignature:
      config.sourceSignature,
    trainingSources:
      deepClone(
        config.trainingSources
      ),
  };

  const session =
    phaseIL9EnsureSession(
      store,
      config
    );

  const now =
    Date.now();

  const sourceMetrics =
    phaseIL9SourceMetrics(
      model
    );

  const round = {
    id:
      phaseIL9Uid("round"),
    round:
      (session.rounds?.length || 0)
      + 1,
    startedAt:
      new Date(
        learningStartedAt
      ).toISOString(),
    completedAt:
      new Date(now)
        .toISOString(),
    lastActionAt:
      null,
    learningDurationMs:
      Math.max(
        0,
        now
        - Number(
            learningStartedAt
            || now
          )
      ),
    suggestionsGenerated:
      Array.isArray(
        suggestions
      )
        ? suggestions.length
        : 0,
    meanUncertainty:
      phaseIL7MeanUncertainty(
        suggestions
      ),
    sensitivity:
      Number(
        sensitivity
      ),
    smoothing:
      Number(
        smoothing
      ),
    minAreaPercent:
      Number(
        minAreaPercent
      ),
    excludeAnnotated:
      Boolean(
        excludeAnnotated
      ),
    learningModel,
    learningModelLabel,
    modelType:
      String(
        model?.type || ""
      ),
    positiveTrainingPixels:
      Number(
        model?.positiveTrainingPixels
        || 0
      ),
    negativeTrainingPixels:
      Number(
        model?.negativeTrainingPixels
        || 0
      ),
    auxiliarySourceCount:
      sourceMetrics
        .auxiliarySourceCount,
    meanAuxiliarySimilarity:
      sourceMetrics
        .meanAuxiliarySimilarity,
    minAuxiliarySimilarity:
      sourceMetrics
        .minAuxiliarySimilarity,
    maxAuxiliarySimilarity:
      sourceMetrics
        .maxAuxiliarySimilarity,
    meanAuxiliaryWeight:
      sourceMetrics
        .meanAuxiliaryWeight,
    stabilityState:
      String(
        stabilityEntry?.state
        || "unassessed"
      ),
    stabilityLabel:
      String(
        stabilityEntry?.label
        || "Not assessed"
      ),
    stabilityRecentReviewed:
      Math.max(
        0,
        Number(
          stabilityEntry
            ?.recentReviewed
          || 0
        )
      ),
    stabilityRecentAcceptanceRate:
      Number.isFinite(
        Number(
          stabilityEntry
            ?.recentAcceptanceRate
        )
      )
        ? Number(
            stabilityEntry
              .recentAcceptanceRate
          )
        : null,
    stabilityRecentCorrectionRate:
      Number.isFinite(
        Number(
          stabilityEntry
            ?.recentCorrectionRate
        )
      )
        ? Number(
            stabilityEntry
              .recentCorrectionRate
          )
        : null,
    decisions: {},
    laterIds: [],
  };

  session.rounds ||= [];
  session.rounds.push(
    round
  );

  phaseIL9WriteStore(
    key,
    store
  );

  phaseIL9ActiveContext = {
    key,
    sessionId:
      session.id,
    roundId:
      round.id,
  };

  phaseIL9RenderProgress(
    key
  );
}


function phaseIL9UiRefs() {
  return {
    progress:
      document.getElementById(
        "phaseIL9Progress"
      ),
    exportButton:
      document.getElementById(
        "phaseIL9ExportButton"
      ),
    newSessionButton:
      document.getElementById(
        "phaseIL9NewSessionButton"
      ),
  };
}


function phaseIL9StoreForDisplay(
  preferredKey = null
) {
  const config =
    phaseIL9CurrentConfig();

  const currentKey =
    phaseIL9StorageKey(
      config
    );

  const key =
    preferredKey
    || (
      (
        phaseIL1State
          .suggestions
          ?.length
        || phaseIL21EditSession
      )
        ? phaseIL9ActiveContext?.key
        : null
    )
    || currentKey;

  if (!key) {
    return {
      key: null,
      store: null,
    };
  }

  return {
    key,
    store:
      phaseIL9ReadStore(
        key,
        key === currentKey
          ? config
          : null
      ),
  };
}


function phaseIL9RenderProgress(
  preferredKey = null
) {
  const refs =
    phaseIL9UiRefs();

  if (!refs.progress) return;

  const {
    store,
  } =
    phaseIL9StoreForDisplay(
      preferredKey
    );

  const session =
    store?.sessions?.[
      store.sessions.length - 1
    ];

  if (
    !session
    || !session.rounds?.length
  ) {
    refs.progress.textContent =
      "Learning progress · no rounds yet";

    refs.progress.title =
      "Run Learn & suggest to start an evaluation session.";

    if (refs.exportButton) {
      refs.exportButton.disabled =
        !store?.sessions?.some(
          (item) =>
            item?.rounds?.length
        );
    }

    return;
  }

  const metrics =
    phaseIL9SessionMetrics(
      session
    );

  const latest =
    session.rounds[
      session.rounds.length - 1
    ];

  const acceptance =
    metrics.acceptanceRate === null
      ? "—"
      : (
          `${Math.round(
            metrics.acceptanceRate
            * 100
          )}%`
        );

  const stateText =
    metrics.stableRound
      ? (
          `Stable after ${metrics.stableRound} round`
          + `${metrics.stableRound === 1 ? "" : "s"}`
        )
      : (
          latest?.stabilityLabel
          || "Not assessed"
        );

  refs.progress.textContent =
    (
      `Learning progress · Reviewed ${metrics.reviewed}`
      + ` · Accepted ${acceptance}`
      + ` · Round ${metrics.rounds}`
      + ` · ${stateText}`
    );

  refs.progress.title =
    (
      `Rejected ${metrics.rejected}`
      + ` · Edited ${metrics.edited}`
      + ` · Reclassified ${metrics.reclassified}`
      + ` · Later ${metrics.later}`
      + (
          metrics.correctionRate === null
            ? ""
            : (
                ` · Correction rate `
                + `${Math.round(
                    metrics.correctionRate
                    * 100
                  )}%`
              )
        )
    );

  if (refs.exportButton) {
    refs.exportButton.disabled =
      false;
  }
}


function phaseIL9FormatRate(
  value
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "";
  }

  return (
    number * 100
  ).toFixed(2);
}


function phaseIL9ReviewElapsedMs(
  round
) {
  if (
    !round?.completedAt
    || !round?.lastActionAt
  ) {
    return null;
  }

  const start =
    Date.parse(
      round.completedAt
    );

  const end =
    Date.parse(
      round.lastActionAt
    );

  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
  ) {
    return null;
  }

  return Math.max(
    0,
    end - start
  );
}


function phaseIL9ExportReport() {
  const {
    key,
    store,
  } =
    phaseIL9StoreForDisplay();

  const sessions =
    store?.sessions || [];

  if (
    !key
    || !sessions.some(
      (session) =>
        session?.rounds?.length
    )
  ) {
    setStatus(
      "No learning evaluation rounds to export",
      "error"
    );
    return;
  }

  const header = [
    "SessionId",
    "SessionStartedAt",
    "Image",
    "AnnotationFile",
    "TargetClass",
    "SourceMode",
    "SourceSignature",
    "AuxiliarySources",
    "Round",
    "RoundStartedAt",
    "RoundCompletedAt",
    "LearningDuration_s",
    "ReviewElapsed_s",
    "SuggestionsGenerated",
    "Reviewed",
    "Accepted",
    "Rejected",
    "Edited",
    "Reclassified",
    "Later",
    "AcceptanceRate_pct",
    "CorrectionRate_pct",
    "EditRate_pct",
    "ReclassificationRate_pct",
    "MeanUncertainty",
    "StabilityState",
    "StabilityLabel",
    "StabilityRecentReviewed",
    "StabilityRecentAcceptanceRate_pct",
    "StabilityRecentCorrectionRate_pct",
    "LearningModel",
    "LearningModelLabel",
    "Model",
    "PositiveTrainingPixels",
    "NegativeTrainingPixels",
    "MeanAuxiliarySimilarity_pct",
    "MinAuxiliarySimilarity_pct",
    "MaxAuxiliarySimilarity_pct",
    "MeanAuxiliaryWeight",
    "Sensitivity",
    "Smoothing",
    "MinimumSuggestionArea_pct",
    "ExcludeAnnotated",
  ];

  const rows = [
    header,
  ];

  for (const session of sessions) {
    for (
      const round
      of session?.rounds || []
    ) {
      const metrics =
        phaseIL9RoundMetrics(
          round
        );

      const reviewElapsed =
        phaseIL9ReviewElapsedMs(
          round
        );

      rows.push([
        session.id || "",
        session.startedAt || "",
        session.imageName || "",
        session.annotationFile || "",
        session.targetClass || "",
        session.trainingMode || "",
        session.sourceSignature || "",
        Array.isArray(
          session.trainingSources
        )
          ? session.trainingSources.length
          : 0,
        round.round || "",
        round.startedAt || "",
        round.completedAt || "",
        Number.isFinite(
          Number(
            round.learningDurationMs
          )
        )
          ? (
              Number(
                round.learningDurationMs
              ) / 1000
            ).toFixed(3)
          : "",
        reviewElapsed === null
          ? ""
          : (
              reviewElapsed / 1000
            ).toFixed(3),
        round.suggestionsGenerated ?? "",
        metrics.reviewed,
        metrics.accepted,
        metrics.rejected,
        metrics.edited,
        metrics.reclassified,
        metrics.later,
        phaseIL9FormatRate(
          metrics.acceptanceRate
        ),
        phaseIL9FormatRate(
          metrics.correctionRate
        ),
        phaseIL9FormatRate(
          metrics.editRate
        ),
        phaseIL9FormatRate(
          metrics.reclassificationRate
        ),
        Number.isFinite(
          Number(
            round.meanUncertainty
          )
        )
          ? Number(
              round.meanUncertainty
            ).toFixed(6)
          : "",
        round.stabilityState || "",
        round.stabilityLabel || "",
        round.stabilityRecentReviewed ?? "",
        phaseIL9FormatRate(
          round.stabilityRecentAcceptanceRate
        ),
        phaseIL9FormatRate(
          round.stabilityRecentCorrectionRate
        ),
        round.learningModel
          || store.configuration
            ?.learningModel
          || "",
        round.learningModelLabel
          || store.configuration
            ?.learningModelLabel
          || "",
        round.modelType || "",
        round.positiveTrainingPixels ?? "",
        round.negativeTrainingPixels ?? "",
        phaseIL9FormatRate(
          round.meanAuxiliarySimilarity
        ),
        phaseIL9FormatRate(
          round.minAuxiliarySimilarity
        ),
        phaseIL9FormatRate(
          round.maxAuxiliarySimilarity
        ),
        Number.isFinite(
          Number(
            round.meanAuxiliaryWeight
          )
        )
          ? Number(
              round.meanAuxiliaryWeight
            ).toFixed(6)
          : "",
        round.sensitivity ?? "",
        round.smoothing ?? "",
        round.minAreaPercent ?? "",
        round.excludeAnnotated
          ? "true"
          : "false",
      ]);
    }
  }

  const csv =
    rows
      .map(
        (row) =>
          row
            .map(
              phaseECsvCell
            )
            .join(",")
      )
      .join("\r\n")
    + "\r\n";

  const configuration =
    store.configuration || {};

  const imagePart =
    String(
      configuration.imageName
      || "image"
    )
      .replace(
        /\.[^.]+$/,
        ""
      )
      .replace(
        /[^A-Za-z0-9._-]+/g,
        "_"
      );

  const classPart =
    String(
      configuration.targetClass
      || "class"
    )
      .replace(
        /[^A-Za-z0-9._-]+/g,
        "_"
      );

  const modelPart =
    phaseIL92NormalizeLearningModel(
      configuration.learningModel
      || "A"
    );

  phaseEDownloadText(
    `${imagePart}_${classPart}_${modelPart}_learning_report.csv`,
    csv
  );

  setStatus(
    "Learning report CSV exported",
    "saved"
  );
}


function phaseIL9StartNewSession() {
  const config =
    phaseIL9CurrentConfig();

  const key =
    phaseIL9StorageKey(
      config
    );

  if (!key) {
    setStatus(
      "Choose an image and target class first",
      "error"
    );
    return;
  }

  const hasActiveReview =
    Boolean(
      phaseIL1State
        .suggestions
        ?.length
    )
    || Boolean(
      phaseIL21EditSession
    );

  if (
    hasActiveReview
    && !window.confirm(
      "Start a new evaluation session? Current temporary suggestions will be cleared."
    )
  ) {
    return;
  }

  const store =
    phaseIL9ReadStore(
      key,
      config
    );

  const previous =
    store.sessions[
      store.sessions.length - 1
    ];

  if (
    previous
    && !previous.endedAt
  ) {
    previous.endedAt =
      new Date().toISOString();
  }

  const session =
    phaseIL9NewSessionRecord(
      config
    );

  store.sessions.push(
    session
  );

  phaseIL9WriteStore(
    key,
    store
  );

  phaseIL9ActiveContext =
    null;

  if (hasActiveReview) {
    phaseIL1ClearSuggestions(
      "New evaluation session started. Run Learn & suggest.",
      true
    );
  }

  phaseIL9RenderProgress(
    key
  );

  setStatus(
    "New learning evaluation session started",
    "saved"
  );
}


function phaseIL9Initialize() {
  phaseIL92LearningModelSelect()
    ?.addEventListener(
      "change",
      () =>
        phaseIL9RenderProgress()
    );

  const refs =
    phaseIL9UiRefs();

  if (
    refs.exportButton
    && !refs.exportButton
      .dataset.il9Bound
  ) {
    refs.exportButton
      .dataset.il9Bound =
        "true";

    refs.exportButton
      .addEventListener(
        "click",
        phaseIL9ExportReport
      );
  }

  if (
    refs.newSessionButton
    && !refs.newSessionButton
      .dataset.il9Bound
  ) {
    refs.newSessionButton
      .dataset.il9Bound =
        "true";

    refs.newSessionButton
      .addEventListener(
        "click",
        phaseIL9StartNewSession
      );
  }

  const ilRefs =
    phaseIL1Refs();

  ilRefs.classSelect
    ?.addEventListener(
      "change",
      () =>
        phaseIL9RenderProgress()
    );

  ilRefs.sourceSelect
    ?.addEventListener(
      "change",
      () =>
        phaseIL9RenderProgress()
    );

  phaseIL9RenderProgress();
}


function phaseIL1Refs() {
  return {
    menu:
      document.getElementById(
        "phaseIL1MenuButton"
      ),
    overlay:
      document.getElementById(
        "phaseIL1Overlay"
      ),
    close:
      document.getElementById(
        "phaseIL1CloseButton"
      ),
    classSelect:
      document.getElementById(
        "phaseIL1ClassSelect"
      ),
    sensitivity:
      document.getElementById(
        "phaseIL1Sensitivity"
      ),
    sensitivityValue:
      document.getElementById(
        "phaseIL1SensitivityValue"
      ),
    smoothing:
      document.getElementById(
        "phaseIL1Smoothing"
      ),
    smoothingValue:
      document.getElementById(
        "phaseIL1SmoothingValue"
      ),
    minArea:
      document.getElementById(
        "phaseIL1MinArea"
      ),
    excludeAnnotated:
      document.getElementById(
        "phaseIL1ExcludeAnnotated"
      ),
    sourceSelect:
      document.getElementById(
        "phaseIL6SourceSelect"
      ),
    trainingSetRow:
      document.getElementById(
        "phaseIL6TrainingSetRow"
      ),
    manageTrainingSet:
      document.getElementById(
        "phaseIL6ManageTrainingSet"
      ),
    trainingSetSummary:
      document.getElementById(
        "phaseIL6TrainingSetSummary"
      ),
    run:
      document.getElementById(
        "phaseIL1RunButton"
      ),
    clear:
      document.getElementById(
        "phaseIL1ClearButton"
      ),
    trainingInfo:
      document.getElementById(
        "phaseIL1TrainingInfo"
      ),
    suggestionPanel:
      document.getElementById(
        "phaseIL1SuggestionPanel"
      ),
    counter:
      document.getElementById(
        "phaseIL1SuggestionCounter"
      ),
    info:
      document.getElementById(
        "phaseIL1SuggestionInfo"
      ),
    previous:
      document.getElementById(
        "phaseIL1PrevButton"
      ),
    next:
      document.getElementById(
        "phaseIL1NextButton"
      ),
    reject:
      document.getElementById(
        "phaseIL1RejectButton"
      ),
    edit:
      document.getElementById(
        "phaseIL1EditButton"
      ),
    accept:
      document.getElementById(
        "phaseIL1AcceptButton"
      ),
  };
}


function phaseIL1EnsureUi() {
  if (
    document.getElementById(
      "phaseIL1Overlay"
    )
  ) {
    return;
  }

  const duplicate =
    document.getElementById(
      "phaseGDuplicateAnnotationButton"
    );

  if (!duplicate?.parentElement) {
    throw new Error(
      "Interactive Learning could not find Settings"
    );
  }

  const separator =
    document.createElement("div");

  separator.className =
    "menu-separator phase-il1-settings-separator";

  const menuButton =
    document.createElement("button");

  menuButton.id =
    "phaseIL1MenuButton";
  menuButton.type =
    "button";
  menuButton.className =
    duplicate.className || "menu-item";
  menuButton.textContent =
    "Interactive Learning…";

  duplicate.insertAdjacentElement(
    "afterend",
    separator
  );

  separator.insertAdjacentElement(
    "afterend",
    menuButton
  );

  const overlay =
    document.createElement("div");

  overlay.id =
    "phaseIL1Overlay";
  overlay.className =
    "phase-il1-overlay";
  overlay.hidden =
    true;

  overlay.innerHTML = `
    <section class="phase-il1-card"
             role="dialog"
             aria-labelledby="phaseIL1Title">
      <div class="phase-il1-header">
        <div>
          <h2 id="phaseIL1Title">
            Interactive Learning
          </h2>
          <p>
            Learn from the current annotation file
            or selected labeled image sources, then
            preview suggestions on the current image.
          </p>
        </div>
        <button id="phaseIL1CloseButton"
                type="button"
                class="phase-il1-close"
                aria-label="Close">×</button>
      </div>

      <div class="phase-il1-grid">
        <label>
          <span>Target class</span>
          <select id="phaseIL1ClassSelect"></select>
        </label>

        <label>
          <span>Learning model</span>
          <select id="phaseIL10ModelSelect"
                  title="Choose the learning approach">
            <option value="A">
              A · Classical
            </option>
            <option value="B" disabled>
              B · Deep Features
            </option>
            <option value="C" disabled>
              C · Deep Spatial
            </option>
          </select>
          <small id="phaseIL10ModelStatus">
            A uses CPU · deep models will use GPU automatically when available.
          </small>
        </label>

        <label>
          <span>Learning source</span>
          <select id="phaseIL6SourceSelect">
            <option value="current">
              Current image
            </option>
            <option value="set">
              Selected training set
            </option>
          </select>
        </label>

        <div id="phaseIL6TrainingSetRow"
             class="phase-il6-training-set-row"
             hidden>
          <button id="phaseIL6ManageTrainingSet"
                  type="button">
            Training set…
          </button>
          <span id="phaseIL6TrainingSetSummary">
            Current image + no auxiliary sources
          </span>
        </div>

        <label>
          <span>
            Sensitivity
            <output id="phaseIL1SensitivityValue">
              50
            </output>
          </span>
          <input id="phaseIL1Sensitivity"
                 type="range"
                 min="0"
                 max="100"
                 step="5"
                 value="50">
        </label>

        <label>
          <span>
            Smoothing
            <output id="phaseIL1SmoothingValue">
              45
            </output>
          </span>
          <input id="phaseIL1Smoothing"
                 type="range"
                 min="0"
                 max="100"
                 step="5"
                 value="45">
        </label>

        <label>
          <span>
            Minimum suggestion area
            (% valid region)
          </span>
          <input id="phaseIL1MinArea"
                 type="number"
                 min="0"
                 max="5"
                 step="0.01"
                 value="0.02">
        </label>

        <label class="phase-il1-checkbox">
          <input id="phaseIL1ExcludeAnnotated"
                 type="checkbox"
                 checked>
          <span>
            Suggest only currently unannotated tissue
          </span>
        </label>
      </div>

      <div class="phase-il1-run-row">
        <button id="phaseIL1RunButton"
                type="button">
          Learn & suggest
        </button>
        <button id="phaseIL1ClearButton"
                type="button">
          Clear
        </button>
      </div>

      <div id="phaseIL1TrainingInfo"
           class="phase-il1-training-info">
        Choose a class with existing annotations.
      </div>

      <div id="phaseIL7Stability"
           class="phase-il7-stability"
           data-state="unassessed"
           title="Run Learn & suggest to start measuring learning stability.">
        Learning: not assessed
      </div>

      <div class="phase-il9-evaluation">
        <div id="phaseIL9Progress"
             class="phase-il9-progress">
          Learning progress · no rounds yet
        </div>

        <div class="phase-il9-actions">
          <button id="phaseIL9ExportButton"
                  type="button"
                  disabled>
            Export learning report
          </button>

          <button id="phaseIL9NewSessionButton"
                  type="button">
            New session
          </button>
        </div>
      </div>

      <div id="phaseIL1SuggestionPanel"
           class="phase-il1-suggestion-panel"
           hidden>
        <div class="phase-il1-suggestion-top">
          <button id="phaseIL1PrevButton"
                  type="button">‹</button>

          <strong id="phaseIL1SuggestionCounter">
            Suggestion
          </strong>

          <button id="phaseIL1NextButton"
                  type="button">›</button>
        </div>

        <div id="phaseIL1SuggestionInfo"
             class="phase-il1-suggestion-info">
        </div>

        <div class="phase-il1-actions">
          <button id="phaseIL1RejectButton"
                  type="button">
            Reject
          </button>

          <button id="phaseIL1EditButton"
                  type="button">
            Edit
          </button>

          <button id="phaseIL1AcceptButton"
                  type="button">
            Accept
          </button>
        </div>
      </div>

      <p class="phase-il1-note">
        Suggestions are temporary. Accept/Edit creates
        a normal Draft annotation; Reject does not
        modify the GeoJSON.
      </p>
    </section>
  `;

  document.body.append(overlay);

  phaseIL6EnsureTrainingSetUi();
  phaseIL6BindSourceControls();
}


function phaseIL1DocumentKey() {
  if (!currentImage?.id) return "";

  return (
    `${currentImage.id}::`
    + `${currentAnnotationFile || "Default"}`
  );
}


function phaseIL1BiologicalClasses() {
  return (classes || []).filter(
    (item) => {
      const name =
        String(
          item?.name || ""
        ).trim();

      return (
        name
        && name.toLowerCase()
          !== "artifact"
      );
    }
  );
}


function phaseIL1TargetAnnotationCount(
  name
) {
  const wanted =
    String(name || "")
      .trim()
      .toLowerCase();

  return (
    featureCollection.features
    || []
  ).filter(
    (feature) => {
      if (
        !phaseDIsAnnotationFeature(
          feature
        )
      ) {
        return false;
      }

      const className =
        String(
          feature?.properties
            ?.classification
            ?.name
          || ""
        )
        .trim()
        .toLowerCase();

      return className === wanted;
    }
  ).length;
}


function phaseIL1PopulateClasses() {
  const refs =
    phaseIL1Refs();

  if (!refs.classSelect) return;

  const options =
    phaseIL1BiologicalClasses();

  const previous =
    String(
      refs.classSelect.value
      || phaseIL1State.targetClass
      || currentClass?.name
      || ""
    );

  refs.classSelect.innerHTML =
    "";

  for (const item of options) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.name;
    option.textContent =
      item.name;

    refs.classSelect.append(
      option
    );
  }

  const matched =
    options.find(
      (item) =>
        String(
          item.name
        ).toLowerCase()
        === previous.toLowerCase()
    );

  if (matched) {
    refs.classSelect.value =
      matched.name;
  } else if (options.length) {
    refs.classSelect.value =
      options[0].name;
  }

  phaseIL1UpdateTrainingHint();
}


function phaseIL1UpdateTrainingHint(
  message = ""
) {
  const refs =
    phaseIL1Refs();

  if (!refs.trainingInfo) return;

  if (message) {
    refs.trainingInfo.textContent =
      message;
    return;
  }

  const target =
    String(
      refs.classSelect?.value
      || ""
    );

  const count =
    phaseIL1TargetAnnotationCount(
      target
    );

  refs.trainingInfo.textContent =
    target
      ? (
          `${count} existing ${target} `
          + `annotation${count === 1 ? "" : "s"} `
          + "will be used as positive examples."
        )
      : "Choose a target class.";
}


function phaseIL1CurrentSuggestion() {
  if (
    phaseIL1State.documentKey
    !== phaseIL1DocumentKey()
  ) {
    phaseIL1ClearSuggestions(
      "Image or annotation file changed. Run Learn & suggest again.",
      true
    );
    return null;
  }

  if (
    !phaseIL1State.suggestions.length
  ) {
    return null;
  }

  phaseIL1State.index =
    Math.max(
      0,
      Math.min(
        phaseIL1State.index,
        phaseIL1State
          .suggestions.length - 1
      )
    );

  return (
    phaseIL1State
      .suggestions[
        phaseIL1State.index
      ]
    || null
  );
}


function phaseIL1FormatArea(area) {
  const value =
    Number(area || 0);

  const calibration =
    effectiveCalibration();

  if (
    calibration?.mpp
    && Number.isFinite(
      Number(calibration.mpp)
    )
    && Number(calibration.mpp) > 0
  ) {
    const mpp =
      Number(calibration.mpp);

    const mm2 =
      value
      * mpp
      * mpp
      / 1000000;

    return (
      `${formatStatNumber(value)} px²`
      + ` · ${mm2.toFixed(4)} mm²`
    );
  }

  return (
    `${formatStatNumber(value)} px²`
  );
}


function phaseIL1RenderSuggestionState() {
  const refs =
    phaseIL1Refs();

  const suggestion =
    phaseIL1CurrentSuggestion();

  const total =
    phaseIL1State
      .suggestions.length;

  if (!refs.suggestionPanel) return;

  refs.suggestionPanel.hidden =
    !suggestion;

  if (!suggestion) {
    drawAnnotations();
    return;
  }

  phaseIL21ResetClassForSuggestion();
  phaseIL22ResetOverlayForSuggestion();
  phaseIL21SetEditingUi(false);

  if (refs.counter) {
    refs.counter.textContent =
      `Suggestion ${phaseIL1State.index + 1} / ${total}`;
  }

  if (refs.info) {
    const confidence =
      Number(
        suggestion.confidence || 0
      ) * 100;

    refs.info.textContent =
      `${phaseIL1State.targetClass}`
      + ` · ${phaseIL1FormatArea(suggestion.areaPx2)}`
      + ` · confidence ${confidence.toFixed(0)}%`
      + (
          suggestion.reviewLater
            ? " · Review later"
            : ""
        );
  }

  if (refs.previous) {
    refs.previous.disabled =
      total < 2;
  }

  if (refs.next) {
    refs.next.disabled =
      total < 2;
  }

  phaseIL11CenterCurrentSuggestion();
  drawAnnotations();
}


function phaseIL1ClearSuggestions(
  message = "",
  redraw = true
) {
  phaseIL1State.suggestions =
    [];
  phaseIL1State.index =
    0;
  phaseIL1State.model =
    null;
  phaseIL1State.summary =
    null;
  phaseIL1State.documentKey =
    phaseIL1DocumentKey();

  const refs =
    phaseIL1Refs();

  if (refs.suggestionPanel) {
    refs.suggestionPanel.hidden =
      true;
  }

  if (message) {
    phaseIL1UpdateTrainingHint(
      message
    );
  } else {
    phaseIL1UpdateTrainingHint();
  }

  if (redraw) {
    drawAnnotations();
  }
}


function phaseIL1Close() {
  phaseIL1State.open =
    false;

  phaseIL1ClearSuggestions(
    "",
    false
  );

  const refs =
    phaseIL1Refs();

  if (refs.overlay) {
    refs.overlay.hidden =
      true;
  }

  drawAnnotations();
}


function phaseIL1Open() {
  phaseBToggleSettings(false);

  if (
    !currentImage
    || !currentInfo
  ) {
    setStatus(
      "Open an image before Interactive Learning",
      "error"
    );
    return;
  }

  if (currentImage.localNative) {
    setStatus(
      "Interactive Learning currently requires a connected HistoAnnotator server",
      "error"
    );
    return;
  }

  if (
    String(
      imageType || ""
    ).toLowerCase()
    === "fluorescence"
  ) {
    setStatus(
      "IL1 currently supports H&E, H-DAB and RGB appearance learning",
      "error"
    );
    return;
  }

  const refs =
    phaseIL1Refs();

  if (!refs.overlay) return;

  phaseIL1State.open =
    true;
  phaseIL1State.documentKey =
    phaseIL1DocumentKey();

  phaseIL1ClearSuggestions(
    "",
    false
  );

  phaseIL1PopulateClasses();
  phaseIL7RenderStatus();
  phaseIL9RenderProgress();

  refs.overlay.hidden =
    false;

  drawAnnotations();
}


function phaseIL1SetBusy(busy) {
  phaseIL1State.busy =
    Boolean(busy);

  const refs =
    phaseIL1Refs();

  for (const control of [
    refs.run,
    refs.classSelect,
    refs.sensitivity,
    refs.smoothing,
    refs.minArea,
    refs.excludeAnnotated,
    refs.sourceSelect,
    refs.manageTrainingSet,
  ]) {
    if (control) {
      control.disabled =
        phaseIL1State.busy;
    }
  }

  if (refs.run) {
    refs.run.textContent =
      phaseIL1State.busy
        ? "Learning…"
        : "Learn & suggest";
  }
}



// ========================================================================
// Phase IL3 - active learning suggestion prioritization
// ========================================================================

function phaseIL3Clamp01(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}


function phaseIL3SuggestionPriority(
  suggestion,
  maxArea
) {
  const confidence =
    phaseIL3Clamp01(
      suggestion?.confidence
    );

  const uncertainty =
    confidence === null
      ? 0.35
      : (
          1
          - Math.min(
              1,
              Math.abs(
                confidence - 0.5
              ) * 2
            )
        );

  const area =
    Math.max(
      0,
      Number(
        suggestion?.areaPx2
        || 0
      )
    );

  const safeMaxArea =
    Math.max(
      1,
      Number(maxArea || 1)
    );

  const areaScore =
    Math.log1p(area)
    / Math.log1p(
        safeMaxArea
      );

  const priority =
    (
      0.80 * uncertainty
      + 0.20 * areaScore
    );

  return {
    priority,
    uncertainty,
    areaScore,
  };
}


function phaseIL3PrioritizeSuggestions() {
  const suggestions =
    phaseIL1State.suggestions;

  if (
    !Array.isArray(suggestions)
    || suggestions.length < 2
  ) {
    return;
  }

  const maxArea =
    Math.max(
      1,
      ...suggestions.map(
        (item) =>
          Math.max(
            0,
            Number(
              item?.areaPx2
              || 0
            )
          )
      )
    );

  const ranked =
    suggestions.map(
      (suggestion, originalIndex) => {
        const score =
          phaseIL3SuggestionPriority(
            suggestion,
            maxArea
          );

        return {
          suggestion,
          originalIndex,
          ...score,
        };
      }
    );

  ranked.sort(
    (a, b) => {
      const priorityDelta =
        b.priority
        - a.priority;

      if (
        Math.abs(priorityDelta)
        > 1e-9
      ) {
        return priorityDelta;
      }

      return (
        a.originalIndex
        - b.originalIndex
      );
    }
  );

  phaseIL1State.suggestions =
    ranked.map(
      (item, rank) => ({
        ...item.suggestion,
        _activeLearning: {
          rank:
            rank + 1,
          priority:
            item.priority,
          uncertainty:
            item.uncertainty,
          areaScore:
            item.areaScore,
        },
      })
    );
}

async function phaseIL1Run() {
  if (
    phaseIL1State.busy
    || !currentImage
    || currentImage.localNative
  ) {
    return;
  }

  const refs =
    phaseIL1Refs();

  const targetClass =
    String(
      refs.classSelect?.value
      || ""
    ).trim();

  if (!targetClass) {
    phaseIL1UpdateTrainingHint(
      "Choose a target class."
    );
    return;
  }

  const count =
    phaseIL1TargetAnnotationCount(
      targetClass
    );

  const trainingMode =
    phaseIL6TrainingMode();

  const trainingSources =
    phaseIL6TrainingPayload();

  const learningModel =
    phaseIL10LearningModel();

  if (
    count < 1
    && trainingMode === "current"
  ) {
    phaseIL1UpdateTrainingHint(
      `Annotate some ${targetClass} first, then run learning again.`
    );
    return;
  }

  if (
    count < 1
    && trainingMode === "set"
    && !trainingSources.length
  ) {
    phaseIL1UpdateTrainingHint(
      `Add a labeled training source containing ${targetClass}.`
    );
    return;
  }

  const minArea =
    Number(
      refs.minArea?.value
      || 0.02
    );

  if (
    !Number.isFinite(minArea)
    || minArea < 0
    || minArea > 5
  ) {
    phaseIL1UpdateTrainingHint(
      "Minimum suggestion area must be between 0 and 5%."
    );
    return;
  }

  const phaseIL9LearningStartedAt =
    Date.now();

  phaseIL1SetBusy(true);

  phaseIL1State.targetClass =
    targetClass;

  phaseIL1ClearSuggestions(
    (
      `Learning ${targetClass} appearance `
      + `from ${count} annotation`
      + `${count === 1 ? "" : "s"}…`
    ),
    true
  );

  try {
    const response =
      await apiFetch(
        `${API}/interactive-learning/${currentImage.id}/suggest`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            targetClass,
            learningModel,
            trainingMode,
            currentAnnotationFile,
            trainingSources,
            feedback:
              phaseIL2FeedbackPayload(
                targetClass
              ),
            featureCollection: await phaseIL11FeatureCollectionForLearning(),
            sensitivity:
              Number(
                refs.sensitivity?.value
                || 50
              ),
            smoothing:
              Number(
                refs.smoothing?.value
                || 45
              ),
            minAreaPercent:
              minArea,
            excludeAnnotated:
              Boolean(
                refs.excludeAnnotated
                  ?.checked
              ),
            maxSuggestions:
              40,
            // IL5.1: higher-resolution inference for finer borders.
            maxSide:
              1600,
          }),
          // Multi-image IL can legitimately spend longer loading
          // thumbnails and building feature cubes. Keep a shorter timeout
          // for current-image learning, but allow selected sets up to 3 min.
          timeoutMs: learningModel === "B" ? (trainingMode === "set" ? 300000 : 180000) : (trainingMode === "set" ? 180000 : 90000),
        }
      );

    const payload =
      await response.json();

    phaseIL1State.suggestions =
      Array.isArray(
        payload?.suggestions
      )
        ? payload.suggestions
            .filter(
              (item) =>
                item?.geometry
            )
            .map(
              (item, index) => ({
                ...item,
                id:
                  item.id
                  || `il1-${index + 1}`,
              })
            )
        : [];

    phaseIL3PrioritizeSuggestions();

    phaseIL1State.index =
      0;
    phaseIL1State.model =
      payload?.model || null;
    phaseIL1State.summary =
      payload?.summary || null;
    phaseIL1State.documentKey =
      phaseIL1DocumentKey();

    const model =
      phaseIL1State.model;

    phaseIL8ApplySourceReports(
      model
    );

    const suggestionCount =
      phaseIL1State
        .suggestions.length;

    const feedbackSummary =
      phaseIL2FeedbackSummary(
        targetClass,
        learningModel
      );

    const phaseIL9StabilityEntry =
      phaseIL7RecordRound({
        targetClass,
        trainingMode,
        trainingSources,
        learningModel,
        suggestions:
          phaseIL1State.suggestions,
        feedbackSummary,
      });

    phaseIL9StartRound({
      config: {
        imageId:
          String(currentImage?.id || ""),
        imageName:
          String(currentImage?.name || ""),
        annotationFile:
          String(
            currentAnnotationFile
            || "Default"
          ),
        targetClass,
        trainingMode,
        trainingSources:
          deepClone(
            trainingSources
          ),
        sourceSignature:
          phaseIL7SourceSignature(
            trainingMode,
            trainingSources
          ),
      },
      learningStartedAt:
        phaseIL9LearningStartedAt,
      model,
      suggestions:
        phaseIL1State.suggestions,
      stabilityEntry:
        phaseIL9StabilityEntry,
      sensitivity:
        Number(
          refs.sensitivity?.value
          || 50
        ),
      smoothing:
        Number(
          refs.smoothing?.value
          || 45
        ),
      minAreaPercent:
        minArea,
      excludeAnnotated:
        Boolean(
          refs.excludeAnnotated
            ?.checked
        ),
    });

    phaseIL1UpdateTrainingHint(
      (
        `${model?.type || "IL1"}`
        + ` · ${model?.positiveTrainingPixels || 0} positive`
        + ` + ${model?.negativeTrainingPixels || 0} negative samples`
        + ` · negatives: ${model?.negativeSource || "context"}`
        + ` · ${suggestionCount} suggestion`
        + `${suggestionCount === 1 ? "" : "s"}.`
      + ` · feedback A:${feedbackSummary.accepted}`
      + ` R:${feedbackSummary.rejected}`
      + ` E:${feedbackSummary.edited}`
      + ` C:${feedbackSummary.reclassified}`)
    );

    // Phase IL2.4 - clean suggestion review status
    phaseIL1UpdateTrainingHint("");
    phaseIL1RenderSuggestionState();

    setStatus(
      suggestionCount
        ? (
            `Interactive Learning found `
            + `${suggestionCount} suggestion`
            + `${suggestionCount === 1 ? "" : "s"}`
          )
        : (
            "Interactive Learning found no suggestions"
            + (
                phaseIL1State.summary
                  ? (
                      ` · predicted ${
                        Number(
                          phaseIL1State.summary
                            ?.predictedPixelsThumbnail
                          || 0
                        )
                      } px`
                      + ` · candidate ${
                        Number(
                          phaseIL1State.summary
                            ?.candidatePixelsThumbnail
                          || 0
                        )
                      } px`
                      + (
                          Number.isFinite(
                            Number(
                              model?.threshold
                            )
                          )
                            ? (
                                ` · threshold ${
                                  Number(
                                    model.threshold
                                  ).toFixed(3)
                                }`
                              )
                            : ""
                        )
                    )
                  : ""
              )
          ),
      suggestionCount
        ? "saved"
        : "local"
    );
  } catch (error) {
    phaseIL1ClearSuggestions(
      (
        "Interactive Learning could not run: "
        + `${error?.message || error}`
      ),
      true
    );

    setStatus(
      (
        "Interactive Learning failed: "
        + `${error?.message || error}`
      ),
      "error"
    );
  } finally {
    phaseIL1SetBusy(false);
  }
}


function phaseIL1DrawRing(
  ring,
  color,
  width = 2.0
) {
  if (
    !Array.isArray(ring)
    || ring.length < 2
  ) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.95;

  let started = false;

  for (const point of ring) {
    const screen =
      screenPointFromImage(
        point
      );

    if (!screen) continue;

    if (!started) {
      ctx.moveTo(
        screen.x,
        screen.y
      );
      started = true;
    } else {
      ctx.lineTo(
        screen.x,
        screen.y
      );
    }
  }

  if (started) {
    ctx.stroke();
  }

  ctx.restore();
}


function phaseIL1DrawGeometry(
  geometry,
  color,
  width
) {
  if (!geometry) return;

  if (
    geometry.type === "Polygon"
  ) {
    for (
      const ring
      of geometry.coordinates || []
    ) {
      phaseIL1DrawRing(
        ring,
        color,
        width
      );
    }
    return;
  }

  if (
    geometry.type
    === "MultiPolygon"
  ) {
    for (
      const polygon
      of geometry.coordinates || []
    ) {
      for (
        const ring
        of polygon || []
      ) {
        phaseIL1DrawRing(
          ring,
          color,
          width
        );
      }
    }
  }
}


function phaseIL1DrawSuggestions() {
  // IL2.2: current suggestion bright yellow + translucent fill.
  if (
    !phaseIL1State.open
    || !phaseIL1State.suggestions.length
    || phaseIL1State.documentKey
      !== phaseIL1DocumentKey()
  ) {
    return;
  }

  for (
    let index = 0;
    index < phaseIL1State.suggestions.length;
    index += 1
  ) {
    const suggestion =
      phaseIL1State.suggestions[index];

    const current =
      index === phaseIL1State.index;

    if (
      current
      && !phaseIL22SuggestionOverlayVisible
    ) {
      continue;
    }

    if (current) {
      phaseIL22FillGeometry(
        suggestion.geometry,
        "#fff200"
      );
    }

    phaseIL1DrawGeometry(
      suggestion.geometry,
      current
        ? "#fff200"
        : "#ffb000",
      current
        ? 3.6
        : 1.4
    );
  }
}



function phaseIL1RemoveCurrentSuggestion() {
  if (
    !phaseIL1State
      .suggestions.length
  ) {
    return;
  }

  phaseIL1State
    .suggestions.splice(
      phaseIL1State.index,
      1
    );

  if (
    phaseIL1State.index
    >= phaseIL1State
      .suggestions.length
  ) {
    phaseIL1State.index =
      Math.max(
        0,
        phaseIL1State
          .suggestions.length - 1
      );
  }

  phaseIL1RenderSuggestionState();
}


function phaseIL1StoreRejection(
  suggestion
) {
  if (
    !suggestion
    || !currentImage
  ) {
    return;
  }

  let items = [];

  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          PHASE_IL1_REJECTION_KEY
        )
        || "[]"
      );

    if (Array.isArray(parsed)) {
      items = parsed;
    }
  } catch (_) {
    items = [];
  }

  const provenance =
    phaseIL93FeedbackProvenance();

  items.unshift({
    imageId:
      currentImage.id,
    annotationFile:
      currentAnnotationFile,
    targetClass:
      phaseIL1State.targetClass,
    rejectedAt:
      new Date().toISOString(),
    learningModel:
      provenance.learningModel,
    learningModelLabel:
      provenance.learningModelLabel,
    modelType:
      provenance.modelType,
    sessionId:
      provenance.sessionId,
    roundId:
      provenance.roundId,
    model:
      phaseIL1State.model?.type
      || "appearance-centroid-v1",
    confidence:
      Number(
        suggestion.confidence
        || 0
      ),
    areaPx2:
      Number(
        suggestion.areaPx2
        || 0
      ),
    geometry:
      deepClone(
        suggestion.geometry
      ),
  });

  try {
    localStorage.setItem(
      PHASE_IL1_REJECTION_KEY,
      JSON.stringify(
        items.slice(0, 200)
      )
    );
  } catch (_) {}
}


function phaseIL1Reject() {
  const suggestion =
    phaseIL1CurrentSuggestion();

  if (!suggestion) return;

  phaseIL1StoreRejection(
    suggestion
  );

  phaseIL9RecordDecision(
    suggestion,
    "rejected"
  );

  phaseIL1RemoveCurrentSuggestion();

  setStatus(
    "Suggestion rejected · feedback stored locally",
    "local"
  );
}


function phaseIL1AcceptedFeature(
  suggestion,
  targetClass
) {
  const classInfo =
    (classes || []).find(
      (item) =>
        String(
          item?.name || ""
        ).toLowerCase()
        === String(
          targetClass || ""
        ).toLowerCase()
    );

  if (!classInfo) {
    return null;
  }

  const metadata =
    phaseCCreateMetadata();

  const provenance =
    phaseIL93FeedbackProvenance();

  metadata.interactiveLearning = {
    source:
      "IL2",
    decision:
      "accepted",
    originalTargetClass:
      targetClass,
    learningModel:
      provenance.learningModel,
    learningModelLabel:
      provenance.learningModelLabel,
    modelType:
      provenance.modelType,
    sessionId:
      provenance.sessionId,
    roundId:
      provenance.roundId,
    model:
      phaseIL1State.model?.type
      || "appearance-centroid-v1",
    acceptedAt:
      new Date().toISOString(),
    confidence:
      Number(
        suggestion.confidence
        || 0
      ),
    targetClass:
      classInfo.name,
  };

  return {
    type: "Feature",
    id: uid(),
    geometry:
      deepClone(
        suggestion.geometry
      ),
    properties: {
      objectType:
        "annotation",
      classification: {
        name:
          classInfo.name,
        color:
          hexToRgbArray(
            classInfo.color
          ),
      },
      isLocked:
        false,
      histoannotator:
        metadata,
    },
  };
}


function phaseIL1AcceptCurrent(
  editAfter = false
) {
  if (
    phaseIL21EditSession
    && !editAfter
  ) {
    phaseIL21FinishEdit();
    return;
  }

  const suggestion =
    phaseIL1CurrentSuggestion();

  if (!suggestion) return;

  if (editAfter) {
    phaseIL21StartEdit(
      suggestion
    );
    return;
  }

  const finalClass =
    phaseIL21SelectedClass();

  if (!finalClass) {
    setStatus(
      "Choose a class before accepting",
      "error"
    );
    return;
  }

  const feature =
    phaseIL1AcceptedFeature(
      suggestion,
      finalClass
    );

  if (!feature) {
    setStatus(
      "Selected class no longer exists",
      "error"
    );
    return;
  }

  phaseIL21MarkDecision(
    feature,
    finalClass,
    false
  );

  phaseIL9RecordDecision(
    suggestion,
    feature?.properties
      ?.histoannotator
      ?.interactiveLearning
      ?.decision
      || "accepted",
    {
      edited: false,
    }
  );

  pushUndo();

  featureCollection.features.push(
    feature
  );

  phaseIL1State.applyingSuggestion = true;

  setSingleSelection(
    String(feature.id),
    true
  );

  markChanged();

  phaseIL1State.applyingSuggestion = false;

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL1RemoveCurrentSuggestion();

  setStatus(
    `${finalClass} suggestion accepted as Draft`,
    "saved"
  );
}



function phaseIL1AnnotationsChanged() {
  if (
    phaseIL1State.applyingSuggestion
    || phaseIL21EditSession
    || !phaseIL1State.suggestions.length
  ) {
    return;
  }

  phaseIL1ClearSuggestions(
    (
      "Annotations changed. Run Learn & suggest "
      + "again so predictions use the latest examples."
    ),
    false
  );
}




// ========================================================================
// Phase IL1.1 — suggestion review, effective ROI, Focus/mobile UX
// ========================================================================

async function phaseIL11FeatureCollectionForLearning() {
  const learningCollection =
    deepClone(featureCollection);

  const roi =
    phaseDTissueRoiFeature();

  if (!roi) {
    return learningCollection;
  }

  const borderConfig =
    phaseDBorderConfigForRoi(roi);

  const usesExternalBorder =
    Boolean(borderConfig?.enabled)
    && Number(borderConfig?.percent || 0) > 0;

  if (!usesExternalBorder) {
    return learningCollection;
  }

  let effectivePreview =
    phaseDEffectivePreviewForRoi(roi);

  if (!effectivePreview?.geometry) {
    /*
     * After reopening a file, the effective preview may not yet be hydrated.
     * Rebuild it now and wait, rather than running IL1 against the larger
     * base ROI for one cycle.
     */
    try {
      phaseDLoadBorderControlsFromRoi();

      await phaseDRefreshBorderPreview({
        saveConfig: false,
        quiet: true,
      });
    } catch (_) {
      try {
        phaseDEnsureStoredEffectivePreview();
      } catch (_) {}
    }

    effectivePreview =
      phaseDEffectivePreviewForRoi(roi);
  }

  if (!effectivePreview?.geometry) {
    throw new Error(
      "The effective Tissue ROI could not be prepared for Interactive Learning."
    );
  }

  const roiId =
    String(roi?.id || "");

  const learningRoi =
    (learningCollection.features || []).find(
      (feature) => {
        if (
          roiId
          && String(feature?.id || "") === roiId
        ) {
          return true;
        }

        return phaseDIsTissueRoi(feature);
      }
    );

  if (!learningRoi) {
    throw new Error(
      "Tissue ROI could not be prepared for Interactive Learning."
    );
  }

  /*
   * The backend already subtracts Artifact. By replacing only the ROI
   * geometry in this transient payload, IL1 learns/infers inside:
   *
   *   effective Tissue ROI - Artifact
   *
   * without modifying the stored/base Tissue ROI.
   */
  learningRoi.geometry =
    deepClone(effectivePreview.geometry);

  return learningCollection;
}


function phaseIL11GeometryBounds(
  geometry
) {
  if (!geometry?.coordinates) {
    return null;
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const visit = (value) => {
    if (!Array.isArray(value)) {
      return;
    }

    if (
      value.length >= 2
      && Number.isFinite(Number(value[0]))
      && Number.isFinite(Number(value[1]))
      && !Array.isArray(value[0])
      && !Array.isArray(value[1])
    ) {
      const x = Number(value[0]);
      const y = Number(value[1]);

      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
      return;
    }

    for (const child of value) {
      visit(child);
    }
  };

  visit(geometry.coordinates);

  if (
    !Number.isFinite(bounds.minX)
    || !Number.isFinite(bounds.minY)
    || !Number.isFinite(bounds.maxX)
    || !Number.isFinite(bounds.maxY)
  ) {
    return null;
  }

  return bounds;
}


function phaseIL11CenterCurrentSuggestion() {
  const suggestion =
    phaseIL1CurrentSuggestion();

  if (
    !suggestion?.geometry
    || !viewer
    || !viewer.world?.getItemCount?.()
  ) {
    return;
  }

  const bounds =
    phaseIL11GeometryBounds(
      suggestion.geometry
    );

  if (!bounds) return;

  const centerX =
    (bounds.minX + bounds.maxX) / 2;
  const centerY =
    (bounds.minY + bounds.maxY) / 2;

  const tiledImage =
    viewer.world.getItemAt(0);

  if (
    !tiledImage
    || typeof tiledImage
      .imageToViewportCoordinates
      !== "function"
  ) {
    return;
  }

  const viewportPoint =
    tiledImage.imageToViewportCoordinates(
      centerX,
      centerY
    );

  if (!viewportPoint) return;

  /*
   * Preserve the user's zoom. Only pan, matching Review-style
   * annotation-by-annotation navigation.
   */
  viewer.viewport.panTo(
    viewportPoint,
    false
  );

  viewer.viewport.applyConstraints(
    false
  );
}


function phaseIL11FocusModeLetter() {
  if (mode === "navigate") {
    return "M";
  }

  if (mode === "select") {
    return "S";
  }

  return "F";
}


function phaseIL11EnsureFocusModeControl() {
  if (
    document.getElementById(
      "phaseIL11FocusModeButton"
    )
  ) {
    return;
  }

  const classButton =
    document.getElementById(
      "phaseBFocusClassesButton"
    );

  const classWrap =
    classButton?.parentElement;

  if (!classButton || !classWrap) {
    return;
  }

  const topRow =
    document.createElement("div");

  topRow.className =
    "phase-il11-focus-top-row";

  classWrap.insertBefore(
    topRow,
    classButton
  );

  topRow.append(classButton);

  const modeWrap =
    document.createElement("div");

  modeWrap.className =
    "phase-il11-focus-mode-wrap";

  const modeButton =
    document.createElement("button");

  modeButton.id =
    "phaseIL11FocusModeButton";
  modeButton.type =
    "button";
  modeButton.className =
    "phase-il11-focus-mode-button";
  modeButton.setAttribute(
    "aria-expanded",
    "false"
  );
  modeButton.title =
    "Mode · M Move · F Draw · S Select";

  const strip =
    document.createElement("div");

  strip.id =
    "phaseIL11FocusModeStrip";
  strip.className =
    "phase-il11-focus-mode-strip";
  strip.hidden =
    true;

  const choices = [
    ["navigate", "M", "Move"],
    ["freehand", "F", "Draw · Freehand"],
    ["select", "S", "Select"],
  ];

  for (
    const [modeName, letter, label]
    of choices
  ) {
    const button =
      document.createElement("button");

    button.type =
      "button";
    button.className =
      "phase-il11-focus-mode-choice";
    button.dataset.mode =
      modeName;
    button.textContent =
      letter;
    button.title =
      `${letter} · ${label}`;
    button.setAttribute(
      "aria-label",
      `${letter} · ${label}`
    );

    button.addEventListener(
      "click",
      () => {
        setMode(modeName);
        phaseIL11SetFocusModesOpen(
          false
        );
      }
    );

    strip.append(button);
  }

  modeWrap.append(
    modeButton,
    strip
  );

  topRow.append(modeWrap);

  modeButton.addEventListener(
    "click",
    () => {
      const open =
        strip.hidden;

      if (open) {
        phaseBSetFocusClassesOpen(
          false
        );
      }

      phaseIL11SetFocusModesOpen(
        open
      );
    }
  );

  classButton.addEventListener(
    "click",
    () =>
      phaseIL11SetFocusModesOpen(
        false
      )
  );

  document
    .getElementById(
      "phaseBExitFocusButton"
    )
    ?.addEventListener(
      "click",
      () =>
        phaseIL11SetFocusModesOpen(
          false
        )
    );

  phaseIL11UpdateFocusModeControl();
}


function phaseIL11SetFocusModesOpen(
  open
) {
  const button =
    document.getElementById(
      "phaseIL11FocusModeButton"
    );

  const strip =
    document.getElementById(
      "phaseIL11FocusModeStrip"
    );

  if (!button || !strip) return;

  strip.hidden =
    !Boolean(open);

  button.setAttribute(
    "aria-expanded",
    String(Boolean(open))
  );
}


function phaseIL11UpdateFocusModeControl() {
  const button =
    document.getElementById(
      "phaseIL11FocusModeButton"
    );

  const strip =
    document.getElementById(
      "phaseIL11FocusModeStrip"
    );

  if (!button) return;

  const letter =
    phaseIL11FocusModeLetter();

  button.textContent =
    letter;

  const label =
    mode === "navigate"
      ? "Move"
      : mode === "select"
        ? "Select"
        : (
            mode === "freehand"
              ? "Draw · Freehand"
              : `Draw · ${mode}`
          );

  button.title =
    `${letter} · ${label}`;

  strip
    ?.querySelectorAll(
      ".phase-il11-focus-mode-choice"
    )
    .forEach(
      (choice) => {
        const choiceMode =
          choice.dataset.mode;

        const active =
          choiceMode === "navigate"
            ? mode === "navigate"
            : choiceMode === "select"
              ? mode === "select"
              : (
                  mode !== "navigate"
                  && mode !== "select"
                );

        choice.classList.toggle(
          "active",
          active
        );
      }
    );
}



// ========================================================================
// Phase IL1.2 - Focus Android system-bar hotfix
// ========================================================================

function phaseIL12UpdateFocusInsets() {
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutWidth =
    Math.max(0, Number(window.innerWidth || 0));
  const layoutHeight =
    Math.max(0, Number(window.innerHeight || 0));

  const visibleWidth =
    Math.max(0, Number(vv?.width || layoutWidth));
  const visibleHeight =
    Math.max(0, Number(vv?.height || layoutHeight));

  const offsetLeft =
    Math.max(0, Number(vv?.offsetLeft || 0));
  const offsetTop =
    Math.max(0, Number(vv?.offsetTop || 0));

  let left = offsetLeft;

  let right = Math.max(
    0,
    layoutWidth - visibleWidth - offsetLeft
  );

  let bottom = Math.max(
    0,
    layoutHeight - visibleHeight - offsetTop
  );

  const nativeAndroid =
    Boolean(IS_NATIVE)
    && /Android/i.test(navigator.userAgent || "");

  const shortSide =
    Math.min(
      layoutWidth || Infinity,
      layoutHeight || Infinity
    );

  const phoneSized =
    nativeAndroid
    && Number.isFinite(shortSide)
    && shortSide <= 600;

  if (phoneSized) {
    const landscape =
      layoutWidth > layoutHeight;

    if (landscape) {
      // Android can move the navigation bar to either lateral edge.
      // Some WebViews incorrectly report zero safe-area inset, so keep
      // a conservative reserve on both sides for phone landscape.
      left = Math.max(left, 46);
      right = Math.max(right, 46);
      bottom = Math.max(bottom, 8);
    } else {
      // Portrait navigation/gesture bar fallback.
      bottom = Math.max(bottom, 42);
    }
  }

  root.style.setProperty(
    "--ha-focus-inset-left",
    `${Math.round(left)}px`
  );

  root.style.setProperty(
    "--ha-focus-inset-right",
    `${Math.round(right)}px`
  );

  root.style.setProperty(
    "--ha-focus-inset-bottom",
    `${Math.round(bottom)}px`
  );
}


function phaseIL12Initialize() {
  phaseIL12UpdateFocusInsets();

  window.addEventListener(
    "resize",
    phaseIL12UpdateFocusInsets,
    { passive: true }
  );

  window.addEventListener(
    "orientationchange",
    () => {
      window.setTimeout(
        phaseIL12UpdateFocusInsets,
        80
      );

      window.setTimeout(
        phaseIL12UpdateFocusInsets,
        320
      );
    },
    { passive: true }
  );

  window.visualViewport?.addEventListener(
    "resize",
    phaseIL12UpdateFocusInsets,
    { passive: true }
  );

  window.visualViewport?.addEventListener(
    "scroll",
    phaseIL12UpdateFocusInsets,
    { passive: true }
  );
}


function phaseIL11Initialize() {
  phaseIL11EnsureFocusModeControl();
  phaseIL11UpdateFocusModeControl();
}


// ========================================================================
// Phase IL2 - feedback learning and suggestion decisions
// ========================================================================

const PHASE_IL2_EDIT_KEY =
  "histoannotator.il2.edits.v1";


function phaseIL2ReadArray(key) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key)
      || "[]"
    );

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (_) {
    return [];
  }
}


function phaseIL2WriteArray(
  key,
  items,
  maximum = 300
) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        (items || []).slice(
          0,
          maximum
        )
      )
    );
  } catch (_) {}
}


function phaseIL93LearningModelFromType(
  modelType
) {
  const value =
    String(modelType || "")
      .trim()
      .toLowerCase();

  if (value.includes("deep-spatial")) {
    return "C";
  }

  if (value.includes("deep-features")) {
    return "B";
  }

  if (
    value.includes("extra-trees")
    || value.includes("appearance-centroid")
  ) {
    return "A";
  }

  return null;
}


function phaseIL93ActiveLearningModel() {
  const explicit =
    String(
      phaseIL1State.model
        ?.learningModel
      || ""
    )
      .trim()
      .toUpperCase();

  if (["A", "B", "C"].includes(explicit)) {
    return explicit;
  }

  const inferred =
    phaseIL93LearningModelFromType(
      phaseIL1State.model?.type
    );

  if (inferred) {
    return inferred;
  }

  return phaseIL92NormalizeLearningModel(
    phaseIL92LearningModelSelect()
      ?.value
    || "A"
  );
}


function phaseIL93FeedbackProvenance() {
  const learningModel =
    phaseIL93ActiveLearningModel();

  return {
    learningModel,
    learningModelLabel:
      phaseIL92LearningModelLabel(
        learningModel
      ),
    modelType:
      String(
        phaseIL1State.model?.type
        || ""
      ),
    sessionId:
      phaseIL9ActiveContext
        ?.sessionId
      || null,
    roundId:
      phaseIL9ActiveContext
        ?.roundId
      || null,
  };
}


function phaseIL93MatchesLearningModel(
  record,
  learningModel
) {
  if (!learningModel) {
    return true;
  }

  const stored =
    String(
      record?.learningModel
      || ""
    )
      .trim()
      .toUpperCase();

  if (!["A", "B", "C"].includes(stored)) {
    // Legacy feedback remains usable for training, but is not
    // attributed to a specific strategy for IL7 stability.
    return false;
  }

  return (
    stored
    === phaseIL92NormalizeLearningModel(
      learningModel
    )
  );
}


function phaseIL2ContextMatch(
  item,
  targetClass,
  learningModel = null
) {
  if (!item || !currentImage) {
    return false;
  }

  return (
    String(item.imageId || "")
      === String(currentImage.id || "")
    && String(item.annotationFile || "")
      === String(currentAnnotationFile || "")
    && String(item.targetClass || "")
      .toLowerCase()
      === String(targetClass || "")
        .toLowerCase()
    && phaseIL93MatchesLearningModel(
      item,
      learningModel
    )
  );
}


function phaseIL2RejectedFeedback(
  targetClass,
  learningModel = null
) {
  return phaseIL2ReadArray(
    PHASE_IL1_REJECTION_KEY
  ).filter(
    (item) =>
      phaseIL2ContextMatch(
        item,
        targetClass,
        learningModel
      )
      && item?.geometry
  );
}


function phaseIL2EditedFeedback(
  targetClass,
  learningModel = null
) {
  const items =
    phaseIL2ReadArray(
      PHASE_IL2_EDIT_KEY
    );

  const output = [];

  for (const item of items) {
    if (
      !phaseIL2ContextMatch(
        item,
        targetClass,
        learningModel
      )
      || !item?.featureId
      || !item?.originalGeometry
    ) {
      continue;
    }

    const feature =
      (featureCollection.features || [])
        .find(
          (candidate) =>
            String(candidate?.id || "")
            === String(item.featureId)
        );

    if (
      !feature?.geometry
      || !phaseDIsAnnotationFeature(
        feature
      )
    ) {
      continue;
    }

    const className =
      String(
        feature?.properties
          ?.classification
          ?.name
        || ""
      ).toLowerCase();

    if (
      className
      !== String(targetClass || "")
        .toLowerCase()
    ) {
      continue;
    }

    output.push({
      featureId:
        item.featureId,
      originalGeometry:
        deepClone(
          item.originalGeometry
        ),
      correctedGeometry:
        deepClone(
          feature.geometry
        ),
      createdAt:
        item.createdAt || null,
    });
  }

  return output;
}


function phaseIL2FeedbackPayload(
  targetClass
) {
  return {
    rejected:
      phaseIL2RejectedFeedback(
        targetClass
      ).map(
        (item) => ({
          geometry:
            deepClone(
              item.geometry
            ),
          confidence:
            Number(
              item.confidence || 0
            ),
          rejectedAt:
            item.rejectedAt || null,
        })
      ),

    edited:
      phaseIL2EditedFeedback(
        targetClass
      ),
  };
}


function phaseIL2FeedbackSummary(
  targetClass,
  learningModel = null
) {
  const target =
    String(targetClass || "")
      .toLowerCase();

  let accepted = 0;
  let reclassified = 0;

  for (
    const feature
    of featureCollection.features || []
  ) {
    if (
      !phaseDIsAnnotationFeature(
        feature
      )
    ) {
      continue;
    }

    const il =
      feature?.properties
        ?.histoannotator
        ?.interactiveLearning;

    if (!il) continue;

    if (
      !phaseIL93MatchesLearningModel(
        il,
        learningModel
      )
    ) {
      continue;
    }

    const source =
      String(il.source || "")
        .toUpperCase();

    if (!source.startsWith("IL")) {
      continue;
    }

    const className =
      String(
        feature?.properties
          ?.classification
          ?.name
        || ""
      ).toLowerCase();

    const originalTarget =
      String(
        il.originalTargetClass || ""
      ).toLowerCase();

    if (className === target) {
      accepted += 1;
    }

    if (
      il.decision === "reclassified"
      && originalTarget === target
    ) {
      reclassified += 1;
    }
  }

  return {
    accepted,
    rejected:
      phaseIL2RejectedFeedback(
        targetClass,
        learningModel
      ).length,
    edited:
      phaseIL2EditedFeedback(
        targetClass,
        learningModel
      ).length,
    reclassified,
  };
}


function phaseIL2StoreEditOrigin(
  feature,
  suggestion
) {
  if (
    !feature?.id
    || !suggestion?.geometry
    || !currentImage
  ) {
    return;
  }

  const items =
    phaseIL2ReadArray(
      PHASE_IL2_EDIT_KEY
    );

  const featureId =
    String(feature.id);

  const il =
    feature?.properties
      ?.histoannotator
      ?.interactiveLearning
    || {};

  const fallbackProvenance =
    phaseIL93FeedbackProvenance();

  const filtered =
    items.filter(
      (item) =>
        !(
          String(item?.imageId || "")
            === String(currentImage.id || "")
          && String(
            item?.annotationFile || ""
          ) === String(
            currentAnnotationFile || ""
          )
          && String(
            item?.featureId || ""
          ) === featureId
        )
    );

  filtered.unshift({
    imageId:
      currentImage.id,
    annotationFile:
      currentAnnotationFile,
    targetClass:
      phaseIL1State.targetClass,
    learningModel:
      String(
        il.learningModel
        || fallbackProvenance.learningModel
      ),
    learningModelLabel:
      String(
        il.learningModelLabel
        || fallbackProvenance.learningModelLabel
      ),
    modelType:
      String(
        il.modelType
        || il.model
        || fallbackProvenance.modelType
        || ""
      ),
    sessionId:
      il.sessionId
      || fallbackProvenance.sessionId
      || null,
    roundId:
      il.roundId
      || fallbackProvenance.roundId
      || null,
    featureId,
    originalGeometry:
      deepClone(
        suggestion.geometry
      ),
    createdAt:
      new Date().toISOString(),
  });

  phaseIL2WriteArray(
    PHASE_IL2_EDIT_KEY,
    filtered
  );
}


function phaseIL2PopulateAssignClasses() {
  const select =
    document.getElementById(
      "phaseIL2AssignClassSelect"
    );

  if (!select) return;

  const target =
    String(
      phaseIL1State.targetClass
      || document.getElementById(
        "phaseIL1ClassSelect"
      )?.value
      || ""
    ).toLowerCase();

  select.innerHTML = "";

  for (const item of classes || []) {
    const name =
      String(item?.name || "")
        .trim();

    if (
      !name
      || name.toLowerCase() === "artifact"
      || name.toLowerCase() === target
    ) {
      continue;
    }

    const option =
      document.createElement(
        "option"
      );

    option.value =
      name;
    option.textContent =
      name;

    select.append(option);
  }
}


function phaseIL2SetAssignOpen(open) {
  const row =
    document.getElementById(
      "phaseIL2AssignRow"
    );

  const button =
    document.getElementById(
      "phaseIL2ClassButton"
    );

  if (!row || !button) return;

  row.hidden =
    !Boolean(open);

  button.setAttribute(
    "aria-expanded",
    String(Boolean(open))
  );

  if (open) {
    phaseIL2PopulateAssignClasses();
  }
}


function phaseIL2ReviewLater() {
  const suggestions =
    phaseIL1State.suggestions;

  if (!suggestions?.length) {
    return;
  }

  if (suggestions.length === 1) {
    suggestions[0].reviewLater =
      true;

    phaseIL9RecordLater(
      suggestions[0]
    );

    phaseIL1UpdateTrainingHint(
      "Only one suggestion remains. It is marked Review later."
    );

    phaseIL1RenderSuggestionState();
    return;
  }

  const current =
    suggestions.splice(
      phaseIL1State.index,
      1
    )[0];

  current.reviewLater =
    true;

  phaseIL9RecordLater(
    current
  );

  suggestions.push(current);

  if (
    phaseIL1State.index
    >= suggestions.length
  ) {
    phaseIL1State.index = 0;
  }

  phaseIL1RenderSuggestionState();

  setStatus(
    "Suggestion moved to Review later",
    "local"
  );
}


function phaseIL2AssignCurrent() {
  const suggestion =
    phaseIL1CurrentSuggestion();

  const select =
    document.getElementById(
      "phaseIL2AssignClassSelect"
    );

  const className =
    String(
      select?.value || ""
    ).trim();

  if (
    !suggestion
    || !className
  ) {
    return;
  }

  const feature =
    phaseIL1AcceptedFeature(
      suggestion,
      className
    );

  if (!feature) {
    setStatus(
      "Selected class no longer exists",
      "error"
    );
    return;
  }

  const il =
    feature.properties
      .histoannotator
      .interactiveLearning;

  il.source =
    "IL2";
  il.decision =
    "reclassified";
  il.originalTargetClass =
    phaseIL1State.targetClass;
  il.assignedClass =
    className;
  il.reclassifiedAt =
    new Date().toISOString();

  phaseIL9RecordDecision(
    suggestion,
    "reclassified",
    {
      edited: false,
    }
  );

  pushUndo();

  featureCollection.features.push(
    feature
  );

  phaseIL1State.applyingSuggestion =
    true;

  setSingleSelection(
    String(feature.id),
    true
  );

  markChanged();

  phaseIL1State.applyingSuggestion =
    false;

  phaseIL2SetAssignOpen(false);
  phaseIL1RemoveCurrentSuggestion();

  setStatus(
    (
      "Suggestion assigned to "
      + className
      + " as Draft"
    ),
    "saved"
  );
}



// ========================================================================
// Phase IL2.1 - class dropdown, inline edit, finer suggestions
// ========================================================================

let phaseIL21EditSession = null;

function phaseIL21TargetClass() {
  return String(
    phaseIL1State.targetClass
    || document.getElementById(
      "phaseIL1ClassSelect"
    )?.value
    || ""
  ).trim();
}

function phaseIL21SuggestionClassSelect() {
  return document.getElementById(
    "phaseIL21SuggestionClassSelect"
  );
}

function phaseIL21PopulateSuggestionClasses(
  resetToTarget = true
) {
  const select =
    phaseIL21SuggestionClassSelect();

  if (!select) return;

  const previous =
    String(select.value || "");

  const target =
    phaseIL21TargetClass();

  select.innerHTML = "";

  for (const item of classes || []) {
    const name =
      String(item?.name || "").trim();

    if (!name) continue;

    const option =
      document.createElement("option");

    option.value = name;
    option.textContent = name;
    select.append(option);
  }

  const desired =
    resetToTarget
      ? target
      : previous;

  const match =
    Array.from(select.options)
      .find(
        (option) =>
          option.value.toLowerCase()
          === desired.toLowerCase()
      );

  if (match) {
    select.value = match.value;
  } else if (select.options.length) {
    select.selectedIndex = 0;
  }
}

function phaseIL21SelectedClass() {
  const select =
    phaseIL21SuggestionClassSelect();

  return String(
    select?.value
    || phaseIL21TargetClass()
  ).trim();
}

function phaseIL21ResetClassForSuggestion() {
  if (phaseIL21EditSession) return;
  phaseIL21PopulateSuggestionClasses(true);
}

function phaseIL21SetEditingUi(editing) {
  const reject =
    document.getElementById("phaseIL1RejectButton");
  const later =
    document.getElementById("phaseIL2LaterButton");
  const edit =
    document.getElementById("phaseIL1EditButton");
  const accept =
    document.getElementById("phaseIL1AcceptButton");
  const overlay =
    phaseIL22OverlayButton();
  const counter =
    document.getElementById("phaseIL1SuggestionCounter");
  const info =
    document.getElementById("phaseIL1SuggestionInfo");

  if (reject) reject.disabled = Boolean(editing);
  if (later) later.disabled = Boolean(editing);
  if (edit) edit.disabled = Boolean(editing);
  if (overlay) overlay.disabled = Boolean(editing);

  if (accept) {
    accept.textContent =
      editing
        ? "Accept edit"
        : "Accept";
  }

  if (editing && counter) {
    counter.textContent =
      "Editing suggestion";
  }

  if (editing && info) {
    info.textContent =
      "Edit the selected geometry, choose its class, then Accept edit.";
  }
}

function phaseIL21ApplyClassToFeature(
  feature,
  className
) {
  const classInfo =
    (classes || []).find(
      (item) =>
        String(item?.name || "").toLowerCase()
        === String(className || "").toLowerCase()
    );

  if (!feature || !classInfo) {
    return false;
  }

  feature.properties =
    feature.properties || {};

  feature.properties.classification = {
    name: classInfo.name,
    color: hexToRgbArray(classInfo.color),
  };

  return true;
}

function phaseIL21MarkDecision(
  feature,
  finalClass,
  edited = false
) {
  const il =
    feature?.properties
      ?.histoannotator
      ?.interactiveLearning;

  if (!il) return;

  const target =
    phaseIL21TargetClass();

  const changedClass =
    String(finalClass || "").toLowerCase()
    !== String(target || "").toLowerCase();

  il.source = "IL2";
  il.originalTargetClass = target;

  if (changedClass) {
    il.decision = "reclassified";
    il.assignedClass = finalClass;
    il.reclassifiedAt =
      new Date().toISOString();

    if (edited) {
      il.editedBeforeReclassification = true;
    }
  } else {
    il.decision =
      edited ? "edited" : "accepted";

    delete il.assignedClass;
    delete il.reclassifiedAt;
  }

  if (edited) {
    il.editAcceptedAt =
      new Date().toISOString();
  }
}

function phaseIL21RemoveSuggestionWithoutAdvance(
  suggestion
) {
  const index =
    phaseIL1State.suggestions
      .indexOf(suggestion);

  if (index >= 0) {
    phaseIL1State.suggestions.splice(
      index,
      1
    );
  }

  if (
    phaseIL1State.index
    >= phaseIL1State.suggestions.length
  ) {
    phaseIL1State.index =
      Math.max(
        0,
        phaseIL1State.suggestions.length - 1
      );
  }
}

function phaseIL21StartEdit(suggestion) {
  if (!suggestion || phaseIL21EditSession) {
    return;
  }

  const target =
    phaseIL21TargetClass();

  const feature =
    phaseIL1AcceptedFeature(
      suggestion,
      target
    );

  if (!feature) {
    setStatus(
      "Target class no longer exists",
      "error"
    );
    return;
  }

  phaseIL21MarkDecision(
    feature,
    target,
    true
  );

  pushUndo();

  featureCollection.features.push(
    feature
  );

  phaseIL2StoreEditOrigin(
    feature,
    suggestion
  );

  phaseIL21EditSession = {
    featureId: String(feature.id),
    suggestionId: String(suggestion.id || ""),
    targetClass: target,
  };

  phaseIL21RemoveSuggestionWithoutAdvance(
    suggestion
  );

  phaseIL1State.applyingSuggestion = true;

  setSingleSelection(
    String(feature.id),
    false
  );

  markChanged();

  phaseIL1State.applyingSuggestion = false;

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL21SetEditingUi(true);

  setMode("freehand");

  setSingleSelection(
    String(feature.id),
    false
  );

  drawAnnotations();

  setStatus(
    "Edit suggestion, choose class if needed, then Accept edit",
    "local"
  );
}

function phaseIL21FinishEdit() {
  if (!phaseIL21EditSession) {
    return false;
  }

  const feature =
    (featureCollection.features || [])
      .find(
        (item) =>
          String(item?.id || "")
          === phaseIL21EditSession.featureId
      );

  if (!feature) {
    phaseIL21EditSession = null;
    phaseIL21SetEditingUi(false);

    setStatus(
      "Edited suggestion could not be found",
      "error"
    );
    return true;
  }

  const finalClass =
    phaseIL21SelectedClass();

  if (!finalClass) {
    setStatus(
      "Choose a class before accepting the edit",
      "error"
    );
    return true;
  }

  phaseIL1State.applyingSuggestion = true;

  phaseIL21ApplyClassToFeature(
    feature,
    finalClass
  );

  phaseIL21MarkDecision(
    feature,
    finalClass,
    true
  );

  markChanged();

  phaseIL9RecordDecisionById(
    String(
      phaseIL21EditSession
        ?.suggestionId
      || ""
    ),
    feature?.properties
      ?.histoannotator
      ?.interactiveLearning
      ?.decision
      || "edited",
    {
      edited: true,
    }
  );

  phaseIL1State.applyingSuggestion = false;
  phaseIL21EditSession = null;

  phaseIL21SetEditingUi(false);
  clearSelectedFeatures(false);

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL1RenderSuggestionState();

  setStatus(
    `${finalClass} edit accepted as Draft`,
    "saved"
  );

  return true;
}


// ========================================================================
// Phase IL2.2 - highlighted review overlay and Freehand edit
// ========================================================================

let phaseIL22SuggestionOverlayVisible = true;

function phaseIL22OverlayButton() {
  return document.getElementById(
    "phaseIL22OverlayButton"
  );
}

function phaseIL22UpdateOverlayButton() {
  const button = phaseIL22OverlayButton();
  if (!button) return;

  button.textContent =
    phaseIL22SuggestionOverlayVisible
      ? "Hide"
      : "Show";

  button.title =
    phaseIL22SuggestionOverlayVisible
      ? "Hide current suggestion"
      : "Show current suggestion";

  button.setAttribute(
    "aria-pressed",
    String(phaseIL22SuggestionOverlayVisible)
  );
}

function phaseIL22ResetOverlayForSuggestion() {
  if (phaseIL21EditSession) return;

  phaseIL22SuggestionOverlayVisible = true;
  phaseIL22UpdateOverlayButton();
}

function phaseIL22ToggleSuggestionOverlay() {
  if (phaseIL21EditSession) return;

  phaseIL22SuggestionOverlayVisible =
    !phaseIL22SuggestionOverlayVisible;

  phaseIL22UpdateOverlayButton();
  drawAnnotations();
}

function phaseIL22AddRingToPath(ring) {
  if (
    !Array.isArray(ring)
    || ring.length < 3
  ) {
    return false;
  }

  let started = false;

  for (const point of ring) {
    const screen =
      screenPointFromImage(point);

    if (!screen) continue;

    if (!started) {
      ctx.moveTo(
        screen.x,
        screen.y
      );
      started = true;
    } else {
      ctx.lineTo(
        screen.x,
        screen.y
      );
    }
  }

  if (started) {
    ctx.closePath();
  }

  return started;
}

function phaseIL22FillPolygon(
  polygon,
  color
) {
  if (!Array.isArray(polygon)) return;

  ctx.save();
  ctx.beginPath();

  let hasPath = false;

  for (const ring of polygon) {
    hasPath =
      phaseIL22AddRingToPath(ring)
      || hasPath;
  }

  if (hasPath) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.fill("evenodd");
  }

  ctx.restore();
}

function phaseIL22FillGeometry(
  geometry,
  color = "#fff200"
) {
  if (!geometry) return;

  if (geometry.type === "Polygon") {
    phaseIL22FillPolygon(
      geometry.coordinates || [],
      color
    );
    return;
  }

  if (geometry.type === "MultiPolygon") {
    for (
      const polygon
      of geometry.coordinates || []
    ) {
      phaseIL22FillPolygon(
        polygon,
        color
      );
    }
  }
}


// ========================================================================
// Phase IL2.3 - two-row suggestion review layout
// ========================================================================

function phaseIL23ArrangeSuggestionActions() {
  const actionRow =
    document.querySelector(
      "#phaseIL1SuggestionPanel .phase-il1-actions"
    );

  if (!actionRow) return;

  let upper =
    document.getElementById(
      "phaseIL23UpperActions"
    );

  let lower =
    document.getElementById(
      "phaseIL23LowerActions"
    );

  if (!upper) {
    upper =
      document.createElement("div");

    upper.id =
      "phaseIL23UpperActions";

    upper.className =
      "phase-il23-upper-actions";
  }

  if (!lower) {
    lower =
      document.createElement("div");

    lower.id =
      "phaseIL23LowerActions";

    lower.className =
      "phase-il23-lower-actions";
  }

  if (upper.parentElement !== actionRow) {
    actionRow.append(upper);
  }

  if (lower.parentElement !== actionRow) {
    actionRow.append(lower);
  }

  const reject =
    document.getElementById(
      "phaseIL1RejectButton"
    );

  const later =
    document.getElementById(
      "phaseIL2LaterButton"
    );

  const edit =
    document.getElementById(
      "phaseIL1EditButton"
    );

  const classSelect =
    phaseIL21SuggestionClassSelect();

  const overlay =
    phaseIL22OverlayButton();

  const accept =
    document.getElementById(
      "phaseIL1AcceptButton"
    );

  for (
    const control
    of [
      reject,
      later,
      edit,
      classSelect,
    ]
  ) {
    if (control) {
      upper.append(control);
    }
  }

  if (overlay) {
    lower.append(overlay);
  }

  if (accept) {
    lower.append(accept);
  }
}

function phaseIL2EnsureUi() {
  const actionRow =
    document.querySelector(
      "#phaseIL1SuggestionPanel .phase-il1-actions"
    );

  if (!actionRow) return;

  let overlayButton =
    phaseIL22OverlayButton();

  if (!overlayButton) {
    overlayButton =
      document.createElement("button");

    overlayButton.id =
      "phaseIL22OverlayButton";
    overlayButton.type =
      "button";
    overlayButton.className =
      "phase-il22-overlay-button";

    actionRow.insertBefore(
      overlayButton,
      actionRow.firstChild
    );

    overlayButton.addEventListener(
      "click",
      phaseIL22ToggleSuggestionOverlay
    );
  }

  phaseIL22UpdateOverlayButton();


  document.getElementById(
    "phaseIL2ClassButton"
  )?.remove();

  document.getElementById(
    "phaseIL2AssignRow"
  )?.remove();

  let later =
    document.getElementById(
      "phaseIL2LaterButton"
    );

  if (!later) {
    later =
      document.createElement("button");

    later.id = "phaseIL2LaterButton";
    later.type = "button";
    later.textContent = "Later";
    later.title = "Review later";

    const edit =
      document.getElementById(
        "phaseIL1EditButton"
      );

    if (edit) {
      actionRow.insertBefore(
        later,
        edit
      );
    } else {
      actionRow.append(later);
    }

    later.addEventListener(
      "click",
      phaseIL2ReviewLater
    );
  }

  let select =
    phaseIL21SuggestionClassSelect();

  if (!select) {
    select =
      document.createElement("select");

    select.id =
      "phaseIL21SuggestionClassSelect";

    select.className =
      "phase-il21-class-select";

    select.title =
      "Class assigned when Accept is pressed";

    select.setAttribute(
      "aria-label",
      "Suggestion class"
    );

    const accept =
      document.getElementById(
        "phaseIL1AcceptButton"
      );

    if (accept) {
      actionRow.insertBefore(
        select,
        accept
      );
    } else {
      actionRow.append(select);
    }
  }

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL21SetEditingUi(false);

  phaseIL23ArrangeSuggestionActions();
}



function phaseIL2Initialize() {
  phaseIL2EnsureUi();
}


function phaseIL1Initialize() {
  phaseIL1EnsureUi();
  phaseIL10InitializeModelSelector();

  const refs =
    phaseIL1Refs();

  refs.menu?.addEventListener(
    "click",
    phaseIL1Open
  );

  refs.close?.addEventListener(
    "click",
    phaseIL1Close
  );

  refs.clear?.addEventListener(
    "click",
    () =>
      phaseIL1ClearSuggestions()
  );

  refs.run?.addEventListener(
    "click",
    phaseIL1Run
  );

  refs.classSelect
    ?.addEventListener(
      "change",
      () => {
        phaseIL1State.targetClass =
          refs.classSelect.value;

        phaseIL1ClearSuggestions(
          "",
          true
        );
      }
    );

  refs.sensitivity
    ?.addEventListener(
      "input",
      () => {
        if (
          refs.sensitivityValue
        ) {
          refs.sensitivityValue
            .textContent =
              refs.sensitivity.value;
        }
      }
    );

  refs.smoothing
    ?.addEventListener(
      "input",
      () => {
        if (
          refs.smoothingValue
        ) {
          refs.smoothingValue
            .textContent =
              refs.smoothing.value;
        }
      }
    );

  refs.previous
    ?.addEventListener(
      "click",
      () => {
        const total =
          phaseIL1State
            .suggestions.length;

        if (!total) return;

        phaseIL1State.index =
          (
            phaseIL1State.index
            - 1
            + total
          ) % total;

        phaseIL1RenderSuggestionState();
      }
    );

  refs.next
    ?.addEventListener(
      "click",
      () => {
        const total =
          phaseIL1State
            .suggestions.length;

        if (!total) return;

        phaseIL1State.index =
          (
            phaseIL1State.index
            + 1
          ) % total;

        phaseIL1RenderSuggestionState();
      }
    );

  refs.reject
    ?.addEventListener(
      "click",
      phaseIL1Reject
    );

  refs.accept
    ?.addEventListener(
      "click",
      () =>
        phaseIL1AcceptCurrent(
          false
        )
    );

  refs.edit
    ?.addEventListener(
      "click",
      () =>
        phaseIL1AcceptCurrent(
          true
        )
    );
}


