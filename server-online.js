"use strict";

require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const WebSocket = require("ws");
const { loadDictionary, OnlineGame } = require("./game-engine.cjs");
const { createAccountsStore } = require("./accounts-store.cjs");
const { createAccountsHttp } = require("./accounts-http.cjs");

const PORT = Number(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname);

function parseRoomIdleMs() {
  const v = process.env.ROOM_IDLE_MS;
  if (v === undefined || v === "") {
    return 60 * 60 * 1000;
  }
  const lower = String(v).trim().toLowerCase();
  if (lower === "0" || lower === "never" || lower === "infinity") {
    return 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    return 60 * 60 * 1000;
  }
  return n;
}

const ROOM_IDLE_MS = parseRoomIdleMs();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const GZIP_EXTS = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".csv"]);
const LONG_CACHE_EXTS = new Set([
  ".js",
  ".css",
  ".png",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".json"
]);

function sendStaticFile(req, res, file, ext) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream"
    };
    if (LONG_CACHE_EXTS.has(ext)) {
      const liveJs = path.basename(file);
      if (liveJs === "app-online.js" || liveJs === "app.js" || liveJs === "tile-pointer-drag.js") {
        headers["Cache-Control"] = "no-cache";
      } else {
        headers["Cache-Control"] = "public, max-age=86400";
      }
    } else {
      headers["Cache-Control"] = "no-cache";
    }

    const accept = String(req.headers["accept-encoding"] || "");
    if (GZIP_EXTS.has(ext) && /\bgzip\b/.test(accept) && data.length > 1024) {
      zlib.gzip(data, (zipErr, compressed) => {
        if (zipErr) {
          res.writeHead(200, headers);
          res.end(data);
          return;
        }
        headers["Content-Encoding"] = "gzip";
        headers.Vary = "Accept-Encoding";
        res.writeHead(200, headers);
        res.end(compressed);
      });
      return;
    }

    res.writeHead(200, headers);
    res.end(data);
  });
}

function safeJoin(base, target) {
  const baseNorm = path.resolve(base);
  const resolved = path.resolve(path.join(baseNorm, target));
  const rel = path.relative(baseNorm, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

const dictionary = loadDictionary();

/** @type {Map<string, any>} */
const liveGames = new Map();

let accountsStore = null;
let accountsHttp = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const touchGameTimers = new Map();

function scheduleTouchGame(gameId) {
  const existing = touchGameTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    touchGameTimers.delete(gameId);
    void accountsStore.touchGame(gameId).catch((err) => {
      process.stderr.write(`[accounts] touchGame: ${err.message}\n`);
    });
  }, 2500);
  touchGameTimers.set(gameId, timer);
}

function cancelRoomCleanup(room) {
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }
}

function scheduleRoomCleanup(room) {
  if (ROOM_IDLE_MS === 0) {
    return;
  }
  cancelRoomCleanup(room);
  room.idleTimer = setTimeout(() => {
    room.idleTimer = null;
    if (!room.slots[0] && !room.slots[1]) {
      liveGames.delete(room.gameId);
    }
  }, ROOM_IDLE_MS);
}

function broadcastRoom(room) {
  for (let i = 0; i < 2; i += 1) {
    const sock = room.slots[i];
    if (sock && sock.readyState === WebSocket.OPEN) {
      const payload = room.game.getState(i);
      payload.gameId = room.gameId;
      payload.playerNames = room.usernames;
      sock.send(JSON.stringify({ type: "state", payload }));
    }
  }
}

function attachSlot(ws, room, playerIndex) {
  cancelRoomCleanup(room);
  const existing = room.slots[playerIndex];
  if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
    existing.close();
  }
  room.slots[playerIndex] = ws;
  ws.__globble = { playerIndex, room, userId: room.playerIds[playerIndex] };
}

function leaveRoom(ws) {
  const meta = ws.__globble;
  if (!meta || !meta.room) return;
  const room = meta.room;
  const idx = meta.playerIndex;
  if (typeof idx === "number" && room.slots[idx] === ws) {
    room.slots[idx] = null;
  }
  ws.__globble = { user: meta.user || null };
  if (!room.slots[0] && !room.slots[1]) {
    scheduleRoomCleanup(room);
  }
}

async function ensureLiveGame(gameDoc) {
  const gameId = String(gameDoc._id);
  let room = liveGames.get(gameId);
  if (room) {
    return room;
  }
  if (gameDoc.status !== "active" && gameDoc.status !== "pending") {
    return null;
  }
  const game = new OnlineGame(dictionary);
  if (gameDoc.status === "active") {
    game.initGame();
    if (Array.isArray(gameDoc.usernames)) {
      gameDoc.usernames.forEach((name, index) => {
        if (game.players[index]) {
          game.players[index].name = name;
        }
      });
    }
  }
  room = {
    gameId,
    game,
    slots: [null, null],
    playerIds: gameDoc.playerIds.map(String),
    usernames: gameDoc.usernames.slice(),
    seatTokens: gameDoc.seatTokens ? gameDoc.seatTokens.slice() : [null, null],
    idleTimer: null,
    createdAt: Date.parse(gameDoc.createdAt) || Date.now(),
    status: gameDoc.status
  };
  liveGames.set(gameId, room);
  return room;
}

async function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: "error", error: "Invalid JSON." }));
    return;
  }

  const type = msg && msg.type;

  if (type === "auth") {
    const token = String(msg.token || "").trim();
    const user = await accountsStore.userFromSessionToken(token);
    if (!user) {
      ws.send(JSON.stringify({ type: "error", error: "Sign in required." }));
      return;
    }
    ws.__globble = { ...(ws.__globble || {}), user, token };
    ws.send(JSON.stringify({ type: "authed", user }));
    return;
  }

  if (type === "enterGame") {
    const user = ws.__globble?.user;
    if (!user) {
      ws.send(JSON.stringify({ type: "error", error: "Authenticate first." }));
      return;
    }
    const gameId = String(msg.gameId || "").trim();
    leaveRoom(ws);
    const gameDoc = await accountsStore.getGame(gameId);
    if (!gameDoc) {
      ws.send(JSON.stringify({ type: "error", error: "Game not found." }));
      return;
    }
    const playerIds = gameDoc.playerIds.map(String);
    const playerIndex = playerIds.indexOf(String(user._id));
    if (playerIndex < 0) {
      ws.send(JSON.stringify({ type: "error", error: "You are not in this game." }));
      return;
    }
    if (gameDoc.status === "pending") {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Waiting for your opponent to accept the challenge."
        })
      );
      return;
    }
    if (gameDoc.status !== "active") {
      ws.send(JSON.stringify({ type: "error", error: "This game is no longer active." }));
      return;
    }

    const room = await ensureLiveGame(gameDoc);
    room.status = "active";
    attachSlot(ws, room, playerIndex);
    ws.send(
      JSON.stringify({
        type: "joined",
        gameId: room.gameId,
        playerIndex,
        playerToken: room.seatTokens[playerIndex],
        usernames: room.usernames
      })
    );
    broadcastRoom(room);
    return;
  }

  // Legacy room-code messages removed.
  if (type === "host" || type === "join" || type === "rejoin") {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Room codes are gone. Sign in and challenge a player by username."
      })
    );
    return;
  }

  const meta = ws.__globble;
  if (!meta || !meta.room || typeof meta.playerIndex !== "number") {
    ws.send(JSON.stringify({ type: "error", error: "Open one of your games first." }));
    return;
  }

  const { room, playerIndex } = meta;
  const { game } = room;
  let result;

  switch (type) {
    case "placeTile": {
      result = game.placeRackTile(
        playerIndex,
        Number(msg.row),
        Number(msg.col),
        Number(msg.rackIndex),
        msg.blankLetter
      );
      break;
    }
    case "moveTile": {
      result = game.moveTurnTile(
        playerIndex,
        Number(msg.targetRow),
        Number(msg.targetCol),
        Number(msg.sourceRow),
        Number(msg.sourceCol)
      );
      break;
    }
    case "removeTile": {
      result = game.removeTurnTile(
        playerIndex,
        Number(msg.row),
        Number(msg.col),
        msg.preferredRackSlot != null ? Number(msg.preferredRackSlot) : null
      );
      break;
    }
    case "recall": {
      result = game.recallTurnTiles(playerIndex);
      break;
    }
    case "submit": {
      result = game.submitTurn(playerIndex);
      break;
    }
    case "pass": {
      result = game.passTurn(playerIndex);
      break;
    }
    case "shuffle": {
      result = game.shuffleRack(playerIndex);
      break;
    }
    case "reorderRack": {
      result = game.reorderRack(playerIndex, msg.fromIndex, msg.toIndex);
      break;
    }
    default:
      ws.send(JSON.stringify({ type: "error", error: `Unknown action: ${type}` }));
      return;
  }

  if (!result.ok) {
    ws.send(JSON.stringify({ type: "error", error: result.error || "Rejected." }));
    if (result.error?.startsWith("Invalid word:")) {
      broadcastRoom(room);
    }
    return;
  }

  // Update clients immediately — do not wait on MongoDB for mid-turn moves.
  broadcastRoom(room);

  if (game.gameOver) {
    let winnerUserId = null;
    const scores = game.players?.map((p) => p.score) || [];
    if (scores.length === 2 && scores[0] !== scores[1]) {
      winnerUserId = room.playerIds[scores[0] > scores[1] ? 0 : 1];
    }
    room.status = "finished";
    void accountsStore.markGameFinished(room.gameId, winnerUserId).catch((err) => {
      process.stderr.write(`[accounts] markGameFinished: ${err.message}\n`);
    });
  } else if (type === "submit" || type === "pass") {
    void accountsStore.touchGame(room.gameId).catch((err) => {
      process.stderr.write(`[accounts] touchGame: ${err.message}\n`);
    });
  } else {
    scheduleTouchGame(room.gameId);
  }
}

async function start() {
  accountsStore = await createAccountsStore();
  accountsHttp = createAccountsHttp(accountsStore);

  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = (req.url || "/").split("?")[0];
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }

      if (urlPath.startsWith("/api/")) {
        const handled = await accountsHttp.handle(req, res, urlPath);
        if (handled) {
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      if (urlPath === "/") {
        urlPath = "/mobile-preview.html";
      }
      const file = safeJoin(ROOT, urlPath.replace(/^\//, "").replace(/\\/g, "/"));
      if (!file) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const ext = path.extname(file);
      sendStaticFile(req, res, file, ext);
    } catch (err) {
      process.stderr.write(`${err.stack || err.message}\n`);
      res.writeHead(500);
      res.end("Server error");
    }
  });

  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", (ws) => {
    ws.__globble = {};
    ws.on("message", (data) => {
      handleMessage(ws, data.toString()).catch((err) => {
        process.stderr.write(`[ws] ${err.stack || err.message}\n`);
        try {
          ws.send(JSON.stringify({ type: "error", error: "Server error." }));
        } catch {
          /* ignore */
        }
      });
    });
    ws.on("close", () => {
      leaveRoom(ws);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host || "localhost";
    const url = new URL(request.url || "/", `http://${host}`);
    if (url.pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(PORT, HOST, () => {
    const idleLabel =
      ROOM_IDLE_MS === 0
        ? "off (live games kept until process restart)"
        : `${ROOM_IDLE_MS} ms after both disconnect`;
    process.stdout.write(
      `Globbal — http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/ (main menu)\n` +
        `WebSocket: ws://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/ws\n` +
        `Accounts store: ${accountsStore.mode}${
          accountsStore.mode === "file"
            ? " (set MONGODB_URI in .env for MongoDB)"
            : ` (database: ${process.env.MONGODB_DB || "globble"})`
        }\n` +
        `Live game idle cleanup: ${idleLabel}\n`
    );
  });

  server.on("error", (err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}

start().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
