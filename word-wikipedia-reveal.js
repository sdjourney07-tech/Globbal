/**
 * Full-screen Wikipedia article shown after a successful word submit.
 * Uses Wikipedia summary REST API (iframes are blocked; full HTML is too heavy).
 */
(function wordWikipediaReveal() {
  const FETCH_TIMEOUT_MS = 5000;
  const SUMMARY_TIMEOUT_MS = 3500;

  let overlayEl = null;
  let activePromise = null;
  const articleCache = new Map();
  const pendingPrefetches = new Map();

  function cacheKey(word) {
    return String(word || "").trim().toUpperCase();
  }

  function pickPrimaryWord(scoredWords) {
    if (!scoredWords?.length) {
      return null;
    }
    return scoredWords
      .slice()
      .sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))[0]?.text;
  }

  function displayLabelForWord(word) {
    const placeApi = window.GlobblePlaceInfo;
    const meta = placeApi?.getPlaceMeta?.(word);
    // Prefer the canonical place name (not the tip blurb with population / kind).
    if (meta?.country && (meta.countryAlias || meta.kind === "country")) {
      return meta.country;
    }
    if (meta?.modernName && String(meta.modernName).trim() && meta.modernName !== "—") {
      return String(meta.modernName).trim();
    }
    if (placeApi?.formatDisplayLabel) {
      const formatted = placeApi.formatDisplayLabel(word);
      if (formatted) {
        return formatted;
      }
    }
    if (placeApi?.describeWord) {
      const described = placeApi.describeWord(word);
      // describeWord uses "Name — region …" or "Name (kind) · …"
      const head = described.split(/\s+[—·]\s+/)[0]?.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (head) {
        return head;
      }
    }
    return simpleDisplayWord(word);
  }

  function titleToWikiSlug(title) {
    return String(title || "")
      .trim()
      .replace(/\s+/g, "_");
  }

  function wikiSlugFromUrl(url) {
    try {
      const parsed = new URL(url);
      const slug = parsed.pathname.replace(/^\/wiki\//, "");
      return slug ? decodeURIComponent(slug) : null;
    } catch {
      return null;
    }
  }

  function isUsableArticleUrl(url) {
    const slug = wikiSlugFromUrl(url);
    if (!slug) {
      return false;
    }
    // Special pages and bare search URLs are tip links only, not article sources.
    if (/^Special:/i.test(slug) || /^Wikipedia:/i.test(slug)) {
      return false;
    }
    return true;
  }

  function titleFromWikiUrl(url) {
    const slug = wikiSlugFromUrl(url);
    if (!slug || /^Special:/i.test(slug)) {
      return null;
    }
    return slug.replace(/_/g, " ");
  }

  function toMobileWikiPageUrl(url) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes("wikipedia.org")) {
        return url;
      }
      parsed.hostname = parsed.hostname.includes(".m.wikipedia.org")
        ? parsed.hostname
        : parsed.hostname.replace(".wikipedia.org", ".m.wikipedia.org");
      parsed.protocol = "https:";
      return parsed.toString();
    } catch {
      return url;
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const response = await fetchWithTimeout(url, {}, timeoutMs);
    if (!response.ok) {
      return null;
    }
    return response.json();
  }

  async function fetchSummaryForTitle(title) {
    if (!title) {
      return null;
    }
    return fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleToWikiSlug(title))}`,
      SUMMARY_TIMEOUT_MS
    );
  }

  async function fetchSummaryFromWikiUrl(url) {
    const slug = wikiSlugFromUrl(url);
    if (!slug) {
      return null;
    }
    return fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
      SUMMARY_TIMEOUT_MS
    );
  }

  const GEO_DESCRIPTION_RE =
    /\b(city|town|village|municipality|country|state|province|region|department|river|mountain|lake|sea|ocean|bay|gulf|island|capital|county|shire|continent|peninsula|strait|reservoir|republic|kingdom|emirate|territory|archipelago|atoll|cape|plateau|valley|glacier|waterfall|national park|human settlement|commune|prefecture|oblast|district|cerro|mountain range)\b/i;

  function isGeographicSummary(summary) {
    if (!summary || summary.type === "disambiguation") {
      return false;
    }
    if (summary.coordinates && Number.isFinite(summary.coordinates.lat)) {
      return true;
    }
    const description = summary.description || "";
    return GEO_DESCRIPTION_RE.test(description);
  }

  function articleFromSummary(summary, options = {}) {
    if (!summary) {
      return null;
    }
    if (!options.trusted && !isGeographicSummary(summary)) {
      return null;
    }
    const extract = String(summary.extract || "").trim();
    if (!extract) {
      return null;
    }
    const pageUrl = toMobileWikiPageUrl(
      summary.content_urls?.mobile?.page || summary.content_urls?.desktop?.page || ""
    );
    return {
      title: summary.title || "",
      extract,
      description: summary.description || "",
      thumbnail: summary.thumbnail?.source || "",
      pageUrl: pageUrl || null
    };
  }

  function simpleDisplayWord(word) {
    return String(word || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function buildLocalStub(word) {
    const label = simpleDisplayWord(word);
    return {
      title: label,
      extract: `Looking up ${label} on Wikipedia (geography)…`,
      thumbnail: null,
      pageUrl: null
    };
  }

  async function articleFromCandidate(candidate) {
    if (!candidate?.url || candidate.searchOnly || !isUsableArticleUrl(candidate.url)) {
      return null;
    }
    const summary =
      (await fetchSummaryFromWikiUrl(candidate.url)) ||
      (await fetchSummaryForTitle(candidate.label || titleFromWikiUrl(candidate.url)));
    const article = articleFromSummary(summary, { trusted: true });
    if (!article?.title || !article.extract) {
      return null;
    }
    // Avoid resolving tip labels like "Wikipedia" into the encyclopedia article.
    if (/^wikipedia$/i.test(article.title) && candidate.label && !/^wikipedia$/i.test(candidate.label)) {
      return null;
    }
    article.pageUrl = toMobileWikiPageUrl(candidate.url);
    return article;
  }

  async function searchGeographicWithMetaHints(word, placeApi) {
    const meta = placeApi?.getPlaceMeta?.(word);
    if (!meta) {
      return null;
    }

    const label = displayLabelForWord(word);
    const rawWord = simpleDisplayWord(word);
    const queries = [];
    const seen = new Set();
    const pushQuery = (query) => {
      const trimmed = String(query || "").trim();
      if (!trimmed || seen.has(trimmed.toUpperCase())) {
        return;
      }
      seen.add(trimmed.toUpperCase());
      queries.push(trimmed);
    };

    // Countries / aliases: search the real country name first ("United Kingdom", not "UK (country) · …").
    if (meta.kind === "country" || meta.countryAlias) {
      pushQuery(meta.country || label);
      pushQuery(label);
      pushQuery(rawWord);
    } else if (meta.kind === "abbreviation" && meta.abbreviationFor) {
      pushQuery(label);
      pushQuery(meta.abbreviationFor);
      if (meta.stateCode === "GA") {
        pushQuery("Georgia (U.S. state)");
      }
      if (meta.stateCode === "WA") {
        pushQuery("Washington (state)");
      }
      pushQuery(rawWord);
    } else {
      pushQuery(label);
      if (meta.country && meta.country !== label) {
        pushQuery(`${label} ${meta.country}`);
      }
      if (meta.region && meta.region !== meta.country) {
        pushQuery(`${label} ${meta.region}`);
      }
      if (meta.state) {
        pushQuery(`${label} ${meta.state}`);
      }
      if (rawWord.toUpperCase() !== label.toUpperCase()) {
        pushQuery(rawWord);
      }
    }

    const preferCountry = meta.kind === "country" || meta.countryAlias;

    for (const query of queries) {
      const search = await fetchJson(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`,
        SUMMARY_TIMEOUT_MS
      );
      const titles = Array.isArray(search) ? search[1] || [] : [];
      for (const title of titles) {
        const summary = await fetchSummaryForTitle(title);
        // Country lookups may hit non-geo first hits; still accept clearly matching country pages.
        const countryName = String(meta.country || label);
        const escaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const trusted =
          preferCountry &&
          summary?.title &&
          new RegExp(`\\b${escaped}\\b`, "i").test(summary.title);
        const article = articleFromSummary(summary, { trusted });
        if (article?.title) {
          return article;
        }
      }
    }

    return null;
  }

  async function resolveWikipediaArticle(word) {
    const placeApi = window.GlobblePlaceInfo;
    if (placeApi?.load) {
      await placeApi.load();
    }

    if (placeApi?.isGeographicWord && !placeApi.isGeographicWord(word)) {
      return null;
    }

    const candidates = placeApi?.getWikipediaCandidates?.(word) ?? [];
    for (const candidate of candidates) {
      const article = await articleFromCandidate(candidate);
      if (article) {
        return article;
      }
    }

    return searchGeographicWithMetaHints(word, placeApi);
  }

  function prefetch(scoredWords) {
    const word = pickPrimaryWord(scoredWords);
    if (!word) {
      return null;
    }
    const key = cacheKey(word);
    if (articleCache.has(key)) {
      const cached = articleCache.get(key);
      // Do not permanently stick on a failed lookup.
      if (cached) {
        return Promise.resolve(cached);
      }
      articleCache.delete(key);
    }
    if (pendingPrefetches.has(key)) {
      return pendingPrefetches.get(key);
    }
    const promise = resolveWikipediaArticle(word)
      .then((article) => {
        if (article?.extract) {
          articleCache.set(key, article);
        }
        pendingPrefetches.delete(key);
        return article;
      })
      .catch(() => {
        pendingPrefetches.delete(key);
        return null;
      });
    pendingPrefetches.set(key, promise);
    return promise;
  }

  function ensureOverlay() {
    if (overlayEl) {
      const shell = overlayEl.querySelector(".wiki-reveal-shell");
      if (!shell?.classList.contains("wiki-reveal-parchment") || !shell.querySelector(".wiki-reveal-parchment-layer")) {
        overlayEl.remove();
        overlayEl = null;
      } else {
        return overlayEl;
      }
    }
    overlayEl = document.createElement("div");
    overlayEl.id = "globbleWikiReveal";
    overlayEl.className = "wiki-reveal";
    overlayEl.hidden = true;
    overlayEl.setAttribute("role", "dialog");
    overlayEl.setAttribute("aria-modal", "true");
    overlayEl.innerHTML = `
      <div class="wiki-reveal-shell wiki-reveal-parchment">
        <div class="wiki-reveal-parchment-layer" aria-hidden="true">
          <img
            class="wiki-reveal-parchment-sheet"
            src="./assets/parch2copy.png"
            alt=""
            draggable="false"
          />
        </div>
        <header class="wiki-reveal-header">
          <div class="wiki-reveal-heading">
            <p class="wiki-reveal-kicker">Wikipedia</p>
            <h2 class="wiki-reveal-title"></h2>
          </div>
          <button type="button" class="wiki-reveal-continue score-cell">Continue</button>
        </header>
        <div class="wiki-reveal-body">
          <div class="wiki-reveal-loading">Loading article…</div>
          <div class="wiki-reveal-content" hidden>
            <img class="wiki-reveal-thumb" alt="" hidden />
            <div class="wiki-reveal-html"></div>
            <p class="wiki-reveal-extract" hidden></p>
            <a class="wiki-reveal-open" target="_blank" rel="noopener noreferrer" hidden>
              Read full article on Wikipedia
            </a>
          </div>
          <div class="wiki-reveal-fallback" hidden></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function setBodyLocked(locked) {
    document.body.classList.toggle("wiki-reveal-open", locked);
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function waitForFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function waitMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function waitForTransition(el, fallbackMs) {
    return new Promise((resolve) => {
      if (!el || prefersReducedMotion()) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        el.removeEventListener("transitionend", onEnd);
        resolve();
      };
      const onEnd = (event) => {
        if (event.target === el) {
          finish();
        }
      };
      el.addEventListener("transitionend", onEnd);
      window.setTimeout(finish, fallbackMs);
    });
  }

  async function openOverlay(el) {
    el.hidden = false;
    el.classList.remove("is-open", "is-closing");
    setBodyLocked(true);
    await waitForFrame();
    await waitForFrame();
    el.classList.add("is-open");
    await waitForTransition(el, 360);
  }

  async function hide() {
    if (!overlayEl) {
      return;
    }
    const el = overlayEl;
    el.classList.add("is-closing");
    el.classList.remove("is-open");
    await waitForTransition(el, 320);
    if (overlayEl === el) {
      el.remove();
      overlayEl = null;
    } else {
      el.remove();
    }
    setBodyLocked(false);
  }

  function waitForContinue(el) {
    return new Promise((resolve) => {
      const finish = () => {
        el.removeEventListener("click", onContinue);
        document.removeEventListener("keydown", onKeyDown);
        resolve();
      };
      const onContinue = (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".wiki-reveal-continue")) {
          finish();
        }
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          event.preventDefault();
          finish();
        }
      };
      el.addEventListener("click", onContinue);
      document.addEventListener("keydown", onKeyDown);
    });
  }

  function markPanelEnter(panelEl) {
    if (!panelEl || prefersReducedMotion()) {
      return;
    }
    panelEl.classList.remove("wiki-reveal-panel-enter");
    // Force restart so loading → content always fades in.
    void panelEl.offsetWidth;
    panelEl.classList.add("wiki-reveal-panel-enter");
  }

  function renderArticle(el, article, label) {
    const loadingEl = el.querySelector(".wiki-reveal-loading");
    const contentEl = el.querySelector(".wiki-reveal-content");
    const fallbackEl = el.querySelector(".wiki-reveal-fallback");
    const titleEl = el.querySelector(".wiki-reveal-title");
    const thumbEl = el.querySelector(".wiki-reveal-thumb");
    const htmlEl = el.querySelector(".wiki-reveal-html");
    const extractEl = el.querySelector(".wiki-reveal-extract");
    const openEl = el.querySelector(".wiki-reveal-open");

    loadingEl.hidden = true;
    fallbackEl.hidden = true;
    fallbackEl.replaceChildren();
    htmlEl.replaceChildren();
    extractEl.hidden = true;
    extractEl.textContent = "";
    thumbEl.hidden = true;
    thumbEl.removeAttribute("src");
    openEl.hidden = true;
    openEl.removeAttribute("href");
    contentEl.classList.remove("wiki-reveal-panel-enter");
    fallbackEl.classList.remove("wiki-reveal-panel-enter");

    if (!article) {
      fallbackEl.hidden = false;
      const message = document.createElement("p");
      message.className = "wiki-reveal-fallback-text";
      message.textContent = `No geographic Wikipedia article was found for ${label}.`;
      fallbackEl.appendChild(message);
      markPanelEnter(fallbackEl);
      return;
    }

    titleEl.textContent = article.title || label;

    if (article.thumbnail) {
      thumbEl.src = article.thumbnail;
      thumbEl.alt = article.title || label;
      thumbEl.hidden = false;
    }

    if (article.description) {
      const descEl = document.createElement("p");
      descEl.className = "wiki-reveal-description";
      descEl.textContent = article.description;
      htmlEl.appendChild(descEl);
    }

    if (article.extract) {
      extractEl.textContent = article.extract;
      extractEl.hidden = false;
    } else {
      fallbackEl.hidden = false;
      const message = document.createElement("p");
      message.className = "wiki-reveal-fallback-text";
      message.textContent = `Wikipedia has an article for ${article.title || label}, but no preview text was available.`;
      fallbackEl.appendChild(message);
      markPanelEnter(fallbackEl);
    }

    if (article.pageUrl) {
      openEl.href = article.pageUrl;
      openEl.hidden = false;
    }

    contentEl.hidden = false;
    markPanelEnter(contentEl);
  }

  async function show(scoredWords, options = {}) {
    if (activePromise) {
      await activePromise;
    }

    const word = pickPrimaryWord(scoredWords);
    if (!word) {
      return;
    }

    activePromise = (async () => {
      const el = ensureOverlay();
      const headingEl = el.querySelector(".wiki-reveal-heading");
      const loadingEl = el.querySelector(".wiki-reveal-loading");
      const contentEl = el.querySelector(".wiki-reveal-content");
      const fallbackEl = el.querySelector(".wiki-reveal-fallback");
      const titleEl = el.querySelector(".wiki-reveal-title");
      const label = simpleDisplayWord(word);

      titleEl.textContent = label;
      let scoreEl = headingEl.querySelector(".wiki-reveal-score");
      if (options.scoreLine) {
        if (!scoreEl) {
          scoreEl = document.createElement("p");
          scoreEl.className = "wiki-reveal-score";
          headingEl.appendChild(scoreEl);
        }
        scoreEl.textContent = options.scoreLine;
        scoreEl.hidden = false;
      } else if (scoreEl) {
        scoreEl.hidden = true;
      }

      loadingEl.hidden = false;
      contentEl.hidden = true;
      fallbackEl.hidden = true;
      loadingEl.classList.remove("wiki-reveal-panel-enter");
      window.GlobblePlaceInfo?.hidePlaceTip?.(true);
      await openOverlay(el);
      markPanelEnter(loadingEl);

      let article = null;
      try {
        article = await (options.articlePromise || prefetch(scoredWords));
        if (!article?.extract) {
          article = await prefetch(scoredWords);
        }
      } catch {
        article = null;
      }

      // Let the parchment settle briefly before swapping loading → article.
      if (!prefersReducedMotion()) {
        await waitMs(40);
      }

      if (overlayEl === el) {
        renderArticle(el, article, label);
      }

      await waitForContinue(el);
      await hide();
    })();

    try {
      await activePromise;
    } finally {
      activePromise = null;
    }
  }

  window.GlobbleWordWikipediaReveal = {
    prefetch,
    show
  };
})();
