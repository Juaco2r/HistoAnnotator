import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL(
    '../app/static/frontend/86_detailed_il_refinements.part.js',
    import.meta.url,
  ),
  'utf8',
);

test('Detailed Open line is a freehand pen-up LineString workflow', () => {
  assert.match(
    source,
    /phaseDetailedFreehandPointerId/,
  );
  assert.match(
    source,
    /getCoalescedEvents/,
  );
  assert.match(
    source,
    /prepareOpenStroke/,
  );
  assert.match(
    source,
    /phaseDetailedRefinementHandlePointerUp/,
  );
  assert.match(
    source,
    /phaseDetailedCommit\([\s\S]*type:\s*"LineString"[\s\S]*"open-line"/,
  );
});

test('Detailed selection restores measurement information', () => {
  assert.match(
    source,
    /phaseDetailedSelectionMeasurement/,
  );
  assert.match(
    source,
    /Straight line/,
  );
  assert.match(
    source,
    /phaseDetailedFormatLength/,
  );
  assert.match(
    source,
    /phaseDetailedRefinementSetSingleSelection/,
  );
});

test('Interactive Learning draws only the current temporary suggestion', () => {
  assert.match(
    source,
    /phaseILRefinementDrawCurrentSuggestionOnly/,
  );
  assert.match(
    source,
    /phaseIL1State[\s\S]*\.suggestions\[index\]/,
  );
  assert.match(
    source,
    /phaseIL22SuggestionOverlayVisible/,
  );
});

test('Interactive Learning isolates normal annotations during suggestion review', () => {
  assert.match(
    source,
    /phaseILRefinementHasCurrentSuggestion/,
  );
  assert.match(
    source,
    /phaseDIsAnnotationFeature/,
  );
  assert.match(
    source,
    /phaseIL21EditSession/,
  );
  assert.match(
    source,
    /featureId\(feature\)/,
  );
});

test('Interactive Learning repairs stale edit sessions for Edit and Hide', () => {
  assert.match(
    source,
    /phaseILRefinementRepairStaleEditSession/,
  );
  assert.match(
    source,
    /phaseILRefinementStartEdit/,
  );
  assert.match(
    source,
    /phaseILRefinementToggleSuggestionOverlay/,
  );
  assert.match(
    source,
    /phaseILRefinementDropEditSession/,
  );
});

test('Pathologist collision-safe position also applies to live IL edits', () => {
  assert.match(
    source,
    /phaseILRefinementEditSessionIsLive/,
  );
  assert.match(
    source,
    /classList\.toggle\([\s\S]*"review-safe"/,
  );
  assert.match(
    source,
    /phaseILRefinementSetEditingUi/,
  );
});
