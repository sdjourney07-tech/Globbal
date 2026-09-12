"use strict";

const fs = require("fs");
const { buildPlayableDictionary } = require("./dictionary-keys.js");
const { moveRackSlots, remapRackIndicesAfterMove } = require("./rack-move.cjs");
const path = require("path");

const BOARD_COLS = 15;
const BOARD_PREMIUM_ROWS = 21;
const REMOVED_BOARD_ROWS = [8, 12];
const BOARD_ROWS = BOARD_PREMIUM_ROWS - REMOVED_BOARD_ROWS.length;
const RACK_SIZE = 16;
const FULL_RACK_BONUS = Math.round((50 / 7) * RACK_SIZE);
const START_SQUARE = {
  row: Math.floor((BOARD_ROWS - 1) / 2),
  col: Math.floor((BOARD_COLS - 1) / 2)
};
const FULL_START_SQUARE = {
  row: Math.floor((BOARD_PREMIUM_ROWS - 1) / 2),
  col: Math.floor((BOARD_COLS - 1) / 2)
};

const LETTER_VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, "?": 0
};

// Classic Scrabble letter counts plus 2 extra blanks in base; scaled to PACK_SIZE at runtime (6 blanks in pack).
const TILE_DISTRIBUTION_BASE = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, "?": 4
};

const PACK_SIZE = 148;

const BASE_PREMIUM_SQUARES = {
  "A,1": "3xWS",
  "D,1": "2xLS",
  "H,1": "3xWS",
  "L,1": "2xLS",
  "O,1": "3xWS",
  "B,2": "2xWS",
  "F,2": "3xLS",
  "J,2": "3xLS",
  "N,2": "2xWS",
  "C,3": "2xWS",
  "G,3": "2xLS",
  "I,3": "2xLS",
  "M,3": "2xWS",
  "A,4": "2xLS",
  "D,4": "2xWS",
  "H,4": "2xLS",
  "L,4": "2xWS",
  "O,4": "2xLS",
  "E,5": "2xWS",
  "K,5": "2xWS",
  "B,6": "3xLS",
  "F,6": "3xLS",
  "J,6": "3xLS",
  "N,6": "3xLS",
  "C,7": "2xLS",
  "G,7": "2xLS",
  "I,7": "2xLS",
  "M,7": "2xLS",
  "A,8": "3xWS",
  "D,8": "2xLS",
  "H,8": "star",
  "L,8": "2xLS",
  "O,8": "3xWS",
  "C,9": "2xLS",
  "G,9": "2xLS",
  "I,9": "2xLS",
  "M,9": "2xLS",
  "B,10": "3xLS",
  "F,10": "3xLS",
  "J,10": "3xLS",
  "N,10": "3xLS",
  "E,11": "2xWS",
  "K,11": "2xWS",
  "A,12": "2xLS",
  "D,12": "2xWS",
  "H,12": "2xLS",
  "L,12": "2xWS",
  "O,12": "2xLS",
  "C,13": "2xWS",
  "G,13": "2xLS",
  "I,13": "2xLS",
  "M,13": "2xWS",
  "B,14": "2xWS",
  "F,14": "3xLS",
  "J,14": "3xLS",
  "N,14": "2xWS",
  "A,15": "3xWS",
  "D,15": "2xLS",
  "H,15": "3xWS",
  "L,15": "2xLS",
  "O,15": "3xWS"
};

function premiumValueToCode(value) {
  if (value === "3xWS") return "tw";
  if (value === "2xWS") return "dw";
  if (value === "3xLS") return "tl";
  if (value === "2xLS") return "dl";
  if (value === "star") return "dw";
  return "normal";
}

function colLetterToIndex(colLetter) {
  return colLetter.charCodeAt(0) - "A".charCodeAt(0);
}

function premiumPriority(code) {
  if (code === "qw") return 5;
  if (code === "tw") return 4;
  if (code === "dw") return 3;
  if (code === "tl") return 2;
  if (code === "dl") return 1;
  return 0;
}

const CUSTOM_QUADRUPLE_WORD_SQUARES = [
  { row: 2, col: 0 },
  { row: 2, col: FULL_START_SQUARE.col },
  { row: 2, col: BOARD_COLS - 1 },
  { row: BOARD_PREMIUM_ROWS - 3, col: 0 },
  { row: BOARD_PREMIUM_ROWS - 3, col: FULL_START_SQUARE.col },
  { row: BOARD_PREMIUM_ROWS - 3, col: BOARD_COLS - 1 }
];

function createPremiumLayout(boardRows, boardCols) {
  const layout = Array.from({ length: boardRows }, () =>
    Array.from({ length: boardCols }, () => "normal")
  );
  const baseSize = 15;
  const rowDenom = baseSize - 1;
  const colDenom = baseSize - 1;

  Object.entries(BASE_PREMIUM_SQUARES).forEach(([key, value]) => {
    const [colLetter, rowNumberStr] = key.split(",");
    const baseRow = Number(rowNumberStr) - 1;
    const baseCol = colLetterToIndex(colLetter);
    const rowIndex = Math.round((baseRow / rowDenom) * (boardRows - 1));
    const colIndex = Math.round((baseCol / colDenom) * (boardCols - 1));
    const code = premiumValueToCode(value);

    if (rowIndex < 0 || rowIndex >= boardRows || colIndex < 0 || colIndex >= boardCols) {
      return;
    }
    if (premiumPriority(code) > premiumPriority(layout[rowIndex][colIndex])) {
      layout[rowIndex][colIndex] = code;
    }
  });

  layout[FULL_START_SQUARE.row][FULL_START_SQUARE.col] = "dw";

  CUSTOM_QUADRUPLE_WORD_SQUARES.forEach(({ row, col }) => {
    if (row >= 0 && row < boardRows && col >= 0 && col < boardCols) {
      layout[row][col] = "qw";
    }
  });

  return layout.filter((_, rowIndex) => !REMOVED_BOARD_ROWS.includes(rowIndex));
}

const PREMIUM_LAYOUT = createPremiumLayout(BOARD_PREMIUM_ROWS, BOARD_COLS);

function loadDictionary() {
  const dictPath = path.join(__dirname, "dictionary.js");
  const aliasPath = path.join(__dirname, "dictionary-alias-sources.js");
  const src = fs.readFileSync(dictPath, "utf8");
  const LOCKED_WORDS = new Function(`${src}; return LOCKED_WORDS;`)();
  // Use precomputed alias sources instead of place-metadata.json (~88MB).
  // Full metadata is only needed for place-info UI in the browser.
  let aliasSources = [];
  try {
    const aliasSrc = fs.readFileSync(aliasPath, "utf8");
    aliasSources = new Function(`${aliasSrc}; return DICTIONARY_ALIAS_SOURCE_WORDS;`)() || [];
  } catch {
    aliasSources = [];
  }
  return buildPlayableDictionary(LOCKED_WORDS, { aliasSources });
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function ensureRackSlots(rack) {
  while (rack.length < RACK_SIZE) {
    rack.push(null);
  }
  if (rack.length > RACK_SIZE) {
    rack.length = RACK_SIZE;
  }
}

function resolveRackSlot(rack, preferredIndex) {
  ensureRackSlots(rack);
  if (
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < RACK_SIZE &&
    !rack[preferredIndex]
  ) {
    return preferredIndex;
  }
  for (let i = 0; i < RACK_SIZE; i += 1) {
    if (!rack[i]) {
      return i;
    }
  }
  return 0;
}

function restoreTileToRack(rack, tile, preferredIndex, tileBackFn) {
  const slot = resolveRackSlot(rack, preferredIndex);
  ensureRackSlots(rack);
  rack[slot] = tileBackFn(tile);
  return slot;
}

function assignTileToRackSlot(rack, tile, preferredIndex, fallbackIndex, tileBackFn) {
  ensureRackSlots(rack);
  if (
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < RACK_SIZE &&
    !rack[preferredIndex]
  ) {
    rack[preferredIndex] = tileBackFn(tile);
    return preferredIndex;
  }
  return restoreTileToRack(rack, tile, fallbackIndex, tileBackFn);
}

function shuffleRackSlots(rack) {
  ensureRackSlots(rack);
  const occupied = [];
  for (let i = 0; i < RACK_SIZE; i += 1) {
    if (rack[i]) {
      occupied.push(i);
    }
  }
  const tiles = occupied.map((slot) => rack[slot]);
  const before = tiles.slice();
  shuffleInPlace(tiles);
  if (tiles.length > 1 && tiles.every((tile, index) => tile === before[index])) {
    tiles.push(tiles.shift());
  }
  occupied.forEach((slot) => {
    rack[slot] = null;
  });
  occupied.forEach((destSlot, j) => {
    rack[destSlot] = tiles[j];
  });
}

class OnlineGame {
  constructor(dictionary) {
    this.dictionary = dictionary;
    this.board = [];
    this.bag = [];
    this.players = [];
    this.currentPlayer = 0;
    this.turnPlacedTiles = [];
    this.gameStarted = false;
    this.lastMessage = "";
    this.gameOver = null;
    /** @type {{ text: string, score?: number }[]} */
    this.lastScoredWords = [];
    /** @type {{ text: string, score: number }[]} */
    this.playedWordScores = [];
  }

  initGame() {
    this.board = Array.from({ length: BOARD_ROWS }, (_, row) =>
      Array.from({ length: BOARD_COLS }, (_, col) => ({
        premium: PREMIUM_LAYOUT[row][col],
        tile: null
      }))
    );
    this.bag = this.createTileBag();
    shuffleInPlace(this.bag);
    this.players = [
      { name: "Player 1", score: 0, rack: [] },
      { name: "Player 2", score: 0, rack: [] }
    ];
    this.drawToRack(0);
    this.drawToRack(1);
    this.currentPlayer = 0;
    this.turnPlacedTiles = [];
    this.gameStarted = true;
    this.gameOver = null;
    this.lastScoredWords = [];
    this.playedWordScores = [];
    this.lastMessage = "";
  }

  createTileBag() {
    const tiles = [];
    const scaledDistribution = this.getScaledTileDistribution();

    Object.entries(scaledDistribution).forEach(([letter, count]) => {
      for (let i = 0; i < count; i += 1) {
        tiles.push({
          letter,
          value: LETTER_VALUES[letter],
          isBlank: letter === "?"
        });
      }
    });

    return tiles;
  }

  getScaledTileDistribution() {
    const baseEntries = Object.entries(TILE_DISTRIBUTION_BASE);
    const baseTotal = baseEntries.reduce((sum, [, count]) => sum + count, 0);
    const scale = PACK_SIZE / baseTotal;

    const raw = baseEntries.map(([letter, count]) => ({
      letter,
      rawCount: count * scale
    }));

    const floored = raw.map(({ letter, rawCount }) => ({
      letter,
      count: Math.floor(rawCount),
      frac: rawCount - Math.floor(rawCount)
    }));

    let sumFloors = floored.reduce((s, x) => s + x.count, 0);
    let remaining = PACK_SIZE - sumFloors;
    floored.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < floored.length && remaining > 0; i += 1) {
      floored[i].count += 1;
      remaining -= 1;
    }

    return floored.reduce((acc, { letter, count }) => {
      acc[letter] = count;
      return acc;
    }, {});
  }

  drawToRack(playerIndex) {
    const rack = this.players[playerIndex].rack;
    ensureRackSlots(rack);
    for (let i = 0; i < RACK_SIZE && this.bag.length > 0; i += 1) {
      if (!rack[i]) {
        rack[i] = this.bag.pop();
      }
    }
  }

  normalizeRack(rack) {
    ensureRackSlots(rack);
    return rack.map((tile) => (tile ? { ...tile } : null));
  }

  countRackTiles(rack) {
    ensureRackSlots(rack);
    return rack.filter(Boolean).length;
  }

  cloneTile(tile) {
    if (!tile) {
      return null;
    }
    return {
      letter: tile.letter,
      value: tile.value,
      isBlank: !!tile.isBlank,
      locked: !!tile.locked,
      placedBy: typeof tile.placedBy === "number" ? tile.placedBy : undefined,
      qwPlated: tile.qwPlated ? true : undefined
    };
  }

  /** Full authoritative state for persistence across process restarts. */
  exportSnapshot() {
    const boardTiles = [];
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const tile = this.board[row]?.[col]?.tile;
        if (tile) {
          boardTiles.push({ row, col, tile: this.cloneTile(tile) });
        }
      }
    }
    return {
      v: 1,
      currentPlayer: this.currentPlayer,
      gameStarted: this.gameStarted,
      gameOver: this.gameOver,
      lastMessage: this.lastMessage || "",
      lastScoredWords: Array.isArray(this.lastScoredWords)
        ? this.lastScoredWords.map((w) => ({
            text: String(w.text || ""),
            score: Number.isFinite(Number(w.score)) ? Number(w.score) : undefined
          }))
        : [],
      playedWordScores: Array.isArray(this.playedWordScores)
        ? this.playedWordScores.map((w) => ({
            text: String(w.text || ""),
            score: Number(w.score) || 0
          }))
        : [],
      bag: (this.bag || []).map((tile) => this.cloneTile(tile)),
      players: (this.players || []).map((p) => ({
        name: p.name,
        score: Number(p.score) || 0,
        rack: this.normalizeRack(p.rack).map((tile) => this.cloneTile(tile))
      })),
      turnPlacedTiles: (this.turnPlacedTiles || []).map(({ row, col, rackIndex, tile }) => ({
        row,
        col,
        rackIndex,
        tile: this.cloneTile(tile)
      })),
      boardTiles
    };
  }

  /**
   * Restore from exportSnapshot(). Returns false if the payload is unusable.
   */
  importSnapshot(snapshot) {
    if (!snapshot || snapshot.v !== 1 || !Array.isArray(snapshot.players) || snapshot.players.length !== 2) {
      return false;
    }
    if (!Array.isArray(snapshot.bag) || !Array.isArray(snapshot.boardTiles)) {
      return false;
    }

    this.board = Array.from({ length: BOARD_ROWS }, (_, row) =>
      Array.from({ length: BOARD_COLS }, (_, col) => ({
        premium: PREMIUM_LAYOUT[row][col],
        tile: null
      }))
    );

    for (const entry of snapshot.boardTiles) {
      const row = Number(entry?.row);
      const col = Number(entry?.col);
      if (!Number.isInteger(row) || !Number.isInteger(col)) {
        continue;
      }
      if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) {
        continue;
      }
      const tile = this.cloneTile(entry.tile);
      if (tile) {
        this.board[row][col].tile = tile;
      }
    }

    this.bag = snapshot.bag.map((tile) => this.cloneTile(tile)).filter(Boolean);
    this.players = snapshot.players.map((p, index) => ({
      name: String(p?.name || `Player ${index + 1}`),
      score: Number(p?.score) || 0,
      rack: this.normalizeRack(Array.isArray(p?.rack) ? p.rack.map((t) => this.cloneTile(t)) : [])
    }));
    this.currentPlayer = snapshot.currentPlayer === 1 ? 1 : 0;
    this.turnPlacedTiles = (Array.isArray(snapshot.turnPlacedTiles) ? snapshot.turnPlacedTiles : [])
      .map((entry) => {
        const row = Number(entry?.row);
        const col = Number(entry?.col);
        const rackIndex = Number(entry?.rackIndex);
        const tile = this.cloneTile(entry?.tile);
        if (
          !Number.isInteger(row) ||
          !Number.isInteger(col) ||
          !Number.isInteger(rackIndex) ||
          !tile
        ) {
          return null;
        }
        return { row, col, rackIndex, tile };
      })
      .filter(Boolean);
    this.gameStarted = snapshot.gameStarted !== false;
    this.gameOver = snapshot.gameOver || null;
    this.lastMessage = String(snapshot.lastMessage || "");
    this.lastScoredWords = Array.isArray(snapshot.lastScoredWords)
      ? snapshot.lastScoredWords.map((w) => ({
          text: String(w?.text || ""),
          score: Number.isFinite(Number(w?.score)) ? Number(w.score) : undefined
        }))
      : [];
    this.playedWordScores = Array.isArray(snapshot.playedWordScores)
      ? snapshot.playedWordScores.map((w) => ({
          text: String(w?.text || ""),
          score: Number(w?.score) || 0
        }))
      : [];
    return true;
  }

  getState(playerIndex) {
    const isViewerTurn = this.currentPlayer === playerIndex;
    const boardOut = this.board.map((row) =>
      row.map((cell) => {
        const tile = cell.tile ? { ...cell.tile } : null;
        // Opponent only sees submitted (locked) tiles — hide in-progress placements.
        if (tile && !tile.locked && !isViewerTurn) {
          return { premium: cell.premium, tile: null };
        }
        return {
          premium: cell.premium,
          tile
        };
      })
    );

    return {
      board: boardOut,
      players: this.players.map((p) => ({ name: p.name, score: p.score })),
      myRack: this.normalizeRack(this.players[playerIndex].rack),
      opponentRackCount: this.countRackTiles(this.players[1 - playerIndex].rack),
      pendingPlacements: isViewerTurn
        ? this.turnPlacedTiles.map(({ row, col, rackIndex }) => ({
            row,
            col,
            rackIndex
          }))
        : [],
      bagCount: this.bag.length,
      currentPlayer: this.currentPlayer,
      myPlayerIndex: playerIndex,
      isMyTurn: isViewerTurn,
      message: this.lastMessage,
      gameOver: this.gameOver,
      gameStarted: this.gameStarted,
      dictionarySize: this.dictionary.size,
      lastScoredWords: Array.isArray(this.lastScoredWords)
        ? this.lastScoredWords.map((w) => ({
            text: w.text,
            score: Number.isFinite(Number(w.score)) ? Number(w.score) : undefined
          }))
        : [],
      playedWordScores: Array.isArray(this.playedWordScores)
        ? this.playedWordScores.map((w) => ({
            text: w.text,
            score: Number(w.score) || 0
          }))
        : []
    };
  }

  assertTurn(playerIndex) {
    if (!this.gameStarted || this.gameOver) {
      return { ok: false, error: "Game not active." };
    }
    if (playerIndex !== this.currentPlayer) {
      return { ok: false, error: "Not your turn." };
    }
    return { ok: true };
  }

  placeRackTile(playerIndex, row, col, rackIndex, blankLetter) {
    const t = this.assertTurn(playerIndex);
    if (!t.ok) return t;
    if (this.board[row][col].tile) {
      return { ok: false, error: "Cell occupied." };
    }
    const rack = this.players[playerIndex].rack;
    ensureRackSlots(rack);
    const chosenTile = rack[rackIndex];
    if (!chosenTile) {
      return { ok: false, error: "No tile in rack slot." };
    }

    const tile = { ...chosenTile, placedBy: playerIndex, locked: false };
    if (tile.isBlank) {
      if (!blankLetter || !/^[a-z]$/i.test(String(blankLetter))) {
        return { ok: false, error: "Blank tile needs a letter A–Z." };
      }
      tile.letter = String(blankLetter).toUpperCase();
      tile.value = 0;
    }

    rack[rackIndex] = null;
    this.board[row][col].tile = tile;
    this.turnPlacedTiles.push({ row, col, tile, rackIndex });
    this.lastMessage = "";
    return { ok: true };
  }

  moveTurnTile(playerIndex, targetRow, targetCol, sourceRow, sourceCol) {
    const t = this.assertTurn(playerIndex);
    if (!t.ok) return t;
    if (this.board[targetRow][targetCol].tile) {
      return { ok: false, error: "Cell occupied." };
    }
    const sourceCell = this.board[sourceRow][sourceCol];
    if (!sourceCell.tile || sourceCell.tile.locked) {
      return { ok: false, error: "Cannot move that tile." };
    }

    const movedTile = sourceCell.tile;
    sourceCell.tile = null;
    this.board[targetRow][targetCol].tile = movedTile;

    const turnIdx = this.turnPlacedTiles.findIndex(
      (entry) => entry.row === sourceRow && entry.col === sourceCol
    );
    if (turnIdx !== -1) {
      this.turnPlacedTiles[turnIdx].row = targetRow;
      this.turnPlacedTiles[turnIdx].col = targetCol;
    }
    return { ok: true };
  }

  tileBackToRack(tile) {
    if (tile.isBlank) {
      return { ...tile, letter: "?", value: 0, locked: false };
    }
    return { ...tile, locked: false };
  }

  removeTurnTile(playerIndex, row, col, preferredRackSlot = null) {
    const t = this.assertTurn(playerIndex);
    if (!t.ok) return t;
    const idx = this.turnPlacedTiles.findIndex((entry) => entry.row === row && entry.col === col);
    if (idx === -1) {
      return { ok: false, error: "Not a pending tile." };
    }
    const [{ tile, rackIndex }] = this.turnPlacedTiles.splice(idx, 1);
    assignTileToRackSlot(
      this.players[playerIndex].rack,
      tile,
      preferredRackSlot,
      rackIndex,
      (entry) => this.tileBackToRack(entry)
    );
    this.board[row][col].tile = null;
    return { ok: true };
  }

  recallTurnTiles(playerIndex) {
    const t = this.assertTurn(playerIndex);
    if (!t.ok) return t;
    while (this.turnPlacedTiles.length) {
      const { row, col, tile, rackIndex } = this.turnPlacedTiles.pop();
      this.board[row][col].tile = null;
      restoreTileToRack(
        this.players[playerIndex].rack,
        tile,
        rackIndex,
        (entry) => this.tileBackToRack(entry)
      );
    }
    return { ok: true };
  }

  submitTurn(playerIndex) {
    const t = this.assertTurn(playerIndex);
    if (!t.ok) return t;
    if (this.turnPlacedTiles.length === 0) {
      return { ok: false, error: "Place at least one tile." };
    }
    const validation = this.validateTurn();
    if (!validation.ok) {
      if (validation.error.startsWith("Invalid word")) {
        this.recallTurnTiles(playerIndex);
      }
      return { ok: false, error: validation.error };
    }
    const placements = [...this.turnPlacedTiles];
    const scored = this.scoreWordsAndMarkQwPlating(validation.words, placements);
    const points = scored.total;
    this.lastScoredWords = scored.wordScores.slice();
    this.playedWordScores = [...(this.playedWordScores || []), ...scored.wordScores];
    this.players[playerIndex].score += points;
    this.turnPlacedTiles.forEach(({ row, col }) => {
      this.board[row][col].tile.locked = true;
    });
    this.turnPlacedTiles = [];
    this.drawToRack(playerIndex);

    const gameOver = this.checkGameOver();
    if (gameOver) {
      this.gameOver = gameOver;
      this.lastMessage = gameOver;
      return { ok: true };
    }

    const scorerName = this.players[playerIndex].name;
    this.currentPlayer = playerIndex === 0 ? 1 : 0;
    this.lastMessage = `${scorerName} scores ${points}.`;
    return { ok: true };
  }

  validateTurn() {
    const newTiles = [...this.turnPlacedTiles];
    const allLocked = this.getAllLockedTiles();
    const isFirstMove = allLocked.length === 0;

    const sameRow = newTiles.every((t) => t.row === newTiles[0].row);
    const sameCol = newTiles.every((t) => t.col === newTiles[0].col);
    if (!sameRow && !sameCol) {
      return { ok: false, error: "Tiles must be in one row or one column." };
    }

    if (!this.isContiguous(newTiles, sameRow ? "row" : "col")) {
      return { ok: false, error: "Tiles must be contiguous." };
    }

    if (isFirstMove) {
      const coversStart = newTiles.some(
        (t) => t.row === START_SQUARE.row && t.col === START_SQUARE.col
      );
      if (!coversStart) {
        return { ok: false, error: "First move must touch the center start square." };
      }
    } else if (!this.touchesExisting(newTiles)) {
      return { ok: false, error: "Move must connect to existing tiles." };
    }

    const words = this.collectWordsFromMove(newTiles);
    if (words.length === 0) {
      return { ok: false, error: "Move must form a valid word." };
    }

    const invalid = words
      .map((word) => word.text)
      .filter((text) => !this.dictionary.has(text));
    if (invalid.length === 1) {
      return { ok: false, error: `Invalid word: ${invalid[0]}` };
    }
    if (invalid.length > 1) {
      return { ok: false, error: `Invalid words: ${invalid.join(", ")}` };
    }

    return { ok: true, words };
  }

  isContiguous(newTiles, axis) {
    if (newTiles.length === 1) {
      return true;
    }
    const fixed = axis === "row" ? newTiles[0].row : newTiles[0].col;
    const indices = newTiles.map((t) => (axis === "row" ? t.col : t.row)).sort((a, b) => a - b);
    for (let i = indices[0]; i <= indices[indices.length - 1]; i += 1) {
      const row = axis === "row" ? fixed : i;
      const col = axis === "row" ? i : fixed;
      if (!this.board[row][col].tile) {
        return false;
      }
    }
    return true;
  }

  touchesExisting(newTiles) {
    return newTiles.some(({ row, col }) => {
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1]
      ];
      return neighbors.some(
        ([r, c]) => this.inBounds(r, c) && this.board[r][c].tile && this.board[r][c].tile.locked
      );
    });
  }

  collectWordsFromMove(newTiles) {
    const seen = new Set();
    const words = [];

    newTiles.forEach(({ row, col }) => {
      const horizontal = this.getWordAt(row, col, 0, -1, 0, 1);
      if (horizontal.text.length > 1 && !seen.has(horizontal.key)) {
        seen.add(horizontal.key);
        words.push(horizontal);
      }
      const vertical = this.getWordAt(row, col, -1, 0, 1, 0);
      if (vertical.text.length > 1 && !seen.has(vertical.key)) {
        seen.add(vertical.key);
        words.push(vertical);
      }
    });

    return words;
  }

  getWordAt(row, col, backRowStep, backColStep, forwardRowStep, forwardColStep) {
    let startRow = row;
    let startCol = col;
    while (
      this.inBounds(startRow + backRowStep, startCol + backColStep) &&
      this.board[startRow + backRowStep][startCol + backColStep].tile
    ) {
      startRow += backRowStep;
      startCol += backColStep;
    }

    const cells = [];
    let r = startRow;
    let c = startCol;
    while (this.inBounds(r, c) && this.board[r][c].tile) {
      cells.push({ row: r, col: c, tile: this.board[r][c].tile });
      r += forwardRowStep;
      c += forwardColStep;
    }

    const text = cells.map((cell) => cell.tile.letter).join("");
    const key = `${startRow},${startCol}:${forwardRowStep},${forwardColStep}`;
    return { key, text, cells };
  }

  scoreWordsAndMarkQwPlating(words, turnPlacements) {
    const newKeys = new Set(turnPlacements.map(({ row, col }) => `${row},${col}`));
    let total = 0;
    const wordScores = [];

    words.forEach((word) => {
      let wordBase = 0;
      let wordMultiplier = 1;
      let usesQw = word.cells.some(
        ({ row, col }) =>
          this.board[row][col].premium === "qw" && newKeys.has(`${row},${col}`)
      );

      word.cells.forEach(({ row, col, tile }) => {
        if (!tile) {
          return;
        }
        let letterValue = tile.value;
        // Already-played tiles count at face value only — no reused premiums.
        if (newKeys.has(`${row},${col}`)) {
          const premium = this.board[row][col].premium;
          if (premium === "dl") {
            letterValue *= 2;
          } else if (premium === "tl") {
            letterValue *= 3;
          } else if (premium === "dw") {
            wordMultiplier *= 2;
          } else if (premium === "tw") {
            wordMultiplier *= 3;
          } else if (premium === "qw") {
            wordMultiplier *= 4;
          }
        }
        wordBase += letterValue;
      });

      const wordScore = wordBase * wordMultiplier;
      total += wordScore;
      if (word?.text) {
        wordScores.push({ text: word.text, score: wordScore });
      }

      if (usesQw) {
        word.cells.forEach(({ row, col }) => {
          const boardTile = this.board[row][col].tile;
          if (boardTile) {
            boardTile.qwPlated = true;
          }
        });
      }
    });

    if (turnPlacements.length === RACK_SIZE) {
      total += FULL_RACK_BONUS;
    }

    return { total, wordScores };
  }

  getAllLockedTiles() {
    const lockedTiles = [];
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        if (this.board[row][col].tile && this.board[row][col].tile.locked) {
          lockedTiles.push({ row, col, tile: this.board[row][col].tile });
        }
      }
    }
    return lockedTiles;
  }

  inBounds(row, col) {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  checkGameOver() {
    const currentRack = this.players[this.currentPlayer].rack;
    if (this.bag.length === 0 && this.countRackTiles(currentRack) === 0) {
      return "Game over! Tile bag empty and rack cleared.";
    }
    return null;
  }

  passTurn(playerIndex) {
    const t = this.assertTurn(playerIndex);
    if (!t.ok) return t;
    this.recallTurnTilesInternal(playerIndex);
    this.currentPlayer = playerIndex === 0 ? 1 : 0;
    this.lastScoredWords = [];
    this.lastMessage = "Turn passed.";
    return { ok: true };
  }

  recallTurnTilesInternal(playerIndex) {
    while (this.turnPlacedTiles.length) {
      const { row, col, tile, rackIndex } = this.turnPlacedTiles.pop();
      this.board[row][col].tile = null;
      restoreTileToRack(
        this.players[playerIndex].rack,
        tile,
        rackIndex,
        (entry) => ({ ...entry, locked: false })
      );
    }
  }

  shuffleRack(playerIndex) {
    if (!this.gameStarted || this.gameOver) {
      return { ok: false, error: "Game not active." };
    }
    if (playerIndex !== 0 && playerIndex !== 1) {
      return { ok: false, error: "Invalid player." };
    }
    shuffleRackSlots(this.players[playerIndex].rack);
    return { ok: true };
  }

  reorderRack(playerIndex, fromIndex, toIndex) {
    if (!this.gameStarted || this.gameOver) {
      return { ok: false, error: "Game not active." };
    }
    if (playerIndex !== 0 && playerIndex !== 1) {
      return { ok: false, error: "Invalid player." };
    }
    const rack = this.players[playerIndex].rack;
    ensureRackSlots(rack);
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return { ok: false, error: "Invalid rack index." };
    }
    if (from < 0 || from >= RACK_SIZE || to < 0 || to >= RACK_SIZE) {
      return { ok: false, error: "Invalid rack index." };
    }
    if (from === to || !rack[from]) {
      return { ok: true };
    }
    if (!moveRackSlots(rack, from, to, RACK_SIZE)) {
      return { ok: false, error: "Invalid rack index." };
    }
    if (playerIndex === this.currentPlayer && this.turnPlacedTiles.length) {
      remapRackIndicesAfterMove(this.turnPlacedTiles, from, to, RACK_SIZE);
    }
    return { ok: true };
  }
}

module.exports = {
  BOARD_COLS,
  BOARD_ROWS,
  RACK_SIZE,
  START_SQUARE,
  PREMIUM_LAYOUT,
  loadDictionary,
  OnlineGame
};
