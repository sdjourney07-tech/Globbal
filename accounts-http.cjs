"use strict";

const {
  sendPasswordResetEmail,
  appPublicBaseUrl,
  isPasswordResetEmailConfigured,
  allowDevResetLinkInResponse
} = require("./mailer.cjs");

function readJsonBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Body too large"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { code: "BAD_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(raw);
}

function bearerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function createAccountsHttp(store) {
  async function requireUser(req) {
    const token = bearerToken(req);
    const user = await store.userFromSessionToken(token);
    if (!user) {
      const err = new Error("Sign in required.");
      err.code = "UNAUTHORIZED";
      throw err;
    }
    return { user, token };
  }

  async function handle(req, res, urlPath) {
    try {
      if (urlPath === "/api/auth/register" && req.method === "POST") {
        const body = await readJsonBody(req);
        const username = store.normalizeUsername(body.username);
        const password = String(body.password || "");
        const email = String(body.email || "").trim();
        if (!store.isValidUsername(username)) {
          sendJson(res, 400, {
            error: "Username must be 3–20 characters: letters, numbers, underscore."
          });
          return true;
        }
        if (password.length < 6) {
          sendJson(res, 400, { error: "Password must be at least 6 characters." });
          return true;
        }
        if (!email) {
          sendJson(res, 400, { error: "Email is required to create an account." });
          return true;
        }
        if (!store.isValidEmail(email)) {
          sendJson(res, 400, { error: "Enter a valid email address." });
          return true;
        }
        try {
          const user = await store.createUser({ username, password, email });
          const token = await store.createSession(user._id);
          sendJson(res, 201, { user, token });
        } catch (err) {
          if (err.code === "BAD_EMAIL" || err.code === "EMAIL_REQUIRED") {
            sendJson(res, 400, { error: err.message });
            return true;
          }
          throw err;
        }
        return true;
      }

      if (urlPath === "/api/auth/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        const identifier = String(body.login || body.username || body.email || "").trim();
        const password = String(body.password || "");
        if (!identifier || !password) {
          sendJson(res, 400, { error: "Enter username or email, and password." });
          return true;
        }
        const row = await store.findUserByLogin(identifier);
        if (!row) {
          sendJson(res, 401, {
            error: store.looksLikeEmail(identifier)
              ? "No account with that email. Create an account first."
              : "No account with that username. Create an account first."
          });
          return true;
        }
        if (!(await store.verifyPassword(password, row.passwordHash))) {
          sendJson(res, 401, { error: "Incorrect password." });
          return true;
        }
        const user = store.publicUser(row);
        const token = await store.createSession(user._id);
        sendJson(res, 200, { user, token });
        return true;
      }

      if (urlPath === "/api/auth/forgot-password" && req.method === "POST") {
        const body = await readJsonBody(req);
        const identifier = String(body.login || body.email || body.username || "").trim();
        const generic = {
          ok: true,
          message:
            "If that account has an email on file, we sent a reset link. Check your inbox (and spam)."
        };
        if (!identifier) {
          sendJson(res, 400, { error: "Enter your username or email." });
          return true;
        }
        const row = await store.findUserByLogin(identifier);
        if (row && (row.emailKey || row.email)) {
          const emailConfigured = isPasswordResetEmailConfigured();
          const allowDevLink = allowDevResetLinkInResponse(req);
          if (!emailConfigured && !allowDevLink) {
            sendJson(res, 503, {
              error:
                "Password reset email is not configured on this server. Ask the host to set RESEND_API_KEY (and EMAIL_FROM)."
            });
            return true;
          }
          const reset = await store.createPasswordReset(String(row._id));
          if (reset) {
            const resetUrl = `${appPublicBaseUrl(req)}/reset-password.html?token=${encodeURIComponent(reset.token)}`;
            try {
              const sent = await sendPasswordResetEmail({
                to: reset.email,
                resetUrl,
                username: reset.username
              });
              if (sent.mode === "log" && allowDevLink) {
                sendJson(res, 200, {
                  ok: true,
                  message:
                    "Email sending is not configured (no RESEND_API_KEY). Use this local reset link — it expires in 1 hour.",
                  devResetUrl: resetUrl,
                  emailed: false
                });
                return true;
              }
              sendJson(res, 200, { ...generic, emailed: sent.mode === "resend" });
              return true;
            } catch (err) {
              if (err.code === "EMAIL_SEND_FAILED") {
                process.stderr.write(`[accounts-api] ${err.message}\n`);
                sendJson(res, 502, {
                  error:
                    "Could not send reset email. Check RESEND_API_KEY / EMAIL_FROM (Resend needs a verified from-address to mail other people)."
                });
                return true;
              }
              throw err;
            }
          }
        }
        sendJson(res, 200, generic);
        return true;
      }

      if (urlPath === "/api/auth/reset-password" && req.method === "POST") {
        const body = await readJsonBody(req);
        const token = String(body.token || "").trim();
        const password = String(body.password || "");
        if (!token) {
          sendJson(res, 400, { error: "Missing reset token." });
          return true;
        }
        if (password.length < 6) {
          sendJson(res, 400, { error: "Password must be at least 6 characters." });
          return true;
        }
        try {
          const user = await store.resetPasswordWithToken(token, password);
          if (typeof store.deleteSessionsForUser === "function") {
            await store.deleteSessionsForUser(user._id);
          }
          const sessionToken = await store.createSession(user._id);
          sendJson(res, 200, { user, token: sessionToken });
        } catch (err) {
          if (err.code === "BAD_RESET") {
            sendJson(res, 400, { error: err.message });
            return true;
          }
          throw err;
        }
        return true;
      }

      if (urlPath === "/api/auth/logout" && req.method === "POST") {
        await store.deleteSession(bearerToken(req));
        sendJson(res, 200, { ok: true });
        return true;
      }

      if (urlPath === "/api/me" && req.method === "GET") {
        const { user } = await requireUser(req);
        sendJson(res, 200, { user });
        return true;
      }

      if (urlPath === "/api/me/profile" && req.method === "GET") {
        const { user } = await requireUser(req);
        const profile = await store.getUserProfile(user._id);
        if (!profile) {
          sendJson(res, 404, { error: "Account not found." });
          return true;
        }
        sendJson(res, 200, profile);
        return true;
      }

      if (urlPath === "/api/me/profile" && req.method === "PATCH") {
        const { user } = await requireUser(req);
        const body = await readJsonBody(req);
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(body, "username")) {
          patch.username = String(body.username ?? "");
        }
        if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
          patch.displayName = String(body.displayName ?? "");
        }
        if (Object.prototype.hasOwnProperty.call(body, "email")) {
          patch.email = String(body.email ?? "").trim();
        }
        if (Object.prototype.hasOwnProperty.call(body, "currentPassword")) {
          patch.currentPassword = String(body.currentPassword ?? "");
        }
        if (!Object.keys(patch).filter((k) => k !== "currentPassword").length) {
          sendJson(res, 400, { error: "Nothing to update." });
          return true;
        }
        try {
          const updated = await store.updateUserProfile(user._id, patch);
          sendJson(res, 200, { user: updated });
        } catch (err) {
          if (
            err.code === "BAD_EMAIL" ||
            err.code === "EMAIL_REQUIRED" ||
            err.code === "BAD_PASSWORD" ||
            err.code === "BAD_DISPLAY_NAME" ||
            err.code === "BAD_USERNAME"
          ) {
            sendJson(res, 400, { error: err.message });
            return true;
          }
          if (err.code === "USERNAME_TAKEN" || err.code === "DISPLAY_NAME_TAKEN" || err.code === "EMAIL_TAKEN") {
            sendJson(res, 409, { error: err.message });
            return true;
          }
          throw err;
        }
        return true;
      }

      if (urlPath === "/api/me/profile/update" && req.method === "POST") {
        const { user } = await requireUser(req);
        const body = await readJsonBody(req);
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(body, "username")) {
          patch.username = String(body.username ?? "");
        }
        if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
          patch.displayName = String(body.displayName ?? "");
        }
        if (Object.prototype.hasOwnProperty.call(body, "email")) {
          patch.email = String(body.email ?? "").trim();
        }
        if (Object.prototype.hasOwnProperty.call(body, "currentPassword")) {
          patch.currentPassword = String(body.currentPassword ?? "");
        }
        if (!Object.keys(patch).filter((k) => k !== "currentPassword").length) {
          sendJson(res, 400, { error: "Nothing to update." });
          return true;
        }
        try {
          const updated = await store.updateUserProfile(user._id, patch);
          sendJson(res, 200, { user: updated });
        } catch (err) {
          if (
            err.code === "BAD_EMAIL" ||
            err.code === "EMAIL_REQUIRED" ||
            err.code === "BAD_PASSWORD" ||
            err.code === "BAD_DISPLAY_NAME" ||
            err.code === "BAD_USERNAME"
          ) {
            sendJson(res, 400, { error: err.message });
            return true;
          }
          if (err.code === "USERNAME_TAKEN" || err.code === "DISPLAY_NAME_TAKEN" || err.code === "EMAIL_TAKEN") {
            sendJson(res, 409, { error: err.message });
            return true;
          }
          throw err;
        }
        return true;
      }

      if (urlPath === "/api/users/search" && req.method === "GET") {
        const { user } = await requireUser(req);
        const host = req.headers.host || "localhost";
        const url = new URL(req.url || "/", `http://${host}`);
        const q = url.searchParams.get("q") || "";
        const results = await store.searchUsers(q, { excludeUserId: user._id });
        sendJson(res, 200, { results });
        return true;
      }

      if (urlPath === "/api/games" && req.method === "GET") {
        const { user } = await requireUser(req);
        const games = await store.listGamesForUser(user._id);
        sendJson(res, 200, { games });
        return true;
      }

      if (urlPath === "/api/games/challenge" && req.method === "POST") {
        const { user } = await requireUser(req);
        const body = await readJsonBody(req);
        const opponentName = store.normalizeUsername(body.username || body.opponentUsername);
        if (!opponentName) {
          sendJson(res, 400, { error: "Username required." });
          return true;
        }
        if (opponentName === user.username) {
          sendJson(res, 400, { error: "You cannot challenge yourself." });
          return true;
        }
        const opponentRow = await store.findUserByUsername(opponentName);
        if (!opponentRow) {
          sendJson(res, 404, { error: "No account with that username." });
          return true;
        }
        const opponent = store.publicUser(opponentRow);
        try {
          const game = await store.createChallenge({ challenger: user, opponent });
          sendJson(res, 201, { game });
        } catch (err) {
          if (err.code === "GAME_EXISTS") {
            sendJson(res, 409, { error: err.message, game: err.game });
            return true;
          }
          throw err;
        }
        return true;
      }

      const acceptMatch = urlPath.match(/^\/api\/games\/([^/]+)\/accept$/);
      if (acceptMatch && req.method === "POST") {
        const { user } = await requireUser(req);
        const gameId = decodeURIComponent(acceptMatch[1]);
        const game = await store.acceptChallenge(gameId, user._id);
        sendJson(res, 200, { game: store.publicGame(game, user._id) });
        return true;
      }

      const declineMatch = urlPath.match(/^\/api\/games\/([^/]+)\/decline$/);
      if (declineMatch && req.method === "POST") {
        const { user } = await requireUser(req);
        const gameId = decodeURIComponent(declineMatch[1]);
        const game = await store.declineChallenge(gameId, user._id);
        sendJson(res, 200, { game });
        return true;
      }

      const gameMatch = urlPath.match(/^\/api\/games\/([^/]+)$/);
      if (gameMatch && req.method === "GET") {
        const { user } = await requireUser(req);
        const gameId = decodeURIComponent(gameMatch[1]);
        const game = await store.getGame(gameId);
        if (!game || !game.playerIds.map(String).includes(user._id)) {
          sendJson(res, 404, { error: "Game not found." });
          return true;
        }
        sendJson(res, 200, { game: store.publicGame(game, user._id) });
        return true;
      }

      return false;
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        sendJson(res, 401, { error: err.message });
        return true;
      }
      if (err.code === "USERNAME_TAKEN" || err.code === "EMAIL_TAKEN" || err.code === "DISPLAY_NAME_TAKEN") {
        sendJson(res, 409, { error: err.message });
        return true;
      }
      if (
        err.code === "BAD_USERNAME" ||
        err.code === "BAD_DISPLAY_NAME" ||
        err.code === "BAD_EMAIL" ||
        err.code === "EMAIL_REQUIRED" ||
        err.code === "BAD_PASSWORD"
      ) {
        sendJson(res, 400, { error: err.message });
        return true;
      }
      if (err.code === "NOT_FOUND") {
        sendJson(res, 404, { error: err.message });
        return true;
      }
      if (err.code === "FORBIDDEN" || err.code === "BAD_STATUS") {
        sendJson(res, 400, { error: err.message });
        return true;
      }
      if (err.code === "BAD_JSON" || err.code === "BODY_TOO_LARGE") {
        sendJson(res, 400, { error: err.message });
        return true;
      }
      process.stderr.write(`[accounts-api] ${err.stack || err.message}\n`);
      sendJson(res, 500, { error: "Server error." });
      return true;
    }
  }

  return { handle, bearerToken, requireUser };
}

module.exports = { createAccountsHttp, readJsonBody, sendJson, bearerToken };
