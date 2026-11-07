// Falk ändrar Anpassa-inställningar (färger, ljust/mörkt, densitet, flikar, verktygsfält …) med vanligt språk.
// Falk lägger [[gör:anpassa=NYCKEL|VÄRDE]], [[gör:anpassa_angra]] eller [[gör:anpassa_aterstall=OMRÅDE]] sist i svaret;
// Falk-panelen (ui/anpassa-falk.js) skickar taggen hit och visar vad som hände.
//
// Allt avgörs HÄR, aldrig i panelen:
//  • bara nycklar som finns i registret (anpassa.js) – läses vid varje anrop, så alla områden som registrerats syns
//  • barnlåsta nycklar ändras aldrig i barnläge (grunden spärrar också)
//  • allt som kan köra kod, ladda webbsidor eller ändra sökningen (avancerat.*, barnlåsta och icke importerbara nycklar)
//    ändras först när du godkänt i en ruta, med "Avbryt" förvalt – Falks svar kan bygga på text från en webbsida
const { ipcMain, dialog } = require('electron');
const anpassa = require('./anpassa');
const angra = require('./anpassa-angra');

let T = (s) => s;

const fold = (s) => String(s == null ? '' : s).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').trim();
const HEX = /^#[0-9a-f]{6}$/i;

// Kända nycklar: tillåtna värden och vanliga sätt att säga dem. Används bara om nyckeln registrerats med ett av värdena
// som standard (annars har området valt andra värden, och då gäller de allmänna reglerna nedan).
const KANDA = {
  'tema.lage': { val: ['ljust', 'morkt', 'system'], syn: { ljus: 'ljust', light: 'ljust', dag: 'ljust', mork: 'morkt', dark: 'morkt', natt: 'morkt', morkerlage: 'morkt', morklage: 'morkt', auto: 'system', automatiskt: 'system', datorns: 'system', samma_som_datorn: 'system' } },
  'tema.densitet': { val: ['kompakt', 'normal', 'luftig'], syn: { kompaktare: 'kompakt', tat: 'kompakt', tatare: 'kompakt', mindre: 'kompakt', tight: 'kompakt', standard: 'normal', mellan: 'normal', vanlig: 'normal', luftigare: 'luftig', rymlig: 'luftig', rymligare: 'luftig', storre: 'luftig', glesare: 'luftig' } },
  'flikar.lage': { val: ['upptill', 'vertikalt', 'dolda'], syn: { vertikal: 'vertikalt', vertikala: 'vertikalt', sidan: 'vertikalt', pa_sidan: 'vertikalt', vansterkant: 'vertikalt', sidopanel: 'vertikalt', uppe: 'upptill', overst: 'upptill', horisontellt: 'upptill', horisontella: 'upptill', vanligt: 'upptill', dold: 'dolda', gomda: 'dolda', gom: 'dolda', dolj: 'dolda', inga: 'dolda' } },
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

const arObjekt = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// Kan Falk ändra nyckeln? Sammansatta värden (listor av objekt, objekt) ändrar du själv i Inställningar.
function kanAndras(def) {
  const s = def ? def.standard : undefined;
  if (arObjekt(s)) return false;
  if (Array.isArray(s) && s.some((x) => x && typeof x === 'object')) return false;
  return true;
}
// Frågar först: kan köra kod, ladda webbsidor eller ändra sökning (samma nycklar som barnläget låser)
function risk(nyckel, def) { return /^avancerat\./.test(String(nyckel)) || !!(def && (def.barnLast || def.importBar === false)); }
function kand(nyckel, def) { const k = KANDA[nyckel]; return k && def && k.val.includes(def.standard) ? k : null; }

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
// Falks text → ett värde av samma slag som nyckelns standard. { ok, varde } eller { ok:false, fel }
function tolka(nyckel, def, text) {
  const t = String(text == null ? '' : text).trim();
  if (/^(standard|aterstall|återställ|default|ursprunglig|ursprungligt)$/i.test(t)) return { ok: true, varde: undefined };
  const std = def ? def.standard : undefined;
  const k = kand(nyckel, def);
  if (k) {
    const f = fold(t).replace(/\s+/g, '_');
    const v = k.val.find((x) => fold(x) === f) || k.syn[f];
    return v ? { ok: true, varde: v } : { ok: false, fel: 'Tillåtna värden: ' + k.val.join(', ') + '.' };
  }
  if (typeof std === 'boolean') {
    const f = fold(t).replace(/\s+/g, '_');
    if (PA.test(f)) return { ok: true, varde: true };
    if (AV.test(f)) return { ok: true, varde: false };
    return { ok: false, fel: 'Skriv på eller av.' };
  }
  if (typeof std === 'number') {
    const n = Number(t.replace(',', '.').replace(/\s*(px|%|st)$/i, ''));
    return Number.isFinite(n) ? { ok: true, varde: n } : { ok: false, fel: 'Skriv ett tal.' };
  }
  if (typeof std === 'string' && HEX.test(std)) {
    const h = farg(t);
    return h ? { ok: true, varde: h } : { ok: false, fel: 'Skriv färgen som hex, t.ex. #1f6b3a.' };
  }
  if (Array.isArray(std)) {
    const lista = t.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50).map((x) => x.slice(0, 200));
    return { ok: true, varde: lista };
  }
  if (t.length > 4000) return { ok: false, fel: 'Värdet är för långt.' };
  if (typeof std === 'string') return { ok: true, varde: t };
  // Okänd typ (ingen standard): JSON om det går, annars text
  try { const j = JSON.parse(t); if (j === null || ['string', 'number', 'boolean'].includes(typeof j)) return { ok: true, varde: j === null ? undefined : j }; } catch {}
  return { ok: true, varde: t };
}
function visaVarde(v) {
  if (v === undefined || v === null) return 'standard';
  if (v === true) return 'på';
  if (v === false) return 'av';
  if (Array.isArray(v)) return v.join(', ').slice(0, 80) || '(tom)';
  if (arObjekt(v)) return '(…)';
  const s = String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
// Det Falk får se av nuvarande värde. Egen kod (skript/CSS) skickas aldrig till AI-tjänsten.
function visaNu(nyckel, def) {
  const v = anpassa.hamta(nyckel);
  if (risk(nyckel, def) && typeof v === 'string') return v.trim() ? '(eget innehåll)' : '(tomt)';
  if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) return v.length + ' st';
  return visaVarde(v);
}
function valText(nyckel, def) {
  if (!kanAndras(def)) return 'ändras i Inställningar';
  const k = kand(nyckel, def); if (k) return k.val.join(' | ');
  const s = def ? def.standard : undefined;
  if (typeof s === 'boolean') return 'på | av';
  if (typeof s === 'number') return 'tal';
  if (typeof s === 'string' && HEX.test(s)) return 'färg (#rrggbb)';
  if (Array.isArray(s)) return 'lista, komma emellan';
  return 'text';
}

// Listan Falk får i sina instruktioner: nyckel, vad den gör, värdet nu och vilka värden som går
function lista() {
  const reg = anpassa.registret(); const ut = [];
  for (const [k, d] of Object.entries(reg)) {
    const monster = k.endsWith('.*');
    ut.push({
      nyckel: monster ? k.slice(0, -1) + '<namn>' : k,
      etikett: String((d && d.etikett) || k).slice(0, 80),
      nu: monster ? '' : visaNu(k, d),
      val: valText(k, d),
      fraga: risk(k, d),
      last: !!anpassa.last(k),
    });
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
const OMRADEN = { utseende: 'tema', utseendet: 'tema', farger: 'tema', fargerna: 'tema', temat: 'tema', flikarna: 'flikar', verktygsfalt: 'verktyg', verktygsfaltet: 'verktyg', knappar: 'verktyg', knapparna: 'verktyg', startsidan: 'startsida', sidopanelen: 'sidopanel', sokmotorerna: 'sokmotorer', sokmotorer: 'sokmotorer', arbetsytorna: 'arbetsytor' };

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
  if (!kanAndras(def)) return { ok: false, fel: 'Den ändrar du själv i Inställningar → Anpassa.', etikett };
  const t = tolka(nyckel, def, text.slice(i + 1));
  if (!t.ok) return { ok: false, fel: t.fel, etikett };
  const nu = anpassa.hamta(nyckel), blir = t.varde === undefined ? (def ? def.standard : undefined) : t.varde;
  if (JSON.stringify(nu) === JSON.stringify(blir)) return { ok: true, nyckel, etikett, varde: blir, redan: true, vad: etikett + ': ' + visaVarde(blir) };
  if (risk(nyckel, def)) {
    const visas = t.varde === undefined ? T('standard') : String(typeof t.varde === 'string' ? t.varde : JSON.stringify(t.varde)).slice(0, 400);
    const ja = await bekrafta(T('Falk vill ändra') + ' "' + etikett + '".', T('Nytt värde') + ': ' + visas + '\n\n' + VARNING());
    if (!ja) return { ok: false, fel: 'Du stoppade ändringen.', stoppad: true, etikett };
  }
  const r = anpassa.satt(nyckel, t.varde, { etikett: 'Falk: ' + etikett });
  if (!r || !r.ok) return { ok: false, fel: r && r.error === 'barnlast' ? 'Går inte att ändra i barnläge.' : 'Det gick inte att spara.', last: !!(r && r.error === 'barnlast'), etikett };
  meddela({ etiketter: [etikett] });
  return { ok: true, nyckel, etikett, varde: t.varde, vad: etikett + ': ' + visaVarde(blir) };
}

// Bara Falk-panelen i fönstret får använda verktyget (skalet och flikarna når det inte)
function franFalk(e) { const ctx = e && e.sender && e.sender.__ctx; return ctx && ctx.kryptoView && ctx.kryptoView.webContents === e.sender ? ctx : null; }
function init(o = {}) {
  if (typeof o.T === 'function') T = o.T;
  ipcMain.handle('anpassa-falk:lista', (e) => (franFalk(e) ? lista() : []));
  ipcMain.handle('anpassa-falk:gor', (e, a) => { const ctx = franFalk(e); return ctx ? gor(ctx, a && typeof a === 'object' ? { name: a.name, value: a.value } : null) : { ok: false, fel: 'Okänd avsändare.' }; });
}

module.exports = { init, gor, lista, tolka, hittaDef, risk, kanAndras };
