'use strict';
/* Laddar vår egen C++-adblockmotor (native/adblock) och matar den med rålistorna (EasyList m.fl.).
 * Motorn matchar nätverksregler i full Adblock Plus-syntax i maskinkod — mycket mer komplett och
 * snabbare än den gamla JS/DNR-matchningen. Kan inte byggas/laddas? Då faller webbläsaren tillbaka
 * på JS-matchningen av sig själv (motor = null). */
const fs = require('fs');
const path = require('path');

// Rålistor som motorn äter (ligger i adraze/lists/, kopieras dit av tools/sync-adraze.sh)
const LISTOR = [
  'easylist.txt', 'easyprivacy.txt', 'ubo-filters.txt', 'peterlowe.txt',
  'frellwit.txt', 'badware.txt', 'adguard-popups.txt', 'adraze-natverk.txt',
];

function ladda() {
  // require av en .node funkar både i utveckling och i paketerad app (asarUnpack sköter uppackningen)
  const kandidater = [
    path.join(__dirname, 'native', 'adblock', 'build', 'Release', 'adblock_core.node'),
    path.join(__dirname, 'native', 'adblock', 'build', 'Debug', 'adblock_core.node'),
  ];
  for (const p of kandidater) {
    try { if (fs.existsSync(p)) return require(p); } catch (e) { /* prova nästa */ }
  }
  return null;
}

class AdblockMotor {
  constructor(listDir) {
    this.listDir = listDir;
    this.motor = null;
    this.antal = 0;
  }
  // true om motorn gick att ladda och fick regler
  bygg() {
    let mod;
    try { mod = ladda(); } catch (e) { console.warn('[adblock] C++-motor kunde inte laddas:', String(e && e.message || e)); return false; }
    if (!mod || !mod.Adblock) { console.warn('[adblock] C++-motor saknas — faller tillbaka på JS-matchning'); return false; }
    try {
      const m = new mod.Adblock();
      const t0 = Date.now();
      for (const fil of LISTOR) {
        let text; try { text = fs.readFileSync(path.join(this.listDir, fil), 'utf8'); } catch { continue; }
        try { m.laggLista(text); } catch (e) { console.warn('[adblock] lista', fil, String(e)); }
      }
      this.antal = m.antal();
      if (!this.antal) { console.warn('[adblock] C++-motor fick inga regler (saknas listorna?)'); return false; }
      this.motor = m;
      console.log('[adblock] C++-motor: ' + this.antal + ' filter på ' + (Date.now() - t0) + ' ms');
      return true;
    } catch (e) { console.warn('[adblock] C++-motor fel:', String(e && e.message || e)); return false; }
  }
  // Returnerar { block, redirect } — redirect = resursnamn ('' = ren blockering). typ = Electrons
  // resourceType; tredjePart = begäran går till annan sajt än källan.
  blockera(url, srcHost, typ, tredjePart) {
    if (!this.motor) return { block: false, redirect: '' };
    try { return this.motor.matcha(url || '', srcHost || '', typ || 'other', !!tredjePart); }
    catch { return { block: false, redirect: '' }; }
  }
}

module.exports = { AdblockMotor };
