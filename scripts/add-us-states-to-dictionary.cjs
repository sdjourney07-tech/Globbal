/**
 * Adds all 50 US states to LOCKED_WORDS and place-metadata.json.
 * Display names use spaces where appropriate; board play uses compact keys (no spaces).
 *
 * Run: node scripts/add-us-states-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const STATES_PATH = path.join(ROOT, "data", "us-states.json");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

const US_COUNTRY = "United States";

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const states = JSON.parse(fs.readFileSync(STATES_PATH, "utf8"));
if (states.length !== 50) {
  throw new Error(`Expected 50 states, got ${states.length}`);
}

const stateRows = states.map((state) => {
  const display = displayWord(state.name);
  const compact = compactWord(display);
  if (!display || !compact) {
    throw new Error(`Invalid state name: ${state.name}`);
  }
  return {
    name: state.name,
    code: state.code,
    display,
    compact,
    population: state.population
  };
});

const stateCompacts = new Set(stateRows.map((s) => s.compact));
const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const keptWords = words.filter((word) => !stateCompacts.has(compactWord(word)));
const stateWords = stateRows.map((s) => s.display);
let mergedWords = [...keptWords, ...stateWords]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

stateRows.forEach((state) => {
  const existingWord = words.find((w) => compactWord(w) === state.compact);
  const existingMeta = existingWord ? meta[existingWord] : null;

  if (existingMeta?.kind === "country") {
    const key = existingWord || state.display;
    meta[key] = {
      ...existingMeta,
      usState: {
        code: state.code,
        population: state.population
      }
    };
    return;
  }

  meta[state.display] = {
    country: US_COUNTRY,
    population: state.population,
    kind: "state",
    stateCode: state.code
  };

  if (existingWord && existingWord !== state.display) {
    delete meta[existingWord];
  }

  words.forEach((word) => {
    if (compactWord(word) === state.compact && word !== state.display && meta[word]) {
      delete meta[word];
    }
  });
});

const added = stateWords.filter(
  (display) => !words.some((word) => compactWord(word) === compactWord(display))
).length;
const displayUpdates = stateRows.filter((state) =>
  words.some((word) => compactWord(word) === state.compact && word !== state.display)
).length;

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `US states: ${stateRows.length} in dictionary (${added} new, ${displayUpdates} display-name updates).\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
