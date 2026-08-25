/**
 * Adds major world rivers to LOCKED_WORDS and place-metadata.json.
 *
 * Run: node scripts/add-rivers-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const RIVERS_PATH = path.join(ROOT, "data", "world-rivers.json");
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

const rawRivers = JSON.parse(fs.readFileSync(RIVERS_PATH, "utf8"));
const riverRows = [];
const seenCompacts = new Set();

rawRivers.forEach((river) => {
  const display = displayWord(river.name);
  const compact = compactWord(display);
  if (!display || !compact) {
    throw new Error(`Invalid river name: ${river.name}`);
  }
  if (seenCompacts.has(compact)) {
    return;
  }
  seenCompacts.add(compact);
  riverRows.push({
    name: river.name,
    display,
    compact,
    region: river.region || "—",
    lengthKm: river.lengthKm
  });
});

const riverCompacts = new Set(riverRows.map((r) => r.compact));
const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const keptWords = words.filter((word) => !riverCompacts.has(compactWord(word)));
const riverWords = riverRows.map((r) => r.display);
const mergedWords = [...keptWords, ...riverWords]
  .filter((word, index, list) => list.indexOf(word) === index)
  .sort((a, b) => a.localeCompare(b));

riverRows.forEach((river) => {
  const existingWord = words.find((w) => compactWord(w) === river.compact);
  const existingMeta = existingWord ? meta[existingWord] : null;

  if (existingMeta?.kind === "country" || existingMeta?.kind === "state") {
    const key = existingWord || river.display;
    meta[key] = {
      ...existingMeta,
      river: {
        name: river.name,
        region: river.region,
        lengthKm: river.lengthKm
      }
    };
    return;
  }

  meta[river.display] = {
    region: river.region,
    lengthKm: river.lengthKm,
    kind: "river"
  };

  if (existingWord && existingWord !== river.display) {
    delete meta[existingWord];
  }

  words.forEach((word) => {
    if (compactWord(word) === river.compact && word !== river.display && meta[word]) {
      delete meta[word];
    }
  });
});

const added = riverWords.filter(
  (display) => !words.some((word) => compactWord(word) === compactWord(display))
).length;

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Rivers: ${riverRows.length} in dictionary (${added} new words).\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);
