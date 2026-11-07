// Anpassa › Arbetsytor (huvudprocessen). Själva arbetsytorna sköts i skalet (ui/anpassa-arbetsytor.js);
// här registreras nycklarna och här läggs flikar "vilande": en flik i en arbetsyta får bara sin adress sparad
// (samma som en kastad flik i minnesbesparingen) och laddas först när du klickar på den – i fönstrets eget konto.
// Barnspärren gäller som vanligt när den laddas (filtret i huvudprocessen stoppar spärrade sidor i alla sessioner).
const { ipcMain } = require('electron');
const anpassa = require('./anpassa');

// Listan är gemensam (namn, ikon, färg). Flikarna sparas per fönster och konto i skalet, aldrig här – de följer
// alltså inte med i en delningskod. Barn får använda arbetsytor (inget barnlås): spärrarna gäller i alla.
anpassa.registrera({ nyckel: 'arbetsytor.lista', standard: [{ id: 'hem', namn: 'Hem', ikon: 'hem', farg: '#0e2a47' }], etikett: 'Arbetsytor' });
anpassa.registrera({ nyckel: 'arbetsytor.vaxlare', standard: true, etikett: 'Väljaren för arbetsytor' });

// Huvudmenyn (≡) › Arbetsytor: byt i det här fönstret, ny, hantera. Inte i inkognitofönster.
function menyRader(ctx, T = (s) => s) {
  if (!ctx || ctx.incognito || !ctx.win || ctx.win.isDestroyed()) return [];
  const l = anpassa.hamta('arbetsytor.lista');
  const ytor = (Array.isArray(l) ? l : []).filter((y) => y && typeof y === 'object' && y.id).slice(0, 30);
  const skicka = (v) => { try { if (!ctx.win.isDestroyed()) ctx.win.webContents.send('arbetsytor:byt', v); } catch {} };
  const aktiv = ctx.arbetsyta || (ytor[0] && ytor[0].id);
  return [{ label: T('Arbetsytor'), submenu: [
    ...ytor.map((y) => ({ label: String(y.namn || '').slice(0, 40) || T('Arbetsyta'), type: 'radio', checked: String(y.id) === aktiv, click: () => skicka(String(y.id).slice(0, 40)) })),
    { type: 'separator' },
    { label: T('Ny arbetsyta…'), click: () => skicka({ ny: true }) },
    { label: T('Hantera arbetsytor'), click: () => skicka({ hantera: true }) },
  ] }];
}

function init({ ctxFor, flikUrlOk }) {
  // Skalet berättar vilken arbetsyta fönstret står i (bocken i huvudmenyn)
  ipcMain.on('arbetsytor:aktiv', (e, id) => { const ctx = ctxFor(e); if (ctx && typeof id === 'string') ctx.arbetsyta = id.slice(0, 40); });
  // Skalet: lägg fliken vilande (ingen vy, ingen process) med den här adressen. Visas den hämtas sidan (view:show → rehydrate).
  ipcMain.on('arbetsytor:vilande', (e, tabId, url) => {
    const ctx = ctxFor(e); if (!ctx || ctx.incognito) return;
    const id = Number(tabId); url = String(url || '');
    if (!Number.isSafeInteger(id) || id <= 0 || url.length > 8192 || !flikUrlOk(url) || ctx.incognitoTabs.has(id)) return;
    // En gammal vy med samma id (skalet laddades om) hör inte till den här fliken – bort med den först
    const v = ctx.views.get(id);
    if (v) { try { ctx.win.contentView.removeChildView(v); } catch {} try { v.webContents.close(); } catch {} ctx.views.delete(id); ctx.lastActive.delete(id); if (ctx.visibleTab === id) ctx.visibleTab = null; }
    ctx.discarded.set(id, url);
  });
}

module.exports = { init, menyRader };
