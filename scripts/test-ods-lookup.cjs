/**
 * Quick manual test for ODS lookups.
 *
 * Usage: node scripts/test-ods-lookup.cjs AARHUS
 */
const https = require("https");

const word = process.argv[2] || "AARHUS";

const dataset =
  "geonames-all-cities-with-a-population-1000";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

(async () => {
  const base = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${dataset}/records`;

  const queries = [
    `ascii_name='${word}'`,
    `ascii_name like '%${word}%'`,
    `name='${word}'`,
    `name like '%${word}%'`
  ];

  for (const q of queries) {
    const url = `${base}?where=${encodeURIComponent(q)}&limit=3`;
    const j = await fetchJson(url);
    console.log("\nquery:", q);
    console.log("total_count:", j.total_count);
    if (j.results && j.results.length) {
      console.log(
        "top:",
        j.results.map((r) => ({
          name: r.name,
          ascii_name: r.ascii_name,
          country: r.cou_name_en,
          pop: r.population
        }))
      );
    }
  }

  // Full-text search (often case-insensitive and supports partial matches).
  {
    const url = `${base}?q=${encodeURIComponent(word)}&limit=5`;
    const j = await fetchJson(url);
    console.log("\nquery: q=", word);
    console.log("total_count:", j.total_count);
    if (j.results && j.results.length) {
      console.log(
        "top:",
        j.results.map((r) => ({
          name: r.name,
          ascii_name: r.ascii_name,
          country: r.cou_name_en,
          pop: r.population
        }))
      );
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

