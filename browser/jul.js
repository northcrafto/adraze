// Jultemat i huvudprocessen (fönstrets del: ui/jul.js med delarna ui/jul-pynt.js och ui/jul-kalender.js, stilen: ui/jul.css).
//
// Här ligger det som inte får bero på ett enskilt fönster:
//   • datum och säsong (1 december–6 januari), med låtsat datum för test (ADRAZE_DATUM)
//   • jul.*-nycklarna i Anpassa-butiken: huvudbrytaren jul.pa och en brytare per del
//   • julfärgerna: byter till temat Jul under julen och tillbaka till det man hade innan efter trettondagen
//   • räknaren för stoppad reklam per dag (alltid på, även utan jultema, så att december har siffror)
//   • luckorna i julkalendern och delningsbilden på julafton (spara som fil, kopiera)
//
// Tillstånd som inte är inställningar – frågan besvarad, temat innan julfärgerna, öppnade luckor, räknarna – ligger i
// en egen fil (userData/adraze-jul.json) och INTE i Anpassa-butiken: varje ändring där ger toasten "Ändrat · Ångra"
// och hamnar i ångra-historiken. Bara huvudprocessen skriver filen.
//
// Inget slås på av sig självt. jul.pa är false tills användaren svarat "Ja tack" på frågan (eller slagit på Jultema
// under Inställningar › Anpassa), och sätts tillbaka när säsongen är slut så att nästa december frågar igen.
// Temat "Jul" i temalistan (tema.palett = 'jul') går att välja året runt och har inget med säsongen att göra.
'use strict';
const fs = require('fs');
const path = require('path');
const { app, ipcMain, dialog, clipboard, nativeImage, BrowserWindow, ClipboardItem } = require('electron');
const anpassa = require('./anpassa');

/* ── Datum och säsong ── */
// ADRAZE_DATUM låtsas ett datum: "2026-12-05" (kl. 12 lokal tid) eller "2026-12-24T09:30" / "2026-11-30T23:59:30".
// Läses EN gång: klockan går sedan framåt som vanligt från det låtsade ögonblicket (så går midnatt att prova).
// Bara jultemats egen klocka flyttas; allt annat i webbläsaren visar riktig tid.
function lasDatum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] === undefined ? 12 : +m[4], m[5] === undefined ? 0 : +m[5], m[6] === undefined ? 0 : +m[6]);
  if (!Number.isFinite(d.getTime()) || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;   // 2026-02-31 finns inte
  return d;
}
const LATSAT = lasDatum(process.env.ADRAZE_DATUM);
const OFFSET = LATSAT ? LATSAT.getTime() - Date.now() : 0;
const nu = () => new Date(Date.now() + OFFSET);
const tva = (n) => String(n).padStart(2, '0');
const dagStr = (d) => d.getFullYear() + '-' + tva(d.getMonth() + 1) + '-' + tva(d.getDate());   // lokal tid, "2026-12-05"
// Säsongen heter som året den börjar: "2026" är 1 december 2026–6 januari 2027. Annars null.
function sasong(d) {
  d = d || nu();
  if (d.getMonth() === 11) return d.getFullYear();
  if (d.getMonth() === 0 && d.getDate() <= 6) return d.getFullYear() - 1;
  return null;
}
const DAG_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function sasongAvDag(s) { const m = DAG_RE.exec(String(s)); return m ? sasong(new Date(+m[1], +m[2] - 1, +m[3], 12)) : null; }

/* ── Nycklarna i Anpassa ── */
// Rena utseendeval: barn får ändra dem (barnLast: false). jul.pa är huvudbrytaren; en del är aktiv när säsongen
// pågår, jul.pa är true och delens egen nyckel inte är false (ui/jul.js). Etiketterna visas i ångra-listan.
const NYCKLAR = [
  { nyckel: 'jul.pa', standard: false, etikett: 'Jultema' },
  { nyckel: 'jul.farger', standard: true, etikett: 'Julfärger' },
  { nyckel: 'jul.sno', standard: true, etikett: 'Snö på nya fliken' },
  { nyckel: 'jul.luva', standard: true, etikett: 'Gorillan i tomteluva' },
  { nyckel: 'jul.kalender', standard: true, etikett: 'Julkalender' },
  { nyckel: 'jul.stat', standard: true, etikett: 'Statistik i julspråk' },
  { nyckel: 'jul.flikar', standard: true, etikett: 'Snö på flikarna' },
];
for (const n of NYCKLAR) anpassa.registrera({ ...n, barnLast: false, importBar: true });

// Julfärgerna = temat Jul. SAMMA värden som kortet "Jul" i FORVAL i ui/anpassa-tema.js – ändra på båda ställena.
const TEMA = { 'tema.accent': '#d9a441', 'tema.lage': 'morkt', 'tema.horn': 'normal', 'tema.densitet': 'normal', 'tema.palett': 'jul' };
const UTAN = { utanHistorik: true };

// Bilderna i ui/jul/ (tecknarens filer). SAMMA namn som --jul-gorilla, --jul-gorilla-liten och -liten-mork i ui/jul.css.
// stor = hela loggan med AD-lappen (nya fliken, delningsbilden), liten = märket för 16–30 px (blockerarknappen m.m.).
const BILDER = { stor: 'gorilla-luva-512.png', liten: 'mark-luva.png', litenMork: 'mark-luva-dark.png', vektor: 'gorilla-luva.svg' };

/* ── Tillståndsfilen ── */
// { v, borjan, sasong, fragad, visad, fore, luckor, dagar }
//   borjan  dagen räknaren började ("2026-11-11") – statistiken säger "sedan den …" om det var efter 1 december
//   sasong  säsongen som fragad/visad och jul.pa hör till (byts den nollställs de)
//   fragad  säsongen då frågan "Vill du ha jultema?" fick svar
//   visad   dagar frågan visats utan svar; efter tre olika dagar räknas det som nej
//   fore    { sasong, varden }: julfärgerna är tillämpade den säsongen, varden = de tema-värden som gällde innan
//           (en nyckel som saknas = standardvärdet). varden null = inget att gå tillbaka till (man hade redan temat Jul).
//   luckor  { "2026": [1, 2, 3] } öppnade luckor per säsong
//   dagar   { "2026-12-05": { a, s, k, p } } stoppat per dag: annonser, spårare, kakrutor, popup-fönster
const FIL = () => path.join(app.getPath('userData'), 'adraze-jul.json');
const SPAR_MS = 5000;        // räknarna skrivs högst så här ofta
const DAGAR_MAX = 400;       // äldre dagar rensas
let st = null, sparTimer = null, sparad = 0;

const heltal = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const arObjekt = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function rensa(j) {
  const ut = { v: 1, borjan: null, sasong: null, fragad: null, visad: [], fore: null, luckor: {}, dagar: {} };
  if (!arObjekt(j)) return ut;
  if (typeof j.borjan === 'string' && DAG_RE.test(j.borjan)) ut.borjan = j.borjan;
  if (Number.isInteger(j.sasong)) ut.sasong = j.sasong;
  if (Number.isInteger(j.fragad)) ut.fragad = j.fragad;
  if (Array.isArray(j.visad)) ut.visad = [...new Set(j.visad.filter((d) => typeof d === 'string' && DAG_RE.test(d)))].slice(-10);
  if (arObjekt(j.fore) && Number.isInteger(j.fore.sasong)) {
    let varden = null;
    if (arObjekt(j.fore.varden)) { varden = {}; for (const k of Object.keys(TEMA)) if (Object.hasOwn(j.fore.varden, k) && typeof j.fore.varden[k] === 'string') varden[k] = j.fore.varden[k].slice(0, 40); }
    ut.fore = { sasong: j.fore.sasong, varden };
  }
  if (arObjekt(j.luckor)) for (const [ar, l] of Object.entries(j.luckor)) {
    if (/^\d{4}$/.test(ar) && Array.isArray(l)) ut.luckor[ar] = [...new Set(l.filter((n) => Number.isInteger(n) && n >= 1 && n <= 24))].sort((a, b) => a - b);
  }
  if (arObjekt(j.dagar)) for (const [dag, r] of Object.entries(j.dagar)) {
    if (DAG_RE.test(dag) && arObjekt(r)) ut.dagar[dag] = { a: heltal(r.a), s: heltal(r.s), k: heltal(r.k), p: heltal(r.p) };
  }
  return ut;
}
function las() {
  if (st) return st;
  let j = null;
  try { j = JSON.parse(fs.readFileSync(FIL(), 'utf8')); } catch {}
  st = rensa(j);
  if (!st.borjan) { st.borjan = dagStr(new Date()); sparaSnart(1000); }   // riktig dag, även när datumet låtsas
  return st;
}
// Skriver hela filen på en gång (tmp + rename), så att den aldrig blir halv
function sparaNu() {
  clearTimeout(sparTimer); sparTimer = null;
  if (!st) return;
  try { const f = FIL(); fs.writeFileSync(f + '.tmp', JSON.stringify(st)); fs.renameSync(f + '.tmp', f); sparad = Date.now(); } catch (e) { console.warn('[jul] kunde inte spara', e.message); }
}
function sparaSnart(ms) {
  if (sparTimer) return;
  sparTimer = setTimeout(sparaNu, Math.max(0, ms === undefined ? SPAR_MS - (Date.now() - sparad) : ms));
  if (sparTimer.unref) sparTimer.unref();
}
function rensaGamlaDagar() {
  const d = las(); const grans = new Date(nu().getTime() - DAGAR_MAX * 86400000); const g = dagStr(grans);
  let n = 0;
  for (const dag of Object.keys(d.dagar)) if (dag < g) { delete d.dagar[dag]; n++; }
  if (n) sparaSnart();
}

/* ── Räknaren per dag ── */
// main.js anropar raknaTraff för varje 'adblock:hit' som skickas till fönstren (en gång, oavsett antal fönster).
// Typen kan komma från en webbsidas preload: bara de kända typerna räknas.
const FALT = new Map([['ad', 'a'], ['tracker', 's'], ['kakor', 'k'], ['popups', 'p']]);
function raknaTraff(typ) {
  const f = FALT.get(typ);
  if (!f) return;
  const d = las(), dag = dagStr(nu());
  const r = d.dagar[dag] || (d.dagar[dag] = { a: 0, s: 0, k: 0, p: 0 });
  r[f]++;
  sparaSnart();
}
const TOM = () => ({ a: 0, s: 0, k: 0, p: 0 });
// Decembers siffror för säsongen (eller för årets december när ingen säsong pågår)
function stat() {
  const d = las(), n = nu(), ar = sasong(n) || n.getFullYear();
  const december = TOM(), tillJulafton = TOM(), perDag = [];
  let basta = null;
  for (let i = 1; i <= 31; i++) {
    const dag = ar + '-12-' + tva(i), r = d.dagar[dag];
    if (!r) continue;
    for (const f of ['a', 's', 'k', 'p']) { december[f] += r[f]; if (i <= 24) tillJulafton[f] += r[f]; }
    perDag.push({ dag, a: r.a, s: r.s });
    if (r.a + r.s > 0 && (!basta || r.a + r.s > basta.n)) basta = { dag, n: r.a + r.s };
  }
  return { ar, forsta: d.borjan, idag: { ...TOM(), ...(d.dagar[dagStr(n)] || {}) }, december, tillJulafton, perDag, basta };
}

/* ── Frågan "Vill du ha jultema?" ── */
// Besvarad i år, eller visad tre olika dagar utan svar (den tredje dagen visas den fortfarande, sedan aldrig mer)
function fragadNu(s) {
  if (!s) return true;
  const d = las();
  if (d.fragad === s) return true;
  const dagar = d.visad.filter((x) => sasongAvDag(x) === s);
  return dagar.length >= 3 && !dagar.includes(dagStr(nu()));
}

/* ── Julfärgerna: på med temat Jul, och tillbaka till det man hade innan ── */
let D = { skicka: () => {}, nedladdningsmapp: () => app.getPath('downloads'), T: (s) => s };
const std = (k) => { const r = anpassa.registret()[k]; return r ? r.standard : undefined; };
const lika = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Fönstren visar toasten "Ändrat: X · Ångra" för varje ändring strax efter ett klick. Det vi ändrar på egen hand
// (julfärger på/av, säsongen slut) ska inte ge den: Ångra skulle då ta något helt annat. ui/jul.js tystar toasten
// en kort stund – meddelandet kommer fram före ändringarna, och användarens eget val strax därefter syns som vanligt.
function tysta() { try { D.skicka('jul:tyst', 600); } catch {} }
// Provas ett tema från galleriet just nu? Då ligger julfärgerna undan i galleriets egen "innan" (anpassa-galleri.js)
function galleriProvar() { try { return !!require('./anpassa-galleri').provar(); } catch { return false; } }

function tillampaFarger() {
  const s = sasong(), d = las();
  if (!s || d.fore) return;
  if (anpassa.hamta('tema.palett') === 'jul') {   // användaren har själv valt temat Jul: inget "innan" att gå tillbaka till
    d.fore = { sasong: s, varden: null }; sparaNu();
    return;
  }
  const sparat = anpassa.alla(), varden = {};
  for (const k of Object.keys(TEMA)) if (k in sparat) varden[k] = sparat[k];
  d.fore = { sasong: s, varden }; sparaNu();   // på disk FÖRST: dör vi mitt i bytet går det ändå att komma tillbaka
  tysta();
  for (const [k, v] of Object.entries(TEMA)) anpassa.satt(k, lika(v, std(k)) ? undefined : v, UTAN);   // standardvärden sparas som "inget värde"
  anpassa.sparaNu();
}
function aterstallFarger() {
  const d = las(), f = d.fore;
  if (!f) return;
  const klar = () => { d.fore = null; sparaNu(); };
  if (!f.varden) { klar(); return; }
  if (anpassa.hamta('tema.palett') !== 'jul') {
    if (galleriProvar()) return;   // vänta tills temat är behållet eller ångrat, och titta igen (kolla() varje minut)
    klar(); return;                // användaren har bytt tema själv under julen: det får vara
  }
  tysta();
  for (const k of Object.keys(TEMA)) {
    if (!lika(anpassa.hamta(k), TEMA[k])) continue;   // ändrat under julen (t.ex. en egen accentfärg): behålls
    anpassa.satt(k, k in f.varden ? f.varden[k] : undefined, UTAN);
  }
  anpassa.sparaNu();   // temat på disk FÖRST, sedan glöms "innan": dör vi emellan görs återställningen om nästa gång
  klar();
}
// Det som hör till en säsong som är slut
function stada() {
  const s = sasong(), d = las();
  if (d.fore && d.fore.sasong !== s) aterstallFarger();
  const paSatt = anpassa.alla()['jul.pa'] !== undefined;
  if (d.sasong !== s) {   // ny säsong eller ingen: det gamla svaret gäller inte längre, nästa december frågar igen
    d.sasong = s; d.visad = []; sparaNu();
    if (paSatt) { tysta(); anpassa.satt('jul.pa', undefined, UTAN); }
  } else if (!s && paSatt) { tysta(); anpassa.satt('jul.pa', undefined, UTAN); }   // påslaget utanför julen (import, Falk): gäller inte
}
function synka() {
  stada();
  const s = sasong(), d = las();
  const pa = !!s && anpassa.hamta('jul.pa') === true && anpassa.hamta('jul.farger') !== false;
  if (pa) { if (!d.fore) tillampaFarger(); } else if (d.fore) aterstallFarger();
}
let synkPlanerad = false;
function synkaSnart() {   // efter att en hel "Återställ allt", import eller ångra-grupp hunnit klart
  if (synkPlanerad) return;
  synkPlanerad = true;
  setImmediate(() => { synkPlanerad = false; try { synka(); } catch (e) { console.warn('[jul]', e); } });
}

/* ── Läget till fönstren ── */
let bildCache = null;
function bilder() {
  if (bildCache) return bildCache;
  const ut = {}; let alla = true;
  for (const [namn, fil] of Object.entries(BILDER)) {
    let ok = false;
    try {
      const b = fs.readFileSync(path.join(__dirname, 'ui', 'jul', fil));
      ok = /\.png$/.test(fil) ? arPng(b) && b.length > 500 : b.length > 100;
    } catch {}
    ut[namn] = ok ? 'jul/' + fil : null;
    if (!ok) alla = false;
  }
  if (alla) bildCache = ut;   // saknas något tittar vi igen nästa gång
  return ut;
}
function lageUt() {
  const s = sasong(), d = las(), n = nu();
  return { offset: OFFSET, test: !!LATSAT, sasong: s, dag: dagStr(n), fragad: fragadNu(s), luckor: s ? [...(d.luckor[s] || [])] : [], bilder: bilder() };
}
function skickaLage() { try { D.skicka('jul:andrad', lageUt()); } catch {} }

// Vid start (innan första fönstret), en gång i minuten och strax efter midnatt: har säsongen eller dagen bytts?
let senastSasong, senastDag, kollad = false, midnattTimer = null;
function kolla() {
  kollad = true;
  try { synka(); } catch (e) { console.warn('[jul]', e); }
  const s = sasong(), dag = dagStr(nu());
  const andrat = senastDag !== undefined && (s !== senastSasong || dag !== senastDag);
  senastSasong = s; senastDag = dag;
  if (andrat) { rensaGamlaDagar(); skickaLage(); }
}
// Minutkollen kan ligga upp till en minut efter: julen ska börja och sluta på slaget
function vantaPaMidnatt() {
  clearTimeout(midnattTimer);
  const n = nu(), nasta = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 300);
  midnattTimer = setTimeout(() => { kolla(); vantaPaMidnatt(); }, Math.max(1000, Math.min(nasta.getTime() - n.getTime(), 0x7fffffff)));
  if (midnattTimer.unref) midnattTimer.unref();
}

/* ── Delningsbilden (julafton) ── */
const PNG_MAX = 4 * 1024 * 1024;
const PNG_SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const arPng = (b) => Buffer.isBuffer(b) && b.length > 8 && b.subarray(0, 8).equals(PNG_SIGNATUR);
// Tar bara emot en PNG som data-URL (ritad på en canvas i skalet), högst 4 MB
function tolkaPng(data) {
  const start = 'data:image/png;base64,';
  if (typeof data !== 'string' || !data.startsWith(start) || data.length > start.length + Math.ceil(PNG_MAX * 4 / 3) + 8) return null;
  const b64 = data.slice(start.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const b = Buffer.from(b64, 'base64');
  return arPng(b) && b.length <= PNG_MAX ? b : null;
}
// Bilden till urklipp. Electron 45 har ett nytt urklipp efter webbens förebild (write med ClipboardItem, löften);
// äldre versioner har writeImage.
async function kopieraPng(png) {
  if (typeof ClipboardItem === 'function' && typeof clipboard.write === 'function') await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
  else clipboard.writeImage(nativeImage.createFromBuffer(png));
}
async function bild(e, d) {
  const png = tolkaPng(d && d.data);
  if (!png || nativeImage.createFromBuffer(png).isEmpty()) return { ok: false, error: 'bild' };   // måste gå att avkoda
  if (d.atgard === 'kopiera') {
    try { await kopieraPng(png); return { ok: true }; }
    catch (fel) { console.warn('[jul] kunde inte kopiera bilden', fel && fel.message); return { ok: false, error: 'urklipp' }; }
  }
  if (d.atgard !== 'spara') return { ok: false, error: 'atgard' };
  const win = BrowserWindow.fromWebContents(e.sender);
  const namn = 'AdRaze-jul-' + (sasong() || nu().getFullYear()) + '.png';
  let mapp = ''; try { mapp = D.nedladdningsmapp() || ''; } catch {}
  const val = { defaultPath: mapp ? path.join(mapp, namn) : namn, filters: [{ name: 'PNG', extensions: ['png'] }] };
  const r = win ? await dialog.showSaveDialog(win, val) : await dialog.showSaveDialog(val);
  if (r.canceled || !r.filePath) return { ok: false, avbrutet: true };
  const tillagd = !/\.png$/i.test(r.filePath), fil = tillagd ? r.filePath + '.png' : r.filePath;
  try { fs.writeFileSync(fil, png, { flag: tillagd ? 'wx' : 'w' }); return { ok: true, fil: path.basename(fil) }; }   // wx: dialogen frågade inte om det tillagda namnet
  catch { return { ok: false, error: 'skriv' }; }
}

/* ── Start ── */
function init(deps) {
  D = { ...D, ...(deps || {}) };
  // Kanalerna når bara våra egna sidor under ui/ (IPC-vakten i main.js)
  ipcMain.on('jul:lage', (e) => { if (!kollad) kolla(); e.returnValue = lageUt(); });
  ipcMain.handle('jul:svara', (_e, svar) => {
    const s = sasong();
    if (!s || (svar !== 'ja' && svar !== 'nej')) return { ok: false };
    const d = las(); d.fragad = s; sparaNu();
    if (svar === 'ja') { tysta(); anpassa.satt('jul.pa', true, UTAN); anpassa.sparaNu(); }   // lyssnaren nedan slår på färgerna
    skickaLage();   // frågan stängs i de andra fönstren
    return { ok: true };
  });
  ipcMain.on('jul:visad', () => {
    const s = sasong(), d = las(), dag = dagStr(nu());
    if (!s || d.fragad === s || d.visad.includes(dag)) return;
    d.visad.push(dag); sparaNu();
  });
  // Bara dagens lucka eller tidigare (alla 24 efter julafton, till och med 6 januari)
  ipcMain.handle('jul:lucka', (_e, n) => {
    const s = sasong(), d = las();
    const oppna = () => (s ? [...(d.luckor[s] || [])] : []);
    if (!s || !Number.isInteger(n) || n < 1 || n > 24) return { ok: false, luckor: oppna() };
    const idag = nu();
    if (n > (idag.getMonth() === 11 ? Math.min(24, idag.getDate()) : 24)) return { ok: false, luckor: oppna() };
    const l = d.luckor[s] || (d.luckor[s] = []);
    if (!l.includes(n)) { l.push(n); l.sort((a, b) => a - b); sparaNu(); skickaLage(); }
    return { ok: true, luckor: [...l] };
  });
  ipcMain.handle('jul:stat', () => stat());
  ipcMain.handle('jul:bild', (e, d) => bild(e, d));

  // Jultema eller Julfärger slås av eller på (i inställningarna, med Ångra, Återställ allt eller en import)
  anpassa.lyssna((nyckel, varde) => {
    if (nyckel !== 'jul.pa' && nyckel !== 'jul.farger') return;
    const s = sasong();
    if (nyckel === 'jul.pa' && varde === true && s) { const d = las(); if (d.fragad !== s) { d.fragad = s; sparaNu(); skickaLage(); } }   // påslaget för hand: fråga inte
    synkaSnart();
  });

  // Första kollen görs när hela main.js har laddat (galleriet ska ha hunnit lägga tillbaka en avbruten provning),
  // men alltid innan något fönster frågar efter läget (jul:lage ovan)
  process.nextTick(() => { if (!kollad) kolla(); });
  app.whenReady().then(() => { if (!kollad) kolla(); rensaGamlaDagar(); });
  const timer = setInterval(kolla, 60 * 1000);
  if (timer.unref) timer.unref();
  vantaPaMidnatt();
  app.on('before-quit', sparaNu);
  app.on('will-quit', sparaNu);
}

module.exports = { init, raknaTraff, nu, sasong, stat, lageUt };
// För testerna (tools/test/jul.js): de rena funktionerna, och kolla() för att låta tiden gå utan att vänta en minut
Object.assign(module.exports, { lasDatum, dagStr, sasongAvDag, tolkaPng, rensa, kolla, TEMA, NYCKLAR, BILDER });
