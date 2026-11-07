// Test: Anpassa › Arbetsytor. Kör: node tools/test/anpassa-arbetsytor.js [mapp för skärmdumpar]
// Startar dev-appen OSYNLIGT (egen Xvfb) med en egen profil och en liten lokal webbserver som loggar vilka sidor
// som hämtas – så syns det att flikar i en arbetsyta du inte står i aldrig laddas.
// Testar: skapa i Inställningar och i väljaren, byta, minnas flikar och vald flik, vilande flikar, flytta en flik,
// ta bort + ångra, omstart, ett andra fönster, inkognito (ingen väljare), barnläge (spärren gäller, ytorna fungerar)
// och att läget sparas per konto.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const H = require('./hjalp');

const R = path.resolve(__dirname, '..', '..');
const BILDER = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'adraze-arbetsytor-bilder-'));
const ELECTRON = path.join(R, 'node_modules/electron/dist/electron');
const res = H.resultat();

// Lokal webbserver: /namn → en sida med titeln "namn"
const hamtade = [];
const server = http.createServer((q, r) => {
  const namn = decodeURIComponent(q.url.slice(1).split('?')[0]);
  if (namn !== 'favicon.ico') hamtade.push(namn);
  r.writeHead(namn === 'favicon.ico' ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' });
  r.end('<!doctype html><meta charset="utf-8"><title>' + namn + '</title><body style="font:24px sans-serif;padding:40px">Sidan ' + namn + '</body>');
});

async function startaApp(x, profil, logg) {
  const port = await H.ledigPort(), iport = await H.ledigPort();
  const p = H.starta(ELECTRON, ['--inspect=' + iport, R, '--remote-debugging-port=' + port], H.testMiljo(x.display, profil), logg);
  await H.vantaPaPort(port);
  const t = await H.mal(port, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'));
  if (!t) throw new Error('skalet startade inte');
  const s = await H.anslut(t.webSocketDebuggerUrl);
  await s.skicka('Runtime.enable');
  await s.skicka('Emulation.setFocusEmulationEnabled', { enabled: true });
  await H.vantaPaPort(iport);
  const mt = await H.mal(iport, () => true);
  const m = await H.anslut(mt.webSocketDebuggerUrl);
  await H.sov(1800);
  await stadaSkal(s);
  return { p, port, s, m, mal: t };
}
// Stäng appen snällt. Inspektorn i huvudprocessen måste kopplas från först – annars väntar Node på den.
async function stoppaApp(app) { try { app.m.stang(); app.s.stang(); } catch {} await H.sov(300); return H.stang(app.p); }
// Bort med introt och notiserna "Gör AdRaze till huvudwebbläsare" / "Kommer du från …" (de ligger över det vi testar)
const stadaSkal = (s) => s.kor(`(() => {
  try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 864e5)); localStorage.setItem('adraze-flytt-erbjuden', '1'); } catch {}
  try { localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true; } catch {}   // ingen "Stäng alla flikar?" när testet avslutar
  for (const id of ['hxintro', 'defbrowser-banner', 'flytt-banner']) { const e = document.getElementById(id); if (e) e.remove(); }
  return 1; })()`);

async function klick(s, sel) {
  const r = await s.kor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2, o = document.elementFromPoint(x, y);
    return { x, y, synlig: b.width > 0 && b.height > 0, overst: o && o !== e && !e.contains(o) ? (o.id ? '#' + o.id : String(o.className || o.tagName)).slice(0, 80) : '' }; })()`);
  if (!r || typeof r !== 'object') throw new Error('hittar inte ' + sel);
  if (!r.synlig || r.overst) res.ok('klicket når ' + sel, false, r);   // något annat ligger över (eller elementet syns inte)
  for (const type of ['mousePressed', 'mouseReleased']) await s.skicka('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await H.sov(150);
}
// Vänta tills villkoret (async) är sant, högst ms – så att testet inte hänger på exakta väntetider när datorn är upptagen
async function vanta(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await H.sov(100); }
  return false;
}
const oppnaMenyn = async (s) => {
  for (let i = 0; i < 3; i++) {
    await klick(s, '#ws-vaxlare');
    if (await vanta(() => s.kor(`!!document.querySelector('#ws-meny .ws-rad')`), 2000)) return true;
  }
  return false;
};
async function skriv(s, text) { await s.skicka('Input.insertText', { text }); await H.sov(80); }
async function tangent(s, key, code, vk, modifiers = 0) {
  const text = key === 'Enter' ? '\r' : undefined;   // Enter skickar ett tecken också (så att formulär skickas)
  for (const type of [text ? 'keyDown' : 'rawKeyDown', 'keyUp']) await s.skicka('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers, ...(text && type === 'keyDown' ? { text } : {}) });
  await H.sov(150);
}
// Ett kortkommando som om du tryckt det i fönstret: samma väg som tangentbordet (before-input-event i huvudprocessen)
const kortkommando = (m, key, shift) => m.kor(`(() => {
  const wc = process.mainModule.require('electron').webContents.getAllWebContents().find((w) => /shell\\.html/.test(w.getURL()) && !/incognito/.test(w.getURL()));
  wc.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: ${JSON.stringify(key)}, control: true, shift: ${!!shift}, meta: false, alt: false });
  return 1; })()`);
async function bild(s, namn) {
  const r = await s.skicka('Page.captureScreenshot', { format: 'png' });
  if (r.result && r.result.data) fs.writeFileSync(path.join(BILDER, namn), Buffer.from(r.result.data, 'base64'));
}
const flikar = (s) => s.kor(`JSON.stringify(tabs.filter((t) => !t.isSettings).map((t) => ({ id: t.id, url: t.url, aktiv: t === active })))`).then(JSON.parse);
// Adresserna som har en riktig, laddad sida i huvudprocessen just nu
const laddade = (m) => m.kor(`process.mainModule.require('electron').webContents.getAllWebContents().map((w) => w.getURL()).filter((u) => /^http:\\/\\/(127\\.0\\.0\\.1|localhost):/.test(u))`);
const namnPa = (urls) => (urls || []).map((u) => String(u).replace(/^.*\//, '')).sort();

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const SP = server.address().port;
  const U = (n) => 'http://127.0.0.1:' + SP + '/' + n;
  const x = await H.startaXvfb();
  const profil = H.tempDir('arbetsytor');
  const logg = path.join(profil, 'logg.txt');
  let app = null;
  try {
    app = await startaApp(x, profil, logg);
    let { s, m } = app;

    // 1. En enda arbetsyta: ingen väljare
    res.ok('en arbetsyta: väljaren syns inte', await s.kor(`document.getElementById('brandbar').classList.contains('hidden') && !document.getElementById('ws-vaxlare')`));
    res.ok('nycklarna är registrerade', await s.kor(`JSON.stringify(Anpassa.get('arbetsytor.lista')) === JSON.stringify([{ id: 'hem', namn: 'Hem', ikon: 'hem', farg: '#0e2a47' }]) && Anpassa.get('arbetsytor.vaxlare') === true`));

    // Två flikar i Hem
    await s.kor(`createTab(${JSON.stringify(U('hem1'))}); createTab(${JSON.stringify(U('hem2'))}); 1`);
    await H.sov(1500);

    // 2. Skapa "Skola" i Inställningar › Anpassa
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(700);
    await stadaSkal(s);
    await klick(s, '#ws-ny');
    await skriv(s, 'Skola');
    await klick(s, '#anp-arbetsytor .ws-ikonval[data-ikon="skola"]');
    await klick(s, '#anp-arbetsytor .ws-fargval[data-farg="#1d6fd8"]');
    await s.kor(`document.querySelector('#anp-arbetsytor .ws-red').scrollIntoView({ block: 'center' }); 1`);
    await H.sov(300);
    await bild(s, 'arbetsytor-1-ny-i-installningar.png');
    await klick(s, '#anp-arbetsytor .ws-red-spara');
    await H.sov(400);
    const lista1 = await s.kor(`JSON.stringify(Arbetsytor.lista())`).then(JSON.parse);
    const skola = lista1.find((y) => y.namn === 'Skola');
    res.ok('Skola skapad med ikon och färg', !!skola && skola.ikon === 'skola' && skola.farg === '#1d6fd8', lista1);
    res.ok('väljaren syns i flikraden med Hem', await s.kor(`(() => { const b = document.getElementById('ws-vaxlare'); return !!b && !document.getElementById('brandbar').classList.contains('hidden') && b.textContent.includes('Hem'); })()`));
    await s.kor(`document.getElementById('anp-arbetsytor').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    await bild(s, 'arbetsytor-2-lista.png');

    // 3. Tillbaka till hem1, skapa "Spel" i väljarens meny (den nya ytan öppnas direkt)
    await s.kor(`closeSettings(); switchTab(tabs.find((t) => t.url && t.url.endsWith('/hem1'))); 1`);
    await H.sov(500);
    await oppnaMenyn(s);
    res.ok('menyn öppnas', await s.kor(`!!document.getElementById('ws-meny') && document.querySelectorAll('#ws-meny .ws-rad[data-id]').length === 2`));
    await bild(s, 'arbetsytor-3-meny.png');
    await klick(s, '#ws-meny .ws-ny');
    await skriv(s, 'Spel');
    await tangent(s, 'Enter', 'Enter', 13);
    await H.sov(700);
    const spel = (await s.kor(`JSON.stringify(Arbetsytor.lista())`).then(JSON.parse)).find((y) => y.namn === 'Spel');
    res.ok('Spel skapad i menyn och öppen', !!spel && (await s.kor(`Arbetsytor.aktiv()`)) === spel.id);
    res.ok('Spel fick handkontrollen som ikon (efter namnet)', !!spel && spel.ikon === 'spel', spel);
    const f3 = await flikar(s);
    res.ok('Spel börjar med en ny tom flik', f3.length === 1 && !f3[0].url, f3);
    res.ok('Hems flikar är stängda i huvudprocessen', !namnPa(await laddade(m)).some((n) => n.startsWith('hem')), await laddade(m));

    // 4. Tre flikar i Spel, spel2 vald
    await s.kor(`for (const n of ['spel1', 'spel2', 'spel3']) createTab('${U('')}' + n); 1`);
    await H.sov(1500);
    await s.kor(`(() => { const tom = tabs.find((t) => !t.url && !t.isSettings); if (tom) closeTab(tom); switchTab(tabs.find((t) => t.url && t.url.endsWith('/spel2'))); return 1; })()`);
    await H.sov(600);

    // 5. Byt till Hem: bara den valda fliken (hem1) laddas, hem2 vilar
    hamtade.length = 0;
    await oppnaMenyn(s);
    await klick(s, '#ws-meny .ws-rad[data-id="hem"]');
    await vanta(async () => (await s.kor(`Arbetsytor.aktiv()`)) === 'hem' && hamtade.includes('hem1'));
    await H.sov(800);   // hinner något mer hämtas syns det nu
    const f5 = await flikar(s);
    res.ok('Hem har sina flikar igen', JSON.stringify(f5.map((t) => t.url)) === JSON.stringify([U('hem1'), U('hem2')]), f5);
    res.ok('Hem minns vald flik (hem1)', (f5.find((t) => t.aktiv) || {}).url === U('hem1'), f5);
    res.ok('bara den valda fliken hämtades', JSON.stringify(hamtade) === JSON.stringify(['hem1']), [...hamtade]);
    res.ok('Spels flikar är stängda (sparar minne)', !namnPa(await laddade(m)).some((n) => n.startsWith('spel')), await laddade(m));
    res.ok('vilande flik ritas som sovande (blekare)', await s.kor(`(() => { const t = tabs.find((t) => t.url && t.url.endsWith('/hem2')); const el = t && document.querySelector('#tabs [data-tabid="' + t.id + '"]'); return !!el && el.classList.contains('anp-sover'); })()`));
    await bild(s, 'arbetsytor-4-hem.png');
    // Klicka på hem2: först nu hämtas den
    await s.kor(`switchTab(tabs.find((t) => t.url && t.url.endsWith('/hem2'))); 1`);
    await vanta(() => hamtade.includes('hem2'));
    res.ok('vilande flik laddas när du väljer den', hamtade.includes('hem2'), [...hamtade]);
    await s.kor(`switchTab(tabs.find((t) => t.url && t.url.endsWith('/hem1'))); 1`);
    await H.sov(300);

    // Flikgrupper följer med: hem2 i en ny grupp (som "Lägg i ny grupp" i flikens meny), byt bort och tillbaka
    const hem2 = await s.kor(`tabs.find((t) => t.url && t.url.endsWith('/hem2')).id`);
    await m.kor(`(() => { const wc = process.mainModule.require('electron').webContents.getAllWebContents().find((w) => /shell\\.html/.test(w.getURL()) && !/incognito/.test(w.getURL())); wc.send('tab-action', 'grupp-ny', ${hem2}); return 1; })()`);
    await vanta(() => s.kor(`!!(tabs.find((t) => t.id === ${hem2}) || {}).grupp`), 3000);
    await H.sov(300);
    await s.kor(`document.activeElement && document.activeElement.blur(); 1`);   // namnrutan i gruppens rubrik
    const grupp = await s.kor(`(tabs.find((t) => t.id === ${hem2}) || {}).grupp || ''`);
    res.ok('flikgrupp: hem2 ligger i en ny grupp', !!grupp, grupp);
    await s.kor(`Arbetsytor.vaxla(${JSON.stringify(skola.id)})`);
    await H.sov(800);
    res.ok('flikgrupp: gruppen finns kvar medan dess flik ligger i en annan arbetsyta', await s.kor(`(Anpassa.get('flikar.grupper') || []).some((g) => g.id === ${JSON.stringify(grupp)}) && Arbetsytor.vilandeGrupper().has(${JSON.stringify(grupp)})`));
    await s.kor(`Arbetsytor.vaxla('hem')`);
    await vanta(async () => (await s.kor(`Arbetsytor.aktiv()`)) === 'hem');
    await H.sov(500);
    res.ok('flikgrupp: tillbaka i Hem ligger hem2 i sin grupp igen', await s.kor(`(() => { const t = tabs.find((t) => t.url && t.url.endsWith('/hem2')); return !!t && t.grupp === ${JSON.stringify(grupp)} && !!document.querySelector('#tabs [data-grupp="${grupp}"]'); })()`));
    await bild(s, 'arbetsytor-4b-flikgrupp.png');

    // 6. Tillbaka till Spel: spel2 vald, spel1/spel3 vilar
    hamtade.length = 0;
    res.ok('byta med Arbetsytor.vaxla', await s.kor(`Arbetsytor.vaxla(${JSON.stringify(spel.id)})`));
    await vanta(() => hamtade.includes('spel2'));
    await H.sov(800);
    const f6 = await flikar(s);
    res.ok('Spel minns sina tre flikar och spel2', f6.length === 3 && (f6.find((t) => t.aktiv) || {}).url === U('spel2'), f6);
    res.ok('bara spel2 hämtades', JSON.stringify(hamtade) === JSON.stringify(['spel2']), [...hamtade]);

    // Huvudmenyn (≡) › Arbetsytor: bock på fönstrets arbetsyta, byta, ny
    const menyn = (fn) => m.kor(`(() => { const el = process.mainModule.require('electron');
      const wc = el.webContents.getAllWebContents().find((w) => w.__ctx && w.__ctx.win && !w.__ctx.win.isDestroyed() && /shell\\.html/.test(w.__ctx.win.webContents.getURL()));
      const rader = process.mainModule.require('./anpassa-arbetsytor').menyRader(wc.__ctx, (s) => s)[0].submenu;
      return (${fn})(rader); })()`);
    const meny = await menyn(`(r) => JSON.stringify(r.map((x) => ({ label: x.label, checked: !!x.checked, type: x.type || '' })))`).then(JSON.parse);
    res.ok('huvudmenyn: Arbetsytor med bock på den öppna', JSON.stringify(meny.slice(0, 3)) === JSON.stringify([{ label: 'Hem', checked: false, type: 'radio' }, { label: 'Skola', checked: false, type: 'radio' }, { label: 'Spel', checked: true, type: 'radio' }]) && meny.some((x) => x.label === 'Ny arbetsyta…') && meny.some((x) => x.label === 'Hantera arbetsytor'), meny);
    await menyn(`(r) => { r.find((x) => x.label === 'Hem').click(); return 1; }`);
    await vanta(async () => (await s.kor(`Arbetsytor.aktiv()`)) === 'hem', 4000);
    res.ok('huvudmenyn: byter arbetsyta', (await s.kor(`Arbetsytor.aktiv()`)) === 'hem');
    await menyn(`(r) => { r.find((x) => x.label === 'Ny arbetsyta…').click(); return 1; }`);
    await vanta(() => s.kor(`!!document.querySelector('#anp-arbetsytor .ws-red[data-red="ny"]') && !document.getElementById('settings').classList.contains('hidden')`), 4000);
    res.ok('huvudmenyn: "Ny arbetsyta…" öppnar Inställningar med rutan', await s.kor(`!!document.querySelector('#anp-arbetsytor .ws-red[data-red="ny"]') && !document.getElementById('settings').classList.contains('hidden')`));
    await s.kor(`closeSettings(); Arbetsytor.vaxla(${JSON.stringify(spel.id)})`);
    await H.sov(1000);

    // 7. Flytta spel3 till Skola
    await s.kor(`switchTab(tabs.find((t) => t.url && t.url.endsWith('/spel3'))); 1`);
    await H.sov(500);
    await oppnaMenyn(s);
    await bild(s, 'arbetsytor-5-meny-flytta.png');
    await klick(s, `#ws-meny .ws-flytta[data-flytta="${skola.id}"]`);
    await H.sov(500);
    const f7 = await flikar(s);
    const lage7 = await s.kor(`JSON.stringify(Arbetsytor.lage())`).then(JSON.parse);
    res.ok('fliken flyttades från Spel', f7.length === 2 && !f7.some((t) => t.url === U('spel3')), f7);
    res.ok('fliken ligger i Skola', !!lage7.ytor[skola.id] && lage7.ytor[skola.id].flikar.map((f) => f.url).join() === U('spel3'), lage7);
    res.ok('toast om flytten', await s.kor(`(document.getElementById('apptoast').textContent || '').includes('Skola')`));

    // 8. Ta bort Skola (med bekräftelse) och ångra – flikarna kommer tillbaka
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(600);
    await stadaSkal(s);
    await klick(s, `#anp-arbetsytor .ws-inst-rad[data-id="${skola.id}"] .ws-tabort`);
    res.ok('ta bort frågar först', await s.kor(`!!document.querySelector('#anp-arbetsytor .ws-bekrafta') && Arbetsytor.lista().length === 3`));
    await bild(s, 'arbetsytor-6-ta-bort.png');
    await klick(s, '#anp-arbetsytor .ws-tb-ja');
    await H.sov(500);
    res.ok('Skola borttagen', await s.kor(`!Arbetsytor.lista().some((y) => y.namn === 'Skola') && !Arbetsytor.lage().ytor[${JSON.stringify(skola.id)}]`));
    await s.kor(`AnpassaAngra.angra()`);
    await H.sov(600);
    res.ok('ångra: Skola och dess flik tillbaka', await s.kor(`Arbetsytor.lista().some((y) => y.namn === 'Skola') && (Arbetsytor.lage().ytor[${JSON.stringify(skola.id)}] || { flikar: [] }).flikar.length === 1`));
    // Ändra namn och färg på Spel
    await klick(s, `#anp-arbetsytor .ws-inst-rad[data-id="${spel.id}"] .ws-andra`);
    await s.kor(`(() => { const i = document.querySelector('#anp-arbetsytor .ws-red-namn'); i.focus(); i.select(); return 1; })()`);
    await skriv(s, 'Spela');
    await klick(s, '#anp-arbetsytor .ws-fargval[data-farg="#2f9e67"]');
    await klick(s, '#anp-arbetsytor .ws-red-spara');
    await H.sov(400);
    res.ok('namn och färg ändrade', await s.kor(`(() => { const y = Arbetsytor.lista().find((y) => y.id === ${JSON.stringify(spel.id)}); return y.namn === 'Spela' && y.farg === '#2f9e67' && document.getElementById('ws-vaxlare').textContent.includes('Spela'); })()`));
    await s.kor(`closeSettings(); 1`);
    await H.sov(400);

    // 9. Omstart: Spela öppen med spel1/spel2, de andra ytorna minns sina flikar
    const fore = await s.kor(`JSON.stringify({ aktiv: Arbetsytor.aktiv(), lage: Arbetsytor.lage(), flikar: tabs.filter((t) => t.url).map((t) => t.url) })`).then(JSON.parse);
    res.ok('stängs snällt', await stoppaApp(app));
    app = null;
    hamtade.length = 0;
    app = await startaApp(x, profil, logg);
    ({ s, m } = app);
    await H.sov(1500);
    const efter = await s.kor(`JSON.stringify({ aktiv: Arbetsytor.aktiv(), lage: Arbetsytor.lage(), flikar: tabs.filter((t) => t.url).map((t) => t.url), knapp: (document.getElementById('ws-vaxlare') || {}).textContent || '' })`).then(JSON.parse);
    res.ok('omstart: samma arbetsyta öppen', efter.aktiv === fore.aktiv && efter.knapp.includes('Spela'), efter);
    res.ok('omstart: dess flikar återställda', JSON.stringify(efter.flikar) === JSON.stringify(fore.flikar), efter.flikar);
    res.ok('omstart: Hem och Skola minns sina flikar', JSON.stringify(efter.lage.ytor) === JSON.stringify(fore.lage.ytor), efter.lage);
    res.ok('omstart: inga flikar från Hem/Skola hämtades', !hamtade.some((n) => n.startsWith('hem') || n === 'spel3'), [...hamtade]);
    await bild(s, 'arbetsytor-7-efter-omstart.png');

    // 10. Ett andra fönster (Ctrl+N) har en egen aktiv arbetsyta
    const forsta = app.mal.id;
    await kortkommando(m, 'n', false);
    const t2 = await H.mal(app.port, (t) => t.url.includes('shell.html') && t.id !== forsta && !t.url.includes('incognito'), 15000);
    res.ok('andra fönstret öppnas', !!t2);
    if (t2) {
      const s2 = await H.anslut(t2.webSocketDebuggerUrl);
      await s2.skicka('Runtime.enable');
      await H.sov(2500);
      await stadaSkal(s2);
      res.ok('andra fönstret byter till Hem', await s2.kor(`Arbetsytor.vaxla('hem')`));
      await H.sov(800);
      res.ok('första fönstret står kvar i Spela', (await s.kor(`Arbetsytor.aktiv()`)) === spel.id && (await s2.kor(`Arbetsytor.aktiv()`)) === 'hem');
      await bild(s2, 'arbetsytor-8-andra-fonstret.png');
      await s2.kor(`window.view.doClose ? window.view.doClose() : window.close()`).catch(() => {});
      s2.stang();
      await H.sov(800);
    }

    // 11. Inkognitofönster: ingen väljare och inga arbetsytor
    await kortkommando(m, 'N', true);
    const ti = await H.mal(app.port, (t) => t.url.includes('shell.html') && t.url.includes('incognito'), 15000);
    if (ti) {
      const si = await H.anslut(ti.webSocketDebuggerUrl);
      await si.skicka('Runtime.enable');
      await H.sov(2000);
      res.ok('inkognito: ingen väljare, går inte att byta', await si.kor(`!document.getElementById('ws-vaxlare') && Arbetsytor.vaxla('hem') === false`));
      await si.kor(`window.view.doClose ? window.view.doClose() : window.close()`).catch(() => {});
      si.stang();
      await H.sov(800);
    } else res.ok('inkognitofönster öppnas', false);

    // 12. Barnläge: spärren gäller i alla arbetsytor, men barnet kan använda dem
    await s.kor(`Arbetsytor.vaxla('hem')`);
    await H.sov(800);
    await s.kor(`window.view.barnRegler({ last: false, blocklist: ['localhost'], allows: [] }); 1`);   // localhost spärras
    await H.sov(800);
    res.ok('barnläge: Anpassa vet om det', await s.kor(`Anpassa.barnlage()`));
    // En spärrad adress hamnar som vald flik i Skola (filtret stoppar sidan redan här – den hämtas aldrig)
    hamtade.length = 0;
    await s.kor(`createTab('http://localhost:${SP}/blockerad'); 1`);
    await H.sov(800);
    res.ok('barnläge: barnet kan flytta en flik', await s.kor(`Arbetsytor.flytta(tabs.find((t) => t.url && t.url.includes('/blockerad')), ${JSON.stringify(skola.id)})`));
    res.ok('barnläge: barnet kan byta arbetsyta', await s.kor(`Arbetsytor.vaxla(${JSON.stringify(skola.id)})`));
    await H.sov(1500);
    const f12 = await flikar(s);
    res.ok('barnläge: den spärrade fliken är vald i Skola', (f12.find((t) => t.aktiv) || {}).url === 'http://localhost:' + SP + '/blockerad', f12);
    res.ok('barnläge: spärrad sida i en arbetsyta hämtas aldrig', !hamtade.includes('blockerad'), [...hamtade]);
    res.ok('barnläge: spärrsidan visas', await s.kor(`(() => { const k = document.getElementById('kidblock'); return !!k && getComputedStyle(k).display !== 'none'; })()`));
    await bild(s, 'arbetsytor-9-barnlage.png');
    res.ok('barnläge: arbetsytornas inställningar går att ändra', await s.kor(`Anpassa.set('arbetsytor.vaxlare', true, 'Väljaren').then((r) => !!(r && r.ok))`));
    await s.kor(`window.view.barnRegler(null); const k = document.getElementById('kidblock'); if (k) k.style.display = 'none'; 1`);
    await H.sov(300);

    // 13. Sparat per konto: ett annat konto får inte de här flikarna
    const nycklar = await s.kor(`JSON.stringify({ nu: Arbetsytor.nyckel(), konton: Object.keys(JSON.parse(localStorage.getItem('adraze-arbetsytor')).konton) })`).then(JSON.parse);
    res.ok('utloggad: sparat som "lokal"', nycklar.nu === 'lokal' && nycklar.konton.includes('lokal'), nycklar);
    const konto = await s.kor(`(() => {
      const fore = JSON.stringify(Arbetsytor.lage().ytor);
      account = { token: 't-test', email: 'barn@exempel.se', isChild: true };      // som efter en inloggning i fönstret
      Arbetsytor.oppnaMeny(); Arbetsytor.stangMeny();
      const barnet = JSON.stringify(Arbetsytor.lage().ytor);
      account = null;                                                             // utloggad igen
      Arbetsytor.oppnaMeny(); Arbetsytor.stangMeny();
      return JSON.stringify({ fore, barnet, tillbaka: JSON.stringify(Arbetsytor.lage().ytor), nyckel: Arbetsytor.nyckel() });
    })()`).then(JSON.parse);
    res.ok('kontobyte: barnkontot ser inte förälderns dolda flikar', konto.barnet === '{}' && konto.fore !== '{}', konto);
    res.ok('kontobyte: tillbaka – flikarna finns kvar', konto.tillbaka === konto.fore, konto);

    // 14. Flikarna på sidan (Anpassa › flikar): väljaren överst i panelen; bara ikoner: bara arbetsytans ikon
    const matt = () => s.kor(`JSON.stringify((() => { const b = document.getElementById('ws-vaxlare'), p = document.getElementById('tabstrip'); if (!b || !p) return null;
      const rb = b.getBoundingClientRect(), rp = p.getBoundingClientRect(), n = b.querySelector('.ws-namn');
      return { b: [rb.left, rb.right, rb.top, rb.width].map(Math.round), p: [rp.left, rp.right, rp.top, rp.width].map(Math.round), namn: n ? getComputedStyle(n).display : '' }; })())`).then(JSON.parse);
    await s.kor(`(async () => { await Anpassa.set('flikar.lage', 'vertikal', 'Flikarnas placering'); return 1; })()`);
    await H.sov(800);
    const v1 = await matt();
    res.ok('flikarna på sidan: väljaren överst i panelen, nästan hela bredden', !!v1 && v1.b[0] >= v1.p[0] && v1.b[1] <= v1.p[1] && v1.b[3] > v1.p[3] * 0.75 && v1.b[2] - v1.p[2] < 24 && v1.namn !== 'none', v1);
    await bild(s, 'arbetsytor-10-flikar-pa-sidan.png');
    await s.kor(`(async () => { await Anpassa.set('flikar.vertikalSmal', true, 'Flikpanelen bara ikoner'); return 1; })()`);
    await H.sov(800);
    const v2 = await matt();
    res.ok('bara ikoner: bara arbetsytans ikon, inom panelen', !!v2 && v2.namn === 'none' && v2.b[0] >= v2.p[0] && v2.b[1] <= v2.p[1], v2);
    await bild(s, 'arbetsytor-11-bara-ikoner.png');
    await s.kor(`(async () => { await Anpassa.set('flikar.vertikalSmal', false, 'Flikpanelen bara ikoner'); await Anpassa.set('flikar.lage', 'upptill', 'Flikarnas placering'); return 1; })()`);
    await H.sov(500);

    // Inga fel i skalets konsol
    const fel = s.handelser.filter((h) => h.method === 'Runtime.exceptionThrown' || (h.method === 'Runtime.consoleAPICalled' && h.params.type === 'error'))
      .map((h) => JSON.stringify(h.params).slice(0, 300)).filter((t) => /anpassa|arbetsyt|Arbetsyt/i.test(t));
    res.ok('inga fel från arbetsytorna i konsolen', !fel.length, fel);
  } catch (e) {
    res.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    if (app) await stoppaApp(app);
    x.stoppa();
    server.close();
  }
  console.log(res.text());
  console.log('\nSkärmdumpar: ' + BILDER);
  console.log(res.fel.length ? '\n' + res.fel.length + ' FEL' : '\nALLT OK (' + res.rader.length + ' kontroller)');
  process.exit(res.fel.length ? 1 : 0);
})();
