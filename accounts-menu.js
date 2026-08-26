/**
 * Main menu: account login, find players, active games.
 */
(function accountsMenu() {
  const accounts = window.GlobbleAccounts;
  if (!accounts) {
    return;
  }

  const accountStatusEl = document.getElementById("accountStatus");
  const authPanel = document.getElementById("authPanel");
  const authForm = document.getElementById("authForm");
  const forgotForm = document.getElementById("forgotForm");
  const authUsername = document.getElementById("authUsername");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authError = document.getElementById("authError");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const forgotLogin = document.getElementById("forgotLogin");
  const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");
  const forgotBackBtn = document.getElementById("forgotBackBtn");
  const forgotError = document.getElementById("forgotError");
  const logoutBtn = document.getElementById("logoutBtn");
  const playPanel = document.getElementById("playPanel");
  const searchInput = document.getElementById("playerSearchInput");
  const searchBtn = document.getElementById("playerSearchBtn");
  const searchResults = document.getElementById("playerSearchResults");
  const searchError = document.getElementById("playerSearchError");
  const gamesList = document.getElementById("gamesList");
  const gamesHint = document.getElementById("gamesHint");
  const gamesRefreshBtn = document.getElementById("gamesRefreshBtn");
  const guestPracticeGrid = document.getElementById("guestPracticeGrid");

  function setAuthError(message) {
    if (authError) authError.textContent = message || "";
  }

  function setForgotError(message) {
    if (forgotError) forgotError.textContent = message || "";
  }

  function setSearchError(message) {
    if (searchError) searchError.textContent = message || "";
  }

  function showForgot(show) {
    if (authForm) authForm.hidden = !!show;
    if (forgotForm) forgotForm.hidden = !show;
    setForgotError("");
    setAuthError("");
    if (show && forgotLogin && authUsername?.value) {
      forgotLogin.value = authUsername.value.trim();
    }
  }

  function renderAuthState(user) {
    const signedIn = !!user;
    if (accountStatusEl) {
      accountStatusEl.textContent = signedIn ? `Signed in as ${user.username}` : "Not signed in";
    }
    if (authPanel) authPanel.hidden = signedIn;
    if (playPanel) playPanel.hidden = !signedIn;
    if (logoutBtn) logoutBtn.hidden = !signedIn;
    if (guestPracticeGrid) guestPracticeGrid.hidden = signedIn;
    if (signedIn) {
      showForgot(false);
      refreshGames();
    } else if (gamesList) {
      gamesList.replaceChildren();
      if (gamesHint) gamesHint.textContent = "Sign in to see your games.";
    }
  }

  async function doAuth(mode) {
    setAuthError("");
    const login = (authUsername?.value || "").trim();
    const password = authPassword?.value || "";
    const email = (authEmail?.value || "").trim();
    if (!login || !password) {
      setAuthError(
        mode === "register"
          ? "Enter a username and password."
          : "Enter username or email, and password."
      );
      return;
    }
    if (mode === "register" && login.includes("@")) {
      setAuthError("Choose a username for your account (email goes in the email field).");
      return;
    }
    if (loginBtn) loginBtn.disabled = true;
    if (registerBtn) registerBtn.disabled = true;
    try {
      const body =
        mode === "register"
          ? { username: login, password, email: email || undefined }
          : { login, password };
      const data = await accounts.api(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );
      accounts.setSession(data.token, data.user);
      if (authPassword) authPassword.value = "";
      if (authEmail) authEmail.value = "";
      renderAuthState(data.user);
    } catch (err) {
      let message = err.message || "Could not sign in.";
      if (err.status === 401 && /no account/i.test(message)) {
        message =
          "No account found. Use Create account, or check you are on the same site where you registered.";
      } else if (err.status === 401 && /password/i.test(message)) {
        message = "Incorrect password. Passwords are case-sensitive.";
      } else if (err.status === 409) {
        message = err.message || "That username or email is already taken.";
      } else if (!err.status) {
        message = "Could not reach the server. Check your connection and try again.";
      }
      setAuthError(message);
    } finally {
      if (loginBtn) loginBtn.disabled = false;
      if (registerBtn) registerBtn.disabled = false;
    }
  }

  async function doForgot() {
    setForgotError("");
    const login = (forgotLogin?.value || "").trim();
    if (!login) {
      setForgotError("Enter your username or email.");
      return;
    }
    if (forgotSubmitBtn) forgotSubmitBtn.disabled = true;
    try {
      const data = await accounts.api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ login })
      });
      setForgotError(data.message || "If that account has an email, we sent a reset link.");
    } catch (err) {
      setForgotError(err.message || "Could not send reset email.");
    } finally {
      if (forgotSubmitBtn) forgotSubmitBtn.disabled = false;
    }
  }

  async function refreshGames() {
    if (!accounts.getToken()) {
      renderAuthState(null);
      return;
    }
    if (gamesHint) gamesHint.textContent = "Loading…";
    try {
      const data = await accounts.api("/api/games");
      const games = data.games || [];
      if (gamesHint) {
        gamesHint.textContent =
          games.length === 0
            ? "No active games yet. Search a username and challenge them."
            : `${games.length} active game${games.length === 1 ? "" : "s"}`;
      }
      if (!gamesList) return;
      gamesList.replaceChildren();
      games.forEach((game) => {
        const li = document.createElement("li");
        li.className = "games-list-item";

        const meta = document.createElement("div");
        meta.className = "games-list-meta";
        const title = document.createElement("strong");
        title.textContent = `vs ${game.opponentUsername || "opponent"}`;
        meta.appendChild(title);

        if (game.status === "active" && game.myScore != null && game.opponentScore != null) {
          const scoreLine = document.createElement("span");
          scoreLine.className = "games-list-score";
          scoreLine.textContent = `${game.myScore} – ${game.opponentScore}`;
          meta.appendChild(scoreLine);
        }

        const status = document.createElement("span");
        if (game.status === "pending") {
          status.textContent = game.canAccept ? "Challenge received" : "Waiting for accept";
        } else if (game.isMyTurn) {
          status.textContent = "Your turn";
        } else if (game.status === "active") {
          status.textContent = `${game.opponentUsername || "Opponent"}'s turn`;
        } else {
          status.textContent = "In progress";
        }
        meta.appendChild(status);
        li.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "games-list-actions";

        if (game.canAccept) {
          const acceptBtn = document.createElement("button");
          acceptBtn.type = "button";
          acceptBtn.textContent = "Accept";
          acceptBtn.addEventListener("click", async () => {
            try {
              await accounts.api(`/api/games/${encodeURIComponent(game.id)}/accept`, {
                method: "POST",
                body: "{}"
              });
              location.href = `./game-online.html?game=${encodeURIComponent(game.id)}`;
            } catch (err) {
              setSearchError(err.message);
            }
          });
          actions.appendChild(acceptBtn);

          const declineBtn = document.createElement("button");
          declineBtn.type = "button";
          declineBtn.textContent = "Decline";
          declineBtn.addEventListener("click", async () => {
            try {
              await accounts.api(`/api/games/${encodeURIComponent(game.id)}/decline`, {
                method: "POST",
                body: "{}"
              });
              refreshGames();
            } catch (err) {
              setSearchError(err.message);
            }
          });
          actions.appendChild(declineBtn);
        } else if (game.status === "active") {
          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.textContent = "Open";
          openBtn.addEventListener("click", () => {
            location.href = `./game-online.html?game=${encodeURIComponent(game.id)}`;
          });
          actions.appendChild(openBtn);
        } else {
          const waiting = document.createElement("span");
          waiting.className = "games-waiting";
          waiting.textContent = "Waiting…";
          actions.appendChild(waiting);
        }

        li.appendChild(actions);
        gamesList.appendChild(li);
      });
    } catch (err) {
      if (gamesHint) gamesHint.textContent = err.message || "Could not load games.";
    }
  }

  async function runSearch() {
    setSearchError("");
    if (!searchResults) return;
    const q = (searchInput?.value || "").trim();
    if (q.length < 2) {
      setSearchError("Type at least 2 characters.");
      searchResults.replaceChildren();
      return;
    }
    try {
      const data = await accounts.api(`/api/users/search?q=${encodeURIComponent(q)}`);
      searchResults.replaceChildren();
      const results = data.results || [];
      if (!results.length) {
        const empty = document.createElement("li");
        empty.textContent = "No players found.";
        searchResults.appendChild(empty);
        return;
      }
      results.forEach((user) => {
        const li = document.createElement("li");
        li.className = "player-search-item";
        const name = document.createElement("span");
        name.textContent = user.username;
        li.appendChild(name);
        const challengeBtn = document.createElement("button");
        challengeBtn.type = "button";
        challengeBtn.textContent = "Challenge";
        challengeBtn.addEventListener("click", async () => {
          try {
            const created = await accounts.api("/api/games/challenge", {
              method: "POST",
              body: JSON.stringify({ username: user.username })
            });
            setSearchError(`Challenge sent to ${user.username}.`);
            refreshGames();
            if (created.game?.id) {
              /* stay on menu so opponent can accept; challenger waits in Games */
            }
          } catch (err) {
            if (err.status === 409 && err.data?.game?.id) {
              setSearchError(err.message);
              refreshGames();
              return;
            }
            setSearchError(err.message);
          }
        });
        li.appendChild(challengeBtn);
        searchResults.appendChild(li);
      });
    } catch (err) {
      setSearchError(err.message);
    }
  }

  loginBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    doAuth("login");
  });
  registerBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    doAuth("register");
  });
  authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    doAuth("login");
  });
  forgotPasswordBtn?.addEventListener("click", () => showForgot(true));
  forgotBackBtn?.addEventListener("click", () => showForgot(false));
  forgotForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    doForgot();
  });
  logoutBtn?.addEventListener("click", async () => {
    try {
      await accounts.api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    accounts.clearSession();
    renderAuthState(null);
  });
  searchBtn?.addEventListener("click", () => runSearch());
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });
  gamesRefreshBtn?.addEventListener("click", () => refreshGames());

  const gamesDisclosure = document.getElementById("gamesDisclosure");
  gamesDisclosure?.addEventListener("toggle", () => {
    if (gamesDisclosure.open) {
      refreshGames();
    }
  });

  accounts.refreshMe().then((user) => {
    renderAuthState(user);
  });
})();
