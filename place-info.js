/**
 * Shared place metadata (country / population) and Wikipedia links for board tooltips.
 */
(function placeInfo() {
  const state = {
    metadata: {},
    compactToDisplay: {},
    compactToMeta: {},
    loadPromise: null,
    lookupMapsBuilt: false
  };

  function wikipediaUrlForTitle(title) {
    if (!title) {
      return null;
    }
    const slug = encodeURI(String(title).trim().replace(/ /g, "_"));
    return `https://en.wikipedia.org/wiki/${slug}`;
  }

  /** Full English name for a US state abbreviation / ALL-CAPS dictionary key. */
  function formatStateFullName(nameOrCode) {
    const meta = getMetaForWord(nameOrCode);
    if (meta?.abbreviationFor) {
      return formatStateFullName(meta.abbreviationFor);
    }
    const raw = String(meta?.abbreviationFor || nameOrCode || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!raw) {
      return "";
    }
    // Prefer dictionary display ("NEW YORK" → "New York") when available.
    if (window.GlobbleDictionaryKeys?.displayWord) {
      const displayed = GlobbleDictionaryKeys.displayWord(raw);
      if (displayed && /[a-z]/.test(displayed)) {
        return displayed;
      }
    }
    return raw
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }

  /** Ambiguous state names that need a disambiguated Wikipedia title. */
  function stateWikipediaTitle(code, fullName) {
    const normalizedCode = String(code || "").toUpperCase();
    if (normalizedCode === "GA") {
      return "Georgia (U.S. state)";
    }
    if (normalizedCode === "WA") {
      return "Washington (state)";
    }
    return fullName;
  }

  function wikipediaCandidatesForStateAbbreviation(meta) {
    if (!meta?.abbreviationFor) {
      return [];
    }
    const fullName = formatStateFullName(meta.abbreviationFor);
    const code = meta.stateCode || "";
    const title = stateWikipediaTitle(code, fullName);
    const url = wikipediaUrlForTitle(title);
    if (!url) {
      return [];
    }

    const targetMeta = getMetaForWord(meta.abbreviationFor);
    // Prefer an existing unambiguous state article when the target is not a country clash.
    if (
      targetMeta?.kind === "state" &&
      targetMeta.wikipediaUrl &&
      !/\/Georgia$/i.test(targetMeta.wikipediaUrl)
    ) {
      const label =
        targetMeta.wikipediaCandidates?.[0]?.label &&
        !/^wikipedia$/i.test(targetMeta.wikipediaCandidates[0].label)
          ? targetMeta.wikipediaCandidates[0].label
          : fullName;
      return [
        {
          label,
          url: targetMeta.wikipediaUrl,
          kind: "state"
        }
      ];
    }

    return [
      {
        label: fullName,
        url,
        kind: "state"
      }
    ];
  }

  function getPlaceKind(meta) {
    if (!meta) {
      return null;
    }
    if (meta.kind === "abbreviation" && meta.abbreviationFor) {
      return "state";
    }
    if (meta.kind) {
      return meta.kind;
    }
    if (meta.river) {
      return "river";
    }
    if (meta.waterBody?.type) {
      return meta.waterBody.type;
    }
    if (meta.country && meta.population != null && !meta.state) {
      return "city";
    }
    return null;
  }

  function placeKindPriority(meta) {
    const kind = getPlaceKind(meta);
    if (kind === "country" || kind === "state") {
      return 100;
    }
    if (kind === "river") {
      return 80;
    }
    if (kind === "ocean" || kind === "sea") {
      return 70;
    }
    if (kind === "county" || kind === "shire") {
      return 60;
    }
    if (kind === "bay" || kind === "gulf" || kind === "bight") {
      return 40;
    }
    if (kind === "city" || meta?.country) {
      return 50;
    }
    return 0;
  }

  function shouldReplaceCompactMeta(existingMeta, nextMeta) {
    if (!existingMeta) {
      return true;
    }
    return placeKindPriority(nextMeta) > placeKindPriority(existingMeta);
  }

  function formatDisplayLabel(word) {
    if (!word) {
      return "";
    }
    const meta = (() => {
      ensureLookupMaps();
      const compact = window.GlobbleDictionaryKeys
        ? GlobbleDictionaryKeys.compactWord(word)
        : String(word).replace(/\s+/g, "").toUpperCase();
      return (
        state.metadata[word] ||
        state.compactToMeta[compact] ||
        state.metadata[state.compactToDisplay[compact]] ||
        null
      );
    })();
    if (meta?.kind === "abbreviation" && meta.abbreviationFor) {
      return formatStateFullName(meta.abbreviationFor);
    }
    if (!window.GlobbleDictionaryKeys) {
      return word;
    }
    const compact = GlobbleDictionaryKeys.compactWord(word);
    return state.compactToDisplay[compact] || GlobbleDictionaryKeys.displayWord(word) || word;
  }

  function ensureLookupMaps() {
    if (state.lookupMapsBuilt || !window.GlobbleDictionaryKeys) {
      return;
    }
    const words = typeof LOCKED_WORDS !== "undefined" ? LOCKED_WORDS : [];
    state.compactToDisplay = {};
    state.compactToMeta = {};

    words.forEach((entry) => {
      const compact = GlobbleDictionaryKeys.compactWord(entry);
      state.compactToDisplay[compact] = GlobbleDictionaryKeys.displayWord(entry);
    });

    Object.entries(state.metadata).forEach(([key, value]) => {
      const compact = GlobbleDictionaryKeys.compactWord(key);
      if (shouldReplaceCompactMeta(state.compactToMeta[compact], value)) {
        state.compactToMeta[compact] = value;
      }
      const display = GlobbleDictionaryKeys.displayWord(key);
      state.compactToDisplay[compact] = display;
    });

    words.forEach((entry) => {
      const meta = state.metadata[entry];
      if (!meta) {
        return;
      }
      const display = GlobbleDictionaryKeys.displayWord(entry);
      const compact = GlobbleDictionaryKeys.compactWord(entry);

      if (!GlobbleDictionaryKeys.shouldApplyPlaceAliases(entry, meta)) {
        return;
      }

      GlobbleDictionaryKeys.placeShortDisplays(entry).forEach((shortDisplay) => {
        const shortCompact = GlobbleDictionaryKeys.compactWord(shortDisplay);
        if (!shortCompact || shortCompact === compact) {
          return;
        }
        if (
          state.compactToDisplay[shortCompact] &&
          state.compactToDisplay[shortCompact] !== display
        ) {
          return;
        }
        if (!shouldReplaceCompactMeta(state.compactToMeta[shortCompact], meta)) {
          return;
        }
        state.compactToDisplay[shortCompact] = display;
        state.compactToMeta[shortCompact] = meta;
      });
    });
    state.lookupMapsBuilt = true;
  }

  function getMetaForWord(word) {
    ensureLookupMaps();
    const compact = window.GlobbleDictionaryKeys
      ? GlobbleDictionaryKeys.compactWord(word)
      : String(word).replace(/\s+/g, "").toUpperCase();
    return (
      state.metadata[word] ||
      state.compactToMeta[compact] ||
      state.metadata[state.compactToDisplay[compact]] ||
      null
    );
  }

  function candidateMatchesKind(candidate, meta) {
    const metaKind = getPlaceKind(meta);
    if (!candidate?.kind || !metaKind) {
      return true;
    }
    return candidate.kind === metaKind;
  }

  function getWikipediaCandidates(word) {
    const meta = getMetaForWord(word);
    if (!meta) {
      return [];
    }
    if (meta.kind === "abbreviation" && meta.abbreviationFor) {
      const abbrevCandidates = wikipediaCandidatesForStateAbbreviation(meta);
      if (abbrevCandidates.length) {
        return abbrevCandidates;
      }
    }
    let candidates = [];
    if (Array.isArray(meta.wikipediaCandidates) && meta.wikipediaCandidates.length) {
      candidates = meta.wikipediaCandidates.filter((c) => c && c.url);
    } else if (meta.wikipediaUrl) {
      candidates = [{ label: "Wikipedia", url: meta.wikipediaUrl, kind: getPlaceKind(meta) }];
    }
    const filtered = candidates.filter((c) => candidateMatchesKind(c, meta));
    const resolved = filtered.length ? filtered : candidates;
    if (resolved.length) {
      return resolved;
    }
    if (!isGeographicWord(word)) {
      return [];
    }
    // Always offer a reachable Wikipedia entry point for geographic words.
    const label = formatDisplayLabel(word);
    if (!label) {
      return [];
    }
    return [
      {
        label: label,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(label)}`,
        kind: getPlaceKind(meta),
        searchOnly: true
      }
    ];
  }

  function isGeographicWord(word) {
    const meta = getMetaForWord(word);
    if (!meta) {
      return false;
    }
    if (meta.wikipediaUrl || (Array.isArray(meta.wikipediaCandidates) && meta.wikipediaCandidates.length)) {
      return true;
    }
    if (meta.kind || meta.country || meta.region || meta.state) {
      return true;
    }
    if (meta.waterBody || meta.river || meta.population != null) {
      return true;
    }
    return false;
  }

  function formatPopulationValue(value) {
    if (value == null || value === 0) {
      return "—";
    }
    const normalized =
      typeof value === "string"
        ? value.replace(/,/g, "").replace(/\s+/g, "").trim()
        : value;
    const population = Number(normalized);
    if (!Number.isFinite(population) || population <= 0) {
      return "—";
    }
    return population.toLocaleString();
  }

  function formatCountryValue(value) {
    if (!value) {
      return "—";
    }
    if (value === "Russian Federation") {
      return "Russia";
    }
    if (value === "Iran, Islamic Republic of") {
      return "Iran";
    }
    if (value === "Islamic Republic of Iraq") {
      return "Iraq";
    }
    return value;
  }

  function formatAreaKm2(value) {
    if (value == null || value === 0) {
      return "—";
    }
    const area = Number(value);
    if (!Number.isFinite(area) || area <= 0) {
      return "—";
    }
    return `${area.toLocaleString()} km²`;
  }

  function describeWaterBody(display, meta) {
    const region = meta.region || meta.waterBody?.region || "—";
    const area =
      meta.areaKm2 != null
        ? formatAreaKm2(meta.areaKm2)
        : meta.waterBody?.areaKm2 != null
          ? formatAreaKm2(meta.waterBody.areaKm2)
          : "—";
    const typeLabel = meta.kind || meta.waterBody?.type || "water body";
    return `${display} — ${region} (${typeLabel}) · ${area}`;
  }

  function describeWord(word) {
    if (!word) {
      return "";
    }
    const display = formatDisplayLabel(word);
    const meta = getMetaForWord(word);
    if (meta?.kind === "country") {
      const pop = formatPopulationValue(meta.population);
      return `${display} (country) · ${pop}`;
    }
    if (meta?.kind === "historicalCountry") {
      const modern = meta.modernName && meta.modernName !== "—" ? ` → ${meta.modernName}` : "";
      const era = meta.era && meta.era !== "—" ? ` · ${meta.era}` : "";
      return `${display} (historical country${modern})${era}`;
    }
    if (meta?.kind === "historicalRegion") {
      const modern = meta.modernName && meta.modernName !== "—" ? ` → ${meta.modernName}` : "";
      const era = meta.era && meta.era !== "—" ? ` · ${meta.era}` : "";
      return `${display} (historical region${modern})${era}`;
    }
    if (meta?.kind === "historicalCity") {
      const modern = meta.modernName && meta.modernName !== "—" ? ` → ${meta.modernName}` : "";
      const country = meta.country ? ` · ${meta.country}` : "";
      const era = meta.era && meta.era !== "—" ? ` · ${meta.era}` : "";
      return `${display} (historical city${modern})${country}${era}`;
    }
    if (meta?.kind === "historicalEmpire" || meta?.kind === "historicalKingdom") {
      const type = meta.kind === "historicalEmpire" ? "empire" : "kingdom";
      const modern = meta.modernName && meta.modernName !== "—" ? ` → ${meta.modernName}` : "";
      const region = meta.region ? ` · ${meta.region}` : "";
      const era = meta.era && meta.era !== "—" ? ` · ${meta.era}` : "";
      return `${display} (historical ${type}${modern})${region}${era}`;
    }
    if (meta?.kind === "state") {
      const pop = formatPopulationValue(meta.population);
      return `${display} — United States (state) · ${pop}`;
    }
    if (meta?.kind === "abbreviation" && meta.abbreviationFor) {
      const pop = formatPopulationValue(meta.population);
      const code = meta.stateCode || String(word || "").toUpperCase();
      return `${code} — ${display} (U.S. state) · ${pop}`;
    }
    if (meta?.kind === "county") {
      const pop = formatPopulationValue(meta.population);
      const region = meta.region || "Ireland";
      return `${display} — ${region} (county) · ${pop}`;
    }
    if (meta?.kind === "shire") {
      const pop = formatPopulationValue(meta.population);
      const region = meta.region || "Britain";
      return `${display} — ${region} (shire) · ${pop}`;
    }
    if (meta?.kind === "river") {
      const region = meta.region || "—";
      const length = meta.lengthKm != null ? `${Number(meta.lengthKm).toLocaleString()} km` : "—";
      return `${display} (river) — ${region} · ${length}`;
    }
    if (meta?.waterBody) {
      return describeWaterBody(display, meta);
    }
    if (["ocean", "sea", "bay", "gulf", "bight"].includes(meta?.kind)) {
      return describeWaterBody(display, meta);
    }
    if (meta?.river) {
      const region = meta.river.region || "—";
      const length =
        meta.river.lengthKm != null ? `${Number(meta.river.lengthKm).toLocaleString()} km` : "—";
      return `${display} — ${region} (river) · ${length}`;
    }
    const country = formatCountryValue(meta && meta.country);
    const pop = meta ? formatPopulationValue(meta.population) : "—";
    if (country === "—" && pop === "—") {
      return `${display} — no place data`;
    }
    if (meta?.state) {
      return `${display} — ${meta.state} · ${pop}`;
    }
    return `${display} — ${country} · ${pop}`;
  }

  function load() {
    if (state.loadPromise) {
      return state.loadPromise;
    }
    const metaFile = window.GLOBBLE_PLACE_METADATA_FILE || "place-metadata.json?v=state-abbr-wiki1";
    const url = new URL(metaFile, window.location.href).href;
    state.loadPromise = fetch(url)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        state.metadata = data && typeof data === "object" ? data : {};
        state.compactToMeta = {};
        state.lookupMapsBuilt = false;
        const buildLookupMaps = () => ensureLookupMaps();
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(buildLookupMaps, { timeout: 8000 });
        } else {
          window.setTimeout(buildLookupMaps, 0);
        }
      })
      .catch(() => {
        state.metadata = {};
        state.compactToMeta = {};
        state.lookupMapsBuilt = false;
      });
    return state.loadPromise;
  }

  function inBounds(board, row, col) {
    const n = board.length;
    return row >= 0 && row < n && col >= 0 && col < n;
  }

  function getWordAt(board, row, col, backRowStep, backColStep, forwardRowStep, forwardColStep) {
    let startRow = row;
    let startCol = col;
    while (
      inBounds(board, startRow + backRowStep, startCol + backColStep) &&
      board[startRow + backRowStep][startCol + backColStep].tile
    ) {
      startRow += backRowStep;
      startCol += backColStep;
    }

    const cells = [];
    let r = startRow;
    let c = startCol;
    while (inBounds(board, r, c) && board[r][c].tile) {
      cells.push({ row: r, col: c, tile: board[r][c].tile });
      r += forwardRowStep;
      c += forwardColStep;
    }

    const text = cells.map((cell) => cell.tile.letter).join("");
    return { text, cells };
  }

  function wordIsFullyPlayed(word) {
    return (
      Array.isArray(word?.cells) &&
      word.cells.length > 0 &&
      word.cells.every((cell) => cell.tile && cell.tile.locked)
    );
  }

  function wordsForCell(board, row, col) {
    if (!board || !inBounds(board, row, col) || !board[row][col].tile) {
      return [];
    }
    // Only show place stats for words that have already been submitted.
    if (!board[row][col].tile.locked) {
      return [];
    }
    const h = getWordAt(board, row, col, 0, -1, 0, 1);
    const v = getWordAt(board, row, col, -1, 0, 1, 0);
    const out = [];
    if (h.text.length > 1 && wordIsFullyPlayed(h)) {
      out.push(h.text);
    }
    if (v.text.length > 1 && v.text !== h.text && wordIsFullyPlayed(v)) {
      out.push(v.text);
    }
    return out;
  }

  function linesForCell(board, row, col) {
    return wordsForCell(board, row, col).map((word) => describeWord(word));
  }

  function summaryBlockForWords(words) {
    if (!words || !words.length) {
      return "";
    }
    const lines = [];
    words.forEach((w) => {
      if (w && w.text) {
        lines.push(`• ${describeWord(w.text)}`);
      }
    });
    return lines.join("\n");
  }

  let tipEl = null;
  let activeTipCell = null;
  let hideTipTimer = null;
  let showTipTimer = null;
  let tipFadeTimer = null;
  let tipGeneration = 0;
  const HIDE_TIP_DELAY_MS = 220;
  const SHOW_TIP_DELAY_MS = 45;
  const TIP_FADE_MS = 180;
  /** @type {Map<string, number>} compact word → points scored when that word was played */
  const playedWordScores = new Map();

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function scoreKeyForWord(word) {
    if (window.GlobbleDictionaryKeys?.compactWord) {
      return GlobbleDictionaryKeys.compactWord(word);
    }
    return String(word || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function clearPlayedWordScores() {
    playedWordScores.clear();
  }

  function registerPlayedWordScores(entries) {
    if (!Array.isArray(entries)) {
      return;
    }
    entries.forEach((entry) => {
      const text = String(entry?.text || "").trim();
      const score = Number(entry?.score);
      if (!text || !Number.isFinite(score)) {
        return;
      }
      playedWordScores.set(scoreKeyForWord(text), score);
    });
  }

  function getPlayedWordScore(word) {
    const key = scoreKeyForWord(word);
    if (!key || !playedWordScores.has(key)) {
      return null;
    }
    return playedWordScores.get(key);
  }

  function clearHideTipTimer() {
    if (hideTipTimer != null) {
      window.clearTimeout(hideTipTimer);
      hideTipTimer = null;
    }
  }

  function clearShowTipTimer() {
    if (showTipTimer != null) {
      window.clearTimeout(showTipTimer);
      showTipTimer = null;
    }
  }

  function clearTipFadeTimer() {
    if (tipFadeTimer != null) {
      window.clearTimeout(tipFadeTimer);
      tipFadeTimer = null;
    }
  }

  function scheduleHidePlaceTip() {
    clearHideTipTimer();
    clearShowTipTimer();
    hideTipTimer = window.setTimeout(() => {
      hideTipTimer = null;
      if (tipEl?.dataset.hover === "1") {
        return;
      }
      hidePlaceTip(false);
    }, HIDE_TIP_DELAY_MS);
  }

  function ensureTipEl() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.id = "globblePlaceTip";
      tipEl.className = "globble-place-tip";
      tipEl.setAttribute("role", "tooltip");
      tipEl.hidden = true;
      tipEl.addEventListener("mouseenter", () => {
        clearHideTipTimer();
        tipEl.dataset.hover = "1";
      });
      tipEl.addEventListener("mouseleave", (event) => {
        delete tipEl.dataset.hover;
        const next = event.relatedTarget;
        if (activeTipCell && next instanceof Node && activeTipCell.contains(next)) {
          return;
        }
        scheduleHidePlaceTip();
      });
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function finishHidePlaceTip() {
    clearTipFadeTimer();
    if (!tipEl) {
      activeTipCell = null;
      return;
    }
    tipEl.hidden = true;
    tipEl.classList.remove("is-visible", "is-ready");
    tipEl.replaceChildren();
    delete tipEl.dataset.placement;
    delete tipEl.dataset.hover;
    tipEl.style.top = "";
    tipEl.style.left = "";
    tipEl.style.visibility = "";
    activeTipCell = null;
  }

  /** @param {boolean} [immediate=true] */
  function hidePlaceTip(immediate = true) {
    clearHideTipTimer();
    clearShowTipTimer();
    tipGeneration += 1;
    if (!tipEl || tipEl.hidden) {
      finishHidePlaceTip();
      return;
    }
    if (immediate || prefersReducedMotion() || !tipEl.classList.contains("is-visible")) {
      tipEl.classList.remove("is-visible");
      finishHidePlaceTip();
      return;
    }
    tipEl.classList.remove("is-visible");
    delete tipEl.dataset.hover;
    clearTipFadeTimer();
    tipFadeTimer = window.setTimeout(() => {
      tipFadeTimer = null;
      finishHidePlaceTip();
    }, TIP_FADE_MS);
  }

  function appendWikipediaLinks(container, word) {
    const candidates = getWikipediaCandidates(word);
    if (!candidates.length) {
      return;
    }
    const linksWrap = document.createElement("div");
    linksWrap.className = "globble-place-tip-links";
    if (candidates.length > 1) {
      const heading = document.createElement("div");
      heading.className = "globble-place-tip-links-heading";
      heading.textContent = "Wikipedia — choose a match:";
      linksWrap.appendChild(heading);
    }
    candidates.forEach((candidate) => {
      const link = document.createElement("a");
      link.className = "globble-place-tip-link";
      link.href = candidate.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `Open Wikipedia for ${candidate.label || word}`);
      const linkLabel =
        candidates.length > 1
          ? candidate.label || "Wikipedia article"
          : candidate.label && candidate.label !== "Wikipedia"
            ? `Wikipedia — ${candidate.label}`
            : "Open on Wikipedia";
      link.textContent = linkLabel;
      linksWrap.appendChild(link);
    });
    container.appendChild(linksWrap);
  }

  function buildTipContent(words) {
    const frag = document.createDocumentFragment();
    words.forEach((word, index) => {
      const section = document.createElement("div");
      section.className = "globble-place-tip-section";

      const desc = document.createElement("div");
      desc.className = "globble-place-tip-desc";
      desc.textContent = describeWord(word);
      section.appendChild(desc);

      const scored = getPlayedWordScore(word);
      if (scored != null) {
        const scoreEl = document.createElement("div");
        scoreEl.className = "globble-place-tip-score";
        scoreEl.textContent =
          scored === 1 ? "Scored 1 point in this game" : `Scored ${scored} points in this game`;
        section.appendChild(scoreEl);
      }

      appendWikipediaLinks(section, word);
      frag.appendChild(section);
      if (index < words.length - 1) {
        const divider = document.createElement("div");
        divider.className = "globble-place-tip-divider";
        divider.setAttribute("aria-hidden", "true");
        frag.appendChild(divider);
      }
    });
    return frag;
  }

  function positionTipEl(el, anchorRect) {
    const tipRect = el.getBoundingClientRect();
    const gap = 8;
    let top = anchorRect.bottom + gap;
    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let placement = "below";
    if (top + tipRect.height > window.innerHeight - 8) {
      top = Math.max(8, anchorRect.top - tipRect.height - gap);
      placement = "above";
    }
    el.dataset.placement = placement;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function showPlaceTipNear(words, anchorRect, cellEl) {
    if (!words.length) {
      hidePlaceTip(true);
      return;
    }
    clearTipFadeTimer();
    const el = ensureTipEl();
    const wasVisible = !el.hidden && el.classList.contains("is-visible");
    el.replaceChildren(buildTipContent(words));
    el.hidden = false;
    el.style.visibility = "hidden";
    el.classList.remove("is-visible");
    activeTipCell = cellEl || null;

    const reveal = () => {
      positionTipEl(el, anchorRect);
      el.style.visibility = "visible";
      el.classList.add("is-ready");
      if (prefersReducedMotion()) {
        el.classList.add("is-visible");
        return;
      }
      if (wasVisible) {
        // Soft content swap while staying open.
        el.classList.add("is-visible");
        return;
      }
      // Next frame so the enter transition always runs from the resting pose.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (activeTipCell === cellEl && tipEl === el && !el.hidden) {
            el.classList.add("is-visible");
          }
        });
      });
    };

    requestAnimationFrame(reveal);
  }

  async function showPlaceTipForCell(cellEl, board, row, col) {
    const words = wordsForCell(board, row, col);
    if (!words.length) {
      hidePlaceTip(true);
      return;
    }
    const generation = ++tipGeneration;
    // Paint immediately so hover feels instant; refresh after metadata loads.
    showPlaceTipNear(words, cellEl.getBoundingClientRect(), cellEl);
    await load();
    if (generation !== tipGeneration || !cellEl.isConnected || activeTipCell !== cellEl) {
      return;
    }
    showPlaceTipNear(words, cellEl.getBoundingClientRect(), cellEl);
  }

  function queueShowPlaceTipForCell(cellEl, board, row, col) {
    clearHideTipTimer();
    clearShowTipTimer();
    if (activeTipCell === cellEl && tipEl && !tipEl.hidden) {
      showPlaceTipForCell(cellEl, board, row, col);
      return;
    }
    showTipTimer = window.setTimeout(() => {
      showTipTimer = null;
      showPlaceTipForCell(cellEl, board, row, col);
    }, SHOW_TIP_DELAY_MS);
  }

  function bindLockedCellPlaceTip(cellEl, board, row, col) {
    if (!(cellEl instanceof HTMLElement)) {
      return;
    }
    cellEl.tabIndex = 0;
    cellEl.addEventListener("mouseenter", () => {
      queueShowPlaceTipForCell(cellEl, board, row, col);
    });
    cellEl.addEventListener("mouseleave", (event) => {
      const next = event.relatedTarget;
      if (tipEl && !tipEl.hidden && next instanceof Node && tipEl.contains(next)) {
        return;
      }
      scheduleHidePlaceTip();
    });
    cellEl.addEventListener("focus", () => {
      clearHideTipTimer();
      clearShowTipTimer();
      showPlaceTipForCell(cellEl, board, row, col);
    });
    cellEl.addEventListener("blur", () => {
      scheduleHidePlaceTip();
    });
    cellEl.addEventListener("click", () => {
      if (activeTipCell === cellEl && tipEl && !tipEl.hidden && tipEl.classList.contains("is-visible")) {
        hidePlaceTip(false);
        return;
      }
      clearHideTipTimer();
      clearShowTipTimer();
      showPlaceTipForCell(cellEl, board, row, col);
    });
  }

  window.GlobblePlaceInfo = {
    load,
    describeWord,
    formatDisplayLabel,
    getPlaceMeta: getMetaForWord,
    getWikipediaCandidates,
    isGeographicWord,
    linesForCell,
    summaryBlockForWords,
    bindLockedCellPlaceTip,
    hidePlaceTip,
    registerPlayedWordScores,
    clearPlayedWordScores,
    getPlayedWordScore
  };
})();
