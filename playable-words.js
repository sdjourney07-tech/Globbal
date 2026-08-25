/**
 * Count distinct dictionary words formable in at least one legal move
 * from the current rack and board (Globble placement rules).
 */
(function playableWords() {
  const LETTER_VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
    N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, "?": 0
  };

  function cloneBoard(board) {
    return board.map((row) =>
      row.map((cell) => ({
        premium: cell.premium,
        tile: cell.tile ? { ...cell.tile } : null
      }))
    );
  }

  function boardHasAnyTile(board) {
    return board.some((row) => row.some((cell) => cell.tile));
  }

  function inBounds(board, row, col) {
    return row >= 0 && row < board.length && col >= 0 && col < board[0].length;
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

  function validatePendingMove(board, newTiles, dictionary, startSquare) {
    if (!newTiles.length) {
      return { ok: false };
    }

    const allLocked = [];
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const tile = board[row][col].tile;
        if (tile && tile.locked) {
          allLocked.push({ row, col });
        }
      }
    }
    const isFirstMove = allLocked.length === 0;

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

  function lineConnects(board, isRow, lineIndex, colStart, colEnd, startSquare, isFirstMove) {
    if (isFirstMove) {
      if (isRow) {
        return (
          lineIndex === startSquare.row &&
          colStart <= startSquare.col &&
          colEnd >= startSquare.col
        );
      }
      return (
        lineIndex === startSquare.col &&
        colStart <= startSquare.row &&
        colEnd >= startSquare.row
      );
    }

    const lineLen = isRow ? board[0].length : board.length;
    const before = colStart - 1;
    const after = colEnd + 1;
    if (before >= 0) {
      const [r, c] = isRow ? [lineIndex, before] : [before, lineIndex];
      if (board[r][c].tile) {
        return true;
      }
    }
    if (after < lineLen) {
      const [r, c] = isRow ? [lineIndex, after] : [after, lineIndex];
      if (board[r][c].tile) {
        return true;
      }
    }

    for (let i = colStart; i <= colEnd; i += 1) {
      const [r, c] = isRow ? [lineIndex, i] : [i, lineIndex];
      const neighbors = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1]
      ];
      if (
        neighbors.some(
          ([nr, nc]) => inBounds(board, nr, nc) && board[nr][nc].tile
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function addWordsFromValidation(foundWords, validation, stopCtx) {
    if (!validation.ok) {
      return false;
    }
    validation.words.forEach((word) => {
      if (word.text.length > 1) {
        foundWords.add(word.text);
      }
    });
    return shouldStopPlayableWordCount(foundWords, stopCtx);
  }

  const PLAYABLE_WORD_STOP_1000 = 1000;
  const PLAYABLE_WORD_STOP_2000 = 2000;

  function shouldStopPlayableWordCount(foundWords, stopCtx) {
    if (!stopCtx) {
      return false;
    }
    const size = foundWords.size;
    if (size >= PLAYABLE_WORD_STOP_2000) {
      stopCtx.value = PLAYABLE_WORD_STOP_2000;
      return true;
    }
    if (size >= PLAYABLE_WORD_STOP_1000) {
      stopCtx.value = PLAYABLE_WORD_STOP_1000;
      return true;
    }
    return false;
  }

  function isPlayableWordCountStopped(stopCtx) {
    return Boolean(stopCtx?.value);
  }

  const trieCache = new WeakMap();

  function buildPrefixTrie(dictionary) {
    if (trieCache.has(dictionary)) {
      return trieCache.get(dictionary);
    }
    const root = { children: new Map(), word: false };
    dictionary.forEach((word) => {
      let node = root;
      for (let i = 0; i < word.length; i += 1) {
        const ch = word[i];
        if (!node.children.has(ch)) {
          node.children.set(ch, { children: new Map(), word: false });
        }
        node = node.children.get(ch);
      }
      node.word = true;
    });
    trieCache.set(dictionary, root);
    return root;
  }

  function trieHasPrefix(root, text) {
    let node = root;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "?") {
        return true;
      }
      if (!node.children.has(ch)) {
        return false;
      }
      node = node.children.get(ch);
    }
    return true;
  }

  function crossWordsThroughCell(board, row, col) {
    const texts = [];
    const horizontal = getWordAt(board, row, col, 0, -1, 0, 1);
    if (horizontal.text.length > 1) {
      texts.push(horizontal.text);
    }
    const vertical = getWordAt(board, row, col, -1, 0, 1, 0);
    if (vertical.text.length > 1) {
      texts.push(vertical.text);
    }
    return texts;
  }

  function passesCrossPrefixCheck(board, row, col, trie) {
    const words = crossWordsThroughCell(board, row, col);
    for (let i = 0; i < words.length; i += 1) {
      if (!trieHasPrefix(trie, words[i])) {
        return false;
      }
    }
    return true;
  }

  function rackTileKey(rackTile) {
    const letter = rackTile.isBlank ? "?" : rackTile.letter;
    return `${letter}:${rackTile.isBlank ? 1 : 0}`;
  }

  function tryBlankLetters(
    board,
    dictionary,
    startSquare,
    newTiles,
    foundWords,
    assign,
    trie,
    stopCtx
  ) {
    if (isPlayableWordCountStopped(stopCtx)) {
      return;
    }
    const blankIndex = assign.findIndex((slot) => {
      if (!slot.isBlank) {
        return false;
      }
      const tile = board[slot.row][slot.col].tile;
      return tile && tile.letter === "?";
    });
    if (blankIndex === -1) {
      const validation = validatePendingMove(board, newTiles, dictionary, startSquare);
      addWordsFromValidation(foundWords, validation, stopCtx);
      return;
    }

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const slot = assign[blankIndex];
    const { row, col } = slot;
    for (let i = 0; i < letters.length; i += 1) {
      const letter = letters[i];
      board[row][col].tile = {
        letter,
        value: 0,
        isBlank: true,
        locked: false
      };
      if (!passesCrossPrefixCheck(board, row, col, trie)) {
        board[row][col].tile = {
          letter: "?",
          value: 0,
          isBlank: true,
          locked: false
        };
        continue;
      }
      tryBlankLetters(
        board,
        dictionary,
        startSquare,
        newTiles,
        foundWords,
        assign,
        trie,
        stopCtx
      );
      if (isPlayableWordCountStopped(stopCtx)) {
        return;
      }
      board[row][col].tile = {
        letter: "?",
        value: 0,
        isBlank: true,
        locked: false
      };
    }
  }

  function backtrackPlacement(
    board,
    dictionary,
    startSquare,
    rackSlots,
    usedMask,
    assign,
    slotIndex,
    colStart,
    colEnd,
    isRow,
    lineIndex,
    foundWords,
    trie,
    stopCtx
  ) {
    if (isPlayableWordCountStopped(stopCtx)) {
      return;
    }
    if (slotIndex > colEnd) {
      const newTiles = assign.map(({ row, col }) => ({ row, col }));
      tryBlankLetters(board, dictionary, startSquare, newTiles, foundWords, assign, trie, stopCtx);
      return;
    }

    const [row, col] = isRow ? [lineIndex, slotIndex] : [slotIndex, lineIndex];
    const triedKeys = new Set();

    for (let i = 0; i < rackSlots.length; i += 1) {
      if (usedMask[i]) {
        continue;
      }
      const rackTile = rackSlots[i];
      const dedupeKey = rackTileKey(rackTile);
      if (triedKeys.has(dedupeKey)) {
        continue;
      }
      triedKeys.add(dedupeKey);

      const letter = rackTile.isBlank ? "?" : rackTile.letter;
      board[row][col].tile = {
        letter,
        value: rackTile.value ?? LETTER_VALUES[letter] ?? 0,
        isBlank: !!rackTile.isBlank,
        locked: false
      };
      if (!rackTile.isBlank && !passesCrossPrefixCheck(board, row, col, trie)) {
        board[row][col].tile = null;
        continue;
      }
      usedMask[i] = true;
      assign.push({ row, col, isBlank: !!rackTile.isBlank, rackIndex: i });
      backtrackPlacement(
        board,
        dictionary,
        startSquare,
        rackSlots,
        usedMask,
        assign,
        slotIndex + 1,
        colStart,
        colEnd,
        isRow,
        lineIndex,
        foundWords,
        trie,
        stopCtx
      );
      if (isPlayableWordCountStopped(stopCtx)) {
        assign.pop();
        usedMask[i] = false;
        board[row][col].tile = null;
        return;
      }
      assign.pop();
      usedMask[i] = false;
      board[row][col].tile = null;
    }
  }

  function searchLine(board, dictionary, startSquare, rackSlots, isRow, lineIndex, foundWords, trie, stopCtx) {
    if (isPlayableWordCountStopped(stopCtx)) {
      return;
    }
    const lineLen = isRow ? board[0].length : board.length;
    const isFirstMove = !boardHasAnyTile(board);

    const getTile = (i) => {
      const [r, c] = isRow ? [lineIndex, i] : [i, lineIndex];
      return board[r][c].tile;
    };

    let i = 0;
    while (i < lineLen) {
      while (i < lineLen && getTile(i)) {
        i += 1;
      }
      const runStart = i;
      while (i < lineLen && !getTile(i)) {
        i += 1;
      }
      const runEnd = i - 1;
      if (runStart > runEnd) {
        continue;
      }

      for (let spanStart = runStart; spanStart <= runEnd; spanStart += 1) {
        if (isPlayableWordCountStopped(stopCtx)) {
          return;
        }
        for (let spanEnd = spanStart; spanEnd <= runEnd; spanEnd += 1) {
          if (isPlayableWordCountStopped(stopCtx)) {
            return;
          }
          const spanLen = spanEnd - spanStart + 1;
          if (spanLen > rackSlots.length) {
            continue;
          }
          if (
            !lineConnects(
              board,
              isRow,
              lineIndex,
              spanStart,
              spanEnd,
              startSquare,
              isFirstMove
            )
          ) {
            continue;
          }

          const workBoard = cloneBoard(board);
          const usedMask = new Array(rackSlots.length).fill(false);
          backtrackPlacement(
            workBoard,
            dictionary,
            startSquare,
            rackSlots,
            usedMask,
            [],
            spanStart,
            spanStart,
            spanEnd,
            isRow,
            lineIndex,
            foundWords,
            trie,
            stopCtx
          );
          if (isPlayableWordCountStopped(stopCtx)) {
            return;
          }
        }
      }
    }
  }

  function countPlayableWords({ board, rack, dictionary, startSquare }) {
    if (!board?.length || !dictionary || !startSquare) {
      return 0;
    }

    // Blanks explode search space (26 letters each); stats count known letters only.
    const rackSlots = rack.filter((tile) => tile && !tile.isBlank);
    if (!rackSlots.length) {
      return 0;
    }

    const foundWords = new Set();
    const stopCtx = { value: null };
    const trie = buildPrefixTrie(dictionary);
    for (let row = 0; row < board.length; row += 1) {
      searchLine(board, dictionary, startSquare, rackSlots, true, row, foundWords, trie, stopCtx);
      if (isPlayableWordCountStopped(stopCtx)) {
        return stopCtx.value;
      }
    }
    for (let col = 0; col < board[0].length; col += 1) {
      searchLine(board, dictionary, startSquare, rackSlots, false, col, foundWords, trie, stopCtx);
      if (isPlayableWordCountStopped(stopCtx)) {
        return stopCtx.value;
      }
    }
    return foundWords.size;
  }

  function formatPlayableWordBucket(count) {
    if (typeof count !== "number" || !Number.isFinite(count)) {
      return "… words possible";
    }
    if (count === 0) {
      return "0 words possible";
    }
    if (count === 1) {
      return "1 word possible";
    }
    if (count < 100) {
      return `${count} words possible`;
    }
    if (count < 500) {
      return "100+ words possible";
    }
    if (count < 1000) {
      return "500+ words possible";
    }
    if (count < 2000) {
      return "1000+ words possible";
    }
    return "2000+ words possible";
  }

  const root =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof self !== "undefined"
        ? self
        : window;
  root.GlobblePlayableWords = {
    countPlayableWords,
    formatPlayableWordBucket
  };
})();
