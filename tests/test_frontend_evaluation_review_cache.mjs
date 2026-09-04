import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/57_evaluation_review_cache.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Evaluation results persist in IndexedDB", () => {
  assert.match(source, /indexedDB\.open/);
  assert.match(source, /histoannotator-evaluation-cache-v1/);
  assert.match(source, /visualByClass/);
});

test("Previous evaluation can be opened or re-evaluated", () => {
  assert.match(source, /Open previous/);
  assert.match(source, /Re-evaluate/);
  assert.match(source, /phaseEvalCacheOpenPrevious/);
  assert.match(source, /phaseEvalCacheReevaluate/);
});

test("Cache validates annotation checksums", () => {
  assert.match(source, /candidateDocumentChecksum/);
  assert.match(source, /referenceDocumentChecksum/);
  assert.match(source, /documentChecksum/);
});

test("Selected error is highlighted in yellow", () => {
  assert.match(source, /#fde047/);
  assert.match(source, /strokeRect/);
  assert.match(source, /phaseEvalVisualRegionIndex/);
});

test("Metrics UI explicitly states Dice is per mapped class", () => {
  assert.match(
    source,
    /Dice is calculated independently for each mapped class/
  );
});

test("selected error uses exact polygon geometry", () => {
  assert.match(source, /region\.geometry/);
  assert.match(source, /phaseEvalVisualGeometryPath/);
  assert.match(source, /lineWidth\s*=\s*3\.5/);
  assert.match(source, /#fde047/);
});

test("legacy bbox-only visual cache is recalculated", () => {
  assert.match(source, /regions\.every/);
  assert.match(source, /region\.geometry/);
});
