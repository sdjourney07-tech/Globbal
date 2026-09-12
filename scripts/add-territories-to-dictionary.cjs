/**
 * Adds dependent territories / special administrative regions from GeoNames
 * countryInfo.txt (ISO list in data/dependent-territories-iso2.json) to
 * LOCKED_WORDS and place-metadata.json with kind: "territory".
 *
 * Run: node scripts/add-territories-to-dictionary.cjs
 * Then: npm run build:categories
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const COUNTRY_INFO_PATH = path.join(ROOT, "geonames-cache", "countryInfo.txt");
const TERRITORY_ISO2_PATH = path.join(ROOT, "data", "dependent-territories-iso2.json");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

const TERRITORY_ISO2 = new Set(JSON.parse(fs.readFileSync(TERRITORY_ISO2_PATH, "utf8")));

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function parseCountryInfo(text) {
  /** @type {Array<{ iso: string, iso3: string, name: string, display: string, compact: string, population: number }>} */
  const rows = [];

  text.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith("#")) {
      return;
    }
    const cols = line.split("\t");
    if (cols.length < 8) {
      return;
    }
    const iso = cols[0];
    const iso3 = cols[1];
    const name = String(cols[4] || "").trim();
    if (!iso || iso.length !== 2 || !name) {
      return;
    }
    if (!TERRITORY_ISO2.has(iso)) {
      return;
    }
    const population = Number.parseInt(cols[7], 10);
    const display = displayWord(name);
    const compact = compactWord(display);
    if (!display || !compact) {
      return;
    }
    rows.push({
      iso,
      iso3,
      name,
      display,
      compact,
      population: Number.isFinite(population) ? population : 0
    });
  });

  return rows;
}

if (!fs.existsSync(COUNTRY_INFO_PATH)) {
  throw new Error(`Missing ${COUNTRY_INFO_PATH}. Fetch GeoNames countryInfo first.`);
}

const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const territories = parseCountryInfo(fs.readFileSync(COUNTRY_INFO_PATH, "utf8"));

if (territories.length !== TERRITORY_ISO2.size) {
  const found = new Set(territories.map((t) => t.iso));
  const missing = [...TERRITORY_ISO2].filter((iso) => !found.has(iso));
  throw new Error(
    `Territory ISO mismatch: found ${territories.length}, expected ${TERRITORY_ISO2.size}. ` +
      `Missing: ${missing.join(",") || "none"}.`
  );
}

const territoryDisplays = new Set(territories.map((t) => t.display));
const territoryCompacts = new Set(territories.map((t) => t.compact));

// Drop prior territory entries and any word that collides with a territory compact.
const keptWords = words.filter((word) => {
  if (meta[word]?.kind === "territory") {
    return false;
  }
  if (territoryCompacts.has(compactWord(word))) {
    return false;
  }
  return true;
});

territories.forEach((territory) => {
  meta[territory.display] = {
    country: territory.name,
    population: territory.population > 0 ? territory.population : null,
    kind: "territory",
    iso: territory.iso,
    iso3: territory.iso3
  };
});

Object.keys(meta).forEach((key) => {
  if (meta[key]?.kind === "territory" && !territoryDisplays.has(key)) {
    delete meta[key];
  }
});

// Remove metadata for non-canonical spellings that match a territory compact.
Object.keys(meta).forEach((key) => {
  if (meta[key]?.kind === "territory") {
    return;
  }
  if (territoryCompacts.has(compactWord(key)) && !territoryDisplays.has(key)) {
    delete meta[key];
  }
});

const mergedWords = [...keptWords, ...territories.map((t) => t.display)]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Dependent territories: ${territories.length} in dictionary (kind: territory).\n` +
    `Examples: ${territories
      .slice()
      .sort((a, b) => a.display.localeCompare(b.display))
      .slice(0, 8)
      .map((t) => t.display)
      .join(", ")}…\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
