"use strict";

/**
 * Remove mountain / hill / mountainRange words from dictionary + metadata + categories.
 * Usage: node scripts/strip-mountains-hills.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const LANDFORM_KINDS = new Set(["mountain", "hill", "mountainRange"]);
const LANDFORM_CATEGORY_KEYS = new Set(["mountainRanges", "landforms"]);

function loadLockedWords(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  return new Function(`${src}; return LOCKED_WORDS;`)();
}

function writeLockedWords(filePath, words) {
  fs.writeFileSync(filePath, `const LOCKED_WORDS = ${JSON.stringify(words)};\n`, "utf8");
}

function isLandformMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return false;
  }
  if (LANDFORM_KINDS.has(meta.kind)) {
    return true;
  }
  return false;
}

function stripPair({
  dictPath,
  metaPath,
  categoriesPath,
  aliasSourcesPath,
  label
}) {
  const words = loadLockedWords(dictPath);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const categories = JSON.parse(fs.readFileSync(categoriesPath, "utf8"));

  const remove = new Set();

  for (const [key, value] of Object.entries(meta)) {
    if (isLandformMeta(value)) {
      remove.add(key);
    }
  }

  for (const catKey of LANDFORM_CATEGORY_KEYS) {
    const list = categories[catKey];
    if (Array.isArray(list)) {
      list.forEach((w) => remove.add(w));
    }
  }

  const keptWords = words.filter((w) => !remove.has(w));
  const keptMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!remove.has(key) && !isLandformMeta(value)) {
      keptMeta[key] = value;
    }
  }

  const keptCategories = {};
  for (const [catKey, list] of Object.entries(categories)) {
    if (LANDFORM_CATEGORY_KEYS.has(catKey)) {
      continue;
    }
    if (!Array.isArray(list)) {
      keptCategories[catKey] = list;
      continue;
    }
    keptCategories[catKey] = list.filter((w) => !remove.has(w));
  }

  writeLockedWords(dictPath, keptWords);
  fs.writeFileSync(metaPath, JSON.stringify(keptMeta), "utf8");
  fs.writeFileSync(categoriesPath, JSON.stringify(keptCategories), "utf8");

  if (aliasSourcesPath && fs.existsSync(aliasSourcesPath)) {
    const { collectAliasSourceWords } = require("../dictionary-keys.js");
    const aliasSources = collectAliasSourceWords(keptWords, keptMeta);
    fs.writeFileSync(
      aliasSourcesPath,
      `const DICTIONARY_ALIAS_SOURCE_WORDS = ${JSON.stringify(aliasSources)};\n`,
      "utf8"
    );
  }

  const dictMb = (fs.statSync(dictPath).size / 1024 / 1024).toFixed(2);
  const metaMb = (fs.statSync(metaPath).size / 1024 / 1024).toFixed(2);
  console.log(
    `[${label}] removed ${remove.size} words; kept ${keptWords.length} words, ${
      Object.keys(keptMeta).length
    } metadata. Files: dictionary ${dictMb} MB, metadata ${metaMb} MB`
  );
}

stripPair({
  dictPath: path.join(ROOT, "dictionary.js"),
  metaPath: path.join(ROOT, "place-metadata.json"),
  categoriesPath: path.join(ROOT, "dictionary-categories.json"),
  aliasSourcesPath: path.join(ROOT, "dictionary-alias-sources.js"),
  label: "modern"
});

stripPair({
  dictPath: path.join(ROOT, "dictionary-ancient.js"),
  metaPath: path.join(ROOT, "place-metadata-ancient.json"),
  categoriesPath: path.join(ROOT, "dictionary-categories-ancient.json"),
  aliasSourcesPath: path.join(ROOT, "dictionary-alias-sources-ancient.js"),
  label: "ancient"
});

console.log("Done.");
