import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(
  new URL("../app/static/frontend/00_runtime_state.part.js", import.meta.url),
  "utf8",
);
const annotations = fs.readFileSync(
  new URL("../app/static/frontend/20_annotations_geometry_history.part.js", import.meta.url),
  "utf8",
);
const visual = fs.readFileSync(
  new URL("../app/static/frontend/56_evaluation_visual_review.part.js", import.meta.url),
  "utf8",
);

test("large annotation files use whole-feature viewport culling", () => {
  assert.match(annotations, /PHASE_F26_FEATURE_CULL_MIN_FEATURES\s*=\s*\n\s*400/);
  assert.match(annotations, /phaseF26UseFeatureViewportCulling/);
  assert.match(annotations, /phaseF26FeatureVisible/);
  assert.match(annotations, /phaseF26GeometryBounds/);
  assert.match(annotations, /phaseF26BoundsIntersect/);
  assert.match(annotations, /__histoannotatorF26FeatureCullStats/);
});

test("heavy Move navigation defers annotation redraw until animation finishes", () => {
  assert.match(annotations, /PHASE_F26_NAVIGATION_DEFER_MIN_FEATURES\s*=\s*\n\s*800/);
  assert.match(annotations, /mode === "navigate"/);
  assert.match(annotations, /phaseF26HandleViewportDrawEvent/);
  assert.match(annotations, /phaseF26FinishNavigationDraw/);
  assert.match(annotations, /canvas\.style\.visibility/);
  assert.match(runtime, /phaseF26HandleViewportDrawEvent\(\s*\n\s*eventName/);
  assert.match(runtime, /"animation-finish"[\s\S]*phaseF26FinishNavigationDraw/);
});

test("Visual Review avoids expensive redraw on every animation frame", () => {
  assert.match(visual, /phaseEvalVisualNavigationFrame/);
  assert.match(visual, /phaseEvalVisualDrawAfterNavigation/);
  assert.match(visual, /"animation-finish",\s*\n\s*phaseEvalVisualDrawAfterNavigation/);
  assert.doesNotMatch(visual, /"animation",\s*\n\s*phaseEvalVisualDraw\s*\n/);
});

test("Visual Review culls polygons outside the current viewport", () => {
  assert.match(visual, /phaseF26CurrentRenderContext/);
  assert.match(visual, /phaseF26PolygonVisible/);
  assert.match(visual, /renderContext/);
});

test("performance path is display-only and does not rewrite stored coordinates", () => {
  const start = annotations.indexOf("function phaseF26UseFeatureViewportCulling");
  const end = annotations.indexOf("function phaseF26PolygonVisible", start);
  const block = annotations.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /feature\?\.geometry/);
  assert.doesNotMatch(block, /\.geometry\s*=/);
  assert.doesNotMatch(block, /coordinates\s*=/);
  assert.doesNotMatch(block, /simplif/i);
  assert.match(annotations, /Display-only: stored GeoJSON and scientific calculations remain level-0/);
});
