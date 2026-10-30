'use strict';
/* Webbinställningar som huvudprocessen sköter: säker DNS, endast HTTPS, webbplatsbehörigheter,
 * nedladdningsmapp, teckenstorlek och rensning av webbdata. Sparas i userData/adraze-webb.json. */
const fs = require('fs');
const path = require('path');
const { app, session, dialog, ipcMain } = require('electron');

const FILE = path.join(app.getPath('userData'), 'adraze-webb.json');
const DNS_SERVERS = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
  google: 'https://dns.google/dns-query',
};
// Behörigheter vi frågar om. Allt annat (helskärm, urklipp-skriv m.m.) släpps igenom som förut.
const KINDS = ['camera', 'microphone', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'external'];
// Behörigheter utan fråga (som i Chrome): ofarliga, eller sådana där du själv redan valt något
const AUTO_OK = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write', 'mediaKeySystem',
  'storage-access', 'top-level-storage-access', 'speaker-selection', 'fileSystem']);
// Allt annat (USB, serieport, HID, Bluetooth, idle-detection, window-management, okända) nekas.
// Protokoll som en sajt aldrig får öppna program med (lokala filer, nätverksdiskar, Windows-hål som Follina)
const FARLIGA_PROTOKOLL = /^(file|javascript|vbscript|data|blob|smb|cifs|nfs|afp|sftp|ftp|ssh|telnet|ldaps?|jar|res|ms-msdt|search-ms|search|ms-officecmd|ms-word|ms-excel|ms-powerpoint|ms-cxh(-full)?|shell|vnc|rdp|x-unix):/i;
const UI_URL = require('url').pathToFileURL(path.join(__dirname, 'ui')).href + '/';

const prefs = Object.assign({
  dns: 'automatic',            // off | automatic | cloudflare | quad9 | google
  httpsOnly: false,
  fontSize: 16,
  downloadDir: '',             // tom = systemets Nedladdningar
  askDownload: false,
  permDefaults: {},            // kind -> 'ask' | 'block'
  perms: {},                   // origin -> { kind: 'allow' | 'block' }
}, (() => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } })());
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(prefs)); } catch {} }, 200); }

/* ── Säker DNS ── */
function applyDns() {
  try {
    const m = prefs.dns;
    if (m === 'off') app.configureHostResolver({ secureDnsMode: 'off' });
    else if (DNS_SERVERS[m]) app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: [DNS_SERVERS[m]] });
    else app.configureHostResolver({ secureDnsMode: 'automatic' });
  } catch (e) { console.warn('[dns]', String(e)); }
}

/* ── Endast HTTPS ── */
const httpOk = new Set();     // värdar användaren gått vidare till utan säker anslutning
function lokal(host) {
  return !host || host === 'localhost' || !host.includes('.') || /\.(local|lan|home|internal|test|localhost)$/i.test(host)
    || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[)/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}
// Braves lista över sajter som inte klarar HTTPS (hämtad i adraze-lists/, annars medskickad)
let httpsUndantag = null, httpsUndantagAt = 0;
function arHttpsUndantag(host) {
  if (!httpsUndantag || Date.now() - httpsUndantagAt > 6 * 3600 * 1000) {
    httpsUndantagAt = Date.now(); httpsUndantag = new Set();
    for (const f of [path.join(app.getPath('userData'), 'adraze-lists', 'brave-https-undantag.txt'), path.join(__dirname, 'adraze', 'lists', 'brave-https-undantag.txt')]) {
      try { for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const h = r.trim().toLowerCase(); if (h && !h.startsWith('#')) httpsUndantag.add(h); } break; } catch {}
    }
  }
  const h = String(host || '').toLowerCase();
  return httpsUndantag.has(h) || httpsUndantag.has(h.replace(/^www\./, ''));
}
// Anropas för varje huvudsida innan den hämtas. Ger en https-adress när den ska uppgraderas.
function upgradeUrl(d) {
  if (!prefs.httpsOnly || d.resourceType !== 'mainFrame' || !/^http:/i.test(d.url)) return null;
  let u; try { u = new URL(d.url); } catch { return null; }
  if (lokal(u.hostname) || httpOk.has(u.hostname) || arHttpsUndantag(u.hostname)) return null;
  u.protocol = 'https:'; if (u.port === '80') u.port = '';
  try { if (d.webContents) d.webContents.__httpsUpg = { host: u.hostname, from: d.url }; } catch {}
  return u.toString();
}
// https-försöket misslyckades: fel som betyder att sajten inte har (fungerande) https
const HTTPS_FAIL = new Set([-100, -101, -102, -104, -105, -106, -107, -109, -113, -118, -125, -130, -137, -148, -200, -201, -202, -203, -204, -205, -206, -207, -208, -210, -211, -212, -213, -214, -215, -216, -217, -218]);
function httpsFailed(wc, code, url) {
  const u = wc.__httpsUpg; if (!u || !HTTPS_FAIL.has(code)) return null;
  try { if (new URL(url).hostname !== u.host) return null; } catch { return null; }
  wc.__httpsUpg = null;
  return u.from;
}

/* ── Behörigheter ── */
const memPerms = new Map();   // inkognito: bara i minnet
let asker = null;             // (wc, origin, kinds) => Promise<{allow, remember}>
function originOf(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : ''; } catch { return ''; } }
function store(incog) {
  if (!incog) return prefs.perms;
  if (!memPerms.has('x')) memPerms.set('x', {});
  return memPerms.get('x');
}
function decision(origin, kind, incog) {
  const s = store(incog)[origin] || (incog ? prefs.perms[origin] : null) || {};
  if (s[kind]) return s[kind];
  return prefs.permDefaults[kind] === 'block' ? 'block' : 'ask';
}
function kindsFor(perm, details) {
  if (perm === 'media') {
    const t = (details && details.mediaTypes) || [];
    const k = []; if (t.includes('video')) k.push('camera'); if (t.includes('audio')) k.push('microphone');
    return k.length ? k : ['camera', 'microphone'];
  }
  if (perm === 'midiSysex') return ['midi'];
  if (perm === 'openExternal') return ['external'];
  return KINDS.includes(perm) ? [perm] : null;
}
function installPermissions(sess, incog) {
  try {
    sess.setPermissionRequestHandler(async (wc, perm, cb, details) => {
      const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
      if (url.startsWith(UI_URL)) { cb(true); return; }              // AdRazes egna sidor
      if (perm === 'openExternal' && FARLIGA_PROTOKOLL.test(String((details && details.externalURL) || ''))) { cb(false); return; }
      const kinds = kindsFor(perm, details);
      if (!kinds) { cb(AUTO_OK.has(perm)); return; }
      const origin = originOf(url); if (!origin || !wc || !wc.__ctx) { cb(false); return; }
      const dec = kinds.map((k) => decision(origin, k, incog));
      if (dec.includes('block')) { cb(false); return; }
      if (dec.every((d) => d === 'allow')) { cb(true); return; }
      let ans = { allow: false, remember: false };
      try { ans = asker ? await asker(wc, origin, kinds) : ans; } catch {}
      if (ans.remember) {
        const s = store(incog); s[origin] = s[origin] || {};
        for (const k of kinds) s[origin][k] = ans.allow ? 'allow' : 'block';
        if (!incog) save();
      }
      cb(!!ans.allow);
    });
    sess.setPermissionCheckHandler((wc, perm, origin, details) => {
      if (String(origin || '').startsWith('file://') && (!wc || String(wc.getURL() || '').startsWith(UI_URL))) return true;
      let kinds = kindsFor(perm, details);
      if (perm === 'media' && details && details.mediaType) kinds = [details.mediaType === 'video' ? 'camera' : 'microphone'];
      if (!kinds) return AUTO_OK.has(perm);
      const o = originOf(origin || (details && details.requestingUrl) || '');
      return !!o && kinds.every((k) => decision(o, k, incog) === 'allow');
    });
  } catch (e) { console.warn('[perms]', String(e)); }
}

/* ── Nedladdningar ── */
function downloadDir() {
  const d = prefs.downloadDir;
  if (d) { try { if (fs.statSync(d).isDirectory()) return d; } catch {} }
  return app.getPath('downloads');
}

/* ── IPC till inställningarna ── */
function setup({ onDnsChanged } = {}) {
  ipcMain.handle('webb:get', () => ({
    dns: prefs.dns, httpsOnly: prefs.httpsOnly, fontSize: prefs.fontSize,
    downloadDir: downloadDir(), downloadDirCustom: !!prefs.downloadDir, askDownload: prefs.askDownload,
    permDefaults: prefs.permDefaults, perms: prefs.perms,
  }));
  ipcMain.handle('webb:set', (_e, k, v) => {
    if (k === 'dns' && (v === 'off' || v === 'automatic' || DNS_SERVERS[v])) { prefs.dns = v; applyDns(); if (onDnsChanged) onDnsChanged(); }
    else if (k === 'httpsOnly') { prefs.httpsOnly = !!v; if (!v) httpOk.clear(); }
    else if (k === 'fontSize') { const n = parseInt(v, 10); if (n >= 9 && n <= 30) prefs.fontSize = n; }
    else if (k === 'askDownload') prefs.askDownload = !!v;
    else if (k === 'downloadDir') prefs.downloadDir = '';
    else if (k === 'permDefault' && v && KINDS.includes(v.kind)) prefs.permDefaults[v.kind] = v.value === 'block' ? 'block' : 'ask';
    else if (k === 'perm' && v && v.origin) {
      const s = prefs.perms[v.origin] = prefs.perms[v.origin] || {};
      if (v.value === 'allow' || v.value === 'block') s[v.kind] = v.value; else delete s[v.kind];
      if (!Object.keys(s).length) delete prefs.perms[v.origin];
    } else if (k === 'permForget' && v) delete prefs.perms[v];
    else return false;
    save(); return true;
  });
  ipcMain.handle('webb:pick-download-dir', async (e) => {
    const { BrowserWindow } = require('electron');
    const w = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(w, { properties: ['openDirectory', 'createDirectory'], defaultPath: downloadDir() });
    if (r.canceled || !r.filePaths[0]) return null;
    prefs.downloadDir = r.filePaths[0]; save(); return prefs.downloadDir;
  });
  // Rensa cookies/webbplatsdata och/eller cache i både vanliga och privata sessionen
  ipcMain.handle('webb:clear', async (_e, what) => {
    const sess = [session.defaultSession, session.fromPartition('skoll-incognito')];
    for (const s of sess) {
      if (what && what.cookies) {
        try { await s.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem', 'websql'] }); } catch {}
      }
      if (what && what.cache) { try { await s.clearCache(); } catch {} try { await s.clearCodeCaches({}); } catch {} }
    }
    if (what && what.cookies) memPerms.clear();
    return true;
  });
}

module.exports = {
  prefs, setup, applyDns, upgradeUrl, httpsFailed, allowHttp: (h) => httpOk.add(h),
  installPermissions, setAsker: (fn) => { asker = fn; }, downloadDir, fontSize: () => prefs.fontSize,
  // adraze://adblock har samma reglage som Integritet & säkerhet
  httpsOnly: () => !!prefs.httpsOnly, setHttpsOnly: (v) => { prefs.httpsOnly = !!v; if (!v) httpOk.clear(); save(); },
};
