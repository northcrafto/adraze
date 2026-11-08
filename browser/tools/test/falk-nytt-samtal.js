#!/usr/bin/env node
// Falk: har panelen varit stängd i 30 minuter öppnas ett nytt samtal (det gamla ligger kvar i listan).
// Kortare paus = samma samtal. Ett tomt samtal återanvänds. Gäller även när panelen laddas om (omstart).
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

async function kor(rot) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('falk-nytt');
  const logg = path.join(profil, 'logg.txt');
  const cdp = await H.ledigPort();
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, [rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  let s = null, f = null;
  try {
    await H.vantaPaPort(cdp);
    const skalT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!skalT);
    if (!skalT) return R;
    s = await H.anslut(skalT.webSocketDebuggerUrl); await s.skicka('Runtime.enable');
    const K = (e) => s.kor(e);
    await H.sov(2500);
    await K(`account = { email: 'test@adraze.test', token: 'test-token', pro: true, name: 'Test' }; openKrypto(true); 1`);
    const falkT = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    R.ok('Falk-panelen öppnades', !!falkT);
    if (!falkT) return R;
    f = await H.anslut(falkT.webSocketDebuggerUrl); await f.skicka('Runtime.enable');
    await H.sov(1200);
    const F = (e) => f.kor(e);
    const J = async (e) => JSON.parse(await F(`JSON.stringify(${e})`));
    const lage = () => J(`(() => { const o = JSON.parse(localStorage.getItem('krypto-convos')); const a = o.list.find((c) => c.id === o.activeId); return { n: o.list.length, aktiv: o.activeId, msgs: a ? a.messages.length : -1 }; })()`);
    // Ett samtal med innehåll
    await F(`(() => { const c = activeConvo(); c.messages.push({ role: 'user', content: 'gammal fråga' }, { role: 'assistant', content: 'svar' }); c.title = 'gammal fråga'; saveConvos(); render(); return 1; })()`);
    const fore = await lage();
    const stang = async () => { await K(`openKrypto(false); 1`); await H.sov(700); };
    const oppna = async () => { await K(`openKrypto(true); 1`); await H.sov(900); };
    const backa = (min) => F(`localStorage.setItem('krypto-senast', String(Date.now() - ${min} * 60000)); 1`);

    await stang(); await backa(10); await oppna();
    const kort = await lage();
    R.ok('stängd 10 min: samma samtal', kort.aktiv === fore.aktiv && kort.n === fore.n, kort);

    await stang(); await backa(31); await oppna();
    const lang = await lage();
    R.ok('stängd 31 min: nytt tomt samtal', lang.aktiv !== fore.aktiv && lang.msgs === 0 && lang.n === fore.n + 1, lang);
    R.ok('gamla samtalet finns kvar i listan', await F(`convos.some((c) => c.title === 'gammal fråga' && c.messages.length === 2)`));
    R.ok('rubriken visar inget gammalt samtal', !/gammal fråga/.test(await F(`document.getElementById('log').innerText`)));

    await stang(); await backa(45); await oppna();
    const tom = await lage();
    R.ok('tomt samtal återanvänds (inga högar av tomma)', tom.aktiv === lang.aktiv && tom.n === lang.n, tom);

    // Omstart/omladdning efter 30 min
    await F(`(() => { const c = activeConvo(); c.messages.push({ role: 'user', content: 'andra frågan' }); saveConvos(); return 1; })()`);
    // som om webbläsaren stängdes för 40 min sedan: körs efter Falks egen pagehide-sparning
    await F(`window.addEventListener('pagehide', () => localStorage.setItem('krypto-senast', String(Date.now() - 40 * 60000))); location.reload(); 1`).catch(() => {});
    await H.sov(2500);
    try { f.stang(); } catch {}
    const falkT2 = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    f = await H.anslut(falkT2.webSocketDebuggerUrl); await f.skicka('Runtime.enable');
    const omst = await lage();
    R.ok('laddas om efter 40 min: nytt samtal', omst.aktiv !== tom.aktiv && omst.msgs === 0, omst);

    // Öppen panel räknas som öppnad: senast uppdateras när den stängs
    await stang();
    const senast = Number(await F(`localStorage.getItem('krypto-senast')`));
    R.ok('stängning sparar tiden', Date.now() - senast < 5000, Date.now() - senast);

    const fel = f.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i Falk', !fel.length, fel);
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    try { if (s) s.stang(); if (f) f.stang(); } catch {}
    await H.stang(p);
    x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const rot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
  kor(rot).then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
}
