"use strict";

/**
 * Users, sessions, and games.
 * Uses MongoDB when MONGODB_URI is set; otherwise a JSON file under ./data/.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

const DATA_DIR = path.join(__dirname, "data");
const FILE_STORE = path.join(DATA_DIR, "accounts-store.json");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(username));
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString("hex")}$${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = await scrypt(String(password), salt, expected.length);
  return crypto.timingSafeEqual(Buffer.from(derived), expected);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function emptyFileData() {
  return { users: [], sessions: [], games: [] };
}

function readFileData() {
  try {
    if (!fs.existsSync(FILE_STORE)) {
      return emptyFileData();
    }
    const raw = fs.readFileSync(FILE_STORE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      games: Array.isArray(parsed.games) ? parsed.games : []
    };
  } catch {
    return emptyFileData();
  }
}

function writeFileData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE_STORE, JSON.stringify(data, null, 2), "utf8");
}

function createFileBackend() {
  return {
    mode: "file",
    async createUser({ username, password }) {
      const data = readFileData();
      const key = normalizeUsername(username);
      if (data.users.some((u) => u.usernameKey === key)) {
        const err = new Error("Username already taken.");
        err.code = "USERNAME_TAKEN";
        throw err;
      }
      const user = {
        _id: newId("usr"),
        username: key,
        usernameKey: key,
        passwordHash: await hashPassword(password),
        createdAt: nowIso()
      };
      data.users.push(user);
      writeFileData(data);
      return publicUser(user);
    },
    async findUserByUsername(username) {
      const data = readFileData();
      const key = normalizeUsername(username);
      return data.users.find((u) => u.usernameKey === key) || null;
    },
    async findUserById(id) {
      const data = readFileData();
      return data.users.find((u) => u._id === id) || null;
    },
    async searchUsers(query, { excludeUserId, limit = 12 } = {}) {
      const data = readFileData();
      const q = normalizeUsername(query);
      if (!q) return [];
      return data.users
        .filter((u) => u._id !== excludeUserId && u.usernameKey.includes(q))
        .slice(0, limit)
        .map(publicUser);
    },
    async createSession(userId) {
      const data = readFileData();
      const token = randomToken();
      data.sessions.push({
        _id: newId("ses"),
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        createdAt: nowIso()
      });
      writeFileData(data);
      return token;
    },
    async userFromSessionToken(token) {
      if (!token) return null;
      const data = readFileData();
      const tokenHash = hashToken(token);
      const session = data.sessions.find((s) => s.tokenHash === tokenHash);
      if (!session) return null;
      if (Date.parse(session.expiresAt) < Date.now()) {
        data.sessions = data.sessions.filter((s) => s._id !== session._id);
        writeFileData(data);
        return null;
      }
      const user = data.users.find((u) => u._id === session.userId);
      return user ? publicUser(user) : null;
    },
    async deleteSession(token) {
      if (!token) return;
      const data = readFileData();
      const tokenHash = hashToken(token);
      data.sessions = data.sessions.filter((s) => s.tokenHash !== tokenHash);
      writeFileData(data);
    },
    async createChallenge({ challenger, opponent }) {
      const data = readFileData();
      const existing = data.games.find(
        (g) =>
          (g.status === "pending" || g.status === "active") &&
          ((g.playerIds[0] === challenger._id && g.playerIds[1] === opponent._id) ||
            (g.playerIds[0] === opponent._id && g.playerIds[1] === challenger._id))
      );
      if (existing) {
        const err = new Error("You already have a pending or active game with that player.");
        err.code = "GAME_EXISTS";
        err.game = publicGame(existing, challenger._id);
        throw err;
      }
      const game = {
        _id: newId("game"),
        status: "pending",
        playerIds: [challenger._id, opponent._id],
        usernames: [challenger.username, opponent.username],
        challengedBy: challenger._id,
        seatTokens: [randomToken(), randomToken()],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedAt: null,
        finishedAt: null,
        winnerUserId: null
      };
      data.games.push(game);
      writeFileData(data);
      return publicGame(game, challenger._id);
    },
    async getGame(gameId) {
      const data = readFileData();
      return data.games.find((g) => g._id === gameId) || null;
    },
    async listGamesForUser(userId) {
      const data = readFileData();
      return data.games
        .filter(
          (g) =>
            g.playerIds.includes(userId) &&
            (g.status === "pending" || g.status === "active")
        )
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((g) => publicGame(g, userId));
    },
    async acceptChallenge(gameId, userId) {
      const data = readFileData();
      const game = data.games.find((g) => g._id === gameId);
      if (!game) {
        const err = new Error("Game not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (game.status !== "pending") {
        const err = new Error("This challenge is no longer pending.");
        err.code = "BAD_STATUS";
        throw err;
      }
      if (game.challengedBy === userId) {
        const err = new Error("You cannot accept your own challenge.");
        err.code = "FORBIDDEN";
        throw err;
      }
      if (!game.playerIds.includes(userId)) {
        const err = new Error("Not your challenge.");
        err.code = "FORBIDDEN";
        throw err;
      }
      game.status = "active";
      game.startedAt = nowIso();
      game.updatedAt = nowIso();
      writeFileData(data);
      return game;
    },
    async declineChallenge(gameId, userId) {
      const data = readFileData();
      const game = data.games.find((g) => g._id === gameId);
      if (!game) {
        const err = new Error("Game not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (game.status !== "pending") {
        const err = new Error("This challenge is no longer pending.");
        err.code = "BAD_STATUS";
        throw err;
      }
      if (!game.playerIds.includes(userId)) {
        const err = new Error("Not your challenge.");
        err.code = "FORBIDDEN";
        throw err;
      }
      game.status = "declined";
      game.updatedAt = nowIso();
      writeFileData(data);
      return publicGame(game, userId);
    },
    async markGameFinished(gameId, winnerUserId = null) {
      const data = readFileData();
      const game = data.games.find((g) => g._id === gameId);
      if (!game) return null;
      game.status = "finished";
      game.finishedAt = nowIso();
      game.updatedAt = nowIso();
      game.winnerUserId = winnerUserId;
      writeFileData(data);
      return game;
    },
    async touchGame(gameId) {
      const data = readFileData();
      const game = data.games.find((g) => g._id === gameId);
      if (!game) return;
      game.updatedAt = nowIso();
      writeFileData(data);
    }
  };
}

async function createMongoBackend(uri) {
  const { MongoClient, ObjectId } = require("mongodb");
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = process.env.MONGODB_DB || "globble";
  const db = client.db(dbName);
  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const games = db.collection("games");
  await users.createIndex({ usernameKey: 1 }, { unique: true });
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await games.createIndex({ playerIds: 1, status: 1 });

  function oid(id) {
    try {
      return new ObjectId(id);
    } catch {
      return null;
    }
  }

  function toPublic(doc) {
    if (!doc) return null;
    return {
      _id: String(doc._id),
      username: doc.username || doc.usernameKey,
      createdAt: doc.createdAt
    };
  }

  return {
    mode: "mongo",
    client,
    async createUser({ username, password }) {
      const key = normalizeUsername(username);
      try {
        const doc = {
          username: key,
          usernameKey: key,
          passwordHash: await hashPassword(password),
          createdAt: nowIso()
        };
        const result = await users.insertOne(doc);
        return toPublic({ ...doc, _id: result.insertedId });
      } catch (err) {
        if (err && err.code === 11000) {
          const e = new Error("Username already taken.");
          e.code = "USERNAME_TAKEN";
          throw e;
        }
        throw err;
      }
    },
    async findUserByUsername(username) {
      return users.findOne({ usernameKey: normalizeUsername(username) });
    },
    async findUserById(id) {
      const _id = oid(id);
      if (!_id) return null;
      return users.findOne({ _id });
    },
    async searchUsers(query, { excludeUserId, limit = 12 } = {}) {
      const q = normalizeUsername(query);
      if (!q) return [];
      const filter = { usernameKey: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } };
      const exclude = oid(excludeUserId);
      if (exclude) filter._id = { $ne: exclude };
      const rows = await users.find(filter).limit(limit).toArray();
      return rows.map(toPublic);
    },
    async createSession(userId) {
      const token = randomToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await sessions.insertOne({
        userId: oid(userId) || userId,
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: new Date()
      });
      return token;
    },
    async userFromSessionToken(token) {
      if (!token) return null;
      const session = await sessions.findOne({ tokenHash: hashToken(token) });
      if (!session) return null;
      if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
        await sessions.deleteOne({ _id: session._id });
        return null;
      }
      const user = await users.findOne({ _id: session.userId });
      return toPublic(user);
    },
    async deleteSession(token) {
      if (!token) return;
      await sessions.deleteOne({ tokenHash: hashToken(token) });
    },
    async createChallenge({ challenger, opponent }) {
      const a = oid(challenger._id);
      const b = oid(opponent._id);
      const existing = await games.findOne({
        status: { $in: ["pending", "active"] },
        playerIds: { $all: [a, b], $size: 2 }
      });
      if (existing) {
        const err = new Error("You already have a pending or active game with that player.");
        err.code = "GAME_EXISTS";
        err.game = publicGameMongo(existing, challenger._id);
        throw err;
      }
      const doc = {
        status: "pending",
        playerIds: [a, b],
        usernames: [challenger.username, opponent.username],
        challengedBy: a,
        seatTokens: [randomToken(), randomToken()],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedAt: null,
        finishedAt: null,
        winnerUserId: null
      };
      const result = await games.insertOne(doc);
      return publicGameMongo({ ...doc, _id: result.insertedId }, challenger._id);
    },
    async getGame(gameId) {
      const _id = oid(gameId);
      if (!_id) return null;
      const doc = await games.findOne({ _id });
      if (!doc) return null;
      return {
        ...doc,
        _id: String(doc._id),
        playerIds: doc.playerIds.map(String),
        challengedBy: String(doc.challengedBy),
        winnerUserId: doc.winnerUserId ? String(doc.winnerUserId) : null
      };
    },
    async listGamesForUser(userId) {
      const id = oid(userId);
      if (!id) return [];
      const rows = await games
        .find({ playerIds: id, status: { $in: ["pending", "active"] } })
        .sort({ updatedAt: -1 })
        .toArray();
      return rows.map((g) => publicGameMongo(g, userId));
    },
    async acceptChallenge(gameId, userId) {
      const game = await this.getGame(gameId);
      if (!game) {
        const err = new Error("Game not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (game.status !== "pending") {
        const err = new Error("This challenge is no longer pending.");
        err.code = "BAD_STATUS";
        throw err;
      }
      if (game.challengedBy === userId) {
        const err = new Error("You cannot accept your own challenge.");
        err.code = "FORBIDDEN";
        throw err;
      }
      if (!game.playerIds.includes(userId)) {
        const err = new Error("Not your challenge.");
        err.code = "FORBIDDEN";
        throw err;
      }
      await games.updateOne(
        { _id: oid(gameId) },
        { $set: { status: "active", startedAt: nowIso(), updatedAt: nowIso() } }
      );
      return this.getGame(gameId);
    },
    async declineChallenge(gameId, userId) {
      const game = await this.getGame(gameId);
      if (!game) {
        const err = new Error("Game not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (game.status !== "pending") {
        const err = new Error("This challenge is no longer pending.");
        err.code = "BAD_STATUS";
        throw err;
      }
      if (!game.playerIds.includes(userId)) {
        const err = new Error("Not your challenge.");
        err.code = "FORBIDDEN";
        throw err;
      }
      await games.updateOne(
        { _id: oid(gameId) },
        { $set: { status: "declined", updatedAt: nowIso() } }
      );
      return publicGame(await this.getGame(gameId), userId);
    },
    async markGameFinished(gameId, winnerUserId = null) {
      await games.updateOne(
        { _id: oid(gameId) },
        {
          $set: {
            status: "finished",
            finishedAt: nowIso(),
            updatedAt: nowIso(),
            winnerUserId: winnerUserId ? oid(winnerUserId) : null
          }
        }
      );
      return this.getGame(gameId);
    },
    async touchGame(gameId) {
      await games.updateOne({ _id: oid(gameId) }, { $set: { updatedAt: nowIso() } });
    }
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    _id: String(user._id),
    username: user.username || user.usernameKey,
    createdAt: user.createdAt || null
  };
}

function publicGame(game, viewerId) {
  if (!game) return null;
  const playerIds = game.playerIds.map(String);
  const myIndex = playerIds.indexOf(String(viewerId));
  const opponentIndex = myIndex === 0 ? 1 : myIndex === 1 ? 0 : -1;
  return {
    id: String(game._id),
    status: game.status,
    usernames: game.usernames,
    myUsername: myIndex >= 0 ? game.usernames[myIndex] : null,
    opponentUsername: opponentIndex >= 0 ? game.usernames[opponentIndex] : null,
    challengedByMe: String(game.challengedBy) === String(viewerId),
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    startedAt: game.startedAt,
    canAccept: game.status === "pending" && String(game.challengedBy) !== String(viewerId)
  };
}

function publicGameMongo(game, viewerId) {
  return publicGame(
    {
      ...game,
      _id: String(game._id),
      playerIds: game.playerIds.map(String),
      challengedBy: String(game.challengedBy)
    },
    viewerId
  );
}

async function createAccountsStore() {
  const uri = process.env.MONGODB_URI || "";
  const allowFile = process.env.ALLOW_FILE_ACCOUNTS === "1";
  if (uri) {
    const backend = await createMongoBackend(uri);
    return {
      ...backend,
      isValidUsername,
      normalizeUsername,
      verifyPassword,
      publicUser,
      publicGame: (game, viewerId) => publicGame(game, viewerId)
    };
  }
  if (!allowFile) {
    const err = new Error(
      "MONGODB_URI is required. Set it in .env or Railway Variables. " +
        "(Local file accounts only if ALLOW_FILE_ACCOUNTS=1 for dev.)"
    );
    err.code = "MONGODB_REQUIRED";
    throw err;
  }
  const backend = createFileBackend();
  return {
    ...backend,
    isValidUsername,
    normalizeUsername,
    verifyPassword,
    publicUser,
    publicGame: (game, viewerId) => publicGame(game, viewerId)
  };
}

module.exports = {
  createAccountsStore,
  isValidUsername,
  normalizeUsername,
  verifyPassword,
  publicUser
};
