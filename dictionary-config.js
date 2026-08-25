/**
 * Selects modern vs Ancient dictionary assets for this page.
 * Ancient mode is enabled with ?version=ancient or data-globble-version="ancient" on <html>.
 */
(function dictionaryConfig() {
  const params = new URLSearchParams(window.location.search);
  const fromHtml = document.documentElement.getAttribute("data-globble-version");
  const browseFull =
    document.documentElement.getAttribute("data-globble-dictionary-browse") === "full";
  const version =
    fromHtml === "ancient" ||
    params.get("version") === "ancient" ||
    browseFull
      ? "ancient"
      : "modern";

  window.GLOBBLE_DICTIONARY_VERSION = version;
  window.GLOBBLE_DICTIONARY_SCRIPT =
    version === "ancient" ? "./dictionary-ancient.js" : "./dictionary.js";
  window.GLOBBLE_PLACE_METADATA_FILE =
    version === "ancient" ? "place-metadata-ancient.json" : "place-metadata.json";
  window.GLOBBLE_DICTIONARY_CATEGORIES_FILE =
    version === "ancient"
      ? "dictionary-categories-ancient.json"
      : "dictionary-categories.json";
  window.GLOBBLE_ALIAS_SOURCES_SCRIPT =
    version === "ancient"
      ? "./dictionary-alias-sources-ancient.js"
      : "./dictionary-alias-sources.js";
})();
