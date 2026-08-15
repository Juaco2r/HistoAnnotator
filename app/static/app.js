(() => {
  "use strict";

  const VERSION = "0.8.2";

  // The same frontend runs both in the browser and inside Capacitor.
  const IS_NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());

  // Browser deployment, e.g. https://server/annotator/
  const BASE = window.location.pathname.startsWith("/annotator") ? "/annotator" : "";

  // Native Android deployment. This can later be exposed in Settings.
  const NATIVE_SERVER_STORAGE_KEY = "histoannotator.nativeServer.v1";
  const DEFAULT_NATIVE_SERVER = "https://161.116.13.132/annotator";
  const NATIVE_SERVER = (
    localStorage.getItem(NATIVE_SERVER_STORAGE_KEY) ||
    DEFAULT_NATIVE_SERVER
  ).replace(/\/+$/, "");

  const API = `${IS_NATIVE ? NATIVE_SERVER : BASE}/api`;
  const DEFAULT_CLASSES = [
    { name: "Tumor", color: "#ff6b6b" },
    { name: "Stroma", color: "#4dabf7" },
    { name: "Necrosis", color: "#ffd43b" },
    { name: "Anthracosis", color: "#9775fa" },
    { name: "Artifact", color: "#69db7c" },
  ];
  const CLASS_STORAGE_KEY = "histoannotator.classes.v1";
  const DB_NAME = "histoannotator-local-v1";
  const DB_VERSION = 2;
  const DB_STORE = "drafts";
  const DB_META = "meta";
  const DB_OFFLINE = "offline";
  const OFFLINE_CACHE = "histoannotator-offline-v0.8";

  const els = {
    drawingProfileSelect: document.getElementById("drawingProfileSelect"),
    imageSelect: document.getElementById("imageSelect"),
    refreshButton: document.getElementById("refreshButton"),
    status: document.getElementById("status"),
    eyeButton: document.getElementById("eyeButton"),
    displayButton: document.getElementById("displayButton"),
    displayPanel: document.getElementById("displayPanel"),
    brightnessSlider: document.getElementById("brightnessSlider"),
    brightnessValue: document.getElementById("brightnessValue"),
    imageTypeSelect: document.getElementById("imageTypeSelect"),
    stainChannelControls: document.getElementById("stainChannelControls"),
    displayHint: document.getElementById("displayHint"),
    canvas: document.getElementById("annotationCanvas"),
    emptyMessage: document.getElementById("emptyMessage"),
    inputGuide: document.getElementById("inputGuide"),
    workspace: document.getElementById("workspace"),
    classPanel: document.getElementById("classPanel"),
    annotationFileSelect: document.getElementById("annotationFileSelect"),
    newAnnotationFileButton: document.getElementById("newAnnotationFileButton"),
    toggleClassManager: document.getElementById("toggleClassManager"),
    annotationSummary: document.getElementById("annotationSummary"),
    classList: document.getElementById("classList"),
    classEditor: document.getElementById("classEditor"),
    classNameInput: document.getElementById("classNameInput"),
    classColorInput: document.getElementById("classColorInput"),
    addClassButton: document.getElementById("addClassButton"),
    editOperationControls: document.getElementById("editOperationControls"),
    editOperationHint: document.getElementById("editOperationHint"),
    toggleAnnotationList: document.getElementById("toggleAnnotationList"),
    annotationListTitle: document.getElementById("annotationListTitle"),
    annotationListChevron: document.getElementById("annotationListChevron"),
    annotationList: document.getElementById("annotationList"),
    saveClassButton: document.getElementById("saveClassButton"),
    cancelClassButton: document.getElementById("cancelClassButton"),
    finishPolygon: document.getElementById("finishPolygon"),
    cancelPolygon: document.getElementById("cancelPolygon"),
    polygonActions: document.getElementById("polygonActions"),
    pathologistActions: document.getElementById("pathologistActions"),
    finishPathologistContour: document.getElementById("finishPathologistContour"),
    addPathologistHole: document.getElementById("addPathologistHole"),
    cancelPathologistContour: document.getElementById("cancelPathologistContour"),
    brushControls: document.getElementById("brushControls"),
    brushSize: document.getElementById("brushSize"),
    brushSizeValue: document.getElementById("brushSizeValue"),
    wandControls: document.getElementById("wandControls"),
    wandTolerance: document.getElementById("wandTolerance"),
    wandToleranceValue: document.getElementById("wandToleranceValue"),
    wandRadius: document.getElementById("wandRadius"),
    wandRadiusValue: document.getElementById("wandRadiusValue"),
    wandMetric: document.getElementById("wandMetric"),
    circleControls: document.getElementById("circleControls"),
    circleMethod: document.getElementById("circleMethod"),
    circleWidthScale: document.getElementById("circleWidthScale"),
    circleHeightScale: document.getElementById("circleHeightScale"),
    circleWidthValue: document.getElementById("circleWidthValue"),
    circleHeightValue: document.getElementById("circleHeightValue"),
    circleActions: document.getElementById("circleActions"),
    circleInstruction: document.getElementById("circleInstruction"),
    finishCircle: document.getElementById("finishCircle"),
    cancelCircle: document.getElementById("cancelCircle"),
    selectionActions: document.getElementById("selectionActions"),
    selectionCount: document.getElementById("selectionCount"),
    deleteSelection: document.getElementById("deleteSelection"),
    mergeSelection: document.getElementById("mergeSelection"),
    intersectSelection: document.getElementById("intersectSelection"),
    subtractSelection: document.getElementById("subtractSelection"),
    clearSelection: document.getElementById("clearSelection"),
    fillAnnotationsButton: document.getElementById("fillAnnotationsButton"),
    undoButton: document.getElementById("undoButton"),
    redoButton: document.getElementById("redoButton"),
    saveButton: document.getElementById("saveButton"),
    exportButton: document.getElementById("exportButton"),
    importGeoJsonButton: document.getElementById("importGeoJsonButton"),
    importInput: document.getElementById("importInput"),
    fileMenuButton: document.getElementById("fileMenuButton"),
    fileMenuPanel: document.getElementById("fileMenuPanel"),
    uploadInput: document.getElementById("uploadInput"),
    downloadOriginalButton: document.getElementById("downloadOriginalButton"),
    downloadOfflineButton: document.getElementById("downloadOfflineButton"),
    offlineFilesButton: document.getElementById("offlineFilesButton"),
    syncNowButton: document.getElementById("syncNowButton"),
    offlineOverlay: document.getElementById("offlineOverlay"),
    offlineFilename: document.getElementById("offlineFilename"),
    offlineStorage: document.getElementById("offlineStorage"),
    offlineQuality: document.getElementById("offlineQuality"),
    offlineEstimate: document.getElementById("offlineEstimate"),
    offlineProgress: document.getElementById("offlineProgress"),
    offlineStatus: document.getElementById("offlineStatus"),
    startOfflineDownload: document.getElementById("startOfflineDownload"),
    cancelOfflineDownload: document.getElementById("cancelOfflineDownload"),
    offlineFilesOverlay: document.getElementById("offlineFilesOverlay"),
    offlineFilesList: document.getElementById("offlineFilesList"),
    closeOfflineFiles: document.getElementById("closeOfflineFiles"),
    imageInfoButton: document.getElementById("imageInfoButton"),
    uploadOverlay: document.getElementById("uploadOverlay"),
    uploadFilename: document.getElementById("uploadFilename"),
    uploadProgress: document.getElementById("uploadProgress"),
    uploadStatus: document.getElementById("uploadStatus"),
    cancelUploadButton: document.getElementById("cancelUploadButton"),
    infoOverlay: document.getElementById("infoOverlay"),
    imageInfoContent: document.getElementById("imageInfoContent"),
    closeInfoButton: document.getElementById("closeInfoButton"),
    featureCount: document.getElementById("featureCount"),
    dimensions: document.getElementById("dimensions"),
    diagnostics: document.getElementById("viewerDiagnostics"),
  };

  const ctx = els.canvas.getContext("2d");
  let viewer;
  let images = [];
  let currentImage = null;
  let currentInfo = null;
  let drawingProfile = "default";
  let currentAnnotationFile = "Default";
  let annotationFiles = ["Default"];
  let pathologistDraft = null;
  let featureCollection = { type: "FeatureCollection", features: [], properties: {} };
  let classes = deepClone(DEFAULT_CLASSES);
  let currentClass = classes[0];
  let classEditIndex = null;
  let mode = "navigate";
  let selectedId = null;
  let selectedIds = new Set();
  let activeDraft = null;
  let polygonDraft = [];
  let polygonOperation = "new";
  let pointerState = null;
  let undoStack = [];
  let redoStack = [];
  let saveTimer = null;
  let localSaveTimer = null;
  let retryTimer = null;
  let dirty = false;
  let localDraftState = "Ready";
  let lastPointerType = "—";
  let tileStats = { loaded: 0, failed: 0 };
  let openSequence = 0;
  let dbPromise = null;
  const activePenPointers = new Set();
  let suppressTouchUntil = 0;
  let brushDiameterPx = 42;
  let brushCursor = null;
  let wandCursor = null;
  let wandTolerance = 38;
  let wandRadiusPx = 150;
  let wandMetric = "color";
  let wandBusy = false;
  let annotationsVisible = true;
  let annotationsFilled = true;
  let editOperation = "new";
  let annotationListExpanded = false;
  let geometryBusy = false;
  let uploadAbortController = null;
  let activeUploadId = null;
  let circleDraft = null;
  let circleMethod = "center-radius";
  let circleWidthScale = 1.0;
  let circleHeightScale = 1.0;
  let brightnessPercent = 100;
  let imageType = "he";
  let displayChannels = {
    he: { hematoxylin: true, eosin: true },
    hdab: { hematoxylin: true, dab: true },
    fluorescence: { red: true, green: true, blue: true },
    rgb: { red: true, green: true, blue: true },
  };
  let statusHideTimer = null;
  let offlineDownloadAbort = false;
  let cachedCatalog = [];
  let restoreViewportState = null;
  let serverReachable = null;
  let imageCatalogSequence = 0;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hexToRgbArray(hex) {
    const normalized = String(hex || "").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
  }

  function rgbArrayToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) return null;
    const channels = rgb.slice(0, 3).map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))));
    return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function colorRgbIntegerToHex(value) {
    if (!Number.isFinite(Number(value))) return null;
    const packed = Number(value) >>> 0;
    return `#${((packed >> 16) & 255).toString(16).padStart(2, "0")}${((packed >> 8) & 255).toString(16).padStart(2, "0")}${(packed & 255).toString(16).padStart(2, "0")}`;
  }

  function normalizeFeatureCollectionClient(payload) {
    const source = payload?.type === "FeatureCollection" && Array.isArray(payload.features) ? payload : { type: "FeatureCollection", features: [] };
    const features = source.features
      .filter((feature) => feature?.type === "Feature" && feature.geometry)
      .map((feature) => {
        const sourceProperties = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
        const classification = sourceProperties.classification && typeof sourceProperties.classification === "object" ? sourceProperties.classification : null;
        let color = classification ? rgbArrayToHex(classification.color) : null;
        if (!color && classification && classification.colorRGB !== undefined) color = colorRgbIntegerToHex(classification.colorRGB);
        if (!color) color = sourceProperties.histoannotator?.color || null;
        const properties = {
          objectType: sourceProperties.objectType || sourceProperties.object_type || "annotation",
          isLocked: Boolean(sourceProperties.isLocked),
        };
        if (classification?.name) {
          properties.classification = { name: String(classification.name) };
          const rgb = color ? hexToRgbArray(color) : null;
          if (rgb) properties.classification.color = rgb;
        }
        for (const key of ["name", "description", "measurements"]) {
          if (key in sourceProperties) properties[key] = sourceProperties[key];
        }
        return {
          type: "Feature",
          id: String(feature.id || uid()),
          geometry: deepClone(feature.geometry),
          properties,
        };
      });
    return { type: "FeatureCollection", features };
  }

  function quPathFeatureCollection(payload = featureCollection) {
    return normalizeFeatureCollectionClient(payload);
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `ha-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function setStatus(message, type = "") {
    if (!els.status) return;
    clearTimeout(statusHideTimer);
    const text = String(message || "").trim();
    if (!text) { els.status.hidden = true; return; }
    // Routine mode hints no longer occupy permanent top-bar space. Status is a
    // short-lived viewer toast, with errors kept slightly longer.
    els.status.textContent = text;
    els.status.className = `status-toast ${type}`.trim();
    els.status.hidden = false;
    statusHideTimer = setTimeout(() => { els.status.hidden = true; }, type === "error" ? 6500 : 2600);
  }

  async function apiFetch(url, options = {}) {
    const { timeoutMs = 12000, ...requestOptions } = options || {};
    let timeoutId = null;
    let controller = null;
    const fetchOptions = { cache: "no-store", credentials: "same-origin", ...requestOptions };
    if (!fetchOptions.signal && typeof AbortController !== "undefined" && Number(timeoutMs) > 0) {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs));
    }
    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Request timed out after ${Math.max(1, Math.round(Number(timeoutMs) / 1000))}s`);
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        detail = payload.detail || detail;
      } catch (_) { /* response not JSON */ }
      throw new Error(detail);
    }
    return response;
  }

  function openDraftDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "imageId" });
        if (!db.objectStoreNames.contains(DB_META)) db.createObjectStore(DB_META, { keyPath: "key" });
        if (!db.objectStoreNames.contains(DB_OFFLINE)) db.createObjectStore(DB_OFFLINE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
    });
    return dbPromise;
  }

  async function idbGet(store, key) {
    try {
      const db = await openDraftDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (_) { return null; }
  }

  async function idbPut(store, record) {
    try {
      const db = await openDraftDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return true;
    } catch (error) {
      console.warn("IndexedDB write failed", error);
      return false;
    }
  }

  async function idbDelete(store, key) {
    try {
      const db = await openDraftDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (_) { return false; }
  }

  async function idbGetAll(store) {
    try {
      const db = await openDraftDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (_) { return []; }
  }

  async function putMeta(key, value) {
    return idbPut(DB_META, { key, value, updatedAt: Date.now() });
  }

  async function getMeta(key) {
    const record = await idbGet(DB_META, key);
    return record?.value ?? null;
  }


  function localDraftKey(imageId, annotationFile = currentAnnotationFile) {
    return annotationFile === "Default" ? imageId : `${imageId}::${annotationFile}`;
  }

  async function getLocalDraft(imageId, annotationFile = currentAnnotationFile) {
    try {
      const db = await openDraftDb();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readonly");
        const request = transaction.objectStore(DB_STORE).get(localDraftKey(imageId, annotationFile));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (_) {
      return null;
    }
  }

  async function putLocalDraft(record) {
    try {
      const db = await openDraftDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readwrite");
        transaction.objectStore(DB_STORE).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch (error) {
      console.warn("Could not save the local draft", error);
      return false;
    }
  }

  async function persistLocalDraft(pending = true, image = currentImage, payload = featureCollection) {
    if (!image) return false;
    const record = {
      imageId: localDraftKey(image.id, currentAnnotationFile),
      sourceImageId: image.id,
      annotationFile: currentAnnotationFile,
      imageName: image.name,
      relativePath: image.relativePath,
      featureCollection: deepClone(payload),
      pending,
      updatedAt: Date.now(),
    };
    const saved = await putLocalDraft(record);
    if (saved && image.id === currentImage?.id) {
      localDraftState = pending ? "Saved locally" : "Synced";
      updateDiagnostics();
    }
    return saved;
  }

  function scheduleLocalDraft() {
    clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => persistLocalDraft(true), 120);
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch (_) { /* best effort */ }
  }

  async function storageSummary() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!estimate) return "Storage estimate unavailable";
      const used = formatBytes(Number(estimate.usage || 0));
      const quota = formatBytes(Number(estimate.quota || 0));
      return `${used} used of ${quota} available to the app`;
    } catch (_) { return "Storage estimate unavailable"; }
  }

  function offlineDisplaySignature() {
    return displayQueryString();
  }
  function applyOfflineDisplayQuery(query) {
    try {
      const params = new URLSearchParams(query || "");
      const type = params.get("image_type");
      const view = params.get("view");
      if (["he", "hdab", "fluorescence", "rgb"].includes(type)) imageType = type;
      if (imageType === "he") {
        displayChannels.he = { hematoxylin: view === "original" || view === "hematoxylin", eosin: view === "original" || view === "eosin" };
      } else if (imageType === "hdab") {
        displayChannels.hdab = { hematoxylin: view === "original" || view === "hematoxylin", dab: view === "original" || view === "dab" };
      } else {
        const mask = params.get("rgb") || (view === "original" ? "111" : "000");
        displayChannels[imageType] = { red: mask[0] === "1", green: mask[1] === "1", blue: mask[2] === "1" };
      }
      if (els.imageTypeSelect) els.imageTypeSelect.value = imageType;
      renderChannelControls();
      saveDisplaySettings();
    } catch (_) { /* keep local display settings */ }
  }


  function offlinePackageKey(imageId, displayQuery = offlineDisplaySignature(), quality = "full") {
    return `${imageId}::${displayQuery}::${quality}`;
  }

  function deepZoomLevelSize(info, level) {
    const maxLevel = info.levelCount - 1;
    const scale = 2 ** Math.max(0, maxLevel - level);
    return {
      width: Math.max(1, Math.ceil(info.width / scale)),
      height: Math.max(1, Math.ceil(info.height / scale)),
    };
  }

  function buildOfflinePlan(imageId, info, quality = "review", displayQuery = offlineDisplaySignature()) {
    const maxLevel = info.levelCount - 1;
    const requestedMax = quality === "full" ? maxLevel : Math.max(0, maxLevel - 2);
    const urls = [];
    if (info.directRaster && activeDisplayView().view === "original" && quality === "full") {
      urls.push(`${API}/images/${imageId}/original`);
    } else {
      for (let level = 0; level <= requestedMax; level += 1) {
        const size = deepZoomLevelSize(info, level);
        const cols = Math.ceil(size.width / info.tileSize);
        const rows = Math.ceil(size.height / info.tileSize);
        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < cols; x += 1) {
            urls.push(`${API}/images/${imageId}/tiles/${level}/${x}_${y}.jpeg?${displayQuery}`);
          }
        }
      }
    }
    return { urls, maxLevel: requestedMax, quality, displayQuery };
  }

  async function cacheUrl(cache, url, timeoutMs = 20000) {
    const request = new Request(url, { credentials: "same-origin", cache: "no-store" });
    const existing = await cache.match(request);
    if (existing) return "cached";
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(request, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await cache.put(request, response.clone());
      return "downloaded";
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Tile download timed out");
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function downloadCurrentImageOffline() {
    if (!currentImage || !currentInfo) return;
    if (!("caches" in window)) {
      setStatus("Offline download is not supported by this browser", "error");
      return;
    }
    const quality = els.offlineQuality?.value || "review";
    const displayQuery = offlineDisplaySignature();
    const plan = buildOfflinePlan(currentImage.id, currentInfo, quality, displayQuery);
    const key = offlinePackageKey(currentImage.id, displayQuery, quality);
    offlineDownloadAbort = false;
    els.startOfflineDownload.disabled = true;
    els.offlineQuality.disabled = true;
    els.offlineProgress.max = Math.max(1, plan.urls.length);
    els.offlineProgress.value = 0;
    els.offlineStatus.textContent = `Checking ${plan.urls.length.toLocaleString()} tiles…`;
    await requestPersistentStorage();

    const packageRecord = {
      key,
      imageId: currentImage.id,
      imageName: currentImage.name,
      relativePath: currentImage.relativePath,
      image: deepClone(currentImage),
      info: deepClone(currentInfo),
      annotationFiles: deepClone(annotationFiles),
      imageType,
      displayQuery,
      quality,
      maxLevel: plan.maxLevel,
      urls: plan.urls,
      tileCount: plan.urls.length,
      completedTiles: 0,
      failedTiles: 0,
      ready: false,
      updatedAt: Date.now(),
    };
    await idbPut(DB_OFFLINE, packageRecord);

    const cache = await caches.open(OFFLINE_CACHE);
    let completed = 0;
    let available = 0;
    let failed = 0;
    const queue = plan.urls.slice();
    let lastPersistedAt = 0;

    const persistProgress = async (force = false) => {
      if (!force && completed - lastPersistedAt < 25) return;
      lastPersistedAt = completed;
      packageRecord.completedTiles = available;
      packageRecord.failedTiles = failed;
      packageRecord.ready = false;
      packageRecord.updatedAt = Date.now();
      await idbPut(DB_OFFLINE, packageRecord);
    };

    const workers = Array.from({ length: Math.min(6, queue.length || 1) }, async () => {
      while (queue.length && !offlineDownloadAbort) {
        const url = queue.shift();
        try {
          await cacheUrl(cache, url);
          available += 1;
        } catch (error) {
          failed += 1;
          console.warn("Offline tile failed", url, error);
        }
        completed += 1;
        if (completed % 5 === 0 || completed === plan.urls.length) {
          els.offlineProgress.value = completed;
          els.offlineStatus.textContent = `${completed.toLocaleString()} / ${plan.urls.length.toLocaleString()} checked · ${available.toLocaleString()} available${failed ? ` · ${failed} failed` : ""}`;
        }
        await persistProgress(false);
      }
    });
    await Promise.all(workers);

    packageRecord.completedTiles = available;
    packageRecord.failedTiles = failed;
    packageRecord.updatedAt = Date.now();

    if (!offlineDownloadAbort && failed === 0 && available === plan.urls.length) {
      packageRecord.ready = true;
      await idbPut(DB_OFFLINE, packageRecord);
      await putMeta(`image:${currentImage.id}`, {
        image: deepClone(currentImage), info: deepClone(currentInfo), annotationFiles: deepClone(annotationFiles), imageType,
      });
      els.offlineStatus.textContent = "Offline copy ready. You can disconnect the VPN and keep working.";
      setStatus(`${currentImage.name} is ready offline`, "saved");
      await loadImages(true);
    } else {
      packageRecord.ready = false;
      await idbPut(DB_OFFLINE, packageRecord);
      if (offlineDownloadAbort) {
        els.offlineStatus.textContent = `Download paused. ${available.toLocaleString()} tiles are already stored and will be reused next time.`;
      } else {
        els.offlineStatus.textContent = `${failed} tiles failed. Press Download again later; cached tiles will be reused instead of downloaded again.`;
      }
    }
    els.startOfflineDownload.disabled = false;
    els.offlineQuality.disabled = false;
  }

  async function updateOfflineEstimate() {
    if (!currentImage || !currentInfo || !els.offlineEstimate) return;
    const quality = els.offlineQuality.value || "review";
    const plan = buildOfflinePlan(currentImage.id, currentInfo, quality, offlineDisplaySignature());
    els.offlineEstimate.textContent = `${plan.urls.length.toLocaleString()} tiles for the current display · ${quality === "full" ? "full resolution" : "up to 1/4 linear resolution"}`;
    if (els.offlineStorage) els.offlineStorage.textContent = await storageSummary();
  }

  async function showOfflineDownload() {
    if (!currentImage || !currentInfo) return;
    toggleFileMenu(false);
    els.offlineFilename.textContent = currentImage.name;
    els.offlineProgress.value = 0;
    els.offlineStatus.textContent = "Ready to download. Existing cached tiles will be reused.";
    els.offlineOverlay.hidden = false;
    await updateOfflineEstimate();
  }

  async function listOfflineRecords() {
    return (await idbGetAll(DB_OFFLINE)).filter((item) => item?.imageId);
  }

  async function listOfflinePackages() {
    return (await listOfflineRecords()).filter((item) => item?.ready);
  }

  async function removeOfflinePackage(record) {
    if ("caches" in window) {
      const cache = await caches.open(OFFLINE_CACHE);
      for (const url of record.urls || []) {
        try { await cache.delete(new Request(url, { credentials: "same-origin" })); } catch (_) { /* best effort */ }
      }
    }
    await idbDelete(DB_OFFLINE, record.key);
  }

  async function showOfflineFiles() {
    toggleFileMenu(false);
    els.offlineFilesList.innerHTML = "<p>Loading local files…</p>";
    els.offlineFilesOverlay.hidden = false;
    const records = await listOfflineRecords();
    els.offlineFilesList.innerHTML = "";
    if (!records.length) {
      const empty = document.createElement("p");
      empty.textContent = "No images have been downloaded for offline use yet.";
      els.offlineFilesList.append(empty);
    }
    for (const record of records.sort((a, b) => String(a.imageName).localeCompare(String(b.imageName)))) {
      const row = document.createElement("div"); row.className = "offline-file-row";
      const text = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = record.imageName;
      const total = Number(record.tileCount || 0);
      const completed = Number(record.completedTiles ?? (record.ready ? total : 0));
      const state = record.ready ? "Downloaded" : "Partial download";
      const progress = total ? ` · ${completed.toLocaleString()} / ${total.toLocaleString()} tiles` : "";
      const small = document.createElement("small");
      small.textContent = `${state} · ${record.quality || "review"}${progress}`;
      text.append(strong, small);

      const actions = document.createElement("div"); actions.className = "offline-file-actions";
      if (record.ready) {
        const open = document.createElement("button"); open.type = "button"; open.textContent = "Open";
        open.addEventListener("click", async () => {
          els.offlineFilesOverlay.hidden = true;
          await openImage(record.imageId);
        });
        actions.append(open);
      }
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Remove the offline copy of ${record.imageName}? Annotations are not deleted.`)) return;
        remove.disabled = true;
        await removeOfflinePackage(record);
        await showOfflineFiles();
        await loadImages(true);
      });
      actions.append(remove);
      row.append(text, actions);
      els.offlineFilesList.append(row);
    }
    els.offlineFilesOverlay.hidden = false;
  }

  async function offlineRecordForImage(imageId) {
    const records = await listOfflinePackages();
    return records.filter((item) => item.imageId === imageId).sort((a, b) => Number(b.maxLevel || 0) - Number(a.maxLevel || 0))[0] || null;
  }

  async function cacheImageCatalog(payload) {
    cachedCatalog = Array.isArray(payload?.images) ? deepClone(payload.images) : [];
    await putMeta("imageCatalog", cachedCatalog);
  }

  async function restoreCachedCatalog() {
    cachedCatalog = (await getMeta("imageCatalog")) || [];
    return cachedCatalog;
  }

  function mergeKnownImages(...collections) {
    const byId = new Map();
    for (const collection of collections) {
      for (const image of collection || []) {
        if (!image?.id) continue;
        const previous = byId.get(image.id) || {};
        byId.set(image.id, { ...previous, ...deepClone(image) });
      }
    }
    return [...byId.values()].sort((a, b) => String(a.relativePath || a.name || "").localeCompare(String(b.relativePath || b.name || "")));
  }

  async function collectLocalImageState(records = null) {
    const offlineRecords = records || await listOfflineRecords();
    const drafts = await idbGetAll(DB_STORE);
    return {
      readyIds: new Set(offlineRecords.filter((item) => item.ready).map((item) => item.imageId)),
      partialIds: new Set(offlineRecords.filter((item) => !item.ready).map((item) => item.imageId)),
      pendingIds: new Set(drafts.filter((item) => item?.pending && item?.sourceImageId).map((item) => item.sourceImageId)),
    };
  }

  function renderImageOptions(previous, localState) {
    els.imageSelect.innerHTML = '<option value="">Select an image…</option>';
    for (const image of images) {
      const option = document.createElement("option");
      option.value = image.id;
      const prep = image.prepared ? " • SSD ready" : (image.needsPreparation ? " • prepare on open" : "");
      const downloaded = localState.readyIds.has(image.id);
      const partial = localState.partialIds.has(image.id);
      const pending = localState.pendingIds.has(image.id);
      const storageState = downloaded ? "Downloaded" : (partial ? "Partial download" : "Online only");
      const syncState = pending ? " • Sync pending" : "";
      const unavailable = serverReachable === false && !downloaded ? " • unavailable offline" : "";
      option.textContent = `${image.relativePath} (${formatBytes(image.sizeBytes)}) • ${storageState}${syncState}${image.hasAnnotations ? " • annotated" : ""}${prep}${unavailable}`;
      if (serverReachable === false && !downloaded) option.disabled = true;
      els.imageSelect.append(option);
    }
    if (previous && images.some((image) => image.id === previous)) els.imageSelect.value = previous;
  }

  async function cacheCurrentImageMetadata() {
    if (!currentImage || !currentInfo) return;
    await putMeta(`image:${currentImage.id}`, {
      image: deepClone(currentImage), info: deepClone(currentInfo), annotationFiles: deepClone(annotationFiles), imageType,
    });
  }

  async function saveViewportState() {
    if (!currentImage || !viewer?.world?.getItemCount?.()) return;
    try {
      const center = viewer.viewport.getCenter();
      const zoom = viewer.viewport.getZoom();
      await putMeta(`viewport:${currentImage.id}`, { x: center.x, y: center.y, zoom, annotationFile: currentAnnotationFile });
    } catch (_) { /* best effort */ }
  }

  async function syncAllPendingDrafts(showToast = true) {
    if (!navigator.onLine) {
      if (showToast) setStatus("Offline: synchronization will resume when a connection is available", "local");
      return { synced: 0, failed: 0 };
    }
    const drafts = (await idbGetAll(DB_STORE)).filter((record) => record?.pending && record?.sourceImageId && record?.featureCollection);
    let synced = 0; let failed = 0;
    for (const record of drafts) {
      try {
        await apiFetch(`${API}/annotations/${record.sourceImageId}?file=${encodeURIComponent(record.annotationFile || "Default")}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record.featureCollection),
        });
        record.pending = false; record.updatedAt = Date.now(); await putLocalDraft(record); synced += 1;
      } catch (_) { failed += 1; }
    }
    const localClasses = readLocalClasses();
    if (localClasses?.pending) await syncClassesToServer();
    if (showToast) setStatus(failed ? `${synced} annotation files synced · ${failed} still pending` : `${synced} pending annotation files synchronized`, failed ? "local" : "saved");
    updateDiagnostics();
    return { synced, failed };
  }

  function registerOfflineServiceWorker() {
    // The current Service Worker caches URLs from the web deployment.
    // Android alpha1 uses the native client and will receive a dedicated
    // native offline-storage implementation in the next stage.
    if (IS_NATIVE) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`${BASE || ""}/service-worker.js`, { scope: `${BASE || ""}/` })
      .then(() => navigator.serviceWorker.ready)
      .catch((error) => console.warn("Service worker registration failed", error));
  }

  function readLocalClasses() {
    try {
      const raw = localStorage.getItem(CLASS_STORAGE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!Array.isArray(payload.classes) || !payload.classes.length) return null;
      return payload;
    } catch (_) {
      return null;
    }
  }

  function writeLocalClasses(pending) {
    localStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify({ classes, pending, updatedAt: Date.now() }));
  }

  async function syncClassesToServer() {
    writeLocalClasses(true);
    try {
      const response = await apiFetch(`${API}/classes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classes }),
      });
      const payload = await response.json();
      classes = payload.classes;
      currentClass = classes.find((item) => item.name === currentClass?.name) || classes[0];
      writeLocalClasses(false);
      renderClassButtons();
    } catch (error) {
      setStatus(`Classes saved on this device; server sync pending: ${error.message}`, "local");
    }
  }

  async function loadClasses() {
    const local = readLocalClasses();
    if (local?.classes?.length) {
      classes = local.classes;
      currentClass = classes[0];
      renderClassButtons();
    }
    try {
      if (local?.pending) {
        await syncClassesToServer();
        return;
      }
      const response = await apiFetch(`${API}/classes`);
      const payload = await response.json();
      if (Array.isArray(payload.classes) && payload.classes.length) {
        classes = payload.classes;
        currentClass = classes.find((item) => item.name === currentClass?.name) || classes[0];
        writeLocalClasses(false);
        renderClassButtons();
      }
    } catch (_) {
      if (!local) {
        classes = deepClone(DEFAULT_CLASSES);
        currentClass = classes[0];
        renderClassButtons();
      }
    }
  }

  function setClassManagerOpen(open) {
    const isOpen = Boolean(open);
    els.classPanel.classList.toggle("management-open", isOpen);
    els.workspace.classList.toggle("class-manager-open", isOpen);
    els.toggleClassManager.setAttribute("aria-expanded", String(isOpen));
    els.toggleClassManager.textContent = isOpen ? "Done" : "Manage";
    if (!isOpen) closeClassEditor();
    requestAnimationFrame(() => {
      viewer?.forceRedraw?.();
      drawAnnotations();
    });
  }

  function openClassEditor(index = null) {
    setClassManagerOpen(true);
    classEditIndex = index;
    const item = index === null ? { name: "", color: "#ff6b6b" } : classes[index];
    els.classNameInput.value = item.name;
    els.classColorInput.value = item.color;
    els.classEditor.hidden = false;
    els.classNameInput.focus();
  }

  function closeClassEditor() {
    classEditIndex = null;
    els.classEditor.hidden = true;
    els.classNameInput.value = "";
  }

  function saveClassEditor() {
    const name = els.classNameInput.value.trim();
    const color = els.classColorInput.value.toLowerCase();
    if (!name) {
      setStatus("Enter a class name", "error");
      return;
    }
    const duplicate = classes.findIndex((item, index) => item.name.toLowerCase() === name.toLowerCase() && index !== classEditIndex);
    if (duplicate >= 0) {
      setStatus(`A class named ${name} already exists`, "error");
      return;
    }
    if (classEditIndex === null) {
      classes.push({ name, color });
      currentClass = classes[classes.length - 1];
    } else {
      const oldName = classes[classEditIndex].name;
      classes[classEditIndex] = { name, color };
      if (currentClass?.name === oldName) currentClass = classes[classEditIndex];
    }
    closeClassEditor();
    renderClassButtons();
    syncClassesToServer();
  }

  function deleteClass(index) {
    if (classes.length <= 1) {
      setStatus("At least one class must remain", "error");
      return;
    }
    const item = classes[index];
    if (!window.confirm(`Remove “${item.name}” from the class list? Existing annotations will keep that class name.`)) return;
    classes.splice(index, 1);
    if (currentClass?.name === item.name) currentClass = classes[0];
    renderClassButtons();
    syncClassesToServer();
  }

  function annotationCountForClass(name) {
    return featureCollection.features.reduce((count, feature) => (
      feature.properties?.classification?.name === name ? count + 1 : count
    ), 0);
  }

  function renderClassButtons() {
    els.classList.innerHTML = "";
    for (const [index, item] of classes.entries()) {
      const row = document.createElement("div");
      row.className = "class-row";

      const main = document.createElement("button");
      main.type = "button";
      main.className = `class-main ${item.name === currentClass?.name ? "active" : ""}`;
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = item.color;
      const label = document.createElement("span");
      label.textContent = item.name;
      main.append(swatch, label);
      main.addEventListener("click", () => {
        currentClass = item;
        renderClassButtons();
        if (selectedIds.size) {
          pushUndo();
          for (const feature of selectedFeatures()) {
            feature.properties = feature.properties || {};
            feature.properties.classification = { name: item.name, color: hexToRgbArray(item.color) };
            delete feature.properties.histoannotator;
          }
          markChanged();
        }
      });

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "class-edit management-only";
      edit.textContent = "✎";
      edit.title = `Edit ${item.name}`;
      edit.addEventListener("click", () => openClassEditor(index));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "class-delete management-only";
      remove.textContent = "×";
      remove.title = `Delete ${item.name}`;
      remove.addEventListener("click", () => deleteClass(index));

      const count = document.createElement("span");
      count.className = "class-count";
      count.textContent = String(annotationCountForClass(item.name));
      count.title = `${count.textContent} annotations`;

      row.append(main, edit, remove, count);
      els.classList.append(row);
    }
    renderAnnotationList();
  }

  function currentClassFeatures() {
    const name = currentClass?.name;
    return featureCollection.features.filter((feature) => feature.properties?.classification?.name === name);
  }

  function ringArea(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let area = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      area += Number(current?.[0] || 0) * Number(next?.[1] || 0) - Number(next?.[0] || 0) * Number(current?.[1] || 0);
    }
    return area / 2;
  }

  function geometryAreaPixels(geometry) {
    if (!geometry) return 0;
    const polygonArea = (polygon) => {
      if (!Array.isArray(polygon) || !polygon.length) return 0;
      const outer = Math.abs(ringArea(polygon[0]));
      const holes = polygon.slice(1).reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0);
      return Math.max(0, outer - holes);
    };
    if (geometry.type === "Polygon") return polygonArea(geometry.coordinates);
    if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
    return 0;
  }

  function formatPixelArea(value) {
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}G px²`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M px²`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k px²`;
    return `${Math.round(value)} px²`;
  }

  function renderAnnotationList() {
    if (!els.annotationList) return;
    const features = currentClassFeatures();
    const className = currentClass?.name || "Unclassified";
    els.annotationListTitle.textContent = `${className} annotations (${features.length})`;
    els.annotationListChevron.textContent = annotationListExpanded ? "▾" : "▸";
    els.toggleAnnotationList.setAttribute("aria-expanded", String(annotationListExpanded));
    els.annotationList.hidden = !annotationListExpanded;
    els.annotationList.innerHTML = "";
    if (!annotationListExpanded) return;
    if (!features.length) {
      const empty = document.createElement("p");
      empty.className = "annotation-list-empty";
      empty.textContent = "No annotations in the current class.";
      els.annotationList.append(empty);
      return;
    }
    features.forEach((feature, index) => {
      const id = featureId(feature);
      const row = document.createElement("div");
      row.className = "annotation-row";
      const select = document.createElement("button");
      select.type = "button";
      select.className = `annotation-select ${selectedIds.has(id) ? "active multi-active" : ""}`;
      select.title = "Select and move to this annotation";
      const swatch = document.createElement("span");
      swatch.className = "annotation-index-swatch";
      swatch.style.background = colorForFeature(feature);
      const label = document.createElement("span");
      label.className = "annotation-select-label";
      label.textContent = feature.properties?.name || `Annotation ${index + 1}`;
      const meta = document.createElement("span");
      meta.className = "annotation-select-meta";
      meta.textContent = formatPixelArea(geometryAreaPixels(feature.geometry));
      select.append(swatch, label, meta);
      select.addEventListener("click", () => {
        setSingleSelection(id);
        syncCurrentClassFromFeature(feature);
        updateControls();
        drawAnnotations();
        zoomToFeature(feature);
      });
      row.append(select);
      els.annotationList.append(row);
    });
  }

  function initViewer() {
    viewer = OpenSeadragon({
      id: "viewer",
      showNavigationControl: false,
      showNavigator: true,
      navigatorPosition: "BOTTOM_RIGHT",
      navigatorSizeRatio: 0.18,
      navigatorMaintainSizeRatio: true,
      navigatorAutoFade: false,
      navigatorBorderColor: "rgba(255,255,255,.72)",
      navigatorDisplayRegionColor: "#65b8ff",
      animationTime: 0.18,
      blendTime: 0,
      immediateRender: true,
      maxZoomPixelRatio: 1.35,
      visibilityRatio: 0.05,
      constrainDuringPan: false,
      imageLoaderLimit: 8,
      maxImageCacheCount: 800,
      gestureSettingsTouch: {
        scrollToZoom: false,
        clickToZoom: false,
        dblClickToZoom: true,
        pinchToZoom: true,
        flickEnabled: true,
        dragToPan: true,
      },
      gestureSettingsPen: {
        scrollToZoom: false,
        clickToZoom: false,
        dblClickToZoom: false,
        pinchToZoom: false,
        flickEnabled: false,
        dragToPan: false,
      },
    });

    ["open", "animation", "update-viewport", "resize"].forEach((eventName) => {
      viewer.addHandler(eventName, () => {
        drawAnnotations();
        updateDiagnostics();
        if (eventName === "open" && viewer.navigator?.element) {
          viewer.navigator.element.title = "Overview: tap or drag to move to another part of the image";
          viewer.navigator.element.setAttribute("aria-label", "Image overview. Tap or drag to navigate.");
        }
      });
    });

    viewer.addHandler("animation-finish", () => { if (currentImage) saveViewportState(); });

    viewer.addHandler("tile-loaded", () => {
      tileStats.loaded += 1;
      updateDiagnostics();
    });

    viewer.addHandler("tile-load-failed", (event) => {
      tileStats.failed += 1;
      const message = event?.message || event?.tile?.url || "unknown tile";
      setStatus(`Tile error: ${String(message).slice(0, 90)}`, "error");
      updateDiagnostics();
    });

    installNativePointerHandlers();
  }

  function installNativePointerHandlers() {
    const target = viewer.container;
    target.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: false });
    target.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    target.addEventListener("pointerup", handlePointerUp, { capture: true, passive: false });
    target.addEventListener("pointercancel", handlePointerCancel, { capture: true, passive: false });
    target.addEventListener("pointerleave", handlePointerLeave, { capture: true, passive: true });
  }

  const AREA_MODES = new Set(["freehand", "brush", "wand", "polygon", "rectangle", "circle"]);


  function selectedFeatures() {
    return featureCollection.features.filter((feature) => selectedIds.has(featureId(feature)));
  }

  function clearSelectedFeatures(redraw = true) {
    selectedIds.clear();
    selectedId = null;
    if (redraw) {
      updateControls();
      drawAnnotations();
    }
  }

  function setSingleSelection(id) {
    selectedIds.clear();
    selectedId = id ? String(id) : null;
    if (selectedId) selectedIds.add(selectedId);
  }

  function setMultiSelection(ids, primary = null) {
    selectedIds = new Set((ids || []).map(String));
    if (!selectedIds.size) selectedId = null;
    else if (primary && selectedIds.has(String(primary))) selectedId = String(primary);
    else {
      // For area selection, the largest annotation is the most intuitive
      // primary object for "Subtract" (large ROI minus smaller selected ROIs).
      const candidates = featureCollection.features.filter((feature) => selectedIds.has(featureId(feature)));
      candidates.sort((a, b) => geometryAreaPixels(b.geometry) - geometryAreaPixels(a.geometry));
      selectedId = candidates.length ? featureId(candidates[0]) : [...selectedIds][0];
    }
  }

  function selectionSameClass() {
    const selected = selectedFeatures();
    if (selected.length < 2) return false;
    const first = selected[0]?.properties?.classification?.name || "";
    return selected.every((feature) => (feature.properties?.classification?.name || "") === first);
  }

  function updateSelectionActions() {
    if (!els.selectionActions) return;
    const count = selectedIds.size;
    const active = count > 0 && mode === "select";
    els.selectionActions.hidden = !active;
    if (!active) return;
    els.selectionCount.textContent = `${count} selected`;
    const sameClass = count > 1 && selectionSameClass();
    els.mergeSelection.hidden = !sameClass;
    els.intersectSelection.hidden = !sameClass;
    els.subtractSelection.hidden = !sameClass;
    els.deleteSelection.disabled = geometryBusy;
    els.mergeSelection.disabled = geometryBusy;
    els.intersectSelection.disabled = geometryBusy;
    els.subtractSelection.disabled = geometryBusy;
  }

  function displayStorageKey() {
    return currentImage ? `histoannotator.display.v1.${currentImage.id}` : null;
  }

  function saveDisplaySettings() {
    const key = displayStorageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ imageType, brightnessPercent, displayChannels }));
  }

  function loadDisplaySettings() {
    imageType = "he";
    brightnessPercent = 100;
    displayChannels = {
      he: { hematoxylin: true, eosin: true },
      hdab: { hematoxylin: true, dab: true },
      fluorescence: { red: true, green: true, blue: true },
      rgb: { red: true, green: true, blue: true },
    };
    const key = displayStorageKey();
    if (key) {
      try {
        const payload = JSON.parse(localStorage.getItem(key) || "null");
        if (payload?.imageType && ["he", "hdab", "fluorescence", "rgb"].includes(payload.imageType)) imageType = payload.imageType;
        if (Number.isFinite(Number(payload?.brightnessPercent))) brightnessPercent = Math.max(40, Math.min(200, Number(payload.brightnessPercent)));
        if (payload?.displayChannels && typeof payload.displayChannels === "object") displayChannels = { ...displayChannels, ...payload.displayChannels };
      } catch (_) { /* use defaults */ }
    }
    if (els.imageTypeSelect) els.imageTypeSelect.value = imageType;
    if (els.brightnessSlider) els.brightnessSlider.value = String(brightnessPercent);
    if (els.brightnessValue) els.brightnessValue.textContent = `${brightnessPercent}%`;
    renderChannelControls();
    applyBrightness();
  }

  function applyBrightness() {
    if (viewer?.canvas) viewer.canvas.style.filter = `brightness(${brightnessPercent}%)`;
  }

  function activeDisplayView() {
    if (imageType === "he") {
      const c = displayChannels.he || {};
      if (c.hematoxylin && c.eosin) return { view: "original" };
      if (c.hematoxylin) return { view: "hematoxylin" };
      if (c.eosin) return { view: "eosin" };
      return { view: "none" };
    }
    if (imageType === "hdab") {
      const c = displayChannels.hdab || {};
      if (c.hematoxylin && c.dab) return { view: "original" };
      if (c.hematoxylin) return { view: "hematoxylin" };
      if (c.dab) return { view: "dab" };
      return { view: "none" };
    }
    const c = displayChannels[imageType] || displayChannels.rgb;
    const mask = `${c.red ? 1 : 0}${c.green ? 1 : 0}${c.blue ? 1 : 0}`;
    return mask === "111" ? { view: "original" } : { view: "rgbmask", rgb: mask };
  }

  function displayQueryString() {
    const display = activeDisplayView();
    const params = new URLSearchParams();
    params.set("view", display.view);
    params.set("image_type", imageType);
    if (display.rgb) params.set("rgb", display.rgb);
    if (currentImage?.modifiedUnix) params.set("rev", String(currentImage.modifiedUnix));
    return params.toString();
  }

  function renderChannelControls() {
    if (!els.stainChannelControls) return;
    els.stainChannelControls.innerHTML = "";
    let names;
    if (imageType === "he") names = [["hematoxylin", "Hematoxylin", "#6f5da8"], ["eosin", "Eosin", "#ef8ea8"]];
    else if (imageType === "hdab") names = [["hematoxylin", "Hematoxylin", "#6f5da8"], ["dab", "DAB", "#9a6a3a"]];
    else names = [["red", "Red", "#ff6b6b"], ["green", "Green", "#69db7c"], ["blue", "Blue", "#4dabf7"]];
    const state = displayChannels[imageType] || displayChannels.rgb;
    for (const [key, label, color] of names) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `channel-toggle ${state[key] ? "active" : ""}`;
      const dot = document.createElement("span"); dot.className = "channel-dot"; dot.style.background = color;
      const text = document.createElement("span"); text.textContent = label;
      button.append(dot, text);
      button.addEventListener("click", () => {
        state[key] = !state[key];
        saveDisplaySettings();
        renderChannelControls();
        refreshImageDisplay();
      });
      els.stainChannelControls.append(button);
    }
    if (els.displayHint) {
      els.displayHint.textContent = imageType === "fluorescence"
        ? "RGB channel toggles are available now; true >3-channel IF support can plug into this panel later."
        : "Stain views use color deconvolution for visualization only. Original pixels are never modified.";
    }
  }

  function buildViewerSource(imageId, info) {
    const display = activeDisplayView();
    if (info.directRaster && display.view === "original") return { type: "image", url: `${API}/images/${imageId}/original` };
    const query = displayQueryString();
    return {
      width: info.width,
      height: info.height,
      tileSize: info.tileSize,
      tileOverlap: info.tileOverlap,
      minLevel: 0,
      maxLevel: info.levelCount - 1,
      getTileUrl(level, x, y) { return `${API}/images/${imageId}/tiles/${level}/${x}_${y}.jpeg?${query}`; },
    };
  }

  async function refreshImageDisplay() {
    if (!currentImage || !currentInfo || !viewer) { applyBrightness(); return; }
    if (!navigator.onLine) {
      const packages = (await listOfflinePackages()).filter((item) => item.imageId === currentImage.id && item.displayQuery === displayQueryString());
      if (!packages.length) {
        setStatus("That stain/channel view was not downloaded. Reconnect the VPN to cache it for offline use.", "local");
        return;
      }
    }
    const center = viewer.world.getItemCount() ? viewer.viewport.getCenter() : null;
    const zoom = viewer.world.getItemCount() ? viewer.viewport.getZoom() : null;
    viewer.addOnceHandler("open", () => {
      if (center && Number.isFinite(zoom)) { viewer.viewport.panTo(center, true); viewer.viewport.zoomTo(zoom, center, true); }
      applyBrightness();
      drawAnnotations();
    });
    viewer.open(buildViewerSource(currentImage.id, currentInfo));
  }

  function setEditOperation(operation) {
    if (!new Set(["new", "add", "subtract"]).has(operation)) return;
    editOperation = operation;
    document.querySelectorAll("[data-edit-operation]").forEach((button) => {
      button.classList.toggle("active", button.dataset.editOperation === operation);
    });
    const needsSelection = operation !== "new";
    els.editOperationControls?.classList.toggle("needs-selection", needsSelection && !selectedId);
    if (els.editOperationHint) {
      if (operation === "new") els.editOperationHint.textContent = "Create a separate annotation";
      else if (operation === "add") els.editOperationHint.textContent = selectedId ? "Merge into the selected annotation" : "Select an annotation first";
      else els.editOperationHint.textContent = selectedId ? "Erase from the selected annotation" : "Select an annotation first";
    }
  }

  function operationForEvent(event = null, fallback = editOperation) {
    if (event?.altKey) return "subtract";
    if (event?.shiftKey) return "add";
    return fallback;
  }

  function requireSelectedForOperation(operation) {
    if (operation === "new") return true;
    const feature = selectedId ? findFeature(selectedId) : null;
    if (!feature) {
      setStatus(`${operation === "add" ? "Add" : "Subtract"}: select an annotation first`, "error");
      setEditOperation(operation);
      return false;
    }
    if (feature.properties?.isLocked) {
      setStatus("The selected annotation is locked", "error");
      return false;
    }
    return true;
  }

  function setMode(nextMode) {
    mode = nextMode;
    activeDraft = null;
    pointerState = null;
    brushCursor = null;
    wandCursor = null;
    if (nextMode !== "polygon") {
      polygonDraft = [];
      polygonOperation = "new";
    }
    if (nextMode !== "freehand" && pathologistDraft) pathologistDraft = null;
    if (nextMode !== "circle") circleDraft = null;
    document.querySelectorAll(".tool").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === nextMode);
    });
    if (viewer) {
      viewer.setMouseNavEnabled(true);
      // In Move mode the stylus behaves exactly like a finger/mouse for panning.
      if (viewer.gestureSettingsPen) {
        viewer.gestureSettingsPen.dragToPan = nextMode === "navigate";
        viewer.gestureSettingsPen.flickEnabled = nextMode === "navigate";
      }
    }
    document.getElementById("viewer")?.classList.toggle("annotation-mode", nextMode !== "navigate");
    els.brushControls.hidden = nextMode !== "brush";
    els.wandControls.hidden = nextMode !== "wand";
    if (els.circleControls) els.circleControls.hidden = nextMode !== "circle";
    if (els.editOperationControls) els.editOperationControls.hidden = !AREA_MODES.has(nextMode) || (drawingProfile === "pathologist" && nextMode === "brush");
    setEditOperation(editOperation);
    updatePolygonActions();
    updatePathologistActions();
    updateCircleActions();
    updateSelectionActions();
    drawAnnotations();
    updateDiagnostics();
  }

  function updatePolygonActions() {
    const active = mode === "polygon" && polygonDraft.length > 0;
    els.polygonActions.hidden = !active;
    els.finishPolygon.disabled = polygonDraft.length < 3;
  }


  function updateCircleActions() {
    if (!els.circleActions) return;
    const active = mode === "circle" && Boolean(circleDraft);
    els.circleActions.hidden = !active;
    if (!active) return;
    els.finishCircle.disabled = !circleDraft.pointB || geometryBusy;
    if (!circleDraft.pointB) els.circleInstruction.textContent = circleMethod === "center-radius" ? "Tap a radius point" : "Tap the opposite edge";
    else els.circleInstruction.textContent = "Adjust width/height if needed";
  }

  function circleGeometryFromDraft() {
    if (!circleDraft?.pointA || !circleDraft?.pointB) return null;
    const [x1, y1] = circleDraft.pointA;
    const [x2, y2] = circleDraft.pointB;
    let cx, cy, baseRadius, angle = 0;
    if (circleMethod === "edge-edge") {
      cx = (x1 + x2) / 2; cy = (y1 + y2) / 2;
      baseRadius = Math.hypot(x2 - x1, y2 - y1) / 2;
      angle = Math.atan2(y2 - y1, x2 - x1);
    } else {
      cx = x1; cy = y1;
      baseRadius = Math.hypot(x2 - x1, y2 - y1);
    }
    if (!Number.isFinite(baseRadius) || baseRadius <= 0) return null;
    const rx = baseRadius * circleWidthScale;
    const ry = baseRadius * circleHeightScale;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const points = [];
    const segments = 96;
    for (let index = 0; index < segments; index += 1) {
      const t = (index / segments) * Math.PI * 2;
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      points.push([cx + ex * cosA - ey * sinA, cy + ex * sinA + ey * cosA]);
    }
    return polygonGeometry(points);
  }

  async function finishCircleDraft() {
    if (!circleDraft?.pointB || geometryBusy) return;
    const geometry = circleGeometryFromDraft();
    if (!geometry) return;
    const operation = circleDraft.operation || editOperation;
    geometryBusy = true; updateControls();
    try {
      if (await commitGeometry(geometry, { tool: "ellipse" }, operation)) {
        circleDraft = null; updateCircleActions(); drawAnnotations();
      }
    } catch (error) { setStatus(`Could not finish circle: ${error.message}`, "error"); }
    finally { geometryBusy = false; updateControls(); }
  }

  function cancelCircleDraft() {
    circleDraft = null;
    updateCircleActions();
    drawAnnotations();
  }

  function pathologistCurrentRing() {
    if (!pathologistDraft) return null;
    if (pathologistDraft.current === "outer") return pathologistDraft.outer;
    const index = pathologistDraft.currentHoleIndex;
    return Number.isInteger(index) ? pathologistDraft.holes[index] : null;
  }

  function updatePathologistActions() {
    if (!els.pathologistActions) return;
    // Pathologist controls are intentionally shown only while the stylus is
    // lifted. While a freehand segment is actively being drawn they would be
    // impossible to press and can cover the tissue being traced.
    const strokeActive = activeDraft?.type === "freehand-pathologist" || Boolean(pointerState);
    const active = drawingProfile === "pathologist" && mode === "freehand" && Boolean(pathologistDraft) && !strokeActive;
    els.pathologistActions.hidden = !active;
    if (!active) return;
    els.finishPathologistContour.disabled = (pathologistDraft.outer?.length || 0) < 3 || geometryBusy;
    els.addPathologistHole.disabled = (pathologistDraft.outer?.length || 0) < 3 || geometryBusy;
    els.cancelPathologistContour.disabled = geometryBusy;
    els.addPathologistHole.textContent = pathologistDraft.current === "hole" ? "○ New inner contour" : "○ Inner contour";
  }

  function beginPathologistHole() {
    if (!pathologistDraft || pathologistDraft.outer.length < 3) return;
    pathologistDraft.holes.push([]);
    pathologistDraft.current = "hole";
    pathologistDraft.currentHoleIndex = pathologistDraft.holes.length - 1;
    updatePathologistActions();
    drawAnnotations();
    setStatus("Inner contour: draw the area to exclude, pausing whenever needed", "saved");
  }

  function cancelPathologistDraft() {
    pathologistDraft = null;
    activeDraft = null;
    pointerState = null;
    updatePathologistActions();
    drawAnnotations();
    setStatus("Draft cancelled", "local");
  }

  async function completePathologistDraft() {
    if (!pathologistDraft || pathologistDraft.outer.length < 3 || geometryBusy) return;
    geometryBusy = true;
    updateControls();
    try {
      const outer = prepareFreehandPolygon(pathologistDraft.outer);
      if (outer.length < 3) throw new Error("Outer contour is too small");
      let geometry = polygonGeometry(outer);
      for (const rawHole of pathologistDraft.holes) {
        if (rawHole.length < 3) continue;
        const hole = prepareFreehandPolygon(rawHole);
        if (hole.length < 3) continue;
        // Difference instead of a raw GeoJSON hole permits the inner contour to
        // touch the outer contour while still producing a valid Polygon/MultiPolygon.
        geometry = await requestBooleanGeometry(geometry, polygonGeometry(hole), "subtract");
        if (!geometry) break;
      }
      if (geometry) {
        const operation = pathologistDraft.operation || editOperation;
        await commitGeometry(geometry, { tool: "freehand", workflow: "pathologist", contours: 1 + pathologistDraft.holes.length }, operation);
      }
      pathologistDraft = null;
      activeDraft = null;
      pointerState = null;
      updatePathologistActions();
      drawAnnotations();
    } catch (error) {
      setStatus(`Could not complete annotation: ${error.message}`, "error");
    } finally {
      geometryBusy = false;
      updateControls();
    }
  }

  function stopPointerEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function trackPenLifecycle(event) {
    const pointerType = event.pointerType || "unknown";
    lastPointerType = pointerType;
    if (pointerType !== "pen") return;
    if (event.type === "pointerdown") {
      activePenPointers.add(event.pointerId);
      suppressTouchUntil = Number.POSITIVE_INFINITY;
    } else if (event.type === "pointerup" || event.type === "pointercancel") {
      activePenPointers.delete(event.pointerId);
      if (!activePenPointers.size) suppressTouchUntil = Date.now() + 650;
    }
  }

  function suppressPalmTouch(event) {
    if (event.pointerType !== "touch") return false;
    if (!activePenPointers.size && Date.now() >= suppressTouchUntil) return false;
    stopPointerEvent(event);
    return true;
  }

  function captureAnnotationEvent(event) {
    if (!currentImage || mode === "navigate") return false;
    // The overview navigator is always a navigation surface, even while an
    // annotation tool is active. This lets touch or stylus taps jump directly.
    if (event.target?.closest?.(".navigator")) return false;

    // Fingers are reserved for OpenSeadragon navigation. Only pen (and desktop
    // left mouse as a fallback) create or edit annotations.
    if (event.pointerType === "touch") return false;
    if (event.pointerType === "mouse") {
      if (event.type === "pointerdown" && event.button !== 0) return false;
      if (event.type === "pointermove" && pointerState && (event.buttons & 1) !== 1) return false;
    }
    if (event.pointerType !== "pen" && event.pointerType !== "mouse") return false;

    stopPointerEvent(event);
    lastPointerType = event.pointerType || "unknown";
    updateDiagnostics();
    return true;
  }

  function viewerPositionFromPointer(event) {
    const rect = viewer.container.getBoundingClientRect();
    return new OpenSeadragon.Point(event.clientX - rect.left, event.clientY - rect.top);
  }

  function imagePointFromPointer(event) {
    return imagePointFromViewerPosition(viewerPositionFromPointer(event));
  }

  function handlePointerDown(event) {
    trackPenLifecycle(event);
    if (suppressPalmTouch(event)) return;
    if (!captureAnnotationEvent(event)) {
      updateDiagnostics();
      return;
    }
    const viewerPosition = viewerPositionFromPointer(event);
    const point = imagePointFromViewerPosition(viewerPosition);
    if (!point) return;
    try { viewer.container.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }

    if (mode === "wand") {
      const operation = operationForEvent(event);
      if (!requireSelectedForOperation(operation)) return;
      wandCursor = viewerPosition;
      drawAnnotations();
      runWand(point, operation).catch((error) => setStatus(`Wand error: ${error.message}`, "error"));
      return;
    }

    if (mode === "polygon") {
      const operation = polygonDraft.length ? polygonOperation : operationForEvent(event);
      if (!requireSelectedForOperation(operation)) return;
      if (!polygonDraft.length) polygonOperation = operation;
      if (polygonDraft.length >= 3 && isNearFirstPolygonPoint(viewerPosition)) {
        finishPolygon();
        return;
      }
      polygonDraft.push(point);
      updatePolygonActions();
      drawAnnotations();
      setStatus(`Polygon: ${polygonDraft.length} points; tap the first point to finish`, "saved");
      return;
    }
    if (mode === "circle") {
      const operation = circleDraft ? circleDraft.operation : operationForEvent(event);
      if (!requireSelectedForOperation(operation)) return;
      if (!circleDraft) circleDraft = { pointA: point, pointB: null, operation };
      else if (!circleDraft.pointB) circleDraft.pointB = point;
      else circleDraft.pointB = point;
      updateCircleActions();
      drawAnnotations();
      return;
    }
    if (mode === "select") {
      pointerState = { id: event.pointerId, type: event.pointerType, start: point };
      activeDraft = { type: "selection", points: [point], additive: Boolean(event.shiftKey), startViewer: viewerPosition };
      drawAnnotations();
      return;
    }
    let operation = operationForEvent(event);
    if (drawingProfile === "pathologist" && mode === "brush") {
      const selected = selectedId ? findFeature(selectedId) : null;
      const selectedClass = selected?.properties?.classification?.name || "";
      operation = selected && selectedClass === currentClass.name ? "add" : "new";
    }
    if (!requireSelectedForOperation(operation)) return;
    pointerState = { id: event.pointerId, type: event.pointerType, start: point };
    if (mode === "freehand" && drawingProfile === "pathologist") {
      if (!pathologistDraft) pathologistDraft = { outer: [], holes: [], current: "outer", currentHoleIndex: null, operation };
      activeDraft = { type: "freehand-pathologist", points: [point], operation };
      // Hide Complete / Inner contour / Cancel during the active pen stroke.
      updatePathologistActions();
    } else if (mode === "freehand") activeDraft = { type: "freehand", points: [point], operation };
    else if (mode === "brush") {
      const radius = screenToleranceToImage(brushDiameterPx / 2);
      activeDraft = { type: "brush", points: [point], radius, diameterPx: brushDiameterPx, operation };
      brushCursor = viewerPosition;
    } else if (mode === "rectangle") activeDraft = { type: "rectangle", start: point, end: point, operation };
    drawAnnotations();
  }

  function handlePointerMove(event) {
    trackPenLifecycle(event);
    if (suppressPalmTouch(event)) return;
    if ((mode === "brush" || mode === "wand") && currentImage && (event.pointerType === "pen" || event.pointerType === "mouse")) {
      const cursor = viewerPositionFromPointer(event);
      if (mode === "brush") brushCursor = cursor;
      else wandCursor = cursor;
      drawAnnotations();
    }
    if (!pointerState || event.pointerId !== pointerState.id || !activeDraft) return;
    if (!captureAnnotationEvent(event)) return;
    const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
    for (const sample of samples.length ? samples : [event]) {
      const point = imagePointFromPointer(sample);
      if (!point) continue;
      if (activeDraft.type === "freehand" || activeDraft.type === "freehand-pathologist" || activeDraft.type === "brush" || activeDraft.type === "selection") {
        const last = activeDraft.points[activeDraft.points.length - 1];
        const threshold = activeDraft.type === "brush" ? Math.max(0.2, activeDraft.radius * 0.18) : screenToleranceToImage(activeDraft.type === "selection" ? 2.0 : 0.5);
        if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > threshold) activeDraft.points.push(point);
      } else if (activeDraft.type === "rectangle") {
        activeDraft.end = point;
      }
    }
    drawAnnotations();
  }

  async function buildBrushGeometry(centerline, radius) {
    const fallbackOutline = () => {
      const rawOutline = strokeToPolygon(centerline, radius);
      const smoothedOutline = smoothClosedPath(rawOutline, 2, 0.16);
      const outline = simplifyRdp(smoothedOutline, Math.max(0.12, radius * 0.035));
      return outline.length >= 3 ? polygonGeometry(outline) : null;
    };
    try {
      const response = await apiFetch(`${API}/geometry/brush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: centerline.map(([x, y]) => [roundCoordinate(x), roundCoordinate(y)]),
          radius: roundCoordinate(radius),
          simplifyTolerance: Math.max(0.08, radius * 0.025),
        }),
      });
      const payload = await response.json();
      return payload.geometry || fallbackOutline();
    } catch (error) {
      console.warn("Server brush union unavailable; using local fallback", error);
      setStatus("Brush area created locally; server geometry cleanup was unavailable", "local");
      return fallbackOutline();
    }
  }

  async function finalizeActiveDraft() {
    if (!activeDraft || geometryBusy) return;
    const draft = activeDraft;
    activeDraft = null;
    pointerState = null;

    // Pausing a Pathologist freehand contour is a purely local operation.
    // Do it before entering the geometryBusy state so the contextual buttons
    // become immediately visible *after* pen-up and remain tappable.
    if (draft.type === "freehand-pathologist") {
      const ring = pathologistCurrentRing();
      if (ring && draft.points.length) {
        const preparedSegment = prepareOpenStroke(draft.points, Math.max(0.08, screenToleranceToImage(0.12)));
        if (preparedSegment.length) {
          if (ring.length && preparedSegment.length && Math.hypot(ring[ring.length - 1][0] - preparedSegment[0][0], ring[ring.length - 1][1] - preparedSegment[0][1]) < screenToleranceToImage(5)) preparedSegment.shift();
          ring.push(...preparedSegment);
        }
      }
      setStatus("Paused — pan/zoom with fingers, then continue with the stylus or complete the annotation", "saved");
      updateControls();
      updatePathologistActions();
      drawAnnotations();
      return;
    }

    if (draft.type === "selection") {
      const points = prepareOpenStroke(draft.points, Math.max(0.2, screenToleranceToImage(0.5)));
      const firstScreen = screenPointFromImage(points[0] || draft.points[0]);
      const lastScreen = screenPointFromImage(points[points.length - 1] || draft.points[0]);
      const travelPx = firstScreen && lastScreen ? Math.hypot(lastScreen.x - firstScreen.x, lastScreen.y - firstScreen.y) : 0;
      if (points.length < 3 || travelPx < 10) {
        const id = hitTest(draft.points[draft.points.length - 1] || draft.points[0]);
        if (draft.additive) {
          if (id && selectedIds.has(String(id))) selectedIds.delete(String(id));
          else if (id) selectedIds.add(String(id));
          selectedId = selectedIds.has(String(id)) ? String(id) : (selectedIds.size ? [...selectedIds][0] : null);
        } else setSingleSelection(id);
        const feature = selectedId ? findFeature(selectedId) : null;
        syncCurrentClassFromFeature(feature);
        updateControls(); drawAnnotations();
        return;
      }
      geometryBusy = true; updateControls();
      try {
        const regionPoints = prepareFreehandPolygon(points);
        if (regionPoints.length < 3) throw new Error("Selection area is too small");
        const response = await apiFetch(`${API}/geometry/select`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region: polygonGeometry(regionPoints), features: featureCollection.features.map((feature) => ({ id: featureId(feature), geometry: feature.geometry })) }),
        });
        const payload = await response.json();
        const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
        if (draft.additive) setMultiSelection([...new Set([...selectedIds, ...ids])], selectedId);
        else setMultiSelection(ids);
        const feature = selectedId ? findFeature(selectedId) : null;
        syncCurrentClassFromFeature(feature);
        setStatus(ids.length ? `${ids.length} annotations selected` : "No annotations fully inside the selection area", ids.length ? "saved" : "local");
      } catch (error) { setStatus(`Selection error: ${error.message}`, "error"); }
      finally { geometryBusy = false; updateControls(); drawAnnotations(); }
      return;
    }

    geometryBusy = true;
    updateControls();
    drawAnnotations();
    try {
      if (draft.type === "freehand" && draft.points.length >= 3) {
        const prepared = prepareFreehandPolygon(draft.points);
        if (prepared.length >= 3) {
          await commitGeometry(polygonGeometry(prepared), {
            tool: "freehand",
            smoothing: "tail-trim-and-closed-smoothing-v1",
          }, draft.operation);
        }
      } else if (draft.type === "brush") {
        const centerline = prepareOpenStroke(draft.points, Math.max(0.15, draft.radius * 0.07));
        const geometry = await buildBrushGeometry(centerline, draft.radius);
        if (geometry) {
          // Store only the painted area. The stylus path is deliberately not
          // retained because it has no meaning after the area is created.
          await commitGeometry(geometry, { tool: "brush", areaOnly: true }, draft.operation);
        }
      } else if (draft.type === "rectangle") {
        const [x1, y1] = draft.start;
        const [x2, y2] = draft.end;
        if (Math.abs(x2 - x1) > screenToleranceToImage(3) && Math.abs(y2 - y1) > screenToleranceToImage(3)) {
          await commitGeometry(polygonGeometry([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]), { tool: "rectangle" }, draft.operation);
        }
      }
    } catch (error) {
      setStatus(`Could not finish annotation: ${error.message}`, "error");
    } finally {
      geometryBusy = false;
      updateControls();
      updatePathologistActions();
      drawAnnotations();
    }
  }

  function handlePointerUp(event) {
    trackPenLifecycle(event);
    if (suppressPalmTouch(event)) return;
    if (!pointerState || event.pointerId !== pointerState.id) {
      updateDiagnostics();
      return;
    }
    captureAnnotationEvent(event);
    finalizeActiveDraft().catch((error) => setStatus(`Could not finish annotation: ${error.message}`, "error"));
    try { viewer.container.releasePointerCapture(event.pointerId); } catch (_) { /* optional */ }
  }

  function handlePointerCancel(event) {
    trackPenLifecycle(event);
    if (suppressPalmTouch(event)) return;
    if (!pointerState || event.pointerId !== pointerState.id) {
      updateDiagnostics();
      return;
    }
    captureAnnotationEvent(event);
    activeDraft = null;
    pointerState = null;
    updatePathologistActions();
    drawAnnotations();
  }

  function handlePointerLeave(event) {
    if ((mode === "brush" || mode === "wand") && !pointerState && event.pointerType !== "touch") {
      if (mode === "brush") brushCursor = null;
      else wandCursor = null;
      drawAnnotations();
    }
  }

  function imagePointFromViewerPosition(position) {
    if (!viewer || !viewer.world.getItemCount()) return null;
    const item = viewer.world.getItemAt(0);
    const viewportPoint = viewer.viewport.pointFromPixel(position, true);
    const imagePoint = item.viewportToImageCoordinates(viewportPoint);
    return [imagePoint.x, imagePoint.y];
  }

  function screenPointFromImage(point) {
    if (!viewer || !viewer.world.getItemCount()) return null;
    const item = viewer.world.getItemAt(0);
    const viewportPoint = item.imageToViewportCoordinates(point[0], point[1]);
    return viewer.viewport.pixelFromPoint(viewportPoint, true);
  }

  function isNearFirstPolygonPoint(viewerPosition, thresholdPx = 16) {
    if (!polygonDraft.length) return false;
    const first = screenPointFromImage(polygonDraft[0]);
    return Boolean(first && Math.hypot(first.x - viewerPosition.x, first.y - viewerPosition.y) <= thresholdPx);
  }

  async function finishPolygon() {
    if (polygonDraft.length < 3 || geometryBusy) return;
    const points = polygonDraft.map(([x, y]) => [x, y]);
    const operation = polygonOperation;
    if (!requireSelectedForOperation(operation)) return;
    geometryBusy = true;
    updateControls();
    try {
      const committed = await commitGeometry(polygonGeometry(points), { tool: "polygon" }, operation);
      if (committed) {
        polygonDraft = [];
        polygonOperation = "new";
        updatePolygonActions();
        drawAnnotations();
      }
    } catch (error) {
      setStatus(`Could not finish polygon: ${error.message}`, "error");
    } finally {
      geometryBusy = false;
      updateControls();
    }
  }

  function cancelPolygon() {
    polygonDraft = [];
    polygonOperation = "new";
    updatePolygonActions();
    drawAnnotations();
    setStatus("Polygon cancelled", "local");
  }

  function closeRing(points) {
    const ring = points.map(([x, y]) => [roundCoordinate(x), roundCoordinate(y)]);
    if (!ring.length) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    return ring;
  }

  function polygonGeometry(points) {
    return { type: "Polygon", coordinates: [closeRing(points)] };
  }

  async function requestBooleanGeometry(subject, operand, operation) {
    const response = await apiFetch(`${API}/geometry/boolean`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        operand,
        operation: ({ add: "union", union: "union", subtract: "difference", difference: "difference", intersect: "intersection", intersection: "intersection" })[operation] || "difference",
        simplifyTolerance: Math.max(0.05, screenToleranceToImage(0.18)),
      }),
    });
    const payload = await response.json();
    return payload.geometry || null;
  }

  function createAnnotationFeature(geometry) {
    return {
      type: "Feature",
      id: uid(),
      geometry: deepClone(geometry),
      properties: {
        objectType: "annotation",
        classification: { name: currentClass.name, color: hexToRgbArray(currentClass.color) },
        isLocked: false,
      },
    };
  }

  async function commitGeometry(geometry, metadata = {}, operation = editOperation) {
    if (!geometry) return false;
    if (!requireSelectedForOperation(operation)) return false;
    if (operation === "new") {
      pushUndo();
      const feature = createAnnotationFeature(geometry);
      featureCollection.features.push(feature);
      setSingleSelection(String(feature.id));
      markChanged();
      setStatus(`${metadata.tool || "Area"} annotation created`, "saved");
      return true;
    }

    const feature = findFeature(selectedId);
    if (!feature) return false;
    setStatus(operation === "add" ? "Adding to selected annotation…" : "Subtracting from selected annotation…");
    const result = await requestBooleanGeometry(feature.geometry, geometry, operation);
    pushUndo();
    if (!result) {
      const index = featureCollection.features.findIndex((item) => featureId(item) === selectedId);
      if (index >= 0) featureCollection.features.splice(index, 1);
      clearSelectedFeatures(false);
      setStatus("The selected annotation was completely removed", "saved");
    } else {
      // Keep the same object id, class, name and QuPath properties; only its ROI
      // changes, matching the way QuPath edits a selected annotation.
      feature.geometry = result;
      setStatus(operation === "add" ? "Area added to selected annotation" : "Area removed from selected annotation", "saved");
    }
    markChanged();
    return true;
  }

  function featureId(feature) {
    if (!feature.id) feature.id = uid();
    return String(feature.id);
  }

  function findFeature(id) {
    return featureCollection.features.find((feature) => featureId(feature) === String(id));
  }


  async function combineSelected(operation) {
    const features = selectedFeatures();
    if (features.length < 2 || !selectionSameClass() || geometryBusy) return;
    let primary = selectedId ? findFeature(selectedId) : null;
    if (!primary || !selectedIds.has(featureId(primary))) primary = features[0];
    const others = features.filter((feature) => featureId(feature) !== featureId(primary));
    geometryBusy = true; updateControls();
    try {
      let result = deepClone(primary.geometry);
      for (const feature of others) {
        const op = operation === "merge" ? "union" : operation === "intersect" ? "intersection" : "difference";
        result = await requestBooleanGeometry(result, feature.geometry, op);
        if (!result) break;
      }
      if (!result) {
        setStatus(operation === "intersect" ? "Selected annotations have no common intersection" : "The operation would remove the primary annotation", "local");
        return;
      }
      pushUndo();
      primary.geometry = result;
      const removeIds = new Set(others.map(featureId));
      featureCollection.features = featureCollection.features.filter((feature) => !removeIds.has(featureId(feature)));
      setSingleSelection(featureId(primary));
      markChanged();
      setStatus(operation === "merge" ? "Selected annotations merged" : operation === "intersect" ? "Intersection created" : "Other selected areas subtracted from the primary annotation", "saved");
    } catch (error) { setStatus(`Geometry operation failed: ${error.message}`, "error"); }
    finally { geometryBusy = false; updateControls(); drawAnnotations(); }
  }

  function deleteSelectedAnnotations() {
    if (!selectedIds.size) return;
    pushUndo();
    const doomed = new Set(selectedIds);
    featureCollection.features = featureCollection.features.filter((feature) => !doomed.has(featureId(feature)));
    clearSelectedFeatures(false);
    markChanged();
  }

  function deleteSelected() { deleteSelectedAnnotations(); }

  function pushUndo() {
    undoStack.push(deepClone(featureCollection.features));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateControls();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(deepClone(featureCollection.features));
    featureCollection.features = undoStack.pop();
    clearSelectedFeatures(false);
    markChanged();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(deepClone(featureCollection.features));
    featureCollection.features = redoStack.pop();
    clearSelectedFeatures(false);
    markChanged();
  }

  function markChanged() {
    dirty = true;
    updateControls();
    drawAnnotations();
    scheduleLocalDraft();
    setStatus("Saving locally; server sync will follow automatically…", "local");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveAnnotations(false), 1200);
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (dirty && navigator.onLine) saveAnnotations(false);
    }, 10000);
  }

  async function saveAnnotations(showConfirmation = true) {
    if (!currentImage || !dirty) return;
    clearTimeout(saveTimer);
    const image = currentImage;
    const payload = deepClone(featureCollection);
    await persistLocalDraft(true, image, payload);

    if (!navigator.onLine) {
      setStatus("Offline: annotations are safe on this device and waiting to sync", "local");
      scheduleRetry();
      return;
    }

    try {
      const response = await apiFetch(`${API}/annotations/${image.id}?file=${encodeURIComponent(currentAnnotationFile)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      const normalizedPayload = result?.featureCollection?.type === "FeatureCollection" ? normalizeFeatureCollectionClient(result.featureCollection) : payload;
      await persistLocalDraft(false, image, normalizedPayload);
      if (currentImage?.id === image.id && currentAnnotationFile === (result.annotationFile || currentAnnotationFile)) {
        featureCollection = normalizedPayload;
        featureCollection.features.forEach(featureId);
        dirty = false;
        const repaired = Number(result?.report?.repaired || 0);
        setStatus(`Saved to server: ${result.features} annotations${repaired ? ` · ${repaired} geometry repaired` : ""}`, "saved");
        updateControls();
        if (!showConfirmation) setTimeout(() => {
          if (!dirty && currentImage?.id === image.id) setStatus(`${image.name} • synced`, "saved");
        }, 1300);
      }
    } catch (error) {
      setStatus(`Saved on this device; server sync pending: ${error.message}`, "local");
      scheduleRetry();
    }
  }

  function updateControls() {
    const enabled = Boolean(currentImage);
    els.saveButton.disabled = !enabled || !dirty || geometryBusy;
    els.exportButton.disabled = !enabled;
    els.importGeoJsonButton.disabled = !enabled;
    els.downloadOriginalButton.disabled = !enabled;
    if (els.downloadOfflineButton) els.downloadOfflineButton.disabled = !enabled || !currentInfo;
    els.imageInfoButton.disabled = !enabled;
    if (els.imageTypeSelect) els.imageTypeSelect.disabled = !enabled;
    if (els.eyeButton) els.eyeButton.disabled = !enabled;
    if (els.displayButton) els.displayButton.disabled = !enabled;
    if (els.annotationFileSelect) els.annotationFileSelect.disabled = !enabled;
    if (els.newAnnotationFileButton) els.newAnnotationFileButton.disabled = !enabled;
    els.undoButton.disabled = undoStack.length === 0 || geometryBusy;
    els.redoButton.disabled = redoStack.length === 0 || geometryBusy;
    document.querySelectorAll("[data-edit-operation]").forEach((button) => {
      button.disabled = !enabled || geometryBusy;
    });
    const annotationCount = featureCollection.features.length;
    els.featureCount.textContent = String(annotationCount);
    els.annotationSummary.textContent = `${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`;
    renderClassButtons();
    setEditOperation(editOperation);
    updatePolygonActions();
    updateCircleActions();
    updateSelectionActions();
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index >= 3 ? 2 : 1)} ${units[index]}`;
  }

  function renderAnnotationFileOptions() {
    if (!els.annotationFileSelect) return;
    els.annotationFileSelect.innerHTML = "";
    for (const name of annotationFiles) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      els.annotationFileSelect.append(option);
    }
    if (!annotationFiles.includes(currentAnnotationFile)) currentAnnotationFile = "Default";
    els.annotationFileSelect.value = currentAnnotationFile;
    els.annotationFileSelect.disabled = !currentImage;
    els.newAnnotationFileButton.disabled = !currentImage;
  }

  async function loadAnnotationFiles(imageId = currentImage?.id, preserve = true) {
    if (!imageId) { annotationFiles = ["Default"]; currentAnnotationFile = "Default"; renderAnnotationFileOptions(); return; }
    try {
      const response = await apiFetch(`${API}/annotations/${imageId}/files`);
      const payload = await response.json();
      annotationFiles = Array.isArray(payload.files) && payload.files.length ? payload.files : ["Default"];
      await putMeta(`files:${imageId}`, annotationFiles);
      if (!preserve || !annotationFiles.includes(currentAnnotationFile)) currentAnnotationFile = "Default";
      renderAnnotationFileOptions();
    } catch (error) {
      const cached = await getMeta(`files:${imageId}`);
      const drafts = (await idbGetAll(DB_STORE)).filter((record) => record?.sourceImageId === imageId).map((record) => record.annotationFile || "Default");
      annotationFiles = Array.from(new Set(["Default", ...(Array.isArray(cached) ? cached : []), ...drafts]));
      if (!preserve || !annotationFiles.includes(currentAnnotationFile)) currentAnnotationFile = "Default";
      renderAnnotationFileOptions();
      if (navigator.onLine) setStatus(`Annotation-file list unavailable; using the local copy: ${error.message}`, "local");
    }
  }

  async function loadSelectedAnnotationFile(name) {
    if (!currentImage) return;
    if (dirty) await saveAnnotations(false);
    currentAnnotationFile = name || "Default";
    renderAnnotationFileOptions();
    clearSelectedFeatures(false); undoStack = []; redoStack = []; pathologistDraft = null; activeDraft = null; pointerState = null;
    const localDraft = await getLocalDraft(currentImage.id, currentAnnotationFile);
    let serverCollection = null;
    try {
      const response = await apiFetch(`${API}/annotations/${currentImage.id}?file=${encodeURIComponent(currentAnnotationFile)}`);
      serverCollection = normalizeFeatureCollectionClient(await response.json());
    } catch (_) { /* offline or VPN unavailable */ }
    if (localDraft?.pending && localDraft.featureCollection?.type === "FeatureCollection") {
      featureCollection = normalizeFeatureCollectionClient(localDraft.featureCollection); dirty = true; localDraftState = "Recovered locally";
    } else if (serverCollection) {
      featureCollection = serverCollection; dirty = false; localDraftState = "Synced"; persistLocalDraft(false, currentImage, featureCollection);
    } else if (localDraft?.featureCollection?.type === "FeatureCollection") {
      featureCollection = normalizeFeatureCollectionClient(localDraft.featureCollection); dirty = Boolean(localDraft.pending); localDraftState = localDraft.pending ? "Saved locally" : "Local copy";
    } else {
      featureCollection = { type: "FeatureCollection", features: [] }; dirty = false; localDraftState = "Offline local file";
      await persistLocalDraft(false, currentImage, featureCollection);
    }
    featureCollection.features.forEach(featureId);
    drawAnnotations(); updateControls(); updateDiagnostics();
    setStatus(`${currentAnnotationFile} • ${featureCollection.features.length} annotations`, navigator.onLine ? "saved" : "local");
  }

  async function createAnnotationFile() {
    if (!currentImage) return;
    const raw = window.prompt("New annotation file name (for example: Pathologist A)");
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    if (!/^[A-Za-z0-9 _.-]{1,80}$/.test(name) || name === "." || name === "..") {
      setStatus("Invalid annotation file name", "error"); return;
    }
    if (!annotationFiles.includes(name)) annotationFiles.push(name);
    currentAnnotationFile = name;
    await putMeta(`files:${currentImage.id}`, annotationFiles);
    renderAnnotationFileOptions();
    featureCollection = { type: "FeatureCollection", features: [] };
    dirty = false; localDraftState = navigator.onLine ? "New local file" : "Offline local file";
    await persistLocalDraft(false, currentImage, featureCollection);
    drawAnnotations(); updateControls(); updateDiagnostics();
    if (navigator.onLine) {
      try {
        const response = await apiFetch(`${API}/annotations/${currentImage.id}/files`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
        });
        const payload = await response.json();
        annotationFiles = payload.files || annotationFiles;
        await putMeta(`files:${currentImage.id}`, annotationFiles);
        renderAnnotationFileOptions();
      } catch (_) {
        setStatus("Annotation file created locally; it will sync when annotations are saved", "local");
      }
    } else {
      setStatus("Annotation file created locally", "local");
    }
  }


  async function loadImages(preserveSelection = true) {
    const sequence = ++imageCatalogSequence;
    const previous = preserveSelection
      ? (els.imageSelect.value || currentImage?.id || "")
      : "";

    let localState = {
      readyIds: new Set(),
      partialIds: new Set(),
      pendingIds: new Set(),
    };

    let offlineRecords = [];
    let catalog = [];

    // ---------------------------------------------------------
    // 1. LOCAL FIRST
    // Local storage problems must never prevent the server list
    // from being loaded.
    // ---------------------------------------------------------
    try {
      [catalog, offlineRecords] = await Promise.all([
        restoreCachedCatalog(),
        listOfflineRecords(),
      ]);

      const packageImages = offlineRecords
        .map((item) => item.image)
        .filter(Boolean);

      images = mergeKnownImages(catalog, packageImages);

      localState = await collectLocalImageState(offlineRecords);

      renderImageOptions(previous, localState);

      if (images.length) {
        const downloadedCount = images.filter(
          (image) => localState.readyIds.has(image.id)
        ).length;

        setStatus(
          `${images.length} cached file${images.length === 1 ? "" : "s"} available immediately` +
          `${downloadedCount ? ` · ${downloadedCount} downloaded` : ""}`,
          "local"
        );
      }
    } catch (error) {
      console.warn(
        "Could not restore local image catalog",
        error
      );
    }

    // navigator.onLine is useful in a browser, but Android
    // WebView/VPN connectivity can report an unreliable value.
    // Native Android therefore always attempts the API request.
    if (!IS_NATIVE && !navigator.onLine) {
      serverReachable = false;

      if (!images.length) {
        setStatus(
          "Offline: no cached files are available on this device",
          "local"
        );
      }

      return;
    }

    if (!images.length) {
      setStatus("Checking the server for files…", "local");
    }

    let diagnosticStage = "starting";

    try {
      // -------------------------------------------------------
      // 2. GET REMOTE CATALOG
      // -------------------------------------------------------
      diagnosticStage = "requesting /api/images";

      const response = await apiFetch(
        `${API}/images`,
        { timeoutMs: 10000 }
      );

      diagnosticStage = "reading /api/images JSON";

      const payload = await response.json();

      if (sequence !== imageCatalogSequence) {
        return;
      }

      diagnosticStage = "validating image catalog";

      if (
        !payload ||
        !Array.isArray(payload.images)
      ) {
        throw new Error(
          "The server response does not contain an images array"
        );
      }

      const remoteImages = payload.images;

      serverReachable = true;

      // -------------------------------------------------------
      // 3. RENDER FIRST
      //
      // Important:
      // Do NOT wait for IndexedDB before displaying server files.
      // -------------------------------------------------------
      diagnosticStage = "reading local file state";

      try {
        offlineRecords = await listOfflineRecords();
        localState = await collectLocalImageState(
          offlineRecords
        );
      } catch (localError) {
        console.warn(
          "Could not read local file state",
          localError
        );

        offlineRecords = [];

        localState = {
          readyIds: new Set(),
          partialIds: new Set(),
          pendingIds: new Set(),
        };
      }

      diagnosticStage = "merging image catalog";

      const packageImages = offlineRecords
        .map((item) => item.image)
        .filter(Boolean);

      images = mergeKnownImages(
        packageImages,
        remoteImages
      );

      diagnosticStage = "rendering Files";

      renderImageOptions(
        previous,
        localState
      );

      setStatus(
        `${remoteImages.length} server file${remoteImages.length === 1 ? "" : "s"} found`,
        "saved"
      );

      // -------------------------------------------------------
      // 4. CACHE AFTER RENDERING
      //
      // Failure here is non-fatal.
      // -------------------------------------------------------
      diagnosticStage = "saving image catalog locally";

      try {
        await cacheImageCatalog(payload);
      } catch (cacheError) {
        console.warn(
          "Files loaded, but catalog cache could not be saved",
          cacheError
        );
      }

      console.log(
        "HistoAnnotator Files loaded",
        {
          native: IS_NATIVE,
          origin: window.location.origin,
          api: API,
          serverFiles: remoteImages.length,
          totalFiles: images.length,
          navigatorOnline: navigator.onLine,
        }
      );

    } catch (error) {
      if (sequence !== imageCatalogSequence) {
        return;
      }

      serverReachable = false;

      const errorMessage =
        error?.message ||
        String(error) ||
        "Unknown error";

      console.error(
        "HistoAnnotator Files error",
        {
          stage: diagnosticStage,
          error,
          native: IS_NATIVE,
          origin: window.location.origin,
          api: API,
          navigatorOnline: navigator.onLine,
        }
      );

      // Keep whatever local files are available.
      try {
        const currentOfflineRecords =
          await listOfflineRecords();

        const cached =
          await restoreCachedCatalog();

        images = mergeKnownImages(
          cached,
          currentOfflineRecords
            .map((item) => item.image)
            .filter(Boolean)
        );

        localState =
          await collectLocalImageState(
            currentOfflineRecords
          );

        renderImageOptions(
          previous,
          localState
        );
      } catch (localError) {
        console.warn(
          "Could not restore Files after server error",
          localError
        );
      }

      // Since Krypton is remote, expose the exact error directly
      // on the Android tablet during alpha testing.
      if (IS_NATIVE) {
        window.alert(
          [
            "HistoAnnotator Android diagnostics",
            "",
            `Stage: ${diagnosticStage}`,
            `Error: ${errorMessage}`,
            "",
            `Origin: ${window.location.origin}`,
            `API: ${API}`,
            `navigator.onLine: ${navigator.onLine}`,
            `Native: ${IS_NATIVE}`,
          ].join("\n")
        );
      }

      setStatus(
        `Files error: ${diagnosticStage} · ${errorMessage}`,
        "error"
      );
    }
  }

  async function ensurePrepared(image, sequence) {
    if (!image.needsPreparation || image.prepared) return true;
    let response = await apiFetch(`${API}/images/${image.id}/prepare`);
    let status = await response.json();
    if (!status.ready && status.state === "pending") {
      response = await apiFetch(`${API}/images/${image.id}/prepare`, { method: "POST" });
      status = await response.json();
    }
    while (!status.ready) {
      if (sequence !== openSequence) return false;
      if (status.state === "error") throw new Error(status.message || "Could not prepare the image");
      const copied = status.copiedBytes ? ` (${formatBytes(status.copiedBytes)} / ${formatBytes(status.totalBytes)})` : "";
      const message = `${status.message || "Preparing image"}${copied}`;
      els.emptyMessage.hidden = false;
      els.emptyMessage.textContent = message;
      setStatus(message, "local");
      await sleep(1500);
      response = await apiFetch(`${API}/images/${image.id}/prepare`);
      status = await response.json();
    }
    image.prepared = true;
    setStatus(status.message || "Image prepared on SSD", "saved");
    return true;
  }

  async function openImage(imageId) {
    const sequence = ++openSequence;
    if (dirty) await saveAnnotations(false);
    if (!imageId) {
      currentImage = null;
      currentInfo = null;
      currentAnnotationFile = "Default";
      annotationFiles = ["Default"];
      renderAnnotationFileOptions();
      viewer.close();
      els.emptyMessage.hidden = false;
      els.emptyMessage.textContent = "Select an image";
      els.inputGuide.hidden = false;
      els.dimensions.textContent = "—";
      featureCollection = { type: "FeatureCollection", features: [], properties: {} };
      dirty = false;
      brushCursor = null;
      clearSelectedFeatures(false);
      circleDraft = null;
      updatePolygonActions();
      updateControls();
      updateDiagnostics();
      return;
    }

    currentImage = images.find((image) => image.id === imageId) || null;
    if (!currentImage) {
      const offline = await offlineRecordForImage(imageId);
      currentImage = offline?.image || null;
    }
    if (!currentImage) {
      setStatus("The selected image is no longer available", "error");
      return;
    }

    els.imageSelect.value = imageId;
    els.inputGuide.hidden = true;
    loadDisplaySettings();
    clearSelectedFeatures(false);
    pathologistDraft = null;
    polygonDraft = [];
    activeDraft = null;
    pointerState = null;
    brushCursor = null;
    updatePolygonActions();
    undoStack = [];
    redoStack = [];
    dirty = false;
    localDraftState = "Loading local draft";
    tileStats = { loaded: 0, failed: 0 };
    els.emptyMessage.hidden = false;
    els.emptyMessage.textContent = "Preparing image…";
    setStatus(`Opening ${currentImage.name}…`);
    viewer.close();

    try {
      let serverOnline = true;
      let serverCollection = null;
      let serverDisplayConfig = null;
      let cachedRecord = await getMeta(`image:${imageId}`);
      let offlinePackage = await offlineRecordForImage(imageId);
      const preferOffline = Boolean(offlinePackage && (offlinePackage.info || cachedRecord?.info));

      // A fully downloaded image opens immediately from local metadata/cache.
      // VPN/server checks happen later and never hold the viewer on “Preparing”.
      if (preferOffline) {
        serverOnline = false;
      } else if (navigator.onLine) {
        try {
          const prepared = await ensurePrepared(currentImage, sequence);
          if (!prepared || sequence !== openSequence) return;
          await loadAnnotationFiles(imageId, true);
          const [infoResponse, annotationsResponse, displayConfigResponse] = await Promise.all([
            apiFetch(`${API}/images/${imageId}/info`),
            apiFetch(`${API}/annotations/${imageId}?file=${encodeURIComponent(currentAnnotationFile)}`),
            apiFetch(`${API}/images/${imageId}/display-config`),
          ]);
          if (sequence !== openSequence) return;
          currentInfo = await infoResponse.json();
          serverCollection = await annotationsResponse.json();
          serverDisplayConfig = await displayConfigResponse.json();
          cachedRecord = { image: deepClone(currentImage), info: deepClone(currentInfo), annotationFiles: deepClone(annotationFiles), imageType: serverDisplayConfig?.imageType || imageType };
          await putMeta(`image:${imageId}`, cachedRecord);
          await putMeta(`files:${imageId}`, annotationFiles);
        } catch (error) {
          serverOnline = false;
          if (!offlinePackage && !cachedRecord?.info) throw error;
          setStatus("Server/VPN unavailable; opening the local offline copy", "local");
        }
      } else {
        serverOnline = false;
      }

      if (!serverOnline) {
        if (!offlinePackage) throw new Error("This image has not been downloaded for offline use");
        currentInfo = offlinePackage.info || cachedRecord?.info;
        if (!currentInfo) throw new Error("Offline image metadata is missing");
        annotationFiles = offlinePackage.annotationFiles || cachedRecord?.annotationFiles || ["Default"];
        currentAnnotationFile = annotationFiles.includes(currentAnnotationFile) ? currentAnnotationFile : "Default";
        renderAnnotationFileOptions();
        if (offlinePackage.displayQuery) applyOfflineDisplayQuery(offlinePackage.displayQuery);
        else {
          if (offlinePackage.imageType && ["he", "hdab", "fluorescence", "rgb"].includes(offlinePackage.imageType)) imageType = offlinePackage.imageType;
          if (els.imageTypeSelect) els.imageTypeSelect.value = imageType;
          renderChannelControls();
          saveDisplaySettings();
        }
      } else if (serverDisplayConfig?.imageType && ["he", "hdab", "fluorescence", "rgb"].includes(serverDisplayConfig.imageType)) {
        imageType = serverDisplayConfig.imageType;
        els.imageTypeSelect.value = imageType;
        renderChannelControls();
        saveDisplaySettings();
      }

      const localDraft = await getLocalDraft(imageId, currentAnnotationFile);
      if (localDraft?.pending && localDraft.featureCollection?.type === "FeatureCollection") {
        featureCollection = localDraft.featureCollection;
        dirty = true;
        localDraftState = "Recovered locally";
        setStatus(`Recovered ${featureCollection.features?.length || 0} locally saved annotations`, "local");
      } else if (serverCollection?.type === "FeatureCollection") {
        featureCollection = serverCollection;
        dirty = false;
        localDraftState = localDraft ? "Synced" : "Ready";
        await persistLocalDraft(false, currentImage, featureCollection);
      } else if (localDraft?.featureCollection?.type === "FeatureCollection") {
        featureCollection = localDraft.featureCollection;
        dirty = Boolean(localDraft.pending);
        localDraftState = localDraft.pending ? "Saved locally" : "Local copy";
      } else {
        featureCollection = { type: "FeatureCollection", features: [] };
        dirty = false;
        localDraftState = "Offline local file";
        await persistLocalDraft(false, currentImage, featureCollection);
      }

      featureCollection = normalizeFeatureCollectionClient(featureCollection);
      featureCollection.features.forEach(featureId);
      restoreViewportState = await getMeta(`viewport:${imageId}`);

      viewer.addOnceHandler("open", () => {
        if (sequence !== openSequence) return;
        els.emptyMessage.hidden = true;
        if (restoreViewportState && Number.isFinite(Number(restoreViewportState.zoom))) {
          try {
            viewer.viewport.panTo(new OpenSeadragon.Point(Number(restoreViewportState.x), Number(restoreViewportState.y)), true);
            viewer.viewport.zoomTo(Number(restoreViewportState.zoom), null, true);
          } catch (_) { /* ignore stale viewport */ }
        }
        restoreViewportState = null;
        applyBrightness();
        drawAnnotations();
        if (!dirty) setStatus(`${currentImage.name} • ${serverOnline ? currentInfo.sourceKind : "offline"} • ready`, serverOnline ? "saved" : "local");
        updateDiagnostics();
        if (dirty && navigator.onLine) saveAnnotations(false);
      });

      viewer.open(buildViewerSource(imageId, currentInfo));
      els.dimensions.textContent = `${currentInfo.width} × ${currentInfo.height}`;
      await cacheCurrentImageMetadata();
      updateControls();
      updateDiagnostics();

      if (preferOffline && navigator.onLine) {
        // Do not await: local opening is complete already. This only updates
        // reachability and pushes pending local annotations when possible.
        apiFetch(`${API}/images/${imageId}/info`, { timeoutMs: 5000 })
          .then(() => {
            serverReachable = true;
            return syncAllPendingDrafts(false);
          })
          .catch(() => { serverReachable = false; });
      }
    } catch (error) {
      if (sequence !== openSequence) return;
      setStatus(`Could not open image: ${error.message}`, "error");
      els.emptyMessage.hidden = false;
      els.emptyMessage.textContent = error.message;
    }
  }


  function resizeCanvas() {
    const rect = els.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (els.canvas.width !== width || els.canvas.height !== height) {
      els.canvas.width = width;
      els.canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  }

  function colorForFeature(feature) {
    const classification = feature.properties?.classification;
    const name = classification?.name;
    const known = classes.find((item) => item.name === name);
    return rgbArrayToHex(classification?.color)
      || colorRgbIntegerToHex(classification?.colorRGB)
      || feature.properties?.histoannotator?.color
      || known?.color
      || "#ffffff";
  }

  function drawRing(ring, color, selected = false, draft = false) {
    if (!ring || ring.length < 2) return;
    const points = ring.map(screenPointFromImage).filter(Boolean);
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    if (!draft) ctx.closePath();
    ctx.fillStyle = hexToRgba(color, selected ? 0.24 : 0.16);
    if (!draft && annotationsFilled) ctx.fill();
    ctx.strokeStyle = selected ? "#ffff00" : color;
    ctx.lineWidth = selected ? 3.5 : 2;
    ctx.setLineDash(draft ? [7, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPolygonRings(rings, color, selected = false) {
    if (!Array.isArray(rings) || !rings.length) return;
    ctx.beginPath();
    let hasPath = false;
    for (const ring of rings) {
      const points = (ring || []).map(screenPointFromImage).filter(Boolean);
      if (points.length < 2) continue;
      hasPath = true;
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      ctx.closePath();
    }
    if (!hasPath) return;
    ctx.fillStyle = hexToRgba(color, selected ? 0.24 : 0.16);
    if (annotationsFilled) ctx.fill("evenodd");
    ctx.strokeStyle = selected ? "#ffff00" : color;
    ctx.lineWidth = selected ? 3.5 : 2;
    ctx.stroke();
  }

  function drawBrushFeature(feature, color, selected) {
    const metadata = feature.properties?.histoannotator || {};
    const path = Array.isArray(metadata.brushPath) ? metadata.brushPath : [];
    const radius = Number(metadata.brushRadiusImage);
    if (!path.length || !Number.isFinite(radius) || radius <= 0) return false;

    const points = path.map(screenPointFromImage).filter(Boolean);
    if (!points.length) return false;
    const center = points[0];
    const edge = screenPointFromImage([path[0][0] + radius, path[0][1]]);
    const radiusPx = edge ? Math.max(1, Math.hypot(edge.x - center.x, edge.y - center.y)) : Math.max(1, Number(metadata.brushDiameterPx || 2) / 2);
    const diameterPx = radiusPx * 2;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    };

    if (points.length === 1) {
      if (selected) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radiusPx + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.34);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      if (selected) {
        tracePath();
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = diameterPx + 4;
        ctx.stroke();
      }
      tracePath();
      ctx.strokeStyle = hexToRgba(color, 0.34);
      ctx.lineWidth = diameterPx;
      ctx.stroke();
      tracePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, Math.min(3, diameterPx * 0.06));
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawGeometry(feature) {
    const geometry = feature.geometry;
    if (!geometry) return;
    const color = colorForFeature(feature);
    const selected = selectedIds.has(featureId(feature));
    // All area tools are displayed as standard QuPath-compatible annotation
    // polygons, using the annotation class color and a yellow selection outline.
    // Compound paths use the even-odd rule so subtraction holes display as holes.
    if (geometry.type === "Polygon") drawPolygonRings(geometry.coordinates, color, selected);
    else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((polygon) => drawPolygonRings(polygon, color, selected));
  }

  function drawingColor(operation = editOperation) {
    if (operation !== "new" && selectedId) {
      const selected = findFeature(selectedId);
      if (selected) return colorForFeature(selected);
    }
    return currentClass.color;
  }

  function drawDraftPoints(points) {
    for (const point of points) {
      const screen = screenPointFromImage(point);
      if (!screen) continue;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = drawingColor(polygonOperation);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawBrushDraft(draft) {
    const points = draft.points.map(screenPointFromImage).filter(Boolean);
    if (!points.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    const color = drawingColor(draft.operation);
    ctx.strokeStyle = hexToRgba(color, 0.42);
    ctx.lineWidth = draft.diameterPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, draft.diameterPx / 2, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.42);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBrushCursor() {
    if (mode !== "brush" || !brushCursor || activeDraft) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(brushCursor.x, brushCursor.y, brushDiameterPx / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(brushCursor.x, brushCursor.y, brushDiameterPx / 2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = drawingColor(editOperation);
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  function drawAnnotations() {
    const rect = resizeCanvas();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!viewer || !viewer.world.getItemCount()) return;
    if (annotationsVisible) featureCollection.features.forEach(drawGeometry);
    if (pathologistDraft && drawingProfile === "pathologist" && mode === "freehand") {
      if (pathologistDraft.outer.length) drawRing(pathologistDraft.outer, drawingColor(pathologistDraft.operation), false, true);
      pathologistDraft.holes.forEach((ring) => { if (ring.length) drawRing(ring, "#ffcf66", false, true); });
    }
    if (activeDraft?.type === "freehand" || activeDraft?.type === "freehand-pathologist") drawRing(activeDraft.points, drawingColor(activeDraft.operation), false, true);
    if (activeDraft?.type === "brush") drawBrushDraft(activeDraft);
    if (activeDraft?.type === "rectangle") {
      const [x1, y1] = activeDraft.start;
      const [x2, y2] = activeDraft.end;
      drawRing([[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]], drawingColor(activeDraft.operation), false, true);
    }
    if (polygonDraft.length) {
      drawRing(polygonDraft, drawingColor(polygonOperation), false, true);
      drawDraftPoints(polygonDraft);
    }
    if (circleDraft) {
      if (circleDraft.pointA && !circleDraft.pointB) drawDraftPoints([circleDraft.pointA]);
      const geometry = circleGeometryFromDraft();
      if (geometry?.type === "Polygon") drawPolygonRings(geometry.coordinates, drawingColor(circleDraft.operation), false);
    }
    if (activeDraft?.type === "selection" && activeDraft.points.length > 1) drawRing(activeDraft.points, "#65b8ff", false, true);
    drawBrushCursor();
    drawWandCursor();
  }

  function drawWandCursor() {
    if (mode !== "wand" || !wandCursor) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(wandCursor.x, wandCursor.y, wandRadiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = wandBusy ? "#ffd43b" : "rgba(255,255,255,.88)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function colorDistance(data, offset, seed, metric) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (metric === "brightness") {
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return Math.abs(luminance - seed.luminance);
    }
    const dr = r - seed.r;
    const dg = g - seed.g;
    const db = b - seed.b;
    return Math.sqrt(0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
  }

  function floodFillMask(imageData, seedX, seedY, tolerance, metric) {
    const { width, height, data } = imageData;
    const size = width * height;
    const mask = new Uint8Array(size);
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
    const seedIndex = seedY * width + seedX;
    const seedOffset = seedIndex * 4;
    const seed = {
      r: data[seedOffset],
      g: data[seedOffset + 1],
      b: data[seedOffset + 2],
      luminance: 0.2126 * data[seedOffset] + 0.7152 * data[seedOffset + 1] + 0.0722 * data[seedOffset + 2],
    };
    let head = 0;
    let tail = 0;
    let count = 0;
    let touchesBorder = false;
    queue[tail++] = seedIndex;
    visited[seedIndex] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * 4;
      if (data[offset + 3] === 0 || colorDistance(data, offset, seed, metric) > tolerance) continue;
      mask[index] = 1;
      count += 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;

      if (x > 0) {
        const next = index - 1;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (x + 1 < width) {
        const next = index + 1;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y > 0) {
        const next = index - width;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y + 1 < height) {
        const next = index + width;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    return { mask, count, touchesBorder };
  }

  function maskBoundaryLoops(mask, width, height) {
    const outgoing = new Map();
    const edges = [];
    const addEdge = (x1, y1, x2, y2) => {
      const index = edges.length;
      edges.push({ x1, y1, x2, y2, used: false });
      const key = `${x1},${y1}`;
      if (!outgoing.has(key)) outgoing.set(key, []);
      outgoing.get(key).push(index);
    };
    const isForeground = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isForeground(x, y)) continue;
        if (!isForeground(x, y - 1)) addEdge(x, y, x + 1, y);
        if (!isForeground(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
        if (!isForeground(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
        if (!isForeground(x - 1, y)) addEdge(x, y + 1, x, y);
      }
    }

    const loops = [];
    for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
      if (edges[startIndex].used) continue;
      const start = edges[startIndex];
      const loop = [[start.x1, start.y1]];
      let edgeIndex = startIndex;
      let safety = 0;
      while (edgeIndex !== undefined && safety++ < edges.length + 8) {
        const edge = edges[edgeIndex];
        if (edge.used) break;
        edge.used = true;
        loop.push([edge.x2, edge.y2]);
        if (edge.x2 === start.x1 && edge.y2 === start.y1) break;
        const candidates = outgoing.get(`${edge.x2},${edge.y2}`) || [];
        edgeIndex = candidates.find((candidate) => !edges[candidate].used);
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }

  function polygonSignedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
    }
    return area / 2;
  }

  async function runWand(point, operation = editOperation) {
    if (!currentImage || !currentInfo || wandBusy) return;
    wandBusy = true;
    drawAnnotations();
    setStatus("Wand: reading the visible image region…");
    try {
      const radiusImage = screenToleranceToImage(wandRadiusPx);
      const x = Math.floor(Math.max(0, point[0] - radiusImage));
      const y = Math.floor(Math.max(0, point[1] - radiusImage));
      const width = Math.max(1, Math.ceil(Math.min(currentInfo.width - x, radiusImage * 2)));
      const height = Math.max(1, Math.ceil(Math.min(currentInfo.height - y, radiusImage * 2)));
      const url = `${API}/images/${currentImage.id}/region.png?x=${x}&y=${y}&width=${width}&height=${height}&max_size=768&${displayQueryString()}`;
      const response = await apiFetch(url);
      const sourceX = Number(response.headers.get("X-Region-X") || x);
      const sourceY = Number(response.headers.get("X-Region-Y") || y);
      const sourceWidth = Number(response.headers.get("X-Region-Width") || width);
      const sourceHeight = Number(response.headers.get("X-Region-Height") || height);
      const bitmap = await createImageBitmap(await response.blob());
      const offscreen = document.createElement("canvas");
      offscreen.width = bitmap.width;
      offscreen.height = bitmap.height;
      const regionContext = offscreen.getContext("2d", { willReadFrequently: true });
      regionContext.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const imageData = regionContext.getImageData(0, 0, offscreen.width, offscreen.height);
      const seedX = Math.max(0, Math.min(offscreen.width - 1, Math.floor(((point[0] - sourceX) / sourceWidth) * offscreen.width)));
      const seedY = Math.max(0, Math.min(offscreen.height - 1, Math.floor(((point[1] - sourceY) / sourceHeight) * offscreen.height)));
      const result = floodFillMask(imageData, seedX, seedY, wandTolerance, wandMetric);
      if (result.count < 8) throw new Error("The selected region is too small. Increase Similarity or zoom in.");
      if (result.count > offscreen.width * offscreen.height * 0.82) {
        throw new Error("The selection filled almost the entire Wand area. Lower Similarity or zoom in.");
      }
      const loops = maskBoundaryLoops(result.mask, offscreen.width, offscreen.height);
      if (!loops.length) throw new Error("No usable boundary was found.");
      const boundary = loops.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)))[0];
      if (boundary.length > 1) {
        const first = boundary[0];
        const last = boundary[boundary.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) boundary.pop();
      }
      const imagePoints = boundary.map(([px, py]) => [
        sourceX + (px / offscreen.width) * sourceWidth,
        sourceY + (py / offscreen.height) * sourceHeight,
      ]);
      const smoothed = smoothClosedPath(imagePoints, imagePoints.length > 80 ? 2 : 1, 0.12);
      const simplified = simplifyRdp(smoothed, Math.max(screenToleranceToImage(0.75), sourceWidth / offscreen.width * 0.65));
      if (simplified.length < 3) throw new Error("The selected boundary was too simple.");
      await commitGeometry(polygonGeometry(simplified), { tool: "wand" }, operation);
      if (result.touchesBorder) setStatus("Wand area reached the search boundary; reduce the area or zoom in if needed", "local");
    } finally {
      wandBusy = false;
      drawAnnotations();
    }
  }

  function screenToleranceToImage(screenPixels) {
    if (!viewer || !viewer.world.getItemCount()) return screenPixels;
    const first = imagePointFromViewerPosition(new OpenSeadragon.Point(0, 0));
    const second = imagePointFromViewerPosition(new OpenSeadragon.Point(screenPixels, 0));
    return first && second ? Math.max(0.1, Math.abs(second[0] - first[0])) : screenPixels;
  }

  function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
  }

  function geometryBounds(geometry) {
    if (!geometry) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const visit = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        const x = Number(value[0]);
        const y = Number(value[1]);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        return;
      }
      value.forEach(visit);
    };
    visit(geometry.coordinates);
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  function zoomToFeature(feature) {
    if (!viewer || !viewer.world.getItemCount() || !feature?.geometry) return;
    const bounds = geometryBounds(feature.geometry);
    if (!bounds) return;
    const item = viewer.world.getItemAt(0);
    const topLeft = item.imageToViewportCoordinates(bounds.minX, bounds.minY);
    const bottomRight = item.imageToViewportCoordinates(bounds.maxX, bounds.maxY);
    const width = Math.max(bottomRight.x - topLeft.x, 0.00001);
    const height = Math.max(bottomRight.y - topLeft.y, 0.00001);
    const paddingX = Math.max(width * 0.12, 0.00002);
    const paddingY = Math.max(height * 0.12, 0.00002);
    viewer.viewport.fitBounds(new OpenSeadragon.Rect(topLeft.x - paddingX, topLeft.y - paddingY, width + paddingX * 2, height + paddingY * 2), false);
  }

  function syncCurrentClassFromFeature(feature) {
    const name = feature?.properties?.classification?.name;
    if (!name) return;
    const matched = classes.find((item) => item.name === name);
    if (matched) currentClass = matched;
  }

  function pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || !polygon.length || !pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  }

  function hitTest(point) {
    for (let index = featureCollection.features.length - 1; index >= 0; index -= 1) {
      const feature = featureCollection.features[index];
      const geometry = feature.geometry;
      if (!geometry) continue;
      if (geometry.type === "Polygon" && pointInPolygon(point, geometry.coordinates)) return featureId(feature);
      if (geometry.type === "MultiPolygon" && geometry.coordinates.some((polygon) => pointInPolygon(point, polygon))) return featureId(feature);
    }
    return null;
  }

  function pointInRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function distanceBetween(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function pathLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) total += distanceBetween(points[index - 1], points[index]);
    return total;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function dedupePath(points, minimumDistance) {
    const clean = [];
    for (const point of points) {
      const last = clean[clean.length - 1];
      if (!last || distanceBetween(last, point) >= minimumDistance) clean.push([point[0], point[1]]);
    }
    return clean;
  }

  function smoothOpenPath(points, passes = 1, strength = 0.2) {
    let result = points.map(([x, y]) => [x, y]);
    for (let pass = 0; pass < passes && result.length >= 3; pass += 1) {
      const next = [result[0]];
      for (let index = 1; index < result.length - 1; index += 1) {
        const previous = result[index - 1];
        const current = result[index];
        const following = result[index + 1];
        next.push([
          current[0] * (1 - 2 * strength) + (previous[0] + following[0]) * strength,
          current[1] * (1 - 2 * strength) + (previous[1] + following[1]) * strength,
        ]);
      }
      next.push(result[result.length - 1]);
      result = next;
    }
    return result;
  }

  function smoothClosedPath(points, passes = 1, strength = 0.16) {
    let result = points.map(([x, y]) => [x, y]);
    for (let pass = 0; pass < passes && result.length >= 4; pass += 1) {
      const next = result.map((current, index) => {
        const previous = result[(index - 1 + result.length) % result.length];
        const following = result[(index + 1) % result.length];
        return [
          current[0] * (1 - 2 * strength) + (previous[0] + following[0]) * strength,
          current[1] * (1 - 2 * strength) + (previous[1] + following[1]) * strength,
        ];
      });
      result = next;
    }
    return result;
  }

  function trimFreehandTail(points) {
    let clean = dedupePath(points, screenToleranceToImage(0.35));
    if (clean.length < 7) return clean;

    const stepLengths = [];
    for (let index = 1; index < clean.length; index += 1) stepLengths.push(distanceBetween(clean[index - 1], clean[index]));
    const typicalStep = Math.max(0.01, median(stepLengths));
    const closureThreshold = Math.max(screenToleranceToImage(14), typicalStep * 5.5);
    const first = clean[0];

    // When the stylus reaches the starting area and then continues outside,
    // retain the closest return-to-start point and discard the accidental tail.
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    const searchStart = Math.max(3, Math.floor(clean.length * 0.42));
    for (let index = searchStart; index < clean.length - 2; index += 1) {
      const distance = distanceBetween(clean[index], first);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    if (closestIndex >= 0 && closestDistance <= closureThreshold) {
      const tail = clean.slice(closestIndex);
      if (pathLength(tail) > closureThreshold * 0.65) clean = clean.slice(0, closestIndex + 1);
    }

    // Remove a short terminal spike when the final point makes a large detour
    // compared with closing directly from the preceding point to the start.
    const maximumRemovals = Math.min(14, Math.floor(clean.length * 0.18));
    for (let removed = 0; removed < maximumRemovals && clean.length > 5; removed += 1) {
      const previous = clean[clean.length - 2];
      const last = clean[clean.length - 1];
      const direct = distanceBetween(previous, clean[0]);
      const detour = distanceBetween(previous, last) + distanceBetween(last, clean[0]);
      const deviation = perpendicularDistance(last, previous, clean[0]);
      const recent = clean.slice(Math.max(0, clean.length - 9));
      const recentSteps = [];
      for (let index = 1; index < recent.length; index += 1) recentSteps.push(distanceBetween(recent[index - 1], recent[index]));
      const localThreshold = Math.max(screenToleranceToImage(4), median(recentSteps) * 1.9);
      if (deviation > localThreshold && detour > Math.max(direct * 1.24, direct + localThreshold)) clean.pop();
      else break;
    }
    return clean;
  }

  function prepareFreehandPolygon(points) {
    const trimmed = trimFreehandTail(points);
    if (trimmed.length < 3) return trimmed;
    const passes = trimmed.length >= 24 ? 2 : 1;
    const smoothed = smoothClosedPath(trimmed, passes, 0.13);
    const simplified = simplifyRdp(smoothed, screenToleranceToImage(0.9));
    return simplified.length >= 3 ? simplified : smoothed;
  }

  function prepareOpenStroke(points, tolerance) {
    const clean = dedupePath(points, Math.max(0.05, tolerance * 0.45));
    const smoothed = smoothOpenPath(clean, clean.length >= 12 ? 2 : 1, 0.18);
    const simplified = simplifyRdp(smoothed, tolerance);
    return simplified.length >= 2 ? simplified : smoothed;
  }

  function strokeToPolygon(points, radius) {
    const clean = [];
    for (const point of points) {
      const last = clean[clean.length - 1];
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > Math.max(0.05, radius * 0.08)) clean.push(point);
    }
    const segments = 18;
    if (!clean.length) return [];
    if (clean.length === 1) {
      const [cx, cy] = clean[0];
      return Array.from({ length: segments }, (_, index) => {
        const angle = (Math.PI * 2 * index) / segments;
        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
      });
    }

    const normals = clean.map((point, index) => {
      const previous = clean[Math.max(0, index - 1)];
      const next = clean[Math.min(clean.length - 1, index + 1)];
      let dx = next[0] - previous[0];
      let dy = next[1] - previous[1];
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      return [-dy, dx];
    });
    const left = clean.map((point, index) => [point[0] + normals[index][0] * radius, point[1] + normals[index][1] * radius]);
    const right = clean.map((point, index) => [point[0] - normals[index][0] * radius, point[1] - normals[index][1] * radius]);
    const outline = [...left];

    const end = clean[clean.length - 1];
    const endAngle = Math.atan2(normals[normals.length - 1][1], normals[normals.length - 1][0]);
    for (let index = 1; index <= segments / 2; index += 1) {
      const angle = endAngle - (Math.PI * index) / (segments / 2);
      outline.push([end[0] + Math.cos(angle) * radius, end[1] + Math.sin(angle) * radius]);
    }

    for (let index = right.length - 2; index >= 0; index -= 1) outline.push(right[index]);

    const start = clean[0];
    const startRightAngle = Math.atan2(-normals[0][1], -normals[0][0]);
    for (let index = 1; index <= segments / 2; index += 1) {
      const angle = startRightAngle - (Math.PI * index) / (segments / 2);
      outline.push([start[0] + Math.cos(angle) * radius, start[1] + Math.sin(angle) * radius]);
    }
    return outline;
  }

  function simplifyRdp(points, epsilon) {
    if (points.length < 3) return points;
    let maxDistance = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];
    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = perpendicularDistance(points[index], first, last);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxDistance > epsilon) {
      const left = simplifyRdp(points.slice(0, maxIndex + 1), epsilon);
      const right = simplifyRdp(points.slice(maxIndex), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  function perpendicularDistance(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
  }

  function hexToRgba(hex, alpha) {
    const normalized = hex.replace("#", "");
    const value = parseInt(normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function toggleFileMenu(force = null) {
    const open = force === null ? els.fileMenuPanel.hidden : Boolean(force);
    els.fileMenuPanel.hidden = !open;
    els.fileMenuButton.setAttribute("aria-expanded", String(open));
  }

  function downloadOriginal() {
    if (!currentImage) return;
    toggleFileMenu(false);
    const anchor = document.createElement("a");
    anchor.href = `${API}/images/${currentImage.id}/download`;
    anchor.download = currentImage.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setStatus(`Download started: ${currentImage.name}`, "saved");
  }

  function showImageInfo() {
    if (!currentImage || !currentInfo) return;
    toggleFileMenu(false);
    const info = {
      file: currentImage.name,
      path: currentImage.relativePath,
      fileSize: formatBytes(currentImage.sizeBytes),
      dimensions: `${currentInfo.width} × ${currentInfo.height}`,
      source: currentInfo.sourceKind,
      preparedOnSSD: Boolean(currentInfo.preparedLocally),
      tileSize: `${currentInfo.tileSize} px`,
      levels: currentInfo.levelCount,
      mppX: currentInfo.mppX ?? "—",
      mppY: currentInfo.mppY ?? "—",
    };
    els.imageInfoContent.textContent = Object.entries(info).map(([key, value]) => `${key}: ${value}`).join("\n");
    els.infoOverlay.hidden = false;
  }

  function updateUploadUi(file, uploaded, total, message) {
    const percentage = total > 0 ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;
    els.uploadFilename.textContent = `${file.name} · ${formatBytes(total)}`;
    els.uploadProgress.value = percentage;
    els.uploadStatus.textContent = `${message} · ${percentage}% (${formatBytes(uploaded)} / ${formatBytes(total)})`;
  }

  async function sendChunkWithRetry(uploadId, offset, chunk, signal) {
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await apiFetch(`${API}/uploads/${uploadId}/chunk?offset=${offset}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
          signal,
        });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        lastError = error;
        if (attempt < 4) {
          const wait = 800 * (2 ** attempt);
          els.uploadStatus.textContent = `Connection interrupted; retrying in ${Math.round(wait / 1000)} s…`;
          await sleep(wait);
        }
      }
    }
    throw lastError || new Error("Could not upload the block");
  }

  async function uploadImage(file) {
    if (!file) return;
    toggleFileMenu(false);
    uploadAbortController = new AbortController();
    activeUploadId = null;
    els.uploadOverlay.hidden = false;
    updateUploadUi(file, 0, file.size, "Starting or resuming upload");
    try {
      const initResponse = await apiFetch(`${API}/uploads/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size, lastModified: file.lastModified }),
        signal: uploadAbortController.signal,
      });
      let session = await initResponse.json();
      activeUploadId = session.uploadId;
      let offset = Number(session.offset || 0);
      const chunkSize = Number(session.chunkSize || (8 * 1024 * 1024));

      if (!session.complete) {
        updateUploadUi(file, offset, file.size, offset > 0 ? "Resuming upload" : "Uploading");
        while (offset < file.size) {
          const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
          const response = await sendChunkWithRetry(session.uploadId, offset, chunk, uploadAbortController.signal);
          session = await response.json();
          offset = Number(session.offset || (offset + chunk.size));
          updateUploadUi(file, offset, file.size, "Uploading in blocks");
        }
        els.uploadStatus.textContent = "Verifying and moving the completed file…";
        const completeResponse = await apiFetch(`${API}/uploads/${session.uploadId}/complete`, {
          method: "POST",
          signal: uploadAbortController.signal,
        });
        session = await completeResponse.json();
      }

      updateUploadUi(file, file.size, file.size, `Upload completed as ${session.targetName}`);
      setStatus(`Image uploaded: ${session.targetName}`, "saved");
      await loadImages(false);
      if (session.imageId && images.some((image) => image.id === session.imageId)) {
        els.imageSelect.value = session.imageId;
        await openImage(session.imageId);
      }
      setTimeout(() => { els.uploadOverlay.hidden = true; }, 900);
    } catch (error) {
      if (error.name === "AbortError") {
        els.uploadOverlay.hidden = true;
        setStatus("Upload paused. Select the same file to continue.", "local");
      } else {
        els.uploadStatus.textContent = `Could not complete upload: ${error.message}`;
        setStatus(`Upload error: ${error.message}`, "error");
      }
    } finally {
      uploadAbortController = null;
      activeUploadId = null;
      els.uploadInput.value = "";
    }
  }

  async function exportGeoJson() {
    if (!currentImage) return;
    let exportCollection = quPathFeatureCollection(featureCollection);
    let report = null;
    if (navigator.onLine) {
      try {
        const response = await apiFetch(`${API}/geojson/qupath-export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(exportCollection),
        });
        const payload = await response.json();
        if (payload?.featureCollection?.type === "FeatureCollection") exportCollection = payload.featureCollection;
        report = payload?.report || null;
      } catch (error) {
        setStatus(`QuPath geometry validation unavailable; exporting local GeoJSON: ${error.message}`, "local");
      }
    }
    const blob = new Blob([JSON.stringify(exportCollection, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${currentImage.name}${currentAnnotationFile === "Default" ? "" : `.${currentAnnotationFile}`}.geojson`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (report) {
      const repaired = Number(report.repaired || 0); const dropped = Number(report.dropped || 0);
      setStatus(`QuPath GeoJSON exported · ${report.features} annotations${repaired ? ` · ${repaired} repaired` : ""}${dropped ? ` · ${dropped} invalid dropped` : ""}`, dropped ? "local" : "saved");
    }
  }


  async function importGeoJson(file) {
    if (!file || !currentImage) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) throw new Error("The file is not a FeatureCollection");
      if (!window.confirm(`Replace the current ${featureCollection.features.length} annotations with ${payload.features.length}?`)) return;
      pushUndo();
      featureCollection = normalizeFeatureCollectionClient(payload);
      featureCollection.features.forEach(featureId);
      clearSelectedFeatures(false);
      markChanged();
    } catch (error) {
      setStatus(`Invalid GeoJSON: ${error.message}`, "error");
    } finally {
      els.importInput.value = "";
    }
  }

  function updateDiagnostics() {
    if (!els.diagnostics) return;
    let state = "Ready";
    if (currentImage) {
      if (!navigator.onLine) state = "Offline · saved locally";
      else if (dirty) state = "Saving";
      else state = localDraftState === "Ready" ? "Synced" : localDraftState;
    }
    els.diagnostics.textContent = `v${VERSION} · ${state}`;
  }

  async function removeLegacyServiceWorker() {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("histoannotator-")).map((key) => caches.delete(key)));
      }
    } catch (_) { /* best effort */ }
  }

  function setDrawingProfile(profile) {
    drawingProfile = profile === "pathologist" ? "pathologist" : "default";
    if (els.drawingProfileSelect) els.drawingProfileSelect.value = drawingProfile;
    if (drawingProfile !== "pathologist") pathologistDraft = null;
    if (els.editOperationControls) els.editOperationControls.hidden = !AREA_MODES.has(mode) || (drawingProfile === "pathologist" && mode === "brush");
    updatePathologistActions();
    drawAnnotations();
    // Drawing-mode instructions no longer occupy persistent UI space.
  }

  function bindEvents() {
    document.querySelectorAll(".tool").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
    document.querySelectorAll("[data-edit-operation]").forEach((button) => {
      button.addEventListener("click", () => setEditOperation(button.dataset.editOperation));
    });
    els.toggleAnnotationList.addEventListener("click", () => {
      annotationListExpanded = !annotationListExpanded;
      renderAnnotationList();
    });
    els.refreshButton.addEventListener("click", () => loadImages(true));
    els.drawingProfileSelect?.addEventListener("change", () => setDrawingProfile(els.drawingProfileSelect.value));
    els.annotationFileSelect?.addEventListener("change", () => loadSelectedAnnotationFile(els.annotationFileSelect.value).catch((error) => setStatus(`Could not switch annotation file: ${error.message}`, "error")));
    els.newAnnotationFileButton?.addEventListener("click", createAnnotationFile);
    els.finishPathologistContour?.addEventListener("click", () => completePathologistDraft());
    els.addPathologistHole?.addEventListener("click", beginPathologistHole);
    els.cancelPathologistContour?.addEventListener("click", cancelPathologistDraft);
    els.imageSelect.addEventListener("change", () => openImage(els.imageSelect.value));
    els.finishPolygon.addEventListener("click", finishPolygon);
    els.cancelPolygon.addEventListener("click", cancelPolygon);
    els.undoButton.addEventListener("click", undo);
    els.redoButton.addEventListener("click", redo);

    els.fileMenuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFileMenu();
    });
    els.fileMenuPanel.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", () => { toggleFileMenu(false); if (els.displayPanel) { els.displayPanel.hidden = true; els.displayButton?.setAttribute("aria-expanded", "false"); } });
    els.uploadInput.addEventListener("change", () => uploadImage(els.uploadInput.files?.[0]));
    els.downloadOriginalButton.addEventListener("click", downloadOriginal);
    els.downloadOfflineButton?.addEventListener("click", showOfflineDownload);
    els.offlineFilesButton?.addEventListener("click", showOfflineFiles);
    els.syncNowButton?.addEventListener("click", () => { toggleFileMenu(false); syncAllPendingDrafts(true); });
    els.offlineQuality?.addEventListener("change", updateOfflineEstimate);
    els.startOfflineDownload?.addEventListener("click", downloadCurrentImageOffline);
    els.cancelOfflineDownload?.addEventListener("click", () => { offlineDownloadAbort = true; els.offlineOverlay.hidden = true; });
    els.offlineOverlay?.addEventListener("click", (event) => { if (event.target === els.offlineOverlay) { offlineDownloadAbort = true; els.offlineOverlay.hidden = true; } });
    els.closeOfflineFiles?.addEventListener("click", () => { els.offlineFilesOverlay.hidden = true; });
    els.offlineFilesOverlay?.addEventListener("click", (event) => { if (event.target === els.offlineFilesOverlay) els.offlineFilesOverlay.hidden = true; });
    els.importGeoJsonButton.addEventListener("click", () => {
      toggleFileMenu(false);
      els.importInput.click();
    });
    els.importInput.addEventListener("change", () => importGeoJson(els.importInput.files?.[0]));
    els.exportButton.addEventListener("click", () => { toggleFileMenu(false); exportGeoJson(); });
    els.saveButton.addEventListener("click", () => { toggleFileMenu(false); saveAnnotations(true); });
    els.imageInfoButton.addEventListener("click", showImageInfo);
    els.closeInfoButton.addEventListener("click", () => { els.infoOverlay.hidden = true; });
    els.infoOverlay.addEventListener("click", (event) => { if (event.target === els.infoOverlay) els.infoOverlay.hidden = true; });
    els.cancelUploadButton.addEventListener("click", () => {
      if (uploadAbortController) uploadAbortController.abort();
      else els.uploadOverlay.hidden = true;
    });

    els.brushSize.addEventListener("input", () => {
      brushDiameterPx = Number(els.brushSize.value);
      els.brushSizeValue.textContent = `${brushDiameterPx} px`;
      drawAnnotations();
      updateDiagnostics();
    });

    els.wandTolerance.addEventListener("input", () => {
      wandTolerance = Number(els.wandTolerance.value);
      els.wandToleranceValue.textContent = String(wandTolerance);
    });
    els.wandRadius.addEventListener("input", () => {
      wandRadiusPx = Number(els.wandRadius.value);
      els.wandRadiusValue.textContent = `${wandRadiusPx} px`;
      drawAnnotations();
    });
    els.wandMetric.addEventListener("change", () => { wandMetric = els.wandMetric.value; });

    els.eyeButton?.addEventListener("click", () => {
      annotationsVisible = !annotationsVisible;
      els.eyeButton.classList.toggle("active", annotationsVisible);
      els.eyeButton.textContent = annotationsVisible ? "👁" : "◉";
      els.eyeButton.title = annotationsVisible ? "Hide annotations" : "Show annotations";
      drawAnnotations();
    });
    els.displayButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = els.displayPanel.hidden;
      els.displayPanel.hidden = !opening;
      els.displayButton.setAttribute("aria-expanded", String(opening));
    });
    els.displayPanel?.addEventListener("click", (event) => event.stopPropagation());
    els.brightnessSlider?.addEventListener("input", () => {
      brightnessPercent = Number(els.brightnessSlider.value);
      els.brightnessValue.textContent = `${brightnessPercent}%`;
      saveDisplaySettings(); applyBrightness();
    });
    els.imageTypeSelect?.addEventListener("change", async () => {
      imageType = els.imageTypeSelect.value;
      saveDisplaySettings(); renderChannelControls(); refreshImageDisplay();
      if (currentImage) {
        try {
          await apiFetch(`${API}/images/${currentImage.id}/display-config`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageType }),
          });
        } catch (error) { setStatus(`Image type saved locally; server sync failed: ${error.message}`, "local"); }
      }
    });
    els.circleMethod?.addEventListener("change", () => { circleMethod = els.circleMethod.value; circleDraft = null; updateCircleActions(); drawAnnotations(); });
    els.circleWidthScale?.addEventListener("input", () => { circleWidthScale = Number(els.circleWidthScale.value) / 100; els.circleWidthValue.textContent = `${els.circleWidthScale.value}%`; drawAnnotations(); });
    els.circleHeightScale?.addEventListener("input", () => { circleHeightScale = Number(els.circleHeightScale.value) / 100; els.circleHeightValue.textContent = `${els.circleHeightScale.value}%`; drawAnnotations(); });
    els.finishCircle?.addEventListener("click", finishCircleDraft);
    els.cancelCircle?.addEventListener("click", cancelCircleDraft);
    els.deleteSelection?.addEventListener("click", deleteSelectedAnnotations);
    els.mergeSelection?.addEventListener("click", () => combineSelected("merge"));
    els.intersectSelection?.addEventListener("click", () => combineSelected("intersect"));
    els.subtractSelection?.addEventListener("click", () => combineSelected("subtract"));
    els.clearSelection?.addEventListener("click", () => clearSelectedFeatures(true));
    els.fillAnnotationsButton.addEventListener("click", () => {
      annotationsFilled = !annotationsFilled;
      els.fillAnnotationsButton.textContent = `${annotationsFilled ? "✓" : "○"} Fill annotations`;
      drawAnnotations();
    });

    els.toggleClassManager.addEventListener("click", () => {
      setClassManagerOpen(!els.classPanel.classList.contains("management-open"));
    });
    els.addClassButton.addEventListener("click", () => openClassEditor(null));
    els.saveClassButton.addEventListener("click", saveClassEditor);
    els.cancelClassButton.addEventListener("click", closeClassEditor);
    els.classNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveClassEditor();
      if (event.key === "Escape") closeClassEditor();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        toggleFileMenu(false);
        if (polygonDraft.length) cancelPolygon();
        if (circleDraft) cancelCircleDraft();
        els.infoOverlay.hidden = true;
      } else if (event.key === "Enter" && mode === "polygon" && polygonDraft.length >= 3) {
        finishPolygon();
      }
    });
    window.addEventListener("resize", drawAnnotations);
    window.addEventListener("offline", () => {
      setStatus("Connection lost: changes will continue to be saved on this device", "local");
      updateDiagnostics();
    });
    const suppressViewerMenu = (event) => {
      if (event.target?.closest?.("#viewer, .viewer-shell, #annotationCanvas")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("contextmenu", suppressViewerMenu, { capture: true });
    document.addEventListener("dragstart", suppressViewerMenu, { capture: true });
    document.addEventListener("selectstart", suppressViewerMenu, { capture: true });

    window.addEventListener("online", () => {
      setStatus("Connection restored; synchronizing…", "local");
      updateDiagnostics();
      syncAllPendingDrafts(false);
      if (dirty) saveAnnotations(false);
      loadImages(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && currentImage && dirty) persistLocalDraft(true);
      if (document.hidden && currentImage) saveViewportState();
    });
    window.addEventListener("beforeunload", () => { if (currentImage) saveViewportState(); });
  }

  async function start() {
    // Bring up the UI and local catalog first. Storage persistence and service
    // worker setup are best-effort background tasks and must never hold Files
    // on the initial “Loading…” option.
    renderClassButtons();
    renderAnnotationFileOptions();
    initViewer();
    bindEvents();
    setClassManagerOpen(false);
    els.inputGuide.hidden = false;
    setDrawingProfile("default");
    renderChannelControls();
    setMode("navigate");
    updateControls();
    updateDiagnostics();
    requestPersistentStorage();
    registerOfflineServiceWorker();
    await Promise.all([loadClasses(), loadImages(false)]);
  }

  start().catch((error) => setStatus(`Startup error: ${error.message}`, "error"));
})();
