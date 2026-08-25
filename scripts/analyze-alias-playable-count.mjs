import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { loadDictionary, OnlineGame, START_SQUARE } = require("../game-engine.cjs");
const { buildPlayableDictionary, compactWord } = require("../dictionary-keys.js");

globalThis.window = globalThis;
eval(fs.readFileSync(new URL("../playable-words.js", import.meta.url), "utf8"));

const dictSrc = fs.readFileSync(new URL("../dictionary.js", import.meta.url), "utf8");
const LOCKED_WORDS = new Function(`${dictSrc}; return LOCKED_WORDS;`)();
const aliasSrc = fs.readFileSync(new URL("../dictionary-alias-sources.js", import.meta.url), "utf8");
const ALIAS_SOURCES = new Function(`${aliasSrc}\nreturn DICTIONARY_ALIAS_SOURCE_WORDS;`)();

const baseSet = new Set(LOCKED_WORDS.map((w) => compactWord(w)).filter(Boolean));
const fullDict = buildPlayableDictionary(LOCKED_WORDS, {
  aliasSources: ALIAS_SOURCES
});
const noAliasDict = buildPlayableDictionary(LOCKED_WORDS, {});

const aliasOnly = [...fullDict].filter((w) => !baseSet.has(w));
console.log("Dictionary sizes:");
console.log("  base entries:", baseSet.size);
console.log("  with place aliases:", fullDict.size, `(+${fullDict.size - baseSet.size})`);
console.log("  alias-only words:", aliasOnly.length);
console.log("  alias-only len<=4:", aliasOnly.filter((w) => w.length <= 4).length);
console.log("  alias-only sample:", aliasOnly.slice(0, 20).join(", "));

function countEmptyBoardFast(rack, dictionary, startSquare) {
  const rc = new Uint8Array(26);
  for (const tile of rack) {
    if (!tile || tile.isBlank) continue;
    rc[tile.letter.charCodeAt(0) - 65] += 1;
  }
  const need = new Uint8Array(26);
  let total = 0;
  let aliasHits = 0;
  let shortHits = 0;
  for (const word of dictionary) {
    need.fill(0);
    let ok = true;
    for (let i = 0; i < word.length; i += 1) {
      const code = word.charCodeAt(i) - 65;
      if (code < 0 || code >= 26 || ++need[code] > rc[code]) {
        ok = false;
        break;
      }
    }
    if (!ok || word.length < 2) continue;
    const len = word.length;
    let fits = false;
    for (let sc = Math.max(0, startSquare.col - len + 1); sc <= startSquare.col && sc + len <= 15; sc += 1) {
      fits = true;
      break;
    }
    if (!fits) {
      for (let sr = Math.max(0, startSquare.row - len + 1); sr <= startSquare.row && sr + len <= 21; sr += 1) {
        fits = true;
        break;
      }
    }
    if (!fits) continue;
    total += 1;
    if (!baseSet.has(word)) aliasHits += 1;
    if (word.length <= 4) shortHits += 1;
  }
  return { total, aliasHits, shortHits };
}

const g = new OnlineGame(await loadDictionary());
g.initGame();
const rack = g.players[0].rack;

const current = globalThis.GlobblePlayableWords.countPlayableWords({
  board: g.board,
  rack,
  dictionary: fullDict,
  startSquare: START_SQUARE
});

const withAliases = countEmptyBoardFast(rack, fullDict, START_SQUARE);
const withoutAliases = countEmptyBoardFast(rack, noAliasDict, START_SQUARE);

console.log("\nRack:", rack.filter(Boolean).map((t) => t.letter).join(""));
console.log("Current counter:", current);
console.log("\nEmpty-board scan WITH aliases:");
console.log("  playable words:", withAliases.total);
console.log("  alias-only among those:", withAliases.aliasHits);
console.log("  len<=4 among those:", withAliases.shortHits);
console.log("\nEmpty-board scan WITHOUT place aliases:");
console.log("  playable words:", withoutAliases.total);
console.log("  removed:", withAliases.total - withoutAliases.total);
