#!/usr/bin/env node
// Falk: tänkorden byts medan Falk tänker. Kort fråga = lätta ord, och efter 9 s blir de djupa.
// Lång/svår fråga = djupa ord direkt. Engelska ord på andra språk. Orden försvinner när svaret kommer.
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

async function kor(rot) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('falk-tankord');
  const [cdp, insp] = [await H.ledigPort(), await H.ledigPort()];
  const p = H.starta(path.join(rot, 'node_modules', 'electron', 'dist', 'electron'), ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), path.join(profil, 'logg.txt'));
  let s = null, f = null, m = null;
  try {
    await H.vantaPaPort(cdp);
    s = await H.anslut((await H.mal(cdp, (t) => t.url.includes('shell.html'))).webSocketDebuggerUrl); await s.skicka('Runtime.enable');
    m = await H.anslut((await H.mal(insp, () => true)).webSocketDebuggerUrl); await m.skicka('Runtime.enable');
    // Falks server ersätts i huvudprocessen: svarar efter __vanta ms
    await m.kor(`(() => { const el = process.mainModule.require('electron'); const h = el.ipcMain._invokeHandlers; globalThis.__vanta = 1000;
      h.set('krypto:samtycke', async () => true);
      h.set('krypto:chat', () => new Promise((r) => setTimeout(() => r({ ok: true, reply: 'Klart.' }), globalThis.__vanta))); return 1; })()`);
    await H.sov(2500);
    await s.kor(`account = { email: 'test@adraze.test', token: 't', pro: true, name: 'Test' }; openKrypto(true); 1`);
    const ft = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    R.ok('Falk-panelen öppnades', !!ft); if (!ft) return R;
    f = await H.anslut(ft.webSocketDebuggerUrl); await f.skicka('Runtime.enable'); await H.sov(1200);
    const F = (e) => f.kor(e);
    const J = async (e) => JSON.parse(await F(`JSON.stringify(${e})`));
    // Falk "tänker" i ms millisekunder och svarar sedan
    const fraga = async (text, ms) => {
      await m.kor(`(globalThis.__vanta = ${ms}, 1)`);
      await F(`(() => { inp.value = ${JSON.stringify(text)}; send(); return 1; })()`);
    };
    const ord = () => J(`(() => { const t = document.querySelector('.msg.typing .tt'); return { tt: t ? t.textContent : null, rubrik: document.getElementById('convtitle').textContent }; })()`);
    const SV = await J(`TANKORD.sv`), EN = await J(`TANKORD.en`);

    await fraga('hej', 13000);
    const sett = [];
    for (let i = 0; i < 12; i++) { await H.sov(1000); sett.push(await ord()); }
    const tidiga = sett.slice(0, 7).map((o) => o.tt), sena = sett.slice(10).map((o) => o.tt);
    R.ok('kort fråga: lätta ord först', tidiga.every((w) => SV.latt.includes(w)), tidiga);
    R.ok('orden byts', new Set(tidiga).size >= 2, tidiga);
    R.ok('efter 9 s: djupa ord', sena.every((w) => SV.djup.includes(w)), sena);
    R.ok('rubriken följer tänkordet', sett.slice(0, 7).every((o) => o.rubrik === o.tt + '…'), sett.slice(0, 3));
    await H.sov(2500);
    const efter = await ord();
    R.ok('borta när svaret kommit', efter.tt === null && !/…$/.test(efter.rubrik), efter);

    await fraga('Förklara varför den här sajten kan vara en bluff och jämför med en riktig butik', 5000);
    const djupa = []; for (let i = 0; i < 3; i++) { await H.sov(1100); djupa.push((await ord()).tt); }
    R.ok('svår fråga: djupa ord direkt', djupa.every((w) => SV.djup.includes(w)), djupa);
    await H.sov(3500);

    await F(`localStorage.setItem('adraze-lang', 'en'); 1`);
    await fraga('hi', 4000);
    await H.sov(1200);
    const en = (await ord()).tt;
    R.ok('annat språk: engelska ord', EN.latt.includes(en), en);
    await F(`localStorage.removeItem('adraze-lang'); 1`);
    await H.sov(3500);

    const fel = f.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i Falk', !fel.length, fel);
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
