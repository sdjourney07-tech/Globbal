const { createCityCountryResolver, countriesMatch } = require("./city-country-resolver.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PROTECTED = new Set(["country", "state", "river", "county", "shire", "water"]);
const words = eval(
  fs.readFileSync(path.join(ROOT, "dictionary.js"), "utf8").match(/const LOCKED_WORDS = (\[[\s\S]*\]);/)[1]
);
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "place-metadata.json"), "utf8"));
const resolver = createCityCountryResolver(ROOT);

const changes = [];
for (const word of words) {
  const entry = meta[word];
  if (!entry?.country || entry.kind && PROTECTED.has(entry.kind)) continue;
  const resolved = resolver.resolveCityCountry(word, entry);
  if (resolved && !countriesMatch(entry.country, resolved)) {
    changes.push({ word, from: entry.country, to: resolved });
  }
}
console.log(JSON.stringify(changes, null, 2));
