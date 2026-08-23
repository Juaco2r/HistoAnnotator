  // Batch analysis was launched.
  let phaseF252BaseImageConfiguration =
    null;

  function phaseF252PositiveNumber(
    value
  ) {
    const number =
      Number(
        value
      );

    return (
      Number.isFinite(number)
      && number > 0
    )
      ? number
      : null;
  }

  // Phase F2.5.4 — Batch uses the same effective calibration as
  // the viewer and statistics. Manual calibration lives in localStorage,
  // so reading currentInfo alone is insufficient.
  function phaseF254CurrentEffectiveCalibrationFields() {
    const manual =
      typeof readManualCalibration === "function"
        ? readManualCalibration()
        : null;

    const manualMpp =
      phaseF252PositiveNumber(
        manual?.mpp
      );

    const manualObjective =
      phaseF252PositiveNumber(
        manual?.objective
      );

    const metadataMppX =
      phaseF252PositiveNumber(
        currentInfo?.mppX
      );

    const metadataMppY =
      phaseF252PositiveNumber(
        currentInfo?.mppY
      );

    const metadataObjective =
      phaseF252PositiveNumber(
        currentInfo?.objectivePower
      );

    let mppX =
      metadataMppX;

    let mppY =
      metadataMppY;

    if (manualMpp) {
      mppX =
        manualMpp;

      mppY =
        manualMpp;
    } else if (
      mppX
      && !mppY
    ) {
      mppY =
        mppX;
    } else if (
      mppY
      && !mppX
    ) {
      mppX =
        mppY;
    }

    const objectivePower =
      manualObjective
      || metadataObjective
      || null;

    const hasMpp =
      Boolean(
        mppX
        && mppY
      );

    const hasObjective =
      Boolean(
        objectivePower
      );

    const manualMppActive =
      Boolean(
        manualMpp
      );

    const manualObjectiveActive =
      Boolean(
        manualObjective
      );

    const metadataSource =
      String(
        currentInfo?.calibrationSource
        || ""
      );

    const mppSource =
      manualMppActive
        ? "Manual override"
        : (
            hasMpp
              ? (
                  metadataSource
                  || "Image metadata"
                )
              : ""
          );

    const objectiveSource =
      manualObjectiveActive
        ? "Manual override"
        : (
            metadataObjective
              ? (
                  metadataSource
                  || "Image metadata"
                )
              : ""
          );

    const sourceParts =
      Array.from(
        new Set(
          [
            mppSource,
            objectiveSource,
          ].filter(Boolean)
        )
      );

    return {
      mppX,
      mppY,
      objectivePower,
      hasMpp,
      hasObjective,
      hasAnyCalibrationValue:
        Boolean(
          hasMpp
          || hasObjective
        ),
      calibrationAvailable:
        hasMpp,
      manualActive:
        Boolean(
          manualMppActive
          || manualObjectiveActive
        ),
      manualMppActive,
      manualObjectiveActive,
      calibrationSource:
        sourceParts.join("; "),
      mppSource,
      objectiveSource,
    };
  }

  function phaseF252CaptureBaseImageConfiguration() {
    if (
      !currentImage
      || !currentInfo
    ) {
      return null;
    }

    const effective =
      phaseF254CurrentEffectiveCalibrationFields();

    return {
      imageId:
        String(
          currentImage.id
          || ""
        ),
      imageName:
        String(
          currentImage.relativePath
          || currentImage.name
          || currentImage.id
          || ""
        ),
      imageType:
        String(
          imageType
          || ""
        ).toLowerCase(),
      mppX:
        effective.mppX,
      mppY:
        effective.mppY,
      objectivePower:
        effective.objectivePower,
      calibrationAvailable:
        effective.calibrationAvailable,
      hasMpp:
        effective.hasMpp,
      hasObjective:
        effective.hasObjective,
      hasAnyCalibrationValue:
        effective.hasAnyCalibrationValue,
      manualActive:
        effective.manualActive,
      manualMppActive:
        effective.manualMppActive,
      manualObjectiveActive:
        effective.manualObjectiveActive,
      calibrationSource:
        effective.calibrationSource,
      mppSource:
        effective.mppSource,
      objectiveSource:
        effective.objectiveSource,
      calibrationNativeAvailable:
        currentInfo.calibrationNativeAvailable
        !== undefined
          ? Boolean(
              currentInfo.calibrationNativeAvailable
            )
          : Boolean(
              currentInfo.calibrationAvailable
            ),
    };
  }

  function phaseF252RenderBaseConfiguration() {
    if (!els.phaseF252BaseConfigSummary) {
      return;
    }

    const base =
      phaseF252BaseImageConfiguration;

    if (!base) {
      els.phaseF252BaseConfigSummary.innerHTML = `
        <strong>Base image configuration</strong>
        <span>No image was open when Batch analysis started.</span>
      `;

      if (els.phaseF252UseBaseImageType) {
        els.phaseF252UseBaseImageType.checked =
          false;

        els.phaseF252UseBaseImageType.disabled =
          true;
      }

      if (els.phaseF252UseBaseCalibration) {
        els.phaseF252UseBaseCalibration.checked =
          false;

        els.phaseF252UseBaseCalibration.disabled =
          true;
      }

      return;
    }

    const mppText =
      base.hasMpp
        ? (
            `${formatStatNumber(base.mppX, 4)} × `
            + `${formatStatNumber(base.mppY, 4)} µm/px`
          )
        : "MPP missing";

    const objectiveText =
      base.hasObjective
        ? `${formatStatNumber(base.objectivePower, 2)}x`
        : "objective missing";

    const sourceText =
      base.calibrationSource
        ? ` · ${base.calibrationSource}`
        : "";

    els.phaseF252BaseConfigSummary.innerHTML = `
      <strong>Base image configuration</strong>
      <span>${escapeHtml(base.imageName)}</span>
      <span>
        Type:
        <strong>${escapeHtml(String(base.imageType || "unknown").toUpperCase())}</strong>
        · ${escapeHtml(mppText)}
        · ${escapeHtml(objectiveText)}
        ${escapeHtml(sourceText)}
      </span>
    `;

    if (els.phaseF252UseBaseImageType) {
      els.phaseF252UseBaseImageType.disabled =
        !base.imageType;

      els.phaseF252UseBaseImageType.checked =
        Boolean(
          base.imageType
        );
    }

    if (els.phaseF252UseBaseCalibration) {
      els.phaseF252UseBaseCalibration.disabled =
        !base.hasAnyCalibrationValue;

      els.phaseF252UseBaseCalibration.checked =
        Boolean(
          base.hasAnyCalibrationValue
        );
    }
  }

  async function phaseF252PersistImageType(
    nextType
  ) {
    const normalized =
      String(
        nextType
        || ""
      ).toLowerCase();

    if (
      !["he", "hdab", "fluorescence", "rgb"]
        .includes(
          normalized
        )
    ) {
      throw new Error(
        `Unsupported base image type "${nextType}"`
      );
    }

    const response =
      await apiFetch(
        `${API}/images/${currentImage.id}/display-config`,
        {
          method:
            "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              imageType:
                normalized,
            }),
          timeoutMs:
            30000,
        }
      );

    if (!response.ok) {
      let detail =
        `HTTP ${response.status}`;

      try {
        const payload =
          await response.json();

        detail =
          payload.detail
          || detail;
      } catch (_) {
        // Keep status text.
      }

      throw new Error(
        `Could not persist image type: ${detail}`
      );
    }

    // Phase F2.5.4.3: verify the persisted server value before
    // starting the H-DAB protocol.
    const verifyResponse =
      await apiFetch(
        `${API}/images/${currentImage.id}/display-config`,
        {
          timeoutMs:
            30000,
        }
      );

    let verifyPayload =
      null;

    try {
      verifyPayload =
        await verifyResponse.json();
    } catch (_) {
      verifyPayload =
        null;
    }

    const persistedType =
      String(
        verifyPayload?.imageType
        || ""
      ).trim().toLowerCase();

    if (
      !verifyResponse.ok
      || persistedType !== normalized
    ) {
      throw new Error(
        (
          `Image type persistence verification failed: `
          + `requested "${normalized}", server returned `
          + `"${persistedType || "unknown"}"`
        )
      );
    }

    imageType =
      normalized;

    if (els.imageTypeSelect) {
      els.imageTypeSelect.value =
        normalized;
    }

    renderChannelControls();
    saveDisplaySettings();

    const cached =
      await getMeta(
        `image:${currentImage.id}`
      );

    if (
      cached
      && typeof cached === "object"
    ) {
      cached.imageType =
        normalized;

      await putMeta(
        `image:${currentImage.id}`,
        cached
      );
    }
  }

  async function phaseF252PersistCalibrationFromBase(
    base,
    {
      inheritMpp = false,
      inheritObjective = false,
    } = {}
  ) {
    const requestPayload = {
      sourceImageId:
        base.imageId,
      sourceImage:
        base.imageName,
    };

    if (inheritMpp) {
      requestPayload.mppX =
        base.mppX;
      requestPayload.mppY =
        base.mppY;
    }

    if (inheritObjective) {
      requestPayload.objectivePower =
        base.objectivePower;
    }

    const response =
      await apiFetch(
        `${API}/images/${currentImage.id}/calibration-override`,
        {
          method:
            "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify(
              requestPayload
            ),
          timeoutMs:
            30000,
        }
      );

    let payload = {};

    try {
      payload =
        await response.json();
    } catch (_) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(
        `Could not inherit base calibration: ${payload.detail || `HTTP ${response.status}`}`
      );
    }

    if (payload.applied === false) {
      return {
        applied:
          false,
        mppApplied:
          false,
        objectiveApplied:
          false,
      };
    }

    const effectiveMppX =
      phaseF252PositiveNumber(
        payload.mppX
      )
      ?? phaseF252PositiveNumber(
        currentInfo?.mppX
      );

    const effectiveMppY =
      phaseF252PositiveNumber(
        payload.mppY
      )
      ?? phaseF252PositiveNumber(
        currentInfo?.mppY
      );

    const effectiveObjective =
      phaseF252PositiveNumber(
        payload.objectivePower
      )
      ?? phaseF252PositiveNumber(
        currentInfo?.objectivePower
      );

    currentInfo = {
      ...currentInfo,
      mppX:
        effectiveMppX,
      mppY:
        effectiveMppY,
      objectivePower:
        effectiveObjective,
      calibrationAvailable:
        Boolean(
          effectiveMppX
          && effectiveMppY
        ),
      calibrationNativeAvailable:
        payload.calibrationNativeAvailable
        ?? currentInfo.calibrationNativeAvailable
        ?? false,
      calibrationNativeObjectiveAvailable:
        payload.calibrationNativeObjectiveAvailable
        ?? currentInfo.calibrationNativeObjectiveAvailable
        ?? false,
      calibrationOverrideApplied:
        true,
      calibrationMppOverrideApplied:
        Boolean(
          payload.mppApplied
        ),
      calibrationObjectiveOverrideApplied:
        Boolean(
          payload.objectiveApplied
        ),
      calibrationOverrideSourceImageId:
        base.imageId,
      calibrationOverrideSourceImage:
        base.imageName,
      calibrationSource:
        String(
          payload.source
          || currentInfo.calibrationSource
          || `Batch base image: ${base.imageName}`
        ),
    };

    const cached =
      await getMeta(
        `image:${currentImage.id}`
      );

    if (
      cached
      && typeof cached === "object"
    ) {
      cached.info =
        deepClone(
          currentInfo
        );

      await putMeta(
        `image:${currentImage.id}`,
        cached
      );
    }

    if (
      typeof updateImageInfoDisplay
      === "function"
    ) {
      updateImageInfoDisplay();
    }

    return {
      applied:
        true,
      mppApplied:
        Boolean(
          payload.mppApplied
        ),
      objectiveApplied:
        Boolean(
          payload.objectiveApplied
        ),
    };
  }

  async function phaseF252ApplyBaseConfigurationToCurrentImage() {
    const base =
      phaseF252BaseImageConfiguration;

    const effectiveBefore =
      phaseF254CurrentEffectiveCalibrationFields();

    const before = {
      imageType:
        String(
          imageType
          || ""
        ).toLowerCase(),
      calibrationAvailable:
        effectiveBefore.calibrationAvailable,
      calibrationNativeAvailable:
        currentInfo?.calibrationNativeAvailable
        !== undefined
          ? Boolean(
              currentInfo.calibrationNativeAvailable
            )
          : Boolean(
              currentInfo?.calibrationAvailable
            ),
      mppX:
        effectiveBefore.mppX,
      mppY:
        effectiveBefore.mppY,
      objectivePower:
        effectiveBefore.objectivePower,
      calibrationSource:
        effectiveBefore.calibrationSource,
      mppSource:
        effectiveBefore.mppSource,
      objectiveSource:
        effectiveBefore.objectiveSource,
      manualMppActive:
        effectiveBefore.manualMppActive,
      manualObjectiveActive:
        effectiveBefore.manualObjectiveActive,
    };

    let imageTypeInherited =
      false;

    let calibrationInherited =
      false;

    const protocolRequiredImageType =
      "hdab";

    if (
      base
      && els.phaseF252UseBaseImageType
        ?.checked
      && before.imageType
        !== protocolRequiredImageType
    ) {
      await phaseF252PersistImageType(
        protocolRequiredImageType
      );

      imageTypeInherited =
        true;
    }

    if (
      els.phaseF252UseBaseImageType
        ?.checked
      && String(
        imageType
        || ""
      ).toLowerCase()
        !== protocolRequiredImageType
    ) {
      throw new Error(
        (
          `Batch H-DAB preflight failed: image type is `
          + `"${String(imageType || "unknown")}" after persistence; `
          + `expected "hdab"`
        )
      );
    }

    const shouldInheritMpp =
      Boolean(
        base
        && els.phaseF252UseBaseCalibration
          ?.checked
        && base.hasMpp
        && !effectiveBefore.hasMpp
      );

    const shouldInheritObjective =
      Boolean(
        base
        && els.phaseF252UseBaseCalibration
          ?.checked
        && base.hasObjective
        && !effectiveBefore.hasObjective
      );

    let mppInherited =
      false;

    let objectiveInherited =
      false;

    if (
      shouldInheritMpp
      || shouldInheritObjective
    ) {
      const inherited =
        await phaseF252PersistCalibrationFromBase(
          base,
          {
            inheritMpp:
              shouldInheritMpp,
            inheritObjective:
              shouldInheritObjective,
          }
        );

      mppInherited =
        Boolean(
          inherited?.mppApplied
        );

      objectiveInherited =
        Boolean(
          inherited?.objectiveApplied
        );

      calibrationInherited =
        Boolean(
          mppInherited
          || objectiveInherited
        );
    }

    const effectiveAfter =
      phaseF254CurrentEffectiveCalibrationFields();

    const after = {
      imageType:
        String(
          imageType
          || ""
        ).toLowerCase(),
      calibrationAvailable:
        effectiveAfter.calibrationAvailable,
      calibrationNativeAvailable:
        currentInfo?.calibrationNativeAvailable
        !== undefined
          ? Boolean(
              currentInfo.calibrationNativeAvailable
            )
          : Boolean(
              currentInfo?.calibrationAvailable
            ),
      mppX:
        effectiveAfter.mppX,
      mppY:
        effectiveAfter.mppY,
      objectivePower:
        effectiveAfter.objectivePower,
      calibrationSource:
        effectiveAfter.calibrationSource,
      mppSource:
        effectiveAfter.mppSource,
      objectiveSource:
        effectiveAfter.objectiveSource,
      manualMppActive:
        effectiveAfter.manualMppActive,
      manualObjectiveActive:
        effectiveAfter.manualObjectiveActive,
    };

    return {
      method:
        "batch-base-image-effective-calibration-v2",
      baseImageId:
        String(
          base?.imageId
          || ""
        ),
      baseImage:
        String(
          base?.imageName
          || ""
        ),
      baseImageType:
        String(
          base?.imageType
          || ""
        ),
      baseMppX:
        base?.mppX
        ?? null,
      baseMppY:
        base?.mppY
        ?? null,
      baseObjectivePower:
        base?.objectivePower
        ?? null,
      baseCalibrationSource:
        String(
          base?.calibrationSource
          || ""
        ),
      baseManualMpp:
        Boolean(
          base?.manualMppActive
        ),
      baseManualObjective:
        Boolean(
          base?.manualObjectiveActive
        ),
      imageTypeBefore:
        before.imageType,
      imageTypeUsed:
        after.imageType,
      // Legacy field retained for compatibility.
      // F2.5.4.3 applies the type required by the H-DAB protocol,
      // independently of the base image type.
      imageTypeInheritedFromBase:
        false,
      imageTypeAppliedForProtocol:
        imageTypeInherited,
      imageTypeRequiredByProtocol:
        protocolRequiredImageType,
      calibrationAvailableOriginal:
        before.calibrationAvailable,
      calibrationNativeAvailableOriginal:
        before.calibrationNativeAvailable,
      mppXOriginal:
        before.mppX,
      mppYOriginal:
        before.mppY,
      objectivePowerOriginal:
        before.objectivePower,
      calibrationSourceOriginal:
        before.calibrationSource,
      mppSourceOriginal:
        before.mppSource,
      objectiveSourceOriginal:
        before.objectiveSource,
      manualMppOriginal:
        before.manualMppActive,
      manualObjectiveOriginal:
        before.manualObjectiveActive,
      mppXUsed:
        after.mppX,
      mppYUsed:
        after.mppY,
      objectivePowerUsed:
        after.objectivePower,
      calibrationSourceUsed:
        after.calibrationSource,
      mppSourceUsed:
        after.mppSource,
      objectiveSourceUsed:
        after.objectiveSource,
      calibrationInheritedFromBase:
        calibrationInherited,
      mppInheritedFromBase:
        mppInherited,
      objectiveInheritedFromBase:
        objectiveInherited,
    };
  }

  function phaseF252AttachBatchConfiguration(
    configuration
  ) {
    if (
      !configuration
      || !featureCollection?.features
    ) {
      return;
    }

    let changed =
      false;

    for (
      const feature
      of featureCollection.features
    ) {
      const histo =
        feature?.properties
          ?.histoannotator;

      if (
        !histo
        || !histo.analysisProtocol
      ) {
        continue;
      }

      histo.batchConfiguration =
        deepClone(
          configuration
        );

      changed =
        true;
    }

    if (changed) {
      markChanged();
    }
  }

  function phaseF25SafeAnnotationName(
    value
  ) {
    const normalized =
      String(
        value
        || ""
      )
        .normalize(
          "NFKD"
        )
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .replace(
          /[^A-Za-z0-9 _.-]+/g,
          "_"
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim()
        .slice(
          0,
          80
        );

    return (
      normalized
      || "Batch"
    );
  }

  function phaseF25DefaultTargetName(
    protocol
  ) {
    const name =
      phaseF25SafeAnnotationName(
        protocol?.name
        || "Protocol"
      );

    const protocolVersion =
      Math.max(
        1,
        Number(
          protocol?.version
          || 1
        )
      );

    return phaseF25SafeAnnotationName(
      `Batch - ${name} v${protocolVersion}`
    );
  }

  function phaseF25ServerImages() {
    return (
      images
      || []
    ).filter(
      (image) =>
        image
        && image.id
        && !image.localNative
    );
  }

  function phaseF25SelectedImageIds() {
    return Array.from(
      els.phaseF25ImageList
        ?.querySelectorAll(
          'input[data-phase-f25-image-id]:checked'
        )
      || []
    ).map(
      (input) =>
        String(
          input.dataset.phaseF25ImageId
          || ""
        )
    ).filter(Boolean);
  }

  function phaseF25RenderImageList() {
    if (!els.phaseF25ImageList) {
      return;
    }

    const candidates =
      phaseF25ServerImages();

    if (!candidates.length) {
      els.phaseF25ImageList.innerHTML =
        '<p class="modal-note">No server-backed images available.</p>';
      return;
    }

    const currentId =
      String(
        currentImage?.id
        || ""
      );

    els.phaseF25ImageList.innerHTML =
      candidates
        .map(
          (image) => {
            const imageId =
              String(
                image.id
              );

            const label =
              String(
                image.relativePath
                || image.name
                || imageId
              );

            const checked =
              imageId === currentId
                ? " checked"
                : "";

            return `
              <label class="phase-d-roi-checkbox">
                <input
                  type="checkbox"
                  data-phase-f25-image-id="${escapeHtml(imageId)}"
                  ${checked}
                >
                <span>${escapeHtml(label)}</span>
              </label>
            `;
          }
        )
        .join("");
  }

  function phaseF25SetAllImages(
    checked
  ) {
    for (
      const input
      of els.phaseF25ImageList
        ?.querySelectorAll(
          'input[data-phase-f25-image-id]'
        )
      || []
    ) {
      input.checked =
        Boolean(
          checked
        );
    }
  }

  function phaseF25SetProgress(
    message
  ) {
    if (els.phaseF25BatchProgress) {
      els.phaseF25BatchProgress.hidden =
        false;
    }

    if (els.phaseF25BatchProgressMessage) {
      els.phaseF25BatchProgressMessage.textContent =
        String(
          message
          || ""
        );
    }
  }

  function phaseF25SetBusy(
    busy
  ) {
    phaseF25BatchBusy =
      Boolean(
        busy
      );

    if (els.phaseF25RunBatchButton) {
      els.phaseF25RunBatchButton.disabled =
        phaseF25BatchBusy;

      els.phaseF25RunBatchButton.textContent =
        phaseF25BatchBusy
          ? "Running batch…"
          : "Run batch";
    }

    if (els.phaseF25CancelBatchButton) {
      els.phaseF25CancelBatchButton.disabled =
        !phaseF25BatchBusy;
    }

    for (
      const element
      of [
        els.phaseF25SourceAnnotationFile,
        els.phaseF25TargetAnnotationFile,
        els.phaseF25SelectAllButton,
        els.phaseF25SelectNoneButton,
        els.phaseF25ContinueOnError,
        els.phaseF252UseBaseImageType,
        els.phaseF252UseBaseCalibration,
        els.phaseF25BackButton,
      ]
    ) {
      if (element) {
        element.disabled =
          phaseF25BatchBusy;
      }
    }

    for (
      const input
      of els.phaseF25ImageList
        ?.querySelectorAll(
          'input[data-phase-f25-image-id]'
        )
      || []
    ) {
      input.disabled =
        phaseF25BatchBusy;
    }
  }

  function phaseF25OpenBatch() {
    const protocol =
      phaseF24SelectedProtocol();

    if (!protocol) {
      setStatus(
        "Select an analysis protocol first",
        "error"
      );
      return;
    }

    phaseF25BatchProtocol =
      deepClone(
        protocol
      );

    phaseF252BaseImageConfiguration =
      phaseF252CaptureBaseImageConfiguration();

    phaseF252RenderBaseConfiguration();

    phaseF25BatchResults =
      [];

    phaseF25CancelAfterCurrent =
      false;

    if (els.phaseF25BatchProtocolSummary) {
      els.phaseF25BatchProtocolSummary.innerHTML = `
        <span>
          Protocol:
          <strong>${escapeHtml(protocol.name || "")} v${Number(protocol.version || 1)}</strong>
        </span>
        <span>
          ${escapeHtml(protocol.hash || "")}
        </span>
      `;
    }

    if (els.phaseF25SourceAnnotationFile) {
      els.phaseF25SourceAnnotationFile.value =
        "Default";
    }

    if (els.phaseF25TargetAnnotationFile) {
      els.phaseF25TargetAnnotationFile.value =
        phaseF25DefaultTargetName(
          protocol
        );
    }

    if (els.phaseF25ContinueOnError) {
      els.phaseF25ContinueOnError.checked =
        true;
    }

    if (els.phaseF25BatchProgress) {
      els.phaseF25BatchProgress.hidden =
        true;
    }

    if (els.phaseF25BatchResults) {
      els.phaseF25BatchResults.hidden =
        true;

      els.phaseF25BatchResults.innerHTML =
        "";
    }

    if (els.phaseF25ExportBatchCsvButton) {
      els.phaseF25ExportBatchCsvButton.disabled =
        true;
    }

    phaseF25RenderImageList();

    if (els.phaseF24AnalysisProtocolsModal) {
      els.phaseF24AnalysisProtocolsModal.hidden =
        true;
    }

    if (els.phaseF25BatchModal) {
      els.phaseF25BatchModal.hidden =
        false;
    }
  }

  function phaseF25BackToProtocols() {
    if (phaseF25BatchBusy) {
      setStatus(
        "Wait for the current batch image to finish",
        "error"
      );
      return;
    }

    if (els.phaseF25BatchModal) {
      els.phaseF25BatchModal.hidden =
        true;
    }

    if (els.phaseF24AnalysisProtocolsModal) {
      els.phaseF24AnalysisProtocolsModal.hidden =
        false;
    }
  }

  function phaseF25CloseBatch() {
    if (phaseF25BatchBusy) {
      setStatus(
        "Use Cancel after current image before closing the batch",
        "error"
      );
      return;
    }

    if (els.phaseF25BatchModal) {
      els.phaseF25BatchModal.hidden =
        true;
    }
  }

  async function phaseF25WaitForImageReady(
    imageId,
    timeoutMs = 60000
  ) {
    const expectedId =
      String(
        imageId
      );

    const started =
      Date.now();

    while (
      Date.now()
      - started
      < timeoutMs
    ) {
      if (
        currentImage
        && String(currentImage.id)
          === expectedId
        && currentInfo
      ) {
        const count =
          Number(
            viewer?.world
              ?.getItemCount
              ?.()
            || 0
          );

        if (count > 0) {
          return;
        }
      }

      await phaseF241Sleep(
        100
      );
    }

    throw new Error(
      "Timed out waiting for the image viewer to become ready"
    );
  }

  function phaseF25SourceCloneForBatch(
    sourceCollection
  ) {
    const source =
      normalizeFeatureCollectionClient(
        sourceCollection
      );

    const kept =
      [];

    let removedRoi =
      0;

    let removedAnthracosis =
      0;

    let removedAutoPositive =
      0;

    for (
      const feature
      of source.features || []
    ) {
      const props =
        feature?.properties
        || {};

      const histo =
        props.histoannotator
        || {};

      const classification =
        String(
          props.classification?.name
          || ""
        )
          .trim()
          .toLowerCase();

      const role =
        String(
          histo.role
          || props.role
          || ""
        )
          .trim()
          .toLowerCase();

      const autoDetection =
        histo.autoDetection
        || props.autoDetection
        || {};

      const autoType =
        String(
          autoDetection.type
          || ""
        )
          .trim()
          .toLowerCase();

      const autoMethod =
        String(
          autoDetection.method
          || ""
        )
          .trim()
          .toLowerCase();

      const isRoi =
        role === "roi"
        || role === "tissue-roi"
        || role === "tissue_roi"
        || Boolean(
          histo.roi
        );

      if (isRoi) {
        removedRoi += 1;
        continue;
      }

      if (
        classification
        === "anthracosis"
      ) {
        removedAnthracosis += 1;
        continue;
      }

      const isAutomaticHdabPositive =
        classification === "positive"
        && (
          autoType === "hdab-positive"
          || autoMethod.startsWith(
            "quantitative-hdab-native-v"
          )
        );

      if (
        isAutomaticHdabPositive
      ) {
        removedAutoPositive += 1;
        continue;
      }

      kept.push(
        deepClone(
          feature
        )
      );
    }

    return {
      collection: {
        type:
          "FeatureCollection",
        features:
          kept,
      },
      removed: {
        tissueRoi:
          removedRoi,
        anthracosis:
          removedAnthracosis,
        automaticPositive:
          removedAutoPositive,
      },
    };
  }

  async function phaseF25PrepareResultFile(
    sourceName,
    targetName
  ) {
    const actualSource =
      annotationFiles.find(
        (name) =>
          String(name)
            .toLowerCase()
          === String(sourceName)
            .toLowerCase()
      );

    if (!actualSource) {
      throw new Error(
        `Source annotation file "${sourceName}" does not exist for this image`
      );
    }

    await loadSelectedAnnotationFile(
      actualSource
    );

    const prepared =
      phaseF25SourceCloneForBatch(
        featureCollection
      );

    if (
      !annotationFiles.includes(
        targetName
      )
    ) {
      annotationFiles.push(
        targetName
      );
    }

    await putMeta(
      `files:${currentImage.id}`,
      annotationFiles
    );

    await loadSelectedAnnotationFile(
      targetName
    );

    featureCollection =
      normalizeFeatureCollectionClient(
        prepared.collection
      );

    featureCollection.features
      .forEach(
        featureId
      );

    clearSelectedFeatures(
      false
    );

    undoStack =
      [];

    redoStack =
      [];

    pathologistDraft =
      null;

    activeDraft =
      null;

    pointerState =
      null;

    markChanged();

    drawAnnotations();
    updateControls();
    updateDiagnostics();

    await phaseF25SaveCurrentStrict();

    return prepared.removed;
  }

  async function phaseF25SaveCurrentStrict() {
    if (!currentImage) {
      throw new Error(
        "No active image to save"
      );
    }

    const imageId =
      String(
        currentImage.id
      );

    const annotationFile =
      String(
        currentAnnotationFile
      );

    if (dirty) {
      await saveAnnotations(
        false
      );
    }

    let record =
      await getLocalDraft(
        imageId,
        annotationFile
      );

    if (
      record?.pending
    ) {
      await syncAllPendingDrafts(
        false
      );

      record =
        await getLocalDraft(
          imageId,
          annotationFile
        );
    }

    if (
      record?.pending
    ) {
      throw new Error(
        `Annotation file "${annotationFile}" remains pending and was not confirmed on the server`
      );
    }
  }

  async function phaseF25RunProtocolOnCurrentImage(
    protocol
  ) {
    if (
      !phaseF241ProtocolCanRun(
        protocol
      )
    ) {
      throw new Error(
        "Current image is not compatible with the selected H-DAB protocol"
      );
    }

    if (els.phaseF24ProtocolSelect) {
      els.phaseF24ProtocolSelect.value =
        String(
          protocol.id
          || ""
        );
    }

    phaseF24SetActiveProtocolId(
      protocol.id
    );

    phaseF241CancelRequested =
      false;

    phaseF24ApplyProtocol();

    await phaseF241RunTissueRoiStage();

    await phaseF241RunAnthracosisStage();

    await phaseF241RunHdabStage();
  }

  async function phaseF25CollectCurrentStatistics() {
    const response =
      await apiFetch(
        `${API}/geojson/statistics`,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              featureCollection,
              imageWidth:
                Number(
                  currentInfo?.width
                  || 0
                ),
              imageHeight:
                Number(
                  currentInfo?.height
                  || 0
                ),
            }),
          timeoutMs:
            5 * 60 * 1000,
        }
      );

    const stats =
      await response.json();

    const calibration =
      phaseEPhysicalPixelAreaMm2();

    const positiveRow =
      (
        stats.rows
        || []
      ).find(
        (row) =>
          String(
            row.className
            || ""
          )
            .toLowerCase()
          === "positive"
      )
      || null;

    const validAreaPx2 =
      Number(
        stats.validAreaPx2
        || stats.analysis?.validAreaPx2
        || 0
      );

    const positiveAreaPx2 =
      Number(
        positiveRow?.areaPx2
        || 0
      );

    const positivePercent =
      Number(
        positiveRow?.percentValid
        || 0
      );

    const artifactAreaPx2 =
      Number(
        stats.analysis?.artifactAreaPx2
        || 0
      );

    const positiveByClass =
      Array.isArray(
        stats.positiveByClass?.rows
      )
        ? stats.positiveByClass.rows
        : [];

    return {
      validAreaPx2,
      validAreaMm2:
        phaseEAreaMm2(
          validAreaPx2,
          calibration
        ),
      positiveAreaPx2,
      positiveAreaMm2:
        phaseEAreaMm2(
          positiveAreaPx2,
          calibration
        ),
      positivePercent,
      artifactAreaPx2,
      artifactAreaMm2:
        phaseEAreaMm2(
          artifactAreaPx2,
          calibration
        ),
      calibration:
        calibration
          ? deepClone(
              calibration
            )
          : null,
      positiveByClass:
        deepClone(
          positiveByClass
        ),
    };
  }

  function phaseF25FormatAreaMm2(
    value
  ) {
    const number =
      Number(
        value
      );

    if (
      !Number.isFinite(
        number
      )
    ) {
      return "—";
    }

    return number.toFixed(
      4
    );
  }

  function phaseF25RenderResults() {
    if (!els.phaseF25BatchResults) {
      return;
    }

    if (
      !phaseF25BatchResults.length
    ) {
      els.phaseF25BatchResults.hidden =
        true;

      els.phaseF25BatchResults.innerHTML =
        "";

      return;
    }

    const rows =
      phaseF25BatchResults
        .map(
          (result) => {
            const status =
              result.status
              === "complete"
                ? "Complete"
                : (
                    result.status
                    === "cancelled"
                      ? "Cancelled"
                      : (
                          result.status
                          === "running"
                            ? "Running"
                            : "Error"
                        )
                  );

            const classSummary =
              result.statistics
                ?.positiveByClass
                ?.map(
                  (row) =>
                    `${escapeHtml(row.className || "")}: ${formatStatNumber(Number(row.positivePercentOfClass || 0), 2)}%`
                )
                .join(
                  " · "
                )
              || "—";

            return `
              <tr>
                <td>${escapeHtml(result.imageName || result.imageId || "")}</td>
                <td>${escapeHtml(status)}</td>
                <td>${phaseF25FormatAreaMm2(result.statistics?.validAreaMm2)}</td>
                <td>${
                  result.statistics
                    ? `${formatStatNumber(Number(result.statistics.positivePercent || 0), 2)}%`
                    : "—"
                }</td>
                <td>${classSummary}</td>
                <td>${escapeHtml(result.error || "")}</td>
              </tr>
            `;
          }
        )
        .join("");

    els.phaseF25BatchResults.hidden =
      false;

    els.phaseF25BatchResults.innerHTML = `
      <table class="stats-table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Status</th>
            <th>Valid tissue (mm²)</th>
            <th>Positive</th>
            <th>Positive by class</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    if (els.phaseF25ExportBatchCsvButton) {
      els.phaseF25ExportBatchCsvButton.disabled =
        !phaseF25BatchResults.length;
    }
  }

  function phaseF25BatchCsv() {
    const classes =
      Array.from(
        new Set(
          phaseF25BatchResults.flatMap(
            (result) =>
              (
                result.statistics
                  ?.positiveByClass
                || []
              ).map(
                (row) =>
                  String(
                    row.className
                    || ""
                  )
              )
          )
        )
      )
        .filter(Boolean)
        .sort(
          (left, right) =>
            left.localeCompare(
              right,
              undefined,
              {
                sensitivity:
                  "base",
              }
            )
        );

    const header = [
      "Image",
      "ImageId",
      "Status",
      "Error",
      "SourceAnnotationFile",
      "ResultAnnotationFile",
      "ProtocolName",
      "ProtocolVersion",
      "ProtocolHash",
      "BaseImage",
      "BaseCalibrationSource",
      "BaseManualMpp",
      "BaseManualObjective",
      "ImageTypeBefore",
      "ImageTypeUsed",
      "ImageTypeInheritedFromBase",
      "CalibrationAvailableOriginal",
      "CalibrationNativeAvailableOriginal",
      "ManualMppOriginal",
      "ManualObjectiveOriginal",
      "MppSourceOriginal",
      "ObjectiveSourceOriginal",
      "MppXOriginal",
      "MppYOriginal",
      "ObjectivePowerOriginal",
      "MppXUsed",
      "MppYUsed",
      "ObjectivePowerUsed",
      "MppSourceUsed",
      "ObjectiveSourceUsed",
      "CalibrationInheritedFromBase",
      "MppInheritedFromBase",
      "ObjectiveInheritedFromBase",
      "CalibrationSourceUsed",
      "Calibration",
      "ValidTissuePx2",
      "ValidTissueMm2",
      "PositiveAreaPx2",
      "PositiveAreaMm2",
      "PositivePercentValidTissue",
      "ArtifactAreaPx2",
      "ArtifactAreaMm2",
    ];

    for (
      const className
      of classes
    ) {
      header.push(
        `${className}_EffectiveAreaPx2`,
        `${className}_EffectiveAreaMm2`,
        `${className}_PositiveAreaPx2`,
        `${className}_PositiveAreaMm2`,
        `${className}_PositivePercent`
      );
    }

    const rows = [
      header,
    ];

    for (
      const result
      of phaseF25BatchResults
    ) {
      const stats =
        result.statistics
        || {};

      const calibration =
        stats.calibration
        || null;

      const byClass =
        new Map(
          (
            stats.positiveByClass
            || []
          ).map(
            (row) => [
              String(
                row.className
                || ""
              ),
              row,
            ]
          )
        );

      const row = [
        result.imageName
          || "",
        result.imageId
          || "",
        result.status
          || "",
        result.error
          || "",
        result.sourceAnnotationFile
          || "",
        result.targetAnnotationFile
          || "",
        result.protocolName
          || "",
        result.protocolVersion
          || "",
        result.protocolHash
          || "",
        result.baseConfiguration?.baseImage
          || "",
        result.baseConfiguration?.baseCalibrationSource
          || "",
        result.baseConfiguration?.baseManualMpp
          ?? "",
        result.baseConfiguration?.baseManualObjective
          ?? "",
        result.baseConfiguration?.imageTypeBefore
          || "",
        result.baseConfiguration?.imageTypeUsed
          || "",
        result.baseConfiguration
          ?.imageTypeInheritedFromBase
          ?? "",
        result.baseConfiguration
          ?.calibrationAvailableOriginal
          ?? "",
        result.baseConfiguration
          ?.calibrationNativeAvailableOriginal
          ?? "",
        result.baseConfiguration?.manualMppOriginal
          ?? "",
        result.baseConfiguration?.manualObjectiveOriginal
          ?? "",
        result.baseConfiguration?.mppSourceOriginal
          || "",
        result.baseConfiguration?.objectiveSourceOriginal
          || "",
        result.baseConfiguration?.mppXOriginal
          ?? "",
        result.baseConfiguration?.mppYOriginal
          ?? "",
        result.baseConfiguration?.objectivePowerOriginal
          ?? "",
        result.baseConfiguration?.mppXUsed
          ?? "",
        result.baseConfiguration?.mppYUsed
          ?? "",
        result.baseConfiguration?.objectivePowerUsed
          ?? "",
        result.baseConfiguration?.mppSourceUsed
          || "",
        result.baseConfiguration?.objectiveSourceUsed
          || "",
        result.baseConfiguration
          ?.calibrationInheritedFromBase
          ?? "",
        result.baseConfiguration
          ?.mppInheritedFromBase
          ?? "",
        result.baseConfiguration
          ?.objectiveInheritedFromBase
          ?? "",
        result.baseConfiguration?.calibrationSourceUsed
          || "",
        calibration?.label
          || "",
        stats.validAreaPx2
          ?? "",
        stats.validAreaMm2
          ?? "",
        stats.positiveAreaPx2
          ?? "",
        stats.positiveAreaMm2
          ?? "",
        stats.positivePercent
          ?? "",
        stats.artifactAreaPx2
          ?? "",
        stats.artifactAreaMm2
          ?? "",
      ];

      for (
        const className
        of classes
      ) {
        const classRow =
          byClass.get(
            className
          );

        const classAreaPx2 =
          Number(
            classRow?.classAreaPx2
            || 0
          );

        const positiveAreaPx2 =
          Number(
            classRow?.positiveAreaPx2
            || 0
          );

        row.push(
          classRow
            ? classAreaPx2
            : "",
          classRow
            ? phaseEAreaMm2(
                classAreaPx2,
                calibration
              )
              ?? ""
            : "",
          classRow
            ? positiveAreaPx2
            : "",
          classRow
            ? phaseEAreaMm2(
                positiveAreaPx2,
                calibration
              )
              ?? ""
            : "",
          classRow
            ? Number(
                classRow.positivePercentOfClass
                || 0
              )
            : ""
        );
      }

      rows.push(
        row
      );
    }

    return (
      rows
        .map(
          (row) =>
            row
              .map(
                phaseECsvCell
              )
              .join(
                ","
              )
        )
        .join(
          "\r\n"
        )
      + "\r\n"
    );
  }

  function phaseF25ExportBatchCsv() {
    if (
      !phaseF25BatchResults.length
    ) {
      setStatus(
        "No batch results to export",
        "error"
      );

      return;
    }

    const protocol =
      phaseF25BatchProtocol
      || {};

    const safe =
      phaseF25SafeAnnotationName(
        protocol.name
        || "protocol"
      )
        .replace(
          /\s+/g,
          "_"
        );

    phaseEDownloadText(
      `HistoAnnotator_batch_${safe}_v${Number(protocol.version || 1)}.csv`,
      phaseF25BatchCsv()
    );

    setStatus(
      "Batch CSV exported",
      "saved"
    );
  }

  async function phaseF25RunBatch() {
    if (
      phaseF25BatchBusy
    ) {
      return;
    }

    const protocol =
      phaseF25BatchProtocol
      || phaseF24SelectedProtocol();

    if (!protocol) {
      setStatus(
        "Select an analysis protocol first",
        "error"
      );

      return;
    }

    const imageIds =
      phaseF25SelectedImageIds();

    if (!imageIds.length) {
      setStatus(
        "Select at least one image for batch analysis",
        "error"
      );

      return;
    }

    const sourceName =
      String(
        els.phaseF25SourceAnnotationFile
          ?.value
        || "Default"
      ).trim();

    const targetName =
      String(
        els.phaseF25TargetAnnotationFile
          ?.value
        || ""
      ).trim();

    if (
      !/^[A-Za-z0-9 _.-]{1,80}$/.test(
        sourceName
      )
      || sourceName === "."
      || sourceName === ".."
    ) {
      setStatus(
        "Invalid Source annotation file name",
        "error"
      );

      return;
    }

    if (
      !/^[A-Za-z0-9 _.-]{1,80}$/.test(
        targetName
      )
      || targetName === "."
      || targetName === ".."
    ) {
      setStatus(
        "Invalid Batch result annotation file name",
        "error"
      );

      return;
    }

    if (
      sourceName.toLowerCase()
      === targetName.toLowerCase()
    ) {
      setStatus(
        "Source and Batch result annotation files must be different",
        "error"
      );

      return;
    }

    if (
      !API
    ) {
      setStatus(
        "Batch analysis requires a configured HistoAnnotator server",
        "error"
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Run batch analysis on ${imageIds.length} image${imageIds.length === 1 ? "" : "s"}?\n\n`
        + `Protocol: ${protocol.name || "Protocol"} v${Number(protocol.version || 1)}\n`
        + `Source: ${sourceName}\n`
        + `Results: ${targetName}\n`
        + `Base image: ${phaseF252BaseImageConfiguration?.imageName || "none"}\n`
        + `Use base image type: ${els.phaseF252UseBaseImageType?.checked ? "yes" : "no"}\n`
        + `Fill missing MPP/objective from base: ${els.phaseF252UseBaseCalibration?.checked ? "yes" : "no"}\n\n`
        + "Source annotations will not be modified. Existing result files with "
        + "the same name will be replaced from a fresh source copy before the "
        + "protocol is rerun."
      );

    if (!confirmed) {
      return;
    }

    const continueOnError =
      Boolean(
        els.phaseF25ContinueOnError
          ?.checked
      );

    phaseF25BatchResults =
      [];

    phaseF25CancelAfterCurrent =
      false;

    phaseF25SetBusy(
      true
    );

    const total =
      imageIds.length;

    try {
      for (
        let index = 0;
        index < imageIds.length;
        index += 1
      ) {
        const imageId =
          imageIds[index];

        const catalogImage =
          images.find(
            (image) =>
              String(image.id)
              === String(imageId)
          );

        const imageName =
          String(
            catalogImage?.relativePath
            || catalogImage?.name
            || imageId
          );

        const result = {
          imageId:
            String(
              imageId
            ),
          imageName,
          status:
            "running",
          error:
            "",
          sourceAnnotationFile:
            sourceName,
          targetAnnotationFile:
            targetName,
          protocolName:
            String(
              protocol.name
              || ""
            ),
          protocolVersion:
            Number(
              protocol.version
              || 1
            ),
          protocolHash:
            String(
              protocol.hash
              || ""
            ),
          baseConfiguration:
            null,
          statistics:
            null,
        };

        phaseF25BatchResults.push(
          result
        );

        phaseF25RenderResults();

        phaseF25SetProgress(
          `Image ${index + 1}/${total} · Opening ${imageName}…`
        );

        try {
          await openImage(
            imageId
          );

          await phaseF25WaitForImageReady(
            imageId
          );

          phaseF25SetProgress(
            `Image ${index + 1}/${total} · Checking image type and physical calibration…`
          );

          result.baseConfiguration =
            await phaseF252ApplyBaseConfigurationToCurrentImage();

          if (
            imageType
            !== "hdab"
          ) {
            throw new Error(
              `Image type is "${imageType || "unknown"}", not H-DAB`
            );
          }

          await loadAnnotationFiles(
            imageId,
            true
          );

          phaseF25SetProgress(
            `Image ${index + 1}/${total} · Creating "${targetName}" from "${sourceName}"…`
          );

          result.preparedSource =
            await phaseF25PrepareResultFile(
              sourceName,
              targetName
            );

          phaseF25SetProgress(
            `Image ${index + 1}/${total} · Tissue ROI → Anthracosis → H-DAB Positive…`
          );

          await phaseF25RunProtocolOnCurrentImage(
            protocol
          );

          phaseF252AttachBatchConfiguration(
            result.baseConfiguration
          );

          phaseF25SetProgress(
            `Image ${index + 1}/${total} · Saving ${targetName}…`
          );

          await phaseF25SaveCurrentStrict();

          phaseF25SetProgress(
            `Image ${index + 1}/${total} · Calculating statistics…`
          );

          result.statistics =
            await phaseF25CollectCurrentStatistics();

          result.status =
            "complete";

          result.error =
            "";
        } catch (error) {
          result.status =
            "error";

          result.error =
            String(
              error?.message
              || error
            );

          try {
            if (
              currentImage
              && String(currentImage.id)
                === String(imageId)
              && String(currentAnnotationFile)
                === targetName
              && dirty
            ) {
              await phaseF25SaveCurrentStrict();
            }
          } catch (saveError) {
            result.error +=
              ` · partial result save failed: ${saveError.message || String(saveError)}`;
          }

          if (
            !continueOnError
          ) {
            phaseF25RenderResults();
            break;
          }
        }

        phaseF25RenderResults();

        if (
          phaseF25CancelAfterCurrent
        ) {
          phaseF25SetProgress(
            `Batch stopped after ${index + 1}/${total} image${index === 0 ? "" : "s"}.`
          );

          break;
        }
      }

      const complete =
        phaseF25BatchResults
          .filter(
            (result) =>
              result.status
              === "complete"
          )
          .length;

      const failed =
        phaseF25BatchResults
          .filter(
            (result) =>
              result.status
              === "error"
          )
          .length;

      if (
        phaseF25CancelAfterCurrent
      ) {
        phaseF25SetProgress(
          `Batch cancelled after current image · ${complete} complete · ${failed} error${failed === 1 ? "" : "s"}.`
        );
      } else {
        phaseF25SetProgress(
          `Batch finished · ${complete} complete · ${failed} error${failed === 1 ? "" : "s"}.`
        );
      }

      setStatus(
        `Batch finished · ${complete} complete · ${failed} error${failed === 1 ? "" : "s"}`,
        failed
          ? "local"
          : "saved"
      );
    } finally {
      phaseF25CancelAfterCurrent =
        false;

      phaseF241CancelRequested =
        false;

      phaseF25SetBusy(
        false
      );

      phaseF25RenderResults();
    }
  }

  function phaseF25CancelBatch() {
    if (
      !phaseF25BatchBusy
    ) {
      return;
    }

    phaseF25CancelAfterCurrent =
      true;

    phaseF25SetProgress(
      "Cancellation requested · the current image will finish and be saved; no additional images will start."
    );
  }

  function phaseF24DeleteSelectedProtocol() {
    const selected =
      phaseF24SelectedProtocol();

    if (!selected) return;

    if (
      !window.confirm(
        `Delete "${selected.name}" v${Number(selected.version || 1)}?`
      )
    ) {
      return;
    }

    const protocols =
      phaseF24ReadProtocols()
        .filter(
          (item) =>
            String(item.id || "")
            !== String(
              selected.id
              || ""
            )
        );

    phaseF24WriteProtocols(
      protocols
    );

    if (
      phaseF24ActiveProtocolId()
      === String(
        selected.id
        || ""
      )
    ) {
      phaseF24SetActiveProtocolId(
        ""
      );
    }

    phaseF24RefreshProtocolSelect();

    setStatus(
      "Analysis protocol deleted",
      "saved"
    );
  }

  function phaseF24ExportSelectedProtocol() {
    const protocol =
      phaseF24SelectedProtocol();

    if (!protocol) {
      setStatus(
        "Select a protocol before exporting",
        "error"
      );
      return;
    }

    const safeName =
      String(
        protocol.name
        || "analysis_protocol"
      )
        .replace(
          /[^A-Za-z0-9._-]+/g,
          "_"
        )
        .replace(
          /^_+|_+$/g,
          ""
        )
      || "analysis_protocol";

    phaseEDownloadText(
      `${safeName}_v${Number(protocol.version || 1)}.json`,
      JSON.stringify(
        protocol,
        null,
        2
      ),
      "application/json;charset=utf-8"
    );

    setStatus(
      "Analysis protocol JSON exported",
      "saved"
    );
  }

  async function phaseF24ImportProtocolFile(
    file
  ) {
    if (!file) return;

    try {
      const parsed =
        JSON.parse(
          await file.text()
        );

      if (
        !parsed
        || typeof parsed !== "object"
        || parsed.schema
          !== "histoannotator-analysis-protocol"
        || Number(parsed.schemaVersion)
          !== 1
        || !parsed.pipeline
        || !parsed.pipeline.tissueRoi
        || !parsed.pipeline.anthracosis
        || !parsed.pipeline.hdab
      ) {
        throw new Error(
          "Unsupported or incomplete HistoAnnotator analysis protocol"
        );
      }

      const pipeline =
        deepClone(
          parsed.pipeline
        );

      const hash =
        await phaseF24HashPipeline(
          pipeline
        );

      const now =
        new Date().toISOString();

      const imported = {
        ...deepClone(parsed),
        id:
          phaseF24NewId(
            "protocol"
          ),
        familyId:
          String(
            parsed.familyId
            || phaseF24NewId(
              "family"
            )
          ),
        name:
          String(
            parsed.name
            || "Imported analysis protocol"
          ),
        version:
          Math.max(
            1,
            Number(
              parsed.version
              || 1
            )
          ),
        schema:
          "histoannotator-analysis-protocol",
        schemaVersion:
          1,
        hash,
        pipeline,
        importedAt:
          now,
        updatedAt:
          now,
      };

      const protocols =
        phaseF24ReadProtocols();

      protocols.push(
        imported
      );

      phaseF24WriteProtocols(
        protocols
      );

      phaseF24SetActiveProtocolId(
        imported.id
      );

      phaseF24RefreshProtocolSelect(
        imported.id
      );

      setStatus(
        `Imported "${imported.name}" v${imported.version}`,
        "saved"
      );
    } catch (error) {
      setStatus(
        `Could not import analysis protocol: ${error.message}`,
        "error"
      );
    } finally {
      if (els.phaseF24ImportInput) {
        els.phaseF24ImportInput.value =
          "";
      }
    }
  }

  function phaseF20OpenHdabQuantification() {
    if (els.hdabQuantButton) {
      els.hdabQuantButton.disabled =
        !currentImage
        || !currentInfo
        || imageType !== "hdab"
        || Boolean(currentImage?.localNative);
    }

    if (
      !currentImage
      || !currentInfo
    ) {
      return;
    }

    if (imageType !== "hdab") {
      setStatus(
        "Set Image type to Brightfield H-DAB first",
        "error"
      );
      return;
    }

    toggleFileMenu(false);

    phaseF20UpdateThresholdControls();

    if (els.hdabQuantModal) {
      els.hdabQuantModal.hidden = false;
    }
  }

  function phaseF20ExportHdabCsv() {
    const payload =
      phaseF20LastHdabResult;

    if (!payload) {
      setStatus(
        "Run H-DAB analysis before exporting CSV",
        "error"
      );
      return;
    }

    const analysis =
      payload.analysis || {};
    const results =
      payload.results || {};
    const threshold =
      payload.threshold || {};

    const rows = [
      ["Metric", "Value"],
      ["Image", currentImage?.name || ""],
      ["AnnotationFile", currentAnnotationFile || ""],
      ["Method", payload.method || ""],
      ["AnalysisRegion", analysis.analysisRegion || ""],
      ["AnalysisResolution", analysis.analysisResolution || ""],
      ["ThresholdMode", threshold.mode || ""],
      ["ThresholdMethod", threshold.method || ""],
      ["DABOpticalDensityThreshold", threshold.dabOpticalDensity ?? ""],
      ["WeightedObjectVarianceDelta", threshold.weightedObjectVarianceDelta ?? ""],
      ["GaussianSmoothingEnabled", payload.processing?.gaussianSmoothing?.enabled ?? ""],
      ["GaussianSigma", payload.processing?.gaussianSmoothing?.sigma ?? ""],
      ["GaussianSigmaUnit", payload.processing?.gaussianSmoothing?.unit ?? ""],
      ["GaussianSigmaPx", payload.processing?.gaussianSmoothing?.sigmaPx ?? ""],
      ["SmallObjectFilterEnabled", payload.processing?.smallObjectFilter?.enabled ?? ""],
      ["MinimumPositiveObjectArea", payload.processing?.smallObjectFilter?.minimumArea ?? ""],
      ["MinimumPositiveObjectAreaUnit", payload.processing?.smallObjectFilter?.unit ?? ""],
      ["MinimumPositiveObjectAreaPx2", payload.processing?.smallObjectFilter?.minimumAreaPx2 ?? ""],
      ["SmallObjectsRemoved", payload.processing?.smallObjectFilter?.removedObjects ?? ""],
      ["SmallObjectAreaRemovedPx2", payload.processing?.smallObjectFilter?.removedAreaPx2 ?? ""],
      ["CalibrationMpp", payload.processing?.calibrationMpp ?? ""],
      ["QuantificationBasis", payload.processing?.quantificationBasis ?? ""],
      ["AnalysisProtocolName", payload.analysisProtocol?.name ?? phaseF24ActiveProtocol()?.name ?? ""],
      ["AnalysisProtocolVersion", payload.analysisProtocol?.version ?? phaseF24ActiveProtocol()?.version ?? ""],
      ["AnalysisProtocolHash", payload.analysisProtocol?.hash ?? phaseF24ActiveProtocol()?.hash ?? ""],
      ["AnalysisProtocolStage", payload.analysisProtocol?.stage ?? ""],
      ["AnalysisProtocolPipelineJSON", payload.analysisProtocolPipeline ? JSON.stringify(payload.analysisProtocolPipeline) : ""],
      ["ValidAreaPx2", results.validAreaPx2 ?? ""],
      ["PositiveAreaPx2", results.positiveAreaPx2 ?? ""],
      ["NegativeAreaPx2", results.negativeAreaPx2 ?? ""],
      ["PositivePercent", results.positivePercent ?? ""],
      ["NegativePercent", results.negativePercent ?? ""],
      ["MeanDABOpticalDensity", results.meanDabOpticalDensity ?? ""],
      ["ArtifactAreaPx2", analysis.artifactAreaPx2 ?? ""],
      ["AnthracosisAreaPx2", analysis.anthracosisAreaPx2 ?? ""],
      ["ExternalBorderActualPct", analysis.externalBorderActualPct ?? ""],
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) =>
            `"${String(value ?? "").replaceAll('"', '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const base = String(
      currentImage?.name
      || "image"
    )
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_");

    phaseEDownloadText(
      `${base}_hdab_quantification.csv`,
      csv
    );

    setStatus(
      "H-DAB quantification CSV exported",
      "saved"
    );
  }

  async function phaseF20RunHdabQuantification() {
    if (
      !currentImage
      || !currentInfo
      || imageType !== "hdab"
    ) {
      return;
    }

    const thresholdMode = String(
      els.hdabQuantThresholdMode?.value
      || "auto"
    );

    const thresholdOd = Math.max(
      0,
      Math.min(
        6,
        Number(
          els.hdabQuantThreshold?.value
          || 0.30
        )
      )
    );

    if (els.hdabQuantContent) {
      els.hdabQuantContent.innerHTML =
        '<p class="modal-note">Analyzing native-resolution H-DAB pixels… large slides may take a while.</p>';
    }

    if (els.hdabQuantRunButton) {
      els.hdabQuantRunButton.disabled = true;
    }

    try {
      const response = await apiFetch(
        `${API}/images/${currentImage.id}/analyze-hdab`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            featureCollection,
            thresholdMode,
            thresholdOd,
            tileSize: 1024,
          }),
          timeoutMs: 5 * 60 * 1000,
        }
      );

      const payload =
        await response.json();

      phaseF20LastHdabResult =
        deepClone(payload);

      if (
        phaseF20LastHdabResult
        && !phaseF20LastHdabResult.analysisProtocol
      ) {
        phaseF20LastHdabResult.analysisProtocol =
          phaseF24ProtocolSnapshotForMetadata(
            "hdab"
          );

        const activeProtocol =
          phaseF24ActiveProtocol();

        if (
          phaseF20LastHdabResult.analysisProtocol
          && activeProtocol
          && String(activeProtocol.hash || "")
            === String(
              phaseF20LastHdabResult
                .analysisProtocol
                .hash
              || ""
            )
        ) {
          phaseF20LastHdabResult.analysisProtocolPipeline =
            deepClone(
              activeProtocol.pipeline
            );
        }
      }

      const analysis =
        payload.analysis || {};
      const results =
        payload.results || {};
      const threshold =
        payload.threshold || {};
      const tiles =
        payload.tiles || {};

      const calibration =
        phaseEPhysicalPixelAreaMm2();

      const validArea =
        Number(
          results.validAreaPx2
          || 0
        );

      const positiveArea =
        Number(
          results.positiveAreaPx2
          || 0
        );

      const negativeArea =
        Number(
          results.negativeAreaPx2
          || 0
        );

      const artifactArea =
        Number(
          analysis.artifactAreaPx2
          || 0
        );

      const anthracosisArea =
        Number(
          analysis.anthracosisAreaPx2
          || 0
        );

      const positivePercent =
        Number(
          results.positivePercent
          || 0
        );

      const negativePercent =
        Number(
          results.negativePercent
          || 0
        );

      const thresholdValue =
        Number(
          threshold.dabOpticalDensity
          || 0
        );

      const meanDab =
        Number(
          results.meanDabOpticalDensity
          || 0
        );

      if (els.hdabQuantContent) {
        els.hdabQuantContent.innerHTML = `
          <div class="stats-summary">
            <strong>${escapeHtml(currentImage.name)}</strong>

            <span>
              Analysis region:
              ${escapeHtml(
                analysis.analysisRegion
                || "Tissue ROI - External border - Artifact - Anthracosis"
              )}
            </span>

            <span>
              Resolution:
              ${escapeHtml(
                analysis.analysisResolution
                || "native-level-0"
              )}
            </span>

            <span>
              Threshold:
              <strong>${formatStatNumber(thresholdValue, 3)} DAB OD</strong>
              · ${escapeHtml(threshold.mode || thresholdMode)}
              · ${escapeHtml(threshold.method || "")}
            </span>

            <span>
              Artifact excluded:
              ${formatStatNumber(artifactArea)} px²
              · ${phaseEFormatMm2(
                phaseEAreaMm2(
                  artifactArea,
                  calibration
                )
              )}
            </span>

            <span>
              Anthracosis excluded:
              ${formatStatNumber(anthracosisArea)} px²
              · ${phaseEFormatMm2(
                phaseEAreaMm2(
                  anthracosisArea,
                  calibration
                )
              )}
            </span>

            <span>
              <strong>Valid H-DAB tissue:</strong>
              ${formatStatNumber(validArea)} px²
              · ${phaseEFormatMm2(
                phaseEAreaMm2(
                  validArea,
                  calibration
                )
              )}
            </span>

            <span>
              <strong>DAB positive:</strong>
              ${formatStatNumber(positiveArea)} px²
              · ${phaseEFormatMm2(
                phaseEAreaMm2(
                  positiveArea,
                  calibration
                )
              )}
              · ${formatStatNumber(
                positivePercent,
                2
              )}%
            </span>

            <span>
              <strong>DAB negative:</strong>
              ${formatStatNumber(negativeArea)} px²
              · ${phaseEFormatMm2(
                phaseEAreaMm2(
                  negativeArea,
                  calibration
                )
              )}
              · ${formatStatNumber(
                negativePercent,
                2
              )}%
            </span>

            <span>
              Mean DAB optical density:
              ${formatStatNumber(meanDab, 4)}
            </span>

            <span>
              Tiles:
              ${formatStatNumber(
                tiles.processed || 0
              )} processed
              · ${formatStatNumber(
                tiles.skipped || 0
              )} skipped
            </span>
          </div>

          <div class="modal-actions">
            <button
              id="phaseF20ExportHdabCsvButton"
              type="button"
            >
              Export CSV
            </button>
          </div>

          <p class="stats-note">
            F2.0 reports pixel-area DAB positivity directly from native level-0
            optical-density deconvolution. Auto mode uses Otsu on DAB optical
            density inside valid tissue. Validate the selected threshold for the
            staining protocol before comparing experimental batches.
          </p>
        `;

        document
          .getElementById(
            "phaseF20ExportHdabCsvButton"
          )
          ?.addEventListener(
            "click",
            phaseF20ExportHdabCsv
          );
      }

      setStatus(
        `H-DAB positivity ${positivePercent.toFixed(2)}% · threshold ${thresholdValue.toFixed(3)} OD`,
        "saved"
      );

    } catch (error) {
      phaseF20LastHdabResult = null;

      if (els.hdabQuantContent) {
        els.hdabQuantContent.innerHTML =
          `<p class="modal-note">H-DAB analysis failed: ${escapeHtml(error.message)}</p>`;
      }

      setStatus(
        `H-DAB analysis failed: ${error.message}`,
        "error"
      );

    } finally {
      if (els.hdabQuantRunButton) {
        els.hdabQuantRunButton.disabled = false;
      }
    }
  }

  // =========================================================
  // Phase F2.3 — Positive by class statistics
  // =========================================================

  function phaseF23PositiveByClassData() {
    return (
      phaseELastStatistics
        ?.stats
        ?.positiveByClass
      || null
    );
  }

  function phaseF23ShowPositiveByClass() {
    const snapshot =
      phaseELastStatistics;

    const data =
      phaseF23PositiveByClassData();

    if (
      !snapshot
      || !data
      || !data.available
    ) {
      setStatus(
        "Positive by class requires at least one Positive annotation",
        "error"
      );
      return;
    }

    const calibration =
      snapshot.calibration
      || phaseEPhysicalPixelAreaMm2();

    const rows =
      Array.isArray(data.rows)
        ? data.rows
        : [];

    const rowsHtml =
      rows.length
        ? rows
            .map((row) => {
              const classArea =
                Number(
                  row.classAreaPx2
                  || 0
                );

              const positiveArea =
                Number(
                  row.positiveAreaPx2
                  || 0
                );

              const percent =
                Number(
                  row.positivePercentOfClass
                  || 0
                );

              return `
                <tr>
                  <td>${escapeHtml(row.className || "")}</td>
                  <td>${formatStatNumber(classArea)}</td>
                  <td>${phaseEFormatMm2(phaseEAreaMm2(classArea, calibration))}</td>
                  <td>${formatStatNumber(positiveArea)}</td>
                  <td>${phaseEFormatMm2(phaseEAreaMm2(positiveArea, calibration))}</td>
                  <td><strong>${formatStatNumber(percent, 2)}%</strong></td>
                </tr>
              `;
            })
            .join("")
        : `
            <tr>
              <td colspan="6">
                No eligible annotation classes with effective area were found.
              </td>
            </tr>
          `;

    const positiveArea =
      Number(
        data.positiveEffectiveAreaPx2
        || 0
      );

    if (els.positiveByClassStatsContent) {
      els.positiveByClassStatsContent.innerHTML = `
        <div class="stats-summary">
          <strong>${escapeHtml(snapshot.imageName || "")}</strong>
          <span>
            Annotation file:
            ${escapeHtml(snapshot.annotationFile || "")}
          </span>
          <span>
            Effective Positive area:
            ${formatStatNumber(positiveArea)} px²
            · ${phaseEFormatMm2(phaseEAreaMm2(positiveArea, calibration))}
          </span>
          <span>
            <strong>Definition:</strong>
            Positive within class =
            area(Positive ∩ effective class)
            / effective class area × 100.
          </span>
        </div>

        <div class="stats-table-wrap">
          <table class="stats-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Effective class area (px²)</th>
                <th>Class area (mm²)</th>
                <th>Positive intersection (px²)</th>
                <th>Positive area (mm²)</th>
                <th>Positive within class</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>

        <p class="stats-note">
          External border and Artifact are excluded before this calculation.
          Anthracosis is removed from both Positive and each analyzed class.
          Positive, Anthracosis and Artifact are not used as denominator
          classes. If biological classes overlap, the same Positive region may
          contribute independently to more than one class.
        </p>
      `;
    }

    if (els.annotationStatsModal) {
      els.annotationStatsModal.hidden =
        true;
    }

    if (els.positiveByClassStatsModal) {
      els.positiveByClassStatsModal.hidden =
        false;
    }
  }

  function phaseF23ExportPositiveByClassCsv() {
    const snapshot =
      phaseELastStatistics;

    const data =
      phaseF23PositiveByClassData();

    if (
      !snapshot
      || !data
      || !data.available
    ) {
      setStatus(
        "Run Positive by class before exporting CSV",
        "error"
      );
      return;
    }

    const calibration =
      snapshot.calibration
      || phaseEPhysicalPixelAreaMm2();

    const rows = [[
      "Image",
      "AnnotationFile",
      "Class",
      "EffectiveClassAreaPx2",
      "EffectiveClassAreaMm2",
      "PositiveIntersectionPx2",
      "PositiveIntersectionMm2",
      "PositiveWithinClassPercent",
    ]];

    for (
      const row
      of data.rows || []
    ) {
      const classArea =
        Number(
          row.classAreaPx2
          || 0
        );

      const positiveArea =
        Number(
          row.positiveAreaPx2
          || 0
        );

      rows.push([
        snapshot.imageName || "",
        snapshot.annotationFile || "",
        row.className || "",
        classArea,
        phaseEAreaMm2(
          classArea,
          calibration
        ) ?? "",
        positiveArea,
        phaseEAreaMm2(
          positiveArea,
          calibration
        ) ?? "",
        Number(
          row.positivePercentOfClass
          || 0
        ),
      ]);
    }

    const csv =
      rows
        .map(
          (row) =>
            row
              .map(phaseECsvCell)
              .join(",")
        )
        .join("\r\n")
      + "\r\n";

    const base =
      String(
        snapshot.imageName
        || "image"
      )
        .replace(
          /\.[^.]+$/,
          ""
        )
        .replace(
          /[^A-Za-z0-9._-]+/g,
          "_"
        );

    phaseEDownloadText(
      `${base}_positive_by_class.csv`,
      csv
    );

    setStatus(
      "Positive-by-class CSV exported",
      "saved"
    );
  }

  function phaseF23BackToAnnotationStatistics() {
    if (els.positiveByClassStatsModal) {
      els.positiveByClassStatsModal.hidden =
        true;
    }

    if (els.annotationStatsModal) {
      els.annotationStatsModal.hidden =
        false;
    }
  }

  function phaseF23ClosePositiveByClass() {
    if (els.positiveByClassStatsModal) {
      els.positiveByClassStatsModal.hidden =
        true;
    }
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
          ${
            stats.positiveByClass?.available
              ? `
                <button
                  id="phaseF23PositiveByClassButton"
                  type="button"
                >
                  Positive by class
                </button>
              `
              : ""
          }
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

      document
        .getElementById(
          "phaseF23PositiveByClassButton"
        )
        ?.addEventListener(
          "click",
          phaseF23ShowPositiveByClass
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

// ========================================================================
// Phase IL7 + UX reference view
// ========================================================================

const PHASE_R_POSITION_KEY =
  "histoannotator.referenceView.position.v1";

let phaseRViewer =
  null;

let phaseRState = {
  open: false,
  collapsed: false,
  picking: false,
  imageId: null,
  center: null,
  syncFrame: null,
};


function phaseUXEnsureFocusPathologistActions() {
  if (
    document.getElementById(
      "phaseUXFocusPathologistActions"
    )
  ) {
    return;
  }

  const shell =
    document.querySelector(
      ".viewer-shell"
    );

  if (!shell) return;

  const bar =
    document.createElement(
      "div"
    );

  bar.id =
    "phaseUXFocusPathologistActions";

  bar.className =
    "phase-ux-focus-pathologist-actions";

  bar.hidden = true;

  bar.innerHTML = `
    <button id="phaseUXFocusPathologistComplete"
            type="button">Complete</button>
    <button id="phaseUXFocusPathologistInner"
            type="button">Inner area</button>
    <button id="phaseUXFocusPathologistCancel"
            type="button">Cancel</button>
  `;

  shell.append(bar);

  document
    .getElementById(
      "phaseUXFocusPathologistComplete"
    )
    ?.addEventListener(
      "click",
      () =>
        completePathologistDraft()
    );

  document
    .getElementById(
      "phaseUXFocusPathologistInner"
    )
    ?.addEventListener(
      "click",
      beginPathologistHole
    );

  document
    .getElementById(
      "phaseUXFocusPathologistCancel"
    )
    ?.addEventListener(
      "click",
      cancelPathologistDraft
    );
}


function phaseRRefs() {
  return {
    menu:
      document.getElementById(
        "phaseRMenuButton"
      ),
    panel:
      document.getElementById(
        "phaseRPanel"
      ),
    header:
      document.getElementById(
        "phaseRHeader"
      ),
    content:
      document.getElementById(
        "phaseRContent"
      ),
    message:
      document.getElementById(
        "phaseRMessage"
      ),
    position:
      document.getElementById(
        "phaseRPosition"
      ),
    zoom:
      document.getElementById(
        "phaseRZoom"
      ),
    pick:
      document.getElementById(
        "phaseRPickButton"
      ),
    collapse:
      document.getElementById(
        "phaseRCollapseButton"
      ),
    close:
      document.getElementById(
        "phaseRCloseButton"
      ),
  };
}


function phaseRCenterStorageKey() {
  if (!currentImage?.id) return null;

  return (
    "histoannotator.referenceView.center.v1::"
    + currentImage.id
  );
}


function phaseRReadCenter() {
  const key =
    phaseRCenterStorageKey();

  if (!key) return null;

  try {
    const value =
      JSON.parse(
        localStorage.getItem(key)
        || "null"
      );

    const x =
      Number(value?.x);

    const y =
      Number(value?.y);

    if (
      Number.isFinite(x)
      && Number.isFinite(y)
    ) {
      return phaseGClampPointToImage([
        x,
        y,
      ]);
    }
  } catch (_) {}

  return null;
}


function phaseRSaveCenter() {
  const key =
    phaseRCenterStorageKey();

  if (
    !key
    || !Array.isArray(
      phaseRState.center
    )
  ) {
    return;
  }

  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        x:
          Number(
            phaseRState.center[0]
          ),
        y:
          Number(
            phaseRState.center[1]
          ),
      })
    );
  } catch (_) {}
}


function phaseRDefaultCenter() {
  if (
    !viewer
    || !viewer.world
      ?.getItemCount?.()
  ) {
    return null;
  }

  try {
    const item =
      viewer.world.getItemAt(0);

    const center =
      viewer.viewport.getCenter();

    const imagePoint =
      item.viewportToImageCoordinates(
        center
      );

    return phaseGClampPointToImage([
      imagePoint.x,
      imagePoint.y,
    ]);
  } catch (_) {
    return null;
  }
}


function phaseRLoadSavedPosition() {
  try {
    const value =
      JSON.parse(
        localStorage.getItem(
          PHASE_R_POSITION_KEY
        )
        || "null"
      );

    const left =
      Number(value?.left);

    const top =
      Number(value?.top);

    if (
      Number.isFinite(left)
      && Number.isFinite(top)
    ) {
      return {
        left,
        top,
      };
    }
  } catch (_) {}

  return null;
}


function phaseRSavePosition() {
  const panel =
    phaseRRefs().panel;

  if (!panel) return;

  const rect =
    panel.getBoundingClientRect();

  try {
    localStorage.setItem(
      PHASE_R_POSITION_KEY,
      JSON.stringify({
        left:
          Math.round(rect.left),
        top:
          Math.round(rect.top),
      })
    );
  } catch (_) {}
}


function phaseRClampWindow() {
  const panel =
    phaseRRefs().panel;

  if (
    !panel
    || panel.hidden
  ) {
    return;
  }

  const rect =
    panel.getBoundingClientRect();

  const maxLeft =
    Math.max(
      4,
      window.innerWidth
      - Math.min(
          rect.width,
          window.innerWidth - 8
        )
      - 4
    );

  const maxTop =
    Math.max(
      4,
      window.innerHeight
      - Math.min(
          rect.height,
          window.innerHeight - 8
        )
      - 4
    );

  panel.style.left =
    `${
      Math.round(
        Math.max(
          4,
          Math.min(
            maxLeft,
            rect.left
          )
        )
      )
    }px`;

  panel.style.top =
    `${
      Math.round(
        Math.max(
          4,
          Math.min(
            maxTop,
            rect.top
          )
        )
      )
    }px`;

  panel.style.right =
    "auto";
}


function phaseRSetMessage(message = "") {
  const refs =
    phaseRRefs();

  if (!refs.message) return;

  refs.message.textContent =
    message;

  refs.message.hidden =
    !message;
}


function phaseRUpdateLabels() {
  const refs =
    phaseRRefs();

  const center =
    phaseRState.center;

  if (refs.position) {
    refs.position.textContent =
      Array.isArray(center)
        ? (
            `x ${Math.round(center[0])}`
            + ` · y ${Math.round(center[1])}`
          )
        : "No reference selected";
  }

  if (refs.zoom) {
    const magnification =
      currentApproxMagnification(
        effectiveCalibration()
      );

    refs.zoom.textContent =
      (
        Number.isFinite(
          magnification
        )
        && magnification > 0
      )
        ? (
            `≈${formatMagnification(
              magnification
            )}× matched`
          )
        : "Zoom matched";
  }

  if (refs.pick) {
    refs.pick.textContent =
      phaseRState.picking
        ? "Tap reference area…"
        : "Pick reference";
  }

  document.body.classList.toggle(
    "phase-r-picking-reference",
    Boolean(
      phaseRState.picking
    )
  );
}


function phaseRCreateViewer() {
  if (
    phaseRViewer
    || !document.getElementById(
      "phaseRViewer"
    )
  ) {
    return;
  }

  phaseRViewer =
    OpenSeadragon({
      id:
        "phaseRViewer",
      showNavigationControl:
        false,
      showNavigator:
        false,
      animationTime:
        0,
      blendTime:
        0,
      immediateRender:
        true,
      maxZoomPixelRatio:
        4.0,
      visibilityRatio:
        0.05,
      constrainDuringPan:
        false,
      imageLoaderLimit:
        4,
      maxImageCacheCount:
        240,
      gestureSettingsMouse: {
        scrollToZoom:
          false,
        clickToZoom:
          false,
        dblClickToZoom:
          false,
        dragToPan:
          false,
      },
      gestureSettingsTouch: {
        scrollToZoom:
          false,
        clickToZoom:
          false,
        dblClickToZoom:
          false,
        pinchToZoom:
          false,
        flickEnabled:
          false,
        dragToPan:
          false,
      },
      gestureSettingsPen: {
        scrollToZoom:
          false,
        clickToZoom:
          false,
        dblClickToZoom:
          false,
        pinchToZoom:
          false,
        flickEnabled:
          false,
        dragToPan:
          false,
      },
    });

  phaseRViewer
    .setMouseNavEnabled(false);

  phaseRViewer.addHandler(
    "open",
    () => {
      phaseRSetMessage("");
      phaseRQueueSync();
    }
  );

  phaseRViewer.addHandler(
    "tile-load-failed",
    () => {
      phaseRSetMessage(
        "Reference tile unavailable"
      );
    }
  );
}


function phaseRSourceForCurrentImage() {
  if (
    !currentImage
    || !currentInfo
  ) {
    return null;
  }

  if (currentImage.localNative) {
    const session =
      localTiffSessions.get(
        currentImage.id
      );

    return session
      ? buildLocalTiffViewerSource(
          session
        )
      : null;
  }

  return buildViewerSource(
    currentImage.id,
    currentInfo
  );
}


function phaseROpenCurrentSource() {
  if (
    !phaseRState.open
    || !phaseRViewer
  ) {
    return;
  }

  if (
    !currentImage
    || !currentInfo
  ) {
    phaseRViewer.close();
    phaseRState.imageId = null;
    phaseRState.center = null;

    phaseRSetMessage(
      "Open an image to use Reference View"
    );

    phaseRUpdateLabels();
    return;
  }

  const changedImage =
    String(
      phaseRState.imageId
      || ""
    ) !== String(
      currentImage.id
      || ""
    );

  phaseRState.imageId =
    currentImage.id;

  if (
    changedImage
    || !phaseRState.center
  ) {
    phaseRState.center =
      phaseRReadCenter()
      || phaseRDefaultCenter();
  }

  const source =
    phaseRSourceForCurrentImage();

  if (!source) {
    phaseRSetMessage(
      "Reference image source unavailable"
    );
    return;
  }

  phaseRSetMessage(
    "Loading reference…"
  );

  phaseRViewer.open(source);
  phaseRUpdateLabels();
}


function phaseRMainPixelsPerScreenPixel() {
  if (
    !viewer
    || !viewer.world
      ?.getItemCount?.()
  ) {
    return null;
  }

  const imagePixels =
    screenToleranceToImage(100);

  if (
    !Number.isFinite(imagePixels)
    || imagePixels <= 0
  ) {
    return null;
  }

  return imagePixels / 100;
}


function phaseRSyncMagnification() {
  if (
    !phaseRState.open
    || phaseRState.collapsed
    || !phaseRViewer
    || !phaseRViewer.world
      ?.getItemCount?.()
    || !Array.isArray(
      phaseRState.center
    )
  ) {
    return;
  }

  const imagePixelsPerScreenPixel =
    phaseRMainPixelsPerScreenPixel();

  if (
    !Number.isFinite(
      imagePixelsPerScreenPixel
    )
    || imagePixelsPerScreenPixel <= 0
  ) {
    return;
  }

  const container =
    phaseRViewer.container
      ?.getBoundingClientRect();

  if (
    !container
    || container.width < 20
    || container.height < 20
  ) {
    return;
  }

  const imageWidth =
    imagePixelsPerScreenPixel
    * container.width;

  const imageHeight =
    imagePixelsPerScreenPixel
    * container.height;

  const center =
    phaseGClampPointToImage(
      phaseRState.center
    );

  if (!center) return;

  phaseRState.center =
    center;

  const item =
    phaseRViewer.world
      .getItemAt(0);

  const topLeft =
    item.imageToViewportCoordinates(
      center[0]
        - imageWidth / 2,
      center[1]
        - imageHeight / 2
    );

  const bottomRight =
    item.imageToViewportCoordinates(
      center[0]
        + imageWidth / 2,
      center[1]
        + imageHeight / 2
    );

  if (!topLeft || !bottomRight) {
    return;
  }

  phaseRViewer.viewport.fitBounds(
    new OpenSeadragon.Rect(
      topLeft.x,
      topLeft.y,
      Math.max(
        0.0000001,
        bottomRight.x
          - topLeft.x
      ),
      Math.max(
        0.0000001,
        bottomRight.y
          - topLeft.y
      )
    ),
    true
  );

  phaseRViewer.viewport
    .applyConstraints(true);

  phaseRUpdateLabels();
}


function phaseRQueueSync() {
  if (
    phaseRState.syncFrame
    !== null
  ) {
    return;
  }

  phaseRState.syncFrame =
    window.requestAnimationFrame(
      () => {
        phaseRState.syncFrame = null;
        phaseRSyncMagnification();
      }
    );
}


function phaseRSetCollapsed(collapsed) {
  const refs =
    phaseRRefs();

  phaseRState.collapsed =
    Boolean(collapsed);

  if (refs.content) {
    refs.content.hidden =
      phaseRState.collapsed;
  }

  if (refs.collapse) {
    refs.collapse.textContent =
      phaseRState.collapsed
        ? "▣"
        : "—";

    refs.collapse.title =
      phaseRState.collapsed
        ? "Expand reference view"
        : "Collapse reference view";
  }

  if (
    !phaseRState.collapsed
    && phaseRViewer
  ) {
    window.requestAnimationFrame(
      () => {
        phaseRViewer.viewport.resize(
          new OpenSeadragon.Point(
            phaseRViewer.container
              .clientWidth,
            phaseRViewer.container
              .clientHeight
          ),
          true
        );

        phaseRQueueSync();
      }
    );
  }

  phaseRClampWindow();
}


function phaseRSetOpen(open) {
  const refs =
    phaseRRefs();

  phaseRState.open =
    Boolean(open);

  phaseRState.picking =
    false;

  if (refs.panel) {
    refs.panel.hidden =
      !phaseRState.open;
  }

  phaseBToggleSettings(false);

  if (!phaseRState.open) {
    phaseRUpdateLabels();
    return;
  }

  if (
    !currentImage
    || !currentInfo
  ) {
    phaseRSetMessage(
      "Open an image to use Reference View"
    );
  } else {
    phaseROpenCurrentSource();
  }

  phaseRUpdateLabels();
  phaseRClampWindow();
}


function phaseRBeginPick() {
  if (
    !phaseRState.open
    || !currentImage
    || !viewer?.world
      ?.getItemCount?.()
  ) {
    setStatus(
      "Open an image before choosing a reference area",
      "error"
    );
    return;
  }

  phaseRState.picking = true;
  phaseRUpdateLabels();

  setStatus(
    "Tap the tissue area to keep as reference",
    "local"
  );
}


function phaseRConsumeReferencePick(event) {
  if (
    !phaseRState.picking
    || !phaseRState.open
    || !currentImage
    || !viewer?.world
      ?.getItemCount?.()
  ) {
    return false;
  }

  if (
    event.target
      ?.closest?.(
        "#phaseRPanel, .navigator"
      )
  ) {
    return false;
  }

  const viewerPosition =
    viewerPositionFromPointer(event);

  const point =
    phaseGClampedImagePointFromViewerPosition(
      viewerPosition
    );

  if (!point) {
    return false;
  }

  stopPointerEvent(event);

  phaseRState.center =
    point;

  phaseRState.picking =
    false;

  phaseRSaveCenter();
  phaseRUpdateLabels();
  phaseRQueueSync();

  setStatus(
    "Reference area fixed · zoom will follow the main viewer",
    "saved"
  );

  return true;
}


function phaseRInstallDrag() {
  const refs =
    phaseRRefs();

  if (!refs.panel || !refs.header) {
    return;
  }

  let drag = null;

  refs.header.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.target
          ?.closest?.("button")
      ) {
        return;
      }

      const rect =
        refs.panel
          .getBoundingClientRect();

      drag = {
        pointerId:
          event.pointerId,
        dx:
          event.clientX
          - rect.left,
        dy:
          event.clientY
          - rect.top,
      };

      try {
        refs.header
          .setPointerCapture(
            event.pointerId
          );
      } catch (_) {}

      event.preventDefault();
    }
  );

  refs.header.addEventListener(
    "pointermove",
    (event) => {
      if (
        !drag
        || drag.pointerId
          !== event.pointerId
      ) {
        return;
      }

      refs.panel.style.left =
        `${
          event.clientX
          - drag.dx
        }px`;

      refs.panel.style.top =
        `${
          event.clientY
          - drag.dy
        }px`;

      refs.panel.style.right =
        "auto";

      phaseRClampWindow();
      event.preventDefault();
    }
  );

  const finish = (event) => {
    if (
      !drag
      || drag.pointerId
        !== event.pointerId
    ) {
      return;
    }

    drag = null;
    phaseRClampWindow();
    phaseRSavePosition();
  };

  refs.header.addEventListener(
    "pointerup",
    finish
  );

  refs.header.addEventListener(
    "pointercancel",
    finish
  );
}


function phaseREnsureUi() {
  if (
    document.getElementById(
      "phaseRPanel"
    )
  ) {
    return;
  }

  const settings =
    document.getElementById(
      "phaseBSettingsPanel"
    );

  if (!settings) return;

  const menu =
    document.createElement(
      "button"
    );

  menu.id =
    "phaseRMenuButton";

  menu.type =
    "button";

  menu.className =
    "menu-item";

  menu.textContent =
    "Reference view…";

  const anchor =
    document.getElementById(
      "phaseIL1MenuButton"
    )
    || document.getElementById(
      "phaseGDuplicateAnnotationButton"
    );

  if (anchor) {
    anchor.insertAdjacentElement(
      "afterend",
      menu
    );
  } else {
    settings.append(menu);
  }

  const panel =
    document.createElement(
      "section"
    );

  panel.id =
    "phaseRPanel";

  panel.className =
    "phase-r-panel";

  panel.hidden = true;

  panel.innerHTML = `
    <div id="phaseRHeader"
         class="phase-r-header">
      <div class="phase-r-title">
        <strong>Reference</strong>
        <small id="phaseRZoom">
          Zoom matched
        </small>
      </div>

      <div class="phase-r-header-actions">
        <button id="phaseRCollapseButton"
                type="button"
                title="Collapse reference view">—</button>
        <button id="phaseRCloseButton"
                type="button"
                title="Close reference view">×</button>
      </div>
    </div>

    <div id="phaseRContent"
         class="phase-r-content">
      <div class="phase-r-viewer-wrap">
        <div id="phaseRViewer"></div>
        <div class="phase-r-crosshair"
             aria-hidden="true"></div>
        <div id="phaseRMessage"
             class="phase-r-message"
             hidden></div>
      </div>

      <div class="phase-r-footer">
        <span id="phaseRPosition">
          No reference selected
        </span>
        <button id="phaseRPickButton"
                type="button">
          Pick reference
        </button>
      </div>
    </div>
  `;

  document.body.append(panel);

  const saved =
    phaseRLoadSavedPosition();

  if (saved) {
    panel.style.left =
      `${saved.left}px`;

    panel.style.top =
      `${saved.top}px`;

    panel.style.right =
      "auto";
  }

  phaseRCreateViewer();
  phaseRInstallDrag();

  menu.addEventListener(
    "click",
    () =>
      phaseRSetOpen(true)
  );

  phaseRRefs()
    .pick
    ?.addEventListener(
      "click",
      phaseRBeginPick
    );

  phaseRRefs()
    .collapse
    ?.addEventListener(
      "click",
      () =>
        phaseRSetCollapsed(
          !phaseRState.collapsed
        )
    );

  phaseRRefs()
    .close
    ?.addEventListener(
      "click",
      () =>
        phaseRSetOpen(false)
    );
}


function phaseRInitialize() {
  phaseUXEnsureFocusPathologistActions();
  phaseREnsureUi();

  if (!viewer) return;

  viewer.addHandler(
    "open",
    () => {
      if (phaseRState.open) {
        phaseROpenCurrentSource();
      }
    }
  );

  viewer.addHandler(
    "close",
    () => {
      if (
        phaseRState.open
        && phaseRViewer
      ) {
        phaseRViewer.close();
      }
    }
  );

  for (
    const eventName
    of [
      "animation",
      "update-viewport",
      "resize",
    ]
  ) {
    viewer.addHandler(
      eventName,
      phaseRQueueSync
    );
  }

  window.addEventListener(
    "resize",
    () => {
      phaseRClampWindow();
      phaseRQueueSync();
    }
  );

  phaseRUpdateLabels();
}


// Phase IL1 — interactive learning foundation
//
