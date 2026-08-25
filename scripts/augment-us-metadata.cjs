/**
 * Augment place-metadata.json with United States city population/country
 * from OpenDataSoft GeoNames (cities >= 1000).
 *
 * Only fills words that are currently missing metadata.
 *
 * Run: node scripts/augment-us-metadata.cjs
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const API_EXPORT_CSV =
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-1000/exports/csv?where=country_code%3D%27US%27";

function normalizeKey(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 90000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

function parseLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

async function fetchAllUsCities() {
  // records endpoint has offset caps; use CSV export for full US dataset.
  const csv = await fetchText(API_EXPORT_CSV);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = splitCsvLine(lines[0], delimiter);
  const idx = {
    name: header.indexOf("name"),
    asciiName: header.indexOf("ascii_name"),
    alternateNames: header.indexOf("alternate_names"),
    population: header.indexOf("population")
  };
  if (idx.name === -1 || idx.asciiName === -1 || idx.population === -1) {
    throw new Error("Unexpected CSV header for OpenDataSoft export");
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (!cols.length) {
      continue;
    }
    rows.push({
      name: cols[idx.name],
      ascii_name: cols[idx.asciiName],
      alternate_names: (cols[idx.alternateNames] || "").split(",").map((s) => s.trim()).filter(Boolean),
      population: Number(cols[idx.population]) || 0
    });
    if (i % 2000 === 0) {
      process.stdout.write(`\rUS city rows parsed: ${i} / ${lines.length - 1}   `);
    }
  }
  process.stdout.write(`\rUS city rows parsed: ${lines.length - 1} / ${lines.length - 1}   \n`);
  return rows;
}

function splitCsvLine(line, delim = ",") {
  const out = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (c === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }
    if (c === delim && !inQuotes) {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  out.push(cur);
  return out;
}

function buildUsKeyMap(usRows) {
  const map = new Map();

  const upsert = (key, population) => {
    if (!key) {
      return;
    }
    const prev = map.get(key) || 0;
    if (population > prev) {
      map.set(key, population);
    }
  };

  usRows.forEach((row) => {
    const pop = Number(row.population) || 0;
    if (pop <= 0) {
      return;
    }
    upsert(normalizeKey(row.name), pop);
    upsert(normalizeKey(row.ascii_name), pop);
    (row.alternate_names || []).forEach((alt) => upsert(normalizeKey(alt), pop));
  });

  return map;
}

async function main() {
  const words = parseLockedWords();
  const metadata = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const usRows = await fetchAllUsCities();
  const usMap = buildUsKeyMap(usRows);

  let added = 0;
  let updated = 0;

  words.forEach((word) => {
    const key = normalizeKey(word);
    const population = usMap.get(key);
    if (!population) {
      return;
    }
    if (!metadata[word]) {
      metadata[word] = { country: "United States", population };
      added += 1;
      return;
    }
    // If it is already US but missing/low population, raise it.
    if (metadata[word].country === "United States") {
      const oldPop = Number(metadata[word].population) || 0;
      if (population > oldPop) {
        metadata[word].population = population;
        updated += 1;
      }
    }
  });

  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata)}\n`, "utf8");
  console.log(
    `US metadata augmentation complete. Added: ${added}, updated: ${updated}, total metadata entries: ${Object.keys(metadata).length}.`
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

