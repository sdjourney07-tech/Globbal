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
  const authUsername = document.getElementById("authUsername");
  const authPassword = document.getElementById("authPassword");
  const authError = document.getElementById("authError");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
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

  function setSearchError(message) {
    if (searchError) searchError.textContent = message || "";
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
      refreshGames();
    } else if (gamesList) {
      gamesList.replaceChildren();
      if (gamesHint) gamesHint.textContent = "Sign in to see your games.";
    }
  }

  async function doAuth(mode) {
    setAuthError("");
    const username = (authUsername?.value || "").trim();
    const password = authPassword?.value || "";
    if (!username || !password) {
      setAuthError("Enter both username and password.");
      return;
    }
    if (loginBtn) loginBtn.disabled = true;
    if (registerBtn) registerBtn.disabled = true;
    try {
      const data = await accounts.api(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      accounts.setSession(data.token, data.user);
      if (authPassword) authPassword.value = "";
      renderAuthState(data.user);
    } catch (err) {
      let message = err.message || "Could not sign in.";
      if (err.status === 401 && /no account/i.test(message)) {
        message =
          "No account with that username. Use Create account, or check you are on the same site where you registered.";
      } else if (err.status === 401 && /password/i.test(message)) {
        message = "Incorrect password. Passwords are case-sensitive.";
      } else if (err.status === 409) {
        message = err.message || "Username already taken. Try Sign in instead.";
      } else if (!err.status) {
        message = "Could not reach the server. Check your connection and try again.";
      }
      setAuthError(message);
    } finally {
      if (loginBtn) loginBtn.disabled = false;
      if (registerBtn) registerBtn.disabled = false;
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
        const status = document.createElement("span");
        status.textContent =
          game.status === "pending"
            ? game.canAccept
              ? "Challenge received"
              : "Waiting for accept"
            : "In progress";
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
