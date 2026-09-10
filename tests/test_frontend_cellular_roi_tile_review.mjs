import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const core = fs.readFileSync(
  path.join(
    root,
    "app/static/frontend/89_cellular_annotation_core.part.js",
  ),
  "utf8",
);

const tiles = fs.readFileSync(
  path.join(
    root,
    "app/static/frontend/35_review_tiles_undo.part.js",
  ),
  "utf8",
);

test("Cellular Annotation keeps Tissue ROI drawable", () => {
  assert.match(
    core,
    /phaseCellDrawGeometry[\s\S]*phaseDIsTissueRoi[\s\S]*!isTissueRoi[\s\S]*phaseCellIsCellularFeature/,
  );
});

test("Cellular Annotation keeps Tissue ROI hit-testable", () => {
  assert.match(
    core,
    /phaseCellHitTest[\s\S]*phaseDIsTissueRoi[\s\S]*return id/,
  );
});

test("Cellular Tile Review uses one owner point per biological cell", () => {
  assert.match(
    tiles,
    /phaseReviewTileCellOwnerPointMap/,
  );
  assert.match(
    tiles,
    /phaseReviewTileGeometryCentroid/,
  );
  assert.match(
    tiles,
    /phaseReviewTileCellId/,
  );
  assert.match(
    tiles,
    /phaseReviewTileEmbeddedNucleusGeometry/,
  );
});

test("Cellular Tile Review excludes ROI from review targets", () => {
  assert.match(
    tiles,
    /phaseReviewTileCellularActive\(\)[\s\S]*!phaseCellIsCellularFeature/,
  );
});

test("Cellular membership uses centroid ownership rather than bounds overlap", () => {
  assert.match(
    tiles,
    /phaseReviewTilePointInTile\([\s\S]*phaseReviewTileCellOwnerPoint/,
  );
  assert.match(
    tiles,
    /point\.x\s*>=\s*bounds\.minX[\s\S]*point\.x\s*<\s*bounds\.maxX/,
  );
});

test("Non-cellular Tile Review keeps existing annotation behavior", () => {
  assert.match(
    tiles,
    /phaseDIsAnnotationFeature[\s\S]*tile\.annotationIds[\s\S]*phaseReviewTileBoundsIntersect/,
  );
});
