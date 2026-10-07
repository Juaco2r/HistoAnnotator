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
});

test('labelled review requires a password without hardcoding it in the frontend', () => {
  assert.match(html, /id="labelledPassword" type="password"/);
  assert.match(html, /authorize-labelled/);
  assert.match(html, /X-Histo-Admin-Key/);
  assert.doesNotMatch(html, /12345/);
});

test('candidates are numbered and keyboard shortcuts 1 through 4 select them', () => {
  assert.match(html, /Candidate \$\{number\}/);
  assert.match(html, /\^\[1-4\]\$/);
  assert.match(html, /selectPreferred\(candidate\.key\)/);
  assert.doesNotMatch(html, /Candidate \$\{c\.key\}/);
});

test('consensus is not identified as Consensus in user-facing candidate labels', () => {
  assert.match(html, /candidate\?\.key==='CONSENSUS'/);
  assert.match(html, /return `Candidate \$\{number\}`/);
});

test('overlay recreates its viewer and refits to current item', () => {
  assert.match(html, /async function renderOverlay\(fitToItem=true\)/);
  assert.match(html, /state\.overlayViewer\.destroy\(\)/);
  assert.match(html, /querySelectorAll\(':scope > \.overlay-svg'\)/);
  assert.match(html, /fitViewerToItem\(state\.overlayViewer\)/);
  assert.match(html, /async function enterEdit\(\)/);
  assert.match(html, /await renderCurrentView\(true\)/);
});

test('resuming a session defaults to split view and refits the current item', () => {
  assert.match(html, /state\.viewMode='split'/);
  assert.match(html, /await renderCurrentView\(true\)/);
  assert.match(html, /\*0\.12\+8/);
});

test('saved review sessions can be closed and reopened without deleting progress', () => {
  assert.match(html, /data-close-session/);
  assert.match(html, /data-reopen-session/);
  assert.match(html, /\/close`/);
  assert.match(html, /\/reopen`/);
  assert.match(html, /Progress and files will be kept/);
});

test('launcher remains inside Additional Tools beside Image Manager', () => {
  assert.match(launcher, /phase-additional-tool-label/);
  assert.match(launcher, /Image Manager/);
  assert.match(launcher, /Additional Tools/);
  assert.match(launcher, /Multi-annotator Review/);
});


test('Enter accepts the selected candidate and advances to the next item', () => {
  assert.match(html, /event\.key==='Enter'/);
  assert.match(html, /!state\.selectedKey\|\|\$\('acceptBtn'\)\.disabled/);
  assert.match(html, /acceptCurrent\(\)/);
  assert.match(html, /Accept & next <span class="kbd">Enter<\/span>/);
});
