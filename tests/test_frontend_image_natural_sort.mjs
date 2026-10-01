import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manager = fs.readFileSync(
  "app/static/frontend/88_image_manager.part.js",
  "utf8",
);

test("image picker uses natural alphanumeric ordering", () => {
  assert.match(
    manager,
    /function phaseImageManagerSortPickerOptions\(\)/,
  );
  assert.match(
    manager,
    /new Intl\.Collator/,
  );
  assert.match(
    manager,
    /numeric:\s*true/,
  );
  assert.match(
    manager,
    /sensitivity:\s*"base"/,
  );
});

test("picker is sorted after aliases are applied", () => {
  assert.match(
    manager,
    /phaseImageManagerApplyAliasesToPicker\(\);\s*phaseImageManagerSortPickerOptions\(\);/,
  );
});

test("natural numeric ordering behaves as expected", () => {
  const collator = new Intl.Collator(
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  const values = [
    "Image 10",
    "image 2",
    "Image 1",
    "ABC 11",
    "ABC 3",
  ];

  values.sort(collator.compare);

  assert.deepEqual(
    values,
    [
      "ABC 3",
      "ABC 11",
      "Image 1",
      "image 2",
      "Image 10",
    ],
  );
});
