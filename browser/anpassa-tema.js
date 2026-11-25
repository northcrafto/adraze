// Anpassa-området "tema" i huvudprocessen. Registrerar tema.*-nycklarna i den gemensamma butiken (anpassa.js)
// och sköter de två saker som inte går att göra i fönstret:
//   1. Macens trafikljus flyttas så att de hamnar mitt i flikraden när densiteten ändrar dess höjd.
//   2. Engångsflytt av det gamla valet "Mörkt" (localStorage skoll-theme) in i tema.lage, utan att det
//      hamnar i ångra-historiken (annars kunde Ångra plötsligt byta tema).
// Allt annat (färger, läge, typsnitt, hörn) tillämpas i fönstret av ui/anpassa-tema.js.
const { app, ipcMain, BrowserWindow, nativeTheme } = require('electron');
const anpassa = require('./anpassa');

// Rena utseendeval: barn får ändra dem (barnLast: false) och de får delas med en kod (importBar).
// val = de värden som finns (samma som i ui/anpassa-tema.js) – Falk ändrar bara till något av dem.
const NYCKLAR = [
  { nyckel: 'tema.accent', standard: '#ff4b1f', etikett: 'Accentfärg' },
  { nyckel: 'tema.lage', standard: 'ljust', etikett: 'Ljust eller mörkt', val: ['ljust', 'morkt', 'system'] },
  // Webbsidornas eget mörka läge (prefers-color-scheme). 'morka' = alltid, 'tema' = som AdRaze, 'ljusa' = aldrig.
  { nyckel: 'tema.sajter', standard: 'morka', etikett: 'Webbsidor', val: ['morka', 'tema', 'ljusa'] },
  { nyckel: 'tema.densitet', standard: 'normal', etikett: 'Densitet', val: ['kompakt', 'normal', 'luftig'] },
  { nyckel: 'tema.horn', standard: 'normal', etikett: 'Hörn', val: ['kantig', 'normal', 'rund'] },
  { nyckel: 'tema.typsnitt', standard: 'system', etikett: 'Typsnitt', val: ['system', 'klassisk', 'tydlig', 'serif', 'mono'] },
  { nyckel: 'tema.storlek', standard: 'normal', etikett: 'Textstorlek', val: ['liten', 'normal', 'stor'] },
  // Färguppsättning för själva ytorna (flikrad, verktygsrad, inställningar). 'jul' = mörkgrönt och djuprött (ui/jul.css),
  // gäller i mörkt läge. Sätts av det färdiga temat Jul och av julfärgerna under julen (jul.js).
  { nyckel: 'tema.palett', standard: 'standard', etikett: 'Färguppsättning', val: ['standard', 'jul'] },
];
for (const n of NYCKLAR) anpassa.registrera({ ...n, barnLast: false, importBar: true });

// Flikradens höjd per densitet (samma mått som "Anpassa: tema" i ui/input.css). Trafikljusen är 16 px höga.
const FLIKRAD = { kompakt: 36, normal: 44, luftig: 50 };
const arSkal = (w) => { try { return !w.isDestroyed() && /\/ui\/shell\.html(\?|#|$)/.test(w.webContents.getURL()); } catch { return false; } };
function trafikljus(w) {
  if (process.platform !== 'darwin' || !w || typeof w.setWindowButtonPosition !== 'function' || !arSkal(w)) return;
  const h = FLIKRAD[anpassa.hamta('tema.densitet')] || FLIKRAD.normal;
  try { w.setWindowButtonPosition({ x: 14, y: Math.round((h - 16) / 2) }); } catch {}
}
if (process.platform === 'darwin') {
  app.on('browser-window-created', (_e, w) => { w.webContents.once('did-finish-load', () => trafikljus(w)); });
  anpassa.lyssna((nyckel) => { if (nyckel === 'tema.densitet') for (const w of BrowserWindow.getAllWindows()) trafikljus(w); });
}

// Fönstret skickar 'morkt' första gången det startar med den nya koden, om tema.lage aldrig satts – en enda gång per
// profil (ui/anpassa-tema.js sätter ett märke). Bara skalet når kanalen (IPC-vakten i main.js), och bara ett osatt värde skrivs.
ipcMain.on('anpassa-tema:flytta-lage', (_e, lage) => {
  if (lage !== 'morkt' || anpassa.alla()['tema.lage'] !== undefined) return;
  anpassa.satt('tema.lage', 'morkt', { utanHistorik: true });
});

/* ── Webbsidornas eget mörka läge ──
 * Sajter som har en mörk version väljer den när webbläsaren säger prefers-color-scheme: dark, precis som i Chrome
 * med mörkt system. Det styrs för hela appen med nativeTheme.themeSource, så det gäller från första bildrutan i alla
 * flikar, popupfönster och service workers. Det här är INTE den tvingade mörkläggningen per sajt (anpassa-sajt.js).
 * Eftersom themeSource också ändrar vad skalet ser i matchMedia sparas datorns riktiga läge här, och skalet frågar
 * efter det (anpassa-tema:system-morkt) när tema.lage är "system". */
let systemMorkt = false;
const skickaSystem = () => { for (const w of BrowserWindow.getAllWindows()) { try { if (arSkal(w)) w.webContents.send('anpassa-tema:system', systemMorkt); } catch {} } };
function satSajter() {
  const s = anpassa.hamta('tema.sajter'), l = anpassa.hamta('tema.lage');
  const mal = s === 'ljusa' ? 'light' : s === 'tema' ? (l === 'morkt' ? 'dark' : l === 'system' ? 'system' : 'light') : 'dark';
  try { if (nativeTheme.themeSource !== mal) nativeTheme.themeSource = mal; } catch {}
}
app.whenReady().then(() => {
  try { systemMorkt = !!nativeTheme.shouldUseDarkColors; } catch {}   // läses medan themeSource ännu är 'system'
  nativeTheme.on('updated', () => {
    if (nativeTheme.themeSource !== 'system') return;   // styrt av oss: säger inget om datorn
    const nu = !!nativeTheme.shouldUseDarkColors;
    if (nu !== systemMorkt) { systemMorkt = nu; skickaSystem(); }
  });
  satSajter();
  anpassa.lyssna((nyckel) => { if (nyckel === 'tema.sajter' || nyckel === 'tema.lage' || nyckel == null) satSajter(); });
});
ipcMain.on('anpassa-tema:system-morkt', (e) => { e.returnValue = systemMorkt; });

module.exports = { NYCKLAR, systemMorkt: () => systemMorkt };
