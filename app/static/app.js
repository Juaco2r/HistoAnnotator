(() => {
  "use strict";

  const VERSION = "1.4.0-dev-IL5.1";

  // The same frontend runs both in the browser and inside Capacitor.
  const IS_NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());

  // Browser uses its own origin. Android selects a server at runtime.
  const BASE = window.location.pathname.startsWith("/annotator") ? "/annotator" : "";
  const NATIVE_SERVER_STORAGE_KEY = "histoannotator.nativeServer.v2";
  const NATIVE_RUNTIME_MIGRATION_KEY = "histoannotator.nativeRuntimeMigration.dev6";
  const DEFAULT_NATIVE_SERVER_RAW = "__HISTOANNOTATOR_NATIVE_SERVER__";

  function normalizeServerBase(value) {
    let raw = String(value || "").trim();
    if (!raw || raw === "__HISTOANNOTATOR_NATIVE_SERVER__") return "";

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Server must use http:// or https://");
    }
    if (parsed.username || parsed.password) {
      throw new Error("Server URL must not contain credentials");
    }

    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");

    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  }

  const DEFAULT_NATIVE_SERVER = (() => {
    try {
      return normalizeServerBase(DEFAULT_NATIVE_SERVER_RAW);
    } catch (_) {
      return "";
    }
  })();

  let NATIVE_SERVER = (() => {
    try {
      return normalizeServerBase(
        localStorage.getItem(NATIVE_SERVER_STORAGE_KEY)
        || DEFAULT_NATIVE_SERVER
      );
    } catch (_) {
      return DEFAULT_NATIVE_SERVER;
    }
  })();

  let API = IS_NATIVE
    ? (NATIVE_SERVER ? `${NATIVE_SERVER}/api` : "")
    : `${BASE}/api`;

  function setNativeServerBase(value) {
    const normalized = normalizeServerBase(value);
    NATIVE_SERVER = normalized;
    API = normalized ? `${normalized}/api` : "";

    if (normalized) {
      localStorage.setItem(NATIVE_SERVER_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(NATIVE_SERVER_STORAGE_KEY);
    }

    serverReachable = null;
    return normalized;
  }
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
    deleteAnnotationFileButton: document.getElementById("deleteAnnotationFileButton"),
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
    shareGeoJsonButton: document.getElementById("shareGeoJsonButton"),
    importGeoJsonButton: document.getElementById("importGeoJsonButton"),
    importInput: document.getElementById("importInput"),
    fileMenuButton: document.getElementById("fileMenuButton"),
    fileMenuPanel: document.getElementById("fileMenuPanel"),
    uploadInput: document.getElementById("uploadInput"),
    downloadOriginalButton: document.getElementById("downloadOriginalButton"),
    downloadOfflineButton: document.getElementById("downloadOfflineButton"),
    offlineFilesButton: document.getElementById("offlineFilesButton"),
    syncNowButton: document.getElementById("syncNowButton"),
    connectionSettingsButton: document.getElementById("connectionSettingsButton"),
    openLocalImageButton: document.getElementById("openLocalImageButton"),
    localImagesButton: document.getElementById("localImagesButton"),
    localImagesOverlay: document.getElementById("localImagesOverlay"),
    localImagesList: document.getElementById("localImagesList"),
    localImagesCapabilities: document.getElementById("localImagesCapabilities"),
    closeLocalImagesButton: document.getElementById("closeLocalImagesButton"),
    addLocalImageButton: document.getElementById("addLocalImageButton"),
    connectionSettingsOverlay: document.getElementById("connectionSettingsOverlay"),
    connectionServerInput: document.getElementById("connectionServerInput"),
    connectionCurrentServer: document.getElementById("connectionCurrentServer"),
    connectionTestResult: document.getElementById("connectionTestResult"),
    scanConnectionQrButton: document.getElementById("scanConnectionQrButton"),
    testConnectionButton: document.getElementById("testConnectionButton"),
    saveConnectionButton: document.getElementById("saveConnectionButton"),
    clearConnectionButton: document.getElementById("clearConnectionButton"),
    closeConnectionButton: document.getElementById("closeConnectionButton"),
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
    annotationStatsButton: document.getElementById("annotationStatsButton"),
    fillUnannotatedButton: document.getElementById("fillUnannotatedButton"),
    fillUnannotatedModal: document.getElementById("fillUnannotatedModal"),
    fillUnannotatedClassSelect: document.getElementById("fillUnannotatedClassSelect"),
    fillUnannotatedSummary: document.getElementById("fillUnannotatedSummary"),
    fillUnannotatedRefreshButton: document.getElementById("fillUnannotatedRefreshButton"),
    fillUnannotatedCancelButton: document.getElementById("fillUnannotatedCancelButton"),
    fillUnannotatedCreateButton: document.getElementById("fillUnannotatedCreateButton"),
    annotationStatsModal: document.getElementById("annotationStatsModal"),
    annotationStatsContent: document.getElementById("annotationStatsContent"),
    annotationStatsCloseButton: document.getElementById("annotationStatsCloseButton"),
    reviewModeButton: document.getElementById("reviewModeButton"),
    reviewPanel: document.getElementById("reviewPanel"),
    reviewScopeLabel: document.getElementById("reviewScopeLabel"),
    reviewProgressFill: document.getElementById("reviewProgressFill"),
    reviewProgressText: document.getElementById("reviewProgressText"),
    reviewRemainingText: document.getElementById("reviewRemainingText"),
    reviewCurrentText: document.getElementById("reviewCurrentText"),
    reviewClassSelect: document.getElementById("reviewClassSelect"),
    reviewNewClassButton: document.getElementById("reviewNewClassButton"),
    exitReviewModeButton: document.getElementById("exitReviewModeButton"),
    reviewDecisionBar: document.getElementById("reviewDecisionBar"),
    reviewCorrectButton: document.getElementById("reviewCorrectButton"),
    reviewMaybeButton: document.getElementById("reviewMaybeButton"),
    reviewLaterButton: document.getElementById("reviewLaterButton"),
    reviewDeleteButton: document.getElementById("reviewDeleteButton"),
    reviewSetupModal: document.getElementById("reviewSetupModal"),
    reviewScopeSelect: document.getElementById("reviewScopeSelect"),
    reviewSetupCancelButton: document.getElementById("reviewSetupCancelButton"),
    reviewSetupStartButton: document.getElementById("reviewSetupStartButton"),
    uploadOverlay: document.getElementById("uploadOverlay"),
    uploadFilename: document.getElementById("uploadFilename"),
    uploadProgress: document.getElementById("uploadProgress"),
    uploadStatus: document.getElementById("uploadStatus"),
    cancelUploadButton: document.getElementById("cancelUploadButton"),
    infoOverlay: document.getElementById("infoOverlay"),
    imageInfoContent: document.getElementById("imageInfoContent"),
    closeInfoButton: document.getElementById("closeInfoButton"),
    manualCalibrationState: document.getElementById("manualCalibrationState"),
    manualMppInput: document.getElementById("manualMppInput"),
    manualObjectiveInput: document.getElementById("manualObjectiveInput"),
    saveManualCalibrationButton: document.getElementById("saveManualCalibrationButton"),
    clearManualCalibrationButton: document.getElementById("clearManualCalibrationButton"),
    featureCount: document.getElementById("featureCount"),
    dimensions: document.getElementById("dimensions"),
    viewerCalibrationBadge: document.getElementById("viewerCalibrationBadge"),
    scaleBar: document.getElementById("scaleBar"),
    scaleBarLine: document.getElementById("scaleBarLine"),
    scaleBarLabel: document.getElementById("scaleBarLabel"),
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
  // ID of the annotation selected automatically just after drawing.
  // Explicit user selection clears this marker.
  let implicitSelectionId = null;

  const REVIEW_PROPERTY = "histoannotatorReview";
  let reviewPendingNewClassAssignment = false;
  let reviewAutoExitTimeout = null;
  let reviewAutoExitInterval = null;
  let reviewState = { active:false, scope:"all", scopeIds:[], queue:[], maybeQueue:[], phase:"main", currentId:null };
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
  // Local-first revision state. Revisions are persisted with each draft and
  // used only internally; GeoJSON remains unchanged.
  let currentLocalRevision = 0;
  let currentLastSyncedRevision = 0;
  let currentPendingChangeCount = 0;
  const annotationSyncChains = new Map();
  const annotationSyncInFlight = new Set();
  const annotationLatestQueuedRevision = new Map();
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
  // Pixel source and annotation connectivity are independent.
  // A downloaded image can use local pixels while annotations stay connected.
  let currentImageUsesOfflineCopy = false;
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
    const source =
      payload?.type === "FeatureCollection"
      && Array.isArray(payload.features)
        ? payload
        : { type: "FeatureCollection", features: [] };

    const features = source.features
      .filter(
        (feature) =>
          feature?.type === "Feature"
          && feature.geometry
      )
      .map((feature) => {
        const sourceProperties =
          feature.properties
          && typeof feature.properties === "object"
            ? feature.properties
            : {};

        const classification =
          sourceProperties.classification
          && typeof sourceProperties.classification === "object"
            ? sourceProperties.classification
            : null;

        let color =
          classification
            ? rgbArrayToHex(classification.color)
            : null;

        if (
          !color
          && classification
          && classification.colorRGB !== undefined
        ) {
          color =
            colorRgbIntegerToHex(
              classification.colorRGB
            );
        }

        if (!color) {
          color =
            sourceProperties.histoannotator?.color
            || null;
        }

        const properties = {
          objectType:
            sourceProperties.objectType
            || sourceProperties.object_type
            || "annotation",
          isLocked: Boolean(
            sourceProperties.isLocked
          ),
        };

        if (classification?.name) {
          properties.classification = {
            name: String(classification.name),
          };

          const rgb =
            color
              ? hexToRgbArray(color)
              : null;

          if (rgb) {
            properties.classification.color = rgb;
          }
        }

        properties.histoannotator =
          phaseCNormalizeMetadata(
            sourceProperties
          );

        for (
          const key
          of ["name", "description", "measurements"]
        ) {
          if (key in sourceProperties) {
            properties[key] =
              deepClone(sourceProperties[key]);
          }
        }

        return {
          type: "Feature",
          id: String(feature.id || uid()),
          geometry: deepClone(feature.geometry),
          properties,
        };
      });

    return {
      type: "FeatureCollection",
      features,
    };
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

  function connectionServerDescription() {
    if (!IS_NATIVE) {
      return `${window.location.origin}${BASE || ""}`;
    }
    return NATIVE_SERVER || "Not configured";
  }

  function renderConnectionSettings() {
    if (!els.connectionSettingsOverlay) return;

    if (els.connectionServerInput) {
      els.connectionServerInput.value = IS_NATIVE ? NATIVE_SERVER : "";
      els.connectionServerInput.disabled = !IS_NATIVE;
    }

    if (els.connectionCurrentServer) {
      els.connectionCurrentServer.textContent =
        `Current server: ${connectionServerDescription()}`;
    }

    if (els.connectionTestResult) {
      els.connectionTestResult.textContent = IS_NATIVE
        ? (NATIVE_SERVER
            ? "Ready to test the configured server."
            : "No server configured. Cached/offline content remains available.")
        : "The web version uses the server that served this page.";
    }

    if (els.scanConnectionQrButton) {
      els.scanConnectionQrButton.hidden = !IS_NATIVE;
      els.scanConnectionQrButton.disabled = !IS_NATIVE;
    }
    if (els.testConnectionButton) els.testConnectionButton.disabled = !IS_NATIVE;
    if (els.saveConnectionButton) els.saveConnectionButton.disabled = !IS_NATIVE;
    if (els.clearConnectionButton) {
      els.clearConnectionButton.disabled = !IS_NATIVE || !NATIVE_SERVER;
    }
  }

  function openConnectionSettings(autoOpened = false) {
    toggleFileMenu(false);
    renderConnectionSettings();
    if (els.connectionSettingsOverlay) {
      els.connectionSettingsOverlay.hidden = false;
    }
    if (autoOpened && els.connectionTestResult) {
      els.connectionTestResult.textContent =
        "Choose the HistoAnnotator server for this tablet. You can change it later from File → Connection settings.";
    }
  }

  function closeConnectionSettings() {
    if (els.connectionSettingsOverlay) {
      els.connectionSettingsOverlay.hidden = true;
    }
  }

  function nativeBarcodeScannerPlugin() {
    if (!IS_NATIVE) return null;
    return (
      window.Capacitor?.Plugins?.CapacitorBarcodeScanner
      || null
    );
  }

  function serverFromPairingQr(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) {
      throw new Error("The QR code was empty");
    }

    let candidate = raw;

    if (raw.toLowerCase().startsWith("histoannotator://connect")) {
      const parsed = new URL(raw);
      candidate = parsed.searchParams.get("server") || "";
    }

    if (!/^https?:\/\//i.test(candidate)) {
      throw new Error(
        "This QR code does not contain a HistoAnnotator server URL"
      );
    }

    return normalizeServerBase(candidate);
  }


  // ========================================================================
  // Phase G2 — remembered and recent servers
  // Successful server connections are stored locally on the Android device.
  // The current server remains controlled by NATIVE_SERVER_STORAGE_KEY.
  // ========================================================================

  const PHASE_G2_RECENT_SERVERS_KEY =
    "histoannotator.recentServers.v1";

  const PHASE_G2_MAX_RECENT_SERVERS = 6;

  function phaseG2NormalizeServer(value) {
    const candidate =
      String(value || "")
        .trim()
        .replace(/\/+$/, "");

    if (!candidate) return "";

    try {
      const url =
        new URL(candidate);

      if (
        url.protocol !== "http:"
        && url.protocol !== "https:"
      ) {
        return "";
      }

      return candidate;
    } catch (_) {
      return "";
    }
  }

  function phaseG2RecentServers() {
    try {
      const parsed =
        JSON.parse(
          localStorage.getItem(
            PHASE_G2_RECENT_SERVERS_KEY
          )
          || "[]"
        );

      if (!Array.isArray(parsed)) {
        return [];
      }

      const seen = new Set();
      const output = [];

      for (const raw of parsed) {
        const candidate =
          phaseG2NormalizeServer(raw);

        if (!candidate) continue;

        const key =
          candidate.toLowerCase();

        if (seen.has(key)) continue;

        seen.add(key);
        output.push(candidate);

        if (
          output.length
          >= PHASE_G2_MAX_RECENT_SERVERS
        ) {
          break;
        }
      }

      return output;
    } catch (_) {
      return [];
    }
  }

  function phaseG2WriteRecentServers(items) {
    const normalized = [];
    const seen = new Set();

    for (const raw of items || []) {
      const candidate =
        phaseG2NormalizeServer(raw);

      if (!candidate) continue;

      const key =
        candidate.toLowerCase();

      if (seen.has(key)) continue;

      seen.add(key);
      normalized.push(candidate);

      if (
        normalized.length
        >= PHASE_G2_MAX_RECENT_SERVERS
      ) {
        break;
      }
    }

    try {
      localStorage.setItem(
        PHASE_G2_RECENT_SERVERS_KEY,
        JSON.stringify(normalized)
      );
    } catch (_) {}

    return normalized;
  }

  function phaseG2RememberServer(value) {
    const candidate =
      phaseG2NormalizeServer(value);

    if (!candidate) return;

    phaseG2WriteRecentServers([
      candidate,
      ...phaseG2RecentServers(),
    ]);

    phaseG2RenderRecentServers(
      candidate
    );
  }

  function phaseG2Refs() {
    return {
      container:
        document.getElementById(
          "phaseG2RecentServers"
        ),
      select:
        document.getElementById(
          "phaseG2RecentServerSelect"
        ),
      connect:
        document.getElementById(
          "phaseG2ConnectRecentButton"
        ),
      forget:
        document.getElementById(
          "phaseG2ForgetRecentButton"
        ),
      message:
        document.getElementById(
          "phaseG2RecentMessage"
        ),
    };
  }

  function phaseG2CurrentStoredServer() {
    return phaseG2NormalizeServer(
      localStorage.getItem(
        NATIVE_SERVER_STORAGE_KEY
      )
      || ""
    );
  }

  function phaseG2RenderRecentServers(
    preferred = ""
  ) {
    const refs =
      phaseG2Refs();

    if (!refs.select) return;

    const recent =
      phaseG2RecentServers();

    const current =
      phaseG2CurrentStoredServer();

    const wanted =
      phaseG2NormalizeServer(
        preferred
        || refs.select.value
        || current
        || recent[0]
        || ""
      );

    refs.select.innerHTML = "";

    if (!recent.length) {
      const option =
        document.createElement(
          "option"
        );

      option.value = "";
      option.textContent =
        "No recent servers";

      refs.select.append(option);
      refs.select.disabled = true;
    } else {
      refs.select.disabled = false;

      for (const server of recent) {
        const option =
          document.createElement(
            "option"
          );

        option.value = server;
        option.textContent =
          server === current
            ? `${server} · current`
            : server;

        refs.select.append(option);
      }

      const matched =
        recent.find(
          (server) =>
            server.toLowerCase()
            === wanted.toLowerCase()
        );

      if (matched) {
        refs.select.value =
          matched;
      }
    }

    const hasSelection =
      Boolean(
        refs.select.value
      );

    if (refs.connect) {
      refs.connect.disabled =
        !hasSelection;
    }

    if (refs.forget) {
      refs.forget.disabled =
        !hasSelection;
    }

    if (refs.message) {
      refs.message.textContent =
        recent.length
          ? `${recent.length} remembered server${recent.length === 1 ? "" : "s"}`
          : "Successful QR/manual connections will appear here.";
    }
  }

  async function phaseG2ProbeServer(value) {
    const candidate =
      phaseG2NormalizeServer(value);

    if (!candidate) {
      throw new Error(
        "Choose a valid http:// or https:// server"
      );
    }

    const response =
      await apiFetch(
        `${candidate}/api/images`,
        {
          timeoutMs:
            10000,
        }
      );

    const payload =
      await response.json();

    if (
      !payload
      || !Array.isArray(
        payload.images
      )
    ) {
      throw new Error(
        "The server did not return a valid HistoAnnotator image catalog"
      );
    }

    return {
      candidate,
      imageCount:
        payload.images.length,
    };
  }

  async function phaseG2ConnectRecentServer() {
    if (!IS_NATIVE) return;

    const refs =
      phaseG2Refs();

    const candidate =
      phaseG2NormalizeServer(
        refs.select?.value
      );

    if (!candidate) return;

    if (els.connectionServerInput) {
      els.connectionServerInput.value =
        candidate;
    }

    if (refs.message) {
      refs.message.textContent =
        `Testing ${candidate}…`;
    }

    if (refs.connect) {
      refs.connect.disabled =
        true;
    }

    try {
      const result =
        await phaseG2ProbeServer(
          candidate
        );

      setNativeServerBase(
        result.candidate
      );

      phaseG2RememberServer(
        result.candidate
      );

      renderConnectionSettings();

      if (
        els.connectionTestResult
      ) {
        els.connectionTestResult.textContent =
          `Connected · ${result.imageCount} image${result.imageCount === 1 ? "" : "s"} available`;
      }

      await Promise.all([
        loadClasses(),
        loadImages(false),
      ]);

      if (refs.message) {
        refs.message.textContent =
          "Connected successfully.";
      }

      setStatus(
        `Connected · ${result.candidate}`,
        "saved"
      );

    } catch (error) {
      const message =
        error?.message
        || String(error)
        || "Connection failed";

      if (refs.message) {
        refs.message.textContent =
          `Connection failed: ${message}`;
      }

      if (
        els.connectionTestResult
      ) {
        els.connectionTestResult.textContent =
          `Connection failed: ${message}`;
      }

    } finally {
      phaseG2RenderRecentServers(
        candidate
      );
    }
  }

  function phaseG2ForgetRecentServer() {
    const refs =
      phaseG2Refs();

    const candidate =
      phaseG2NormalizeServer(
        refs.select?.value
      );

    if (!candidate) return;

    const current =
      phaseG2CurrentStoredServer();

    const next =
      phaseG2RecentServers()
        .filter(
          (server) =>
            server.toLowerCase()
            !== candidate.toLowerCase()
        );

    phaseG2WriteRecentServers(
      next
    );

    phaseG2RenderRecentServers();

    if (refs.message) {
      refs.message.textContent =
        candidate.toLowerCase()
        === current.toLowerCase()
          ? "Removed from recents. Current connection remains active; use Local only to disconnect."
          : "Server forgotten.";
    }
  }

  function phaseG2Initialize() {
    const refs =
      phaseG2Refs();

    if (!IS_NATIVE) {
      if (refs.container) {
        refs.container.hidden =
          true;
      }
      return;
    }

    const current =
      phaseG2CurrentStoredServer();

    if (current) {
      phaseG2RememberServer(
        current
      );
    } else {
      phaseG2RenderRecentServers();
    }

    refs.connect?.addEventListener(
      "click",
      phaseG2ConnectRecentServer
    );

    refs.forget?.addEventListener(
      "click",
      phaseG2ForgetRecentServer
    );

    refs.select?.addEventListener(
      "change",
      () => {
        const candidate =
          phaseG2NormalizeServer(
            refs.select.value
          );

        if (
          candidate
          && els.connectionServerInput
        ) {
          els.connectionServerInput.value =
            candidate;
        }

        phaseG2RenderRecentServers(
          candidate
        );
      }
    );

    if (els.saveConnectionButton) {
      els.saveConnectionButton.textContent =
        "Save & connect";
    }
  }


  async function scanConnectionQr() {
    if (!IS_NATIVE) return;

    const plugin = nativeBarcodeScannerPlugin();
    if (!plugin?.scanBarcode) {
      els.connectionTestResult.textContent =
        "QR scanner is unavailable in this Android build.";
      return;
    }

    els.connectionTestResult.textContent =
      "Opening camera…";

    try {
      const result = await plugin.scanBarcode({
        hint: 0,
        scanInstructions: "Scan the QR shown by HistoAnnotator Desktop",
        scanButton: false,
        cameraDirection: 1,
        scanOrientation: 3,
        android: {
          scanningLibrary: "zxing",
        },
      });

      const candidate = serverFromPairingQr(
        result?.ScanResult || ""
      );

      if (els.connectionServerInput) {
        els.connectionServerInput.value = candidate;
      }

      els.connectionTestResult.textContent =
        `QR read · testing ${candidate}…`;

      const response = await apiFetch(
        `${candidate}/api/images`,
        { timeoutMs: 10000 }
      );
      const payload = await response.json();

      if (!payload || !Array.isArray(payload.images)) {
        throw new Error(
          "The server did not return a valid HistoAnnotator image catalog"
        );
      }

      setNativeServerBase(candidate);

      phaseG2RememberServer(candidate);
      renderConnectionSettings();

      els.connectionTestResult.textContent =
        `QR connected · ${payload.images.length} image${
          payload.images.length === 1 ? "" : "s"
        } available`;

      closeConnectionSettings();

      await Promise.all([
        loadClasses(),
        loadImages(false),
      ]);

      setStatus(
        `Connected by QR · ${candidate}`,
        "saved"
      );

    } catch (error) {
      const message =
        error?.message
        || String(error)
        || "Unknown QR scanner error";

      els.connectionTestResult.textContent =
        `QR connection failed: ${message}`;
    }
  }

  async function testNativeServerCandidate() {
    if (!IS_NATIVE) return;

    let candidate;
    try {
      candidate = normalizeServerBase(els.connectionServerInput?.value || "");
    } catch (error) {
      els.connectionTestResult.textContent = `Invalid server: ${error.message}`;
      return;
    }

    if (!candidate) {
      els.connectionTestResult.textContent = "Enter a server URL first.";
      return;
    }

    const transport = nativeServerHttpPlugin()?.request
      ? "Android native transport"
      : "WebView fallback";

    els.connectionTestResult.textContent =
      `Testing ${candidate} · ${transport}…`;

    try {
      const response = await apiFetch(
        `${candidate}/api/images`,
        { timeoutMs: 10000 }
      );

      const payload = await response.json();

      if (!payload || !Array.isArray(payload.images)) {
        throw new Error(
          "The server did not return a valid HistoAnnotator image catalog"
        );
      }

      els.connectionTestResult.textContent =
        `Connected successfully · ${payload.images.length} image${
          payload.images.length === 1 ? "" : "s"
        } available · ${transport}`;

    } catch (error) {
      const message = error?.message || String(error) || "Unknown connection error";

      els.connectionTestResult.textContent =
        `Connection failed during HistoAnnotator API: ${message}`;

      console.error("HistoAnnotator connection test failed", {
        candidate,
        transport,
        origin: window.location.origin,
        native: IS_NATIVE,
        error,
      });
    }
  }
  async function saveNativeServerCandidate() {
    if (!IS_NATIVE) return;

    try {
      setNativeServerBase(els.connectionServerInput?.value || "");
      phaseG2RememberServer(els.connectionServerInput?.value || "");
    } catch (error) {
      els.connectionTestResult.textContent = `Invalid server: ${error.message}`;
      return;
    }

    renderConnectionSettings();
    closeConnectionSettings();
    await Promise.all([loadClasses(), loadImages(false)]);
    if (IS_NATIVE && !API) openConnectionSettings(true);
    setStatus(
      NATIVE_SERVER ? `Server set to ${NATIVE_SERVER}` : "Local/offline mode active",
      "saved"
    );
  }

  async function clearNativeServerCandidate() {
    if (!IS_NATIVE) return;
    setNativeServerBase("");
    phaseG2RememberServer("");
    renderConnectionSettings();
    await loadImages(false);
    setStatus("Server cleared · local/offline mode active", "local");
  }

  function simplifyNativeFileMenu() {
    if (!IS_NATIVE) return;
    if (els.openLocalImageButton) els.openLocalImageButton.hidden = true;
    if (els.saveButton) els.saveButton.hidden = true;
    if (els.syncNowButton) els.syncNowButton.hidden = true;
  }

  function organizeNativeLocalFileMenu() {
    if (!IS_NATIVE) return;

    const openLocal =
      els.openLocalImageButton
      || document.getElementById("openLocalImageButton");

    const closeLocal =
      els.closeLocalImagesButton
      || document.getElementById("closeLocalImagesButton");

    if (
      openLocal
      && closeLocal
      && closeLocal.parentElement
      && openLocal.parentElement !== closeLocal.parentElement
    ) {
      openLocal.textContent = "＋ Add local image";
      closeLocal.parentElement.insertBefore(
        openLocal,
        closeLocal
      );
    }

    for (
      const button
      of document.querySelectorAll("button")
    ) {
      const label =
        String(button.textContent || "")
          .trim()
          .toLowerCase();

      if (
        label === "save now"
        || label === "sync now"
      ) {
        button.hidden = true;
      }
    }
  }

  function nativeLocalImagePlugin() {
    if (!IS_NATIVE) return null;
    return window.Capacitor?.Plugins?.LocalImage || null;
  }

  async function nativeLocalImageCapabilities() {
    const plugin = nativeLocalImagePlugin();
    if (!plugin?.getCapabilities) return null;
    try {
      return await plugin.getCapabilities();
    } catch (error) {
      console.warn("LocalImage capabilities unavailable", error);
      return null;
    }
  }

  async function pickNativeLocalImage() {
    toggleFileMenu(false);
    const plugin = nativeLocalImagePlugin();
    if (!plugin?.pickImage) {
      setStatus("Local image picker is only available in the Android app", "error");
      return;
    }

    try {
      const result = await plugin.pickImage();
      if (result?.cancelled) return;
      const image = result?.image;
      if (!image) throw new Error("Android did not return local image metadata");
      setStatus(`${image.name} added to local images`, "saved");
      await showNativeLocalImages();
    } catch (error) {
      setStatus(`Could not add local image: ${error.message}`, "error");
    }
  }

  function localImageAccessLabel(image) {
    if (!image?.accessible) return "Access unavailable";
    return image.seekable
      ? "Persistent access · random access ready"
      : "Persistent access · sequential provider";
  }

  async function showNativeLocalImages() {
    toggleFileMenu(false);
    if (!els.localImagesOverlay || !els.localImagesList) return;

    els.localImagesList.innerHTML = "<p>Loading local image catalog…</p>";
    els.localImagesOverlay.hidden = false;

    const plugin = nativeLocalImagePlugin();
    if (!plugin?.listImages) {
      els.localImagesList.innerHTML = "<p>Local images are available only in the Android app.</p>";
      return;
    }

    try {
      const [catalog, capabilities] = await Promise.all([
        plugin.listImages(),
        nativeLocalImageCapabilities(),
      ]);

      if (els.localImagesCapabilities) {
        els.localImagesCapabilities.textContent = capabilities?.tileReader
          ? "Native local tile reader available."
          : "Android file access is active. TIFF/NDPI/SVS tile decoding is the next development stage.";
      }

      const entries = Array.isArray(catalog?.images) ? catalog.images : [];
      els.localImagesList.innerHTML = "";

      if (!entries.length) {
        const empty = document.createElement("p");
        empty.textContent = "No local images have been selected yet.";
        els.localImagesList.append(empty);
        return;
      }

      entries
        .slice()
        .sort((a, b) => Number(b.lastOpened || 0) - Number(a.lastOpened || 0))
        .forEach((image) => {
          const row = document.createElement("div");
          row.className = "local-image-row";

          const details = document.createElement("div");
          details.className = "local-image-details";

          const name = document.createElement("strong");
          name.textContent = image.name || "Local image";

          const meta = document.createElement("small");
          const size = Number.isFinite(Number(image.sizeBytes))
            ? formatBytes(Number(image.sizeBytes))
            : "size unknown";
          const ext = image.extension || "file";
          meta.textContent = `${ext} · ${size} · ${localImageAccessLabel(image)}`;

          details.append(name, meta);
          const cachedTiffInfo =
            readLocalTiffInfo(
              image.id
            );

          if (cachedTiffInfo) {
            const structure =
              document.createElement(
                "small"
              );

            structure.textContent =
              formatLocalTiffStructure(
                cachedTiffInfo
              );

            details.append(
              structure
            );
          }


          const actions = document.createElement("div");
          actions.className = "local-image-actions";

          const inspect = document.createElement("button");
          inspect.type = "button";
          inspect.textContent = "Check access";
          inspect.disabled = !image.accessible;
          inspect.addEventListener("click", async () => {
            inspect.disabled = true;
            try {
              const result = await plugin.probeImage({ uri: image.uri });
              const probe = result?.image || {};
              setStatus(
                `${image.name} · ${probe.accessible ? "readable" : "not readable"} · ${probe.seekable ? "random access ready" : "provider is not seekable"}`,
                probe.accessible ? "saved" : "error"
              );
              await showNativeLocalImages();
            } catch (error) {
              setStatus(`Local access check failed: ${error.message}`, "error");
            } finally {
              inspect.disabled = false;
            }
          });

          const forget = document.createElement("button");
          forget.type = "button";
          forget.textContent = "Forget";
          forget.addEventListener("click", async () => {
            if (!window.confirm(`Forget ${image.name}? The source image itself will not be deleted.`)) return;
            forget.disabled = true;
            try {
              await plugin.forgetImage({ id: image.id });
              setStatus(`${image.name} removed from local images`, "local");
              await showNativeLocalImages();
            } catch (error) {
              setStatus(`Could not forget local image: ${error.message}`, "error");
              forget.disabled = false;
            }
          });

          actions.append(inspect, forget);
          row.append(details, actions);
          els.localImagesList.append(row);
        });
    } catch (error) {
      els.localImagesList.innerHTML = "";
      const message = document.createElement("p");
      message.textContent = `Could not load local images: ${error.message}`;
      els.localImagesList.append(message);
    }
  }




  // ---------------------------------------------------------
  // v1.2.0-dev5a: automatic local TIFF optimization
  // ---------------------------------------------------------
  const LOCAL_TIFF_INFO_PREFIX =
    "histoannotator.localTiffInfo.v2:";

  const localTiffSessions =
    new Map();

  function readLocalTiffInfo(imageId) {
    if (!imageId) return null;

    try {
      const raw =
        localStorage.getItem(
          `${LOCAL_TIFF_INFO_PREFIX}${imageId}`
        );

      return raw
        ? JSON.parse(raw)
        : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalTiffInfo(imageId, info) {
    if (!imageId || !info) return;

    try {
      localStorage.setItem(
        `${LOCAL_TIFF_INFO_PREFIX}${imageId}`,
        JSON.stringify(info)
      );
    } catch (_) {}
  }

  function formatLocalTiffStructure(info) {
    if (!info) return "";

    return [
      info.width && info.height
        ? `${info.width} × ${info.height}`
        : "",
      info.storage || "",
      info.pyramidLevels > 1
        ? `${info.pyramidLevels} internal levels`
        : "No internal pyramid",
      info.compression || "",
      info.fastPath || "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function isNativeLocalTiff(image) {
    const name =
      String(image?.name || "")
        .toLowerCase();

    return (
      name.endsWith(".tif")
      || name.endsWith(".tiff")
      || name.endsWith(".ome.tif")
      || name.endsWith(".ome.tiff")
    );
  }

  function base64ToBytes(value) {
    const binary =
      atob(String(value || ""));

    const bytes =
      new Uint8Array(binary.length);

    for (
      let i = 0;
      i < binary.length;
      i += 1
    ) {
      bytes[i] =
        binary.charCodeAt(i);
    }

    return bytes;
  }

  class NativeTiffRangeResponse {
    constructor(bytes, start, totalSize) {
      this.bytes = bytes;
      this.start = Number(start || 0);
      this.totalSize = Number(totalSize || 0);
      this.status = 206;
      this.ok = true;
    }

    getHeader(name) {
      const key =
        String(name || "")
          .toLowerCase();

      const end =
        this.start
        + Math.max(
            0,
            this.bytes.byteLength - 1
          );

      if (key === "content-range") {
        return `bytes ${this.start}-${end}/${this.totalSize}`;
      }

      if (key === "content-length") {
        return String(this.bytes.byteLength);
      }

      if (key === "accept-ranges") {
        return "bytes";
      }

      if (key === "content-type") {
        return "image/tiff";
      }

      return null;
    }

    async getData() {
      return this.bytes.buffer.slice(
        this.bytes.byteOffset,
        this.bytes.byteOffset
          + this.bytes.byteLength
      );
    }
  }

  class NativeTiffRangeClient {
    constructor(uri, totalSize) {
      this.uri = uri;
      this.totalSize =
        Number(totalSize || 0);
    }

    async request(options = {}) {
      const headers =
        options?.headers || {};

      const rangeValue =
        headers.Range
        || headers.range
        || "";

      const match =
        String(rangeValue).match(
          /^bytes=(\d+)-(\d+)?$/
        );

      if (!match) {
        throw new Error(
          `Unsupported TIFF range request: ${rangeValue || "missing Range header"}`
        );
      }

      const start =
        Number(match[1]);

      const requestedEnd =
        match[2] !== undefined
          ? Number(match[2])
          : Math.min(
              Math.max(
                start,
                this.totalSize - 1
              ),
              start + 65535
            );

      const length =
        Math.max(
          1,
          requestedEnd - start + 1
        );

      const plugin =
        nativeLocalImagePlugin();

      if (!plugin?.readRange) {
        throw new Error(
          "Native TIFF range reader is unavailable"
        );
      }

      const result =
        await plugin.readRange({
          uri: this.uri,
          offset: start,
          length,
        });

      const bytes =
        base64ToBytes(
          result?.dataBase64 || ""
        );

      if (!bytes.byteLength) {
        throw new Error(
          `Android returned 0 TIFF bytes for ${start}-${requestedEnd}`
        );
      }

      const totalSize =
        Number(result?.totalSize) > 0
          ? Number(result.totalSize)
          : this.totalSize;

      return new NativeTiffRangeResponse(
        bytes,
        start,
        totalSize
      );
    }
  }

  function createLocalTiffDecoderPool() {
    if (
      typeof window.Worker !== "function"
      || typeof window.GeoTIFF?.Pool !== "function"
    ) {
      return null;
    }

    try {
      return new window.GeoTIFF.Pool(2);
    } catch (_) {
      return null;
    }
  }

  const localTiffViewerDefaults = {
    captured: false,
    timeout: 30000,
    jobLimit: 0,
    minPixelRatio: 0.5,
  };

  function configureLocalTiffViewer(active) {
    if (!viewer?.imageLoader) return;

    if (!localTiffViewerDefaults.captured) {
      localTiffViewerDefaults.timeout =
        Number(viewer.imageLoader.timeout)
        || 30000;

      localTiffViewerDefaults.jobLimit =
        Number(viewer.imageLoader.jobLimit)
        || 0;

      localTiffViewerDefaults.minPixelRatio =
        Number(viewer.minPixelRatio)
        || 0.5;

      localTiffViewerDefaults.captured =
        true;
    }

    if (active) {
      viewer.imageLoader.jobLimit = 1;
      viewer.imageLoader.timeout = 120000;
      viewer.minPixelRatio = 1.0;
    } else {
      viewer.imageLoader.jobLimit =
        localTiffViewerDefaults.jobLimit;

      viewer.imageLoader.timeout =
        localTiffViewerDefaults.timeout;

      viewer.minPixelRatio =
        localTiffViewerDefaults.minPixelRatio;
    }
  }

  function normalizeTiffNumericArray(value) {
    if (
      value === null
      || value === undefined
    ) {
      return [];
    }

    if (typeof value === "number") {
      return [Number(value)];
    }

    try {
      return Array.from(value, Number);
    } catch (_) {
      return [Number(value)]
        .filter(Number.isFinite);
    }
  }

  function detectNativeUncompressedRgbLayout(
    tiffImage
  ) {
    const directory =
      tiffImage?.fileDirectory
      || {};

    const width =
      Number(tiffImage?.getWidth?.());

    const height =
      Number(tiffImage?.getHeight?.());

    const compression =
      Number(
        directory.Compression
        ?? 1
      );

    const photometric =
      Number(
        directory.PhotometricInterpretation
      );

    const samplesPerPixel =
      Number(
        directory.SamplesPerPixel
        ?? 1
      );

    const planarConfiguration =
      Number(
        directory.PlanarConfiguration
        ?? 1
      );

    const bits =
      normalizeTiffNumericArray(
        directory.BitsPerSample
        ?? 8
      );

    const stripOffsets =
      normalizeTiffNumericArray(
        directory.StripOffsets
      ).filter(Number.isFinite);

    const stripByteCounts =
      normalizeTiffNumericArray(
        directory.StripByteCounts
      ).filter(Number.isFinite);

    const rowsPerStrip =
      Math.max(
        1,
        Number(
          directory.RowsPerStrip
          ?? height
        )
      );

    const allEightBit =
      bits.length > 0
      && bits.every(
        (value) =>
          Number(value) === 8
      );

    const expectedBytes =
      width * height * 3;

    const totalStripBytes =
      stripByteCounts.reduce(
        (sum, value) =>
          sum
          + Number(value || 0),
        0
      );

    if (
      !Number.isFinite(width)
      || !Number.isFinite(height)
      || width <= 0
      || height <= 0
      || compression !== 1
      || photometric !== 2
      || samplesPerPixel !== 3
      || planarConfiguration !== 1
      || !allEightBit
      || stripOffsets.length === 0
      || (
        stripByteCounts.length > 0
        && totalStripBytes < expectedBytes
      )
    ) {
      return null;
    }

    return {
      imageWidth: width,
      imageHeight: height,
      rowsPerStrip,
      stripOffsets,
      stripByteCounts,
      strips: stripOffsets.length,
    };
  }

  function localTiffCandidateLevels(images) {
    if (!images.length) return [];

    const fullWidth =
      images[0].getWidth();

    const fullHeight =
      images[0].getHeight();

    const fullAspect =
      fullWidth / fullHeight;

    const compatible =
      images
        .map(
          (image, index) => ({
            image,
            index,
            width: image.getWidth(),
            height: image.getHeight(),
          })
        )
        .filter(
          (item) => {
            if (
              !item.width
              || !item.height
            ) {
              return false;
            }

            const aspect =
              item.width / item.height;

            return (
              Math.abs(
                aspect / fullAspect - 1
              )
              <= 0.025
            );
          }
        );

    const sameFullSize =
      compatible.filter(
        (item) =>
          item.width === fullWidth
          && item.height === fullHeight
      ).length;

    if (sameFullSize > 1) {
      throw new Error(
        "This TIFF appears to contain multiple full-resolution pages/channels. Scientific multichannel TIFF remains a later local-reader milestone."
      );
    }

    const bySize = new Map();

    for (const item of compatible) {
      const key =
        `${item.width}x${item.height}`;

      if (!bySize.has(key)) {
        bySize.set(key, item);
      }
    }

    return [
      ...bySize.values(),
    ].sort(
      (a, b) =>
        a.width - b.width
    );
  }

  function chooseLocalTiffLevel(
    session,
    targetWidth
  ) {
    for (const level of session.levels) {
      if (level.width >= targetWidth) {
        return level;
      }
    }

    return session.levels[
      session.levels.length - 1
    ];
  }

  async function cachedJpegToContext2D(
    dataBase64
  ) {
    return new Promise(
      (resolve, reject) => {
        const image = new Image();

        image.onload = () => {
          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            image.naturalWidth
            || image.width;

          canvas.height =
            image.naturalHeight
            || image.height;

          const context =
            canvas.getContext(
              "2d",
              { alpha: false }
            );

          if (!context) {
            reject(
              new Error(
                "Could not create cached tile canvas"
              )
            );
            return;
          }

          context.drawImage(
            image,
            0,
            0
          );

          resolve(context);
        };

        image.onerror = () =>
          reject(
            new Error(
              "Could not decode prepared JPEG tile"
            )
          );

        image.src =
          `data:image/jpeg;base64,${dataBase64}`;
      }
    );
  }

  function localTiffRgbToContext2D(
    rgb,
    width,
    height
  ) {
    const canvas =
      document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context =
      canvas.getContext(
        "2d",
        { alpha: false }
      );

    if (!context) {
      throw new Error(
        "Could not create TIFF tile canvas"
      );
    }

    const imageData =
      context.createImageData(
        width,
        height
      );

    const target =
      imageData.data;

    const mask =
      displayChannels.rgb
      || {
        red: true,
        green: true,
        blue: true,
      };

    for (
      let src = 0, dst = 0;
      dst < target.length;
      src += 3, dst += 4
    ) {
      target[dst] =
        mask.red
          ? Number(rgb[src])
          : 0;

      target[dst + 1] =
        mask.green
          ? Number(rgb[src + 1])
          : 0;

      target[dst + 2] =
        mask.blue
          ? Number(rgb[src + 2])
          : 0;

      target[dst + 3] = 255;
    }

    context.putImageData(
      imageData,
      0,
      0
    );

    return context;
  }

  async function getLocalTileCacheInfo(image) {
    const plugin =
      nativeLocalImagePlugin();

    if (
      !plugin?.getTileCacheInfo
      || !image?.uri
    ) {
      return {
        tiles: 0,
        bytes: 0,
      };
    }

    try {
      return await plugin.getTileCacheInfo({
        uri: image.uri,
      });
    } catch (_) {
      return {
        tiles: 0,
        bytes: 0,
      };
    }
  }

  async function readLocalCachedTile(
    session,
    level,
    x,
    y
  ) {
    const plugin =
      nativeLocalImagePlugin();

    if (!plugin?.getCachedTile) {
      return null;
    }

    try {
      const result =
        await plugin.getCachedTile({
          uri: session.source.uri,
          level,
          x,
          y,
        });

      if (
        result?.hit
        && result?.dataBase64
      ) {
        return await cachedJpegToContext2D(
          result.dataBase64
        );
      }
    } catch (_) {}

    return null;
  }

  async function persistEncodedLocalTile(
    session,
    level,
    x,
    y,
    dataBase64
  ) {
    const plugin =
      nativeLocalImagePlugin();

    if (
      !plugin?.putCachedTile
      || !dataBase64
    ) {
      return;
    }

    await plugin.putCachedTile({
      uri: session.source.uri,
      level,
      x,
      y,
      dataBase64,
    });
  }

  function canvasToJpegBase64(
    canvas,
    quality = 0.88
  ) {
    return new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(
                new Error(
                  "Could not encode prepared TIFF tile"
                )
              );
              return;
            }

            try {
              const bytes =
                new Uint8Array(
                  await blob.arrayBuffer()
                );

              let binary = "";
              const chunk = 0x8000;

              for (
                let offset = 0;
                offset < bytes.length;
                offset += chunk
              ) {
                binary +=
                  String.fromCharCode(
                    ...bytes.subarray(
                      offset,
                      Math.min(
                        bytes.length,
                        offset + chunk
                      )
                    )
                  );
              }

              resolve(
                btoa(binary)
              );
            } catch (error) {
              reject(error);
            }
          },
          "image/jpeg",
          quality
        );
      }
    );
  }

  function dziTileGeometry(
    info,
    dziLevel,
    tileX,
    tileY
  ) {
    const maxLevel =
      info.levelCount - 1;

    const downsample =
      2 ** Math.max(
        0,
        maxLevel - dziLevel
      );

    const sourceX =
      tileX
      * info.tileSize
      * downsample;

    const sourceY =
      tileY
      * info.tileSize
      * downsample;

    if (
      sourceX >= info.width
      || sourceY >= info.height
    ) {
      throw new Error(
        "Local TIFF tile is outside image bounds"
      );
    }

    const sourceWidth =
      Math.min(
        info.tileSize * downsample,
        info.width - sourceX
      );

    const sourceHeight =
      Math.min(
        info.tileSize * downsample,
        info.height - sourceY
      );

    return {
      downsample,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      outWidth:
        Math.max(
          1,
          Math.ceil(
            sourceWidth / downsample
          )
        ),
      outHeight:
        Math.max(
          1,
          Math.ceil(
            sourceHeight / downsample
          )
        ),
    };
  }

  async function readNativeUncompressedRgbTile(
    session,
    level,
    x,
    y
  ) {
    const plugin =
      nativeLocalImagePlugin();

    const layout =
      session?.directRgbLayout;

    if (
      !plugin?.readUncompressedRgbTile
      || !layout
    ) {
      return null;
    }

    const geometry =
      dziTileGeometry(
        session.info,
        level,
        x,
        y
      );

    const result =
      await plugin.readUncompressedRgbTile({
        uri: session.source.uri,
        imageWidth: layout.imageWidth,
        imageHeight: layout.imageHeight,
        sourceX: geometry.sourceX,
        sourceY: geometry.sourceY,
        sourceWidth: geometry.sourceWidth,
        sourceHeight: geometry.sourceHeight,
        downsample: geometry.downsample,
        rowsPerStrip: layout.rowsPerStrip,
        stripOffsets: layout.stripOffsets,
      });

    if (!result?.dataBase64) {
      throw new Error(
        "Native TIFF optimizer returned no tile data"
      );
    }

    return {
      context:
        await cachedJpegToContext2D(
          result.dataBase64
        ),
      dataBase64:
        result.dataBase64,
    };
  }

  async function renderGeoTiffTile(
    session,
    dziLevel,
    tileX,
    tileY,
    signal = null
  ) {
    const geometry =
      dziTileGeometry(
        session.info,
        dziLevel,
        tileX,
        tileY
      );

    const targetImageWidth =
      Math.max(
        1,
        Math.ceil(
          session.info.width
          / geometry.downsample
        )
      );

    const selected =
      chooseLocalTiffLevel(
        session,
        targetImageWidth
      );

    const scaleX =
      selected.width
      / session.info.width;

    const scaleY =
      selected.height
      / session.info.height;

    const left =
      Math.max(
        0,
        Math.floor(
          geometry.sourceX * scaleX
        )
      );

    const top =
      Math.max(
        0,
        Math.floor(
          geometry.sourceY * scaleY
        )
      );

    const right =
      Math.min(
        selected.width,
        Math.max(
          left + 1,
          Math.ceil(
            (
              geometry.sourceX
              + geometry.sourceWidth
            ) * scaleX
          )
        )
      );

    const bottom =
      Math.min(
        selected.height,
        Math.max(
          top + 1,
          Math.ceil(
            (
              geometry.sourceY
              + geometry.sourceHeight
            ) * scaleY
          )
        )
      );

    const options = {
      window: [
        left,
        top,
        right,
        bottom,
      ],
      width: geometry.outWidth,
      height: geometry.outHeight,
      resampleMethod: "bilinear",
      interleave: true,
    };

    if (session.decoderPool) {
      options.pool =
        session.decoderPool;
    }

    if (signal) {
      options.signal = signal;
    }

    const rgb =
      await selected.image.readRGB(
        options
      );

    return localTiffRgbToContext2D(
      rgb,
      geometry.outWidth,
      geometry.outHeight
    );
  }

  async function prepareOneLocalTile(
    session,
    level,
    x,
    y
  ) {
    const cached =
      await readLocalCachedTile(
        session,
        level,
        x,
        y
      );

    if (cached) return;

    if (session.directRgbLayout) {
      const nativeTile =
        await readNativeUncompressedRgbTile(
          session,
          level,
          x,
          y
        );

      if (nativeTile) {
        await persistEncodedLocalTile(
          session,
          level,
          x,
          y,
          nativeTile.dataBase64
        );

        return;
      }
    }

    const context =
      await renderGeoTiffTile(
        session,
        level,
        x,
        y
      );

    const dataBase64 =
      await canvasToJpegBase64(
        context.canvas,
        0.88
      );

    await persistEncodedLocalTile(
      session,
      level,
      x,
      y,
      dataBase64
    );
  }

  function localOverviewPlan(info) {
    const maxLevel =
      info.levelCount - 1;

    const candidates = [];

    for (
      let level = 0;
      level <= maxLevel;
      level += 1
    ) {
      const downsample =
        2 ** Math.max(
          0,
          maxLevel - level
        );

      const width =
        Math.ceil(
          info.width / downsample
        );

      const height =
        Math.ceil(
          info.height / downsample
        );

      if (
        Math.max(width, height)
        > 2048
      ) {
        continue;
      }

      const columns =
        Math.ceil(
          width / info.tileSize
        );

      const rows =
        Math.ceil(
          height / info.tileSize
        );

      candidates.push({
        level,
        columns,
        rows,
        tiles:
          columns * rows,
      });
    }

    const selected = [];
    let total = 0;

    for (
      let i = candidates.length - 1;
      i >= 0;
      i -= 1
    ) {
      const candidate =
        candidates[i];

      if (
        total + candidate.tiles
        > 64
      ) {
        continue;
      }

      selected.push(candidate);
      total += candidate.tiles;

      if (selected.length >= 4) {
        break;
      }
    }

    return selected;
  }

  async function prepareLocalFastOverview(
    session
  ) {
    if (
      session.optimizing
      || session.optimized
    ) {
      return;
    }

    session.optimizing = true;

    const plan =
      localOverviewPlan(
        session.info
      );

    const total =
      plan.reduce(
        (sum, item) =>
          sum + item.tiles,
        0
      );

    let completed = 0;

    try {
      for (const item of plan) {
        for (
          let y = 0;
          y < item.rows;
          y += 1
        ) {
          for (
            let x = 0;
            x < item.columns;
            x += 1
          ) {
            if (
              !currentImage
              || currentImage.id
                !== session.source.id
            ) {
              return;
            }

            await prepareOneLocalTile(
              session,
              item.level,
              x,
              y
            );

            completed += 1;

            if (
              completed === 1
              || completed === total
              || completed % 4 === 0
            ) {
              setStatus(
                `${session.source.name} · optimizing local view ${completed}/${total}`,
                "local"
              );
            }

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  35
                )
            );
          }
        }
      }

      session.optimized = true;

      const cacheInfo =
        await getLocalTileCacheInfo(
          session.source
        );

      setStatus(
        `${session.source.name} · local view optimized · ${Number(cacheInfo?.tiles || 0)} prepared tiles`,
        "saved"
      );
    } catch (error) {
      console.warn(
        "Automatic local TIFF optimization stopped",
        error
      );

      setStatus(
        `${session.source.name} · local optimization partial`,
        "local"
      );
    } finally {
      session.optimizing = false;
    }
  }

  function localTiffTileDownloadStart(
    context
  ) {
    (async () => {
      try {
        const abortController =
          new AbortController();

        context.userData.abortController =
          abortController;

        const match =
          String(context.src).match(
            /^histo-local-tiff:\/\/([^/]+)\/(\d+)\/(\d+)_(\d+)$/
          );

        if (!match) {
          throw new Error(
            "Invalid local TIFF tile URL"
          );
        }

        const sessionId =
          decodeURIComponent(match[1]);

        const level =
          Number(match[2]);

        const x =
          Number(match[3]);

        const y =
          Number(match[4]);

        const session =
          localTiffSessions.get(
            sessionId
          );

        if (!session) {
          throw new Error(
            "Local TIFF session is no longer active"
          );
        }

        const cached =
          await readLocalCachedTile(
            session,
            level,
            x,
            y
          );

        if (cached) {
          context.userData.histoTileSource =
            "prepared-local-cache";

          context.finish(
            cached,
            null,
            "context2d"
          );

          return;
        }

        if (session.directRgbLayout) {
          const nativeTile =
            await readNativeUncompressedRgbTile(
              session,
              level,
              x,
              y
            );

          if (nativeTile) {
            context.userData.histoTileSource =
              "android-native-rgb";

            context.finish(
              nativeTile.context,
              null,
              "context2d"
            );

            window.setTimeout(
              () => {
                persistEncodedLocalTile(
                  session,
                  level,
                  x,
                  y,
                  nativeTile.dataBase64
                ).catch(() => {});
              },
              0
            );

            return;
          }
        }

        const tileContext =
          await renderGeoTiffTile(
            session,
            level,
            x,
            y,
            abortController.signal
          );

        context.userData.histoTileSource =
          "geotiff-fallback";

        context.finish(
          tileContext,
          null,
          "context2d"
        );

        window.setTimeout(
          async () => {
            try {
              const dataBase64 =
                await canvasToJpegBase64(
                  tileContext.canvas,
                  0.88
                );

              await persistEncodedLocalTile(
                session,
                level,
                x,
                y,
                dataBase64
              );
            } catch (_) {}
          },
          0
        );
      } catch (error) {
        if (error?.name === "AbortError") {
          context.fail(
            "Local TIFF tile aborted",
            null
          );
          return;
        }

        const message =
          error?.message
          || String(error)
          || "Unknown local TIFF error";

        console.error(
          "HistoAnnotator local TIFF tile error",
          {
            src: context.src,
            message,
            error,
          }
        );

        context.fail(
          `Local TIFF tile unavailable: ${message}`,
          null
        );
      }
    })();
  }

  function buildLocalTiffViewerSource(
    session
  ) {
    const info =
      session.info;

    return {
      ready: true,
      width: info.width,
      height: info.height,
      tileSize: info.tileSize,
      tileOverlap: 0,
      minLevel: 0,
      maxLevel:
        info.levelCount - 1,

      getTileUrl(level, x, y) {
        return (
          "histo-local-tiff://"
          + `${encodeURIComponent(
              session.id
            )}/${level}/${x}_${y}`
        );
      },

      downloadTileStart:
        localTiffTileDownloadStart,

      downloadTileAbort(context) {
        const controller =
          context?.userData
            ?.abortController;

        if (controller) {
          controller.abort();
        }
      },

      hasTransparency() {
        return false;
      },
    };
  }


  async function createNativeLocalTiffSession(
    image
  ) {
    const plugin =
      nativeLocalImagePlugin();

    if (!plugin?.probeImage) {
      throw new Error(
        "Native LocalImage plugin is unavailable"
      );
    }

    const probeResult =
      await plugin.probeImage({
        uri: image.uri,
      });

    const probe =
      probeResult?.image
      || {};

    if (!probe.accessible) {
      throw new Error(
        "Android no longer grants access to this file"
      );
    }

    if (!probe.seekable) {
      throw new Error(
        "This document provider does not offer random access"
      );
    }

    const totalSize =
      Number(probe.statSize) > 0
        ? Number(probe.statSize)
        : Number(image.sizeBytes);

    if (!(totalSize > 0)) {
      throw new Error(
        "Android did not provide the TIFF file size"
      );
    }

    // IMPORTANT:
    // Inspect classic TIFF metadata natively FIRST.
    // This completely bypasses GeoTIFF.js for standard
    // uncompressed RGB strip TIFFs such as ID_2100_2.tif.
    if (plugin?.inspectBasicTiff) {
      try {
        const nativeInspection =
          await plugin.inspectBasicTiff({
            uri: image.uri,
          });

        if (
          nativeInspection?.recognized
          && nativeInspection?.directRgbSupported
        ) {
          const width =
            Number(
              nativeInspection.width
            );

          const height =
            Number(
              nativeInspection.height
            );

          const stripOffsets =
            Array.from(
              nativeInspection.stripOffsets
              || [],
              Number
            );

          const rowsPerStrip =
            Number(
              nativeInspection.rowsPerStrip
            );

          if (
            width > 0
            && height > 0
            && rowsPerStrip > 0
            && stripOffsets.length > 0
          ) {
            const maxLevel =
              Math.ceil(
                Math.log2(
                  Math.max(
                    width,
                    height
                  )
                )
              );

            const directRgbLayout = {
              imageWidth: width,
              imageHeight: height,
              rowsPerStrip,
              stripOffsets,
              stripByteCounts:
                Array.from(
                  nativeInspection.stripByteCounts
                  || [],
                  Number
                ),
              strips:
                Number(
                  nativeInspection.strips
                )
                || stripOffsets.length,
            };

            const session = {
              id: image.id,
              source: image,
              tiff: null,
              levels: [],
              full: null,
              decoderPool: null,
              directRgbLayout,
              optimizing: false,
              optimized: false,
              nativeMetadata: true,
              info: {
                width,
                height,
                tileSize: 256,
                tileOverlap: 0,
                levelCount:
                  maxLevel + 1,
                directRaster: false,
                sourceKind:
                  "android-native-rgb-optimized",
                localNative: true,
                calibrationAvailable:
                  false,
                calibrationSource:
                  null,
                mppX: null,
                mppY: null,
                objectivePower:
                  null,
                multichannel: {
                  scientificMultichannel:
                    false,
                },
              },
            };

            writeLocalTiffInfo(
              image.id,
              {
                width,
                height,
                storage:
                  directRgbLayout.strips === 1
                    ? "Single RGB strip"
                    : `${directRgbLayout.strips} RGB strips`,
                pyramidLevels: 1,
                compression:
                  "Uncompressed RGB",
                fastPath:
                  "Native TIFF header + direct Android optimization",
              }
            );

            localTiffSessions.set(
              image.id,
              session
            );

            setStatus(
              `${image.name} · native TIFF optimizer active`,
              "local"
            );

            return session;
          }
        }
      } catch (error) {
        console.warn(
          "Native TIFF inspection unavailable; trying general reader",
          error
        );
      }
    }

    // General TIFF / OME-TIFF fallback.
    if (
      !window.GeoTIFF?.fromCustomClient
    ) {
      throw new Error(
        "This TIFF is not supported by the native fast path and the general TIFF reader is unavailable"
      );
    }

    const decoderPool =
      createLocalTiffDecoderPool();

    const client =
      new NativeTiffRangeClient(
        image.uri,
        totalSize
      );

    const tiff =
      await window.GeoTIFF.fromCustomClient(
        client,
        {
          blockSize: 65536,
          cacheSize: 128,
        }
      );

    const imageCount =
      await tiff.getImageCount();

    if (!imageCount) {
      throw new Error(
        "No TIFF image directories were found"
      );
    }

    const ifds = [];

    for (
      let index = 0;
      index < Math.min(
        imageCount,
        64
      );
      index += 1
    ) {
      ifds.push(
        await tiff.getImage(index)
      );
    }

    const levels =
      localTiffCandidateLevels(
        ifds
      );

    if (!levels.length) {
      throw new Error(
        "No compatible TIFF image levels were found"
      );
    }

    const full =
      levels[
        levels.length - 1
      ];

    const width =
      full.width;

    const height =
      full.height;

    const directRgbLayout =
      detectNativeUncompressedRgbLayout(
        full.image
      );

    const maxLevel =
      Math.ceil(
        Math.log2(
          Math.max(
            width,
            height
          )
        )
      );

    const session = {
      id: image.id,
      source: image,
      tiff,
      levels,
      full,
      decoderPool,
      directRgbLayout,
      optimizing: false,
      optimized: false,
      nativeMetadata: false,
      info: {
        width,
        height,
        tileSize: 256,
        tileOverlap: 0,
        levelCount:
          maxLevel + 1,
        directRaster: false,
        sourceKind:
          directRgbLayout
            ? "android-native-rgb-optimized"
            : "android-local-tiff-cache",
        localNative: true,
        calibrationAvailable: false,
        calibrationSource: null,
        mppX: null,
        mppY: null,
        objectivePower: null,
        multichannel: {
          scientificMultichannel:
            false,
        },
      },
    };

    writeLocalTiffInfo(
      image.id,
      {
        width,
        height,
        storage:
          directRgbLayout
            ? (
                directRgbLayout.strips === 1
                  ? "Single RGB strip"
                  : `${directRgbLayout.strips} RGB strips`
              )
            : (
                levels.length > 1
                  ? "Pyramidal TIFF"
                  : "TIFF"
              ),
        pyramidLevels:
          levels.length,
        compression:
          directRgbLayout
            ? "Uncompressed RGB"
            : "GeoTIFF-compatible",
        fastPath:
          directRgbLayout
            ? "GeoTIFF metadata + native pixels"
            : "Persistent local tile cache",
      }
    );

    localTiffSessions.set(
      image.id,
      session
    );

    return session;
  }


  async function nativeLocalCatalogImages() {
    const plugin =
      nativeLocalImagePlugin();

    if (!plugin?.listImages) {
      return [];
    }

    try {
      const payload =
        await plugin.listImages();

      return (
        Array.isArray(
          payload?.images
        )
          ? payload.images
          : []
      ).map(
        (image) => ({
          ...image,
          localNative: true,
          sourceKind: "android-local",
          relativePath:
            image.relativePath
            || image.name
            || "Local image",
        })
      );
    } catch (error) {
      console.warn(
        "Could not read native local catalog",
        error
      );
      return [];
    }
  }

  async function openNativeLocalTiff(
    sourceImage,
    existingSequence = null
  ) {
    if (!sourceImage) return;

    if (!isNativeLocalTiff(sourceImage)) {
      throw new Error(
        "Local optimizer currently supports TIFF/OME-TIFF."
      );
    }

    if (reviewState.active) {
      exitReviewMode();
    }

    const sequence =
      existingSequence
      ?? ++openSequence;

    if (
      existingSequence === null
      && dirty
    ) {
      await saveAnnotations(false);
    }

    currentImage = {
      ...deepClone(sourceImage),
      localNative: true,
      sourceKind:
        "android-local-optimized",
      relativePath:
        sourceImage.relativePath
        || sourceImage.name,
    };

    images =
      mergeKnownImages(
        images,
        [currentImage]
      );

    els.inputGuide.hidden = true;
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

    localDraftState =
      "Opening optimized local TIFF";

    tileStats = {
      loaded: 0,
      failed: 0,
    };

    els.emptyMessage.hidden = false;
    els.emptyMessage.textContent =
      "Preparing local image…";

    const cacheInfo =
      await getLocalTileCacheInfo(
        currentImage
      );

    if (
      Number(cacheInfo?.tiles) > 0
    ) {
      setStatus(
        `Opening ${currentImage.name} · ${cacheInfo.tiles} prepared tiles available`,
        "local"
      );
    } else {
      setStatus(
        `Opening ${currentImage.name} · preparing fast local view`,
        "local"
      );
    }

    configureLocalTiffViewer(true);
    viewer.close();

    try {
      const session =
        localTiffSessions.get(
          currentImage.id
        )
        || await createNativeLocalTiffSession(
          currentImage
        );

      if (sequence !== openSequence) {
        return;
      }

      currentInfo = session.info;
      imageType = "rgb";

      if (els.imageTypeSelect) {
        els.imageTypeSelect.value =
          "rgb";
      }

      renderChannelControls();
      saveDisplaySettings();

      const draftRecords =
        await idbGetAll(DB_STORE);

      annotationFiles =
        Array.from(
          new Set([
            "Default",
            ...draftRecords
              .filter(
                (record) =>
                  record?.sourceImageId
                  === currentImage.id
              )
              .map(
                (record) =>
                  record.annotationFile
                  || "Default"
              ),
          ])
        );

      if (
        !annotationFiles.includes(
          currentAnnotationFile
        )
      ) {
        currentAnnotationFile =
          "Default";
      }

      renderAnnotationFileOptions();

      const localDraft =
        await getLocalDraft(
          currentImage.id,
          currentAnnotationFile
        );
      restoreCurrentRevisionState(localDraft);

      if (
        localDraft?.featureCollection?.type
        === "FeatureCollection"
      ) {
        featureCollection =
          normalizeFeatureCollectionClient(
            localDraft.featureCollection
          );

        localDraftState =
          "Local annotations";
      } else {
        featureCollection = {
          type: "FeatureCollection",
          features: [],
        };

        localDraftState =
          "Local file";

        await persistLocalDraft(
          false,
          currentImage,
          featureCollection
        );
      }

      featureCollection.features
        .forEach(featureId);

      restoreViewportState =
        await getMeta(
          `viewport:${currentImage.id}`
        );

      viewer.addOnceHandler(
        "open",
        () => {
          if (sequence !== openSequence) {
            return;
          }

          els.emptyMessage.hidden = true;
          restoreViewportState = null;

          applyBrightness();
          drawAnnotations();
          updateDiagnostics();

          window.setTimeout(
            () => {
              prepareLocalFastOverview(
                session
              ).catch(() => {});
            },
            1800
          );
        }
      );

      viewer.open(
        buildLocalTiffViewerSource(
          session
        )
      );

      els.dimensions.textContent =
        `${currentInfo.width} × ${currentInfo.height}`;

      await cacheCurrentImageMetadata();

      updateControls();
      updateDiagnostics();

      const localState =
        await collectLocalImageState();

      renderImageOptions(
        currentImage.id,
        localState
      );

      els.imageSelect.value =
        currentImage.id;

    } catch (error) {
      if (sequence !== openSequence) {
        return;
      }

      els.emptyMessage.hidden = false;
      els.emptyMessage.textContent =
        error.message;

      setStatus(
        `Could not open local TIFF: ${error.message}`,
        "error"
      );

      throw error;
    }
  }

  function nativeServerHttpPlugin() {
    if (!IS_NATIVE) return null;
    return window.Capacitor?.Plugins?.ServerHttp || null;
  }

  function normalizeRequestUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return raw;

    try {
      const absolute = new URL(raw, window.location.href);

      if (
        absolute.protocol === "http:"
        || absolute.protocol === "https:"
      ) {
        absolute.pathname =
          absolute.pathname.replace(/\/{2,}/g, "/");

        if (/^https?:\/\//i.test(raw)) {
          return absolute.href;
        }

        return `${absolute.pathname}${absolute.search}${absolute.hash}`;
      }
    } catch (_) {
      // The transport will report malformed URLs.
    }

    return raw;
  }

  function requestHeadersObject(headers) {
    const output = {};

    if (!headers) return output;

    if (
      typeof Headers !== "undefined"
      && headers instanceof Headers
    ) {
      headers.forEach((value, key) => {
        output[key] = value;
      });
      return output;
    }

    if (Array.isArray(headers)) {
      for (const pair of headers) {
        if (Array.isArray(pair) && pair.length >= 2) {
          output[String(pair[0])] = String(pair[1]);
        }
      }
      return output;
    }

    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        output[key] = String(value);
      }
    }

    return output;
  }

  function base64ToBlob(base64, type = "") {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob(
      [bytes],
      { type: type || "application/octet-stream" }
    );
  }

  function nativeHeaders(headers = {}) {
    const lower = {};

    for (const [key, value] of Object.entries(headers || {})) {
      lower[String(key).toLowerCase()] = String(value);
    }

    return {
      get(name) {
        return lower[String(name || "").toLowerCase()] ?? null;
      },
      has(name) {
        return String(name || "").toLowerCase() in lower;
      },
      forEach(callback) {
        for (const [key, value] of Object.entries(lower)) {
          callback(value, key);
        }
      },
    };
  }

  function nativeResponse(result) {
    const headers = nativeHeaders(result?.headers || {});
    const contentType =
      result?.contentType
      || headers.get("content-type")
      || "";

    async function responseText() {
      if (typeof result?.body === "string") {
        return result.body;
      }

      if (result?.bodyBase64) {
        return await base64ToBlob(
          result.bodyBase64,
          contentType
        ).text();
      }

      return "";
    }

    return {
      ok:
        Number(result?.status || 0) >= 200
        && Number(result?.status || 0) < 300,
      status: Number(result?.status || 0),
      statusText: String(result?.statusText || ""),
      url: String(result?.url || ""),
      headers,
      async text() {
        return responseText();
      },
      async json() {
        const text = await responseText();
        return text ? JSON.parse(text) : null;
      },
      async blob() {
        if (result?.bodyBase64) {
          return base64ToBlob(
            result.bodyBase64,
            contentType
          );
        }

        return new Blob(
          [String(result?.body || "")],
          { type: contentType || "text/plain;charset=utf-8" }
        );
      },
    };
  }

  function canUseNativeServerHttp(url, options = {}) {
    if (!IS_NATIVE) return false;

    const plugin = nativeServerHttpPlugin();
    if (!plugin?.request) return false;

    let parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch (_) {
      return false;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    if (parsed.origin === window.location.origin) {
      return false;
    }

    const body = options?.body;

    return (
      body === undefined
      || body === null
      || typeof body === "string"
      || body instanceof URLSearchParams
    );
  }

  async function nativeServerRequest(
    url,
    options = {},
    timeoutMs = 12000
  ) {
    const plugin = nativeServerHttpPlugin();

    if (!plugin?.request) {
      throw new Error(
        "Android native server transport is unavailable"
      );
    }

    if (options?.signal?.aborted) {
      const aborted = new Error("Request aborted");
      aborted.name = "AbortError";
      throw aborted;
    }

    const body =
      options?.body instanceof URLSearchParams
        ? options.body.toString()
        : (
            typeof options?.body === "string"
              ? options.body
              : undefined
          );

    const request = plugin.request({
      url,
      method: String(options?.method || "GET").toUpperCase(),
      headers: requestHeadersObject(options?.headers),
      body,
      connectTimeout: Math.max(
        1000,
        Math.round(Number(timeoutMs) || 12000)
      ),
      readTimeout: Math.max(
        1000,
        Math.round(Number(timeoutMs) || 12000)
      ),
    });

    if (!options?.signal) {
      return nativeResponse(await request);
    }

    const abort = new Promise((_, reject) => {
      options.signal.addEventListener(
        "abort",
        () => {
          const error = new Error("Request aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true }
      );
    });

    return nativeResponse(
      await Promise.race([request, abort])
    );
  }

  async function serverRequest(url, options = {}) {
    const {
      timeoutMs = 12000,
      ...requestOptions
    } = options || {};

    const normalizedUrl =
      normalizeRequestUrl(url);

    if (
      canUseNativeServerHttp(
        normalizedUrl,
        requestOptions
      )
    ) {
      return nativeServerRequest(
        normalizedUrl,
        requestOptions,
        timeoutMs
      );
    }

    let timeoutId = null;
    let controller = null;

    const fetchOptions = {
      cache: "no-store",
      credentials: "same-origin",
      ...requestOptions,
    };

    if (
      !fetchOptions.signal
      && typeof AbortController !== "undefined"
      && Number(timeoutMs) > 0
    ) {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;

      timeoutId = setTimeout(
        () => controller.abort(),
        Number(timeoutMs)
      );
    }

    try {
      return await fetch(
        normalizedUrl,
        fetchOptions
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(
          `Request timed out after ${
            Math.max(
              1,
              Math.round(Number(timeoutMs) / 1000)
            )
          }s`
        );
      }

      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function apiFetch(url, options = {}) {
    const response =
      await serverRequest(
        url,
        options
      );

    if (!response.ok) {
      let detail =
        `${response.status} ${response.statusText}`.trim();

      try {
        const payload = await response.json();
        detail = payload?.detail || detail;
      } catch (_) {
        // Response is not JSON.
      }

      throw new Error(
        detail || `HTTP ${response.status}`
      );
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
  function currentDocumentKey() {
    if (!currentImage) return "";
    return localDraftKey(currentImage.id, currentAnnotationFile);
  }
  function restoreCurrentRevisionState(record) {
    const localRevision = Math.max(
      0,
      Number(
        record?.localRevision
        || (record?.pending ? record?.updatedAt : 0)
        || 0
      )
    );
    const syncedRevision = Math.max(
      0,
      Number(record?.lastSyncedRevision ?? (record?.pending ? 0 : localRevision))
    );
    currentLocalRevision = Math.max(localRevision, syncedRevision);
    currentLastSyncedRevision = Math.min(currentLocalRevision, syncedRevision);
    currentPendingChangeCount = Math.max(
      0,
      Number(record?.pendingChangeCount ?? (record?.pending ? 1 : 0))
    );
  }
  function nextLocalRevision() {
    currentLocalRevision = Math.max(currentLocalRevision + 1, Date.now());
    return currentLocalRevision;
  }
  function currentSyncPending() {
    return Boolean(
      currentImage
      && !currentImage.localNative
      && currentLocalRevision > currentLastSyncedRevision
    );
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
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readwrite");
        const store = transaction.objectStore(DB_STORE);
        const request = store.get(record.imageId);
        request.onsuccess = () => {
          const existing = request.result || null;
          const existingRevision = Math.max(0, Number(existing?.localRevision || 0));
          const incomingRevision = Math.max(0, Number(record?.localRevision || 0));

          if (existing && existingRevision > incomingRevision) {
            // A newer durable snapshot already exists. Treat this older write
            // as safely superseded rather than as a persistence failure.
            return;
          }

          store.put(record);
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch (error) {
      console.warn("Could not save the local draft", error);
      return false;
    }
  }
  async function persistLocalDraft(
    pending = true,
    image = currentImage,
    payload = featureCollection,
    options = {}
  ) {
    if (!image) return false;

    const annotationFile = options.annotationFile ?? currentAnnotationFile;
    const isCurrentDocument =
      image.id === currentImage?.id
      && annotationFile === currentAnnotationFile;
    const localRevision = Math.max(
      0,
      Number(options.localRevision ?? (isCurrentDocument ? currentLocalRevision : 0))
    );
    const lastSyncedRevision = Math.max(
      0,
      Number(
        options.lastSyncedRevision
        ?? (isCurrentDocument ? currentLastSyncedRevision : (pending ? 0 : localRevision))
      )
    );
    const effectivePending = image.localNative ? false : Boolean(pending);
    const pendingChangeCount = effectivePending
      ? Math.max(
          0,
          Number(
            options.pendingChangeCount
            ?? (isCurrentDocument ? currentPendingChangeCount : 1)
          )
        )
      : 0;

    const record = {
      imageId: localDraftKey(image.id, annotationFile),
      sourceImageId: image.id,
      annotationFile,
      imageName: image.name,
      relativePath: image.relativePath,
      localNative: Boolean(image.localNative),
      featureCollection: deepClone(payload),
      pending: effectivePending,
      pendingChangeCount,
      localRevision,
      lastSyncedRevision,
      updatedAt: Date.now(),
    };

    const saved = await putLocalDraft(record);
    if (saved && isCurrentDocument && localRevision >= currentLocalRevision) {
      if (image.localNative) {
        currentPendingChangeCount = 0;
        localDraftState = "Saved locally";
      } else if (effectivePending) {
        localDraftState = "Saved locally · sync pending";
      } else {
        localDraftState = "Synced";
      }
      updateDiagnostics();
    }
    return saved;
  }

  async function applyAnnotationSyncResult(job, normalizedPayload) {
    try {
      const db = await openDraftDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readwrite");
        const store = transaction.objectStore(DB_STORE);
        const request = store.get(job.draftKey);

        request.onsuccess = () => {
          const existing = request.result || {
            imageId: job.draftKey,
            sourceImageId: job.image.id,
            annotationFile: job.annotationFile,
            imageName: job.image.name,
            relativePath: job.image.relativePath,
            localNative: false,
            featureCollection: deepClone(job.payload),
            pending: true,
            pendingChangeCount: 1,
            localRevision: job.revision,
            lastSyncedRevision: 0,
            updatedAt: Date.now(),
          };

          const existingRevision = Math.max(0, Number(existing.localRevision || 0));
          existing.lastSyncedRevision = Math.max(
            Number(existing.lastSyncedRevision || 0),
            job.revision
          );

          if (existingRevision <= job.revision) {
            existing.localRevision = job.revision;
            existing.featureCollection = deepClone(normalizedPayload);
            existing.pending = false;
            existing.pendingChangeCount = 0;
          } else {
            // A newer local state already exists. Keep it intact and only
            // record how far the server has caught up.
            existing.pending = true;
          }

          existing.updatedAt = Date.now();
          store.put(existing);
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch (error) {
      console.warn("Could not update local sync state", error);
      return false;
    }
  }

  async function syncAnnotationSnapshot(job, showConfirmation = false) {
    const key = job.draftKey;
    annotationSyncInFlight.add(key);

    if (currentDocumentKey() === key) {
      localDraftState = "Syncing…";
      updateDiagnostics();
    }

    try {
      const response = await apiFetch(
        `${API}/annotations/${job.image.id}?file=${encodeURIComponent(job.annotationFile)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job.payload),
        }
      );
      const result = await response.json();
      const normalizedPayload =
        result?.featureCollection?.type === "FeatureCollection"
          ? normalizeFeatureCollectionClient(result.featureCollection)
          : job.payload;

      await applyAnnotationSyncResult(job, normalizedPayload);

      if (currentDocumentKey() === key) {
        currentLastSyncedRevision = Math.max(currentLastSyncedRevision, job.revision);

        if (currentLocalRevision === job.revision) {
          // Only the newest revision may replace the live document.
          featureCollection = normalizedPayload;
          featureCollection.features.forEach(featureId);
          dirty = false;
          currentPendingChangeCount = 0;
          localDraftState = "Synced";
        } else {
          // The user edited while this request was in flight.
          dirty = true;
          localDraftState = "Saved locally · sync pending";
        }

        updateControls();
        updateDiagnostics();

        const repaired = Number(result?.report?.repaired || 0);
        if (showConfirmation && currentLocalRevision === job.revision) {
          setStatus(
            `Saved to server: ${result.features} annotations${repaired ? ` · ${repaired} geometry repaired` : ""}`,
            "saved"
          );
        }
      }

      return { synced: true, revision: job.revision };
    } finally {
      annotationSyncInFlight.delete(key);
      if (currentDocumentKey() === key) updateDiagnostics();
    }
  }

  function enqueueAnnotationSync(job, showConfirmation = false) {
    const key = job.draftKey;
    const revision = Math.max(0, Number(job.revision || 0));
    const previousHighest = Math.max(
      0,
      Number(annotationLatestQueuedRevision.get(key) || 0)
    );

    annotationLatestQueuedRevision.set(
      key,
      Math.max(previousHighest, revision)
    );

    const previous = annotationSyncChains.get(key) || Promise.resolve();

    const run = previous
      .catch(() => undefined)
      .then(() => {
        const latestQueued = Math.max(
          0,
          Number(annotationLatestQueuedRevision.get(key) || 0)
        );

        if (revision < latestQueued) {
          return {
            synced: false,
            skipped: true,
            revision,
            supersededBy: latestQueued,
          };
        }

        return syncAnnotationSnapshot(job, showConfirmation);
      });

    let tracked;
    tracked = run.finally(() => {
      if (annotationSyncChains.get(key) === tracked) {
        annotationSyncChains.delete(key);
        annotationLatestQueuedRevision.delete(key);
      }
    });

    annotationSyncChains.set(key, tracked);
    return tracked;
  }
  function scheduleLocalDraft() {
    if (!currentImage) return;
    const image = currentImage;
    const annotationFile = currentAnnotationFile;
    const payload = deepClone(featureCollection);
    const revision = currentLocalRevision;
    void persistLocalDraft(
      true,
      image,
      payload,
      {
        annotationFile,
        localRevision: revision,
        lastSyncedRevision: currentLastSyncedRevision,
      }
    );
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
    const request =
      new Request(
        url,
        {
          credentials: "same-origin",
          cache: "no-store",
        }
      );

    const existing =
      await cache.match(request);

    if (existing) {
      return "cached";
    }

    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : null;

    const timeoutId =
      controller
        ? setTimeout(
            () => controller.abort(),
            timeoutMs
          )
        : null;

    try {
      const response =
        await serverRequest(
          url,
          {
            timeoutMs,
            cache: "no-store",
            credentials: "same-origin",
            ...(controller
              ? { signal: controller.signal }
              : {}),
          }
        );

      if (!response.ok) {
        let detail =
          `${response.status} ${response.statusText}`.trim();

        try {
          const payload =
            await response.json();

          detail =
            payload?.detail
            || detail;
        } catch (_) {}

        throw new Error(detail);
      }

      const blob =
        await response.blob();

      if (!blob.size) {
        throw new Error(
          "Empty offline response"
        );
      }

      const cacheResponse =
        new Response(
          blob,
          {
            status: 200,
            headers: {
              "Content-Type":
                response.headers?.get?.("content-type")
                || blob.type
                || "application/octet-stream",
            },
          }
        );

      await cache.put(
        request,
        cacheResponse
      );

      return "downloaded";

    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(
          "Tile download timed out"
        );
      }

      throw error;

    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
      const isNativeLocal = Boolean(image.localNative);
      if (isNativeLocal) {
        const nativeState = image.accessible
          ? (image.seekable ? "Local device • random access" : "Local device • sequential access")
          : "Local device • access unavailable";
        option.textContent = `${image.relativePath || image.name} (${formatBytes(Number(image.sizeBytes))}) • ${nativeState}`;
        option.disabled = !image.accessible || !isNativeLocalTiff(image);
        els.imageSelect.append(option);
        continue;
      }
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
    if (IS_NATIVE && !API) {
      if (showToast) {
        setStatus(
          "No server configured; pending annotations remain on this device",
          "local"
        );
      }
      return { synced: 0, failed: 0 };
    }
    if (!navigator.onLine) {
      if (showToast) {
        setStatus(
          "Offline: synchronization will resume when a connection is available",
          "local"
        );
      }
      return { synced: 0, failed: 0 };
    }

    const drafts = (await idbGetAll(DB_STORE)).filter(
      (record) =>
        record?.pending
        && !record?.localNative
        && record?.sourceImageId
        && record?.featureCollection
    );

    let synced = 0;
    let failed = 0;

    for (const record of drafts) {
      const revision = Math.max(
        1,
        Number(record.localRevision || record.updatedAt || Date.now())
      );
      const annotationFile = record.annotationFile || "Default";
      const job = {
        draftKey: localDraftKey(record.sourceImageId, annotationFile),
        image: {
          id: record.sourceImageId,
          name: record.imageName || record.sourceImageId,
          relativePath: record.relativePath || "",
          localNative: false,
        },
        annotationFile,
        payload: deepClone(record.featureCollection),
        revision,
      };

      try {
        const result = await enqueueAnnotationSync(job, false);
        if (result?.synced) synced += 1;
      } catch (_) {
        failed += 1;
      }
    }

    const localClasses = readLocalClasses();
    if (localClasses?.pending) await syncClassesToServer();

    if (showToast) {
      setStatus(
        failed
          ? `${synced} annotation files synced · ${failed} still pending`
          : `${synced} pending annotation files synchronized`,
        failed ? "local" : "saved"
      );
    }
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
      .register(`${BASE || ""}/service-worker.js?v=${VERSION}`, { scope: `${BASE || ""}/`, updateViaCache: "none" })
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

    if (IS_NATIVE && !API) {
      setStatus("Classes saved locally · no server configured", "local");
      return;
    }

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

    if (IS_NATIVE && !API) {
      if (!local) {
        classes = deepClone(DEFAULT_CLASSES);
        currentClass = classes[0];
        renderClassButtons();
      }
      return;
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
    // Phase D4 guard openClassEditor
    if (
      index !== null
      && index !== undefined
      && phaseDIsArtifactClassName(
        classes[index]?.name
      )
    ) {
      setStatus(
        "Artifact is a built-in class and cannot be renamed or recolored",
        "local"
      );
      return;
    }

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
    // Phase D4 reserved Artifact name
    if (
      phaseDIsArtifactClassName(name)
      && (
        classEditIndex === null
        || classEditIndex === undefined
        || !phaseDIsArtifactClassName(
          classes[classEditIndex]?.name
        )
      )
    ) {
      setStatus(
        "Artifact is a reserved built-in class",
        "error"
      );
      return;
    }

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
      if (reviewState.active && reviewPendingNewClassAssignment) {
        reviewPendingNewClassAssignment = false;
        assignReviewFeatureClass(currentClass.name);
      }
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
    // Phase D4 guard deleteClass
    if (
      index !== null
      && index !== undefined
      && phaseDIsArtifactClassName(
        classes[index]?.name
      )
    ) {
      setStatus(
        "Artifact is a built-in class and cannot be removed",
        "local"
      );
      return;
    }

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
    // Phase D4 reserved Artifact class
    phaseDEnsureArtifactClassList(classes);
    els.classList.innerHTML = "";
    for (const [index, item] of classes.entries()) {
      const row = document.createElement("div");
      row.className = "class-row";

      const reservedArtifactClass =
        phaseDIsArtifactClassName(item.name);

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
        const selectedSpecial =
          selectedFeatures().some(
            (feature) =>
              !phaseDIsAnnotationFeature(
                feature
              )
          );

        if (selectedSpecial) {
          clearSelectedFeatures(false);
        }

        if (phaseDActiveRole !== "annotation") {
          phaseDSetActiveRole(
            "annotation",
            false
          );
        }

        const previousClassName = currentClass?.name || "";
        const changingClass = item.name !== previousClassName;
        const implicitOnly =
          selectedIds.size === 1
          && selectedId
          && implicitSelectionId === selectedId;

        currentClass = item;

        if (implicitOnly) {
          // Keep the newest annotation selected while the class is unchanged
          // for rapid Shift + Add/Subtract. Choosing another class prepares
          // the next annotation and must not reclassify the one just drawn.
          if (changingClass) clearSelectedFeatures(false);
        } else if (selectedIds.size) {
          // Explicit selection: choosing a class intentionally reclassifies it.
          pushUndo();
          for (const feature of selectedFeatures()) {
            feature.properties = feature.properties || {};
            feature.properties.classification = { name: item.name, color: hexToRgbArray(item.color) };
          }
          markChanged();
        }

        renderClassButtons();
        updateControls();
        drawAnnotations();
      });

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "class-edit management-only";
      edit.textContent = "✎";
      edit.title =
        reservedArtifactClass
          ? "Artifact is a built-in class"
          : `Edit ${item.name}`;
      edit.hidden = reservedArtifactClass;
      edit.disabled = reservedArtifactClass;
      edit.addEventListener("click", () => openClassEditor(index));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "class-delete management-only";
      remove.textContent = "×";
      remove.title =
        reservedArtifactClass
          ? "Artifact is a built-in class"
          : `Delete ${item.name}`;
      remove.hidden = reservedArtifactClass;
      remove.disabled = reservedArtifactClass;
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
      maxZoomPixelRatio: 4.0,
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
        updateScaleBar();
        updateCalibrationBadge();
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
    implicitSelectionId = null;
    if (redraw) {
      updateControls();
      drawAnnotations();
    }
  }

  function setSingleSelection(id, implicit = false) {
    // Phase D3.3.1 structural single-selection lock
    if (
      id
      && phaseDActiveRole !== "roi"
    ) {
      const candidate =
        findFeature(id);

      if (
        candidate
        && !phaseDIsAnnotationFeature(
          candidate
        )
      ) {
        id = null;
      }
    }

    // Phase D3.1 protected single selection
    if (
      id
      && phaseDActiveRole !== "roi"
    ) {
      const candidate =
        findFeature(id);

      if (
        candidate
        && !phaseDIsAnnotationFeature(
          candidate
        )
      ) {
        return;
      }
    }

    selectedIds.clear();
    selectedId = id ? String(id) : null;
    if (selectedId) selectedIds.add(selectedId);
    implicitSelectionId = implicit && selectedId ? selectedId : null;
  }

  function setMultiSelection(ids, primary = null) {
    // Phase D3.3.1 structural multi-selection lock
    if (
      phaseDActiveRole !== "roi"
      && Array.isArray(ids)
    ) {
      ids =
        ids.filter(
          (candidateId) => {
            const candidate =
              findFeature(candidateId);

            return (
              !candidate
              || phaseDIsAnnotationFeature(
                candidate
              )
            );
          }
        );
    }

    // Phase D3.1 protected multi-selection
    if (
      phaseDActiveRole !== "roi"
      && Array.isArray(ids)
    ) {
      ids =
        ids.filter(
          (id) => {
            const candidate =
              findFeature(id);

            return (
              !candidate
              || phaseDIsAnnotationFeature(
                candidate
              )
            );
          }
        );
    }

    selectedIds = new Set((ids || []).map(String));
    implicitSelectionId = null;
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

  // ==========================================================
  // Scientific multichannel fluorescence display
  // ==========================================================

  let ifChannelSettings = null;
  let ifChannelSettingsImageId = null;
  let selectedIfChannel = 0;
  let ifRefreshTimer = null;

  function scientificIfMeta() {
    const meta = currentInfo?.multichannel;

    if (
      imageType !== "fluorescence" ||
      !meta?.scientificMultichannel ||
      !Array.isArray(meta.channels) ||
      !meta.channels.length
    ) {
      return null;
    }

    return meta;
  }

  function ifDisplayStorageKey() {
    if (!currentImage?.id) return null;
    return `histoannotator.ifDisplay.v1:${currentImage.id}`;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return Number(fallback);
    }

    return Math.max(
      Number(minimum),
      Math.min(Number(maximum), number),
    );
  }

  function compactDisplayNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    if (Math.abs(number - Math.round(number)) < 1e-6) {
      return String(Math.round(number));
    }

    return String(
      Number(number.toFixed(4))
    );
  }

  function defaultScientificChannel(metaChannel, index) {
    const allowedMin = Number.isFinite(Number(metaChannel?.allowedMin))
      ? Number(metaChannel.allowedMin)
      : 0;

    const allowedMax = Number.isFinite(Number(metaChannel?.allowedMax))
      ? Number(metaChannel.allowedMax)
      : 65535;

    const autoMin = Number.isFinite(Number(metaChannel?.minDisplay))
      ? Number(metaChannel.minDisplay)
      : allowedMin;

    const autoMax = Number.isFinite(Number(metaChannel?.maxDisplay))
      ? Number(metaChannel.maxDisplay)
      : allowedMax;

    const defaultColor =
      String(metaChannel?.color || "#ffffff");

    const defaultName =
      String(
        metaChannel?.name ||
        `Channel ${index + 1}`
      );

    return {
      index,
      name: defaultName,
      defaultName,
      visible: metaChannel?.visible !== false,
      color: defaultColor,
      defaultColor,
      min: autoMin,
      max: autoMax,
      autoMin,
      autoMax,
      allowedMin,
      allowedMax,
      gamma: Number(metaChannel?.gamma) || 1,
      brightness:
        Number(metaChannel?.brightness) || 100,
    };
  }

  function ensureIfChannelSettings() {
    const meta = scientificIfMeta();

    if (!meta || !currentImage?.id) {
      return null;
    }

    const imageId = currentImage.id;

    if (
      ifChannelSettings &&
      ifChannelSettingsImageId === imageId &&
      Array.isArray(ifChannelSettings.channels) &&
      ifChannelSettings.channels.length === meta.channels.length
    ) {
      return ifChannelSettings;
    }

    const channels = meta.channels.map(
      (channel, index) =>
        defaultScientificChannel(channel, index)
    );

    let selected = 0;

    const key = ifDisplayStorageKey();

    if (key) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(key) || "null"
        );

        if (
          saved &&
          Array.isArray(saved.channels) &&
          saved.channels.length === channels.length
        ) {
          channels.forEach((channel, index) => {
            const incoming = saved.channels[index];

            if (!incoming || typeof incoming !== "object") {
              return;
            }

            if (
              typeof incoming.name === "string" &&
              incoming.name.trim()
            ) {
              channel.name = incoming.name.trim();
            }

            if (typeof incoming.visible === "boolean") {
              channel.visible = incoming.visible;
            }

            if (
              typeof incoming.color === "string" &&
              /^#[0-9a-fA-F]{6}$/.test(incoming.color)
            ) {
              channel.color = incoming.color.toLowerCase();
            }

            channel.min = clampNumber(
              incoming.min,
              channel.allowedMin,
              channel.allowedMax,
              channel.min,
            );

            channel.max = clampNumber(
              incoming.max,
              channel.allowedMin,
              channel.allowedMax,
              channel.max,
            );

            if (channel.max <= channel.min) {
              channel.min = channel.autoMin;
              channel.max = channel.autoMax;
            }

            channel.gamma = clampNumber(
              incoming.gamma,
              0.05,
              20,
              channel.gamma,
            );

            channel.brightness = clampNumber(
              incoming.brightness,
              0,
              400,
              channel.brightness,
            );
          });

          selected = clampNumber(
            saved.selected,
            0,
            channels.length - 1,
            0,
          );
        }
      } catch (_) {
        // Use metadata defaults.
      }
    }

    ifChannelSettings = {
      channels,
    };

    ifChannelSettingsImageId = imageId;
    selectedIfChannel = Math.round(selected);

    return ifChannelSettings;
  }

  function saveIfDisplaySettings() {
    const settings = ensureIfChannelSettings();
    const key = ifDisplayStorageKey();

    if (!settings || !key) return;

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          selected: selectedIfChannel,
          channels: settings.channels.map(
            (channel) => ({
              name: channel.name,
              visible: channel.visible,
              color: channel.color,
              min: channel.min,
              max: channel.max,
              gamma: channel.gamma,
              brightness: channel.brightness,
            })
          ),
        })
      );
    } catch (error) {
      console.warn(
        "Could not persist IF display settings",
        error
      );
    }
  }

  function scheduleIfDisplayRefresh(delay = 140) {
    saveIfDisplaySettings();

    if (ifRefreshTimer) {
      clearTimeout(ifRefreshTimer);
    }

    ifRefreshTimer = setTimeout(() => {
      ifRefreshTimer = null;
      refreshImageDisplay();
    }, delay);
  }

  function loadDisplaySettings() {
    imageType = "he";
    brightnessPercent = 100;

    ifChannelSettings = null;
    ifChannelSettingsImageId = null;
    selectedIfChannel = 0;

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
    if (scientificIfMeta()) {
      return { view: "ifmultichannel" };
    }

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

    const ifMeta = scientificIfMeta();
    const ifSettings = ifMeta
      ? ensureIfChannelSettings()
      : null;

    if (ifMeta && ifSettings) {
      const channels = ifSettings.channels;

      params.set(
        "if_enabled",
        channels
          .map((channel) =>
            channel.visible ? "1" : "0"
          )
          .join("")
      );

      params.set(
        "if_min",
        channels
          .map((channel) =>
            compactDisplayNumber(channel.min)
          )
          .join(",")
      );

      params.set(
        "if_max",
        channels
          .map((channel) =>
            compactDisplayNumber(channel.max)
          )
          .join(",")
      );

      params.set(
        "if_gamma",
        channels
          .map((channel) =>
            compactDisplayNumber(channel.gamma)
          )
          .join(",")
      );

      params.set(
        "if_brightness",
        channels
          .map((channel) =>
            compactDisplayNumber(
              channel.brightness
            )
          )
          .join(",")
      );

      params.set(
        "if_colors",
        channels
          .map((channel) =>
            channel.color.replace("#", "")
          )
          .join(",")
      );

    } else if (display.rgb) {
      params.set("rgb", display.rgb);
    }

    if (currentImage?.modifiedUnix) {
      params.set(
        "rev",
        String(currentImage.modifiedUnix)
      );
    }

    return params.toString();
  }

  function renderChannelControls() {
    if (!els.stainChannelControls) return;

    els.stainChannelControls.innerHTML = "";

    const meta = scientificIfMeta();
    const settings = meta
      ? ensureIfChannelSettings()
      : null;

    els.displayPanel?.classList.toggle(
      "scientific-if",
      Boolean(meta && settings)
    );

    // --------------------------------------------------------
    // Scientific multichannel fluorescence
    // --------------------------------------------------------
    if (meta && settings) {
      const channels = settings.channels;

      selectedIfChannel = Math.max(
        0,
        Math.min(
          channels.length - 1,
          Number(selectedIfChannel) || 0
        )
      );

      const heading =
        document.createElement("div");

      heading.className = "if-display-heading";

      const title =
        document.createElement("strong");

      title.textContent =
        `Fluorescence channels (${channels.length})`;

      const detail =
        document.createElement("span");

      detail.textContent =
        `${meta.dtype || "raw"} · ` +
        `${meta.axes || "channels"}`;

      heading.append(title, detail);
      els.stainChannelControls.append(heading);

      const list =
        document.createElement("div");

      list.className = "if-channel-list";

      channels.forEach((channel, index) => {
        const row =
          document.createElement("div");

        row.className =
          "if-channel-row";

        if (index === selectedIfChannel) {
          row.classList.add("selected");
        }

        const visible =
          document.createElement("input");

        visible.type = "checkbox";
        visible.checked =
          Boolean(channel.visible);

        visible.title =
          `Show ${channel.name}`;

        visible.setAttribute(
          "aria-label",
          `Show ${channel.name}`
        );

        visible.addEventListener(
          "change",
          () => {
            channel.visible =
              visible.checked;

            scheduleIfDisplayRefresh();
            renderChannelControls();
          }
        );

        const select =
          document.createElement("button");

        select.type = "button";
        select.className =
          "if-channel-select";

        const dot =
          document.createElement("span");

        dot.className = "channel-dot";
        dot.style.background =
          channel.color;

        const label =
          document.createElement("span");

        label.textContent =
          channel.name;

        select.append(dot, label);

        select.addEventListener(
          "click",
          () => {
            selectedIfChannel = index;
            saveIfDisplaySettings();
            renderChannelControls();
          }
        );

        const color =
          document.createElement("input");

        color.type = "color";
        color.className =
          "if-channel-color";

        color.value =
          channel.color;

        color.title =
          `Color for ${channel.name}`;

        color.setAttribute(
          "aria-label",
          `Color for ${channel.name}`
        );

        color.addEventListener(
          "input",
          () => {
            channel.color =
              color.value.toLowerCase();

            dot.style.background =
              channel.color;

            scheduleIfDisplayRefresh();
          }
        );

        row.append(
          visible,
          select,
          color
        );

        list.append(row);
      });

      els.stainChannelControls.append(list);

      const channel =
        channels[selectedIfChannel];

      const editor =
        document.createElement("div");

      editor.className =
        "if-channel-editor";

      const editorTitle =
        document.createElement("div");

      editorTitle.className =
        "if-editor-title";

      editorTitle.textContent =
        `Channel ${selectedIfChannel + 1}`;

      editor.append(editorTitle);

      // Name
      const nameLabel =
        document.createElement("label");

      nameLabel.className =
        "if-field";

      const nameCaption =
        document.createElement("span");

      nameCaption.textContent = "Name";

      const nameInput =
        document.createElement("input");

      nameInput.type = "text";
      nameInput.value =
        channel.name;

      nameInput.maxLength = 48;

      nameInput.addEventListener(
        "change",
        () => {
          const value =
            nameInput.value.trim();

          channel.name =
            value ||
            channel.defaultName;

          saveIfDisplaySettings();
          renderChannelControls();
        }
      );

      nameLabel.append(
        nameCaption,
        nameInput
      );

      editor.append(nameLabel);

      // Min / Max
      const rangeGrid =
        document.createElement("div");

      rangeGrid.className =
        "if-range-grid";

      function numericField(
        caption,
        property
      ) {
        const label =
          document.createElement("label");

        label.className =
          "if-field";

        const span =
          document.createElement("span");

        span.textContent = caption;

        const input =
          document.createElement("input");

        input.type = "number";
        input.step = "1";
        input.min =
          compactDisplayNumber(
            channel.allowedMin
          );
        input.max =
          compactDisplayNumber(
            channel.allowedMax
          );
        input.value =
          compactDisplayNumber(
            channel[property]
          );

        input.addEventListener(
          "change",
          () => {
            const value =
              clampNumber(
                input.value,
                channel.allowedMin,
                channel.allowedMax,
                channel[property]
              );

            channel[property] = value;

            if (
              property === "min" &&
              channel.min >= channel.max
            ) {
              channel.min =
                Math.max(
                  channel.allowedMin,
                  channel.max - 1
                );
            }

            if (
              property === "max" &&
              channel.max <= channel.min
            ) {
              channel.max =
                Math.min(
                  channel.allowedMax,
                  channel.min + 1
                );
            }

            input.value =
              compactDisplayNumber(
                channel[property]
              );

            scheduleIfDisplayRefresh();
          }
        );

        label.append(span, input);
        return label;
      }

      rangeGrid.append(
        numericField("Min", "min"),
        numericField("Max", "max")
      );

      editor.append(rangeGrid);

      // Gamma
      const gammaLabel =
        document.createElement("label");

      gammaLabel.className =
        "if-slider-field";

      const gammaTop =
        document.createElement("span");

      gammaTop.textContent =
        "Gamma";

      const gammaValue =
        document.createElement("output");

      gammaValue.textContent =
        Number(channel.gamma)
          .toFixed(2);

      const gammaSlider =
        document.createElement("input");

      gammaSlider.type = "range";
      gammaSlider.min = "0.20";
      gammaSlider.max = "4.00";
      gammaSlider.step = "0.05";
      gammaSlider.value =
        String(channel.gamma);

      gammaSlider.addEventListener(
        "input",
        () => {
          channel.gamma =
            Number(gammaSlider.value);

          gammaValue.textContent =
            channel.gamma.toFixed(2);

          scheduleIfDisplayRefresh();
        }
      );

      const gammaHeader =
        document.createElement("span");

      gammaHeader.className =
        "if-slider-header";

      gammaHeader.append(
        gammaTop,
        gammaValue
      );

      gammaLabel.append(
        gammaHeader,
        gammaSlider
      );

      editor.append(gammaLabel);

      // Channel brightness
      const brightnessLabel =
        document.createElement("label");

      brightnessLabel.className =
        "if-slider-field";

      const brightnessTop =
        document.createElement("span");

      brightnessTop.textContent =
        "Channel brightness";

      const brightnessValue =
        document.createElement("output");

      brightnessValue.textContent =
        `${Math.round(channel.brightness)}%`;

      const brightnessSlider =
        document.createElement("input");

      brightnessSlider.type = "range";
      brightnessSlider.min = "0";
      brightnessSlider.max = "300";
      brightnessSlider.step = "5";
      brightnessSlider.value =
        String(channel.brightness);

      brightnessSlider.addEventListener(
        "input",
        () => {
          channel.brightness =
            Number(
              brightnessSlider.value
            );

          brightnessValue.textContent =
            `${Math.round(
              channel.brightness
            )}%`;

          scheduleIfDisplayRefresh();
        }
      );

      const brightnessHeader =
        document.createElement("span");

      brightnessHeader.className =
        "if-slider-header";

      brightnessHeader.append(
        brightnessTop,
        brightnessValue
      );

      brightnessLabel.append(
        brightnessHeader,
        brightnessSlider
      );

      editor.append(brightnessLabel);

      // Buttons
      const actions =
        document.createElement("div");

      actions.className =
        "if-editor-actions";

      const autoButton =
        document.createElement("button");

      autoButton.type = "button";
      autoButton.textContent = "Auto";

      autoButton.addEventListener(
        "click",
        () => {
          channel.min =
            channel.autoMin;

          channel.max =
            channel.autoMax;

          saveIfDisplaySettings();
          renderChannelControls();
          refreshImageDisplay();
        }
      );

      const resetButton =
        document.createElement("button");

      resetButton.type = "button";
      resetButton.textContent = "Reset";

      resetButton.addEventListener(
        "click",
        () => {
          channel.name =
            channel.defaultName;

          channel.visible = true;
          channel.color =
            channel.defaultColor;

          channel.min =
            channel.autoMin;

          channel.max =
            channel.autoMax;

          channel.gamma = 1;
          channel.brightness = 100;

          saveIfDisplaySettings();
          renderChannelControls();
          refreshImageDisplay();
        }
      );

      actions.append(
        autoButton,
        resetButton
      );

      editor.append(actions);

      els.stainChannelControls.append(
        editor
      );

      if (els.displayHint) {
        const assumption =
          meta.assumedChannelAxis
            ? " The leading TIFF axis is being interpreted as channels because this image is set to Fluorescence."
            : "";

        els.displayHint.textContent =
          "Scientific channel controls affect display only. Raw pixel values are unchanged." +
          assumption;
      }

      return;
    }

    // --------------------------------------------------------
    // Existing H&E / H-DAB / RGB display
    // --------------------------------------------------------
    let names;

    if (imageType === "he") {
      names = [
        [
          "hematoxylin",
          "Hematoxylin",
          "#6f5da8"
        ],
        [
          "eosin",
          "Eosin",
          "#ef8ea8"
        ],
      ];

    } else if (imageType === "hdab") {
      names = [
        [
          "hematoxylin",
          "Hematoxylin",
          "#6f5da8"
        ],
        [
          "dab",
          "DAB",
          "#9a6a3a"
        ],
      ];

    } else {
      names = [
        ["red", "Red", "#ff6b6b"],
        ["green", "Green", "#69db7c"],
        ["blue", "Blue", "#4dabf7"],
      ];
    }

    const state =
      displayChannels[imageType] ||
      displayChannels.rgb;

    for (
      const [key, label, color]
      of names
    ) {
      const button =
        document.createElement("button");

      button.type = "button";

      button.className =
        `channel-toggle ${
          state[key] ? "active" : ""
        }`;

      const dot =
        document.createElement("span");

      dot.className = "channel-dot";
      dot.style.background = color;

      const text =
        document.createElement("span");

      text.textContent = label;

      button.append(dot, text);

      button.addEventListener(
        "click",
        () => {
          state[key] = !state[key];

          saveDisplaySettings();
          renderChannelControls();
          refreshImageDisplay();
        }
      );

      els.stainChannelControls.append(
        button
      );
    }

    if (els.displayHint) {
      els.displayHint.textContent =
        imageType === "fluorescence"
          ? "This image is currently being displayed as RGB fluorescence."
          : "Stain views use color deconvolution for visualization only. Original pixels are never modified.";
    }
  }

  async function offlineTileResponse(url) {
    if (!("caches" in window)) return null;

    try {
      const cache = await caches.open(OFFLINE_CACHE);
      return await cache.match(url);
    } catch (error) {
      console.warn("Offline tile cache read failed", error);
      return null;
    }
  }

  function localFirstTileDownloadStart(context) {
    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : null;

    context.userData.histoAbortController = controller;

    (async () => {
      try {
        let response = await offlineTileResponse(context.src);
        let source = "local";

        if (!response) {
          source = IS_NATIVE ? "android-native" : "network";

          response = await serverRequest(context.src, {
            timeoutMs: 15000,
            cache: "no-store",
            credentials: "same-origin",
            ...(controller ? { signal: controller.signal } : {}),
          });
        }

        if (!response.ok) {
          let detail =
            `${response.status} ${response.statusText}`.trim();

          try {
            const payload = await response.json();
            detail =
              payload?.detail
              || detail;
          } catch (_) {
            // Non-JSON server error.
          }

          throw new Error(
            `${detail} · ${context.src}`
          );
        }

        const blob = await response.blob();

        if (!blob.size) {
          throw new Error("Empty tile response");
        }

        context.userData.histoTileSource = source;

        // OpenSeadragon knows how to convert rasterBlob to the
        // image representation required by the active drawer.
        context.finish(blob, null, "rasterBlob");

      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        const message =
          error?.message ||
          String(error) ||
          "Unknown tile error";

        context.fail(
          `Tile unavailable: ${message}`,
          null
        );
      }
    })();
  }

  function localFirstTileDownloadAbort(context) {
    try {
      context.userData?.histoAbortController?.abort();
    } catch (_) {
      // Best effort only.
    }
  }

  function buildViewerSource(imageId, info) {
    const display = activeDisplayView();

    // Direct-raster images still use their normal URL in alpha2.
    // The local-first path below covers the DeepZoom tiled images.
    if (
      info.directRaster &&
      display.view === "original" &&
      !(
        imageType === "fluorescence" &&
        info.multichannel?.scientificMultichannel
      )
    ) {
      if (!IS_NATIVE) {
        return {
          type: "image",
          url: `${API}/images/${imageId}/original`
        };
      }

      return {
        width: info.width,
        height: info.height,
        tileSize:
          Math.max(
            1,
            info.width,
            info.height
          ),
        tileOverlap: 0,
        minLevel: 0,
        maxLevel: 0,

        getTileUrl() {
          return `${API}/images/${imageId}/original`;
        },

        downloadTileStart:
          localFirstTileDownloadStart,

        downloadTileAbort:
          localFirstTileDownloadAbort,

        hasTransparency() {
          return false;
        },
      };
    }

    const query = displayQueryString();

    return {
      width: info.width,
      height: info.height,
      tileSize: info.tileSize,
      tileOverlap: info.tileOverlap,
      minLevel: 0,
      maxLevel: info.levelCount - 1,

      getTileUrl(level, x, y) {
        return `${API}/images/${imageId}/tiles/${level}/${x}_${y}.jpeg?${query}`;
      },

      // Android and Web can now read previously downloaded tiles
      // directly from CacheStorage without involving the server.
      downloadTileStart: localFirstTileDownloadStart,
      downloadTileAbort: localFirstTileDownloadAbort,

      hasTransparency() {
        return false;
      },
    };
  }

  async function refreshImageDisplay() {
    if (!currentImage || !currentInfo || !viewer) { applyBrightness(); return; }
    if (currentImage.localNative) {
      const session = localTiffSessions.get(currentImage.id);
      if (!session) return;
      const center = viewer.world.getItemCount() ? viewer.viewport.getCenter() : null;
      const zoom = viewer.world.getItemCount() ? viewer.viewport.getZoom() : null;
      viewer.addOnceHandler("open", () => {
        if (center && Number.isFinite(zoom)) {
          viewer.viewport.panTo(center, true);
          viewer.viewport.zoomTo(zoom, center, true);
        }
        applyBrightness();
        drawAnnotations();
      });
      configureLocalTiffViewer(true);
      viewer.open(buildLocalTiffViewerSource(session));
      return;
    }
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

    if (phaseDActiveRole === "roi") {
      const roi =
        phaseDTissueRoiFeature();

      if (!roi) {
        setStatus(
          `${operation === "add" ? "Add" : "Subtract"}: create the Tissue ROI first`,
          "error"
        );
        return false;
      }

      if (
        !selectedId
        || !phaseDIsTissueRoi(
          findFeature(selectedId)
        )
      ) {
        setSingleSelection(
          String(featureId(roi))
        );
      }
    }

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




  // ========================================================================
  // Phase D1-D3 — roles, manual Tissue ROI, and lightweight Detect tissue.
  // ========================================================================

  const PHASE_D_TISSUE_ROI_COLOR =
    "#22c7ad";

  const PHASE_D_ARTIFACT_NAME =
    "Artifact";

  const PHASE_D_ARTIFACT_COLOR =
    "#69db7c";

  function phaseDIsArtifactClassName(value) {
    return (
      String(value || "")
        .trim()
        .toLowerCase()
      === PHASE_D_ARTIFACT_NAME.toLowerCase()
    );
  }

  function phaseDEnsureArtifactClassList(items = classes) {
    if (!Array.isArray(items)) return items;

    let artifact = null;

    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];

      if (!phaseDIsArtifactClassName(item?.name)) {
        continue;
      }

      if (!artifact) {
        artifact = item;
        artifact.name =
          PHASE_D_ARTIFACT_NAME;
        artifact.color =
          PHASE_D_ARTIFACT_COLOR;
      } else {
        items.splice(index, 1);
      }
    }

    if (!artifact) {
      items.push({
        name: PHASE_D_ARTIFACT_NAME,
        color: PHASE_D_ARTIFACT_COLOR,
      });
    }

    return items;
  }

  function phaseDSyncArtifactRole(feature) {
    if (!feature) return false;

    feature.properties ||= {};

    let histo =
      feature.properties.histoannotator;

    if (
      !histo
      || typeof histo !== "object"
    ) {
      histo =
        phaseCCreateMetadata();

      feature.properties.histoannotator =
        histo;
    }

    const currentRole =
      phaseDCanonicalRole(
        histo.role
      );

    if (currentRole === "roi") {
      histo.role = "roi";
      return false;
    }

    const desiredRole =
      phaseDIsArtifactClassName(
        feature.properties
          ?.classification
          ?.name
      )
        ? "artifact"
        : "annotation";

    const changed =
      currentRole !== desiredRole
      || histo.role !== desiredRole;

    histo.role = desiredRole;
    return changed;
  }

  function phaseDSyncArtifactRoles() {
    let changed = false;

    for (
      const feature
      of featureCollection.features || []
    ) {
      if (phaseDSyncArtifactRole(feature)) {
        changed = true;
      }
    }

    return changed;
  }


  let phaseDActiveRole =
    "annotation";

  let phaseDDetectBusy =
    false;

  // Phase D7 — temporary server-derived preview of remaining Valid Tissue.
  let phaseDFillUnannotatedPreview = null;
  let phaseDFillUnannotatedBusy = false;


  function phaseDCanonicalRole(value) {
    const role =
      String(value || "annotation")
        .trim()
        .toLowerCase();

    return [
      "annotation",
      "roi",
      "artifact",
    ].includes(role)
      ? role
      : "annotation";
  }

  function phaseDFeatureRole(feature) {
    return phaseDCanonicalRole(
      feature?.properties
        ?.histoannotator
        ?.role
      || "annotation"
    );
  }

  function phaseDIsAnnotationFeature(feature) {
    return [
      "annotation",
      "artifact",
    ].includes(
      phaseDFeatureRole(feature)
    );
  }

  function phaseDIsTissueRoi(feature) {
    return (
      phaseDFeatureRole(feature) === "roi"
      && String(
        feature?.properties
          ?.histoannotator
          ?.roi
          ?.kind
        || "tissue"
      ).toLowerCase() === "tissue"
    );
  }

  function phaseDTissueRoiFeature() {
    return (
      featureCollection.features
      || []
    ).find(
      phaseDIsTissueRoi
    ) || null;
  }


  function phaseDHitTestNormalAnnotation(point) {
    if (phaseDActiveRole === "roi") {
      return hitTest(point);
    }

    const allFeatures =
      featureCollection.features;

    featureCollection.features =
      allFeatures.filter(
        phaseDIsAnnotationFeature
      );

    try {
      return hitTest(point);
    } finally {
      featureCollection.features =
        allFeatures;
    }
  }

  function phaseDCreateTissueRoiFeature(
    geometry,
    source = "manual",
    detector = null
  ) {
    const feature = {
      type: "Feature",
      id: uid(),
      geometry:
        deepClone(geometry),
      properties: {
        objectType: "annotation",
        classification: {
          name: "Tissue ROI",
          color:
            hexToRgbArray(
              PHASE_D_TISSUE_ROI_COLOR
            ),
        },
        isLocked: false,
        histoannotator:
          phaseCCreateMetadata(
            "roi"
          ),
      },
    };

    feature.properties
      .histoannotator.roi = {
        kind: "tissue",
        source:
          String(source || "manual"),
      };

    if (
      detector
      && typeof detector === "object"
    ) {
      feature.properties
        .histoannotator.roi.detector =
          deepClone(detector);
    }

    return feature;
  }


  let phaseDEffectiveRoiPreview =
    null;

  let phaseDBorderPreviewTimer =
    null;

  let phaseDBorderPreviewSequence =
    0;

  function phaseDBorderConfigForRoi(
    roi = phaseDTissueRoiFeature()
  ) {
    const config =
      roi?.properties
        ?.histoannotator
        ?.roi
        ?.externalBorderExclusion;

    if (!config || typeof config !== "object") {
      return {
        enabled: false,
        percent: 5,
      };
    }

    const percent = Number(config.percent);

    return {
      enabled: Boolean(config.enabled),
      percent:
        Number.isFinite(percent)
          ? Math.max(0, Math.min(50, percent))
          : 5,
    };
  }

  function phaseDSetBorderConfig(
    roi,
    enabled,
    percent,
    touch = true
  ) {
    if (!roi) return;

    const histo =
      phaseCEnsureFeatureMetadata(roi);

    if (!histo.roi || typeof histo.roi !== "object") {
      histo.roi = {
        kind: "tissue",
        source: "manual",
      };
    }

    const nextPercent =
      Math.max(
        0,
        Math.min(50, Number(percent) || 0)
      );

    const previous =
      histo.roi.externalBorderExclusion;

    const changed =
      !previous
      || Boolean(previous.enabled) !== Boolean(enabled)
      || Number(previous.percent) !== nextPercent;

    histo.roi.externalBorderExclusion = {
      enabled: Boolean(enabled),
      percent: nextPercent,
    };

    if (changed && touch) {
      phaseCTouchFeature(
        roi,
        { invalidateReview: false }
      );
      markChanged();
    }
  }

  function phaseDFormatAreaCompact(value) {
    const area = Number(value);

    if (!Number.isFinite(area) || area < 0) {
      return "—";
    }
    if (area >= 1e9) {
      return `${(area / 1e9).toFixed(2)}G px²`;
    }
    if (area >= 1e6) {
      return `${(area / 1e6).toFixed(2)}M px²`;
    }
    if (area >= 1e3) {
      return `${(area / 1e3).toFixed(1)}k px²`;
    }
    return `${Math.round(area)} px²`;
  }


  let phaseDBorderHydrationKey =
    "";

  function phaseDEffectivePreviewForRoi(
    roi = phaseDTissueRoiFeature()
  ) {
    if (!roi) return null;

    const preview =
      phaseDEffectiveRoiPreview;

    if (
      !preview
      || String(preview.featureId || "")
        !== String(featureId(roi))
    ) {
      return null;
    }

    return preview;
  }

  function phaseDEnsureStoredEffectivePreview() {
    const roi =
      phaseDTissueRoiFeature();

    if (!roi) {
      phaseDEffectiveRoiPreview = null;
      phaseDBorderHydrationKey = "";
      return;
    }

    const config =
      phaseDBorderConfigForRoi(roi);

    if (!config.enabled || config.percent <= 0) {
      return;
    }

    if (phaseDEffectivePreviewForRoi(roi)?.geometry) {
      return;
    }

    const key = [
      String(featureId(roi)),
      config.percent.toFixed(3),
      geometryAreaPixels(roi.geometry).toFixed(3),
    ].join("|");

    if (key === phaseDBorderHydrationKey) {
      return;
    }

    phaseDBorderHydrationKey = key;

    queueMicrotask(() => {
      const current =
        phaseDTissueRoiFeature();

      if (
        !current
        || String(featureId(current))
          !== String(featureId(roi))
      ) {
        return;
      }

      phaseDLoadBorderControlsFromRoi();

      phaseDRefreshBorderPreview({
        saveConfig: false,
        quiet: true,
      });
    });
  }

  function phaseDRenderBorderPreviewSummary() {
    const refs = phaseDRefs();
    const roi = phaseDTissueRoiFeature();

    const baseArea =
      roi
        ? geometryAreaPixels(roi.geometry)
        : 0;

    const preview =
      phaseDEffectiveRoiPreview;

    const effectiveArea =
      preview
        ? Number(preview.effectiveAreaPx2)
        : baseArea;

    const actualPercent =
      preview
        ? Number(preview.actualPercent)
        : 0;

    if (refs.borderPreviewSummary) {
      refs.borderPreviewSummary.innerHTML = `
        <span>
          Original ROI:
          <strong>${phaseDFormatAreaCompact(baseArea)}</strong>
        </span>
        <span>
          Effective ROI:
          <strong>${phaseDFormatAreaCompact(effectiveArea)}</strong>
        </span>
        <span>
          Excluded:
          <strong>${Number.isFinite(actualPercent) ? actualPercent.toFixed(2) : "0.00"}%</strong>
        </span>
      `;
    }

    if (refs.areaSummary) {
      refs.areaSummary.hidden =
        !roi || phaseDActiveRole !== "roi";

      refs.areaSummary.textContent =
        roi
          ? (
              `Base ${phaseDFormatAreaCompact(baseArea)} · `
              + `ROI ${phaseDFormatAreaCompact(effectiveArea)}`
              + (
                  actualPercent > 0
                    ? ` · −${actualPercent.toFixed(1)}%`
                    : ""
                )
            )
          : "";
    }
  }

  function phaseDUpdateBorderControls() {
    const refs = phaseDRefs();

    const enabled =
      Boolean(
        refs.externalBorderEnabled?.checked
      );

    if (refs.externalBorderPercentField) {
      refs.externalBorderPercentField.classList.toggle(
        "disabled",
        !enabled
      );
    }

    if (refs.externalBorderPercent) {
      refs.externalBorderPercent.disabled = !enabled;

      if (refs.externalBorderPercentValue) {
        refs.externalBorderPercentValue.textContent =
          `${Number(refs.externalBorderPercent.value || 0).toFixed(1)}%`;
      }
    }
  }

  function phaseDLoadBorderControlsFromRoi() {
    const refs = phaseDRefs();
    const roi = phaseDTissueRoiFeature();

    if (
      phaseDEffectiveRoiPreview
      && (
        !roi
        || String(
          phaseDEffectiveRoiPreview.featureId
          || ""
        ) !== String(featureId(roi))
      )
    ) {
      phaseDEffectiveRoiPreview = null;
    }

    const config =
      phaseDBorderConfigForRoi(roi);

    if (refs.externalBorderEnabled) {
      refs.externalBorderEnabled.checked =
        config.enabled;
    }

    if (refs.externalBorderPercent) {
      refs.externalBorderPercent.value =
        String(config.percent);
    }

    phaseDUpdateBorderControls();
  }

  async function phaseDRefreshBorderPreview(
    {
      saveConfig = false,
      quiet = true,
    } = {}
  ) {
    const roi = phaseDTissueRoiFeature();
    const refs = phaseDRefs();

    phaseDUpdateBorderControls();

    if (!roi) {
      phaseDEffectiveRoiPreview = null;
      phaseDRenderBorderPreviewSummary();
      drawAnnotations();
      return;
    }

    const enabled =
      Boolean(
        refs.externalBorderEnabled?.checked
      );

    const percent =
      Math.max(
        0,
        Math.min(
          50,
          Number(
            refs.externalBorderPercent?.value
            || 0
          )
        )
      );

    if (saveConfig) {
      phaseDSetBorderConfig(
        roi,
        enabled,
        percent,
        true
      );
    }

    if (!enabled || percent <= 0) {
      const area =
        geometryAreaPixels(roi.geometry);

      phaseDEffectiveRoiPreview = {
        featureId:
          String(featureId(roi)),
        geometry: deepClone(roi.geometry),
        originalAreaPx2: area,
        effectiveAreaPx2: area,
        requestedPercent: 0,
        actualPercent: 0,
        widthPx: 0,
      };

      phaseDRenderBorderPreviewSummary();
      drawAnnotations();
      return;
    }

    const sequence =
      ++phaseDBorderPreviewSequence;

    try {
      const response =
        await apiFetch(
          `${API}/geometry/tissue-roi-preview`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body:
              JSON.stringify({
                geometry: roi.geometry,
                externalBorderExclusionPct:
                  percent,
              }),
            timeoutMs: 30000,
          }
        );

      const payload =
        await response.json();

      if (
        sequence !== phaseDBorderPreviewSequence
      ) {
        return;
      }

      if (!payload?.geometry) {
        throw new Error(
          payload?.detail
          || "No effective ROI returned"
        );
      }

      phaseDEffectiveRoiPreview = {
        featureId:
          String(featureId(roi)),
        geometry:
          deepClone(payload.geometry),
        originalAreaPx2:
          Number(payload.originalAreaPx2 || 0),
        effectiveAreaPx2:
          Number(payload.effectiveAreaPx2 || 0),
        requestedPercent:
          Number(payload.requestedPercent || percent),
        actualPercent:
          Number(payload.actualPercent || 0),
        widthPx:
          Number(payload.widthPx || 0),
      };

      phaseDRenderBorderPreviewSummary();
      drawAnnotations();

      if (!quiet) {
        setStatus(
          `Effective Tissue ROI preview · ${phaseDEffectiveRoiPreview.actualPercent.toFixed(2)}% excluded`,
          "local"
        );
      }
    } catch (error) {
      phaseDEffectiveRoiPreview = null;
      phaseDRenderBorderPreviewSummary();
      drawAnnotations();

      if (!quiet) {
        setStatus(
          `Border preview unavailable: ${error.message}`,
          "error"
        );
      }
    }
  }

  function phaseDScheduleBorderPreview(
    saveConfig = true
  ) {
    if (phaseDBorderPreviewTimer) {
      clearTimeout(
        phaseDBorderPreviewTimer
      );
    }

    phaseDBorderPreviewTimer =
      setTimeout(
        () => {
          phaseDRefreshBorderPreview({
            saveConfig,
            quiet: true,
          });
        },
        180
      );
  }

  function phaseDRefs() {
    return {
      menuButton:
        document.getElementById(
          "phaseDTissueRoiMenuButton"
        ),
      overlay:
        document.getElementById(
          "phaseDTissueRoiOverlay"
        ),
      status:
        document.getElementById(
          "phaseDTissueRoiStatus"
        ),
      draw:
        document.getElementById(
          "phaseDDrawRoiButton"
        ),
      select:
        document.getElementById(
          "phaseDSelectRoiButton"
        ),
      remove:
        document.getElementById(
          "phaseDDeleteRoiButton"
        ),
      close:
        document.getElementById(
          "phaseDCloseRoiButton"
        ),
      detect:
        document.getElementById(
          "phaseDDetectTissueButton"
        ),
      detectNote:
        document.getElementById(
          "phaseDTissueDetectNote"
        ),
      sensitivity:
        document.getElementById(
          "phaseDTissueSensitivity"
        ),
      sensitivityValue:
        document.getElementById(
          "phaseDTissueSensitivityValue"
        ),
      smoothing:
        document.getElementById(
          "phaseDTissueSmoothing"
        ),
      smoothingValue:
        document.getElementById(
          "phaseDTissueSmoothingValue"
        ),
      minIsland:
        document.getElementById(
          "phaseDTissueMinIsland"
        ),
      fillHoles:
        document.getElementById(
          "phaseDTissueFillHoles"
        ),
      externalBorderEnabled:
        document.getElementById(
          "phaseDExternalBorderEnabled"
        ),
      externalBorderPercent:
        document.getElementById(
          "phaseDExternalBorderPercent"
        ),
      externalBorderPercentValue:
        document.getElementById(
          "phaseDExternalBorderPercentValue"
        ),
      externalBorderPercentField:
        document.getElementById(
          "phaseDExternalBorderPercentField"
        ),
      borderPreviewSummary:
        document.getElementById(
          "phaseDRoiBorderPreviewSummary"
        ),
      areaSummary:
        document.getElementById(
          "phaseDRoiAreaSummary"
        ),
      modeAction:
        document.getElementById(
          "phaseDRoiModeAction"
        ),
      modeHint:
        document.getElementById(
          "phaseDRoiModeHint"
        ),
      editDetection:
        document.getElementById(
          "phaseDEditDetectionButton"
        ),
      done:
        document.getElementById(
          "phaseDRoiDoneButton"
        ),
    };
  }

  function phaseDSetActiveRole(
    role,
    announce = true
  ) {
    phaseDActiveRole =
      phaseDCanonicalRole(role);

    const roiMode =
      phaseDActiveRole === "roi";

    document.body.classList.toggle(
      "phase-d-roi-mode",
      roiMode
    );

    const refs =
      phaseDRefs();

    if (refs.modeAction) {
      refs.modeAction.hidden =
        !roiMode;
    }

    if (refs.modeHint) {
      const roi =
        phaseDTissueRoiFeature();

      const hasDetector =
        Boolean(
          roi?.properties
            ?.histoannotator
            ?.roi
            ?.detector
        );

      refs.modeHint.textContent =
        roi
          ? (
              hasDetector
                ? "Detection preview"
                : "Editing existing ROI"
            )
          : "Draw a tissue area";

      if (refs.editDetection) {
        refs.editDetection.hidden =
          !roiMode
          || !hasDetector;
      }
    }

    if (
      roiMode
      && announce
    ) {
      setStatus(
        "Tissue ROI mode · use an area tool; new areas are merged into the Tissue ROI",
        "local"
      );
    }

    phaseDUpdateRoiUi();
  }

  function phaseDOpenRoiSettings() {
    const refs =
      phaseDRefs();

    phaseBToggleSettings(false);

    phaseDLoadBorderControlsFromRoi();
    phaseDUpdateRoiUi();

    if (refs.overlay) {
      refs.overlay.hidden =
        false;
    }

    phaseDRefreshBorderPreview({
      saveConfig: false,
      quiet: true,
    });
  }

  function phaseDCloseRoiSettings() {
    const refs =
      phaseDRefs();

    if (refs.overlay) {
      refs.overlay.hidden =
        true;
    }
  }

  function phaseDUpdateRoiUi() {
    const refs =
      phaseDRefs();

    const roi =
      phaseDTissueRoiFeature();

    if (refs.status) {
      refs.status.textContent =
        roi
          ? (
              phaseDActiveRole === "roi"
                ? "Tissue ROI present · edit mode active."
                : "Tissue ROI present."
            )
          : (
              phaseDActiveRole === "roi"
                ? "No Tissue ROI yet · draw an area to create it."
                : "No Tissue ROI in this annotation file."
            );
    }

    if (refs.select) {
      refs.select.disabled =
        !roi;
    }

    if (refs.remove) {
      refs.remove.disabled =
        !roi;
    }

    if (refs.detect) {
      refs.detect.disabled =
        !currentImage
        || phaseDDetectBusy
        || Boolean(
          currentImage?.localNative
        );

      refs.detect.textContent =
        phaseDDetectBusy
          ? "Detecting…"
          : "Detect tissue";
    }

    if (refs.detectNote) {
      if (
        currentImage?.localNative
      ) {
        refs.detectNote.textContent =
          "This image is Android-local. Detect tissue requires a server-backed image in D1-D3; manual Tissue ROI works offline.";
      } else {
        refs.detectNote.textContent =
          "Detect tissue uses a reduced-resolution server thumbnail. Manual Tissue ROI drawing works offline.";
      }
    }

    if (refs.sensitivityValue) {
      refs.sensitivityValue.textContent =
        refs.sensitivity?.value
        || "50";
    }

    if (refs.smoothingValue) {
      refs.smoothingValue.textContent =
        refs.smoothing?.value
        || "45";
    }

    if (refs.modeAction) {
      refs.modeAction.hidden =
        phaseDActiveRole !== "roi";
    }

    const hasDetector =
      Boolean(
        roi?.properties
          ?.histoannotator
          ?.roi
          ?.detector
      );

    if (refs.editDetection) {
      refs.editDetection.hidden =
        phaseDActiveRole !== "roi"
        || !hasDetector;
    }

    if (refs.modeHint) {
      refs.modeHint.textContent =
        roi
          ? (
              hasDetector
                ? "Detection preview"
                : "Editing existing ROI"
            )
          : "Draw a tissue area";
    }

    phaseDRenderBorderPreviewSummary();
  }

  function phaseDStartManualRoi() {
    phaseDSetActiveRole(
      "roi"
    );

    const roi =
      phaseDTissueRoiFeature();

    if (roi) {
      setSingleSelection(
        String(featureId(roi))
      );
    } else {
      clearSelectedFeatures(false);
    }

    phaseDCloseRoiSettings();

    if (
      mode === "navigate"
      || mode === "select"
    ) {
      setMode("freehand");
    }

    updateControls();
    drawAnnotations();
  }

  function phaseDFinishManualRoi() {
    const roi =
      phaseDTissueRoiFeature();

    if (roi) {
      const refs =
        phaseDRefs();

      phaseDSetBorderConfig(
        roi,
        Boolean(
          refs.externalBorderEnabled?.checked
        ),
        Number(
          refs.externalBorderPercent?.value
          || 0
        ),
        true
      );
    }

    clearSelectedFeatures(false);

    phaseDSetActiveRole(
      "annotation",
      false
    );

    setEditOperation("new");

    setStatus(
      "Tissue ROI accepted · effective region will be used for statistics",
      "saved"
    );

    updateControls();
    drawAnnotations();
  }

  function phaseDSelectTissueRoi() {
    const roi =
      phaseDTissueRoiFeature();

    if (!roi) return;

    phaseDSetActiveRole(
      "roi",
      false
    );

    setSingleSelection(
      String(featureId(roi))
    );

    phaseDCloseRoiSettings();

    updateControls();
    drawAnnotations();
  }

  function phaseDDeleteTissueRoi() {
    const roi =
      phaseDTissueRoiFeature();

    if (!roi) return;

    pushUndo();

    const roiId =
      String(featureId(roi));

    featureCollection.features =
      featureCollection.features.filter(
        (feature) =>
          String(featureId(feature))
          !== roiId
      );

    if (
      selectedIds.has(roiId)
    ) {
      clearSelectedFeatures(false);
    }

    phaseDSetActiveRole(
      "annotation",
      false
    );

    markChanged();

    phaseDUpdateRoiUi();

    setStatus(
      "Tissue ROI deleted",
      "saved"
    );
  }

  function phaseDDetectionSettings() {
    const refs =
      phaseDRefs();

    return {
      sensitivity:
        Number(
          refs.sensitivity?.value
          || 50
        ),
      smoothing:
        Number(
          refs.smoothing?.value
          || 45
        ),
      minIslandPct:
        Math.max(
          0,
          Number(
            refs.minIsland?.value
            || 0.05
          )
        ),
      fillHoles:
        Boolean(
          refs.fillHoles?.checked
        ),
      maxSize: 2048,
    };
  }

  async function phaseDDetectTissue() {
    if (
      !currentImage
      || phaseDDetectBusy
    ) {
      return;
    }

    if (currentImage.localNative) {
      setStatus(
        "Detect tissue currently requires a server-backed image; use manual Tissue ROI for Android-local images",
        "error"
      );
      return;
    }

    if (imageType === "fluorescence") {
      setStatus(
        "Detect tissue D1-D3 is intended for brightfield H&E/H-DAB/RGB images; use manual Tissue ROI for fluorescence",
        "error"
      );
      return;
    }

    const settings =
      phaseDDetectionSettings();

    phaseDDetectBusy = true;

    phaseDCloseRoiSettings();
    phaseDSetActiveRole(
      "roi",
      false
    );
    phaseDUpdateRoiUi();

    setStatus(
      "Detecting tissue on reduced-resolution image…",
      "local"
    );

    try {
      const response =
        await apiFetch(
          `${API}/images/${currentImage.id}/detect-tissue`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                settings
              ),
            timeoutMs: 45000,
          }
        );

      const payload =
        await response.json();

      if (!payload?.geometry) {
        throw new Error(
          payload?.detail
          || "No tissue geometry returned"
        );
      }

      pushUndo();

      let roi =
        phaseDTissueRoiFeature();

      if (roi) {
        roi.geometry =
          deepClone(
            payload.geometry
          );

        phaseCFinalizeGeometryEdit(
          roi
        );

        const previousBorder =
          phaseDBorderConfigForRoi(
            roi
          );

        roi.properties
          .histoannotator.roi = {
            kind: "tissue",
            source:
              "detect-tissue",
            detector:
              deepClone(
                payload.detector
                || {}
              ),
            externalBorderExclusion: {
              enabled:
                previousBorder.enabled,
              percent:
                previousBorder.percent,
            },
          };
      } else {
        roi =
          phaseDCreateTissueRoiFeature(
            payload.geometry,
            "detect-tissue",
            payload.detector
          );

        const refs =
          phaseDRefs();

        phaseDSetBorderConfig(
          roi,
          Boolean(
            refs.externalBorderEnabled?.checked
          ),
          Number(
            refs.externalBorderPercent?.value
            || 5
          ),
          false
        );

        featureCollection.features.push(
          roi
        );
      }

      setSingleSelection(
        String(featureId(roi))
      );

      phaseDSetActiveRole(
        "roi",
        false
      );

      markChanged();

      phaseDUpdateRoiUi();
      updateControls();

      phaseDLoadBorderControlsFromRoi();

      await phaseDRefreshBorderPreview({
        saveConfig: false,
        quiet: true,
      });

      drawAnnotations();

      const percent =
        Number.isFinite(
          Number(
            payload.detectedFraction
          )
        )
          ? (
              Number(
                payload.detectedFraction
              )
              * 100
            ).toFixed(1)
          : null;

      setStatus(
        percent
          ? `Tissue ROI detected · ${percent}% of preview classified as tissue`
          : "Tissue ROI detected",
        "saved"
      );
    } catch (error) {
      const message =
        error?.message
        || String(error)
        || "Unknown tissue detection error";

      clearSelectedFeatures(false);

      phaseDSetActiveRole(
        "annotation",
        false
      );

      setStatus(
        `Tissue detection failed: ${message}`,
        "error"
      );
    } finally {
      phaseDDetectBusy = false;
      phaseDUpdateRoiUi();
    }
  }

  function phaseDBindEvents() {
    const refs =
      phaseDRefs();

    refs.menuButton?.addEventListener(
      "click",
      phaseDOpenRoiSettings
    );

    refs.close?.addEventListener(
      "click",
      phaseDCloseRoiSettings
    );

    refs.overlay?.addEventListener(
      "click",
      (event) => {
        if (
          event.target
          === refs.overlay
        ) {
          phaseDCloseRoiSettings();
        }
      }
    );

    refs.draw?.addEventListener(
      "click",
      phaseDStartManualRoi
    );

    refs.done?.addEventListener(
      "click",
      phaseDFinishManualRoi
    );

    refs.editDetection?.addEventListener(
      "click",
      () => {
        phaseDOpenRoiSettings();
      }
    );

    refs.select?.addEventListener(
      "click",
      phaseDSelectTissueRoi
    );

    refs.remove?.addEventListener(
      "click",
      phaseDDeleteTissueRoi
    );

    refs.detect?.addEventListener(
      "click",
      phaseDDetectTissue
    );

    refs.sensitivity?.addEventListener(
      "input",
      phaseDUpdateRoiUi
    );

    refs.smoothing?.addEventListener(
      "input",
      phaseDUpdateRoiUi
    );

    refs.externalBorderEnabled?.addEventListener(
      "change",
      () => {
        phaseDUpdateBorderControls();
        phaseDScheduleBorderPreview(
          true
        );
      }
    );

    refs.externalBorderPercent?.addEventListener(
      "input",
      () => {
        phaseDUpdateBorderControls();
        phaseDScheduleBorderPreview(
          true
        );
      }
    );
  }

  // ========================================================================
  // Phase C — workflow, review decision, provenance, and lifecycle.
  // ========================================================================

  const PHASE_C_SCHEMA_VERSION = 1;
  const PHASE_C_REVIEWER_STORAGE =
    "histoannotator.reviewer.v1";

  let phaseCSemanticBaseline = null;

  function phaseCDeviceLabel() {
    if (IS_NATIVE) {
      const platform =
        window.Capacitor?.getPlatform?.();

      if (platform === "android") return "Android";
      if (platform === "ios") return "iOS";
      return "Native";
    }

    return "Web/Desktop";
  }

  function phaseCCanonicalLifecycle(value) {
    const normalized =
      String(value || "")
        .trim()
        .toLowerCase();

    if (normalized === "approved") return "Approved";
    if (normalized === "reviewed") return "Reviewed";
    return "Draft";
  }

  function phaseCCanonicalDecision(value) {
    const normalized =
      String(value || "")
        .trim()
        .toLowerCase();

    return ["correct", "maybe", "later"].includes(normalized)
      ? normalized
      : null;
  }

  function phaseCNormalizeMetadata(sourceProperties = {}) {
    const source =
      sourceProperties?.histoannotator
      && typeof sourceProperties.histoannotator === "object"
        ? deepClone(sourceProperties.histoannotator)
        : {};

    source.schemaVersion = PHASE_C_SCHEMA_VERSION;
    source.role = phaseDCanonicalRole(
      source.role || "annotation"
    );

    const workflowSource =
      source.workflow
      && typeof source.workflow === "object"
        ? source.workflow
        : {};

    let decision =
      phaseCCanonicalDecision(
        workflowSource.reviewDecision
      );

    const legacyReview =
      sourceProperties?.histoannotatorReview;

    if (
      !decision
      && legacyReview
      && typeof legacyReview === "object"
    ) {
      decision =
        phaseCCanonicalDecision(
          legacyReview.status
        );

      if (
        !workflowSource.reviewedAt
        && legacyReview.reviewedAt
      ) {
        workflowSource.reviewedAt =
          String(legacyReview.reviewedAt);
      }
    }

    let status =
      phaseCCanonicalLifecycle(
        workflowSource.status
      );

    if (
      !workflowSource.status
      && decision === "correct"
    ) {
      status = "Reviewed";
    }

    if (
      decision === "maybe"
      || decision === "later"
    ) {
      status = "Draft";
    }

    source.workflow = {
      status,
      reviewDecision: decision,
      reviewer:
        String(workflowSource.reviewer || "").trim()
        || null,
      reviewedAt:
        String(workflowSource.reviewedAt || "").trim()
        || null,
      approvedAt:
        String(workflowSource.approvedAt || "").trim()
        || null,
    };

    const provenanceSource =
      source.provenance
      && typeof source.provenance === "object"
        ? source.provenance
        : {};

    const provenance = {};

    for (
      const key
      of [
        "createdAt",
        "modifiedAt",
        "createdWith",
        "modifiedWith",
        "createdDevice",
        "modifiedDevice",
      ]
    ) {
      const value =
        String(provenanceSource[key] || "").trim();

      if (value) provenance[key] = value;
    }

    const version =
      Math.max(
        0,
        Number(provenanceSource.version || 0)
      );

    if (Number.isFinite(version) && version > 0) {
      provenance.version = Math.floor(version);
    }

    source.provenance = provenance;
    return source;
  }

  function phaseCCreateMetadata(role = "annotation") {
    const now =
      new Date().toISOString();

    return {
      schemaVersion: PHASE_C_SCHEMA_VERSION,
      role: phaseDCanonicalRole(role),
      workflow: {
        status: "Draft",
        reviewDecision: null,
        reviewer: null,
        reviewedAt: null,
        approvedAt: null,
      },
      provenance: {
        createdAt: now,
        modifiedAt: now,
        version: 1,
        createdWith: VERSION,
        modifiedWith: VERSION,
        createdDevice: phaseCDeviceLabel(),
        modifiedDevice: phaseCDeviceLabel(),
      },
    };
  }

  function phaseCEnsureFeatureMetadata(feature) {
    if (!feature) return null;

    feature.properties ||= {};

    feature.properties.histoannotator =
      phaseCNormalizeMetadata(
        feature.properties
      );

    return feature.properties.histoannotator;
  }

  function phaseCCurrentReviewer() {
    return String(
      localStorage.getItem(
        PHASE_C_REVIEWER_STORAGE
      )
      || ""
    ).trim();
  }

  function phaseCSaveReviewerPreference(value) {
    const reviewer =
      String(value || "").trim();

    if (reviewer) {
      localStorage.setItem(
        PHASE_C_REVIEWER_STORAGE,
        reviewer
      );
    } else {
      localStorage.removeItem(
        PHASE_C_REVIEWER_STORAGE
      );
    }

    return reviewer;
  }

  function phaseCTouchFeature(
    feature,
    options = {}
  ) {
    const metadata =
      phaseCEnsureFeatureMetadata(feature);

    if (!metadata) return;

    if (options.invalidateReview !== false) {
      metadata.workflow.status = "Draft";
      metadata.workflow.reviewDecision = null;
      metadata.workflow.reviewer = null;
      metadata.workflow.reviewedAt = null;
      metadata.workflow.approvedAt = null;
    }

    const provenance =
      metadata.provenance;

    const previousVersion =
      Math.max(
        0,
        Number(provenance.version || 0)
      );

    provenance.version =
      Math.floor(previousVersion) + 1;

    provenance.modifiedAt =
      new Date().toISOString();

    provenance.modifiedWith =
      VERSION;

    provenance.modifiedDevice =
      phaseCDeviceLabel();
  }

  function phaseCFinalizeGeometryEdit(feature) {
    if (!feature) return;

    const metadata =
      phaseCEnsureFeatureMetadata(feature);

    metadata.workflow.status = "Draft";
    metadata.workflow.reviewDecision = null;
    metadata.workflow.reviewer = null;
    metadata.workflow.reviewedAt = null;
    metadata.workflow.approvedAt = null;

    phaseCTouchFeature(
      feature,
      { invalidateReview: false }
    );

    // This edit is now accounted for explicitly. Prevent markChanged() from
    // applying the semantic-diff provenance update a second time.
    phaseCSemanticBaseline = null;
  }

  function phaseCSetReviewDecision(
    feature,
    decision
  ) {
    const normalized =
      phaseCCanonicalDecision(decision);

    if (!feature || !normalized) return;

    const metadata =
      phaseCEnsureFeatureMetadata(feature);

    metadata.workflow.reviewDecision =
      normalized;

    metadata.workflow.status =
      normalized === "correct"
        ? "Reviewed"
        : "Draft";

    metadata.workflow.reviewer =
      phaseCCurrentReviewer()
      || metadata.workflow.reviewer
      || null;

    metadata.workflow.reviewedAt =
      new Date().toISOString();

    metadata.workflow.approvedAt = null;

    phaseCTouchFeature(
      feature,
      { invalidateReview: false }
    );
  }

  function phaseCResetToDraft(feature) {
    if (!feature) return;

    const metadata =
      phaseCEnsureFeatureMetadata(feature);

    metadata.workflow.status = "Draft";
    metadata.workflow.reviewDecision = null;
    metadata.workflow.reviewer = null;
    metadata.workflow.reviewedAt = null;
    metadata.workflow.approvedAt = null;

    phaseCTouchFeature(
      feature,
      { invalidateReview: false }
    );
  }

  function phaseCApproveFeature(feature) {
    if (!feature) return false;

    const metadata =
      phaseCEnsureFeatureMetadata(feature);

    if (metadata.workflow.status !== "Reviewed") {
      return false;
    }

    metadata.workflow.status = "Approved";
    metadata.workflow.reviewer =
      phaseCCurrentReviewer()
      || metadata.workflow.reviewer
      || null;

    metadata.workflow.approvedAt =
      new Date().toISOString();

    phaseCTouchFeature(
      feature,
      { invalidateReview: false }
    );

    return true;
  }

  function phaseCSemanticFingerprint(feature) {
    return JSON.stringify({
      geometry: feature?.geometry || null,
      classification:
        feature?.properties?.classification
        || null,
      name:
        feature?.properties?.name
        ?? null,
      description:
        feature?.properties?.description
        ?? null,
    });
  }

  function phaseCCaptureSemanticBaseline() {
    phaseCSemanticBaseline =
      new Map();

    for (
      const feature
      of featureCollection.features
      || []
    ) {
      phaseCSemanticBaseline.set(
        String(featureId(feature)),
        phaseCSemanticFingerprint(feature)
      );
    }
  }

  function phaseCApplySemanticChanges() {
    if (!phaseCSemanticBaseline) return;

    for (
      const feature
      of featureCollection.features
      || []
    ) {
      const id =
        String(featureId(feature));

      if (!phaseCSemanticBaseline.has(id)) {
        phaseCEnsureFeatureMetadata(feature);
        continue;
      }

      const previous =
        phaseCSemanticBaseline.get(id);

      const current =
        phaseCSemanticFingerprint(feature);

      if (previous !== current) {
        phaseCTouchFeature(
          feature,
          { invalidateReview: true }
        );
      }
    }

    phaseCSemanticBaseline = null;
  }

  function phaseCWorkflowForFeature(feature) {
    return phaseCEnsureFeatureMetadata(feature)?.workflow
      || {
        status: "Draft",
        reviewDecision: null,
        reviewer: null,
        reviewedAt: null,
        approvedAt: null,
      };
  }

  function phaseCSelectedFeature() {
    if (
      selectedIds.size !== 1
      || !selectedId
    ) {
      return null;
    }

    return findFeature(selectedId);
  }

  function phaseCWorkflowRefs() {
    return {
      action:
        document.getElementById("phaseCWorkflowAction"),
      button:
        document.getElementById("phaseCWorkflowButton"),
      summaryButton:
        document.getElementById("phaseCWorkflowSummaryButton"),
      overlay:
        document.getElementById("phaseCWorkflowOverlay"),
      content:
        document.getElementById("phaseCWorkflowContent"),
      summary:
        document.getElementById("phaseCWorkflowSummary"),
      scope:
        document.getElementById("phaseCWorkflowScope"),
      reviewerInput:
        document.getElementById("phaseCReviewerInput"),
      saveReviewer:
        document.getElementById("phaseCSaveReviewerButton"),
      returnDraft:
        document.getElementById("phaseCReturnDraftButton"),
      approve:
        document.getElementById("phaseCApproveButton"),
      approveReviewed:
        document.getElementById("phaseCApproveReviewedButton"),
      close:
        document.getElementById("phaseCCloseWorkflowButton"),
    };
  }


  function phaseCCurrentClassName() {
    return String(
      currentClass?.name
      || ""
    ).trim();
  }

  function phaseCFeaturesForWorkflowScope(scope) {
    const all =
      (
        featureCollection.features
        || []
      ).filter(
        phaseDIsAnnotationFeature
      );

    if (scope === "selected") {
      return all.filter(
        (feature) =>
          selectedIds.has(
            String(featureId(feature))
          )
      );
    }

    if (scope === "class") {
      const className =
        phaseCCurrentClassName();

      if (!className) return [];

      return all.filter(
        (feature) =>
          String(
            feature?.properties
              ?.classification?.name
            || ""
          ) === className
      );
    }

    return [...all];
  }

  function phaseCWorkflowSummaryFor(features) {
    const summary = {
      total: 0,
      Draft: 0,
      Reviewed: 0,
      Approved: 0,
      correct: 0,
      maybe: 0,
      later: 0,
      pending: 0,
    };

    for (const feature of features || []) {
      const workflow =
        phaseCWorkflowForFeature(
          feature
        );

      summary.total += 1;

      const status =
        phaseCCanonicalLifecycle(
          workflow.status
        );

      summary[status] += 1;

      const decision =
        phaseCCanonicalDecision(
          workflow.reviewDecision
        );

      if (decision) {
        summary[decision] += 1;
      } else {
        summary.pending += 1;
      }
    }

    return summary;
  }

  function phaseCWorkflowScopeLabel(scope, count) {
    if (scope === "selected") {
      return `${count} selected`;
    }

    if (scope === "class") {
      const className =
        phaseCCurrentClassName()
        || "class";

      return `${className} · ${count}`;
    }

    return `Current file · ${count}`;
  }

  function phaseCRenderBatchSummary(
    refs,
    features,
    summary
  ) {
    if (!refs.summary) return;

    refs.summary.hidden = false;
    refs.summary.innerHTML = "";

    const addHeading = (text) => {
      const heading =
        document.createElement("div");

      heading.className =
        "phase-c-summary-section";

      heading.textContent = text;
      refs.summary.append(heading);
    };

    const addItem = (label, value) => {
      const item =
        document.createElement("div");

      item.className =
        "phase-c-summary-item";

      const strong =
        document.createElement("strong");

      strong.textContent =
        String(value);

      const span =
        document.createElement("span");

      span.textContent = label;

      item.append(strong, span);
      refs.summary.append(item);
    };

    addHeading("Lifecycle");
    addItem("Total", summary.total);
    addItem("Draft", summary.Draft);
    addItem("Reviewed", summary.Reviewed);
    addItem("Approved", summary.Approved);

    addHeading("Review decisions");
    addItem("Correct", summary.correct);
    addItem("Maybe", summary.maybe);
    addItem("Review later", summary.later);
    addItem("Pending", summary.pending);
  }

  function phaseCOpenWorkflowSummary(
    preferredScope = "file"
  ) {
    const refs =
      phaseCWorkflowRefs();

    if (!refs.overlay) return;

    let scope =
      preferredScope;

    if (
      scope === "selected"
      && !selectedIds.size
    ) {
      scope = "file";
    }

    if (
      scope === "class"
      && !phaseCCurrentClassName()
    ) {
      scope = "file";
    }

    if (refs.scope) {
      refs.scope.value = scope;
    }

    phaseCRenderWorkflowModal(
      scope
    );

    refs.overlay.hidden = false;
  }

  function phaseCBatchApproveReviewed(scope) {
    const features =
      phaseCFeaturesForWorkflowScope(
        scope
      );

    const targets =
      features.filter(
        (feature) =>
          phaseCWorkflowForFeature(feature)
            .status === "Reviewed"
      );

    if (!targets.length) {
      setStatus(
        "No Reviewed annotations in this scope",
        "local"
      );
      return 0;
    }

    pushUndo();

    let changed = 0;

    for (const feature of targets) {
      if (phaseCApproveFeature(feature)) {
        changed += 1;
      }
    }

    if (changed) {
      markChanged();
      phaseCUpdateWorkflowAction();

      setStatus(
        `${changed} Reviewed annotation${changed === 1 ? "" : "s"} Approved`,
        "saved"
      );
    }

    return changed;
  }

  function phaseCBatchReturnDraft(scope) {
    const features =
      phaseCFeaturesForWorkflowScope(
        scope
      );

    const targets =
      features.filter((feature) => {
        const workflow =
          phaseCWorkflowForFeature(
            feature
          );

        return (
          workflow.status !== "Draft"
          || Boolean(
            workflow.reviewDecision
          )
        );
      });

    if (!targets.length) {
      setStatus(
        "All annotations in this scope are already clean Drafts",
        "local"
      );
      return 0;
    }

    pushUndo();

    for (const feature of targets) {
      phaseCResetToDraft(feature);
    }

    markChanged();
    phaseCUpdateWorkflowAction();

    setStatus(
      `${targets.length} annotation${targets.length === 1 ? "" : "s"} returned to Draft`,
      "saved"
    );

    return targets.length;
  }

  function phaseCFormatTimestamp(
    value,
    legacy = false
  ) {
    if (!value) {
      return legacy
        ? "— (legacy)"
        : "—";
    }

    const parsed =
      new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleString();
  }

  function phaseCUpdateWorkflowAction() {
    const refs =
      phaseCWorkflowRefs();

    if (!refs.action || !refs.button) return;

    const selectionCount =
      selectedIds.size;

    const feature =
      phaseCSelectedFeature();

    const workflowSelection =
      selectedFeatures().filter(
        phaseDIsAnnotationFeature
      );

    const visible =
      selectionCount > 0
      && workflowSelection.length
        === selectionCount
      && !reviewState.active;

    refs.action.hidden = !visible;

    if (refs.summaryButton) {
      refs.summaryButton.disabled =
        !currentImage
        || !featureCollection.features.length;
    }

    if (!visible) return;

    refs.button.classList.remove(
      "phase-c-workflow-button-draft",
      "phase-c-workflow-button-reviewed",
      "phase-c-workflow-button-approved"
    );

    if (selectionCount > 1) {
      refs.button.textContent =
        `Workflow · ${selectionCount} selected`;
      return;
    }

    const workflow =
      phaseCWorkflowForFeature(feature);

    refs.button.textContent =
      `Workflow · ${workflow.status}`;

    refs.button.classList.add(
      `phase-c-workflow-button-${workflow.status.toLowerCase()}`
    );
  }

  function phaseCRenderWorkflowModal(
    requestedScope = null
  ) {
    const refs =
      phaseCWorkflowRefs();

    if (!refs.content) return false;

    let scope =
      requestedScope
      || refs.scope?.value
      || (
        selectedIds.size
          ? "selected"
          : "file"
      );

    if (
      scope === "selected"
      && !selectedIds.size
    ) {
      scope = "file";
    }

    if (
      scope === "class"
      && !phaseCCurrentClassName()
    ) {
      scope = "file";
    }

    if (refs.scope) {
      refs.scope.value = scope;

      const selectedOption =
        refs.scope.querySelector(
          'option[value="selected"]'
        );

      if (selectedOption) {
        selectedOption.disabled =
          selectedIds.size === 0;
      }

      const classOption =
        refs.scope.querySelector(
          'option[value="class"]'
        );

      if (classOption) {
        const className =
          phaseCCurrentClassName();

        classOption.disabled =
          !className;

        classOption.textContent =
          className
            ? `Current class · ${className}`
            : "Current class";
      }
    }

    const features =
      phaseCFeaturesForWorkflowScope(
        scope
      );

    const summary =
      phaseCWorkflowSummaryFor(
        features
      );

    const singleIndividual =
      scope === "selected"
      && features.length === 1;

    refs.content.innerHTML = "";

    if (refs.summary) {
      refs.summary.hidden =
        singleIndividual;
    }

    if (singleIndividual) {
      const feature =
        features[0];

      const metadata =
        phaseCEnsureFeatureMetadata(
          feature
        );

      const workflow =
        metadata.workflow;

      const provenance =
        metadata.provenance;

      const legacy =
        !provenance.createdAt;

      const rows = [
        ["Status", workflow.status],
        [
          "Review decision",
          workflow.reviewDecision || "—",
        ],
        [
          "Reviewer",
          workflow.reviewer || "—",
        ],
        [
          "Created",
          phaseCFormatTimestamp(
            provenance.createdAt,
            legacy
          ),
        ],
        [
          "Modified",
          phaseCFormatTimestamp(
            provenance.modifiedAt
          ),
        ],
        [
          "Version",
          provenance.version
            ? String(provenance.version)
            : "— (legacy)",
        ],
        [
          "Created with",
          provenance.createdWith || "—",
        ],
        [
          "Modified with",
          provenance.modifiedWith || "—",
        ],
        [
          "Created device",
          provenance.createdDevice || "—",
        ],
        [
          "Modified device",
          provenance.modifiedDevice || "—",
        ],
      ];

      for (
        const [label, value]
        of rows
      ) {
        const labelElement =
          document.createElement("span");

        labelElement.textContent =
          label;

        const valueElement =
          document.createElement("strong");

        valueElement.textContent =
          value;

        refs.content.append(
          labelElement,
          valueElement
        );
      }

      if (refs.reviewerInput) {
        refs.reviewerInput.value =
          workflow.reviewer
          || phaseCCurrentReviewer()
          || "";
      }

      if (refs.approve) {
        refs.approve.hidden = false;
        refs.approve.disabled =
          workflow.status !== "Reviewed";
      }

      if (refs.approveReviewed) {
        refs.approveReviewed.hidden = true;
      }

      if (refs.returnDraft) {
        refs.returnDraft.disabled =
          workflow.status === "Draft"
          && !workflow.reviewDecision;

        refs.returnDraft.textContent =
          "Return to Draft";
      }
    } else {
      phaseCRenderBatchSummary(
        refs,
        features,
        summary
      );

      const titleLabel =
        document.createElement("span");

      titleLabel.textContent =
        "Scope";

      const titleValue =
        document.createElement("strong");

      titleValue.textContent =
        phaseCWorkflowScopeLabel(
          scope,
          summary.total
        );

      refs.content.append(
        titleLabel,
        titleValue
      );

      if (refs.reviewerInput) {
        refs.reviewerInput.value =
          phaseCCurrentReviewer()
          || "";
      }

      if (refs.approve) {
        refs.approve.hidden = true;
      }

      if (refs.approveReviewed) {
        refs.approveReviewed.hidden = false;
        refs.approveReviewed.disabled =
          summary.Reviewed === 0;

        refs.approveReviewed.textContent =
          `Approve Reviewed (${summary.Reviewed})`;
      }

      if (refs.returnDraft) {
        const resetCount =
          features.filter((feature) => {
            const workflow =
              phaseCWorkflowForFeature(
                feature
              );

            return (
              workflow.status !== "Draft"
              || Boolean(
                workflow.reviewDecision
              )
            );
          }).length;

        refs.returnDraft.disabled =
          resetCount === 0;

        refs.returnDraft.textContent =
          `Return to Draft (${resetCount})`;
      }
    }

    return true;
  }

  function phaseCOpenWorkflowModal() {
    const preferredScope =
      selectedIds.size
        ? "selected"
        : "file";

    phaseCOpenWorkflowSummary(
      preferredScope
    );
  }

  function phaseCCloseWorkflowModal() {
    const refs =
      phaseCWorkflowRefs();

    if (refs.overlay) {
      refs.overlay.hidden = true;
    }
  }

  function phaseBBindPhaseCEvents() {
    const refs =
      phaseCWorkflowRefs();

    refs.button?.addEventListener(
      "click",
      phaseCOpenWorkflowModal
    );

    refs.summaryButton?.addEventListener(
      "click",
      () => {
        toggleFileMenu(false);
        phaseCOpenWorkflowSummary("file");
      }
    );

    refs.scope?.addEventListener(
      "change",
      () => {
        phaseCRenderWorkflowModal(
          refs.scope.value
        );
      }
    );

    refs.close?.addEventListener(
      "click",
      phaseCCloseWorkflowModal
    );

    refs.overlay?.addEventListener(
      "click",
      (event) => {
        if (event.target === refs.overlay) {
          phaseCCloseWorkflowModal();
        }
      }
    );

    refs.saveReviewer?.addEventListener(
      "click",
      () => {
        const reviewer =
          phaseCSaveReviewerPreference(
            refs.reviewerInput?.value
            || ""
          );

        const scope =
          refs.scope?.value
          || "selected";

        const features =
          phaseCFeaturesForWorkflowScope(
            scope
          );

        // For a single selected annotation, Save reviewer also updates that
        // reviewed/approved feature. For batch scopes it acts as the reviewer
        // preference for subsequent review decisions, avoiding accidental
        // rewriting of hundreds of historical reviewer fields.
        if (
          scope === "selected"
          && features.length === 1
        ) {
          const feature =
            features[0];

          const metadata =
            phaseCEnsureFeatureMetadata(
              feature
            );

          if (
            metadata.workflow.reviewDecision
            || metadata.workflow.status === "Reviewed"
            || metadata.workflow.status === "Approved"
          ) {
            pushUndo();

            metadata.workflow.reviewer =
              reviewer || null;

            phaseCTouchFeature(
              feature,
              { invalidateReview: false }
            );

            markChanged();
          }
        }

        phaseCRenderWorkflowModal(
          scope
        );

        setStatus(
          reviewer
            ? `Reviewer set to ${reviewer}`
            : "Reviewer preference cleared",
          "saved"
        );
      }
    );

    refs.returnDraft?.addEventListener(
      "click",
      () => {
        const scope =
          refs.scope?.value
          || "selected";

        const features =
          phaseCFeaturesForWorkflowScope(
            scope
          );

        if (
          scope === "selected"
          && features.length === 1
        ) {
          const feature =
            features[0];

          const workflow =
            phaseCWorkflowForFeature(
              feature
            );

          if (
            workflow.status === "Draft"
            && !workflow.reviewDecision
          ) {
            return;
          }

          pushUndo();
          phaseCResetToDraft(feature);
          markChanged();

          setStatus(
            "Annotation returned to Draft",
            "saved"
          );
        } else {
          phaseCBatchReturnDraft(
            scope
          );
        }

        phaseCRenderWorkflowModal(
          scope
        );
        phaseCUpdateWorkflowAction();
      }
    );

    refs.approve?.addEventListener(
      "click",
      () => {
        const feature =
          phaseCSelectedFeature();

        if (!feature) return;

        pushUndo();

        if (!phaseCApproveFeature(feature)) {
          setStatus(
            "Only Reviewed annotations can be Approved",
            "error"
          );
          return;
        }

        markChanged();

        phaseCRenderWorkflowModal(
          "selected"
        );
        phaseCUpdateWorkflowAction();

        setStatus(
          "Annotation Approved",
          "saved"
        );
      }
    );

    refs.approveReviewed?.addEventListener(
      "click",
      () => {
        const scope =
          refs.scope?.value
          || "file";

        phaseCBatchApproveReviewed(
          scope
        );

        phaseCRenderWorkflowModal(
          scope
        );
      }
    );
  }

  // ========================================================================
  // Phase B — compact Settings, Focus Mode, shortcuts, rectangle information.
  // ========================================================================
  let phaseBFocusActive = false;
  let phaseBShortcutCapture = null;

  const PHASE_B_SHORTCUT_STORAGE = "histoannotator.shortcuts.v1";
  const PHASE_B_SHORTCUT_ACTIONS = [
    { id: "tool.navigate", label: "Move", group: "Tools", defaultKey: "1" },
    { id: "tool.freehand", label: "Freehand", group: "Tools", defaultKey: "2" },
    { id: "tool.brush", label: "Brush", group: "Tools", defaultKey: "3" },
    { id: "tool.polygon", label: "Polygon", group: "Tools", defaultKey: "4" },
    { id: "tool.rectangle", label: "Rectangle", group: "Tools", defaultKey: "5" },
    { id: "tool.circle", label: "Circle", group: "Tools", defaultKey: "6" },
    { id: "tool.wand", label: "Wand", group: "Tools", defaultKey: "7" },
    { id: "tool.select", label: "Select", group: "Tools", defaultKey: "8" },
    { id: "review.correct", label: "Correct", group: "Review Mode", defaultKey: "Z" },
    { id: "review.maybe", label: "Maybe", group: "Review Mode", defaultKey: "X" },
    { id: "review.later", label: "Review later", group: "Review Mode", defaultKey: "C" },
    { id: "review.delete", label: "Delete", group: "Review Mode", defaultKey: "V" },
    { id: "general.escape", label: "Exit / cancel", group: "General", defaultKey: "Escape" },
    { id: "polygon.finish", label: "Finish Polygon", group: "General", defaultKey: "Enter" },
    { id: "focus.toggle", label: "Toggle Focus Mode", group: "General", defaultKey: "" },
  ];

  function phaseBRefs() {
    return {
      settingsButton: document.getElementById("phaseBSettingsButton"),
      settingsPanel: document.getElementById("phaseBSettingsPanel"),
      focusMenuButton: document.getElementById("phaseBFocusMenuButton"),
      shortcutsMenuButton: document.getElementById("phaseBShortcutsMenuButton"),
      focusControls: document.getElementById("phaseBFocusControls"),
      focusClassesButton: document.getElementById("phaseBFocusClassesButton"),
      focusClassStrip: document.getElementById("phaseBFocusClassStrip"),
      exitFocusButton: document.getElementById("phaseBExitFocusButton"),
      shortcutOverlay: document.getElementById("phaseBShortcutOverlay"),
      shortcutList: document.getElementById("phaseBShortcutList"),
      shortcutMessage: document.getElementById("phaseBShortcutMessage"),
      resetShortcutsButton: document.getElementById("phaseBResetShortcutsButton"),
      closeShortcutsButton: document.getElementById("phaseBCloseShortcutsButton"),
      rectangleAction: document.getElementById("phaseBRectangleAction"),
      rectangleInfoButton: document.getElementById("phaseBRectangleInfoButton"),
      rectangleOverlay: document.getElementById("phaseBRectangleOverlay"),
      rectangleContent: document.getElementById("phaseBRectangleContent"),
      closeRectangleButton: document.getElementById("phaseBCloseRectangleButton"),
    };
  }

  function phaseBShortcutDefaults() {
    return Object.fromEntries(
      PHASE_B_SHORTCUT_ACTIONS.map((action) => [action.id, action.defaultKey])
    );
  }

  function phaseBLoadShortcutBindings() {
    const result = phaseBShortcutDefaults();
    try {
      const saved = JSON.parse(
        localStorage.getItem(PHASE_B_SHORTCUT_STORAGE) || "{}"
      );
      if (saved && typeof saved === "object") {
        for (const action of PHASE_B_SHORTCUT_ACTIONS) {
          if (typeof saved[action.id] === "string") {
            result[action.id] = saved[action.id];
          }
        }
      }
    } catch (_) { /* defaults */ }
    return result;
  }

  let phaseBShortcutBindings = phaseBLoadShortcutBindings();

  function phaseBSaveShortcutBindings() {
    localStorage.setItem(
      PHASE_B_SHORTCUT_STORAGE,
      JSON.stringify(phaseBShortcutBindings)
    );
  }

  function phaseBNormalizeKey(event) {
    let key = String(event.key || "");
    if (!key) return "";
    if (key.length === 1) key = key.toUpperCase();
    if (key === "Esc") key = "Escape";
    if (key === " ") key = "Space";

    const modifiers = [];
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.metaKey) modifiers.push("Meta");
    if (event.shiftKey && key.length > 1) modifiers.push("Shift");
    return [...modifiers, key].join("+");
  }

  function phaseBTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest("input, textarea, select, [contenteditable='true']")
    );
  }

  function phaseBActionForKey(key) {
    if (!key) return null;
    return PHASE_B_SHORTCUT_ACTIONS.find(
      (action) => phaseBShortcutBindings[action.id] === key
    ) || null;
  }

  function phaseBSetShortcutMessage(message = "", error = false) {
    const refs = phaseBRefs();
    if (!refs.shortcutMessage) return;
    refs.shortcutMessage.textContent = message;
    refs.shortcutMessage.classList.toggle("error", Boolean(error));
  }

  function phaseBRenderShortcutSettings() {
    const refs = phaseBRefs();
    if (!refs.shortcutList) return;

    refs.shortcutList.innerHTML = "";
    let group = null;

    for (const action of PHASE_B_SHORTCUT_ACTIONS) {
      if (action.group !== group) {
        group = action.group;
        const heading = document.createElement("strong");
        heading.className = "phase-b-shortcut-group";
        heading.textContent = group;
        refs.shortcutList.append(heading);
      }

      const row = document.createElement("div");
      row.className = "phase-b-shortcut-row";

      const label = document.createElement("div");
      label.className = "phase-b-shortcut-label";

      const title = document.createElement("strong");
      title.textContent = action.label;

      const id = document.createElement("small");
      id.textContent = action.id;

      label.append(title, id);

      const keyButton = document.createElement("button");
      keyButton.type = "button";
      keyButton.className = "phase-b-shortcut-key";
      keyButton.textContent = phaseBShortcutBindings[action.id] || "—";

      if (phaseBShortcutCapture === action.id) {
        keyButton.classList.add("capturing");
      }

      keyButton.addEventListener("click", () => {
        phaseBShortcutCapture = action.id;
        phaseBSetShortcutMessage(
          `Press a key for ${action.label}. Backspace clears it.`
        );
        phaseBRenderShortcutSettings();
      });

      row.append(label, keyButton);
      refs.shortcutList.append(row);
    }
  }

  function phaseBOpenShortcutSettings() {
    const refs = phaseBRefs();
    phaseBShortcutCapture = null;
    phaseBSetShortcutMessage("");
    phaseBRenderShortcutSettings();
    if (refs.shortcutOverlay) refs.shortcutOverlay.hidden = false;
  }

  function phaseBCloseShortcutSettings() {
    const refs = phaseBRefs();
    phaseBShortcutCapture = null;
    if (refs.shortcutOverlay) refs.shortcutOverlay.hidden = true;
    phaseBSetShortcutMessage("");
  }

  function phaseBCaptureShortcut(event) {
    if (!phaseBShortcutCapture) return false;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Backspace" || event.key === "Delete") {
      phaseBShortcutBindings[phaseBShortcutCapture] = "";
      phaseBSaveShortcutBindings();
      phaseBShortcutCapture = null;
      phaseBSetShortcutMessage("Shortcut cleared.");
      phaseBRenderShortcutSettings();
      return true;
    }

    if (event.key === "Escape") {
      phaseBShortcutCapture = null;
      phaseBSetShortcutMessage("Shortcut change cancelled.");
      phaseBRenderShortcutSettings();
      return true;
    }

    const key = phaseBNormalizeKey(event);
    if (!key) return true;

    const conflict = PHASE_B_SHORTCUT_ACTIONS.find(
      (action) =>
        action.id !== phaseBShortcutCapture
        && phaseBShortcutBindings[action.id] === key
    );

    if (conflict) {
      phaseBSetShortcutMessage(
        `${key} is already assigned to ${conflict.label}.`,
        true
      );
      return true;
    }

    const actionId = phaseBShortcutCapture;
    phaseBShortcutBindings[actionId] = key;
    phaseBSaveShortcutBindings();
    phaseBShortcutCapture = null;

    const action = PHASE_B_SHORTCUT_ACTIONS.find(
      (item) => item.id === actionId
    );
    phaseBSetShortcutMessage(`${action?.label || "Action"} → ${key}`);
    phaseBRenderShortcutSettings();
    return true;
  }

  function phaseBToggleSettings(force = null) {
    const refs = phaseBRefs();
    if (!refs.settingsButton || !refs.settingsPanel) return;

    const open =
      force === null
        ? refs.settingsPanel.hidden
        : Boolean(force);

    refs.settingsPanel.hidden = !open;
    refs.settingsButton.setAttribute("aria-expanded", String(open));
  }

  function phaseBRenderFocusClasses() {
    const refs = phaseBRefs();
    if (!refs.focusClassStrip) return;

    refs.focusClassStrip.innerHTML = "";
    const regularButtons =
      [...document.querySelectorAll("#classList .class-main")];

    classes.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "phase-b-focus-class";

      if (regularButtons[index]?.classList.contains("active")) {
        button.classList.add("active");
      }

      const dot = document.createElement("span");
      dot.className = "phase-b-focus-dot";
      dot.style.background = item.color;

      const label = document.createElement("span");
      label.textContent = item.name;

      button.append(dot, label);
      button.addEventListener("click", () => {
        regularButtons[index]?.click();
        phaseBRenderFocusClasses();
      });
      refs.focusClassStrip.append(button);
    });
  }

  function phaseBSetFocusClassesOpen(open) {
    const refs = phaseBRefs();
    if (!refs.focusClassesButton || !refs.focusClassStrip) return;

    refs.focusClassStrip.hidden = !open;
    refs.focusClassesButton.setAttribute("aria-expanded", String(open));
    refs.focusClassesButton.textContent = open ? "Classes ▴" : "Classes ▾";

    if (open) phaseBRenderFocusClasses();
  }

  function phaseBSetFocusMode(active) {
    const refs = phaseBRefs();

    phaseBFocusActive = Boolean(active);
    document.body.classList.toggle("phase-b-focus-mode", phaseBFocusActive);

    if (refs.focusControls) refs.focusControls.hidden = !phaseBFocusActive;
    if (refs.focusMenuButton) {
      refs.focusMenuButton.textContent =
        phaseBFocusActive ? "Exit Focus Mode" : "Focus Mode";
    }

    phaseBToggleSettings(false);
    phaseBSetFocusClassesOpen(false);
    if (phaseBFocusActive) phaseBRenderFocusClasses();

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      drawAnnotations();
    });
  }

  function phaseBRectangleBounds(feature) {
    const geometry = feature?.geometry;
    if (
      !geometry
      || geometry.type !== "Polygon"
      || !Array.isArray(geometry.coordinates)
      || geometry.coordinates.length !== 1
    ) return null;

    let points = (geometry.coordinates[0] || []).map((point) => [
      Number(point?.[0]),
      Number(point?.[1]),
    ]);

    if (
      points.length === 5
      && Math.hypot(
        points[0][0] - points[4][0],
        points[0][1] - points[4][1]
      ) < 1e-6
    ) {
      points = points.slice(0, -1);
    }

    if (
      points.length !== 4
      || points.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
    ) return null;

    const vectors = [];
    for (let i = 0; i < 4; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % 4];
      vectors.push([b[0] - a[0], b[1] - a[1]]);
    }

    for (let i = 0; i < 4; i += 1) {
      const a = vectors[i];
      const b = vectors[(i + 1) % 4];
      const lenA = Math.hypot(a[0], a[1]);
      const lenB = Math.hypot(b[0], b[1]);
      if (lenA < 1e-6 || lenB < 1e-6) return null;

      const normalizedDot =
        Math.abs(a[0] * b[0] + a[1] * b[1])
        / (lenA * lenB);

      if (normalizedDot > 1e-4) return null;
    }

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function phaseBSelectedRectangle() {
    if (selectedIds.size !== 1 || !selectedId) return null;
    const feature = findFeature(selectedId);
    const bounds = phaseBRectangleBounds(feature);
    return bounds ? { feature, bounds } : null;
  }

  function phaseBUpdateRectangleAction() {
    const refs = phaseBRefs();
    if (!refs.rectangleAction) return;
    refs.rectangleAction.hidden = !phaseBSelectedRectangle();
  }

  function phaseBFormatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return Math.abs(number - Math.round(number)) < 1e-6
      ? String(Math.round(number))
      : number.toFixed(2);
  }

  function phaseBShowRectangleInfo() {
    const refs = phaseBRefs();
    const selected = phaseBSelectedRectangle();
    if (!selected || !refs.rectangleContent) return;

    const rows = [
      ["X", `${phaseBFormatNumber(selected.bounds.x)} px`],
      ["Y", `${phaseBFormatNumber(selected.bounds.y)} px`],
      ["Width", `${phaseBFormatNumber(selected.bounds.width)} px`],
      ["Height", `${phaseBFormatNumber(selected.bounds.height)} px`],
    ];

    refs.rectangleContent.innerHTML = "";
    for (const [label, value] of rows) {
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const valueElement = document.createElement("strong");
      valueElement.textContent = value;
      refs.rectangleContent.append(labelElement, valueElement);
    }

    if (refs.rectangleOverlay) refs.rectangleOverlay.hidden = false;
  }

  function phaseBDispatchShortcut(actionId) {
    const toolMap = {
      "tool.navigate": "navigate",
      "tool.freehand": "freehand",
      "tool.brush": "brush",
      "tool.polygon": "polygon",
      "tool.rectangle": "rectangle",
      "tool.circle": "circle",
      "tool.wand": "wand",
      "tool.select": "select",
    };

    if (toolMap[actionId]) {
      setMode(toolMap[actionId]);
      return true;
    }

    const reviewButtons = {
      "review.correct": "reviewCorrectButton",
      "review.maybe": "reviewMaybeButton",
      "review.later": "reviewLaterButton",
      "review.delete": "reviewDeleteButton",
    };

    if (reviewButtons[actionId]) {
      if (!reviewState.active) return false;
      document.getElementById(reviewButtons[actionId])?.click();
      return true;
    }

    if (actionId === "polygon.finish") {
      if (mode !== "polygon" || polygonDraft.length < 3) return false;
      finishPolygon();
      return true;
    }

    if (actionId === "focus.toggle") {
      phaseBSetFocusMode(!phaseBFocusActive);
      return true;
    }

    if (actionId === "general.escape") {
      const refs = phaseBRefs();

      toggleFileMenu(false);
      phaseBToggleSettings(false);

      if (refs.shortcutOverlay && !refs.shortcutOverlay.hidden) {
        phaseBCloseShortcutSettings();
        return true;
      }

      if (refs.rectangleOverlay && !refs.rectangleOverlay.hidden) {
        refs.rectangleOverlay.hidden = true;
        return true;
      }

      if (reviewState.active) {
        exitReviewMode();
        return true;
      }

      if (phaseBFocusActive) {
        phaseBSetFocusMode(false);
        return true;
      }

      if (polygonDraft.length) {
        cancelPolygon();
        return true;
      }

      if (circleDraft) {
        cancelCircleDraft();
        return true;
      }

      if (els.infoOverlay) els.infoOverlay.hidden = true;
      return true;
    }

    return false;
  }

  function phaseBHandleKeydown(event) {
    if (phaseBShortcutCapture) {
      phaseBCaptureShortcut(event);
      return;
    }

    if (phaseBTypingTarget(event.target)) return;

    const action =
      phaseBActionForKey(
        phaseBNormalizeKey(event)
      );

    if (!action) return;

    if (phaseBDispatchShortcut(action.id)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function phaseBBindEvents() {
    const refs = phaseBRefs();

    refs.settingsButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      phaseBToggleSettings();
    });

    refs.settingsPanel?.addEventListener(
      "click",
      (event) => event.stopPropagation()
    );

    refs.focusMenuButton?.addEventListener(
      "click",
      () => phaseBSetFocusMode(!phaseBFocusActive)
    );

    refs.shortcutsMenuButton?.addEventListener("click", () => {
      phaseBToggleSettings(false);
      phaseBOpenShortcutSettings();
    });

    refs.focusClassesButton?.addEventListener("click", () => {
      phaseBSetFocusClassesOpen(refs.focusClassStrip?.hidden !== false);
    });

    refs.exitFocusButton?.addEventListener(
      "click",
      () => phaseBSetFocusMode(false)
    );

    refs.closeShortcutsButton?.addEventListener(
      "click",
      phaseBCloseShortcutSettings
    );

    refs.resetShortcutsButton?.addEventListener("click", () => {
      phaseBShortcutBindings = phaseBShortcutDefaults();
      phaseBSaveShortcutBindings();
      phaseBShortcutCapture = null;
      phaseBSetShortcutMessage("Default shortcuts restored.");
      phaseBRenderShortcutSettings();
    });

    refs.shortcutOverlay?.addEventListener("click", (event) => {
      if (event.target === refs.shortcutOverlay) {
        phaseBCloseShortcutSettings();
      }
    });

    refs.rectangleInfoButton?.addEventListener(
      "click",
      phaseBShowRectangleInfo
    );

    refs.closeRectangleButton?.addEventListener("click", () => {
      if (refs.rectangleOverlay) refs.rectangleOverlay.hidden = true;
    });

    refs.rectangleOverlay?.addEventListener("click", (event) => {
      if (event.target === refs.rectangleOverlay) {
        refs.rectangleOverlay.hidden = true;
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".phase-b-settings-menu")) {
        phaseBToggleSettings(false);
      }
    });

    phaseBBindPhaseCEvents();
    phaseDBindEvents();
  }

  function setMode(nextMode) {
    // Phase D3.3.1 clear structural selection on normal Select
    if (
      nextMode === "select"
      && phaseDActiveRole !== "roi"
      && selectedFeatures().some(
        (feature) =>
          !phaseDIsAnnotationFeature(
            feature
          )
      )
    ) {
      clearSelectedFeatures(false);
    }

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
    phaseBUpdateRectangleAction();
    phaseCUpdateWorkflowAction();
    phaseDUpdateRoiUi();
    phaseIL11UpdateFocusModeControl();
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
    const viewerPosition = viewerPositionFromPointer(event);

    if (mode === "select") {
      return imagePointFromViewerPosition(viewerPosition);
    }

    return phaseGClampedImagePointFromViewerPosition(viewerPosition);
  }

  function handlePointerDown(event) {
    trackPenLifecycle(event);
    if (suppressPalmTouch(event)) return;
    if (!captureAnnotationEvent(event)) {
      updateDiagnostics();
      return;
    }
    const viewerPosition = viewerPositionFromPointer(event);
    const rawPoint = imagePointFromViewerPosition(viewerPosition);
    if (!rawPoint || !phaseGPointInsideImage(rawPoint)) return;
    const point = mode === "select"
      ? rawPoint
      : phaseGClampPointToImage(rawPoint);
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

  // Standard Freehand gestures staying within this screen-space radius
  // are treated as selection taps rather than drawings.
  const FREEHAND_TAP_THRESHOLD_PX = 6;
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
        const id =
          phaseDHitTestNormalAnnotation(
            draft.points[
              draft.points.length - 1
            ]
            || draft.points[0]
          );
        if (draft.additive) {
          const selectableId =
            (
              id
              && (
                phaseDActiveRole === "roi"
                || phaseDIsAnnotationFeature(
                  findFeature(id)
                )
              )
            )
              ? id
              : null;

          if (
            selectableId
            && selectedIds.has(
              String(selectableId)
            )
          ) {
            selectedIds.delete(
              String(selectableId)
            );
          } else if (selectableId) {
            selectedIds.add(
              String(selectableId)
            );
          }
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
        const ids = await requestGeometrySelection(
          polygonGeometry(regionPoints),
          (
            phaseDActiveRole === "roi"
              ? featureCollection.features
              : featureCollection.features.filter(
                  phaseDIsAnnotationFeature
                )
          ).map(
            (feature) => ({
              id: featureId(feature),
              geometry: feature.geometry,
            })
          )
        );
        if (draft.additive) setMultiSelection([...new Set([...selectedIds, ...ids])], selectedId);
        else setMultiSelection(ids);
        const feature = selectedId ? findFeature(selectedId) : null;
        syncCurrentClassFromFeature(feature);
        setStatus(ids.length ? `${ids.length} annotations selected` : "No annotations intersect the selection area", ids.length ? "saved" : "local");
      } catch (error) { setStatus(`Selection error: ${error.message}`, "error"); }
      finally { geometryBusy = false; updateControls(); drawAnnotations(); }
      return;
    }

    if (draft.type === "freehand") {
      const origin = draft.points[0];
      const originScreen = origin ? screenPointFromImage(origin) : null;
      let maxTravelPx = 0;

      if (originScreen) {
        for (const point of draft.points) {
          const screen = screenPointFromImage(point);
          if (!screen) continue;
          maxTravelPx = Math.max(
            maxTravelPx,
            Math.hypot(
              screen.x - originScreen.x,
              screen.y - originScreen.y
            )
          );
        }
      }

      if (maxTravelPx <= FREEHAND_TAP_THRESHOLD_PX) {
        const tapPoint =
          draft.points[draft.points.length - 1]
          || draft.points[0];

        const id =
          phaseDHitTestNormalAnnotation(
            tapPoint
          );
        // A Freehand tap is an intentional selection. With Phase A1,
        // setSingleSelection() also clears the implicit "just drawn" marker.
        setSingleSelection(id);

        const feature =
          selectedId ? findFeature(selectedId) : null;
        syncCurrentClassFromFeature(feature);
        updateControls();
        drawAnnotations();
        return;
      }
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

  function geometryToClippingInput(geometry) {
    if (!geometry) {
      throw new Error("Missing geometry");
    }

    if (geometry.type === "Polygon") {
      return geometry.coordinates;
    }

    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates;
    }

    throw new Error(
      `Unsupported geometry type: ${geometry.type || "unknown"}`
    );
  }

  function clippingResultToGeometry(result) {
    if (!Array.isArray(result) || result.length === 0) {
      return null;
    }

    // polygon-clipping always returns MultiPolygon coordinates.
    // Convert a single polygon back to normal GeoJSON Polygon.
    if (result.length === 1) {
      return {
        type: "Polygon",
        coordinates: result[0],
      };
    }

    return {
      type: "MultiPolygon",
      coordinates: result,
    };
  }

  function localBooleanGeometry(subject, operand, operation) {
    const engine = window.polygonClipping;

    if (!engine) {
      throw new Error(
        "Offline geometry engine is unavailable"
      );
    }

    const a = geometryToClippingInput(subject);
    const b = geometryToClippingInput(operand);

    const normalizedOperation = ({
      add: "union",
      union: "union",
      subtract: "difference",
      difference: "difference",
      intersect: "intersection",
      intersection: "intersection",
    })[operation] || "difference";

    let result;

    if (normalizedOperation === "union") {
      result = engine.union(a, b);

    } else if (normalizedOperation === "intersection") {
      result = engine.intersection(a, b);

    } else {
      result = engine.difference(a, b);
    }

    return clippingResultToGeometry(result);
  }

  async function requestBooleanGeometry(subject, operand, operation) {
    // If Android already knows the server is unavailable,
    // perform the operation locally without waiting for timeout.
    if (
      IS_NATIVE &&
      serverReachable === false &&
      window.polygonClipping
    ) {
      return localBooleanGeometry(
        subject,
        operand,
        operation
      );
    }

    try {
      const response = await apiFetch(
        `${API}/geometry/boolean`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            subject,
            operand,
            operation: ({
              add: "union",
              union: "union",
              subtract: "difference",
              difference: "difference",
              intersect: "intersection",
              intersection: "intersection"
            })[operation] || "difference",

            simplifyTolerance:
              Math.max(
                0.05,
                screenToleranceToImage(0.18)
              ),
          }),
          timeoutMs: 3500,
        }
      );

      const payload = await response.json();
      return payload.geometry || null;

    } catch (error) {
      // Android fallback:
      // if the server/VPN disappears, repeat the same operation locally.
      if (
        IS_NATIVE &&
        window.polygonClipping
      ) {
        console.warn(
          "Server geometry unavailable; using local geometry engine",
          error
        );

        return localBooleanGeometry(
          subject,
          operand,
          operation
        );
      }

      throw error;
    }
  }

  function phaseBGeometryRings(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates || [];
    if (geometry.type === "MultiPolygon") {
      return (geometry.coordinates || []).flatMap((polygon) => polygon || []);
    }
    return [];
  }

  function phaseBPointOnSegment(point, a, b, epsilon = 1e-7) {
    const [px, py] = point;
    const [ax, ay] = a;
    const [bx, by] = b;
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (Math.abs(cross) > epsilon) return false;
    const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
    if (dot < -epsilon) return false;
    const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
    if (dot - lengthSq > epsilon) return false;
    return true;
  }

  function phaseBSegmentsTouch(a, b, c, d, epsilon = 1e-7) {
    const orient = (p, q, r) =>
      (q[0] - p[0]) * (r[1] - p[1])
      - (q[1] - p[1]) * (r[0] - p[0]);

    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);

    if (
      ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
      && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))
    ) {
      return true;
    }

    return (
      (Math.abs(o1) <= epsilon && phaseBPointOnSegment(c, a, b, epsilon))
      || (Math.abs(o2) <= epsilon && phaseBPointOnSegment(d, a, b, epsilon))
      || (Math.abs(o3) <= epsilon && phaseBPointOnSegment(a, c, d, epsilon))
      || (Math.abs(o4) <= epsilon && phaseBPointOnSegment(b, c, d, epsilon))
    );
  }

  function phaseBBoundariesTouch(geometryA, geometryB) {
    const ringsA = phaseBGeometryRings(geometryA);
    const ringsB = phaseBGeometryRings(geometryB);

    for (const ringA of ringsA) {
      if (!Array.isArray(ringA) || ringA.length < 2) continue;
      for (let i = 0; i < ringA.length - 1; i += 1) {
        const a = ringA[i];
        const b = ringA[i + 1];

        for (const ringB of ringsB) {
          if (!Array.isArray(ringB) || ringB.length < 2) continue;
          for (let j = 0; j < ringB.length - 1; j += 1) {
            if (phaseBSegmentsTouch(a, b, ringB[j], ringB[j + 1])) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  function localSelectGeometries(region, features) {
    const engine = window.polygonClipping;

    if (!engine) {
      throw new Error(
        "Offline geometry engine is unavailable"
      );
    }

    const regionInput =
      geometryToClippingInput(region);

    const ids = [];

    for (const item of features || []) {
      if (!item?.geometry) continue;

      try {
        const geometryInput =
          geometryToClippingInput(
            item.geometry
          );

        const overlap =
          engine.intersection(
            geometryInput,
            regionInput
          );

        const hasAreaIntersection =
          Array.isArray(overlap)
          && overlap.length > 0;

        const touchesBoundary =
          !hasAreaIntersection
          && phaseBBoundariesTouch(
            item.geometry,
            region
          );

        if (hasAreaIntersection || touchesBoundary) {
          ids.push(String(item.id));
        }

      } catch (error) {
        console.warn(
          "Local selection test failed",
          item?.id,
          error
        );
      }
    }

    return ids;
  }

  async function requestGeometrySelection(region, features) {
    if (
      IS_NATIVE &&
      serverReachable === false &&
      window.polygonClipping
    ) {
      return localSelectGeometries(
        region,
        features
      );
    }

    try {
      const response = await apiFetch(
        `${API}/geometry/select`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            region,
            features,
          }),
          timeoutMs: 3500,
        }
      );

      const payload = await response.json();

      return Array.isArray(payload.ids)
        ? payload.ids.map(String)
        : [];

    } catch (error) {
      if (
        IS_NATIVE &&
        window.polygonClipping
      ) {
        console.warn(
          "Server selection unavailable; using local geometry engine",
          error
        );

        return localSelectGeometries(
          region,
          features
        );
      }

      throw error;
    }
  }

  function createAnnotationFeature(
    geometry,
    options = {}
  ) {
    const role =
      phaseDCanonicalRole(
        options.role
        || "annotation"
      );

    if (role === "roi") {
      return phaseDCreateTissueRoiFeature(
        geometry,
        options.source
        || "manual",
        options.detector
        || null
      );
    }

    return {
      type: "Feature",
      id: uid(),
      geometry: deepClone(geometry),
      properties: {
        objectType: "annotation",
        classification: {
          name: currentClass.name,
          color:
            hexToRgbArray(
              currentClass.color
            ),
        },
        isLocked: false,
        histoannotator:
          phaseCCreateMetadata(
            role
          ),
      },
    };
  }

  async function commitGeometry(geometry, metadata = {}, operation = editOperation) {
    if (!geometry) return false;
    if (!requireSelectedForOperation(operation)) return false;

geometry = await phaseGClipGeometryToImage(geometry);

if (!geometry) {
  setStatus(
    "The annotation is outside the image and was not created",
    "local"
  );
  return false;
}

    if (operation === "new") {
      if (phaseDActiveRole === "roi") {
        const existingRoi =
          phaseDTissueRoiFeature();

        if (existingRoi) {
          const merged =
            await requestBooleanGeometry(
              existingRoi.geometry,
              geometry,
              "union"
            );

          if (!merged) {
            setStatus(
              "The Tissue ROI could not be extended",
              "error"
            );
            return false;
          }

          pushUndo();

          existingRoi.geometry =
            merged;

          phaseCFinalizeGeometryEdit(
            existingRoi
          );

          existingRoi.properties
            .histoannotator.roi = {
              kind: "tissue",
              source: "manual",
            };

          setSingleSelection(
            String(
              featureId(
                existingRoi
              )
            ),
            true
          );
        } else {
          pushUndo();

          const feature =
            createAnnotationFeature(
              geometry,
              {
                role: "roi",
                source: "manual",
              }
            );

          featureCollection.features.push(
            feature
          );

          setSingleSelection(
            String(feature.id),
            true
          );
        }

        markChanged();

        phaseDUpdateRoiUi();

        phaseDLoadBorderControlsFromRoi();
        phaseDRefreshBorderPreview({
          saveConfig: false,
          quiet: true,
        });

        setStatus(
          "Tissue ROI updated",
          "saved"
        );

        return true;
      }

      pushUndo();
      const feature = createAnnotationFeature(geometry);
      featureCollection.features.push(feature);
      // Keep the newest annotation selected for rapid Shift + Add/Subtract,
      // but mark that automatic selection as implicit.
      setSingleSelection(String(feature.id), true);
      markChanged();
      setStatus(`${metadata.tool || "Area"} annotation created`, "saved");
      return true;
    }

    const feature = findFeature(selectedId);
    if (!feature) return false;
    setStatus(operation === "add" ? "Adding to selected annotation…" : "Subtracting from selected annotation…");
    let result = await requestBooleanGeometry(feature.geometry, geometry, operation);
    if (result) result = await phaseGClipGeometryToImage(result);
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
      phaseCFinalizeGeometryEdit(feature);

      if (phaseDIsTissueRoi(feature)) {
        feature.properties
          .histoannotator.roi.source =
            "manual-edited";

        phaseDLoadBorderControlsFromRoi();
        phaseDRefreshBorderPreview({
          saveConfig: false,
          quiet: true,
        });
      }

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
      phaseCFinalizeGeometryEdit(primary);
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
    phaseCCaptureSemanticBaseline();
    undoStack.push(deepClone(featureCollection.features));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateControls();
  }

  function undo() {
    if (!undoStack.length) return;
    phaseCCaptureSemanticBaseline();
    redoStack.push(deepClone(featureCollection.features));
    featureCollection.features = undoStack.pop();
    clearSelectedFeatures(false);
    markChanged();
  }

  function redo() {
    if (!redoStack.length) return;
    phaseCCaptureSemanticBaseline();
    undoStack.push(deepClone(featureCollection.features));
    featureCollection.features = redoStack.pop();
    clearSelectedFeatures(false);
    markChanged();
  }

  function markChanged() {
    phaseIL1AnnotationsChanged();
    phaseDSyncArtifactRoles();
    phaseCApplySemanticChanges();
    if (!currentImage) return;

    dirty = true;
    const image = currentImage;
    const annotationFile = currentAnnotationFile;
    const payload = deepClone(featureCollection);
    const revision = nextLocalRevision();
    currentPendingChangeCount += 1;

    localDraftState = "Saving locally…";
    updateControls();
    drawAnnotations();
    updateDiagnostics();

    // Local durability starts immediately. Drawing never awaits this promise.
    void persistLocalDraft(
      true,
      image,
      payload,
      {
        annotationFile,
        localRevision: revision,
        lastSyncedRevision: currentLastSyncedRevision,
        pendingChangeCount: currentPendingChangeCount,
      }
    ).then((saved) => {
      if (!saved && currentDocumentKey() === localDraftKey(image.id, annotationFile)) {
        setStatus("Could not persist annotations locally", "error");
      }
    });

    setStatus(
      image.localNative
        ? "Saving annotations locally…"
        : "Saved locally first; server sync will follow automatically…",
      "local"
    );

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveAnnotations(false), 1200);
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (navigator.onLine) syncAllPendingDrafts(false);
    }, 10000);
  }

  async function saveAnnotations(showConfirmation = true) {
    if (!currentImage || !dirty) return;
    clearTimeout(saveTimer);

    const image = currentImage;
    const annotationFile = currentAnnotationFile;
    const payload = deepClone(featureCollection);
    const revision = currentLocalRevision;
    const draftKey = localDraftKey(image.id, annotationFile);

    const savedLocally = await persistLocalDraft(
      true,
      image,
      payload,
      {
        annotationFile,
        localRevision: revision,
        lastSyncedRevision: currentLastSyncedRevision,
        pendingChangeCount: currentPendingChangeCount,
      }
    );

    if (!savedLocally) {
      setStatus(
        "Local annotation save failed; server sync was not attempted",
        "error"
      );
      return;
    }

    if (image.localNative) {
      if (currentDocumentKey() === draftKey && currentLocalRevision === revision) {
        dirty = false;
        currentPendingChangeCount = 0;
        localDraftState = "Saved locally";
        updateControls();
        updateDiagnostics();
      }
      if (showConfirmation) {
        setStatus(
          `Saved locally: ${payload.features?.length || 0} annotations`,
          "saved"
        );
      }
      return;
    }

    if (IS_NATIVE && !API) {
      if (currentDocumentKey() === draftKey && currentLocalRevision === revision) {
        dirty = false;
        localDraftState = "Saved locally · sync pending";
        updateControls();
        updateDiagnostics();
      }
      if (showConfirmation) {
        setStatus("Saved locally · no server configured", "local");
      }
      return;
    }

    if (!navigator.onLine) {
      if (currentDocumentKey() === draftKey) {
        localDraftState = "Saved locally · sync pending";
        updateDiagnostics();
      }
      if (showConfirmation) {
        setStatus(
          "Offline: annotations are safe on this device and waiting to sync",
          "local"
        );
      }
      scheduleRetry();
      return;
    }

    const job = {
      draftKey,
      image: {
        id: image.id,
        name: image.name,
        relativePath: image.relativePath,
        localNative: false,
      },
      annotationFile,
      payload,
      revision,
    };

    try {
      await enqueueAnnotationSync(job, showConfirmation);
    } catch (error) {
      if (currentDocumentKey() === draftKey) {
        localDraftState = "Saved locally · sync pending";
        updateDiagnostics();
      }
      setStatus(
        `Saved on this device; server sync pending: ${error.message}`,
        "local"
      );
      scheduleRetry();
    }
  }
  function updateControls() {
    const enabled = Boolean(currentImage);
    els.saveButton.disabled = !enabled || !dirty || geometryBusy;
    els.exportButton.disabled = !enabled;
    if (els.shareGeoJsonButton) els.shareGeoJsonButton.disabled = !enabled;
    els.importGeoJsonButton.disabled = !enabled;
    els.downloadOriginalButton.disabled = !enabled || Boolean(currentImage?.localNative);
    if (els.downloadOfflineButton) els.downloadOfflineButton.disabled = !enabled || !currentInfo || Boolean(currentImage?.localNative);
    els.imageInfoButton.disabled = !enabled;
    if (els.annotationStatsButton) els.annotationStatsButton.disabled = !enabled || featureCollection.features.length === 0 || Boolean(currentImage?.localNative);
    if (els.fillUnannotatedButton) els.fillUnannotatedButton.disabled = !enabled || !currentInfo || geometryBusy || Boolean(currentImage?.localNative);
    if (els.reviewModeButton) els.reviewModeButton.disabled = !enabled || featureCollection.features.length === 0;
    const phaseCWorkflowSummaryButton = document.getElementById("phaseCWorkflowSummaryButton");
    if (phaseCWorkflowSummaryButton) phaseCWorkflowSummaryButton.disabled = !enabled || featureCollection.features.length === 0;
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
    const annotationCount =
      (
        featureCollection.features
        || []
      ).filter(
        phaseDIsAnnotationFeature
      ).length;

    els.featureCount.textContent = String(annotationCount);
    els.annotationSummary.textContent = `${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`;
    renderClassButtons();
    setEditOperation(editOperation);
    updatePolygonActions();
    updateCircleActions();
    updateSelectionActions();
    phaseBUpdateRectangleAction();
    phaseCUpdateWorkflowAction();
    phaseDUpdateRoiUi();
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
    if (els.deleteAnnotationFileButton) {
      els.deleteAnnotationFileButton.disabled =
        !currentImage
        || String(currentAnnotationFile || "Default").toLowerCase() === "default";
    }
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
      const deletedMeta = await getMeta(`deletedAnnotationFiles:${imageId}`);
      const deletedNames = new Set(Array.isArray(deletedMeta) ? deletedMeta : []);
      const drafts = (await idbGetAll(DB_STORE))
        .filter((record) => record?.sourceImageId === imageId)
        .map((record) => record.annotationFile || "Default")
        .filter((name) => !deletedNames.has(name));
      annotationFiles = Array.from(
        new Set(["Default", ...(Array.isArray(cached) ? cached : []), ...drafts])
      ).filter(
        (name) => String(name).toLowerCase() === "default" || !deletedNames.has(name)
      );
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
    restoreCurrentRevisionState(localDraft);
    let serverCollection = null;
    if (!currentImage.localNative) {
      try {
        const response = await apiFetch(`${API}/annotations/${currentImage.id}?file=${encodeURIComponent(currentAnnotationFile)}`);
        serverCollection = normalizeFeatureCollectionClient(await response.json());
      } catch (_) { /* offline or VPN unavailable */ }
    }
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
    const deletedFileMeta = await getMeta(`deletedAnnotationFiles:${currentImage.id}`);
    const deletedFileNames = Array.isArray(deletedFileMeta) ? deletedFileMeta : [];
    if (deletedFileNames.includes(name)) {
      await putMeta(
        `deletedAnnotationFiles:${currentImage.id}`,
        deletedFileNames.filter((item) => item !== name)
      );
    }
    if (!annotationFiles.includes(name)) annotationFiles.push(name);
    currentAnnotationFile = name;
    await putMeta(`files:${currentImage.id}`, annotationFiles);
    renderAnnotationFileOptions();
    featureCollection = { type: "FeatureCollection", features: [] };
    currentLocalRevision = 0;
    currentLastSyncedRevision = 0;
    currentPendingChangeCount = 0;
    dirty = false; localDraftState = navigator.onLine ? "New local file" : "Offline local file";
    await persistLocalDraft(false, currentImage, featureCollection);
    drawAnnotations(); updateControls(); updateDiagnostics();
    if (navigator.onLine && API && !currentImage.localNative) {
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


  async function deleteCurrentAnnotationFile() {
    if (!currentImage) return;

    const name = String(currentAnnotationFile || "Default").trim() || "Default";
    if (name.toLowerCase() === "default") {
      setStatus("The Default annotation file cannot be deleted", "error");
      return;
    }

    if (dirty || Number(currentPendingChangeCount || 0) > 0) {
      setStatus(
        "Sync/save this annotation file before deleting it, so a pending background save cannot recreate it.",
        "error"
      );
      return;
    }

    if (!currentImage.localNative && !navigator.onLine) {
      setStatus("Server connection is required to delete a synced annotation file", "error");
      return;
    }

    const confirmed = window.confirm(
      `Delete annotation file "${name}"?\n\n`
      + "This removes the GeoJSON annotation file and its server backup. This action is not part of annotation Undo."
    );
    if (!confirmed) return;

    clearTimeout(saveTimer);

    try {
      let filesAfterDelete = annotationFiles.filter((item) => item !== name);

      if (!currentImage.localNative) {
        const response = await apiFetch(
          `${API}/annotations/${currentImage.id}/files?file=${encodeURIComponent(name)}`,
          { method: "DELETE", timeoutMs: 30000 }
        );
        const payload = await response.json();
        if (Array.isArray(payload.files)) filesAfterDelete = payload.files;
      }

      const deletedMeta = await getMeta(`deletedAnnotationFiles:${currentImage.id}`);
      const deletedNames = Array.isArray(deletedMeta) ? deletedMeta : [];
      if (!deletedNames.includes(name)) deletedNames.push(name);
      await putMeta(`deletedAnnotationFiles:${currentImage.id}`, deletedNames);

      annotationFiles = Array.from(new Set(["Default", ...filesAfterDelete]));
      await putMeta(`files:${currentImage.id}`, annotationFiles);
      currentAnnotationFile = "Default";
      renderAnnotationFileOptions();
      await loadSelectedAnnotationFile("Default");
      setStatus(`Annotation file "${name}" deleted`, "saved");
    } catch (error) {
      setStatus(`Could not delete annotation file: ${error.message}`, "error");
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
    let nativeLocalImages = [];

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

      nativeLocalImages = await nativeLocalCatalogImages();
      images = mergeKnownImages(catalog, packageImages, nativeLocalImages);

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

    if (IS_NATIVE && !API) {
      serverReachable = false;
      setStatus(
        images.length
          ? `${images.length} cached/offline file${images.length === 1 ? "" : "s"} available · no server configured`
          : "No server configured · use File → Connection settings",
        "local"
      );
      return;
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
        remoteImages,
        nativeLocalImages
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

      // Since the backend may be remote, expose the exact error directly
      // on the Android tablet during alpha testing.
      if (IS_NATIVE && !images.length) {
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

      if (images.length) {
        setStatus(
          `Offline: ${images.length} local file${images.length === 1 ? "" : "s"} available`,
          "local"
        );
      } else {
        setStatus(
          `Files error: ${diagnosticStage} · ${errorMessage}`,
          "error"
        );
      }
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

  function mergeAnnotationFileNames(...collections) {
    const names = new Set(["Default"]);
    for (const collection of collections) {
      for (const raw of collection || []) {
        const name = String(raw || "").trim();
        if (name) names.add(name);
      }
    }
    return [...names];
  }

  async function refreshDownloadedImageAnnotations(imageId, sequence) {
    if (
      !imageId
      || !currentImage
      || currentImage.id !== imageId
      || currentImage.localNative
      || !currentImageUsesOfflineCopy
      || !navigator.onLine
      || !API
    ) {
      return false;
    }

    try {
      const filesResponse = await apiFetch(
        `${API}/annotations/${imageId}/files`,
        { timeoutMs: 7000 }
      );
      const filesPayload = await filesResponse.json();
      const serverFiles =
        Array.isArray(filesPayload?.files) && filesPayload.files.length
          ? filesPayload.files
          : ["Default"];

      if (sequence !== openSequence || currentImage?.id !== imageId) {
        return false;
      }

      const cachedFiles = await getMeta(`files:${imageId}`);
      annotationFiles = mergeAnnotationFileNames(
        serverFiles,
        annotationFiles,
        Array.isArray(cachedFiles) ? cachedFiles : []
      );

      if (!annotationFiles.includes(currentAnnotationFile)) {
        currentAnnotationFile = "Default";
      }

      renderAnnotationFileOptions();
      await putMeta(`files:${imageId}`, deepClone(annotationFiles));

      const imageMeta = await getMeta(`image:${imageId}`);
      if (imageMeta) {
        imageMeta.annotationFiles = deepClone(annotationFiles);
        await putMeta(`image:${imageId}`, imageMeta);
      }

      serverReachable = true;
      localDraftState = currentSyncPending()
        ? "Local copy · Connected · sync pending"
        : "Local copy · Connected";
      updateDiagnostics();

      // Local pending work always wins and syncs before remote refresh.
      await syncAllPendingDrafts(false);

      // Cache every server file that is not protected by a newer/pending
      // local draft. This makes newly discovered files available offline.
      for (const annotationFile of serverFiles) {
        if (sequence !== openSequence || currentImage?.id !== imageId) {
          return false;
        }

        const before = await getLocalDraft(imageId, annotationFile);
        if (before?.pending) continue;

        const beforeRevision = Math.max(
          0,
          Number(before?.localRevision || 0)
        );
        const isCurrent =
          annotationFile === currentAnnotationFile
          && currentImage?.id === imageId;
        const liveRevisionBefore = isCurrent
          ? currentLocalRevision
          : null;

        let serverCollection;
        try {
          const response = await apiFetch(
            `${API}/annotations/${imageId}?file=${encodeURIComponent(annotationFile)}`,
            { timeoutMs: 10000 }
          );
          serverCollection = normalizeFeatureCollectionClient(
            await response.json()
          );
        } catch (error) {
          console.warn(
            `Could not refresh annotation file ${annotationFile}`,
            error
          );
          continue;
        }

        // The user may have edited while the request was in flight.
        const latest = await getLocalDraft(imageId, annotationFile);
        const latestRevision = Math.max(
          0,
          Number(latest?.localRevision || 0)
        );
        const liveChanged =
          isCurrent
          && (
            dirty
            || currentLocalRevision !== liveRevisionBefore
          );

        if (
          latest?.pending
          || latestRevision > beforeRevision
          || liveChanged
        ) {
          continue;
        }

        const syncedRevision = Math.max(
          beforeRevision,
          Number(latest?.lastSyncedRevision || 0)
        );

        await persistLocalDraft(
          false,
          currentImage,
          serverCollection,
          {
            annotationFile,
            localRevision: syncedRevision,
            lastSyncedRevision: syncedRevision,
          }
        );

        if (
          isCurrent
          && sequence === openSequence
          && currentImage?.id === imageId
          && !dirty
          && currentLocalRevision === liveRevisionBefore
        ) {
          featureCollection = deepClone(serverCollection);
          featureCollection.features.forEach(featureId);
          const refreshedRecord =
            await getLocalDraft(imageId, annotationFile);
          restoreCurrentRevisionState(refreshedRecord);
          clearSelectedFeatures(false);
          undoStack = [];
          redoStack = [];
          drawAnnotations();
          updateControls();
        }
      }

      if (sequence === openSequence && currentImage?.id === imageId) {
        localDraftState = currentSyncPending()
          ? "Local copy · Connected · sync pending"
          : "Local copy · Connected · Synced";
        updateDiagnostics();
        setStatus(
          `Local image · ${annotationFiles.length} annotation file${
            annotationFiles.length === 1 ? "" : "s"
          } available`,
          "saved"
        );
      }

      return true;
    } catch (error) {
      serverReachable = false;
      if (sequence === openSequence && currentImage?.id === imageId) {
        localDraftState = currentSyncPending()
          ? "Local copy · Offline · sync pending"
          : "Local copy · Offline";
        updateDiagnostics();
      }
      console.warn(
        "Downloaded-image annotation refresh unavailable",
        error
      );
      return false;
    }
  }

  async function openImage(imageId) {
    if (reviewState.active) exitReviewMode();
    const sequence = ++openSequence;
    currentImageUsesOfflineCopy = false;
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

    if (currentImage?.localNative) {
      await openNativeLocalTiff(currentImage, sequence);
      return;
    }
    configureLocalTiffViewer(false);
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
      currentImageUsesOfflineCopy = preferOffline;

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
        const refreshedCachedFiles = await getMeta(`files:${imageId}`);
        annotationFiles = mergeAnnotationFileNames(
          offlinePackage.annotationFiles || [],
          cachedRecord?.annotationFiles || [],
          Array.isArray(refreshedCachedFiles) ? refreshedCachedFiles : []
        );
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
      restoreCurrentRevisionState(localDraft);
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

      renderChannelControls();
      viewer.open(buildViewerSource(imageId, currentInfo));
      els.dimensions.textContent = `${currentInfo.width} × ${currentInfo.height}`;
      await cacheCurrentImageMetadata();
      updateControls();
      updateDiagnostics();

      if (preferOffline && navigator.onLine && API) {
        // Do not await: local pixels are already open. Refresh annotations
        // independently so a downloaded image never freezes an old catalog.
        void refreshDownloadedImageAnnotations(imageId, sequence);
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
    if (
      reviewState.active
      && String(featureId(feature))
        !== String(reviewState.currentId || "")
    ) {
      return;
    }
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
    if (annotationsVisible) {
      const drawableFeatures = reviewState.active
        ? (reviewState.currentId ? [findFeature(reviewState.currentId)].filter(Boolean) : [])
        : featureCollection.features;

      drawableFeatures.forEach((feature) => {
        if (!phaseDIsTissueRoi(feature)) {
          drawGeometry(feature);
          return;
        }

        const previousFilled =
          annotationsFilled;

        const borderConfig =
          phaseDBorderConfigForRoi(feature);

        const effectivePreview =
          phaseDEffectivePreviewForRoi(feature);

        const hasReduction =
          borderConfig.enabled
          && borderConfig.percent > 0;

        try {
          if (
            hasReduction
            && effectivePreview?.geometry
          ) {
            // Base/original Tissue ROI:
            // dashed reference outline.
            ctx.save();
            ctx.setLineDash([7, 5]);
            annotationsFilled = false;
            drawGeometry(feature);
            ctx.restore();

            // Effective/analysis ROI:
            // solid outline; filled only while editing.
            const effectiveFeature =
              deepClone(feature);

            effectiveFeature.id =
              `${featureId(feature)}::effective-roi`;

            effectiveFeature.geometry =
              deepClone(effectivePreview.geometry);

            ctx.save();
            ctx.setLineDash([]);
            annotationsFilled =
              phaseDActiveRole === "roi";
            drawGeometry(effectiveFeature);
            ctx.restore();
          } else {
            // No reduction: only one ROI.
            ctx.save();
            ctx.setLineDash([]);
            annotationsFilled =
              phaseDActiveRole === "roi";
            drawGeometry(feature);
            ctx.restore();

            if (
              hasReduction
              && !effectivePreview?.geometry
            ) {
              phaseDEnsureStoredEffectivePreview();
            }
          }
        } finally {
          annotationsFilled =
            previousFilled;
          ctx.setLineDash([]);
        }
      });
    }
    phaseIL1DrawSuggestions();
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
    phaseDDrawFillUnannotatedPreview();
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

  function zoomToReviewFeature(feature) {
    if (
      !viewer
      || !viewer.world.getItemCount()
      || !feature?.geometry
    ) {
      return;
    }

    const bounds = geometryBounds(feature.geometry);
    if (!bounds) return;

    const imageWidth = Math.max(
      1,
      Number(currentInfo?.width) || bounds.maxX
    );
    const imageHeight = Math.max(
      1,
      Number(currentInfo?.height) || bounds.maxY
    );

    const annotationWidth = Math.max(
      1,
      bounds.maxX - bounds.minX
    );
    const annotationHeight = Math.max(
      1,
      bounds.maxY - bounds.minY
    );

    // Keep the current ~12% padding for large annotations, while
    // guaranteeing useful tissue context around very small/cell-sized ROIs.
    const targetWidth = Math.min(
      imageWidth,
      Math.max(1024, annotationWidth * 1.24)
    );
    const targetHeight = Math.min(
      imageHeight,
      Math.max(1024, annotationHeight * 1.24)
    );

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const x = Math.max(
      0,
      Math.min(
        imageWidth - targetWidth,
        centerX - targetWidth / 2
      )
    );
    const y = Math.max(
      0,
      Math.min(
        imageHeight - targetHeight,
        centerY - targetHeight / 2
      )
    );

    const item = viewer.world.getItemAt(0);
    const topLeft = item.imageToViewportCoordinates(x, y);
    const bottomRight = item.imageToViewportCoordinates(
      x + targetWidth,
      y + targetHeight
    );

    viewer.viewport.fitBounds(
      new OpenSeadragon.Rect(
        topLeft.x,
        topLeft.y,
        Math.max(bottomRight.x - topLeft.x, 0.00001),
        Math.max(bottomRight.y - topLeft.y, 0.00001)
      ),
      false
    );
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

  function getFeatureClassName(feature) {
    return feature?.properties?.classification?.name || "Unclassified";
  }
  function reviewStatus(feature) {
    if (!phaseDIsAnnotationFeature(feature)) {
      return "excluded";
    }

    const workflow =
      phaseCWorkflowForFeature(feature);

    const decision =
      phaseCCanonicalDecision(
        workflow.reviewDecision
      );

    return decision || "pending";
  }

  function setReviewStatus(feature, status) {
    phaseCSetReviewDecision(
      feature,
      status
    );

    if (
      feature?.properties?.[
        REVIEW_PROPERTY
      ]
    ) {
      delete feature.properties[
        REVIEW_PROPERTY
      ];
    }
  }

  function featuresForReviewScope(scope) {
    return (featureCollection.features || []).filter((feature) =>
      feature?.geometry && (scope === "all" || getFeatureClassName(feature) === scope)
    );
  }
  function activeReviewFeatures() {
    const ids = new Set(reviewState.scopeIds.map(String));
    return (featureCollection.features || []).filter((feature) => ids.has(featureId(feature)));
  }
  function populateReviewScopeOptions() {
    const previous = els.reviewScopeSelect?.value || "all";
    const names = [...new Set((featureCollection.features || []).map(getFeatureClassName).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b));
    els.reviewScopeSelect.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all"; all.textContent = "All annotations"; els.reviewScopeSelect.append(all);
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name; option.textContent = name; els.reviewScopeSelect.append(option);
    }
    if ([...els.reviewScopeSelect.options].some((option) => option.value === previous)) els.reviewScopeSelect.value = previous;
  }
  function populateReviewClassSelect(feature) {
    if (!feature) return;
    const current = getFeatureClassName(feature);
    const names = [...new Set([...classes.map((item) => item.name), current])].filter(Boolean).sort((a,b) => a.localeCompare(b));
    els.reviewClassSelect.innerHTML = "";
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name; option.textContent = name; option.selected = name === current; els.reviewClassSelect.append(option);
    }
  }
  function currentReviewFeature() {
    return reviewState.currentId ? findFeature(reviewState.currentId) : null;
  }
  function clearReviewAutoExitTimer() {
    if (reviewAutoExitTimeout) {
      clearTimeout(reviewAutoExitTimeout);
      reviewAutoExitTimeout = null;
    }
    if (reviewAutoExitInterval) {
      clearInterval(reviewAutoExitInterval);
      reviewAutoExitInterval = null;
    }
  }

  function scheduleReviewAutoExit(seconds = 30) {
    clearReviewAutoExitTimer();

    let remaining = Math.max(1, Math.round(seconds));

    const renderCountdown = () => {
      if (!reviewState.active || reviewState.currentId) return;
      if (els.reviewCurrentText) {
        els.reviewCurrentText.textContent = `Review complete - auto exit in ${remaining}s`;
      }
    };

    renderCountdown();

    reviewAutoExitInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) renderCountdown();
    }, 1000);

    reviewAutoExitTimeout = setTimeout(() => {
      if (reviewState.active && !reviewState.currentId) {
        exitReviewMode();
        setStatus("Review mode closed automatically", "saved");
      }
    }, remaining * 1000);
  }

  function updateReviewProgress() {
    if (!reviewState.active) return;

    const currentFeatures = activeReviewFeatures();
    const currentIds = new Set(currentFeatures.map(featureId));
    const deleted = reviewState.scopeIds.filter(
      (id) => !currentIds.has(String(id))
    ).length;

    const correct = currentFeatures.filter(
      (feature) => reviewStatus(feature) === "correct"
    ).length;
    const maybe = currentFeatures.filter(
      (feature) => reviewStatus(feature) === "maybe"
    ).length;
    const later = currentFeatures.filter(
      (feature) => reviewStatus(feature) === "later"
    ).length;

    const total = reviewState.scopeIds.length;
    const finalized = correct + deleted;
    const remaining = Math.max(0, total - finalized);
    const percent = total
      ? Math.round((finalized / total) * 100)
      : 100;

    els.reviewProgressFill.style.width = `${percent}%`;
    els.reviewProgressText.textContent =
      `${finalized} / ${total} reviewed · ${percent}%`;
    els.reviewRemainingText.textContent =
      `Remaining: ${remaining} · Maybe: ${maybe} · Later: ${later}`;

    const feature = currentReviewFeature();

    if (feature) {
      const passLabel =
        reviewState.phase === "maybe"
          ? "Maybe pass"
          : reviewState.phase === "later"
            ? "Review Later pass"
            : "First pass";

      els.reviewCurrentText.textContent =
        `${passLabel} · ${getFeatureClassName(feature)}`;
    } else {
      els.reviewCurrentText.textContent = "Review pass complete";
    }
  }
  function nextReviewFeature() {
    if (!reviewState.active) return;

    clearReviewAutoExitTimer();

    while (reviewState.queue.length) {
      const id = String(reviewState.queue.shift());
      const feature = findFeature(id);

      if (!feature) continue;

      const status = reviewStatus(feature);

      if (
        reviewState.phase === "main"
        && status !== "pending"
      ) {
        continue;
      }

      if (
        reviewState.phase === "maybe"
        && status !== "maybe"
      ) {
        continue;
      }

      if (
        reviewState.phase === "later"
        && status !== "later"
      ) {
        continue;
      }

      reviewState.currentId = id;
      setSingleSelection(id);
      syncCurrentClassFromFeature(feature);
      populateReviewClassSelect(feature);
      updateControls();
      drawAnnotations();
      zoomToReviewFeature(feature);
      updateReviewProgress();
      return;
    }

    if (
      reviewState.phase === "main"
      && reviewState.maybeQueue.length
    ) {
      reviewState.phase = "maybe";
      reviewState.queue = [
        ...new Set(reviewState.maybeQueue.map(String))
      ];
      reviewState.maybeQueue = [];
      nextReviewFeature();
      return;
    }

    if (
      (reviewState.phase === "main"
        || reviewState.phase === "maybe")
      && reviewState.laterQueue.length
    ) {
      reviewState.phase = "later";
      reviewState.queue = [
        ...new Set(reviewState.laterQueue.map(String))
      ];
      reviewState.laterQueue = [];
      nextReviewFeature();
      return;
    }

    reviewState.currentId = null;
    clearSelectedFeatures(false);
    updateControls();
    drawAnnotations();
    updateReviewProgress();
    setStatus("Review complete", "saved");
    scheduleReviewAutoExit(30);
  }
  function startReviewMode(scope = "all") {
    clearReviewAutoExitTimer();

    let scoped = featuresForReviewScope(scope);

    if (!scoped.length) {
      window.alert(
        "There are no annotations in the selected review scope."
      );
      return;
    }

    let pending = scoped.filter(
      (feature) => reviewStatus(feature) === "pending"
    );
    let maybe = scoped.filter(
      (feature) => reviewStatus(feature) === "maybe"
    );
    let later = scoped.filter(
      (feature) => reviewStatus(feature) === "later"
    );

    if (!pending.length && !maybe.length && !later.length) {
      const restart = window.confirm(
        "All annotations in this scope have already been reviewed.\n\nReview all of them again?"
      );

      if (!restart) {
        setStatus(
          "All annotations in this scope are already reviewed",
          "saved"
        );
        return;
      }

      pushUndo();

      for (const feature of scoped) {
        phaseCResetToDraft(feature);

        if (
          feature?.properties?.[
            REVIEW_PROPERTY
          ]
        ) {
          delete feature.properties[
            REVIEW_PROPERTY
          ];
        }
      }

      markChanged();

      scoped = featuresForReviewScope(scope);
      pending = [...scoped];
      maybe = [];
      later = [];
    }

    reviewState.active = true;
    reviewState.scope = scope;
    reviewState.scopeIds = scoped.map(
      (feature) => String(featureId(feature))
    );
    reviewState.queue = pending.map(
      (feature) => String(featureId(feature))
    );
    reviewState.maybeQueue = maybe.map(
      (feature) => String(featureId(feature))
    );
    reviewState.laterQueue = later.map(
      (feature) => String(featureId(feature))
    );
    reviewState.phase = "main";
    reviewState.currentId = null;

    els.reviewPanel.hidden = false;
    els.reviewDecisionBar.hidden = false;
    els.reviewScopeLabel.textContent =
      scope === "all"
        ? "All annotations"
        : `Class: ${scope}`;

    nextReviewFeature();
  }
  function exitReviewMode() {
    clearReviewAutoExitTimer();

    reviewState.active = false;
    reviewState.scope = "all";
    reviewState.scopeIds = [];
    reviewState.queue = [];
    reviewState.maybeQueue = [];
    reviewState.laterQueue = [];
    reviewState.phase = "main";
    reviewState.currentId = null;
    reviewPendingNewClassAssignment = false;

    if (els.reviewPanel) els.reviewPanel.hidden = true;
    if (els.reviewDecisionBar) {
      els.reviewDecisionBar.hidden = true;
    }

    clearSelectedFeatures(false);
    updateControls();
    drawAnnotations();

    // Phase C6.1: completing/exiting review should lead naturally to the
    // batch summary instead of requiring per-annotation Workflow clicks.
    const phaseCReviewExitSummaryScheduled = true;
    if (phaseCReviewExitSummaryScheduled && currentImage) {
      queueMicrotask(
        () => phaseCOpenWorkflowSummary("file")
      );
    }
}
  function assignReviewFeatureClass(className) {
    const feature = currentReviewFeature();
    const classItem = classes.find((item) => item.name === className);
    if (!feature || !classItem) return;
    pushUndo();
    feature.properties ||= {};
    feature.properties.classification = { name:classItem.name, color:hexToRgbArray(classItem.color) };
    currentClass = classItem;
    markChanged(); populateReviewClassSelect(feature); updateReviewProgress();
  }
  function applyReviewDecision(decision) {
    const feature = currentReviewFeature();
    if (!feature || !reviewState.active) return;

    const id = String(featureId(feature));

    if (decision === "delete") {
      pushUndo();
      featureCollection.features =
        featureCollection.features.filter(
          (item) => String(featureId(item)) !== id
        );
      markChanged();

    } else {
      pushUndo();
      setReviewStatus(feature, decision);
      markChanged();

      if (
        decision === "maybe"
        && reviewState.phase === "main"
      ) {
        reviewState.maybeQueue.push(id);
      }

      if (
        decision === "later"
        && reviewState.phase !== "later"
      ) {
        reviewState.laterQueue.push(id);
      }
    }

    reviewState.currentId = null;
    nextReviewFeature();
  }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatStatNumber(value, digits = 0) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(value) || 0);
  }


  function phaseDFillUnannotatedTargetClass() {
    const requested = String(els.fillUnannotatedClassSelect?.value || "");
    return classes.find((item) => item.name === requested) || currentClass || classes[0] || null;
  }

  function phaseDPopulateFillUnannotatedClasses() {
    if (!els.fillUnannotatedClassSelect) return;
    const previous = els.fillUnannotatedClassSelect.value;
    els.fillUnannotatedClassSelect.innerHTML = "";
    for (const item of classes) {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.name;
      els.fillUnannotatedClassSelect.append(option);
    }
    const preferred = classes.some((item) => item.name === previous)
      ? previous
      : (currentClass?.name || classes[0]?.name || "");
    els.fillUnannotatedClassSelect.value = preferred;
  }

  function phaseDFormatArea(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function phaseDRenderFillUnannotatedSummary(payload = null) {
    if (!els.fillUnannotatedSummary) return;
    if (!payload) {
      els.fillUnannotatedSummary.innerHTML = '<p class="modal-note">Calculating preview…</p>';
      return;
    }

    const valid = Number(payload.validAreaPx2 || 0);
    const annotated = Number(payload.annotatedAreaPx2 || 0);
    const remaining = Number(payload.remainingAreaPx2 || 0);
    const percent = Number(payload.remainingPercentValid || 0);
    const source = payload.analysis?.source === "tissue-roi" ? "Tissue ROI" : "Full image";
    const target = phaseDFillUnannotatedTargetClass();
    const artifactWarning = phaseDIsArtifactClassName(target?.name)
      ? '<p class="modal-note"><strong>Artifact:</strong> creating the remainder as Artifact will exclude that new area from Valid Tissue.</p>'
      : "";

    els.fillUnannotatedSummary.innerHTML = `
      <div class="stats-summary">
        <p><strong>Analysis region:</strong> ${source}</p>
        <p><strong>Valid tissue:</strong> ${phaseDFormatArea(valid)} px² · 100%</p>
        <p><strong>Already annotated:</strong> ${phaseDFormatArea(annotated)} px²</p>
        <p><strong>Remaining:</strong> ${phaseDFormatArea(remaining)} px² · ${percent.toFixed(2)}%</p>
      </div>
      ${artifactWarning}
    `;
  }

  function phaseDDrawFillUnannotatedPreview() {
    const geometry = phaseDFillUnannotatedPreview?.geometry;
    if (!geometry || reviewState.active) return;
    const target = phaseDFillUnannotatedTargetClass();
    if (!target) return;

    const previewFeature = {
      type: "Feature",
      id: "__fill_unannotated_preview__",
      geometry,
      properties: {
        objectType: "annotation",
        classification: { name: target.name, color: hexToRgbArray(target.color) },
        isLocked: false,
        histoannotator: phaseCCreateMetadata(),
      },
    };

    const previousFilled = annotationsFilled;
    try {
      annotationsFilled = true;
      drawGeometry(previewFeature);
    } finally {
      annotationsFilled = previousFilled;
    }
  }

  function phaseDCloseFillUnannotated() {
    phaseDFillUnannotatedPreview = null;
    phaseDFillUnannotatedBusy = false;
    if (els.fillUnannotatedModal) els.fillUnannotatedModal.hidden = true;
    if (els.fillUnannotatedCreateButton) els.fillUnannotatedCreateButton.disabled = true;
    drawAnnotations();
  }

  async function phaseDRefreshFillUnannotatedPreview() {
    if (!currentImage || !currentInfo || phaseDFillUnannotatedBusy) return;
    if (currentImage.localNative) {
      setStatus("Fill unannotated tissue currently requires the server-backed geometry engine", "error");
      return;
    }

    phaseDFillUnannotatedBusy = true;
    phaseDFillUnannotatedPreview = null;
    if (els.fillUnannotatedCreateButton) els.fillUnannotatedCreateButton.disabled = true;
    phaseDRenderFillUnannotatedSummary(null);
    drawAnnotations();

    try {
      const response = await apiFetch(
        `${API}/geojson/fill-unannotated`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            featureCollection,
            imageWidth: Number(currentInfo.width || 0),
            imageHeight: Number(currentInfo.height || 0),
          }),
          timeoutMs: 30000,
        }
      );
      const payload = await response.json();
      phaseDFillUnannotatedPreview = {
        geometry: payload.geometry || null,
        payload,
        revision: Number(currentLocalRevision || 0),
      };
      phaseDRenderFillUnannotatedSummary(payload);
      if (els.fillUnannotatedCreateButton) {
        els.fillUnannotatedCreateButton.disabled =
          !payload.geometry || Number(payload.remainingAreaPx2 || 0) <= 0;
      }
      if (!payload.geometry) setStatus("No unannotated Valid Tissue remains", "saved");
      drawAnnotations();
    } catch (error) {
      phaseDFillUnannotatedPreview = null;
      if (els.fillUnannotatedSummary) {
        els.fillUnannotatedSummary.innerHTML =
          `<p class="modal-note">Could not calculate preview: ${escapeHtml(error.message)}</p>`;
      }
      setStatus(`Could not calculate remaining tissue: ${error.message}`, "error");
    } finally {
      phaseDFillUnannotatedBusy = false;
    }
  }

  async function phaseDOpenFillUnannotated() {
    if (!currentImage || !currentInfo) return;
    toggleFileMenu(false);

    phaseBToggleSettings(false);if (currentImage.localNative) {
      setStatus("Fill unannotated tissue currently requires a server-backed image", "error");
      return;
    }
    phaseDPopulateFillUnannotatedClasses();
    if (els.fillUnannotatedModal) els.fillUnannotatedModal.hidden = false;
    await phaseDRefreshFillUnannotatedPreview();
  }

  function phaseDCreateFillUnannotated() {
    const preview = phaseDFillUnannotatedPreview;
    if (!preview?.geometry) return;
    if (Number(preview.revision) !== Number(currentLocalRevision || 0)) {
      setStatus("Annotations changed after the preview. Refresh the preview before creating the remainder.", "error");
      return;
    }

    const target = phaseDFillUnannotatedTargetClass();
    if (!target) {
      setStatus("Choose a target class", "error");
      return;
    }

    pushUndo();

    const feature = {
      type: "Feature",
      id: uid(),
      geometry:
        deepClone(
          preview.geometry
        ),
      properties: {
        objectType:
          "annotation",
        classification: {
          name:
            target.name,
          color:
            hexToRgbArray(
              target.color
            ),
        },
        isLocked:
          false,
        histoannotator:
          phaseCCreateMetadata(),
      },
    };

    phaseDSyncArtifactRole(
      feature
    );
    featureCollection.features.push(feature);
    phaseDFillUnannotatedPreview = null;
    if (els.fillUnannotatedModal) els.fillUnannotatedModal.hidden = true;
    setSingleSelection(String(feature.id), true);
    markChanged();

    const area = Number(preview.payload?.remainingAreaPx2 || 0);
    const percent = Number(preview.payload?.remainingPercentValid || 0);
    setStatus(
      `Created "${target.name}" from remaining tissue · ${phaseDFormatArea(area)} px² · ${percent.toFixed(2)}% of Valid Tissue`,
      "saved"
    );
  }

  let phaseELastStatistics = null;

  function phaseEPhysicalPixelAreaMm2() {
    const manual =
      readManualCalibration();

    const manualMpp =
      Number(manual?.mpp);

    if (
      Number.isFinite(manualMpp)
      && manualMpp > 0
    ) {
      return {
        mm2PerPx2:
          (
            manualMpp
            * manualMpp
          )
          / 1_000_000,
        label:
          `${manualMpp.toFixed(4)} µm/px · Manual override`,
      };
    }

    const x =
      Number(currentInfo?.mppX);

    const y =
      Number(currentInfo?.mppY);

    const validX =
      Number.isFinite(x)
      && x > 0;

    const validY =
      Number.isFinite(y)
      && y > 0;

    if (validX && validY) {
      return {
        mm2PerPx2:
          (x * y)
          / 1_000_000,
        label:
          (
            Math.abs(x - y) < 1e-9
              ? `${x.toFixed(4)} µm/px`
              : `${x.toFixed(4)} × ${y.toFixed(4)} µm/px`
          )
          + (
            currentInfo?.calibrationSource
              ? ` · ${currentInfo.calibrationSource}`
              : ""
          ),
      };
    }

    const fallback =
      Number(
        effectiveCalibration()?.mpp
      );

    if (
      Number.isFinite(fallback)
      && fallback > 0
    ) {
      return {
        mm2PerPx2:
          (
            fallback
            * fallback
          )
          / 1_000_000,
        label:
          `${fallback.toFixed(4)} µm/px`,
      };
    }

    return {
      mm2PerPx2: null,
      label: null,
    };
  }

  function phaseEAreaMm2(
    areaPx2,
    calibration =
      phaseEPhysicalPixelAreaMm2()
  ) {
    const factor =
      Number(
        calibration?.mm2PerPx2
      );

    if (
      !Number.isFinite(factor)
      || factor <= 0
    ) {
      return null;
    }

    return (
      Number(areaPx2 || 0)
      * factor
    );
  }

  function phaseEFormatMm2(value) {
    if (
      value === null
      || value === undefined
      || !Number.isFinite(
        Number(value)
      )
    ) {
      return "—";
    }

    const number =
      Number(value);

    const digits =
      number >= 100
        ? 2
        : (
          number >= 1
            ? 3
            : 4
        );

    return (
      formatStatNumber(
        number,
        digits
      )
      + " mm²"
    );
  }

  function phaseECsvCell(value) {
    const text =
      String(
        value ?? ""
      );

    if (
      /[",\r\n]/.test(text)
    ) {
      return (
        '"'
        + text.replaceAll(
          '"',
          '""'
        )
        + '"'
      );
    }

    return text;
  }

  function phaseEDownloadText(
    filename,
    text,
    mimeType =
      "text/csv;charset=utf-8"
  ) {
    const blob =
      new Blob(
        [text],
        {
          type: mimeType,
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.append(
      link
    );

    link.click();
    link.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }

  function phaseEExportStatisticsCsv() {
    const snapshot =
      phaseELastStatistics;

    if (!snapshot) {
      setStatus(
        "Open Statistics before exporting CSV",
        "error"
      );
      return;
    }

    const {
      stats,
      imageName,
      annotationFile,
      calibration,
      coverageAreaPx2,
      coveragePercent,
      unannotatedAreaPx2,
      unannotatedPercent,
    } = snapshot;

    const analysis =
      stats.analysis || {};

    const validArea =
      Number(
        analysis.validAreaPx2
        || 0
      );

    const source =
      analysis.source === "tissue-roi"
        ? "Tissue ROI"
        : "Full image";

    const rows = [[
      "Image",
      "AnnotationFile",
      "AnalysisRegion",
      "Calibration",
      "RecordType",
      "Class",
      "Count",
      "Area_px2",
      "Area_mm2",
      "PercentValidTissue",
    ]];

    const addRow = ({
      recordType,
      className = "",
      count = "",
      areaPx2 = "",
      percent = "",
    }) => {
      const numericArea =
        areaPx2 === ""
          ? null
          : Number(areaPx2 || 0);

      const mm2 =
        numericArea === null
          ? ""
          : phaseEAreaMm2(
              numericArea,
              calibration
            );

      rows.push([
        imageName,
        annotationFile,
        source,
        calibration?.label || "",
        recordType,
        className,
        count,
        numericArea === null
          ? ""
          : numericArea,
        mm2 === null
          ? ""
          : mm2,
        percent,
      ]);
    };

    addRow({
      recordType:
        "valid_tissue",
      areaPx2:
        validArea,
      percent:
        100,
    });

    addRow({
      recordType:
        "artifact_excluded",
      count:
        Number(
          analysis.artifactCount
          || 0
        ),
      areaPx2:
        Number(
          analysis.artifactAreaPx2
          || 0
        ),
      percent:
        Number(
          analysis.artifactPercentPostBorder
          || 0
        ),
    });

    addRow({
      recordType:
        "annotated_coverage",
      areaPx2:
        coverageAreaPx2,
      percent:
        coveragePercent,
    });

    addRow({
      recordType:
        "unannotated_valid_tissue",
      areaPx2:
        unannotatedAreaPx2,
      percent:
        unannotatedPercent,
    });

    for (
      const row
      of stats.rows || []
    ) {
      addRow({
        recordType:
          "class",
        className:
          row.className || "",
        count:
          Number(
            row.count || 0
          ),
        areaPx2:
          Number(
            row.areaPx2 || 0
          ),
        percent:
          Number(
            row.percentValid || 0
          ),
      });
    }

    const csv =
      rows
        .map(
          (row) =>
            row
              .map(
                phaseECsvCell
              )
              .join(",")
        )
        .join("\r\n")
      + "\r\n";

    const base =
      String(
        imageName || "image"
      )
        .replace(
          /\.[^.]+$/,
          ""
        )
        .replace(
          /[^A-Za-z0-9._-]+/g,
          "_"
        );

    const filePart =
      String(
        annotationFile
        || "Default"
      )
        .replace(
          /[^A-Za-z0-9._-]+/g,
          "_"
        );

    phaseEDownloadText(
      `${base}_${filePart}_statistics.csv`,
      csv
    );

    setStatus(
      "Statistics CSV exported",
      "saved"
    );
  }

  async function showAnnotationStatistics() {
    if (
      !currentImage
      || !currentInfo
      || !featureCollection.features.length
    ) {
      return;
    }

    toggleFileMenu(false);

    els.annotationStatsContent.innerHTML =
      '<p class="modal-note">Calculating valid tissue statistics…</p>';

    els.annotationStatsModal.hidden =
      false;

    try {
      const response =
        await apiFetch(
          `${API}/geojson/statistics`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                featureCollection,
                imageWidth:
                  Number(
                    currentInfo.width
                    || 0
                  ),
                imageHeight:
                  Number(
                    currentInfo.height
                    || 0
                  ),
              }),
            timeoutMs:
              30000,
          }
        );

      const stats =
        await response.json();

      const analysis =
        stats.analysis || {};

      const calibration =
        phaseEPhysicalPixelAreaMm2();

      const sourceIsRoi =
        analysis.source
        === "tissue-roi";

      const sourceLabel =
        sourceIsRoi
          ? "Tissue ROI"
          : "Full image";

      const baseArea =
        Number(
          analysis.baseAreaPx2
          || 0
        );

      const postBorderArea =
        Number(
          analysis.postBorderAreaPx2
          || baseArea
        );

      const artifactArea =
        Number(
          analysis.artifactAreaPx2
          || 0
        );

      const artifactPercent =
        Number(
          analysis.artifactPercentPostBorder
          || 0
        );

      const artifactCount =
        Number(
          analysis.artifactCount
          || 0
        );

      const validArea =
        Number(
          analysis.validAreaPx2
          || 0
        );

      const coverageArea =
        Math.min(
          validArea,
          Math.max(
            0,
            Number(
              stats.totalUnionAreaPx2
              || 0
            )
          )
        );

      const coveragePercent =
        validArea > 0
          ? (
            coverageArea
            / validArea
          ) * 100
          : 0;

      const unannotatedArea =
        Math.max(
          0,
          validArea
          - coverageArea
        );

      const unannotatedPercent =
        Math.max(
          0,
          100
          - coveragePercent
        );

      phaseELastStatistics = {
        stats:
          deepClone(stats),
        imageName:
          currentImage.name,
        annotationFile:
          currentAnnotationFile,
        calibration:
          deepClone(calibration),
        coverageAreaPx2:
          coverageArea,
        coveragePercent,
        unannotatedAreaPx2:
          unannotatedArea,
        unannotatedPercent,
      };

      const percentHeader =
        sourceIsRoi
          ? "% valid tissue"
          : "% valid area";

      const rowsHtml =
        (stats.rows || [])
          .map((row) => {
            const area =
              Number(
                row.areaPx2
                || 0
              );

            return `
              <tr>
                <td>${escapeHtml(row.className)}</td>
                <td>${formatStatNumber(row.count)}</td>
                <td>${formatStatNumber(area)}</td>
                <td>${phaseEFormatMm2(phaseEAreaMm2(area, calibration))}</td>
                <td>${formatStatNumber(Number(row.percentValid || 0), 2)}%</td>
              </tr>
            `;
          })
          .join("");

      const totalArea =
        Number(
          stats.totalUnionAreaPx2
          || 0
        );

      const totalPercent =
        Number(
          stats.totalPercentValid
          || 0
        );

      const borderEnabled =
        Boolean(
          analysis.externalBorderEnabled
        );

      const borderActual =
        Number(
          analysis.externalBorderActualPct
          || 0
        );

      const borderRequested =
        Number(
          analysis.externalBorderRequestedPct
          || 0
        );

      const borderWidth =
        Number(
          analysis.externalBorderWidthPx
          || 0
        );

      const baseSummary =
        sourceIsRoi
          ? `
            <span>
              Original Tissue ROI:
              ${formatStatNumber(baseArea)} px²
              · ${phaseEFormatMm2(phaseEAreaMm2(baseArea, calibration))}
            </span>
          `
          : `
            <span>
              Full image area:
              ${formatStatNumber(baseArea)} px²
              · ${phaseEFormatMm2(phaseEAreaMm2(baseArea, calibration))}
            </span>
          `;

      const borderSummary =
        (
          sourceIsRoi
          && borderEnabled
        )
          ? `
            <span>
              External border:
              ${formatStatNumber(borderActual, 2)}%
              excluded
              ${Math.abs(borderActual - borderRequested) > 0.05
                ? ` (requested ${formatStatNumber(borderRequested, 1)}%)`
                : ""}
              ${borderWidth > 0
                ? ` · ≈${formatStatNumber(borderWidth, 1)} px inward`
                : ""}
            </span>
            <span>
              Tissue after border:
              ${formatStatNumber(postBorderArea)} px²
              · ${phaseEFormatMm2(phaseEAreaMm2(postBorderArea, calibration))}
            </span>
          `
          : "";

      const artifactSummary =
        artifactCount > 0
          ? `
            <span>
              Artifact excluded:
              ${formatStatNumber(artifactArea)} px²
              · ${phaseEFormatMm2(phaseEAreaMm2(artifactArea, calibration))}
              · ${formatStatNumber(artifactPercent, 2)}%
              of ${sourceIsRoi ? "post-border tissue" : "image"}
              · ${formatStatNumber(artifactCount)}
              feature${artifactCount === 1 ? "" : "s"}
            </span>
          `
          : `
            <span>
              Artifact excluded:
              0 px² · ${phaseEFormatMm2(0)}
              · 0.00%
            </span>
          `;

      const validLabel =
        sourceIsRoi
          ? "Valid tissue"
          : "Valid analysis area";

      const calibrationSummary =
        calibration?.label
          ? `
            <span>
              Physical calibration:
              ${escapeHtml(calibration.label)}
            </span>
          `
          : `
            <span>
              Physical calibration:
              — set µm/px in Image info to report mm²
            </span>
          `;

      els.annotationStatsContent.innerHTML = `
        <div class="stats-summary">
          <strong>${escapeHtml(currentImage.name)}</strong>
          <span>
            Annotation file:
            ${escapeHtml(currentAnnotationFile)}
          </span>
          <span>
            Analysis region:
            ${escapeHtml(sourceLabel)}
          </span>

          ${calibrationSummary}
          ${baseSummary}
          ${borderSummary}
          ${artifactSummary}

          <span>
            <strong>${escapeHtml(validLabel)}:</strong>
            ${formatStatNumber(validArea)} px²
            · ${phaseEFormatMm2(phaseEAreaMm2(validArea, calibration))}
            · 100%
          </span>

          <span>
            <strong>Annotated coverage:</strong>
            ${formatStatNumber(coverageArea)} px²
            · ${phaseEFormatMm2(phaseEAreaMm2(coverageArea, calibration))}
            · ${formatStatNumber(coveragePercent, 2)}%
          </span>

          <span>
            <strong>Unannotated valid tissue:</strong>
            ${formatStatNumber(unannotatedArea)} px²
            · ${phaseEFormatMm2(phaseEAreaMm2(unannotatedArea, calibration))}
            · ${formatStatNumber(unannotatedPercent, 2)}%
          </span>
        </div>

        <div class="stats-table-wrap">
          <table class="stats-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Annotations</th>
                <th>Area in valid region (px²)</th>
                <th>Area (mm²)</th>
                <th>${escapeHtml(percentHeader)}</th>
              </tr>
            </thead>

            <tbody>${rowsHtml}</tbody>

            <tfoot>
              <tr>
                <th>Union of biological classes</th>
                <th>${formatStatNumber(stats.totalAnnotations || 0)}</th>
                <th>${formatStatNumber(totalArea)}</th>
                <th>${phaseEFormatMm2(phaseEAreaMm2(totalArea, calibration))}</th>
                <th>${formatStatNumber(totalPercent, 2)}%</th>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="modal-actions">
          <button
            id="phaseEExportStatsCsvButton"
            type="button"
          >
            Export CSV
          </button>
        </div>

        <p class="stats-note">
          Annotated coverage uses the union of all biological
          annotations inside Valid Tissue, so overlapping classes are
          counted once for coverage. Class percentages may still overlap
          and therefore do not need to sum to 100%.
          Artifact is reviewable but remains an exclusion mask for these
          biological-area statistics.
        </p>
      `;

      document
        .getElementById(
          "phaseEExportStatsCsvButton"
        )
        ?.addEventListener(
          "click",
          phaseEExportStatisticsCsv
        );

    } catch (error) {
      phaseELastStatistics =
        null;

      els.annotationStatsContent.innerHTML =
        `<p class="modal-note error-text">${escapeHtml(error.message || String(error))}</p>`;
    }
  }

  function manualCalibrationStorageKey() {
    return currentImage?.id ? `histoannotator.manualCalibration.v1::${currentImage.id}` : null;
  }

  function readManualCalibration() {
    const key = manualCalibrationStorageKey();
    if (!key) return null;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (!value || typeof value !== "object") return null;
      const mpp = Number(value.mpp);
      const objective = Number(value.objective);
      return {
        mpp: Number.isFinite(mpp) && mpp > 0 ? mpp : null,
        objective: Number.isFinite(objective) && objective > 0 ? objective : null,
      };
    } catch (_) {
      return null;
    }
  }

  function metadataResolutionMpp() {
    const x = Number(currentInfo?.mppX);
    const y = Number(currentInfo?.mppY);
    const validX = Number.isFinite(x) && x > 0;
    const validY = Number.isFinite(y) && y > 0;
    if (validX && validY) return (x + y) / 2;
    if (validX) return x;
    if (validY) return y;
    return null;
  }

  function effectiveCalibration() {
    const manual = readManualCalibration();
    const metadataMpp = metadataResolutionMpp();
    const metadataObjective = Number(currentInfo?.objectivePower);
    return {
      mpp: manual?.mpp || metadataMpp || null,
      objective: manual?.objective || (Number.isFinite(metadataObjective) && metadataObjective > 0 ? metadataObjective : null),
      source: manual
        ? "Manual override"
        : (currentInfo?.calibrationSource || null),
      manualActive: Boolean(manual),
    };
  }

  function formatMagnification(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "—";
    if (number < 1) return number.toFixed(2);
    if (number < 10) return number.toFixed(1);
    if (number < 100) return number.toFixed(number % 1 ? 1 : 0);
    return number.toFixed(0);
  }

  function currentApproxMagnification(calibration = effectiveCalibration()) {
    const sourceObjective = Number(calibration?.objective);
    if (!Number.isFinite(sourceObjective) || sourceObjective <= 0 || !viewer?.world?.getItemCount()) return null;

    const imagePixelsFor100ScreenPx = screenToleranceToImage(100);
    if (!Number.isFinite(imagePixelsFor100ScreenPx) || imagePixelsFor100ScreenPx <= 0) return null;

    const screenPixelsPerImagePixel = 100 / imagePixelsFor100ScreenPx;
    return sourceObjective * screenPixelsPerImagePixel;
  }

  function renderManualCalibrationEditor() {
    const manual = readManualCalibration();

    if (els.manualMppInput) {
      els.manualMppInput.value = manual?.mpp ? String(manual.mpp) : "";
      const detectedMpp = metadataResolutionMpp();
      els.manualMppInput.placeholder = detectedMpp ? `Detected: ${detectedMpp.toFixed(4)}` : "e.g. 0.220";
    }

    if (els.manualObjectiveInput) {
      els.manualObjectiveInput.value = manual?.objective ? String(manual.objective) : "";
      const detectedObjective = Number(currentInfo?.objectivePower);
      els.manualObjectiveInput.placeholder =
        Number.isFinite(detectedObjective) && detectedObjective > 0
          ? `Detected: ${formatMagnification(detectedObjective)}`
          : "e.g. 40";
    }

    if (els.manualCalibrationState) {
      els.manualCalibrationState.textContent = manual ? "Manual override active" : "Using image metadata";
    }

    if (els.clearManualCalibrationButton) {
      els.clearManualCalibrationButton.disabled = !manual;
    }
  }

  function saveManualCalibration() {
    if (!currentImage) return;

    const mppText = String(els.manualMppInput?.value || "").trim();
    const objectiveText = String(els.manualObjectiveInput?.value || "").trim();

    const mpp = mppText ? Number(mppText) : null;
    const objective = objectiveText ? Number(objectiveText) : null;

    if (mppText && (!Number.isFinite(mpp) || mpp <= 0)) {
      setStatus("Resolution must be a positive number in um/px", "error");
      return;
    }

    if (objectiveText && (!Number.isFinite(objective) || objective <= 0)) {
      setStatus("Magnification must be a positive number", "error");
      return;
    }

    if (!mppText && !objectiveText) {
      setStatus("Enter a resolution, a magnification, or both", "error");
      return;
    }

    const key = manualCalibrationStorageKey();
    if (!key) return;

    localStorage.setItem(key, JSON.stringify({
      mpp: mppText ? mpp : null,
      objective: objectiveText ? objective : null,
      updatedAt: new Date().toISOString(),
    }));

    updateCalibrationBadge();
    updateScaleBar();
    showImageInfo();
    setStatus("Manual calibration saved on this device", "saved");
  }

  function clearManualCalibration() {
    const key = manualCalibrationStorageKey();
    if (!key) return;

    localStorage.removeItem(key);
    updateCalibrationBadge();
    updateScaleBar();
    showImageInfo();
    setStatus("Image metadata calibration restored", "saved");
  }

  function updateCalibrationBadge() {
    if (!els.viewerCalibrationBadge) return;

    const calibration = effectiveCalibration();
    const approx =
      currentApproxMagnification(calibration);

    const pieces = [];

    if (
      Number.isFinite(approx)
      && approx > 0
    ) {
      pieces.push(
        `≈${formatMagnification(approx)}×`
      );
    } else if (
      Number.isFinite(Number(calibration.objective))
      && Number(calibration.objective) > 0
    ) {
      pieces.push(
        `${formatMagnification(calibration.objective)}× source`
      );
    }

    if (
      Number.isFinite(Number(calibration.mpp))
      && Number(calibration.mpp) > 0
    ) {
      pieces.push(
        `${Number(calibration.mpp).toFixed(3)} µm/px`
      );
    }

    els.viewerCalibrationBadge.hidden =
      pieces.length === 0;

    els.viewerCalibrationBadge.textContent =
      pieces.length
        ? pieces.join(" · ")
        : "—";

    els.viewerCalibrationBadge.title =
      calibration.source || "";
  }
  function niceScaleLengthUm(targetUm) {
    if (!Number.isFinite(targetUm) || targetUm <= 0) return null;
    const exponent = Math.floor(Math.log10(targetUm));
    let best = 10 ** exponent;
    for (const factor of [1, 2, 5, 10]) {
      const candidate = factor * (10 ** exponent);
      if (candidate <= targetUm) best = candidate;
    }
    return best;
  }

  function updateScaleBar() {
    if (
      !els.scaleBar
      || !els.scaleBarLine
      || !els.scaleBarLabel
    ) {
      return;
    }

    const calibration = effectiveCalibration();
    const mpp = Number(calibration.mpp);

    if (
      !Number.isFinite(mpp)
      || mpp <= 0
      || !viewer?.world?.getItemCount()
    ) {
      els.scaleBar.hidden = true;
      return;
    }

    const imagePixelsFor100ScreenPx =
      screenToleranceToImage(100);

    if (
      !Number.isFinite(imagePixelsFor100ScreenPx)
      || imagePixelsFor100ScreenPx <= 0
    ) {
      els.scaleBar.hidden = true;
      return;
    }

    const imagePixelsPerScreenPx =
      imagePixelsFor100ScreenPx / 100;

    const targetUm =
      120 * imagePixelsPerScreenPx * mpp;

    const niceUm =
      niceScaleLengthUm(targetUm);

    if (!niceUm) {
      els.scaleBar.hidden = true;
      return;
    }

    const screenWidth =
      niceUm / (imagePixelsPerScreenPx * mpp);

    if (
      !Number.isFinite(screenWidth)
      || screenWidth < 18
      || screenWidth > 240
    ) {
      els.scaleBar.hidden = true;
      return;
    }

    els.scaleBar.hidden = false;
    els.scaleBarLine.style.width =
      `${screenWidth}px`;

    if (niceUm >= 1000) {
      const mm = niceUm / 1000;
      els.scaleBarLabel.textContent =
        `${Number(mm.toFixed(mm < 10 ? 1 : 0))} mm`;
    } else {
      els.scaleBarLabel.textContent =
        `${Number(
          niceUm.toFixed(niceUm < 10 ? 1 : 0)
        )} µm`;
    }
  }
  function showImageInfo() {
    if (!currentImage || !currentInfo) return;

    toggleFileMenu(false);

    const calibration =
      effectiveCalibration();

    const approx =
      currentApproxMagnification(calibration);

    const info = {
      file: currentImage.name,
      path: currentImage.relativePath,
      fileSize:
        formatBytes(currentImage.sizeBytes),
      dimensions:
        `${currentInfo.width} × ${currentInfo.height}`,
      source: currentInfo.sourceKind,
      preparedOnSSD:
        Boolean(currentInfo.preparedLocally),
      tileSize:
        `${currentInfo.tileSize} px`,
      levels: currentInfo.levelCount,
      resolution:
        calibration.mpp
          ? `${Number(calibration.mpp).toFixed(4)} µm/px`
          : "—",
      sourceMagnification:
        calibration.objective
          ? `${formatMagnification(calibration.objective)}×`
          : "—",
      currentApproxMagnification:
        approx
          ? `≈${formatMagnification(approx)}×`
          : "—",
      calibrationSource:
        calibration.source || "—",
    };

    els.imageInfoContent.textContent =
      Object.entries(info)
        .map(
          ([key, value]) =>
            `${key}: ${value}`
        )
        .join("\n");

    renderManualCalibrationEditor();
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

  async function prepareGeoJsonExport() {
    if (!currentImage) return null;

    let exportCollection =
      quPathFeatureCollection(featureCollection);

    let report = null;

    // Prefer server validation when available, but export/share
    // must remain available offline.
    if (API && (navigator.onLine || IS_NATIVE)) {
      try {
        const response = await apiFetch(
          `${API}/geojson/qupath-export`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(exportCollection),
            timeoutMs: 3500,
          }
        );

        const payload = await response.json();

        if (
          payload?.featureCollection?.type ===
          "FeatureCollection"
        ) {
          exportCollection =
            payload.featureCollection;
        }

        report = payload?.report || null;

      } catch (error) {
        setStatus(
          `QuPath geometry validation unavailable; using local GeoJSON: ${error.message}`,
          "local"
        );
      }
    }

    const filename =
      `${currentImage.name}${
        currentAnnotationFile === "Default"
          ? ""
          : `.${currentAnnotationFile}`
      }.geojson`;

    return {
      exportCollection,
      report,
      filename,
      text: JSON.stringify(
        exportCollection,
        null,
        2
      ),
    };
  }


  function showGeoJsonExportReport(
    report,
    action = "exported"
  ) {
    if (!report) return;

    const repaired =
      Number(report.repaired || 0);

    const dropped =
      Number(report.dropped || 0);

    setStatus(
      `QuPath GeoJSON ${action} · ${report.features} annotations${
        repaired
          ? ` · ${repaired} repaired`
          : ""
      }${
        dropped
          ? ` · ${dropped} invalid dropped`
          : ""
      }`,
      dropped ? "local" : "saved"
    );
  }


  function downloadPreparedGeoJson(prepared) {
    const blob = new Blob(
      [prepared.text],
      {
        type: "application/geo+json"
      }
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download = prepared.filename;

    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }


  async function exportGeoJson() {
    const prepared =
      await prepareGeoJsonExport();

    if (!prepared) return;

    downloadPreparedGeoJson(prepared);

    showGeoJsonExportReport(
      prepared.report,
      "exported"
    );
  }


  async function shareGeoJson() {
    const prepared =
      await prepareGeoJsonExport();

    if (!prepared) return;

    const safeFilename =
      prepared.filename.replace(
        /[^a-zA-Z0-9._-]+/g,
        "_"
      );

    const plugins =
      window.Capacitor?.Plugins || {};

    const Filesystem =
      plugins.Filesystem;

    const Share =
      plugins.Share;

    // Native Android
    if (
      IS_NATIVE &&
      Filesystem?.writeFile &&
      Share?.share
    ) {
      try {
        const written =
          await Filesystem.writeFile({
            path:
              `exports/${safeFilename}`,
            data: prepared.text,
            directory: "CACHE",
            encoding: "utf8",
            recursive: true,
          });

        await Share.share({
          title:
            `${currentImage.name} annotations`,
          text:
            `QuPath GeoJSON from HistoAnnotator v${VERSION}`,
          files: [written.uri],
          dialogTitle:
            "Share GeoJSON",
        });

        showGeoJsonExportReport(
          prepared.report,
          "shared"
        );

        if (!prepared.report) {
          setStatus(
            "GeoJSON ready to share",
            "saved"
          );
        }

        return;

      } catch (error) {
        console.warn(
          "Native GeoJSON share failed",
          error
        );
      }
    }

    // Browser/PWA fallback if supported
    try {
      const file = new File(
        [prepared.text],
        prepared.filename,
        {
          type: "application/geo+json"
        }
      );

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({
          files: [file]
        })
      ) {
        await navigator.share({
          title:
            `${currentImage.name} annotations`,
          text:
            `QuPath GeoJSON from HistoAnnotator v${VERSION}`,
          files: [file],
        });

        showGeoJsonExportReport(
          prepared.report,
          "shared"
        );

        return;
      }

    } catch (error) {
      console.warn(
        "Web GeoJSON share failed",
        error
      );
    }

    // Last fallback
    downloadPreparedGeoJson(prepared);

    setStatus(
      "Native sharing unavailable; GeoJSON downloaded instead",
      "local"
    );
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

    const pendingCount = Math.max(
      0,
      Number(currentPendingChangeCount || 0)
    );
    const pendingLabel =
      pendingCount === 1
        ? "1 pending"
        : `${pendingCount} pending`;

    if (!currentImage) {
      const source =
        IS_NATIVE
          ? (NATIVE_SERVER ? "Server" : "Local")
          : "Web";
      els.diagnostics.textContent =
        `v${VERSION} · ${source} · Ready`;
      return;
    }

    const key = currentDocumentKey();
    const syncing = annotationSyncInFlight.has(key);

    if (currentImageUsesOfflineCopy) {
      const connected = serverReachable === true;

      let state;
      if (!connected) {
        state = pendingCount
          ? `Offline · ${pendingLabel}`
          : "Offline";
      } else if (syncing) {
        state = pendingCount
          ? `Connected · Syncing… · ${pendingLabel}`
          : "Connected · Syncing…";
      } else if (currentSyncPending()) {
        state = pendingCount
          ? `Connected · ${pendingLabel}`
          : "Connected · sync pending";
      } else {
        state = "Connected · Synced";
      }

      els.diagnostics.textContent =
        `v${VERSION} · Local copy · ${state}`;
      return;
    }

    let state;
    if (syncing) {
      state = pendingCount
        ? `Syncing… · ${pendingLabel}`
        : "Syncing…";
    } else if (!navigator.onLine) {
      state = pendingCount
        ? `Saved locally · ${pendingLabel}`
        : "Offline · saved locally";
    } else if (currentSyncPending()) {
      state = pendingCount
        ? `Saved locally · ${pendingLabel}`
        : "Saved locally · sync pending";
    } else if (currentImage.localNative) {
      state = "Saved locally";
    } else {
      state = "Synced";
    }

    const source =
      IS_NATIVE
        ? (NATIVE_SERVER ? "Server" : "Local")
        : "Web";
    els.diagnostics.textContent =
      `v${VERSION} · ${source} · ${state}`;
  }
  async function removeLegacyServiceWorker() {
    const result = {
      registrations: 0,
      shellCaches: 0,
      hadController: false,
    };

    if (!IS_NATIVE) {
      return result;
    }

    try {
      result.hadController =
        Boolean(
          navigator.serviceWorker?.controller
        );

      if ("serviceWorker" in navigator) {
        const registrations =
          await navigator.serviceWorker.getRegistrations();

        result.registrations =
          registrations.length;

        await Promise.all(
          registrations.map(
            (registration) =>
              registration.unregister()
          )
        );
      }

      if ("caches" in window) {
        const keys =
          await caches.keys();

        const shellKeys =
          keys.filter(
            (key) =>
              key.startsWith(
                "histoannotator-shell-"
              )
          );

        result.shellCaches =
          shellKeys.length;

        await Promise.all(
          shellKeys.map(
            (key) =>
              caches.delete(key)
          )
        );
      }

      if (
        result.registrations
        || result.shellCaches
      ) {
        console.info(
          "HistoAnnotator native runtime cleanup",
          result
        );
      }
    } catch (error) {
      console.warn(
        "Native runtime cleanup failed",
        error
      );
    }

    return result;
  }

  async function prepareNativeRuntime() {
    if (!IS_NATIVE) {
      return false;
    }

    const cleanup =
      await removeLegacyServiceWorker();

    if (
      cleanup.hadController
      && sessionStorage.getItem(
        NATIVE_RUNTIME_MIGRATION_KEY
      ) !== VERSION
    ) {
      sessionStorage.setItem(
        NATIVE_RUNTIME_MIGRATION_KEY,
        VERSION
      );

      window.location.reload();
      return true;
    }

    sessionStorage.setItem(
      NATIVE_RUNTIME_MIGRATION_KEY,
      VERSION
    );

    return false;
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


// ========================================================================
// Phase G1 — pairing, annotation-file copy, image bounds
// - Web/Desktop exposes a QR for the Android scanner that already exists.
// - Current annotation file can be duplicated as an exact independent copy.
// - Drawing is clamped/trimmed to the level-0 image rectangle.
// ========================================================================

function phaseGRefs() {
  return {
    pairMenuButton: document.getElementById("phaseGPairAndroidButton"),
    pairOverlay: document.getElementById("phaseGPairOverlay"),
    pairServerInput: document.getElementById("phaseGPairServerInput"),
    pairWarning: document.getElementById("phaseGPairWarning"),
    pairQrImage: document.getElementById("phaseGPairQrImage"),
    pairRefresh: document.getElementById("phaseGPairRefreshButton"),
    pairCopy: document.getElementById("phaseGPairCopyButton"),
    pairClose: document.getElementById("phaseGPairCloseButton"),

    duplicateMenuButton: document.getElementById("phaseGDuplicateAnnotationButton"),
    duplicateOverlay: document.getElementById("phaseGDuplicateOverlay"),
    duplicateSource: document.getElementById("phaseGDuplicateSource"),
    duplicateName: document.getElementById("phaseGDuplicateNameInput"),
    duplicateMessage: document.getElementById("phaseGDuplicateMessage"),
    duplicateCreate: document.getElementById("phaseGDuplicateCreateButton"),
    duplicateCancel: document.getElementById("phaseGDuplicateCancelButton"),
  };
}

function phaseGDefaultPairingAddress() {
  if (IS_NATIVE) {
    return String(
      localStorage.getItem(NATIVE_SERVER_STORAGE_KEY)
      || ""
    ).replace(/\/+$/, "");
  }

  return `${window.location.origin}${BASE}`
    .replace(/\/+$/, "");
}

function phaseGPairingAddress() {
  const refs = phaseGRefs();
  return String(
    refs.pairServerInput?.value
    || phaseGDefaultPairingAddress()
    || ""
  )
    .trim()
    .replace(/\/+$/, "");
}

function phaseGUpdatePairWarning(address = phaseGPairingAddress()) {
  const refs = phaseGRefs();
  if (!refs.pairWarning) return;

  let host = "";
  try {
    host = new URL(address).hostname.toLowerCase();
  } catch (_) {
    refs.pairWarning.hidden = false;
    refs.pairWarning.textContent =
      "Enter a complete http:// or https:// address.";
    return;
  }

  if (
    host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
  ) {
    refs.pairWarning.hidden = false;
    refs.pairWarning.textContent =
      "This is a local-only address. Replace localhost/127.0.0.1 with the computer address that the tablet can reach.";
  } else {
    refs.pairWarning.hidden = true;
    refs.pairWarning.textContent = "";
  }
}

function phaseGRefreshPairQr() {
  const refs = phaseGRefs();
  if (!refs.pairQrImage) return;

  const address = phaseGPairingAddress();
  phaseGUpdatePairWarning(address);

  if (!/^https?:\/\//i.test(address)) {
    refs.pairQrImage.removeAttribute("src");
    return;
  }

  refs.pairQrImage.src =
    `${API}/pairing/qr.png?server=${encodeURIComponent(address)}&t=${Date.now()}`;
}

function phaseGOpenPairing() {
  phaseBToggleSettings(false);

  if (IS_NATIVE) {
    openConnectionSettings();
    phaseG2RenderRecentServers();
    return;
  }

  const refs = phaseGRefs();
  if (!refs.pairOverlay) return;

  refs.pairServerInput.value =
    phaseGDefaultPairingAddress();

  refs.pairOverlay.hidden = false;
  phaseGRefreshPairQr();
  refs.pairServerInput.focus();
  refs.pairServerInput.select();
}

function phaseGClosePairing() {
  const refs = phaseGRefs();
  if (refs.pairOverlay) refs.pairOverlay.hidden = true;
}

async function phaseGCopyPairingAddress() {
  const address = phaseGPairingAddress();
  if (!address) return;

  try {
    await navigator.clipboard.writeText(address);
    setStatus("Pairing address copied", "saved");
  } catch (_) {
    const refs = phaseGRefs();
    refs.pairServerInput?.focus();
    refs.pairServerInput?.select();
    setStatus(
      "Select and copy the pairing address manually",
      "local"
    );
  }
}

function phaseGSuggestAnnotationCopyName() {
  const source = String(
    currentAnnotationFile || "Default"
  ).trim() || "Default";

  const base = `${source} copy`;
  const used = new Set(
    (annotationFiles || [])
      .map((name) => String(name).trim().toLowerCase())
  );

  if (!used.has(base.toLowerCase())) return base;

  for (let number = 2; number < 1000; number += 1) {
    const candidate = `${base} ${number}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }

  return `${base} ${Date.now()}`;
}

function phaseGSetDuplicateMessage(message = "", error = false) {
  const refs = phaseGRefs();
  if (!refs.duplicateMessage) return;
  refs.duplicateMessage.textContent = message;
  refs.duplicateMessage.classList.toggle(
    "error",
    Boolean(error)
  );
}

function phaseGOpenDuplicateAnnotationFile() {
  phaseBToggleSettings(false);

  if (!currentImage) {
    setStatus(
      "Open an image before duplicating an annotation file",
      "error"
    );
    return;
  }

  const refs = phaseGRefs();
  if (!refs.duplicateOverlay) return;

  if (refs.duplicateSource) {
    refs.duplicateSource.textContent =
      `Copy of: ${currentAnnotationFile} · ${featureCollection.features?.length || 0} feature(s)`;
  }

  refs.duplicateName.value =
    phaseGSuggestAnnotationCopyName();

  phaseGSetDuplicateMessage("");
  refs.duplicateOverlay.hidden = false;
  refs.duplicateName.focus();
  refs.duplicateName.select();
}

function phaseGCloseDuplicateAnnotationFile() {
  const refs = phaseGRefs();
  if (refs.duplicateOverlay) {
    refs.duplicateOverlay.hidden = true;
  }
  phaseGSetDuplicateMessage("");
}

function phaseGValidAnnotationFileName(name) {
  return (
    /^[A-Za-z0-9 _.-]{1,80}$/.test(name)
    && name !== "."
    && name !== ".."
  );
}

async function phaseGCreateAnnotationFileCopy() {
  const refs = phaseGRefs();

  if (!currentImage) {
    phaseGSetDuplicateMessage(
      "No image is open.",
      true
    );
    return;
  }

  const target =
    String(refs.duplicateName?.value || "").trim();

  if (!phaseGValidAnnotationFileName(target)) {
    phaseGSetDuplicateMessage(
      "Use 1–80 letters, numbers, spaces, _, . or -.",
      true
    );
    return;
  }

  if (
    (annotationFiles || []).some(
      (name) =>
        String(name).trim().toLowerCase()
        === target.toLowerCase()
    )
  ) {
    phaseGSetDuplicateMessage(
      "An annotation file with that name already exists.",
      true
    );
    return;
  }

  const sourceName =
    String(currentAnnotationFile || "Default");
  const snapshot =
    deepClone(featureCollection);

  refs.duplicateCreate.disabled = true;
  phaseGSetDuplicateMessage("Creating copy…");

  let serverFileCreated = false;

  if (
    navigator.onLine
    && API
    && !currentImage.localNative
  ) {
    try {
      const response = await apiFetch(
        `${API}/annotations/${currentImage.id}/files`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: target }),
        }
      );

      const payload = await response.json();

      if (
        Array.isArray(payload?.files)
        && payload.files.length
      ) {
        annotationFiles = payload.files;
      }

      serverFileCreated = true;
    } catch (error) {
      console.warn(
        "Could not reserve copied annotation file on server; keeping local pending copy",
        error
      );
    }
  }

  if (
    !(annotationFiles || []).some(
      (name) =>
        String(name).trim().toLowerCase()
        === target.toLowerCase()
    )
  ) {
    annotationFiles.push(target);
  }

  await putMeta(
    `files:${currentImage.id}`,
    annotationFiles
  );

  currentAnnotationFile = target;
  featureCollection = snapshot;

  clearSelectedFeatures(false);
  undoStack = [];
  redoStack = [];
  pathologistDraft = null;
  activeDraft = null;
  pointerState = null;

  currentLocalRevision = 0;
  currentLastSyncedRevision = 0;
  currentPendingChangeCount = 0;

  // Copying a file must not increment feature versions or alter provenance.
  dirty = true;
  const revision = nextLocalRevision();
  currentPendingChangeCount = 1;
  localDraftState = "Saving copied file locally…";

  await persistLocalDraft(
    true,
    currentImage,
    deepClone(featureCollection),
    {
      annotationFile: target,
      localRevision: revision,
      lastSyncedRevision: 0,
      pendingChangeCount: 1,
    }
  );

  renderAnnotationFileOptions();
  drawAnnotations();
  updateControls();
  updateDiagnostics();

  refs.duplicateCreate.disabled = false;
  phaseGCloseDuplicateAnnotationFile();

  setStatus(
    `Copied "${sourceName}" → "${target}"`,
    "local"
  );

  if (
    navigator.onLine
    && !currentImage.localNative
  ) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () => saveAnnotations(false),
      serverFileCreated ? 25 : 250
    );
  }
}

function phaseGImageBounds() {
  const width = Number(currentInfo?.width || 0);
  const height = Number(currentInfo?.height || 0);

  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return null;
  }

  return { width, height };
}

function phaseGPointInsideImage(point) {
  const bounds = phaseGImageBounds();
  if (!bounds || !Array.isArray(point)) return false;

  const x = Number(point[0]);
  const y = Number(point[1]);

  return (
    Number.isFinite(x)
    && Number.isFinite(y)
    && x >= 0
    && y >= 0
    && x <= bounds.width
    && y <= bounds.height
  );
}

function phaseGClampPointToImage(point) {
  const bounds = phaseGImageBounds();
  if (!bounds || !Array.isArray(point)) return point;

  const x = Number(point[0]);
  const y = Number(point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return point;

  return [
    Math.max(0, Math.min(bounds.width, x)),
    Math.max(0, Math.min(bounds.height, y)),
  ];
}

function phaseGRawImagePointFromViewerPosition(viewerPosition) {
  const direct =
    imagePointFromViewerPosition(viewerPosition);

  if (direct) return direct;

  try {
    const viewportPoint =
      viewer.viewport.pointFromPixel(
        viewerPosition,
        true
      );

    const tiledImage =
      viewer.world.getItemAt(0);

    const imagePoint =
      tiledImage.viewportToImageCoordinates(
        viewportPoint
      );

    if (
      Number.isFinite(imagePoint?.x)
      && Number.isFinite(imagePoint?.y)
    ) {
      return [imagePoint.x, imagePoint.y];
    }
  } catch (_) {
    // Fall through to null.
  }

  return null;
}

function phaseGClampedImagePointFromViewerPosition(viewerPosition) {
  const raw =
    phaseGRawImagePointFromViewerPosition(
      viewerPosition
    );

  return raw
    ? phaseGClampPointToImage(raw)
    : null;
}

function phaseGImageBoundsGeometry() {
  const bounds = phaseGImageBounds();
  if (!bounds) return null;

  return polygonGeometry([
    [0, 0],
    [bounds.width, 0],
    [bounds.width, bounds.height],
    [0, bounds.height],
  ]);
}

async function phaseGClipGeometryToImage(geometry) {
  if (!geometry) return null;

  const boundsGeometry =
    phaseGImageBoundsGeometry();

  if (!boundsGeometry) return geometry;

  try {
    if (window.polygonClipping) {
      return localBooleanGeometry(
        geometry,
        boundsGeometry,
        "intersect"
      );
    }
  } catch (error) {
    console.warn(
      "Local image-bound clipping failed; trying server geometry",
      error
    );
  }

  return await requestBooleanGeometry(
    geometry,
    boundsGeometry,
    "intersect"
  );
}

function phaseGInitialize() {
  const refs = phaseGRefs();

  if (refs.pairMenuButton) {
    refs.pairMenuButton.textContent =
      IS_NATIVE
        ? "Connection…"
        : "Pair Android…";

    refs.pairMenuButton.addEventListener(
      "click",
      phaseGOpenPairing
    );
  }

  refs.pairRefresh?.addEventListener(
    "click",
    phaseGRefreshPairQr
  );
  refs.pairCopy?.addEventListener(
    "click",
    phaseGCopyPairingAddress
  );
  refs.pairClose?.addEventListener(
    "click",
    phaseGClosePairing
  );
  refs.pairServerInput?.addEventListener(
    "input",
    () => phaseGUpdatePairWarning()
  );
  refs.pairServerInput?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        phaseGRefreshPairQr();
      }
      if (event.key === "Escape") {
        phaseGClosePairing();
      }
    }
  );
  refs.pairOverlay?.addEventListener(
    "click",
    (event) => {
      if (event.target === refs.pairOverlay) {
        phaseGClosePairing();
      }
    }
  );

  refs.duplicateMenuButton?.addEventListener(
    "click",
    phaseGOpenDuplicateAnnotationFile
  );
  refs.duplicateCreate?.addEventListener(
    "click",
    phaseGCreateAnnotationFileCopy
  );
  refs.duplicateCancel?.addEventListener(
    "click",
    phaseGCloseDuplicateAnnotationFile
  );
  refs.duplicateName?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        phaseGCreateAnnotationFileCopy();
      }
      if (event.key === "Escape") {
        phaseGCloseDuplicateAnnotationFile();
      }
    }
  );
  refs.duplicateOverlay?.addEventListener(
    "click",
    (event) => {
      if (event.target === refs.duplicateOverlay) {
        phaseGCloseDuplicateAnnotationFile();
      }
    }
  );
}



// ========================================================================
// Phase IL1 — interactive learning foundation
//
// Suggestions stay outside featureCollection until Accept/Edit.
// Therefore Review, Statistics, GeoJSON and sync remain unchanged.
// ========================================================================

const PHASE_IL1_REJECTION_KEY =
  "histoannotator.il1.rejections.v1";

let phaseIL1State = {
  open: false,
  busy: false,
  suggestions: [],
  index: 0,
  targetClass: null,
  model: null,
  summary: null,
  documentKey: null,
  applyingSuggestion: false,
};


function phaseIL1Refs() {
  return {
    menu:
      document.getElementById(
        "phaseIL1MenuButton"
      ),
    overlay:
      document.getElementById(
        "phaseIL1Overlay"
      ),
    close:
      document.getElementById(
        "phaseIL1CloseButton"
      ),
    classSelect:
      document.getElementById(
        "phaseIL1ClassSelect"
      ),
    sensitivity:
      document.getElementById(
        "phaseIL1Sensitivity"
      ),
    sensitivityValue:
      document.getElementById(
        "phaseIL1SensitivityValue"
      ),
    smoothing:
      document.getElementById(
        "phaseIL1Smoothing"
      ),
    smoothingValue:
      document.getElementById(
        "phaseIL1SmoothingValue"
      ),
    minArea:
      document.getElementById(
        "phaseIL1MinArea"
      ),
    excludeAnnotated:
      document.getElementById(
        "phaseIL1ExcludeAnnotated"
      ),
    run:
      document.getElementById(
        "phaseIL1RunButton"
      ),
    clear:
      document.getElementById(
        "phaseIL1ClearButton"
      ),
    trainingInfo:
      document.getElementById(
        "phaseIL1TrainingInfo"
      ),
    suggestionPanel:
      document.getElementById(
        "phaseIL1SuggestionPanel"
      ),
    counter:
      document.getElementById(
        "phaseIL1SuggestionCounter"
      ),
    info:
      document.getElementById(
        "phaseIL1SuggestionInfo"
      ),
    previous:
      document.getElementById(
        "phaseIL1PrevButton"
      ),
    next:
      document.getElementById(
        "phaseIL1NextButton"
      ),
    reject:
      document.getElementById(
        "phaseIL1RejectButton"
      ),
    edit:
      document.getElementById(
        "phaseIL1EditButton"
      ),
    accept:
      document.getElementById(
        "phaseIL1AcceptButton"
      ),
  };
}


function phaseIL1EnsureUi() {
  if (
    document.getElementById(
      "phaseIL1Overlay"
    )
  ) {
    return;
  }

  const duplicate =
    document.getElementById(
      "phaseGDuplicateAnnotationButton"
    );

  if (!duplicate?.parentElement) {
    throw new Error(
      "Interactive Learning could not find Settings"
    );
  }

  const separator =
    document.createElement("div");

  separator.className =
    "menu-separator phase-il1-settings-separator";

  const menuButton =
    document.createElement("button");

  menuButton.id =
    "phaseIL1MenuButton";
  menuButton.type =
    "button";
  menuButton.className =
    duplicate.className || "menu-item";
  menuButton.textContent =
    "Interactive Learning…";

  duplicate.insertAdjacentElement(
    "afterend",
    separator
  );

  separator.insertAdjacentElement(
    "afterend",
    menuButton
  );

  const overlay =
    document.createElement("div");

  overlay.id =
    "phaseIL1Overlay";
  overlay.className =
    "phase-il1-overlay";
  overlay.hidden =
    true;

  overlay.innerHTML = `
    <section class="phase-il1-card"
             role="dialog"
             aria-labelledby="phaseIL1Title">
      <div class="phase-il1-header">
        <div>
          <h2 id="phaseIL1Title">
            Interactive Learning
          </h2>
          <p>
            Learn from annotations in the current
            file and preview suggestions.
          </p>
        </div>
        <button id="phaseIL1CloseButton"
                type="button"
                class="phase-il1-close"
                aria-label="Close">×</button>
      </div>

      <div class="phase-il1-grid">
        <label>
          <span>Target class</span>
          <select id="phaseIL1ClassSelect"></select>
        </label>

        <label>
          <span>
            Sensitivity
            <output id="phaseIL1SensitivityValue">
              50
            </output>
          </span>
          <input id="phaseIL1Sensitivity"
                 type="range"
                 min="0"
                 max="100"
                 step="5"
                 value="50">
        </label>

        <label>
          <span>
            Smoothing
            <output id="phaseIL1SmoothingValue">
              45
            </output>
          </span>
          <input id="phaseIL1Smoothing"
                 type="range"
                 min="0"
                 max="100"
                 step="5"
                 value="45">
        </label>

        <label>
          <span>
            Minimum suggestion area
            (% valid region)
          </span>
          <input id="phaseIL1MinArea"
                 type="number"
                 min="0"
                 max="5"
                 step="0.01"
                 value="0.02">
        </label>

        <label class="phase-il1-checkbox">
          <input id="phaseIL1ExcludeAnnotated"
                 type="checkbox"
                 checked>
          <span>
            Suggest only currently unannotated tissue
          </span>
        </label>
      </div>

      <div class="phase-il1-run-row">
        <button id="phaseIL1RunButton"
                type="button">
          Learn & suggest
        </button>
        <button id="phaseIL1ClearButton"
                type="button">
          Clear
        </button>
      </div>

      <div id="phaseIL1TrainingInfo"
           class="phase-il1-training-info">
        Choose a class with existing annotations.
      </div>

      <div id="phaseIL1SuggestionPanel"
           class="phase-il1-suggestion-panel"
           hidden>
        <div class="phase-il1-suggestion-top">
          <button id="phaseIL1PrevButton"
                  type="button">‹</button>

          <strong id="phaseIL1SuggestionCounter">
            Suggestion
          </strong>

          <button id="phaseIL1NextButton"
                  type="button">›</button>
        </div>

        <div id="phaseIL1SuggestionInfo"
             class="phase-il1-suggestion-info">
        </div>

        <div class="phase-il1-actions">
          <button id="phaseIL1RejectButton"
                  type="button">
            Reject
          </button>

          <button id="phaseIL1EditButton"
                  type="button">
            Edit
          </button>

          <button id="phaseIL1AcceptButton"
                  type="button">
            Accept
          </button>
        </div>
      </div>

      <p class="phase-il1-note">
        Suggestions are temporary. Accept/Edit creates
        a normal Draft annotation; Reject does not
        modify the GeoJSON.
      </p>
    </section>
  `;

  document.body.append(overlay);
}


function phaseIL1DocumentKey() {
  if (!currentImage?.id) return "";

  return (
    `${currentImage.id}::`
    + `${currentAnnotationFile || "Default"}`
  );
}


function phaseIL1BiologicalClasses() {
  return (classes || []).filter(
    (item) => {
      const name =
        String(
          item?.name || ""
        ).trim();

      return (
        name
        && name.toLowerCase()
          !== "artifact"
      );
    }
  );
}


function phaseIL1TargetAnnotationCount(
  name
) {
  const wanted =
    String(name || "")
      .trim()
      .toLowerCase();

  return (
    featureCollection.features
    || []
  ).filter(
    (feature) => {
      if (
        !phaseDIsAnnotationFeature(
          feature
        )
      ) {
        return false;
      }

      const className =
        String(
          feature?.properties
            ?.classification
            ?.name
          || ""
        )
        .trim()
        .toLowerCase();

      return className === wanted;
    }
  ).length;
}


function phaseIL1PopulateClasses() {
  const refs =
    phaseIL1Refs();

  if (!refs.classSelect) return;

  const options =
    phaseIL1BiologicalClasses();

  const previous =
    String(
      refs.classSelect.value
      || phaseIL1State.targetClass
      || currentClass?.name
      || ""
    );

  refs.classSelect.innerHTML =
    "";

  for (const item of options) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.name;
    option.textContent =
      item.name;

    refs.classSelect.append(
      option
    );
  }

  const matched =
    options.find(
      (item) =>
        String(
          item.name
        ).toLowerCase()
        === previous.toLowerCase()
    );

  if (matched) {
    refs.classSelect.value =
      matched.name;
  } else if (options.length) {
    refs.classSelect.value =
      options[0].name;
  }

  phaseIL1UpdateTrainingHint();
}


function phaseIL1UpdateTrainingHint(
  message = ""
) {
  const refs =
    phaseIL1Refs();

  if (!refs.trainingInfo) return;

  if (message) {
    refs.trainingInfo.textContent =
      message;
    return;
  }

  const target =
    String(
      refs.classSelect?.value
      || ""
    );

  const count =
    phaseIL1TargetAnnotationCount(
      target
    );

  refs.trainingInfo.textContent =
    target
      ? (
          `${count} existing ${target} `
          + `annotation${count === 1 ? "" : "s"} `
          + "will be used as positive examples."
        )
      : "Choose a target class.";
}


function phaseIL1CurrentSuggestion() {
  if (
    phaseIL1State.documentKey
    !== phaseIL1DocumentKey()
  ) {
    phaseIL1ClearSuggestions(
      "Image or annotation file changed. Run Learn & suggest again.",
      true
    );
    return null;
  }

  if (
    !phaseIL1State.suggestions.length
  ) {
    return null;
  }

  phaseIL1State.index =
    Math.max(
      0,
      Math.min(
        phaseIL1State.index,
        phaseIL1State
          .suggestions.length - 1
      )
    );

  return (
    phaseIL1State
      .suggestions[
        phaseIL1State.index
      ]
    || null
  );
}


function phaseIL1FormatArea(area) {
  const value =
    Number(area || 0);

  const calibration =
    effectiveCalibration();

  if (
    calibration?.mpp
    && Number.isFinite(
      Number(calibration.mpp)
    )
    && Number(calibration.mpp) > 0
  ) {
    const mpp =
      Number(calibration.mpp);

    const mm2 =
      value
      * mpp
      * mpp
      / 1000000;

    return (
      `${formatStatNumber(value)} px²`
      + ` · ${mm2.toFixed(4)} mm²`
    );
  }

  return (
    `${formatStatNumber(value)} px²`
  );
}


function phaseIL1RenderSuggestionState() {
  const refs =
    phaseIL1Refs();

  const suggestion =
    phaseIL1CurrentSuggestion();

  const total =
    phaseIL1State
      .suggestions.length;

  if (!refs.suggestionPanel) return;

  refs.suggestionPanel.hidden =
    !suggestion;

  if (!suggestion) {
    drawAnnotations();
    return;
  }

  phaseIL21ResetClassForSuggestion();
  phaseIL22ResetOverlayForSuggestion();
  phaseIL21SetEditingUi(false);

  if (refs.counter) {
    refs.counter.textContent =
      `Suggestion ${phaseIL1State.index + 1} / ${total}`;
  }

  if (refs.info) {
    const confidence =
      Number(
        suggestion.confidence || 0
      ) * 100;

    refs.info.textContent =
      `${phaseIL1State.targetClass}`
      + ` · ${phaseIL1FormatArea(suggestion.areaPx2)}`
      + ` · confidence ${confidence.toFixed(0)}%`
      + (
          suggestion.reviewLater
            ? " · Review later"
            : ""
        );
  }

  if (refs.previous) {
    refs.previous.disabled =
      total < 2;
  }

  if (refs.next) {
    refs.next.disabled =
      total < 2;
  }

  phaseIL11CenterCurrentSuggestion();
  drawAnnotations();
}


function phaseIL1ClearSuggestions(
  message = "",
  redraw = true
) {
  phaseIL1State.suggestions =
    [];
  phaseIL1State.index =
    0;
  phaseIL1State.model =
    null;
  phaseIL1State.summary =
    null;
  phaseIL1State.documentKey =
    phaseIL1DocumentKey();

  const refs =
    phaseIL1Refs();

  if (refs.suggestionPanel) {
    refs.suggestionPanel.hidden =
      true;
  }

  if (message) {
    phaseIL1UpdateTrainingHint(
      message
    );
  } else {
    phaseIL1UpdateTrainingHint();
  }

  if (redraw) {
    drawAnnotations();
  }
}


function phaseIL1Close() {
  phaseIL1State.open =
    false;

  phaseIL1ClearSuggestions(
    "",
    false
  );

  const refs =
    phaseIL1Refs();

  if (refs.overlay) {
    refs.overlay.hidden =
      true;
  }

  drawAnnotations();
}


function phaseIL1Open() {
  phaseBToggleSettings(false);

  if (
    !currentImage
    || !currentInfo
  ) {
    setStatus(
      "Open an image before Interactive Learning",
      "error"
    );
    return;
  }

  if (currentImage.localNative) {
    setStatus(
      "Interactive Learning currently requires a connected HistoAnnotator server",
      "error"
    );
    return;
  }

  if (
    String(
      imageType || ""
    ).toLowerCase()
    === "fluorescence"
  ) {
    setStatus(
      "IL1 currently supports H&E, H-DAB and RGB appearance learning",
      "error"
    );
    return;
  }

  const refs =
    phaseIL1Refs();

  if (!refs.overlay) return;

  phaseIL1State.open =
    true;
  phaseIL1State.documentKey =
    phaseIL1DocumentKey();

  phaseIL1ClearSuggestions(
    "",
    false
  );

  phaseIL1PopulateClasses();

  refs.overlay.hidden =
    false;

  drawAnnotations();
}


function phaseIL1SetBusy(busy) {
  phaseIL1State.busy =
    Boolean(busy);

  const refs =
    phaseIL1Refs();

  for (const control of [
    refs.run,
    refs.classSelect,
    refs.sensitivity,
    refs.smoothing,
    refs.minArea,
    refs.excludeAnnotated,
  ]) {
    if (control) {
      control.disabled =
        phaseIL1State.busy;
    }
  }

  if (refs.run) {
    refs.run.textContent =
      phaseIL1State.busy
        ? "Learning…"
        : "Learn & suggest";
  }
}



// ========================================================================
// Phase IL3 - active learning suggestion prioritization
// ========================================================================

function phaseIL3Clamp01(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}


function phaseIL3SuggestionPriority(
  suggestion,
  maxArea
) {
  const confidence =
    phaseIL3Clamp01(
      suggestion?.confidence
    );

  const uncertainty =
    confidence === null
      ? 0.35
      : (
          1
          - Math.min(
              1,
              Math.abs(
                confidence - 0.5
              ) * 2
            )
        );

  const area =
    Math.max(
      0,
      Number(
        suggestion?.areaPx2
        || 0
      )
    );

  const safeMaxArea =
    Math.max(
      1,
      Number(maxArea || 1)
    );

  const areaScore =
    Math.log1p(area)
    / Math.log1p(
        safeMaxArea
      );

  const priority =
    (
      0.80 * uncertainty
      + 0.20 * areaScore
    );

  return {
    priority,
    uncertainty,
    areaScore,
  };
}


function phaseIL3PrioritizeSuggestions() {
  const suggestions =
    phaseIL1State.suggestions;

  if (
    !Array.isArray(suggestions)
    || suggestions.length < 2
  ) {
    return;
  }

  const maxArea =
    Math.max(
      1,
      ...suggestions.map(
        (item) =>
          Math.max(
            0,
            Number(
              item?.areaPx2
              || 0
            )
          )
      )
    );

  const ranked =
    suggestions.map(
      (suggestion, originalIndex) => {
        const score =
          phaseIL3SuggestionPriority(
            suggestion,
            maxArea
          );

        return {
          suggestion,
          originalIndex,
          ...score,
        };
      }
    );

  ranked.sort(
    (a, b) => {
      const priorityDelta =
        b.priority
        - a.priority;

      if (
        Math.abs(priorityDelta)
        > 1e-9
      ) {
        return priorityDelta;
      }

      return (
        a.originalIndex
        - b.originalIndex
      );
    }
  );

  phaseIL1State.suggestions =
    ranked.map(
      (item, rank) => ({
        ...item.suggestion,
        _activeLearning: {
          rank:
            rank + 1,
          priority:
            item.priority,
          uncertainty:
            item.uncertainty,
          areaScore:
            item.areaScore,
        },
      })
    );
}

async function phaseIL1Run() {
  if (
    phaseIL1State.busy
    || !currentImage
    || currentImage.localNative
  ) {
    return;
  }

  const refs =
    phaseIL1Refs();

  const targetClass =
    String(
      refs.classSelect?.value
      || ""
    ).trim();

  if (!targetClass) {
    phaseIL1UpdateTrainingHint(
      "Choose a target class."
    );
    return;
  }

  const count =
    phaseIL1TargetAnnotationCount(
      targetClass
    );

  if (count < 1) {
    phaseIL1UpdateTrainingHint(
      `Annotate some ${targetClass} first, then run learning again.`
    );
    return;
  }

  const minArea =
    Number(
      refs.minArea?.value
      || 0.02
    );

  if (
    !Number.isFinite(minArea)
    || minArea < 0
    || minArea > 5
  ) {
    phaseIL1UpdateTrainingHint(
      "Minimum suggestion area must be between 0 and 5%."
    );
    return;
  }

  phaseIL1SetBusy(true);

  phaseIL1State.targetClass =
    targetClass;

  phaseIL1ClearSuggestions(
    (
      `Learning ${targetClass} appearance `
      + `from ${count} annotation`
      + `${count === 1 ? "" : "s"}…`
    ),
    true
  );

  try {
    const response =
      await apiFetch(
        `${API}/interactive-learning/${currentImage.id}/suggest`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            targetClass,
            feedback:
              phaseIL2FeedbackPayload(
                targetClass
              ),
            featureCollection: await phaseIL11FeatureCollectionForLearning(),
            sensitivity:
              Number(
                refs.sensitivity?.value
                || 50
              ),
            smoothing:
              Number(
                refs.smoothing?.value
                || 45
              ),
            minAreaPercent:
              minArea,
            excludeAnnotated:
              Boolean(
                refs.excludeAnnotated
                  ?.checked
              ),
            maxSuggestions:
              40,
            // IL5.1: higher-resolution inference for finer borders.
            maxSide:
              1600,
          }),
          timeoutMs:
            60000,
        }
      );

    const payload =
      await response.json();

    phaseIL1State.suggestions =
      Array.isArray(
        payload?.suggestions
      )
        ? payload.suggestions
            .filter(
              (item) =>
                item?.geometry
            )
            .map(
              (item, index) => ({
                ...item,
                id:
                  item.id
                  || `il1-${index + 1}`,
              })
            )
        : [];

    phaseIL3PrioritizeSuggestions();

    phaseIL1State.index =
      0;
    phaseIL1State.model =
      payload?.model || null;
    phaseIL1State.summary =
      payload?.summary || null;
    phaseIL1State.documentKey =
      phaseIL1DocumentKey();

    const model =
      phaseIL1State.model;

    const suggestionCount =
      phaseIL1State
        .suggestions.length;

    const feedbackSummary =
      phaseIL2FeedbackSummary(
        targetClass
      );

    phaseIL1UpdateTrainingHint(
      (
        `${model?.type || "IL1"}`
        + ` · ${model?.positiveTrainingPixels || 0} positive`
        + ` + ${model?.negativeTrainingPixels || 0} negative samples`
        + ` · negatives: ${model?.negativeSource || "context"}`
        + ` · ${suggestionCount} suggestion`
        + `${suggestionCount === 1 ? "" : "s"}.`
      + ` · feedback A:${feedbackSummary.accepted}`
      + ` R:${feedbackSummary.rejected}`
      + ` E:${feedbackSummary.edited}`
      + ` C:${feedbackSummary.reclassified}`)
    );

    // Phase IL2.4 - clean suggestion review status
    phaseIL1UpdateTrainingHint("");
    phaseIL1RenderSuggestionState();

    setStatus(
      suggestionCount
        ? (
            `Interactive Learning found `
            + `${suggestionCount} suggestion`
            + `${suggestionCount === 1 ? "" : "s"}`
          )
        : (
            "Interactive Learning found no suggestions at these settings"
          ),
      suggestionCount
        ? "saved"
        : "local"
    );
  } catch (error) {
    phaseIL1ClearSuggestions(
      (
        "Interactive Learning could not run: "
        + `${error?.message || error}`
      ),
      true
    );

    setStatus(
      (
        "Interactive Learning failed: "
        + `${error?.message || error}`
      ),
      "error"
    );
  } finally {
    phaseIL1SetBusy(false);
  }
}


function phaseIL1DrawRing(
  ring,
  color,
  width = 2.0
) {
  if (
    !Array.isArray(ring)
    || ring.length < 2
  ) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.95;

  let started = false;

  for (const point of ring) {
    const screen =
      screenPointFromImage(
        point
      );

    if (!screen) continue;

    if (!started) {
      ctx.moveTo(
        screen.x,
        screen.y
      );
      started = true;
    } else {
      ctx.lineTo(
        screen.x,
        screen.y
      );
    }
  }

  if (started) {
    ctx.stroke();
  }

  ctx.restore();
}


function phaseIL1DrawGeometry(
  geometry,
  color,
  width
) {
  if (!geometry) return;

  if (
    geometry.type === "Polygon"
  ) {
    for (
      const ring
      of geometry.coordinates || []
    ) {
      phaseIL1DrawRing(
        ring,
        color,
        width
      );
    }
    return;
  }

  if (
    geometry.type
    === "MultiPolygon"
  ) {
    for (
      const polygon
      of geometry.coordinates || []
    ) {
      for (
        const ring
        of polygon || []
      ) {
        phaseIL1DrawRing(
          ring,
          color,
          width
        );
      }
    }
  }
}


function phaseIL1DrawSuggestions() {
  // IL2.2: current suggestion bright yellow + translucent fill.
  if (
    !phaseIL1State.open
    || !phaseIL1State.suggestions.length
    || phaseIL1State.documentKey
      !== phaseIL1DocumentKey()
  ) {
    return;
  }

  for (
    let index = 0;
    index < phaseIL1State.suggestions.length;
    index += 1
  ) {
    const suggestion =
      phaseIL1State.suggestions[index];

    const current =
      index === phaseIL1State.index;

    if (
      current
      && !phaseIL22SuggestionOverlayVisible
    ) {
      continue;
    }

    if (current) {
      phaseIL22FillGeometry(
        suggestion.geometry,
        "#fff200"
      );
    }

    phaseIL1DrawGeometry(
      suggestion.geometry,
      current
        ? "#fff200"
        : "#ffb000",
      current
        ? 3.6
        : 1.4
    );
  }
}



function phaseIL1RemoveCurrentSuggestion() {
  if (
    !phaseIL1State
      .suggestions.length
  ) {
    return;
  }

  phaseIL1State
    .suggestions.splice(
      phaseIL1State.index,
      1
    );

  if (
    phaseIL1State.index
    >= phaseIL1State
      .suggestions.length
  ) {
    phaseIL1State.index =
      Math.max(
        0,
        phaseIL1State
          .suggestions.length - 1
      );
  }

  phaseIL1RenderSuggestionState();
}


function phaseIL1StoreRejection(
  suggestion
) {
  if (
    !suggestion
    || !currentImage
  ) {
    return;
  }

  let items = [];

  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          PHASE_IL1_REJECTION_KEY
        )
        || "[]"
      );

    if (Array.isArray(parsed)) {
      items = parsed;
    }
  } catch (_) {
    items = [];
  }

  items.unshift({
    imageId:
      currentImage.id,
    annotationFile:
      currentAnnotationFile,
    targetClass:
      phaseIL1State.targetClass,
    rejectedAt:
      new Date().toISOString(),
    model:
      phaseIL1State.model?.type
      || "appearance-centroid-v1",
    confidence:
      Number(
        suggestion.confidence
        || 0
      ),
    areaPx2:
      Number(
        suggestion.areaPx2
        || 0
      ),
    geometry:
      deepClone(
        suggestion.geometry
      ),
  });

  try {
    localStorage.setItem(
      PHASE_IL1_REJECTION_KEY,
      JSON.stringify(
        items.slice(0, 200)
      )
    );
  } catch (_) {}
}


function phaseIL1Reject() {
  const suggestion =
    phaseIL1CurrentSuggestion();

  if (!suggestion) return;

  phaseIL1StoreRejection(
    suggestion
  );

  phaseIL1RemoveCurrentSuggestion();

  setStatus(
    "Suggestion rejected · feedback stored locally",
    "local"
  );
}


function phaseIL1AcceptedFeature(
  suggestion,
  targetClass
) {
  const classInfo =
    (classes || []).find(
      (item) =>
        String(
          item?.name || ""
        ).toLowerCase()
        === String(
          targetClass || ""
        ).toLowerCase()
    );

  if (!classInfo) {
    return null;
  }

  const metadata =
    phaseCCreateMetadata();

  metadata.interactiveLearning = {
    source:
      "IL2",
    decision:
      "accepted",
    originalTargetClass:
      targetClass,
    model:
      phaseIL1State.model?.type
      || "appearance-centroid-v1",
    acceptedAt:
      new Date().toISOString(),
    confidence:
      Number(
        suggestion.confidence
        || 0
      ),
    targetClass:
      classInfo.name,
  };

  return {
    type: "Feature",
    id: uid(),
    geometry:
      deepClone(
        suggestion.geometry
      ),
    properties: {
      objectType:
        "annotation",
      classification: {
        name:
          classInfo.name,
        color:
          hexToRgbArray(
            classInfo.color
          ),
      },
      isLocked:
        false,
      histoannotator:
        metadata,
    },
  };
}


function phaseIL1AcceptCurrent(
  editAfter = false
) {
  if (
    phaseIL21EditSession
    && !editAfter
  ) {
    phaseIL21FinishEdit();
    return;
  }

  const suggestion =
    phaseIL1CurrentSuggestion();

  if (!suggestion) return;

  if (editAfter) {
    phaseIL21StartEdit(
      suggestion
    );
    return;
  }

  const finalClass =
    phaseIL21SelectedClass();

  if (!finalClass) {
    setStatus(
      "Choose a class before accepting",
      "error"
    );
    return;
  }

  const feature =
    phaseIL1AcceptedFeature(
      suggestion,
      finalClass
    );

  if (!feature) {
    setStatus(
      "Selected class no longer exists",
      "error"
    );
    return;
  }

  phaseIL21MarkDecision(
    feature,
    finalClass,
    false
  );

  pushUndo();

  featureCollection.features.push(
    feature
  );

  phaseIL1State.applyingSuggestion = true;

  setSingleSelection(
    String(feature.id),
    true
  );

  markChanged();

  phaseIL1State.applyingSuggestion = false;

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL1RemoveCurrentSuggestion();

  setStatus(
    `${finalClass} suggestion accepted as Draft`,
    "saved"
  );
}



function phaseIL1AnnotationsChanged() {
  if (
    phaseIL1State.applyingSuggestion
    || phaseIL21EditSession
    || !phaseIL1State.suggestions.length
  ) {
    return;
  }

  phaseIL1ClearSuggestions(
    (
      "Annotations changed. Run Learn & suggest "
      + "again so predictions use the latest examples."
    ),
    false
  );
}




// ========================================================================
// Phase IL1.1 — suggestion review, effective ROI, Focus/mobile UX
// ========================================================================

async function phaseIL11FeatureCollectionForLearning() {
  const learningCollection =
    deepClone(featureCollection);

  const roi =
    phaseDTissueRoiFeature();

  if (!roi) {
    return learningCollection;
  }

  const borderConfig =
    phaseDBorderConfigForRoi(roi);

  const usesExternalBorder =
    Boolean(borderConfig?.enabled)
    && Number(borderConfig?.percent || 0) > 0;

  if (!usesExternalBorder) {
    return learningCollection;
  }

  let effectivePreview =
    phaseDEffectivePreviewForRoi(roi);

  if (!effectivePreview?.geometry) {
    /*
     * After reopening a file, the effective preview may not yet be hydrated.
     * Rebuild it now and wait, rather than running IL1 against the larger
     * base ROI for one cycle.
     */
    try {
      phaseDLoadBorderControlsFromRoi();

      await phaseDRefreshBorderPreview({
        saveConfig: false,
        quiet: true,
      });
    } catch (_) {
      try {
        phaseDEnsureStoredEffectivePreview();
      } catch (_) {}
    }

    effectivePreview =
      phaseDEffectivePreviewForRoi(roi);
  }

  if (!effectivePreview?.geometry) {
    throw new Error(
      "The effective Tissue ROI could not be prepared for Interactive Learning."
    );
  }

  const roiId =
    String(roi?.id || "");

  const learningRoi =
    (learningCollection.features || []).find(
      (feature) => {
        if (
          roiId
          && String(feature?.id || "") === roiId
        ) {
          return true;
        }

        return phaseDIsTissueRoi(feature);
      }
    );

  if (!learningRoi) {
    throw new Error(
      "Tissue ROI could not be prepared for Interactive Learning."
    );
  }

  /*
   * The backend already subtracts Artifact. By replacing only the ROI
   * geometry in this transient payload, IL1 learns/infers inside:
   *
   *   effective Tissue ROI - Artifact
   *
   * without modifying the stored/base Tissue ROI.
   */
  learningRoi.geometry =
    deepClone(effectivePreview.geometry);

  return learningCollection;
}


function phaseIL11GeometryBounds(
  geometry
) {
  if (!geometry?.coordinates) {
    return null;
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const visit = (value) => {
    if (!Array.isArray(value)) {
      return;
    }

    if (
      value.length >= 2
      && Number.isFinite(Number(value[0]))
      && Number.isFinite(Number(value[1]))
      && !Array.isArray(value[0])
      && !Array.isArray(value[1])
    ) {
      const x = Number(value[0]);
      const y = Number(value[1]);

      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
      return;
    }

    for (const child of value) {
      visit(child);
    }
  };

  visit(geometry.coordinates);

  if (
    !Number.isFinite(bounds.minX)
    || !Number.isFinite(bounds.minY)
    || !Number.isFinite(bounds.maxX)
    || !Number.isFinite(bounds.maxY)
  ) {
    return null;
  }

  return bounds;
}


function phaseIL11CenterCurrentSuggestion() {
  const suggestion =
    phaseIL1CurrentSuggestion();

  if (
    !suggestion?.geometry
    || !viewer
    || !viewer.world?.getItemCount?.()
  ) {
    return;
  }

  const bounds =
    phaseIL11GeometryBounds(
      suggestion.geometry
    );

  if (!bounds) return;

  const centerX =
    (bounds.minX + bounds.maxX) / 2;
  const centerY =
    (bounds.minY + bounds.maxY) / 2;

  const tiledImage =
    viewer.world.getItemAt(0);

  if (
    !tiledImage
    || typeof tiledImage
      .imageToViewportCoordinates
      !== "function"
  ) {
    return;
  }

  const viewportPoint =
    tiledImage.imageToViewportCoordinates(
      centerX,
      centerY
    );

  if (!viewportPoint) return;

  /*
   * Preserve the user's zoom. Only pan, matching Review-style
   * annotation-by-annotation navigation.
   */
  viewer.viewport.panTo(
    viewportPoint,
    false
  );

  viewer.viewport.applyConstraints(
    false
  );
}


function phaseIL11FocusModeLetter() {
  if (mode === "navigate") {
    return "M";
  }

  if (mode === "select") {
    return "S";
  }

  return "F";
}


function phaseIL11EnsureFocusModeControl() {
  if (
    document.getElementById(
      "phaseIL11FocusModeButton"
    )
  ) {
    return;
  }

  const classButton =
    document.getElementById(
      "phaseBFocusClassesButton"
    );

  const classWrap =
    classButton?.parentElement;

  if (!classButton || !classWrap) {
    return;
  }

  const topRow =
    document.createElement("div");

  topRow.className =
    "phase-il11-focus-top-row";

  classWrap.insertBefore(
    topRow,
    classButton
  );

  topRow.append(classButton);

  const modeWrap =
    document.createElement("div");

  modeWrap.className =
    "phase-il11-focus-mode-wrap";

  const modeButton =
    document.createElement("button");

  modeButton.id =
    "phaseIL11FocusModeButton";
  modeButton.type =
    "button";
  modeButton.className =
    "phase-il11-focus-mode-button";
  modeButton.setAttribute(
    "aria-expanded",
    "false"
  );
  modeButton.title =
    "Mode · M Move · F Draw · S Select";

  const strip =
    document.createElement("div");

  strip.id =
    "phaseIL11FocusModeStrip";
  strip.className =
    "phase-il11-focus-mode-strip";
  strip.hidden =
    true;

  const choices = [
    ["navigate", "M", "Move"],
    ["freehand", "F", "Draw · Freehand"],
    ["select", "S", "Select"],
  ];

  for (
    const [modeName, letter, label]
    of choices
  ) {
    const button =
      document.createElement("button");

    button.type =
      "button";
    button.className =
      "phase-il11-focus-mode-choice";
    button.dataset.mode =
      modeName;
    button.textContent =
      letter;
    button.title =
      `${letter} · ${label}`;
    button.setAttribute(
      "aria-label",
      `${letter} · ${label}`
    );

    button.addEventListener(
      "click",
      () => {
        setMode(modeName);
        phaseIL11SetFocusModesOpen(
          false
        );
      }
    );

    strip.append(button);
  }

  modeWrap.append(
    modeButton,
    strip
  );

  topRow.append(modeWrap);

  modeButton.addEventListener(
    "click",
    () => {
      const open =
        strip.hidden;

      if (open) {
        phaseBSetFocusClassesOpen(
          false
        );
      }

      phaseIL11SetFocusModesOpen(
        open
      );
    }
  );

  classButton.addEventListener(
    "click",
    () =>
      phaseIL11SetFocusModesOpen(
        false
      )
  );

  document
    .getElementById(
      "phaseBExitFocusButton"
    )
    ?.addEventListener(
      "click",
      () =>
        phaseIL11SetFocusModesOpen(
          false
        )
    );

  phaseIL11UpdateFocusModeControl();
}


function phaseIL11SetFocusModesOpen(
  open
) {
  const button =
    document.getElementById(
      "phaseIL11FocusModeButton"
    );

  const strip =
    document.getElementById(
      "phaseIL11FocusModeStrip"
    );

  if (!button || !strip) return;

  strip.hidden =
    !Boolean(open);

  button.setAttribute(
    "aria-expanded",
    String(Boolean(open))
  );
}


function phaseIL11UpdateFocusModeControl() {
  const button =
    document.getElementById(
      "phaseIL11FocusModeButton"
    );

  const strip =
    document.getElementById(
      "phaseIL11FocusModeStrip"
    );

  if (!button) return;

  const letter =
    phaseIL11FocusModeLetter();

  button.textContent =
    letter;

  const label =
    mode === "navigate"
      ? "Move"
      : mode === "select"
        ? "Select"
        : (
            mode === "freehand"
              ? "Draw · Freehand"
              : `Draw · ${mode}`
          );

  button.title =
    `${letter} · ${label}`;

  strip
    ?.querySelectorAll(
      ".phase-il11-focus-mode-choice"
    )
    .forEach(
      (choice) => {
        const choiceMode =
          choice.dataset.mode;

        const active =
          choiceMode === "navigate"
            ? mode === "navigate"
            : choiceMode === "select"
              ? mode === "select"
              : (
                  mode !== "navigate"
                  && mode !== "select"
                );

        choice.classList.toggle(
          "active",
          active
        );
      }
    );
}



// ========================================================================
// Phase IL1.2 - Focus Android system-bar hotfix
// ========================================================================

function phaseIL12UpdateFocusInsets() {
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutWidth =
    Math.max(0, Number(window.innerWidth || 0));
  const layoutHeight =
    Math.max(0, Number(window.innerHeight || 0));

  const visibleWidth =
    Math.max(0, Number(vv?.width || layoutWidth));
  const visibleHeight =
    Math.max(0, Number(vv?.height || layoutHeight));

  const offsetLeft =
    Math.max(0, Number(vv?.offsetLeft || 0));
  const offsetTop =
    Math.max(0, Number(vv?.offsetTop || 0));

  let left = offsetLeft;

  let right = Math.max(
    0,
    layoutWidth - visibleWidth - offsetLeft
  );

  let bottom = Math.max(
    0,
    layoutHeight - visibleHeight - offsetTop
  );

  const nativeAndroid =
    Boolean(IS_NATIVE)
    && /Android/i.test(navigator.userAgent || "");

  const shortSide =
    Math.min(
      layoutWidth || Infinity,
      layoutHeight || Infinity
    );

  const phoneSized =
    nativeAndroid
    && Number.isFinite(shortSide)
    && shortSide <= 600;

  if (phoneSized) {
    const landscape =
      layoutWidth > layoutHeight;

    if (landscape) {
      // Android can move the navigation bar to either lateral edge.
      // Some WebViews incorrectly report zero safe-area inset, so keep
      // a conservative reserve on both sides for phone landscape.
      left = Math.max(left, 46);
      right = Math.max(right, 46);
      bottom = Math.max(bottom, 8);
    } else {
      // Portrait navigation/gesture bar fallback.
      bottom = Math.max(bottom, 42);
    }
  }

  root.style.setProperty(
    "--ha-focus-inset-left",
    `${Math.round(left)}px`
  );

  root.style.setProperty(
    "--ha-focus-inset-right",
    `${Math.round(right)}px`
  );

  root.style.setProperty(
    "--ha-focus-inset-bottom",
    `${Math.round(bottom)}px`
  );
}


function phaseIL12Initialize() {
  phaseIL12UpdateFocusInsets();

  window.addEventListener(
    "resize",
    phaseIL12UpdateFocusInsets,
    { passive: true }
  );

  window.addEventListener(
    "orientationchange",
    () => {
      window.setTimeout(
        phaseIL12UpdateFocusInsets,
        80
      );

      window.setTimeout(
        phaseIL12UpdateFocusInsets,
        320
      );
    },
    { passive: true }
  );

  window.visualViewport?.addEventListener(
    "resize",
    phaseIL12UpdateFocusInsets,
    { passive: true }
  );

  window.visualViewport?.addEventListener(
    "scroll",
    phaseIL12UpdateFocusInsets,
    { passive: true }
  );
}


function phaseIL11Initialize() {
  phaseIL11EnsureFocusModeControl();
  phaseIL11UpdateFocusModeControl();
}


// ========================================================================
// Phase IL2 - feedback learning and suggestion decisions
// ========================================================================

const PHASE_IL2_EDIT_KEY =
  "histoannotator.il2.edits.v1";


function phaseIL2ReadArray(key) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key)
      || "[]"
    );

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (_) {
    return [];
  }
}


function phaseIL2WriteArray(
  key,
  items,
  maximum = 300
) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        (items || []).slice(
          0,
          maximum
        )
      )
    );
  } catch (_) {}
}


function phaseIL2ContextMatch(
  item,
  targetClass
) {
  if (!item || !currentImage) {
    return false;
  }

  return (
    String(item.imageId || "")
      === String(currentImage.id || "")
    && String(item.annotationFile || "")
      === String(currentAnnotationFile || "")
    && String(item.targetClass || "")
      .toLowerCase()
      === String(targetClass || "")
        .toLowerCase()
  );
}


function phaseIL2RejectedFeedback(
  targetClass
) {
  return phaseIL2ReadArray(
    PHASE_IL1_REJECTION_KEY
  ).filter(
    (item) =>
      phaseIL2ContextMatch(
        item,
        targetClass
      )
      && item?.geometry
  );
}


function phaseIL2EditedFeedback(
  targetClass
) {
  const items =
    phaseIL2ReadArray(
      PHASE_IL2_EDIT_KEY
    );

  const output = [];

  for (const item of items) {
    if (
      !phaseIL2ContextMatch(
        item,
        targetClass
      )
      || !item?.featureId
      || !item?.originalGeometry
    ) {
      continue;
    }

    const feature =
      (featureCollection.features || [])
        .find(
          (candidate) =>
            String(candidate?.id || "")
            === String(item.featureId)
        );

    if (
      !feature?.geometry
      || !phaseDIsAnnotationFeature(
        feature
      )
    ) {
      continue;
    }

    const className =
      String(
        feature?.properties
          ?.classification
          ?.name
        || ""
      ).toLowerCase();

    if (
      className
      !== String(targetClass || "")
        .toLowerCase()
    ) {
      continue;
    }

    output.push({
      featureId:
        item.featureId,
      originalGeometry:
        deepClone(
          item.originalGeometry
        ),
      correctedGeometry:
        deepClone(
          feature.geometry
        ),
      createdAt:
        item.createdAt || null,
    });
  }

  return output;
}


function phaseIL2FeedbackPayload(
  targetClass
) {
  return {
    rejected:
      phaseIL2RejectedFeedback(
        targetClass
      ).map(
        (item) => ({
          geometry:
            deepClone(
              item.geometry
            ),
          confidence:
            Number(
              item.confidence || 0
            ),
          rejectedAt:
            item.rejectedAt || null,
        })
      ),

    edited:
      phaseIL2EditedFeedback(
        targetClass
      ),
  };
}


function phaseIL2FeedbackSummary(
  targetClass
) {
  const target =
    String(targetClass || "")
      .toLowerCase();

  let accepted = 0;
  let reclassified = 0;

  for (
    const feature
    of featureCollection.features || []
  ) {
    if (
      !phaseDIsAnnotationFeature(
        feature
      )
    ) {
      continue;
    }

    const il =
      feature?.properties
        ?.histoannotator
        ?.interactiveLearning;

    if (!il) continue;

    const source =
      String(il.source || "")
        .toUpperCase();

    if (!source.startsWith("IL")) {
      continue;
    }

    const className =
      String(
        feature?.properties
          ?.classification
          ?.name
        || ""
      ).toLowerCase();

    const originalTarget =
      String(
        il.originalTargetClass || ""
      ).toLowerCase();

    if (className === target) {
      accepted += 1;
    }

    if (
      il.decision === "reclassified"
      && originalTarget === target
    ) {
      reclassified += 1;
    }
  }

  return {
    accepted,
    rejected:
      phaseIL2RejectedFeedback(
        targetClass
      ).length,
    edited:
      phaseIL2EditedFeedback(
        targetClass
      ).length,
    reclassified,
  };
}


function phaseIL2StoreEditOrigin(
  feature,
  suggestion
) {
  if (
    !feature?.id
    || !suggestion?.geometry
    || !currentImage
  ) {
    return;
  }

  const items =
    phaseIL2ReadArray(
      PHASE_IL2_EDIT_KEY
    );

  const featureId =
    String(feature.id);

  const filtered =
    items.filter(
      (item) =>
        !(
          String(item?.imageId || "")
            === String(currentImage.id || "")
          && String(
            item?.annotationFile || ""
          ) === String(
            currentAnnotationFile || ""
          )
          && String(
            item?.featureId || ""
          ) === featureId
        )
    );

  filtered.unshift({
    imageId:
      currentImage.id,
    annotationFile:
      currentAnnotationFile,
    targetClass:
      phaseIL1State.targetClass,
    featureId,
    originalGeometry:
      deepClone(
        suggestion.geometry
      ),
    createdAt:
      new Date().toISOString(),
  });

  phaseIL2WriteArray(
    PHASE_IL2_EDIT_KEY,
    filtered
  );
}


function phaseIL2PopulateAssignClasses() {
  const select =
    document.getElementById(
      "phaseIL2AssignClassSelect"
    );

  if (!select) return;

  const target =
    String(
      phaseIL1State.targetClass
      || document.getElementById(
        "phaseIL1ClassSelect"
      )?.value
      || ""
    ).toLowerCase();

  select.innerHTML = "";

  for (const item of classes || []) {
    const name =
      String(item?.name || "")
        .trim();

    if (
      !name
      || name.toLowerCase() === "artifact"
      || name.toLowerCase() === target
    ) {
      continue;
    }

    const option =
      document.createElement(
        "option"
      );

    option.value =
      name;
    option.textContent =
      name;

    select.append(option);
  }
}


function phaseIL2SetAssignOpen(open) {
  const row =
    document.getElementById(
      "phaseIL2AssignRow"
    );

  const button =
    document.getElementById(
      "phaseIL2ClassButton"
    );

  if (!row || !button) return;

  row.hidden =
    !Boolean(open);

  button.setAttribute(
    "aria-expanded",
    String(Boolean(open))
  );

  if (open) {
    phaseIL2PopulateAssignClasses();
  }
}


function phaseIL2ReviewLater() {
  const suggestions =
    phaseIL1State.suggestions;

  if (!suggestions?.length) {
    return;
  }

  if (suggestions.length === 1) {
    suggestions[0].reviewLater =
      true;

    phaseIL1UpdateTrainingHint(
      "Only one suggestion remains. It is marked Review later."
    );

    phaseIL1RenderSuggestionState();
    return;
  }

  const current =
    suggestions.splice(
      phaseIL1State.index,
      1
    )[0];

  current.reviewLater =
    true;

  suggestions.push(current);

  if (
    phaseIL1State.index
    >= suggestions.length
  ) {
    phaseIL1State.index = 0;
  }

  phaseIL1RenderSuggestionState();

  setStatus(
    "Suggestion moved to Review later",
    "local"
  );
}


function phaseIL2AssignCurrent() {
  const suggestion =
    phaseIL1CurrentSuggestion();

  const select =
    document.getElementById(
      "phaseIL2AssignClassSelect"
    );

  const className =
    String(
      select?.value || ""
    ).trim();

  if (
    !suggestion
    || !className
  ) {
    return;
  }

  const feature =
    phaseIL1AcceptedFeature(
      suggestion,
      className
    );

  if (!feature) {
    setStatus(
      "Selected class no longer exists",
      "error"
    );
    return;
  }

  const il =
    feature.properties
      .histoannotator
      .interactiveLearning;

  il.source =
    "IL2";
  il.decision =
    "reclassified";
  il.originalTargetClass =
    phaseIL1State.targetClass;
  il.assignedClass =
    className;
  il.reclassifiedAt =
    new Date().toISOString();

  pushUndo();

  featureCollection.features.push(
    feature
  );

  phaseIL1State.applyingSuggestion =
    true;

  setSingleSelection(
    String(feature.id),
    true
  );

  markChanged();

  phaseIL1State.applyingSuggestion =
    false;

  phaseIL2SetAssignOpen(false);
  phaseIL1RemoveCurrentSuggestion();

  setStatus(
    (
      "Suggestion assigned to "
      + className
      + " as Draft"
    ),
    "saved"
  );
}



// ========================================================================
// Phase IL2.1 - class dropdown, inline edit, finer suggestions
// ========================================================================

let phaseIL21EditSession = null;

function phaseIL21TargetClass() {
  return String(
    phaseIL1State.targetClass
    || document.getElementById(
      "phaseIL1ClassSelect"
    )?.value
    || ""
  ).trim();
}

function phaseIL21SuggestionClassSelect() {
  return document.getElementById(
    "phaseIL21SuggestionClassSelect"
  );
}

function phaseIL21PopulateSuggestionClasses(
  resetToTarget = true
) {
  const select =
    phaseIL21SuggestionClassSelect();

  if (!select) return;

  const previous =
    String(select.value || "");

  const target =
    phaseIL21TargetClass();

  select.innerHTML = "";

  for (const item of classes || []) {
    const name =
      String(item?.name || "").trim();

    if (!name) continue;

    const option =
      document.createElement("option");

    option.value = name;
    option.textContent = name;
    select.append(option);
  }

  const desired =
    resetToTarget
      ? target
      : previous;

  const match =
    Array.from(select.options)
      .find(
        (option) =>
          option.value.toLowerCase()
          === desired.toLowerCase()
      );

  if (match) {
    select.value = match.value;
  } else if (select.options.length) {
    select.selectedIndex = 0;
  }
}

function phaseIL21SelectedClass() {
  const select =
    phaseIL21SuggestionClassSelect();

  return String(
    select?.value
    || phaseIL21TargetClass()
  ).trim();
}

function phaseIL21ResetClassForSuggestion() {
  if (phaseIL21EditSession) return;
  phaseIL21PopulateSuggestionClasses(true);
}

function phaseIL21SetEditingUi(editing) {
  const reject =
    document.getElementById("phaseIL1RejectButton");
  const later =
    document.getElementById("phaseIL2LaterButton");
  const edit =
    document.getElementById("phaseIL1EditButton");
  const accept =
    document.getElementById("phaseIL1AcceptButton");
  const overlay =
    phaseIL22OverlayButton();
  const counter =
    document.getElementById("phaseIL1SuggestionCounter");
  const info =
    document.getElementById("phaseIL1SuggestionInfo");

  if (reject) reject.disabled = Boolean(editing);
  if (later) later.disabled = Boolean(editing);
  if (edit) edit.disabled = Boolean(editing);
  if (overlay) overlay.disabled = Boolean(editing);

  if (accept) {
    accept.textContent =
      editing
        ? "Accept edit"
        : "Accept";
  }

  if (editing && counter) {
    counter.textContent =
      "Editing suggestion";
  }

  if (editing && info) {
    info.textContent =
      "Edit the selected geometry, choose its class, then Accept edit.";
  }
}

function phaseIL21ApplyClassToFeature(
  feature,
  className
) {
  const classInfo =
    (classes || []).find(
      (item) =>
        String(item?.name || "").toLowerCase()
        === String(className || "").toLowerCase()
    );

  if (!feature || !classInfo) {
    return false;
  }

  feature.properties =
    feature.properties || {};

  feature.properties.classification = {
    name: classInfo.name,
    color: hexToRgbArray(classInfo.color),
  };

  return true;
}

function phaseIL21MarkDecision(
  feature,
  finalClass,
  edited = false
) {
  const il =
    feature?.properties
      ?.histoannotator
      ?.interactiveLearning;

  if (!il) return;

  const target =
    phaseIL21TargetClass();

  const changedClass =
    String(finalClass || "").toLowerCase()
    !== String(target || "").toLowerCase();

  il.source = "IL2";
  il.originalTargetClass = target;

  if (changedClass) {
    il.decision = "reclassified";
    il.assignedClass = finalClass;
    il.reclassifiedAt =
      new Date().toISOString();

    if (edited) {
      il.editedBeforeReclassification = true;
    }
  } else {
    il.decision =
      edited ? "edited" : "accepted";

    delete il.assignedClass;
    delete il.reclassifiedAt;
  }

  if (edited) {
    il.editAcceptedAt =
      new Date().toISOString();
  }
}

function phaseIL21RemoveSuggestionWithoutAdvance(
  suggestion
) {
  const index =
    phaseIL1State.suggestions
      .indexOf(suggestion);

  if (index >= 0) {
    phaseIL1State.suggestions.splice(
      index,
      1
    );
  }

  if (
    phaseIL1State.index
    >= phaseIL1State.suggestions.length
  ) {
    phaseIL1State.index =
      Math.max(
        0,
        phaseIL1State.suggestions.length - 1
      );
  }
}

function phaseIL21StartEdit(suggestion) {
  if (!suggestion || phaseIL21EditSession) {
    return;
  }

  const target =
    phaseIL21TargetClass();

  const feature =
    phaseIL1AcceptedFeature(
      suggestion,
      target
    );

  if (!feature) {
    setStatus(
      "Target class no longer exists",
      "error"
    );
    return;
  }

  phaseIL21MarkDecision(
    feature,
    target,
    true
  );

  pushUndo();

  featureCollection.features.push(
    feature
  );

  phaseIL2StoreEditOrigin(
    feature,
    suggestion
  );

  phaseIL21EditSession = {
    featureId: String(feature.id),
    suggestionId: String(suggestion.id || ""),
    targetClass: target,
  };

  phaseIL21RemoveSuggestionWithoutAdvance(
    suggestion
  );

  phaseIL1State.applyingSuggestion = true;

  setSingleSelection(
    String(feature.id),
    false
  );

  markChanged();

  phaseIL1State.applyingSuggestion = false;

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL21SetEditingUi(true);

  setMode("freehand");

  setSingleSelection(
    String(feature.id),
    false
  );

  drawAnnotations();

  setStatus(
    "Edit suggestion, choose class if needed, then Accept edit",
    "local"
  );
}

function phaseIL21FinishEdit() {
  if (!phaseIL21EditSession) {
    return false;
  }

  const feature =
    (featureCollection.features || [])
      .find(
        (item) =>
          String(item?.id || "")
          === phaseIL21EditSession.featureId
      );

  if (!feature) {
    phaseIL21EditSession = null;
    phaseIL21SetEditingUi(false);

    setStatus(
      "Edited suggestion could not be found",
      "error"
    );
    return true;
  }

  const finalClass =
    phaseIL21SelectedClass();

  if (!finalClass) {
    setStatus(
      "Choose a class before accepting the edit",
      "error"
    );
    return true;
  }

  phaseIL1State.applyingSuggestion = true;

  phaseIL21ApplyClassToFeature(
    feature,
    finalClass
  );

  phaseIL21MarkDecision(
    feature,
    finalClass,
    true
  );

  markChanged();

  phaseIL1State.applyingSuggestion = false;
  phaseIL21EditSession = null;

  phaseIL21SetEditingUi(false);
  clearSelectedFeatures(false);

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL1RenderSuggestionState();

  setStatus(
    `${finalClass} edit accepted as Draft`,
    "saved"
  );

  return true;
}


// ========================================================================
// Phase IL2.2 - highlighted review overlay and Freehand edit
// ========================================================================

let phaseIL22SuggestionOverlayVisible = true;

function phaseIL22OverlayButton() {
  return document.getElementById(
    "phaseIL22OverlayButton"
  );
}

function phaseIL22UpdateOverlayButton() {
  const button = phaseIL22OverlayButton();
  if (!button) return;

  button.textContent =
    phaseIL22SuggestionOverlayVisible
      ? "Hide"
      : "Show";

  button.title =
    phaseIL22SuggestionOverlayVisible
      ? "Hide current suggestion"
      : "Show current suggestion";

  button.setAttribute(
    "aria-pressed",
    String(phaseIL22SuggestionOverlayVisible)
  );
}

function phaseIL22ResetOverlayForSuggestion() {
  if (phaseIL21EditSession) return;

  phaseIL22SuggestionOverlayVisible = true;
  phaseIL22UpdateOverlayButton();
}

function phaseIL22ToggleSuggestionOverlay() {
  if (phaseIL21EditSession) return;

  phaseIL22SuggestionOverlayVisible =
    !phaseIL22SuggestionOverlayVisible;

  phaseIL22UpdateOverlayButton();
  drawAnnotations();
}

function phaseIL22AddRingToPath(ring) {
  if (
    !Array.isArray(ring)
    || ring.length < 3
  ) {
    return false;
  }

  let started = false;

  for (const point of ring) {
    const screen =
      screenPointFromImage(point);

    if (!screen) continue;

    if (!started) {
      ctx.moveTo(
        screen.x,
        screen.y
      );
      started = true;
    } else {
      ctx.lineTo(
        screen.x,
        screen.y
      );
    }
  }

  if (started) {
    ctx.closePath();
  }

  return started;
}

function phaseIL22FillPolygon(
  polygon,
  color
) {
  if (!Array.isArray(polygon)) return;

  ctx.save();
  ctx.beginPath();

  let hasPath = false;

  for (const ring of polygon) {
    hasPath =
      phaseIL22AddRingToPath(ring)
      || hasPath;
  }

  if (hasPath) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.fill("evenodd");
  }

  ctx.restore();
}

function phaseIL22FillGeometry(
  geometry,
  color = "#fff200"
) {
  if (!geometry) return;

  if (geometry.type === "Polygon") {
    phaseIL22FillPolygon(
      geometry.coordinates || [],
      color
    );
    return;
  }

  if (geometry.type === "MultiPolygon") {
    for (
      const polygon
      of geometry.coordinates || []
    ) {
      phaseIL22FillPolygon(
        polygon,
        color
      );
    }
  }
}


// ========================================================================
// Phase IL2.3 - two-row suggestion review layout
// ========================================================================

function phaseIL23ArrangeSuggestionActions() {
  const actionRow =
    document.querySelector(
      "#phaseIL1SuggestionPanel .phase-il1-actions"
    );

  if (!actionRow) return;

  let upper =
    document.getElementById(
      "phaseIL23UpperActions"
    );

  let lower =
    document.getElementById(
      "phaseIL23LowerActions"
    );

  if (!upper) {
    upper =
      document.createElement("div");

    upper.id =
      "phaseIL23UpperActions";

    upper.className =
      "phase-il23-upper-actions";
  }

  if (!lower) {
    lower =
      document.createElement("div");

    lower.id =
      "phaseIL23LowerActions";

    lower.className =
      "phase-il23-lower-actions";
  }

  if (upper.parentElement !== actionRow) {
    actionRow.append(upper);
  }

  if (lower.parentElement !== actionRow) {
    actionRow.append(lower);
  }

  const reject =
    document.getElementById(
      "phaseIL1RejectButton"
    );

  const later =
    document.getElementById(
      "phaseIL2LaterButton"
    );

  const edit =
    document.getElementById(
      "phaseIL1EditButton"
    );

  const classSelect =
    phaseIL21SuggestionClassSelect();

  const overlay =
    phaseIL22OverlayButton();

  const accept =
    document.getElementById(
      "phaseIL1AcceptButton"
    );

  for (
    const control
    of [
      reject,
      later,
      edit,
      classSelect,
    ]
  ) {
    if (control) {
      upper.append(control);
    }
  }

  if (overlay) {
    lower.append(overlay);
  }

  if (accept) {
    lower.append(accept);
  }
}

function phaseIL2EnsureUi() {
  const actionRow =
    document.querySelector(
      "#phaseIL1SuggestionPanel .phase-il1-actions"
    );

  if (!actionRow) return;

  let overlayButton =
    phaseIL22OverlayButton();

  if (!overlayButton) {
    overlayButton =
      document.createElement("button");

    overlayButton.id =
      "phaseIL22OverlayButton";
    overlayButton.type =
      "button";
    overlayButton.className =
      "phase-il22-overlay-button";

    actionRow.insertBefore(
      overlayButton,
      actionRow.firstChild
    );

    overlayButton.addEventListener(
      "click",
      phaseIL22ToggleSuggestionOverlay
    );
  }

  phaseIL22UpdateOverlayButton();


  document.getElementById(
    "phaseIL2ClassButton"
  )?.remove();

  document.getElementById(
    "phaseIL2AssignRow"
  )?.remove();

  let later =
    document.getElementById(
      "phaseIL2LaterButton"
    );

  if (!later) {
    later =
      document.createElement("button");

    later.id = "phaseIL2LaterButton";
    later.type = "button";
    later.textContent = "Later";
    later.title = "Review later";

    const edit =
      document.getElementById(
        "phaseIL1EditButton"
      );

    if (edit) {
      actionRow.insertBefore(
        later,
        edit
      );
    } else {
      actionRow.append(later);
    }

    later.addEventListener(
      "click",
      phaseIL2ReviewLater
    );
  }

  let select =
    phaseIL21SuggestionClassSelect();

  if (!select) {
    select =
      document.createElement("select");

    select.id =
      "phaseIL21SuggestionClassSelect";

    select.className =
      "phase-il21-class-select";

    select.title =
      "Class assigned when Accept is pressed";

    select.setAttribute(
      "aria-label",
      "Suggestion class"
    );

    const accept =
      document.getElementById(
        "phaseIL1AcceptButton"
      );

    if (accept) {
      actionRow.insertBefore(
        select,
        accept
      );
    } else {
      actionRow.append(select);
    }
  }

  phaseIL21PopulateSuggestionClasses(
    true
  );

  phaseIL21SetEditingUi(false);

  phaseIL23ArrangeSuggestionActions();
}



function phaseIL2Initialize() {
  phaseIL2EnsureUi();
}


function phaseIL1Initialize() {
  phaseIL1EnsureUi();

  const refs =
    phaseIL1Refs();

  refs.menu?.addEventListener(
    "click",
    phaseIL1Open
  );

  refs.close?.addEventListener(
    "click",
    phaseIL1Close
  );

  refs.clear?.addEventListener(
    "click",
    () =>
      phaseIL1ClearSuggestions()
  );

  refs.run?.addEventListener(
    "click",
    phaseIL1Run
  );

  refs.classSelect
    ?.addEventListener(
      "change",
      () => {
        phaseIL1State.targetClass =
          refs.classSelect.value;

        phaseIL1ClearSuggestions(
          "",
          true
        );
      }
    );

  refs.sensitivity
    ?.addEventListener(
      "input",
      () => {
        if (
          refs.sensitivityValue
        ) {
          refs.sensitivityValue
            .textContent =
              refs.sensitivity.value;
        }
      }
    );

  refs.smoothing
    ?.addEventListener(
      "input",
      () => {
        if (
          refs.smoothingValue
        ) {
          refs.smoothingValue
            .textContent =
              refs.smoothing.value;
        }
      }
    );

  refs.previous
    ?.addEventListener(
      "click",
      () => {
        const total =
          phaseIL1State
            .suggestions.length;

        if (!total) return;

        phaseIL1State.index =
          (
            phaseIL1State.index
            - 1
            + total
          ) % total;

        phaseIL1RenderSuggestionState();
      }
    );

  refs.next
    ?.addEventListener(
      "click",
      () => {
        const total =
          phaseIL1State
            .suggestions.length;

        if (!total) return;

        phaseIL1State.index =
          (
            phaseIL1State.index
            + 1
          ) % total;

        phaseIL1RenderSuggestionState();
      }
    );

  refs.reject
    ?.addEventListener(
      "click",
      phaseIL1Reject
    );

  refs.accept
    ?.addEventListener(
      "click",
      () =>
        phaseIL1AcceptCurrent(
          false
        )
    );

  refs.edit
    ?.addEventListener(
      "click",
      () =>
        phaseIL1AcceptCurrent(
          true
        )
    );
}


  function bindEvents() {
    phaseBBindEvents();
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
    els.deleteAnnotationFileButton?.addEventListener("click", deleteCurrentAnnotationFile);
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
    els.connectionSettingsButton?.addEventListener("click", () => openConnectionSettings(false));
    els.openLocalImageButton?.addEventListener("click", pickNativeLocalImage);
    organizeNativeLocalFileMenu();
    els.addLocalImageButton?.addEventListener("click", pickNativeLocalImage);
    els.localImagesButton?.addEventListener("click", showNativeLocalImages);
    simplifyNativeFileMenu();
    els.closeLocalImagesButton?.addEventListener("click", () => {
      if (els.localImagesOverlay) els.localImagesOverlay.hidden = true;
    });
    els.scanConnectionQrButton?.addEventListener("click", scanConnectionQr);
    els.testConnectionButton?.addEventListener("click", testNativeServerCandidate);
    els.saveConnectionButton?.addEventListener("click", saveNativeServerCandidate);
    els.clearConnectionButton?.addEventListener("click", clearNativeServerCandidate);
    els.closeConnectionButton?.addEventListener("click", closeConnectionSettings);
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
    els.shareGeoJsonButton?.addEventListener("click", () => { toggleFileMenu(false); shareGeoJson(); });
    els.saveButton.addEventListener("click", () => { toggleFileMenu(false); saveAnnotations(true); });
    els.imageInfoButton.addEventListener("click", showImageInfo);
    els.annotationStatsButton?.addEventListener("click", showAnnotationStatistics);
    els.annotationStatsCloseButton?.addEventListener("click", () => { els.annotationStatsModal.hidden = true; });
    els.annotationStatsModal?.addEventListener("click", (event) => {
      if (event.target === els.annotationStatsModal) els.annotationStatsModal.hidden = true;
    });
    els.reviewModeButton?.addEventListener("click", () => {
      toggleFileMenu(false); populateReviewScopeOptions(); els.reviewSetupModal.hidden = false;
    });
    els.reviewSetupCancelButton?.addEventListener("click", () => { els.reviewSetupModal.hidden = true; });
    els.reviewSetupStartButton?.addEventListener("click", () => {
      const scope = els.reviewScopeSelect.value || "all";
      els.reviewSetupModal.hidden = true; startReviewMode(scope);
    });
    els.exitReviewModeButton?.addEventListener("click", exitReviewMode);
    els.reviewCorrectButton?.addEventListener("click", () => applyReviewDecision("correct"));
    els.reviewMaybeButton?.addEventListener("click", () => applyReviewDecision("maybe"));
    els.reviewLaterButton?.addEventListener("click", () => applyReviewDecision("later"));
    els.reviewDeleteButton?.addEventListener("click", () => applyReviewDecision("delete"));
    els.reviewClassSelect?.addEventListener("change", () => assignReviewFeatureClass(els.reviewClassSelect.value));
    els.reviewNewClassButton?.addEventListener("click", () => {
      reviewPendingNewClassAssignment = true; openClassEditor(null);
    });
    els.saveManualCalibrationButton?.addEventListener("click", saveManualCalibration);
    els.clearManualCalibrationButton?.addEventListener("click", clearManualCalibration);
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
      if (currentImage && API) {
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
    els.fillUnannotatedButton?.addEventListener("click", () => phaseDOpenFillUnannotated());
    els.fillUnannotatedRefreshButton?.addEventListener("click", () => phaseDRefreshFillUnannotatedPreview());
    els.fillUnannotatedCancelButton?.addEventListener("click", phaseDCloseFillUnannotated);
    els.fillUnannotatedCreateButton?.addEventListener("click", phaseDCreateFillUnannotated);
    els.fillUnannotatedClassSelect?.addEventListener("change", () => {
      phaseDRenderFillUnannotatedSummary(phaseDFillUnannotatedPreview?.payload || null);
      drawAnnotations();
    });

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
    document.addEventListener("keydown", phaseBHandleKeydown);
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
    if (
      IS_NATIVE
      && await prepareNativeRuntime()
    ) {
      return;
    }

    // Bring up the UI and local catalog first. Storage persistence and service
    // worker setup are best-effort background tasks and must never hold Files
    // on the initial “Loading…” option.
    renderClassButtons();
    renderAnnotationFileOptions();
    initViewer();
    bindEvents();
    phaseGInitialize();
    phaseG2Initialize();
    phaseIL1Initialize();
    phaseIL2Initialize();
    phaseIL11Initialize();
    phaseIL12Initialize();
    setClassManagerOpen(false);
    els.inputGuide.hidden = false;
    setDrawingProfile("default");
    renderChannelControls();
    // Phase IL1.3 - full-width Focus and Freehand default
    setMode("freehand");
    updateControls();
    updateDiagnostics();
    requestPersistentStorage();
    registerOfflineServiceWorker();
    await Promise.all([loadClasses(), loadImages(false)]);
  }

  start().catch((error) => setStatus(`Startup error: ${error.message}`, "error"));
})();
