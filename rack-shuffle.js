/**
 * Rack shuffle animation — tiles arc from their pre-shuffle slots to shuffled slots.
 */
(function () {
  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function applyTransform(el, tx, ty, rot, scale, z) {
    el.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`;
    el.style.zIndex = String(z);
  }

  function naturalSlotPositions(rackEl) {
    const rackRect = rackEl.getBoundingClientRect();
    return [...rackEl.querySelectorAll(".rack-slot")].map((slot) => {
      const rect = slot.getBoundingClientRect();
      return {
        x: rect.left - rackRect.left,
        y: rect.top - rackRect.top,
        w: rect.width,
        h: rect.height
      };
    });
  }

  function tileSlotKey(tile) {
    if (!tile) {
      return null;
    }
    return `${tile.letter}|${tile.value}|${tile.isBlank ? 1 : 0}`;
  }

  function computeSlotSources(before, after, rackSize) {
    const size = rackSize || Math.max(before?.length || 0, after?.length || 0);
    const sources = new Array(size).fill(null);
    const usedSrc = new Array(size).fill(false);

    for (let dest = 0; dest < size; dest += 1) {
      if (!after[dest]) {
        continue;
      }
      const key = tileSlotKey(after[dest]);
      if (
        before[dest] &&
        !usedSrc[dest] &&
        tileSlotKey(before[dest]) === key
      ) {
        sources[dest] = dest;
        usedSrc[dest] = true;
        continue;
      }
      for (let src = 0; src < size; src += 1) {
        if (usedSrc[src] || !before[src]) {
          continue;
        }
        if (tileSlotKey(before[src]) === key) {
          sources[dest] = src;
          usedSrc[src] = true;
          break;
        }
      }
      if (sources[dest] === null) {
        sources[dest] = dest;
      }
    }
    return sources;
  }

  function buildStates(rackEl, slotSources) {
    const slotPositions = naturalSlotPositions(rackEl);
    const states = [];

    rackEl.querySelectorAll(".rack-slot").forEach((slotEl) => {
      const tileEl = slotEl.querySelector(".tile");
      if (!tileEl) {
        return;
      }
      const destSlot = Number(slotEl.dataset.rackSlot);
      const srcSlot =
        slotSources && slotSources[destSlot] != null ? slotSources[destSlot] : destSlot;
      const from = slotPositions[srcSlot] || slotPositions[destSlot];
      const to = slotPositions[destSlot];
      if (!from || !to) {
        return;
      }
      states.push({
        el: tileEl,
        parent: slotEl,
        destSlot,
        srcSlot,
        x: from.x,
        y: from.y,
        w: from.w,
        h: from.h,
        toX: to.x,
        toY: to.y
      });
    });

    return states;
  }

  function captureTileTypography(tileEl) {
    const computed = getComputedStyle(tileEl);
    const letterEl =
      tileEl.querySelector(".value")?.previousElementSibling || tileEl.firstElementChild;
    const valueEl = tileEl.querySelector(".value");
    return {
      tileFontSize: computed.fontSize,
      letterFontSize: letterEl ? getComputedStyle(letterEl).fontSize : "",
      valueFontSize: valueEl ? getComputedStyle(valueEl).fontSize : ""
    };
  }

  function applyFrozenTypography(tileEl, typography) {
    if (!typography) {
      return;
    }
    if (typography.tileFontSize) {
      tileEl.style.fontSize = typography.tileFontSize;
    }
    const letterEl =
      tileEl.querySelector(".value")?.previousElementSibling || tileEl.firstElementChild;
    const valueEl = tileEl.querySelector(".value");
    if (letterEl && typography.letterFontSize) {
      letterEl.style.fontSize = typography.letterFontSize;
    }
    if (valueEl && typography.valueFontSize) {
      valueEl.style.fontSize = typography.valueFontSize;
    }
  }

  function clearPinnedStyles(el) {
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
    el.style.margin = "";
    el.style.pointerEvents = "";
    el.style.transform = "";
    el.style.zIndex = "";
    el.style.willChange = "";
    el.style.transformOrigin = "";
    el.style.fontSize = "";
    el.querySelectorAll("span").forEach((span) => {
      span.style.fontSize = "";
    });
  }

  function pinTiles(rackEl, states) {
    const rackRect = rackEl.getBoundingClientRect();
    rackEl.style.minHeight = `${Math.max(rackRect.height, 44)}px`;
    rackEl.classList.add("rack-shuffling");
    states.forEach((state) => {
      state.typography = captureTileTypography(state.el);
      rackEl.appendChild(state.el);
      state.el.classList.add("tile-shuffle-active");
      applyFrozenTypography(state.el, state.typography);
      state.el.style.position = "absolute";
      state.el.style.left = `${state.x}px`;
      state.el.style.top = `${state.y}px`;
      state.el.style.width = `${state.w}px`;
      state.el.style.height = `${state.h}px`;
      state.el.style.margin = "0";
      state.el.style.boxSizing = "border-box";
      state.el.style.pointerEvents = "none";
      state.el.style.transformOrigin = "center center";
      state.el.style.willChange = "transform";
      state.el.style.transform = "translate(0px, 0px) rotate(0deg) scale(1)";
    });
  }

  function unpinTiles(states) {
    states.forEach((state) => {
      state.el.classList.remove("tile-shuffle-active");
      clearPinnedStyles(state.el);
      state.parent.appendChild(state.el);
    });
  }

  async function animateStates(states, durationMs, frameFn) {
    const start = performance.now();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return new Promise((resolve) => {
      function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        states.forEach((state) => {
          const frame = frameFn(t, state);
          applyTransform(state.el, frame.tx, frame.ty, frame.rot, frame.scale, frame.z);
        });
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  async function runRecallAnimation(states) {
    if (states.length === 0) {
      return;
    }

    await animateStates(states, 140, (t, state) => {
      const e = easeInOutCubic(t);
      const lift = Math.sin(t * Math.PI) * -30;
      const pop = 1 + Math.sin(t * Math.PI) * 0.08;
      return {
        tx: (state.toX - state.x) * e,
        ty: (state.toY - state.y) * e + lift,
        rot: (1 - e) * 16,
        scale: pop,
        z: 100 + state.destSlot
      };
    });

    await animateStates(states, 45, (t, state) => {
      const e = easeOutCubic(t);
      const settle = 1 + (1 - e) * 0.04;
      return {
        tx: state.toX - state.x,
        ty: state.toY - state.y,
        rot: 0,
        scale: settle,
        z: 100 + state.destSlot
      };
    });

    states.forEach((state) => {
      applyTransform(state.el, state.toX - state.x, state.toY - state.y, 0, 1, 100 + state.destSlot);
    });
  }

  function createRecallGhost(sourceEl, tile, fromRect) {
    let ghost;
    if (sourceEl instanceof Element) {
      ghost = sourceEl.cloneNode(true);
      ghost.removeAttribute("draggable");
      ghost.className = `${sourceEl.className} tile-shuffle-active`.replace(/\btile-drag-source\b/g, "").trim();
    } else if (tile) {
      ghost = document.createElement("div");
      ghost.className = "tile tile-shuffle-active";
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
    } else {
      return null;
    }
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.position = "fixed";
    ghost.style.left = `${fromRect.left}px`;
    ghost.style.top = `${fromRect.top}px`;
    ghost.style.width = `${fromRect.width}px`;
    ghost.style.height = `${fromRect.height}px`;
    ghost.style.margin = "0";
    ghost.style.boxSizing = "border-box";
    ghost.style.pointerEvents = "none";
    ghost.style.transformOrigin = "center center";
    ghost.style.willChange = "transform";
    ghost.style.zIndex = "10000";
    ghost.style.transform = "translate(0px, 0px) rotate(0deg) scale(1)";
    document.body.appendChild(ghost);
    return ghost;
  }

  async function playRecall(items, options = {}) {
    const { button } = options;
    const valid = (items || []).filter((item) => item.fromRect && item.toRect && item.tile);
    if (!valid.length) {
      return;
    }

    if (button) {
      button.disabled = true;
    }

    const states = [];
    valid.forEach((item, index) => {
      const ghost = createRecallGhost(item.tileEl, item.tile, item.fromRect);
      if (!ghost) {
        return;
      }
      states.push({
        el: ghost,
        x: item.fromRect.left,
        y: item.fromRect.top,
        toX: item.toRect.left,
        toY: item.toRect.top,
        destSlot: index,
        srcSlot: index
      });
    });

    try {
      await runRecallAnimation(states);
    } finally {
      states.forEach((state) => state.el.remove());
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function runShuffleAnimation(rackEl, states) {
    if (states.length < 2) {
      return;
    }

    pinTiles(rackEl, states);

    await animateStates(states, 140, (t, state) => {
      const e = easeInOutCubic(t);
      const lift = Math.sin(t * Math.PI) * -30;
      const pop = 1 + Math.sin(t * Math.PI) * 0.08;
      return {
        tx: (state.toX - state.x) * e,
        ty: (state.toY - state.y) * e + lift,
        rot: (1 - e) * (state.srcSlot - state.destSlot) * 2.5,
        scale: pop,
        z: 10 + state.destSlot
      };
    });

    await animateStates(states, 45, (t, state) => {
      const e = easeOutCubic(t);
      const settle = 1 + (1 - e) * 0.04;
      return {
        tx: state.toX - state.x,
        ty: state.toY - state.y,
        rot: 0,
        scale: settle,
        z: 10 + state.destSlot
      };
    });

    states.forEach((state) => {
      applyTransform(
        state.el,
        state.toX - state.x,
        state.toY - state.y,
        0,
        1,
        10 + state.destSlot
      );
    });

    unpinTiles(states);
    rackEl.classList.remove("rack-shuffling");
    rackEl.classList.remove("is-shuffle-prep");
    rackEl.style.minHeight = "";
  }

  async function play(rackEl, options = {}) {
    if (!rackEl || rackEl.dataset.shuffling === "1") {
      return;
    }

    const { slotSources, button } = options;
    let states = buildStates(rackEl, slotSources);
    if (states.length < 2) {
      rackEl.classList.remove("is-shuffle-prep");
      return;
    }

    rackEl.dataset.shuffling = "1";
    if (button) {
      button.disabled = true;
    }

    try {
      await runShuffleAnimation(rackEl, states);
    } finally {
      rackEl.dataset.shuffling = "0";
      rackEl.classList.remove("is-shuffle-prep");
      if (button) {
        button.disabled = false;
      }
    }
  }

  window.GlobbleRackShuffle = {
    play,
    playRecall,
    computeSlotSources
  };
})();
