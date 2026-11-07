'use strict';
/* ── Anpassa: sidopanel med webbappar (huvudprocessen) ──
 * Som Vivaldis/Operas webbpaneler: en smal list i skalet (ui/anpassa-sidopanel.js) med ikoner för fästa
 * webbappar. Klick öppnar appen i en egen WebContentsView bredvid sidan, klick igen stänger panelen – men
 * vyn lever kvar (musiken spelar vidare) tills appen avslutas, tas bort eller fönstret stängs.
 *
 * Nycklar i Anpassa-butiken (alla barnlåsta):
 *   sidopanel.visa   true/false                                listen syns
 *   sidopanel.sida   'vanster' | 'hoger'                       vid vilken kant
 *   sidopanel.appar  [{ id, namn, url, mobil, ljud, bredd }]   appar i ordning (importeras aldrig via delningskod)
 *
 * Säkerhet: vyerna får fönstrets kontosession (samma kakor, reklamblockering, nätskydd, behörigheter och
 * nedladdningar som flikarna), sandlåda, contextIsolation, ingen Node och samma preload som flikarna.
 * Ingen sidopanel i inkognito eller i barnläge – den skulle annars gå runt spärrlistan och förälderns insyn.
 * Ikoner: här hämtas bara råa bytes (http/https, storleks- och tidsgräns, inga privata adresser från en
 * sajt på nätet, inga kakor). Huvudprocessen avkodar aldrig bilder – skalet ritar om dem till en 64×64-PNG.
 */
const fs = require('fs');
const path = require('path');
const { app, ipcMain, WebContentsView, Menu, net, session } = require('electron');
const anpassa = require('./anpassa');
const { privatVard } = require('./natskydd');

const MAX_APPAR = 24;
const BREDD_MIN = 280, BREDD_MAX = 960;
const FRAGA_MS = 90000;                         // obesvarad behörighetsfråga nekas efter 90 s (som flikarnas)
const ID_OK = /^[a-z0-9][a-z0-9-]{3,39}$/i;
const INTERN = /^(adraze|adraze-res|file|devtools|chrome|chrome-extension|view-source):/i;

anpassa.registrera({ nyckel: 'sidopanel.visa', standard: true, etikett: 'Visa sidopanelen', barnLast: true });
anpassa.registrera({ nyckel: 'sidopanel.sida', standard: 'vanster', etikett: 'Sidopanelens placering', barnLast: true });
anpassa.registrera({ nyckel: 'sidopanel.appar', standard: [], etikett: 'Appar i sidopanelen', barnLast: true, importBar: false });

let D = null;                                   // beroenden från main.js (se init)
const tillstand = new WeakMap();                // ctx → { vyer: Map(id → post), oppen, yta, skymd, fullskarm }
const redoSkal = new WeakSet();                 // fönster vars skal har startat sin sidopanel (kan ta emot händelser)

/* ── Apparna (värdena kontrolleras alltid här – de kan komma från en import eller ett gammalt skal) ── */
function rensaUrl(u) {
  try {
    const s = String(u || '').trim();
    if (!s || s.length > 2048) return '';
    const x = new URL(s);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
    if (x.username || x.password) return '';
    return x.href;
  } catch { return ''; }
}
function appar() {
  const l = anpassa.hamta('sidopanel.appar', []);
  const ut = []; const sedda = new Set();
  for (const a of Array.isArray(l) ? l : []) {
    if (ut.length >= MAX_APPAR) break;
    if (!a || typeof a !== 'object') continue;
    const id = String(a.id || ''), url = rensaUrl(a.url);
    if (!ID_OK.test(id) || sedda.has(id) || !url) continue;
    sedda.add(id);
    let b = Number(a.bredd); b = Number.isFinite(b) && b > 0 ? Math.min(BREDD_MAX, Math.max(BREDD_MIN, Math.round(b))) : 0;
    ut.push({ id, namn: String(a.namn || '').trim().slice(0, 60), url, mobil: !!a.mobil, ljud: a.ljud !== false, bredd: b });
  }
  return ut;
}
const appMed = (id) => appar().find((a) => a.id === id) || null;
const vardnamn = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const privatApp = (u) => { try { return privatVard(new URL(u).hostname); } catch { return false; } };

// Mobilvy: Chrome på Android med samma version som skrivbordsförklädnaden
function mobilUA() {
  const v = (String(app.userAgentFallback || '').match(/Chrome\/(\d+)/) || [])[1] || '130';
  return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Mobile Safari/537.36`;
}

/* ── Får fönstret ha en sidopanel? Aldrig i inkognito, aldrig när något fönster är i barnläge ── */
function tillatenHar(ctx) { return !!(ctx && ctx.win && !ctx.win.isDestroyed() && !ctx.incognito && !D.barnNagonstans()); }
function kanOppna(ctx) { return tillatenHar(ctx) && anpassa.hamta('sidopanel.visa', true) !== false; }

function st(ctx) {
  let s = tillstand.get(ctx);
  if (!s) {
    s = { vyer: new Map(), oppen: null, yta: null, skymd: false, fullskarm: null };
    tillstand.set(ctx, s);
    try { ctx.win.once('closed', () => rivFonster(ctx)); } catch {}
  }
  return s;
}
function rektangel(r) {
  if (!r || typeof r !== 'object') return null;
  const n = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(20000, Math.round(+v))) : null);
  const x = n(r.x), y = n(r.y), width = n(r.width), height = n(r.height);
  return [x, y, width, height].some((v) => v === null) ? null : { x, y, width, height };
}
const kanGa = (wc, dir) => { try { return dir < 0 ? wc.navigationHistory.canGoBack() : wc.navigationHistory.canGoForward(); } catch { return false; } };
function olasta(titel) {
  const t = String(titel || '');
  const m = t.match(/\((\d{1,5})\+?\)/);              // "(3) WhatsApp", "Inkorg (12) - Gmail"
  if (m) return Math.min(99999, parseInt(m[1], 10)) || 0;
  return /^\s*[•●]/.test(t) ? 1 : 0;                  // "• Slack" o.d.
}

/* ── Vyerna ── */
function skapaVy(ctx, a, bakgrund) {
  const s = st(ctx);
  const fs0 = D.fontSize();
  // Samma webPreferences som flikarna (ensureView i main.js) + ingen strypning i bakgrunden: panelen sover inte
  const wp = { preload: D.contentPreload, contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: true,
    session: D.sessionFor(ctx), defaultFontSize: fs0, defaultMonospaceFontSize: Math.round(fs0 * 13 / 16), backgroundThrottling: false };
  const view = new WebContentsView({ webPreferences: wp });
  view.setVisible(false);
  try { view.setBackgroundColor(bakgrund === '#0e0e10' ? '#0e0e10' : '#ffffff'); } catch {}
  // Längst ned bland vyerna: över skalet men under flikarnas popupar (sökrutan, lösenord, nedladdningar)
  ctx.win.contentView.addChildView(view, 0);
  const wc = view.webContents;
  wc.__ctx = ctx;                     // samma routing som flikarna: barnspärren, lösenord, behörigheter, kortkommandon
  wc.__sidopanel = a.id;
  const p = { view, wc, id: a.id, url: a.url, mobil: a.mobil, info: {}, satt: '' };
  s.vyer.set(a.id, p);
  if (a.mobil) { wc.__adrazeMobil = true; try { wc.setUserAgent(mobilUA()); } catch {} }
  try { wc.setAudioMuted(!a.ljud); } catch {}
  koppla(ctx, p);
  wc.loadURL(a.url).catch(() => {});
  return p;
}

function koppla(ctx, p) {
  const { wc, id } = p;
  const info = (patch) => { Object.assign(p.info, patch); D.sendTo(ctx, 'sidopanel:info', id, patch); };
  wc.setWindowOpenHandler((d) => fonsterBegaran(ctx, wc, d));
  wc.on('did-create-window', (child) => vaktaFonster(wc, child));
  wc.on('will-navigate', (e, url) => { if (stoppa(ctx, wc, url, true)) e.preventDefault(); });
  wc.on('will-redirect', (e, url) => { if (stoppa(ctx, wc, url, false)) { try { e.preventDefault(); } catch {} } });
  // Ingen egen felsida i Electron → samma "Sidan kan inte nås" som flikarna
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3 && code !== -20 && /^https?:/i.test(url || '')) { try { D.visaFelsida(wc, code, desc, url); } catch {} } });
  const nav = (url) => info({ url: String(url || '').slice(0, 2048), bakat: kanGa(wc, -1), framat: kanGa(wc, 1) });
  wc.on('did-navigate', (_e, url) => nav(url));
  wc.on('did-navigate-in-page', (_e, url, isMain) => { if (isMain) nav(url); });
  wc.on('page-title-updated', (_e, t) => info({ titel: String(t || '').slice(0, 300), olasta: olasta(t) }));
  wc.on('page-favicon-updated', (_e, favs) => sidansIkon(id, favs));
  wc.on('did-start-loading', () => info({ laddar: true }));
  wc.on('did-stop-loading', () => info({ laddar: false }));
  wc.on('audio-state-changed', (ev) => info({ spelar: !!(ev && ev.audible) }));
  wc.on('context-menu', (_e, params) => { try { D.kontextmeny(ctx, wc, params); } catch {} });
  wc.on('dom-ready', () => { try { if (ctx.defaultZoom && ctx.defaultZoom !== 1) wc.setZoomFactor(ctx.defaultZoom); } catch {} });   // samma standardzoom som flikarna
  // Video i helskärm inne i appen: täck hela fönstret tills sidan lämnar helskärmen
  wc.on('enter-html-full-screen', () => { const s = st(ctx); s.fullskarm = id; try { ctx.win.contentView.addChildView(p.view); } catch {} p.satt = ''; placera(ctx); });
  wc.on('leave-html-full-screen', () => { const s = st(ctx); if (s.fullskarm === id) s.fullskarm = null; try { ctx.win.contentView.addChildView(p.view, 0); } catch {} p.satt = ''; placera(ctx); });
  wc.on('render-process-gone', (_e, d) => { if (d && d.reason === 'clean-exit') return; setImmediate(() => avsluta(ctx, id, 'krasch')); });
  wc.once('destroyed', () => { const s = tillstand.get(ctx); if (s && s.vyer.get(id) === p) s.vyer.delete(id); });
}

// Navigering i panelen: aldrig AdRazes egna sidor eller lokala filer, inga annons-/spärrade mål, inga kända bluffsidor
function stoppa(ctx, wc, url, arNavigering) {
  const u = String(url || '');
  if (INTERN.test(u)) return true;
  if (!/^https?:/i.test(u)) return false;
  let fran = ''; try { fran = wc.getURL(); } catch {}
  if (D.barnSparrad(u, ctx)) return true;
  if (D.adblockPa() && D.isBlockedTarget(u, fran)) return true;
  if (arNavigering && D.instantDanger(u)) { D.sendTo(ctx, 'toast', D.T('AdRaze stoppade en farlig sida i sidopanelen.')); return true; }
  return false;
}

// Nya fönster från appen: samma regler som flikarna (popup-storm, popunder-vakt, inloggningsrutor, kassafönster)
function fonsterBegaran(ctx, wc, d) {
  const url = String((d && d.url) || '');
  let fran = ''; try { fran = wc.getURL(); } catch {}
  if (INTERN.test(url)) return { action: 'deny' };
  const nu = Date.now();
  const ps = wc.__popups || (wc.__popups = { t: 0, n: 0 });
  ps.n = nu - ps.t < 2000 ? ps.n + 1 : 1; ps.t = nu;
  if (ps.n > 1) return { action: 'deny' };                                  // ett fönster per klick, som Chrome
  const tomt = !url || url === 'about:blank', webbadr = /^https?:/i.test(url);
  if (!tomt && !webbadr) return { action: 'deny' };
  if (webbadr && (D.barnSparrad(url, ctx) || (D.adblockPa() && D.isBlockedTarget(url, fran)) || D.instantDanger(url))) return { action: 'deny' };
  const fonster = d.disposition === 'new-window' || !!(d.features && d.features.length);
  const lc = wc.__lastClick, knappNyss = !!(lc && lc.knapp && nu - lc.t < 1500);
  const riktigt = () => ({ action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, resizable: true, autoHideMenuBar: true,
    webPreferences: { preload: D.contentPreload, contextIsolation: true, sandbox: true, nodeIntegration: false, session: wc.session } } });   // inloggningsrutan delar panelens kakor
  if (fonster) {
    if (tomt) return knappNyss ? riktigt() : { action: 'deny' };               // kassafönster: tomt fönster vid ett riktigt knappklick
    if (D.sameSite(url, fran) || D.popupTrustedHost(url) || knappNyss) return riktigt();
    return { action: 'deny' };                                                // korsdomän-fönster från okänd sajt = popunder
  }
  if (tomt) return { action: 'deny' };
  if (!D.sameSite(url, fran) && !D.popupTrustedHost(url)) {                   // ny flik till annan sajt bara efter klick på en länk dit
    const viaLank = !!(lc && nu - lc.t < 3000 && (lc.href ? D.sameSite(lc.href, url)
      : (wc.__linkClicks || []).some((c) => nu - c.t < 60000 && D.sameSite(c.href, url))));
    if (!viaLank) return { action: 'deny' };
  }
  D.sendTo(ctx, 'open-new-tab', url);                                         // länkar (target=_blank) blir vanliga flikar
  return { action: 'deny' };
}
function vaktaFonster(wc, child) {
  try {
    const cwc = child.webContents;
    const fran = () => { try { return wc.getURL(); } catch { return ''; } };
    const vakta = (e, url) => {
      if (!(D.adblockPa() && /^https?:/i.test(url || '') && D.isBlockedTarget(url, fran()))) return;
      try { e && e.preventDefault && e.preventDefault(); } catch {}
      setTimeout(() => { try { if (!child.isDestroyed()) child.close(); } catch {} }, 0);
    };
    cwc.on('will-navigate', vakta);
    cwc.on('will-redirect', vakta);
    cwc.on('did-start-navigation', (_e, url, inPage, isMain) => { if (isMain && !inPage) vakta(null, url); });
  } catch {}
}

/* Placera vyerna. Anropas av applyBounds i main.js (fönsterstorlek, helskärm, flikbyte) och här. */
function placera(ctx) {
  const s = ctx ? tillstand.get(ctx) : null;
  if (!s) return;
  const R = Math.round;
  let cb = null;
  for (const [id, p] of s.vyer) {
    let b = null;
    if (s.oppen === id && kanOppna(ctx)) {
      if (s.fullskarm === id) { try { cb = cb || ctx.win.getContentBounds(); b = { x: 0, y: 0, width: R(cb.width), height: R(cb.height) }; } catch {} }
      else if (s.yta && !s.skymd && !ctx.htmlFull) b = s.yta;          // flikens video i helskärm täcker allt: dölj panelen
    }
    const nyckel = b ? [b.x, b.y, b.width, b.height].join(',') : 'dold';
    if (p.satt === nyckel) continue;
    p.satt = nyckel;
    try {
      if (b) p.view.setBounds({ x: R(b.x), y: R(b.y), width: Math.max(0, R(b.width)), height: Math.max(0, R(b.height)) });
      p.view.setVisible(!!b);                                           // dold vy lever kvar: ljudet fortsätter
    } catch {}
  }
}

function oppna(ctx, id, yta, bakgrund) {
  if (!kanOppna(ctx)) { D.sendTo(ctx, 'sidopanel:tillstand', tillstandFor(ctx, true)); return; }
  const a = appMed(id); if (!a) return;
  if (D.barnSparrad(a.url, ctx)) { D.sendTo(ctx, 'toast', D.T('Den här appen är spärrad.')); return; }
  const s = st(ctx);
  s.oppen = id; s.skymd = false;
  const r = rektangel(yta); if (r) s.yta = r;
  const p = s.vyer.get(id) || skapaVy(ctx, a, bakgrund);
  p.satt = '';
  placera(ctx);
  try { p.wc.focus(); } catch {}
}
function stang(ctx) {
  const s = tillstand.get(ctx); if (!s) return;
  s.oppen = null; s.fullskarm = null;
  placera(ctx);
}
// Avsluta en app: vyn rivs (minnet frigörs, musiken tystnar)
function avsluta(ctx, id, varfor) {
  const s = tillstand.get(ctx); if (!s) return;
  const p = s.vyer.get(id); if (!p) return;
  s.vyer.delete(id);
  if (s.fullskarm === id) s.fullskarm = null;
  for (const f of [...fragor.values()]) if (f.ctx === ctx && f.id === id) f.klar({ allow: false, remember: false });
  try { ctx.win.contentView.removeChildView(p.view); } catch {}
  try { if (!p.wc.isDestroyed()) p.wc.close(); } catch {}
  D.sendTo(ctx, 'sidopanel:info', id, { laddad: false });
  if (s.oppen === id) {
    s.oppen = null;
    D.sendTo(ctx, 'sidopanel:stangd', id);
    if (varfor === 'krasch') D.sendTo(ctx, 'toast', D.T('Appen i sidopanelen kraschade. Öppna den igen för att ladda om.'));
  }
}
function rivFonster(ctx) {
  const s = tillstand.get(ctx); if (!s) return;
  for (const id of [...s.vyer.keys()]) avsluta(ctx, id);
  s.oppen = null; s.fullskarm = null;
}
function gor(ctx, id, vad) {
  const s = tillstand.get(ctx); const p = s && s.vyer.get(id); const a = appMed(id);
  if (!a) return;
  if (vad === 'flik') {                                     // öppna det appen visar just nu i en vanlig flik
    let u = a.url; try { if (p && /^https?:/i.test(p.wc.getURL())) u = p.wc.getURL(); } catch {}
    if (!D.barnSparrad(u, ctx)) D.sendTo(ctx, 'open-new-tab', u);
    return;
  }
  if (!p) return;
  try {
    if (vad === 'ladda-om') p.wc.reload();
    else if (vad === 'hem') p.wc.loadURL(a.url).catch(() => {});
    else if (vad === 'bakat') { if (kanGa(p.wc, -1)) p.wc.navigationHistory.goBack(); }
    else if (vad === 'framat') { if (kanGa(p.wc, 1)) p.wc.navigationHistory.goForward(); }
    else if (vad === 'avsluta') avsluta(ctx, id);
  } catch {}
}

/* Kortkommandon när fokus ligger i panelen (kroken i handleShortcut). true = hanterat här. */
function genvag(wc, input) {
  if (!wc || !wc.__sidopanel || !input || input.type !== 'keyDown') return false;
  const mod = input.control || input.meta, k = String(input.key || '').toLowerCase();
  try {
    if (k === 'f5' || (mod && k === 'r')) { if (input.shift) wc.reloadIgnoringCache(); else wc.reload(); return true; }
    if (input.alt && !mod && (k === 'arrowleft' || k === 'arrowright')) { if (k === 'arrowleft') { if (kanGa(wc, -1)) wc.navigationHistory.goBack(); } else if (kanGa(wc, 1)) wc.navigationHistory.goForward(); return true; }
    if (mod && (k === '+' || k === '=')) { wc.setZoomLevel(Math.min(5, wc.getZoomLevel() + 0.5)); return true; }
    if (mod && (k === '-' || k === '_')) { wc.setZoomLevel(Math.max(-5, wc.getZoomLevel() - 0.5)); return true; }
    if (mod && k === '0') { wc.setZoomLevel(0); return true; }
    // Sidans egna kommandon (sök, spara, skriv ut, bild-i-bild) ska inte slå mot fliken bredvid
    if ((mod && (k === 'f' || k === 'g' || k === 's' || k === 'p')) || k === 'f3') return true;
  } catch {}
  return false;
}

/* ── Behörighetsfrågor (kamera, mikrofon, notiser …) från en app visas i panelen, inte överst i fliken ── */
let fragaSeq = 0;
const fragor = new Map();               // qid → { ctx, id, klar }
function fraga(wc, origin, kinds) {
  return new Promise((resolve) => {
    const ctx = wc && wc.__ctx, id = wc && wc.__sidopanel;
    if (!ctx || !id || !kanOppna(ctx)) { resolve({ allow: false, remember: false }); return; }
    const qid = ++fragaSeq;
    const klar = (svar) => {
      const f = fragor.get(qid); if (!f) return;
      fragor.delete(qid); clearTimeout(f.timer);
      D.sendTo(ctx, 'sidopanel:fraga-klar', qid);
      resolve(svar);
    };
    fragor.set(qid, { ctx, id, klar, timer: setTimeout(() => klar({ allow: false, remember: false }), FRAGA_MS) });
    D.sendTo(ctx, 'sidopanel:fraga', { qid, id, origin: String(origin || '').slice(0, 300), kinds: (Array.isArray(kinds) ? kinds : []).map(String).slice(0, 8) });
    try { wc.once('destroyed', () => klar({ allow: false, remember: false })); } catch {}
  });
}

/* ── Ikoner ── */
const IKON_FIL = () => path.join(app.getPath('userData'), 'adraze-sidopanel-ikoner.json');
const pngOk = (s) => typeof s === 'string' && s.length < 90000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);
let ikoner = null, ikonTimer = null;
function lasIkoner() {
  if (ikoner) return ikoner;
  try { const j = JSON.parse(fs.readFileSync(IKON_FIL(), 'utf8')); ikoner = j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { ikoner = {}; }
  for (const [k, v] of Object.entries(ikoner)) if (!ID_OK.test(k) || !v || !pngOk(v.png)) delete ikoner[k];
  return ikoner;
}
function sparaIkoner() {
  clearTimeout(ikonTimer);
  ikonTimer = setTimeout(() => { try { const f = IKON_FIL(); fs.writeFileSync(f + '.tmp', JSON.stringify(ikoner || {})); fs.renameSync(f + '.tmp', f); } catch {} }, 300);
}
function adressOk(u, privatOk) {
  try {
    const x = new URL(String(u || ''));
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return false;   // aldrig file:, adraze: m.fl. (net.request klarar dem)
    if (x.username || x.password) return false;
    return privatOk || !privatVard(x.hostname);                              // en sajt på nätet får inte peka in i hemnätet
  } catch { return false; }
}
// GET utan kakor, med egen hantering av omdirigeringar (varje hopp kontrolleras) och gränser för storlek och tid
function hamta(url, { max, ms, privatOk, accept, klipp }) {
  return new Promise((resolve) => {
    let req = null, klar = false, hopp = 0, fardig = false;
    const tid = setTimeout(() => slut(null), ms);
    function slut(v) { if (klar) return; klar = true; clearTimeout(tid); if (!fardig) { try { if (req) req.abort(); } catch {} } resolve(v); }
    if (!adressOk(url, privatOk)) { slut(null); return; }
    try {
      req = net.request({ url, method: 'GET', redirect: 'manual', credentials: 'omit', session: session.defaultSession, referrerPolicy: 'no-referrer' });
      req.setHeader('Accept', accept || '*/*');
      try { req.setHeader('User-Agent', app.userAgentFallback); } catch {}
      req.on('redirect', (_kod, _metod, nyUrl) => {
        if (++hopp > 4 || !adressOk(nyUrl, privatOk)) { slut(null); return; }
        url = nyUrl;
        try { req.followRedirect(); } catch { slut(null); }
      });
      req.on('response', (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) { slut(null); return; }
        const bitar = []; let n = 0;
        const typ = String([].concat(res.headers['content-type'] || '')[0] || '').toLowerCase();
        res.on('data', (b) => {
          if (klar) return;
          n += b.length; bitar.push(b);
          if (n > max) { if (klipp) slut({ buf: Buffer.concat(bitar).subarray(0, max), url, typ }); else slut(null); }
        });
        res.on('end', () => { fardig = true; slut({ buf: Buffer.concat(bitar), url, typ }); });
        res.on('error', () => slut(null));
      });
      req.on('error', () => slut(null));
      req.end();
    } catch { slut(null); }
  });
}
// Bildtyp ur innehållet (inte ur adressen eller servern): PNG, ICO, GIF, JPEG, WebP eller SVG
function bildTyp(buf) {
  if (!buf || buf.length < 4) return '';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const s = buf.subarray(0, 2048).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(s)) return 'image/svg+xml';
  return '';
}
const avkoda = (s) => String(s || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'").replace(/&#x0*2f;/gi, '/').trim();
function poang(sizes, typ, url, apple) {
  const svg = /svg/.test(typ) || /\.svg([?#]|$)/i.test(url);
  let s = 0;
  if (svg || /\bany\b/i.test(sizes)) s = 256;
  else for (const m of String(sizes || '').matchAll(/(\d+)\s*[xX×]\s*\d+/g)) s = Math.max(s, +m[1]);
  if (!s) s = apple ? 180 : 32;
  let p = s >= 64 ? 1000 - Math.abs(Math.log2(s / 128)) * 100 : s * 10;   // bäst runt 128 px, för små blir suddiga
  if (svg) p -= 50;
  return p;
}
function ikonKandidater(html, basUrl) {
  const ut = []; let manifest = '', bas = basUrl;
  const huvud = String(html || '').slice(0, 400000);
  const bm = /<base\s[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(huvud);
  if (bm) { try { bas = new URL(avkoda(bm[1] ?? bm[2] ?? bm[3] ?? ''), basUrl).href; } catch {} }
  for (const m of huvud.matchAll(/<link\s[^>]*>/gi)) {
    const tag = m[0];
    const attr = (namn) => { const r = new RegExp('\\s' + namn + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return r ? avkoda(r[1] ?? r[2] ?? r[3] ?? '') : ''; };
    const rel = attr('rel').toLowerCase().split(/\s+/).filter(Boolean);
    const href = attr('href'); if (!href) continue;
    let url; try { url = new URL(href, bas).href; } catch { continue; }
    if (rel.includes('manifest')) { if (!manifest) manifest = url; continue; }
    const apple = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
    if (!apple && !rel.includes('icon')) continue;                      // mask-icon (enfärgad Safari-ikon) hoppas över
    ut.push({ url, poang: poang(attr('sizes'), attr('type').toLowerCase(), url, apple) });
    if (ut.length >= 30) break;
  }
  return { ikoner: ut, manifest };
}
async function manifestIkoner(url, privatOk) {
  const r = await hamta(url, { max: 128 * 1024, ms: 5000, privatOk, accept: 'application/manifest+json,application/json' });
  if (!r) return [];
  let j; try { j = JSON.parse(r.buf.toString('utf8')); } catch { return []; }
  const ut = [];
  for (const ik of Array.isArray(j && j.icons) ? j.icons.slice(0, 30) : []) {
    if (!ik || typeof ik.src !== 'string') continue;
    const syfte = String(ik.purpose || 'any');
    if (/monochrome/i.test(syfte) && !/any|maskable/i.test(syfte)) continue;
    let u; try { u = new URL(ik.src, r.url).href; } catch { continue; }
    ut.push({ url: u, poang: poang(String(ik.sizes || ''), String(ik.type || '').toLowerCase(), u, false) });
  }
  return ut;
}
function dataBild(s) {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(s || ''));
  if (!m || s.length > 280000) return '';
  const buf = Buffer.from(m[1], 'base64'); const typ = bildTyp(buf);
  return typ ? 'data:' + typ + ';base64,' + buf.toString('base64') : '';
}
// Sajtens ikon: <link rel=icon/apple-touch-icon> i sidan, webbappens manifest, sist /favicon.ico
async function ikonFranSajt(appUrl) {
  const privatOk = privatApp(appUrl);
  const sida = await hamta(appUrl, { max: 512 * 1024, ms: 8000, privatOk, accept: 'text/html,application/xhtml+xml', klipp: true });
  const bas = sida ? sida.url : appUrl;
  let kand = [], manifest = '';
  if (sida && (!sida.typ || /html|xml/.test(sida.typ))) { const k = ikonKandidater(sida.buf.toString('utf8'), bas); kand = k.ikoner; manifest = k.manifest; }
  kand.sort((a, b) => b.poang - a.poang);
  if (manifest && !(kand[0] && kand[0].poang >= 900)) kand = kand.concat(await manifestIkoner(manifest, privatOk)).sort((a, b) => b.poang - a.poang);
  try { kand.push({ url: new URL('/favicon.ico', bas).href, poang: 0 }); } catch {}
  const provade = new Set();
  for (const k of kand) {
    if (provade.has(k.url)) continue;
    if (provade.size >= 5) break;
    provade.add(k.url);
    if (/^data:/i.test(k.url)) { const d = dataBild(k.url); if (d) return { data: d, kalla: 'data' }; continue; }
    const r = await hamta(k.url, { max: 200 * 1024, ms: 6000, privatOk, accept: 'image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5' });
    const typ = r && bildTyp(r.buf);
    if (typ) return { data: 'data:' + typ + ';base64,' + r.buf.toString('base64'), kalla: k.url };
  }
  return null;
}
const hamtarIkon = new Set();
const vantarIkon = new Map();           // id → { data, kalla, skickad } – råa bytes som väntar på att ett skal ritar om dem
async function hamtaIkon(a) {
  if (!a || hamtarIkon.has(a.id) || lasIkoner()[a.id] || vantarIkon.has(a.id)) return;
  hamtarIkon.add(a.id);
  try { const r = await ikonFranSajt(a.url); if (r && appMed(a.id) && !lasIkoner()[a.id]) skickaRa(a.id, r.data, r.kalla); } catch {}
  finally { hamtarIkon.delete(a.id); }
}
function skickaRa(id, data, kalla) { vantarIkon.set(id, { data, kalla: String(kalla || '').slice(0, 2048), skickad: 0 }); skickaVantande(); }
function skickaVantande(foredrag) {
  if (!vantarIkon.size) return;
  const ok = (c) => c && redoSkal.has(c) && c.win && !c.win.isDestroyed();
  const ctx = ok(foredrag) && !foredrag.incognito ? foredrag : [...D.wins.values()].find((c) => ok(c) && !c.incognito) || [...D.wins.values()].find(ok);
  if (!ctx) return;
  const nu = Date.now();
  for (const [id, v] of vantarIkon) {
    if (v.skickad && nu - v.skickad < 15000) continue;
    v.skickad = nu;
    D.sendTo(ctx, 'sidopanel:ikon-ra', id, v.data, v.kalla);
  }
}
// Appen är öppen och har ingen ikon än (sajten satte den med skript, eller hämtningen misslyckades): ta sidans
const sidIkonForsokt = new Set();
function sidansIkon(id, favs) {
  if (lasIkoner()[id] || vantarIkon.has(id) || hamtarIkon.has(id) || sidIkonForsokt.has(id)) return;
  const f = (Array.isArray(favs) ? favs : [])[0];
  const a = appMed(id);
  if (typeof f !== 'string' || !a) return;
  sidIkonForsokt.add(id);
  if (/^data:image\//i.test(f)) { const d = dataBild(f); if (d) skickaRa(id, d, 'sida'); return; }
  hamta(f, { max: 200 * 1024, ms: 6000, privatOk: privatApp(a.url), accept: 'image/*,*/*;q=0.5' }).then((r) => {
    const typ = r && bildTyp(r.buf);
    if (typ && appMed(id) && !lasIkoner()[id]) skickaRa(id, 'data:' + typ + ';base64,' + r.buf.toString('base64'), f);
  }).catch(() => {});
}

/* ── Skalets tillstånd ── */
function tillstandFor(ctx, utanIkoner) {
  const s = ctx ? tillstand.get(ctx) : null;
  const laddade = {};
  if (s) for (const [id, p] of s.vyer) laddade[id] = { ...p.info, laddad: true };
  const ut = { tillaten: tillatenHar(ctx), barn: !!D.barnNagonstans(), inkognito: !!(ctx && ctx.incognito), oppen: s ? s.oppen : null, laddade };
  if (!utanIkoner) {
    const ik = lasIkoner(); ut.ikoner = {};
    for (const a of appar()) if (ik[a.id]) ut.ikoner[a.id] = ik[a.id].png;
  }
  return ut;
}
// Barnläge av/på någonstans: ingen panel får finnas kvar i något fönster
let senastBarn = null;
function barnKoll() {
  const barn = !!D.barnNagonstans();
  if (barn) for (const ctx of D.wins.values()) rivFonster(ctx);
  if (barn === senastBarn) return;
  senastBarn = barn;
  for (const ctx of D.wins.values()) D.sendTo(ctx, 'sidopanel:tillstand', tillstandFor(ctx, true));
}
// Anpassa ändrades (här, i ett annat fönster, via ångra eller import): följ med i alla fönster
function andrat() {
  const lista = appar(); const ids = new Set(lista.map((a) => a.id));
  const visa = anpassa.hamta('sidopanel.visa', true) !== false;
  for (const ctx of D.wins.values()) {
    const s = tillstand.get(ctx); if (!s) continue;
    for (const [id, p] of [...s.vyer]) {
      const a = lista.find((x) => x.id === id);
      if (!a || !visa) { avsluta(ctx, id); continue; }
      try { p.wc.setAudioMuted(!a.ljud); } catch {}
      if (a.mobil !== p.mobil || a.url !== p.url) {                     // mobilvy av/på eller ny adress: börja om på appens startsida
        p.mobil = a.mobil; p.url = a.url; p.wc.__adrazeMobil = a.mobil;
        try { p.wc.setUserAgent(a.mobil ? mobilUA() : p.wc.session.getUserAgent()); } catch {}
        p.wc.loadURL(a.url).catch(() => {});
      }
    }
    placera(ctx);
  }
  const ik = lasIkoner(); let bort = false;
  for (const id of Object.keys(ik)) if (!ids.has(id)) { delete ik[id]; bort = true; }
  for (const id of [...vantarIkon.keys()]) if (!ids.has(id)) vantarIkon.delete(id);
  if (bort) sparaIkoner();
  for (const a of lista) if (!ik[a.id]) hamtaIkon(a);
}

/* ── Högerklick på en ikon (eller tom yta) i listen: systemmeny, ritas ovanpå allt ── */
function meny(ctx, id) {
  if (!kanOppna(ctx)) return;
  const T = D.T;
  const lista = appar(); const i = lista.findIndex((a) => a.id === id); const a = lista[i] || null;
  const s = st(ctx); const p = a && s.vyer.get(a.id);
  const namn = a ? (a.namn || vardnamn(a.url)) : '';
  const satt = (ny, etikett) => anpassa.satt('sidopanel.appar', ny, { etikett });
  const andra = (andring, etikett) => satt(lista.map((x) => (x.id === a.id ? { ...x, ...andring } : x)), etikett);
  const flytta = (fran, till) => { const l = lista.slice(); const [x] = l.splice(fran, 1); l.splice(till, 0, x); satt(l, 'Ändrade ordningen i sidopanelen'); };
  const t = [];
  if (a) {
    t.push({ label: namn, enabled: false });
    t.push({ label: s.oppen === a.id ? T('Stäng panelen') : T('Öppna'), click: () => D.sendTo(ctx, 'sidopanel:atgard', s.oppen === a.id ? 'stang' : 'oppna', a.id) });
    if (p) t.push({ label: T('Läs in igen'), click: () => gor(ctx, a.id, 'ladda-om') });
    if (p) t.push({ label: T('Till appens startsida'), click: () => gor(ctx, a.id, 'hem') });
    t.push({ label: T('Öppna i ny flik'), click: () => gor(ctx, a.id, 'flik') });
    t.push({ type: 'separator' });
    t.push({ label: T('Mobilvy'), type: 'checkbox', checked: a.mobil, click: () => andra({ mobil: !a.mobil }, a.mobil ? 'Mobilvy av' : 'Mobilvy på') });
    t.push({ label: T('Ljud'), type: 'checkbox', checked: a.ljud, click: () => andra({ ljud: !a.ljud }, a.ljud ? 'Ljud av' : 'Ljud på') });
    t.push({ type: 'separator' });
    t.push({ label: T('Flytta upp'), enabled: i > 0, click: () => flytta(i, i - 1) });
    t.push({ label: T('Flytta ned'), enabled: i < lista.length - 1, click: () => flytta(i, i + 1) });
    if (p) t.push({ label: T('Avsluta appen'), click: () => avsluta(ctx, a.id) });
    t.push({ label: T('Ta bort från sidopanelen'), click: () => { satt(lista.filter((x) => x.id !== a.id), 'Tog bort ' + namn); D.sendTo(ctx, 'sidopanel:atgard', 'borttagen', a.id, namn); } });
  } else {
    t.push({ label: T('Lägg till app'), click: () => D.sendTo(ctx, 'sidopanel:atgard', 'lagg-till') });
  }
  t.push({ type: 'separator' });
  const hoger = anpassa.hamta('sidopanel.sida', 'vanster') === 'hoger';
  t.push({ label: hoger ? T('Flytta sidopanelen till vänster') : T('Flytta sidopanelen till höger'), click: () => anpassa.satt('sidopanel.sida', hoger ? 'vanster' : 'hoger', { etikett: 'Sidopanelens placering' }) });
  t.push({ label: T('Dölj sidopanelen'), click: () => { anpassa.satt('sidopanel.visa', false, { etikett: 'Dölj sidopanelen' }); D.sendTo(ctx, 'sidopanel:atgard', 'dold'); } });
  t.push({ label: T('Inställningar för sidopanelen'), click: () => D.sendTo(ctx, 'sidopanel:atgard', 'installningar') });
  try { Menu.buildFromTemplate(t).popup({ window: ctx.win }); } catch {}
}

/* ── Konto byttes: vyerna hör till det gamla kontots lagring → riv och öppna samma app i den nya ── */
function kontoBytt(ctx) {
  const s = ctx ? tillstand.get(ctx) : null; if (!s) return;
  const oppen = s.oppen, yta = s.yta;
  rivFonster(ctx);
  if (oppen && kanOppna(ctx) && appMed(oppen)) { D.sendTo(ctx, 'sidopanel:atgard', 'oppna', oppen); s.yta = yta; }
}
function kontoByttAlla() { for (const ctx of D.wins.values()) kontoBytt(ctx); }

function init(deps) {
  D = deps;
  const ctxAv = (e) => D.ctxFor(e);
  ipcMain.on('sidopanel:tillstand', (e) => {
    const ctx = ctxAv(e);
    try { e.returnValue = tillstandFor(ctx); } catch { e.returnValue = { tillaten: false, ikoner: {}, laddade: {} }; }
    if (ctx) { redoSkal.add(ctx); setImmediate(() => skickaVantande(ctx)); }
  });
  ipcMain.on('sidopanel:oppna', (e, id, yta, bakgrund) => { const ctx = ctxAv(e); if (ctx) oppna(ctx, String(id || ''), yta, String(bakgrund || '')); });
  ipcMain.on('sidopanel:stang', (e) => { const ctx = ctxAv(e); if (ctx) stang(ctx); });
  ipcMain.on('sidopanel:yta', (e, r) => {
    const ctx = ctxAv(e); const s = ctx && tillstand.get(ctx); const ny = rektangel(r);
    if (s && ny) { s.yta = ny; placera(ctx); }
  });
  ipcMain.on('sidopanel:skymd', (e, on) => { const ctx = ctxAv(e); const s = ctx && tillstand.get(ctx); if (s) { s.skymd = !!on; placera(ctx); } });
  ipcMain.on('sidopanel:gor', (e, id, vad) => { const ctx = ctxAv(e); if (ctx && kanOppna(ctx)) gor(ctx, String(id || ''), String(vad || '')); });
  ipcMain.on('sidopanel:meny', (e, id) => { const ctx = ctxAv(e); if (ctx) meny(ctx, id ? String(id) : null); });
  ipcMain.on('sidopanel:spara-ikon', (_e, id, png, kalla) => {
    id = String(id || ''); if (!vantarIkon.has(id)) return;
    vantarIkon.delete(id);
    if (!appMed(id) || !pngOk(png)) return;                              // skalet kunde inte rita bilden: bokstaven får duga
    lasIkoner()[id] = { png, kalla: String(kalla || '').slice(0, 2048) }; sparaIkoner();
    D.broadcast('sidopanel:ikon', id, png);
  });
  ipcMain.on('sidopanel:svar', (e, qid, allow, remember) => {
    const f = fragor.get(Number(qid)); if (f && f.ctx === ctxAv(e)) f.klar({ allow: !!allow, remember: !!remember });
  });
  // Barnreglerna sätts av main.js i samma meddelande – läs dem när den hanteraren har kört
  ipcMain.on('barn:regler', () => setImmediate(barnKoll));
  anpassa.lyssna((nyckel) => { if (String(nyckel).startsWith('sidopanel.')) setImmediate(andrat); });
  // Appar som saknar ikon (t.ex. lagda medan datorn var utan nät) får en ny chans en stund efter start
  app.whenReady().then(() => setTimeout(() => { for (const a of appar()) hamtaIkon(a); }, 6000)).catch(() => {});
}

module.exports = { init, placera, kontoBytt, kontoByttAlla, fraga, genvag, _test: { olasta, ikonKandidater, bildTyp, adressOk, rensaUrl, hamta } };
