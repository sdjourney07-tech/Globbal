/**
 * Profile page: stats, past opponents, games, player search, practice link.
 */
(function accountsProfilePage() {
  const accounts = window.GlobbleAccounts;
  if (!accounts) {
    return;
  }

  const SIGN_IN_URL = "./index.html";
  const profileDisplayName = document.getElementById("profileDisplayName");
  const profileUsername = document.getElementById("profileUsername");
  const profileAvatar = document.getElementById("profileAvatar");
  const profileAvatarInitials = document.getElementById("profileAvatarInitials");
  const profileEmailHint = document.getElementById("profileEmailHint");
  const editProfileBtn = document.getElementById("editProfileBtn");
  const editProfileDialog = document.getElementById("editProfileDialog");
  const editProfileForm = document.getElementById("editProfileForm");
  const editDisplayName = document.getElementById("editDisplayName");
  const editEmail = document.getElementById("editEmail");
  const editProfileUsername = document.getElementById("editProfileUsername");
  const editProfileCancelBtn = document.getElementById("editProfileCancelBtn");
  const editProfileSaveBtn = document.getElementById("editProfileSaveBtn");
  const editProfileError = document.getElementById("editProfileError");
  const profileGamesPlayed = document.getElementById("profileGamesPlayed");
  const profileGamesWon = document.getElementById("profileGamesWon");
  const profileOpponentsHint = document.getElementById("profileOpponentsHint");
  const profileOpponentsList = document.getElementById("profileOpponentsList");
  const profileError = document.getElementById("profileError");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("playerSearchInput");
  const searchBtn = document.getElementById("playerSearchBtn");
  const searchResults = document.getElementById("playerSearchResults");
  const searchError = document.getElementById("playerSearchError");
  const gamesList = document.getElementById("gamesList");
  const gamesHint = document.getElementById("gamesHint");
  const gamesRefreshBtn = document.getElementById("gamesRefreshBtn");

  function setEditProfileError(message) {
    if (editProfileError) {
      editProfileError.textContent = message || "";
      editProfileError.hidden = !message;
    }
  }

  function setProfileError(message) {
    if (profileError) {
      profileError.textContent = message || "";
      profileError.classList.remove("is-success");
    }
  }

  function setProfileSavedMessage(message) {
    if (profileError) {
      profileError.textContent = message || "";
      profileError.classList.toggle("is-success", Boolean(message));
    }
  }

  function avatarInitials(user) {
    const displayName = String(user?.displayName || "").trim();
    if (displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    const username = String(user?.username || "").trim();
    if (username) {
      return username.slice(0, 2).toUpperCase();
    }
    return "?";
  }

  function renderProfileIdentity(user) {
    const username = user?.username || "";
    const displayName = user?.displayName || "";
    const email = user?.email || "";

    if (profileAvatarInitials) {
      profileAvatarInitials.textContent = avatarInitials(user);
    }
    if (profileAvatar) {
      profileAvatar.title = displayName || username || "Profile";
    }
    if (profileDisplayName) {
      profileDisplayName.textContent = displayName || username || "Player";
    }
    if (profileUsername) {
      profileUsername.textContent = username ? `@${username}` : "";
    }
    if (profileEmailHint) {
      profileEmailHint.textContent = email
        ? email
        : "No email on file — add one below for password reset.";
    }
  }

  function openEditProfile(user) {
    if (!editProfileDialog || !user) {
      return;
    }
    setEditProfileError("");
    if (editDisplayName) editDisplayName.value = user.displayName || "";
    if (editEmail) editEmail.value = user.email || "";
    if (editProfileUsername) editProfileUsername.textContent = user.username ? `@${user.username}` : "";
    if (typeof editProfileDialog.showModal === "function") {
      editProfileDialog.showModal();
    }
  }

  async function saveProfile(event) {
    if (event) {
      event.preventDefault();
    }
    if (editProfileSaveBtn?.disabled) {
      return;
    }
    setEditProfileError("");
    const saveLabel = editProfileSaveBtn?.textContent || "Save changes";
    if (editProfileSaveBtn) {
      editProfileSaveBtn.disabled = true;
      editProfileSaveBtn.textContent = "Saving…";
    }
    try {
      const payload = {
        displayName: editDisplayName?.value ?? "",
        email: editEmail?.value ?? ""
      };
      let data;
      try {
        data = await accounts.api("/api/me/profile/update", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      } catch (err) {
        if (err.status === 404) {
          data = await accounts.api("/api/me/profile", {
            method: "PATCH",
            body: JSON.stringify(payload)
          });
        } else {
          throw err;
        }
      }
      const user = data.user;
      accounts.setSession(accounts.getToken(), user);
      renderProfileIdentity(user);
      if (typeof editProfileDialog?.close === "function") {
        editProfileDialog.close();
      }
      setProfileSavedMessage("Profile saved.");
    } catch (err) {
      const message =
        err.status === 404
          ? "Could not save profile. Restart the local server, then try again."
          : err.message || "Could not save profile.";
      setEditProfileError(message);
    } finally {
      if (editProfileSaveBtn) {
        editProfileSaveBtn.disabled = false;
        editProfileSaveBtn.textContent = saveLabel;
      }
    }
  }

  function setSearchError(message) {
    if (searchError) searchError.textContent = message || "";
  }

  function formatDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } catch {
      return "";
    }
  }

  async function sendChallenge(username, onSuccess) {
    try {
      await accounts.api("/api/games/challenge", {
        method: "POST",
        body: JSON.stringify({ username })
      });
      setSearchError(`Challenge sent to ${username}.`);
      refreshGames();
      onSuccess?.();
    } catch (err) {
      if (err.status === 409 && err.data?.game?.id) {
        setSearchError(err.message);
        refreshGames();
        onSuccess?.();
        return;
      }
      setSearchError(err.message);
    }
  }

  function renderPastOpponents(opponents) {
    if (!profileOpponentsList) {
      return;
    }
    profileOpponentsList.replaceChildren();
    if (!opponents?.length) {
      if (profileOpponentsHint) {
        profileOpponentsHint.textContent =
          "No finished games yet. Challenge someone from Find a player below.";
      }
      return;
    }
    if (profileOpponentsHint) {
      profileOpponentsHint.textContent = `${opponents.length} player${opponents.length === 1 ? "" : "s"} you've faced.`;
    }
    opponents.forEach((opponent) => {
      const li = document.createElement("li");
      li.className = "profile-opponent-item";

      const meta = document.createElement("div");
      meta.className = "profile-opponent-meta";
      const name = document.createElement("strong");
      name.textContent = opponent.username;
      meta.appendChild(name);

      const record = document.createElement("span");
      record.className = "profile-opponent-record";
      const parts = [`${opponent.gamesPlayed} game${opponent.gamesPlayed === 1 ? "" : "s"}`];
      if (opponent.winsAgainst || opponent.lossesAgainst) {
        parts.push(`${opponent.winsAgainst}–${opponent.lossesAgainst} vs them`);
      }
      const when = formatDate(opponent.lastPlayedAt);
      if (when) {
        parts.push(`last ${when}`);
      }
      record.textContent = parts.join(" · ");
      meta.appendChild(record);
      li.appendChild(meta);

      const challengeBtn = document.createElement("button");
      challengeBtn.type = "button";
      challengeBtn.textContent = "Challenge";
      challengeBtn.addEventListener("click", () => {
        sendChallenge(opponent.username, () => setProfileError(""));
      });
      li.appendChild(challengeBtn);

      profileOpponentsList.appendChild(li);
    });
  }

  async function loadProfile() {
    setProfileError("");
    try {
      const profile = await accounts.api("/api/me/profile");
      const user = profile.user;
      renderProfileIdentity(user);
      if (profileGamesPlayed) {
        profileGamesPlayed.textContent = String(profile.gamesPlayed ?? 0);
      }
      if (profileGamesWon) {
        profileGamesWon.textContent = String(profile.gamesWon ?? 0);
      }
      renderPastOpponents(profile.pastOpponents || []);
    } catch (err) {
      if (err.status === 401) {
        accounts.clearSession();
        location.href = SIGN_IN_URL;
        return;
      }
      setProfileError(err.message || "Could not load profile.");
    }
  }

  async function refreshGames() {
    if (!accounts.getToken()) {
      location.href = SIGN_IN_URL;
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
          status.className = "games-list-turn";
          status.textContent = game.canAccept ? "Challenge received" : "Waiting for accept";
        } else if (game.status === "active") {
          status.className = game.isMyTurn
            ? "games-list-turn is-my-turn"
            : "games-list-turn is-their-turn";
          status.textContent = game.isMyTurn
            ? "Your turn"
            : `${game.turnUsername || game.opponentUsername || "Opponent"}'s turn`;
        } else {
          status.className = "games-list-turn";
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
        challengeBtn.addEventListener("click", () => sendChallenge(user.username));
        li.appendChild(challengeBtn);
        searchResults.appendChild(li);
      });
    } catch (err) {
      setSearchError(err.message);
    }
  }

  editProfileBtn?.addEventListener("click", async () => {
    try {
      const profile = await accounts.api("/api/me/profile");
      openEditProfile(profile.user);
    } catch (err) {
      setProfileError(err.message || "Could not open profile editor.");
    }
  });
  editProfileForm?.addEventListener("submit", saveProfile);
  editProfileCancelBtn?.addEventListener("click", () => {
    setEditProfileError("");
    editProfileDialog?.close();
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await accounts.api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    accounts.clearSession();
    location.href = SIGN_IN_URL;
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
    if (!user) {
      location.href = SIGN_IN_URL;
      return;
    }
    loadProfile();
    refreshGames();
  });
})();
