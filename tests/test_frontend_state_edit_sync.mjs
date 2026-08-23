import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readConst, makeContext, install, clone, plain, rectangle, createFakeDraftDb,
} from './frontend_contract_harness.mjs';

// -------------------------------------------------------------------------
// IndexedDB / draft identity and revision semantics
// -------------------------------------------------------------------------

test('frontend storage constants are frozen', () => {
  assert.equal(readConst('DB_NAME'), 'histoannotator-local-v1');
  assert.equal(readConst('DB_VERSION'), 2);
  assert.equal(readConst('DB_STORE'), 'drafts');
  assert.equal(readConst('DB_META'), 'meta');
  assert.equal(readConst('DB_OFFLINE'), 'offline');
});

test('openDraftDb requests the current DB version and creates the three stores', async () => {
  const created = [];
  let openArgs = null;
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore(name, options) { created.push([name, options]); },
  };
  const indexedDB = {
    open(name, version) {
      openArgs = [name, version];
      const req = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  const ctx = makeContext({
    DB_NAME: readConst('DB_NAME'), DB_VERSION: readConst('DB_VERSION'),
    DB_STORE: readConst('DB_STORE'), DB_META: readConst('DB_META'), DB_OFFLINE: readConst('DB_OFFLINE'),
    dbPromise: null, indexedDB, window: { indexedDB, structuredClone: globalThis.structuredClone },
  });
  install(ctx, 'openDraftDb');
  const result = await ctx.openDraftDb();
  assert.equal(result, db);
  assert.deepEqual(openArgs, ['histoannotator-local-v1', 2]);
  assert.deepEqual(plain(created), [
    ['drafts', { keyPath: 'imageId' }],
    ['meta', { keyPath: 'key' }],
    ['offline', { keyPath: 'key' }],
  ]);
});

test('localDraftKey keeps Default backward-compatible and namespaces named files', () => {
  const ctx = makeContext({ currentAnnotationFile: 'Default' });
  install(ctx, 'localDraftKey');
  assert.equal(ctx.localDraftKey('slide/a.svs', 'Default'), 'slide/a.svs');
  assert.equal(ctx.localDraftKey('slide/a.svs', 'Review'), 'slide/a.svs::Review');
  assert.equal(ctx.localDraftKey('slide/a.svs'), 'slide/a.svs');
});

test('restoreCurrentRevisionState preserves legacy pending fallback semantics', () => {
  const ctx = makeContext({ currentLocalRevision: 0, currentLastSyncedRevision: 0, currentPendingChangeCount: 0 });
  install(ctx, 'restoreCurrentRevisionState');
  ctx.restoreCurrentRevisionState({ pending: true, updatedAt: 1234 });
  assert.equal(ctx.currentLocalRevision, 1234);
  assert.equal(ctx.currentLastSyncedRevision, 0);
  assert.equal(ctx.currentPendingChangeCount, 1);

  ctx.restoreCurrentRevisionState({ localRevision: 9, lastSyncedRevision: 7, pendingChangeCount: 3, pending: true });
  assert.equal(ctx.currentLocalRevision, 9);
  assert.equal(ctx.currentLastSyncedRevision, 7);
  assert.equal(ctx.currentPendingChangeCount, 3);
});

test('nextLocalRevision is monotonic even when Date.now does not advance', () => {
  const ctx = makeContext({ currentLocalRevision: 100, Date: { now: () => 90 } });
  install(ctx, 'nextLocalRevision');
  assert.equal(ctx.nextLocalRevision(), 101);
  ctx.Date = { now: () => 500 };
  assert.equal(ctx.nextLocalRevision(), 500);
});

test('currentSyncPending excludes local-native documents', () => {
  const ctx = makeContext({ currentImage: { id: 'a', localNative: false }, currentLocalRevision: 5, currentLastSyncedRevision: 4 });
  install(ctx, 'currentSyncPending');
  assert.equal(ctx.currentSyncPending(), true);
  ctx.currentImage.localNative = true;
  assert.equal(ctx.currentSyncPending(), false);
  ctx.currentImage = null;
  assert.equal(ctx.currentSyncPending(), false);
});

test('putLocalDraft refuses to overwrite a newer durable revision', async () => {
  const { db, records, puts } = createFakeDraftDb([{ imageId: 'img', localRevision: 10, value: 'new' }]);
  const ctx = makeContext({ DB_STORE: 'drafts', openDraftDb: async () => db });
  install(ctx, 'putLocalDraft');
  assert.equal(await ctx.putLocalDraft({ imageId: 'img', localRevision: 9, value: 'old' }), true);
  assert.equal(records.get('img').value, 'new');
  assert.equal(puts.length, 0);
  assert.equal(await ctx.putLocalDraft({ imageId: 'img', localRevision: 11, value: 'newer' }), true);
  assert.equal(records.get('img').value, 'newer');
  assert.equal(puts.length, 1);
});

test('persistLocalDraft freezes named-file record shape and pending state', async () => {
  let captured = null;
  const ctx = makeContext({
    currentAnnotationFile: 'Default',
    currentImage: { id: 'img', name: 'Image', relativePath: 'folder/img.svs', localNative: false },
    featureCollection: { type: 'FeatureCollection', features: [{ id: 'a' }] },
    currentLocalRevision: 12,
    currentLastSyncedRevision: 8,
    currentPendingChangeCount: 4,
    localDraftState: '',
    updateDiagnostics() {},
    deepClone: clone,
    putLocalDraft: async (record) => { captured = record; return true; },
    Date: { now: () => 777 },
  });
  install(ctx, 'localDraftKey', 'persistLocalDraft');
  const saved = await ctx.persistLocalDraft(true, ctx.currentImage, ctx.featureCollection, {
    annotationFile: 'Review', localRevision: 12, lastSyncedRevision: 8, pendingChangeCount: 4,
  });
  assert.equal(saved, true);
  assert.deepEqual(plain(captured), {
    imageId: 'img::Review', sourceImageId: 'img', annotationFile: 'Review', imageName: 'Image',
    relativePath: 'folder/img.svs', localNative: false,
    featureCollection: { type: 'FeatureCollection', features: [{ id: 'a' }] },
    pending: true, pendingChangeCount: 4, localRevision: 12, lastSyncedRevision: 8, updatedAt: 777,
  });
});

test('persistLocalDraft forces local-native documents to non-pending', async () => {
  let captured = null;
  const image = { id: 'local-1', name: 'Local', relativePath: '', localNative: true };
  const ctx = makeContext({
    currentAnnotationFile: 'Default', currentImage: image,
    currentLocalRevision: 3, currentLastSyncedRevision: 0, currentPendingChangeCount: 2,
    localDraftState: '', deepClone: clone, updateDiagnostics() {},
    putLocalDraft: async (record) => { captured = record; return true; }, Date: { now: () => 1000 },
  });
  install(ctx, 'localDraftKey', 'persistLocalDraft');
  await ctx.persistLocalDraft(true, image, { type: 'FeatureCollection', features: [] });
  assert.equal(captured.pending, false);
  assert.equal(captured.pendingChangeCount, 0);
  assert.equal(ctx.currentPendingChangeCount, 0);
  assert.equal(ctx.localDraftState, 'Saved locally');
});

// -------------------------------------------------------------------------
// Server synchronization ordering and stale-response protection
// -------------------------------------------------------------------------

test('applyAnnotationSyncResult clears pending only when ACK catches current local revision', async () => {
  const initial = {
    imageId: 'img', sourceImageId: 'img', annotationFile: 'Default', localRevision: 4,
    lastSyncedRevision: 0, pending: true, pendingChangeCount: 2,
    featureCollection: { type: 'FeatureCollection', features: [{ id: 'old' }] }, updatedAt: 10,
  };
  const { db, records } = createFakeDraftDb([initial]);
  const ctx = makeContext({
    DB_STORE: 'drafts', openDraftDb: async () => db, phaseF261FastClone: clone, Date: { now: () => 20 },
  });
  install(ctx, 'applyAnnotationSyncResult');
  const job = { draftKey: 'img', image: { id: 'img', name: 'Image', relativePath: '' }, annotationFile: 'Default', revision: 4, payload: initial.featureCollection };
  await ctx.applyAnnotationSyncResult(job, { type: 'FeatureCollection', features: [{ id: 'normalized' }] }, { serverReturnedCollection: true });
  const saved = records.get('img');
  assert.equal(saved.pending, false);
  assert.equal(saved.pendingChangeCount, 0);
  assert.equal(saved.lastSyncedRevision, 4);
  assert.deepEqual(saved.featureCollection.features, [{ id: 'normalized' }]);
});

test('applyAnnotationSyncResult preserves a newer local revision while recording server progress', async () => {
  const initial = {
    imageId: 'img', sourceImageId: 'img', annotationFile: 'Default', localRevision: 6,
    lastSyncedRevision: 0, pending: true, pendingChangeCount: 3,
    featureCollection: { type: 'FeatureCollection', features: [{ id: 'new-local' }] }, updatedAt: 10,
  };
  const { db, records } = createFakeDraftDb([initial]);
  const ctx = makeContext({ DB_STORE: 'drafts', openDraftDb: async () => db, phaseF261FastClone: clone, Date: { now: () => 20 } });
  install(ctx, 'applyAnnotationSyncResult');
  const job = { draftKey: 'img', image: { id: 'img', name: 'Image', relativePath: '' }, annotationFile: 'Default', revision: 4, payload: { type: 'FeatureCollection', features: [{ id: 'old' }] } };
  await ctx.applyAnnotationSyncResult(job, { type: 'FeatureCollection', features: [{ id: 'server-old' }] }, { serverReturnedCollection: true });
  const saved = records.get('img');
  assert.equal(saved.localRevision, 6);
  assert.equal(saved.lastSyncedRevision, 4);
  assert.equal(saved.pending, true);
  assert.deepEqual(saved.featureCollection.features, [{ id: 'new-local' }]);
});

test('enqueueAnnotationSync skips queued revisions superseded before execution', async () => {
  const calls = [];
  const ctx = makeContext({ annotationLatestQueuedRevision: new Map(), annotationSyncChains: new Map(), syncAnnotationSnapshot: async (job) => { calls.push(job.revision); return { synced: true, revision: job.revision }; } });
  install(ctx, 'enqueueAnnotationSync');
  const mk = (revision) => ({ draftKey: 'doc', revision });
  const results = await Promise.all([
    ctx.enqueueAnnotationSync(mk(1)),
    ctx.enqueueAnnotationSync(mk(2)),
    ctx.enqueueAnnotationSync(mk(3)),
  ]);
  assert.deepEqual(calls, [3]);
  assert.equal(results[0].skipped, true);
  assert.equal(results[0].supersededBy, 3);
  assert.equal(results[1].skipped, true);
  assert.equal(results[2].synced, true);
  assert.equal(ctx.annotationSyncChains.size, 0);
  assert.equal(ctx.annotationLatestQueuedRevision.size, 0);
});

test('syncAnnotationSnapshot keeps newer live edits when an older response returns', async () => {
  const live = { type: 'FeatureCollection', features: [{ id: 'new-live' }] };
  const ctx = makeContext({
    annotationSyncInFlight: new Set(), API: 'http://server',
    currentLocalRevision: 2, currentLastSyncedRevision: 0, currentPendingChangeCount: 2,
    featureCollection: live, dirty: true, localDraftState: '',
    currentDocumentKey: () => 'doc', updateDiagnostics() {}, updateControls() {}, setStatus() {},
    apiFetch: async () => ({ json: async () => ({ compactAck: false, features: 1, featureCollection: { type: 'FeatureCollection', features: [{ id: 'server-old' }] } }) }),
    normalizeFeatureCollectionClient: (value) => value,
    applyAnnotationSyncResult: async () => true,
    featureId: (feature) => String(feature.id), phaseF26InvalidateGeometryCaches() { throw new Error('must not replace newer live data'); },
  });
  install(ctx, 'syncAnnotationSnapshot');
  const result = await ctx.syncAnnotationSnapshot({ draftKey: 'doc', image: { id: 'img' }, annotationFile: 'Default', payload: { type: 'FeatureCollection', features: [{ id: 'old' }] }, revision: 1 });
  assert.equal(result.synced, true);
  assert.equal(ctx.currentLastSyncedRevision, 1);
  assert.equal(ctx.dirty, true);
  assert.equal(ctx.localDraftState, 'Saved locally · sync pending');
  assert.equal(ctx.featureCollection, live);
});

test('compact ACK for current revision preserves live FeatureCollection identity and clears pending state', async () => {
  const live = { type: 'FeatureCollection', features: [{ id: 'live' }] };
  let requested = null;
  const ctx = makeContext({
    annotationSyncInFlight: new Set(), API: 'http://server', currentLocalRevision: 5, currentLastSyncedRevision: 2,
    currentPendingChangeCount: 4, featureCollection: live, dirty: true, localDraftState: '',
    currentDocumentKey: () => 'doc', updateDiagnostics() {}, updateControls() {}, setStatus() {},
    apiFetch: async (url, options) => { requested = { url, options }; return { json: async () => ({ compactAck: true, features: 1 }) }; },
    normalizeFeatureCollectionClient: (value) => value, applyAnnotationSyncResult: async () => true,
    featureId: (feature) => String(feature.id), phaseF26InvalidateGeometryCaches() {},
  });
  install(ctx, 'syncAnnotationSnapshot');
  await ctx.syncAnnotationSnapshot({ draftKey: 'doc', image: { id: 'img' }, annotationFile: 'Default', payload: live, revision: 5 });
  assert.equal(ctx.featureCollection, live);
  assert.equal(ctx.dirty, false);
  assert.equal(ctx.currentPendingChangeCount, 0);
  assert.equal(ctx.currentLastSyncedRevision, 5);
  assert.equal(ctx.localDraftState, 'Synced');
  assert.match(requested.url, /\/annotations\/img\?file=Default&compact=1$/);
  assert.equal(requested.options.timeoutMs, 5 * 60 * 1000);
});

test('server-normalized collection replaces live state only for the current revision', async () => {
  let invalidations = 0;
  const ctx = makeContext({
    annotationSyncInFlight: new Set(), API: 'http://server', currentLocalRevision: 5, currentLastSyncedRevision: 2,
    currentPendingChangeCount: 1, featureCollection: { type: 'FeatureCollection', features: [{ id: 'old' }] }, dirty: true, localDraftState: '',
    currentDocumentKey: () => 'doc', updateDiagnostics() {}, updateControls() {}, setStatus() {},
    apiFetch: async () => ({ json: async () => ({ features: 1, featureCollection: { type: 'FeatureCollection', features: [{ id: 'repaired' }] } }) }),
    normalizeFeatureCollectionClient: (value) => ({ ...value, normalized: true }), applyAnnotationSyncResult: async () => true,
    featureId: (feature) => String(feature.id), phaseF26InvalidateGeometryCaches: () => { invalidations += 1; },
  });
  install(ctx, 'syncAnnotationSnapshot');
  await ctx.syncAnnotationSnapshot({ draftKey: 'doc', image: { id: 'img' }, annotationFile: 'Default', payload: { type: 'FeatureCollection', features: [] }, revision: 5 });
  assert.equal(ctx.featureCollection.normalized, true);
  assert.deepEqual(ctx.featureCollection.features, [{ id: 'repaired' }]);
  assert.equal(invalidations, 1);
  assert.equal(ctx.dirty, false);
});

test('syncAllPendingDrafts filters local-native/non-pending records and syncs classes afterward', async () => {
  const jobs = [];
  let classesSynced = 0;
  const records = [
    { imageId: 'a', sourceImageId: 'a', annotationFile: 'Default', pending: true, localNative: false, featureCollection: { type: 'FeatureCollection', features: [] }, localRevision: 2 },
    { imageId: 'b', sourceImageId: 'b', pending: false, localNative: false, featureCollection: { type: 'FeatureCollection', features: [] } },
    { imageId: 'c', sourceImageId: 'c', pending: true, localNative: true, featureCollection: { type: 'FeatureCollection', features: [] } },
  ];
  const ctx = makeContext({
    IS_NATIVE: false, API: 'http://server', DB_STORE: 'drafts', navigator: { onLine: true },
    idbGetAll: async () => records, localDraftKey: (id, file) => file === 'Default' ? id : `${id}::${file}`,
    deepClone: clone, enqueueAnnotationSync: async (job) => { jobs.push(job); return { synced: true }; },
    readLocalClasses: () => ({ pending: true }), syncClassesToServer: async () => { classesSynced += 1; },
    setStatus() {}, updateDiagnostics() {}, Date: { now: () => 50 },
  });
  install(ctx, 'syncAllPendingDrafts');
  const result = await ctx.syncAllPendingDrafts(false);
  assert.deepEqual(plain(result), { synced: 1, failed: 0 });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].draftKey, 'a');
  assert.equal(jobs[0].revision, 2);
  assert.equal(classesSynced, 1);
});

// -------------------------------------------------------------------------
// Undo/Redo, hit testing, and edit orchestration
// -------------------------------------------------------------------------

test('pushUndo keeps at most 50 snapshots and clears redo', () => {
  const ctx = makeContext({ featureCollection: { type: 'FeatureCollection', features: [] }, undoStack: [], redoStack: ['old-redo'], deepClone: clone, phaseCCaptureSemanticBaseline() {}, updateControls() {} });
  install(ctx, 'pushUndo');
  for (let i = 0; i < 55; i += 1) {
    ctx.featureCollection.features = [{ id: String(i) }];
    ctx.pushUndo();
  }
  assert.equal(ctx.undoStack.length, 50);
  assert.equal(ctx.undoStack[0][0].id, '5');
  assert.deepEqual(plain(ctx.redoStack), []);
});

test('standard undo/redo roundtrip restores feature snapshots and clears selection', () => {
  let cleared = 0;
  let changed = 0;
  const ctx = makeContext({
    featureCollection: { type: 'FeatureCollection', features: [{ id: 'A' }] }, undoStack: [], redoStack: [],
    deepClone: clone, phaseCCaptureSemanticBaseline() {}, updateControls() {},
    phaseF261IsCreatedUndoEntry: () => false, clearSelectedFeatures: () => { cleared += 1; }, markChanged: () => { changed += 1; },
  });
  install(ctx, 'pushUndo', 'undo', 'redo');
  ctx.pushUndo();
  ctx.featureCollection.features = [{ id: 'B' }];
  ctx.undo();
  assert.deepEqual(plain(ctx.featureCollection.features), [{ id: 'A' }]);
  assert.deepEqual(plain(ctx.redoStack), [[{ id: 'B' }]]);
  ctx.redo();
  assert.deepEqual(plain(ctx.featureCollection.features), [{ id: 'B' }]);
  assert.equal(cleared, 2);
  assert.equal(changed, 2);
});

test('lightweight created-feature undo removes and redo reinserts the same id/index', () => {
  let selection = null;
  let changes = 0;
  const ctx = makeContext({
    PHASE_F261_UNDO_CREATED_FEATURE: 'phase-f261-created-feature',
    featureCollection: { type: 'FeatureCollection', features: [{ id: 'base' }] }, undoStack: [], redoStack: [],
    deepClone: clone, window: { structuredClone: globalThis.structuredClone },
    phaseCCaptureSemanticBaseline() {}, updateControls() {}, clearSelectedFeatures() {}, markChanged: () => { changes += 1; },
    uid: () => 'generated', setSingleSelection: (id, implicit) => { selection = [id, implicit]; },
  });
  install(ctx, 'deepClone', 'featureId', 'phaseF261FastClone', 'phaseF261CreatedUndoEntry', 'phaseF261IsCreatedUndoEntry', 'phaseF261PushCreatedFeatureUndo', 'phaseF261UndoCreatedFeature', 'phaseF261RedoCreatedFeature', 'undo', 'redo');
  const created = { id: 'new', geometry: { type: 'Polygon', coordinates: [] }, properties: {} };
  ctx.phaseF261PushCreatedFeatureUndo(created, 1);
  ctx.featureCollection.features.push(created);
  ctx.undo();
  assert.deepEqual(ctx.featureCollection.features.map((f) => f.id), ['base']);
  assert.equal(ctx.redoStack.length, 1);
  ctx.redo();
  assert.deepEqual(ctx.featureCollection.features.map((f) => f.id), ['base', 'new']);
  assert.deepEqual(selection, ['new', true]);
  assert.equal(changes, 2);
});

test('hitTest prefers the topmost polygon and excludes polygon holes', () => {
  const bottom = rectangle('bottom', 0, 0, 10, 10);
  const topWithHole = {
    ...rectangle('top', 0, 0, 10, 10),
    geometry: { type: 'Polygon', coordinates: [
      [[0,0],[10,0],[10,10],[0,10],[0,0]],
      [[4,4],[6,4],[6,6],[4,6],[4,4]],
    ] },
  };
  const ctx = makeContext({
    featureCollection: { type: 'FeatureCollection', features: [bottom, topWithHole] },
    phaseF26PolygonBoundsCache: new WeakMap(), phaseF26GeometryBoundsCache: new WeakMap(), uid: () => 'x',
  });
  install(ctx, 'featureId', 'pointInRing', 'pointInPolygon', 'phaseF26PolygonBounds', 'phaseF26GeometryBounds', 'phaseF26PointInBounds', 'hitTest');
  assert.equal(ctx.hitTest([2, 2]), 'top');
  assert.equal(ctx.hitTest([5, 5]), 'bottom');
  assert.equal(ctx.hitTest([20, 20]), null);
});

test('hitTest recognizes individual components of a MultiPolygon and ignores unsupported geometry', () => {
  const line = { type: 'Feature', id: 'line', geometry: { type: 'LineString', coordinates: [[0,0],[10,10]] }, properties: {} };
  const multi = { type: 'Feature', id: 'multi', geometry: { type: 'MultiPolygon', coordinates: [
    [[[0,0],[2,0],[2,2],[0,2],[0,0]]],
    [[[10,10],[12,10],[12,12],[10,12],[10,10]]],
  ] }, properties: {} };
  const ctx = makeContext({ featureCollection: { type: 'FeatureCollection', features: [line, multi] }, phaseF26PolygonBoundsCache: new WeakMap(), phaseF26GeometryBoundsCache: new WeakMap(), uid: () => 'x' });
  install(ctx, 'featureId', 'pointInRing', 'pointInPolygon', 'phaseF26PolygonBounds', 'phaseF26GeometryBounds', 'phaseF26PointInBounds', 'hitTest');
  assert.equal(ctx.hitTest([11, 11]), 'multi');
  assert.equal(ctx.hitTest([5, 5]), null);
});

test('commitGeometry new annotation uses lightweight creation undo and implicit selection', async () => {
  const calls = [];
  const clipped = { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] };
  const created = { id: 'new', geometry: clipped, properties: { classification: { name: 'Tumor' } } };
  const ctx = makeContext({
    editOperation: 'new', phaseDActiveRole: 'annotation', featureCollection: { type: 'FeatureCollection', features: [] },
    requireSelectedForOperation: () => true, phaseGClipGeometryToImage: async () => clipped,
    createAnnotationFeature: () => created, phaseF261PushCreatedFeatureUndo: (feature, index) => calls.push(['undo', feature.id, index]),
    setSingleSelection: (id, implicit) => calls.push(['select', id, implicit]), markChanged: () => calls.push(['changed']),
    setStatus: (...args) => calls.push(['status', ...args]),
  });
  install(ctx, 'commitGeometry');
  const result = await ctx.commitGeometry(clipped, { tool: 'Polygon' }, 'new');
  assert.equal(result, true);
  assert.deepEqual(plain(ctx.featureCollection.features), [created]);
  assert.deepEqual(calls.slice(0, 3), [['undo', 'new', 0], ['select', 'new', true], ['changed']]);
});

test('commitGeometry refuses geometry fully outside image without changing the document', async () => {
  let changed = 0;
  const ctx = makeContext({
    editOperation: 'new', phaseDActiveRole: 'annotation', featureCollection: { type: 'FeatureCollection', features: [] },
    requireSelectedForOperation: () => true, phaseGClipGeometryToImage: async () => null,
    setStatus() {}, markChanged: () => { changed += 1; },
  });
  install(ctx, 'commitGeometry');
  const result = await ctx.commitGeometry({ type: 'Polygon', coordinates: [] }, {}, 'new');
  assert.equal(result, false);
  assert.deepEqual(plain(ctx.featureCollection.features), []);
  assert.equal(changed, 0);
});

test('commitGeometry add/subtract edit preserves feature identity/properties and updates only geometry', async () => {
  const original = rectangle('target', 0, 0, 5, 5);
  original.properties.name = 'Keep me';
  const replacement = { type: 'Polygon', coordinates: [[[0,0],[8,0],[8,8],[0,8],[0,0]]] };
  let finalized = 0;
  let undo = 0;
  let changed = 0;
  const ctx = makeContext({
    editOperation: 'add', selectedId: 'target', featureCollection: { type: 'FeatureCollection', features: [original] },
    requireSelectedForOperation: () => true, phaseGClipGeometryToImage: async (g) => g,
    requestBooleanGeometry: async () => replacement, pushUndo: () => { undo += 1; },
    phaseCFinalizeGeometryEdit: () => { finalized += 1; }, phaseDIsTissueRoi: () => false,
    setStatus() {}, markChanged: () => { changed += 1; }, uid: () => 'x',
  });
  install(ctx, 'featureId', 'findFeature', 'commitGeometry');
  const beforeProperties = clone(original.properties);
  const result = await ctx.commitGeometry({ type: 'Polygon', coordinates: [] }, {}, 'add');
  assert.equal(result, true);
  assert.equal(original.id, 'target');
  assert.deepEqual(original.properties, beforeProperties);
  assert.equal(original.geometry, replacement);
  assert.equal(undo, 1);
  assert.equal(finalized, 1);
  assert.equal(changed, 1);
});
