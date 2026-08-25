/**
 * Adds common country abbreviations (e.g. USA, UK) to LOCKED_WORDS and place-metadata.json.
 *
 * Run: node scripts/apply-country-aliases.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const ALIASES_PATH = path.join(ROOT, "data", "country-aliases.json");
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

function applyCountryAliases(words, meta, aliasRows) {
  const mergedWords = [...words];
  let added = 0;

  aliasRows.forEach((aliasRow) => {
    const aliasDisplay = displayWord(aliasRow.display);
    const canonicalDisplay = displayWord(aliasRow.countryName);
    const canonicalMeta = meta[canonicalDisplay];

    if (!aliasDisplay) {
      throw new Error(`Invalid country alias display: ${aliasRow.display}`);
    }
    if (!canonicalMeta || canonicalMeta.kind !== "country") {
      throw new Error(`Canonical country not in metadata: ${aliasRow.countryName}`);
    }

    meta[aliasDisplay] = {
      country: canonicalMeta.country,
      population: canonicalMeta.population,
      kind: "country",
      iso: canonicalMeta.iso,
      iso3: canonicalMeta.iso3,
      countryAlias: true
    };

    if (!mergedWords.includes(aliasDisplay)) {
      mergedWords.push(aliasDisplay);
      added += 1;
    }
  });

  mergedWords.sort((a, b) => a.localeCompare(b));
  return { mergedWords, added };
}

const aliasRows = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const { mergedWords, added } = applyCountryAliases(words, meta, aliasRows);

fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

process.stdout.write(
  `Country aliases: ${aliasRows.length} configured (${added} new words).\n` +
    `Dictionary total: ${mergedWords.length} words.\n` +
    `place-metadata.json: ${Object.keys(meta).length} entries.\n`
);

module.exports = { applyCountryAliases };
