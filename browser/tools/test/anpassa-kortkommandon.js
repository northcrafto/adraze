#!/usr/bin/env node
// Anpassa › kortkommandon, kommandopalett och musgester – osynligt test mot utvecklingsbygget (egen Xvfb).
// Tangenterna skickas som riktiga X11-tangenter med xdotool: CDP:s Input.dispatchKeyEvent går förbi Electrons
// before-input-event och når därför aldrig AdRazes kortkommandon. Musen styrs både med xdotool och CDP
// (Input.dispatchMouseEvent). Huvudprocessen nås via Node-inspektören.
// Användning: node tools/test/anpassa-kortkommandon.js [webbläsarmapp] [--bilder <mapp>] [--live]   (0 = allt gick igenom)
//   --live skriver varje resultat direkt (bra när testet körs i bakgrunden)
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');
const H = require('./hjalp');

const argRot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..');
const ROT = path.resolve(argRot);
const bi = process.argv.indexOf('--bilder');
const BILDER = bi > 0 && process.argv[bi + 1] ? path.resolve(process.argv[bi + 1]) : null;
const LIVE = process.argv.includes('--live');
const sov = H.sov;
// Ett anrop som aldrig svarar (hängd renderare, stängd flik) ska ge ett fel, inte låsa hela testet
const medTid = (pr, ms = 12000) => Promise.race([pr, sov(ms).then(() => 'FEL: tidsgräns')]);

// Avbryts testet (Ctrl+C, timeout) städas Electron och Xvfb ändå bort
const stadning = { p: null, x: null, profil: null, R: null };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  // (varje process för sig, via sin PID – aldrig som processgrupp)
  if (stadning.p) for (const pid of [...H.allaUnder(stadning.p.pid), stadning.p.pid]) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  try { if (stadning.x) stadning.x.stoppa(); } catch {}
  try { if (stadning.profil) fs.rmSync(stadning.profil, { recursive: true, force: true }); } catch {}
  if (stadning.R && !LIVE) console.log(stadning.R.text());
  console.log('\nAvbrutet (' + sig + ')');
  process.exit(2);
});

// Testsidor: en sajt på localhost med en inbäddad ram från en annan sajt (127.0.0.1 = egen renderer, OOPIF)
function sidHtml(namn, ram) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${namn}</title><style>body{margin:0;font:16px system-ui;background:#f7f4ee;color:#1c2b3a}
    main{padding:40px 56px} h1{font-size:44px;margin:0 0 12px} p{max-width:52ch;line-height:1.6;color:#4b5a69}
    iframe{position:absolute;left:640px;top:250px;width:320px;height:200px;border:2px solid #c9b79c;border-radius:10px;background:#fff}</style></head>
  <body><main><h1>${namn}</h1><p>En testsida för kortkommandon och musgester. Här står lite text så att sidan inte är tom, och så att bilden bakom paletten syns.</p><p>Andra stycket: AdRaze ska inte störa sidans egna tangenter eller högerklick.</p></main>
  ${ram ? `<iframe src="${ram}"></iframe>` : ''}
  <script>
    window.__log = [];
    try { sessionStorage.n = String((+sessionStorage.n || 0) + 1); } catch {}
    window.__laddningar = () => +sessionStorage.n || 0;
    const mods = (e) => (e.ctrlKey ? ':ctrl' : '') + (e.altKey ? ':alt' : '') + (e.shiftKey ? ':shift' : '');
    for (const t of ['keydown']) addEventListener(t, (e) => __log.push(t + ':' + e.key.toLowerCase() + mods(e)), true);
    for (const t of ['mousedown', 'mouseup', 'contextmenu']) addEventListener(t, (e) => __log.push(t + ':' + e.button), true);
  </script></body></html>`;
}
const ramHtml = `<!doctype html><html><body style="margin:0;background:#fff;font:14px system-ui;display:grid;place-items:center;height:100vh">Inbäddad ram
  <script>window.__log = []; for (const t of ['mousedown', 'mouseup', 'contextmenu']) addEventListener(t, (e) => __log.push(t + ':' + e.button), true);</script></body></html>`;
function server(svar) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => { const b = svar(q.url); r.writeHead(b ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }); r.end(b || ''); });
    s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
  });
}

async function kor() {
  const R = H.resultat();
  stadning.R = R;
  if (LIVE) { const ok = R.ok; R.ok = (namn, villkor, info) => { ok(namn, villkor, info); console.log((villkor ? 'OK   ' : 'FEL  ') + namn + (!villkor && info !== undefined ? '  → ' + JSON.stringify(info).slice(0, 300) : '')); }; }
  const ram = await server((u) => (u.startsWith('/ram') ? ramHtml : null));
  const sajt = await server((u) => {
    if (u.startsWith('/a')) return sidHtml('Sida A', `http://127.0.0.1:${ram.port}/ram`);
    if (u.startsWith('/b')) return sidHtml('Sida B');
    if (u.startsWith('/c')) return sidHtml('Sida C');
    return null;
  });
  const BAS = `http://localhost:${sajt.port}`;
  const x = await H.startaXvfb();
  const xd = (...a) => execFileSync('xdotool', a, { env: { ...process.env, DISPLAY: x.display } });
  const profil = H.tempDir('kort');
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(ROT, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, ROT, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  Object.assign(stadning, { p, x, profil });
  const anslutna = [];
  try {
    await H.vantaPaPort(cdp);
    const shellT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!shellT);
    if (!shellT) return R;
    await sov(1500);
    const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl); anslutna.push(main);
    await main.skicka('Runtime.enable');
    const M = (expr) => medTid(main.kor(`(async () => { const el = process.mainModule.require('electron'); const K = process.mainModule.require(${JSON.stringify(path.join(ROT, 'anpassa-kortkommandon.js'))}); ${expr} })()`));
    const shell = await H.anslut(shellT.webSocketDebuggerUrl); anslutna.push(shell);
    await shell.skicka('Runtime.enable'); await shell.skicka('Page.enable');
    const S = (expr) => medTid(shell.kor(expr));
    const vanta = async (fn, ms = 5000) => { for (let i = 0; i < ms / 100; i++) { let v; try { v = await fn(); } catch {} if (v && !(typeof v === 'string' && v.startsWith('FEL'))) return v; await sov(100); } return false; };
    const lage = async () => JSON.parse(await M(`return JSON.stringify(K.tillstand())`));
    const flikar = async () => Number(await S('tabs.length'));
    const aktivUrl = async () => String(await S('active && active.url || ""'));
    const bild = async (namn, mal = shell) => {
      if (!BILDER) return;
      fs.mkdirSync(BILDER, { recursive: true });
      const r = await mal.skicka('Page.captureScreenshot', { format: 'png' });
      if (r.result && r.result.data) fs.writeFileSync(path.join(BILDER, namn + '.png'), Buffer.from(r.result.data, 'base64'));
    };
    const skarm = (namn) => {   // hela X-skärmen: skalet + flikens vy + spårvyn tillsammans
      if (!BILDER) return;
      fs.mkdirSync(BILDER, { recursive: true });
      try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1600x1000', '-i', x.display, '-frames:v', '1', path.join(BILDER, namn + '.png')]); } catch {}
    };

    await S(`document.getElementById('hxintro') && document.getElementById('hxintro').remove(); 1`);
    R.ok('modulen laddad med kortkommandon', (await lage()).karta > 40, (await lage()).karta);
    R.ok('inga gester som standard', (await lage()).gesterPa === false);

    // ── Flikar med testsidorna ──
    await S(`createTab('${BAS}/a')`);
    const flikA = await H.mal(cdp, (t) => t.url.startsWith(BAS + '/a'), 20000);
    R.ok('sida A laddad', !!flikA);
    if (!flikA) return R;
    const sidaA = await H.anslut(flikA.webSocketDebuggerUrl); anslutna.push(sidaA);
    await sidaA.skicka('Runtime.enable');
    const A = (expr) => medTid(sidaA.kor(expr));
    await vanta(async () => (await lage()).vb);
    const fokusSida = () => M(`const w = el.BrowserWindow.getAllWindows()[0]; w.focus(); const v = el.webContents.getAllWebContents().find((x) => x.getURL().startsWith('${BAS}/a')); v.focus(); return 1`);
    const fokusSkal = () => M(`const w = el.BrowserWindow.getAllWindows()[0]; w.focus(); w.webContents.focus(); return 1`);
    const tryck = async (k) => { xd('key', '--clearmodifiers', k); await sov(250); };
    // Musen: koordinater i sidan → skärmen
    const skarmPunkt = async (px, py) => {
      const l = await vanta(async () => { const x = await lage(); return x.vb ? x : null; });
      if (!l) throw new Error('ingen synlig flik att peka i');
      return [Math.round(l.cb.x + l.vb.x + px), Math.round(l.cb.y + l.vb.y + py)];
    };
    xd('mousemove', ...(await skarmPunkt(200, 150)).map(String));
    await fokusSida(); await sov(300);

    // ── 1. Kortkommandon fungerar inifrån sidan ──
    let n0 = await flikar();
    await tryck('ctrl+t');
    R.ok('Ctrl+T i sidan öppnar en ny flik', await vanta(async () => (await flikar()) === n0 + 1), await flikar());
    await tryck('ctrl+w');
    R.ok('Ctrl+W stänger den', await vanta(async () => (await flikar()) === n0), await flikar());
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/a')))`); await sov(300); await fokusSida(); await sov(200);
    await A(`__log.length = 0`);
    await tryck('ctrl+t');
    R.ok('sidan får inte Ctrl+T (AdRaze tog den)', (await A(`__log.includes('keydown:t:ctrl')`)) === false);
    if ((await flikar()) > n0) { await S(`closeTab(active)`); await sov(500); await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/a')))`); await sov(300); }

    // Flytta Ny flik till Ctrl+Alt+Y: Ctrl+T går då till sidan, Ctrl+Alt+Y öppnar fliken
    await S(`Anpassa.set('kortkommandon.ny-flik', ['CmdOrCtrl+Alt+Y'], 'test')`); await sov(300);
    await fokusSida(); await sov(200); await A(`__log.length = 0`);
    n0 = await flikar();
    await tryck('ctrl+t'); await sov(300);
    R.ok('flyttat kortkommando: Ctrl+T går till sidan', (await A(`__log.includes('keydown:t:ctrl')`)) === true, await A(`__log`));
    R.ok('flyttat kortkommando: ingen ny flik på Ctrl+T', (await flikar()) === n0);
    await tryck('ctrl+alt+y');
    R.ok('nytt kortkommando Ctrl+Alt+Y öppnar en flik', await vanta(async () => (await flikar()) === n0 + 1));
    R.ok('menyerna visar det nya kortkommandot', (await M(`return el.Menu.buildFromTemplate([{ label: 'x', accelerator: 'CmdOrCtrl+T' }]).items[0].accelerator`)) === 'CmdOrCtrl+Alt+Y');
    await S(`closeTab(active)`); await sov(400);
    await S(`Anpassa.set('kortkommandon.ny-flik', undefined, 'test')`); await sov(200);
    R.ok('menyn som förut efter återställning', (await M(`return el.Menu.buildFromTemplate([{ label: 'x', accelerator: 'CmdOrCtrl+T' }]).items[0].accelerator`)) === 'CmdOrCtrl+T');
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/a')))`); await sov(300);

    // F5 flyttat: varken sidan eller skalet laddas om (skalets egen F5-lyssnare stoppas)
    await S(`Anpassa.set('kortkommandon.ladda-om', ['CmdOrCtrl+Alt+R'], 'test')`); await sov(200);
    await S(`window.__markor = 42`);
    let l0 = await A(`__laddningar()`);
    await fokusSkal(); await S(`document.getElementById('address').focus()`); await sov(200);
    await tryck('F5'); await sov(800);
    R.ok('F5 (flyttad) i adressfältet laddar inte om skalet', (await S(`window.__markor`)) === 42);
    R.ok('F5 (flyttad) laddar inte om sidan', (await A(`__laddningar()`)) === l0);
    await fokusSida(); await sov(200);
    await tryck('ctrl+alt+r');
    R.ok('Ctrl+Alt+R laddar om sidan', await vanta(async () => (await A(`__laddningar()`)) === l0 + 1, 6000));
    await S(`Anpassa.set('kortkommandon.ladda-om', undefined, 'test')`); await sov(300);
    await A(`1`);

    // ── 2. Kommandopaletten ──
    await fokusSida(); await sov(200);
    await tryck('ctrl+k');
    const oppen = await vanta(() => S(`!!document.querySelector('#anp-palett.syns.on')`));
    R.ok('Ctrl+K i sidan öppnar paletten', !!oppen);
    R.ok('sidans vy göms bakom paletten', await vanta(async () => (await lage()).visibleTab === null));
    R.ok('bilden av sidan ligger bakom', String(await S(`(document.querySelector('#anp-palett .anp-pal-bild').src || '').slice(0, 15)`)).startsWith('data:image/'));
    R.ok('sökrutan har fokus', (await S(`document.activeElement && document.activeElement.id`)) === 'anp-pal-in');
    await bild('palett-tom');
    xd('type', '--delay', '40', 'ny fl'); await sov(400);
    R.ok('sök "ny fl" → Ny flik först', (await S(`document.querySelector('#anp-pal-r0 .anp-pal-namn').textContent`)) === 'Ny flik', await S(`document.querySelector('#anp-pal-r0 .anp-pal-namn').textContent`));
    await bild('palett-sok');
    await tryck('Escape');
    R.ok('Esc stänger paletten', await vanta(async () => !(await S(`!!document.querySelector('#anp-palett.syns')`))));
    R.ok('sidan visas igen', await vanta(async () => (await lage()).visibleTab !== null));
    R.ok('fokus tillbaka i sidan', await vanta(() => A(`document.hasFocus()`)));
    // Mörkt tema
    await S(`document.documentElement.dataset.theme = 'dark'`);
    await tryck('ctrl+k'); await vanta(() => S(`!!document.querySelector('#anp-palett.syns.on')`));
    xd('type', '--delay', '40', 'sida'); await sov(400);
    await bild('palett-mork');
    await tryck('Escape'); await sov(300);
    await S(`document.documentElement.dataset.theme = theme`);

    // Kör ett kommando från paletten: ladda om sidan
    await vanta(async () => (await lage()).visibleTab !== null);
    l0 = await A(`__laddningar()`);
    await fokusSida(); await sov(200);
    await tryck('ctrl+k'); await vanta(() => S(`!!document.querySelector('#anp-palett.syns.on')`));
    xd('type', '--delay', '40', 'ladda om'); await sov(400);
    R.ok('sök "ladda om" → Ladda om först', (await S(`document.querySelector('#anp-pal-r0 .anp-pal-namn').textContent`)) === 'Ladda om');
    await tryck('Return');
    R.ok('Enter kör kommandot (sidan laddas om)', await vanta(async () => (await A(`__laddningar()`)) === l0 + 1, 6000));
    R.ok('paletten stängd och sidan synlig', !(await S(`!!document.querySelector('#anp-palett.syns')`)) && (await lage()).visibleTab !== null);

    // Byt flik från paletten
    await S(`createTab('${BAS}/b')`);
    await H.mal(cdp, (t) => t.url.startsWith(BAS + '/b'), 15000); await sov(800);
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/a')))`); await sov(500);
    await fokusSida(); await sov(200);
    await tryck('ctrl+k'); await vanta(() => S(`!!document.querySelector('#anp-palett.syns.on')`));
    xd('type', '--delay', '40', 'sida b'); await sov(400);
    R.ok('fliken Sida B hittas under Flikar', (await S(`[...document.querySelectorAll('#anp-pal-lista .anp-pal-grupp')].map((g) => g.textContent).join(',')`)).includes('Flikar'));
    await tryck('Return');
    R.ok('Enter byter till Sida B', await vanta(async () => (await aktivUrl()).startsWith(BAS + '/b')));
    await sov(300);
    // Historik och inställningar
    await fokusSkal();
    await tryck('ctrl+k'); await vanta(() => S(`!!document.querySelector('#anp-palett.syns.on')`));
    xd('type', '--delay', '40', 'sida a'); await sov(400);
    R.ok('Sida A finns i historiken', (await S(`[...document.querySelectorAll('#anp-pal-lista .anp-pal-grupp')].map((g) => g.textContent).join(',')`)).includes('Historik'));
    await S(`(() => { const i = document.getElementById('anp-pal-in'); i.value = ''; i.dispatchEvent(new Event('input')); })()`);
    xd('type', '--delay', '40', 'tema'); await sov(400);
    R.ok('inställningen Tema hittas', (await S(`document.querySelector('#anp-pal-r0 .anp-pal-namn').textContent`)) === 'Tema', await S(`document.querySelector('#anp-pal-r0 .anp-pal-namn').textContent`));
    await tryck('Return');
    R.ok('Enter öppnar inställningarna på rätt ställe', await vanta(() => S(`!document.getElementById('settings').classList.contains('hidden') && !document.querySelector('#settings .set-panel[data-cat="utseende"]').classList.contains('hidden')`)));
    await S(`closeSettings()`); await sov(500);

    // ── 3. Byta kortkommando i inställningarna (inspelning, krock, ogiltigt, återställ) ──
    await S(`openSettings(); showSettingsCat('anpassa')`); await sov(500);
    R.ok('inställningarna ritade', Number(await S(`document.querySelectorAll('#anp-kortkommandon .anp-kort-rad').length`)) > 40);
    await S(`document.getElementById('anp-kortkommandon').scrollIntoView()`); await sov(200);
    await bild('installningar');
    await S(`document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="ny-flik"] [data-gor="ny"]').click()`); await sov(200);
    R.ok('inspelning startar', (await lage()).inspelning && (await S(`!!document.querySelector('#anp-kortkommandon .anp-kort-rad.spelar[data-id="ny-flik"]')`)));
    await bild('installningar-spelar-in');
    await tryck('ctrl+alt+u'); await sov(300);
    R.ok('Ctrl+Alt+U sparas som extra kortkommando', JSON.stringify(await S(`Anpassa.get('kortkommandon.ny-flik')`)) === JSON.stringify(['CmdOrCtrl+T', 'CmdOrCtrl+Alt+U']), await S(`Anpassa.get('kortkommandon.ny-flik')`));
    R.ok('inspelningen slutar', !(await lage()).inspelning);
    // krock
    await S(`document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="historik"] [data-gor="ny"]').click()`); await sov(200);
    await tryck('ctrl+t'); await sov(300);
    R.ok('krock varnar: används redan för Ny flik', String(await S(`(document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="historik"] .anp-kort-medd') || {}).textContent || ''`)).includes('Ny flik'));
    await bild('installningar-krock');
    await S(`document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="historik"] [data-gor="byt-anda"]').click()`); await sov(400);
    R.ok('Byt ändå: Historik får Ctrl+T', (await S(`JSON.stringify(Anpassa.get('kortkommandon.historik'))`)).includes('"CmdOrCtrl+T"'));
    R.ok('Byt ändå: Ny flik släpper Ctrl+T', JSON.stringify(await S(`Anpassa.get('kortkommandon.ny-flik')`)) === JSON.stringify(['CmdOrCtrl+Alt+U']));
    // ogiltigt (ingen Ctrl/Alt) och Esc
    await S(`document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="zooma-in"] [data-gor="ny"]').click()`); await sov(200);
    await tryck('a'); await sov(300);
    R.ok('bara "A" ger ett meddelande', !!(await S(`!!document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="zooma-in"] .anp-kort-medd.fel')`)));
    await S(`document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="zooma-in"]').scrollIntoView({ block: 'center' })`); await sov(150);
    await bild('installningar-ogiltig');
    await tryck('ctrl+c'); await sov(300);
    R.ok('Ctrl+C går inte att ta', String(await S(`(document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="zooma-in"] .anp-kort-medd.fel') || {}).textContent || ''`)).includes('kopiera'));
    await tryck('Escape'); await sov(300);
    R.ok('Esc avbryter inspelningen', !(await lage()).inspelning && !(await S(`!!document.querySelector('#anp-kortkommandon .anp-kort-rad.spelar')`)));
    R.ok('zoom oförändrad', (await S(`Anpassa.get('kortkommandon.zooma-in', null)`)) === null);
    // Ctrl+T gör nu Historik
    await S(`closeSettings()`); await sov(400);
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/a')))`); await sov(400);
    await fokusSida(); await sov(200);
    await tryck('ctrl+t');
    R.ok('Ctrl+T öppnar nu historiken', await vanta(() => S(`!document.getElementById('settings').classList.contains('hidden') && !document.querySelector('#settings .set-panel[data-cat="historik"]').classList.contains('hidden')`)));
    // Återställ alla
    await S(`showSettingsCat('anpassa')`); await sov(300);
    await S(`document.querySelector('#anp-kortkommandon [data-gor="alla"]').click()`); await sov(150);
    await S(`document.querySelector('#anp-kortkommandon [data-gor="alla-ja"]').click()`); await sov(500);
    R.ok('Återställ alla tar bort ändringarna', (await M(`const a = process.mainModule.require(${JSON.stringify(path.join(ROT, 'anpassa.js'))}); return Object.keys(a.alla()).filter((k) => k.startsWith('kortkommandon.')).length`)) === 0);
    R.ok('Ny flik är Ctrl+T igen', JSON.stringify(await S(`Anpassa.get('kortkommandon.ny-flik')`)) === JSON.stringify(['CmdOrCtrl+T']));
    await S(`closeSettings()`); await sov(500);

    // ── 4. Musgester ──
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/a')))`); await sov(500);
    await M(`global.__kmeny = 0; for (const w of el.webContents.getAllWebContents()) if (w.getURL().startsWith('${BAS}')) w.on('context-menu', () => global.__kmeny++); return 1`);
    const kmeny = async () => Number(await M(`return global.__kmeny`));
    const dra = async (start, steg, { hall } = {}) => {   // höger knapp ned, dra i steg (px i sidan), släpp
      let [cx, cy] = start;
      xd('mousemove', ...(await skarmPunkt(cx, cy)).map(String)); await sov(120);
      xd('mousedown', '3'); await sov(80);
      for (const [dx, dy] of steg) {
        const n = Math.max(1, Math.round(Math.hypot(dx, dy) / 12));
        for (let i = 1; i <= n; i++) { xd('mousemove', ...(await skarmPunkt(cx + (dx * i) / n, cy + (dy * i) / n)).map(String)); await sov(14); }
        cx += dx; cy += dy;
      }
      if (hall) { await sov(250); await hall(); }
      xd('mouseup', '3'); await sov(350);
    };
    // Högerklicksmenyn: Esc via xdotool når den inte i Xvfb (ingen fönsterhanterare), så den stängs via Electron.
    // Annars äter den öppna menyn nästa knapptryckning, precis som i Chrome.
    await M(`global.__menyer = []; const P = el.Menu.prototype.popup; if (!P.__test) { el.Menu.prototype.popup = function (...a) { global.__menyer.push(this); return P.apply(this, a); }; el.Menu.prototype.popup.__test = 1; } return 1`);
    const stangMeny = async () => { xd('key', 'Escape'); await M(`for (const m of global.__menyer) { try { m.closePopup(); } catch {} } global.__menyer = []; return 1`); await sov(300); };
    // av: högerklick går rakt till sidan
    await A(`__log.length = 0`);
    let k0 = await kmeny();
    xd('mousemove', ...(await skarmPunkt(220, 330)).map(String)); await sov(100); xd('click', '3'); await sov(500);
    R.ok('gester av: högerklick ger sidans contextmenu', (await A(`__log.includes('contextmenu:2')`)) === true, await A(`__log`));
    R.ok('gester av: AdRazes högerklicksmeny kommer', (await kmeny()) === k0 + 1);
    await stangMeny();
    // på
    await S(`Anpassa.set('gester.pa', true, 'test')`); await sov(300);
    R.ok('gester på', (await lage()).gesterPa === true);
    await A(`__log.length = 0`); k0 = await kmeny();
    xd('mousemove', ...(await skarmPunkt(220, 330)).map(String)); await sov(100); xd('click', '3'); await sov(600);
    R.ok('gester på: vanligt högerklick ger ändå sidans contextmenu', (await A(`__log.includes('contextmenu:2')`)) === true, await A(`__log`));
    R.ok('gester på: och AdRazes högerklicksmeny', (await kmeny()) === k0 + 1, await kmeny());
    await stangMeny();
    // Vänster = bakåt, höger = framåt
    await S(`guardedNavigate(active, '${BAS}/c')`);
    await vanta(async () => (await aktivUrl()).startsWith(BAS + '/c')); await sov(1200);
    const sidaC = await H.anslut((await H.mal(cdp, (t) => t.url.startsWith(BAS + '/c'), 10000)).webSocketDebuggerUrl); anslutna.push(sidaC);
    await sidaC.skicka('Runtime.enable');
    const C = (expr) => medTid(sidaC.kor(expr));
    await C(`__log.length = 0`);
    let sag = false;
    await dra([500, 300], [[-160, 0]], { hall: async () => { const l = await lage(); sag = l.sparSyns && l.drag === 'L'; skarm('gest-spar'); } });
    R.ok('spåret visas medan man drar (riktning L)', sag);
    R.ok('spåret göms när man släpper', (await lage()).sparSyns === false);
    R.ok('sidan såg inget av gesten', (await C(`__log.filter((e) => /^(mousedown|mouseup|contextmenu)/.test(e)).length`)) === 0, await C(`__log`));
    R.ok('gest vänster = bakåt (till Sida A)', await vanta(async () => (await aktivUrl()).startsWith(BAS + '/a'), 6000), await aktivUrl());
    await sov(800);
    const paA = (await aktivUrl()).startsWith(BAS + '/a');   // annars finns inget framåt att testa
    await dra([300, 300], [[160, 0]]);
    R.ok('gest höger = framåt (till Sida C)', paA && await vanta(async () => (await aktivUrl()).startsWith(BAS + '/c'), 6000), await aktivUrl());
    await sov(800);
    // Upp = ny flik
    n0 = await flikar();
    await dra([400, 400], [[0, -150]]);
    const nyFlik = await vanta(async () => (await flikar()) === n0 + 1);
    R.ok('gest upp = ny flik', nyFlik, await flikar());
    if (nyFlik) { await S(`closeTab(active)`); await sov(500); }
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/c')))`); await sov(500);
    // Upp + ned = ladda om
    const lc = await C(`__laddningar()`);
    await dra([400, 400], [[0, -120], [0, 140]]);
    R.ok('gest upp+ned = ladda om', await vanta(async () => Number(await C(`__laddningar()`)) === lc + 1, 6000));
    await sov(600);
    // Ned + höger = stäng fliken (en egen flik för det, testsidans flik behövs sedan)
    await S(`createTab('${BAS}/b?stang')`);
    await vanta(async () => (await aktivUrl()).startsWith(BAS + '/b?stang')); await sov(1200);
    n0 = await flikar();
    await dra([300, 250], [[0, 140], [160, 0]]);
    R.ok('gest ned+höger = stäng fliken', await vanta(async () => (await flikar()) === n0 - 1 && !(await S(`tabs.some((t) => (t.url || '').includes('/b?stang'))`))), await flikar());
    // Inbäddad ram från en annan sajt: AdRaze rör inte högerklicket där
    await S(`switchTab(tabs.find((t) => (t.url || '').startsWith('${BAS}/c')))`); await sov(500);
    await S(`guardedNavigate(active, '${BAS}/a')`);
    await vanta(async () => (await aktivUrl()).startsWith(BAS + '/a')); await sov(1200);
    const ramT = await H.mal(cdp, (t) => t.type === 'iframe' && t.url.includes(':' + ram.port + '/ram'), 8000);
    if (ramT) {
      const ramS = await H.anslut(ramT.webSocketDebuggerUrl); anslutna.push(ramS);
      await ramS.skicka('Runtime.enable');
      await medTid(ramS.kor(`__log.length = 0`));
      xd('mousemove', ...(await skarmPunkt(800, 350)).map(String)); await sov(120); xd('click', '3'); await sov(600);
      R.ok('ram från annan sajt: högerklicket går direkt till ramen', (await medTid(ramS.kor(`__log.includes('contextmenu:2')`))) === true, await medTid(ramS.kor(`__log`)));
      await stangMeny();
    } else R.ok('ram från annan sajt hittades', false);
    // CDP-mus (Input.dispatchMouseEvent): gest vänster
    await S(`guardedNavigate(active, '${BAS}/b?cdp')`);
    await vanta(async () => (await aktivUrl()).startsWith(BAS + '/b?cdp')); await sov(1200);
    const flikB = await H.mal(cdp, (t) => t.url.startsWith(BAS + '/b?cdp') && t.type === 'page', 8000);
    const cdpB = await H.anslut(flikB.webSocketDebuggerUrl); anslutna.push(cdpB);
    await medTid(cdpB.skicka('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 300 }));
    await medTid(cdpB.skicka('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 300, button: 'right', buttons: 2, clickCount: 1 }));
    for (let i = 1; i <= 10; i++) await medTid(cdpB.skicka('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500 - i * 15, y: 300, button: 'right', buttons: 2 }));
    await medTid(cdpB.skicka('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 350, y: 300, button: 'right', buttons: 0, clickCount: 1 }));
    R.ok('CDP-mus: gest vänster = bakåt', await vanta(async () => (await aktivUrl()).startsWith(BAS + '/a'), 6000), await aktivUrl());
    await sov(600);
    // av igen: drag med höger knapp går till sidan
    await S(`Anpassa.set('gester.pa', undefined, 'test')`); await sov(300);
    R.ok('gester av igen', (await lage()).gesterPa === false);
    await A(`__log.length = 0`);
    await dra([500, 200], [[-120, 0]]);
    R.ok('gester av: sidan får musknappen', (await A(`__log.includes('mousedown:2')`)) === true, await A(`__log`));
    await stangMeny();

    // Inställningsdelen för musgester
    await S(`openSettings(); showSettingsCat('anpassa')`); await sov(400);
    await S(`document.getElementById('anp-kort-gester').scrollIntoView()`); await sov(200);
    await bild('installningar-gester');
    await S(`closeSettings()`); await sov(300);

    // Fel?
    const jsFel = shell.handelser.filter((m) => m.method === 'Runtime.exceptionThrown').map((m) => m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    R.ok('inga JS-fel i skalet', jsFel.length === 0, jsFel);
    R.ok('inga fel från kortkommandona i huvudprocessens logg', !/\[kortkommandon\]/.test(fs.readFileSync(logg, 'utf8')));
  } catch (e) {
    R.ok('testet kraschade inte', false, String(e && e.stack || e));
  } finally {
    for (const a of anslutna) a.stang();
    await H.stang(p);
    x.stoppa();
    ram.s.close(); sajt.s.close();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

kor().then((R) => {
  console.log(R.text());
  console.log(R.fel.length ? '\n' + R.fel.length + ' FEL' : '\nAllt gick igenom.');
  process.exit(R.fel.length ? 1 : 0);
});
