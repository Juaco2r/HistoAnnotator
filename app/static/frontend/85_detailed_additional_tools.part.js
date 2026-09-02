// Detailed annotation tools + Additional Tools launcher + workflow UX fixes.
  const PHASE_DETAILED_MODES = new Set([
    "detail-point",
    "detail-line",
    "detail-polyline",
  ]);

  let phaseDetailedLineStart = null;
  let phaseDetailedPolyline = [];
  let phaseDetailedHoverPoint = null;

  function phaseDetailedIsMode(value = mode) {
    return PHASE_DETAILED_MODES.has(String(value || ""));
  }

  function phaseDetailedSegmentLengthPx(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    return Math.hypot(
      Number(b[0]) - Number(a[0]),
      Number(b[1]) - Number(a[1])
    );
  }

  function phaseDetailedLengthPx(points) {
    let total = 0;
    for (let i = 1; i < (points || []).length; i += 1) {
      total += phaseDetailedSegmentLengthPx(points[i - 1], points[i]);
    }
    return total;
  }

  function phaseDetailedMppPair() {
    const x = Number(currentInfo?.mppX);
    const y = Number(currentInfo?.mppY);
    if (Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0) {
      return { x, y, source: currentInfo?.calibrationSource || "Image metadata" };
    }
    const effective = effectiveCalibration?.();
    const fallback = Number(effective?.mpp);
    if (Number.isFinite(fallback) && fallback > 0) {
      return { x: fallback, y: fallback, source: effective?.source || "Effective calibration" };
    }
    return null;
  }

  function phaseDetailedLengthUm(points) {
    const calibration = phaseDetailedMppPair();
    if (!calibration) return null;
    let total = 0;
    for (let i = 1; i < (points || []).length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = (Number(b[0]) - Number(a[0])) * calibration.x;
      const dy = (Number(b[1]) - Number(a[1])) * calibration.y;
      total += Math.hypot(dx, dy);
    }
    return total;
  }

  function phaseDetailedMeasurements(points) {
    return {
      lengthPx: phaseDetailedLengthPx(points),
      lengthUm: phaseDetailedLengthUm(points),
    };
  }

  function phaseDetailedFormatLength(points) {
    const values = phaseDetailedMeasurements(points);
    const px = `${values.lengthPx.toFixed(values.lengthPx < 10 ? 2 : 1)} px`;
    if (!Number.isFinite(values.lengthUm)) return px;
    if (values.lengthUm >= 1000) {
      return `${px} · ${(values.lengthUm / 1000).toFixed(3)} mm`;
    }
    return `${px} · ${values.lengthUm.toFixed(values.lengthUm < 10 ? 2 : 1)} µm`;
  }

  function phaseDetailedFeature(geometry, kind) {
    const feature = createAnnotationFeature(geometry);
    const histo = phaseCEnsureFeatureMetadata(feature);
    histo.detailed = { schemaVersion: 1, kind };

    if (geometry.type === "Point") {
      const [x, y] = geometry.coordinates;
      histo.detailed.xPx = Number(x);
      histo.detailed.yPx = Number(y);
      feature.properties.measurements = {
        "X px": Number(x),
        "Y px": Number(y),
      };
    } else if (geometry.type === "LineString") {
      const measurements = phaseDetailedMeasurements(geometry.coordinates);
      histo.detailed.lengthPx = measurements.lengthPx;
      feature.properties.measurements = { "Length px": measurements.lengthPx };
      if (Number.isFinite(measurements.lengthUm)) {
        histo.detailed.lengthUm = measurements.lengthUm;
        histo.detailed.calibration = phaseDetailedMppPair();
        feature.properties.measurements["Length µm"] = measurements.lengthUm;
      }
    }
    return feature;
  }

  function phaseDetailedCommit(geometry, kind) {
    if (!currentImage || !geometry) return false;
    const feature = phaseDetailedFeature(geometry, kind);
    pushUndo();
    featureCollection.features.push(feature);
    setSingleSelection(String(feature.id), true);
    markChanged();
    if (geometry.type === "Point") {
      setStatus("Point annotation created", "saved");
    } else {
      const label = kind === "line" ? "Straight line" : "Open line";
      setStatus(`${label} created · ${phaseDetailedFormatLength(geometry.coordinates)}`, "saved");
    }
    return true;
  }

  function phaseDetailedActions() {
    return document.getElementById("phaseDetailedPolylineActions");
  }

  function phaseDetailedResetDraft(redraw = true) {
    phaseDetailedLineStart = null;
    phaseDetailedPolyline = [];
    phaseDetailedHoverPoint = null;
    const actions = phaseDetailedActions();
    if (actions) actions.hidden = true;
    const label = document.getElementById("phaseDetailedMeasurementLabel");
    if (label) label.textContent = "";
    if (redraw) drawAnnotations();
  }

  function phaseDetailedUpdatePolylineActions() {
    const actions = phaseDetailedActions();
    if (!actions) return;
    const active = drawingProfile === "detailed"
      && mode === "detail-polyline"
      && phaseDetailedPolyline.length > 0;
    actions.hidden = !active;
    const label = document.getElementById("phaseDetailedMeasurementLabel");
    if (label) {
      label.textContent = active
        ? `${phaseDetailedPolyline.length} point(s)${phaseDetailedPolyline.length > 1 ? ` · ${phaseDetailedFormatLength(phaseDetailedPolyline)}` : ""}`
        : "";
    }
  }

  function phaseDetailedFinishPolyline() {
    if (phaseDetailedPolyline.length < 2) {
      setStatus("Open line needs at least two points", "local");
      return;
    }
    phaseDetailedCommit({
      type: "LineString",
      coordinates: deepClone(phaseDetailedPolyline),
    }, "polyline");
    phaseDetailedResetDraft();
  }

  function phaseDetailedPointerDown(event) {
    trackPenLifecycle(event);
    if (suppressPalmTouch(event)) return;
    if (!captureAnnotationEvent(event)) {
      updateDiagnostics();
      return;
    }
    const viewerPosition = viewerPositionFromPointer(event);
    const rawPoint = imagePointFromViewerPosition(viewerPosition);
    if (!rawPoint || !phaseGPointInsideImage(rawPoint)) return;
    const point = phaseGClampPointToImage(rawPoint);

    if (mode === "detail-point") {
      phaseDetailedCommit({ type: "Point", coordinates: deepClone(point) }, "point");
      drawAnnotations();
      return;
    }

    if (mode === "detail-line") {
      if (!phaseDetailedLineStart) {
        phaseDetailedLineStart = deepClone(point);
        phaseDetailedHoverPoint = deepClone(point);
        setStatus("Straight line: select the end point", "local");
        drawAnnotations();
        return;
      }
      const points = [phaseDetailedLineStart, point];
      if (phaseDetailedSegmentLengthPx(points[0], points[1]) < screenToleranceToImage(2)) {
        setStatus("Line is too short", "local");
        return;
      }
      phaseDetailedCommit({ type: "LineString", coordinates: deepClone(points) }, "line");
      phaseDetailedResetDraft();
      return;
    }

    if (mode === "detail-polyline") {
      phaseDetailedPolyline.push(deepClone(point));
      phaseDetailedHoverPoint = deepClone(point);
      phaseDetailedUpdatePolylineActions();
      setStatus(`Open line: ${phaseDetailedPolyline.length} point(s) · Finish line when complete`, "local");
      drawAnnotations();
    }
  }

  function phaseDetailedPointerMove(event) {
    if (drawingProfile !== "detailed" || !["detail-line", "detail-polyline"].includes(mode)) return;
    if (!currentImage || !viewer || !viewer.world?.getItemCount?.()) return;
    try {
      const p = imagePointFromViewerPosition(viewerPositionFromPointer(event));
      if (p && phaseGPointInsideImage(p)) {
        phaseDetailedHoverPoint = phaseGClampPointToImage(p);
        drawAnnotations();
      }
    } catch (_) { /* hover preview is best effort */ }
  }

  function phaseDetailedDrawLine(points, color, selected = false, dashed = false) {
    const screen = (points || []).map(screenPointFromImage).filter(Boolean);
    if (!screen.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = selected ? 4 : 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (dashed) ctx.setLineDash([7, 5]);
    if (screen.length === 1) {
      ctx.beginPath();
      ctx.arc(screen[0].x, screen[0].y, selected ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(screen[0].x, screen[0].y);
    for (let i = 1; i < screen.length; i += 1) ctx.lineTo(screen[i].x, screen[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function phaseDetailedDrawDraft() {
    if (drawingProfile !== "detailed") return;
    const color = drawingColor("new");
    if (mode === "detail-line" && phaseDetailedLineStart) {
      const points = [phaseDetailedLineStart];
      if (phaseDetailedHoverPoint) points.push(phaseDetailedHoverPoint);
      phaseDetailedDrawLine(points, color, false, true);
    }
    if (mode === "detail-polyline" && phaseDetailedPolyline.length) {
      const points = [...phaseDetailedPolyline];
      if (phaseDetailedHoverPoint) points.push(phaseDetailedHoverPoint);
      phaseDetailedDrawLine(points, color, false, true);
      phaseDetailedPolyline.forEach((point) => phaseDetailedDrawLine([point], color));
    }
  }

  function phaseDetailedDistancePointToSegment(point, start, end) {
    const [px, py] = (point || []).map(Number);
    const [ax, ay] = (start || []).map(Number);
    const [bx, by] = (end || []).map(Number);
    if (![px, py, ax, ay, bx, by].every(Number.isFinite)) return Infinity;
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy;
    if (denom <= 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function phaseDetailedHitFeature(feature, point) {
    const geometry = feature?.geometry;
    if (!geometry) return false;
    const tolerance = Math.max(1, screenToleranceToImage(8));
    if (geometry.type === "Point") {
      return phaseDetailedSegmentLengthPx(geometry.coordinates, point) <= tolerance;
    }
    if (geometry.type !== "LineString") return false;
    const coordinates = geometry.coordinates || [];
    for (let i = 1; i < coordinates.length; i += 1) {
      if (phaseDetailedDistancePointToSegment(point, coordinates[i - 1], coordinates[i]) <= tolerance) return true;
    }
    return false;
  }

  // Extend hit testing without changing polygon semantics.
  const phaseDetailedBaseHitTest = hitTest;
  hitTest = function phaseDetailedHitTest(point) {
    for (let i = featureCollection.features.length - 1; i >= 0; i -= 1) {
      const feature = featureCollection.features[i];
      if (phaseDetailedHitFeature(feature, point)) return featureId(feature);
    }
    return phaseDetailedBaseHitTest(point);
  };

  // Render Point/LineString while preserving the established polygon renderer.
  const phaseDetailedBaseDrawGeometry = drawGeometry;
  drawGeometry = function phaseDetailedDrawGeometry(feature) {
    const geometry = feature?.geometry;
    if (geometry?.type !== "Point" && geometry?.type !== "LineString") {
      return phaseDetailedBaseDrawGeometry(feature);
    }
    if (reviewState.active && String(featureId(feature)) !== String(reviewState.currentId || "")) return;
    const color = colorForFeature(feature);
    const selected = selectedIds.has(featureId(feature));
    phaseDetailedDrawLine(
      geometry.type === "Point" ? [geometry.coordinates] : geometry.coordinates,
      color,
      selected,
      false
    );
  };

  const phaseDetailedBaseDrawAnnotations = drawAnnotations;
  drawAnnotations = function phaseDetailedDrawAnnotations(...args) {
    const result = phaseDetailedBaseDrawAnnotations(...args);
    phaseDetailedDrawDraft();
    return result;
  };

  // Detailed pointer modes are click-based; fingers remain navigation-only via
  // captureAnnotationEvent().
  const phaseDetailedBaseHandlePointerDown = handlePointerDown;
  handlePointerDown = function phaseDetailedHandlePointerDown(event) {
    if (drawingProfile === "detailed" && phaseDetailedIsMode()) {
      phaseDetailedPointerDown(event);
      return;
    }
    return phaseDetailedBaseHandlePointerDown(event);
  };

  const phaseDetailedBaseHandlePointerMove = handlePointerMove;
  handlePointerMove = function phaseDetailedHandlePointerMove(event) {
    if (drawingProfile === "detailed" && phaseDetailedIsMode()) phaseDetailedPointerMove(event);
    return phaseDetailedBaseHandlePointerMove(event);
  };

  const phaseDetailedBaseSetMode = setMode;
  setMode = function phaseDetailedSetMode(nextMode) {
    if (nextMode !== mode && phaseDetailedIsMode()) phaseDetailedResetDraft(false);
    const result = phaseDetailedBaseSetMode(nextMode);
    phaseDetailedUpdatePolylineActions();
    return result;
  };

  // Extend the existing two-profile workflow with Detailed while leaving
  // Default and Pathologist behavior unchanged.
  const phaseDetailedBaseSetDrawingProfile = setDrawingProfile;
  setDrawingProfile = function phaseDetailedSetDrawingProfile(profile) {
    if (profile !== "detailed") {
      const result = phaseDetailedBaseSetDrawingProfile(profile);
      const group = document.getElementById("phaseDetailedToolGroup");
      if (group) group.hidden = true;
      if (phaseDetailedIsMode()) {
        phaseDetailedResetDraft(false);
        setMode("freehand");
      }
      return result;
    }

    drawingProfile = "detailed";
    if (els.drawingProfileSelect) els.drawingProfileSelect.value = "detailed";
    pathologistDraft = null;
    const group = document.getElementById("phaseDetailedToolGroup");
    if (group) group.hidden = false;
    if (els.editOperationControls) els.editOperationControls.hidden = true;
    updatePathologistActions();
    phaseDetailedResetDraft(false);
    setMode("detail-point");
    drawAnnotations();
  };

  // Pathologist short tap: select like Default Freehand, but only before a real
  // pathologist contour/hole has accumulated.
  const phaseDetailedBaseFinalizeActiveDraft = finalizeActiveDraft;
  finalizeActiveDraft = async function phaseDetailedFinalizeActiveDraft(...args) {
    const draft = activeDraft;
    if (draft?.type === "freehand-pathologist") {
      const existingGeometry = Boolean(
        pathologistDraft?.outer?.length
        || pathologistDraft?.holes?.some((hole) => Array.isArray(hole) && hole.length)
      );
      if (!existingGeometry && Array.isArray(draft.points) && draft.points.length) {
        const originScreen = screenPointFromImage(draft.points[0]);
        let maxTravelPx = 0;
        if (originScreen) {
          for (const point of draft.points) {
            const screen = screenPointFromImage(point);
            if (!screen) continue;
            maxTravelPx = Math.max(maxTravelPx, Math.hypot(screen.x - originScreen.x, screen.y - originScreen.y));
          }
        }
        if (maxTravelPx <= FREEHAND_TAP_THRESHOLD_PX) {
          const tapPoint = draft.points[draft.points.length - 1] || draft.points[0];
          activeDraft = null;
          pointerState = null;
          pathologistDraft = null;
          const id = phaseDHitTestNormalAnnotation(tapPoint);
          setSingleSelection(id);
          const feature = selectedId ? findFeature(selectedId) : null;
          syncCurrentClassFromFeature(feature);
          updateControls();
          updatePathologistActions();
          drawAnnotations();
          return;
        }
      }
    }
    return phaseDetailedBaseFinalizeActiveDraft(...args);
  };

  // Only Pathologist automatically returns Add/Subtract to New after a
  // successful completed contour. Default and Detailed keep their own state.
  const phaseDetailedBaseCompletePathologistDraft = completePathologistDraft;
  completePathologistDraft = async function phaseDetailedCompletePathologistDraft(...args) {
    const operation = pathologistDraft?.operation || editOperation;
    await phaseDetailedBaseCompletePathologistDraft(...args);
    if (
      drawingProfile === "pathologist"
      && (operation === "add" || operation === "subtract")
      && pathologistDraft === null
    ) {
      setEditOperation("new");
    }
  };

  // Keep Pathologist completion controls away from the bottom Review decision bar.
  const phaseDetailedBaseUpdatePathologistActions = updatePathologistActions;
  updatePathologistActions = function phaseDetailedUpdatePathologistActions(...args) {
    const result = phaseDetailedBaseUpdatePathologistActions(...args);
    if (els.pathologistActions) {
      els.pathologistActions.classList.toggle(
        "review-safe",
        Boolean(reviewState.active && !els.pathologistActions.hidden)
      );
    }
    return result;
  };

  function phaseAdditionalToolsOpen() {
    const overlay = document.getElementById("phaseAdditionalToolsOverlay");
    if (!overlay) return;
    if (typeof phaseBToggleSettingsMenu === "function") phaseBToggleSettingsMenu(false);
    overlay.hidden = false;
  }

  function phaseAdditionalToolsClose() {
    const overlay = document.getElementById("phaseAdditionalToolsOverlay");
    if (overlay) overlay.hidden = true;
  }

  function phaseWorkflowToolsInitialize() {
    document.getElementById("phaseDetailedFinishPolyline")?.addEventListener("click", phaseDetailedFinishPolyline);
    document.getElementById("phaseDetailedCancelPolyline")?.addEventListener("click", () => phaseDetailedResetDraft());
    document.getElementById("phaseAdditionalToolsButton")?.addEventListener("click", phaseAdditionalToolsOpen);
    document.getElementById("phaseAdditionalToolsClose")?.addEventListener("click", phaseAdditionalToolsClose);

    const overlay = document.getElementById("phaseAdditionalToolsOverlay");
    overlay?.addEventListener("click", (event) => {
      if (event.target === overlay) phaseAdditionalToolsClose();
    });

    document.getElementById("phaseAdditionalReferenceEvaluationButton")?.addEventListener("click", () => {
      phaseAdditionalToolsClose();
      const button = document.getElementById("annotationEvaluationButton");
      if (button) button.click();
      else if (typeof phaseEvalOpen === "function") phaseEvalOpen();
    });

    for (const id of ["phaseBShortcutsMenuButton", "connectionSettingsButton"]) {
      document.getElementById(id)?.addEventListener("click", phaseAdditionalToolsClose);
    }

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !phaseDetailedActions()?.hidden) {
        phaseDetailedResetDraft();
      }
      if (
        event.key === "Enter"
        && drawingProfile === "detailed"
        && mode === "detail-polyline"
        && phaseDetailedPolyline.length >= 2
        && !event.target?.matches?.("input, textarea, select")
      ) {
        event.preventDefault();
        phaseDetailedFinishPolyline();
      }
    });
  }
