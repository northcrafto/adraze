// Test: Anpassa › Ångra-panelen och Falk ändrar inställningar. Kör: node tools/test/anpassa-angra.js [mapp för skärmdumpar]
// Startar dev-appen OSYNLIGT (egen Xvfb, egen profil). Huvudprocessen nås via inspektorn (--inspect på en ledig port,
// bara i testet). Falk testas UTAN riktigt AI-anrop: dels anropas verktyget direkt, dels byts chattsvaret ut i
// huvudprocessen mot ett färdigt svar med taggar – resten (panelen, taggarna, rutan som frågar) är det riktiga.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const H = require('./hjalp');

const R = path.resolve(__dirname, '..', '..');
const BILDER = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'adraze-angra-bilder-'));
const ELECTRON = path.join(R, 'node_modules/electron/dist/electron');
const res = H.resultat();

async function startaApp(x, profil, logg) {
  const port = await H.ledigPort(), iport = await H.ledigPort();
  const p = H.starta(ELECTRON, ['--inspect=' + iport, R, '--remote-debugging-port=' + port], H.testMiljo(x.display, profil), logg);
  await H.vantaPaPort(port);
  const t = await H.mal(port, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'));
  if (!t) throw new Error('skalet startade inte');
  const s = await H.anslut(t.webSocketDebuggerUrl);
  await s.skicka('Runtime.enable');
  await s.skicka('DOM.enable');
  await s.skicka('Emulation.setFocusEmulationEnabled', { enabled: true });
  await H.vantaPaPort(iport);
  const m = await H.anslut((await H.mal(iport, () => true)).webSocketDebuggerUrl);
  await H.sov(1800);
  await stadaSkal(s);
  return { p, port, s, m };
}
async function stoppaApp(app) { try { app.m.stang(); app.s.stang(); } catch {} await H.sov(300); return H.stang(app.p); }
const stadaSkal = (s) => s.kor(`(() => {
  try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 864e5)); localStorage.setItem('adraze-flytt-erbjuden', '1'); } catch {}
  try { localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true; } catch {}
  for (const id of ['hxintro', 'defbrowser-banner', 'flytt-banner']) { const e = document.getElementById(id); if (e) e.remove(); }
  return 1; })()`);
// Riktigt klick mitt på elementet. Väntar tills det ligger still och inget annat ligger över (en ändring nyss kan
// flytta sidan en stund: flikarna byter plats, temat byts …)
async function klick(s, sel) {
  let r = null, forra = '';
  for (let i = 0; i < 20; i++) {
    r = await s.kor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2, o = document.elementFromPoint(x, y), l = e.closest('label');
      return { x, y, traff: !!o && (o === e || e.contains(o) || o.contains(e) || (!!l && l.contains(o))) }; })()`);
    if (!r || typeof r !== 'object') throw new Error('hittar inte ' + sel);
    const nu = Math.round(r.x) + ',' + Math.round(r.y);
    if (r.traff && nu === forra) break;
    forra = nu;
    await H.sov(120);
  }
  for (const type of ['mousePressed', 'mouseReleased']) await s.skicka('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await H.sov(150);
}
async function skriv(s, text) { await s.skicka('Input.insertText', { text }); await H.sov(80); }
async function ctrlZ(s) {
  for (const type of ['rawKeyDown', 'keyUp']) await s.skicka('Input.dispatchKeyEvent', { type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
  await H.sov(400);
}
async function bild(s, namn) {
  const r = await s.skicka('Page.captureScreenshot', { format: 'png' });
  if (r.result && r.result.data) fs.writeFileSync(path.join(BILDER, namn), Buffer.from(r.result.data, 'base64'));
}
// Vänta tills villkoret (async) är sant, högst ms
async function vanta(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await H.sov(100); }
  return false;
}
// Hela skärmen (Xvfb) – med de små vyerna ovanpå sidan, som skalets egen skärmdump inte har med
function skarmbild(x, namn) { try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1600x1000', '-i', x.display, '-frames:v', '1', path.join(BILDER, namn)], { timeout: 15000 }); } catch {} }
const krockar = (a, b) => !!a && !!b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const toast = (s) => s.kor(`(() => { const t = document.getElementById('anp-toast'); return t && t.classList.contains('pa') ? t.querySelector('.anp-toast-txt').textContent + (t.classList.contains('utan-angra') ? '' : ' · Ångra') : ''; })()`);
const vantaToastBort = (s) => s.kor(`new Promise((ok) => { const t0 = Date.now(); (function k() { const t = document.getElementById('anp-toast'); if (!t || !t.classList.contains('pa') || Date.now() - t0 > 7000) ok(1); else setTimeout(k, 100); })(); })`);

// Nycklar från de andra områdena som testet använder (de registreras av områdena själva)
const BEHOVS = ['tema.accent', 'tema.lage', 'tema.densitet', 'tema.typsnitt', 'flikar.lage', 'flikar.sova', 'flikar.vertikalBredd', 'verktyg.knappar', 'verktyg.adress',
  'avancerat.css', 'avancerat.skript', 'sajt.*', 'sidopanel.visa', 'arbetsytor.lista', 'arbetsytor.vaxlare'];
// Egen CSS i avancerat-områdets format (anpassa-avancerat.js): [{ id, mal, under, css, pa }]
const CSS1 = [{ id: 'test1', mal: 'example.com', under: true, css: 'body { outline: 1px solid red }', pa: true }];

(async () => {
  const x = await H.startaXvfb();
  const profil = H.tempDir('angra');
  const logg = path.join(profil, 'logg.txt');
  let app = null;
  try {
    app = await startaApp(x, profil, logg);
    const { s, m, port } = app;
    // Huvudprocessens moduler, en gång
    const saknas = await m.kor(`(() => { const r = (x) => process.mainModule.require(x);
      globalThis.__T = { el: r('electron'), A: r('./anpassa'), F: r('./anpassa-falk'), G: r('./anpassa-angra') };
      __T.fonster = () => __T.el.BrowserWindow.getAllWindows().find((w) => /shell\\.html/.test(w.webContents.getURL()));
      const reg = __T.A.registret(); return ${JSON.stringify(BEHOVS)}.filter((k) => !reg[k]); })()`);
    res.ok('huvudprocessen nås, alla områdens nycklar finns', Array.isArray(saknas) && !saknas.length, saknas);
    const A = (expr) => m.kor('(() => { const A = __T.A; return ' + expr + '; })()');
    const std = (k) => A(`JSON.stringify(A.registret()[${JSON.stringify(k)}].standard)`).then(JSON.parse);   // områdets standardvärde
    const css = () => A(`JSON.stringify(A.hamta('avancerat.css'))`);

    /* ───────── Ångra-panelen ───────── */
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(700);
    await stadaSkal(s);
    res.ok('panelen ritas i #anp-angra', await s.kor(`(() => { const h = document.querySelector('#anp-angra h3'); return !!h && h.textContent === 'Ångra och spara' && !!document.getElementById('anp-hist'); })()`));
    res.ok('tom: "Inga ändringar än" och Ångra avstängd', await s.kor(`document.querySelector('#anp-hist .anp-h-tom') !== null && document.getElementById('anp-angra-senaste').disabled`));

    // Listan växer när du ändrar något längre ner, men det du står vid flyttar sig inte
    await s.kor(`document.getElementById('anp-tema').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    const fore = await s.kor(`Math.round(document.querySelector('#anp-tema h3').getBoundingClientRect().top)`);
    await s.kor(`(async () => { await Anpassa.set('tema.horn', 'rund', 'Hörn'); return 1; })()`);
    await H.sov(600);
    const efter = await s.kor(`Math.round(document.querySelector('#anp-tema h3').getBoundingClientRect().top) + '|' + document.querySelectorAll('#anp-hist .anp-h').length`);
    res.ok('listan växer utan att resten av sidan hoppar', efter === fore + '|1', { fore, efter });
    await A(`A.angra() && 1`);
    await H.sov(400);

    // Du ändrar något (riktigt klick) → toast "Ändrat: X · Ångra"
    await klick(s, '#anp-arbetsytor .switch .track');
    await H.sov(450);
    res.ok('ändring med klick: värdet ändrat', (await A(`A.hamta('arbetsytor.vaxlare')`)) === false);
    const t1 = await toast(s);
    res.ok('toast "Ändrat: … · Ångra"', t1 === 'Ändrat: Väljaren för arbetsytor · Ångra', t1);
    await bild(s, 'angra-1-toast.png');
    await klick(s, '#anp-toast .anp-toast-angra');
    await H.sov(450);
    res.ok('Ångra i toasten ångrar', (await A(`A.hamta('arbetsytor.vaxlare')`)) === true);
    res.ok('toast "Ångrade: …"', (await toast(s)) === 'Ångrade: Väljaren för arbetsytor', await toast(s));
    await vantaToastBort(s);
    await H.sov(4200);   // så att inget räknas som "nyss klickat"

    // Ändringar som inte kommer från dig här (t.ex. ett annat fönster) ger ingen toast, men syns i listan
    await s.kor(`(async () => { await Anpassa.set('tema.accent', '#2f9e67', 'Accentfärg'); await Anpassa.set('flikar.lage', 'vertikal', 'Flikarnas placering');
      await Anpassa.set('verktyg.adress', 'doman', 'Adressfältet'); await Anpassa.set('arbetsytor.vaxlare', false, 'Väljaren för arbetsytor');
      await Anpassa.set('tema.densitet', 'kompakt', 'Densitet'); await Anpassa.set('tema.lage', 'morkt', 'Ljust eller mörkt'); return 1; })()`);
    await H.sov(500);
    res.ok('ingen toast för ändringar utan klick', (await toast(s)) === '');
    await s.kor(`AnpassaAngra.rita()`);
    await H.sov(300);
    const rader = await s.kor(`JSON.stringify([...document.querySelectorAll('#anp-hist .anp-h')].map((li) => li.textContent))`).then(JSON.parse);
    res.ok('listan: senaste först, läsbar, 3 st', rader.length === 3 && /^Ljust eller mörkt ändradesmörkt· \d\d:\d\d$/.test(rader[0]) && /^Väljaren för arbetsytor ändradesav· /.test(rader[2]), rader);
    res.ok('listan: tid "· 19:42"', rader.every((r) => /· \d\d:\d\d$/.test(r)), rader);
    res.ok('"Visa alla" när det finns fler än 3', await s.kor(`(() => { const b = document.getElementById('anp-hist-mer'); return !b.hidden && /Visa alla \\(\\d+\\)/.test(b.textContent); })()`));
    await klick(s, '#anp-hist-mer');
    await H.sov(300);
    res.ok('"Visa alla" visar alla', await s.kor(`document.querySelectorAll('#anp-hist .anp-h').length === 6 && document.getElementById('anp-hist-mer').textContent === 'Visa färre'`));
    res.ok('värden visas med å/ä/ö ("domän")', await s.kor(`[...document.querySelectorAll('#anp-hist .anp-h-varde')].some((e) => e.textContent === 'domän')`));
    res.ok('listan: färgprov för färger', await s.kor(`!!document.querySelector('#anp-hist .anp-h-farg[title="#2f9e67"]')`));
    await s.kor(`document.getElementById('anp-angra').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    await bild(s, 'angra-2-panelen.png');
    await klick(s, '#anp-hist-mer');

    // Ctrl+Z i Anpassa ångrar (inte i ett textfält)
    await s.kor(`document.activeElement && document.activeElement.blur(); 1`);
    await ctrlZ(s);
    res.ok('Ctrl+Z ångrar senaste', (await A(`A.alla()['tema.lage'] === undefined && A.hamta('tema.lage')`)) === (await std('tema.lage')), await A(`A.hamta('tema.lage')`));
    res.ok('Ctrl+Z ger toast "Ångrade: …"', (await toast(s)) === 'Ångrade: Ljust eller mörkt', await toast(s));
    await klick(s, '#anp-imp-knapp');
    await H.sov(200);
    await s.kor(`document.getElementById('anp-imp-kod').focus(); 1`);
    await ctrlZ(s);
    res.ok('Ctrl+Z i ett textfält ångrar inte inställningar', (await A(`A.hamta('tema.densitet')`)) === 'kompakt');
    await klick(s, '#anp-imp-knapp');   // stäng importrutan igen
    // Knappen "Ångra senaste"
    await klick(s, '#anp-angra-senaste');
    await H.sov(300);
    res.ok('"Ångra senaste" ångrar', (await A(`A.hamta('tema.densitet')`)) === 'normal');

    // Grupp: en återställning ångras på en gång
    await s.kor(`(async () => { await Anpassa.set('tema.densitet', 'luftig', 'Densitet'); await Anpassa.set('tema.lage', 'system', 'Ljust eller mörkt'); return 1; })()`);
    await s.kor(`Anpassa.aterstall('tema.')`);
    const efterAter = await A(`JSON.stringify([A.hamta('tema.accent'), A.hamta('tema.densitet'), A.hamta('tema.lage')])`);
    const g = await s.kor(`window.anpassaAngra.angra().then(JSON.stringify)`).then(JSON.parse);
    const efterAngra = await A(`JSON.stringify([A.hamta('tema.accent'), A.hamta('tema.densitet'), A.hamta('tema.lage')])`);
    const stdTema = JSON.stringify([await std('tema.accent'), await std('tema.densitet'), await std('tema.lage')]);
    res.ok('återställning av ett område: allt tillbaka med EN ångra', efterAter === stdTema && efterAngra === '["#2f9e67","luftig","system"]' && g.antal === 3, { efterAter, stdTema, efterAngra, g });

    // Exportera: kod + spara som fil (spara-rutan byts ut i testet)
    const fil = path.join(profil, 'mina-installningar.txt');
    await m.kor(`(() => { __T.el.dialog.showSaveDialog = async () => ({ canceled: false, filePath: ${JSON.stringify(fil)} }); return 1; })()`);
    await s.kor(`(async () => { await Anpassa.set('avancerat.css', ${JSON.stringify(CSS1)}, 'Egen CSS'); return 1; })()`);
    await klick(s, '#anp-exp-knapp');
    await H.sov(400);
    const kod = await s.kor(`document.getElementById('anp-exp-kod').value`);
    let innehall = {}; try { innehall = JSON.parse(Buffer.from(String(kod).slice(6), 'base64url').toString('utf8')); } catch {}
    res.ok('export: ADRZ1-kod med inställningarna', /^ADRZ1\./.test(kod) && innehall['tema.accent'] === '#2f9e67' && innehall['flikar.lage'] === 'vertikal', Object.keys(innehall));
    res.ok('export: egen CSS följer inte med i koden', !('avancerat.css' in innehall) && (await css()) === JSON.stringify(CSS1), Object.keys(innehall));
    res.ok('export: antal visas', /\d+ inställningar/.test(await s.kor(`document.getElementById('anp-exp-not').textContent`)));
    await klick(s, '#anp-exp-fil');
    await H.sov(500);
    res.ok('export: sparad som fil', fs.existsSync(fil) && fs.readFileSync(fil, 'utf8').trim() === kod && /Sparad: mina-installningar\.txt/.test(await s.kor(`document.getElementById('anp-exp-not').textContent`)));
    await bild(s, 'angra-3-export.png');
    await klick(s, '#anp-exp-knapp');

    // Återställ allt: frågar först, toast med Ångra, Ångra tar tillbaka allt
    await klick(s, '#anp-ater-knapp');
    res.ok('återställ allt frågar först', await s.kor(`!document.getElementById('anp-ater').hidden`) && (await A(`A.hamta('tema.accent')`)) === '#2f9e67');
    await bild(s, 'angra-4-aterstall-fraga.png');
    await klick(s, '#anp-ater-ja');
    await H.sov(450);
    res.ok('återställ allt: allt standard', (await A(`Object.keys(A.alla()).length`)) === 0, await A(`JSON.stringify(A.alla())`));
    res.ok('återställ allt: toast "Allt återställt · Ångra"', (await toast(s)) === 'Allt återställt · Ångra', await toast(s));
    await klick(s, '#anp-toast .anp-toast-angra');
    await H.sov(450);
    res.ok('återställ allt: Ångra tar tillbaka allt', (await A(`A.hamta('tema.accent') + '|' + A.hamta('flikar.lage')`)) === '#2f9e67|vertikal' && (await css()) === JSON.stringify(CSS1));

    // Importera kod (egen CSS följer aldrig med)
    await A(`A.aterstall()`);
    await H.sov(800);   // flikarna, temat och tätheten går tillbaka – fönstret ritas om
    await klick(s, '#anp-imp-knapp');
    await s.kor(`document.getElementById('anp-imp-kod').focus(); 1`);
    await skriv(s, kod);
    await klick(s, '#anp-imp-kor');
    await H.sov(500);
    res.ok('import: värdena tillbaka', (await A(`A.hamta('tema.accent') + '|' + A.hamta('flikar.lage')`)) === '#2f9e67|vertikal');
    res.ok('import: egen CSS följer inte med', (await css()) === '[]', await css());
    res.ok('import: meddelande', /^Klart! \d+ inställningar importerades\.$/.test(await s.kor(`document.getElementById('anp-imp-not').textContent`)), await s.kor(`document.getElementById('anp-imp-not').textContent`));
    // Importera fil
    await A(`A.aterstall()`);
    const doc = await s.skicka('DOM.getDocument', { depth: 0 });
    const nod = await s.skicka('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#anp-imp-fil' });
    await s.skicka('DOM.setFileInputFiles', { nodeId: nod.result.nodeId, files: [fil] });
    await H.sov(700);
    res.ok('import från fil', (await A(`A.hamta('tema.accent') + '|' + A.hamta('flikar.lage')`)) === '#2f9e67|vertikal');
    // Fel kod
    await s.kor(`document.getElementById('anp-imp-kod').value = 'hej'; 1`);
    await klick(s, '#anp-imp-kor');
    await H.sov(300);
    res.ok('import: fel kod säger till', /inte rätt/.test(await s.kor(`document.getElementById('anp-imp-not').textContent`)));
    await bild(s, 'angra-5-import.png');
    await klick(s, '#anp-imp-knapp');

    /* ───────── Toasten: längst ner i mitten, aldrig över flikraden eller verktygsraden ───────── */
    const toastMatt = () => s.kor(`JSON.stringify((() => { const t = document.getElementById('anp-toast'); if (!t || !t.classList.contains('pa')) return null;
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? [b.left, b.top, b.right, b.bottom].map(Math.round) : null; };
      const x = t.querySelector('.anp-toast-txt').getBoundingClientRect(), under = document.elementFromPoint(x.left + 6, x.top + x.height / 2);
      const pw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pw'), 10) || 0;
      return { t: r(t), tabs: r(document.getElementById('tabstrip')), verktyg: r(document.getElementById('toolbar')), views: r(document.getElementById('views')), pw,
        iViews: !!t.parentElement && t.parentElement.id === 'views', pe: getComputedStyle(t).pointerEvents, peKnapp: getComputedStyle(t.querySelector('.anp-toast-angra')).pointerEvents,
        genom: !!under && !t.contains(under) }; })())`).then(JSON.parse);
    const toastPlats = (mt) => !!mt && mt.iViews && !krockar(mt.t, mt.tabs) && !krockar(mt.t, mt.verktyg)
      && mt.t[3] <= mt.views[3] && mt.views[3] - mt.t[3] <= 30 && Math.abs((mt.t[0] + mt.t[2]) / 2 - (mt.views[0] + mt.views[2] - mt.pw) / 2) <= 2;
    for (const [fl, vt] of [['upptill', 'uppe'], ['vertikal', 'uppe'], ['dolda', 'uppe'], ['upptill', 'nere'], ['vertikal', 'nere'], ['dolda', 'nere']]) {
      await s.kor(`(async () => { await Anpassa.set('flikar.lage', '${fl}', 'test'); await Anpassa.set('verktyg.placering', '${vt}', 'test'); return 1; })()`);
      await H.sov(700);
      await s.kor(`AnpassaAngra.toast('Ändrat: Hörn', true); 1`);
      await H.sov(450);
      const mt = await toastMatt();
      res.ok(`toasten (flikarna ${fl}, verktygsraden ${vt}): längst ner i mitten, inte över flikraden eller verktygsraden`, toastPlats(mt), mt);
      if (fl === 'upptill' && vt === 'uppe') res.ok('toasten släpper igenom klick utom på Ångra-knappen', !!mt && mt.pe === 'none' && mt.peKnapp === 'auto' && mt.genom, mt);
      await bild(s, `angra-toast-${fl}-${vt}.png`);
    }
    await s.kor(`(async () => { await Anpassa.set('flikar.lage', 'upptill', 'test'); await Anpassa.set('verktyg.placering', 'uppe', 'test'); return 1; })()`);
    await H.sov(500);

    // Med en webbsida framme ritas sidan ovanpå skalet: toasten ligger då i en egen liten vy ovanpå sidan
    const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end('<!doctype html><meta charset="utf-8"><title>Testsida</title><body style="margin:0;font:16px system-ui;background:#eef2f7"><h1 style="margin:40px">Testsida</h1></body>'); });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const sidaUrl = 'http://127.0.0.1:' + srv.address().port + '/sida';
    try {
      await s.kor(`closeSettings(); createTab(${JSON.stringify(sidaUrl)}); 1`);
      await vanta(() => m.kor(`__T.el.webContents.getAllWebContents().some((w) => w.getURL() === ${JSON.stringify(sidaUrl)} && !w.isLoading())`), 10000);
      await H.sov(700);
      await stadaSkal(s);
      const hornFore = await A(`A.hamta('tema.horn')`);
      await klick(s, '#tabs [data-tabid="' + (await s.kor('active.id')) + '"]');   // du klickar i fönstret …
      await s.kor(`(async () => { await Anpassa.set('tema.horn', 'rund', 'Hörn'); return 1; })()`);   // … och ändrar något
      await vanta(() => m.kor(`__T.G.toastLage().some((x) => x.syns)`), 6000);
      await H.sov(300);
      const lage = await m.kor(`JSON.stringify(__T.G.toastLage().find((x) => x.syns) || null)`).then(JSON.parse);
      const ram = await s.kor(`JSON.stringify((() => { const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }; return { tabs: r(document.getElementById('tabstrip')), verktyg: r(document.getElementById('toolbar')) }; })())`).then(JSON.parse);
      const tb = lage && lage.toast && [lage.toast.x, lage.toast.y, lage.toast.x + lage.toast.width, lage.toast.y + lage.toast.height], sb = lage && lage.sida;
      res.ok('webbsida framme: toasten ovanpå sidan, längst ner i mitten', !!tb && !!sb && tb[0] >= sb.x && tb[2] <= sb.x + sb.width && tb[1] >= sb.y && tb[3] <= sb.y + sb.height
        && sb.y + sb.height - tb[3] <= 12 && Math.abs((tb[0] + tb[2]) / 2 - (sb.x + sb.width / 2)) <= 1.5 && tb[3] - tb[1] <= 70 && tb[2] - tb[0] <= 600, lage);
      res.ok('webbsida framme: inte över flikraden eller verktygsraden', !!tb && !krockar(tb, ram.tabs) && !krockar(tb, ram.verktyg), { tb, ram });
      res.ok('webbsida framme: skalets egen toast visas inte (den hamnar under sidan)', (await toast(s)) === '');
      skarmbild(x, 'angra-7-toast-over-sidan.png');
      // Rutan tar inte klick från sidan: ett riktigt klick på toastens text hamnar på sidan under
      const sidaT = await H.mal(port, (t) => t.url === sidaUrl, 4000);
      const ps = sidaT && await H.anslut(sidaT.webSocketDebuggerUrl);
      if (ps) { await ps.skicka('Runtime.enable'); await ps.kor(`window.__klick = []; document.addEventListener('mousedown', (e) => window.__klick.push([e.clientX, e.clientY, e.isTrusted])); 1`); }
      const cb = await m.kor(`JSON.stringify(__T.fonster().getContentBounds())`).then(JSON.parse);
      const txtX = lage.toast.x + 32, txtY = lage.toast.y + Math.round(lage.toast.height / 2) - 3;   // på texten "Ändrat: Hörn"
      try { execFileSync('xdotool', ['mousemove', String(cb.x + txtX), String(cb.y + txtY), 'click', '1'], { env: { ...process.env, DISPLAY: x.display }, timeout: 5000 }); } catch {}
      await H.sov(500);
      const klickat = ps ? await ps.kor(`JSON.stringify(window.__klick)`).then(JSON.parse) : [];
      res.ok('webbsida framme: ett klick på toastens text går igenom till sidan', klickat.length === 1 && Math.abs(klickat[0][0] - (txtX - sb.x)) <= 2 && Math.abs(klickat[0][1] - (txtY - sb.y)) <= 2 && klickat[0][2] === true, { klickat, txtX, txtY, sb });
      res.ok('webbsida framme: toasten är kvar efter klicket och inget ångrades', (await m.kor(`__T.G.toastLage().some((x) => x.syns)`)) === true && (await A(`A.hamta('tema.horn')`)) === 'rund');
      try { execFileSync('xdotool', ['mousemove', String(cb.x + 300), String(cb.y + 300)], { env: { ...process.env, DISPLAY: x.display }, timeout: 5000 }); } catch {}
      if (ps) ps.stang();
      const mt2 = await H.mal(port, (t) => t.url.includes('anpassa-toast.html'), 4000);
      const ts = mt2 && await H.anslut(mt2.webSocketDebuggerUrl);
      if (ts) {
        await ts.skicka('Runtime.enable');
        res.ok('webbsida framme: "Ändrat: Hörn · Ångra"', (await ts.kor(`document.getElementById('txt').textContent + ' · ' + document.getElementById('angra').textContent`)) === 'Ändrat: Hörn · Ångra');
        const kb = await ts.kor(`(() => { const b = document.getElementById('angra').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        for (const type of ['mousePressed', 'mouseReleased']) await ts.skicka('Input.dispatchMouseEvent', { type, x: kb.x, y: kb.y, button: 'left', clickCount: 1 });
        await H.sov(800);
        res.ok('webbsida framme: Ångra i toasten ångrar', (await A(`A.hamta('tema.horn')`)) === hornFore, await A(`A.hamta('tema.horn')`));
        res.ok('webbsida framme: "Ångrade: Hörn" ovanpå sidan', (await ts.kor(`document.getElementById('txt').textContent + '|' + document.getElementById('t').classList.contains('utan-angra')`)) === 'Ångrade: Hörn|true'
          && (await m.kor(`__T.G.toastLage().some((x) => x.syns)`)) === true);
        ts.stang();
      } else res.ok('webbsida framme: toastvyn finns', false);
      // Flikarna på sidan och verktygsraden längst ner: toasten ovanför raden, ovanpå sidan
      await s.kor(`(async () => { await Anpassa.set('flikar.lage', 'vertikal', 'test'); await Anpassa.set('verktyg.placering', 'nere', 'test'); return 1; })()`);
      await H.sov(900);
      await klick(s, '#tabs [data-tabid="' + (await s.kor('active.id')) + '"]');
      await s.kor(`(async () => { await Anpassa.set('tema.horn', 'kantig', 'Hörn'); return 1; })()`);
      await vanta(async () => { const l = JSON.parse(await m.kor(`JSON.stringify(__T.G.toastLage().find((x) => x.syns) || null)`)); return !!l && l.toast.width > 120; }, 6000);
      await H.sov(300);
      const lage2 = await m.kor(`JSON.stringify(__T.G.toastLage().find((x) => x.syns) || null)`).then(JSON.parse);
      const ram2 = await s.kor(`JSON.stringify((() => { const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }; return { tabs: r(document.getElementById('tabstrip')), verktyg: r(document.getElementById('toolbar')) }; })())`).then(JSON.parse);
      const tb2 = lage2 && lage2.toast && [lage2.toast.x, lage2.toast.y, lage2.toast.x + lage2.toast.width, lage2.toast.y + lage2.toast.height], sb2 = lage2 && lage2.sida;
      res.ok('flikarna på sidan, verktygsraden nere: toasten ovanpå sidan, precis ovanför verktygsraden', !!tb2 && !!sb2 && !!ram2.verktyg && tb2[3] <= ram2.verktyg[1] && ram2.verktyg[1] - tb2[3] <= 12
        && tb2[0] >= sb2.x && tb2[2] <= sb2.x + sb2.width && !krockar(tb2, ram2.tabs) && !krockar(tb2, ram2.verktyg), { tb2, sb2, ram2 });
      skarmbild(x, 'angra-8-toast-verktyg-nere.png');
      // Sidan göms (Anpassa öppnas) medan toasten syns: toasten fortsätter i skalet, aldrig under sidan
      await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
      await H.sov(450);
      const flyttad = await toastMatt();
      res.ok('sidan göms: toasten flyttar till skalet (samma text, ovanför verktygsraden)', toastPlats(flyttad) && (await toast(s)) === 'Ändrat: Hörn · Ångra' && (await m.kor(`__T.G.toastLage().some((x) => x.syns)`)) === false, flyttad);
      // … och sidan visas igen medan den syns: upp ovanpå sidan igen
      await s.kor(`closeSettings(); 1`);
      await vanta(() => m.kor(`__T.G.toastLage().some((x) => x.syns)`), 3000);
      res.ok('sidan visas igen: toasten ligger ovanpå sidan, inte kvar under den', (await m.kor(`__T.G.toastLage().some((x) => x.syns)`)) === true && (await toast(s)) === '');
      await s.kor(`(async () => { await Anpassa.set('flikar.lage', 'upptill', 'test'); await Anpassa.set('verktyg.placering', 'uppe', 'test'); return 1; })()`);
      await H.sov(600);
      // Inställningarna öppnas: sidan göms, toasten ritas i skalet igen (och den lilla vyn göms)
      await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
      await H.sov(500);
      await s.kor(`AnpassaAngra.toast('Ändrat: Hörn', true); 1`);
      await H.sov(450);
      res.ok('Anpassa öppet igen: toasten i skalet, inte ovanpå', toastPlats(await toastMatt()) && (await m.kor(`__T.G.toastLage().some((x) => x.syns)`)) === false);
      await s.kor(`closeSettings(); closeTab(active); 1`);
      await H.sov(400);
      await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
      await H.sov(500);
    } finally { srv.close(); }

    /* ───────── Falk ändrar inställningar (verktyget direkt, utan AI) ───────── */
    const gor = (a, svar = true) => m.kor(`(async () => { const fragor = [], med = [];
      const r = await __T.F.gor({ win: __T.fonster() }, ${JSON.stringify(a)}, { bekrafta: async (m, d) => { fragor.push({ m, d }); return ${!!svar}; }, meddela: (d) => med.push(d) });
      return JSON.stringify({ r, fragor, med }); })()`).then(JSON.parse);
    await A(`A.aterstall()`);
    const lista = await m.kor(`JSON.stringify(__T.F.lista())`).then(JSON.parse);
    const rad = (k) => lista.find((x) => x.nyckel === k) || {};
    res.ok('Falk: listan läses ur registret', rad('flikar.lage').val === 'upptill | vertikal | dolda' && rad('tema.accent').val === 'färg (#rrggbb)' && rad('tema.accent').nu === '#ff4b1f', lista.slice(0, 4));
    res.ok('Falk: listan har områdenas egna val', rad('tema.typsnitt').val === 'system | klassisk | tydlig | serif | mono' && rad('flikar.sova').val === '0 | 15 | 30 | 60 | 120' && rad('flikar.vertikalBredd').val === 'tal 170–420', [rad('tema.typsnitt'), rad('flikar.sova'), rad('flikar.vertikalBredd')]);
    res.ok('Falk: egen CSS "frågar först", arbetsytorna och sajterna ändras i Inställningar', rad('avancerat.css').fraga === true && rad('avancerat.css').nu === '(tomt)' && rad('arbetsytor.lista').val === 'ändras i Inställningar' && rad('sajt.<namn>').val === 'ändras i Inställningar' && rad('verktyg.knappar').val === 'ändras i Inställningar');
    res.ok('Falk: listan hålls kort (kortkommandona i en rad)', lista.length < 70 && !!rad('kortkommandon.…').nyckel && !lista.some((x) => /^kortkommandon\.[a-z]/.test(x.nyckel)), lista.length);

    let r = await gor({ name: 'anpassa', value: 'flikar.lage|vertikala' });
    res.ok('Falk: "gör flikarna vertikala"', r.r.ok && (await A(`A.hamta('flikar.lage')`)) === 'vertikal' && r.med[0].etiketter[0] === 'Flikarnas placering', r);
    r = await gor({ name: 'anpassa', value: 'tema.accent|mörkgrön' });
    res.ok('Falk: "mörkgrön accentfärg"', r.r.ok && (await A(`A.hamta('tema.accent')`)) === '#1f6b3a', r.r);
    r = await gor({ name: 'anpassa', value: 'tema.accent|#1F6B3A' });
    res.ok('Falk: samma värde igen = redan inställt', r.r.ok && r.r.redan === true, r.r);
    r = await gor({ name: 'anpassa', value: 'tema.densitet|kompaktare' });
    res.ok('Falk: "kompaktare"', r.r.ok && (await A(`A.hamta('tema.densitet')`)) === 'kompakt', r.r);
    r = await gor({ name: 'anpassa', value: 'Tema.Läge = mörkt' });
    res.ok('Falk: "mörkt läge" (stavning med å/ä/ö och versaler)', r.r.ok && (await A(`A.hamta('tema.lage')`)) === 'morkt', r.r);
    r = await gor({ name: 'anpassa', value: 'verktyg.knappar|bakat, ladda' });
    res.ok('Falk: verktygsfältets knappar (ett objekt) ändras bara i Inställningar', !r.r.ok && /Inställningar/.test(r.r.fel) && (await A(`JSON.stringify(A.hamta('verktyg.knappar'))`)) === 'null', r.r);
    r = await gor({ name: 'anpassa', value: 'arbetsytor.vaxlare|av' });
    res.ok('Falk: på/av', r.r.ok && (await A(`A.hamta('arbetsytor.vaxlare')`)) === false, r.r);
    r = await gor({ name: 'anpassa', value: 'tema.blinkande|ja' });
    res.ok('Falk: okänd nyckel nekas', !r.r.ok && /finns inte/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'tema.typsnitt|Comic Sans' });
    res.ok('Falk: bara områdets egna värden (typsnitt)', !r.r.ok && /Tillåtna värden: system, klassisk, tydlig, serif, mono/.test(r.r.fel) && (await A(`A.hamta('tema.typsnitt')`)) === 'system', r.r);
    r = await gor({ name: 'anpassa', value: 'tema.typsnitt|Serif' });
    res.ok('Falk: "serif" går', r.r.ok && (await A(`A.hamta('tema.typsnitt')`)) === 'serif', r.r);
    r = await gor({ name: 'anpassa', value: 'flikar.sova|1 timme' });
    res.ok('Falk: sovande flikar "1 timme" → 60', r.r.ok && (await A(`A.hamta('flikar.sova')`)) === 60, r.r);
    r = await gor({ name: 'anpassa', value: 'flikar.sova|45' });
    res.ok('Falk: sovande flikar 45 nekas', !r.r.ok && /Tillåtna värden: 0, 15, 30, 60, 120/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'flikar.vertikalBredd|1000 px' });
    res.ok('Falk: panelens bredd utanför intervallet nekas', !r.r.ok && /från 170 till 420/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'flikar.vertikalBredd|300 px' });
    res.ok('Falk: panelens bredd 300', r.r.ok && (await A(`A.hamta('flikar.vertikalBredd')`)) === 300, r.r);
    r = await gor({ name: 'anpassa', value: 'tema.lage|lila' });
    res.ok('Falk: fel värde nekas med tillåtna värden', !r.r.ok && /Tillåtna värden: ljust, morkt, system/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'tema.accent|blåaktig' });
    res.ok('Falk: okänd färg nekas', !r.r.ok && /hex/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'arbetsytor.lista|Skola' });
    res.ok('Falk: arbetsytornas lista ändras inte av Falk', !r.r.ok && /Inställningar/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'tema.densitet|standard' });
    res.ok('Falk: "standard" återställer en inställning', r.r.ok && (await A(`A.hamta('tema.densitet')`)) === 'normal', r.r);
    r = await gor({ name: 'formatera_disken', value: 'ja' });
    res.ok('Falk: okänd handling nekas', !r.r.ok, r.r);

    // "ångra det": ett Falk-svar ångras på en gång, inget annat
    await A(`A.satt('tema.lage', 'ljust', { etikett: 'Ljust eller mörkt' }) && 1`);
    await H.sov(3200);   // ett nytt svar från Falk
    await gor({ name: 'anpassa', value: 'tema.accent|orange' });
    await gor({ name: 'anpassa', value: 'flikar.lage|dolda' });
    r = await gor({ name: 'anpassa_angra' });
    const efterF = await A(`[A.hamta('tema.accent'), A.hamta('flikar.lage'), A.hamta('tema.lage')].join('|')`);
    res.ok('Falk: "ångra det" ångrar hela svaret', r.r.ok && r.r.antal === 2 && efterF === '#1f6b3a|vertikal|ljust' && r.med[0].angrat === true, { r: r.r, efterF });

    // Egen CSS för en sajt: "sajt: css", bara efter "Tillåt" i en ruta – med sajten, CSS:en och varningen i rutan
    r = await gor({ name: 'anpassa', value: 'avancerat.css|body{background:red}' }, true);
    res.ok('Falk: egen CSS utan sajt nekas (ingen ruta)', !r.r.ok && /sajten/.test(r.r.fel) && r.fragor.length === 0 && (await css()) === '[]', r);
    r = await gor({ name: 'anpassa', value: 'avancerat.css|example.com: body{background:red}' }, false);
    res.ok('Falk: egen CSS frågar först – Avbryt stoppar', !r.r.ok && r.r.stoppad && r.fragor.length === 1 && (await css()) === '[]', r);
    res.ok('Falk: rutan visar sajten, CSS:en och varnar', /Egen CSS/.test(r.fragor[0].m) && /example\.com/.test(r.fragor[0].d) && /body\{background:red\}/.test(r.fragor[0].d) && /webbsida/.test(r.fragor[0].d), r.fragor);
    r = await gor({ name: 'anpassa', value: 'avancerat.css|https://www.Example.com/sida: body{background:red}' }, true);
    const regel = JSON.parse(await css())[0] || {};
    res.ok('Falk: egen CSS efter Tillåt, i områdets format', r.r.ok && JSON.parse(await css()).length === 1 && regel.mal === 'example.com' && regel.css === 'body{background:red}' && regel.pa === true && regel.under === true && typeof regel.id === 'string' && regel.id.length > 4, { r: r.r, regel });
    r = await gor({ name: 'anpassa', value: 'avancerat.css|example.com: body{background:blue}' }, true);
    res.ok('Falk: samma sajt igen byter CSS:en (ingen ny regel)', r.r.ok && JSON.parse(await css()).length === 1 && JSON.parse(await css())[0].css === 'body{background:blue}' && JSON.parse(await css())[0].id === regel.id, await css());
    const listan2 = await m.kor(`JSON.stringify(__T.F.lista())`);
    res.ok('Falk: CSS-innehållet skickas aldrig till AI:n', JSON.parse(listan2).find((x) => x.nyckel === 'avancerat.css').nu === '(1 st)' && !/background|example\.com/.test(listan2), JSON.parse(listan2).find((x) => x.nyckel === 'avancerat.css'));
    r = await gor({ name: 'anpassa_angra' }, false);
    res.ok('Falk: ångra egen CSS frågar också först', !r.r.ok && r.r.stoppad && /background:blue/.test(await css()), r.r);
    r = await gor({ name: 'anpassa_aterstall', value: 'avancerat' }, false);
    res.ok('Falk: återställa egen kod frågar först', !r.r.ok && r.r.stoppad && r.fragor.length === 1, r);
    r = await gor({ name: 'anpassa', value: 'avancerat.css|annan.se:' }, true);
    res.ok('Falk: ta bort CSS som inte finns', !r.r.ok && /ingen egen CSS för annan\.se/.test(r.r.fel), r.r);
    r = await gor({ name: 'anpassa', value: 'avancerat.skript|alert(1)' }, true);
    res.ok('Falk: användarskript ändras aldrig av Falk', !r.r.ok && r.fragor.length === 0 && /Inställningar/.test(r.r.fel) && (await A(`JSON.stringify(A.hamta('avancerat.skript'))`)) === '[]', r);
    r = await gor({ name: 'anpassa', value: 'sajt.exempel.se|{"js":false}' }, true);
    res.ok('Falk: per-sajt-inställningar ändras i Inställningar', !r.r.ok && r.fragor.length === 0 && /Inställningar/.test(r.r.fel), r.r);
    const spNu = (await A(`A.hamta('sidopanel.visa')`)) === true, spNytt = spNu ? 'av' : 'på';   // tvärtom mot nu (standard: av tills första appen)
    r = await gor({ name: 'anpassa', value: 'sidopanel.visa|' + spNytt }, false);
    res.ok('Falk: barnlåst på/av (sidopanelen) frågar först', !r.r.ok && r.r.stoppad && r.fragor.length === 1 && new RegExp('Nytt värde: ' + spNytt).test(r.fragor[0].d) && (await A(`A.hamta('sidopanel.visa')`)) === spNu, r);

    // "återställ utseendet" (tema) – frågar inte; "återställ allt" frågar
    r = await gor({ name: 'anpassa_aterstall', value: 'utseendet' });
    res.ok('Falk: "återställ utseendet" → tema', r.r.ok && r.r.vad === 'tema' && r.fragor.length === 0 && (await A(`A.hamta('tema.accent') + A.hamta('tema.lage')`)) === '#ff4b1f' + (await std('tema.lage')) && (await A(`A.hamta('flikar.lage')`)) === 'vertikal', r);
    r = await gor({ name: 'anpassa_aterstall', value: 'allt' }, false);
    res.ok('Falk: "återställ allt" frågar först', !r.r.ok && r.r.stoppad && (await A(`A.hamta('flikar.lage')`)) === 'vertikal', r.r);

    // Barnläge: barnlåst går inte (och frågar inte ens), utseende går
    await s.kor(`window.view.barnRegler({ last: false, blocklist: [], allows: [] }); 1`);
    await H.sov(400);
    const cssFore = await css();
    r = await gor({ name: 'anpassa', value: 'avancerat.css|alla sajter: *{display:none}' });
    res.ok('Falk i barnläge: egen CSS låst', !r.r.ok && r.r.last === true && r.fragor.length === 0 && (await css()) === cssFore, r);
    r = await gor({ name: 'anpassa', value: 'sidopanel.visa|' + spNytt });
    res.ok('Falk i barnläge: sidopanelen låst (frågar inte ens)', !r.r.ok && r.r.last === true && r.fragor.length === 0, r);
    r = await gor({ name: 'anpassa', value: 'tema.accent|blå' });
    res.ok('Falk i barnläge: färg går bra', r.r.ok && (await A(`A.hamta('tema.accent')`)) === '#1d6fd8', r.r);
    res.ok('Falk i barnläge: listan säger "låst"', (await m.kor(`__T.F.lista().find((x) => x.nyckel === 'avancerat.css').last`)) === true);
    await s.kor(`window.view.barnRegler(null); 1`);
    await H.sov(300);

    // Skalet visar en toast när Falk ändrar (verktyget med vanlig meddela)
    await vantaToastBort(s);
    await m.kor(`__T.F.gor({ win: __T.fonster() }, { name: 'anpassa', value: 'tema.densitet|luftig' }, { bekrafta: async () => true }).then(() => 1)`);
    await H.sov(500);
    res.ok('toast när Falk ändrar', (await toast(s)) === 'Ändrat: Densitet · Ångra', await toast(s));

    /* ───────── Hela vägen via Falk-panelen (svaret byts ut, ingen AI) ───────── */
    await m.kor(`(() => { const h = __T.el.ipcMain._invokeHandlers; __T.fragade = [];
      __T.svar = []; __T.skickat = [];
      h.set('krypto:samtycke', async () => true);
      h.set('krypto:chat', async (_e, messages) => { __T.skickat.push(messages); return { ok: true, reply: __T.svar.shift() || 'Ok.' }; });
      __T.el.dialog.showMessageBox = async (...a) => { __T.fragade.push(a[a.length - 1]); return { response: 0 }; };   // "Avbryt"
      return 1; })()`);
    await s.kor(`window.view.kryptoToggle(true, 'pro', null); 1`);
    const kt = await H.mal(app.port, (t) => t.url.includes('krypto.html'), 15000);
    res.ok('Falk-panelen öppnas', !!kt);
    if (kt) {
      const k = await H.anslut(kt.webSocketDebuggerUrl);
      await k.skicka('Runtime.enable');
      await H.sov(1500);
      res.ok('panelen har verktyget, skalet har det inte', (await k.kor(`typeof window.FalkAnpassa === 'object' && typeof window.anpassaFalk === 'object'`)) && (await s.kor(`typeof window.anpassaFalk === 'undefined'`)));
      const fel = await m.kor(`(async () => { const wc = __T.fonster().webContents; return JSON.stringify(await __T.el.ipcMain._invokeHandlers.get('anpassa-falk:gor')({ sender: wc, senderFrame: wc.mainFrame }, { name: 'anpassa', value: 'tema.accent|röd' })); })()`).then(JSON.parse);
      res.ok('huvudprocessen nekar andra än Falk-panelen', !fel.ok && /avsändare/.test(fel.fel), fel);
      await A(`A.aterstall('tema.')`); await A(`A.satt('flikar.lage', 'upptill', { etikett: 'Flikarnas placering' }) && 1`);
      await m.kor(`(() => { __T.svar.push('Klart! Flikarna ligger nu på sidan och accentfärgen är mörkgrön. Det går att ångra. [[gör:anpassa=flikar.lage|vertikal]] [[gör:anpassa=tema.accent|#1f6b3a]]'); return 1; })()`);
      await vantaToastBort(s);
      await k.kor(`inp.value = 'gör flikarna vertikala och accentfärgen mörkgrön'; send(); 1`);
      await H.sov(3200);
      res.ok('panelen: båda ändringarna gjordes', (await A(`A.hamta('flikar.lage') + '|' + A.hamta('tema.accent')`)) === 'vertikal|#1f6b3a');
      const steg = await k.kor(`JSON.stringify([...document.querySelectorAll('#log .steps .step')].map((e) => e.textContent))`).then(JSON.parse);
      res.ok('panelen: stegen visas i chatten', steg.includes('Ändrade flikarnas placeringvertikal') && steg.includes('Ändrade accentfärg#1f6b3a'), steg);
      const svarText = await k.kor(`String((history.filter((h) => h.role === 'assistant').slice(-1)[0] || {}).content || '')`);
      res.ok('panelen: taggarna syns inte i svaret', !/\[\[gör/.test(svarText) && /Klart! Flikarna ligger nu på sidan/.test(svarText), svarText);
      const prompt = await m.kor(`(() => { const ms = __T.skickat[0] || []; return String((ms[0] || {}).content || ''); })()`);
      res.ok('Falks instruktioner: exempel och listan ANPASSA', /gör flikarna vertikala/.test(prompt) && /\[\[gör:anpassa=tema\.accent\|#1f6b3a\]\]/.test(prompt) && /ANPASSA \(det du kan ändra/.test(prompt) && /flikar\.lage · Flikarnas placering · nu upptill · upptill \| vertikal \| dolda/.test(prompt) && !/body\{background/.test(prompt), prompt.slice(-600));
      res.ok('skalet: toast för Falks ändringar', /^Ändrat: (Flikarnas placering, Accentfärg|Accentfärg, Flikarnas placering) · Ångra$/.test(await toast(s)), await toast(s));
      await bild(s, 'angra-6-falk-toast.png');
      await bild(k, 'falk-1-panelen.png');
      // "ångra det"
      await m.kor(`(() => { __T.svar.push('Ångrat. [[gör:anpassa_angra]]'); return 1; })()`);
      await k.kor(`inp.value = 'ångra det'; send(); 1`);
      await H.sov(2500);
      res.ok('panelen: "ångra det" ångrar båda', (await A(`A.hamta('flikar.lage') + '|' + A.hamta('tema.accent')`)) === 'upptill|#ff4b1f');
      // Egen CSS via panelen: rutan kommer (Avbryt), inget ändras
      const cssFore2 = await css();
      await m.kor(`(() => { __T.svar.push('Jag lägger in CSS:en. [[gör:anpassa=avancerat.css|example.com: body{filter:invert(1)}]]'); return 1; })()`);
      await k.kor(`inp.value = 'gör allt inverterat med css'; send(); 1`);
      await H.sov(2500);
      const ruta = await m.kor(`JSON.stringify(__T.fragade)`).then(JSON.parse);
      res.ok('panelen: egen CSS ger en ruta med Avbryt förvalt', ruta.length === 1 && ruta[0].defaultId === 0 && ruta[0].cancelId === 0 && ruta[0].buttons.join() === 'Avbryt,Tillåt' && /filter:invert/.test(ruta[0].detail), ruta);
      res.ok('panelen: Avbryt → inget ändrat', (await css()) === cssFore2);
      const steg2 = await k.kor(`JSON.stringify([...document.querySelectorAll('#log .steps .step')].map((e) => e.textContent))`).then(JSON.parse);
      res.ok('panelen: "Du stoppade ändringen" visas', steg2.some((t) => /Du stoppade ändringen/.test(t)), steg2);
      await bild(k, 'falk-2-stoppad.png');
      k.stang();
    }

    const fel2 = s.handelser.filter((h) => h.method === 'Runtime.exceptionThrown' || (h.method === 'Runtime.consoleAPICalled' && h.params.type === 'error'))
      .map((h) => JSON.stringify(h.params).slice(0, 300)).filter((t) => /anpassa|Angra|angra/i.test(t));
    res.ok('inga fel från Ångra i konsolen', !fel2.length, fel2);
  } catch (e) {
    res.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    if (app) await stoppaApp(app);
    x.stoppa();
  }
  console.log(res.text());
  console.log('\nSkärmdumpar: ' + BILDER);
  console.log(res.fel.length ? '\n' + res.fel.length + ' FEL' : '\nALLT OK (' + res.rader.length + ' kontroller)');
  process.exit(res.fel.length ? 1 : 0);
})();
