/**
 * Touch-friendly tile pick-and-drop (HTML5 drag is unreliable on mobile).
 * Board stays stationary while dragging; zoom is unchanged from board-zoom.js.
 */
(function tilePointerDrag() {
  const DRAG_THRESHOLD_PX = 8;
  let options = null;
  let pending = null;
  let pointerDragging = false;
  let suppressClickUntil = 0;

  function getDraggableTile(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const tile = target.closest(".tile");
    if (!tile || tile.getAttribute("draggable") !== "true") {
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
    suppressClickUntil = Date.now() + 350;

    try {
      await options.onDrop(event.clientX, event.clientY);
    } finally {
      options.onDragEnd();
    }
  }

  function onNativeDragStart(event) {
    if (pointerDragging || pending) {
      event.preventDefault();
    }
  }

  function onRackClickCapture(event) {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function init(opts) {
    options = opts;
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);

    opts.rackEl?.addEventListener("click", onRackClickCapture, true);
    opts.rackEl?.addEventListener("dragstart", onNativeDragStart, true);
    opts.boardEl?.addEventListener("dragstart", onNativeDragStart, true);
  }

  window.GlobbleTilePointerDrag = { init };
})();
