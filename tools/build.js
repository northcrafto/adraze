#!/usr/bin/env node
// Bygger AdRaze-reglerna: filterlistor -> DNR-regler (nätverk) + kosmetik (CSS) + scriptlets (sidskript)
// + värdlistor (popups/omdirigeringar).
// Kör: node build.js [--fetch]   (--fetch laddar ner listorna på nytt)
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { convertFilter } = require("@eyeo/abp2dnr");
const SL = require("./scriptlets");

const LISTS = path.join(__dirname, "lists");
const EXT = path.join(__dirname, "..", "extension");
const KALLOR = {
  // Braves säkerhetslistor (inte filter): undantag för natskydd (localhost/LAN) och endast HTTPS
  "brave-localhost.txt": "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/localhost-permission-allow-list.txt",
  "brave-https-undantag.txt": "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/https-upgrade-exceptions-list.txt",
  "easylist.txt": "https://easylist.to/easylist/easylist.txt",
  "easyprivacy.txt": "https://easylist.to/easylist/easyprivacy.txt",
  "frellwit.txt": "https://raw.githubusercontent.com/lassekongo83/Frellwits-filter-lists/master/Frellwits-Swedish-Filter.txt",
  "badware.txt": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
  // Huvudfilen hämtar resten av listan med !#include (filters-general.txt, filters-2020.txt …), se hamtaInkluderade
  "ubo-filters.txt": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
  "ubo-quick-fixes.txt": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt",
  "ubo-unbreak.txt": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt",
  "peterlowe.txt": "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext",
  "adguard-popups.txt": "https://filters.adtidy.org/extension/ublock/filters/19.txt",
  // Bara kosmetiken används (döljer kakrutor), se kakor.json längre ner
  "easylist-cookie.txt": "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
};

// Vilka listor som går till vilket regelpaket
const PAKET = {
  ads: ["easylist.txt", "ubo-filters.txt", "ubo-quick-fixes.txt", "ubo-unbreak.txt", "peterlowe.txt", "frellwit.txt", "adraze-kosmetik.txt", "adraze-natverk.txt"],
  privacy: ["easyprivacy.txt"],
  security: ["badware.txt", "adguard-popups.txt"],
};
// Regler som tar bort spårningsparametrar ur adresser ($removeparam) får ett eget paket: webbläsarens
// regelmotor läser bara de tre ovan och kan inte skriva om adresser
const PARAMETRAR = "parametrar";

// Snabbfixarna och avbrottsfixarna jagar YouTubes ändringar med knep som krockar med tilläggets egen
// YouTube-hantering (content/youtube.js): deras YouTube-rader används inte
const UTAN_YOUTUBE = new Set(["ubo-quick-fixes.txt", "ubo-unbreak.txt"]);
const YOUTUBE = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;

// uBO-förkortningar -> ABP-namn som omvandlaren förstår
const ALIAS = {
  "1p": "~third-party", "first-party": "~third-party", "3p": "third-party", "~1p": "third-party", "~3p": "~third-party",
  xhr: "xmlhttprequest", frame: "subdocument", css: "stylesheet", doc: "document", "~doc": "~document",
  from: "domain", ghide: "generichide", shide: "specifichide", ehide: "elemhide",
  "strict3p": "third-party", "strict1p": "~third-party",
};
// Alternativ vi inte kan göra som DNR-regel: hoppa över hela filtret. (method går att uttrycka i DNR,
// men webbläsarens regelmotor läser samma regelfiler och tittar inte på metoden: den skulle blockera för mycket.)
const HOPPA = /^(queryprune|replace|header|permissions|urltransform|uritransform|cname|ipaddress|method|inline-script|inline-font|specifichide|elemhide|genericblock|content|stealth|urlblock|jsinject|extension|app|network|cookie|hls|jsonprune|xmlprune|referrerpolicy|popunder|urlskip)$/;

// Hela fliken skickas till vår stoppsida i stället för Chromes felsida
const STOPPSIDA = { type: "redirect", redirect: { extensionPath: "/blocked/blocked.html" } };
const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Prioriteter. Omvandlaren ger blockering 1000 (allmän) / 2000 (för vissa sajter), undantag 2000 och
// undantag för hela sidan 2010. Omdirigeringar till stubbar ska vinna över blockeringen men förlora mot
// undantagen, så undantagen flyttas upp två steg. $important vinner över alla undantag.
const PRIO = { tillat: 2, omdirigering: 1, viktig: 2500, stoppsida: 1001, farlig: 3000 };

// Stubbar för $redirect: namn i filterlistorna -> fil i extension/stubbar (ofarliga ersättare som gör
// att sidor som väntar på ett blockerat skript inte hänger sig). Namn vi inte har en stubbe för
// hoppas över, så att resursen behandlas som förut.
const STUBBAR = {};
for (const [fil, namn] of Object.entries({
  "noop.js": "noop.js noopjs abp-resource:blank-js",
  "noop.txt": "noop.txt nooptext abp-resource:blank-text empty",
  "noop.html": "noop.html noopframe",
  "noop.json": "noop.json noopjson",
  "noop.css": "noop.css",
  "noop-0.1s.mp3": "noop-0.1s.mp3 noopmp3-0.1s abp-resource:blank-mp3",
  "noop-1s.mp4": "noop-1s.mp4 noopmp4-1s abp-resource:blank-mp4 mp4",
  "noop-vmap1.0.xml": "noop-vmap1.0.xml noopvmap-1.0",
  "1x1.gif": "1x1.gif 1x1-transparent.gif",
  "2x2.png": "2x2.png 2x2-transparent.png",
  "3x2.png": "3x2.png 3x2-transparent.png",
  "32x32.png": "32x32.png 32x32-transparent.png",
  "googlesyndication_adsbygoogle.js": "googlesyndication_adsbygoogle.js googlesyndication.com/adsbygoogle.js googlesyndication-adsbygoogle",
  "googletagservices_gpt.js": "googletagservices_gpt.js googletagservices.com/gpt.js googletagservices-gpt",
  "google-analytics_analytics.js": "google-analytics_analytics.js google-analytics.com/analytics.js googletagmanager_gtm.js googletagmanager.com/gtm.js",
  "fingerprint2.js": "fingerprint2.js",
  "nofab.js": "nofab.js fuckadblock.js-3.2.0",
  "amazon_apstag.js": "amazon_apstag.js",
  "prebid-ads.js": "prebid-ads.js",
  "popads.js": "popads.js popads.net.js prevent-popads-net.js",
  "chartbeat.js": "chartbeat.js static.chartbeat.com/chartbeat.js",
})) for (const n of namn.split(" ")) STUBBAR[n] = fil;
// Vilka förfrågningar en stubbe ersätter när filtret inte själv anger typ
const STUBBTYP = {
  js: ["script"], txt: ["xmlhttprequest", "other"], json: ["xmlhttprequest"], xml: ["xmlhttprequest"], html: ["sub_frame"],
  css: ["stylesheet"], gif: ["image"], png: ["image"], mp3: ["media"], mp4: ["media"],
};

// uBO:s förbehandlare (!#if/!#else/!#endif). Vi är en Chromium-baserad MV3-blockerare som uBO Lite:
// ingen HTML-filtrering, inte mobil. Okända namn räknas som falska.
const MILJO = new Set(["env_chromium", "env_mv3", "ext_ubol", "ext_ublock", "cap_user_stylesheet"]);
function villkor(uttryck) {
  const t = uttryck.match(/!|&&|\|\||\(|\)|[\w-]+/g) || [];
  let i = 0;
  const atom = () => {
    const x = t[i++];
    if (x === "!") return !atom();
    if (x === "(") { const v = eller(); i++; return v; }
    return MILJO.has(x);
  };
  const och = () => { let v = atom(); while (t[i] === "&&") { i++; const w = atom(); v = v && w; } return v; };
  const eller = () => { let v = och(); while (t[i] === "||") { i++; const w = och(); v = v || w; } return v; };
  return eller();
}

// Inkluderade dellistor (!#include) hamnar i lists/<lista>.d/
const inklMapp = (fil) => fil.replace(/\.txt$/, "") + ".d";
const INKLUDERA = /^!#include\s+([\w.-]+\.txt)$/;

// Läs en lista med förbehandlaren: rader i aktiva grenar, inkluderade dellistor på sin plats
function lasLista(fil, djup = 0) {
  const ut = [];
  const grenar = [];
  let text;
  try { text = fs.readFileSync(path.join(LISTS, fil), "utf8"); } catch { return ut; }
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (line.startsWith("!#if ")) { grenar.push(villkor(line.slice(5))); continue; }
    if (line === "!#else") { if (grenar.length) grenar[grenar.length - 1] = !grenar[grenar.length - 1]; continue; }
    if (line === "!#endif") { grenar.pop(); continue; }
    if (!grenar.every(Boolean)) continue;
    const inkl = INKLUDERA.exec(line);
    if (inkl) { if (djup < 2) ut.push(...lasLista(path.join(inklMapp(fil), inkl[1]), djup + 1)); continue; }
    ut.push(line);
  }
  return ut;
}

// Hämta dellistorna som en nedladdad lista inkluderar (samma mapp på samma server, som i uBO)
function hamtaInkluderade(fil, url) {
  const mapp = path.join(LISTS, inklMapp(fil));
  fs.rmSync(mapp, { recursive: true, force: true });
  const namn = new Set();
  for (const line of fs.readFileSync(path.join(LISTS, fil), "utf8").split(/\r?\n/)) {
    const m = INKLUDERA.exec(line.trim());
    if (m) namn.add(m[1]);
  }
  if (!namn.size) return;
  fs.mkdirSync(mapp, { recursive: true });
  for (const n of namn) {
    const u = new URL(n, url).href;
    execSync(`curl -sfL --max-time 90 -o ${JSON.stringify(path.join(mapp, n))} ${JSON.stringify(u)}`);
    console.log("  hämtade", path.join(inklMapp(fil), n));
  }
}

// Värd i ASCII (punycode), eller null för ogiltiga värdar, entiteter (example.*) och /regex/
function arVard(x) {
  x = String(x).trim().toLowerCase();
  if (!x || x.includes("*") || x.includes("/")) return null;
  if (/[^\x00-\x7f]/.test(x)) { try { x = new URL("http://" + x).hostname; } catch { return null; } }
  return VALID_HOST.test(x) ? x : null;
}
// "a.se|~b.se|c.*" -> { pos, neg, ent } (ent = antal poster som inte är vanliga värdar)
function domanLista(text, sep) {
  const pos = [], neg = [];
  let ent = 0;
  for (let x of String(text).split(sep)) {
    x = x.trim();
    if (!x) continue;
    const inte = x.startsWith("~");
    const h = arVard(inte ? x.slice(1) : x);
    if (!h) { ent++; continue; }
    (inte ? neg : pos).push(h);
  }
  return { pos, neg, ent };
}

function delaFilter(line) {
  // Regex-filter: /.../$opts
  let m = line.match(/^(@@)?(\/.*\/)(?:\$([^/]*))?$/);
  if (m) return { undantag: !!m[1], monster: m[2], opts: m[3] ? m[3].split(",") : [] };
  const undantag = line.startsWith("@@");
  const rest = undantag ? line.slice(2) : line;
  const i = rest.lastIndexOf("$");
  // i = 0: filter utan mönster ("$script,domain=…") gäller alla adresser
  if (i >= 0 && !/[\/]/.test(rest.slice(i + 1).replace(/domain=[^,]*/g, "")) ) {
    return { undantag, monster: rest.slice(0, i), opts: rest.slice(i + 1).split(",").filter(Boolean) };
  }
  return { undantag, monster: rest, opts: [] };
}

function hostAv(monster) {
  const m = monster.match(/^\|\|([a-z0-9.-]+)\^?\|?$/i);
  return m && VALID_HOST.test(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}
// Värden i början av ett ||värd/…-mönster
function vardAnkare(monster) {
  const m = monster.match(/^\|\|([a-z0-9.-]+)(?=[\^\/*|:?]|$)/i);
  return m && VALID_HOST.test(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}
// a.b.example.se -> ["a.b.example.se", "b.example.se", "example.se", "se"]
const suffixer = (h) => h.split(".").map((_, i, d) => d.slice(i).join("."));

// Procedurella kosmetiska operatorer (kräver en egen motor i sidan): sådana filter hoppas över
const PROCEDURELL = /:(?:has-text|upward|matches-css(?:-before|-after)?|matches-attr|matches-prop|matches-media|matches-path|xpath|min-text-length|watch-attr|others|if|if-not|contains|nth-ancestor|remove|style|remove-attr|remove-class|-abp-[a-z-]+)\(/;
// Domäner ## selektor, med uBO:s varianter: #@# undantag, #?# (procedurellt/utökat), #$# och #%# (AdGuard)
const KOS_SEP = /^([^#\s]*?)(#@?(?:\$\?|\?|\$|%)?#)(.*)$/;

// :style()-deklarationer läggs i en användarstilmall, där bara !important vinner över sidans egen CSS.
// Inga url(), @-regler, kommentarer, escapes eller klammrar (inget som kan hämta något eller bryta sig ut).
function stilAv(decl) {
  if (/url\(|image-set\(|expression\(|@|\/\*|\\|[{}<>]|behavior\s*:|-moz-binding/i.test(decl)) return null;
  const delar = [];
  let nu = "", citat = null, parenteser = 0;
  for (const c of decl) {
    if (citat) { if (c === citat) citat = null; nu += c; continue; }
    if (c === "'" || c === '"') { citat = c; nu += c; continue; }
    if (c === "(") parenteser++;
    if (c === ")") parenteser--;
    if (c === ";" && parenteser === 0) { delar.push(nu); nu = ""; continue; }
    nu += c;
  }
  if (citat || parenteser) return null;
  delar.push(nu);
  const ut = delar.map((d) => d.trim()).filter(Boolean).map((d) => (/!\s*important$/i.test(d) ? d : d + " !important"));
  return ut.length ? ut.join("; ") : null;
}

// Kosmetisk rad -> in i mal (dölj, :style, undantag) eller skript (##+js och :remove-attr/:remove-class).
// Svarar med vad raden blev (en nyckel i stat eller en orsak till att den hoppades över), eller null om
// raden inte är kosmetisk.
function kosmetikRad(line, mal, skript) {
  if (line.startsWith("/") || line.startsWith("@@") || line.startsWith("|")) return null;
  const km = line.match(KOS_SEP);
  if (!km) return null;
  const [, doms, sep, sel0] = km;
  if (!sel0) return "kosmetik: tom";
  const undantag = sep.includes("@");
  const typ = sep.replace("@", "");
  if (typ === "#$#" || typ === "#%#" || typ === "#$?#") return "kosmetik: AdGuard-syntax";
  if (sel0.startsWith("+js(")) return skriptRad(doms, undantag, sel0, skript);
  if (sel0.startsWith("^")) return "kosmetik: HTML-filter";
  let sel = sel0.replace(/:-abp-has\(/g, ":has(");
  // Avslutande åtgärd: :style(…), :remove() (= dölj), :remove-attr(…) och :remove-class(…) (= scriptlets)
  let atgard = null, varde = null, m;
  if ((m = /^(.+?):style\((.*)\)$/.exec(sel))) { atgard = "stil"; sel = m[1]; varde = m[2]; }
  else if ((m = /^(.+?):remove\(\)$/.exec(sel))) sel = m[1];
  else if ((m = /^(.+?):(remove-attr|remove-class)\((.+)\)$/.exec(sel))) { atgard = m[2]; sel = m[1]; varde = m[3]; }
  if (PROCEDURELL.test(sel)) return "kosmetik: procedurell";
  let nyckel = sel;
  if (atgard === "stil") {
    const s = stilAv(varde);
    if (!s) return "kosmetik: osäker :style";
    nyckel = sel + ":style(" + s + ")";
    varde = s;
  }
  const d = doms ? domanLista(doms, ",") : { pos: [], neg: [], ent: 0 };
  if (undantag) {
    if (atgard === "remove-attr" || atgard === "remove-class") return "undantag";
    for (const dm of d.pos) { if (!mal.undantag.has(dm)) mal.undantag.set(dm, new Set()); mal.undantag.get(dm).add(nyckel); }
    return "undantag";
  }
  // Bara entiteter (example.*) eller regex-domäner: går inte att uttrycka
  if (d.ent && !d.pos.length) return "kosmetik: entitet";
  const utom = (dm) => { if (!mal.undantag.has(dm)) mal.undantag.set(dm, new Set()); mal.undantag.get(dm).add(nyckel); };
  if (atgard === "remove-attr" || atgard === "remove-class") {
    if (!d.pos.length) return "kosmetik: generell " + atgard;
    if (!/^[\w:-]+$/.test(varde)) return "kosmetik: " + atgard + " med mönster";
    const args = [varde, sel, "stay"];
    const x = { namn: atgard, args, nyckel: atgard + "(" + JSON.stringify(args) + ")" };
    const vardar = d.pos.filter((h) => !YOUTUBE.test(h));
    if (!vardar.length) return "skript: YouTube (egen hantering)";
    skript.lagg(x, vardar, d.neg);
    return "skript";
  }
  if (atgard === "stil") {
    if (!d.pos.length) return "kosmetik: generell :style";
    for (const dm of d.pos) { if (!mal.stilar.has(dm)) mal.stilar.set(dm, new Map()); mal.stilar.get(dm).set(nyckel, [sel, varde]); }
    for (const dm of d.neg) utom(dm);
    return "stilar";
  }
  // Inga positiva domäner ("~a.se##.x" eller "##.x"): gäller överallt utom de undantagna
  if (!d.pos.length) mal.generic.add(sel);
  else for (const dm of d.pos) { if (!mal.specific.has(dm)) mal.specific.set(dm, new Set()); mal.specific.get(dm).add(sel); }
  for (const dm of d.neg) utom(dm);
  return "kosmetik";
}

// ##+js(namn, argument…): scriptlets per värd. #@#+js(…) stänger av en scriptlet (eller alla, med tomt
// innehåll) på en värd.
function skriptRad(doms, undantag, sel, skript) {
  const m = /^\+js\((.*)\)$/.exec(sel);
  if (!m) return "skript: trasig rad";
  const inne = m[1];
  const d = doms ? domanLista(doms, ",") : { pos: [], neg: [], ent: 0 };
  if (undantag) {
    let nyckel = "*";
    if (inne.trim()) {
      const x = SL.normalisera(inne);
      if (!x.namn) return "undantag";
      nyckel = x.nyckel;
    }
    if (!doms) skript.avstangda.add(nyckel);
    for (const h of d.pos) skript.undantag(h, nyckel);
    return "undantag";
  }
  if (!inne.trim()) return "skript: tom";
  const x = SL.normalisera(inne);
  if (!x.namn) { skript.okanda.set(x.ratt, (skript.okanda.get(x.ratt) || 0) + 1); return "skript: okänt eller betrott"; }
  if (!d.pos.length) return doms && d.ent ? "skript: entitet/regex" : "skript: generellt";
  const vardar = d.pos.filter((h) => !YOUTUBE.test(h));
  if (!vardar.length) return "skript: YouTube (egen hantering)";
  skript.lagg(x, vardar, d.neg);
  return "skript";
}

function nySkriptSamling() {
  const poster = new Map(); // nyckel -> { namn, args, vardar, utom }
  const undantag = new Map(); // värd -> Set(nyckel | "*")
  return {
    poster, undantagPerVard: undantag, okanda: new Map(), avstangda: new Set(),
    lagg(x, vardar, neg) {
      let p = poster.get(x.nyckel);
      if (!p) poster.set(x.nyckel, (p = { namn: x.namn, args: x.args, vardar: new Set(), utom: new Set() }));
      for (const h of vardar) p.vardar.add(h);
      for (const h of neg) p.utom.add(h);
    },
    undantag(h, nyckel) { if (!undantag.has(h)) undantag.set(h, new Set()); undantag.get(h).add(nyckel); },
  };
}

// Lägg till to=/denyallow= (vilka värdar förfrågan går till) på en omvandlad regel
function begransaMal(regel, till, neka) {
  const c = regel.condition;
  if (till && till.pos.length) c.requestDomains = [...new Set([...(c.requestDomains || []), ...till.pos])];
  const ut = [...(till ? till.neg : []), ...(neka || [])];
  if (ut.length) c.excludedRequestDomains = [...new Set([...(c.excludedRequestDomains || []), ...ut])];
}

async function main() {
  fs.mkdirSync(LISTS, { recursive: true });
  if (process.argv.includes("--fetch")) {
    for (const [fil, url] of Object.entries(KALLOR)) {
      execSync(`curl -sfL --max-time 90 -o ${JSON.stringify(path.join(LISTS, fil))} ${JSON.stringify(url)}`);
      console.log("hämtade", fil);
      hamtaInkluderade(fil, url);
    }
  }
  for (const fil of new Set(Object.values(STUBBAR))) {
    if (!fs.existsSync(path.join(EXT, "stubbar", fil))) throw new Error("stubbe saknas: stubbar/" + fil);
  }

  const kosmetik = { generic: new Set(), specific: new Map(), undantag: new Map(), stilar: new Map() };
  const skript = nySkriptSamling();
  const genericHideUndantag = new Set();
  const popupHosts = new Set();
  const farligaHosts = new Set();
  const annonsHosts = new Set();
  const blockeradeVardar = new Set();
  const undantagsHosts = new Set();
  const badfilters = new Set();
  const stat = { filter: 0, fel: 0, tomma: 0, kosmetik: 0, stilar: 0, undantag: 0, skript: 0, omdirigeringar: 0, stoppsidor: 0, parametrar: 0 };
  const hoppade = {};
  const hopp = (orsak) => { hoppade[orsak] = (hoppade[orsak] || 0) + 1; };
  const saknadeStubbar = {};
  const rader = {};

  for (const [namn, filer] of Object.entries(PAKET)) {
    rader[namn] = [];
    for (const fil of filer) {
      for (const line of lasLista(fil)) {
        if (!line || line.startsWith("!") || line.startsWith("[") || line.startsWith("#") && !line.startsWith("##")) continue;
        if (UTAN_YOUTUBE.has(fil) && /youtube/i.test(line)) { hopp("YouTube-rad i snabb-/avbrottsfixar"); continue; }
        rader[namn].push(line);
        const d = line.includes("$") && !line.includes("#") ? delaFilter(line) : null;
        if (d && d.opts.includes("badfilter")) badfilters.add(line.replace(/,?badfilter/, "").replace(/\$$/, ""));
      }
    }
  }

  const omvandla = async (text) => {
    try {
      const ut = await convertFilter(text);
      if (!ut.length) stat.tomma++;
      return ut;
    } catch { stat.fel++; return null; }
  };

  const regelPaket = { ads: [], privacy: [], security: [], [PARAMETRAR]: [] };
  const omdir = [];
  const omdirUndantag = [];
  for (const [namn, lista] of Object.entries(rader)) {
    const regler = regelPaket[namn];
    for (const line of lista) {
      if (badfilters.has(line)) continue;

      // --- Kosmetik och scriptlets ---
      const k = kosmetikRad(line, kosmetik, skript);
      if (k) { if (k in stat) stat[k]++; else hopp(k); continue; }
      // AdGuards HTML-filter (example.com$$script[…])
      if (/\$\$|\$@\$/.test(line)) { hopp("html-filter"); continue; }

      // --- Nätverk ---
      const d = delaFilter(line);
      const opts0 = d.opts.map((o) => {
        const neg = o.startsWith("~") ? "~" : "";
        const bas = o.replace(/^~/, "").split("=")[0].toLowerCase();
        const val = o.includes("=") ? o.slice(o.indexOf("=")) : "";
        const a = ALIAS[(neg + bas)] || (ALIAS[bas] ? (neg && ALIAS[bas].startsWith("~") ? ALIAS[bas].slice(1) : neg + ALIAS[bas]) : null);
        return a ? a + val : o;
      });
      const baser = opts0.map((o) => o.replace(/^~/, "").split("=")[0].toLowerCase());
      if (baser.includes("badfilter")) continue;
      const host = hostAv(d.monster);
      // Undantag från kosmetiken på en sajt ($elemhide gäller även sajtens egna dölj-regler, som vi inte
      // kan stänga av per sajt: då stängs åtminstone de allmänna av)
      if ((baser.includes("generichide") || baser.includes("elemhide")) && d.undantag) {
        if (host) genericHideUndantag.add(host);
        const dom = opts0.find((o) => o.toLowerCase().startsWith("domain="));
        if (!host && !d.monster.replace(/^\*$/, "") && dom) for (const h of domanLista(dom.slice(7), "|").pos) genericHideUndantag.add(h);
        continue;
      }
      const ogiltig = baser.find((b) => HOPPA.test(b));
      if (ogiltig) { hopp("alternativ: " + ogiltig); continue; }
      // example.* (alla toppdomäner) går inte att uttrycka i DNR
      if (/^\|\|[a-z0-9.-]*\.\*(?=[\^\/*|]|$)/i.test(d.monster)) { hopp("entitet: example.*"); continue; }

      // Alternativ som läggs på efter omvandlingen eller ändrar vad regeln gör
      let viktig = false, red = null, redRegel = false, param = null, till = null, neka = null, fel = null;
      const opts = [];
      for (const o of opts0) {
        const eq = o.indexOf("=");
        const nyck = (eq < 0 ? o : o.slice(0, eq)).toLowerCase();
        const v = eq < 0 ? "" : o.slice(eq + 1);
        if (nyck === "important") viktig = true;
        else if (nyck === "redirect" || nyck === "redirect-rule") { red = v; redRegel = nyck === "redirect-rule"; }
        else if (nyck === "empty" || nyck === "mp4") red = nyck; // uBO: $empty = tomt svar, $mp4 = tom video
        else if (nyck === "removeparam") param = v;
        else if (nyck === "reason") continue; // bara en text till uBO:s stoppsida
        else if (nyck === "to") {
          till = domanLista(v, "|");
          if (till.ent && !till.pos.length) fel = "entitet: to=";
        } else if (nyck === "denyallow") {
          const x = domanLista(v, "|");
          if (x.ent || x.neg.length) fel = "entitet: denyallow=";
          neka = x.pos;
        } else if (nyck === "domain") {
          const x = domanLista(v, "|");
          if (x.ent && !x.pos.length) fel = "entitet: domain=";
          else if (!x.pos.length && !x.neg.length) fel = "tom domain=";
          else opts.push("domain=" + [...x.pos, ...x.neg.map((h) => "~" + h)].join("|"));
        } else opts.push(o);
      }
      if (fel) { hopp(fel); continue; }

      // @@…$redirect / $redirect-rule: omdirigera inte dit (blockeringen gäller som vanligt)
      if (red !== null && d.undantag) {
        const dom = opts.find((o) => o.startsWith("domain="));
        const x = dom ? domanLista(dom.slice(7), "|") : { pos: [] };
        omdirUndantag.push({ vard: vardAnkare(d.monster), stub: red ? STUBBAR[red.replace(/:\d+$/, "")] || "?" : null, pos: x.pos });
        continue;
      }
      // $redirect: byt resursen mot en stubbe (görs efter genomgången, när undantagen är kända)
      if (red !== null) {
        const namnet = red.replace(/:\d+$/, "");
        const stub = STUBBAR[namnet];
        if (!stub) { saknadeStubbar[namnet] = (saknadeStubbar[namnet] || 0) + 1; hopp("redirect: resurs vi inte har"); continue; }
        omdir.push({ namn, monster: d.monster, opts, stub, regel: redRegel, viktig, till, neka, vard: vardAnkare(d.monster) });
        continue;
      }
      // $removeparam=namn: ta bort parametern ur adressen (eget regelpaket)
      if (param !== null) {
        if (d.undantag) { hopp("@@removeparam"); continue; }
        if (!/^[\w.\-\[\]%]+$/.test(param)) { hopp("removeparam: tomt, mönster eller regex"); continue; }
        const ut = await omvandla(d.monster + (opts.length ? "$" + opts.join(",") : ""));
        for (const r of ut || []) {
          if (r.action.type !== "block") continue;
          const c = r.condition;
          if (!c.resourceTypes) c.resourceTypes = ["main_frame", "sub_frame", "xmlhttprequest"].filter((t) => !(c.excludedResourceTypes || []).includes(t));
          delete c.excludedResourceTypes;
          begransaMal(r, till, neka);
          r.action = { type: "redirect", redirect: { transform: { queryTransform: { removeParams: [param] } } } };
          regelPaket[PARAMETRAR].push(r);
          stat.parametrar++;
        }
        continue;
      }

      // $popup: popup-fönster stängs av bakgrundsskriptet
      let o2 = opts;
      if (o2.includes("popup")) {
        if (!d.undantag && host && o2.length === 1) { popupHosts.add(host); continue; }
        o2 = o2.filter((o) => o !== "popup");
        if (!o2.length || d.undantag) { hopp("popup"); continue; }
      }
      // $document / $all på en värd: blockera hela sidan (farlig sajt / omdirigering)
      const dok = o2.includes("document"), alla = o2.includes("all");
      if (!d.undantag && host && (dok || alla) && o2.every((o) => /^(document|all|~?third-party|domain=.*)$/.test(o))) {
        farligaHosts.add(host);
        if (dok && !alla) continue;
        o2 = o2.filter((o) => o !== "all");
      } else if (!d.undantag && (dok || alla)) {
        // $document på ett adressmönster: stoppsidan för sidor (inte delresurser) vars adress matchar.
        // domain= gäller då sidan själv. $all blockerar dessutom allt annat från adressen.
        const utan = o2.filter((o) => o !== "document" && o !== "all");
        const ut = await omvandla(d.monster + (utan.length ? "$" + utan.join(",") : ""));
        if (!ut) continue;
        for (const r of ut) {
          if (r.action.type !== "block") continue;
          const { resourceTypes, excludedResourceTypes, initiatorDomains, excludedInitiatorDomains, ...c } = r.condition;
          if (resourceTypes || excludedResourceTypes || c.requestDomains) continue;
          if (initiatorDomains) c.requestDomains = initiatorDomains;
          if (excludedInitiatorDomains) c.excludedRequestDomains = excludedInitiatorDomains;
          const s = { priority: viktig ? PRIO.viktig + PRIO.omdirigering : PRIO.stoppsida, action: STOPPSIDA, condition: { ...c, resourceTypes: ["main_frame"] } };
          begransaMal(s, till, neka);
          regler.push(s);
          stat.stoppsidor++;
        }
        if (!alla) continue;
        o2 = utan;
      }
      if (!d.undantag && host && !o2.length) annonsHosts.add(host);
      if (!d.undantag && host && !o2.some((o) => o.startsWith("domain="))) blockeradeVardar.add(host);
      if (d.undantag && host) undantagsHosts.add(host);

      const text = (d.undantag ? "@@" : "") + d.monster + (o2.length ? "$" + o2.join(",") : "");
      const ut = await omvandla(text);
      if (!ut) continue;
      if (ut.length) stat.filter++;
      for (const r of ut) {
        begransaMal(r, till, neka);
        if (viktig && r.action.type === "block") r.priority = PRIO.viktig;
        if (r.action.type === "allow") r.priority += PRIO.tillat;
        regler.push(r);
      }
    }
  }

  // $redirect och $redirect-rule -> omdirigering till en stubbe i tillägget. redirect-rule betyder
  // "bara om förfrågan ändå blockeras": DNR kan inte villkora en regel på en annan, så de används bara
  // när adressens värd blockeras av listorna.
  const blockerad = (h) => suffixer(h).some((x) => annonsHosts.has(x) || blockeradeVardar.has(x));
  for (const o of omdir) {
    if (o.regel && !(o.vard && blockerad(o.vard))) { hopp("redirect-rule: blockeras inte annars"); continue; }
    let utom = [], bort = false;
    for (const u of omdirUndantag) {
      if (u.stub && u.stub !== o.stub) continue;
      if (u.vard && !(o.vard && (o.vard === u.vard || o.vard.endsWith("." + u.vard)))) continue;
      if (!u.pos.length) { bort = true; break; }
      utom.push(...u.pos);
    }
    if (bort) { hopp("redirect: avstängd av undantag"); continue; }
    const ut = await omvandla(o.monster + (o.opts.length ? "$" + o.opts.join(",") : ""));
    for (const r of ut || []) {
      if (r.action.type !== "block") continue;
      const c = r.condition;
      const typer = (c.resourceTypes || STUBBTYP[o.stub.split(".").pop()].filter((t) => !(c.excludedResourceTypes || []).includes(t))).filter((t) => t !== "main_frame");
      if (!typer.length) continue;
      c.resourceTypes = typer;
      delete c.excludedResourceTypes;
      if (utom.length) c.excludedInitiatorDomains = [...new Set([...(c.excludedInitiatorDomains || []), ...utom])];
      begransaMal(r, o.till, o.neka);
      r.priority = (o.viktig ? PRIO.viktig : r.priority) + PRIO.omdirigering;
      r.action = { type: "redirect", redirect: { extensionPath: "/stubbar/" + o.stub } };
      regelPaket[o.namn].push(r);
      stat.omdirigeringar++;
    }
  }

  // Slå ihop "||host^"-regler med samma villkor till en regel med requestDomains (sparar regelutrymme)
  for (const [namn, regler] of Object.entries(regelPaket)) {
    const grupper = new Map(); const ovriga = [];
    for (const r of regler) {
      const c = r.condition; const h = c.urlFilter && hostAv(c.urlFilter);
      if (h && !c.requestDomains) {
        const { urlFilter, ...restC } = c;
        const nyckel = JSON.stringify([r.priority, r.action, restC]);
        if (!grupper.has(nyckel)) grupper.set(nyckel, { r, hosts: new Set() });
        grupper.get(nyckel).hosts.add(h);
      } else ovriga.push(r);
    }
    const ihop = [];
    for (const { r, hosts } of grupper.values()) {
      const lista = [...hosts].sort();
      if (lista.length === 1) { ihop.push(r); continue; }
      for (let i = 0; i < lista.length; i += 5000) {
        const { urlFilter, ...restC } = r.condition;
        ihop.push({ priority: r.priority, action: r.action, condition: { ...restC, requestDomains: lista.slice(i, i + 5000) } });
      }
    }
    regelPaket[namn] = [...ihop, ...ovriga];
  }

  // Säkerhetspaketet: stoppa sidor/omdirigeringar till farliga sajter och popup-nätverk,
  // och omdirigeringar av hela fliken som startas av en annonsdomän
  const sakra = [...new Set([...farligaHosts, ...popupHosts])].sort();
  for (let i = 0; i < sakra.length; i += 5000) {
    regelPaket.security.push({ priority: PRIO.farlig, action: STOPPSIDA, condition: { requestDomains: sakra.slice(i, i + 5000), resourceTypes: ["main_frame"] } });
    regelPaket.security.push({ priority: PRIO.farlig, action: { type: "block" }, condition: { requestDomains: sakra.slice(i, i + 5000), resourceTypes: ["sub_frame"] } });
  }
  // Länkförkortare och värdar med undantagsregler får aldrig räknas som "annons som skickar vidare fliken"
  // (även annonsfinansierade förkortare: deras slutsteg går till vilken sajt som helst)
  const ALDRIG = new Set(["t.co", "bit.ly", "goo.gl", "lnkd.in", "ow.ly", "buff.ly", "tinyurl.com", "is.gd", "fb.me", "youtu.be", "amzn.to", "linktr.ee",
    "linkvertise.com", "adf.ly", "adshrink.it"]);
  const initiators = [...new Set([...popupHosts, ...annonsHosts])].filter((h) => !ALDRIG.has(h) && !undantagsHosts.has(h)).sort();
  for (let i = 0; i < initiators.length; i += 5000) {
    regelPaket.security.push({ priority: PRIO.farlig, action: STOPPSIDA, condition: { initiatorDomains: initiators.slice(i, i + 5000), resourceTypes: ["main_frame"], domainType: "thirdParty" } });
  }

  // Chrome tillåter högst 1000 regex-regler i alla påslagna regelpaket tillsammans (inte per paket):
  // säkerhet först, sedan reklam, spårare och parametrar
  let regex = 0;
  for (const namn of ["security", "ads", "privacy", PARAMETRAR]) {
    regelPaket[namn] = regelPaket[namn].filter((r) => {
      if (!r.condition.regexFilter) return true;
      if (++regex > 1000) { hopp("regex över Chromes gräns"); return false; }
      return true;
    });
  }

  // Kakrutor: egen kosmetik som kan stängas av per sajt (nätverksreglerna i listan används inte,
  // de stoppar hela samtyckesskript och kan få sajter att sluta fungera)
  const kakKos = { generic: new Set(), specific: new Map(), undantag: new Map(), stilar: new Map() };
  const ingaSkript = nySkriptSamling();
  for (const line of lasLista("easylist-cookie.txt")) {
    if (line && !line.startsWith("!")) kosmetikRad(line, kakKos, ingaSkript);
  }

  // Validera CSS-selektorer (och :style-regler) i riktiga Chromium så att en trasig selektor inte förstör resten
  const allaSel = new Set();
  const allaStilar = new Map();
  for (const k of [kosmetik, kakKos]) {
    for (const x of k.generic) allaSel.add(x);
    for (const s of k.specific.values()) for (const x of s) allaSel.add(x);
    for (const s of k.stilar.values()) for (const [nyckel, par] of s) allaStilar.set(nyckel, par);
  }
  const { giltiga, giltigaStilar } = await validera([...allaSel], [...allaStilar]);
  const fil = (set) => [...set].filter((s) => giltiga.has(s));
  const paketera = (k, extra) => {
    const ut = { generic: fil(k.generic), specific: {}, exceptions: {}, ...extra };
    for (const [dm, s] of k.specific) { const f = fil(s); if (f.length) ut.specific[dm] = f; }
    for (const [dm, s] of k.undantag) ut.exceptions[dm] = [...s];
    const stilar = {};
    for (const [dm, s] of k.stilar) { const f = [...s].filter(([nyckel]) => giltigaStilar.has(nyckel)).map(([, par]) => par); if (f.length) stilar[dm] = f; }
    // [selektor, deklarationer]; undantaget för en sådan regel är "selektor:style(deklarationer)"
    ut.styles = stilar;
    return ut;
  };
  const cos = paketera(kosmetik, { genericHideExceptions: [...genericHideUndantag].sort() });
  const kakor = paketera(kakKos, {});

  fs.mkdirSync(path.join(EXT, "rules"), { recursive: true });
  fs.mkdirSync(path.join(EXT, "data"), { recursive: true });
  // Blockerande regler först, så att tillägget kan räkna stoppade förfrågningar på regel-id (id <= antal i rakna.json).
  // Omdirigeringar till stubbar och stoppsidan räknas som stoppade, omskrivna adresser inte.
  const blockerar = (r) => r.action.type === "block" || (r.action.type === "redirect" && !r.action.redirect.transform);
  const rakna = {};
  let totalt = 0;
  for (const [namn, regler] of Object.entries(regelPaket)) {
    regler.sort((a, b) => blockerar(b) - blockerar(a));
    rakna[namn] = regler.filter(blockerar).length;
    regler.forEach((r, i) => (r.id = i + 1));
    fs.writeFileSync(path.join(EXT, "rules", namn + ".json"), JSON.stringify(regler));
    totalt += regler.length;
    console.log(`${namn}: ${regler.length} regler (${regler.filter((r) => r.condition.regexFilter).length} regex)`);
  }
  // Chrome garanterar 30 000 statiska regler per tillägg (mer bara om det globala utrymmet räcker)
  if (totalt > 30000) throw new Error(`för många regler: ${totalt} (> 30 000)`);
  fs.writeFileSync(path.join(EXT, "data", "cosmetic.json"), JSON.stringify(cos));
  fs.writeFileSync(path.join(EXT, "data", "kakor.json"), JSON.stringify(kakor));
  fs.writeFileSync(path.join(EXT, "data", "rakna.json"), JSON.stringify(rakna));
  fs.writeFileSync(path.join(EXT, "data", "popup-hosts.json"), JSON.stringify(sakra));

  const sl = skrivScriptlets(skript);
  console.log(`totalt: ${totalt} regler (${regex} regex av högst 1000)`);
  console.log(`kosmetik: ${cos.generic.length} generella, ${Object.keys(cos.specific).length} sajter, :style på ${Object.keys(cos.styles).length} sajter (${allaSel.size - giltiga.size} ogiltiga selektorer, ${allaStilar.size - giltigaStilar.size} ogiltiga :style borttagna)`);
  console.log(`kakrutor: ${kakor.generic.length} generella, ${Object.keys(kakor.specific).length} sajter`);
  console.log(`scriptlets: ${sl.poster} st på ${sl.vardar} värdar i ${sl.filer} filer (${Math.round(sl.byte / 1024)} kB)`);
  console.log(`popup/farliga värdar: ${sakra.length}, annonsvärdar: ${annonsHosts.size}`);
  console.log("filter:", JSON.stringify(stat));
  console.log("hoppade:", JSON.stringify(Object.entries(hoppade).sort((a, b) => b[1] - a[1])));
  const topp = (m) => JSON.stringify([...m].sort((a, b) => b[1] - a[1]).slice(0, 12));
  console.log("redirect-resurser vi saknar:", topp(Object.entries(saknadeStubbar)));
  console.log("scriptlets vi saknar:", topp(skript.okanda));
}

// Scriptlets: en fil per scriptlet i extension/scriptlets/, och data/scriptlets.json med vilka värdar
// varje fil ska köras på (background.js registrerar dem bara där)
function skrivScriptlets(skript) {
  const mapp = path.join(EXT, "scriptlets");
  fs.rmSync(mapp, { recursive: true, force: true });
  fs.mkdirSync(mapp, { recursive: true });
  const allaAv = skript.avstangda.has("*");
  const perNamn = new Map();
  for (const [nyckel, p] of [...skript.poster].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (allaAv || skript.avstangda.has(nyckel)) continue;
    if (!perNamn.has(p.namn)) perNamn.set(p.namn, []);
    perNamn.get(p.namn).push([nyckel, p]);
  }
  const sorterat = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, [...new Set(v)].sort((x, y) => x - y)]));
  const register = [];
  const allaVardar = new Set();
  let antal = 0, byte = 0;
  for (const [namn, lista] of [...perNamn].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const poster = [], v = {}, u = {}, index = new Map();
    for (const [nyckel, p] of lista) {
      const i = poster.length;
      poster.push([namn, ...p.args]);
      index.set(nyckel, i);
      for (const h of p.vardar) (v[h] ||= []).push(i);
      for (const h of p.utom) (u[h] ||= []).push(i);
    }
    for (const [h, nycklar] of skript.undantagPerVard) {
      for (const n of nycklar) {
        if (n === "*") (u[h] ||= []).push(-1);
        else if (index.has(n)) (u[h] ||= []).push(index.get(n));
      }
    }
    // Undantag behövs bara på värdar under (eller över) de värdar filen körs på
    const vset = new Set(Object.keys(v));
    const over = new Set([...vset].flatMap(suffixer));
    for (const h of Object.keys(u)) if (!over.has(h) && !suffixer(h).some((x) => vset.has(x))) delete u[h];
    const fil = `scriptlets/${namn}.js`;
    const kod = SL.genereraFil({ namn, poster, vardar: sorterat(v), undantag: sorterat(u) });
    fs.writeFileSync(path.join(EXT, fil), kod);
    register.push({ id: "sl-" + namn, js: fil, vardar: [...vset].sort() });
    for (const h of vset) allaVardar.add(h);
    antal += poster.length;
    byte += kod.length;
  }
  fs.writeFileSync(path.join(EXT, "data", "scriptlets.json"), JSON.stringify(register));
  return { poster: antal, vardar: allaVardar.size, filer: register.length, byte };
}

async function validera(selektorer, stilar) {
  // Testar varje selektor i riktig Chromium. Saknas Playwright/Chromium hoppas kontrollen över.
  const allt = () => ({ giltiga: new Set(selektorer), giltigaStilar: new Set(stilar.map(([n]) => n)) });
  let chromium;
  try { ({ chromium } = require("playwright-core")); } catch {
  }
  if (!chromium) { console.warn("playwright-core saknas: hoppar över selektorkontrollen"); return allt(); }
  let b;
  try { b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); }
  catch (e) { console.warn("kunde inte starta Chromium: hoppar över selektorkontrollen"); return allt(); }
  const p = await b.newPage();
  const [ok, okStil] = await p.evaluate(([lista, stil]) => [
    lista.filter((s) => { try { document.querySelector(s); return true; } catch { return false; } }),
    // :style-regeln måste gå att lägga in som CSS och få minst en giltig deklaration
    stil.filter(([, [sel, decl]]) => {
      try {
        document.querySelector(sel);
        const ark = new CSSStyleSheet();
        ark.insertRule(sel + "{" + decl + "}");
        return ark.cssRules.length === 1 && ark.cssRules[0].style.length > 0;
      } catch { return false; }
    }).map(([n]) => n),
  ], [selektorer, stilar]);
  await b.close();
  return { giltiga: new Set(ok), giltigaStilar: new Set(okStil) };
}

main().catch((e) => { console.error(e); process.exit(1); });
