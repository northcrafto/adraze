'use strict';
/* Användarskript (Inställningar → Anpassa → Avancerat). Registreras i flikarnas sessioner bara när det finns
 * påslagna skript (se anpassa-avancerat.js) och körs i varje ram före sidans egna skript.
 * Huvudprocessen avgör vilka skript ramen får – utifrån ramens adress som den själv känner till, barnläge,
 * inkognito och känsliga sidor. Här körs koden bara, i en EGEN isolerad värld: sidan kommer inte åt skriptet,
 * och skriptet kommer inte åt Node, den här preloadens värld (ipcRenderer) eller AdRazes API:er. */
const { ipcRenderer, webFrame } = require('electron');

(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  let svar = null;
  try { svar = ipcRenderer.sendSync('avancerat:skript'); } catch { return; }
  if (!svar || typeof svar.varld !== 'number') return;
  const varld = svar.varld;
  let namngiven = false;
  const kor = (s) => {
    if (!s || typeof s.kod !== 'string') return;
    if (!namngiven) { namngiven = true; try { webFrame.setIsolatedWorldInfo(varld, { name: 'AdRaze användarskript' }); } catch {} }
    try { webFrame.executeJavaScriptInIsolatedWorld(varld, [{ code: s.kod, url: String(s.url || '') }]).catch(() => {}); } catch {}
  };
  // "Tidigt" direkt (före sidans skript), övriga när dokumentet har laddats (DOMContentLoaded)
  const korAlla = (lista) => {
    if (!Array.isArray(lista) || !lista.length) return;
    const sena = lista.filter((s) => s && s.tid !== 'document-start');
    lista.filter((s) => s && s.tid === 'document-start').forEach(kor);
    if (!sena.length) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => sena.forEach(kor), { once: true });
    else sena.forEach(kor);
  };
  korAlla(svar.skript);
  // Sajter som byter sida utan att ladda om (SPA): huvudprocessen skickar skript som börjar gälla på nya adressen
  if (window === window.top) ipcRenderer.on('avancerat:spa', (_e, d) => { if (d && d.varld === varld) korAlla(d.skript); });
})();
