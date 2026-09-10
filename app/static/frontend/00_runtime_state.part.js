(() => {
  "use strict";

  const VERSION = "1.4.0-dev-F2.6.2";

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
    hdabQuantButton: document.getElementById("hdabQuantButton"),
    phaseF24AnalysisProtocolsButton: document.getElementById("phaseF24AnalysisProtocolsButton"),
    phaseF24AnalysisProtocolsModal: document.getElementById("phaseF24AnalysisProtocolsModal"),
    phaseF24ProtocolSelect: document.getElementById("phaseF24ProtocolSelect"),
    phaseF24ProtocolName: document.getElementById("phaseF24ProtocolName"),
    phaseF24ProtocolStatus: document.getElementById("phaseF24ProtocolStatus"),
    phaseF24ProtocolSummary: document.getElementById("phaseF24ProtocolSummary"),
    phaseF24SaveNewButton: document.getElementById("phaseF24SaveNewButton"),
    phaseF24SaveVersionButton: document.getElementById("phaseF24SaveVersionButton"),
    phaseF24ApplyButton: document.getElementById("phaseF24ApplyButton"),
    phaseF241RunProtocolButton: document.getElementById("phaseF241RunProtocolButton"),
    phaseF241CancelRunButton: document.getElementById("phaseF241CancelRunButton"),
    phaseF241ProtocolRunStatus: document.getElementById("phaseF241ProtocolRunStatus"),
    phaseF241ProtocolRunMessage: document.getElementById("phaseF241ProtocolRunMessage"),
    phaseF25OpenBatchButton: document.getElementById("phaseF25OpenBatchButton"),
    phaseF25BatchModal: document.getElementById("phaseF25BatchModal"),
    phaseF25BatchProtocolSummary: document.getElementById("phaseF25BatchProtocolSummary"),
    phaseF252BaseConfigSummary: document.getElementById("phaseF252BaseConfigSummary"),
    phaseF252UseBaseImageType: document.getElementById("phaseF252UseBaseImageType"),
    phaseF252UseBaseCalibration: document.getElementById("phaseF252UseBaseCalibration"),
    phaseF25SourceAnnotationFile: document.getElementById("phaseF25SourceAnnotationFile"),
    phaseF25TargetAnnotationFile: document.getElementById("phaseF25TargetAnnotationFile"),
    phaseF25SelectAllButton: document.getElementById("phaseF25SelectAllButton"),
    phaseF25SelectNoneButton: document.getElementById("phaseF25SelectNoneButton"),
    phaseF25ImageList: document.getElementById("phaseF25ImageList"),
    phaseF25ContinueOnError: document.getElementById("phaseF25ContinueOnError"),
    phaseF25BatchProgress: document.getElementById("phaseF25BatchProgress"),
    phaseF25BatchProgressMessage: document.getElementById("phaseF25BatchProgressMessage"),
    phaseF25BatchResults: document.getElementById("phaseF25BatchResults"),
    phaseF25RunBatchButton: document.getElementById("phaseF25RunBatchButton"),
    phaseF25CancelBatchButton: document.getElementById("phaseF25CancelBatchButton"),
    phaseF25ExportBatchCsvButton: document.getElementById("phaseF25ExportBatchCsvButton"),
    phaseF25BackButton: document.getElementById("phaseF25BackButton"),
    phaseF25CloseButton: document.getElementById("phaseF25CloseButton"),
    phaseF24ExportButton: document.getElementById("phaseF24ExportButton"),
    phaseF24ImportButton: document.getElementById("phaseF24ImportButton"),
    phaseF24ImportInput: document.getElementById("phaseF24ImportInput"),
    phaseF24DeleteButton: document.getElementById("phaseF24DeleteButton"),
    phaseF24CloseButton: document.getElementById("phaseF24CloseButton"),
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
    positiveByClassStatsModal: document.getElementById("positiveByClassStatsModal"),
    positiveByClassStatsContent: document.getElementById("positiveByClassStatsContent"),
    positiveByClassExportCsvButton: document.getElementById("positiveByClassExportCsvButton"),
    positiveByClassBackButton: document.getElementById("positiveByClassBackButton"),
    positiveByClassCloseButton: document.getElementById("positiveByClassCloseButton"),
    hdabQuantModal: document.getElementById("hdabQuantModal"),
    hdabQuantContent: document.getElementById("hdabQuantContent"),
    hdabQuantThresholdMode: document.getElementById("hdabQuantThresholdMode"),
    hdabQuantThreshold: document.getElementById("hdabQuantThreshold"),
    hdabQuantThresholdValue: document.getElementById("hdabQuantThresholdValue"),
    hdabQuantThresholdField: document.getElementById("hdabQuantThresholdField"),
    hdabQuantWovDeltaField: document.getElementById("hdabQuantWovDeltaField"),
    hdabQuantWovDelta: document.getElementById("hdabQuantWovDelta"),
    hdabQuantWovDeltaValue: document.getElementById("hdabQuantWovDeltaValue"),
    hdabQuantLivePanel: document.getElementById("hdabQuantLivePanel"),
    hdabQuantUseCurrentViewButton: document.getElementById("hdabQuantUseCurrentViewButton"),
    hdabQuantClearLiveButton: document.getElementById("hdabQuantClearLiveButton"),
    hdabQuantLiveStatus: document.getElementById("hdabQuantLiveStatus"),
    hdabQuantSmoothingEnabled: document.getElementById("hdabQuantSmoothingEnabled"),
    hdabQuantSmoothingField: document.getElementById("hdabQuantSmoothingField"),
    hdabQuantSmoothing: document.getElementById("hdabQuantSmoothing"),
    hdabQuantSmoothingValue: document.getElementById("hdabQuantSmoothingValue"),
    hdabQuantSmoothingUnit: document.getElementById("hdabQuantSmoothingUnit"),
    hdabQuantSmallFilterEnabled: document.getElementById("hdabQuantSmallFilterEnabled"),
    hdabQuantMinimumAreaField: document.getElementById("hdabQuantMinimumAreaField"),
    hdabQuantMinimumArea: document.getElementById("hdabQuantMinimumArea"),
    hdabQuantMinimumAreaValue: document.getElementById("hdabQuantMinimumAreaValue"),
    hdabQuantMinimumAreaUnit: document.getElementById("hdabQuantMinimumAreaUnit"),
    hdabQuantRunButton: document.getElementById("hdabQuantRunButton"),
    hdabQuantCloseButton: document.getElementById("hdabQuantCloseButton"),
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

  async function applyAnnotationSyncResult(
    job,
    normalizedPayload,
    options = {}
  ) {
    const serverReturnedCollection =
      Boolean(options.serverReturnedCollection);
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
            featureCollection: phaseF261FastClone(job.payload),
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

            // With a compact ACK, persistLocalDraft() has already stored this
            // exact revision before the server PUT. Keep the existing local
            // FeatureCollection instead of cloning/writing it again.
            if (
              serverReturnedCollection
              || !existing.featureCollection
              || existingRevision < job.revision
            ) {
              existing.featureCollection =
                phaseF261FastClone(normalizedPayload);
            }

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
      const syncPayloadText = JSON.stringify(
        job.payload
      );

      if (
        syncPayloadText.length
        >= 5 * 1024 * 1024
      ) {
        console.info(
          "Large annotation sync payload",
          {
            bytes: syncPayloadText.length,
            megabytes:
              syncPayloadText.length
              / (1024 * 1024),
            imageId:
              job.image?.id,
            annotationFile:
              job.annotationFile,
            revision:
              job.revision,
          }
        );
      }

      const response = await apiFetch(
        `${API}/annotations/${job.image.id}?file=${encodeURIComponent(job.annotationFile)}&compact=1`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: syncPayloadText,

          // F1.10: packed Anthracosis may contain thousands of polygon rings.
          // Local-first persistence already happened before this queued sync.
          timeoutMs: 5 * 60 * 1000,
        }
      );
      const result = await response.json();

      const serverReturnedCollection =
        result?.featureCollection?.type === "FeatureCollection";

      const normalizedPayload =
        serverReturnedCollection
          ? normalizeFeatureCollectionClient(result.featureCollection)
          : job.payload;

      await applyAnnotationSyncResult(
        job,
        normalizedPayload,
        {
          serverReturnedCollection,
        }
      );

      if (
        result?.compactAck
        && !serverReturnedCollection
      ) {
        console.info(
          "Compact annotation sync acknowledgement",
          {
            imageId: job.image?.id,
            annotationFile: job.annotationFile,
            revision: job.revision,
            features: result?.features,
          }
        );
      }

      if (currentDocumentKey() === key) {
        currentLastSyncedRevision = Math.max(currentLastSyncedRevision, job.revision);

        if (currentLocalRevision === job.revision) {
          // A compact ACK proves that the server stored the exact submitted
          // document, so preserve the current live objects and render caches.
          if (serverReturnedCollection) {
            featureCollection = normalizedPayload;
            featureCollection.features.forEach(featureId);
            phaseF26InvalidateGeometryCaches();
          }

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


  // ======================================================================
  // Phase IL7 + UX reference view
  // Class color helpers.
  // ======================================================================

  const PHASE_UX_CLASS_COLOR_HISTORY =
    "histoannotator.classColorHistory.v1";

  function phaseUXNormalizeHexColor(value) {
    const color =
      String(value || "")
        .trim()
        .toLowerCase();

    return /^#[0-9a-f]{6}$/.test(color)
      ? color
      : null;
  }

  function phaseUXReadColorHistory() {
    try {
      const parsed =
        JSON.parse(
          localStorage.getItem(
            PHASE_UX_CLASS_COLOR_HISTORY
          )
          || "[]"
        );

      return Array.isArray(parsed)
        ? parsed
            .map(phaseUXNormalizeHexColor)
            .filter(Boolean)
        : [];
    } catch (_) {
      return [];
    }
  }

  function phaseUXRememberClassColor(value) {
    const color =
      phaseUXNormalizeHexColor(value);

    if (!color) return;

    const colors =
      new Set(
        phaseUXReadColorHistory()
      );

    colors.add(color);

    try {
      localStorage.setItem(
        PHASE_UX_CLASS_COLOR_HISTORY,
        JSON.stringify(
          [...colors].slice(-256)
        )
      );
    } catch (_) {}
  }

  function phaseUXRandomIndex(length) {
    if (length <= 1) return 0;

    try {
      if (window.crypto?.getRandomValues) {
        const buffer =
          new Uint32Array(1);

        window.crypto.getRandomValues(
          buffer
        );

        return buffer[0] % length;
      }
    } catch (_) {}

    return Math.floor(
      Math.random() * length
    );
  }

  function phaseUXHslToHex(
    hue,
    saturation = 72,
    lightness = 58
  ) {
    const h =
      (
        Number(hue) % 360
        + 360
      ) % 360;

    const s =
      Math.max(
        0,
        Math.min(
          100,
          Number(saturation)
        )
      ) / 100;

    const l =
      Math.max(
        0,
        Math.min(
          100,
          Number(lightness)
        )
      ) / 100;

    const chroma =
      (
        1
        - Math.abs(
            2 * l - 1
          )
      ) * s;

    const x =
      chroma
      * (
          1
          - Math.abs(
              (
                h / 60
              ) % 2
              - 1
            )
        );

    const m =
      l - chroma / 2;

    let rgb;

    if (h < 60) {
      rgb = [chroma, x, 0];
    } else if (h < 120) {
      rgb = [x, chroma, 0];
    } else if (h < 180) {
      rgb = [0, chroma, x];
    } else if (h < 240) {
      rgb = [0, x, chroma];
    } else if (h < 300) {
      rgb = [x, 0, chroma];
    } else {
      rgb = [chroma, 0, x];
    }

    return (
      "#"
      + rgb
        .map(
          (channel) =>
            Math.round(
              (
                channel + m
              ) * 255
            )
              .toString(16)
              .padStart(2, "0")
        )
        .join("")
    );
  }

  function phaseUXSuggestedUnusedClassColor() {
    const currentUsed =
      new Set(
        (classes || [])
          .map(
            (item) =>
              phaseUXNormalizeHexColor(
                item?.color
              )
          )
          .filter(Boolean)
      );

    const everUsed =
      new Set([
        ...phaseUXReadColorHistory(),
        ...currentUsed,
      ]);

    const palette = [
      "#ff6b6b",
      "#4dabf7",
      "#69db7c",
      "#ffd43b",
      "#b197fc",
      "#ffa94d",
      "#38d9a9",
      "#f06595",
      "#74c0fc",
      "#8ce99a",
      "#e599f7",
      "#ffc078",
      "#63e6be",
      "#faa2c1",
      "#91a7ff",
      "#a9e34b",
      "#da77f2",
      "#ffe066",
      "#66d9e8",
      "#ff8787",
      "#9775fa",
      "#20c997",
      "#fcc419",
      "#e64980",
    ];

    const available =
      palette.filter(
        (color) =>
          !everUsed.has(color)
      );

    if (available.length) {
      return available[
        phaseUXRandomIndex(
          available.length
        )
      ];
    }

    for (
      let attempt = 0;
      attempt < 64;
      attempt += 1
    ) {
      const hue =
        (
          phaseUXRandomIndex(360)
          + attempt * 137.508
        ) % 360;

      const color =
        phaseUXHslToHex(
          hue,
          72,
          58
        );

      if (!everUsed.has(color)) {
        return color;
      }
    }

    return phaseUXHslToHex(
      Date.now() % 360,
      72,
      58
    );
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
    const item =
      index === null
        ? {
            name: "",
            color:
              phaseUXSuggestedUnusedClassColor(),
          }
        : classes[index];
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

      phaseUXRememberClassColor(
        color
      );

      currentClass =
        classes[classes.length - 1];
      if (reviewState.active && reviewPendingNewClassAssignment) {
        reviewPendingNewClassAssignment = false;
        assignReviewFeatureClass(currentClass.name);
      }
    } else {
      const oldName =
        classes[classEditIndex].name;

      classes[classEditIndex] = {
        name,
        color,
      };

      phaseUXRememberClassColor(
        color
      );

      if (
        currentClass?.name
        === oldName
      ) {
        currentClass =
          classes[classEditIndex];
      }
    }

    closeClassEditor();
    renderClassButtons();

    if (phaseBFocusActive) {
      phaseBRenderFocusClasses();
    }

    // Old Features are drawn from the current class color immediately.
    drawAnnotations();

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

    phaseUXRememberClassColor(
      item.color
    );
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
        phaseF26HandleViewportDrawEvent(
          eventName
        );
        updateDiagnostics();
        updateScaleBar();
        updateCalibrationBadge();
        if (eventName === "open" && viewer.navigator?.element) {
          viewer.navigator.element.title = "Overview: tap or drag to move to another part of the image";
          viewer.navigator.element.setAttribute("aria-label", "Image overview. Tap or drag to navigate.");
        }
      });
    });

    viewer.addHandler("animation-finish", () => {
      phaseF26FinishNavigationDraw();
      if (currentImage) saveViewportState();
    });

    viewer.addHandler("tile-loaded", (event) => {
      tileStats.loaded += 1;

      if (window.__histoEvalVisualPerfSession) {
        window.__histoEvalVisualPerfSession.tileLoaded =
          Number(window.__histoEvalVisualPerfSession.tileLoaded || 0) + 1;
      }

      updateDiagnostics();
    });

    viewer.addHandler("tile-load-failed", (event) => {
      tileStats.failed += 1;
      const message = event?.message || event?.tile?.url || "unknown tile";

      if (window.__histoEvalVisualPerfSession) {
        const session = window.__histoEvalVisualPerfSession;
        session.tileFailed = Number(session.tileFailed || 0) + 1;

        const tile = event?.tile || {};
        const failure = {
          elapsedSinceReviewOpenMs: Number(
            (
              (typeof performance !== "undefined" && performance.now)
                ? performance.now()
                : Date.now()
            ) - Number(session.startedAt || 0)
          ),
          level: tile.level ?? null,
          x: tile.x ?? null,
          y: tile.y ?? null,
          url: String(tile.url || "").slice(0, 240),
          message: String(message).slice(0, 240),
          imageLoaderTimeoutMs:
            Number(viewer?.imageLoader?.timeout || 0) || null,
        };

        if (!Array.isArray(session.failures)) {
          session.failures = [];
        }
        session.failures.push(failure);
        if (session.failures.length > 20) {
          session.failures = session.failures.slice(-20);
        }

        console.warn(
          "[VisualReview TILE PERF]",
          failure
        );
      }

      if (window.__histoEvalVisualReviewActive) {
        const now = Date.now();
        const recent = (
          Array.isArray(window.__histoEvalVisualTileFailureTimes)
            ? window.__histoEvalVisualTileFailureTimes
            : []
        ).filter(
          (timestamp) => now - Number(timestamp) <= 6000
        );
        recent.push(now);
        window.__histoEvalVisualTileFailureTimes = recent;

        // A single timeout may recover. Keep it in diagnostics and only
        // interrupt review when failures repeat.
        if (recent.length >= 3) {
          setStatus(
            `Repeated tile error: ${String(message).slice(0, 82)}`,
            "error"
          );
        }
      } else {
        setStatus(`Tile error: ${String(message).slice(0, 90)}`, "error");
      }

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
