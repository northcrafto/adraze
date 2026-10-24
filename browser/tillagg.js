'use strict';
/* Chrome-tillägg i AdRaze: installera från Chrome Web Store (via tilläggs-id eller butikslänk),
 * lista, slå av/på och ta bort. Tilläggen packas upp under userData/adraze-extensions/<id> och
 * läses in i standardsessionen. Electron stöder det mesta av MV3 men inte allt — vi är ärliga om det. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, ipcMain, session, shell } = require('electron');
const extract = require('extract-zip');

let ROT = '';
let LISTA = '';           // JSON: { [id]: { namn, aktiv, installerad } }
function initPaths() {
  if (ROT) return;
  ROT = path.join(app.getPath('userData'), 'adraze-extensions');
  LISTA = path.join(ROT, 'lista.json');
  try { fs.mkdirSync(ROT, { recursive: true }); } catch {}
}
function lasLista() { try { return JSON.parse(fs.readFileSync(LISTA, 'utf8')) || {}; } catch { return {}; } }
function sparaLista(o) { try { fs.writeFileSync(LISTA, JSON.stringify(o)); } catch {} }

// Tilläggs-id ur en råtext (id eller butikslänk)
function pluckId(text) {
  const s = String(text || '').trim();
  const m = s.match(/([a-p]{32})/);
  return m ? m[1] : null;
}
function krMapp(id) { return path.join(ROT, id); }

// Ladda ner CRX:en från Chrome Web Store och packa upp den (CRX3 = "Cr24" + header + ZIP)
async function hamtaOchPacka(id) {
  const ver = process.versions.chrome || '120.0.0.0';
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${ver}&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('Kunde inte ladda ner tillägget (' + r.status + ').');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('Filen är inte ett giltigt tillägg.');
  const crxVer = buf.readUInt32LE(4);
  let zipStart;
  if (crxVer === 3) { const hlen = buf.readUInt32LE(8); zipStart = 12 + hlen; }
  else if (crxVer === 2) { const pub = buf.readUInt32LE(8), sig = buf.readUInt32LE(12); zipStart = 16 + pub + sig; }
  else throw new Error('Tilläggsformatet stöds inte.');
  const tmpZip = path.join(os.tmpdir(), 'adraze-crx-' + id + '-' + Date.now() + '.zip');
  fs.writeFileSync(tmpZip, buf.subarray(zipStart));
  const dir = krMapp(id);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(dir, { recursive: true });
  try { await extract(tmpZip, { dir }); } finally { try { fs.unlinkSync(tmpZip); } catch {} }
  // Chrome tål ett "_metadata"-fält i manifestet som Electron inte gillar — lämna det, Electron ignorerar
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('Tillägget saknar manifest.');
  return dir;
}

function sess() { return session.defaultSession; }
function exApi() { return sess().extensions || sess(); }   // Electron 43: session.extensions.*
// Electron räknar fram ett eget tilläggs-id ur mappen (inte butikens id) när nyckeln saknas,
// så vi matchar på det RIKTIGA id:t som loadExtension gav tillbaka (sparat som `vid`).
function laddadInfo(vid) {
  if (!vid) return null;
  try { return exApi().getAllExtensions().find((e) => e.id === vid) || null; } catch { return null; }
}
async function laddaIn(dir) { return exApi().loadExtension(dir, { allowFileAccess: true }); }
function taBortInladdad(vid) { if (!vid) return; try { exApi().removeExtension(vid); } catch {} }

// Läs in sparade, aktiva tillägg vid start
async function laddaSparade() {
  initPaths();
  const o = lasLista(); let andrat = false;
  for (const id of Object.keys(o)) {
    if (!o[id] || !o[id].aktiv) continue;
    const dir = krMapp(id);
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
    try { const e = await laddaIn(dir); o[id].namn = e.name || o[id].namn; o[id].vid = e.id; andrat = true; }
    catch (err) { console.warn('[tillägg] kunde inte läsa in', id, String(err)); }
  }
  if (andrat) sparaLista(o);
}

function listaUt() {
  const o = lasLista();
  return Object.keys(o).map((id) => {
    const inladdad = laddadInfo(o[id].vid);
    return {
      id, namn: (inladdad && inladdad.name) || o[id].namn || id,
      version: inladdad ? inladdad.version : '', aktiv: !!o[id].aktiv, kor: !!inladdad,
      butik: 'https://chrome.google.com/webstore/detail/' + id,
    };
  });
}

function setup() {
  initPaths();
  ipcMain.handle('ext:list', () => listaUt());

  ipcMain.handle('ext:add', async (_e, text) => {
    const id = pluckId(text);
    if (!id) return { ok: false, fel: 'Klistra in ett tilläggs-id eller en länk till Chrome Web Store.' };
    const o = lasLista();
    if (o[id] && laddadInfo(o[id].vid)) return { ok: false, fel: 'Tillägget är redan installerat.' };
    try {
      const dir = await hamtaOchPacka(id);
      const e = await laddaIn(dir);
      o[id] = { namn: e.name || id, aktiv: true, installerad: Date.now(), vid: e.id };
      sparaLista(o);
      return { ok: true, tillagg: { id, namn: e.name || id, version: e.version || '' } };
    } catch (err) {
      try { fs.rmSync(krMapp(id), { recursive: true, force: true }); } catch {}
      return { ok: false, fel: String(err.message || err) };
    }
  });

  ipcMain.handle('ext:toggle', async (_e, id, pa) => {
    const o = lasLista(); if (!o[id]) return { ok: false };
    try {
      if (pa) { const e = await laddaIn(krMapp(id)); o[id].aktiv = true; o[id].namn = e.name || o[id].namn; o[id].vid = e.id; }
      else { taBortInladdad(o[id].vid); o[id].aktiv = false; }
      sparaLista(o); return { ok: true };
    } catch (err) { return { ok: false, fel: String(err.message || err) }; }
  });

  ipcMain.handle('ext:remove', async (_e, id) => {
    const o = lasLista(); taBortInladdad(o[id] && o[id].vid); delete o[id]; sparaLista(o);
    try { fs.rmSync(krMapp(id), { recursive: true, force: true }); } catch {}
    return { ok: true };
  });

  ipcMain.on('ext:store', (_e, id) => { try { shell.openExternal(id ? 'https://chrome.google.com/webstore/detail/' + id : 'https://chromewebstore.google.com'); } catch {} });
}

module.exports = { setup, laddaSparade };
