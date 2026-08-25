/**
 * Shared helpers for resolving city countries without GeoNames alternate-name collisions.
 */
const fs = require("fs");
const path = require("path");
const { compactWord } = require("../dictionary-keys.js");

const COUNTRY_ALIASES = {
  "Côte d'Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  "Russian Federation": "Russia",
  "United States of America": "United States",
  Netherlands: "The Netherlands",
  "Iran, Islamic Republic of": "Iran",
  "Korea, Republic of": "South Korea",
  "Korea, Democratic People's Republic of": "North Korea",
  "Congo, The Democratic Republic of the": "Democratic Republic of the Congo",
  "Bolivia, Plurinational State of": "Bolivia",
  "Moldova, Republic of": "Moldova",
  "Lao People's Democratic Republic": "Laos",
  "Syrian Arab Republic": "Syria",
  "Venezuela, Bolivarian Republic of": "Venezuela",
  "Tanzania, United Republic of": "Tanzania",
  "Micronesia, Federated States of": "Micronesia",
  "Macedonia, The Former Yugoslav Republic of": "North Macedonia",
  "Palestinian Territory": "Palestine"
};

function normalizeCountry(name) {
  if (!name) return "";
  const trimmed = String(name).trim();
  return COUNTRY_ALIASES[trimmed] || trimmed;
}

function countriesMatch(a, b) {
  return normalizeCountry(a).toLowerCase() === normalizeCountry(b).toLowerCase();
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

function loadCountryNames(countryInfoPath) {
  const map = {};
  if (!fs.existsSync(countryInfoPath)) {
    return map;
  }
  fs.readFileSync(countryInfoPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line || line.startsWith("#")) return;
      const cols = line.split("\t");
      if (cols[0] && cols[4]) map[cols[0]] = cols[4];
    });
  return map;
}

function loadCsvByKey(dataDir) {
  const merged = new Map();
  if (!fs.existsSync(dataDir)) return merged;
  fs.readdirSync(dataDir)
    .filter((f) => /^world-cities.*\.csv$/i.test(f))
    .sort()
    .forEach((fname) => {
      fs.readFileSync(path.join(dataDir, fname), "utf8")
        .split(/\r?\n/)
        .forEach((line, idx) => {
          if (!line || idx === 0) return;
          const parts = splitCsvLine(line);
          if (parts.length < 4) return;
          const geonameId = parts[parts.length - 1];
          if (!/^\d+$/.test(geonameId)) return;
          const country = parts[parts.length - 3];
          const name = parts.slice(0, parts.length - 3).join(",");
          const key = compactWord(name);
          if (!key || merged.has(key)) return;
          merged.set(key, { country: normalizeCountry(country), geonameId, name });
        });
    });
  return merged;
}

function loadPrimaryGeoByKey(cacheDir, countryNames) {
  const byKey = new Map();
  ["cities15000", "cities5000", "cities1000", "cities500"].forEach((tier) => {
    const txtPath = path.join(cacheDir, `${tier}.txt`);
    if (!fs.existsSync(txtPath)) return;
    fs.readFileSync(txtPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const cols = line.split("\t");
        if (cols.length < 15) return;
        const rec = {
          country: normalizeCountry(countryNames[cols[8]] || cols[8]),
          population: Number.parseInt(cols[14], 10) || 0,
          name: cols[1]
        };
        [cols[1], cols[2]].forEach((raw) => {
          const key = compactWord(raw);
          if (key.length < 2) return;
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(rec);
        });
      });
  });
  return byKey;
}

function loadGlobalPopIndex(cacheDir, countryNames) {
  const byPop = new Map();
  ["cities15000", "cities5000", "cities1000", "cities500"].forEach((tier) => {
    const txtPath = path.join(cacheDir, `${tier}.txt`);
    if (!fs.existsSync(txtPath)) return;
    fs.readFileSync(txtPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const cols = line.split("\t");
        if (cols.length < 15) return;
        const population = Number.parseInt(cols[14], 10) || 0;
        if (!population) return;
        const rec = {
          country: normalizeCountry(countryNames[cols[8]] || cols[8]),
          population,
          name: cols[1]
        };
        if (!byPop.has(population)) byPop.set(population, []);
        byPop.get(population).push(rec);
      });
  });
  return byPop;
}

function findGlobalPopMatches(pop, popIndex, tolerance = 0.02) {
  const matches = [];
  popIndex.forEach((records, geoPop) => {
    if (Math.abs(geoPop - pop) / pop <= tolerance) {
      matches.push(...records);
    }
  });
  const countries = new Set(matches.map((m) => m.country));
  if (countries.size !== 1) return [];
  return matches;
}

function loadGeonameCountryById(cacheDir, countryNames) {
  const byId = new Map();
  ["cities15000", "cities5000", "cities1000", "cities500"].forEach((tier) => {
    const txtPath = path.join(cacheDir, `${tier}.txt`);
    if (!fs.existsSync(txtPath)) return;
    fs.readFileSync(txtPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const cols = line.split("\t");
        if (cols.length < 15) return;
        byId.set(cols[0], normalizeCountry(countryNames[cols[8]] || cols[8]));
      });
  });
  return byId;
}

function compactKeysSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) diff += 1;
    }
    return diff <= 1;
  }
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  for (let i = 0; i < longer.length; i += 1) {
    const skipLong = longer.slice(0, i) + longer.slice(i + 1);
    if (skipLong === shorter) return true;
    if (i < shorter.length && longer.slice(0, i) + shorter[i] + longer.slice(i + 1) === shorter) {
      return true;
    }
  }
  return false;
}

function getExactPopCountries(pop, popIndex) {
  const matches = popIndex.get(pop) || [];
  const countries = new Set(matches.map((m) => m.country));
  return countries;
}

function resolveCityCountry(word, entry, { csvByKey, geoByKey, popIndex, geonameCountryById }) {
  const key = compactWord(word);
  const pop = Number(entry.population);
  const candidates = geoByKey.get(key) || [];

  if (candidates.length && Number.isFinite(pop) && pop > 0) {
    const popMatches = candidates.filter(
      (c) => c.population && Math.abs(c.population - pop) / pop <= 0.02
    );
    if (popMatches.length) {
      const keep = popMatches.find((c) => countriesMatch(c.country, entry.country));
      const best = keep || popMatches.sort((a, b) => b.population - a.population)[0];
      return best.country;
    }
  }

  if (candidates.length) {
    const inCurrent = candidates.filter((c) => countriesMatch(c.country, entry.country));
    if (inCurrent.length) {
      return normalizeCountry(entry.country);
    }
  }

  const csvHit = csvByKey.get(key);
  if (csvHit && geonameCountryById) {
    const idCountry = geonameCountryById.get(csvHit.geonameId);
    if (idCountry) {
      if (
        !Number.isFinite(pop) ||
        pop <= 0 ||
        !candidates.length ||
        candidates.some(
          (c) =>
            c.population &&
            Math.abs(c.population - pop) / pop <= 0.15 &&
            countriesMatch(c.country, idCountry)
        )
      ) {
        return idCountry;
      }
    } else if (csvHit.country) {
      return csvHit.country;
    }
  }

  if (candidates.length) {
    const countries = new Set(candidates.map((c) => c.country));
    if (countries.size === 1) {
      const onlyCountry = [...countries][0];
      if (!countriesMatch(entry.country, onlyCountry)) {
        const exactCountries =
          Number.isFinite(pop) && pop > 0 && popIndex ? getExactPopCountries(pop, popIndex) : new Set();
        const exactCountry = exactCountries.size === 1 ? [...exactCountries][0] : null;
        const exactMatches =
          Number.isFinite(pop) && pop > 0 && popIndex ? popIndex.get(pop) || [] : [];
        const maxCandPop = Math.max(...candidates.map((c) => c.population || 0));
        const popRatio = maxCandPop > 0 ? pop / maxCandPop : Infinity;
        const exactSupportsCurrent =
          exactCountry && countriesMatch(entry.country, exactCountry);
        const exactNameSimilar = exactMatches.some((m) =>
          compactKeysSimilar(compactWord(m.name), key)
        );

        if (exactSupportsCurrent && (popRatio > 20 || exactNameSimilar)) {
          // Listed population identifies the current country.
        } else if (
          exactSupportsCurrent &&
          !countriesMatch(onlyCountry, exactCountry) &&
          popRatio < 15
        ) {
          return onlyCountry;
        } else if (!exactSupportsCurrent) {
          const closeToCandidate =
            Number.isFinite(pop) && pop > 0 && maxCandPop > 0
              ? Math.abs(maxCandPop - pop) / pop <= 0.15
              : false;
          if (closeToCandidate) {
            return onlyCountry;
          }
          if (
            maxCandPop >= 100000 &&
            !candidates.some((c) => countriesMatch(c.country, entry.country))
          ) {
            return onlyCountry;
          }
        }
      }
    }
  }

  if (Number.isFinite(pop) && pop > 0 && popIndex) {
    const exactCountries = getExactPopCountries(pop, popIndex);
    if (exactCountries.size === 1) {
      const exactCountry = [...exactCountries][0];
      if (countriesMatch(entry.country, exactCountry)) {
        return normalizeCountry(entry.country);
      }
      if (!countriesMatch(entry.country, exactCountry)) {
        const maxCandPop = candidates.length
          ? Math.max(...candidates.map((c) => c.population || 0))
          : 0;
        if (!candidates.length || maxCandPop < pop * 0.15) {
          return exactCountry;
        }
      }
    }
  }

  if (Number.isFinite(pop) && pop > 0 && popIndex) {
    const globalMatches = findGlobalPopMatches(pop, popIndex);
    if (globalMatches.length >= 1) {
      const currentMatches = globalMatches.filter((m) => countriesMatch(m.country, entry.country));
      if (currentMatches.length >= 1 && currentMatches.length === globalMatches.length) {
        return normalizeCountry(entry.country);
      }
    }
  }

  if (Number.isFinite(pop) && pop > 0 && popIndex) {
    const globalMatches = findGlobalPopMatches(pop, popIndex);
    if (globalMatches.length === 1) {
      const gCountry = globalMatches[0].country;
      if (!countriesMatch(entry.country, gCountry)) {
        const maxCandPop = candidates.length
          ? Math.max(...candidates.map((c) => c.population || 0))
          : 0;
        if (!candidates.length || pop / Math.max(maxCandPop, 1) > 50) {
          return gCountry;
        }
      }
    }
  }

  return null;
}

function createCityCountryResolver(root) {
  const dataDir = path.join(root, "data");
  const cacheDir = path.join(root, "geonames-cache");
  const countryNames = loadCountryNames(path.join(cacheDir, "countryInfo.txt"));
  const ctx = {
    csvByKey: loadCsvByKey(dataDir),
    geoByKey: loadPrimaryGeoByKey(cacheDir, countryNames),
    popIndex: loadGlobalPopIndex(cacheDir, countryNames),
    geonameCountryById: loadGeonameCountryById(cacheDir, countryNames)
  };
  return {
    ...ctx,
    resolveCityCountry(word, entry) {
      return resolveCityCountry(word, entry, ctx);
    }
  };
}

module.exports = {
  COUNTRY_ALIASES,
  normalizeCountry,
  countriesMatch,
  splitCsvLine,
  createCityCountryResolver,
  resolveCityCountry
};
