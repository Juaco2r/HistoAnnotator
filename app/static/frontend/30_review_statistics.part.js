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

  // =========================================================
  // Phase F2.1 — H-DAB Positive preview + Accept
