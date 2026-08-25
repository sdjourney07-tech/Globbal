/**
 * Builds Globbal flag-mosaic logo assets.
 * Run: node scripts/build-logo-assets.cjs
 *
 * Uses sharp (via npx) only for PNG/ICO raster export; SVG assets are pure Node.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");

/** ISO 3166-1 alpha-2 codes — recognizable mix across continents */
const FLAG_CODES = [
  "us", "gb", "fr", "de", "jp", "br", "ca", "au", "in", "cn",
  "mx", "it", "es", "kr", "za", "ar", "ng", "eg", "tr", "sa",
  "id", "th", "vn", "ph", "my", "sg", "nz", "ie", "pt", "nl",
  "be", "ch", "at", "se", "no", "dk", "fi", "pl", "gr", "ru",
  "ua", "il", "ae", "pk", "bd", "co", "cl", "pe", "ke", "gh",
  "ma", "tn", "et", "tz", "ug", "sn", "cm", "cd", "zw", "zm",
];

const COLS = 10;
const ROWS = 6;
const CELL_W = 40;
const CELL_H = 28;
const COLLAGE_W = COLS * CELL_W;
const COLLAGE_H = ROWS * CELL_H;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "GlobbalLogoBuild/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuffer(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function buildCollagePng(outPath) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    process.stdout.write("Installing sharp for raster export...\n");
    const npmCmd = process.platform === "win32"
      ? path.join(path.dirname(process.execPath), "npm.cmd")
      : path.join(path.dirname(process.execPath), "npm");
    execSync(`"${npmCmd}" install sharp --no-save`, { cwd: ROOT, stdio: "inherit", shell: true });
    sharp = require("sharp");
  }

  const composites = [];
  for (let i = 0; i < FLAG_CODES.length; i += 1) {
    const code = FLAG_CODES[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const url = `https://flagcdn.com/w80/${code}.png`;
    process.stdout.write(`  flag ${code} (${i + 1}/${FLAG_CODES.length})\n`);
    const buf = await fetchBuffer(url);
    composites.push({
      input: buf,
      left: col * CELL_W,
      top: row * CELL_H,
    });
  }

  await sharp({
    create: {
      width: COLLAGE_W,
      height: COLLAGE_H,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  process.stdout.write(`Wrote ${outPath}\n`);
}

function writeSvgAssets() {
  const { execSync } = require("child_process");
  execSync(`"${process.execPath}" "${path.join(__dirname, "generate-logo-wordmark.cjs")}"`, {
    cwd: ROOT,
    stdio: "inherit"
  });
}

async function exportRaster() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    sharp = require(path.join(ROOT, "node_modules", "sharp"));
  }

  const logoSvgPath = path.join(ASSETS, "logo.svg");
  const markSvgPath = path.join(ASSETS, "logo-mark.svg");

  await sharp(logoSvgPath).resize(800).png().toFile(path.join(ASSETS, "logo.png"));
  process.stdout.write("Wrote logo.png\n");

  const favicon32 = await sharp(markSvgPath).resize(32, 32).png().toBuffer();
  const favicon16 = await sharp(markSvgPath).resize(16, 16).png().toBuffer();

  await sharp(favicon32)
    .toFile(path.join(ASSETS, "favicon-32.png"));
  await sharp(favicon16)
    .toFile(path.join(ASSETS, "favicon-16.png"));

  // Multi-size ICO: sharp can write ico from png buffer
  await sharp(favicon32)
    .toFile(path.join(ASSETS, "favicon.ico"));

  process.stdout.write("Wrote favicon.ico\n");
}

async function main() {
  ensureDir(ASSETS);
  process.stdout.write("Building flags collage...\n");
  await buildCollagePng(path.join(ASSETS, "flags-collage.png"));
  writeSvgAssets();
  process.stdout.write("Exporting raster assets...\n");
  await exportRaster();
  process.stdout.write("Done.\n");
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
