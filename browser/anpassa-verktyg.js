// Anpassa › verktyg (huvudprocessen): verktygsfältet och adressfältet.
//  - registrerar nycklarna verktyg.* i Anpassa-butiken (anpassa.js)
//  - visar högerklicksmenyn för verktygsraden (Anpassa verktygsfältet…, Ta bort, bokmärkesfältet, placering)
//  - håller webbsidan på rätt plats när verktygsraden ligger längst ner, även medan fönstret ändrar storlek
//
// Fönstrets sida finns i ui/anpassa-verktyg.js. Inget här är barnlåst: det är rena utseendeval
// (ordning på knappar, var raden ligger, hur adressen visas) som inte kan kringgå några spärrar.
const { ipcMain, Menu, app } = require('electron');

const BOKMARKEN = new Set(['alltid', 'nyflik', 'aldrig']);
let anp = null;          // anpassa.js
let wins = null;         // main.js: skalets webContents-id → ctx
let tillamPa = null;     // main.js: applyBounds(ctx)
let T = (s, v) => require('./i18n-fyll').fyll(s, v);        // main.js: översättning

const nere = () => !!anp && anp.hamta('verktyg.placering') === 'nere';

// Nedladdnings- och lösenordsrutan: med raden längst ner läggs rutan ovanför raden (nära knapparna) i stället för överst.
function popupY(ctx, topp, hojd) {
  try {
    if (!nere() || !ctx || !ctx.bounds) return topp;
    const b = ctx.bounds;
    return Math.max(Math.round(b.y + 6), Math.round(b.y + b.height - hojd - 6));
  } catch { return topp; }
}

// Fönstret ändrar storlek: med raden längst ner skulle webbsidan (som ritas ovanpå skalet) annars täcka
// raden tills skalet hunnit mäta om. Räkna fram ytan direkt från fönstrets nya mått och kanterna skalet
// rapporterat (verktygsrad + ev. bokmärkesfält under sidan). Skalets egen mätning kommer strax efter och är densamma.
function folj(win) {
  const id = win.webContents.id;
  win.on('resize', () => {
    try {
      const ctx = wins && wins.get(id);
      const k = ctx && ctx.anpKanter;
      if (!ctx || !k || !nere() || !ctx.bounds || win.isDestroyed()) return;
      const cb = win.getContentBounds();
      const b = ctx.bounds;
      const width = Math.max(0, cb.width - b.x - k.hoger);
      const height = Math.max(0, cb.height - b.y - k.under);
      if (width === b.width && height === b.height) return;
      ctx.bounds = { x: b.x, y: b.y, width, height };
      if (tillamPa) tillamPa(ctx);
    } catch {}
  });
}

function bygg(e, info) {
  const ctx = wins && wins.get(e.sender.id); if (!ctx || !ctx.win || ctx.win.isDestroyed()) return;
  const val = (atgard, varde) => () => { try { if (!e.sender.isDestroyed()) e.sender.send('anpassa-verktyg:val', { atgard, varde }); } catch {} };
  const i = info && typeof info === 'object' ? info : {};
  const namn = String(i.namn || '').slice(0, 40);
  const bm = BOKMARKEN.has(i.bokmarken) ? i.bokmarken : 'alltid';
  const t = [];
  if (i.anpassar) {
    t.push({ label: T('Klar med anpassningen'), click: val('klar') });
  } else {
    if (i.knapp && i.kanTasBort && namn) t.push({ label: T('Ta bort från verktygsfältet: {x}', { x: namn }), click: val('ta-bort', String(i.knapp).slice(0, 40)) });
    t.push({ label: T('Anpassa verktygsfältet…'), click: val('anpassa') });
  }
  t.push({ type: 'separator' });
  t.push({ label: T('Bokmärkesfältet'), submenu: [
    { label: T('Visa alltid'), type: 'radio', checked: bm === 'alltid', click: val('bokmarken', 'alltid') },
    { label: T('Bara på ny flik'), type: 'radio', checked: bm === 'nyflik', click: val('bokmarken', 'nyflik') },
    { label: T('Aldrig'), type: 'radio', checked: bm === 'aldrig', click: val('bokmarken', 'aldrig') },
  ] });
  t.push({ label: T('Adressfältet längst ner'), type: 'checkbox', checked: nere(), click: val('placering', nere() ? 'uppe' : 'nere') });
  t.push({ type: 'separator' });
  t.push({ label: T('Återställ verktygsfältet'), enabled: !!i.andrat, click: val('aterstall') });
  Menu.buildFromTemplate(t).popup({ window: ctx.win });
}

function init(o) {
  anp = o.anpassa; wins = o.wins; tillamPa = o.applyBounds;
  if (typeof o.T === 'function') T = o.T;
  anp.registrera({ nyckel: 'verktyg.knappar', standard: null, etikett: 'Verktygsfältets knappar' });            // { ordning: [id…], dolda: [id…] }, null = standard
  anp.registrera({ nyckel: 'verktyg.adress', standard: 'hel', etikett: 'Adressfältet: hela adressen eller domänen', val: ['hel', 'doman'] });   // 'hel' | 'doman'
  anp.registrera({ nyckel: 'verktyg.doljSchema', standard: true, etikett: 'Dölj https:// och www.' });
  anp.registrera({ nyckel: 'verktyg.placering', standard: 'uppe', etikett: 'Adressfältets placering', val: ['uppe', 'nere'] });          // 'uppe' | 'nere'
  anp.registrera({ nyckel: 'verktyg.bokmarkesfalt', standard: 'alltid', etikett: 'Bokmärkesfältet', val: ['alltid', 'nyflik', 'aldrig'] });          // 'alltid' | 'nyflik' | 'aldrig'

  ipcMain.on('anpassa-verktyg:meny', (e, info) => { try { bygg(e, info); } catch (err) { console.warn('[anpassa-verktyg] meny', err && err.message); } });
  // Skalet rapporterar avståndet från webbytans under- och högerkant till fönstrets kant (CSS-px = DIP i skalet)
  ipcMain.on('anpassa-verktyg:kanter', (e, k) => {
    const ctx = wins && wins.get(e.sender.id); if (!ctx) return;
    const tal = (v) => Math.max(0, Math.min(4000, Math.round(Number(v) || 0)));
    ctx.anpKanter = { under: tal(k && k.under), hoger: tal(k && k.hoger) };
  });
  app.on('browser-window-created', (_e, win) => { try { folj(win); } catch {} });
}

module.exports = { init, popupY };
