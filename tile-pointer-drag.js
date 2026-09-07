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

    event.preventDefault();
    window.GlobbleRackReorder?.movePointerDrag(event.clientX, event.clientY);

    const rackEl = options?.rackEl;
    const reorder = window.GlobbleRackReorder;
    if (!rackEl || !reorder) {
      return;
    }

    const rackRect = rackEl.getBoundingClientRect();
    const overRack =
      event.clientX >= rackRect.left &&
      event.clientX <= rackRect.right &&
      event.clientY >= rackRect.top &&
      event.clientY <= rackRect.bottom;

    if (!overRack) {
      rackEl.classList.remove("rack-reorder-active");
      return;
    }

    const fromRack = options.getDraggingRackIndex?.();
    const fromBoard = options.getDraggingBoardPos?.();

    if (fromBoard && options.canReturnToRack?.()) {
      rackEl.classList.add("rack-reorder-active");
      const slotIndex = reorder.getRackSlotAtPoint(event, rackEl);
      rackEl.querySelectorAll(".rack-slot").forEach((el, index) => {
        el.classList.toggle("rack-slot-return-target", index === slotIndex);
      });
      return;
    }

    if (fromRack !== null && fromRack !== undefined && options.canReorder?.()) {
      rackEl.classList.add("rack-reorder-active");
      const toIndex = reorder.getDropIndex(event, rackEl, fromRack);
      rackEl.querySelectorAll(".rack-slot").forEach((el, index) => {
        el.classList.toggle("rack-insert-before", index === toIndex && fromRack !== toIndex);
      });
    }
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

    // The drag ghost is intentionally lifted above a finger on touch screens.
    // Resolve the drop from the visible tile center, not the obscured fingertip.
    const dragRect = window.GlobbleRackReorder?.getActiveDragRect?.();
    const dropX = dragRect ? dragRect.left + dragRect.width / 2 : event.clientX;
    const dropY = dragRect ? dragRect.top + dragRect.height / 2 : event.clientY;

    try {
      await options.onDrop(dropX, dropY);
    } finally {
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
