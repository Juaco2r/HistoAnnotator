// ========================================================================
// Report Builder v1
//
// Report markup is intentionally NOT annotation geometry. It is stored in a
// dedicated local IndexedDB database keyed by Image + Annotation File.
// Scientific annotation GeoJSON remains unchanged.
// ========================================================================

const PHASE_REPORT_DB_NAME =
  "histoannotator-reports-v1";

const PHASE_REPORT_DB_VERSION =
  1;

const PHASE_REPORT_STORE =
  "reports";

let phaseReportDbPromise =
  null;

let phaseReportCurrent =
  null;

let phaseReportCapture =
  null;

let phaseReportEditorEntryId =
  null;

let phaseReportEditorTool =
  "pen";

let phaseReportEditorDrawing =
  null;

let phaseReportAutosaveTimer =
  null;


function phaseReportDocumentKey() {
  if (!currentImage?.id) {
    return null;
  }

  return (
    `${String(currentImage.id)}::`
    + `${String(currentAnnotationFile || "Default")}`
  );
}


function phaseReportEmptyDocument() {
  return {
    schemaVersion: 1,
    key:
      phaseReportDocumentKey(),
    imageId:
      String(currentImage?.id || ""),
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
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
    entries: [],
  };
}


function phaseReportOpenDb() {
  if (phaseReportDbPromise) {
    return phaseReportDbPromise;
  }

  phaseReportDbPromise =
    new Promise(
      (resolve, reject) => {
        const request =
          indexedDB.open(
            PHASE_REPORT_DB_NAME,
            PHASE_REPORT_DB_VERSION
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            if (
              !db.objectStoreNames
                .contains(
                  PHASE_REPORT_STORE
                )
            ) {
              db.createObjectStore(
                PHASE_REPORT_STORE,
                {
                  keyPath: "key",
                }
              );
            }
          };

        request.onsuccess =
          () => {
            resolve(
              request.result
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
              || new Error(
                "Could not open report database"
              )
            );
          };
      }
    );

  return phaseReportDbPromise;
}


async function phaseReportLoadDocument() {
  const key =
    phaseReportDocumentKey();

  if (!key) {
    phaseReportCurrent =
      null;
    return null;
  }

  try {
    const db =
      await phaseReportOpenDb();

    const record =
      await new Promise(
        (resolve, reject) => {
          const transaction =
            db.transaction(
              PHASE_REPORT_STORE,
              "readonly"
            );

          const request =
            transaction
              .objectStore(
                PHASE_REPORT_STORE
              )
              .get(key);

          request.onsuccess =
            () =>
              resolve(
                request.result
                || null
              );

          request.onerror =
            () =>
              reject(
                request.error
              );
        }
      );

    phaseReportCurrent =
      (
        record
        && Array.isArray(
          record.entries
        )
      )
        ? record
        : phaseReportEmptyDocument();

    return phaseReportCurrent;

  } catch (error) {
    console.warn(
      "Could not load report document",
      error
    );

    phaseReportCurrent =
      phaseReportEmptyDocument();

    return phaseReportCurrent;
  }
}


async function phaseReportSaveDocument() {
  if (
    !phaseReportCurrent
    || !phaseReportCurrent.key
  ) {
    return false;
  }

  phaseReportCurrent.updatedAt =
    new Date().toISOString();

  try {
    const db =
      await phaseReportOpenDb();

    await new Promise(
      (resolve, reject) => {
        const transaction =
          db.transaction(
            PHASE_REPORT_STORE,
            "readwrite"
          );

        const request =
          transaction
            .objectStore(
              PHASE_REPORT_STORE
            )
            .put(
              phaseReportCurrent
            );

        request.onsuccess =
          () => resolve();

        request.onerror =
          () =>
            reject(
              request.error
            );
      }
    );

    phaseReportSetSaveState(
      "Saved automatically",
      "saved"
    );

    return true;

  } catch (error) {
    console.error(
      "Could not save report document",
      error
    );

    phaseReportSetSaveState(
      "Could not save",
      "error"
    );

    return false;
  }
}


function phaseReportScheduleSave(
  delay = 500
) {
  clearTimeout(
    phaseReportAutosaveTimer
  );

  phaseReportSetSaveState(
    "Saving…",
    "local"
  );

  phaseReportAutosaveTimer =
    setTimeout(
      () => {
        phaseReportAutosaveTimer =
          null;

        void phaseReportSaveDocument();
      },
      delay
    );
}


function phaseReportSetSaveState(
  text,
  state = ""
) {
  const element =
    document.getElementById(
      "phaseReportSaveState"
    );

  if (!element) {
    return;
  }

  element.textContent =
    text || "";

  element.dataset.state =
    state;
}


function phaseReportEnsureUi() {
  if (
    document.getElementById(
      "phaseReportBuilderOverlay"
    )
  ) {
    return;
  }

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.innerHTML = `
    <div id="phaseReportBuilderOverlay"
         class="modal-overlay phase-report-overlay"
         hidden>
      <section class="modal-card phase-report-card"
               role="dialog"
               aria-modal="true"
               aria-labelledby="phaseReportBuilderTitle">
        <div class="phase-report-header">
          <div>
            <h2 id="phaseReportBuilderTitle">Report Builder</h2>
            <div id="phaseReportContext"
                 class="phase-report-context"></div>
          </div>

          <div class="phase-report-header-actions">
            <button id="phaseReportCaptureButton"
                    type="button">
              + Capture region
            </button>
            <button id="phaseReportExportButton"
                    type="button">
              Export Word / RTF
            </button>
            <button id="phaseReportCloseButton"
                    type="button">
              Close
            </button>
          </div>
        </div>

        <div id="phaseReportEntries"
             class="phase-report-entries"></div>

        <div class="phase-report-footer">
          <span id="phaseReportSaveState"></span>
        </div>
      </section>
    </div>

    <div id="phaseReportEditorOverlay"
         class="modal-overlay phase-report-overlay"
         hidden>
      <section class="modal-card phase-report-editor-card"
               role="dialog"
               aria-modal="true"
               aria-labelledby="phaseReportEditorTitle">
        <div class="phase-report-header">
          <div>
            <h2 id="phaseReportEditorTitle">
              Report finding
            </h2>
            <div id="phaseReportEditorMeta"
                 class="phase-report-context"></div>
          </div>

          <button id="phaseReportEditorBackButton"
                  type="button">
            Done
          </button>
        </div>

        <div class="phase-report-editor-layout">
          <div class="phase-report-image-column">
            <div class="phase-report-drawing-toolbar">
              <button type="button"
                      data-report-tool="pen"
                      class="active">
                Pen
              </button>
              <button type="button"
                      data-report-tool="arrow">
                Arrow
              </button>
              <button type="button"
                      data-report-tool="rectangle">
                Rectangle
              </button>
              <button id="phaseReportUndoButton"
                      type="button">
                Undo
              </button>
              <button id="phaseReportClearButton"
                      type="button">
                Clear drawing
              </button>
            </div>

            <div class="phase-report-canvas-wrap">
              <canvas id="phaseReportEditorCanvas"></canvas>
            </div>
          </div>

          <div class="phase-report-note-column">
            <label for="phaseReportNote">
              Note
            </label>
            <textarea id="phaseReportNote"
                      rows="12"
                      placeholder="Add a note for this finding…"></textarea>

            <div class="phase-report-entry-actions">
              <span id="phaseReportEditorSaveState"></span>
              <button id="phaseReportDeleteEntryButton"
                      type="button"
                      class="danger">
                Delete finding
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  while (wrapper.firstElementChild) {
    document.body.append(
      wrapper.firstElementChild
    );
  }
}


function phaseReportBuilderOverlay() {
  return document.getElementById(
    "phaseReportBuilderOverlay"
  );
}


function phaseReportEditorOverlay() {
  return document.getElementById(
    "phaseReportEditorOverlay"
  );
}


function phaseReportCurrentEntry() {
  if (
    !phaseReportCurrent
    || !phaseReportEditorEntryId
  ) {
    return null;
  }

  return (
    phaseReportCurrent.entries
      || []
  ).find(
    (entry) =>
      String(entry.id)
      === String(
        phaseReportEditorEntryId
      )
  ) || null;
}


function phaseReportUuid() {
  if (
    globalThis.crypto
      ?.randomUUID
  ) {
    return crypto.randomUUID();
  }

  return (
    `report-${Date.now()}-`
    + Math.random()
      .toString(16)
      .slice(2)
  );
}


function phaseReportCanvasDimensions(
  entry
) {
  const width =
    Math.max(
      1,
      Number(
        entry?.captureWidth
      )
      || Number(
        entry?.region
          ?.outputWidth
      )
      || 768
    );

  const height =
    Math.max(
      1,
      Number(
        entry?.captureHeight
      )
      || Number(
        entry?.region
          ?.outputHeight
      )
      || 512
    );

  return {
    width,
    height,
  };
}


function phaseReportLoadImage(
  dataUrl
) {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.onload =
        () => resolve(image);

      image.onerror =
        () =>
          reject(
            new Error(
              "Could not load captured image"
            )
          );

      image.src =
        dataUrl;
    }
  );
}


function phaseReportDrawArrow(
  context,
  command
) {
  const x1 =
    command.x1;

  const y1 =
    command.y1;

  const x2 =
    command.x2;

  const y2 =
    command.y2;

  context.beginPath();

  context.moveTo(
    x1,
    y1
  );

  context.lineTo(
    x2,
    y2
  );

  context.stroke();

  const angle =
    Math.atan2(
      y2 - y1,
      x2 - x1
    );

  const head =
    Math.max(
      10,
      Number(
        command.width
      ) * 4
    );

  context.beginPath();

  context.moveTo(
    x2,
    y2
  );

  context.lineTo(
    x2
      - head
        * Math.cos(
          angle - Math.PI / 6
        ),
    y2
      - head
        * Math.sin(
          angle - Math.PI / 6
        )
  );

  context.moveTo(
    x2,
    y2
  );

  context.lineTo(
    x2
      - head
        * Math.cos(
          angle + Math.PI / 6
        ),
    y2
      - head
        * Math.sin(
          angle + Math.PI / 6
        )
  );

  context.stroke();
}


function phaseReportDrawCommand(
  context,
  command
) {
  if (!command) {
    return;
  }

  context.save();

  context.strokeStyle =
    command.color
    || "#ff2d2d";

  context.fillStyle =
    command.color
    || "#ff2d2d";

  context.lineWidth =
    Math.max(
      1,
      Number(
        command.width
      ) || 4
    );

  context.lineCap =
    "round";

  context.lineJoin =
    "round";

  if (
    command.type === "pen"
    && Array.isArray(
      command.points
    )
  ) {
    const points =
      command.points;

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

    } else if (
      points.length > 1
    ) {
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

  } else if (
    command.type === "arrow"
  ) {
    phaseReportDrawArrow(
      context,
      command
    );

  } else if (
    command.type === "rectangle"
  ) {
    context.strokeRect(
      Math.min(
        command.x1,
        command.x2
      ),
      Math.min(
        command.y1,
        command.y2
      ),
      Math.abs(
        command.x2
          - command.x1
      ),
      Math.abs(
        command.y2
          - command.y1
      )
    );
  }

  context.restore();
}


async function phaseReportRenderEntryCanvas(
  entry,
  canvas
) {
  if (
    !entry
    || !canvas
    || !entry.imageDataUrl
  ) {
    return;
  }

  const image =
    await phaseReportLoadImage(
      entry.imageDataUrl
    );

  const dimensions =
    phaseReportCanvasDimensions(
      {
        ...entry,
        captureWidth:
          image.naturalWidth
          || image.width,
        captureHeight:
          image.naturalHeight
          || image.height,
      }
    );

  canvas.width =
    dimensions.width;

  canvas.height =
    dimensions.height;

  const context =
    canvas.getContext(
      "2d"
    );

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
    of (
      entry.markup
      || []
    )
  ) {
    phaseReportDrawCommand(
      context,
      command
    );
  }

  if (
    phaseReportEditorDrawing
    && String(entry.id)
      === String(
        phaseReportEditorEntryId
      )
  ) {
    phaseReportDrawCommand(
      context,
      phaseReportEditorDrawing
    );
  }
}


function phaseReportEditorCanvasPoint(
  event
) {
  const canvas =
    document.getElementById(
      "phaseReportEditorCanvas"
    );

  if (!canvas) {
    return null;
  }

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
    ) * canvas.width
      / rect.width,
    (
      event.clientY
      - rect.top
    ) * canvas.height
      / rect.height,
  ];
}


function phaseReportSetEditorTool(
  tool
) {
  phaseReportEditorTool =
    tool;

  for (
    const button
    of document.querySelectorAll(
      "[data-report-tool]"
    )
  ) {
    button.classList.toggle(
      "active",
      button.dataset.reportTool
        === tool
    );
  }
}


async function phaseReportRedrawEditor() {
  const entry =
    phaseReportCurrentEntry();

  const canvas =
    document.getElementById(
      "phaseReportEditorCanvas"
    );

  if (
    !entry
    || !canvas
  ) {
    return;
  }

  try {
    await phaseReportRenderEntryCanvas(
      entry,
      canvas
    );
  } catch (error) {
    console.error(
      "Could not render report finding",
      error
    );
  }
}


function phaseReportEditorPointerDown(
  event
) {
  const entry =
    phaseReportCurrentEntry();

  if (!entry) {
    return;
  }

  if (
    event.pointerType === "mouse"
    && event.button !== 0
  ) {
    return;
  }

  if (
    event.pointerType === "touch"
  ) {
    return;
  }

  const point =
    phaseReportEditorCanvasPoint(
      event
    );

  if (!point) {
    return;
  }

  event.preventDefault();

  try {
    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );
  } catch (_) {}

  if (
    phaseReportEditorTool
      === "pen"
  ) {
    phaseReportEditorDrawing = {
      type: "pen",
      color: "#ff2d2d",
      width: 4,
      points: [point],
      pointerId:
        event.pointerId,
    };

  } else {
    phaseReportEditorDrawing = {
      type:
        phaseReportEditorTool,
      color: "#ff2d2d",
      width: 4,
      x1: point[0],
      y1: point[1],
      x2: point[0],
      y2: point[1],
      pointerId:
        event.pointerId,
    };
  }

  void phaseReportRedrawEditor();
}


function phaseReportEditorPointerMove(
  event
) {
  if (
    !phaseReportEditorDrawing
    || event.pointerId
      !== phaseReportEditorDrawing
        .pointerId
  ) {
    return;
  }

  const point =
    phaseReportEditorCanvasPoint(
      event
    );

  if (!point) {
    return;
  }

  event.preventDefault();

  if (
    phaseReportEditorDrawing.type
      === "pen"
  ) {
    const last =
      phaseReportEditorDrawing
        .points[
          phaseReportEditorDrawing
            .points.length - 1
        ];

    if (
      !last
      || Math.hypot(
        point[0] - last[0],
        point[1] - last[1]
      ) > 1
    ) {
      phaseReportEditorDrawing
        .points.push(
          point
        );
    }

  } else {
    phaseReportEditorDrawing.x2 =
      point[0];

    phaseReportEditorDrawing.y2 =
      point[1];
  }

  void phaseReportRedrawEditor();
}


function phaseReportEditorPointerUp(
  event
) {
  if (
    !phaseReportEditorDrawing
    || event.pointerId
      !== phaseReportEditorDrawing
        .pointerId
  ) {
    return;
  }

  event.preventDefault();

  const entry =
    phaseReportCurrentEntry();

  if (!entry) {
    phaseReportEditorDrawing =
      null;
    return;
  }

  const command = {
    ...phaseReportEditorDrawing,
  };

  delete command.pointerId;

  let keep =
    true;

  if (
    command.type === "pen"
  ) {
    keep =
      Array.isArray(
        command.points
      )
      && command.points.length >= 1;

  } else {
    keep =
      Math.hypot(
        command.x2
          - command.x1,
        command.y2
          - command.y1
      ) >= 4;
  }

  phaseReportEditorDrawing =
    null;

  if (keep) {
    if (
      !Array.isArray(
        entry.markup
      )
    ) {
      entry.markup = [];
    }

    entry.markup.push(
      command
    );

    entry.updatedAt =
      new Date().toISOString();

    phaseReportScheduleSave(
      150
    );
  }

  void phaseReportRedrawEditor();
}


function phaseReportEditorUndo() {
  const entry =
    phaseReportCurrentEntry();

  if (
    !entry
    || !Array.isArray(
      entry.markup
    )
    || !entry.markup.length
  ) {
    return;
  }

  entry.markup.pop();

  phaseReportScheduleSave(
    100
  );

  void phaseReportRedrawEditor();
}


function phaseReportEditorClear() {
  const entry =
    phaseReportCurrentEntry();

  if (!entry) {
    return;
  }

  if (
    !window.confirm(
      "Clear all report drawing from this finding?"
    )
  ) {
    return;
  }

  entry.markup = [];

  phaseReportScheduleSave(
    100
  );

  void phaseReportRedrawEditor();
}


function phaseReportEditorNoteChanged() {
  const entry =
    phaseReportCurrentEntry();

  const textarea =
    document.getElementById(
      "phaseReportNote"
    );

  if (
    !entry
    || !textarea
  ) {
    return;
  }

  entry.note =
    textarea.value;

  entry.updatedAt =
    new Date().toISOString();

  const state =
    document.getElementById(
      "phaseReportEditorSaveState"
    );

  if (state) {
    state.textContent =
      "Saving…";
  }

  clearTimeout(
    phaseReportAutosaveTimer
  );

  phaseReportAutosaveTimer =
    setTimeout(
      async () => {
        phaseReportAutosaveTimer =
          null;

        const saved =
          await phaseReportSaveDocument();

        if (state) {
          state.textContent =
            saved
              ? "Saved automatically"
              : "Could not save";
        }
      },
      500
    );
}


async function phaseReportOpenEditor(
  entryId
) {
  phaseReportEnsureUi();

  const entry =
    (
      phaseReportCurrent
        ?.entries
      || []
    ).find(
      (candidate) =>
        String(candidate.id)
        === String(entryId)
    );

  if (!entry) {
    return;
  }

  phaseReportEditorEntryId =
    entry.id;

  phaseReportEditorDrawing =
    null;

  const main =
    phaseReportBuilderOverlay();

  const editor =
    phaseReportEditorOverlay();

  if (main) {
    main.hidden = true;
  }

  if (editor) {
    editor.hidden = false;
  }

  const note =
    document.getElementById(
      "phaseReportNote"
    );

  if (note) {
    note.value =
      entry.note || "";
  }

  const meta =
    document.getElementById(
      "phaseReportEditorMeta"
    );

  if (meta) {
    const region =
      entry.region || {};

    meta.textContent =
      (
        `x=${Math.round(region.x || 0)}, `
        + `y=${Math.round(region.y || 0)}, `
        + `${Math.round(region.width || 0)} × `
        + `${Math.round(region.height || 0)} px`
      );
  }

  phaseReportSetEditorTool(
    "pen"
  );

  await phaseReportRedrawEditor();
}


async function phaseReportCloseEditor() {
  clearTimeout(
    phaseReportAutosaveTimer
  );

  if (phaseReportCurrent) {
    await phaseReportSaveDocument();
  }

  phaseReportEditorEntryId =
    null;

  phaseReportEditorDrawing =
    null;

  const editor =
    phaseReportEditorOverlay();

  if (editor) {
    editor.hidden = true;
  }

  const main =
    phaseReportBuilderOverlay();

  if (main) {
    main.hidden = false;
  }

  phaseReportRenderEntries();
}


async function phaseReportDeleteCurrentEntry() {
  const entry =
    phaseReportCurrentEntry();

  if (
    !entry
    || !phaseReportCurrent
  ) {
    return;
  }

  if (
    !window.confirm(
      "Delete this report finding?"
    )
  ) {
    return;
  }

  phaseReportCurrent.entries =
    phaseReportCurrent.entries
      .filter(
        (candidate) =>
          String(candidate.id)
          !== String(entry.id)
      );

  await phaseReportSaveDocument();
  await phaseReportCloseEditor();
}


function phaseReportEntryPreviewCanvas(
  entry
) {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.className =
    "phase-report-entry-preview";

  void phaseReportRenderEntryCanvas(
    entry,
    canvas
  );

  return canvas;
}


function phaseReportRenderEntries() {
  const container =
    document.getElementById(
      "phaseReportEntries"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const entries =
    phaseReportCurrent
      ?.entries
    || [];

  if (!entries.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "phase-report-empty";

    empty.innerHTML = `
      <strong>No findings yet</strong>
      <span>
        Use Capture region, drag a rectangle on the image,
        then add drawing and notes.
      </span>
    `;

    container.append(
      empty
    );

    return;
  }

  entries.forEach(
    (entry, index) => {
      const card =
        document.createElement(
          "article"
        );

      card.className =
        "phase-report-entry";

      const number =
        document.createElement(
          "div"
        );

      number.className =
        "phase-report-entry-number";

      number.textContent =
        String(index + 1)
          .padStart(2, "0");

      const preview =
        phaseReportEntryPreviewCanvas(
          entry
        );

      const content =
        document.createElement(
          "div"
        );

      content.className =
        "phase-report-entry-content";

      const note =
        document.createElement(
          "div"
        );

      note.className =
        "phase-report-entry-note";

      note.textContent =
        (
          entry.note
          || "No note yet."
        );

      const coordinates =
        document.createElement(
          "div"
        );

      coordinates.className =
        "phase-report-entry-coordinates";

      coordinates.textContent =
        (
          `x=${Math.round(entry.region?.x || 0)}, `
          + `y=${Math.round(entry.region?.y || 0)} · `
          + `${Math.round(entry.region?.width || 0)} × `
          + `${Math.round(entry.region?.height || 0)} px`
        );

      const edit =
        document.createElement(
          "button"
        );

      edit.type =
        "button";

      edit.textContent =
        "Edit finding";

      edit.addEventListener(
        "click",
        () => {
          void phaseReportOpenEditor(
            entry.id
          );
        }
      );

      content.append(
        note,
        coordinates,
        edit
      );

      card.append(
        number,
        preview,
        content
      );

      container.append(
        card
      );
    }
  );
}


async function phaseReportOpen() {
  if (!currentImage?.id) {
    setStatus(
      "Open an image before creating a report",
      "error"
    );
    return;
  }

  phaseReportEnsureUi();

  try {
    phaseAdditionalToolsClose?.();
  } catch (_) {}

  await phaseReportLoadDocument();

  const context =
    document.getElementById(
      "phaseReportContext"
    );

  if (context) {
    context.textContent =
      (
        `${phaseReportCurrent.imageName}`
        + ` · ${phaseReportCurrent.annotationFile}`
      );
  }

  phaseReportRenderEntries();

  const overlay =
    phaseReportBuilderOverlay();

  if (overlay) {
    overlay.hidden = false;
  }

  phaseReportSetSaveState(
    "Saved automatically",
    "saved"
  );
}


function phaseReportClose() {
  const overlay =
    phaseReportBuilderOverlay();

  if (overlay) {
    overlay.hidden = true;
  }
}


function phaseReportCaptureStart() {
  if (!currentImage?.id) {
    return;
  }

  phaseReportClose();

  phaseReportCapture = {
    active: true,
    pointerId: null,
    start: null,
    end: null,
  };

  setStatus(
    "Report capture: drag a rectangle over the region to include",
    "local"
  );

  drawAnnotations();
}


function phaseReportCaptureCancel() {
  phaseReportCapture =
    null;

  drawAnnotations();

  setStatus(
    "Report capture cancelled",
    "local"
  );

  void phaseReportOpen();
}


function phaseReportCaptureRegion() {
  if (
    !phaseReportCapture
    || !phaseReportCapture.start
    || !phaseReportCapture.end
  ) {
    return null;
  }

  const x1 =
    Math.min(
      phaseReportCapture.start[0],
      phaseReportCapture.end[0]
    );

  const y1 =
    Math.min(
      phaseReportCapture.start[1],
      phaseReportCapture.end[1]
    );

  const x2 =
    Math.max(
      phaseReportCapture.start[0],
      phaseReportCapture.end[0]
    );

  const y2 =
    Math.max(
      phaseReportCapture.start[1],
      phaseReportCapture.end[1]
    );

  const x =
    Math.max(
      0,
      Math.floor(x1)
    );

  const y =
    Math.max(
      0,
      Math.floor(y1)
    );

  const imageWidth =
    Math.max(
      1,
      Number(
        currentInfo?.width
      ) || x2
    );

  const imageHeight =
    Math.max(
      1,
      Number(
        currentInfo?.height
      ) || y2
    );

  const right =
    Math.min(
      imageWidth,
      Math.ceil(x2)
    );

  const bottom =
    Math.min(
      imageHeight,
      Math.ceil(y2)
    );

  return {
    x,
    y,
    width:
      Math.max(
        1,
        right - x
      ),
    height:
      Math.max(
        1,
        bottom - y
      ),
  };
}


function phaseReportBlobToDataUrl(
  blob
) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload =
        () =>
          resolve(
            String(
              reader.result
              || ""
            )
          );

      reader.onerror =
        () =>
          reject(
            reader.error
          );

      reader.readAsDataURL(
        blob
      );
    }
  );
}


async function phaseReportFetchRegion(
  region
) {
  const params =
    new URLSearchParams(
      displayQueryString()
    );

  params.set(
    "x",
    String(region.x)
  );

  params.set(
    "y",
    String(region.y)
  );

  params.set(
    "width",
    String(region.width)
  );

  params.set(
    "height",
    String(region.height)
  );

  params.set(
    "max_size",
    "1200"
  );

  const response =
    await apiFetch(
      `${API}/api/images/${encodeURIComponent(currentImage.id)}/region.png?${params.toString()}`,
      {
        timeoutMs: 30000,
      }
    );

  const blob =
    await response.blob();

  const dataUrl =
    await phaseReportBlobToDataUrl(
      blob
    );

  return {
    dataUrl,
    outputWidth:
      Number(
        response.headers.get(
          "X-Output-Width"
        )
      ) || null,
    outputHeight:
      Number(
        response.headers.get(
          "X-Output-Height"
        )
      ) || null,
    source:
      "region-api",
  };
}


async function phaseReportCaptureFromViewer(
  region
) {
  const sourceCanvas =
    viewer?.container
      ?.querySelector?.(
        "canvas"
      );

  if (!sourceCanvas) {
    throw new Error(
      "Viewer canvas is unavailable"
    );
  }

  const topLeft =
    screenPointFromImage(
      [
        region.x,
        region.y,
      ]
    );

  const bottomRight =
    screenPointFromImage(
      [
        region.x
          + region.width,
        region.y
          + region.height,
      ]
    );

  if (
    !topLeft
    || !bottomRight
  ) {
    throw new Error(
      "Could not map report region to viewer"
    );
  }

  const rect =
    sourceCanvas
      .getBoundingClientRect();

  const scaleX =
    sourceCanvas.width
      / rect.width;

  const scaleY =
    sourceCanvas.height
      / rect.height;

  const sourceX =
    Math.max(
      0,
      Math.round(
        Math.min(
          topLeft.x,
          bottomRight.x
        ) * scaleX
      )
    );

  const sourceY =
    Math.max(
      0,
      Math.round(
        Math.min(
          topLeft.y,
          bottomRight.y
        ) * scaleY
      )
    );

  const sourceWidth =
    Math.max(
      1,
      Math.round(
        Math.abs(
          bottomRight.x
            - topLeft.x
        ) * scaleX
      )
    );

  const sourceHeight =
    Math.max(
      1,
      Math.round(
        Math.abs(
          bottomRight.y
            - topLeft.y
        ) * scaleY
      )
    );

  const maxSide =
    1200;

  const scale =
    Math.min(
      1,
      maxSide
        / Math.max(
          sourceWidth,
          sourceHeight
        )
    );

  const outputWidth =
    Math.max(
      1,
      Math.round(
        sourceWidth
          * scale
      )
    );

  const outputHeight =
    Math.max(
      1,
      Math.round(
        sourceHeight
          * scale
      )
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    outputWidth;

  canvas.height =
    outputHeight;

  const context =
    canvas.getContext(
      "2d"
    );

  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return {
    dataUrl:
      canvas.toDataURL(
        "image/png"
      ),
    outputWidth,
    outputHeight,
    source:
      "viewer",
  };
}


async function phaseReportCreateEntryFromRegion(
  region
) {
  let captured;

  try {
    captured =
      await phaseReportFetchRegion(
        region
      );

  } catch (error) {
    console.warn(
      "Report region API unavailable; trying viewer snapshot",
      error
    );

    captured =
      await phaseReportCaptureFromViewer(
        region
      );
  }

  if (!phaseReportCurrent) {
    await phaseReportLoadDocument();
  }

  const entry = {
    id:
      phaseReportUuid(),
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
    region: {
      ...region,
      outputWidth:
        captured.outputWidth,
      outputHeight:
        captured.outputHeight,
    },
    captureSource:
      captured.source,
    captureWidth:
      captured.outputWidth,
    captureHeight:
      captured.outputHeight,
    imageDataUrl:
      captured.dataUrl,
    markup: [],
    note: "",
  };

  phaseReportCurrent.entries.push(
    entry
  );

  await phaseReportSaveDocument();

  await phaseReportOpenEditor(
    entry.id
  );
}


const phaseReportBaseDrawAnnotations =
  drawAnnotations;

drawAnnotations =
  function phaseReportDrawAnnotations(
    ...args
  ) {
    const result =
      phaseReportBaseDrawAnnotations(
        ...args
      );

    if (
      phaseReportCapture?.active
      && phaseReportCapture.start
      && phaseReportCapture.end
    ) {
      const a =
        screenPointFromImage(
          phaseReportCapture.start
        );

      const b =
        screenPointFromImage(
          phaseReportCapture.end
        );

      if (
        a
        && b
      ) {
        ctx.save();

        ctx.strokeStyle =
          "#ffffff";

        ctx.lineWidth =
          2;

        ctx.setLineDash(
          [8, 5]
        );

        ctx.fillStyle =
          "rgba(0, 0, 0, 0.08)";

        const x =
          Math.min(
            a.x,
            b.x
          );

        const y =
          Math.min(
            a.y,
            b.y
          );

        const width =
          Math.abs(
            b.x - a.x
          );

        const height =
          Math.abs(
            b.y - a.y
          );

        ctx.fillRect(
          x,
          y,
          width,
          height
        );

        ctx.strokeRect(
          x,
          y,
          width,
          height
        );

        ctx.restore();
      }
    }

    return result;
  };


const phaseReportBaseHandlePointerDown =
  handlePointerDown;

handlePointerDown =
  function phaseReportHandlePointerDown(
    event
  ) {
    if (
      !phaseReportCapture?.active
    ) {
      return phaseReportBaseHandlePointerDown(
        event
      );
    }

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
      imagePointFromViewerPosition(
        viewerPositionFromPointer(
          event
        )
      );

    if (
      !point
      || !phaseGPointInsideImage(
        point
      )
    ) {
      return;
    }

    stopPointerEvent(
      event
    );

    phaseReportCapture.pointerId =
      event.pointerId;

    phaseReportCapture.start =
      phaseGClampPointToImage(
        point
      );

    phaseReportCapture.end =
      phaseGClampPointToImage(
        point
      );

    try {
      viewer.container
        .setPointerCapture(
          event.pointerId
        );
    } catch (_) {}

    drawAnnotations();
  };


const phaseReportBaseHandlePointerMove =
  handlePointerMove;

handlePointerMove =
  function phaseReportHandlePointerMove(
    event
  ) {
    if (
      !phaseReportCapture?.active
      || phaseReportCapture.pointerId
        !== event.pointerId
    ) {
      return phaseReportBaseHandlePointerMove(
        event
      );
    }

    const point =
      imagePointFromViewerPosition(
        viewerPositionFromPointer(
          event
        )
      );

    if (!point) {
      return;
    }

    stopPointerEvent(
      event
    );

    phaseReportCapture.end =
      phaseGClampPointToImage(
        point
      );

    if (
      typeof phaseF26ScheduleDraw
      === "function"
    ) {
      phaseF26ScheduleDraw();
    } else {
      drawAnnotations();
    }
  };


const phaseReportBaseHandlePointerUp =
  handlePointerUp;

handlePointerUp =
  function phaseReportHandlePointerUp(
    event
  ) {
    if (
      !phaseReportCapture?.active
      || phaseReportCapture.pointerId
        !== event.pointerId
    ) {
      return phaseReportBaseHandlePointerUp(
        event
      );
    }

    stopPointerEvent(
      event
    );

    const point =
      imagePointFromViewerPosition(
        viewerPositionFromPointer(
          event
        )
      );

    if (point) {
      phaseReportCapture.end =
        phaseGClampPointToImage(
          point
        );
    }

    const region =
      phaseReportCaptureRegion();

    try {
      viewer.container
        .releasePointerCapture(
          event.pointerId
        );
    } catch (_) {}

    phaseReportCapture =
      null;

    drawAnnotations();

    if (
      !region
      || region.width
        < screenToleranceToImage(8)
      || region.height
        < screenToleranceToImage(8)
    ) {
      setStatus(
        "Report capture is too small",
        "local"
      );

      void phaseReportOpen();

      return;
    }

    setStatus(
      "Creating report finding…",
      "local"
    );

    void phaseReportCreateEntryFromRegion(
      region
    ).catch(
      (error) => {
        console.error(
          "Report capture failed",
          error
        );

        setStatus(
          `Could not capture report region: ${error.message}`,
          "error"
        );

        void phaseReportOpen();
      }
    );
  };


const phaseReportBaseHandlePointerCancel =
  handlePointerCancel;

handlePointerCancel =
  function phaseReportHandlePointerCancel(
    event
  ) {
    if (
      !phaseReportCapture?.active
      || phaseReportCapture.pointerId
        !== event.pointerId
    ) {
      return phaseReportBaseHandlePointerCancel(
        event
      );
    }

    stopPointerEvent(
      event
    );

    phaseReportCaptureCancel();
  };


function phaseReportRtfEscape(
  value
) {
  let output = "";

  for (
    const character
    of String(value || "")
  ) {
    if (character === "\\") {
      output += "\\\\";
      continue;
    }

    if (character === "{") {
      output += "\\{";
      continue;
    }

    if (character === "}") {
      output += "\\}";
      continue;
    }

    if (character === "\n") {
      output += "\\par ";
      continue;
    }

    const code =
      character.charCodeAt(0);

    if (
      code >= 32
      && code <= 126
    ) {
      output +=
        character;

    } else {
      const signed =
        code > 32767
          ? code - 65536
          : code;

      output +=
        `\\u${signed}?`;
    }
  }

  return output;
}


function phaseReportDataUrlToHex(
  dataUrl
) {
  const base64 =
    String(dataUrl)
      .split(",")[1]
    || "";

  const binary =
    atob(base64);

  let hex = "";

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    hex +=
      binary.charCodeAt(index)
        .toString(16)
        .padStart(2, "0");
  }

  return hex;
}


async function phaseReportEntryRenderedDataUrl(
  entry
) {
  const canvas =
    document.createElement(
      "canvas"
    );

  await phaseReportRenderEntryCanvas(
    entry,
    canvas
  );

  return {
    dataUrl:
      canvas.toDataURL(
        "image/png"
      ),
    width:
      canvas.width,
    height:
      canvas.height,
  };
}


function phaseReportSafeFilename(
  value
) {
  const cleaned =
    String(value || "report")
      .replace(
        /[\\/:*?"<>|]+/g,
        "_"
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    cleaned
      .slice(0, 90)
    || "report"
  );
}


async function phaseReportExportRtf() {
  if (
    !phaseReportCurrent
    || !phaseReportCurrent.entries
      ?.length
  ) {
    setStatus(
      "The report has no findings to export",
      "error"
    );
    return;
  }

  setStatus(
    "Preparing Word-compatible report…",
    "local"
  );

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
    index
      < phaseReportCurrent.entries.length;
    index += 1
  ) {
    const entry =
      phaseReportCurrent.entries[index];

    const rendered =
      await phaseReportEntryRenderedDataUrl(
        entry
      );

    const hex =
      phaseReportDataUrlToHex(
        rendered.dataUrl
      );

    const goalWidth =
      9000;

    const goalHeight =
      Math.max(
        100,
        Math.round(
          goalWidth
          * rendered.height
          / rendered.width
        )
      );

    parts.push(
      `\\fs26\\b Finding ${index + 1}\\b0\\fs22\\par`
    );

    parts.push(
      (
        `\\i Region: x=${Math.round(entry.region?.x || 0)}, `
        + `y=${Math.round(entry.region?.y || 0)}, `
        + `${Math.round(entry.region?.width || 0)} x `
        + `${Math.round(entry.region?.height || 0)} px\\i0\\par`
      )
    );

    parts.push(
      (
        "{\\pict\\pngblip"
        + `\\picw${rendered.width}`
        + `\\pich${rendered.height}`
        + `\\picwgoal${goalWidth}`
        + `\\pichgoal${goalHeight} `
        + hex
        + "}\\par"
      )
    );

    const note =
      String(
        entry.note
        || ""
      ).trim();

    parts.push(
      note
        ? (
            "\\b Note:\\b0 "
            + phaseReportRtfEscape(
              note
            )
            + "\\par"
          )
        : "\\b Note:\\b0 —\\par"
    );

    parts.push(
      "\\par"
    );
  }

  parts.push("}");

  const blob =
    new Blob(
      [
        parts.join(
          "\n"
        ),
      ],
      {
        type:
          "application/rtf",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    (
      phaseReportSafeFilename(
        `${phaseReportCurrent.imageName}_${phaseReportCurrent.annotationFile}_report`
      )
      + ".rtf"
    );

  document.body.append(
    link
  );

  link.click();
  link.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );

  setStatus(
    "Report exported",
    "saved"
  );
}


function phaseReportInitialize() {
  phaseReportEnsureUi();

  document.getElementById(
    "phaseAdditionalReportBuilderButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseReportOpen();
    }
  );

  document.getElementById(
    "phaseReportCloseButton"
  )?.addEventListener(
    "click",
    phaseReportClose
  );

  document.getElementById(
    "phaseReportCaptureButton"
  )?.addEventListener(
    "click",
    phaseReportCaptureStart
  );

  document.getElementById(
    "phaseReportExportButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseReportExportRtf();
    }
  );

  document.getElementById(
    "phaseReportEditorBackButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseReportCloseEditor();
    }
  );

  document.getElementById(
    "phaseReportUndoButton"
  )?.addEventListener(
    "click",
    phaseReportEditorUndo
  );

  document.getElementById(
    "phaseReportClearButton"
  )?.addEventListener(
    "click",
    phaseReportEditorClear
  );

  document.getElementById(
    "phaseReportDeleteEntryButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseReportDeleteCurrentEntry();
    }
  );

  document.getElementById(
    "phaseReportNote"
  )?.addEventListener(
    "input",
    phaseReportEditorNoteChanged
  );

  for (
    const button
    of document.querySelectorAll(
      "[data-report-tool]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        phaseReportSetEditorTool(
          button.dataset.reportTool
        );
      }
    );
  }

  const canvas =
    document.getElementById(
      "phaseReportEditorCanvas"
    );

  canvas?.addEventListener(
    "pointerdown",
    phaseReportEditorPointerDown
  );

  canvas?.addEventListener(
    "pointermove",
    phaseReportEditorPointerMove
  );

  canvas?.addEventListener(
    "pointerup",
    phaseReportEditorPointerUp
  );

  canvas?.addEventListener(
    "pointercancel",
    phaseReportEditorPointerUp
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
        && phaseReportCapture?.active
      ) {
        phaseReportCaptureCancel();
      }
    }
  );
}


phaseReportInitialize();
