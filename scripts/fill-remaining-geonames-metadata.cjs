/**
 * Fills remaining dictionary gaps in place-metadata.json using the GeoNames
 * web service (accurate source; same DB as the dumps / ODS mirror).
 *
 * Phase 1 — getJSON by geonameId when data/world-cities*.csv maps the word.
 * Phase 2 — searchJSON (featureClass=P) for words still missing country or population.
 *
 * Requires a free GeoNames account:
 *   https://www.geonames.org/login
 * Enable the free web API on your account page, then:
 *
 *   set GEONAMES_USERNAME=your_username
 *   node scripts/fill-remaining-geonames-metadata.cjs
 *
 * Optional:
 *   GEONAMES_DELAY_MS   default 4000 (stay under free hourly limits)
 *   GEONAMES_MAX_WORDS  cap how many API-backed words to process (debug)
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const DATA_DIR = path.join(ROOT, "data");
const CACHE_PATH = path.join(ROOT, "geonames-ws-cache.json");
const COUNTRY_INFO = path.join(ROOT, "geonames-cache", "countryInfo.txt");

const BASE = "https://secure.geonames.org";
const DELAY_MS = Math.max(500, Number(process.env.GEONAMES_DELAY_MS || 4000));
const MAX_WORDS = process.env.GEONAMES_MAX_WORDS
  ? Math.max(1, Number(process.env.GEONAMES_MAX_WORDS))
  : Infinity;

const USERNAME = process.env.GEONAMES_USERNAME || "";

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
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

function parsePop(pop) {
  if (pop == null) return NaN;
  const cleaned = String(pop)
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return n;
}

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*?\]);/);
  if (!m) throw new Error("Could not parse LOCKED_WORDS from dictionary.js");
  // eslint-disable-next-line no-eval
  return eval(m[1]).map((w) => String(w).toUpperCase());
}

function loadWordToGeonameId() {
  const map = new Map();
  if (!fs.existsSync(DATA_DIR)) return map;
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^world-cities.*\.csv$/i.test(f))
    .sort();
  for (const fname of files) {
    const full = path.join(DATA_DIR, fname);
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const parts = splitCsvLine(line);
      if (parts.length < 4) continue;
      const geonameid = parts[parts.length - 1];
      if (!/^\d+$/.test(geonameid)) continue;
      const name = parts.slice(0, parts.length - 3).join(",");
      const key = asciiKey(name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, geonameid);
    }
  }
  return map;
}

function loadCountryNameToIso2() {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!fs.existsSync(COUNTRY_INFO)) return map;
  fs.readFileSync(COUNTRY_INFO, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) return;
      const cols = line.split("\t");
      const iso = cols[0];
      const name = cols[4];
      if (iso && name) map.set(name.trim().toLowerCase(), iso);
    });
  return map;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 60000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function normalizeCountryHint(name) {
  if (!name) return null;
  const n = String(name).trim();
  if (!n || n === "—") return null;
  if (n === "Russia") return "russian federation";
  if (n === "Iran") return "iran, islamic republic of";
  if (n === "Iraq") return "iraq";
  return n.toLowerCase();
}

function pickIsoFromCountryName(countryName, nameToIso) {
  const hint = normalizeCountryHint(countryName);
  if (!hint) return null;
  let iso = nameToIso.get(hint);
  if (iso) return iso;
  for (const [k, v] of nameToIso) {
    if (k.includes(hint) || hint.includes(k)) return v;
  }
  return null;
}

function pickBestGeoname(word, rows, expectedCountryName, nameToIso) {
  if (!rows || !rows.length) return null;
  const nk = asciiKey(word);
  const exact = rows.filter(
    (r) =>
      asciiKey(r.toponymName || "") === nk ||
      asciiKey(r.name || "") === nk ||
      asciiKey(r.asciiName || "") === nk
  );
  let pool = exact.length ? exact : rows;
  const iso = pickIsoFromCountryName(expectedCountryName, nameToIso);
  if (iso) {
    const biased = pool.filter((r) => String(r.countryCode || "").toUpperCase() === iso);
    if (biased.length) pool = biased;
  }
  pool = [...pool].sort(
    (a, b) => (Number(b.population) || 0) - (Number(a.population) || 0)
  );
  return pool[0] || null;
}

function applyGeonameToMeta(meta, word, g) {
  if (!g) return false;
  const country = g.countryName || null;
  const pop = Number(g.population);
  const next = { ...(meta[word] || {}) };
  let changed = false;
  if (country && String(country).trim()) {
    if (!next.country || next.country === "—") {
      next.country = country.trim();
      changed = true;
    }
  }
  if (Number.isFinite(pop) && pop > 0) {
    if (next.population == null || parsePop(next.population) <= 0) {
      next.population = pop;
      changed = true;
    }
  }
  if (changed) meta[word] = next;
  return changed;
}

async function main() {
  if (!USERNAME) {
    process.stderr.write(
      "Set GEONAMES_USERNAME to your GeoNames account (free).\n" +
        "Register at https://www.geonames.org/login and enable the web API.\n"
    );
    process.exit(1);
  }

  const words = loadLockedWords();
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const wordToGeoname = loadWordToGeonameId();
  const nameToIso = loadCountryNameToIso2();

  /** @type {Record<string, unknown>} */
  let cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    } catch {
      cache = {};
    }
  }

  const needsWork = (w) => {
    const o = meta[w];
    const countryOk =
      o && typeof o.country === "string" && o.country.trim() && o.country.trim() !== "—";
    const popOk = o ? Number.isFinite(parsePop(o.population)) && parsePop(o.population) > 0 : false;
    return !o || !countryOk || !popOk;
  };

  const targets = words.filter(needsWork);
  console.log(`Words needing metadata: ${targets.length} (will cap at ${MAX_WORDS} if set).`);

  let apiCalls = 0;
  let updated = 0;
  let processed = 0;

  const saveCache = () => {
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache)}\n`, "utf8");
  };

  const saveMeta = () => {
    fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");
  };

  for (const word of targets) {
    if (processed >= MAX_WORDS) break;
    processed += 1;

    const cacheKey = `word:${word}`;
    if (cache[cacheKey]) {
      if (applyGeonameToMeta(meta, word, cache[cacheKey])) updated += 1;
      continue;
    }

    const gid = wordToGeoname.get(word);
    if (gid) {
      const idKey = `id:${gid}`;
      let g = cache[idKey];
      if (!g) {
        const url = `${BASE}/getJSON?geonameId=${encodeURIComponent(gid)}&username=${encodeURIComponent(
          USERNAME
        )}`;
        apiCalls += 1;
        try {
          const json = await httpsGetJson(url);
          if (json.status) {
            process.stdout.write(`get ${word} (${gid}): ${JSON.stringify(json.status)}\n`);
          } else {
            g = json;
            cache[idKey] = g;
            cache[cacheKey] = g;
            saveCache();
          }
        } catch (err) {
          process.stdout.write(`get ${word} (${gid}): ${err.message}\n`);
        }
        await sleep(DELAY_MS);
      } else {
        cache[cacheKey] = g;
      }
      if (g && applyGeonameToMeta(meta, word, g)) updated += 1;
      if (!needsWork(word)) continue;
    }

    if (needsWork(word)) {
      const existing = meta[word];
      const countryHint = existing && existing.country ? existing.country : null;
      const iso = pickIsoFromCountryName(countryHint, nameToIso);
      const tryNames = [];
      if (/^[A-Z]+$/.test(word) && word.length > 1) {
        tryNames.push(
          word.charAt(0) + word.slice(1).toLowerCase(),
          word.toLowerCase(),
          word
        );
      } else {
        tryNames.push(word);
      }
      let chosen = null;
      for (const nm of tryNames) {
        const params = new URLSearchParams({
          name_equals: nm,
          featureClass: "P",
          maxRows: "20",
          username: USERNAME
        });
        if (iso) params.set("country", iso);
        const url = `${BASE}/searchJSON?${params.toString()}`;
        apiCalls += 1;
        try {
          const json = await httpsGetJson(url);
          if (json.status) {
            process.stdout.write(`search ${word} (${nm}): ${JSON.stringify(json.status)}\n`);
          } else {
            const rows = json.geonames || [];
            chosen = pickBestGeoname(word, rows, countryHint, nameToIso);
          }
        } catch (err) {
          process.stdout.write(`search ${word} (${nm}): ${err.message}\n`);
        }
        await sleep(DELAY_MS);
        if (chosen) break;
      }
      if (!chosen) {
        const params = new URLSearchParams({
          q: word.charAt(0) + word.slice(1).toLowerCase(),
          featureClass: "P",
          maxRows: "25",
          username: USERNAME,
          fuzzy: "0.88"
        });
        if (iso) params.set("countryBias", iso);
        const url = `${BASE}/searchJSON?${params.toString()}`;
        apiCalls += 1;
        try {
          const json = await httpsGetJson(url);
          if (!json.status) {
            const rows = json.geonames || [];
            chosen = pickBestGeoname(word, rows, countryHint, nameToIso);
          }
        } catch (err) {
          process.stdout.write(`search fuzzy ${word}: ${err.message}\n`);
        }
        await sleep(DELAY_MS);
      }
      if (chosen) {
        cache[cacheKey] = chosen;
        if (chosen.geonameId) cache[`id:${chosen.geonameId}`] = chosen;
        saveCache();
        if (applyGeonameToMeta(meta, word, chosen)) updated += 1;
      }
    }

    if (apiCalls > 0 && apiCalls % 20 === 0) saveMeta();
  }

  saveMeta();
  saveCache();
  console.log(`Done. API calls (approx): ${apiCalls}, entries updated this run: ${updated}.`);
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e.message}\n`);
  process.exit(1);
});
