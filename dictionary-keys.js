/**
 * Dictionary display names may include spaces; tiles on the board are always compact (no spaces).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GlobbleDictionaryKeys = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function dictionaryKeysFactory() {
  function compactWord(word) {
    return String(word || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "")
      .toUpperCase();
  }

  function displayWord(word) {
    return String(word || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  /** Tile bag has no number tiles — words with digit characters are not playable. */
  function containsDigit(word) {
    return /[0-9]/.test(String(word || ""));
  }

  function isPlayableDictionaryWord(word) {
    const display = displayWord(word);
    return Boolean(display) && compactWord(display).length >= 2 && !containsDigit(display);
  }

  const OF_PREFIXED_PATTERNS = ["BAY OF ", "GULF OF ", "BIGHT OF ", "SEA OF ", "KINGDOM OF "];
  const PLACE_ALIAS_SUFFIXES = [
    " RIVER",
    " SEA",
    " OCEAN",
    " BAY",
    " GULF",
    " BIGHT",
    " EMPIRE",
    " KINGDOM"
  ];

  function placeShortDisplays(word) {
    const normalized = displayWord(word);
    const results = [];
    const seen = new Set();

    const add = (value) => {
      const short = displayWord(value);
      if (!short || short === normalized || seen.has(short)) {
        return;
      }
      seen.add(short);
      results.push(short);
    };

    for (const prefix of OF_PREFIXED_PATTERNS) {
      if (normalized.startsWith(prefix)) {
        add(normalized.slice(prefix.length));
      }
    }

    for (const suffix of PLACE_ALIAS_SUFFIXES) {
      if (normalized.endsWith(suffix)) {
        add(normalized.slice(0, -suffix.length));
      }
    }

    return results;
  }

  function kingdomEmpireShortDisplay(word) {
    const normalized = displayWord(word);
    if (normalized.startsWith("KINGDOM OF ")) {
      const rest = normalized.slice("KINGDOM OF ".length).trim();
      return rest || null;
    }
    if (normalized.endsWith(" EMPIRE")) {
      const rest = normalized.slice(0, -" EMPIRE".length).trim();
      return rest || null;
    }
    if (normalized.endsWith(" KINGDOM")) {
      const rest = normalized.slice(0, -" KINGDOM".length).trim();
      return rest || null;
    }
    return null;
  }

  function ofPrefixedShortDisplay(word, prefixes = OF_PREFIXED_PATTERNS) {
    const normalized = displayWord(word);
    for (const prefix of prefixes) {
      if (normalized.startsWith(prefix)) {
        const rest = normalized.slice(prefix.length).trim();
        return rest || null;
      }
    }
    return null;
  }

  function bayOfShortDisplay(word) {
    return ofPrefixedShortDisplay(word, ["BAY OF "]);
  }

  function gulfOfShortDisplay(word) {
    return ofPrefixedShortDisplay(word, ["GULF OF "]);
  }

  function shouldApplyPlaceAliases(word, meta) {
    if (!meta) {
      return false;
    }
    if (meta.kind === "river" || meta.river) {
      return true;
    }
    const waterKind = meta.kind || meta.waterBody?.type;
    if (["ocean", "sea", "bay", "gulf", "bight"].includes(waterKind)) {
      return true;
    }
    if (meta.kind === "historicalEmpire" || meta.kind === "historicalKingdom") {
      return true;
    }
    if (meta.kind === "historicalCountry" && kingdomEmpireShortDisplay(word)) {
      return true;
    }
    return false;
  }

  function collectAliasSourceWords(words, metadata) {
    return words.filter((word) => shouldApplyPlaceAliases(word, metadata[word]));
  }

  function addPlayAliases(words, playableSet, wordCompacts, aliasSourceSet) {
    words.forEach((word) => {
      if (aliasSourceSet && !aliasSourceSet.has(word)) {
        return;
      }
      placeShortDisplays(word).forEach((shortDisplay) => {
        const shortCompact = compactWord(shortDisplay);
        const fullCompact = compactWord(word);
        if (!shortCompact || shortCompact === fullCompact) {
          return;
        }
        if (wordCompacts.has(shortCompact)) {
          return;
        }
        playableSet.add(shortCompact);
      });
    });
  }

  function buildPlayableDictionary(words, options = {}) {
    const set = new Set();
    const wordCompacts = new Set();
    words.forEach((word) => {
      const compact = compactWord(word);
      if (compact) {
        set.add(compact);
        wordCompacts.add(compact);
      }
    });

    let aliasSourceSet = null;
    if (Array.isArray(options.aliasSources)) {
      aliasSourceSet = new Set(options.aliasSources);
    } else if (options.metadata && typeof options.metadata === "object") {
      aliasSourceSet = new Set(collectAliasSourceWords(words, options.metadata));
    }

    if (aliasSourceSet) {
      addPlayAliases(words, set, wordCompacts, aliasSourceSet);
    }

    return set;
  }

  return {
    compactWord,
    displayWord,
    containsDigit,
    isPlayableDictionaryWord,
    placeShortDisplays,
    shouldApplyPlaceAliases,
    collectAliasSourceWords,
    ofPrefixedShortDisplay,
    kingdomEmpireShortDisplay,
    bayOfShortDisplay,
    gulfOfShortDisplay,
    buildPlayableDictionary
  };
});
