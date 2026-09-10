import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/89_cellular_nucleus_tools.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("cellular UI distinguishes bodies and nucleus geometries", () => {
  assert.match(
    source,
    /Cell bodies/
  );

  assert.match(
    source,
    /Nuclei/
  );

  assert.match(
    source,
    /phaseCellPartFilter/
  );

  assert.match(
    source,
    /No nucleus geometries are stored/
  );
});

test("new nucleus can inherit biological identity from selected body", () => {
  assert.match(
    source,
    /phaseCellSelectedBodyForLink/
  );

  assert.match(
    source,
    /cell\.cellId\s*=\s*[\s\S]*phaseCellCellId/
  );

  assert.match(
    source,
    /cell\.cellType\s*=\s*[\s\S]*phaseCellType/
  );

  assert.match(
    source,
    /cell\.markerStatus\s*=\s*[\s\S]*phaseCellMarkerStatus/
  );
});

test("cellular drawing converts generic new geometry to explicit part metadata", () => {
  assert.match(
    source,
    /phaseCellNucleusBaseCommitGeometry/
  );

  assert.match(
    source,
    /feature\.properties\.objectType/
  );

  assert.match(
    source,
    /cell\.part/
  );

  assert.match(
    source,
    /phaseCellNucleusUpdateCreatedUndo/
  );
});

test("cellular geometry editing uses the existing left Annotation tools", () => {
  assert.match(
    source,
    /Cellular left-toolbar nucleus mode v2/
  );

  assert.match(
    source,
    /drawing tools create nucleus geometry/
  );

  assert.match(
    source,
    /phaseCellNucleusFindContainingBody/
  );

  assert.match(
    source,
    /phaseCellSelectedBodyForLink/
  );

  assert.doesNotMatch(
    source,
    /id="phaseCellDrawBodyFreehand"/
  );

  assert.doesNotMatch(
    source,
    /id="phaseCellDrawNucleusFreehand"/
  );
});

test("biological counts are deduplicated by cellId", () => {
  assert.match(
    source,
    /phaseCellUniqueBiologicalCounts/
  );

  assert.match(
    source,
    /const byCellId\s*=\s*[\s\S]*new Map/
  );

  assert.match(
    source,
    /total:\s*\n\s*byCellId\.size/
  );
});

test("cellular hit test searches visible filtered features directly", () => {
  assert.match(
    source,
    /phaseCellNucleusHitTest/
  );

  assert.match(
    source,
    /phaseCellFeatureMatchesFilters/
  );

  assert.match(
    source,
    /pointInPolygon/
  );
});

test("Cellular mode uses the existing left Annotation tools for nuclei", () => {
  assert.match(source, /Cellular left-toolbar nucleus mode v2/);
  assert.match(source, /phaseCellNucleusFindContainingBody/);
  assert.match(source, /normal Annotation drawing tools on the left/);
});
