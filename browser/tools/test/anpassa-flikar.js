#!/usr/bin/env node
// Anpassa → flikar, osynligt (egen Xvfb) med riktig mus och riktigt tangentbord (xdotool):
//  - placering upptill / på sidan (bara ikoner, dragbar bredd, Ctrl+Shift+A) / dolda (överkanten, Ctrl+Shift+A)
//  - webbsidans vy (WebContentsView i huvudprocessen) ligger exakt över #views i alla lägen, även efter
//    storleksändring, helskärm och med Falk öppen; barnspärren täcker även flikpanelen
//  - flikgrupper: flikens och gruppens meny, namn, färg, fäll ihop/ut, ny flik i gruppen, ta bort ur, dela upp,
//    stäng gruppen, ångra, kvar efter omstart, inkognito sparar aldrig
//  - fliklogik (nya flikar, sista fliken, stängknapp) och sovande flikar (fästa flikar sover aldrig, klick väcker)
//  - alla placeringar × verktygsraden uppe/nere (Anpassa › verktyg): raden hel och klickbar, fönsterknapparna
//    synliga och klickbara, panelen och webbsidan på rätt plats, dolda flikar fram med riktig mus
// Skärmdumpar sparas i en mapp som skrivs ut på slutet (titta på dem).
// Användning (från browser/): node tools/test/anpassa-flikar.js [--bilder <mapp>]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const H = require('./hjalp');

const R = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(R, 'node_modules', 'electron', 'dist', 'electron');
const argv = process.argv.slice(2);
const BILDER = argv.includes('--bilder') ? path.resolve(argv[argv.indexOf('--bilder') + 1]) : H.tempDir('flikar-bilder');
fs.mkdirSync(BILDER, { recursive: true });
const sov = H.sov;
const js = (v) => JSON.stringify(v);

// Testsidor: /sida/<namn>?f=<hex> – färgad sida med orange ram runt hela vyn (syns i bilderna om vyn hamnar fel)
function sidserver() {
  return new Promise((res) => {
    const s = http.createServer((req, ut) => {
      const u = new URL(req.url, 'http://x');
      const namn = decodeURIComponent(u.pathname.split('/').pop() || 'sida').replace(/[<>&"]/g, '');
      const f = /^[0-9a-f]{6}$/i.test(u.searchParams.get('f') || '') ? '#' + u.searchParams.get('f') : '#dfe8f3';
      ut.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      ut.end(`<!doctype html><meta charset="utf-8"><title>${namn}</title><style>html,body{margin:0;height:100%;font:600 28px system-ui;background:${f};color:#0e2a47}`
        + `.r{position:fixed;inset:0;border:6px solid #ff4b1f;box-sizing:border-box;display:grid;place-items:center}</style><div class="r">${namn}</div>`);
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stang: () => s.close() }));
  });
}

// Fönstrets "ctx" i huvudprocessen nås via en fliks webContents (main.js sätter wc.__ctx)
const KTX = (ink) => `[...new Set(el.webContents.getAllWebContents().filter((w) => !w.isDestroyed() && w.__ctx && w.__tabId != null).map((w) => w.__ctx))]`
  + `.find((c) => c.win && !c.win.isDestroyed() && c.win.webContents.getURL().includes('incognito') === ${!!ink})`;
const FONSTER = (ink) => `el.BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('shell.html') && w.webContents.getURL().includes('incognito') === ${!!ink})`;

async function startaApp(x, profil) {
  const cdp = await H.ledigPort(), insp = await H.ledigPort();
  const logg = path.join(profil, 'logg.txt');
  const p = H.starta(ELECTRON, ['--inspect=' + insp, R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  await H.vantaPaPort(cdp, 60000);
  const t = await H.mal(cdp, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'), 30000);
  if (!t) throw new Error('skalet startade inte');
  let mj = null;
  for (let i = 0; i < 80 && !mj; i++) { try { mj = (await H.hamtaJson(insp, '/json'))[0]; } catch { await sov(250); } }
  if (!mj) throw new Error('huvudprocessen svarade inte');
  const huvud = await H.anslut(mj.webSocketDebuggerUrl);
  await huvud.skicka('Runtime.enable');
  await sov(1500);
  const skal = await H.anslut(t.webSocketDebuggerUrl);
  await skal.skicka('Runtime.enable');
  // Introt bort; ingen "Stäng X flikar?"-fråga när testet stänger appen (annars väntar appen på svar);
  // "Gör AdRaze till din huvudwebbläsare?" skjuts upp så notisen inte ligger över knappar i bilderna
  await skal.kor(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('adraze-hacker-intro-v3', '1'); localStorage.setItem('adraze-flytt-erbjuden', '1'); localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true;
    localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 30 * 864e5)); const d = document.getElementById('defbrowser-banner'); if (d) d.remove(); } catch {} return 1; })()`);
  const app = { p, cdp, insp, logg, skal, huvud };
  app.kor = (s) => skal.kor(s);
  app.main = (s) => huvud.kor(`(async () => { const el = process.mainModule.require('electron'); ${s} })()`);
  // Inbyggda menyer visas aldrig i testet: mallen sparas och valen klickas härifrån (samma klickfunktioner som i menyn)
  await app.main(`if (!global.__anpBygg) { global.__anpBygg = el.Menu.buildFromTemplate; el.Menu.buildFromTemplate = (t) => { const m = global.__anpBygg.call(el.Menu, t); global.__anpMeny = t; m.popup = () => {}; return m; }; } return 1;`);
  return app;
}

async function kor() {
  const T = H.resultat();
  const x = await H.startaXvfb();
  const srv = await sidserver();
  const profil = H.tempDir('flikar');
  const xdo = (...a) => execFileSync('xdotool', a.map(String), { env: { ...process.env, DISPLAY: x.display }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  let app = null;

  const fonster = (ink = false) => app.main(`const w = ${FONSTER(ink)}; return w ? w.getContentBounds() : null;`);
  const mus = async (cx, cy) => { const b = await fonster(); xdo('mousemove', Math.round(b.x + cx), Math.round(b.y + cy)); await sov(150); };
  // Ångra-toasten (Anpassa, uppe i mitten) visas en stund efter en ändring och kan ligga över det som ska klickas:
  // vänta ut den. Står musen på toasten stannar den kvar, så musen flyttas först ut på sidan.
  const toastOver = (cx, cy) => app.kor(`(() => { const t = document.getElementById('anp-toast'); if (!t || !t.classList.contains('pa')) return 0;
    const q = t.getBoundingClientRect(); if (${cx} < q.left - 4 || ${cx} > q.right + 4 || ${cy} < q.top - 4 || ${cy} > q.bottom + 4) return 0; return t.matches(':hover') ? 2 : 1; })()`);
  const utanToast = async (cx, cy) => {
    for (let i = 0, o = await toastOver(cx, cy); o && i < 50; i++, o = await toastOver(cx, cy)) {
      if (o === 2) { const v = await rect('#views'); await mus(v.cx, v.cy); }
      await sov(250);
    }
  };
  const klick = async (cx, cy, knapp = 1) => { await utanToast(cx, cy); await mus(cx, cy); xdo('click', knapp); await sov(300); };
  const rect = (sel) => app.kor(`(() => { const e = document.querySelector(${js(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
  const flik = (titel) => app.kor(`(() => { const t = tabs.find((t) => t.title === ${js(titel)}); const e = t && document.querySelector('[data-tabid="' + t.id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { id: t.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height }; })()`);
  const aktiv = () => app.kor('active && active.title');
  const klass = (k) => app.kor(`document.body.classList.contains(${js(k)})`);
  const satt = async (k, v) => { const r = await app.kor(`(async () => await Anpassa.set(${js(k)}, ${js(v)}, 'test'))()`); await sov(700); return r; };
  const grupper = () => app.kor('AnpFlikar._grupper()');
  const ordning = () => app.kor(`tabs.map((t) => t.title + (t.grupp ? '@' + t.grupp : '') + (t.pinned ? '#' : ''))`);
  const meny = () => app.main(`const f = (t) => (t || []).map((i) => i.type === 'separator' ? '-' : { l: i.label, s: i.submenu ? f(i.submenu) : undefined }); return f(global.__anpMeny);`);
  const menyKlick = (vag) => app.main(`let t = global.__anpMeny, it = null; for (const l of ${js(vag)}) { it = (t || []).find((i) => i.label === l); if (!it) return 'saknas: ' + l; t = it.submenu; } it.click(); return 'ok';`);
  const etiketter = (m) => (m || []).filter((i) => i !== '-').map((i) => i.l);
  // #views i skalet jämfört med flikens vy i huvudprocessen (kw = Falks bredd när Falk är öppen)
  const matt = async () => {
    const v = await rect('#views');
    const m = await app.main(`const c = ${KTX(false)}; if (!c) return null; const vy = c.views.get(c.visibleTab);
      return { b: vy ? vy.getBounds() : null, falk: c.kryptoView && c.kryptoOpen ? c.kryptoView.getBounds() : null, falkHel: !!c.kryptoFull };`);
    return { v, ...(m || {}) };
  };
  const stammer = (m, kw = 0) => {
    if (!m || !m.v || !m.b) return false;
    const nara = (a, b) => Math.abs(a - b) <= 1;
    return nara(m.b.x, Math.round(m.v.x)) && nara(m.b.y, Math.round(m.v.y)) && nara(m.b.width, Math.round(m.v.w) - kw) && nara(m.b.height, Math.round(m.v.h));
  };
  const bild = async (namn, ink = false) => {
    const fil = path.join(BILDER, namn + '.png');
    await app.kor(`(() => { const d = document.getElementById('defbrowser-banner'); if (d) d.remove(); return 1; })()`);   // hann den visas före testets inställning
    const b = await fonster(ink);
    try {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', Math.min(b.width, 1600 - b.x) + 'x' + Math.min(b.height, 1000 - b.y),
        '-i', x.display + '+' + b.x + ',' + b.y, '-frames:v', '1', fil], { stdio: 'ignore' });
    } catch {
      const r = await app.skal.skicka('Page.captureScreenshot', { format: 'png' });   // utan ffmpeg: bara skalet (webbsidan syns inte)
      fs.writeFileSync(fil, Buffer.from(r.result.data, 'base64'));
    }
  };
  const lage = async (l) => { await satt('flikar.lage', l); await sov(300); };
  const storlek = async (w, h) => { await app.main(`${FONSTER(false)}.setContentSize(${w}, ${h}); return 1;`); await sov(1000); };

  try {
    app = await startaApp(x, profil);
    // Sidopanelen (egen del med eget test, av som standard) stängs av: här mäts webbytan bredvid flikarna utan den
    await satt('sidopanel.visa', false);
    const SIDOR = [['Nyheter', 'dfe8f3'], ['Mejl', 'e6f4ea'], ['Kalender', 'fdf3e1'], ['Recept', 'fbe9f1'], ['Karta', 'eceff3']]
      .map(([n, f]) => `http://127.0.0.1:${srv.port}/sida/${n}?f=${f}`);
    await app.kor(`(async () => { for (const u of ${js(SIDOR)}) { createTab(u); await new Promise((r) => setTimeout(r, 350)); } return tabs.length; })()`);
    await sov(1500);
    await app.kor(`(() => { const t = tabs.find((t) => !t.url); if (t) closeTab(t); return 1; })()`);   // den tomma startfliken bort
    await sov(800);
    T.ok('fem flikar med sidor', (await ordning()).join(',') === 'Nyheter,Mejl,Kalender,Recept,Karta', await ordning());

    /* ── 1. Upptill (som förut) ── */
    let m = await matt();
    T.ok('upptill: webbsidan ligger exakt över #views', stammer(m), m);
    T.ok('upptill: flikraden högst upp', (await rect('#tabstrip')).y === 0);
    await bild('01-upptill');

    /* ── 2. På sidan ── */
    await lage('vertikal');
    m = await matt();
    const panel = await rect('#tabstrip');
    T.ok('på sidan: panel till vänster, 240 px bred', panel && panel.x === 0 && Math.round(panel.w) === 240, panel);
    T.ok('på sidan: panelen börjar under verktygsraden', panel && m.v && Math.round(panel.y) === Math.round(m.v.y) && Math.round(panel.y + panel.h) === Math.round(m.v.y + m.v.h), [panel, m.v]);
    T.ok('på sidan: webbsidan börjar där panelen slutar', stammer(m) && m.b.x === 240, m);
    const wc = await rect('#winctl');
    T.ok('på sidan: fönsterknapparna uppe till höger', wc && Math.round(wc.y) === 0 && Math.round(wc.x + wc.w) === Math.round(m.v.x + m.v.w) && wc.w >= 130, wc);
    await bild('02-pa-sidan');
    let r = await flik('Mejl');
    await klick(r.cx, r.cy);
    T.ok('på sidan: klick på en flik i panelen byter flik (riktig mus)', (await aktiv()) === 'Mejl');
    m = await matt();
    T.ok('på sidan: rätt mått efter flikbyte', stammer(m), m);
    // Klick på fönsterknappen når fram (verktygsraden är titelrad men slutar före knapparna)
    await app.kor(`(() => { window.__anpKlick = []; document.getElementById('wc-max').addEventListener('click', () => window.__anpKlick.push('max'), { once: true }); return 1; })()`);
    const wm = await rect('#wc-max');
    await klick(wm.cx, wm.cy);
    T.ok('på sidan: maximera-knappen går att klicka', (await app.kor('window.__anpKlick.join()')) === 'max');
    await sov(500);
    await app.main(`const w = ${FONSTER(false)}; if (w.isMaximized()) w.unmaximize(); return 1;`); await storlek(1280, 820);
    // Dra panelens kant (riktig mus)
    let hk = await rect('#anp-vdrag');
    await mus(hk.cx, 400); xdo('mousedown', 1);
    for (let d = 10; d <= 90; d += 10) { await mus(hk.cx + d, 400); await sov(30); }
    xdo('mouseup', 1); await sov(800);
    const bredd = await app.kor(`Anpassa.get('flikar.vertikalBredd')`);
    m = await matt();
    T.ok('på sidan: panelens kant går att dra (bredden sparas)', bredd >= 318 && bredd <= 342, bredd);
    T.ok('på sidan: webbsidan följer den nya bredden', stammer(m) && Math.abs(m.b.x - bredd) <= 1, m);
    await bild('03-pa-sidan-bredare');
    hk = await rect('#anp-vdrag');
    await mus(hk.cx, 400); xdo('click', '--repeat', 2, '--delay', 90, 1); await sov(800);
    T.ok('på sidan: dubbelklick på kanten ger standardbredden', (await app.kor(`Anpassa.get('flikar.vertikalBredd')`)) === 240);
    // Bara ikoner (knappen längst ner)
    const fot = await rect('#anp-vsmal');
    await klick(fot.cx, fot.cy); await sov(600);
    m = await matt();
    T.ok('bara ikoner: panelen 56 px och webbsidan direkt efter', (await klass('flik-smal')) && stammer(m) && m.b.x === 56, m);
    await bild('04-bara-ikoner');
    // Ctrl+Shift+A med fokus i webbsidan (kortkommandot fångas i alla fönstrets vyer)
    await klick(m.v.x + m.v.w / 2, m.v.y + m.v.h / 2);
    xdo('key', 'ctrl+shift+a'); await sov(900);
    m = await matt();
    T.ok('Ctrl+Shift+A (fokus i webbsidan) fäller ut panelen', (await app.kor(`Anpassa.get('flikar.vertikalSmal')`)) === false && stammer(m) && m.b.x === 240, m);
    // Mindre fönster
    await storlek(1000, 680);
    m = await matt();
    T.ok('på sidan: rätt mått i mindre fönster', stammer(m) && Math.round(m.v.w) === 760 && Math.round(m.v.y + m.v.h) === 680, m);
    await bild('05-pa-sidan-litet-fonster');
    await storlek(1280, 820);
    // Falk öppen: webbsidan slutar där Falk börjar, Falk längst till höger
    await app.kor(`(window.view.kryptoToggle(true, kryptoMode(), null), 1)`); await sov(1500);
    m = await matt();
    const falkOk = m.falk && (m.falkHel
      ? Math.round(m.falk.x) === Math.round(m.v.x) && Math.round(m.falk.width) === Math.round(m.v.w)
      : stammer(m, 400) && Math.abs(m.falk.x - (m.b.x + m.b.width)) <= 1 && Math.abs(m.falk.x + m.falk.width - Math.round(m.v.x + m.v.w)) <= 1);
    T.ok('på sidan + Falk: Falk till höger, inget hamnar under panelen', falkOk && m.falk.x >= 240, m);
    await bild('06-pa-sidan-falk');
    await app.kor(`(window.view.kryptoToggle(false, kryptoMode(), null), 1)`); await sov(1200);
    m = await matt();
    T.ok('på sidan: Falk stängd → full bredd igen', stammer(m), m);
    // Helskärm
    await app.main(`${FONSTER(false)}.setFullScreen(true); return 1;`); await sov(1500);
    m = await matt();
    T.ok('på sidan: rätt mått i helskärm', stammer(m) && m.b.x === 240, m);
    await app.main(`${FONSTER(false)}.setFullScreen(false); return 1;`); await sov(1500);
    await storlek(1280, 820);
    m = await matt();
    T.ok('på sidan: rätt mått efter helskärm', stammer(m) && m.b.x === 240, m);
    // Fäst flik: överst som ikon
    await app.kor(`(setPinned(tabs.find((t) => t.title === 'Nyheter'), true), 1)`); await sov(500);
    const fast = await app.kor(`(() => { const e = document.querySelector('#tabs .tab.pinned'); const r = e && e.getBoundingClientRect(); return r ? { y: r.y, w: r.width, forst: e === document.querySelector('#tabs').firstElementChild } : null; })()`);
    T.ok('på sidan: fäst flik överst som ikon', fast && fast.forst && fast.w < 120, fast);
    await bild('07-pa-sidan-fast-flik');
    // Barnspärren täcker även panelen
    await app.kor(`(showBlockScreen('https://example.com/'), 1)`); await sov(700);
    const tackt = await app.kor(`(() => { const kb = document.getElementById('kidblock'); const e = document.elementFromPoint(30, 300); return { syns: !!kb && getComputedStyle(kb).display !== 'none', ovanpa: !!(e && e.closest('#kidblock')) }; })()`);
    T.ok('barnspärren täcker flikpanelen', tackt.syns && tackt.ovanpa, tackt);
    await bild('08-pa-sidan-barnsparr');
    await app.kor(`(typeof kbStang === 'function' ? kbStang(false) : (document.getElementById('kidblock').style.display = 'none', showActiveTab()), 1)`); await sov(700);
    m = await matt();
    T.ok('på sidan: sidan tillbaka efter spärren', stammer(m), m);

    /* ── 3. Dolda ── */
    await lage('dolda');
    m = await matt();
    const st = await rect('#tabstrip'), tb = await rect('#toolbar');
    T.ok('dolda: flikraden ligger ovanför fönstret', st && st.y + st.h <= 0, st);
    T.ok('dolda: verktygsraden överst, webbsidan direkt under', tb.y === 0 && stammer(m) && m.b.x === 0 && Math.round(m.b.y) === Math.round(tb.y + tb.h), { tb, m });
    const wc2 = await rect('#winctl');
    T.ok('dolda: fönsterknapparna syns', wc2 && Math.round(wc2.y) === 0 && wc2.w >= 130, wc2);
    await bild('09-dolda');
    await mus(600, 400); await mus(600, 6); await sov(600);   // riktig mus till överkanten (under fönstrets storleksram)
    T.ok('dolda: musen vid överkanten visar flikraden', await klass('flik-zen-visad'));
    T.ok('dolda: raden ligger över verktygsraden, inte över sidan', Math.round((await rect('#tabstrip')).y) === 0 && Math.round((await rect('#tabstrip')).h) <= Math.round(tb.h));
    await bild('10-dolda-visad');
    r = await flik('Kalender');
    await klick(r.cx, r.cy);
    T.ok('dolda: klick på en flik i raden byter flik', (await aktiv()) === 'Kalender');
    await mus(600, 450); await sov(1000);
    T.ok('dolda: raden glider undan när musen lämnar den', !(await klass('flik-zen-visad')));
    m = await matt();
    T.ok('dolda: webbsidan flyttades aldrig', stammer(m) && Math.round(m.b.y) === Math.round(tb.y + tb.h), m);
    xdo('key', 'ctrl+shift+a'); await sov(600);
    T.ok('dolda: Ctrl+Shift+A visar raden', await klass('flik-zen-visad'));
    xdo('key', 'ctrl+shift+a'); await sov(600);
    T.ok('dolda: Ctrl+Shift+A igen döljer den', !(await klass('flik-zen-visad')));
    await storlek(1100, 700);
    m = await matt();
    T.ok('dolda: rätt mått i mindre fönster', stammer(m) && Math.round(m.v.w) === 1100, m);
    await storlek(1280, 820);

    /* ── 4. Flikgrupper (upptill) ── */
    await lage('upptill');
    await app.kor(`(setPinned(tabs.find((t) => t.title === 'Nyheter'), false), 1)`); await sov(500);
    r = await flik('Mejl');
    await klick(r.cx, r.cy, 3); await sov(400);
    let mn = await meny();
    T.ok('flikens meny: Lägg i ny grupp', etiketter(mn).includes('Lägg i ny grupp'), etiketter(mn));
    await menyKlick(['Lägg i ny grupp']); await sov(600);
    T.ok('ny grupp: namnrutan öppnas direkt', await app.kor(`!!document.activeElement && document.activeElement.className === 'anp-gin'`));
    await mus(600, 400);
    xdo('type', '--delay', 40, 'Jobb'); xdo('key', 'Return'); await sov(600);
    let g = await grupper();
    T.ok('ny grupp: namnet sparas', g.length === 1 && g[0].namn === 'Jobb', g);
    const jobb = g[0] && g[0].id;
    r = await flik('Recept');
    await klick(r.cx, r.cy, 3); await sov(400);
    mn = await meny();
    const lagg = (mn || []).find((i) => i && i.l === 'Lägg i grupp');
    T.ok('flikens meny: Lägg i grupp → Jobb', !!(lagg && lagg.s && lagg.s.some((i) => i.l === 'Jobb')), lagg);
    await menyKlick(['Lägg i grupp', 'Jobb']); await sov(600);
    T.ok('grupp: gruppens flikar ligger i följd', (await ordning()).join(',') === ['Nyheter', 'Mejl@' + jobb, 'Recept@' + jobb, 'Kalender', 'Karta'].join(','), await ordning());
    await mus(600, 400);
    await bild('11-grupp-upptill');
    // Fäst flik kan inte grupperas
    await app.kor(`(setPinned(tabs.find((t) => t.title === 'Nyheter'), true), 1)`); await sov(500);
    // Fäst flik + grupprubrik + fyra flikar får plats: raden scrollar inte och den fästa fliken syns
    const rad = await app.kor(`(() => { const h = document.getElementById('tabs'); const p = h.querySelector('.tab.pinned').getBoundingClientRect(); return { sw: h.scrollWidth, cw: h.clientWidth, sl: h.scrollLeft, px: Math.round(p.x - h.getBoundingClientRect().x) }; })()`);
    T.ok('upptill: fäst flik och grupp får plats utan att raden scrollar', rad.sw <= rad.cw + 1 && rad.sl === 0 && rad.px >= 0, rad);
    // En fäst flik har inget kryss: är den aktiv bland smala flikar (bara ikoner) ska ikonen stå kvar, inte ge plats åt ett kryss som inte finns
    const fastSmal = await app.kor(`(() => { const fore = active, h = document.getElementById('tabs'); switchTab(tabs.find((t) => t.pinned)); h.classList.add('narrow');
      const e = h.querySelector('.tab.pinned.active'), ut = e ? [getComputedStyle(e.querySelector('.fav')).display, getComputedStyle(e.querySelector('.tclose')).display] : null;
      h.classList.remove('narrow'); switchTab(fore); return ut; })()`); await sov(400);
    T.ok('fäst flik: ikonen står kvar när fliken är aktiv bland smala flikar', !!fastSmal && fastSmal[0] !== 'none' && fastSmal[1] === 'none', fastSmal);
    r = await flik('Nyheter');
    await klick(r.cx, r.cy, 3); await sov(400);
    T.ok('fäst flik: inga gruppval i menyn', !etiketter(await meny()).some((l) => /grupp/i.test(l)), etiketter(await meny()));
    // Fäll ihop med klick på gruppens namn (den aktiva fliken flyttas ut ur gruppen)
    await app.kor(`(switchTab(tabs.find((t) => t.title === 'Mejl')), 1)`); await sov(400);
    const kalFore = await flik('Kalender');
    r = await rect('.anp-grupp');
    await klick(r.cx, r.cy); await sov(700);
    let s = await app.kor(`({ g: AnpFlikar._grupper()[0], aktiv: active.title, dolda: document.querySelectorAll('.tab.anp-dold').length })`);
    T.ok('fäll ihop: klick på gruppens namn döljer flikarna', s.g && s.g.hopfalld === true && s.dolda === 2, s);
    T.ok('fäll ihop: aktiva fliken flyttas ut ur gruppen', s.aktiv !== 'Mejl' && s.aktiv !== 'Recept', s.aktiv);
    T.ok('fäll ihop: övriga flikar får platsen', (await flik('Kalender')).w >= kalFore.w, [kalFore.w, (await flik('Kalender')).w]);
    await mus(600, 400);
    await bild('12-grupp-hopfalld');
    r = await rect('.anp-grupp');
    await klick(r.cx, r.cy); await sov(600);
    T.ok('fäll ut: klick igen visar flikarna', (await grupper())[0].hopfalld === false && (await app.kor(`document.querySelectorAll('.tab.anp-dold').length`)) === 0);
    // Gruppens meny (högerklick på namnet)
    r = await rect('.anp-grupp');
    await klick(r.cx, r.cy, 3); await sov(400);
    mn = await meny();
    T.ok('gruppens meny', ['Byt namn', 'Färg', 'Ny flik i gruppen', 'Fäll ihop gruppen', 'Dela upp gruppen', 'Stäng gruppen'].every((l) => etiketter(mn).includes(l)), etiketter(mn));
    const farger = ((mn || []).find((i) => i && i.l === 'Färg') || {}).s || [];
    T.ok('gruppens meny: sex färger', farger.length === 6, farger.map((f) => f.l));
    await menyKlick(['Färg', 'Rosa']); await sov(600);
    T.ok('färg: gruppen blir rosa', (await grupper())[0].farg === 'rosa' && await app.kor(`document.querySelector('.anp-grupp').classList.contains('anp-g-rosa')`));
    r = await rect('.anp-grupp');
    await klick(r.cx, r.cy, 3); await sov(400);
    await menyKlick(['Ny flik i gruppen']); await sov(700);
    T.ok('ny flik i gruppen', (await app.kor(`tabs.filter((t) => t.grupp === ${js(jobb)}).length`)) === 3 && (await app.kor(`active.grupp`)) === jobb);
    // Adressfältets förslagslista (mest besökta, öppen på den nya fliken) får inte ligga kvar när fliken stängs
    await app.kor(`(() => { const a = document.getElementById('address'); a.focus(); a.dispatchEvent(new FocusEvent('focus')); return 1; })()`); await sov(300);
    const sugOppen = () => app.kor(`document.getElementById('omni-suggest').classList.contains('on')`);
    const sugFore = await sugOppen();
    await app.kor('(closeTab(active), 1)'); await sov(700);
    T.ok('förslagslistan stängs när fliken byts', sugFore === true && !(await sugOppen()), { fore: sugFore });
    await app.kor('Anpassa.angra()'); await sov(700);
    T.ok('ångra (Anpassa): färgen tillbaka', (await grupper())[0].farg === 'bla', await grupper());
    // På sidan och bara ikoner med grupp
    await lage('vertikal'); await mus(600, 400);
    await bild('13-grupp-pa-sidan');
    await satt('flikar.vertikalSmal', true);
    await bild('14-grupp-bara-ikoner');
    await satt('flikar.vertikalSmal', false);
    await lage('dolda');
    await app.kor('(AnpFlikar._zen(true), 1)'); await sov(500);
    await bild('15-grupp-dolda-visad');
    await app.kor('(AnpFlikar._zen(false), 1)');
    await lage('upptill');

    /* ── 5. Omstart: grupperna följer med flikarna ── */
    await app.kor('(saveOpenTabs(), 1)'); await sov(300);
    // Felsökarna kopplas från först: med en ansluten felsökare väntar Node på den när appen avslutas
    app.skal.stang(); app.huvud.stang(); await sov(300);
    T.ok('appen stängdes snällt', await H.stang(app.p));
    app = await startaApp(x, profil);
    await sov(2500);
    g = await grupper();
    T.ok('omstart: gruppen finns kvar (namn och färg)', g.length === 1 && g[0].id === jobb && g[0].namn === 'Jobb' && g[0].farg === 'bla', g);
    T.ok('omstart: flikarna ligger kvar i gruppen', (await ordning()).join(',') === ['Nyheter#', 'Mejl@' + jobb, 'Recept@' + jobb, 'Kalender', 'Karta'].join(','), await ordning());
    T.ok('omstart: rubriken ritas', await app.kor(`!!document.querySelector('.anp-grupp.anp-g-bla')`));

    // Ta bort ur gruppen, stäng gruppen, dela upp
    r = await flik('Kalender');
    await klick(r.cx, r.cy, 3); await sov(400);
    await menyKlick(['Lägg i ny grupp']); await sov(600);
    xdo('key', 'Escape'); await sov(400);
    r = await flik('Karta');
    await klick(r.cx, r.cy, 3); await sov(400);
    mn = await meny();
    const ny2 = (((mn || []).find((i) => i && i.l === 'Lägg i grupp') || {}).s || []).map((i) => i.l);
    T.ok('namnlös grupp listas med färgen', ny2.some((l) => /^Namnlös grupp \(/.test(l)), ny2);
    await menyKlick(['Lägg i grupp', ny2.find((l) => /^Namnlös grupp/.test(l))]); await sov(600);
    g = await grupper();
    const andra = g.find((x2) => x2.id !== jobb);
    T.ok('två grupper', g.length === 2 && !!andra && andra.namn === '', g);
    r = await flik('Karta');
    await klick(r.cx, r.cy, 3); await sov(400);
    await menyKlick(['Ta bort ur gruppen']); await sov(600);
    T.ok('ta bort ur gruppen', !(await app.kor(`tabs.find((t) => t.title === 'Karta').grupp`)));
    await mus(600, 400);
    await bild('16-tva-grupper');
    r = await rect(`.anp-grupp[data-grupp="${andra.id}"]`);
    await klick(r.cx, r.cy, 3); await sov(400);
    await menyKlick(['Stäng gruppen']); await sov(1000);
    T.ok('stäng gruppen: flikarna stängs och gruppen försvinner', (await ordning()).join(',') === ['Nyheter#', 'Mejl@' + jobb, 'Recept@' + jobb, 'Karta'].join(',') && (await grupper()).length === 1, [await ordning(), await grupper()]);
    r = await rect('.anp-grupp');
    await klick(r.cx, r.cy, 3); await sov(400);
    await menyKlick(['Dela upp gruppen']); await sov(700);
    T.ok('dela upp: gruppen borta, flikarna kvar', (await ordning()).join(',') === 'Nyheter#,Mejl,Recept,Karta' && (await grupper()).length === 0, [await ordning(), await grupper()]);

    /* ── 6. Fliklogik ── */
    await satt('flikar.nyFlik', 'bredvid');
    let pos = await app.kor(`(() => { switchTab(tabs[1]); const t = createTab(null); return [tabs.indexOf(t), tabs.length]; })()`);
    T.ok('nya flikar: bredvid aktuell', pos[0] === 2, pos);
    await app.kor('(closeTab(active), 1)'); await sov(600);
    await satt('flikar.nyFlik', 'sist');
    pos = await app.kor(`(() => { switchTab(tabs[1]); const t = createTab(null); return [tabs.indexOf(t), tabs.length]; })()`);
    T.ok('nya flikar: sist', pos[0] === pos[1] - 1, pos);
    await app.kor('(closeTab(active), 1)'); await sov(600);
    await satt('flikar.stangKnapp', 'aktiv');
    const kn = await app.kor(`[...document.querySelectorAll('#tabs .tab:not(.pinned)')].map((e) => [e.classList.contains('active'), getComputedStyle(e.querySelector('.tclose')).display])`);
    T.ok('stängknapp bara på aktiv flik', kn.length > 1 && kn.every(([a, d]) => (a ? d !== 'none' : d === 'none')), kn);
    await satt('flikar.stangKnapp', 'alla');
    T.ok('stängknapp på alla flikar', await app.kor(`[...document.querySelectorAll('#tabs .tab:not(.pinned) .tclose')].every((e) => getComputedStyle(e).display !== 'none')`));

    /* ── 7. Sovande flikar ── */
    const sovMs = () => app.main(`return process.mainModule.require('./anpassa-flikar').sovMs();`);
    T.ok('sovande: standard 15 minuter', (await sovMs()) === 15 * 60000);
    await satt('flikar.sova', 30);
    T.ok('sovande: 30 minuter', (await sovMs()) === 30 * 60000);
    await app.kor(`(switchTab(tabs.find((t) => t.title === 'Karta')), 1)`); await sov(800);
    const fastId = (await flik('Nyheter')).id;
    const sv = await app.main(`const c = ${KTX(false)}; for (const id of c.views.keys()) if (id !== c.visibleTab) c.lastActive.set(id, Date.now() - 31 * 60000);
      process.mainModule.require('./anpassa-flikar')._svep(); return { kvar: [...c.views.keys()], sover: [...c.discarded.keys()] };`);
    T.ok('sovande: lediga flikar släpper minnet', sv.sover.length === 2, sv);
    T.ok('sovande: fästa flikar sover aldrig', sv.kvar.includes(fastId) && !sv.sover.includes(fastId), { fastId, ...sv });
    await sov(500);
    const bleka = await app.kor(`[...document.querySelectorAll('.tab.anp-sover')].map((e) => +e.dataset.tabid)`);
    T.ok('sovande: flikarna visas blekare', sv.sover.length > 0 && sv.sover.every((id) => bleka.includes(id)), { bleka, sover: sv.sover });
    await mus(600, 400);
    await bild('17-sovande');
    const vakna = sv.sover[0];
    r = await app.kor(`(() => { const q = document.querySelector('[data-tabid="${vakna}"]').getBoundingClientRect(); return { cx: q.x + q.width / 2, cy: q.y + q.height / 2 }; })()`);
    await klick(r.cx, r.cy); await sov(1800);
    const vaken = await app.main(`const c = ${KTX(false)}; const v = c.views.get(${vakna}); return { har: !!v, url: v ? v.webContents.getURL() : '' };`);
    T.ok('sovande: klick laddar fliken igen', vaken.har && /\/sida\//.test(vaken.url), vaken);
    T.ok('sovande: inte blek längre', !(await app.kor(`document.querySelector('[data-tabid="${vakna}"]').classList.contains('anp-sover')`)));
    m = await matt();
    T.ok('sovande: den väckta sidan på rätt plats', stammer(m), m);
    await satt('flikar.sova', 0);
    const sv2 = await app.main(`const c = ${KTX(false)}; for (const id of c.views.keys()) if (id !== c.visibleTab) c.lastActive.set(id, Date.now() - 300 * 60000);
      const n = c.discarded.size; process.mainModule.require('./anpassa-flikar')._svep(); return { fore: n, efter: c.discarded.size };`);
    T.ok('sovande av: inga flikar somnar', sv2.efter === sv2.fore && (await sovMs()) === 0, sv2);
    await satt('flikar.sova', 15);

    /* ── 8. Inställningar → Anpassa → Flikar ── */
    await app.kor('(openSettings(), showSettingsCat("anpassa"), 1)'); await sov(900);
    const ins = await app.kor(`(() => { const p = document.getElementById('anp-flikar'); return { h3: (p.querySelector('h3') || {}).textContent, rader: p.querySelectorAll('.set-row').length }; })()`);
    T.ok('inställningar: egen del med rubrik och rader', ins.h3 === 'Flikar' && ins.rader >= 6, ins);
    await app.kor(`(document.getElementById('anp-flikar').scrollIntoView({ block: 'center' }), 1)`); await sov(400);
    await bild('18-installningar');
    r = await rect('#anp-flikar button[data-varde="vertikal"]');
    await klick(r.cx, r.cy); await sov(900);
    T.ok('inställningar: På sidan väljs med musen', (await app.kor('AnpFlikar._lage()')) === 'vertikal' && await klass('flik-vertikal'));
    T.ok('inställningar: Bara ikoner visas när panelen är vald', await app.kor(`!!document.querySelector('#anp-flikar input[data-nyckel="flikar.vertikalSmal"]')`));
    await bild('19-installningar-pa-sidan');
    await app.kor('(closeSettings(), 1)'); await sov(700);
    m = await matt();
    T.ok('på sidan: rätt mått efter inställningarna', stammer(m), m);

    /* ── 9. Inkognitofönster: samma placering, grupper bara i minnet ── */
    const sparadFore = await app.main(`return JSON.stringify(process.mainModule.require('./anpassa').hamta('flikar.grupper'));`);
    r = await rect('#views'); await mus(r.cx, r.cy);
    xdo('key', 'ctrl+shift+n'); await sov(3000);
    const it = await H.mal(app.cdp, (t) => t.url.includes('shell.html') && t.url.includes('incognito'), 10000);
    T.ok('inkognitofönster öppnas', !!it);
    if (it) {
      const ink = await H.anslut(it.webSocketDebuggerUrl);
      const ik = await ink.kor(`({ klass: document.body.className, lage: AnpFlikar._lage() })`);
      T.ok('inkognito: samma placering (på sidan)', /flik-vertikal/.test(ik.klass) && /incog/.test(ik.klass), ik);
      const iid = await ink.kor('tabs[0].id');
      await app.main(`${FONSTER(true)}.webContents.send('tab-action', 'grupp-ny', ${iid}); return 1;`); await sov(600);
      await ink.kor(`(() => { const i = document.querySelector('.anp-gin'); if (i) { i.value = 'Hemligt'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } return 1; })()`); await sov(600);
      const ig = await ink.kor('AnpFlikar._grupper()');
      T.ok('inkognito: grupper fungerar i fönstret', ig.length === 1 && ig[0].namn === 'Hemligt', ig);
      await bild('20-inkognito-pa-sidan', true);
      const sparadEfter = await app.main(`return JSON.stringify(process.mainModule.require('./anpassa').hamta('flikar.grupper'));`);
      T.ok('inkognito: gruppen sparas aldrig', sparadEfter === sparadFore && !sparadEfter.includes('Hemligt'), sparadEfter);
      T.ok('inkognito: inget sparas om flikarnas grupper', !(await ink.kor(`String(localStorage.getItem('adraze-flikgrupper') || '').includes(${js(ig[0] && ig[0].id)})`)));
      ink.stang();
      await app.main(`${FONSTER(true)}.close(); return 1;`); await sov(1000);
    }

    /* ── 10. Flikarnas placering × verktygsraden uppe/nere (Anpassa › verktyg) ──
       Webbsidan ritas ovanpå skalet: verktygsraden, panelen och fönsterknapparna får aldrig hamna under den, och
       inget av skalet får täcka verktygsraden. Varje steg byter en sak, så både byte av rad och av läge provas. */
    const NAMN = { upptill: 'flikar upptill', vertikal: 'flikar på sidan', dolda: 'dolda flikar' };
    const korsar = (a, b) => !!(a && b) && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    const ruta = (b) => (b ? { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height } : null);
    // Mått och träffar i skalet. Det som tar emot ett klick i en punkt: översta elementet (toasten, som bara syns
    // en kort stund, räknas inte). Avstängda knappar (pointer-events: none) ska släppa igenom till verktygsraden.
    const geo = () => app.kor(`(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const q = e.getBoundingClientRect();
        return { x: Math.round(q.left), y: Math.round(q.top), r: Math.round(q.right), b: Math.round(q.bottom), w: Math.round(q.width), h: Math.round(q.height) }; };
      const traff = (x, y) => document.elementsFromPoint(x, y).find((n) => !n.closest('#anp-toast')) || null;
      const nar = (e, x, y) => { const t = traff(x, y); return !!t && (e.contains(t) || (e.disabled && !!t.closest('#toolbar'))); };
      const mitt = (e) => { const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; };
      const ctl = [...document.querySelectorAll('#toolbar > button, #toolbar .omni-center > button, #address')].filter((e) => e.offsetWidth > 0);
      const miss = ctl.filter((e) => { const [x, y] = mitt(e); return !nar(e, e.id === 'address' ? e.getBoundingClientRect().left + 10 : x, y); }).map((e) => e.id);
      const wcMiss = ['wc-min', 'wc-max', 'wc-close'].filter((id) => { const e = document.getElementById(id); const [x, y] = mitt(e); return !nar(e, x, y); });
      return { W: innerWidth, H: innerHeight, tb: r('#toolbar'), bm: r('#bmbar'), st: r('#tabstrip'), wc: r('#winctl'), v: r('#views'),
        ctl: ctl.map((e) => e.id), miss, wcMiss, visad: document.body.classList.contains('flik-zen-visad') };
    })()`);
    const kombo = async (l, p, nr) => {
      const n = NAMN[l] + ', verktygsraden ' + p;
      await mus(600, 400);
      const g = await geo(), m = await matt();
      const { W, H, tb, bm, st, wc, v } = g, vy = ruta(m.b);
      T.ok(`${n}: rätt lägen`, (await app.kor('AnpFlikar._lage()')) === l && (await klass('anp-vf-nere')) === (p === 'nere'));
      // Verktygsraden: hel (från vänsterkanten till fönsterknapparna eller kanten), överst/under flikraden eller längst ner
      const radSlut = l === 'upptill' ? W : wc.x;
      const radY = p === 'nere' ? tb.b === H : tb.y === (l === 'upptill' ? st.b : 0);
      T.ok(`${n}: verktygsraden hel och på sin plats`, tb.x === 0 && Math.abs(tb.r - radSlut) <= 1 && tb.h >= 40 && radY, { tb, st, wc, W, H });
      T.ok(`${n}: inget ligger över knapparna eller adressfältet`, g.miss.length === 0 && ['back', 'reload', 'address', 'menu-btn'].every((id) => g.ctl.includes(id)), { miss: g.miss, ctl: g.ctl });
      // Fönsterknapparna: i flikraden (upptill), annars i verktygsradens högra ände
      const wcPlats = l === 'upptill' ? wc.y >= st.y && wc.b <= st.b : wc.y === tb.y && wc.b === tb.b;
      T.ok(`${n}: fönsterknapparna syns och går att nå`, wc.w >= 130 && wc.r === W && wc.x >= 0 && wc.y >= 0 && wc.b <= H && wcPlats && g.wcMiss.length === 0 && !korsar(wc, vy) && !korsar(wc, v), { wc, tb, wcMiss: g.wcMiss });
      // Webbsidan: exakt över #views, aldrig över verktygsraden, panelen eller fönsterknapparna
      const topp = p === 'nere' ? (l === 'upptill' ? st.b : 0) : (bm && bm.y >= tb.b ? bm.b : tb.b);
      const botten = p === 'nere' ? (bm && bm.b <= tb.y ? bm.y : tb.y) : H;
      T.ok(`${n}: webbsidan på rätt plats`, stammer(m) && vy.x === (l === 'vertikal' ? 240 : 0) && vy.r === W && vy.y === topp && vy.b === botten
        && !korsar(vy, tb) && !korsar(vy, wc) && (l !== 'vertikal' || !korsar(vy, st)), { b: m.b, topp, botten, tb, st });
      if (l === 'vertikal') T.ok(`${n}: panelen lika hög som webbsidan, verktygsraden fri`, st.x === 0 && st.w === 240 && st.y === v.y && st.b === v.b && !korsar(st, tb) && !korsar(st, wc), { st, v, tb });
      if (l === 'upptill') T.ok(`${n}: flikraden högst upp`, st.x === 0 && st.y === 0 && st.w === W && !korsar(st, tb), st);
      if (l === 'dolda') T.ok(`${n}: flikraden gömd ${p === 'nere' ? 'under' : 'ovanför'} fönstret`, !g.visad && (p === 'nere' ? st.y >= H : st.b <= 0), st);
      await bild(`21-${nr}-${l}-${p}`);
      // Riktig mus: knapparna i raden och minimera tar emot klicket (fångas innan knappen gör något)
      await app.kor(`(() => { window.__anpTraff = []; window.__anpStopp = (e) => { const t = e.target.closest('[id]'); window.__anpTraff.push(t ? t.id : '?'); e.stopPropagation(); e.preventDefault(); };
        window.addEventListener('click', window.__anpStopp, true); return 1; })()`);
      for (const id of ['reload', 'menu-btn', 'wc-min']) { const q = await rect('#' + id); await klick(q.cx, q.cy); }
      const traff = await app.kor(`(() => { window.removeEventListener('click', window.__anpStopp, true); return window.__anpTraff; })()`);
      T.ok(`${n}: riktig mus: ladda om, menyn och minimera tar emot klicket`, traff.join() === 'reload,menu-btn,wc-min', traff);
      const ad = await rect('#address');
      await klick(ad.x + 10, ad.cy);
      const fokus = await app.kor('document.activeElement && document.activeElement.id');
      await app.kor(`(() => { closeSug(); document.getElementById('address').blur(); return 1; })()`); await sov(400);
      T.ok(`${n}: riktig mus: klick i adressfältets början ger fokus`, fokus === 'address', fokus);
      // Flikarna går att använda: klick på en flik (dolda: raden fram med musen vid kanten, sedan undan igen)
      const mal = (await app.kor('tabs.filter((t) => t !== active && !t.pinned).map((t) => t.title)'))[0];
      if (l === 'dolda') {
        await mus(600, p === 'nere' ? H - 7 : 6); await sov(600);   // inom 8 px från kanten, innanför fönstrets storleksram
        const s = await geo();
        T.ok(`${n}: musen vid ${p === 'nere' ? 'underkanten' : 'överkanten'} visar flikraden över verktygsraden`,
          s.visad && (p === 'nere' ? s.st.b === H && s.st.y >= s.tb.y : s.st.y === 0 && s.st.b <= s.tb.b), s.st);
        await bild(`21-${nr}-${l}-${p}-visad`);
      }
      const fr = await flik(mal);
      await klick(fr.cx, fr.cy);
      T.ok(`${n}: klick på en flik byter flik (riktig mus)`, (await aktiv()) === mal, { mal, aktiv: await aktiv() });
      if (l === 'dolda') { await mus(600, 400); await sov(1000); }
      const m2 = await matt();
      T.ok(`${n}: webbsidan kvar på sin plats efter klicken`, stammer(m2) && m2.b.x === m.b.x && m2.b.y === m.b.y && m2.b.height === m.b.height
        && (l !== 'dolda' || !(await klass('flik-zen-visad'))), m2);
    };
    await lage('vertikal');
    await satt('verktyg.placering', 'uppe');
    const nu = { 'flikar.lage': 'vertikal', 'verktyg.placering': 'uppe' };
    await kombo(nu['flikar.lage'], nu['verktyg.placering'], 1);
    const STEG = [['verktyg.placering', 'nere'], ['flikar.lage', 'dolda'], ['verktyg.placering', 'uppe'], ['flikar.lage', 'upptill'],
      ['verktyg.placering', 'nere'], ['flikar.lage', 'vertikal'], ['verktyg.placering', 'uppe']];
    for (let i = 0; i < STEG.length; i++) {
      nu[STEG[i][0]] = STEG[i][1];
      await satt(STEG[i][0], STEG[i][1]); await sov(300);
      await kombo(nu['flikar.lage'], nu['verktyg.placering'], i + 2);
    }

    /* ── 11. Sista fliken ── */
    await lage('upptill');
    await satt('flikar.sistaFlik', 'ny');
    await app.kor(`(async () => { for (const t of tabs.slice()) closeTab(t); await new Promise((r) => setTimeout(r, 900)); return tabs.length; })()`);
    const kvar = await app.kor(`({ n: tabs.length, url: tabs[0] && tabs[0].url })`);
    T.ok('sista fliken stängd → en ny flik, fönstret står kvar', kvar.n === 1 && !kvar.url, kvar);
    await satt('flikar.sistaFlik', 'stang');
    app.huvud.stang(); await sov(300);   // huvudprocessens felsökare bort först, annars väntar Node på den när appen avslutas
    app.kor('(closeTab(tabs[0]), 1)').catch(() => {});
    let dog = false;
    for (let i = 0; i < 60 && !dog; i++) { await sov(250); dog = app.p.exitCode !== null || app.p.signalCode !== null; }
    T.ok('sista fliken stängd → fönstret stängs (som förut)', dog);
  } catch (e) {
    T.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    if (app) { try { app.skal.stang(); app.huvud.stang(); } catch {} await H.stang(app.p); }
    srv.stang();
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
