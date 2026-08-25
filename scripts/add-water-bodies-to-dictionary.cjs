/**
 * Adds oceans, seas, bays, gulfs, and bights to LOCKED_WORDS and place-metadata.json.
 *
 * Run: node scripts/add-water-bodies-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const WATER_PATH = path.join(ROOT, "data", "world-water-bodies.json");
const { compactWord, displayWord } = require(path.join(ROOT, "dictionary-keys.js"));

const PROTECTED_KINDS = new Set(["country", "state", "river"]);

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const rawBodies = JSON.parse(fs.readFileSync(WATER_PATH, "utf8"));
const bodyRows = [];
const seenCompacts = new Set();

rawBodies.forEach((body) => {
  const display = displayWord(body.name);
  const compact = compactWord(display);
  if (!display || !compact) {
    throw new Error(`Invalid water body name: ${body.name}`);
  }
  if (seenCompacts.has(compact)) {
    return;
  }
  seenCompacts.add(compact);
  bodyRows.push({
    name: body.name,
    display,
    compact,
    type: body.type,
    region: body.region || "—",
    areaKm2: body.areaKm2
  });
});

const bodyCompacts = new Set(bodyRows.map((b) => b.compact));
const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const keptWords = words.filter((word) => !bodyCompacts.has(compactWord(word)));
const bodyWords = bodyRows.map((b) => b.display);
const mergedWords = [...keptWords, ...bodyWords]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

bodyRows.forEach((body) => {
  const existingWord = words.find((w) => compactWord(w) === body.compact);
  const existingMeta = existingWord ? meta[existingWord] : null;

  if (existingMeta && PROTECTED_KINDS.has(existingMeta.kind)) {
    const key = existingWord || body.display;
    meta[key] = {
      ...existingMeta,
      waterBody: {
        name: body.name,
        type: body.type,
        region: body.region,
        areaKm2: body.areaKm2
      }
    };
    return;
  }

  meta[body.display] = {
    region: body.region,
    areaKm2: body.areaKm2,
    kind: body.type
  };

  if (existingWord && existingWord !== body.display) {
    delete meta[existingWord];
  }

  words.forEach((word) => {
    if (compactWord(word) === body.compact && word !== body.display && meta[word]) {
      delete meta[word];
    }
  });
});

const added = bodyWords.filter(
  (display) => !words.some((word) => compactWord(word) === compactWord(display))
).length;

const byType = bodyRows.reduce((acc, body) => {
  acc[body.type] = (acc[body.type] || 0) + 1;
  return acc;
}, {});

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Water bodies: ${bodyRows.length} in dictionary (${added} new words).\n` +
    `By type: ${JSON.stringify(byType)}\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
