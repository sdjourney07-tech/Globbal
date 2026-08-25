(function stockcakeMapWorkshop() {
  const mapFrame = document.getElementById("mapFrame");
  const sourceMap = document.getElementById("sourceMap");
  const cropWidget = document.getElementById("compassCrop");
  const cropDrag = document.getElementById("cropDrag");
  const cropResize = document.getElementById("cropResize");
  const compassPreview = document.getElementById("compassPreview");
  const parchmentPreview = document.getElementById("parchmentPreview");
  const cropStats = document.getElementById("cropStats");
  const resetCropBtn = document.getElementById("resetCropBtn");
  const downloadCropBtn = document.getElementById("downloadCropBtn");

  if (!mapFrame || !sourceMap || !cropWidget) {
    return;
  }

  const STORAGE_KEY = "globble-stockcake-compass-crop-v1";
  const MIN_SIZE = 48;
  const DEFAULT_CROP = { xPct: 0.31, yPct: 0.08, sizePct: 0.38 };

  let crop = { ...DEFAULT_CROP };
  let frameWidth = 0;
  let frameHeight = 0;
  let naturalWidth = 0;
  let naturalHeight = 0;

  function readSavedCrop() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (
        saved &&
        Number.isFinite(saved.xPct) &&
        Number.isFinite(saved.yPct) &&
        Number.isFinite(saved.sizePct)
      ) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function saveCrop() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crop));
  }

  function clampCrop() {
    const maxSize = Math.min(1, 1 - crop.xPct, 1 - crop.yPct);
    crop.sizePct = Math.min(Math.max(MIN_SIZE / Math.max(frameWidth, 1), crop.sizePct), maxSize);
    crop.xPct = Math.min(Math.max(0, crop.xPct), 1 - crop.sizePct);
    crop.yPct = Math.min(Math.max(0, crop.yPct), 1 - crop.sizePct);
  }

  function applyCropBox() {
    const sizePx = crop.sizePct * frameWidth;
    cropWidget.style.left = `${crop.xPct * frameWidth}px`;
    cropWidget.style.top = `${crop.yPct * frameHeight}px`;
    cropWidget.style.width = `${sizePx}px`;
    cropWidget.style.height = `${sizePx}px`;
  }

  function cropPixels() {
    const sizePx = crop.sizePct * frameWidth;
    const scaleX = naturalWidth / frameWidth;
    const scaleY = naturalHeight / frameHeight;
    const sx = crop.xPct * frameWidth * scaleX;
    const sy = crop.yPct * frameHeight * scaleY;
    const sw = sizePx * scaleX;
    const sh = sizePx * scaleY;
    return { sx, sy, sw, sh, sizePx };
  }

  function renderPreviews() {
    if (!sourceMap.complete || !naturalWidth) {
      return;
    }

    const { sx, sy, sw, sh, sizePx } = cropPixels();
    const ctx = compassPreview.getContext("2d");
    const pctx = parchmentPreview.getContext("2d");

    compassPreview.width = 220;
    compassPreview.height = 220;
    ctx.clearRect(0, 0, 220, 220);
    ctx.drawImage(sourceMap, sx, sy, sw, sh, 0, 0, 220, 220);

    parchmentPreview.width = 280;
    parchmentPreview.height = 420;
    pctx.clearRect(0, 0, 280, 420);
    pctx.fillStyle = "rgba(255, 248, 235, 0.08)";
    pctx.fillRect(0, 0, 280, 420);
    pctx.drawImage(sourceMap, sx, sy, sw, sh, 70, 150, 140, 140);

    cropStats.innerHTML = `
      <dt>Crop position</dt>
      <dd>${Math.round(sx)} × ${Math.round(sy)} px</dd>
      <dt>Crop size</dt>
      <dd>${Math.round(sw)} × ${Math.round(sh)} px</dd>
      <dt>Display size</dt>
      <dd>${Math.round(sizePx)} px square</dd>
    `;
  }

  function measure() {
    frameWidth = mapFrame.clientWidth;
    frameHeight = sourceMap.clientHeight;
    naturalWidth = sourceMap.naturalWidth;
    naturalHeight = sourceMap.naturalHeight;
    clampCrop();
    applyCropBox();
    renderPreviews();
  }

  function framePoint(event) {
    const rect = mapFrame.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startInteraction(mode, event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();

    const start = framePoint(event);
    const origin = { ...crop };
    cropWidget.classList.add(mode === "resize" ? "is-resizing" : "is-dragging");

    function onMove(moveEvent) {
      const point = framePoint(moveEvent);
      const dx = (point.x - start.x) / frameWidth;
      const dy = (point.y - start.y) / frameHeight;

      if (mode === "drag") {
        crop.xPct = origin.xPct + dx;
        crop.yPct = origin.yPct + dy;
      } else {
        const delta = Math.max((point.x - start.x) / frameWidth, (point.y - start.y) / frameHeight);
        crop.sizePct = origin.sizePct + delta;
      }

      clampCrop();
      applyCropBox();
      renderPreviews();
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      cropWidget.classList.remove("is-dragging", "is-resizing");
      saveCrop();
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  cropDrag.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".crop-resize")) {
      return;
    }
    startInteraction("drag", event);
  });

  cropResize.addEventListener("pointerdown", (event) => {
    startInteraction("resize", event);
  });

  resetCropBtn?.addEventListener("click", () => {
    crop = { ...DEFAULT_CROP };
    clampCrop();
    applyCropBox();
    renderPreviews();
    saveCrop();
  });

  downloadCropBtn?.addEventListener("click", () => {
    renderPreviews();
    const link = document.createElement("a");
    link.download = "compass-rose-from-stockcake.png";
    link.href = compassPreview.toDataURL("image/png");
    link.click();
  });

  sourceMap.addEventListener("load", () => {
    const saved = readSavedCrop();
    crop = saved || { ...DEFAULT_CROP };
    measure();
  });

  window.addEventListener("resize", measure);

  if (sourceMap.complete) {
    const saved = readSavedCrop();
    crop = saved || { ...DEFAULT_CROP };
    measure();
  }
})();
