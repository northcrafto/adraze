'use strict';
/* Anpassa → Avancerat: egen CSS per sajt, egen CSS för AdRaze själv (som Firefox userChrome.css) och
 * användarskript per sajt (som en enkel Tampermonkey). Värdena ligger i Anpassa-butiken (anpassa.js):
 *   avancerat.css      [{ id, mal: 'example.com' | '*', under, css, pa }]          egen CSS för sajter
 *   avancerat.skalcss  { pa, css }                                                egen CSS för AdRazes skal
 *   avancerat.skript   [{ id, namn, match: [], exclude: [], tid, ramar, pa, kod }] användarskript
 * Allt är barnlåst och följer aldrig med i en delningskod (importBar: false). Inget av det gäller i barnläge
 * eller inkognito, och inget körs på AdRazes egna sidor, inloggningssidor eller betalsidor (kanslig()).
 *
 * Sajternas CSS läggs in av huvudprocessen med webContents.insertCSS vid varje sidladdning och byts direkt i
 * öppna flikar när man sparar. Skripten hämtas vid dokumentstart av anpassa-avancerat-preload.js (synkront,
 * så "Tidigt" hinner före sidans egna skript) och körs i en egen isolerad värld: sidan når inte skriptet, och
 * skriptet når varken Node, preloadernas värld eller AdRazes API:er. VILKA skript en ram får avgörs här, från
 * ramens adress som huvudprocessen själv känner till (senderFrame.url) – aldrig från vad sidan påstår.
 *
 * Nödutgång för skalets CSS: Ctrl+Shift+Alt+R i vilket fönster/flik som helst, eller start med --utan-skal-css. */
const path = require('path');
const vm = require('vm');
const { app, ipcMain } = require('electron');

const VARLD = 4100;   // egen isolerad värld för användarskript (999 = preloadernas, 991/992/1001/1990 = AdRazes egna)
const PRELOAD = path.join(__dirname, 'anpassa-avancerat-preload.js');
const SKAL_URL = require('url').pathToFileURL(path.join(__dirname, 'ui', 'shell.html')).href;
const FLAGGA = '--utan-skal-css';
const MAX = { cssRegler: 200, css: 100000, skalcss: 100000, skript: 100, kod: 300000, monster: 50, monsterLangd: 500, namn: 120 };

let anpassa = null;
let barn = () => false;          // barnläge någonstans (main.js: barnNagonstans)
let T = (s, v) => require('./i18n-fyll').fyll(s, v);                // översättning (main.js: T)
let skalAvFlagga = false;        // nödutgången: skalets CSS av i den här körningen
let flaggToast = false;          // startad med --utan-skal-css: berätta det när första fönstret laddat
let varBarn = false;
let cacheCss = null, cacheSkript = null;   // kontrollerade kopior av butikens värden (töms vid ändring)
const flikar = new Set();        // flikarnas webContents – bara flikar får sajt-CSS och skript
const skal = new Set();          // skalens webContents (ui/shell.html)
const sessioner = new Set();     // flikarnas beständiga sessioner (aldrig inkognito)
const preloads = new Map();      // session → id för den registrerade skript-preloaden
const cssLage = new WeakMap();   // webContents → { keys, sig, dok, ko }
const korda = new WeakMap();     // flik → id:n för skript som körts i huvudramens nuvarande dokument
const medSkript = new WeakSet(); // flikar där minst ett skript körts i det nuvarande dokumentet (någon ram)
// Flikar med en påbörjad sidladdning som inte nått fram än. Läget nollas först när det nya dokumentet finns
// (inte när laddningen börjar): en laddning som blir en nedladdning lämnar den gamla sidan – och dess skript – kvar.
const vantar = new WeakSet();

/* ── Värdena, kontrollerade (butiken kan innehålla vad som helst) ── */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
function normVard(s) {
  let h = String(s || '').trim().toLowerCase();
  if (h === '*') return '*';
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#\s]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '')
    .replace(/^\*\./, '').replace(/\.+$/, '').replace(/^www\./, '');
  if (!h || h.length > 253) return '';
  try { h = new URL('http://' + h).hostname; } catch { return ''; }   // IDN → punycode
  return /^[a-z0-9.-]+$/.test(h) || /^\[[0-9a-f:.]+\]$/.test(h) ? h : '';
}
function vardAv(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/\.+$/, '').replace(/^www\./, ''); } catch { return ''; }
}
function cssRegler() {
  if (cacheCss) return cacheCss;
  const v = anpassa ? anpassa.hamta('avancerat.css') : [];
  cacheCss = (Array.isArray(v) ? v : []).slice(0, MAX.cssRegler).map((r) => {
    if (!r || typeof r !== 'object') return null;
    return { mal: r.mal === '*' ? '*' : normVard(r.mal), under: r.under !== false, css: str(r.css, MAX.css), pa: r.pa !== false };
  }).filter((r) => r && r.pa && r.mal && r.css.trim());
  return cacheCss;
}
function skalCss() {
  const v = anpassa ? anpassa.hamta('avancerat.skalcss') : null;
  return v && typeof v === 'object' && v.pa ? str(v.css, MAX.skalcss) : '';
}
function skriptLista() {
  if (cacheSkript) return cacheSkript;
  const v = anpassa ? anpassa.hamta('avancerat.skript') : [];
  const lista = (x) => (Array.isArray(x) ? x : []).filter((m) => typeof m === 'string' && m.trim()).slice(0, MAX.monster).map((m) => m.trim().slice(0, MAX.monsterLangd));
  cacheSkript = (Array.isArray(v) ? v : []).slice(0, MAX.skript).map((s) => {
    if (!s || typeof s !== 'object' || typeof s.kod !== 'string' || s.kod.length > MAX.kod) return null;
    const match = lista(s.match), exclude = lista(s.exclude);
    return {
      id: str(s.id, 40) || 'x', namn: str(s.namn, MAX.namn) || 'Skript', tid: s.tid === 'document-start' ? 'document-start' : 'document-end',
      ramar: s.ramar !== false, pa: s.pa !== false, kod: s.kod,
      matchT: match.map(tolkaMonster).filter(Boolean), excludeT: exclude.map(tolkaMonster).filter(Boolean),
    };
  }).filter(Boolean);
  return cacheSkript;
}

/* ── Var får egen CSS och skript aldrig gälla? ──
 * AdRazes egna sidor (allt som inte är http/https: skalet, adraze://, lokala filer), AdRazes webb (konto,
 * inloggning, Familj, Pro, sök), andra kontoinloggningar och BankID, samt betalsidor: betaltjänsterna själva
 * (även deras kortfält i kassornas iframes) och kassor/betalsteg på vanliga butiker. */
const KANSLIGA = /(^|\.)(adraze\.app|stripe\.com|stripe\.network|paypal\.com|paypalobjects\.com|braintreegateway\.com|braintree-api\.com|klarna\.com|klarnaservices\.com|adyen\.com|adyenpayments\.com|swish\.nu|trustly\.com|vipps\.no|mobilepay\.dk|mobilepay\.fi|nets\.eu|dibspayment\.eu|dibspayment\.com|bambora\.com|worldline\.com|payex\.com|checkout\.com|mollie\.com|svea\.com|qliro\.com|walley\.se|payson\.se|zimpler\.com|paysafecard\.com|skrill\.com|cardinalcommerce\.com|3dsecure\.io|arcot\.com|bankid\.com|frejaeid\.com|signicat\.com|criipto\.com|accounts\.google\.com|pay\.google\.com|payments\.google\.com|login\.microsoftonline\.com|login\.microsoft\.com|login\.live\.com|account\.live\.com|appleid\.apple\.com|idmsa\.apple\.com|okta\.com|auth0\.com|onelogin\.com|duosecurity\.com)$/i;
const KASSA_VARD = /^(checkout|pay|payment|payments|kassa|betala|betalning|wallet)\./i;
const KASSA_STEG = new Set(['checkout', 'checkouts', 'kassa', 'kassan', 'kasse', 'betalning', 'betala', 'pay', 'payment', 'payments', 'wallet']);
function kanslig(url) {
  let u; try { u = new URL(String(url || '')); } catch { return true; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
  const h = u.hostname.toLowerCase().replace(/\.+$/, '');
  if (KANSLIGA.test(h) || KASSA_VARD.test(h)) return true;
  return u.pathname.toLowerCase().split('/').some((d) => KASSA_STEG.has(d));
}
const webbsida = (url) => /^https?:\/\//i.test(String(url || ''));
// Inkognito = en session som bara finns i minnet (skoll-incognito). Flikarnas vanliga sessioner är beständiga.
function inkognito(wc) { try { return !wc.session.isPersistent(); } catch { return true; } }
function avstangd(wc) { return barn() || inkognito(wc); }

/* ── Mönster för skript: *.example.com/*, *://example.com/sida*, https://example.com/*, example.com, * ──
 * Utan schema gäller både http och https. "*.example.com" gäller även example.com själv (som i Chrome).
 * Mönster med jokertecken mitt i värden (@include-stil, t.ex. *example.com*) jämförs mot hela adressen.
 * Inga reguljära uttryck: ett elakt mönster får aldrig kunna låsa huvudprocessen. */
function glob(p, s) {   // bara * är jokertecken; ingen backtracking-explosion
  let pi = 0, si = 0, stjarna = -1, mark = 0;
  while (si < s.length) {
    if (pi < p.length && p[pi] !== '*' && p[pi] === s[si]) { pi++; si++; }
    else if (pi < p.length && p[pi] === '*') { stjarna = pi++; mark = si; }
    else if (stjarna !== -1) { pi = stjarna + 1; si = ++mark; }
    else return false;
  }
  while (pi < p.length && p[pi] === '*') pi++;
  return pi === p.length;
}
function tolkaMonster(m) {
  m = String(m || '').trim();
  if (!m || m.length > MAX.monsterLangd) return null;
  if (m.startsWith('/') && m.endsWith('/') && m.length > 2) return null;   // reguljära uttryck stöds inte
  if (m === '*' || m === '<all_urls>' || m === '*://*/*' || m === '*://*') return { alla: true };
  let schema = '*', rest = m;
  const i = m.indexOf('://');
  if (i >= 0) { schema = m.slice(0, i).toLowerCase(); rest = m.slice(i + 3); }
  if (!['*', 'http', 'https'].includes(schema)) return null;
  const s = rest.indexOf('/');
  const vard = (s >= 0 ? rest.slice(0, s) : rest).toLowerCase().replace(/:\d+$/, '').replace(/\.+$/, '');
  const vag = s >= 0 ? rest.slice(s) : '/*';
  if (!vard) return null;
  if (vard === '*' || /^\*\.[^*]+$/.test(vard) || !vard.includes('*')) {
    let namn = vard === '*' ? '' : vard.replace(/^\*\./, '');
    if (namn) { try { namn = new URL('http://' + namn).hostname; } catch { return null; } }
    return { schema, vard: { namn, under: vard === '*' || vard.startsWith('*.') }, vag };
  }
  return { schema, hel: ((i >= 0 ? '' : '*://') + m).toLowerCase() };   // jokertecken mitt i värden: hela adressen
}
function matchar(t, u) {
  if (!t) return false;
  if (t.alla) return true;
  const proto = u.protocol.slice(0, -1);
  if (t.schema !== '*' && t.schema !== proto) return false;
  if (t.hel) return glob(t.hel, (proto + '://' + u.host + u.pathname + u.search).toLowerCase());
  const h = u.hostname.toLowerCase().replace(/\.+$/, '');
  if (t.vard.namn && !(h === t.vard.namn || (t.vard.under && h.endsWith('.' + t.vard.namn)))) return false;
  return glob(t.vag, u.pathname + u.search);
}
function skriptFor(url, arTopp) {
  let u; try { u = new URL(url); } catch { return []; }
  return skriptLista().filter((s) => s.pa && (arTopp || s.ramar) && s.matchT.some((t) => matchar(t, u)) && !s.excludeT.some((t) => matchar(t, u)));
}

/* ── Skriptets omslag: egen funktionsomgivning per skript + några få GM_-funktioner (som Tampermonkey).
 * Inga GM_xmlhttpRequest/GM_setValue: de skulle kräva mer behörighet än sidan själv har. ── */
const OMSLAG_RADER = 6;   // rader före skriptets egen kod (för radnummer i felmeddelanden)
// i18n-hoppa-start (skriptkod som körs i sidan, inte UI)
function omslag(kod, namn) {
  return '(function () {\n'
    + 'var GM_info = ' + JSON.stringify({ script: { name: namn || '' }, scriptHandler: 'AdRaze', version: '1' }) + ';\n'
    + 'function GM_addStyle(css) { var s = document.createElement("style"); s.textContent = String(css); var in_ = function () { (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) in_(); else new MutationObserver(function (_m, o) { if (document.documentElement) { o.disconnect(); in_(); } }).observe(document, { childList: true }); return s; }\n'
    + 'function GM_log() { console.log.apply(console, arguments); }\n'
    + 'var GM = { info: GM_info, addStyle: function (c) { return Promise.resolve(GM_addStyle(c)); }, log: GM_log };\n'
    + '(function () {\n'
    + kod + '\n'
    + '}).call(window);\n'
    + '})();';
}
// i18n-hoppa-slut
const paket = (s) => ({ id: s.id, tid: s.tid, url: 'adraze-skript:///' + encodeURIComponent(s.namn).slice(0, 80) + '.user.js', kod: omslag(s.kod, s.namn) });

// Kontroll i inställningarna: kompilera (aldrig köra) skriptet och tolka mönstren
function kolla(d) {
  const kod = str(d && d.kod, MAX.kod + 1);
  const ut = { ok: true, ogiltiga: [] };
  const monster = [].concat(Array.isArray(d && d.match) ? d.match : [], Array.isArray(d && d.exclude) ? d.exclude : []);
  for (const m of monster.slice(0, MAX.monster * 2)) if (!tolkaMonster(m)) ut.ogiltiga.push(String(m).slice(0, 120));
  if (kod.length > MAX.kod) return { ...ut, ok: false, fel: 'Skriptet är för långt (högst 300 000 tecken).' };
  try { new vm.Script(omslag(kod, ''), { filename: 'skript.user.js' }); } catch (e) {
    const m = /skript\.user\.js:(\d+)/.exec(String((e && e.stack) || ''));
    return { ...ut, ok: false, rad: m ? Math.max(1, Number(m[1]) - OMSLAG_RADER) : null, fel: String((e && e.message) || e).slice(0, 200) };
  }
  return ut;
}

/* ── CSS i flikar och skal ── */
function cssFor(url) {
  if (!webbsida(url) || kanslig(url)) return [];
  const h = vardAv(url);
  const regler = cssRegler();
  // "Alla sajter" först, sedan sajtens egna – den mer specifika vinner vid lika styrka
  return [...regler.filter((r) => r.mal === '*'), ...regler.filter((r) => r.mal !== '*' && (h === r.mal || (r.under && h.endsWith('.' + r.mal))))].map((r) => r.css);
}
const medTid = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
// Lägger in rätt CSS i webContents. Ny CSS läggs in innan den gamla tas bort, så inget blinkar.
// nyttDokument: sidan har laddats om – de gamla nycklarna försvann med det gamla dokumentet.
// Varje text läggs in två gånger. Som den är: vanliga regler tävlar med sidans på styrka (sidan vinner vid lika,
// eftersom inlagd CSS hamnar före sidans egen). Och inuti ett eget, namnlöst @layer: där vinner !important över
// sidans !important (lager-!important går före olagrad !important), så "!important" fungerar alltid – som
// userContent.css. Lagrens vanliga regler ändrar inget, eftersom den olagrade kopian med samma regler går före.
// Listan kommer i stigande prioritet ("Alla sajter" före sajtens egen). Olagrat vinner den sista, men bland lager
// vinner !important i det FÖRSTA – därför läggs lagerkopiorna in baklänges, så att sajtens egen vinner i båda.
// (cssOrigin 'user' hade gett samma sak, men Electrons removeInsertedCSS tar bara bort 'author'-CSS.)
const kopior = (css) => [...css, ...css.slice().reverse().map((c) => '@layer {\n' + c + '\n}')];
function tillampa(wc, vilken, nyttDokument) {
  let st = cssLage.get(wc);
  if (!st) { st = { keys: [], sig: null, dok: 0, ko: Promise.resolve() }; cssLage.set(wc, st); }
  if (nyttDokument) { st.keys = []; st.sig = null; st.dok++; }
  st.ko = st.ko.then(async () => {
    if (wc.isDestroyed()) return;
    const dok = st.dok;
    const css = vilken();
    const sig = css.join('\n/*⁣*/\n');
    if (sig === st.sig) return;
    const gamla = st.keys; st.keys = []; st.sig = sig;
    for (const text of kopior(css)) {
      const k = await medTid(wc.insertCSS(text, { cssOrigin: 'author' }), 5000);
      if (st.dok !== dok || wc.isDestroyed()) return;   // sidan bytte dokument under tiden
      if (k) st.keys.push(k); else st.sig = null;       // misslyckades: försök igen vid nästa tillfälle
    }
    for (const k of gamla) await medTid(wc.removeInsertedCSS(k), 5000);
  }).catch(() => {});
  return st.ko;
}
const sajtCss = (wc, ny) => tillampa(wc, () => (avstangd(wc) ? [] : cssFor(wc.getURL())), ny);
const arSkal = (wc) => { try { return wc.getURL().split(/[?#]/)[0] === SKAL_URL; } catch { return false; } };
function inkognitoFonster(wc) { try { return new URL(wc.getURL()).searchParams.has('incognito'); } catch { return false; } }
const skalensCss = (wc, ny) => tillampa(wc, () => {
  const css = (!skalAvFlagga && !barn() && !inkognitoFonster(wc)) ? skalCss() : '';
  return css.trim() ? [css] : [];
}, ny);
function uppdateraAlla() {
  for (const wc of skal) if (!wc.isDestroyed()) skalensCss(wc);
  for (const wc of flikar) if (!wc.isDestroyed()) sajtCss(wc);
}

/* ── Skripten: preloaden finns i flikarnas sessioner bara när det finns påslagna skript ── */
function synkaPreload() {
  const behovs = skriptLista().some((s) => s.pa);
  for (const s of sessioner) {
    const id = preloads.get(s);
    try {
      if (behovs && !id) preloads.set(s, s.registerPreloadScript({ type: 'frame', filePath: PRELOAD }));
      else if (!behovs && id) { s.unregisterPreloadScript(id); preloads.delete(s); }
    } catch (e) { console.warn('[avancerat] preload:', e && e.message); }
  }
}
function svarSkript(e) {
  const wc = e.sender, ram = e.senderFrame;
  if (!wc || wc.isDestroyed() || !flikar.has(wc) || !ram || avstangd(wc)) return null;
  const url = String(ram.url || ''), topp = wc.getURL();
  const arTopp = !ram.parent;
  const tillaten = webbsida(url) && webbsida(topp) && !kanslig(url) && !kanslig(topp);
  const lista = tillaten ? skriptFor(url, arTopp) : [];
  // Huvudramens dokument: vilka skript som körts (för SPA-byten). Började dokumentet som en känslig sida
  // körs inga skript alls i det, inte heller om sajten sedan byter adress utan att ladda om.
  if (arTopp) {   // ett nytt dokument i huvudramen
    vantar.delete(wc); medSkript.delete(wc);
    if (tillaten) korda.set(wc, new Set(lista.map((s) => s.id))); else korda.delete(wc);
  }
  if (lista.length) medSkript.add(wc);
  return { varld: VARLD, skript: lista.map(paket) };
}
// SPA: sajten bytte adress utan att ladda om – kör skript som börjar gälla nu och inte redan körts i dokumentet
function spaSkript(wc, url) {
  const set = korda.get(wc);
  if (!set || avstangd(wc) || !webbsida(url) || kanslig(url)) return;
  const nya = skriptFor(url, true).filter((s) => !set.has(s.id));
  if (!nya.length) return;
  for (const s of nya) set.add(s.id);
  medSkript.add(wc);
  try { wc.send('avancerat:spa', { varld: VARLD, skript: nya.map(paket) }); } catch {}
}

/* ── Krokar från main.js ── */
// En ny flik (ensureView): sajt-CSS vid varje sidladdning, skripten via preloaden i flikens session
function flik(wc) {
  if (!wc || flikar.has(wc)) return;
  flikar.add(wc);
  wc.once('destroyed', () => flikar.delete(wc));
  try { if (wc.session.isPersistent() && !sessioner.has(wc.session)) { sessioner.add(wc.session); synkaPreload(); } } catch {}
  wc.on('did-start-navigation', (_e, _u, inPage, isMain) => { if (isMain && !inPage) vantar.add(wc); });
  wc.on('did-navigate', () => {   // nytt dokument
    if (vantar.has(wc)) { vantar.delete(wc); korda.delete(wc); medSkript.delete(wc); }   // ingen preload hann före
    sajtCss(wc, true);
  });
  wc.on('dom-ready', () => sajtCss(wc));            // säkerhetsnät om det första försöket inte gick fram
  wc.on('did-navigate-in-page', (_e, url, isMain) => {
    if (!isMain) return;
    sajtCss(wc);
    // Sajten bytte till en kassa/inloggning utan att ladda om, men skript körs redan i sidan: ladda om,
    // så att betalsidan aldrig har ett användarskript igång (efter omladdningen körs inga där).
    if (kanslig(url) && medSkript.has(wc)) { medSkript.delete(wc); korda.delete(wc); try { wc.reload(); } catch {} return; }
    spaSkript(wc, url);
  });
}
// Högerklicksmenyn på en sida: "Redigera CSS för den här sajten"
function menyval(wc) {
  try {
    const url = wc.getURL();
    const host = vardAv(url);
    if (!webbsida(url) || kanslig(url) || avstangd(wc) || !host) return [];
    return [{ label: T('Redigera CSS för den här sajten'), click: () => redigeraCss(wc, host) }];
  } catch { return []; }
}
function redigeraCss(wc, host) {
  const ctx = wc && wc.__ctx; const sw = ctx && ctx.win && !ctx.win.isDestroyed() ? ctx.win.webContents : null;
  if (!sw || barn()) return;
  try { ctx.win.focus(); sw.focus(); } catch {}
  try { sw.send('avancerat:redigera-css', host); } catch {}
}
// Nödutgången: stäng av skalets CSS (sparas, så den är av även efter omstart tills man slår på den igen)
function nodutgang(tyst) {
  skalAvFlagga = true;
  let varPa = false;   // meddelande bara om det fanns något att stänga av
  try {
    const v = anpassa.hamta('avancerat.skalcss');
    varPa = !!(v && v.pa);
    if (varPa) anpassa.satt('avancerat.skalcss', { ...v, pa: false }, { etikett: 'Nödutgång: egen CSS för AdRaze av' });
  } catch {}
  for (const wc of skal) {
    if (wc.isDestroyed()) continue;
    skalensCss(wc);
    if (!tyst && varPa) { try { wc.send('toast', T('Egen CSS för AdRaze är avstängd. Slå på den igen under Inställningar → Anpassa.')); } catch {} }
  }
}
const arNodtangent = (i) => !!i && i.type === 'keyDown' && !!(i.control || i.meta) && !!i.shift && !!i.alt && (i.code === 'KeyR' || String(i.key).toLowerCase() === 'r');

function registrera(a) {
  for (const [nyckel, standard, etikett] of [
    ['avancerat.css', [], 'Egen CSS för sajter'],
    ['avancerat.skalcss', { pa: false, css: '' }, 'Egen CSS för AdRaze'],
    ['avancerat.skript', [], 'Användarskript'],
  ]) a.registrera({ nyckel, standard, etikett, barnLast: true, importBar: false });
}

function init(o = {}) {
  anpassa = o.anpassa;
  if (typeof o.barn === 'function') barn = o.barn;
  if (typeof o.T === 'function') T = o.T;
  registrera(anpassa);
  varBarn = barn();

  // Ändringar i butiken (spara, ångra, återställ): CSS byts direkt i öppna flikar och fönster
  anpassa.lyssna((nyckel, varde) => {
    if (!String(nyckel).startsWith('avancerat.')) return;
    if (nyckel === 'avancerat.css') cacheCss = null;
    if (nyckel === 'avancerat.skript') { cacheSkript = null; synkaPreload(); }
    if (nyckel === 'avancerat.skalcss' && varde && varde.pa) skalAvFlagga = false;   // påslagen igen efter nödutgången
    uppdateraAlla();
  });
  // Barnläge på/av (skalet skickar reglerna): ta bort/lägg tillbaka CSS, och ladda om flikar där skript har körts
  const barnKoll = () => setImmediate(() => {
    const nu = barn();
    if (nu && !varBarn) for (const wc of flikar) { if (!wc.isDestroyed() && medSkript.has(wc)) { medSkript.delete(wc); try { wc.reload(); } catch {} } }
    varBarn = nu;
    uppdateraAlla();
  });
  ipcMain.on('barn:regler', barnKoll);

  // Skripten för en ram (anpassa-avancerat-preload.js, vid dokumentstart). Kanalen står i main.js WEBB_KANALER.
  ipcMain.on('avancerat:skript', (e) => { let svar = null; try { svar = svarSkript(e); } catch {} e.returnValue = svar; });
  // Inställningarna: kompilera (inte köra) ett skript och kontrollera mönstren. Bara vårt eget skal (IPC-vakten).
  ipcMain.handle('avancerat:kolla', (_e, d) => kolla(d));

  // Skalen: egen CSS när skalet laddat; ett fönster som stängs kan ta barnläget med sig
  app.on('browser-window-created', (_e, win) => {
    const wc = win.webContents;
    wc.on('dom-ready', () => {
      if (!arSkal(wc)) return;
      skal.add(wc); skalensCss(wc, true);
      if (flaggToast) { flaggToast = false; try { wc.send('toast', T('AdRaze startade utan din egen CSS för AdRaze (--utan-skal-css).')); } catch {} }
    });
    wc.once('destroyed', () => { skal.delete(wc); barnKoll(); });
  });
  // Nödutgången fungerar oavsett vad som har fokus (skalet, en flik, en ruta)
  app.on('web-contents-created', (_e, wc) => {
    wc.on('before-input-event', (ev, input) => { if (arNodtangent(input)) { try { ev.preventDefault(); } catch {} nodutgang(); } });
  });
  if (process.argv.includes(FLAGGA)) { skalAvFlagga = true; flaggToast = true; app.whenReady().then(() => nodutgang(true)).catch(() => {}); }
  app.on('second-instance', (_e, argv) => { if (Array.isArray(argv) && argv.includes(FLAGGA)) nodutgang(); });
}

module.exports = { init, flik, menyval, nodutgang, VARLD, FLAGGA, _test: { tolkaMonster, matchar, kanslig, normVard, glob, kolla } };
