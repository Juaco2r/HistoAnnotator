// ============================================================================
// HistoAnnotator Image Manager v1
//
// Administrative operations are unlocked with a server-validated shared key.
// The key remains in memory only and is never stored in localStorage.
//
// Rename is intentionally a DISPLAY NAME alias. The physical file path and
// image ID remain stable so level-0 coordinates, annotations, and reports keep
// their existing identity.
// ============================================================================

const phaseImageManagerAliases =
  new Map();

let phaseImageManagerAdminKey =
  "";

let phaseImageManagerCatalog =
  [];


function phaseImageManagerDisplayPath(
  image
) {
  const alias =
    phaseImageManagerAliases.get(
      String(image?.id || "")
    );

  return (
    alias
    || image?.relativePath
    || image?.name
    || "Image"
  );
}


async function phaseImageManagerRefreshAliases() {
  phaseImageManagerAliases.clear();

  if (!API) {
    return;
  }

  try {
    const response =
      await apiFetch(
        `${API}/image-manager/aliases`,
        {
          timeoutMs: 8000,
        }
      );

    const payload =
      await response.json();

    const aliases =
      payload?.aliases
      && typeof payload.aliases === "object"
        ? payload.aliases
        : {};

    for (
      const [imageId, value]
      of Object.entries(aliases)
    ) {
      const cleaned =
        String(value || "")
          .trim();

      if (cleaned) {
        phaseImageManagerAliases.set(
          String(imageId),
          cleaned
        );
      }
    }

  } catch (error) {
    console.warn(
      "Could not load image aliases",
      error
    );
  }
}


function phaseImageManagerApplyAliasesToPicker() {
  if (
    !els?.imageSelect
    || !Array.isArray(images)
  ) {
    return;
  }

  const imageById =
    new Map(
      images.map(
        (image) => [
          String(image?.id || ""),
          image,
        ]
      )
    );

  for (
    const option
    of Array.from(
      els.imageSelect.options
      || []
    )
  ) {
    const imageId =
      String(
        option.value
        || ""
      );

    if (!imageId) {
      continue;
    }

    const alias =
      phaseImageManagerAliases.get(
        imageId
      );

    const image =
      imageById.get(
        imageId
      );

    const originalLabel =
      String(
        image?.relativePath
        || image?.name
        || ""
      );

    if (
      alias
      && originalLabel
      && option.textContent
        ?.includes(
          originalLabel
        )
    ) {
      option.textContent =
        option.textContent.replace(
          originalLabel,
          alias
        );
    }
  }
}


const phaseImageManagerOriginalLoadImages =
  loadImages;

loadImages =
  async function phaseImageManagerLoadImages(
    preserveSelection = true
  ) {
    await phaseImageManagerRefreshAliases();

    const result =
      await phaseImageManagerOriginalLoadImages(
        preserveSelection
      );

    phaseImageManagerApplyAliasesToPicker();

    return result;
  };


async function phaseImageManagerJsonRequest(
  action,
  payload = {},
  timeoutMs = 30000
) {
  if (!API) {
    throw new Error(
      "No HistoAnnotator server is configured"
    );
  }

  const response =
    await apiFetch(
      `${API}/image-manager/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          key:
            phaseImageManagerAdminKey,
          ...payload,
        }),
        timeoutMs,
      }
    );

  const data =
    await response.json();

  if (
    response?.ok === false
  ) {
    throw new Error(
      data?.detail
      || `Image Manager request failed (${response.status})`
    );
  }

  return data;
}


function phaseImageManagerEnsureStyle() {
  if (
    document.getElementById(
      "phaseImageManagerStyle"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "phaseImageManagerStyle";

  style.textContent = `
    .phase-image-manager-card {
      width: min(980px, calc(100vw - 24px));
      max-width: 980px;
    }

    .phase-image-manager-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 10px 0;
    }

    .phase-image-manager-status {
      min-height: 1.4em;
      margin: 8px 0;
    }

    .phase-image-manager-list {
      display: grid;
      gap: 8px;
      max-height: min(58vh, 620px);
      overflow: auto;
      padding: 4px;
    }

    .phase-image-manager-row {
      display: grid;
      grid-template-columns: auto minmax(220px, 1fr) minmax(190px, .75fr) auto;
      gap: 10px;
      align-items: center;
      padding: 10px;
      border: 1px solid rgba(127,127,127,.35);
      border-radius: 8px;
    }

    .phase-image-manager-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .phase-image-manager-copy strong,
    .phase-image-manager-copy small {
      overflow-wrap: anywhere;
    }

    .phase-image-manager-row input[type="text"] {
      min-width: 0;
      width: 100%;
    }

    .phase-image-manager-lock {
      display: grid;
      gap: 10px;
      max-width: 420px;
    }

    .phase-image-manager-lock input {
      width: 100%;
    }

    @media (max-width: 720px) {
      .phase-image-manager-row {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .phase-image-manager-row input[type="text"],
      .phase-image-manager-row button {
        grid-column: 2;
      }
    }
  `;

  document.head.append(
    style
  );
}


function phaseImageManagerEnsureUi() {
  phaseImageManagerEnsureStyle();

  if (
    !document.getElementById(
      "phaseImageManagerOverlay"
    )
  ) {
    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.innerHTML = `
      <div id="phaseImageManagerOverlay"
           class="modal-overlay"
           hidden>
        <section class="modal-card phase-image-manager-card"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="phaseImageManagerTitle">
          <div class="phase-report-header">
            <div>
              <h2 id="phaseImageManagerTitle">Image Manager</h2>
              <p class="modal-note">
                Add multiple images, organize display names, remove images,
                and download one ZIP containing originals, annotations,
                and server-synced reports.
              </p>
            </div>
            <button id="phaseImageManagerClose"
                    type="button">
              Close
            </button>
          </div>

          <div id="phaseImageManagerLocked"
               class="phase-image-manager-lock">
            <label>
              <span>Administrator key</span>
              <input id="phaseImageManagerKey"
                     type="password"
                     autocomplete="off"
                     inputmode="numeric">
            </label>

            <button id="phaseImageManagerUnlock"
                    type="button">
              Unlock Image Manager
            </button>
          </div>

          <div id="phaseImageManagerUnlocked"
               hidden>
            <div class="phase-image-manager-toolbar">
              <label class="small-button">
                ＋ Add images
                <input id="phaseImageManagerUpload"
                       type="file"
                       multiple
                       hidden
                       accept=".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.svs,.ndpi,.scn,.mrxs,.vms,.vmu,.bif">
              </label>

              <button id="phaseImageManagerSelectAll"
                      type="button">
                Select all
              </button>

              <button id="phaseImageManagerSelectNone"
                      type="button">
                Select none
              </button>

              <button id="phaseImageManagerDelete"
                      class="danger-action"
                      type="button">
                Delete selected
              </button>

              <button id="phaseImageManagerExport"
                      type="button">
                ⇩ Download all data
              </button>

              <button id="phaseImageManagerRefresh"
                      type="button">
                ↻ Refresh
              </button>
            </div>

            <p id="phaseImageManagerStatus"
               class="phase-image-manager-status modal-note"></p>

            <div id="phaseImageManagerList"
                 class="phase-image-manager-list"></div>
          </div>
        </section>
      </div>
    `;

    document.body.append(
      wrapper.firstElementChild
    );
  }

  const grid =
    document.querySelector(
      ".phase-additional-tools-grid"
    );

  if (
    grid
    && !document.getElementById(
      "phaseAdditionalImageManagerButton"
    )
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.id =
      "phaseAdditionalImageManagerButton";

    button.className =
      "phase-additional-tool";

    button.type =
      "button";

    button.innerHTML = `
      <span class="phase-additional-tool-icon">🗂</span>
      <span class="phase-additional-tool-label">Image Manager</span>
    `;

    grid.append(
      button
    );
  }
}


function phaseImageManagerSetStatus(
  text,
  state = ""
) {
  const element =
    document.getElementById(
      "phaseImageManagerStatus"
    );

  if (!element) {
    return;
  }

  element.textContent =
    text || "";

  element.dataset.state =
    state;
}


async function phaseImageManagerLoadCatalog() {
  phaseImageManagerSetStatus(
    "Loading images…",
    "local"
  );

  const payload =
    await phaseImageManagerJsonRequest(
      "catalog"
    );

  phaseImageManagerCatalog =
    Array.isArray(payload?.images)
      ? payload.images
      : [];

  phaseImageManagerRenderCatalog();

  phaseImageManagerSetStatus(
    `${phaseImageManagerCatalog.length} image${
      phaseImageManagerCatalog.length === 1
        ? ""
        : "s"
    } · ${
      payload?.writable
        ? "repository writable"
        : "repository is read-only"
    }`,
    payload?.writable
      ? "saved"
      : "error"
  );

  return payload;
}


function phaseImageManagerSelectedIds() {
  return Array.from(
    document.querySelectorAll(
      "#phaseImageManagerList input[data-image-manager-select]:checked"
    )
  ).map(
    (element) =>
      String(
        element.dataset.imageId
        || ""
      )
  ).filter(Boolean);
}


function phaseImageManagerRenderCatalog() {
  const list =
    document.getElementById(
      "phaseImageManagerList"
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    "";

  if (
    !phaseImageManagerCatalog.length
  ) {
    const empty =
      document.createElement(
        "p"
      );

    empty.className =
      "modal-note";

    empty.textContent =
      "No images in this server workspace.";

    list.append(
      empty
    );

    return;
  }

  for (
    const image
    of phaseImageManagerCatalog
  ) {
    const row =
      document.createElement(
        "div"
      );

    row.className =
      "phase-image-manager-row";

    const select =
      document.createElement(
        "input"
      );

    select.type =
      "checkbox";

    select.dataset.imageManagerSelect =
      "1";

    select.dataset.imageId =
      String(image.id || "");

    const copy =
      document.createElement(
        "div"
      );

    copy.className =
      "phase-image-manager-copy";

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      image.displayName
      || image.relativePath
      || image.name
      || "Image";

    const meta =
      document.createElement(
        "small"
      );

    meta.textContent =
      `${
        image.relativePath || ""
      } · ${
        typeof formatBytes === "function"
          ? formatBytes(
              Number(
                image.sizeBytes
                || 0
              )
            )
          : `${Number(image.sizeBytes || 0)} bytes`
      }`;

    copy.append(
      title,
      meta
    );

    const rename =
      document.createElement(
        "input"
      );

    rename.type =
      "text";

    rename.maxLength =
      180;

    rename.value =
      image.displayName
      || image.relativePath
      || image.name
      || "";

    rename.setAttribute(
      "aria-label",
      `Display name for ${
        image.relativePath || "image"
      }`
    );

    const saveName =
      document.createElement(
        "button"
      );

    saveName.type =
      "button";

    saveName.textContent =
      "Save name";

    saveName.addEventListener(
      "click",
      async () => {
        saveName.disabled =
          true;

        try {
          phaseImageManagerSetStatus(
            "Saving image name…",
            "local"
          );

          await phaseImageManagerJsonRequest(
            "rename",
            {
              imageId:
                image.id,
              name:
                rename.value,
            }
          );

          await phaseImageManagerRefreshAliases();

          await loadImages(
            true
          );

          await phaseImageManagerLoadCatalog();

          setStatus(
            "Image display name updated",
            "saved"
          );

        } catch (error) {
          phaseImageManagerSetStatus(
            `Could not rename image: ${error.message}`,
            "error"
          );

        } finally {
          saveName.disabled =
            false;
        }
      }
    );

    row.append(
      select,
      copy,
      rename,
      saveName
    );

    list.append(
      row
    );
  }
}


async function phaseImageManagerUnlock() {
  const input =
    document.getElementById(
      "phaseImageManagerKey"
    );

  const key =
    String(
      input?.value
      || ""
    );

  if (!key) {
    phaseImageManagerSetStatus(
      "Enter the administrator key",
      "error"
    );

    return;
  }

  phaseImageManagerAdminKey =
    key;

  try {
    await phaseImageManagerJsonRequest(
      "unlock"
    );

    document.getElementById(
      "phaseImageManagerLocked"
    ).hidden =
      true;

    document.getElementById(
      "phaseImageManagerUnlocked"
    ).hidden =
      false;

    await phaseImageManagerLoadCatalog();

  } catch (error) {
    phaseImageManagerAdminKey =
      "";

    phaseImageManagerSetStatus(
      error.message
      || "Could not unlock Image Manager",
      "error"
    );

    setStatus(
      "Image Manager key rejected",
      "error"
    );
  }
}


async function phaseImageManagerUploadFiles(
  fileList
) {
  const files =
    Array.from(
      fileList
      || []
    );

  if (!files.length) {
    return;
  }

  for (
    let index = 0;
    index < files.length;
    index += 1
  ) {
    const file =
      files[index];

    phaseImageManagerSetStatus(
      `Uploading ${index + 1}/${files.length}: ${file.name}`,
      "local"
    );

    await Promise.resolve(
      uploadImage(
        file
      )
    );
  }

  await loadImages(
    false
  );

  await phaseImageManagerLoadCatalog();

  phaseImageManagerSetStatus(
    `${files.length} image${
      files.length === 1
        ? ""
        : "s"
    } uploaded`,
    "saved"
  );
}


async function phaseImageManagerDeleteSelected() {
  const ids =
    phaseImageManagerSelectedIds();

  if (!ids.length) {
    phaseImageManagerSetStatus(
      "Select at least one image",
      "error"
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Delete ${ids.length} selected image${
        ids.length === 1 ? "" : "s"
      }?\n\n`
      + "The original image files will be moved to recoverable server trash. "
      + "Annotations and reports are retained."
    );

  if (!confirmed) {
    return;
  }

  phaseImageManagerSetStatus(
    "Removing selected images…",
    "local"
  );

  const deletingCurrent =
    Boolean(
      currentImage?.id
      && ids.includes(
        currentImage.id
      )
    );

  await phaseImageManagerJsonRequest(
    "delete",
    {
      imageIds:
        ids,
    },
    120000
  );

  if (
    deletingCurrent
  ) {
    try {
      viewer?.close?.();
    } catch (_) {
      // Best effort.
    }

    currentImage =
      null;

    currentInfo =
      null;

    if (els.emptyMessage) {
      els.emptyMessage.hidden =
        false;

      els.emptyMessage.textContent =
        "Select an image";
    }
  }

  await loadImages(
    false
  );

  await phaseImageManagerLoadCatalog();

  phaseImageManagerSetStatus(
    `${ids.length} image${
      ids.length === 1
        ? ""
        : "s"
    } moved to server trash`,
    "saved"
  );
}


async function phaseImageManagerSyncReportDocument(
  documentPayload
) {
  if (
    !API
    || !documentPayload?.imageId
  ) {
    return false;
  }

  const annotationFile =
    String(
      documentPayload.annotationFile
      || "Default"
    );

  const response =
    await apiFetch(
      `${API}/reports/${
        encodeURIComponent(
          documentPayload.imageId
        )
      }?file=${
        encodeURIComponent(
          annotationFile
        )
      }`,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            documentPayload
          ),
        timeoutMs: 30000,
      }
    );

  if (
    response?.ok === false
  ) {
    throw new Error(
      `Report sync failed (${response.status})`
    );
  }

  return true;
}


async function phaseImageManagerSyncAllLocalReports() {
  if (
    typeof phaseReportOpenDb
    !== "function"
  ) {
    return 0;
  }

  let db;

  try {
    db =
      await phaseReportOpenDb();
  } catch (_) {
    return 0;
  }

  const reports =
    await new Promise(
      (resolve, reject) => {
        const transaction =
          db.transaction(
            PHASE_REPORT_STORE,
            "readonly"
          );

        const request =
          transaction
            .objectStore(
              PHASE_REPORT_STORE
            )
            .getAll();

        request.onsuccess =
          () =>
            resolve(
              request.result
              || []
            );

        request.onerror =
          () =>
            reject(
              request.error
            );
      }
    );

  let synced =
    0;

  for (
    const report
    of reports
  ) {
    try {
      const ok =
        await phaseImageManagerSyncReportDocument(
          report
        );

      if (ok) {
        synced += 1;
      }
    } catch (error) {
      console.warn(
        "Could not sync one report before export",
        error
      );
    }
  }

  return synced;
}


const phaseImageManagerOriginalReportSave =
  phaseReportSaveDocument;

phaseReportSaveDocument =
  async function phaseImageManagerReportSave() {
    const saved =
      await phaseImageManagerOriginalReportSave();

    if (
      saved
      && phaseReportCurrent?.imageId
      && !currentImage?.localNative
      && API
      && navigator.onLine
    ) {
      void phaseImageManagerSyncReportDocument(
        phaseReportCurrent
      ).catch(
        (error) => {
          console.warn(
            "Server report sync deferred",
            error
          );
        }
      );
    }

    return saved;
  };


async function phaseImageManagerExportAll() {
  phaseImageManagerSetStatus(
    "Synchronizing local reports…",
    "local"
  );

  await phaseImageManagerSyncAllLocalReports();

  phaseImageManagerSetStatus(
    "Building ZIP on the server. Large image collections may take several minutes…",
    "local"
  );

  const response =
    await apiFetch(
      `${API}/image-manager/export`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          key:
            phaseImageManagerAdminKey,
        }),
        timeoutMs:
          30 * 60 * 1000,
      }
    );

  if (
    response?.ok === false
  ) {
    let detail =
      "";

    try {
      const payload =
        await response.json();

      detail =
        payload?.detail
        || "";
    } catch (_) {
      // Ignore.
    }

    throw new Error(
      detail
      || `Could not export data (${response.status})`
    );
  }

  const blob =
    typeof response.blob === "function"
      ? await response.blob()
      : new Blob(
          [
            await response.arrayBuffer(),
          ],
          {
            type:
              "application/zip",
          }
        );

  const header =
    response.headers
      ?.get?.(
        "content-disposition"
      )
    || "";

  const match =
    header.match(
      /filename="?([^";]+)"?/i
    );

  const filename =
    match?.[1]
    || `histoannotator-data-${Date.now()}.zip`;

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    filename;

  document.body.append(
    link
  );

  link.click();
  link.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );

  phaseImageManagerSetStatus(
    "Complete data ZIP downloaded",
    "saved"
  );
}


async function phaseImageManagerOpen() {
  if (
    typeof toggleFileMenu
    === "function"
  ) {
    toggleFileMenu(
      false
    );
  }

  phaseImageManagerEnsureUi();

  const overlay =
    document.getElementById(
      "phaseImageManagerOverlay"
    );

  if (overlay) {
    overlay.hidden =
      false;
  }

  if (
    phaseImageManagerAdminKey
  ) {
    document.getElementById(
      "phaseImageManagerLocked"
    ).hidden =
      true;

    document.getElementById(
      "phaseImageManagerUnlocked"
    ).hidden =
      false;

    try {
      await phaseImageManagerLoadCatalog();
    } catch (error) {
      phaseImageManagerAdminKey =
        "";

      document.getElementById(
        "phaseImageManagerLocked"
      ).hidden =
        false;

      document.getElementById(
        "phaseImageManagerUnlocked"
      ).hidden =
        true;

      phaseImageManagerSetStatus(
        error.message,
        "error"
      );
    }
  }
}


function phaseImageManagerClose() {
  const overlay =
    document.getElementById(
      "phaseImageManagerOverlay"
    );

  if (overlay) {
    overlay.hidden =
      true;
  }
}


function phaseImageManagerInitialize() {
  phaseImageManagerEnsureUi();

  const legacyUpload =
    els.uploadInput
      ?.closest(
        ".file-input-label"
      );

  if (legacyUpload) {
    legacyUpload.hidden =
      true;
  }

  document.getElementById(
    "phaseAdditionalImageManagerButton"
  )?.addEventListener(
    "click",
    () => {
      void phaseImageManagerOpen();
    }
  );

  document.getElementById(
    "phaseImageManagerClose"
  )?.addEventListener(
    "click",
    phaseImageManagerClose
  );

  document.getElementById(
    "phaseImageManagerUnlock"
  )?.addEventListener(
    "click",
    () => {
      void phaseImageManagerUnlock();
    }
  );

  document.getElementById(
    "phaseImageManagerKey"
  )?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        void phaseImageManagerUnlock();
      }
    }
  );

  document.getElementById(
    "phaseImageManagerRefresh"
  )?.addEventListener(
    "click",
    () => {
      void phaseImageManagerLoadCatalog();
    }
  );

  document.getElementById(
    "phaseImageManagerUpload"
  )?.addEventListener(
    "change",
    (event) => {
      const input =
        event.currentTarget;

      void phaseImageManagerUploadFiles(
        input?.files
      ).catch(
        (error) => {
          phaseImageManagerSetStatus(
            `Upload failed: ${error.message}`,
            "error"
          );
        }
      ).finally(
        () => {
          if (input) {
            input.value =
              "";
          }
        }
      );
    }
  );

  document.getElementById(
    "phaseImageManagerSelectAll"
  )?.addEventListener(
    "click",
    () => {
      document.querySelectorAll(
        "#phaseImageManagerList input[data-image-manager-select]"
      ).forEach(
        (element) => {
          element.checked =
            true;
        }
      );
    }
  );

  document.getElementById(
    "phaseImageManagerSelectNone"
  )?.addEventListener(
    "click",
    () => {
      document.querySelectorAll(
        "#phaseImageManagerList input[data-image-manager-select]"
      ).forEach(
        (element) => {
          element.checked =
            false;
        }
      );
    }
  );

  document.getElementById(
    "phaseImageManagerDelete"
  )?.addEventListener(
    "click",
    () => {
      void phaseImageManagerDeleteSelected()
        .catch(
          (error) => {
            phaseImageManagerSetStatus(
              `Could not delete images: ${error.message}`,
              "error"
            );
          }
        );
    }
  );

  document.getElementById(
    "phaseImageManagerExport"
  )?.addEventListener(
    "click",
    () => {
      void phaseImageManagerExportAll()
        .catch(
          (error) => {
            phaseImageManagerSetStatus(
              `Could not export data: ${error.message}`,
              "error"
            );
          }
        );
    }
  );

  document.getElementById(
    "phaseImageManagerOverlay"
  )?.addEventListener(
    "click",
    (event) => {
      if (
        event.target?.id
        === "phaseImageManagerOverlay"
      ) {
        phaseImageManagerClose();
      }
    }
  );
}


phaseImageManagerInitialize();
