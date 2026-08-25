/**
 * Removes LOCKED_WORDS that contain digit characters (0–9).
 * The tile bag has no number tiles, so these words are not playable.
 *
 * Run: node scripts/remove-digit-words.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const { containsDigit } = require(path.join(ROOT, "dictionary-keys.js"));

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
const removed = words.filter((word) => containsDigit(word));
const kept = words.filter((word) => !containsDigit(word));

const prunedMeta = {};
kept.forEach((word) => {
  if (meta[word]) {
    prunedMeta[word] = meta[word];
  }
});

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(kept)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(prunedMeta)}\n`, "utf8");

process.stdout.write(
  `Removed ${removed.length} words with digits; kept ${kept.length}.\n` +
    `place-metadata.json now has ${Object.keys(prunedMeta).length} entries.\n`
);
