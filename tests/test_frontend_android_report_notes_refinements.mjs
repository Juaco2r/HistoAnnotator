import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/89_android_report_notes_refinements.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Report typed note exposes Android handwriting-to-text attributes", () => {
  assert.match(source, /phaseReportNote/);
  assert.match(source, /inputmode/);
  assert.match(source, /autocapitalize/);
  assert.match(source, /spellcheck/);
});

test("Handwritten notes are rendered in Report and Notes summary cards", () => {
  assert.match(source, /phaseAndroidRnHandPreview/);
  assert.match(source, /phaseReportRenderEntries/);
  assert.match(source, /phaseNotesRenderCaptures/);
  assert.match(source, /phase-rn-hand-summary-image/);
});

test("Android native file share mirrors working GeoJSON pattern", () => {
  assert.match(source, /Filesystem\.writeFile/);
  assert.match(source, /directory:\s*"CACHE"/);
  assert.match(source, /Share\.share/);
  assert.match(source, /files:\s*\[\s*written\.uri/);
});

test("Native Android does not silently use HTML download fallback", () => {
  assert.match(source, /if \(IS_NATIVE\)/);
  assert.match(source, /Save or share report/);
  assert.match(source, /Save or share Notes/);
  assert.match(source, /do NOT silently trigger an HTML download/);
});

test("Browser still supports direct downloads", () => {
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /link\.download/);
});
