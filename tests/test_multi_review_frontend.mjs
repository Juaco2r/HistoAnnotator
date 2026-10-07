import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync('app/static/multi_review.html', 'utf8');
const launcher = fs.readFileSync('app/static/multi_review_launcher.js', 'utf8');

test('setup uses stored annotation dropdowns with optional external upload', () => {
  assert.match(html, /id="source1"/);
  assert.match(html, /id="source2"/);
  assert.match(html, /id="source3"/);
  assert.match(html, /Upload additional GeoJSON/);
  assert.match(html, /available-annotations/);
  assert.match(html, /storedPath/);
});

test('review UI is English and exposes blind labelled and consensus modes', () => {
  assert.match(html, /Multi-annotator Review/);
  assert.match(html, /Blind review/);
  assert.match(html, /Labelled review/);
  assert.match(html, /Generate consensus candidate/);
  assert.match(html, /Challenging/);
  assert.match(html, /Leave for end/);
  assert.doesNotMatch(html, /Revisi[oó]n|Anotaci[oó]n|Subir|Configuraci[oó]n/i);
});

test('multi review contains split and overlay visualization controls', () => {
  assert.match(html, /Split view/);
  assert.match(html, /Overlay view/);
  assert.match(html, /showAllBtn/);
  assert.match(html, /showNoneBtn/);
});

test('launcher integrates into settings gear instead of floating button', () => {
  assert.match(launcher, /multiReviewSettingsEntry/);
  assert.match(launcher, /Multi-annotator Review/);
  assert.match(launcher, /looksLikeSettingsTrigger/);
  assert.match(launcher, /findSettingsSurface/);
  assert.match(launcher, /\/static\/multi_review\.html/);
  assert.doesNotMatch(launcher, /position\s*[:=]\s*['"]fixed/);
});
