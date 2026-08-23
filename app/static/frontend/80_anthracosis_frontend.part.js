  function phaseF1Refs() {
    return {
      menuButton: document.getElementById("phaseF1AnthracosisButton"),
      overlay: document.getElementById("phaseF1AnthracosisOverlay"),
      sensitivity: document.getElementById("phaseF1AnthracosisSensitivity"),
      sensitivityValue: document.getElementById("phaseF1AnthracosisSensitivityValue"),
      growth: document.getElementById("phaseF1AnthracosisGrowth"),
      growthValue: document.getElementById("phaseF1AnthracosisGrowthValue"),
      finalDilate: document.getElementById("phaseF1AnthracosisFinalDilate"),
      finalDilateValue: document.getElementById("phaseF1AnthracosisFinalDilateValue"),
      summary: document.getElementById("phaseF1AnthracosisSummary"),
      detect: document.getElementById("phaseF1AnthracosisDetectButton"),
      close: document.getElementById("phaseF1AnthracosisCloseButton"),
      previewAction: document.getElementById("phaseF1PreviewAction"),
      previewActionSummary: document.getElementById("phaseF1PreviewActionSummary"),
      changeParameters: document.getElementById("phaseF1ChangeParametersButton"),
      previewAccept: document.getElementById("phaseF1PreviewAcceptButton"),
      previewCancel: document.getElementById("phaseF1PreviewCancelButton"),
    };
  }

  function phaseF1AnthracosisClass() {
    return (
      (classes || []).find(
        (item) =>
          String(item?.name || "").trim().toLowerCase()
          === "anthracosis"
      )
      || { name: "Anthracosis", color: "#9775fa" }
    );
  }

  function phaseF1IsAutomaticFeature(feature) {
    const metadata =
      feature?.properties?.histoannotator?.autoDetection;

    const method =
      String(metadata?.method || "").trim().toLowerCase();

    return (
      phaseDIsAnnotationFeature(feature)
      && String(
        feature?.properties?.classification?.name || ""
      ).trim().toLowerCase() === "anthracosis"
      && String(
        metadata?.type || ""
      ).trim().toLowerCase() === "anthracosis"
      && (
        method === "dark-pigment-v1"
        || method === "dark-pigment-tiled-v1"
        || method === "dark-pigment-hsv-tiled-v2"
        || method === "dark-pigment-hsv-seed-growth-v3"
        || method === "dark-pigment-hsv-strict-seed-growth-v4"
        || method === "dark-pigment-hsv-ultradark-seed-growth-v5"
        || method === "dark-pigment-hsv-ultradark-seed-growth-dilate-v6"
      )
    );
  }

  function phaseF1CreateFeature(
    detection,
    model,
    options = {}
  ) {
    const classInfo = phaseF1AnthracosisClass();
    const metadata = phaseCCreateMetadata();

    const method = String(
      model?.method
      || model?.type
      || "dark-pigment-hsv-ultradark-seed-growth-dilate-v6"
    );

    metadata.autoDetection = {
      type: "anthracosis",
      method,
      sensitivity: Number(model?.sensitivity ?? 50),
      analysisRegion: String(
        model?.analysisRegion || "Tissue ROI - Artifact"
      ),
      analysisResolution: String(
        model?.analysisResolution || "native-level-0"
      ),
      tileSize: Number(model?.tileSize ?? 1024),
      overlap: Number(model?.overlap ?? 64),
      growthRadius: Number(model?.growthRadius ?? 8),
      finalMaskDilatePx: Number(model?.finalMaskDilatePx ?? 0),
      createdAt: new Date().toISOString(),
    };

    const analysisProtocol =
      phaseF24ProtocolSnapshotForMetadata(
        "anthracosis"
      );

    if (analysisProtocol) {
      metadata.analysisProtocol =
        analysisProtocol;
    }

    if (options.preview) {
      metadata.preview = {
        transient: true,
        type: "anthracosis",
      };
    }

    const color = options.preview
      ? "#da77f2"
      : (classInfo.color || "#9775fa");

    return {
      type: "Feature",
      id: options.preview
        ? `anthracosis-preview-${uid()}`
        : uid(),
      geometry: deepClone(detection.geometry),
      properties: {
        objectType: "annotation",
        classification: {
          name: "Anthracosis",
          color: hexToRgbArray(color),
        },
        isLocked: Boolean(options.preview),
        histoannotator: metadata,
      },
    };
  }

  function phaseF1ResetPreviewState() {
    phaseF1PreviewPayload = null;
    phaseF1PreviewFeatures = [];
    phaseF1PreviewImageId = null;
    phaseF1PreviewAnnotationFile = null;
    window.__phaseF1PreviewFeatures = [];
  }

  function phaseF1RenderPreview() {
    window.__phaseF1PreviewFeatures =
      Array.isArray(phaseF1PreviewFeatures)
        ? phaseF1PreviewFeatures
        : [];

    drawAnnotations();
  }

  function phaseF1HidePreviewAction() {
    const refs = phaseF1Refs();
    if (refs.previewAction) {
      refs.previewAction.hidden = true;
    }
  }

  function phaseF1ShowPreviewAction() {
    const refs = phaseF1Refs();
    const count = Number(
      phaseF1PreviewPayload?.summary?.returnedDetections ?? 0
    );
    const groupedFeatures = Number(
      phaseF1PreviewPayload?.summary?.returnedFeatures
      ?? phaseF1PreviewPayload?.detections?.length
      ?? 0
    );
    const coverage = Number(
      phaseF1PreviewPayload?.summary?.coveragePercent
    );
    const sensitivity = Number(
      phaseF1PreviewPayload?.model?.sensitivity ?? 50
    );

    const growthRadius = Number(
      phaseF1PreviewPayload?.model?.growthRadius ?? 8
    );

    const finalMaskDilatePx = Number(
      phaseF1PreviewPayload?.model?.finalMaskDilatePx ?? 0
    );

    if (refs.previewActionSummary) {
      refs.previewActionSummary.textContent =
        `${count} component${count === 1 ? "" : "s"}`
        + ` · ${groupedFeatures} grouped annotation`
        + `${groupedFeatures === 1 ? "" : "s"}`
        + (
          Number.isFinite(coverage)
            ? ` · ${coverage.toFixed(3)}%`
            : ""
        )
        + ` · sensitivity ${sensitivity}`
        + ` · expansion ${growthRadius}px`
        + ` · dilate ${finalMaskDilatePx}px`;
    }

    if (refs.previewAccept) {
      refs.previewAccept.disabled = count < 1;
    }

    if (refs.previewAction) {
      refs.previewAction.hidden = false;
    }
  }

  function phaseF1ClearPreview(redraw = true) {
    const hadPreview =
      phaseF1PreviewFeatures.length > 0;

    phaseF1ResetPreviewState();
    phaseF1HidePreviewAction();

    if (redraw && hadPreview) {
      drawAnnotations();
    }

    const refs = phaseF1Refs();
    if (refs.detect && !phaseF1Busy) {
      refs.detect.textContent = "Preview detection";
    }
  }

  function phaseF1Close() {
    if (phaseF1Busy) return;

    const refs = phaseF1Refs();
    if (refs.overlay) {
      refs.overlay.hidden = true;
    }

    if (phaseF1PreviewPayload) {
      phaseF1RenderPreview();
      phaseF1ShowPreviewAction();
    }
  }

  function phaseF1Open(options = {}) {
    toggleFileMenu(false);

    const settingsPanel =
      document.getElementById("phaseBSettingsPanel");

    if (settingsPanel) {
      settingsPanel.hidden = true;
    }

    document.getElementById(
      "phaseBSettingsButton"
    )?.setAttribute("aria-expanded", "false");

    if (!currentImage) {
      setStatus(
        "Open an image before Auto Anthracosis",
        "error"
      );
      return;
    }

    if (currentImage.localNative) {
      setStatus(
        "Auto Anthracosis F1.2 requires a server-backed image",
        "error"
      );
      return;
    }

    if (!phaseDTissueRoiFeature()) {
      setStatus(
        "Create or detect Tissue ROI before Auto Anthracosis",
        "error"
      );
      return;
    }

    const preservePreview =
      Boolean(options?.preservePreview);

    if (!preservePreview) {
      phaseF1ClearPreview(false);
    } else {
      phaseF1HidePreviewAction();
    }

    const refs = phaseF1Refs();
    const previous =
      (featureCollection.features || [])
        .filter(phaseF1IsAutomaticFeature)
        .length;

    if (refs.summary) {
      refs.summary.textContent =
        phaseF1PreviewPayload
          ? (
              "A previous preview is active. Change sensitivity and "
              + "press Update preview to recalculate it."
            )
          : (
              "Native tiled HSV analysis: 1024×1024 px, 64 px overlap. "
              + (
                  previous
                    ? `${previous} previous automatic detection`
                      + `${previous === 1 ? "" : "s"} will be replaced only after Accept.`
                    : "Manual Anthracosis annotations are preserved."
                )
            );
    }

    if (refs.detect) {
      refs.detect.textContent =
        phaseF1PreviewPayload
          ? "Update preview"
          : "Preview detection";
    }

    if (refs.overlay) {
      refs.overlay.hidden = false;
    }
  }

  function phaseF1ChangeParameters() {
    phaseF1Open({ preservePreview: true });
  }

  function phaseF1CancelPreview() {
    phaseF1ClearPreview(true);
    setStatus(
      "Anthracosis preview cancelled",
      "local"
    );
  }

  function phaseF1ApplyResult(payload) {
    const detections =
      Array.isArray(payload?.detections)
        ? payload.detections
        : [];

    const existing =
      featureCollection.features || [];

    const previousCount =
      existing.filter(phaseF1IsAutomaticFeature).length;

    if (
      previousCount === 0
      && detections.length === 0
    ) {
      return {
        changed: false,
        previousCount: 0,
        newCount: 0,
      };
    }

    const retained =
      existing.filter(
        (feature) =>
          !phaseF1IsAutomaticFeature(feature)
      );

    const generated =
      detections
        .filter((item) => item?.geometry)
        .map(
          (item) =>
            phaseF1CreateFeature(
              item,
              payload?.model
            )
        );

    pushUndo();

    featureCollection.features = [
      ...retained,
      ...generated,
    ];

    clearSelectedFeatures(false);
    markChanged();
    updateControls();
    drawAnnotations();

    return {
      changed: true,
      previousCount,
      newCount: generated.length,
      componentCount: Number(
        payload?.summary?.returnedDetections
        ?? generated.length
      ),
    };
  }

  function phaseF1SetPreview(
    payload,
    imageId,
    annotationFile
  ) {
    phaseF1PreviewPayload = deepClone(payload);
    phaseF1PreviewImageId = String(imageId);
    phaseF1PreviewAnnotationFile =
      String(annotationFile);

    const detections =
      Array.isArray(payload?.detections)
        ? payload.detections
        : [];

    phaseF1PreviewFeatures =
      detections
        .filter((item) => item?.geometry)
        .map(
          (item) =>
            phaseF1CreateFeature(
              item,
              payload?.model,
              { preview: true }
            )
        );

    phaseF1RenderPreview();
  }

  async function phaseF17LongRequest(
    url,
    options = {}
  ) {
    // F1.12:
    // Keep the dedicated long timeout, but route through apiFetch.
    // On Capacitor/Android apiFetch translates API requests to the
    // configured HistoAnnotator server instead of the local WebView origin.
    return await apiFetch(
      url,
      {
        ...options,
        timeoutMs: 5 * 60 * 1000,
      }
    );
  }

  async function phaseF1Detect() {
    if (phaseF1Busy) return;

    if (
      !currentImage
      || currentImage.localNative
    ) {
      setStatus(
        "Auto Anthracosis F1.2 requires a server-backed image",
        "error"
      );
      return;
    }

    if (!phaseDTissueRoiFeature()) {
      setStatus(
        "Create or detect Tissue ROI before Auto Anthracosis",
        "error"
      );
      return;
    }

    const refs = phaseF1Refs();

    const sensitivity = Math.max(
      0,
      Math.min(
        100,
        Number(refs.sensitivity?.value ?? 50)
      )
    );

    const growthRadius = Math.max(
      0,
      Math.min(
        20,
        Number(refs.growth?.value ?? 8)
      )
    );

    const finalMaskDilatePx = Math.max(
      0,
      Math.min(
        6,
        Number(refs.finalDilate?.value ?? 0)
      )
    );

    const imageId = String(currentImage.id);
    const annotationFile =
      String(currentAnnotationFile);

    phaseF1HidePreviewAction();
    phaseF1Busy = true;

    if (refs.detect) {
      refs.detect.disabled = true;
      refs.detect.textContent =
        "Detecting native tiles…";
    }

    if (refs.close) {
      refs.close.disabled = true;
    }

    if (refs.summary) {
      refs.summary.textContent =
        "Analyzing native-resolution tiles inside Tissue ROI − Artifact…";
    }

    setStatus(
      "Detecting anthracosis at native resolution… large slides may take a while",
      "local"
    );

    try {
      const analysisCollection =
        await phaseIL11FeatureCollectionForLearning();

      const response = await phaseF17LongRequest(
        `${API}/images/${encodeURIComponent(
          imageId
        )}/detect-anthracosis`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            featureCollection: analysisCollection,
            sensitivity,
            tileSize: 1024,
            overlap: 64,
            minComponentPixels: 1,
            growthRadius,
            finalMaskDilatePx,
            microdepositVectorMaxPixels: 4,
            maxComponents: 50000,
          }),
        }
      );

      if (!response.ok) {
        let detail =
          `${response.status} ${response.statusText}`.trim();

        try {
          const problem = await response.json();
          detail =
            String(problem?.detail || detail);
        } catch (_) {}

        throw new Error(detail);
      }

      const payload = await response.json();

      if (
        !currentImage
        || String(currentImage.id) !== imageId
        || String(currentAnnotationFile)
          !== annotationFile
      ) {
        phaseF1ClearPreview(true);
        setStatus(
          "Anthracosis detection finished, but the active annotation file changed; preview was discarded",
          "local"
        );
        return;
      }

      phaseF1SetPreview(
        payload,
        imageId,
        annotationFile
      );

      const count = Number(
        payload?.summary?.returnedDetections ?? 0
      );
      const coverage = Number(
        payload?.summary?.coveragePercent
      );
      const tiles = Number(
        payload?.summary?.tilesProcessed ?? 0
      );
      const planned = Number(
        payload?.summary?.tilesPlanned ?? 0
      );

      if (refs.summary) {
        refs.summary.textContent =
          `Preview ready · ${count} detection`
          + `${count === 1 ? "" : "s"}`
          + (
              Number.isFinite(coverage)
                ? ` · ${coverage.toFixed(3)}% of Valid Tissue`
                : ""
            )
          + ` · ${tiles}/${planned} tissue tiles processed.`;
      }

      if (refs.overlay) {
        refs.overlay.hidden = true;
      }

      phaseF1ShowPreviewAction();

      setStatus(
        count > 0
          ? `Anthracosis preview ready: ${count} detection${count === 1 ? "" : "s"}`
          : "Anthracosis preview found no deposits",
        "local"
      );
    } catch (error) {
      if (phaseF1PreviewPayload) {
        phaseF1RenderPreview();
      }

      if (refs.summary) {
        refs.summary.textContent =
          `Detection failed: ${error.message}`;
      }

      setStatus(
        `Auto Anthracosis failed: ${error.message}`,
        "error"
      );
    } finally {
      phaseF1Busy = false;

      if (refs.detect) {
        refs.detect.disabled = false;
        refs.detect.textContent =
          phaseF1PreviewPayload
            ? "Update preview"
            : "Preview detection";
      }

      if (refs.close) {
        refs.close.disabled = false;
      }
    }
  }

  function phaseF1Accept() {
    if (
      phaseF1Busy
      || !phaseF1PreviewPayload
    ) {
      return;
    }

    if (
      !currentImage
      || String(currentImage.id)
        !== phaseF1PreviewImageId
      || String(currentAnnotationFile)
        !== phaseF1PreviewAnnotationFile
    ) {
      phaseF1ClearPreview(true);
      setStatus(
        "The active image or annotation file changed; preview was discarded",
        "error"
      );
      return;
    }

    const payload = phaseF1PreviewPayload;

    phaseF1ResetPreviewState();
    phaseF1HidePreviewAction();

    const result = phaseF1ApplyResult(payload);

    const refs = phaseF1Refs();
    if (refs.overlay) {
      refs.overlay.hidden = true;
    }

    setStatus(
      result.componentCount > 0
        ? (
            `Accepted ${result.componentCount} Anthracosis component`
            + `${result.componentCount === 1 ? "" : "s"}`
            + ` in ${result.newCount} grouped annotation`
            + `${result.newCount === 1 ? "" : "s"}`
          )
        : "No Anthracosis detections were accepted",
      result.changed ? "saved" : "local"
    );
  }

