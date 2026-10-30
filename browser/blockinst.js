'use strict';
/* Blockerarens inställningar (adraze://adblock), som Brave Shields: nivå, skript, fingeravtryck,
 * kakor, "glöm mig", sociala medier, filterlistor, egna filter och blockerade element.
 * Sparas i userData/adraze-block.json. Huvudprocessen läser värdena direkt (get()); ändringar som
 * kräver en ny motor (listor, egna filter, nivå) meddelas via onMotor(). */
const fs = require('fs');
const path = require('path');
let electron = null; try { electron = require('electron'); } catch {}

/* Filterlistorna. medskickad = följer med appen (adraze/lists), annars hämtas den första gången
 * den slås på. pa = på från start. */
const LISTOR = [
  { id: 'easylist.txt', namn: 'EasyList', beskr: 'Den stora listan mot reklam.', grupp: 'bas', pa: true, medskickad: true, url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy.txt', namn: 'EasyPrivacy', beskr: 'Spårare, statistik och webbfyrar.', grupp: 'bas', pa: true, medskickad: true, url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { id: 'ubo-filters.txt', namn: 'uBlock-filter', beskr: 'Annonser, reklamspärrar och popunders som andra listor missar.', grupp: 'bas', pa: true, medskickad: true, url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt' },
  { id: 'ubo-quick-fixes.txt', namn: 'uBlock snabbfixar', beskr: 'Dagliga lagningar mot sajter som försöker kringgå blockeringen.', grupp: 'bas', pa: true, medskickad: true, url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt' },
  { id: 'ubo-unbreak.txt', namn: 'uBlock avbrottsfix', beskr: 'Undantag som håller sidor hela när filtren tar i för hårt.', grupp: 'bas', pa: true, medskickad: true, url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt' },
  { id: 'badware.txt', namn: 'Farliga sidor', beskr: 'Bluffsidor, falska nedladdningar och skadlig kod.', grupp: 'bas', pa: true, medskickad: true, url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt' },
  { id: 'adguard-popups.txt', namn: 'Popup-annonser', beskr: 'Popunders och omdirigeringar från reklamnätverk.', grupp: 'bas', pa: true, medskickad: true, url: 'https://filters.adtidy.org/extension/ublock/filters/19.txt' },
  { id: 'peterlowe.txt', namn: 'Peter Lowes lista', beskr: 'Kända reklam- och spårningsservrar.', grupp: 'bas', pa: true, medskickad: true, url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext' },
  { id: 'ubo-privacy.txt', namn: 'uBlock integritet', beskr: 'Fler spårare och länkspårning. Ingår i Aggressiv.', grupp: 'extra', pa: false, url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt' },
  { id: 'ubo-annoyances.txt', namn: 'Irritationsmoment', beskr: 'Nyhetsbrevsrutor, "appen är bättre"-banners och liknande. Ingår i Aggressiv.', grupp: 'extra', pa: false, url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-others.txt' },
  { id: 'adguard-annoyances.txt', namn: 'AdGuard irritationsmoment', beskr: 'Större lista mot störande rutor och widgets.', grupp: 'extra', pa: false, url: 'https://filters.adtidy.org/extension/ublock/filters/14.txt' },
  { id: 'adguard-social.txt', namn: 'Sociala knappar', beskr: 'Dela- och gilla-knappar och sociala widgets.', grupp: 'extra', pa: false, url: 'https://filters.adtidy.org/extension/ublock/filters/4.txt' },
  { id: 'frellwit.txt', namn: 'Sverige (Frellwit)', beskr: 'Svenska sajter: reklam, spårare och irritationsmoment.', grupp: 'region', pa: true, medskickad: true, url: 'https://raw.githubusercontent.com/lassekongo83/Frellwits-filter-lists/master/Frellwits-Swedish-Filter.txt' },
  { id: 'easylist-germany.txt', namn: 'Tyskland', beskr: 'EasyList Germany.', grupp: 'region', pa: false, url: 'https://easylist.to/easylistgermany/easylistgermany.txt' },
  { id: 'liste-fr.txt', namn: 'Frankrike', beskr: 'Liste FR.', grupp: 'region', pa: false, url: 'https://easylist-downloads.adblockplus.org/liste_fr.txt' },
  { id: 'easylist-spanish.txt', namn: 'Spanien', beskr: 'EasyList Spanish.', grupp: 'region', pa: false, url: 'https://easylist-downloads.adblockplus.org/easylistspanish.txt' },
  { id: 'adguard-turkish.txt', namn: 'Turkiet', beskr: 'AdGuard Turkish.', grupp: 'region', pa: false, url: 'https://filters.adtidy.org/extension/ublock/filters/13.txt' },
];
const AGGRESSIV_EXTRA = ['ubo-privacy.txt', 'ubo-annoyances.txt'];
const INTERNA = ['adraze-natverk.txt'];   // AdRazes egna nätverksregler, alltid med

/* Sociala inbäddningar som stoppas (när de laddas på en annan sajt) om de inte är tillåtna. */
const SOCIALA = {
  facebook: /^(connect\.facebook\.net|staticxx\.facebook\.com|([a-z0-9-]+\.)?facebook\.com\/(v[\d.]+\/)?plugins\/|([a-z0-9-]+\.)?facebook\.com\/(v[\d.]+\/)?dialog\/oauth)/i,
  x: /^(platform\.twitter\.com|syndication\.twitter\.com|cdn\.syndication\.twimg\.com|publish\.twitter\.com|platform\.x\.com|syndication\.x\.com)/i,
  linkedin: /^(platform\.linkedin\.com|([a-z0-9-]+\.)?linkedin\.com\/embed\/|snap\.licdn\.com)/i,
};
const SOCIAL_SAJT = { facebook: /(^|\.)(facebook\.com|fb\.com|messenger\.com)$/i, x: /(^|\.)(twitter\.com|x\.com)$/i, linkedin: /(^|\.)linkedin\.com$/i };

const STANDARD = {
  niva: 'medium',            // enkel | medium | aggressiv
  raknare: true,             // antal blockerade på falken
  skript: false,             // blockera all JavaScript
  injektioner: false,        // blockera skript som sidan skjuter in från andra sajter
  fingeravtryck: true,
  natskydd: true,            // sajter får inte nå localhost/routern/LAN (natskydd.js)
  kakor: 'tredje',           // av | tredje | alla
  glom: false,               // glöm mig när jag stänger webbplatsen
  kontakt: '',               // mejl för rapporter om trasiga sidor
  elementPrivat: false,      // blockera element i privata fönster
  social: { facebook: true, x: true, linkedin: true },
  listor: {},                // id -> true/false (bara ändrade)
  egna: '',                  // egna filter (en per rad)
  element: {},               // värd -> [selektorer] från "Blockera element"
};

let FIL = null, prefs = null, sparTimer = null;
const lyssnare = { andrat: [], motor: [] };
function fil() { if (!FIL) FIL = path.join(electron.app.getPath('userData'), 'adraze-block.json'); return FIL; }
function las() {
  if (prefs) return prefs;
  let sparat = {};
  try { sparat = JSON.parse(fs.readFileSync(fil(), 'utf8')); } catch {}
  prefs = { ...STANDARD, ...sparat, social: { ...STANDARD.social, ...(sparat.social || {}) } };
  return prefs;
}
function spara() { clearTimeout(sparTimer); sparTimer = setTimeout(() => { try { fs.writeFileSync(fil(), JSON.stringify(prefs, null, 1)); } catch {} }, 150); }
function get() { return las(); }

function listaPa(id) {
  const p = las();
  if (p.niva === 'aggressiv' && AGGRESSIV_EXTRA.includes(id) && p.listor[id] !== false) return true;
  if (id in p.listor) return !!p.listor[id];
  const l = LISTOR.find((x) => x.id === id);
  return !!(l && l.pa);
}
// Listorna motorn ska äta (i ordning)
function aktivaListor() { return [...LISTOR.filter((l) => listaPa(l.id)).map((l) => l.id), ...INTERNA]; }
// Källorna listuppdateringen hämtar: alla påslagna (de medskickade och de som bara finns på nätet)
// Säkerhetslistor från Brave som alltid hålls färska (inte filter: undantag för natskydd/endast HTTPS)
const SAKERHET = {
  'brave-localhost.txt': 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/localhost-permission-allow-list.txt',
  'brave-https-undantag.txt': 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/https-upgrade-exceptions-list.txt',
};
function kallor() { const ut = { ...SAKERHET }; for (const l of LISTOR) if (listaPa(l.id)) ut[l.id] = l.url; return ut; }

// "Egna filter": nätverksfilter och ##+js går till motorn, ##selektor blir CSS per värd
function egnaKosmetik(host) {
  const ut = [];
  for (const rad of String(las().egna || '').split(/\r?\n/)) {
    const r = rad.trim(); if (!r || r.startsWith('!')) continue;
    const m = /^([^#]*)##(?!\+js)(.+)$/.exec(r); if (!m) continue;
    const domaner = m[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!domaner.length || domaner.some((d) => !d.startsWith('~') && (host === d || host.endsWith('.' + d)))) ut.push(m[2].trim());
  }
  return ut;
}
function egnaMotorText() { return String(las().egna || '').split(/\r?\n/).filter((r) => !/^[^#]*##(?!\+js)/.test(r.trim())).join('\n'); }

function elementFor(host) {
  const e = las().element || {}; const ut = [];
  for (const [v, sel] of Object.entries(e)) if (host === v || host.endsWith('.' + v)) ut.push(...sel);
  return ut;
}

// Ska en sociala-medier-inbäddning stoppas? url = förfrågan, topp = sidans värd
function socialStopp(url, topp) {
  const s = las().social;
  const rest = String(url).replace(/^[a-z]+:\/\//i, '');
  for (const k of Object.keys(SOCIALA)) {
    if (s[k] !== false) continue;
    if (SOCIAL_SAJT[k].test(topp || '')) continue;      // på sajten själv är det inte en inbäddning
    if (SOCIALA[k].test(rest)) return true;
  }
  return false;
}

function satt(nyckel, varde) {
  const p = las();
  const motorNycklar = new Set(['listor', 'egna', 'niva']);
  switch (nyckel) {
    case 'niva': if (!['enkel', 'medium', 'aggressiv'].includes(varde)) return false; p.niva = varde; break;
    case 'kakor': if (!['av', 'tredje', 'alla'].includes(varde)) return false; p.kakor = varde; break;
    case 'raknare': case 'skript': case 'injektioner': case 'fingeravtryck': case 'natskydd': case 'glom': case 'elementPrivat': p[nyckel] = !!varde; break;
    case 'kontakt': p.kontakt = String(varde || '').trim().slice(0, 200); break;
    case 'egna': p.egna = String(varde || '').slice(0, 200000); break;
    case 'social': if (varde && typeof varde === 'object') for (const k of Object.keys(STANDARD.social)) if (k in varde) p.social[k] = !!varde[k]; break;
    case 'lista': { const l = LISTOR.find((x) => x.id === (varde && varde.id)); if (!l) return false; p.listor = { ...p.listor, [l.id]: !!varde.pa }; nyckel = 'listor'; break; }
    default: return false;
  }
  spara();
  for (const f of lyssnare.andrat) { try { f(nyckel); } catch {} }
  if (motorNycklar.has(nyckel)) for (const f of lyssnare.motor) { try { f(nyckel); } catch {} }
  return true;
}
function laggTillElement(host, sel) {
  const p = las(); host = String(host || '').toLowerCase().replace(/^www\./, ''); sel = String(sel || '').trim();
  if (!host || !sel || sel.length > 500) return false;
  const l = p.element[host] || (p.element[host] = []);
  if (!l.includes(sel)) l.push(sel);
  spara(); for (const f of lyssnare.andrat) { try { f('element'); } catch {} }
  return true;
}
function taBortElement(host, sel) {
  const p = las(); const l = p.element[host]; if (!l) return false;
  p.element[host] = l.filter((s) => s !== sel); if (!p.element[host].length) delete p.element[host];
  spara(); for (const f of lyssnare.andrat) { try { f('element'); } catch {} }
  return true;
}

module.exports = {
  LISTOR, get, satt, listaPa, aktivaListor, kallor, egnaKosmetik, egnaMotorText, elementFor, socialStopp,
  laggTillElement, taBortElement,
  onAndrat: (f) => lyssnare.andrat.push(f),
  onMotor: (f) => lyssnare.motor.push(f),
};
