/**
 * Brief centered toast for invalid dictionary submissions.
 */
(function invalidWordToast() {
  const SHOW_MS = 3200;
  const HIDE_MS = 420;

  let toastEl = null;
  let hideTimer = null;
  let removeTimer = null;

  function ensureToast() {
    if (toastEl) {
      return toastEl;
    }
    toastEl = document.createElement("div");
    toastEl.className = "invalid-word-toast";
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.hidden = true;
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function clearTimers() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = null;
    }
  }

  function messageFromDetail(detail) {
    if (typeof detail !== "string" || !detail.trim()) {
      return "Not a valid word.";
    }
    const trimmed = detail.trim();
    const match = trimmed.match(/^Invalid words?:\s*(.+)$/i);
    if (match) {
      const listed = match[1].trim();
      if (listed.includes(",")) {
        return `Not valid words: ${listed}`;
      }
      return `Not a valid word: ${listed}`;
    }
    return trimmed;
  }

  function show(detail) {
    const el = ensureToast();
    el.textContent = messageFromDetail(detail);
    clearTimers();
    el.hidden = false;
    el.classList.remove("invalid-word-toast-hide");
    void el.offsetWidth;
    el.classList.add("invalid-word-toast-show");

    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      el.classList.remove("invalid-word-toast-show");
      el.classList.add("invalid-word-toast-hide");
      removeTimer = window.setTimeout(() => {
        removeTimer = null;
        el.hidden = true;
        el.classList.remove("invalid-word-toast-hide");
      }, HIDE_MS);
    }, SHOW_MS);
  }

  window.GlobbleInvalidWordToast = { show };
})();
