import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/58_visual_review_workflow.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Visual Review has annotation eye toggle", () => {
  assert.match(source, /phaseEvalReviewAnnotationsButton/);
  assert.match(source, /annotationCanvas/);
  assert.match(source, /ToggleAnnotations/);
});

test("Visual Review uses percentage donut with Ground Truth as fixed reference", () => {
  assert.match(source, /conic-gradient/);
  assert.match(source, /referenceTarget/);
  assert.match(
    source,
    /Ground Truth is the fixed reference/
  );
  assert.doesNotMatch(
    source,
    /Candidate target<\/button>/
  );
  assert.match(source, /correctPercent/);
  assert.match(source, /wrongClassPercent/);
});

test("Mismatch class can filter exact pair overlay", () => {
  assert.match(source, /mismatchLayers/);
  assert.match(source, /phaseEvalReviewV4PairFilter/);
  assert.match(source, /phaseEvalReviewV4DrawPairFilter/);
});

test("Individual error emphasizes candidate class and percentage", () => {
  assert.match(source, /Candidate classification/);
  assert.match(source, /percentOfTarget/);
  assert.doesNotMatch(
    source,
    /phaseEvalVisualArea\(region\.areaPx2/
  );
});

test("Review decisions support GT or Candidate correction", () => {
  assert.match(source, /Candidate error/);
  assert.match(source, /GT error/);
  assert.match(source, /Unclear/);
  assert.match(source, /reviewDecisions/);
  assert.match(source, /phaseEvalCachePut/);
});

test("Wrong-class filter preserves the current viewer position", () => {
  const start = source.indexOf(
    "function phaseEvalReviewV4SetPairFilter"
  );

  const end = source.indexOf(
    "function phaseEvalReviewV4ClearPairFilter",
    start
  );

  const block = source.slice(
    start,
    end
  );

  assert.match(
    block,
    /phaseEvalVisualRegionIndex\s*=\s*-1/
  );

  assert.doesNotMatch(
    block,
    /phaseEvalVisualZoomRegion/
  );
});

test("Previous and Next zoom only during individual review", () => {
  assert.match(
    source,
    /phaseEvalReviewV4FilteredRegionIndices/
  );

  assert.match(
    source,
    /phaseEvalReviewV4FilteredStepRegion/
  );

  assert.match(
    source,
    /phaseEvalVisualZoomRegion/
  );

  assert.match(
    source,
    /pair\.candidateClass/
  );

  assert.match(
    source,
    /pair\.referenceClass/
  );
});
