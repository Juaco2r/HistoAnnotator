import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync('app/static/multi_review.html', 'utf8');
const launcher = fs.readFileSync('app/static/multi_review_launcher.js', 'utf8');

test('all three candidates use the native HistoAnnotator annotation-file catalog', () => {
  assert.match(html, /id="source1"/);
  assert.match(html, /id="source2"/);
  assert.match(html, /id="source3"/);
  assert.match(html, /\/api\/annotations\/\$\{encodeURIComponent\(imageId\)\}\/files/);
  assert.match(html, /\/api\/annotations\/\$\{encodeURIComponent\(imageId\)\}\?file=/);
  assert.match(html, /Upload additional GeoJSON/);
  assert.doesNotMatch(html, /available-annotations/);
  assert.doesNotMatch(html, /storedPath/);
});

test('annotation 3 is optional but has the same stored annotation choices', () => {
  assert.match(html, /Annotation 3 \(optional\)/);
  assert.match(html, /for\(let i=1;i<=3;i\+\+\)/);
  assert.match(html, /files\.forEach\(name=>addOption\(select,`server:\$\{name\}`,name\)\)/);
});

test('review UI remains English with blind labelled consensus split and overlay', () => {
  assert.match(html, /Multi-annotator Review/);
  assert.match(html, /Blind review/);
  assert.match(html, /Labelled review/);
  assert.match(html, /Generate consensus candidate/);
  assert.match(html, /Split view/);
  assert.match(html, /Overlay view/);
  assert.match(html, /Challenging/);
  assert.match(html, /Leave for end/);
  assert.doesNotMatch(html, /Revisi[oó]n|Anotaci[oó]n|Subir|Configuraci[oó]n/i);
});

test('launcher is injected beside Image Manager inside Additional Tools', () => {
  assert.match(launcher, /multiReviewAdditionalToolEntry/);
  assert.match(launcher, /phase-additional-tool-label/);
  assert.match(launcher, /Image Manager/);
  assert.match(launcher, /Additional Tools/);
  assert.match(launcher, /insertAdjacentElement\('afterend'/);
  assert.match(launcher, /Multi-annotator Review/);
  assert.doesNotMatch(launcher, /looksLikeSettingsTrigger|findSettingsSurface|multiReviewSettingsEntry/);
});
