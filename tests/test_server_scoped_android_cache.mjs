import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  "app/static/frontend/00_runtime_state.part.js",
  "utf8",
);

const viewer = fs.readFileSync(
  "app/static/frontend/10_viewer_display_storage.part.js",
  "utf8",
);

const html = fs.readFileSync(
  "app/static/index.html",
  "utf8",
);

test("offline packages carry server identity", () => {
  assert.match(
    runtime,
    /offlineRecordServerKey/,
  );

  assert.match(
    runtime,
    /serverKey,/,
  );

  assert.match(
    runtime,
    /originServer:/,
  );
});

test("pending drafts sync only to origin server", () => {
  assert.match(
    runtime,
    /record\.serverKey\s*===\s*activeDraftServerKey/,
  );

  assert.match(
    runtime,
    /serverKey:\s*serverKeyForImage\(image\)/,
  );
});

test("legacy drafts are not silently sent to a server", () => {
  assert.match(
    runtime,
    /Boolean\(\s*record\?\.serverKey\s*\)/,
  );

  assert.match(
    runtime,
    /LEGACY_SERVER_KEY/,
  );
});

test("catalog and image metadata are server scoped", () => {
  assert.match(
    runtime,
    /catalogMetaKey/,
  );

  assert.match(
    runtime,
    /serverMetaKey/,
  );

  assert.match(
    viewer,
    /serverMetaKey/,
  );
});

test("local mode retains source server for cached tiles", () => {
  assert.match(
    viewer,
    /viewerApiBaseForImage/,
  );

  assert.match(
    viewer,
    /sourceApi/,
  );
});

test("local mode does not fall back to network", () => {
  assert.match(
    viewer,
    /Tile is not available in the local offline cache/,
  );
});

test("duplicate image ids can coexist in Local Offline", () => {
  assert.match(
    runtime,
    /localImageIdentity/,
  );

  assert.match(
    runtime,
    /imageSelectionValue/,
  );

  assert.match(
    viewer,
    /requestedServerKey/,
  );
});

test("Connection UI exposes Local Offline mode", () => {
  assert.match(
    html,
    />Local \/ Offline<\/button>/,
  );
});
