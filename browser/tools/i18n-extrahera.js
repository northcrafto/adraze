#!/usr/bin/env node
// Samlar ALLA synliga svenska UI-texter i AdRaze och uppdaterar ui/locales/_sv-base.json (listan som tools/gen_i18n.js
// översätter). Översättningen sker "per innehåll" (ui/i18n.js): en textnod eller ett attribut byts bara om HELA den
// trimmade texten finns i ordlistan. Därför samlar vi texten så som den hamnar i DOM:en, och rapporterar text som inte
// kan matchas (ihopsatt med variabler, uppdelad i flera noder).
//
// Varifrån texterna kommer:
//   ui/*.html      textnoder och attributen title/placeholder/aria-label/data-tip/data-tom/data-drop/data-ftext,
//                  <title>, och inline-<script> (som JS nedan)
//   ui/*.js, *.js  argument till t()/tr()/tx()/tn()/tf()/T()/trUi(); strängar och mall-literaler som ser ut som text
//                  (HTML i strängar delas upp i textnoder och attribut); statiska delar runt ${} i mallar
// Vad som INTE är text (regler i naturlig()): URL:er, sökvägar, CSS, selektorer, id:n/nycklar (camelCase, kebab-case,
// snake_case), kod (=>, ===, anrop som f(), {…}), versaler (GET, PDF), engelska tangentnamn och JS-namn (STOPP),
// och varumärken som står ensamma (MARKEN). Varumärken inne i längre text får finnas (gen_i18n.js skyddar dem).
//
// Användning: node tools/i18n-extrahera.js [--skriv] [--rapport] [--alla]
//   --skriv     skriv _sv-base.json (annars bara siffror)
//   --rapport   lista text som inte går att översätta som den är (ihopsatt/uppdelad) och huvudprocesstext utan T()
//   --alla      skriv ut alla funna strängar med var de hittades
const fs = require('fs');
const path = require('path');

const ROT = path.join(__dirname, '..');
const BAS = path.join(ROT, 'ui', 'locales', '_sv-base.json');
const ARG = new Set(process.argv.slice(2));

// Filer som inte innehåller UI-text (data, blockeringsregler, kartan) och verktygen själva
const HOPPA = new Set(['ui/worldmap.js', 'ui/chatt-emoji.js', 'ui/i18n.js', 'ui/tailwind.css', 'adblock-motor.js', 'adblock-redirects.js', 'adblock-scriptlets.js', 'adblock-skydd.js']);
// Funktioner vars första argument är en svensk nyckel
const TFUNK = new Set(['t', 'tr', 'tx', 'tn', 'tf', 'T', 'trUi', 'fyll']);
// Attribut som i18n.js översätter
const ATTR = new Set(['title', 'placeholder', 'aria-label', 'data-tip', 'data-tom', 'data-drop', 'data-ftext']);
// Varumärken och namn som inte översätts när de står ensamma (i längre text skyddas de av gen_i18n.js)
const MARKEN = require('./i18n-marken');
// Engelska ord som är kod, tangenter, typsnitt eller protokoll – inte UI-text när de står ensamma
const STOPP = new Set(('Enter Escape Esc Tab Backspace Delete Del Space Spacebar Home End PageUp PageDown Insert Shift Control Ctrl Alt AltGr Meta Cmd Command Option CapsLock ' +
  'ArrowUp ArrowDown ArrowLeft ArrowRight Up Down Left Right Plus Minus F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 ' +
  'Date Object Array Math JSON Promise Error TypeError Number String Boolean Map Set WeakMap Symbol Intl Infinity NaN Function RegExp WebSocket Blob File Image Audio URL URLSearchParams Event CustomEvent Buffer ' +
  'Accept Authorization Bearer Content Cookie Origin Referer Host Location Range Mozilla AppleWebKit Gecko KHTML Safari Chrome Chromium Electron Linux Windows Mac Darwin X11 ' +
  'Inter Arial Helvetica Georgia Menlo Consolas Monaco Courier Roboto Segoe Ubuntu Cantarell Noto Times Verdana Tahoma Fira Mono Sans Serif Emoji ' +
  'None Auto Default True False Null Undefined OK Ok ID UTF Base64 PNG JPEG JPG GIF SVG WEBP PDF HTML CSS JS JSON XML CSV').split(/\s+/));
const SVENSKA_ORD = new Set(('och att i på för med en ett som är av till den det de inte har kan du din ditt dina om eller när så från alla mer ny nya ' +
  'sidan sida flik flikar fönster ut in upp ner här där vad vill ska bara också redan sedan inga ingen inget nu igen hela varje sig man vi ' +
  'efter före under över mellan utan genom vid hos mot kvar fler färre minst högst dag dagar timme timmar minut minuter sekund sekunder vecka veckor ' +
  'år månad månader kl idag igår imorgon visa dölj stäng öppna spara ta bort lägg till byt välj klar klart mindre sparad tid totalt').split(/\s+/));

function harSvensk(s) { return /[åäöÅÄÖ]/.test(s); }

// Är s (redan trimmad) en text som en människa läser?
function naturlig(s) {
  if (!s || s.length < 2 || s.length > 600) return false;
  if (!/\p{L}/u.test(s)) return false;
  if (/:\/\/|^(https?:|mailto:|file:|data:|about:|chrome:|adraze:|www\.)/i.test(s)) return false;
  if (/=>|===|!==|&&|\|\||\$\{|^\s*[<>{}[\]();]|;\s*$|\breturn\b|\bfunction\b/.test(s)) return false;
  if (/[\w-]=["']|^["']\s*[\w-]+=|\[data-|'(self|none|unsafe-inline)'|";|^[A-Z]\w+=/.test(s)) return false;   // attribut-bitar, CSP, .desktop
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|PRAGMA)\b/.test(s)) return false;                                   // SQL
  if (/^(unset|env|exec|export|cd|rm|mkdir)\s|\$[A-Z@{]|charset=|;\s*\w+=/.test(s)) return false;                  // skal, MIME
  if (/^["'\]][\s\])+;]|^' \+|\b(sans-serif|serif|monospace)\b|\d+px\s+"/.test(s)) return false;               // kodbitar, typsnitt
  if ((s.match(/\d/g) || []).length > s.length * 0.3) return false;                                          // SVG-banor, siffror
  if (/[a-z0-9_]\(/i.test(s) && !/^[A-ZÅÄÖ]/.test(s)) return false;          // rgb(…), translate(…)
  if (/[a-z]\(/.test(s) && !/\s/.test(s)) return false;
  if (/\{(?![a-z]\w*\})/.test(s.replace(/\{[a-z]\w*\}/g, ''))) return false;   // { } som inte är {platshållare}
  if (/^[\w-]+\s*:\s*[^\s]/.test(s) && /;|px|%|#[0-9a-f]{3}/i.test(s)) return false;   // CSS
  if (/^[.#@[\]*>:~+]/.test(s) && !/^[.…]{3}/.test(s) && !/^\+ \p{L}/u.test(s)) return false;   // selektorer, @media ("+ Ny grupp" är text)
  if (/^-?\d/.test(s) && /^[-\d.\s%a-z/]*$/.test(s)) return false;          // 12px, 1.5em
  const ord = s.split(/\s+/);
  if (ord.length === 1) {
    const w = s.replace(/[:…!?.]+$/, '');
    if (MARKEN.has(w) || STOPP.has(w)) return false;
    if (/[\\/_=@#$%^*|<>`]/.test(w)) return false;
    if (/^[a-z]+[A-Z]/.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w) && !harSvensk(w)) return false;   // camelCase, PascalCase
    if (/^[A-ZÅÄÖ0-9-]+$/.test(w)) return false;                            // VERSALER, ALT-1
    if (/\.\w+$/.test(w)) return false;                                      // fil.ext, a.b
    if (w === 'eller' || w === 'och') return true;                          // ensamt bindeord mellan två knappar
    if (harSvensk(w)) return /^[\p{L}-]+$/u.test(w) && !/^[a-zåäö]+-[a-zåäö-]+$/.test(w) || /[:…]$/.test(s);
    if (/^[A-Z][a-zé]+(-[a-zé]+)?$/.test(w)) return true;                    // Mina, Anpassa
    return /[:…]$/.test(s) && /^[A-ZÅÄÖ]/.test(s);                           // "Typ:"

  }
  // Flera ord
  if (MARKEN.has(s) || STOPP.has(s)) return false;
  const kodord = ord.filter((w) => /^[a-z0-9]+(-[a-z0-9]+)+$|^[a-z]+[A-Z]\w*$|^--|^-?\d*\.?\d+(px|em|rem|%|ms|s|deg|vh|vw|fr)?$|^#[0-9a-fA-F]+$/.test(w));
  if (kodord.length >= Math.ceil(ord.length / 2)) return false;              // klasslistor, CSS-värden
  if (/^[a-z0-9\s-]+$/.test(s)) return ord.some((w) => SVENSKA_ORD.has(w));  // gemener utan åäö: bara om det är svenska ord
  if (!/^[\p{L}\d"'“”«(¡¿…•·–—→←↑↓↩⇧⌘+]/u.test(s) && !harSvensk(s)) return false;
  return true;
}

// Normalisering som i18n.js också gör vid uppslag: blanktecken ihop till ett mellanslag
const norm = (s) => s.replace(/[\s ]+/g, ' ').trim();

/* ── JS-lexer: strängar, mall-literaler (med nästlade ${}), kommentarer, regex ── */
const REGEX_EFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '=>', '==', '===', '!=', '!==', '&&', '||', '??', '+=', '-=', '<=', '>=', '...']);
const REGEX_ORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
function lexa(src, startRad = 1) {
  const tok = [];
  let i = 0, rad = startRad;
  const n = src.length;
  const sista = () => { for (let k = tok.length - 1; k >= 0; k--) return tok[k]; return null; };
  function las(q) {   // sträng med citattecken q, i står på q
    let v = '', j = i + 1;
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') { const r = escape(src, j); v += r.v; j = r.j; continue; }
      if (src[j] === '\n') { rad++; break; }
      v += src[j++];
    }
    return { v, j: j + 1 };
  }
  function mall() {   // i står på `
    const delar = [], uttryck = [];
    let v = '', j = i + 1;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { const r = escape(src, j); v += r.v; j = r.j; continue; }
      if (c === '`') { j++; break; }
      if (c === '$' && src[j + 1] === '{') {
        delar.push(v); v = '';
        // läs uttrycket med klammernivå, rekursivt för nästlade mallar/strängar
        let d = 1, k = j + 2; const s0 = k;
        while (k < n && d > 0) {
          const ch = src[k];
          if (ch === '{') d++;
          else if (ch === '}') { d--; if (!d) break; }
          else if (ch === '"' || ch === "'") { k++; while (k < n && src[k] !== ch) { if (src[k] === '\\') k++; k++; } }
          else if (ch === '`') { const sub = hoppaMall(src, k); k = sub - 1; }
          else if (ch === '\n') rad++;
          k++;
        }
        uttryck.push({ src: src.slice(s0, k), rad });
        j = k + 1;
        continue;
      }
      if (c === '\n') rad++;
      v += c; j++;
    }
    delar.push(v);
    return { delar, uttryck, j };
  }
  while (i < n) {
    const c = src[i];
    if (c === '\n') { rad++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const slut = e < 0 ? n : e + 2; rad += (src.slice(i, slut).match(/\n/g) || []).length; i = slut; continue; }
    if (c === '"' || c === "'") { const r0 = rad; const r = las(c); tok.push({ t: 'str', v: r.v, rad: r0 }); i = r.j; continue; }
    if (c === '`') { const r0 = rad; const m = mall(); tok.push({ t: 'mall', delar: m.delar, uttryck: m.uttryck, rad: r0 }); i = m.j; continue; }
    if (/[A-Za-z_$À-￿]/.test(c)) { let j = i + 1; while (j < n && /[\w$À-￿]/.test(src[j])) j++; tok.push({ t: 'id', v: src.slice(i, j), rad }); i = j; continue; }
    if (/\d/.test(c)) { let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++; tok.push({ t: 'num', v: src.slice(i, j), rad }); i = j; continue; }
    if (c === '/') {
      const f = sista();
      const arRegex = !f || (f.t === 'p' && REGEX_EFTER.has(f.v)) || (f.t === 'id' && REGEX_ORD.has(f.v));
      if (arRegex) {
        let j = i + 1, klass = false;
        while (j < n && src[j] !== '\n') { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') klass = true; else if (ch === ']') klass = false; else if (ch === '/' && !klass) break; j++; }
        j++; while (j < n && /[a-z]/.test(src[j])) j++;
        tok.push({ t: 'regex', v: src.slice(i, j), rad }); i = j; continue;
      }
    }
    const tre = src.slice(i, i + 3), tva = src.slice(i, i + 2);
    const p = ['===', '!==', '...', '**=', '>>>'].includes(tre) ? tre : ['=>', '==', '!=', '&&', '||', '??', '+=', '-=', '<=', '>=', '?.', '++', '--', '**'].includes(tva) ? tva : c;
    tok.push({ t: 'p', v: p, rad }); i += p.length;
  }
  return tok;
}
function hoppaMall(src, i) {   // returnerar index efter avslutande `
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && src[j + 1] === '{') {
      let d = 1, k = j + 2;
      while (k < src.length && d > 0) { const ch = src[k]; if (ch === '{') d++; else if (ch === '}') d--; else if (ch === '`') { k = hoppaMall(src, k) - 1; } else if (ch === '"' || ch === "'") { k++; while (k < src.length && src[k] !== ch) { if (src[k] === '\\') k++; k++; } } k++; }
      j = k; continue;
    }
    j++;
  }
  return j;
}
function escape(src, j) {
  const c = src[j + 1];
  const M = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (c in M) return { v: M[c], j: j + 2 };
  if (c === 'u') {
    if (src[j + 2] === '{') { const e = src.indexOf('}', j); return { v: String.fromCodePoint(parseInt(src.slice(j + 3, e), 16)), j: e + 1 }; }
    return { v: String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)), j: j + 6 };
  }
  if (c === 'x') return { v: String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)), j: j + 4 };
  if (c === '\n') return { v: '', j: j + 2 };
  return { v: c, j: j + 2 };
}

/* ── HTML: textnoder och attribut ── */
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–', hellip: '…', middot: '·', rarr: '→', larr: '←', uarr: '↑', darr: '↓', times: '×', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»', bull: '•', deg: '°', shy: '' };
const avkoda = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const INLINE = new Set(['b', 'i', 'strong', 'em', 'a', 'span', 'code', 'kbd', 'u', 's', 'small', 'mark', 'sup', 'sub', 'abbr']);
// Delar upp html i bitar: {typ:'text', v} | {typ:'tagg', namn, slut, attr:{}}. GRANS = platsen för ett ${}/sammanfogning.
const GRANS = '\u0000';
function htmlBitar(html) {
  const ut = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i); i = e < 0 ? html.length : e + 3; continue; }
    if (html[i] === '<' && /[a-zA-Z/!]/.test(html[i + 1] || '')) {
      // läs taggen; citerade värden kan innehålla >
      let j = i + 1, q = null;
      while (j < html.length) { const c = html[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
      const inre = html.slice(i + 1, j);
      const m = /^(\/?)([a-zA-Z][\w-]*)/.exec(inre);
      if (m) {
        const attr = {};
        const re = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        let a; const rest = inre.slice(m[0].length);
        while ((a = re.exec(rest))) attr[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? '';
        ut.push({ typ: 'tagg', namn: m[2].toLowerCase(), slut: !!m[1], attr });
        const namn = m[2].toLowerCase();
        if (!m[1] && (namn === 'script' || namn === 'style')) {
          const e = html.toLowerCase().indexOf('</' + namn, j);
          ut.push({ typ: namn, v: html.slice(j + 1, e < 0 ? html.length : e), off: j + 1 });
          i = e < 0 ? html.length : e; continue;
        }
      }
      i = j + 1; continue;
    }
    let j = html.indexOf('<', i + 1); if (j < 0) j = html.length;
    while (j < html.length && !/[a-zA-Z/!]/.test(html[j + 1] || '')) { j = html.indexOf('<', j + 1); if (j < 0) j = html.length; }
    ut.push({ typ: 'text', v: html.slice(i, j), off: i });
    i = j;
  }
  return ut;
}

/* ── Insamling ── */
const funna = new Map();        // text → Set(plats)
const problem = [];             // { plats, typ, text }
const huvudUtanT = [];          // huvudprocesstext som inte går genom T()
function lagg(s, plats) {
  const k = norm(s);
  if (!k) return;
  if (!funna.has(k)) funna.set(k, new Set());
  funna.get(k).add(plats);
}
function prob(plats, typ, text) { problem.push({ plats, typ, text: norm(text).slice(0, 140) }); }

// Text i en html-bit (från fil eller sträng). grans=true om strängen satts ihop med kod på den sidan.
function frånHtml(html, plats, { fil = false, rad = 1 } = {}) {
  const bitar = htmlBitar(html);
  let radNu = rad;
  const radFor = (off) => rad + (html.slice(0, off).match(/\n/g) || []).length;
  for (let b = 0; b < bitar.length; b++) {
    const x = bitar[b];
    if (x.typ === 'tagg') {
      for (const [a, v] of Object.entries(x.attr)) {
        if (!ATTR.has(a)) continue;
        if (v.includes(GRANS)) { for (const d of v.split(GRANS)) if (naturlig(norm(avkoda(d)))) prob(plats, 'attribut med kod', v.replace(/\u0000/g, '${…}')); continue; }
        const t = norm(avkoda(v)); if (naturlig(t) || (t && fil && harSvensk(t))) lagg(t, plats);
      }
      continue;
    }
    if (x.typ === 'script') {
      if (fil && !/\btype\s*=\s*["']?(application\/json|importmap)/i.test(JSON.stringify(bitar[b - 1] && bitar[b - 1].attr))) fronJs(x.v, plats.split(':')[0], radFor(x.off));
      continue;
    }
    if (x.typ === 'style') { for (const m of x.v.matchAll(/content:\s*"([^"]+)"/g)) if (naturlig(m[1])) prob(plats.split(':')[0] + ':' + radFor(x.off), 'CSS content-text', m[1]); continue; }
    if (x.typ !== 'text') continue;
    const delar = x.v.split(GRANS);
    const p = plats.includes(':') ? plats : plats + ':' + radFor(x.off);
    if (delar.length > 1) {
      const nat = delar.map((d) => norm(avkoda(d))).filter((d) => naturlig(d));
      if (nat.length) prob(p, 'ihopsatt text', x.v.replace(/\u0000/g, '${…}'));
      for (const d of delar) { const t = norm(avkoda(d)); if (naturlig(t)) lagg(t, p); }
      continue;
    }
    const t = norm(avkoda(x.v));
    if (!t) continue;
    if (naturlig(t) || (fil && harSvensk(t) && /\p{L}{2}/u.test(t))) {
      lagg(t, p);
      // uppdelad mening: text bredvid en inline-tagg på samma nivå (t.ex. "Klicka <b>här</b> för")
      // (bara när texten fortsätter en mening: börjar med gemen eller skiljetecken efter en inline-tagg med text före)
      let fore = null;
      for (let q = b - 1; q >= 0; q--) { const y = bitar[q]; if (y.typ === 'text') { if (norm(y.v)) { fore = norm(avkoda(y.v)); break; } continue; } if (y.typ === 'tagg' && INLINE.has(y.namn) && y.namn !== 'br') continue; break; }
      if (fore && /^[a-zåäö,.;:)\/–—·]/.test(t) && !/^[·–—]\s/.test(t)) prob(p, 'uppdelad i flera noder', fore + ' ‖ ' + t);
    }
  }
}

// En JS-källa. fil = relativ sökväg (för rapporten), huvud = körs i huvudprocessen (ingen DOM-översättning)
// Rader mellan kommentarerna "i18n-hoppa-start" och "i18n-hoppa-slut" (t.ex. Falks instruktioner till AI-modellen) är
// inte UI-text och tas inte med.
function hoppRader(src, startRad) {
  const ut = []; let start = null;
  src.split('\n').forEach((r, i) => { if (/i18n-hoppa-start/.test(r)) start = startRad + i; else if (/i18n-hoppa-slut/.test(r) && start != null) { ut.push([start, startRad + i]); start = null; } });
  return ut;
}
function fronJs(src, fil, startRad = 1, huvud = false) {
  const hopp = hoppRader(src, startRad);
  const tok = lexa(src, startRad).filter((x) => !hopp.some(([a, b]) => x.rad >= a && x.rad <= b));
  const sig = (k) => tok[k] || { t: 'slut', v: '' };
  // Strängar i loggar (console.log(…), klog(…)) visas aldrig
  const ilogg = new Set();
  for (let k = 0; k < tok.length; k++) {
    let start = -1;
    if (tok[k].v === 'console' && sig(k + 1).v === '.' && sig(k + 3).v === '(') start = k + 3;
    else if (['klog', 'dlog'].includes(tok[k].v) && sig(k + 1).v === '(') start = k + 1;
    if (start < 0) continue;
    let d = 0;
    for (let j = start; j < tok.length; j++) { if (tok[j].v === '(') d++; else if (tok[j].v === ')') { d--; if (!d) break; } else ilogg.add(j); }
  }
  for (let k = 0; k < tok.length; k++) {
    const x = tok[k];
    if (x.t !== 'str' && x.t !== 'mall') continue;
    if (ilogg.has(k)) continue;
    const plats = fil + ':' + x.rad;
    const f1 = sig(k - 1), f2 = sig(k - 2), f3 = sig(k - 3), e1 = sig(k + 1);
    // t('…'), window.t('…'), D.T('…'), Jul.tx('…')
    const iT = f1.v === '(' && f2.t === 'id' && TFUNK.has(f2.v) && (f3.v !== '.' || ['window', 'D', 'Jul', 'self', 'globalThis'].includes(sig(k - 4).v));
    if (x.t === 'mall') {
      // statiska delar; tagged templates (css`…`) hoppas över
      if (f1.t === 'id' && !['return', 'case', 'typeof', 'in', 'of', 'yield', 'await'].includes(f1.v)) continue;
      const helt = x.delar.join(GRANS);
      for (const u of x.uttryck) fronJs(u.src, fil, u.rad, huvud);
      if (iT) { if (x.uttryck.length) prob(plats, 't() med ${}', helt.replace(/\u0000/g, '${…}')); else lagg(x.delar[0], plats); continue; }
      if (/<\/?[a-z][\w-]*[\s>/]/i.test(helt)) { frånHtml(helt, plats, { rad: x.rad }); continue; }
      if (x.uttryck.length) {
        const nat = x.delar.filter((d) => naturlig(norm(d)));
        if (nat.length) prob(plats, 'ihopsatt text (mall)', helt.replace(/\u0000/g, '${…}'));
        for (const d of x.delar) if (naturlig(norm(d))) lagg(d, plats);
        continue;
      }
      if (naturlig(norm(x.delar[0]))) { lagg(x.delar[0], plats); if (huvud && !iT) huvudUtanT.push({ plats, text: norm(x.delar[0]) }); }
      continue;
    }
    const v = x.v;
    if (iT) { if (norm(v)) lagg(v, plats); continue; }
    // nycklar i objekt/jämförelser/kodanrop som aldrig visas
    if (f1.v === '[' && sig(k + 1).v === ']') continue;   // obj['nyckel']
    if (['querySelector', 'querySelectorAll', 'getElementById', 'closest', 'matches', 'addEventListener', 'removeEventListener', 'getAttribute', 'setAttribute', 'removeAttribute', 'hasAttribute', 'createElement', 'require', 'send', 'sendSync', 'invoke', 'on', 'once', 'handle', 'emit', 'getItem', 'setItem', 'removeItem', 'getPropertyValue', 'setProperty', 'toggle', 'add', 'remove', 'contains', 'get', 'has', 'startsWith', 'endsWith', 'includes', 'indexOf', 'split', 'join', 'test', 'exec', 'match', 'log', 'warn', 'error', 'info', 'debug'].includes(f2.v) && f1.v === '(' && f3.v === '.') {
      if (!['includes', 'indexOf', 'startsWith', 'endsWith', 'join'].includes(f2.v)) continue;
    }
    if (f1.v === '(' && ['Error', 'TypeError', 'RangeError'].includes(f2.v)) continue;
    if (/<\/?[a-z][\w-]*[\s>/]/i.test(v)) {
      // HTML-sträng: sammanfogning på någon sida räknas som gräns
      const vanster = f1.v === '+' ? GRANS : '', hoger = e1.v === '+' ? GRANS : '';
      frånHtml(vanster + v + hoger, plats, { rad: x.rad });
      continue;
    }
    const t = norm(v);
    if (f1.v === ':' && ['sok', 'sokord'].includes(f2.v)) continue;   // sökord för kommandopaletten, visas inte
    if (!naturlig(t)) continue;
    lagg(t, plats);
    const ihop = (f1.v === '+' && !(f2.v === ')' && /\bt\(|T\(|tr\(|tx\(/.test(''))) || e1.v === '+';
    if (ihop && /^\s|\s$|[:,]$/.test(v) || (ihop && /^[a-zåäö]/.test(t))) prob(plats, 'ihopsatt text (+)', v);
    if (huvud) huvudUtanT.push({ plats, text: t, nyckel: f1.v === ':' && f2.t === 'id' ? f2.v : '' });
  }
}

function filer() {
  const ut = [];
  for (const f of fs.readdirSync(path.join(ROT, 'ui'))) if (/\.(html|js)$/.test(f)) ut.push('ui/' + f);
  for (const f of fs.readdirSync(ROT)) if (/\.js$/.test(f)) ut.push(f);
  return ut.filter((f) => !HOPPA.has(f)).sort();
}

function kor() {
  for (const f of filer()) {
    const src = fs.readFileSync(path.join(ROT, f), 'utf8');
    if (f.endsWith('.html')) frånHtml(src, f, { fil: true });
    else fronJs(src, f, 1, !f.startsWith('ui/') && !/preload/.test(f) && f !== 'lasvy.js');
  }
  return funna;
}

module.exports = { naturlig, norm, lexa, kor, funna, problem, huvudUtanT };

if (require.main === module) {
  kor();
  const gammal = JSON.parse(fs.readFileSync(BAS, 'utf8'));
  const nya = [...funna.keys()].filter((s) => !gammal.includes(s));
  const doda = gammal.filter((s) => !funna.has(s));
  console.log('funna:', funna.size, ' i basen:', gammal.length, ' nya:', nya.length, ' finns inte längre i koden:', doda.length);
  if (ARG.has('--alla')) for (const [s, p] of [...funna].sort()) console.log(JSON.stringify(s), '  ', [...p].slice(0, 3).join(' '));
  if (ARG.has('--nya')) for (const s of nya) console.log('NY  ', JSON.stringify(s), '  ', [...funna.get(s)].slice(0, 2).join(' '));
  if (ARG.has('--doda')) for (const s of doda) console.log('DÖD ', JSON.stringify(s));
  if (ARG.has('--rapport')) {
    console.log('\n── Går inte att översätta som den står (' + problem.length + ') ──');
    for (const p of problem) console.log(p.plats.padEnd(32), p.typ.padEnd(24), p.text);
    console.log('\n── Huvudprocessen: text utan T() (' + huvudUtanT.length + ') ──');
    for (const p of huvudUtanT) console.log(p.plats.padEnd(32), (p.nyckel || '').padEnd(10), p.text.slice(0, 120));
  }
  if (ARG.has('--skriv')) {
    // Döda strängar tas bort; strängar som bara finns i basen men ändå används på annat sätt kan läggas i HALL
    const hall = new Set(require('./i18n-marken').HALL || []);
    const ut = [...new Set([...gammal.filter((s) => funna.has(s) || hall.has(s)), ...nya, ...hall])];
    fs.writeFileSync(BAS, JSON.stringify(ut, null, 1) + '\n');
    console.log('skrev', BAS, ut.length, 'strängar');
  }
}
