/**
 * Prints counts of missing dictionary metadata:
 * - meta entry missing entirely
 * - country missing/blank
 * - population missing/invalid/<= 0
 *
 * Usage: node scripts/analyze-dictionary-metadata.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");

const dictSrc = fs.readFileSync(DICT_PATH, "utf8");
const m = dictSrc.match(/const LOCKED_WORDS = ([\s\S]*?\[[\s\S]*?\]);/);
if (!m) {
  throw new Error("Could not parse LOCKED_WORDS from dictionary.js");
}
// eslint-disable-next-line no-eval
const words = eval(m[1]);

const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

let missingMeta = 0;
let missingCountry = 0;
let missingPop = 0;
let missingBoth = 0;
let badPopTypes = 0;
const sampleMissing = [];

for (const w of words) {
  const o = meta[w];
  if (!o) {
    missingMeta += 1;
    if (sampleMissing.length < 10) sampleMissing.push(w);
    continue;
  }

  const countryOk = typeof o.country === "string" && o.country.trim() && o.country.trim() !== "—";

  const pop = o.population;
  const popStr = pop == null ? "" : String(pop);
  const popNum = popStr.replace(/,/g, "").replace(/\s+/g, "").trim() === "" ? NaN : Number(popStr.replace(/,/g, "").replace(/\s+/g, "").trim());
  const popOk = Number.isFinite(popNum) && popNum > 0;

  const cMissing = !countryOk;
  const pMissing = !popOk;

  if (cMissing) missingCountry += 1;
  if (pMissing) missingPop += 1;
  if (cMissing && pMissing) missingBoth += 1;

  if (pop != null && !Number.isFinite(popNum)) badPopTypes += 1;
}

console.log(
  JSON.stringify(
    {
      dictWords: words.length,
      metaEntries: Object.keys(meta).length,
      missingMeta,
      missingCountry,
      missingPop,
      missingBoth,
      badPopTypes,
      sampleMissing
    },
    null,
    2
  )
);

