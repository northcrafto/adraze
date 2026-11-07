// Anpassa › Ångra (huvudprocessen): ångra en hel grupp ändringar på en gång – en återställning, en import eller det
// Falk ändrade i ett och samma svar – spara delningskoden med alla inställningar som fil, och visa toasten
// "Ändrat: X · Ångra" ovanpå webbsidan när en sida syns (ui/anpassa-toast.html).
// Används av Ångra-panelen i skalet (ui/anpassa-angra.js) och av Falk (anpassa-falk.js).
const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, BrowserWindow, WebContentsView } = require('electron');
const anpassa = require('./anpassa');

const GRUPP_MS = 3000;   // ändringar i samma grupp ligger tätt (en återställning tar millisekunder, ett Falk-svar någon sekund)

// Vilken grupp en ändring hör till (null = ensam ändring)
function gruppAv(etikett) {
  const e = String(etikett || '');
  if (e.startsWith('Falk:')) return 'Falk';
  if (e.startsWith('Återställ') || e === 'Importerat') return e;
  return null;
}
// Etiketten ur registret ("Accentfärg"), annars historikens egen
function etikettFor(nyckel, reserv) {
  const reg = anpassa.registret();
  const r = reg[nyckel] || Object.entries(reg).find(([k]) => k.endsWith('.*') && String(nyckel).startsWith(k.slice(0, -1)))?.[1];
  let e = (r && r.etikett) || String(reserv || nyckel || '');
  if (e.startsWith('Falk:')) e = e.slice(5).trim();
  return e;
}
// Hur många av de senaste ändringarna (de som går att ångra just nu) som hör ihop
function gruppStorlek() {
  const h = anpassa.historik().filter((x) => x && !anpassa.last(x.nyckel));
  if (!h.length) return 0;
  const g = gruppAv(h[h.length - 1].etikett);
  if (!g) return 1;
  let n = 1;
  for (let i = h.length - 2; i >= 0; i--) {
    if (gruppAv(h[i].etikett) !== g || h[i + 1].ts - h[i].ts > GRUPP_MS) break;
    n++;
  }
  return n;
}
// Ångra senaste ändringen – eller hela gruppen den hör till
function angraGrupp() {
  const n = gruppStorlek();
  const gjort = [];
  for (let i = 0; i < n; i++) { const r = anpassa.angra(); if (!r || !r.ok) break; gjort.push(r); }
  if (!gjort.length) return { ok: false, error: 'tomt' };
  const etiketter = [...new Set(gjort.map((r) => etikettFor(r.nyckel, r.etikett)))];
  return { ok: true, antal: gjort.length, nycklar: gjort.map((r) => r.nyckel), etiketter };
}

/* ── Toasten "Ändrat: X · Ångra" ovanpå en webbsida ──
 * Skalet ritar toasten själv, längst ner i mitten av innehållsytan, när det är skalet som syns där (Anpassa,
 * startsidan). En webbsida ritas däremot ovanpå skalet. Syns en sida läggs toasten därför i en egen liten,
 * genomskinlig vy ovanpå sidan, längst ner i mitten av SIDAN – aldrig över flikraden eller verktygsraden, var de än
 * ligger. Vyn är exakt så stor som rutan (plus skuggan), så att den inte tar klick från resten av sidan. */
const TOAST_MAX = 560;
let D = {};                       // main.js: ctxFor, sendTo, POPUP_PREFS
const toaster = new Map();        // ctx → { vy, wcId, klar, d, w, h, synlig, stangT }
const toastAgare = new Map();     // toastvyns webContents-id → ctx
const senaste = new Map();        // ctx → { d, slut }: toasten som visas just nu (i skalet eller ovanpå sidan) och när den går ut
let toastNr = 0;
const tal = (v, min, max, std) => (Number.isFinite(+v) ? Math.max(min, Math.min(max, Math.round(+v))) : std);

// Den synliga flikens yta – null när ingen webbsida syns (Anpassa öppet, startsidan, helskärm, Falk över hela ytan)
function sidaFor(ctx) {
  if (!ctx || !ctx.win || ctx.win.isDestroyed() || ctx.htmlFull) return null;
  if ((ctx.kryptoOpen && ctx.kryptoFull) || (ctx.chattOpen && ctx.chattFull)) return null;
  const v = ctx.visibleTab != null && ctx.views ? ctx.views.get(ctx.visibleTab) : null;
  if (!v) return null;
  try { if (v.getVisible && !v.getVisible()) return null; const b = v.getBounds(); return b && b.width >= 160 && b.height >= 80 ? b : null; } catch { return null; }
}
function toastVy(ctx) {
  let t = toaster.get(ctx);
  if (t && !t.vy.webContents.isDestroyed()) { clearTimeout(t.stangT); return t; }
  if (t) stangToast(ctx);   // vyn dog – städa och gör en ny
  const vy = new WebContentsView({ webPreferences: D.POPUP_PREFS({ transparent: true, backgroundThrottling: false }) });
  try { vy.setBackgroundColor('#00000000'); } catch {}
  vy.setVisible(false);
  vy.setBounds({ x: 0, y: 0, width: TOAST_MAX + 40, height: 80 });   // mäts först, visas sedan i rätt storlek
  t = { vy, wcId: vy.webContents.id, klar: false, d: null, w: 0, h: 0, knapp: null, synlig: false, stangT: 0 };
  toaster.set(ctx, t); toastAgare.set(t.wcId, ctx);
  vy.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  vy.webContents.on('will-navigate', (e) => e.preventDefault());
  vy.webContents.on('render-process-gone', () => { if (toaster.get(ctx) === t) stangToast(ctx); });
  // Rutan tar inte något klickbart från sidan: klick, hjul och dragningar utanför Ångra-knappen går vidare till sidan under
  // (rörelserna ser rutan också, så att knappen vet när musen lämnar den)
  vy.webContents.on('before-mouse-event', (ev, m) => {
    if (!m || m.type === 'mouseEnter' || m.type === 'mouseLeave') return;
    const k = t.knapp;
    if (k && m.x >= k.x && m.x < k.x + k.w && m.y >= k.y && m.y < k.y + k.h) return;   // Ångra-knappen
    if (m.type !== 'mouseMove') ev.preventDefault();
    if (m.type === 'contextMenu') return;   // sidan öppnar sin egen meny av musknapparna
    const v = ctx.visibleTab != null && ctx.views ? ctx.views.get(ctx.visibleTab) : null;
    if (!v || v.webContents.isDestroyed()) return;
    try {
      const tb = t.vy.getBounds(), sb = v.getBounds();
      if (m.type === 'mouseDown') v.webContents.focus();
      v.webContents.sendInputEvent({ ...m, x: Math.round(m.x + tb.x - sb.x), y: Math.round(m.y + tb.y - sb.y) });
    } catch {}
  });
  try { ctx.win.contentView.addChildView(vy); } catch {}
  vy.webContents.loadFile(path.join(__dirname, 'ui', 'anpassa-toast.html')).then(() => {
    if (toaster.get(ctx) !== t) return;
    t.klar = true;
    if (t.d) skickaToast(t);
  }).catch(() => {});
  koppla(ctx);
  return t;
}
// En gång per fönster: städa när fönstret stängs, flytta toasten när fönstret ändrar storlek
function koppla(ctx) {
  if (ctx.anpToastKopplad || !ctx.win || ctx.win.isDestroyed()) return;
  ctx.anpToastKopplad = true;
  ctx.win.once('closed', () => { stangToast(ctx); senaste.delete(ctx); });
  ctx.win.on('resize', () => setTimeout(() => placeraToast(ctx), 80));   // efter att skalet mätt om sidans yta
}
function skickaToast(t) { try { t.vy.webContents.send('anpassa-angra:toast-visa', t.d); } catch {} }
function visaToast(ctx, d) {
  const sida = sidaFor(ctx);
  if (!sida || !d) { gomToast(ctx); return false; }   // skalet visar den själv
  if (!D.POPUP_PREFS) return false;
  const t = toastVy(ctx);
  t.synlig = false; t.knapp = null;
  t.d = { id: ++toastNr, text: String(d.text || '').slice(0, 200), angra: d.angra ? String(d.angraText || 'Ångra').slice(0, 30) : '',
    ms: tal(d.ms, 1000, 12000, 5000), tema: d.tema === 'dark' ? 'dark' : 'light', max: Math.max(140, Math.min(TOAST_MAX, sida.width - 40)) };
  if (t.klar) skickaToast(t);
  return true;
}
function placeraToast(ctx) {
  const t = toaster.get(ctx);
  if (!t || !t.synlig) return;
  const sida = sidaFor(ctx);
  if (!sida) { gomToast(ctx); return; }
  try {
    ctx.win.contentView.addChildView(t.vy);   // överst: ovanför sidan och de andra små rutorna
    t.vy.setBounds({ x: Math.round(sida.x + (sida.width - t.w) / 2), y: Math.round(sida.y + sida.height - t.h - 4), width: t.w, height: t.h });
    t.vy.setVisible(true);
  } catch {}
}
function gomToast(ctx) {
  const t = toaster.get(ctx);
  if (!t) return;
  t.synlig = false; t.d = null;
  try { t.vy.setVisible(false); } catch {}
  clearTimeout(t.stangT);
  t.stangT = setTimeout(() => stangToast(ctx), 60000);   // vyn behövs inte när det är tyst en stund
}
function stangToast(ctx) {
  const t = toaster.get(ctx);
  if (!t) return;
  clearTimeout(t.stangT);
  toaster.delete(ctx); toastAgare.delete(t.wcId); senaste.delete(ctx);
  try { if (ctx.win && !ctx.win.isDestroyed()) ctx.win.contentView.removeChildView(t.vy); } catch {}
  try { if (!t.vy.webContents.isDestroyed()) t.vy.webContents.close(); } catch {}
}
// För testerna: var toasten ligger i varje fönster och sidans yta under den
function toastLage() {
  return [...toaster.entries()].map(([ctx, t]) => {
    let b = null, syns = false;
    try { b = t.vy.getBounds(); syns = !!(t.vy.getVisible ? t.vy.getVisible() : t.synlig); } catch {}
    return { syns: syns && t.synlig, toast: b, sida: sidaFor(ctx), id: ctx.win && !ctx.win.isDestroyed() ? ctx.win.id : null };
  });
}

// Sidan göms (Anpassa öppnas, verktygsfältet anpassas …) medan toasten ligger ovanpå den: toasten fortsätter i skalet.
// Sidan visas igen medan skalets toast är kvar: toasten flyttar upp ovanpå sidan (annars skulle den ligga under sidan).
function sidanGoms(ctx) {
  const t = toaster.get(ctx), s = senaste.get(ctx);
  if (!t || !t.d) return;
  gomToast(ctx);
  const kvar = s ? s.slut - Date.now() : 0;
  if (s && kvar > 600 && D.sendTo) D.sendTo(ctx, 'anpassa-angra:toast-i-skalet', { text: s.d.text, angra: !!s.d.angra, ms: Math.max(1500, kvar) });
}
function sidanVisas(ctx) {
  const s = senaste.get(ctx);
  if (!s) return;
  const kvar = s.slut - Date.now();
  if (kvar < 600) { senaste.delete(ctx); return; }
  const t = toaster.get(ctx);
  if (t && t.d) return;   // ligger redan ovanpå sidan
  if (visaToast(ctx, { ...s.d, ms: Math.max(1500, kvar) }) && D.sendTo) D.sendTo(ctx, 'anpassa-angra:toast-ovanpa');
}

function init(deps) {
  D = deps || {};
  ipcMain.handle('anpassa-angra:angra', () => angraGrupp());
  // Toasten: skalet frågar om den ska ligga ovanpå en webbsida (true) eller om skalet visar den själv (false)
  ipcMain.handle('anpassa-angra:toast', (e, d) => {
    const ctx = D.ctxFor && D.ctxFor(e);
    if (!ctx || !d || typeof d !== 'object') return false;
    const text = String(d.text || '').slice(0, 200), ms = tal(d.ms, 1000, 12000, 5000);
    koppla(ctx);
    senaste.set(ctx, { d: { text, angra: !!d.angra, angraText: String(d.angraText || 'Ångra').slice(0, 30), tema: d.tema }, slut: Date.now() + ms });
    return visaToast(ctx, { ...d, text, ms });
  });
  ipcMain.on('anpassa-angra:toast-gom', (e) => { const ctx = D.ctxFor && D.ctxFor(e); if (ctx) { senaste.delete(ctx); gomToast(ctx); } });
  // Skalet visar eller gömmer webbsidan (efter main.js egna lyssnare, så flikens vy är redan visad/gömd)
  for (const k of ['view:show', 'view:load']) ipcMain.on(k, (e) => { const ctx = D.ctxFor && D.ctxFor(e); if (ctx) setImmediate(() => sidanVisas(ctx)); });
  ipcMain.on('view:hide', (e) => { const ctx = D.ctxFor && D.ctxFor(e); if (ctx) sidanGoms(ctx); });
  // Från toastvyn: hur stor rutan blev, tiden är slut, Ångra klickades
  ipcMain.on('anpassa-angra:toast-storlek', (e, s) => {
    const ctx = toastAgare.get(e.sender.id), t = ctx && toaster.get(ctx);
    if (!t || !t.d || !s || s.id !== t.d.id) return;
    t.w = tal(s.w, 40, TOAST_MAX + 40, 300); t.h = tal(s.h, 24, 120, 56);
    const k = s.knapp && typeof s.knapp === 'object' ? s.knapp : null;   // Ångra-knappens ruta i vyn (klick där stannar i rutan)
    t.knapp = k ? { x: tal(k.x, 0, t.w, 0), y: tal(k.y, 0, t.h, 0), w: tal(k.w, 0, t.w, 0), h: tal(k.h, 0, t.h, 0) } : null;
    t.synlig = true;
    placeraToast(ctx);
  });
  ipcMain.on('anpassa-angra:toast-slut', (e, id) => { const ctx = toastAgare.get(e.sender.id), t = ctx && toaster.get(ctx); if (t && t.d && t.d.id === id) { senaste.delete(ctx); gomToast(ctx); } });
  ipcMain.on('anpassa-angra:toast-klick', (e, id) => {
    const ctx = toastAgare.get(e.sender.id), t = ctx && toaster.get(ctx);
    if (!t || !t.d || t.d.id !== id) return;
    senaste.delete(ctx); gomToast(ctx);
    try { const v = ctx.visibleTab != null && ctx.views.get(ctx.visibleTab); if (v) v.webContents.focus(); else ctx.win.webContents.focus(); } catch {}   // fokus tillbaka till sidan (eller skalet)
    if (D.sendTo) D.sendTo(ctx, 'anpassa-angra:toast-angra');   // skalet ångrar (samma väg som toasten i skalet)
  });
  // Spara alla inställningar som fil. Koden tas fram här (inte i fönstret) och du väljer var filen hamnar.
  ipcMain.handle('anpassa-angra:spara-fil', async (e) => {
    const kod = anpassa.exportera();
    const win = BrowserWindow.fromWebContents(e.sender) || undefined;
    let r; try { r = await dialog.showSaveDialog(win, { title: 'Spara dina inställningar', defaultPath: 'adraze-anpassning.txt', filters: [{ name: 'Text', extensions: ['txt'] }] }); } catch { return { ok: false }; }
    if (!r || r.canceled || !r.filePath) return { ok: false, avbrutet: true };
    try { fs.writeFileSync(r.filePath, kod + '\n'); } catch (err) { return { ok: false, fel: String(err && err.message || err).slice(0, 120) }; }
    return { ok: true, fil: path.basename(r.filePath) };
  });
}

module.exports = { init, angraGrupp, gruppStorlek, etikettFor, gruppAv, toastLage };
