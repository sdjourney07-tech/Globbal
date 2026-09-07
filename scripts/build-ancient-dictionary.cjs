/**
 * Merges historical places into the main dictionary bundle:
 *   dictionary.js
 *   place-metadata.json
 *   dictionary-categories.json
 *   dictionary-alias-sources.js
 *
 * Adds historical countries, cities, regions, kingdoms, and empires that no
 * longer exist under those names on top of the modern place dictionary.
 *
 * Run: node scripts/build-ancient-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MODERN_DICT_PATH = path.join(ROOT, "dictionary.js");
const MODERN_META_PATH = path.join(ROOT, "place-metadata.json");
const MODERN_CATEGORIES_PATH = path.join(ROOT, "dictionary-categories.json");
const HISTORICAL_PATH = path.join(ROOT, "data", "historical-places.json");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const CATEGORIES_PATH = path.join(ROOT, "dictionary-categories.json");
const ALIAS_SOURCES_PATH = path.join(ROOT, "dictionary-alias-sources.js");
const { compactWord, displayWord, collectAliasSourceWords } = require(path.join(ROOT, "dictionary-keys.js"));

function loadLockedWords(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error(`Could not parse LOCKED_WORDS in ${filePath}`);
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const modernWords = loadLockedWords(MODERN_DICT_PATH);
const modernMeta = JSON.parse(fs.readFileSync(MODERN_META_PATH, "utf8"));
const modernCategories = JSON.parse(fs.readFileSync(MODERN_CATEGORIES_PATH, "utf8"));
const historicalRows = JSON.parse(fs.readFileSync(HISTORICAL_PATH, "utf8"));

const modernCompacts = new Set(modernWords.map((word) => compactWord(word)));
const mergedMeta = { ...modernMeta };
const addedWords = [];
const categories = {
  ...modernCategories,
  historicalCountries: [],
  historicalCities: [],
  historicalRegions: [],
  historicalKingdomsEmpires: []
};

const seenHistoricalCompacts = new Set();

historicalRows.forEach((row) => {
  const display = displayWord(row.name);
  const compact = compactWord(display);
  if (!display || !compact) {
    throw new Error(`Invalid historical place name: ${row.name}`);
  }
  if (seenHistoricalCompacts.has(compact)) {
    return;
  }
  seenHistoricalCompacts.add(compact);

  if (modernCompacts.has(compact)) {
    return;
  }

  const meta = {
    kind: row.kind,
    modernName: row.modernName || "—",
    era: row.era || "—",
    region: row.region || "—",
    historical: true
  };
  if (row.country) {
    meta.country = row.country;
  }

  mergedMeta[display] = meta;
  addedWords.push(display);

  if (row.kind === "historicalCountry") {
    categories.historicalCountries.push(display);
  } else if (row.kind === "historicalCity") {
    categories.historicalCities.push(display);
  } else if (row.kind === "historicalRegion") {
    categories.historicalRegions.push(display);
  } else if (row.kind === "historicalEmpire" || row.kind === "historicalKingdom") {
    categories.historicalKingdomsEmpires.push(display);
  }
});

addedWords.sort((a, b) => a.localeCompare(b));
categories.historicalCountries.sort((a, b) => a.localeCompare(b));
categories.historicalCities.sort((a, b) => a.localeCompare(b));
categories.historicalRegions.sort((a, b) => a.localeCompare(b));
categories.historicalKingdomsEmpires.sort((a, b) => a.localeCompare(b));

const mergedWords = [...modernWords, ...addedWords].sort((a, b) => a.localeCompare(b));

fs.writeFileSync(
  DICT_PATH,
  `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`,
  "utf8"
);
fs.writeFileSync(META_PATH, `${JSON.stringify(mergedMeta)}\n`, "utf8");
fs.writeFileSync(CATEGORIES_PATH, `${JSON.stringify(categories, null, 2)}\n`, "utf8");

const aliasSources = collectAliasSourceWords(mergedWords, mergedMeta);
fs.writeFileSync(
  ALIAS_SOURCES_PATH,
  `const DICTIONARY_ALIAS_SOURCE_WORDS = ${JSON.stringify(aliasSources)};\n`,
  "utf8"
);

process.stdout.write(
  `Historical places merged into main dictionary: ${addedWords.length} added.\n` +
    `Total words: ${mergedWords.length} (modern ${modernWords.length}).\n` +
    `  historicalCountries: ${categories.historicalCountries.length}\n` +
    `  historicalCities: ${categories.historicalCities.length}\n` +
    `  historicalRegions: ${categories.historicalRegions.length}\n` +
    `  historicalKingdomsEmpires: ${categories.historicalKingdomsEmpires.length}\n`
);
