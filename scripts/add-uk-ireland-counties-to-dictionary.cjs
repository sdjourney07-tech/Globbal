/**
 * Adds Irish counties and British historic shires to LOCKED_WORDS and place-metadata.json.
 *
 * Run: node scripts/add-uk-ireland-counties-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const IRISH_PATH = path.join(ROOT, "data", "irish-counties.json");
const SHIRES_PATH = path.join(ROOT, "data", "british-shires.json");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function loadRows(filePath, kind) {
  const country = kind === "county" ? "Ireland" : "United Kingdom";
  return JSON.parse(fs.readFileSync(filePath, "utf8")).map((row) => {
    const display = displayWord(row.name);
    const compact = compactWord(display);
    if (!display || !compact) {
      throw new Error(`Invalid ${kind} name: ${row.name}`);
    }
    return {
      name: row.name,
      code: row.code,
      display,
      compact,
      region: row.region,
      country,
      population: row.population,
      kind
    };
  });
}

function mergeDivisionRows(rows, kind, expectedCount) {
  if (rows.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} ${kind} entries, got ${rows.length}`);
  }

  const seenCompacts = new Set();
  rows.forEach((row) => {
    if (seenCompacts.has(row.compact)) {
      throw new Error(`Duplicate compact for ${kind}: ${row.display}`);
    }
    seenCompacts.add(row.compact);
  });

  return rows;
}

const countyRows = mergeDivisionRows(loadRows(IRISH_PATH, "county"), "county", 32);
const shireRows = mergeDivisionRows(loadRows(SHIRES_PATH, "shire"), "shire", 86);
const divisionRows = [...countyRows, ...shireRows];
const divisionCompacts = new Set(divisionRows.map((row) => row.compact));

const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const keptWords = words.filter((word) => !divisionCompacts.has(compactWord(word)));
const divisionWords = divisionRows.map((row) => row.display);
const mergedWords = [...keptWords, ...divisionWords]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

divisionRows.forEach((row) => {
  const existingWord = words.find((w) => compactWord(w) === row.compact);
  const existingMeta = existingWord ? meta[existingWord] : null;

  if (existingMeta?.kind === "country") {
    const key = existingWord || row.display;
    meta[key] = {
      ...existingMeta,
      [row.kind]: {
        code: row.code,
        region: row.region,
        population: row.population
      }
    };
    return;
  }

  meta[row.display] = {
    country: row.country,
    region: row.region,
    population: row.population,
    kind: row.kind,
    divisionCode: row.code
  };

  if (existingWord && existingWord !== row.display) {
    delete meta[existingWord];
  }

  words.forEach((word) => {
    if (compactWord(word) === row.compact && word !== row.display && meta[word]) {
      delete meta[word];
    }
  });
});

const added = divisionWords.filter(
  (display) => !words.some((word) => compactWord(word) === compactWord(display))
).length;
const displayUpdates = divisionRows.filter((row) =>
  words.some((word) => compactWord(word) === row.compact && word !== row.display)
).length;

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Irish counties: ${countyRows.length} in dictionary.\n` +
    `British shires: ${shireRows.length} in dictionary.\n` +
    `${added} new words, ${displayUpdates} display-name updates.\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
