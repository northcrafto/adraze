'use strict';
/* Anpassa → inställningar per sajt: zoom, mörkt läge, ljud, JavaScript, reklamblockering och popup-fönster
 * för en viss sajt, och sajt-panelen som öppnas från skölden i adressfältet (ui/sajtpanel.html).
 *
 * Värdena ligger i Anpassa-butiken (anpassa.js), <domän> = värdnamnet utan www. (t.ex. "aftonbladet.se"):
 *   sajt.<domän> → { zoom, mork, ljud }                        rent utseende och ljud: barn får ändra
 *   sajt.skydd   → { "<domän>": { reklam, js, popup }, … }     kan kringgå spärrar/insyn: barnlåst, och gäller
 *                                                               inte alls när något fönster är i barnläge
 * Bara avvikelser sparas (zoom ≠ standard, mork: true, ljud: false, reklam: false, js: false, popup: 'tillat'|'blockera').
 *
 * Så verkställs det (per flik, se flik()):
 *   zoom   – setZoomFactor när sidan byts (efter main.js standardzoom). Ctrl +/−/0 sparas per sajt, som i Chrome.
 *   mörkt  – Chromiums egen automatiska mörkläggning (Emulation.setAutoDarkModeOverride) + prefers-color-scheme: dark,
 *            via flikens egen felsökningsanslutning (webContents.debugger, ingen port öppnas).
 *   js     – Emulation.setScriptExecutionDisabled, satt INNAN nya sidan laddas (did-start-navigation).
 *   ljud   – setAudioMuted; fliken i skalet visas som tystad.
 *   reklam – adblock.sajtAv(toppsida): blockeraren släpper igenom allt på sajtens sidor (adblock-adraze.js).
 *   popup  – popupBeslut() i flikens setWindowOpenHandler (main.js).
 * Privata flikar läser inställningarna men sparar aldrig något (sajten ska inte hamna på disken). */
const path = require('path');
const { ipcMain, WebContentsView } = require('electron');
const { fyll } = require('./i18n-fyll');

let A = null;     // anpassa.js
let M = {};       // krokar från main.js (se init)
let skyddKarta = {};   // kopia av sajt.skydd (läses för varje nätverksförfrågan → ingen djupkopia per anrop)

const PANEL_W = 378;   // vyns bredd: kortet (350) + marginal för skuggan (sajtpanel.html .kort)
const ZOOM_STEG = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const NEKA = { action: 'deny' };

/* ── Domän och värden ── */
let senastUrl = '', senastDom = '';
function domanAv(url) {
  url = String(url || '');
  if (url === senastUrl) return senastDom;
  let d = '';
  try {
    const u = new URL(url);
    if (/^https?:$/.test(u.protocol)) d = u.hostname.toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
  } catch {}
  if (d === 'skydd') d = '';   // nyckeln sajt.skydd är upptagen (en värd som heter exakt "skydd" får inga egna inställningar)
  senastUrl = url; senastDom = d;
  return d;
}
const arObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// Butikens värde för en sajt, rensat (en importerad delningskod kan innehålla vad som helst)
function utseende(dom) {
  if (!dom) return {};
  const v = A.hamta('sajt.' + dom); const ut = {};
  if (!arObj(v)) return ut;
  const z = Number(v.zoom); if (z >= 0.25 && z <= 5) ut.zoom = Math.round(z * 100) / 100;
  if (v.mork === true) ut.mork = true;
  if (v.ljud === false) ut.ljud = false;
  return ut;
}
function skyddSparat(dom) {
  const v = dom && arObj(skyddKarta) ? skyddKarta[dom] : null; const ut = {};
  if (!arObj(v)) return ut;
  if (v.reklam === false) ut.reklam = false;
  if (v.js === false) ut.js = false;
  if (v.popup === 'tillat' || v.popup === 'blockera') ut.popup = v.popup;
  return ut;
}
// Det som faktiskt gäller nu: inget av det barnlåsta så länge något fönster är i barnläge
function skydd(dom) { return M.barn() ? {} : skyddSparat(dom); }
function lasSkydd() { const v = A.hamta('sajt.skydd'); skyddKarta = arObj(v) ? v : {}; }
const tom = (o) => !o || !Object.keys(o).length;
const utanTomma = (o) => { const ut = {}; for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null) ut[k] = v; return ut; };

function satUtseende(dom, andring, etikett) {
  const ny = utanTomma({ ...utseende(dom), ...andring });
  return A.satt('sajt.' + dom, tom(ny) ? undefined : ny, { etikett });
}
function satSkydd(dom, andring, etikett) {
  const alla = { ...(arObj(A.hamta('sajt.skydd')) ? A.hamta('sajt.skydd') : {}) };
  const ny = utanTomma({ ...skyddSparat(dom), ...andring });
  if (tom(ny)) delete alla[dom]; else alla[dom] = ny;
  return A.satt('sajt.skydd', tom(alla) ? undefined : alla, { etikett });
}

/* ── Flikens felsökningsanslutning (mörkt läge och JavaScript av) ── */
async function cdp(wc, metod, param) {
  if (!wc || wc.isDestroyed()) return false;
  const d = wc.debugger;
  try {
    if (!d.isAttached()) {
      d.attach('1.3');
      if (!wc.__sajtCdpLyssnar) {
        wc.__sajtCdpLyssnar = true;
        // Kopplas anslutningen bort (t.ex. kraschad sidprocess) försvinner Chromiums inställningar → sätts igen vid nästa sida
        d.on('detach', () => { const s = wc.__sajt; if (s) { s.jsAv = false; s.mork = false; } });
      }
    }
    await d.sendCommand(metod, param || {});
    return true;
  } catch (e) { if (process.env.ADRAZE_DEBUG) console.warn('[anpassa-sajt] cdp', metod, String(e)); return false; }
}

function satJs(wc, dom) {
  const s = wc.__sajt; if (!s) return;
  const av = skydd(dom).js === false;
  if (av === !!s.jsAv) return;
  s.jsAv = av;
  cdp(wc, 'Emulation.setScriptExecutionDisabled', { value: av });
}
function satMork(wc, dom) {
  const s = wc.__sajt; if (!s) return;
  const pa = utseende(dom).mork === true;
  if (pa === !!s.mork) return;
  s.mork = pa;
  cdp(wc, 'Emulation.setAutoDarkModeOverride', pa ? { enabled: true } : {});
  cdp(wc, 'Emulation.setEmulatedMedia', { features: pa ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
}
const inkognito = (s) => !!(s && s.ctx && (s.ctx.incognito || (s.ctx.incognitoTabs && s.ctx.incognitoTabs.has(s.tabId))));
const standardZoom = (s) => (s && s.ctx && s.ctx.defaultZoom) || 1;
function zooma(wc) {
  const s = wc.__sajt; if (!s || wc.isDestroyed()) return;
  const z = utseende(s.dom).zoom;
  // Ingen egen zoom: standard (Chromium minns annars senaste zoomen per värd så länge AdRaze är igång).
  // Privata flikar: Ctrl +/− sparas inte, så där får Chromiums egen zoom för stunden vara kvar.
  const mal = z || (inkognito(s) ? null : standardZoom(s));
  try { if (mal && Math.abs(wc.getZoomFactor() - mal) > 0.001) wc.setZoomFactor(mal); } catch {}
}
function satLjud(wc) {
  const s = wc.__sajt; if (!s || wc.isDestroyed()) return;
  const manuellt = !!(s.ctx.mutedTabs && s.ctx.mutedTabs.has(s.tabId));
  const sajt = utseende(s.dom).ljud === false && s.ljudUndantag !== s.dom;
  const tyst = manuellt || sajt;
  try { if (wc.isAudioMuted() !== tyst) wc.setAudioMuted(tyst); } catch {}
  if (s.tystVisad !== tyst) { s.tystVisad = tyst; M.sendTo(s.ctx, 'sajt:ljud', s.tabId, tyst); }
}
// Allt för sidan som nu visas i fliken
function tillampa(wc) {
  const s = wc.__sajt; if (!s || wc.isDestroyed()) return;
  let url = ''; try { url = wc.getURL(); } catch {}
  const dom = domanAv(url);
  if (dom !== s.dom) { s.dom = dom; s.ljudUndantag = ''; }
  satJs(wc, dom); satMork(wc, dom); zooma(wc); satLjud(wc);
}
function allaFlikar() {
  const ut = [];
  for (const ctx of M.wins.values()) for (const v of ctx.views.values()) { try { if (!v.webContents.isDestroyed() && v.webContents.__sajt) ut.push(v.webContents); } catch {} }
  return ut;
}

/* Krok från main.js ensureView(): varje flik (även en kastad flik som väcks igen) */
function flik(wc, ctx, tabId) {
  if (!wc || wc.__sajt) return;
  wc.__sajt = { ctx, tabId, dom: '', jsAv: false, mork: false, tystVisad: false, ljudUndantag: '' };
  if (ctx.sajtPanel) stangPanel(ctx);   // en ny vy läggs överst och skulle annars täcka panelen
  // JavaScript av måste sättas innan den nya sidan börjar köra skript
  const fore = (url) => { satJs(wc, domanAv(url)); };
  wc.on('did-start-navigation', (_e, url, inPage, isMain) => {
    if (!isMain || inPage) return;
    fore(url);
    if (ctx.sajtPanel && ctx.sajtPanel.tabId === tabId) stangPanel(ctx);
  });
  wc.on('did-redirect-navigation', (_e, url, inPage, isMain) => { if (isMain && !inPage) fore(url); });
  wc.on('did-navigate', () => tillampa(wc));
  wc.on('dom-ready', () => zooma(wc));             // efter main.js standardzoom (den lyssnaren registreras före den här)
  wc.on('did-stop-loading', () => tillampa(wc));   // avbruten navigering: tillbaka till det som gäller sidan som syns
}

/* Krok från flikens setWindowOpenHandler (main.js). null = de vanliga reglerna avgör. */
function popupBeslut(wc, details) {
  const s = wc && wc.__sajt; if (!s) return null;
  if (M.barn() || M.barnFonster(s.ctx)) return null;   // barnläge: aldrig egna regler (popup blir flik, som förut)
  let fran = ''; try { fran = wc.getURL(); } catch {}
  const dom = domanAv(fran);
  const lage = skydd(dom).popup; if (!lage) return null;
  const url = String((details && details.url) || '');
  const fonster = details.disposition === 'new-window' || !!(details.features && details.features.length);
  if (lage === 'blockera') {
    if (fonster) return NEKA;
    // Nya flikar bara från en riktig länk du nyss klickat på (target=_blank, mittenklick)
    const lc = wc.__lastClick;
    const lank = !!(lc && lc.href && Date.now() - lc.t < 3000 && (lc.href === url || M.sammaSajt(lc.href, url)));
    return lank ? null : NEKA;
  }
  // Tillåt: fönster öppnas på riktigt, även till andra sajter. Reklam-/skräpadresser stoppas ändå
  // (även med reklamblockeringen av för sajten – fönstervakten i main.js stänger dem annars direkt).
  if (url && url !== 'about:blank' && !/^https?:/i.test(url)) return NEKA;
  if (/^https?:/i.test(url) && M.adblockPa() && M.blockerad(url, fran)) return NEKA;
  if (fonster) {
    return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, resizable: true, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'content-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, session: wc.session } } };
  }
  if (/^https?:/i.test(url)) M.sendTo(s.ctx, 'open-new-tab', url);
  return NEKA;
}

/* Krok från filtermotorn: är blockeraren avstängd för sajten som visas i fliken? */
function reklamAv(toppUrl) {
  const dom = domanAv(toppUrl); if (!dom) return false;
  const v = skyddKarta[dom];
  return !!(v && v.reklam === false) && !M.barn();
}

/* ── Sajt-panelen: en liten vy ovanpå fliken (skalets DOM ligger under sidans vy, som nedladdningsrutan) ── */
function panelPrefs() {
  return { preload: path.join(__dirname, 'popup-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, transparent: true };
}
function flikWc(ctx, tabId) { const v = ctx && ctx.views.get(tabId); return v && !v.webContents.isDestroyed() ? v.webContents : null; }
function placeraPanel(ctx) {
  const p = ctx.sajtPanel; if (!p || ctx.win.isDestroyed()) return;
  const cb = ctx.win.getContentBounds();
  const x = Math.max(4, Math.min(Math.round(p.ankare.x), cb.width - PANEL_W - 4));
  const y = Math.max(0, Math.round(p.ankare.y));
  const h = Math.max(120, Math.min(p.hojd || 420, cb.height - y - 8));
  try { p.view.setBounds({ x, y, width: PANEL_W, height: h }); } catch {}
}
function stangPanel(ctx, avPanelen) {
  const p = ctx && ctx.sajtPanel; if (!p) return;
  ctx.sajtPanel = null;
  // Stängd av panelen själv (oftast fokus som försvann – t.ex. klicket på skölden): se oppnaPanel
  if (avPanelen) ctx._sajtPanelStangd = { t: Date.now(), tabId: p.tabId };
  try { ctx.win.removeListener('resize', p.vidStorlek); ctx.win.removeListener('move', p.vidStorlek); } catch {}
  try { ctx.win.contentView.removeChildView(p.view); } catch {}
  try { p.view.webContents.close(); } catch {}
}
function oppnaPanel(ctx, d) {
  if (!ctx || !ctx.win || ctx.win.isDestroyed() || !d) return;
  const tabId = d.flik;
  if (ctx.sajtPanel) { const samma = ctx.sajtPanel.tabId === tabId; stangPanel(ctx); if (samma) return; }
  // Klicket på skölden tog fokus från panelen (som då stängde sig) – det klicket ska bara stänga, inte öppna igen
  const st = ctx._sajtPanelStangd; ctx._sajtPanelStangd = null;
  if (st && st.tabId === tabId && Date.now() - st.t < 350) return;
  const wc = flikWc(ctx, tabId); if (!wc) return;
  let url = ''; try { url = wc.getURL(); } catch {}
  const dom = domanAv(url); if (!dom) return;
  const view = new WebContentsView({ webPreferences: panelPrefs() });
  try { view.setBackgroundColor('#00000000'); } catch {}
  const p = { view, tabId, dom, url, ankare: { x: (Number(d.x) || 0) - 18, y: (Number(d.y) || 0) - 2 }, hojd: 420,
    favicon: typeof d.favicon === 'string' && /^(https:\/\/|data:image\/)/i.test(d.favicon) && d.favicon.length < 200000 ? d.favicon : '' };
  p.vidStorlek = () => stangPanel(ctx);
  ctx.sajtPanel = p;
  ctx.win.contentView.addChildView(view);
  placeraPanel(ctx);
  ctx.win.on('resize', p.vidStorlek); ctx.win.on('move', p.vidStorlek);
  view.webContents.loadFile(path.join(__dirname, 'ui', 'sajtpanel.html'), { query: { theme: d.tema === 'dark' ? 'dark' : 'light' } }).catch(() => {});
  view.webContents.once('did-finish-load', () => { try { if (ctx.sajtPanel === p) view.webContents.focus(); } catch {} });
}
function panelCtx(e) {
  for (const ctx of M.wins.values()) { const p = ctx.sajtPanel; if (p && !p.view.webContents.isDestroyed() && p.view.webContents === e.sender) return ctx; }
  return null;
}
function panelData(ctx) {
  const p = ctx.sajtPanel; const wc = flikWc(ctx, p.tabId); if (!wc) return null;
  const s = wc.__sajt || { ctx, tabId: p.tabId };
  const u = utseende(p.dom), sk = skydd(p.dom), barn = M.barn();
  let origin = ''; try { origin = new URL(p.url).origin; } catch {}
  let zoom = 1; try { zoom = wc.getZoomFactor(); } catch {}
  return {
    doman: p.dom, origin, favicon: p.favicon, sakert: /^https:/i.test(p.url), inkognito: inkognito(s), barn,
    adblockPa: !!M.adblockPa(),
    zoom: Math.round(zoom * 100) / 100, zoomSparad: !!u.zoom, standardZoom: standardZoom(s),
    mork: !!u.mork, ljud: u.ljud !== false, reklam: sk.reklam !== false, js: sk.js !== false, popup: sk.popup || 'standard',
    andrat: !tom(u) || (!barn && !tom(skyddSparat(p.dom))),
  };
}
function nastaZoom(nu, steg) {
  if (steg > 0) return ZOOM_STEG.find((z) => z > nu + 0.001) || ZOOM_STEG[ZOOM_STEG.length - 1];
  return [...ZOOM_STEG].reverse().find((z) => z < nu - 0.001) || ZOOM_STEG[0];
}
const ETIKETT = { mork: 'Mörkt läge', ljud: 'Ljud', reklam: 'Reklamblockering', js: 'JavaScript', popup: 'Popup-fönster' };
// Ångra-historikens etiketter: hela svenska mallar (översätts när de visas, se i18n-fyll.js)
const ETIKETT_PA = { mork: 'Mörkt läge på {dom}', ljud: 'Ljud på {dom}', reklam: 'Reklamblockering på {dom}', js: 'JavaScript på {dom}', popup: 'Popup-fönster på {dom}' };

function registreraIpc() {
  // Skalet: skölden klickad (bara från skalets egna fönster)
  ipcMain.on('sajt:oppna', (e, d) => { const ctx = M.wins.get(e.sender.id); if (ctx) oppnaPanel(ctx, d); });
  // Panelen (ui/sajtpanel.html)
  ipcMain.handle('sajt:panel-data', (e) => { const ctx = panelCtx(e); return ctx ? panelData(ctx) : null; });
  ipcMain.handle('sajt:panel-satt', (e, d) => {
    const ctx = panelCtx(e); if (!ctx || !d || !ETIKETT[d.falt]) return null;
    const p = ctx.sajtPanel; const wc = flikWc(ctx, p.tabId);
    if (!wc || inkognito(wc.__sajt)) return { ok: false, error: 'inkognito', data: panelData(ctx) };
    const etikett = fyll(ETIKETT_PA[d.falt], { dom: p.dom }); const v = d.varde;
    let r;
    if (d.falt === 'mork') r = satUtseende(p.dom, { mork: v ? true : undefined }, etikett);
    else if (d.falt === 'ljud') r = satUtseende(p.dom, { ljud: v ? undefined : false }, etikett);
    else if (d.falt === 'reklam') r = satSkydd(p.dom, { reklam: v ? undefined : false }, etikett);
    else if (d.falt === 'js') r = satSkydd(p.dom, { js: v ? undefined : false }, etikett);
    else r = satSkydd(p.dom, { popup: v === 'tillat' || v === 'blockera' ? v : undefined }, etikett);
    return { ok: !!(r && r.ok), error: r && r.error, data: panelData(ctx) };
  });
  ipcMain.handle('sajt:panel-zoom', (e, steg) => {
    const ctx = panelCtx(e); if (!ctx) return null;
    const p = ctx.sajtPanel; const wc = flikWc(ctx, p.tabId); if (!wc) return null;
    const s = wc.__sajt; const std = standardZoom(s);
    let nu = 1; try { nu = wc.getZoomFactor(); } catch {}
    const z = steg === 0 ? std : nastaZoom(nu, steg > 0 ? 1 : -1);
    try { wc.setZoomFactor(z); } catch {}
    if (!inkognito(s)) satUtseende(p.dom, { zoom: Math.abs(z - std) < 0.001 ? undefined : z }, fyll('Zoom på {dom}', { dom: p.dom }));
    return panelData(ctx);
  });
  ipcMain.handle('sajt:panel-aterstall', (e) => {
    const ctx = panelCtx(e); if (!ctx) return null;
    const p = ctx.sajtPanel; const wc = flikWc(ctx, p.tabId); if (!wc) return null;
    if (inkognito(wc.__sajt)) return { ok: false, error: 'inkognito', data: panelData(ctx) };
    const etikett = fyll('Återställ {x}', { x: p.dom });
    const r1 = A.satt('sajt.' + p.dom, undefined, { etikett });
    const r2 = tom(skyddSparat(p.dom)) ? { ok: true } : satSkydd(p.dom, { reklam: undefined, js: undefined, popup: undefined }, etikett);
    try { wc.setZoomFactor(standardZoom(wc.__sajt)); } catch {}
    return { ok: !!(r1.ok && r2.ok), error: r2.error || r1.error, data: panelData(ctx) };
  });
  ipcMain.on('sajt:panel-ladda-om', (e) => { const ctx = panelCtx(e); if (!ctx) return; const wc = flikWc(ctx, ctx.sajtPanel.tabId); stangPanel(ctx); try { if (wc) wc.reload(); } catch {} });
  ipcMain.on('sajt:panel-alla', (e) => { const ctx = panelCtx(e); if (!ctx) return; stangPanel(ctx); M.sendTo(ctx, 'sajt:visa-alla'); });
  ipcMain.on('sajt:panel-stang', (e) => { const ctx = panelCtx(e); if (ctx) stangPanel(ctx, true); });
  ipcMain.on('sajt:panel-storlek', (e, h) => {
    const ctx = panelCtx(e); if (!ctx || typeof h !== 'number' || !isFinite(h)) return;
    ctx.sajtPanel.hojd = Math.round(h); placeraPanel(ctx);
  });

  /* Lyssnar vid sidan av main.js egna hanterare för flikarna (registreras före dem → setImmediate där ordningen spelar roll) */
  const ctxAv = (e) => M.wins.get(e.sender.id);
  // Ctrl +/−/0 och menyns zoom: sparas för sajten (inte i privata flikar). 0 = tillbaka till standard.
  ipcMain.on('view:zoom', (e, id, dir) => setImmediate(() => {
    const ctx = ctxAv(e); const wc = flikWc(ctx, id); const s = wc && wc.__sajt; if (!s || !s.dom || inkognito(s)) return;
    let z = 1; try { z = Math.round(wc.getZoomFactor() * 100) / 100; } catch {}
    satUtseende(s.dom, { zoom: dir === 0 || Math.abs(z - standardZoom(s)) < 0.001 ? undefined : z }, fyll('Zoom på {dom}', { dom: s.dom }));
  }));
  // Ny standardzoom (Utseende): main.js sätter den på alla flikar – sajterna med egen zoom behåller sin
  ipcMain.on('view:default-zoom', (e) => setImmediate(() => { const ctx = ctxAv(e); if (ctx) for (const v of ctx.views.values()) { try { zooma(v.webContents); } catch {} } }));
  // Ljudknappen på fliken: slår du på ljudet på en tystad sajt gäller det fliken tills den lämnar sajten
  ipcMain.on('view:mute', (e, id, on) => {
    const ctx = ctxAv(e); const wc = flikWc(ctx, id); const s = wc && wc.__sajt; if (!s) return;
    s.ljudUndantag = !on && utseende(s.dom).ljud === false ? s.dom : '';
    s.tystVisad = !!on;
    setImmediate(() => satLjud(wc));
  });
  // Byte av flik, eller sidan döljs (inställningar, förslagslistan): panelen hör till fliken den öppnades för
  ipcMain.on('view:show', (e, id) => { const ctx = ctxAv(e); if (ctx && ctx.sajtPanel && ctx.sajtPanel.tabId !== id) stangPanel(ctx); });
  ipcMain.on('view:hide', (e) => { const ctx = ctxAv(e); if (ctx && ctx.sajtPanel) stangPanel(ctx); });
  ipcMain.on('view:destroy', (e, id) => { const ctx = ctxAv(e); if (ctx && ctx.sajtPanel && ctx.sajtPanel.tabId === id) stangPanel(ctx); });
  // Barnläge av/på: det barnlåsta slutar/börjar gälla på öppna flikar
  ipcMain.on('barn:regler', () => setImmediate(() => { for (const wc of allaFlikar()) tillampa(wc); }));
}

function registreraNycklar() {
  A.registrera({ nyckel: 'sajt.*', standard: undefined, etikett: 'Inställningar för en sajt', barnLast: false });
  A.registrera({ nyckel: 'sajt.skydd', standard: undefined, etikett: 'Reklam, JavaScript och popup-fönster per sajt', barnLast: true, importBar: false });
}

/* init från main.js. o = { anpassa, adblock, wins, sendTo, barn(), barnFonster(ctx), adblockPa(), blockerad(url, fran), sammaSajt(a, b) } */
function init(o) {
  A = o.anpassa; M = o;
  registreraNycklar();
  lasSkydd();
  if (o.adblock) o.adblock.sajtAv = (u) => reklamAv(u);
  A.lyssna((nyckel) => {
    if (nyckel !== 'sajt.skydd' && !String(nyckel).startsWith('sajt.')) return;
    if (nyckel === 'sajt.skydd') lasSkydd();
    // Öppna flikar på sajten (alla, när skydd-kartan ändras) får det nya direkt. JavaScript/reklam gäller från nästa laddning.
    const dom = nyckel === 'sajt.skydd' ? null : nyckel.slice(5);
    for (const wc of allaFlikar()) if (!dom || wc.__sajt.dom === dom) tillampa(wc);
  });
  registreraIpc();
}

module.exports = { init, flik, popupBeslut, reklamAv, domanAv };
