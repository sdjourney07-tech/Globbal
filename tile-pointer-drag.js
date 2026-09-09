/**
 * Touch-friendly tile pick-and-drop (HTML5 drag is unreliable on mobile).
 * Pointer drag is used for mouse, touch, and pen so desktop and mobile behave the same.
 */
(function tilePointerDrag() {
  const DRAG_THRESHOLD_PX = 4;
  let options = null;
  let pending = null;
  let pointerDragging = false;
  let suppressClickUntil = 0;
  let moveRafId = null;
  let latestMoveEvent = null;

  function isTileDraggable(tile) {
    if (!(tile instanceof Element)) {
      return false;
    }
    if (tile.draggable === true || tile.getAttribute("draggable") === "true") {
      return true;
    }
    if (tile.closest(".rack") && options?.canInteract?.()) {
      return true;
    }
    return false;
  }

  function getDraggableTile(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const tile = target.closest(".tile");
    if (!tile || !isTileDraggable(tile)) {
      return null;
    }
    return tile;
  }

  function resolveRackIndex(tile) {
    const rackEl = options?.rackEl;
    if (!rackEl) {
      return null;
    }
    const slot = tile.closest(".rack-slot");
    if (!slot || !rackEl.contains(slot)) {
      return null;
    }
    const index = Number(slot.dataset.rackSlot);
    return Number.isInteger(index) ? index : null;
  }

  function resolveBoardPos(tile) {
    const boardEl = options?.boardEl;
    if (!boardEl) {
      return null;
    }
    const cell = tile.closest(".cell");
    if (!cell || !boardEl.contains(cell)) {
      return null;
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return null;
    }
    return { row, col };
  }

  function onPointerDown(event) {
    if (!options?.canInteract?.()) {
      return;
    }
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    if (Date.now() < suppressClickUntil) {
      return;
    }

    const tile = getDraggableTile(event.target);
    if (!tile) {
      return;
    }

    const rackIndex = resolveRackIndex(tile);
    const boardPos = rackIndex === null ? resolveBoardPos(tile) : null;
    if (rackIndex === null && !boardPos) {
      return;
    }

    // Stop board pan / page scroll from stealing the gesture on mobile.
    if (event.cancelable && event.pointerType !== "mouse") {
      event.preventDefault();
    }

    pending = {
      pointerId: event.pointerId,
      tile,
      startX: event.clientX,
      startY: event.clientY,
      rackIndex,
      boardPos
    };
  }

  function getGhostCenter(fallbackX, fallbackY) {
    const dragRect = window.GlobbleRackReorder?.getActiveDragRect?.();
    if (!dragRect) {
      return { x: fallbackX, y: fallbackY };
    }
    return {
      x: dragRect.left + dragRect.width / 2,
      y: dragRect.top + dragRect.height / 2
    };
  }

  function syncBoardDragFocus(event, overRack) {
    const zoom = window.GlobbleBoardZoom;
    if (!zoom?.updateDragFocus) {
      return;
    }
    const wrap = document.querySelector(".board-wrap");
    if (!wrap) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const pointOver = (x, y) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    // Aim with the finger — that is what players expect on iPhone/iPad.
    const fingerX = event.clientX;
    const fingerY = event.clientY;
    const fingerOver = pointOver(fingerX, fingerY);
    const ghost = getGhostCenter(fingerX, fingerY);
    const ghostOver = pointOver(ghost.x, ghost.y);

    if (overRack && !fingerOver && !ghostOver) {
      zoom.pauseDragFocus?.();
      return;
    }
    if (!fingerOver && !ghostOver) {
      zoom.pauseDragFocus?.();
      return;
    }

    zoom.updateDragFocus(fingerX, fingerY);
  }

  function engageDrag(event) {
    const state = pending;
    if (!state) {
      return;
    }
    pending = null;
    pointerDragging = true;

    try {
      state.tile.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (state.rackIndex !== null) {
      options.onRackDragStart(state.rackIndex);
    } else if (state.boardPos) {
      options.onBoardDragStart(state.boardPos.row, state.boardPos.col);
    }

    window.GlobbleRackReorder?.beginPointerDrag(state.tile, event.clientX, event.clientY);
    window.GlobbleBoardZoom?.beginDragFocus?.();
    syncBoardDragFocus(event, false);
  }

  function flushPointerMove(event) {
    window.GlobbleRackReorder?.movePointerDrag(event.clientX, event.clientY);

    const rackEl = options?.rackEl;
    const reorder = window.GlobbleRackReorder;
    // Drop / rack probes use the finger so placement matches where you are pointing.
    const probe = { clientX: event.clientX, clientY: event.clientY };
    let overRack = false;

    if (rackEl) {
      const rackRect = rackEl.getBoundingClientRect();
      overRack =
        probe.clientX >= rackRect.left &&
        probe.clientX <= rackRect.right &&
        probe.clientY >= rackRect.top &&
        probe.clientY <= rackRect.bottom;
    }

    syncBoardDragFocus(event, overRack);

    if (!rackEl || !reorder) {
      return;
    }

    if (!overRack) {
      rackEl.classList.remove("rack-reorder-active");
      reorder.clearReorderPreview?.(rackEl);
      rackEl.querySelectorAll(".rack-slot").forEach((el) => {
        el.classList.remove("rack-insert-before", "rack-slot-return-target");
      });
      return;
    }

    const fromRack = options.getDraggingRackIndex?.();
    const fromBoard = options.getDraggingBoardPos?.();

    if (fromBoard && options.canReturnToRack?.()) {
      reorder.clearReorderPreview?.(rackEl);
      rackEl.classList.add("rack-reorder-active");
      const slotIndex = reorder.getRackSlotAtPoint(probe, rackEl);
      rackEl.querySelectorAll(".rack-slot").forEach((el, index) => {
        el.classList.toggle("rack-slot-return-target", index === slotIndex);
      });
      return;
    }

    if (fromRack !== null && fromRack !== undefined && options.canReorder?.()) {
      rackEl.classList.add("rack-reorder-active");
      const toIndex = reorder.getDropIndex(probe, rackEl, fromRack);
      if (typeof reorder.previewReorder === "function") {
        reorder.previewReorder(rackEl, fromRack, toIndex);
      } else {
        rackEl.querySelectorAll(".rack-slot").forEach((el, index) => {
          el.classList.toggle(
            "rack-insert-before",
            index === toIndex && fromRack !== toIndex
          );
        });
      }
    }
  }

  function onPointerMove(event) {
    if (pending && event.pointerId === pending.pointerId) {
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        event.preventDefault();
        engageDrag(event);
      }
      return;
    }

    if (!pointerDragging) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    latestMoveEvent = event;
    if (moveRafId != null) {
      return;
    }
    moveRafId = requestAnimationFrame(() => {
      moveRafId = null;
      const latest = latestMoveEvent;
      latestMoveEvent = null;
      if (!latest || !pointerDragging) {
        return;
      }
      flushPointerMove(latest);
    });
  }

  function cancelScheduledMove() {
    if (moveRafId != null) {
      cancelAnimationFrame(moveRafId);
      moveRafId = null;
    }
    latestMoveEvent = null;
  }

  async function onPointerUp(event) {
    if (pending && event.pointerId === pending.pointerId) {
      pending = null;
      return;
    }

    if (!pointerDragging) {
      return;
    }

    pointerDragging = false;
    suppressClickUntil = Date.now() + 80;
    cancelScheduledMove();

    // One last sync so the ghost matches the release point before we resolve the drop.
    window.GlobbleRackReorder?.movePointerDrag(event.clientX, event.clientY);

    // Drop under the finger — not the lifted ghost center.
    const dropX = event.clientX;
    const dropY = event.clientY;

    try {
      await options.onDrop(dropX, dropY);
    } finally {
      window.GlobbleRackReorder?.clearReorderPreview?.(options?.rackEl);
      window.GlobbleBoardZoom?.endDragFocus?.({ restore: false });
      options.onDragEnd();
    }
  }

  function onNativeDragStart(event) {
    // Pointer drag owns tiles on every device. Cancel HTML5 drag completely so
    // app dragstart/dragend handlers do not clear pointer-drag mid-gesture.
    if (getDraggableTile(event.target) || pointerDragging || pending) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function isActive() {
    return Boolean(pending) || pointerDragging;
  }

  function onRackClickCapture(event) {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function init(opts) {
    options = opts;
    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: false
    });
    document.addEventListener("pointermove", onPointerMove, {
      capture: true,
      passive: false
    });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);

    opts.rackEl?.addEventListener("click", onRackClickCapture, true);
    opts.rackEl?.addEventListener("dragstart", onNativeDragStart, true);
    opts.boardEl?.addEventListener("dragstart", onNativeDragStart, true);
  }

  window.GlobbleTilePointerDrag = { init, isActive };
})();
