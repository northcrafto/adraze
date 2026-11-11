#!/usr/bin/env node
// Test av jultemat (jul.js, ui/jul.js, ui/jul-pynt.js, ui/jul.css) mot utvecklingsbygget, osynligt i Xvfb.
// Datumet låtsas med ADRAZE_DATUM och webbläsaren startas om mellan dagarna med samma profil.
// Går igenom: de rena funktionerna (datum, säsong, PNG-kontroll), november (inget syns, ingen fråga, temat Jul går
// ändå att välja i temalistan), 1 december (frågan kommer en gång, i alla fönster), Ja tack (julfärger, snö och luva
// utan att något flyttar sig och utan "Ändrat · Ångra"), snöns paus, inkognito, luckor, räknaren per dag,
// brytarna i inställningarna, midnatt efter trettondagen (allt tillbaka som innan, det man själv ändrat behålls),
// nästa jul (frågan igen, Nej tack), och att en fråga utan svar slutar komma efter tre dagar.
// Användning: node tools/test/jul.js [webbläsarmapp] [--bilder <mapp>] [--logik]   (avslutar med 0 om allt gick igenom)
//   --logik kör bara de delar som inte startar AdRaze (rena funktioner och julfärgernas regler), på några sekunder.
// Instanserna stängs via sina PID:ar, aldrig som processgrupp.
const path = require('path');
const fs = require('fs');
const H = require('./hjalp');

const lever = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Delarna i data-jul. Testet frågar efter de delar det gäller och håller därför också när fler delar byggs.
const har = (delar, ...namn) => namn.every((n) => String(delar || '').split(' ').includes(n));
// Stänger snällt (SIGTERM = app.quit, så att before-quit hinner spara) och sedan varje kvarvarande process för sig
async function stang(app, ms = 9000) {
  if (!app) return false;
  try { app.s.stang(); } catch {}
  try { app.main.stang(); } catch {}
  const pidar = new Set([app.p.pid, ...H.allaUnder(app.p.pid)]);
  try { process.kill(app.p.pid, 'SIGTERM'); } catch {}   // app.p är Electrons huvudprocess (startas direkt, utan omslag)
  let snallt = false;
  for (let i = 0; i < ms / 100; i++) { if (!lever(app.p.pid) || H.kommando(app.p.pid).length === 0) { snallt = true; break; } await H.sov(100); }
  for (const p of H.allaUnder(app.p.pid)) pidar.add(p);   // barn som kommit till under tiden
  // Bara processer som bevisligen är testets egna: huvudprocessen (vårt eget handtag, inte avslutad) och barn som har
  // profilmappen eller felsökningsporten i kommandoraden
  const mitt = (p) => { if (p === app.p.pid) return app.p.exitCode === null && app.p.signalCode === null; const c = H.kommando(p).join(' '); return c.includes(app.profil) || c.includes('--remote-debugging-port=' + app.cdp); };
  for (const p of pidar) if (lever(p) && mitt(p)) { try { process.kill(p, 'SIGKILL'); } catch {} }
  await H.sov(300);
  return snallt;
}

async function oppna(rot, x, profil, logg, datum) {
  const [insp, cdp] = [await H.ledigPort(), await H.ledigPort()];
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, ['--inspect=' + insp, rot, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil, { ADRAZE_DATUM: datum }), logg);
  await H.vantaPaPort(cdp);
  const t = await H.mal(cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html'));
  if (!t) throw new Error('skalet startade inte');
  const s = await anslutSkal(t);
  const main = await H.anslut((await H.hamtaJson(insp, '/json'))[0].webSocketDebuggerUrl);
  await main.skicka('Runtime.enable');
  const M = (expr) => main.kor(`(async () => { const el = process.mainModule.require('electron'); const jul = process.mainModule.require('./jul'); ${expr} })()`);
  return { p, cdp, s, t, main, M, profil };
}
// Ansluter till ett skal och gör det en användare gör först: klickar bort introt och säger nej till de andra notiserna
// (flytta från en annan webbläsare, huvudwebbläsare). Julfrågan rörs inte.
async function anslutSkal(t) {
  const s = await H.anslut(t.webSocketDebuggerUrl);
  await s.skicka('Runtime.enable');
  await s.skicka('Page.enable');
  await s.skicka('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (let i = 0; i < 60 && (await s.kor(`typeof showSettingsCat === 'function' && document.readyState === 'complete' && typeof window.Jul === 'object'`)) !== true; i++) await H.sov(250);
  await s.kor(`(() => {
    try { localStorage.setItem('adraze-flytt-erbjuden', '1'); localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 30 * 86400000)); } catch {}
    const i = document.getElementById('hxintro'); if (i) i.remove();
    const stada = () => document.querySelectorAll('body > .notis:not(#jul-fraga)').forEach((n) => n.remove());
    stada(); window.__stadaNotiser = setInterval(stada, 300);
    window.__J = {
      tills: async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await f()) return true; } catch {} await new Promise((r) => setTimeout(r, 50)); } return false; },
      ruta: (q) => { const e = typeof q === 'string' ? document.querySelector(q) : q; if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 2) / 2); },
      sno: () => { const n = {}; for (const a of document.getAnimations()) { if (/^jul-(fall|svaj)$/.test(a.animationName || '')) n[a.playState] = (n[a.playState] || 0) + 1; } return n; },
      farg: (q, p) => getComputedStyle(document.querySelector(q)).getPropertyValue(p || 'background-color').trim(),
      rgb: (s) => (String(s).match(/[\\d.]+/g) || []).slice(0, 3).map(Number),
      delar: () => document.documentElement.getAttribute('data-jul'),
      tema: () => JSON.stringify(Object.entries(Anpassa.alla()).filter(([k]) => k.startsWith('tema.')).sort()),
    };
    return 1;
  })()`);
  return s;
}
const J = async (s, expr) => { const r = await s.kor(expr); try { return JSON.parse(r); } catch { return r; } };
const fel = (s) => s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text);
const lasFil = (profil, namn) => { try { return JSON.parse(fs.readFileSync(path.join(profil, 'config', 'AdRaze', namn), 'utf8')); } catch { return null; } };
const tillstand = (profil) => lasFil(profil, 'adraze-jul.json') || {};
const klicka = async (s, x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await s.skicka('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const tangent = async (s, mod, key, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await s.skicka('Input.dispatchKeyEvent', { type, modifiers: mod, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
// Väntar på att frågan syns (true) eller konstaterar att den inte kommit efter ms (false)
const fragan = (s, ms) => s.kor(`__J.tills(() => !!document.getElementById('jul-fraga'), ${ms})`);
const LAGE = `JSON.stringify({ sasong: Jul.sasong(), aktiv: Jul.aktiv(), delar: __J.delar(), palett: document.documentElement.getAttribute('data-anp-palett'), theme: document.documentElement.dataset.theme,
  pa: Anpassa.alla()['jul.pa'], fraga: !!document.getElementById('jul-fraga'), sno: !!document.getElementById('jul-sno'), gorilla: !!document.getElementById('jul-gorilla'),
  knapp: getComputedStyle(document.querySelector('#adblock .ab-mark')).content, inst: document.getElementById('anp-jul').childElementCount })`;

function renaFunktioner(R, rot) {
  const jul = require(path.join(rot, 'jul.js'));
  const d = (s) => { const x = jul.lasDatum(s); return x ? [x.getFullYear(), x.getMonth() + 1, x.getDate(), x.getHours(), x.getMinutes(), x.getSeconds()].join('-') : null; };
  R.ok('ADRAZE_DATUM: dag (kl. 12), dag med tid och med sekunder', d('2026-12-05') === '2026-12-5-12-0-0' && d('2026-12-24T09:30') === '2026-12-24-9-30-0' && d('2026-11-30T23:59:30') === '2026-11-30-23-59-30', [d('2026-12-05'), d('2026-12-24T09:30')]);
  R.ok('ADRAZE_DATUM: skräp och datum som inte finns ger inget', [d('2026-02-31'), d('igår'), d(''), d(undefined), d('2026-13-01')].every((v) => v === null));
  const S = (y, m, dd) => jul.sasong(new Date(y, m - 1, dd, 12));
  const sasonger = [S(2026, 11, 30), S(2026, 12, 1), S(2026, 12, 31), S(2027, 1, 1), S(2027, 1, 6), S(2027, 1, 7), S(2027, 7, 1)];
  R.ok('säsongen är 1 december–6 januari och heter som året den började', JSON.stringify(sasonger) === JSON.stringify([null, 2026, 2026, 2026, 2026, null, null]), sasonger);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]).toString('base64');
  R.ok('delningsbilden: bara PNG som data-URL släpps igenom', !!jul.tolkaPng('data:image/png;base64,' + png) && !jul.tolkaPng('data:image/jpeg;base64,' + png) && !jul.tolkaPng('data:image/png;base64,' + Buffer.from('inte en bild alls').toString('base64')) &&
    !jul.tolkaPng('https://exempel.se/bild.png') && !jul.tolkaPng(null) && !jul.tolkaPng('data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024)));
  const ren = jul.rensa({ fragad: 2026, visad: ['2026-12-01', 'x', 5], fore: { sasong: 2026, varden: { 'tema.accent': '#3b6fe0', 'annat': 'x', 'tema.lage': 5 } }, luckor: { 2026: [3, 1, 1, 99, 'a'], abc: [1] }, dagar: { '2026-12-01': { a: 5.7, s: -1, k: 'x' }, fel: { a: 1 } } });
  R.ok('tillståndsfilen tvättas när den läses', JSON.stringify(ren) === '{"v":1,"borjan":null,"sasong":null,"fragad":2026,"visad":["2026-12-01"],"fore":{"sasong":2026,"varden":{"tema.accent":"#3b6fe0"}},"luckor":{"2026":[1,3]},"dagar":{"2026-12-01":{"a":5,"s":0,"k":0,"p":0}}}', ren);
}

// Julfärgernas regler mot en låtsad Electron (ingen app startas): huvudprocessens moduler laddas som i main.js,
// "omstart" = den gamla omgången avslutas (before-quit körs, dess timrar tas bort) och modulerna laddas om med nytt
// ADRAZE_DATUM och läser sina filer igen. Tiden flyttas med Date.now.
async function logik(R, rot) {
  const Module = require('module');
  const mapp = H.tempDir('jul-logik');
  const hanterare = {}, skickat = [], vidAvslut = [], timrar = new Set();
  const riktigTimeout = global.setTimeout, riktigtIntervall = global.setInterval;
  const latsad = {
    app: { getPath: () => mapp, on: (k, f) => { if (k === 'before-quit') vidAvslut.push(f); }, once() {}, whenReady: () => new Promise(() => {}), getVersion: () => 'test' },
    ipcMain: { on() {}, handle: (k, f) => { hanterare[k] = f; } },
    BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
    dialog: {}, clipboard: {}, nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) },
  };
  const galleritema = { ok: true, tema: { id: 't' + '0'.repeat(20), namn: 'Prov', varden: { 'tema.accent': '#2f9e67', 'tema.lage': 'ljust' } } };
  const api = async (vag) => (vag.startsWith('/galleri/schema') ? { ok: true, farger: ['tema.accent'], val: { 'tema.lage': ['ljust', 'morkt', 'system'], 'tema.horn': ['kantig', 'normal', 'rund'], 'tema.densitet': ['kompakt', 'normal', 'luftig'] } }
    : vag.startsWith('/galleri/tema') ? galleritema : { ok: true });
  const origLoad = Module._load, origNow = Date.now;
  Module._load = function (begaran, ...rest) { return begaran === 'electron' ? latsad : origLoad.call(this, begaran, ...rest); };
  const FILER = ['anpassa.js', 'anpassa-tema.js', 'jul.js', 'anpassa-galleri.js'].map((f) => path.join(rot, f));
  const lugn = (ms = 30) => new Promise((r) => riktigTimeout(r, ms));
  let A, jul, hopp = 0;
  // Samma ordning som i main.js: butiken, tema-nycklarna, jul, och längre ner galleriet. Väntar sedan ut första kollen.
  async function starta(datum) {
    await lugn(250);   // butiken skriver 150 ms efter sista ändringen
    for (const f of vidAvslut.splice(0)) { try { f(); } catch {} }   // den gamla omgången avslutas …
    for (const t of timrar) { clearTimeout(t); clearInterval(t); }   // … och dess timrar dör med den
    timrar.clear();
    for (const f of FILER) delete require.cache[require.resolve(f)];
    hopp = 0; process.env.ADRAZE_DATUM = datum;
    A = require(FILER[0]); require(FILER[1]); jul = require(FILER[2]);
    A.init({}); jul.init({ skicka: (...a) => skickat.push(a) });
    require(FILER[3]).init({ anpassa: A, adrazeApi: api, barnNagonstans: () => false, skicka: () => {} });
    await lugn();
  }
  const tema = () => JSON.stringify(Object.entries(A.alla()).filter(([k]) => k.startsWith('tema.')).sort());
  const fil = () => { try { return JSON.parse(fs.readFileSync(path.join(mapp, 'adraze-jul.json'), 'utf8')); } catch { return {}; } };
  const framat = async (dagar) => { hopp += dagar * 86400000; jul.kolla(); await lugn(); };
  const NATT = '[["tema.accent","#3b6fe0"],["tema.lage","morkt"]]', JULEN = '[["tema.accent","#d9a441"],["tema.lage","morkt"],["tema.palett","jul"]]';
  try {
    Date.now = () => origNow() + hopp;
    global.setTimeout = (...a) => { const t = riktigTimeout(...a); timrar.add(t); return t; };
    global.setInterval = (...a) => { const t = riktigtIntervall(...a); timrar.add(t); return t; };
    // Påslaget utanför julen (import, Falk) gäller inte
    await starta('2026-07-01');
    A.satt('tema.accent', '#3b6fe0', {}); A.satt('tema.lage', 'morkt', {});
    A.satt('jul.pa', true, {}); await lugn();
    R.ok('logik: Jultema påslaget i juli nollställs direkt och inget ändras', A.alla()['jul.pa'] === undefined && tema() === NATT && !fil().fore, { pa: A.alla()['jul.pa'], tema: tema() });

    // Ja tack den 5 december, sedan provas ett tema ur galleriet medan julfärgerna är på
    await starta('2026-12-05');
    const histFore = A.historik().length;
    const svar = await hanterare['jul:svara']({}, 'ja'); await lugn();
    R.ok('logik: Ja tack slår på julfärgerna och sparar temat innan, utan att något hamnar i ångra-historiken', svar.ok && tema() === JULEN && JSON.stringify(fil().fore) === '{"sasong":2026,"varden":{"tema.accent":"#3b6fe0","tema.lage":"morkt"}}' && A.historik().length === histFore, { tema: tema(), fore: fil().fore, hist: [histFore, A.historik().length] });
    const tysta = skickat.filter((a) => a[0] === 'jul:tyst').length;
    R.ok('logik: fönstren blir tillsagda att inte visa "Ändrat · Ångra" för julfärgerna', tysta >= 1 && skickat.some((a) => a[0] === 'jul:andrad' && a[1].fragad === true), skickat.map((a) => a[0]));
    const prova = await hanterare['galleri:prova']({}, { id: galleritema.tema.id });
    R.ok('logik: ett galleritema som provas tar bort julens gröna ytor', prova.ok && tema() === '[["tema.accent","#2f9e67"],["tema.lage","ljust"]]' && require(FILER[3]).provar() === true, tema());
    // Julen tar slut mitt i provningen: jul.js väntar. Ångras provningen kommer julfärgerna tillbaka, och då temat innan.
    await framat(40);
    R.ok('logik: säsongen slut under en galleriprovning: temat rörs inte än, Jultema nollställs', jul.sasong() === null && tema() === '[["tema.accent","#2f9e67"],["tema.lage","ljust"]]' && !!fil().fore && A.alla()['jul.pa'] === undefined, { tema: tema(), fore: fil().fore });
    await hanterare['galleri:angra'](); await lugn();
    R.ok('logik: provningen ångras: julfärgerna kommer tillbaka en stund', tema() === JULEN);
    jul.kolla(); await lugn();
    R.ok('logik: … och nästa koll lägger tillbaka temat man hade innan julen', tema() === NATT && jul.lageUt().sasong === null, tema());

    // Samma sak men med omstart mitt i provningen efter julen: galleriet lägger tillbaka först, sedan jul
    await starta('2026-12-05');
    await hanterare['jul:svara']({}, 'ja'); await lugn();   // (frågan är redan besvarad i år, men svaret går att ge igen)
    await hanterare['galleri:prova']({}, { id: galleritema.tema.id }); await lugn();
    await starta('2027-01-07');
    R.ok('logik: omstart efter julen mitt i en galleriprovning: temat innan julen kommer tillbaka', tema() === NATT && A.alla()['jul.pa'] === undefined, { tema: tema(), fil: fil() });
    const anpFil = JSON.parse(fs.readFileSync(path.join(mapp, 'adraze-anpassa.json'), 'utf8')).varden;
    R.ok('logik: både temat och det tömda "innan" ligger på disk direkt (ingen lucka om AdRaze dör)', fil().fore === null && anpFil['tema.palett'] === undefined && anpFil['tema.accent'] === '#3b6fe0', { fore: fil().fore, anpFil });

    // Man byter själv tema under julen: det ska varken skrivas över vid nästa start eller efter trettondagen
    await starta('2027-12-05');
    R.ok('logik: ny säsong: frågan ska ställas igen', jul.lageUt().fragad === false && jul.lageUt().sasong === 2027);
    await hanterare['jul:svara']({}, 'ja'); await lugn();
    A.satt('tema.palett', undefined, {}); A.satt('tema.accent', '#e8a317', {}); A.satt('tema.lage', undefined, {});   // kortet Sand
    await starta('2027-12-10');
    R.ok('logik: eget tema under julen ligger kvar efter omstart (julfärgerna tvingas inte på igen)', tema() === '[["tema.accent","#e8a317"]]' && A.alla()['jul.pa'] === true, tema());
    await starta('2028-01-07');
    R.ok('logik: … och efter trettondagen (inget läggs tillbaka över det man själv valt)', tema() === '[["tema.accent","#e8a317"]]' && A.alla()['jul.pa'] === undefined, tema());

    // Man hade redan temat Jul när man sa ja: inget "innan", temat ligger kvar efter julen
    await starta('2028-07-01');
    A.satt('tema.accent', '#d9a441', {}); A.satt('tema.lage', 'morkt', {}); A.satt('tema.palett', 'jul', {});
    await starta('2028-12-02');
    await hanterare['jul:svara']({}, 'ja'); await lugn();
    R.ok('logik: Ja tack med temat Jul redan valt: inget att gå tillbaka till', JSON.stringify(fil().fore) === '{"sasong":2028,"varden":null}' && tema() === JULEN, fil().fore);
    await starta('2029-01-07');
    R.ok('logik: … temat Jul ligger kvar efter julen', tema() === JULEN && A.alla()['jul.pa'] === undefined);

    // AdRaze startas inte mellan två jular: förra julens färger läggs tillbaka och frågan kommer igen
    A.aterstall('tema.'); A.satt('tema.accent', '#3b6fe0', {}); A.satt('tema.lage', 'morkt', {});
    await starta('2029-12-20');
    await hanterare['jul:svara']({}, 'ja'); await lugn();
    await starta('2030-12-03');
    R.ok('logik: ett år utan start: förra julens färger läggs tillbaka och frågan ställs igen', tema() === NATT && A.alla()['jul.pa'] === undefined && jul.lageUt().fragad === false && fil().fore === null, { tema: tema(), lage: jul.lageUt() });

    // Nej tack, och Jultema påslaget för hand räknas som svar
    const nej = await hanterare['jul:svara']({}, 'nej'); await lugn();
    R.ok('logik: Nej tack: inget ändras och frågan är besvarad', nej.ok && tema() === NATT && A.alla()['jul.pa'] === undefined && jul.lageUt().fragad === true);
    await starta('2031-12-03');
    A.satt('jul.pa', true, {}); await lugn();
    R.ok('logik: Jultema påslaget i inställningarna räknas som svar på frågan', jul.lageUt().fragad === true && tema() === JULEN);
    A.satt('jul.farger', false, {}); await lugn();
    const utanFarger = tema();
    A.angra(); await lugn();
    R.ok('logik: Julfärger av lägger tillbaka temat, Ångra slår på dem igen', utanFarger === NATT && tema() === JULEN && JSON.stringify(fil().fore.varden) === '{"tema.accent":"#3b6fe0","tema.lage":"morkt"}', [utanFarger, tema()]);
  } catch (e) {
    R.ok('logiktestet kördes klart', false, String((e && e.stack) || e));
  } finally {
    Module._load = origLoad; Date.now = origNow; global.setTimeout = riktigTimeout; global.setInterval = riktigtIntervall; delete process.env.ADRAZE_DATUM;
    for (const t of timrar) { clearTimeout(t); clearInterval(t); }
    for (const f of FILER) delete require.cache[require.resolve(f)];
    await lugn(100);
    try { fs.rmSync(mapp, { recursive: true, force: true }); } catch {}
  }
}

async function kor(rot, bilder, bara) {
  const R = H.resultat();
  renaFunktioner(R, rot);
  await logik(R, rot);
  if (bara === 'logik') return R;
  const x = await H.startaXvfb();
  const profil = H.tempDir('jul'), profilB = H.tempDir('jul-b');
  const logg = path.join(profil, 'logg.txt');
  let app = null;
  const bild = async (s, namn) => {
    if (!bilder) return;
    const r = await s.skicka('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(bilder, { recursive: true });
    fs.writeFileSync(path.join(bilder, namn + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const starta = async (datum, p = profil) => { app = await oppna(rot, x, p, logg, datum); return app; };
  const stangApp = async () => { const a = app; app = null; return stang(a); };
  try {
    /* ── 1. November: inget syns och ingen fråga, men temat Jul går att välja ── */
    let { s, M } = await starta('2026-11-20');
    const nov = await J(s, `JSON.stringify({ lage: ${LAGE}, test: Jul.test(), nu: [Jul.nu().getFullYear(), Jul.nu().getMonth() + 1, Jul.nu().getDate()].join('-'),
      reg: Object.entries(anpassaBro.alla().register).filter(([k]) => k.startsWith('jul.') || k === 'tema.palett').map(([k, v]) => [k, v.standard, v.barnLast]) })`);
    const novLage = JSON.parse(nov.lage);
    R.ok('låtsat datum gäller i fönstret', nov.test === true && nov.nu === '2026-11-20', nov.nu);
    R.ok('november: ingen säsong, inget pynt, vanlig logga, tom inställningsdel', novLage.sasong === null && !novLage.aktiv && novLage.delar === null && !novLage.sno && !novLage.gorilla && !/mark-luva/.test(novLage.knapp) && novLage.inst === 0, novLage);
    R.ok('nycklarna jul.* och tema.palett finns, barn får ändra dem, jultemat är av från början', nov.reg.length === 8 && nov.reg.every((r) => r[2] === false) && nov.reg.find((r) => r[0] === 'jul.pa')[1] === false && nov.reg.find((r) => r[0] === 'tema.palett')[1] === 'standard', nov.reg);
    R.ok('november: ingen fråga efter 8 sekunder', (await fragan(s, 8000)) === false);
    // Temat Jul i temalistan, året runt
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(700);
    const lista = await J(s, `(async () => {
      const kort = [...document.querySelectorAll('#anp-tema [data-forval]')];
      const rader = new Set(kort.map((k) => Math.round(k.getBoundingClientRect().top)));
      document.querySelector('#anp-tema [data-forval=jul]').click();
      await __J.tills(() => document.documentElement.getAttribute('data-anp-palett') === 'jul' && document.documentElement.dataset.theme === 'dark');
      await new Promise((r) => setTimeout(r, 400));
      const K = (a, b) => window.AnpassaTema.kontrast(__J.rgb(a), __J.rgb(b));
      const flikrad = __J.farg('#tabstrip'), aktiv = __J.farg('#tabs .tab.active'), rad = __J.farg('#toolbar'), falt = __J.farg('#omnibox'), inst = __J.farg('#settings');
      return JSON.stringify({ id: kort.map((k) => k.dataset.forval), rader: rader.size, valda: [...document.querySelectorAll('#anp-tema [data-forval].on')].map((k) => k.dataset.forval),
        mini: document.querySelector('#anp-tema [data-forval=jul] .anp-tema-mini').classList.contains('jul'), varden: __J.tema(), flikrad, aktiv, rad, falt, inst,
        kAktiv: K(__J.farg('#tabs .tab.active', 'color'), aktiv), kFalt: K(__J.farg('#address', 'color'), falt), kInst: K(__J.farg('#settings .set-title', 'color'), inst), kDim: K(__J.farg('#settings .set-desc', 'color'), inst),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--color-terra').trim(), delar: __J.delar() });
    })()`);
    R.ok('temalistan har sju teman på en rad, Jul efter Sand', lista.id.join() === 'adraze,skog,natt,sand,jul,hav,grafit' && lista.rader === 1 && lista.mini, lista.id);
    R.ok('kortet Jul sätter guld, mörkt och färguppsättningen jul, och bara det kortet är markerat', lista.varden === '[["tema.accent","#d9a441"],["tema.lage","morkt"],["tema.palett","jul"]]' && lista.valda.join() === 'jul', { varden: lista.varden, valda: lista.valda });
    R.ok('temat Jul: mörkgrön flikrad och verktygsrad, djupröd aktiv flik, guldaccent', lista.flikrad === 'rgb(12, 33, 24)' && lista.rad === 'rgb(16, 41, 29)' && lista.aktiv === 'rgb(143, 37, 41)' && lista.falt === 'rgb(23, 54, 38)' && lista.accent.toLowerCase() === '#d9a441', lista);
    R.ok('temat Jul: texten är läsbar (aktiv flik, adressfält, inställningar minst 4,5:1)', lista.kAktiv >= 4.5 && lista.kFalt >= 4.5 && lista.kInst >= 4.5 && lista.kDim >= 4.5, [lista.kAktiv, lista.kFalt, lista.kInst, lista.kDim].map((v) => +v.toFixed(2)));
    R.ok('temat Jul utanför julen: bara färgerna, inget pynt', lista.delar === null);
    await bild(s, '01-november-temat-jul');
    // Temat man har innan julen: Natt med egen färg och runda hörn (det ska komma tillbaka efter trettondagen)
    const innan = await J(s, `(async () => {
      document.querySelector('#anp-tema [data-forval=natt]').click();
      await __J.tills(() => Anpassa.get('tema.accent') === '#3b6fe0' && !document.documentElement.hasAttribute('data-anp-palett'));
      await Anpassa.set('tema.accent', '#7354d6', 'Accentfärg'); await Anpassa.set('tema.horn', 'rund', 'Hörn');
      await new Promise((r) => setTimeout(r, 300));
      return JSON.stringify({ tema: __J.tema(), palett: document.documentElement.getAttribute('data-anp-palett'), valda: [...document.querySelectorAll('#anp-tema [data-forval].on')].length, flikrad: __J.farg('#tabstrip') });
    })()`);
    const TEMA_INNAN = '[["tema.accent","#7354d6"],["tema.horn","rund"],["tema.lage","morkt"]]';
    R.ok('ett annat kort tar bort färguppsättningen jul (vanligt mörkt igen)', innan.tema === TEMA_INNAN && innan.palett === null && innan.flikrad !== 'rgb(12, 33, 24)', innan);
    await s.kor(`closeSettings(); 1`);
    R.ok('inga JS-fel i november', !fel(s).length, fel(s));
    await H.sov(400);
    await stangApp();

    /* ── 2. Första december: frågan kommer, i alla fönster ── */
    ({ s, M } = await starta('2026-12-01'));
    const histFore = await s.kor(`Anpassa.historik().then((h) => h.length)`);
    const kom = await fragan(s, 14000);
    const fr = await J(s, `JSON.stringify({ titel: (document.querySelector('#jul-fraga .notis-titel') || {}).textContent, under: (document.querySelector('#jul-fraga .notis-under') || {}).textContent,
      knappar: [...document.querySelectorAll('#jul-fraga button')].map((b) => b.textContent), lage: ${LAGE}, tema: __J.tema() })`);
    const frLage = kom === true ? JSON.parse(fr.lage) : {};
    R.ok('1 december: frågan "Vill du ha jultema?" visas på nya fliken', kom === true && fr.titel === 'Vill du ha jultema?' && fr.knappar.join() === 'Nej tack,Ja tack' && /trettondagen/.test(fr.under || ''), fr);
    R.ok('inget är påslaget innan man svarat', frLage.delar === null && frLage.pa === undefined && frLage.palett === null && !frLage.sno && !frLage.gorilla && fr.tema === TEMA_INNAN, frLage);
    R.ok('att frågan visats är sparat', JSON.stringify(tillstand(profil).visad) === '["2026-12-01"]' && tillstand(profil).fragad === null, tillstand(profil));
    await bild(s, '02-fragan');
    // Ett andra fönster får också frågan; svaret i det första stänger den där
    const forsta = app.t.id;
    await tangent(s, 2, 'n', 'KeyN', 78);
    const t2 = await H.mal(app.cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html') && !m.url.includes('incognito') && m.id !== forsta, 15000);
    let s2 = null;
    if (t2) { s2 = await anslutSkal(t2); R.ok('frågan visas också i ett andra fönster', (await fragan(s2, 14000)) === true); } else R.ok('Ctrl+N öppnade ett andra fönster', false);
    // Måtten innan något pynt: ingenting får flytta sig när luvan kommer (hälsningens text slumpas, därför bara dess höjdläge)
    const MATT = `JSON.stringify({ knapp: __J.ruta('#adblock'), falt: __J.ruta('#omnibox'), flik: __J.ruta('#tabs .tab'), ikon: __J.ruta('#tabs .tab .fav'), sok: __J.ruta('.anp-st-sok'), halsning: __J.ruta('#nt-greet').filter((v, i) => i % 2), remsa: __J.ruta('.nt-stats'), rutnat: __J.ruta('#anp-st-grid') })`;
    const mattFore = await s.kor(MATT);
    // Ja tack, med ett riktigt musklick (så att toasten "Ändrat · Ångra" hade visats om den inte tystats)
    const knapp = await J(s, `JSON.stringify(__J.ruta('#jul-fraga .notis-knapp'))`);
    await klicka(s, knapp[0] + knapp[2] / 2, knapp[1] + knapp[3] / 2);
    const paOk = await s.kor(`__J.tills(() => /sno/.test(__J.delar() || '') && /luva/.test(__J.delar() || '') && document.documentElement.getAttribute('data-anp-palett') === 'jul' && !!document.getElementById('jul-gorilla'), 5000)`);
    await H.sov(700);
    const ja = await J(s, `(async () => JSON.stringify({ lage: ${LAGE}, tema: __J.tema(), hist: (await Anpassa.historik()).length, toast: document.getElementById('apptoast').textContent, toastSyns: !document.getElementById('apptoast').classList.contains('hidden'),
      andratToast: !!document.querySelector('#anp-toast.pa'), flikrad: __J.farg('#tabstrip'), aktiv: __J.farg('#tabs .tab.active') }))()`);
    const jaLage = JSON.parse(ja.lage);
    R.ok('Ja tack: snö och luva slås på, frågan försvinner', paOk === true && har(jaLage.delar, 'sno', 'luva') && jaLage.pa === true && !jaLage.fraga && jaLage.sno && jaLage.gorilla, jaLage);
    R.ok('Ja tack: julfärgerna slås på (temat Jul)', jaLage.palett === 'jul' && jaLage.theme === 'dark' && ja.tema === '[["tema.accent","#d9a441"],["tema.lage","morkt"],["tema.palett","jul"]]' && ja.flikrad === 'rgb(12, 33, 24)' && ja.aktiv === 'rgb(143, 37, 41)', ja);
    R.ok('Ja tack: beskedet var man stänger av visas, men ingen "Ändrat · Ångra" och inget i ångra-historiken', ja.toastSyns && /Inställningar › Anpassa/.test(ja.toast) && !ja.andratToast && ja.hist === histFore, { toast: ja.toast, andrat: ja.andratToast, hist: [histFore, ja.hist] });
    const st1 = tillstand(profil);
    R.ok('temat innan julen är sparat på disk', st1.fragad === 2026 && st1.fore && st1.fore.sasong === 2026 && JSON.stringify(st1.fore.varden) === '{"tema.accent":"#7354d6","tema.lage":"morkt","tema.horn":"rund"}', st1);
    if (s2) {
      const tva = await J(s2, `(async () => { await __J.tills(() => !document.getElementById('jul-fraga') && /luva/.test(__J.delar() || ''), 4000); return ${LAGE}; })()`);
      R.ok('svaret gäller i det andra fönstret direkt (frågan borta, pyntet på)', !tva.fraga && har(tva.delar, 'sno', 'luva') && tva.palett === 'jul', tva);
      R.ok('inga JS-fel i det andra fönstret', !fel(s2).length, fel(s2));
      await s2.kor(`window.close(); 1`).catch(() => {});
      s2.stang();
      await H.sov(600);
    }

    /* ── 3. Luvan: bilden byts, ingenting flyttar sig ── */
    const mattEfter = await s.kor(MATT);
    R.ok('luvan flyttar ingenting (knapp, adressfält, flik, ikon, sökruta, hälsning, remsa, rutnät)', mattEfter === mattFore, { fore: mattFore, efter: mattEfter });
    const luva = await J(s, `(async () => {
      const g = document.getElementById('jul-gorilla'), plats = document.getElementById('jul-gorilla-plats');
      await __J.tills(() => g.complete && g.naturalWidth > 0);
      const gb = g.getBoundingClientRect(), sb = document.querySelector('.anp-st-sok').getBoundingClientRect(), nt = document.getElementById('nt-search').getBoundingClientRect();
      const b = document.querySelector('#adblock .ab-mark'), bb = b.getBoundingClientRect(), kb = document.getElementById('adblock').getBoundingClientRect();
      const traff = document.elementFromPoint(gb.left + gb.width / 2, sb.top + 20);
      return JSON.stringify({ knapp: getComputedStyle(b).content, flik: getComputedStyle(document.querySelector('#tabs .tab .fav img')).content, remsa: getComputedStyle(document.querySelector('.nt-st-mark')).content,
        knappbild: [bb.width, bb.height], sticketUpp: bb.top < kb.top + (kb.height - 17) / 2, inomFaltet: bb.top >= document.getElementById('omnibox').getBoundingClientRect().top && bb.right <= kb.right,
        stor: g.naturalWidth, bredd: gb.width, platsHojd: plats.getBoundingClientRect().height, sitterPa: gb.bottom > sb.top && gb.top < sb.top && gb.right <= sb.right + 1 && gb.left > sb.left + sb.width / 2,
        klickGarIgenom: !!traff && (traff.id === 'nt-search' || traff.contains(document.getElementById('nt-search'))), halsningFri: (() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('nt-greet')); return r.getBoundingClientRect().right < gb.left; })() });
    })()`);
    R.ok('blockerarknappen, flikens ikon och statistikremsan visar gorillan i luva', [luva.knapp, luva.flik, luva.remsa].every((c) => /jul\/mark-luva(-dark)?\.png/.test(c)), [luva.knapp, luva.flik, luva.remsa]);
    R.ok('luvan i knappen sticker upp ovanför loggans vanliga plats men håller sig inom adressfältet och knappen', luva.knappbild[0] === 20 && luva.sticketUpp && luva.inomFaltet, luva);
    R.ok('stora gorillan sitter på sökrutans överkant, till höger, utan egen höjd i kolumnen', luva.stor >= 256 && luva.bredd >= 64 && luva.bredd <= 88 && luva.platsHojd === 0 && luva.sitterPa, luva);
    R.ok('klick går igenom gorillan till sökrutan, och hälsningen är fri', luva.klickGarIgenom && luva.halsningFri, luva);
    const av = await J(s, `(async () => { document.getElementById('adblock').click(); await __J.tills(() => document.getElementById('adblock').classList.contains('off'));
      const f = getComputedStyle(document.querySelector('#adblock .ab-mark')).filter; document.getElementById('adblock').click(); await __J.tills(() => !document.getElementById('adblock').classList.contains('off')); return JSON.stringify({ f }); })()`);
    R.ok('avstängd blockerare: gorillan med luva blir grå som vanligt', /grayscale/.test(av.f), av.f);
    await bild(s, '03-efter-ja');

    /* ── 4. Snön: bakom innehållet, pausad under rutor, borta över webbsidor ── */
    const sno = await J(s, `(async () => {
      const lager = document.getElementById('jul-sno'), nt = document.getElementById('newtabpage'), n = lager.querySelectorAll('.jul-flinga').length;
      const igang = __J.sno();
      const mitt = document.querySelector('.anp-st-sok').getBoundingClientRect();
      const overst = document.elementFromPoint(mitt.left + 80, mitt.top + mitt.height / 2);
      openSettings(); await __J.tills(() => (__J.sno().paused || 0) === 2 * n, 3000); const iInst = __J.sno();
      closeSettings(); await __J.tills(() => (__J.sno().running || 0) === 2 * n, 3000); const efterInst = __J.sno();
      document.body.classList.add('reduce-motion'); await new Promise((r) => setTimeout(r, 200)); const stilla = __J.sno(); const stillaSyns = [...lager.querySelectorAll('.jul-flinga')].filter((f) => { const b = f.getBoundingClientRect(); return b.top > nt.getBoundingClientRect().top && b.bottom < innerHeight; }).length;
      document.body.classList.remove('reduce-motion'); await new Promise((r) => setTimeout(r, 200));
      return JSON.stringify({ n, igang, z: getComputedStyle(lager).zIndex, klick: getComputedStyle(lager).pointerEvents, foreKolumnen: lager.nextElementSibling === nt.querySelector('.anp-st-inre') || !!(lager.compareDocumentPosition(nt.querySelector('.anp-st-inre')) & 4),
        overst: overst && (overst.id || overst.className), iInst, efterInst, stilla, stillaSyns });
    })()`);
    R.ok('snön: 22–40 flingor som alla faller och svajar', sno.n >= 22 && sno.n <= 40 && sno.igang.running === 2 * sno.n, sno);
    R.ok('snön ligger bakom sökrutan och tar inga klick', sno.z === '5' && sno.klick === 'none' && sno.foreKolumnen && sno.overst === 'nt-search', sno);
    R.ok('snön pausas när inställningarna ligger över och går igen efteråt', sno.iInst.paused === 2 * sno.n && !sno.iInst.running && sno.efterInst.running === 2 * sno.n, { iInst: sno.iInst, efter: sno.efterInst });
    R.ok('Minska rörelse: inga animationer, flingorna hänger stilla', Object.keys(sno.stilla).length === 0 && sno.stillaSyns >= sno.n - 2, { stilla: sno.stilla, syns: sno.stillaSyns });
    // En sida i fliken (blockerarens egen sida, kräver inget nät): startsidan är dold och ingenting animeras
    const sida = await J(s, `(async () => { const hem = active; const t = createTab('adraze://adblock'); await __J.tills(() => document.getElementById('newtabpage').classList.contains('hidden'), 4000); await new Promise((r) => setTimeout(r, 300));
      const ut = { dold: document.getElementById('newtabpage').classList.contains('hidden'), sno: __J.sno(), knapp: getComputedStyle(document.querySelector('#adblock .ab-mark')).content };
      closeTab(t); switchTab(hem); await __J.tills(() => !document.getElementById('newtabpage').classList.contains('hidden'), 4000); await new Promise((r) => setTimeout(r, 400)); ut.tillbaka = __J.sno(); return JSON.stringify(ut); })()`);
    R.ok('när en sida visas finns ingen snö (inga animationer), luvan i knappen är kvar', sida.dold && Object.keys(sida.sno).length === 0 && /mark-luva/.test(sida.knapp) && sida.tillbaka.running > 0, sida);
    // Mätning: under fem sekunders snöfall görs ingen layout och inget skript körs (stilomräkningarna är Chromiums egen synk)
    await s.skicka('Performance.enable');
    const matt = async () => Object.fromEntries((await s.skicka('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
    await H.sov(1500);
    const m1 = await matt(); await H.sov(5000); const m2 = await matt();
    const dm = { layout: m2.LayoutCount - m1.LayoutCount, stil: m2.RecalcStyleCount - m1.RecalcStyleCount, skriptMs: Math.round((m2.ScriptDuration - m1.ScriptDuration) * 1000), stilMs: Math.round((m2.RecalcStyleDuration - m1.RecalcStyleDuration) * 1000) };
    R.ok('snöfallet är billigt: under 5 s högst 2 layouter, högst 15 stilomräkningar, under 30 ms stil och skript', dm.layout <= 2 && dm.stil <= 15 && dm.skriptMs + dm.stilMs < 30, dm);

    /* ── 5. Inställningarna, inkognito, luckor, räknare, bild ── */
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(600);
    const inst = await J(s, `JSON.stringify({ rubrik: (document.querySelector('#anp-jul h3') || {}).textContent, rader: [...document.querySelectorAll('#anp-jul .set-row')].map((r) => [r.querySelector('.set-title').textContent, r.querySelector('input').checked]),
      fore: document.getElementById('anp-jul').compareDocumentPosition(document.getElementById('anp-tema')) & 4, julKort: document.querySelector('#anp-tema [data-forval=jul]').classList.contains('on') })`);
    R.ok('Inställningar › Anpassa › Jul: Jultema och en brytare per byggd del, alla på', inst.rubrik === 'Jul' && JSON.stringify(inst.rader.slice(0, 4)) === '[["Jultema",true],["Julfärger",true],["Snö på nya fliken",true],["Gorillan i tomteluva",true]]' && inst.rader.every((r) => r[1] === true) && !!inst.fore && inst.julKort, inst);
    await bild(s, '04-installningar');
    await s.kor(`closeSettings(); 1`);
    await tangent(s, 10, 'N', 'KeyN', 78);
    const t3 = await H.mal(app.cdp, (m) => m.type === 'page' && m.url.includes('/ui/shell.html') && m.url.includes('incognito'), 15000);
    R.ok('Ctrl+Skift+N öppnade ett inkognitofönster', !!t3);
    if (t3) {
      const s3 = await anslutSkal(t3);
      const ink = await J(s3, `(async () => { openSettings(); showSettingsCat('anpassa'); await new Promise((r) => setTimeout(r, 500));
        return JSON.stringify({ aktiv: Jul.aktiv(), delar: __J.delar(), sno: !!document.getElementById('jul-sno'), gorilla: !!document.getElementById('jul-gorilla'), knapp: getComputedStyle(document.querySelector('#adblock .ab-mark')).content,
          inst: document.getElementById('anp-jul').textContent, brytare: document.querySelectorAll('#anp-jul input').length, lila: __J.farg('#tabstrip') }); })()`);
      R.ok('inkognitofönster: inget pynt, inga julfärger på ytorna, och inställningarna säger varför', !ink.aktiv && ink.delar === null && !ink.sno && !ink.gorilla && !/mark-luva/.test(ink.knapp) && /Jultemat visas inte i inkognitofönster\./.test(ink.inst) && ink.brytare === 0 && ink.lila !== 'rgb(12, 33, 24)', ink);
      R.ok('inga JS-fel i inkognitofönstret', !fel(s3).length, fel(s3));
      await s3.kor(`window.close(); 1`).catch(() => {});
      s3.stang();
      await H.sov(600);
    }
    const luckor = await J(s, `(async () => { const ut = {}; ut.ett = await Jul.oppnaLucka(1); ut.tva = await Jul.oppnaLucka(2); ut.noll = await Jul.oppnaLucka(0); ut.text = await Jul.oppnaLucka('1'); ut.igen = await Jul.oppnaLucka(1); ut.nu = Jul.luckor(); return JSON.stringify(ut); })()`);
    R.ok('luckor: dagens går att öppna, morgondagens och ogiltiga inte', luckor.ett.ok && !luckor.tva.ok && !luckor.noll.ok && !luckor.text.ok && luckor.igen.ok && JSON.stringify(luckor.nu) === '[1]' && JSON.stringify(tillstand(profil).luckor) === '{"2026":[1]}', luckor);
    // Räknaren: kroken i main.js (adblock:hit → jul.raknaTraff) via blockerarens egen kanal, och direkt
    await M(`for (let i = 0; i < 3; i++) el.ipcMain.emit('adraze:rakna', {}, 'kakor'); for (let i = 0; i < 5; i++) jul.raknaTraff('ad'); jul.raknaTraff('tracker'); jul.raknaTraff('tracker'); jul.raknaTraff('popups'); jul.raknaTraff('danger'); jul.raknaTraff('constructor'); jul.raknaTraff(undefined); return 1;`);
    const stat = await J(s, `Jul.stat().then((x) => JSON.stringify(x))`);
    const idagRiktig = new Date(); const riktig = idagRiktig.getFullYear() + '-' + String(idagRiktig.getMonth() + 1).padStart(2, '0') + '-' + String(idagRiktig.getDate()).padStart(2, '0');
    R.ok('räknaren per dag: annonser, spårare, kakrutor och popup-fönster räknas, okända typer inte', JSON.stringify(stat.idag) === '{"a":5,"s":2,"k":3,"p":1}' && JSON.stringify(stat.december) === '{"a":5,"s":2,"k":3,"p":1}' && stat.ar === 2026 && stat.basta && stat.basta.dag === '2026-12-01' && stat.basta.n === 7 && JSON.stringify(stat.perDag) === '[{"dag":"2026-12-01","a":5,"s":2}]', stat);
    R.ok('räknaren vet vilken (riktig) dag den började', stat.forsta === riktig, [stat.forsta, riktig]);
    await H.sov(5600);
    R.ok('räknarna skrivs till disk inom fem sekunder', JSON.stringify((tillstand(profil).dagar || {})['2026-12-01']) === '{"a":5,"s":2,"k":3,"p":1}', tillstand(profil).dagar);
    const bildSvar = await J(s, `(async () => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 20, 20);
      return JSON.stringify({ kopiera: await Jul.kopieraBild(c.toDataURL('image/png')), fel: await Jul.kopieraBild('data:image/png;base64,AAAA'), jpeg: await Jul.kopieraBild(c.toDataURL('image/jpeg')) }); })()`);
    // Läs tillbaka ur urklipp (Electron 45: read() ger ClipboardItem med en Blob per typ)
    const urklipp = await M(`const l = await el.clipboard.read(); const it = l.find((x) => x.types.includes('image/png')); if (!it) return 'ingen bild: ' + JSON.stringify(l.map((x) => x.types));
      const b = Buffer.from(await (await it.getType('image/png')).arrayBuffer()); return JSON.stringify(el.nativeImage.createFromBuffer(b).getSize());`);
    R.ok('delningsbilden kopieras som bild; annat än PNG nekas', bildSvar.kopiera.ok === true && bildSvar.fel.ok === false && bildSvar.jpeg.ok === false && urklipp === '{"width":40,"height":30}', { bildSvar, urklipp });
    // IPC-vakten: julens kanaler når bara våra egna sidor, inte en webbsida
    const FEJK = `({ senderFrame: { url: 'https://evil.example/', origin: 'https://evil.example' }, sender: {}, returnValue: undefined })`;
    const nekad = await M(`const h = (k) => el.ipcMain._invokeHandlers.get(k); const ut = {};
      for (const [k, arg] of [['jul:svara', 'nej'], ['jul:lucka', 1], ['jul:stat', undefined], ['jul:bild', { atgard: 'kopiera', data: '' }]]) ut[k] = h(k) ? await h(k)(${FEJK}, arg) : 'saknas';
      const e = ${FEJK}; el.ipcMain.emit('jul:lage', e); ut['jul:lage'] = e.returnValue === undefined ? 'inget svar' : e.returnValue; return JSON.stringify(ut);`);
    R.ok('julens IPC-kanaler nekas från en webbsida', nekad === '{"jul:svara":null,"jul:lucka":null,"jul:stat":null,"jul:bild":null,"jul:lage":null}', nekad);
    R.ok('inga JS-fel den 1 december', !fel(s).length, fel(s));
    await M(`jul.raknaTraff('ad'); return 1;`);
    const snallt = await stangApp();
    R.ok('räknaren sparas när AdRaze avslutas', !snallt || (tillstand(profil).dagar['2026-12-01'] || {}).a === 6, { snallt, dag: tillstand(profil).dagar['2026-12-01'] });

    /* ── 6. Lucia: ingen ny fråga, allt kvar; brytarna var för sig ── */
    ({ s, M } = await starta('2026-12-13'));
    R.ok('13 december: ingen ny fråga', (await fragan(s, 9000)) === false);
    const lucia = await J(s, LAGE);
    R.ok('13 december: allt är kvar efter omstart', har(lucia.delar, 'sno', 'luva') && lucia.palett === 'jul' && lucia.pa === true && lucia.sno && lucia.gorilla, lucia);
    const statLucia = await J(s, `Jul.stat().then((x) => JSON.stringify(x))`);
    R.ok('statistiken minns 1 december', statLucia.december.a === (snallt ? 6 : 5) && JSON.stringify(statLucia.idag) === '{"a":0,"s":0,"k":0,"p":0}' && statLucia.perDag.length === 1, statLucia);
    const bryt = await J(s, `(async () => {
      const ut = {}, v = (ms = 500) => new Promise((r) => setTimeout(r, ms));
      await Anpassa.set('jul.sno', false, 'Snö på nya fliken'); await v(); ut.utanSno = [__J.delar(), !!document.getElementById('jul-sno'), Object.keys(__J.sno()).length];
      await Anpassa.set('jul.sno', undefined, 'Snö på nya fliken'); await v(); ut.medSno = [__J.delar(), !!document.getElementById('jul-sno')];
      await Anpassa.set('jul.luva', false, 'Gorillan i tomteluva'); await v(); ut.utanLuva = [__J.delar(), !!document.getElementById('jul-gorilla'), getComputedStyle(document.querySelector('#adblock .ab-mark')).content, __J.ruta('#adblock .ab-mark')];
      await Anpassa.set('jul.luva', undefined, 'Gorillan i tomteluva'); await v(); ut.medLuva = [__J.delar(), !!document.getElementById('jul-gorilla')];
      await Anpassa.set('jul.farger', false, 'Julfärger'); await v(700); ut.utanFarger = [__J.delar(), document.documentElement.getAttribute('data-anp-palett'), __J.tema()];
      await Anpassa.set('jul.farger', undefined, 'Julfärger'); await v(700); ut.medFarger = [document.documentElement.getAttribute('data-anp-palett'), __J.tema()];
      await Anpassa.set('jul.pa', undefined, 'Jultema'); await v(700); ut.av = [__J.delar(), document.documentElement.getAttribute('data-anp-palett'), __J.tema(), !!document.getElementById('jul-sno'), !!document.getElementById('jul-gorilla')];
      openSettings(); showSettingsCat('anpassa'); await v(500); ut.avRader = [...document.querySelectorAll('#anp-jul .set-row .set-title')].map((e) => e.textContent); closeSettings();
      ut.fraga = !!document.getElementById('jul-fraga');
      await Anpassa.set('jul.pa', true, 'Jultema'); await v(700); ut.pa = [__J.delar(), document.documentElement.getAttribute('data-anp-palett'), __J.tema()];
      return JSON.stringify(ut);
    })()`);
    const JULTEMA = '[["tema.accent","#d9a441"],["tema.lage","morkt"],["tema.palett","jul"]]';
    R.ok('Snö på nya fliken av: lagret tas bort helt; på igen', !har(bryt.utanSno[0], 'sno') && har(bryt.utanSno[0], 'luva') && bryt.utanSno[1] === false && bryt.utanSno[2] === 0 && har(bryt.medSno[0], 'sno', 'luva') && bryt.medSno[1] === true, bryt);
    R.ok('Gorillan i tomteluva av: vanliga loggan tillbaka i rätt storlek; på igen', har(bryt.utanLuva[0], 'sno') && !har(bryt.utanLuva[0], 'luva') && bryt.utanLuva[1] === false && !/mark-luva/.test(bryt.utanLuva[2]) && bryt.utanLuva[3][2] === 17 && har(bryt.medLuva[0], 'sno', 'luva') && bryt.medLuva[1] === true, bryt.utanLuva);
    R.ok('Julfärger av: temat man hade innan kommer tillbaka direkt, pyntet är kvar; på igen', har(bryt.utanFarger[0], 'sno', 'luva') && bryt.utanFarger[1] === null && bryt.utanFarger[2] === TEMA_INNAN && bryt.medFarger[0] === 'jul' && bryt.medFarger[1] === JULTEMA, [bryt.utanFarger, bryt.medFarger]);
    R.ok('Jultema av: allt bort och temat tillbaka, bara huvudbrytaren kvar i inställningarna, ingen ny fråga', bryt.av[0] === null && bryt.av[1] === null && bryt.av[2] === TEMA_INNAN && !bryt.av[3] && !bryt.av[4] && bryt.avRader.join() === 'Jultema' && !bryt.fraga, bryt);
    R.ok('Jultema på igen från inställningarna', har(bryt.pa[0], 'sno', 'luva') && bryt.pa[1] === 'jul' && bryt.pa[2] === JULTEMA, bryt.pa);
    // Det man själv ändrar under julen ska vara kvar efteråt: en egen accentfärg
    await s.kor(`Anpassa.set('tema.accent', '#0b8a8f', 'Accentfärg').then(() => 1)`);
    await H.sov(500);
    R.ok('inga JS-fel den 13 december', !fel(s).length, fel(s));
    await stangApp();

    /* ── 7. Trettondagen: fortfarande på. Vid midnatt går allt tillbaka, medan AdRaze är igång ── */
    ({ s, M } = await starta('2027-01-06T23:59:30'));
    const tretton = await J(s, `(async () => { const l = ${LAGE}; const lucka = await Jul.oppnaLucka(24); return JSON.stringify({ l, lucka, nu: Jul.nu().getDate() }); })()`);
    const trLage = JSON.parse(tretton.l);
    R.ok('6 januari: jultemat är fortfarande på, och alla luckor går att öppna', tretton.nu === 6 && trLage.sasong === 2026 && har(trLage.delar, 'sno', 'luva') && trLage.palett === 'jul' && tretton.lucka.ok && tretton.lucka.luckor.join() === '1,24', tretton);
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    // Medan vi väntar på midnatt "använder" vi fönstret (riktiga tangenttryck): då hade toasten "Ändrat · Ångra"
    // visats för temabytet om huvudprocessen inte tystat den
    let slut = false;
    for (let i = 0; i < 150 && !slut; i++) {
      await tangent(s, 8, 'Shift', 'ShiftLeft', 16);
      slut = (await s.kor(`Jul.sasong() === null && __J.delar() === null && !document.documentElement.hasAttribute('data-anp-palett')`)) === true;
      if (!slut) await H.sov(400);
    }
    await H.sov(900);
    const efter = await J(s, `(async () => JSON.stringify({ lage: ${LAGE}, tema: __J.tema(), nu: Jul.nu().getDate(), andratToast: !!document.querySelector('#anp-toast.pa'), flikrad: __J.farg('#tabstrip') }))()`);
    const efLage = JSON.parse(efter.lage);
    R.ok('midnatt efter trettondagen: pyntet försvinner av sig självt, utan omstart', slut === true && efter.nu === 7 && efLage.sasong === null && efLage.delar === null && !efLage.sno && !efLage.gorilla && !/mark-luva/.test(efLage.knapp) && efLage.inst === 0, efLage);
    R.ok('utseendet går tillbaka till det man hade innan (mörkt, runda hörn), den egna färgen från julen behålls', efter.tema === '[["tema.accent","#0b8a8f"],["tema.horn","rund"],["tema.lage","morkt"]]' && efLage.palett === null && efter.flikrad !== 'rgb(12, 33, 24)', efter);
    R.ok('Jultema är nollställt och ingen "Ändrat · Ångra" visades', efLage.pa === undefined && !efter.andratToast, efter);
    await bild(s, '05-efter-trettondagen');
    await s.kor(`closeSettings(); 1`);
    await H.sov(1200);
    const st7 = tillstand(profil);
    R.ok('på disk: inget "innan" kvar, ingen säsong', st7.fore === null && st7.sasong === null && st7.fragad === 2026, st7);
    R.ok('inga JS-fel vid säsongens slut', !fel(s).length, fel(s));
    await stangApp();
    const anp7 = (lasFil(profil, 'adraze-anpassa.json') || {}).varden || {};
    R.ok('på disk i Anpassa: temat som innan, inget jul.pa', anp7['tema.palett'] === undefined && anp7['jul.pa'] === undefined && anp7['tema.horn'] === 'rund' && anp7['tema.lage'] === 'morkt', anp7);

    /* ── 8. Efter julen (omstart): fortfarande av. Nästa jul: frågan igen, Nej tack ── */
    ({ s, M } = await starta('2027-01-20'));
    const jan = await J(s, LAGE);
    R.ok('20 januari: inget av jultemat finns kvar', jan.sasong === null && jan.delar === null && jan.palett === null && jan.inst === 0 && (await fragan(s, 7500)) === false, jan);
    await stangApp();
    ({ s, M } = await starta('2027-12-01'));
    const nasta = await fragan(s, 14000);
    R.ok('nästa jul: frågan kommer igen', nasta === true && (await J(s, LAGE)).delar === null);
    const nej = await J(s, `JSON.stringify(__J.ruta('#jul-fraga .notis-sek'))`);
    if (nasta === true) await klicka(s, nej[0] + nej[2] / 2, nej[1] + nej[3] / 2);
    await H.sov(900);
    const nejLage = await J(s, `JSON.stringify({ lage: ${LAGE}, tema: __J.tema(), toast: !document.getElementById('apptoast').classList.contains('hidden') })`);
    const nl = JSON.parse(nejLage.lage);
    R.ok('Nej tack: frågan försvinner och ingenting slås på', !nl.fraga && nl.delar === null && nl.palett === null && nl.pa === undefined && !nl.sno && !nl.gorilla && !nejLage.toast && tillstand(profil).fragad === 2027 && tillstand(profil).fore === null, nl);
    await s.kor(`openSettings(); showSettingsCat('anpassa'); 1`);
    await H.sov(500);
    const nejInst = await J(s, `JSON.stringify([...document.querySelectorAll('#anp-jul .set-row')].map((r) => [r.querySelector('.set-title').textContent, r.querySelector('input').checked]))`);
    R.ok('efter Nej tack går Jultema att slå på i inställningarna', JSON.stringify(nejInst) === '[["Jultema",false]]', nejInst);
    await s.kor(`closeSettings(); 1`);
    await stangApp();
    ({ s, M } = await starta('2027-12-02'));
    R.ok('dagen efter Nej tack: ingen ny fråga', (await fragan(s, 9000)) === false && (await J(s, LAGE)).delar === null);
    R.ok('inga JS-fel nästa jul', !fel(s).length, fel(s));
    await stangApp();

    /* ── 9. En fråga utan svar: kommer tre olika dagar, sedan inte mer. Och säsongen börjar på slaget. ── */
    ({ s, M } = await starta('2026-11-30T23:59:50', profilB));
    const borjan = await s.kor(`__J.tills(() => Jul.sasong() === 2026, 30000)`);
    R.ok('midnatt 1 december: säsongen börjar medan AdRaze är igång, och frågan kommer', borjan === true && (await fragan(s, 14000)) === true && (await J(s, LAGE)).delar === null);
    await stangApp();
    for (const [dag, vantat] of [['2026-12-02', true], ['2026-12-03', true], ['2026-12-04', false], ['2026-12-20', false]]) {
      ({ s, M } = await starta(dag, profilB));
      const kom2 = await fragan(s, vantat ? 14000 : 9000);
      R.ok(dag + ': frågan ' + (vantat ? 'visas igen (inget svar än)' : 'visas inte mer (tre dagar utan svar räknas som nej)'), kom2 === vantat, tillstand(profilB).visad);
      if (!vantat) { const l = await J(s, LAGE); R.ok(dag + ': ingenting är påslaget', l.delar === null && l.pa === undefined && l.palett === null, l); }
      await stangApp();
    }

    const nekade = fs.readFileSync(logg, 'utf8').split('\n').filter((r) => r.includes('[ipc] nekad') && !r.includes('evil.example'));   // försöken ovan är avsiktliga
    R.ok('inga IPC-kanaler nekade', !nekade.length, nekade.slice(0, 3));
    const huvudFel = fs.readFileSync(logg, 'utf8').split('\n').filter((r) => /uncaughtException|unhandledRejection|\[jul\]/.test(r));
    R.ok('inga fel från huvudprocessen', !huvudFel.length, huvudFel.slice(0, 3));
  } catch (e) {
    R.ok('testet kördes klart', false, String((e && e.stack) || e));
  } finally {
    if (app) await stang(app);
    x.stoppa();
    for (const p of [profil, profilB]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--bilder');
  const bilder = i >= 0 ? path.resolve(a[i + 1]) : null;
  const mapp = a.find((v, j) => !v.startsWith('--') && a[j - 1] !== '--bilder');
  kor(path.resolve(mapp || path.join(__dirname, '..', '..')), bilder, a.includes('--logik') ? 'logik' : null).then((R) => { console.log(R.text()); if (bilder) console.log('Skärmdumpar: ' + bilder); process.exit(R.fel.length ? 1 : 0); });
}
