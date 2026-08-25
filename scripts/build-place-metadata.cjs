/**
 * Builds place-metadata.json by merging several sources (best-effort):
 *
 * 1) data/world-cities*.csv — DataHub-style rows (name, country, subcountry, geonameid), ODbL.
 *    Add world-cities-extra.csv etc. to fill more keys (same columns).
 * 2) GeoNames city dumps (CC-BY-4.0) — tries, in order, cities15000 → cities5000 → cities1000 → cities500
 *    so a smaller file can succeed when a larger download times out; later tiers add more keys / altnames.
 * 3) GeoNames countryInfo.txt — ISO → country name.
 * 4) OpenDataSoft GeoNames API (cities ≥ 1000) — population by geoname id; tries multiple ODS hosts.
 *
 * Run: node scripts/build-place-metadata.cjs
 */
const https = require("https");
const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const DATA_DIR = path.join(ROOT, "data");
const OUT_PATH = path.join(ROOT, "place-metadata.json");
const CACHE = path.join(ROOT, "geonames-cache");
const { normalizeCountry } = require("./city-country-resolver.cjs");

const DOWNLOAD_TIMEOUT_MS = 300000;
const DOWNLOAD_RETRIES = 3;
const RETRY_GAP_MS = 4000;

const GEONAMES_CITY_TIERS = ["cities15000", "cities5000", "cities1000", "cities500"];

const COUNTRY_URLS = [
  "https://download.geonames.org/export/dump/countryInfo.txt",
  "http://download.geonames.org/export/dump/countryInfo.txt"
];

const ODS_RECORD_BASES = [
  "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-1000/records",
  "https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-all-cities-with-a-population-1000%40public/records"
];

function geonamesZipUrls(base) {
  return [
    `https://download.geonames.org/export/dump/${base}.zip`,
    `http://download.geonames.org/export/dump/${base}.zip`
  ];
}

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const getter = url.startsWith("http:") ? http.get : https.get;
    const req = getter(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        const next = new URL(res.headers.location, url).href;
        download(next, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", (err) => {
      try {
        file.close();
      } catch {
        /* ignore */
      }
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function downloadWithRetries(url, dest) {
  let lastErr;
  for (let attempt = 0; attempt < DOWNLOAD_RETRIES; attempt += 1) {
    try {
      await download(url, dest);
      return;
    } catch (e) {
      lastErr = e;
      try {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, RETRY_GAP_MS * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function downloadFirstOk(urls, dest) {
  let lastErr;
  for (const url of urls) {
    try {
      await downloadWithRetries(url, dest);
      return;
    } catch (e) {
      lastErr = e;
      try {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
      } catch {
        /* ignore */
      }
    }
  }
  throw lastErr;
}

function extractZip(zipPath, destDir) {
  try {
    execSync(`tar -xf "${zipPath}"`, { cwd: destDir, stdio: "inherit" });
  } catch {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    lib
      .get(url, { timeout: 90000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const next = new URL(res.headers.location, url).href;
          fetchJson(next).then(resolve).catch(reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchJsonFirstOk(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      return await fetchJson(url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fetchOdsPopulationsByGeonameIds(geonameIds) {
  /** @type {Map<string, number>} */
  const popById = new Map();
  const unique = [...new Set(geonameIds.map(String))];
  const batchSize = 18;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const where = batch.map((id) => `geoname_id=${id}`).join(" OR ");
    const urlVariants = ODS_RECORD_BASES.map(
      (base) => `${base}?where=${encodeURIComponent(where)}&limit=${batch.length}`
    );
    process.stdout.write(`\rOpenDataSoft population: ${Math.min(i + batchSize, unique.length)} / ${unique.length}   `);
    const json = await fetchJsonFirstOk(urlVariants);
    for (const row of json.results || []) {
      const id = String(row.geoname_id);
      const pop = Number(row.population);
      if (Number.isFinite(pop) && pop > 0) {
        popById.set(id, pop);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (unique.length) {
    process.stdout.write("\n");
  }
  return popById;
}

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS from dictionary.js");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function loadCountryNames(countryTxt) {
  const map = {};
  countryTxt.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith("#")) {
      return;
    }
    const cols = line.split("\t");
    const iso = cols[0];
    const name = cols[4];
    if (iso && name) {
      map[iso] = name;
    }
  });
  return map;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }
    if (c === "," && !inQuotes) {
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

function parseWorldCitiesCsv(csvText) {
  /** @type {Map<string, { country: string, geonameId: string }>} */
  const byKey = new Map();
  csvText.split(/\r?\n/).forEach((line, idx) => {
    if (!line || idx === 0) {
      return;
    }
    const parts = splitCsvLine(line);
    if (parts.length < 4) {
      return;
    }
    const geonameid = parts[parts.length - 1];
    if (!/^\d+$/.test(geonameid)) {
      return;
    }
    const country = parts[parts.length - 3];
    const name = parts.slice(0, parts.length - 3).join(",");
    const key = asciiKey(name);
    if (!key) {
      return;
    }
    if (!byKey.has(key)) {
      byKey.set(key, { country, geonameId: geonameid });
    }
  });
  return byKey;
}

function loadMergedWorldCityMaps() {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Missing data directory ${DATA_DIR}`);
  }
  const merged = new Map();
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^world-cities.*\.csv$/i.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`No world-cities*.csv files in ${DATA_DIR}`);
  }
  files.forEach((fname) => {
    const full = path.join(DATA_DIR, fname);
    const chunk = parseWorldCitiesCsv(fs.readFileSync(full, "utf8"));
    let added = 0;
    chunk.forEach((value, key) => {
      if (!merged.has(key)) {
        merged.set(key, value);
        added += 1;
      }
    });
    process.stdout.write(`CSV ${fname}: +${added} new keys (running total ${merged.size}).\n`);
  });
  return merged;
}

function ingestCitiesLine(line, bestByName, countryNames) {
  const cols = line.split("\t");
  if (cols.length < 15) {
    return;
  }
  const name = cols[1];
  const asciiname = cols[2];
  const countryCode = cols[8];
  const population = Number.parseInt(cols[14], 10) || 0;
  const country = countryNames[countryCode] || countryCode;

  const tokens = new Set();
  [name, asciiname].forEach((raw) => {
    const t = asciiKey(raw);
    if (t.length >= 2) {
      tokens.add(t);
    }
  });

  tokens.forEach((key) => {
    const prev = bestByName.get(key);
    if (!prev || population > prev.population) {
      bestByName.set(key, { population, country });
    } else if (prev && population > 0 && prev.population === 0) {
      bestByName.set(key, { population, country: country || prev.country });
    } else if (prev && population === prev.population && country && !prev.country) {
      bestByName.set(key, { ...prev, country });
    }
  });
}

async function ensureCountryInfo(countryPath) {
  if (fs.existsSync(countryPath)) {
    return;
  }
  process.stdout.write("Downloading GeoNames countryInfo.txt …\n");
  await downloadFirstOk(COUNTRY_URLS, countryPath);
}

async function tryIngestGeonamesTier(baseName, geoByKey, countryNames) {
  const zipPath = path.join(CACHE, `${baseName}.zip`);
  const txtPath = path.join(CACHE, `${baseName}.txt`);
  try {
    if (!fs.existsSync(txtPath)) {
      process.stdout.write(`Downloading GeoNames ${baseName}.zip …\n`);
      await downloadFirstOk(geonamesZipUrls(baseName), zipPath);
      process.stdout.write(`Extracting ${baseName}.txt …\n`);
      extractZip(zipPath, CACHE);
    }
    if (!fs.existsSync(txtPath)) {
      throw new Error(`Missing ${txtPath} after extract`);
    }
    const cityData = fs.readFileSync(txtPath, "utf8");
    const before = geoByKey.size;
    let lines = 0;
    cityData.split(/\r?\n/).forEach((line) => {
      if (line) {
        ingestCitiesLine(line, geoByKey, countryNames);
        lines += 1;
      }
    });
    process.stdout.write(
      `GeoNames ${baseName}: ${lines} rows → ${geoByKey.size} keys (+${geoByKey.size - before}).\n`
    );
    return true;
  } catch (e) {
    process.stdout.write(`GeoNames ${baseName} skipped: ${e.message}\n`);
    try {
      if (fs.existsSync(txtPath)) {
        fs.unlinkSync(txtPath);
      }
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    } catch {
      /* ignore */
    }
    return false;
  }
}

(async () => {
  try {
    fs.mkdirSync(CACHE, { recursive: true });

    const fromCsv = loadMergedWorldCityMaps();

    const countryPath = path.join(CACHE, "countryInfo.txt");
    await ensureCountryInfo(countryPath);
    const countryNames = loadCountryNames(fs.readFileSync(countryPath, "utf8"));

    const geoByKey = new Map();
    for (const tier of GEONAMES_CITY_TIERS) {
      await tryIngestGeonamesTier(tier, geoByKey, countryNames);
    }

    const locked = loadLockedWords();
    const geonameIdsForOds = [];
    locked.forEach((word) => {
      const csvHit = fromCsv.get(asciiKey(String(word).toUpperCase()));
      if (csvHit && csvHit.geonameId) {
        geonameIdsForOds.push(csvHit.geonameId);
      }
    });

    let odsPopById = new Map();
    try {
      process.stdout.write("Fetching populations from OpenDataSoft (GeoNames, cities ≥ 1000) …\n");
      odsPopById = await fetchOdsPopulationsByGeonameIds(geonameIdsForOds);
      process.stdout.write(`OpenDataSoft: resolved ${odsPopById.size} geoname ids with population.\n`);
    } catch (e) {
      process.stdout.write(`OpenDataSoft step skipped (${e.message}).\n`);
    }

    const out = {};
    let withPopOds = 0;
    let withPopGeo = 0;
    locked.forEach((word) => {
      const w = String(word).toUpperCase();
      const key = asciiKey(w);
      const csvHit = fromCsv.get(key);
      const geoHit = geoByKey.get(key);
      const country =
        normalizeCountry((csvHit && csvHit.country) || (geoHit && geoHit.country) || "") || null;
      let population = null;
      if (csvHit && csvHit.geonameId) {
        const p = odsPopById.get(String(csvHit.geonameId));
        if (p != null && p > 0) {
          population = p;
          withPopOds += 1;
        }
      }
      if (population == null && geoHit && geoHit.population > 0) {
        population = geoHit.population;
        withPopGeo += 1;
      }
      if (country || population != null) {
        out[w] = {
          country: country || "—",
          population
        };
      }
    });

    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`, "utf8");
    process.stdout.write(
      `Wrote ${OUT_PATH}\n` +
        `  ${Object.keys(out).length} / ${locked.length} entries (country and/or population).\n` +
        `  Population from OpenDataSoft: ${withPopOds}; from GeoNames dumps only: ${withPopGeo}.\n`
    );
  } catch (e) {
    process.stderr.write(`${e.stack || e.message}\n`);
    process.exit(1);
  }
})();
