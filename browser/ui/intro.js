/* Första-gången-introt i AdRaze (förslag E: A + B, ritat i ~/adraze-intro/e-a-plus-b).
 *
 *   Öppningen: reklamlapparna smäller upp över startsidan och gorillan ur loggan slukar dem en efter en, tills den sista
 *     gula AD-lappen fastnar i käften och han blir loggan. Räknarpillret tickar en gång per tugga upp till 14. Det är en
 *     show: lapparna är på låtsas och den riktiga statistiken (startsidan, adressfältet) rörs aldrig.
 *   Kortet: gorillan hoppar in i kortets scen, med pillret efter sig. Sedan stegen Välkommen › Flytta hit › Utseende ›
 *     Huvudwebbläsare › Klart. Stegen gör det riktiga: importen från en annan webbläsare (samma som Inställningar ›
 *     Lösenord), temat (Anpassa › Tema) och huvudwebbläsaren (samma som notisen). Steg som inte behövs visas inte:
 *     Flytta hit bara när det finns en annan webbläsare på datorn, Huvudwebbläsare bara när AdRaze inte redan är det.
 *   Esc, krysset och Hoppa över stänger direkt. Klick eller Enter under öppningen spolar fram till kortet.
 *
 * shell.js laddar filen bara när introt ska visas och anropar AdrazeIntro.starta(). Stilen ligger i intro.css, ritkoden
 * och gubbarna i intro/rita.js och intro/illu.js; allt laddas härifrån. Bara transform och opacity animeras.
 */
(function () {
  'use strict';
  if (window.AdrazeIntro) return;
  const NS = 'http://www.w3.org/2000/svg';
  const fyllIn = (s, v) => (v ? String(s).replace(/\{([a-z]\w*)\}/g, (m, n) => (v[n] != null ? String(v[n]) : m)) : String(s));
  const T = (s, v) => (typeof window.t === 'function' ? window.t(s, v) : fyllIn(s, v));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vanta = (ms) => new Promise((r) => setTimeout(r, ms));
  const sprak = () => (window.i18n && window.i18n.lang) || 'sv';
  const tal = (n) => { try { return new Intl.NumberFormat(sprak()).format(n); } catch { return String(n); } };
  const ochLista = (delar) => { try { return new Intl.ListFormat(sprak(), { type: 'conjunction' }).format(delar); } catch { return delar.join(', '); } };
  const plattform = (window.view && window.view.platform) || 'linux';
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const lugn = () => rmq.matches || document.body.classList.contains('reduce-motion');
  const root = document.documentElement;
  const A = () => window.Anpassa, AT = () => window.AnpassaTema;

  /* ═════════ Filerna: ritkod, gubbar, stil och typsnitt (laddas bara när introt ska visas) ═════════ */
  let resurser = null;
  function laddaSkript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); }); }
  function laddaStil(href) { return new Promise((res, rej) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = () => rej(new Error(href)); document.head.appendChild(l); }); }
  function laddaResurser() {
    if (!resurser) {
      resurser = Promise.all([
        window.IntroRita ? null : laddaSkript('intro/rita.js'),
        window.IntroIllu ? null : laddaSkript('intro/illu.js'),
        document.querySelector('link[href="intro.css"]') ? null : laddaStil('intro.css'),
      ]).catch((e) => { resurser = null; throw e; });
    }
    return resurser;
  }
  // Typsnitten (variabla, en fil per teckenuppsättning): provtexten gör att rätt delar laddas för språket
  async function laddaTypsnitt(prov) {
    const f = document.fonts; if (!f || !f.load) return;
    await Promise.race([Promise.all([
      f.load('700 20px "Familjen Grotesk"', prov), f.load('500 20px "Familjen Grotesk"', prov),
      f.load('460 40px "AdRaze Display"', prov), f.load('800 40px "AdRaze Display"', prov), f.load('900 40px "AdRaze Display"', prov),
    ]).catch(() => {}), vanta(2500)]);
  }

  /* ═════════ Data ═════════ */
  // Webbläsarna i den ordning de visas (Edge först: vanligast på en ny Windows-dator). Högst fyra kort.
  const WB_ORDNING = ['edge', 'chrome', 'firefox', 'brave', 'vivaldi', 'chromium'];
  const WB_BILD = { edge: 'intro/webblasare/edge.png', chrome: 'intro/webblasare/chrome.png', firefox: 'intro/webblasare/firefox.png', brave: 'intro/webblasare/brave.png' };
  const LAGEN = [['ljust', 'Ljust'], ['morkt', 'Mörkt'], ['system', 'Automatiskt']];
  const STANDARD_ACCENT = '#ff4b1f';
  const accenter = () => (AT() && AT().ACCENTER) || [[STANDARD_ACCENT, 'AdRaze']];

  /* ═════════ Öppningen (A): reklamlapparna ═════════
     x/y = mitten i % av webbytan, w = bredd i em (scenens grundmått), r = lutning. Kakrutan står en bit högre än i A,
     så att räknarpillret får plats under den. */
  const procent = () => { try { return new Intl.NumberFormat(sprak(), { style: 'percent' }).format(-0.7); } catch { return '−70 %'; } };
  const LAPPAR = [
    { id: 'vinn', x: 17, y: 17, w: 17.5, r: -5, f: '#ffd23e', ad: 'v',
      html: () => '<b class="l-stor">' + esc(T('Vinn en iPhone!')) + '</b><span class="l-knapp ritad" data-form="piller">' + esc(T('Klicka här')) + '</span>' },
    { id: 'rea', x: 40, y: 12, w: 9.6, r: 9, f: '#f7a8c4', form: 'stjarna',
      html: () => '<b class="l-rea">' + esc(procent()) + '</b><span class="l-sma">' + esc(T('bara idag')) + '</span>' },
    { id: 'virus', x: 80, y: 18, w: 16.5, r: 3, f: '#ff8e72',
      html: () => '<div class="l-titel"><span>' + esc(T('Varning!')) + '</span><i class="l-kryss"></i></div><b class="l-mellan">' + esc(T('Din dator har 3 virus')) + '</b><span class="l-knapp l-ljus ritad" data-form="piller">' + esc(T('Rensa nu')) + '</span>' },
    { id: 'medd', x: 8.5, y: 33, w: 12, r: -4, f: '#9fd3c7',
      html: () => '<b class="l-mellan">' + esc(T('Du har ett nytt meddelande')) + '</b><span class="l-prick ritad" data-form="rund">' + esc(tal(1)) + '</span>' },
    { id: 'lan', x: 10.5, y: 52, w: 13.5, r: 3, f: '#c7b8f5', ad: 'h',
      html: () => '<b class="l-mellan">' + esc(T('Snabblån på 5 minuter')) + '</b><span class="l-knapp ritad" data-form="piller">' + esc(T('Ansök nu')) + '</span>' },
    { id: 'video', x: 29.5, y: 42, w: 14, r: -3, f: '#ff8e72',
      html: () => '<span class="l-video ritad"><i class="l-play"></i></span><span class="l-sma">' + esc(T('Spelas upp med ljud')) + '</span>' },
    { id: 'lakare', x: 71, y: 44, w: 15, r: -2.5, f: '#fffaf0', ad: 'v',
      html: () => '<b class="l-serif">' + esc(T('Läkare hatar det här enkla tricket')) + '</b><span class="l-lank">' + esc(T('Läs mer')) + '</span>' },
    { id: 'brev', x: 58, y: 57, w: 13.5, r: 3, f: '#9fd3c7',
      html: () => '<b class="l-mellan">' + esc(T('Missa inget!')) + '</b><span class="l-sma">' + esc(T('Skriv in din e-post')) + '</span><span class="l-knapp ritad" data-form="piller">' + esc(T('Prenumerera')) + '</span>' },
    { id: 'krypto', x: 91, y: 54, w: 11.5, r: 6, f: '#ffd23e',
      html: () => '<b class="l-mellan">' + esc(T('Gratis krypto')) + '</b><span class="l-sma">' + esc(T('bara för dig')) + '</span>' },
    { id: 'grattis', x: 20, y: 80, w: 16, r: 4, f: '#f7a8c4', ad: 'h',
      html: () => '<b class="l-stor">' + esc(T('Grattis!')) + '</b><span class="l-sma">' + esc(T('Du är besökare nummer {n}', { n: tal(1000000) })) + '</span>' },
    { id: 'spar', x: 52, y: 79, w: 24, r: -1.5, f: '#fffaf0',
      html: () => '<span class="l-text">' + esc(T('Vi och våra {n} partner vill följa dig överallt.', { n: tal(847) })) + '</span><span class="l-rad"><span class="l-knapp ritad" data-form="piller">' + esc(T('Godkänn alla')) + '</span><span class="l-lank">' + esc(T('Inställningar')) + '</span></span>' },
    { id: 'ladda', x: 84, y: 80, w: 12.5, r: -6, f: '#c7b8f5', ad: 'v',
      html: () => '<b class="l-mellan">' + esc(T('Ladda ner nu')) + '</b><i class="l-pil"></i>' },
    { id: 'tid', x: 39, y: 67, w: 13, r: 4, f: '#ffd23e',
      html: () => '<span class="l-sma">' + esc(T('Erbjudandet går ut om')) + '</span><b class="l-tid">00:59</b>' },
    { id: 'ad', x: 64, y: 30, w: 7.4, r: 13, sticker: true },   // sista tuggan: lappen som blir loggans AD-lapp
  ];
  const SLAG_ORDN = [0, 6, 2, 9, 4, 12, 1, 8, 5, 11, 3, 10, 7, 13];

  /* ═════════ Tidslinjen (sekunder) ═════════
     A:s tider fram till fångsten (2,3 s). Därefter hoppar gorillan in i kortet i stället för att landa i A:s textskärm. */
  const TID = { klick: .52, klickDur: .34, upp: .62, uppDur: .40, gap: 1.0, fangst: 2.30, piller: .74, pillerDur: .5, kort: 2.48, kortDur: .72 };
  TID.slut = TID.kort + TID.kortDur;                     // 3,2 s: kortet står klart och går att använda
  const ANKOMST = [1.36, 1.455, 1.543, 1.625, 1.701, 1.772, 1.839, 1.902, 1.962, 2.02, 2.076, 2.131, 2.185];
  const SLAG0 = .04, SLAG_STEG = .024, SLAG_DUR = .2, RYCK = .07, SCEN = 1.3, HOPP = .1;
  const ink = '#1b1916', papper = '#fffaf0';

  const kl = (v) => Math.max(0, Math.min(1, v));
  const utKub = (p) => 1 - Math.pow(1 - p, 3);
  const utKvint = (p) => 1 - Math.pow(1 - p, 5);
  const inUt = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const utBak = (p, c = 1.70158) => 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  const inBak = (p, c = 1.70158) => (c + 1) * p * p * p - c * p * p;
  const op = (el, v) => { if (el) el.style.opacity = (+v).toFixed(3); };

  /* ═════════ Färgerna: accenten är webbläsarens egen (Anpassa › Tema) ═════════ */
  function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  function lum(rgb) { const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function kontrast(a, b) { const x = lum(hexRgb(a)), y = lum(hexRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // Text ovanpå accenten: nästan svart när den räcker (signaturkitets svarta text på orange), annars vit
  const textPa = (hex) => (kontrast(hex, '#13110e') >= 4.5 ? '#13110e' : '#ffffff');
  const normHex = (v) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(v || '').trim()); return m ? '#' + m[1].toLowerCase() : null; };
  const accentNu = () => normHex(A() && A().get('tema.accent', null)) || STANDARD_ACCENT;
  function lageNu() {
    const l = A() && A().get('tema.lage', null);
    return LAGEN.some(([k]) => k === l) ? l : (root.dataset.theme === 'dark' ? 'morkt' : 'ljust');
  }

  /* ═════════ Tillstånd för en körning ═════════ */
  let K = null;   // allt för den pågående körningen (null = inget intro igång)

  /* Ett intro i taget. opts: { bro: { importera }, klar(info), test: { t } | { steg } } */
  async function starta(opts = {}) {
    const intro = document.getElementById('hxintro');
    if (!intro || !intro.isConnected) return false;
    if (K) avsluta(K, true);
    const nt = document.getElementById('newtabpage');
    if (!opts.test && nt && nt.classList.contains('hidden')) return false;   // en sida är öppen (länk utifrån): introt kommer nästa gång
    const k = { intro, opts, aktiv: false, stanger: false, stadat: false, lyss: [] };
    K = k;
    let fore;
    try {
      [, fore] = await Promise.all([laddaResurser(), forbered()]);
    } catch (e) { if (K === k) K = null; throw e; }
    if (K !== k || !intro.isConnected) { if (K === k) K = null; return false; }
    if (!opts.test && nt && nt.classList.contains('hidden')) { K = null; return false; }
    bygg(k, fore);
    await laddaTypsnitt(k.prov);
    if (K !== k || !intro.isConnected) { if (K === k) { K = null; } return false; }
    if (!opts.test && nt && nt.classList.contains('hidden')) { K = null; intro.hidden = true; intro.textContent = ''; return false; }
    kor(k);
    return true;
  }

  // Vad finns på datorn? Bara snabba frågor här (inga databaser läses): webbläsarna och om AdRaze redan är standard
  async function forbered() {
    const med = (p, std) => Promise.race([Promise.resolve().then(p).catch(() => std), vanta(2500).then(() => std)]);
    const [kallor, std] = await Promise.all([
      med(() => window.view.importKallor(), []),
      med(() => window.defaultBrowser.state(), null),
    ]);
    const ord = (id) => { const i = WB_ORDNING.indexOf(id); return i < 0 ? 99 : i; };
    const webblasare = (Array.isArray(kallor) ? kallor : [])
      .filter((x) => x && Array.isArray(x.profiler) && x.profiler.length)
      .sort((a, b) => ord(a.id) - ord(b.id)).slice(0, 4)
      .map((x) => ({ typ: x.typ, id: x.id, namn: x.namn, kort: String(x.namn).replace(/^(Microsoft|Google)\s+/, ''),
        antalProfiler: x.profiler.length, profil: x.profiler[0].id, profilNamn: x.profiler[0].namn, bm: null }));
    return { webblasare, arStandard: !!(std && std.default) };
  }

  /* ═════════ Bygg introt ═════════ */
  function bygg(k, fore) {
    const R = window.IntroRita, intro = k.intro;
    const steg = [{ id: 'valkommen', namn: T('Välkommen') }];
    if (fore.webblasare.length) steg.push({ id: 'flytt', namn: T('Flytta hit'), illu: 'app-installation' });
    steg.push({ id: 'utseende', namn: T('Utseende'), illu: 'personal-settings' });
    if (!fore.arStandard) steg.push({ id: 'standard', namn: T('Huvudwebbläsare'), illu: 'secure-server' });
    steg.push({ id: 'klart', illu: 'chilling' });
    const S = k.S = {
      steg, n: 1, max: 1, webblasare: fore.webblasare, arStandard: fore.arStandard,
      wb: (fore.webblasare.find((w) => w.id === 'edge') || fore.webblasare[0] || {}).id || null,
      tamed: { bm: true, pw: false, hist: true, flikar: false },
      lage: lageNu(), accent: accentNu(), fore: null,
      flyttat: null, flikar: [], standard: false, jobbar: false, sett: { flytt: false, standard: false },
    };
    const antalVal = steg.length - 2;
    const valText = antalVal >= 3 ? T('Tre snabba val, sen är du igång.') : antalVal === 2 ? T('Två snabba val, sen är du igång.') : T('Ett snabbt val, sen är du igång.');
    const stegNr = (id) => steg.findIndex((s) => s.id === id) + 1;
    const ik = (id, cls) => '<svg class="ik' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#ix-' + id + '"/></svg>';
    const chip = (v, text, pa) => '<button type="button" class="chip" role="checkbox" aria-checked="' + pa + '" data-v="' + v + '"><span class="ci">' + ik('check', 'ja') + ik('plus', 'nej') + '</span><span>' + esc(text) + '</span></button>';
    const mini = (cls) => '<span class="mf ' + cls + '"><i class="mf-flikar"></i><i class="mf-rad"></i><i class="mf-sida"></i></span>';
    const pillerText = T('annonser stoppade');
    const pillerBild = lugn() ? 'adraze-mark.png' : 'intro/gorilla-levande.svg';

    const sidor = {
      valkommen: '<h1 class="rubrik" id="ix-r-valkommen"></h1>'
        + '<p class="text">' + esc(T('Så där gör AdRaze på varje sida: annonser, spårare och popup-fönster åker ut innan de hinner ladda.')) + ' ' + esc(valText) + '</p>'
        + '<ul class="fakta"><li>' + ik('check') + '<span>' + esc(T('Gratis för alltid')) + '</span></li><li>' + ik('check') + '<span>' + esc(T('Öppen källkod')) + '</span></li><li>' + ik('check') + '<span>' + esc(T('Samlar ingen data')) + '</span></li></ul>',
      flytt: '<h2 class="rubrik" id="ix-r-flytt">' + esc(T('Ta med dig allt. Utom reklamen.')) + '</h2>'
        + '<p class="text">' + esc(T('Bokmärken och historik flyttar hit på några sekunder. Inget lämnar datorn.')) + '</p>'
        + '<div class="wb-grid" role="radiogroup" aria-labelledby="ix-r-flytt"></div>'
        + '<div class="tamed"><span class="etikett" id="ix-tamed">' + esc(T('Ta med')) + '</span><div class="chips" role="group" aria-labelledby="ix-tamed">'
        + chip('bm', T('Bokmärken'), true) + chip('pw', T('Lösenord'), false) + chip('hist', T('Historik'), true) + chip('flikar', T('Öppna flikar'), false) + '</div></div>'
        + '<p class="resultat" aria-live="polite">' + ik('check') + '<span></span></p>',
      utseende: '<h2 class="rubrik" id="ix-r-utseende">' + esc(T('Gör den till din.')) + '</h2>'
        + '<p class="text">' + esc(T('Ljust eller mörkt, och en färg som är din. Du ser ändringen direkt i hela webbläsaren.')) + '</p>'
        + '<div class="lagen" role="radiogroup" aria-labelledby="ix-r-utseende">'
        + LAGEN.map(([v, namn]) => '<button type="button" class="tema-val" role="radio" aria-checked="false" data-lage="' + v + '"><span class="mini" aria-hidden="true">'
          + (v === 'ljust' ? mini('ljus') : v === 'morkt' ? mini('mork') : mini('ljus') + mini('mork halv')) + '</span><span class="tema-namn">' + esc(T(namn)) + '</span></button>').join('')
        + '</div><div class="farg"><div class="farg-topp"><span class="etikett" id="ix-farg">' + esc(T('Färg')) + '</span><span class="farg-namn"></span></div>'
        + '<div class="farger" role="radiogroup" aria-labelledby="ix-farg"></div></div>',
      standard: '<h2 class="rubrik" id="ix-r-standard">' + esc(T('Alla länkar. Noll reklam.')) + '</h2>'
        + '<p class="text">' + esc(T('Gör AdRaze till din huvudwebbläsare, så öppnas länkar från mejl, chattar och dokument här, med gorillan i dörren.')) + '</p>'
        + '<div class="flode" aria-hidden="true"><span class="app">' + ik('mejl') + '</span><span class="app">' + ik('chat') + '</span><span class="app">' + ik('dok') + '</span><span class="pil"></span>'
        + '<span class="mal"><img src="adraze-mark.png" alt=""><span translate="no">AdRaze</span></span></div>'
        + (plattform === 'win32' ? '<div class="tips"><span class="win" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p>' + esc(T('Windows frågar en gång till i sina egna inställningar. Välj AdRaze där, sen är det klart.')) + '</p></div>'
          : plattform === 'darwin' ? '<div class="tips"><p>' + esc(T('macOS frågar en gång till. Svara att du vill använda AdRaze, sen är det klart.')) + '</p></div>' : '')
        + '<p class="resultat" aria-live="polite">' + ik('info') + '<span></span></p>',
      klart: '<h2 class="rubrik" id="ix-r-klart">' + esc(T('Klart. Luta dig tillbaka.')) + '</h2>'
        + '<p class="text">' + esc(T('Gorillan sköter dörren från och med nu. Allt du valt kan du ändra när du vill under Inställningar.')) + '</p>'
        + '<ul class="summa"></ul>',
    };

    intro.innerHTML =
      '<svg class="ix-sprite" aria-hidden="true" focusable="false">'
      + '<symbol id="ix-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>'
      + '<symbol id="ix-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>'
      + '<symbol id="ix-check" viewBox="0 0 24 24"><path d="M5 12.5l4.4 4.4L19 7.5"/></symbol>'
      + '<symbol id="ix-pil" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>'
      + '<symbol id="ix-pil-v" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>'
      + '<symbol id="ix-mejl" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></symbol>'
      + '<symbol id="ix-chat" viewBox="0 0 24 24"><path d="M4 6h16v10h-9l-4 3v-3H4z"/><path d="M8 10h8M8 13h5"/></symbol>'
      + '<symbol id="ix-dok" viewBox="0 0 24 24"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></symbol>'
      + '<symbol id="ix-glob" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="3.8" ry="9"/></symbol>'
      + '<symbol id="ix-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/></symbol>'
      + '</svg>'
      + '<div class="sloja"></div><div class="lappar"></div>'
      + '<div class="kortlager"><article class="kort" tabindex="-1" inert><div class="kort-bak"></div>'
      + '<div class="scen" aria-hidden="true"><div class="bana">'
      + '<figure class="bild b-gorilla nu"><span class="stage"></span><svg class="gor" viewBox="2 6 196 196" aria-hidden="true" focusable="false"></svg>'
      + '<div class="rakna dockad"><img src="' + pillerBild + '" alt=""><b><span>' + esc(tal(14)) + '</span></b><span>' + esc(pillerText) + '</span></div></figure>'
      + steg.filter((s) => s.illu).map((s) => '<figure class="bild" data-illu="' + s.illu + '"><span class="sol"></span></figure>').join('')
      + '</div><span class="korn"></span></div>'
      + '<div class="panel"><div class="panel-topp"><ol class="steg" style="--antal:' + (steg.length - 1) + '">'
      + steg.slice(0, -1).map((s, i) => '<li' + (i === 0 ? ' class="nu"' : '') + '><button type="button" data-ga="' + (i + 1) + '" tabindex="-1"><i><b></b></i><span>' + esc(s.namn) + '</span></button></li>').join('')
      + '</ol><button type="button" class="stang" title="' + esc(T('Hoppa över introt (Esc)')) + '" aria-label="' + esc(T('Hoppa över introt')) + '">' + ik('close') + '</button></div>'
      + '<div class="sidor">' + steg.map((s, i) => '<section class="sida' + (i === 0 ? ' nu' : '') + '" data-steg="' + s.id + '">' + sidor[s.id] + '</section>').join('') + '</div>'
      + '<footer class="panel-fot"><button type="button" class="tillbaka dold" tabindex="-1">' + ik('pil-v') + '<span>' + esc(T('Tillbaka')) + '</span></button>'
      + '<button type="button" class="knapp sek"></button>'
      + '<button type="button" class="knapp prim"><span class="pt"></span>' + ik('pil', 'pi') + ik('check', 'pk')
      + '<span class="vatska" aria-hidden="true"><span class="vatska-inne"><span class="pt"></span>' + ik('check', 'pk') + '</span></span></button>'
      + '</footer></div></article></div>'
      + '<div class="mitten"><div class="gorilla" aria-hidden="true"><div class="kropp"><svg class="gsvg" viewBox="2 6 196 196" data-r="0" data-lage="stangd"></svg></div></div></div>'
      + '<div class="smulor" aria-hidden="true"></div>'
      + '<div class="rakna flygande" aria-hidden="true"><img src="' + pillerBild + '" alt=""><b><span class="rakna-n">' + esc(tal(0)) + '</span></b><span class="rakna-t">' + esc(pillerText) + '</span></div>'
      + '<button class="hoppa knapp sek" type="button"><span>' + esc(T('Hoppa över')) + '</span><kbd>Esc</kbd></button>';
    intro.setAttribute('role', 'dialog');
    intro.setAttribute('aria-modal', 'true');
    intro.setAttribute('aria-label', T('Välkommen till AdRaze'));
    intro.tabIndex = -1;
    intro.classList.remove('kortfas', 'stanger', 'utan-oppning', 'frys');

    const q = (sel) => intro.querySelector(sel);
    const D = k.D = {
      q, sloja: q('.sloja'), lappar: q('.lappar'), smulor: q('.smulor'), mitten: q('.mitten'), gorilla: q('.gorilla'), kropp: q('.kropp'), gsvg: q('.gsvg'),
      rakna: q('.rakna.flygande'), raknaN: q('.rakna-n'), raknaT: q('.rakna-t'), hoppa: q('.hoppa'),
      kort: q('.kort'), kortBak: q('.kort-bak'), stage: q('.stage'), kgor: q('.gor'), rakna2: q('.rakna.dockad'), panel: q('.panel'), bana: q('.bana'),
      prim: q('.prim'), sek: q('.sek:not(.hoppa)'), tillbaka: q('.tillbaka'), stang: q('.stang'), stegOl: q('.steg'),
      sidor: [...intro.querySelectorAll('.sida')], bilder: [...intro.querySelectorAll('.bild')], stegLi: [...intro.querySelectorAll('.steg li')],
      r1: q('#ix-r-valkommen'),
    };
    D.ntDelar = (() => { const nt = document.getElementById('newtabpage'); return nt ? [...nt.children].filter((el) => el.id !== 'nt-bg' && el.id !== 'nt-dim') : []; })();
    D.ntMitt = document.getElementById('nt-innehall');
    const nt = document.getElementById('newtabpage');
    intro.classList.toggle('pa-foto', !!nt && !nt.classList.contains('anp-utan-bild'));

    // Välkomstrubriken: ordet inom [ ] stryks över med ett handritat streck. Hakparenteserna följer med i översättningen
    // ("The [ads] aren't."); tappar en översättning dem blir det inget streck, bara texten.
    (function rubrik() {
      const r1 = D.r1, rad2 = T('Det gör inte [reklamen].');
      r1.append(T('Du står på listan.'), document.createElement('br'));
      const m = /^([^[\]]*)\[([^[\]]+)\]([^[\]]*)$/.exec(rad2);
      if (!m) { r1.append(rad2.replace(/[[\]]/g, '')); return; }
      const s = document.createElement('span'); s.className = 'struken'; s.textContent = m[2];
      s.insertAdjacentHTML('beforeend', '<span class="streck" aria-hidden="true"><span><svg viewBox="0 0 200 20" preserveAspectRatio="none"><path class="s1" d="M2 13 C 34 8, 70 12, 104 9 S 168 7, 198 5"/><path class="s2" d="M8 16 C 52 12, 110 14, 150 10 S 186 9, 194 8"/></svg></span></span>');
      r1.append(m[1], s, m[3]);
    })();

    /* Lapparna */
    const adLappSvg = (st) => { const l = R.adLapp(), d = R.smooth(R.jit(l.p, 11 * 17 + 3, st, l.amp), true);
      return '<svg viewBox="64 128 74 46" aria-hidden="true"><path d="' + d + '" style="fill:none;stroke:var(--halo);stroke-width:12" stroke-linejoin="round"/>' + R.lagerPath(l, 11, st) + '</svg>'; };
    k.lappar = LAPPAR.map((d, i) => {
      const el = document.createElement('div');
      el.className = 'lapp ' + d.id + (d.sticker ? ' sticker' : ' ritad');
      el.style.cssText = '--x:' + d.x + ';--y:' + d.y + ';--w:' + d.w + ';--f:' + (d.f || '#ffd23e');
      el.setAttribute('aria-hidden', 'true');
      if (d.form) el.dataset.form = d.form;
      el.innerHTML = d.sticker ? adLappSvg(3) : (d.ad ? '<i class="ad-bricka' + (d.ad === 'h' ? ' h' : '') + '">' + adLappSvg(3 + i * 3) + '</i>' : '') + d.html();
      D.lappar.appendChild(el);
      return { ...d, el, i, slag: SLAG0 + SLAG_ORDN.indexOf(i) * SLAG_STEG };
    });
    D.nedrakning = q('.l-tid');
    // Små handritade detaljer: kryss, play, pil
    const linje = (pts, s, amp) => R.smooth(R.jit(pts, s, 3, amp), false);
    intro.querySelectorAll('.l-kryss').forEach((el, j) => {
      el.innerHTML = '<svg viewBox="0 0 24 24" style="overflow:visible"><path d="' + R.smooth(R.jit(R.oval(12, 12, 10, 10, 5 + j, 10), 77 + j, 3, .5), true) + '" fill="' + papper + '" stroke="' + ink + '" stroke-width="2.3"/>'
        + '<path d="' + linje([[7.6, 7.6], [12, 12], [16.4, 16.4]], 78, .5) + '" fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>'
        + '<path d="' + linje([[16.4, 7.6], [12, 12], [7.6, 16.4]], 79, .5) + '" fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/></svg>';
    });
    intro.querySelectorAll('.l-play').forEach((el) => {
      el.innerHTML = '<svg viewBox="0 0 24 24" style="overflow:visible"><path d="' + R.smooth(R.jit([[8, 5], [13.5, 8.5], [19.5, 12], [13.5, 15.5], [8, 19], [7.6, 12]], 81, 3, .45), true) + '" fill="' + papper + '"/></svg>';
    });
    intro.querySelectorAll('.l-pil').forEach((el) => {
      el.innerHTML = '<svg viewBox="0 0 24 28" style="overflow:visible"><path d="' + linje([[12, 2], [12.6, 10], [12, 23]], 83, .7) + '" fill="none" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round"/>'
        + '<path d="' + linje([[3.5, 15.5], [8, 20], [12.2, 25], [16.5, 20], [21, 15.5]], 84, .7) + '" fill="none" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    });

    /* Pappersbitar: fyra per lapp, i lappens färg (en svart). De sprätter ut ur mungiporna och faller. */
    k.smulor = [];
    k.lappar.forEach((d, i) => {
      if (d.sticker) return;
      for (let j = 0; j < 4; j++) {
        const el = document.createElement('i'); el.className = 'smula';
        const f = j === 3 ? ink : d.f, sida = (j + i) % 2 ? 1 : -1, h = (n) => Math.abs(R.H(i * 13 + j * 7 + n, 21 + n));
        const pts = R.jit([[1, 2], [9, .5], [15, 1.5], [16, 11], [8, 13], [2, 12]], 90 + i * 5 + j, 3, 1.5);
        el.innerHTML = '<svg viewBox="-2 -2 20 17"><path d="' + R.smooth(pts, true) + '" style="fill:' + (j === 3 ? 'var(--smula-ink)' : f) + '" stroke="' + ink + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        D.smulor.appendChild(el);
        k.smulor.push({ el, d, ox: sida * (.1 + .05 * h(1)), vx: sida * (.55 + .5 * h(2)), vy: .2 + .45 * h(3), rs: sida * (300 + 500 * h(4)) });
      }
    });

    /* Gorillan i öppningen: klicken + huvudet i fyra lägen, fyra kokande bildrutor var */
    (function byggGorilla() {
      const ST = [3, 6, 9, 12];
      const lagen = { stangd: R.gorillaLager('stangd'), gap: R.gorillaLager('gap'), logo: R.gorillaLager('logo'), blink: R.gorillaLager('blink') };
      let klick = '', huvud = '';
      ST.forEach((st, j) => { klick += '<g class="ruta" data-r="' + j + '">' + R.lagerPath(lagen.logo[0], 0, st) + '</g>'; });
      for (const [namn, L] of Object.entries(lagen)) {
        huvud += '<g class="lage" data-lage="' + namn + '">';
        ST.forEach((st, j) => { huvud += '<g class="ruta" data-r="' + j + '">' + L.slice(1).map((l, x) => R.lagerPath(l, x + 1, st)).join('') + '</g>'; });
        huvud += '</g>';
      }
      const hal = R.smooth(R.jit(R.blob(100, 104, 95, 9, 16, .06), 3, 3, 2.2), true);
      D.gsvg.innerHTML = '<defs><clipPath id="ix-hal"><path d="' + hal + '"/></clipPath></defs><g class="klick">' + klick + '</g><g clip-path="url(#ix-hal)"><g class="huvud">' + huvud + '</g></g>';
    })();
    D.klick = D.gsvg.querySelector('.klick'); D.huvud = D.gsvg.querySelector('.huvud');

    /* Samma gorilla i kortets scen, ritad med samma kod och frön, så att bytet i landningen inte syns.
       Här kokar bläcket med CSS och han blinkar ibland. */
    (function byggKortGorilla() {
      const ST = [3, 6, 9, 12];
      const grupp = (lage) => { const L = R.gorillaLager(lage);
        return ST.map((st, j) => '<g class="gk gk' + (j + 1) + '">' + R.lagerPath(L[0], 0, st) + L.slice(1).map((l, x) => R.lagerPath(l, x + 1, st)).join('') + '</g>').join(''); };
      D.kgor.innerHTML = '<g class="kg-logo">' + grupp('logo') + '</g><g class="kg-blink">' + grupp('blink') + '</g>';
    })();

    /* Sajtens gubbar i scenen */
    intro.querySelectorAll('.bild[data-illu]').forEach((el) => el.insertAdjacentHTML('beforeend', (window.IntroIllu || {})[el.dataset.illu] || ''));

    /* Kortets delar som kommer ur data */
    byggWebblasare(k); byggFarger(k); kopplaKort(k, stegNr);
    tillampaAccent(k); markeraUtseende(k);
    gaTill(k, 1);

    // Provtext för typsnitten: allt som syns, så att rätt teckenuppsättningar laddas för språket
    k.prov = (intro.textContent || '').replace(/\s+/g, ' ').slice(0, 4000) || ' ';
  }

  /* ═════════ Kortet (B): webbläsarna, färgerna, knapparna ═════════ */
  function byggWebblasare(k) {
    const g = k.D.q('.wb-grid'); if (!g) return;
    g.innerHTML = '';
    for (const w of k.S.webblasare) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wb'; b.setAttribute('role', 'radio'); b.dataset.wb = w.id;
      b.innerHTML = (WB_BILD[w.id] ? '<img alt="">' : '<span class="wb-ikon"><svg class="ik" aria-hidden="true"><use href="#ix-glob"/></svg></span>')
        + '<span class="wb-text"><span class="wb-namn" translate="no"></span><span class="wb-sub"></span></span><span class="wb-bock"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.4 4.4L19 7.5"/></svg></span>';
      if (WB_BILD[w.id]) b.querySelector('img').src = WB_BILD[w.id];
      b.querySelector('.wb-namn').textContent = w.namn;
      b.addEventListener('click', () => { if (k.S.jobbar) return; k.S.wb = w.id; markeraWb(k); visaLosenTips(k); uppdateraFot(k); });
      g.appendChild(b);
    }
    ritaWbUnder(k); markeraWb(k);
    // Antalet bokmärken läses i bakgrunden (Firefox-databasen kopieras först), korten fylls i när det är klart
    hamtaAntal(k);
  }
  function ritaWbUnder(k) {
    for (const w of k.S.webblasare) {
      const el = k.D.q('.wb[data-wb="' + w.id + '"] .wb-sub'); if (!el) continue;
      const antal = w.bm == null ? '' : w.bm === 1 ? T('{n} bokmärke', { n: tal(1) }) : T('{n} bokmärken', { n: tal(w.bm) });
      el.textContent = w.antalProfiler > 1 && w.profilNamn && antal ? T('{profil} · {antal}', { profil: w.profilNamn, antal }) : antal;
    }
  }
  async function hamtaAntal(k) {
    let ut = null;
    try { ut = await window.view.importAntal(); } catch {}
    if (K !== k || !Array.isArray(ut)) return;
    for (const w of k.S.webblasare) {
      const x = ut.find((y) => y && y.id === w.id && y.typ === w.typ);
      if (!x || !Array.isArray(x.profiler) || !x.profiler.length) continue;
      // Flera profiler: den med flest bokmärken (övriga finns under Inställningar › Lösenord › Importera)
      const basta = x.profiler.reduce((a, p) => ((p.bokmarken || 0) > (a.bokmarken || 0) ? p : a), x.profiler[0]);
      if (!k.S.jobbar) w.profil = basta.id;
      w.profilNamn = basta.namn; w.bm = basta.bokmarken || 0;
    }
    ritaWbUnder(k);
  }
  function markeraWb(k) { k.intro.querySelectorAll('.wb').forEach((b) => { const pa = b.dataset.wb === k.S.wb; b.setAttribute('aria-checked', String(pa)); b.tabIndex = pa ? 0 : -1; }); }
  const valdWb = (k) => k.S.webblasare.find((w) => w.id === k.S.wb) || null;

  function byggFarger(k) {
    const g = k.D.q('.farger'); if (!g) return;
    g.innerHTML = '';
    for (const [hex, namn] of accenter()) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'prick'; b.setAttribute('role', 'radio'); b.dataset.f = hex;
      b.style.setProperty('--c', hex); b.style.setProperty('--pa', textPa(hex));
      b.setAttribute('aria-label', T(namn)); b.title = T(namn);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.4 4.4L19 7.5"/></svg>';
      b.addEventListener('click', () => { if (k.S.accent !== hex) andraUtseende(k, { accent: hex }); });
      g.appendChild(b);
    }
  }
  // Accenten i introts egna variabler (samma uträkning som Anpassa: kontrast mot ljus och mörk yta)
  function tillampaAccent(k) {
    const hex = k.S.accent, at = AT(), st = k.intro.style;
    const p = at && at.palett ? at.palett(hex) : { l: hex, d: hex, inkL: hex, inkD: hex };
    st.setProperty('--acc-l', p.l); st.setProperty('--acc-d', p.d);
    st.setProperty('--acc-ink-l', p.inkL); st.setProperty('--acc-ink-d', p.inkD);
    st.setProperty('--acc-on-l', textPa(p.l)); st.setProperty('--acc-on-d', textPa(p.d));
  }
  function markeraUtseende(k) {
    k.intro.querySelectorAll('.tema-val').forEach((b) => { const pa = b.dataset.lage === k.S.lage; b.setAttribute('aria-checked', String(pa)); b.tabIndex = pa ? 0 : -1; });
    let nagon = false;
    k.intro.querySelectorAll('.prick').forEach((b) => { const pa = b.dataset.f === k.S.accent; nagon = nagon || pa; b.setAttribute('aria-checked', String(pa)); b.tabIndex = pa ? 0 : -1; });
    if (!nagon) { const f = k.intro.querySelector('.prick'); if (f) f.tabIndex = 0; }
    const namn = (accenter().find(([h]) => h === k.S.accent) || [])[1];
    const el = k.D.q('.farg-namn'); if (el) el.textContent = namn ? T(namn) : k.S.accent;
  }
  // Utseende gäller hela webbläsaren direkt (förhandsvisningen ÄR webbläsaren), via Anpassa-butiken som Inställningar
  // Temat läggs på när huvudprocessen svarat (anpassa-tema.js lyssnar före oss, så när vi hör ändringen syns den redan).
  // Ingen requestAnimationFrame här: under en vy-övergång ritas inget förrän bytet är klart.
  function vantaPaTema() {
    return new Promise((res) => {
      let klar = false; const fardig = () => { if (klar) return; klar = true; try { av(); } catch {} setTimeout(res, 40); };   // 40 ms: läge och färg kommer var för sig
      const av = A() ? A().on('tema.', fardig) : () => {};
      setTimeout(fardig, 220);
    });
  }
  async function sparaUtseende(k, { lage, accent }) {
    const a = A(), at = AT();
    try { if (window.AnpassaAngra) window.AnpassaAngra.tyst(2500); } catch {}   // ingen Ångra-toast för val i introt
    const klart = vantaPaTema();
    if (lage && at && at.valjLage) { try { at.valjLage(lage); } catch {} }
    if (accent && a) { try { a.set('tema.accent', accent === STANDARD_ACCENT ? undefined : accent, 'Accentfärg'); } catch {} }
    await klart;
  }
  function andraUtseende(k, val) {
    if (val.lage) k.S.lage = val.lage;
    if (val.accent) k.S.accent = val.accent;
    const kor = async () => { tillampaAccent(k); markeraUtseende(k); await Promise.race([sparaUtseende(k, val), vanta(300)]); };
    if (document.startViewTransition && !lugn()) {
      try {
        root.classList.add('ix-vt');
        const vt = document.startViewTransition(kor), bort = () => root.classList.remove('ix-vt');
        vt.ready.catch(() => {}); vt.finished.then(bort, bort);
        return;
      } catch { root.classList.remove('ix-vt'); }
    }
    kor();
  }

  function kopplaKort(k, stegNr) {
    const { D, S, intro } = k;
    intro.querySelectorAll('.tema-val').forEach((b) => b.addEventListener('click', () => { if (S.lage !== b.dataset.lage) andraUtseende(k, { lage: b.dataset.lage }); }));
    intro.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
      if (S.jobbar) return;
      const v = b.dataset.v; S.tamed[v] = !S.tamed[v]; b.setAttribute('aria-checked', String(S.tamed[v]));
      if (v === 'pw') visaLosenTips(k);
      uppdateraFot(k);
    }));
    D.stegLi.forEach((li) => li.querySelector('button').addEventListener('click', (e) => { const n = +e.currentTarget.dataset.ga; if (!S.jobbar && n !== S.n) gaTill(k, n); }));
    D.prim.addEventListener('click', () => {
      if (S.jobbar || !k.kortfas) return;
      const id = S.steg[S.n - 1].id;
      if (id === 'valkommen' || id === 'utseende') gaTill(k, S.n + 1);
      else if (id === 'flytt') { if (S.flyttVidare) gaTill(k, S.n + 1); else flytta(k); }
      else if (id === 'standard') { if (S.standardVidare) gaTill(k, S.n + 1); else gorStandard(k); }
      else stang(k);
    });
    D.sek.addEventListener('click', () => {
      const id = S.steg[S.n - 1].id;
      if (id === 'standard' && S.jobbar) { S.avbrytStandard = true; return; }   // slutar vänta på systemet
      if (S.jobbar || !k.kortfas) return;
      if (id === 'valkommen') return stang(k);
      if (id === 'utseende' && S.fore && (S.fore.lage !== S.lage || S.fore.accent !== S.accent)) andraUtseende(k, { lage: S.fore.lage, accent: S.fore.accent });
      if (id === 'standard') { try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 7 * 24 * 3600 * 1000)); } catch {} }   // som "Senare" i notisen
      gaTill(k, S.n + 1);
    });
    D.tillbaka.addEventListener('click', () => { if (!S.jobbar && S.n > 1) gaTill(k, S.n - 1); });
    D.stang.addEventListener('click', () => stang(k));
    k.stegNr = stegNr;
    k.ro = new ResizeObserver(() => matSteg(k)); k.ro.observe(D.stegOl);
  }

  function etikett(knapp, text) { const el = knapp.querySelectorAll('.pt'); if (el.length) el.forEach((x) => { x.textContent = text; }); else knapp.textContent = text; }
  function uppdateraFot(k) {
    const { D, S } = k, id = S.steg[S.n - 1].id;
    D.tillbaka.classList.toggle('dold', S.n === 1); D.tillbaka.tabIndex = S.n === 1 ? -1 : 0;
    D.sek.hidden = id === 'klart';
    etikett(D.sek, id === 'valkommen' ? T('Hoppa över introt') : id === 'standard' ? T('Inte nu') : T('Hoppa över'));
    if (S.jobbar) return;
    const nagot = Object.values(S.tamed).some(Boolean), w = valdWb(k);
    const prim = {
      valkommen: T('Kom igång'),
      flytt: S.flyttVidare || !nagot || !w ? T('Fortsätt') : T('Flytta från {namn}', { namn: w.kort }),
      utseende: T('Fortsätt'),
      standard: S.standardVidare ? T('Fortsätt') : T('Gör AdRaze till standard'),
      klart: T('Börja surfa'),
    }[id];
    etikett(D.prim, prim);
  }
  function gaTill(k, n) {
    const { D, S, intro } = k;
    n = Math.max(1, Math.min(S.steg.length, n));
    const id = S.steg[n - 1].id;
    if (id === 'utseende' && S.steg[S.n - 1].id !== 'utseende') S.fore = { lage: S.lage, accent: S.accent };
    if (id === 'flytt' && !S.sett.flytt) { S.sett.flytt = true; try { localStorage.setItem('adraze-flytt-erbjuden', '1'); } catch {} }   // erbjudandet är gjort: ingen flyttnotis efteråt
    if (id === 'standard') S.sett.standard = true;
    if (S.n !== n) { S.flyttVidare = false; S.standardVidare = false; }
    S.n = n; S.max = Math.max(S.max, n);
    D.sidor.forEach((s, i) => { const x = i + 1; s.classList.toggle('nu', x === n); s.classList.toggle('fore', x < n); s.inert = x !== n; });
    D.bana.style.setProperty('--i', n - 1);
    D.bilder.forEach((b, i) => b.classList.toggle('nu', i === n - 1));
    D.stegLi.forEach((li, i) => {
      const x = i + 1; li.classList.toggle('nu', x === n); li.classList.toggle('klar', x < n);
      const b = li.querySelector('button'); b.disabled = !(x < n || (x <= S.max && x !== n)); b.setAttribute('aria-current', x === n ? 'step' : 'false');
    });
    const antal = S.steg.length - 1;
    D.stegOl.setAttribute('aria-label', T('Steg {n} av {m}', { n: Math.min(n, antal), m: antal }));
    if (k.kortfas) intro.setAttribute('aria-labelledby', 'ix-r-' + id);
    if (id === 'klart') byggSumma(k);
    if (id === 'flytt' && !S.flyttat) visaLosenTips(k);
    uppdateraFot(k);
    matSteg(k);
  }
  // Får något stegnamn inte plats (smalt fönster, tyska) visas bara det aktuella namnet
  function matSteg(k) {
    const ol = k.D.stegOl; if (!ol) return;
    ol.classList.remove('trang');
    ol.classList.toggle('trang', [...ol.querySelectorAll('span')].some((s) => s.scrollWidth > s.clientWidth + 1));
  }

  /* Resultatraden under ett steg: typ = 'ok' (bock), 'info' eller 'fel' */
  function resultat(k, stegId, typ, text, lankText, lankFn) {
    const p = k.D.q('.sida[data-steg="' + stegId + '"] .resultat'); if (!p) return;
    if (!text) { p.classList.remove('syns'); return; }
    p.classList.toggle('info', typ === 'info'); p.classList.toggle('fel', typ === 'fel');
    const use = p.querySelector('use'); if (use) use.setAttribute('href', typ === 'ok' ? '#ix-check' : '#ix-info');
    const sp = p.querySelector('span'); sp.textContent = text;
    if (lankText && lankFn) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lank'; b.textContent = lankText;
      b.addEventListener('click', lankFn); sp.append(' ', b);
    }
    p.classList.add('syns');
  }
  // Lösenord går bara att flytta med en CSV-fil som man exporterar ur den andra webbläsaren (importera.js). Det sägs rakt ut.
  function visaLosenTips(k) {
    const S = k.S; if (S.flyttat || S.jobbar) return;
    const w = valdWb(k);
    if (S.tamed.pw && w) resultat(k, 'flytt', 'info', T('Lösenord flyttar via en CSV-fil som du exporterar ur {namn}. Du väljer filen efter flytten.', { namn: w.kort }));
    else resultat(k, 'flytt', null, '');
  }

  function byggSumma(k) {
    const { S } = k, ul = k.D.q('.summa'); if (!ul) return;
    ul.innerHTML = '';
    const rad = (text, av) => {
      const li = document.createElement('li'); if (av) li.className = 'av';
      li.innerHTML = '<span class="bock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.4 4.4L19 7.5"/></svg></span><span></span>';
      li.lastChild.textContent = text; ul.appendChild(li);
    };
    if (S.steg.some((s) => s.id === 'flytt')) {
      const delar = S.flyttat ? flyttDelar(S.flyttat) : [];
      if (delar.length) rad(T('{lista} från {namn}', { lista: ochLista(delar), namn: S.flyttat.namn }));
      else rad(T('Bokmärken kan du flytta senare under Inställningar'), true);
    }
    const lage = (LAGEN.find(([v]) => v === S.lage) || LAGEN[0])[1];
    const farg = (accenter().find(([h]) => h === S.accent) || [])[1];
    rad(farg ? T('{lage} läge och färgen {farg}', { lage: T(lage), farg: T(farg) }) : T('{lage} läge', { lage: T(lage) }));
    if (S.arStandard || S.standard) rad(T('AdRaze är din huvudwebbläsare'));
    else rad(T('Huvudwebbläsare kan du välja senare under Inställningar'), true);
  }
  function flyttDelar(f, medFlikar = true) {
    const d = [];
    if (f.bm) d.push(f.bm === 1 ? T('{n} bokmärke', { n: tal(1) }) : T('{n} bokmärken', { n: tal(f.bm) }));
    if (f.pw) d.push(T('{n} lösenord', { n: tal(f.pw) }));
    if (f.hist) d.push(f.hist === 1 ? T('{n} sida i historiken', { n: tal(1) }) : T('{n} sidor i historiken', { n: tal(f.hist) }));
    if (medFlikar && f.flikar) d.push(f.flikar === 1 ? T('{n} flik', { n: tal(1) }) : T('{n} flikar', { n: tal(f.flikar) }));
    return d;
  }
  // Resultatraden efter flytten: det som är på plats, och flikarna (de öppnas när introt stängs)
  function flyttText(f) {
    const delar = flyttDelar(f, false), ut = [];
    if (delar.length) ut.push(T('{lista} är på plats.', { lista: ochLista(delar) }));
    if (f.flikar) ut.push(f.flikar === 1 ? T('{n} flik öppnas när du är klar.', { n: tal(1) }) : T('{n} flikar öppnas när du är klar.', { n: tal(f.flikar) }));
    return ut.join(' ');
  }

  /* Huvudknappen som förloppsmätare: --p = hur långt ner vätskan är (1 = tom, 0 = full) */
  function borjaJobba(k, text) { const p = k.D.prim; p.style.minWidth = p.offsetWidth + 'px'; k.S.jobbar = true; p.classList.add('jobbar'); p.setAttribute('aria-busy', 'true'); p.style.setProperty('--p', 1); etikett(p, text); }
  function slutaJobba(k) { const p = k.D.prim; k.S.jobbar = false; p.classList.remove('jobbar', 'fylld'); p.removeAttribute('aria-busy'); p.style.removeProperty('--p'); p.style.minWidth = ''; }
  function fylld(k, text) { const p = k.D.prim; p.style.setProperty('--p', 0); p.classList.add('fylld'); etikett(p, text); }
  // Vätskan stiger stegvis medan något pågår (snabbare än så går det inte att se), tills klar() anropas
  function stigande(k, steg, ms) {
    let i = 0, stopp = false;
    const nasta = () => { if (stopp || K !== k) return; if (i < steg.length) { k.D.prim.style.setProperty('--p', steg[i++]); setTimeout(nasta, lugn() ? 60 : ms); } };
    nasta();
    return () => { stopp = true; };
  }

  /* Flytta hit: samma import som Inställningar › Lösenord (shell.js lägger in bokmärken och historik). Flikarna öppnas
     när introt stängs, så att inga sidor dyker upp ovanpå det. */
  async function flytta(k) {
    const { S } = k, w = valdWb(k), bro = k.opts.bro || {};
    const { bm, pw, hist, flikar } = S.tamed;
    if (!w || (!bm && !pw && !hist && !flikar)) return gaTill(k, S.n + 1);
    borjaJobba(k, T('Flyttar…'));
    resultat(k, 'flytt', null, '');
    const t0 = Date.now();
    let r = { ok: true, bokmarken: 0, historik: 0, flikar: [] };
    if (bm || hist || flikar) {
      const stopp = stigande(k, [.8, .58, .38, .26], 420);
      try { r = bro.importera ? await bro.importera({ typ: w.typ, id: w.id, profil: w.profil, bokmarken: bm, historik: hist, flikar }) : { ok: false }; }
      catch (e) { r = { ok: false, fel: String(e && e.message || e) }; }
      stopp();
      if (K !== k) return;
      if (!r || !r.ok) { slutaJobba(k); uppdateraFot(k); resultat(k, 'flytt', 'fel', T('Kunde inte läsa webbläsaren.')); return; }
    }
    const f = S.flyttat = { namn: w.kort, bm: r.bokmarken || 0, hist: r.historik || 0, flikar: (r.flikar || []).length, pw: 0 };
    S.flikar = r.flikar || [];
    // Lösenorden: den befintliga CSV-importen (filväljaren öppnas, som Inställningar › Lösenord › Välj fil)
    let losen = null;
    if (pw) {
      k.D.prim.style.setProperty('--p', .2);
      try { losen = await window.view.importLosenCsv(); } catch (e) { losen = { ok: false, fel: String(e && e.message || e) }; }
      if (K !== k) return;
      if (losen && losen.ok) f.pw = losen.antal || 0;
    }
    if (Date.now() - t0 < 900 && !lugn()) await vanta(900 - (Date.now() - t0));   // vätskan hinner synas stiga
    if (K !== k) return;
    const klart = flyttText(f);
    const pwMiss = pw && !(losen && losen.ok);
    fylld(k, T('Färdigt'));
    if (!klart && !pwMiss) resultat(k, 'flytt', 'info', T('Inget nytt att ta med från {namn}.', { namn: w.kort }));
    else if (!pwMiss) resultat(k, 'flytt', 'ok', klart);
    else {
      const fel = losen && !losen.avbruten && losen.fel ? T(losen.fel) : '';
      const om = T('Lösenorden kan du ta med senare under Inställningar.');
      resultat(k, 'flytt', klart ? 'ok' : 'info', [klart, fel, om].filter(Boolean).join(' '), T('Välj CSV-fil igen'), () => valjCsvIgen(k));
    }
    await vanta(lugn() ? 700 : 1100);
    if (K !== k) return;
    slutaJobba(k);
    // Gick allt som det skulle glider kortet vidare av sig självt (som i förslaget), annars står det kvar med Fortsätt
    if (klart && !pwMiss) gaTill(k, S.n + 1);
    else { S.flyttVidare = true; uppdateraFot(k); }
  }
  async function valjCsvIgen(k) {
    const S = k.S; if (S.jobbar || !S.flyttat) return;
    let r = null; try { r = await window.view.importLosenCsv(); } catch (e) { r = { ok: false, fel: String(e && e.message || e) }; }
    if (K !== k || !r || r.avbruten) return;
    if (r.ok) {
      S.flyttat.pw += r.antal || 0;
      resultat(k, 'flytt', 'ok', flyttText(S.flyttat));
    } else resultat(k, 'flytt', 'fel', T(r.fel || 'Kunde inte importera lösenorden.'), T('Välj CSV-fil igen'), () => valjCsvIgen(k));
  }

  /* Huvudwebbläsare: samma väg som notisen (window.defaultBrowser). Linux sätter direkt; Windows öppnar sina
     inställningar (svarar manual) och macOS frågar själv, så där väntar knappen tills AdRaze är vald eller man går vidare. */
  async function gorStandard(k) {
    const { S } = k;
    S.avbrytStandard = false;
    borjaJobba(k, plattform === 'win32' ? T('Väntar på Windows…') : T('Sätter…'));
    resultat(k, 'standard', null, '');
    const t0 = Date.now();
    k.D.prim.style.setProperty('--p', .72);
    let r = null; try { r = await window.defaultBrowser.set(); } catch {}
    if (K !== k) return;
    let ok = !!(r && r.ok);
    if (!ok && ((r && r.manual) || plattform === 'darwin')) {
      resultat(k, 'standard', 'info', plattform === 'darwin' ? T('Svara i rutan som macOS visar.') : T('Välj AdRaze i systeminställningarna som öppnades.'));
      k.D.prim.style.setProperty('--p', .5);
      // Fråga systemet då och då (högst två minuter). "Inte nu" avbryter väntan.
      for (let i = 0; i < 80 && !ok && !S.avbrytStandard && K === k; i++) {
        await vanta(1500);
        try { const st = await window.defaultBrowser.state(); ok = !!(st && st.default); } catch {}
      }
      if (K !== k) return;
      if (S.avbrytStandard && !ok) { slutaJobba(k); resultat(k, 'standard', null, ''); gaTill(k, S.n + 1); return; }
    }
    if (!ok) {
      slutaJobba(k); uppdateraFot(k);
      if (S.avbrytStandard) return;
      resultat(k, 'standard', 'fel', T('Kunde inte sätta AdRaze som standard.'));
      S.standardVidare = true; uppdateraFot(k);
      return;
    }
    S.standard = true;
    if (Date.now() - t0 < 700 && !lugn()) await vanta(700 - (Date.now() - t0));
    if (K !== k) return;
    resultat(k, 'standard', null, '');
    fylld(k, T('Färdigt'));
    await vanta(lugn() ? 500 : 850);
    if (K !== k) return;
    slutaJobba(k); gaTill(k, S.n + 1);
  }

  /* ═════════ Öppningen (A): mått och en bildruta vid tiden t ═════════ */
  // Rubrikerna i lapparna krymper om ett ord inte får plats (tyska!) i stället för att brytas mitt i
  function passa(k) {
    k.intro.querySelectorAll('.lapp :is(.l-stor, .l-mellan, .l-serif, .l-rea)').forEach((el) => {
      el.style.fontSize = '';
      const lapp = el.closest('.lapp'), cs = getComputedStyle(lapp);
      const max = lapp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const bas = parseFloat(getComputedStyle(el).fontSize);
      for (let f = .96; el.scrollWidth > max + 1 && f >= .6; f -= .04) el.style.fontSize = (bas * f).toFixed(2) + 'px';
    });
  }
  function ritaRamar(k) {
    const R = window.IntroRita, u = parseFloat(getComputedStyle(k.intro).fontSize);
    k.intro.querySelectorAll('.ritad').forEach((el, j) => {
      const w = el.offsetWidth, h = el.offsetHeight; if (!w || !h) return;
      const cs = getComputedStyle(el);
      const sw = (parseFloat(cs.getPropertyValue('--swk')) || .2) * u;
      const amp = (parseFloat(cs.getPropertyValue('--ampk')) || .1) * u;
      const rund = (parseFloat(cs.getPropertyValue('--rundk')) || .4) * u;
      const fyll = cs.getPropertyValue('--fyll').trim() || 'none';
      const m = sw / 2 + amp, form = el.dataset.form;
      let pts;
      if (form === 'stjarna') pts = R.stjarna(w / 2, h / 2, Math.min(w, h) / 2 - m, Math.min(w, h) / 2 * .76 - m, 13);
      else if (form === 'piller') pts = R.piller(m, m, w - 2 * m, h - 2 * m, 1.4 * u);
      else if (form === 'rund') pts = R.oval(w / 2, h / 2, w / 2 - m, h / 2 - m, j + 3, 10);
      else pts = R.ramPunkter(m, m, w - 2 * m, h - 2 * m, rund, 1.9 * u);
      const d = R.smooth(R.jit(pts, 40 + j * 7, 3, amp), true);
      let svg = el.querySelector(':scope > svg.ram');
      if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'ram'); svg.setAttribute('aria-hidden', 'true'); el.prepend(svg); }
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      const halo = el.classList.contains('lapp') ? '<path d="' + d + '" style="fill:none;stroke:var(--halo);stroke-width:' + (sw * 2.7).toFixed(2) + 'px" stroke-linejoin="round"/>' : '';
      svg.innerHTML = halo + '<path d="' + d + '" style="fill:' + fyll + ';stroke:' + ink + ';stroke-width:' + sw.toFixed(2) + 'px" stroke-linejoin="round" stroke-linecap="round"/>';
    });
  }

  function mat(k) {
    const { D } = k, ir = k.intro.getBoundingClientRect(), gr = D.gorilla.getBoundingClientRect();
    const M = k.M = { W: ir.width, H: ir.height, gx: gr.left - ir.left, gy: gr.top - ir.top, G: gr.width };
    const mun0 = gPunkt(k, 100, 154, { s: SCEN, sx: 1, sy: 1, r: 0 });
    k.lappar.forEach((d) => { d.hx = d.x / 100 * M.W; d.hy = d.y / 100 * M.H; d.bw = d.el.offsetWidth; d.dist = Math.hypot(mun0[0] - d.hx, mun0[1] - d.hy); });
    // Gorillan äter de närmaste först. AD-lappen sparas till sist och blir loggans lapp.
    const vanliga = k.lappar.filter((d) => !d.sticker).sort((a, b) => a.dist - b.dist);
    const diag = Math.hypot(M.W, M.H);
    vanliga.forEach((d, n) => { d.a = ANKOMST[n]; d.f = .3 + .32 * d.dist / diag; d.e = d.a - d.f - RYCK; d.vrid = (n % 2 ? 1 : -1) * (90 + (n * 37) % 80); d.bage = (n % 2 ? -1 : 1) * .16; d.slutS = .1; });
    const s = k.lappar.find((d) => d.sticker);
    s.a = TID.fangst; s.f = .34; s.e = s.a - s.f - RYCK; s.vrid = 0; s.bage = .08;
    // Kortets slutläge (utan transform), och var gorillan och räknaren ska landa i det
    const kt = D.kort.style.transform; D.kort.style.transform = 'none';
    const kr = D.kort.getBoundingClientRect(), kg = D.kgor.getBoundingClientRect(), kp = D.rakna2.getBoundingClientRect();
    D.kort.style.transform = kt;
    M.k = { x: kr.left - ir.left, y: kr.top - ir.top, w: kr.width, h: kr.height };
    M.kg = { x: kg.left - ir.left + kg.width / 2, y: kg.top - ir.top + kg.height / 2, s: kg.width };
    M.kp = { x: kp.left - ir.left + kp.width / 2, y: kp.top - ir.top + kp.height / 2 };
    M.p = { x: D.rakna.offsetLeft, y: D.rakna.offsetTop + D.rakna.offsetHeight / 2 };   // left: 50% → offsetLeft är mitten
  }
  // Punkt i gorillans ritning (viewBox-enheter) -> px i introt, med kroppens hållning h
  function gPunkt(k, px, py, h) {
    const M = k.M, G = M.G, ox = M.gx + G / 2, oy = M.gy + G;
    const vx = ((px - 2) / 196 * G - G / 2) * h.s * h.sx, vy = ((py - 6) / 196 * G - G) * h.s * h.sy;
    const c = Math.cos(h.r), s = Math.sin(h.r);
    return [ox + vx * c - vy * s, oy + vx * s + vy * c];
  }
  // Kroppens hållning när han äter: andas in, sväljer, hugger och tuggar
  function kropp(k, t) {
    let sx = 1, sy = 1, r = 0;
    const dg = t - TID.gap;
    if (dg > 0 && dg < .24) { const q = Math.sin(Math.PI * dg / .24); sx += .05 * q; sy += .07 * q; }
    for (const d of k.lappar) { if (d.sticker) continue; const da = t - d.a; if (da > 0 && da < .18) { const q = Math.sin(Math.PI * da / .18); sx += .04 * q; sy -= .06 * q; } }
    const df = t - TID.fangst;
    if (df > 0 && df < .22) { const q = Math.sin(Math.PI * df / .22); sx += .08 * q; sy -= .12 * q; }
    if (df > 0 && df < .75) r = 6.5 * Math.sin(2 * Math.PI * df / .3) * Math.exp(-df / .2) * Math.PI / 180;
    return { s: SCEN, sx, sy, r };
  }
  // Startsidan bakom introt: tonas bort under lapparna och kommer tillbaka bakom slöjan
  function startsida(k, v, y) {
    for (const el of k.D.ntDelar) op(el, v);
    if (k.D.ntMitt) k.D.ntMitt.style.transform = y ? 'translateY(' + y.toFixed(2) + 'px)' : '';
  }
  function aterstallStartsida(k) {
    for (const el of k.D.ntDelar) el.style.opacity = '';
    if (k.D.ntMitt) k.D.ntMitt.style.transform = '';
  }

  function rita(k, t, tKok) {
    const { D, M } = k, h = kropp(k, t);
    const p = kl((t - TID.kort) / TID.kortDur);

    /* Kortet glider fram ur scenen: skalas upp kring sin mitt och glider de sista pixlarna uppåt */
    const ek = utKvint(p), ks = .93 + .07 * ek, ky = 30 * (1 - ek);
    const kcx = M.k.x + M.k.w / 2, kcy = M.k.y + M.k.h / 2;
    const iKortet = (x, y) => [kcx + (x - kcx) * ks, kcy + (y - kcy) * ks + ky];   // punkt i kortets slutläge -> där den är just nu
    D.kort.style.transform = p >= 1 ? '' : 'translateY(' + ky.toFixed(2) + 'px) scale(' + ks.toFixed(4) + ')';
    op(D.kortBak, utKub(kl(p / .42)));
    op(D.stage, utKub(kl(p / .24)));                    // den mörka scenen kommer fort, så den aldrig hänger kvar som grå
    const pp = utKub(kl((p - .4) / .52));
    op(D.panel, pp); D.panel.style.transform = 'translateY(' + (14 * (1 - pp)).toFixed(2) + 'px)';
    op(D.sloja, utKub(kl(p / .62)));

    /* Gorillan: står still och äter, sen hoppar han in i kortets scen (samma storlek och plats som kopian där) */
    const G = M.G, S0 = G * SCEN, X0 = M.gx + G / 2, Y0 = M.gy + G - S0 / 2;
    const [Xm, Ym] = iKortet(M.kg.x, M.kg.y), Sm = M.kg.s * ks;
    const pf = kl(p / .8), ef = inUt(pf);
    const X = X0 + (Xm - X0) * ef, Y = Y0 + (Ym - Y0) * ef - HOPP * S0 * Math.sin(Math.PI * pf), Sz = S0 + (Sm - S0) * ef;
    const studs = Math.sin(Math.PI * kl((p - .78) / .22));          // han landar och sjunker ihop lite
    const sc = Sz / G, sx = h.sx * (1 + .05 * studs), sy = h.sy * (1 - .07 * studs);
    const rot = h.r * 180 / Math.PI - 5 * Math.sin(Math.PI * pf);
    D.kropp.style.transform = 'translate(' + (X - X0).toFixed(2) + 'px, ' + (Y - (M.gy + G - Sz / 2)).toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + (sc * sx).toFixed(4) + ', ' + (sc * sy).toFixed(4) + ')';

    // klicken stänker ut, huvudet kliver upp ur den
    const pk = t < TID.klick ? 0 : utBak(kl((t - TID.klick) / TID.klickDur), 2.4);
    D.klick.style.opacity = pk > 0 ? 1 : 0;
    D.klick.setAttribute('transform', 'translate(100 104) scale(' + pk.toFixed(4) + ') translate(-100 -104)');
    const hy = t < TID.upp ? 200 : 200 * (1 - utBak(kl((t - TID.upp) / TID.uppDur), 1.1));
    D.huvud.setAttribute('transform', 'translate(0 ' + hy.toFixed(2) + ')');
    D.huvud.style.opacity = t < TID.upp ? 0 : 1;
    const lage = t < TID.gap ? 'stangd' : t < TID.fangst ? 'gap' : 'logo';
    if (lage !== k.senastLage) { D.gsvg.dataset.lage = lage; k.senastLage = lage; }
    const ruta = lugn() ? 0 : Math.floor(tKok / .11) % 4;
    if (ruta !== k.senastRuta) { D.gsvg.dataset.r = ruta; k.senastRuta = ruta; }

    // lapparna
    const mun = gPunkt(k, 100, 154, h), lappMitt = gPunkt(k, 101, 151, h);
    let antal = 0;
    for (const d of k.lappar) {
      let x = 0, y = 0, rot2 = d.r, s = 1, o = 1, flyger = false;
      if (t < d.slag) o = 0;
      else if (t < d.slag + SLAG_DUR) { const q = (t - d.slag) / SLAG_DUR; s = 1.32 - .32 * utBak(q, 2); o = Math.min(1, q * 3.2); rot2 = d.r + 7 * (1 - utKub(q)); }
      if (t >= d.slag + SLAG_DUR && t < d.e) {           // reklam är jobbig: den blinkar, skakar och vickar
        if (d.id === 'vinn') s *= 1 + .035 * Math.max(0, Math.sin(2 * Math.PI * 2.6 * t));
        if (d.id === 'rea') rot2 += 5 * Math.sin(2 * Math.PI * 2.2 * t);
        if (d.id === 'virus') x += 2.2 * Math.sin(2 * Math.PI * 11 * t) * (Math.sin(2 * Math.PI * 1.3 * t) > .2 ? 1 : 0);
      }
      if (t >= d.e) {
        const tx = d.sticker ? lappMitt[0] : mun[0], ty = d.sticker ? lappMitt[1] : mun[1];
        const dx = tx - d.hx, dy = ty - d.hy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        if (t < d.e + RYCK) {                             // ryck: lappen slits loss
          const q = (t - d.e) / RYCK;
          x = -ux * 9 * Math.sin(q * Math.PI / 2); y = -uy * 9 * Math.sin(q * Math.PI / 2); s = 1 + .07 * q; rot2 = d.r + (d.vrid >= 0 ? 4 : -4) * q;
        } else if (t < d.a) {                             // sugs in i käften i en båge
          const q = (t - d.e - RYCK) / d.f, e = Math.pow(q, 2.1);
          const sx0 = d.hx - ux * 9, sy0 = d.hy - uy * 9;
          const bx = -uy * d.bage * L * Math.sin(Math.PI * q), by = ux * d.bage * L * Math.sin(Math.PI * q);
          x = sx0 + (tx - sx0) * e + bx - d.hx; y = sy0 + (ty - sy0) * e + by - d.hy;
          if (d.sticker) {
            const slutS = (74 / 196) * M.G * h.s * h.sx / d.bw;
            s = 1.07 + (slutS - 1.07) * utKub(q); rot2 = d.r + 4 + (0 - d.r - 4) * utKub(q);
          } else {
            s = 1.07 + (d.slutS - 1.07) * Math.pow(e, .75); rot2 = d.r + 4 * Math.sign(d.vrid) + d.vrid * e;
            const kvar = Math.hypot(tx - (d.hx + x), ty - (d.hy + y));          // tonar bort de sista centimetrarna in i käften
            o = Math.min(1, kvar / (.16 * M.G * h.s));
          }
          flyger = true;
        } else { o = 0; antal++; }
      }
      if (flyger !== d.flyger) { d.el.classList.toggle('flyger', flyger); d.flyger = flyger; }
      d.el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + rot2.toFixed(2) + 'deg) scale(' + s.toFixed(4) + ')';
      d.el.style.opacity = o.toFixed(3);
    }
    if (D.nedrakning) D.nedrakning.textContent = t < 1.0 ? '00:59' : '00:58';

    // pappersbitar (från där han stod och åt). De tonar bort när kortet kommer, så de inte regnar över texten.
    const kf = M.G / 190, smulOp = 1 - utKub(kl(p / .2));
    for (const c of k.smulor) {
      const dd = t - c.d.a;
      if (dd < 0 || dd > .62) { if (c.vis) { c.el.style.opacity = 0; c.vis = false; } continue; }
      const x = mun[0] + c.ox * M.G * h.s + c.vx * 300 * kf * dd;
      const y = mun[1] - c.vy * 420 * kf * dd + .5 * 2300 * kf * dd * dd;
      c.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-50%) rotate(' + (c.rs * dd).toFixed(1) + 'deg)';
      c.el.style.opacity = ((dd < .4 ? 1 : 1 - (dd - .4) / .22) * smulOp).toFixed(3); c.vis = true;
    }

    /* Räknaren räknar exakt det öppningen räknar: en tugga = ett steg. Siffran glider upp vid varje tick. */
    if (antal !== k.senastAntal) { D.raknaN.textContent = tal(antal); D.raknaT.textContent = antal === 1 ? T('annons stoppad') : T('annonser stoppade'); k.senastAntal = antal; }
    let senaste = -1; for (const d of k.lappar) if (d.a <= t && d.a > senaste) senaste = d.a;
    const tick = senaste > 0 ? utKub(kl((t - senaste) / .13)) : 1;
    D.raknaN.style.transform = 'translateY(' + (55 * (1 - tick)).toFixed(1) + '%)'; op(D.raknaN, tick);
    const pin = utKub(kl((t - TID.piller) / TID.pillerDur));
    const puls = 1 + .08 * Math.sin(Math.PI * kl((t - TID.fangst) / .42));   // sista tuggan: pillret gör en liten studs
    const pr = kl((p - .06) / .82), er = inUt(pr);                            // och sen flyger det in i kortet, under gorillan
    const [Xp, Yp] = iKortet(M.kp.x, M.kp.y);
    const rdx = (Xp - M.p.x) * er, rdy = 26 * (1 - pin) + (Yp - M.p.y) * er;
    D.rakna.style.transform = 'translate(calc(-50% + ' + rdx.toFixed(2) + 'px), ' + rdy.toFixed(2) + 'px) scale(' + ((.92 + .08 * pin) * puls * (1 + (ks - 1) * er)).toFixed(4) + ')';
    op(D.rakna, pin);

    // startsidan göms under lapparna, och kommer tillbaka bakom slöjan när kortet tar över
    startsida(k, Math.max(t < .45 ? 1 : Math.max(0, 1 - (t - .45) / .25), utKub(kl((p - .3) / .5))), 0);

    // hoppa över: syns direkt, tonar bort när kortets egna knappar tar över
    const ho = t < .12 ? t / .12 : 1 - kl(p / .3);
    op(D.hoppa, ho); D.hoppa.style.pointerEvents = ho > .3 ? 'auto' : 'none'; D.hoppa.tabIndex = ho > .3 ? 0 : -1;

    if ((t >= TID.slut) !== !!k.kortfas) satKortfas(k, t >= TID.slut);
  }

  /* Bytet: gorillan och räknaren har landat på exakt samma plats som kopiorna i kortet. Nu tar kortet över. */
  function satKortfas(k, pa) {
    const { D, intro } = k;
    k.kortfas = pa;
    intro.classList.toggle('kortfas', pa);
    D.kort.inert = !pa;
    clearTimeout(k.stryktimer);
    if (pa) {
      for (const el of [D.kortBak, D.stage, D.panel, D.sloja]) { el.style.opacity = ''; el.style.transform = ''; }
      D.kort.style.transform = '';
      intro.setAttribute('aria-labelledby', 'ix-r-' + k.S.steg[k.S.n - 1].id);
      if (intro.classList.contains('frys') || lugn()) D.r1.classList.add('stryk');
      else k.stryktimer = setTimeout(() => D.r1.classList.add('stryk'), 140);
    } else {
      intro.removeAttribute('aria-labelledby');
      D.r1.classList.remove('stryk');
    }
  }

  /* ═════════ Spela, spola fram, stäng ═════════ */
  function kor(k) {
    const { intro, D, opts } = k;
    k.tl = 0; k.fart = 1; k.forra = 0; k.start = 0; k.senastAntal = -1; k.senastLage = ''; k.senastRuta = -1; k.kortfas = false;
    intro.hidden = false; intro.style.opacity = '';
    k.aktiv = true;
    lyssna(k);
    passa(k); ritaRamar(k); mat(k); matSteg(k);
    satKortfas(k, false);
    const test = opts.test || null;
    if (test && (test.t != null || test.steg)) {                  // frusen bildruta (skärmbilder och test)
      intro.classList.add('frys');
      const frys = test.steg ? TID.slut : Math.max(0, Math.min(+test.t || 0, TID.slut));
      k.frys = frys; k.tl = frys;
      rita(k, frys, frys);
      if (test.steg) { const n = k.stegNr(test.steg); if (n > 0) { k.S.max = n; gaTill(k, n); } }
      requestAnimationFrame(() => requestAnimationFrame(() => intro.classList.remove('frys')));
      if (k.kortfas) D.kort.focus({ preventScroll: true }); else intro.focus({ preventScroll: true });
      return;
    }
    if (lugn()) {                                    // minskade rörelser: ingen reklamstorm, kortet tonar fram direkt
      intro.classList.add('utan-oppning');
      k.tl = TID.slut; rita(k, k.tl, 0);
      for (const el of [D.sloja, D.kort]) { try { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' }); } catch {} }
      D.kort.focus({ preventScroll: true });
      return;
    }
    rita(k, 0, 0);
    intro.focus({ preventScroll: true });
    const steg = (nu) => {
      if (K !== k || k.stanger || !intro.isConnected) return;
      if (!k.forra) { k.forra = nu; k.start = nu; }
      const dt = Math.min(.05, (nu - k.forra) / 1000); k.forra = nu;
      k.tl = Math.min(TID.slut, k.tl + dt * k.fart);
      rita(k, k.tl, (nu - k.start) / 1000);
      if (k.tl >= TID.slut) { if (!lugn()) D.kort.focus({ preventScroll: true }); return; }   // kortet har tagit över
      requestAnimationFrame(steg);
    };
    requestAnimationFrame(steg);
  }
  const spolaFram = (k) => { k.fart = 7; };

  function lyssna(k) {
    const { intro, D } = k;
    const pa = (mal, typ, fn, o) => { mal.addEventListener(typ, fn, o); k.lyss.push(() => mal.removeEventListener(typ, fn, o)); };
    pa(intro, 'click', (e) => {
      if (k.stanger) return;
      if (e.target.closest('.hoppa')) { stang(k); return; }
      if (!k.kortfas && !k.frys) spolaFram(k);
    });
    // Tangenterna: Esc stänger, Enter/mellanslag spolar fram i öppningen, Enter = huvudknappen i kortet.
    // Skriver man någon annanstans (adressfältet) rör introt inte tangenterna.
    pa(document, 'keydown', (e) => {
      if (K !== k || !k.aktiv || k.stanger || intro.hidden) return;
      const mal = e.target, iIntro = intro.contains(mal);
      if (!iIntro && mal && mal !== document.body && (mal.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(mal.tagName))) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stang(k); return; }
      if (!k.kortfas) {
        if ((e.key === 'Enter' || e.key === ' ') && document.activeElement !== D.hoppa && (iIntro || mal === document.body)) { e.preventDefault(); e.stopPropagation(); spolaFram(k); }
        return;
      }
      if (!iIntro) return;
      // Piltangenter i radiogrupperna (webbläsare, ljust/mörkt, färger)
      const grupp = mal.closest && mal.closest('[role="radiogroup"]');
      if (grupp && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const val = [...grupp.querySelectorAll('[role="radio"]:not(:disabled)')], i = val.indexOf(mal);
        if (i < 0) return;
        e.preventDefault();
        const bak = e.key === 'ArrowUp' || e.key === (getComputedStyle(grupp).direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft');
        const n = val[(i + (bak ? -1 : 1) + val.length) % val.length];
        n.focus(); n.click();
        return;
      }
      if (e.key !== 'Enter' || e.isComposing) return;
      const a = document.activeElement, knapp = a && a.closest && a.closest('button');
      if (knapp && !['radio', 'checkbox'].includes(knapp.getAttribute('role')) && knapp !== D.prim) return;
      e.preventDefault(); e.stopPropagation(); D.prim.click();
    }, true);
    pa(window, 'resize', () => {
      cancelAnimationFrame(k.omRitning);
      k.omRitning = requestAnimationFrame(() => {
        if (K !== k || intro.hidden) return;
        passa(k); ritaRamar(k); mat(k); matSteg(k);
        if (k.frys != null) rita(k, k.frys, k.frys); else if (!k.kortfas && !k.stanger) rita(k, k.tl, 0);
      });
    });
    // Temat kan också ändras någon annanstans (ett annat fönster, systemet): följ med
    const a = A();
    if (a) { const av = a.on('tema.', () => { if (K !== k) return; k.S.lage = lageNu(); k.S.accent = accentNu(); tillampaAccent(k); markeraUtseende(k); }); k.lyss.push(av); }
    // Går man någon annanstans (öppnar en sida, inställningarna) stängs introt som överhoppat. Tas det bort (testerna) städas allt.
    const nt = document.getElementById('newtabpage');
    const VYER = ['settings', 'login', 'bookmarks', 'bgpick', 'qr'];
    const mo = new MutationObserver(() => {
      if (K !== k) return;
      if (!intro.isConnected) { avsluta(k, true); return; }
      if (k.stanger || k.opts.test) return;
      const borta = (nt && nt.classList.contains('hidden')) || VYER.some((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
      if (borta) stang(k);
    });
    if (nt) mo.observe(nt, { attributes: true, attributeFilter: ['class'] });
    for (const id of VYER) { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); }
    if (intro.parentNode) mo.observe(intro.parentNode, { childList: true });
    k.lyss.push(() => mo.disconnect());
  }

  function stang(k) {
    if (!k || K !== k || k.stanger || k.intro.hidden) return;
    k.stanger = true;
    try { localStorage.setItem('adraze-intro-v4', '1'); } catch {}
    const { D, intro } = k;
    if (k.kortfas) {                                            // kortet tonar ut, slöjan lättar, startsidan står redan där bakom
      intro.classList.add('stanger');
      setTimeout(() => stangKlar(k), lugn() ? 0 : 380);
      return;
    }
    // Under öppningen: lapparna tonar bort, huvudet dyker ner i klicken, startsidan kommer fram
    const t = k.tl, u0 = performance.now(), fadas = [...k.lappar.map((d) => d.el), D.rakna, D.hoppa, D.kortBak, D.stage, D.panel, D.sloja];
    const op0 = fadas.map((el) => parseFloat(el.style.opacity) || 0);
    const pk0 = t < TID.klick ? 0 : utBak(kl((t - TID.klick) / TID.klickDur), 2.4);
    const hy0 = t < TID.upp ? 200 : 200 * (1 - utBak(kl((t - TID.upp) / TID.uppDur), 1.1));
    const nt0 = D.ntDelar.length ? (parseFloat(D.ntDelar[0].style.opacity) || 0) : 1;
    intro.classList.add('stanger');
    const steg = (nu) => {
      if (K !== k) return;
      const u = (nu - u0) / 1000;
      if (lugn()) {
        const f = Math.max(0, 1 - u / .2);
        fadas.forEach((el, n) => op(el, op0[n] * f)); op(D.kropp, f);
        k.smulor.forEach((c) => { c.el.style.opacity = 0; });
        startsida(k, Math.max(nt0, 1 - f), 0);
      } else {
        const f = Math.max(0, 1 - u / .18);
        fadas.forEach((el, n) => op(el, op0[n] * f));
        k.smulor.forEach((c) => { c.el.style.opacity = 0; });
        const hy = hy0 + (200 - hy0) * inBak(kl(u / .26), 1.2);
        D.huvud.setAttribute('transform', 'translate(0 ' + hy.toFixed(2) + ')');
        const pk = pk0 * (1 - inBak(kl((u - .2) / .24), 2));
        D.klick.setAttribute('transform', 'translate(100 104) scale(' + Math.max(0, pk).toFixed(4) + ') translate(-100 -104)');
        const p3 = utKub(kl((u - .26) / .34));
        startsida(k, Math.max(nt0, p3), 10 * (1 - p3));
      }
      if (u < (lugn() ? .22 : .62) && intro.isConnected) requestAnimationFrame(steg); else stangKlar(k);
    };
    requestAnimationFrame(steg);
  }
  function stangKlar(k) {
    if (K !== k) return;
    avsluta(k, false);
    // Markören hamnar i adressfältet, som i varje ny tom flik (sökrutan på startsidan skulle öppna förslagslistan direkt)
    try { const a = document.getElementById('address'); if (a && !document.getElementById('newtabpage').classList.contains('hidden')) { a.focus({ preventScroll: true }); a.select(); } } catch {}
  }
  // Städar efter en körning: lyssnare, startsidans stil, och säger till shell.js. avbrutet = introt togs bort eller startades om.
  function avsluta(k, avbrutet) {
    if (k.stadat) return;
    k.stadat = true; k.aktiv = false;
    if (K === k) K = null;
    for (const av of k.lyss.splice(0)) { try { av(); } catch {} }
    try { if (k.ro) k.ro.disconnect(); } catch {}
    clearTimeout(k.stryktimer); cancelAnimationFrame(k.omRitning);
    try { if (k.D) aterstallStartsida(k); } catch {}
    if (k.intro.isConnected) {
      k.intro.hidden = true;
      k.intro.classList.remove('kortfas', 'stanger', 'utan-oppning', 'frys');
      k.intro.textContent = '';
      ['--acc-l', '--acc-d', '--acc-ink-l', '--acc-ink-d', '--acc-on-l', '--acc-on-d'].forEach((v) => k.intro.style.removeProperty(v));
    }
    const S = k.S || {};
    try { if (k.opts.klar) k.opts.klar({ avbrutet: !!avbrutet, sett: S.sett || { flytt: false, standard: false }, flikar: avbrutet ? [] : (S.flikar || []) }); } catch (e) { console.warn('[intro]', e); }
  }

  /* För shell.js och testerna */
  window.AdrazeIntro = {
    starta,
    stang: () => { if (K) stang(K); },
    info: () => {
      const k = K; if (!k || !k.S) return { aktiv: false };
      return { aktiv: k.aktiv, kortfas: !!k.kortfas, tl: k.tl, steg: k.S.steg.map((s) => s.id), nu: k.S.steg[k.S.n - 1].id, sett: { ...k.S.sett },
        webblasare: k.S.webblasare.map((w) => ({ id: w.id, namn: w.namn, bm: w.bm, profil: w.profil })), vald: k.S.wb, tamed: { ...k.S.tamed },
        lage: k.S.lage, accent: k.S.accent, flyttat: k.S.flyttat, standard: k.S.standard, jobbar: k.S.jobbar };
    },
  };
})();
