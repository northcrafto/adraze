'use strict';
/* Laddar vår egen C++-adblockmotor (native/adblock) och matar den med rålistorna (EasyList m.fl.).
 * Motorn matchar nätverksregler i full Adblock Plus-syntax i maskinkod — mycket mer komplett och
 * snabbare än den gamla JS/DNR-matchningen. Kan inte byggas/laddas? Då faller webbläsaren tillbaka
 * på JS-matchningen av sig själv (motor = null). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  // listDir = mappen med listorna som följer med appen. extraDir = nyhämtade listor (userData), vinner
  // per fil när de finns – annars den medskickade.
  // listor = vilka listfiler som ska med (standard: LISTOR), egna = användarens egna filter (text)
  constructor(listDir, cacheFil, extraDir, listor, egna) {
    this.listDir = listDir;
    this.extraDir = extraDir || null;
    this.listor = Array.isArray(listor) && listor.length ? listor : LISTOR;
    this.egna = egna || '';
    this.cacheFil = cacheFil || null;   // diskcache (userData), hoppar över omtolkning vid oförändrade listor
    this.motor = null;
    this.antal = 0;
  }
  listFil(fil) {
    if (this.extraDir) { const p = path.join(this.extraDir, fil); try { if (fs.statSync(p).size > 0) return p; } catch {} }
    return path.join(this.listDir, fil);
  }
  // Nyckel som ändras så fort någon lista ändras (namn + storlek + ändringstid + motorversion)
  cacheKey() {
    const h = crypto.createHash('sha1'); h.update('v1');
    h.update('egna:' + this.egna);
    for (const fil of this.listor) {
      try { const p = this.listFil(fil), s = fs.statSync(p); h.update(p + ':' + s.size + ':' + Math.round(s.mtimeMs)); }
      catch { h.update(fil + ':0'); }
    }
    return h.digest('hex');
  }
  // Läs tillbaka från cachen om nyckeln stämmer. true = motorn fylld ur cachen.
  laddaCache(m, key) {
    try {
      if (!this.cacheFil || fs.readFileSync(this.cacheFil + '.meta', 'utf8').trim() !== key) return false;
      return m.deserialisera(fs.readFileSync(this.cacheFil));
    } catch { return false; }
  }
  sparaCache(m, key) {
    if (!this.cacheFil) return;
    try {
      fs.mkdirSync(path.dirname(this.cacheFil), { recursive: true });
      const tmp = this.cacheFil + '.tmp';
      fs.writeFileSync(tmp, m.serialisera());     // skriv + byt namn = aldrig en halv fil
      fs.renameSync(tmp, this.cacheFil);
      fs.writeFileSync(this.cacheFil + '.meta', key);
    } catch (e) { console.warn('[adblock] kunde inte spara cache:', String(e && e.message || e)); }
  }
  // true om motorn gick att ladda och fick regler
  bygg() {
    let mod;
    try { mod = ladda(); } catch (e) { console.warn('[adblock] C++-motor kunde inte laddas:', String(e && e.message || e)); return false; }
    if (!mod || !mod.Adblock) { console.warn('[adblock] C++-motor saknas — faller tillbaka på JS-matchning'); return false; }
    try {
      const m = new mod.Adblock();
      const t0 = Date.now();
      const key = this.cacheKey();
      if (this.laddaCache(m, key) && m.antal()) {
        this.antal = m.antal(); this.motor = m;
        console.log('[adblock] C++-motor (cache): ' + this.antal + ' filter på ' + (Date.now() - t0) + ' ms');
        return true;
      }
      for (const fil of this.listor) {
        let text; try { text = fs.readFileSync(this.listFil(fil), 'utf8'); } catch { continue; }
        try { m.laggLista(text); } catch (e) { console.warn('[adblock] lista', fil, String(e)); }
      }
      if (this.egna.trim()) { try { m.laggLista(this.egna); } catch (e) { console.warn('[adblock] egna filter', String(e)); } }
      this.antal = m.antal();
      if (!this.antal) { console.warn('[adblock] C++-motor fick inga regler (saknas listorna?)'); return false; }
      this.motor = m;
      console.log('[adblock] C++-motor: ' + this.antal + ' filter på ' + (Date.now() - t0) + ' ms');
      this.sparaCache(m, key);
      return true;
    } catch (e) { console.warn('[adblock] C++-motor fel:', String(e && e.message || e)); return false; }
  }
  // Scriptlets (##+js) som gäller en värd — array av strängar ("namn, arg1, …")
  scriptletsFor(host) {
    if (!this.motor || !this.motor.scriptlets) return [];
    try { return this.motor.scriptlets(host || '') || []; } catch { return []; }
  }
  // Returnerar { block, redirect } — redirect = resursnamn ('' = ren blockering). typ = Electrons
  // resourceType; tredjePart = begäran går till annan sajt än källan.
  blockera(url, srcHost, typ, tredjePart) {
    if (!this.motor) return { block: false, redirect: '' };
    try { return this.motor.matcha(url || '', srcHost || '', typ || 'other', !!tredjePart); }
    catch { return { block: false, redirect: '' }; }
  }
}

module.exports = { AdblockMotor, LISTOR };
