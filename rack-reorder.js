/**
 * Drag-and-drop reordering within the tile rack.
 */
(function () {
  function getInsertionPoints(slots) {
    const points = [];
    for (let i = 0; i <= slots.length; i += 1) {
      if (i === 0) {
        const rect = slots[0].getBoundingClientRect();
        points.push({ index: 0, x: rect.left, y: rect.top + rect.height / 2 });
        continue;
      }
      if (i === slots.length) {
        const rect = slots[slots.length - 1].getBoundingClientRect();
        points.push({ index: i, x: rect.right, y: rect.top + rect.height / 2 });
        continue;
      }
      const prev = slots[i - 1].getBoundingClientRect();
      const next = slots[i].getBoundingClientRect();
      const sameRow = Math.abs(prev.top - next.top) < Math.min(prev.height, next.height) / 2;
      points.push({
        index: i,
        x: sameRow ? (prev.right + next.left) / 2 : next.left,
        y: sameRow ? prev.top + prev.height / 2 : (prev.bottom + next.top) / 2
      });
    }
    return points;
  }

  function getDropIndex(event, rackEl, fromIndex) {
    const slots = [...rackEl.querySelectorAll(".rack-slot")];
    if (slots.length === 0) {
      return 0;
    }
    if (fromIndex < 0 || fromIndex >= slots.length) {
      return 0;
    }

    const points = getInsertionPoints(slots);
    let insertBefore = slots.length;
    let bestDist = Infinity;
    points.forEach(({ index, x, y }) => {
      const dist = (event.clientX - x) ** 2 + (event.clientY - y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        insertBefore = index;
      }
    });

    let toIndex = insertBefore;
    if (fromIndex < insertBefore) {
      toIndex = insertBefore - 1;
    }
    return Math.max(0, Math.min(toIndex, slots.length - 1));
  }

  function moveRackSlots(rack, fromIndex, toIndex, rackSize) {
    const size = rackSize ?? rack.length;
    while (rack.length < size) {
      rack.push(null);
    }
    if (rack.length > size) {
      rack.length = size;
    }
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= size ||
      toIndex < 0 ||
      toIndex >= size ||
      !rack[fromIndex]
    ) {
      return false;
    }
    const [item] = rack.splice(fromIndex, 1);
    rack.splice(toIndex, 0, item);
    while (rack.length < size) {
      rack.push(null);
    }
    if (rack.length > size) {
      rack.length = size;
    }
    return true;
  }

  function moveInArray(array, fromIndex, toIndex) {
    return moveRackSlots(array, fromIndex, toIndex, array.length);
  }

  function clearDropIndicator(rackEl) {
    rackEl.querySelectorAll(".rack-slot.rack-insert-before").forEach((el) => {
      el.classList.remove("rack-insert-before");
    });
    rackEl.querySelectorAll(".rack-slot.rack-slot-return-target").forEach((el) => {
      el.classList.remove("rack-slot-return-target");
    });
    delete rackEl.dataset.dropIndex;
  }

  function getRackSlotAtPoint(event, rackEl) {
    const slots = [...rackEl.querySelectorAll(".rack-slot")];
    if (slots.length === 0) {
      return 0;
    }

    for (let index = 0; index < slots.length; index += 1) {
      const rect = slots[index].getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        return index;
      }
    }

    let bestIndex = 0;
    let bestDist = Infinity;
    slots.forEach((slot, index) => {
      const rect = slot.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dist = (event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function updateReturnDropIndicator(rackEl, slotIndex) {
    rackEl.querySelectorAll(".rack-slot").forEach((el, index) => {
      el.classList.toggle("rack-slot-return-target", index === slotIndex);
    });
    rackEl.dataset.dropIndex = String(slotIndex);
  }

  function updateDropIndicator(rackEl, toIndex, fromIndex) {
    rackEl.querySelectorAll(".rack-slot").forEach((el, index) => {
      el.classList.toggle("rack-insert-before", index === toIndex && fromIndex !== toIndex);
    });
    rackEl.dataset.dropIndex = String(toIndex);
  }

  function bindRackReorder(rackEl, options) {
    if (!rackEl || rackEl.dataset.rackReorderBound === "1") {
      return;
    }
    rackEl.dataset.rackReorderBound = "1";

    rackEl.addEventListener("dragover", (event) => {
      const boardPos = options.getDraggingBoardPos?.();
      if (boardPos && options.canReturnToRack?.()) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        rackEl.classList.add("rack-reorder-active");
        const slotIndex = getRackSlotAtPoint(event, rackEl);
        updateReturnDropIndicator(rackEl, slotIndex);
        return;
      }

      const fromIndex = options.getDraggingRackIndex();
      if (fromIndex === null || !options.canReorder()) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      rackEl.classList.add("rack-reorder-active");
      const toIndex = getDropIndex(event, rackEl, fromIndex);
      updateDropIndicator(rackEl, toIndex, fromIndex);
    }, true);

    rackEl.addEventListener("dragleave", (event) => {
      if (!rackEl.contains(event.relatedTarget)) {
        rackEl.classList.remove("rack-reorder-active");
        clearDropIndicator(rackEl);
      }
    });

    rackEl.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      rackEl.classList.remove("rack-reorder-active");
      clearDropIndicator(rackEl);

      const boardPos = options.getDraggingBoardPos?.();
      if (boardPos && options.canReturnToRack?.()) {
        const slotIndex = getRackSlotAtPoint(event, rackEl);
        options.onReturnToRack?.(boardPos.row, boardPos.col, slotIndex, {
          clientX: event.clientX,
          clientY: event.clientY
        });
        return;
      }

      const fromIndex = options.getDraggingRackIndex();
      if (fromIndex === null || !options.canReorder()) {
        return;
      }
      const toIndex = getDropIndex(event, rackEl, fromIndex);
      if (fromIndex !== toIndex) {
        options.onReorder(fromIndex, toIndex);
      }
    }, true);
  }

  let activeDrag = null;

  function isCoarsePointer() {
    try {
      return (
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(hover: none)").matches
      );
    } catch {
      return false;
    }
  }

  function dragVisuals() {
    if (isCoarsePointer()) {
      // Lift above the finger so the tile isn't covered; scale up for visibility.
      return { scale: 1.22, liftY: 56 };
    }
    return { scale: 1.06, liftY: 0 };
  }

  function copyTileTypography(source, ghost) {
    const computed = getComputedStyle(source);
    ghost.style.fontSize = computed.fontSize;
    ghost.style.fontFamily = computed.fontFamily;
    ghost.style.fontWeight = computed.fontWeight;
    ghost.style.lineHeight = computed.lineHeight;
    ghost.style.padding = computed.padding;
    ghost.style.boxSizing = computed.boxSizing;
    ghost.style.backgroundImage = computed.backgroundImage;
    ghost.style.backgroundSize = computed.backgroundSize;
    ghost.style.backgroundPosition = computed.backgroundPosition;
    ghost.style.backgroundColor = computed.backgroundColor;
    ghost.style.containerType = "normal";

    const copySpanStyles = (srcEl, ghostEl) => {
      if (!srcEl || !ghostEl) {
        return;
      }
      const spanComputed = getComputedStyle(srcEl);
      ghostEl.style.fontSize = spanComputed.fontSize;
      ghostEl.style.fontFamily = spanComputed.fontFamily;
      ghostEl.style.fontWeight = spanComputed.fontWeight;
      ghostEl.style.lineHeight = spanComputed.lineHeight;
      ghostEl.style.textShadow = spanComputed.textShadow;
    };

    const sourceSpans = source.querySelectorAll("span");
    const ghostSpans = ghost.querySelectorAll("span");
    sourceSpans.forEach((srcEl, index) => {
      copySpanStyles(srcEl, ghostSpans[index]);
    });
  }

  function styleDragGhost(ghost, source, rect, offsetX, offsetY, scale) {
    const computed = getComputedStyle(source);
    ghost.className = `${source.className} tile-drag-ghost`.replace(/\btile-drag-source\b/g, "").trim();
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.opacity = "1";
    ghost.style.visibility = "visible";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "10000";
    ghost.style.willChange = "left, top, transform";
    ghost.style.transformOrigin = "center center";
    ghost.style.transform = `scale(${scale})`;
    ghost.style.display = computed.display;
    ghost.style.alignItems = computed.alignItems;
    ghost.style.justifyContent = computed.justifyContent;
    ghost.style.boxShadow =
      computed.boxShadow ||
      "var(--tile-shadow-hover), 0 10px 28px rgba(42, 26, 15, 0.38)";
    ghost.style.border = computed.border || "1px solid var(--tile-border-dark)";
    ghost.style.borderRadius = computed.borderRadius || "8px";
    ghost.style.color = computed.color || "var(--tile-engrave)";
    copyTileTypography(source, ghost);
  }

  function hideNativeDragImage(event) {
    const blank = document.createElement("canvas");
    blank.width = 1;
    blank.height = 1;
    blank.style.position = "fixed";
    blank.style.top = "0";
    blank.style.left = "0";
    blank.style.opacity = "0";
    blank.style.pointerEvents = "none";
    document.body.appendChild(blank);
    event.dataTransfer.setDragImage(blank, 0, 0);
    return blank;
  }

  function positionDragGhost(event) {
    if (!activeDrag?.ghost) {
      return;
    }
    if (event.clientX === 0 && event.clientY === 0) {
      return;
    }
    // Anchor ghost center to the pointer (with optional lift above a finger).
    const halfW = activeDrag.width / 2;
    const halfH = activeDrag.height / 2;
    activeDrag.ghost.style.left = `${event.clientX - halfW}px`;
    activeDrag.ghost.style.top = `${event.clientY - halfH - activeDrag.liftY}px`;
  }

  function onDragMove(event) {
    positionDragGhost(event);
  }

  function onDocumentDragOver(event) {
    if (!activeDrag?.ghost) {
      return;
    }
    event.preventDefault();
    positionDragGhost(event);
  }

  function getActiveDragRect() {
    if (!activeDrag?.ghost) {
      return null;
    }
    return activeDrag.ghost.getBoundingClientRect();
  }

  function finishDragGhost() {
    endPointerDragTracking();
    if (!activeDrag) {
      return;
    }
    activeDrag.source.removeEventListener("drag", onDragMove);
    document.removeEventListener("dragover", onDocumentDragOver);
    activeDrag.source.classList.remove("tile-drag-source");
    activeDrag.ghost.remove();
    activeDrag.blankEl?.remove();
    activeDrag = null;
  }

  function resolveDragSource(event) {
    const target = event.target;
    if (target instanceof Element) {
      const tile = target.closest(".tile");
      if (tile) {
        return tile;
      }
    }
    return event.currentTarget;
  }

  function startDragGhostFromSource(source, clientX, clientY) {
    const rect = source.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const { scale, liftY } = dragVisuals();
    const ghost = source.cloneNode(true);
    styleDragGhost(ghost, source, rect, offsetX, offsetY, scale);
    document.body.appendChild(ghost);

    requestAnimationFrame(() => {
      source.classList.add("tile-drag-source");
    });

    activeDrag = {
      source,
      ghost,
      blankEl: null,
      offsetX,
      offsetY,
      width: rect.width,
      height: rect.height,
      liftY,
      scale
    };

    positionDragGhost({ clientX, clientY });
  }

  function endPointerDragTracking() {
    document.removeEventListener("pointermove", onPointerDragMove);
  }

  function onPointerDragMove(event) {
    if (event.cancelable) {
      event.preventDefault();
    }
    positionDragGhost(event);
  }

  function beginPointerDrag(source, clientX, clientY) {
    if (!source) {
      return;
    }
    finishDragGhost();
    startDragGhostFromSource(source, clientX, clientY);
    document.addEventListener("pointermove", onPointerDragMove, {
      passive: false
    });
  }

  function movePointerDrag(clientX, clientY) {
    positionDragGhost({ clientX, clientY });
  }

  function setOpaqueDragImage(event) {
    const source = resolveDragSource(event);
    if (!source || !event.dataTransfer) {
      return;
    }

    finishDragGhost();
    startDragGhostFromSource(source, event.clientX, event.clientY);

    const blankEl = hideNativeDragImage(event);
    activeDrag.blankEl = blankEl;

    source.addEventListener("drag", onDragMove);
    document.addEventListener("dragover", onDocumentDragOver);
    source.addEventListener("dragend", finishDragGhost, { once: true });
  }

  window.GlobbleRackReorder = {
    bindRackReorder,
    getDropIndex,
    getRackSlotAtPoint,
    moveRackSlots,
    moveInArray,
    setOpaqueDragImage,
    beginPointerDrag,
    movePointerDrag,
    finishDragGhost,
    getActiveDragRect
  };
})();
