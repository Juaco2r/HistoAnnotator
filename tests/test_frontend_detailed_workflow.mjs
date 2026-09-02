import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { install, makeContext } from './frontend_contract_harness.mjs';

test('Detailed length helper sums open-polyline pixel length', () => {
  const ctx = makeContext();
  install(ctx, 'phaseDetailedSegmentLengthPx', 'phaseDetailedLengthPx');
  assert.equal(ctx.phaseDetailedLengthPx([[0,0],[3,4],[6,8]]), 10);
});

test('Detailed point-to-segment distance supports line hit testing', () => {
  const ctx = makeContext();
  install(ctx, 'phaseDetailedDistancePointToSegment');
  assert.equal(ctx.phaseDetailedDistancePointToSegment([5,2],[0,0],[10,0]), 2);
});

test('Detailed source stores Point and LineString with measurements', () => {
  const source = fs.readFileSync(new URL('../app/static/frontend/85_detailed_additional_tools.part.js', import.meta.url), 'utf8');
  assert.match(source, /type:\s*"Point"/);
  assert.match(source, /type:\s*"LineString"/);
  assert.match(source, /Length µm/);
  assert.match(source, /histo\.detailed/);
});

test('Additional Tools contains shortcuts and connection settings', () => {
  const html = fs.readFileSync(new URL('../app/static/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="phaseAdditionalToolsOverlay"');
  assert.ok(start >= 0);
  const end = html.indexOf('</section>', start);
  const block = html.slice(start, end);
  assert.match(block, /id="phaseBShortcutsMenuButton"/);
  assert.match(block, /id="connectionSettingsButton"/);
  assert.match(block, /id="phaseAdditionalReferenceEvaluationButton"/);
});

test('Additional Tools DOM order and menu placement', () => {
  const html = fs.readFileSync(
    new URL(
      '../app/static/index.html',
      import.meta.url,
    ),
    'utf8',
  );

  const overlayPos =
    html.indexOf('id="phaseAdditionalToolsOverlay"');
  const appScriptPos =
    html.indexOf('<script src="./static/app.js');

  assert.ok(overlayPos >= 0);
  assert.ok(appScriptPos >= 0);
  assert.ok(
    overlayPos < appScriptPos,
    'Additional Tools modal must exist before app.js initializes',
  );

  const settingsIdPos =
    html.indexOf('id="phaseBSettingsPanel"');
  const launcherPos =
    html.indexOf(
      'id="phaseAdditionalToolsButton"',
      settingsIdPos,
    );
  const separatorPos =
    html.lastIndexOf(
      'phase-additional-tools-separator',
      launcherPos,
    );

  assert.ok(settingsIdPos >= 0);
  assert.ok(separatorPos > settingsIdPos);
  assert.ok(launcherPos > separatorPos);
});
