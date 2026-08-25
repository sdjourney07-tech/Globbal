/**
 * Builds dictionary-categories.json — word lists for dictionary browser folders.
 * Run: node scripts/build-dictionary-categories.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const COUNTRY_INFO_PATH = path.join(ROOT, "geonames-cache", "countryInfo.txt");
const OUT_PATH = path.join(ROOT, "dictionary-categories.json");
const STATES_PATH = path.join(ROOT, "data", "us-states.json");
const IRISH_COUNTIES_PATH = path.join(ROOT, "data", "irish-counties.json");
const BRITISH_SHIRES_PATH = path.join(ROOT, "data", "british-shires.json");
const RIVERS_PATH = path.join(ROOT, "data", "world-rivers.json");
const WATER_PATH = path.join(ROOT, "data", "world-water-bodies.json");

const OCEAN_SEA_TYPES = new Set(["ocean", "sea"]);
const COASTAL_WATER_TYPES = new Set(["bay", "gulf", "bight"]);
const MOUNTAIN_KINDS = new Set(["mountain", "mountainRange", "hill"]);
const PLAIN_VALLEY_KINDS = new Set(["plain", "valley"]);
const ISLAND_CONTINENT_KINDS = new Set(["island", "continent"]);
const { compactWord, collectAliasSourceWords } = require(path.join(ROOT, "dictionary-keys.js"));

const US_COUNTRY_NAMES = new Set(["United States", "United States of America"]);

/** Ascii keys for major mountain ranges / peaks likely to appear as playable words. */
const MOUNTAIN_RANGE_KEYS = new Set(
  [
    "ALPS",
    "ANDES",
    "APENNINES",
    "APPALACHIANS",
    "APPALACHIAN",
    "ATLAS",
    "ATLASRANGE",
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
    "ALBORZ",
    "ALTAI",
    "ETNA",
    "VESUVIUS",
    "ACONCAGUA",
    "ANNAPURNA",
    "KRAKATOA",
    "FUJI",
    "MONTBLANC",
    "MATTERHORN",
    "ARARAT",
    "ELBRUS",
    "WHITNEY",
    "RANIER",
    "HOOD",
    "SHASTA",
    "OLYMPIC",
    "OLYMPICS"
  ].map((k) => k.toUpperCase())
);

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS from dictionary.js");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
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

function main() {
  const words = loadLockedWords();
  const wordSet = new Set(words);
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const countryTxt = fs.existsSync(COUNTRY_INFO_PATH)
    ? fs.readFileSync(COUNTRY_INFO_PATH, "utf8")
    : "";
  const countryKeys = loadCountryKeys(countryTxt);

  const assigned = new Set();
  const categories = {
    countries: [],
    abbreviations: [],
    mountainRanges: [],
    landforms: [],
    islandsContinents: [],
    rivers: [],
    oceansSeas: [],
    baysGulfsBights: [],
    usaStates: [],
    irishCounties: [],
    britishShires: [],
    worldCities: [],
    usaCities: []
  };

  const riverCompacts = new Set(
    JSON.parse(fs.readFileSync(RIVERS_PATH, "utf8")).map((river) => compactWord(river.name))
  );
  const waterBodies = JSON.parse(fs.readFileSync(WATER_PATH, "utf8"));
  const oceanSeaCompacts = new Set(
    waterBodies.filter((b) => OCEAN_SEA_TYPES.has(b.type)).map((b) => compactWord(b.name))
  );
  const coastalCompacts = new Set(
    waterBodies.filter((b) => COASTAL_WATER_TYPES.has(b.type)).map((b) => compactWord(b.name))
  );
  const stateCompacts = new Set(
    JSON.parse(fs.readFileSync(STATES_PATH, "utf8")).map((state) => compactWord(state.name))
  );
  const countyCompacts = new Set(
    JSON.parse(fs.readFileSync(IRISH_COUNTIES_PATH, "utf8")).map((county) => compactWord(county.name))
  );
  const shireCompacts = new Set(
    JSON.parse(fs.readFileSync(BRITISH_SHIRES_PATH, "utf8")).map((shire) => compactWord(shire.name))
  );
  const stateCodeSet = new Set(
    JSON.parse(fs.readFileSync(STATES_PATH, "utf8")).map((state) => String(state.code).toUpperCase())
  );

  for (const word of words) {
    const entry = meta[word];
    if (
      entry?.kind === "abbreviation" ||
      entry?.countryAlias ||
      stateCodeSet.has(word)
    ) {
      categories.abbreviations.push(word);
      assigned.add(word);
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (MOUNTAIN_KINDS.has(entry?.kind) || MOUNTAIN_RANGE_KEYS.has(compactWord(word))) {
      categories.mountainRanges.push(word);
      assigned.add(word);
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (PLAIN_VALLEY_KINDS.has(entry?.kind)) {
      categories.landforms.push(word);
      assigned.add(word);
    } else if (ISLAND_CONTINENT_KINDS.has(entry?.kind)) {
      categories.islandsContinents.push(word);
      assigned.add(word);
    }
  }

  for (const word of words) {
    if (assigned.has(word)) {
      continue;
    }
    if (countryKeys.has(compactWord(word)) || meta[word]?.kind === "country") {
      categories.countries.push(word);
      assigned.add(word);
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (
      entry?.kind === "river" ||
      entry?.river ||
      riverCompacts.has(compactWord(word))
    ) {
      categories.rivers.push(word);
      if (entry?.kind !== "country" && entry?.kind !== "state") {
        assigned.add(word);
      }
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (
      entry?.kind === "state" ||
      entry?.usState ||
      stateCompacts.has(compactWord(word))
    ) {
      categories.usaStates.push(word);
      if (entry?.kind !== "country") {
        assigned.add(word);
      }
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (entry?.kind === "county" || countyCompacts.has(compactWord(word))) {
      categories.irishCounties.push(word);
      if (entry?.kind !== "country" && entry?.kind !== "state") {
        assigned.add(word);
      }
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (entry?.kind === "shire" || shireCompacts.has(compactWord(word))) {
      categories.britishShires.push(word);
      if (entry?.kind !== "country" && entry?.kind !== "state") {
        assigned.add(word);
      }
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (
      OCEAN_SEA_TYPES.has(entry?.kind) ||
      (entry?.waterBody && OCEAN_SEA_TYPES.has(entry.waterBody.type)) ||
      oceanSeaCompacts.has(compactWord(word))
    ) {
      categories.oceansSeas.push(word);
      if (entry?.kind !== "country" && entry?.kind !== "state") {
        assigned.add(word);
      }
    }
  }

  for (const word of words) {
    const entry = meta[word];
    if (
      COASTAL_WATER_TYPES.has(entry?.kind) ||
      (entry?.waterBody && COASTAL_WATER_TYPES.has(entry.waterBody.type)) ||
      coastalCompacts.has(compactWord(word))
    ) {
      categories.baysGulfsBights.push(word);
      if (entry?.kind !== "country" && entry?.kind !== "state") {
        assigned.add(word);
      }
    }
  }

  for (const word of words) {
    if (assigned.has(word)) {
      continue;
    }
    const entry = meta[word];
    if (!entry || !entry.country) {
      continue;
    }
    if (US_COUNTRY_NAMES.has(entry.country)) {
      categories.usaCities.push(word);
    } else {
      categories.worldCities.push(word);
    }
    assigned.add(word);
  }

  categories.other = words.filter((word) => !assigned.has(word));

  for (const key of Object.keys(categories)) {
    categories[key].sort();
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(categories));

  const aliasSources = collectAliasSourceWords(words, meta);
  fs.writeFileSync(
    path.join(ROOT, "dictionary-alias-sources.js"),
    `const DICTIONARY_ALIAS_SOURCE_WORDS = ${JSON.stringify(aliasSources)};\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        totalWords: words.length,
        countries: categories.countries.length,
        abbreviations: categories.abbreviations.length,
        mountainRanges: categories.mountainRanges.length,
        landforms: categories.landforms.length,
        islandsContinents: categories.islandsContinents.length,
        rivers: categories.rivers.length,
        oceansSeas: categories.oceansSeas.length,
        baysGulfsBights: categories.baysGulfsBights.length,
        usaStates: categories.usaStates.length,
        irishCounties: categories.irishCounties.length,
        britishShires: categories.britishShires.length,
        worldCities: categories.worldCities.length,
        usaCities: categories.usaCities.length,
        other: categories.other.length,
        uncategorized: words.length - assigned.size
      },
      null,
      2
    )
  );
}

main();
