/**
 * Adds mountain ranges, mountains (>= 1500 ft), and hills to LOCKED_WORDS and place-metadata.json.
 *
 * Sources:
 *  - data/world-mountain-ranges.json (curated ranges)
 *  - GeoNames allCountries.txt (feature class T; CC-BY-4.0)
 *
 * Run: node scripts/add-mountains-to-dictionary.cjs
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "dictionary.js");
const META_PATH = path.join(ROOT, "place-metadata.json");
const RANGES_PATH = path.join(ROOT, "data", "world-mountain-ranges.json");
const CACHE = path.join(ROOT, "geonames-cache");
const COUNTRY_INFO_PATH = path.join(CACHE, "countryInfo.txt");
const ALL_COUNTRIES_ZIP = path.join(CACHE, "allCountries.zip");
const ALL_COUNTRIES_TXT = path.join(CACHE, "allCountries.txt");
const { compactWord, displayWord, isPlayableDictionaryWord } = require(path.join(ROOT, "dictionary-keys.js"));
const { normalizeCountry } = require("./city-country-resolver.cjs");

const MIN_ELEVATION_FT = 1500;
const MIN_ELEVATION_M = Math.round(MIN_ELEVATION_FT * 0.3048);
const PEAK_FEATURE_CODES = new Set(["MT", "PK", "PKS"]);
const DOWNLOAD_TIMEOUT_MS = 300000;

function geonamesZipUrls(base) {
  return [
    `https://download.geonames.org/export/dump/${base}.zip`,
    `http://download.geonames.org/export/dump/${base}.zip`
  ];
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const getter = url.startsWith("http:") ? http.get : https.get;
    const req = getter(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        download(new URL(res.headers.location, url).href, dest).then(resolve).catch(reject);
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

async function downloadFirstOk(urls, dest) {
  let lastErr;
  for (const url of urls) {
    try {
      await download(url, dest);
      return;
    } catch (err) {
      lastErr = err;
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

async function ensureAllCountriesTxt() {
  if (fs.existsSync(ALL_COUNTRIES_TXT)) {
    return;
  }
  if (!fs.existsSync(CACHE)) {
    fs.mkdirSync(CACHE, { recursive: true });
  }
  if (!fs.existsSync(ALL_COUNTRIES_ZIP)) {
    process.stdout.write("Downloading GeoNames allCountries.zip…\n");
    await downloadFirstOk(geonamesZipUrls("allCountries"), ALL_COUNTRIES_ZIP);
  }
  process.stdout.write("Extracting allCountries.txt…\n");
  extractZip(ALL_COUNTRIES_ZIP, CACHE);
  if (!fs.existsSync(ALL_COUNTRIES_TXT)) {
    throw new Error("allCountries.txt missing after extract");
  }
}

function loadLockedWords() {
  const src = fs.readFileSync(DICT_PATH, "utf8");
  const m = src.match(/const LOCKED_WORDS = (\[[\s\S]*\]);/);
  if (!m) {
    throw new Error("Could not parse LOCKED_WORDS");
  }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function loadCountryNames() {
  const map = {};
  if (!fs.existsSync(COUNTRY_INFO_PATH)) {
    return map;
  }
  fs.readFileSync(COUNTRY_INFO_PATH, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) {
        return;
      }
      const cols = line.split("\t");
      if (cols[0] && cols[4]) {
        map[cols[0]] = normalizeCountry(cols[4]);
      }
    });
  return map;
}

function loadCountryKeys() {
  const keys = new Set();
  if (!fs.existsSync(COUNTRY_INFO_PATH)) {
    return keys;
  }
  fs.readFileSync(COUNTRY_INFO_PATH, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) {
        return;
      }
      const cols = line.split("\t");
      if (cols[4]) {
        keys.add(compactWord(cols[4]));
      }
      if (cols[1] && cols[1].length === 3) {
        keys.add(compactWord(cols[1]));
      }
    });
  return keys;
}

function parseElevation(cols) {
  const elevation = Number.parseInt(cols[15], 10);
  const dem = Number.parseInt(cols[16], 10);
  const values = [elevation, dem].filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) {
    return null;
  }
  return Math.max(...values);
}

function hasHillName(name) {
  return /\bHILL(S)?\b/.test(displayWord(name));
}

function isRangeName(name) {
  const upper = displayWord(name);
  return (
    /\bRANGE\b/.test(upper) ||
    /\bMOUNTAINS\b/.test(upper) ||
    /\bMOUNTAIN RANGE\b/.test(upper)
  );
}

function classifyGeoname(name, featureCode, elevationM) {
  if (featureCode === "MTS" || isRangeName(name)) {
    return "mountainRange";
  }
  if (hasHillName(name)) {
    return "hill";
  }
  if (PEAK_FEATURE_CODES.has(featureCode) && elevationM != null && elevationM >= MIN_ELEVATION_M) {
    return "mountain";
  }
  return null;
}

function isProtectedEntry(meta) {
  if (!meta) {
    return false;
  }
  return (
    meta.kind === "country" ||
    meta.kind === "state" ||
    meta.kind === "county" ||
    meta.kind === "shire" ||
    meta.kind === "river" ||
    ["ocean", "sea", "bay", "gulf", "bight"].includes(meta.kind)
  );
}

function isCityEntry(meta) {
  if (!meta || !meta.country || isProtectedEntry(meta)) {
    return false;
  }
  if (meta.kind === "mountain" || meta.kind === "mountainRange" || meta.kind === "hill") {
    return false;
  }
  return meta.population != null && Number(meta.population) > 0;
}

function upsertCandidate(map, candidate) {
  if (!isPlayableDictionaryWord(candidate.word)) {
    return;
  }
  const key = compactWord(candidate.word);
  if (!key || key.length < 2) {
    return;
  }
  const prev = map.get(key);
  if (!prev) {
    map.set(key, candidate);
    return;
  }
  const prevElev = prev.elevationM || 0;
  const nextElev = candidate.elevationM || 0;
  if (nextElev > prevElev) {
    map.set(key, candidate);
  }
}

async function ingestGeonameMountains(countryNames, countryKeys) {
  /** @type {Map<string, { word: string, kind: string, country: string, region: string, elevationM: number|null, featureCode: string }>} */
  const candidates = new Map();
  let scanned = 0;
  let matched = 0;

  const stream = fs.createReadStream(ALL_COUNTRIES_TXT, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) {
      continue;
    }
    scanned += 1;
    if (scanned % 500000 === 0) {
      process.stdout.write(`\rGeoNames rows scanned: ${scanned.toLocaleString()}   `);
    }
    const cols = line.split("\t");
    if (cols[6] !== "T") {
      continue;
    }
    const featureCode = cols[7] || "";
    const elevationM = parseElevation(cols);
    const kind = classifyGeoname(cols[1], featureCode, elevationM);
    if (!kind) {
      continue;
    }
    const word = displayWord(cols[1]);
    const key = compactWord(word);
    if (!word || key.length < 2 || countryKeys.has(key)) {
      continue;
    }
    matched += 1;
    const country = normalizeCountry(countryNames[cols[8]] || cols[8] || "—");
    upsertCandidate(candidates, {
      word,
      kind,
      country,
      region: country,
      elevationM,
      featureCode
    });
  }

  process.stdout.write(`\rGeoNames rows scanned: ${scanned.toLocaleString()}   \n`);
  process.stdout.write(`GeoNames mountain matches: ${matched.toLocaleString()}, unique words: ${candidates.size.toLocaleString()}.\n`);
  return candidates;
}

function ingestCuratedRanges(rows) {
  /** @type {Map<string, { word: string, kind: string, country: string, region: string, elevationM: null, featureCode: string }>} */
  const candidates = new Map();
  rows.forEach((row) => {
    const word = displayWord(row.name);
    const key = compactWord(word);
    if (!word || !key) {
      throw new Error(`Invalid mountain range name: ${row.name}`);
    }
    upsertCandidate(candidates, {
      word,
      kind: "mountainRange",
      country: "—",
      region: row.region || "—",
      elevationM: null,
      featureCode: "RANGE"
    });
  });
  return candidates;
}

async function main() {
  const curatedRows = JSON.parse(fs.readFileSync(RANGES_PATH, "utf8"));
  const countryNames = loadCountryNames();
  const countryKeys = loadCountryKeys();
  const words = loadLockedWords();
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const wordSet = new Set(words);
  const compactToWord = new Map(words.map((word) => [compactWord(word), word]));

  await ensureAllCountriesTxt();
  const geonameCandidates = await ingestGeonameMountains(countryNames, countryKeys);
  const curatedCandidates = ingestCuratedRanges(curatedRows);

  curatedCandidates.forEach((candidate, key) => {
    upsertCandidate(geonameCandidates, candidate);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const kindCounts = { mountainRange: 0, mountain: 0, hill: 0 };

  geonameCandidates.forEach((candidate) => {
    kindCounts[candidate.kind] = (kindCounts[candidate.kind] || 0) + 1;
    const key = compactWord(candidate.word);
    const existingWord = compactToWord.get(key);
    const existingMeta = existingWord ? meta[existingWord] : null;

    if (isProtectedEntry(existingMeta) || isCityEntry(existingMeta)) {
      skipped += 1;
      return;
    }

    if (!wordSet.has(candidate.word)) {
      wordSet.add(candidate.word);
      compactToWord.set(key, candidate.word);
      added += 1;
    }

    const elevationFt =
      candidate.elevationM != null ? Math.round(candidate.elevationM * 3.28084) : null;

    meta[candidate.word] = {
      kind: candidate.kind,
      country: candidate.country,
      region: candidate.region,
      elevationM: candidate.elevationM,
      elevationFt,
      featureCode: candidate.featureCode
    };
    updated += 1;

    if (existingWord && existingWord !== candidate.word && meta[existingWord]) {
      delete meta[existingWord];
    }
  });

  const mergedWords = Array.from(wordSet).sort((a, b) => a.localeCompare(b));

  fs.writeFileSync(DICT_PATH, `const LOCKED_WORDS = ${JSON.stringify(mergedWords)};\n`, "utf8");
  fs.writeFileSync(META_PATH, `${JSON.stringify(meta)}\n`, "utf8");

  process.stdout.write(
    `Mountains: ${geonameCandidates.size} unique entries (${added} new words, ${updated} metadata, ${skipped} skipped city/conflicts).\n` +
      `  mountainRange: ${kindCounts.mountainRange || 0}\n` +
      `  mountain: ${kindCounts.mountain || 0}\n` +
      `  hill: ${kindCounts.hill || 0}\n` +
      `Threshold: peaks >= ${MIN_ELEVATION_FT} ft (${MIN_ELEVATION_M} m); all named hills included.\n` +
      `Dictionary total: ${mergedWords.length} words.\n`
  );
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
