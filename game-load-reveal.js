/**
 * Full-screen ancient map curtain while gameplay DOM is built underneath.
 */
(function gameLoadReveal() {
  const shell = document.querySelector(".play-stage.parchment-shell");
  const curtain = document.getElementById("gameLoadCurtain");
  if (!shell || !curtain) {
    return;
  }

  let settled = false;

  function finalizeCurtainRemoval() {
    if (!curtain.isConnected) {
      return;
    }
    curtain.remove();
    shell.classList.remove("is-game-loaded", "is-game-loading");
  }

  function reveal() {
    if (settled) {
      return;
    }
    settled = true;
    shell.classList.add("is-game-loaded");
    const fallback = window.setTimeout(finalizeCurtainRemoval, 320);
    curtain.addEventListener(
      "transitionend",
      (event) => {
        if (event.target !== curtain || event.propertyName !== "opacity") {
          return;
        }
        window.clearTimeout(fallback);
        finalizeCurtainRemoval();
      },
      { once: true }
    );
  }

  function skipImmediate() {
    if (settled) {
      return;
    }
    settled = true;
    finalizeCurtainRemoval();
  }

  function notifyReady() {
    requestAnimationFrame(() => {
      requestAnimationFrame(reveal);
    });
  }

  shell.classList.add("is-game-loading");
  window.GlobbleGameLoadReveal = { notifyReady, skipImmediate };
})();
