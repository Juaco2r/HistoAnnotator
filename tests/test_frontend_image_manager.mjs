import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const source = fs.readFileSync(
  path.join(root, "app/static/frontend/88_image_manager.part.js"),
  "utf8",
);
const index = fs.readFileSync(
  path.join(root, "app/static/index.html"),
  "utf8",
);
const build = fs.readFileSync(
  path.join(root, "scripts/build_frontend_bundle.py"),
  "utf8",
);

test("Image Manager is key-gated and key stays in memory", () => {
  assert.match(source, /phaseImageManagerAdminKey/);
  assert.match(source, /image-manager\/\$\{action\}/);
  assert.match(source, /phaseImageManagerJsonRequest\(\s*"unlock"/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*phaseImageManagerAdminKey/);
});

test("Image Manager supports multi-image upload", () => {
  assert.match(source, /id="phaseImageManagerUpload"/);
  assert.match(source, /\bmultiple\b/);
  assert.match(source, /phaseImageManagerUploadFiles/);
  assert.match(source, /uploadImage\s*\(/);
});

test("Image Manager supports rename delete and full export", () => {
  assert.match(source, /image-manager\/\$\{action\}/);
  assert.match(source, /"rename"/);
  assert.match(source, /"delete"/);
  assert.match(source, /image-manager\/export/);
});

test("legacy unprotected upload UI is hidden", () => {
  assert.match(source, /file-input-label/);
  assert.match(source, /legacyUpload\.hidden/);
  assert.match(index, /id="uploadInput"/);
});

test("display aliases are applied to the existing image picker without changing IDs", () => {
  assert.match(source, /phaseImageManagerDisplayPath/);
  assert.match(source, /phaseImageManagerApplyAliasesToPicker/);
  assert.match(source, /option\.textContent\.replace/);
});

test("report documents are mirrored to the server for backup", () => {
  assert.match(source, /phaseImageManagerSyncReportDocument/);
  assert.match(source, /phaseImageManagerOriginalReportSave/);
  assert.match(source, /phaseImageManagerSyncAllLocalReports/);
});

test("frontend bundle includes Image Manager part", () => {
  assert.match(build, /88_image_manager\.part\.js/);
});
