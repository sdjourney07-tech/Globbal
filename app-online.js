const boardEl = document.getElementById("board");
const rackEl = document.getElementById("rack");
const messageEl = document.getElementById("message");
const turnInfoEl = document.getElementById("turnInfo");
const bagCountEl = document.getElementById("bagCount");
const player1ScoreEl = document.getElementById("player1Score");
const player2ScoreEl = document.getElementById("player2Score");
const roomDisplayEl = document.getElementById("roomDisplay");
const connStatusEl = document.getElementById("connStatus");
const lobbyHintEl = document.getElementById("lobbyHint");

const submitTurnBtn = document.getElementById("submitTurnBtn");
const recallTilesBtn = document.getElementById("recallTilesBtn");
const passTurnBtn = document.getElementById("passTurnBtn");
const shuffleRackBtn = document.getElementById("shuffleRackBtn");
const lobbyPanelEl = document.getElementById("lobbyPanel");

const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
const RACK_SIZE = 16;

const SESSION_KEY = "globble-online-game-session-v3";

const onlineDictionary = GlobbleDictionaryKeys.buildPlayableDictionary(
  typeof LOCKED_WORDS !== "undefined" ? LOCKED_WORDS : [],
  {
    aliasSources:
      typeof DICTIONARY_ALIAS_SOURCE_WORDS !== "undefined" ? DICTIONARY_ALIAS_SOURCE_WORDS : []
  }
);

function persistSession(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

function loadPersistSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.gameId !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

function clearPersistSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** @type {WebSocket | null} */
let ws = null;
/** @type {object | null} */
let gameState = null;
let selectedRackIndex = null;
let draggingRackIndex = null;
let draggingTurnTilePos = null;
let rackShuffleAnimating = false;
let rackShufflePendingAnimation = false;
let shufflePrevRack = null;
let rackReturnAnimating = false;
let pendingTileReturn = null;
let pendingEnterGameId = null;
/** @type {string[]} */
let matchUsernames = [];

function setConnStatus(text) {
  connStatusEl.textContent = text || "";
}

function sendAction(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    messageEl.textContent = "Not connected.";
    return;
  }
  ws.send(JSON.stringify(payload));
}

function connectThen(afterOpen) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (typeof afterOpen === "function") afterOpen();
    return;
  }
  if (ws) {
    ws.close();
  }
  ws = new WebSocket(wsUrl);
  ws.__globbleAuthed = false;
  setConnStatus("Connecting…");
  ws.addEventListener("open", () => {
    setConnStatus("Connected");
    const token = window.GlobbleAccounts?.getToken?.() || "";
    if (token) {
      ws.send(JSON.stringify({ type: "auth", token }));
    }
    if (typeof afterOpen === "function") afterOpen();
  });
  ws.addEventListener("close", () => {
    setConnStatus("Disconnected");
  });
  ws.addEventListener("error", () => {
    setConnStatus("Error");
  });
  ws.addEventListener("message", onWsMessage);
}

function tryEnterPendingGame() {
  if (!pendingEnterGameId || !ws || ws.readyState !== WebSocket.OPEN || !ws.__globbleAuthed) {
    return;
  }
  const gameId = pendingEnterGameId;
  pendingEnterGameId = null;
  sendAction({ type: "enterGame", gameId });
}

function enterGame(gameId) {
  if (!window.GlobbleAccounts?.getToken?.()) {
    messageEl.textContent = "Sign in from the main menu first.";
    if (lobbyHintEl) {
      lobbyHintEl.textContent = "Open the main menu, sign in, then challenge a player or open Games.";
    }
    return;
  }
  pendingEnterGameId = gameId;
  connectThen(() => {
    tryEnterPendingGame();
  });
}

function onWsMessage(ev) {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (msg.type === "authed") {
    if (ws) ws.__globbleAuthed = true;
    tryEnterPendingGame();
    return;
  }
  if (msg.type === "state") {
    gameState = msg.payload;
    if (Array.isArray(gameState?.playerNames) && gameState.playerNames.length) {
      matchUsernames = gameState.playerNames.slice();
    }
    renderAll();
  } else if (msg.type === "joined") {
    if (msg.gameId) {
      if (Array.isArray(msg.usernames) && msg.usernames.length) {
        matchUsernames = msg.usernames.slice();
      }
      persistSession({
        gameId: msg.gameId,
        playerToken: msg.playerToken,
        playerIndex: msg.playerIndex,
        usernames: msg.usernames || []
      });
      const names = msg.usernames || [];
      roomDisplayEl.textContent =
        names.length === 2 ? `${names[0]} vs ${names[1]}` : `Match ${msg.gameId.slice(-6)}`;
      if (lobbyPanelEl) {
        lobbyPanelEl.hidden = true;
      }
    }
  } else if (msg.type === "error") {
    rackShufflePendingAnimation = false;
    shufflePrevRack = null;
    pendingTileReturn = null;
    if (msg.error && msg.error.startsWith("Invalid word")) {
      window.GlobbleInvalidWordToast?.show();
      messageEl.textContent = "";
    } else {
      messageEl.textContent = msg.error || "Error";
    }
  }
}

function startSquare(boardRows, boardCols) {
  return {
    row: Math.floor((boardRows - 1) / 2),
    col: Math.floor((boardCols - 1) / 2)
  };
}

function premiumText(premium, row, col, boardRows, boardCols) {
  const ss = startSquare(boardRows, boardCols);
  if (row === ss.row && col === ss.col) {
    return "START";
  }
  if (premium === "tw") return "TW";
  if (premium === "dw") return "DW";
  if (premium === "tl") return "TL";
  if (premium === "dl") return "DL";
  if (premium === "qw") return "QW";
  return "";
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

function canInteract() {
  return (
    gameState &&
    !gameState.lobby &&
    gameState.gameStarted &&
    !gameState.gameOver &&
    gameState.isMyTurn
  );
}

function setControlsDisabled(disabled) {
  submitTurnBtn.disabled = disabled;
  recallTilesBtn.disabled = disabled;
  passTurnBtn.disabled = disabled;
  shuffleRackBtn.disabled = disabled;
}

function setLobbyPanelVisible(visible) {
  if (lobbyPanelEl) {
    lobbyPanelEl.hidden = !visible;
  }
}

function renderLobby() {
  setLobbyPanelVisible(true);
  boardEl.innerHTML = "";
  boardEl.style.display = "flex";
  boardEl.style.alignItems = "center";
  boardEl.style.justifyContent = "center";
  boardEl.style.aspectRatio = "auto";
  boardEl.style.minHeight = "180px";
  const p = document.createElement("p");
  p.className = "hint";
  p.style.textAlign = "center";
  p.style.padding = "2rem";
  p.textContent = gameState.message || "Waiting…";
  boardEl.appendChild(p);
  rackEl.innerHTML = "";
  player1ScoreEl.textContent = "Player 1: —";
  player2ScoreEl.textContent = "Player 2: —";
  player1ScoreEl.classList.remove("active");
  player2ScoreEl.classList.remove("active");
  turnInfoEl.textContent = "Lobby";
  messageEl.textContent = "";
  renderBagCount();
  if (gameState.roomCode) {
    roomDisplayEl.textContent = `Room: ${gameState.roomCode}`;
  }
  setControlsDisabled(true);
}

function renderBoard() {
  if (window.GlobblePlaceInfo) {
    window.GlobblePlaceInfo.hidePlaceTip();
  }
  const board = gameState.board;
  const pendingNewTiles = (gameState.pendingPlacements || []).map((p) => ({
    row: p.row,
    col: p.col
  }));
  const qwPendingKeys =
    pendingNewTiles.length && window.GlobblePendingWordGlow?.getQwPlatedCellKeys
      ? window.GlobblePendingWordGlow.getQwPlatedCellKeys({
          board,
          newTiles: pendingNewTiles,
          dictionary: onlineDictionary
        })
      : new Set();
  const boardRows = board.length;
  const boardCols = board[0]?.length ?? boardRows;
  boardEl.style.display = "grid";
  boardEl.style.alignItems = "";
  boardEl.style.justifyContent = "";
  boardEl.style.minHeight = "";
  boardEl.style.aspectRatio = "";
  boardEl.style.setProperty("--board-cols", String(boardCols));
  boardEl.style.setProperty("--board-rows", String(boardRows));

  const frag = document.createDocumentFragment();
  for (let row = 0; row < boardRows; row += 1) {
    for (let col = 0; col < boardCols; col += 1) {
      const cell = board[row][col];
      const cellEl = document.createElement("div");
      cellEl.className = `cell ${cell.premium}`;
      if (cell.tile?.qwPlated || qwPendingKeys.has(`${row},${col}`)) {
        cellEl.classList.add("cell-qw-word");
      }
      const ss = startSquare(boardRows, boardCols);
      if (row === ss.row && col === ss.col) {
        cellEl.classList.add("cell-start");
      }
      cellEl.setAttribute("role", "gridcell");
      cellEl.dataset.row = String(row);
      cellEl.dataset.col = String(col);

      if (!cell.tile) {
        const premiumLabel = document.createElement("span");
        premiumLabel.className = "premium-label";
        premiumLabel.textContent = premiumText(cell.premium, row, col, boardRows, boardCols);
        cellEl.appendChild(premiumLabel);
      } else {
        const tileEl = createTileElement(cell.tile, false);
        const unlocked = !cell.tile.locked && canInteract();
        setTileDraggable(tileEl, unlocked);
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

function renderRack() {
  if (rackShuffleAnimating && !rackEl.classList.contains("is-shuffle-prep")) {
    return;
  }
  if (rackShufflePendingAnimation) {
    rackEl.classList.add("is-shuffle-prep");
  }
  const frag = document.createDocumentFragment();
  const rack = gameState.myRack || [];

  for (let index = 0; index < RACK_SIZE; index += 1) {
    const slotEl = document.createElement("div");
    slotEl.className = "rack-slot";
    slotEl.dataset.rackSlot = String(index);

    const tile = rack[index] ?? null;
    if (tile) {
      const tileEl = createTileElement(tile, true);
      const usable = canInteract();
      setTileDraggable(tileEl, usable);
      if (index === selectedRackIndex) {
        tileEl.classList.add("selected");
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

async function runPendingTileReturn() {
  const pending = pendingTileReturn;
  if (!pending) {
    return;
  }
  pendingTileReturn = null;
  const toRect =
    pending.rackIndex != null
      ? window.GlobbleRackReturn?.getSlotRect(rackEl, pending.rackIndex)
      : null;
  const slotEl =
    pending.rackIndex != null
      ? rackEl.querySelector(`.rack-slot[data-rack-slot="${pending.rackIndex}"]`)
      : null;
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
  if (pending.fromRect && toRect && pending.tile && window.GlobbleRackReturn) {
    void window.GlobbleRackReturn.playQuick({
      fromRect: pending.fromRect,
      toRect,
      tile: pending.tile
    }).finally(finishReturn);
  } else {
    finishReturn();
  }
}

async function maybeRunShuffleAnimation() {
  if (!rackShufflePendingAnimation || rackShuffleAnimating) {
    return;
  }
  rackShufflePendingAnimation = false;
  const tileEls = [...rackEl.querySelectorAll(".rack-slot .tile")];
  if (tileEls.length < 2 || !window.GlobbleRackShuffle) {
    shufflePrevRack = null;
    return;
  }
  const slotSources = shufflePrevRack
    ? window.GlobbleRackShuffle.computeSlotSources(
        shufflePrevRack,
        gameState.myRack || [],
        RACK_SIZE
      )
    : null;
  shufflePrevRack = null;
  rackShuffleAnimating = true;
  shuffleRackBtn.disabled = true;
  try {
    await window.GlobbleRackShuffle.play(rackEl, { slotSources, button: shuffleRackBtn });
  } finally {
    rackShuffleAnimating = false;
    setControlsDisabled(!canInteract() || !!gameState?.gameOver);
  }
}

function playerScoreLabel(playerIndex) {
  const players = gameState?.players || [];
  const accountNames =
    matchUsernames.length > 0
      ? matchUsernames
      : gameState?.playerNames || loadPersistSession()?.usernames || [];
  const defaultName = `Player ${playerIndex + 1}`;
  const stateName = players[playerIndex]?.name;
  if (stateName && stateName !== defaultName) {
    return stateName;
  }
  if (accountNames[playerIndex]) {
    return accountNames[playerIndex];
  }
  return stateName || defaultName;
}

function renderScores() {
  const players = gameState.players || [];
  const p1Name = playerScoreLabel(0);
  const p2Name = playerScoreLabel(1);
  player1ScoreEl.textContent = `${p1Name}: ${players[0] ? players[0].score : 0}`;
  player2ScoreEl.textContent = `${p2Name}: ${players[1] ? players[1].score : 0}`;
  player1ScoreEl.title = p1Name;
  player2ScoreEl.title = p2Name;
  const cp = gameState.currentPlayer;
  player1ScoreEl.classList.toggle("active", cp === 0);
  player2ScoreEl.classList.toggle("active", cp === 1);
}

function renderGameMessage() {
  messageEl.replaceChildren();
  const msg = gameState.message || "";
  const placeApi = window.GlobblePlaceInfo;
  const words = gameState.lastScoredWords;
  const block =
    placeApi && words && words.length ? placeApi.summaryBlockForWords(words) : "";
  if (msg) {
    const main = document.createElement("div");
    main.className = "message-primary";
    main.textContent = msg;
    messageEl.appendChild(main);
  }
  if (block) {
    const sub = document.createElement("div");
    sub.className = "message-place-block";
    sub.textContent = block;
    messageEl.appendChild(sub);
  }
}

function renderBagCount() {
  if (!bagCountEl) {
    return;
  }
  if (!gameState || gameState.lobby || typeof gameState.bagCount !== "number") {
    bagCountEl.textContent = "";
    return;
  }
  bagCountEl.textContent = `${gameState.bagCount} left in the bag`;
}

function renderAll() {
  if (!gameState) {
    return;
  }
  if (gameState.lobby) {
    renderLobby();
    return;
  }

  setLobbyPanelVisible(false);
  roomDisplayEl.textContent = "";
  renderBoard();
  renderBagCount();
  renderRack();
  if (pendingTileReturn) {
    void runPendingTileReturn();
  }
  renderScores();
  renderGameMessage();
  setControlsDisabled(!canInteract() || !!gameState.gameOver);

  const names = gameState.players || [];
  const cp = gameState.currentPlayer;
  const activeName = names[cp] ? names[cp].name : `Player ${cp + 1}`;
  if (gameState.gameOver) {
    turnInfoEl.textContent = gameState.gameOver;
  } else if (gameState.isMyTurn) {
    turnInfoEl.textContent = `Your turn (${activeName})`;
  } else {
    turnInfoEl.textContent = `Waiting — ${activeName}'s turn`;
  }

  window.GlobbleBoardZoom?.syncFromTiles(gameState.pendingPlacements || [], boardEl);
}

function returnBoardTileToRack(row, col, preferredRackSlot = null, dropPoint = null) {
  if (!canInteract()) {
    return;
  }
  const placement = (gameState.pendingPlacements || []).find(
    (entry) => entry.row === row && entry.col === col
  );
  const cellEl = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  const boardTileRect = cellEl?.querySelector(".tile")?.getBoundingClientRect();
  const fromRect = window.GlobbleRackReturn?.resolveQuickFromRect?.({
    boardRect: boardTileRect,
    dragRect: window.GlobbleRackReorder?.getActiveDragRect?.(),
    dropPoint
  }) ?? boardTileRect;
  window.GlobbleRackReorder?.finishDragGhost();
  const rackIndex =
    Number.isInteger(preferredRackSlot) &&
    preferredRackSlot >= 0 &&
    preferredRackSlot < RACK_SIZE &&
    !gameState.myRack?.[preferredRackSlot]
      ? preferredRackSlot
      : placement?.rackIndex;
  pendingTileReturn = {
    row,
    col,
    rackIndex,
    fromRect,
    tile: placement ? { ...gameState.board[row][col].tile } : null
  };
  sendAction({
    type: "removeTile",
    row,
    col,
    preferredRackSlot: Number.isInteger(preferredRackSlot) ? preferredRackSlot : undefined
  });
  selectedRackIndex = null;
}

function onCellClick(row, col) {
  if (!canInteract()) return;
  const cell = gameState.board[row][col];
  if (cell.tile && !cell.tile.locked) {
    returnBoardTileToRack(row, col);
    return;
  }
  if (!cell.tile) {
    messageEl.textContent = "Drag a tile from your rack onto the board.";
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

/** Empty cell whose box contains the point (ignores tiles/stacking). */
function getEmptyCellAtClient(clientX, clientY) {
  if (!boardEl || !gameState?.board) {
    return null;
  }
  const cells = boardEl.querySelectorAll(".cell");
  for (const cellEl of cells) {
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      continue;
    }
    if (gameState.board[row][col].tile) {
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

async function placeOnlineRackTile(row, col, rackIndex) {
  if (!canInteract()) {
    return;
  }
  const rack = gameState.myRack;
  const tile = rack?.[rackIndex];
  let blankLetter;
  if (tile && tile.isBlank) {
    const raw = window.GlobbleBlankPicker
      ? await window.GlobbleBlankPicker.pickLetter()
      : null;
    if (!raw || !/^[a-z]$/i.test(raw)) {
      messageEl.textContent = "Blank tile needs a letter A–Z.";
      return;
    }
    blankLetter = raw.toUpperCase();
  }
  sendAction({
    type: "placeTile",
    row,
    col,
    rackIndex,
    blankLetter
  });
}

function moveOnlineTurnTile(targetRow, targetCol, sourceRow, sourceCol) {
  if (!canInteract()) {
    return;
  }
  sendAction({
    type: "moveTile",
    targetRow,
    targetCol,
    sourceRow,
    sourceCol
  });
}

async function handlePointerTileDrop(clientX, clientY) {
  if (!canInteract()) {
    return;
  }

  const emptyCellEl = getEmptyCellAtClient(clientX, clientY);
  if (emptyCellEl) {
    const row = Number(emptyCellEl.dataset.row);
    const col = Number(emptyCellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      if (draggingRackIndex !== null) {
        await placeOnlineRackTile(row, col, draggingRackIndex);
        return;
      }
      if (draggingTurnTilePos) {
        moveOnlineTurnTile(row, col, draggingTurnTilePos.row, draggingTurnTilePos.col);
      }
      return;
    }
  }

  const target = document.elementFromPoint(clientX, clientY);
  const cellEl = target instanceof Element ? target.closest(".cell") : null;
  if (cellEl && boardEl?.contains(cellEl)) {
    const row = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    if (Number.isInteger(row) && Number.isInteger(col) && !gameState.board[row][col].tile) {
      if (draggingRackIndex !== null) {
        await placeOnlineRackTile(row, col, draggingRackIndex);
        return;
      }
      if (draggingTurnTilePos) {
        moveOnlineTurnTile(row, col, draggingTurnTilePos.row, draggingTurnTilePos.col);
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
    returnBoardTileToRack(draggingTurnTilePos.row, draggingTurnTilePos.col, slotIndex, {
      clientX,
      clientY
    });
    return;
  }

  if (draggingRackIndex !== null && window.GlobbleRackReorder) {
    const toIndex = window.GlobbleRackReorder.getDropIndex(
      { clientX, clientY },
      rackEl,
      draggingRackIndex
    );
    if (draggingRackIndex !== toIndex) {
      sendAction({ type: "reorderRack", fromIndex: draggingRackIndex, toIndex });
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

function canDropOnCell(row, col) {
  if (!canInteract()) return false;
  if (gameState.board[row][col].tile) {
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

async function onCellDrop(event, row, col) {
  event.preventDefault();
  if (!canInteract()) return;

  let targetRow = row;
  let targetCol = col;
  if (gameState.board[targetRow][targetCol].tile) {
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
    await placeOnlineRackTile(targetRow, targetCol, draggingRackIndex);
    onAnyDragEnd();
    return;
  }

  if (draggingTurnTilePos) {
    moveOnlineTurnTile(
      targetRow,
      targetCol,
      draggingTurnTilePos.row,
      draggingTurnTilePos.col
    );
    onAnyDragEnd();
  }
}

submitTurnBtn.addEventListener("click", () => sendAction({ type: "submit" }));
recallTilesBtn.addEventListener("click", () => sendAction({ type: "recall" }));
passTurnBtn.addEventListener("click", () => sendAction({ type: "pass" }));
shuffleRackBtn.addEventListener("click", () => {
  if (!canInteract() || rackShuffleAnimating || rackEl.dataset.shuffling === "1") {
    return;
  }
  shufflePrevRack = (gameState.myRack || []).map((tile) => (tile ? { ...tile } : null));
  while (shufflePrevRack.length < RACK_SIZE) {
    shufflePrevRack.push(null);
  }
  rackShufflePendingAnimation = true;
  sendAction({ type: "shuffle" });
});

setControlsDisabled(true);

let boardEventsBound = false;
let rackEventsBound = false;

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

function bindRackEvents() {
  if (rackEventsBound || !rackEl) {
    return;
  }
  rackEventsBound = true;

  rackEl.addEventListener("click", (event) => {
    if (!canInteract()) {
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
    const tileEl = event.target.closest(".tile");
    if (!tileEl || !tileEl.draggable || !rackEl.contains(tileEl)) {
      return;
    }
    const slotEl = tileEl.closest(".rack-slot");
    const index = Number(slotEl?.dataset.rackSlot);
    if (!Number.isInteger(index)) {
      return;
    }
    onRackTileDragStart(event, index);
  });

  rackEl.addEventListener("dragend", onAnyDragEnd);
}

bindBoardEvents();
bindRackEvents();

function applyStartupRouting() {
  const params = new URLSearchParams(location.search);
  const gameId = (params.get("game") || "").trim();
  if (gameId) {
    messageEl.textContent = "Opening match…";
    enterGame(gameId);
    history.replaceState({}, "", location.pathname);
    return true;
  }
  const s = loadPersistSession();
  if (s?.gameId && window.GlobbleAccounts?.getToken?.()) {
    messageEl.textContent = "Reconnecting to your match…";
    enterGame(s.gameId);
    return true;
  }
  return false;
}

if (!applyStartupRouting()) {
  turnInfoEl.textContent = "Open Games from the main menu to play online.";
  if (!window.GlobbleAccounts?.getToken?.()) {
    messageEl.textContent = "Sign in on the main menu, then challenge a player by username.";
  }
}

window.GlobbleGameLoadReveal?.notifyReady();

window.GlobblePendingWordGlow?.registerRenderCallback(() => {
  renderBoard();
});

if (window.GlobbleRackReorder) {
  window.GlobbleRackReorder.bindRackReorder(rackEl, {
    canReorder: () => canInteract() && draggingRackIndex !== null,
    getDraggingRackIndex: () => draggingRackIndex,
    getDraggingBoardPos: () => draggingTurnTilePos,
    canReturnToRack: () =>
      canInteract() && draggingTurnTilePos !== null,
    onReturnToRack(row, col, preferredSlot, dropPoint) {
      returnBoardTileToRack(row, col, preferredSlot, dropPoint);
      onAnyDragEnd();
    },
    onReorder(fromIndex, toIndex) {
      const rack = gameState?.myRack;
      if (
        rack &&
        window.GlobbleRackReorder?.moveRackSlots(rack, fromIndex, toIndex, RACK_SIZE)
      ) {
        selectedRackIndex = toIndex;
        renderRack();
      }
      sendAction({ type: "reorderRack", fromIndex, toIndex });
      onAnyDragEnd();
    }
  });
}

if (window.GlobbleTilePointerDrag) {
  window.GlobbleTilePointerDrag.init({
    rackEl,
    boardEl,
    canInteract: () =>
      canInteract() &&
      !rackShuffleAnimating &&
      rackEl?.dataset.shuffling !== "1",
    canReorder: () => canInteract() && draggingRackIndex !== null,
    canReturnToRack: () => canInteract() && draggingTurnTilePos !== null,
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
