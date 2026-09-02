// ========================================================================
// Per-capture note modes v1
//
// Adds Typed + Handwritten notes to:
//   1) Report Builder findings
//   2) Notes visual examples
//
// Existing typed text remains in entry.note.
// Handwriting is stored separately as entry.noteHandwriting.
// Annotation GeoJSON is never modified.
// ========================================================================

const PHASE_CAPTURE_NOTE_CANVAS_WIDTH = 1200;
const PHASE_CAPTURE_NOTE_CANVAS_HEIGHT = 620;

const phaseCaptureNoteState = {
  report: {
    mode: "typed",
    tool: "pen",
    drawing: null,
  },
  notes: {
    mode: "typed",
    tool: "pen",
    drawing: null,
  },
};


function phaseCaptureNoteOwner(kind) {
  if (kind === "report") {
    return phaseReportCurrentEntry?.() || null;
  }

  if (kind === "notes") {
    return phaseNotesCurrentCapture?.() || null;
  }

  return null;
}


function phaseCaptureNoteEnsureData(owner) {
  if (!owner) {
    return null;
  }

  if (!Array.isArray(owner.noteHandwriting)) {
    owner.noteHandwriting = [];
  }

  return owner.noteHandwriting;
}


function phaseCaptureNoteScheduleSave(kind, delay = 350) {
  if (kind === "report") {
    phaseReportScheduleSave(delay);
    return;
  }

  if (kind === "notes") {
    phaseNotesScheduleSave(delay);
  }
}


function phaseCaptureNoteCanvas(kind) {
  return document.getElementById(
    kind === "report"
      ? "phaseReportNoteHandCanvas"
      : "phaseNotesCaptureHandCanvas"
  );
}


function phaseCaptureNoteTypedElement(kind) {
  return document.getElementById(
    kind === "report"
      ? "phaseReportNote"
      : "phaseNotesCaptureCaption"
  );
}


function phaseCaptureNoteHandPanel(kind) {
  return document.getElementById(
    kind === "report"
      ? "phaseReportNoteHandPanel"
      : "phaseNotesCaptureHandPanel"
  );
}


function phaseCaptureNoteModeBar(kind) {
  return document.getElementById(
    kind === "report"
      ? "phaseReportNoteModeBar"
      : "phaseNotesCaptureModeBar"
  );
}


function phaseCaptureNoteInstallUi(kind) {
  const textarea =
    phaseCaptureNoteTypedElement(kind);

  if (!textarea) {
    return false;
  }

  const existing =
    phaseCaptureNoteModeBar(kind);

  if (existing) {
    return true;
  }

  const parent =
    textarea.parentElement;

  if (!parent) {
    return false;
  }

  const prefix =
    kind === "report"
      ? "phaseReportNote"
      : "phaseNotesCapture";

  const bar =
    document.createElement("div");

  bar.id =
    `${prefix}ModeBar`;

  bar.className =
    "phase-capture-note-mode-bar";

  bar.innerHTML = `
    <button type="button"
            data-capture-note-mode="${kind}:typed"
            class="active">
      Typed
    </button>
    <button type="button"
            data-capture-note-mode="${kind}:handwritten">
      Handwritten
    </button>
  `;

  textarea.insertAdjacentElement(
    "beforebegin",
    bar
  );

  const handPanel =
    document.createElement("div");

  handPanel.id =
    `${prefix}HandPanel`;

  handPanel.className =
    "phase-capture-note-hand-panel";

  handPanel.hidden = true;

  handPanel.innerHTML = `
    <div class="phase-capture-note-hand-toolbar">
      <button type="button"
              data-capture-note-tool="${kind}:pen"
              class="active">
        Pen
      </button>
      <button type="button"
              data-capture-note-tool="${kind}:eraser">
        Eraser
      </button>
      <button type="button"
              data-capture-note-action="${kind}:undo">
        Undo
      </button>
      <button type="button"
              data-capture-note-action="${kind}:clear">
        Clear
      </button>
    </div>

    <div class="phase-capture-note-whiteboard">
      <canvas id="${prefix}HandCanvas"
              width="${PHASE_CAPTURE_NOTE_CANVAS_WIDTH}"
              height="${PHASE_CAPTURE_NOTE_CANVAS_HEIGHT}">
      </canvas>
    </div>
  `;

  textarea.insertAdjacentElement(
    "afterend",
    handPanel
  );

  for (
    const button
    of bar.querySelectorAll(
      "[data-capture-note-mode]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        const [, mode] =
          String(
            button.dataset.captureNoteMode
          ).split(":");

        phaseCaptureNoteSetMode(
          kind,
          mode
        );
      }
    );
  }

  for (
    const button
    of handPanel.querySelectorAll(
      "[data-capture-note-tool]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        const [, tool] =
          String(
            button.dataset.captureNoteTool
          ).split(":");

        phaseCaptureNoteSetTool(
          kind,
          tool
        );
      }
    );
  }

  for (
    const button
    of handPanel.querySelectorAll(
      "[data-capture-note-action]"
    )
  ) {
    button.addEventListener(
      "click",
      () => {
        const [, action] =
          String(
            button.dataset.captureNoteAction
          ).split(":");

        if (action === "undo") {
          phaseCaptureNoteUndo(kind);
        } else if (
          action === "clear"
        ) {
          phaseCaptureNoteClear(kind);
        }
      }
    );
  }

  const canvas =
    phaseCaptureNoteCanvas(kind);

  canvas?.addEventListener(
    "pointerdown",
    (event) =>
      phaseCaptureNotePointerDown(
        kind,
        event
      )
  );

  canvas?.addEventListener(
    "pointermove",
    (event) =>
      phaseCaptureNotePointerMove(
        kind,
        event
      )
  );

  canvas?.addEventListener(
    "pointerup",
    (event) =>
      phaseCaptureNotePointerUp(
        kind,
        event
      )
  );

  canvas?.addEventListener(
    "pointercancel",
    (event) =>
      phaseCaptureNotePointerUp(
        kind,
        event
      )
  );

  return true;
}


function phaseCaptureNoteSetMode(
  kind,
  mode
) {
  const state =
    phaseCaptureNoteState[kind];

  if (!state) {
    return;
  }

  state.mode =
    mode === "handwritten"
      ? "handwritten"
      : "typed";

  const textarea =
    phaseCaptureNoteTypedElement(kind);

  const handPanel =
    phaseCaptureNoteHandPanel(kind);

  if (textarea) {
    textarea.hidden =
      state.mode !== "typed";
  }

  if (handPanel) {
    handPanel.hidden =
      state.mode !== "handwritten";
  }

  const bar =
    phaseCaptureNoteModeBar(kind);

  for (
    const button
    of bar?.querySelectorAll(
      "[data-capture-note-mode]"
    ) || []
  ) {
    const [, candidate] =
      String(
        button.dataset.captureNoteMode
      ).split(":");

    button.classList.toggle(
      "active",
      candidate === state.mode
    );
  }

  if (
    state.mode === "handwritten"
  ) {
    phaseCaptureNoteRender(kind);
  }
}


function phaseCaptureNoteSetTool(
  kind,
  tool
) {
  const state =
    phaseCaptureNoteState[kind];

  if (!state) {
    return;
  }

  state.tool =
    tool === "eraser"
      ? "eraser"
      : "pen";

  const panel =
    phaseCaptureNoteHandPanel(kind);

  for (
    const button
    of panel?.querySelectorAll(
      "[data-capture-note-tool]"
    ) || []
  ) {
    const [, candidate] =
      String(
        button.dataset.captureNoteTool
      ).split(":");

    button.classList.toggle(
      "active",
      candidate === state.tool
    );
  }
}


function phaseCaptureNoteCanvasPoint(
  kind,
  event
) {
  const canvas =
    phaseCaptureNoteCanvas(kind);

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
      event.clientX - rect.left
    ) * canvas.width / rect.width,

    (
      event.clientY - rect.top
    ) * canvas.height / rect.height,
  ];
}


function phaseCaptureNoteDrawStroke(
  context,
  stroke
) {
  const points =
    stroke?.points || [];

  if (!points.length) {
    return;
  }

  context.save();

  context.strokeStyle =
    stroke.tool === "eraser"
      ? "#ffffff"
      : "#111111";

  context.fillStyle =
    context.strokeStyle;

  context.lineWidth =
    stroke.tool === "eraser"
      ? 30
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


function phaseCaptureNoteRender(kind) {
  const owner =
    phaseCaptureNoteOwner(kind);

  const canvas =
    phaseCaptureNoteCanvas(kind);

  if (
    !owner
    || !canvas
  ) {
    return;
  }

  const strokes =
    phaseCaptureNoteEnsureData(
      owner
    );

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
    of strokes
  ) {
    phaseCaptureNoteDrawStroke(
      context,
      stroke
    );
  }

  const drawing =
    phaseCaptureNoteState[kind]
      ?.drawing;

  if (drawing) {
    phaseCaptureNoteDrawStroke(
      context,
      drawing
    );
  }
}


function phaseCaptureNotePointerDown(
  kind,
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

  const owner =
    phaseCaptureNoteOwner(kind);

  if (!owner) {
    return;
  }

  const point =
    phaseCaptureNoteCanvasPoint(
      kind,
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

  phaseCaptureNoteState[
    kind
  ].drawing = {
    tool:
      phaseCaptureNoteState[
        kind
      ].tool,
    points: [point],
    pointerId:
      event.pointerId,
  };

  phaseCaptureNoteRender(kind);
}


function phaseCaptureNotePointerMove(
  kind,
  event
) {
  const state =
    phaseCaptureNoteState[kind];

  const drawing =
    state?.drawing;

  if (
    !drawing
    || drawing.pointerId
      !== event.pointerId
  ) {
    return;
  }

  const point =
    phaseCaptureNoteCanvasPoint(
      kind,
      event
    );

  if (!point) {
    return;
  }

  event.preventDefault();

  const points =
    drawing.points;

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

  phaseCaptureNoteRender(kind);
}


function phaseCaptureNotePointerUp(
  kind,
  event
) {
  const state =
    phaseCaptureNoteState[kind];

  const drawing =
    state?.drawing;

  if (
    !drawing
    || drawing.pointerId
      !== event.pointerId
  ) {
    return;
  }

  event.preventDefault();

  const owner =
    phaseCaptureNoteOwner(kind);

  if (!owner) {
    state.drawing = null;
    return;
  }

  const strokes =
    phaseCaptureNoteEnsureData(
      owner
    );

  strokes.push({
    tool: drawing.tool,
    points: drawing.points,
  });

  owner.updatedAt =
    new Date().toISOString();

  state.drawing = null;

  phaseCaptureNoteScheduleSave(
    kind,
    150
  );

  phaseCaptureNoteRender(kind);
}


function phaseCaptureNoteUndo(kind) {
  const owner =
    phaseCaptureNoteOwner(kind);

  if (!owner) {
    return;
  }

  const strokes =
    phaseCaptureNoteEnsureData(
      owner
    );

  if (!strokes.length) {
    return;
  }

  strokes.pop();

  phaseCaptureNoteScheduleSave(
    kind,
    100
  );

  phaseCaptureNoteRender(kind);
}


function phaseCaptureNoteClear(kind) {
  const owner =
    phaseCaptureNoteOwner(kind);

  if (!owner) {
    return;
  }

  if (
    !window.confirm(
      "Clear handwritten note?"
    )
  ) {
    return;
  }

  owner.noteHandwriting = [];

  phaseCaptureNoteScheduleSave(
    kind,
    100
  );

  phaseCaptureNoteRender(kind);
}


function phaseCaptureNoteDataUrl(
  owner
) {
  const strokes =
    owner?.noteHandwriting;

  if (
    !Array.isArray(strokes)
    || !strokes.length
  ) {
    return null;
  }

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    PHASE_CAPTURE_NOTE_CANVAS_WIDTH;

  canvas.height =
    PHASE_CAPTURE_NOTE_CANVAS_HEIGHT;

  const context =
    canvas.getContext("2d");

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  for (
    const stroke
    of strokes
  ) {
    phaseCaptureNoteDrawStroke(
      context,
      stroke
    );
  }

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


function phaseCaptureNoteRtfPng(
  rendered,
  goalWidth = 9000
) {
  const hex =
    phaseReportDataUrlToHex(
      rendered.dataUrl
    );

  const goalHeight =
    Math.max(
      100,
      Math.round(
        goalWidth
        * rendered.height
        / rendered.width
      )
    );

  return (
    "{\\pict\\pngblip"
    + `\\picw${rendered.width}`
    + `\\pich${rendered.height}`
    + `\\picwgoal${goalWidth}`
    + `\\pichgoal${goalHeight} `
    + hex
    + "}\\par"
  );
}


// ------------------------------------------------------------------------
// Open-editor hooks.
// ------------------------------------------------------------------------

const phaseCaptureNoteBaseReportOpenEditor =
  phaseReportOpenEditor;

phaseReportOpenEditor =
  async function phaseCaptureNoteReportOpenEditor(
    entryId
  ) {
    const result =
      await phaseCaptureNoteBaseReportOpenEditor(
        entryId
      );

    phaseCaptureNoteInstallUi(
      "report"
    );

    const owner =
      phaseReportCurrentEntry();

    phaseCaptureNoteEnsureData(
      owner
    );

    phaseCaptureNoteState.report.drawing =
      null;

    phaseCaptureNoteSetTool(
      "report",
      "pen"
    );

    phaseCaptureNoteSetMode(
      "report",
      "typed"
    );

    return result;
  };


const phaseCaptureNoteBaseNotesOpenCapture =
  phaseNotesOpenCapture;

phaseNotesOpenCapture =
  async function phaseCaptureNoteNotesOpenCapture(
    captureId
  ) {
    const result =
      await phaseCaptureNoteBaseNotesOpenCapture(
        captureId
      );

    phaseCaptureNoteInstallUi(
      "notes"
    );

    const owner =
      phaseNotesCurrentCapture();

    phaseCaptureNoteEnsureData(
      owner
    );

    phaseCaptureNoteState.notes.drawing =
      null;

    phaseCaptureNoteSetTool(
      "notes",
      "pen"
    );

    phaseCaptureNoteSetMode(
      "notes",
      "typed"
    );

    return result;
  };


// ------------------------------------------------------------------------
// Report RTF/Share with per-finding handwriting.
// ------------------------------------------------------------------------

async function phaseCaptureNoteBuildReportArtifact() {
  if (
    !phaseReportCurrent
    || !phaseReportCurrent.entries
      ?.length
  ) {
    throw new Error(
      "The report has no findings"
    );
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
      phaseCaptureNoteRtfPng(
        rendered
      )
    );

    const typed =
      String(
        entry.note || ""
      ).trim();

    if (typed) {
      parts.push(
        "\\b Typed note:\\b0 "
        + phaseReportRtfEscape(
          typed
        )
        + "\\par"
      );
    }

    const handwritten =
      phaseCaptureNoteDataUrl(
        entry
      );

    if (handwritten) {
      parts.push(
        "\\b Handwritten note:\\b0\\par"
      );

      parts.push(
        phaseCaptureNoteRtfPng(
          handwritten
        )
      );
    }

    if (
      !typed
      && !handwritten
    ) {
      parts.push(
        "\\b Note:\\b0 —\\par"
      );
    }

    parts.push("\\par");
  }

  parts.push("}");

  return {
    blob:
      new Blob(
        [parts.join("\n")],
        {
          type:
            "application/rtf",
        }
      ),

    filename:
      phaseReportSafeFilename(
        `${phaseReportCurrent.imageName}_${phaseReportCurrent.annotationFile}_report`
      )
      + ".rtf",

    title:
      "HistoAnnotator Annotation Report",
  };
}


phaseReportExportRtf =
  async function phaseCaptureNoteReportExport() {
    try {
      setStatus(
        "Preparing report…",
        "local"
      );

      const artifact =
        await phaseCaptureNoteBuildReportArtifact();

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
          URL.revokeObjectURL(
            url
          ),
        1000
      );

      setStatus(
        "Report exported",
        "saved"
      );

    } catch (error) {
      console.error(
        "Report export failed",
        error
      );

      setStatus(
        `Could not export report: ${error.message}`,
        "error"
      );
    }
  };


phaseReportShareArtifact =
  phaseCaptureNoteBuildReportArtifact;


// ------------------------------------------------------------------------
// Notes RTF/Share with per-visual-example handwriting.
// ------------------------------------------------------------------------

const phaseCaptureNoteBaseNotesBuildArtifact =
  phaseNotesBuildArtifact;

phaseNotesBuildArtifact =
  async function phaseCaptureNoteNotesBuildArtifact() {
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

    const typedTopic =
      String(
        topic.typedNote || ""
      ).trim();

    if (typedTopic) {
      parts.push(
        phaseReportRtfEscape(
          typedTopic
        )
        + "\\par\\par"
      );
    }

    if (
      Array.isArray(
        topic.handwriting
      )
      && topic.handwriting.length
    ) {
      const oldTopicId =
        phaseNotesTopicId;

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width = 1200;
      canvas.height = 650;

      const context =
        canvas.getContext("2d");

      context.fillStyle =
        "#ffffff";

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      for (
        const stroke
        of topic.handwriting
      ) {
        phaseNotesDrawHandStroke(
          context,
          stroke
        );
      }

      parts.push(
        "\\b Handwritten topic note:\\b0\\par"
      );

      parts.push(
        phaseCaptureNoteRtfPng({
          dataUrl:
            canvas.toDataURL(
              "image/png"
            ),
          width:
            canvas.width,
          height:
            canvas.height,
        })
      );

      phaseNotesTopicId =
        oldTopicId;

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
        phaseCaptureNoteRtfPng(
          rendered
        )
      );

      const typed =
        String(
          capture.note || ""
        ).trim();

      if (typed) {
        parts.push(
          "\\b Typed note:\\b0 "
          + phaseReportRtfEscape(
            typed
          )
          + "\\par"
        );
      }

      const handwritten =
        phaseCaptureNoteDataUrl(
          capture
        );

      if (handwritten) {
        parts.push(
          "\\b Handwritten note:\\b0\\par"
        );

        parts.push(
          phaseCaptureNoteRtfPng(
            handwritten
          )
        );
      }

      if (
        !typed
        && !handwritten
      ) {
        parts.push(
          "\\b Note:\\b0 —\\par"
        );
      }

      parts.push("\\par");
    }

    parts.push("}");

    return {
      blob:
        new Blob(
          [parts.join("\n")],
          {
            type:
              "application/rtf",
          }
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
  };


// ------------------------------------------------------------------------
// Ensure the new controls exist before the first editor use.
// ------------------------------------------------------------------------

phaseCaptureNoteInstallUi(
  "report"
);

phaseCaptureNoteInstallUi(
  "notes"
);
