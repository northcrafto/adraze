#!/usr/bin/env node
// Sond: öppnar riktiga piratsajter osynligt i AdRaze (egen Xvfb + egen profil), klickar på sidan som en människa
// och listar det som slank igenom: nya flikar/popups, flytande reklamrutor (fixed, högt z-index) och reklam-iframes.
// Användning (från browser/): node tools/sond/piratsond.js url1 url2 ...   → skärmdumpar i $SOND_UT (standard /tmp/piratsond)
'use strict';
const path = require('path');
const fs = require('fs');
const H = require('../test/hjalp');
const R = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(R, 'node_modules', 'electron', 'dist', 'electron');
const UT = process.env.SOND_UT || '/tmp/piratsond';
fs.mkdirSync(UT, { recursive: true });
const sov = H.sov;
const logg = (...a) => console.error('[sond]', new Date().toISOString().slice(11, 19), ...a);
const SKANNA = `(() => {
  const ut = [];
  for (const e of document.querySelectorAll('body *')) {
    const s = getComputedStyle(e);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    const r = e.getBoundingClientRect();
    if (r.width < 40 || r.height < 30 || s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const z = parseInt(s.zIndex) || 0;
    if (z < 100 && r.width * r.height > innerWidth * innerHeight * 0.9) continue;
    ut.push({ tag: e.tagName, id: e.id, kl: String(e.className).slice(0, 60), z, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), text: (e.innerText || '').trim().slice(0, 80).replace(/\\s+/g, ' '), src: (e.querySelector('iframe,img') || {}).src?.slice(0, 120) || '' });
  }
  const ifr = [...document.querySelectorAll('iframe')].filter(f => { const r = f.getBoundingClientRect(); return r.width > 20 && r.height > 20; }).map(f => (f.src || '(tom)').slice(0, 120));
  const tp = [...new Set(performance.getEntriesByType('resource').map(r => r.name).filter(n => { try { const h = new URL(n).hostname; return !h.endsWith(location.hostname.replace(/^www\./, '')) && !/tmdb|gstatic|googleapis|fonts/.test(h); } catch { return false; } }).map(n => n.slice(0, 110)))];
  return { flytande: ut.slice(0, 15), iframes: ifr.slice(0, 15), tredje: tp.slice(0, 30) };
})()`;

async function kor(urls) {
  const x = await H.startaXvfb();
  const profil = H.tempDir('piratsond');
  const lister = process.env.SOND_LISTOR || path.join(require('os').homedir(), '.config/AdRaze/adraze-lists');
  const ud = path.join(profil, 'config', 'AdRaze', 'adraze-lists');
  if (fs.existsSync(lister)) { fs.mkdirSync(ud, { recursive: true }); for (const f of fs.readdirSync(lister)) fs.copyFileSync(path.join(lister, f), path.join(ud, f)); }
  let p = null, skal = null;
  const rapport = [];
  try {
    const cdp = await H.ledigPort();
    p = H.starta(ELECTRON, [R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
    await H.vantaPaPort(cdp, 60000); logg('cdp uppe');
    const t = await H.mal(cdp, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'), 30000);
    logg('skal', !!t); skal = await H.anslut(t.webSocketDebuggerUrl);
    await skal.skicka('Runtime.enable');
    await sov(2500);
    await skal.kor(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true; } catch {} return 1; })()`);
    const medTid = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('tidsgräns')), ms))]);
    for (const url of urls) {
      const fore = new Set((await H.hamtaJson(cdp, "/json")).map((t) => t.id));
      logg('öppnar', url); await medTid(skal.kor(`createTab(${JSON.stringify(url)}); 1`), 8000);
      await sov(9000);
      let lista = await H.hamtaJson(cdp, "/json");
      const st = lista.find((t) => !fore.has(t.id) && t.type !== 'service_worker' && !t.url.startsWith('file:') && !t.url.startsWith('devtools'));
      const post = { url, slutUrl: st && st.url };
      logg('flik', st && st.url);
      if (st) {
        const sida = await H.anslut(st.webSocketDebuggerUrl);
        try {
          await medTid(sida.skicka('Page.enable'), 5000);
          post.fore = await medTid(sida.kor(SKANNA), 8000);
          // klicka mitt på sidan två gånger (popunders brukar hänga på första klicket)
          for (let i = 0; i < 2; i++) {
            for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await medTid(sida.skicka('Input.dispatchMouseEvent', { type, x: 640, y: 420, button: 'left', clickCount: 1 }), 5000);
            await sov(2500);
          }
          await sov(+(process.env.SOND_VANTA || 3000));
          post.efter = await medTid(sida.kor(SKANNA), 8000);
          const bild = await medTid(sida.skicka('Page.captureScreenshot', { format: 'png' }), 10000);
          const namn = new URL(url).hostname.replace(/\W/g, '_');
          if (bild && bild.data) fs.writeFileSync(path.join(UT, namn + '.png'), Buffer.from(bild.data, 'base64'));
        } catch (e) { post.fel = String(e); }
        try { sida.stang(); } catch {}
      }
      lista = await medTid(H.hamtaJson(cdp, "/json"), 8000).catch(() => []);
      post.nyaFlikar = lista.filter((t) => !fore.has(t.id) && t.type === 'page' && !t.url.startsWith('file:') && t.id !== (st && st.id)).map((t) => t.url.slice(0, 120));
      post.flikarISkalet = await medTid(skal.kor(`(typeof tabs !== 'undefined' ? tabs.map(t => (t.url || '').slice(0, 100)) : [])`), 8000).catch(() => 'tidsgräns');
      logg('klar', url); rapport.push(post);
      console.log(JSON.stringify(post));
      await medTid(skal.kor(`(() => { try { while (tabs.length > 1) closeTab(tabs[tabs.length - 1].id); } catch (e) {} return 1; })()`), 8000).catch(() => {});
      await sov(800);
    }
  } finally {
    try { if (skal) skal.stang(); } catch {}
    if (p) await H.stang(p);
    if (x && x.stang) x.stang();
  }
  fs.writeFileSync(path.join(UT, 'rapport.json'), JSON.stringify(rapport, null, 1));
}
kor(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
