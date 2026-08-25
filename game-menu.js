(function () {
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("gameMenu");
  const backdrop = document.getElementById("menuBackdrop");
  const app = document.querySelector(".app-gameplay");
  if (!toggle || !menu || !app) {
    return;
  }

  function setOpen(open) {
    menu.classList.toggle("is-open", open);
    backdrop?.classList.toggle("is-open", open);
    app.classList.toggle("menu-open", open);
    toggle.classList.toggle("is-active", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (backdrop) {
      backdrop.hidden = !open;
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(!menu.classList.contains("is-open"));
  });

  backdrop?.addEventListener("click", () => {
    setOpen(false);
  });

  menu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (
      target.closest('a[href], .game-action-rail button, .online-bar button, .game-nav a')
    ) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      setOpen(false);
    }
  });
})();
