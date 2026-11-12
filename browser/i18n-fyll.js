'use strict';
// Fyller i {platshållare} i en svensk mall: fyll('Tog bort {x}', { x: namn }). För text som huvudprocessen sparar eller
// skickar på svenska och som översätts först när den visas (ui/i18n.js känner igen "Tog bort YouTube" som nyckeln
// "Tog bort {x}"). Text som visas direkt i huvudprocessen (menyer, dialoger, notiser) går i stället genom T() i main.js.
// tools/i18n-extrahera.js samlar mallarna som nycklar.
function fyll(s, varden) {
  s = String(s == null ? '' : s);
  if (!varden) return s;
  return s.replace(/\{([a-z]\w*)\}/g, (m, n) => (Object.prototype.hasOwnProperty.call(varden, n) && varden[n] != null ? String(varden[n]) : m));
}
module.exports = { fyll };
