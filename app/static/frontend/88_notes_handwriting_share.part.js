
// ========================================================================
// Notes + Handwriting + Native Share v1
// ========================================================================

const PHASE_NOTES_DB_NAME = "histoannotator-notes-v1";
const PHASE_NOTES_STORE = "topics";

let phaseNotesDbPromise = null;
let phaseNotesTopics = [];
let phaseNotesTopicId = null;
let phaseNotesCaptureId = null;
let phaseNotesCaptureTarget = null;
let phaseNotesSaveTimer = null;

let phaseNotesCaptureTool = "pen";
let phaseNotesCaptureDrawing = null;

let phaseNotesHandTool = "pen";
let phaseNotesHandDrawing = null;


// ------------------------------------------------------------------------
// Generic native file Share, with download fallback.
// ------------------------------------------------------------------------

async function phaseNativeShareFile(blob, filename, title) {
  const file = new File(
    [blob],
    filename,
    { type: blob.type || "application/octet-stream" }
  );

  try {
    if (
      typeof navigator.share === "function"
      && (
        typeof navigator.canShare !== "function"
        || navigator.canShare({ files: [file] })
      )
    ) {
      await navigator.share({
        title: title || "HistoAnnotator",
        files: [file],
      });

      return "shared";
    }
  } catch (error) {
    if (String(error?.name || "") === "AbortError") {
      return "cancelled";
    }

    console.warn(
      "Native share failed; falling back to download",
      error
    );
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );

  return "downloaded";
}


// ------------------------------------------------------------------------
// Add Share to Report Builder.
// ------------------------------------------------------------------------

async function phaseReportShareArtifact() {
  if (!phaseReportCurrent?.entries?.length) {
    throw new Error("The report has no findings to share");
  }

  const parts = [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0 Arial;}}",
    "\\paperw11907\\paperh16840",
    "\\margl1134\\margr1134\\margt1134\\margb1134",
    "\\fs32\\b HistoAnnotator Annotation Report\\b0\\fs22\\par",
    "\\par",
    `\\b Image:\\b0 ${phaseReportRtfEscape(phaseReportCurrent.imageName)}\\par`,
    `\\b Annotation file:\\b0 ${phaseReportRtfEscape(phaseReportCurrent.annotationFile)}\\par`,
    `\\b Generated:\\b0 ${phaseReportRtfEscape(new Date().toLocaleString())}\\par`,
    "\\par",
  ];

  for (
    let index = 0;
    index < phaseReportCurrent.entries.length;
    index += 1
  ) {
    const entry = phaseReportCurrent.entries[index];
    const rendered = await phaseReportEntryRenderedDataUrl(entry);
    const hex = phaseReportDataUrlToHex(rendered.dataUrl);

    const goalWidth = 9000;
    const goalHeight = Math.max(
      100,
      Math.round(
        goalWidth * rendered.height / rendered.width
      )
    );

    parts.push(
      `\\fs26\\b Finding ${index + 1}\\b0\\fs22\\par`
    );

    parts.push(
      `\\i Region: x=${Math.round(entry.region?.x || 0)}, `
      + `y=${Math.round(entry.region?.y || 0)}, `
      + `${Math.round(entry.region?.width || 0)} x `
      + `${Math.round(entry.region?.height || 0)} px\\i0\\par`
    );

    parts.push(
      "{\\pict\\pngblip"
      + `\\picw${rendered.width}`
      + `\\pich${rendered.height}`
      + `\\picwgoal${goalWidth}`
      + `\\pichgoal${goalHeight} `
      + hex
      + "}\\par"
    );

    const note = String(entry.note || "").trim();

    parts.push(
      note
        ? "\\b Note:\\b0 "
          + phaseReportRtfEscape(note)
          + "\\par"
        : "\\b Note:\\b0 —\\par"
    );

    parts.push("\\par");
  }

  parts.push("}");

  return {
    blob: new Blob(
      [parts.join("\n")],
      { type: "application/rtf" }
    ),
    filename:
      phaseReportSafeFilename(
        `${phaseReportCurrent.imageName}_${phaseReportCurrent.annotationFile}_report`
      )
      + ".rtf",
    title: "HistoAnnotator Annotation Report",
  };
}


async function phaseReportNativeShare() {
  try {
    setStatus("Preparing report to share…", "local");

    const artifact = await phaseReportShareArtifact();

    const result = await phaseNativeShareFile(
      artifact.blob,
      artifact.filename,
      artifact.title
    );

    if (result === "shared") {
      setStatus("Report shared", "saved");
    } else if (result === "downloaded") {
      setStatus(
        "Native share unavailable; report downloaded",
        "saved"
      );
    }

  } catch (error) {
    console.error("Report share failed", error);

    setStatus(
      `Could not share report: ${error.message}`,
      "error"
    );
  }
}


function phaseInstallReportShareButton() {
  if (
    document.getElementById(
      "phaseReportShareButton"
    )
  ) {
    return;
  }

  const exportButton =
    document.getElementById(
      "phaseReportExportButton"
    );

  if (!exportButton) return;

  const button =
    document.createElement("button");

  button.id = "phaseReportShareButton";
  button.type = "button";
  button.textContent = "Share";

  button.addEventListener(
    "click",
    () => void phaseReportNativeShare()
  );

  exportButton.insertAdjacentElement(
    "afterend",
    button
  );
}


// ------------------------------------------------------------------------
// Notes persistence.
// ------------------------------------------------------------------------

function phaseNotesUuid() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    `note-${Date.now()}-`
    + Math.random().toString(16).slice(2)
  );
}


function phaseNotesOpenDb() {
  if (phaseNotesDbPromise) {
    return phaseNotesDbPromise;
  }

  phaseNotesDbPromise = new Promise(
    (resolve, reject) => {
      const request =
        indexedDB.open(
          PHASE_NOTES_DB_NAME,
          1
        );

      request.onupgradeneeded = () => {
        const db = request.result;

        if (
          !db.objectStoreNames
            .contains(PHASE_NOTES_STORE)
        ) {
          db.createObjectStore(
            PHASE_NOTES_STORE,
            { keyPath: "id" }
          );
        }
      };

      request.onsuccess =
        () => resolve(request.result);

      request.onerror =
        () => reject(request.error);
    }
  );

  return phaseNotesDbPromise;
}


async function phaseNotesLoadTopics() {
  const db = await phaseNotesOpenDb();

  phaseNotesTopics =
    await new Promise(
      (resolve, reject) => {
        const tx =
          db.transaction(
            PHASE_NOTES_STORE,
            "readonly"
          );

        const request =
          tx.objectStore(
            PHASE_NOTES_STORE
          ).getAll();

        request.onsuccess =
          () =>
            resolve(
              request.result || []
            );

        request.onerror =
          () =>
            reject(
              request.error
            );
      }
    );

  phaseNotesTopics.sort(
    (a, b) =>
      String(b.updatedAt || "")
        .localeCompare(
          String(a.updatedAt || "")
        )
  );

  return phaseNotesTopics;
}


async function phaseNotesSaveTopic(topic) {
  if (!topic?.id) return false;

  topic.updatedAt =
    new Date().toISOString();

  const db = await phaseNotesOpenDb();

  await new Promise(
    (resolve, reject) => {
      const tx =
        db.transaction(
          PHASE_NOTES_STORE,
          "readwrite"
        );

      const request =
        tx.objectStore(
          PHASE_NOTES_STORE
        ).put(topic);

      request.onsuccess =
        () => resolve();

      request.onerror =
        () => reject(request.error);
    }
  );

  return true;
}


async function phaseNotesDeleteTopicStorage(id) {
  const db = await phaseNotesOpenDb();

  await new Promise(
    (resolve, reject) => {
      const tx =
        db.transaction(
          PHASE_NOTES_STORE,
          "readwrite"
        );

      const request =
        tx.objectStore(
          PHASE_NOTES_STORE
        ).delete(id);

      request.onsuccess =
        () => resolve();

      request.onerror =
        () => reject(request.error);
    }
  );

  phaseNotesTopics =
    phaseNotesTopics.filter(
      (topic) =>
        String(topic.id)
        !== String(id)
    );
}


function phaseNotesCurrentTopic() {
  return (
    phaseNotesTopics.find(
      (topic) =>
        String(topic.id)
        === String(phaseNotesTopicId)
    )
    || null
  );
}


function phaseNotesCurrentCapture() {
  const topic =
    phaseNotesCurrentTopic();

  if (!topic) return null;

  return (
    (topic.captures || []).find(
      (capture) =>
        String(capture.id)
        === String(
          phaseNotesCaptureId
        )
    )
    || null
  );
}


function phaseNotesScheduleSave(
  delay = 500
) {
  clearTimeout(
    phaseNotesSaveTimer
  );

  const status =
    document.getElementById(
      "phaseNotesSaveState"
    );

  if (status) {
    status.textContent =
      "Saving…";
  }

  phaseNotesSaveTimer =
    setTimeout(
      async () => {
        phaseNotesSaveTimer =
          null;

        const topic =
          phaseNotesCurrentTopic();

        if (!topic) return;

        try {
          await phaseNotesSaveTopic(
            topic
          );

          if (status) {
            status.textContent =
              "Saved automatically";
          }

        } catch (error) {
          console.error(
            "Notes autosave failed",
            error
          );

          if (status) {
            status.textContent =
              "Could not save";
          }
        }
      },
      delay
    );
}


// ------------------------------------------------------------------------
// Notes UI.
// ------------------------------------------------------------------------

function phaseNotesEnsureUi() {
  if (
    document.getElementById(
      "phaseNotesOverlay"
    )
  ) {
    return;
  }

  const host =
    document.createElement("div");

  host.innerHTML = `
    <div id="phaseNotesOverlay"
         class="modal-overlay phase-notes-overlay"
         hidden>
      <section class="modal-card phase-notes-card"
               role="dialog"
               aria-modal="true">
        <div class="phase-notes-header">
          <div>
            <h2>Notes</h2>
            <div class="phase-notes-muted">
              Local cross-image visual notebook
            </div>
          </div>

          <div class="phase-notes-actions">
            <button id="phaseNotesNewTopicButton"
                    type="button">
              + New topic
            </button>

            <button id="phaseNotesCloseButton"
                    type="button">
              Close
            </button>
          </div>
        </div>

        <div id="phaseNotesTopicList"
             class="phase-notes-topic-list">
        </div>
      </section>
    </div>

    <div id="phaseNotesTopicOverlay"
         class="modal-overlay phase-notes-overlay"
         hidden>
      <section class="modal-card phase-notes-topic-card"
               role="dialog"
               aria-modal="true">

        <div class="phase-notes-header">
          <div class="phase-notes-title-field">
            <label for="phaseNotesTopicTitle">
              Topic / title
            </label>

            <input id="phaseNotesTopicTitle"
                   type="text"
                   inputmode="text"
                   autocapitalize="sentences"
                   spellcheck="true"
                   placeholder="e.g. Cell examples">
          </div>

          <div class="phase-notes-actions">
            <button id="phaseNotesAddCaptureButton"
                    type="button">
              + Capture current image
            </button>

            <button id="phaseNotesDownloadButton"
                    type="button">
              Download
            </button>

            <button id="phaseNotesShareButton"
                    type="button">
              Share
            </button>

            <button id="phaseNotesBackButton"
                    type="button">
              Back
            </button>
          </div>
        </div>

        <div class="phase-notes-note-modes">
          <button type="button"
                  data-notes-note-mode="typed"
                  class="active">
            Typed note
          </button>

          <button type="button"
                  data-notes-note-mode="handwriting">
            Handwritten note
          </button>
        </div>

        <div id="phaseNotesTypedPanel"
             class="phase-notes-note-panel">
          <label for="phaseNotesTypedText">
            Note
          </label>

          <textarea id="phaseNotesTypedText"
                    rows="5"
                    inputmode="text"
                    autocapitalize="sentences"
                    spellcheck="true"
                    placeholder="Type here, or use your tablet keyboard handwriting-to-text…">
          </textarea>
        </div>

        <div id="phaseNotesHandPanel"
             class="phase-notes-note-panel"
             hidden>
          <div class="phase-notes-hand-toolbar">
            <button type="button"
                    data-notes-hand-tool="pen"
                    class="active">
              Pen
            </button>

            <button type="button"
                    data-notes-hand-tool="eraser">
              Eraser
            </button>

            <button id="phaseNotesHandUndoButton"
                    type="button">
              Undo
            </button>

            <button id="phaseNotesHandClearButton"
                    type="button">
              Clear
            </button>
          </div>

          <div class="phase-notes-whiteboard-wrap">
            <canvas id="phaseNotesHandCanvas"
                    width="1200"
                    height="650">
            </canvas>
          </div>
        </div>

        <div class="phase-notes-captures-heading">
          <strong>Visual examples</strong>
          <span>
            Captures can come from different images.
          </span>
        </div>

        <div id="phaseNotesCaptureList"
             class="phase-notes-capture-list">
        </div>

        <div class="phase-notes-footer">
          <span id="phaseNotesSaveState">
            Saved automatically
          </span>

          <button id="phaseNotesDeleteTopicButton"
                  class="danger"
                  type="button">
            Delete topic
          </button>
        </div>
      </section>
    </div>

    <div id="phaseNotesCaptureEditorOverlay"
         class="modal-overlay phase-notes-overlay"
         hidden>
      <section class="modal-card phase-notes-editor-card"
               role="dialog"
               aria-modal="true">

        <div class="phase-notes-header">
          <div>
            <h2>Visual example</h2>
            <div id="phaseNotesCaptureOrigin"
                 class="phase-notes-muted">
            </div>
          </div>

          <button id="phaseNotesCaptureDoneButton"
                  type="button">
            Done
          </button>
        </div>

        <div class="phase-notes-editor-layout">
          <div>
            <div class="phase-notes-capture-toolbar">
              <button type="button"
                      data-notes-capture-tool="pen"
                      class="active">
                Pen
              </button>

              <button type="button"
                      data-notes-capture-tool="arrow">
                Arrow
              </button>

              <button type="button"
                      data-notes-capture-tool="rectangle">
                Rectangle
              </button>

              <button id="phaseNotesCaptureUndoButton"
                      type="button">
                Undo
              </button>

              <button id="phaseNotesCaptureClearButton"
                      type="button">
                Clear drawing
              </button>
            </div>

            <div class="phase-notes-capture-canvas-wrap">
              <canvas id="phaseNotesCaptureCanvas">
              </canvas>
            </div>
          </div>

          <div class="phase-notes-caption-column">
            <label for="phaseNotesCaptureCaption">
              Caption / note
            </label>

            <textarea id="phaseNotesCaptureCaption"
                      rows="9"
                      inputmode="text"
                      autocapitalize="sentences"
                      spellcheck="true"
                      placeholder="Describe this example…">
            </textarea>

            <div class="phase-notes-footer">
              <span id="phaseNotesCaptureSaveState">
                Saved automatically
              </span>

              <button id="phaseNotesDeleteCaptureButton"
                      class="danger"
                      type="button">
                Delete capture
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  while (
    host.firstElementChild
  ) {
    document.body.append(
      host.firstElementChild
    );
  }
}


function phaseNotesMainOverlay() {
  return document.getElementById(
    "phaseNotesOverlay"
  );
}


function phaseNotesTopicOverlay() {
  return document.getElementById(
    "phaseNotesTopicOverlay"
  );
}


function phaseNotesCaptureOverlay() {
  return document.getElementById(
    "phaseNotesCaptureEditorOverlay"
  );
}


async function phaseNotesOpen() {
  phaseNotesEnsureUi();

  try {
    phaseAdditionalToolsClose?.();
  } catch (_) {}

  await phaseNotesLoadTopics();
  phaseNotesRenderTopicList();

  phaseNotesMainOverlay().hidden =
    false;
}


function phaseNotesClose() {
  phaseNotesMainOverlay().hidden =
    true;
}


function phaseNotesRenderTopicList() {
  const container =
    document.getElementById(
      "phaseNotesTopicList"
    );

  container.innerHTML = "";

  if (!phaseNotesTopics.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "phase-notes-empty";

    empty.innerHTML =
      "<strong>No topics yet</strong>"
      + "<span>Create a topic such as “Cell examples” or “Tissue patterns”.</span>";

    container.append(empty);
    return;
  }

  for (
    const topic
    of phaseNotesTopics
  ) {
    const card =
      document.createElement(
        "button"
      );

    card.type = "button";
    card.className =
      "phase-notes-topic-row";

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      topic.title
      || "Untitled topic";

    const count =
      document.createElement(
        "span"
      );

    const captures =
      topic.captures || [];

    count.textContent =
      `${captures.length} capture`
      + (
        captures.length === 1
          ? ""
          : "s"
      );

    const strip =
      document.createElement(
        "span"
      );

    strip.className =
      "phase-notes-preview-strip";

    for (
      const capture
      of captures.slice(0, 4)
    ) {
      const image =
        document.createElement(
          "img"
        );

      image.src =
        capture.imageDataUrl;

      image.alt = "";

      strip.append(image);
    }

    card.append(
      title,
      count,
      strip
    );

    card.addEventListener(
      "click",
      () => {
        void phaseNotesOpenTopic(
          topic.id
        );
      }
    );

    container.append(card);
  }
}


async function phaseNotesCreateTopic() {
  const now =
    new Date().toISOString();

  const topic = {
    schemaVersion: 1,
    id: phaseNotesUuid(),
    title: "New topic",
    typedNote: "",
    handwriting: [],
    createdAt: now,
    updatedAt: now,
    captures: [],
  };

  phaseNotesTopics.unshift(
    topic
  );

  await phaseNotesSaveTopic(
    topic
  );

  await phaseNotesOpenTopic(
    topic.id
  );
}


async function phaseNotesOpenTopic(id) {
  phaseNotesTopicId = id;

  const topic =
    phaseNotesCurrentTopic();

  if (!topic) return;

  if (
    !Array.isArray(
      topic.handwriting
    )
  ) {
    topic.handwriting = [];
  }

  if (
    !Array.isArray(
      topic.captures
    )
  ) {
    topic.captures = [];
  }

  phaseNotesMainOverlay().hidden =
    true;

  phaseNotesTopicOverlay().hidden =
    false;

  document.getElementById(
    "phaseNotesTopicTitle"
  ).value =
    topic.title || "";

  document.getElementById(
    "phaseNotesTypedText"
  ).value =
    topic.typedNote || "";

  document.getElementById(
    "phaseNotesSaveState"
  ).textContent =
    "Saved automatically";

  phaseNotesSetNoteMode(
    "typed"
  );

  phaseNotesRenderHandwriting();
  phaseNotesRenderCaptures();
}


async function phaseNotesBack() {
  clearTimeout(
    phaseNotesSaveTimer
  );

  const topic =
    phaseNotesCurrentTopic();

  if (topic) {
    await phaseNotesSaveTopic(
      topic
    );
  }

  phaseNotesTopicId = null;

  phaseNotesTopicOverlay().hidden =
    true;

  await phaseNotesOpen();
}


function phaseNotesTypedChanged() {
  const topic =
    phaseNotesCurrentTopic();

  if (!topic) return;

  topic.title =
    document.getElementById(
      "phaseNotesTopicTitle"
    ).value;

  topic.typedNote =
    document.getElementById(
      "phaseNotesTypedText"
    ).value;

  phaseNotesScheduleSave();
}


async function phaseNotesDeleteTopic() {
  const topic =
    phaseNotesCurrentTopic();

  if (!topic) return;

  if (
    !window.confirm(
      `Delete topic “${topic.title || "Untitled topic"}”?`
    )
  ) {
    return;
  }

  await phaseNotesDeleteTopicStorage(
    topic.id
  );

  phaseNotesTopicId = null;

  phaseNotesTopicOverlay().hidden =
    true;

  await phaseNotesOpen();
}


// ------------------------------------------------------------------------
// Typed vs handwritten note.
// ------------------------------------------------------------------------

function phaseNotesSetNoteMode(mode) {
  const typed =
    mode === "typed";

  document.getElementById(
    "phaseNotesTypedPanel"
  ).hidden =
    !typed;

  document.getElementById(
    "phaseNotesHandPanel"
  ).hidden =
    typed;

  for (
    const button
    of document.querySelectorAll(
      "[data-notes-note-mode]"
    )
  ) {
    button.classList.toggle(
      "active",
      button.dataset.notesNoteMode
        === mode
    );
  }

  if (!typed) {
    phaseNotesRenderHandwriting();
  }
}


function phaseNotesSetHandTool(tool) {
  phaseNotesHandTool = tool;

  for (
    const button
    of document.querySelectorAll(
      "[data-notes-hand-tool]"
    )
  ) {
    button.classList.toggle(
      "active",
      button.dataset.notesHandTool
        === tool
    );
  }
}


function phaseNotesHandPoint(event) {
  const canvas =
    document.getElementById(
      "phaseNotesHandCanvas"
    );

  const rect =
    canvas.getBoundingClientRect();

  if (
    rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  return [
    (
      event.clientX
      - rect.left
    )
      * canvas.width
      / rect.width,

    (
      event.clientY
      - rect.top
    )
      * canvas.height
      / rect.height,
  ];
}


function phaseNotesDrawHandStroke(
  context,
  stroke
) {
  const points =
    stroke?.points || [];

  if (!points.length) return;

  context.save();

  context.strokeStyle =
    stroke.tool === "eraser"
      ? "#ffffff"
      : "#111111";

  context.fillStyle =
    context.strokeStyle;

  context.lineWidth =
    stroke.tool === "eraser"
      ? 28
      : 4;

  context.lineCap =
    "round";

  context.lineJoin =
    "round";

  if (points.length === 1) {
    context.beginPath();

    context.arc(
      points[0][0],
      points[0][1],
      context.lineWidth / 2,
      0,
      Math.PI * 2
    );

    context.fill();

  } else {
    context.beginPath();

    context.moveTo(
      points[0][0],
      points[0][1]
    );

    for (
      let index = 1;
      index < points.length;
      index += 1
    ) {
      context.lineTo(
        points[index][0],
        points[index][1]
      );
    }

    context.stroke();
  }

  context.restore();
}


function phaseNotesRenderHandwriting() {
  const topic =
    phaseNotesCurrentTopic();

  const canvas =
    document.getElementById(
      "phaseNotesHandCanvas"
    );

  if (
    !topic
    || !canvas
  ) {
    return;
  }

  const context =
    canvas.getContext("2d");

  context.save();

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  context.restore();

  for (
    const stroke
    of topic.handwriting || []
  ) {
    phaseNotesDrawHandStroke(
      context,
      stroke
    );
  }

  if (phaseNotesHandDrawing) {
    phaseNotesDrawHandStroke(
      context,
      phaseNotesHandDrawing
    );
  }
}


function phaseNotesHandPointerDown(
  event
) {
  if (
    event.pointerType === "touch"
  ) {
    return;
  }

  if (
    event.pointerType === "mouse"
    && event.button !== 0
  ) {
    return;
  }

  const point =
    phaseNotesHandPoint(
      event
    );

  if (!point) return;

  event.preventDefault();

  try {
    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );
  } catch (_) {}

  phaseNotesHandDrawing = {
    tool: phaseNotesHandTool,
    points: [point],
    pointerId: event.pointerId,
  };

  phaseNotesRenderHandwriting();
}


function phaseNotesHandPointerMove(
  event
) {
  if (
    !phaseNotesHandDrawing
    || phaseNotesHandDrawing
      .pointerId
      !== event.pointerId
  ) {
    return;
  }

  const point =
    phaseNotesHandPoint(
      event
    );

  if (!point) return;

  event.preventDefault();

  const points =
    phaseNotesHandDrawing.points;

  const last =
    points[
      points.length - 1
    ];

  if (
    !last
    || Math.hypot(
      point[0] - last[0],
      point[1] - last[1]
    ) > 1
  ) {
    points.push(point);
  }

  phaseNotesRenderHandwriting();
}


function phaseNotesHandPointerUp(
  event
) {
  if (
    !phaseNotesHandDrawing
    || phaseNotesHandDrawing
      .pointerId
      !== event.pointerId
  ) {
    return;
  }

  event.preventDefault();

  const topic =
    phaseNotesCurrentTopic();

  if (!topic) {
    phaseNotesHandDrawing =
      null;
    return;
  }

  const stroke = {
    tool:
      phaseNotesHandDrawing.tool,
    points:
      phaseNotesHandDrawing.points,
  };

  phaseNotesHandDrawing =
    null;

  if (
    stroke.points.length
  ) {
    topic.handwriting.push(
      stroke
    );

    phaseNotesScheduleSave(
      150
    );
  }

  phaseNotesRenderHandwriting();
}


function phaseNotesHandUndo() {
  const topic =
    phaseNotesCurrentTopic();

  if (
    !topic?.handwriting?.length
  ) {
    return;
  }

  topic.handwriting.pop();

  phaseNotesScheduleSave(
    100
  );

  phaseNotesRenderHandwriting();
}


function phaseNotesHandClear() {
  const topic =
    phaseNotesCurrentTopic();

  if (!topic) return;

  if (
    !window.confirm(
      "Clear handwritten note?"
    )
  ) {
    return;
  }

  topic.handwriting = [];

  phaseNotesScheduleSave(
    100
  );

  phaseNotesRenderHandwriting();
}


function phaseNotesHandwritingDataUrl() {
  const topic =
    phaseNotesCurrentTopic();

  if (
    !topic?.handwriting?.length
  ) {
    return null;
  }

  phaseNotesRenderHandwriting();

  return document.getElementById(
    "phaseNotesHandCanvas"
  ).toDataURL(
    "image/png"
  );
}


// ------------------------------------------------------------------------
// Cross-image capture: reuse Report Builder level-0 selection.
// ------------------------------------------------------------------------

const phaseNotesBaseReportCreate =
  phaseReportCreateEntryFromRegion;

phaseReportCreateEntryFromRegion =
  async function phaseNotesRouteCapture(
    region
  ) {
    if (!phaseNotesCaptureTarget) {
      return phaseNotesBaseReportCreate(
        region
      );
    }

    const topicId =
      phaseNotesCaptureTarget.topicId;

    phaseNotesCaptureTarget =
      null;

    const topic =
      phaseNotesTopics.find(
        (candidate) =>
          String(candidate.id)
          === String(topicId)
      );

    if (!topic) {
      throw new Error(
        "Notes topic no longer exists"
      );
    }

    let captured;

    try {
      captured =
        await phaseReportFetchRegion(
          region
        );

    } catch (error) {
      console.warn(
        "Notes server crop unavailable; using viewer fallback",
        error
      );

      captured =
        await phaseReportCaptureFromViewer(
          region
        );
    }

    const now =
      new Date().toISOString();

    const entry = {
      id: phaseNotesUuid(),
      createdAt: now,
      updatedAt: now,

      imageId:
        String(
          currentImage?.id
          || ""
        ),

      imageName:
        String(
          currentImage?.name
          || currentImage?.relativePath
          || currentImage?.id
          || ""
        ),

      annotationFile:
        String(
          currentAnnotationFile
          || "Default"
        ),

      region: {
        ...region,
        outputWidth:
          captured.outputWidth,
        outputHeight:
          captured.outputHeight,
      },

      captureWidth:
        captured.outputWidth,

      captureHeight:
        captured.outputHeight,

      imageDataUrl:
        captured.dataUrl,

      markup: [],
      note: "",
    };

    topic.captures.push(entry);

    await phaseNotesSaveTopic(
      topic
    );

    phaseNotesTopicId =
      topic.id;

    await phaseNotesOpenCapture(
      entry.id
    );
  };


const phaseNotesBaseCaptureCancel =
  phaseReportCaptureCancel;

phaseReportCaptureCancel =
  function phaseNotesCaptureCancel() {
    if (!phaseNotesCaptureTarget) {
      return phaseNotesBaseCaptureCancel();
    }

    const topicId =
      phaseNotesCaptureTarget.topicId;

    phaseNotesCaptureTarget =
      null;

    phaseReportCapture =
      null;

    drawAnnotations();

    setStatus(
      "Notes capture cancelled",
      "local"
    );

    void phaseNotesOpenTopic(
      topicId
    );
  };


function phaseNotesStartCapture() {
  const topic =
    phaseNotesCurrentTopic();

  if (!topic) return;

  if (!currentImage?.id) {
    setStatus(
      "Open an image before adding a Notes capture",
      "error"
    );

    return;
  }

  phaseNotesTopicOverlay().hidden =
    true;

  phaseNotesCaptureTarget = {
    topicId: topic.id,
  };

  phaseReportCaptureStart();

  setStatus(
    "Notes: drag a rectangle over the visual example",
    "local"
  );
}


// ------------------------------------------------------------------------
// Capture markup editor.
// ------------------------------------------------------------------------

function phaseNotesSetCaptureTool(
  tool
) {
  phaseNotesCaptureTool = tool;

  for (
    const button
    of document.querySelectorAll(
      "[data-notes-capture-tool]"
    )
  ) {
    button.classList.toggle(
      "active",
      button.dataset.notesCaptureTool
        === tool
    );
  }
}


function phaseNotesCaptureCanvasPoint(
  event
) {
  const canvas =
    document.getElementById(
      "phaseNotesCaptureCanvas"
    );

  const rect =
    canvas.getBoundingClientRect();

  if (
    rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  return [
    (
      event.clientX
      - rect.left
    )
      * canvas.width
      / rect.width,

    (
      event.clientY
      - rect.top
    )
      * canvas.height
      / rect.height,
  ];
}


async function phaseNotesRenderCaptureCanvas() {
  const capture =
    phaseNotesCurrentCapture();

  const canvas =
    document.getElementById(
      "phaseNotesCaptureCanvas"
    );

  if (
    !capture
    || !canvas
  ) {
    return;
  }

  const image =
    await phaseReportLoadImage(
      capture.imageDataUrl
    );

  canvas.width =
    image.naturalWidth
    || image.width
    || capture.captureWidth
    || 768;

  canvas.height =
    image.naturalHeight
    || image.height
    || capture.captureHeight
    || 512;

  const context =
    canvas.getContext("2d");

  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height
  );

  for (
    const command
    of capture.markup || []
  ) {
    phaseReportDrawCommand(
      context,
      command
    );
  }

  if (phaseNotesCaptureDrawing) {
    phaseReportDrawCommand(
      context,
      phaseNotesCaptureDrawing
    );
  }
}


function phaseNotesCapturePointerDown(
  event
) {
  if (
    event.pointerType === "touch"
  ) {
    return;
  }

  if (
    event.pointerType === "mouse"
    && event.button !== 0
  ) {
    return;
  }

  const point =
    phaseNotesCaptureCanvasPoint(
      event
    );

  if (!point) return;

  event.preventDefault();

  try {
    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );
  } catch (_) {}

  phaseNotesCaptureDrawing =
    phaseNotesCaptureTool === "pen"
      ? {
          type: "pen",
          color: "#ff2d2d",
          width: 4,
          points: [point],
          pointerId:
            event.pointerId,
        }
      : {
          type:
            phaseNotesCaptureTool,
          color: "#ff2d2d",
          width: 4,
          x1: point[0],
          y1: point[1],
          x2: point[0],
          y2: point[1],
          pointerId:
            event.pointerId,
        };

  void phaseNotesRenderCaptureCanvas();
}


function phaseNotesCapturePointerMove(
  event
) {
  if (
    !phaseNotesCaptureDrawing
    || phaseNotesCaptureDrawing
      .pointerId
      !== event.pointerId
  ) {
    return;
  }

  const point =
    phaseNotesCaptureCanvasPoint(
      event
    );

  if (!point) return;

  event.preventDefault();

  if (
    phaseNotesCaptureDrawing.type
      === "pen"
  ) {
    const points =
      phaseNotesCaptureDrawing
        .points;

    const last =
      points[
        points.length - 1
      ];

    if (
      !last
      || Math.hypot(
        point[0] - last[0],
        point[1] - last[1]
      ) > 1
    ) {
      points.push(point);
    }

  } else {
    phaseNotesCaptureDrawing.x2 =
      point[0];

    phaseNotesCaptureDrawing.y2 =
      point[1];
  }

  void phaseNotesRenderCaptureCanvas();
}


function phaseNotesCapturePointerUp(
  event
) {
  if (
    !phaseNotesCaptureDrawing
    || phaseNotesCaptureDrawing
      .pointerId
      !== event.pointerId
  ) {
    return;
  }

  const capture =
    phaseNotesCurrentCapture();

  if (!capture) return;

  event.preventDefault();

  const command = {
    ...phaseNotesCaptureDrawing,
  };

  delete command.pointerId;

  phaseNotesCaptureDrawing =
    null;

  const keep =
    command.type === "pen"
      ? command.points?.length > 0
      : Math.hypot(
          command.x2 - command.x1,
          command.y2 - command.y1
        ) >= 4;

  if (keep) {
    capture.markup.push(command);

    capture.updatedAt =
      new Date().toISOString();

    phaseNotesScheduleSave(
      150
    );
  }

  void phaseNotesRenderCaptureCanvas();
}


function phaseNotesCaptureUndo() {
  const capture =
    phaseNotesCurrentCapture();

  if (
    !capture?.markup?.length
  ) {
    return;
  }

  capture.markup.pop();

  phaseNotesScheduleSave(
    100
  );

  void phaseNotesRenderCaptureCanvas();
}


function phaseNotesCaptureClear() {
  const capture =
    phaseNotesCurrentCapture();

  if (!capture) return;

  if (
    !window.confirm(
      "Clear all markup from this capture?"
    )
  ) {
    return;
  }

  capture.markup = [];

  phaseNotesScheduleSave(
    100
  );

  void phaseNotesRenderCaptureCanvas();
}


function phaseNotesCaptionChanged() {
  const capture =
    phaseNotesCurrentCapture();

  if (!capture) return;

  capture.note =
    document.getElementById(
      "phaseNotesCaptureCaption"
    ).value;

  capture.updatedAt =
    new Date().toISOString();

  const state =
    document.getElementById(
      "phaseNotesCaptureSaveState"
    );

  if (state) {
    state.textContent =
      "Saving…";
  }

  phaseNotesScheduleSave();
}


async function phaseNotesOpenCapture(id) {
  phaseNotesCaptureId = id;

  const capture =
    phaseNotesCurrentCapture();

  if (!capture) return;

  phaseNotesTopicOverlay().hidden =
    true;

  phaseNotesCaptureOverlay().hidden =
    false;

  document.getElementById(
    "phaseNotesCaptureOrigin"
  ).textContent =
    `${capture.imageName}`
    + ` · ${capture.annotationFile}`
    + ` · x=${Math.round(capture.region?.x || 0)}`
    + `, y=${Math.round(capture.region?.y || 0)}`
    + ` · ${Math.round(capture.region?.width || 0)} × `
    + `${Math.round(capture.region?.height || 0)} px`;

  document.getElementById(
    "phaseNotesCaptureCaption"
  ).value =
    capture.note || "";

  document.getElementById(
    "phaseNotesCaptureSaveState"
  ).textContent =
    "Saved automatically";

  phaseNotesSetCaptureTool(
    "pen"
  );

  phaseNotesCaptureDrawing =
    null;

  await phaseNotesRenderCaptureCanvas();
}


async function phaseNotesCloseCapture() {
  clearTimeout(
    phaseNotesSaveTimer
  );

  const topic =
    phaseNotesCurrentTopic();

  if (topic) {
    await phaseNotesSaveTopic(
      topic
    );
  }

  phaseNotesCaptureId = null;
  phaseNotesCaptureDrawing = null;

  phaseNotesCaptureOverlay().hidden =
    true;

  phaseNotesTopicOverlay().hidden =
    false;

  phaseNotesRenderCaptures();
}


async function phaseNotesDeleteCapture() {
  const topic =
    phaseNotesCurrentTopic();

  const capture =
    phaseNotesCurrentCapture();

  if (
    !topic
    || !capture
  ) {
    return;
  }

  if (
    !window.confirm(
      "Delete this visual example?"
    )
  ) {
    return;
  }

  topic.captures =
    topic.captures.filter(
      (candidate) =>
        String(candidate.id)
        !== String(capture.id)
    );

  await phaseNotesSaveTopic(
    topic
  );

  await phaseNotesCloseCapture();
}


function phaseNotesRenderCaptures() {
  const topic =
    phaseNotesCurrentTopic();

  const container =
    document.getElementById(
      "phaseNotesCaptureList"
    );

  if (
    !topic
    || !container
  ) {
    return;
  }

  container.innerHTML = "";

  if (!topic.captures.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "phase-notes-empty";

    empty.textContent =
      "No visual examples yet. Add a crop from the current image.";

    container.append(empty);
    return;
  }

  for (
    const capture
    of topic.captures
  ) {
    const card =
      document.createElement(
        "article"
      );

    card.className =
      "phase-notes-capture-card";

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.className =
      "phase-notes-capture-preview";

    void phaseReportRenderEntryCanvas(
      capture,
      canvas
    );

    const info =
      document.createElement(
        "div"
      );

    info.className =
      "phase-notes-capture-info";

    const source =
      document.createElement(
        "strong"
      );

    source.textContent =
      capture.imageName
      || capture.imageId
      || "Image";

    const meta =
      document.createElement(
        "span"
      );

    meta.textContent =
      `${capture.annotationFile}`
      + ` · x=${Math.round(capture.region?.x || 0)}`
      + `, y=${Math.round(capture.region?.y || 0)}`
      + ` · ${Math.round(capture.region?.width || 0)} × `
      + `${Math.round(capture.region?.height || 0)} px`;

    const note =
      document.createElement(
        "span"
      );

    note.textContent =
      capture.note
      || "No caption yet.";

    const edit =
      document.createElement(
        "button"
      );

    edit.type = "button";
    edit.textContent = "Edit";

    edit.addEventListener(
      "click",
      () => {
        void phaseNotesOpenCapture(
          capture.id
        );
      }
    );

    info.append(
      source,
      meta,
      note,
      edit
    );

    card.append(
      canvas,
      info
    );

    container.append(card);
  }
}


// ------------------------------------------------------------------------
// Notes export / share.
// ------------------------------------------------------------------------

function phaseNotesRtfPng(
  dataUrl,
  width,
  height,
  goalWidth = 9000
) {
  const hex =
    phaseReportDataUrlToHex(
      dataUrl
    );

  const goalHeight =
    Math.max(
      100,
      Math.round(
        goalWidth
        * height
        / width
      )
    );

  return (
    "{\\pict\\pngblip"
    + `\\picw${width}`
    + `\\pich${height}`
    + `\\picwgoal${goalWidth}`
    + `\\pichgoal${goalHeight} `
    + hex
    + "}\\par"
  );
}


async function phaseNotesBuildArtifact() {
  const topic =
    phaseNotesCurrentTopic();

  if (!topic) {
    throw new Error(
      "No Notes topic is open"
    );
  }

  const parts = [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0 Arial;}}",
    "\\paperw11907\\paperh16840",
    "\\margl1134\\margr1134\\margt1134\\margb1134",
    `\\fs32\\b ${phaseReportRtfEscape(topic.title || "HistoAnnotator Notes")}\\b0\\fs22\\par`,
    "\\par",
  ];

  const typed =
    String(
      topic.typedNote || ""
    ).trim();

  if (typed) {
    parts.push(
      phaseReportRtfEscape(
        typed
      )
      + "\\par\\par"
    );
  }

  const handwriting =
    phaseNotesHandwritingDataUrl();

  if (handwriting) {
    const canvas =
      document.getElementById(
        "phaseNotesHandCanvas"
      );

    parts.push(
      "\\fs24\\b Handwritten note\\b0\\fs22\\par"
    );

    parts.push(
      phaseNotesRtfPng(
        handwriting,
        canvas.width,
        canvas.height
      )
    );

    parts.push("\\par");
  }

  for (
    let index = 0;
    index < topic.captures.length;
    index += 1
  ) {
    const capture =
      topic.captures[index];

    const rendered =
      await phaseReportEntryRenderedDataUrl(
        capture
      );

    parts.push(
      `\\fs26\\b Example ${index + 1}\\b0\\fs22\\par`
    );

    parts.push(
      `\\b Source image:\\b0 ${phaseReportRtfEscape(capture.imageName)}\\par`
    );

    parts.push(
      `\\b Annotation file:\\b0 ${phaseReportRtfEscape(capture.annotationFile)}\\par`
    );

    parts.push(
      `\\i Crop: x=${Math.round(capture.region?.x || 0)}, `
      + `y=${Math.round(capture.region?.y || 0)}, `
      + `${Math.round(capture.region?.width || 0)} x `
      + `${Math.round(capture.region?.height || 0)} px\\i0\\par`
    );

    parts.push(
      phaseNotesRtfPng(
        rendered.dataUrl,
        rendered.width,
        rendered.height
      )
    );

    const caption =
      String(
        capture.note || ""
      ).trim();

    if (caption) {
      parts.push(
        "\\b Note:\\b0 "
        + phaseReportRtfEscape(
          caption
        )
        + "\\par"
      );
    }

    parts.push("\\par");
  }

  parts.push("}");

  return {
    blob:
      new Blob(
        [parts.join("\n")],
        { type: "application/rtf" }
      ),

    filename:
      phaseReportSafeFilename(
        `${topic.title || "HistoAnnotator_Notes"}_notes`
      )
      + ".rtf",

    title:
      topic.title
      || "HistoAnnotator Notes",
  };
}


async function phaseNotesExport(
  share
) {
  try {
    const artifact =
      await phaseNotesBuildArtifact();

    if (share) {
      const result =
        await phaseNativeShareFile(
          artifact.blob,
          artifact.filename,
          artifact.title
        );

      if (result === "downloaded") {
        setStatus(
          "Native share unavailable; Notes downloaded",
          "saved"
        );
      }

      return;
    }

    const url =
      URL.createObjectURL(
        artifact.blob
      );

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      artifact.filename;

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(url),
      1000
    );

  } catch (error) {
    console.error(
      "Notes export failed",
      error
    );

    setStatus(
      `Could not export Notes: ${error.message}`,
      "error"
    );
  }
}


// ------------------------------------------------------------------------
// Initialization.
// ------------------------------------------------------------------------

function phaseNotesInitialize() {
  phaseNotesEnsureUi();
  phaseInstallReportShareButton();

  document.getElementById(
    "phaseAdditionalNotesButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesOpen()
  );

  document.getElementById(
    "phaseNotesCloseButton"
  )?.addEventListener(
    "click",
    phaseNotesClose
  );

  document.getElementById(
    "phaseNotesNewTopicButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesCreateTopic()
  );

  document.getElementById(
    "phaseNotesBackButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesBack()
  );

  document.getElementById(
    "phaseNotesTopicTitle"
  )?.addEventListener(
    "input",
    phaseNotesTypedChanged
  );

  document.getElementById(
    "phaseNotesTypedText"
  )?.addEventListener(
    "input",
    phaseNotesTypedChanged
  );

  for (
    const button
    of document.querySelectorAll(
      "[data-notes-note-mode]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        phaseNotesSetNoteMode(
          button.dataset.notesNoteMode
        );
      }
    );
  }

  for (
    const button
    of document.querySelectorAll(
      "[data-notes-hand-tool]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        phaseNotesSetHandTool(
          button.dataset.notesHandTool
        );
      }
    );
  }

  const handCanvas =
    document.getElementById(
      "phaseNotesHandCanvas"
    );

  handCanvas?.addEventListener(
    "pointerdown",
    phaseNotesHandPointerDown
  );

  handCanvas?.addEventListener(
    "pointermove",
    phaseNotesHandPointerMove
  );

  handCanvas?.addEventListener(
    "pointerup",
    phaseNotesHandPointerUp
  );

  handCanvas?.addEventListener(
    "pointercancel",
    phaseNotesHandPointerUp
  );

  document.getElementById(
    "phaseNotesHandUndoButton"
  )?.addEventListener(
    "click",
    phaseNotesHandUndo
  );

  document.getElementById(
    "phaseNotesHandClearButton"
  )?.addEventListener(
    "click",
    phaseNotesHandClear
  );

  document.getElementById(
    "phaseNotesAddCaptureButton"
  )?.addEventListener(
    "click",
    phaseNotesStartCapture
  );

  document.getElementById(
    "phaseNotesDownloadButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesExport(false)
  );

  document.getElementById(
    "phaseNotesShareButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesExport(true)
  );

  document.getElementById(
    "phaseNotesDeleteTopicButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesDeleteTopic()
  );

  document.getElementById(
    "phaseNotesCaptureDoneButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesCloseCapture()
  );

  document.getElementById(
    "phaseNotesCaptureCaption"
  )?.addEventListener(
    "input",
    phaseNotesCaptionChanged
  );

  for (
    const button
    of document.querySelectorAll(
      "[data-notes-capture-tool]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        phaseNotesSetCaptureTool(
          button.dataset.notesCaptureTool
        );
      }
    );
  }

  const captureCanvas =
    document.getElementById(
      "phaseNotesCaptureCanvas"
    );

  captureCanvas?.addEventListener(
    "pointerdown",
    phaseNotesCapturePointerDown
  );

  captureCanvas?.addEventListener(
    "pointermove",
    phaseNotesCapturePointerMove
  );

  captureCanvas?.addEventListener(
    "pointerup",
    phaseNotesCapturePointerUp
  );

  captureCanvas?.addEventListener(
    "pointercancel",
    phaseNotesCapturePointerUp
  );

  document.getElementById(
    "phaseNotesCaptureUndoButton"
  )?.addEventListener(
    "click",
    phaseNotesCaptureUndo
  );

  document.getElementById(
    "phaseNotesCaptureClearButton"
  )?.addEventListener(
    "click",
    phaseNotesCaptureClear
  );

  document.getElementById(
    "phaseNotesDeleteCaptureButton"
  )?.addEventListener(
    "click",
    () => void phaseNotesDeleteCapture()
  );
}


phaseNotesInitialize();
