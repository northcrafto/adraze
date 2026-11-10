#!/usr/bin/env node
// Inställningar › Falk: färg, panelbredd, textstorlek, svarslängd, hälsning och tänkord når Falk-panelen direkt,
// och "Använd Falk" av river panelen, gömmer knappen och gör att huvudprocessen vägrar allt som rör Falk.
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

async function kor(rot) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('falk-inst');
  const [cdp, insp] = [await H.ledigPort(), await H.ledigPort()];
  const p = H.starta(path.join(rot, 'node_modules', 'electron', 'dist', 'electron'), ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
  let s = null, f = null, m = null;
  try {
    await H.vantaPaPort(cdp);
    s = await H.anslut((await H.mal(cdp, (t) => t.url.includes('shell.html'))).webSocketDebuggerUrl); await s.skicka('Runtime.enable');
    m = await H.anslut((await H.mal(insp, () => true)).webSocketDebuggerUrl); await m.skicka('Runtime.enable');
    // Falks server ersätts i huvudprocessen. Den riktiga krypto:chat sparas undan för att prova att den vägrar när Falk är av.
    await m.kor(`(() => { const el = process.mainModule.require('electron'); const h = el.ipcMain._invokeHandlers;
      globalThis.__riktig = h.get('krypto:chat'); globalThis.__sista = null; globalThis.__vanta = 300;
      h.set('krypto:samtycke', async () => true);
      h.set('krypto:chat', (e, messages) => { globalThis.__sista = messages; return new Promise((r) => setTimeout(() => r({ ok: true, reply: 'Klart.' }), globalThis.__vanta)); }); return 1; })()`);
    await H.sov(2500);
    const S = (e) => s.kor(e);
    const SJ = async (e) => JSON.parse(await S(`JSON.stringify(${e})`));
    const paneler = async () => (await H.hamtaJson(cdp, '/json')).filter((t) => t.url.includes('/ui/krypto.html')).length;

    R.ok('inställningssidan finns', await S(`!!document.querySelector('#falk-inst #tgl-falk-pa') && document.querySelectorAll('#falk-farger [data-farg]').length === 8`));
    const std = await SJ(`({ pa: tgl('tgl-falk-pa'), bredd: vald('bredd'), text: vald('text'), svar: vald('svar'), h: tgl('tgl-falk-halsning'), t: tgl('tgl-falk-tankord'), farg: (document.querySelector('#falk-farger .on') || {}).dataset?.farg })`
      .replace(/tgl\(/g, `((i) => document.getElementById(i).checked)(`).replace(/vald\(/g, `((n) => (document.querySelector('#falk-inst [data-falk="' + n + '"].on') || {}).dataset?.v)(`));
    R.ok('standardvärden markerade', std.pa && std.bredd === 'normal' && std.text === 'normal' && std.svar === 'normal' && std.h && std.t && std.farg === '#ff4b1f', std);

    await S(`account = { email: 'test@adraze.test', token: 't', pro: true, name: 'Test' }; openKrypto(true); 1`);
    const ft = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    R.ok('Falk-panelen öppnades', !!ft); if (!ft) return R;
    f = await H.anslut(ft.webSocketDebuggerUrl); await f.skicka('Runtime.enable'); await H.sov(1500);
    const F = (e) => f.kor(e);
    const FJ = async (e) => JSON.parse(await F(`JSON.stringify(${e})`));
    const klick = (sel) => S(`(document.querySelector(${JSON.stringify(sel)}).click(), 1)`);
    const utseende = () => FJ(`({ w: innerWidth, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), text: document.documentElement.dataset.ftext, hej: (document.querySelector('.hero h1') || {}).textContent || '', utan: !!document.querySelector('.hero h1.utan') })`);

    const u0 = await utseende();
    R.ok('panelen: standardbredd 400 och orange', u0.w === 400 && u0.accent === '#ff4b1f' && u0.text === 'normal', u0);
    R.ok('hälsningen visas', /Hej/.test(u0.hej) && !u0.utan, u0.hej);

    await klick('#falk-inst [data-falk="bredd"][data-v="bred"]'); await H.sov(900);
    await klick('#falk-farger [data-farg="#3b6fe0"]'); await H.sov(300);
    await klick('#falk-inst [data-falk="text"][data-v="stor"]'); await H.sov(300);
    await klick('#tgl-falk-halsning'); await H.sov(600);
    const u1 = await utseende();
    R.ok('bred panel: 480', u1.w === 480, u1.w);
    R.ok('färgen byts i panelen', u1.accent === '#3b6fe0', u1.accent);
    R.ok('textstorleken byts i panelen', u1.text === 'stor', u1.text);
    R.ok('hälsningen av: bara frågan', !/Hej/.test(u1.hej) && u1.utan, u1.hej);
    R.ok('valen markeras i inställningarna', await S(`document.querySelector('#falk-inst [data-falk="bredd"][data-v="bred"]').classList.contains('on') && document.querySelector('#falk-farger [data-farg="#3b6fe0"]').classList.contains('on')`));
    const fs1 = await F(`(() => { const b = document.createElement('div'); b.className = 'msg krypto'; b.innerHTML = '<div class="bubble">x</div>'; document.body.appendChild(b); const v = getComputedStyle(b.firstChild).fontSize; b.remove(); return v; })()`);
    R.ok('stor text: 16,5 px i samtalet', fs1 === '16.5px', fs1);

    // Svarslängd hamnar i Falks instruktioner, tänkord av = bara "Falk tänker"
    await klick('#falk-inst [data-falk="svar"][data-v="kort"]'); await klick('#tgl-falk-tankord'); await H.sov(500);
    await m.kor(`(globalThis.__vanta = 3500, 1)`);
    await F(`(() => { inp.value = 'hej'; send(); return 1; })()`);
    await H.sov(2600);
    const tt = await F(`(document.querySelector('.msg.typing .tt') || {}).textContent || ''`);
    R.ok('tänkord av: står bara att Falk tänker', tt === 'Falk tänker', tt);
    const skickat = await m.kor(`JSON.stringify(globalThis.__sista || [])`);
    R.ok('kort svarslängd står i instruktionerna', /SVARSLÄNGD/.test(skickat) && /KORTA svar/.test(skickat));
    await H.sov(2000);
    await klick('#falk-inst [data-falk="svar"][data-v="utforlig"]'); await H.sov(400);
    await m.kor(`(globalThis.__vanta = 200, 1)`);
    await F(`(() => { inp.value = 'hej igen'; send(); return 1; })()`); await H.sov(1500);
    R.ok('utförlig svarslängd står i instruktionerna', /UTFÖRLIGA svar/.test(await m.kor(`JSON.stringify(globalThis.__sista || [])`)));

    // Av: panelen rivs, knappen bort, inget öppnar Falk, huvudprocessen vägrar
    await klick('#tgl-falk-pa'); await H.sov(1200);
    R.ok('av: panelen är borta', (await paneler()) === 0, await paneler());
    const av = await SJ(`({ klass: document.documentElement.classList.contains('falk-av'), knapp: getComputedStyle(document.getElementById('krypto-btn')).display, resten: document.getElementById('falk-inst-resten').hidden, not: !document.getElementById('falk-av-not').hidden, oppen: kryptoOpen })`);
    R.ok('av: knappen gömd och inställningarna hopfällda', av.klass && av.knapp === 'none' && av.resten && av.not && av.oppen === false, av);
    await S(`openKrypto(true); 1`); await H.sov(900);
    R.ok('av: Falk går inte att öppna', (await paneler()) === 0 && (await S(`kryptoOpen`)) === false);
    R.ok('av: besked i en toast', /Falk är avstängd/.test(await S(`document.getElementById('apptoast').textContent`)));
    await S(`(window.view.kryptoToggle(true, 'pro', 't'), 1)`); await H.sov(900);
    R.ok('av: huvudprocessen öppnar ingen panel', (await paneler()) === 0);
    const vagrar = await m.kor(`Promise.resolve(globalThis.__riktig({ sender: {}, senderFrame: { url: ${JSON.stringify(require('url').pathToFileURL(path.join(rot, 'ui', 'krypto.html')).href)} } }, [{ role: 'user', content: 'hej' }])).then((r) => JSON.stringify(r))`);
    R.ok('av: inget skickas till AI-tjänsten', /Falk är avstängd/.test(vagrar) && /"ok":false/.test(vagrar), vagrar);
    R.ok('av: sparat i butiken', (await m.kor(`String(process.mainModule.require('./falk-inst').av())`)) === 'true');

    // På igen: allt tillbaka, med valen kvar
    await klick('#tgl-falk-pa'); await H.sov(700);
    const pa = await SJ(`({ klass: document.documentElement.classList.contains('falk-av'), knapp: getComputedStyle(document.getElementById('krypto-btn')).display, resten: document.getElementById('falk-inst-resten').hidden })`);
    R.ok('på: knappen och inställningarna tillbaka', !pa.klass && pa.knapp !== 'none' && !pa.resten, pa);
    await S(`openKrypto(true); 1`);
    const ft2 = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    R.ok('på: Falk öppnas igen', !!ft2);
    if (ft2) {
      try { f.stang(); } catch {}
      f = await H.anslut(ft2.webSocketDebuggerUrl); await f.skicka('Runtime.enable'); await H.sov(1500);
      const u2 = await utseende();
      R.ok('valen ligger kvar i den nya panelen', u2.w === 480 && u2.accent === '#3b6fe0' && u2.text === 'stor', u2);
      await klick('#falk-aterstall'); await H.sov(1500);
      const u3 = await utseende();
      R.ok('återställ: standardutseende', u3.w === 400 && u3.accent === '#ff4b1f' && u3.text === 'normal', u3);
      R.ok('återställ rör inte av/på', (await m.kor(`String(process.mainModule.require('./falk-inst').av())`)) === 'false');
      const fel = f.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
      R.ok('inga JS-fel i Falk', !fel.length, fel);
    }
    const sfel = s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet', !sfel.length, sfel);
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    try { if (s) s.stang(); if (f) f.stang(); if (m) m.stang(); } catch {}
    await H.stang(p); x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}
module.exports = { kor };
if (require.main === module) kor(path.resolve(process.argv[2] || path.join(__dirname, '..', '..'))).then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
