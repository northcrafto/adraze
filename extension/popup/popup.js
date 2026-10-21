// Popupen: visar vad som stoppats på fliken och låter en pausa skyddet för sajten
const $ = (id) => document.getElementById(id);

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch {}
  $("host").textContent = host.replace(/^www\./, "") || "Ingen webbsida";
  if (!host) { $("vaxla").disabled = true; $("vaxla").style.opacity = .4; $("kakor").disabled = true; }

  const s = host ? await chrome.runtime.sendMessage({ typ: "status", host, tabId: tab.id }) : null;
  const visa = (pausad) => {
    $("vaxla").setAttribute("aria-checked", String(!pausad));
    $("lage").textContent = pausad ? "Pausad på den här sajten" : "Skyddet är på";
  };
  // Kakrutor: på = avvisas automatiskt, av = sajtens egen ruta visas
  const visaKakor = (pa, antal) => {
    $("kakor").setAttribute("aria-checked", String(pa));
    $("kak-lage").textContent = pa ? "Avvisar kakrutor" : "Kakrutan visas här";
    $("kak-under").textContent = !pa ? "Du väljer själv på den här sajten" : antal ? `${antal} avvisad${antal === 1 ? "" : "e"} på fliken` : "Bara nödvändiga kakor sparas";
  };
  if (s) {
    visa(s.pausad);
    visaKakor(s.kakor, s.kakor_flik);
    $("kakor").disabled = s.pausad;
    $("natverk").textContent = s.natverk;
    $("popups").textContent = s.popups;
    $("omdir").textContent = s.omdirigeringar;
    $("totalt").textContent = `Totalt ${s.totalt.popups} popups · ${s.totalt.omdirigeringar} omdirigeringar · ${s.totalt.kakor || 0} kakrutor`;
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

  $("kakor").addEventListener("click", async () => {
    const pa = $("kakor").getAttribute("aria-checked") === "true";
    await chrome.runtime.sendMessage({ typ: "kak-undantag", host, pa });
    visaKakor(!pa, 0);
    chrome.tabs.reload(tab.id);
  });
})();
