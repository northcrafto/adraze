'use strict';
/* Importera från en annan webbläsare: bokmärken och historik läses direkt från Chrome, Brave,
 * Chromium, Edge, Vivaldi och Firefox. Lösenord tas in via en CSV-fil som du exporterar ur den
 * andra webbläsaren (så gör Chrome och Firefox själva när man importerar från en fil).
 * Databaserna kopieras till en tempmapp först, så det fungerar även när den andra webbläsaren är öppen. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, ipcMain, dialog, BrowserWindow } = require('electron');
let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch {}

const HOME = os.homedir();
const plat = process.platform;
function cfg(...p) {
  if (plat === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), ...p);
  if (plat === 'darwin') return path.join(HOME, 'Library', 'Application Support', ...p);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), ...p);
}
const CHROMIUM = [
  { id: 'chrome', namn: 'Google Chrome', dir: plat === 'win32' ? cfg('Google', 'Chrome', 'User Data') : plat === 'darwin' ? cfg('Google', 'Chrome') : cfg('google-chrome') },
  { id: 'brave', namn: 'Brave', dir: plat === 'win32' ? cfg('BraveSoftware', 'Brave-Browser', 'User Data') : cfg('BraveSoftware', 'Brave-Browser') },
  { id: 'edge', namn: 'Microsoft Edge', dir: plat === 'win32' ? cfg('Microsoft', 'Edge', 'User Data') : plat === 'darwin' ? cfg('Microsoft Edge') : cfg('microsoft-edge') },
  { id: 'vivaldi', namn: 'Vivaldi', dir: plat === 'win32' ? cfg('Vivaldi', 'User Data') : plat === 'darwin' ? cfg('Vivaldi') : cfg('vivaldi') },
  { id: 'chromium', namn: 'Chromium', dir: plat === 'win32' ? cfg('Chromium', 'User Data') : plat === 'darwin' ? cfg('Chromium') : cfg('chromium') },
];
function firefoxDir() {
  if (plat === 'win32') return path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Mozilla', 'Firefox');
  if (plat === 'darwin') return path.join(HOME, 'Library', 'Application Support', 'Firefox');
  for (const d of [path.join(HOME, '.mozilla', 'firefox'), path.join(HOME, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), path.join(HOME, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')]) {
    if (fs.existsSync(path.join(d, 'profiles.ini'))) return d;
  }
  return path.join(HOME, '.mozilla', 'firefox');
}

/* ── Vilka webbläsare finns på datorn? ── */
function kallor() {
  const ut = [];
  for (const b of CHROMIUM) {
    if (!fs.existsSync(b.dir)) continue;
    let info = {};
    try { info = JSON.parse(fs.readFileSync(path.join(b.dir, 'Local State'), 'utf8')).profile.info_cache || {}; } catch {}
    const profiler = Object.keys(info).filter((p) => fs.existsSync(path.join(b.dir, p)))
      .map((p) => ({ id: p, namn: info[p].name || p }));
    if (!profiler.length && fs.existsSync(path.join(b.dir, 'Default'))) profiler.push({ id: 'Default', namn: 'Default' });
    if (profiler.length) ut.push({ typ: 'chromium', id: b.id, namn: b.namn, profiler });
  }
  const ff = firefoxDir();
  try {
    const ini = fs.readFileSync(path.join(ff, 'profiles.ini'), 'utf8');
    const profiler = [];
    for (const block of ini.split(/\n(?=\[)/)) {
      if (!/^\[Profile/.test(block)) continue;
      const v = (k) => (block.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1];
      const p = v('Path'); if (!p) continue;
      const dir = v('IsRelative') === '0' ? p : path.join(ff, p);
      if (fs.existsSync(path.join(dir, 'places.sqlite'))) profiler.push({ id: dir, namn: v('Name') || p });
    }
    if (profiler.length) ut.push({ typ: 'firefox', id: 'firefox', namn: 'Firefox', profiler });
  } catch {}
  return ut;
}

/* ── Hjälpare ── */
// Kopiera en låst SQLite-fil till tempmappen och öppna skrivskyddat
function oppnaDb(f) {
  if (!DatabaseSync || !fs.existsSync(f)) return null;
  const tmp = path.join(os.tmpdir(), 'adraze-imp-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.sqlite');
  try {
    fs.copyFileSync(f, tmp);
    for (const sx of ['-wal', '-shm']) { try { if (fs.existsSync(f + sx)) fs.copyFileSync(f + sx, tmp + sx); } catch {} }
    const db = new DatabaseSync(tmp, { readOnly: true });
    db.__tmp = tmp; return db;
  } catch { try { fs.unlinkSync(tmp); } catch {} return null; }
}
function stangDb(db) { if (!db) return; try { db.close(); } catch {} for (const sx of ['', '-wal', '-shm']) { try { fs.unlinkSync(db.__tmp + sx); } catch {} } }
function hostnamn(u) { try { return new URL(u).hostname; } catch { return ''; } }

/* ── Chromium ── */
function chromiumMapp(id, prof) {
  const b = CHROMIUM.find((x) => x.id === id);
  return b ? path.join(b.dir, prof || 'Default') : null;
}
function chromeBokmarken(dir) {
  const ut = [];
  let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, 'Bookmarks'), 'utf8')); } catch { return ut; }
  const ga = (nod) => {
    if (!nod) return;
    if (nod.type === 'url' && nod.url && /^https?:/i.test(nod.url)) ut.push({ url: nod.url, title: nod.name || nod.url });
    if (Array.isArray(nod.children)) nod.children.forEach(ga);
  };
  Object.values(j.roots || {}).forEach(ga);
  return ut;
}
function chromeHistorik(dir) {
  const db = oppnaDb(path.join(dir, 'History')); if (!db) return [];
  try {
    // Chrome: last_visit_time är mikrosekunder sedan 1601-01-01 (för stort för vanligt JS-tal → BigInt)
    const stmt = db.prepare('SELECT url, title, last_visit_time, visit_count FROM urls WHERE last_visit_time>0 ORDER BY last_visit_time DESC LIMIT 2000');
    try { stmt.setReadBigInts(true); } catch {}
    return stmt.all().filter((r) => /^https?:/i.test(r.url)).map((r) => ({
      url: r.url, title: r.title || r.url, n: Number(r.visit_count) || 1,
      t: Number(BigInt(r.last_visit_time) / 1000n) - 11644473600000,
    }));
  } catch { return []; } finally { stangDb(db); }
}

/* ── Firefox ── */
function ffBokmarken(dir) {
  const db = oppnaDb(path.join(dir, 'places.sqlite')); if (!db) return [];
  try {
    const rows = db.prepare("SELECT b.title AS title, p.url AS url FROM moz_bookmarks b JOIN moz_places p ON b.fk=p.id WHERE b.type=1 AND p.url LIKE 'http%'").all();
    return rows.map((r) => ({ url: r.url, title: r.title || r.url }));
  } catch { return []; } finally { stangDb(db); }
}
function ffHistorik(dir) {
  const db = oppnaDb(path.join(dir, 'places.sqlite')); if (!db) return [];
  try {
    // Firefox: last_visit_date är mikrosekunder sedan 1970
    const stmt = db.prepare("SELECT url, title, last_visit_date, visit_count FROM moz_places WHERE last_visit_date IS NOT NULL AND url LIKE 'http%' ORDER BY last_visit_date DESC LIMIT 2000");
    try { stmt.setReadBigInts(true); } catch {}
    return stmt.all().map((r) => ({ url: r.url, title: r.title || r.url, n: Number(r.visit_count) || 1, t: Number(BigInt(r.last_visit_date) / 1000n) }));
  } catch { return []; } finally { stangDb(db); }
}

/* ── Lösenord från CSV (export ur den andra webbläsaren) ── */
function parseCsv(text) {
  const rader = []; let f = [], c = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { f.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; f.push(c); if (f.some((x) => x !== '')) rader.push(f); f = []; c = ''; }
    else c += ch;
  }
  if (c !== '' || f.length) { f.push(c); if (f.some((x) => x !== '')) rader.push(f); }
  return rader;
}
function losenFranCsv(text) {
  const rader = parseCsv(text); if (rader.length < 2) return [];
  const huvud = rader[0].map((h) => h.trim().toLowerCase());
  const kol = (...namn) => huvud.findIndex((h) => namn.includes(h));
  const iUrl = kol('url', 'origin', 'login_uri', 'website', 'web site');
  const iUser = kol('username', 'login', 'login_username', 'user', 'email');
  const iPass = kol('password', 'login_password', 'pass');
  if (iUrl < 0 || iPass < 0) return [];
  const ut = [];
  for (let i = 1; i < rader.length; i++) {
    const r = rader[i];
    const rawUrl = (r[iUrl] || '').trim(); const pass = r[iPass] || '';
    if (!rawUrl || !pass) continue;
    let origin = rawUrl;
    try { const u = new URL(/:\/\//.test(rawUrl) ? rawUrl : 'https://' + rawUrl); origin = u.origin; } catch {}
    ut.push({ origin, username: iUser >= 0 ? (r[iUser] || '') : '', password: pass });
  }
  return ut;
}

/* ── IPC ── */
// hooks: { sparaLosen(lista) -> antal, fonsterFor(sender) }
function setup(hooks) {
  ipcMain.handle('import:kallor', () => kallor());

  // Läs bokmärken + historik från en vald källa (ges tillbaka till skalet som lägger in i localStorage)
  ipcMain.handle('import:las', (_e, { typ, id, profil, bokmarken, historik }) => {
    let bm = [], hist = [];
    try {
      if (typ === 'firefox') {
        if (bokmarken) bm = ffBokmarken(profil);
        if (historik) hist = ffHistorik(profil);
      } else {
        const dir = chromiumMapp(id, profil); if (!dir) throw new Error('profil saknas');
        if (bokmarken) bm = chromeBokmarken(dir);
        if (historik) hist = chromeHistorik(dir);
      }
    } catch (e) { return { ok: false, fel: String(e.message || e) }; }
    return { ok: true, bokmarken: bm, historik: hist };
  });

  // Lösenord: välj en CSV-fil, tolka och spara via webbläsarens egna valv
  ipcMain.handle('import:losen-csv', async (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(w, {
      title: 'Välj en CSV-fil med lösenord', properties: ['openFile'],
      filters: [{ name: 'CSV-fil', extensions: ['csv', 'txt'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, avbruten: true };
    let text; try { text = fs.readFileSync(r.filePaths[0], 'utf8'); } catch { return { ok: false, fel: 'Kunde inte läsa filen.' }; }
    const lista = losenFranCsv(text);
    if (!lista.length) return { ok: false, fel: 'Hittade inga lösenord i filen. Exportera lösenorden som CSV från den andra webbläsaren och välj den filen.' };
    let antal = 0;
    try { antal = hooks && hooks.sparaLosen ? await hooks.sparaLosen(lista) : 0; } catch (err) { return { ok: false, fel: String(err.message || err) }; }
    return { ok: true, antal };
  });
}

module.exports = { setup, kallor };
