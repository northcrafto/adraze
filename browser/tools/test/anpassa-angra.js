// Test: Anpassa › Ångra-panelen och Falk ändrar inställningar. Kör: node tools/test/anpassa-angra.js [mapp för skärmdumpar]
// Startar dev-appen OSYNLIGT (egen Xvfb, egen profil). Huvudprocessen nås via inspektorn (--inspect på en ledig port,
// bara i testet). Falk testas UTAN riktigt AI-anrop: dels anropas verktyget direkt, dels byts chattsvaret ut i
// huvudprocessen mot ett färdigt svar med taggar – resten (panelen, taggarna, rutan som frågar) är det riktiga.
const fs = require('fs');
const os = require('os');
const path = require('path');
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
async function klick(s, sel) {
  const r = await s.kor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r || typeof r !== 'object') throw new Error('hittar inte ' + sel);
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
const toast = (s) => s.kor(`(() => { const t = document.getElementById('anp-toast'); return t && t.classList.contains('pa') ? t.querySelector('.anp-toast-txt').textContent + (t.classList.contains('utan-angra') ? '' : ' · Ångra') : ''; })()`);
const vantaToastBort = (s) => s.kor(`new Promise((ok) => { const t0 = Date.now(); (function k() { const t = document.getElementById('anp-toast'); if (!t || !t.classList.contains('pa') || Date.now() - t0 > 7000) ok(1); else setTimeout(k, 100); })(); })`);

// Nycklar som de andra områdena registrerar. Finns de inte i den här grenen läggs likadana in för testet.
const TESTNYCKLAR = [
  { nyckel: 'tema.accent', standard: '#ff4b1f', etikett: 'Accentfärg' },
  { nyckel: 'tema.lage', standard: 'system', etikett: 'Ljust eller mörkt' },
  { nyckel: 'tema.densitet', standard: 'normal', etikett: 'Densitet' },
  { nyckel: 'flikar.lage', standard: 'upptill', etikett: 'Flikarnas placering' },
  { nyckel: 'verktyg.knappar', standard: ['bakat', 'framat', 'ladda'], etikett: 'Knappar i verktygsfältet' },
  { nyckel: 'avancerat.css', standard: '', etikett: 'Egen CSS', barnLast: true, importBar: false },
  { nyckel: 'sajt.*', standard: null, etikett: 'Inställningar per sajt', barnLast: true },
];

(async () => {
  const x = await H.startaXvfb();
  const profil = H.tempDir('angra');
  const logg = path.join(profil, 'logg.txt');
  let app = null;
  try {
    app = await startaApp(x, profil, logg);
    const { s, m } = app;
    // Huvudprocessens moduler, en gång
    const lagda = await m.kor(`(() => { const r = (x) => process.mainModule.require(x);
      globalThis.__T = { el: r('electron'), A: r('./anpassa'), F: r('./anpassa-falk'), G: r('./anpassa-angra') };
      const reg = __T.A.registret(); const lagt = [];
      for (const d of ${JSON.stringify(TESTNYCKLAR)}) if (!reg[d.nyckel]) { __T.A.registrera(d); lagt.push(d.nyckel); }
      __T.fonster = () => __T.el.BrowserWindow.getAllWindows().find((w) => /shell\\.html/.test(w.webContents.getURL()));
      return lagt; })()`);
    res.ok('huvudprocessen nås (testnycklar: ' + (Array.isArray(lagda) ? lagda.length : '?') + ')', Array.isArray(lagda), lagda);
    const A = (expr) => m.kor('(() => { const A = __T.A; return ' + expr + '; })()');

    /* ───────── Ångra-panelen ───────── */
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(700);
    await stadaSkal(s);
    res.ok('panelen ritas i #anp-angra', await s.kor(`(() => { const h = document.querySelector('#anp-angra h3'); return !!h && h.textContent === 'Ångra och spara' && !!document.getElementById('anp-hist'); })()`));
    res.ok('tom: "Inga ändringar än" och Ångra avstängd', await s.kor(`document.querySelector('#anp-hist .anp-h-tom') !== null && document.getElementById('anp-angra-senaste').disabled`));

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
    await s.kor(`(async () => { await Anpassa.set('tema.accent', '#2f9e67', 'Accentfärg'); await Anpassa.set('flikar.lage', 'vertikalt', 'Flikarnas placering');
      await Anpassa.set('verktyg.knappar', ['bakat', 'ladda'], 'Knappar i verktygsfältet'); await Anpassa.set('arbetsytor.vaxlare', false, 'Väljaren för arbetsytor');
      await Anpassa.set('tema.densitet', 'kompakt', 'Densitet'); await Anpassa.set('tema.lage', 'morkt', 'Ljust eller mörkt'); return 1; })()`);
    await H.sov(500);
    res.ok('ingen toast för ändringar utan klick', (await toast(s)) === '');
    await s.kor(`AnpassaAngra.rita()`);
    await H.sov(300);
    const rader = await s.kor(`JSON.stringify([...document.querySelectorAll('#anp-hist .anp-h')].map((li) => li.textContent))`).then(JSON.parse);
    res.ok('listan: senaste först, läsbar, 5 st', rader.length === 5 && /^Ljust eller mörkt ändradesmörkt· \d\d:\d\d$/.test(rader[0]) && /^Väljaren för arbetsytor ändradesav· /.test(rader[2]), rader);
    res.ok('listan: tid "· 19:42"', rader.every((r) => /· \d\d:\d\d$/.test(r)), rader);
    res.ok('"Visa alla" när det finns fler än 5', await s.kor(`(() => { const b = document.getElementById('anp-hist-mer'); return !b.hidden && /Visa alla \\(\\d+\\)/.test(b.textContent); })()`));
    await klick(s, '#anp-hist-mer');
    await H.sov(300);
    res.ok('"Visa alla" visar alla', await s.kor(`document.querySelectorAll('#anp-hist .anp-h').length === 6 && document.getElementById('anp-hist-mer').textContent === 'Visa färre'`));
    res.ok('listan: färgprov för färger', await s.kor(`!!document.querySelector('#anp-hist .anp-h-farg[title="#2f9e67"]')`));
    await s.kor(`document.getElementById('anp-angra').scrollIntoView({ block: 'start' }); 1`);
    await H.sov(300);
    await bild(s, 'angra-2-panelen.png');
    await klick(s, '#anp-hist-mer');

    // Ctrl+Z i Anpassa ångrar (inte i ett textfält)
    await s.kor(`document.activeElement && document.activeElement.blur(); 1`);
    await ctrlZ(s);
    res.ok('Ctrl+Z ångrar senaste', (await A(`A.hamta('tema.lage')`)) === 'system', await A(`A.hamta('tema.lage')`));
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
    await s.kor(`(async () => { await Anpassa.set('tema.densitet', 'luftig', 'Densitet'); await Anpassa.set('tema.lage', 'ljust', 'Ljust eller mörkt'); return 1; })()`);
    await s.kor(`Anpassa.aterstall('tema.')`);
    const efterAter = await A(`JSON.stringify([A.hamta('tema.accent'), A.hamta('tema.densitet'), A.hamta('tema.lage')])`);
    const g = await s.kor(`window.anpassaAngra.angra().then(JSON.stringify)`).then(JSON.parse);
    const efterAngra = await A(`JSON.stringify([A.hamta('tema.accent'), A.hamta('tema.densitet'), A.hamta('tema.lage')])`);
    res.ok('återställning av ett område: allt tillbaka med EN ångra', efterAter === '["#ff4b1f","normal","system"]' && efterAngra === '["#2f9e67","luftig","ljust"]' && g.antal === 3, { efterAter, efterAngra, g });

    // Exportera: kod + spara som fil (spara-rutan byts ut i testet)
    const fil = path.join(profil, 'mina-installningar.txt');
    await m.kor(`(() => { __T.el.dialog.showSaveDialog = async () => ({ canceled: false, filePath: ${JSON.stringify(fil)} }); return 1; })()`);
    await s.kor(`(async () => { await Anpassa.set('avancerat.css', 'body { outline: 1px solid red }', 'Egen CSS'); return 1; })()`);
    await klick(s, '#anp-exp-knapp');
    await H.sov(400);
    const kod = await s.kor(`document.getElementById('anp-exp-kod').value`);
    let innehall = {}; try { innehall = JSON.parse(Buffer.from(String(kod).slice(6), 'base64url').toString('utf8')); } catch {}
    res.ok('export: ADRZ1-kod med inställningarna', /^ADRZ1\./.test(kod) && innehall['tema.accent'] === '#2f9e67' && innehall['flikar.lage'] === 'vertikalt', Object.keys(innehall));
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
    res.ok('återställ allt: Ångra tar tillbaka allt', (await A(`A.hamta('tema.accent') + '|' + A.hamta('flikar.lage') + '|' + A.hamta('avancerat.css')`)) === '#2f9e67|vertikalt|body { outline: 1px solid red }');

    // Importera kod (egen CSS följer aldrig med)
    await A(`A.aterstall()`);
    await klick(s, '#anp-imp-knapp');
    await s.kor(`document.getElementById('anp-imp-kod').focus(); 1`);
    await skriv(s, kod);
    await klick(s, '#anp-imp-kor');
    await H.sov(500);
    res.ok('import: värdena tillbaka', (await A(`A.hamta('tema.accent') + '|' + A.hamta('flikar.lage')`)) === '#2f9e67|vertikalt');
    res.ok('import: egen CSS följer inte med', (await A(`A.hamta('avancerat.css')`)) === '');
    res.ok('import: meddelande', /^Klart! \d+ inställningar importerades\.$/.test(await s.kor(`document.getElementById('anp-imp-not').textContent`)), await s.kor(`document.getElementById('anp-imp-not').textContent`));
    // Importera fil
    await A(`A.aterstall()`);
    const doc = await s.skicka('DOM.getDocument', { depth: 0 });
    const nod = await s.skicka('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#anp-imp-fil' });
    await s.skicka('DOM.setFileInputFiles', { nodeId: nod.result.nodeId, files: [fil] });
    await H.sov(700);
    res.ok('import från fil', (await A(`A.hamta('tema.accent') + '|' + A.hamta('flikar.lage')`)) === '#2f9e67|vertikalt');
    // Fel kod
    await s.kor(`document.getElementById('anp-imp-kod').value = 'hej'; 1`);
    await klick(s, '#anp-imp-kor');
    await H.sov(300);
    res.ok('import: fel kod säger till', /inte rätt/.test(await s.kor(`document.getElementById('anp-imp-not').textContent`)));
    await bild(s, 'angra-5-import.png');
    await klick(s, '#anp-imp-knapp');

    /* ───────── Falk ändrar inställningar (verktyget direkt, utan AI) ───────── */
    const gor = (a, svar = true) => m.kor(`(async () => { const fragor = [], med = [];
      const r = await __T.F.gor({ win: __T.fonster() }, ${JSON.stringify(a)}, { bekrafta: async (m, d) => { fragor.push({ m, d }); return ${!!svar}; }, meddela: (d) => med.push(d) });
      return JSON.stringify({ r, fragor, med }); })()`).then(JSON.parse);
    await A(`A.aterstall()`);
    const lista = await m.kor(`JSON.stringify(__T.F.lista())`).then(JSON.parse);
    const rad = (k) => lista.find((x) => x.nyckel === k) || {};
    res.ok('Falk: listan läses ur registret', rad('flikar.lage').val === 'upptill | vertikalt | dolda' && rad('tema.accent').val === 'färg (#rrggbb)' && rad('tema.accent').nu === '#ff4b1f', lista.slice(0, 4));
    res.ok('Falk: egen CSS "frågar först", arbetsytorna ändras i Inställningar', rad('avancerat.css').fraga === true && rad('arbetsytor.lista').val === 'ändras i Inställningar' && !!rad('sajt.<namn>').nyckel);

    let r = await gor({ name: 'anpassa', value: 'flikar.lage|vertikala' });
    res.ok('Falk: "gör flikarna vertikala"', r.r.ok && (await A(`A.hamta('flikar.lage')`)) === 'vertikalt' && r.med[0].etiketter[0] === 'Flikarnas placering', r);
    r = await gor({ name: 'anpassa', value: 'tema.accent|mörkgrön' });
    res.ok('Falk: "mörkgrön accentfärg"', r.r.ok && (await A(`A.hamta('tema.accent')`)) === '#1f6b3a', r.r);
    r = await gor({ name: 'anpassa', value: 'tema.accent|#1F6B3A' });
    res.ok('Falk: samma värde igen = redan inställt', r.r.ok && r.r.redan === true, r.r);
    r = await gor({ name: 'anpassa', value: 'tema.densitet|kompaktare' });
    res.ok('Falk: "kompaktare"', r.r.ok && (await A(`A.hamta('tema.densitet')`)) === 'kompakt', r.r);
    r = await gor({ name: 'anpassa', value: 'Tema.Läge = mörkt' });
    res.ok('Falk: "mörkt läge" (stavning med å/ä/ö och versaler)', r.r.ok && (await A(`A.hamta('tema.lage')`)) === 'morkt', r.r);
    r = await gor({ name: 'anpassa', value: 'verktyg.knappar|bakat, ladda' });
    res.ok('Falk: lista med komma emellan', r.r.ok && (await A(`JSON.stringify(A.hamta('verktyg.knappar'))`)) === '["bakat","ladda"]', r.r);
    r = await gor({ name: 'anpassa', value: 'arbetsytor.vaxlare|av' });
    res.ok('Falk: på/av', r.r.ok && (await A(`A.hamta('arbetsytor.vaxlare')`)) === false, r.r);
    r = await gor({ name: 'anpassa', value: 'tema.typsnitt|Comic Sans' });
    res.ok('Falk: okänd nyckel nekas', !r.r.ok && /finns inte/.test(r.r.fel), r.r);
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
    res.ok('Falk: "ångra det" ångrar hela svaret', r.r.ok && r.r.antal === 2 && efterF === '#1f6b3a|vertikalt|ljust' && r.med[0].angrat === true, { r: r.r, efterF });

    // Egen CSS: bara efter "Tillåt" i en ruta – med värdet och varningen i rutan
    r = await gor({ name: 'anpassa', value: 'avancerat.css|body{background:red}' }, false);
    res.ok('Falk: egen CSS frågar först – Avbryt stoppar', !r.r.ok && r.r.stoppad && r.fragor.length === 1 && (await A(`A.hamta('avancerat.css')`)) === '', r);
    res.ok('Falk: rutan visar vad och varnar', /Egen CSS/.test(r.fragor[0].m) && /body\{background:red\}/.test(r.fragor[0].d) && /webbsida/.test(r.fragor[0].d), r.fragor);
    r = await gor({ name: 'anpassa', value: 'avancerat.css|body{background:red}' }, true);
    res.ok('Falk: egen CSS efter Tillåt', r.r.ok && (await A(`A.hamta('avancerat.css')`)) === 'body{background:red}');
    res.ok('Falk: CSS-innehållet skickas aldrig till AI:n', (await m.kor(`__T.F.lista().find((x) => x.nyckel === 'avancerat.css').nu`)) === '(eget innehåll)');
    r = await gor({ name: 'anpassa_angra' }, false);
    res.ok('Falk: ångra egen CSS frågar också först', !r.r.ok && r.r.stoppad && (await A(`A.hamta('avancerat.css')`)) === 'body{background:red}', r.r);
    r = await gor({ name: 'anpassa_aterstall', value: 'avancerat' }, false);
    res.ok('Falk: återställa egen kod frågar först', !r.r.ok && r.r.stoppad && r.fragor.length === 1, r);
    r = await gor({ name: 'anpassa', value: 'sajt.exempel.se|{"js":false}' }, false);
    res.ok('Falk: per-sajt-inställning frågar först', !r.r.ok && r.r.stoppad, r.r);

    // "återställ utseendet" (tema) – frågar inte; "återställ allt" frågar
    r = await gor({ name: 'anpassa_aterstall', value: 'utseendet' });
    res.ok('Falk: "återställ utseendet" → tema', r.r.ok && r.r.vad === 'tema' && r.fragor.length === 0 && (await A(`A.hamta('tema.accent') + A.hamta('tema.lage')`)) === '#ff4b1fsystem' && (await A(`A.hamta('flikar.lage')`)) === 'vertikalt', r);
    r = await gor({ name: 'anpassa_aterstall', value: 'allt' }, false);
    res.ok('Falk: "återställ allt" frågar först', !r.r.ok && r.r.stoppad && (await A(`A.hamta('flikar.lage')`)) === 'vertikalt', r.r);

    // Barnläge: barnlåst går inte (och frågar inte ens), utseende går
    await s.kor(`window.view.barnRegler({ last: false, blocklist: [], allows: [] }); 1`);
    await H.sov(400);
    r = await gor({ name: 'anpassa', value: 'avancerat.css|*{display:none}' });
    res.ok('Falk i barnläge: egen CSS låst', !r.r.ok && r.r.last === true && r.fragor.length === 0 && (await A(`A.hamta('avancerat.css')`)) === 'body{background:red}', r);
    r = await gor({ name: 'anpassa', value: 'sajt.exempel.se|{"js":false}' });
    res.ok('Falk i barnläge: per-sajt låst', !r.r.ok && r.r.last === true, r.r);
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
      await m.kor(`(() => { __T.svar.push('Klart! Flikarna ligger nu på sidan och accentfärgen är mörkgrön. Det går att ångra. [[gör:anpassa=flikar.lage|vertikalt]] [[gör:anpassa=tema.accent|#1f6b3a]]'); return 1; })()`);
      await vantaToastBort(s);
      await k.kor(`inp.value = 'gör flikarna vertikala och accentfärgen mörkgrön'; send(); 1`);
      await H.sov(3200);
      res.ok('panelen: båda ändringarna gjordes', (await A(`A.hamta('flikar.lage') + '|' + A.hamta('tema.accent')`)) === 'vertikalt|#1f6b3a');
      const steg = await k.kor(`JSON.stringify([...document.querySelectorAll('#log .steps .step')].map((e) => e.textContent))`).then(JSON.parse);
      res.ok('panelen: stegen visas i chatten', steg.includes('Ändrade flikarnas placeringvertikalt') && steg.includes('Ändrade accentfärg#1f6b3a'), steg);
      const svarText = await k.kor(`String((history.filter((h) => h.role === 'assistant').slice(-1)[0] || {}).content || '')`);
      res.ok('panelen: taggarna syns inte i svaret', !/\[\[gör/.test(svarText) && /Klart! Flikarna ligger nu på sidan/.test(svarText), svarText);
      const prompt = await m.kor(`(() => { const ms = __T.skickat[0] || []; return String((ms[0] || {}).content || ''); })()`);
      res.ok('Falks instruktioner: exempel och listan ANPASSA', /gör flikarna vertikala/.test(prompt) && /\[\[gör:anpassa=tema\.accent\|#1f6b3a\]\]/.test(prompt) && /ANPASSA \(det du kan ändra/.test(prompt) && /flikar\.lage · Flikarnas placering · nu upptill · upptill \| vertikalt \| dolda/.test(prompt), prompt.slice(-600));
      res.ok('skalet: toast för Falks ändringar', /^Ändrat: (Flikarnas placering, Accentfärg|Accentfärg, Flikarnas placering) · Ångra$/.test(await toast(s)), await toast(s));
      await bild(s, 'angra-6-falk-toast.png');
      await bild(k, 'falk-1-panelen.png');
      // "ångra det"
      await m.kor(`(() => { __T.svar.push('Ångrat. [[gör:anpassa_angra]]'); return 1; })()`);
      await k.kor(`inp.value = 'ångra det'; send(); 1`);
      await H.sov(2500);
      res.ok('panelen: "ångra det" ångrar båda', (await A(`A.hamta('flikar.lage') + '|' + A.hamta('tema.accent')`)) === 'upptill|#ff4b1f');
      // Egen CSS via panelen: rutan kommer (Avbryt), inget ändras
      await m.kor(`(() => { __T.svar.push('Jag lägger in CSS:en. [[gör:anpassa=avancerat.css|body{filter:invert(1)}]]'); return 1; })()`);
      await k.kor(`inp.value = 'gör allt inverterat med css'; send(); 1`);
      await H.sov(2500);
      const ruta = await m.kor(`JSON.stringify(__T.fragade)`).then(JSON.parse);
      res.ok('panelen: egen CSS ger en ruta med Avbryt förvalt', ruta.length === 1 && ruta[0].defaultId === 0 && ruta[0].cancelId === 0 && ruta[0].buttons.join() === 'Avbryt,Tillåt' && /filter:invert/.test(ruta[0].detail), ruta);
      res.ok('panelen: Avbryt → inget ändrat', (await A(`A.hamta('avancerat.css')`)) === 'body{background:red}');
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
