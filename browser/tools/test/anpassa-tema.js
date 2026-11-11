#!/usr/bin/env node
// Test av Anpassa-området "tema" (ui/anpassa-tema.js och anpassa-tema.js) mot utvecklingsbygget, osynligt i Xvfb.
// Går igenom: kontrasten för alla accentfärger (och svåra egna färger) i ljust och mörkt läge, att accenten slår
// igenom i skalet utan att någon text blir oläslig, ljust/mörkt/följ systemet (även de gamla knapparna under
// Utseende), densitet, hörn, typsnitt, textstorlek, färdiga teman, delningskoden, färg från bakgrundsbilden, ångra,
// att ett andra fönster och ett inkognitofönster följer med direkt, att allt finns kvar efter omstart och att det
// gamla valet "Mörkt" flyttas in i tema.lage.
// Användning: node tools/test/anpassa-tema.js [webbläsarmapp] [--bilder <mapp>]   (avslutar med 0 om allt gick igenom)
//   --bilder <mapp> sparar skärmdumpar i ljust och mörkt läge att titta på.
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

// Körs i skalet (via toString): mätverktyg för färger, kontrast och väntan
function sidHjalp() {
  const rgba = (s) => {
    let m = /^rgba?\(([^)]+)\)$/.exec(String(s).trim());
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = /^color\(srgb ([^)]+)\)$/.exec(String(s).trim());
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const over = (f, b) => { const a = f[3]; return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)).concat(1); };
  const hex = (s) => { const c = typeof s === 'string' ? rgba(s) : s; return c ? '#' + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('') : null; };
  // Färgen bakom ett element: förfädernas bakgrundsfärger lagda på varandra, från <html> och inåt
  function bakom(el) {
    const kedja = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) kedja.push(e);
    let c = [255, 255, 255, 1];
    for (const e of kedja.reverse()) { const b = rgba(getComputedStyle(e).backgroundColor); if (b && b[3] > 0) c = over(b, c); }
    return c;
  }
  // Kontrasten för all synlig text under rötterna: Map(element → kvot)
  function lasbarhet(rotter) {
    const ut = new Map();
    for (const sel of rotter) for (const rot of document.querySelectorAll(sel)) for (const el of rot.querySelectorAll('*')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const fg = rgba(getComputedStyle(el).color);
      if (!fg) continue;
      const bg = bakom(el);
      ut.set(el, window.AnpassaTema.kontrast(over(fg, bg).slice(0, 3), bg.slice(0, 3)));
    }
    return ut;
  }
  // Text som blivit oläslig (under 3:1) jämfört med samma element i AdRazes eget utseende
  function nyaLasfel(bas, rotter) {
    const fel = [];
    for (const [el, k] of lasbarhet(rotter)) {
      const b = bas.get(el);
      if (k < 3 && (b === undefined || k < b - 0.05)) fel.push((el.id ? '#' + el.id : el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 24) + '" ' + k.toFixed(2) + (b ? ' (var ' + b.toFixed(2) + ')' : ''));
    }
    return fel;
  }
  const tills = async (f, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (f()) return true; } catch {} await new Promise((r) => setTimeout(r, 40)); }
    return false;
  };
  const ram = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Vänta tills färgövergångarna (transition) är klara, så att mätningen inte fångar en blandfärg
  const lugn = async () => {
    await ram();
    const pagar = document.getAnimations().filter((a) => a instanceof CSSTransition);
    await Promise.race([Promise.all(pagar.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 2000))]);
  };
  // Tema-värdena som skiljer sig från standard, sorterade (fönstrets kopia visar standardvärdet efter en återställning)
  const tema = () => {
    const reg = window.anpassaBro.alla().register;
    return JSON.stringify(Object.entries(Anpassa.alla()).filter(([k, v]) => k.startsWith('tema.') && reg[k] && v !== reg[k].standard).sort());
  };
  const varde =(el, p, pseudo) => getComputedStyle(typeof el === 'string' ? document.querySelector(el) : el, pseudo || null).getPropertyValue(p).trim();
  const rot = (p) => getComputedStyle(document.documentElement).getPropertyValue(p).trim();
  const anp = (n) => document.documentElement.getAttribute('data-anp-' + n);
  const knapp = (sel) => { const b = document.querySelector('#anp-tema ' + sel); if (!b) throw new Error('saknas: ' + sel); b.click(); };
  window.__T = { rgba, over, hex, bakom, lasbarhet, nyaLasfel, tills, ram, lugn, tema, varde, rot, anp, knapp, bas: {} };
}

const ROTTER = ['#tabstrip', '#toolbar', '#settings'];

async function oppna(rot, x, profil, logg) {
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil), logg);
  await H.vantaPaPort(cdp);
  const t = await H.mal(cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html'));
  if (!t) throw new Error('skalet startade inte');
  const s = await anslutSkal(t);
  const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl);
  await main.skicka('Runtime.enable');
  const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); ${expr} })()`);
  return { p, cdp, s, t, main, M };
}
async function anslutSkal(t) {
  const s = await H.anslut(t.webSocketDebuggerUrl);
  await s.skicka('Runtime.enable');
  await s.skicka('Page.enable');
  await s.skicka('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (let i = 0; i < 60 && (await s.kor(`typeof showSettingsCat === 'function' && document.readyState === 'complete'`)) !== true; i++) await H.sov(250);
  await H.sov(1200);
  await s.kor(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); document.querySelectorAll('.notis').forEach((n) => n.remove()); return 1; })()`);
  await s.kor('(' + sidHjalp.toString() + ')(); 1');
  return s;
}
const jsonKor = async (s, expr) => { const r = await s.kor(expr); try { return JSON.parse(r); } catch { return r; } };
const fel = (s) => s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text);

async function kor(rot, bilder) {
  const R = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('tema');
  const logg = path.join(profil, 'logg.txt');
  let app = null;
  const bild = async (s, namn) => {
    if (!bilder) return;
    await s.kor(`document.querySelectorAll('.notis').forEach((n) => n.remove()); 1`);
    const r = await s.skicka('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(bilder, { recursive: true });
    fs.writeFileSync(path.join(bilder, namn + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  try {
    app = await oppna(rot, x, profil, logg);
    const { s, M } = app;
    const J = (expr) => jsonKor(s, expr);

    // 0. Grundläget: inget ändrat = AdRazes eget utseende, orört
    const g = await J(`JSON.stringify({ tema: typeof window.AnpassaTema, reg: Object.entries(anpassaBro.alla().register).filter(([k]) => k.startsWith('tema.')).map(([k, v]) => [k, v.standard, v.barnLast, v.importBar]),
      attr: [...document.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith('data-anp')), terra: __T.rot('--color-terra'), theme: document.documentElement.dataset.theme, system: !!document.getElementById('seg-system') })`);
    R.ok('AnpassaTema laddat', g.tema === 'object', g.tema);
    R.ok('sju tema-nycklar: barn får ändra, kan delas', g.reg.length === 7 && g.reg.every((r) => r[2] === false && r[3] === true), g.reg);
    R.ok('standard: inga data-anp-attribut', g.attr.length === 0, g.attr);
    R.ok('standard: accenten är AdRazes orange', g.terra.toLowerCase() === '#ff4b1f', g.terra);
    R.ok('standard: ljust läge', g.theme === 'light', g.theme);
    R.ok('Utseende har knappen Följ systemet', g.system);

    // 1. Färgmatten: varje accent (förvalen, svåra egna färger och 400 slumpade) blir läsbar i båda lägena
    const matte = await J(`(() => {
      const T = window.AnpassaTema, K = (a, b) => T.kontrast(T.hexTillRgb(a), T.hexTillRgb(b));
      const svara = ['#ffe066', '#00e5ff', '#ffff00', '#1a1a1a', '#f2f2f2', '#808080', '#0000ff', '#ff00ff', '#000000', '#ffffff'];
      let s = 7; const slump = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const alla = T.ACCENTER.map((a) => a[0]).concat(svara, Array.from({ length: 400 }, () => '#' + Math.floor(slump() * 0xffffff).toString(16).padStart(6, '0')));
      const fel = [];
      for (const h of alla) {
        const p = T.palett(h);
        const k = { l: K(p.l, '#f1f5f9'), d: K(p.d, '#171718'), inkL: K(p.inkL, '#ffffff'), inkD: K(p.inkD, '#161618'), onL: K(p.onL, p.l), onD: K(p.onD, p.d) };
        if (k.l < 3 || k.d < 3 || k.inkL < 4.5 || k.inkD < 4.5 || k.onL < 3 || k.onD < 3) fel.push(h + ' ' + JSON.stringify(k));
      }
      return JSON.stringify({ antal: alla.length, fel, orange: T.textPa('#ff4b1f'), prov: T.ACCENTER.map(([h]) => T.palett(h).l === h) });
    })()`);
    R.ok('kontrast håller för ' + matte.antal + ' accentfärger (yta 3:1, text 4,5:1, text på accent 3:1)', matte.fel.length === 0, matte.fel.slice(0, 5));
    R.ok('vit text på AdRazes orange', matte.orange === '#ffffff', matte.orange);
    R.ok('förvalsfärgerna behålls oförändrade i ljust läge (utom Bärnsten)', matte.prov.filter((v) => !v).length <= 1, matte.prov);

    // 2. Inställningar › Anpassa › Tema
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(700);
    const ui = await J(`JSON.stringify({ h3: (document.querySelector('#anp-tema h3') || {}).textContent, h3n: document.querySelectorAll('#anp-tema h3').length, prov: document.querySelectorAll('#anp-tema .anp-tema-farger > [data-accent]').length,
      forval: document.querySelectorAll('#anp-tema [data-forval]').length, typsnitt: document.querySelectorAll('#anp-tema [data-namn=typsnitt]').length, seg: ['lage', 'densitet', 'horn', 'storlek'].map((n) => document.querySelectorAll('#anp-tema [data-namn=' + n + ']').length),
      knappar: ['[data-bgfarg]', '[data-kopiera]', '[data-anvand]', '[data-aterstall]', '[data-kod]', '[data-hex]', '[data-egen]'].every((q) => document.querySelector('#anp-tema ' + q)) })`);
    R.ok('Tema-delen ritad (en rubrik, 8 färger, 7 färdiga teman, 5 typsnitt)', ui.h3 === 'Tema' && ui.h3n === 1 && ui.prov === 8 && ui.forval === 7 && ui.typsnitt === 5 && ui.knappar, ui);
    R.ok('valen ljust/mörkt, densitet, hörn och storlek har tre lägen var', ui.seg.every((n) => n === 3), ui.seg);
    await bild(s, '01-anpassa-ljust');

    // 3. Accenten i hela skalet, och ingen text blir oläslig (ljust och mörkt läge)
    const TESTFARGER = ['#d6336c', '#7354d6', '#3b6fe0', '#0b8a8f', '#2f9e67', '#e8a317', '#5f6b7a', '#ffe066', '#00e5ff', '#1a1a1a', '#f2f2f2'];
    for (const lage of ['ljust', 'morkt']) {
      await s.kor(`(async () => { await window.AnpassaTema.valjLage('${lage}'); __T.knapp('[data-accent="#ff4b1f"]'); await __T.tills(() => !__T.anp('accent') && document.documentElement.dataset.theme === '${lage === 'morkt' ? 'dark' : 'light'}'); await __T.lugn(); __T.bas.${lage} = __T.lasbarhet(${JSON.stringify(ROTTER)}); return 1; })()`);
      const fl = [], lasfel = [];
      for (const hex of TESTFARGER) {
        const r = await J(`(async () => {
          const f = document.querySelector('#anp-tema [data-hex]'), knapp = document.querySelector('#anp-tema .anp-tema-farger > [data-accent="${hex}"]');
          if (knapp) knapp.click(); else { f.focus({ preventScroll: true }); f.value = '${hex}'; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); f.blur(); }
          const ok = await __T.tills(() => __T.anp('accent') === '${hex}');
          await __T.lugn();
          const p = window.AnpassaTema.palett('${hex}'), mork = '${lage}' === 'morkt';
          const vald = document.querySelector('#anp-tema .anp-tema-prov.on');
          const aktiv = document.querySelector('.tab.active');
          return JSON.stringify({ ok, terra: __T.rot('--color-terra'), on: __T.rot('--anp-on'), vant: mork ? p.d : p.l, vantOn: mork ? p.onD : p.onL,
            nav: __T.hex(__T.varde('#settings .set-tab.on svg', 'color')),
            sparat: Anpassa.get('tema.accent', null), bock: vald ? window.AnpassaTema.kontrast(__T.rgba(__T.varde(vald, 'color')).slice(0, 3), __T.rgba(__T.varde(vald, 'background-color')).slice(0, 3)) : 0,
            lasfel: __T.nyaLasfel(__T.bas.${lage}, ${JSON.stringify(ROTTER)}) });
        })()`);
        if (!r.ok || r.terra !== r.vant || r.on !== r.vantOn || r.nav !== r.vant || r.sparat !== hex || r.bock < 3) fl.push({ hex, ...r, lasfel: undefined });
        if (r.lasfel && r.lasfel.length) lasfel.push(hex + ': ' + r.lasfel.join(', '));
      }
      R.ok(`accenten slår igenom i ${lage} läge (variabler, menyn, bocken)`, fl.length === 0, fl.slice(0, 3));
      R.ok(`ingen text blir oläslig med någon accentfärg i ${lage} läge`, lasfel.length === 0, lasfel.slice(0, 4));
      await bild(s, lage === 'ljust' ? '02-egen-farg-ljust' : '03-egen-farg-mork');
    }
    // Text på accentfärgad knapp (t.ex. "Spara lösenord") i mörkt läge med en ljus accent
    const pa = await J(`(async () => {
      const b = document.createElement('button'); b.className = 'pill pill-accent'; b.textContent = 'Prov'; document.body.append(b);
      await __T.ram();
      const k = window.AnpassaTema.kontrast(__T.rgba(__T.varde(b, 'color')).slice(0, 3), __T.rgba(__T.varde(b, 'background-color')).slice(0, 3));
      b.remove(); return JSON.stringify({ k, accent: __T.anp('accent') });
    })()`);
    R.ok('text på accentknapp läsbar med ljus accent i mörkt läge', pa.k >= 3, pa);

    // 4. Ljust / mörkt / följ systemet, och de gamla knapparna under Utseende
    const lageNu = `JSON.stringify({ theme: document.documentElement.dataset.theme, lage: Anpassa.get('tema.lage', null), ls: localStorage.getItem('skoll-theme'),
      ut: ['seg-light', 'seg-dark', 'seg-system'].map((id) => document.getElementById(id).classList.contains('on')),
      anp: [...document.querySelectorAll('#anp-tema [data-namn=lage]')].map((b) => b.classList.contains('on')) })`;
    await s.kor(`showSettingsCat('utseende'); 1`);
    await s.skicka('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await s.kor(`document.getElementById('seg-system').click(); 1`);
    await H.sov(500);
    let l = await J(lageNu);
    R.ok('Följ systemet: mörkt när systemet är mörkt', l.theme === 'dark' && l.lage === 'system' && l.ls === 'dark' && l.ut.join() === 'false,false,true' && l.anp.join() === 'false,false,true', l);
    await s.skicka('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await H.sov(500);
    l = await J(lageNu);
    R.ok('Följ systemet: byter till ljust direkt när systemet gör det', l.theme === 'light' && l.lage === 'system' && l.ut.join() === 'false,false,true', l);
    await s.kor(`document.getElementById('seg-dark').click(); 1`);
    await H.sov(500);
    l = await J(lageNu);
    R.ok('gamla knappen Mörkt sparar tema.lage = morkt', l.theme === 'dark' && l.lage === 'morkt' && l.ut.join() === 'false,true,false' && l.anp.join() === 'false,true,false', l);
    await s.kor(`document.getElementById('seg-light').click(); 1`);
    await H.sov(500);
    l = await J(lageNu);
    R.ok('gamla knappen Ljust går tillbaka till standard', l.theme === 'light' && (l.lage === null || l.lage === 'ljust') && l.ut.join() === 'true,false,false' && l.anp.join() === 'true,false,false', l);
    await s.skicka('Emulation.setEmulatedMedia', { features: [] });

    // 5. Densitet, hörn, typsnitt och textstorlek
    // Webbsidan (en egen vy i huvudprocessen) ska flytta sig när flikraden och verktygsraden byter höjd
    const vyY = () => M(`const w = el.BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('/ui/shell.html') && !b.webContents.getURL().includes('incognito')); return JSON.stringify(w.contentView.children.filter((v) => v.getVisible ? v.getVisible() : true).map((v) => v.getBounds()).filter((b) => b.width > 300).map((b) => b.y));`).then((r) => JSON.parse(r));
    const skalY = () => s.kor(`Math.round(document.getElementById('views').getBoundingClientRect().y)`);
    await s.kor(`closeSettings(); createTab('https://example.com/'); 1`);
    await H.sov(2000);
    const vy = {};
    for (const d of ['kompakt', 'luftig', 'normal']) {
      await s.kor(`(async () => { await Anpassa.set('tema.densitet', '${d}' === 'normal' ? undefined : '${d}', 'Densitet'); await __T.tills(() => (__T.anp('densitet') || 'normal') === '${d}'); await __T.ram(); await __T.ram(); return 1; })()`);
      await H.sov(300);
      vy[d] = { skal: await skalY(), vy: await vyY() };
    }
    R.ok('densitet: webbsidan flyttas med (vyns läge följer skalet)', ['kompakt', 'luftig', 'normal'].every((d) => vy[d].vy.includes(vy[d].skal)) && vy.kompakt.skal < vy.normal.skal && vy.normal.skal < vy.luftig.skal, vy);
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(500);
    const matt = `JSON.stringify({ flikrad: document.getElementById('tabstrip').getBoundingClientRect().height, verktyg: document.getElementById('toolbar').getBoundingClientRect().height,
      adress: document.getElementById('omnibox').getBoundingClientRect().height, vy: Math.round(document.getElementById('views').getBoundingClientRect().y),
      radie: parseFloat(__T.varde('#omnibox', 'border-top-left-radius')), flikRadie: parseFloat(__T.varde('.tab', 'border-top-left-radius')),
      font: __T.varde(document.body, 'font-family'), flikText: parseFloat(__T.varde('.tab', 'font-size')), adressText: parseFloat(__T.varde('#address', 'font-size')) })`;
    const valj = async (namn, v) => { await s.kor(`(async () => { __T.knapp('[data-namn=${namn}][data-v=${v}]'); await __T.tills(() => (__T.anp('${namn}') || 'normal') === '${v}' || '${v}' === 'system'); await __T.lugn(); return 1; })()`); await H.sov(150); return J(matt); };
    const normal = await J(matt);
    const kompakt = await valj('densitet', 'kompakt');
    const luftig = await valj('densitet', 'luftig');
    R.ok('densitet: kompakt < normal < luftig (flikrad, verktygsrad, adressfält)', kompakt.flikrad < normal.flikrad && normal.flikrad < luftig.flikrad && kompakt.verktyg < normal.verktyg && normal.verktyg < luftig.verktyg && kompakt.adress < normal.adress && normal.adress < luftig.adress, { kompakt, normal, luftig });
    await valj('densitet', 'normal');
    const kantig = await valj('horn', 'kantig');
    const rund = await valj('horn', 'rund');
    R.ok('hörn: kantig < normal < rund (adressfält och flikar)', kantig.radie < normal.radie && normal.radie < rund.radie && kantig.flikRadie < rund.flikRadie, { kantig: kantig.radie, normal: normal.radie, rund: rund.radie });
    await valj('horn', 'normal');
    const fonter = {};
    for (const f of ['klassisk', 'tydlig', 'serif', 'mono']) fonter[f] = (await valj('typsnitt', f)).font;
    R.ok('typsnitt: varje val byter typsnitt i skalet', /Helvetica Neue/.test(fonter.klassisk) && /Verdana/.test(fonter.tydlig) && /Charter/.test(fonter.serif) && /monospace/.test(fonter.mono) && !/Charter|Verdana/.test(normal.font), fonter);
    await bild(s, '04-serif');
    await valj('typsnitt', 'system');
    const liten = await valj('storlek', 'liten');
    const stor = await valj('storlek', 'stor');
    R.ok('textstorlek: liten < normal < stor (flikar och adressfält)', liten.flikText < normal.flikText && normal.flikText < stor.flikText && liten.adressText < normal.adressText && normal.adressText < stor.adressText, { liten: liten.flikText, normal: normal.flikText, stor: stor.flikText });
    await valj('storlek', 'normal');
    const tillbaka = await J(matt);
    R.ok('Normal ger exakt grundmåtten tillbaka', tillbaka.flikrad === normal.flikrad && tillbaka.adress === normal.adress && tillbaka.radie === normal.radie && tillbaka.flikText === normal.flikText && tillbaka.font === normal.font, { tillbaka, normal });
    const attrNu = await J(`JSON.stringify([...document.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith('data-anp')))`);
    R.ok('standardvärden lämnar inga attribut kvar', attrNu.join() === 'data-anp-accent', attrNu);

    // 6. Färdiga teman
    const forval = await J(`(async () => {
      const ut = {};
      for (const f of window.AnpassaTema.FORVAL) {
        __T.knapp('[data-forval=' + f.id + ']');
        await __T.tills(() => Object.keys(f.v).every((k) => Anpassa.get('tema.' + k) === f.v[k]));
        await __T.ram();
        ut[f.id] = { ok: Object.keys(f.v).every((k) => Anpassa.get('tema.' + k) === f.v[k]), vald: document.querySelector('#anp-tema [data-forval=' + f.id + ']').classList.contains('on'),
          andraValda: document.querySelectorAll('#anp-tema [data-forval].on').length, theme: document.documentElement.dataset.theme };
      }
      return JSON.stringify(ut);
    })()`);
    R.ok('färdiga teman sätter färg, läge, hörn och densitet och markeras', Object.values(forval).every((f) => f.ok && f.vald && f.andraValda === 1), forval);
    R.ok('Natt och Grafit är mörka, Skog och Sand ljusa', forval.natt.theme === 'dark' && forval.grafit.theme === 'dark' && forval.skog.theme === 'light' && forval.sand.theme === 'light', forval);
    await bild(s, '05-grafit-kompakt-kantig');

    // 7. Ångra (Anpassa-historiken): sista ändringen går tillbaka
    const angra = await J(`(async () => {
      __T.knapp('[data-accent="#d6336c"]'); await __T.tills(() => __T.anp('accent') === '#d6336c');
      __T.knapp('[data-accent="#7354d6"]'); await __T.tills(() => __T.anp('accent') === '#7354d6');
      await Anpassa.angra(); const ok = await __T.tills(() => __T.anp('accent') === '#d6336c');
      return JSON.stringify({ ok, accent: Anpassa.get('tema.accent'), vald: (document.querySelector('#anp-tema .anp-tema-farger > .on') || {}).dataset });
    })()`);
    R.ok('Ångra går tillbaka till förra färgen', angra.ok && angra.accent === '#d6336c', angra);

    // 8. Dela: kopiera kod, återställ, felaktiga koder, tvättning, använd kod
    const dela = await J(`(async () => {
      __T.knapp('[data-namn=typsnitt][data-v=serif]'); await __T.tills(() => __T.anp('typsnitt') === 'serif');
      const fore = __T.tema();
      __T.knapp('[data-kopiera]'); await new Promise((r) => setTimeout(r, 500));
      let urklipp = ''; try { urklipp = await navigator.clipboard.readText(); } catch (e) { urklipp = 'FEL ' + e.message; }
      const kod = await Anpassa.exportera('tema.');
      const toast = document.getElementById('apptoast').textContent;
      __T.knapp('[data-aterstall]');
      const aterstalld = await __T.tills(() => ![...document.documentElement.attributes].some((a) => a.name.startsWith('data-anp')) && document.documentElement.dataset.theme === 'light');
      const tom = await Anpassa.exportera('tema.');
      const falt = document.querySelector('#anp-tema [data-kod]'), status = () => document.querySelector('#anp-tema [data-kodstatus]').textContent;
      const anvand = async (v) => { falt.value = v; __T.knapp('[data-anvand]'); await new Promise((r) => setTimeout(r, 400)); return status(); };
      const b64 = (o) => 'ADRZ1.' + btoa(JSON.stringify(o)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      const ogiltig = await anvand('hej hopp');
      const annat = await anvand(b64({ 'flikar.lage': 'sida' }));
      const skrap = await anvand(b64({ 'tema.accent': 'red;}body{display:none', 'tema.lage': 'lila', 'tema.horn': 'rund', 'avancerat.css': 'body{}' }));
      const efterSkrap = { accent: __T.anp('accent'), horn: __T.anp('horn'), css: Anpassa.get('avancerat.css', null), lage: Anpassa.get('tema.lage', null) };
      const giltig = await anvand(kod);
      await __T.tills(() => __T.anp('typsnitt') === 'serif');
      await __T.ram();
      const efter = __T.tema();
      const avkoda = (k) => JSON.stringify(Object.entries(window.AnpassaTema.lasKod(k) || {}).sort());
      const huvud = await Anpassa.exportera('tema.');
      return JSON.stringify({ fore, efter, urklippOk: urklipp === kod, toast, aterstalld, tom, ogiltig, annat, skrap, efterSkrap, giltig, sammaKod: avkoda(huvud) === avkoda(kod), faltTomt: falt.value === '' });
    })()`);
    R.ok('Kopiera kod lägger koden i urklipp', dela.urklippOk && dela.toast === 'Kod kopierad', { toast: dela.toast });
    R.ok('Återställ tema ger AdRazes utseende och en tom kod', dela.aterstalld && dela.tom === 'ADRZ1.e30', dela.tom);
    R.ok('felaktig kod ger ett begripligt fel', dela.ogiltig === 'Koden fungerar inte. Kolla att hela koden kom med.', dela.ogiltig);
    R.ok('kod utan tema avvisas', dela.annat === 'Koden innehåller inget tema.', dela.annat);
    R.ok('kod med skräpvärden: bara giltiga tema-värden används, inget annat område', dela.efterSkrap.accent === null && dela.efterSkrap.horn === 'rund' && dela.efterSkrap.css === null && dela.efterSkrap.lage !== 'lila', dela.efterSkrap);
    R.ok('kod används: samma tema tillbaka', dela.giltig === 'Klart, temat används nu.' && dela.fore === dela.efter && dela.sammaKod && dela.faltTomt, { giltig: dela.giltig, fore: dela.fore, efter: dela.efter, sammaKod: dela.sammaKod });
    await bild(s, '06-dela');

    // 9. Färg från bakgrunden (egen bild som data:-URL, så att testet inte beror på nätet)
    const bg = await J(`(async () => {
      const T = window.AnpassaTema, kulor = (h) => { const [, a, b] = T.rgbTillOklab(T.hexTillRgb(h)); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
      const bildUrl = (rutor) => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); for (const [f, x, y, w, h] of rutor) { g.fillStyle = f; g.fillRect(x, y, w, h); } return c.toDataURL('image/png'); };
      const kor = async (url) => {
        if (url) { localStorage.setItem('skoll-bg', url); applyStoredBg(); } else { localStorage.setItem('skoll-bg', 'slump'); document.getElementById('nt-bg').style.backgroundImage = 'none'; }
        const knapp = document.querySelector('#anp-tema [data-bgfarg]'); knapp.click();
        await __T.tills(() => !knapp.disabled, 8000); await __T.ram();
        return { status: document.querySelector('#anp-tema [data-bgstatus]').textContent, accent: Anpassa.get('tema.accent'), alt: [...document.querySelectorAll('#anp-tema .anp-tema-alt [data-accent]')].map((b) => b.dataset.accent) };
      };
      const fore = Anpassa.get('tema.accent');
      const fargad = await kor(bildUrl([['#1d7f86', 0, 0, 160, 60], ['#8a8f94', 0, 60, 160, 30], ['#d9822b', 120, 0, 40, 20]]));
      fargad.kulor = kulor(fargad.accent); fargad.mal = kulor('#1d7f86'); fargad.altKulor = fargad.alt.map(kulor);
      const gra = await kor(bildUrl([['#808080', 0, 0, 160, 90], ['#6f6f6f', 0, 0, 80, 45]]));
      const ingen = await kor(null);
      return JSON.stringify({ fore, fargad, gra, ingen });
    })()`);
    const kulorDiff = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    R.ok('färg från bakgrunden: den stora färgade ytan vinner (blågrön)', /^Klar/.test(bg.fargad.status) && kulorDiff(bg.fargad.kulor, bg.fargad.mal) < 20, bg.fargad);
    R.ok('färg från bakgrunden: den lilla orange fläcken blir ett extra förslag', bg.fargad.altKulor.some((k) => kulorDiff(k, 60) < 30), bg.fargad.altKulor);
    R.ok('grå bild: ingen färg byts, begripligt besked', bg.gra.status === 'Bilden har för lite färg. Prova en annan bakgrund.' && bg.gra.accent === bg.fargad.accent, bg.gra);
    R.ok('ingen bild: begripligt besked', bg.ingen.status === 'Hittade ingen bakgrundsbild. Öppna en ny flik så att bilden syns och försök igen.', bg.ingen.status);
    await bild(s, '07-farg-fran-bakgrund');

    // 10. Ett andra fönster och ett inkognitofönster följer med direkt
    const forsta = app.t.id;
    const tangent = async (mod, key, code, vk) => {
      for (const type of ['rawKeyDown', 'keyUp']) await s.skicka('Input.dispatchKeyEvent', { type, modifiers: mod, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    };
    await tangent(2, 'n', 'KeyN', 78);
    const t2 = await H.mal(app.cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html') && !m.url.includes('incognito') && m.id !== forsta, 15000);
    R.ok('Ctrl+N öppnade ett andra fönster', !!t2);
    if (t2) {
      const s2 = await anslutSkal(t2);
      const start2 = await jsonKor(s2, `JSON.stringify({ accent: __T.anp('accent'), typsnitt: __T.anp('typsnitt'), horn: __T.anp('horn') })`);
      R.ok('nytt fönster startar med temat', start2.accent === bg.fargad.accent && start2.typsnitt === 'serif', start2);
      await s.kor(`(async () => { __T.knapp('[data-accent="#0b8a8f"]'); __T.knapp('[data-namn=lage][data-v=morkt]'); return 1; })()`);
      const ok2 = await s2.kor(`__T.tills(() => __T.anp('accent') === '#0b8a8f' && document.documentElement.dataset.theme === 'dark')`);
      R.ok('ändring i fönster 1 syns direkt i fönster 2 (färg och mörkt läge)', ok2 === true, await jsonKor(s2, `JSON.stringify({ accent: __T.anp('accent'), theme: document.documentElement.dataset.theme })`));
      await s2.kor(`Anpassa.set('tema.densitet', 'kompakt', 'Densitet').then(() => 1)`);
      const ok1 = await s.kor(`__T.tills(() => __T.anp('densitet') === 'kompakt' && document.querySelector('#anp-tema [data-namn=densitet][data-v=kompakt]').classList.contains('on'))`);
      R.ok('ändring i fönster 2 syns direkt i fönster 1 (också i inställningarna)', ok1 === true);
      R.ok('inga JS-fel i fönster 2', !fel(s2).length, fel(s2));
      s2.stang();
    }
    await tangent(10, 'N', 'KeyN', 78);
    const t3 = await H.mal(app.cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html') && m.url.includes('incognito'), 15000);
    R.ok('Ctrl+Skift+N öppnade ett inkognitofönster', !!t3);
    if (t3) {
      const s3 = await anslutSkal(t3);
      const ink = await jsonKor(s3, `JSON.stringify({ accent: __T.anp('accent'), terra: __T.rot('--color-terra'), body: __T.varde(document.body, '--color-terra'), incog: document.body.classList.contains('incog') })`);
      R.ok('inkognito får accenten (ljus variant mot den mörka ytan)', ink.accent === '#0b8a8f' && ink.body === (await J(`window.AnpassaTema.palett('#0b8a8f').d`)), ink);
      if (bilder) await bild(s3, '08-inkognito');
      s3.stang();
    }

    // 11. Slutläge inför omstarten: Natt + serif + stor text + egen färg
    await s.kor(`(async () => { __T.knapp('[data-forval=natt]'); await __T.tills(() => Anpassa.get('tema.lage') === 'morkt' && Anpassa.get('tema.accent') === '#3b6fe0'); __T.knapp('[data-namn=storlek][data-v=stor]'); await __T.tills(() => __T.anp('storlek') === 'stor'); return 1; })()`);
    await s.kor(`(() => { const f = document.querySelector('#anp-tema [data-hex]'); f.focus(); f.value = '#c0ffee'; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); f.blur(); return 1; })()`);
    await s.kor(`__T.tills(() => __T.anp('accent') === '#c0ffee')`);
    await bild(s, '09-natt-egen-farg-mork');
    await s.kor(`closeSettings(); 1`);
    await H.sov(600);
    await bild(s, '10-startsida-mork');
    const fore = await J(`JSON.stringify({ alla: __T.tema(), theme: document.documentElement.dataset.theme })`);
    R.ok('inga JS-fel i skalet', !fel(s).length, fel(s));
    await H.sov(500);   // butiken sparar 150 ms efter sista ändringen
    s.stang(); app.main.stang();
    await H.stang(app.p);
    app = null;

    // 12. Omstart med samma profil: allt är kvar från första bildrutan
    app = await oppna(rot, x, profil, logg);
    const s4 = app.s;
    const efter = await jsonKor(s4, `JSON.stringify({ alla: __T.tema(), theme: document.documentElement.dataset.theme,
      attr: Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name.startsWith('data-anp')).map((a) => [a.name, a.value])), terra: __T.rot('--color-terra'), font: __T.varde(document.body, 'font-family') })`);
    R.ok('efter omstart: samma värden', efter.alla === fore.alla && efter.alla.includes('#c0ffee'), { fore: fore.alla, efter: efter.alla });
    R.ok('efter omstart: tillämpat direkt (mörkt, egen färg, serif, stor text)', efter.theme === 'dark' && efter.attr['data-anp-accent'] === '#c0ffee' && efter.attr['data-anp-storlek'] === 'stor' && efter.attr['data-anp-typsnitt'] === 'serif' && !efter.attr['data-anp-densitet'] && /Charter/.test(efter.font) && efter.terra === (await jsonKor(s4, `window.AnpassaTema.palett('#c0ffee').d`)), efter);

    // 13. Det gamla valet "Mörkt" (bara i localStorage) flyttas in i tema.lage, utan att hamna i ångra-historiken
    await s4.kor(`Anpassa.set('tema.lage', undefined, 'test').then(() => 1)`);
    await H.sov(300);
    const histFore = await s4.kor(`Anpassa.historik().then((h) => JSON.stringify(h[0]))`);
    await s4.kor(`localStorage.setItem('skoll-theme', 'dark'); location.reload(); 1`);
    await H.sov(2500);
    await s4.kor('(' + sidHjalp.toString() + ')(); 1');
    const flytt = await jsonKor(s4, `(async () => { await __T.tills(() => Anpassa.get('tema.lage', null) === 'morkt'); return JSON.stringify({ lage: Anpassa.get('tema.lage', null), theme: document.documentElement.dataset.theme, hist: JSON.stringify((await Anpassa.historik())[0]) }); })()`);
    const lagrat = await app.M(`const r = process.mainModule.require; await new Promise((v) => setTimeout(v, 400)); return JSON.parse(r('fs').readFileSync(r('path').join(el.app.getPath('userData'), 'adraze-anpassa.json'), 'utf8')).varden['tema.lage'] || null;`);
    R.ok('gamla "Mörkt" flyttas in i tema.lage', flytt.lage === 'morkt' && flytt.theme === 'dark' && lagrat === 'morkt', { ...flytt, lagrat });
    R.ok('flytten hamnar inte i ångra-historiken', flytt.hist === histFore, { fore: histFore, efter: flytt.hist });
    R.ok('inga JS-fel efter omstart', !fel(s4).length, fel(s4));
    const nekade = fs.readFileSync(logg, 'utf8').split('\n').filter((r) => r.includes('[ipc] nekad'));
    R.ok('inga IPC-kanaler nekade', !nekade.length, nekade.slice(0, 3));
    s4.stang(); app.main.stang();
  } catch (e) {
    R.ok('testet kördes klart', false, String((e && e.stack) || e));
  } finally {
    if (app) await H.stang(app.p);
    x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--bilder');
  const bilder = i >= 0 ? path.resolve(a[i + 1]) : null;
  const mapp = a.find((v, j) => !v.startsWith('--') && a[j - 1] !== '--bilder');
  kor(path.resolve(mapp || path.join(__dirname, '..', '..')), bilder).then((R) => { console.log(R.text()); if (bilder) console.log('Skärmdumpar: ' + bilder); process.exit(R.fel.length ? 1 : 0); });
}
