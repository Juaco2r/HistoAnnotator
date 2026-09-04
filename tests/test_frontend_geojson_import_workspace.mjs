import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../app/static/frontend/89_geojson_import_workspace.part.js",
    import.meta.url,
  ),
  "utf8",
);

test("Import GeoJSON opens one preview workspace with two destination actions", () => {
  assert.match(source, /Import as new Annotation File/);
  assert.match(source, /Add to current Annotation File/);
  assert.match(source, /phaseImportWorkspacePreview/);
  assert.match(source, /importGeoJson\s*=/);
});

test("Import workspace supports source class mapping and custom names", () => {
  assert.match(source, /Class mapping/);
  assert.match(source, /Keep source name/);
  assert.match(source, /Custom class/);
  assert.match(source, /phaseImportWorkspaceCollectMapping/);
});

test("New-file import asks for Role and Source and saves metadata", () => {
  assert.match(source, /phaseImportRole/);
  assert.match(source, /phaseImportSource/);
  assert.match(source, /phaseEvalSaveFileMetadata/);
  assert.match(source, /sourceType/);
});

test("Add-current import appends without replacing existing annotations", () => {
  assert.match(
    source,
    /featureCollection\.features\s*=\s*\[\s*\.\.\.featureCollection\.features,\s*\.\.\.mapped/
  );
  assert.match(source, /pushUndo\(\)/);
});

test("Imported coordinates are not scaled", () => {
  assert.match(source, /Coordinates are never rescaled/);
  assert.doesNotMatch(source, /geometry\.coordinates\s*=\s*.*scale/);
});


test("Model/ANet exports are recognized as source classes", () => {
  assert.match(source, /properties\.anet_class_label/);
  assert.match(source, /properties\.model_label/);
  assert.match(source, /model_class_id/);
  assert.match(source, /type_prob/);
  assert.match(source, /anet_image_uuid/);
});

test("Model export properties.id is accepted as provenance id", () => {
  assert.match(source, /original\?\.properties\?\.id/);
});

test("Typed custom classes become real HistoAnnotator classes", () => {
  assert.match(source, /classes\.push/);
  assert.match(source, /syncClassesToServer/);
  assert.match(source, /renderClassButtons/);
});

test("external model properties survive normalization", () => {
  assert.match(
    source,
    /phaseImportWorkspaceNormalizeExternalCollection/
  );
  assert.match(
    source,
    /\.\.\.sourceProperties/
  );
  assert.match(
    source,
    /properties\.anet_class_label/
  );
  assert.match(
    source,
    /properties\.model_label/
  );
});

test("GeoJSON import supports optional X/Y offsets", () => {
  assert.match(source, /phaseImportOffsetX/);
  assert.match(source, /phaseImportOffsetY/);
  assert.match(source, /phaseImportWorkspaceOffsetGeometry/);
  assert.match(source, /appliedOffset/);
});

test("GeoJSON preview can render over the current WSI thumbnail", () => {
  assert.match(source, /phaseImportWorkspaceLoadThumbnail/);
  assert.match(source, /phaseReportFetchRegion/);
  assert.match(source, /thumbnailDataUrl/);
});
