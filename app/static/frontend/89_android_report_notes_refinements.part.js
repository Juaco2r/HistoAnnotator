// ========================================================================
// Android Report / Notes refinements v2
//
// - Report Typed textarea exposes Android IME handwriting-to-text attributes.
// - Handwritten per-item notes appear in summary cards.
// - Report/Notes native file actions mirror the proven GeoJSON path:
//     Filesystem.writeFile(... directory:"CACHE")
//     Share.share({ files:[written.uri] })
// - In native Android, "Download/Export" opens a Save-or-Share chooser because
//   HTML <a download> is not reliable inside the WebView.
// ========================================================================


// ------------------------------------------------------------------------
// Android IME / handwriting-to-text compatibility for Typed fields.
// ------------------------------------------------------------------------

function phaseAndroidRnPrepareTextField(element) {
  if (!element) {
    return;
  }

  element.setAttribute("inputmode", "text");
  element.setAttribute("autocapitalize", "sentences");
  element.setAttribute("spellcheck", "true");
  element.setAttribute("enterkeyhint", "enter");
  element.style.touchAction = "manipulation";
}


function phaseAndroidRnPrepareTypedFields() {
  phaseAndroidRnPrepareTextField(
    document.getElementById(
      "phaseReportNote"
    )
  );

  phaseAndroidRnPrepareTextField(
    document.getElementById(
      "phaseNotesTypedText"
    )
  );

  phaseAndroidRnPrepareTextField(
    document.getElementById(
      "phaseNotesCaptureCaption"
    )
  );
}


phaseAndroidRnPrepareTypedFields();


const phaseAndroidRnBaseReportOpenEditor =
  phaseReportOpenEditor;

phaseReportOpenEditor =
  async function phaseAndroidRnReportOpenEditor(
    entryId
  ) {
    const result =
      await phaseAndroidRnBaseReportOpenEditor(
        entryId
      );

    phaseAndroidRnPrepareTextField(
      document.getElementById(
        "phaseReportNote"
      )
    );

    return result;
  };


const phaseAndroidRnBaseSetCaptureNoteMode =
  phaseCaptureNoteSetMode;

phaseCaptureNoteSetMode =
  function phaseAndroidRnSetCaptureNoteMode(
    kind,
    mode
  ) {
    const result =
      phaseAndroidRnBaseSetCaptureNoteMode(
        kind,
        mode
      );

    if (mode === "typed") {
      phaseAndroidRnPrepareTextField(
        kind === "report"
          ? document.getElementById(
              "phaseReportNote"
            )
          : document.getElementById(
              "phaseNotesCaptureCaption"
            )
      );
    }

    return result;
  };


// ------------------------------------------------------------------------
// Handwritten previews in Report Builder and Notes main item cards.
// ------------------------------------------------------------------------

function phaseAndroidRnHandPreview(owner) {
  const rendered =
    phaseCaptureNoteDataUrl(
      owner
    );

  if (!rendered) {
    return null;
  }

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    "phase-rn-hand-summary";

  const label =
    document.createElement(
      "div"
    );

  label.className =
    "phase-rn-hand-summary-label";

  label.textContent =
    "Handwritten note";

  const image =
    document.createElement(
      "img"
    );

  image.className =
    "phase-rn-hand-summary-image";

  image.src =
    rendered.dataUrl;

  image.alt =
    "Handwritten note preview";

  wrapper.append(
    label,
    image
  );

  return wrapper;
}


const phaseAndroidRnBaseReportRenderEntries =
  phaseReportRenderEntries;

phaseReportRenderEntries =
  function phaseAndroidRnReportRenderEntries() {
    const result =
      phaseAndroidRnBaseReportRenderEntries();

    const entries =
      phaseReportCurrent
        ?.entries
      || [];

    const cards =
      Array.from(
        document.querySelectorAll(
          "#phaseReportEntries .phase-report-entry"
        )
      );

    cards.forEach(
      (card, index) => {
        const entry =
          entries[index];

        if (!entry) {
          return;
        }

        const content =
          card.querySelector(
            ".phase-report-entry-content"
          );

        if (!content) {
          return;
        }

        content.querySelector(
          ".phase-rn-hand-summary"
        )?.remove();

        const preview =
          phaseAndroidRnHandPreview(
            entry
          );

        if (!preview) {
          return;
        }

        const typedNote =
          content.querySelector(
            ".phase-report-entry-note"
          );

        if (
          typedNote
          && !String(
            entry.note || ""
          ).trim()
        ) {
          typedNote.textContent =
            "Handwritten note";
        }

        const coordinates =
          content.querySelector(
            ".phase-report-entry-coordinates"
          );

        if (coordinates) {
          coordinates.insertAdjacentElement(
            "beforebegin",
            preview
          );
        } else {
          content.prepend(
            preview
          );
        }
      }
    );

    return result;
  };


const phaseAndroidRnBaseNotesRenderCaptures =
  phaseNotesRenderCaptures;

phaseNotesRenderCaptures =
  function phaseAndroidRnNotesRenderCaptures() {
    const result =
      phaseAndroidRnBaseNotesRenderCaptures();

    const captures =
      phaseNotesCurrentTopic()
        ?.captures
      || [];

    const cards =
      Array.from(
        document.querySelectorAll(
          "#phaseNotesCaptureList .phase-notes-capture-card"
        )
      );

    cards.forEach(
      (card, index) => {
        const capture =
          captures[index];

        if (!capture) {
          return;
        }

        const info =
          card.querySelector(
            ".phase-notes-capture-info"
          );

        if (!info) {
          return;
        }

        info.querySelector(
          ".phase-rn-hand-summary"
        )?.remove();

        const preview =
          phaseAndroidRnHandPreview(
            capture
          );

        if (!preview) {
          return;
        }

        const editButton =
          Array.from(
            info.querySelectorAll(
              "button"
            )
          ).find(
            (button) =>
              String(
                button.textContent || ""
              ).trim() === "Edit"
          );

        if (editButton) {
          editButton.insertAdjacentElement(
            "beforebegin",
            preview
          );
        } else {
          info.append(preview);
        }
      }
    );

    return result;
  };


// ------------------------------------------------------------------------
// Artifact helpers.
// ------------------------------------------------------------------------

function phaseAndroidRnSafeFilename(filename) {
  return String(
    filename
    || "HistoAnnotator-export.rtf"
  ).replace(
    /[^a-zA-Z0-9._-]+/g,
    "_"
  );
}


async function phaseAndroidRnBlobBase64(blob) {
  const dataUrl =
    await new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload =
          () =>
            resolve(
              String(
                reader.result || ""
              )
            );

        reader.onerror =
          () =>
            reject(
              reader.error
              || new Error(
                "Could not encode export file"
              )
            );

        reader.readAsDataURL(
          blob
        );
      }
    );

  const comma =
    dataUrl.indexOf(",");

  if (comma < 0) {
    throw new Error(
      "Could not encode export file"
    );
  }

  // Capacitor Filesystem expects base64 when no encoding is supplied.
  return dataUrl.slice(
    comma + 1
  );
}


function phaseAndroidRnPlugins() {
  return (
    window.Capacitor
      ?.Plugins
    || {}
  );
}


async function phaseAndroidRnNativeShareArtifact(
  artifact,
  dialogTitle
) {
  const plugins =
    phaseAndroidRnPlugins();

  const Filesystem =
    plugins.Filesystem;

  const Share =
    plugins.Share;

  if (
    !IS_NATIVE
    || !Filesystem?.writeFile
    || !Share?.share
  ) {
    return {
      supported: false,
      shared: false,
    };
  }

  const safeFilename =
    phaseAndroidRnSafeFilename(
      artifact.filename
    );

  const data =
    await phaseAndroidRnBlobBase64(
      artifact.blob
    );

  // Deliberately mirrors shareGeoJson(), which is already proven in this APK.
  const written =
    await Filesystem.writeFile({
      path:
        `exports/${safeFilename}`,
      data,
      directory:
        "CACHE",
      recursive:
        true,
    });

  if (!written?.uri) {
    throw new Error(
      "Filesystem did not return a shareable URI"
    );
  }

  await Share.share({
    title:
      artifact.title
      || safeFilename,
    text:
      "Exported from HistoAnnotator",
    files: [
      written.uri,
    ],
    dialogTitle:
      dialogTitle
      || "Share HistoAnnotator file",
  });

  return {
    supported: true,
    shared: true,
    uri:
      written.uri,
  };
}


async function phaseAndroidRnBrowserDownload(
  artifact
) {
  const url =
    URL.createObjectURL(
      artifact.blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    phaseAndroidRnSafeFilename(
      artifact.filename
    );

  document.body.append(
    link
  );

  link.click();
  link.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  );
}


async function phaseAndroidRnWebShareOrDownload(
  artifact
) {
  const safeFilename =
    phaseAndroidRnSafeFilename(
      artifact.filename
    );

  const file =
    new File(
      [artifact.blob],
      safeFilename,
      {
        type:
          artifact.blob.type
          || "application/octet-stream",
      }
    );

  try {
    if (
      typeof navigator.share
        === "function"
      && typeof navigator.canShare
        === "function"
      && navigator.canShare({
        files: [file],
      })
    ) {
      await navigator.share({
        title:
          artifact.title
          || safeFilename,
        files: [file],
      });

      return "shared";
    }
  } catch (error) {
    if (
      String(
        error?.name || ""
      ) === "AbortError"
    ) {
      return "cancelled";
    }

    console.warn(
      "Web file share failed",
      error
    );
  }

  await phaseAndroidRnBrowserDownload(
    artifact
  );

  return "downloaded";
}


// Replace the Notes-v1 helper so Report Share and Notes Share both use
// Capacitor before considering navigator.share().
phaseNativeShareFile =
  async function phaseAndroidRnNativeShareFile(
    blob,
    filename,
    title
  ) {
    const artifact = {
      blob,
      filename,
      title,
    };

    if (IS_NATIVE) {
      try {
        const nativeResult =
          await phaseAndroidRnNativeShareArtifact(
            artifact,
            "Share HistoAnnotator file"
          );

        if (
          nativeResult.supported
          && nativeResult.shared
        ) {
          return "shared";
        }

        // Important: do NOT silently trigger an HTML download in Android.
        // It was invisible in the WebView during tablet testing.
        throw new Error(
          "Capacitor Filesystem/Share is unavailable"
        );

      } catch (error) {
        console.error(
          "Native HistoAnnotator share failed",
          error
        );

        setStatus(
          `Native share failed: ${error.message}`,
          "error"
        );

        return "native-error";
      }
    }

    return phaseAndroidRnWebShareOrDownload(
      artifact
    );
  };


// ------------------------------------------------------------------------
// Explicit Report Download/Export.
// Android uses the native chooser because WebView HTML downloads are not
// reliable. The user can select Files/Drive/etc. to save the RTF.
// ------------------------------------------------------------------------

phaseReportExportRtf =
  async function phaseAndroidRnReportExport() {
    try {
      setStatus(
        "Preparing report…",
        "local"
      );

      const artifact =
        await phaseCaptureNoteBuildReportArtifact();

      if (IS_NATIVE) {
        await phaseAndroidRnNativeShareArtifact(
          artifact,
          "Save or share report"
        );

        setStatus(
          "Report ready — choose where to save/share it",
          "saved"
        );

        return;
      }

      await phaseAndroidRnBrowserDownload(
        artifact
      );

      setStatus(
        "Report downloaded",
        "saved"
      );

    } catch (error) {
      console.error(
        "Report export failed",
        error
      );

      setStatus(
        `Could not export report: ${error.message}`,
        "error"
      );
    }
  };


// ------------------------------------------------------------------------
// Notes Download/Share.
// ------------------------------------------------------------------------

phaseNotesExport =
  async function phaseAndroidRnNotesExport(
    share
  ) {
    try {
      const artifact =
        await phaseNotesBuildArtifact();

      if (IS_NATIVE) {
        await phaseAndroidRnNativeShareArtifact(
          artifact,
          share
            ? "Share Notes"
            : "Save or share Notes"
        );

        setStatus(
          share
            ? "Notes ready to share"
            : "Notes ready — choose where to save/share them",
          "saved"
        );

        return;
      }

      if (share) {
        await phaseAndroidRnWebShareOrDownload(
          artifact
        );
      } else {
        await phaseAndroidRnBrowserDownload(
          artifact
        );
      }

    } catch (error) {
      console.error(
        "Notes export/share failed",
        error
      );

      setStatus(
        `Could not export Notes: ${error.message}`,
        "error"
      );
    }
  };


// ------------------------------------------------------------------------
// Native labels: make behavior explicit instead of pretending an HTML
// download exists inside Android WebView.
// ------------------------------------------------------------------------

function phaseAndroidRnUpdateNativeLabels() {
  if (!IS_NATIVE) {
    return;
  }

  const reportExport =
    document.getElementById(
      "phaseReportExportButton"
    );

  if (reportExport) {
    reportExport.textContent =
      "Save / Export";
  }

  const notesDownload =
    document.getElementById(
      "phaseNotesDownloadButton"
    );

  if (notesDownload) {
    notesDownload.textContent =
      "Save…";
  }
}


phaseAndroidRnUpdateNativeLabels();
