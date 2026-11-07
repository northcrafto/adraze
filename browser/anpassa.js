// Anpassning: EN gemensam inställningsbutik för allt användaren kan ändra i AdRazes utseende och beteende
// (teman, flikar, verktygsfält, startsida, kortkommandon, per-sajt, egen CSS m.m.).
// Huvudprocessen äger värdena (userData/adraze-anpassa.json); varje fönster har en kopia och får ändringar direkt.
// Varje ändring hamnar i historiken så att allt går att ångra, och nycklar som är barnlåsta kan inte ändras i barnläge.
//
// Nycklar namnges "<område>.<namn>", t.ex. "tema.accent", "flikar.lage", "verktyg.knappar", "sajt.<domän>".
// Registrera en nyckel med registrera({ nyckel, standard, barnLast, etikett }) där den införs.
const fs = require('fs');
const path = require('path');
const { app, ipcMain, BrowserWindow } = require('electron');

const FIL = () => path.join(app.getPath('userData'), 'adraze-anpassa.json');
const HISTORIK_MAX = 200;
let data = null;               // { varden: {}, historik: [{ nyckel, fore, efter, etikett, ts }] }
const register = new Map();    // nyckel → { standard, barnLast, etikett }
const lyssnare = new Set();    // (nyckel, värde) i huvudprocessen
let arBarn = () => false;      // sätts av main.js (barnläge någonstans)
let skrivTimer = null;

function las() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FIL(), 'utf8')); } catch { data = null; }
  if (!data || typeof data !== 'object' || typeof data.varden !== 'object') data = { varden: {}, historik: [] };
  if (!Array.isArray(data.historik)) data.historik = [];
  return data;
}
function spara() {
  clearTimeout(skrivTimer);
  skrivTimer = setTimeout(() => {
    try { const f = FIL(); fs.writeFileSync(f + '.tmp', JSON.stringify(data)); fs.renameSync(f + '.tmp', f); } catch (e) { console.warn('[anpassa] kunde inte spara', e.message); }
  }, 150);
}
const kopia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function standard(nyckel) { const r = register.get(nyckel); return r ? kopia(r.standard) : undefined; }
function hamta(nyckel, def) { const d = las(); return nyckel in d.varden ? kopia(d.varden[nyckel]) : (def !== undefined ? def : standard(nyckel)); }
function alla() { return kopia(las().varden); }
// Registreringen för en nyckel: exakt träff, annars ett mönster "område.*" som täcker den
function regFor(nyckel) {
  return register.get(nyckel) || [...register.entries()].find(([k]) => k.endsWith('.*') && nyckel.startsWith(k.slice(0, -1)))?.[1];
}
function last(nyckel) {
  if (!arBarn()) return false;
  const r = regFor(nyckel);
  return !!(r && r.barnLast);
}
// Bara våra egna fönster (ui/) får värdena – inte popupfönster med webbsidor (inloggning/kassa via window.open),
// som också är BrowserWindows. Egen CSS och skript får aldrig skickas till en webbsidas process.
const UI_URL = require('url').pathToFileURL(path.join(__dirname, 'ui')).href + '/';
// Fönstren får det SPARADE värdet (undefined = inget sparat → standard gäller) så deras kopia speglar filen exakt;
// lyssnare (här och i fönstren) får det verkliga värdet inklusive standard.
function sandUt(nyckel) {
  const d = las(); const sparat = nyckel in d.varden ? kopia(d.varden[nyckel]) : undefined;
  for (const fn of lyssnare) { try { fn(nyckel, hamta(nyckel)); } catch {} }
  for (const w of BrowserWindow.getAllWindows()) { try { if (!w.isDestroyed() && w.webContents.getURL().startsWith(UI_URL)) w.webContents.send('anpassa:andrad', { nyckel, varde: sparat }); } catch {} }
}
// Sätter ett värde (undefined = tillbaka till standard). Returnerar { ok } eller { ok:false, error:'barnlast' }.
function satt(nyckel, varde, { etikett, utanHistorik } = {}) {
  nyckel = String(nyckel || '').slice(0, 200);
  if (!nyckel) return { ok: false, error: 'nyckel' };
  if (last(nyckel)) return { ok: false, error: 'barnlast' };
  const d = las();
  const fore = nyckel in d.varden ? d.varden[nyckel] : undefined;
  if (JSON.stringify(fore) === JSON.stringify(varde)) return { ok: true };
  if (varde === undefined || varde === null) delete d.varden[nyckel]; else d.varden[nyckel] = kopia(varde);
  if (!utanHistorik) {
    d.historik.push({ nyckel, fore: kopia(fore), efter: kopia(varde), etikett: etikett || (register.get(nyckel) || {}).etikett || nyckel, ts: Date.now() });
    if (d.historik.length > HISTORIK_MAX) d.historik.splice(0, d.historik.length - HISTORIK_MAX);
  }
  spara(); sandUt(nyckel);
  return { ok: true };
}
function angra() {
  const d = las();
  for (let i = d.historik.length - 1; i >= 0; i--) {
    const h = d.historik[i];
    if (last(h.nyckel)) continue;
    d.historik.splice(i, 1);
    if (h.fore === undefined) delete d.varden[h.nyckel]; else d.varden[h.nyckel] = kopia(h.fore);
    spara(); sandUt(h.nyckel);
    return { ok: true, nyckel: h.nyckel, etikett: h.etikett };
  }
  return { ok: false, error: 'tomt' };
}
// Återställ en nyckel, alla som börjar med ett prefix ("tema."), eller allt (inget argument)
function aterstall(prefix) {
  const d = las(); const p = prefix ? String(prefix) : '';
  const nycklar = Object.keys(d.varden).filter((k) => (!p || k === p || k.startsWith(p)) && !last(k));
  for (const k of nycklar) satt(k, undefined, { etikett: 'Återställ ' + (p || 'allt') });
  return { ok: true, antal: nycklar.length };
}
// Dela: en kod med alla värden under ett prefix (t.ex. ett tema). Inget som rör konton eller säkerhet ska ligga här.
function exportera(prefix) {
  const v = las().varden; const ut = {};
  for (const k of Object.keys(v)) {
    if (prefix && !k.startsWith(prefix)) continue;
    const r = regFor(k);
    if (r && r.importBar === false) continue;   // egen CSS, skript m.m. följer aldrig med i en delningskod
    ut[k] = v[k];
  }
  return 'ADRZ1.' + Buffer.from(JSON.stringify(ut)).toString('base64url');
}
function importera(kod, prefix) {
  const m = /^ADRZ1\.([A-Za-z0-9_-]+)$/.exec(String(kod || '').trim());
  if (!m) return { ok: false, error: 'kod' };
  let o; try { o = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return { ok: false, error: 'kod' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: 'kod' };
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (prefix && !k.startsWith(prefix)) continue;
    const r = regFor(k);
    if (r && r.importBar === false) continue;   // t.ex. skript/CSS importeras aldrig via delningskod
    if (satt(k, v, { etikett: 'Importerat' }).ok) n++;
  }
  return { ok: true, antal: n };
}
function registrera(def) {
  if (!def || !def.nyckel) return;
  register.set(def.nyckel, { standard: def.standard, barnLast: !!def.barnLast, etikett: def.etikett || def.nyckel, importBar: def.importBar !== false });
}
function lyssna(fn) { lyssnare.add(fn); return () => lyssnare.delete(fn); }

function init({ barnKoll } = {}) {
  if (typeof barnKoll === 'function') arBarn = barnKoll;
  ipcMain.on('anpassa:alla', (e) => { e.returnValue = { varden: alla(), register: Object.fromEntries([...register].map(([k, v]) => [k, v])), barn: arBarn() }; });
  ipcMain.handle('anpassa:satt', (_e, d) => satt(d && d.nyckel, d && d.varde, { etikett: d && d.etikett }));
  ipcMain.handle('anpassa:angra', () => angra());
  ipcMain.handle('anpassa:aterstall', (_e, prefix) => aterstall(prefix));
  ipcMain.handle('anpassa:historik', () => kopia(las().historik.slice(-50).reverse()));
  ipcMain.handle('anpassa:exportera', (_e, prefix) => exportera(prefix));
  ipcMain.handle('anpassa:importera', (_e, d) => importera(d && d.kod, d && d.prefix));
}

module.exports = { init, hamta, alla, satt, angra, aterstall, exportera, importera, registrera, lyssna };
// Till Falk och Ångra-panelen (anpassa-falk.js, anpassa-angra.js): registret, barnlåset och hela historiken – som kopior
Object.assign(module.exports, { registret: () => Object.fromEntries([...register].map(([k, v]) => [k, kopia(v)])), last, historik: () => kopia(las().historik) });
