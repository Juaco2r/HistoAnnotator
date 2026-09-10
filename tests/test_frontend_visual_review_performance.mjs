import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const visual = fs.readFileSync(
  new URL(
    "../app/static/frontend/56_evaluation_visual_review.part.js",
    import.meta.url,
  ),
  "utf8",
);

const runtime = fs.readFileSync(
  new URL(
    "../app/static/frontend/00_runtime_state.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Visual Review requests backend profiling without changing scientific evaluate", () => {
  assert.match(visual, /profilePerformance:\s*\n\s*true/);
  assert.match(visual, /\[VisualReview PERF FRONTEND\]/);
  assert.match(visual, /requestUntilHeadersMs/);
  assert.match(visual, /jsonParseMs/);
  assert.match(visual, /summaryAndDrawMs/);
  assert.match(visual, /phaseEvalVisualPerfDrawSample/);
});

test("Visual Review tile diagnostics are observational only", () => {
  assert.match(runtime, /\[VisualReview TILE PERF\]/);
  assert.match(runtime, /imageLoaderTimeoutMs/);
  assert.match(runtime, /elapsedSinceReviewOpenMs/);
  assert.doesNotMatch(runtime, /open\([^)]*tileSource/i);
  assert.doesNotMatch(runtime, /forced.*pyramid/i);
});
