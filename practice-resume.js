/**
 * Saves local practice game state when opening the dictionary, restores on return.
 */
(function practiceResume() {
  const STORAGE_VERSION = 1;

  function storageKey() {
    return `globble-practice-resume:${window.location.pathname}`;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.GlobblePracticeResume = {
    registerCapture(getSnapshot) {
      window.GlobblePracticeResume._getSnapshot = getSnapshot;
    },

    saveForDictionary() {
      const getSnapshot = window.GlobblePracticeResume._getSnapshot;
      if (typeof getSnapshot !== "function") {
        return;
      }
      const snapshot = getSnapshot();
      if (!snapshot || !snapshot.gameStarted) {
        return;
      }
      sessionStorage.setItem(
        storageKey(),
        JSON.stringify({
          version: STORAGE_VERSION,
          pendingReturn: true,
          savedAt: Date.now(),
          snapshot
        })
      );
    },

    tryRestore(restoreSnapshot) {
      const raw = sessionStorage.getItem(storageKey());
      if (!raw) {
        return false;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        sessionStorage.removeItem(storageKey());
        return false;
      }
      if (!parsed?.pendingReturn || !parsed.snapshot || parsed.version !== STORAGE_VERSION) {
        return false;
      }
      try {
        restoreSnapshot(cloneJson(parsed.snapshot));
        sessionStorage.removeItem(storageKey());
        return true;
      } catch {
        sessionStorage.removeItem(storageKey());
        return false;
      }
    },

    clearSaved() {
      sessionStorage.removeItem(storageKey());
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest(".game-dictionary-link");
      if (!link) {
        return;
      }
      window.GlobblePracticeResume.saveForDictionary();
    },
    true
  );
})();
