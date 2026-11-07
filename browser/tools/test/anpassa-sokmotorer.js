#!/usr/bin/env node
// Test: Anpassa → egna sökmotorer och snabbord (anpassa-sokmotorer.js, ui/anpassa-sokmotorer.js, krokarna i shell.js).
// Osynligt i Xvfb mot utvecklingsbygget, med en egen liten "sökmotor" på 127.0.0.1 (titeln = det du sökte på).
// Användning: node tools/test/anpassa-sokmotorer.js [webbläsarmapp]   Bilder: $BILDER (standard: en tempmapp, skrivs ut sist)
const path = require('path');
const fs = require('fs');
const http = require('http');
const H = require('./hjalp');

function server() {
  return new Promise((res) => {
    const s = http.createServer((req, svar) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== '/sok') { svar.writeHead(404); svar.end('saknas'); return; }
      const q = (u.searchParams.get('q') || '').replace(/[<>&]/g, '');
      svar.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      svar.end('<!doctype html><meta charset="utf-8"><title>Sök: ' + q + '</title><body style="font:18px sans-serif"><h1 style="margin:48px">Lokal sökning: ' + q + '</h1></body>');
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
async function vanta(fn, ms = 8000, steg = 150) {
  const slut = Date.now() + ms; let v;
  while (Date.now() < slut) { try { v = await fn(); if (v) return v; } catch {} await H.sov(steg); }
  return v;
}

async function kor(rot) {
  const R = H.resultat();
  const bilder = process.env.BILDER || H.tempDir('sok-bilder');
  fs.mkdirSync(bilder, { recursive: true });
  const srv = await server();
  const LOKAL = `http://127.0.0.1:${srv.address().port}/sok?q=%s`;
  const x = await H.startaXvfb();
  const profil = H.tempDir('sok');
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  const oppna = [];
  try {
    await H.vantaPaPort(cdp);
    const shellT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!shellT);
    if (!shellT) return R;
    await H.sov(2000);
    const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl); oppna.push(main);
    await main.skicka('Runtime.enable');
    const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); const An = process.mainModule.require('./anpassa'); ${expr} })()`);
    const shell = await H.anslut(shellT.webSocketDebuggerUrl); oppna.push(shell);
    await shell.skicka('Runtime.enable');
    await shell.kor(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('adraze-hacker-intro-v3', '1'); localStorage.setItem('adraze-flytt-erbjuden', '1'); } catch {} document.getElementById('flytt-banner')?.remove(); return 1; })()`);
    const S = (expr) => shell.kor(expr);
    const nu = (q) => S(`normalizeUrl(${JSON.stringify(q)})`);
    const egna = () => M(`return An.hamta('sok.egna')`);
    const bild = async (namn) => { const r = await shell.skicka('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(bilder, namn), Buffer.from(r.result.data, 'base64')); };

    // 1. Förifyllda förslag och snabbord direkt
    R.ok('skalet har AnpassaSok', (await S(`typeof window.AnpassaSok && typeof window.AnpassaSok.url`)) === 'function');
    R.ok('nio förifyllda sökmotorer', ((await egna()) || []).length === 9, ((await egna()) || []).map((m) => m.namn));
    R.ok('"yt katter" söker på YouTube', (await nu('yt katter')) === 'https://www.youtube.com/results?search_query=katter', await nu('yt katter'));
    R.ok('"w Stockholm" söker på Wikipedia', (await nu('w Stockholm')) === 'https://sv.wikipedia.org/w/index.php?search=Stockholm', await nu('w Stockholm'));
    R.ok('stora bokstäver i snabbordet går bra', (await nu('YT Katter')) === 'https://www.youtube.com/results?search_query=Katter');
    R.ok('flera ord efter snabbordet', (await nu('gh electron webcontentsview')) === 'https://github.com/search?q=electron%20webcontentsview', await nu('gh electron webcontentsview'));
    R.ok('"yt" ensamt är en vanlig sökning', (await nu('yt')) === 'https://www.google.com/search?q=yt', await nu('yt'));
    R.ok('"ytkatter" är en vanlig sökning', (await nu('ytkatter')) === 'https://www.google.com/search?q=ytkatter');
    R.ok('snabbord sist är en vanlig sökning', (await nu('katter yt')) === 'https://www.google.com/search?q=katter%20yt');
    R.ok('adresser påverkas inte', (await nu('youtube.com')) === 'https://youtube.com' && (await nu('https://example.com/')) === 'https://example.com/');

    // 2. Adressfältets förslag: "Sök på YouTube: katter"
    // Skriv i adressfältet som en människa (insertText ger riktiga input-händelser). Skalet kan sätta flikens adress
    // i fältet strax efter ett flikbyte – då skrivs det om.
    const skriv = async (text) => {
      for (let i = 0; i < 3; i++) {
        await S(`(() => { const a = document.getElementById('address'); a.focus(); a.select(); a.value = ''; return 1; })()`);
        await shell.skicka('Input.insertText', { text });
        await H.sov(700);
        if ((await S(`document.getElementById('address').value`)) === text) return;
      }
    };
    await skriv('yt katter');
    const forsta = () => S(`(() => { const s = document.querySelector('#omni-suggest .sug'); return s ? s.textContent.replace(/\\s+/g, ' ').trim() : ''; })()`);
    R.ok('förslaget visar sökmotorn', (await vanta(async () => (await forsta()) === 'Sök på YouTube: katter', 3000)) === true, await forsta());
    R.ok('inga sökförslag från nätet för snabbord', (await S(`sug.items.length`)) === 1, await S(`sug.items.map((i) => i.kind || i.q || i.url)`));
    await bild('1-snabbord-forslag.png');
    await shell.skicka('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await shell.skicka('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await H.sov(300);

    // 3. Inställningar → Anpassa: lägg till en egen sökmotor med formuläret
    await S(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(500);
    const rader = () => S(`[...document.querySelectorAll('#anp-sokmotorer .anpk-rad .set-title')].map((e) => e.firstChild.textContent.trim()).join(',')`);
    R.ok('listan visar de förifyllda', (await rader()).split(',').length === 9, await rader());
    const fyll = (namn, url, ord) => S(`(() => { const f = (id, v) => { document.getElementById(id).value = v; }; f('anpk-namn', ${JSON.stringify(namn)}); f('anpk-url', ${JSON.stringify(url)}); f('anpk-ord', ${JSON.stringify(ord)}); document.getElementById('anpk-lagg').click(); return 1; })()`);
    const felText = () => S(`document.getElementById('anpk-fel') ? document.getElementById('anpk-fel').textContent : ''`);
    await fyll('Lokal', 'http://127.0.0.1/sok?q=', 'lo');
    R.ok('adress utan %s nekas', /%s/.test(await felText()), await felText());
    await fyll('Lokal', 'javascript:alert(1)//%s', 'lo');
    R.ok('adress som inte är http(s) nekas', /https/.test(await felText()), await felText());
    await fyll('Lokal', LOKAL, 'yt');
    R.ok('upptaget snabbord nekas', /YouTube/.test(await felText()), await felText());
    await fyll('Lokal', LOKAL, 'lo');
    R.ok('egen sökmotor sparas', !!(await vanta(async () => ((await egna()) || []).some((m) => m.namn === 'Lokal' && m.url === LOKAL && m.snabbord === 'lo'))), (await egna()).slice(-1));
    R.ok('listan ritas om', !!(await vanta(async () => (await rader()).endsWith(',Lokal'), 3000)), await rader());
    await S(`document.getElementById('anp-sokmotorer').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    await bild('2-installningar-sokmotorer.png');

    // 4. Snabbordet i adressfältet: Enter går till den egna sökmotorn
    const flik = await S(`(() => { closeSettings(); const t = createTab(); return t.id; })()`);
    await H.sov(500);
    await skriv('lo hej hopp');
    R.ok('förslaget visar den egna sökmotorn', (await forsta()) === 'Sök på Lokal: hej hopp', await forsta());
    await shell.skicka('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await shell.skicka('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    const titel = () => M(`const w = el.webContents.getAllWebContents().find((w) => w.__tabId === ${flik}); return w ? w.getTitle() : ''`);
    R.ok('Enter söker på den egna sökmotorn', !!(await vanta(async () => (await titel()) === 'Sök: hej hopp', 8000)), await titel());

    // 5. Egen standardsökmotor
    await S(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(400);
    await S(`[...document.querySelectorAll('#anp-sokmotorer .anpk-rad')].find((r) => r.textContent.includes('Lokal')).querySelector('.anpk-std').click(); 1`);
    const lokalId = await M(`return (An.hamta('sok.egna') || []).find((m) => m.namn === 'Lokal').id`);
    R.ok('"Gör till standard" sparas', !!(await vanta(async () => (await M(`return An.hamta('sok.standard')`)) === lokalId)));
    R.ok('adressfältet visar den egna sökmotorn', !!(await vanta(async () => (await S(`document.getElementById('search-engine').textContent`)) === 'Lokal', 3000)), await S(`document.getElementById('search-engine').textContent`));
    R.ok('vanlig sökning går till standarden', (await nu('hund katt')) === LOKAL.replace('%s', 'hund%20katt'), await nu('hund katt'));
    R.ok('snabbord gäller fortfarande', (await nu('yt katter')) === 'https://www.youtube.com/results?search_query=katter');
    R.ok('inga förslag från nätet till en okänd tjänst', (await S(`window.AnpassaSok.forslagsMotor('hund', 'google')`)) === null);
    await S(`closeSettings(); 1`);
    await H.sov(300);
    await skriv('hund');
    R.ok('förslaget säger var du söker', /Lokal/.test(await forsta()), await forsta());
    await shell.skicka('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await H.sov(300);

    // 6. Inställningar → Sökmotor: egna sökmotorer under de inbyggda; en inbyggd tar över som standard
    await S(`openSettings(); showSettingsCat('sok'); 1`);
    await H.sov(400);
    // 5 inbyggda + de 10 egna utom DuckDuckGo, Startpage och Brave Search (finns redan bland de inbyggda)
    R.ok('Sökmotor-listan har egna sökmotorer', (await S(`!!document.querySelector('#engine-list .anpk-motorrubrik') && document.querySelectorAll('#engine-list .engine-opt').length`)) === 5 + 7,
      await S(`[...document.querySelectorAll('#engine-list .engine-opt')].map((e) => e.textContent.trim()).join(',')`));
    R.ok('den egna är vald, ingen inbyggd', (await S(`[...document.querySelectorAll('#engine-list .engine-opt.on')].map((e) => e.textContent.trim()).join(',')`)).startsWith('Lokal'));
    await bild('3-sokmotor-lista.png');
    await S(`[...document.querySelectorAll('#engine-list .engine-opt')].find((e) => e.textContent.trim() === 'DuckDuckGo').click(); 1`);
    R.ok('en inbyggd sökmotor tar över', !!(await vanta(async () => (await M(`return An.hamta('sok.standard')`)) === undefined)));
    R.ok('etiketten följer med', !!(await vanta(async () => (await S(`document.getElementById('search-engine').textContent`)) === 'DuckDuckGo', 3000)));
    R.ok('sökningen följer med', (await nu('hund')) === 'https://duckduckgo.com/?q=hund');
    await S(`setEngine('google'); 1`);

    // 7. Snabbord ändras, sökmotor tas bort och läggs tillbaka från förslagen
    await S(`showSettingsCat('anpassa'); 1`);
    await H.sov(400);
    await S(`(() => { const r = [...document.querySelectorAll('#anp-sokmotorer .anpk-rad')].find((r) => r.textContent.includes('YouTube')); const i = r.querySelector('.anpk-snabb input'); i.value = 'tube'; i.dispatchEvent(new Event('change')); return 1; })()`);
    R.ok('nytt snabbord sparas', !!(await vanta(async () => ((await egna()) || []).some((m) => m.namn === 'YouTube' && m.snabbord === 'tube'))));
    R.ok('nya snabbordet fungerar', (await nu('tube katter')) === 'https://www.youtube.com/results?search_query=katter');
    R.ok('gamla snabbordet är en vanlig sökning', (await nu('yt katter')) === 'https://www.google.com/search?q=yt%20katter');
    await S(`[...document.querySelectorAll('#anp-sokmotorer .anpk-rad')].find((r) => r.textContent.includes('Wikipedia')).querySelector('.anpk-bort').click(); 1`);
    R.ok('ta bort sparas', !!(await vanta(async () => !((await egna()) || []).some((m) => m.namn === 'Wikipedia'))));
    R.ok('borttagen syns bland förslagen', !!(await vanta(async () => (await S(`[...document.querySelectorAll('#anp-sokmotorer .anpk-fchip')].map((b) => b.textContent.trim()).join(',')`)) === 'Wikipedia', 3000)));
    R.ok('"w Stockholm" är en vanlig sökning nu', (await nu('w Stockholm')) === 'https://www.google.com/search?q=w%20Stockholm');
    await S(`document.querySelector('#anp-sokmotorer .anpk-fchip').click(); 1`);
    R.ok('förslaget läggs tillbaka med sitt snabbord', !!(await vanta(async () => ((await egna()) || []).some((m) => m.namn === 'Wikipedia' && m.snabbord === 'w'))));

    // 8. Privat flik: snabbord fungerar, men standard är alltid AdRaze Search
    await M(`return An.satt('sok.standard', ${JSON.stringify(lokalId)}).ok`);
    await H.sov(200);
    const privat = await S(`(() => { closeSettings(); const t = createTab(null, true); return t.id; })()`);
    await H.sov(400);
    R.ok('privat flik: vanlig sökning via AdRaze Search', (await nu('hund')) === 'https://search.adraze.app/search?q=hund', await nu('hund'));
    R.ok('privat flik: snabbord fungerar', (await nu('lo hund')) === LOKAL.replace('%s', 'hund'));
    R.ok('privat flik: etiketten är AdRaze Search', (await S(`document.getElementById('search-engine').textContent`)) === 'AdRaze Search');
    await S(`closeTab(byId(${privat})); 1`);
    await H.sov(500);

    // 9. Barnläge: inga egna sökmotorer eller snabbord, inget går att ändra
    await S(`window.view.barnRegler({ last: false, blocklist: [], allows: [] }); 1`);
    await H.sov(3300);   // skalet frågar huvudprocessen om barnläge högst var 3:e sekund
    R.ok('barnläge: snabbord används inte', (await nu('yt katter')) === 'https://www.google.com/search?q=yt%20katter', await nu('yt katter'));
    R.ok('barnläge: den egna standarden används inte', (await nu('hund')) === 'https://www.google.com/search?q=hund', await nu('hund'));
    R.ok('barnläge: etiketten är den inbyggda', (await S(`motorEtikett()`)) === 'Google');
    R.ok('barnläge: sok.egna är barnlåst', (await M(`return An.satt('sok.egna', []).error`)) === 'barnlast');
    R.ok('barnläge: sok.standard är barnlåst', (await M(`return An.satt('sok.standard', undefined).error`)) === 'barnlast');
    await skriv('lo hund');
    R.ok('barnläge: förslaget är en vanlig sökning', /Google/.test(await forsta()) && !/Lokal/.test(await forsta()), await forsta());
    await shell.skicka('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await H.sov(300);
    await S(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(500);
    R.ok('barnläge: Anpassa visar låset', (await S(`!!document.querySelector('#anp-sokmotorer .anp-not') && [...document.querySelectorAll('#anp-sokmotorer input, #anp-sokmotorer button')].every((e) => e.disabled)`)) === true);
    await S(`document.getElementById('anp-sokmotorer').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    await bild('4-barnlage.png');
    await S(`closeSettings(); window.view.barnRegler(null); 1`);
    await H.sov(3300);
    R.ok('efter barnläget gäller den egna standarden igen', (await nu('hund')) === LOKAL.replace('%s', 'hund'));

    // 10. Återställ: förslagen tillbaka, ingen egen standard
    await M(`An.satt('sok.standard', undefined); return An.satt('sok.egna', undefined).ok`);
    await H.sov(300);
    R.ok('återställt: Google och förslagen', (await nu('hund')) === 'https://www.google.com/search?q=hund' && (await nu('yt katter')) === 'https://www.youtube.com/results?search_query=katter');
    R.ok('återställt: etiketten', !!(await vanta(async () => (await S(`document.getElementById('search-engine').textContent`)) === 'Google', 3000)));

    // 11. Loggen: inga nekade IPC-kanaler, inga JS-fel i skalet
    const text = fs.readFileSync(logg, 'utf8');
    const nekade = text.split('\n').filter((r) => r.includes('[ipc] nekad'));
    R.ok('inga IPC-kanaler nekade', !nekade.length, nekade);
    const fel = shell.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet', !fel.length, fel);
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    for (const k of oppna) { try { k.stang(); } catch {} }
    await H.stang(p);
    x.stoppa();
    srv.close();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
    R.bilder = bilder;
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  kor(path.resolve(process.argv[2] || path.join(__dirname, '..', '..'))).then((R) => { console.log(R.text()); console.log('Bilder: ' + R.bilder); process.exit(R.fel.length ? 1 : 0); });
}
