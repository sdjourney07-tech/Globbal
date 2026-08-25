"use strict";

const fs = require("fs");
const path = require("path");
const { buildPlayableDictionary } = require("../dictionary-keys.js");

const BOARD_ROWS = 21;
const BOARD_COLS = 15;
const START_SQUARE = {
  row: Math.floor((BOARD_ROWS - 1) / 2),
  col: Math.floor((BOARD_COLS - 1) / 2)
};

function loadDictionary() {
  const dictPath = path.join(__dirname, "..", "dictionary.js");
  const src = fs.readFileSync(dictPath, "utf8");
  const LOCKED_WORDS = new Function(`${src}; return LOCKED_WORDS;`)();
  const metaPath = path.join(__dirname, "..", "place-metadata.json");
  const metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  return buildPlayableDictionary(LOCKED_WORDS, { metadata });
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

function getWordAt(board, row, col, backRowStep, backColStep, forwardRowStep, forwardColStep) {
  let startRow = row;
  let startCol = col;
  while (
    inBounds(startRow + backRowStep, startCol + backColStep) &&
    board[startRow + backRowStep][startCol + backColStep]
  ) {
    startRow += backRowStep;
    startCol += backColStep;
  }

  let r = startRow;
  let c = startCol;
  let text = "";
  while (inBounds(r, c) && board[r][c]) {
    text += board[r][c];
    r += forwardRowStep;
    c += forwardColStep;
  }
  return text;
}

function collectBoardWords(board) {
  const seen = new Set();
  const words = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (!board[row][col]) {
        continue;
      }
      const horizontal = getWordAt(board, row, col, 0, -1, 0, 1);
      if (horizontal.length > 1 && !seen.has(`h:${horizontal}`)) {
        seen.add(`h:${horizontal}`);
        words.push(horizontal);
      }
      const vertical = getWordAt(board, row, col, -1, 0, 1, 0);
      if (vertical.length > 1 && !seen.has(`v:${vertical}`)) {
        seen.add(`v:${vertical}`);
        words.push(vertical);
      }
    }
  }
  return words;
}

function isConnected(board) {
  const cells = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (board[row][col]) {
        cells.push(`${row},${col}`);
      }
    }
  }
  if (!cells.length) {
    return true;
  }
  const occupied = new Set(cells);
  const visited = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    const key = queue.pop();
    const [row, col] = key.split(",").map(Number);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = `${row + dr},${col + dc}`;
      if (occupied.has(next) && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited.size === occupied.size;
}

function canPlaceWord(board, word, row, col, dir) {
  const isFirst = !board.some((line) => line.some(Boolean));
  let touches = isFirst;
  let usesStart = false;
  const newCells = [];

  for (let i = 0; i < word.length; i += 1) {
    const targetRow = dir === "h" ? row : row + i;
    const targetCol = dir === "h" ? col + i : col;
    if (!inBounds(targetRow, targetCol)) {
      return false;
    }
    const existing = board[targetRow][targetCol];
    if (existing && existing !== word[i]) {
      return false;
    }
    if (!existing) {
      newCells.push([targetRow, targetCol]);
      const neighbors = [
        [targetRow - 1, targetCol],
        [targetRow + 1, targetCol],
        [targetRow, targetCol - 1],
        [targetRow, targetCol + 1]
      ];
      if (
        neighbors.some(
          ([r, c]) => inBounds(r, c) && board[r][c] && !newCells.some(([nr, nc]) => nr === r && nc === c)
        )
      ) {
        touches = true;
      }
    }
    if (targetRow === START_SQUARE.row && targetCol === START_SQUARE.col) {
      usesStart = true;
    }
  }

  if (!touches) {
    return false;
  }
  if (newCells.length === 0) {
    return false;
  }
  if (isFirst && !usesStart) {
    return false;
  }

  const trial = board.map((line) => line.slice());
  for (let i = 0; i < word.length; i += 1) {
    const targetRow = dir === "h" ? row : row + i;
    const targetCol = dir === "h" ? col + i : col;
    trial[targetRow][targetCol] = word[i];
  }

  if (!isConnected(trial)) {
    return false;
  }

  const words = collectBoardWords(trial);
  return words.every((entry) => dictionary.has(entry));
}

function placeWord(board, word, row, col, dir) {
  for (let i = 0; i < word.length; i += 1) {
    const targetRow = dir === "h" ? row : row + i;
    const targetCol = dir === "h" ? col + i : col;
    board[targetRow][targetCol] = word[i];
  }
}

function countTiles(board) {
  let total = 0;
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (board[row][col]) {
        total += 1;
      }
    }
  }
  return total;
}

const dictionary = loadDictionary();
const geographySeeds = [
  "FRANCE", "NEPAL", "PERU", "ROME", "OSLO", "IRAN", "IRAQ", "CHINA", "INDIA", "SPAIN", "TEXAS",
  "JAPAN", "KENYA", "NEPAL", "EGYPT", "SYRIA", "DUBAI", "QATAR", "GHANA", "BRAZIL", "MEXICO",
  "LONDON", "BERLIN", "MOSCOW", "DUBLIN", "VIENNA", "PRAGUE", "NORWAY", "SWEDEN", "FINLAND",
  "DENMARK", "POLAND", "TURKEY", "GREECE", "ITALY", "CANADA", "ALASKA", "HAWAII", "KENT", "LYON",
  "BONN", "CUBA", "FIJI", "UTAH", "IOWA", "OHIO", "ERIE", "RENO", "LIMA", "DOHA", "OMAN", "TOGO",
  "MALI", "CHAD", "GAZA", "KYIV", "LVIV", "RIGA", "GRAZ", "KOBE", "NICE", "SFAX", "SUEZ", "WACO",
  "MESA", "CORK", "CORO", "CALI", "VIGO", "PARIS", "CUBA", "YEMEN", "SUDAN", "LIBYA", "MALTA",
  "NAIROBI", "LAGOS", "ACCRA", "DAKAR", "OSAKA", "SEOUL", "TAIPEI", "HANOI", "JAKARTA", "MANILA",
  "BANGKOK", "ISFAHAN", "SHIRAZ", "MASHHAD", "KABUL", "KANDAHAR", "KATHMANDU", "COLOMBO", "DHAKA",
  "KARACHI", "LAHORE", "MUMBAI", "DELHI", "CHENNAI", "KOLKATA", "BENGALURU", "HYDERABAD", "PUNE",
  "SURAT", "JAIPUR", "LUCKNOW", "KANPUR", "NAGPUR", "INDORE", "PATNA", "AGRA", "VADODARA", "LUDHIANA",
  "PERU", "IRAN", "IRAQ", "OSLO", "ROME", "CUBA", "FIJI", "UTAH", "OHIO", "ERIE", "RENO", "LIMA",
  "DOHA", "OMAN", "TOGO", "MALI", "CHAD", "GAZA", "KYIV", "KOBE", "NICE", "SFAX", "SUEZ", "WACO",
  "MESA", "CORK", "CORO", "CALI", "VIGO", "PUER", "ADA", "MAN", "USA", "CHAD", "MALI", "YEMEN"
];
const candidates = [...new Set(geographySeeds)]
  .filter((word) => dictionary.has(word))
  .sort((a, b) => b.length - a.length || a.localeCompare(b));

const board = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
const placements = [];
const usedWords = new Set();

function tryPlace(word, row, col, dir) {
  if (usedWords.has(word)) {
    return false;
  }
  if (!canPlaceWord(board, word, row, col, dir)) {
    return false;
  }
  placeWord(board, word, row, col, dir);
  placements.push({ word, row, col, dir });
  usedWords.add(word);
  return true;
}

const seeds = [
  ["FRANCE", START_SQUARE.row, START_SQUARE.col - 3, "h"],
  ["NEPAL", START_SQUARE.row, START_SQUARE.col, "v"],
  ["LYON", START_SQUARE.row + 4, START_SQUARE.col, "h"]
];

seeds.forEach(([word, row, col, dir]) => {
  if (!tryPlace(word, row, col, dir)) {
    throw new Error(`Failed to place seed ${word}`);
  }
});

let improved = true;
let passes = 0;
while (improved && passes < 20) {
  improved = false;
  passes += 1;
  for (const word of candidates) {
    if (usedWords.has(word)) {
      continue;
    }
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        for (const dir of ["h", "v"]) {
          if (tryPlace(word, row, col, dir)) {
            improved = true;
            break;
          }
        }
        if (improved) {
          break;
        }
      }
      if (improved) {
        break;
      }
    }
  }
}

const words = collectBoardWords(board);
const invalid = words.filter((word) => !dictionary.has(word));
if (invalid.length || !isConnected(board)) {
  console.error("Invalid demo board", { invalid, connected: isConnected(board) });
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      placements,
      tileCount: countTiles(board),
      wordCount: words.length,
      uniqueWords: usedWords.size
    },
    null,
    2
  )
);
