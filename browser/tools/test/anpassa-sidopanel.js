#!/usr/bin/env node
// Test av Anpassa › Sidopanel (webbappar bredvid sidan) mot utvecklingsbygget, osynligt i Xvfb.
// Egen liten webbserver på 127.0.0.1 med testsidor – inga riktiga sajter. Huvudprocessen nås via
// Node-inspektören (ledig port, bara under testet), skalet och apparna via CDP. Skärmdumpar av hela
// fönstret (skalet + de inbyggda vyerna) tas med ffmpeg från Xvfb-skärmen; dragningar och tangenttryck
// görs med xdotool mot samma osynliga skärm (riktig mus och riktigt tangentbord, inget syns på din skärm).
// Kräver: Xvfb, ffmpeg, xdotool. Avslutar med 0 om allt gick igenom.
// Användning: node tools/test/anpassa-sidopanel.js [webbläsarmapp] [--bilder <mapp>]
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const H = require('./hjalp');

// Liten PNG (RGBA) för testikonen – ingen bild från nätet
function png(w, h, fn) {
  const rader = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; const [r, g, b, a] = fn(x, y); rader[o] = r; rader[o + 1] = g; rader[o + 2] = b; rader[o + 3] = a; }
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bit = (typ, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(typ), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bit('IHDR', ih), bit('IDAT', zlib.deflateSync(rader)), bit('IEND', Buffer.alloc(0))]);
}
const IKON1 = png(64, 64, (x, y) => { const dx = x - 32, dy = y - 30; const i = dx * dx + dy * dy < 15 * 15 || (x > 18 && x < 30 && y > 36 && y < 50 && x - 18 < 50 - y); return i ? [255, 255, 255, 255] : [47, 158, 103, 255]; });
const IKON2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#ff4b1f"/><path d="M9 22V10l14 6z" fill="#fff"/></svg>';

const sida = (titel, farg, kropp, ikon) => `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${titel}</title>${ikon || ''}
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;color:#0e2a47;background:#fff}header{background:${farg};color:#fff;padding:18px 20px;font-weight:700;font-size:18px}
main{padding:16px 20px}.msg{border:1px solid #d5dee8;border-radius:10px;padding:10px 12px;margin:0 0 10px}a,button{font:inherit}</style></head><body>${kropp}</body></html>`;

async function kor(rot, bilder) {
  const R = H.resultat();
  const sidhuvuden = {};
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    sidhuvuden[u] = req.headers;
    const html = (s) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(s); };
    if (u === '/chatt/') return html(sida('(3) Testchatt', '#2f9e67', `<header>Testchatt</header><main>
      <div class="msg"><b>Anna</b><br>Ses vi i kväll?</div><div class="msg"><b>Kalle</b><br>Jag tar med fika.</div><div class="msg"><b>Sara</b><br>Låter bra!</div>
      <p><a id="ut" href="/extern/" target="_blank">Öppna länk i ny flik</a> · <a id="intern" href="adraze://adblock">AdRaze-sida</a></p></main>
      <script>window.n = 0; setInterval(() => window.n++, 100);</script>`, '<link rel="icon" href="/ikon1.png" sizes="64x64">'));
    if (u === '/musik/') return html(sida('Testmusik', '#0e2a47', `<header>Testmusik</header><main><p id="ua"></p><p id="mob"></p></main>
      <script>document.getElementById('ua').textContent = navigator.userAgent; document.getElementById('mob').textContent = 'mobil: ' + (navigator.userAgentData && navigator.userAgentData.mobile);</script>`,
      '<link rel="icon" type="image/svg+xml" href="/flytt-ikon">'));
    if (u === '/notis/') return html(sida('Notistest', '#cf9128', `<header>Notistest</header><main><button id="be" onclick="Notification.requestPermission().then((r) => { document.title = 'svar:' + r; })">Slå på notiser</button></main>`));
    if (u === '/extern/') return html(sida('Extern sida', '#1d4a76', '<header>Extern sida</header>'));
    if (u === '/sajt/') return html(sida('Testkalender – vecka 45', '#2a5c8f', '<header>Testkalender</header><main><p>Måndag: tandläkare 9.00</p><p>Onsdag: fotboll 18.00</p></main>'));
    if (u === '/ikon1.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(IKON1); }
    if (u === '/ikon2.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end(IKON2); }
    // Ikonhämtningens gränser: omdirigering (följs, varje hopp kontrolleras), till en lokal fil (stoppas), för stort svar
    if (u === '/flytt-ikon') { res.writeHead(302, { location: '/ikon2.svg' }); return res.end(); }
    if (u === '/till-fil') { res.writeHead(302, { location: 'file:///etc/hostname' }); return res.end(); }
    if (u === '/stor') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.alloc(5000, 1)); }
    if (u === '/kaka') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BAS = 'http://127.0.0.1:' + srv.address().port;

  const x = await H.startaXvfb();
  const profil = H.tempDir('sidopanel');
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const p = H.starta(path.join(rot, 'node_modules', 'electron', 'dist', 'electron'), ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  const anslutna = [];
  try {
    await H.vantaPaPort(cdp);
    const shellT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!shellT);
    if (!shellT) return R;
    const S = await H.anslut(shellT.webSocketDebuggerUrl); anslutna.push(S);
    await S.skicka('Runtime.enable');
    const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl); anslutna.push(main);
    await main.skicka('Runtime.enable');
    const M = async (expr) => { const v = await main.kor(`(async () => { const el = process.mainModule.require('electron'); ${expr} })()`); return typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : v; };
    const vanta = async (fn, ms = 10000) => { for (let i = 0; i < ms / 150; i++) { const v = await fn(); if (v) return v; await H.sov(150); } return null; };
    await H.sov(2500);
    await S.kor(`(() => { const h = document.getElementById('hxintro'); if (h) h.remove(); document.querySelectorAll('.notis').forEach((n) => n.remove()); return 1; })()`);
    await H.sov(600);

    // Hjälpare mot huvudprocessen: panelens vyer, flikens vy och fönstrets läge
    const VYER = `const w = el.BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('shell.html') && !b.webContents.getURL().includes('incognito'));
      const barn = w ? w.contentView.children : [];
      const panel = barn.filter((v) => v.webContents && v.webContents.__sidopanel);
      const flik = barn.find((v) => v.webContents && v.webContents.__tabId != null && v.getVisible());`;
    const panelInfo = () => M(`${VYER} return JSON.stringify({ n: panel.length, vyer: panel.map((v) => ({ id: v.webContents.__sidopanel, syns: v.getVisible(), b: v.getBounds(), url: v.webContents.getURL(), tyst: v.webContents.isAudioMuted() })), flik: flik ? flik.getBounds() : null, fonster: w.getBounds() })`);
    const rekt = (sel) => S.kor(`JSON.stringify((() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })())`).then((s) => JSON.parse(s));
    const lika = (a, b) => !!a && !!b && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 1);
    const appar = () => S.kor(`JSON.stringify(Anpassa.get('sidopanel.appar', []))`).then((s) => JSON.parse(s));
    const setAppar = (l) => S.kor(`Anpassa.set('sidopanel.appar', ${JSON.stringify(l)}, 'test').then((r) => JSON.stringify(r))`);
    let fb = null;
    const dump = async (namn) => {
      await S.kor(`document.querySelectorAll('body > .notis').forEach((n) => n.remove()); 1`);   // AdRazes egna tips (huvudwebbläsare, flytta från Firefox) hör inte till bilden
      await H.sov(150);
      fb = (await panelInfo()).fonster;
      const fil = path.join(bilder, namn + '.png');
      try { execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'x11grab', '-video_size', fb.width + 'x' + fb.height, '-i', x.display + '+' + fb.x + ',' + fb.y, '-frames:v', '1', '-y', fil]); } catch (e) { R.ok('skärmdump ' + namn, false, String(e.message).slice(0, 120)); }
      return fil;
    };
    const mus = (...a) => execFileSync('xdotool', a.map(String), { env: { ...process.env, DISPLAY: x.display } });
    const dra = async (x0, y0, x1, y1, steg = 12) => {
      mus('mousemove', fb.x + x0, fb.y + y0); await H.sov(120); mus('mousedown', 1); await H.sov(120);
      for (let i = 1; i <= steg; i++) { mus('mousemove', Math.round(fb.x + x0 + (x1 - x0) * i / steg), Math.round(fb.y + y0 + (y1 - y0) * i / steg)); await H.sov(35); }
      await H.sov(150); mus('mouseup', 1); await H.sov(400);
    };

    // 1. Som standard syns ingen list (den tar ingen plats förrän du lagt till en app eller slagit på den)
    const lage = () => S.kor(`JSON.stringify({ rad: document.getElementById('views').parentElement.id, list: getComputedStyle(document.getElementById('sp-list')).display, plus: !!document.querySelector('#sp-list .sp-plus'), vx: Math.round(document.getElementById('views').getBoundingClientRect().x), lw: Math.round(document.getElementById('sp-list').getBoundingClientRect().width), visa: Anpassa.get('sidopanel.visa') })`).then((s) => JSON.parse(s));
    const fore = await lage();
    R.ok('standard: ingen list, webbytan börjar vid kanten', fore.rad === 'sp-rad' && fore.list === 'none' && fore.vx === 0 && fore.visa === false, fore);
    // Lätt att hitta: raden "Visa sidopanelen" i Inställningar › Anpassa slår på listen (tom, bara +)
    await S.kor(`openSettings(); showSettingsCat('anpassa'); document.getElementById('anp-sidopanel').scrollIntoView(); 1`);
    await H.sov(600);
    R.ok('Anpassa: raden "Visa sidopanelen" finns och är av', await S.kor(`(() => { const c = document.querySelector('#anp-sidopanel [data-sp="visa"]'); return !!c && c.checked === false; })()`));
    await S.kor(`document.querySelector('#anp-sidopanel [data-sp="visa"]').click(); 1`);
    await H.sov(600);
    await S.kor(`document.getElementById('settings-close').click(); 1`);
    await H.sov(500);
    const start = await lage();
    R.ok('påslagen: listen syns med en plusknapp', start.list === 'flex' && start.plus && start.visa === true, start);
    R.ok('påslagen: webbytan börjar efter listen', start.vx === start.lw && start.lw > 30, start);
    await dump('1-tom-list');

    // 2. Lägg till en app via panelens formulär → den öppnas direkt
    await S.kor(`document.querySelector('#sp-list .sp-plus').click(); 1`);
    await H.sov(400);
    R.ok('"Lägg till app" öppnas i panelen', await S.kor(`!document.querySelector('.sp-lagg-yta').hidden && getComputedStyle(document.getElementById('sp-panel')).display === 'flex'`));
    await dump('2-lagg-till');
    R.ok('ogiltig adress ger fel', await S.kor(`(() => { const f = document.querySelector('.sp-lagg-yta form'); f.elements.url.value = 'javascript:alert(1)'; f.requestSubmit(); return document.querySelector('.sp-lagg-yta .sp-fel').textContent.length > 5 && Anpassa.get('sidopanel.appar', []).length === 0; })()`));
    await S.kor(`(() => { const f = document.querySelector('.sp-lagg-yta form'); f.elements.url.value = '${BAS}/chatt/'; f.elements.namn.value = 'Testchatt'; f.requestSubmit(); return 1; })()`);
    const chattT = await H.mal(cdp, (t) => t.url.startsWith(BAS + '/chatt/'), 10000);
    R.ok('appen lades till och laddades i en egen vy', !!chattT);
    if (!chattT) return R;
    const C = await H.anslut(chattT.webSocketDebuggerUrl); anslutna.push(C);
    await C.skicka('Runtime.enable');
    const lista1 = await appar();
    R.ok('Anpassa: sidopanel.appar har appen', lista1.length === 1 && lista1[0].namn === 'Testchatt' && lista1[0].url === BAS + '/chatt/', lista1);
    const chattId = lista1[0].id;
    await vanta(async () => (await panelInfo()).vyer.some((v) => v.syns));
    await H.sov(500);
    let pi = await panelInfo();
    const vyR = await rekt('#sp-vy'), viewsR = await rekt('#views');
    R.ok('panelens vy ligger exakt på platshållaren', pi.vyer.length === 1 && pi.vyer[0].syns && lika(pi.vyer[0].b, vyR), { vy: pi.vyer[0] && pi.vyer[0].b, plats: vyR });
    R.ok('webbytan krymper (flikens vy börjar efter panelen)', !pi.flik || Math.abs(pi.flik.x - viewsR.x) <= 1, { flik: pi.flik, views: viewsR });
    R.ok('olästa-pricken syns ("(3)" i titeln)', !!(await vanta(() => S.kor(`!!document.querySelector('.sp-app.olast')`))));
    R.ok('ikonen hämtades och ritades om (64×64 PNG)', !!(await vanta(() => S.kor(`(() => { const i = document.querySelector('.sp-app img.sp-bild'); return !!i && i.src.startsWith('data:image/png') && i.naturalWidth === 64; })()`), 12000)));
    R.ok('ikonen sparades i profilen', !!(await vanta(async () => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(profil, 'config', 'AdRaze', 'adraze-sidopanel-ikoner.json'), 'utf8'))).includes(chattId); } catch { return false; } }, 4000)));

    // 3. Säkerhet: samma session som flikarna, sandlåda, ingen Node, inga interna sidor
    const sak = await M(`${VYER} const v = panel[0]; const wp = v.webContents.getLastWebPreferences() || {}; const flikWc = barn.find((b) => b.webContents && b.webContents.__tabId != null);
      return JSON.stringify({ sandbox: wp.sandbox, iso: wp.contextIsolation, node: wp.nodeIntegration, samma: !flikWc || flikWc.webContents.session === v.webContents.session, ctx: !!v.webContents.__ctx })`);
    R.ok('vyn: sandlåda, isolering, ingen Node', sak.sandbox === true && sak.iso === true && sak.node === false && sak.ctx, sak);
    R.ok('vyn delar flikarnas (kontots) session', sak.samma, sak);
    R.ok('ingen require/process i appen', (await C.kor(`typeof require + '/' + typeof process`)) === 'undefined/undefined');
    R.ok('flikarnas preload körs (samma Chrome-förklädnad)', String(await C.kor(`JSON.stringify(navigator.userAgentData.brands.map((b) => b.brand))`)).includes('Google Chrome'));
    // Ikonhämtningen i huvudprocessen: omdirigeringar kontrolleras hopp för hopp, inga kakor, storleksgräns
    const HM = (u, extra) => M(`const h = process.mainModule.require('./anpassa-sidopanel')._test.hamta; const r = await h(${JSON.stringify(u)}, { max: 4000, ms: 5000, privatOk: true, ...${JSON.stringify(extra || {})} }); return r ? JSON.stringify({ n: r.buf.length, url: r.url }) : null`);
    const flytt = await HM(BAS + '/flytt-ikon');
    R.ok('ikonhämtning: följer en vanlig omdirigering', !!flytt && flytt.url === BAS + '/ikon2.svg' && flytt.n === IKON2.length, flytt);
    R.ok('ikonhämtning: stoppar omdirigering till en lokal fil', (await HM(BAS + '/till-fil')) === null);
    R.ok('ikonhämtning: stoppar för stora svar', (await HM(BAS + '/stor')) === null);
    R.ok('ikonhämtning: privata adresser bara för appar som själva ligger där', (await HM(BAS + '/ikon1.png', { privatOk: false })) === null);
    await M(`await el.session.defaultSession.cookies.set({ url: ${JSON.stringify(BAS)}, name: 'hemlig', value: '1' }); return 1`);
    await HM(BAS + '/kaka');
    R.ok('ikonhämtning: skickar inga kakor', !!sidhuvuden['/kaka'] && !sidhuvuden['/kaka'].cookie, sidhuvuden['/kaka'] && sidhuvuden['/kaka'].cookie);
    await C.kor(`location.href = 'adraze://adblock'; 1`);
    await H.sov(1200);
    R.ok('appen kan inte navigera till adraze://', String(await C.kor('location.href')).startsWith(BAS + '/chatt/'));
    // En riktig klick på en target=_blank-länk i appen → ny flik i fönstret (inte i panelen)
    const lank = JSON.parse(await C.kor(`JSON.stringify((() => { const r = document.getElementById('ut').getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })())`));
    await C.skicka('Input.dispatchMouseEvent', { type: 'mousePressed', x: lank.x, y: lank.y, button: 'left', clickCount: 1 });
    await C.skicka('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lank.x, y: lank.y, button: 'left', clickCount: 1 });
    R.ok('länk med target=_blank öppnas som flik i fönstret', !!(await H.mal(cdp, (t) => t.url.startsWith(BAS + '/extern/'), 8000)));
    R.ok('panelen visar fortfarande appen', String(await C.kor('location.href')).startsWith(BAS + '/chatt/'));
    // Huvudets "Öppna i ny flik": det appen visar blir en vanlig flik
    await S.kor(`document.querySelector('.sp-huvud [data-g="flik"]').click(); 1`);
    R.ok('"Öppna i ny flik" ger en vanlig flik', !!(await H.mal(cdp, (t) => t.url.startsWith(BAS + '/chatt/') && t.id !== chattT.id, 8000)));
    await H.sov(600);
    await dump('3-app-oppen');

    // 4. Stäng panelen: vyn göms men lever (sover inte), webbytan blir hel igen
    await S.kor(`document.querySelector('.sp-app[data-id="${chattId}"]').click(); 1`);
    await H.sov(500);
    pi = await panelInfo();
    const n0 = await C.kor('window.n'); await H.sov(1500); const n1 = await C.kor('window.n');
    R.ok('stängd panel: vyn dold men kvar', pi.vyer.length === 1 && !pi.vyer[0].syns, pi.vyer);
    R.ok('stängd panel: appen fortsätter köra (ingen strypning)', n1 - n0 >= 10, { n0, n1 });
    R.ok('stängd panel: webbytan hel igen', (await rekt('#views')).x === start.vx);
    R.ok('igång-markering på ikonen', await S.kor(`document.querySelector('.sp-app[data-id="${chattId}"]').classList.contains('laddad')`));

    // 5. Mobilvy: en app med mobil-UA, mobila ledtrådar och smal panel
    const lista2 = (await appar()).concat({ id: 'testmusik01', namn: 'Testmusik', url: BAS + '/musik/', mobil: true, ljud: true });
    await setAppar(lista2);
    await H.sov(300);
    await S.kor(`document.querySelector('.sp-app[data-id="testmusik01"]').click(); 1`);
    const musikT = await H.mal(cdp, (t) => t.url.startsWith(BAS + '/musik/'), 10000);
    R.ok('andra appen öppnas', !!musikT);
    let Mu = null;
    if (musikT) {
      Mu = await H.anslut(musikT.webSocketDebuggerUrl); anslutna.push(Mu); await Mu.skicka('Runtime.enable');
      await vanta(() => Mu.kor(`document.readyState === 'complete'`));
      const mob = JSON.parse(await Mu.kor(`JSON.stringify({ ua: navigator.userAgent, mobil: navigator.userAgentData && navigator.userAgentData.mobile, plattform: navigator.userAgentData && navigator.userAgentData.platform, bredd: innerWidth })`));
      R.ok('mobilvy: Android-UA i sidan', /Android/.test(mob.ua) && /Mobile/.test(mob.ua), mob.ua);
      R.ok('mobilvy: userAgentData säger mobil', mob.mobil === true && mob.plattform === 'Android', mob);
      const hv = sidhuvuden['/musik/'] || {};
      R.ok('mobilvy: servern fick mobil-UA och sec-ch-ua-mobile ?1', /Android/.test(hv['user-agent'] || '') && hv['sec-ch-ua-mobile'] === '?1', { ua: hv['user-agent'], mob: hv['sec-ch-ua-mobile'], plat: hv['sec-ch-ua-platform'] });
      R.ok('mobilvy: smal panel (380 px)', Math.round((await rekt('#sp-panel')).width) === 380, await rekt('#sp-panel'));
      R.ok('flikarna har kvar skrivbordets ledtrådar', (sidhuvuden['/extern/'] || {})['sec-ch-ua-mobile'] === '?0', (sidhuvuden['/extern/'] || {})['sec-ch-ua-mobile']);
      pi = await panelInfo();
      R.ok('bara den öppna appens vy syns', pi.vyer.length === 2 && pi.vyer.filter((v) => v.syns).length === 1 && pi.vyer.find((v) => v.syns).id === 'testmusik01', pi.vyer.map((v) => [v.id, v.syns]));
      R.ok('SVG-ikonen hämtades också', !!(await vanta(() => S.kor(`!!document.querySelector('.sp-app[data-id="testmusik01"] img.sp-bild')`), 12000)));
    }

    // 6. Inställningar › Anpassa › Sidopanel: ljud av för chatten, listan och formuläret
    await S.kor(`openSettings(); showSettingsCat('anpassa'); document.getElementById('anp-sidopanel').scrollIntoView(); 1`);
    await H.sov(600);
    const inst = JSON.parse(await S.kor(`JSON.stringify({ rader: document.querySelectorAll('#anp-sidopanel .sp-irad').length, visa: !!document.querySelector('#anp-sidopanel [data-sp="visa"]'), form: !!document.querySelector('#anp-sidopanel .sp-inst-lagg form'), h3: (document.querySelector('#anp-sidopanel h3') || {}).textContent })`));
    R.ok('inställningarna: rubrik, av/på, två appar, formulär', inst.rader === 2 && inst.visa && inst.form && inst.h3 === 'Sidopanel', inst);
    await S.kor(`(() => { const c = document.querySelector('#anp-sidopanel .sp-irad[data-id="${chattId}"] [data-f="ljud"]'); c.click(); return 1; })()`);
    await H.sov(500);
    pi = await panelInfo();
    R.ok('ljud av: appens vy är tystad', !!pi.vyer.find((v) => v.id === chattId && v.tyst), pi.vyer.map((v) => [v.id, v.tyst]));
    R.ok('ljud av: sparat i Anpassa', (await appar()).find((a) => a.id === chattId).ljud === false);
    await dump('6-installningar');
    await S.kor(`document.getElementById('settings-close').click(); 1`);
    await H.sov(500);

    // 7. Byt ordning genom att dra ikonen (riktig mus i Xvfb)
    fb = (await panelInfo()).fonster;
    const ik1 = await rekt(`.sp-app[data-id="${chattId}"]`), ik2 = await rekt('.sp-app[data-id="testmusik01"]');
    await dra(ik2.x + ik2.width / 2, ik2.y + ik2.height / 2, ik1.x + ik1.width / 2, ik1.y + 4);
    const ordning = (await appar()).map((a) => a.id);
    R.ok('dra ikon: ordningen byttes', ordning[0] === 'testmusik01' && ordning[1] === chattId, ordning);
    R.ok('dra ikon: panelen öppnades/stängdes inte av dragningen', (await S.kor(`document.querySelector('.sp-app.oppen') && document.querySelector('.sp-app.oppen').dataset.id`)) === 'testmusik01');

    // 8. Dra i kanten: bredden ändras, sidan följer med och bredden sparas för appen
    const pr = await rekt('#sp-panel'), dg = await rekt('.sp-drag');
    await dra(dg.x + 2, dg.y + 200, dg.x + 2 + 120, dg.y + 200, 14);
    const pr2 = await rekt('#sp-panel'); const sparad = (await appar()).find((a) => a.id === 'testmusik01').bredd;
    R.ok('dra kanten: panelen blev bredare', pr2.width - pr.width >= 100, { fore: pr.width, efter: pr2.width });
    R.ok('dra kanten: bredden sparad för appen', sparad === pr2.width, { sparad, bredd: pr2.width });
    await H.sov(400);
    pi = await panelInfo();
    R.ok('dra kanten: vyn och webbytan följde med', lika(pi.vyer.find((v) => v.syns).b, await rekt('#sp-vy')) && (!pi.flik || Math.abs(pi.flik.x - (await rekt('#views')).x) <= 1), { vy: pi.vyer.find((v) => v.syns).b, plats: await rekt('#sp-vy'), flik: pi.flik });

    // 9. Fönstret ändrar storlek: allt följer med
    await M(`el.BrowserWindow.getAllWindows()[0].setSize(1100, 740); return 1`);
    await H.sov(900);
    pi = await panelInfo();
    R.ok('mindre fönster: vyn ligger kvar på platshållaren', lika(pi.vyer.find((v) => v.syns).b, await rekt('#sp-vy')), { vy: pi.vyer.find((v) => v.syns).b, plats: await rekt('#sp-vy') });
    await M(`el.BrowserWindow.getAllWindows()[0].setSize(1280, 820); return 1`);
    await H.sov(900);

    // 10. Något av skalet över panelen (sökförslagen): vyn göms och kommer tillbaka
    await S.kor(`(() => { const s = document.getElementById('omni-suggest'); s.style.cssText = 'left:60px;top:96px;width:520px;height:220px'; s.classList.add('on'); return 1; })()`);
    await H.sov(400);
    const skymd = (await panelInfo()).vyer.find((v) => v.id === 'testmusik01').syns;
    await S.kor(`(() => { const s = document.getElementById('omni-suggest'); s.classList.remove('on'); s.style.cssText = ''; return 1; })()`);
    await H.sov(400);
    R.ok('skymd av sökförslagen: vyn döljs och kommer tillbaka', skymd === false && (await panelInfo()).vyer.find((v) => v.id === 'testmusik01').syns === true);

    // 11. Flikens video i helskärm: panelen göms
    const extT = await H.mal(cdp, (t) => t.url.startsWith(BAS + '/extern/'));
    if (extT) {
      await S.kor(`(() => { const t = tabs.find((x) => (x.url || '').includes('/extern/')); if (t) switchTab(t); return 1; })()`);
      await H.sov(600);
      const E = await H.anslut(extT.webSocketDebuggerUrl); anslutna.push(E); await E.skicka('Runtime.enable');
      await E.skicka('Runtime.evaluate', { expression: 'document.documentElement.requestFullscreen().then(() => 1, (e) => String(e))', awaitPromise: true, userGesture: true });
      await H.sov(1200);
      const iHel = (await panelInfo()).vyer.find((v) => v.id === 'testmusik01').syns;
      await E.skicka('Runtime.evaluate', { expression: 'document.exitFullscreen().then(() => 1, () => 0)', awaitPromise: true, userGesture: true });
      await H.sov(1500);
      R.ok('flikens helskärm döljer panelen, efteråt syns den igen', iHel === false && (await panelInfo()).vyer.find((v) => v.id === 'testmusik01').syns === true, { iHel });
    } else R.ok('extern flik för helskärmstestet', false);
    // Appens egen helskärm (t.ex. en video i appen): vyn täcker hela fönstret, sedan tillbaka i panelen
    if (Mu) {
      const MV = `${VYER} const v = panel.find((x) => x.webContents.__sidopanel === 'testmusik01'); const i = barn.indexOf(v); const flikI = barn.findIndex((x) => x.webContents && x.webContents.__tabId != null);`;
      await Mu.skicka('Runtime.evaluate', { expression: 'document.documentElement.requestFullscreen().then(() => 1, (e) => String(e))', awaitPromise: true, userGesture: true });
      await H.sov(1500);
      const hel = await M(`${MV} const cb = w.getContentBounds(); return JSON.stringify({ b: v.getBounds(), cb: { width: cb.width, height: cb.height }, overst: i === barn.length - 1, syns: v.getVisible() })`);
      R.ok('appens helskärm: vyn täcker hela fönstret och ligger överst', hel.syns && hel.overst && hel.b.x === 0 && hel.b.y === 0 && hel.b.width === hel.cb.width && hel.b.height === hel.cb.height, hel);
      await Mu.skicka('Runtime.evaluate', { expression: 'document.exitFullscreen().then(() => 1, () => 0)', awaitPromise: true, userGesture: true });
      await H.sov(1800);
      const efter = await M(`${MV} return JSON.stringify({ b: v.getBounds(), underFlikar: flikI < 0 || i < flikI })`);
      R.ok('efter appens helskärm: tillbaka i panelen, under flikarnas vyer', lika(efter.b, await rekt('#sp-vy')) && efter.underFlikar, { efter, plats: await rekt('#sp-vy') });
    }

    // 12. Höger sida: listen längst till höger, panelen bredvid, webbytan till vänster
    await S.kor(`Anpassa.set('sidopanel.sida', 'hoger', 'test').then(() => 1)`);
    await H.sov(700);
    const lr = await rekt('#sp-list'), vr = await rekt('#views'), pnr = await rekt('#sp-panel');
    pi = await panelInfo();
    R.ok('höger: listen vid högerkanten, webbytan till vänster', vr.x === 0 && lr.x + lr.width === fb.width && pnr.x >= vr.x + vr.width - 1, { lr, vr, pnr });
    R.ok('höger: vyn följde med', lika(pi.vyer.find((v) => v.syns).b, await rekt('#sp-vy')) && (!pi.flik || pi.flik.x + pi.flik.width <= pnr.x + 1), { vy: pi.vyer.find((v) => v.syns).b, flik: pi.flik });
    await dump('12-hoger');
    await S.kor(`Anpassa.set('sidopanel.sida', 'vanster', 'test').then(() => 1)`);
    await H.sov(500);

    // 12b. Ihop med Anpassa › Flikar och Verktyg: listen ligger innanför flikpanelen på sidan och följer med när
    //      flikpanelen breddas eller verktygsraden flyttas ned (platsen ändras utan att storleken gör det)
    const ihop = async () => { const q = await panelInfo(); const v = q.vyer.find((y) => y.syns); return { vy: v && v.b, plats: await rekt('#sp-vy'), list: await rekt('#sp-list'), views: await rekt('#views'), flik: q.flik, flikpanel: await rekt('#tabstrip'), verktyg: await rekt('#toolbar') }; };
    const anp = (k, v) => S.kor(`Anpassa.set(${JSON.stringify(k)}, ${JSON.stringify(v)}, 'test').then(() => 1)`);
    await anp('flikar.lage', 'vertikal'); await H.sov(1000);
    let ih = await ihop();
    R.ok('flikar på sidan: listen börjar där flikpanelen slutar', !!ih.list && ih.flikpanel.x === 0 && ih.list.x === ih.flikpanel.width, ih);
    R.ok('flikar på sidan: appens vy och webbsidan på rätt plats', lika(ih.vy, ih.plats) && !!ih.flik && Math.abs(ih.flik.x - ih.views.x) <= 1 && ih.flik.x >= ih.plats.x + ih.plats.width, ih);
    await dump('12b-flikar-pa-sidan');
    const platsFore = ih.plats;
    await anp('flikar.vertikalBredd', 300); await H.sov(1000);
    ih = await ihop();
    R.ok('bredare flikpanel: listen och appens vy flyttar med', ih.list.x === ih.flikpanel.width && ih.plats.x === platsFore.x + 60 && lika(ih.vy, ih.plats), ih);
    await anp('verktyg.placering', 'nere'); await H.sov(1000);
    ih = await ihop();
    R.ok('verktygsraden längst ner: appens vy följer med', ih.plats.y < platsFore.y && lika(ih.vy, ih.plats) && ih.list.y + ih.list.height <= ih.verktyg.y + 1 && ih.verktyg.y > ih.plats.y, ih);
    await dump('12c-verktyg-nere');
    await anp('flikar.lage', 'upptill'); await H.sov(800);
    ih = await ihop();
    R.ok('flikar upptill + verktyg nere: appens vy följer med', lika(ih.vy, ih.plats) && ih.list.x === 0 && ih.list.y + ih.list.height <= ih.verktyg.y + 1, ih);
    await anp('verktyg.placering', 'uppe'); await anp('flikar.vertikalBredd', 240); await H.sov(1000);
    ih = await ihop();
    R.ok('tillbaka som förut: appens vy på platshållaren', lika(ih.vy, ih.plats) && ih.list.x === 0, ih);

    // 13. Behörighetsfråga från en app: visas i panelen, svaret går tillbaka till appen
    await setAppar((await appar()).concat({ id: 'testnotis01', namn: 'Notistest', url: BAS + '/notis/', mobil: false, ljud: true }));
    await H.sov(300);
    await S.kor(`document.querySelector('.sp-app[data-id="testnotis01"]').click(); 1`);
    const notisT = await H.mal(cdp, (t) => t.url.startsWith(BAS + '/notis/'), 10000);
    if (notisT) {
      const N = await H.anslut(notisT.webSocketDebuggerUrl); anslutna.push(N); await N.skicka('Runtime.enable');
      await vanta(() => N.kor(`document.readyState === 'complete'`));
      const kn = JSON.parse(await N.kor(`JSON.stringify((() => { const r = document.getElementById('be').getBoundingClientRect(); return { x: r.x + 8, y: r.y + 8 }; })())`));
      await N.skicka('Input.dispatchMouseEvent', { type: 'mousePressed', x: kn.x, y: kn.y, button: 'left', clickCount: 1 });
      await N.skicka('Input.dispatchMouseEvent', { type: 'mouseReleased', x: kn.x, y: kn.y, button: 'left', clickCount: 1 });
      R.ok('frågan visas i panelen', !!(await vanta(() => S.kor(`!document.querySelector('.sp-fraga').hidden`), 6000)));
      R.ok('flikens frågerad används inte', await S.kor(`getComputedStyle(document.getElementById('permbar')).display === 'none'`));
      await H.sov(300);
      pi = await panelInfo();
      R.ok('vyn flyttas ned under frågan', lika(pi.vyer.find((v) => v.syns).b, await rekt('#sp-vy')));
      await dump('13-fraga');
      await S.kor(`document.querySelector('.sp-fraga .sp-f-ja').click(); 1`);
      R.ok('svaret når appen (granted)', !!(await vanta(async () => (await N.kor('document.title')) === 'svar:granted', 5000)), await N.kor('document.title'));
    } else R.ok('notisappen öppnades', false);

    // 14. Mörkt läge
    await S.kor(`document.querySelector('.sp-app[data-id="${chattId}"]').click(); 1`);
    await H.sov(300);
    await S.kor(`setTheme('dark'); 1`);
    await H.sov(700);
    await dump('14-mork');
    await S.kor(`setTheme('light'); 1`);
    await H.sov(300);

    // 15. Högerklicksmenyn finns (systemmeny) – och ta bort via Anpassa river vyn
    await setAppar((await appar()).filter((a) => a.id !== 'testnotis01'));
    await H.sov(600);
    pi = await panelInfo();
    R.ok('borttagen app: vyn rivs', !pi.vyer.some((v) => v.id === 'testnotis01') && !(await S.kor(`!!document.querySelector('.sp-app[data-id="testnotis01"]')`)));

    // 16. Riktigt tangentbord i panelen: zoom gäller appen, webbläsarens kortkommandon (Ctrl+Shift+N) fungerar ändå
    fb = (await panelInfo()).fonster;
    const vyK = await rekt('#sp-vy');
    mus('mousemove', fb.x + vyK.x + 40, fb.y + vyK.y + vyK.height - 60); await H.sov(100); mus('click', 1); await H.sov(400);
    const zoom = () => M(`${VYER} const v = panel.find((x) => x.webContents.__sidopanel === '${chattId}'); return v ? v.webContents.getZoomLevel() : null`);
    mus('key', 'ctrl+equal'); await H.sov(500);
    const z1 = await zoom();
    mus('key', 'ctrl+0'); await H.sov(500);
    const z0 = await zoom();
    R.ok('Ctrl+= och Ctrl+0 i panelen zoomar appen', z1 > 0 && z0 === 0, { z1, z0 });
    // Inkognito: ingen sidopanel
    mus('key', 'ctrl+shift+n');
    const inkT = await H.mal(cdp, (t) => t.url.includes('shell.html') && t.url.includes('incognito'), 10000);
    if (inkT) {
      const I = await H.anslut(inkT.webSocketDebuggerUrl); anslutna.push(I); await I.skicka('Runtime.enable');
      await vanta(() => I.kor(`document.readyState === 'complete'`));
      await H.sov(800);
      R.ok('inkognito: ingen lista', (await I.kor(`getComputedStyle(document.getElementById('sp-list')).display`)) === 'none');
      R.ok('inkognito: huvudprocessen säger nej', JSON.parse(await I.kor(`JSON.stringify(window.anpassaSidopanel.tillstand())`)).tillaten === false);
      R.ok('inkognito: inga panelvyer i fönstret', (await M(`const w = el.BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('incognito')); return w ? w.contentView.children.filter((v) => v.webContents && v.webContents.__sidopanel).length : -1`)) === 0);
      await M(`const w = el.BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('incognito')); if (w) w.destroy(); return 1`);
      await H.sov(500);
    } else R.ok('inkognitofönster öppnades', false);

    // 17. Barnläge: allt rivs, listen försvinner, nycklarna är låsta – och kommer tillbaka efteråt
    await S.kor(`window.view.barnRegler({ last: false, blocklist: ['spärrad.example'], allows: [] }); 1`);
    await H.sov(900);
    pi = await panelInfo();
    R.ok('barnläge: inga panelvyer kvar', pi.n === 0, pi.vyer);
    R.ok('barnläge: listen dold', (await S.kor(`getComputedStyle(document.getElementById('sp-list')).display`)) === 'none');
    R.ok('barnläge: webbytan tar hela bredden', (await rekt('#views')).x === 0);
    R.ok('barnläge: sidopanel.* går inte att ändra', JSON.parse(await S.kor(`Anpassa.set('sidopanel.visa', false, 'test').then((r) => JSON.stringify(r))`)).error === 'barnlast');
    R.ok('barnläge: huvudprocessen vägrar öppna', await (async () => { await S.kor(`window.anpassaSidopanel.oppna('${chattId}', { x: 60, y: 100, width: 300, height: 300 }); 1`); await H.sov(800); return (await panelInfo()).n === 0; })());
    await dump('17-barnlage');
    await S.kor(`window.view.barnRegler(null); 1`);
    await H.sov(900);
    R.ok('efter barnläget: listen tillbaka', (await S.kor(`getComputedStyle(document.getElementById('sp-list')).display`)) === 'flex');

    // 18. Dölj sidopanelen helt: listen borta, appar avslutade
    await S.kor(`document.querySelector('.sp-app[data-id="${chattId}"]').click(); 1`);
    await vanta(async () => (await panelInfo()).n === 1);
    await S.kor(`Anpassa.set('sidopanel.visa', false, 'test').then(() => 1)`);
    await H.sov(700);
    R.ok('dold sidopanel: ingen lista och inga vyer', (await S.kor(`getComputedStyle(document.getElementById('sp-list')).display`)) === 'none' && (await panelInfo()).n === 0);
    await S.kor(`Anpassa.angra().then(() => 1)`);
    await H.sov(500);
    R.ok('ångra: listen tillbaka', (await S.kor(`getComputedStyle(document.getElementById('sp-list')).display`)) === 'flex');

    // 19. "Avsluta app" i menyn: vyn rivs, panelen stängs och igång-markeringen försvinner
    await S.kor(`document.querySelector('.sp-app[data-id="${chattId}"]').click(); 1`);
    await vanta(async () => (await panelInfo()).vyer.some((v) => v.id === chattId && v.syns));
    await S.kor(`window.anpassaSidopanel.gor('${chattId}', 'avsluta'); 1`);
    await H.sov(700);
    R.ok('avsluta app: vyn borta och panelen stängd', (await panelInfo()).n === 0 && (await S.kor(`!document.querySelector('.sp-app.laddad') && getComputedStyle(document.getElementById('sp-panel')).display === 'none'`)));

    // 19b. Sidans högerklicksmeny (riktig högerklick i fliken): "Lägg till i sidopanelen" gör sajten till en app och
    //      slår på listen om den var av; finns sajten redan blir valet "Öppna i sidopanelen"
    const NF = (u, t) => M(`return process.mainModule.require('./anpassa-sidopanel')._test.namnFor(${JSON.stringify(u)}, ${JSON.stringify(t)})`);
    R.ok('namn ur sidan: känd app, titelns första del, annars domänen', (await NF('https://open.spotify.com/', 'Spotify – Web Player')) === 'Spotify'
      && (await NF('https://exempel.se/inkorg', '(3) Inkorg - Exempelpost')) === 'Inkorg' && (await NF('https://www.svt.se/', '')) === 'Svt', [await NF('https://exempel.se/inkorg', '(3) Inkorg - Exempelpost'), await NF('https://www.svt.se/', '')]);
    await M(`if (!global.__spBygg) { global.__spBygg = el.Menu.buildFromTemplate; el.Menu.buildFromTemplate = (t) => { const m = global.__spBygg.call(el.Menu, t); global.__spMeny = t; m.popup = () => {}; return m; }; } global.__spMeny = null; return 1`);
    const menyEtiketter = () => M(`return JSON.stringify({ l: (global.__spMeny || []).map((i) => i.label || '-') })`).then((r) => (r && r.l) || []);
    const hogerklick = async () => {
      await M(`global.__spMeny = null; return 1`);
      fb = (await panelInfo()).fonster; const v = await rekt('#views');
      mus('mousemove', fb.x + v.x + Math.round(v.width / 2), fb.y + v.y + 220); await H.sov(150); mus('click', 3); await H.sov(700);
      return menyEtiketter();
    };
    await S.kor(`Anpassa.set('sidopanel.visa', false, 'test').then(() => 1)`);
    await H.sov(500);
    const LOK = BAS.replace('127.0.0.1', 'localhost');
    await S.kor(`createTab('${LOK}/sajt/?kod=hemlig#topp'); 1`);
    const sajtT = await H.mal(cdp, (t) => t.url.startsWith(LOK + '/sajt/'), 10000);
    await H.sov(900);
    const m1 = sajtT ? await hogerklick() : [];
    R.ok('högerklick på en sida: "Lägg till i sidopanelen"', m1.includes('Lägg till i sidopanelen'), m1);
    await M(`const it = (global.__spMeny || []).find((i) => i.label === 'Lägg till i sidopanelen'); if (it) it.click(); return 1`);
    await H.sov(800);
    const ny = (await appar()).find((a) => a.url.startsWith(LOK));
    R.ok('sajten blev en app (namn ur titeln, adress utan ?kod och #)', !!ny && ny.namn === 'Testkalender' && ny.url === LOK + '/sajt/', ny);
    R.ok('listen slogs på av sig själv', (await S.kor(`Anpassa.get('sidopanel.visa') === true && getComputedStyle(document.getElementById('sp-list')).display === 'flex' && !!document.querySelector('.sp-app[data-id="${ny && ny.id}"]')`)) === true);
    R.ok('besked: "Tillagd i sidopanelen"', String(await S.kor(`document.getElementById('apptoast').textContent`)).startsWith('Tillagd i sidopanelen'));
    const m2 = await hogerklick();
    R.ok('finns redan: "Öppna i sidopanelen" i stället', m2.includes('Öppna i sidopanelen') && !m2.includes('Lägg till i sidopanelen'), m2);
    await M(`const it = (global.__spMeny || []).find((i) => i.label === 'Öppna i sidopanelen'); if (it) it.click(); return 1`);
    R.ok('"Öppna i sidopanelen" öppnar appen', !!(await vanta(async () => (await panelInfo()).vyer.some((v) => v.syns && v.url.startsWith(LOK + '/sajt/')), 8000)));
    await H.sov(600);
    await dump('19b-hogerklick');
    // 19c. Inkognitoflik i ett vanligt fönster: inget sidopanelsval alls – sajten får aldrig sparas som app
    //      (samma värd är redan en app, så en vanlig flik hade fått "Öppna i sidopanelen")
    const antalFore = (await appar()).length;
    await S.kor(`createTab('${LOK}/sajt/?inkognito=1', true); 1`);
    const inkFlik = await H.mal(cdp, (t) => t.url.includes('inkognito=1'), 10000);
    await H.sov(900);
    const m3 = inkFlik ? await hogerklick() : [];
    R.ok('inkognitoflik: inget sidopanelsval i högerklicksmenyn', m3.length > 0 && !m3.some((l) => /sidopanelen/.test(l)), m3);
    R.ok('inkognitoflik: applistan orörd', (await appar()).length === antalFore);
    await M(`if (global.__spBygg) { el.Menu.buildFromTemplate = global.__spBygg; delete global.__spBygg; } return 1`);

    // 19d. Rader som andra delar lägger in "före #views" (galleriets "Du provar …") hamnar ovanför raden runt
    //      webbytan, inte bredvid sidan inne i den; det som läggs efter webbytan hamnar under raden
    const RI = JSON.parse(await S.kor(`(async () => {
      const rad = document.getElementById('sp-rad'), views = document.getElementById('views');
      const fore = document.createElement('div'); fore.id = 'sp-test-fore'; fore.style.height = '30px'; rad.insertBefore(fore, views);
      const efter = document.createElement('div'); efter.id = 'sp-test-efter'; rad.appendChild(efter);
      await new Promise((r) => setTimeout(r, 100));
      const ut = { fore: [fore.parentNode && fore.parentNode.id, fore.nextElementSibling && fore.nextElementSibling.id],
        efter: [efter.parentNode && efter.parentNode.id, efter.previousElementSibling && efter.previousElementSibling.id],
        avstand: Math.round(views.getBoundingClientRect().top - fore.getBoundingClientRect().bottom), barn: [...rad.children].map((n) => n.id) };
      fore.remove(); efter.remove();
      const g = document.getElementById('gal-provbar'); ut.galleri = g ? (g.nextElementSibling && g.nextElementSibling.id) : 'saknas';
      return JSON.stringify(ut); })()`));
    R.ok('andra delars rader: före webbytan → ovanför raden, efter → under den', RI.fore[0] !== 'sp-rad' && RI.fore[1] === 'sp-rad' && RI.efter[0] !== 'sp-rad' && RI.efter[1] === 'sp-rad'
      && RI.avstand >= 0 && RI.barn.every((id) => ['sp-list', 'sp-panel', 'views'].includes(id)), RI);
    R.ok('galleriets "Du provar …" ligger ovanför raden', RI.galleri === 'sp-rad' || RI.galleri === 'saknas', RI.galleri);

    // 20. Loggen och skalet: inga nekade kanaler, inga JS-fel
    let text = fs.readFileSync(logg, 'utf8');
    try { text += '\n' + fs.readFileSync(path.join(profil, 'config', 'AdRaze', 'fel.log'), 'utf8'); } catch {}
    const nekade = text.split('\n').filter((r) => r.includes('[ipc] nekad'));
    R.ok('inga IPC-kanaler nekade', !nekade.length, nekade);
    const fel = S.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet', !fel.length, fel);
    R.ok('inga fel från sidopanelen i huvudprocessen', !/anpassa-sidopanel\.js/.test(text), text.split('\n').filter((r) => /anpassa-sidopanel/.test(r)).slice(0, 3));
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    for (const a of anslutna) a.stang();
    await H.stang(p);
    x.stoppa();
    srv.close();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--bilder');
  const bilder = i >= 0 ? path.resolve(a[i + 1]) : H.tempDir('sidopanel-bilder');
  if (i >= 0) a.splice(i, 2);
  fs.mkdirSync(bilder, { recursive: true });
  kor(path.resolve(a[0] || path.join(__dirname, '..', '..')), bilder).then((R) => {
    console.log(R.text());
    console.log('Skärmdumpar: ' + bilder);
    process.exit(R.fel.length ? 1 : 0);
  });
}
