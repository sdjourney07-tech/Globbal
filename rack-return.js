/**
 * Animate a board tile floating back into its rack slot.
 * playQuick: fast slide into the drop slot (board drag-back).
 * play: lift + spin flight (bulk recall).
 */
(function () {
  const LIFT_END = 0.22;
  const LIFT_GROWTH = 0.28;
  const FLIGHT_PEAK_SCALE = 2.15;
  const SPIN_DEGREES = 540;
  const DEFAULT_DURATION_MS = 160;
  const RECALL_DURATION_MS = 120;
  const QUICK_DURATION_MS = 55;

  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  function createGhost(tile, width, height, sourceEl = null) {
    let ghost;
    if (sourceEl instanceof Element) {
      ghost = sourceEl.cloneNode(true);
      ghost.removeAttribute("draggable");
      ghost.className = "tile tile-return-ghost";
    } else {
      ghost = document.createElement("div");
      ghost.className = "tile tile-return-ghost";
      const isUnassignedBlank = tile.isBlank && tile.letter === "?";
      if (isUnassignedBlank) {
        ghost.classList.add("tile-blank");
      }
      const letterEl = document.createElement("span");
      letterEl.textContent = isUnassignedBlank ? "" : tile.letter;
      ghost.appendChild(letterEl);
      const valueEl = document.createElement("span");
      valueEl.className = "value";
      valueEl.textContent = tile.value;
      ghost.appendChild(valueEl);
    }
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    ghost.style.margin = "0";
    ghost.style.boxSizing = "border-box";
    ghost.style.containerType = "normal";
    if (sourceEl instanceof Element) {
      const computed = getComputedStyle(sourceEl);
      ghost.style.fontSize = computed.fontSize;
      ghost.style.padding = computed.padding;
      const sourceSpans = sourceEl.querySelectorAll("span");
      const ghostSpans = ghost.querySelectorAll("span");
      sourceSpans.forEach((src, index) => {
        const dst = ghostSpans[index];
        if (!dst) {
          return;
        }
        const spanComputed = getComputedStyle(src);
        dst.style.fontSize = spanComputed.fontSize;
        dst.style.fontFamily = spanComputed.fontFamily;
        dst.style.fontWeight = spanComputed.fontWeight;
        dst.style.lineHeight = spanComputed.lineHeight;
      });
    }
    return ghost;
  }

  function getSlotRect(rackEl, slotIndex) {
    const slot = rackEl.querySelector(`.rack-slot[data-rack-slot="${slotIndex}"]`);
    return slot ? slot.getBoundingClientRect() : null;
  }

  function toRectLike(rect) {
    if (!rect) {
      return null;
    }
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function resolveQuickFromRect({ boardRect, dragRect, dropPoint }) {
    const drag = toRectLike(dragRect);
    if (drag) {
      return drag;
    }
    const board = toRectLike(boardRect);
    if (dropPoint && board) {
      return {
        left: dropPoint.clientX - board.width / 2,
        top: dropPoint.clientY - board.height / 2,
        width: board.width,
        height: board.height
      };
    }
    return board;
  }

  function applyGhostFrame(ghost, fromRect, frame) {
    const halfW = (fromRect.width * frame.uniformScale) / 2;
    const halfH = (fromRect.height * frame.uniformScale) / 2;
    ghost.style.left = `${frame.cx - halfW}px`;
    ghost.style.top = `${frame.cy - halfH}px`;
    ghost.style.transform = `rotate(${frame.spin}deg) scale(${frame.uniformScale})`;
    ghost.style.opacity = String(frame.opacity);
  }

  function frameAt(t, fromRect, toRect, endUniformScale, liftY) {
    const startCenterX = fromRect.left + fromRect.width / 2;
    const startCenterY = fromRect.top + fromRect.height / 2;
    const endCenterX = toRect.left + toRect.width / 2;
    const endCenterY = toRect.top + toRect.height / 2;
    const liftedCenterY = startCenterY + liftY;

    let cx = startCenterX;
    let cy = startCenterY;
    const spin = -SPIN_DEGREES * t;
    let uniformScale = 1;

    if (t < LIFT_END) {
      const liftP = easeOutCubic(t / LIFT_END);
      cy = startCenterY + liftY * liftP;
      uniformScale = 1 + liftP * LIFT_GROWTH;
    } else {
      const flightP = (t - LIFT_END) / (1 - LIFT_END);
      const sizeBump = Math.sin(flightP * Math.PI);
      const shrink = 1 + (endUniformScale - 1) * flightP;
      const peakScale = Math.max(FLIGHT_PEAK_SCALE, shrink + 0.35);

      cx = startCenterX + (endCenterX - startCenterX) * flightP;
      cy = liftedCenterY + (endCenterY - liftedCenterY) * flightP;
      uniformScale = shrink + (peakScale - shrink) * sizeBump;
    }

    return {
      cx,
      cy,
      spin,
      uniformScale,
      opacity: 1 - t * 0.08
    };
  }

  function applyQuickGhostFrame(ghost, frame) {
    ghost.style.left = `${frame.left}px`;
    ghost.style.top = `${frame.top}px`;
    ghost.style.width = `${frame.width}px`;
    ghost.style.height = `${frame.height}px`;
    ghost.style.transform = "none";
    ghost.style.opacity = String(frame.opacity);
  }

  function quickFrameAt(t, fromRect, toRect) {
    const p = easeOutCubic(t);
    return {
      left: fromRect.left + (toRect.left - fromRect.left) * p,
      top: fromRect.top + (toRect.top - fromRect.top) * p,
      width: fromRect.width + (toRect.width - fromRect.width) * p,
      height: fromRect.height + (toRect.height - fromRect.height) * p,
      opacity: 1
    };
  }

  async function playQuick({ fromRect, toRect, tile, durationMs = QUICK_DURATION_MS, sourceEl = null }) {
    if (!fromRect || !toRect || !tile) {
      return;
    }

    const ghost = createGhost(tile, fromRect.width, fromRect.height, sourceEl);
    document.body.appendChild(ghost);
    applyQuickGhostFrame(ghost, quickFrameAt(0, fromRect, toRect));

    await new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        applyQuickGhostFrame(ghost, quickFrameAt(t, fromRect, toRect));
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          ghost.remove();
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  async function play({ fromRect, toRect, tile, durationMs = DEFAULT_DURATION_MS, sourceEl = null }) {
    if (!fromRect || !toRect || !tile) {
      return;
    }

    const ghost = createGhost(tile, fromRect.width, fromRect.height, sourceEl);
    document.body.appendChild(ghost);

    const endUniformScale = toRect.width / fromRect.width;
    const liftY = -Math.max(22, fromRect.height * 0.42);

    applyGhostFrame(
      ghost,
      fromRect,
      frameAt(0, fromRect, toRect, endUniformScale, liftY)
    );

    await new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        applyGhostFrame(
          ghost,
          fromRect,
          frameAt(t, fromRect, toRect, endUniformScale, liftY)
        );
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          ghost.remove();
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  window.GlobbleRackReturn = {
    play,
    playQuick,
    getSlotRect,
    resolveQuickFromRect,
    RECALL_DURATION_MS,
    QUICK_DURATION_MS
  };
})();
