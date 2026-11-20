#!/usr/bin/env node
// Uppdateringsnotisen (och liknande) ska ligga i en egen flytande ruta OVANPÅ den öppna sidan, inte bakom den.
// Osynligt (egen Xvfb). Användning (från browser/): node tools/test/notis-over-sidan.js [--bild <fil.png>]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const H = require('./hjalp');
const R0 = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const BILD = argv.includes('--bild') ? path.resolve(argv[argv.indexOf('--bild') + 1]) : null;
(async () => {
  const T = H.resultat(); const x = await H.startaXvfb(); const profil = H.tempDir('notis');
  const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><title>Sida</title><body style="margin:0;background:#2b6cb0;height:3000px"><h1 style="color:#fff;padding:20px">En vanlig webbsida</h1>'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const cdp = await H.ledigPort();
  const p = H.starta(path.join(R0, 'node_modules', 'electron', 'dist', 'electron'), [R0, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
  let s = null, nv = null;
  try {
    await H.vantaPaPort(cdp);
    const skalT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    if (!skalT) throw new Error('skalet startade inte');
    s = await H.anslut(skalT.webSocketDebuggerUrl); await s.skicka('Runtime.enable'); await H.sov(2500);
    await s.kor(`(() => { try { window.AdrazeIntro && window.AdrazeIntro.stang(); } catch {} try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now()+9e9)); localStorage.setItem('adraze-flytt-erbjuden','1'); } catch {} return 1; })()`);
    // Öppna en riktig webbsida (inte startsidan) och visa uppdateringsnotisen
    await s.kor(`(() => { createTab('http://127.0.0.1:${port}/'); return 1; })()`); await H.sov(2500);
    await s.kor(`showUpdateBanner('9.9.9'); 1`); await H.sov(900);
    T.ok('notiskortet är dolt i skalet (display:none)', await s.kor(`(() => { const e = document.getElementById('update-banner'); return !!e && getComputedStyle(e).display === 'none'; })()`));
    // Den flytande notisvyn ska finnas som eget mål
    const nt = await H.mal(cdp, (t) => t.url.includes('/ui/notis.html'), 8000);
    T.ok('den flytande notisvyn finns', !!nt);
    if (nt) {
      nv = await H.anslut(nt.webSocketDebuggerUrl); await nv.skicka('Runtime.enable'); await H.sov(600);
      const kort = await nv.kor(`(() => { const k = document.querySelector('.notis'); return k ? { titel: k.querySelector('.rubrik span').textContent, knapp: k.querySelector('.knapp').textContent, sek: (k.querySelector('.sek')||{}).textContent } : null; })()`);
      T.ok('kortet visas i den flytande vyn med rätt text', kort && /Uppdatera AdRaze/.test(kort.titel) && /Starta om/.test(kort.knapp), kort);
    }
    if (BILD) { const r = await s.skicka('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(BILD, Buffer.from(r.result.data, 'base64')); }
    // Klick i den flytande vyn ska nå skalet: "Senare" stänger notisen
    if (nv) { await nv.kor(`document.querySelector('.sek').click(); 1`); await H.sov(600);
      T.ok('Senare i den flytande vyn stänger notisen', await s.kor(`!document.getElementById('update-banner')`)); }
  } catch (e) { T.ok('körningen', false, String(e && e.stack || e).slice(0, 400)); }
  finally { try { if (nv) nv.stang(); } catch {} try { if (s) s.stang(); } catch {} await H.stang(p); x.stoppa(); srv.close(); }
  console.log(T.text()); const fel = T.fel.length; console.log(fel ? `\n${fel} FEL av ${T.rader.length}` : `\nAlla ${T.rader.length} OK`); process.exit(fel ? 1 : 0);
})();
