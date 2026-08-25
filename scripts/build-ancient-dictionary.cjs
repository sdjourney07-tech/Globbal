/**
 * Builds the Ancient version dictionary bundle:
 *   dictionary-ancient.js
 *   place-metadata-ancient.json
 *   dictionary-categories-ancient.json
 *
 * Ancient mode = modern dictionary plus historical countries, cities, regions,
 * kingdoms, and empires that no longer exist under those names.
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
const ANCIENT_DICT_PATH = path.join(ROOT, "dictionary-ancient.js");
const ANCIENT_META_PATH = path.join(ROOT, "place-metadata-ancient.json");
const ANCIENT_CATEGORIES_PATH = path.join(ROOT, "dictionary-categories-ancient.json");
const ANCIENT_ALIAS_SOURCES_PATH = path.join(ROOT, "dictionary-alias-sources-ancient.js");
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
const ancientMeta = { ...modernMeta };
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

  ancientMeta[display] = meta;
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

const ancientWords = [...modernWords, ...addedWords].sort((a, b) => a.localeCompare(b));

fs.writeFileSync(
  ANCIENT_DICT_PATH,
  `const LOCKED_WORDS = ${JSON.stringify(ancientWords)};\n`,
  "utf8"
);
fs.writeFileSync(ANCIENT_META_PATH, `${JSON.stringify(ancientMeta)}\n`, "utf8");
fs.writeFileSync(ANCIENT_CATEGORIES_PATH, `${JSON.stringify(categories, null, 2)}\n`, "utf8");

const aliasSources = collectAliasSourceWords(ancientWords, ancientMeta);
fs.writeFileSync(
  ANCIENT_ALIAS_SOURCES_PATH,
  `const DICTIONARY_ALIAS_SOURCE_WORDS = ${JSON.stringify(aliasSources)};\n`,
  "utf8"
);

process.stdout.write(
  `Ancient dictionary: ${addedWords.length} historical places added.\n` +
    `Total words: ${ancientWords.length} (modern ${modernWords.length}).\n` +
    `  historicalCountries: ${categories.historicalCountries.length}\n` +
    `  historicalCities: ${categories.historicalCities.length}\n` +
    `  historicalRegions: ${categories.historicalRegions.length}\n` +
    `  historicalKingdomsEmpires: ${categories.historicalKingdomsEmpires.length}\n`
);
