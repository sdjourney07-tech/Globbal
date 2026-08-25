/**
 * Adds wikipediaCandidates (and wikipediaUrl when unambiguous) to place-metadata.json.
 * Cities use GeoNames disambiguation; rivers, oceans, countries, etc. use category-specific titles.
 *
 * Run: node scripts/augment-wikipedia-links.cjs
 */
const fs = require("fs");
const path = require("path");
const { compactWord, displayWord } = require(path.join(__dirname, "..", "dictionary-keys.js"));
const { normalizeCountry } = require("./city-country-resolver.cjs");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const DATA_DIR = path.join(ROOT, "data");
const STATES_PATH = path.join(DATA_DIR, "us-states.json");
const RIVERS_PATH = path.join(DATA_DIR, "world-rivers.json");
const WATER_PATH = path.join(DATA_DIR, "world-water-bodies.json");
const CACHE = path.join(ROOT, "geonames-cache");
const GEONAMES_CITY_TIERS = ["cities15000", "cities5000", "cities1000", "cities500"];
const MAX_CANDIDATES = 12;
const US_COUNTRY_NAMES = new Set(["United States", "United States of America"]);

const PLACE_KINDS = new Set([
  "country",
  "state",
  "county",
  "shire",
  "river",
  "ocean",
  "sea",
  "bay",
  "gulf",
  "bight"
]);

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function wikiSlug(title) {
  return encodeURI(String(title || "").trim().replace(/ /g, "_"));
}

function wikipediaUrlForTitle(title) {
  if (!title) {
    return null;
  }
  return `https://en.wikipedia.org/wiki/${wikiSlug(title)}`;
}

function getPlaceKind(meta) {
  if (!meta) {
    return null;
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

function isTypedPlace(meta) {
  const kind = getPlaceKind(meta);
  return kind && PLACE_KINDS.has(kind);
}

function loadCountryNames() {
  const map = {};
  const countryPath = path.join(CACHE, "countryInfo.txt");
  if (!fs.existsSync(countryPath)) {
    return map;
  }
  fs.readFileSync(countryPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) {
        return;
      }
      const cols = line.split("\t");
      if (cols[0] && cols[4]) {
        map[cols[0]] = normalizeCountry(cols[4]);
      }
    });
  return map;
}

function loadStateByCode() {
  const states = JSON.parse(fs.readFileSync(STATES_PATH, "utf8"));
  return Object.fromEntries(states.map((state) => [state.code, state.name]));
}

function uniqueTitles(titles) {
  const seen = new Set();
  return titles.filter((title) => {
    const key = title.toLowerCase();
    if (!title || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function riverWikiTitles(canonicalName) {
  const titles = [canonicalName];
  if (/ river$/i.test(canonicalName)) {
    const stem = canonicalName.replace(/ river$/i, "").trim();
    if (stem) {
      titles.unshift(stem);
    }
  }
  return uniqueTitles(titles);
}

function loadCanonicalPlaceIndex() {
  /** @type {Map<string, { kind: string, titles: string[] }>} */
  const index = new Map();

  const add = (dictionaryWord, kind, titles) => {
    const key = compactWord(dictionaryWord);
    if (!key) {
      return;
    }
    index.set(key, { kind, titles: uniqueTitles(titles) });
  };

  if (fs.existsSync(RIVERS_PATH)) {
    JSON.parse(fs.readFileSync(RIVERS_PATH, "utf8")).forEach((river) => {
      const dictWord = displayWord(river.name).toUpperCase();
      add(dictWord, "river", riverWikiTitles(river.name));
    });
  }

  if (fs.existsSync(WATER_PATH)) {
    JSON.parse(fs.readFileSync(WATER_PATH, "utf8")).forEach((body) => {
      const dictWord = displayWord(body.name).toUpperCase();
      add(dictWord, body.type, [body.name]);
    });
  }

  if (fs.existsSync(STATES_PATH)) {
    JSON.parse(fs.readFileSync(STATES_PATH, "utf8")).forEach((state) => {
      add(state.name.toUpperCase(), "state", [state.name]);
    });
  }

  return index;
}

function buildPlaceLabel(name, country, state) {
  if (state && US_COUNTRY_NAMES.has(country)) {
    return `${name}, ${state}`;
  }
  if (country) {
    return `${name}, ${country}`;
  }
  return name;
}

function countriesMatch(a, b) {
  return normalizeCountry(a).toLowerCase() === normalizeCountry(b).toLowerCase();
}

function buildCandidateIndex(countryNames, stateByCode) {
  /** @type {Map<string, Map<string, object>>} */
  const byKey = new Map();

  const upsert = (key, record) => {
    if (!key || key.length < 2) {
      return;
    }
    if (!byKey.has(key)) {
      byKey.set(key, new Map());
    }
    const bucket = byKey.get(key);
    const prev = bucket.get(record.geonameId);
    if (!prev || record.population > prev.population) {
      bucket.set(record.geonameId, record);
    }
  };

  GEONAMES_CITY_TIERS.forEach((tier) => {
    const txtPath = path.join(CACHE, `${tier}.txt`);
    if (!fs.existsSync(txtPath)) {
      return;
    }
    fs.readFileSync(txtPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        if (!line) {
          return;
        }
        const cols = line.split("\t");
        const feature = cols[7] || "";
        if (!feature.startsWith("PPL")) {
          return;
        }
        const countryCode = cols[8];
        const country = normalizeCountry(countryNames[countryCode] || countryCode);
        const stateName = countryCode === "US" ? stateByCode[cols[10]] || null : null;
        const population = Number.parseInt(cols[14], 10) || 0;
        const name = cols[1];
        const record = {
          geonameId: cols[0],
          name,
          country,
          state: stateName,
          population,
          kind: "city",
          label: buildPlaceLabel(name, country, stateName),
          wikiTitle: buildPlaceLabel(name, country, stateName)
        };
        upsert(asciiKey(cols[1]), record);
        upsert(asciiKey(cols[2]), record);
      });
  });

  return byKey;
}

function titlesToCandidates(titles, kind, extra = {}) {
  return titles
    .map((title) => ({
      label: title,
      url: wikipediaUrlForTitle(title),
      kind,
      ...extra
    }))
    .filter((c) => c.url);
}

function typedPlaceCandidates(word, meta, canonicalIndex) {
  const key = compactWord(word);
  const canon = canonicalIndex.get(key);
  if (canon) {
    return titlesToCandidates(canon.titles, canon.kind);
  }

  const kind = getPlaceKind(meta);
  if (!kind || kind === "city") {
    return [];
  }

  if (kind === "country") {
    const title = formatCountryTitle(meta.country || word);
    return titlesToCandidates([title], "country", {
      country: meta.country || null,
      population: meta.population ?? null
    });
  }

  if (kind === "state") {
    return titlesToCandidates([word], "state", {
      country: meta.country || "United States",
      population: meta.population ?? null
    });
  }

  if (kind === "river") {
    const canonical = meta.river?.name || word;
    return titlesToCandidates(riverWikiTitles(canonical), "river");
  }

  if (["ocean", "sea", "bay", "gulf", "bight"].includes(kind)) {
    const canonical = meta.waterBody?.name || word;
    return titlesToCandidates([canonical], kind);
  }

  if (kind === "county" || kind === "shire") {
    return titlesToCandidates([word], kind);
  }

  return [];
}

function formatCountryTitle(value) {
  if (!value) {
    return "";
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

function cityCandidates(word, meta, candidateIndex) {
  const key = compactWord(word);
  const bucket = candidateIndex.get(key) || candidateIndex.get(asciiKey(word));
  if (!bucket || bucket.size === 0) {
    return [];
  }

  let pool = [...bucket.values()].sort((a, b) => b.population - a.population);
  if (meta?.country) {
    const inCountry = pool.filter((c) => countriesMatch(c.country, meta.country));
    if (inCountry.length) {
      pool = inCountry;
    }
  }
  if (meta?.state) {
    pool.sort((a, b) => {
      const aMatch = a.state === meta.state ? 1 : 0;
      const bMatch = b.state === meta.state ? 1 : 0;
      if (bMatch !== aMatch) {
        return bMatch - aMatch;
      }
      return b.population - a.population;
    });
  }

  return pool.slice(0, MAX_CANDIDATES).map((record) => ({
    label: record.label,
    url: wikipediaUrlForTitle(record.wikiTitle),
    kind: "city",
    country: record.country,
    state: record.state || null,
    population: record.population || null
  }));
}

function resolveCandidates(word, meta, candidateIndex, canonicalIndex) {
  if (isTypedPlace(meta)) {
    const typed = typedPlaceCandidates(word, meta, canonicalIndex);
    if (typed.length) {
      return typed;
    }
  }

  if (meta?.country && US_COUNTRY_NAMES.has(meta.country)) {
    const city = cityCandidates(word, meta, candidateIndex);
    if (city.length) {
      return city;
    }
  }

  if (!isTypedPlace(meta)) {
    const city = cityCandidates(word, meta, candidateIndex);
    if (city.length) {
      return city;
    }
  }

  return [];
}

function parseLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function main() {
  const countryNames = loadCountryNames();
  const stateByCode = loadStateByCode();
  const candidateIndex = buildCandidateIndex(countryNames, stateByCode);
  const canonicalIndex = loadCanonicalPlaceIndex();
  const metadata = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const words = parseLockedWords();

  let withLinks = 0;
  let multi = 0;
  let missing = 0;

  words.forEach((word) => {
    const meta = metadata[word];
    if (!meta) {
      return;
    }
    const candidates = resolveCandidates(word, meta, candidateIndex, canonicalIndex).filter((c) => c.url);
    if (!candidates.length) {
      delete meta.wikipediaCandidates;
      delete meta.wikipediaUrl;
      missing += 1;
      return;
    }
    meta.wikipediaCandidates = candidates;
    meta.wikipediaUrl = candidates.length === 1 ? candidates[0].url : null;
    withLinks += 1;
    if (candidates.length > 1) {
      multi += 1;
    }
  });

  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata)}\n`, "utf8");
  process.stdout.write(
    `Wikipedia links: ${withLinks} words (${multi} ambiguous), ${missing} without links.\n`
  );
}

main();
