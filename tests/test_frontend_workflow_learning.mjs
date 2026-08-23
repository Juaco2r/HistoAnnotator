import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeContext,
  install,
  readConst,
  plain,
  source,
} from './frontend_contract_harness.mjs';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    dump() { return Object.fromEntries(data); },
  };
}

test('protocol and shortcut storage keys are frozen', () => {
  assert.equal(readConst('PHASE_F24_PROTOCOL_STORAGE_KEY'), 'histoannotator.analysisProtocols.v1');
  assert.equal(readConst('PHASE_F24_ACTIVE_PROTOCOL_KEY'), 'histoannotator.analysisProtocols.v1.activeId');
  assert.equal(readConst('PHASE_B_SHORTCUT_STORAGE'), 'histoannotator.shortcuts.v1');
});

test('protocol reader keeps only schemaVersion 1 entries with a pipeline', () => {
  const localStorage = fakeStorage({
    'histoannotator.analysisProtocols.v1': JSON.stringify([
      { id: 'ok', schemaVersion: 1, pipeline: {} },
      { id: 'old', schemaVersion: 0, pipeline: {} },
      { id: 'missing-pipeline', schemaVersion: 1 },
      null,
    ]),
  });
  const ctx = makeContext({ localStorage, PHASE_F24_PROTOCOL_STORAGE_KEY: 'histoannotator.analysisProtocols.v1' });
  install(ctx, 'phaseF24ReadProtocols');
  assert.deepEqual(plain(ctx.phaseF24ReadProtocols()).map((x) => x.id), ['ok']);
});

test('stable protocol stringify recursively sorts object keys', () => {
  const ctx = makeContext();
  install(ctx, 'phaseF24StableValue', 'phaseF24StableStringify');
  assert.equal(
    ctx.phaseF24StableStringify({ z: 1, a: { d: 4, c: 3 }, b: [{ y: 2, x: 1 }] }),
    '{"a":{"c":3,"d":4},"b":[{"x":1,"y":2}],"z":1}',
  );
});

test('protocol pipeline hash fallback is deterministic', async () => {
  const ctx = makeContext({ window: { crypto: null } });
  install(ctx, 'phaseF24StableValue', 'phaseF24StableStringify', 'phaseF24HashPipeline');
  const value = { z: 1, a: { d: 4, c: 3 }, b: [{ y: 2, x: 1 }] };
  assert.equal(await ctx.phaseF24HashPipeline(value), 'fnv1a-af7d5385');
  assert.equal(await ctx.phaseF24HashPipeline(value), 'fnv1a-af7d5385');
});

test('protocol stage aliases map to the current three pipeline stages', () => {
  const ctx = makeContext();
  install(ctx, 'phaseF24StageKey');
  assert.equal(ctx.phaseF24StageKey('roi'), 'tissueRoi');
  assert.equal(ctx.phaseF24StageKey('tissue-roi'), 'tissueRoi');
  assert.equal(ctx.phaseF24StageKey('anthracosis'), 'anthracosis');
  assert.equal(ctx.phaseF24StageKey('positive'), 'hdab');
  assert.equal(ctx.phaseF24StageKey('hdab'), 'hdab');
  assert.equal(ctx.phaseF24StageKey('other'), null);
});

test('protocol metadata snapshot is attached only when current settings exactly match', () => {
  const protocol = {
    id: 'p1', familyId: 'fam', name: 'Proto', version: 2, hash: 'abc', schemaVersion: 1,
    appVersion: '1.4', pipeline: { hdab: { thresholdMode: 'auto_otsu', tileSize: 1024 } },
  };
  const ctx = makeContext({
    phaseF24ActiveProtocol: () => protocol,
    phaseF24CurrentStageSettings: () => ({ tileSize: 1024, thresholdMode: 'auto_otsu' }),
    deepClone: globalThis.structuredClone,
  });
  install(ctx, 'phaseF24StableValue', 'phaseF24StableStringify', 'phaseF24StageKey', 'phaseF24ProtocolSnapshotForMetadata');
  const snap = plain(ctx.phaseF24ProtocolSnapshotForMetadata('positive'));
  assert.equal(snap.protocolId, 'p1');
  assert.equal(snap.stage, 'hdab');
  assert.deepEqual(snap.settings, { thresholdMode: 'auto_otsu', tileSize: 1024 });
  ctx.phaseF24CurrentStageSettings = () => ({ thresholdMode: 'manual', tileSize: 1024 });
  assert.equal(ctx.phaseF24ProtocolSnapshotForMetadata('hdab'), null);
});

test('H-DAB protocol physical/pixel units must match current calibration mode', () => {
  const protocolPhysical = { pipeline: { hdab: {
    gaussianSmoothing: { enabled: true, unit: 'um' },
    smallPositiveObjectFilter: { enabled: true, unit: 'um2' },
  } } };
  const ctx = makeContext({ phaseF22Mpp: () => 0.5 });
  install(ctx, 'phaseF24HdabUnitsCompatible');
  assert.equal(ctx.phaseF24HdabUnitsCompatible(protocolPhysical), true);
  ctx.phaseF22Mpp = () => null;
  assert.equal(ctx.phaseF24HdabUnitsCompatible(protocolPhysical), false);
  const protocolPixels = { pipeline: { hdab: {
    gaussianSmoothing: { enabled: true, unit: 'px' },
    smallPositiveObjectFilter: { enabled: true, unit: 'px2' },
  } } };
  assert.equal(ctx.phaseF24HdabUnitsCompatible(protocolPixels), true);
  ctx.phaseF22Mpp = () => 0.5;
  assert.equal(ctx.phaseF24HdabUnitsCompatible(protocolPixels), false);
});

test('batch annotation names sanitize accents, symbols and empty values', () => {
  const ctx = makeContext();
  install(ctx, 'phaseF25SafeAnnotationName', 'phaseF25DefaultTargetName');
  assert.equal(ctx.phaseF25SafeAnnotationName('  Tést / A:B?  '), 'Test _ A_B_');
  assert.equal(ctx.phaseF25SafeAnnotationName(''), 'Batch');
  assert.equal(ctx.phaseF25DefaultTargetName({ name: 'H-DAB / Lung', version: 3 }), 'Batch - H-DAB _ Lung v3');
});

test('batch source clone removes ROI, Anthracosis and automatic H-DAB Positive only', () => {
  const fc = { type: 'FeatureCollection', features: [
    { id: 'roi', properties: { classification: { name: 'Tissue' }, histoannotator: { role: 'roi', roi: { kind: 'tissue' } } } },
    { id: 'anth', properties: { classification: { name: 'Anthracosis' }, histoannotator: { role: 'annotation' } } },
    { id: 'auto-pos', properties: { classification: { name: 'Positive' }, histoannotator: { role: 'annotation', autoDetection: { type: 'hdab-positive' } } } },
    { id: 'manual-pos', properties: { classification: { name: 'Positive' }, histoannotator: { role: 'annotation' } } },
    { id: 'artifact', properties: { classification: { name: 'Artifact' }, histoannotator: { role: 'artifact' } } },
    { id: 'tumor', properties: { classification: { name: 'Tumor' }, histoannotator: { role: 'annotation' } } },
  ] };
  const ctx = makeContext({
    normalizeFeatureCollectionClient: (value) => value,
    deepClone: globalThis.structuredClone,
  });
  install(ctx, 'phaseF25SourceCloneForBatch');
  const result = plain(ctx.phaseF25SourceCloneForBatch(fc));
  assert.deepEqual(result.collection.features.map((f) => f.id), ['manual-pos', 'artifact', 'tumor']);
  assert.deepEqual(result.removed, { tissueRoi: 1, anthracosis: 1, automaticPositive: 1 });
});

test('batch source clone also recognizes quantitative H-DAB auto method', () => {
  const fc = { type: 'FeatureCollection', features: [
    { id: 'auto-pos', properties: { classification: { name: 'Positive' }, histoannotator: { autoDetection: { method: 'quantitative-hdab-native-v2' } } } },
  ] };
  const ctx = makeContext({ normalizeFeatureCollectionClient: (x) => x, deepClone: globalThis.structuredClone });
  install(ctx, 'phaseF25SourceCloneForBatch');
  const result = plain(ctx.phaseF25SourceCloneForBatch(fc));
  assert.equal(result.collection.features.length, 0);
  assert.equal(result.removed.automaticPositive, 1);
});

test('batch protocol runner preserves Tissue -> Anthracosis -> H-DAB order', async () => {
  const calls = [];
  const ctx = makeContext({
    phaseF241ProtocolCanRun: () => true,
    els: { phaseF24ProtocolSelect: { value: '' } },
    phaseF24SetActiveProtocolId: (id) => calls.push(`active:${id}`),
    phaseF241CancelRequested: true,
    phaseF24ApplyProtocol: () => calls.push('apply'),
    phaseF241RunTissueRoiStage: async () => calls.push('tissue'),
    phaseF241RunAnthracosisStage: async () => calls.push('anthracosis'),
    phaseF241RunHdabStage: async () => calls.push('hdab'),
  });
  install(ctx, 'phaseF25RunProtocolOnCurrentImage');
  await ctx.phaseF25RunProtocolOnCurrentImage({ id: 'p1' });
  assert.deepEqual(calls, ['active:p1', 'apply', 'tissue', 'anthracosis', 'hdab']);
  assert.equal(ctx.phaseF241CancelRequested, false);
});

test('batch cancellation is after-current only and does nothing when idle', () => {
  const messages = [];
  const ctx = makeContext({ phaseF25BatchBusy: false, phaseF25CancelAfterCurrent: false, phaseF25SetProgress: (m) => messages.push(m) });
  install(ctx, 'phaseF25CancelBatch');
  ctx.phaseF25CancelBatch();
  assert.equal(ctx.phaseF25CancelAfterCurrent, false);
  ctx.phaseF25BatchBusy = true;
  ctx.phaseF25CancelBatch();
  assert.equal(ctx.phaseF25CancelAfterCurrent, true);
  assert.match(messages.at(-1), /current image will finish and be saved/i);
});

test('batch source/result safety promise remains explicit in production source', () => {
  assert.match(source, /Source annotations will not be modified/);
  assert.match(source, /fresh source copy before the /);
  assert.match(source, /protocol is rerun\./);
  assert.match(source, /Source and Batch result annotation files must be different/);
});

test('shortcut defaults remain 1-8, Z/X/C/V, Escape and Enter', () => {
  const actions = readConst('PHASE_B_SHORTCUT_ACTIONS');
  const map = Object.fromEntries(actions.map((a) => [a.id, a.defaultKey]));
  assert.deepEqual(map, {
    'tool.navigate': '1', 'tool.freehand': '2', 'tool.brush': '3', 'tool.polygon': '4',
    'tool.rectangle': '5', 'tool.circle': '6', 'tool.wand': '7', 'tool.select': '8',
    'review.correct': 'Z', 'review.maybe': 'X', 'review.later': 'C', 'review.delete': 'V',
    'general.escape': 'Escape', 'polygon.finish': 'Enter', 'focus.toggle': '',
  });
});

test('shortcut key normalization preserves modifier semantics', () => {
  const ctx = makeContext();
  install(ctx, 'phaseBNormalizeKey');
  assert.equal(ctx.phaseBNormalizeKey({ key: 'z' }), 'Z');
  assert.equal(ctx.phaseBNormalizeKey({ key: 'Esc' }), 'Escape');
  assert.equal(ctx.phaseBNormalizeKey({ key: ' ', ctrlKey: true }), 'Ctrl+Space');
  assert.equal(ctx.phaseBNormalizeKey({ key: 'ArrowLeft', shiftKey: true }), 'Shift+ArrowLeft');
});

test('saved shortcuts override only known action ids and malformed storage falls back', () => {
  const actions = readConst('PHASE_B_SHORTCUT_ACTIONS');
  const key = readConst('PHASE_B_SHORTCUT_STORAGE');
  let storage = fakeStorage({ [key]: JSON.stringify({ 'review.correct': 'Q', unknown: 'P' }) });
  let ctx = makeContext({ localStorage: storage, PHASE_B_SHORTCUT_ACTIONS: actions, PHASE_B_SHORTCUT_STORAGE: key });
  install(ctx, 'phaseBShortcutDefaults', 'phaseBLoadShortcutBindings');
  let bindings = plain(ctx.phaseBLoadShortcutBindings());
  assert.equal(bindings['review.correct'], 'Q');
  assert.equal(bindings['review.maybe'], 'X');
  assert.equal(bindings.unknown, undefined);
  storage = fakeStorage({ [key]: '{bad-json' });
  ctx = makeContext({ localStorage: storage, PHASE_B_SHORTCUT_ACTIONS: actions, PHASE_B_SHORTCUT_STORAGE: key });
  install(ctx, 'phaseBShortcutDefaults', 'phaseBLoadShortcutBindings');
  bindings = plain(ctx.phaseBLoadShortcutBindings());
  assert.equal(bindings['review.correct'], 'Z');
});

test('Focus Mode toggles body/UI state and schedules a redraw', () => {
  const toggles = [];
  const controls = { hidden: true };
  const menu = { textContent: '' };
  const ctx = makeContext({
    phaseBFocusActive: false,
    phaseBRefs: () => ({ focusControls: controls, focusMenuButton: menu }),
    document: { body: { classList: { toggle: (name, value) => toggles.push([name, value]) } } },
    phaseBToggleSettings() {}, phaseBSetFocusClassesOpen() {}, phaseBRenderFocusClasses() {}, updatePathologistActions() {},
    requestAnimationFrame: (fn) => fn(),
    window: { dispatchEvent() {} }, Event: class Event { constructor(type) { this.type = type; } },
    drawAnnotations: () => toggles.push(['draw', true]),
  });
  install(ctx, 'phaseBSetFocusMode');
  ctx.phaseBSetFocusMode(true);
  assert.equal(ctx.phaseBFocusActive, true);
  assert.equal(controls.hidden, false);
  assert.equal(menu.textContent, 'Exit Focus Mode');
  assert.deepEqual(toggles[0], ['phase-b-focus-mode', true]);
  assert.deepEqual(toggles.at(-1), ['draw', true]);
});

test('Review status maps workflow decisions and excludes non-annotation features', () => {
  const ctx = makeContext({
    phaseDIsAnnotationFeature: (feature) => feature.kind !== 'roi',
    phaseCWorkflowForFeature: (feature) => feature.workflow || {},
    phaseCCanonicalDecision: (value) => ['correct', 'maybe', 'later'].includes(value) ? value : null,
  });
  install(ctx, 'reviewStatus');
  assert.equal(ctx.reviewStatus({ kind: 'roi' }), 'excluded');
  assert.equal(ctx.reviewStatus({ workflow: { reviewDecision: 'maybe' } }), 'maybe');
  assert.equal(ctx.reviewStatus({ workflow: { reviewDecision: null } }), 'pending');
});

test('Interactive Learning model ids normalize to A/B/C with stable labels', () => {
  const ctx = makeContext();
  install(ctx, 'phaseIL92NormalizeLearningModel', 'phaseIL92LearningModelLabel');
  assert.equal(ctx.phaseIL92NormalizeLearningModel('b'), 'B');
  assert.equal(ctx.phaseIL92NormalizeLearningModel('invalid'), 'A');
  assert.equal(ctx.phaseIL92LearningModelLabel('A'), 'Classical');
  assert.equal(ctx.phaseIL92LearningModelLabel('B'), 'Deep Features');
  assert.equal(ctx.phaseIL92LearningModelLabel('C'), 'Deep Spatial');
});

test('IL training-source signature is order-independent in set mode', () => {
  const ctx = makeContext();
  install(ctx, 'phaseIL7SourceSignature');
  const a = [
    { imageId: 'b', annotationFile: 'Two' },
    { imageId: 'a', annotationFile: 'Default' },
  ];
  assert.equal(ctx.phaseIL7SourceSignature('current', a), 'current');
  assert.equal(ctx.phaseIL7SourceSignature('set', a), 'set:a::Default|b::Two');
  assert.equal(ctx.phaseIL7SourceSignature('set', [...a].reverse()), 'set:a::Default|b::Two');
});

test('IL history retains only the 12 most recent rounds', () => {
  const localStorage = fakeStorage();
  const ctx = makeContext({ localStorage });
  install(ctx, 'phaseIL7WriteHistory', 'phaseIL7ReadHistory');
  const values = Array.from({ length: 15 }, (_, i) => ({ round: i + 1 }));
  ctx.phaseIL7WriteHistory('k', values);
  const read = plain(ctx.phaseIL7ReadHistory('k'));
  assert.equal(read.length, 12);
  assert.equal(read[0].round, 4);
  assert.equal(read.at(-1).round, 15);
});

test('IL feedback delta separates clean accepts from reviewer corrections', () => {
  const ctx = makeContext();
  install(ctx, 'phaseIL7FeedbackDelta');
  const delta = plain(ctx.phaseIL7FeedbackDelta(
    { accepted: 10, rejected: 3, edited: 2, reclassified: 1 },
    { accepted: 4, rejected: 1, edited: 1, reclassified: 0 },
  ));
  assert.deepEqual(delta, {
    accepted: 6, rejected: 2, edited: 1, reclassified: 1,
    cleanAccepted: 5, corrections: 4, reviewed: 9, correctionRate: 4 / 9,
  });
});

test('IL suggestion priority weights uncertainty at 80 percent and area at 20 percent', () => {
  const ctx = makeContext();
  install(ctx, 'phaseIL3Clamp01', 'phaseIL3SuggestionPriority');
  const uncertain = plain(ctx.phaseIL3SuggestionPriority({ confidence: 0.5, areaPx2: 100 }, 100));
  const certain = plain(ctx.phaseIL3SuggestionPriority({ confidence: 1.0, areaPx2: 100 }, 100));
  assert.equal(uncertain.uncertainty, 1);
  assert.equal(uncertain.areaScore, 1);
  assert.equal(uncertain.priority, 1);
  assert.equal(certain.uncertainty, 0);
  assert.equal(certain.priority, 0.2);
});

test('IL evaluation storage key freezes image/file/class/model/source identity', () => {
  const ctx = makeContext({ PHASE_IL9_HISTORY_PREFIX: 'histoannotator.il9.evaluation.v2::' });
  install(ctx, 'phaseIL92NormalizeLearningModel', 'phaseIL9StorageKey');
  const key = ctx.phaseIL9StorageKey({
    imageId: 'folder/img.tif', annotationFile: 'Review 1', targetClass: 'Tumor',
    learningModel: 'c', sourceSignature: 'set:a::Default|b::Two',
  });
  assert.equal(
    key,
    'histoannotator.il9.evaluation.v2::' + encodeURIComponent('folder/img.tif||Review 1||tumor||C||set:a::Default|b::Two'),
  );
});

test('IL round/session metrics freeze accepted, corrected and stable-round semantics', () => {
  const ctx = makeContext();
  install(ctx, 'phaseIL9RoundMetrics', 'phaseIL9SessionMetrics');
  const round1 = {
    round: 1,
    decisions: {
      a: { decision: 'accepted' },
      b: { decision: 'accepted', edited: true },
      c: { decision: 'rejected' },
      d: { decision: 'reclassified' },
    },
    laterIds: ['x', 'x', 'y'],
    stabilityState: 'learning',
  };
  const m = plain(ctx.phaseIL9RoundMetrics(round1));
  assert.deepEqual(m, {
    reviewed: 4, accepted: 1, rejected: 1, edited: 1, reclassified: 1,
    later: 2, corrections: 3, acceptanceRate: 0.25, correctionRate: 0.75,
    editRate: 0.25, reclassificationRate: 0.25,
  });
  const session = plain(ctx.phaseIL9SessionMetrics({ rounds: [round1, { round: 2, decisions: {}, laterIds: [], stabilityState: 'stable' }] }));
  assert.equal(session.rounds, 2);
  assert.equal(session.stableRound, 2);
  assert.equal(session.reviewed, 4);
  assert.equal(session.corrections, 3);
});

test('IL evaluation store caps history at 20 sessions and 60 rounds per session', () => {
  const localStorage = fakeStorage();
  const ctx = makeContext({ localStorage });
  install(ctx, 'phaseIL9WriteStore');
  const store = { sessions: Array.from({ length: 22 }, (_, s) => ({ id: `s${s}`, rounds: Array.from({ length: 65 }, (_, r) => ({ round: r + 1 })) })) };
  ctx.phaseIL9WriteStore('k', store);
  const saved = JSON.parse(localStorage.getItem('k'));
  assert.equal(saved.sessions.length, 20);
  assert.equal(saved.sessions[0].id, 's2');
  assert.equal(saved.sessions.every((s) => s.rounds.length === 60), true);
  assert.equal(saved.sessions[0].rounds[0].round, 6);
});
