import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL(
    '../app/static/frontend/87_report_builder.part.js',
    import.meta.url,
  ),
  'utf8',
);

test('Report Builder is isolated from annotation GeoJSON', () => {
  assert.match(source, /histoannotator-reports-v1/);
  assert.match(source, /phaseReportDocumentKey/);
  assert.match(source, /currentAnnotationFile/);
  assert.doesNotMatch(source, /featureCollection\.features\.push/);
  assert.doesNotMatch(source, /commitGeometry\(/);
});

test('Report Builder captures level-0 image regions', () => {
  assert.match(source, /\/api\/images\/\$\{encodeURIComponent\(currentImage\.id\)\}\/region\.png/);
  assert.match(source, /displayQueryString/);
  assert.match(source, /X-Output-Width/);
  assert.match(source, /X-Output-Height/);
});

test('Report findings autosave and remain editable', () => {
  assert.match(source, /phaseReportScheduleSave/);
  assert.match(source, /phaseReportEditorNoteChanged/);
  assert.match(source, /phaseReportOpenEditor/);
  assert.match(source, /markup:\s*\[\]/);
  assert.match(source, /note:\s*""/);
});

test('Report markup supports pen arrow rectangle and undo', () => {
  assert.match(source, /type:\s*"pen"/);
  assert.match(source, /phaseReportDrawArrow/);
  assert.match(source, /type === "rectangle"/);
  assert.match(source, /phaseReportEditorUndo/);
});

test('Report Builder exports embedded Word-compatible RTF', () => {
  assert.match(source, /application\/rtf/);
  assert.match(source, /pngblip/);
  assert.match(source, /phaseReportDataUrlToHex/);
  assert.match(source, /\.rtf/);
});
