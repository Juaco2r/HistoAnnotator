// ========================================================================
// Detailed / Interactive Learning refinements
//
// Keeps this corrective layer separate from the initial Detailed Tools
// implementation. Runtime is still the deterministic single frontend bundle.
// ========================================================================

// ------------------------------------------------------------------------
// Detailed: persistent measurement information when Select is used.
// ------------------------------------------------------------------------

function phaseDetailedRefinementSelectedFeature() {
  if (
    selectedIds.size !== 1
    || !selectedId
  ) {
    return null;
  }

  const feature =
    findFeature(selectedId);

  const detailed =
    feature?.properties
      ?.histoannotator
      ?.detailed;

  if (
    !feature
    || !detailed
  ) {
    return null;
  }

  return feature;
}


function phaseDetailedRefinementMeasurementText(
  feature
) {
  const geometry =
    feature?.geometry;

  const kind =
    String(
      feature?.properties
        ?.histoannotator
        ?.detailed
        ?.kind
      || ""
    );

  if (
    geometry?.type === "LineString"
    && Array.isArray(
      geometry.coordinates
    )
    && geometry.coordinates.length >= 2
  ) {
    const label =
      kind === "line"
        ? "Straight line"
        : "Open line";

    return (
      `${label} · `
      + phaseDetailedFormatLength(
        geometry.coordinates
      )
    );
  }

  if (
    geometry?.type === "Point"
    && Array.isArray(
      geometry.coordinates
    )
  ) {
    const x =
      Number(
        geometry.coordinates[0]
      );

    const y =
      Number(
        geometry.coordinates[1]
      );

    if (
      Number.isFinite(x)
      && Number.isFinite(y)
    ) {
      return (
        `Point · x ${x.toFixed(1)} px`
        + ` · y ${y.toFixed(1)} px`
      );
    }
  }

  return "";
}


function phaseDetailedRefinementMeasurementElement() {
  if (!els.selectionActions) {
    return null;
  }

  let element =
    document.getElementById(
      "phaseDetailedSelectionMeasurement"
    );

  if (!element) {
    element =
      document.createElement(
        "span"
      );

    element.id =
      "phaseDetailedSelectionMeasurement";

    element.className =
      "phase-detailed-selection-measurement";

    element.style.fontSize =
      "0.78rem";

    element.style.fontWeight =
      "600";

    element.style.opacity =
      "0.88";

    element.style.whiteSpace =
      "nowrap";

    element.style.margin =
      "0 6px";

    if (
      els.selectionCount
      ?.parentElement
      === els.selectionActions
    ) {
      els.selectionCount
        .insertAdjacentElement(
          "afterend",
          element
        );
    } else {
      els.selectionActions
        .prepend(element);
    }
  }

  return element;
}


function phaseDetailedRefinementUpdateMeasurement() {
  const element =
    phaseDetailedRefinementMeasurementElement();

  if (!element) {
    return;
  }

  const feature =
    phaseDetailedRefinementSelectedFeature();

  const text =
    phaseDetailedRefinementMeasurementText(
      feature
    );

  element.hidden =
    !text;

  element.textContent =
    text;
}


const phaseDetailedRefinementBaseUpdateSelectionActions =
  updateSelectionActions;

updateSelectionActions =
  function phaseDetailedRefinementUpdateSelectionActions(
    ...args
  ) {
    const result =
      phaseDetailedRefinementBaseUpdateSelectionActions(
        ...args
      );

    phaseDetailedRefinementUpdateMeasurement();

    return result;
  };


const phaseDetailedRefinementBaseSetSingleSelection =
  setSingleSelection;

setSingleSelection =
  function phaseDetailedRefinementSetSingleSelection(
    id,
    implicit = false
  ) {
    const result =
      phaseDetailedRefinementBaseSetSingleSelection(
        id,
        implicit
      );

    if (!implicit) {
      const feature =
        phaseDetailedRefinementSelectedFeature();

      const text =
        phaseDetailedRefinementMeasurementText(
          feature
        );

      if (text) {
        setStatus(
          text,
          "saved"
        );
      }
    }

    return result;
  };


function phaseDetailedRefinementMeasurementLabelElement() {
  return document.getElementById(
    "phaseDetailedMeasurementLabel"
  );
}


// ------------------------------------------------------------------------
// Detailed Open Line: continuous freehand LineString, saved on pen-up.
// ------------------------------------------------------------------------

let phaseDetailedFreehandPointerId =
  null;


function phaseDetailedRefinementAppendFreehandSamples(
  event
) {
  const samples =
    (
      typeof event
        ?.getCoalescedEvents
      === "function"
    )
      ? event.getCoalescedEvents()
      : [event];

  const usableSamples =
    samples?.length
      ? samples
      : [event];

  for (
    const sample
    of usableSamples
  ) {
    const point =
      imagePointFromPointer(
        sample
      );

    if (
      !point
      || !phaseGPointInsideImage(
        point
      )
    ) {
      continue;
    }

    const clamped =
      phaseGClampPointToImage(
        point
      );

    const last =
      phaseDetailedPolyline[
        phaseDetailedPolyline.length - 1
      ];

    const threshold =
      screenToleranceToImage(
        0.5
      );

    if (
      !last
      || phaseDetailedSegmentLengthPx(
        last,
        clamped
      ) > threshold
    ) {
      phaseDetailedPolyline.push(
        clamped
      );
    }
  }
}


const phaseDetailedRefinementBaseResetDraft =
  phaseDetailedResetDraft;

phaseDetailedResetDraft =
  function phaseDetailedRefinementResetDraft() {
    phaseDetailedFreehandPointerId =
      null;

    return phaseDetailedRefinementBaseResetDraft();
  };


phaseDetailedUpdatePolylineActions =
  function phaseDetailedRefinementPolylineActions() {
    const actions =
      phaseDetailedActions();

    if (actions) {
      actions.hidden = true;
    }

    const label =
      phaseDetailedRefinementMeasurementLabelElement();

    if (label) {
      label.textContent = "";
    }
  };


const phaseDetailedRefinementBasePointerDown =
  phaseDetailedPointerDown;

phaseDetailedPointerDown =
  function phaseDetailedRefinementPointerDown(
    event
  ) {
    if (
      drawingProfile !== "detailed"
      || mode !== "detail-polyline"
    ) {
      return phaseDetailedRefinementBasePointerDown(
        event
      );
    }

    trackPenLifecycle(event);

    if (
      suppressPalmTouch(event)
    ) {
      return;
    }

    if (
      !captureAnnotationEvent(event)
    ) {
      updateDiagnostics();
      return;
    }

    const point =
      imagePointFromPointer(
        event
      );

    if (
      !point
      || !phaseGPointInsideImage(
        point
      )
    ) {
      return;
    }

    try {
      viewer.container
        .setPointerCapture(
          event.pointerId
        );
    } catch (_) {
      // Pointer capture is best effort.
    }

    phaseDetailedFreehandPointerId =
      event.pointerId;

    phaseDetailedPolyline =
      [
        phaseGClampPointToImage(
          point
        ),
      ];

    phaseDetailedHoverPoint =
      null;

    phaseDetailedUpdatePolylineActions();

    setStatus(
      "Open line: draw continuously and lift the stylus to save",
      "local"
    );

    drawAnnotations();
  };


const phaseDetailedRefinementBasePointerMove =
  phaseDetailedPointerMove;

phaseDetailedPointerMove =
  function phaseDetailedRefinementPointerMove(
    event
  ) {
    if (
      drawingProfile !== "detailed"
      || mode !== "detail-polyline"
      || phaseDetailedFreehandPointerId
        === null
    ) {
      return phaseDetailedRefinementBasePointerMove(
        event
      );
    }

    if (
      event.pointerId
      !== phaseDetailedFreehandPointerId
    ) {
      return;
    }

    trackPenLifecycle(event);

    if (
      suppressPalmTouch(event)
    ) {
      return;
    }

    if (
      !captureAnnotationEvent(event)
    ) {
      return;
    }

    phaseDetailedRefinementAppendFreehandSamples(
      event
    );

    if (
      typeof phaseF26ScheduleDraw
      === "function"
    ) {
      phaseF26ScheduleDraw();
    } else {
      drawAnnotations();
    }
  };


const phaseDetailedRefinementBaseHandlePointerUp =
  handlePointerUp;

handlePointerUp =
  function phaseDetailedRefinementHandlePointerUp(
    event
  ) {
    if (
      drawingProfile === "detailed"
      && mode === "detail-polyline"
      && phaseDetailedFreehandPointerId
        !== null
      && event.pointerId
        === phaseDetailedFreehandPointerId
    ) {
      trackPenLifecycle(event);

      if (
        suppressPalmTouch(event)
      ) {
        return;
      }

      captureAnnotationEvent(event);

      phaseDetailedRefinementAppendFreehandSamples(
        event
      );

      const raw =
        deepClone(
          phaseDetailedPolyline
        );

      const prepared =
        prepareOpenStroke(
          raw,
          Math.max(
            0.08,
            screenToleranceToImage(
              0.12
            )
          )
        );

      const minimumLength =
        screenToleranceToImage(
          3
        );

      try {
        viewer.container
          .releasePointerCapture(
            event.pointerId
          );
      } catch (_) {
        // Pointer capture is best effort.
      }

      phaseDetailedResetDraft();

      if (
        prepared.length < 2
        || phaseDetailedLengthPx(
          prepared
        ) < minimumLength
      ) {
        setStatus(
          "Open line is too short",
          "local"
        );

        return;
      }

      phaseDetailedCommit(
        {
          type: "LineString",
          coordinates:
            prepared,
        },
        "open-line"
      );

      return;
    }

    return phaseDetailedRefinementBaseHandlePointerUp(
      event
    );
  };


const phaseDetailedRefinementBaseHandlePointerCancel =
  handlePointerCancel;

handlePointerCancel =
  function phaseDetailedRefinementHandlePointerCancel(
    event
  ) {
    if (
      drawingProfile === "detailed"
      && mode === "detail-polyline"
      && phaseDetailedFreehandPointerId
        !== null
      && event.pointerId
        === phaseDetailedFreehandPointerId
    ) {
      trackPenLifecycle(event);

      try {
        captureAnnotationEvent(
          event
        );
      } catch (_) {}

      try {
        viewer.container
          .releasePointerCapture(
            event.pointerId
          );
      } catch (_) {}

      phaseDetailedResetDraft();

      setStatus(
        "Open line cancelled",
        "local"
      );

      return;
    }

    return phaseDetailedRefinementBaseHandlePointerCancel(
      event
    );
  };


// ------------------------------------------------------------------------
// Interactive Learning: restore isolated one-at-a-time review.
// ------------------------------------------------------------------------

function phaseILRefinementHasCurrentSuggestion() {
  if (
    !phaseIL1State?.open
    || phaseIL1State.documentKey
      !== phaseIL1DocumentKey()
    || !Array.isArray(
      phaseIL1State.suggestions
    )
    || !phaseIL1State.suggestions.length
  ) {
    return false;
  }

  const index =
    Math.max(
      0,
      Math.min(
        Number(
          phaseIL1State.index
        ) || 0,
        phaseIL1State
          .suggestions.length - 1
      )
    );

  return Boolean(
    phaseIL1State
      .suggestions[index]
  );
}


function phaseILRefinementEditFeature() {
  if (!phaseIL21EditSession) {
    return null;
  }

  const id =
    String(
      phaseIL21EditSession
        .featureId
      || ""
    );

  if (!id) {
    return null;
  }

  return (
    featureCollection.features
      || []
  ).find(
    (feature) =>
      String(
        feature?.id
        || ""
      ) === id
  ) || null;
}


function phaseILRefinementEditSessionIsLive() {
  if (
    !phaseIL21EditSession
    || !phaseIL1State?.open
    || !phaseILRefinementEditFeature()
  ) {
    return false;
  }

  const accept =
    document.getElementById(
      "phaseIL1AcceptButton"
    );

  return (
    String(
      accept?.textContent
      || ""
    ).trim()
    === "Accept edit"
  );
}


function phaseILRefinementDropEditSession() {
  if (!phaseIL21EditSession) {
    return;
  }

  phaseIL21EditSession =
    null;

  try {
    phaseIL21SetEditingUi(
      false
    );
  } catch (_) {}

  try {
    updatePathologistActions();
  } catch (_) {}
}


function phaseILRefinementRepairStaleEditSession() {
  if (!phaseIL21EditSession) {
    return false;
  }

  if (
    phaseILRefinementEditSessionIsLive()
  ) {
    return true;
  }

  phaseILRefinementDropEditSession();

  return false;
}


// Show exactly ONE temporary IL suggestion.
phaseIL1DrawSuggestions =
  function phaseILRefinementDrawCurrentSuggestionOnly() {
    if (
      !phaseIL1State.open
      || !phaseIL1State.suggestions.length
      || phaseIL1State.documentKey
        !== phaseIL1DocumentKey()
      || phaseIL21EditSession
      || !phaseIL22SuggestionOverlayVisible
    ) {
      return;
    }

    const index =
      Math.max(
        0,
        Math.min(
          Number(
            phaseIL1State.index
          ) || 0,
          phaseIL1State
            .suggestions.length - 1
        )
      );

    const suggestion =
      phaseIL1State
        .suggestions[index];

    if (!suggestion?.geometry) {
      return;
    }

    phaseIL22FillGeometry(
      suggestion.geometry,
      "#fff200"
    );

    phaseIL1DrawGeometry(
      suggestion.geometry,
      "#fff200",
      3.6
    );
  };


// Hide normal annotation features while a suggestion is being reviewed.
// Preserve structural ROI features. During Edit, show only the converted
// feature being edited.
const phaseILRefinementBaseDrawGeometry =
  drawGeometry;

drawGeometry =
  function phaseILRefinementDrawGeometry(
    feature
  ) {
    if (
      phaseIL1State?.open
      && phaseDIsAnnotationFeature(
        feature
      )
    ) {
      if (
        phaseIL21EditSession
      ) {
        const editingId =
          String(
            phaseIL21EditSession
              .featureId
            || ""
          );

        if (
          String(
            featureId(feature)
          ) !== editingId
        ) {
          return;
        }
      } else if (
        phaseILRefinementHasCurrentSuggestion()
      ) {
        return;
      }
    }

    return phaseILRefinementBaseDrawGeometry(
      feature
    );
  };


// Stale edit sessions made both Edit and Hide appear dead. Repair the session
// before either action, while still protecting a genuinely active edit.
const phaseILRefinementBaseStartEdit =
  phaseIL21StartEdit;

phaseIL21StartEdit =
  function phaseILRefinementStartEdit(
    suggestion
  ) {
    if (
      phaseIL21EditSession
      && phaseILRefinementRepairStaleEditSession()
    ) {
      return;
    }

    return phaseILRefinementBaseStartEdit(
      suggestion
    );
  };


const phaseILRefinementBaseToggleSuggestionOverlay =
  phaseIL22ToggleSuggestionOverlay;

phaseIL22ToggleSuggestionOverlay =
  function phaseILRefinementToggleSuggestionOverlay() {
    if (
      phaseIL21EditSession
      && phaseILRefinementRepairStaleEditSession()
    ) {
      return;
    }

    return phaseILRefinementBaseToggleSuggestionOverlay();
  };


const phaseILRefinementBaseRenderSuggestionState =
  phaseIL1RenderSuggestionState;

phaseIL1RenderSuggestionState =
  function phaseILRefinementRenderSuggestionState(
    ...args
  ) {
    phaseILRefinementRepairStaleEditSession();

    try {
      phaseIL2EnsureUi();
    } catch (_) {}

    return phaseILRefinementBaseRenderSuggestionState(
      ...args
    );
  };


const phaseILRefinementBaseClearSuggestions =
  phaseIL1ClearSuggestions;

phaseIL1ClearSuggestions =
  function phaseILRefinementClearSuggestions(
    ...args
  ) {
    phaseILRefinementDropEditSession();

    return phaseILRefinementBaseClearSuggestions(
      ...args
    );
  };


const phaseILRefinementBaseClose =
  phaseIL1Close;

phaseIL1Close =
  function phaseILRefinementClose(
    ...args
  ) {
    phaseILRefinementDropEditSession();

    return phaseILRefinementBaseClose(
      ...args
    );
  };


// ------------------------------------------------------------------------
// Pathologist controls: use the upper collision-safe position during both
// Review Mode and an active Interactive Learning edit.
// ------------------------------------------------------------------------

const phaseILRefinementBaseUpdatePathologistActions =
  updatePathologistActions;

updatePathologistActions =
  function phaseILRefinementUpdatePathologistActions(
    ...args
  ) {
    const result =
      phaseILRefinementBaseUpdatePathologistActions(
        ...args
      );

    if (
      els.pathologistActions
    ) {
      const collisionSensitive =
        Boolean(
          reviewState.active
          || phaseILRefinementEditSessionIsLive()
        );

      els.pathologistActions
        .classList.toggle(
          "review-safe",
          collisionSensitive
          && !els.pathologistActions.hidden
        );
    }

    return result;
  };


const phaseILRefinementBaseSetEditingUi =
  phaseIL21SetEditingUi;

phaseIL21SetEditingUi =
  function phaseILRefinementSetEditingUi(
    editing
  ) {
    const result =
      phaseILRefinementBaseSetEditingUi(
        editing
      );

    try {
      updatePathologistActions();
    } catch (_) {}

    return result;
  };
