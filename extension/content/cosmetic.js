// Ber bakgrunden lägga in CSS som döljer annonsytor i den här ramen, och skickar vidare vaktens räknare
(() => {
  if (window.__adraze) return;
  window.__adraze = true;
  const host = location.hostname || (() => { try { return window.top.location.hostname; } catch { return ""; } })();
  if (host) chrome.runtime.sendMessage({ typ: "css", host }).catch(() => {});
  document.addEventListener("adraze:stoppad", () => chrome.runtime.sendMessage({ typ: "popup-stoppad" }).catch(() => {}));
})();
