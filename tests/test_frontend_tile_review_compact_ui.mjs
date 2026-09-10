import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const frontendDir = path.join(root, "app/static/frontend");

const frontend = fs.readdirSync(frontendDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(frontendDir, name), "utf8"))
  .join("\n");

const tiles = fs.readFileSync(
  path.join(root, "app/static/frontend/35_review_tiles_undo.part.js"),
  "utf8",
);

const css = fs.readFileSync(
  path.join(root, "app/static/styles.css"),
  "utf8",
);

test("redundant Cellular help text is removed", () => {
  assert.doesNotMatch(frontend, /Cell type and marker status are independent\./);
  assert.doesNotMatch(frontend, /Missing cell type = Unassigned\./);
  assert.doesNotMatch(frontend, /Missing marker status = Unclassified\./);
  assert.doesNotMatch(frontend, /Annotation drawing tools on the left create nuclei\./);
  assert.doesNotMatch(
    frontend,
    /Select a nucleus and use the normal Add\/Subtract\/Delete tools to correct it\./,
  );
});

test("Tile Review removes redundant color help", () => {
  assert.doesNotMatch(
    tiles,
    /Colors remain visible for all annotations in the current tile\./,
  );
  assert.match(
    tiles,
    /Select mode: tap an annotation to toggle it\./,
  );
});

test("Tile Review heading is compact", () => {
  assert.doesNotMatch(tiles, /Annotations in this tile/);
  assert.match(tiles, />Tile objects</);
});

test("tile counter is above Previous and Next regardless of viewport width", () => {
  assert.match(css, /Tile Review compact navigation v1/);
  assert.match(
    css,
    /grid-template-areas:\s*[\s\S]*"counter counter"[\s\S]*"previous next"/,
  );
  assert.match(css, /#phaseReviewTileCounter\s*\{[\s\S]*grid-area:\s*counter/);
  assert.match(css, /#phaseReviewPrevTile\s*\{[\s\S]*grid-area:\s*previous/);
  assert.match(css, /#phaseReviewNextTile\s*\{[\s\S]*grid-area:\s*next/);
});

test("selection controls can wrap without compressing the sidebar", () => {
  assert.match(
    css,
    /\.phase-review-tile-selection-head > div\s*\{[\s\S]*repeat\(auto-fit,\s*minmax\(88px,\s*1fr\)\)/,
  );
  assert.match(
    css,
    /\.phase-review-tile-selection-head button\s*\{[\s\S]*width:\s*100%/,
  );
});
