import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/56_evaluation_visual_review.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("visual evaluation exposes TP/FP/FN and wrong-class layers", () => {
  assert.match(source, /agreement/);
  assert.match(source, /candidate_only/);
  assert.match(source, /reference_only/);
  assert.match(source, /wrong_class/);
});

test("visual review calls the dedicated backend endpoint", () => {
  assert.match(source, /evaluation-visual/);
  assert.match(source, /targetClass/);
  assert.match(source, /candidateMapping/);
  assert.match(source, /referenceMapping/);
});

test("visual review supports error navigation and zoom", () => {
  assert.match(source, /Next error/);
  assert.match(source, /Previous error/);
  assert.match(source, /phaseEvalVisualZoomRegion/);
  assert.match(source, /fitBounds/);
});

test("visual review does not alter scientific featureCollection", () => {
  assert.doesNotMatch(
    source,
    /featureCollection\.features\s*=/
  );
  assert.doesNotMatch(
    source,
    /markChanged\(/
  );
});
