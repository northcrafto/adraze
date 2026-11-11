#!/usr/bin/env node
// Test av jultemat (jul.js, ui/jul.js, ui/jul-pynt.js, ui/jul.css) mot utvecklingsbygget, osynligt i Xvfb.
// Datumet låtsas med ADRAZE_DATUM och webbläsaren startas om mellan dagarna med samma profil.
// Går igenom: de rena funktionerna (datum, säsong, PNG-kontroll), november (inget syns, ingen fråga, temat Jul går
// ändå att välja i temalistan), 1 december (frågan kommer en gång, i alla fönster), Ja tack (julfärger, snö och luva
// utan att något flyttar sig och utan "Ändrat · Ångra"), snöns paus, inkognito, luckor, räknaren per dag,
// brytarna i inställningarna, midnatt efter trettondagen (allt tillbaka som innan, det man själv ändrat behålls),
// nästa jul (frågan igen, Nej tack), och att en fråga utan svar slutar komma efter tre dagar.
// Sist julkalendern, statistiken i julspråk och julaftons sammanfattning (ui/jul-kalender.js) med egna profiler:
// 1 december utan något stoppat, Lucia med siffror från den 3:e, midnatt, julafton (bilden sparas och kopieras),
// 2 januari, och januari utan siffror för december.
// Användning: node tools/test/jul.js [webbläsarmapp] [--bilder <mapp>] [--logik | --kalender]   (avslutar med 0 om allt gick igenom)
//   --logik kör bara de delar som inte startar AdRaze (rena funktioner och julfärgernas regler), på några sekunder.
//   --kalender kör bara julkalendern och statistiken (ungefär två minuter).
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

/* ── Julkalendern, statistiken i julspråk och julaftons sammanfattning (ui/jul-kalender.js) ──
 * Egen profil. Tillståndet (räknaren per dag, öppnade luckor, dagen räknaren började) skrivs i profilen före varje
 * start, så att varje dag har siffror att visa upp. Jultema är redan påslaget (ingen fråga), julfärgerna av. */
function forberedProfil(profil, st) {
  const mapp = path.join(profil, 'config', 'AdRaze');
  fs.mkdirSync(mapp, { recursive: true });
  fs.writeFileSync(path.join(mapp, 'adraze-jul.json'), JSON.stringify({ v: 1, borjan: '2026-11-11', sasong: 2026, fragad: 2026, visad: [], fore: null, luckor: {}, dagar: {}, ...st }));
  const anp = path.join(mapp, 'adraze-anpassa.json');
  if (!fs.existsSync(anp)) fs.writeFileSync(anp, JSON.stringify({ varden: { 'jul.pa': true, 'jul.farger': false }, historik: [] }));
}
const DAG = (i) => ({ a: 100 + i * 3, s: 20 + i, k: 1, p: 0 });
const dagarna = (fran, till) => { const d = {}; for (let i = fran; i <= till; i++) d['2026-12-' + String(i).padStart(2, '0')] = DAG(i); return d; };
const summan = (fran, till) => { let n = 0; for (let i = fran; i <= till; i++) n += DAG(i).a + DAG(i).s; return n; };
const serie = (fran, till) => Array.from({ length: till - fran + 1 }, (_, i) => fran + i);
// Tal som sidan skriver dem ("3 864"), med vanligt mellanslag i stället för det hårda
const sv = (n) => n.toLocaleString('sv-SE').replace(/\s/g, ' ');
const slat = (v) => JSON.parse(JSON.stringify(v).replace(/[  ]/g, ' '));
// Det som syns av kalendern och remsan just nu
const KAL = `JSON.stringify((() => {
  const e = document.getElementById('jul-lucka'), sok = document.querySelector('.anp-st-sok'), remsa = document.querySelector('.nt-stats'), p = document.getElementById('jul-kalender'), mer = document.getElementById('jul-st-mer');
  const syns = (x) => !!x && x.offsetParent !== null;
  let lucka = null;
  if (e) { const b = e.getBoundingClientRect(), sb = sok.getBoundingClientRect(), pl = document.getElementById('jul-lucka-plats');
    lucka = { nr: e.dataset.n, klass: e.className, etikett: e.getAttribute('aria-label'), vansterOm: b.right <= sb.left - 6 && b.right >= sb.left - 44, iHojd: Math.abs((b.top + b.bottom) / 2 - (sb.top + sb.bottom) / 2) < 4, bredd: Math.round(e.offsetWidth), platsHojd: pl ? pl.getBoundingClientRect().height : -1 }; }
  return { delar: __J.delar(), lucka, panel: !!p && !p.hidden, remsa: remsa.className, tal: [...remsa.querySelectorAll('.nt-st-n > *')].filter(syns).map((x) => x.textContent), etikett: [...remsa.querySelectorAll('.nt-st-main .nt-st-l')].filter(syns).map((x) => x.textContent),
    mer: syns(mer) ? mer.textContent : null, julElement: remsa.querySelectorAll('.jul-st').length, totalen: document.getElementById('stat-blocked').textContent };
})())`;
// Den öppna panelen: rubrik, luckorna och den valda luckans innehåll
const PANEL = `JSON.stringify((() => {
  const p = document.getElementById('jul-kalender'); if (!p || p.hidden) return { oppen: false };
  const b = p.querySelector('.jul-kal-blad'), d = [...p.querySelectorAll('.jul-kal-luckor .jul-dorr')], t = (q) => { const x = b.querySelector(q); return x ? x.textContent : null; };
  return { oppen: true, rubrik: p.querySelector('h2').textContent, summering: p.classList.contains('jul-bara-summering'), bak: !p.querySelector('.jul-kal-bak').hidden, antal: d.length,
    oppnade: d.filter((x) => x.classList.contains('oppnad')).map((x) => +x.dataset.n), kommande: d.filter((x) => x.classList.contains('kommande')).length, vald: d.filter((x) => x.classList.contains('vald')).map((x) => +x.dataset.n), ny: d.filter((x) => x.classList.contains('ny')).map((x) => +x.dataset.n),
    datum: t('.jul-kal-datum'), titel: t('h3'), text: [...b.querySelectorAll(':scope > .jul-kal-text')].map((x) => x.textContent).join(' | '), kbd: [...b.querySelectorAll('kbd')].map((x) => x.textContent), knapp: t(':scope > .jul-knapp'),
    tal: t('.jul-kal-tal'), stat: [...b.querySelectorAll('.jul-kal-stat > *, .jul-sum > .jul-kal-text, .jul-sum > .jul-kal-liten')].map((x) => x.textContent), fakta: [...b.querySelectorAll('.jul-sum-fakta dt')].map((x) => [x.textContent, x.nextElementSibling.textContent]),
    bild: !!b.querySelector('canvas.jul-sum-bild'), knappar: [...b.querySelectorAll('.jul-sum-knappar button')].map((x) => x.textContent), fot: [...p.querySelectorAll('.jul-kal-fot span')].map((x) => x.textContent), rullar: b.scrollHeight > b.clientHeight + 1 };
})())`;
const mitt = (s, q) => J(s, `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(q)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })())`);
async function klickaPa(s, q) { const m = await mitt(s, q); if (!m) return false; await klicka(s, m[0], m[1]); return true; }
const lucka = (n) => `document.querySelector('#jul-kalender .jul-dorr[data-n="${n}"]')`;
const oppnaKalender = async (s) => { await klickaPa(s, '#jul-lucka'); return s.kor(`__J.tills(() => { const p = document.getElementById('jul-kalender'); return !!p && !p.hidden; }, 4000)`); };

async function kalender(R, T) {
  const { profil, starta, stangApp, bild } = T;
  let s, M;
  const kal = async () => slat(await J(s, KAL)), panel = async () => slat(await J(s, PANEL));
  const valj = async (n, ms = 450) => { await s.kor(`${lucka(n)}.click(); 1`); await H.sov(ms); return panel(); };
  const traffar = (ad, sparare) => M(`for (let i = 0; i < ${ad}; i++) el.ipcMain.emit('adraze:rakna', {}, 'ad'); for (let i = 0; i < ${sparare}; i++) el.ipcMain.emit('adraze:rakna', {}, 'tracker'); el.ipcMain.emit('adraze:rakna', {}, 'kakor'); return 1;`);

  /* ── K1. 1 december, inget stoppat än: luckan, panelen, tangenterna, remsan ── */
  forberedProfil(profil, {});
  ({ s, M } = await starta('2026-12-01', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka') && /luva/.test(__J.delar() || ''), 5000)`);
  const k1 = await kal();
  R.ok('kalender: delarna kalender och stat är på, och ingen fråga ställs (Jultema var redan på)', har(k1.delar, 'kalender', 'stat') && (await fragan(s, 300)) === false, k1.delar);
  R.ok('kalender: luckan med dagens datum sitter till vänster om sökrutan, i en plats utan höjd, och väntar', !!k1.lucka && k1.lucka.nr === '1' && /\bny\b/.test(k1.lucka.klass) && !/oppnad/.test(k1.lucka.klass) && k1.lucka.vansterOm && k1.lucka.iHojd && k1.lucka.platsHojd === 0 && k1.lucka.etikett === 'Julkalender, lucka 1 väntar', k1.lucka);
  R.ok('statistik: innan något stoppats i december visar remsan totalen som vanligt', !/jul-stat-pa/.test(k1.remsa) && k1.etikett.join() === 'annonser och spårare stoppade' && k1.mer === null && k1.julElement > 0, k1);
  const hist1 = await s.kor(`Anpassa.historik().then((h) => h.length)`);
  R.ok('kalender: ett klick på luckan öppnar panelen', (await oppnaKalender(s)) === true);
  await s.kor(`__J.tills(() => Jul.luckor().includes(1) && !!document.querySelector('.jul-kal-blad h3'), 3000)`);
  await H.sov(800);   // dörren går upp
  const p1 = await panel();
  const blad1 = await J(s, `(async () => JSON.stringify({ oppen: ${lucka(1)}.querySelector('.jul-dorr-blad path').getBBox().width, stangd: ${lucka(2)}.querySelector('.jul-dorr-blad path').getBBox().width, aria: [${lucka(1)}, ${lucka(2)}].map((d) => [d.getAttribute('aria-label'), d.getAttribute('aria-disabled'), d.tabIndex]),
    hist: (await Anpassa.historik()).length, andrat: !!document.querySelector('#anp-toast.pa'), fokus: document.activeElement && document.activeElement.dataset.n }))()`);
  R.ok('kalender: 24 luckor, dagens öppnas och visar sitt tips, de kommande är stängda', p1.rubrik === 'Julkalender' && p1.antal === 24 && p1.oppnade.join() === '1' && p1.vald.join() === '1' && p1.kommande === 23 && p1.datum === '1 december' && p1.titel === 'Kommandopaletten' && /^Tryck Ctrl\+K och skriv/.test(p1.text) && p1.kbd.join() === 'Ctrl+K' && p1.knapp === 'Öppna paletten' && !p1.rullar, p1);
  R.ok('kalender: raden längst ned säger hur många som är öppnade och när nästa öppnas', p1.fot.join('|') === '1 av 24 öppnade|Lucka 2 öppnas i morgon', p1.fot);
  R.ok('kalender: den öppnade luckans dörr står öppen, den stängda är hel, och skärmläsaren får veta läget', blad1.oppen < 20 && blad1.stangd > 36 && JSON.stringify(blad1.aria) === '[["Lucka 1, öppnad",null,0],["Lucka 2, öppnas den 2 december","true",-1]]' && blad1.fokus === '1', blad1);
  R.ok('kalender: öppnade luckor sparas i jultillståndet, inte i Anpassa (ingen "Ändrat · Ångra", inget i ångra-historiken)', JSON.stringify(tillstand(profil).luckor) === '{"2026":[1]}' && blad1.hist === hist1 && !blad1.andrat, { fil: tillstand(profil).luckor, hist: [hist1, blad1.hist] });
  const p2 = await valj(2);
  R.ok('kalender: en kommande lucka går inte att öppna, den säger när den öppnas', p2.text === 'Lucka 2 öppnas den 2 december.' && p2.oppnade.join() === '1' && JSON.stringify(tillstand(profil).luckor) === '{"2026":[1]}' && (await J(s, `Jul.oppnaLucka(2).then((r) => JSON.stringify(r))`)).ok === false, p2);
  await bild(s, '10-kalender-1-december');
  // Tangenterna: pilar mellan luckorna, Escape stänger och fokus går tillbaka till luckan på nya fliken
  await s.kor(`${lucka(1)}.focus(); 1`);
  await tangent(s, 0, 'ArrowRight', 'ArrowRight', 39); const f1 = await s.kor(`document.activeElement.dataset.n`);
  await tangent(s, 0, 'ArrowDown', 'ArrowDown', 40); const f2 = await s.kor(`document.activeElement.dataset.n + '/' + document.querySelectorAll('#jul-kalender .jul-dorr[tabindex="0"]').length`);
  await tangent(s, 0, 'Home', 'Home', 36); const f3 = await s.kor(`document.activeElement.dataset.n`);
  await tangent(s, 0, 'Escape', 'Escape', 27); await H.sov(250);
  const esc = await J(s, `JSON.stringify({ panel: !document.getElementById('jul-kalender').hidden, fokus: document.activeElement && document.activeElement.id })`);
  R.ok('kalender: piltangenter flyttar mellan luckorna (en lucka i taget i tabbordningen), Escape stänger och lämnar tillbaka fokus', f1 === '2' && f2 === '8/1' && f3 === '1' && !esc.panel && esc.fokus === 'jul-lucka', { f1, f2, f3, esc });
  // Knappen i tipset leder till funktionen
  await oppnaKalender(s);
  await s.kor(`__J.tills(() => !!document.querySelector('.jul-kal-blad > .jul-knapp'), 3000)`);
  const oppnad1 = await kal();
  await klickaPa(s, '.jul-kal-blad > .jul-knapp'); await H.sov(500);
  const pal = await J(s, `JSON.stringify({ fokus: document.activeElement && document.activeElement.id, panel: !document.getElementById('jul-kalender').hidden })`);
  R.ok('kalender: luckan på nya fliken visar att dagens lucka är öppnad, och tipsets knapp öppnar kommandopaletten', /oppnad/.test(oppnad1.lucka.klass) && !/\bny\b/.test(oppnad1.lucka.klass) && oppnad1.lucka.etikett === 'Julkalender, lucka 1 är öppnad' && pal.fokus === 'anp-pal-in' && !pal.panel, { lucka: oppnad1.lucka, pal });
  await tangent(s, 0, 'Escape', 'Escape', 27); await H.sov(400);
  // Stoppad reklam: räknaren per dag i huvudprocessen, och remsan byter till decembers siffror av sig själv
  await traffar(4, 2);
  const levande = await s.kor(`__J.tills(() => { const r = document.querySelector('.nt-stats'), n = r.querySelector('span.jul-st'); return r.classList.contains('jul-stat-pa') && !!n && n.textContent === '6'; }, 6000)`);
  const k1b = await kal();
  R.ok('statistik: det som stoppas räknas per dag, och remsan visar decembers siffror i julspråk (kakrutor räknas inte in)', levande === true && k1b.tal.join('|') === '6|180|kB|0|sekunder' && k1b.etikett.join() === 'annonser och spårare har du sluppit i december' && k1b.mer === null && k1b.totalen === '6', k1b);
  await H.sov(5600);
  R.ok('statistik: dagens räknare ligger på disk', JSON.stringify((tillstand(profil).dagar || {})['2026-12-01']) === '{"a":4,"s":2,"k":1,"p":0}', tillstand(profil).dagar);
  // Inkognitofönster: ingen kalender och ingen julstatistik
  await tangent(s, 10, 'N', 'KeyN', 78);
  const ti = await H.mal(T.cdp(), (m) => m.type === 'page' && m.url.includes('/ui/shell.html') && m.url.includes('incognito'), 15000);
  if (ti) {
    const si = await anslutSkal(ti);
    const ink = await J(si, `JSON.stringify({ lucka: !!document.getElementById('jul-lucka'), plats: !!document.getElementById('jul-lucka-plats'), panel: !!document.getElementById('jul-kalender'), jul: document.querySelectorAll('.nt-stats .jul-st').length, delar: __J.delar() })`);
    R.ok('kalender: ingenting i ett inkognitofönster', !ink.lucka && !ink.plats && !ink.panel && ink.jul === 0 && ink.delar === null, ink);
    await si.kor(`window.close(); 1`).catch(() => {});
    si.stang();
    await H.sov(600);
  } else R.ok('kalender: Ctrl+Skift+N öppnade ett inkognitofönster', false);
  R.ok('kalender: inga JS-fel den 1 december', !fel(s).length, fel(s));
  await stangApp();

  /* ── K2. Lucia, räknaren började den 3:e: siffrorna gäller från den dagen ── */
  const fran3 = summan(3, 12);
  forberedProfil(profil, { borjan: '2026-12-03', luckor: { 2026: [1, 3] }, dagar: dagarna(3, 12) });
  ({ s, M } = await starta('2026-12-13', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka') && document.querySelector('.nt-stats').classList.contains('jul-stat-pa'), 5000)`);
  const k2 = await kal();
  R.ok('statistik: började räknaren efter 1 december står det från vilken dag siffran gäller', k2.lucka.nr === '13' && /\bny\b/.test(k2.lucka.klass) && k2.tal[0] === sv(fran3) && k2.etikett.join() === 'annonser och spårare har du sluppit sedan den 3 december', { tal: k2.tal, etikett: k2.etikett, vantat: sv(fran3) });
  await oppnaKalender(s);
  await s.kor(`__J.tills(() => !!document.querySelector('.jul-kal-blad .jul-kal-tal'), 4000)`);
  const lucia = await panel();
  R.ok('kalender: Lucia visar först hur mycket som stoppats (summan och bästa dagen), sedan tipset', lucia.datum === 'Lucia, 13 december' && lucia.tal === sv(fran3) && JSON.stringify(lucia.stat.slice(1)) === JSON.stringify(['annonser och spårare har AdRaze stoppat åt dig sedan den 3 december.', 'Flest på en dag: 168 (12 december).', 'Dagens tips']) &&
    lucia.titel === 'Widgetar på startsidan' && lucia.knapp === 'Anpassa startsidan' && lucia.oppnade.join() === '1,3,13' && lucia.kommande === 11 && lucia.fot.join('|') === '3 av 24 öppnade|10 luckor väntar' && !lucia.rullar, lucia);
  await H.sov(700);   // panelen har glidit in och dörren gått upp
  await bild(s, '11-kalender-lucia');
  // Stoppas något medan luckan är öppen följer både luckan och remsan med
  await traffar(1, 0);
  const foljer = await s.kor(`__J.tills(() => document.querySelector('.jul-kal-blad .jul-kal-tal').textContent.replace(/\\s/g, ' ') === ${JSON.stringify(sv(fran3 + 1))} && document.querySelector('.nt-stats span.jul-st').textContent.replace(/\\s/g, ' ') === ${JSON.stringify(sv(fran3 + 1))}, 6000)`);
  R.ok('statistik: siffran följer med medan luckan är öppen (högst två gånger i sekunden)', foljer === true, await panel());
  // En tidigare lucka öppnas i efterhand. I barnläge byts tips som inte gäller barn mot ett reservtips.
  const fem = await valj(5, 900);
  await s.kor(`window.__konto = account; account = { isChild: true, name: 'Barn' }; 1`);
  await valj(3); const femBarn = await valj(5);
  await s.kor(`account = window.__konto; 1`);
  R.ok('kalender: tidigare luckor går att öppna i efterhand', fem.oppnade.join() === '1,3,5,13' && fem.vald.join() === '5' && fem.titel === 'Snabbord' && fem.knapp === 'Prova i adressfältet' && JSON.stringify(tillstand(profil).luckor) === '{"2026":[1,3,5,13]}', fem);
  R.ok('kalender: i barnläge visas ett reservtips i stället för snabborden', femBarn.titel === 'Sök på sidan' && /Tryck Ctrl\+F och skriv det\.$/.test(femBarn.text) && femBarn.knapp === null, femBarn);
  await valj(3); await valj(5);
  await klickaPa(s, '.jul-kal-blad > .jul-knapp'); await H.sov(400);
  const adr = await J(s, `JSON.stringify({ varde: document.getElementById('address').value, fokus: document.activeElement === document.getElementById('address'), panel: !document.getElementById('jul-kalender').hidden })`);
  R.ok('kalender: "Prova i adressfältet" skriver snabbordet i adressfältet och stänger panelen', adr.varde === 'yt ' && adr.fokus && !adr.panel, adr);
  await s.kor(`(() => { const a = document.getElementById('address'); a.value = ''; a.dispatchEvent(new Event('input', { bubbles: true })); a.blur(); return 1; })()`);
  // Minska rörelse: dörrarna glider inte, luckan på nya fliken knackar inte
  const stilla = await J(s, `(async () => { const tid = () => [getComputedStyle(${lucka(4)}.querySelector('.jul-dorr-blad path')).transitionDuration, getComputedStyle(document.getElementById('jul-lucka')).animationName];
    const ut = { vanligt: tid() }; document.body.classList.add('reduce-motion'); await new Promise((r) => setTimeout(r, 100)); ut.stilla = tid(); document.body.classList.remove('reduce-motion'); return JSON.stringify(ut); })()`);
  R.ok('Minska rörelse: dörrarna öppnas utan glidning', /0\.55s/.test(stilla.vanligt[0]) && /^0s/.test(stilla.stilla[0]) && stilla.stilla[1] === 'none', stilla);
  // Brytarna var för sig
  const bryt = await J(s, `(async () => {
    const v = (ms = 600) => new Promise((r) => setTimeout(r, ms)), ut = {}, L = () => !!document.getElementById('jul-lucka'), remsa = () => document.querySelector('.nt-stats');
    document.getElementById('jul-lucka').click(); await v(900);
    await Anpassa.set('jul.kalender', false, 'Julkalender'); await v(); ut.utanKalender = [__J.delar(), L(), !!document.getElementById('jul-lucka-plats'), !!document.getElementById('jul-kalender'), remsa().classList.contains('jul-stat-pa')];
    await Anpassa.set('jul.kalender', undefined, 'Julkalender'); await v(); ut.medKalender = [__J.delar(), L(), document.getElementById('jul-lucka').dataset.n];
    await Anpassa.set('jul.stat', false, 'Statistik i julspråk'); await v(); ut.utanStat = [__J.delar(), remsa().className, remsa().querySelectorAll('.jul-st').length, document.getElementById('stat-blocked').offsetParent !== null, L()];
    await Anpassa.set('jul.stat', undefined, 'Statistik i julspråk'); await v(900); ut.medStat = [__J.delar(), remsa().classList.contains('jul-stat-pa'), remsa().querySelectorAll('.jul-st').length > 0];
    return JSON.stringify(ut);
  })()`);
  R.ok('Julkalender av: luckan och panelen tas bort helt, statistiken är kvar; på igen', !har(bryt.utanKalender[0], 'kalender') && har(bryt.utanKalender[0], 'stat') && JSON.stringify(bryt.utanKalender.slice(1)) === '[false,false,false,true]' && har(bryt.medKalender[0], 'kalender') && bryt.medKalender[1] === true && bryt.medKalender[2] === '13', bryt);
  R.ok('Statistik i julspråk av: remsan visar totalen igen och julens element är borta, kalendern är kvar; på igen', !har(bryt.utanStat[0], 'stat') && har(bryt.utanStat[0], 'kalender') && !/jul-/.test(bryt.utanStat[1]) && bryt.utanStat[2] === 0 && bryt.utanStat[3] === true && bryt.utanStat[4] === true && har(bryt.medStat[0], 'stat') && bryt.medStat[1] === true && bryt.medStat[2] === true, bryt);
  R.ok('kalender: inga JS-fel på Lucia', !fel(s).length, fel(s));
  await stangApp();

  /* ── K3. Midnatt: nästa lucka kommer av sig själv ── */
  ({ s, M } = await starta('2026-12-13T23:59:45', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka'), 5000)`);
  const foreMidnatt = await kal();
  const midnatt = await s.kor(`__J.tills(() => Jul.nu().getDate() === 14 && document.getElementById('jul-lucka').dataset.n === '14', 40000)`);
  const efterMidnatt = await kal();
  R.ok('kalender: vid midnatt byter luckan på nya fliken till nästa dag, som väntar på att öppnas', foreMidnatt.lucka.nr === '13' && /oppnad/.test(foreMidnatt.lucka.klass) && midnatt === true && efterMidnatt.lucka.nr === '14' && /\bny\b/.test(efterMidnatt.lucka.klass) && !/oppnad/.test(efterMidnatt.lucka.klass), { fore: foreMidnatt.lucka, efter: efterMidnatt.lucka });
  R.ok('kalender: inga JS-fel vid midnatt', !fel(s).length, fel(s));
  await stangApp();

  /* ── K4. Julafton: sammanfattningen och bilden som går att dela ── */
  const jul23 = summan(1, 23);
  forberedProfil(profil, { luckor: { 2026: serie(1, 23) }, dagar: dagarna(1, 23) });
  ({ s, M } = await starta('2026-12-24', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka') && document.querySelector('.nt-stats').classList.contains('jul-stat-mer'), 5000)`);
  const k4 = await kal();
  R.ok('julafton: remsan får rutan "Din december"', k4.lucka.nr === '24' && k4.tal[0] === sv(jul23) && /^Din december/.test(k4.mer || ''), k4);
  await oppnaKalender(s);
  const klar = await s.kor(`__J.tills(() => !!document.querySelector('#jul-kalender.jul-bara-summering canvas.jul-sum-bild') && document.querySelectorAll('.jul-sum-knappar button').length === 2, 8000)`);
  const sum = await panel();
  const mb = Math.round(jul23 * 30 / 1024), min = Math.round(jul23 * 0.05 / 60);
  R.ok('julafton: lucka 24 öppnas och sammanfattningen får hela panelen', klar === true && sum.rubrik === 'Din december' && sum.summering && sum.bak && sum.tal === sv(jul23) && sum.stat[0] === 'annonser och spårare stoppade AdRaze åt dig 1–24 december.' && JSON.stringify(tillstand(profil).luckor) === JSON.stringify({ 2026: serie(1, 24) }), sum);
  R.ok('julafton: bästa dagen, ungefär sparad data och tid, och öppnade luckor', JSON.stringify(sum.fakta) === JSON.stringify([['Flest på en dag', '212 (23 december)'], ['Mindre data', 'ungefär ' + mb + ' MB'], ['Sparad tid', 'ungefär ' + min + ' minuter'], ['Öppnade luckor', '24 av 24']]) && sum.knappar.join() === 'Spara som bild,Kopiera bilden' && !sum.rullar, sum.fakta);
  // Bilden: 1200 × 630, papper i hörnet, bläckram, det orangea strecket under talet, gorillans röda luva och mörk text
  const duk = await J(s, `JSON.stringify((() => {
    const c = document.querySelector('canvas.jul-sum-bild'), g = c.getContext('2d');
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data];
    const andel = (x, y, b, h, f) => { const d = g.getImageData(x, y, b, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++; return n / (b * h); };
    const mork = (r, gg, bb) => r + gg + bb < 150;
    return { storlek: [c.width, c.height], horn: px(8, 8), ram: andel(590, 18, 20, 26, mork), streck: andel(100, 332, 120, 26, (r, gg, bb) => r > 235 && gg > 50 && gg < 110 && bb < 70), tal: andel(90, 170, 420, 140, mork), luva: andel(860, 70, 200, 110, (r, gg, bb) => r > 160 && gg < 70 && bb < 80), fakta: andel(86, 470, 1000, 70, mork), kant: px(1195, 625) };
  })())`);
  R.ok('julafton: bilden är 1200 × 630 med papper, bläckram, orange streck under talet, gorillan i luva och personens siffror', duk.storlek.join('x') === '1200x630' && duk.horn.join() === '244,239,230,255' && duk.kant.join() === '244,239,230,255' && duk.ram > 0.1 && duk.streck > 0.2 && duk.tal > 0.12 && duk.luva > 0.2 && duk.fakta > 0.01, duk);
  await bild(s, '12-kalender-julafton');
  if (T.bilder) { const d = await s.kor(`document.querySelector('canvas.jul-sum-bild').toDataURL('image/png')`); fs.writeFileSync(path.join(T.bilder, '13-delningsbilden.png'), Buffer.from(String(d).split(',')[1], 'base64')); }
  // Kopiera: bilden hamnar i urklipp (läses tillbaka i huvudprocessen)
  await klickaPa(s, '.jul-sum-knappar button:nth-child(2)');
  const kopierad = await s.kor(`__J.tills(() => document.getElementById('apptoast').textContent === 'Bilden är kopierad.' && !document.querySelector('.jul-sum-knappar').classList.contains('jul-vantar'), 5000)`);
  const urklipp = await M(`const l = await el.clipboard.read(); const it = l.find((x) => x.types.includes('image/png')); if (!it) return 'ingen bild';
    const b = Buffer.from(await (await it.getType('image/png')).arrayBuffer()); return JSON.stringify(el.nativeImage.createFromBuffer(b).getSize());`);
  R.ok('julafton: "Kopiera bilden" lägger bilden i urklipp och säger till', kopierad === true && urklipp === '{"width":1200,"height":630}', { kopierad, urklipp });
  // Spara: dialogen besvaras åt oss i huvudprocessen (ingen ruta på skärmen), filen ska vara exakt bilden i panelen
  const malfil = path.join(profil, 'AdRaze-jul-test.png');
  await M(`el.dialog.showSaveDialog = async (...a) => { global.__julDialog = a[a.length - 1]; return { canceled: false, filePath: ${JSON.stringify(malfil)} }; }; return 1;`);
  await klickaPa(s, '.jul-sum-knappar button:nth-child(1)');
  const sparad = await s.kor(`__J.tills(() => document.getElementById('apptoast').textContent === 'Bilden är sparad.', 5000)`);
  const iPanelen = await s.kor(`document.querySelector('canvas.jul-sum-bild').toDataURL('image/png').split(',')[1]`);
  const paDisk = fs.existsSync(malfil) ? fs.readFileSync(malfil) : Buffer.alloc(0);
  const dialog = await M(`return JSON.stringify(global.__julDialog || null);`);
  R.ok('julafton: "Spara som bild" skriver exakt bilden i panelen till filen man valt, med ett förslag på namn', sparad === true && paDisk.length > 20000 && paDisk.toString('base64') === iPanelen && /AdRaze-jul-2026\.png$/.test((JSON.parse(dialog) || {}).defaultPath || ''), { sparad, byte: paDisk.length, dialog });
  await M(`el.dialog.showSaveDialog = async () => ({ canceled: true }); return 1;`);
  await s.kor(`document.getElementById('apptoast').textContent = ''; 1`);
  await klickaPa(s, '.jul-sum-knappar button:nth-child(1)'); await H.sov(700);
  const avbruten = await J(s, `JSON.stringify({ toast: document.getElementById('apptoast').textContent, vantar: document.querySelector('.jul-sum-knappar').classList.contains('jul-vantar') })`);
  R.ok('julafton: avbryter man spardialogen händer ingenting', avbruten.toast === '' && !avbruten.vantar, avbruten);
  // Tillbaka till luckorna, och sammanfattningen från remsan
  await klickaPa(s, '.jul-kal-bak'); await H.sov(400);
  const alla = await panel();
  R.ok('julafton: "Alla luckor" visar kalendern med alla 24 öppnade', alla.rubrik === 'Julkalender' && !alla.summering && alla.oppnade.length === 24 && alla.kommande === 0 && alla.fot.join('|') === '24 av 24 öppnade|Det var sista luckan. God jul!', alla);
  await klickaPa(s, '.jul-kal-x'); await H.sov(250);
  await klickaPa(s, '#jul-st-mer');
  await s.kor(`__J.tills(() => !!document.querySelector('#jul-kalender.jul-bara-summering canvas.jul-sum-bild'), 6000)`);
  const franRemsan = await panel();
  R.ok('julafton: rutan "Din december" i remsan öppnar samma sammanfattning', franRemsan.oppen && franRemsan.summering && franRemsan.tal === sv(jul23) && franRemsan.bild, franRemsan);
  R.ok('kalender: inga JS-fel på julafton', !fel(s).length, fel(s));
  await stangApp();

  /* ── K5. 2 januari: hela december, alla luckor går att öppna, varje tips går att läsa ── */
  const hela = summan(1, 31);
  forberedProfil(profil, { luckor: { 2026: serie(1, 20) }, dagar: dagarna(1, 31) });
  ({ s, M } = await starta('2027-01-02', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka') && document.querySelector('.nt-stats').classList.contains('jul-stat-pa'), 5000)`);
  const k5 = await kal();
  R.ok('januari: remsan säger vad man slapp i december, luckan på nya fliken är nummer 24', k5.lucka.nr === '24' && /\bny\b/.test(k5.lucka.klass) && k5.tal[0] === sv(hela) && k5.etikett.join() === 'annonser och spårare slapp du i december' && /^Din december/.test(k5.mer || ''), k5);
  await oppnaKalender(s);
  await s.kor(`__J.tills(() => !!document.querySelector('#jul-kalender.jul-bara-summering canvas.jul-sum-bild'), 8000)`);
  const janSum = await panel();
  R.ok('januari: sammanfattningen gäller hela december, samma summa som remsan', janSum.tal === sv(hela) && janSum.stat[0] === 'annonser och spårare stoppade AdRaze åt dig 1–31 december.' && janSum.fakta[0].join() === 'Flest på en dag,' + (DAG(31).a + DAG(31).s) + ' (31 december)', janSum);
  await klickaPa(s, '.jul-kal-bak'); await H.sov(400);
  const tips = [];
  for (let n = 1; n <= 23; n++) tips.push(await valj(n, 320));
  const trasiga = tips.map((t, i) => (!t.titel || !t.text || /[{}]|undefined|null/.test(t.titel + t.text + (t.knapp || '')) || t.datum !== (i === 12 ? 'Lucia, 13 december' : (i + 1) + ' december') || t.rullar ? i + 1 : 0)).filter(Boolean);
  R.ok('januari: alla 24 luckor går att öppna, och varje lucka har datum, rubrik och text som får plats', (await panel()).kommande === 0 && trasiga.length === 0 && JSON.stringify(tillstand(profil).luckor) === JSON.stringify({ 2026: serie(1, 24) }), { trasiga, titlar: tips.map((t) => t.titel) });
  R.ok('kalender: kortkommandona i tipsen är de som gäller', JSON.stringify([1, 2, 4, 7, 23].map((n) => tips[n - 1].kbd.join())) === '["Ctrl+K","Ctrl+Shift+T","F9","Ctrl+Shift+P","Ctrl+Shift+N"]', [1, 2, 4, 7, 23].map((n) => tips[n - 1].kbd));
  R.ok('kalender: den 6, 13 och 20 december visar luckan också decembers siffror', [6, 13, 20].every((n) => tips[n - 1].tal === sv(hela) && tips[n - 1].stat[1] === 'annonser och spårare stoppade AdRaze åt dig i december.') && tips.filter((t) => t.tal).length === 3, [6, 13, 20].map((n) => tips[n - 1].stat));
  // Byter man kortkommando följer tipset med; utan kortkommando får tipset en annan text
  const kort = await J(s, `(async () => { const v = (ms) => new Promise((r) => setTimeout(r, ms)), ut = {}, B = () => document.querySelector('.jul-kal-blad');
    await Anpassa.set('kortkommandon.palett', ['Alt+P'], 'Kortkommando: Kommandopalett'); await v(300); ${lucka(2)}.click(); await v(250); ${lucka(1)}.click(); await v(300); ut.bytt = [...B().querySelectorAll('kbd')].map((k) => k.textContent).join();
    await Anpassa.set('kortkommandon.palett', [], 'Kortkommando: Kommandopalett'); await v(300); ${lucka(2)}.click(); await v(250); ${lucka(1)}.click(); await v(300); ut.utan = B().querySelector('.jul-kal-text').textContent; ut.utanKbd = B().querySelectorAll('kbd').length;
    await Anpassa.set('kortkommandon.palett', undefined, 'Kortkommando: Kommandopalett'); await v(300); return JSON.stringify(ut); })()`);
  R.ok('kalender: tipset visar det kortkommando användaren har valt, och en annan text om kommandot inte har något', kort.bytt === 'Alt+P' && kort.utanKbd === 0 && /^Skriv det du vill göra, så hittar paletten/.test(kort.utan), kort);
  // Barnläge: de tre tips som inte gäller barn byts mot reservtips
  await s.kor(`window.__konto = account; account = { isChild: true, name: 'Barn' }; 1`);
  const barn = [];
  for (const n of [5, 16, 23]) barn.push((await valj(n, 320)).titel);
  await s.kor(`account = window.__konto; 1`);
  R.ok('barnläge: snabbord, sidopanelen och inkognito byts mot Sök på sidan, Tysta en flik och Bokmärk sidan', barn.join() === 'Sök på sidan,Tysta en flik,Bokmärk sidan' && tips[15].titel === 'Sidopanelen' && tips[22].titel === 'Inkognito', barn);
  // Knapparna som leder till inställningarna och till blockerarens sida
  await valj(10);
  await klickaPa(s, '.jul-kal-blad > .jul-knapp'); await H.sov(900);
  const inst = await J(s, `JSON.stringify((() => { const st = document.getElementById('settings'), d = document.getElementById('anp-flikar').getBoundingClientRect(), sok = document.getElementById('set-search').getBoundingClientRect();
    return { synlig: !st.classList.contains('hidden'), flik: (document.querySelector('#settings-nav .set-tab.on') || {}).dataset.cat, topp: Math.round(d.top - sok.bottom), panel: !document.getElementById('jul-kalender').hidden }; })())`);
  R.ok('kalender: "Visa inställningen" öppnar Anpassa vid rätt del, med rubriken synlig under sökrutan, och stänger panelen', inst.synlig && inst.flik === 'anpassa' && inst.topp >= 0 && inst.topp < 120 && !inst.panel, inst);
  await s.kor(`closeSettings(); 1`); await H.sov(500);
  await oppnaKalender(s); await H.sov(600);
  await klickaPa(s, '.jul-kal-bak'); await H.sov(300);
  await valj(17);
  const flikarFore = await s.kor(`tabs.length`);
  await klickaPa(s, '.jul-kal-blad > .jul-knapp'); await H.sov(1200);
  const blk = await J(s, `JSON.stringify({ flikar: tabs.length, url: active && active.url, panel: !document.getElementById('jul-kalender').hidden })`);
  R.ok('kalender: "Öppna blockerarens inställningar" öppnar adraze://adblock i en ny flik, och panelen stängs när startsidan göms', blk.flikar === flikarFore + 1 && /^adraze:\/\/adblock/.test(blk.url || '') && !blk.panel, blk);
  await s.kor(`(() => { const t = active, hem = tabs.find((x) => !x.url && !x.isSettings); closeTab(t); if (hem) switchTab(hem); return 1; })()`); await H.sov(500);
  R.ok('kalender: inga JS-fel i januari', !fel(s).length, fel(s));
  await stangApp();

  /* ── K6. Januari utan något stoppat i december: det sägs som det är, ingen bild ── */
  forberedProfil(profil, { luckor: { 2026: serie(1, 24) }, dagar: {} });
  ({ s, M } = await starta('2027-01-03', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka'), 5000)`);
  await H.sov(900);
  const k6 = await kal();
  await oppnaKalender(s);
  await s.kor(`__J.tills(() => !!document.querySelector('#jul-kalender.jul-bara-summering .jul-sum > *'), 5000)`);
  const noll = await panel();
  await klickaPa(s, '.jul-kal-bak'); await H.sov(300);
  const noll6 = await valj(6, 500);
  R.ok('noll stoppat: remsan visar totalen, sammanfattningen säger att inget stoppades och har ingen bild', !/jul-stat-pa|jul-stat-mer/.test(k6.remsa) && k6.mer === null && /oppnad/.test(k6.lucka.klass) && noll.summering && JSON.stringify(noll.stat) === '["Inget stoppades i december.","Du har öppnat 24 av 24 luckor."]' && !noll.bild && noll.knappar.length === 0 && noll.tal === null, { k6, noll });
  R.ok('noll stoppat: statistikluckan säger det och visar tipset', noll6.tal === null && JSON.stringify(noll6.stat) === '["Inget stoppades i december.","Dagens tips"]' && noll6.titel === 'Blockera element', noll6);
  R.ok('kalender: inga JS-fel med noll stoppat', !fel(s).length, fel(s));
  await stangApp();

  /* ── K7. Räknaren började först i januari: inga siffror för december, och då visas inga ── */
  forberedProfil(profil, { borjan: '2027-01-02', luckor: { 2026: serie(1, 24) }, dagar: { '2027-01-02': { a: 9, s: 1, k: 0, p: 0 } } });
  ({ s, M } = await starta('2027-01-03', profil));
  await s.kor(`__J.tills(() => !!document.getElementById('jul-lucka'), 5000)`);
  await H.sov(900);
  const k7 = await kal();
  await oppnaKalender(s);
  await s.kor(`__J.tills(() => !!document.querySelector('#jul-kalender.jul-bara-summering .jul-sum > *'), 5000)`);
  const ingen = await panel();
  await klickaPa(s, '.jul-kal-bak'); await H.sov(300);
  const ingen13 = await valj(13, 500);
  R.ok('inga siffror för december: remsan visar totalen, sammanfattningen säger varför och har ingen bild', !/jul-stat-pa|jul-stat-mer/.test(k7.remsa) && k7.mer === null && ingen.stat[0] === 'Det finns inga siffror för december. AdRaze började räkna först efteråt.' && !ingen.bild && ingen.knappar.length === 0 && ingen.tal === null, { k7, ingen });
  R.ok('inga siffror för december: statistikluckan visar bara tipset', ingen13.tal === null && ingen13.stat.length === 0 && ingen13.titel === 'Widgetar på startsidan' && ingen13.datum === 'Lucia, 13 december', ingen13);
  R.ok('kalender: inga JS-fel utan siffror', !fel(s).length, fel(s));
  await stangApp();
}

async function kor(rot, bilder, bara) {
  const R = H.resultat();
  renaFunktioner(R, rot);
  await logik(R, rot);
  if (bara === 'logik') return R;
  const x = await H.startaXvfb();
  const profil = H.tempDir('jul'), profilB = H.tempDir('jul-b'), profilC = H.tempDir('jul-c');
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
  const K = { profil: profilC, starta, stangApp, bild, bilder, cdp: () => app.cdp };
  const loggKoll = () => {
    const nekade = fs.readFileSync(logg, 'utf8').split('\n').filter((r) => r.includes('[ipc] nekad') && !r.includes('evil.example'));   // försöken mot IPC-vakten är avsiktliga
    R.ok('inga IPC-kanaler nekade', !nekade.length, nekade.slice(0, 3));
    const huvudFel = fs.readFileSync(logg, 'utf8').split('\n').filter((r) => /uncaughtException|unhandledRejection|\[jul\]/.test(r));
    R.ok('inga fel från huvudprocessen', !huvudFel.length, huvudFel.slice(0, 3));
  };
  try {
    if (bara === 'kalender') { await kalender(R, K); loggKoll(); return R; }
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
    const kalFore = await J(s, `JSON.stringify({ lucka: (document.getElementById('jul-lucka') || { dataset: {} }).dataset.n, delar: __J.delar() })`);
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
    const kvar = await J(s, `JSON.stringify({ lucka: !!document.getElementById('jul-lucka'), plats: !!document.getElementById('jul-lucka-plats'), panel: !!document.getElementById('jul-kalender'), remsa: document.querySelector('.nt-stats').className, jul: document.querySelectorAll('.nt-stats .jul-st').length })`);
    R.ok('midnatt efter trettondagen: kalendern och julstatistiken är också borta, remsan är som vanligt', kalFore.lucka === '24' && har(kalFore.delar, 'kalender', 'stat') && !kvar.lucka && !kvar.plats && !kvar.panel && !/jul-/.test(kvar.remsa) && kvar.jul === 0, { kalFore, kvar });
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

    /* ── 10. Julkalendern, statistiken i julspråk och julaftons sammanfattning ── */
    await kalender(R, K);
    loggKoll();
  } catch (e) {
    R.ok('testet kördes klart', false, String((e && e.stack) || e));
  } finally {
    if (app) await stang(app);
    x.stoppa();
    for (const p of [profil, profilB, profilC]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--bilder');
  const bilder = i >= 0 ? path.resolve(a[i + 1]) : null;
  const mapp = a.find((v, j) => !v.startsWith('--') && a[j - 1] !== '--bilder');
  kor(path.resolve(mapp || path.join(__dirname, '..', '..')), bilder, a.includes('--logik') ? 'logik' : a.includes('--kalender') ? 'kalender' : null).then((R) => { console.log(R.text()); if (bilder) console.log('Skärmdumpar: ' + bilder); process.exit(R.fel.length ? 1 : 0); });
}
