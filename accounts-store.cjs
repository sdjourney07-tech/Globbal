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
const RESET_TTL_MS = 60 * 60 * 1000;

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

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  const value = normalizeEmail(email);
  // Practical check — not full RFC compliance.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function looksLikeEmail(value) {
  return String(value || "").includes("@");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function normalizeOptionalEmail(email) {
  const value = normalizeEmail(email);
  if (!value) {
    return "";
  }
  if (!isValidEmail(value)) {
    const err = new Error("Enter a valid email address.");
    err.code = "BAD_EMAIL";
    throw err;
  }
  return value;
}

function normalizeDisplayName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function isValidDisplayName(name) {
  const value = normalizeDisplayName(name);
  if (!value) {
    return true;
  }
  return value.length >= 1 && value.length <= 40;
}

function normalizeDisplayNameKey(name) {
  return normalizeDisplayName(name).toLowerCase();
}

function usernameTakenError(message) {
  const err = new Error(
    message || "That name is unavailable. Names can only be claimed once and cannot be reused."
  );
  err.code = "USERNAME_TAKEN";
  return err;
}

function displayNameTakenError(message) {
  const err = new Error(
    message || "That display name is unavailable. Choose a name that has never been used."
  );
  err.code = "DISPLAY_NAME_TAKEN";
  return err;
}

function badUsernameError() {
  const err = new Error("Username must be 3–20 characters: letters, numbers, underscore.");
  err.code = "BAD_USERNAME";
  return err;
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
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (!salt.length || !expected.length) {
      return false;
    }
    const derived = await scrypt(String(password), salt, expected.length);
    const actual = Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
    if (actual.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function emptyFileData() {
  return { users: [], sessions: [], games: [], reservedUsernames: [] };
}

function ensureFileReservedUsernames(data) {
  if (!Array.isArray(data.reservedUsernames)) {
    data.reservedUsernames = [];
  }
  const seen = new Set(
    data.reservedUsernames.map((row) => normalizeUsername(row && row.usernameKey)).filter(Boolean)
  );
  for (const user of data.users) {
    const key = normalizeUsername(user.usernameKey || user.username);
    if (!key || seen.has(key)) {
      continue;
    }
    data.reservedUsernames.push({
      usernameKey: key,
      reservedAt: user.createdAt || nowIso(),
      userId: user._id || null
    });
    seen.add(key);
  }
  return data;
}

function fileUsernameEverUsed(data, usernameKey) {
  const key = normalizeUsername(usernameKey);
  if (!key) {
    return false;
  }
  return data.reservedUsernames.some((row) => row.usernameKey === key);
}

function reserveFileUsername(data, usernameKey, userId) {
  const key = normalizeUsername(usernameKey);
  if (!key || fileUsernameEverUsed(data, key)) {
    return;
  }
  data.reservedUsernames.push({
    usernameKey: key,
    reservedAt: nowIso(),
    userId: userId || null
  });
}

function rewriteFileGameUsernames(data, userId, nextUsername) {
  const uid = String(userId);
  const name = normalizeUsername(nextUsername);
  for (const game of data.games) {
    const playerIds = Array.isArray(game.playerIds) ? game.playerIds.map(String) : [];
    const index = playerIds.indexOf(uid);
    if (index < 0) {
      continue;
    }
    if (!Array.isArray(game.usernames)) {
      game.usernames = ["Player 1", "Player 2"];
    }
    game.usernames[index] = name;
    game.updatedAt = nowIso();
  }
}

function assertFileDisplayNameAvailable(data, displayName, userId) {
  const next = normalizeDisplayName(displayName);
  if (!next) {
    return;
  }
  const displayKey = normalizeDisplayNameKey(next);
  const asUsername = normalizeUsername(next);
  const own = data.users.find((u) => u._id === userId);
  const ownUsername = normalizeUsername(own && (own.usernameKey || own.username));

  for (const user of data.users) {
    if (user._id === userId) {
      continue;
    }
    if (user.displayName && normalizeDisplayNameKey(user.displayName) === displayKey) {
      throw displayNameTakenError();
    }
  }

  // Block looking like any login name that was ever claimed (except your own current username).
  if (/^[a-z0-9_]+$/.test(asUsername) && asUsername !== ownUsername && fileUsernameEverUsed(data, asUsername)) {
    throw displayNameTakenError();
  }
}

function readFileData() {
  try {
    if (!fs.existsSync(FILE_STORE)) {
      return emptyFileData();
    }
    const raw = fs.readFileSync(FILE_STORE, "utf8");
    const parsed = JSON.parse(raw);
    const data = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      reservedUsernames: Array.isArray(parsed.reservedUsernames) ? parsed.reservedUsernames : []
    };
    return ensureFileReservedUsernames(data);
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
    async createUser({ username, password, email }) {
      const data = readFileData();
      const key = normalizeUsername(username);
      const emailKey = normalizeOptionalEmail(email);
      if (!isValidUsername(key)) {
        throw badUsernameError();
      }
      if (fileUsernameEverUsed(data, key) || data.users.some((u) => u.usernameKey === key)) {
        throw usernameTakenError();
      }
      if (emailKey && data.users.some((u) => u.emailKey === emailKey)) {
        const err = new Error("That email is already linked to an account.");
        err.code = "EMAIL_TAKEN";
        throw err;
      }
      const user = {
        _id: newId("usr"),
        username: key,
        usernameKey: key,
        email: emailKey || null,
        emailKey: emailKey || null,
        passwordHash: await hashPassword(password),
        createdAt: nowIso()
      };
      data.users.push(user);
      reserveFileUsername(data, key, user._id);
      writeFileData(data);
      return publicUser(user);
    },
    async findUserByUsername(username) {
      const data = readFileData();
      const key = normalizeUsername(username);
      return data.users.find((u) => u.usernameKey === key) || null;
    },
    async findUserByEmail(email) {
      const data = readFileData();
      const key = normalizeEmail(email);
      if (!key) return null;
      return data.users.find((u) => u.emailKey === key) || null;
    },
    async findUserByLogin(identifier) {
      const raw = String(identifier || "").trim();
      if (!raw) return null;
      if (looksLikeEmail(raw)) {
        return this.findUserByEmail(raw);
      }
      return this.findUserByUsername(raw);
    },
    async findUserById(id) {
      const data = readFileData();
      return data.users.find((u) => u._id === id) || null;
    },
    async createPasswordReset(userId) {
      const data = readFileData();
      const user = data.users.find((u) => u._id === userId);
      if (!user || !user.emailKey) {
        return null;
      }
      const token = randomToken();
      user.resetTokenHash = hashToken(token);
      user.resetExpiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      writeFileData(data);
      return { token, email: user.emailKey, username: user.username || user.usernameKey };
    },
    async resetPasswordWithToken(token, newPassword) {
      const data = readFileData();
      const tokenHash = hashToken(token);
      const user = data.users.find((u) => u.resetTokenHash === tokenHash);
      if (!user) {
        const err = new Error("This reset link is invalid or has expired.");
        err.code = "BAD_RESET";
        throw err;
      }
      if (!user.resetExpiresAt || Date.parse(user.resetExpiresAt) < Date.now()) {
        delete user.resetTokenHash;
        delete user.resetExpiresAt;
        writeFileData(data);
        const err = new Error("This reset link is invalid or has expired.");
        err.code = "BAD_RESET";
        throw err;
      }
      user.passwordHash = await hashPassword(newPassword);
      delete user.resetTokenHash;
      delete user.resetExpiresAt;
      writeFileData(data);
      return publicUser(user);
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
      delete game.liveSnapshot;
      delete game.scores;
      delete game.currentPlayer;
      writeFileData(data);
      return game;
    },
    async touchGame(gameId) {
      const data = readFileData();
      const game = data.games.find((g) => g._id === gameId);
      if (!game) return;
      game.updatedAt = nowIso();
      writeFileData(data);
    },
    async saveLiveSnapshot(gameId, snapshot) {
      const data = readFileData();
      const game = data.games.find((g) => g._id === gameId);
      if (!game || game.status !== "active") {
        return;
      }
      game.liveSnapshot = snapshot;
      game.scores = Array.isArray(snapshot?.players)
        ? snapshot.players.map((p) => Number(p?.score) || 0)
        : [0, 0];
      game.currentPlayer = snapshot?.currentPlayer === 1 ? 1 : 0;
      game.updatedAt = nowIso();
      writeFileData(data);
    },
    async getUserProfile(userId) {
      const data = readFileData();
      const user = data.users.find((u) => u._id === userId);
      if (!user) {
        return null;
      }
      return {
        user: profileUser(user),
        ...buildUserProfile(userId, data.games)
      };
    },
    async updateUserProfile(userId, { displayName, email, username }) {
      const data = readFileData();
      const user = data.users.find((u) => u._id === userId);
      if (!user) {
        const err = new Error("Account not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (username !== undefined) {
        const next = normalizeUsername(username);
        if (!isValidUsername(next)) {
          throw badUsernameError();
        }
        const current = normalizeUsername(user.usernameKey || user.username);
        if (next !== current) {
          if (fileUsernameEverUsed(data, next) || data.users.some((u) => u.usernameKey === next)) {
            throw usernameTakenError();
          }
          user.username = next;
          user.usernameKey = next;
          reserveFileUsername(data, next, userId);
          rewriteFileGameUsernames(data, userId, next);
        }
      }
      if (displayName !== undefined) {
        if (!isValidDisplayName(displayName)) {
          const err = new Error("Display name must be 1–40 characters.");
          err.code = "BAD_DISPLAY_NAME";
          throw err;
        }
        const next = normalizeDisplayName(displayName);
        assertFileDisplayNameAvailable(data, next, userId);
        user.displayName = next || null;
      }
      if (email !== undefined) {
        const raw = String(email || "").trim();
        const emailKey = raw ? normalizeOptionalEmail(raw) : "";
        if (emailKey && data.users.some((u) => u._id !== userId && u.emailKey === emailKey)) {
          const err = new Error("That email is already linked to an account.");
          err.code = "EMAIL_TAKEN";
          throw err;
        }
        user.email = emailKey || null;
        user.emailKey = emailKey || null;
      }
      writeFileData(data);
      return profileUser(user);
    }
  };
}

function resolveMongoDbName(uri) {
  const fromEnv = String(process.env.MONGODB_DB || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const parsed = new URL(uri);
    const fromPath = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "").trim();
    if (fromPath) {
      return fromPath;
    }
  } catch {
    /* ignore bad URI parse */
  }
  return "globble";
}

async function createMongoBackend(uri) {
  const { MongoClient, ObjectId } = require("mongodb");
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = resolveMongoDbName(uri);
  const db = client.db(dbName);
  process.stdout.write(`[accounts] MongoDB database: ${dbName}\n`);
  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const games = db.collection("games");
  const reservedUsernames = db.collection("reserved_usernames");
  await users.createIndex({ usernameKey: 1 }, { unique: true });
  await users.createIndex(
    { emailKey: 1 },
    { unique: true, partialFilterExpression: { emailKey: { $type: "string" } } }
  );
  await reservedUsernames.createIndex({ usernameKey: 1 }, { unique: true });
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await games.createIndex({ playerIds: 1, status: 1 });

  async function seedReservedUsernames() {
    const cursor = users.find(
      {},
      { projection: { usernameKey: 1, username: 1, createdAt: 1 } }
    );
    for await (const user of cursor) {
      const key = normalizeUsername(user.usernameKey || user.username);
      if (!key) {
        continue;
      }
      await reservedUsernames.updateOne(
        { usernameKey: key },
        {
          $setOnInsert: {
            usernameKey: key,
            reservedAt: user.createdAt || new Date(),
            userId: user._id
          }
        },
        { upsert: true }
      );
    }
  }
  await seedReservedUsernames();

  async function usernameEverUsed(usernameKey) {
    const key = normalizeUsername(usernameKey);
    if (!key) {
      return false;
    }
    const row = await reservedUsernames.findOne({ usernameKey: key });
    return Boolean(row);
  }

  async function claimUsername(usernameKey, userId) {
    const key = normalizeUsername(usernameKey);
    if (!key) {
      throw badUsernameError();
    }
    try {
      await reservedUsernames.insertOne({
        usernameKey: key,
        reservedAt: new Date(),
        userId: userId || null
      });
    } catch (err) {
      if (err && err.code === 11000) {
        throw usernameTakenError();
      }
      throw err;
    }
  }

  async function rewriteGameUsernames(userId, nextUsername) {
    const id = oid(userId);
    if (!id) {
      return;
    }
    const name = normalizeUsername(nextUsername);
    const activeGames = await games
      .find({ playerIds: id })
      .project({ playerIds: 1, usernames: 1 })
      .toArray();
    for (const game of activeGames) {
      const playerIds = Array.isArray(game.playerIds) ? game.playerIds.map(String) : [];
      const index = playerIds.indexOf(String(userId));
      if (index < 0) {
        continue;
      }
      const usernames = Array.isArray(game.usernames) ? game.usernames.slice() : ["Player 1", "Player 2"];
      usernames[index] = name;
      await games.updateOne(
        { _id: game._id },
        { $set: { usernames, updatedAt: nowIso() } }
      );
    }
  }

  async function assertDisplayNameAvailable(displayName, userId, ownUsernameKey) {
    const next = normalizeDisplayName(displayName);
    if (!next) {
      return;
    }
    const displayKey = normalizeDisplayNameKey(next);
    const asUsername = normalizeUsername(next);
    const id = oid(userId);
    const others = await users
      .find(id ? { _id: { $ne: id } } : {})
      .project({ displayName: 1 })
      .toArray();
    for (const user of others) {
      if (user.displayName && normalizeDisplayNameKey(user.displayName) === displayKey) {
        throw displayNameTakenError();
      }
    }
    if (
      /^[a-z0-9_]+$/.test(asUsername) &&
      asUsername !== normalizeUsername(ownUsernameKey) &&
      (await usernameEverUsed(asUsername))
    ) {
      throw displayNameTakenError();
    }
  }

  function oid(id) {
    try {
      return new ObjectId(id);
    } catch {
      return null;
    }
  }

  function toPublic(doc) {
    return publicUser(doc);
  }

  function duplicateKeyCode(err) {
    if (!err || err.code !== 11000) return null;
    const key = String(err.keyPattern ? Object.keys(err.keyPattern)[0] : "");
    if (key === "emailKey") return "EMAIL_TAKEN";
    return "USERNAME_TAKEN";
  }

  return {
    mode: "mongo",
    client,
    async createUser({ username, password, email }) {
      const key = normalizeUsername(username);
      const emailKey = normalizeOptionalEmail(email);
      if (!isValidUsername(key)) {
        throw badUsernameError();
      }
      await claimUsername(key, null);
      try {
        const doc = {
          username: key,
          usernameKey: key,
          email: emailKey || null,
          emailKey: emailKey || null,
          passwordHash: await hashPassword(password),
          createdAt: nowIso()
        };
        const result = await users.insertOne(doc);
        await reservedUsernames.updateOne(
          { usernameKey: key },
          { $set: { userId: result.insertedId } }
        );
        return toPublic({ ...doc, _id: result.insertedId });
      } catch (err) {
        const code = duplicateKeyCode(err);
        if (code === "EMAIL_TAKEN") {
          const e = new Error("That email is already linked to an account.");
          e.code = "EMAIL_TAKEN";
          throw e;
        }
        if (code === "USERNAME_TAKEN") {
          throw usernameTakenError();
        }
        throw err;
      }
    },
    async findUserByUsername(username) {
      return users.findOne({ usernameKey: normalizeUsername(username) });
    },
    async findUserByEmail(email) {
      const key = normalizeEmail(email);
      if (!key) return null;
      return users.findOne({ emailKey: key });
    },
    async findUserByLogin(identifier) {
      const raw = String(identifier || "").trim();
      if (!raw) return null;
      if (looksLikeEmail(raw)) {
        return this.findUserByEmail(raw);
      }
      return this.findUserByUsername(raw);
    },
    async findUserById(id) {
      const _id = oid(id);
      if (!_id) return null;
      return users.findOne({ _id });
    },
    async createPasswordReset(userId) {
      const _id = oid(userId);
      if (!_id) return null;
      const user = await users.findOne({ _id });
      if (!user || !user.emailKey) {
        return null;
      }
      const token = randomToken();
      await users.updateOne(
        { _id },
        {
          $set: {
            resetTokenHash: hashToken(token),
            resetExpiresAt: new Date(Date.now() + RESET_TTL_MS)
          }
        }
      );
      return {
        token,
        email: user.emailKey,
        username: user.username || user.usernameKey
      };
    },
    async resetPasswordWithToken(token, newPassword) {
      const tokenHash = hashToken(token);
      const user = await users.findOne({ resetTokenHash: tokenHash });
      if (!user) {
        const err = new Error("This reset link is invalid or has expired.");
        err.code = "BAD_RESET";
        throw err;
      }
      const expires =
        user.resetExpiresAt instanceof Date
          ? user.resetExpiresAt.getTime()
          : Date.parse(user.resetExpiresAt || 0);
      if (!expires || expires < Date.now()) {
        await users.updateOne(
          { _id: user._id },
          { $unset: { resetTokenHash: "", resetExpiresAt: "" } }
        );
        const err = new Error("This reset link is invalid or has expired.");
        err.code = "BAD_RESET";
        throw err;
      }
      await users.updateOne(
        { _id: user._id },
        {
          $set: { passwordHash: await hashPassword(newPassword) },
          $unset: { resetTokenHash: "", resetExpiresAt: "" }
        }
      );
      return publicUser(user);
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
          },
          $unset: { liveSnapshot: "", scores: "", currentPlayer: "" }
        }
      );
      return this.getGame(gameId);
    },
    async touchGame(gameId) {
      await games.updateOne({ _id: oid(gameId) }, { $set: { updatedAt: nowIso() } });
    },
    async saveLiveSnapshot(gameId, snapshot) {
      const _id = oid(gameId);
      if (!_id || !snapshot) {
        return;
      }
      const scores = Array.isArray(snapshot.players)
        ? snapshot.players.map((p) => Number(p?.score) || 0)
        : [0, 0];
      const currentPlayer = snapshot.currentPlayer === 1 ? 1 : 0;
      await games.updateOne(
        { _id, status: "active" },
        {
          $set: {
            liveSnapshot: snapshot,
            scores,
            currentPlayer,
            updatedAt: nowIso()
          }
        }
      );
    },
    async getUserProfile(userId) {
      const id = oid(userId);
      if (!id) {
        return null;
      }
      const userDoc = await users.findOne({ _id: id });
      if (!userDoc) {
        return null;
      }
      const rows = await games.find({ playerIds: id, status: "finished" }).toArray();
      const normalizedGames = rows.map((game) => ({
        ...game,
        _id: String(game._id),
        playerIds: game.playerIds.map(String),
        winnerUserId: game.winnerUserId ? String(game.winnerUserId) : null
      }));
      return {
        user: profileUser({
          ...userDoc,
          _id: String(userDoc._id)
        }),
        ...buildUserProfile(userId, normalizedGames)
      };
    },
    async updateUserProfile(userId, { displayName, email, username }) {
      const id = oid(userId);
      if (!id) {
        const err = new Error("Account not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      const userDoc = await users.findOne({ _id: id });
      if (!userDoc) {
        const err = new Error("Account not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      const updates = {};
      let nextUsername = null;
      if (username !== undefined) {
        const next = normalizeUsername(username);
        if (!isValidUsername(next)) {
          throw badUsernameError();
        }
        const current = normalizeUsername(userDoc.usernameKey || userDoc.username);
        if (next !== current) {
          await claimUsername(next, id);
          updates.username = next;
          updates.usernameKey = next;
          nextUsername = next;
        }
      }
      const ownUsernameAfter =
        nextUsername || normalizeUsername(userDoc.usernameKey || userDoc.username);
      if (displayName !== undefined) {
        if (!isValidDisplayName(displayName)) {
          const err = new Error("Display name must be 1–40 characters.");
          err.code = "BAD_DISPLAY_NAME";
          throw err;
        }
        const next = normalizeDisplayName(displayName);
        await assertDisplayNameAvailable(next, userId, ownUsernameAfter);
        updates.displayName = next || null;
      }
      if (email !== undefined) {
        const raw = String(email || "").trim();
        updates.emailKey = raw ? normalizeOptionalEmail(raw) : null;
        updates.email = updates.emailKey;
      }
      if (!Object.keys(updates).length) {
        return profileUser({ ...userDoc, _id: String(userDoc._id) });
      }
      try {
        await users.updateOne({ _id: id }, { $set: updates });
      } catch (err) {
        const code = duplicateKeyCode(err);
        if (code === "EMAIL_TAKEN") {
          const e = new Error("That email is already linked to an account.");
          e.code = "EMAIL_TAKEN";
          throw e;
        }
        if (code === "USERNAME_TAKEN") {
          throw usernameTakenError();
        }
        throw err;
      }
      if (nextUsername) {
        await rewriteGameUsernames(userId, nextUsername);
      }
      const updated = await users.findOne({ _id: id });
      return profileUser({ ...updated, _id: String(updated._id) });
    }
  };
}

function publicUser(user) {
  if (!user) return null;
  const email = user.emailKey || user.email || null;
  const displayName = user.displayName ? normalizeDisplayName(user.displayName) : null;
  return {
    _id: String(user._id),
    username: user.username || user.usernameKey,
    displayName: displayName || null,
    hasEmail: Boolean(email),
    createdAt: user.createdAt || null
  };
}

function profileUser(user) {
  if (!user) return null;
  const email = user.emailKey || user.email || null;
  return {
    ...publicUser(user),
    email: email || null
  };
}

function buildUserProfile(userId, games) {
  const uid = String(userId);
  const finished = (games || []).filter(
    (game) => game.status === "finished" && game.playerIds.map(String).includes(uid)
  );
  const gamesPlayed = finished.length;
  const gamesWon = finished.filter((game) => String(game.winnerUserId) === uid).length;
  const opponentMap = new Map();

  finished.forEach((game) => {
    const playerIds = game.playerIds.map(String);
    const usernames = Array.isArray(game.usernames) ? game.usernames : [];
    const myIndex = playerIds.indexOf(uid);
    if (myIndex < 0) {
      return;
    }
    const oppIndex = myIndex === 0 ? 1 : 0;
    const oppId = playerIds[oppIndex];
    if (!oppId) {
      return;
    }
    const existing = opponentMap.get(oppId) || {
      userId: oppId,
      username: usernames[oppIndex] || "Opponent",
      gamesPlayed: 0,
      winsAgainst: 0,
      lossesAgainst: 0,
      lastPlayedAt: null
    };
    existing.gamesPlayed += 1;
    if (String(game.winnerUserId) === uid) {
      existing.winsAgainst += 1;
    } else if (game.winnerUserId) {
      existing.lossesAgainst += 1;
    }
    const playedAt = game.finishedAt || game.updatedAt || game.startedAt || game.createdAt;
    if (
      playedAt &&
      (!existing.lastPlayedAt || Date.parse(playedAt) > Date.parse(existing.lastPlayedAt))
    ) {
      existing.lastPlayedAt = playedAt;
    }
    opponentMap.set(oppId, existing);
  });

  const pastOpponents = Array.from(opponentMap.values()).sort(
    (a, b) => Date.parse(b.lastPlayedAt || 0) - Date.parse(a.lastPlayedAt || 0)
  );

  return {
    gamesPlayed,
    gamesWon,
    gamesLost: gamesPlayed - gamesWon,
    pastOpponents
  };
}

function publicGame(game, viewerId) {
  if (!game) return null;
  const playerIds = game.playerIds.map(String);
  const myIndex = playerIds.indexOf(String(viewerId));
  const opponentIndex = myIndex === 0 ? 1 : myIndex === 1 ? 0 : -1;
  const usernames = Array.isArray(game.usernames) ? game.usernames : [];
  let scores = null;
  if (Array.isArray(game.scores) && game.scores.length >= 2) {
    scores = [Number(game.scores[0]) || 0, Number(game.scores[1]) || 0];
  } else if (Array.isArray(game.liveSnapshot?.players) && game.liveSnapshot.players.length >= 2) {
    scores = [
      Number(game.liveSnapshot.players[0]?.score) || 0,
      Number(game.liveSnapshot.players[1]?.score) || 0
    ];
  }
  let currentPlayer = null;
  if (game.currentPlayer === 0 || game.currentPlayer === 1) {
    currentPlayer = game.currentPlayer;
  } else if (
    game.liveSnapshot?.currentPlayer === 0 ||
    game.liveSnapshot?.currentPlayer === 1
  ) {
    currentPlayer = game.liveSnapshot.currentPlayer;
  }
  return {
    id: String(game._id),
    status: game.status,
    usernames,
    myUsername: myIndex >= 0 ? usernames[myIndex] : null,
    opponentUsername: opponentIndex >= 0 ? usernames[opponentIndex] : null,
    myScore: scores && myIndex >= 0 ? scores[myIndex] : null,
    opponentScore: scores && opponentIndex >= 0 ? scores[opponentIndex] : null,
    scores,
    isMyTurn: game.status === "active" && myIndex >= 0 && currentPlayer === myIndex,
    turnUsername:
      game.status === "active" && currentPlayer != null && usernames[currentPlayer]
        ? usernames[currentPlayer]
        : null,
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
  const shared = {
    isValidUsername,
    normalizeUsername,
    isValidEmail,
    normalizeEmail,
    isValidDisplayName,
    normalizeDisplayName,
    looksLikeEmail,
    verifyPassword,
    publicUser,
    publicGame: (game, viewerId) => publicGame(game, viewerId)
  };
  if (allowFile) {
    return { ...createFileBackend(), ...shared };
  }
  if (uri) {
    const backend = await createMongoBackend(uri);
    return { ...backend, ...shared };
  }
  if (!allowFile) {
    const err = new Error(
      "MONGODB_URI is required. Set it in .env or Railway Variables. " +
        "(Local file accounts only if ALLOW_FILE_ACCOUNTS=1 for dev.)"
    );
    err.code = "MONGODB_REQUIRED";
    throw err;
  }
  return { ...createFileBackend(), ...shared };
}

module.exports = {
  createAccountsStore,
  isValidUsername,
  normalizeUsername,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
  publicUser
};
