  // Phase F2.6.0 - Large Annotation Performance
  //
  // Display/interactivity optimization only.
  // Original GeoJSON coordinates are NEVER simplified or replaced.
  // Statistics, export, save and geometry operations continue to use the
  // complete featureCollection.
  // ======================================================================

  const PHASE_F26_HEAVY_MULTIPOLYGON_COMPONENTS =
    500;

  const PHASE_F26_MIN_SCREEN_COMPONENT_PX =
    0.6;

  // Phase F2.6.3 - viewport-scale annotation rendering.
  // Display-only: stored GeoJSON and scientific calculations remain level-0.
  const PHASE_F26_FEATURE_CULL_MIN_FEATURES =
    400;

  const PHASE_F26_NAVIGATION_DEFER_MIN_FEATURES =
    800;

  let phaseF26NavigationDeferred =
    false;

  let phaseF26NavigationOverlayHidden =
    false;

  let phaseF26PolygonBoundsCache =
    new WeakMap();

  let phaseF26GeometryBoundsCache =
    new WeakMap();

  let phaseF26DrawFramePending =
    false;

  let phaseF26RenderStats =
    [];

  function phaseF26InvalidateGeometryCaches() {
    phaseF264ResetCache();
    phaseF26PolygonBoundsCache =
      new WeakMap();

    phaseF26GeometryBoundsCache =
      new WeakMap();
  }

  function phaseF26BeginRenderFrame() {
    phaseF264BeginRenderFrame();
    phaseF26RenderStats =
      [];

    window.__histoannotatorF26RenderStats =
      phaseF26RenderStats;
  }

  // ======================================================================
  // Phase F2.6.1 - Real-time drawing + lightweight creation Undo
  //
  // Stored GeoJSON is unchanged. Heavy generated MultiPolygon overlays may
  // be temporarily suppressed ONLY while an interactive draft is being drawn.
  // ======================================================================

  const PHASE_F261_UNDO_CREATED_FEATURE =
    "phase-f261-created-feature";

  function phaseF261FastClone(value) {
    if (
      typeof window.structuredClone === "function"
    ) {
      try {
        return window.structuredClone(value);
      } catch (_) {
        // Fall through to the original JSON-compatible clone.
      }
    }

    return deepClone(value);
  }

  function phaseF261InteractiveDraftActive() {
    return Boolean(
      activeDraft
      || (
        Array.isArray(polygonDraft)
        && polygonDraft.length
      )
      || circleDraft
    );
  }

  function phaseF261CreatedUndoEntry(feature, index) {
    return {
      kind: PHASE_F261_UNDO_CREATED_FEATURE,
      index: Math.max(0, Number(index || 0)),
      feature: phaseF261FastClone(feature),
    };
  }

  function phaseF261IsCreatedUndoEntry(entry) {
    return Boolean(
      entry
      && !Array.isArray(entry)
      && entry.kind === PHASE_F261_UNDO_CREATED_FEATURE
      && entry.feature
      && typeof entry.feature === "object"
    );
  }

  function phaseF261PushCreatedFeatureUndo(feature, index) {
    phaseCCaptureSemanticBaseline();

    undoStack.push(
      phaseF261CreatedUndoEntry(feature, index)
    );

    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateControls();
  }

  function phaseF261UndoCreatedFeature(entry) {
    const id = String(featureId(entry.feature));
    const currentIndex =
      featureCollection.features.findIndex(
        (feature) => String(featureId(feature)) === id
      );

    const currentFeature =
      currentIndex >= 0
        ? featureCollection.features[currentIndex]
        : entry.feature;

    redoStack.push(
      phaseF261CreatedUndoEntry(
        currentFeature,
        currentIndex >= 0 ? currentIndex : entry.index
      )
    );

    if (redoStack.length > 50) redoStack.shift();

    if (currentIndex >= 0) {
      featureCollection.features.splice(currentIndex, 1);
    }

    clearSelectedFeatures(false);
    markChanged();
  }

  function phaseF261RedoCreatedFeature(entry) {
    const feature = phaseF261FastClone(entry.feature);
    const id = String(featureId(feature));

    const existingIndex =
      featureCollection.features.findIndex(
        (item) => String(featureId(item)) === id
      );

    if (existingIndex >= 0) {
      featureCollection.features.splice(existingIndex, 1);
    }

    const index = Math.max(
      0,
      Math.min(
        Number(entry.index || 0),
        featureCollection.features.length
      )
    );

    undoStack.push(
      phaseF261CreatedUndoEntry(feature, index)
    );

    if (undoStack.length > 50) undoStack.shift();

    featureCollection.features.splice(index, 0, feature);
    setSingleSelection(String(featureId(feature)), true);
    markChanged();
  }

  function phaseF261EditableTarget(target) {
    if (!target) return false;

    const tag =
      String(target.tagName || "").toLowerCase();

    return Boolean(
      target.isContentEditable
      || tag === "input"
      || tag === "textarea"
      || tag === "select"
    );
  }

  function phaseF261HandleUndoRedoShortcut(event) {
    if (
      !event
      || event.defaultPrevented
      || phaseF261EditableTarget(event.target)
      || !(event.ctrlKey || event.metaKey)
      || event.altKey
    ) {
      return;
    }

    const key =
      String(event.key || "").toLowerCase();

    if (key === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }

    if (key === "z") {
      event.preventDefault();
      undo();
      return;
    }

    if (key === "y") {
      event.preventDefault();
      redo();
    }
  }

  window.addEventListener(
    "keydown",
    phaseF261HandleUndoRedoShortcut,
    true
  );


  function phaseF26ScheduleDraw() {
    if (phaseF26DrawFramePending) {
      return;
    }

    phaseF26DrawFramePending =
      true;

    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);

    schedule(() => {
      phaseF26DrawFramePending =
        false;

      drawAnnotations();
    });
  }

  function phaseF26PolygonBounds(
    polygon
  ) {
    if (
      !Array.isArray(polygon)
      || polygon.length === 0
    ) {
      return null;
    }

    const cached =
      phaseF26PolygonBoundsCache.get(
        polygon
      );

    if (cached) {
      return cached;
    }

    let minX =
      Infinity;

    let minY =
      Infinity;

    let maxX =
      -Infinity;

    let maxY =
      -Infinity;

    for (const ring of polygon) {
      if (!Array.isArray(ring)) {
        continue;
      }

      for (const point of ring) {
        if (
          !Array.isArray(point)
          || point.length < 2
        ) {
          continue;
        }

        const x =
          Number(point[0]);

        const y =
          Number(point[1]);

        if (
          !Number.isFinite(x)
          || !Number.isFinite(y)
        ) {
          continue;
        }

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (
      !Number.isFinite(minX)
      || !Number.isFinite(minY)
      || !Number.isFinite(maxX)
      || !Number.isFinite(maxY)
    ) {
      return null;
    }

    const bounds = {
      minX,
      minY,
      maxX,
      maxY,
    };

    phaseF26PolygonBoundsCache.set(
      polygon,
      bounds
    );

    return bounds;
  }

  function phaseF26GeometryBounds(
    geometry
  ) {
    if (
      !geometry
      || typeof geometry !== "object"
    ) {
      return null;
    }

    const cached =
      phaseF26GeometryBoundsCache.get(
        geometry
      );

    if (cached) {
      return cached;
    }

    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : (
            geometry.type === "MultiPolygon"
              ? geometry.coordinates
              : []
          );

    let minX =
      Infinity;

    let minY =
      Infinity;

    let maxX =
      -Infinity;

    let maxY =
      -Infinity;

    for (const polygon of polygons) {
      const bounds =
        phaseF26PolygonBounds(
          polygon
        );

      if (!bounds) {
        continue;
      }

      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.minY < minY) minY = bounds.minY;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.maxY > maxY) maxY = bounds.maxY;
    }

    if (
      !Number.isFinite(minX)
      || !Number.isFinite(minY)
      || !Number.isFinite(maxX)
      || !Number.isFinite(maxY)
    ) {
      return null;
    }

    const bounds = {
      minX,
      minY,
      maxX,
      maxY,
    };

    phaseF26GeometryBoundsCache.set(
      geometry,
      bounds
    );

    return bounds;
  }

  function phaseF26BoundsIntersect(
    left,
    right
  ) {
    if (!left || !right) {
      return true;
    }

    return !(
      left.maxX < right.minX
      || left.minX > right.maxX
      || left.maxY < right.minY
      || left.minY > right.maxY
    );
  }

  function phaseF26PointInBounds(
    point,
    bounds
  ) {
    if (
      !Array.isArray(point)
      || point.length < 2
      || !bounds
    ) {
      return false;
    }

    const x =
      Number(point[0]);

    const y =
      Number(point[1]);

    return (
      Number.isFinite(x)
      && Number.isFinite(y)
      && x >= bounds.minX
      && x <= bounds.maxX
      && y >= bounds.minY
      && y <= bounds.maxY
    );
  }

  function phaseF26CurrentRenderContext() {
    if (
      !viewer
      || !viewer.world?.getItemCount?.()
      || !viewer.viewport
    ) {
      return null;
    }

    const item =
      viewer.world.getItemAt(0);

    if (
      !item
      || typeof item.viewportToImageRectangle
        !== "function"
      || typeof viewer.viewport.getBounds
        !== "function"
    ) {
      return null;
    }

    try {
      const viewportBounds =
        viewer.viewport.getBounds(
          true
        );

      const imageBounds =
        item.viewportToImageRectangle(
          viewportBounds
        );

      const x =
        Number(imageBounds?.x);

      const y =
        Number(imageBounds?.y);

      const width =
        Number(imageBounds?.width);

      const height =
        Number(imageBounds?.height);

      if (
        !Number.isFinite(x)
        || !Number.isFinite(y)
        || !Number.isFinite(width)
        || !Number.isFinite(height)
        || width <= 0
        || height <= 0
      ) {
        return null;
      }

      const padX =
        Math.max(
          4,
          width * 0.04
        );

      const padY =
        Math.max(
          4,
          height * 0.04
        );

      const imagePixelsPerScreenPixel =
        Math.max(
          0.000001,
          Number(
            screenToleranceToImage(1)
          )
          || 1
        );

      return {
        viewport: {
          minX:
            x - padX,
          minY:
            y - padY,
          maxX:
            x + width + padX,
          maxY:
            y + height + padY,
        },
        minVisibleImageSpan:
          imagePixelsPerScreenPixel
          * PHASE_F26_MIN_SCREEN_COMPONENT_PX,
      };
    } catch (_) {
      return null;
    }
  }

  function phaseF26UseFeatureViewportCulling(
    features
  ) {
    return Boolean(
      Array.isArray(features)
      && features.length
        >= PHASE_F26_FEATURE_CULL_MIN_FEATURES
      && !reviewState.active
    );
  }

  function phaseF26FeatureVisible(
    feature,
    context
  ) {
    if (!context) {
      return true;
    }

    const geometry =
      feature?.geometry;

    if (
      !geometry
      || (
        geometry.type !== "Polygon"
        && geometry.type !== "MultiPolygon"
      )
    ) {
      return true;
    }

    const bounds =
      phaseF26GeometryBounds(
        geometry
      );

    return (
      !bounds
      || phaseF26BoundsIntersect(
        bounds,
        context.viewport
      )
    );
  }

  function phaseF26HeavyNavigationEligible() {
    const features =
      featureCollection?.features;

    return Boolean(
      mode === "navigate"
      && annotationsVisible
      && Array.isArray(features)
      && features.length
        >= PHASE_F26_NAVIGATION_DEFER_MIN_FEATURES
      && !phaseF261InteractiveDraftActive()
      && !reviewState.active
    );
  }

  function phaseF26SetAnnotationOverlayNavigationHidden(
    hidden
  ) {
    const canvas =
      ctx?.canvas;

    if (!canvas) {
      return;
    }

    const shouldHide =
      Boolean(hidden);

    if (
      phaseF26NavigationOverlayHidden
        === shouldHide
    ) {
      return;
    }

    phaseF26NavigationOverlayHidden =
      shouldHide;

    canvas.style.visibility =
      shouldHide
        ? "hidden"
        : "";
  }

  // ======================================================================
  // Phase F2.6.5 - Throttled annotation redraw during pan / zoom
  //
  // Navigation remains responsive by limiting overlay redraws to ~10 FPS.
  // Each redraw still uses the existing viewport culling + adaptive visual LOD.
  // Stored geometry, level-0 coordinates, editing, save/export, and evaluation
  // are not modified by this display-only scheduling policy.
  // ======================================================================

  // Android WebView gets a slightly more conservative cadence because
  // long annotation frames can otherwise keep the UI thread continuously busy.
  // Desktop keeps the validated ~10 FPS navigation overlay cadence.
  const PHASE_F26_ANDROID_NAVIGATION =
    typeof navigator !== "undefined"
    && /Android/i.test(
      String(navigator.userAgent || "")
    );

  const PHASE_F26_NAVIGATION_THROTTLE_MS =
    PHASE_F26_ANDROID_NAVIGATION
      ? 150
      : 100;

  let phaseF26NavigationThrottleTimer =
    null;

  let phaseF26NavigationLastDrawAt =
    0;

  let phaseF26NavigationThrottleStats = {
    throttleMs: PHASE_F26_NAVIGATION_THROTTLE_MS,
    requests: 0,
    throttledDraws: 0,
    finalDraws: 0,
    pending: false,
    lastEventName: null,
  };

  function phaseF26NavigationClockMs() {
    if (
      typeof performance !== "undefined"
      && typeof performance.now === "function"
    ) {
      return performance.now();
    }

    return Date.now();
  }

  function phaseF26PublishNavigationThrottleStats() {
    phaseF26NavigationThrottleStats.pending =
      Boolean(phaseF26NavigationThrottleTimer);

    window.__histoannotatorF26NavigationThrottleStats = {
      ...phaseF26NavigationThrottleStats,
    };
  }

  function phaseF26CancelNavigationThrottleTimer() {
    if (phaseF26NavigationThrottleTimer) {
      clearTimeout(
        phaseF26NavigationThrottleTimer
      );

      phaseF26NavigationThrottleTimer =
        null;
    }

    phaseF26PublishNavigationThrottleStats();
  }

  function phaseF26RunNavigationThrottleDraw() {
    phaseF26NavigationThrottleTimer =
      null;

    if (
      !phaseF26NavigationDeferred
      || !phaseF26HeavyNavigationEligible()
    ) {
      phaseF26PublishNavigationThrottleStats();
      return;
    }

    phaseF26NavigationLastDrawAt =
      phaseF26NavigationClockMs();

    phaseF26NavigationThrottleStats
      .throttledDraws += 1;

    phaseF26SetAnnotationOverlayNavigationHidden(
      false
    );

    phaseF26ScheduleDraw();
    phaseF26PublishNavigationThrottleStats();
  }

  function phaseF26ScheduleNavigationThrottleDraw() {
    phaseF26NavigationThrottleStats.requests += 1;

    if (phaseF26NavigationThrottleTimer) {
      phaseF26PublishNavigationThrottleStats();
      return;
    }

    const now =
      phaseF26NavigationClockMs();

    const elapsed =
      Math.max(
        0,
        now - phaseF26NavigationLastDrawAt
      );

    if (
      !phaseF26NavigationLastDrawAt
      || elapsed >= PHASE_F26_NAVIGATION_THROTTLE_MS
    ) {
      phaseF26RunNavigationThrottleDraw();
      return;
    }

    const waitMs =
      Math.max(
        0,
        PHASE_F26_NAVIGATION_THROTTLE_MS
          - elapsed
      );

    phaseF26NavigationThrottleTimer =
      setTimeout(
        phaseF26RunNavigationThrottleDraw,
        waitMs
      );

    phaseF26PublishNavigationThrottleStats();
  }

  function phaseF26HandleViewportDrawEvent(
    eventName
  ) {
    phaseF26NavigationThrottleStats.lastEventName =
      eventName;

    if (
      (
        eventName === "animation"
        || eventName === "update-viewport"
      )
      && phaseF26HeavyNavigationEligible()
    ) {
      phaseF26NavigationDeferred =
        true;

      phaseF26SetAnnotationOverlayNavigationHidden(
        false
      );

      phaseF26ScheduleNavigationThrottleDraw();
      return;
    }

    phaseF26CancelNavigationThrottleTimer();

    phaseF26NavigationDeferred =
      false;

    phaseF26SetAnnotationOverlayNavigationHidden(
      false
    );

    phaseF26NavigationLastDrawAt =
      phaseF26NavigationClockMs();

    phaseF26ScheduleDraw();
    phaseF26PublishNavigationThrottleStats();
  }

  function phaseF26FinishNavigationDraw() {
    const hadNavigationWork =
      Boolean(
        phaseF26NavigationDeferred
        || phaseF26NavigationOverlayHidden
        || phaseF26NavigationThrottleTimer
      );

    if (!hadNavigationWork) {
      return;
    }

    phaseF26CancelNavigationThrottleTimer();

    phaseF26NavigationDeferred =
      false;

    phaseF26SetAnnotationOverlayNavigationHidden(
      false
    );

    phaseF26NavigationLastDrawAt =
      phaseF26NavigationClockMs();

    phaseF26NavigationThrottleStats.finalDraws += 1;

    phaseF26ScheduleDraw();
    phaseF26PublishNavigationThrottleStats();
  }

  function phaseF26PolygonVisible(
    polygon,
    context
  ) {
    if (!context) {
      return true;
    }

    const bounds =
      phaseF26PolygonBounds(
        polygon
      );

    if (!bounds) {
      return true;
    }

    if (
      !phaseF26BoundsIntersect(
        bounds,
        context.viewport
      )
    ) {
      return false;
    }

    const width =
      Math.max(
        0,
        bounds.maxX - bounds.minX
      );

    const height =
      Math.max(
        0,
        bounds.maxY - bounds.minY
      );

    if (
      Math.max(width, height)
      < context.minVisibleImageSpan
    ) {
      return false;
    }

    return true;
  }

  function drawGeometry(feature) {
    if (
      reviewState.active
      && String(featureId(feature))
        !== String(reviewState.currentId || "")
    ) {
      return;
    }

    const geometry = feature.geometry;
    if (!geometry) return;

    const color = colorForFeature(feature);
    const selected = selectedIds.has(featureId(feature));

    if (geometry.type === "Polygon") {
      drawPolygonRings(
        geometry.coordinates,
        color,
        selected
      );
      return;
    }

    if (geometry.type !== "MultiPolygon") {
      return;
    }

    const polygons =
      geometry.coordinates || [];

    if (
      phaseF261InteractiveDraftActive()
      && polygons.length
        >= PHASE_F26_HEAVY_MULTIPOLYGON_COMPONENTS
    ) {
      phaseF26RenderStats.push({
        featureId: String(featureId(feature) || ""),
        className: String(
          feature?.properties?.classification?.name || ""
        ),
        totalComponents: polygons.length,
        drawnComponents: 0,
        culledComponents: polygons.length,
        draftSuppressed: true,
        minVisibleImageSpan: 0,
      });
      return;
    }

    if (
      polygons.length
      < PHASE_F26_HEAVY_MULTIPOLYGON_COMPONENTS
    ) {
      polygons.forEach(
        (polygon) =>
          drawPolygonRings(
            polygon,
            color,
            selected
          )
      );
      return;
    }

    const context =
      phaseF26CurrentRenderContext();

    let drawn =
      0;

    for (const polygon of polygons) {
      if (
        !phaseF26PolygonVisible(
          polygon,
          context
        )
      ) {
        continue;
      }

      drawPolygonRings(
        polygon,
        color,
        selected
      );

      drawn += 1;
    }

    phaseF26RenderStats.push({
      featureId:
        String(featureId(feature) || ""),
      className:
        String(
          feature?.properties
            ?.classification
            ?.name
          || ""
        ),
      totalComponents:
        polygons.length,
      drawnComponents:
        drawn,
      culledComponents:
        Math.max(
          0,
          polygons.length - drawn
        ),
      minVisibleImageSpan:
        Number(
          context?.minVisibleImageSpan
          || 0
        ),
    });
  }

  function drawingColor(operation = editOperation) {
    if (operation !== "new" && selectedId) {
      const selected = findFeature(selectedId);
      if (selected) return colorForFeature(selected);
    }
    return currentClass.color;
  }

  function drawDraftPoints(points) {
    for (const point of points) {
      const screen = screenPointFromImage(point);
      if (!screen) continue;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = drawingColor(polygonOperation);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawBrushDraft(draft) {
    const points = draft.points.map(screenPointFromImage).filter(Boolean);
    if (!points.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    const color = drawingColor(draft.operation);
    ctx.strokeStyle = hexToRgba(color, 0.42);
    ctx.lineWidth = draft.diameterPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, draft.diameterPx / 2, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.42);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBrushCursor() {
    if (mode !== "brush" || !brushCursor || activeDraft) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(brushCursor.x, brushCursor.y, brushDiameterPx / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(brushCursor.x, brushCursor.y, brushDiameterPx / 2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = drawingColor(editOperation);
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  function drawAnnotations(...args) {
    const previewFeatures =
      Array.isArray(window.__phaseF1PreviewFeatures)
        ? window.__phaseF1PreviewFeatures
        : [];

    if (
      !featureCollection
      || previewFeatures.length === 0
    ) {
      return phaseF13DrawAnnotationsBase(...args);
    }

    const actualFeatures =
      featureCollection.features || [];

    try {
      featureCollection.features = [
        ...actualFeatures,
        ...previewFeatures,
      ];

      return phaseF13DrawAnnotationsBase(...args);
    } finally {
      featureCollection.features =
        actualFeatures;
    }
  }

  function phaseF13DrawAnnotationsBase() {

    const rect = resizeCanvas();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!viewer || !viewer.world.getItemCount()) return;

    phaseF26BeginRenderFrame();

    if (annotationsVisible) {
      const drawableSourceFeatures = reviewState.active
        ? (reviewState.currentId ? [findFeature(reviewState.currentId)].filter(Boolean) : [])
        : featureCollection.features;

      const featureCullContext =
        phaseF26UseFeatureViewportCulling(
          drawableSourceFeatures
        )
          ? phaseF26CurrentRenderContext()
          : null;

      let featureCullCount =
        0;

      const drawableFeatures =
        featureCullContext
          ? drawableSourceFeatures.filter(
              (feature) => {
                const visible =
                  phaseF26FeatureVisible(
                    feature,
                    featureCullContext
                  );

                if (!visible) {
                  featureCullCount += 1;
                }

                return visible;
              }
            )
          : drawableSourceFeatures;

      window.__histoannotatorF26FeatureCullStats = {
        enabled: Boolean(featureCullContext),
        totalFeatures: drawableSourceFeatures.length,
        drawnFeatures: drawableFeatures.length,
        culledFeatures: featureCullCount,
      };

      drawableFeatures.forEach((feature) => {
        if (!phaseDIsTissueRoi(feature)) {
          drawGeometry(feature);
          return;
        }

        const previousFilled =
          annotationsFilled;

        const borderConfig =
          phaseDBorderConfigForRoi(feature);

        const effectivePreview =
          phaseDEffectivePreviewForRoi(feature);

        const hasReduction =
          borderConfig.enabled
          && borderConfig.percent > 0;

        try {
          if (
            hasReduction
            && effectivePreview?.geometry
          ) {
            // Base/original Tissue ROI:
            // dashed reference outline.
            ctx.save();
            ctx.setLineDash([7, 5]);
            annotationsFilled = false;
            drawGeometry(feature);
            ctx.restore();

            // Effective/analysis ROI:
            // solid outline; filled only while editing.
            const effectiveFeature =
              deepClone(feature);

            effectiveFeature.id =
              `${featureId(feature)}::effective-roi`;

            effectiveFeature.geometry =
              deepClone(effectivePreview.geometry);

            ctx.save();
            ctx.setLineDash([]);
            annotationsFilled =
              phaseDActiveRole === "roi";
            drawGeometry(effectiveFeature);
            ctx.restore();
          } else {
            // No reduction: only one ROI.
            ctx.save();
            ctx.setLineDash([]);
            annotationsFilled =
              phaseDActiveRole === "roi";
            drawGeometry(feature);
            ctx.restore();

            if (
              hasReduction
              && !effectivePreview?.geometry
            ) {
              phaseDEnsureStoredEffectivePreview();
            }
          }
        } finally {
          annotationsFilled =
            previousFilled;
          ctx.setLineDash([]);
        }
      });
    }
    phaseIL1DrawSuggestions();
    if (pathologistDraft && drawingProfile === "pathologist" && mode === "freehand") {
      if (pathologistDraft.outer.length) drawRing(pathologistDraft.outer, drawingColor(pathologistDraft.operation), false, true);
      pathologistDraft.holes.forEach((ring) => { if (ring.length) drawRing(ring, "#ffcf66", false, true); });
    }
    if (activeDraft?.type === "freehand" || activeDraft?.type === "freehand-pathologist") drawRing(activeDraft.points, drawingColor(activeDraft.operation), false, true);
    if (activeDraft?.type === "brush") drawBrushDraft(activeDraft);
    if (activeDraft?.type === "rectangle") {
      const [x1, y1] = activeDraft.start;
      const [x2, y2] = activeDraft.end;
      drawRing([[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]], drawingColor(activeDraft.operation), false, true);
    }
    if (polygonDraft.length) {
      drawRing(polygonDraft, drawingColor(polygonOperation), false, true);
      drawDraftPoints(polygonDraft);
    }
    if (circleDraft) {
      if (circleDraft.pointA && !circleDraft.pointB) drawDraftPoints([circleDraft.pointA]);
      const geometry = circleGeometryFromDraft();
      if (geometry?.type === "Polygon") drawPolygonRings(geometry.coordinates, drawingColor(circleDraft.operation), false);
    }
    if (activeDraft?.type === "selection" && activeDraft.points.length > 1) drawRing(activeDraft.points, "#65b8ff", false, true);
    phaseDDrawFillUnannotatedPreview();
    drawBrushCursor();
    drawWandCursor();
  }

  function drawWandCursor() {
    if (mode !== "wand" || !wandCursor) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(wandCursor.x, wandCursor.y, wandRadiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = wandBusy ? "#ffd43b" : "rgba(255,255,255,.88)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function colorDistance(data, offset, seed, metric) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (metric === "brightness") {
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return Math.abs(luminance - seed.luminance);
    }
    const dr = r - seed.r;
    const dg = g - seed.g;
    const db = b - seed.b;
    return Math.sqrt(0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
  }

  function floodFillMask(imageData, seedX, seedY, tolerance, metric) {
    const { width, height, data } = imageData;
    const size = width * height;
    const mask = new Uint8Array(size);
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
    const seedIndex = seedY * width + seedX;
    const seedOffset = seedIndex * 4;
    const seed = {
      r: data[seedOffset],
      g: data[seedOffset + 1],
      b: data[seedOffset + 2],
      luminance: 0.2126 * data[seedOffset] + 0.7152 * data[seedOffset + 1] + 0.0722 * data[seedOffset + 2],
    };
    let head = 0;
    let tail = 0;
    let count = 0;
    let touchesBorder = false;
    queue[tail++] = seedIndex;
    visited[seedIndex] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * 4;
      if (data[offset + 3] === 0 || colorDistance(data, offset, seed, metric) > tolerance) continue;
      mask[index] = 1;
      count += 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;

      if (x > 0) {
        const next = index - 1;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (x + 1 < width) {
        const next = index + 1;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y > 0) {
        const next = index - width;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y + 1 < height) {
        const next = index + width;
        if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    return { mask, count, touchesBorder };
  }

  function maskBoundaryLoops(mask, width, height) {
    const outgoing = new Map();
    const edges = [];
    const addEdge = (x1, y1, x2, y2) => {
      const index = edges.length;
      edges.push({ x1, y1, x2, y2, used: false });
      const key = `${x1},${y1}`;
      if (!outgoing.has(key)) outgoing.set(key, []);
      outgoing.get(key).push(index);
    };
    const isForeground = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isForeground(x, y)) continue;
        if (!isForeground(x, y - 1)) addEdge(x, y, x + 1, y);
        if (!isForeground(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
        if (!isForeground(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
        if (!isForeground(x - 1, y)) addEdge(x, y + 1, x, y);
      }
    }

    const loops = [];
    for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
      if (edges[startIndex].used) continue;
      const start = edges[startIndex];
      const loop = [[start.x1, start.y1]];
      let edgeIndex = startIndex;
      let safety = 0;
      while (edgeIndex !== undefined && safety++ < edges.length + 8) {
        const edge = edges[edgeIndex];
        if (edge.used) break;
        edge.used = true;
        loop.push([edge.x2, edge.y2]);
        if (edge.x2 === start.x1 && edge.y2 === start.y1) break;
        const candidates = outgoing.get(`${edge.x2},${edge.y2}`) || [];
        edgeIndex = candidates.find((candidate) => !edges[candidate].used);
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }

  function polygonSignedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
    }
    return area / 2;
  }

  async function runWand(point, operation = editOperation) {
    if (!currentImage || !currentInfo || wandBusy) return;
    wandBusy = true;
    drawAnnotations();
    setStatus("Wand: reading the visible image region…");
    try {
      const radiusImage = screenToleranceToImage(wandRadiusPx);
      const x = Math.floor(Math.max(0, point[0] - radiusImage));
      const y = Math.floor(Math.max(0, point[1] - radiusImage));
      const width = Math.max(1, Math.ceil(Math.min(currentInfo.width - x, radiusImage * 2)));
      const height = Math.max(1, Math.ceil(Math.min(currentInfo.height - y, radiusImage * 2)));
      const url = `${API}/images/${currentImage.id}/region.png?x=${x}&y=${y}&width=${width}&height=${height}&max_size=768&${displayQueryString()}`;
      const response = await apiFetch(url);
      const sourceX = Number(response.headers.get("X-Region-X") || x);
      const sourceY = Number(response.headers.get("X-Region-Y") || y);
      const sourceWidth = Number(response.headers.get("X-Region-Width") || width);
      const sourceHeight = Number(response.headers.get("X-Region-Height") || height);
      const bitmap = await createImageBitmap(await response.blob());
      const offscreen = document.createElement("canvas");
      offscreen.width = bitmap.width;
      offscreen.height = bitmap.height;
      const regionContext = offscreen.getContext("2d", { willReadFrequently: true });
      regionContext.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const imageData = regionContext.getImageData(0, 0, offscreen.width, offscreen.height);
      const seedX = Math.max(0, Math.min(offscreen.width - 1, Math.floor(((point[0] - sourceX) / sourceWidth) * offscreen.width)));
      const seedY = Math.max(0, Math.min(offscreen.height - 1, Math.floor(((point[1] - sourceY) / sourceHeight) * offscreen.height)));
      const result = floodFillMask(imageData, seedX, seedY, wandTolerance, wandMetric);
      if (result.count < 8) throw new Error("The selected region is too small. Increase Similarity or zoom in.");
      if (result.count > offscreen.width * offscreen.height * 0.82) {
        throw new Error("The selection filled almost the entire Wand area. Lower Similarity or zoom in.");
      }
      const loops = maskBoundaryLoops(result.mask, offscreen.width, offscreen.height);
      if (!loops.length) throw new Error("No usable boundary was found.");
      const boundary = loops.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)))[0];
      if (boundary.length > 1) {
        const first = boundary[0];
        const last = boundary[boundary.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) boundary.pop();
      }
      const imagePoints = boundary.map(([px, py]) => [
        sourceX + (px / offscreen.width) * sourceWidth,
        sourceY + (py / offscreen.height) * sourceHeight,
      ]);
      const smoothed = smoothClosedPath(imagePoints, imagePoints.length > 80 ? 2 : 1, 0.12);
      const simplified = simplifyRdp(smoothed, Math.max(screenToleranceToImage(0.75), sourceWidth / offscreen.width * 0.65));
      if (simplified.length < 3) throw new Error("The selected boundary was too simple.");
      await commitGeometry(polygonGeometry(simplified), { tool: "wand" }, operation);
      if (result.touchesBorder) setStatus("Wand area reached the search boundary; reduce the area or zoom in if needed", "local");
    } finally {
      wandBusy = false;
      drawAnnotations();
    }
  }

  function screenToleranceToImage(screenPixels) {
    if (!viewer || !viewer.world.getItemCount()) return screenPixels;
    const first = imagePointFromViewerPosition(new OpenSeadragon.Point(0, 0));
    const second = imagePointFromViewerPosition(new OpenSeadragon.Point(screenPixels, 0));
    return first && second ? Math.max(0.1, Math.abs(second[0] - first[0])) : screenPixels;
  }

  function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
  }

  function geometryBounds(geometry) {
    if (!geometry) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const visit = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        const x = Number(value[0]);
        const y = Number(value[1]);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        return;
      }
      value.forEach(visit);
    };
    visit(geometry.coordinates);
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  function zoomToFeature(feature) {
    if (!viewer || !viewer.world.getItemCount() || !feature?.geometry) return;
    const bounds = geometryBounds(feature.geometry);
    if (!bounds) return;
    const item = viewer.world.getItemAt(0);
    const topLeft = item.imageToViewportCoordinates(bounds.minX, bounds.minY);
    const bottomRight = item.imageToViewportCoordinates(bounds.maxX, bounds.maxY);
    const width = Math.max(bottomRight.x - topLeft.x, 0.00001);
    const height = Math.max(bottomRight.y - topLeft.y, 0.00001);
    const paddingX = Math.max(width * 0.12, 0.00002);
    const paddingY = Math.max(height * 0.12, 0.00002);
    viewer.viewport.fitBounds(new OpenSeadragon.Rect(topLeft.x - paddingX, topLeft.y - paddingY, width + paddingX * 2, height + paddingY * 2), false);
  }

  function zoomToReviewFeature(feature) {
    if (
      !viewer
      || !viewer.world.getItemCount()
      || !feature?.geometry
    ) {
      return;
    }

    const bounds = geometryBounds(feature.geometry);
    if (!bounds) return;

    const imageWidth = Math.max(
      1,
      Number(currentInfo?.width) || bounds.maxX
    );
    const imageHeight = Math.max(
      1,
      Number(currentInfo?.height) || bounds.maxY
    );

    const annotationWidth = Math.max(
      1,
      bounds.maxX - bounds.minX
    );
    const annotationHeight = Math.max(
      1,
      bounds.maxY - bounds.minY
    );

    // Keep the current ~12% padding for large annotations, while
    // guaranteeing useful tissue context around very small/cell-sized ROIs.
    const targetWidth = Math.min(
      imageWidth,
      Math.max(1024, annotationWidth * 1.24)
    );
    const targetHeight = Math.min(
      imageHeight,
      Math.max(1024, annotationHeight * 1.24)
    );

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const x = Math.max(
      0,
      Math.min(
        imageWidth - targetWidth,
        centerX - targetWidth / 2
      )
    );
    const y = Math.max(
      0,
      Math.min(
        imageHeight - targetHeight,
        centerY - targetHeight / 2
      )
    );

    const item = viewer.world.getItemAt(0);
    const topLeft = item.imageToViewportCoordinates(x, y);
    const bottomRight = item.imageToViewportCoordinates(
      x + targetWidth,
      y + targetHeight
    );

    viewer.viewport.fitBounds(
      new OpenSeadragon.Rect(
        topLeft.x,
        topLeft.y,
        Math.max(bottomRight.x - topLeft.x, 0.00001),
        Math.max(bottomRight.y - topLeft.y, 0.00001)
      ),
      false
    );
  }

  function syncCurrentClassFromFeature(feature) {
    const name = feature?.properties?.classification?.name;
    if (!name) return;
    const matched = classes.find((item) => item.name === name);
    if (matched) currentClass = matched;
  }

  function pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || !polygon.length || !pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  }

  function hitTest(point) {
    for (
      let index =
        featureCollection.features.length - 1;
      index >= 0;
      index -= 1
    ) {
      const feature =
        featureCollection.features[index];

      const geometry =
        feature.geometry;

      if (!geometry) {
        continue;
      }

      const geometryBounds =
        phaseF26GeometryBounds(
          geometry
        );

      if (
        geometryBounds
        && !phaseF26PointInBounds(
          point,
          geometryBounds
        )
      ) {
        continue;
      }

      if (
        geometry.type === "Polygon"
      ) {
        const polygonBounds =
          phaseF26PolygonBounds(
            geometry.coordinates
          );

        if (
          (
            !polygonBounds
            || phaseF26PointInBounds(
              point,
              polygonBounds
            )
          )
          && pointInPolygon(
            point,
            geometry.coordinates
          )
        ) {
          return featureId(feature);
        }

        continue;
      }

      if (
        geometry.type !== "MultiPolygon"
      ) {
        continue;
      }

      for (
        const polygon
        of geometry.coordinates || []
      ) {
        const polygonBounds =
          phaseF26PolygonBounds(
            polygon
          );

        if (
          polygonBounds
          && !phaseF26PointInBounds(
            point,
            polygonBounds
          )
        ) {
          continue;
        }

        if (
          pointInPolygon(
            point,
            polygon
          )
        ) {
          return featureId(feature);
        }
      }
    }

    return null;
  }

  function pointInRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function distanceBetween(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function pathLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) total += distanceBetween(points[index - 1], points[index]);
    return total;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function dedupePath(points, minimumDistance) {
    const clean = [];
    for (const point of points) {
      const last = clean[clean.length - 1];
      if (!last || distanceBetween(last, point) >= minimumDistance) clean.push([point[0], point[1]]);
    }
    return clean;
  }

  function smoothOpenPath(points, passes = 1, strength = 0.2) {
    let result = points.map(([x, y]) => [x, y]);
    for (let pass = 0; pass < passes && result.length >= 3; pass += 1) {
      const next = [result[0]];
      for (let index = 1; index < result.length - 1; index += 1) {
        const previous = result[index - 1];
        const current = result[index];
        const following = result[index + 1];
        next.push([
          current[0] * (1 - 2 * strength) + (previous[0] + following[0]) * strength,
          current[1] * (1 - 2 * strength) + (previous[1] + following[1]) * strength,
        ]);
      }
      next.push(result[result.length - 1]);
      result = next;
    }
    return result;
  }

  function smoothClosedPath(points, passes = 1, strength = 0.16) {
    let result = points.map(([x, y]) => [x, y]);
    for (let pass = 0; pass < passes && result.length >= 4; pass += 1) {
      const next = result.map((current, index) => {
        const previous = result[(index - 1 + result.length) % result.length];
        const following = result[(index + 1) % result.length];
        return [
          current[0] * (1 - 2 * strength) + (previous[0] + following[0]) * strength,
          current[1] * (1 - 2 * strength) + (previous[1] + following[1]) * strength,
        ];
      });
      result = next;
    }
    return result;
  }

  function trimFreehandTail(points) {
    let clean = dedupePath(points, screenToleranceToImage(0.35));
    if (clean.length < 7) return clean;

    const stepLengths = [];
    for (let index = 1; index < clean.length; index += 1) stepLengths.push(distanceBetween(clean[index - 1], clean[index]));
    const typicalStep = Math.max(0.01, median(stepLengths));
    const closureThreshold = Math.max(screenToleranceToImage(14), typicalStep * 5.5);
    const first = clean[0];

    // When the stylus reaches the starting area and then continues outside,
    // retain the closest return-to-start point and discard the accidental tail.
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    const searchStart = Math.max(3, Math.floor(clean.length * 0.42));
    for (let index = searchStart; index < clean.length - 2; index += 1) {
      const distance = distanceBetween(clean[index], first);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    if (closestIndex >= 0 && closestDistance <= closureThreshold) {
      const tail = clean.slice(closestIndex);
      if (pathLength(tail) > closureThreshold * 0.65) clean = clean.slice(0, closestIndex + 1);
    }

    // Remove a short terminal spike when the final point makes a large detour
    // compared with closing directly from the preceding point to the start.
    const maximumRemovals = Math.min(14, Math.floor(clean.length * 0.18));
    for (let removed = 0; removed < maximumRemovals && clean.length > 5; removed += 1) {
      const previous = clean[clean.length - 2];
      const last = clean[clean.length - 1];
      const direct = distanceBetween(previous, clean[0]);
      const detour = distanceBetween(previous, last) + distanceBetween(last, clean[0]);
      const deviation = perpendicularDistance(last, previous, clean[0]);
      const recent = clean.slice(Math.max(0, clean.length - 9));
      const recentSteps = [];
      for (let index = 1; index < recent.length; index += 1) recentSteps.push(distanceBetween(recent[index - 1], recent[index]));
      const localThreshold = Math.max(screenToleranceToImage(4), median(recentSteps) * 1.9);
      if (deviation > localThreshold && detour > Math.max(direct * 1.24, direct + localThreshold)) clean.pop();
      else break;
    }
    return clean;
  }

  function prepareFreehandPolygon(points) {
    const trimmed = trimFreehandTail(points);
    if (trimmed.length < 3) return trimmed;
    const passes = trimmed.length >= 24 ? 2 : 1;
    const smoothed = smoothClosedPath(trimmed, passes, 0.13);
    const simplified = simplifyRdp(smoothed, screenToleranceToImage(0.9));
    return simplified.length >= 3 ? simplified : smoothed;
  }

  function prepareOpenStroke(points, tolerance) {
    const clean = dedupePath(points, Math.max(0.05, tolerance * 0.45));
    const smoothed = smoothOpenPath(clean, clean.length >= 12 ? 2 : 1, 0.18);
    const simplified = simplifyRdp(smoothed, tolerance);
    return simplified.length >= 2 ? simplified : smoothed;
  }

  function strokeToPolygon(points, radius) {
    const clean = [];
    for (const point of points) {
      const last = clean[clean.length - 1];
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > Math.max(0.05, radius * 0.08)) clean.push(point);
    }
    const segments = 18;
    if (!clean.length) return [];
    if (clean.length === 1) {
      const [cx, cy] = clean[0];
      return Array.from({ length: segments }, (_, index) => {
        const angle = (Math.PI * 2 * index) / segments;
        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
      });
    }

    const normals = clean.map((point, index) => {
      const previous = clean[Math.max(0, index - 1)];
      const next = clean[Math.min(clean.length - 1, index + 1)];
      let dx = next[0] - previous[0];
      let dy = next[1] - previous[1];
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      return [-dy, dx];
    });
    const left = clean.map((point, index) => [point[0] + normals[index][0] * radius, point[1] + normals[index][1] * radius]);
    const right = clean.map((point, index) => [point[0] - normals[index][0] * radius, point[1] - normals[index][1] * radius]);
    const outline = [...left];

    const end = clean[clean.length - 1];
    const endAngle = Math.atan2(normals[normals.length - 1][1], normals[normals.length - 1][0]);
    for (let index = 1; index <= segments / 2; index += 1) {
      const angle = endAngle - (Math.PI * index) / (segments / 2);
      outline.push([end[0] + Math.cos(angle) * radius, end[1] + Math.sin(angle) * radius]);
    }

    for (let index = right.length - 2; index >= 0; index -= 1) outline.push(right[index]);

    const start = clean[0];
    const startRightAngle = Math.atan2(-normals[0][1], -normals[0][0]);
    for (let index = 1; index <= segments / 2; index += 1) {
      const angle = startRightAngle - (Math.PI * index) / (segments / 2);
      outline.push([start[0] + Math.cos(angle) * radius, start[1] + Math.sin(angle) * radius]);
    }
    return outline;
  }

  function simplifyRdp(points, epsilon) {
    if (points.length < 3) return points;
    let maxDistance = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];
    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = perpendicularDistance(points[index], first, last);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxDistance > epsilon) {
      const left = simplifyRdp(points.slice(0, maxIndex + 1), epsilon);
      const right = simplifyRdp(points.slice(maxIndex), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  function perpendicularDistance(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
  }

  function hexToRgba(hex, alpha) {
    const normalized = hex.replace("#", "");
    const value = parseInt(normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

