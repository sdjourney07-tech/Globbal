/**
 * Backfills missing place-metadata for dictionary words.
 *
 * This uses the OpenDataSoft `exports/csv` endpoint and streams through the
 * dataset once, filling missing dictionary keys as we find matches.
 *
 * Run: node scripts/fill-missing-place-metadata.cjs
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");

const DATASET = "geonames-all-cities-with-a-population-1000";
const CSV_URL = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${DATASET}/exports/csv`;

function normalizeKey(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

function parsePop(pop) {
  if (pop == null) return NaN;
  const str = String(pop);
  const cleaned = str.replace(/,/g, "").replace(/\s+/g, "").trim();
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function splitCsvLine(line, delim) {
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

async function main() {
  const dictSrc = fs.readFileSync(DICT_PATH, "utf8");
  const m = dictSrc.match(/const LOCKED_WORDS = ([\s\S]*?\[[\s\S]*?\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS from dictionary.js");
  }
  // eslint-disable-next-line no-eval
  const words = eval(m[1]);

  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

  /** @type {Map<string, {wantCountry:boolean, wantPop:boolean}>} */
  const missing = new Map();
  for (const w of words) {
    const o = meta[w];
    const countryOk = o && typeof o.country === "string" && o.country.trim() && o.country.trim() !== "—";
    const popOk = o ? Number.isFinite(parsePop(o.population)) && parsePop(o.population) > 0 : false;
    const wantCountry = !countryOk;
    const wantPop = !popOk;
    if (!o || wantCountry || wantPop) {
      missing.set(w, { wantCountry, wantPop });
    }
  }

  console.log(`Missing entries to fill: ${missing.size}.`);
  let filled = 0;
  let lastProgress = Date.now();
  let headerParsed = false;
  let delim = ";";
  let idx = null;

  let buffer = "";
  let lineNo = 0;

  await new Promise((resolve, reject) => {
    const req = https.get(CSV_URL, { timeout: 180000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${CSV_URL}`));
        return;
      }

      res.setEncoding("utf8");

      const processLine = (line) => {
        if (!line || line.trim() === "") return;

        if (!headerParsed) {
          delim = line.includes(";") ? ";" : ",";
          const header = splitCsvLine(line, delim);
          const pick = (colName) => header.indexOf(colName);
          idx = {
            name: pick("name"),
            ascii_name: pick("ascii_name"),
            alternate_names: pick("alternate_names"),
            cou_name_en: pick("cou_name_en"),
            population: pick("population")
          };
          for (const k of Object.keys(idx)) {
            if (idx[k] === -1) {
              throw new Error(`Missing expected CSV column: ${k}`);
            }
          }
          headerParsed = true;
          return;
        }

        if (!idx) return;

        const cols = splitCsvLine(line, delim);
        const name = idx.name >= 0 ? cols[idx.name] : "";
        const asciiName = idx.ascii_name >= 0 ? cols[idx.ascii_name] : "";
        const alt = idx.alternate_names >= 0 ? cols[idx.alternate_names] : null;
        const country = idx.cou_name_en >= 0 ? cols[idx.cou_name_en] : null;
        const population = parsePop(idx.population >= 0 ? cols[idx.population] : null);

        const candidates = new Set();
        candidates.add(normalizeKey(name));
        candidates.add(normalizeKey(asciiName));
        if (alt) {
          String(alt)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => candidates.add(normalizeKey(s)));
        }

        for (const key of candidates) {
          const wants = missing.get(key);
          if (!wants) continue;

          const next = meta[key] || {};
          if (wants.wantCountry && country && country.trim()) next.country = country.trim();
          if (wants.wantPop && Number.isFinite(population) && population > 0)
            next.population = population;

          meta[key] = next;
          missing.delete(key);
          filled += 1;
          if (missing.size === 0) break;
        }

        lineNo += 1;
        const now = Date.now();
        if (now - lastProgress > 10000) {
          lastProgress = now;
          console.log(`Progress: filled=${filled}, remaining=${missing.size}, lines=${lineNo}`);
        }
      };

      res.on("data", (chunk) => {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          processLine(line);

          if (missing.size === 0) {
            res.destroy();
            break;
          }
        }
      });

      res.on("close", () => resolve());
      res.on("error", reject);
    });

    req.on("error", reject);
  });

  fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");
  console.log(`Done. filled=${filled}, remaining=${missing.size}.`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

