import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/59_evaluation_offline_package.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Save for offline precomputes every Visual Review class", () => {
  assert.match(source, /phaseEvalOfflineClasses/);
  assert.match(source, /const targetClass\s*\n\s*of classes/);
  assert.match(source, /evaluation-visual/);
  assert.match(source, /await phaseEvalCachePut/);
});

test("offline visual request preserves evaluation mappings", () => {
  assert.match(source, /candidateFile/);
  assert.match(source, /referenceFile/);
  assert.match(source, /candidateMapping/);
  assert.match(source, /referenceMapping/);
  assert.match(source, /targetClass/);
  assert.match(source, /maxRegions:\s*\n\s*500/);
});

test("portable package contains the local evaluation cache", () => {
  assert.match(source, /histoannotator-evaluation-package/);
  assert.match(source, /record:\s*\n\s*phaseEvalCacheClone/);
  assert.match(source, /\.histo-eval\.json/);
});

test("portable package can be restored into IndexedDB", () => {
  assert.match(source, /phaseEvalOfflineImportPackage/);
  assert.match(source, /record\.imageId/);
  assert.match(source, /currentImage\.id/);
  assert.match(source, /await phaseEvalCachePut/);
  assert.match(source, /phaseEvalLastResult/);
});

test("offline preparation requests persistent browser storage", () => {
  assert.match(source, /navigator\.storage\?\.persist/);
});

test("review decisions survive identical cache-result refresh", () => {
  assert.match(source, /previousRecord\.reviewDecisions/);
  assert.match(source, /record\.reviewDecisions/);
});
