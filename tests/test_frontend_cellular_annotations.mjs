import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/89_cellular_annotation_core.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("cellular defaults are Unassigned and Unclassified", () => {
  assert.match(
    source,
    /value: "unassigned"/
  );

  assert.match(
    source,
    /label: "Unassigned"/
  );

  assert.match(
    source,
    /value: "unclassified"/
  );

  assert.match(
    source,
    /label: "Unclassified"/
  );

  assert.match(
    source,
    /aliases\[text\][\s\S]*\|\| "unassigned"/
  );

  assert.match(
    source,
    /return "unclassified"/
  );
});

test("Positive and Negative are marker status rather than cell type", () => {
  assert.match(
    source,
    /PHASE_CELL_MARKER_STATUSES/
  );

  assert.match(
    source,
    /text === "positive"/
  );

  assert.match(
    source,
    /text === "negative"/
  );

  assert.match(
    source,
    /Cell type and marker status are independent/
  );
});

test("cellular classes are the requested biological classes", () => {
  for (
    const value
    of [
      "tumor",
      "immune",
      "macrophage",
      "fibroblast",
      "endothelial",
    ]
  ) {
    assert.match(
      source,
      new RegExp(
        `value: "${value}"`
      )
    );
  }
});

test("QuPath objectType cell is automatically detected and imported separately", () => {
  assert.match(
    source,
    /phaseCellFeatureObjectType/
  );

  assert.match(
    source,
    /"cell"/
  );

  assert.match(
    source,
    /QuPath cellular annotation detected/
  );

  assert.match(
    source,
    /separate Cellular Annotation file/
  );

  assert.match(
    source,
    /phaseCellBaseImportGeoJson/
  );
});

test("cellular metadata preserves both independent axes", () => {
  assert.match(
    source,
    /level:\s*\n\s*"cellular"/
  );

  assert.match(
    source,
    /markerStatus/
  );

  assert.match(
    source,
    /cellType/
  );

  assert.match(
    source,
    /cellId/
  );

  assert.match(
    source,
    /part/
  );
});

test("cellular document has display filters editing and counts", () => {
  assert.match(
    source,
    /Marker filter/
  );

  assert.match(
    source,
    /Cell type filter/
  );

  assert.match(
    source,
    /Apply cell type/
  );

  assert.match(
    source,
    /Apply marker/
  );

  assert.match(
    source,
    /Cellular summary/
  );

  assert.match(
    source,
    /Counts by cell type/
  );
});

test("QuPath nucleusGeometry is expanded into a linked nucleus feature", () => {
  assert.match(source, /QuPath nucleusGeometry expansion v2/);
  assert.match(source, /sourceFeature\s*\?\.nucleusGeometry/);
  assert.match(source, /sourceCells\.flatMap/);
  assert.match(source, /phaseCellImportedFeatures/);
  assert.match(source, /sourceObjectType:\s*\n\s*"nucleusGeometry"/);
  assert.match(source, /parentBodyId/);
});
