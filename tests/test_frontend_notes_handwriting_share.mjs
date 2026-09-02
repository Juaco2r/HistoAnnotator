
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/88_notes_handwriting_share.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Notes are local cross-image topics", () => {
  assert.match(source, /histoannotator-notes-v1/);
  assert.match(source, /imageId:/);
  assert.match(source, /imageName:/);
  assert.match(source, /annotationFile:/);
  assert.match(source, /captures:/);
  assert.doesNotMatch(source, /featureCollection\.features\.push/);
});

test("Notes support typed text and tablet handwriting", () => {
  assert.match(source, /inputmode="text"/);
  assert.match(source, /phaseNotesTypedText/);
  assert.match(source, /phaseNotesHandCanvas/);
  assert.match(source, /phaseNotesHandPointerDown/);
  assert.match(source, /eraser/);
});

test("Notes captures retain source and level-0 crop metadata", () => {
  assert.match(source, /phaseReportFetchRegion/);
  assert.match(source, /phaseReportCaptureFromViewer/);
  assert.match(source, /imageName:/);
  assert.match(source, /annotationFile:/);
  assert.match(source, /region:/);
});

test("Notes and Report support native share with download fallback", () => {
  assert.match(source, /navigator\.share/);
  assert.match(source, /navigator\.canShare/);
  assert.match(source, /new File/);
  assert.match(source, /phaseReportNativeShare/);
  assert.match(source, /phaseNotesExport/);
});

test("Notes export includes handwritten page and visual sources", () => {
  assert.match(source, /Handwritten note/);
  assert.match(source, /Source image/);
  assert.match(source, /Annotation file/);
  assert.match(source, /Crop:/);
  assert.match(source, /pngblip/);
});
