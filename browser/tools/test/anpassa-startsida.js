#!/usr/bin/env node
// Test av startsidans widgetar (Anpassa: startsida) mot utvecklingsbygget, osynligt i Xvfb.
// Täcker: standardutseendet, alla widgetar, väder (ortsök, hämtning, 30 min cache, inget nätanrop när widgeten saknas),
// redigeringsläget med musen (lägg till, ta bort, storlek, dra och släpp, piltangenter, ångra), inställningsdelen,
// Blockerat (idag/totalt), Senast stängda + barnspärren, Fråga Falk (utloggad och inloggad) och IPC-vakten.
// Skärmdumpar i ljust och mörkt läge sparas i bildmappen (titta på dem!).
// Användning: node tools/test/anpassa-startsida.js [webbläsarmapp] [bildmapp]   (avslutar med 0 om allt gick igenom)
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

const ALLA = ['genvagar', 'klocka', 'vader', 'stangda', 'anteckning', 'blockerat', 'falk', 'ordsprak'];

async function kor(rot, bilder) {
  const R = H.resultat();
  fs.mkdirSync(bilder, { recursive: true });
  const x = await H.startaXvfb();
  const profil = H.tempDir('startsida');
  const logg = path.join(profil, 'logg.txt');
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  let s = null, main = null;
  try {
    await H.vantaPaPort(cdp);
    const skalT = await H.mal(cdp, (t) => t.url.includes('shell.html'));
    R.ok('skalet startade', !!skalT);
    if (!skalT) return R;
    s = await H.anslut(skalT.webSocketDebuggerUrl);
    await s.skicka('Runtime.enable'); await s.skicka('Page.enable');
    main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl);
    await main.skicka('Runtime.enable');
    const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); ${expr} })()`);
    const K = (expr) => s.kor(expr);
    const J = async (expr) => { const v = await K(`JSON.stringify(${expr})`); try { return JSON.parse(v); } catch { return v; } };
    const mainStat = () => M(`return process.mainModule.require('./anpassa-startsida')._stat`);
    const vanta = async (expr, ms = 8000) => { for (let i = 0; i < ms / 150; i++) { if (await K(`!!(${expr})`) === true) return true; await H.sov(150); } return false; };
    // Notisen "Gör AdRaze till din huvudwebbläsare?" hör inte till testet och skulle täcka lådan
    const utanNotis = () => K(`(() => { try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 864e5)); localStorage.setItem('adraze-flytt-erbjuden', '1'); } catch {}
      for (const id of ['defbrowser-banner', 'flytt-banner']) { const b = document.getElementById(id); if (b) b.remove(); } return 1; })()`);
    const bild = async (namn) => {
      await utanNotis();
      await H.sov(350);
      const b = await s.skicka('Page.captureScreenshot', { format: 'png' });
      if (b.result && b.result.data) fs.writeFileSync(path.join(bilder, namn + '.png'), Buffer.from(b.result.data, 'base64'));
    };
    // Mittpunkten (eller dx in från vänster) – rullar först fram elementet så att musen når det
    const mitt = (sel, dx, rulla = true) => J(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; if (${rulla}) e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(); return [r.left + (${dx === undefined ? 'r.width / 2' : dx}), r.top + r.height / 2]; })()`);
    const mus = (type, [mx, my], knappar) => s.skicka('Input.dispatchMouseEvent', { type, x: mx, y: my, button: 'left', buttons: knappar, clickCount: type === 'mouseMoved' ? 0 : 1 });
    const klicka = async (sel) => { const m = await mitt(sel); if (!m) return false; await mus('mouseMoved', m, 0); await mus('mousePressed', m, 1); await mus('mouseReleased', m, 0); await H.sov(250); return true; };
    const tangent = (key, code, vk) => s.skicka('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk }).then(() => s.skicka('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }));
    const ordning = () => J(`Anpassa.get('startsida.layout').map((x) => x.w)`);
    const domOrdning = () => J(`[...document.getElementById('anp-st-grid').children].map((c) => c.dataset.w)`);
    const visaIgen = async () => { await K(`newtabpage.classList.add('hidden'); 1`); await H.sov(80); await K(`newtabpage.classList.remove('hidden'); 1`); await H.sov(300); };
    const tema = async (t) => { await K(`setTheme('${t}'); 1`); await H.sov(300); };

    await H.sov(2500);
    await K(`(() => { const h = document.getElementById('hxintro'); if (h) h.remove(); return 1; })()`);
    await utanNotis();
    await tema('light');
    await H.sov(1500);
    R.ok('modulen laddad', await K(`!!window.AnpassaStartsida && !!document.getElementById('anp-st-grid')`));
    R.ok('fönstret', true, await J(`({ w: innerWidth, h: innerHeight })`));

    // 1. Standard: samma startsida som förut (genvägarna i en bred widget, sex i bredd)
    const std = await J(`({ synlig: !newtabpage.classList.contains('hidden'), layout: Anpassa.get('startsida.layout'),
      genvagIWidget: !!document.querySelector('.anp-w-genvagar #shortcuts'), sc: document.querySelectorAll('#shortcuts .sc').length,
      sok: getComputedStyle(document.querySelector('.anp-st-sok')).display, stat: getComputedStyle(document.querySelector('.nt-stats')).display,
      knapp: getComputedStyle(document.getElementById('anp-st-anpassa')).display, bredd: Math.round(document.getElementById('shortcuts').getBoundingClientRect().width),
      kol: getComputedStyle(document.getElementById('shortcuts')).gridTemplateColumns.split(' ').filter((v) => v !== '0px').length,
      klocka: getComputedStyle(document.getElementById('nt-clock')).display, logga: getComputedStyle(document.getElementById('anp-st-logga')).display })`);
    R.ok('standard: startsidan syns', std.synlig);
    R.ok('standard: layouten är bara genvägar (bred)', JSON.stringify(std.layout) === JSON.stringify([{ w: 'genvagar', s: 'bred' }]), std.layout);
    R.ok('standard: genvägarna ligger i widgeten, sex i bredd på 608 px', std.genvagIWidget && std.sc >= 2 && std.bredd === 608 && std.kol === 6, std);
    R.ok('standard: sökfält, klocka, statistik och Anpassa-knapp syns, loggan inte', std.sok !== 'none' && std.klocka !== 'none' && std.stat !== 'none' && std.knapp !== 'none' && std.logga === 'none', std);
    const st0 = await mainStat();
    R.ok('inget väderanrop vid start (widgeten finns inte)', st0 && st0.vaderHamtningar === 0 && st0.ortSokningar === 0 && (await K(`AnpassaStartsida.stat.vaderAnrop`)) === 0, st0);
    await bild('01-standard-ljus');
    await tema('dark'); await bild('02-standard-mork'); await tema('light');

    // Hur lång tid tar det att öppna en ny flik med startsidan? Startsidan göms först (som när man kommer från en sajt),
    // så att widgetarnas uppdatering räknas med: skapa flik → visa startsidan → observatören → visas() i varje widget.
    const oppna = () => K(`(async () => { newtabpage.classList.add('hidden'); await Promise.resolve(); await Promise.resolve();
      const t0 = performance.now(); const t = createTab(null); await Promise.resolve(); await Promise.resolve(); const ms = performance.now() - t0;
      window.__tt = (window.__tt || []).concat(t); return ms; })()`);
    const tStd = []; for (let i = 0; i < 5; i++) { tStd.push(await oppna()); await H.sov(120); }

    // 2. Alla widgetar (lägg till i följd: den väntande layouten ska byggas på, inte skrivas över)
    await K(`(async () => { for (const w of ${JSON.stringify(ALLA.slice(1))}) AnpassaStartsida.laggTill(w); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
    R.ok('alla åtta widgetar i butiken, i ordning', JSON.stringify(await ordning()) === JSON.stringify(ALLA), await ordning());
    R.ok('alla åtta widgetar på sidan, i ordning', JSON.stringify(await domOrdning()) === JSON.stringify(ALLA), await domOrdning());
    const tAlla = []; for (let i = 0; i < 5; i++) { tAlla.push(await oppna()); await H.sov(120); }
    const med = (l) => l.slice().sort((a, b) => a - b)[Math.floor(l.length / 2)];
    R.ok('ny flik öppnas lika snabbt (median, ms)', med(tAlla) < Math.max(25, med(tStd) * 3), { standard: +med(tStd).toFixed(2), allaWidgetar: +med(tAlla).toFixed(2) });
    await K(`(window.__tt || []).forEach((t) => closeTab(t)); window.__tt = []; 1`); await H.sov(600);
    await K(`if (active && active.url) createTab(null); 1`); await H.sov(300);
    R.ok('väder utan ort: sökrutan visas, inget hämtas', (await K(`!!document.querySelector('.anp-w-vader input.anp-falt')`)) && (await mainStat()).vaderHamtningar === 0);

    // 3. Väder: sök ort → välj → hämta → cache
    await K(`(() => { const i = document.querySelector('.anp-w-vader input'); i.value = 'Umeå'; i.dispatchEvent(new Event('input')); return 1; })()`);
    const traffar = await vanta(`document.querySelector('.anp-w-vader .anp-vader-traff')`, 12000);
    R.ok('ortsök ger träffar', traffar, await K(`(document.querySelector('.anp-w-vader .anp-vader-traffar') || {}).textContent`));
    if (traffar) {
      R.ok('träffen är Umeå', /Umeå/.test(await K(`document.querySelector('.anp-w-vader .anp-vader-traff').textContent`)));
      await K(`document.querySelector('.anp-w-vader .anp-vader-traff').click(), 1`);
      const fick = await vanta(`document.querySelector('.anp-w-vader .anp-vader-temp')`, 15000);
      R.ok('vädret hämtat och visat', fick, await K(`document.querySelector('.anp-w-vader').textContent`));
      const st1 = await mainStat();
      R.ok('en hämtning i huvudprocessen', st1.vaderHamtningar === 1, st1);
      R.ok('temperatur och tre dagar framåt (liten)', await K(`/°$/.test(document.querySelector('.anp-w-vader .anp-vader-temp').textContent) && document.querySelectorAll('.anp-w-vader .anp-vader-dag').length === 3`));
      await visaIgen();
      R.ok('cache: visas igen utan nytt anrop', (await K(`AnpassaStartsida.stat.vaderAnrop`)) === 1 && (await mainStat()).vaderHamtningar === 1);
      await K(`(async () => { const o = JSON.parse(localStorage.getItem('adraze-startsida-ort')); await window.anpassaStartsida.vader(o.lat, o.lon); return 1; })()`);
      R.ok('cache i huvudprocessen: samma ort igen ger ingen ny hämtning', (await mainStat()).vaderHamtningar === 1);
      const gammal = `(() => { const c = JSON.parse(localStorage.getItem('adraze-startsida-vader')); c.ts = Date.now() - 31 * 60 * 1000; localStorage.setItem('adraze-startsida-vader', JSON.stringify(c)); return 1; })()`;
      await K(gammal); await visaIgen(); await H.sov(400);
      R.ok('efter 30 min frågar widgeten igen (huvudprocessens cache svarar)', (await K(`AnpassaStartsida.stat.vaderAnrop`)) === 2 && (await mainStat()).vaderHamtningar === 1);
      await K(`AnpassaStartsida.taBort('vader'); 1`); await H.sov(300);
      await K(gammal); await visaIgen(); await H.sov(400);
      R.ok('ingen väderwidget → inget anrop alls', (await K(`AnpassaStartsida.stat.vaderAnrop`)) === 2);
      await K(`AnpassaStartsida.laggTill('vader'); AnpassaStartsida.flytta('vader', -5); 1`); await H.sov(500);
      R.ok('tillbaka på sin plats', JSON.stringify(await ordning()) === JSON.stringify(ALLA), await ordning());
    }
    R.ok('IPC-vakten: startsida:vader nekas från webbsida', (await M(`const h = el.ipcMain._invokeHandlers.get('startsida:vader'); return h ? await h({ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' }, sender: {} }, { lat: 1, lon: 1 }) : 'saknas'`)) === null);
    R.ok('IPC-vakten: startsida:ort-sok nekas från webbsida', (await M(`const h = el.ipcMain._invokeHandlers.get('startsida:ort-sok'); return h ? await h({ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' }, sender: {} }, 'Umeå') : 'saknas'`)) === null);

    // Anteckningen sparas lokalt
    await K(`(() => { const t = document.querySelector('.anp-w-anteckning textarea'); t.value = 'Köp mjölk'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new Event('blur')); return 1; })()`);
    await H.sov(200);
    R.ok('anteckningen sparad lokalt', await K(`Object.keys(localStorage).some((k) => k.startsWith('adraze-startsida-anteckning') && localStorage.getItem(k) === 'Köp mjölk')`));

    // 4. Skärmdumpar med alla widgetar
    await K(`document.querySelector('.anp-st-inre').scrollTop = 0; 1`);
    await H.sov(1500);
    await bild('03-alla-frostad-ljus');
    await tema('dark'); await bild('04-alla-frostad-mork');
    await K(`Anpassa.set('startsida.stil', 'solid'); Anpassa.set('startsida.klocka', 'analog'); 1`); await H.sov(300);
    R.ok('solid: klass och analog klocka', await K(`newtabpage.classList.contains('anp-solid') && !!document.querySelector('.anp-klocka.analog')`));
    await bild('05-alla-solid-mork');
    await tema('light'); await bild('06-alla-solid-ljus');
    R.ok('solid i ljust tema: vita kort', (await K(`getComputedStyle(document.querySelector('.anp-w-klocka')).backgroundColor`)) === 'rgb(255, 255, 255)');
    await K(`Anpassa.set('startsida.stil', 'frostad'); Anpassa.set('startsida.klocka', 'digital'); Anpassa.set('startsida.bakgrund', false); 1`); await H.sov(300);
    await bild('07-alla-utan-bild-ljus');
    await tema('dark'); await bild('08-alla-utan-bild-mork'); await tema('light');
    await K(`Anpassa.set('startsida.bakgrund', true); 1`); await H.sov(300);

    // 5. Redigeringsläget med musen
    R.ok('Anpassa-knappen öppnar redigeringen', await klicka('#anp-st-anpassa') && await K(`newtabpage.classList.contains('anp-redigerar') && !document.getElementById('anp-st-lada').hidden`));
    R.ok('lådan: åtta widgetar, alla tillagda', (await K(`document.querySelectorAll('#anp-st-lada .anp-lada-rad').length`)) === 8 && (await K(`document.querySelectorAll('#anp-st-lada .anp-lada-rad.pa').length`)) === 8);
    await K(`document.querySelector('.anp-st-inre').scrollTop = 0; 1`);
    await H.sov(400);
    await bild('09-redigera-ljus');
    await klicka('.anp-w-klocka .anp-w-storlek'); await H.sov(300);
    R.ok('storleksknappen gör klockan bred', (await J(`Anpassa.get('startsida.layout').find((x) => x.w === 'klocka').s`)) === 'bred');
    await klicka('.anp-w-ordsprak .anp-w-bort'); await H.sov(300);
    R.ok('krysset tar bort ordspråket', !(await ordning()).includes('ordsprak') && !(await K(`!!document.querySelector('.anp-w-ordsprak')`)));
    R.ok('lådan visar Lägg till för ordspråket', /Lägg till/.test(await K(`[...document.querySelectorAll('#anp-st-lada .anp-lada-rad')].find((r) => /ordspråk/.test(r.textContent)).querySelector('button').textContent`)));
    await klicka('#anp-st-lada [aria-label="Lägg till Dagens ordspråk"]'); await H.sov(400);
    R.ok('Lägg till i lådan lägger tillbaka den sist', (await ordning()).slice(-1)[0] === 'ordsprak');
    await vanta(`!document.querySelector('.anp-lada-angra').disabled`, 3000);
    await klicka('.anp-lada-angra'); await H.sov(500);
    R.ok('Ångra tar bort den igen', !(await ordning()).includes('ordsprak'), await ordning());
    await K(`AnpassaStartsida.laggTill('ordsprak'); 1`); await H.sov(300);

    // Dra anteckningen till vädrets plats (vänstra kanten → före vädret, raden ovanför)
    const fore = await ordning();
    const fran = await mitt('.anp-w-anteckning'), till = await mitt('.anp-w-vader', 30, false);
    await mus('mouseMoved', fran, 0); await mus('mousePressed', fran, 1);
    for (let i = 1; i <= 14; i++) { await mus('mouseMoved', [fran[0] + (till[0] - fran[0]) * i / 14, fran[1] + (till[1] - fran[1]) * i / 14], 1); await H.sov(25); }
    await H.sov(350);
    R.ok('under dragningen: platshållare och svävande widget', await K(`!!document.querySelector('.anp-w-plats') && document.querySelector('.anp-w-anteckning').classList.contains('anp-drar')`));
    await bild('10-dra-ljus');
    await mus('mouseReleased', till, 0); await H.sov(500);
    const vantat = fore.filter((w) => w !== 'anteckning'); vantat.splice(vantat.indexOf('vader'), 0, 'anteckning');
    R.ok('dra och släpp flyttar anteckningen före vädret', JSON.stringify(await ordning()) === JSON.stringify(vantat), { fore, efter: await ordning(), fran, till });
    R.ok('sidan och butiken stämmer överens', JSON.stringify(await domOrdning()) === JSON.stringify(await ordning()));
    // Piltangent: Falk ett steg åt vänster
    const f2 = await ordning();
    await K(`document.querySelector('.anp-w-falk').focus(), 1`);
    await tangent('ArrowLeft', 'ArrowLeft', 37); await H.sov(400);
    const v2 = f2.slice(); const k2 = v2.indexOf('falk'); v2.splice(k2, 1); v2.splice(k2 - 1, 0, 'falk');
    R.ok('piltangent flyttar widgeten', JSON.stringify(await ordning()) === JSON.stringify(v2), await ordning());
    await tema('dark'); await bild('11-redigera-mork'); await tema('light');
    await tangent('Escape', 'Escape', 27); await H.sov(300);
    R.ok('Esc avslutar redigeringen', await K(`!newtabpage.classList.contains('anp-redigerar') && document.getElementById('anp-st-lada').hidden`));
    // Klar-knappen, och "Fler val" som leder till inställningsdelen
    await klicka('#anp-st-anpassa'); await klicka('.anp-lada-klar');
    R.ok('Klar avslutar redigeringen', await K(`!newtabpage.classList.contains('anp-redigerar')`));
    await klicka('#anp-st-anpassa'); await klicka('.anp-lada-mer'); await H.sov(400);
    R.ok('Fler val öppnar Inställningar → Anpassa', await K(`!document.getElementById('settings').classList.contains('hidden') && !!document.getElementById('anp-startsida').offsetParent && !newtabpage.classList.contains('anp-redigerar')`));
    await klicka('#anp-startsida .set-btn'); await H.sov(500);
    R.ok('Anpassa startsidan (i inställningarna) öppnar redigeringen', await K(`document.getElementById('settings').classList.contains('hidden') && !newtabpage.classList.contains('hidden') && newtabpage.classList.contains('anp-redigerar')`));
    await K(`AnpassaStartsida.klar(); 1`);

    // 6. Inställningar → Anpassa → Startsidan
    await K(`openSettings(); showSettingsCat('anpassa'); 1`); await H.sov(700);
    const inst = await J(`(() => { const s = document.getElementById('anp-startsida'); return { h3: s.querySelectorAll('h3').length, rubrik: (s.querySelector('h3') || {}).textContent, brytare: s.querySelectorAll('.switch').length, seg: s.querySelectorAll('.seg').length, rader: s.querySelectorAll('.set-row').length }; })()`);
    R.ok('inställningsdelen: en h3, sex brytare, två val', inst.h3 === 1 && inst.rubrik === 'Startsidan' && inst.brytare === 6 && inst.seg === 2, inst);
    await K(`document.getElementById('anp-startsida').scrollIntoView({ block: 'start' }); 1`); await H.sov(300);
    await bild('12-installningar-ljus');
    await tema('dark'); await bild('13-installningar-mork'); await tema('light');
    await K(`window.__sw = document.querySelector('#anp-startsida input[data-anp="startsida.sokfalt"]'); 1`);
    await klicka('#anp-startsida input[data-anp="startsida.sokfalt"] + .track'); await H.sov(300);
    R.ok('brytaren för sökfältet sparar', (await K(`Anpassa.get('startsida.sokfalt')`)) === false);
    R.ok('delen uppdateras på plats (brytaren byts inte ut)', await K(`window.__sw.isConnected && !window.__sw.checked`));
    await K(`Anpassa.set('startsida.tom', true); 1`); await H.sov(200);
    R.ok('tom startsida dämpar övriga rader i inställningarna', await K(`document.querySelectorAll('#anp-startsida .anp-dimmad').length === 8 && document.querySelector('#anp-startsida input[data-anp="startsida.tom"]').checked`));
    await K(`Anpassa.set('startsida.tom', false); Anpassa.set('startsida.stil', 'solid'); 1`); await H.sov(200);
    R.ok('stilvalet följer med', await K(`!document.querySelector('#anp-startsida .anp-dimmad') && document.querySelector('#anp-startsida .seg[data-anp="startsida.stil"] .seg-btn.on').getAttribute('data-v') === 'solid'`));
    await K(`Anpassa.set('startsida.stil', 'frostad'); 1`); await H.sov(200);
    await K(`closeSettings(); 1`); await H.sov(500);
    await K(`if (!active || active.url || active.isSettings) createTab(null); 1`); await H.sov(400);
    R.ok('sökfältet dolt på startsidan', (await K(`getComputedStyle(document.querySelector('.anp-st-sok')).display`)) === 'none');
    await K(`Anpassa.set('startsida.sokfalt', true); Anpassa.set('startsida.logga', true); Anpassa.set('startsida.halsning', false); Anpassa.set('startsida.statistik', false); 1`); await H.sov(300);
    const val = await J(`({ sok: getComputedStyle(document.querySelector('.anp-st-sok')).display, logga: getComputedStyle(document.getElementById('anp-st-logga')).display, klocka: getComputedStyle(document.getElementById('nt-clock')).display, stat: getComputedStyle(document.querySelector('.nt-stats')).display })`);
    R.ok('logga på, hälsning av, statistik av', val.sok !== 'none' && val.logga === 'flex' && val.klocka === 'none' && val.stat === 'none', val);
    await K(`Anpassa.set('startsida.halsning', true); Anpassa.set('startsida.statistik', true); Anpassa.set('startsida.logga', false); 1`); await H.sov(200);
    // Bild av → ingen ny bild hämtas för nya flikar; på igen → hämtas
    await K(`Anpassa.set('startsida.bakgrund', false); 1`); await H.sov(200);
    await K(`window.__bt = createTab(null); 1`); await H.sov(900);
    R.ok('bild av: ny flik hämtar ingen bakgrund', (await K(`newtabpage.classList.contains('anp-utan-bild') && !window.__bt.bg && getComputedStyle(document.getElementById('nt-bg')).display === 'none'`)), await K(`localStorage.getItem('skoll-bg')`));
    await K(`Anpassa.set('startsida.bakgrund', true); 1`);
    R.ok('bild på igen: bakgrunden hämtas', await vanta(`!!window.__bt.bg`, 4000));
    await K(`Anpassa.set('startsida.tom', true); 1`); await H.sov(300);
    R.ok('tom startsida: inget innehåll, Anpassa-knappen kvar', (await K(`getComputedStyle(document.querySelector('.anp-st-inre')).display === 'none' && getComputedStyle(document.getElementById('anp-st-anpassa')).display !== 'none'`)));
    await bild('14-tom-ljus');
    await K(`Anpassa.set('startsida.tom', false); 1`); await H.sov(300);

    // 7. Blockerat: ny dag nollställer "idag"; träffar från huvudprocessen räknas
    const fore7 = await J(`(() => { localStorage.setItem('adraze-startsida-dag', JSON.stringify({ dag: '2000-01-01', bas: 0 })); return AnpassaStartsida.blockSiffror(); })()`);
    R.ok('ny dag: idag börjar på 0', fore7.idag === 0, fore7);
    await M(`for (const w of el.BrowserWindow.getAllWindows()) { for (let i = 0; i < 7; i++) w.webContents.send('adblock:hit', 'ad'); for (let i = 0; i < 3; i++) w.webContents.send('adblock:hit', 'tracker'); } return 1`);
    await H.sov(900);
    const blk = await J(`({ idag: document.querySelector('.anp-w-blockerat .anp-blk-idag').textContent, alla: [...document.querySelectorAll('.anp-w-blockerat .anp-blk-n')].map((e) => e.textContent) })`);
    R.ok('Blockerat: 10 idag, totalen räknas upp', blk.idag === '10' && blk.alla[1] === (fore7.totalt + 10).toLocaleString('sv-SE'), { fore7, blk });

    // 8. Senast stängda: riktig flik som stängs, sedan barnspärren via vanliga navigeringen
    await K(`window.__ex = createTab('https://example.com/'); 1`);
    const laddad = await vanta(`window.__ex && /Example/.test(window.__ex.title || '')`, 20000);
    R.ok('example.com laddad i en flik', laddad);
    await K(`closeTab(window.__ex); 1`); await H.sov(700);
    await K(`if (!active || active.url) createTab(null); 1`); await H.sov(500);
    R.ok('stängd flik syns i Senast stängda', /Example|example\.com/.test(await K(`document.querySelector('.anp-w-stangda').textContent`)), await K(`document.querySelector('.anp-w-stangda').textContent`));
    await K(`window.__fam = window.famBlocked; window.famBlocked = (u) => /example\\.org/.test(String(u)); closedTabs.push({ url: 'https://example.org/', index: 0, pinned: false }); 1`);
    await visaIgen();
    R.ok('example.org överst i listan', /example\.org/.test(await K(`document.querySelector('.anp-w-stangda .anp-stangd').title`)));
    await klicka('.anp-w-stangda .anp-stangd'); await H.sov(500);
    R.ok('barnspärren gäller: spärrsidan visas, fliken laddar inget', await K(`!active.url && !!document.getElementById('kidblock') && document.getElementById('kidblock').style.display !== 'none'`));
    R.ok('spärrad sida ligger kvar i listan', /example\.org/.test(await K(`[...document.querySelectorAll('.anp-w-stangda .anp-stangd')].map((b) => b.title).join(' ')`)) && (await K(`closedTabs.some((c) => /example\\.org/.test(c.url))`)));
    await K(`window.famBlocked = window.__fam; try { kbStang(true); } catch { document.getElementById('kidblock').style.display = 'none'; showActiveTab(); } 1`); await H.sov(400);
    await K(`if (!active || active.url) createTab(null); 1`); await H.sov(300);
    const exKnapp = await K(`(() => { const b = [...document.querySelectorAll('.anp-w-stangda .anp-stangd')].find((x) => /example\\.com/.test(x.title)); if (b) b.setAttribute('data-test', 'ex'); return !!b; })()`);
    if (exKnapp) await klicka('.anp-w-stangda [data-test="ex"]');
    R.ok('öppnar den stängda fliken i samma flik', await vanta(`active.url && /example\\.com/.test(active.url)`, 4000), await K(`active && active.url`));
    await K(`createTab(null); 1`); await H.sov(400);

    // 9. Fråga Falk: utloggad → inloggningen öppnas och frågan ligger kvar; inloggad (Pro) → frågan skickas in i Falk
    const fraga = async (q) => { await K(`(() => { const i = document.querySelector('.anp-w-falk input'); i.value = ${JSON.stringify(q)}; i.form.requestSubmit(); return 1; })()`); await H.sov(500); };
    await fraga('Är det här ett bluffmejl?');
    R.ok('Falk utloggad: inloggningen öppnas, frågan kvar', await K(`!document.getElementById('login').classList.contains('hidden') && document.querySelector('.anp-w-falk input').value === 'Är det här ett bluffmejl?' && /Logga in/.test(document.querySelector('.anp-falk-notis').textContent)`));
    await K(`try { closeLogin(); } catch { document.getElementById('login').classList.add('hidden'); } 1`); await H.sov(300);
    await K(`account = { email: 'test@adraze.test', token: 'test-token', pro: true, name: 'Test' }; 1`);
    await fraga('Hur gör jag ett starkt lösenord?');
    const falkT = await H.mal(cdp, (t) => t.url.includes('/ui/krypto.html'), 10000);
    R.ok('Falk-panelen öppnades', !!falkT);
    if (falkT) {
      const f = await H.anslut(falkT.webSocketDebuggerUrl); await f.skicka('Runtime.enable');
      let fick = false;
      for (let i = 0; i < 40 && !fick; i++) { fick = (await f.kor(`document.body.innerText.includes('Hur gör jag ett starkt lösenord?')`)) === true; if (!fick) await H.sov(250); }
      R.ok('frågan kom fram till Falk', fick);
      f.stang();
    }
    R.ok('widgetens fält töms efter skickad fråga', (await K(`document.querySelector('.anp-w-falk input').value`)) === '');
    await K(`openKrypto(false); account = null; 1`); await H.sov(300);

    // Ifyllda widgetar (bred väder, stängda flikar, blockerat) i båda temana
    await K(`if (!active || active.url) createTab(null); AnpassaStartsida.vaxlaStorlek('vader'); 1`); await H.sov(500);
    await K(`document.querySelector('.anp-w-vader').scrollIntoView({ block: 'start' }); 1`); await H.sov(300);
    await bild('15-ifylld-ljus');
    await tema('dark'); await bild('16-ifylld-mork'); await tema('light');

    // 10. Återställ: allt tillbaka till standard
    await K(`Anpassa.aterstall('startsida.'); 1`); await H.sov(500);
    R.ok('återställ: standardlayout och standardval', JSON.stringify(await J(`Anpassa.get('startsida.layout')`)) === JSON.stringify([{ w: 'genvagar', s: 'bred' }])
      && (await K(`!newtabpage.className.split(' ').some((c) => /^anp-(solid|utan-|tom|med-logga)/.test(c))`)), await K(`newtabpage.className`));

    // Inga JS-fel i skalet, inga varningar från modulen
    const fel = s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet', !fel.length, fel);
    const varn = s.handelser.filter((e) => e.method === 'Runtime.consoleAPICalled' && (e.params.args || []).some((a) => /\[startsida\]/.test(String(a.value || '')))).length;
    R.ok('inga varningar från startsidemodulen', varn === 0);
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    try { if (s) s.stang(); if (main) main.stang(); } catch {}
    await H.stang(p);
    x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const rot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
  const bilder = path.resolve(process.argv[3] || H.tempDir('startsida-bilder'));
  kor(rot, bilder).then((R) => { console.log(R.text()); console.log('Bilder: ' + bilder); process.exit(R.fel.length ? 1 : 0); });
}
