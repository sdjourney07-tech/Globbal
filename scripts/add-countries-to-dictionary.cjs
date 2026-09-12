/**
 * Adds UN member states (sovereign self-governing countries) from GeoNames
 * countryInfo.txt to LOCKED_WORDS and place-metadata.json with national population.
 * Excludes dependent territories, observers, and disputed areas (Hong Kong, Puerto Rico,
 * Taiwan, Kosovo, Vatican, etc.).
 *
 * Run: node scripts/add-countries-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const COUNTRY_INFO_PATH = path.join(ROOT, "geonames-cache", "countryInfo.txt");
const UN_MEMBER_ISO2_PATH = path.join(ROOT, "data", "un-member-iso2.json");
const ALIASES_PATH = path.join(ROOT, "data", "country-aliases.json");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));
const { applyCountryAliases } = require("./apply-country-aliases.cjs");

const UN_MEMBER_ISO2 = new Set(JSON.parse(fs.readFileSync(UN_MEMBER_ISO2_PATH, "utf8")));

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
  const countries = [];

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
    const name = cols[4];
    if (!iso || iso.length !== 2 || !name) {
      return;
    }
    const population = Number.parseInt(cols[7], 10);
    const display = displayWord(name);
    const compact = compactWord(display);
    if (!display || !compact) {
      return;
    }
    countries.push({
      iso,
      iso3,
      name,
      display,
      compact,
      population: Number.isFinite(population) ? population : 0
    });
  });

  return countries;
}

const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const countryTxt = fs.readFileSync(COUNTRY_INFO_PATH, "utf8");
const allCountryRows = parseCountryInfo(countryTxt);
const countries = allCountryRows.filter((row) => UN_MEMBER_ISO2.has(row.iso));
const sovereignCompacts = new Set(countries.map((c) => c.compact));
const nonSovereignCompacts = new Set(
  allCountryRows.filter((row) => !UN_MEMBER_ISO2.has(row.iso)).map((row) => row.compact)
);

if (countries.length !== UN_MEMBER_ISO2.size) {
  const found = new Set(countries.map((c) => c.iso));
  const missing = [...UN_MEMBER_ISO2].filter((iso) => !found.has(iso));
  const extra = countries.filter((c) => !UN_MEMBER_ISO2.has(c.iso)).map((c) => c.iso);
  throw new Error(
    `UN member ISO mismatch: ${countries.length} sovereign rows, expected ${UN_MEMBER_ISO2.size}. ` +
      `Missing: ${missing.join(",") || "none"}. Extra: ${extra.join(",") || "none"}.`
  );
}

function isSovereignCountryWord(word) {
  const compact = compactWord(word);
  const entry = meta[word];
  if (entry?.kind === "territory") {
    // Kept by scripts/add-territories-to-dictionary.cjs
    return true;
  }
  if (entry?.countryAlias) {
    return true;
  }
  if (entry?.kind === "country") {
    return sovereignCompacts.has(compact);
  }
  if (nonSovereignCompacts.has(compact)) {
    return false;
  }
  return true;
}

const keptWords = words.filter(isSovereignCountryWord);
const countryWords = countries.map((c) => c.display);
const mergedWords = [...keptWords, ...countryWords]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

countries.forEach((country) => {
  meta[country.display] = {
    country: country.name,
    population: country.population > 0 ? country.population : null,
    kind: "country",
    iso: country.iso,
    iso3: country.iso3
  };
});

Object.keys(meta).forEach((key) => {
  if (
    meta[key]?.kind === "country" &&
    !meta[key]?.countryAlias &&
    !countries.some((c) => c.display === key)
  ) {
    delete meta[key];
  }
});

countries.forEach((country) => {
  words.forEach((word) => {
    if (compactWord(word) === country.compact && word !== country.display && meta[word]) {
      delete meta[word];
    }
  });
});

const removedTerritories = words.filter((word) => !isSovereignCountryWord(word)).length;

const aliasRows = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
const { mergedWords: withAliases, added: aliasesAdded } = applyCountryAliases(
  mergedWords,
  meta,
  aliasRows
);

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(withAliases)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Sovereign UN member states: ${countries.length} in dictionary.\n` +
    `Country aliases: ${aliasRows.length} (${aliasesAdded} new).\n` +
    `Removed ${removedTerritories} territory / non-member country entries.\n` +
    `Dictionary total: ${withAliases.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
