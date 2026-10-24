// Bro mellan kontosidan (accounts.adraze.app) och tillägget: sidan visar att tillägget finns och lämnar över kontots nyckel
(() => {
  document.documentElement.dataset.adraze = chrome.runtime.getManifest().version;
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.adraze !== "sida") return;
    const { typ, token, email } = e.data;
    let svar = null;
    if (typ === "koppla" && typeof token === "string") svar = await chrome.runtime.sendMessage({ typ: "konto-koppla", token, email });
    else if (typ === "status") svar = await chrome.runtime.sendMessage({ typ: "konto-status" });
    else if (typ === "koppla-bort") svar = await chrome.runtime.sendMessage({ typ: "konto-koppla-bort" });
    window.postMessage({ adraze: "tillagg", typ, svar }, location.origin);
  });
})();
