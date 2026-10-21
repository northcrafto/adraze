#!/usr/bin/env node
// Bygger AdRaze-reglerna: filterlistor -> DNR-regler (nätverk) + kosmetik (CSS) + värdlistor (popups/omdirigeringar)
// Kör: node build.js [--fetch]   (--fetch laddar ner listorna på nytt)
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { convertFilter } = require("@eyeo/abp2dnr");

const LISTS = path.join(__dirname, "lists");
const EXT = path.join(__dirname, "..", "extension");
const KALLOR = {
  "easylist.txt": "https://easylist.to/easylist/easylist.txt",
  "easyprivacy.txt": "https://easylist.to/easylist/easyprivacy.txt",
  "frellwit.txt": "https://raw.githubusercontent.com/lassekongo83/Frellwits-filter-lists/master/Frellwits-Swedish-Filter.txt",
  "badware.txt": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
  "ubo-filters.txt": "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
  "peterlowe.txt": "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext",
  "adguard-popups.txt": "https://filters.adtidy.org/extension/ublock/filters/19.txt",
};

// Vilka listor som går till vilket regelpaket
const PAKET = {
  ads: ["easylist.txt", "ubo-filters.txt", "peterlowe.txt", "frellwit.txt", "adraze-kosmetik.txt", "adraze-natverk.txt"],
  privacy: ["easyprivacy.txt"],
  security: ["badware.txt", "adguard-popups.txt"],
};

// uBO-förkortningar -> ABP-namn som omvandlaren förstår
const ALIAS = {
  "1p": "~third-party", "first-party": "~third-party", "3p": "third-party", "~1p": "third-party", "~3p": "~third-party",
  xhr: "xmlhttprequest", frame: "subdocument", css: "stylesheet", doc: "document", "~doc": "~document",
  from: "domain", ghide: "generichide", shide: "specifichide", ehide: "elemhide",
  "strict3p": "third-party", "strict1p": "~third-party",
};
// Alternativ vi inte kan göra som DNR-regel: hoppa över hela filtret
const HOPPA = /^(redirect|redirect-rule|removeparam|queryprune|replace|header|permissions|urltransform|uritransform|cname|ipaddress|reason|to|method|empty|mp4|inline-script|inline-font|specifichide|elemhide|genericblock|content|stealth|urlblock|jsinject|extension|app|network|cookie|hls|jsonprune|xmlprune|referrerpolicy)$/;

// Hela fliken skickas till vår stoppsida i stället för Chromes felsida
const STOPPSIDA = { type: "redirect", redirect: { extensionPath: "/blocked/blocked.html" } };
const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function delaFilter(line) {
  // Regex-filter: /.../$opts
  let m = line.match(/^(@@)?(\/.*\/)(?:\$([^/]*))?$/);
  if (m) return { undantag: !!m[1], monster: m[2], opts: m[3] ? m[3].split(",") : [] };
  const undantag = line.startsWith("@@");
  const rest = undantag ? line.slice(2) : line;
  const i = rest.lastIndexOf("$");
  if (i > 0 && !/[\/]/.test(rest.slice(i + 1).replace(/domain=[^,]*/g, "")) ) {
    return { undantag, monster: rest.slice(0, i), opts: rest.slice(i + 1).split(",").filter(Boolean) };
  }
  return { undantag, monster: rest, opts: [] };
}

function hostAv(monster) {
  const m = monster.match(/^\|\|([a-z0-9.-]+)\^?\|?$/i);
  return m && VALID_HOST.test(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}

async function main() {
  fs.mkdirSync(LISTS, { recursive: true });
  if (process.argv.includes("--fetch")) {
    for (const [fil, url] of Object.entries(KALLOR)) {
      execSync(`curl -sfL --max-time 90 -o ${JSON.stringify(path.join(LISTS, fil))} ${JSON.stringify(url)}`);
      console.log("hämtade", fil);
    }
  }

  const kosmetik = { generic: new Set(), specific: new Map(), undantag: new Map() };
  const genericHideUndantag = new Set();
  const popupHosts = new Set();
  const farligaHosts = new Set();
  const annonsHosts = new Set();
  const undantagsHosts = new Set();
  const badfilters = new Set();
  const stat = { natverk: 0, fel: 0, hoppade: 0, kosmetik: 0 };
  const rader = {};

  for (const [namn, filer] of Object.entries(PAKET)) {
    rader[namn] = [];
    for (const fil of filer) {
      for (let line of fs.readFileSync(path.join(LISTS, fil), "utf8").split(/\r?\n/)) {
        line = line.trim();
        if (!line || line.startsWith("!") || line.startsWith("[") || line.startsWith("#") && !line.startsWith("##")) continue;
        if (line.startsWith("!#")) continue;
        rader[namn].push(line);
        const d = line.includes("$") && !line.includes("#") ? delaFilter(line) : null;
        if (d && d.opts.includes("badfilter")) badfilters.add(line.replace(/,?badfilter/, "").replace(/\$$/, ""));
      }
    }
  }

  const regelPaket = {};
  for (const [namn, lista] of Object.entries(rader)) {
    const regler = [];
    for (const line of lista) {
      if (badfilters.has(line)) continue;

      // --- Kosmetik ---
      const km = line.match(/^([^#]*)(#@?#)(.+)$/);
      if (km && !line.startsWith("/")) {
        const [, doms, sep, sel] = km;
        if (/^\+js|^\^|:-abp-|:has-text|:upward|:matches-|:xpath|:remove|:style|:watch-attr|:min-text|:others|:matches-path|:if\(|:if-not|:contains/.test(sel)) { stat.hoppade++; continue; }
        if (/#\?#|#\$#|#%#/.test(line)) { stat.hoppade++; continue; }
        const domaner = doms ? doms.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
        if (sep === "#@#") {
          for (const dm of domaner) { if (!kosmetik.undantag.has(dm)) kosmetik.undantag.set(dm, new Set()); kosmetik.undantag.get(dm).add(sel); }
          continue;
        }
        const pos = domaner.filter((x) => !x.startsWith("~") && !x.includes("*"));
        if (!domaner.length) kosmetik.generic.add(sel);
        else for (const dm of pos) { if (!kosmetik.specific.has(dm)) kosmetik.specific.set(dm, new Set()); kosmetik.specific.get(dm).add(sel); }
        stat.kosmetik++;
        continue;
      }
      if (line.includes("#@$#") || line.includes("#$?#") || line.includes("#@?#")) continue;

      // --- Nätverk ---
      const d = delaFilter(line);
      let opts = d.opts.map((o) => {
        const neg = o.startsWith("~") ? "~" : "";
        const bas = o.replace(/^~/, "").split("=")[0].toLowerCase();
        const val = o.includes("=") ? o.slice(o.indexOf("=")) : "";
        const a = ALIAS[(neg + bas)] || (ALIAS[bas] ? (neg && ALIAS[bas].startsWith("~") ? ALIAS[bas].slice(1) : neg + ALIAS[bas]) : null);
        return a ? a + val : o;
      });
      const baser = opts.map((o) => o.replace(/^~/, "").split("=")[0].toLowerCase());
      if (baser.includes("badfilter")) continue;
      if (baser.includes("generichide") && d.undantag) {
        const h = hostAv(d.monster); if (h) genericHideUndantag.add(h); continue;
      }
      if (baser.some((b) => HOPPA.test(b))) { stat.hoppade++; continue; }

      const host = hostAv(d.monster);
      const viktig = baser.includes("important");
      opts = opts.filter((o) => o !== "important");

      // $popup: popup-fönster stängs av bakgrundsskriptet
      if (baser.includes("popup")) {
        if (!d.undantag && host && opts.length === 1) { popupHosts.add(host); continue; }
        opts = opts.filter((o) => o !== "popup");
        if (!opts.length || d.undantag) { stat.hoppade++; continue; }
      }
      // $document / $all: blockera hela sidan (farlig sajt / omdirigering)
      if (!d.undantag && host && (baser.includes("document") || baser.includes("all")) && opts.every((o) => /^(document|all|~?third-party|domain=.*)$/.test(o))) {
        farligaHosts.add(host);
        if (baser.includes("document") && !baser.includes("all")) continue;
        opts = opts.filter((o) => o !== "all");
      }
      if (!d.undantag && host && !opts.length) annonsHosts.add(host);
      if (d.undantag && host) undantagsHosts.add(host);

      const text = (d.undantag ? "@@" : "") + d.monster + (opts.length ? "$" + opts.join(",") : "");
      try {
        const ut = await convertFilter(text);
        for (const r of ut) { if (viktig && r.action.type === "block") r.priority += 500; regler.push(r); }
        stat.natverk += ut.length;
      } catch { stat.fel++; }
    }
    regelPaket[namn] = regler;
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
    // Max 1000 regex-regler per paket
    let regex = 0; const slut = [];
    for (const r of [...ihop, ...ovriga]) { if (r.condition.regexFilter && ++regex > 1000) continue; slut.push(r); }
    regelPaket[namn] = slut;
  }

  // Säkerhetspaketet: stoppa sidor/omdirigeringar till farliga sajter och popup-nätverk,
  // och omdirigeringar av hela fliken som startas av en annonsdomän
  const sakra = [...new Set([...farligaHosts, ...popupHosts])].sort();
  for (let i = 0; i < sakra.length; i += 5000) {
    regelPaket.security.push({ priority: 3000, action: STOPPSIDA, condition: { requestDomains: sakra.slice(i, i + 5000), resourceTypes: ["main_frame"] } });
    regelPaket.security.push({ priority: 3000, action: { type: "block" }, condition: { requestDomains: sakra.slice(i, i + 5000), resourceTypes: ["sub_frame"] } });
  }
  // Länkförkortare och värdar med undantagsregler får aldrig räknas som "annons som skickar vidare fliken"
  // (även annonsfinansierade förkortare: deras slutsteg går till vilken sajt som helst)
  const ALDRIG = new Set(["t.co", "bit.ly", "goo.gl", "lnkd.in", "ow.ly", "buff.ly", "tinyurl.com", "is.gd", "fb.me", "youtu.be", "amzn.to", "linktr.ee",
    "linkvertise.com", "adf.ly", "adshrink.it"]);
  const initiators = [...new Set([...popupHosts, ...annonsHosts])].filter((h) => !ALDRIG.has(h) && !undantagsHosts.has(h)).sort();
  for (let i = 0; i < initiators.length; i += 5000) {
    regelPaket.security.push({ priority: 3000, action: STOPPSIDA, condition: { initiatorDomains: initiators.slice(i, i + 5000), resourceTypes: ["main_frame"], domainType: "thirdParty" } });
  }

  // Validera CSS-selektorer i riktiga Chromium så att en trasig selektor inte förstör resten
  const allaSel = new Set(kosmetik.generic);
  for (const s of kosmetik.specific.values()) for (const x of s) allaSel.add(x);
  const giltiga = await validera([...allaSel]);
  const fil = (set) => [...set].filter((s) => giltiga.has(s));

  const cos = { generic: fil(kosmetik.generic), specific: {}, exceptions: {}, genericHideExceptions: [...genericHideUndantag].sort() };
  for (const [dm, s] of kosmetik.specific) { const f = fil(s); if (f.length) cos.specific[dm] = f; }
  for (const [dm, s] of kosmetik.undantag) cos.exceptions[dm] = [...s];

  fs.mkdirSync(path.join(EXT, "rules"), { recursive: true });
  fs.mkdirSync(path.join(EXT, "data"), { recursive: true });
  // Blockerande regler först, så att tillägget kan räkna stoppade förfrågningar på regel-id (id <= antal i rakna.json)
  const blockerar = (r) => r.action.type === "block" || r.action.type === "redirect";
  const rakna = {};
  for (const [namn, regler] of Object.entries(regelPaket)) {
    regler.sort((a, b) => blockerar(b) - blockerar(a));
    rakna[namn] = regler.filter(blockerar).length;
    regler.forEach((r, i) => (r.id = i + 1));
    fs.writeFileSync(path.join(EXT, "rules", namn + ".json"), JSON.stringify(regler));
    console.log(`${namn}: ${regler.length} regler`);
  }
  fs.writeFileSync(path.join(EXT, "data", "cosmetic.json"), JSON.stringify(cos));
  fs.writeFileSync(path.join(EXT, "data", "rakna.json"), JSON.stringify(rakna));
  fs.writeFileSync(path.join(EXT, "data", "popup-hosts.json"), JSON.stringify(sakra));
  console.log(`kosmetik: ${cos.generic.length} generella, ${Object.keys(cos.specific).length} sajter (${allaSel.size - giltiga.size} ogiltiga borttagna)`);
  console.log(`popup/farliga värdar: ${sakra.length}, annonsvärdar: ${annonsHosts.size}`);
  console.log(stat);
}

async function validera(selektorer) {
  // Testar varje selektor i riktig Chromium. Saknas Playwright/Chromium hoppas kontrollen över.
  let chromium;
  try { ({ chromium } = require("playwright-core")); } catch {
  }
  if (!chromium) { console.warn("playwright-core saknas: hoppar över selektorkontrollen"); return new Set(selektorer); }
  let b;
  try { b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); }
  catch (e) { console.warn("kunde inte starta Chromium: hoppar över selektorkontrollen"); return new Set(selektorer); }
  const p = await b.newPage();
  const ok = await p.evaluate((lista) => lista.filter((s) => { try { document.querySelector(s); return true; } catch { return false; } }), selektorer);
  await b.close();
  return new Set(ok);
}

main().catch((e) => { console.error(e); process.exit(1); });
