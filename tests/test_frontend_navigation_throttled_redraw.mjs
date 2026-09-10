import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const annotations = fs.readFileSync(
  "app/static/frontend/20_annotations_geometry_history.part.js",
  "utf8",
);
const runtime = fs.readFileSync(
  "app/static/frontend/00_runtime_state.part.js",
  "utf8",
);
const visualReview = fs.readFileSync(
  "app/static/frontend/56_evaluation_visual_review.part.js",
  "utf8",
);

test("navigation redraw uses desktop 100 ms and Android 150 ms cadence", () => {
  assert.match(
    annotations,
    /PHASE_F26_ANDROID_NAVIGATION/,
  );
  assert.match(
    annotations,
    /\/Android\/i\.test/,
  );
  assert.match(
    annotations,
    /PHASE_F26_NAVIGATION_THROTTLE_MS\s*=\s*[\s\S]*\?\s*150[\s\S]*:\s*100/,
  );
  assert.match(
    annotations,
    /function phaseF26ScheduleNavigationThrottleDraw\(/,
  );
  assert.match(
    annotations,
    /setTimeout\(\s*phaseF26RunNavigationThrottleDraw,\s*waitMs\s*\)/,
  );
});

test("heavy pan/zoom keeps overlay visible and schedules throttled redraws", () => {
  assert.match(
    annotations,
    /phaseF26SetAnnotationOverlayNavigationHidden\(\s*false\s*\);\s*phaseF26ScheduleNavigationThrottleDraw\(\);/,
  );
  assert.doesNotMatch(
    annotations,
    /phaseF26SetAnnotationOverlayNavigationHidden\(\s*true\s*\);\s*return;/,
  );
});

test("animation finish cancels pending timer and performs final redraw", () => {
  assert.match(
    annotations,
    /function phaseF26FinishNavigationDraw\(\)/,
  );
  assert.match(
    annotations,
    /phaseF26CancelNavigationThrottleTimer\(\);[\s\S]*phaseF26NavigationThrottleStats\.finalDraws \+= 1;[\s\S]*phaseF26ScheduleDraw\(\);/,
  );
});

test("existing viewer wiring still routes animation and animation-finish correctly", () => {
  assert.match(
    runtime,
    /\["open", "animation", "update-viewport", "resize"\]\.forEach/,
  );
  assert.match(
    runtime,
    /viewer\.addHandler\("animation-finish", \(\) => \{\s*phaseF26FinishNavigationDraw\(\);/,
  );
});

test("diagnostics are exposed without modifying scientific or Visual Review paths", () => {
  assert.match(
    annotations,
    /window\.__histoannotatorF26NavigationThrottleStats/,
  );
  assert.doesNotMatch(
    visualReview,
    /F26NavigationThrottle|phaseF26ScheduleNavigationThrottleDraw/,
  );
  assert.doesNotMatch(
    annotations,
    /\/evaluate|evaluation-visual/,
  );
});
