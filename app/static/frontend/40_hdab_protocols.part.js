  // Reuses the proven F1/Anthracosis transient preview renderer.
  // =========================================================

  let phaseF21Busy = false;
  let phaseF21PreviewPayload = null;
  let phaseF21PreviewFeatures = [];
  let phaseF21PreviewImageId = null;
  let phaseF21PreviewAnnotationFile = null;

  function phaseF21Refs() {
    return {
      action:
        document.getElementById(
          "phaseF21HdabPreviewAction"
        ),
      summary:
        document.getElementById(
          "phaseF21HdabPreviewSummary"
        ),
      changeParameters:
        document.getElementById(
          "phaseF21HdabChangeParametersButton"
        ),
      accept:
        document.getElementById(
          "phaseF21HdabAcceptButton"
        ),
      cancel:
        document.getElementById(
          "phaseF21HdabCancelButton"
        ),
    };
  }

  function phaseF21PositiveClass() {
    return (
      (classes || []).find(
        (item) =>
          String(
            item?.name || ""
          )
            .trim()
            .toLowerCase()
          === "positive"
      )
      || {
        name: "Positive",
        color: "#ff6b6b",
      }
    );
  }

  function phaseF21IsAutomaticPositiveFeature(
    feature
  ) {
    const metadata =
      feature?.properties
        ?.histoannotator
        ?.autoDetection;

    return (
      phaseDIsAnnotationFeature(
        feature
      )
      && String(
        feature?.properties
          ?.classification
          ?.name
        || ""
      )
        .trim()
        .toLowerCase()
        === "positive"
      && String(
        metadata?.type
        || ""
      )
        .trim()
        .toLowerCase()
        === "hdab-positive"
      && String(
        metadata?.method
        || ""
      )
        .trim()
        .toLowerCase()
        .startsWith("quantitative-hdab-native-v")
    );
  }

  function phaseF21CreatePositiveFeature(
    detection,
    payload,
    options = {}
  ) {
    const classInfo =
      phaseF21PositiveClass();

    const metadata =
      phaseCCreateMetadata();

    const threshold =
      payload?.threshold || {};

    const analysis =
      payload?.analysis || {};

    const results =
      payload?.results || {};

    metadata.autoDetection = {
      type:
        "hdab-positive",
      method:
        String(
          payload?.method
          || "quantitative-hdab-native-v1"
        ),
      thresholdMode:
        String(
          threshold?.mode
          || "auto"
        ),
      thresholdMethod:
        String(
          threshold?.method
          || ""
        ),
      dabOpticalDensityThreshold:
        Number(
          threshold?.dabOpticalDensity
          || 0
        ),
      positivePercent:
        Number(
          results?.positivePercent
          || 0
        ),
      analysisRegion:
        String(
          analysis?.analysisRegion
          || (
            "Tissue ROI - External border "
            + "- Artifact - Anthracosis"
          )
        ),
      analysisResolution:
        String(
          analysis?.analysisResolution
          || "native-level-0"
        ),
      processing:
        deepClone(
          payload?.processing
          || {}
        ),
      analysisProtocol:
        deepClone(
          payload?.analysisProtocol
          || null
        ),
      createdAt:
        new Date().toISOString(),
    };

    if (options.preview) {
      metadata.preview = {
        transient: true,
        type: "hdab-positive",
      };
    }

    const color =
      options.preview
        ? "#ff8787"
        : (
            classInfo.color
            || "#ff6b6b"
          );

    return {
      type: "Feature",
      id:
        options.preview
          ? `hdab-positive-preview-${uid()}`
          : uid(),
      geometry:
        deepClone(
          detection.geometry
        ),
      properties: {
        objectType: "annotation",
        classification: {
          name: "Positive",
          color:
            hexToRgbArray(
              color
            ),
        },
        isLocked:
          Boolean(
            options.preview
          ),
        histoannotator:
          metadata,
      },
    };
  }

  function phaseF21ResetPreviewState() {
    phaseF21PreviewPayload = null;
    phaseF21PreviewFeatures = [];
    phaseF21PreviewImageId = null;
    phaseF21PreviewAnnotationFile = null;
    window.__phaseF1PreviewFeatures = [];
  }

  function phaseF21RenderPreview() {
    window.__phaseF1PreviewFeatures =
      Array.isArray(
        phaseF21PreviewFeatures
      )
        ? phaseF21PreviewFeatures
        : [];

    drawAnnotations();
  }

  function phaseF21HidePreviewAction() {
    const refs =
      phaseF21Refs();

    if (refs.action) {
      refs.action.hidden = true;
    }
  }

  function phaseF21ShowPreviewAction() {
    const refs =
      phaseF21Refs();

    const results =
      phaseF21PreviewPayload?.results
      || {};

    const threshold =
      phaseF21PreviewPayload?.threshold
      || {};

    const preview =
      phaseF21PreviewPayload?.preview
      || {};

    const percent =
      Number(
        results?.positivePercent
        || 0
      );

    const thresholdOd =
      Number(
        threshold?.dabOpticalDensity
        || 0
      );

    const features =
      Number(
        preview?.returnedFeatures
        ?? phaseF21PreviewFeatures.length
        ?? 0
      );

    if (refs.summary) {
      refs.summary.textContent =
        `${percent.toFixed(2)}% Positive`
        + ` · ${thresholdOd.toFixed(3)} DAB OD`
        + ` · ${features} preview feature`
        + `${features === 1 ? "" : "s"}`
        + (
          features < 1
            ? " · no Positive geometry to accept"
            : ""
        );
    }

    if (refs.accept) {
      refs.accept.disabled =
        features < 1
        || phaseF21Busy;
    }

    if (refs.action) {
      refs.action.hidden = false;
    }
  }

  function phaseF21ClearPreview(
    redraw = true
  ) {
    const hadPreview =
      phaseF21PreviewFeatures.length
      > 0;

    phaseF21ResetPreviewState();
    phaseF21HidePreviewAction();

    if (
      redraw
      && hadPreview
    ) {
      drawAnnotations();
    }
  }

  function phaseF21SetPreview(
    payload,
    imageId,
    annotationFile
  ) {
    if (
      payload
      && !payload.analysisProtocol
    ) {
      payload.analysisProtocol =
        phaseF24ProtocolSnapshotForMetadata(
          "hdab"
        );

      const activeProtocol =
        phaseF24ActiveProtocol();

      if (
        payload.analysisProtocol
        && activeProtocol
        && String(activeProtocol.hash || "")
          === String(
            payload.analysisProtocol.hash
            || ""
          )
      ) {
        payload.analysisProtocolPipeline =
          deepClone(
            activeProtocol.pipeline
          );
      }
    }

    phaseF21PreviewPayload =
      deepClone(
        payload
      );

    phaseF21PreviewImageId =
      String(
        imageId
      );

    phaseF21PreviewAnnotationFile =
      String(
        annotationFile
      );

    const detections =
      Array.isArray(
        payload?.detections
      )
        ? payload.detections
        : [];

    phaseF21PreviewFeatures =
      detections
        .filter(
          (item) =>
            item?.geometry
        )
        .map(
          (item) =>
            phaseF21CreatePositiveFeature(
              item,
              payload,
              {
                preview: true,
              }
            )
        );

    phaseF21RenderPreview();
  }

  function phaseF21ChangeParameters() {
    phaseF21HidePreviewAction();

    phaseF20OpenHdabQuantification();

    if (
      els.hdabQuantContent
      && phaseF21PreviewPayload
    ) {
      const results =
        phaseF21PreviewPayload.results
        || {};

      const threshold =
        phaseF21PreviewPayload.threshold
        || {};

      els.hdabQuantContent.innerHTML = `
        <p class="modal-note">
          Previous preview remains visible.
          Current result:
          <strong>${formatStatNumber(
            Number(
              results.positivePercent
              || 0
            ),
            2
          )}% Positive</strong>
          · threshold
          ${formatStatNumber(
            Number(
              threshold.dabOpticalDensity
              || 0
            ),
            3
          )} DAB OD.
          Change parameters and press
          Preview positive to recalculate.
        </p>
      `;
    }
  }

  function phaseF21CancelPreview() {
    if (phaseF21Busy) {
      return;
    }

    phaseF21ClearPreview(
      true
    );

    setStatus(
      "H-DAB Positive preview cancelled",
      "local"
    );
  }

  async function phaseF21EnsurePositiveClass() {
    const localExisting =
      (classes || []).find(
        (item) =>
          String(
            item?.name || ""
          )
            .trim()
            .toLowerCase()
          === "positive"
      );

    const response =
      await apiFetch(
        `${API}/classes/ensure-positive`,
        {
          method: "POST",
          timeoutMs: 10000,
        }
      );

    const payload =
      await response.json();

    const serverClass =
      payload?.class
      || {
        name: "Positive",
        color: "#ff6b6b",
      };

    if (
      !localExisting
      && Array.isArray(classes)
    ) {
      classes.push({
        name:
          String(
            serverClass.name
            || "Positive"
          ),
        color:
          String(
            serverClass.color
            || "#ff6b6b"
          ),
      });

      if (
        typeof renderClasses
        === "function"
      ) {
        renderClasses();
      }

      if (
        typeof renderClassList
        === "function"
      ) {
        renderClassList();
      }

      if (
        typeof updateClassList
        === "function"
      ) {
        updateClassList();
      }

      if (
        typeof renderClassButtons
        === "function"
      ) {
        renderClassButtons();
      }

      updateControls();
    }

    return (
      localExisting
      || serverClass
    );
  }

  function phaseF21ApplyAcceptedResult(
    payload
  ) {
    const detections =
      Array.isArray(
        payload?.detections
      )
        ? payload.detections
        : [];

    const existing =
      featureCollection.features
      || [];

    const previousCount =
      existing.filter(
        phaseF21IsAutomaticPositiveFeature
      ).length;

    const retained =
      existing.filter(
        (feature) =>
          !phaseF21IsAutomaticPositiveFeature(
            feature
          )
      );

    const generated =
      detections
        .filter(
          (item) =>
            item?.geometry
        )
        .map(
          (item) =>
            phaseF21CreatePositiveFeature(
              item,
              payload
            )
        );

    if (
      previousCount === 0
      && generated.length === 0
    ) {
      return {
        changed: false,
        previousCount: 0,
        newCount: 0,
      };
    }

    pushUndo();

    featureCollection.features = [
      ...retained,
      ...generated,
    ];

    clearSelectedFeatures(
      false
    );

    markChanged();
    updateControls();
    drawAnnotations();

    return {
      changed: true,
      previousCount,
      newCount:
        generated.length,
    };
  }

  async function phaseF21AcceptPreview() {
    if (
      phaseF21Busy
      || !phaseF21PreviewPayload
    ) {
      return;
    }

    if (
      !currentImage
      || String(
        currentImage.id
      )
        !== phaseF21PreviewImageId
      || String(
        currentAnnotationFile
      )
        !== phaseF21PreviewAnnotationFile
    ) {
      phaseF21ClearPreview(
        true
      );

      setStatus(
        "The active image or annotation file changed; H-DAB preview was discarded",
        "error"
      );

      return;
    }

    phaseF21Busy = true;

    const refs =
      phaseF21Refs();

    if (refs.accept) {
      refs.accept.disabled = true;
      refs.accept.textContent =
        "Accepting…";
    }

    if (refs.cancel) {
      refs.cancel.disabled = true;
    }

    try {
      await phaseF21EnsurePositiveClass();

      const payload =
        phaseF21PreviewPayload;

      phaseF21ResetPreviewState();
      phaseF21HidePreviewAction();

      const result =
        phaseF21ApplyAcceptedResult(
          payload
        );

      const percent =
        Number(
          payload?.results
            ?.positivePercent
          || 0
        );

      setStatus(
        result.newCount > 0
          ? (
              `Accepted H-DAB Positive · `
              + `${percent.toFixed(2)}%`
              + ` · ${result.newCount} editable feature`
              + `${result.newCount === 1 ? "" : "s"}`
            )
          : (
              "No H-DAB Positive geometry was accepted"
            ),
        result.changed
          ? "saved"
          : "local"
      );
    } catch (error) {
      phaseF21RenderPreview();
      phaseF21ShowPreviewAction();

      setStatus(
        `Could not accept H-DAB Positive: ${error.message}`,
        "error"
      );
    } finally {
      phaseF21Busy = false;

      if (refs.accept) {
        refs.accept.textContent =
          "Accept";
      }

      if (refs.cancel) {
        refs.cancel.disabled = false;
      }

      if (phaseF21PreviewPayload) {
        phaseF21ShowPreviewAction();
      }
    }
  }

  async function phaseF21RunHdabPreview() {
    if (
      phaseF21Busy
      || !currentImage
      || !currentInfo
      || imageType !== "hdab"
    ) {
      return;
    }

    if (
      currentImage.localNative
    ) {
      setStatus(
        "H-DAB quantification requires a server-backed image",
        "error"
      );
      return;
    }

    if (!phaseDTissueRoiFeature()) {
      setStatus(
        "Create or detect Tissue ROI before H-DAB quantification",
        "error"
      );
      return;
    }

    const thresholdMode =
      String(
        els.hdabQuantThresholdMode
          ?.value
        || "auto"
      );

    const thresholdOd =
      Math.max(
        0,
        Math.min(
          6,
          Number(
            els.hdabQuantThreshold
              ?.value
            || 0.30
          )
        )
      );

    const phaseF22Settings =
      phaseF22SettingsPayload();

    phaseF22ClearLivePreview(true);

    const imageId =
      String(
        currentImage.id
      );

    const annotationFile =
      String(
        currentAnnotationFile
      );

    phaseF21Busy = true;
    phaseF21HidePreviewAction();

    if (
      els.hdabQuantRunButton
    ) {
      els.hdabQuantRunButton.disabled =
        true;
      els.hdabQuantRunButton.textContent =
        "Building preview…";
    }

    if (
      els.hdabQuantContent
    ) {
      els.hdabQuantContent.innerHTML =
        '<p class="modal-note">Analyzing native H-DAB pixels and building Positive preview… large slides may take a while.</p>';
    }

    setStatus(
      "Building native H-DAB Positive preview…",
      "local"
    );

    try {
      const response =
        await apiFetch(
          `${API}/images/${encodeURIComponent(
            imageId
          )}/analyze-hdab-v2-preview`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                featureCollection,
                thresholdMode:
                  phaseF22Settings.thresholdMode,
                thresholdOd,
                wovDelta:
                  phaseF22Settings.wovDelta,
                smoothingEnabled:
                  phaseF22Settings.smoothingEnabled,
                smoothingSigma:
                  phaseF22Settings.smoothingSigma,
                smallObjectFilterEnabled:
                  phaseF22Settings.smallObjectFilterEnabled,
                minimumObjectArea:
                  phaseF22Settings.minimumObjectArea,
                mpp:
                  phaseF22Settings.mpp,
                tileSize: 1024,
              }),
            timeoutMs:
              5 * 60 * 1000,
          }
        );

      const payload =
        await response.json();

      if (
        !currentImage
        || String(
          currentImage.id
        )
          !== imageId
        || String(
          currentAnnotationFile
        )
          !== annotationFile
      ) {
        phaseF21ClearPreview(
          true
        );

        setStatus(
          "H-DAB analysis finished, but the active image or annotation file changed; preview was discarded",
          "local"
        );

        return;
      }

      phaseF20LastHdabResult =
        deepClone(
          payload
        );

      phaseF21SetPreview(
        payload,
        imageId,
        annotationFile
      );

      const results =
        payload?.results || {};

      const threshold =
        payload?.threshold || {};

      const analysis =
        payload?.analysis || {};

      const preview =
        payload?.preview || {};

      const positivePercent =
        Number(
          results?.positivePercent
          || 0
        );

      const thresholdValue =
        Number(
          threshold?.dabOpticalDensity
          || 0
        );

      const featureCount =
        Number(
          preview?.returnedFeatures
          ?? phaseF21PreviewFeatures.length
          ?? 0
        );

      if (
        els.hdabQuantContent
      ) {
        els.hdabQuantContent.innerHTML = `
          <p class="modal-note">
            Preview ready:
            <strong>${formatStatNumber(
              positivePercent,
              2
            )}% Positive</strong>
            · threshold
            ${formatStatNumber(
              thresholdValue,
              3
            )} DAB OD
            · ${formatStatNumber(
              featureCount
            )} spatial feature
            ${featureCount === 1 ? "" : "s"}.
            Inspect the red overlay in the viewer.
          </p>
        `;
      }

      if (
        els.hdabQuantModal
      ) {
        els.hdabQuantModal.hidden =
          true;
      }

      phaseF21ShowPreviewAction();

      setStatus(
        (
          `H-DAB Positive preview ready · `
          + `${positivePercent.toFixed(2)}%`
          + ` · threshold ${thresholdValue.toFixed(3)} OD`
        ),
        "local"
      );
    } catch (error) {
      if (
        phaseF21PreviewPayload
      ) {
        phaseF21RenderPreview();
        phaseF21ShowPreviewAction();
      }

      if (
        els.hdabQuantContent
      ) {
        els.hdabQuantContent.innerHTML =
          `<p class="modal-note">H-DAB preview failed: ${escapeHtml(error.message)}</p>`;
      }

      setStatus(
        `H-DAB preview failed: ${error.message}`,
        "error"
      );
    } finally {
      phaseF21Busy = false;

      if (
        els.hdabQuantRunButton
      ) {
        els.hdabQuantRunButton.disabled =
          false;
        els.hdabQuantRunButton.textContent =
          "Preview whole slide";
      }

      // F2.2.1: the first action-bar render happens while the
      // whole-slide request is still marked busy. Refresh it now
      // so Accept becomes enabled whenever Positive geometry exists.
      if (phaseF21PreviewPayload) {
        phaseF21ShowPreviewAction();
      }
    }
  }

  // =========================================================
  // Phase F2.2 — Advanced H-DAB processing + manual live preview
  // =========================================================

  let phaseF22LiveRegion = null;
  let phaseF22LiveTimer = null;
  let phaseF22LiveSequence = 0;
  let phaseF22LiveFeatures = [];

  function phaseF22Mpp() {
    const calibration =
      phaseEPhysicalPixelAreaMm2();

    const areaFactor =
      Number(
        calibration?.mm2PerPx2
      );

    if (
      Number.isFinite(areaFactor)
      && areaFactor > 0
    ) {
      return Math.sqrt(
        areaFactor
        * 1_000_000
      );
    }

    return null;
  }

  function phaseF22SettingsPayload() {
    const mpp =
      phaseF22Mpp();

    return {
      thresholdMode:
        String(
          els.hdabQuantThresholdMode
            ?.value
          || "auto_otsu"
        ),
      thresholdOd:
        Math.max(
          0,
          Math.min(
            6,
            Number(
              els.hdabQuantThreshold
                ?.value
              || 0.30
            )
          )
        ),
      wovDelta:
        Math.max(
          -1,
          Math.min(
            1,
            Number(
              els.hdabQuantWovDelta
                ?.value
              || 0.25
            )
          )
        ),
      smoothingEnabled:
        Boolean(
          els.hdabQuantSmoothingEnabled
            ?.checked
        ),
      smoothingSigma:
        Math.max(
          0,
          Number(
            els.hdabQuantSmoothing
              ?.value
            || 1.0
          )
        ),
      smallObjectFilterEnabled:
        Boolean(
          els.hdabQuantSmallFilterEnabled
            ?.checked
        ),
      minimumObjectArea:
        Math.max(
          0,
          Number(
            els.hdabQuantMinimumArea
              ?.value
            || 25
          )
        ),
      mpp:
        Number.isFinite(
          Number(mpp)
        )
          && Number(mpp) > 0
          ? Number(mpp)
          : 0,
      tileSize:
        1024,
    };
  }

  function phaseF22UpdateProcessingControls() {
    const settings =
      phaseF22SettingsPayload();

    const manual =
      settings.thresholdMode
      === "manual";

    const wov =
      settings.thresholdMode
      === "auto_wov";

    if (els.hdabQuantThreshold) {
      els.hdabQuantThreshold.disabled =
        !manual;
    }

    if (els.hdabQuantThresholdField) {
      els.hdabQuantThresholdField.hidden =
        !manual;
    }

    if (els.hdabQuantWovDeltaField) {
      els.hdabQuantWovDeltaField.hidden =
        !wov;
    }

    if (els.hdabQuantLivePanel) {
      els.hdabQuantLivePanel.hidden =
        !manual;
    }

    if (els.hdabQuantSmoothingField) {
      els.hdabQuantSmoothingField.hidden =
        !settings.smoothingEnabled;
    }

    if (els.hdabQuantMinimumAreaField) {
      els.hdabQuantMinimumAreaField.hidden =
        !settings.smallObjectFilterEnabled;
    }

    if (
      els.hdabQuantThresholdValue
      && els.hdabQuantThreshold
    ) {
      els.hdabQuantThresholdValue.textContent =
        Number(
          els.hdabQuantThreshold.value
          || 0
        ).toFixed(2);
    }

    if (
      els.hdabQuantWovDeltaValue
      && els.hdabQuantWovDelta
    ) {
      const value =
        Number(
          els.hdabQuantWovDelta.value
          || 0
        );

      els.hdabQuantWovDeltaValue.textContent =
        `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
    }

    if (
      els.hdabQuantSmoothingValue
      && els.hdabQuantSmoothing
    ) {
      els.hdabQuantSmoothingValue.textContent =
        Number(
          els.hdabQuantSmoothing.value
          || 0
        ).toFixed(2);
    }

    if (
      els.hdabQuantMinimumAreaValue
      && els.hdabQuantMinimumArea
    ) {
      els.hdabQuantMinimumAreaValue.textContent =
        Number(
          els.hdabQuantMinimumArea.value
          || 0
        ).toFixed(1);
    }

    const calibrated =
      Number(settings.mpp) > 0;

    if (els.hdabQuantSmoothingUnit) {
      els.hdabQuantSmoothingUnit.textContent =
        calibrated
          ? "µm"
          : "px";
    }

    if (els.hdabQuantMinimumAreaUnit) {
      els.hdabQuantMinimumAreaUnit.textContent =
        calibrated
          ? "µm²"
          : "px²";
    }

    if (
      !manual
      && phaseF22LiveRegion
    ) {
      phaseF22ClearLivePreview(true);
    }
  }

  function phaseF22ClearLivePreview(
    redraw = true
  ) {
    if (phaseF22LiveTimer) {
      clearTimeout(
        phaseF22LiveTimer
      );
      phaseF22LiveTimer = null;
    }

    phaseF22LiveSequence += 1;

    const hadLive =
      phaseF22LiveFeatures.length > 0;

    phaseF22LiveRegion = null;
    phaseF22LiveFeatures = [];

    if (!phaseF21PreviewPayload) {
      window.__phaseF1PreviewFeatures = [];
    } else {
      phaseF21RenderPreview();
    }

    if (
      els.hdabQuantClearLiveButton
    ) {
      els.hdabQuantClearLiveButton.disabled =
        true;
    }

    if (els.hdabQuantLiveStatus) {
      els.hdabQuantLiveStatus.textContent =
        "No live-preview region selected.";
    }

    if (redraw && hadLive) {
      drawAnnotations();
    }
  }

  function phaseF22RenderLivePayload(
    payload
  ) {
    const detections =
      Array.isArray(
        payload?.detections
      )
        ? payload.detections
        : [];

    phaseF22LiveFeatures =
      detections
        .filter(
          (item) =>
            item?.geometry
        )
        .map(
          (item) =>
            phaseF21CreatePositiveFeature(
              item,
              payload,
              {
                preview: true,
              }
            )
        );

    window.__phaseF1PreviewFeatures =
      phaseF22LiveFeatures;

    drawAnnotations();

    const results =
      payload?.results || {};
    const threshold =
      payload?.threshold || {};
    const processing =
      payload?.processing || {};
    const small =
      processing?.smallObjectFilter
      || {};
    const region =
      payload?.analysis?.region
      || {};

    const liveStatusText =
      `${Number(
        results.positivePercent
        || 0
      ).toFixed(2)}% Positive`
      + ` · ${Number(
        threshold.dabOpticalDensity
        || 0
      ).toFixed(3)} DAB OD`
      + ` · ${Number(
        region.width
        || 0
      )}×${Number(
        region.height
        || 0
      )} px`
      + (
        small.enabled
          ? ` · removed ${Number(
              small.removedObjects
              || 0
            )} small object(s)`
          : ""
      );

    if (els.hdabQuantLiveStatus) {
      els.hdabQuantLiveStatus.textContent =
        liveStatusText;
    }

    const dockRefs =
      phaseF22DockRefs();

    if (dockRefs.summary) {
      dockRefs.summary.textContent =
        liveStatusText;
    }

    phaseF22SyncDockThreshold();
  }

  async function phaseF22RunLivePreview() {
    if (
      !phaseF22LiveRegion
      || !currentImage
      || !currentInfo
      || imageType !== "hdab"
    ) {
      return;
    }

    const settings =
      phaseF22SettingsPayload();

    if (
      settings.thresholdMode
      !== "manual"
    ) {
      return;
    }

    const sequence =
      ++phaseF22LiveSequence;

    if (els.hdabQuantLiveStatus) {
      els.hdabQuantLiveStatus.textContent =
        "Updating live preview…";
    }

    const liveDockRefs =
      phaseF22DockRefs();

    if (liveDockRefs.summary) {
      liveDockRefs.summary.textContent =
        "Updating live preview…";
    }

    try {
      const response =
        await apiFetch(
          `${API}/images/${encodeURIComponent(
            currentImage.id
          )}/analyze-hdab-live-preview`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                featureCollection,
                region:
                  phaseF22LiveRegion,
                ...settings,
              }),
            timeoutMs:
              60 * 1000,
          }
        );

      const payload =
        await response.json();

      if (
        sequence
        !== phaseF22LiveSequence
      ) {
        return;
      }

      phaseF22RenderLivePayload(
        payload
      );
    } catch (error) {
      if (
        sequence
        !== phaseF22LiveSequence
      ) {
        return;
      }

      const message =
        `Live preview failed: ${error.message}`;

      if (els.hdabQuantLiveStatus) {
        els.hdabQuantLiveStatus.textContent =
          message;
      }

      const dockRefs =
        phaseF22DockRefs();

      if (dockRefs.summary) {
        dockRefs.summary.textContent =
          message;
      }
    }
  }

  function phaseF22ScheduleLivePreview() {
    if (
      !phaseF22LiveRegion
      || String(
        els.hdabQuantThresholdMode
          ?.value
      )
        !== "manual"
    ) {
      return;
    }

    if (phaseF22LiveTimer) {
      clearTimeout(
        phaseF22LiveTimer
      );
    }

    phaseF22LiveTimer =
      setTimeout(
        () => {
          phaseF22LiveTimer = null;
          phaseF22RunLivePreview();
        },
        300
      );
  }

  function phaseF22DockRefs() {
    return {
      dock:
        document.getElementById(
          "phaseF22LiveDock"
        ),
      summary:
        document.getElementById(
          "phaseF22LiveDockSummary"
        ),
      threshold:
        document.getElementById(
          "phaseF22LiveDockThreshold"
        ),
      thresholdValue:
        document.getElementById(
          "phaseF22LiveDockThresholdValue"
        ),
    };
  }

  function phaseF22SyncDockThreshold() {
    const refs =
      phaseF22DockRefs();

    const value =
      Number(
        els.hdabQuantThreshold
          ?.value
        || 0.30
      );

    if (refs.threshold) {
      refs.threshold.value =
        String(value);
    }

    if (refs.thresholdValue) {
      refs.thresholdValue.textContent =
        value.toFixed(2);
    }
  }

  function phaseF22ShowLiveDock() {
    const refs =
      phaseF22DockRefs();

    phaseF22SyncDockThreshold();

    if (els.hdabQuantModal) {
      els.hdabQuantModal.hidden =
        true;
    }

    if (refs.dock) {
      refs.dock.hidden = false;
    }

    phaseF21HidePreviewAction();
  }

  function phaseF22HideLiveDock() {
    const refs =
      phaseF22DockRefs();

    if (refs.dock) {
      refs.dock.hidden = true;
    }
  }

  function phaseF22OpenParametersFromDock() {
    phaseF22HideLiveDock();

    if (els.hdabQuantModal) {
      els.hdabQuantModal.hidden =
        false;
    }

    phaseF20UpdateThresholdControls();
  }

  async function phaseF22ApplyLiveSettingsWholeSlide() {
    phaseF22HideLiveDock();
    await phaseF21RunHdabPreview();
  }

  function phaseF22CaptureCurrentView() {
    if (
      !viewer
      || !viewer.world
      || !viewer.world.getItemCount()
    ) {
      setStatus(
        "Open an image before selecting a live-preview region",
        "error"
      );
      return;
    }

    const item =
      viewer.world.getItemAt(0);

    if (
      !item
      || typeof item.viewportToImageRectangle
        !== "function"
    ) {
      setStatus(
        "Could not convert the current view to image coordinates",
        "error"
      );
      return;
    }

    const viewportBounds =
      viewer.viewport.getBounds(true);

    const imageBounds =
      item.viewportToImageRectangle(
        viewportBounds
      );

    const content =
      item.getContentSize();

    const fullWidth =
      Number(
        content?.x
        || currentInfo?.width
        || 0
      );
    const fullHeight =
      Number(
        content?.y
        || currentInfo?.height
        || 0
      );

    if (
      !Number.isFinite(fullWidth)
      || !Number.isFinite(fullHeight)
      || fullWidth <= 0
      || fullHeight <= 0
    ) {
      setStatus(
        "Could not determine native image dimensions",
        "error"
      );
      return;
    }

    const rawWidth =
      Math.max(
        1,
        Math.min(
          fullWidth,
          Number(imageBounds.width)
        )
      );
    const rawHeight =
      Math.max(
        1,
        Math.min(
          fullHeight,
          Number(imageBounds.height)
        )
      );

    const maxSide = 1536;

    const width =
      Math.min(
        rawWidth,
        maxSide
      );
    const height =
      Math.min(
        rawHeight,
        maxSide
      );

    const centerX =
      Number(imageBounds.x)
      + rawWidth / 2;
    const centerY =
      Number(imageBounds.y)
      + rawHeight / 2;

    const x =
      Math.max(
        0,
        Math.min(
          fullWidth - width,
          centerX - width / 2
        )
      );
    const y =
      Math.max(
        0,
        Math.min(
          fullHeight - height,
          centerY - height / 2
        )
      );

    if (phaseF21PreviewPayload) {
      phaseF21ClearPreview(true);
    }

    phaseF22LiveRegion = {
      x,
      y,
      width,
      height,
    };

    if (
      els.hdabQuantClearLiveButton
    ) {
      els.hdabQuantClearLiveButton.disabled =
        false;
    }

    phaseF22ShowLiveDock();
    phaseF22RunLivePreview();
  }

  // =========================================================
  // Phase F2.0 — Quantitative H-DAB analysis
  // =========================================================

  let phaseF20LastHdabResult = null;

  function phaseF20UpdateThresholdControls() {
    phaseF22UpdateProcessingControls();
  }

  // ========================================================================
  // Phase F2.4 — Reproducible Analysis Protocols
  // ========================================================================

  const PHASE_F24_PROTOCOL_STORAGE_KEY =
    "histoannotator.analysisProtocols.v1";

  const PHASE_F24_ACTIVE_PROTOCOL_KEY =
    "histoannotator.analysisProtocols.v1.activeId";

  function phaseF24ReadProtocols() {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            PHASE_F24_PROTOCOL_STORAGE_KEY
          )
          || "[]"
        );

      return Array.isArray(value)
        ? value.filter(
            (item) =>
              item
              && typeof item === "object"
              && item.schemaVersion === 1
              && item.pipeline
          )
        : [];
    } catch (_) {
      return [];
    }
  }

  function phaseF24WriteProtocols(
    protocols
  ) {
    localStorage.setItem(
      PHASE_F24_PROTOCOL_STORAGE_KEY,
      JSON.stringify(
        protocols
      )
    );
  }

  function phaseF24ActiveProtocolId() {
    return String(
      localStorage.getItem(
        PHASE_F24_ACTIVE_PROTOCOL_KEY
      )
      || ""
    );
  }

  function phaseF24SetActiveProtocolId(
    protocolId
  ) {
    const id =
      String(
        protocolId
        || ""
      );

    if (id) {
      localStorage.setItem(
        PHASE_F24_ACTIVE_PROTOCOL_KEY,
        id
      );
    } else {
      localStorage.removeItem(
        PHASE_F24_ACTIVE_PROTOCOL_KEY
      );
    }
  }

  function phaseF24ProtocolById(
    protocolId
  ) {
    const id =
      String(
        protocolId
        || ""
      );

    if (!id) return null;

    return (
      phaseF24ReadProtocols().find(
        (item) =>
          String(item.id || "")
          === id
      )
      || null
    );
  }

  function phaseF24ActiveProtocol() {
    return phaseF24ProtocolById(
      phaseF24ActiveProtocolId()
    );
  }

  function phaseF24StableValue(
    value
  ) {
    if (Array.isArray(value)) {
      return value.map(
        phaseF24StableValue
      );
    }

    if (
      value
      && typeof value === "object"
    ) {
      const output = {};

      for (
        const key
        of Object.keys(value).sort()
      ) {
        output[key] =
          phaseF24StableValue(
            value[key]
          );
      }

      return output;
    }

    return value;
  }

  function phaseF24StableStringify(
    value
  ) {
    return JSON.stringify(
      phaseF24StableValue(value)
    );
  }

  async function phaseF24HashPipeline(
    pipeline
  ) {
    const canonical =
      phaseF24StableStringify(
        pipeline
      );

    try {
      if (
        window.crypto?.subtle
        && typeof TextEncoder
          !== "undefined"
      ) {
        const bytes =
          new TextEncoder()
            .encode(canonical);

        const digest =
          await window.crypto.subtle.digest(
            "SHA-256",
            bytes
          );

        return Array.from(
          new Uint8Array(digest)
        )
          .map(
            (value) =>
              value
                .toString(16)
                .padStart(2, "0")
          )
          .join("");
      }
    } catch (_) {
      // Fall through to deterministic non-cryptographic fingerprint.
    }

    let hash =
      0x811c9dc5;

    for (
      let index = 0;
      index < canonical.length;
      index += 1
    ) {
      hash ^=
        canonical.charCodeAt(
          index
        );

      hash =
        Math.imul(
          hash,
          0x01000193
        );
    }

    return (
      "fnv1a-"
      + (
        hash >>> 0
      )
        .toString(16)
        .padStart(8, "0")
    );
  }

  function phaseF24CurrentRoiBorder() {
    const refs =
      phaseDRefs();

    const roi =
      phaseDTissueRoiFeature();

    const stored =
      roi?.properties
        ?.histoannotator
        ?.roi
        ?.externalBorderExclusion;

    const storedPercent =
      Number(
        stored?.percent
      );

    const controlPercent =
      Number(
        refs.externalBorderPercent
          ?.value
      );

    return {
      enabled:
        refs.externalBorderEnabled
          ? Boolean(
              refs.externalBorderEnabled
                .checked
            )
          : Boolean(
              stored?.enabled
            ),
      percent:
        Number.isFinite(
          controlPercent
        )
          ? Math.max(
              0,
              Math.min(
                50,
                controlPercent
              )
            )
          : (
              Number.isFinite(
                storedPercent
              )
                ? Math.max(
                    0,
                    Math.min(
                      50,
                      storedPercent
                    )
                  )
                : 0
            ),
    };
  }

  function phaseF24CaptureTissueRoiSettings() {
    const detection =
      phaseDDetectionSettings();

    const border =
      phaseF24CurrentRoiBorder();

    return {
      algorithm:
        "thumbnail-color-v1",
      analysisResolution:
        "reduced-resolution",
      sensitivity:
        Number(
          detection?.sensitivity
          ?? 50
        ),
      smoothing:
        Number(
          detection?.smoothing
          ?? 45
        ),
      minimumIslandPercent:
        Number(
          detection?.minIslandPct
          ?? 0.05
        ),
      fillHoles:
        Boolean(
          detection?.fillHoles
        ),
      detectorMaxSide:
        Number(
          detection?.maxSize
          ?? 2048
        ),
      externalBorder: {
        enabled:
          Boolean(
            border.enabled
          ),
        percent:
          Number(
            border.percent
            || 0
          ),
      },
    };
  }

  function phaseF24CaptureAnthracosisSettings() {
    const refs =
      phaseF1Refs();

    return {
      algorithm:
        "dark-pigment-hsv-ultradark-seed-growth-dilate-v6",
      analysisResolution:
        "native-level-0",
      sensitivity:
        Math.max(
          0,
          Math.min(
            100,
            Number(
              refs.sensitivity
                ?.value
              ?? 50
            )
          )
        ),
      boundaryExpansionPx:
        Math.max(
          0,
          Math.min(
            20,
            Number(
              refs.growth
                ?.value
              ?? 8
            )
          )
        ),
      finalMaskDilatePx:
        Math.max(
          0,
          Math.min(
            6,
            Number(
              refs.finalDilate
                ?.value
              ?? 0
            )
          )
        ),
      tileSize:
        1024,
      tileOverlap:
        64,
      minimumComponentPixels:
        1,
      microdepositVectorMaxPixels:
        4,
      maximumComponents:
        50000,
      analysisRegion:
        "Tissue ROI - External border - Artifact",
    };
  }

  function phaseF24CaptureHdabSettings() {
    const settings =
      phaseF22SettingsPayload();

    const mpp =
      Number(
        phaseF22Mpp()
      );

    const physical =
      Number.isFinite(mpp)
      && mpp > 0;

    return {
      algorithm:
        "quantitative-hdab-native-v2",
      analysisResolution:
        "native-level-0",
      analysisRegion:
        "Tissue ROI - External border - Artifact - Anthracosis",
      stainVectors: {
        hematoxylin: [
          0.65,
          0.70,
          0.29,
        ],
        dab: [
          0.27,
          0.57,
          0.78,
        ],
        handling:
          "unit-normalized-fixed-vectors",
      },
      opticalDensityTransform:
        "-log((rgb + 1) / 256)",
      thresholdMode:
        String(
          settings.thresholdMode
          || "auto_otsu"
        ),
      fixedDabOpticalDensity:
        Number(
          settings.thresholdOd
          ?? 0.30
        ),
      weightedObjectVarianceDelta:
        Number(
          settings.wovDelta
          ?? 0.25
        ),
      gaussianSmoothing: {
        enabled:
          Boolean(
            settings.smoothingEnabled
          ),
        sigma:
          Number(
            settings.smoothingSigma
            ?? 1.0
          ),
        unit:
          physical
            ? "um"
            : "px",
      },
      smallPositiveObjectFilter: {
        enabled:
          Boolean(
            settings.smallObjectFilterEnabled
          ),
        minimumArea:
          Number(
            settings.minimumObjectArea
            ?? 25
          ),
        unit:
          physical
            ? "um2"
            : "px2",
      },
      tileSize:
        Number(
          settings.tileSize
          || 1024
        ),
    };
  }

  function phaseF24CaptureContext() {
    const roi =
      phaseDTissueRoiFeature();

    const roiHisto =
      roi?.properties
        ?.histoannotator
        || {};

    const roiDetector =
      (
        roiHisto?.roi
          ?.detector
          ?.name
        || roiHisto?.roi
          ?.detector
        || roiHisto?.roi
          ?.method
        || roiHisto?.autoDetection
          ?.method
        || ""
      );

    const mpp =
      Number(
        phaseF22Mpp()
      );

    return {
      imageType:
        String(
          imageType
          || ""
        ),
      roiGeometryState:
        !roi
          ? "not-created"
          : (
              roiDetector
                ? "automatic-or-derived"
                : "manual-or-edited"
            ),
      roiDetectorObserved:
        String(
          roiDetector
          || ""
        ),
      calibrationMpp:
        Number.isFinite(mpp)
          && mpp > 0
          ? mpp
          : null,
      calibrationLabel:
        String(
          phaseEPhysicalPixelAreaMm2()
            ?.label
          || ""
        ),
    };
  }

  function phaseF24CapturePipeline() {
    return {
      tissueRoi:
        phaseF24CaptureTissueRoiSettings(),
      anthracosis:
        phaseF24CaptureAnthracosisSettings(),
      hdab:
        phaseF24CaptureHdabSettings(),
    };
  }

  function phaseF24SelectedProtocol() {
    return phaseF24ProtocolById(
      els.phaseF24ProtocolSelect
        ?.value
    );
  }

  function phaseF24StageKey(
    stage
  ) {
    const value =
      String(
        stage
        || ""
      )
        .trim()
        .toLowerCase();

    if (
      value === "tissue-roi"
      || value === "roi"
    ) {
      return "tissueRoi";
    }

    if (
      value === "anthracosis"
    ) {
      return "anthracosis";
    }

    if (
      value === "hdab"
      || value === "positive"
    ) {
      return "hdab";
    }

    return null;
  }

  function phaseF24CurrentStageSettings(
    stage
  ) {
    const key =
      phaseF24StageKey(stage);

    if (key === "tissueRoi") {
      return phaseF24CaptureTissueRoiSettings();
    }

    if (key === "anthracosis") {
      return phaseF24CaptureAnthracosisSettings();
    }

    if (key === "hdab") {
      return phaseF24CaptureHdabSettings();
    }

    return null;
  }

  function phaseF24ProtocolSnapshotForMetadata(
    stage
  ) {
    const protocol =
      phaseF24ActiveProtocol();

    const key =
      phaseF24StageKey(stage);

    if (
      !protocol
      || !key
      || !protocol.pipeline?.[key]
    ) {
      return null;
    }

    let current = null;

    try {
      current =
        phaseF24CurrentStageSettings(
          stage
        );
    } catch (_) {
      return null;
    }

    if (
      phaseF24StableStringify(
        current
      )
      !== phaseF24StableStringify(
        protocol.pipeline[key]
      )
    ) {
      return null;
    }

    return {
      protocolId:
        String(
          protocol.id
          || ""
        ),
      familyId:
        String(
          protocol.familyId
          || ""
        ),
      name:
        String(
          protocol.name
          || ""
        ),
      version:
        Number(
          protocol.version
          || 1
        ),
      hash:
        String(
          protocol.hash
          || ""
        ),
      schemaVersion:
        Number(
          protocol.schemaVersion
          || 1
        ),
      createdWithAppVersion:
        String(
          protocol.appVersion
          || ""
        ),
      stage:
        key,
      settings:
        deepClone(
          protocol.pipeline[key]
        ),
    };
  }

  function phaseF24AttachProtocolSnapshot(
    feature,
    stage
  ) {
    if (!feature) return;

    const snapshot =
      phaseF24ProtocolSnapshotForMetadata(
        stage
      );

    if (!snapshot) return;

    feature.properties =
      feature.properties
      || {};

    feature.properties.histoannotator =
      feature.properties.histoannotator
      || phaseCCreateMetadata();

    feature.properties
      .histoannotator
      .analysisProtocol =
        snapshot;
  }

  function phaseF24FormatThresholdMode(
    mode
  ) {
    const value =
      String(
        mode
        || ""
      );

    if (value === "auto_wov") {
      return "Weighted object variance";
    }

    if (value === "manual") {
      return "Fixed OD";
    }

    return "Otsu";
  }

  function phaseF24ProtocolSummaryHtml(
    protocol
  ) {
    const pipeline =
      protocol?.pipeline
      || phaseF24CapturePipeline();

    const roi =
      pipeline.tissueRoi
      || {};

    const anth =
      pipeline.anthracosis
      || {};

    const hdab =
      pipeline.hdab
      || {};

    const sourceLabel =
      protocol
        ? (
            `${escapeHtml(protocol.name || "")}`
            + ` · v${Number(protocol.version || 1)}`
          )
        : "Current controls";

    const hash =
      protocol?.hash
        ? String(protocol.hash)
        : "";

    return `
      <div class="stats-summary">
        <strong>${sourceLabel}</strong>
        ${
          hash
            ? `<span>Protocol hash: <code>${escapeHtml(hash)}</code></span>`
            : ""
        }
      </div>

      <table class="stats-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Algorithm</th>
            <th>Parameters</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Tissue ROI</strong></td>
            <td>${escapeHtml(roi.algorithm || "")}</td>
            <td>
              sensitivity ${formatStatNumber(Number(roi.sensitivity || 0), 2)}
              · smoothing ${formatStatNumber(Number(roi.smoothing || 0), 2)}
              · min island ${formatStatNumber(Number(roi.minimumIslandPercent || 0), 4)}%
              · fill holes ${roi.fillHoles ? "yes" : "no"}
              · border ${roi.externalBorder?.enabled
                ? `${formatStatNumber(Number(roi.externalBorder?.percent || 0), 2)}%`
                : "off"}
            </td>
          </tr>
          <tr>
            <td><strong>Anthracosis</strong></td>
            <td>${escapeHtml(anth.algorithm || "")}</td>
            <td>
              sensitivity ${formatStatNumber(Number(anth.sensitivity || 0), 2)}
              · expansion ${formatStatNumber(Number(anth.boundaryExpansionPx || 0), 0)} px
              · final dilate ${formatStatNumber(Number(anth.finalMaskDilatePx || 0), 0)} px
              · tile ${formatStatNumber(Number(anth.tileSize || 0), 0)}
              · overlap ${formatStatNumber(Number(anth.tileOverlap || 0), 0)}
            </td>
          </tr>
          <tr>
            <td><strong>H-DAB Positive</strong></td>
            <td>${escapeHtml(hdab.algorithm || "")}</td>
            <td>
              ${escapeHtml(phaseF24FormatThresholdMode(hdab.thresholdMode))}
              · OD ${formatStatNumber(Number(hdab.fixedDabOpticalDensity || 0), 3)}
              · WOV δ ${formatStatNumber(Number(hdab.weightedObjectVarianceDelta || 0), 2)}
              · Gaussian ${
                hdab.gaussianSmoothing?.enabled
                  ? `${formatStatNumber(Number(hdab.gaussianSmoothing?.sigma || 0), 2)} ${escapeHtml(hdab.gaussianSmoothing?.unit || "")}`
                  : "off"
              }
              · small-object filter ${
                hdab.smallPositiveObjectFilter?.enabled
                  ? `${formatStatNumber(Number(hdab.smallPositiveObjectFilter?.minimumArea || 0), 2)} ${escapeHtml(hdab.smallPositiveObjectFilter?.unit || "")}`
                  : "off"
              }
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function phaseF24RefreshStatus() {
    const active =
      phaseF24ActiveProtocol();

    if (!els.phaseF24ProtocolStatus) {
      return;
    }

    if (!active) {
      els.phaseF24ProtocolStatus.innerHTML =
        "<span>No active protocol.</span>";
      return;
    }

    els.phaseF24ProtocolStatus.innerHTML = `
      <span>
        Active:
        <strong>${escapeHtml(active.name || "")} v${Number(active.version || 1)}</strong>
      </span>
      <span>
        ${escapeHtml(active.hash || "")}
      </span>
    `;
  }

  function phaseF24RefreshProtocolSelect(
    preferredId = null
  ) {
    const select =
      els.phaseF24ProtocolSelect;

    if (!select) return;

    const protocols =
      phaseF24ReadProtocols()
        .slice()
        .sort(
          (left, right) => {
            const nameOrder =
              String(left.name || "")
                .localeCompare(
                  String(right.name || ""),
                  undefined,
                  {
                    sensitivity:
                      "base",
                  }
                );

            if (nameOrder !== 0) {
              return nameOrder;
            }

            return (
              Number(right.version || 0)
              - Number(left.version || 0)
            );
          }
        );

    const previous =
      String(
        preferredId
        || select.value
        || phaseF24ActiveProtocolId()
        || ""
      );

    select.innerHTML = "";

    if (!protocols.length) {
      const option =
        document.createElement(
          "option"
        );

      option.value = "";
      option.textContent =
        "No saved protocols";

      select.append(option);
    } else {
      const placeholder =
        document.createElement(
          "option"
        );

      placeholder.value = "";
      placeholder.textContent =
        "Select a protocol…";

      select.append(
        placeholder
      );

      for (
        const protocol
        of protocols
      ) {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          String(
            protocol.id
            || ""
          );

        option.textContent =
          `${protocol.name || "Unnamed"} v${Number(protocol.version || 1)}`;

        select.append(option);
      }
    }

    if (
      previous
      && protocols.some(
        (item) =>
          String(item.id || "")
          === previous
      )
    ) {
      select.value =
        previous;
    }

    phaseF24RefreshSelectedUi();
  }

  function phaseF24RefreshSelectedUi() {
    const selected =
      phaseF24SelectedProtocol();

    const hasSelected =
      Boolean(selected);

    if (
      selected
      && els.phaseF24ProtocolName
    ) {
      els.phaseF24ProtocolName.value =
        String(
          selected.name
          || ""
        );
    }

    for (
      const button
      of [
        els.phaseF24SaveVersionButton,
        els.phaseF24ApplyButton,
        els.phaseF241RunProtocolButton,
        els.phaseF25OpenBatchButton,
        els.phaseF24ExportButton,
        els.phaseF24DeleteButton,
      ]
    ) {
      if (button) {
        button.disabled =
          !hasSelected;
      }
    }

    if (els.phaseF24ProtocolSummary) {
      try {
        els.phaseF24ProtocolSummary.innerHTML =
          phaseF24ProtocolSummaryHtml(
            selected
          );
      } catch (error) {
        els.phaseF24ProtocolSummary.innerHTML =
          `<p class="modal-note error-text">${escapeHtml(error.message || String(error))}</p>`;
      }
    }

    phaseF24RefreshStatus();
  }

  function phaseF24OpenProtocols() {
    toggleFileMenu(false);

    const settingsPanel =
      document.getElementById(
        "phaseBSettingsPanel"
      );

    if (settingsPanel) {
      settingsPanel.hidden =
        true;
    }

    document
      .getElementById(
        "phaseBSettingsButton"
      )
      ?.setAttribute(
        "aria-expanded",
        "false"
      );

    phaseF24RefreshProtocolSelect();

    if (
      !phaseF24SelectedProtocol()
      && els.phaseF24ProtocolSummary
    ) {
      els.phaseF24ProtocolSummary.innerHTML =
        phaseF24ProtocolSummaryHtml(
          null
        );
    }

    if (els.phaseF24AnalysisProtocolsModal) {
      els.phaseF24AnalysisProtocolsModal.hidden =
        false;
    }
  }

  function phaseF24CloseProtocols() {
    if (phaseF241ProtocolRunBusy) {
      setStatus(
        "Wait for the protocol run to finish or request cancellation first",
        "error"
      );
      return;
    }

    if (els.phaseF24AnalysisProtocolsModal) {
      els.phaseF24AnalysisProtocolsModal.hidden =
        true;
    }
  }

  function phaseF24NewId(
    prefix
  ) {
    if (
      typeof uid
      === "function"
    ) {
      return `${prefix}-${uid()}`;
    }

    return (
      `${prefix}-`
      + Date.now()
      + "-"
      + Math.random()
        .toString(16)
        .slice(2)
    );
  }

  async function phaseF24SaveNewProtocol() {
    const name =
      String(
        els.phaseF24ProtocolName
          ?.value
        || ""
      ).trim();

    if (!name) {
      setStatus(
        "Enter a protocol name",
        "error"
      );
      return;
    }

    let pipeline;

    try {
      pipeline =
        phaseF24CapturePipeline();
    } catch (error) {
      setStatus(
        `Could not capture analysis settings: ${error.message}`,
        "error"
      );
      return;
    }

    const now =
      new Date().toISOString();

    const protocol = {
      schema:
        "histoannotator-analysis-protocol",
      schemaVersion:
        1,
      id:
        phaseF24NewId(
          "protocol"
        ),
      familyId:
        phaseF24NewId(
          "family"
        ),
      name,
      version:
        1,
      appVersion:
        VERSION,
      createdAt:
        now,
      updatedAt:
        now,
      hash:
        await phaseF24HashPipeline(
          pipeline
        ),
      pipeline,
      captureContext:
        phaseF24CaptureContext(),
    };

    const protocols =
      phaseF24ReadProtocols();

    protocols.push(
      protocol
    );

    phaseF24WriteProtocols(
      protocols
    );

    phaseF24SetActiveProtocolId(
      protocol.id
    );

    phaseF24RefreshProtocolSelect(
      protocol.id
    );

    setStatus(
      `Saved analysis protocol "${name}" v1`,
      "saved"
    );
  }

  async function phaseF24SaveNewVersion() {
    const selected =
      phaseF24SelectedProtocol();

    if (!selected) {
      setStatus(
        "Select a protocol before saving a new version",
        "error"
      );
      return;
    }

    let pipeline;

    try {
      pipeline =
        phaseF24CapturePipeline();
    } catch (error) {
      setStatus(
        `Could not capture analysis settings: ${error.message}`,
        "error"
      );
      return;
    }

    const protocols =
      phaseF24ReadProtocols();

    const familyId =
      String(
        selected.familyId
        || selected.id
        || phaseF24NewId(
          "family"
        )
      );

    const versions =
      protocols
        .filter(
          (item) =>
            String(
              item.familyId
              || item.id
              || ""
            )
            === familyId
        )
        .map(
          (item) =>
            Number(
              item.version
              || 1
            )
        );

    const nextVersion =
      Math.max(
        0,
        ...versions
      )
      + 1;

    const now =
      new Date().toISOString();

    const protocol = {
      schema:
        "histoannotator-analysis-protocol",
      schemaVersion:
        1,
      id:
        phaseF24NewId(
          "protocol"
        ),
      familyId,
      name:
        String(
          selected.name
          || "Analysis protocol"
        ),
      version:
        nextVersion,
      appVersion:
        VERSION,
      parentProtocolId:
        String(
          selected.id
          || ""
        ),
      createdAt:
        now,
      updatedAt:
        now,
      hash:
        await phaseF24HashPipeline(
          pipeline
        ),
      pipeline,
      captureContext:
        phaseF24CaptureContext(),
    };

    protocols.push(
      protocol
    );

    phaseF24WriteProtocols(
      protocols
    );

    phaseF24SetActiveProtocolId(
      protocol.id
    );

    phaseF24RefreshProtocolSelect(
      protocol.id
    );

    setStatus(
      `Saved "${protocol.name}" v${nextVersion}`,
      "saved"
    );
  }

  function phaseF24SetControlValue(
    element,
    value,
    eventType = "input"
  ) {
    if (!element) return;

    element.value =
      String(value);

    element.dispatchEvent(
      new Event(
        eventType,
        {
          bubbles: true,
        }
      )
    );
  }

  function phaseF24SetCheckbox(
    element,
    checked
  ) {
    if (!element) return;

    element.checked =
      Boolean(checked);

    element.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true,
        }
      )
    );
  }

  function phaseF24HdabUnitsCompatible(
    protocol
  ) {
    const hdab =
      protocol?.pipeline?.hdab
      || {};

    const currentMpp =
      Number(
        phaseF22Mpp()
      );

    const currentPhysical =
      Number.isFinite(currentMpp)
      && currentMpp > 0;

    const smoothing =
      hdab.gaussianSmoothing
      || {};

    const small =
      hdab.smallPositiveObjectFilter
      || {};

    if (
      smoothing.enabled
      && (
        (
          smoothing.unit === "um"
          && !currentPhysical
        )
        || (
          smoothing.unit === "px"
          && currentPhysical
        )
      )
    ) {
      return false;
    }

    if (
      small.enabled
      && (
        (
          small.unit === "um2"
          && !currentPhysical
        )
        || (
          small.unit === "px2"
          && currentPhysical
        )
      )
    ) {
      return false;
    }

    return true;
  }

  function phaseF24ApplyProtocol() {
    const protocol =
      phaseF24SelectedProtocol();

    if (!protocol) {
      setStatus(
        "Select a protocol first",
        "error"
      );
      return;
    }

    if (
      !phaseF24HdabUnitsCompatible(
        protocol
      )
    ) {
      setStatus(
        "Protocol not applied: H-DAB physical/pixel filter units are incompatible with the current image calibration",
        "error"
      );
      return;
    }

    const roi =
      protocol.pipeline
        ?.tissueRoi
      || {};

    const roiRefs =
      phaseDRefs();

    phaseF24SetControlValue(
      roiRefs.sensitivity,
      roi.sensitivity
      ?? 50
    );

    phaseF24SetControlValue(
      roiRefs.smoothing,
      roi.smoothing
      ?? 45
    );

    phaseF24SetControlValue(
      roiRefs.minIsland,
      roi.minimumIslandPercent
      ?? 0.05
    );

    phaseF24SetCheckbox(
      roiRefs.fillHoles,
      Boolean(
        roi.fillHoles
      )
    );

    phaseF24SetCheckbox(
      roiRefs.externalBorderEnabled,
      Boolean(
        roi.externalBorder
          ?.enabled
      )
    );

    phaseF24SetControlValue(
      roiRefs.externalBorderPercent,
      Number(
        roi.externalBorder
          ?.percent
        || 0
      )
    );

    const anth =
      protocol.pipeline
        ?.anthracosis
      || {};

    const anthRefs =
      phaseF1Refs();

    phaseF24SetControlValue(
      anthRefs.sensitivity,
      anth.sensitivity
      ?? 50
    );

    phaseF24SetControlValue(
      anthRefs.growth,
      anth.boundaryExpansionPx
      ?? 8
    );

    phaseF24SetControlValue(
      anthRefs.finalDilate,
      anth.finalMaskDilatePx
      ?? 0
    );

    const hdab =
      protocol.pipeline
        ?.hdab
      || {};

    if (els.hdabQuantThresholdMode) {
      els.hdabQuantThresholdMode.value =
        String(
          hdab.thresholdMode
          || "auto_otsu"
        );
    }

    phaseF24SetControlValue(
      els.hdabQuantThreshold,
      hdab.fixedDabOpticalDensity
      ?? 0.30
    );

    phaseF24SetControlValue(
      els.hdabQuantWovDelta,
      hdab.weightedObjectVarianceDelta
      ?? 0.25
    );

    phaseF24SetCheckbox(
      els.hdabQuantSmoothingEnabled,
      Boolean(
        hdab.gaussianSmoothing
          ?.enabled
      )
    );

    phaseF24SetControlValue(
      els.hdabQuantSmoothing,
      hdab.gaussianSmoothing
        ?.sigma
      ?? 1.0
    );

    phaseF24SetCheckbox(
      els.hdabQuantSmallFilterEnabled,
      Boolean(
        hdab.smallPositiveObjectFilter
          ?.enabled
      )
    );

    phaseF24SetControlValue(
      els.hdabQuantMinimumArea,
      hdab.smallPositiveObjectFilter
        ?.minimumArea
      ?? 25
    );

    phaseF20UpdateThresholdControls();

    if (
      typeof phaseF22ClearLivePreview
      === "function"
    ) {
      phaseF22ClearLivePreview(
        true
      );
    }

    phaseF24SetActiveProtocolId(
      protocol.id
    );

    phaseF24RefreshStatus();

    let calibrationWarning =
      "";

    const sourceMpp =
      Number(
        protocol.captureContext
          ?.calibrationMpp
      );

    const currentMpp =
      Number(
        phaseF22Mpp()
      );

    if (
      Number.isFinite(sourceMpp)
      && sourceMpp > 0
      && Number.isFinite(currentMpp)
      && currentMpp > 0
      && (
        Math.abs(
          sourceMpp - currentMpp
        )
        / sourceMpp
      ) > 0.05
    ) {
      calibrationWarning =
        " Source and current image calibration differ by more than 5%; Anthracosis pixel-radius parameters therefore represent a different physical distance.";
    }

    setStatus(
      `Loaded "${protocol.name}" v${Number(protocol.version || 1)}. Run/preview each stage explicitly before Accept.${calibrationWarning}`,
      "saved"
    );
  }

  // ========================================================================
  // Phase F2.4.1 — Automated reproducible protocol runner
  // ========================================================================

  let phaseF241ProtocolRunBusy =
    false;

  let phaseF241CancelRequested =
    false;

  function phaseF241Sleep(
    milliseconds
  ) {
    return new Promise(
      (resolve) =>
        window.setTimeout(
          resolve,
          milliseconds
        )
    );
  }

  function phaseF241SetRunMessage(
    message,
    kind = "local"
  ) {
    if (els.phaseF241ProtocolRunStatus) {
      els.phaseF241ProtocolRunStatus.hidden =
        false;
    }

    if (els.phaseF241ProtocolRunMessage) {
      els.phaseF241ProtocolRunMessage.textContent =
        String(
          message
          || ""
        );
    }

    setStatus(
      String(
        message
        || ""
      ),
      kind
    );
  }

  function phaseF241SetBusy(
    busy
  ) {
    phaseF241ProtocolRunBusy =
      Boolean(busy);

    const selected =
      phaseF24SelectedProtocol();

    if (els.phaseF241RunProtocolButton) {
      els.phaseF241RunProtocolButton.disabled =
        Boolean(busy)
        || !selected;

      els.phaseF241RunProtocolButton.textContent =
        busy
          ? "Running protocol…"
          : "Run protocol";
    }

    if (els.phaseF241CancelRunButton) {
      els.phaseF241CancelRunButton.disabled =
        !busy;
    }

    if (els.phaseF24ApplyButton) {
      els.phaseF24ApplyButton.disabled =
        Boolean(busy)
        || !selected;
    }

    if (els.phaseF24SaveVersionButton) {
      els.phaseF24SaveVersionButton.disabled =
        Boolean(busy)
        || !selected;
    }

    if (els.phaseF24DeleteButton) {
      els.phaseF24DeleteButton.disabled =
        Boolean(busy)
        || !selected;
    }

    if (els.phaseF24SaveNewButton) {
      els.phaseF24SaveNewButton.disabled =
        Boolean(busy);
    }

    if (els.phaseF24ImportButton) {
      els.phaseF24ImportButton.disabled =
        Boolean(busy);
    }
  }

  function phaseF241ThrowIfCancelled() {
    if (
      phaseF241CancelRequested
    ) {
      throw new Error(
        "Protocol run cancelled"
      );
    }
  }

  function phaseF241VisibleEnabledButton(
    element
  ) {
    if (
      !element
      || typeof element.click
        !== "function"
      || element.disabled
    ) {
      return false;
    }

    const style =
      window.getComputedStyle(
        element
      );

    return (
      style.display !== "none"
      && style.visibility !== "hidden"
    );
  }

  function phaseF241FindRoiAcceptButton() {
    let refs = {};

    try {
      refs =
        phaseDRefs()
        || {};
    } catch (_) {
      refs = {};
    }

    const candidates =
      Object.entries(refs)
        .filter(
          ([key, element]) => {
            if (
              !phaseF241VisibleEnabledButton(
                element
              )
            ) {
              return false;
            }

            const text =
              (
                String(key || "")
                + " "
                + String(
                    element?.id
                    || ""
                  )
                + " "
                + String(
                    element?.textContent
                    || ""
                  )
              )
                .toLowerCase();

            return (
              text.includes(
                "accept"
              )
              || text.includes(
                "confirm"
              )
            );
          }
        )
        .map(
          ([, element]) =>
            element
        );

    return (
      candidates[0]
      || null
    );
  }

  async function phaseF241FinalizeTissueRoi() {
    let roi =
      phaseDTissueRoiFeature();

    const acceptButton =
      phaseF241FindRoiAcceptButton();

    if (acceptButton) {
      acceptButton.click();

      await phaseF241Sleep(
        80
      );

      roi =
        phaseDTissueRoiFeature()
        || roi;
    }

    if (!roi) {
      throw new Error(
        "Tissue ROI detection did not produce an ROI"
      );
    }

    const refs =
      phaseDRefs();

    phaseDSetBorderConfig(
      roi,
      Boolean(
        refs.externalBorderEnabled
          ?.checked
      ),
      Number(
        refs.externalBorderPercent
          ?.value
        || 0
      ),
      true
    );

    phaseF24AttachProtocolSnapshot(
      roi,
      "tissue-roi"
    );

    markChanged();
    phaseDUpdateRoiUi();
    updateControls();
    drawAnnotations();

    return roi;
  }

  async function phaseF241RunTissueRoiStage() {
    phaseF241ThrowIfCancelled();

    phaseF241SetRunMessage(
      "Protocol 1/3 · Detecting Tissue ROI…",
      "local"
    );

    await phaseDDetectTissue();

    phaseF241ThrowIfCancelled();

    await phaseF241FinalizeTissueRoi();

    phaseF241SetRunMessage(
      "Protocol 1/3 · Tissue ROI accepted with protocol border settings.",
      "saved"
    );

    await phaseF241Sleep(
      50
    );
  }

  async function phaseF241RunAnthracosisStage() {
    phaseF241ThrowIfCancelled();

    phaseF241SetRunMessage(
      "Protocol 2/3 · Detecting Anthracosis at native resolution…",
      "local"
    );

    if (
      typeof phaseF1ClearPreview
      === "function"
    ) {
      phaseF1ClearPreview(
        true
      );
    }

    await phaseF1Detect();

    phaseF241ThrowIfCancelled();

    if (!phaseF1PreviewPayload) {
      throw new Error(
        "Anthracosis detection did not return a preview payload"
      );
    }

    phaseF1Accept();

    phaseF241SetRunMessage(
      "Protocol 2/3 · Anthracosis accepted.",
      "saved"
    );

    await phaseF241Sleep(
      50
    );
  }

  async function phaseF241RunHdabStage() {
    phaseF241ThrowIfCancelled();

    phaseF241SetRunMessage(
      "Protocol 3/3 · Running whole-slide H-DAB Positive analysis…",
      "local"
    );

    if (
      typeof phaseF21ClearPreview
      === "function"
    ) {
      phaseF21ClearPreview(
        true
      );
    }

    await phaseF21RunHdabPreview();

    phaseF241ThrowIfCancelled();

    if (!phaseF21PreviewPayload) {
      throw new Error(
        "H-DAB analysis did not return a Positive preview payload"
      );
    }

    await phaseF21AcceptPreview();

    phaseF241SetRunMessage(
      "Protocol 3/3 · H-DAB Positive accepted.",
      "saved"
    );

    await phaseF241Sleep(
      50
    );
  }

  function phaseF241ProtocolCanRun(
    protocol
  ) {
    if (!protocol) {
      setStatus(
        "Select a protocol first",
        "error"
      );
      return false;
    }

    if (
      !currentImage
      || !currentInfo
    ) {
      setStatus(
        "Open an image before running a protocol",
        "error"
      );
      return false;
    }

    if (
      currentImage.localNative
    ) {
      setStatus(
        "Full protocol automation currently requires a server-backed image",
        "error"
      );
      return false;
    }

    if (
      imageType !== "hdab"
    ) {
      setStatus(
        "Full ROI → Anthracosis → H-DAB protocol automation requires image type H-DAB",
        "error"
      );
      return false;
    }

    if (
      !phaseF24HdabUnitsCompatible(
        protocol
      )
    ) {
      setStatus(
        "Protocol not run: H-DAB physical/pixel filter units are incompatible with the current image calibration",
        "error"
      );
      return false;
    }

    return true;
  }

  async function phaseF241RunProtocol() {
    if (
      phaseF241ProtocolRunBusy
    ) {
      return;
    }

    const protocol =
      phaseF24SelectedProtocol();

    if (
      !phaseF241ProtocolCanRun(
        protocol
      )
    ) {
      return;
    }

    const label =
      `${protocol.name || "Analysis protocol"} v${Number(protocol.version || 1)}`;

    const confirmed =
      window.confirm(
        `Run "${label}" now?\n\n`
        + "This will regenerate the Tissue ROI, then run Anthracosis, "
        + "then run whole-slide H-DAB Positive using the saved parameters.\n\n"
        + "Existing Artifact geometry is preserved. Previous automatic "
        + "Anthracosis and automatic H-DAB Positive are replaced. "
        + "Manual Positive annotations are preserved."
      );

    if (!confirmed) {
      return;
    }

    const startImageId =
      String(
        currentImage.id
      );

    const startAnnotationFile =
      String(
        currentAnnotationFile
      );

    phaseF241CancelRequested =
      false;

    phaseF241SetBusy(
      true
    );

    try {
      phaseF241SetRunMessage(
        `Loading ${label}…`,
        "local"
      );

      phaseF24ApplyProtocol();

      phaseF24SetActiveProtocolId(
        protocol.id
      );

      phaseF241ThrowIfCancelled();

      if (
        !currentImage
        || String(currentImage.id)
          !== startImageId
        || String(currentAnnotationFile)
          !== startAnnotationFile
      ) {
        throw new Error(
          "Active image or annotation file changed before protocol execution"
        );
      }

      await phaseF241RunTissueRoiStage();

      if (
        !currentImage
        || String(currentImage.id)
          !== startImageId
        || String(currentAnnotationFile)
          !== startAnnotationFile
      ) {
        throw new Error(
          "Active image or annotation file changed during protocol execution"
        );
      }

      await phaseF241RunAnthracosisStage();

      if (
        !currentImage
        || String(currentImage.id)
          !== startImageId
        || String(currentAnnotationFile)
          !== startAnnotationFile
      ) {
        throw new Error(
          "Active image or annotation file changed during protocol execution"
        );
      }

      await phaseF241RunHdabStage();

      phaseF241ThrowIfCancelled();

      phaseF241SetRunMessage(
        `${label} complete · Tissue ROI → Anthracosis → H-DAB Positive.`,
        "saved"
      );

      phaseF24RefreshStatus();
      phaseF24RefreshSelectedUi();
    } catch (error) {
      const cancelled =
        phaseF241CancelRequested
        || String(
          error?.message
          || ""
        )
          .toLowerCase()
          .includes(
            "cancelled"
          );

      phaseF241SetRunMessage(
        cancelled
          ? (
              `${label} stopped. Completed stages remain applied; later stages were not run.`
            )
          : (
              `${label} stopped: ${error.message || String(error)}`
            ),
        cancelled
          ? "local"
          : "error"
      );
    } finally {
      phaseF241CancelRequested =
        false;

      phaseF241SetBusy(
        false
      );
    }
  }

  function phaseF241CancelProtocolRun() {
    if (
      !phaseF241ProtocolRunBusy
    ) {
      return;
    }

    phaseF241CancelRequested =
      true;

    phaseF241SetRunMessage(
      "Cancellation requested · the current detector will finish, then the protocol will stop.",
      "local"
    );
  }

  // ========================================================================
  // Phase F2.5 — Batch Analysis
  // ========================================================================

  let phaseF25BatchBusy =
    false;

  let phaseF25CancelAfterCurrent =
    false;

  let phaseF25BatchResults =
    [];

  let phaseF25BatchProtocol =
    null;

  // Phase F2.5.2 — configuration captured from the image that was open when
