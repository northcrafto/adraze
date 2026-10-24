'use strict';
/* AdRaze-blockeraren i webbläsaren.
 *
 * Samma regler och skript som AdRaze-tillägget (adraze/, synkas med tools/sync-adraze.sh):
 *   - rules/*.json är Chromes declarativeNetRequest-regler. Electron kör inte DNR, så de matchas
 *     här i huvudprocessen (webRequest) med samma företräde som Chrome: högst prioritet vinner,
 *     allow vinner vid lika.
 *   - data/cosmetic.json och data/kakor.json blir CSS som adraze-preload.js lägger in i varje ram.
 *   - content/*.js körs i sidan av adraze-preload.js, med ett litet chrome.runtime-skal som
 *     svarar via IPC i stället för tilläggets bakgrundsskript. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AdblockMotor } = require('./adblock-motor');   // vår egen C++-nätverksmotor
const redirektResurser = require('./adblock-redirects');   // ofarliga stub-resurser för $redirect
const dnsP = require('dns').promises;                      // CNAME-avmaskering
let electron = null; try { electron = require('electron'); } catch {}

const RES_SCHEME = 'adraze-res';
function registerScheme() {
  try { electron.protocol.registerSchemesAsPrivileged([{ scheme: RES_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }]); } catch {}
}

const KATEGORI = { ads: 'ad', privacy: 'tracker', security: 'danger' };
const TYPE_MAP = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image',
  font: 'font', object: 'object', xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media',
  webSocket: 'websocket', other: 'other',
};

// ---------- DNR-matchning ----------
function dnrRegex(f, skiftlage) {
  // DNR-syntax: ||värd, | ankare, * jokertecken, ^ avgränsare
  let r = '';
  let i = 0;
  if (f.startsWith('||')) { r = '^[a-z]+:\\/\\/([^/]*\\.)?'; i = 2; } else if (f.startsWith('|')) { r = '^'; i = 1; }
  const slut = f.endsWith('|') && !f.endsWith('||');
  const kropp = f.slice(i, slut ? -1 : undefined);
  for (const c of kropp) r += c === '*' ? '.*' : c === '^' ? '(?:[^\\w.%-]|$)' : c.replace(/[.+?${}()|[\]\\/]/g, '\\$&');
  if (slut) r += '$';
  try { return new RegExp(r, skiftlage ? '' : 'i'); } catch { return null; }
}
const VARD_RE = /^\|\|([a-z0-9.-]+)(\^|\/|$)/i;
const ORD_RE = /[a-z0-9%]{2,}/g;
// Längsta ordet i ett urlFilter som säkert är ett helt ord i adressen (inte intill * eller en öppen kant)
function basstaOrd(f, skiftlage) {
  const borjan = f.startsWith('|');
  const kropp = f.replace(/^\|\|?/, '');
  const slutAnkrat = /[|^]$/.test(kropp);
  const t = kropp.replace(/\|$/, '');
  let bast = '';
  const re = /[a-zA-Z0-9%]+/g; let m;
  while ((m = re.exec(t))) {
    const fore = t[m.index - 1], efter = t[m.index + m[0].length];
    if (fore === '*' || efter === '*') continue;
    if (fore === undefined && !borjan) continue;
    if (efter === undefined && !slutAnkrat) continue;
    if (m[0].length < 3 || (skiftlage && m[0] !== m[0].toLowerCase())) continue;
    if (m[0].length > bast.length) bast = m[0];
  }
  return bast.toLowerCase();
}
// a.b.example.se -> ["a.b.example.se", "b.example.se", "example.se"]
function suffix(host) {
  const delar = String(host || '').split('.');
  const ut = [];
  for (let i = 0; i < delar.length - 1; i++) ut.push(delar.slice(i).join('.'));
  return ut;
}
// Domänlistorna görs om till Set när reglerna laddas (somliga har tusentals domäner)
const ingarI = (host, set) => suffix(host).some((h) => set.has(h)) || set.has(host);
// Grov registrerbar domän, räcker för första-/tredjepartskoll
function bas(host) {
  const d = String(host || '').split('.');
  return d.length > 2 && /^(co|com|org|net|gov|ac|edu)$/.test(d[d.length - 2]) && d[d.length - 1].length === 2 ? d.slice(-3).join('.') : d.slice(-2).join('.');
}
function hostAv(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } }

function passar(regel, f) {
  const c = regel.c;
  if (c.resourceTypes ? !c.resourceTypes.includes(f.typ) : f.typ === 'main_frame') return false;   // DNR: utan resourceTypes gäller allt utom main_frame
  if (c.excludedResourceTypes && c.excludedResourceTypes.includes(f.typ)) return false;
  if (c.domainType === 'thirdParty' && !f.tredje) return false;
  if (c.domainType === 'firstParty' && f.tredje) return false;
  if (c.initiatorDomains && !ingarI(f.fran, c.initiatorDomains)) return false;
  if (c.excludedInitiatorDomains && ingarI(f.fran, c.excludedInitiatorDomains)) return false;
  if (c.excludedRequestDomains && ingarI(f.host, c.excludedRequestDomains)) return false;
  if (regel.kollaDomaner && c.requestDomains && !ingarI(f.host, c.requestDomains)) return false;
  if (regel.re && !regel.re.test(f.url)) return false;
  return true;
}

class AdrazeAdblock {
  constructor(opts) {
    this.dir = opts.dir;
    this.preloadPath = opts.preloadPath;
    this.allowHost = opts.allowHost || (() => false);
    this.onBlocked = opts.onBlocked || (() => {});
    this.onCount = opts.onCount || (() => {});
    this.isOn = opts.isOn || (() => true);
    this.sessions = new Set();
    this.index = null;
    this.ready = null;
    this.version = 'AdRaze ' + (this.read('VERSION') || '').trim();
    this.fortsatt = new Set();     // värdar man valt att öppna ändå från varningen (den här sessionen)
    this.stubs = new Map();
    this.cnameCache = new Map();   // värd → { mal: cname-mål|null, tid }
    this.cnameInflight = new Map();// pågående CNAME-uppslag (undvik dubbla)
    this.lockbete = 'data-' + crypto.randomUUID().slice(0, 8);
  }
  read(rel) { try { return fs.readFileSync(path.join(this.dir, rel), 'utf8'); } catch { return null; } }
  json(rel, fallback) { try { return JSON.parse(this.read(rel)); } catch { return fallback; } }

  load() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await new Promise((r) => setImmediate(r));
      const t0 = Date.now();
      const index = { domaner: new Map(), perVard: new Map(), perOrd: new Map(), allmanna: [], helaRamen: [], rubriker: [] };
      let n = 0;
      for (const [fil, kat] of Object.entries(KATEGORI)) {
        for (const r of this.json('rules/' + fil + '.json', [])) {
          const typ = r.action.type;
          const c = r.condition || {};
          for (const k of ['initiatorDomains', 'excludedInitiatorDomains', 'excludedRequestDomains']) if (c[k]) c[k] = new Set(c[k]);
          const regel = { kat, typ, prio: r.priority || 1, c, action: r.action };
          if (c.urlFilter) regel.re = dnrRegex(c.urlFilter, c.isUrlFilterCaseSensitive);
          else if (c.regexFilter) { try { regel.re = new RegExp(c.regexFilter, c.isUrlFilterCaseSensitive ? '' : 'i'); } catch { continue; } }
          n++;
          if (typ === 'allowAllRequests' || typ === 'modifyHeaders') {
            if (c.requestDomains) { c.requestDomains = new Set(c.requestDomains); regel.kollaDomaner = true; }
            index[typ === 'modifyHeaders' ? 'rubriker' : 'helaRamen'].push(regel);
            continue;
          }
          if (c.requestDomains) {
            for (const d of c.requestDomains) { if (!index.domaner.has(d)) index.domaner.set(d, []); index.domaner.get(d).push(regel); }
            continue;
          }
          const m = c.urlFilter && VARD_RE.exec(c.urlFilter);
          if (m) { const v = m[1].toLowerCase(); if (!index.perVard.has(v)) index.perVard.set(v, []); index.perVard.get(v).push(regel); continue; }
          // Övriga indexeras på ett helt ord ur mönstret, så bara regler vars ord finns i adressen provas
          const ord = !c.regexFilter && c.urlFilter && basstaOrd(c.urlFilter, c.isUrlFilterCaseSensitive);
          if (ord) { if (!index.perOrd.has(ord)) index.perOrd.set(ord, []); index.perOrd.get(ord).push(regel); } else index.allmanna.push(regel);
        }
      }
      this.index = index;
      // Vår C++-motor tar nätverksblockeringen (full filtersyntax, 7× fler regler). JS-indexet
      // ovan sköter fortfarande farliga sidor (security), omdirigeringar och CSP-rubriker.
      try {
        const cacheFil = (electron && electron.app) ? path.join(electron.app.getPath('userData'), 'adblock-cache.bin') : null;
        this.motor = new AdblockMotor(path.join(this.dir, 'lists'), cacheFil);
        if (!this.motor.bygg()) this.motor = null;
      } catch (e) { this.motor = null; console.warn('[adraze] motor:', String(e)); }
      this.popupHosts = new Set(this.json('data/popup-hosts.json', []));
      this.kos = this.json('data/cosmetic.json', { generic: [], specific: {}, exceptions: {}, genericHideExceptions: [] });
      this.kos.genericHide = new Set(this.kos.genericHideExceptions || []);
      this.genericCss = cssAv(this.kos.generic);
      this.kak = this.json('data/kakor.json', { generic: [], specific: {}, exceptions: {} });
      this.kakGenericCss = cssAv(this.kak.generic);
      this.skript = {};
      for (const s of ['cosmetic', 'kakor', 'guard', 'youtube']) this.skript[s] = this.read('content/' + s + '.js') || '';
      console.log('[adraze] ' + n + ' regler laddade på ' + (Date.now() - t0) + ' ms');
      for (const s of this.sessions) if (this.isOn()) this.enableOn(s);
      return true;
    })();
    return this.ready;
  }

  /* Bästa regeln för en förfrågan: { typ: 'block'|'redirect'|'allow', kat, action } eller null */
  match(f) {
    const ix = this.index; if (!ix) return null;
    let vinnare = null, tillat = 0;
    const prova = (r) => {
      if (!passar(r, f)) return;
      if (r.typ === 'allow') tillat = Math.max(tillat, r.prio);
      else if (!vinnare || r.prio > vinnare.prio) vinnare = r;
    };
    for (const v of suffix(f.host)) {
      for (const r of ix.domaner.get(v) || []) prova(r);
      for (const r of ix.perVard.get(v) || []) prova(r);
    }
    for (const r of ix.allmanna) prova(r);
    const sett = new Set();
    for (const o of f.url.toLowerCase().match(ORD_RE) || []) {
      if (sett.has(o)) continue; sett.add(o);
      const rs = ix.perOrd.get(o); if (rs) for (const r of rs) prova(r);
    }
    // allowAllRequests på sidan (eller ramen) som gör förfrågan släpper igenom allt i den
    if (f.dokument) {
      const d = { url: f.dokument, host: hostAv(f.dokument), typ: 'main_frame', tredje: false, fran: '' };
      for (const r of ix.helaRamen) if (passar(r, d) || passar(r, { ...d, typ: 'sub_frame' })) tillat = Math.max(tillat, r.prio);
    }
    if (!vinnare || vinnare.prio <= tillat) return null;
    return vinnare;
  }
  fraga(url, typ, kalla) {
    const host = hostAv(url);
    const fran = hostAv(kalla) || host;
    return { url, host, typ, fran, tredje: bas(host) !== bas(fran), dokument: kalla };
  }

  /* Ska en navigering/popup dödas? (main_frame-regler + AdRazes popup-värdar) */
  checkTarget(url, sourceUrl) {
    if (!this.index || !this.isOn()) return false;
    const host = hostAv(url);
    if (this.fortsatt.has(host)) return false;
    if (suffix(host).some((h) => this.popupHosts.has(h))) return true;
    const r = this.match(this.fraga(url, 'main_frame', sourceUrl || ''));
    return !!r;
  }

  // ---------- kosmetik ----------
  cssFor(host) {
    const k = this.kos; if (!k || !this.isOn()) return '';
    const nivaer = suffix(host);
    const undantag = new Set();
    for (const n of nivaer) for (const s of k.exceptions[n] || []) undantag.add(s);
    const specifika = [];
    for (const n of nivaer) for (const s of k.specific[n] || []) if (!undantag.has(s)) specifika.push(s);
    const utanGeneric = nivaer.some((n) => k.genericHide.has(n));
    let css = specifika.length ? cssAv(specifika) : '';
    if (!utanGeneric) css += undantag.size ? cssAv(k.generic.filter((s) => !undantag.has(s))) : this.genericCss;
    return css && css + `[${this.lockbete}]:not(#a#b#c#d#e){display:revert!important}\n`;
  }
  // Dölj-regler som kan träffa ett element med de här klasserna/id:na (lockbeteskollen i content/cosmetic.js)
  doljRegler(host, tokens) {
    const k = this.kos; if (!k) return [];
    const nivaer = suffix(host);
    const undantag = new Set();
    for (const n of nivaer) for (const s of k.exceptions[n] || []) undantag.add(s);
    const delar = [indexera(nivaer.flatMap((n) => k.specific[n] || []))];
    if (!nivaer.some((n) => k.genericHide.has(n))) delar.push(this.tokenIndex ||= indexera(k.generic));
    const ut = new Set();
    for (const { index, otokade } of delar) {
      for (const s of otokade) ut.add(s);
      for (const t of tokens || []) for (const s of index.get(t) || []) ut.add(s);
    }
    return [...ut].filter((s) => !undantag.has(s));
  }
  kakCssFor(host) {
    const k = this.kak; if (!k) return '';
    const nivaer = suffix(host);
    const undantag = new Set();
    for (const n of nivaer) for (const s of k.exceptions[n] || []) undantag.add(s);
    const specifika = [];
    for (const n of nivaer) for (const s of k.specific[n] || []) if (!undantag.has(s)) specifika.push(s);
    return cssAv(specifika) + (undantag.size ? cssAv(k.generic.filter((s) => !undantag.has(s))) : this.kakGenericCss) + KAK_UPPLAS;
  }

  /* Farlig sida (security-listan)? Skalet visar då sin röda varning i stället för sidan. */
  isDanger(url, sourceUrl) {
    if (!this.index || !this.isOn()) return false;
    const host = hostAv(url);
    if (!host || this.fortsatt.has(host)) return false;
    const r = this.match(this.fraga(url, 'main_frame', sourceUrl || ''));
    return !!r && r.kat === 'danger';
  }
  openAnyway(url) { const h = hostAv(url); if (h) this.fortsatt.add(h); }

  serveOn(sess) {
    try {
      if (sess.protocol.isProtocolHandled(RES_SCHEME)) return;
      sess.protocol.handle(RES_SCHEME, (req) => {
        const u = new URL(req.url);
        const st = this.stubs.get(u.pathname.replace(/^\//, ''));
        if (!st) return new Response('', { status: 404 });
        return new Response(st.body, { headers: { 'content-type': st.mime, 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
      });
    } catch (e) { console.warn('[adraze] schema:', String(e)); }
  }
  // ── CNAME-avmaskering ──
  // Värt att slå upp CNAME för? (har punkt, ingen IP, ingen lokal värd)
  cnameMojlig(host) {
    if (!host || host.indexOf(':') >= 0) return false;                               // IPv6/port
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;                              // IPv4
    if (/(^|\.)(localhost|local|lan|home|internal|test)$/i.test(host)) return false;
    // Maskering sitter alltid på en subdomän (smetrics.brand.com); rena apex-spårare ligger redan
    // i listorna och fångas av vanlig matchning. Så vi slår bara upp CNAME för ≥3 etiketter.
    return host.split('.').length >= 3;
  }
  // Slå upp värdens CNAME-mål (cachat 10 min, 400 ms tak, ett uppslag per värd åt gången)
  async cnameMal(host) {
    const c = this.cnameCache.get(host);
    if (c && Date.now() - c.tid < 600000) return c.mal;
    if (this.cnameInflight.has(host)) return this.cnameInflight.get(host);
    const p = (async () => {
      let mal = null;
      try {
        const rec = await Promise.race([
          dnsP.resolveCname(host),
          new Promise((_r, rej) => setTimeout(() => rej(new Error('timeout')), 400)),
        ]);
        if (Array.isArray(rec) && rec[0]) mal = String(rec[0]).toLowerCase().replace(/\.$/, '');
      } catch { /* ingen CNAME (vanligast) eller timeout → mal = null */ }
      this.cnameCache.set(host, { mal, tid: Date.now() });
      this.cnameInflight.delete(host);
      return mal;
    })();
    this.cnameInflight.set(host, p);
    return p;
  }
  // Döljer värden en spårare? Matcha om mot CNAME-målet (som tredjepart). Returnerar { block, redirect } eller null.
  async cnameBlock(host, url, resourceType, kallVard) {
    const mal = await this.cnameMal(host);
    if (!mal || mal === host || bas(mal) === bas(host)) return null;   // ingen CNAME eller samma domän
    let cu; try { const u = new URL(url); u.hostname = mal; cu = u.href; } catch { return null; }
    const b = this.motor.blockera(cu, kallVard, resourceType, true);   // CNAME-målet = tredjepart
    return b.block ? b : null;
  }

  // $redirect: byt resursen mot en ofarlig stub (serveras från eget schema, cachas per namn)
  redirektUrl(namn) {
    const r = redirektResurser.hamta(namn); if (!r) return null;
    const key = 'rr-' + namn.replace(/[^a-z0-9._-]/gi, '');
    if (!this.stubs.has(key)) this.stubs.set(key, { mime: r.mime, body: r.body });
    return RES_SCHEME + '://r/' + key;
  }
  // Chromium vägrar omdirigera till data:-URL:er, så små ersättningsfiler serveras från eget schema
  stubUrlFor(dataUrl) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || ''); if (!m) return null;
    const h = crypto.createHash('sha1').update(dataUrl).digest('hex');
    if (!this.stubs.has(h)) this.stubs.set(h, { mime: m[1], body: m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8') });
    return RES_SCHEME + '://r/' + h;
  }

  install(sess) { this.sessions.add(sess); if (this.index && this.isOn()) this.enableOn(sess); else { if (this.forhand) this.baraForhand(sess); this.load(); } }

  enableOn(sess) {
    if (!this.index) return;
    this.serveOn(sess);
    try {
      sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
        const upp = this.forhand && this.forhand(d); if (upp) { cb({ redirectURL: upp }); return; }   // endast HTTPS
        if (!this.isOn() || !/^(https?|wss?):/i.test(d.url) || this.allowHost(d.url)) { cb({}); return; }
        const typ = TYPE_MAP[d.resourceType] || 'other';
        const kalla = typ === 'main_frame' ? (d.referrer || '') : ((d.frame && d.frame.url) || d.referrer || '');
        if (typ === 'main_frame' && this.fortsatt.has(hostAv(d.url))) { cb({}); return; }
        // Inloggnings-/2FA-sidor (GitHub, Google-konto, Microsoft …): blockera ingenting på dem
        if (typ !== 'main_frame' && kalla && this.allowHost(kalla)) { cb({}); return; }
        if (d.webContents && !d.webContents.isDestroyed() && this.allowHost(d.webContents.getURL() || '')) { cb({}); return; }
        // JS-indexet (farliga sidor, redirect-regler, rubriker) — körs om motorn släpper igenom
        const jsMatch = () => {
          const r = this.match(this.fraga(d.url, typ, kalla));
          if (!r) { cb({}); return; }
          this.onBlocked(d.url, r.kat, typ);
          const red = r.typ === 'redirect' && r.action.redirect;
          // Stoppad huvudsida: did-fail-load (ERR_BLOCKED_BY_CLIENT) får skalet att visa varningen
          if (red && red.url && !red.extensionPath) { const s = this.stubUrlFor(red.url); cb(s ? { redirectURL: s } : (/^https?:/.test(red.url) ? { redirectURL: red.url } : { cancel: true })); return; }
          cb({ cancel: true });
        };
        // Blockad från motorn (ren blockering eller $redirect-stub)
        const blockera = (b, kat) => {
          this.onBlocked(d.url, kat, typ);
          const stub = b.redirect ? this.redirektUrl(b.redirect) : null;
          cb(stub ? { redirectURL: stub } : { cancel: true });
        };
        // C++-motorn: ren nätverksblockering (reklam/spårare) ur hela filterlistorna
        if (this.motor && typ !== 'main_frame') {
          const vard = hostAv(d.url);
          const kallVard = hostAv(kalla) || vard;
          const tredje = !!vard && !!kallVard && bas(vard) !== bas(kallVard);
          const b = this.motor.blockera(d.url, kallVard, d.resourceType, tredje);
          if (b.block) { blockera(b, 'ad'); return; }
          // CNAME-avmaskering: spårare som gömmer sig bakom en förstaparts-subdomän
          if (this.cnameMojlig(vard)) {
            this.cnameBlock(vard, d.url, d.resourceType, kallVard)
              .then((res) => { if (res && res.block) blockera(res, 'tracker'); else jsMatch(); })
              .catch(() => jsMatch());
            return;
          }
        }
        jsMatch();
      });
      // modifyHeaders-reglerna: lägg till CSP på vissa sajter (stänger av popunder-ramar, workers m.m.)
      sess.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d, cb) => {
        const typ = TYPE_MAP[d.resourceType] || 'other';
        if (!this.isOn() || (typ !== 'main_frame' && typ !== 'sub_frame')) { cb({}); return; }
        const f = this.fraga(d.url, typ, typ === 'main_frame' ? (d.referrer || '') : ((d.frame && d.frame.url) || d.referrer || ''));
        let rubriker = null;
        for (const r of this.index.rubriker) {
          if (!passar(r, f)) continue;
          rubriker ||= { ...d.responseHeaders };
          for (const h of r.action.responseHeaders || []) {
            if (h.operation !== 'append' && h.operation !== 'set') continue;
            const key = Object.keys(rubriker).find((k) => k.toLowerCase() === h.header.toLowerCase()) || h.header;
            rubriker[key] = h.operation === 'set' ? [h.value] : [...(rubriker[key] || []), h.value];
          }
        }
        cb(rubriker ? { responseHeaders: rubriker } : {});
      });
    } catch (e) { console.warn('[adraze] webRequest:', String(e)); }
    try {
      const p = this.preloadPath; if (!p) return;
      if (sess.registerPreloadScript) {
        if (!sess.__adrazePreload) sess.__adrazePreload = sess.registerPreloadScript({ type: 'frame', filePath: p });
      } else {
        const cur = sess.getPreloads() || []; if (!cur.includes(p)) sess.setPreloads([...cur, p]);
      }
    } catch {}
  }
  // Endast HTTPS ska fungera även när blockeraren är av: då en liten lyssnare som bara uppgraderar
  baraForhand(sess) {
    try { sess.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (d, cb) => { const u = this.forhand && this.forhand(d); cb(u ? { redirectURL: u } : {}); }); } catch {}
  }
  disableOn(sess) {
    try { if (this.forhand) this.baraForhand(sess); else sess.webRequest.onBeforeRequest(null); } catch {}
    try { sess.webRequest.onHeadersReceived(null); } catch {}
    try {
      if (sess.unregisterPreloadScript) { if (sess.__adrazePreload) { sess.unregisterPreloadScript(sess.__adrazePreload); sess.__adrazePreload = null; } }
      else { const p = this.preloadPath; if (p) sess.setPreloads((sess.getPreloads() || []).filter((x) => x !== p)); }
    } catch {}
  }

  /* IPC från adraze-preload.js (synkront: CSS:en måste in innan sidan hinner måla) */
  registerIpc(ipcMain) {
    ipcMain.on('adraze:start', (e, host) => {
      const ut = { pa: false };
      if (!this.index || !this.isOn()) { e.returnValue = ut; return; }
      let topp = ''; try { topp = hostAv(e.sender.getURL()); } catch {}
      if (this.allowHost('https://' + (topp || host) + '/')) { e.returnValue = ut; return; }
      e.returnValue = { pa: true, skript: this.skript };
    });
    ipcMain.on('adraze:css', (e, host) => { e.returnValue = { css: this.cssFor(String(host || '')), lockbete: this.lockbete }; });
    // Kakhanteraren är på så fort blockeraren är på (inte bara på sajter med egen kak-CSS),
    // så content/kakor.js kan avvisa t.ex. YouTubes egen samtyckesruta som saknar CSS-regler.
    ipcMain.on('adraze:kakor', (e, host) => { e.returnValue = { pa: this.isOn(), css: this.isOn() ? this.kakCssFor(String(host || '')) : '' }; });
    ipcMain.on('adraze:dolj-regler', (e, host, tokens) => { e.returnValue = this.doljRegler(String(host || ''), Array.isArray(tokens) ? tokens.map(String) : []); });
    ipcMain.on('adraze:rakna', (_e, typ) => { this.onCount(String(typ || '')); });
  }
}

// 100 selektorer per regel: en selektor Chromium inte känner igen tar bara med sig sin egen grupp
function cssAv(selektorer) {
  let css = '';
  for (let i = 0; i < selektorer.length; i += 100) css += selektorer.slice(i, i + 100).join(',\n') + '{display:none!important}\n';
  return css;
}
const TOKEN = /[.#]((?:[\w-]|\\.)+)/g;
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
// Sajter som låser sidan medan kakrutan visas: lås upp när rutan är dold
const KAK_UPPLAS = `html.sp-message-open,body.didomi-popup-open,html.didomi-popup-open,body.qc-cmp-ui-showing,html.qc-cmp-ui-showing,
body.cmp-modal-open,body.cookie-consent-open,body.onetrust-consent-sdk-open,html.cookiebot-open,body.CybotCookiebotDialogActive,
body.cky-modal-open,html.cmpbox-open,body.cmplz-cookiebanner-open{overflow:auto!important}
html.sp-message-open body{overflow:auto!important;position:static!important}\n`;

module.exports = { AdrazeAdblock, registerScheme };
