const BOARD_COLS = 15;
const BOARD_ROWS = 21;
const RACK_SIZE = 16;
const FULL_RACK_BONUS = Math.round((50 / 7) * RACK_SIZE);
const START_SQUARE = {
  row: Math.floor((BOARD_ROWS - 1) / 2),
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

// Classic 15×15 Scrabble premium grid, scaled to fill the full board dimensions.
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
  if (value === "star") return "dw"; // center square is a double-word star
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

/** Rows 3 and 19 (1-based) on left, center, and right columns. */
const CUSTOM_QUADRUPLE_WORD_SQUARES = [
  { row: 2, col: 0 },
  { row: 2, col: START_SQUARE.col },
  { row: 2, col: BOARD_COLS - 1 },
  { row: 18, col: 0 },
  { row: 18, col: START_SQUARE.col },
  { row: 18, col: BOARD_COLS - 1 }
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

  layout[START_SQUARE.row][START_SQUARE.col] = "dw";

  CUSTOM_QUADRUPLE_WORD_SQUARES.forEach(({ row, col }) => {
    if (row >= 0 && row < boardRows && col >= 0 && col < boardCols) {
      layout[row][col] = "qw";
    }
  });

  return layout;
}

const PREMIUM_LAYOUT = createPremiumLayout(BOARD_ROWS, BOARD_COLS);

const boardEl = document.getElementById("board");
const rackEl = document.getElementById("rack");
const messageEl = document.getElementById("message");
const turnInfoEl = document.getElementById("turnInfo");
const bagCountEl = document.getElementById("bagCount");
const playableWordsCountEl = document.getElementById("playableWordsCount");
const player1ScoreEl = document.getElementById("player1Score");
const player2ScoreEl = document.getElementById("player2Score");

const submitTurnBtn = document.getElementById("submitTurnBtn");
const recallTilesBtn = document.getElementById("recallTilesBtn");
const passTurnBtn = document.getElementById("passTurnBtn");
const shuffleRackBtn = document.getElementById("shuffleRackBtn");
const newGameBtn = document.getElementById("newGameBtn");

let board = [];
let bag = [];
let dictionary = GlobbleDictionaryKeys.buildPlayableDictionary(
  typeof LOCKED_WORDS !== "undefined" ? LOCKED_WORDS : [],
  {
    aliasSources:
      typeof DICTIONARY_ALIAS_SOURCE_WORDS !== "undefined" ? DICTIONARY_ALIAS_SOURCE_WORDS : []
  }
);
let players = [];
let currentPlayer = 0;
let selectedRackIndex = null;
let turnPlacedTiles = [];
let gameStarted = false;
let draggingRackIndex = null;
let draggingTurnTilePos = null;
let rackShuffleAnimating = false;
let rackShufflePendingAnimation = false;
let shufflePrevRack = null;
let rackReturnAnimating = false;

function initGame() {
  window.GlobblePracticeResume?.clearSaved();
  board = Array.from({ length: BOARD_ROWS }, (_, row) =>
    Array.from({ length: BOARD_COLS }, (_, col) => ({
      premium: PREMIUM_LAYOUT[row][col],
      tile: null
    }))
  );
  bag = createTileBag();
  shuffleInPlace(bag);
  players = [
    { name: "Player 1", score: 0, rack: [] },
    { name: "Player 2", score: 0, rack: [] }
  ];
  drawToRack(0);
  drawToRack(1);
  currentPlayer = 0;
  resetPracticeTestRackState();
  applyPracticeTestRackForTurnStart(currentPlayer);
  selectedRackIndex = null;
  turnPlacedTiles = [];
  gameStarted = true;
  window.GlobblePendingWordGlow?.resetGlowState();
  window.GlobbleBoardZoom?.reset(false);
  setMessage("");
  render();
}

// Built with scripts/build-practice-demo.cjs — every line is a legal dictionary word and the cluster is connected.
const DEMO_WORD_PLACEMENTS = [
  { word: "FRANCE", row: 10, col: 4, dir: "h" },
  { word: "NEPAL", row: 10, col: 7, dir: "v" },
  { word: "LYON", row: 14, col: 7, dir: "h" },
  { word: "BENGALURU", row: 3, col: 5, dir: "v" },
  { word: "HYDERABAD", row: 4, col: 2, dir: "h" },
  { word: "KATHMANDU", row: 1, col: 2, dir: "v" },
  { word: "KANDAHAR", row: 0, col: 7, dir: "v" },
  { word: "LUDHIANA", row: 2, col: 10, dir: "v" },
  { word: "VADODARA", row: 13, col: 0, dir: "h" },
  { word: "BANGKOK", row: 0, col: 3, dir: "h" },
  { word: "CHENNAI", row: 11, col: 10, dir: "v" },
  { word: "COLOMBO", row: 12, col: 3, dir: "v" },
  { word: "DENMARK", row: 8, col: 8, dir: "h" },
  { word: "FINLAND", row: 4, col: 12, dir: "v" },
  { word: "ISFAHAN", row: 10, col: 1, dir: "v" },
  { word: "JAKARTA", row: 6, col: 14, dir: "v" },
  { word: "KARACHI", row: 16, col: 7, dir: "h" },
  { word: "KOLKATA", row: 18, col: 2, dir: "h" },
  { word: "MASHHAD", row: 12, col: 12, dir: "v" },
  { word: "ALASKA", row: 2, col: 9, dir: "h" },
  { word: "CANADA", row: 7, col: 0, dir: "h" },
  { word: "GREECE", row: 3, col: 0, dir: "v" },
  { word: "LAHORE", row: 15, col: 0, dir: "h" }
];

function makeDemoTile(letter, placedBy) {
  return {
    letter,
    value: LETTER_VALUES[letter],
    isBlank: false,
    locked: true,
    placedBy
  };
}

function removeTileFromBag(letter) {
  const index = bag.findIndex((tile) => tile.letter === letter);
  if (index !== -1) {
    bag.splice(index, 1);
  }
}

function makeDemoRack(letters) {
  const rack = Array.from({ length: RACK_SIZE }, () => null);
  letters.forEach((letter, index) => {
    rack[index] = {
      letter,
      value: LETTER_VALUES[letter],
      isBlank: letter === "?"
    };
  });
  return rack;
}

const PRACTICE_TEST_RACK_WORDS = ["BARCELONA", "BERLIN"];
let practiceTestWordIndex = 0;

function isPracticeTestRacksEnabled() {
  return !shouldStartDemoGame();
}

function resetPracticeTestRackState() {
  practiceTestWordIndex = 0;
}

function makePracticeTestTile(letter) {
  return {
    letter,
    value: LETTER_VALUES[letter],
    isBlank: false
  };
}

function injectWordIntoRack(playerIndex, word) {
  const letters = word.split("");
  const rack = players[playerIndex].rack;
  ensureRackSlots(rack);

  for (let slot = 0; slot < letters.length && slot < RACK_SIZE; slot += 1) {
    if (rack[slot]) {
      bag.push(rack[slot]);
    }
    rack[slot] = makePracticeTestTile(letters[slot]);
  }

  return true;
}

/** Seed the active player's rack with the next test word (P1: BARCELONA, P2: BERLIN). */
function applyPracticeTestRackForTurnStart(playerIndex) {
  if (!isPracticeTestRacksEnabled()) {
    return;
  }
  if (practiceTestWordIndex >= PRACTICE_TEST_RACK_WORDS.length) {
    return;
  }
  injectWordIntoRack(playerIndex, PRACTICE_TEST_RACK_WORDS[practiceTestWordIndex]);
  practiceTestWordIndex += 1;
}

function placeDemoWords() {
  let placedBy = 0;
  DEMO_WORD_PLACEMENTS.forEach(({ word, row, col, dir }) => {
    for (let i = 0; i < word.length; i += 1) {
      const targetRow = dir === "h" ? row : row + i;
      const targetCol = dir === "h" ? col + i : col;
      const letter = word[i];
      if (board[targetRow][targetCol].tile) {
        continue;
      }
      board[targetRow][targetCol].tile = makeDemoTile(letter, placedBy);
      removeTileFromBag(letter);
    }
    placedBy = placedBy === 0 ? 1 : 0;
  });
}

function initDemoGame() {
  window.GlobblePracticeResume?.clearSaved();
  board = Array.from({ length: BOARD_ROWS }, (_, row) =>
    Array.from({ length: BOARD_COLS }, (_, col) => ({
      premium: PREMIUM_LAYOUT[row][col],
      tile: null
    }))
  );
  bag = createTileBag();
  shuffleInPlace(bag);
  placeDemoWords();
  players = [
    {
      name: "Player 1",
      score: 147,
      rack: makeDemoRack(["A", "E", "R", "T", "S", "N", "L", "O", "D", "I"])
    },
    {
      name: "Player 2",
      score: 132,
      rack: makeDemoRack(["G", "H", "U", "P", "M", "C", "B", "K", "W", "Y"])
    }
  ];
  bag.push(...createTileBag().slice(0, 55));
  currentPlayer = 0;
  selectedRackIndex = null;
  turnPlacedTiles = [];
  gameStarted = true;
  window.GlobblePendingWordGlow?.resetGlowState();
  setMessage("Demo board loaded (legal words only). Tap New Game for a fresh start.");
  render();
}

function shouldStartDemoGame() {
  const params = new URLSearchParams(window.location.search);
  return params.has("demo");
}

function createTileBag() {
  const tiles = [];
  const scaledDistribution = getScaledTileDistribution();

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

function getScaledTileDistribution() {
  const baseEntries = Object.entries(TILE_DISTRIBUTION_BASE);
  const baseTotal = baseEntries.reduce((sum, [, count]) => sum + count, 0);
  const scale = PACK_SIZE / baseTotal;

  const raw = baseEntries.map(([letter, count]) => ({
    letter,
    rawCount: count * scale
  }));

  // Largest remainder method so the scaled counts sum to PACK_SIZE.
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

function drawToRack(playerIndex) {
  const rack = players[playerIndex].rack;
  ensureRackSlots(rack);
  for (let i = 0; i < RACK_SIZE && bag.length > 0; i += 1) {
    if (!rack[i]) {
      rack[i] = bag.pop();
    }
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
    preferredIndex < RACK_SIZE
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

function restoreTileToRack(rack, tile, preferredIndex) {
  const slot = resolveRackSlot(rack, preferredIndex);
  ensureRackSlots(rack);
  rack[slot] = tileBackToRack(tile);
  return slot;
}

function assignTileToRackSlot(rack, tile, preferredIndex, fallbackIndex) {
  ensureRackSlots(rack);
  if (
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < RACK_SIZE &&
    !rack[preferredIndex]
  ) {
    rack[preferredIndex] = tileBackToRack(tile);
    return preferredIndex;
  }
  return restoreTileToRack(rack, tile, fallbackIndex);
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
  const srcByTile = new Map(tiles.map((tile, j) => [tile, occupied[j]]));

  shuffleInPlace(tiles);

  occupied.forEach((slot) => {
    rack[slot] = null;
  });

  const slotSources = new Array(RACK_SIZE).fill(null);
  occupied.forEach((destSlot, j) => {
    const tile = tiles[j];
    rack[destSlot] = tile;
    slotSources[destSlot] = srcByTile.get(tile);
  });
  return slotSources;
}

function moveRackSlot(rack, fromIndex, toIndex) {
  if (window.GlobbleRackReorder?.moveRackSlots) {
    return window.GlobbleRackReorder.moveRackSlots(rack, fromIndex, toIndex, RACK_SIZE);
  }
  return false;
}

function render() {
  renderBoard();
  renderRack();
  renderScores();
  renderBagCount();
  turnInfoEl.textContent = `${players[currentPlayer].name} turn`;
  window.GlobbleBoardZoom?.syncFromTiles(turnPlacedTiles, boardEl);
}

function getBoardCellEl(row, col) {
  return boardEl?.querySelector(`[data-row="${row}"][data-col="${col}"]`) ?? null;
}

/** Empty cell whose box contains the point (ignores tiles/stacking — fixes drops beside placed tiles). */
function getEmptyCellAtClient(clientX, clientY) {
  if (!boardEl) {
    return null;
  }
  const cells = boardEl.querySelectorAll(".cell");
  for (const cellEl of cells) {
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      continue;
    }
    if (board[row][col].tile) {
      continue;
    }
    const rect = cellEl.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX < rect.right &&
      clientY >= rect.top &&
      clientY < rect.bottom
    ) {
      return cellEl;
    }
  }
  return null;
}

function clearPendingWordGlowClasses() {
  boardEl?.querySelectorAll(".cell.pending-valid-word, .cell.pending-valid-word-fade").forEach((cellEl) => {
    cellEl.classList.remove("pending-valid-word", "pending-valid-word-fade");
  });
}

function syncBoardCellEl(row, col, { bindPlaceTip = true } = {}) {
  const cell = board[row][col];
  const cellEl = getBoardCellEl(row, col);
  if (!cellEl) {
    return;
  }
  const cellKey = `${row},${col}`;
  const qwPendingKeys =
    window.GlobblePendingWordGlow?.getQwPlatedCellKeys?.({
      board,
      newTiles: turnPlacedTiles.map((t) => ({ row: t.row, col: t.col })),
      dictionary
    }) ?? new Set();
  const showQwGold = !!cell.tile?.qwPlated || qwPendingKeys.has(cellKey);
  cellEl.classList.toggle("cell-qw-word", showQwGold);
  cellEl.classList.remove("pending-valid-word", "pending-valid-word-fade");
  cellEl.replaceChildren();
  if (!cell.tile) {
    const premiumLabel = document.createElement("span");
    premiumLabel.className = "premium-label";
    premiumLabel.textContent = premiumText(cell.premium, row, col);
    cellEl.appendChild(premiumLabel);
    return;
  }
  const tileForEl =
    showQwGold && !cell.tile.qwPlated ? { ...cell.tile, qwPlated: true } : cell.tile;
  const tileEl = createTileElement(tileForEl, false);
  if (!cell.tile.locked) {
    setTileDraggable(tileEl, true);
  }
  cellEl.appendChild(tileEl);
  if (bindPlaceTip && cell.tile.locked && window.GlobblePlaceInfo) {
    window.GlobblePlaceInfo.bindLockedCellPlaceTip(cellEl, board, row, col);
  }
}

function bindSubmittedTilePlaceTips(lockedPositions) {
  lockedPositions.forEach(({ row, col }) => {
    const cellEl = getBoardCellEl(row, col);
    if (cellEl && window.GlobblePlaceInfo) {
      window.GlobblePlaceInfo.bindLockedCellPlaceTip(cellEl, board, row, col);
    }
  });
}

let boardEventsBound = false;

function bindBoardEvents() {
  if (boardEventsBound || !boardEl) {
    return;
  }
  boardEventsBound = true;

  boardEl.addEventListener("click", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl || !boardEl.contains(cellEl)) {
      return;
    }
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      onCellClick(row, col);
    }
  });

  boardEl.addEventListener("dragover", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl || !boardEl.contains(cellEl)) {
      return;
    }
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      onCellDragOver(event, row, col);
    }
  });

  boardEl.addEventListener("drop", (event) => {
    const cellEl = event.target.closest(".cell");
    if (!cellEl || !boardEl.contains(cellEl)) {
      return;
    }
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      onCellDrop(event, row, col);
    }
  });

  boardEl.addEventListener("dragstart", (event) => {
    const tileEl = event.target.closest(".tile");
    if (!tileEl || !tileEl.draggable || !boardEl.contains(tileEl)) {
      return;
    }
    const cellEl = tileEl.closest(".cell");
    if (!cellEl) {
      return;
    }
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      onTurnTileDragStart(event, row, col);
    }
  });

  boardEl.addEventListener("dragend", onAnyDragEnd);
}

bindBoardEvents();

function renderBagCount() {
  if (!bagCountEl) {
    return;
  }
  bagCountEl.textContent = `${bag.length} left in the bag`;
  syncGameStatsButtonsVisibility();
  schedulePlayableWordCount();
}

let playableWordCountJobId = 0;
let playableWordCountWorker = null;

function runPlayableWordCountOnMainThread(jobId) {
  window.setTimeout(() => {
    if (jobId !== playableWordCountJobId || !playableWordsCountEl) {
      return;
    }
    const count = window.GlobblePlayableWords?.countPlayableWords?.({
      board,
      rack: players[currentPlayer]?.rack ?? [],
      dictionary,
      startSquare: START_SQUARE
    });
    if (jobId !== playableWordCountJobId || !playableWordsCountEl) {
      return;
    }
    playableWordsCountEl.textContent = formatPlayableWordCount(count);
    syncGameStatsButtonsVisibility();
  }, 0);
}

function getPlayableWordCountWorker() {
  if (playableWordCountWorker || typeof Worker === "undefined") {
    return playableWordCountWorker;
  }
  try {
    playableWordCountWorker = new Worker("./playable-word-count-worker.js");
    playableWordCountWorker.onmessage = (event) => {
      const { jobId, count, error } = event.data;
      if (jobId !== playableWordCountJobId || !playableWordsCountEl) {
        return;
      }
      if (error) {
        runPlayableWordCountOnMainThread(jobId);
        return;
      }
      playableWordsCountEl.textContent = formatPlayableWordCount(count);
      syncGameStatsButtonsVisibility();
    };
    playableWordCountWorker.onerror = () => {
      const jobId = playableWordCountJobId;
      playableWordCountWorker?.terminate();
      playableWordCountWorker = null;
      runPlayableWordCountOnMainThread(jobId);
    };
  } catch {
    playableWordCountWorker = null;
  }
  return playableWordCountWorker;
}

function formatPlayableWordCount(count) {
  return (
    window.GlobblePlayableWords?.formatPlayableWordBucket?.(count) ??
    (typeof count === "number" && Number.isFinite(count) ? `${count} words possible` : "… words possible")
  );
}

function syncGameStatsButtonsVisibility() {
  if (bagCountEl) {
    bagCountEl.disabled = !bagCountEl.textContent;
  }
  if (playableWordsCountEl) {
    playableWordsCountEl.disabled = !playableWordsCountEl.textContent;
  }
}

function boardSnapshotForPlayableCount() {
  return board.map((row) =>
    row.map((cell) => ({
      premium: cell.premium,
      tile: cell.tile
        ? {
            letter: cell.tile.letter,
            value: cell.tile.value,
            isBlank: !!cell.tile.isBlank,
            locked: !!cell.tile.locked
          }
        : null
    }))
  );
}

function rackSnapshotForPlayableCount() {
  const rack = players[currentPlayer]?.rack ?? [];
  return rack.map((tile) =>
    tile
      ? {
          letter: tile.letter,
          value: tile.value,
          isBlank: !!tile.isBlank
        }
      : null
  );
}

function schedulePlayableWordCount() {
  if (!playableWordsCountEl) {
    return;
  }

  if (!gameStarted) {
    playableWordsCountEl.textContent = "";
    syncGameStatsButtonsVisibility();
    return;
  }

  // Freeze count for the turn once tiles leave the rack; refresh after submit.
  if (turnPlacedTiles.length > 0) {
    return;
  }

  const rack = players[currentPlayer]?.rack ?? [];
  if (!rack.some(Boolean)) {
    playableWordsCountEl.textContent = formatPlayableWordCount(0);
    syncGameStatsButtonsVisibility();
    return;
  }

  const jobId = ++playableWordCountJobId;
  playableWordsCountEl.textContent = formatPlayableWordCount(NaN);
  syncGameStatsButtonsVisibility();

  const payload = {
    jobId,
    board: boardSnapshotForPlayableCount(),
    rack: rackSnapshotForPlayableCount(),
    startSquare: { row: START_SQUARE.row, col: START_SQUARE.col }
  };

  const worker = getPlayableWordCountWorker();
  if (worker) {
    worker.postMessage(payload);
    return;
  }

  runPlayableWordCountOnMainThread(jobId);
}

function renderBoard() {
  if (window.GlobblePlaceInfo) {
    window.GlobblePlaceInfo.hidePlaceTip();
  }
  clearActiveTileDragState();
  const pendingNewTiles = turnPlacedTiles.map((t) => ({ row: t.row, col: t.col }));
  const qwPendingKeys =
    pendingNewTiles.length && window.GlobblePendingWordGlow?.getQwPlatedCellKeys
      ? window.GlobblePendingWordGlow.getQwPlatedCellKeys({
          board,
          newTiles: pendingNewTiles,
          dictionary
        })
      : new Set();
  boardEl.style.setProperty("--board-cols", String(BOARD_COLS));
  boardEl.style.setProperty("--board-rows", String(BOARD_ROWS));
  const frag = document.createDocumentFragment();
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const cell = board[row][col];
      const cellEl = document.createElement("div");
      cellEl.className = `cell ${cell.premium}`;
      const cellKey = `${row},${col}`;
      const showQwGold = !!cell.tile?.qwPlated || qwPendingKeys.has(cellKey);
      if (showQwGold) {
        cellEl.classList.add("cell-qw-word");
      }
      if (row === START_SQUARE.row && col === START_SQUARE.col) {
        cellEl.classList.add("cell-start");
      }
      cellEl.setAttribute("role", "gridcell");
      cellEl.dataset.row = String(row);
      cellEl.dataset.col = String(col);

      if (!cell.tile) {
        const premiumLabel = document.createElement("span");
        premiumLabel.className = "premium-label";
        premiumLabel.textContent = premiumText(cell.premium, row, col);
        cellEl.appendChild(premiumLabel);
      } else {
        const tileForEl =
          showQwGold && !cell.tile.qwPlated ? { ...cell.tile, qwPlated: true } : cell.tile;
        const tileEl = createTileElement(tileForEl, false);
        if (!cell.tile.locked) {
          setTileDraggable(tileEl, true);
        }
        cellEl.appendChild(tileEl);
        if (cell.tile.locked && window.GlobblePlaceInfo) {
          window.GlobblePlaceInfo.bindLockedCellPlaceTip(cellEl, board, row, col);
        }
      }
      frag.appendChild(cellEl);
    }
  }
  boardEl.replaceChildren(frag);
}

let rackEventsBound = false;

function bindRackEvents() {
  if (rackEventsBound || !rackEl) {
    return;
  }
  rackEventsBound = true;

  rackEl.addEventListener("click", (event) => {
    if (
      rackShuffleAnimating ||
      rackShufflePendingAnimation ||
      rackEl.dataset.shuffling === "1"
    ) {
      return;
    }
    const tileEl = event.target.closest(".rack .tile");
    if (!tileEl || !rackEl.contains(tileEl)) {
      return;
    }
    const slotEl = tileEl.closest(".rack-slot");
    const index = Number(slotEl?.dataset.rackSlot);
    if (!Number.isInteger(index)) {
      return;
    }
    selectedRackIndex = index === selectedRackIndex ? null : index;
    renderRack();
  });

  rackEl.addEventListener("dragstart", (event) => {
    const tileEl = event.target.closest(".rack .tile");
    if (!tileEl || !tileEl.draggable || !rackEl.contains(tileEl)) {
      return;
    }
    const slotEl = tileEl.closest(".rack-slot");
    const index = Number(slotEl?.dataset.rackSlot);
    if (Number.isInteger(index)) {
      onRackTileDragStart(event, index);
    }
  });

  rackEl.addEventListener("dragend", onAnyDragEnd);
}

bindRackEvents();

function cloneRackSnapshot(rack) {
  ensureRackSlots(rack);
  return rack.map((tile) => (tile ? { ...tile } : null));
}

function renderRack(dealIn = false) {
  if (rackEl.dataset.shuffling === "1") {
    return;
  }
  if (rackShuffleAnimating && !rackEl.classList.contains("is-shuffle-prep")) {
    return;
  }
  if (rackShufflePendingAnimation) {
    rackEl.classList.add("is-shuffle-prep");
  }
  clearActiveTileDragState();
  const frag = document.createDocumentFragment();
  const rack = players[currentPlayer].rack;
  ensureRackSlots(rack);
  for (let index = 0; index < RACK_SIZE; index += 1) {
    const slotEl = document.createElement("div");
    slotEl.className = "rack-slot";
    slotEl.dataset.rackSlot = String(index);

    const tile = rack[index];
    if (tile) {
      const tileEl = createTileElement(tile, true);
      setTileDraggable(tileEl, true);
      if (index === selectedRackIndex) {
        tileEl.classList.add("selected");
      }
      if (dealIn) {
        tileEl.classList.add("tile-deal-in");
        tileEl.style.animationDelay = `${index * 8}ms`;
      }
      slotEl.appendChild(tileEl);
    }

    frag.appendChild(slotEl);
  }
  rackEl.replaceChildren(frag);

  if (rackShufflePendingAnimation) {
    void maybeRunShuffleAnimation();
  }
}

async function maybeRunShuffleAnimation() {
  if (!rackShufflePendingAnimation || rackShuffleAnimating) {
    return;
  }
  rackShufflePendingAnimation = false;

  const tileCount = rackEl.querySelectorAll(".rack-slot .tile").length;
  if (tileCount < 2 || !window.GlobbleRackShuffle) {
    shufflePrevRack = null;
    rackEl.classList.remove("is-shuffle-prep");
    return;
  }

  const slotSources = shufflePrevRack
    ? window.GlobbleRackShuffle.computeSlotSources(
        shufflePrevRack,
        players[currentPlayer].rack,
        RACK_SIZE
      )
    : null;
  shufflePrevRack = null;

  rackShuffleAnimating = true;
  shuffleRackBtn.disabled = true;
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await window.GlobbleRackShuffle.play(rackEl, { slotSources, button: shuffleRackBtn });
  } finally {
    rackShuffleAnimating = false;
    shuffleRackBtn.disabled = false;
  }
}

function renderScores() {
  player1ScoreEl.textContent = `Player 1: ${players[0].score}`;
  player2ScoreEl.textContent = `Player 2: ${players[1].score}`;
  player1ScoreEl.classList.toggle("active", currentPlayer === 0);
  player2ScoreEl.classList.toggle("active", currentPlayer === 1);
}

function tileBackToRack(tile) {
  if (tile.isBlank) {
    return { ...tile, letter: "?", value: 0, locked: false };
  }
  return { ...tile, locked: false };
}

function setTileDraggable(tileEl, enabled) {
  tileEl.draggable = enabled;
  if (enabled) {
    tileEl.setAttribute("draggable", "true");
  } else {
    tileEl.removeAttribute("draggable");
  }
}

function createTileElement(tile, interactive) {
  const tileEl = document.createElement("div");
  tileEl.className = "tile";
  if (interactive) {
    tileEl.setAttribute("role", "button");
    tileEl.tabIndex = 0;
  }
  const isUnassignedBlank = tile.isBlank && tile.letter === "?";
  if (isUnassignedBlank) {
    tileEl.classList.add("tile-blank");
  }
  if (tile.qwPlated) {
    tileEl.classList.add("tile-qw-plated");
  }
  const letterEl = document.createElement("span");
  letterEl.textContent = isUnassignedBlank ? "" : tile.letter;
  tileEl.appendChild(letterEl);
  const valueEl = document.createElement("span");
  valueEl.className = "value";
  valueEl.textContent = tile.value;
  tileEl.appendChild(valueEl);
  return tileEl;
}

function onCellClick(row, col) {
  if (!gameStarted) {
    return;
  }
  const cell = board[row][col];
  if (cell.tile && !cell.tile.locked) {
    void removeTurnTile(row, col);
    return;
  }
  if (!cell.tile) {
    setMessage("Drag a tile from your rack onto the board.");
  }
}

function onRackTileDragStart(event, rackIndex) {
  draggingRackIndex = rackIndex;
  draggingTurnTilePos = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `rack:${rackIndex}`);
  }
  if (window.GlobbleRackReorder) {
    window.GlobbleRackReorder.setOpaqueDragImage(event);
  }
}

function onTurnTileDragStart(event, row, col) {
  draggingTurnTilePos = { row, col };
  draggingRackIndex = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `board:${row},${col}`);
  }
  if (window.GlobbleRackReorder) {
    window.GlobbleRackReorder.setOpaqueDragImage(event);
  }
}

function onAnyDragEnd() {
  if (window.GlobbleRackReorder) {
    window.GlobbleRackReorder.finishDragGhost();
  }
  rackEl.classList.remove("rack-reorder-active");
  draggingRackIndex = null;
  draggingTurnTilePos = null;
}

function clearActiveTileDragState() {
  window.GlobbleRackReorder?.finishDragGhost();
  rackEl?.classList.remove("rack-reorder-active");
}

async function handlePointerTileDrop(clientX, clientY) {
  const emptyCellEl = getEmptyCellAtClient(clientX, clientY);
  if (emptyCellEl) {
    const row = Number(emptyCellEl.dataset.row);
    const col = Number(emptyCellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      if (draggingRackIndex !== null) {
        await placeRackTile(row, col, draggingRackIndex);
        return;
      }
      if (draggingTurnTilePos) {
        moveTurnTile(row, col, draggingTurnTilePos.row, draggingTurnTilePos.col);
      }
      return;
    }
  }

  const target = document.elementFromPoint(clientX, clientY);

  const cellEl = target instanceof Element ? target.closest(".cell") : null;
  if (cellEl && boardEl?.contains(cellEl)) {
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      if (draggingRackIndex !== null) {
        await placeRackTile(row, col, draggingRackIndex);
        return;
      }
      if (draggingTurnTilePos) {
        moveTurnTile(row, col, draggingTurnTilePos.row, draggingTurnTilePos.col);
      }
      return;
    }
  }

  const slotEl = target instanceof Element ? target.closest(".rack-slot") : null;
  if (!slotEl || !rackEl?.contains(slotEl)) {
    return;
  }

  const slotIndex = Number(slotEl.dataset.rackSlot);
  if (!Number.isInteger(slotIndex)) {
    return;
  }

  if (draggingTurnTilePos) {
    void removeTurnTile(
      draggingTurnTilePos.row,
      draggingTurnTilePos.col,
      slotIndex,
      { clientX, clientY }
    );
    return;
  }

  if (draggingRackIndex !== null && window.GlobbleRackReorder) {
    const toIndex = window.GlobbleRackReorder.getDropIndex(
      { clientX, clientY },
      rackEl,
      draggingRackIndex
    );
    if (draggingRackIndex !== toIndex) {
      const rack = players[currentPlayer].rack;
      if (moveRackSlot(rack, draggingRackIndex, toIndex)) {
        selectedRackIndex = toIndex;
        renderRack();
      }
    }
  }
}

function onCellDragOver(event, row, col) {
  if (canDropOnCell(row, col)) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }
}

async function onCellDrop(event, row, col) {
  event.preventDefault();

  let targetRow = row;
  let targetCol = col;
  if (board[targetRow][targetCol].tile) {
    const emptyCellEl = getEmptyCellAtClient(event.clientX, event.clientY);
    if (!emptyCellEl) {
      onAnyDragEnd();
      return;
    }
    targetRow = Number(emptyCellEl.dataset.row);
    targetCol = Number(emptyCellEl.dataset.col);
    if (!Number.isInteger(targetRow) || !Number.isInteger(targetCol)) {
      onAnyDragEnd();
      return;
    }
  }

  if (draggingRackIndex !== null) {
    await placeRackTile(targetRow, targetCol, draggingRackIndex);
    onAnyDragEnd();
    return;
  }

  if (draggingTurnTilePos) {
    moveTurnTile(targetRow, targetCol, draggingTurnTilePos.row, draggingTurnTilePos.col);
    onAnyDragEnd();
  }
}

function canDropOnCell(row, col) {
  if (board[row][col].tile) {
    return false;
  }
  if (draggingRackIndex !== null) {
    return true;
  }
  if (draggingTurnTilePos) {
    return draggingTurnTilePos.row !== row || draggingTurnTilePos.col !== col;
  }
  return false;
}

async function placeRackTile(row, col, rackIndex) {
  if (board[row][col].tile) {
    return;
  }
  const rack = players[currentPlayer].rack;
  ensureRackSlots(rack);
  const chosenTile = rack[rackIndex];
  if (!chosenTile) {
    return;
  }

  const tile = { ...chosenTile, placedBy: currentPlayer, locked: false };
  if (tile.isBlank) {
    const blankLetter = window.GlobbleBlankPicker
      ? await window.GlobbleBlankPicker.pickLetter()
      : null;
    if (!blankLetter || !/^[a-z]$/i.test(blankLetter)) {
      setMessage("Blank tile needs a letter A–Z.");
      return;
    }
    tile.letter = blankLetter.toUpperCase();
    tile.value = 0;
  }

  rack[rackIndex] = null;
  selectedRackIndex = null;
  board[row][col].tile = tile;
  turnPlacedTiles.push({ row, col, tile, rackIndex });
  render();
}

function moveTurnTile(targetRow, targetCol, sourceRow, sourceCol) {
  if (board[targetRow][targetCol].tile) {
    return;
  }
  const sourceCell = board[sourceRow][sourceCol];
  if (!sourceCell.tile || sourceCell.tile.locked) {
    return;
  }

  const movedTile = sourceCell.tile;
  sourceCell.tile = null;
  board[targetRow][targetCol].tile = movedTile;

  const turnIdx = turnPlacedTiles.findIndex((entry) => entry.row === sourceRow && entry.col === sourceCol);
  if (turnIdx !== -1) {
    turnPlacedTiles[turnIdx].row = targetRow;
    turnPlacedTiles[turnIdx].col = targetCol;
  }

  render();
}

async function removeTurnTile(row, col, preferredRackSlot = null, dropPoint = null) {
  const idx = turnPlacedTiles.findIndex((entry) => entry.row === row && entry.col === col);
  if (idx === -1) {
    return;
  }
  const { tile, rackIndex } = turnPlacedTiles[idx];
  const cellEl = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  const boardTileRect = cellEl?.querySelector(".tile")?.getBoundingClientRect();
  const fromRect = window.GlobbleRackReturn?.resolveQuickFromRect?.({
    boardRect: boardTileRect,
    dragRect: window.GlobbleRackReorder?.getActiveDragRect?.(),
    dropPoint
  }) ?? boardTileRect;
  window.GlobbleRackReorder?.finishDragGhost();

  turnPlacedTiles.splice(idx, 1);
  board[row][col].tile = null;
  const rack = players[currentPlayer].rack;
  const slot = assignTileToRackSlot(rack, tile, preferredRackSlot, rackIndex);
  const toRect = window.GlobbleRackReturn?.getSlotRect(rackEl, slot);

  renderBoard();
  renderRack();
  window.GlobbleBoardZoom?.syncFromTiles(turnPlacedTiles, boardEl);

  const slotEl = rackEl.querySelector(`.rack-slot[data-rack-slot="${slot}"]`);
  const slotTileEl = slotEl?.querySelector(".tile");
  if (slotTileEl) {
    slotTileEl.style.visibility = "hidden";
  }

  const finishReturn = () => {
    if (slotTileEl) {
      slotTileEl.style.visibility = "";
    }
    slotEl?.classList.add("rack-slot-pop");
    window.setTimeout(() => slotEl?.classList.remove("rack-slot-pop"), 100);
  };

  if (fromRect && toRect && window.GlobbleRackReturn) {
    void window.GlobbleRackReturn.playQuick({ fromRect, toRect, tile }).finally(finishReturn);
  } else {
    finishReturn();
  }
}

async function recallTurnTiles({ animate = true } = {}) {
  if (turnPlacedTiles.length === 0) {
    return;
  }

  if (!animate) {
    const clearedCells = turnPlacedTiles.map(({ row, col }) => ({ row, col }));
    for (const { row, col, tile, rackIndex } of turnPlacedTiles) {
      board[row][col].tile = null;
      restoreTileToRack(players[currentPlayer].rack, tile, rackIndex);
    }
    turnPlacedTiles = [];
    selectedRackIndex = null;
    window.GlobblePendingWordGlow?.resetGlowState();
    window.GlobbleBoardZoom?.reset(false);
    clearedCells.forEach(({ row, col }) => syncBoardCellEl(row, col));
    renderRack();
    return;
  }

  const pending = turnPlacedTiles.map(({ row, col, tile, rackIndex }) => {
    const cellEl = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    const tileEl = cellEl?.querySelector(".tile") ?? null;
    const fromRect = tileEl?.getBoundingClientRect() ?? null;
    return { row, col, tile, rackIndex, fromRect, tileEl };
  });

  for (const { row, col, tile, rackIndex } of pending) {
    board[row][col].tile = null;
    restoreTileToRack(players[currentPlayer].rack, tile, rackIndex);
  }
  turnPlacedTiles = [];
  selectedRackIndex = null;
  window.GlobblePendingWordGlow?.resetGlowState();
  window.GlobbleBoardZoom?.reset(false);
  pending.forEach(({ row, col }) => syncBoardCellEl(row, col));
  renderRack();

  const hiddenTiles = pending.map(({ rackIndex }) => {
    const slotEl = rackEl.querySelector(`.rack-slot[data-rack-slot="${rackIndex}"]`);
    const slotTileEl = slotEl?.querySelector(".tile");
    if (slotTileEl) {
      slotTileEl.style.visibility = "hidden";
    }
    return { slotEl, slotTileEl };
  });

  if (window.GlobbleRackReturn) {
    pending.forEach((item) => {
      const toRect = window.GlobbleRackReturn.getSlotRect(rackEl, item.rackIndex);
      if (!item.fromRect || !toRect) {
        return;
      }
      void window.GlobbleRackReturn.playQuick({
        fromRect: item.fromRect,
        toRect,
        tile: item.tile,
        sourceEl: item.tileEl
      });
    });
  }

  window.setTimeout(() => {
    for (const { slotEl, slotTileEl } of hiddenTiles) {
      if (slotTileEl) {
        slotTileEl.style.visibility = "";
      }
      slotEl?.classList.add("rack-slot-pop");
      window.setTimeout(() => slotEl?.classList.remove("rack-slot-pop"), 100);
    }
    if (recallTilesBtn) {
      recallTilesBtn.disabled = false;
    }
  }, window.GlobbleRackReturn?.QUICK_DURATION_MS ?? 55);
}

async function submitTurn() {
  if (turnPlacedTiles.length === 0) {
    setMessage("Place at least one tile.");
    return;
  }

  const validation = validateTurn();
  if (!validation.ok) {
    if (validation.error.startsWith("Invalid word:")) {
      window.GlobbleInvalidWordToast?.show();
      if (submitTurnBtn) {
        submitTurnBtn.disabled = true;
      }
      try {
        await recallTurnTiles();
      } finally {
        if (submitTurnBtn) {
          submitTurnBtn.disabled = false;
        }
      }
      return;
    }
    setMessage(validation.error);
    return;
  }

  const scoredWords = validation.words;
  const wikiArticlePromise = window.GlobbleWordWikipediaReveal?.prefetch?.(scoredWords);

  const lockedPositions = turnPlacedTiles.map(({ row, col }) => ({ row, col }));
  const submittingPlayer = currentPlayer;
  const points = scoreWordsAndMarkQwPlating(scoredWords, turnPlacedTiles);
  const scoreLine = `${players[submittingPlayer].name} scores ${points}.`;

  players[submittingPlayer].score += points;
  turnPlacedTiles.forEach(({ row, col }) => {
    board[row][col].tile.locked = true;
  });
  const qwWordScored = scoredWords.some((word) =>
    word.cells.some(({ row, col }) => board[row][col].tile?.qwPlated)
  );
  turnPlacedTiles = [];
  window.GlobblePendingWordGlow?.resetGlowState();
  window.GlobbleBoardZoom?.reset(false);

  if (window.GlobbleWordWikipediaReveal?.show) {
    if (submitTurnBtn) {
      submitTurnBtn.disabled = true;
    }
    try {
      await window.GlobbleWordWikipediaReveal.show(scoredWords, {
        scoreLine,
        articlePromise: wikiArticlePromise
      });
    } finally {
      if (submitTurnBtn) {
        submitTurnBtn.disabled = false;
      }
    }
  }

  renderBoard();

  drawToRack(submittingPlayer);

  const gameOver = checkGameOver();
  if (!gameOver) {
    currentPlayer = submittingPlayer === 0 ? 1 : 0;
    applyPracticeTestRackForTurnStart(currentPlayer);
  }
  selectedRackIndex = null;

  setMessage(scoreLine);
  render();

  if (gameOver) {
    setMessage(gameOver, scoredWords);
    render();
    return;
  }

  const deferPlaceDetails = () => {
    setMessage(scoreLine, scoredWords);
    if (qwWordScored) {
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        for (let col = 0; col < BOARD_COLS; col += 1) {
          if (!board[row][col].tile?.qwPlated) {
            continue;
          }
          const cellEl = getBoardCellEl(row, col);
          if (cellEl && window.GlobblePlaceInfo) {
            window.GlobblePlaceInfo.bindLockedCellPlaceTip(cellEl, board, row, col);
          }
        }
      }
      return;
    }
    bindSubmittedTilePlaceTips(lockedPositions);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(deferPlaceDetails, { timeout: 120 });
  } else {
    window.setTimeout(deferPlaceDetails, 0);
  }
}

function validateTurn() {
  const newTiles = [...turnPlacedTiles];
  const allLocked = getAllLockedTiles();
  const isFirstMove = allLocked.length === 0;

  const sameRow = newTiles.every((t) => t.row === newTiles[0].row);
  const sameCol = newTiles.every((t) => t.col === newTiles[0].col);
  if (!sameRow && !sameCol) {
    return { ok: false, error: "Tiles must be in one row or one column." };
  }

  if (!isContiguous(newTiles, sameRow ? "row" : "col")) {
    return { ok: false, error: "Tiles must be contiguous." };
  }

  if (isFirstMove) {
    const coversStart = newTiles.some((t) => t.row === START_SQUARE.row && t.col === START_SQUARE.col);
    if (!coversStart) {
      return { ok: false, error: "First move must touch the center start square." };
    }
  } else if (!touchesExisting(newTiles)) {
    return { ok: false, error: "Move must connect to existing tiles." };
  }

  const words = collectWordsFromMove(newTiles);
  if (words.length === 0) {
    return { ok: false, error: "Move must form a valid word." };
  }

  for (const word of words) {
    if (!dictionary.has(word.text)) {
      return { ok: false, error: `Invalid word: ${word.text}` };
    }
  }

  return { ok: true, words };
}

/** Score all words and gold-plate any word that includes a new tile on a QW square. */
function scoreWordsAndMarkQwPlating(words, turnPlacements) {
  const newKeys = new Set(turnPlacements.map(({ row, col }) => `${row},${col}`));
  let total = 0;

  words.forEach((word) => {
    let wordBase = 0;
    let wordMultiplier = 1;
    let usesQw = word.cells.some(
      ({ row, col }) => board[row][col].premium === "qw" && newKeys.has(`${row},${col}`)
    );

    word.cells.forEach(({ row, col, tile }) => {
      if (!tile) {
        return;
      }
      let letterValue = tile.value;
      if (!tile.locked) {
        const premium = board[row][col].premium;
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

    total += wordBase * wordMultiplier;

    if (usesQw) {
      word.cells.forEach(({ row, col }) => {
        const boardTile = board[row][col].tile;
        if (boardTile) {
          boardTile.qwPlated = true;
        }
      });
    }
  });

  if (turnPlacements.length === RACK_SIZE) {
    total += FULL_RACK_BONUS;
  }

  return total;
}

function isContiguous(newTiles, axis) {
  if (newTiles.length === 1) {
    return true;
  }
  const fixed = axis === "row" ? newTiles[0].row : newTiles[0].col;
  const indices = newTiles.map((t) => (axis === "row" ? t.col : t.row)).sort((a, b) => a - b);
  for (let i = indices[0]; i <= indices[indices.length - 1]; i += 1) {
    const row = axis === "row" ? fixed : i;
    const col = axis === "row" ? i : fixed;
    if (!board[row][col].tile) {
      return false;
    }
  }
  return true;
}

function touchesExisting(newTiles) {
  return newTiles.some(({ row, col }) => {
    const neighbors = [
      [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
    ];
    return neighbors.some(([r, c]) => inBounds(r, c) && board[r][c].tile && board[r][c].tile.locked);
  });
}

function collectWordsFromMove(newTiles) {
  const seen = new Set();
  const words = [];

  newTiles.forEach(({ row, col }) => {
    const horizontal = getWordAt(row, col, 0, -1, 0, 1);
    if (horizontal.text.length > 1 && !seen.has(horizontal.key)) {
      seen.add(horizontal.key);
      words.push(horizontal);
    }
    const vertical = getWordAt(row, col, -1, 0, 1, 0);
    if (vertical.text.length > 1 && !seen.has(vertical.key)) {
      seen.add(vertical.key);
      words.push(vertical);
    }
  });

  return words;
}

function getWordAt(row, col, backRowStep, backColStep, forwardRowStep, forwardColStep) {
  let startRow = row;
  let startCol = col;
  while (inBounds(startRow + backRowStep, startCol + backColStep)
    && board[startRow + backRowStep][startCol + backColStep].tile) {
    startRow += backRowStep;
    startCol += backColStep;
  }

  const cells = [];
  let r = startRow;
  let c = startCol;
  while (inBounds(r, c) && board[r][c].tile) {
    cells.push({ row: r, col: c, tile: board[r][c].tile });
    r += forwardRowStep;
    c += forwardColStep;
  }

  const text = cells.map((cell) => cell.tile.letter).join("");
  const key = `${startRow},${startCol}:${forwardRowStep},${forwardColStep}`;
  return { key, text, cells };
}


function getAllLockedTiles() {
  const lockedTiles = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (board[row][col].tile && board[row][col].tile.locked) {
        lockedTiles.push({ row, col, tile: board[row][col].tile });
      }
    }
  }
  return lockedTiles;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

function premiumText(premium, row, col) {
  if (row === START_SQUARE.row && col === START_SQUARE.col) {
    return "START";
  }
  if (premium === "tw") return "TW";
  if (premium === "dw") return "DW";
  if (premium === "tl") return "TL";
  if (premium === "dl") return "DL";
  if (premium === "qw") return "QW";
  return "";
}

function setMessage(text, scoredWords) {
  messageEl.replaceChildren();
  const placeApi = window.GlobblePlaceInfo;
  const block =
    placeApi && scoredWords && scoredWords.length
      ? placeApi.summaryBlockForWords(scoredWords)
      : "";
  if (text) {
    const main = document.createElement("div");
    main.className = "message-primary";
    main.textContent = text;
    messageEl.appendChild(main);
  }
  if (block) {
    const sub = document.createElement("div");
    sub.className = "message-place-block";
    sub.textContent = block;
    messageEl.appendChild(sub);
  }
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function passTurn() {
  void recallTurnTiles().then(() => {
    currentPlayer = currentPlayer === 0 ? 1 : 0;
    applyPracticeTestRackForTurnStart(currentPlayer);
    setMessage("Turn passed.");
    render();
  });
}

async function shuffleRack() {
  if (
    rackShuffleAnimating ||
    rackShufflePendingAnimation ||
    rackEl.dataset.shuffling === "1"
  ) {
    return;
  }
  shufflePrevRack = cloneRackSnapshot(players[currentPlayer].rack);
  shuffleRackSlots(players[currentPlayer].rack);
  selectedRackIndex = null;
  rackShufflePendingAnimation = true;
  renderRack();
}

function checkGameOver() {
  const currentRack = players[currentPlayer].rack;
  ensureRackSlots(currentRack);
  const tilesLeft = currentRack.filter(Boolean).length;
  if (bag.length === 0 && tilesLeft === 0) {
    return "Game over! Tile bag empty and rack cleared.";
  }
  return null;
}

submitTurnBtn.addEventListener("click", () => void submitTurn());
recallTilesBtn.addEventListener("click", () => void recallTurnTiles());
passTurnBtn.addEventListener("click", passTurn);
shuffleRackBtn.addEventListener("click", shuffleRack);
newGameBtn.addEventListener("click", initGame);

if (window.GlobbleRackReorder) {
  window.GlobbleRackReorder.bindRackReorder(rackEl, {
    canReorder: () => gameStarted && draggingRackIndex !== null,
    getDraggingRackIndex: () => draggingRackIndex,
    getDraggingBoardPos: () => draggingTurnTilePos,
    canReturnToRack: () =>
      gameStarted && draggingTurnTilePos !== null,
    onReturnToRack(row, col, preferredSlot, dropPoint) {
      void removeTurnTile(row, col, preferredSlot, dropPoint).then(() => {
        onAnyDragEnd();
      });
    },
    onReorder(fromIndex, toIndex) {
      const rack = players[currentPlayer].rack;
      if (moveRackSlot(rack, fromIndex, toIndex)) {
        selectedRackIndex = toIndex;
        renderRack();
      }
      onAnyDragEnd();
    }
  });
}

if (window.GlobbleTilePointerDrag) {
  window.GlobbleTilePointerDrag.init({
    rackEl,
    boardEl,
    canInteract: () =>
      gameStarted &&
      !rackShuffleAnimating &&
      rackEl?.dataset.shuffling !== "1",
    canReorder: () => gameStarted && draggingRackIndex !== null,
    canReturnToRack: () =>
      gameStarted && draggingTurnTilePos !== null,
    getDraggingRackIndex: () => draggingRackIndex,
    getDraggingBoardPos: () => draggingTurnTilePos,
    onRackDragStart(rackIndex) {
      draggingRackIndex = rackIndex;
      draggingTurnTilePos = null;
    },
    onBoardDragStart(row, col) {
      draggingTurnTilePos = { row, col };
      draggingRackIndex = null;
    },
    onDrop(clientX, clientY) {
      return handlePointerTileDrop(clientX, clientY);
    },
    onDragEnd: onAnyDragEnd
  });
}

window.GlobblePendingWordGlow?.registerRenderCallback(() => {
  renderBoard();
});

function cloneTile(tile) {
  if (!tile) {
    return null;
  }
  return {
    letter: tile.letter,
    value: tile.value,
    isBlank: !!tile.isBlank,
    locked: !!tile.locked,
    placedBy: tile.placedBy,
    qwPlated: !!tile.qwPlated
  };
}

function capturePracticeSnapshot() {
  if (!gameStarted) {
    return null;
  }
  return {
    gameStarted,
    currentPlayer,
    board: board.map((row) => row.map((cell) => cloneTile(cell.tile))),
    bag: bag.map((tile) => cloneTile(tile)),
    players: players.map((player) => ({
      name: player.name,
      score: player.score,
      rack: player.rack.map((tile) => cloneTile(tile))
    })),
    turnPlacedTiles: turnPlacedTiles.map(({ row, col, tile, rackIndex }) => ({
      row,
      col,
      rackIndex,
      tile: cloneTile(tile)
    })),
    messageText: messageEl?.textContent || ""
  };
}

function restorePracticeSnapshot(snapshot) {
  board = Array.from({ length: BOARD_ROWS }, (_, row) =>
    Array.from({ length: BOARD_COLS }, (_, col) => ({
      premium: PREMIUM_LAYOUT[row][col],
      tile: snapshot.board[row][col] ? { ...snapshot.board[row][col] } : null
    }))
  );
  bag = snapshot.bag.map((tile) => (tile ? { ...tile } : tile));
  players = snapshot.players.map((player) => ({
    name: player.name,
    score: player.score,
    rack: player.rack.map((tile) => (tile ? { ...tile } : null))
  }));
  currentPlayer = snapshot.currentPlayer;
  selectedRackIndex = null;
  turnPlacedTiles = snapshot.turnPlacedTiles.map(({ row, col, tile, rackIndex }) => ({
    row,
    col,
    rackIndex,
    tile: { ...tile }
  }));
  gameStarted = snapshot.gameStarted;
  draggingRackIndex = null;
  draggingTurnTilePos = null;
  rackShuffleAnimating = false;
  rackShufflePendingAnimation = false;
  shufflePrevRack = null;
  rackReturnAnimating = false;
  window.GlobblePendingWordGlow?.resetGlowState();
  setMessage(snapshot.messageText || "");
  render();
}

window.GlobblePracticeResume?.registerCapture(capturePracticeSnapshot);

if (window.GlobblePracticeResume?.tryRestore(restorePracticeSnapshot)) {
  window.GlobbleGameLoadReveal?.skipImmediate();
  // Restored in-progress practice game after dictionary visit.
} else if (shouldStartDemoGame()) {
  initDemoGame();
  window.GlobbleGameLoadReveal?.notifyReady();
} else {
  initGame();
  window.GlobbleGameLoadReveal?.notifyReady();
}
