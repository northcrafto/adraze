// Anpassa: temagalleriet i huvudprocessen (fönstrets del: ui/anpassa-galleri.js, servern: adraze-api/galleri.js).
// Alla anrop går till ADRAZE_API via adrazeApi() i main.js; skalet skickar med kontots token per anrop (som family:*).
//
// "Prova" lägger på ett tema från galleriet direkt, utan historik. "Behåll" skriver ändringen i Anpassas historik
// (så att Ångra under Anpassa kan backa den) och räknar en nedladdning. "Ångra" sätter tillbaka EXAKT de tema.*-värden
// man hade innan man började prova. Avbryts provningen (krasch, omstart) återställs de vid nästa start.
//
// Bara det som går att dela följer med åt båda hållen: tema.*-nycklar med hex-färger, sant/falskt eller kända val.
// Sådant som inte kan delas (t.ex. en egen bakgrundsbild) rörs aldrig, varken när man provar eller publicerar.
// Barnläge: bläddra, prova och gilla går; publicera går inte. Galleriet kan stängas av (galleri.visa, barnlåst).
'use strict';
const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

const PROV_FIL = () => path.join(app.getPath('userData'), 'adraze-galleri-prov.json');
const ID_RE = /^t[0-9a-f]{20}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const NYCKEL_RE = /^tema\.[a-z][a-zA-Z0-9]{0,39}$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const VAL_RE = /^[a-z][a-z0-9-]{0,23}$/;   // ett val (enum); servern avgör vilka som finns

let anpassa = null, api = null, barnKoll = () => false, skickaAlla = () => {};
let prov = null;                     // { id, namn, skapare, varden, fore } medan ett tema provas
let schema = null, schemaTid = 0;    // /galleri/schema: vilka val servern känner till

const kopia = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const tok = (d) => (d && typeof d.token === 'string' && TOKEN_RE.test(d.token) ? d.token : null);
const avstangt = () => anpassa.hamta('galleri.visa') === false;
const AV = { ok: false, error: 'av', message: 'Temagalleriet är avstängt.' };

function temaNu() { return Object.fromEntries(Object.entries(anpassa.alla()).filter(([k]) => k.startsWith('tema.'))); }
// Får värdet följa med ett delat tema? Med servers schema (val) krävs ett känt val; utan det räcker formen.
function delbart(k, v, val) {
  if (typeof k !== 'string' || !NYCKEL_RE.test(k)) return false;
  if (typeof v === 'string' && HEX_RE.test(v)) return true;
  if (typeof v === 'boolean') return true;
  if (typeof v !== 'string' || !VAL_RE.test(v)) return false;
  return val ? !!(Object.hasOwn(val, k) && Array.isArray(val[k]) && val[k].includes(v)) : true;
}
// Mitt tema som det kan delas (via Anpassas export, så samma urval som delningskoden)
function delbartTema(val) {
  let alla = {};
  try { alla = JSON.parse(Buffer.from(anpassa.exportera('tema.').slice(6), 'base64url').toString('utf8')) || {}; } catch {}
  const varden = {}; let utanfor = 0;
  for (const k of Object.keys(alla).sort()) { if (delbart(k, alla[k], val)) varden[k] = alla[k]; else utanfor++; }
  return { varden, antal: Object.keys(varden).length, utanfor };
}
async function hamtaSchema() {
  if (schema && Date.now() - schemaTid < 3_600_000) return schema;
  const j = await api('/galleri/schema', null, null, 'GET');
  if (j && j.ok && j.val && typeof j.val === 'object') { schema = j; schemaTid = Date.now(); }
  return schema;
}

// Sätter de delbara tema.*-värdena till exakt `mal`: delbara värden som inte finns i målet går tillbaka till standard
// (med serverns val, så att t.ex. ett eget val som inte går att dela får vara kvar)
function tillampa(mal, opts, val) {
  for (const [k, v] of Object.entries(temaNu())) if (!(k in mal) && delbart(k, v, val)) anpassa.satt(k, undefined, opts);
  for (const [k, v] of Object.entries(mal)) anpassa.satt(k, v, opts);
}
// Tillbaka till exakt `fore` (alla tema.*-nycklar, även de som inte kan delas)
function aterstallExakt(fore) {
  for (const k of Object.keys(temaNu())) if (!(k in fore)) anpassa.satt(k, undefined, { utanHistorik: true });
  for (const [k, v] of Object.entries(fore)) if (k.startsWith('tema.')) anpassa.satt(k, v, { utanHistorik: true });
}
function sparaProv() {
  try {
    const f = PROV_FIL();
    if (!prov) { fs.rmSync(f, { force: true }); return; }
    fs.writeFileSync(f + '.tmp', JSON.stringify({ fore: prov.fore }));
    fs.renameSync(f + '.tmp', f);
  } catch (e) { console.warn('[galleri] kunde inte spara provningen', e.message); }
}
const provUt = () => (prov ? { id: prov.id, namn: prov.namn, skapare: prov.skapare, varden: kopia(prov.varden) } : null);
function skickaProv() { try { skickaAlla('galleri:prov', provUt()); } catch {} }

function angraProv() {
  if (!prov) return;
  const fore = prov.fore; prov = null; sparaProv();
  aterstallExakt(fore);
  skickaProv();
}

function init({ anpassa: a, adrazeApi, barnNagonstans, skicka }) {
  anpassa = a; api = adrazeApi;
  if (typeof barnNagonstans === 'function') barnKoll = barnNagonstans;
  if (typeof skicka === 'function') skickaAlla = skicka;

  anpassa.registrera({ nyckel: 'galleri.visa', standard: true, etikett: 'Visa temagalleriet', barnLast: true });
  anpassa.registrera({ nyckel: 'galleri.visaNamn', standard: true, etikett: 'Visa mitt användarnamn i galleriet' });

  // En provning som avbröts (krasch, omstart) återställs innan något fönster öppnas
  try {
    const f = JSON.parse(fs.readFileSync(PROV_FIL(), 'utf8'));
    if (f && f.fore && typeof f.fore === 'object' && !Array.isArray(f.fore)) aterstallExakt(f.fore);
  } catch {}
  try { fs.rmSync(PROV_FIL(), { force: true }); } catch {}

  ipcMain.handle('galleri:lista', async (_e, d) => {
    if (avstangt()) return AV;
    d = d || {};
    const sort = ['populara', 'nya', 'vecka'].includes(d.sort) ? d.sort : 'populara';
    const sida = Math.max(0, Math.min(200, parseInt(d.sida, 10) || 0));
    return api(`/galleri/lista?sort=${sort}&sida=${sida}${barnKoll() ? '&barn=1' : ''}`, null, tok(d), 'GET');
  });
  ipcMain.handle('galleri:mina', (_e, d) => (tok(d) ? api('/galleri/mina', null, tok(d), 'GET') : { ok: false, error: 'no_session', message: 'Logga in först.' }));
  ipcMain.handle('galleri:rosta', (_e, d) => {
    if (!d || !ID_RE.test(String(d.id)) || ![1, -1, 0].includes(d.rost)) return { ok: false, message: 'Ogiltig röst.' };
    if (!tok(d)) return { ok: false, error: 'no_session', message: 'Logga in för att gilla teman.' };
    return api('/galleri/rosta', { id: d.id, rost: d.rost }, tok(d));
  });
  ipcMain.handle('galleri:anmal', (_e, d) => {
    if (!d || !ID_RE.test(String(d.id))) return { ok: false, message: 'Temat finns inte.' };
    if (!tok(d)) return { ok: false, error: 'no_session', message: 'Logga in för att anmäla.' };
    return api('/galleri/anmal', { id: d.id, orsak: ['olampligt', 'spam', 'annat'].includes(d.orsak) ? d.orsak : 'annat' }, tok(d));
  });
  ipcMain.handle('galleri:ta-bort', (_e, d) => {
    if (!d || !ID_RE.test(String(d.id)) || !tok(d)) return { ok: false, message: 'Temat finns inte.' };
    return api('/galleri/ta-bort', { id: d.id }, tok(d));
  });

  ipcMain.handle('galleri:prov', () => provUt());
  ipcMain.handle('galleri:prova', async (_e, d) => {
    if (avstangt()) return AV;
    if (!d || !ID_RE.test(String(d.id))) return { ok: false, message: 'Temat finns inte.' };
    const j = await api(`/galleri/tema?id=${d.id}${barnKoll() ? '&barn=1' : ''}`, null, tok(d), 'GET');
    if (!j.ok) return j;
    const val = ((await hamtaSchema()) || {}).val;
    const t = j.tema || {};
    const varden = {};
    for (const [k, v] of Object.entries(t.varden && typeof t.varden === 'object' ? t.varden : {})) if (delbart(k, v, val)) varden[k] = v;
    if (!Object.keys(varden).length) return { ok: false, message: 'Temat gick inte att använda.' };
    if (!prov) prov = { fore: temaNu() };   // bilden av hur det var tas när man BÖRJAR prova; byter man tema behålls den
    Object.assign(prov, { id: t.id, namn: String(t.namn || '').slice(0, 60), skapare: t.skapare ? String(t.skapare).slice(0, 40) : null, varden });
    sparaProv();
    tillampa(varden, { utanHistorik: true }, val);
    skickaProv();
    return { ok: true, prov: provUt() };
  });
  ipcMain.handle('galleri:behall', (_e, d) => {
    if (!prov) return { ok: false, message: 'Inget tema provas just nu.' };
    const p = prov; prov = null; sparaProv();
    // Historiken: varje ändrad nyckel skrivs som fore → nu, så att Ångra under Anpassa kan backa temat
    const nu = temaNu(), etikett = 'Tema från galleriet: ' + p.namn;
    for (const k of new Set([...Object.keys(p.fore), ...Object.keys(nu)])) {
      if (JSON.stringify(p.fore[k]) === JSON.stringify(nu[k])) continue;
      anpassa.satt(k, p.fore[k], { utanHistorik: true });
      anpassa.satt(k, nu[k], { etikett });
    }
    skickaProv();
    Promise.resolve(api('/galleri/nedladdad', { id: p.id }, tok(d))).catch(() => {});   // räknaren i galleriet
    return { ok: true };
  });
  ipcMain.handle('galleri:angra', () => { angraProv(); return { ok: true }; });

  ipcMain.handle('galleri:mitt', async () => {
    const s = await hamtaSchema();
    return { ok: true, ...delbartTema(s && s.val), provar: !!prov, barn: !!barnKoll(), schema: !!s };
  });
  ipcMain.handle('galleri:publicera', async (_e, d) => {
    d = d || {};
    if (barnKoll()) return { ok: false, error: 'barnlage', message: 'Teman kan inte publiceras i barnläge.' };
    if (prov) return { ok: false, message: 'Välj Behåll eller Ångra för temat du provar först.' };
    const token = tok(d);
    if (!token) return { ok: false, error: 'no_session', message: 'Logga in för att publicera.' };
    const s = await hamtaSchema();
    if (!s) return { ok: false, error: 'unreachable', message: 'Kunde inte nå galleriet. Kontrollera din uppkoppling.' };
    const m = delbartTema(s.val);
    if (!m.antal) return { ok: false, message: 'Ditt tema är som standardtemat. Ändra något under Tema först.' };
    const kod = 'ADRZ1.' + Buffer.from(JSON.stringify(m.varden)).toString('base64url');
    return api('/galleri/publicera', { namn: String(d.namn || '').slice(0, 200), beskrivning: String(d.beskrivning || '').slice(0, 600), kod, anonym: d.anonym === true }, token);
  });
}

module.exports = { init, delbart };
