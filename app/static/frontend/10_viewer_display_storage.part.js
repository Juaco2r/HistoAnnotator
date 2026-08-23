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

      phaseF24AttachProtocolSnapshot(
        roi,
        "tissue-roi"
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

    updatePathologistActions();

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
    const strokeActive =
      activeDraft?.type
      === "freehand-pathologist"
      || Boolean(pointerState);

    const active =
      drawingProfile === "pathologist"
      && mode === "freehand"
      && Boolean(pathologistDraft)
      && !strokeActive;

    const focusActions =
      document.getElementById(
        "phaseUXFocusPathologistActions"
      );

    els.pathologistActions.hidden =
      !active
      || phaseBFocusActive;

    if (focusActions) {
      focusActions.hidden =
        !active
        || !phaseBFocusActive;
    }

    if (!active) return;

    const canComplete =
      (
        pathologistDraft.outer?.length
        || 0
      ) >= 3
      && !geometryBusy;

    const canAddInner =
      (
        pathologistDraft.outer?.length
        || 0
      ) >= 3
      && !geometryBusy;

    els.finishPathologistContour.disabled =
      !canComplete;

    els.addPathologistHole.disabled =
      !canAddInner;

    els.cancelPathologistContour.disabled =
      geometryBusy;

    els.addPathologistHole.textContent =
      pathologistDraft.current === "hole"
        ? "○ New inner contour"
        : "○ Inner contour";

    const focusComplete =
      document.getElementById(
        "phaseUXFocusPathologistComplete"
      );

    const focusInner =
      document.getElementById(
        "phaseUXFocusPathologistInner"
      );

    const focusCancel =
      document.getElementById(
        "phaseUXFocusPathologistCancel"
      );

    if (focusComplete) {
      focusComplete.disabled =
        !canComplete;
    }

    if (focusInner) {
      focusInner.disabled =
        !canAddInner;

      focusInner.textContent =
        pathologistDraft.current === "hole"
          ? "New inner"
          : "Inner area";
    }

    if (focusCancel) {
      focusCancel.disabled =
        geometryBusy;
    }
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

    if (
      phaseRConsumeReferencePick(
        event
      )
    ) {
      updateDiagnostics();
      return;
    }

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
      phaseF26ScheduleDraw();
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
    phaseF26ScheduleDraw();
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
          timeoutMs: 30000,

          // F1.10: packed MultiPolygon selection can be much heavier than
          // ordinary annotation selection.
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

      const feature = createAnnotationFeature(geometry);
      phaseF261PushCreatedFeatureUndo(
        feature,
        featureCollection.features.length
      );
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

    const entry = undoStack.pop();

    if (phaseF261IsCreatedUndoEntry(entry)) {
      phaseF261UndoCreatedFeature(entry);
      updateControls();
      return;
    }

    redoStack.push(
      deepClone(featureCollection.features)
    );
    featureCollection.features = entry;
    clearSelectedFeatures(false);
    markChanged();
  }

  function redo() {
    if (!redoStack.length) return;

    phaseCCaptureSemanticBaseline();

    const entry = redoStack.pop();

    if (phaseF261IsCreatedUndoEntry(entry)) {
      phaseF261RedoCreatedFeature(entry);
      updateControls();
      return;
    }

    undoStack.push(
      deepClone(featureCollection.features)
    );
    featureCollection.features = entry;
    clearSelectedFeatures(false);
    markChanged();
  }

  function markChanged() {
    phaseF26InvalidateGeometryCaches();
    phaseIL1AnnotationsChanged();
    phaseDSyncArtifactRoles();
    phaseCApplySemanticChanges();
    if (!currentImage) return;

    dirty = true;
    const image = currentImage;
    const annotationFile = currentAnnotationFile;
    const payload = phaseF261FastClone(featureCollection);
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
    const payload = phaseF261FastClone(featureCollection);
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
    if (els.hdabQuantButton) els.hdabQuantButton.disabled = !enabled || !currentImage || !currentInfo || imageType !== "hdab" || Boolean(currentImage?.localNative);
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
    if (typeof phaseEvalAnnotationFileChanged === "function") {
      void phaseEvalAnnotationFileChanged();
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
    const classification =
      feature.properties
        ?.classification;

    const name =
      classification?.name;

    const known =
      classes.find(
        (item) =>
          item.name === name
      );

    /*
     * The current class definition is authoritative for display.
     * Older Features may still contain the historical RGB value that was
     * active when they were created, but they should visually follow the
     * class color selected by the user today.
     */
    return known?.color
      || rgbArrayToHex(
          classification?.color
        )
      || colorRgbIntegerToHex(
          classification?.colorRGB
        )
      || feature.properties
        ?.histoannotator
        ?.color
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

  // ======================================================================
