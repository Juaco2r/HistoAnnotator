  function phaseF1Initialize() {
    const refs = phaseF1Refs();

    refs.menuButton
      ?.addEventListener(
        "click",
        phaseF1Open
      );

    refs.close
      ?.addEventListener(
        "click",
        phaseF1Close
      );

    refs.detect
      ?.addEventListener(
        "click",
        phaseF1Detect
      );

    refs.changeParameters
      ?.addEventListener(
        "click",
        phaseF1ChangeParameters
      );

    refs.previewAccept
      ?.addEventListener(
        "click",
        phaseF1Accept
      );

    refs.previewCancel
      ?.addEventListener(
        "click",
        phaseF1CancelPreview
      );

    refs.sensitivity
      ?.addEventListener(
        "input",
        () => {
          if (refs.sensitivityValue) {
            refs.sensitivityValue.textContent =
              refs.sensitivity.value;
          }

          if (
            phaseF1PreviewPayload
            && refs.summary
          ) {
            refs.summary.textContent =
              "Parameters changed. Press Update preview to recalculate; the previous preview remains unchanged until then.";
          }
        }
      );

    refs.growth
      ?.addEventListener(
        "input",
        () => {
          if (refs.growthValue) {
            refs.growthValue.textContent =
              refs.growth.value;
          }

          if (
            phaseF1PreviewPayload
            && refs.summary
          ) {
            refs.summary.textContent =
              "Parameters changed. Press Update preview to recalculate; the previous preview remains unchanged until then.";
          }
        }
      );

    refs.finalDilate
      ?.addEventListener(
        "input",
        () => {
          if (refs.finalDilateValue) {
            refs.finalDilateValue.textContent =
              refs.finalDilate.value;
          }

          if (
            phaseF1PreviewPayload
            && refs.summary
          ) {
            refs.summary.textContent =
              "Parameters changed. Press Update preview to recalculate; the previous preview remains unchanged until then.";
          }
        }
      );

    refs.overlay
      ?.addEventListener(
        "click",
        (event) => {
          if (event.target === refs.overlay) {
            phaseF1Close();
          }
        }
      );
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
    phaseF1Initialize();
    phaseGInitialize();
    phaseG2Initialize();
    phaseIL1Initialize();
    phaseIL2Initialize();
    phaseIL11Initialize();
    phaseIL12Initialize();
    phaseRInitialize();
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

    // Phase IL9.1a - bootstrap isolation
    // Core image/class loading must complete before optional
    // Interactive Learning evaluation initialization.
    try {
      phaseIL7Initialize();
    } catch (error) {
      console.error(
        "Interactive Learning evaluation initialization failed",
        error
      );

      setStatus(
        "Images loaded · Learning evaluation initialization needs attention",
        "local"
      );
    }
  }

  start().catch((error) => setStatus(`Startup error: ${error.message}`, "error"));
})();
