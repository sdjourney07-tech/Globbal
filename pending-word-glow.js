/**
 * QW-plating helpers for pending placements.
 * (Green valid-word glow disabled.)
 */
(function () {
  const GLOW_HOLD_MS = 5000;
  const GLOW_FADE_MS = 1000;

  let onRender = null;
  let holdTimer = null;
  let fadeTimer = null;
  let glowState = {
    phase: "idle",
    activeKey: null,
    fadingKeys: new Set()
  };

  function inBounds(board, row, col) {
    return row >= 0 && row < board.length && col >= 0 && col < board[0].length;
  }

  function getStartSquare(board) {
    const rows = board.length;
    const cols = board[0]?.length ?? rows;
    return {
      row: Math.floor((rows - 1) / 2),
      col: Math.floor((cols - 1) / 2)
    };
  }

  function getAllLockedTiles(board) {
    const lockedTiles = [];
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        if (board[row][col].tile && board[row][col].tile.locked) {
          lockedTiles.push({ row, col });
        }
      }
    }
    return lockedTiles;
  }

  function isContiguous(board, newTiles, axis) {
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

  function touchesExisting(board, newTiles) {
    return newTiles.some(({ row, col }) => {
      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1]
      ];
      return neighbors.some(
        ([r, c]) => inBounds(board, r, c) && board[r][c].tile && board[r][c].tile.locked
      );
    });
  }

  function getWordAt(board, row, col, backRowStep, backColStep, forwardRowStep, forwardColStep) {
    let startRow = row;
    let startCol = col;
    while (
      inBounds(board, startRow + backRowStep, startCol + backColStep) &&
      board[startRow + backRowStep][startCol + backColStep].tile
    ) {
      startRow += backRowStep;
      startCol += backColStep;
    }

    const cells = [];
    let r = startRow;
    let c = startCol;
    while (inBounds(board, r, c) && board[r][c].tile) {
      cells.push({ row: r, col: c, tile: board[r][c].tile });
      r += forwardRowStep;
      c += forwardColStep;
    }

    const text = cells.map((cell) => cell.tile.letter).join("");
    const key = `${startRow},${startCol}:${forwardRowStep},${forwardColStep}`;
    return { key, text, cells };
  }

  function collectWordsFromMove(board, newTiles) {
    const seen = new Set();
    const words = [];

    newTiles.forEach(({ row, col }) => {
      const horizontal = getWordAt(board, row, col, 0, -1, 0, 1);
      if (horizontal.text.length > 1 && !seen.has(horizontal.key)) {
        seen.add(horizontal.key);
        words.push(horizontal);
      }
      const vertical = getWordAt(board, row, col, -1, 0, 1, 0);
      if (vertical.text.length > 1 && !seen.has(vertical.key)) {
        seen.add(vertical.key);
        words.push(vertical);
      }
    });

    return words;
  }

  function validatePendingTurn(board, newTiles, dictionary) {
    if (!newTiles.length) {
      return { ok: false };
    }

    const allLocked = getAllLockedTiles(board);
    const isFirstMove = allLocked.length === 0;
    const startSquare = getStartSquare(board);

    const sameRow = newTiles.every((t) => t.row === newTiles[0].row);
    const sameCol = newTiles.every((t) => t.col === newTiles[0].col);
    if (!sameRow && !sameCol) {
      return { ok: false };
    }

    if (!isContiguous(board, newTiles, sameRow ? "row" : "col")) {
      return { ok: false };
    }

    if (isFirstMove) {
      const coversStart = newTiles.some(
        (t) => t.row === startSquare.row && t.col === startSquare.col
      );
      if (!coversStart) {
        return { ok: false };
      }
    } else if (!touchesExisting(board, newTiles)) {
      return { ok: false };
    }

    const words = collectWordsFromMove(board, newTiles);
    if (words.length === 0) {
      return { ok: false };
    }

    for (const word of words) {
      if (!dictionary.has(word.text)) {
        return { ok: false };
      }
    }

    return { ok: true, words };
  }

  function getQwPlatedCellKeys({ board, newTiles, dictionary }) {
    if (!board?.length || !newTiles?.length || !dictionary) {
      return new Set();
    }

    const validation = validatePendingTurn(board, newTiles, dictionary);
    if (!validation.ok) {
      return new Set();
    }

    const newKeys = new Set(newTiles.map(({ row, col }) => `${row},${col}`));
    const keys = new Set();

    validation.words.forEach((word) => {
      const triggersQw = word.cells.some(
        ({ row, col }) =>
          board[row][col].premium === "qw" && newKeys.has(`${row},${col}`)
      );
      if (!triggersQw) {
        return;
      }
      word.cells.forEach(({ row, col }) => keys.add(`${row},${col}`));
    });

    return keys;
  }

  function getGlowCellKeys({ board, newTiles, dictionary }) {
    if (!board?.length || !newTiles?.length || !dictionary) {
      return new Set();
    }

    const validation = validatePendingTurn(board, newTiles, dictionary);
    if (!validation.ok) {
      return new Set();
    }

    const keys = new Set();
    validation.words.forEach((word) => {
      word.cells.forEach(({ row, col }) => keys.add(`${row},${col}`));
    });
    return keys;
  }

  function serializeKeys(keys) {
    return [...keys].sort().join("|");
  }

  function clearGlowTimers() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function requestRender() {
    if (typeof onRender === "function") {
      onRender();
    }
  }

  function beginFade(keys) {
    glowState.phase = "fading";
    glowState.fadingKeys = new Set(keys);
    requestRender();
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      glowState.phase = "done";
      glowState.fadingKeys = new Set();
      requestRender();
    }, GLOW_FADE_MS);
  }

  function startGlowCycle(validKeys) {
    clearGlowTimers();
    const key = serializeKeys(validKeys);
    glowState.activeKey = key;
    glowState.phase = "glowing";
    glowState.fadingKeys = new Set();

    holdTimer = setTimeout(() => {
      holdTimer = null;
      beginFade(validKeys);
    }, GLOW_HOLD_MS);
  }

  function resetGlowState() {
    clearGlowTimers();
    glowState = {
      phase: "idle",
      activeKey: null,
      fadingKeys: new Set()
    };
  }

  function syncGlowDisplay() {
    // Green "valid dictionary word" glow disabled — keep API for QW plating helpers.
    resetGlowState();
    return { glowing: new Set(), fading: new Set() };
  }

  function registerRenderCallback(callback) {
    onRender = callback;
  }

  window.GlobblePendingWordGlow = {
    getGlowCellKeys,
    getQwPlatedCellKeys,
    validatePendingTurn,
    syncGlowDisplay,
    registerRenderCallback,
    resetGlowState
  };
})();
