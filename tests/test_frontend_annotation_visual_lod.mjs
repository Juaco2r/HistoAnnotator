import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const renderer = fs.readFileSync(
  "app/static/frontend/10_viewer_display_storage.part.js",
  "utf8",
);
const annotations = fs.readFileSync(
  "app/static/frontend/20_annotations_geometry_history.part.js",
  "utf8",
);
const visualReview = fs.readFileSync(
  "app/static/frontend/56_evaluation_visual_review.part.js",
  "utf8",
);

test("adaptive LOD helpers live in the real polygon renderer", () => {
  assert.match(renderer, /Phase F2\.6\.4 - Adaptive visual LOD/);
  assert.match(renderer, /PHASE_F264_LOD_MIN_FEATURES\s*=\s*1000/);
  assert.match(renderer, /function phaseF264DisplayRing\(/);
});

test("drawPolygonRings uses a display-only ring", () => {
  assert.match(
    renderer,
    /const displayRing\s*=\s*phaseF264DisplayRing\(ring,\s*selected\)/,
  );
  assert.match(
    renderer,
    /\(displayRing \|\| \[\]\)\.map\(screenPointFromImage\)/,
  );
});

test("normal annotation frames initialize LOD exactly once", () => {
  assert.match(
    annotations,
    /function phaseF26BeginRenderFrame\(\)\s*\{\s*phaseF264BeginRenderFrame\(\);/,
  );
});

test("geometry cache invalidation also resets visual LOD cache", () => {
  assert.match(
    annotations,
    /function phaseF26InvalidateGeometryCaches\(\)\s*\{\s*phaseF264ResetCache\(\);/,
  );
  assert.match(renderer, /phaseF264RingCache\s*=\s*new WeakMap\(\)/);
});

test("LOD is disabled outside Move and selected geometry bypasses simplification", () => {
  assert.match(renderer, /mode !== "navigate"/);
  assert.match(renderer, /selected\s*\|\|\s*!phaseF264FrameContext\.enabled/);
});

test("LOD diagnostics exist and Visual Review is untouched", () => {
  assert.match(renderer, /window\.__histoannotatorF264LodStats/);
  assert.doesNotMatch(
    visualReview,
    /phaseF264DisplayRing|__histoannotatorF264LodStats/,
  );
  assert.doesNotMatch(
    renderer,
    /featureCollection\.features\s*=.*phaseF264/i,
  );
});
