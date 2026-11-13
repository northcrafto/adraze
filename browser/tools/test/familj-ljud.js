#!/usr/bin/env node
// Familj → spärrljud, osynligt (egen Xvfb): ljudvalet i barnkortet (av från början, varning innan det slås på,
// avbryt = fortfarande av, provlyssna, volymtak), att ljudfilerna går att spela, och att spärrsidan spelar ljudet
// EN gång (inte igen vid omladdning av samma sida) – och inte alls när ljudet är av.
// Användning (från browser/): node tools/test/familj-ljud.js [--bilder <mapp>]
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./hjalp');

const R = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(R, 'node_modules', 'electron', 'dist', 'electron');
const argv = process.argv.slice(2);
const BILDER = argv.includes('--bilder') ? path.resolve(argv[argv.indexOf('--bilder') + 1]) : H.tempDir('familj-ljud-bilder');
fs.mkdirSync(BILDER, { recursive: true });
const sov = H.sov;

async function kor() {
  const T = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('familj-ljud');
  let p = null, skal = null;
  try {
    const cdp = await H.ledigPort();
    p = H.starta(ELECTRON, [R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
    await H.vantaPaPort(cdp, 60000);
    const t = await H.mal(cdp, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'), 30000);
    if (!t) throw new Error('skalet startade inte');
    skal = await H.anslut(t.webSocketDebuggerUrl);
    await skal.skicka('Runtime.enable');
    await sov(2000);
    const k = (s) => skal.kor(s);
    const bild = async (namn) => { const r = await skal.skicka('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(BILDER, namn + '.png'), Buffer.from(r.result.data, 'base64')); };
    await k(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true; } catch {} return 1; })()`);

    // Ljudfilerna går att avkoda och har längd
    const langder = await k(`Promise.all(FAM_LJUD.map((l) => new Promise((res) => { const a = new Audio('ljud/sparr-' + l.id + '.ogg');
      a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(-1); setTimeout(() => res(-2), 5000); })))`);
    T.ok('alla fem ljuden laddas', Array.isArray(langder) && langder.length === 5 && langder.every((d) => d > 0.3 && d < 3), langder);

    // Förälder med ett lokalt barn (ingen server behövs)
    await k(`(() => { account = { token: 'test', email: 'f@test.se', name: 'Förälder' };
      fam = { children: [{ id: 'b1', name: 'Emma', age: 9, blocklist: ['spel.se'], allows: [], local: true }], activeChild: null };
      window.family.children = async () => ({ ok: false }); famSave(); openSettings(); showSettingsCat('familj'); renderFam(); return 1; })()`);
    await sov(600);
    T.ok('av från början', await k(`document.querySelector('[data-child=b1] [data-a=ljud]').value === '' && document.querySelector('[data-child=b1] [data-a=ljud-prova]').disabled`));
    await k(`document.querySelector('[data-child=b1] .fam-ljud').scrollIntoView({ block: 'center' })`);
    await bild('1-kortet-av');

    // Spion på uppspelning (efter att filerna provats på riktigt ovan)
    await k(`(() => { window.__spelat = []; const A = window.Audio; window.Audio = function (src) { const a = new A(src); a.play = () => { window.__spelat.push({ src, vol: a.volume }); return Promise.resolve(); }; return a; }; return 1; })()`);

    // Välj ljud → varning; avbryt = fortfarande av
    await k(`(() => { const s = document.querySelector('[data-child=b1] [data-a=ljud]'); s.value = 'stotar'; s.dispatchEvent(new Event('change')); return 1; })()`);
    await sov(500);
    const varning = await k(`(() => { const m = [...document.querySelectorAll('div')].find((d) => /Slå på spärrljud/.test(d.textContent) && getComputedStyle(d).position === 'fixed'); return !!m; })()`);
    T.ok('varning visas innan ljudet slås på', varning);
    T.ok('varningen vid påslag har ingen emoji', !(await k(`/\\p{Extended_Pictographic}/u.test(document.getElementById('fam-confirm').textContent + document.getElementById('fam-confirm').innerHTML)`)));
    await bild('2-varning');
    const knappar = await k(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent && /^(Slå på|Avbryt)$/.test(b.textContent.trim())).map((b) => b.textContent.trim())`);
    T.ok('varningen har Slå på och Avbryt', Array.isArray(knappar) && knappar.includes('Slå på') && knappar.includes('Avbryt'), knappar);
    await k(`[...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === 'Avbryt').click()`);
    await sov(400);
    T.ok('avbryt = fortfarande av', await k(`document.querySelector('[data-child=b1] [data-a=ljud]').value === '' && !(famChildById('b1').sound && famChildById('b1').sound.id)`));

    // Slå på på riktigt
    await k(`(() => { const s = document.querySelector('[data-child=b1] [data-a=ljud]'); s.value = 'stotar'; s.dispatchEvent(new Event('change')); return 1; })()`);
    await sov(500);
    await k(`[...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === 'Slå på').click()`);
    await sov(600);
    T.ok('ljudet sparas', await k(`JSON.stringify(famChildById('b1').sound)`) === JSON.stringify({ id: 'stotar', volym: 60 }));
    T.ok('valet syns efter omritning', await k(`document.querySelector('[data-child=b1] [data-a=ljud]').value === 'stotar' && !document.querySelector('[data-child=b1] [data-a=ljud-prova]').disabled`));
    await k(`document.querySelector('[data-child=b1] .fam-ljud').scrollIntoView({ block: 'center' })`);
    await bild('3-kortet-pa');

    // Provlyssna och volym
    await k(`document.querySelector('[data-child=b1] [data-a=ljud-prova]').click()`);
    await sov(400);
    const provVarning = await k(`(() => { const m = document.getElementById('fam-confirm'); return m ? { text: m.textContent, emoji: /\\p{Extended_Pictographic}/u.test(m.textContent) } : null; })()`);
    T.ok('provlyssna varnar först (sänk volymen), utan emoji', provVarning && /Sänk volymen/.test(provVarning.text) && !provVarning.emoji, provVarning);
    T.ok('inget spelas innan varningen godkänts', (await k(`window.__spelat.length`)) === 0);
    await bild('3b-provvarning');
    await k(`document.getElementById('fam-c-yes').click()`);
    await sov(300);
    let s = await k(`window.__spelat.slice(-1)[0]`);
    T.ok('provlyssna spelar valt ljud', s && /sparr-stotar\.ogg$/.test(s.src) && Math.abs(s.vol - 0.6) < 0.01, s);
    T.ok('knappen blir Stoppa medan ljudet spelar', await k(`document.querySelector('[data-child=b1] [data-a=ljud-prova]').textContent.trim()`) === 'Stoppa');
    await bild('3c-spelar');
    await k(`document.querySelector('[data-child=b1] [data-a=ljud-prova]').click()`);
    await sov(200);
    T.ok('Stoppa avbryter ljudet direkt', await k(`(() => { const b = document.querySelector('[data-child=b1] [data-a=ljud-prova]'); return b.textContent.trim() === 'Provlyssna' && !b.classList.contains('spelar') && _famProv === null; })()`));
    await k(`document.querySelector('[data-child=b1] [data-a=ljud-prova]').click()`);
    await sov(300);
    T.ok('andra provlyssningen varnar inte igen', !(await k(`!!document.getElementById('fam-confirm')`)) && (await k(`window.__spelat.length`)) === 2);
    await k(`famLjudStoppa()`);
    await k(`(() => { const v = document.querySelector('[data-child=b1] [data-a=ljud-vol]'); v.value = '80'; v.dispatchEvent(new Event('change')); return 1; })()`);
    await sov(300);
    T.ok('volymen sparas (max 80)', await k(`famChildById('b1').sound.volym`) === 80);
    T.ok('reglaget går inte över 80', await k(`document.querySelector('[data-child=b1] [data-a=ljud-vol]').max`) === '80');

    // Spärrsidan: barnet aktivt på enheten → ljudet en gång
    await k(`(() => { closeSettings && closeSettings(); fam.activeChild = 'b1'; famSave(); window.__spelat = []; showBlockScreen('https://spel.se/'); return 1; })()`);
    await sov(400);
    s = await k(`window.__spelat`);
    T.ok('spärrsidan spelar ljudet', Array.isArray(s) && s.length === 1 && /sparr-stotar\.ogg$/.test(s[0].src) && Math.abs(s[0].vol - 0.8) < 0.01, s);
    await bild('4-sparrsidan');
    await k(`showBlockScreen('https://spel.se/')`);
    T.ok('inte igen vid omladdning av samma sida', (await k(`window.__spelat.length`)) === 1);
    await k(`showBlockScreen('https://spel.se/', 'fraga')`);
    T.ok('inte när barnet går vidare till fråga om lov', (await k(`window.__spelat.length`)) === 1);

    // Av → tyst
    await k(`(() => { famChildById('b1').sound = { id: '', volym: 60 }; _famLjudSenast = { host: '', t: 0 }; window.__spelat = []; showBlockScreen('https://spel.se/'); return 1; })()`);
    T.ok('avstängt ljud = tyst', (await k(`window.__spelat.length`)) === 0);
    const jsfel = (skal.handelser || []).filter((h) => h.method === 'Runtime.exceptionThrown').map((h) => h.params.exceptionDetails.exception && h.params.exceptionDetails.exception.description);
    T.ok('inga JS-fel', jsfel.length === 0, jsfel);
  } catch (e) {
    T.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    try { if (skal) skal.stang(); } catch {}
    if (p) await H.stang(p);
    x.stoppa();
  }
  console.log(T.text());
  console.log('\nBilder: ' + BILDER);
  const fel = T.fel.length;
  console.log(fel ? `\n${fel} FEL av ${T.rader.length}` : `\nAlla ${T.rader.length} OK`);
  if (fel) console.log('Profil och logg finns kvar: ' + profil);
  else try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  process.exit(fel ? 1 : 0);
}

kor();
