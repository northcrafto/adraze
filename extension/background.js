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

// ---------- Kakrutor ----------
// Döljs med EasyList Cookie och avvisas av content/kakor.js. Av för hela tillägget med storage.local.kakor = false,
// och per sajt med listan kakUndantag (då syns sajtens egen ruta som vanligt).
let kakKos = null;
let kakGenericCss = null;
// Sajter som låser sidan medan rutan visas: lås upp när rutan är dold
const KAK_UPPLAS = `html.sp-message-open,body.didomi-popup-open,html.didomi-popup-open,body.qc-cmp-ui-showing,html.qc-cmp-ui-showing,
body.cmp-modal-open,body.cookie-consent-open,body.onetrust-consent-sdk-open,html.cookiebot-open,body.CybotCookiebotDialogActive,
body.cky-modal-open,html.cmpbox-open,body.cmplz-cookiebanner-open{overflow:auto!important}
html.sp-message-open body{overflow:auto!important;position:static!important}\n`;

async function kakCssFor(host) {
  kakKos ||= await (await fetch(chrome.runtime.getURL("data/kakor.json"))).json();
  kakGenericCss ??= cssAv(kakKos.generic);
  const nivaer = suffix(host);
  const undantag = new Set();
  for (const n of nivaer) for (const s of kakKos.exceptions[n] || []) undantag.add(s);
  const specifika = [];
  for (const n of nivaer) for (const s of kakKos.specific[n] || []) if (!undantag.has(s)) specifika.push(s);
  return cssAv(specifika) + (undantag.size ? cssAv(kakKos.generic.filter((s) => !undantag.has(s))) : kakGenericCss) + KAK_UPPLAS;
}

// Rutor utan gratis nej (t.ex. "betala eller godkänn") döljs i toppramen när content/kakor.js ber om det
const KAK_DOLJ = {
  sourcepoint: `[id^="sp_message_container"]{display:none!important}html.sp-message-open,html.sp-message-open body{overflow:auto!important}html.sp-message-open body{position:static!important}`,
  didomi: `#didomi-host{display:none!important}body.didomi-popup-open,html.didomi-popup-open{overflow:auto!important}`,
};

async function kakorPa(toppHost) {
  const { kakor = true, kakUndantag = [] } = await chrome.storage.local.get(["kakor", "kakUndantag"]);
  return kakor && !suffix(toppHost).some((n) => kakUndantag.includes(n));
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
    { ...bas, id: "kakor", js: ["content/kakor.js"] },
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
  s[typ] = (s[typ] || 0) + 1;
  await chrome.storage.session.set({ [nyckel]: s });
  const tot = (await chrome.storage.local.get("totalt")).totalt || { popups: 0, omdirigeringar: 0 };
  tot[typ] = (tot[typ] || 0) + 1;
  await chrome.storage.local.set({ totalt: tot });
  await laggTillDag({ [typ]: 1 });
}

// ---------- Statistik per dag (visas på kontosidan när tillägget är kopplat) ----------
// Dagssummor i storage.local.dagar = { "2026-10-21": { reklam, sparare, farliga, popups, omdirigeringar } }
const API = "https://api.adraze.app";
const KATEGORI = { ads: "reklam", privacy: "sparare", security: "farliga" };
const idag = () => new Date().toLocaleDateString("sv-SE");
async function laggTillDag(okning) {
  const { dagar = {} } = await chrome.storage.local.get("dagar");
  const d = (dagar[idag()] ||= {});
  for (const [f, n] of Object.entries(okning)) d[f] = (d[f] || 0) + n;
  for (const k of Object.keys(dagar).sort().slice(0, -60)) delete dagar[k];
  await chrome.storage.local.set({ dagar });
}

// Stoppade förfrågningar hämtas från Chrome varannan minut. Blockerande regler har de lägsta
// id:na i varje regelpaket (se tools/build.js), så id <= antalet i rakna.json betyder stoppad.
let grans = null;
async function hamtaStoppade() {
  grans ||= await (await fetch(chrome.runtime.getURL("data/rakna.json"))).json();
  const { senastMatchad = Date.now() - 60_000 } = await chrome.storage.local.get("senastMatchad");
  let info;
  try { info = (await chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: senastMatchad + 1 })).rulesMatchedInfo; } catch { return; }
  const okning = {};
  let senast = senastMatchad;
  for (const { rule, timeStamp } of info) {
    senast = Math.max(senast, timeStamp);
    const f = KATEGORI[rule.rulesetId];
    if (f && rule.ruleId <= grans[rule.rulesetId]) okning[f] = (okning[f] || 0) + 1;
  }
  await chrome.storage.local.set({ senastMatchad: senast });
  if (Object.keys(okning).length) await laggTillDag(okning);
}

// Kopplat konto: skicka dagssummorna (inte ökningar), så att samma dag kan skickas om utan att räknas dubbelt
async function synka() {
  let { konto, dagar = {}, installId } = await chrome.storage.local.get(["konto", "dagar", "installId"]);
  if (!konto?.token) return;
  // Slumpat id för den här installationen, så att servern bara räknar den en gång om den kopplas om
  if (!installId) { installId = crypto.randomUUID(); await chrome.storage.local.set({ installId }); }
  const r = await fetch(`${API}/stats/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${konto.token}` },
    body: JSON.stringify({ dagar, installId }),
  }).catch(() => null);
  // Kopplingen borttagen på kontosidan: glöm nyckeln
  if (r?.status === 401) await chrome.storage.local.remove("konto");
}

chrome.alarms.onAlarm.addListener((larm) => {
  if (larm.name === "stoppade") ko = ko.then(hamtaStoppade).catch(() => {});
  if (larm.name === "synka") ko = ko.then(hamtaStoppade).then(synka).catch(() => {});
});

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
    } else if (msg.typ === "kakor" && tabId !== undefined) {
      // Undantag och paus gäller sajten i adressfältet, även för rutor i en iframe från ett annat domännamn
      let topp = "";
      try { topp = new URL(sender.tab.url).hostname; } catch {}
      const paus = await pausade();
      const pa = !!topp && !suffix(topp).some((n) => paus.includes(n)) && (await kakorPa(topp));
      if (pa && msg.host) {
        await chrome.scripting.insertCSS({ target: { tabId, frameIds: [sender.frameId] }, css: await kakCssFor(msg.host), origin: "USER" }).catch(() => {});
      }
      svara({ pa });
    } else if (msg.typ === "kaka-avvisad" && tabId !== undefined) {
      await rakna(tabId, "kakor");
      svara(true);
    } else if (msg.typ === "kak-dolj" && tabId !== undefined && KAK_DOLJ[msg.cmp]) {
      await chrome.scripting.insertCSS({ target: { tabId, frameIds: [0] }, css: KAK_DOLJ[msg.cmp], origin: "USER" }).catch(() => {});
      await rakna(tabId, "kakor");
      svara(true);
    } else if (msg.typ === "kak-undantag") {
      // pa = true: visa sajtens kakruta igen
      const nivaer = suffix(msg.host);
      let { kakUndantag = [] } = await chrome.storage.local.get("kakUndantag");
      kakUndantag = kakUndantag.filter((h) => !nivaer.includes(h));
      if (msg.pa) kakUndantag.push(msg.host.replace(/^www\./, ""));
      await chrome.storage.local.set({ kakUndantag });
      svara(true);
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
      svara({ ...tab, pausad: suffix(host).some((n) => lista.includes(n)), kakor: await kakorPa(host), kakor_flik: tab.kakor || 0, natverk, totalt });
    } else if (msg.typ === "konto-koppla" && sender.url?.startsWith("https://adraze.app/")) {
      // Från content/konto.js på adraze.app/konto: spara nyckeln och skicka statistiken direkt
      await chrome.storage.local.set({ konto: { token: String(msg.token), email: String(msg.email || "") } });
      ko = ko.then(hamtaStoppade).then(synka).catch(() => {});
      svara(true);
    } else if (msg.typ === "konto-status") {
      const { konto } = await chrome.storage.local.get("konto");
      svara({ kopplad: !!konto?.token, email: konto?.email || "" });
    } else if (msg.typ === "konto-koppla-bort" && sender.url?.startsWith("https://adraze.app/")) {
      await chrome.storage.local.remove("konto");
      svara(true);
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
  chrome.alarms.create("stoppade", { periodInMinutes: 2 }); // getMatchedRules tål 20 anrop per 10 min
  chrome.alarms.create("synka", { periodInMinutes: 15 });
}
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
