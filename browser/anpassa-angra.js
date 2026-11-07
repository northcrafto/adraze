// Anpassa › Ångra (huvudprocessen): ångra en hel grupp ändringar på en gång – en återställning, en import eller det
// Falk ändrade i ett och samma svar – och spara delningskoden med alla inställningar som fil.
// Används av Ångra-panelen i skalet (ui/anpassa-angra.js) och av Falk (anpassa-falk.js).
const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const anpassa = require('./anpassa');

const GRUPP_MS = 3000;   // ändringar i samma grupp ligger tätt (en återställning tar millisekunder, ett Falk-svar någon sekund)

// Vilken grupp en ändring hör till (null = ensam ändring)
function gruppAv(etikett) {
  const e = String(etikett || '');
  if (e.startsWith('Falk:')) return 'Falk';
  if (e.startsWith('Återställ') || e === 'Importerat') return e;
  return null;
}
// Etiketten ur registret ("Accentfärg"), annars historikens egen
function etikettFor(nyckel, reserv) {
  const reg = anpassa.registret();
  const r = reg[nyckel] || Object.entries(reg).find(([k]) => k.endsWith('.*') && String(nyckel).startsWith(k.slice(0, -1)))?.[1];
  let e = (r && r.etikett) || String(reserv || nyckel || '');
  if (e.startsWith('Falk:')) e = e.slice(5).trim();
  return e;
}
// Hur många av de senaste ändringarna (de som går att ångra just nu) som hör ihop
function gruppStorlek() {
  const h = anpassa.historik().filter((x) => x && !anpassa.last(x.nyckel));
  if (!h.length) return 0;
  const g = gruppAv(h[h.length - 1].etikett);
  if (!g) return 1;
  let n = 1;
  for (let i = h.length - 2; i >= 0; i--) {
    if (gruppAv(h[i].etikett) !== g || h[i + 1].ts - h[i].ts > GRUPP_MS) break;
    n++;
  }
  return n;
}
// Ångra senaste ändringen – eller hela gruppen den hör till
function angraGrupp() {
  const n = gruppStorlek();
  const gjort = [];
  for (let i = 0; i < n; i++) { const r = anpassa.angra(); if (!r || !r.ok) break; gjort.push(r); }
  if (!gjort.length) return { ok: false, error: 'tomt' };
  const etiketter = [...new Set(gjort.map((r) => etikettFor(r.nyckel, r.etikett)))];
  return { ok: true, antal: gjort.length, nycklar: gjort.map((r) => r.nyckel), etiketter };
}

function init() {
  ipcMain.handle('anpassa-angra:angra', () => angraGrupp());
  // Spara alla inställningar som fil. Koden tas fram här (inte i fönstret) och du väljer var filen hamnar.
  ipcMain.handle('anpassa-angra:spara-fil', async (e) => {
    const kod = anpassa.exportera();
    const win = BrowserWindow.fromWebContents(e.sender) || undefined;
    let r; try { r = await dialog.showSaveDialog(win, { title: 'Spara dina inställningar', defaultPath: 'adraze-anpassning.txt', filters: [{ name: 'Text', extensions: ['txt'] }] }); } catch { return { ok: false }; }
    if (!r || r.canceled || !r.filePath) return { ok: false, avbrutet: true };
    try { fs.writeFileSync(r.filePath, kod + '\n'); } catch (err) { return { ok: false, fel: String(err && err.message || err).slice(0, 120) }; }
    return { ok: true, fil: path.basename(r.filePath) };
  });
}

module.exports = { init, angraGrupp, gruppStorlek, etikettFor, gruppAv };
