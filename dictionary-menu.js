/* global LOCKED_WORDS, GlobbleDictionaryKeys */
/**
 * Standalone dictionary panel for pages that do not load app.js / app-online.js (e.g. Globbal main menu).
 */
(function dictionaryMenu() {
  const DICTIONARY_LIST_PREVIEW_LIMIT = 12000;

  const CATEGORIES = [
    { id: "countries", label: "Countries" },
    {
      id: "territories",
      label: "Territories",
      criteria: "Dependent territories and special administrative regions"
    },
    { id: "abbreviations", label: "Abbreviations" },
    { id: "usaStates", label: "USA states" },
    { id: "ukCounties", label: "UK counties" },
    { id: "rivers", label: "Rivers" },
    { id: "oceansSeas", label: "Oceans & seas" },
    { id: "baysGulfsBights", label: "Bays, gulfs & bights" },
    { id: "mountainRanges", label: "Mountains & hills", criteria: "Ranges, peaks over 1,500 ft, and hills" },
    {
      id: "landforms",
      label: "Plains & valleys"
    },
    {
      id: "islandsContinents",
      label: "Islands & continents",
      criteria: "Islands over 10 sq mi"
    },
    { id: "worldCities", label: "World cities", criteria: "Population greater than 10,000" },
    { id: "usaCities", label: "USA cities", criteria: "Population greater than 10,000" }
  ];

  const HISTORICAL_CATEGORIES = [
    { id: "historicalCountries", label: "Historical countries" },
    { id: "historicalRegions", label: "Historical regions" },
    { id: "historicalCities", label: "Historical cities" },
    { id: "historicalKingdomsEmpires", label: "Kingdoms & empires" }
  ];

  function getCategories() {
    return [...CATEGORIES, ...HISTORICAL_CATEGORIES];
  }

  function invalidateDictionaryWordCache() {
    sortedDictionaryWords = null;
  }

  const dictionaryDialog = document.getElementById("dictionaryDialog");
  const dictionaryReturnBtn = document.getElementById("dictionaryReturnBtn");
  const closeDictionaryBtn = document.getElementById("closeDictionaryBtn");
  const dictionaryFilterInput = document.getElementById("dictionaryFilter");
  const dictionaryMetaEl = document.getElementById("dictionaryMeta");
  const dictionaryHintEl = document.getElementById("dictionaryHint");
  const dictionaryCategoriesEl = document.getElementById("dictionaryCategories");
  const openDictionaryBtn = document.getElementById("openDictionaryBtn");

  if (!dictionaryDialog || !dictionaryFilterInput || !dictionaryCategoriesEl) {
    return;
  }

  let sortedDictionaryWords = null;
  let dictionaryFilterTimer = null;
  let placeMetadata = {};
  let wordCategories = null;

  function getSortedDictionaryWords() {
    if (!sortedDictionaryWords) {
      const words = typeof LOCKED_WORDS !== "undefined" ? LOCKED_WORDS : [];
      sortedDictionaryWords = Array.from(words).sort();
    }
    return sortedDictionaryWords;
  }

  function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) {
      return "0";
    }
    return count.toLocaleString();
  }

  function buildDictionaryMetaText(words, categoryCount) {
    const total = formatCount(words.length);
    const folders = formatCount(categoryCount);
    return `${total} legal words in ${folders} folders — modern places plus historical entries at the bottom. Click a folder to browse.`;
  }

  function formatElevationFeet(meta) {
    if (meta?.elevationFt != null && Number.isFinite(Number(meta.elevationFt))) {
      return `${Number(meta.elevationFt).toLocaleString()} ft`;
    }
    if (meta?.elevationM != null && Number.isFinite(Number(meta.elevationM))) {
      return `${Math.round(Number(meta.elevationM) * 3.28084).toLocaleString()} ft`;
    }
    return "—";
  }

  function getMountainRegion(meta) {
    if (meta?.region) {
      return meta.region;
    }
    return formatCountryValue(meta?.country);
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

  function filterWords(words, query) {
    if (!query) {
      return words;
    }
    const compactQuery = GlobbleDictionaryKeys.compactWord(query);
    return words.filter((word) => {
      const compact = GlobbleDictionaryKeys.compactWord(word);
      return compact.includes(compactQuery) || word.includes(query);
    });
  }

  const WATER_BODY_KINDS = new Set(["ocean", "sea", "bay", "gulf", "bight"]);

  function formatPlainValleyKind(kind) {
    if (kind === "plain") {
      return "Plain";
    }
    if (kind === "valley") {
      return "Valley";
    }
    return "—";
  }

  function formatIslandContinentKind(kind) {
    if (kind === "island") {
      return "Island";
    }
    if (kind === "continent") {
      return "Continent";
    }
    return "—";
  }

  function formatAreaSqMi(meta) {
    if (!meta) {
      return "—";
    }
    if (meta.areaSqMi != null && Number.isFinite(Number(meta.areaSqMi))) {
      return `${Number(meta.areaSqMi).toLocaleString()} sq mi`;
    }
    if (meta.areaKm2 != null && Number.isFinite(Number(meta.areaKm2))) {
      const sqMi = Math.round((Number(meta.areaKm2) / 2.58999) * 10) / 10;
      return `${sqMi.toLocaleString()} sq mi`;
    }
    return "—";
  }

  function getLandformRegion(meta) {
    if (!meta) {
      return "—";
    }
    if (meta.region && meta.region !== "—") {
      return meta.region;
    }
    return formatCountryValue(meta.country);
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

  function formatLengthKm(value) {
    if (value == null || value === 0) {
      return "—";
    }
    const length = Number(value);
    if (!Number.isFinite(length) || length <= 0) {
      return "—";
    }
    return `${length.toLocaleString()} km`;
  }

  function getWaterBodyRegion(meta) {
    if (!meta) {
      return "—";
    }
    if (WATER_BODY_KINDS.has(meta.kind) && meta.region) {
      return meta.region;
    }
    if (meta.waterBody?.region) {
      return meta.waterBody.region;
    }
    return "—";
  }

  function getWaterBodyAreaKm2(meta) {
    if (!meta) {
      return null;
    }
    if (WATER_BODY_KINDS.has(meta.kind) && meta.areaKm2 != null) {
      return meta.areaKm2;
    }
    if (meta.waterBody?.areaKm2 != null) {
      return meta.waterBody.areaKm2;
    }
    return null;
  }

  function getRiverLengthKm(meta) {
    if (!meta) {
      return null;
    }
    if (meta.kind === "river" && meta.lengthKm != null) {
      return meta.lengthKm;
    }
    if (meta.river?.lengthKm != null) {
      return meta.river.lengthKm;
    }
    return null;
  }

  function getRiverRegion(meta) {
    if (!meta) {
      return "—";
    }
    if (meta.kind === "river" && meta.region) {
      return meta.region;
    }
    if (meta.river?.region) {
      return meta.river.region;
    }
    return "—";
  }

  function getDivisionPopulation(meta) {
    if (!meta) {
      return null;
    }
    if (meta.kind === "state" || meta.kind === "county" || meta.kind === "shire") {
      return meta.population;
    }
    if (meta.usState?.population != null) {
      return meta.usState.population;
    }
    return null;
  }

  function getDivisionRegion(meta) {
    if (!meta?.region) {
      return "—";
    }
    return meta.region;
  }

  function getUsCityState(meta) {
    if (!meta) {
      return "—";
    }
    if (meta.state) {
      return meta.state;
    }
    if (meta.subcountry) {
      return meta.subcountry;
    }
    return "—";
  }

  function getAbbreviationFor(meta) {
    if (!meta) {
      return "—";
    }
    if (meta.abbreviationFor) {
      return meta.abbreviationFor;
    }
    if (meta.countryAlias && meta.country) {
      return meta.country;
    }
    return "—";
  }

  function usesHistoricalFourColumnLayout(categoryId) {
    return (
      categoryId === "historicalCities" ||
      categoryId === "historicalRegions" ||
      categoryId === "historicalKingdomsEmpires"
    );
  }

  function getHistoricalPlaceColumnLabel(categoryId) {
    return categoryId === "historicalCities" ? "Country" : "Region";
  }

  function getHistoricalPlaceColumnValue(categoryId, meta) {
    if (!meta) {
      return "—";
    }
    if (categoryId === "historicalCities") {
      return meta.country || "—";
    }
    return meta.region && meta.region !== "—" ? meta.region : "—";
  }

  function buildWordRow(word, categoryId) {
    const meta = placeMetadata[word];
    const isCountryEntry = meta?.kind === "country";
    const tr = document.createElement("tr");

    if (categoryId === "countries" || categoryId === "territories") {
      const tdCountry = document.createElement("td");
      tdCountry.textContent = word;
      const tdPop = document.createElement("td");
      tdPop.className = "dictionary-population";
      tdPop.textContent = formatPopulationValue(meta?.population);
      tr.appendChild(tdCountry);
      tr.appendChild(tdPop);
      return tr;
    }

    if (categoryId === "abbreviations") {
      const tdCode = document.createElement("td");
      tdCode.textContent = word;
      const tdName = document.createElement("td");
      tdName.className = "dictionary-place-detail";
      tdName.textContent = getAbbreviationFor(meta);
      tr.appendChild(tdCode);
      tr.appendChild(tdName);
      return tr;
    }

    if (categoryId === "usaCities" || categoryId === "worldCities") {
      const tdCity = document.createElement("td");
      tdCity.className = "dictionary-place-name";
      tdCity.textContent = word;
      const tdDetail = document.createElement("td");
      tdDetail.className = "dictionary-place-detail";
      tdDetail.textContent =
        categoryId === "usaCities" ? getUsCityState(meta) : formatCountryValue(meta && meta.country);
      const tdPop = document.createElement("td");
      tdPop.className = "dictionary-population";
      tdPop.textContent = formatPopulationValue(meta?.population);
      tr.appendChild(tdCity);
      tr.appendChild(tdDetail);
      tr.appendChild(tdPop);
      return tr;
    }

    if (categoryId === "usaStates") {
      const tdState = document.createElement("td");
      tdState.textContent = word;
      const tdPop = document.createElement("td");
      tdPop.className = "dictionary-population";
      tdPop.textContent = formatPopulationValue(getDivisionPopulation(meta));
      tr.appendChild(tdState);
      tr.appendChild(tdPop);
      return tr;
    }

    if (categoryId === "ukCounties") {
      const tdName = document.createElement("td");
      tdName.textContent = word;
      const tdRegion = document.createElement("td");
      tdRegion.textContent = getDivisionRegion(meta);
      const tdPop = document.createElement("td");
      tdPop.className = "dictionary-population";
      tdPop.textContent = formatPopulationValue(getDivisionPopulation(meta));
      tr.appendChild(tdName);
      tr.appendChild(tdRegion);
      tr.appendChild(tdPop);
      return tr;
    }

    if (categoryId === "rivers") {
      const tdRiver = document.createElement("td");
      tdRiver.textContent = word;
      const tdRegion = document.createElement("td");
      tdRegion.textContent = getRiverRegion(meta);
      const tdLength = document.createElement("td");
      tdLength.className = "dictionary-population";
      tdLength.textContent = formatLengthKm(getRiverLengthKm(meta));
      tr.appendChild(tdRiver);
      tr.appendChild(tdRegion);
      tr.appendChild(tdLength);
      return tr;
    }

    if (categoryId === "mountainRanges") {
      const tdName = document.createElement("td");
      tdName.textContent = word;
      const tdRegion = document.createElement("td");
      tdRegion.textContent = getMountainRegion(meta);
      const tdElevation = document.createElement("td");
      tdElevation.className = "dictionary-population";
      tdElevation.textContent = formatElevationFeet(meta);
      tr.appendChild(tdName);
      tr.appendChild(tdRegion);
      tr.appendChild(tdElevation);
      return tr;
    }

    if (categoryId === "landforms") {
      const tdName = document.createElement("td");
      tdName.className = "dictionary-place-name";
      tdName.textContent = word;
      const tdType = document.createElement("td");
      tdType.textContent = formatPlainValleyKind(meta?.kind);
      const tdRegion = document.createElement("td");
      tdRegion.className = "dictionary-place-detail";
      tdRegion.textContent = getLandformRegion(meta);
      tr.appendChild(tdName);
      tr.appendChild(tdType);
      tr.appendChild(tdRegion);
      return tr;
    }

    if (categoryId === "islandsContinents") {
      const tdName = document.createElement("td");
      tdName.className = "dictionary-place-name";
      tdName.textContent = word;
      const tdType = document.createElement("td");
      tdType.textContent = formatIslandContinentKind(meta?.kind);
      const tdRegion = document.createElement("td");
      tdRegion.className = "dictionary-place-detail";
      tdRegion.textContent = getLandformRegion(meta);
      const tdArea = document.createElement("td");
      tdArea.className = "dictionary-population";
      tdArea.textContent = formatAreaSqMi(meta);
      tr.appendChild(tdName);
      tr.appendChild(tdType);
      tr.appendChild(tdRegion);
      tr.appendChild(tdArea);
      return tr;
    }

    if (categoryId === "oceansSeas" || categoryId === "baysGulfsBights") {
      const tdName = document.createElement("td");
      tdName.textContent = word;
      const tdRegion = document.createElement("td");
      tdRegion.textContent = getWaterBodyRegion(meta);
      const tdArea = document.createElement("td");
      tdArea.className = "dictionary-population";
      tdArea.textContent = formatAreaKm2(getWaterBodyAreaKm2(meta));
      tr.appendChild(tdName);
      tr.appendChild(tdRegion);
      tr.appendChild(tdArea);
      return tr;
    }

    if (
      categoryId === "historicalCountries" ||
      categoryId === "historicalRegions" ||
      categoryId === "historicalCities" ||
      categoryId === "historicalKingdomsEmpires"
    ) {
      const tdName = document.createElement("td");
      tdName.textContent = word;
      const tdModern = document.createElement("td");
      tdModern.className = "dictionary-place-detail";
      tdModern.textContent = meta?.modernName || "—";
      tr.appendChild(tdName);
      tr.appendChild(tdModern);
      if (usesHistoricalFourColumnLayout(categoryId)) {
        const tdPlace = document.createElement("td");
        tdPlace.className = "dictionary-historical-detail";
        tdPlace.textContent = getHistoricalPlaceColumnValue(categoryId, meta);
        const tdEra = document.createElement("td");
        tdEra.className = "dictionary-historical-detail";
        tdEra.textContent = meta?.era || "—";
        tr.appendChild(tdPlace);
        tr.appendChild(tdEra);
      } else {
        const tdEra = document.createElement("td");
        tdEra.className = "dictionary-historical-detail";
        tdEra.textContent = meta?.era || "—";
        tr.appendChild(tdEra);
      }
      return tr;
    }

    const tdWord = document.createElement("td");
    tdWord.textContent = word;
    const tdCountry = document.createElement("td");
    tdCountry.textContent =
      isCountryEntry ||
      meta?.kind === "state" ||
      meta?.kind === "county" ||
      meta?.kind === "shire" ||
      meta?.kind === "river" ||
      WATER_BODY_KINDS.has(meta?.kind)
        ? "—"
        : formatCountryValue(meta && meta.country);
    const tdPop = document.createElement("td");
    tdPop.className = "dictionary-population";
    tdPop.textContent = meta ? formatPopulationValue(meta.population) : "—";
    tr.appendChild(tdWord);
    tr.appendChild(tdCountry);
    tr.appendChild(tdPop);
    return tr;
  }

  function getTableHeaderHtml(categoryId) {
    if (categoryId === "countries") {
      return "<tr><th scope=\"col\">Country</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
    }
    if (categoryId === "territories") {
      return "<tr><th scope=\"col\">Territory</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
    }
    if (categoryId === "abbreviations") {
      return "<tr><th scope=\"col\">Abbreviation</th><th scope=\"col\" class=\"dictionary-place-detail\">Name</th></tr>";
    }
    if (categoryId === "usaCities") {
      return "<tr><th scope=\"col\" class=\"dictionary-place-name\">City</th><th scope=\"col\" class=\"dictionary-place-detail\">State</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
    }
    if (categoryId === "worldCities") {
      return "<tr><th scope=\"col\" class=\"dictionary-place-name\">City</th><th scope=\"col\" class=\"dictionary-place-detail\">Country</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
    }
    if (categoryId === "usaStates") {
      return "<tr><th scope=\"col\">State</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
    }
    if (categoryId === "ukCounties") {
      return "<tr><th scope=\"col\">County / shire</th><th scope=\"col\">Region</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
    }
    if (categoryId === "rivers") {
      return "<tr><th scope=\"col\">River</th><th scope=\"col\">Region</th><th scope=\"col\" class=\"dictionary-population\">Length</th></tr>";
    }
    if (categoryId === "mountainRanges") {
      return "<tr><th scope=\"col\">Mountain / hill</th><th scope=\"col\">Region</th><th scope=\"col\" class=\"dictionary-population\">Elevation</th></tr>";
    }
    if (categoryId === "landforms") {
      return "<tr><th scope=\"col\" class=\"dictionary-place-name\">Place</th><th scope=\"col\">Type</th><th scope=\"col\" class=\"dictionary-place-detail\">Region</th></tr>";
    }
    if (categoryId === "islandsContinents") {
      return "<tr><th scope=\"col\" class=\"dictionary-place-name\">Place</th><th scope=\"col\">Type</th><th scope=\"col\" class=\"dictionary-place-detail\">Region</th><th scope=\"col\" class=\"dictionary-population\">Area (sq mi)</th></tr>";
    }
    if (categoryId === "oceansSeas") {
      return "<tr><th scope=\"col\">Ocean / sea</th><th scope=\"col\">Region</th><th scope=\"col\" class=\"dictionary-population\">Area</th></tr>";
    }
    if (categoryId === "baysGulfsBights") {
      return "<tr><th scope=\"col\">Bay / gulf / bight</th><th scope=\"col\">Region</th><th scope=\"col\" class=\"dictionary-population\">Area</th></tr>";
    }
    if (
      categoryId === "historicalCountries" ||
      categoryId === "historicalRegions" ||
      categoryId === "historicalCities" ||
      categoryId === "historicalKingdomsEmpires"
    ) {
      const label =
        categoryId === "historicalCountries"
          ? "Country"
          : categoryId === "historicalRegions"
            ? "Region"
            : categoryId === "historicalKingdomsEmpires"
              ? "Kingdom / empire"
              : "City";
      if (usesHistoricalFourColumnLayout(categoryId)) {
        const placeLabel = getHistoricalPlaceColumnLabel(categoryId);
        return `<tr><th scope="col">${label}</th><th scope="col" class="dictionary-place-detail">Today</th><th scope="col" class="dictionary-historical-detail">${placeLabel}</th><th scope="col" class="dictionary-historical-detail">Era</th></tr>`;
      }
      return `<tr><th scope="col">${label}</th><th scope="col" class="dictionary-place-detail">Today</th><th scope="col" class="dictionary-historical-detail">Era</th></tr>`;
    }
    return "<tr><th scope=\"col\">Word</th><th scope=\"col\">Country</th><th scope=\"col\" class=\"dictionary-population\">Population</th></tr>";
  }

  function renderCategoryTable(categoryEl, words, query, rawQuery) {
    const body = categoryEl.querySelector(".dictionary-category-body");
    if (!body) {
      return;
    }

    let lines = filterWords(words, query);
    const total = lines.length;
    let truncated = false;
    if (lines.length > DICTIONARY_LIST_PREVIEW_LIMIT) {
      lines = lines.slice(0, DICTIONARY_LIST_PREVIEW_LIMIT);
      truncated = true;
    }

    body.replaceChildren();
    const categoryId = categoryEl.dataset.categoryId || "";
    const table = document.createElement("table");
    table.className = "dictionary-table";
    if (categoryId === "countries" || categoryId === "territories" || categoryId === "usaStates") {
      table.classList.add(
        categoryId === "usaStates"
          ? "dictionary-table-us-states"
          : "dictionary-table-countries"
      );
    } else if (categoryId === "abbreviations") {
      table.classList.add("dictionary-table-abbreviations");
    } else if (categoryId === "usaCities" || categoryId === "worldCities") {
      table.classList.add("dictionary-table-place-cities");
    } else if (categoryId === "ukCounties") {
      table.classList.add("dictionary-table-rivers");
    } else if (categoryId === "rivers") {
      table.classList.add("dictionary-table-rivers");
    } else if (categoryId === "mountainRanges") {
      table.classList.add("dictionary-table-rivers");
    } else if (categoryId === "landforms") {
      table.classList.add("dictionary-table-landforms");
    } else if (categoryId === "islandsContinents") {
      table.classList.add("dictionary-table-islands-continents");
    } else if (categoryId === "oceansSeas" || categoryId === "baysGulfsBights") {
      table.classList.add("dictionary-table-water-bodies");
    } else if (
      categoryId === "historicalCountries" ||
      categoryId === "historicalRegions" ||
      categoryId === "historicalCities" ||
      categoryId === "historicalKingdomsEmpires"
    ) {
      table.classList.add("dictionary-table-historical");
      if (usesHistoricalFourColumnLayout(categoryId)) {
        table.classList.add("dictionary-table-historical-four");
      }
    }
    table.setAttribute("aria-label", `${categoryEl.querySelector("summary")?.textContent || "Words"}`);
    const thead = document.createElement("thead");
    thead.innerHTML = getTableHeaderHtml(categoryId);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    const frag = document.createDocumentFragment();
    lines.forEach((word) => frag.appendChild(buildWordRow(word, categoryId)));
    tbody.appendChild(frag);
    table.appendChild(tbody);
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "dictionary-table-scroll";
    scrollWrap.appendChild(table);
    body.appendChild(scrollWrap);

    if (truncated) {
      const note = document.createElement("p");
      note.className = "dictionary-category-note";
      note.textContent = query
        ? `Showing first ${DICTIONARY_LIST_PREVIEW_LIMIT} of ${total} matches. Narrow the filter to browse more.`
        : `Showing first ${DICTIONARY_LIST_PREVIEW_LIMIT} of ${words.length} words in this folder. Type in the filter to narrow.`;
      body.appendChild(note);
    } else if (query && total === 0) {
      const note = document.createElement("p");
      note.className = "dictionary-category-note";
      note.textContent = `No matches for “${rawQuery}” in this folder.`;
      body.appendChild(note);
    }

    categoryEl.dataset.rendered = "1";
  }

  function createCategorySection(category, words, query, rawQuery) {
    const filtered = filterWords(words, query);
    if (!filtered.length && query) {
      return null;
    }

    const details = document.createElement("details");
    details.className = "dictionary-category";
    details.dataset.categoryId = category.id;

    const summary = document.createElement("summary");
    summary.className = "dictionary-category-summary";
    const label = document.createElement("span");
    label.className = "dictionary-category-label";
    label.textContent = category.label;
    if (category.criteria) {
      const criteria = document.createElement("span");
      criteria.className = "dictionary-category-criteria";
      criteria.textContent = ` (${category.criteria})`;
      label.appendChild(criteria);
    }
    const count = document.createElement("span");
    count.className = "dictionary-category-count";
    count.textContent = formatCount(filtered.length);
    summary.appendChild(label);
    summary.appendChild(count);

    const body = document.createElement("div");
    body.className = "dictionary-category-body";

    details.appendChild(summary);
    details.appendChild(body);

    details.addEventListener("toggle", () => {
      if (details.open && !details.dataset.rendered) {
        renderCategoryTable(details, words, query, rawQuery);
      }
    });

    return details;
  }

  function updateDictionaryHint(words) {
    if (!dictionaryHintEl) {
      return;
    }
    const total = formatCount(words.length);
    dictionaryHintEl.textContent = `${total} legal words — modern places plus historical countries, regions, cities, and kingdoms/empires in folders at the bottom.`;
  }

  function refreshDictionaryPanel() {
    const words = getSortedDictionaryWords();
    const rawQuery = dictionaryFilterInput.value.trim();
    const query = rawQuery.toUpperCase();
    const categories = wordCategories || {};

    dictionaryCategoriesEl.replaceChildren();
    let visibleTotal = 0;
    let categoryCount = 0;

    if (query) {
      const allMatches = filterWords(words, query);
      if (allMatches.length) {
        const searchSection = createCategorySection(
          { id: "search", label: "Search results" },
          allMatches,
          query,
          rawQuery
        );
        if (searchSection) {
          dictionaryCategoriesEl.appendChild(searchSection);
          visibleTotal = allMatches.length;
          categoryCount = 1;
        }
      }
    }

    getCategories().forEach((category) => {
      const categoryWords = categories[category.id] || [];
      if (!categoryWords.length) {
        return;
      }
      const section = createCategorySection(category, categoryWords, query, rawQuery);
      if (!section) {
        return;
      }
      dictionaryCategoriesEl.appendChild(section);
      if (!query) {
        visibleTotal += filterWords(categoryWords, query).length;
      }
      categoryCount += 1;
    });

    if (dictionaryMetaEl) {
      if (!wordCategories) {
        dictionaryMetaEl.textContent = "Loading dictionary folders…";
      } else if (query) {
        const folderMatches = getCategories().reduce(
          (sum, category) => sum + filterWords(categories[category.id] || [], query).length,
          0
        );
        dictionaryMetaEl.textContent = `${formatCount(visibleTotal)} match${visibleTotal === 1 ? "" : "es"} for “${rawQuery}” (${formatCount(folderMatches)} in folders).`;
      } else {
        dictionaryMetaEl.textContent = buildDictionaryMetaText(words, categoryCount);
      }
    }

    updateDictionaryHint(words);
  }

  function openDictionaryPanel() {
    invalidateDictionaryWordCache();
    if (!dictionaryDialog.open) {
      dictionaryDialog.showModal();
    }
    dictionaryFilterInput.value = "";
    ensurePlaceMetadataLoaded();
    refreshDictionaryPanel();
    dictionaryFilterInput.focus();
  }

  function closeDictionaryPanel() {
    dictionaryDialog.close();
    if (document.body.classList.contains("dictionary-page")) {
      document.body.classList.remove("dictionary-page");
      const url = new URL(window.location.href);
      url.searchParams.delete("dictionary");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }

  function resolveDictionaryReturnUrl() {
    const returnParam = new URLSearchParams(window.location.search).get("return");
    if (!returnParam) {
      return null;
    }
    try {
      const resolved = new URL(returnParam, window.location.href);
      if (resolved.origin !== window.location.origin) {
        return null;
      }
      return resolved.pathname + resolved.search + resolved.hash;
    } catch {
      return null;
    }
  }

  function returnFromDictionary() {
    const returnUrl = resolveDictionaryReturnUrl();
    closeDictionaryPanel();
    if (returnUrl) {
      window.location.href = returnUrl;
      return;
    }
    window.location.href = "./splash.html";
  }

  if (openDictionaryBtn) {
    openDictionaryBtn.addEventListener("click", openDictionaryPanel);
  }
  if (dictionaryReturnBtn) {
    dictionaryReturnBtn.addEventListener("click", returnFromDictionary);
  }
  if (closeDictionaryBtn) {
    closeDictionaryBtn.addEventListener("click", closeDictionaryPanel);
  }
  dictionaryDialog.addEventListener("click", (event) => {
    if (event.target === dictionaryDialog) {
      closeDictionaryPanel();
    }
  });
  dictionaryFilterInput.addEventListener("input", () => {
    if (dictionaryFilterTimer) {
      clearTimeout(dictionaryFilterTimer);
    }
    dictionaryFilterTimer = setTimeout(() => {
      dictionaryFilterTimer = null;
      refreshDictionaryPanel();
    }, 100);
  });

  const metaFile = window.GLOBBLE_PLACE_METADATA_FILE || "place-metadata.json";
  const categoriesFile =
    window.GLOBBLE_DICTIONARY_CATEGORIES_FILE || "dictionary-categories.json";
  const placeMetaUrl = new URL(metaFile, window.location.href).href;
  const categoriesUrl = new URL(categoriesFile, window.location.href).href;

  let placeMetadataLoadPromise = null;

  function ensurePlaceMetadataLoaded() {
    if (placeMetadataLoadPromise) {
      return placeMetadataLoadPromise;
    }
    placeMetadataLoadPromise = fetch(placeMetaUrl)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        placeMetadata = data && typeof data === "object" ? data : {};
        refreshDictionaryPanel();
      })
      .catch(() => {
        placeMetadata = {};
        refreshDictionaryPanel();
      });
    return placeMetadataLoadPromise;
  }

  // Categories are small; load once. Place metadata waits until the dictionary opens.
  fetch(categoriesUrl)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      wordCategories = data && typeof data === "object" ? data : null;
      refreshDictionaryPanel();
    })
    .catch(() => {
      wordCategories = null;
      if (dictionaryMetaEl) {
        dictionaryMetaEl.textContent = "Could not load dictionary folders. Refresh the page and try again.";
      }
      refreshDictionaryPanel();
    });

  if (window.location.search.includes("dictionary=1") || window.location.hash === "#dictionary") {
    document.body.classList.add("dictionary-page");
    openDictionaryPanel();
  }
})();
