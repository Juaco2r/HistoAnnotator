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
    els.positiveByClassExportCsvButton?.addEventListener(
      "click",
      phaseF23ExportPositiveByClassCsv
    );
    els.positiveByClassBackButton?.addEventListener(
      "click",
      phaseF23BackToAnnotationStatistics
    );
    els.positiveByClassCloseButton?.addEventListener(
      "click",
      phaseF23ClosePositiveByClass
    );
    els.positiveByClassStatsModal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target
          === els.positiveByClassStatsModal
        ) {
          phaseF23ClosePositiveByClass();
        }
      }
    );
    els.hdabQuantButton?.addEventListener(
      "click",
      phaseF20OpenHdabQuantification
    );

    els.phaseF24AnalysisProtocolsButton?.addEventListener(
      "click",
      phaseF24OpenProtocols
    );

    els.phaseF24ProtocolSelect?.addEventListener(
      "change",
      phaseF24RefreshSelectedUi
    );

    els.phaseF24SaveNewButton?.addEventListener(
      "click",
      () => {
        void phaseF24SaveNewProtocol();
      }
    );

    els.phaseF24SaveVersionButton?.addEventListener(
      "click",
      () => {
        void phaseF24SaveNewVersion();
      }
    );

    els.phaseF24ApplyButton?.addEventListener(
      "click",
      phaseF24ApplyProtocol
    );

    els.phaseF241RunProtocolButton?.addEventListener(
      "click",
      () => {
        void phaseF241RunProtocol();
      }
    );

    els.phaseF241CancelRunButton?.addEventListener(
      "click",
      phaseF241CancelProtocolRun
    );

    els.phaseF25OpenBatchButton?.addEventListener(
      "click",
      phaseF25OpenBatch
    );

    els.phaseF25SelectAllButton?.addEventListener(
      "click",
      () => {
        phaseF25SetAllImages(true);
      }
    );

    els.phaseF25SelectNoneButton?.addEventListener(
      "click",
      () => {
        phaseF25SetAllImages(false);
      }
    );

    els.phaseF25RunBatchButton?.addEventListener(
      "click",
      () => {
        void phaseF25RunBatch();
      }
    );

    els.phaseF25CancelBatchButton?.addEventListener(
      "click",
      phaseF25CancelBatch
    );

    els.phaseF25ExportBatchCsvButton?.addEventListener(
      "click",
      phaseF25ExportBatchCsv
    );

    els.phaseF25BackButton?.addEventListener(
      "click",
      phaseF25BackToProtocols
    );

    els.phaseF25CloseButton?.addEventListener(
      "click",
      phaseF25CloseBatch
    );

    els.phaseF25BatchModal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target
          === els.phaseF25BatchModal
        ) {
          phaseF25CloseBatch();
        }
      }
    );

    els.phaseF24ExportButton?.addEventListener(
      "click",
      phaseF24ExportSelectedProtocol
    );

    els.phaseF24ImportButton?.addEventListener(
      "click",
      () => {
        els.phaseF24ImportInput
          ?.click();
      }
    );

    els.phaseF24ImportInput?.addEventListener(
      "change",
      () => {
        void phaseF24ImportProtocolFile(
          els.phaseF24ImportInput
            ?.files
            ?.[0]
        );
      }
    );

    els.phaseF24DeleteButton?.addEventListener(
      "click",
      phaseF24DeleteSelectedProtocol
    );

    els.phaseF24CloseButton?.addEventListener(
      "click",
      phaseF24CloseProtocols
    );

    els.phaseF24AnalysisProtocolsModal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target
          === els.phaseF24AnalysisProtocolsModal
        ) {
          phaseF24CloseProtocols();
        }
      }
    );

    // F2.0.1 - refresh H-DAB availability when Settings opens.
    // Image type may have changed in the File menu since the previous
    // generic control-state refresh.
    document
      .getElementById("phaseBSettingsButton")
      ?.addEventListener(
        "click",
        () => {
          if (els.hdabQuantButton) {
            els.hdabQuantButton.disabled =
              !currentImage
              || !currentInfo
              || imageType !== "hdab"
              || Boolean(currentImage?.localNative);
          }
        }
      );

    els.hdabQuantRunButton?.addEventListener(
      "click",
      phaseF21RunHdabPreview
    );

    document
      .getElementById(
        "phaseF21HdabChangeParametersButton"
      )
      ?.addEventListener(
        "click",
        phaseF21ChangeParameters
      );

    document
      .getElementById(
        "phaseF21HdabAcceptButton"
      )
      ?.addEventListener(
        "click",
        phaseF21AcceptPreview
      );

    document
      .getElementById(
        "phaseF21HdabCancelButton"
      )
      ?.addEventListener(
        "click",
        phaseF21CancelPreview
      );

    els.hdabQuantCloseButton?.addEventListener(
      "click",
      () => {
        if (els.hdabQuantModal) {
          els.hdabQuantModal.hidden = true;
        }

        if (phaseF21PreviewPayload) {
          phaseF21RenderPreview();
          phaseF21ShowPreviewAction();
        }
      }
    );

    els.hdabQuantModal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target
          === els.hdabQuantModal
        ) {
          els.hdabQuantModal.hidden = true;

          if (phaseF21PreviewPayload) {
            phaseF21RenderPreview();
            phaseF21ShowPreviewAction();
          }
        }
      }
    );

    els.hdabQuantThresholdMode?.addEventListener(
      "change",
      phaseF20UpdateThresholdControls
    );

    els.hdabQuantThreshold?.addEventListener(
      "input",
      phaseF20UpdateThresholdControls
    );

    els.hdabQuantWovDelta?.addEventListener(
      "input",
      phaseF20UpdateThresholdControls
    );

    els.hdabQuantSmoothingEnabled?.addEventListener(
      "change",
      () => {
        phaseF20UpdateThresholdControls();
        phaseF22ScheduleLivePreview();
      }
    );

    els.hdabQuantSmoothing?.addEventListener(
      "input",
      () => {
        phaseF20UpdateThresholdControls();
        phaseF22ScheduleLivePreview();
      }
    );

    els.hdabQuantSmallFilterEnabled?.addEventListener(
      "change",
      () => {
        phaseF20UpdateThresholdControls();
        phaseF22ScheduleLivePreview();
      }
    );

    els.hdabQuantMinimumArea?.addEventListener(
      "input",
      () => {
        phaseF20UpdateThresholdControls();
        phaseF22ScheduleLivePreview();
      }
    );

    els.hdabQuantUseCurrentViewButton?.addEventListener(
      "click",
      phaseF22CaptureCurrentView
    );

    els.hdabQuantClearLiveButton?.addEventListener(
      "click",
      () => {
        phaseF22ClearLivePreview(true);
      }
    );

    els.hdabQuantThreshold?.addEventListener(
      "input",
      phaseF22ScheduleLivePreview
    );

    els.hdabQuantThresholdMode?.addEventListener(
      "change",
      () => {
        phaseF20UpdateThresholdControls();

        if (
          String(
            els.hdabQuantThresholdMode
              ?.value
          )
          !== "manual"
        ) {
          phaseF22ClearLivePreview(true);
        }
      }
    );

    document
      .getElementById(
        "phaseF22LiveDockThreshold"
      )
      ?.addEventListener(
        "input",
        (event) => {
          const value =
            Number(
              event.target?.value
              || 0.30
            );

          if (els.hdabQuantThreshold) {
            els.hdabQuantThreshold.value =
              String(value);
          }

          phaseF20UpdateThresholdControls();
          phaseF22SyncDockThreshold();
          phaseF22ScheduleLivePreview();
        }
      );

    document
      .getElementById(
        "phaseF22LiveDockRefreshButton"
      )
      ?.addEventListener(
        "click",
        phaseF22CaptureCurrentView
      );

    document
      .getElementById(
        "phaseF22LiveDockApplyButton"
      )
      ?.addEventListener(
        "click",
        phaseF22ApplyLiveSettingsWholeSlide
      );

    document
      .getElementById(
        "phaseF22LiveDockParametersButton"
      )
      ?.addEventListener(
        "click",
        phaseF22OpenParametersFromDock
      );

    document
      .getElementById(
        "phaseF22LiveDockClearButton"
      )
      ?.addEventListener(
        "click",
        () => {
          phaseF22ClearLivePreview(true);
          phaseF22HideLiveDock();

          if (els.hdabQuantModal) {
            els.hdabQuantModal.hidden =
              false;
          }
        }
      );

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


  // ========================================================================
  // Phase F2.2 — advanced H-DAB + live preview + F1.12 native Anthracosis transport
  // ========================================================================

  let phaseF1Busy = false;
  let phaseF1PreviewPayload = null;
  let phaseF1PreviewFeatures = [];
  let phaseF1PreviewImageId = null;
  let phaseF1PreviewAnnotationFile = null;
  window.__phaseF1PreviewFeatures = [];

