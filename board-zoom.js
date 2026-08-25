/**
 * Board viewport: pinch-zoom anytime, Ctrl+scroll zoom, and pan while zoomed.
 * Placing tiles does not move the camera.
 */
(function boardZoom() {
  const PLACEMENT_ZOOM_SCALE = 1.88;
  const MIN_SCALE = 1;
  const MAX_SCALE = 2.4;
  const PLACEMENT_ANIM_MS = 180;

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
    animToken: 0
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
    // Allow any point on the board to be brought to the viewport center
    // (with a little slack), so corners/edges are fully inspectable while zoomed.
    const slackX = layout.wrapW * 0.1;
    const slackY = layout.wrapH * 0.1;
    const centerX = layout.wrapW / 2;
    const centerY = layout.wrapH / 2;
    const origin = getStageOrigin(layout);
    const boardLeft = layout.boardLeft;
    const boardRight = layout.boardLeft + layout.boardW;
    const boardTop = layout.boardTop;
    const boardBottom = layout.boardTop + layout.boardH;

    return {
      minX:
        centerX -
        layout.stageLeft -
        origin.x -
        (boardRight - origin.x) * scale -
        slackX,
      maxX:
        centerX -
        layout.stageLeft -
        origin.x -
        (boardLeft - origin.x) * scale +
        slackX,
      minY:
        centerY -
        layout.stageTop -
        origin.y -
        (boardBottom - origin.y) * scale -
        slackY,
      maxY:
        centerY -
        layout.stageTop -
        origin.y -
        (boardTop - origin.y) * scale +
        slackY
    };
  }

  function clampTransform() {
    const layout = getBoardLayout();
    if (!layout) {
      state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);
      return;
    }

    state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);

    if (state.scale <= MIN_SCALE) {
      state.scale = MIN_SCALE;
      state.translateX = 0;
      state.translateY = 0;
      return;
    }

    const bounds = getTranslateBounds(layout, state.scale);
    state.translateX = clamp(
      state.translateX,
      Math.min(bounds.minX, bounds.maxX),
      Math.max(bounds.minX, bounds.maxX)
    );
    state.translateY = clamp(
      state.translateY,
      Math.min(bounds.minY, bounds.maxY),
      Math.max(bounds.minY, bounds.maxY)
    );
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

  function isBoardPanTarget(target) {
    if (!state.wrap?.contains(target)) {
      return false;
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

  function reset(animate = true) {
    cancelAnim();
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
    if (event.button !== 0 || !isBoardPanTarget(event.target) || !canSingleFingerPan()) {
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
    if (event.touches.length >= 2) {
      // Always allow pinch zoom, even at 1x and even over tiles.
      event.preventDefault();
      startPinchGesture(event);
      return;
    }

    if (
      event.touches.length === 1 &&
      isBoardPanTarget(event.target) &&
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
      return;
    }

    if (event.touches.length === 1 && state.gesture?.type === "pinch") {
      const touch = event.touches[0];
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

    const anchor = screenPointToStageLocal(event.clientX, event.clientY);
    const point = wrapPointFromClient(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.0016);
    const nextScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
    setTransformAtPoint(nextScale, point.x, point.y, anchor.x, anchor.y);
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
    reset
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
