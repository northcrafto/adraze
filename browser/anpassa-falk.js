// Falk ändrar Anpassa-inställningar (färger, ljust/mörkt, densitet, flikar, verktygsfält …) med vanligt språk.
// Falk lägger [[gör:anpassa=NYCKEL|VÄRDE]], [[gör:anpassa_angra]] eller [[gör:anpassa_aterstall=OMRÅDE]] sist i svaret;
// Falk-panelen (ui/anpassa-falk.js) skickar taggen hit och visar vad som hände.
//
// Allt avgörs HÄR, aldrig i panelen:
//  • bara nycklar som finns i registret (anpassa.js) – läses vid varje anrop, så alla områden som registrerats syns
//  • bara giltiga värden: ett av nyckelns val (registreringens val), på/av, en färg – eller egen CSS för en sajt.
//    Listor, objekt och värden utan känt format ändrar du själv i Inställningar (Falk kan inte veta vad som är giltigt)
//  • barnlåsta nycklar ändras aldrig i barnläge (grunden spärrar också)
//  • allt som kan köra kod, ladda webbsidor eller ändra sökningen (avancerat.*, barnlåsta och icke importerbara nycklar)
//    ändras först när du godkänt i en ruta, med "Avbryt" förvalt – Falks svar kan bygga på text från en webbsida
const { ipcMain, dialog } = require('electron');
const anpassa = require('./anpassa');
const angra = require('./anpassa-angra');

let T = (s) => s;

const fold = (s) => String(s == null ? '' : s).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').trim();
const HEX = /^#[0-9a-f]{6}$/i;

// Vanliga sätt att säga värdena (vikta: å/ä → a, ö → o, mellanslag → _). De tillåtna värdena står i registret (val),
// och val här används bara om ett område registrerat nyckeln utan val men med samma standard.
const KANDA = {
  'tema.lage': { val: ['ljust', 'morkt', 'system'], syn: { ljus: 'ljust', light: 'ljust', dag: 'ljust', mork: 'morkt', dark: 'morkt', natt: 'morkt', morkerlage: 'morkt', morklage: 'morkt', auto: 'system', automatiskt: 'system', datorns: 'system', samma_som_datorn: 'system', folj_datorn: 'system', folj_systemet: 'system' } },
  'tema.densitet': { val: ['kompakt', 'normal', 'luftig'], syn: { kompaktare: 'kompakt', tat: 'kompakt', tatare: 'kompakt', mindre: 'kompakt', tight: 'kompakt', mellan: 'normal', vanlig: 'normal', luftigare: 'luftig', rymlig: 'luftig', rymligare: 'luftig', storre: 'luftig', glesare: 'luftig' } },
  'tema.horn': { val: ['kantig', 'normal', 'rund'], syn: { kantigare: 'kantig', kantiga: 'kantig', fyrkantig: 'kantig', skarp: 'kantig', skarpa: 'kantig', raka: 'kantig', rundare: 'rund', runda: 'rund', rundade: 'rund', mjuk: 'rund', mjuka: 'rund' } },
  'tema.typsnitt': { val: ['system', 'klassisk', 'tydlig', 'serif', 'mono'], syn: { vanlig: 'system', vanligt: 'system', klassiskt: 'klassisk', tydligt: 'tydlig', tydligare: 'tydlig', lattlast: 'tydlig', lattlasta: 'tydlig', seriff: 'serif', antikva: 'serif', monospace: 'mono', kod: 'mono', kodtypsnitt: 'mono' } },
  'tema.storlek': { val: ['liten', 'normal', 'stor'], syn: { mindre: 'liten', sma: 'liten', liten_text: 'liten', mindre_text: 'liten', storre: 'stor', stora: 'stor', stor_text: 'stor', storre_text: 'stor', vanlig: 'normal', mellan: 'normal' } },
  'flikar.lage': { val: ['upptill', 'vertikal', 'dolda'], syn: { vertikalt: 'vertikal', vertikala: 'vertikal', sidan: 'vertikal', pa_sidan: 'vertikal', vansterkant: 'vertikal', sidopanel: 'vertikal', uppe: 'upptill', overst: 'upptill', horisontellt: 'upptill', horisontella: 'upptill', vanligt: 'upptill', dold: 'dolda', gomda: 'dolda', gom: 'dolda', dolj: 'dolda', inga: 'dolda' } },
  'flikar.nyFlik': { val: ['sist', 'bredvid'], syn: { sista: 'sist', slutet: 'sist', i_slutet: 'sist', langst_bort: 'sist', intill: 'bredvid', bredvid_aktuell: 'bredvid', efter_aktuell: 'bredvid', bredvid_den_aktiva: 'bredvid' } },
  'flikar.sistaFlik': { val: ['stang', 'ny'], syn: { stang_fonstret: 'stang', stangs: 'stang', ny_flik: 'ny', oppna_ny_flik: 'ny', oppna_en_ny_flik: 'ny', behall_fonstret: 'ny' } },
  'flikar.stangKnapp': { val: ['alla', 'aktiv'], syn: { pa_alla: 'alla', alla_flikar: 'alla', aktiva: 'aktiv', bara_aktiv: 'aktiv', bara_den_aktiva: 'aktiv', aktiv_flik: 'aktiv' } },
  'flikar.sova': { val: [0, 15, 30, 60, 120], syn: { av: 0, aldrig: 0, kvart: 15, en_kvart: 15, halvtimme: 30, en_halvtimme: 30, timme: 60, en_timme: 60, tva_timmar: 120 } },
  'verktyg.placering': { val: ['uppe', 'nere'], syn: { upptill: 'uppe', overst: 'uppe', nertill: 'nere', botten: 'nere', langst_ner: 'nere', nederst: 'nere' } },
  'verktyg.adress': { val: ['hel', 'doman'], syn: { hela: 'hel', hela_adressen: 'hel', hel_adress: 'hel', full: 'hel', domanen: 'doman', bara_domanen: 'doman', domain: 'doman', kort: 'doman' } },
  'verktyg.bokmarkesfalt': { val: ['alltid', 'nyflik', 'aldrig'], syn: { visa: 'alltid', pa: 'alltid', ny_flik: 'nyflik', bara_pa_ny_flik: 'nyflik', pa_ny_flik: 'nyflik', dolj: 'aldrig', dold: 'aldrig', av: 'aldrig', gom: 'aldrig' } },
};
// Färgnamn → hex (för nycklar vars standard är en färg). Falk skriver oftast hex, men "mörkgrön" ska också gå.
const FARGER = {
  rod: '#d64b45', rott: '#d64b45', red: '#d64b45', morkrod: '#9b1c1c', vinrod: '#7f1d3a', rosa: '#e0559a', pink: '#e0559a', cerise: '#d6336c',
  orange: '#ff4b1f', gul: '#e0b100', yellow: '#e0b100', guld: '#c9a227', gold: '#c9a227', senap: '#c98a12',
  gron: '#2f9e67', green: '#2f9e67', morkgron: '#1f6b3a', darkgreen: '#1f6b3a', skogsgron: '#1f5135', ljusgron: '#5fd08a', lightgreen: '#5fd08a', mint: '#3eb489', mintgron: '#3eb489', oliv: '#6b7a2a', olivgron: '#6b7a2a',
  turkos: '#0f9fb0', teal: '#0f8b8d', petrol: '#0f6b73', bla: '#1d6fd8', blue: '#1d6fd8', morkbla: '#1e3a8a', darkblue: '#1e3a8a', marin: '#0e2a47', marinbla: '#0e2a47', navy: '#0e2a47',
  ljusbla: '#60a5fa', lightblue: '#60a5fa', himmelsbla: '#38bdf8', lila: '#7c3aed', purple: '#7c3aed', violett: '#6d28d9', brun: '#8b5a2b', brown: '#8b5a2b',
  gra: '#6b7280', grey: '#6b7280', gray: '#6b7280', morkgra: '#374151', ljusgra: '#9ca3af', grafit: '#3f4652', svart: '#141416', black: '#141416', vit: '#ffffff', white: '#ffffff',
};
const PA = /^(pa|ja|true|on|1|aktiv|aktivera|visa|sla_pa|tand)$/;
const AV = /^(av|nej|false|off|0|inaktiv|stang_av|dolj|gom|slack)$/;
const CSS_NYCKEL = 'avancerat.css';   // [{ id, mal, under, css, pa }] – se anpassa-avancerat.js
const CSS_MAX = 20000;

// Vilka värden nyckeln kan ha: registrets val, annars KANDA:s (om områdets standard är ett av dem)
function valFor(nyckel, def) {
  if (def && def.val !== undefined) return def.val;
  const k = KANDA[nyckel];
  return k && def && k.val.includes(def.standard) ? k.val : undefined;
}
/* Hur Falk kan ändra nyckeln: 'val' (ett av värdena), 'tal' (intervall), 'text', 'pa-av', 'farg', 'css' (egen CSS för en
 * sajt) – eller null: listor, objekt och värden utan känt format ändrar du själv i Inställningar (Falk kan inte veta
 * vad som är giltigt, och ett felaktigt värde kan förstöra området). */
function slag(nyckel, def) {
  if (!def) return null;
  if (nyckel === CSS_NYCKEL && Array.isArray(def.standard)) return 'css';
  const v = valFor(nyckel, def);
  if (Array.isArray(v)) return 'val';
  if (v === 'text') return 'text';
  if (v && typeof v === 'object') return 'tal';
  if (typeof def.standard === 'boolean') return 'pa-av';
  if (typeof def.standard === 'string' && HEX.test(def.standard)) return 'farg';
  return null;
}
const kanAndras = (nyckel, def) => !!slag(nyckel, def);
// Frågar först: kan köra kod, ladda webbsidor eller ändra sökning (samma nycklar som barnläget låser)
function risk(nyckel, def) { return /^avancerat\./.test(String(nyckel)) || !!(def && (def.barnLast || def.importBar === false)); }

// NYCKEL → { nyckel, def } ur registret (stavning med å/ä/ö och versaler går bra; "sajt.*"-mönster ger "sajt.<namn>")
function hittaDef(namn, reg) {
  const f = fold(namn).replace(/\s+/g, '');
  if (!f) return null;
  for (const [k, d] of Object.entries(reg)) if (!k.endsWith('.*') && fold(k) === f) return { nyckel: k, def: d };
  for (const [k, d] of Object.entries(reg)) {
    if (!k.endsWith('.*')) continue;
    const p = k.slice(0, -1);
    if (f.startsWith(fold(p)) && f.length > p.length) return { nyckel: p + String(namn).trim().slice(p.length).trim().toLowerCase(), def: d, monster: true };
  }
  return null;
}
function farg(t) {
  let s = String(t || '').trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return '#' + s.replace('#', '');
  if (/^#?[0-9a-f]{3}$/.test(s)) { s = s.replace('#', ''); return '#' + s.split('').map((c) => c + c).join(''); }
  const f = fold(s).replace(/[\s-]+/g, '');
  for (const v of [f, f.replace(/tt$/, ''), f.replace(/[at]$/, ''), f.replace(/a$/, '')]) if (FARGER[v]) return FARGER[v];
  return null;
}
// "30", "30 min", "240 px", "1 timme" → tal (timmar räknas om till minuter)
function talAv(t) {
  const m = /^(-?\d+(?:[.,]\d+)?)\s*(.*)$/.exec(String(t).trim());
  if (!m) return NaN;
  const n = Number(m[1].replace(',', '.'));
  return /^tim/.test(fold(m[2])) ? n * 60 : n;
}
const visaVal = (v) => v.map((x) => String(x)).join(', ');

// Egen CSS för en sajt: "youtube.com: body{…}" (eller "alla sajter: …"). Tom CSS tar bort sajtens regel.
function normSajt(s) {
  const f = fold(s).replace(/\s+/g, ' ');
  if (f === '*' || /^alla( sajter| sidor)?$/.test(f)) return '*';
  let h = String(s || '').trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#\s]/)[0].replace(/:\d+$/, '').replace(/^\*\./, '').replace(/^www\./, '').replace(/\.+$/, '');
  try { h = new URL('http://' + h).hostname; } catch { return ''; }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && h.length <= 253 ? h : '';
}
function cssTolka(text) {
  // Sajten får skrivas som en hel adress (https://www.example.com:8080/sida) – kolonen i "https://" och före porten skiljer inte
  const m = /^\s*(\*|alla(?:\s+(?:sajter|sidor))?|(?:[a-z][a-z0-9+.-]*:\/\/)?[^\s:{}\/]+(?::\d+)?(?:\/[^\s:{}]*)?)\s*:\s*([\s\S]*)$/i.exec(String(text || ''));
  if (!m) return { ok: false, fel: 'Skriv sajten först, t.ex. youtube.com: body { … }' };
  const mal = normSajt(m[1]);
  if (!mal) return { ok: false, fel: 'Skriv sajten som en adress, t.ex. youtube.com.' };
  const css = m[2].trim();
  if (css.length > CSS_MAX) return { ok: false, fel: 'CSS:en är för lång.' };
  return { ok: true, mal, css };
}
function cssRegler() { const v = anpassa.hamta(CSS_NYCKEL); return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []; }
const nyttId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sajtNamn = (mal) => (mal === '*' ? 'alla sajter' : mal);

// Falks text → ett värde som nyckeln kan ha. { ok, varde } eller { ok:false, fel }. För egen CSS även { css: { mal, css } }.
function tolka(nyckel, def, text) {
  const t = String(text == null ? '' : text).trim();
  if (/^(standard|aterstall|återställ|default|ursprunglig|ursprungligt)$/i.test(t)) return { ok: true, varde: undefined };
  const s = slag(nyckel, def);
  const f = fold(t).replace(/\s+/g, '_');
  if (s === 'val') {
    const val = valFor(nyckel, def), syn = (KANDA[nyckel] && KANDA[nyckel].syn) || {};
    let v = val.find((x) => fold(String(x)) === f);
    if (v === undefined && Object.prototype.hasOwnProperty.call(syn, f) && val.includes(syn[f])) v = syn[f];
    if (v === undefined && val.every((x) => typeof x === 'number')) { const n = talAv(t); if (val.includes(n)) v = n; }
    return v !== undefined ? { ok: true, varde: v } : { ok: false, fel: 'Tillåtna värden: ' + visaVal(val) + '.' };
  }
  if (s === 'tal') {
    const { min, max } = valFor(nyckel, def), n = talAv(t);
    return Number.isFinite(n) && n >= min && n <= max ? { ok: true, varde: n } : { ok: false, fel: 'Skriv ett tal från ' + min + ' till ' + max + '.' };
  }
  if (s === 'text') return t.length <= 500 ? { ok: true, varde: t } : { ok: false, fel: 'Texten är för lång.' };
  if (s === 'pa-av') {
    if (PA.test(f)) return { ok: true, varde: true };
    if (AV.test(f)) return { ok: true, varde: false };
    return { ok: false, fel: 'Skriv på eller av.' };
  }
  if (s === 'farg') {
    const h = farg(t);
    return h ? { ok: true, varde: h } : { ok: false, fel: 'Skriv färgen som hex, t.ex. #1f6b3a.' };
  }
  if (s === 'css') {
    const c = cssTolka(t); if (!c.ok) return c;
    const lista = cssRegler(), fore = lista.find((r) => r.mal === c.mal);
    if (!c.css && !fore) return { ok: false, fel: 'Det finns ingen egen CSS för ' + sajtNamn(c.mal) + '.' };
    if (fore && c.css && fore.css === c.css && fore.pa !== false) return { ok: true, varde: lista, css: c };   // redan så
    const varde = !c.css ? lista.filter((r) => r !== fore)
      : fore ? lista.map((r) => (r === fore ? { ...r, css: c.css, pa: true } : r))
        : [...lista, { id: nyttId(), mal: c.mal, under: true, css: c.css, pa: true }];
    return { ok: true, varde, css: c };
  }
  return { ok: false, fel: 'Den ändrar du själv i Inställningar → Anpassa.' };
}
function visaVarde(v) {
  if (v === undefined || v === null) return 'standard';
  if (v === true) return 'på';
  if (v === false) return 'av';
  if (Array.isArray(v) || (v && typeof v === 'object')) return '(…)';
  const s = String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
// Det Falk får se av nuvarande värde. Egen kod (CSS, skript) och annat som frågar först skickas aldrig till AI-tjänsten.
function visaNu(nyckel, def) {
  const v = anpassa.hamta(nyckel);
  if (risk(nyckel, def) && typeof v !== 'boolean') {
    const tom = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some(Boolean));
    if (tom) return '(tomt)';
    return Array.isArray(v) ? '(' + v.length + ' st)' : '(eget innehåll)';
  }
  return visaVarde(v);
}
function valText(nyckel, def) {
  const s = slag(nyckel, def);
  if (s === 'val') return valFor(nyckel, def).map(String).join(' | ');
  if (s === 'tal') { const v = valFor(nyckel, def); return 'tal ' + v.min + '–' + v.max; }
  if (s === 'text') return 'text';
  if (s === 'pa-av') return 'på | av';
  if (s === 'farg') return 'färg (#rrggbb)';
  if (s === 'css') return 'SAJT: CSS, t.ex. youtube.com: #secondary{display:none} (tom CSS tar bort sajtens)';
  return 'ändras i Inställningar';
}

/* Listan Falk får i sina instruktioner: nyckel, vad den gör, värdet nu och vilka värden som går. Det Falk inte kan ändra
 * (listor, objekt, sådant utan känt format) slås ihop per område när det är fler än tre, så listan hålls kort. */
function lista() {
  const reg = anpassa.registret(); const ut = []; const ovriga = new Map();
  for (const [k, d] of Object.entries(reg)) {
    const monster = k.endsWith('.*');
    const rad = { nyckel: monster ? k.slice(0, -1) + '<namn>' : k, etikett: String((d && d.etikett) || k).slice(0, 80), nu: '', val: valText(k, d), fraga: risk(k, d), last: !!anpassa.last(k) };
    if (!monster && kanAndras(k, d)) { rad.nu = visaNu(k, d); ut.push(rad); continue; }
    const omr = k.split('.')[0];
    if (!ovriga.has(omr)) ovriga.set(omr, []);
    ovriga.get(omr).push({ ...rad, val: 'ändras i Inställningar', fraga: false, last: false });
  }
  for (const [omr, rader] of ovriga) {
    if (rader.length <= 3) { ut.push(...rader); continue; }
    ut.push({ nyckel: omr + '.…', etikett: rader.slice(0, 3).map((r) => r.etikett).join(', ') + ' m.fl. (' + rader.length + ' st)', nu: '', val: 'ändras i Inställningar', fraga: false, last: false });
  }
  return ut.sort((a, b) => a.nyckel.localeCompare(b.nyckel));
}

async function fraga(ctx, text, detalj) {
  const win = ctx && ctx.win && !ctx.win.isDestroyed() ? ctx.win : null;
  const o = { type: 'warning', title: 'Falk', message: text, detail: detalj, buttons: [T('Avbryt'), T('Tillåt')], defaultId: 0, cancelId: 0, noLink: true };
  try { const r = win ? await dialog.showMessageBox(win, o) : await dialog.showMessageBox(o); return !!(r && r.response === 1); } catch { return false; }
}
const VARNING = () => T('Förslaget kommer från Falk (AI) och kan bygga på text från en webbsida, ett mejl eller en sökträff. Godkänn bara om det var du som bad om det.');
function meddelaSkalet(ctx, d) { try { if (ctx && ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('anpassa-angra:falk', d); } catch {} }
// Vanliga namn på områdena → nyckelns första del i registret
const OMRADEN = { utseende: 'tema', utseendet: 'tema', farger: 'tema', fargerna: 'tema', temat: 'tema', flikarna: 'flikar', verktygsfalt: 'verktyg', verktygsfaltet: 'verktyg', knappar: 'verktyg', knapparna: 'verktyg', startsidan: 'startsida', sidopanelen: 'sidopanel', sokmotor: 'sok', sokmotorer: 'sok', sokmotorerna: 'sok', arbetsytorna: 'arbetsytor', kortkommando: 'kortkommandon', tangentbordet: 'kortkommandon', musgester: 'gester', gesterna: 'gester', egencss: 'avancerat', skript: 'avancerat', skripten: 'avancerat', sajter: 'sajt', sajterna: 'sajt', galleriet: 'galleri', temagalleriet: 'galleri' };

/* Verktyget. a = { name, value } precis som i Falks tagg. opt.bekrafta(text, detalj) och opt.meddela(d) kan bytas ut i test.
 * Svar: { ok:true, vad, … } eller { ok:false, fel, stoppad?, last? } */
async function gor(ctx, a, opt = {}) {
  const namn = fold(a && a.name).replace(/\s+/g, '_');
  const text = String(a && a.value != null ? a.value : '').trim().slice(0, 8000);
  const bekrafta = opt.bekrafta || ((m, d) => fraga(ctx, m, d));
  const meddela = opt.meddela || ((d) => meddelaSkalet(ctx, d));
  const reg = anpassa.registret();

  if (namn === 'anpassa_angra' || namn === 'angra') {
    const n = angra.gruppStorlek();
    if (!n) return { ok: false, fel: 'Det finns inget att ångra.' };
    const senaste = anpassa.historik().filter((x) => x && !anpassa.last(x.nyckel)).slice(-n);
    const riskabla = senaste.filter((x) => { const h = hittaDef(x.nyckel, reg); return h && risk(h.nyckel, h.def); });
    if (riskabla.length && !(await bekrafta(T('Falk vill ångra en ändring av') + ' "' + angra.etikettFor(riskabla[0].nyckel, riskabla[0].etikett) + '".', VARNING()))) return { ok: false, fel: 'Du stoppade ändringen.', stoppad: true };
    const r = angra.angraGrupp();
    if (!r.ok) return { ok: false, fel: 'Det finns inget att ångra.' };
    meddela({ angrat: true, etiketter: r.etiketter });
    return { ok: true, vad: r.etiketter.join(', '), antal: r.antal, etiketter: r.etiketter };
  }

  if (namn === 'anpassa_aterstall' || namn === 'aterstall') {
    let o = fold(text).replace(/\.+$/, '').replace(/\s+/g, '');
    const allt = !o || /^(allt|alla|allting|hela|everything|all)$/.test(o);
    if (!allt) {
      o = OMRADEN[o] || o;
      if (!Object.keys(reg).some((k) => fold(k).startsWith(o + '.'))) return { ok: false, fel: 'Det finns inget område som heter ' + text.slice(0, 40) + '.' };
      o = Object.keys(reg).find((k) => fold(k).startsWith(o + '.')).split('.')[0];   // stavningen i registret
    }
    const vad = allt ? 'allt' : o;
    // Det som faktiskt återställs (ändrade värden, inget barnlåst). Ingår egen kod e.d. frågar vi först, och "allt" alltid.
    const berors = Object.keys(anpassa.alla() || {}).filter((k) => (allt || k.startsWith(o + '.')) && !anpassa.last(k));
    if (!berors.length) return { ok: true, vad, antal: 0, redan: true };
    const farlig = berors.some((k) => { const h = hittaDef(k, reg); return risk(k, h && h.def); });
    const fragan = allt ? T('Falk vill återställa alla dina anpassningar till standard.') : T('Falk vill återställa') + ' "' + o + '" ' + T('till standard.');
    if ((allt || farlig) && !(await bekrafta(fragan, T('Det går att ångra efteråt.') + '\n\n' + VARNING()))) return { ok: false, fel: 'Du stoppade ändringen.', stoppad: true };
    const r = anpassa.aterstall(allt ? undefined : o + '.');
    if (r.antal) meddela({ aterstallt: true, etiketter: [allt ? 'Allt' : vad.charAt(0).toUpperCase() + vad.slice(1)] });
    return { ok: true, vad, antal: r.antal || 0, redan: !r.antal };
  }

  if (namn !== 'anpassa') return { ok: false, fel: 'Okänd handling.' };
  let i = text.indexOf('|'); if (i < 0) i = text.indexOf('=');
  if (i < 1) return { ok: false, fel: 'Skriv både inställning och värde.' };
  const hit = hittaDef(text.slice(0, i), reg);
  if (!hit) return { ok: false, fel: 'Den inställningen finns inte: ' + text.slice(0, i).trim().slice(0, 60) };
  const { nyckel, def } = hit;
  const etikett = String((def && def.etikett) || nyckel);
  if (anpassa.last(nyckel)) return { ok: false, fel: 'Går inte att ändra i barnläge.', last: true, etikett };
  if (!kanAndras(nyckel, def)) return { ok: false, fel: 'Den ändrar du själv i Inställningar → Anpassa.', etikett };
  const t = tolka(nyckel, def, text.slice(i + 1));
  if (!t.ok) return { ok: false, fel: t.fel, etikett };
  const nu = anpassa.hamta(nyckel), blir = t.varde === undefined ? (def ? def.standard : undefined) : t.varde;
  // Det som visas i chatten: värdet, och för egen CSS bara vilken sajt (CSS:en själv står i rutan du godkänner)
  const vad = etikett + ': ' + (t.css ? sajtNamn(t.css.mal) + (t.css.css ? '' : ' (borttagen)') : visaVarde(blir));
  if (JSON.stringify(nu) === JSON.stringify(blir)) return { ok: true, nyckel, etikett, varde: blir, redan: true, vad };
  if (risk(nyckel, def)) {
    let fragan = T('Falk vill ändra') + ' "' + etikett + '".', detalj;
    if (t.css && t.css.css) detalj = T('Sajt') + ': ' + sajtNamn(t.css.mal) + '\nCSS: ' + t.css.css.slice(0, 600) + (t.css.css.length > 600 ? '…' : '');
    else if (t.css) { fragan = T('Falk vill ta bort din egna CSS för') + ' ' + sajtNamn(t.css.mal) + '.'; detalj = ''; }
    else if (t.varde === undefined) detalj = T('Nytt värde') + ': ' + T('standard');
    else detalj = T('Nytt värde') + ': ' + (typeof t.varde === 'string' ? t.varde.slice(0, 400) : visaVarde(t.varde));
    const ja = await bekrafta(fragan, (detalj ? detalj + '\n\n' : '') + VARNING());
    if (!ja) return { ok: false, fel: 'Du stoppade ändringen.', stoppad: true, etikett };
  }
  const r = anpassa.satt(nyckel, t.varde, { etikett: 'Falk: ' + etikett });
  if (!r || !r.ok) return { ok: false, fel: r && r.error === 'barnlast' ? 'Går inte att ändra i barnläge.' : 'Det gick inte att spara.', last: !!(r && r.error === 'barnlast'), etikett };
  meddela({ etiketter: [etikett] });
  return { ok: true, nyckel, etikett, varde: t.varde, vad };
}

// Bara Falk-panelen i fönstret får använda verktyget (skalet och flikarna når det inte)
function franFalk(e) { const ctx = e && e.sender && e.sender.__ctx; return ctx && ctx.kryptoView && ctx.kryptoView.webContents === e.sender ? ctx : null; }
function init(o = {}) {
  if (typeof o.T === 'function') T = o.T;
  ipcMain.handle('anpassa-falk:lista', (e) => (franFalk(e) ? lista() : []));
  ipcMain.handle('anpassa-falk:gor', (e, a) => { const ctx = franFalk(e); return ctx ? gor(ctx, a && typeof a === 'object' ? { name: a.name, value: a.value } : null) : { ok: false, fel: 'Okänd avsändare.' }; });
}

module.exports = { init, gor, lista, tolka, hittaDef, risk, kanAndras };
