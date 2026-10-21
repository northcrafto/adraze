// Popupen: visar vad som stoppats på fliken och låter en pausa skyddet för sajten
const $ = (id) => document.getElementById(id);

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch {}
  $("host").textContent = host.replace(/^www\./, "") || "Ingen webbsida";
  if (!host) { $("vaxla").disabled = true; $("vaxla").style.opacity = .4; }

  const s = host ? await chrome.runtime.sendMessage({ typ: "status", host, tabId: tab.id }) : null;
  const visa = (pausad) => {
    $("vaxla").setAttribute("aria-checked", String(!pausad));
    $("lage").textContent = pausad ? "Pausad på den här sajten" : "Skyddet är på";
  };
  if (s) {
    visa(s.pausad);
    $("natverk").textContent = s.natverk;
    $("popups").textContent = s.popups;
    $("omdir").textContent = s.omdirigeringar;
    $("totalt").textContent = `${s.totalt.popups} popups · ${s.totalt.omdirigeringar} omdirigeringar`;
  }

  const konto = await chrome.runtime.sendMessage({ typ: "konto-status" }).catch(() => null);
  if (konto?.kopplad) {
    $("konto-rubrik").textContent = "Din statistik";
    $("konto-under").textContent = konto.email ? `Kopplad till ${konto.email}` : "Tillägget är kopplat till ditt konto";
  }

  $("vaxla").addEventListener("click", async () => {
    const pa = $("vaxla").getAttribute("aria-checked") === "true";
    await chrome.runtime.sendMessage({ typ: "pausa", host, pa });
    visa(pa);
    chrome.tabs.reload(tab.id);
  });
})();
