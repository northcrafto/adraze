'use strict';
/* Anpassa → flikar (huvudprocessen). Skalets del ligger i ui/anpassa-flikar.js.
 *  - registrerar flikar.*-nycklarna i Anpassa-butiken (anpassa.js)
 *  - sovande flikar: hur länge en dold flik får ligga oanvänd innan den släpper minnet (main.js svep + discardTab),
 *    fästa flikar och bild-i-bild sover aldrig (ljud kollar main.js själv)
 *  - flikgruppernas poster i flikens högerklicksmeny + gruppens egen meny
 *  - kortkommandot Ctrl+Shift+A: visar flikraden när flikarna är dolda (fäller ihop/ut panelen när de ligger på sidan)
 * Inget här rör barnspärrarna: en sovande flik laddas om via samma väg som alla flikar (spärren i huvudprocessen gäller). */
const { app, ipcMain, Menu, BrowserWindow } = require('electron');
const anpassa = require('./anpassa');

const LAGEN = ['upptill', 'vertikal', 'dolda'];
const SOV_MIN = [0, 15, 30, 60, 120];                 // 0 = av
const FARGER = ['gra', 'bla', 'gron', 'gul', 'orange', 'rosa'];
const FARGNAMN = { gra: 'Grå', bla: 'Blå', gron: 'Grön', gul: 'Gul', orange: 'Orange', rosa: 'Rosa' };
const BREDD_MIN = 170, BREDD_MAX = 420;

// Rena utseende- och beteendeval: inget av det kan kringgå spärrar eller insyn → inte barnlåst.
const NYCKLAR = [
  { nyckel: 'flikar.lage', standard: 'upptill', etikett: 'Flikarnas placering' },
  { nyckel: 'flikar.vertikalBredd', standard: 240, etikett: 'Flikpanelens bredd' },
  { nyckel: 'flikar.vertikalSmal', standard: false, etikett: 'Flikpanelen bara ikoner' },
  { nyckel: 'flikar.grupper', standard: [], etikett: 'Flikgrupper', importBar: false },   // hör till fönstrets flikar, inte till en delningskod
  { nyckel: 'flikar.nyFlik', standard: 'sist', etikett: 'Var nya flikar öppnas' },
  { nyckel: 'flikar.sistaFlik', standard: 'stang', etikett: 'När sista fliken stängs' },
  { nyckel: 'flikar.stangKnapp', standard: 'alla', etikett: 'Stängknapp på flikarna' },
  { nyckel: 'flikar.sova', standard: 15, etikett: 'Sovande flikar' },
];
for (const n of NYCKLAR) anpassa.registrera({ ...n, barnLast: false });

let T = (s) => s;
let ctxFor = () => null;
let antalFonster = () => 1;
let svep = null;

function lage() { const v = anpassa.hamta('flikar.lage'); return LAGEN.includes(v) ? v : 'upptill'; }

/* Hur länge (ms) en dold flik får vara oanvänd innan den sover. 0 = aldrig.
 * TAB_DISCARD_MS (miljövariabel, för tester) går före inställningen, som förut. */
function sovMs() {
  const env = Number(process.env.TAB_DISCARD_MS);
  if (env > 0) return env;
  const m = Number(anpassa.hamta('flikar.sova'));
  return (SOV_MIN.includes(m) ? m : 15) * 60 * 1000;
}

/* Får fliken somna? (main.js discardTab har redan uteslutit synlig flik, inkognito och ljud) */
function farSova(ctx, tabId, wc) {
  if (ctx && ctx.fastaFlikar && ctx.fastaFlikar.has(tabId)) return false;   // fäst flik
  try { for (const st of (wc && wc.__pip ? wc.__pip.values() : [])) if (st && st.on) return false; } catch {}   // video i bild-i-bild
  return true;
}

// Gruppens namn i en meny: & är snabbtangent i Electrons menyer → dubbla
const menyText = (s) => String(s || '').slice(0, 40).replace(/&/g, '&&');
const gruppEtikett = (g) => menyText(g.namn) || T('Namnlös grupp') + ' (' + T(FARGNAMN[g.farg] || FARGNAMN.gra) + ')';

/* Flikens högerklicksmeny (main.js tab:menu): grupposterna läggs efter Fäst/Ljud.
 * info.grupp = flikens grupp, info.grupper = fönstrets grupper (från skalet). Fästa flikar grupperas inte. */
function menyPoster(info, go) {
  if (!info || info.pinned || !Array.isArray(info.grupper)) return [];
  const ut = [{ type: 'separator' }, { label: T('Lägg i ny grupp'), click: go('grupp-ny') }];
  const andra = info.grupper.filter((g) => g && typeof g.id === 'string' && g.id !== info.grupp).slice(0, 30);
  if (andra.length) ut.push({ label: T('Lägg i grupp'), submenu: andra.map((g) => ({ label: gruppEtikett(g), click: go('grupp-in:' + g.id) })) });
  if (info.grupp) ut.push({ label: T('Ta bort ur gruppen'), click: go('grupp-ur') });
  return ut;
}

// Gruppernas lista (från skalet) tvättas innan den sparas: bara kända fält, rimliga längder
function tvatta(lista) {
  if (!Array.isArray(lista)) return [];
  const sedda = new Set();
  return lista.slice(0, 200).filter((g) => g && typeof g.id === 'string' && /^[a-z0-9]{2,40}$/i.test(g.id) && !sedda.has(g.id) && sedda.add(g.id))
    .map((g) => ({ id: g.id, namn: String(g.namn || '').slice(0, 40), farg: FARGER.includes(g.farg) ? g.farg : 'gra', hopfalld: !!g.hopfalld }));
}

function init(o = {}) {
  if (typeof o.T === 'function') T = o.T;
  if (typeof o.ctxFor === 'function') ctxFor = o.ctxFor;
  if (typeof o.antalFonster === 'function') antalFonster = o.antalFonster;
  if (typeof o.svep === 'function') svep = o.svep;

  // Skalet berättar vilka flikar som är fästa (de sover aldrig)
  ipcMain.on('anpassa-flikar:fasta', (e, ids) => {
    const ctx = ctxFor(e); if (!ctx) return;
    ctx.fastaFlikar = new Set((Array.isArray(ids) ? ids : []).filter(Number.isInteger).slice(0, 1000));
  });
  // Ihopfällning och städning av tomma grupper hamnar inte i ångra-historiken
  ipcMain.handle('anpassa-flikar:grupper-tyst', (_e, lista) => anpassa.satt('flikar.grupper', tvatta(lista), { utanHistorik: true }));
  ipcMain.on('anpassa-flikar:fonster', (e) => { e.returnValue = antalFonster(); });
  // Gruppens meny (högerklick på gruppens namn i flikraden/panelen)
  ipcMain.on('anpassa-flikar:gruppmeny', (e, d) => {
    try {
      const g = tvatta([d])[0]; if (!g) return;
      const win = BrowserWindow.fromWebContents(e.sender); if (!win) return;
      const val = (a) => () => { try { if (!e.sender.isDestroyed()) e.sender.send('anpassa-flikar:gruppval', a, g.id); } catch {} };
      Menu.buildFromTemplate([
        { label: T('Byt namn'), click: val('namn') },
        { label: T('Färg'), submenu: FARGER.map((f) => ({ label: T(FARGNAMN[f]), type: 'radio', checked: g.farg === f, click: val('farg:' + f) })) },
        { type: 'separator' },
        { label: T('Ny flik i gruppen'), click: val('ny-flik') },
        { label: g.hopfalld ? T('Fäll ut gruppen') : T('Fäll ihop gruppen'), click: val('fall') },
        { label: T('Dela upp gruppen'), click: val('dela') },
        { type: 'separator' },
        { label: T('Stäng gruppen'), click: val('stang') },
      ]).popup({ window: win });
    } catch {}
  });
  // Ctrl+Shift+A (Cmd på Mac) i alla fönstrets vyer: skalet visar flikraden (dolda) eller fäller ihop/ut panelen (på sidan).
  // Samma tangent som Chromes flikssökning, så webbsidor räknar inte med den. Upptill: tangenten går vidare till sidan.
  app.on('web-contents-created', (_e, wc) => {
    wc.on('before-input-event', (ev, input) => {
      try {
        if (input.type !== 'keyDown' || !(input.control || input.meta) || !input.shift || input.alt) return;
        if (String(input.key || '').toLowerCase() !== 'a' && input.code !== 'KeyA') return;
        if (lage() === 'upptill') return;
        const win = wc.__ctx ? wc.__ctx.win : BrowserWindow.fromWebContents(wc);
        if (!win || win.isDestroyed()) return;
        ev.preventDefault();
        win.webContents.send('anpassa-flikar:kortkommando');
      } catch {}
    });
  });
  // Mac: trafikljusen centreras i verktygsraden (50 px) när flikraden inte ligger överst
  if (process.platform === 'darwin') {
    const placera = () => { const y = lage() === 'upptill' ? 14 : 18; for (const w of BrowserWindow.getAllWindows()) { try { if (w.setWindowButtonPosition) w.setWindowButtonPosition({ x: 14, y }); } catch {} } };
    anpassa.lyssna((k) => { if (k === 'flikar.lage') placera(); });
    app.on('browser-window-created', () => setTimeout(placera, 0));
  }
}

module.exports = { init, lage, sovMs, farSova, menyPoster, FARGER, BREDD_MIN, BREDD_MAX, _svep: () => svep && svep() };
