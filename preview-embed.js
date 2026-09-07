(function previewEmbed() {
  const embedded =
    new URLSearchParams(window.location.search).get("embed") === "1" ||
    window.self !== window.top;
  if (!embedded) {
    return;
  }
  document.documentElement.classList.add("is-preview-embed");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./preview-embed.css?v=layout-full1";
  document.head.appendChild(link);
})();
