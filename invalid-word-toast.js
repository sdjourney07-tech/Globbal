/**
 * Brief centered toast for invalid dictionary submissions.
 */
(function invalidWordToast() {
  const MESSAGE = "Not a valid word, asshole.";
  const SHOW_MS = 2800;
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

  function show() {
    const el = ensureToast();
    el.textContent = MESSAGE;
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
