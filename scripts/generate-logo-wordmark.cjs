/**
 * Generate path-based logo SVGs from the nautical wordmark font.
 * Produces per-letter vector groups for CSS/SVG editing, plus bone-style exports.
 * Run: node scripts/generate-logo-wordmark.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const FONT_PATH = path.join(ASSETS, "fonts", "im-fell-english-sc.woff");
const WORDMARK = "GLOBBAL";
const ALT_WORDMARKS = [{ word: "GLOBBLE", fileName: "logo-wordmark-globble.svg" }];
const MARK = "G";
const MACRON_LETTER_INDEX = 2;
const O_LETTER_SCALE = 0.84;
const SMALL_LETTER_SCALE = 0.82;
const SMALL_LETTER_INDICES = new Set([1, 3, 4, 5, 6]);
const MACRON_WIDTH_FACTOR = 0.72;

const HTML_TARGETS = [
  path.join(ROOT, "splash.html"),
  path.join(ROOT, "index.html"),
  path.join(ROOT, "logo-word-preview.html"),
  path.join(ROOT, "practice.html"),
  path.join(ROOT, "practice-ancient.html"),
  path.join(ROOT, "game-online.html"),
];

const MARKER_START = "<!-- logo-wordmark:start -->";
const MARKER_END = "<!-- logo-wordmark:end -->";

function loadFont() {
  if (!fs.existsSync(FONT_PATH)) {
    throw new Error(`Missing font: ${FONT_PATH}`);
  }
  return opentype.parse(fs.readFileSync(FONT_PATH));
}

function buildWordmarkPaths(font, text, fontSize) {
  const pathObj = font.getPath(text, 0, 0, fontSize);
  const bbox = pathObj.getBoundingBox();
  return {
    pathData: pathObj.toPathData(2),
    bbox,
    width: bbox.x2 - bbox.x1,
    height: bbox.y2 - bbox.y1,
  };
}

function letterScale(index) {
  if (index === MACRON_LETTER_INDEX) return O_LETTER_SCALE;
  if (SMALL_LETTER_INDICES.has(index)) return SMALL_LETTER_SCALE;
  return 1;
}

function layoutLetters(font, text, fontSize) {
  const scale = fontSize / font.unitsPerEm;
  let cursorX = 0;
  const letters = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const glyph = font.charToGlyph(char);
    const path = glyph.getPath(0, 0, fontSize);
    const bbox = path.getBoundingBox();
    const letterScaleFactor = letterScale(index);
    letters.push({
      char,
      index,
      slug: `${char.toLowerCase()}-${index}`,
      pathData: path.toPathData(2),
      bbox,
      x: cursorX,
      scale: letterScaleFactor,
    });
    cursorX += glyph.advanceWidth * scale * letterScaleFactor;
  }

  return { letters, totalWidth: cursorX };
}

function unionBBox(letters) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;

  for (const letter of letters) {
    const bounds = letterBounds(letter);
    x1 = Math.min(x1, letter.x + bounds.x1);
    y1 = Math.min(y1, bounds.y1);
    x2 = Math.max(x2, letter.x + bounds.x2);
    y2 = Math.max(y2, bounds.y2);
  }

  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

function macronMetrics(bbox) {
  const width = (bbox.x2 - bbox.x1) * MACRON_WIDTH_FACTOR;
  const centerX = (bbox.x1 + bbox.x2) / 2;
  const letterHeight = bbox.y2 - bbox.y1;
  const y = bbox.y1 - letterHeight * 0.18;
  const barHeight = Math.max(letterHeight * 0.105, 5.8);
  const x1 = centerX - width / 2;
  const x2 = centerX + width / 2;
  const r = barHeight / 2;
  return { x1, x2, y, r };
}

function macronPath(bbox) {
  const { x1, x2, y, r } = macronMetrics(bbox);
  const top = y - r;
  const bottom = y + r;
  return [
    `M ${(x1 + r).toFixed(2)} ${top.toFixed(2)}`,
    `L ${(x2 - r).toFixed(2)} ${top.toFixed(2)}`,
    `Q ${x2.toFixed(2)} ${top.toFixed(2)} ${x2.toFixed(2)} ${y.toFixed(2)}`,
    `Q ${x2.toFixed(2)} ${bottom.toFixed(2)} ${(x2 - r).toFixed(2)} ${bottom.toFixed(2)}`,
    `L ${(x1 + r).toFixed(2)} ${bottom.toFixed(2)}`,
    `Q ${x1.toFixed(2)} ${bottom.toFixed(2)} ${x1.toFixed(2)} ${y.toFixed(2)}`,
    `Q ${x1.toFixed(2)} ${top.toFixed(2)} ${(x1 + r).toFixed(2)} ${top.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function scalePoint(x, y, anchorX, anchorY, scale) {
  return [anchorX + (x - anchorX) * scale, anchorY + (y - anchorY) * scale];
}

function letterBounds(letter) {
  const points = [
    [letter.bbox.x1, letter.bbox.y1],
    [letter.bbox.x2, letter.bbox.y2],
  ];

  if (letter.index === MACRON_LETTER_INDEX) {
    const { x1, x2, y, r } = macronMetrics(letter.bbox);
    points.push([x1, y - r], [x2, y + r]);
  }

  const scaleFactor = letter.scale ?? letterScale(letter.index);
  if (scaleFactor !== 1) {
    const anchorX = (letter.bbox.x1 + letter.bbox.x2) / 2;
    const anchorY = letter.bbox.y2;
    const scaled = points.map(([x, y]) => scalePoint(x, y, anchorX, anchorY, scaleFactor));
    const xs = scaled.map(([x]) => x);
    const ys = scaled.map(([, y]) => y);
    return {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
    };
  }

  return {
    x1: letter.bbox.x1,
    y1: Math.min(...points.map(([, y]) => y)),
    x2: letter.bbox.x2,
    y2: letter.bbox.y2,
  };
}

function scaledPathsMarkup(letter, paths) {
  const scaleFactor = letter.scale ?? letterScale(letter.index);
  if (scaleFactor === 1) return paths;

  const anchorX = (letter.bbox.x1 + letter.bbox.x2) / 2;
  const anchorY = letter.bbox.y2;
  const className =
    letter.index === MACRON_LETTER_INDEX ? "logo-letter-o-scaled" : "logo-letter-scaled";
  return `<g class="${className}" transform="translate(${anchorX.toFixed(2)} ${anchorY.toFixed(2)}) scale(${scaleFactor}) translate(${(-anchorX).toFixed(2)} ${(-anchorY).toFixed(2)})">
        ${paths}
      </g>`;
}

function letterPathsMarkup(letter) {
  const macron =
    letter.index === MACRON_LETTER_INDEX
      ? `\n        <path class="logo-letter-fill logo-letter-macron" d="${macronPath(letter.bbox)}" />`
      : "";
  const paths = `<path class="logo-letter-fill" d="${letter.pathData}" />${macron}`;
  return scaledPathsMarkup(letter, paths);
}

function wordmarkLabel(word) {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

function buildEditableWordmarkSvg({ letters, padX, padY, strokeWidth, label = "Globbal" }) {
  const bbox = unionBBox(letters);
  const viewWidth = Math.ceil(bbox.width + padX * 2);
  const viewHeight = Math.ceil(bbox.height + padY * 2);
  const rootTx = padX - bbox.x1;
  const rootTy = padY - bbox.y1;

  const letterGroups = letters
    .map((letter) => {
      return `    <g
      class="logo-letter logo-letter-${letter.slug}"
      data-letter="${letter.char}"
      data-index="${letter.index}"
      transform="translate(${(rootTx + letter.x).toFixed(2)} ${rootTy.toFixed(2)})"
    >
      ${letterPathsMarkup(letter)}
    </g>`;
    })
    .join("\n");

  const lastLetter = letters[letters.length - 1];
  const lastBounds = letterBounds(lastLetter);
  const tmX = rootTx + lastLetter.x + lastBounds.x2;
  const tmY = rootTy + lastBounds.y1 - 1.5;
  const tmSize = Math.max(9.5, (lastBounds.y2 - lastBounds.y1) * 0.155);

  return `<svg
  class="logo-wordmark"
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${viewWidth} ${viewHeight}"
  role="img"
  aria-label="${label}"
>
  <g class="logo-wordmark-letters">
${letterGroups}
  </g>
  <text
    class="logo-wordmark-tm"
    x="${tmX.toFixed(2)}"
    y="${tmY.toFixed(2)}"
    text-anchor="end"
    font-size="${tmSize.toFixed(2)}"
  >TM</text>
</svg>`;
}

function boneDefs() {
  return `    <linearGradient id="boneBody" gradientUnits="objectBoundingBox" x1="0.08" y1="0" x2="0.92" y2="1">
      <stop offset="0%" stop-color="#fff8ea"/>
      <stop offset="24%" stop-color="#e8d5b3"/>
      <stop offset="58%" stop-color="#c9ad7f"/>
      <stop offset="100%" stop-color="#8f7048"/>
    </linearGradient>
    <linearGradient id="boneHighlight" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fffdf7" stop-opacity="0.95"/>
      <stop offset="42%" stop-color="#fffdf7" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#fffdf7" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="boneShadow" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a1a0f" stop-opacity="0"/>
      <stop offset="68%" stop-color="#2a1a0f" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2a1a0f" stop-opacity="0.5"/>
    </linearGradient>
    <linearGradient id="boneExtrude" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5c4630"/>
      <stop offset="100%" stop-color="#2a1a0f"/>
    </linearGradient>`;
}

function svgFromPaths({
  text,
  pathData,
  viewWidth,
  viewHeight,
  translateX,
  translateY,
  strokeWidth,
}) {
  const extrude = Math.max(1.2, strokeWidth * 0.85);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" role="img" aria-label="${text}">
  <defs>
${boneDefs()}
  </defs>
  <g transform="translate(${translateX.toFixed(2)} ${translateY.toFixed(2)})">
    <path
      d="${pathData}"
      transform="translate(${extrude.toFixed(2)} ${extrude.toFixed(2)})"
      fill="url(#boneExtrude)"
    />
    <path
      d="${pathData}"
      fill="url(#boneBody)"
      stroke="#2a1a0f"
      stroke-width="${strokeWidth}"
      stroke-linejoin="round"
      stroke-linecap="round"
      paint-order="stroke fill"
    />
    <path d="${pathData}" fill="url(#boneHighlight)" stroke="none" opacity="0.9"/>
    <path d="${pathData}" fill="url(#boneShadow)" stroke="none" opacity="0.85"/>
  </g>
</svg>
`;
}

function buildLogoCss(strokeWidth) {
  return `@font-face {
  font-family: "Globbal Nautical";
  src: url("./im-fell-english-sc.woff") format("woff");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

.logo-wordmark-wrap {
  margin: 0;
  line-height: 0;
}

.logo-wordmark {
  display: block;
  width: min(408px, 94vw);
  height: auto;
  overflow: visible;
}

.logo-wordmark-letters {
  filter:
    drop-shadow(0 -1px 0 rgba(255, 248, 234, 0.95))
    drop-shadow(1px 2px 0 rgba(100, 0, 0, 0.95))
    drop-shadow(2px 3px 0 rgba(65, 0, 0, 0.9))
    drop-shadow(0 4px 10px rgba(40, 0, 0, 0.32));
}

.logo-letter {
  transform-box: fill-box;
  transform-origin: center bottom;
}

.logo-letter-fill {
  fill: #8b0000;
  stroke: #4a0000;
  stroke-width: ${strokeWidth};
  stroke-linejoin: round;
  stroke-linecap: round;
  paint-order: stroke fill;
}

.logo-wordmark-tm {
  fill: #000;
  font-family: "Segoe UI", Inter, system-ui, sans-serif;
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* Examples — tweak any letter independently:
.logo-letter-o-2 .logo-letter-o-scaled { transform: scale(0.84); }
.logo-letter[data-index="3"] { transform: translateY(-2px); }
*/
`;
}

function buildWordmarkVariant(font, word, logoSize, strokeWidth) {
  const { letters } = layoutLetters(font, word, logoSize);
  return buildEditableWordmarkSvg({
    letters,
    padX: 14,
    padY: 10,
    strokeWidth,
    label: wordmarkLabel(word),
  });
}

function buildWordmarkPreviewHtml(word, svgMarkup) {
  const label = wordmarkLabel(word);
  const indentedSvg = svgMarkup
    .split("\n")
    .map((line) => (line ? "      " + line : line))
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${label} wordmark</title>
    <link rel="stylesheet" href="./assets/fonts/globble-logo.css" />
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: #fff8eb;
      }
    </style>
  </head>
  <body>
    <h1 class="logo-wordmark-wrap">
${indentedSvg}
    </h1>
  </body>
</html>
`;
}

function injectWordmarkIntoHtml(filePath, svgMarkup) {
  const html = fs.readFileSync(filePath, "utf8");
  const start = html.indexOf(MARKER_START);
  const end = html.indexOf(MARKER_END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing logo wordmark markers in ${filePath}`);
  }

  const indent = "        ";
  const indentedSvg = svgMarkup
    .split("\n")
    .map((line) => (line ? indent + line : line))
    .join("\n");

  const updated =
    html.slice(0, start + MARKER_START.length) +
    "\n" +
    indentedSvg +
    "\n" +
    indent +
    html.slice(end);

  fs.writeFileSync(filePath, updated, "utf8");
}

function main() {
  const font = loadFont();
  const logoSize = 92;
  const markSize = 96;
  const strokeWidth = Math.max(1.6, logoSize * 0.018);

  const logo = buildWordmarkPaths(font, WORDMARK, logoSize);
  const mark = buildWordmarkPaths(font, MARK, markSize);
  const editableSvg = buildWordmarkVariant(font, WORDMARK, logoSize, strokeWidth);

  fs.writeFileSync(path.join(ASSETS, "logo-wordmark.svg"), editableSvg, "utf8");

  for (const alt of ALT_WORDMARKS) {
    const altSvg = buildWordmarkVariant(font, alt.word, logoSize, strokeWidth);
    fs.writeFileSync(path.join(ASSETS, alt.fileName), altSvg, "utf8");
    const previewName = alt.fileName.replace(/\.svg$/i, "-preview.html");
    fs.writeFileSync(path.join(ROOT, previewName), buildWordmarkPreviewHtml(alt.word, altSvg), "utf8");
  }

  const logoPadX = 28;
  const logoPadY = 18;
  const logoViewW = Math.ceil(logo.width + logoPadX * 2);
  const logoViewH = Math.ceil(logo.height + logoPadY * 2);
  const logoTx = logoPadX - logo.bbox.x1;
  const logoTy = logoPadY - logo.bbox.y1;

  const markPad = 16;
  const markViewW = Math.ceil(mark.width + markPad * 2);
  const markViewH = Math.ceil(mark.height + markPad * 2);
  const markTx = markPad - mark.bbox.x1;
  const markTy = markPad - mark.bbox.y1;

  fs.writeFileSync(
    path.join(ASSETS, "logo.svg"),
    svgFromPaths({
      text: WORDMARK,
      pathData: logo.pathData,
      viewWidth: logoViewW,
      viewHeight: logoViewH,
      translateX: logoTx,
      translateY: logoTy,
      strokeWidth,
    }),
    "utf8"
  );

  fs.writeFileSync(
    path.join(ASSETS, "logo-mark.svg"),
    svgFromPaths({
      text: MARK,
      pathData: mark.pathData,
      viewWidth: markViewW,
      viewHeight: markViewH,
      translateX: markTx,
      translateY: markTy,
      strokeWidth: Math.max(1.7, markSize * 0.02),
    }),
    "utf8"
  );

  fs.writeFileSync(path.join(ASSETS, "fonts", "globble-logo.css"), buildLogoCss(strokeWidth), "utf8");
  fs.copyFileSync(FONT_PATH, path.join(ASSETS, "fonts", "im-fell-english-sc.woff"));

  for (const htmlPath of HTML_TARGETS) {
    if (fs.existsSync(htmlPath)) {
      injectWordmarkIntoHtml(htmlPath, editableSvg);
    }
  }

  process.stdout.write(
    `Wrote logo-wordmark.svg, ${ALT_WORDMARKS.map((alt) => alt.fileName).join(", ")}, logo.svg, logo-mark.svg, and updated HTML/CSS\n`
  );
}

main();
