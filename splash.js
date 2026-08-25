(function splashEntry() {
  const splash = document.getElementById("splashScreen");
  const enterBtn = document.getElementById("splashEnterBtn");
  if (!splash) {
    return;
  }

  const MENU_URL = "./index.html";
  const FADE_MS = 520;
  let leaving = false;

  function goToMenu() {
    if (leaving) {
      return;
    }
    leaving = true;
    window.dispatchEvent(new Event("splashBeforeNavigate"));
    splash.classList.add("is-exiting");
    window.setTimeout(() => {
      window.location.href = MENU_URL;
    }, FADE_MS);
  }

  splash.addEventListener("click", (event) => {
    if (event.target.closest(".splash-enter")) {
      return;
    }
    if (event.target.closest(".splash-compass-widget")) {
      return;
    }
    if (typeof window.splashCompassShouldBlockNavigation === "function" && window.splashCompassShouldBlockNavigation()) {
      return;
    }
    goToMenu();
  });

  enterBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    goToMenu();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToMenu();
    }
  });
})();
