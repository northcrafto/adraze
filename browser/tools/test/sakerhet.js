#!/usr/bin/env node
// Säkerhetstester mot utvecklingsbygget (osynligt i Xvfb). Huvudprocessen nås via Node-inspektören,
// som säkringarna stänger av i det paketerade bygget – därför körs de här testerna på dev.
// Användning: node tools/test/sakerhet.js [webbläsarmapp]   (avslutar med 0 om allt gick igenom)
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

async function kor(rot) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('sak');
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  try {
    await H.vantaPaPort(cdp);
    const shellT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!shellT);
    if (!shellT) return R;
    await H.sov(2000);
    const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl);
    await main.skicka('Runtime.enable');
    const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); ${expr} })()`);

    // 1. IPC-vakten: falska anrop som om de kom från en webbsida
    const fejk = (url, origin) => `({ senderFrame: { url: '${url}', origin: '${origin}' }, sender: {}, returnValue: undefined })`;
    const h = (k) => `el.ipcMain._invokeHandlers.get('${k}')`;
    R.ok('wallet:list nekas från webbsida', (await M(`return ${h('wallet:list')} ? await ${h('wallet:list')}(${fejk('https://evil.example/', 'https://evil.example')}) : 'saknas'`)) === null);
    R.ok('wallet:list tillåts från ui/', Array.isArray(await M(`const u = el.webContents.getAllWebContents().map((w) => w.getURL()).find((x) => /\/ui\/shell\.html/.test(x)); return await ${h('wallet:list')}({ senderFrame: { url: u, origin: 'file://' }, sender: {} })`)));
    R.ok('pw:for-origin använder ramens origin, inte argumentet', JSON.stringify(await M(`return await ${h('pw:for-origin')}(${fejk('https://a.example/', 'https://a.example')}, 'https://bank.example')`)) === '[]');
    R.ok('wallet:get nekas på http-sida', (await M(`return await ${h('wallet:get')}(${fejk('http://shop.example/', 'http://shop.example')}, 'x')`)) === null);
    R.ok('blockinst:set nekas från vanlig sajt', (await M(`return ${h('blockinst:set')} ? await ${h('blockinst:set')}(${fejk('https://evil.example/', 'https://evil.example')}, 'natskydd', false) : 'saknas'`)) === null);

    // 2. En riktig sajt i en flik
    const shell = await H.anslut(shellT.webSocketDebuggerUrl);
    await shell.skicka('Runtime.enable');
    await shell.kor(`createTab('https://example.com/')`);
    const flikT = await H.mal(cdp, (t) => t.url.startsWith('https://example.com'), 20000);
    R.ok('flik laddad', !!flikT);
    if (!flikT) return R;
    const flik = await H.anslut(flikT.webSocketDebuggerUrl);
    await flik.skicka('Runtime.enable');
    await H.sov(1500);

    // 3. Lokala nätverket. Ett misslyckat anrop bevisar inget (http från https-sida stoppas redan av
    // Chromiums mixed content, och en adress utan enhet misslyckas ändå) – därför krävs natskyddets loggrad.
    const stoppad = (url) => fs.readFileSync(logg, 'utf8').split('\n').some((r) => r.startsWith('[natskydd] stoppade ' + url));
    const lan = [`http://127.0.0.1:${cdp}/json`, 'https://192.168.1.1/', 'https://10.1.2.3/', `https://[::1]:${cdp}/`, 'https://router.local/'];
    for (const u of lan) await flik.kor(`fetch('${u}', { mode: 'no-cors', signal: AbortSignal.timeout(6000) }).catch(() => 0).then(() => 1)`);
    await flik.kor(`new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = 'http://localhost:${cdp}/favicon.ico?bild'; })`);
    await H.sov(500);
    for (const u of lan) R.ok('sajt når inte ' + u, stoppad(u));
    R.ok('bild från localhost stoppas', stoppad(`http://localhost:${cdp}/favicon.ico?bild`));
    R.ok('vanlig extern resurs fungerar', String(await flik.kor(`fetch('https://example.com/?x=' + Math.random()).then((r) => 'ok ' + r.status, (e) => 'FEL ' + e.message)`)).startsWith('ok'));

    // 4. Ingen Node i sidan
    R.ok('ingen require/process i sidan', (await flik.kor(`typeof require + '/' + typeof process`)) === 'undefined/undefined');

    // 5. Sökrutan (sandlådad popup) öppnas och söker
    await M(`const wc = el.webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://example.com')); wc.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: 'F3' }); return 1`);
    const findT = await H.mal(cdp, (t) => t.url.includes('find.html'), 8000);
    if (findT) {
      const f = await H.anslut(findT.webSocketDebuggerUrl);
      await f.kor(`new Promise((r) => { const t = () => (document.readyState === 'complete' && document.querySelector('input') ? r(1) : setTimeout(t, 100)); t(); })`);
      R.ok('sökrutan har bara adrazeIpc, ingen require', (await f.kor(`typeof window.adrazeIpc.send + '/' + typeof require`)) === 'function/undefined');
      R.ok('sökrutan hittar text', /^1\//.test(String(await f.kor(`const i = document.querySelector('input'); i.value = 'Example'; i.dispatchEvent(new Event('input')); new Promise((r) => setTimeout(() => r(document.body.innerText.trim()), 1000))`))));
      f.stang();
    } else R.ok('sökrutan öppnades', false);

    // 6. Navigering till adraze:// från sajten stoppas (sist – kan byta sida)
    await flik.kor(`location.href = 'adraze://adblock'; 1`);
    await H.sov(2500);
    R.ok('sajt kan inte navigera till adraze://', String(await flik.kor('location.href')).startsWith('https://example.com'));
    await flik.kor(`location.href = 'smb://evil.example/share'; 1`);
    await H.sov(1500);
    R.ok('smb:// gav ingen fråga', (await shell.kor(`typeof permQ !== 'undefined' ? permQ.length + (permCur ? 1 : 0) : 'okänt'`)) === 0);

    // 7. Loggen: inga legitima kanaler nekade, natskyddet slog till, inga JS-fel i skalet
    const text = fs.readFileSync(logg, 'utf8');
    const nekade = text.split('\n').filter((r) => r.includes('[ipc] nekad'));
    R.ok('inga legitima IPC-kanaler nekade', nekade.every((r) => /evil\.example/.test(r)), nekade.filter((r) => !/evil\.example/.test(r)));
    R.ok('natskydd loggade stopp', /\[natskydd\] stoppade/.test(text));
    R.ok('C++-adblockmotorn laddad', /\[adblock\] C\+\+-motor/.test(text));
    const fel = shell.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet', !fel.length, fel);
    main.stang(); shell.stang(); flik.stang();
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    await H.stang(p);
    x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  kor(path.resolve(process.argv[2] || path.join(__dirname, '..', '..'))).then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
}
