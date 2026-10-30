'use strict';
/* Håller filterlistorna färska, som Brave/uBO. Listorna som följer med appen blir gamla på några
 * dagar – piratsajternas reklamnät byter domän (slumpade .cfd/.cyou m.fl.) varje dag, och EasyList
 * hinner ikapp på timmar. Hämtar nya listor vid start och var 6:e timme till userData/adraze-lists/.
 * En lista som inte går att hämta eller ser trasig ut rörs inte – då gäller den förra/medskickade. */
const fs = require('fs');
const path = require('path');

const KALLOR = {
  'easylist.txt': 'https://easylist.to/easylist/easylist.txt',
  'easyprivacy.txt': 'https://easylist.to/easylist/easyprivacy.txt',
  'ubo-filters.txt': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'badware.txt': 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
  'adguard-popups.txt': 'https://filters.adtidy.org/extension/ublock/filters/19.txt',
  'peterlowe.txt': 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
  'frellwit.txt': 'https://raw.githubusercontent.com/lassekongo83/Frellwits-filter-lists/master/Frellwits-Swedish-Filter.txt',
};
const INTERVALL = 6 * 3600 * 1000;

function lasMeta(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { return { filer: {} }; } }
function sparaMeta(dir, meta) { try { fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1)); } catch {} }

// En hämtad lista måste se ut som en filterlista och vara ungefär lika stor som den vi redan har
// (en halv nedladdning eller en felsida får aldrig ersätta 100 000 regler).
function rimlig(text, gammalStorlek) {
  if (!text || text.length < 1000) return false;
  if (/^\s*<(!doctype|html)/i.test(text.slice(0, 300))) return false;
  if (gammalStorlek && text.length < gammalStorlek * 0.4) return false;
  return true;
}

// Hämtar alla listor. Returnerar antalet listor som faktiskt ändrats.
async function hamta(dir, medskickadDir) {
  fs.mkdirSync(dir, { recursive: true });
  const meta = lasMeta(dir); meta.filer = meta.filer || {};
  let andrade = 0;
  for (const [fil, url] of Object.entries(KALLOR)) {
    const mal = path.join(dir, fil);
    const m = meta.filer[fil] || {};
    const har = fs.existsSync(mal);
    const huvud = { 'user-agent': 'AdRaze-listuppdatering' };
    if (har && m.etag) huvud['if-none-match'] = m.etag;
    if (har && m.lastModified) huvud['if-modified-since'] = m.lastModified;
    try {
      const r = await fetch(url, { headers: huvud, signal: AbortSignal.timeout(60000) });
      if (r.status === 304) continue;
      if (!r.ok) { console.warn('[listor]', fil, 'HTTP', r.status); continue; }
      const text = await r.text();
      let gammal = 0;
      try { gammal = fs.statSync(har ? mal : path.join(medskickadDir, fil)).size; } catch {}
      if (!rimlig(text, gammal)) { console.warn('[listor]', fil, 'ser trasig ut, behåller den gamla'); continue; }
      if (har && fs.readFileSync(mal, 'utf8') === text) continue;
      fs.writeFileSync(mal + '.tmp', text);     // skriv + byt namn = aldrig en halv lista
      fs.renameSync(mal + '.tmp', mal);
      meta.filer[fil] = { etag: r.headers.get('etag') || '', lastModified: r.headers.get('last-modified') || '', hamtad: Date.now() };
      andrade++;
    } catch (e) { console.warn('[listor]', fil, String(e && e.message || e)); }
  }
  meta.senast = Date.now();
  sparaMeta(dir, meta);
  return andrade;
}

/* Startar bakgrundsuppdateringen. onNya() anropas när minst en lista ändrats (motorn byggs om). */
function starta(dir, medskickadDir, onNya) {
  let igang = false;
  const kor = async () => {
    if (igang) return; igang = true;
    try { const n = await hamta(dir, medskickadDir); if (n) { console.log('[listor] ' + n + ' nya listor'); onNya(); } }
    catch (e) { console.warn('[listor]', String(e)); }
    finally { igang = false; }
  };
  // Första koll strax efter start (inte mitt i uppstarten), men inte om vi kollade nyss
  const sedan = Date.now() - (lasMeta(dir).senast || 0);
  const forsta = sedan >= INTERVALL ? 15000 : INTERVALL - sedan;
  setTimeout(kor, forsta).unref?.();
  setInterval(kor, INTERVALL).unref?.();
  return kor;
}

module.exports = { starta, hamta, KALLOR };
