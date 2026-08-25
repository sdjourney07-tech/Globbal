(function initSplashCompassRose() {
  const splash = document.getElementById("splashScreen");
  const widget = document.getElementById("splashCompass");
  if (!splash || !widget) {
    return;
  }

  const dragSurface = widget.querySelector(".splash-compass-drag");
  const resizeHandle = widget.querySelector(".splash-compass-resize");
  const STORAGE_KEY = "globble-splash-compass-v1";
  const MIN_SIZE = 72;
  const MAX_SIZE = 260;

  let state = { x: 0, y: 0, size: 128 };
  let suppressSplashClick = false;

  function readSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (
        saved &&
        Number.isFinite(saved.x) &&
        Number.isFinite(saved.y) &&
        Number.isFinite(saved.size)
      ) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function splashPoint(event) {
    const rect = splash.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function clampState() {
    const maxX = Math.max(0, splash.clientWidth - state.size);
    const maxY = Math.max(0, splash.clientHeight - state.size);
    state.x = Math.min(Math.max(0, state.x), maxX);
    state.y = Math.min(Math.max(0, state.y), maxY);
    state.size = Math.min(Math.max(MIN_SIZE, state.size), MAX_SIZE);
  }

  function applyState() {
    widget.style.transform = "none";
    widget.style.left = `${state.x}px`;
    widget.style.top = `${state.y}px`;
    widget.style.width = `${state.size}px`;
  }

  function captureDefaultState() {
    const splashRect = splash.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();
    state = {
      x: widgetRect.left - splashRect.left,
      y: widgetRect.top - splashRect.top,
      size: widgetRect.width,
    };
    clampState();
    applyState();
    saveState();
  }

  function initState() {
    const saved = readSavedState();
    if (saved) {
      state = saved;
      clampState();
      applyState();
      return;
    }
    captureDefaultState();
  }

  function startInteraction(mode, event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const startPointer = splashPoint(event);
    const origin = { ...state };
    let moved = false;

    widget.classList.add(mode === "resize" ? "is-resizing" : "is-dragging");
    document.body.classList.add("splash-compass-active");

    function onMove(moveEvent) {
      const point = splashPoint(moveEvent);
      const dx = point.x - startPointer.x;
      const dy = point.y - startPointer.y;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        moved = true;
      }

      if (mode === "drag") {
        state.x = origin.x + dx;
        state.y = origin.y + dy;
      } else {
        const delta = Math.max(dx, dy);
        state.size = origin.size + delta;
      }

      clampState();
      applyState();
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      widget.classList.remove("is-dragging", "is-resizing");
      document.body.classList.remove("splash-compass-active");
      saveState();

      if (moved) {
        suppressSplashClick = true;
        window.setTimeout(() => {
          suppressSplashClick = false;
        }, 0);
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  dragSurface?.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".splash-compass-resize")) {
      return;
    }
    startInteraction("drag", event);
  });

  resizeHandle?.addEventListener("pointerdown", (event) => {
    startInteraction("resize", event);
  });

  widget.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  window.addEventListener("splashBeforeNavigate", () => {
    saveState();
  });

  window.splashCompassShouldBlockNavigation = () => suppressSplashClick;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initState, { once: true });
  } else {
    initState();
  }

  window.addEventListener("resize", () => {
    clampState();
    applyState();
  });
})();
