import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const js = fs.readFileSync(
  path.join(
    root,
    "app/static/frontend/35_review_tiles_undo.part.js",
  ),
  "utf8",
);

const css = fs.readFileSync(
  path.join(
    root,
    "app/static/styles.css",
  ),
  "utf8",
);

test("Tile Review session persistence is local and versioned", () => {
  assert.match(js, /Tile Review session persistence v1/);
  assert.match(js, /PHASE_REVIEW_TILE_SESSION_STORAGE_PREFIX/);
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /localStorage\.getItem/);
});

test("session identity includes image, ROI signature and tile size", () => {
  assert.match(js, /phaseReviewTileSessionImageIdentity/);
  assert.match(js, /phaseReviewTileSessionEffectiveRoiSignature/);
  assert.match(js, /phaseDEffectivePreviewForRoi/);
  assert.match(js, /tileSizePx/);
});

test("resume restores current tile and reviewed tile ids", () => {
  assert.match(js, /phaseReviewTileSessionRestore/);
  assert.match(js, /phaseReviewTileState\.currentIndex\s*=/);
  assert.match(js, /phaseReviewTileState\.reviewedTileIds\s*=\s*new Set/);
  assert.match(js, /phaseReviewZoomToCurrentTile/);
});

test("user can resume or start from Tile 1 safely", () => {
  assert.match(js, /Resume previous Tile Review at Tile/);
  assert.match(js, /Cancel = Start from Tile 1/);
  assert.match(js, /Previously accepted annotation statuses were kept/);
});

test("tile session saves on navigation, acceptance and app backgrounding", () => {
  assert.match(js, /phaseReviewTileSessionBaseMoveTile/);
  assert.match(js, /phaseReviewTileSessionBaseAcceptAll/);
  assert.match(js, /beforeunload/);
  assert.match(js, /visibilitychange/);
});

test("responsive Tile Review stacks narrow controls instead of clipping", () => {
  assert.match(css, /Tile Review responsive layout v1/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(
    css,
    /\.phase-review-tile-meta\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    css,
    /\.phase-review-tile-actions\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    css,
    /\.phase-review-tile-nav strong\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/,
  );
});
