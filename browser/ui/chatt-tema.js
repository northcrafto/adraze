/* Sätter tema (ljust/mörkt) innan sidan ritas, så chattpanelen inte blinkar vitt i mörkt läge. */
(function () {
  try { const b = window.chatt && window.chatt.boot(); document.documentElement.dataset.theme = b && b.theme === 'dark' ? 'dark' : 'light'; } catch {}
})();
