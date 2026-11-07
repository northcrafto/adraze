#!/usr/bin/env node
// Test: Anpassa → inställningar per sajt (anpassa-sajt.js, ui/sajtpanel.html, ui/anpassa-sajt.js).
// Osynligt i Xvfb mot utvecklingsbygget, med en egen liten webbserver på två värdar (127.0.0.1 och localhost = två sajter).
// Huvudprocessen nås via Node-inspektören (som sakerhet.js), skalet och flikarna via CDP.
// Användning: node tools/test/anpassa-sajt.js [webbläsarmapp]   Bilder: $BILDER (standard: en tempmapp, skrivs ut sist)
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const H = require('./hjalp');

// Testsidorna. /sida: titeln ändras bara om JavaScript körs. /reklam: kända annonsadresser (stoppas innan de når nätet).
const SIDOR = {
  '/ljus': '<!doctype html><meta charset="utf-8"><title>Ljus</title><body style="margin:0;background:#fff;color:#111;font:18px sans-serif"><h1 style="margin:48px">Ljus testsida</h1><p style="margin:48px">Vit bakgrund, mörk text.</p></body>',
  '/sida': '<!doctype html><meta charset="utf-8"><title>JS av</title><body style="background:#fff;font:18px sans-serif"><h1 style="margin:48px">Testsida</h1><script>document.title = "JS på"</script></body>',
  '/reklam': '<!doctype html><meta charset="utf-8"><title>Reklam</title><body><h1>Reklam</h1><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>'
    + '<img src="https://www.google-analytics.com/collect?v=1&t=pageview&tid=UA-1-1"><img src="https://securepubads.g.doubleclick.net/gampad/ads?sz=1x1"></body>',
  '/popup': '<!doctype html><meta charset="utf-8"><title>Popup</title><body><h1>Popup-test</h1></body>',
  '/barn': '<!doctype html><meta charset="utf-8"><title>Fönstret</title><body>Ett popup-fönster</body>',
};
function server() {
  return new Promise((res) => {
    const s = http.createServer((req, svar) => {
      const sida = SIDOR[req.url.split('?')[0]];
      if (!sida) { svar.writeHead(404); svar.end('saknas'); return; }
      svar.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); svar.end(sida);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

// Minimal PNG-läsare (8 bitar, RGB/RGBA, utan interlace – det CDP ger) för att mäta en pixel i en skärmbild
function lasPng(buf) {
  let p = 8, w = 0, h = 0, typ = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); typ = d[9]; } else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
    p += 12 + len;
  }
  const bpp = typ === 6 ? 4 : 3, st = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), ut = Buffer.alloc(h * st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], o = y * (st + 1) + 1;
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? ut[y * st + x - bpp] : 0, b = y ? ut[(y - 1) * st + x] : 0, c = x >= bpp && y ? ut[(y - 1) * st + x - bpp] : 0;
      let v = raw[o + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      ut[y * st + x] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const i = (y * w + x) * bpp; return [ut[i], ut[i + 1], ut[i + 2]]; } };
}
const ljushet = (rgb) => Math.round((rgb[0] + rgb[1] + rgb[2]) / 3);

async function vanta(fn, ms = 8000, steg = 150) {
  const slut = Date.now() + ms; let v;
  while (Date.now() < slut) { try { v = await fn(); if (v) return v; } catch {} await H.sov(steg); }
  return v;
}

async function kor(rot) {
  const R = H.resultat();
  const bilder = process.env.BILDER || H.tempDir('sajt-bilder');
  fs.mkdirSync(bilder, { recursive: true });
  const srv = await server();
  const P = srv.address().port;
  const A = `http://127.0.0.1:${P}`, B = `http://localhost:${P}`;   // två olika sajter
  const x = await H.startaXvfb();
  const profil = H.tempDir('sajt');
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  const oppna = [];
  const skarm = (namn) => { try { const f = path.join(bilder, namn); execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'x11grab', '-video_size', '1600x1000', '-i', x.display, '-frames:v', '1', '-y', f], { stdio: 'ignore' }); return f; } catch { return null; } };
  const cdpBild = async (k, namn) => { const r = await k.skicka('Page.captureScreenshot', { format: 'png' }); const b = Buffer.from(r.result.data, 'base64'); fs.writeFileSync(path.join(bilder, namn), b); return b; };
  try {
    await H.vantaPaPort(cdp);
    const shellT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!shellT);
    if (!shellT) return R;
    await H.sov(2000);
    const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl); oppna.push(main);
    await main.skicka('Runtime.enable');
    const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); const An = process.mainModule.require('./anpassa');
      const flik = (id) => el.webContents.getAllWebContents().find((w) => w.__sajt && w.__tabId === id); ${expr} })()`);
    const shell = await H.anslut(shellT.webSocketDebuggerUrl); oppna.push(shell);
    await shell.skicka('Runtime.enable');
    await shell.kor(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('adraze-hacker-intro-v3', '1'); } catch {} return 1; })()`);

    // 0. Panelens kanaler: bara panelen själv (en webbsida eller ett annat fönster får inget)
    const fejk = `{ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' }, sender: {}, returnValue: undefined }`;
    for (const k of ['sajt:panel-satt', 'sajt:panel-zoom', 'sajt:panel-aterstall', 'sajt:panel-data']) {
      R.ok(k + ' nekas utanför panelen', (await M(`const h = el.ipcMain._invokeHandlers.get('${k}'); return h ? await h(${fejk}, { falt: 'js', varde: false }) : 'saknas'`)) === null);
    }

    // Flik + hjälpare
    const id = await shell.kor(`createTab('${A}/sida').id`);
    const ga = async (url) => { await shell.kor(`guardedNavigate(byId(${id}), '${url}'); 1`); return vanta(async () => (await M(`const w = flik(${id}); return w && w.getURL() === '${url}' && !w.isLoading()`)), 10000); };
    const titel = () => M(`return flik(${id}).getTitle()`);
    const zoom = () => M(`return Math.round(flik(${id}).getZoomFactor() * 100) / 100`);
    const varde = (k) => M(`return An.hamta('${k}')`);
    const skydd = async () => ((await varde('sajt.skydd')) || {})['127.0.0.1'] || {};
    R.ok('fliken laddade testsidan', !!(await vanta(async () => (await titel()) === 'JS på', 15000)), await titel());
    R.ok('fliken har per-sajt-kroken', !!(await M(`return !!flik(${id})`)));

    // 1. Zoom med Ctrl +: sparas för sajten och följer med, men inte till en annan sajt
    await shell.kor(`window.view.zoom(${id}, 1); 1`);
    R.ok('Ctrl + sparas för sajten', !!(await vanta(async () => ((await varde('sajt.127.0.0.1')) || {}).zoom === 1.1)), await varde('sajt.127.0.0.1'));
    await ga(`${B}/sida`);
    R.ok('annan sajt får standardzoom', (await zoom()) === 1, await zoom());
    await ga(`${A}/sida`);
    R.ok('zoomen kommer tillbaka på sajten', !!(await vanta(async () => (await zoom()) === 1.1, 4000)), await zoom());
    const id2 = await shell.kor(`createTab('${A}/ljus').id`);
    R.ok('ny flik på sajten får zoomen', !!(await vanta(async () => (await M(`const w = flik(${id2}); return w && !w.isLoading() && Math.round(w.getZoomFactor() * 100) / 100`)) === 1.1, 8000)));
    await shell.kor(`closeTab(byId(${id2})); switchTab(byId(${id})); window.view.show(${id}); 1`);
    await H.sov(400);
    await shell.kor(`window.view.zoom(${id}, 0); 1`);
    R.ok('Ctrl 0 tar bort sajtens zoom', !!(await vanta(async () => (await varde('sajt.127.0.0.1')) === undefined)), await varde('sajt.127.0.0.1'));

    // 2. Sajt-panelen öppnas från skölden (riktigt musklick i skalet)
    const klickaSkold = async () => {
      const r = JSON.parse(await shell.kor(`JSON.stringify(document.getElementById('shield').getBoundingClientRect())`));
      const [mx, my] = [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      await shell.skicka('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 });
      await shell.skicka('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 });
    };
    const oppnaPanel = async () => {
      await klickaSkold();
      const t = await H.mal(cdp, (t) => t.url.includes('sajtpanel.html'), 6000);
      if (!t) return null;
      const k = await H.anslut(t.webSocketDebuggerUrl); oppna.push(k);
      await k.skicka('Runtime.enable');
      await vanta(async () => (await k.kor(`document.getElementById('doman').textContent`)) === '127.0.0.1', 5000);
      return k;
    };
    const panelOppen = () => M(`return [...el.BaseWindow.getAllWindows()].some((w) => w.contentView.children.some((v) => v.webContents && !v.webContents.isDestroyed() && v.webContents.getURL().includes('sajtpanel.html')))`);
    R.ok('skölden är en knapp på en sajt', (await shell.kor(`document.getElementById('shield').getAttribute('role')`)) === 'button');
    let panel = await oppnaPanel();
    R.ok('panelen öppnas från skölden', !!panel);
    if (!panel) return R;
    R.ok('panelen visar sajten', (await panel.kor(`document.getElementById('doman').textContent + '|' + document.getElementById('anslutning').textContent`)) === '127.0.0.1|Inte säker anslutning');
    R.ok('panelen har bara adrazeIpc, ingen require', (await panel.kor(`typeof window.adrazeIpc.invoke + '/' + typeof require`)) === 'function/undefined');
    await H.sov(400);
    const bildPanel = skarm('1-sajtpanel.png');
    R.ok('skärmbild av panelen', !!bildPanel, bildPanel);

    // 3. Zoom i panelen
    await panel.kor(`document.getElementById('zplus').click(); 1`);
    R.ok('zoom + i panelen zoomar fliken', !!(await vanta(async () => (await zoom()) === 1.1)), await zoom());
    R.ok('zoom + i panelen sparas', ((await varde('sajt.127.0.0.1')) || {}).zoom === 1.1);
    R.ok('panelen visar 110 %', !!(await vanta(async () => (await panel.kor(`document.getElementById('zvarde').textContent`)) === '110 %', 3000)));

    // 4. Mörkt läge: Chromiums automatiska mörkläggning + prefers-color-scheme
    await ga(`${A}/ljus`);
    const fl = await H.anslut((await H.mal(cdp, (t) => t.type === 'page' && t.url.startsWith(`${A}/ljus`))).webSocketDebuggerUrl); oppna.push(fl);
    const mitt = async (namn) => { const b = lasPng(await cdpBild(fl, namn)); return ljushet(b.px(Math.floor(b.w * 0.7), Math.floor(b.h * 0.7))); };
    const fore = await mitt('2-ljus-fore.png');
    R.ok('sidan är ljus utan mörkt läge', fore > 230, fore);
    const systemMorkt = await fl.kor(`matchMedia('(prefers-color-scheme: dark)').matches`);   // systemets tema (kan vara mörkt på testdatorn)
    panel = (await panelOppen()) ? panel : await oppnaPanel();
    await panel.kor(`(() => { const c = document.getElementById('mork'); c.click(); return c.checked; })()`);
    R.ok('mörkt läge sparas', !!(await vanta(async () => ((await varde('sajt.127.0.0.1')) || {}).mork === true)));
    R.ok('sidan får prefers-color-scheme: dark', !!(await vanta(async () => (await fl.kor(`matchMedia('(prefers-color-scheme: dark)').matches`)) === true, 4000)));
    await H.sov(600);
    const efter = await mitt('3-ljus-mork.png');
    R.ok('sidan blir mörk (automatisk mörkläggning)', efter < 90, efter);
    await ga(`${B}/ljus`);
    const flB = await H.anslut((await H.mal(cdp, (t) => t.type === 'page' && t.url.startsWith(`${B}/ljus`))).webSocketDebuggerUrl); oppna.push(flB);
    const ljusB = async () => { const b = lasPng(await cdpBild(flB, '4-annan-sajt.png')); return ljushet(b.px(Math.floor(b.w * 0.7), Math.floor(b.h * 0.7))); };
    R.ok('annan sajt förblir ljus', !!(await vanta(async () => (await ljusB()) > 230, 3000)), await ljusB());
    R.ok('annan sajt: prefers-color-scheme som systemet', !!(await vanta(async () => (await flB.kor(`matchMedia('(prefers-color-scheme: dark)').matches`)) === systemMorkt, 3000)), systemMorkt);
    await ga(`${A}/ljus`);
    const flA = await H.anslut((await H.mal(cdp, (t) => t.type === 'page' && t.url.startsWith(`${A}/ljus`))).webSocketDebuggerUrl); oppna.push(flA);
    R.ok('mörkt läge tillbaka på sajten', !!(await vanta(async () => (await flA.kor(`matchMedia('(prefers-color-scheme: dark)').matches`)) === true, 4000)));
    skarm('4-mork-sajt.png');

    // 5. JavaScript av: gäller från nästa laddning, även efter byte av sajt fram och tillbaka
    await ga(`${A}/sida`);
    await vanta(async () => (await titel()) === 'JS på', 4000);
    panel = await oppnaPanel();
    await panel.kor(`document.getElementById('js').click(); 1`);
    R.ok('JavaScript av sparas (sajt.skydd)', !!(await vanta(async () => (await skydd()).js === false)), await skydd());
    R.ok('panelen ber om omladdning', !!(await vanta(async () => (await panel.kor(`!document.getElementById('ladda').hidden`)) === true, 3000)));
    skarm('5-panel-ladda-om.png');
    await panel.kor(`document.getElementById('ladda-om').click(); 1`);
    await H.sov(1200);
    R.ok('omladdning stänger panelen', !(await panelOppen()));
    R.ok('JavaScript körs inte efter omladdning', !!(await vanta(async () => (await titel()) === 'JS av' && !(await M(`return flik(${id}).isLoading()`)), 6000)), await titel());
    await ga(`${B}/sida`);
    R.ok('JavaScript körs på annan sajt', !!(await vanta(async () => (await titel()) === 'JS på', 5000)), await titel());
    await ga(`${A}/sida`);
    await H.sov(500);
    R.ok('JavaScript av igen på sajten', (await titel()) === 'JS av', await titel());

    // 6. Ljud av för sajten: fliken tystas och visas tystad i skalet
    panel = await oppnaPanel();
    await panel.kor(`document.getElementById('ljud').click(); 1`);
    R.ok('ljud av sparas', !!(await vanta(async () => ((await varde('sajt.127.0.0.1')) || {}).ljud === false)));
    R.ok('fliken tystas', !!(await vanta(async () => (await M(`return flik(${id}).isAudioMuted()`)) === true, 3000)));
    R.ok('skalet visar fliken som tystad', !!(await vanta(async () => (await shell.kor(`!!byId(${id}).muted`)) === true, 3000)));
    await shell.kor(`window.view.hide(); window.view.show(${id}); 1`);   // stänger panelen
    await ga(`${B}/sida`);
    R.ok('annan sajt har ljud', !!(await vanta(async () => (await M(`return flik(${id}).isAudioMuted()`)) === false, 3000)));
    R.ok('skalet visar ljud igen', !!(await vanta(async () => (await shell.kor(`!!byId(${id}).muted`)) === false, 3000)));
    await ga(`${A}/sida`);
    R.ok('tyst igen på sajten', !!(await vanta(async () => (await M(`return flik(${id}).isAudioMuted()`)) === true, 3000)));

    // 7. Reklamblockering av för sajten (gäller sajtens sidor, inte sajtens förfrågningar på andra sajter)
    const blockerade = async (url) => { await ga(url); await H.sov(1200); return M(`return flik(${id}).__blocked || 0`); };
    const fore7 = await blockerade(`${A}/reklam`);
    R.ok('reklam stoppas normalt', fore7 > 0, fore7);
    R.ok('reklam av sparas', (await M(`return An.satt('sajt.skydd', { ...(An.hamta('sajt.skydd') || {}), '127.0.0.1': { ...((An.hamta('sajt.skydd') || {})['127.0.0.1'] || {}), reklam: false } }).ok`)) === true);
    const efter7 = await blockerade(`${A}/reklam`);
    R.ok('reklam släpps igenom på sajten', efter7 === 0, efter7);
    const annan7 = await blockerade(`${B}/reklam`);
    R.ok('reklam stoppas fortfarande på annan sajt', annan7 > 0, annan7);

    // 8. Popup-fönster: standard / tillåt / blockera (window.open med fönsterfunktioner, som en inloggningsruta)
    await ga(`${A}/popup`);
    const popT = await H.mal(cdp, (t) => t.type === 'page' && t.url.startsWith(`${A}/popup`));
    const pop = await H.anslut(popT.webSocketDebuggerUrl); oppna.push(pop);
    const fonster = () => M(`return el.BrowserWindow.getAllWindows().length`);
    const stangBarn = () => M(`for (const w of el.BrowserWindow.getAllWindows()) { try { if (w.webContents.getURL().includes('/barn')) w.close(); } catch {} } return 1`);
    const forsok = async (url) => {
      await H.sov(2200);   // popup-stormvakten: ett fönster per två sekunder
      const n = await fonster();
      await pop.skicka('Runtime.evaluate', { expression: `window.open('${url}', '_blank', 'width=360,height=300'); 1`, userGesture: true });
      await H.sov(1500);
      const ok = (await fonster()) > n; await stangBarn(); await H.sov(300);
      return ok;
    };
    const popup = (v) => M(`const a = { ...(An.hamta('sajt.skydd') || {}) }; a['127.0.0.1'] = { ...(a['127.0.0.1'] || {}), popup: ${v ? `'${v}'` : 'undefined'} }; return An.satt('sajt.skydd', a).ok`);
    R.ok('standard: fönster till annan sajt stoppas', (await forsok(`${B}/barn`)) === false);
    R.ok('standard: fönster på samma sajt öppnas', (await forsok(`${A}/barn`)) === true);
    await popup('tillat');
    R.ok('tillåt: fönster till annan sajt öppnas', (await forsok(`${B}/barn`)) === true);
    await popup('blockera');
    R.ok('blockera: fönster på samma sajt stoppas', (await forsok(`${A}/barn`)) === false);
    await popup(null);

    // 9. Privat flik: inget sparas
    const idP = await shell.kor(`createTab('${A}/ljus', true).id`);
    await vanta(async () => (await M(`const w = flik(${idP}); return w && !w.isLoading()`)), 8000);
    const fore9 = JSON.stringify(await varde('sajt.127.0.0.1'));
    await shell.kor(`window.view.zoom(${idP}, 1); 1`);
    await H.sov(600);
    R.ok('privat flik: Ctrl + sparas inte', JSON.stringify(await varde('sajt.127.0.0.1')) === fore9);
    await shell.kor(`closeTab(byId(${idP})); switchTab(byId(${id})); window.view.show(${id}); 1`);
    await H.sov(500);

    // 10. Barnläge: det barnlåsta går inte att ändra och gäller inte; zoom och mörkt läge går att ändra
    await shell.kor(`window.view.barnRegler({ last: false, blocklist: [], allows: [] }); 1`);
    await H.sov(500);
    R.ok('barnläge: sajt.skydd är barnlåst', (await M(`return An.satt('sajt.skydd', {}).error`)) === 'barnlast');
    R.ok('barnläge: sajt.<domän> går att ändra', (await M(`return An.satt('sajt.example.org', { zoom: 1.25 }).ok`)) === true);
    await M(`return An.satt('sajt.example.org', undefined).ok`);
    await ga(`${A}/sida`);
    R.ok('barnläge: JavaScript av gäller inte', !!(await vanta(async () => (await titel()) === 'JS på', 5000)), await titel());
    const barn7 = await blockerade(`${A}/reklam`);
    R.ok('barnläge: reklam stoppas trots undantaget', barn7 > 0, barn7);
    await ga(`${A}/sida`);
    panel = await oppnaPanel();
    R.ok('barnläge: panelen visar låset', (await panel.kor(`!document.getElementById('not-barn').hidden && document.getElementById('js').disabled && document.getElementById('reklam').disabled`)) === true);
    R.ok('barnläge: mörkt läge går att ändra i panelen', (await panel.kor(`!document.getElementById('mork').disabled`)) === true);
    const svar = await panel.kor(`window.adrazeIpc.invoke('sajt:panel-satt', { falt: 'js', varde: true }).then((r) => r && r.error)`);
    R.ok('barnläge: panelen kan inte slå på JavaScript-undantaget', svar === 'barnlast', svar);
    await H.sov(300);
    skarm('6-panel-barnlage.png');
    await shell.kor(`window.view.hide(); window.view.show(${id}); 1`);
    await shell.kor(`window.view.barnRegler(null); 1`);
    await H.sov(500);
    await shell.kor(`window.view.reload(${id}); 1`);
    R.ok('efter barnläget gäller JavaScript av igen', !!(await vanta(async () => (await titel()) === 'JS av' && !(await M(`return flik(${id}).isLoading()`)), 6000)), await titel());

    // 11. Inställningar → Anpassa: listan, sök och ta bort
    await M(`return An.satt('sajt.localhost', { zoom: 1.5 }).ok`);
    panel = await oppnaPanel();
    await panel.kor(`document.getElementById('alla').click(); 1`);   // "Alla sajter" i panelen
    R.ok('"Alla sajter" öppnar Inställningar → Anpassa', !!(await vanta(async () => (await shell.kor(`!document.querySelector('#settings .set-panel[data-cat="anpassa"]').classList.contains('hidden') && document.activeElement && document.activeElement.id`)) === 'anps-sok', 4000)));
    R.ok('"Alla sajter" stänger panelen', !(await panelOppen()));
    const rader = () => shell.kor(`[...document.querySelectorAll('#anp-sajt .anps-rad')].map((r) => r.dataset.dom).join(',')`);
    R.ok('listan visar sajterna', (await rader()) === '127.0.0.1,localhost', await rader());
    R.ok('listan beskriver ändringarna', /Mörkt läge/.test(await shell.kor(`document.querySelector('#anp-sajt .anps-rad').textContent`)));
    await shell.kor(`document.getElementById('anp-sajt').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    await cdpBild(shell, '7-installningar-sajter.png');
    await shell.kor(`(() => { const s = document.getElementById('anps-sok'); s.value = 'local'; s.dispatchEvent(new Event('input')); return 1; })()`);
    R.ok('sök filtrerar listan', (await rader()) === 'localhost', await rader());
    await shell.kor(`(() => { const s = document.getElementById('anps-sok'); s.value = 'zzz'; s.dispatchEvent(new Event('input')); return 1; })()`);
    R.ok('sök utan träff säger det', (await shell.kor(`!document.querySelector('#anp-sajt .anps-ingen').hidden`)) === true);
    await shell.kor(`(() => { const s = document.getElementById('anps-sok'); s.value = ''; s.dispatchEvent(new Event('input')); return 1; })()`);
    await shell.kor(`document.querySelector('#anp-sajt .anps-rad[data-dom="127.0.0.1"] .anps-bort').click(); 1`);
    R.ok('ta bort rensar sajten', !!(await vanta(async () => (await varde('sajt.127.0.0.1')) === undefined && !((await varde('sajt.skydd')) || {})['127.0.0.1'])), [await varde('sajt.127.0.0.1'), await varde('sajt.skydd')]);
    R.ok('listan ritas om', !!(await vanta(async () => (await rader()) === 'localhost', 3000)), await rader());
    await shell.kor(`closeSettings(); 1`);
    await H.sov(400);
    await shell.kor(`window.view.reload(${id}); 1`);
    R.ok('borttagen sajt: JavaScript på igen', !!(await vanta(async () => (await titel()) === 'JS på', 6000)), await titel());
    R.ok('borttagen sajt: ljudet tillbaka', (await M(`return flik(${id}).isAudioMuted()`)) === false);

    // 12. Mörkt tema i skalet: panelen följer med
    await shell.kor(`document.documentElement.dataset.theme = 'dark'; 1`);
    panel = await oppnaPanel();
    R.ok('panelen följer skalets mörka tema', (await panel.kor(`document.documentElement.dataset.theme`)) === 'dark');
    await H.sov(300);
    skarm('8-panel-morkt-tema.png');
    await shell.kor(`window.view.hide(); window.view.show(${id}); delete document.documentElement.dataset.theme; 1`);

    // 13. Loggen: inga nekade IPC-kanaler, inga JS-fel i skalet
    const text = fs.readFileSync(logg, 'utf8');
    const nekade = text.split('\n').filter((r) => r.includes('[ipc] nekad') && !/evil\.example/.test(r));   // evil.example = de falska anropen i steg 0
    R.ok('inga legitima IPC-kanaler nekade', !nekade.length, nekade);
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
