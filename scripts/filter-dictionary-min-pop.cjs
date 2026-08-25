/**
 * Removes LOCKED_WORDS that have place-metadata population < MIN_POP (when population is known).
 * Words with no metadata or null population are kept.
 *
 * Run from repo root: node scripts/filter-dictionary-min-pop.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const MIN_POP = 50000;

const dictSrc = fs.readFileSync(DICT_PATH, "utf8");
const m = dictSrc.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
if (!m) {
  throw new Error("Could not parse LOCKED_WORDS");
}
// eslint-disable-next-line no-eval
const words = eval(m[1]);
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const kept = words.filter((w) => {
  const o = meta[w];
  if (!o) {
    return true;
  }
  const p = o.population;
  if (p == null || p === undefined) {
    return true;
  }
  return Number(p) >= MIN_POP;
});

const prunedMeta = {};
kept.forEach((w) => {
  if (meta[w]) {
    prunedMeta[w] = meta[w];
  }
});

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(kept)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(prunedMeta)}\n`, "utf8");

process.stdout.write(
  `MIN_POP=${MIN_POP}: kept ${kept.length} words, removed ${words.length - kept.length}.\n` +
    `place-metadata.json now has ${Object.keys(prunedMeta).length} entries.\n`
);
