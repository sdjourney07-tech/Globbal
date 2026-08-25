/**
 * Adds a `state` field to United States city entries in place-metadata.json
 * using GeoNames city dumps (admin1 → state name via data/us-states.json).
 *
 * Run: node scripts/augment-us-city-states.cjs
 */
const fs = require("fs");
const path = require("path");
const { compactWord } = require(path.join(__dirname, "..", "dictionary-keys.js"));

const ROOT = path.resolve(__dirname, "..");
const META_PATH = path.join(ROOT, "place-metadata.json");
const STATES_PATH = path.join(ROOT, "data", "us-states.json");
const CACHE = path.join(ROOT, "geonames-cache");
const GEONAMES_CITY_TIERS = ["cities15000", "cities5000", "cities1000", "cities500"];

const US_COUNTRY_NAMES = new Set(["United States", "United States of America"]);

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function loadStateByCode() {
  const states = JSON.parse(fs.readFileSync(STATES_PATH, "utf8"));
  return Object.fromEntries(states.map((state) => [state.code, state.name]));
}

function buildUsStateMap(codeToName) {
  const stateByKey = new Map();

  const upsert = (key, state, population) => {
    if (!key || !state) {
      return;
    }
    const prev = stateByKey.get(key);
    if (!prev || population > prev.population) {
      stateByKey.set(key, { state, population });
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
        if (cols[8] !== "US") {
          return;
        }
        const state = codeToName[cols[10]];
        if (!state) {
          return;
        }
        const population = Number.parseInt(cols[14], 10) || 0;
        upsert(asciiKey(cols[1]), state, population);
        upsert(asciiKey(cols[2]), state, population);
      });
  });

  return stateByKey;
}

function main() {
  const codeToName = loadStateByCode();
  const stateByKey = buildUsStateMap(codeToName);
  const metadata = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

  let updated = 0;
  let missing = 0;

  Object.entries(metadata).forEach(([word, entry]) => {
    if (!entry || !US_COUNTRY_NAMES.has(entry.country)) {
      return;
    }
    if (entry.kind === "state") {
      return;
    }
    const hit = stateByKey.get(compactWord(word)) || stateByKey.get(asciiKey(word));
    if (!hit) {
      missing += 1;
      return;
    }
    if (entry.state !== hit.state) {
      entry.state = hit.state;
      updated += 1;
    }
  });

  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata)}\n`, "utf8");
  process.stdout.write(
    `US city states: updated ${updated}, unresolved ${missing}, GeoNames keys ${stateByKey.size}.\n`
  );
}

main();
