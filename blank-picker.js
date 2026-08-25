(function () {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function ensureDialog() {
    if (document.getElementById("globbleBlankPicker")) {
      return document.getElementById("globbleBlankPicker");
    }

    const dialog = document.createElement("dialog");
    dialog.id = "globbleBlankPicker";
    dialog.className = "blank-picker-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="blank-picker-inner">
        <h2>Choose blank letter</h2>
        <p class="hint">Pick a letter for this blank tile.</p>
        <div class="blank-picker-grid" role="group" aria-label="Letters A to Z"></div>
        <menu class="blank-picker-actions">
          <button type="button" class="blank-picker-cancel">Cancel</button>
        </menu>
      </form>
    `;

    const grid = dialog.querySelector(".blank-picker-grid");
    LETTERS.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "blank-picker-letter";
      btn.textContent = letter;
      btn.dataset.letter = letter;
      btn.setAttribute("aria-label", `Letter ${letter}`);
      grid.appendChild(btn);
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  function pickLetter() {
    const dialog = ensureDialog();

    return new Promise((resolve) => {
      const grid = dialog.querySelector(".blank-picker-grid");
      const cancelBtn = dialog.querySelector(".blank-picker-cancel");

      function finish(letter) {
        grid.removeEventListener("click", onGridClick);
        cancelBtn.removeEventListener("click", onCancel);
        dialog.removeEventListener("cancel", onCancel);
        dialog.close();
        resolve(letter);
      }

      function onGridClick(event) {
        const btn = event.target.closest(".blank-picker-letter");
        if (!btn) {
          return;
        }
        finish(btn.dataset.letter || null);
      }

      function onCancel(event) {
        event.preventDefault();
        finish(null);
      }

      grid.addEventListener("click", onGridClick);
      cancelBtn.addEventListener("click", onCancel);
      dialog.addEventListener("cancel", onCancel);
      dialog.showModal();
    });
  }

  window.GlobbleBlankPicker = { pickLetter };
})();
