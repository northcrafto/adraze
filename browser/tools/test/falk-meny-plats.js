#!/usr/bin/env node
// Falk: menyn bakom plusknappen (Ladda upp filer, Ladda upp mapp, Projekt) ska öppnas precis ovanför knappen,
// inte ovanför hela sidfoten. Osynligt (egen Xvfb). Användning (från browser/): node tools/test/falk-meny-plats.js [--bild <fil.png>]
'use strict';
const path = require('path'), fs = require('fs');
const H = require('./hjalp');
const R0 = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const BILD = argv.includes('--bild') ? path.resolve(argv[argv.indexOf('--bild') + 1]) : null;
(async () => {
  const R = H.resultat(); const x = await H.startaXvfb(); const profil = H.tempDir('falk-meny');
  const cdp = await H.ledigPort();
  const p = H.starta(path.join(R0, 'node_modules', 'electron', 'dist', 'electron'), [R0, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
  let s = null, f = null;
  try {
    await H.vantaPaPort(cdp);
    const skalT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    if (!skalT) throw new Error('skalet startade inte');
    s = await H.anslut(skalT.webSocketDebuggerUrl); await s.skicka('Runtime.enable'); await H.sov(2500);
    await s.kor(`(() => { try { window.AdrazeIntro && window.AdrazeIntro.stang(); } catch {} return 1; })()`);
    await s.kor(`account = { email: 'test@adraze.test', token: 'test-token', pro: true, name: 'Test' }; openKrypto(true); 1`);
    const falkT = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    R.ok('Falk-panelen öppnades', !!falkT);
    if (!falkT) throw new Error('ingen Falk-panel');
    f = await H.anslut(falkT.webSocketDebuggerUrl); await f.skicka('Runtime.enable'); await H.sov(1500);
    const m = await f.kor(`(() => { document.getElementById('attach').click(); const a = document.getElementById('attach').getBoundingClientRect(), r = document.getElementById('attmenu').getBoundingClientRect();
      return { synlig: document.getElementById('attmenu').classList.contains('on'), glipa: Math.round(a.top - r.bottom), vanster: Math.round(r.left - a.left), topp: Math.round(r.top), bredd: innerWidth, hoger: Math.round(r.right) }; })()`);
    R.ok('menyn öppnas', m.synlig, m);
    R.ok('menyn ligger precis ovanför plusknappen', m.glipa >= 4 && m.glipa <= 14, m.glipa);
    R.ok('menyn börjar vid plusknappens vänsterkant', Math.abs(m.vanster) <= 2, m.vanster);
    R.ok('menyn ryms i panelen', m.topp >= 0 && m.hoger <= m.bredd, [m.topp, m.hoger, m.bredd]);
    await H.sov(400);
    if (BILD) { const r = await f.skicka('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(BILD, Buffer.from(r.result.data, 'base64')); }
    R.ok('klick utanför stänger menyn', await f.kor(`(() => { document.body.click(); return !document.getElementById('attmenu').classList.contains('on'); })()`));
  } catch (e) { R.ok('körningen', false, String(e && e.message || e)); }
  finally { try { if (f) f.stang(); } catch {} try { if (s) s.stang(); } catch {} await H.stang(p); x.stoppa(); }
  console.log(R.text()); const fel = R.fel.length; console.log(fel ? `\n${fel} FEL av ${R.rader.length}` : `\nAlla ${R.rader.length} OK`); process.exit(fel ? 1 : 0);
})();
