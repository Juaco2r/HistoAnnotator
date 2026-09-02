import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/89_capture_note_modes.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Report findings support typed and handwritten notes", () => {
  assert.match(source, /phaseReportNoteModeBar/);
  assert.match(source, /phaseReportNoteHandCanvas/);
  assert.match(source, /phaseReportCurrentEntry/);
  assert.match(source, /noteHandwriting/);
});

test("Notes visual examples support typed and handwritten notes", () => {
  assert.match(source, /phaseNotesCaptureModeBar/);
  assert.match(source, /phaseNotesCaptureHandCanvas/);
  assert.match(source, /phaseNotesCurrentCapture/);
  assert.match(source, /noteHandwriting/);
});

test("Per-capture handwriting has pen eraser undo and clear", () => {
  assert.match(source, /data-capture-note-tool/);
  assert.match(source, /eraser/);
  assert.match(source, /phaseCaptureNoteUndo/);
  assert.match(source, /phaseCaptureNoteClear/);
});

test("Report export and share include handwritten finding notes", () => {
  assert.match(source, /phaseCaptureNoteBuildReportArtifact/);
  assert.match(source, /Handwritten note/);
  assert.match(source, /phaseReportExportRtf/);
  assert.match(source, /phaseReportShareArtifact/);
});

test("Notes export includes handwritten notes per visual example", () => {
  assert.match(source, /phaseNotesBuildArtifact/);
  assert.match(source, /Source image/);
  assert.match(source, /Annotation file/);
  assert.match(source, /Crop:/);
  assert.match(source, /Handwritten note/);
});
