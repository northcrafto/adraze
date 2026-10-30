'use strict';
/* adraze://adblock – blockerarens inställningssida (som brave://adblock + Shields-inställningarna).
 * Här: schemat adraze:// (serverar ui/adblock.*), IPC för sidan, "Blockera element"-väljaren,
 * "Glöm mig när jag stänger webbplatsen" och rapporter om trasiga sidor. Själva blockeringen
 * sköts av adblock-adraze.js med värdena i blockinst.js. */
const fs = require('fs');
const path = require('path');
const { ipcMain, session, webContents } = require('electron');
const inst = require('./blockinst');

const SCHEMA = 'adraze';
// Sidor och filer som får serveras under adraze://<sida>/
const SIDOR = { adblock: 'adblock.html' };
const FILER = new Set(['adblock.js', 'adblock.css', 'i18n.js', 'adraze-mark.png', 'adraze-mark-dark.png']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const UI = path.join(__dirname, 'ui');

let opts = null;   // { adblock, broadcast, tema(), sprak(), localeDict(), apiBas, toast(wc, text) }

function serveraPa(sess) {
  try {
    if (sess.protocol.isProtocolHandled(SCHEMA)) return;
    sess.protocol.handle(SCHEMA, (req) => {
      let u; try { u = new URL(req.url); } catch { return new Response('', { status: 400 }); }
      const sida = SIDOR[u.hostname]; if (!sida) return new Response('Okänd sida', { status: 404 });
      const namn = u.pathname.replace(/^\/+/, '');
      const fil = !namn ? sida : (FILER.has(namn) ? namn : null);
      if (!fil) return new Response('', { status: 404 });
      try {
        const kropp = fs.readFileSync(path.join(UI, fil));
        return new Response(kropp, { headers: {
          'content-type': MIME[path.extname(fil)] || 'application/octet-stream',
          'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; frame-ancestors 'none'",
          'cache-control': 'no-store',
        } });
      } catch { return new Response('', { status: 404 }); }
    });
  } catch (e) { console.warn('[blocksida] schema:', String(e)); }
}

// Bara adraze://-sidor får ändra blockerarens inställningar (inga vanliga webbsidor)
function franSidan(e) { try { return /^adraze:\/\//.test(e.senderFrame ? e.senderFrame.url : e.sender.getURL()); } catch { return false; } }

function tillstand() {
  const p = inst.get();
  const listDir = opts.adblock.motorDirs || {};
  const info = opts.adblock.motorInfo();
  return {
    prefs: p,
    listor: inst.LISTOR.map((l) => {
      let storlek = 0;
      for (const d of [listDir.nya, listDir.medskickad]) { if (!d) continue; try { storlek = fs.statSync(path.join(d, l.id)).size; break; } catch {} }
      return { id: l.id, namn: l.namn, beskr: l.beskr, grupp: l.grupp, pa: inst.listaPa(l.id), standard: l.pa, finns: storlek > 0, storlek, viaAggressiv: p.niva === 'aggressiv' && ['ubo-privacy.txt', 'ubo-annoyances.txt'].includes(l.id) && p.listor[l.id] !== false };
    }),
    antal: info.antal, senast: info.senast,
    pa: opts.adblock.isOn(),
    https: opts.webb ? opts.webb.httpsOnly() : false,
  };
}

/* ── Glöm mig: när sista fliken på en sajt stängs eller lämnar sajten rensas dess kakor och lagring ── */
function sajtAv(url) {
  try { const p = new URL(url).hostname.toLowerCase().split('.'); return (p.length > 2 && /^(co|com|org|net|gov|edu|ac)$/.test(p[p.length - 2])) ? p.slice(-3).join('.') : p.slice(-2).join('.'); } catch { return ''; }
}
const sajtUrsprung = new Map();   // sajt -> Set(origin) som besökts (för clearStorageData)
function noteraBesok(wc, url) {
  if (!/^https?:/i.test(url || '')) return;
  const ny = sajtAv(url);
  const gammal = wc.__glomSajt;
  wc.__glomSajt = ny;
  try { const o = new URL(url).origin; if (!sajtUrsprung.has(ny)) sajtUrsprung.set(ny, new Set()); sajtUrsprung.get(ny).add(o); } catch {}
  if (gammal && gammal !== ny) glomOmStangd(gammal, wc.session);
}
function glomOmStangd(sajt, sess) {
  if (!sajt || !inst.get().glom) return;
  setTimeout(async () => {
    // Är sajten fortfarande öppen i någon flik? Då väntar vi tills den stängs.
    for (const w of webContents.getAllWebContents()) {
      try { if (!w.isDestroyed() && w.session === sess && w.__glomSajt === sajt) return; } catch {}
    }
    try {
      const kakor = await sess.cookies.get({});
      for (const c of kakor) {
        const d = String(c.domain || '').replace(/^\./, '');
        if (d !== sajt && !d.endsWith('.' + sajt)) continue;
        try { await sess.cookies.remove((c.secure ? 'https://' : 'http://') + d + (c.path || '/'), c.name); } catch {}
      }
      for (const o of sajtUrsprung.get(sajt) || []) {
        try { await sess.clearStorageData({ origin: o, storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem', 'shadercache', 'websql'] }); } catch {}
      }
      sajtUrsprung.delete(sajt);
    } catch (e) { console.warn('[glöm mig]', String(e)); }
  }, 1500);
}
function fliken(wc) {
  wc.on('did-navigate', (_e, url) => noteraBesok(wc, url));
  wc.once('destroyed', () => { const s = wc.__glomSajt, sess = wc.session; wc.__glomSajt = null; if (s) glomOmStangd(s, sess); });
}

/* ── Blockera element: väljare i sidan (egen isolerad värld), resultatet blir en dölj-regel för sajten ── */
const VALJARE = `new Promise(function(klar){
  var ut=false,akt=null;
  var ram=document.createElement('div'),rad=document.createElement('div');
  ram.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #ff4b1f;background:rgba(255,75,31,.15);border-radius:3px;transition:all .05s;display:none';
  rad.style.cssText='position:fixed;z-index:2147483647;left:50%;top:14px;transform:translateX(-50%);background:#17171a;color:#fff;font:600 13px/1.3 system-ui,sans-serif;padding:10px 16px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:none';
  rad.textContent=%RAD%;
  document.documentElement.appendChild(ram);document.documentElement.appendChild(rad);
  function vis(el){akt=el;if(!el){ram.style.display='none';return;}var r=el.getBoundingClientRect();ram.style.display='block';ram.style.left=r.left+'px';ram.style.top=r.top+'px';ram.style.width=r.width+'px';ram.style.height=r.height+'px';}
  function under(x,y){var el=document.elementFromPoint(x,y);return el&&el!==document.documentElement&&el!==document.body?el:null;}
  function esc(s){return window.CSS&&CSS.escape?CSS.escape(s):s.replace(/[^a-zA-Z0-9_-]/g,'\\\\$&');}
  function slump(s){return /\\d{3,}|[a-f0-9]{8,}|^[a-z]{1,2}\\d|__|--[a-z0-9]{5,}/i.test(s);}
  function unik(sel){try{return document.querySelectorAll(sel).length===1;}catch(e){return false;}}
  function selektor(el){
    if(el.id&&!slump(el.id)&&unik('#'+esc(el.id)))return '#'+esc(el.id);
    var delar=[],n=el;
    for(var d=0;n&&n.nodeType===1&&n!==document.documentElement&&n!==document.body&&d<6;d++){
      if(d>0&&n.id&&!slump(n.id)){delar.unshift('#'+esc(n.id));if(unik(delar.join(' > ')))return delar.join(' > ');break;}
      var s=n.tagName.toLowerCase();
      var kl=Array.prototype.filter.call(n.classList||[],function(c){return !slump(c);}).slice(0,3);
      if(kl.length)s+='.'+kl.map(esc).join('.');
      var p=n.parentElement;
      if(p&&!kl.length){var syskon=Array.prototype.filter.call(p.children,function(c){return c.tagName===n.tagName;});if(syskon.length>1)s+=':nth-of-type('+(syskon.indexOf(n)+1)+')';}
      delar.unshift(s);
      if(unik(delar.join(' > ')))return delar.join(' > ');
      n=p;
    }
    return delar.join(' > ');
  }
  function sluta(v){if(ut)return;ut=true;removeEventListener('mousemove',mm,true);removeEventListener('click',kl,true);removeEventListener('mousedown',stopp,true);removeEventListener('mouseup',stopp,true);removeEventListener('keydown',kd,true);ram.remove();rad.remove();klar(v);}
  function mm(e){vis(under(e.clientX,e.clientY));}
  function stopp(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}
  function kl(e){stopp(e);var el=akt||under(e.clientX,e.clientY);if(!el)return sluta(null);var s=selektor(el);el.style.setProperty('display','none','important');sluta(s);}
  function kd(e){if(e.key==='Escape'){stopp(e);sluta(null);}}
  addEventListener('mousemove',mm,true);addEventListener('click',kl,true);addEventListener('mousedown',stopp,true);addEventListener('mouseup',stopp,true);addEventListener('keydown',kd,true);
  vis(under(%X%,%Y%));
})`;
async function blockeraElement(wc, x, y, text) {
  let host = ''; try { host = new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch {}
  if (!host) return;
  const kod = VALJARE.replace('%RAD%', JSON.stringify(text.rad)).replace('%X%', String(x | 0)).replace('%Y%', String(y | 0));
  let sel = null;
  try { sel = await wc.executeJavaScriptInIsolatedWorld(1990, [{ code: kod }], true); } catch {}
  if (!sel) return;
  inst.laggTillElement(host, sel);
  if (opts.toast) opts.toast(wc, text.klar);
}
function kanBlockeraElement(wc) {
  if (!opts.adblock.isOn()) return false;
  let privat = false; try { privat = wc.session !== session.defaultSession; } catch {}
  return !privat || inst.get().elementPrivat;
}

/* ── Rapportera trasig sida → AdRazes support (samma ärenden som support.adraze.app) ── */
async function rapportera({ url, text, mejl }) {
  const email = String(mejl || inst.get().kontakt || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, fel: 'Skriv din mejladress så vi kan svara.' };
  const p = inst.get();
  const kropp = [String(text || '').trim() || 'Sidan fungerar inte med AdRaze påslagen.', '', 'Sida: ' + String(url || '').slice(0, 500),
    'Nivå: ' + p.niva + ' · Kakor: ' + p.kakor + ' · Skript: ' + (p.skript ? 'av' : 'på') + ' · Fingeravtryck: ' + (p.fingeravtryck ? 'skydd' : 'av') + ' · Injiceringar: ' + (p.injektioner ? 'blockeras' : 'tillåts')].join('\n');
  try {
    const r = await fetch(opts.apiBas + '/support/nytt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, amne: 'Trasig sida: ' + (String(url || '').replace(/^https?:\/\//, '').slice(0, 80) || 'okänd'), text: kropp, kategori: 'webblasare', sprak: 'sv' }), signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, fel: j.error || j.message || 'Det gick inte att skicka just nu.' };
    if (p.kontakt !== email) inst.satt('kontakt', email);
    return { ok: true, nr: j.nr };
  } catch { return { ok: false, fel: 'Det gick inte att skicka just nu.' }; }
}

function setup(o) {
  opts = o;
  ipcMain.handle('blockinst:get', (e) => (franSidan(e) ? tillstand() : null));
  ipcMain.handle('blockinst:set', (e, nyckel, varde) => (franSidan(e) ? inst.satt(String(nyckel), varde) : false));
  ipcMain.handle('blockinst:https', (e, v) => { if (!franSidan(e) || !opts.webb) return false; opts.webb.setHttpsOnly(v); return true; });
  ipcMain.handle('blockinst:pa', async (e, pa) => { if (!franSidan(e)) return false; await opts.satPa(!!pa); return true; });
  ipcMain.handle('blockinst:uppdatera', async (e) => { if (!franSidan(e)) return null; const n = await opts.adblock.uppdateraListorNu(); return { nya: n, ...tillstand() }; });
  ipcMain.handle('blockinst:ta-bort-element', (e, host, sel) => (franSidan(e) ? inst.taBortElement(String(host), String(sel)) : false));
  ipcMain.handle('blockinst:rapport', (e, data) => (franSidan(e) ? rapportera(data || {}) : { ok: false }));
  ipcMain.on('blockinst:boot', (e) => { e.returnValue = franSidan(e) ? { tema: opts.tema(), sprak: opts.sprak() } : null; });
  ipcMain.on('blockinst:locale', (e, l) => { e.returnValue = franSidan(e) ? opts.localeDict(String(l || '')) : {}; });
  // Skalet (räknaren på falken) och öppna adraze://adblock-flikar får veta när något ändrats
  const meddela = () => { try { opts.broadcast('blockinst:andrat', { raknare: inst.get().raknare }); } catch {} skickaTillSidor('blockinst:andrat'); };
  inst.onAndrat(meddela);
  opts.adblock.onMotorKlar = () => skickaTillSidor('blockinst:andrat');
}
function skickaTillSidor(kanal, ...a) {
  for (const w of webContents.getAllWebContents()) { try { if (!w.isDestroyed() && /^adraze:\/\//.test(w.getURL())) w.send(kanal, ...a); } catch {} }
}

module.exports = { setup, serveraPa, fliken, blockeraElement, kanBlockeraElement, skickaTillSidor, SCHEMA };
