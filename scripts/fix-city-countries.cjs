/**
 * Fixes wrong city countries in place-metadata.json.
 * GeoNames alternate names (e.g. Changchun → "Cancun") caused many mismatches.
 *
 * Run: node scripts/fix-city-countries.cjs
 */
const fs = require("fs");
const path = require("path");
const { createCityCountryResolver, countriesMatch, normalizeCountry } = require("./city-country-resolver.cjs");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");

const PROTECTED_KINDS = new Set(["country", "state", "river", "county", "shire", "water"]);

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) throw new Error("Could not parse LOCKED_WORDS");
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const resolver = createCityCountryResolver(ROOT);
const words = loadLockedWords();
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

const changes = [];

words.forEach((word) => {
  const entry = meta[word];
  if (!entry?.country || entry.country === "—") return;
  if (entry.kind && PROTECTED_KINDS.has(entry.kind)) return;

  const resolved = resolver.resolveCityCountry(word, entry);
  if (!resolved || countriesMatch(entry.country, resolved)) return;

  changes.push({ word, from: entry.country, to: resolved });
  meta[word] = { ...entry, country: resolved };
});

if (changes.length) {
  fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");
}

process.stdout.write(
  `Fixed ${changes.length} city countries in place-metadata.json.\n` +
    changes.map((c) => `  ${c.word}: ${c.from} → ${c.to}`).join("\n") +
    (changes.length ? "\n" : "")
);
