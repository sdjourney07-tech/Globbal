/**
 * Syncs city entries in LOCKED_WORDS to places with population >= MIN_POP.
 * Countries, US states, rivers, and other exempt entries are kept.
 * Ingests qualifying cities from GeoNames dumps before pruning.
 *
 * Run: node scripts/filter-world-cities-min-pop.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const CACHE = path.join(ROOT, "geonames-cache");
const { compactWord, displayWord, isPlayableDictionaryWord } = require(path.join(ROOT, "dictionary-keys.js"));
const { normalizeCountry } = require("./city-country-resolver.cjs");

const MIN_POP = 10000;
const GEONAMES_CITY_TIERS = ["cities15000", "cities5000", "cities1000"];

const COUNTRY_INFO_PATH = path.join(CACHE, "countryInfo.txt");
const US_STATES_PATH = path.join(ROOT, "data", "us-states.json");

const MOUNTAIN_RANGE_KEYS = new Set(
  [
    "ALPS",
    "ANDES",
    "APENNINES",
    "APPALACHIANS",
    "APPALACHIAN",
    "ATLAS",
    "BLUERIDGE",
    "CAUCASUS",
    "CASCADES",
    "CASCADE",
    "DENALI",
    "EVEREST",
    "HIMALAYAS",
    "HIMALAYA",
    "KARAKORAM",
    "KILIMANJARO",
    "OLYMPUS",
    "PYRENEES",
    "ROCKIES",
    "ROCKYMOUNTAINS",
    "SIERRANEVADA",
    "SIERRAMADRE",
    "URALS",
    "URAL",
    "FUJI",
    "MONTBLANC",
    "MATTERHORN",
    "ELBRUS",
    "EVEREST"
  ].map((k) => k.toUpperCase())
);

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function loadStateByCode() {
  if (!fs.existsSync(US_STATES_PATH)) {
    return {};
  }
  const states = JSON.parse(fs.readFileSync(US_STATES_PATH, "utf8"));
  return Object.fromEntries(states.map((state) => [state.code, state.name]));
}

function loadCountryNames() {
  const map = {};
  if (!fs.existsSync(COUNTRY_INFO_PATH)) {
    return map;
  }
  fs.readFileSync(COUNTRY_INFO_PATH, "utf8")
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

function loadCountryKeys(countryTxt) {
  const keys = new Set();
  countryTxt.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith("#")) {
      return;
    }
    const cols = line.split("\t");
    const name = cols[4];
    if (name) {
      keys.add(asciiKey(name));
    }
    const iso3 = cols[1];
    if (iso3 && iso3.length === 3) {
      keys.add(asciiKey(iso3));
    }
  });
  return keys;
}

const countryKeys = fs.existsSync(COUNTRY_INFO_PATH)
  ? loadCountryKeys(fs.readFileSync(COUNTRY_INFO_PATH, "utf8"))
  : new Set();

function isExemptWord(word) {
  const key = compactWord(word);
  return countryKeys.has(key) || MOUNTAIN_RANGE_KEYS.has(key);
}

function parsePopulation(value) {
  if (value == null || value === "") {
    return null;
  }
  const normalized =
    typeof value === "string"
      ? value.replace(/,/g, "").replace(/\s+/g, "").trim()
      : value;
  const population = Number(normalized);
  if (!Number.isFinite(population) || population <= 0) {
    return null;
  }
  return population;
}

function isSpecialPlaceKind(entry) {
  return (
    entry?.kind === "country" ||
    entry?.kind === "state" ||
    entry?.kind === "county" ||
    entry?.kind === "shire" ||
    entry?.kind === "river" ||
    entry?.kind === "mountain" ||
    entry?.kind === "mountainRange" ||
    entry?.kind === "hill" ||
    entry?.kind === "plain" ||
    entry?.kind === "valley" ||
    entry?.kind === "island" ||
    entry?.kind === "continent" ||
    ["ocean", "sea", "bay", "gulf", "bight"].includes(entry?.kind)
  );
}

function shouldKeepWord(word, meta) {
  if (isExemptWord(word)) {
    return true;
  }
  const entry = meta[word];
  if (isSpecialPlaceKind(entry)) {
    return true;
  }
  if (!entry || !entry.country) {
    return false;
  }

  const population = parsePopulation(entry.population);
  if (population == null) {
    return false;
  }
  return population >= MIN_POP;
}

function ingestGeonameCities(words, meta) {
  const countryNames = loadCountryNames();
  const stateByCode = loadStateByCode();
  const wordSet = new Set(words);
  /** @type {Map<string, { word: string, country: string, population: number, state?: string }>} */
  const bestByCompact = new Map();
  let scanned = 0;

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
        scanned += 1;
        const cols = line.split("\t");
        const feature = cols[7] || "";
        if (!feature.startsWith("PPL")) {
          return;
        }
        const countryCode = cols[8];
        const population = Number.parseInt(cols[14], 10) || 0;
        if (population < MIN_POP) {
          return;
        }
        const word = displayWord(cols[1]).toUpperCase();
        const key = compactWord(word);
        if (!isPlayableDictionaryWord(word) || isExemptWord(word)) {
          return;
        }
        const existingMeta = meta[word];
        if (isSpecialPlaceKind(existingMeta)) {
          return;
        }
        const isUs = countryCode === "US";
        const country = isUs
          ? "United States"
          : normalizeCountry(countryNames[countryCode] || countryCode);
        const state = isUs ? stateByCode[cols[10]] : undefined;
        const prev = bestByCompact.get(key);
        if (!prev || population > prev.population) {
          bestByCompact.set(key, { word, country, population, state });
        }
      });
  });

  let added = 0;
  let updated = 0;
  bestByCompact.forEach(({ word, country, population, state }) => {
    if (!wordSet.has(word)) {
      wordSet.add(word);
      added += 1;
    }
    if (!meta[word]) {
      meta[word] = { country, population };
      if (state) {
        meta[word].state = state;
      }
      return;
    }
    if (isSpecialPlaceKind(meta[word])) {
      return;
    }
    const prevPop = parsePopulation(meta[word].population) || 0;
    if (!meta[word].country || meta[word].country === "—" || prevPop < population) {
      meta[word].country = country;
      meta[word].population = population;
      updated += 1;
    }
    if (state && meta[word].state !== state) {
      meta[word].state = state;
      updated += 1;
    }
  });

  return {
    words: Array.from(wordSet).sort(),
    added,
    updated,
    scanned
  };
}

const dictSrc = fs.readFileSync(DICT_PATH, "utf8");
const m = dictSrc.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
if (!m) {
  throw new Error("Could not parse LOCKED_WORDS");
}
// eslint-disable-next-line no-eval
let words = eval(m[1]);
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const ingest = ingestGeonameCities(words, meta);
words = ingest.words;

const kept = words.filter((w) => isPlayableDictionaryWord(w) && shouldKeepWord(w, meta));
const removed = words.length - kept.length;

const prunedMeta = {};
kept.forEach((w) => {
  if (meta[w]) {
    prunedMeta[w] = meta[w];
  }
});

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(kept)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(prunedMeta)}\n`, "utf8");

process.stdout.write(
  `Cities MIN_POP=${MIN_POP}: scanned ${ingest.scanned} GeoNames rows, ` +
    `added ${ingest.added}, metadata updated ${ingest.updated}, kept ${kept.length} words, removed ${removed}.\n` +
    `place-metadata.json now has ${Object.keys(prunedMeta).length} entries.\n`
);
