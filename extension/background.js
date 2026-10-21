// AdRaze bakgrund: kosmetik (dölj annonsytor), stäng popups, stoppsida, pausa per sajt
const PAUS_PRIO = 100000;

// ---------- Kosmetik ----------
let kosmetik = null;
let genericCss = null;
// Lockbeten (tomma, osynliga "annonser" som sajter använder för att upptäcka blockerare) märks av
// content/cosmetic.js med ett slumpat attribut, och den här regeln tar då tillbaka dem. Den är
// specifikare än alla dölj-regler och kommer sist, så den vinner.
const LOCKBETE = "data-" + crypto.randomUUID().slice(0, 8);
const lockbeteCss = `[${LOCKBETE}]:not(#a#b#c#d#e){display:revert!important}\n`;

async function laddaKosmetik() {
  if (kosmetik) return kosmetik;
  kosmetik = await (await fetch(chrome.runtime.getURL("data/cosmetic.json"))).json();
  kosmetik.genericHide = new Set(kosmetik.genericHideExceptions);
  genericCss = cssAv(kosmetik.generic);
  return kosmetik;
}

// Dölj-regler som skulle kunna träffa ett element med de här klasserna/id:na (för lockbeteskollen i
// content/cosmetic.js, som själv provar el.matches). Regler utan klass eller id följer alltid med.
const TOKEN = /[.#]((?:[\w-]|\\.)+)/g;
let tokenIndex = null;
function indexera(selektorer) {
  const index = new Map();
  const otokade = [];
  for (const sel of selektorer) {
    const tokens = [...sel.matchAll(TOKEN)].map((m) => m[1]);
    if (!tokens.length) { otokade.push(sel); continue; }
    for (const t of new Set(tokens)) { if (!index.has(t)) index.set(t, []); index.get(t).push(sel); }
  }
  return { index, otokade };
}
async function doljRegler(host, tokens) {
  const k = await laddaKosmetik();
  const nivaer = suffix(host);
  const undantag = new Set();
  for (const n of nivaer) for (const s of k.exceptions[n] || []) undantag.add(s);
  const ut = new Set();
  const specifika = indexera(nivaer.flatMap((n) => k.specific[n] || []));
  const delar = [specifika];
  if (!nivaer.some((n) => k.genericHide.has(n))) delar.push(tokenIndex ||= indexera(k.generic));
  for (const { index, otokade } of delar) {
    for (const s of otokade) ut.add(s);
    for (const t of tokens) for (const s of index.get(t) || []) ut.add(s);
  }
  return [...ut].filter((s) => !undantag.has(s));
}

// 100 selektorer per regel: en selektor Chromium inte känner igen tar bara med sig sin egen grupp
function cssAv(selektorer) {
  let css = "";
  for (let i = 0; i < selektorer.length; i += 100) css += selektorer.slice(i, i + 100).join(",\n") + "{display:none!important}\n";
  return css;
}

// a.b.example.se -> ["a.b.example.se", "b.example.se", "example.se"]
function suffix(host) {
  const delar = host.split(".");
  const ut = [];
  for (let i = 0; i < delar.length - 1; i++) ut.push(delar.slice(i).join("."));
  return ut;
}

async function cssFor(host) {
  const k = await laddaKosmetik();
  const nivaer = suffix(host);
  const undantag = new Set();
  for (const n of nivaer) for (const s of k.exceptions[n] || []) undantag.add(s);
  const specifika = [];
  for (const n of nivaer) for (const s of k.specific[n] || []) if (!undantag.has(s)) specifika.push(s);
  const utanGeneric = nivaer.some((n) => k.genericHide.has(n));
  let css = specifika.length ? cssAv(specifika) : "";
  if (!utanGeneric) css += undantag.size ? cssAv(k.generic.filter((s) => !undantag.has(s))) : genericCss;
  return css && css + lockbeteCss;
}

// ---------- Pausade sajter ----------
async function pausade() {
  return (await chrome.storage.local.get("pausade")).pausade || [];
}

async function synkaPaus() {
  const lista = await pausade();
  const gamla = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: gamla.map((r) => r.id),
    addRules: [
      ...(lista.length
        ? [{ id: 1, priority: PAUS_PRIO, action: { type: "allowAllRequests" }, condition: { requestDomains: lista, resourceTypes: ["main_frame", "sub_frame"] } }]
        : []),
      // YouTube: släpp igenom kvittot på att reklamen visats (content/youtube.js spolar förbi den),
      // annars får varje ny video en svart väntan lika lång som reklamen
      { id: 2, priority: PAUS_PRIO, action: { type: "allow" }, condition: { urlFilter: "||youtube.com/pagead/adview" } },
    ],
  });
  await registreraSkript(lista);
}

async function registreraSkript(lista) {
  const exclude = lista.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);
  const gamla = await chrome.scripting.getRegisteredContentScripts();
  if (gamla.length) await chrome.scripting.unregisterContentScripts({ ids: gamla.map((s) => s.id) });
  const bas = { matches: ["<all_urls>"], runAt: "document_start", allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true };
  if (exclude.length) bas.excludeMatches = exclude;
  await chrome.scripting.registerContentScripts([
    { ...bas, id: "kosmetik", js: ["content/cosmetic.js"] },
    { ...bas, id: "vakt", js: ["content/guard.js"], world: "MAIN" },
    // YouTube: spola förbi och dölj förvideo- och mellanreklam
    { ...bas, id: "youtube", js: ["content/youtube.js"], world: "MAIN", matches: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"] },
  ]);
}

// ---------- Räknare ----------
// Läs-ändra-skriv i kö så att två händelser samtidigt inte skriver över varandra
let ko = Promise.resolve();
function rakna(tabId, typ) {
  ko = ko.then(() => raknaNu(tabId, typ)).catch(() => {});
  return ko;
}
async function raknaNu(tabId, typ) {
  const nyckel = "tab" + tabId;
  const s = (await chrome.storage.session.get(nyckel))[nyckel] || { popups: 0, omdirigeringar: 0 };
  s[typ]++;
  await chrome.storage.session.set({ [nyckel]: s });
  const tot = (await chrome.storage.local.get("totalt")).totalt || { popups: 0, omdirigeringar: 0 };
  tot[typ]++;
  await chrome.storage.local.set({ totalt: tot });
}

// ---------- Popups och omdirigeringar ----------
const STOPP = chrome.runtime.getURL("blocked/blocked.html");

// Nya flikar/fönster som en sida öppnar: kom ihåg dem en stund
chrome.webNavigation.onCreatedNavigationTarget.addListener(async ({ tabId, sourceTabId }) => {
  await chrome.storage.session.set({ ["nytt" + tabId]: { kalla: sourceTabId, t: Date.now() } });
});

// Adressen innan den stoppades, så stoppsidan kan visa den och "fortsätt ändå" fungerar
chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || url.startsWith("chrome-extension:")) return;
  await chrome.storage.session.set({ ["senast" + tabId]: url });
});

chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || !url.startsWith(STOPP)) return;
  const nyckel = "nytt" + tabId;
  const nytt = (await chrome.storage.session.get(nyckel))[nyckel];
  // En popup som hamnade på en blockerad sida: stäng den direkt och gå tillbaka till fliken man var på
  if (nytt && Date.now() - nytt.t < 30000) {
    await chrome.storage.session.remove(nyckel);
    chrome.tabs.remove(tabId).catch(() => {});
    chrome.tabs.update(nytt.kalla, { active: true }).catch(() => {});
    rakna(nytt.kalla, "popups");
  } else {
    rakna(tabId, "omdirigeringar");
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(["tab" + tabId, "nytt" + tabId, "senast" + tabId]);
});

// ---------- Meddelanden ----------
chrome.runtime.onMessage.addListener((msg, sender, svara) => {
  (async () => {
    const tabId = sender.tab?.id;
    if (msg.typ === "css" && tabId !== undefined) {
      const css = await cssFor(msg.host);
      if (css) await chrome.scripting.insertCSS({ target: { tabId, frameIds: [sender.frameId] }, css, origin: "USER" }).catch(() => {});
      svara({ lockbete: css ? LOCKBETE : null });
    } else if (msg.typ === "dolj-regler") {
      svara(await doljRegler(msg.host, msg.tokens || []));
    } else if (msg.typ === "popup-stoppad" && tabId !== undefined) {
      await rakna(tabId, "popups");
      svara(true);
    } else if (msg.typ === "stoppad-url") {
      svara((await chrome.storage.session.get("senast" + tabId))["senast" + tabId] || "");
    } else if (msg.typ === "fortsatt") {
      // Släpp igenom just den sajten resten av sessionen
      const host = new URL(msg.url).hostname;
      const regler = await chrome.declarativeNetRequest.getSessionRules();
      const id = (regler.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{ id, priority: PAUS_PRIO, action: { type: "allow" }, condition: { requestDomains: [host], resourceTypes: ["main_frame"] } }],
      });
      svara(true);
    } else if (msg.typ === "status") {
      const lista = await pausade();
      const host = msg.host;
      const tab = (await chrome.storage.session.get("tab" + msg.tabId))["tab" + msg.tabId] || { popups: 0, omdirigeringar: 0 };
      let natverk = 0;
      try { natverk = (await chrome.declarativeNetRequest.getMatchedRules({ tabId: msg.tabId })).rulesMatchedInfo.length; } catch {}
      const totalt = (await chrome.storage.local.get("totalt")).totalt || { popups: 0, omdirigeringar: 0 };
      svara({ pausad: suffix(host).some((n) => lista.includes(n)), natverk, ...tab, totalt });
    } else if (msg.typ === "pausa") {
      let lista = await pausade();
      const nivaer = suffix(msg.host);
      lista = lista.filter((h) => !nivaer.includes(h));
      if (msg.pa) lista.push(msg.host.replace(/^www\./, ""));
      await chrome.storage.local.set({ pausade: lista });
      await synkaPaus();
      svara(true);
    }
  })();
  return true;
});

// ---------- Start ----------
async function start() {
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  await chrome.action.setBadgeBackgroundColor({ color: "#ff4b1f" });
  await chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  await synkaPaus();
}
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
