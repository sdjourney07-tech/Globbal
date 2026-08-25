/**
 * Adds US state two-letter codes to LOCKED_WORDS and place-metadata.json.
 * Country abbreviations (USA, UK, UAE) are added by apply-country-aliases.cjs.
 *
 * Run: node scripts/add-abbreviations-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const STATES_PATH = path.join(ROOT, "data", "us-states.json");
const { displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

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

const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const mergedWords = [...words];
let added = 0;

states.forEach((state) => {
  const code = String(state.code || "").toUpperCase();
  const stateName = displayWord(state.name);
  if (!code || code.length !== 2) {
    throw new Error(`Invalid state code for ${state.name}`);
  }
  if (!stateName) {
    throw new Error(`Invalid state name: ${state.name}`);
  }

  meta[code] = {
    kind: "abbreviation",
    abbreviationFor: stateName,
    country: US_COUNTRY,
    population: state.population,
    stateCode: code
  };

  if (!mergedWords.includes(code)) {
    mergedWords.push(code);
    added += 1;
  }
});

mergedWords.sort((a, b) => a.localeCompare(b));

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `State abbreviations: ${states.length} configured (${added} new words).\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
