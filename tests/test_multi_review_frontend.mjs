import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync('app/static/multi_review.html', 'utf8');
const launcher = fs.readFileSync('app/static/multi_review_launcher.js', 'utf8');

test('multi review exposes 2-3 GeoJSON setup, blind/labelled and consensus', () => {
  assert.match(html, /Annotation GeoJSON 3 \(optional\)/);
  assert.match(html, /Blind review/);
  assert.match(html, /Labelled review/);
  assert.match(html, /Generate consensus candidate/);
});

test('multi review contains split and overlay visualization controls', () => {
  assert.match(html, /Split view/);
  assert.match(html, /Overlay view/);
  assert.match(html, /showAllBtn/);
  assert.match(html, /showNoneBtn/);
});

test('multi review persists preferred, challenging, defer, edit and finalization actions', () => {
  assert.match(html, /selectedCandidate/);
  assert.match(html, /Challenging/);
  assert.match(html, /Leave for end/);
  assert.match(html, /Edit selected/);
  assert.match(html, /Accept & next/);
  assert.match(html, /finalize/);
});

test('launcher opens standalone review workspace', () => {
  assert.match(launcher, /multiReviewLauncher/);
  assert.match(launcher, /\/static\/multi_review\.html/);
});
