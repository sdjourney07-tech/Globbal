import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { loadDictionary, OnlineGame, START_SQUARE, BOARD_ROWS, BOARD_COLS } = require("../game-engine.cjs");

globalThis.window = globalThis;
eval(fs.readFileSync(new URL("../playable-words.js", import.meta.url), "utf8"));

const dict = await loadDictionary();
const current = globalThis.GlobblePlayableWords.countPlayableWords;

function rackLetterCounts(rack) {
  const counts = new Uint8Array(26);
  for (const tile of rack) {
    if (!tile || tile.isBlank) continue;
    const code = tile.letter.charCodeAt(0) - 65;
    if (code >= 0 && code < 26) counts[code] += 1;
  }
  return counts;
}

function wordFitsRack(word, rackCounts) {
  const need = new Uint8Array(26);
  for (let i = 0; i < word.length; i += 1) {
    const code = word.charCodeAt(i) - 65;
    if (code < 0 || code >= 26) return false;
    need[code] += 1;
    if (need[code] > rackCounts[code]) return false;
  }
  return true;
}

/** Fast path: empty board — only lines through START, rack-filter dictionary scan. */
function countEmptyBoardFast(rack, dictionary, startSquare) {
  const rackCounts = rackLetterCounts(rack);
  const found = new Set();
  const { row, col } = startSquare;

  for (const word of dictionary) {
    if (word.length < 2 || !wordFitsRack(word, rackCounts)) {
      continue;
    }
    const len = word.length;
    let fits = false;
    if (col - len + 1 <= col && col < 15) {
      const startCol = Math.max(0, col - len + 1);
      const endCol = Math.min(startCol + len - 1, 14);
      if (startCol <= col && col <= endCol && startCol + len <= 15) {
        fits = true;
      }
    }
    if (!fits && row - len + 1 <= row && row < 21) {
      const startRow = Math.max(0, row - len + 1);
      const endRow = Math.min(startRow + len - 1, 20);
      if (startRow <= row && row <= endRow && startRow + len <= 21) {
        fits = true;
      }
    }
    if (fits) {
      found.add(word);
    }
  }
  return found.size;
}

function boardHasTile(board, row, col) {
  return Boolean(board[row]?.[col]?.tile);
}

function getAnchors(board, startSquare) {
  const anchors = [];
  let empty = true;
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col].tile) {
        empty = false;
      }
    }
  }
  if (empty) {
    anchors.push({ row: startSquare.row, col: startSquare.col, firstMove: true });
    return anchors;
  }

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col].tile || !board[row][col]) continue;
      const touches =
        boardHasTile(board, row - 1, col) ||
        boardHasTile(board, row + 1, col) ||
        boardHasTile(board, row, col - 1) ||
        boardHasTile(board, row, col + 1);
      if (touches) {
        anchors.push({ row, col, firstMove: false });
      }
    }
  }
  return anchors;
}

function bench(label, fn) {
  const t0 = performance.now();
  const count = fn();
  const ms = Math.round(performance.now() - t0);
  console.log(JSON.stringify({ label, ms, count }));
  return { ms, count };
}

const g = new OnlineGame(dict);
g.initGame();
const rack = g.players[0].rack;

console.log("dictionary", dict.size, "rack", rack.filter(Boolean).map((t) => t.letter).join(""));

const baseline = bench("current (empty board, 16 tiles)", () =>
  current({ board: g.board, rack, dictionary: dict, startSquare: START_SQUARE })
);

const fastEmpty = bench("rack-filter empty board fast path", () =>
  countEmptyBoardFast(rack, dict, START_SQUARE)
);

console.log("match", baseline.count === fastEmpty.count);

g.initGame();
g.players[0].rack = Array.from({ length: 16 }, (_, i) =>
  i < 7 ? { letter: "RETINAS"[i], value: 1, isBlank: false } : null
);
g.board[10][7].tile = { letter: "A", value: 1, isBlank: false, locked: true };
g.board[10][8].tile = { letter: "T", value: 1, isBlank: false, locked: true };
g.board[10][9].tile = { letter: "E", value: 1, isBlank: false, locked: true };

bench("current (mid-game 7 tiles)", () =>
  current({ board: g.board, rack: g.players[0].rack, dictionary: dict, startSquare: START_SQUARE })
);
