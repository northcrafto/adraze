// Anpassa-området "tema": accentfärg, ljust/mörkt/följ systemet, färg från bakgrundsbilden, densitet, hörn,
// typsnitt och textstorlek för själva webbläsaren (inte webbsidorna), färdiga teman och delningskod.
//
// Laddas efter anpassa.js och före shell.js. Värdena ligger i Anpassa-butiken (tema.*, registrerade i
// ../anpassa-tema.js) och tillämpas som data-attribut och CSS-variabler på <html>; reglerna står under
// "Anpassa: tema" sist i input.css. Vid start sker det före första målningen, och när något ändras (i vilket
// fönster som helst) direkt i alla öppna fönster via Anpassa.on.
//
// Ljust/mörkt: tema.lage = ljust | morkt | system. setTheme() i shell.js tillämpar ett färdigt ljust eller
// mörkt (data-theme, skoll-theme i localStorage, chattens tema, fönsterknapparna); här bestäms vilket.
(function () {
  'use strict';
  const A = window.Anpassa;
  if (!A) return;
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  /* ── Valen ── */
  const STANDARD = { accent: '#ff4b1f', lage: 'ljust', densitet: 'normal', horn: 'normal', typsnitt: 'system', storlek: 'normal', palett: 'standard' };
  const ETIKETT = { accent: 'Accentfärg', lage: 'Ljust eller mörkt', densitet: 'Densitet', horn: 'Hörn', typsnitt: 'Typsnitt', storlek: 'Textstorlek', palett: 'Färguppsättning' };
  // Åtta kulörer runt färghjulet. Alla håller minst 3:1 mot ljus och mörk yta, utom Bärnsten som mörkas lite i ljust läge.
  const ACCENTER = [['#ff4b1f', 'AdRaze'], ['#d6336c', 'Hallon'], ['#7354d6', 'Viol'], ['#3b6fe0', 'Blå'],
    ['#0b8a8f', 'Hav'], ['#2f9e67', 'Skog'], ['#e8a317', 'Bärnsten'], ['#5f6b7a', 'Grafit']];
  const VAL = {
    lage: [['ljust', 'Ljust'], ['morkt', 'Mörkt'], ['system', 'Följ systemet']],
    densitet: [['kompakt', 'Kompakt'], ['normal', 'Normal'], ['luftig', 'Luftig']],
    horn: [['kantig', 'Kantig'], ['normal', 'Normal'], ['rund', 'Rund']],
    typsnitt: [['system', 'Standard'], ['klassisk', 'Klassisk'], ['tydlig', 'Tydlig'], ['serif', 'Serif'], ['mono', 'Mono']],
    storlek: [['liten', 'Liten'], ['normal', 'Normal'], ['stor', 'Stor']],
    palett: [['standard', 'Standard'], ['jul', 'Jul']],   // färgerna på själva ytorna; 'jul' = mörkgrönt och djuprött (jul.css), i mörkt läge
  };
  // Färdiga teman sätter färg, läge, hörn och densitet (och färguppsättning: bara Jul har en egen, övriga standard).
  // Typsnitt och textstorlek är personliga val och rörs inte.
  const FORVAL = [
    { id: 'adraze', namn: 'AdRaze', v: { accent: '#ff4b1f', lage: 'ljust', horn: 'normal', densitet: 'normal' } },
    { id: 'skog', namn: 'Skog', v: { accent: '#2f9e67', lage: 'ljust', horn: 'rund', densitet: 'luftig' } },
    { id: 'natt', namn: 'Natt', v: { accent: '#3b6fe0', lage: 'morkt', horn: 'normal', densitet: 'normal' } },
    { id: 'sand', namn: 'Sand', v: { accent: '#e8a317', lage: 'ljust', horn: 'rund', densitet: 'normal' } },
    // Jul: SAMMA värden som julfärgerna (TEMA i ../jul.js) – ändra på båda ställena. Går att välja året runt.
    { id: 'jul', namn: 'Jul', v: { accent: '#d9a441', lage: 'morkt', horn: 'normal', densitet: 'normal', palett: 'jul' } },
    { id: 'hav', namn: 'Hav', v: { accent: '#0b8a8f', lage: 'system', horn: 'normal', densitet: 'normal' } },
    { id: 'grafit', namn: 'Grafit', v: { accent: '#5f6b7a', lage: 'morkt', horn: 'kantig', densitet: 'kompakt' } },
  ];

  /* ── Färgmatte: sRGB, WCAG-kontrast, APCA och OKLab ── */
  function normFarg(v) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v == null ? '' : v).trim());
    if (!m) return null;
    const h = m[1].toLowerCase();
    return '#' + (h.length === 3 ? h.replace(/./g, (c) => c + c) : h);
  }
  const hexTillRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbTillHex = (rgb) => '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
  const tillLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const franLin = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  // WCAG 2: relativ luminans och kontrastkvot (1–21)
  const luminans = (rgb) => { const [r, g, b] = rgb.map(tillLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  function kontrast(a, b) { const x = luminans(a), y = luminans(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // APCA (läsbarhetsmåttet i WCAG 3-utkastet) väljer svart eller vit text. Det träffar mättade mellantoner bättre än
  // WCAG 2: vit text på AdRazes orange får Lc 65 mot svartens 45, vilket stämmer med hur det faktiskt läses.
  // Vit väljs bara om den också klarar WCAG 2:s 3:1 (stor och fet text); annars svart, som då klarar över 6:1.
  function apca(text, bg) {
    const y = (rgb) => { const [r, g, b] = rgb.map((c) => Math.pow(c / 255, 2.4)); const v = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b; return v > 0.022 ? v : v + Math.pow(0.022 - v, 1.414); };
    const t = y(text), b = y(bg);
    if (Math.abs(b - t) < 0.0005) return 0;
    if (b > t) { const s = (Math.pow(b, 0.56) - Math.pow(t, 0.57)) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
    const s = (Math.pow(b, 0.65) - Math.pow(t, 0.62)) * 1.14;
    return s > -0.1 ? 0 : (s + 0.027) * 100;
  }
  const VIT = '#ffffff', SVART = '#111113';
  function textPa(hex) {
    const bg = hexTillRgb(hex), vit = hexTillRgb(VIT);
    return Math.abs(apca(vit, bg)) >= Math.abs(apca(hexTillRgb(SVART), bg)) && kontrast(vit, bg) >= 3 ? VIT : SVART;
  }
  // OKLab är perceptuellt jämnt: en färg kan ljusas eller mörkas utan att byta kulör
  function rgbTillOklab(rgb) {
    const [r, g, b] = rgb.map(tillLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function oklabTillLin(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  // OKLCH → sRGB. Hamnar färgen utanför sRGB sänks mättnaden (samma ljushet och kulör) tills den får plats.
  function lchTillRgb(L, C, h) {
    const prov = (c) => { const v = oklabTillLin(L, c * Math.cos(h), c * Math.sin(h)); return v.every((x) => x >= -0.0005 && x <= 1.0005) ? v : null; };
    let lin = prov(C);
    if (!lin) {
      let lo = 0, hi = C;
      lin = prov(0) || [L, L, L];
      for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2, v = prov(mid); if (v) { lo = mid; lin = v; } else hi = mid; }
    }
    return lin.map((x) => franLin(Math.max(0, Math.min(1, x))));
  }
  // Mörkar (mot ljus bakgrund) eller ljusar (mot mörk) en färg tills kontrasten mot bakgrunden når målet
  function justera(hex, bg, mal) {
    const bgRgb = hexTillRgb(bg);
    if (kontrast(hexTillRgb(hex), bgRgb) >= mal) return hex;
    const [L, a, b] = rgbTillOklab(hexTillRgb(hex)), C = Math.hypot(a, b), h = Math.atan2(b, a);
    const uppat = luminans(bgRgb) < 0.18;
    for (let i = 1; i <= 60; i++) {
      const ny = rgbTillHex(lchTillRgb(uppat ? L + (1 - L) * i / 60 : L * (1 - i / 60), C, h));
      if (kontrast(hexTillRgb(ny), bgRgb) >= mal) return ny;
    }
    return uppat ? VIT : SVART;
  }
  // Allt som räknas ut ur en accentfärg. l/d = ytor och ikoner (minst 3:1 mot verktygsraden i ljust/mörkt läge),
  // ink = accentfärgad text (minst 4,5:1 mot vit/mörk yta), on = svart eller vit text ovanpå accenten.
  function palett(hex) {
    const l = justera(hex, '#f1f5f9', 3), d = justera(hex, '#171718', 3);
    return { l, d, onL: textPa(l), onD: textPa(d), inkL: justera(hex, '#ffffff', 4.5), inkD: justera(hex, '#161618', 4.5) };
  }

  /* ── Färg ur en bild: dominerande, tillräckligt mättad kulör ── */
  // Pixlarna sorteras i 24 kulörfack (15° var). Gråa, nästan svarta och nästan vita pixlar räknas inte, och varje
  // pixel väger efter mättnad, så en stor färgad yta vinner över ett litet grällt fält och över grå himmel.
  // Ger upp till fyra förslag med minst 45° mellan kulörerna, starkast först.
  function dominantaFarger(px) {
    const N = 24, fack = Array.from({ length: N }, () => ({ w: 0, L: 0, a: 0, b: 0 }));
    let antal = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;
      antal++;
      const [L, a, b] = rgbTillOklab([px[i], px[i + 1], px[i + 2]]), C = Math.hypot(a, b);
      if (C < 0.045 || L < 0.22 || L > 0.94) continue;
      const w = C * (1 - Math.abs(L - 0.62));
      const h = (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI);
      const f = fack[Math.floor(h / (2 * Math.PI) * N) % N];
      f.w += w; f.L += L * w; f.a += a * w; f.b += b * w;
    }
    const granne = (i, d) => fack[(i + d + N) % N];
    const poang = fack.map((f, i) => f.w + 0.5 * (granne(i, 1).w + granne(i, -1).w));
    const ordning = poang.map((p, i) => [p, i]).sort((x, y) => y[0] - x[0]);
    const basta = ordning[0][0];
    if (!antal || basta < antal * 0.0015) return [];   // nästan ingen färg i bilden
    const valda = [];
    for (const [p, i] of ordning) {
      if (valda.length >= 4 || p < basta * 0.15) break;
      if (valda.some((j) => Math.min(Math.abs(i - j), N - Math.abs(i - j)) < 3)) continue;
      valda.push(i);
    }
    return valda.map((i) => {
      let w = 0, L = 0, a = 0, b = 0;
      for (const d of [-1, 0, 1]) { const f = granne(i, d); w += f.w; L += f.L; a += f.a; b += f.b; }
      // Samma kulör, men tydligt mättad och mellanljus så att den fungerar som accent
      const C = Math.max(0.11, Math.min(0.2, Math.hypot(a / w, b / w) * 1.25));
      return rgbTillHex(lchTillRgb(Math.max(0.5, Math.min(0.7, L / w)), C, Math.atan2(b / w, a / w)));
    });
  }
  function laddaBild(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      if (!/^data:/i.test(url)) img.crossOrigin = 'anonymous';   // Pexels, Picsum och Bing skickar CORS-huvuden
      const t = setTimeout(() => rej(new Error('tid')), 12000);
      img.onload = () => { clearTimeout(t); res(img); };
      img.onerror = () => { clearTimeout(t); rej(new Error('bild')); };
      img.src = url;
    });
  }
  async function pixlar(url) {
    const img = await laddaBild(url);
    const w = img.naturalWidth || 1, h = img.naturalHeight || 1, sk = Math.min(1, 120 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * sk)); c.height = Math.max(1, Math.round(h * sk));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    return g.getImageData(0, 0, c.width, c.height).data;
  }
  function urlUr(css) {
    const s = String(css || '').trim();
    if (!/^url\(/i.test(s) || !s.endsWith(')')) return '';
    let u = s.slice(4, -1).trim();
    if ((u[0] === '"' || u[0] === "'") && u.endsWith(u[0])) u = u.slice(1, -1);
    return u;
  }
  // Bilden som startsidan visar nu, annars den valda (egen bild eller dagens bild)
  async function bakgrundsbild() {
    const el = $('nt-bg');
    let url = '';
    try { url = urlUr(el && (el.style.backgroundImage || getComputedStyle(el).backgroundImage)); } catch {}
    let val = '';
    try { val = localStorage.getItem('skoll-bg') || ''; } catch {}
    if (!url && /^(https:|data:image\/)/i.test(val)) url = val;
    if (!url && val === 'daily' && window.skoll && window.skoll.dailyImage) { try { const r = await window.skoll.dailyImage(); url = (r && r.url) || ''; } catch {} }
    return /^(https:|data:image\/)/i.test(url) ? url : null;
  }

  /* ── Läsa värden ── */
  function rent(namn, v) {
    if (namn === 'accent') return normFarg(v);
    return (VAL[namn] || []).some(([k]) => k === v) ? v : null;
  }
  const lagrat = (namn) => rent(namn, A.get('tema.' + namn, null));   // null = inte valt, standard gäller
  const varde = (namn) => lagrat(namn) || STANDARD[namn];
  // Första starten med Anpassa: det gamla valet "Mörkt" (skoll-theme) gäller tills huvudprocessen flyttat in det
  let gammalt = null;
  try {
    if (A.get('tema.lage', null) === null && localStorage.getItem('skoll-theme') === 'dark') {
      gammalt = 'morkt';
      if (window.anpassaTema) window.anpassaTema.flyttaLage('morkt');
    }
  } catch {}
  const lage = () => lagrat('lage') || gammalt || STANDARD.lage;
  const mm = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const effektivt = (l) => (l === 'system' ? (mm && mm.matches ? 'dark' : 'light') : l === 'morkt' ? 'dark' : 'light');

  /* ── Tillämpa ── */
  const ACCENT_VARS = { l: '--anp-accent-l', d: '--anp-accent-d', onL: '--anp-on-l', onD: '--anp-on-d', inkL: '--anp-ink-l', inkD: '--anp-ink-d' };
  let senastAccent = null, senastForm = null;
  function tillampaAccent() {
    const hex = varde('accent');
    if (hex === senastAccent) return;
    senastAccent = hex;
    if (hex === STANDARD.accent) {   // AdRazes orange: inga variabler alls, grundutseendet gäller orört
      root.removeAttribute('data-anp-accent');
      for (const v of Object.values(ACCENT_VARS)) root.style.removeProperty(v);
      return;
    }
    const p = palett(hex);
    for (const [k, v] of Object.entries(ACCENT_VARS)) root.style.setProperty(v, p[k]);
    root.setAttribute('data-anp-accent', hex);
  }
  const attr = (namn, v, std) => { if (v === std) root.removeAttribute(namn); else root.setAttribute(namn, v); };
  function tillampaForm() {
    const d = varde('densitet'), h = varde('horn'), f = varde('typsnitt'), s = varde('storlek');
    attr('data-anp-densitet', d, 'normal');
    attr('data-anp-horn', h, 'normal');
    attr('data-anp-typsnitt', f, 'system');
    attr('data-anp-storlek', s, 'normal');
    attr('data-anp-palett', varde('palett'), 'standard');
    const nu = [d, f, s].join();
    if (senastForm !== null && nu !== senastForm) {
      // Flikraden och verktygsraden kan ha bytt höjd: flytta webbvyn och räkna om flikbredderna (shell.js)
      requestAnimationFrame(() => { try { if (typeof window.sendBounds === 'function') window.sendBounds(); if (typeof window.layoutTabs === 'function') window.layoutTabs(); } catch {} });
    }
    senastForm = nu;
  }
  function markeraLage(l) {
    for (const [id, v] of [['seg-light', 'ljust'], ['seg-dark', 'morkt'], ['seg-system', 'system']]) {
      const b = $(id);
      if (b) { b.classList.toggle('on', l === v); b.setAttribute('aria-pressed', String(l === v)); }
    }
  }
  function visaLage(l) {
    const t = effektivt(l);
    if (typeof window.setTheme === 'function') { if (root.dataset.theme !== t) window.setTheme(t); }
    else { root.dataset.theme = t; try { localStorage.setItem('skoll-theme', t); } catch {} }   // före shell.js: skalet startar i rätt läge
    markeraLage(l);
  }
  function tillampaAllt() { tillampaAccent(); tillampaForm(); visaLage(lage()); uppdateraUi(); }
  let ram = 0;
  const schemalagg = () => { if (!ram) ram = requestAnimationFrame(() => { ram = 0; tillampaAllt(); }); };

  tillampaAllt();   // före shell.js och första målningen
  A.on('tema.', (nyckel) => { if (nyckel === 'tema.lage') gammalt = null; schemalagg(); });
  if (mm) mm.addEventListener('change', () => { visaLage(lage()); ritaForval(); uppdateraUi(); });

  /* ── Välja ── */
  // Ljust/Mörkt/Följ systemet. Visas direkt här; övriga fönster följer via Anpassa.on.
  function valjLage(l) {
    l = rent('lage', l) || STANDARD.lage;
    gammalt = null;
    visaLage(l);
    return A.set('tema.lage', l === STANDARD.lage ? undefined : l, ETIKETT.lage);
  }
  // Standardvärdet sparas som "inget värde": butiken (och delningskoden) innehåller bara det du har ändrat
  function valj(namn, v, etikett) {
    v = rent(namn, v);
    if (!v) return Promise.resolve({ ok: false });
    if (namn === 'lage') return valjLage(v);
    return A.set('tema.' + namn, v === STANDARD[namn] ? undefined : v, etikett || ETIKETT[namn]);
  }
  async function anvandForval(id) {
    const f = FORVAL.find((x) => x.id === id);
    if (!f) return;
    gammalt = null;
    // Färguppsättningen före läget: när fönstret blir mörkt är ytornas färger redan valda (teman utan egen får standard)
    for (const namn of ['accent', 'horn', 'densitet', 'palett', 'lage']) await A.set('tema.' + namn, f.v[namn] === STANDARD[namn] ? undefined : f.v[namn], 'Tema ' + f.namn);
  }

  /* ── Dela med en kod (samma format som Anpassa.exportera: ADRZ1.<base64url av JSON>) ── */
  function lasKod(kod) {
    const m = /^ADRZ1\.([A-Za-z0-9_-]+)$/.exec(String(kod || '').trim());
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
      const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    } catch { return null; }
  }
  const tillKod = (o) => 'ADRZ1.' + btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const toast = (t) => { try { if (typeof window.showToast === 'function') window.showToast(t); } catch {} };
  const falt = (sel) => document.querySelector('#anp-tema ' + sel);
  function kodStatus(text, fel) {
    const el = falt('[data-kodstatus]');
    if (!el) return;
    el.textContent = text || 'Klistra in en kod du har fått.';
    el.classList.toggle('anp-tema-fel', !!fel);
  }
  async function kopieraKod() {
    let kod = '';
    try { kod = await A.exportera('tema.'); } catch {}
    if (!kod) return;
    try { await navigator.clipboard.writeText(kod); toast('Kod kopierad'); }
    catch { const f = falt('[data-kod]'); if (f) { f.value = kod; f.focus(); f.select(); } kodStatus('Kopiera koden i fältet.'); }
  }
  // Koden tvättas först (bara kända tema-nycklar med giltiga värden) och skickas sedan till Anpassa.importera.
  // Det som saknas i koden är standard hos den som delade den, så det återställs här.
  async function anvandKod() {
    const f = falt('[data-kod]');
    const o = lasKod(f && f.value);
    if (!o) { kodStatus('Koden fungerar inte. Kolla att hela koden kom med.', true); return; }
    const tvattad = {};
    for (const namn of Object.keys(STANDARD)) { const v = rent(namn, o['tema.' + namn]); if (v) tvattad['tema.' + namn] = v; }
    if (Object.keys(o).length && !Object.keys(tvattad).length) { kodStatus('Koden innehåller inget tema.', true); return; }
    gammalt = null;
    for (const namn of Object.keys(STANDARD)) { const k = 'tema.' + namn; if (!(k in tvattad) && A.get(k, null) !== null) await A.set(k, undefined, 'Tema från kod'); }
    const r = await A.importera(tillKod(tvattad), 'tema.');
    if (r && r.ok) { f.value = ''; kodStatus('Klart, temat används nu.'); } else kodStatus('Koden fungerar inte.', true);
  }
  async function aterstallTema() {
    gammalt = null;
    await A.aterstall('tema.');
    bgFarger = []; bgStatus('');
    toast('Temat är återställt');
  }

  /* ── Färg från bakgrunden ── */
  let bgFarger = [];
  function bgStatus(text, fel) {
    const el = falt('[data-bgstatus]');
    if (!el) return;
    el.textContent = text || 'Tar fram en färg ur bilden på startsidan.';
    el.classList.toggle('anp-tema-fel', !!fel);
    if (!fel && text && bgFarger.length > 1) {
      const alt = document.createElement('span');
      alt.className = 'anp-tema-alt';
      alt.innerHTML = bgFarger.map((h) => prov(h, 'Färg ur bilden', 'Färg från bakgrunden')).join('');
      el.append(' ', alt);
    }
    uppdateraUi();
  }
  async function fargFranBakgrund(knapp) {
    knapp.disabled = true; bgFarger = [];
    bgStatus('Letar efter färger i bilden …');
    try {
      const url = await bakgrundsbild();
      if (!url) { bgStatus('Hittade ingen bakgrundsbild. Öppna en ny flik så att bilden syns och försök igen.', true); return; }
      const farger = dominantaFarger(await pixlar(url));
      if (!farger.length) { bgStatus('Bilden har för lite färg. Prova en annan bakgrund.', true); return; }
      bgFarger = farger;
      await valj('accent', farger[0], 'Färg från bakgrunden');
      bgStatus(farger.length > 1 ? 'Klar. Fler färger ur bilden:' : 'Klar. Färgen kommer från bilden.');
    } catch { bgStatus('Det gick inte att läsa bilden. Försök igen om en stund.', true); }
    finally { knapp.disabled = false; }
  }

  /* ── Inställningar › Anpassa › Tema (#anp-tema) ── */
  const CHECK = '<svg class="anp-tema-bock" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  const PLUS = '<svg class="anp-tema-plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>';
  const rad = (titel, text, kontroll, hel) => '<div class="set-row' + (hel ? ' anp-tema-hel' : '') + '"><div class="set-txt"><div class="set-title">' + titel + '</div><div class="set-desc">' + text + '</div></div>' + kontroll + '</div>';
  const seg = (namn) => '<div class="seg flex-none" role="group" aria-label="' + ETIKETT[namn] + '">' + VAL[namn].map(([k, t]) => '<button type="button" class="seg-btn" data-namn="' + namn + '" data-v="' + k + '" aria-pressed="false">' + t + '</button>').join('') + '</div>';
  function prov(hex, namn, etikett) {
    return '<button type="button" class="anp-tema-prov" data-accent="' + hex + '"' + (etikett ? ' data-etikett="' + etikett + '"' : '') +
      ' style="--prov:' + hex + ';--prov-on:' + textPa(hex) + '" title="' + namn + '" aria-label="' + namn + '" aria-pressed="false">' + CHECK + '</button>';
  }
  // Liten förhandsbild av ett tema: flikrad med aktiv flik, adressfält och en knapp i accentfärgen
  function mini(v) {
    const mork = effektivt(v.lage) === 'dark';
    const acc = justera(v.accent, mork ? '#171718' : '#f1f5f9', 3);
    const r = { kantig: '1px', normal: '3px', rund: '99px' }[v.horn] || '3px';
    return '<span class="anp-tema-mini' + (mork ? ' mork' : '') + (mork && v.palett === 'jul' ? ' jul' : '') + '" style="--m-acc:' + acc + ';--m-r:' + r + '" aria-hidden="true">' +
      '<i class="m-flikar"><i class="m-flik"></i><i class="m-flik2"></i></i><i class="m-rad"><i class="m-falt"></i></i>' +
      '<i class="m-sida"><i class="m-text"></i><i class="m-text kort"></i><i class="m-knapp"></i></i></span>';
  }
  const kort = (f) => '<button type="button" class="anp-tema-kort" data-forval="' + f.id + '" aria-pressed="false">' + mini(f.v) + '<span class="anp-tema-namn">' + f.namn + '</span></button>';
  const fontKort = ([k, t]) => '<button type="button" class="anp-tema-font" data-namn="typsnitt" data-v="' + k + '" style="font-family:var(--anp-font-' + k + ')" aria-pressed="false"><b>Aa</b><span>' + t + '</span></button>';

  function rita() {
    const s = $('anp-tema');
    if (!s) return;
    if (!s.dataset.ritad) {
      s.dataset.ritad = '1';
      s.innerHTML =
        '<h3 class="set-h3">Tema</h3>' +
        '<p class="set-lead">Färg, form och text i webbläsaren. Syns direkt i alla fönster.</p>' +
        rad('Färdiga teman', 'Byter färg, ljust eller mörkt, hörn och densitet på en gång.', '<div class="anp-tema-forval" data-forvalen></div>', true) +
        '<div class="anp-tema-grupp">Färg</div>' +
        rad('Accentfärg', 'Knappar, markeringar, den aktiva fliken och fokusramar.',
          '<div class="anp-tema-farger" role="group" aria-label="Accentfärg">' + ACCENTER.map(([h, n]) => prov(h, n)).join('') +
          '<span class="anp-tema-skilj" aria-hidden="true"></span>' +
          '<label class="anp-tema-prov anp-tema-egen" title="Egen färg">' + PLUS + CHECK + '<input type="color" data-egen aria-label="Egen färg"></label>' +
          '<input class="anp-tema-hex" data-hex type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Färgkod"></div>', true) +
        rad('Färg från bakgrunden', '<span data-bgstatus>Tar fram en färg ur bilden på startsidan.</span>', '<button type="button" class="set-btn flex-none" data-bgfarg>Hämta färg från bakgrunden</button>') +
        rad('Ljust eller mörkt', 'Följ systemet byter när datorn gör det.', seg('lage')) +
        '<div class="anp-tema-grupp">Form</div>' +
        rad('Densitet', 'Höjden på flikar, adressfält och rader.', seg('densitet')) +
        rad('Hörn', 'Hur runda flikar, knappar och fält är.', seg('horn')) +
        '<div class="anp-tema-grupp">Text</div>' +
        rad('Typsnitt', 'Gäller webbläsaren. Webbsidorna behåller sina typsnitt.', '<div class="anp-tema-typsnitt" role="group" aria-label="Typsnitt">' + VAL.typsnitt.map(fontKort).join('') + '</div>', true) +
        rad('Textstorlek', 'Flikar, adressfält och inställningar. Webbsidor ändrar du under Utseende.', seg('storlek')) +
        '<div class="anp-tema-grupp">Dela</div>' +
        rad('Dela ditt tema', 'Kopiera en kod som någon annan kan klistra in i sin AdRaze.', '<button type="button" class="pill flex-none" data-kopiera>Kopiera kod</button>') +
        rad('Använd en kod', '<span data-kodstatus>Klistra in en kod du har fått.</span>',
          '<div class="anp-tema-kod"><input type="text" data-kod spellcheck="false" autocomplete="off" placeholder="ADRZ1." aria-label="Temakod"><button type="button" class="set-btn" data-anvand>Använd</button></div>', true) +
        rad('Återställ tema', 'Tillbaka till AdRazes eget utseende.', '<button type="button" class="pill flex-none" data-aterstall>Återställ</button>');
      koppla(s);
      ritaForval();
    }
    uppdateraUi();
  }
  function ritaForval() { const g = falt('[data-forvalen]'); if (g) g.innerHTML = FORVAL.map(kort).join(''); }
  function uppdateraUi() {
    const s = $('anp-tema');
    if (!s || !s.dataset.ritad) return;
    const v = { accent: varde('accent'), lage: lage(), densitet: varde('densitet'), horn: varde('horn'), typsnitt: varde('typsnitt'), storlek: varde('storlek'), palett: varde('palett') };
    const pa = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); };
    s.querySelectorAll('[data-namn][data-v]').forEach((b) => pa(b, v[b.dataset.namn] === b.dataset.v));
    s.querySelectorAll('[data-accent]').forEach((b) => pa(b, b.dataset.accent === v.accent));
    // Ett kort är valt när allt det sätter stämmer, även färguppsättningen (standard för alla utom Jul)
    s.querySelectorAll('[data-forval]').forEach((b) => { const f = FORVAL.find((x) => x.id === b.dataset.forval), fv = f && { palett: STANDARD.palett, ...f.v }; pa(b, !!f && Object.keys(fv).every((k) => v[k] === fv[k])); });
    const egen = s.querySelector('.anp-tema-egen');
    if (egen) {
      egen.classList.toggle('on', !ACCENTER.some(([h]) => h === v.accent));
      egen.style.setProperty('--prov', v.accent);
      egen.style.setProperty('--prov-on', textPa(v.accent));
    }
    const farg = s.querySelector('[data-egen]');
    if (farg) farg.value = v.accent;
    const hex = s.querySelector('[data-hex]');
    if (hex && document.activeElement !== hex) hex.value = v.accent;
  }
  function koppla(s) {
    s.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !s.contains(b) || b.disabled) return;
      const d = b.dataset;
      if (d.forval) anvandForval(d.forval);
      else if (d.accent) valj('accent', d.accent, d.etikett);
      else if (d.namn) valj(d.namn, d.v);
      else if ('bgfarg' in d) fargFranBakgrund(b);
      else if ('kopiera' in d) kopieraKod();
      else if ('anvand' in d) anvandKod();
      else if ('aterstall' in d) aterstallTema();
    });
    s.addEventListener('change', (e) => { if (e.target.matches('[data-egen]')) valj('accent', e.target.value, 'Egen accentfärg'); });
    const hex = s.querySelector('[data-hex]');
    const hexKlar = () => {
      const v = normFarg(hex.value);
      if (!v) { hex.value = varde('accent'); return; }
      hex.value = v;
      if (v !== varde('accent')) valj('accent', v, 'Egen accentfärg');
    };
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hexKlar(); } });
    hex.addEventListener('blur', hexKlar);
    const kod = s.querySelector('[data-kod]');
    kod.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); anvandKod(); } });
    kod.addEventListener('input', () => kodStatus(''));
  }

  function start() {
    markeraLage(lage());   // shell.js har just markerat Ljust/Mörkt efter det faktiska läget
    const sys = $('seg-system');
    if (sys) sys.addEventListener('click', () => valjLage('system'));
    rita();
    document.addEventListener('anpassa:visa', rita);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // shell.js (valjTema) och testerna
  window.AnpassaTema = { valjLage, palett, textPa, kontrast, apca, justera, dominantaFarger, normFarg, lasKod, hexTillRgb, rgbTillOklab, FORVAL, ACCENTER };
})();
