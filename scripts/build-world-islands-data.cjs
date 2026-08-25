/**
 * Builds data/world-islands.json from Wikidata (islands with area >= 10 sq mi).
 *
 * Run: node scripts/build-world-islands-data.cjs
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "data", "world-islands.json");
const MIN_AREA_KM2 = 26; // 10 square miles

const SPARQL = `
SELECT ?itemLabel ?area ?countryLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q23442 .
  ?item p:P2046 ?areaStatement .
  ?areaStatement ps:P2046 ?area .
  FILTER(?area >= ${MIN_AREA_KM2})
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`.trim();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/sparql-results+json",
            "User-Agent": "GlobbalDictionary/1.0 (landforms build)"
          },
          timeout: 120000
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on("error", reject);
  });
}

async function main() {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(SPARQL)}`;
  const json = await fetchJson(url);
  /** @type {Map<string, { name: string, areaKm2: number, region: string }>} */
  const byCompact = new Map();

  (json.results?.bindings || []).forEach((row) => {
    const name = String(row.itemLabel?.value || "").trim();
    const areaKm2 = Number(row.area?.value);
    const country = String(row.countryLabel?.value || "").trim();
    if (!name || !Number.isFinite(areaKm2) || areaKm2 < MIN_AREA_KM2) {
      return;
    }
    const key = name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "")
      .toUpperCase();
    if (!key) {
      return;
    }
    const region = country || "—";
    const prev = byCompact.get(key);
    if (!prev || areaKm2 > prev.areaKm2) {
      byCompact.set(key, { name, areaKm2: Math.round(areaKm2), region });
    }
  });

  const islands = Array.from(byCompact.values()).sort((a, b) => b.areaKm2 - a.areaKm2);
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(islands, null, 2)}\n`, "utf8");
  process.stdout.write(
    `world-islands.json: ${islands.length} islands with area >= ${MIN_AREA_KM2} km2 (10 sq mi).\n`
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
