#!/usr/bin/env node
// Översätter ui/locales/_sv-base.json till ui/locales/<lang>.json för alla språk i ui/i18n.js (Googles gratis-endpoint).
// Återupptagbar: bara strängar som saknas i språkfilen översätts, och filen sparas efter varje omgång.
//
// Säkerhet och kvalitet:
//   - Flera strängar per anrop (en q= per sträng; svaret är en lista i samma ordning). Stämmer inte antalet, eller klarar
//     en sträng inte kontrollen nedan, översätts strängarna i omgången en och en.
//   - Varumärken (tools/i18n-marken.js), {platshållare}, kortkommandon (Ctrl+Shift+T, Esc, F11), adresser, #färger och
//     [[taggar]] byts mot ⟦0⟧, ⟦1⟧ … före översättningen och tillbaka efteråt. Saknas en markör efteråt underkänns svaret.
//   - Ledande/avslutande tecken som inte är ord (· → … : ( ) tas bort före och sätts tillbaka efter, pilar inne i texten
//     måste finnas lika många efteråt, och en punkt som Google lagt till på en text utan punkt tas bort.
//   - 429 (för många anrop): väntar (30 s, 60 s … upp till 10 min) och fortsätter. Ger aldrig upp tyst: strängar som inte
//     gick att översätta listas sist och skriptet avslutar med felkod 1.
//
//   - Har en sträng handrättad engelska i tools/i18n-rattelser.json översätts de andra språken från den engelskan
//     (sl=en): korta UI-ord blir mindre tvetydiga så ("Logga" → Logo, inte Log in).
//
// Användning: node tools/gen_i18n.js [språk,språk…] [--om <regex>] [--om-rattade] [--behall-doda] [--torr]
//   --om <regex>     översätt om strängar vars svenska text matchar (t.ex. efter att ha rättat en term)
//   --om-rattade     översätt om alla strängar som har handrättad engelska (alla språk utom en), från engelskan
//   --behall-doda    låt översättningar av strängar som inte längre finns i basen ligga kvar (annars rensas de)
//   --torr           visa bara hur mycket som saknas per språk
const fs = require('fs'), path = require('path'), https = require('https');
const MARKEN = require('./i18n-marken');

const ROT = path.join(__dirname, '..');
const LOCDIR = process.env.I18N_LOCDIR || path.join(ROT, 'ui', 'locales');   // I18N_LOCDIR: provkörning i en annan mapp
const BASE = JSON.parse(fs.readFileSync(path.join(LOCDIR, '_sv-base.json'), 'utf8'));
const ARGV = process.argv.slice(2);
const flagga = (f) => ARGV.includes(f);
const varde = (f) => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null; };
const ALLA = (() => {   // språklistan i ui/i18n.js (utom sv) är sanningen
  const src = fs.readFileSync(path.join(ROT, 'ui', 'i18n.js'), 'utf8');
  return [...src.matchAll(/\['([a-zA-Z-]+)',\s*'[^']+'\]/g)].map((m) => m[1]).filter((l) => l !== 'sv');
})();
const forstaArg = ARGV[0] && !ARGV[0].startsWith('--') ? ARGV[0] : null;
const LANGS = forstaArg ? forstaArg.split(',') : ALLA;
const OM = varde('--om') ? new RegExp(varde('--om')) : null;
// --om-rattade: översätt om (alla språk utom en) de strängar som har handrättad engelska, från engelskan
const GOOGLE = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', he: 'iw', nb: 'no', 'pt-PT': 'pt-PT', pt: 'pt' };   // språkkod hos Google

// Handrättade översättningar (tools/i18n-rattelser.json: { "en": { "svensk text": "rättad" } }) läggs alltid över
// maskinöversättningen, också när den körs om.
const RATT = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-rattelser.json'), 'utf8')); } catch { return {}; } })();
const sov = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Skydd: byt ut det som inte får översättas mot ⟦n⟧ ── */
const SKYDD = [
  /\{[a-z]\w*\}/g,                                                                   // {platshållare}
  /\[\[[^\]]*\]\]/g,                                                                 // [[gör:…]]
  /\b(?:https?|adraze|file):\/\/[^\s)]+/g,                                           // adresser
  /\b[\w.-]+@[\w-]+\.[\w.]+\b/g,                                                     // mejl
  /\b(?:[a-z0-9-]+\.)+(?:se|com|app|net|org|io|nu|cc|de|uk)\b(?:\/[^\s)]*)?/g,       // domäner
  /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|#rrggbb\b/g,                                  // färger
  /\b(?:(?:Ctrl|Cmd|Alt|Shift|Super|Meta|Option|AltGr|CmdOrCtrl)\+)+(?:[A-ZÅÄÖ0-9]\b|F\d{1,2}\b|Enter|Esc|Tab|Delete|Backspace|PageUp|PageDown|Home|End|Space|[+\-=,.\/[\]←→↑↓]|\w+)/g,
  /\b(?:Esc|Enter|F\d{1,2})\b/g,                                                      // ensamma tangenter
];
const MARKMONSTER = new RegExp('(?<![\\p{L}\\d])(?:' + MARKEN.MONSTER.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\d])', 'gu');
function skydda(s) {
  const bitar = [];
  const byt = (m) => { bitar.push(m); return '⟦' + (bitar.length - 1) + '⟧'; };
  let t = s;
  for (const re of SKYDD) t = t.replace(re, byt);
  t = t.replace(MARKMONSTER, byt);
  // Ledande/avslutande tecken som inte är ord
  const fore = (/^[\s·•→←↑↓–—\-+*#(\[“"'«¡¿]+/.exec(t) || [''])[0].replace(/⟦$/, '');
  const efter = (/[\s:…→←↑↓·–—)\]”"'»]+$/.exec(t.slice(fore.length)) || [''])[0];
  const karna = t.slice(fore.length, t.length - efter.length);
  return { karna, fore, efter, bitar };
}
function aterstall(oversatt, sk, original) {
  let t = String(oversatt || '').trim();
  // Google skriver ibland om markören (mellanslag, andra parenteser)
  t = t.replace(/[⟦［\[]\s*(\d+)\s*[⟧］\]]/g, (m, n) => (+n < sk.bitar.length ? '⟦' + n + '⟧' : m));
  for (let i = 0; i < sk.bitar.length; i++) {
    const m = '⟦' + i + '⟧';
    if (t.split(m).length !== 2) return { fel: 'markör ' + m + ' saknas eller dubbel' };
    t = t.replace(m, () => sk.bitar[i]);
  }
  if (/⟦\d+⟧/.test(t)) return { fel: 'okänd markör' };
  if (!/[.。!?！？]$/.test(sk.karna) && /[^.]\.$|。$/.test(t)) t = t.replace(/[.。]$/, '');   // tillagd punkt
  if (/[.!?]$/.test(sk.karna) && !/[.。!?！？؟।]$/.test(t)) t += sk.karna.slice(-1);     // borttappad punkt
  t = sk.fore + t + sk.efter;
  const antal = (x, re) => (x.match(re) || []).length;
  for (const re of [/[→←]/g, /[↑↓]/g, /·/g, /•/g]) if (antal(original, re) !== antal(t, re)) return { fel: 'antalet ' + re.source + ' ändrades' };   // → får bli ← (höger-till-vänster)
  if (!t.trim()) return { fel: 'tomt' };
  return { text: t };
}

/* ── Anrop ── */
function hamta(qs, tl, sl = 'sv') {
  return new Promise((res, rej) => {
    const u = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=' + sl + '&tl=' + encodeURIComponent(GOOGLE[tl] || tl) + '&' + qs.map((q) => 'q=' + encodeURIComponent(q)).join('&');
    const req = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' }, timeout: 30000 }, (r) => {
      let d = ''; r.setEncoding('utf8');
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        if (r.statusCode === 429 || r.statusCode === 503) return rej(Object.assign(new Error('429'), { kod: 429 }));
        if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
        try {
          let j = JSON.parse(d);
          if (!Array.isArray(j)) return rej(new Error('oväntat svar'));
          // Ett q ger ["text"] eller [["text","sv"]]; flera ger en lista med samma form per sträng
          j = j.map((x) => (Array.isArray(x) ? x[0] : x));
          res(j);
        } catch (e) { rej(new Error('kunde inte läsa svaret')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', rej);
  });
}
let vantaTill = 0;   // gemensam paus för alla arbetare efter 429
async function hamtaMedVantan(qs, tl, sl) {
  let paus = 30000, natfel = 0;
  for (;;) {
    const nu = Date.now(); if (vantaTill > nu) await sov(vantaTill - nu);
    try { return await hamta(qs, tl, sl); } catch (e) {
      if (e.kod === 429) {
        if (paus > 600000) throw new Error('Google svarar fortfarande 429 efter 10 minuters väntan – kör igen senare (allt hittills är sparat)');
        console.log('  429 från Google (' + tl + '): väntar ' + Math.round(paus / 1000) + ' s');
        vantaTill = Date.now() + paus; paus *= 2; continue;
      }
      if (++natfel > 5) throw e;
      await sov(2000 * natfel);
    }
  }
}

const MAXTECKEN = 3500;   // ungefärlig gräns för adressens längd (kodad)
function omgangar(lista) {
  const ut = []; let cur = [], len = 0;
  for (const s of lista) {
    const l = encodeURIComponent(s).length + 3;
    if (cur.length && (len + l > MAXTECKEN || cur.length >= 60)) { ut.push(cur); cur = []; len = 0; }
    cur.push(s); len += l;
  }
  if (cur.length) ut.push(cur);
  return ut;
}

// Källa: den handrättade engelskan när den finns (bättre än svenskan för korta, tvetydiga UI-ord), annars svenskan
const KALLA_EN = RATT.en || {};
const kalla = (s, tl) => (tl !== 'en' && KALLA_EN[s] ? { text: KALLA_EN[s], sl: 'en' } : { text: s, sl: 'sv' });
async function oversattOmgang(strangar, tl) {
  const ut = new Map(), fel = [];
  for (const sl of ['sv', 'en']) {
    const del = strangar.filter((s) => kalla(s, tl).sl === sl);
    if (!del.length) continue;
    const r = await oversattDel(del, tl, sl);
    for (const [k, v] of r.ut) ut.set(k, v);
    fel.push(...r.fel);
  }
  return { ut, fel };
}
async function oversattDel(strangar, tl, sl) {
  const sk = strangar.map((s) => skydda(kalla(s, tl).text));
  const ut = new Map(), fel = [];
  const enkla = [];  // sl: källspråket för den här delen
  // tomma kärnor (bara tecken/varumärken): inget att översätta
  const att = [];
  sk.forEach((x, i) => { if (!/\p{L}/u.test(x.karna.replace(/⟦\d+⟧/g, ''))) ut.set(strangar[i], kalla(strangar[i], tl).text); else att.push(i); });
  if (!att.length) return { ut, fel };
  let svar = null;
  try { svar = await hamtaMedVantan(att.map((i) => sk[i].karna), tl, sl); } catch (e) { if (/10 minuters/.test(e.message)) throw e; svar = null; }
  if (!svar || svar.length !== att.length) enkla.push(...att);
  else att.forEach((i, k) => { const r = aterstall(svar[k], sk[i], kalla(strangar[i], tl).text); if (r.text != null) ut.set(strangar[i], r.text); else enkla.push(i); });
  for (const i of enkla) {
    let r = null;
    try { const s1 = await hamtaMedVantan([sk[i].karna], tl, sl); r = aterstall(s1[0], sk[i], kalla(strangar[i], tl).text); } catch (e) { if (/10 minuters/.test(e.message)) throw e; r = { fel: e.message }; }
    if (r.text == null) {
      // Andra försöket utan markörer: platshållare, namn och adresser skickas som de är och måste finnas kvar ordagrant
      try {
        const kallText = kalla(strangar[i], tl).text;
        const rad = skydda(kallText);
        const ren = rad.bitar.reduce((x, b, n) => x.replace('⟦' + n + '⟧', () => b), rad.karna);
        const s2 = (await hamtaMedVantan([ren], tl, sl))[0];
        const r2 = aterstall(String(s2 || '').trim(), { ...rad, bitar: [] }, kallText);
        if (r2.text != null && rad.bitar.every((b) => r2.text.split(b).length - 1 === kallText.split(b).length - 1)) r = r2;
      } catch (e) { if (/10 minuters/.test(e.message)) throw e; }
    }
    if (r.text != null) ut.set(strangar[i], r.text); else fel.push({ s: strangar[i], fel: r.fel });
  }
  return { ut, fel };
}

function sparaAtomiskt(fil, obj) {
  const tmp = fil + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, fil);
}

(async () => {
  const allaFel = [];
  const summering = [];
  const baseSet = new Set(BASE);
  // Språken körs parallellt (några åt gången); inom ett språk en omgång i taget
  const ko = [...LANGS];
  async function arbetare() {
    while (ko.length) {
      const lang = ko.shift();
      const file = path.join(LOCDIR, lang + '.json');
      let dict = {}; try { dict = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      let rensade = 0;
      if (!flagga('--behall-doda')) for (const k of Object.keys(dict)) if (!baseSet.has(k)) { delete dict[k]; rensade++; }
      const ratt = RATT[lang] || {};
      const omRatt = flagga('--om-rattade') && lang !== 'en' ? (RATT.en || {}) : {};
      const todo = BASE.filter((s) => (!(s in dict) || (OM && OM.test(s)) || s in omRatt) && !(s in ratt));
      if (flagga('--torr')) { summering.push(lang + ': saknas ' + todo.length + (rensade ? ', döda ' + rensade : '')); continue; }
      let klara = 0;
      for (const omg of omgangar(todo)) {
        const { ut, fel } = await oversattOmgang(omg, lang);
        for (const [k, v] of ut) dict[k] = v;
        klara += ut.size;
        for (const f of fel) allaFel.push({ lang, ...f });
        sparaAtomiskt(file, dict);
      }
      let rattade = 0;
      for (const [k, v] of Object.entries(ratt)) if (baseSet.has(k) && dict[k] !== v) { dict[k] = v; rattade++; }
      if ((!todo.length && rensade) || rattade) sparaAtomiskt(file, dict);
      summering.push(lang + ': +' + klara + (rensade ? ', rensade ' + rensade : '') + (rattade ? ', handrättade ' + rattade : '') + ' → ' + BASE.filter((s) => s in dict).length + '/' + BASE.length);
      console.log(summering[summering.length - 1]);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, LANGS.length) }, arbetare));
  } catch (e) {
    console.error('AVBRUTET:', e.message);
    process.exitCode = 2;
  }
  if (flagga('--torr')) console.log(summering.join('\n'));
  if (allaFel.length) {
    console.log('\nKunde inte översättas (' + allaFel.length + '), faller tillbaka på svenska tills nästa körning:');
    for (const f of allaFel.slice(0, 200)) console.log('  ' + f.lang.padEnd(6) + JSON.stringify(f.s).slice(0, 90) + '  (' + f.fel + ')');
    process.exitCode = process.exitCode || 1;
  } else if (!flagga('--torr') && !process.exitCode) console.log('ALLT KLART');
})();
