#!/usr/bin/env node
// Anpassa › verktyg: verktygsfältet och adressfältet, osynligt i Xvfb mot utvecklingsbygget.
// Testar nycklarna, att standardraden är oförändrad, högerklicksmenyn, anpassa-läget med riktig mus (dra till
// lådan, tillbaka till raden, flytta, menyknappen och adressfältet kan inte tas bort, Esc/Klar), att ordningen
// sparas över en omstart, listan i Inställningar › Anpassa (pilar, reglage, Falk i synk, återställ), adressfältet
// (hela adressen/domänen, https:// och www., hela adressen när du klickar i fältet), raden längst ner (webbytan,
// förslagslistan uppåt, rutorna ovanför raden, inget hopp när fönstret ändrar storlek) och bokmärkesfältet
// (alltid / på ny flik / aldrig, i synk med Utseende och Ctrl+Shift+B).
// Huvudprocessen nås via Node-inspektören på en slumpad ledig port (bara i testet, som sakerhet.js).
// Användning: node tools/test/anpassa-verktyg.js [webbläsarmapp]   (avslutar med 0 om allt gick igenom)
//   ADRAZE_TEST_BILDER = mapp att spara skärmdumpar i (valfritt)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const H = require('./hjalp');

const BILDER = process.env.ADRAZE_TEST_BILDER || '';
const STANDARD = 'tillbaka framat uppdatera adressfalt falk chatt nedladdningar installningar konto meny';
const NYA = ['hem', 'lasvy', 'bokmarken', 'historik', 'planbok', 'tillagg'];
const SIDA = 'https://example.com/a/b?c=1';

async function startaApp(rot, x, profil) {
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const p = H.starta(path.join(rot, 'node_modules', 'electron', 'dist', 'electron'), ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  const app = { p, logg, s: null, huvud: null };
  app.stang = async () => {
    try { await app.s.kor(`(() => { for (const t of tabs.slice(1)) closeTab(t); return 1; })()`); await H.sov(500); } catch {}   // en flik: inget "Stäng alla flikar?"
    try { app.s.stang(); } catch {}
    try { app.huvud.stang(); } catch {}
    return H.stang(p);
  };
  await H.vantaPaPort(cdp);
  const t = await H.mal(cdp, (t) => t.url.includes('shell.html'));
  if (!t) throw new Error('skalet startade inte');
  await H.sov(2000);
  let mal = null;
  for (let i = 0; i < 20 && !mal; i++) { try { mal = (await H.hamtaJson(insp, '/json'))[0]; } catch { await H.sov(250); } }
  if (!mal) throw new Error('huvudprocessens inspektör svarade inte');
  app.huvud = await H.anslut(mal.webSocketDebuggerUrl);
  await app.huvud.skicka('Runtime.enable');
  app.s = await H.anslut(t.webSocketDebuggerUrl);
  await app.s.skicka('Runtime.enable');
  await app.s.skicka('Emulation.setFocusEmulationEnabled', { enabled: true });   // fönstret får aldrig fokus i Xvfb
  // introt och notiserna (flytta hit / standardwebbläsare) bort, så att de inte ligger över det vi klickar på
  await app.s.kor(`(() => { try { localStorage.setItem('adraze-flytt-erbjuden', '1'); localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 864e5)); } catch {}
    for (const id of ['hxintro', 'flytt-banner', 'defbrowser-banner']) { const e = document.getElementById(id); if (e) e.remove(); } return 1; })()`);
  return app;
}

async function kor(rot) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('verktyg');
  if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
  let app = null;
  let s, M, E;
  const koppla = (a) => {
    app = a; s = a.s;
    M = (js) => a.huvud.kor(`(async () => { const el = process.mainModule.require('electron'); const fonster = () => el.BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/ui/shell.html')); ${js} })()`);
    E = (js) => s.kor(`(async () => { ${js} })()`);
  };
  const vanta = async (js, ms = 6000) => { let v; for (let i = 0; i < ms / 100; i++) { v = await E(js); if (v && !String(v).startsWith('FEL')) return v; await H.sov(100); } return v; };
  const rad = () => E(`return [...document.getElementById('toolbar').children].filter((e) => e.dataset.anpId && !e.classList.contains('anp-dold')).map((e) => e.dataset.anpId).join(' ')`);
  const lada = () => E(`return [...document.querySelectorAll('#anp-vf-lage .anp-vf-bit')].map((e) => e.dataset.id).join(' ')`);
  const varde = async (k) => JSON.parse(await E(`return JSON.stringify(Anpassa.get(${JSON.stringify(k)}) ?? null)`));
  const satt = (k, v) => E(`return (await Anpassa.set(${JSON.stringify(k)}, ${JSON.stringify(v)}, 'test')).ok`);
  const adress = () => E(`return document.getElementById('address').value`);
  // synliga webbvyer i fönstret (flikens sida), i fönstrets koordinater
  const vyer = async () => JSON.parse(await M(`return JSON.stringify(fonster().contentView.children.filter((c) => c.getVisible && c.getVisible()).map((c) => c.getBounds()))`));
  const rekt = async (sel) => {
    const r = await E(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; let r = e.getBoundingClientRect();
      // i inställningarna ligger sökrutan fast överst: ställ alltid raden mitt i bild innan du klickar
      if (e.closest('#settings') || r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: 'center' }); r = e.getBoundingClientRect(); }
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height })`);
    return r && !String(r).startsWith('FEL') ? JSON.parse(r) : null;
  };
  const mus = (type, px, py, o = {}) => s.skicka('Input.dispatchMouseEvent', { type, x: Math.round(px), y: Math.round(py), clickCount: 1, ...o });
  const klick = async (mal, knapp = 'left') => {
    const p = typeof mal === 'string' ? await rekt(mal) : mal;
    if (!p) throw new Error('hittar inte ' + mal);
    await mus('mouseMoved', p.x, p.y);
    await mus('mousePressed', p.x, p.y, { button: knapp, buttons: knapp === 'left' ? 1 : 2 });
    await mus('mouseReleased', p.x, p.y, { button: knapp, buttons: 0 });
    await H.sov(300);
  };
  // dra med musen i små steg (som en hand), `mitt` körs medan knappen fortfarande hålls nere
  const dra = async (fran, till, mitt) => {
    const a = typeof fran === 'string' ? await rekt(fran) : fran;
    if (!a) throw new Error('hittar inte ' + fran);
    await mus('mouseMoved', a.x, a.y);
    await mus('mousePressed', a.x, a.y, { button: 'left', buttons: 1 });
    for (let i = 1; i <= 10; i++) { await mus('mouseMoved', a.x + (till.x - a.x) * i / 10, a.y + (till.y - a.y) * i / 10, { button: 'left', buttons: 1 }); await H.sov(20); }
    if (mitt) await mitt();
    await mus('mouseReleased', till.x, till.y, { button: 'left', buttons: 0 });
    await H.sov(350);
  };
  const tangent = async (key, code, kod) => {
    await s.skicka('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kod });
    await s.skicka('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kod });
    await H.sov(300);
  };
  // högerklicksmenyn är inbyggd (Menu): fånga den i huvudprocessen, läs etiketterna och "klicka" på ett val
  const fangaMenyer = () => M(`global.__anpMenyer = []; const orig = el.Menu.prototype.popup; if (!orig.__anp) { el.Menu.prototype.popup = function (o) { global.__anpMenyer.push(this); return orig.call(this, o); }; el.Menu.prototype.popup.__anp = true; } return 1`);
  const antalMenyer = () => M(`return global.__anpMenyer.length`);
  const meny = async () => JSON.parse(await M(`const m = global.__anpMenyer[global.__anpMenyer.length - 1]; try { m.closePopup(); } catch {}
    return JSON.stringify(m ? m.items.filter((i) => i.type !== 'separator').map((i) => ({ l: i.label, on: i.enabled, c: i.checked, under: i.submenu ? i.submenu.items.map((j) => ({ l: j.label, c: j.checked })) : null })) : [])`));
  const valjMeny = (etikett, under) => M(`const m = global.__anpMenyer[global.__anpMenyer.length - 1]; let it = m.items.find((i) => i.label.startsWith(${JSON.stringify(etikett)}));
    ${under ? `it = it.submenu.items.find((i) => i.label.startsWith(${JSON.stringify(under)}));` : ''} it.click(); return 1`);
  const bild = async (namn) => {
    if (!BILDER) return;
    const f = path.join(BILDER, namn + '.png');
    try {   // hela fönstret med webbsidorna (kompositorn): skärmen i Xvfb, beskuren till fönstret
      const b = JSON.parse(await M(`return JSON.stringify(fonster().getContentBounds())`));
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1600x1000', '-i', x.display + '+0,0', '-frames:v', '1', '-vf', `crop=${b.width}:${b.height}:${b.x}:${b.y}`, f]);
    } catch {   // utan ffmpeg: bara skalet
      try { fs.writeFileSync(f, Buffer.from(await M(`return (await fonster().webContents.capturePage()).toPNG().toString('base64')`), 'base64')); } catch {}
    }
  };
  const oppnaSida = async (url) => {
    await E(`createTab(${JSON.stringify(url)}); return 1`);
    await vanta(`return active && active.url && active.url.startsWith(${JSON.stringify(url.slice(0, 20))}) && document.getElementById('newtabpage').classList.contains('hidden')`);
    await H.sov(1500);
    await E(`document.getElementById('address').blur(); return 1`);
  };
  const oppnaPanel = async () => {
    await E(`openSettings(); showSettingsCat('anpassa'); return 1`);
    await vanta(`return document.querySelectorAll('#anp-verktyg .anp-vf-rad').length > 0`);
  };

  try {
    koppla(await startaApp(rot, x, profil));

    /* ── 1. Start: nycklarna och standardraden ── */
    R.ok('AnpassaVerktyg finns i fönstret', (await E(`return typeof window.AnpassaVerktyg`)) === 'object');
    const reg = JSON.parse(await E(`return JSON.stringify(window.anpassaBro.alla().register)`));
    const nycklar = ['verktyg.knappar', 'verktyg.adress', 'verktyg.doljSchema', 'verktyg.placering', 'verktyg.bokmarkesfalt'];
    R.ok('nycklarna registrerade', nycklar.every((k) => k in reg), nycklar.filter((k) => !(k in reg)));
    R.ok('inga barnlåsta nycklar (bara utseende)', nycklar.every((k) => reg[k] && !reg[k].barnLast));
    R.ok('standardraden oförändrad', (await rad()) === STANDARD, await rad());
    R.ok('de nya knapparna ligger i lådan från början', (await E(`return ${JSON.stringify(NYA)}.every((id) => document.querySelector('#toolbar [data-anp-id="' + id + '"]').classList.contains('anp-dold'))`)) === true);
    R.ok('verktyg.knappar = standard (null)', (await varde('verktyg.knappar')) === null);
    // IPC-vakten: en webbsida når inte de nya kanalerna
    const fejk = `{ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' }, sender: { id: -1 } }`;
    R.ok('webbsida nekas anpassa-verktyg:meny och :kanter', (await M(`return ['anpassa-verktyg:meny', 'anpassa-verktyg:kanter'].every((k) => el.ipcMain.listeners(k).length > 0 && el.ipcMain.listeners(k).every((f) => f(${fejk}, {}) === null))`)) === true);

    /* ── 2. Adressfältet ── */
    await oppnaSida(SIDA);
    const fore = await vyer();
    R.ok('sidan öppen (en webbvy syns)', fore.length === 1, fore);
    R.ok('standard: kort adress som förut', (await adress()) === 'example.com/a/b?c=1', await adress());
    await satt('verktyg.adress', 'doman');
    R.ok('bara domänen', (await vanta(`return document.getElementById('address').value === 'example.com'`)) === true, await adress());
    await satt('verktyg.doljSchema', false);
    R.ok('domänen med https://', (await vanta(`return document.getElementById('address').value === 'https://example.com'`)) === true, await adress());
    await E(`document.getElementById('address').focus(); return 1`); await H.sov(200);
    R.ok('hela adressen när du klickar i fältet', (await adress()) === SIDA, await adress());
    await E(`document.getElementById('address').blur(); return 1`); await H.sov(200);
    R.ok('tillbaka till domänen när du lämnar fältet', (await adress()) === 'https://example.com', await adress());
    await bild('01-adress-doman');
    await satt('verktyg.adress', 'hel');
    R.ok('hela adressen med https://', (await vanta(`return document.getElementById('address').value === ${JSON.stringify(SIDA)}`)) === true, await adress());
    await satt('verktyg.doljSchema', true);
    await oppnaSida('https://www.example.com/x');
    await satt('verktyg.adress', 'doman');
    R.ok('www. döljs i domänen', (await vanta(`return document.getElementById('address').value === 'example.com'`)) === true, await adress());
    await satt('verktyg.doljSchema', false);
    await satt('verktyg.adress', 'hel');
    R.ok('www. och https:// syns när de inte döljs', (await vanta(`return document.getElementById('address').value === 'https://www.example.com/x'`)) === true, await adress());
    await satt('verktyg.doljSchema', true);
    await E(`closeTab(active); return 1`); await H.sov(600);

    /* ── 3. Högerklicksmenyn ── */
    await fangaMenyer();
    await klick('#chatt-btn', 'right');
    let m = await meny();
    R.ok('högerklick på Chatt: Ta bort + Anpassa…', m.some((i) => i.l === 'Ta bort från verktygsfältet: Chatt') && m.some((i) => i.l === 'Anpassa verktygsfältet…'), m.map((i) => i.l));
    R.ok('Återställ avstängt när inget är ändrat', m.some((i) => i.l === 'Återställ verktygsfältet' && !i.on));
    R.ok('bokmärkesfältets lägen i menyn', JSON.stringify((m.find((i) => i.l === 'Bokmärkesfältet') || {}).under) === JSON.stringify([{ l: 'Visa alltid', c: true }, { l: 'Bara på ny flik', c: false }, { l: 'Aldrig', c: false }]));
    await valjMeny('Ta bort från verktygsfältet');
    R.ok('Ta bort från verktygsfältet: Chatt', (await vanta(`return document.getElementById('chatt-btn').classList.contains('anp-dold')`)) === true, await rad());
    await klick('#menu-btn', 'right');
    m = await meny();
    R.ok('menyknappen: ingen Ta bort', !m.some((i) => i.l.startsWith('Ta bort')) && m.some((i) => i.l === 'Återställ verktygsfältet' && i.on), m.map((i) => i.l));
    const n0 = await antalMenyer();
    await klick('#address', 'right');
    const n1 = await antalMenyer();
    R.ok('i adressfältet: ingen egen meny (klipp ut/kopiera som förut)', n1 === n0 || !(await meny()).some((i) => i.l === 'Anpassa verktygsfältet…'));
    if (n1 !== n0) await meny();
    await E(`document.getElementById('address').blur(); return 1`);

    /* ── 4. Anpassa-läget med musen ── */
    await oppnaSida(SIDA);
    const vyFore = await vyer();
    const oc = await rekt('.omni-center'), fk = await rekt('#krypto-btn');
    await klick({ x: (oc.r + fk.l) / 2, y: oc.y }, 'right');
    m = await meny();
    await valjMeny('Anpassa verktygsfältet');
    R.ok('Anpassa verktygsfältet… öppnar läget', (await vanta(`return AnpassaVerktyg.anpassar && !!document.getElementById('anp-vf-lage')`)) === true);
    R.ok('webbsidan göms medan du anpassar', (await vyer()).length === 0);
    R.ok('lådan: de nya knapparna + Chatt', (await lada()) === 'hem lasvy chatt bokmarken historik planbok tillagg', await lada());
    await bild('02-anpassa');
    // Chatt från lådan till raden, före Falk
    const falk = await rekt('#krypto-btn');
    await dra('#anp-vf-lage .anp-vf-bit[data-id="chatt"]', { x: falk.l + 4, y: falk.y }, () => bild('03-drar-till-raden'));
    R.ok('dra Chatt från lådan till raden (före Falk)', (await rad()) === 'tillbaka framat uppdatera adressfalt chatt falk nedladdningar installningar konto meny', await rad());
    // Konto från raden till lådan
    let lr = await rekt('#anp-vf-lage .anp-vf-lada');
    await dra('#account-btn', { x: lr.x, y: lr.y }, async () => {
      R.ok('lådan lyser när en knapp kan släppas där', (await E(`return document.querySelector('#anp-vf-lage .anp-vf-lada').classList.contains('anp-vf-over')`)) === true);
      R.ok('markören och den dragna knappen syns', (await E(`return !!document.querySelector('.anp-vf-spoke') && document.body.classList.contains('anp-vf-drag')`)) === true);
      await bild('04-drar-till-ladan');
    });
    R.ok('dra Konto till lådan', !(await rad()).includes('konto') && (await lada()).includes('konto'), [await rad(), await lada()]);
    // Startsidan mellan Ladda om och adressfältet
    const re = await rekt('#reload'), om = await rekt('.omni-center');
    await dra('#anp-vf-lage .anp-vf-bit[data-id="hem"]', { x: (re.r + om.l) / 2, y: re.y });
    R.ok('dra Startsidan mellan Ladda om och adressfältet', (await rad()).startsWith('tillbaka framat uppdatera hem adressfalt'), await rad());
    // Inställningar först i raden
    const ba = await rekt('#back');
    await dra('#settings-btn', { x: ba.l + 2, y: ba.y });
    R.ok('flytta Inställningar först', (await rad()).startsWith('installningar tillbaka'), await rad());
    // menyknappen och adressfältet kan inte tas bort
    lr = await rekt('#anp-vf-lage .anp-vf-lada');
    await dra('#menu-btn', { x: lr.x, y: lr.y }, async () => {
      R.ok('lådan säger nej till menyknappen', (await E(`return document.querySelector('#anp-vf-lage .anp-vf-lada').classList.contains('anp-vf-nej')`)) === true);
    });
    R.ok('menyknappen finns kvar', (await rad()).endsWith('meny') && (await E(`return document.querySelector('#anp-vf-lage .anp-vf-tips').textContent`)).includes('Menyknappen'), await rad());
    await bild('05-menyknappen-kvar');
    await dra('.omni-center', { x: lr.x, y: lr.y });
    R.ok('adressfältet finns kvar', (await rad()).includes('adressfalt') && (await E(`return document.querySelector('#anp-vf-lage .anp-vf-tips').textContent`)).includes('Adressfältet'));
    // klick på en knapp i lådan lägger tillbaka den på sin plats
    await klick('#anp-vf-lage .anp-vf-bit[data-id="historik"]');
    R.ok('klick i lådan: Historik tillbaka på sin plats', / falk historik nedladdningar /.test(' ' + (await rad()) + ' '), await rad());
    // knapparna gör ingenting medan du anpassar
    await klick('#settings-btn');
    R.ok('klick på en knapp i raden öppnar inget', (await E(`return document.getElementById('settings').classList.contains('hidden')`)) === true);
    const sparat = await varde('verktyg.knappar');
    R.ok('ordningen sparad i verktyg.knappar', !!sparat && sparat.ordning[0] === 'installningar' && sparat.dolda.includes('konto') && !sparat.dolda.includes('hem') && !sparat.dolda.includes('chatt'), sparat);
    await tangent('Escape', 'Escape', 27);
    R.ok('Esc avslutar', (await E(`return AnpassaVerktyg.anpassar === false && !document.getElementById('anp-vf-lage')`)) === true);
    R.ok('sidan syns igen på samma plats', JSON.stringify(await vyer()) === JSON.stringify(vyFore), [await vyer(), vyFore]);
    await bild('06-efter-anpassning');
    // knapparna fungerar igen: Historik öppnar historiken, Startsidan visar startsidan i samma flik
    await klick('#anp-vf-historik');
    R.ok('Historik-knappen öppnar historiken', (await vanta(`return !document.getElementById('settings').classList.contains('hidden')`)) === true);
    await E(`closeSettings(); const t = tabs.find((t) => t.url && t.url.startsWith('https://example.com')); if (t && active !== t) switchTab(t); return 1`); await H.sov(600);
    R.ok('tillbaka på sidan', (await E(`return !!active.url && active.url.startsWith('https://example.com')`)) === true);
    await klick('#anp-vf-hem');
    R.ok('Startsidan-knappen visar startsidan', (await vanta(`return !document.getElementById('newtabpage').classList.contains('hidden') && !active.url`)) === true);
    R.ok('ingen webbvy på startsidan', (await vyer()).length === 0);

    /* ── 5. Sparat över en omstart ── */
    const radFore = await rad();
    await H.sov(400);   // butiken skriver till disk efter 150 ms
    await app.stang();
    koppla(await startaApp(rot, x, profil));
    R.ok('ordningen kvar efter omstart', (await rad()) === radFore, [await rad(), radFore]);

    /* ── 6. Inställningar › Anpassa ── */
    await oppnaPanel();
    R.ok('panelen: rubriker', (await E(`return [...document.querySelectorAll('#anp-verktyg h3')].map((e) => e.textContent).join('|')`)) === 'Verktygsfältet|Adressfältet|Bokmärkesfältet');
    R.ok('panelen: en rad per knapp', (await E(`return document.querySelectorAll('#anp-verktyg .anp-vf-rad').length`)) === 16);
    R.ok('menyn och adressfältet går inte att stänga av', (await E(`return ['meny', 'adressfalt'].every((id) => document.querySelector('#anp-verktyg .anp-vf-rad[data-id="' + id + '"] input').disabled)`)) === true);
    await E(`document.getElementById('anp-verktyg').scrollIntoView({ block: 'start' }); return 1`); await H.sov(200);
    await bild('07-installningar');
    await klick('#anp-verktyg .anp-vf-rad[data-id="installningar"] [data-roll="ner"]');
    R.ok('pil ner flyttar ett steg', (await rad()).startsWith('tillbaka installningar framat'), await rad());
    R.ok('fokus stannar på pilen', (await E(`const a = document.activeElement; return (a.closest('[data-id]') || {}).dataset.id + '/' + a.dataset.roll`)) === 'installningar/ner');
    await klick('#anp-verktyg .anp-vf-rad[data-id="konto"] .switch');
    R.ok('reglaget visar Konto igen', (await vanta(`return !document.getElementById('account-btn').classList.contains('anp-dold')`)) === true, await rad());
    await klick('#anp-verktyg .anp-vf-rad[data-id="falk"] .switch');
    R.ok('Falk av här = av under Inställningar › Falk', (await vanta(`return document.getElementById('tgl-krypto').checked === false && getComputedStyle(document.getElementById('krypto-btn')).display === 'none'`)) === true);
    await E(`const t = document.getElementById('tgl-krypto'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
    R.ok('Visa Falk-knappen under Falk = på här', (await vanta(`return (' ' + [...document.getElementById('toolbar').children].filter((e) => e.dataset.anpId && !e.classList.contains('anp-dold')).map((e) => e.dataset.anpId).join(' ') + ' ').includes(' falk ') && document.querySelector('#anp-verktyg .anp-vf-rad[data-id="falk"] input').checked`)) === true);
    await klick('#anp-vf-aterstall');
    R.ok('Återställ standard', (await vanta(`return Anpassa.get('verktyg.knappar') == null`)) === true && (await rad()) === STANDARD, await rad());
    R.ok('Återställ avstängd i standardläget', (await E(`return document.getElementById('anp-vf-aterstall').disabled`)) === true);
    await klick('#anp-verktyg [data-val="adress"] [data-v="doman"]');
    await klick('#anp-vf-schema + .track');
    R.ok('panelen: Bara domänen + visa https://', JSON.stringify([await varde('verktyg.adress'), await varde('verktyg.doljSchema')]) === '["doman",false]');
    await klick('#anp-verktyg [data-val="adress"] [data-v="hel"]');
    await klick('#anp-vf-schema + .track');
    await klick('#anp-vf-dra');
    R.ok('Anpassa med dra och släpp: läget öppnas över inställningarna', (await vanta(`return AnpassaVerktyg.anpassar`)) === true);
    await klick('#anp-vf-lage [data-g="klar"]');
    R.ok('Klar: tillbaka i inställningarna', (await E(`return !AnpassaVerktyg.anpassar && !document.getElementById('settings').classList.contains('hidden')`)) === true);

    /* ── 7. Raden längst ner ── */
    await E(`saveBookmarks([{ url: 'https://example.org/', title: 'Example Org', favicon: '' }, { url: 'https://www.wikipedia.org/', title: 'Wikipedia', favicon: '' }]); renderBookmarkBar(); return 1`);
    await klick('#anp-verktyg [data-val="placering"] [data-v="nere"]');
    R.ok('panelen: placering nere', (await varde('verktyg.placering')) === 'nere' && (await E(`return document.body.classList.contains('anp-vf-nere')`)) === true);
    await bild('08-installningar-nere');
    await E(`closeSettings(); return 1`); await H.sov(400);
    await oppnaSida(SIDA);
    const matt = async () => JSON.parse(await E(`const r = (id) => document.getElementById(id).getBoundingClientRect();
      return JSON.stringify({ h: innerHeight, flikar: r('tabstrip').bottom, bm: r('bmbar').height ? r('bmbar').top : null, bmB: r('bmbar').height ? r('bmbar').bottom : null, rad: r('toolbar').top, radB: r('toolbar').bottom })`));
    let mt = await matt(), v = (await vyer())[0];
    R.ok('raden ligger längst ner', mt.radB === mt.h && mt.bm !== null && mt.bm < mt.rad, mt);
    R.ok('sidan börjar under flikarna och slutar ovanför bokmärkesfältet', !!v && v.y === Math.round(mt.flikar) && v.y + v.height === Math.round(mt.bm), [v, mt]);
    await bild('09-nere');
    // förslagslistan öppnas uppåt
    await E(`const a = document.getElementById('address'); a.focus(); a.value = 'wik'; a.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'k' })); return 1`);
    const sug = JSON.parse(await vanta(`const s = document.getElementById('omni-suggest'); if (!s.classList.contains('on') || !s.children.length) return ''; const r = s.getBoundingClientRect(), a = document.getElementById('omnibox').getBoundingClientRect(); return JSON.stringify({ upp: s.classList.contains('anp-upp'), b: r.bottom, t: r.top, at: a.top })`) || '{}');
    R.ok('förslagslistan öppnas uppåt', sug.upp === true && sug.b <= sug.at && sug.t >= 0, sug);
    await bild('10-forslag-uppat');
    await E(`document.getElementById('address').blur(); closeSug(); return 1`); await H.sov(300);
    // nedladdnings-/lösenordsrutan ovanför raden
    R.ok('rutorna hamnar ovanför raden', (await M(`const v = process.mainModule.require('./anpassa-verktyg'); return v.popupY({ bounds: { x: 0, y: 44, width: 1280, height: 694 } }, 98, 200)`)) === 44 + 694 - 200 - 6);
    // fönstret ändrar storlek: webbsidan får aldrig täcka raden, inte ens en bildruta
    const under = Math.round(mt.h - mt.bm);
    const prov = JSON.parse(await M(`const w = fonster(); const ut = [];
      const ta = () => { const cb = w.getContentBounds(); const v = w.contentView.children.find((c) => c.getVisible && c.getVisible()); if (v) { const b = v.getBounds(); ut.push({ h: cb.height, w: cb.width, y: b.y, nedre: b.y + b.height, bredd: b.width }); } };
      const iv = setInterval(ta, 4);
      w.setContentSize(1100, 700);
      await new Promise((r) => setTimeout(r, 350));
      w.setContentSize(1280, 820);
      await new Promise((r) => setTimeout(r, 450));
      clearInterval(iv); return JSON.stringify(ut);`));
    const tacker = prov.filter((p) => p.nedre > p.h - under + 1);
    R.ok('inget hopp: sidan täcker aldrig raden när fönstret ändrar storlek', prov.length > 20 && tacker.length === 0, { prover: prov.length, tacker: tacker.slice(0, 3) });
    const sist = prov[prov.length - 1];
    R.ok('sidan fyller ytan igen efter storleksändringen', !!sist && sist.nedre === sist.h - under && sist.y === v.y && sist.bredd === sist.w, sist);
    // anpassa-läget med raden nere
    await E(`AnpassaVerktyg.anpassa(); return 1`); await H.sov(400);
    await bild('11-anpassa-nere');
    lr = await rekt('#anp-vf-lage .anp-vf-lada');
    await dra('#dl-btn', { x: lr.x, y: lr.y });
    R.ok('nere: dra Nedladdningar till lådan', (await lada()).includes('nedladdningar'), await lada());
    await klick('#anp-vf-lage [data-g="aterstall"]');
    R.ok('nere: Återställ standard med musen', (await vanta(`return Anpassa.get('verktyg.knappar') == null`)) === true && (await rad()) === STANDARD, await rad());
    await klick('#anp-vf-lage [data-val="placering"] [data-v="uppe"]');
    R.ok('lådans Uppe/Nere flyttar raden', (await vanta(`return !document.body.classList.contains('anp-vf-nere')`)) === true);
    await klick('#anp-vf-lage [data-g="klar"]');
    await H.sov(300);
    mt = await matt(); v = (await vyer())[0];
    R.ok('uppe igen: sidan under bokmärkesfältet', !!v && mt.bmB !== null && v.y === Math.round(mt.bmB) && v.y + v.height === mt.h, [v, mt]);

    /* ── 8. Bokmärkesfältet ── */
    const bm = async () => JSON.parse(await E(`const b = document.getElementById('bmbar'); return JSON.stringify({ syns: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0, lage: Anpassa.get('verktyg.bokmarkesfalt'), tgl: document.getElementById('tgl-bmbar').checked })`));
    await fangaMenyer();
    const oc2 = await rekt('.omni-center'), fk2 = await rekt('#krypto-btn');
    await klick({ x: (oc2.r + fk2.l) / 2, y: oc2.y }, 'right');
    await meny();
    await valjMeny('Bokmärkesfältet', 'Bara på ny flik');
    await H.sov(400);
    let b = await bm();
    R.ok('menyn: bara på ny flik → dolt på en vanlig sida', b.lage === 'nyflik' && !b.syns && b.tgl, b);
    const vNy = (await vyer())[0];
    R.ok('webbsidan växer när fältet döljs', !!vNy && !!v && vNy.y < v.y, [vNy, v]);
    await E(`createTab(null); return 1`); await H.sov(500);
    b = await bm();
    R.ok('bara på ny flik → syns på ny flik', b.syns, b);
    await bild('12-bokmarken-ny-flik');
    await E(`bmbarOn = !bmbarOn; localStorage.setItem('adraze-bmbar', bmbarOn ? '1' : '0'); renderBookmarkBar(); document.getElementById('tgl-bmbar').checked = bmbarOn; return 1`);   // samma som Ctrl+Shift+B
    await H.sov(400);
    b = await bm();
    R.ok('Ctrl+Shift+B → aldrig', b.lage === 'aldrig' && !b.syns && !b.tgl, b);
    await E(`const t = document.getElementById('tgl-bmbar'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
    await H.sov(400);
    b = await bm();
    R.ok('Utseende › Visa bokmärkesfältet → alltid', b.lage === 'alltid' && b.syns && b.tgl, b);
    await satt('verktyg.bokmarkesfalt', 'aldrig'); await H.sov(400);
    b = await bm();
    R.ok('aldrig → Utseende-knappen av', !b.syns && !b.tgl, b);
    await satt('verktyg.bokmarkesfalt', 'alltid'); await H.sov(400);
    R.ok('alltid → syns igen', (await bm()).syns);

    /* ── 9. Inga fel ── */
    const fel = s.handelser.filter((h) => h.method === 'Runtime.exceptionThrown').map((h) => h.params.exceptionDetails.exception && h.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet', fel.length === 0, fel.slice(0, 3));
    const logg = fs.readFileSync(app.logg, 'utf8');
    R.ok('inga varningar från anpassa-verktyg', !/\[anpassa-verktyg\]/.test(logg), (logg.match(/\[anpassa-verktyg\][^\n]*/) || [''])[0]);
    R.ok('stängdes snällt', await app.stang());
    app = null;
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    if (app) await app.stang();
    x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  kor(path.resolve(process.argv[2] || path.join(__dirname, '..', '..'))).then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
}
