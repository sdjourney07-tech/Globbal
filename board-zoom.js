/**
 * Board viewport: pinch-zoom anytime, Ctrl+scroll zoom, and pan while zoomed.
 * Dragging a tile over the board temporarily zooms under the ghost (WWF-style).
 */
(function boardZoom() {
  const PLACEMENT_ZOOM_SCALE = 1.88;
  const DRAG_FOCUS_SCALE = 1.78;
  const DRAG_FOCUS_SCALE_LERP = 0.38;
  const DRAG_FOCUS_EDGE_PX = 52;
  const DRAG_FOCUS_EDGE_PAN_PX = 16;
  const MIN_SCALE = 1;
  const MAX_SCALE = 2.4;
  const PLACEMENT_ANIM_MS = 180;
  /** Edge ring (CSS px) of the viewport that always starts a pan while zoomed. */
  const PAN_EDGE_GUTTER_PX = 40;

  const state = {
    wrap: null,
    stage: null,
    scale: 1,
    translateX: 0,
    translateY: 0,
    userOverridden: false,
    placementActive: false,
    lastPlacementTiles: [],
    lastBoardEl: null,
    gesture: null,
    suppressClick: false,
    animFrameId: null,
    animToken: 0,
    dragFocusActive: false,
    dragFocusPaused: false,
    dragFocusSnapshot: null,
    dropHoverCell: null
  };

  function cancelAnim() {
    if (state.animFrameId != null) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    state.animToken += 1;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function getBoardEl() {
    return state.lastBoardEl || state.stage?.querySelector(".board") || null;
  }

  function getBoardLayout() {
    const wrap = state.wrap;
    const stage = state.stage;
    const board = getBoardEl();
    if (!wrap || !stage || !board) {
      return null;
    }

    return {
      wrapW: wrap.clientWidth,
      wrapH: wrap.clientHeight,
      stageLeft: stage.offsetLeft,
      stageTop: stage.offsetTop,
      stageW: stage.offsetWidth,
      stageH: stage.offsetHeight,
      boardLeft: board.offsetLeft,
      boardTop: board.offsetTop,
      boardW: board.offsetWidth,
      boardH: board.offsetHeight
    };
  }

  function getStageOrigin(layout) {
    return {
      x: layout.stageW / 2,
      y: layout.stageH / 2
    };
  }

  function getTranslateBounds(layout, scale) {
    // Keep the board covering the viewport. No large empty gutters around it.
    const origin = getStageOrigin(layout);
    const boardLeft = layout.boardLeft;
    const boardRight = layout.boardLeft + layout.boardW;
    const boardTop = layout.boardTop;
    const boardBottom = layout.boardTop + layout.boardH;
    const edgePad = 2;

    let minX =
      layout.wrapW -
      layout.stageLeft -
      origin.x * (1 - scale) -
      boardRight * scale -
      edgePad;
    let maxX =
      -layout.stageLeft -
      origin.x * (1 - scale) -
      boardLeft * scale +
      edgePad;
    let minY =
      layout.wrapH -
      layout.stageTop -
      origin.y * (1 - scale) -
      boardBottom * scale -
      edgePad;
    let maxY =
      -layout.stageTop -
      origin.y * (1 - scale) -
      boardTop * scale +
      edgePad;

    // Scaled board fits inside the wrap → lock to the centered pose.
    if (minX > maxX) {
      const mid = (minX + maxX) / 2;
      minX = mid;
      maxX = mid;
    }
    if (minY > maxY) {
      const mid = (minY + maxY) / 2;
      minY = mid;
      maxY = mid;
    }

    return { minX, maxX, minY, maxY };
  }

  function clampTransform() {
    const layout = getBoardLayout();
    if (!layout) {
      state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);
      return;
    }

    state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);
    const bounds = getTranslateBounds(layout, state.scale);
    let translateX = clamp(
      state.translateX,
      Math.min(bounds.minX, bounds.maxX),
      Math.max(bounds.minX, bounds.maxX)
    );
    let translateY = clamp(
      state.translateY,
      Math.min(bounds.minY, bounds.maxY),
      Math.max(bounds.minY, bounds.maxY)
    );

    // As zoom approaches 1x, ease pan back to center so fully zooming out
    // doesn't hard-snap translation in one frame.
    const settleStart = 1.16;
    if (state.scale < settleStart) {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const u =
        state.scale <= MIN_SCALE
          ? 0
          : (state.scale - MIN_SCALE) / (settleStart - MIN_SCALE);
      const keep = u * u;
      translateX = centerX + (translateX - centerX) * keep;
      translateY = centerY + (translateY - centerY) * keep;
    }

    state.translateX = translateX;
    state.translateY = translateY;
  }

  function getRestPose() {
    // Full-board rest is always the true 1x centered pose (not cover-bound mid,
    // which can be a tiny non-zero after padding).
    return { scale: MIN_SCALE, translateX: 0, translateY: 0 };
  }

  function settleToRest(durationMs = 200) {
    const rest = getRestPose();
    state.userOverridden = false;
    const alreadyRest =
      Math.abs(state.scale - rest.scale) < 0.002 &&
      Math.abs(state.translateX - rest.translateX) < 0.75 &&
      Math.abs(state.translateY - rest.translateY) < 0.75;
    if (alreadyRest) {
      state.scale = rest.scale;
      state.translateX = rest.translateX;
      state.translateY = rest.translateY;
      applyTransform(false);
      return;
    }
    animateTo(rest, durationMs);
  }

  function applyTransform(animateCss = false) {
    if (!state.stage) {
      return;
    }
    clampTransform();
    state.stage.classList.toggle("board-stage-zoom-anim", animateCss);
    state.stage.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
    state.wrap?.classList.toggle(
      "board-wrap-zoomed",
      state.scale !== 1 || state.translateX !== 0 || state.translateY !== 0
    );
  }

  function stageMetrics() {
    const wrap = state.wrap;
    const stage = state.stage;
    if (!wrap || !stage) {
      return null;
    }
    return {
      stageLeft: stage.offsetLeft,
      stageTop: stage.offsetTop,
      wrapCenterX: wrap.clientWidth / 2,
      wrapCenterY: wrap.clientHeight / 2
    };
  }

  function computeFocalTransform(focal, scale) {
    const metrics = stageMetrics();
    const layout = getBoardLayout();
    if (!metrics || !focal || !layout) {
      return null;
    }
    const origin = getStageOrigin(layout);
    return {
      scale,
      translateX:
        metrics.wrapCenterX -
        metrics.stageLeft -
        origin.x * (1 - scale) -
        focal.x * scale,
      translateY:
        metrics.wrapCenterY -
        metrics.stageTop -
        origin.y * (1 - scale) -
        focal.y * scale
    };
  }

  function animateTo(target, durationMs = PLACEMENT_ANIM_MS) {
    if (!target) {
      return;
    }

    cancelAnim();
    const token = state.animToken;
    const from = {
      scale: state.scale,
      translateX: state.translateX,
      translateY: state.translateY
    };

    // Resolve clamped destination without painting it yet.
    state.scale = target.scale;
    state.translateX = target.translateX;
    state.translateY = target.translateY;
    clampTransform();
    const to = {
      scale: state.scale,
      translateX: state.translateX,
      translateY: state.translateY
    };
    state.scale = from.scale;
    state.translateX = from.translateX;
    state.translateY = from.translateY;
    applyTransform(false);

    const start = performance.now();

    function frame(now) {
      if (token !== state.animToken) {
        return;
      }
      const t = clamp((now - start) / durationMs, 0, 1);
      const eased = easeOutQuint(t);
      state.scale = from.scale + (to.scale - from.scale) * eased;
      state.translateX = from.translateX + (to.translateX - from.translateX) * eased;
      state.translateY = from.translateY + (to.translateY - from.translateY) * eased;
      applyTransform(false);
      if (t < 1) {
        state.animFrameId = requestAnimationFrame(frame);
      } else {
        state.animFrameId = null;
        state.scale = to.scale;
        state.translateX = to.translateX;
        state.translateY = to.translateY;
        applyTransform(false);
      }
    }

    state.animFrameId = requestAnimationFrame(frame);
  }

  function setTransformForFocal(focal, scale, animate = true) {
    const target = computeFocalTransform(focal, scale);
    if (!target) {
      return;
    }
    if (animate) {
      animateTo(target, PLACEMENT_ANIM_MS);
      return;
    }
    cancelAnim();
    state.scale = target.scale;
    state.translateX = target.translateX;
    state.translateY = target.translateY;
    applyTransform(false);
  }

  function getPlacementFocal(boardEl, tiles) {
    if (!boardEl || !tiles.length || !state.stage) {
      return null;
    }

    const boardOffsetX = boardEl.offsetLeft;
    const boardOffsetY = boardEl.offsetTop;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    tiles.forEach(({ row, col }) => {
      const cell = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      if (!cell) {
        return;
      }
      const left = boardOffsetX + cell.offsetLeft;
      const top = boardOffsetY + cell.offsetTop;
      const right = left + cell.offsetWidth;
      const bottom = top + cell.offsetHeight;
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    });

    if (!Number.isFinite(minX)) {
      return null;
    }

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  }

  function wrapPointFromClient(clientX, clientY) {
    const wrapRect = state.wrap.getBoundingClientRect();
    return {
      x: clientX - wrapRect.left,
      y: clientY - wrapRect.top
    };
  }

  function screenPointToStageLocal(clientX, clientY) {
    const metrics = stageMetrics();
    const layout = getBoardLayout();
    const point = wrapPointFromClient(clientX, clientY);
    if (!metrics || !layout || state.scale === 0) {
      return { x: 0, y: 0 };
    }
    const origin = getStageOrigin(layout);
    return {
      x:
        origin.x +
        (point.x - metrics.stageLeft - state.translateX - origin.x) / state.scale,
      y:
        origin.y +
        (point.y - metrics.stageTop - state.translateY - origin.y) / state.scale
    };
  }

  function setTransformAtPoint(scale, wrapX, wrapY, stageLocalX, stageLocalY) {
    const metrics = stageMetrics();
    const layout = getBoardLayout();
    if (!metrics || !layout) {
      return;
    }
    const origin = getStageOrigin(layout);
    state.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
    state.translateX =
      wrapX -
      metrics.stageLeft -
      origin.x * (1 - state.scale) -
      stageLocalX * state.scale;
    state.translateY =
      wrapY -
      metrics.stageTop -
      origin.y * (1 - state.scale) -
      stageLocalY * state.scale;
    applyTransform(false);
  }

  function isNearWrapEdge(clientX, clientY) {
    if (!state.wrap) {
      return false;
    }
    const rect = state.wrap.getBoundingClientRect();
    const gutter = PAN_EDGE_GUTTER_PX;
    return (
      clientX < rect.left + gutter ||
      clientX > rect.right - gutter ||
      clientY < rect.top + gutter ||
      clientY > rect.bottom - gutter
    );
  }

  function isBoardPanTarget(target, clientX, clientY) {
    if (!state.wrap?.contains(target)) {
      return false;
    }
    if (window.GlobbleTilePointerDrag?.isActive?.()) {
      return false;
    }
    // Prefer panning from the viewport margins / frame while zoomed.
    if (
      canSingleFingerPan() &&
      Number.isFinite(clientX) &&
      Number.isFinite(clientY) &&
      isNearWrapEdge(clientX, clientY)
    ) {
      return true;
    }
    const tile = target.closest(".tile");
    if (tile?.draggable) {
      return false;
    }
    return true;
  }

  function canSingleFingerPan() {
    return (
      state.userOverridden ||
      state.scale !== 1 ||
      Math.abs(state.translateX) > 1 ||
      Math.abs(state.translateY) > 1
    );
  }

  function clearDropHover() {
    state.dropHoverCell?.classList.remove("cell-drop-hover");
    state.dropHoverCell = null;
  }

  function updateDropHover(clientX, clientY) {
    const board = getBoardEl();
    if (!board || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      clearDropHover();
      return;
    }

    let hit = null;
    const cells = board.querySelectorAll(".cell");
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const occupied = cell.querySelector(".tile:not(.tile-drag-source)");
      if (occupied) {
        continue;
      }
      const rect = cell.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        hit = cell;
        break;
      }
    }

    if (state.dropHoverCell === hit) {
      return;
    }
    clearDropHover();
    state.dropHoverCell = hit;
    hit?.classList.add("cell-drop-hover");
  }

  function beginDragFocus() {
    if (!state.wrap || !state.stage) {
      return;
    }
    cancelAnim();
    state.dragFocusActive = true;
    state.dragFocusPaused = false;
    state.dragFocusSnapshot = {
      scale: state.scale,
      translateX: state.translateX,
      translateY: state.translateY,
      userOverridden: state.userOverridden
    };
    state.stage.classList.remove("board-stage-zoom-anim");
  }

  function restoreDragFocusSnapshot(animate = true) {
    const snapshot = state.dragFocusSnapshot;
    if (!snapshot) {
      return;
    }
    clearDropHover();
    const target = {
      scale: snapshot.scale,
      translateX: snapshot.translateX,
      translateY: snapshot.translateY
    };
    if (animate) {
      animateTo(target, 150);
      return;
    }
    cancelAnim();
    state.scale = target.scale;
    state.translateX = target.translateX;
    state.translateY = target.translateY;
    applyTransform(false);
  }

  function pauseDragFocus() {
    if (!state.dragFocusActive) {
      return;
    }
    // Keep the zoom while dragging off-board (e.g. over the rack). Restoring
    // here used to start an animation that fought the next zoom-in frames.
    state.dragFocusPaused = true;
    clearDropHover();
  }

  function updateDragFocus(clientX, clientY) {
    if (!state.dragFocusActive || !state.wrap || !state.stage) {
      return;
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      pauseDragFocus();
      return;
    }

    state.dragFocusPaused = false;
    cancelAnim();

    const wrapRect = state.wrap.getBoundingClientRect();
    const snapshot = state.dragFocusSnapshot || {
      scale: 1,
      translateX: 0,
      translateY: 0
    };
    const targetScale = clamp(
      Math.max(DRAG_FOCUS_SCALE, snapshot.scale),
      MIN_SCALE,
      MAX_SCALE
    );

    // Zoom under the focus point so the cell about to receive the tile stays readable.
    const local = screenPointToStageLocal(clientX, clientY);
    const point = wrapPointFromClient(clientX, clientY);
    const scaleDelta = targetScale - state.scale;
    const nextScale =
      Math.abs(scaleDelta) <= 0.02
        ? targetScale
        : state.scale + scaleDelta * Math.max(DRAG_FOCUS_SCALE_LERP, 0.55);
    setTransformAtPoint(nextScale, point.x, point.y, local.x, local.y);

    // Near the viewport edge, nudge the board so far cells stay reachable while zoomed.
    let panX = 0;
    let panY = 0;
    if (clientX < wrapRect.left + DRAG_FOCUS_EDGE_PX) {
      panX = DRAG_FOCUS_EDGE_PAN_PX;
    } else if (clientX > wrapRect.right - DRAG_FOCUS_EDGE_PX) {
      panX = -DRAG_FOCUS_EDGE_PAN_PX;
    }
    if (clientY < wrapRect.top + DRAG_FOCUS_EDGE_PX) {
      panY = DRAG_FOCUS_EDGE_PAN_PX;
    } else if (clientY > wrapRect.bottom - DRAG_FOCUS_EDGE_PX) {
      panY = -DRAG_FOCUS_EDGE_PAN_PX;
    }
    if (panX || panY) {
      state.translateX += panX;
      state.translateY += panY;
      applyTransform(false);
    }

    updateDropHover(clientX, clientY);
  }

  function endDragFocus({ restore = false } = {}) {
    if (!state.dragFocusActive) {
      clearDropHover();
      return;
    }
    const snapshot = state.dragFocusSnapshot;
    state.dragFocusActive = false;
    state.dragFocusPaused = false;
    state.dragFocusSnapshot = null;
    clearDropHover();

    if (restore && snapshot) {
      state.userOverridden = snapshot.userOverridden;
      animateTo(
        {
          scale: snapshot.scale,
          translateX: snapshot.translateX,
          translateY: snapshot.translateY
        },
        160
      );
      return;
    }

    // Keep the placement zoom; zoom out with pinch (mobile) or scroll (desktop).
    cancelAnim();
    if (
      state.scale > MIN_SCALE + 0.01 ||
      Math.abs(state.translateX) > 1 ||
      Math.abs(state.translateY) > 1
    ) {
      state.userOverridden = true;
    }
    applyTransform(false);
  }

  function reset(animate = true) {
    cancelAnim();
    clearDropHover();
    state.dragFocusActive = false;
    state.dragFocusPaused = false;
    state.dragFocusSnapshot = null;
    const target = { scale: 1, translateX: 0, translateY: 0 };
    state.userOverridden = false;
    state.placementActive = false;
    state.lastPlacementTiles = [];
    state.gesture = null;
    state.suppressClick = false;
    state.wrap?.classList.remove("board-wrap-panning");
    if (animate && (state.scale !== 1 || state.translateX !== 0 || state.translateY !== 0)) {
      animateTo(target, 160);
      return;
    }
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    applyTransform(false);
  }

  function syncFromTiles(tiles, boardEl) {
    // Placement no longer moves the camera; players zoom/pan manually.
    if (boardEl) {
      state.lastBoardEl = boardEl;
    }
    state.lastPlacementTiles = Array.isArray(tiles)
      ? tiles.map(({ row, col }) => ({ row, col }))
      : [];
    state.placementActive = state.lastPlacementTiles.length > 0;
  }

  function startPinchGesture(event) {
    const [t0, t1] = event.touches;
    const midpointX = (t0.clientX + t1.clientX) / 2;
    const midpointY = (t0.clientY + t1.clientY) / 2;
    const anchor = screenPointToStageLocal(midpointX, midpointY);

    cancelAnim();
    state.userOverridden = true;
    state.stage?.classList.remove("board-stage-zoom-anim");
    state.gesture = {
      type: "pinch",
      startDistance: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
      startScale: state.scale,
      anchorStageX: anchor.x,
      anchorStageY: anchor.y
    };
  }

  function startPanGesture(clientX, clientY, input = "touch") {
    cancelAnim();
    state.userOverridden = true;
    state.stage?.classList.remove("board-stage-zoom-anim");
    state.gesture = {
      type: "pan",
      input,
      startClientX: clientX,
      startClientY: clientY,
      startTranslateX: state.translateX,
      startTranslateY: state.translateY,
      moved: false
    };
    state.wrap?.classList.toggle("board-wrap-panning", input === "mouse");
  }

  function updatePanGesture(clientX, clientY) {
    const gesture = state.gesture;
    if (!gesture || gesture.type !== "pan") {
      return;
    }
    const deltaX = clientX - gesture.startClientX;
    const deltaY = clientY - gesture.startClientY;
    if (!gesture.moved && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
      gesture.moved = true;
      state.suppressClick = true;
    }
    state.translateX = gesture.startTranslateX + deltaX;
    state.translateY = gesture.startTranslateY + deltaY;
    applyTransform(false);
  }

  function endPanGesture() {
    if (state.gesture?.type !== "pan") {
      return;
    }
    state.gesture = null;
    state.wrap?.classList.remove("board-wrap-panning");
    if (state.suppressClick) {
      window.setTimeout(() => {
        state.suppressClick = false;
      }, 0);
    }
  }

  function onMouseDown(event) {
    if (window.GlobbleTilePointerDrag?.isActive?.()) {
      return;
    }
    if (
      event.button !== 0 ||
      !isBoardPanTarget(event.target, event.clientX, event.clientY) ||
      !canSingleFingerPan()
    ) {
      return;
    }
    event.preventDefault();
    startPanGesture(event.clientX, event.clientY, "mouse");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(event) {
    if (state.gesture?.type !== "pan" || state.gesture.input !== "mouse") {
      return;
    }
    event.preventDefault();
    updatePanGesture(event.clientX, event.clientY);
  }

  function onMouseUp(event) {
    if (state.gesture?.type === "pan" && state.gesture.input === "mouse") {
      if (state.gesture.moved) {
        event.preventDefault();
        event.stopPropagation();
      }
      endPanGesture();
    }
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  function onSuppressClick(event) {
    if (state.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      state.suppressClick = false;
    }
  }

  function onTouchStart(event) {
    if (window.GlobbleTilePointerDrag?.isActive?.()) {
      return;
    }
    if (event.touches.length >= 2) {
      // Always allow pinch zoom, even at 1x and even over tiles.
      event.preventDefault();
      startPinchGesture(event);
      return;
    }

    if (
      event.touches.length === 1 &&
      isBoardPanTarget(event.target, event.touches[0].clientX, event.touches[0].clientY) &&
      canSingleFingerPan()
    ) {
      const touch = event.touches[0];
      startPanGesture(touch.clientX, touch.clientY, "touch");
    }
  }

  function onTouchMove(event) {
    if (!state.gesture) {
      // If a second finger lands mid-drag, switch into pinch.
      if (event.touches.length === 2) {
        event.preventDefault();
        startPinchGesture(event);
      }
      return;
    }

    if (state.gesture.type === "pinch" && event.touches.length >= 2) {
      event.preventDefault();
      const gesture = state.gesture;
      const [t0, t1] = event.touches;
      const distance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (gesture.startDistance <= 0) {
        return;
      }
      const midpointX = (t0.clientX + t1.clientX) / 2;
      const midpointY = (t0.clientY + t1.clientY) / 2;
      const midpoint = wrapPointFromClient(midpointX, midpointY);
      const factor = distance / gesture.startDistance;
      const nextScale = clamp(gesture.startScale * factor, MIN_SCALE, MAX_SCALE);
      setTransformAtPoint(
        nextScale,
        midpoint.x,
        midpoint.y,
        gesture.anchorStageX,
        gesture.anchorStageY
      );
      return;
    }

    if (state.gesture.type === "pan" && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      updatePanGesture(touch.clientX, touch.clientY);
      return;
    }

    if (state.gesture.type === "pan" && event.touches.length >= 2) {
      event.preventDefault();
      startPinchGesture(event);
    }
  }

  function onTouchEnd(event) {
    if (event.touches.length === 0) {
      if (state.gesture?.type === "pan") {
        endPanGesture();
      } else {
        state.gesture = null;
      }
      if (state.scale <= 1.08) {
        settleToRest(220);
      }
      return;
    }

    if (event.touches.length === 1 && state.gesture?.type === "pinch") {
      const touch = event.touches[0];
      if (state.scale <= 1.08) {
        state.gesture = null;
        settleToRest(220);
        return;
      }
      if (canSingleFingerPan()) {
        startPanGesture(touch.clientX, touch.clientY, "touch");
      } else {
        state.gesture = null;
      }
      return;
    }

    if (event.touches.length >= 2 && state.gesture?.type === "pan") {
      startPinchGesture(event);
    }
  }

  function onWheel(event) {
    // Trackpad pinch usually arrives as ctrl+wheel; also accept plain wheel over the board
    // when already zoomed so zooming out remains easy.
    const intentionalZoom = event.ctrlKey || event.metaKey || state.scale > 1.01;
    if (!intentionalZoom) {
      return;
    }
    event.preventDefault();
    cancelAnim();
    state.userOverridden = true;
    state.stage?.classList.remove("board-stage-zoom-anim");

    const factor = Math.exp(-event.deltaY * 0.0016);
    const nextScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);

    // Always allow returning to the full board; ease the last bit to rest.
    if (nextScale <= MIN_SCALE + 0.001) {
      settleToRest(200);
      return;
    }

    const anchor = screenPointToStageLocal(event.clientX, event.clientY);
    const point = wrapPointFromClient(event.clientX, event.clientY);
    setTransformAtPoint(nextScale, point.x, point.y, anchor.x, anchor.y);

    if (state.scale <= 1.02) {
      settleToRest(180);
    }
  }

  function onResize() {
    if (!state.placementActive || state.userOverridden || !state.lastPlacementTiles.length) {
      clampTransform();
      applyTransform(false);
      return;
    }
    cancelAnim();
    const token = state.animToken;
    state.animFrameId = requestAnimationFrame(() => {
      state.animFrameId = null;
      if (token !== state.animToken) {
        return;
      }
      if (!state.placementActive || !state.lastPlacementTiles.length) {
        return;
      }
      const focal = getPlacementFocal(state.lastBoardEl, state.lastPlacementTiles);
      if (!focal) {
        return;
      }
      setTransformForFocal(focal, PLACEMENT_ZOOM_SCALE, false);
    });
  }

  function init({ wrap, stage } = {}) {
    state.wrap = wrap || document.querySelector(".board-wrap");
    state.stage = stage || document.querySelector(".board-stage");
    if (!state.wrap || !state.stage) {
      return false;
    }

    state.wrap.addEventListener("mousedown", onMouseDown);
    state.wrap.addEventListener("click", onSuppressClick, true);
    state.wrap.addEventListener("wheel", onWheel, { passive: false });
    // passive:false so we can prevent browser page-zoom during board pinch
    state.wrap.addEventListener("touchstart", onTouchStart, { passive: false });
    state.wrap.addEventListener("touchmove", onTouchMove, { passive: false });
    state.wrap.addEventListener("touchend", onTouchEnd, { passive: true });
    state.wrap.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("resize", onResize);
    reset(false);
    return true;
  }

  window.GlobbleBoardZoom = {
    init,
    syncFromTiles,
    reset,
    beginDragFocus,
    updateDragFocus,
    pauseDragFocus,
    endDragFocus
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
