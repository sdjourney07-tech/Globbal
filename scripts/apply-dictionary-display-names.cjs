/**
 * Rewrites LOCKED_WORDS and place-metadata keys to use spaced display names
 * (e.g. "NEW YORK") while preserving compact keys for gameplay matching.
 *
 * Run: node scripts/apply-dictionary-display-names.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const DATA_DIR = path.join(ROOT, "data");
const CACHE = path.join(ROOT, "geonames-cache");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

const GEONAMES_CITY_TIERS = ["cities15000", "cities5000", "cities1000", "cities500"];

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function ingestGeonamesDisplayMap() {
  /** @type {Map<string, { display: string, population: number }>} */
  const byCompact = new Map();

  GEONAMES_CITY_TIERS.forEach((tier) => {
    const txtPath = path.join(CACHE, `${tier}.txt`);
    if (!fs.existsSync(txtPath)) {
      return;
    }
    fs.readFileSync(txtPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const cols = line.split("\t");
        if (cols.length < 15) {
          return;
        }
        const name = cols[1];
        const asciiname = cols[2];
        const population = Number.parseInt(cols[14], 10) || 0;
        const source = asciiname || name;
        const compact = compactWord(source);
        const display = displayWord(source);
        if (!compact || !display) {
          return;
        }
        const prev = byCompact.get(compact);
        if (!prev || population > prev.population) {
          byCompact.set(compact, { display, population });
        }
      });
  });

  return byCompact;
}

function ingestCsvDisplayMap() {
  /** @type {Map<string, string>} */
  const byCompact = new Map();
  if (!fs.existsSync(DATA_DIR)) {
    return byCompact;
  }

  fs.readdirSync(DATA_DIR)
    .filter((fname) => /^world-cities.*\.csv$/i.test(fname))
    .forEach((fname) => {
      const lines = fs.readFileSync(path.join(DATA_DIR, fname), "utf8").split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (!line || idx === 0) {
          return;
        }
        const parts = splitCsvLine(line);
        if (parts.length < 4) {
          return;
        }
        const name = parts.slice(0, parts.length - 3).join(",");
        const compact = compactWord(name);
        const display = displayWord(name);
        if (compact && display && !byCompact.has(compact)) {
          byCompact.set(compact, display);
        }
      });
    });

  return byCompact;
}

function resolveDisplayName(compactKey, geonamesMap, csvMap) {
  const geoname = geonamesMap.get(compactKey);
  if (geoname) {
    return geoname.display;
  }
  const csvDisplay = csvMap.get(compactKey);
  if (csvDisplay) {
    return csvDisplay;
  }
  return compactKey;
}

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const geonamesMap = ingestGeonamesDisplayMap();
const csvMap = ingestCsvDisplayMap();

const displayWords = [];
const newMeta = {};
let spacedCount = 0;

words.forEach((word) => {
  const compact = compactWord(word);
  const display = resolveDisplayName(compact, geonamesMap, csvMap);
  if (display.includes(" ")) {
    spacedCount += 1;
  }
  displayWords.push(display);
  const oldMeta = meta[word] || meta[compact] || meta[display];
  if (oldMeta) {
    newMeta[display] = oldMeta;
  }
});

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(displayWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(newMeta)}\n`, "utf8");

process.stdout.write(
  `Dictionary display names: ${displayWords.length} words, ${spacedCount} with spaces.\n` +
    `place-metadata.json now has ${Object.keys(newMeta).length} entries.\n`
);
