/* Lättviktig i18n för skalet. Översätter "per innehåll": de svenska strängarna ÄR nycklarna.
   Språkfilerna (ui/locales/<lang>.json = { "svensk sträng": "översättning" }) laddas synkront
   via preload (window.locale.load). Byte av språk sparas i localStorage och laddar om fönstret. */
(function () {
  // engångsflytt: gamla nycklar från Vaka-tiden (vaka-*) → adraze-*
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('vaka-')) { const n = 'adraze-' + k.slice(5); if (localStorage.getItem(n) === null) localStorage.setItem(n, localStorage.getItem(k)); localStorage.removeItem(k); } } } catch {}
  const KEY = 'adraze-lang';
  const RTL = new Set(['ar', 'he', 'fa', 'ur']);
  // Språk som visas i väljaren (native namn). Måste ha en genererad fil i ui/locales/ (utom sv).
  const LANGS = [
    ['sv', 'Svenska'], ['en', 'English'], ['no', 'Norsk'], ['nb', 'Norsk bokmål'], ['da', 'Dansk'],
    ['fi', 'Suomi'], ['de', 'Deutsch'], ['nl', 'Nederlands'], ['es', 'Español'], ['pt', 'Português (BR)'],
    ['pt-PT', 'Português (PT)'], ['fr', 'Français'], ['it', 'Italiano'], ['pl', 'Polski'], ['cs', 'Čeština'],
    ['sk', 'Slovenčina'], ['sl', 'Slovenščina'], ['hr', 'Hrvatski'], ['sr', 'Српски'], ['ro', 'Română'],
    ['bg', 'Български'], ['hu', 'Magyar'], ['el', 'Ελληνικά'], ['uk', 'Українська'], ['ru', 'Русский'],
    ['tr', 'Türkçe'], ['ar', 'العربية'], ['he', 'עברית'], ['fa', 'فارسی'], ['ur', 'اردو'],
    ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['ta', 'தமிழ்'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'],
    ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'],
    ['ko', '한국어'], ['sw', 'Kiswahili'], ['af', 'Afrikaans'], ['sq', 'Shqip'], ['mk', 'Македонски'],
    ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['et', 'Eesti'], ['is', 'Íslenska'], ['ga', 'Gaeilge'],
    ['cy', 'Cymraeg'], ['ka', 'ქართული'], ['hy', 'Հայերեն'], ['az', 'Azərbaycan'], ['kk', 'Қазақша'],
  ];

  let cur = 'sv';
  try { cur = localStorage.getItem(KEY) || 'sv'; } catch {}
  let DICT = {};
  if (cur !== 'sv') {
    try { DICT = (window.locale && window.locale.load(cur)) || {}; } catch { DICT = {}; }
  } else {
    // Svenska behöver ingen ordlista, men huvudprocessen ska veta språket (T() i main.js följer det skalet laddat senast)
    try { if (window.locale) window.locale.load('sv'); } catch {}
  }

  // Uppslag: exakt, sedan med blanktecken ihop (radbrytningar och indrag i html-källan), sedan nycklar med {platshållare}
  // ("Aktiv för {n} min sedan" matchar "Aktiv för 5 min sedan"; värdena förs över till översättningen).
  const ATTR = ['placeholder', 'title', 'aria-label', 'data-tip', 'data-tom', 'data-drop', 'data-ftext'];
  let MONSTER = null;
  function monster() {
    if (MONSTER) return MONSTER;
    MONSTER = [];
    for (const k of Object.keys(DICT)) {
      if (k.indexOf('{') < 0) continue;
      const namn = [];
      const delar = k.split(/\{([a-z]\w*)\}/);
      if (delar.length < 3 || delar.filter((d, i) => i % 2 === 0).join('').replace(/[^\p{L}]/gu, '').length < 4) continue;
      const re = delar.map((d, i) => (i % 2 ? (namn.push(d), '(.+?)') : d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
      MONSTER.push([new RegExp('^' + re + '$', 'u'), namn, DICT[k]]);
    }
    return MONSTER;
  }
  function slaUpp(k) {
    let v = DICT[k];
    if (v != null) return v;
    if (/\s\s|[\n\t\u00a0]/.test(k)) { v = DICT[k.replace(/\s+/g, ' ')]; if (v != null) return v; }
    if (!/\d|\S\s\S/.test(k)) return null;
    for (const [re, namn, ut] of monster()) {
      const m = re.exec(k);
      // värdena översätts också om de själva är kända texter ("Ändrat: Accentfärg" → "Changed: Accent color")
      if (m) return namn.reduce((s, n, i) => { const x = m[i + 1]; const xv = DICT[x.trim()]; return s.split('{' + n + '}').join(xv != null ? x.replace(x.trim(), xv) : x); }, ut);
    }
    return null;
  }
  // translate="no" (HTML-standard) = rör inte innehållet, t.ex. chattmeddelanden och användarnamn
  function skip(node) { const el = node.nodeType === 1 ? node : node.parentElement; return !!(el && el.closest && el.closest('[translate="no"]')); }
  function trText(node) {
    if (skip(node)) return;
    const raw = node.nodeValue;
    if (!raw) return;
    const k = raw.trim();
    if (!k) return;
    const v = slaUpp(k);
    if (v != null && v !== k) node.nodeValue = raw.replace(k, v);
  }
  function trAttrs(el) {
    if (!el.getAttribute || skip(el)) return;
    for (const a of ATTR) {
      const val = el.getAttribute(a);
      if (!val) continue;
      const k = val.trim();
      const v = slaUpp(k);
      if (v != null && v !== k) el.setAttribute(a, val.replace(k, v));
    }
  }
  function translateTree(root) {
    if (cur === 'sv' || !root) return;
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1) return;
    trAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(trText);
    if (root.querySelectorAll) root.querySelectorAll(ATTR.map((a) => '[' + a + ']').join(',')).forEach(trAttrs);
  }

  function apply() {
    try {
      document.documentElement.lang = cur;
      document.documentElement.dir = RTL.has(cur) ? 'rtl' : 'ltr';
    } catch {}
    if (cur !== 'sv') { translateTree(document.body); try { const v = slaUpp(document.title.trim()); if (v) document.title = v; } catch {} }
  }

  // t('svensk text') → översättningen. Med värden: t('Ändrat: {x}', { x: namn }) – platshållarna fylls i efter
  // översättningen, så att ordföljden kan skilja sig mellan språken. Bygg aldrig ihop meningar med +.
  function fyll(s, varden) {
    if (!varden) return s;
    return s.replace(/\{([a-z]\w*)\}/g, (m, n) => (Object.prototype.hasOwnProperty.call(varden, n) && varden[n] != null ? String(varden[n]) : m));
  }
  // Utan värden provas också nycklar med platshållare, så att text som huvudprocessen byggt på svenska (t.ex. en sparad
  // etikett "Tog bort YouTube" från nyckeln "Tog bort {x}") översätts när den visas.
  window.t = function (sv, varden) {
    if (cur === 'sv') return fyll(sv, varden);
    let v = DICT[sv];
    if (v == null && !varden && typeof sv === 'string') v = slaUpp(sv.trim());
    return fyll(v == null ? sv : v, varden);
  };
  window.i18nFyll = fyll;
  window.i18n = {
    get lang() { return cur; },
    langs: LANGS,
    set(lang) { try { localStorage.setItem(KEY, lang); } catch {} location.reload(); },
    apply, translateTree,
  };

  function boot() {
    apply();
    if (cur === 'sv') return;               // svenska = originalet, ingen observer behövs
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes) m.addedNodes.forEach((node) => translateTree(node));
        if (m.type === 'attributes' && m.target && m.target.nodeType === 1) trAttrs(m.target);
      }
    });
    try { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATTR }); } catch {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
