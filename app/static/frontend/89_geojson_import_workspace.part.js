// ========================================================================
// GeoJSON Import Workspace v2
//
// One File-menu action:
//   Import GeoJSON… -> file picker -> preview / class mapping / target action.
//
// Actions:
//   1. Import as NEW Annotation File (default)
//      - imported GeoJSON becomes a separate annotation file
//      - asks for Annotation File name, Role and Source
//   2. Add to CURRENT Annotation File
//      - appends mapped features without replacing existing annotations
//      - current file Role/Source are intentionally preserved
//
// Coordinate values are NEVER scaled or transformed.
// ========================================================================

const PHASE_IMPORT_ACTION_NEW = "new-file";
const PHASE_IMPORT_ACTION_ADD = "add-current";

let phaseImportWorkspaceState = {
  file: null,
  collection: null,
  sourceClasses: [],
  bounds: null,
};


function phaseImportWorkspaceRefs() {
  const byId =
    (id) =>
      document.getElementById(id);

  return {
    overlay:
      byId("phaseImportWorkspaceOverlay"),

    filename:
      byId("phaseImportWorkspaceFilename"),

    summary:
      byId("phaseImportWorkspaceSummary"),

    preview:
      byId("phaseImportWorkspacePreview"),

    bounds:
      byId("phaseImportWorkspaceBounds"),

    actionNew:
      byId("phaseImportActionNew"),

    actionAdd:
      byId("phaseImportActionAdd"),

    newFileFields:
      byId("phaseImportNewFileFields"),

    currentFileSummary:
      byId("phaseImportCurrentFileSummary"),

    offsetX:
      byId("phaseImportOffsetX"),

    offsetY:
      byId("phaseImportOffsetY"),

    offsetReset:
      byId("phaseImportOffsetReset"),

    targetName:
      byId("phaseImportTargetName"),

    role:
      byId("phaseImportRole"),

    source:
      byId("phaseImportSource"),

    mapping:
      byId("phaseImportMapping"),

    status:
      byId("phaseImportWorkspaceStatus"),

    apply:
      byId("phaseImportApplyButton"),

    cancel:
      byId("phaseImportCancelButton"),
  };
}


function phaseImportWorkspaceEnsureUi() {
  if (
    document.getElementById(
      "phaseImportWorkspaceOverlay"
    )
  ) {
    return;
  }

  const host =
    document.createElement("div");

  host.innerHTML = `
    <div id="phaseImportWorkspaceOverlay"
         class="modal-overlay phase-import-workspace-overlay"
         hidden>
      <section class="modal-card phase-import-workspace-card"
               role="dialog"
               aria-modal="true"
               aria-labelledby="phaseImportWorkspaceTitle">

        <div class="phase-import-header">
          <div>
            <h2 id="phaseImportWorkspaceTitle">
              Import GeoJSON
            </h2>

            <div id="phaseImportWorkspaceFilename"
                 class="phase-import-muted">
            </div>
          </div>

          <button id="phaseImportCancelButton"
                  type="button">
            Close
          </button>
        </div>

        <div class="phase-import-grid">
          <div class="phase-import-preview-column">
            <div class="phase-import-section-title">
              Preview
            </div>

            <div class="phase-import-preview-frame">
              <svg id="phaseImportWorkspacePreview"
                   viewBox="0 0 520 320"
                   preserveAspectRatio="xMidYMid meet"
                   aria-label="GeoJSON geometry preview">
              </svg>
            </div>

            <div id="phaseImportWorkspaceSummary"
                 class="phase-import-summary">
            </div>

            <div id="phaseImportWorkspaceBounds"
                 class="phase-import-bounds">
            </div>
          </div>

          <div class="phase-import-config-column">
            <div class="phase-import-section-title">
              Import destination
            </div>

            <div class="phase-import-action-options">
              <label class="phase-import-action-card">
                <input id="phaseImportActionNew"
                       type="radio"
                       name="phaseImportAction"
                       value="new-file"
                       checked>
                <span>
                  <strong>Import as new Annotation File</strong>
                  <small>
                    Keeps the external annotations separate.
                  </small>
                </span>
              </label>

              <label class="phase-import-action-card">
                <input id="phaseImportActionAdd"
                       type="radio"
                       name="phaseImportAction"
                       value="add-current">
                <span>
                  <strong>Add to current Annotation File</strong>
                  <small>
                    Existing annotations are preserved.
                  </small>
                </span>
              </label>
            </div>

            <div id="phaseImportNewFileFields"
                 class="phase-import-new-file-fields">

              <label>
                <span>Annotation File name</span>
                <input id="phaseImportTargetName"
                       type="text"
                       maxlength="80"
                       autocomplete="off"
                       placeholder="External annotations">
              </label>

              <div class="phase-import-meta-grid">
                <label>
                  <span>Role</span>
                  <select id="phaseImportRole">
                  </select>
                </label>

                <label>
                  <span>Source</span>
                  <select id="phaseImportSource">
                  </select>
                </label>
              </div>
            </div>

            <div id="phaseImportCurrentFileSummary"
                 class="phase-import-current-file"
                 hidden>
            </div>


            <div class="phase-import-offset-box">
              <div class="phase-import-offset-header">
                <div>
                  <strong>Optional coordinate offset</strong>
                  <small>Shift all imported annotations without rescaling.</small>
                </div>

                <button id="phaseImportOffsetReset"
                        type="button">
                  Reset
                </button>
              </div>

              <div class="phase-import-offset-grid">
                <label>
                  <span>X</span>
                  <div class="phase-import-number-with-unit">
                    <input id="phaseImportOffsetX"
                           type="number"
                           step="any"
                           value="0"
                           inputmode="decimal">
                    <span>px</span>
                  </div>
                </label>

                <label>
                  <span>Y</span>
                  <div class="phase-import-number-with-unit">
                    <input id="phaseImportOffsetY"
                           type="number"
                           step="any"
                           value="0"
                           inputmode="decimal">
                    <span>px</span>
                  </div>
                </label>
              </div>

              <div class="phase-import-offset-hint">
                Positive X moves right. Positive Y moves down.
                Preview updates immediately.
              </div>
            </div>

            <div class="phase-import-section-title phase-import-map-title">
              Class mapping
            </div>

            <div class="phase-import-help">
              Map each source class to a HistoAnnotator class.
              Choose Custom class… to type a new class name.
            </div>

            <div id="phaseImportMapping"
                 class="phase-import-mapping">
            </div>
          </div>
        </div>

        <div class="phase-import-footer">
          <div id="phaseImportWorkspaceStatus"
               class="phase-import-status">
          </div>

          <div class="phase-import-footer-actions">
            <button id="phaseImportApplyButton"
                    type="button">
              Import as new file
            </button>
          </div>
        </div>
      </section>
    </div>
  `;

  document.body.append(
    host.firstElementChild
  );

  const refs =
    phaseImportWorkspaceRefs();

  refs.cancel?.addEventListener(
    "click",
    phaseImportWorkspaceClose
  );

  refs.overlay?.addEventListener(
    "click",
    (event) => {
      if (
        event.target
        === refs.overlay
      ) {
        phaseImportWorkspaceClose();
      }
    }
  );

  refs.actionNew?.addEventListener(
    "change",
    phaseImportWorkspaceRenderAction
  );

  refs.actionAdd?.addEventListener(
    "change",
    phaseImportWorkspaceRenderAction
  );

  refs.offsetX?.addEventListener(
    "input",
    phaseImportWorkspaceOffsetChanged
  );

  refs.offsetY?.addEventListener(
    "input",
    phaseImportWorkspaceOffsetChanged
  );

  refs.offsetReset?.addEventListener(
    "click",
    phaseImportWorkspaceResetOffset
  );

  refs.apply?.addEventListener(
    "click",
    () => {
      void phaseImportWorkspaceApply();
    }
  );
}


function phaseImportWorkspaceClose() {
  const refs =
    phaseImportWorkspaceRefs();

  if (refs.overlay) {
    refs.overlay.hidden = true;
  }

  phaseImportWorkspaceState = {
    file: null,
    collection: null,
    sourceClasses: [],
    bounds: null,
  };

  if (els.importInput) {
    els.importInput.value = "";
  }
}


function phaseImportWorkspaceSetStatus(
  message = "",
  error = false
) {
  const refs =
    phaseImportWorkspaceRefs();

  if (!refs.status) {
    return;
  }

  refs.status.textContent =
    String(message || "");

  refs.status.classList.toggle(
    "error",
    Boolean(error)
  );
}


function phaseImportWorkspaceSafeFilenameBase(
  filename
) {
  const base =
    String(
      filename
      || "Imported annotations"
    )
      .replace(
        /\.[^.]+$/,
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
        70
      );

  return (
    base
    || "Imported annotations"
  );
}


function phaseImportWorkspaceSuggestedFileName(
  filename
) {
  const base =
    phaseImportWorkspaceSafeFilenameBase(
      filename
    );

  const used =
    new Set(
      (
        annotationFiles
        || []
      ).map(
        (name) =>
          String(name)
            .trim()
            .toLowerCase()
      )
    );

  if (
    !used.has(
      base.toLowerCase()
    )
  ) {
    return base;
  }

  const imported =
    `${base} import`;

  if (
    !used.has(
      imported.toLowerCase()
    )
  ) {
    return imported.slice(
      0,
      80
    );
  }

  for (
    let index = 2;
    index < 1000;
    index += 1
  ) {
    const candidate =
      `${base} import ${index}`
        .slice(
          0,
          80
        );

    if (
      !used.has(
        candidate.toLowerCase()
      )
    ) {
      return candidate;
    }
  }

  return (
    `${base.slice(0, 60)} ${Date.now()}`
  ).slice(
    0,
    80
  );
}


function phaseImportWorkspaceRoleOptions() {
  if (
    Array.isArray(
      globalThis.PHASE_EVAL_ROLES
    )
  ) {
    return globalThis.PHASE_EVAL_ROLES;
  }

  if (
    typeof PHASE_EVAL_ROLES
      !== "undefined"
    && Array.isArray(
      PHASE_EVAL_ROLES
    )
  ) {
    return PHASE_EVAL_ROLES;
  }

  return [
    [
      "annotation",
      "Regular annotation",
    ],
    [
      "ground_truth",
      "Ground truth",
    ],
    [
      "model_prediction",
      "Model prediction",
    ],
    [
      "consensus",
      "Consensus",
    ],
    [
      "reference",
      "Other reference",
    ],
  ];
}


function phaseImportWorkspaceSourceOptions() {
  if (
    Array.isArray(
      globalThis.PHASE_EVAL_SOURCES
    )
  ) {
    return globalThis.PHASE_EVAL_SOURCES;
  }

  if (
    typeof PHASE_EVAL_SOURCES
      !== "undefined"
    && Array.isArray(
      PHASE_EVAL_SOURCES
    )
  ) {
    return PHASE_EVAL_SOURCES;
  }

  return [
    [
      "manual",
      "Manual / unspecified",
    ],
    [
      "pathologist",
      "Pathologist",
    ],
    [
      "model",
      "Model",
    ],
    [
      "external",
      "External dataset/tool",
    ],
    [
      "mixed",
      "Mixed / consensus",
    ],
  ];
}


function phaseImportWorkspacePopulateMetadata() {
  const refs =
    phaseImportWorkspaceRefs();

  const populate =
    (
      select,
      options,
      defaultValue
    ) => {
      if (!select) {
        return;
      }

      select.innerHTML = "";

      for (
        const [
          value,
          label,
        ]
        of options
      ) {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          value;

        option.textContent =
          label;

        select.append(
          option
        );
      }

      select.value =
        defaultValue;
    };

  populate(
    refs.role,
    phaseImportWorkspaceRoleOptions(),
    "annotation"
  );

  populate(
    refs.source,
    phaseImportWorkspaceSourceOptions(),
    "external"
  );
}


function phaseImportWorkspaceNormalizeExternalCollection(
  payload
) {
  const normalized =
    normalizeFeatureCollectionClient(
      payload
    );

  const sourceFeatures =
    Array.isArray(
      payload?.features
    )
      ? payload.features
      : [];

  normalized.features =
    (
      normalized.features
      || []
    ).map(
      (
        feature,
        index
      ) => {
        const source =
          sourceFeatures[index]
          || {};

        const sourceProperties =
          (
            source.properties
            && typeof source.properties
              === "object"
          )
            ? deepClone(
                source.properties
              )
            : {};

        const normalizedProperties =
          (
            feature.properties
            && typeof feature.properties
              === "object"
          )
            ? deepClone(
                feature.properties
              )
            : {};

        // Preserve ALL external metadata while retaining canonical fields
        // produced by HistoAnnotator normalization.
        feature.properties = {
          ...sourceProperties,
          ...normalizedProperties,
        };

        return feature;
      }
    );

  return normalized;
}


function phaseImportWorkspaceSourceClass(
  feature
) {
  const properties =
    feature?.properties
    || {};

  const classification =
    properties.classification;

  const candidates = [
    (
      classification
      && typeof classification
        === "object"
    )
      ? classification.name
      : null,

    typeof classification
      === "string"
      ? classification
      : null,

    // Annotation/model exports such as LUNGTS / ANet.
    // Prefer the explicit annotation-network label when present.
    properties.anet_class_label,
    properties.model_label,

    properties.className,
    properties.class,
    properties.label,
    properties.category,
  ];

  for (
    const value
    of candidates
  ) {
    const name =
      String(
        value
        || ""
      ).trim();

    if (name) {
      return name;
    }
  }

  return "Unclassified";
}


function phaseImportWorkspaceColorToHex(
  value
) {
  if (
    typeof value === "string"
  ) {
    const text =
      value.trim();

    if (
      /^#[0-9a-fA-F]{6}$/
        .test(text)
    ) {
      return text.toLowerCase();
    }
  }

  if (
    Array.isArray(value)
    && value.length >= 3
  ) {
    const channels =
      value.slice(
        0,
        3
      ).map(
        (channel) =>
          Math.max(
            0,
            Math.min(
              255,
              Math.round(
                Number(channel)
                || 0
              )
            )
          )
      );

    return (
      "#"
      + channels
        .map(
          (channel) =>
            channel
              .toString(16)
              .padStart(
                2,
                "0"
              )
        )
        .join("")
    );
  }

  return null;
}


function phaseImportWorkspaceSourceColor(
  feature
) {
  const classification =
    feature?.properties
      ?.classification;

  if (
    classification
    && typeof classification
      === "object"
  ) {
    return (
      phaseImportWorkspaceColorToHex(
        classification.color
      )
      || phaseImportWorkspaceColorToHex(
        classification.colour
      )
    );
  }

  return (
    phaseImportWorkspaceColorToHex(
      feature?.properties?.color
    )
    || null
  );
}


function phaseImportWorkspaceClassRows(
  collection
) {
  const byName =
    new Map();

  for (
    const feature
    of collection?.features
      || []
  ) {
    const name =
      phaseImportWorkspaceSourceClass(
        feature
      );

    const key =
      name.toLowerCase();

    let row =
      byName.get(key);

    if (!row) {
      row = {
        name,
        count: 0,
        color:
          phaseImportWorkspaceSourceColor(
            feature
          ),
      };

      byName.set(
        key,
        row
      );
    }

    row.count += 1;

    if (!row.color) {
      row.color =
        phaseImportWorkspaceSourceColor(
          feature
        );
    }
  }

  return Array.from(
    byName.values()
  ).sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        undefined,
        {
          sensitivity:
            "base",
        }
      )
  );
}


function phaseImportWorkspaceCoordinatePairs(
  coordinates,
  output
) {
  if (
    !Array.isArray(
      coordinates
    )
  ) {
    return;
  }

  if (
    coordinates.length >= 2
    && Number.isFinite(
      Number(
        coordinates[0]
      )
    )
    && Number.isFinite(
      Number(
        coordinates[1]
      )
    )
  ) {
    output.push([
      Number(
        coordinates[0]
      ),
      Number(
        coordinates[1]
      ),
    ]);

    return;
  }

  for (
    const item
    of coordinates
  ) {
    phaseImportWorkspaceCoordinatePairs(
      item,
      output
    );
  }
}



function phaseImportWorkspaceOffset() {
  const x = Number(phaseImportWorkspaceState.offsetX || 0);
  const y = Number(phaseImportWorkspaceState.offsetY || 0);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function phaseImportWorkspaceOffsetChanged() {
  const refs = phaseImportWorkspaceRefs();
  const x = Number(refs.offsetX?.value || 0);
  const y = Number(refs.offsetY?.value || 0);

  phaseImportWorkspaceState.offsetX =
    Number.isFinite(x) ? x : 0;

  phaseImportWorkspaceState.offsetY =
    Number.isFinite(y) ? y : 0;

  phaseImportWorkspaceRenderPreview();
  phaseImportWorkspaceRenderBounds();
}

function phaseImportWorkspaceResetOffset() {
  const refs = phaseImportWorkspaceRefs();

  if (refs.offsetX) refs.offsetX.value = "0";
  if (refs.offsetY) refs.offsetY.value = "0";

  phaseImportWorkspaceState.offsetX = 0;
  phaseImportWorkspaceState.offsetY = 0;

  phaseImportWorkspaceRenderPreview();
  phaseImportWorkspaceRenderBounds();
}

function phaseImportWorkspaceOffsetCoordinates(coordinates, dx, dy) {
  if (!Array.isArray(coordinates)) {
    return coordinates;
  }

  if (
    coordinates.length >= 2
    && Number.isFinite(Number(coordinates[0]))
    && Number.isFinite(Number(coordinates[1]))
  ) {
    return [
      Number(coordinates[0]) + dx,
      Number(coordinates[1]) + dy,
      ...coordinates.slice(2),
    ];
  }

  return coordinates.map(
    (item) =>
      phaseImportWorkspaceOffsetCoordinates(item, dx, dy)
  );
}

function phaseImportWorkspaceOffsetGeometry(geometry, dx, dy) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return geometry;
  }

  const shifted = deepClone(geometry);

  shifted.coordinates =
    phaseImportWorkspaceOffsetCoordinates(
      shifted.coordinates,
      dx,
      dy
    );

  return shifted;
}

function phaseImportWorkspaceEffectiveBounds() {
  const bounds = phaseImportWorkspaceState.bounds;

  if (!bounds) {
    return null;
  }

  const { x, y } = phaseImportWorkspaceOffset();

  return {
    minX: bounds.minX + x,
    minY: bounds.minY + y,
    maxX: bounds.maxX + x,
    maxY: bounds.maxY + y,
    width: bounds.width,
    height: bounds.height,
  };
}

function phaseImportWorkspaceImageDimensions() {
  const width = Number(currentInfo?.width || 0);
  const height = Number(currentInfo?.height || 0);

  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function phaseImportWorkspacePreviewBounds() {
  const { width, height } =
    phaseImportWorkspaceImageDimensions();

  if (width > 0 && height > 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: height,
      width,
      height,
    };
  }

  return (
    phaseImportWorkspaceEffectiveBounds()
    || phaseImportWorkspaceState.bounds
  );
}

async function phaseImportWorkspaceLoadThumbnail() {
  const { width, height } =
    phaseImportWorkspaceImageDimensions();

  if (
    width <= 0
    || height <= 0
    || typeof phaseReportFetchRegion !== "function"
  ) {
    return;
  }

  phaseImportWorkspaceState.thumbnailLoading = true;

  try {
    const captured =
      await phaseReportFetchRegion({
        x: 0,
        y: 0,
        width,
        height,
      });

    phaseImportWorkspaceState.thumbnailDataUrl =
      captured?.dataUrl || null;

  } catch (error) {
    console.warn(
      "Could not load WSI thumbnail for GeoJSON import preview",
      error
    );

    phaseImportWorkspaceState.thumbnailDataUrl = null;

  } finally {
    phaseImportWorkspaceState.thumbnailLoading = false;
    phaseImportWorkspaceRenderPreview();
  }
}


function phaseImportWorkspaceBounds(
  collection
) {
  const points = [];

  for (
    const feature
    of collection?.features
      || []
  ) {
    phaseImportWorkspaceCoordinatePairs(
      feature?.geometry
        ?.coordinates,
      points
    );
  }

  if (!points.length) {
    return null;
  }

  let minX =
    Infinity;

  let minY =
    Infinity;

  let maxX =
    -Infinity;

  let maxY =
    -Infinity;

  for (
    const [
      x,
      y,
    ]
    of points
  ) {
    minX =
      Math.min(
        minX,
        x
      );

    minY =
      Math.min(
        minY,
        y
      );

    maxX =
      Math.max(
        maxX,
        x
      );

    maxY =
      Math.max(
        maxY,
        y
      );
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width:
      Math.max(
        0,
        maxX - minX
      ),
    height:
      Math.max(
        0,
        maxY - minY
      ),
  };
}


function phaseImportWorkspaceProjector(
  bounds
) {
  const width =
    520;

  const height =
    320;

  const margin =
    18;

  const spanX =
    Math.max(
      1,
      bounds?.width
      || 1
    );

  const spanY =
    Math.max(
      1,
      bounds?.height
      || 1
    );

  const scale =
    Math.min(
      (
        width
        - margin * 2
      ) / spanX,
      (
        height
        - margin * 2
      ) / spanY
    );

  const drawnWidth =
    spanX * scale;

  const drawnHeight =
    spanY * scale;

  const offsetX =
    (
      width
      - drawnWidth
    ) / 2;

  const offsetY =
    (
      height
      - drawnHeight
    ) / 2;

  return (
    x,
    y
  ) => [
    offsetX
      + (
        x
        - bounds.minX
      ) * scale,

    offsetY
      + (
        y
        - bounds.minY
      ) * scale,
  ];
}


function phaseImportWorkspaceRingPath(
  ring,
  project,
  close = true
) {
  if (
    !Array.isArray(ring)
    || !ring.length
  ) {
    return "";
  }

  const parts = [];

  ring.forEach(
    (
      point,
      index
    ) => {
      if (
        !Array.isArray(point)
        || point.length < 2
      ) {
        return;
      }

      const [
        x,
        y,
      ] =
        project(
          Number(point[0]),
          Number(point[1])
        );

      parts.push(
        (
          index === 0
            ? "M"
            : "L"
        )
        + `${x.toFixed(2)} ${y.toFixed(2)}`
      );
    }
  );

  if (
    close
    && parts.length
  ) {
    parts.push("Z");
  }

  return parts.join(" ");
}


function phaseImportWorkspaceGeometryPath(
  geometry,
  project
) {
  if (!geometry) {
    return "";
  }

  if (
    geometry.type
      === "Polygon"
  ) {
    return (
      geometry.coordinates
      || []
    ).map(
      (ring) =>
        phaseImportWorkspaceRingPath(
          ring,
          project,
          true
        )
    ).join(" ");
  }

  if (
    geometry.type
      === "MultiPolygon"
  ) {
    return (
      geometry.coordinates
      || []
    ).flatMap(
      (polygon) =>
        polygon.map(
          (ring) =>
            phaseImportWorkspaceRingPath(
              ring,
              project,
              true
            )
        )
    ).join(" ");
  }

  if (
    geometry.type
      === "LineString"
  ) {
    return phaseImportWorkspaceRingPath(
      geometry.coordinates,
      project,
      false
    );
  }

  if (
    geometry.type
      === "MultiLineString"
  ) {
    return (
      geometry.coordinates
      || []
    ).map(
      (line) =>
        phaseImportWorkspaceRingPath(
          line,
          project,
          false
        )
    ).join(" ");
  }

  return "";
}


function phaseImportWorkspaceRenderPreview() {
  const refs =
    phaseImportWorkspaceRefs();

  const collection =
    phaseImportWorkspaceState
      .collection;

  const bounds =
    phaseImportWorkspacePreviewBounds();

  if (
    !refs.preview
    || !collection
  ) {
    return;
  }

  refs.preview.innerHTML = "";

  const background =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );

  background.setAttribute(
    "x",
    "0"
  );

  background.setAttribute(
    "y",
    "0"
  );

  background.setAttribute(
    "width",
    "520"
  );

  background.setAttribute(
    "height",
    "320"
  );

  background.setAttribute(
    "class",
    "phase-import-preview-bg"
  );

  refs.preview.append(
    background
  );

  if (!bounds) {
    return;
  }

  const baseProject =
    phaseImportWorkspaceProjector(
      bounds
    );

  const thumbnail =
    phaseImportWorkspaceState.thumbnailDataUrl;

  const imageDimensions =
    phaseImportWorkspaceImageDimensions();

  if (
    thumbnail
    && imageDimensions.width > 0
    && imageDimensions.height > 0
  ) {
    const topLeft = baseProject(0, 0);

    const bottomRight =
      baseProject(
        imageDimensions.width,
        imageDimensions.height
      );

    const image =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "image"
      );

    image.setAttribute("x", String(topLeft[0]));
    image.setAttribute("y", String(topLeft[1]));
    image.setAttribute(
      "width",
      String(Math.max(1, bottomRight[0] - topLeft[0]))
    );
    image.setAttribute(
      "height",
      String(Math.max(1, bottomRight[1] - topLeft[1]))
    );
    image.setAttribute("href", thumbnail);
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("class", "phase-import-thumbnail");

    refs.preview.append(image);
  }

  const offset = phaseImportWorkspaceOffset();

  const project =
    (x, y) =>
      baseProject(
        x + offset.x,
        y + offset.y
      );

  const features =
    (
      collection.features
      || []
    ).slice(
      0,
      350
    );

  for (
    const feature
    of features
  ) {
    const geometry =
      feature.geometry;

    const sourceClass =
      phaseImportWorkspaceSourceClass(
        feature
      );

    const sourceRow =
      phaseImportWorkspaceState
        .sourceClasses.find(
          (row) =>
            row.name
              .toLowerCase()
            === sourceClass
              .toLowerCase()
        );

    const color =
      sourceRow?.color
      || "#4dabf7";

    if (
      geometry?.type
        === "Point"
      && Array.isArray(
        geometry.coordinates
      )
    ) {
      const [
        x,
        y,
      ] =
        project(
          Number(
            geometry.coordinates[0]
          ),
          Number(
            geometry.coordinates[1]
          )
        );

      const circle =
        document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );

      circle.setAttribute(
        "cx",
        String(x)
      );

      circle.setAttribute(
        "cy",
        String(y)
      );

      circle.setAttribute(
        "r",
        "3"
      );

      circle.setAttribute(
        "fill",
        color
      );

      refs.preview.append(
        circle
      );

      continue;
    }

    const pathText =
      phaseImportWorkspaceGeometryPath(
        geometry,
        project
      );

    if (!pathText) {
      continue;
    }

    const path =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

    path.setAttribute(
      "d",
      pathText
    );

    path.setAttribute(
      "fill",
      (
        geometry.type
          === "Polygon"
        || geometry.type
          === "MultiPolygon"
      )
        ? color
        : "none"
    );

    path.setAttribute(
      "fill-opacity",
      "0.18"
    );

    path.setAttribute(
      "stroke",
      color
    );

    path.setAttribute(
      "stroke-width",
      "1.4"
    );

    path.setAttribute(
      "vector-effect",
      "non-scaling-stroke"
    );

    path.setAttribute(
      "fill-rule",
      "evenodd"
    );

    refs.preview.append(
      path
    );
  }
}


function phaseImportWorkspaceRenderBounds() {
  const refs =
    phaseImportWorkspaceRefs();

  if (!refs.bounds) {
    return;
  }

  const bounds =
    phaseImportWorkspaceEffectiveBounds();

  if (!bounds) {
    refs.bounds.textContent =
      "No coordinate bounds could be calculated.";

    refs.bounds.classList.add(
      "warning"
    );

    return;
  }

  const imageWidth =
    Number(
      currentInfo?.width
      || 0
    );

  const imageHeight =
    Number(
      currentInfo?.height
      || 0
    );

  const offset =
    phaseImportWorkspaceOffset();

  const offsetText =
    (
      offset.x !== 0
      || offset.y !== 0
    )
      ? (
          ` · Offset X ${offset.x >= 0 ? "+" : ""}${offset.x}px, `
          + `Y ${offset.y >= 0 ? "+" : ""}${offset.y}px`
        )
      : "";

  const boundText =
    (
      `GeoJSON bounds after offset: `
      + `x ${Math.round(bounds.minX)}–${Math.round(bounds.maxX)}, `
      + `y ${Math.round(bounds.minY)}–${Math.round(bounds.maxY)}`
      + offsetText
    );

  if (
    imageWidth > 0
    && imageHeight > 0
  ) {
    const inside =
      (
        bounds.minX >= 0
        && bounds.minY >= 0
        && bounds.maxX
          <= imageWidth
        && bounds.maxY
          <= imageHeight
      );

    refs.bounds.textContent =
      (
        `${boundText} · Image ${Math.round(imageWidth)} × `
        + `${Math.round(imageHeight)} px · `
        + (
            inside
              ? "coordinates fit image bounds"
              : "WARNING: coordinates extend outside image bounds"
          )
      );

    refs.bounds.classList.toggle(
      "warning",
      !inside
    );

    return;
  }

  refs.bounds.textContent =
    (
      `${boundText} · `
      + "Coordinates will be imported unchanged."
    );

  refs.bounds.classList.remove(
    "warning"
  );
}


function phaseImportWorkspaceRenderSummary() {
  const refs =
    phaseImportWorkspaceRefs();

  const collection =
    phaseImportWorkspaceState
      .collection;

  if (
    !refs.summary
    || !collection
  ) {
    return;
  }

  const geometryCounts =
    new Map();

  for (
    const feature
    of collection.features
      || []
  ) {
    const type =
      String(
        feature?.geometry?.type
        || "Unknown"
      );

    geometryCounts.set(
      type,
      (
        geometryCounts.get(
          type
        )
        || 0
      ) + 1
    );
  }

  const geometryText =
    Array.from(
      geometryCounts.entries()
    ).map(
      ([
        type,
        count,
      ]) =>
        `${type}: ${count}`
    ).join(" · ");

  refs.summary.innerHTML = `
    <strong>${Number(collection.features?.length || 0).toLocaleString()} feature(s)</strong>
    <span>${phaseImportWorkspaceState.sourceClasses.length} source class(es)</span>
    <span>${escapeHtml(geometryText)}</span>
    <span>Preview shows up to 350 features. Coordinates are never rescaled.</span>
  `;
}


function phaseImportWorkspaceCanonicalClasses() {
  return (
    classes
    || []
  ).map(
    (
      item,
      index
    ) => ({
      index,
      name:
        String(
          item?.name
          || ""
        ).trim(),
      color:
        String(
          item?.color
          || "#4dabf7"
        ),
    })
  ).filter(
    (item) =>
      Boolean(
        item.name
      )
  );
}


function phaseImportWorkspaceRenderMapping() {
  const refs =
    phaseImportWorkspaceRefs();

  if (!refs.mapping) {
    return;
  }

  refs.mapping.innerHTML = "";

  const canonical =
    phaseImportWorkspaceCanonicalClasses();

  for (
    const [
      rowIndex,
      sourceRow,
    ]
    of phaseImportWorkspaceState
      .sourceClasses
      .entries()
  ) {
    const row =
      document.createElement(
        "div"
      );

    row.className =
      "phase-import-mapping-row";

    row.dataset.sourceIndex =
      String(
        rowIndex
      );

    const source =
      document.createElement(
        "div"
      );

    source.className =
      "phase-import-source-class";

    const top =
      document.createElement(
        "div"
      );

    top.className =
      "phase-import-source-name";

    const swatch =
      document.createElement(
        "span"
      );

    swatch.className =
      "phase-import-source-swatch";

    swatch.style.background =
      sourceRow.color
      || "#94a3b8";

    const strong =
      document.createElement(
        "strong"
      );

    strong.textContent =
      sourceRow.name;

    top.append(
      swatch,
      strong
    );

    const count =
      document.createElement(
        "small"
      );

    count.textContent =
      (
        `${sourceRow.count.toLocaleString()} object`
        + (
            sourceRow.count === 1
              ? ""
              : "s"
          )
      );

    source.append(
      top,
      count
    );

    const arrow =
      document.createElement(
        "span"
      );

    arrow.className =
      "phase-import-arrow";

    arrow.textContent =
      "→";

    const target =
      document.createElement(
        "div"
      );

    target.className =
      "phase-import-target-class";

    const select =
      document.createElement(
        "select"
      );

    select.className =
      "phase-import-target-select";

    const ignore =
      document.createElement(
        "option"
      );

    ignore.value =
      "__ignore__";

    ignore.textContent =
      "Ignore";

    select.append(
      ignore
    );

    for (
      const item
      of canonical
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        `existing:${item.index}`;

      option.textContent =
        item.name;

      select.append(
        option
      );
    }

    const keep =
      document.createElement(
        "option"
      );

    keep.value =
      "__keep__";

    keep.textContent =
      "Keep source name";

    select.append(
      keep
    );

    const custom =
      document.createElement(
        "option"
      );

    custom.value =
      "__custom__";

    custom.textContent =
      "Custom class…";

    select.append(
      custom
    );

    const exact =
      canonical.find(
        (item) =>
          item.name
            .toLowerCase()
          === sourceRow.name
            .toLowerCase()
      );

    select.value =
      exact
        ? `existing:${exact.index}`
        : "__keep__";

    const customInput =
      document.createElement(
        "input"
      );

    customInput.type =
      "text";

    customInput.className =
      "phase-import-custom-class";

    customInput.placeholder =
      "Type class name";

    customInput.maxLength =
      80;

    customInput.hidden =
      true;

    select.addEventListener(
      "change",
      () => {
        customInput.hidden =
          select.value
          !== "__custom__";

        if (
          !customInput.hidden
        ) {
          customInput.focus();
        }
      }
    );

    target.append(
      select,
      customInput
    );

    row.append(
      source,
      arrow,
      target
    );

    refs.mapping.append(
      row
    );
  }
}


function phaseImportWorkspaceAction() {
  const refs =
    phaseImportWorkspaceRefs();

  return refs.actionAdd
    ?.checked
      ? PHASE_IMPORT_ACTION_ADD
      : PHASE_IMPORT_ACTION_NEW;
}


async function phaseImportWorkspaceRenderAction() {
  const refs =
    phaseImportWorkspaceRefs();

  const action =
    phaseImportWorkspaceAction();

  const createNew =
    action
      === PHASE_IMPORT_ACTION_NEW;

  if (refs.newFileFields) {
    refs.newFileFields.hidden =
      !createNew;
  }

  if (
    refs.currentFileSummary
  ) {
    refs.currentFileSummary.hidden =
      createNew;

    if (!createNew) {
      let metadata =
        null;

      try {
        if (
          typeof phaseEvalLoadFileMetadata
            === "function"
          && currentImage
        ) {
          metadata =
            await phaseEvalLoadFileMetadata(
              currentImage.id,
              currentAnnotationFile
            );
        }
      } catch (_) {}

      const role =
        metadata
          ? phaseImportWorkspaceRoleOptions()
              .find(
                (item) =>
                  item[0]
                  === metadata.role
              )?.[1]
          : null;

      const source =
        metadata
          ? phaseImportWorkspaceSourceOptions()
              .find(
                (item) =>
                  item[0]
                  === metadata.sourceType
              )?.[1]
          : null;

      refs.currentFileSummary.innerHTML = `
        <strong>Current file: ${escapeHtml(String(currentAnnotationFile || "Default"))}</strong>
        <span>
          ${escapeHtml(
            metadata
              ? `${role || metadata.role} · ${source || metadata.sourceType}`
              : "Existing Role/Source will be kept unchanged"
          )}
        </span>
        <span>
          ${Number(featureCollection.features?.length || 0).toLocaleString()}
          existing feature(s)
        </span>
      `;
    }
  }

  if (refs.apply) {
    refs.apply.textContent =
      createNew
        ? "Import as new file"
        : "Add to current file";
  }

  phaseImportWorkspaceSetStatus("");
}


function phaseImportWorkspaceOpen(
  file,
  collection
) {
  phaseImportWorkspaceEnsureUi();

  phaseImportWorkspaceState = {
    file,
    collection,
    sourceClasses:
      phaseImportWorkspaceClassRows(
        collection
      ),
    bounds:
      phaseImportWorkspaceBounds(
        collection
      ),
    offsetX: 0,
    offsetY: 0,
    thumbnailDataUrl: null,
    thumbnailLoading: false,
  };

  const refs =
    phaseImportWorkspaceRefs();

  if (refs.filename) {
    refs.filename.textContent =
      (
        `${file.name} · `
        + `${Number(file.size || 0).toLocaleString()} bytes`
      );
  }

  phaseImportWorkspacePopulateMetadata();

  if (refs.targetName) {
    refs.targetName.value =
      phaseImportWorkspaceSuggestedFileName(
        file.name
      );
  }

  if (refs.actionNew) {
    refs.actionNew.checked =
      true;
  }

  if (refs.actionAdd) {
    refs.actionAdd.checked =
      false;
  }

  if (refs.offsetX) {
    refs.offsetX.value = "0";
  }

  if (refs.offsetY) {
    refs.offsetY.value = "0";
  }

  phaseImportWorkspaceRenderPreview();
  phaseImportWorkspaceRenderSummary();
  phaseImportWorkspaceRenderBounds();
  phaseImportWorkspaceRenderMapping();

  void phaseImportWorkspaceRenderAction();
  void phaseImportWorkspaceLoadThumbnail();

  if (refs.overlay) {
    refs.overlay.hidden =
      false;
  }
}


function phaseImportWorkspaceValidFileName(
  name
) {
  if (
    typeof phaseGValidAnnotationFileName
      === "function"
  ) {
    return phaseGValidAnnotationFileName(
      name
    );
  }

  return (
    /^[A-Za-z0-9 _.-]{1,80}$/
      .test(name)
    && name !== "."
    && name !== ".."
  );
}


function phaseImportWorkspaceFreshId(
  used
) {
  let id = "";

  do {
    id =
      String(
        uid()
      );
  } while (
    used.has(id)
  );

  used.add(id);

  return id;
}


function phaseImportWorkspaceCollectMapping() {
  const refs =
    phaseImportWorkspaceRefs();

  const mapping =
    new Map();

  const canonical =
    phaseImportWorkspaceCanonicalClasses();

  for (
    const row
    of refs.mapping
      ?.querySelectorAll(
        ".phase-import-mapping-row"
      )
      || []
  ) {
    const index =
      Number(
        row.dataset.sourceIndex
      );

    const source =
      phaseImportWorkspaceState
        .sourceClasses[index];

    if (!source) {
      continue;
    }

    const select =
      row.querySelector(
        ".phase-import-target-select"
      );

    const custom =
      row.querySelector(
        ".phase-import-custom-class"
      );

    const choice =
      String(
        select?.value
        || "__ignore__"
      );

    let targetName =
      null;

    if (
      choice.startsWith(
        "existing:"
      )
    ) {
      const classIndex =
        Number(
          choice.split(":")[1]
        );

      targetName =
        canonical.find(
          (item) =>
            item.index
            === classIndex
        )?.name
        || null;

    } else if (
      choice === "__keep__"
    ) {
      targetName =
        source.name;

    } else if (
      choice === "__custom__"
    ) {
      targetName =
        String(
          custom?.value
          || ""
        ).trim();

      if (!targetName) {
        throw new Error(
          `Enter a custom class name for "${source.name}"`
        );
      }
    }

    mapping.set(
      source.name.toLowerCase(),
      {
        sourceName:
          source.name,
        sourceColor:
          source.color,
        targetName,
      }
    );
  }

  return mapping;
}


function phaseImportWorkspaceExistingClass(
  name
) {
  const normalized =
    String(
      name
      || ""
    ).trim();

  if (!normalized) {
    return null;
  }

  return (
    (
      classes
      || []
    ).find(
      (item) =>
        String(
          item?.name
          || ""
        )
          .trim()
          .toLowerCase()
        === normalized
          .toLowerCase()
    )
    || null
  );
}


function phaseImportWorkspaceEnsureTargetClass(
  name,
  sourceColor,
  addedClasses
) {
  const normalized =
    String(
      name
      || ""
    ).trim();

  if (!normalized) {
    return null;
  }

  const existing =
    phaseImportWorkspaceExistingClass(
      normalized
    );

  if (existing) {
    return existing;
  }

  let color =
    phaseImportWorkspaceColorToHex(
      sourceColor
    );

  if (!color) {
    color =
      (
        typeof phaseUXSuggestedUnusedClassColor
          === "function"
      )
        ? phaseUXSuggestedUnusedClassColor()
        : "#4dabf7";
  }

  const item = {
    name:
      normalized.slice(
        0,
        80
      ),

    color,
  };

  classes.push(
    item
  );

  if (
    typeof phaseUXRememberClassColor
      === "function"
  ) {
    phaseUXRememberClassColor(
      color
    );
  }

  addedClasses.push(
    item
  );

  return item;
}


function phaseImportWorkspaceMappedFeatures(
  mapping,
  action
) {
  const collection =
    phaseImportWorkspaceState
      .collection;

  const usedIds =
    new Set(
      (
        action
          === PHASE_IMPORT_ACTION_ADD
      )
        ? (
            featureCollection.features
            || []
          ).map(
            (feature) =>
              featureId(
                feature
              )
          )
        : []
    );

  const addedClasses = [];

  const mapped = [];

  const importedAt =
    new Date().toISOString();

  for (
    const original
    of collection.features
      || []
  ) {
    const sourceName =
      phaseImportWorkspaceSourceClass(
        original
      );

    const rule =
      mapping.get(
        sourceName.toLowerCase()
      );

    if (
      !rule
      || !rule.targetName
    ) {
      continue;
    }

    const targetClass =
      phaseImportWorkspaceEnsureTargetClass(
        rule.targetName,
        rule.sourceColor,
        addedClasses
      );

    if (!targetClass) {
      continue;
    }

    const feature =
      deepClone(
        original
      );

    const offset =
      phaseImportWorkspaceOffset();

    feature.geometry =
      phaseImportWorkspaceOffsetGeometry(
        feature.geometry,
        offset.x,
        offset.y
      );

    const sourceFeatureId =
      String(
        original.id
        ?? original?.properties?.id
        ?? ""
      ).trim();

    const sourceClassification =
      deepClone(
        original?.properties
          ?.classification
        ?? null
      );

    feature.id =
      phaseImportWorkspaceFreshId(
        usedIds
      );

    feature.properties =
      (
        feature.properties
        && typeof feature.properties
          === "object"
      )
        ? feature.properties
        : {};

    feature.properties.classification = {
      name:
        targetClass.name,

      color:
        hexToRgbArray(
          targetClass.color
        ),
    };

    feature.properties.histoannotator =
      (
        feature.properties
          .histoannotator
        && typeof feature.properties
          .histoannotator
          === "object"
      )
        ? feature.properties
            .histoannotator
        : {};

    feature.properties
      .histoannotator
      .importedFrom = {
        source:
          "geojson",

        file:
          String(
            phaseImportWorkspaceState
              .file?.name
            || "external.geojson"
          ),

        sourceFeatureId:
          sourceFeatureId
          || null,

        sourceClass:
          sourceName,

        targetClass:
          targetClass.name,

        appliedOffset: {
          x: offset.x,
          y: offset.y,
        },

        sourceClassification,

        sourceModel: {
          modelLabel:
            original?.properties?.model_label
            ?? null,

          modelClassId:
            original?.properties?.model_class_id
            ?? null,

          modelName:
            original?.properties?.model_name
            ?? null,

          modelVersion:
            original?.properties?.model_version
            ?? null,

          modelMagnification:
            original?.properties?.model_magnification
            ?? null,

          probability:
            original?.properties?.type_prob
            ?? null,

          classType:
            original?.properties?.class_type
            ?? null,

          slide:
            original?.properties?.slide
            ?? null,

          imageUuid:
            original?.properties?.anet_image_uuid
            ?? null,
        },

        importedAt,
      };

    mapped.push(
      feature
    );
  }

  return {
    mapped,
    addedClasses,
  };
}


async function phaseImportWorkspaceSyncClasses(
  addedClasses
) {
  if (
    !addedClasses?.length
  ) {
    return;
  }

  renderClassButtons();

  if (
    typeof writeLocalClasses
      === "function"
  ) {
    writeLocalClasses(
      true
    );
  }

  if (
    typeof syncClassesToServer
      === "function"
  ) {
    await syncClassesToServer();
  }
}


async function phaseImportWorkspaceReserveFile(
  target
) {
  let serverCreated =
    false;

  if (
    navigator.onLine
    && API
    && !currentImage.localNative
  ) {
    try {
      const response =
        await apiFetch(
          `${API}/annotations/${currentImage.id}/files`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name:
                  target,
              }),
          }
        );

      const payload =
        await response.json();

      if (
        Array.isArray(
          payload?.files
        )
        && payload.files.length
      ) {
        annotationFiles =
          payload.files;
      }

      serverCreated =
        true;

    } catch (error) {
      console.warn(
        "Could not reserve imported annotation file on server; keeping local pending file",
        error
      );
    }
  }

  if (
    !(
      annotationFiles
      || []
    ).some(
      (name) =>
        String(name)
          .trim()
          .toLowerCase()
        === target.toLowerCase()
    )
  ) {
    annotationFiles.push(
      target
    );
  }

  const deletedMeta =
    await getMeta(
      `deletedAnnotationFiles:${currentImage.id}`
    );

  const deletedNames =
    Array.isArray(
      deletedMeta
    )
      ? deletedMeta
      : [];

  if (
    deletedNames.includes(
      target
    )
  ) {
    await putMeta(
      `deletedAnnotationFiles:${currentImage.id}`,
      deletedNames.filter(
        (item) =>
          item !== target
      )
    );
  }

  await putMeta(
    `files:${currentImage.id}`,
    annotationFiles
  );

  return serverCreated;
}


async function phaseImportWorkspaceCreateNewFile(
  target,
  mapped,
  role,
  sourceType
) {
  if (
    !phaseImportWorkspaceValidFileName(
      target
    )
  ) {
    throw new Error(
      "Use 1–80 letters, numbers, spaces, _, . or - for the Annotation File name."
    );
  }

  if (
    (
      annotationFiles
      || []
    ).some(
      (name) =>
        String(name)
          .trim()
          .toLowerCase()
        === target
          .toLowerCase()
    )
  ) {
    throw new Error(
      `Annotation File "${target}" already exists. Choose another name.`
    );
  }

  if (dirty) {
    await saveAnnotations(
      false
    );
  }

  const serverCreated =
    await phaseImportWorkspaceReserveFile(
      target
    );

  currentAnnotationFile =
    target;

  featureCollection = {
    type:
      "FeatureCollection",

    features:
      mapped,
  };

  featureCollection.features
    .forEach(
      featureId
    );

  clearSelectedFeatures(
    false
  );

  undoStack = [];
  redoStack = [];
  pathologistDraft = null;
  activeDraft = null;
  pointerState = null;

  currentLocalRevision = 0;
  currentLastSyncedRevision = 0;
  currentPendingChangeCount = 0;

  dirty = true;

  const revision =
    nextLocalRevision();

  currentPendingChangeCount =
    1;

  localDraftState =
    "Imported locally";

  await persistLocalDraft(
    true,
    currentImage,
    deepClone(
      featureCollection
    ),
    {
      annotationFile:
        target,

      localRevision:
        revision,

      lastSyncedRevision:
        0,

      pendingChangeCount:
        1,
    }
  );

  if (
    typeof phaseEvalSaveFileMetadata
      === "function"
  ) {
    await phaseEvalSaveFileMetadata(
      currentImage.id,
      target,
      {
        role,
        sourceType,
      }
    );
  }

  renderAnnotationFileOptions();
  drawAnnotations();
  updateControls();
  updateDiagnostics();

  if (
    navigator.onLine
    && API
    && !currentImage.localNative
  ) {
    try {
      await saveAnnotations(
        false
      );
    } catch (error) {
      console.warn(
        "Imported annotation file remains pending locally",
        error
      );
    }
  }

  return {
    serverCreated,
  };
}


async function phaseImportWorkspaceAddCurrent(
  mapped
) {
  pushUndo();

  featureCollection.features = [
    ...featureCollection.features,
    ...mapped,
  ];

  clearSelectedFeatures(
    false
  );

  markChanged();

  drawAnnotations();
  updateControls();
  updateDiagnostics();
}


async function phaseImportWorkspaceApply() {
  const refs =
    phaseImportWorkspaceRefs();

  if (
    !currentImage
    || !phaseImportWorkspaceState
      .collection
  ) {
    phaseImportWorkspaceSetStatus(
      "No GeoJSON file is ready to import.",
      true
    );

    return;
  }

  refs.apply.disabled =
    true;

  phaseImportWorkspaceSetStatus(
    "Preparing import…"
  );

  try {
    const action =
      phaseImportWorkspaceAction();

    const mapping =
      phaseImportWorkspaceCollectMapping();

    const {
      mapped,
      addedClasses,
    } =
      phaseImportWorkspaceMappedFeatures(
        mapping,
        action
      );

    if (!mapped.length) {
      throw new Error(
        "No features remain after class mapping. Map at least one source class."
      );
    }

    if (
      action
      === PHASE_IMPORT_ACTION_NEW
    ) {
      const target =
        String(
          refs.targetName?.value
          || ""
        ).trim();

      const role =
        String(
          refs.role?.value
          || "annotation"
        );

      const sourceType =
        String(
          refs.source?.value
          || "external"
        );

      await phaseImportWorkspaceCreateNewFile(
        target,
        mapped,
        role,
        sourceType
      );

      await phaseImportWorkspaceSyncClasses(
        addedClasses
      );

      phaseImportWorkspaceClose();

      setStatus(
        (
          `Imported ${mapped.length} feature`
          + (
              mapped.length === 1
                ? ""
                : "s"
            )
          + ` as Annotation File "${target}" · `
          + `${role} · ${sourceType}`
        ),
        navigator.onLine
          ? "saved"
          : "local"
      );

      return;
    }

    const currentName =
      String(
        currentAnnotationFile
        || "Default"
      );

    const before =
      featureCollection.features
        ?.length
      || 0;

    await phaseImportWorkspaceAddCurrent(
      mapped
    );

    await phaseImportWorkspaceSyncClasses(
      addedClasses
    );

    const after =
      featureCollection.features
        .length;

    phaseImportWorkspaceClose();

    setStatus(
      (
        `Added ${mapped.length} feature`
        + (
            mapped.length === 1
              ? ""
              : "s"
          )
        + ` to "${currentName}" · `
        + `${before} → ${after} total · one Undo step`
      ),
      "saved"
    );

  } catch (error) {
    phaseImportWorkspaceSetStatus(
      error.message
      || String(error),
      true
    );

  } finally {
    refs.apply.disabled =
      false;
  }
}


// Override the existing import callback. Selecting a file now opens this
// workspace instead of replacing or immediately appending anything.
importGeoJson =
  async function phaseImportWorkspaceImportGeoJson(
    file
  ) {
    if (
      !file
      || !currentImage
    ) {
      return;
    }

    try {
      const payload =
        JSON.parse(
          await file.text()
        );

      if (
        payload?.type
          !== "FeatureCollection"
        || !Array.isArray(
          payload.features
        )
      ) {
        throw new Error(
          "The file is not a GeoJSON FeatureCollection"
        );
      }


      // Cellular GeoJSON bypasses the tissue import workspace.
      //
      // This check belongs in the workspace import callback itself because
      // this module currently owns Import GeoJSON… and would otherwise open
      // the tissue Class mapping UI first.
      if (
        typeof phaseCellPayloadLooksCellular
          === "function"
        && typeof phaseCellImportPayload
          === "function"
        && phaseCellPayloadLooksCellular(
          payload
        )
      ) {
        await phaseCellImportPayload(
          file,
          payload
        );

        if (els.importInput) {
          els.importInput.value =
            "";
        }

        return;
      }

      const collection =
        phaseImportWorkspaceNormalizeExternalCollection(
          payload
        );

      if (
        !collection.features
          ?.length
      ) {
        throw new Error(
          "The GeoJSON contains no features"
        );
      }

      phaseImportWorkspaceOpen(
        file,
        collection
      );

    } catch (error) {
      setStatus(
        `Invalid GeoJSON: ${error.message}`,
        "error"
      );

      if (els.importInput) {
        els.importInput.value =
          "";
      }
    }
  };


function phaseImportWorkspaceUpdateMenuLabel() {
  const button =
    els.importGeoJsonButton
    || document.getElementById(
      "importGeoJsonButton"
    );

  if (!button) {
    return;
  }

  button.textContent =
    "Import GeoJSON…";

  button.title =
    (
      "Preview and map an external GeoJSON, then import it "
      + "as a new Annotation File or add it to the current file."
    );
}


phaseImportWorkspaceEnsureUi();
phaseImportWorkspaceUpdateMenuLabel();
