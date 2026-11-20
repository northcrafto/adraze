#!/usr/bin/env node
// Startsidans sökruta: förslagslistan ska sitta ihop med den vita rutan som en enda form (ingen glipa, samma bredd,
// raka hörn i skarven), och gå tillbaka till en vanlig rundad ruta när listan stängs. Osynligt (egen Xvfb).
// Användning (från browser/): node tools/test/sokruta-ihop.js [--bilder <mapp>]
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./hjalp');
const R = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(R, 'node_modules', 'electron', 'dist', 'electron');
const argv = process.argv.slice(2);
const BILDER = argv.includes('--bilder') ? path.resolve(argv[argv.indexOf('--bilder') + 1]) : H.tempDir('sokruta-bilder');
fs.mkdirSync(BILDER, { recursive: true });

async function kor() {
  const T = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('sokruta');
  let p = null, skal = null;
  try {
    const cdp = await H.ledigPort();
    p = H.starta(ELECTRON, [R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
    await H.vantaPaPort(cdp, 60000);
    const t = await H.mal(cdp, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'), 30000);
    if (!t) throw new Error('skalet startade inte');
    skal = await H.anslut(t.webSocketDebuggerUrl);
    await skal.skicka('Runtime.enable');
    await H.sov(2500);
    const k = (s) => skal.kor(s);
    const bild = async (namn) => { const r = await skal.skicka('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(BILDER, namn + '.png'), Buffer.from(r.result.data, 'base64')); };
    await k(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); return 1; })()`);
    const matt = `(() => { const a = document.getElementById('nt-sokruta').getBoundingClientRect(), s = document.getElementById('omni-suggest'), b = s.getBoundingClientRect(), ca = getComputedStyle(document.getElementById('nt-sokruta')), cs = getComputedStyle(s);
      return { oppen: s.classList.contains('on'), ihop: s.classList.contains('ihop'), glipa: Math.round(b.top - a.bottom), vanster: Math.round(b.left - a.left), bredd: Math.round(b.width - a.width), rader: s.children.length,
        rutaNere: ca.borderBottomLeftRadius, listaUppe: cs.borderTopLeftRadius, listaNere: cs.borderBottomLeftRadius }; })()`;
    await k(`(() => { const i = document.getElementById('nt-search'); i.focus(); i.value = 'a'; i.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a', bubbles: true })); return 1; })()`);
    await H.sov(2500);
    const m = await k(matt);
    await bild('1-oppen');
    T.ok('listan öppnas med förslag', m.oppen && m.rader > 0, m);
    T.ok('ingen glipa mellan ruta och lista', m.ihop && m.glipa === 0, m.glipa);
    T.ok('samma vänsterkant och bredd', m.vanster === 0 && m.bredd === 0, [m.vanster, m.bredd]);
    T.ok('raka hörn i skarven, runda längst ner', m.rutaNere === '0px' && m.listaUppe === '0px' && m.listaNere === '10px', [m.rutaNere, m.listaUppe, m.listaNere]);
    await k(`(() => { document.getElementById('nt-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`);
    await H.sov(600);
    const e = await k(`(() => ({ oppen: document.getElementById('omni-suggest').classList.contains('on'), klass: document.getElementById('nt-sokruta').classList.contains('oppen'), horn: getComputedStyle(document.getElementById('nt-sokruta')).borderBottomLeftRadius }))()`);
    T.ok('stängd lista: rutan är rundad igen', !e.oppen && !e.klass && e.horn === '10px', e);
    await bild('2-stangd');
    // Adressfältet uppe ska vara som förut (egen lista med glipa)
    await k(`(() => { const i = document.getElementById('address'); i.focus(); i.value = 'a'; i.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'a', bubbles: true })); return 1; })()`);
    await H.sov(1500);
    const o = await k(`(() => { const s = document.getElementById('omni-suggest'); return { oppen: s.classList.contains('on'), ihop: s.classList.contains('ihop'), ruta: document.getElementById('nt-sokruta').classList.contains('oppen') }; })()`);
    T.ok('adressfältets lista är oförändrad', o.oppen && !o.ihop && !o.ruta, o);
  } catch (e) { T.ok('körningen', false, String(e && e.message || e)); }
  finally { try { if (skal) skal.stang(); } catch {} if (p) await H.stang(p); x.stoppa(); }
  console.log(T.text());
  console.log('\nBilder: ' + BILDER);
  const fel = T.fel.length;
  console.log(fel ? `\n${fel} FEL av ${T.rader.length}` : `\nAlla ${T.rader.length} OK`);
  process.exit(fel ? 1 : 0);
}
kor();
