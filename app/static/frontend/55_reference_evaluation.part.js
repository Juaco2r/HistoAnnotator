// Reference / Ground Truth Evaluation v1
// File-level analytical role + provenance + class mapping + Dice/IoU metrics.

  const PHASE_EVAL_PRESETS_KEY =
    "histoannotator.evaluationMappings.v1";

  const PHASE_EVAL_ROLES = [
    ["annotation", "Regular annotation"],
    ["ground_truth", "Ground truth"],
    ["model_prediction", "Model prediction"],
    ["consensus", "Consensus"],
    ["reference", "Other reference"],
  ];

  const PHASE_EVAL_SOURCES = [
    ["manual", "Manual / unspecified"],
    ["pathologist", "Pathologist"],
    ["model", "Model"],
    ["external", "External dataset/tool"],
    ["mixed", "Mixed / consensus"],
  ];

  let phaseEvalMetadataSequence = 0;
  let phaseEvalCandidateInfo = null;
  let phaseEvalReferenceInfo = null;
  let phaseEvalLastResult = null;

  function phaseEvalRefs() {
    const byId = (id) => document.getElementById(id);
    return {
      role: byId("annotationFileRoleSelect"),
      source: byId("annotationFileSourceSelect"),
      evaluateButton: byId("annotationEvaluationButton"),
      overlay: byId("referenceEvaluationModal"),
      candidate: byId("phaseEvalCandidateFile"),
      reference: byId("phaseEvalReferenceFile"),
      load: byId("phaseEvalLoadMappingButton"),
      run: byId("phaseEvalRunButton"),
      close: byId("phaseEvalCloseButton"),
      candidateMap: byId("phaseEvalCandidateMapping"),
      referenceMap: byId("phaseEvalReferenceMapping"),
      status: byId("phaseEvalStatus"),
      results: byId("phaseEvalResults"),
      preset: byId("phaseEvalPresetSelect"),
      presetSave: byId("phaseEvalSavePresetButton"),
      presetApply: byId("phaseEvalApplyPresetButton"),
      presetDelete: byId("phaseEvalDeletePresetButton"),
      exportCsv: byId("phaseEvalExportCsvButton"),
    };
  }

  function phaseEvalNormalizeMetadata(value) {
    const roleValues = new Set(
      PHASE_EVAL_ROLES.map((item) => item[0])
    );
    const sourceValues = new Set(
      PHASE_EVAL_SOURCES.map((item) => item[0])
    );

    const rawRole = String(value?.role || "")
      .trim()
      .toLowerCase();
    const rawSource = String(value?.sourceType || "")
      .trim()
      .toLowerCase();

    return {
      schemaVersion: 1,
      role: roleValues.has(rawRole)
        ? rawRole
        : "annotation",
      sourceType: sourceValues.has(rawSource)
        ? rawSource
        : "manual",
    };
  }

  function phaseEvalSuggestedTarget(sourceName, targetNames) {
    const source = String(sourceName || "").trim();
    if (!source) return "";

    const exact = (targetNames || []).find(
      (name) =>
        String(name).trim().toLowerCase()
        === source.toLowerCase()
    );

    return exact ? String(exact) : source;
  }

  function phaseEvalMetadataKey(imageId, annotationFile) {
    return (
      "annotationFileMeta:"
      + String(imageId || "")
      + "::"
      + String(annotationFile || "Default")
    );
  }

  async function phaseEvalLoadFileMetadata(imageId, annotationFile) {
    const file = String(annotationFile || "Default");
    const key = phaseEvalMetadataKey(imageId, file);

    let metadata = phaseEvalNormalizeMetadata(
      await getMeta(key)
    );

    const image = images.find(
      (item) => String(item?.id || "") === String(imageId || "")
    );

    if (
      navigator.onLine
      && API
      && !image?.localNative
    ) {
      try {
        const response = await apiFetch(
          `${API}/annotations/${imageId}/file-meta?file=${encodeURIComponent(file)}`,
          { timeoutMs: 10000 }
        );
        if (response.ok) {
          const payload = await response.json();
          metadata = phaseEvalNormalizeMetadata(payload?.metadata);
          await putMeta(key, metadata);
        }
      } catch (_) {
        // Keep the durable local metadata when the server is unavailable.
      }
    }

    return metadata;
  }

  async function phaseEvalSaveFileMetadata(
    imageId,
    annotationFile,
    metadata
  ) {
    const file = String(annotationFile || "Default");
    const normalized = phaseEvalNormalizeMetadata(metadata);
    const key = phaseEvalMetadataKey(imageId, file);

    await putMeta(key, normalized);

    const image = images.find(
      (item) => String(item?.id || "") === String(imageId || "")
    );

    if (
      navigator.onLine
      && API
      && !image?.localNative
    ) {
      const response = await apiFetch(
        `${API}/annotations/${imageId}/file-meta?file=${encodeURIComponent(file)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalized),
          timeoutMs: 10000,
        }
      );

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          detail = payload.detail || detail;
        } catch (_) {}
        throw new Error(detail);
      }
    }

    return normalized;
  }

  async function phaseEvalAnnotationFileChanged() {
    const refs = phaseEvalRefs();
    const enabled = Boolean(currentImage);

    if (refs.role) refs.role.disabled = !enabled;
    if (refs.source) refs.source.disabled = !enabled;
    if (refs.evaluateButton) refs.evaluateButton.disabled = !enabled;

    if (!enabled) {
      if (refs.role) refs.role.value = "annotation";
      if (refs.source) refs.source.value = "manual";
      return;
    }

    const imageId = String(currentImage.id);
    const file = String(currentAnnotationFile || "Default");
    const sequence = ++phaseEvalMetadataSequence;

    const metadata = await phaseEvalLoadFileMetadata(
      imageId,
      file
    );

    if (
      sequence !== phaseEvalMetadataSequence
      || !currentImage
      || String(currentImage.id) !== imageId
      || String(currentAnnotationFile || "Default") !== file
    ) {
      return;
    }

    if (refs.role) refs.role.value = metadata.role;
    if (refs.source) refs.source.value = metadata.sourceType;
  }

  async function phaseEvalPersistCurrentMetadata() {
    if (!currentImage) return;

    const refs = phaseEvalRefs();

    try {
      const metadata = await phaseEvalSaveFileMetadata(
        currentImage.id,
        currentAnnotationFile,
        {
          role: refs.role?.value || "annotation",
          sourceType: refs.source?.value || "manual",
        }
      );

      if (refs.role) refs.role.value = metadata.role;
      if (refs.source) refs.source.value = metadata.sourceType;

      setStatus(
        `Annotation-file metadata saved · ${currentAnnotationFile}`,
        navigator.onLine ? "saved" : "local"
      );
    } catch (error) {
      setStatus(
        `Metadata saved locally; server sync failed: ${error.message}`,
        "local"
      );
    }
  }

  function phaseEvalRoleLabel(metadata) {
    const normalized = phaseEvalNormalizeMetadata(metadata);

    const role =
      PHASE_EVAL_ROLES.find(
        (item) => item[0] === normalized.role
      )?.[1] || normalized.role;

    const source =
      PHASE_EVAL_SOURCES.find(
        (item) => item[0] === normalized.sourceType
      )?.[1] || normalized.sourceType;

    return `${role} · ${source}`;
  }

  function phaseEvalSetStatus(message, kind = "") {
    const refs = phaseEvalRefs();
    if (!refs.status) return;

    refs.status.hidden = false;
    refs.status.className = "stats-summary";
    refs.status.textContent = String(message || "");
    if (kind) refs.status.dataset.kind = kind;
  }

  function phaseEvalTargetNames(...infos) {
    const canonical = (classes || [])
      .map((item) => String(item?.name || "").trim())
      .filter(Boolean);

    const discovered = infos.flatMap(
      (info) =>
        (info?.classes || [])
          .map((row) => String(row?.className || "").trim())
          .filter(Boolean)
    );

    return Array.from(new Set([...canonical, ...discovered]))
      .sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
  }

  function phaseEvalRenderMapping(container, info, targetNames) {
    if (!container) return;
    container.innerHTML = "";

    const rows = Array.isArray(info?.classes)
      ? info.classes
      : [];

    if (!rows.length) {
      container.innerHTML =
        '<p class="modal-note">No polygonal classes found.</p>';
      return;
    }

    for (const row of rows) {
      const sourceName = String(
        row?.className || "Unclassified"
      );

      const wrapper = document.createElement("div");
      wrapper.className = "phase-eval-mapping-row";
      wrapper.dataset.sourceClass = sourceName;

      const source = document.createElement("div");
      source.className = "phase-eval-source";

      const strong = document.createElement("strong");
      strong.textContent = sourceName;

      const small = document.createElement("small");
      small.textContent =
        `${Number(row?.count || 0).toLocaleString()} object(s)`;

      source.append(strong, small);

      const arrow = document.createElement("span");
      arrow.className = "phase-eval-arrow";
      arrow.textContent = "→";

      const select = document.createElement("select");
      select.className = "phase-eval-target";

      const ignore = document.createElement("option");
      ignore.value = "";
      ignore.textContent = "Ignore";
      select.append(ignore);

      for (const target of targetNames) {
        const option = document.createElement("option");
        option.value = target;
        option.textContent = target;
        select.append(option);
      }

      const suggested = phaseEvalSuggestedTarget(
        sourceName,
        targetNames
      );

      if (
        suggested
        && !Array.from(select.options).some(
          (option) => option.value === suggested
        )
      ) {
        const option = document.createElement("option");
        option.value = suggested;
        option.textContent = `${suggested} (keep source)`;
        select.append(option);
      }

      select.value = suggested;
      wrapper.append(source, arrow, select);
      container.append(wrapper);
    }
  }

  function phaseEvalCollectMapping(container) {
    const mapping = {};

    for (
      const row
      of container?.querySelectorAll(".phase-eval-mapping-row")
      || []
    ) {
      const source = String(row.dataset.sourceClass || "");
      const target = String(
        row.querySelector(".phase-eval-target")?.value || ""
      ).trim();

      mapping[source] = target || null;
    }

    return mapping;
  }

  function phaseEvalApplyMapping(container, mapping) {
    if (!container || !mapping || typeof mapping !== "object") {
      return;
    }

    for (
      const row
      of container.querySelectorAll(".phase-eval-mapping-row")
    ) {
      const source = String(row.dataset.sourceClass || "");

      if (
        !Object.prototype.hasOwnProperty.call(mapping, source)
      ) {
        continue;
      }

      const select = row.querySelector(".phase-eval-target");
      if (!select) continue;

      const raw = mapping[source];
      const target = raw === null
        ? ""
        : String(raw || "").trim();

      if (
        target
        && !Array.from(select.options).some(
          (option) => option.value === target
        )
      ) {
        const option = document.createElement("option");
        option.value = target;
        option.textContent = target;
        select.append(option);
      }

      select.value = target;
    }
  }

  async function phaseEvalEnsureCurrentSaved(files) {
    if (
      !currentImage
      || currentImage.localNative
      || !dirty
      || !files.includes(currentAnnotationFile)
    ) {
      return;
    }

    await saveAnnotations(false);

    if (dirty) {
      throw new Error(
        "The current annotation file could not be synchronized before evaluation."
      );
    }
  }

  async function phaseEvalLoadInfo(file) {
    if (!currentImage || currentImage.localNative) {
      throw new Error(
        "Reference evaluation currently requires a server-backed image."
      );
    }

    const response = await apiFetch(
      `${API}/annotations/${currentImage.id}/evaluation-info?file=${encodeURIComponent(file)}`,
      { timeoutMs: 30000 }
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload.detail || `HTTP ${response.status}`
      );
    }

    return payload;
  }

  async function phaseEvalLoadMappings() {
    const refs = phaseEvalRefs();
    const candidateFile = String(refs.candidate?.value || "");
    const referenceFile = String(refs.reference?.value || "");

    if (!candidateFile || !referenceFile) {
      phaseEvalSetStatus(
        "Select both Candidate and Reference files."
      );
      return;
    }

    try {
      await phaseEvalEnsureCurrentSaved(
        [candidateFile, referenceFile]
      );

      phaseEvalSetStatus("Loading annotation classes…");

      [
        phaseEvalCandidateInfo,
        phaseEvalReferenceInfo,
      ] = await Promise.all([
        phaseEvalLoadInfo(candidateFile),
        phaseEvalLoadInfo(referenceFile),
      ]);

      const targets = phaseEvalTargetNames(
        phaseEvalCandidateInfo,
        phaseEvalReferenceInfo
      );

      phaseEvalRenderMapping(
        refs.candidateMap,
        phaseEvalCandidateInfo,
        targets
      );
      phaseEvalRenderMapping(
        refs.referenceMap,
        phaseEvalReferenceInfo,
        targets
      );

      if (refs.run) refs.run.disabled = false;

      phaseEvalSetStatus(
        `Candidate: ${candidateFile} (${phaseEvalRoleLabel(phaseEvalCandidateInfo.metadata)})`
        + ` · Reference: ${referenceFile} (${phaseEvalRoleLabel(phaseEvalReferenceInfo.metadata)})`
        + " · Map multiple source classes to the same target to merge them."
      );

      phaseEvalRefreshPresetSelect();
    } catch (error) {
      phaseEvalCandidateInfo = null;
      phaseEvalReferenceInfo = null;
      if (refs.run) refs.run.disabled = true;
      phaseEvalSetStatus(
        `Could not load evaluation classes: ${error.message}`,
        "error"
      );
    }
  }

  function phaseEvalFormatMetric(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toFixed(4)
      : "—";
  }

  function phaseEvalRenderResults(result) {
    const refs = phaseEvalRefs();
    if (!refs.results) return;

    const rows = Array.isArray(result?.rows)
      ? result.rows
      : [];
    const summary = result?.summary || {};

    if (!rows.length) {
      refs.results.innerHTML =
        '<p class="modal-note">No mapped polygonal classes were available for comparison.</p>';
      return;
    }

    refs.results.innerHTML = `
      <div class="phase-eval-summary">
        <span>Macro Dice <strong>${phaseEvalFormatMetric(summary.macroDice)}</strong></span>
        <span>Micro Dice <strong>${phaseEvalFormatMetric(summary.microDice)}</strong></span>
        <span>Macro IoU <strong>${phaseEvalFormatMetric(summary.macroIoU)}</strong></span>
        <span>Micro IoU <strong>${phaseEvalFormatMetric(summary.microIoU)}</strong></span>
      </div>
      <table class="stats-table phase-eval-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Dice</th>
            <th>IoU</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>Candidate area</th>
            <th>Reference area</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.className)}</td>
                <td><strong>${phaseEvalFormatMetric(row.dice)}</strong></td>
                <td>${phaseEvalFormatMetric(row.iou)}</td>
                <td>${phaseEvalFormatMetric(row.precision)}</td>
                <td>${phaseEvalFormatMetric(row.recall)}</td>
                <td>${formatStatNumber(Number(row.candidateAreaPx2 || 0), 2)} px²</td>
                <td>${formatStatNumber(Number(row.referenceAreaPx2 || 0), 2)} px²</td>
              </tr>
            `
          ).join("")}
        </tbody>
      </table>
      <p class="stats-note">
        ${escapeHtml(String(result.method || ""))}
        · level-0 image pixels
        · full-image bounds
        · mapping ${escapeHtml(String(result.mappingChecksum || "").slice(0, 12))}
      </p>
    `;
  }

  async function phaseEvalRun() {
    const refs = phaseEvalRefs();

    if (!currentImage || currentImage.localNative) {
      phaseEvalSetStatus(
        "Evaluation requires a server-backed image.",
        "error"
      );
      return;
    }

    const candidateFile = String(refs.candidate?.value || "");
    const referenceFile = String(refs.reference?.value || "");

    if (!phaseEvalCandidateInfo || !phaseEvalReferenceInfo) {
      await phaseEvalLoadMappings();
      if (!phaseEvalCandidateInfo || !phaseEvalReferenceInfo) {
        return;
      }
    }

    try {
      if (refs.run) refs.run.disabled = true;

      await phaseEvalEnsureCurrentSaved(
        [candidateFile, referenceFile]
      );

      phaseEvalSetStatus(
        "Calculating class-level unions and spatial metrics…"
      );

      const response = await apiFetch(
        `${API}/annotations/${currentImage.id}/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateFile,
            referenceFile,
            candidateMapping: phaseEvalCollectMapping(
              refs.candidateMap
            ),
            referenceMapping: phaseEvalCollectMapping(
              refs.referenceMap
            ),
          }),
          timeoutMs: 120000,
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.detail || `HTTP ${response.status}`
        );
      }

      phaseEvalLastResult = payload;
      phaseEvalRenderResults(payload);

      if (refs.exportCsv) {
        refs.exportCsv.disabled = !payload.rows?.length;
      }

      phaseEvalSetStatus(
        `Evaluation complete · ${payload.summary?.classCount || 0} class(es)`
        + ` · Macro Dice ${phaseEvalFormatMetric(payload.summary?.macroDice)}`,
        "saved"
      );
    } catch (error) {
      phaseEvalSetStatus(
        `Evaluation failed: ${error.message}`,
        "error"
      );
    } finally {
      if (refs.run) refs.run.disabled = false;
    }
  }

  function phaseEvalReadPresets() {
    try {
      const payload = JSON.parse(
        localStorage.getItem(PHASE_EVAL_PRESETS_KEY) || "{}"
      );
      return (
        payload
        && typeof payload === "object"
        && !Array.isArray(payload)
      )
        ? payload
        : {};
    } catch (_) {
      return {};
    }
  }

  function phaseEvalWritePresets(presets) {
    localStorage.setItem(
      PHASE_EVAL_PRESETS_KEY,
      JSON.stringify(presets)
    );
  }

  function phaseEvalRefreshPresetSelect() {
    const refs = phaseEvalRefs();
    if (!refs.preset) return;

    const current = refs.preset.value;
    const presets = phaseEvalReadPresets();

    refs.preset.innerHTML =
      '<option value="">No mapping preset</option>';

    for (
      const name
      of Object.keys(presets).sort(
        (a, b) =>
          a.localeCompare(
            b,
            undefined,
            { sensitivity: "base" }
          )
      )
    ) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      refs.preset.append(option);
    }

    if (current && presets[current]) {
      refs.preset.value = current;
    }

    const selected = Boolean(refs.preset.value);
    if (refs.presetApply) refs.presetApply.disabled = !selected;
    if (refs.presetDelete) refs.presetDelete.disabled = !selected;
  }

  function phaseEvalSavePreset() {
    const refs = phaseEvalRefs();
    const raw = window.prompt("Mapping preset name");
    if (raw === null) return;

    const name = String(raw).trim().slice(0, 120);
    if (!name) return;

    const presets = phaseEvalReadPresets();

    presets[name] = {
      schemaVersion: 1,
      candidateMapping: phaseEvalCollectMapping(
        refs.candidateMap
      ),
      referenceMapping: phaseEvalCollectMapping(
        refs.referenceMap
      ),
      savedAt: new Date().toISOString(),
    };

    phaseEvalWritePresets(presets);
    phaseEvalRefreshPresetSelect();

    if (refs.preset) refs.preset.value = name;
    phaseEvalRefreshPresetSelect();

    phaseEvalSetStatus(
      `Mapping preset "${name}" saved locally.`,
      "saved"
    );
  }

  function phaseEvalApplyPreset() {
    const refs = phaseEvalRefs();
    const name = String(refs.preset?.value || "");
    const preset = phaseEvalReadPresets()[name];

    if (!preset) return;

    phaseEvalApplyMapping(
      refs.candidateMap,
      preset.candidateMapping
    );
    phaseEvalApplyMapping(
      refs.referenceMap,
      preset.referenceMapping
    );

    phaseEvalSetStatus(
      `Mapping preset "${name}" applied.`
    );
  }

  function phaseEvalDeletePreset() {
    const refs = phaseEvalRefs();
    const name = String(refs.preset?.value || "");
    if (!name) return;

    if (!window.confirm(`Delete mapping preset "${name}"?`)) {
      return;
    }

    const presets = phaseEvalReadPresets();
    delete presets[name];
    phaseEvalWritePresets(presets);
    phaseEvalRefreshPresetSelect();

    phaseEvalSetStatus(
      `Mapping preset "${name}" deleted.`
    );
  }

  function phaseEvalExportCsv() {
    const result = phaseEvalLastResult;

    if (
      !result
      || !Array.isArray(result.rows)
      || !result.rows.length
    ) {
      return;
    }

    const headers = [
      "image",
      "candidate_file",
      "reference_file",
      "class",
      "dice",
      "iou",
      "precision",
      "recall",
      "candidate_area_px2",
      "reference_area_px2",
      "intersection_area_px2",
      "mapping_checksum",
    ];

    const csvEscape = (value) => {
      const text =
        value === null || value === undefined
          ? ""
          : String(value);

      return /[",\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
    };

    const lines = [
      headers.join(","),
      ...result.rows.map(
        (row) =>
          [
            result.imageRelativePath,
            result.candidateFile,
            result.referenceFile,
            row.className,
            row.dice,
            row.iou,
            row.precision,
            row.recall,
            row.candidateAreaPx2,
            row.referenceAreaPx2,
            row.intersectionAreaPx2,
            result.mappingChecksum,
          ]
            .map(csvEscape)
            .join(",")
      ),
    ];

    const blob = new Blob(
      [lines.join("\n")],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = (
      `HistoAnnotator-evaluation-`
      + `${String(result.candidateFile || "candidate")}-vs-`
      + `${String(result.referenceFile || "reference")}.csv`
    ).replace(/[^A-Za-z0-9._-]+/g, "_");

    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function phaseEvalOpen() {
    if (!currentImage) {
      setStatus("Open an image first", "error");
      return;
    }

    if (currentImage.localNative) {
      setStatus(
        "Reference evaluation currently requires a server-backed image",
        "error"
      );
      return;
    }

    const refs = phaseEvalRefs();
    if (!refs.overlay) return;

    if (typeof toggleAnalysisMenu === "function") {
      toggleAnalysisMenu(false);
    }

    refs.overlay.hidden = false;
    refs.results.innerHTML =
      '<p class="modal-note">Load classes to configure the evaluation mapping.</p>';
    refs.candidateMap.innerHTML = "";
    refs.referenceMap.innerHTML = "";

    phaseEvalCandidateInfo = null;
    phaseEvalReferenceInfo = null;
    phaseEvalLastResult = null;

    if (refs.exportCsv) refs.exportCsv.disabled = true;
    if (refs.run) refs.run.disabled = true;

    const metadataPairs = await Promise.all(
      annotationFiles.map(
        async (file) => [
          file,
          await phaseEvalLoadFileMetadata(
            currentImage.id,
            file
          ),
        ]
      )
    );

    const metadataByFile = new Map(metadataPairs);

    for (const select of [refs.candidate, refs.reference]) {
      if (!select) continue;

      select.innerHTML = "";

      for (const file of annotationFiles) {
        const option = document.createElement("option");
        option.value = file;
        option.textContent =
          `${file} · ${phaseEvalRoleLabel(metadataByFile.get(file))}`;
        select.append(option);
      }
    }

    if (
      refs.candidate
      && annotationFiles.includes(currentAnnotationFile)
    ) {
      refs.candidate.value = currentAnnotationFile;
    }

    const groundTruth = annotationFiles.find(
      (file) =>
        file !== refs.candidate?.value
        && phaseEvalNormalizeMetadata(
          metadataByFile.get(file)
        ).role === "ground_truth"
    );

    const fallbackReference = annotationFiles.find(
      (file) => file !== refs.candidate?.value
    );

    if (refs.reference) {
      refs.reference.value =
        groundTruth
        || fallbackReference
        || refs.candidate?.value
        || "Default";
    }

    phaseEvalRefreshPresetSelect();

    phaseEvalSetStatus(
      "Choose Candidate and Reference. "
      + "A file marked Ground truth is preferred automatically."
    );
  }

  function phaseEvalClose() {
    const refs = phaseEvalRefs();
    if (refs.overlay) refs.overlay.hidden = true;
  }

  function phaseEvalInitialize() {
    const refs = phaseEvalRefs();

    refs.role?.addEventListener(
      "change",
      () => void phaseEvalPersistCurrentMetadata()
    );
    refs.source?.addEventListener(
      "change",
      () => void phaseEvalPersistCurrentMetadata()
    );
    refs.evaluateButton?.addEventListener(
      "click",
      () => void phaseEvalOpen()
    );
    refs.close?.addEventListener("click", phaseEvalClose);
    refs.overlay?.addEventListener(
      "click",
      (event) => {
        if (event.target === refs.overlay) {
          phaseEvalClose();
        }
      }
    );
    refs.load?.addEventListener(
      "click",
      () => void phaseEvalLoadMappings()
    );
    refs.run?.addEventListener(
      "click",
      () => void phaseEvalRun()
    );

    for (const select of [refs.candidate, refs.reference]) {
      select?.addEventListener(
        "change",
        () => {
          phaseEvalCandidateInfo = null;
          phaseEvalReferenceInfo = null;
          if (refs.run) refs.run.disabled = true;
        }
      );
    }

    refs.preset?.addEventListener(
      "change",
      phaseEvalRefreshPresetSelect
    );
    refs.presetSave?.addEventListener(
      "click",
      phaseEvalSavePreset
    );
    refs.presetApply?.addEventListener(
      "click",
      phaseEvalApplyPreset
    );
    refs.presetDelete?.addEventListener(
      "click",
      phaseEvalDeletePreset
    );
    refs.exportCsv?.addEventListener(
      "click",
      phaseEvalExportCsv
    );

    void phaseEvalAnnotationFileChanged();
  }
