/**
 * Usage:
 *   node scripts/check-world-cities-key.cjs ABBIGERI
 */
const fs = require("fs");
const path = require("path");

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

function asciiKey(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
}

const word = process.argv[2] || "ABBIGERI";
const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(ROOT, "data", "world-cities.csv");

const csvText = fs.readFileSync(CSV_PATH, "utf8");
const lines = csvText.split(/\r?\n/);

let found = false;
for (let i = 1; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line) continue;
  const parts = splitCsvLine(line);
  if (parts.length < 4) continue;
  // parseWorldCitiesCsv in build-place-metadata:
  // name = parts.slice(0, parts.length - 3).join(",")
  const name = parts.slice(0, parts.length - 3).join(",");
  const key = asciiKey(name);
  if (key === word) {
    console.log({ line: i, row: line });
    found = true;
    break;
  }
}

if (!found) {
  console.log("not found");
}

