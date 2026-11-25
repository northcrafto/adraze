#!/usr/bin/env node
// Webbsidornas eget mörka läge (tema.sajter), osynligt i egen Xvfb: en vanlig webbsida ska se prefers-color-scheme: dark
// från start, "Ljusa" och "Som AdRaze" ska byta det direkt, och skalets eget ljust/mörkt får inte påverkas.
// Användning (från browser/): node tools/test/morkasajter.js
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const H = require('./hjalp');
const R = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(R, 'node_modules', 'electron', 'dist', 'electron');
const sov = H.sov;

async function kor() {
  const T = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('morkasajter');
  let p = null, skal = null, sida = null;
  const SIDA = '<!doctype html><meta name="color-scheme" content="light dark"><title>mörktest</title><style>body{background:#fff}@media (prefers-color-scheme:dark){body{background:#111}}</style><p>hej';
  const srv = http.createServer((_q, s) => { s.setHeader('content-type', 'text/html; charset=utf-8'); s.end(SIDA); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  try {
    const cdp = await H.ledigPort();
    p = H.starta(ELECTRON, [R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
    await H.vantaPaPort(cdp, 60000);
    const t = await H.mal(cdp, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'), 30000);
    if (!t) throw new Error('skalet startade inte');
    skal = await H.anslut(t.webSocketDebuggerUrl);
    await skal.skicka('Runtime.enable');
    await sov(2500);
    const k = (s) => skal.kor(s);
    await k(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true; } catch {} return 1; })()`);
    await k(`createTab(${JSON.stringify(url)}); 1`);
    const st = await H.mal(cdp, (t) => t.url.startsWith(url), 20000);
    if (!st) throw new Error('testsidan öppnades inte');
    sida = await H.anslut(st.webSocketDebuggerUrl);
    await sov(800);
    const mork = () => sida.kor(`matchMedia('(prefers-color-scheme: dark)').matches`);
    const bg = () => sida.kor(`getComputedStyle(document.body).backgroundColor`);
    const satt = async (nyckel, v) => { await k(`window.Anpassa.set(${JSON.stringify(nyckel)}, ${JSON.stringify(v)}, 'test'); 1`); await sov(700); };
    const skalTema = () => k(`document.documentElement.dataset.theme`);

    T.ok('standard: sajten ser mörkt läge', (await mork()) === true);
    T.ok('standard: sajtens egen mörka färg används', (await bg()) === 'rgb(17, 17, 17)', await bg());
    T.ok('skalet är fortfarande ljust', (await skalTema()) === 'light', await skalTema());

    await satt('tema.sajter', 'ljusa');
    T.ok('Ljusa: sajten ser ljust läge direkt', (await mork()) === false && (await bg()) === 'rgb(255, 255, 255)', await bg());

    await satt('tema.sajter', 'tema');
    T.ok('Som AdRaze + ljust tema: sajten är ljus', (await mork()) === false);
    await satt('tema.lage', 'morkt');
    T.ok('Som AdRaze + mörkt tema: sajten är mörk', (await mork()) === true);
    T.ok('skalet blev mörkt', (await skalTema()) === 'dark');
    await satt('tema.lage', 'ljust');
    T.ok('Som AdRaze + ljust igen: sajten är ljus', (await mork()) === false);

    await satt('tema.sajter', 'morka');
    T.ok('Mörka igen: sajten är mörk', (await mork()) === true);
    // Följ systemet ska läsa datorns riktiga läge (ljust i Xvfb), inte det AdRaze valt åt sajterna
    await satt('tema.lage', 'system');
    T.ok('Följ systemet: skalet följer datorn (ljust), inte sajternas mörka läge', (await skalTema()) === 'light', await skalTema());
    T.ok('sajten är fortfarande mörk', (await mork()) === true);
    await satt('tema.lage', 'ljust');

    // Inställningsraden finns och visar rätt val
    await k(`(() => { if (typeof openSettings === 'function') openSettings(); document.dispatchEvent(new Event('anpassa:visa')); return 1; })()`);
    await sov(800);
    const rad = await k(`(() => { const b = [...document.querySelectorAll('#anp-tema [data-namn="sajter"]')]; return b.map((x) => x.dataset.v + ':' + x.classList.contains('on')).join(','); })()`);
    T.ok('raden Webbsidor finns med Mörka valt', rad === 'morka:true,tema:false,ljusa:false', rad);

    const jsfel = (skal.handelser || []).filter((h) => h.method === 'Runtime.exceptionThrown').map((h) => h.params.exceptionDetails.exception && h.params.exceptionDetails.exception.description);
    T.ok('inga JS-fel', jsfel.length === 0, jsfel);
  } catch (e) {
    T.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    try { if (sida) sida.stang(); } catch {}
    try { if (skal) skal.stang(); } catch {}
    if (p) await H.stang(p);
    try { srv.close(); } catch {}
    x.stoppa();
  }
  console.log(T.text());
  const fel = T.fel.length;
  console.log(fel ? `\n${fel} FEL av ${T.rader.length}` : `\nAlla ${T.rader.length} OK`);
  if (fel) console.log('Profil och logg finns kvar: ' + profil);
  else try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  process.exit(fel ? 1 : 0);
}
kor();
