import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/35_review_tiles_undo.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Review dropdown includes By tiles", () => {
  assert.match(source, /By tiles…/);
  assert.match(source, /PHASE_REVIEW_TILE_SCOPE/);
});

test("Tile review uses valid-tissue server grid", () => {
  assert.match(source, /geojson\/review-tiles/);
  assert.match(source, /external-border exclusion/);
  assert.match(source, /Artifact exclusion/);
});

test("Tile review shows multiple colored annotations and supports selection", () => {
  assert.match(source, /phaseReviewTileFeatures/);
  assert.match(source, /colorForFeature/);
  assert.match(source, /Accept selected/);
  assert.match(source, /Accept all & next/);
  assert.match(source, /Select mode: tap an annotation to toggle it/);
});

test("Review Undo restores document and review navigation state", () => {
  assert.match(source, /phaseReviewUndoHistory/);
  assert.match(source, /featureCollection:\s*\n\s*deepClone/);
  assert.match(source, /reviewState:\s*\n\s*deepClone/);
  assert.match(source, /Review undo/);
});

test("Tile selection uses multi-selection instead of replacing selection", () => {
  assert.match(source, /phaseReviewTilesSetSingleSelection/);
  assert.match(source, /setMultiSelection/);
});
