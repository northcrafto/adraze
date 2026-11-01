'use strict';
/* Importera från en annan webbläsare: bokmärken och historik läses direkt från Chrome, Brave,
 * Chromium, Edge, Vivaldi och Firefox. Lösenord tas in via en CSV-fil som du exporterar ur den
 * andra webbläsaren (så gör Chrome och Firefox själva när man importerar från en fil).
 * Databaserna kopieras till en tempmapp först, så det fungerar även när den andra webbläsaren är öppen. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, ipcMain, dialog, BrowserWindow, session } = require('electron');
const crypto = require('crypto');
const { spawn } = require('child_process');
// Kör ett program utan att frysa appen (macOS kan visa en lösenordsruta medan vi väntar)
function kor(prog, args, { input, timeout = 30000 } = {}) {
  return new Promise((res) => {
    let ut = '', klar = false;
    let p; try { p = spawn(prog, args, { windowsHide: true }); } catch { return res(null); }
    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeout);
    p.stdout.on('data', (d) => { ut += d; });
    p.on('error', () => { if (!klar) { klar = true; clearTimeout(t); res(null); } });
    p.on('close', (kod) => { if (!klar) { klar = true; clearTimeout(t); res(kod === 0 ? ut : null); } });
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}
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

/* ── Inställningar och utseende ──
 * Allt översätts till AdRazes egna val. Bara sådant du faktiskt har ändrat i den andra webbläsaren
 * tas med (utom temat, som alltid följer med — "som datorn" blir ljust eller mörkt efter datorn nu). */
const ZOOMSTEG = [90, 100, 110, 125];
function narmasteZoom(procent) {
  if (!(procent > 0)) return null;
  return ZOOMSTEG.reduce((a, b) => (Math.abs(b - procent) < Math.abs(a - procent) ? b : a));
}
function motorFranText(t) {
  t = String(t || '').toLowerCase();
  if (/search\.adraze|adraze/.test(t)) return 'adraze';
  if (/duckduckgo|\bddg\b/.test(t)) return 'duckduckgo';
  if (/search\.brave|brave/.test(t)) return 'brave';
  if (/startpage/.test(t)) return 'startpage';
  if (/google/.test(t)) return 'google';
  return null;
}
function dnsFranMall(mall) {
  mall = String(mall || '').toLowerCase();
  if (/cloudflare|1\.1\.1\.1|mozilla\.cloudflare/.test(mall)) return 'cloudflare';
  if (/quad9|9\.9\.9\.9/.test(mall)) return 'quad9';
  if (/dns\.google|8\.8\.8\.8/.test(mall)) return 'google';
  return 'automatic';
}
function systemetMorkt() { try { return require('electron').nativeTheme.shouldUseDarkColors; } catch { return false; } }
function lasJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function hamta(o, nyckel) {
  let d = o;
  for (const k of nyckel.split('.')) { if (!d || typeof d !== 'object' || !(k in d)) return undefined; d = d[k]; }
  return d;
}
function rentOrigin(monster) {
  // Chromium: "https://exempel.se:443,*" → https://exempel.se (jokertecken hoppas över)
  const s = String(monster || '').split(',')[0].trim();
  if (!s || s.includes('*') || s.includes('[')) return null;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; }
}
function tomInst() { return { tema: null, bmbar: null, zoom: null, fontSize: null, motor: null, motorNamn: '', start: null, nedladdning: null, httpsOnly: null, dns: null, perms: {}, permDefaults: {}, tillagg: [] }; }

const CR_PERM = { notifications: 'notifications', geolocation: 'geolocation', media_stream_camera: 'camera', media_stream_mic: 'microphone', clipboard: 'clipboard-read', midi_sysex: 'midi' };
const CR_STD_MOTOR = { chrome: 'google', chromium: 'google', brave: 'brave' };   // vad webbläsaren använder om du aldrig bytt

function chromeTillaggNamn(dir, id, v) {
  let namn = (v.manifest && v.manifest.name) || '';
  if (!namn || /^__MSG_/.test(namn)) {
    // Läs namnet ur tilläggets egen manifest (och språkfilen om namnet är översatt)
    try {
      const bas = path.join(dir, 'Extensions', id);
      const ver = fs.readdirSync(bas).filter((x) => fs.existsSync(path.join(bas, x, 'manifest.json'))).sort().pop();
      const m = lasJson(path.join(bas, ver, 'manifest.json')) || {};
      namn = m.name || namn;
      const msg = /^__MSG_(.+)__$/.exec(namn || '');
      if (msg) {
        for (const sp of [m.default_locale, 'en', 'en_US'].filter(Boolean)) {
          const l = lasJson(path.join(bas, ver, '_locales', sp, 'messages.json'));
          const hit = l && Object.keys(l).find((k) => k.toLowerCase() === msg[1].toLowerCase());
          if (hit && l[hit].message) { namn = l[hit].message; break; }
        }
      }
    } catch {}
  }
  return /^__MSG_/.test(namn || '') ? id : (namn || id);
}

function chromeInst(webblasare, dir) {
  const ut = tomInst();
  const p = lasJson(path.join(dir, 'Preferences')) || {};
  const sp = lasJson(path.join(dir, 'Secure Preferences')) || {};
  const b = CHROMIUM.find((x) => x.id === webblasare);
  const ls = (b && lasJson(path.join(b.dir, 'Local State'))) || {};

  // Tema: Brave har ett eget val i Local State (0 = som datorn, 1 = mörkt, 2 = ljust),
  // Chrome/Edge/Chromium i profilen (0 = som datorn, 1 = ljust, 2 = mörkt)
  let tema = null;
  if (webblasare === 'brave') {
    const v = hamta(ls, 'brave.dark_mode');
    tema = v === 1 ? 'dark' : v === 2 ? 'light' : null;
  }
  if (!tema) {
    const v = hamta(p, 'browser.theme.color_scheme2') ?? hamta(p, 'browser.theme.color_scheme');
    tema = v === 2 ? 'dark' : v === 1 ? 'light' : null;
  }
  ut.tema = tema || (systemetMorkt() ? 'dark' : 'light');

  const bm = hamta(p, 'bookmark_bar.show_on_all_tabs');
  if (typeof bm === 'boolean') ut.bmbar = bm;
  const zl = hamta(p, 'partition.default_zoom_level');
  const niva = zl && typeof zl === 'object' ? Object.values(zl).find((x) => typeof x === 'number') : (typeof zl === 'number' ? zl : undefined);
  if (typeof niva === 'number') ut.zoom = narmasteZoom(Math.round(Math.pow(1.2, niva) * 100));
  const fs_ = hamta(p, 'webkit.webprefs.default_font_size');
  if (typeof fs_ === 'number' && fs_ !== 16) ut.fontSize = fs_;

  // Sökmotor
  const sd = hamta(p, 'default_search_provider_data.mirrored_template_url_data') || hamta(p, 'default_search_provider_data.template_url_data');
  if (sd && (sd.url || sd.short_name)) {
    ut.motorNamn = sd.short_name || '';
    ut.motor = motorFranText((sd.url || '') + ' ' + (sd.short_name || ''));
  } else if (CR_STD_MOTOR[webblasare]) ut.motor = CR_STD_MOTOR[webblasare];

  // Vid start: 1 = fortsätt där du var, 4 = vissa sidor, 5 = ny flik
  const rs = hamta(p, 'session.restore_on_startup');
  if (rs === 1) ut.start = { mode: 'tidigare' };
  else if (rs === 5) ut.start = { mode: 'ny' };
  else if (rs === 4) {
    const u = (hamta(p, 'session.startup_urls') || []).find((x) => /^https?:/i.test(x));
    if (u) ut.start = { mode: 'sida', url: u };
  }

  const dd = hamta(p, 'download.default_directory') || hamta(p, 'savefile.default_directory');
  const fraga = hamta(p, 'download.prompt_for_download');
  if ((dd && fs.existsSync(dd)) || typeof fraga === 'boolean') ut.nedladdning = { dir: dd && fs.existsSync(dd) ? dd : '', fraga: typeof fraga === 'boolean' ? fraga : null };

  const ho = hamta(p, 'https_only_mode_enabled');
  if (typeof ho === 'boolean') ut.httpsOnly = ho;
  const dl = hamta(ls, 'dns_over_https.mode');
  if (dl === 'off') ut.dns = 'off';
  else if (dl === 'secure') ut.dns = dnsFranMall(hamta(ls, 'dns_over_https.templates'));

  // Webbplatsbehörigheter (1 = tillåt, 2 = blockera)
  const undantag = hamta(p, 'profile.content_settings.exceptions') || {};
  for (const [typ, kind] of Object.entries(CR_PERM)) {
    for (const [monster, v] of Object.entries(undantag[typ] || {})) {
      const o = rentOrigin(monster); const s = v && v.setting;
      if (!o || (s !== 1 && s !== 2)) continue;
      (ut.perms[o] = ut.perms[o] || {})[kind] = s === 1 ? 'allow' : 'block';
    }
    if (hamta(p, 'profile.default_content_setting_values.' + typ) === 2) ut.permDefaults[kind] = 'block';
  }

  // Tillägg från Chrome Web Store som är påslagna (location 1 = installerat av dig från butiken)
  const sett = new Set();
  for (const src of [hamta(sp, 'extensions.settings'), hamta(p, 'extensions.settings')]) {
    for (const [id, v] of Object.entries(src || {})) {
      if (sett.has(id) || !/^[a-p]{32}$/.test(id) || !v || typeof v !== 'object' || v.location !== 1) continue;
      const av = (Array.isArray(v.disable_reasons) && v.disable_reasons.length) || (typeof v.disable_reasons === 'number' && v.disable_reasons) || v.state === 0;
      if (av) continue;
      sett.add(id); ut.tillagg.push({ id, namn: chromeTillaggNamn(dir, id, v) });
    }
  }
  return ut;
}

/* Firefox: prefs.js (user_pref-rader), search.json.mozlz4, permissions.sqlite, content-prefs.sqlite */
function ffPrefs(dir) {
  const ut = {};
  let text = ''; try { text = fs.readFileSync(path.join(dir, 'prefs.js'), 'utf8'); } catch { return ut; }
  const re = /^user_pref\("([^"]+)",\s*(.+)\);\s*$/gm; let m;
  while ((m = re.exec(text))) { try { ut[m[1]] = JSON.parse(m[2]); } catch {} }
  return ut;
}
// Mozillas lz4-format: "mozLz40\0" + 4 byte storlek + ett lz4-block
function mozLz4(buf) {
  if (!buf || buf.length < 12 || buf.toString('latin1', 0, 8) !== 'mozLz40\0') return null;
  const ut = Buffer.alloc(buf.readUInt32LE(8)); let i = 12, o = 0;
  while (i < buf.length) {
    const tok = buf[i++]; let lit = tok >> 4;
    if (lit === 15) { let x; do { x = buf[i++]; lit += x; } while (x === 255); }
    buf.copy(ut, o, i, i + lit); i += lit; o += lit;
    if (i >= buf.length) break;
    const off = buf[i] | (buf[i + 1] << 8); i += 2;
    let len = tok & 15;
    if (len === 15) { let x; do { x = buf[i++]; len += x; } while (x === 255); }
    len += 4; let f = o - off;
    if (off <= 0 || f < 0) return null;
    while (len--) ut[o++] = ut[f++];
  }
  return ut.slice(0, o);
}
const FF_PERM = { 'desktop-notification': 'notifications', geo: 'geolocation', camera: 'camera', microphone: 'microphone' };
function ffInst(dir) {
  const ut = tomInst();
  const p = ffPrefs(dir);
  const tid = String(p['extensions.activeThemeID'] || '');
  const co = p['layout.css.prefers-color-scheme.content-override'];
  const tt = p['browser.theme.toolbar-theme'];
  ut.tema = /dark/.test(tid) ? 'dark' : /light/.test(tid) ? 'light'
    : co === 0 ? 'dark' : co === 1 ? 'light' : tt === 0 ? 'dark' : tt === 1 ? 'light'
    : (systemetMorkt() ? 'dark' : 'light');

  const vis = p['browser.toolbars.bookmarks.visibility'];
  if (vis === 'always') ut.bmbar = true; else if (vis === 'never') ut.bmbar = false;
  const fsz = p['font.size.variable.x-western'];
  if (typeof fsz === 'number' && fsz !== 16) ut.fontSize = fsz;
  const db = oppnaDb(path.join(dir, 'content-prefs.sqlite'));
  if (db) {
    try {
      const r = db.prepare("SELECT p.value AS v FROM prefs p JOIN settings s ON p.settingID=s.id WHERE s.name='browser.content.full-zoom' AND p.groupID IS NULL").get();
      if (r && Number(r.v) > 0) ut.zoom = narmasteZoom(Math.round(Number(r.v) * 100));
    } catch {} finally { stangDb(db); }
  }

  try {
    const j = JSON.parse(mozLz4(fs.readFileSync(path.join(dir, 'search.json.mozlz4'))).toString('utf8'));
    const id = hamta(j, 'metaData.defaultEngineId') || '';
    const e = (j.engines || []).find((x) => x.id === id || x._name === id || (x._metaData && x._metaData.order === 1 && !id));
    const namn = (e && (e._name || e.id)) || id;
    if (namn) { ut.motorNamn = namn; ut.motor = motorFranText(namn + ' ' + id); }
  } catch {}

  // Vid start: 3 = fortsätt där du var, 0 = tom sida, 1 = startsidan
  const sp = p['browser.startup.page'];
  if (sp === 3) ut.start = { mode: 'tidigare' };
  else if (sp === 0) ut.start = { mode: 'ny' };
  else {
    const hem = String(p['browser.startup.homepage'] || '').split('|').find((x) => /^https?:/i.test(x));
    if (hem) ut.start = { mode: 'sida', url: hem };
  }

  const dd = p['browser.download.folderList'] === 2 ? p['browser.download.dir'] : '';
  const fraga = p['browser.download.useDownloadDir'] === false ? true : null;
  if ((dd && fs.existsSync(dd)) || fraga) ut.nedladdning = { dir: dd && fs.existsSync(dd) ? dd : '', fraga };

  if (typeof p['dom.security.https_only_mode'] === 'boolean') ut.httpsOnly = p['dom.security.https_only_mode'];
  const trr = p['network.trr.mode'];
  if (trr === 5) ut.dns = 'off'; else if (trr === 2 || trr === 3) ut.dns = dnsFranMall(p['network.trr.uri'] || p['network.trr.custom_uri'] || 'mozilla.cloudflare-dns.com');

  const pdb = oppnaDb(path.join(dir, 'permissions.sqlite'));
  if (pdb) {
    try {
      for (const r of pdb.prepare('SELECT origin, type, permission FROM moz_perms').all()) {
        const kind = FF_PERM[r.type]; if (!kind || (r.permission !== 1 && r.permission !== 2)) continue;
        const o = rentOrigin(r.origin); if (!o) continue;
        (ut.perms[o] = ut.perms[o] || {})[kind] = r.permission === 1 ? 'allow' : 'block';
      }
    } catch {} finally { stangDb(pdb); }
  }
  for (const [typ, kind] of Object.entries(FF_PERM)) if (p['permissions.default.' + typ] === 2) ut.permDefaults[kind] = 'block';
  return ut;
}

/* ── Öppna flikar ──
 * Chromium sparar flikarna i Sessions/Session_<tid> (SNSS: en rad kommandon). Vi läser bara de vi behöver:
 * adress per flik och historiksteg, vald historikpost, fönster, ordning, fäst och stängda flikar/fönster. */
function snss(buf) {
  if (!buf || buf.length < 8 || buf.toString('latin1', 0, 4) !== 'SNSS') return [];
  let p = 8; const flikar = new Map(), stangdaF = new Set();
  const flik = (id) => { if (!flikar.has(id)) flikar.set(id, { navs: new Map(), sel: -1, win: -1, idx: 0, pin: false, stangd: false }); return flikar.get(id); };
  while (p + 3 <= buf.length) {
    const size = buf.readUInt16LE(p); if (size < 1 || p + 2 + size > buf.length) break;
    const id = buf[p + 2], d = buf.subarray(p + 3, p + 2 + size); p += 2 + size;
    try {
      if (id === 6 && d.length >= 16) {            // UpdateTabNavigation (Pickle: storlek, flik, index, adress …)
        const tid = d.readInt32LE(4), idx = d.readInt32LE(8), len = d.readInt32LE(12);
        if (len > 0 && 16 + len <= d.length) flik(tid).navs.set(idx, d.toString('utf8', 16, 16 + len));
      } else if (id === 0 && d.length >= 8) flik(d.readInt32LE(4)).win = d.readInt32LE(0);   // SetTabWindow
      else if (id === 2 && d.length >= 8) flik(d.readInt32LE(0)).idx = d.readInt32LE(4);    // SetTabIndexInWindow
      else if (id === 7 && d.length >= 8) flik(d.readInt32LE(0)).sel = d.readInt32LE(4);    // SetSelectedNavigationIndex
      else if (id === 12 && d.length >= 5) flik(d.readInt32LE(0)).pin = d[4] !== 0;         // SetPinnedState
      else if (id === 16 && d.length >= 4) flik(d.readInt32LE(0)).stangd = true;            // TabClosed
      else if (id === 17 && d.length >= 4) stangdaF.add(d.readInt32LE(0));                  // WindowClosed
    } catch {}
  }
  return [...flikar.values()].filter((t) => !t.stangd && t.win !== -1 && !stangdaF.has(t.win) && t.navs.size)
    .sort((a, b) => a.win - b.win || a.idx - b.idx)
    .map((t) => ({ url: t.navs.get(t.sel) || t.navs.get(Math.max(...t.navs.keys())), pinned: t.pin }))
    .filter((t) => t.url && /^https?:/i.test(t.url));
}
function chromeFlikar(dir) {
  try {
    const sd = path.join(dir, 'Sessions');
    const f = fs.readdirSync(sd).filter((x) => /^Session_\d+$/.test(x)).sort().pop();
    if (f) return snss(fs.readFileSync(path.join(sd, f)));
    for (const gammal of ['Current Session', 'Last Session']) { const g = path.join(dir, gammal); if (fs.existsSync(g)) return snss(fs.readFileSync(g)); }
  } catch {}
  return [];
}
function ffFlikar(dir) {
  // Medan Firefox är öppen skrivs recovery.jsonlz4, när den stängts sessionstore.jsonlz4 — ta den nyaste
  const kand = [path.join(dir, 'sessionstore-backups', 'recovery.jsonlz4'), path.join(dir, 'sessionstore.jsonlz4')]
    .filter((f) => fs.existsSync(f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const f of kand) {
    try {
      const j = JSON.parse(mozLz4(fs.readFileSync(f)).toString('utf8'));
      const ut = [];
      for (const w of j.windows || []) for (const t of w.tabs || []) {
        const e = (t.entries || [])[(t.index || (t.entries || []).length) - 1];
        if (e && /^https?:/i.test(e.url || '')) ut.push({ url: e.url, pinned: !!t.pinned });
      }
      return ut;
    } catch {}
  }
  return [];
}

/* ── Inloggningar (kakor) ──
 * Chromium krypterar kakorna med en nyckel som ligger i datorns nyckelring:
 *  Linux: Secret Service ("Brave Safe Storage" m.fl.), v11 = AES-128-CBC; v10 = den fasta nyckeln "peanuts".
 *  macOS: Nyckelringen (macOS frågar dig om lov), v10 = AES-128-CBC med 1003 PBKDF2-varv.
 *  Windows: nyckeln i Local State, låst med DPAPI, v10 = AES-256-GCM. Chromes egna v20-kakor
 *  (app-bunden kryptering) går inte att läsa för något annat program — de hoppas över.
 * Kakorna läses och sätts direkt här i huvudprocessen och lämnar aldrig datorn. */
const LIBSECRET_APP = { chrome: 'chrome', chromium: 'chromium', brave: 'brave', edge: 'microsoft-edge', vivaldi: 'vivaldi' };
const MAC_NYCKEL = { chrome: ['Chrome Safe Storage', 'Chrome'], chromium: ['Chromium Safe Storage', 'Chromium'], brave: ['Brave Safe Storage', 'Brave'], edge: ['Microsoft Edge Safe Storage', 'Microsoft Edge'], vivaldi: ['Vivaldi Safe Storage', 'Vivaldi'] };
const PY_SECRET = `import sys
app=sys.argv[1]
try:
    import gi; gi.require_version('Secret','1'); from gi.repository import Secret
    s=Secret.password_lookup_sync(Secret.Schema.new('chrome_libsecret_os_crypt_password_v2',Secret.SchemaFlags.DONT_MATCH_NAME,{'application':Secret.SchemaAttributeType.STRING}),{'application':app},None)
    if s: print(s,end=''); sys.exit(0)
except Exception: pass
try:
    import dbus
    b=dbus.SessionBus(); i=dbus.Interface(b.get_object('org.freedesktop.secrets','/org/freedesktop/secrets'),'org.freedesktop.Secret.Service')
    _,ses=i.OpenSession('plain',dbus.String('',variant_level=1))
    u,l=i.SearchItems({'application':app})
    if l: i.Unlock(l)
    for it in list(u)+list(l):
        sec=dbus.Interface(b.get_object('org.freedesktop.secrets',it),'org.freedesktop.Secret.Item').GetSecret(ses)
        print(bytes(sec[2]).decode(),end=''); sys.exit(0)
except Exception: pass
sys.exit(1)`;
async function kakNycklar(webblasare) {
  const n = {};
  if (plat === 'linux') {
    n.v10 = crypto.pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
    let pw = null;
    pw = await kor('python3', ['-c', PY_SECRET, LIBSECRET_APP[webblasare] || webblasare]);
    if (!pw) { const r = await kor('secret-tool', ['lookup', 'application', LIBSECRET_APP[webblasare] || webblasare]); if (r) pw = r.replace(/\n$/, ''); }
    if (pw) n.v11 = crypto.pbkdf2Sync(pw, 'saltysalt', 1, 16, 'sha1');
    n.cbc = true;
  } else if (plat === 'darwin') {
    const [tjanst, konto] = MAC_NYCKEL[webblasare] || [];
    const r = tjanst ? await kor('security', ['find-generic-password', '-w', '-s', tjanst, '-a', konto], { timeout: 120000 }) : null;
    if (r && r.trim()) n.v10 = crypto.pbkdf2Sync(r.trim(), 'saltysalt', 1003, 16, 'sha1');
    n.cbc = true;
  } else if (plat === 'win32') {
    const b = CHROMIUM.find((x) => x.id === webblasare);
    try {
      const ek = Buffer.from(lasJson(path.join(b.dir, 'Local State')).os_crypt.encrypted_key, 'base64');
      if (ek.toString('latin1', 0, 5) === 'DPAPI') {
        const ps = 'Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,"CurrentUser"))';
        const r = await kor('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { input: ek.subarray(5).toString('base64') });
        if (r && r.trim()) n.v10 = Buffer.from(r.trim(), 'base64');
      }
    } catch {}
    n.gcm = true;
  }
  return n;
}
function dekryptera(enc, n, host, meta) {
  const pre = enc.toString('latin1', 0, 3);
  const key = pre === 'v11' ? n.v11 : pre === 'v10' ? n.v10 : null;
  if (!key) return null;
  let v;
  if (n.gcm) {
    const d = crypto.createDecipheriv('aes-256-gcm', key, enc.subarray(3, 15));
    d.setAuthTag(enc.subarray(enc.length - 16));
    v = Buffer.concat([d.update(enc.subarray(15, enc.length - 16)), d.final()]);
  } else {
    const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
    v = Buffer.concat([d.update(enc.subarray(3)), d.final()]);
  }
  // Från databasversion 24 börjar värdet med SHA-256 av domänen (skydd mot att kakor flyttas mellan sajter)
  if (meta >= 24) { if (v.length < 32 || !v.subarray(0, 32).equals(crypto.createHash('sha256').update(host).digest())) return null; v = v.subarray(32); }
  return v.toString('utf8');
}
const SAMESITE_CR = { '-1': 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict' };
const SAMESITE_FF = { 0: 'no_restriction', 1: 'lax', 2: 'strict' };
async function chromeKakor(webblasare, dir) {
  const fil = [path.join(dir, 'Network', 'Cookies'), path.join(dir, 'Cookies')].find((f) => fs.existsSync(f));
  const db = fil && oppnaDb(fil); if (!db) return { kakor: [], last: 0 };
  const ut = [], nu = Date.now() / 1000; let last = 0;
  try {
    let meta = 0; try { meta = Number(db.prepare("SELECT value FROM meta WHERE key='version'").get().value) || 0; } catch {}
    const n = await kakNycklar(webblasare);
    const stmt = db.prepare('SELECT * FROM cookies'); try { stmt.setReadBigInts(true); } catch {}
    for (const c of stmt.all()) {
      if (c.top_frame_site_key && String(c.top_frame_site_key)) continue;     // partitionerade kakor hör till en annan sajt
      let varde = c.value || '';
      const enc = c.encrypted_value ? Buffer.from(c.encrypted_value) : null;
      if (!varde && enc && enc.length) { try { varde = dekryptera(enc, n, c.host_key, meta); } catch { varde = null; } }
      if (varde == null) { last++; continue; }
      const persist = Number(c.has_expires ?? c.is_persistent ?? 1) !== 0;
      const exp = persist ? Number(BigInt(c.expires_utc) / 1000000n) - 11644473600 : 0;
      if (persist && exp && exp < nu) continue;
      ut.push({ host: c.host_key, name: c.name, value: varde, path: c.path || '/', secure: !!Number(c.is_secure), httpOnly: !!Number(c.is_httponly),
        sameSite: SAMESITE_CR[String(Number(c.samesite))] || 'unspecified', exp: persist && exp > 0 ? exp : 0 });
    }
  } catch {} finally { stangDb(db); }
  return { kakor: ut, last };
}
function ffKakor(dir) {
  const db = oppnaDb(path.join(dir, 'cookies.sqlite')); if (!db) return { kakor: [], last: 0 };
  const ut = [], nu = Date.now() / 1000;
  try {
    const stmt = db.prepare("SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite, originAttributes FROM moz_cookies"); try { stmt.setReadBigInts(true); } catch {}
    for (const c of stmt.all()) {
      if (c.originAttributes) continue;                    // behållare/partitioner hoppas över
      let exp = Number(c.expiry) || 0; if (exp > 1e11) exp = Math.floor(exp / 1000);   // nyare Firefox: millisekunder
      if (exp && exp < nu) continue;
      ut.push({ host: c.host, name: c.name, value: c.value || '', path: c.path || '/', secure: !!Number(c.isSecure), httpOnly: !!Number(c.isHttpOnly),
        sameSite: SAMESITE_FF[Number(c.sameSite)] || 'unspecified', exp });
    }
  } catch {} finally { stangDb(db); }
  return { kakor: ut, last: 0 };
}
async function sattKakor(lista) {
  const s = session.defaultSession; let n = 0;
  for (let i = 0; i < lista.length; i += 200) {
    const del = lista.slice(i, i + 200).map(async (c) => {
      const host = c.host.replace(/^\./, ''); if (!host) return;
      const k = { url: (c.secure ? 'https://' : 'http://') + host + (c.path || '/'), name: c.name, value: c.value, path: c.path || '/',
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite };
      if (c.host.startsWith('.') && !c.name.startsWith('__Host-')) k.domain = c.host;
      if (c.exp) k.expirationDate = c.exp;
      if (k.sameSite === 'no_restriction' && !k.secure) k.sameSite = 'lax';
      try { await s.cookies.set(k); n++; } catch {}
    });
    await Promise.all(del);
  }
  try { await s.cookies.flushStore(); } catch {}
  return n;
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
  ipcMain.handle('import:las', async (_e, { typ, id, profil, bokmarken, historik, installningar, flikar, kakor }) => {
    let bm = [], hist = [], inst = null, tabs = [], kak = null;
    try {
      if (typ === 'firefox') {
        if (!kallor().some((k) => k.typ === 'firefox' && k.profiler.some((p) => p.id === profil))) throw new Error('profil saknas');
        if (bokmarken) bm = ffBokmarken(profil);
        if (historik) hist = ffHistorik(profil);
        if (installningar) inst = ffInst(profil);
        if (flikar) tabs = ffFlikar(profil);
        if (kakor) kak = ffKakor(profil);
      } else {
        const dir = chromiumMapp(id, profil); if (!dir) throw new Error('profil saknas');
        if (bokmarken) bm = chromeBokmarken(dir);
        if (historik) hist = chromeHistorik(dir);
        if (installningar) inst = chromeInst(id, dir);
        if (flikar) tabs = chromeFlikar(dir);
        if (kakor) kak = await chromeKakor(id, dir);
      }
    } catch (e) { return { ok: false, fel: String(e.message || e) }; }
    let kakorSatta = 0;
    if (kak && kak.kakor.length) { try { kakorSatta = await sattKakor(kak.kakor); } catch {} }
    return { ok: true, bokmarken: bm, historik: hist, installningar: inst, flikar: tabs.slice(0, 60),
      kakor: kak ? { antal: kakorSatta, last: kak.last, sajter: new Set(kak.kakor.map((c) => c.host.replace(/^\./, '').replace(/^www\./, ''))).size } : null };
  });

  // Installera tilläggen från Chrome Web Store (samma väg som när du lägger till ett själv)
  ipcMain.handle('import:tillagg', async (_e, ids) => {
    const ut = { ok: true, klara: [], fel: [] };
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 60)) {
      try {
        const r = hooks && hooks.installeraTillagg ? await hooks.installeraTillagg(id) : { ok: false };
        if (r && (r.ok || r.redan)) ut.klara.push(id); else ut.fel.push({ id, fel: (r && r.fel) || '' });
      } catch (err) { ut.fel.push({ id, fel: String(err.message || err) }); }
    }
    return ut;
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

module.exports = { setup, kallor, chromeInst, ffInst, mozLz4, snss, chromeFlikar, ffFlikar, chromeKakor, ffKakor };
