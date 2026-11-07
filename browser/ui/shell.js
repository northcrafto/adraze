'use strict';
/* AdRaze – skalets logik. Webbsidorna renderas av huvudprocessen
 * (WebContentsView); här styr vi flikar, adressfält, granskning och varning. */

const $ = (id) => document.getElementById(id);
const viewsEl = $('views');
const newtabpage = $('newtabpage');
const incogpage = $('incogpage');
const addressInput = $('address');
const shieldEl = $('shield');

let tabs = [];
let active = null;
let seq = 0;
let _greetCache = { key: null, text: '' };   // deklareras tidigt – greet() anropas under init (TDZ-fix)
const byId = (id) => tabs.find((t) => t.id === id);

// Inkognitofönster: alla dess flikar körs som inkognito och skalet får det mörka temat.
const windowIncognito = new URLSearchParams(location.search).has('incognito');
if (windowIncognito) document.body.classList.add('incog');
document.body.classList.add('plat-' + ((window.view && window.view.platform) || 'linux'));
/* Fönsterknapparna (Windows/Linux-overlay) följer flikradens färg: ljust, mörkt eller inkognito. */
/* Egna fönsterknappar (Windows/Linux). Dubbelklick på tom flikrad maximerar, som i alla webbläsare. */
(function () {
  const v = window.view || {};
  const b = (id) => document.getElementById(id);
  if (b('wc-min')) b('wc-min').addEventListener('click', () => v.winMinimize && v.winMinimize());
  if (b('wc-max')) b('wc-max').addEventListener('click', () => v.winToggleMax && v.winToggleMax());
  if (b('wc-close')) b('wc-close').addEventListener('click', () => v.winClose && v.winClose());
  const strip = b('tabstrip');
  if (strip) strip.addEventListener('dblclick', (e) => { if (e.target === strip || e.target.classList.contains('flex-1')) v.winToggleMax && v.winToggleMax(); });
  if (v.onWinMaximized) v.onWinMaximized((max) => {
    const ic = b('wc-max-ic'); if (!ic) return;
    ic.innerHTML = max ? '<rect x="5.5" y="2.5" width="8" height="8" rx="1"/><path d="M2.5 5.5v8h8"/>' : '<rect x="3.5" y="3.5" width="9" height="9" rx="1"/>';
    if (b('wc-max')) b('wc-max').title = max ? 'Återställ' : 'Maximera';
  });
})();
function updateTitlebar() {
  try {
    const incog = document.body.classList.contains('incog');
    const dark = document.documentElement.dataset.theme === 'dark';
    const c = incog ? { color: '#0b0618', symbolColor: '#cbbde6' } : dark ? { color: '#0c0c0d', symbolColor: '#d4d4d8' } : { color: '#e7edf4', symbolColor: '#0e2a47' };
    if (window.view && window.view.setTitlebar) window.view.setTitlebar(c);
  } catch {}
}

/* ── URL-hjälp ── */
const ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  adraze: { label: 'AdRaze Search', url: 'https://search.adraze.app/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  startpage: { label: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
};
/* Inkognito söker alltid via AdRaze Search (vår egen motor, loggar inget). */
const INCOG_ENGINE = { label: 'AdRaze Search', url: 'https://search.adraze.app/search?q=' };
let searchEngine = 'google';   // standard = Google; AdRaze Search går att välja (och används alltid i inkognito)
try { const e = localStorage.getItem('skoll-engine'); if (e && ENGINES[e]) searchEngine = e; } catch {}
function searchUrl(q) {
  // Anpassa: snabbord ("yt katter") och egen standardsökmotor, se ui/anpassa-sokmotorer.js. null = som förut (alltid i barnläge).
  const egen = window.AnpassaSok ? window.AnpassaSok.url(q, !!(active && active.incognito)) : null; if (egen) return egen;
  // Vanligt: vald sökmotor. Inkognito: alltid AdRaze Search (ingen logg).
  if (active && active.incognito) return INCOG_ENGINE.url + encodeURIComponent(q);
  return (ENGINES[searchEngine] || ENGINES.google).url + encodeURIComponent(q);
}
// Sökmotorns namn i adressfältet. Anpassa: en egen standardsökmotor (ui/anpassa-sokmotorer.js) går före den inbyggda.
function motorEtikett() { return (window.AnpassaSok && window.AnpassaSok.etikett(false)) || (ENGINES[searchEngine] || ENGINES.adraze).label; }
function normalizeUrl(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  // file: släpps ALDRIG in i en flik: lokala filer delar ursprung (file://) med skalet och kom då åt skalets
  // localStorage (inloggningstoken, historik) och kakvalvet på disken. Texten blir en sökning i stället.
  if (/^(https?|about|adraze):/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return searchUrl(s);   // file://, ftp:// m.fl. → sökning
  if (/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(s) && !s.includes(' ')) return 'https://' + s;
  return searchUrl(s);
}
function pretty(url) {
  if (/^adraze:/i.test(url || '')) return url.replace(/\/$/, '');
  try { const u = new URL(url); return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '') + u.search; }
  catch { return url; }
}

/* ── Innehållsytans mått → huvudprocessen ── */
function sendBounds() {
  const r = viewsEl.getBoundingClientRect();
  window.view.bounds({ x: r.x, y: r.y, width: r.width, height: r.height });
  try { if (typeof window.anpSidopanelMatt === 'function') window.anpSidopanelMatt(); } catch {}   // Anpassa: sidopanel – appens vy flyttar med webbytan (flikpanelen, verktygsraden längst ner)
}
window.addEventListener('resize', sendBounds);
window.view.onWindowResized(sendBounds);

/* ── Snabb lokal fara-koll (omedelbar) ── */
function instantDanger(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const list = ['farlig.exempel.se', 'bank-verifiering.se', 'testsafebrowsing.appspot.com'];
    return list.some((d) => h === d || h.endsWith('.' + d)) || /phish|malware|bluff|scam/i.test(h);
  } catch { return false; }
}
const localDanger = () => ({ status: 'danger', title: 'Den här sidan ser farlig ut', reasons: [
  'AdRaze känner igen den här som en bluff-/phishingsida.',
  'Sidor som denna försöker lura dig att lämna lösenord, BankID eller kortuppgifter.'] });

/* ── Flikar ── */
function createTab(url, incognito) {
  if (incognito === undefined) incognito = windowIncognito;  // inkognitofönster → alla flikar inkognito
  const tab = { id: ++seq, url: null, title: incognito ? 'Inkognito' : 'Ny flik', favicon: null, cleared: new Set(), bypassed: new Set(), canBack: false, canForward: false, verdict: null, warning: null, toastDismissed: new Set(), entering: true, incognito: !!incognito, overlay: null };
  if (incognito) window.view.markIncognito(tab.id);
  // Anpassa (flikar): ny flik sist eller bredvid den aktiva, se ui/anpassa-flikar.js (-1 = sist, som förut)
  const plats = window.AnpFlikar ? AnpFlikar.nyPlats(tab) : -1;
  if (plats >= 0) tabs.splice(plats, 0, tab); else tabs.push(tab);
  switchTab(tab);
  setTimeout(() => { tab.entering = false; }, 280);
  if (url) guardedNavigate(tab, url);
  // Ny tom flik: markören står redan i adressfältet, så man kan skriva direkt
  // utan att först klicka i rutan (Cetto 2026-09-04). Bara tomma flikar; en
  // flik som öppnas med en adress ska visa sidan, inte stjäla fokus.
  else setTimeout(() => { try { const a = $('address'); if (a && active === tab) { a.focus(); a.select(); } } catch {} }, 40);
  saveOpenTabs();
  return tab;
}
// ── Öppna flikar sparas så de kommer tillbaka nästa gång browsern öppnas ──
const OPEN_TABS_KEY = 'skoll-open-tabs';
function saveOpenTabs() {
  if (windowIncognito) return;
  try {
    const keep = tabs.filter((t) => !t.incognito && !t._closing && t.url);
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(keep.map((t) => t.url)));
    localStorage.setItem('adraze-pinned-tabs', JSON.stringify(keep.filter((t) => t.pinned).map((t) => t.url)));
    localStorage.setItem('adraze-active-tab', String(keep.indexOf(active)));   // -1 = startsidan var öppen
    if (window.AnpFlikar) AnpFlikar.sparat(keep);   // Anpassa (flikar): flikarnas grupper sparas bredvid adresserna
  } catch {}
  try { if (window.arbetsytorSparat) window.arbetsytorSparat(); } catch {}   // Anpassa › Arbetsytor sparar samtidigt (ui/anpassa-arbetsytor.js)
}
// Vid start: 'tidigare' (förra flikarna + startsidan), 'ny' (bara en ny flik) eller 'sida' (en viss adress)
let startMode = 'tidigare', startUrl = '';
try { const m = localStorage.getItem('adraze-start'); if (m === 'ny' || m === 'sida') startMode = m; startUrl = localStorage.getItem('adraze-start-url') || ''; } catch {}
function startAddress(v) { v = (v || '').trim(); if (!v) return ''; if (/^[a-z]+:\/\//i.test(v)) return v; return (/^(localhost|\d+\.\d+\.\d+\.\d+)(:|\/|$)/i.test(v) ? 'http://' : 'https://') + v; }
function restoreTabs() {
  if (windowIncognito) { createTab(null); return; }
  if (startMode !== 'tidigare') {
    let pins = []; try { pins = JSON.parse(localStorage.getItem('adraze-pinned-tabs') || '[]'); } catch {}
    for (const u of pins) if (typeof u === 'string' && u) setPinned(createTab(u), true);   // fästa flikar följer alltid med
    if (startMode === 'sida' && startAddress(startUrl)) { createTab(startAddress(startUrl)); return; }
    createTab(null); return;
  }
  let urls = [];
  try { urls = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) || '[]'); } catch {}
  urls = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && u);
  let pins = []; try { pins = JSON.parse(localStorage.getItem('adraze-pinned-tabs') || '[]'); } catch {}
  let ai = -1; try { ai = parseInt(localStorage.getItem('adraze-active-tab') || '-1', 10); } catch {}   // läs innan createTab skriver över
  const back = [];
  for (let i = 0; i < urls.length; i++) { const t = createTab(urls[i]); back.push(t); if (pins.includes(urls[i])) setPinned(t, true); }
  // Landa på fliken man var på när AdRaze stängdes (eller startsidan om det var den / inga flikar fanns)
  switchTab(back[ai] || createTab(null));
  saveOpenTabs();
}
// Full-sides-rutor (inställningar m.m.) hör till fliken de öppnades på.
const OVERLAY_IDS = ['settings', 'login', 'bookmarks', 'bgpick', 'qr'];
function hideOverlayElements() { OVERLAY_IDS.forEach((id) => { const el = $(id); if (el) el.classList.add('hidden'); }); }
function showActiveTab() {
  hideInfobar();
  if (active && active.url) {
    // Spärrad sida (barnkonto, eller låst barnläge) visas aldrig – inte ens en som laddades innan spärren kom
    if (typeof famBlocked === 'function' && famBlocked(active.url)) { showBlockScreen(active.url); return; }
    newtabpage.classList.add('hidden'); incogpage.classList.add('hidden');
    window.view.show(active.id);
    if (protectionOn && active.warning && active.warning.url === active.url && !active.toastDismissed.has(active.warning.url)) {
      showInfobar(active.warning.res, active, active.url);
    }
  } else {
    window.view.hide();
    if (active && active.incognito) { newtabpage.classList.add('hidden'); incogpage.classList.remove('hidden'); }
    else { incogpage.classList.add('hidden'); newtabpage.classList.remove('hidden'); greet(); try { tabBg(active); } catch {} }
  }
}
// Siffran gäller fliken du tittar på (som Brave). Startsidan och inställningarna: ingen siffra.
function visaFlikRaknare() {
  const el = $('adcount'); if (!el) return;
  el.textContent = active && active.url ? String(active.blocked || 0) : '';
}
function switchTab(tab) {
  active = tab;
  document.body.classList.toggle('incog', !!tab.incognito);
  updateTitlebar();
  $('search-engine').textContent = tab.incognito ? INCOG_ENGINE.label : motorEtikett();
  addressInput.value = tab.url ? pretty(tab.url) : '';
  setShield(tab.url ? (protectionOn ? (tab.verdict ? tab.verdict.status : 'ok') : 'off') : 'home');
  hideOverlayElements();
  hideDanger();
  if (tab.overlay) { window.view.hide(); const el = $(tab.overlay); if (el) el.classList.remove('hidden'); }
  else showActiveTab();
  renderTabs(); updateNavButtons(); updateStar();
  try { updateReaderBtn(); } catch {}
  try { updatePipBtn(); updateFalkGranskar(); } catch {}
  try { permSwitched(); } catch {}
  try { applyTabPanel(tab); } catch {}
  try { visaFlikRaknare(); } catch {}
  saveOpenTabs();
}
function closeTab(tab) {
  if (!tab || tab._closing) return;
  if (tabs.indexOf(tab) < 0) return;
  const el = $('tabs').querySelector('[data-tabid="' + tab.id + '"]');
  if (!el) { finalizeClose(tab); return; }   // ingen DOM-flik → stäng direkt
  // Stängt med musen över flikraden → lås bredden så nästa kryss hamnar under muspekaren
  if ($('tabs').matches(':hover') && tabWidthLock == null) tabWidthLock = currentTabW;
  tab._closing = true;
  el.classList.remove('entering');
  el.classList.add('closing');               // mjuk utgång (krymper + tonar bort)
  layoutTabs();
  setTimeout(() => finalizeClose(tab), 200);
}
// Senast stängda flikar (Ctrl+Shift+T öppnar dem igen, senaste först)
const closedTabs = [];
function finalizeClose(tab) {
  const i = tabs.indexOf(tab); if (i < 0) return;
  if (tab.url && !tab.incognito && !tab.isSettings) { closedTabs.push({ url: tab.url, index: i, pinned: !!tab.pinned }); if (closedTabs.length > 25) closedTabs.shift(); }
  window.view.destroy(tab.id);
  tabs.splice(i, 1);
  saveOpenTabs();
  if (!tabs.length) {   // sista fliken stängd → stäng browsern (Anpassa → flikar kan välja en ny flik i stället)
    if (window.AnpFlikar && AnpFlikar.sistaStangd()) return;
    window.view.doClose(); return;
  }
  if (active === tab) switchTab(tabs[Math.max(0, i - 1)]); else renderTabs();
}
// Somliga sajter (t.ex. GitHub) skickar en VIT mörklägeslogga som blir osynlig på den ljusa flik-raden.
// Mät favicon-ljushet och lägg en subtil mörk platta bakom nästan-vita loggor så de syns.
const favLight = {};
function detectFavLight(url) {
  if (!url || url in favLight) return;
  favLight[url] = 'pending';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 20) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; } }
      favLight[url] = n > 0 && (sum / n) > 225;   // nästan vit → behöver mörk platta
    } catch { favLight[url] = false; }             // CORS-spärrad → kan ej mäta, lämna som är
    try { renderTabs(); } catch {}
  };
  img.onerror = () => { favLight[url] = false; };
  img.src = url;
}
// Flikens logga (favicon) ska ALLTID synas: sidans egen favicon → DuckDuckGos favicon-
// tjänst (hittar nästan alla) → glob som absolut sista utväg. Aldrig tom slot.
function favHtml(tab) {
  if (tab.incognito) return '<span class="fav"><svg class="ic" style="width:15px;height:15px"><use href="#i-incognito" /></svg></span>';
  if (tab.isSettings) return '<span class="fav"><svg class="ic" style="width:15px;height:15px"><use href="#i-settings" /></svg></span>';
  if (!tab.url) return '<span class="fav"><img src="adraze-mark.png" alt=""></span>';
  let origin = ''; try { origin = new URL(tab.url).origin; } catch {}
  const real = origin ? origin + '/favicon.ico' : '';
  const src = tab.favicon || real;
  if (!src) return '<span class="fav"><svg class="ic" style="width:15px;height:15px"><use href="#i-fav" /></svg></span>';
  const fb = (real && real !== src) ? escapeHtml(real) : '';
  const cls = favLight[tab.favicon] === true ? ' on-dark' : '';
  return '<span class="fav' + cls + '"><img src="' + escapeHtml(src) + '" data-fb="' + fb + '" data-glob="tab" alt=""></span>';
}
// Favicon som inte laddar → glob. Inline-onerror blockeras av CSP (script-src 'self'),
// så felet fångas här i capture-fasen (error-händelser bubblar inte).
const GLOB = {
  tab: '<svg class="ic" style="width:15px;height:15px"><use href="#i-fav" /></svg>',
  sm: '<svg class="ic ic-sm"><use href="#i-fav"/></svg>',
  hist: '<span class="hist-fav" style="display:grid;place-items:center;color:#8ba3bf"><svg class="ic" style="width:13px;height:13px"><use href="#i-fav" /></svg></span>',
  bm: '<span class="bmglobe"><svg class="ic"><use href="#i-fav" /></svg></span>',
};
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.glob) return;
  const fb = img.dataset.fb;
  if (fb) { img.dataset.fb = ''; img.src = fb; return; }
  img.outerHTML = GLOB[img.dataset.glob] || GLOB.sm;
}, true);
// Flikbredd: delar raden lika, max TAB_MAX, aldrig under TAB_MIN (då scrollar raden i stället).
var TAB_MAX = 240, TAB_MIN = 44, TAB_GAP = 4, TAB_NARROW = 84;
var tabWidthLock = null, currentTabW = 240;
function tabRoom() {
  const strip = $('tabstrip'); const cs = getComputedStyle(strip);
  let used = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 48;   // 48 px kvar att dra fönstret i
  for (const id of ['brandbar', 'newtab-btn', 'winctl']) { const e = $(id); if (e && e.offsetWidth) used += e.offsetWidth + 6; }
  return Math.max(TAB_MIN, strip.clientWidth - used);
}
const PIN_W = 40;
function layoutTabs() {
  // Anpassa (flikar): true = flikarna ligger på sidan (egen layout); annars plats för grupprubriker och hopfällda grupper
  const anp = window.AnpFlikar ? AnpFlikar.layout() : null;
  if (anp === true) return;
  const host = $('tabs');
  const pinned = tabs.filter((t) => !t._closing && t.pinned).length;
  const n = Math.max(1, tabs.filter((t) => !t._closing && !t.pinned).length - (anp ? anp.dolda : 0));
  const room = tabRoom() - pinned * (PIN_W + TAB_GAP);
  let w = tabWidthLock != null ? tabWidthLock : Math.floor((room - (anp ? anp.px : 0) - TAB_GAP * (n - 1)) / n);
  w = Math.max(TAB_MIN, Math.min(TAB_MAX, w));
  currentTabW = w;
  host.style.setProperty('--tab-w', w + 'px');
  // Fästa flikar ligger också i raden: räkna in dem, annars scrollar raden (och den fästa fliken hamnar utanför) fast allt får plats
  host.style.maxWidth = (room + pinned * (PIN_W + TAB_GAP)) + 'px';
  host.classList.toggle('narrow', w < TAB_NARROW);
}
function renderTabs() {
  const host = $('tabs');
  const old = new Map([...host.children].map((el) => [el.dataset.tabid || 'g:' + el.dataset.grupp, el]));   // Anpassa: grupprubriker har data-grupp
  let prev = null;
  tabs.forEach((tab) => {
    // Anpassa (flikar): gruppens rubrik före gruppens första flik (ui/anpassa-flikar.js)
    const rub = window.AnpFlikar ? AnpFlikar.rubrik(tab) : null;
    if (rub) { old.delete('g:' + rub.dataset.grupp); const w = prev ? prev.nextSibling : host.firstChild; if (w !== rub) host.insertBefore(rub, w); prev = rub; }
    if (tab.favicon) detectFavLight(tab.favicon);
    let el = old.get(String(tab.id));
    const fresh = !el;
    if (fresh) {
      el = document.createElement('div');
      el.dataset.tabid = tab.id;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tclose')) { e.stopPropagation(); closeTab(tab); }
        else if (e.target.closest('.tsound')) { e.stopPropagation(); setMuted(tab, !tab.muted); }
        else switchTab(tab);
      });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab); } });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(tab); });
    }
    old.delete(String(tab.id));
    const cls = 'tab' + (tab === active ? ' active' : '') + (tab.incognito ? ' incognito' : '') + (tab._closing ? ' closing' : '') + (tab.pinned ? ' pinned' : '')
      + (window.AnpFlikar ? AnpFlikar.klass(tab) : '');   // Anpassa: gruppfärg, hopfälld grupp, sovande flik
    if (el.className.replace(' entering', '') !== cls) el.className = cls + (el.classList.contains('entering') ? ' entering' : '');
    // Bygg om innehållet bara när det ändrats (annars blinkar favicons)
    // Ljudikon när fliken spelar ljud eller är tystad; klick växlar ljud av/på
    const snd = (tab.audible || tab.muted) ? `<button class="tsound${tab.muted ? ' muted' : ''}" title="${tab.muted ? 'Slå på ljudet' : 'Stäng av ljudet'}"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/>${tab.muted ? '<path d="m23 9-6 6M17 9l6 6"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'}</svg></button>` : '';
    const html = `${favHtml(tab)}<span class="ttl">${escapeHtml(tab.title || 'Ny flik')}</span>${snd}<button class="tclose" title="Stäng flik"><svg class="ic" style="width:13px;height:13px"><use href="#i-close" /></svg></button>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.title = tab.title || '';
    const want = prev ? prev.nextSibling : host.firstChild;
    if (want !== el) host.insertBefore(el, want);
    if (fresh && tab.entering) {
      el.classList.add('entering');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
    }
    prev = el;
  });
  old.forEach((el) => el.remove());
  if (tabs.some((t) => t.entering)) tabWidthLock = null;
  layoutTabs();
  if (window.AnpFlikar) AnpFlikar.ritat();   // Anpassa (flikar): aktiv flik synlig i panelen, fästa flikar till huvudprocessen
  // Efter bredd-animationen: se till att den aktiva fliken syns när raden scrollar
  clearTimeout(renderTabs._t);
  renderTabs._t = setTimeout(() => {
    const a = active && host.querySelector('[data-tabid="' + active.id + '"]');
    if (a && host.scrollWidth > host.clientWidth) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, 240);
}
$('tabs').addEventListener('mouseleave', () => { if (tabWidthLock != null) { tabWidthLock = null; layoutTabs(); } });
$('tabs').addEventListener('wheel', (e) => { const h = $('tabs'); if (h.scrollWidth > h.clientWidth) { h.scrollLeft += e.deltaY || e.deltaX; e.preventDefault(); } }, { passive: false });
window.addEventListener('resize', () => layoutTabs());
function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── Navigering ── */
function guardedNavigate(tab, raw, opts = {}) {
  const url = normalizeUrl(raw); if (!url) return;
  hideDanger();
  if (typeof famBlocked === 'function' && famBlocked(url)) { if (tab === active) { addressInput.value = pretty(tab.url || ''); } if (typeof showBlockScreen === 'function') showBlockScreen(url); return; }
  if (protectionOn && !opts.bypass && instantDanger(url)) { tab.verdict = localDanger(); showDanger(tab, url, tab.verdict); return; }
  if (opts.bypass) { tab.bypassed.add(url); tab.cleared.add(url); }
  loadInTab(tab, url);
}
function loadInTab(tab, url) {
  tab.url = url;
  tab.warning = null;
  if (tab === active) { newtabpage.classList.add('hidden'); incogpage.classList.add('hidden'); hideInfobar(); addressInput.value = pretty(url); setShield(protectionOn ? 'checking' : 'off'); }
  window.view.load(tab.id, url);
}
function backgroundCheck(tab, url) {
  if (/^adraze:/i.test(url || '')) { if (tab === active) setShield('ok'); return; }   // webbläsarens egna sidor
  if (!protectionOn) { if (tab === active) setShield('off'); return; }
  if (tab.incognito) { if (tab === active) setShield(instantDanger(url) ? 'danger' : 'ok'); return; }   // inkognito: inget lämnar datorn
  if (tab.cleared.has(url) || tab.bypassed.has(url)) { if (tab === active) setShield(tab.verdict ? tab.verdict.status : 'ok'); return; }
  tab.cleared.add(url);
  if (tab === active) setShield('checking');
  window.skoll.checkUrl(url).then((res) => {
    const v = res && res.verdict; if (!v) return; tab.verdict = v;
    if (v.status === 'danger' && tab.url === url && !tab.bypassed.has(url)) {
      window.view.stop(tab.id);
      if (tab === active) { window.view.hide(); setShield('danger'); }
      showDanger(tab, url, v);
    } else if (tab === active) setShield(v.status);
  }).catch(() => { if (tab === active) setShield('unknown'); });
}

/* ── Händelser från huvudprocessen ── */
window.view.onLinkNavigate((id, url) => { const t = byId(id); if (t) guardedNavigate(t, url); });
window.view.onDidNavigate((id, url, b, f) => {
  const t = byId(id); if (!t) return;
  t.url = url; t.canBack = b; t.canForward = f;
  saveOpenTabs();
  if (t === active) visaFlikRaknare();
  if (t.warning && t.warning.url !== url) { t.warning = null; if (t === active) hideInfobar(); }
  if (t === active) { addressInput.value = pretty(url); updateNavButtons(); updateStar(); }
  // Korsdomän-navigeringar sker numera nativt (så POST bevaras) – därför görs de snabba kollarna här i stället.
  if (typeof famBlocked === 'function' && famBlocked(url)) { try { window.view.stop(t.id); } catch {} if (typeof showBlockScreen === 'function') showBlockScreen(url); return; }
  if (protectionOn && !t.bypassed.has(url) && instantDanger(url)) { try { window.view.stop(t.id); } catch {} t.verdict = localDanger(); if (t === active) { window.view.hide(); setShield('danger'); } showDanger(t, url, t.verdict); return; }
  backgroundCheck(t, url);
});
window.view.onTitle((id, title) => {
  const t = byId(id); if (!t) return;
  t.title = title; renderTabs();
  if (t.url && !t.incognito) pushHistory(t.url, title, t.favicon);
  // Barnkonto i en inkognitoflik som var öppen sedan tidigare: föräldern ska ändå se besöket (ingen lokal historik)
  else if (t.url && account && account.isChild && account.token && /^https?:/i.test(t.url)) { try { window.family.historyAdd(account.token, t.url, title || ''); } catch {} }
});
window.view.onFavicon((id, fav) => { const t = byId(id); if (t) { t.favicon = fav; renderTabs(); } });
// Ladda om ⇄ stoppa: byt SVG-ikonen (förr ersattes ikonen med tecknen ✕/⟳ i textform, som såg annorlunda ut än övriga knappar)
window.view.onLoading((id, loading) => {
  const t = byId(id); if (!t || t !== active) return;
  const b = $('reload'); b.dataset.loading = loading ? '1' : '';
  b.innerHTML = `<svg class="ic"><use href="#${loading ? 'i-close' : 'i-reload'}" /></svg>`;
});
window.view.onOpenNewTab((url) => createTab(url));
// Inställningar → Om: policy och chattregler på sajten (på användarens språk om det finns)
{ const sajt = (sida) => { const l = (document.documentElement.lang || 'sv').slice(0, 2); return 'https://adraze.app' + (l === 'sv' ? '' : '/' + l) + '/' + sida; };
  const pp = document.getElementById('privacy-policy-btn'), cr = document.getElementById('chat-rules-btn');
  if (pp) pp.addEventListener('click', () => { createTab(sajt('integritet-webblasaren')); try { closeSettings(); } catch {} });
  if (cr) cr.addEventListener('click', () => { createTab(sajt('chattregler')); try { closeSettings(); } catch {} }); }
window.view.onNewIncognito(() => {
  if (famLocked() || (account && account.isChild)) { try { showToast('Inkognito finns inte i barnläge.'); } catch {} return; }
  createTab(null, true);
});
// Huvudprocessen stoppade en spärrad sida (länk, omdirigering, popup) innan den nådde sajten
window.view.onBarnSparrad((id, url) => { const t = byId(id); if (t && t === active && typeof showBlockScreen === 'function') showBlockScreen(url); });

/* ── Bekräfta stängning med flera flikar (flytande Brave-lik notis) ──
 * Skalet avgör om notisen behövs (det vet flik-antalet); main visar den i ett eget
 * litet fönster ovanför sidan så inget gråas ut. */
let skipCloseConfirm = false;
try { skipCloseConfirm = localStorage.getItem('skoll-skip-close-confirm') === '1'; } catch {}
window.view.onConfirmClose(() => {
  if (tabs.length <= 1 || skipCloseConfirm) { window.view.doClose(); return; }  // en flik / valt bort → stäng direkt
  showCloseConfirm(tabs.length);
});
function showCloseConfirm(n) {
  const box = $('closeconf');
  if (!box) { window.view.doClose(); return; }
  // Hela meningen är nyckeln, med {n} som platshållare. Saknar översättningen
  // platshållaren (maskinöversättning kan tappa den) används svenskan.
  { let tpl = (typeof window.t === 'function') ? window.t('Du har {n} flikar öppna i webbläsarfönstret.') : 'Du har {n} flikar öppna i webbläsarfönstret.';
    if (tpl.indexOf('{n}') < 0) tpl = 'Du har {n} flikar öppna i webbläsarfönstret.';
    $('cc-msg').innerHTML = escapeHtml(tpl).replace('{n}', '<b>' + n + '</b>'); }
  $('cc-again').checked = false;
  window.view.hide();                 // webbvyn ligger ovanpå skalet → dölj den så rutan syns
  box.classList.remove('hidden');
  $('cc-yes').focus();
}
function hideCloseConfirm() {
  const box = $('closeconf'); if (box) box.classList.add('hidden');
  showActiveTab();                    // återställ sidan
}
$('cc-cancel').addEventListener('click', hideCloseConfirm);
$('cc-yes').addEventListener('click', () => {
  if ($('cc-again').checked) { try { localStorage.setItem('skoll-skip-close-confirm', '1'); } catch {} skipCloseConfirm = true; }
  window.view.doClose();
});
document.addEventListener('keydown', (e) => {
  const box = $('closeconf'); if (!box || box.classList.contains('hidden')) return;
  if (e.key === 'Escape') { e.preventDefault(); hideCloseConfirm(); }
  else if (e.key === 'Enter') { e.preventDefault(); $('cc-yes').click(); }
});
window.view.onPersistSkipClose(() => {
  try { localStorage.setItem('skoll-skip-close-confirm', '1'); } catch {}
  skipCloseConfirm = true;
});
window.view.onOpenTabRaw((rawUrl) => {
  const t = createTab(null);
  t.bypassed.add(rawUrl); t.cleared.add(rawUrl);
  loadInTab(t, rawUrl);
});
window.view.onShowQR((url, dataUrl) => {
  $('qr-img').src = dataUrl;
  $('qr-url').textContent = url;
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  $('qr-host').textContent = host;
  $('qr-fav').src = (active && active.favicon) || 'adraze-mark-dark.png';
  $('qr-copy').textContent = tn('Kopiera länk');
  hideInfobar();
  window.view.hide();
  hideOverlayElements();
  if (active) active.overlay = 'qr';
  $('qr').classList.remove('hidden');
});

/* ── Innehållsvarning (liten notis över sidan) ── */
const infobar = $('infobar');
let infobarState = null;
function showInfobar(res, tab, url) {
  const danger = res.level === 'danger';
  infobar.style.background = danger ? 'linear-gradient(90deg,#c0433d,#a5352f)' : 'linear-gradient(90deg,#cf9128,#a97c22)';
  $('infobar-ico').style.background = 'rgba(255,255,255,.22)';
  $('infobar-ico').innerHTML = `<svg class="ic ic-sm"><use href="#${danger ? 'i-shield-x' : 'i-shield-alert'}" /></svg>`;
  $('infobar-text').textContent = (res.flags && res.flags[0]) || 'Den här sidan ser farlig ut.';
  infobar.style.display = 'flex';
  infobarState = { tab, url };
  window.view.insetTop(56);
}
function hideInfobar() {
  if (infobar.style.display === 'none') return;
  infobar.style.display = 'none';
  infobarState = null;
  window.view.insetTop(0);
}
window.view.onContentWarning((id, url, res) => {
  if (!protectionOn) return;
  const t = byId(id); if (!t || t.toastDismissed.has(url)) return;
  t.warning = { url, res };
  if (t === active && t.url === url) showInfobar(res, t, url);
});
$('infobar-leave').addEventListener('click', () => {
  const st = infobarState; hideInfobar();
  if (!st) return;
  st.tab.warning = null;
  if (st.tab.canBack) { window.view.back(st.tab.id); window.view.show(st.tab.id); }
  else { st.tab.url = null; switchTab(st.tab); }
});
$('infobar-stay').addEventListener('click', () => {
  const st = infobarState;
  if (st) { st.tab.toastDismissed.add(st.url); st.tab.warning = null; }
  hideInfobar();
});

/* ── Varningsskärm ── */
let pending = null;
function showDanger(tab, url, verdict) {
  if (verdict.status !== 'warn' && url && !countedDangers.has(url)) { countedDangers.add(url); bumpStat('dangers', 1); }  // räkna en gång per farlig sida
  if (tab === active) window.view.hide();
  $('danger-title').textContent = verdict.title || 'Den här sidan ser farlig ut';
  $('danger-target').textContent = url;
  // Bara en anledning: den första (den viktigaste) – eller underrubriken om inga skäl finns
  $('danger-reason').textContent = (verdict.reasons && verdict.reasons[0]) || verdict.sub || tw('Sidan liknar sidor som lurar folk eller sprider skadlig kod.');
  pending = { tab, url };
  if (tab === active) { $('danger').classList.remove('hidden'); setShield('danger'); }
}
function hideDanger() { $('danger').classList.add('hidden'); }
$('danger-proceed').addEventListener('click', () => {
  if (!pending) return; const { tab, url } = pending; hideDanger();
  if (pending.httpHost) { window.view.allowHttp(pending.httpHost); guardedNavigate(tab, url, { bypass: true }); return; }
  Promise.resolve(window.view.adrazeOpenAnyway(url)).catch(() => {}).then(() => guardedNavigate(tab, url, { bypass: true }));
});
// AdRaze-blockeraren stoppade en sida från sin lista över bedrägerier/skadlig kod
window.view.onAdrazeDanger((id, url) => {
  const t = byId(id); if (!t || t.bypassed.has(url)) return;
  t.url = url;
  if (t === active) addressInput.value = pretty(url);
  t.verdict = { status: 'danger', title: 'AdRaze stoppade den här sidan', reasons: [
    'Adressen finns på AdRazes listor över bedrägerier, nätfiske och skadlig kod.',
    'Sidan laddades aldrig, så inget hann hända.'] };
  showDanger(t, url, t.verdict);
});
$('danger-back').addEventListener('click', () => {
  hideDanger();
  if (active && active.canBack) { window.view.back(active.id); window.view.show(active.id); }
  else if (active) { active.url = null; switchTab(active); }
});

/* ── Sköld ── */
function setShield(status) {
  const icon = { home: 'i-shield', ok: 'i-shield-check', checking: 'i-shield-search', warn: 'i-shield-alert', danger: 'i-shield-x', unknown: 'i-shield', off: 'i-shield-off' }[status] || 'i-shield';
  shieldEl.className = 'shield-wrap shield-' + status;
  shieldEl.innerHTML = `<svg class="ic ic-sm"><use href="#${icon}" /></svg>`;
}

/* ── Verktygsrad ── */
/* autocomplete kopplas längre ner (attachAutocomplete) */
$('back').addEventListener('click', () => { if (active) window.view.back(active.id); });
$('forward').addEventListener('click', () => { if (active) window.view.forward(active.id); });
function doReload() {
  // Är någon overlay öppen (inställningar/login/bokmärken...) eller står vi på startsidan (ingen webb-URL)?
  const anyOverlay = OVERLAY_IDS.some((id) => { const el = $(id); return el && !el.classList.contains('hidden'); });
  const onWebPage = active && active.url && !anyOverlay;
  if (onWebPage) {
    if ($('reload').dataset.loading === '1') window.view.stop(active.id); else window.view.reload(active.id);
    return;
  }
  // Startsida eller inställningar → ladda om HELA skalet så allt (barn, konto, startsida) läses in på nytt.
  try { location.reload(); } catch {}
}
$('reload').addEventListener('click', doReload);
window.addEventListener('keydown', (e) => { if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) { e.preventDefault(); doReload(); } });
$('newtab-btn').addEventListener('click', () => createTab(null));
function updateNavButtons() {
  $('back').disabled = !(active && active.canBack);
  $('forward').disabled = !(active && active.canForward);
}

/* ── Adblock ── */
async function initAdblock() {
  const st = await window.skoll.adblockState();
  visaFlikRaknare();
  $('adblock').classList.toggle('off', !st.on);
  $('adcount').hidden = st.raknare === false;
  window.skoll.onAdblockTab && window.skoll.onAdblockTab((id, n) => { const t = byId(id); if (t) { t.blocked = n; if (t === active) visaFlikRaknare(); } });
  // Ändrat i adraze://adblock: räknaren på falken av/på, blockeraren av/på
  window.skoll.onBlockinst((v) => {
    if ('raknare' in v) $('adcount').hidden = v.raknare === false;
    if ('pa' in v) { $('adblock').classList.toggle('off', !v.pa); $('tgl-adblock').checked = !!v.pa; }
  });
}

/* ── Skyddsstatistik på startsidan (kumulativt, sparat lokalt) ── */
let stats = { ads: 0, trackers: 0, dangers: 0 };
try { const s = JSON.parse(localStorage.getItem('skoll-stats')); if (s) stats = { ads: s.ads | 0, trackers: s.trackers | 0, dangers: s.dangers | 0 }; } catch {}
const countedDangers = new Set();
function renderStats() {
  const f = (n) => (n || 0).toLocaleString('sv-SE');
  // Uppskattning som Braves: ~30 kB och ~50 ms sparas per stoppad annons/spårare.
  const n = (stats.ads || 0) + (stats.trackers || 0);
  const mb = (n * 30) / 1024, sek = n * 0.05;
  const [bv, bu] = mb >= 1024 ? [(mb / 1024).toLocaleString('sv-SE', { maximumFractionDigits: 1 }), 'GB'] : [f(Math.round(mb)), 'MB'];
  const [tv, tu] = sek >= 3600 ? [(sek / 3600).toLocaleString('sv-SE', { maximumFractionDigits: 1 }), (window.t ? window.t('timmar') : 'timmar')] : sek >= 60 ? [f(Math.round(sek / 60)), (window.t ? window.t('minuter') : 'minuter')] : [f(Math.round(sek)), (window.t ? window.t('sekunder') : 'sekunder')];
  if ($('stat-blocked')) $('stat-blocked').textContent = f(n);
  if ($('stat-band')) { $('stat-band').textContent = bv; $('stat-band-u').textContent = bu; }
  if ($('stat-time')) { $('stat-time').textContent = tv; $('stat-time-u').textContent = tu; }
}
function bumpStat(key, n) {
  stats[key] = (stats[key] || 0) + (n || 1);
  try { localStorage.setItem('skoll-stats', JSON.stringify(stats)); } catch {}
  renderStats();
}
window.skoll.onAdblockHit((type) => { const k = { ad: 'ads', tracker: 'trackers', danger: 'dangers' }[type]; if (k) bumpStat(k, 1); });
renderStats();
$('adblock').addEventListener('click', () => setAdblock($('adblock').classList.contains('off')));

/* ── Falk (kräver inloggning + Pro) ── */
let kryptoOpen = false;
// Falk finns för alla inloggade vuxna: gratis med liten kvot (servern håller koll), Pro med stor. Barnkonton har inte Falk än.
function kryptoMode() { return account ? (account.pro || !account.isChild ? 'pro' : 'nopro') : 'signedout'; }
let pendingKryptoAfterLogin = false;
// Falk och chatten visas en i taget. Öppnar du den ena göms den andra och kommer tillbaka när du stänger.
var parkedKrypto = false, parkedChatt = false;
function openKrypto(open, parking) {
  if (open && !account) { pendingKryptoAfterLogin = true; openLogin(); return; }
  if (open) { parkedKrypto = false; if (chattOpen) { parkedChatt = true; chattOpen = false; chattSync(); } }
  kryptoOpen = open;
  window.view.kryptoToggle(open, kryptoMode(), account ? account.token : null);
  $('krypto-btn').classList.toggle('off', !open);
  if (!open && !parking && parkedChatt) { parkedChatt = false; if (account) { chattOpen = true; chattSync(); } }
  rememberPanel();
}
$('krypto-btn').addEventListener('click', () => openKrypto(!kryptoOpen));
async function refreshPro() {
  if (!account || !account.token) return;
  try {
    const r = await window.auth.session(account.token);
    if (r && r.ok) { account.pro = !!r.pro; if (r.name) account.name = r.name; sparaKontoLokalt(); try { window.auth.remember(account); } catch {} sparaProfil(); }
    // Ett NÄTVERKSFEL (unreachable) kan vara en tillfällig hicka → behåll kontot tyst, logga ALDRIG ut på det.
    // Men om servern UTTRYCKLIGEN svarar no_session är token död på riktigt → be om ny inloggning EN gång
    // (behåll lokal data/inställningar). Annars fastnar man som "inloggad" med en token som inte duger.
    else if (r && r.error === 'no_session' && !account.isChild && !window.__reauthPrompted) {
      window.__reauthPrompted = true;
      showToast('Din inloggning har gått ut — logga in igen.');
      try { openLogin(); } catch {}
    }
  } catch {}
  if (pendingKryptoAfterLogin) { pendingKryptoAfterLogin = false; openKrypto(true); return; }
  if (kryptoOpen) openKrypto(true); // ladda om panelen med rätt läge
}
// Knappar inifrån Pro-väggen (krypto-lock.html)
window.view.onOpenLogin(() => openLogin());
window.view.onKryptoRecheck(async () => {
  if (!account) { openLogin(); return; }
  await refreshPro();
  if (account && !account.pro) showToast('Ingen aktiv Pro hittades på ditt konto ännu.');
});

/* ── Inställningar (realtidsskydd + annonsblockerare, på som standard) ── */
let protectionOn = true;
try { if (localStorage.getItem('skoll-protection') === 'off') protectionOn = false; } catch {}
function setProtection(on) {
  protectionOn = on;
  try { localStorage.setItem('skoll-protection', on ? 'on' : 'off'); } catch {}
  $('tgl-protection').checked = on;
  if (active && active.url) setShield(on ? (active.verdict ? active.verdict.status : 'ok') : 'off');
}
async function setAdblock(on) {
  await window.skoll.adblockToggle(on);
  $('adblock').classList.toggle('off', !on);
  $('tgl-adblock').checked = on;
}
let settingsTab = null;
function openSettings() {
  // Inställningar som EGEN flik (kugghjuls-favicon + titel "Inställningar")
  if (!settingsTab || tabs.indexOf(settingsTab) < 0) {
    settingsTab = createTab(null);
    settingsTab.isSettings = true;
    settingsTab.title = 'Inställningar';
  } else if (active !== settingsTab) {
    switchTab(settingsTab);
  }
  window.view.hide(); hideInfobar();
  $('tgl-protection').checked = protectionOn;
  $('tgl-adblock').checked = !$('adblock').classList.contains('off');
  $('seg-fav').classList.toggle('on', topSitesMode === 'favorites');
  $('seg-freq').classList.toggle('on', topSitesMode === 'frequent');
  $('tgl-krypto').checked = $('krypto-btn').style.display !== 'none';
  $('tgl-motion').checked = reduceMotion;
  renderEngines(); renderLangs(); applyZoomSeg(); refreshDefaultBrowser();
  showSettingsCat(account ? 'konto' : 'utseende');
  hideOverlayElements();
  settingsTab.overlay = 'settings';
  renderSetHero();
  const sv = $('settings');
  sv.classList.remove('hidden');
  // Öppningsanimationen körs om från början varje gång: klassen tas bort,
  // layouten tvingas räknas om, klassen sätts igen.
  sv.classList.remove('opening'); void sv.offsetWidth; sv.classList.add('opening');
  clearTimeout(sv._openT); sv._openT = setTimeout(() => sv.classList.remove('opening'), 1400);
  renderTabs();
}
/* Profilhuvudet överst i inställningarna: bild, namn, mejl och plan.
   Utloggad visas AdRazes märke och en inloggningsknapp. */
function renderSetHero() {
  const av = $('set-hero-avatar'), nm = $('set-hero-name'), em = $('set-hero-email'), side = $('set-hero-side');
  if (!av) return;
  if (!account) {
    av.innerHTML = '<img class="set-hero-mark" src="adraze-mark.png" alt="">'; av.classList.remove('has-img');
    nm.textContent = 'AdRaze'; em.textContent = 'Inte inloggad';
    side.innerHTML = '<button class="set-btn liq" id="set-hero-login">Logga in</button>';
    const b = $('set-hero-login'); if (b) b.addEventListener('click', () => { closeSettings(); openLogin(); });
    return;
  }
  const name = account.name || (account.isChild ? 'Barnkonto' : (account.email ? account.email.split('@')[0] : 'Du'));
  const pic = (socMe && socMe.avatar) ? socMe.avatar : null;
  av.innerHTML = pic ? '<img src="' + pic + '" alt="">' : escapeHtml((name[0] || '?').toUpperCase());
  nm.textContent = name;
  em.textContent = account.isChild ? 'Familjens regler gäller' : (account.email || '');
  side.innerHTML = account.isChild ? '<span class="set-chip">Barnkonto</span>' : '';
  av.classList.toggle('has-img', !!pic);
}
function closeSettings() {
  $('settings').classList.add('hidden');
  const st = settingsTab;
  if (st && tabs.indexOf(st) >= 0) {
    settingsTab = null; st.overlay = null;
    if (tabs.length > 1) closeTab(st);                                   // stäng inställnings-fliken → växla till granne
    else { st.isSettings = false; st.title = 'Ny flik'; switchTab(st); } // enda fliken → gör om till hemflik (stäng ej browsern)
  } else {
    if (active) active.overlay = null;
    showActiveTab();
  }
}
function showSettingsCat(cat) {
  if (cat === 'uppdatering' || cat === 'om') refreshUpdatePanel(false);
  if ($('clear-box')) $('clear-box').hidden = true;
  if (cat === 'integritet' || cat === 'nedladdningar' || cat === 'utseende' || cat === 'start') refreshWebbPanel();
  document.querySelectorAll('#settings-nav .set-tab').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
  document.querySelectorAll('#settings .set-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.cat !== cat));
  if (cat === 'anpassa') { try { document.dispatchEvent(new CustomEvent('anpassa:visa')); } catch {} }   // varje område ritar om sin del
  if (cat === 'wallet' && typeof renderWallet === 'function') renderWallet();
  if (cat === 'konto' && typeof renderKonto === 'function') renderKonto();
  if (cat === 'vanner' && typeof renderFriends === 'function') renderFriends();
  if (cat === 'familj' && typeof renderFam === 'function') { renderFam(); applyKidIndicator(); if (typeof famSyncParent === 'function') famSyncParent(); }
  if (cat === 'losenord') { if (typeof renderPasswords === 'function') renderPasswords(); if (typeof initImport === 'function') initImport(); }
  if (cat === 'tillagg' && typeof renderExt === 'function') renderExt();
  if (cat === 'historik' && typeof renderHistPanel === 'function') { histFilter = ''; const s = $('hist-search'); if (s) s.value = ''; renderHistPanel(); }
  if (cat === 'nedladdningar' && typeof loadDownloads === 'function') loadDownloads();
}
function renderEngines() {
  const list = $('engine-list'); if (!list) return; list.innerHTML = '';
  Object.keys(ENGINES).forEach((k) => {
    const el = document.createElement('div'); el.className = 'engine-opt' + (searchEngine === k ? ' on' : '');
    el.innerHTML = `<span class="engine-radio"></span><span>${ENGINES[k].label}</span>`;
    el.addEventListener('click', () => {
      searchEngine = k; try { localStorage.setItem('skoll-engine', k); } catch {}
      if (active && !active.incognito) $('search-engine').textContent = ENGINES[k].label;
      renderEngines();
    });
    list.appendChild(el);
  });
  if (window.AnpassaSok) window.AnpassaSok.motorlista(list);   // Anpassa: egna sökmotorer under de inbyggda
}
$('settings-btn').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', closeSettings);
document.querySelectorAll('#settings-nav .set-tab').forEach((b) => b.addEventListener('click', () => showSettingsCat(b.dataset.cat)));
/* Sök i inställningar: visar flikarna vars namn eller rader (rubrik/beskrivning) innehåller ordet.
   Träff i en rad → fliken öppnas så man ser den. Gruppetiketter döljs när hela gruppen är borta. */
$('set-search').addEventListener('input', () => {
  const ord = $('set-search').value.trim().toLowerCase();
  let forsta = null, nagon = false;
  document.querySelectorAll('#settings-nav .set-tab').forEach((b) => {
    if (b.style.display === 'none' && !b.dataset.sokDold) return;   // utloggad-spärrad flik rörs inte
    const panel = document.querySelector('#settings .set-panel[data-cat="' + b.dataset.cat + '"]');
    const text = (b.textContent + ' ' + (panel ? [...panel.querySelectorAll('.set-h, .set-title, .set-desc')].map((e) => e.textContent).join(' ') : '')).toLowerCase();
    const traff = !ord || text.includes(ord);
    b.dataset.sokDold = traff ? '' : '1';
    b.classList.toggle('sok-dold', !traff);
    if (traff) { nagon = true; if (!forsta) forsta = b; }
  });
  document.querySelectorAll('#settings-nav .set-glbl').forEach((g) => {
    let n = g.nextElementSibling, syns = false;
    while (n && n.classList.contains('set-tab')) { if (!n.classList.contains('sok-dold') && n.style.display !== 'none') syns = true; n = n.nextElementSibling; }
    g.classList.toggle('sok-dold', !syns);
  });
  $('set-search-none').hidden = nagon;
  if (ord && forsta && !document.querySelector('#settings-nav .set-tab.on:not(.sok-dold)')) showSettingsCat(forsta.dataset.cat);
});
$('set-search').addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('set-search').value) { e.stopPropagation(); $('set-search').value = ''; $('set-search').dispatchEvent(new Event('input')); } });
$('tgl-protection').addEventListener('change', (e) => setProtection(e.target.checked));
$('tgl-adblock').addEventListener('change', (e) => setAdblock(e.target.checked));
$('adblock-more').addEventListener('click', () => { closeSettings(); createTab('adraze://adblock'); });
/* Falk-kategori */
$('open-krypto-btn').addEventListener('click', () => {
  closeSettings();
  openKrypto(true);
});
$('tgl-krypto').addEventListener('change', (e) => {
  $('krypto-btn').style.display = e.target.checked ? '' : 'none';
  try { localStorage.setItem('skoll-krypto-btn', e.target.checked ? '1' : '0'); } catch {}
});
/* Språk */
function renderLangs() {
  const list = $('lang-list'); if (!list || !window.i18n) return; list.innerHTML = '';
  const cur = window.i18n.lang;
  window.i18n.langs.forEach(([code, label]) => {
    const el = document.createElement('div'); el.className = 'engine-opt' + (cur === code ? ' on' : '');
    el.setAttribute('dir', 'auto');
    el.innerHTML = `<span class="engine-radio"></span><span>${label}</span>`;
    el.addEventListener('click', () => { if (code !== window.i18n.lang) window.i18n.set(code); });
    list.appendChild(el);
  });
}
/* Tillgänglighet: sidzoom + minska rörelse */
let defaultZoom = 100;
try { const z = parseInt(localStorage.getItem('skoll-zoom'), 10); if (z) defaultZoom = z; } catch {}
function applyZoomSeg() { [90, 100, 110, 125].forEach((z) => $('zoom-' + z).classList.toggle('on', z === defaultZoom)); }
[90, 100, 110, 125].forEach((z) => $('zoom-' + z).addEventListener('click', () => {
  defaultZoom = z; try { localStorage.setItem('skoll-zoom', String(z)); } catch {}
  window.view.defaultZoom(z / 100); applyZoomSeg();
}));
let reduceMotion = false;
try { reduceMotion = localStorage.getItem('skoll-motion') === '1'; } catch {}
document.body.classList.toggle('reduce-motion', reduceMotion);
$('tgl-motion').addEventListener('change', (e) => {
  reduceMotion = e.target.checked;
  document.body.classList.toggle('reduce-motion', reduceMotion);
  try { localStorage.setItem('skoll-motion', reduceMotion ? '1' : '0'); } catch {}
});

/* ── Tema (ljust/mörkt) ── */
let theme = 'light';
try { const t = localStorage.getItem('skoll-theme'); if (t === 'dark' || t === 'light') theme = t; } catch {}
document.documentElement.dataset.theme = theme;
function setTheme(t) {
  theme = t === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('skoll-theme', theme); } catch {}
  try { window.view.chattTheme(theme); } catch {}
  updateTitlebar();
  const l = $('seg-light'), d = $('seg-dark');
  if (l) l.classList.toggle('on', theme === 'light');
  if (d) d.classList.toggle('on', theme === 'dark');
}
// Anpassa-krok (tema): knapparna och importen väljer läge i tema.lage, som ui/anpassa-tema.js tillämpar i alla
// fönster (även "Följ systemet"). setTheme ovan tillämpar bara ett färdigt ljust/mörkt i det här fönstret.
function valjTema(t) { if (window.AnpassaTema) window.AnpassaTema.valjLage(t === 'dark' ? 'morkt' : 'ljust'); else setTheme(t); }
if ($('seg-light')) $('seg-light').addEventListener('click', () => valjTema('light'));
if ($('seg-dark')) $('seg-dark').addEventListener('click', () => valjTema('dark'));
setTheme(theme);

/* ── Falk-agent: låt AI:n ändra inställningar via naturligt språk ── */
function kryptoOnOff(v) { v = ('' + (v || '')).toLowerCase().trim(); return !/(^av$|off|nej|stäng|stang|inaktiv|false|^0$|\bav\b)/.test(v); }
function matchEngine(v) {
  v = ('' + (v || '')).toLowerCase();
  if (/adraze/.test(v)) return 'adraze';
  if (/duck|ddg/.test(v)) return 'duckduckgo';
  if (/brave/.test(v)) return 'brave';
  if (/startpage|start ?page/.test(v)) return 'startpage';
  if (/google/.test(v)) return 'google';
  return ENGINES[v] ? v : null;
}
function setEngine(k) {
  if (!ENGINES[k]) return false;
  searchEngine = k; try { localStorage.setItem('skoll-engine', k); } catch {}
  if (window.AnpassaSok) window.AnpassaSok.inbyggd();   // Anpassa: en egen standardsökmotor slutar gälla
  if (active && !active.incognito) $('search-engine').textContent = ENGINES[k].label;
  try { renderEngines(); } catch {}
  return true;
}
function setReduceMotion(on) {
  reduceMotion = on; document.body.classList.toggle('reduce-motion', on);
  try { localStorage.setItem('skoll-motion', on ? '1' : '0'); } catch {}
  const t = $('tgl-motion'); if (t) t.checked = on;
}
function applyKryptoSetting(a) {
  if (!a || !a.name) return;
  const name = ('' + a.name).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o');
  const val = a.value; let msg = '';
  if (name === 'adblock' || name === 'annonsblockerare') { const on = kryptoOnOff(val); setAdblock(on); msg = 'AdRaze ' + (on ? 'på' : 'av'); }
  else if (name === 'realtidsskydd' || name === 'skydd') { const on = kryptoOnOff(val); setProtection(on); msg = 'Realtidsskydd ' + (on ? 'på' : 'av'); }
  else if (name === 'minska_rorelse' || name === 'reduce_motion' || name === 'rorelse') { const on = kryptoOnOff(val); setReduceMotion(on); msg = 'Minska rörelse ' + (on ? 'på' : 'av'); }
  else if (name === 'sokmotor' || name === 'sok') { const k = matchEngine(val); if (k && setEngine(k)) msg = 'Sökmotor: ' + ENGINES[k].label; }
  else if (name === 'nedladdningar' || name === 'downloads') { try { openDownloads(); } catch {} msg = 'Visar nedladdningar'; }
  else if (name === 'blockera' || name === 'blocka') {
    const parts = ('' + val).split('|'); const child = (parts[0] || '').trim();
    const hosts = (parts[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const n = (typeof window.famBlockFor === 'function') ? window.famBlockFor(child, hosts) : 0;
    if (n) msg = 'Blockerade ' + n + ' sida' + (n > 1 ? 'r' : '') + (child ? ' för ' + child : '');
  }
  else if (name === 'tillat' || name === 'avblockera' || name === 'unblock') {
    const parts = ('' + val).split('|'); const child = (parts[0] || '').trim();
    const hosts = (parts[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const minutes = parseInt(parts[2], 10);
    (async () => {
      if (typeof famSyncParent === 'function') await famSyncParent();
      if (minutes && minutes > 0) { for (const h of hosts) { if (typeof famAllowFor === 'function') await famAllowFor(child, h, minutes); } if (typeof showToast === 'function') showToast('Tillät ' + (hosts[0] || '') + ' i ' + minutes + ' min' + (child ? ' för ' + child : '')); }
      else { const n = (typeof window.famUnblockFor === 'function') ? window.famUnblockFor(child, hosts) : 0; if (n && typeof showToast === 'function') showToast('Tillät ' + n + ' sida' + (n > 1 ? 'r' : '') + (child ? ' för ' + child : '')); }
    })();
  }
  if (msg && typeof showToast === 'function') showToast('' + msg);
}
window.view.onKryptoSet(applyKryptoSetting);
try { if (localStorage.getItem('skoll-krypto-btn') === '0') $('krypto-btn').style.display = 'none'; } catch {}
window.view.defaultZoom(defaultZoom / 100);
/* Standardwebbläsare: visa läget och låt användaren sätta AdRaze som standard. */
async function refreshDefaultBrowser() {
  try {
    const st = await window.defaultBrowser.state();
    const btn = $('defbrowser-btn'), desc = $('defbrowser-desc');
    if (st && st.default) {
      btn.textContent = 'Standard'; btn.disabled = true; btn.style.opacity = '.55';
      desc.textContent = 'AdRaze är din standardwebbläsare — länkar öppnas här.';
    } else {
      btn.textContent = 'Sätt som standard'; btn.disabled = false; btn.style.opacity = '';
      desc.textContent = 'Öppna länkar från andra program i AdRaze.';
    }
  } catch {}
}
$('defbrowser-btn').addEventListener('click', async () => {
  const r = await window.defaultBrowser.set();
  if (r && r.ok) showToast('AdRaze är nu din standardwebbläsare');
  else if (r && r.manual) showToast('Välj AdRaze i systeminställningarna som öppnades.');
  else showToast('Kunde inte sätta AdRaze som standard.');
  refreshDefaultBrowser();
});
$('settings-reset').addEventListener('click', () => {
  try { ['skoll-bg', 'skoll-topsites', 'skoll-engine'].forEach((k) => localStorage.removeItem(k)); } catch {}
  setProtection(true); setAdblock(true);
  searchEngine = 'google'; topSitesMode = 'favorites';
  if (window.AnpassaSok) window.AnpassaSok.inbyggd();   // Anpassa: en egen standardsökmotor slutar gälla
  applyStoredBg(); applyTopSitesMode(); renderEngines();
  if (active && !active.incognito) $('search-engine').textContent = 'Google';
});

/* ── Inloggning med mejl + engångskod ── */
let account = null;   // { email, token, pro }
// Deklareras HÄR (före updateAccountBtn() vid uppstart) – låg den längre ner kastade
// let-TDZ "Cannot access 'socMe' before initialization" för inloggade → vit skärm, inga flikar.
let socMe = null;   // { avatar } från AdRaze-kontot
let chattOpen = false, chattUnread = 0, pendingChattAfterLogin = false;   // chattpanelen (chattSync körs via updateAccountBtn redan vid start)
try { account = JSON.parse(localStorage.getItem('skoll-account')); } catch {}
/* Eget konto i varje fönster (standard, Inställningar → Konto): fönstrets konto kommer från huvudprocessen
 * (samma som fönstret det öppnades från) och sparas i fönstrets sessionStorage. localStorage = senast använda. */
let PER_FONSTER = false;
try {
  const r = window.kontoLage && window.kontoLage.fonster();
  if (r && r.perFonster) {
    PER_FONSTER = true;
    let a = null; try { a = JSON.parse(sessionStorage.getItem('adraze-fonster-konto')); } catch {}
    if (!a || !a.token) {
      const key = r.key || null;
      const lokal = account;
      const nyckel = (x) => x ? 'k:' + (x.email || x.childId || x.name || x.token || 'user') : null;
      a = key ? (r.account ? { ...r.account } : (lokal && nyckel(lokal) === key ? lokal : null)) : null;
    }
    account = a;
  }
} catch {}
function sparaKontoLokalt() {
  try { localStorage.setItem('skoll-account', JSON.stringify(account)); } catch {}
  if (PER_FONSTER) { try { sessionStorage.setItem('adraze-fonster-konto', JSON.stringify(account)); } catch {} }
}
function glomKontoLokalt() {
  if (PER_FONSTER) { try { sessionStorage.setItem('adraze-fonster-konto', 'null'); } catch {} return; }   // de andra fönstren behåller sina konton
  try { localStorage.removeItem('skoll-account'); } catch {}
}
if (account && !account.token) account = null;  // gammalt kontonummer-format → nollställ
/* ── Familj + barnläge: deklareras HÄR, före restoreTabs() längre ner (förr låg `let fam` efter den, och
 * en barnflik som återställdes vid start kastade TDZ-fel i famBlocked). ── */
const FAM_KEY = 'adraze-family';
// AdRazes egen webbproxy öppnar vilken sajt som helst inuti sig → alltid spärrad för barnkonton.
// Används av famBlocked, som körs redan när flikarna återställs vid start (restoreTabs) – därför HÄR uppe.
// Låg de längre ner kastade de TDZ-fel när ett barn var aktiverat, skalet stannade halvvägs och ingen sida gick att öppna.
const FAM_ALLTID = ['proxy.adraze.app'];
// Låst barnläge: bara inloggningen (AdRaze-kontot och Googles inloggning dit) – exakta värdar
const famLasOk = (h) => h === 'accounts.adraze.app' || h === 'accounts.youtube.com' || /^accounts\.google\.[a-z.]+$/.test(h);
function famLoad() { try { const f = JSON.parse(localStorage.getItem(FAM_KEY)); if (f && Array.isArray(f.children)) return f; } catch {} return { children: [], activeChild: null }; }
function famSave() { try { localStorage.setItem(FAM_KEY, JSON.stringify(fam)); } catch {} famSkickaTillMain(); }
let fam = famLoad();
// Barnets egen familjepost (self) hör bara till ett inloggat barnkonto. Ligger den kvar på ett vuxenkonto
// (barnet loggades ut i ett annat fönster) blev vuxnen spärrad som barnet – städa bort den.
function famStadaBarnpost() { try { if (account && !account.isChild && fam.children.some((c) => c.self)) { fam = { children: [], activeChild: null }; localStorage.setItem(FAM_KEY, JSON.stringify(fam)); } } catch {} }
famStadaBarnpost();
/* Barnläge på enheten: har ett barnkonto loggat in här gäller förälderns regler tills en VUXEN loggar in.
 * Loggas barnet ut (själv, av föräldern på distans, eller sessionen går ut) blir webbläsaren LÅST – inga
 * webbsidor, bara inloggningen. Förr föll den tillbaka till helt ospärrat läge utan insyn. */
const BARNLAGE_KEY = 'adraze-barnlage';
function barnlageSatt() { try { return localStorage.getItem(BARNLAGE_KEY) === '1'; } catch { return false; } }
function satBarnlage(pa) { try { if (pa) localStorage.setItem(BARNLAGE_KEY, '1'); else localStorage.removeItem(BARNLAGE_KEY); } catch {} }
function famLocked() { return barnlageSatt() && !(account && (account.isChild || PER_FONSTER)); }
// Normalisering av värdnamn på ETT ställe: gemener, utan avslutande punkt ("blocked.test.") och utan www.
const famNorm = (s) => String(s || '').trim().toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
// Reglerna gäller även i huvudprocessen (iframes, popupar, alla fönster) – skicka dem dit vid varje ändring
function famSkickaTillMain() {
  try {
    if (!window.view || !window.view.barnRegler) return;
    if (famLocked()) { window.view.barnRegler({ last: true, blocklist: [], allows: [] }); return; }
    // Barnkonto, eller ett barn som föräldern valt "Aktivera här" för: barnets spärrar gäller på enheten
    const c = fam && fam.activeChild ? fam.children.find((x) => x.id === fam.activeChild) : null;
    if ((account && account.isChild) || c) {
      window.view.barnRegler({ last: false, blocklist: (c && c.blocklist) || [], allows: (c && c.allows) || [] });
      return;
    }
    window.view.barnRegler(null);
  } catch {}
}
if (account && account.isChild) satBarnlage(true);   // barn som redan var inloggat före uppdateringen
famSkickaTillMain();
// Inget inkognito i barnläge (ingen insyn för föräldern): ett inkognitofönster stänger sig direkt
if (windowIncognito && (famLocked() || (account && account.isChild))) { try { window.close(); } catch {} }
let pendingEmail = null;
let pendingLogin = null;   // (kvar, oanvänt)
let pendingSubmit = null;  // { type:'login'|'signup', email, password, name } för 2FA-koden + "skicka ny kod"
let pendingResetEmail = null;  // glömt-lösenord-flödet
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
// Familj + Vänner/chatt kräver inloggning: dölj flikarna helt när man är utloggad.
function applyAuthGates() {
  const gated = ['familj', 'vanner'];
  gated.forEach((c) => { const t = document.querySelector('#settings-nav .set-tab[data-cat="' + c + '"]'); if (t) t.style.display = account ? '' : 'none'; });
  const on = document.querySelector('#settings-nav .set-tab.on');
  const cat = on && on.dataset.cat;
  if (!account && cat && gated.indexOf(cat) >= 0) { if (typeof showSettingsCat === 'function') showSettingsCat('utseende'); return; }
  if (cat && typeof showSettingsCat === 'function') showSettingsCat(cat);   // omrendera aktiv flik (konto/vänner uppdateras vid login)
}
function updateAccountBtn() {
  const btn = $('account-btn');
  btn.classList.toggle('on', !!account);
  // Profilbild i kontoknappen om man har en — annars ikonkuben (i-user) vi redan har.
  const av = (account && socMe && socMe.avatar) ? socMe.avatar : null;
  if (av) { btn.innerHTML = '<img src="' + av + '" alt="" class="acct-av">'; btn.classList.add('has-av'); }
  else { btn.innerHTML = '<svg class="ic"><use href="#i-user" /></svg>'; btn.classList.remove('has-av'); }
  greet(); if (typeof applyAuthGates === 'function') applyAuthGates();
  if (typeof chattSync === 'function') chattSync();   // nytt konto / utloggad → chattpanelen rivs (inget kvar i minnet)
  // Kontobyte utan omstart: historiken är per konto → flytta ev. gammal global historik och rita om startsida + historikpanel
  try { migrateHistoryToAccount(); } catch {}
  try { if (typeof renderShortcuts === 'function' && $('shortcuts')) renderShortcuts(); } catch {}
  try { if (typeof historyOpen !== 'undefined' && historyOpen) renderHistory(); } catch {}
}
function setLoginView(name) {
  const map = { profiles: 'login-profiles', login: 'login-form', pw: 'login-pw-view', signup: 'login-signup', signuppw: 'login-signup-pw', code: 'login-code', reset: 'login-reset', resetconfirm: 'login-reset-confirm', resetpw: 'login-reset-pw', account: 'login-account-view', child: 'login-child' };
  for (const k in map) { const el = $(map[k]); if (el) el.style.display = (k === name) ? 'block' : 'none'; }
}
function openLogin() {
  window.view.hide(); hideInfobar();
  if (account) {
    setLoginView('account');
    $('login-email-shown').textContent = (account.name ? account.name + ' · ' : '') + (account.email || '');
    $('login-pro-badge').style.display = account.pro ? 'inline-flex' : 'none';
  } else {
    $('login-email').value = ''; $('login-pw').value = ''; $('login-error').style.display = 'none'; $('start-error').style.display = 'none';
    if (profilLista.length) visaProfiler();
    else { setLoginView('login'); setTimeout(() => $('login-email').focus(), 30); }
    // listan kan ha ändrats (annat fönster, borttagen profil) → hämta och rita om
    hamtaProfiler().then((l) => {
      const pv = $('login-profiles'), lv = $('login-form');
      if (account || $('login').classList.contains('hidden')) return;
      if (l.length && lv && lv.style.display === 'block' && !$('login-email').value) visaProfiler();
      else if (pv && pv.style.display === 'block') { if (l.length) ritaProfiler(); else { setLoginView('login'); visaTillbakaTillProfiler(); } }
    });
  }
  hideOverlayElements();
  if (active) active.overlay = 'login';
  $('login').classList.remove('hidden');
}
function closeLogin() {
  if (active) active.overlay = null;
  $('login').classList.add('hidden');
  showActiveTab();
}
/* ── Profiler (som Netflix) ──
 * Varje konto som loggat in på enheten blir en profil (token krypterad i huvudprocessen).
 * "Logga ut" visar profilväljaren: välj en profil och fortsätt direkt, eller lägg till ett konto.
 * Barnläge: en vuxenprofil kräver lösenordet, annars kunde barnet bara klicka sig förbi spärrarna. */
let profilLista = [];
let profilHantera = false;
async function hamtaProfiler() { try { const l = await window.auth.profiler(); profilLista = Array.isArray(l) ? l : []; } catch { profilLista = []; } return profilLista; }
function sparaProfil() {
  if (!account || !account.token) return;
  const av = account.isChild ? null : (socMe ? (socMe.avatar || null) : undefined);   // undefined = behåll sparad bild
  try { window.auth.sparaProfil(accountKey(account), account, av).then(() => hamtaProfiler()); } catch {}
}
const PROFIL_FARGER = ['#3d5a80', '#c8553d', '#2a9d8f', '#8e5ad6', '#d08c1c', '#4f772d', '#b23a6b', '#33658a'];
function profilFarg(key) { let h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PROFIL_FARGER[h % PROFIL_FARGER.length]; }
function visaTillbakaTillProfiler() { const b = $('to-profiles'); if (b) b.style.display = (!account && profilLista.length) ? 'block' : 'none'; }
function ritaProfiler() {
  const wrap = $('lg-profiler'); if (!wrap) return;
  wrap.classList.toggle('hantera', profilHantera);
  $('prof-rubrik').textContent = profilHantera ? 'Hantera profiler' : 'Vem surfar?';
  $('prof-lead').textContent = profilHantera ? 'Klicka på en profil för att ta bort den från den här datorn.' : 'Välj en profil för att fortsätta.';
  $('prof-hantera').textContent = profilHantera ? 'Klar' : 'Hantera profiler';
  wrap.innerHTML = '';
  for (const p of profilLista) {
    const nm = p.name || (p.email ? p.email.split('@')[0] : (p.isChild ? 'Barn' : 'Profil'));
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lg-pf'; b.title = p.email || nm;
    const bild = document.createElement('span'); bild.className = 'lg-pf-bild'; bild.style.setProperty('--pf', profilFarg(p.key));
    if (p.avatar && /^(data:image\/|https:)/.test(p.avatar)) { const im = document.createElement('img'); im.src = p.avatar; im.alt = ''; bild.appendChild(im); }
    else bild.textContent = (nm[0] || '?').toUpperCase();
    const x = document.createElement('span'); x.className = 'lg-pf-x'; x.textContent = 'Ta bort'; bild.appendChild(x);
    const n = document.createElement('span'); n.className = 'lg-pf-namn'; n.textContent = nm;
    const ty = document.createElement('span'); ty.className = 'lg-pf-typ'; ty.textContent = p.isChild ? 'Barnkonto' : (p.email || 'Vuxenkonto');
    b.append(bild, n, ty);
    b.addEventListener('click', () => valjProfil(p, b));
    wrap.appendChild(b);
  }
  if (!profilHantera) {
    const ny = document.createElement('button'); ny.type = 'button'; ny.className = 'lg-pf ny';
    ny.innerHTML = '<span class="lg-pf-bild">+</span><span class="lg-pf-namn">Lägg till konto</span><span class="lg-pf-typ">Logga in</span>';
    ny.addEventListener('click', () => { $('login-email').value = ''; $('start-error').style.display = 'none'; setLoginView('login'); visaTillbakaTillProfiler(); setTimeout(() => $('login-email').focus(), 30); });
    wrap.appendChild(ny);
  }
}
function visaProfiler() {
  profilHantera = false;
  $('prof-error').style.display = 'none';
  ritaProfiler();
  setLoginView('profiles');
  setTimeout(() => { const f = document.querySelector('#lg-profiler .lg-pf'); if (f) f.focus(); }, 30);
}
function profilFel(msg) { const e = $('prof-error'); e.textContent = msg; e.style.display = 'block'; }
// Inloggningen med e-post ifylld (profilens token har gått ut, eller vuxenprofil i barnläge)
// Inloggningen med mejlen ifylld OCH "Fortsätt med Google" kvar (många vuxna loggar in med Google och har inget lösenord)
function profilTillLosenord(email, msg) {
  $('login-email').value = email || '';
  setLoginView('login'); visaTillbakaTillProfiler();
  const e = $('start-error'); if (msg) { e.textContent = msg; e.style.display = 'block'; } else e.style.display = 'none';
}
async function valjProfil(p, el) {
  if (profilHantera) {
    el.classList.add('laddar');
    try { await window.auth.taBortProfil(p.key); } catch {}
    await hamtaProfiler();
    if (!profilLista.length) { profilHantera = false; setLoginView('login'); visaTillbakaTillProfiler(); return; }
    ritaProfiler(); return;
  }
  $('prof-error').style.display = 'none';
  if (!p.isChild && famLocked()) { profilTillLosenord(p.email, 'Barnläget är på. Logga in som vuxen med Google eller med mejl och lösenord.'); return; }
  el.classList.add('laddar');
  let r; try { r = await window.auth.hamtaProfil(p.key); } catch { r = null; }
  if (!r || !r.ok || !r.account) { el.classList.remove('laddar'); await hamtaProfiler(); ritaProfiler(); profilFel('Profilen finns inte längre. Logga in igen.'); return; }
  const a = r.account;
  if (a.isChild) {
    let me; try { me = await window.family.me(a.token); } catch { me = null; }
    el.classList.remove('laddar');
    if (me && me.ok && me.isChild) {
      if (account) return;   // någon hann logga in under tiden
      await enterChildMode(a.token, { id: a.childId || me.id || 'self', name: me.name || a.name, age: me.age || 0 });
      closeLogin(); showToast('Inloggad som ' + (me.name || a.name));
      return;
    }
    if (me && me.error === 'no_session') {
      try { await window.auth.taBortProfil(p.key); } catch {} await hamtaProfiler();
      childPendingCode = null; $('child-code-input').value = ''; setLoginView('child'); showChildStep(1);
      $('child-error').textContent = 'Inloggningen har gått ut. Skriv din barnkod igen.'; $('child-error').style.display = 'block';
      return;
    }
    profilFel((me && me.message) || 'Kunde inte nå AdRaze. Kontrollera din uppkoppling.'); return;
  }
  let s; try { s = await window.auth.session(a.token); } catch { s = null; }
  el.classList.remove('laddar');
  if (s && s.ok) {
    if (account) return;
    loginAs(a.token, s.email || a.email, s.pro, s.name || a.name);
    closeLogin(); showToast('Inloggad som ' + (s.name || s.email || a.email));
    return;
  }
  if (s && s.error === 'no_session') {
    try { await window.auth.taBortProfil(p.key); } catch {} await hamtaProfiler();
    profilTillLosenord(a.email, 'Inloggningen har gått ut. Logga in igen med Google eller med mejl och lösenord.');
    return;
  }
  profilFel((s && s.message) || 'Kunde inte nå AdRaze. Kontrollera din uppkoppling.');
}
function accountKey(a) { a = a || account; if (!a) return null; return 'k:' + (a.email || a.childId || a.name || a.token || 'user'); }
// Barnets dator: en märkning från servern som finns kvar när barnet loggar ut. Loggar någon annan än föräldern
// sedan in med ett vuxenkonto här släpper spärren som vanligt, men föräldern får ett mejl om det.
var BARN_ENHET_KEY = 'adraze-barnenhet';
async function barnEnhetMark(token, child) {
  try {
    const m = JSON.parse(localStorage.getItem(BARN_ENHET_KEY) || 'null');
    if (m && m.barnId === child.id && m.enhet) return;
    const r = await window.family.enhet(token);
    if (r && r.ok && r.enhet) localStorage.setItem(BARN_ENHET_KEY, JSON.stringify({ barnId: child.id, enhet: r.enhet }));
  } catch {}
}
async function barnEnhetAnmal(token) {
  let m; try { m = JSON.parse(localStorage.getItem(BARN_ENHET_KEY) || 'null'); } catch { m = null; }
  if (!m || !m.enhet || !token) return;
  const r = await window.family.annatKonto(token, m.enhet).catch(() => null);
  // Föräldern själv loggade in, eller märkningen finns inte längre → datorn är inte barnets längre
  if (r && r.ok && (r.foralder || r.kand === false)) { try { localStorage.removeItem(BARN_ENHET_KEY); } catch {} }
}
function loginAs(token, email, pro, name) {
  try { window.auth.googleAvbryt(); } catch {}   // ett väntande "Fortsätt med Google" gäller inte längre
  account = { token, email: email || '', pro: !!pro, name: name || '' };
  socMe = null;   // förra kontots profil (bild m.m.) får inte hänga kvar
  unlockHistoryForParent();   // vuxenkonto → historiken går att rensa igen
  satBarnlage(false);         // … och barnläget släpper (spärrarna gäller bara barnkonton)
  barnEnhetAnmal(token);      // barnets dator: föräldern får mejl om det inte var hen
  sparaKontoLokalt();
  famStadaBarnpost();
  try { window.auth.remember(account); } catch {}
  sparaProfil();
  updateAccountBtn();
  try { loadSocMe().then(() => { updateAccountBtn(); sparaProfil(); }); } catch {}   // hämta NYA kontots profilbild → kontoknappen + profilen
  try { window.session.login(accountKey(account)); } catch {}   // återställ kontots webbsession (Gmail m.m. tillbaka) + lås upp lösenord
  famSkickaTillMain();
  // Låsskärmen hade gömt webbvyn: visa den igen, annars är sidorna tomma trots att man är inloggad
  try { const kb = $('kidblock'); if (kb && kb.style.display !== 'none') { kb.style.display = 'none'; showActiveTab(); } } catch {}
  try { stopChildSync(); startParentSync(); } catch {}
  try { synkaInit(); } catch {}   // bokmärken mellan enheter
  if (pendingKryptoAfterLogin) { pendingKryptoAfterLogin = false; openKrypto(true); }
  else if (kryptoOpen) openKrypto(true);
  if (pendingChattAfterLogin) { pendingChattAfterLogin = false; openChatt(true); }
  setTimeout(() => { try { refreshPro(); } catch {} }, 400);   // Pro-status från servern (Google-inloggningen vet den inte)
}
// glom = logga ut på riktigt och ta bort profilen (kontot raderat, barnet utloggat av föräldern).
// Annars sparas kontot som profil och profilväljaren visas, som på Netflix.
function doLogout(reopenKrypto, glom) {
  chattOpen = false; chattUnread = 0; parkedKrypto = false; parkedChatt = false;
  for (const x of tabs) { x.panel = null; x.parked = null; }
  const t = account && account.token;
  const sk = account ? accountKey(account) : null;
  const _ut = account || {};
  account = null; socMe = null; glomKontoLokalt(); updateAccountBtn();
  if (_ut.isChild) satBarnlage(true);   // ett barn har loggat ut här: fönstret är låst tills en vuxen loggar in
  try { window.auth.forget(); } catch {}
  if (t && !glom) { try { window.auth.sparaProfil(sk, { token: t, email: _ut.email, pro: _ut.pro, name: _ut.name, isChild: _ut.isChild, childId: _ut.childId }); } catch {} }
  let _sl = Promise.resolve();
  if (sk) { try { _sl = window.session.logout(sk) || _sl; } catch {} }   // spara + rensa webbsession (utloggad ur Gmail m.fl.) + lås lösenord
  if (glom && sk) { _sl.catch(() => {}).then(() => window.auth.taBortProfil(sk)).catch(() => {}).then(() => hamtaProfiler()); }
  window.__kidShown = false;
  if (typeof stopChildSync === 'function') stopChildSync();
  if (typeof stopParentSync === 'function') stopParentSync();
  try { if (fam && fam.children && fam.children.some((c) => c.self)) { fam = { children: [], activeChild: null }; famSave(); } } catch {}
  if (typeof applyKidIndicator === 'function') applyKidIndicator();
  famSkickaTillMain();        // barnläge på enheten → huvudprocessen låser allt tills en vuxen loggar in
  // Ingen utloggning på servern här: token ligger kvar i profilen så att man kan fortsätta. Riktig utloggning = ta bort profilen.
  if (glom && !sk && t) { try { window.auth.logout(t); } catch {} }
  hamtaProfiler().then(() => { if (!account) { if (profilLista.length) visaProfiler(); else setLoginView('login'); } });
  setLoginView(profilLista.length ? 'profiles' : 'login');
  if (reopenKrypto !== false && kryptoOpen) openKrypto(true);  // lås Falk igen
}
function busyBtn(id, busy, busyText, text) {
  const b = $(id); if (!b) return; b.disabled = busy; b.style.opacity = busy ? '0.7' : '1'; b.textContent = busy ? busyText : text;
}
// Steg 1 → 2: mejlen först, sedan lösenordet (ett steg i taget)
function goPw() {
  const email = $('login-email').value.trim().toLowerCase();
  const err = $('start-error');
  if (!EMAIL_RE.test(email)) { err.textContent = 'Fyll i en giltig mejladress.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  $('pw-email-shown').textContent = email;
  $('login-pw').value = ''; $('login-error').style.display = 'none';
  setLoginView('pw');
  setTimeout(() => $('login-pw').focus(), 30);
}
async function doLogin() {
  const email = $('login-email').value.trim().toLowerCase();
  const pw = $('login-pw').value;
  const err = $('login-error');
  if (!EMAIL_RE.test(email)) { err.textContent = 'Fyll i en giltig mejladress.'; err.style.display = 'block'; return; }
  if (!pw) { err.textContent = 'Fyll i ditt lösenord.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  busyBtn('login-submit', true, 'Loggar in…', 'Logga in');
  let r; try { r = await window.auth.login(email, pw); } catch { r = { ok: false }; }
  busyBtn('login-submit', false, 'Loggar in…', 'Logga in');
  if (!r || !r.ok) { err.textContent = (r && r.message) || 'Inloggningen misslyckades.'; err.style.display = 'block'; return; }
  if (r.needCode) { pendingEmail = email; pendingSubmit = { type: 'login', email, password: pw }; showCodeStep(); return; }
  loginAs(r.token, r.email, r.pro, r.name); closeLogin();
}
// Google: webbläsaren öppnar adraze.app/app-google i ett eget fönster och får tillbaka nyckeln
async function doGoogle(errId, btnId) {
  const err = $(errId);
  err.style.display = 'none';
  closeLogin();   // inloggningen sker i en flik – rutan stängs så fliken syns
  $(btnId).disabled = true;
  let r; try { r = await window.auth.google(); } catch { r = { ok: false }; }
  $(btnId).disabled = false;
  if (r && r.ok) { loginAs(r.token, r.email, r.pro, r.name); return; }
  if (r && r.error === 'cancelled') return;
  openLogin(); err.textContent = (r && r.message) || 'Google-inloggningen misslyckades.'; err.style.display = 'block';
}
async function doSignup() {
  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim().toLowerCase();
  const pw = $('signup-pw').value;
  const err = $('signup-error');
  if (!name) { err.textContent = 'Fyll i ditt namn.'; err.style.display = 'block'; return; }
  if (!EMAIL_RE.test(email)) { err.textContent = 'Fyll i en giltig mejladress.'; err.style.display = 'block'; return; }
  if (pw.length < 8) { err.textContent = 'Lösenordet måste vara minst 8 tecken.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  busyBtn('signup-submit', true, 'Skapar konto…', 'Skapa konto');
  let r; try { r = await window.auth.signup(email, pw, name); } catch { r = { ok: false }; }
  busyBtn('signup-submit', false, 'Skapar konto…', 'Skapa konto');
  if (!r || !r.ok) { err.textContent = (r && r.message) || 'Kunde inte skapa kontot.'; err.style.display = 'block'; return; }
  if (r.needCode) { pendingEmail = email; pendingSubmit = { type: 'signup', email, password: pw, name }; showCodeStep(); return; }
  loginAs(r.token, r.email, r.pro, r.name); closeLogin();
}
function showCodeStep() {
  $('code-email-shown').textContent = pendingEmail || '';
  $('login-code-input').value = ''; $('code-error').style.display = 'none';
  setLoginView('code');
  setTimeout(() => $('login-code-input').focus(), 30);
}
async function doVerifyCode() {
  const code = $('login-code-input').value.replace(/\D/g, '');
  const err = $('code-error');
  if (code.length !== 6) { err.textContent = 'Koden är 6 siffror.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  busyBtn('code-submit', true, 'Verifierar…', 'Verifiera');
  let r; try { r = await window.auth.verifyCode(pendingEmail, code); } catch { r = { ok: false }; }
  busyBtn('code-submit', false, 'Verifierar…', 'Verifiera');
  if (!r || !r.ok) { err.textContent = (r && r.message) || 'Fel kod. Försök igen.'; err.style.display = 'block'; return; }
  loginAs(r.token, r.email, r.pro, r.name); closeLogin();
}
async function doResendCode() {
  if (!pendingSubmit) return;
  $('code-error').style.display = 'none';
  try {
    if (pendingSubmit.type === 'login') await window.auth.login(pendingSubmit.email, pendingSubmit.password);
    else await window.auth.signup(pendingSubmit.email, pendingSubmit.password, pendingSubmit.name);
    showToast('Ny kod skickad till din mejl.');
  } catch {}
}
/* ── Glömt lösenord ── */
async function doResetRequest() {
  const email = $('reset-email').value.trim().toLowerCase();
  const err = $('reset-error');
  if (!EMAIL_RE.test(email)) { err.textContent = 'Fyll i en giltig mejladress.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  busyBtn('reset-send', true, 'Skickar…', 'Skicka kod');
  try { await window.auth.resetRequest(email); } catch {}
  busyBtn('reset-send', false, 'Skickar…', 'Skicka kod');
  pendingResetEmail = email;
  $('reset-code').value = ''; $('reset-pw').value = ''; $('reset-confirm-error').style.display = 'none'; $('reset-code-error').style.display = 'none';
  setLoginView('resetconfirm');
  setTimeout(() => $('reset-code').focus(), 30);
}
async function doResetConfirm() {
  const code = $('reset-code').value.replace(/\D/g, '');
  const pw = $('reset-pw').value;
  const err = $('reset-confirm-error');
  if (code.length !== 6) { err.textContent = 'Koden är 6 siffror.'; err.style.display = 'block'; return; }
  if (pw.length < 8) { err.textContent = 'Lösenordet måste vara minst 8 tecken.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  busyBtn('reset-confirm-submit', true, 'Sparar…', 'Återställ lösenord');
  let r; try { r = await window.auth.resetConfirm(pendingResetEmail, code, pw); } catch { r = { ok: false }; }
  busyBtn('reset-confirm-submit', false, 'Sparar…', 'Återställ lösenord');
  if (!r || !r.ok) { err.textContent = (r && r.message) || 'Kunde inte återställa lösenordet.'; err.style.display = 'block'; return; }
  loginAs(r.token, r.email, r.pro, r.name);
  showToast('Lösenordet är ändrat.');
  closeLogin();
}
async function doResetResend() {
  if (!pendingResetEmail) return;
  $('reset-confirm-error').style.display = 'none';
  try { await window.auth.resetRequest(pendingResetEmail); showToast('Ny kod skickad.'); } catch {}
}
/* ── Barn loggar in: barnkoden, sedan en kod som mejlas till föräldern (varje inloggning) ── */
let childPendingCode = null;
function showChildStep(n) {
  $('child-step1').style.display = n === 1 ? 'block' : 'none';
  $('child-step2').style.display = n === 2 ? 'block' : 'none';
  $('child-resend').style.display = n === 2 ? 'inline' : 'none';
  $('child-submit').textContent = n === 2 ? 'Logga in' : 'Fortsätt';
  $('child-error').style.display = 'none';
  setTimeout(() => $(n === 2 ? 'child-approval-input' : 'child-code-input').focus(), 20);
}
async function childAskParent(code) {
  let r; try { r = await window.family.join(code); } catch { r = { ok: false }; }
  return r || { ok: false };
}
async function doChildLogin() {
  const err = $('child-error');
  if (!childPendingCode) {
    const code = ($('child-code-input').value || '').trim().toUpperCase();
    if (code.length < 4) { err.textContent = 'Skriv koden du fick av din förälder.'; err.style.display = 'block'; return; }
    err.style.display = 'none';
    busyBtn('child-submit', true, 'Skickar…', 'Fortsätt');
    const r = await childAskParent(code);
    busyBtn('child-submit', false, 'Skickar…', 'Fortsätt');
    if (!r.ok) { err.textContent = r.message || 'Fel kod. Fråga din förälder.'; err.style.display = 'block'; return; }
    childPendingCode = code;
    $('child-approval-input').value = '';
    showChildStep(2);
    return;
  }
  const approval = ($('child-approval-input').value || '').replace(/\D/g, '');
  if (approval.length !== 6) { err.textContent = 'Koden är 6 siffror.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  busyBtn('child-submit', true, 'Loggar in…', 'Logga in');
  let r; try { r = await window.family.approve(childPendingCode, approval); } catch { r = { ok: false }; }
  busyBtn('child-submit', false, 'Loggar in…', 'Logga in');
  if (!r || !r.ok || !r.child) { err.textContent = (r && r.message) || 'Fel kod. Fråga din förälder igen.'; err.style.display = 'block'; return; }
  childPendingCode = null;
  await enterChildMode(r.token, r.child);
  closeLogin();
  showToast('Inloggad som ' + r.child.name);
}
async function doChildResend() {
  if (!childPendingCode) return;
  const r = await childAskParent(childPendingCode);
  if (r.ok) showToast('Ny kod skickad till din förälder.');
  else { $('child-error').textContent = r.message || 'Kunde inte skicka en ny kod.'; $('child-error').style.display = 'block'; }
}
async function enterChildMode(token, child) {
  try { window.auth.googleAvbryt(); } catch {}
  account = { token, email: '', pro: false, name: child.name, isChild: true, childId: child.id };
  socMe = null;
  lockHistoryForChild();      // barnet kan inte radera sin historik — inte ens efter utloggning
  satBarnlage(true);          // och spärrarna släpper inte vid utloggning: låst tills en vuxen loggar in
  sparaKontoLokalt();
  try { window.auth.remember(account); } catch {}
  sparaProfil();
  updateAccountBtn();
  try { loadSocMe().then(() => updateAccountBtn()); } catch {}
  try { window.session.login(accountKey(account)); } catch {}   // barnets egen webbsession
  let bl = [], al = [];
  try { const me = await window.family.me(token); if (me && me.ok) { if (Array.isArray(me.blocklist)) bl = me.blocklist; if (Array.isArray(me.allows)) al = me.allows; } } catch {}
  fam = { children: [{ id: child.id, name: child.name, age: child.age, blocklist: bl, allows: al, self: true }], activeChild: child.id };
  famSave();
  if (typeof renderFam === 'function') renderFam();
  window.__kidShown = false;
  applyKidIndicator();
  barnEnhetMark(token, child);   // datorn märks som barnets (finns kvar efter utloggning)
  if (typeof startChildSync === 'function') startChildSync();
}
async function syncChild() {
  if (!account || !account.isChild || !account.token) return;
  const tok = account.token;
  let me; try { me = await window.family.me(tok); } catch { return; }
  if (!account || account.token !== tok) return;   // kontot byttes under tiden: svaret gäller inte det nya kontot
  if (me && me.ok && me.isChild) {
    const id = account.childId || 'self';
    fam = { children: [{ id, name: me.name || account.name, age: me.age || 0, blocklist: Array.isArray(me.blocklist) ? me.blocklist : [], allows: Array.isArray(me.allows) ? me.allows : [], self: true }], activeChild: id };
    famSave(); applyKidIndicator();
    if (typeof enforceActiveTab === 'function') enforceActiveTab();
    try { kbSvar(me.fragor); } catch {}
    if (typeof ensureAllowTicker === 'function') ensureAllowTicker();
  } else if (me && me.error === 'no_session') {
    // Föräldern loggade ut barnet (eller sessionen gick ut): webbläsaren LÅSES – den blir aldrig ospärrad
    doLogout(false, true);
    try { showBlockScreen((active && active.url) || ''); } catch {}
  }
}
/* ── Kontosida (profil i Inställningar) + radera konto ── */
function openAccount() { if (account) { openSettings(); showSettingsCat('konto'); } else { openLogin(); } }
async function renderKonto() {
  try { if (window.__ritaKontoLage) window.__ritaKontoLage(); } catch {}
  const si = $('kn-signedin'), so = $('kn-signedout');
  if (!si) return;
  if (!account) { si.style.display = 'none'; if (so) so.style.display = 'block'; return; }
  si.style.display = 'block'; if (so) so.style.display = 'none';
  const nm = account.name || (account.isChild ? 'Barnkonto' : (account.email ? account.email.split('@')[0] : 'Du'));
  $('kn-avatar').innerHTML = escapeHtml((nm[0] || '?').toUpperCase());
  $('kn-name').textContent = nm;
  $('kn-email').textContent = account.isChild ? 'Barnkonto (loggar in med kod)' : (account.email || '');
  $('kn-badge').style.display = account.pro ? 'inline-flex' : 'none';
  const rows = [['Typ', account.isChild ? 'Barnkonto' : 'Vuxenkonto'], ['Status', account.pro ? 'AdRaze Pro' : 'Gratis']];
  if (account.email && !account.isChild) rows.push(['Mejl', account.email]);
  $('kn-rows').innerHTML = rows.map((r) => '<div class="kn-row"><span class="k">' + r[0] + '</span><span class="v">' + escapeHtml(r[1]) + '</span></div>').join('');
  const dz = $('kn-danger'); if (dz) dz.style.display = account.isChild ? 'none' : '';
  const sr = $('synk-row');
  if (sr) {
    sr.style.display = account.isChild ? 'none' : 'flex';
    const st = $('synk-toggle'); if (st) st.checked = synkPa();
  }
  renderPro();
  await loadSocMe();
  if (socMe && socMe.avatar) $('kn-avatar').innerHTML = '<img src="' + socMe.avatar + '" alt="">';
  if (typeof renderSetHero === 'function') renderSetHero();
}
// ── AdRaze Pro i Konto: status, säga upp och ångra ──
const tp = (k) => (typeof window.t === 'function') ? window.t(k) : k;
function proDate(ms) { try { return new Date(ms).toLocaleDateString(document.documentElement.lang || 'sv', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } }
function proPrice(p) {
  if (!p || p.belopp == null) return '';
  const kr = Math.round(p.belopp / 100);
  return kr + ' kr ' + (p.intervall === 'year' ? tp('per år') : tp('i månaden'));
}
let proBusy = false;
async function renderPro() {
  const box = $('pro-box'); if (!box) return;
  if (!account || account.isChild) { box.hidden = true; return; }
  box.hidden = false;
  ['pro-cancel', 'pro-resume', 'pro-get'].forEach((id) => { $(id).hidden = true; });
  $('pro-confirm').hidden = true; $('pro-err').hidden = true; $('pro-actions').hidden = false;
  $('pro-desc').textContent = tp('Hämtar…'); $('pro-chip').textContent = ''; $('pro-chip').className = 'set-chip dim';
  let st; try { st = await window.view.proStatus(account && account.token); } catch { st = null; }
  if (!st || !st.ok) { $('pro-desc').textContent = (st && st.message) || tp('Kunde inte hämta din Pro-status.'); return; }
  const sub = st.prenumeration;
  box.dataset.until = st.until || '';
  if (st.pro && sub && (sub.status === 'active' || sub.status === 'trialing')) {
    if (sub.slutar) {
      $('pro-chip').textContent = tp('Uppsagd'); $('pro-chip').className = 'set-chip dim';
      $('pro-desc').textContent = tp('Pro gäller till') + ' ' + proDate(sub.periodSlut) + ' ' + tp('och förnyas inte.');
      $('pro-resume').hidden = false;
    } else {
      $('pro-chip').textContent = tp('Aktiv'); $('pro-chip').className = 'set-chip';
      $('pro-desc').textContent = [proPrice(sub), tp('Förnyas') + ' ' + proDate(sub.periodSlut) + '.'].filter(Boolean).join(' · ');
      $('pro-cancel').hidden = false;
    }
  } else if (st.pro) {
    $('pro-chip').textContent = tp('Aktiv'); $('pro-chip').className = 'set-chip';
    $('pro-desc').textContent = new Date(st.until).getFullYear() >= 2099 ? tp('Pro för alltid på det här kontot.') : tp('Pro gäller till') + ' ' + proDate(st.until) + '.';
  } else {
    $('pro-chip').textContent = tp('Gratis'); $('pro-chip').className = 'set-chip dim';
    $('pro-desc').textContent = tp('Falk, din AI-assistent, ingår i Pro för 79 kr i månaden.');
    $('pro-get').hidden = false;
  }
}
function proError(msg) { const e = $('pro-err'); e.textContent = msg; e.hidden = false; }
$('pro-cancel').addEventListener('click', async () => {
  let st = null; try { st = await window.view.proStatus(account && account.token); } catch {}
  const end = st && st.prenumeration ? proDate(st.prenumeration.periodSlut) : '';
  $('pro-confirm-txt').textContent = tp('Du behåller Pro till') + ' ' + end + '. ' + tp('Efter det förnyas den inte och du debiteras inte igen. Falk slutar då att fungera.');
  $('pro-confirm').hidden = false; $('pro-actions').hidden = true;
});
$('pro-keep').addEventListener('click', () => { $('pro-confirm').hidden = true; $('pro-actions').hidden = false; });
$('pro-cancel-go').addEventListener('click', async () => {
  if (proBusy) return; proBusy = true; const b = $('pro-cancel-go'); b.disabled = true;
  const r = await window.view.proCancel(account && account.token).catch(() => null);
  proBusy = false; b.disabled = false;
  if (!r || !r.ok) { proError((r && r.message) || tp('Det gick inte att säga upp just nu. Försök igen.')); return; }
  showToast(tp('Pro är uppsagd. Du har kvar den till') + ' ' + proDate(r.until) + '.');
  renderPro();
});
$('pro-resume').addEventListener('click', async () => {
  if (proBusy) return; proBusy = true; const b = $('pro-resume'); b.disabled = true;
  const r = await window.view.proResume(account && account.token).catch(() => null);
  proBusy = false; b.disabled = false;
  if (!r || !r.ok) { proError((r && r.message) || tp('Det gick inte just nu. Försök igen.')); return; }
  showToast(tp('Pro fortsätter som vanligt.'));
  renderPro();
});
$('pro-get').addEventListener('click', () => { try { closeSettings(); } catch {} openKrypto(true); });

function showConfirmDelete() {
  if (!account || account.isChild || document.getElementById('kn-delmodal')) return;
  const ov = document.createElement('div'); ov.id = 'kn-delmodal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(5,12,22,.5);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
  ov.innerHTML = '<div style="width:min(420px,94vw);background:#fff;border-radius:18px;padding:24px;box-shadow:0 30px 70px rgba(8,20,35,.4)">'
    + ''
    + '<div style="font-size:18px;font-weight:800;color:var(--color-navy-900);text-align:center;margin-bottom:8px">Ta bort kontot?</div>'
    + '<p style="font-size:13.5px;color:rgb(28 43 58 / .6);text-align:center;margin-bottom:14px;line-height:1.5">Ditt AdRaze-konto, dina barnkonton och din statistik raderas permanent. Det gäller även på adraze.app. Det går inte att ångra.</p>'
    + '<input id="kn-del-pw" type="password" autocomplete="current-password" placeholder="Ditt lösenord" style="width:100%;height:42px;padding:0 12px;border:1px solid #dcdad4;border-radius:6px;margin-bottom:14px;font-size:14px;outline:none">'
    + '<div style="display:flex;gap:9px"><button id="kn-del-cancel" class="btn btn-ghost" style="flex:1;height:44px">Avbryt</button><button id="kn-del-yes" class="kn-del-btn" style="flex:1;height:44px">Ja, ta bort</button></div></div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#kn-del-cancel').addEventListener('click', close);
  ov.querySelector('#kn-del-yes').addEventListener('click', async () => {
    const btn = ov.querySelector('#kn-del-yes'); btn.disabled = true; btn.textContent = 'Tar bort…';
    let r; try { r = await window.auth.deleteAccount(account.token, ov.querySelector('#kn-del-pw').value); } catch { r = { ok: false }; }
    if (!r || !r.ok) { btn.disabled = false; btn.textContent = 'Ja, ta bort'; showToast((r && r.message) || 'Kunde inte ta bort kontot.'); return; }
    close(); doLogout(false, true); renderKonto(); showToast('Ditt konto är borttaget.');
  });
}
/* ── Profilbild (AdRaze-kontots, samma som på adraze.app) ── */
async function loadSocMe() {
  if (!account || !account.token || account.isChild) { socMe = null; return null; }
  try { const r = await window.auth.session(account.token); if (r && r.ok) socMe = { avatar: r.avatar || null }; } catch {}
  return socMe;
}
function closeMsgMenu() { const m = $('fr-msgmenu'); if (m) m.remove(); }   // tidsmenyn (Tillåt …) i Familj

/* ── Chatt: E2E-chatten (vänner, DM, grupper) i en egen panel, se ui/chatt.html ── */
function chattOpts() { return { token: (account && account.token) || null, child: !!(account && account.isChild), theme, lang: (window.i18n && window.i18n.lang) || 'sv' }; }
function chattSync() { try { if (!account) chattOpen = false; window.view.chattToggle(chattOpen, chattOpts()); } catch {} renderChattBtn(); }
function openChatt(open) {
  if (open && !account) { pendingChattAfterLogin = true; openLogin(); return; }
  if (open) { parkedChatt = false; if (kryptoOpen) { parkedKrypto = true; openKrypto(false, true); } }
  chattOpen = !!open;
  chattSync();
  if (!open) restoreKrypto();
  rememberPanel();
}
function restoreKrypto() { if (parkedKrypto) { parkedKrypto = false; if (account) openKrypto(true); } }
// Falk och chatten hör till fliken där de öppnades: en ny flik eller en annan flik har ingen panel,
// och går du tillbaka kommer panelen fram igen (även en "parkerad" Falk bakom chatten).
function panelNow() { return kryptoOpen ? 'krypto' : (chattOpen ? 'chatt' : null); }
function rememberPanel() { if (!active) return; active.panel = panelNow(); active.parked = parkedKrypto ? 'krypto' : (parkedChatt ? 'chatt' : null); }
function applyTabPanel(tab) {
  const want = account ? (tab.panel || null) : null;
  parkedKrypto = !!account && tab.parked === 'krypto'; parkedChatt = !!account && tab.parked === 'chatt';
  if (want === panelNow()) return;
  if (kryptoOpen && want !== 'krypto') { kryptoOpen = false; window.view.kryptoToggle(false, kryptoMode(), account ? account.token : null); $('krypto-btn').classList.add('off'); }
  if (chattOpen && want !== 'chatt') { chattOpen = false; chattSync(); }
  if (want === 'krypto') { kryptoOpen = true; window.view.kryptoToggle(true, kryptoMode(), account.token); $('krypto-btn').classList.remove('off'); }
  else if (want === 'chatt') { chattOpen = true; chattSync(); }
}
function renderChattBtn() {
  const b = $('chatt-btn'); if (!b) return;
  b.classList.toggle('active', chattOpen);
  const bd = $('chatt-badge');
  if (bd) { bd.textContent = chattUnread > 99 ? '99+' : String(chattUnread); bd.style.display = (chattUnread > 0 && !chattOpen && account) ? 'block' : 'none'; }
}
$('chatt-btn') && $('chatt-btn').addEventListener('click', () => openChatt(!chattOpen));
window.view.onChattClosed(() => { chattOpen = false; renderChattBtn(); restoreKrypto(); rememberPanel(); });
// Falk/chatten tar en egen kolumn till höger: startsidan, inställningarna och rutorna krymper i stället för att hamna under panelen
window.view.onPanelInset && window.view.onPanelInset((px) => { document.documentElement.style.setProperty('--pw', (px | 0) + 'px'); fitOmni(); });
// Med Falk/chatten öppen krymper adressfältet så att det (och förslagsrutan under) slutar före panelen
function fitOmni() {
  const o = $('omnibox'); if (!o) return;
  o.style.maxWidth = '';
  const pw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pw'), 10) || 0;
  if (pw > 0) {
    const r = o.getBoundingClientRect(), lim = innerWidth - pw - 12;
    if (r.right > lim) o.style.maxWidth = Math.max(240, Math.floor(r.width - (r.right - lim))) + 'px';
  }
  try { if (suggestEl.classList.contains('on')) { const r = o.getBoundingClientRect(); suggestEl.style.left = r.left + 'px'; suggestEl.style.width = r.width + 'px'; } } catch {}
}
addEventListener('resize', () => fitOmni());
window.view.onChattUnread((n) => { chattUnread = n || 0; renderChattBtn(); });
// Inställningar → Vänner & chatt: kort förklaring + öppna-knapp (själva chatten är panelen)
function renderFriends() {
  const wrap = $('fr-body'); if (!wrap) return;
  if (!account) { wrap.innerHTML = '<div class="fr-note">' + escapeHtml(t('Logga in för att lägga till vänner och chatta.')) + '</div><button id="fr-login" class="btn btn-safe" style="height:40px;padding:0 16px;">' + escapeHtml(t('Logga in')) + '</button>'; const _l = $('fr-login'); if (_l) _l.addEventListener('click', () => openLogin()); return; }
  if (account.isChild) { wrap.innerHTML = '<div class="fr-note">' + escapeHtml(t('Här chattar du med din familj. Bara din familj kan skriva till dig.')) + '</div><button id="fr-open-chatt" class="btn btn-safe" style="height:40px;padding:0 16px;">' + escapeHtml(t('Öppna chatten')) + '</button>'; $('fr-open-chatt').addEventListener('click', () => { closeSettings(); openChatt(true); }); return; }
  wrap.innerHTML = '<div class="fr-note">' + escapeHtml(t('Allt du skriver krypteras på din dator innan det skickas. Bara du och de du chattar med kan läsa det, aldrig AdRaze.')) + '</div><button id="fr-open-chatt" class="btn btn-safe" style="height:40px;padding:0 16px;">' + escapeHtml(t('Öppna chatten')) + '</button>';
  $('fr-open-chatt').addEventListener('click', () => { closeSettings(); openChatt(true); });
}
/* Profil: bild-uppladdning + användarnamn (i Konto) */
function knResizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); // vit botten (PNG-transparens → JPEG)
        const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
        ctx.drawImage(img, sx, sy, m, m, 0, 0, size, size);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => reject(new Error('img'));
      img.src = reader.result; // data: URL (tillåts av CSP, till skillnad från blob:)
    };
    reader.readAsDataURL(file);
  });
}
async function knHandleAvatar(e) {
  const file = e.target.files && e.target.files[0]; if (!file || !account) return;
  const dataUrl = await knResizeImage(file, 256).catch(() => null);
  e.target.value = '';
  if (!dataUrl) { showToast('Kunde inte läsa bilden.'); return; }
  const r = await window.auth.setAvatar(account.token, dataUrl).catch(() => ({ ok: false }));
  if (!r || !r.ok) { showToast((r && r.message) || 'Kunde inte spara bilden.'); return; }
  socMe = socMe || {}; socMe.avatar = r.avatar || dataUrl;
  $('kn-avatar').innerHTML = '<img src="' + socMe.avatar + '" alt="">';
  try { updateAccountBtn(); } catch {}   // uppdatera profilbilden i kontoknappen direkt
  showToast('Profilbild uppdaterad.');
}
// Visa/dölj-lösenord (öga-knapparna)
document.querySelectorAll('.pw-eye').forEach((b) => {
  b.addEventListener('click', () => {
    const inp = $(b.dataset.target); if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.style.opacity = inp.type === 'text' ? '1' : '0.55';
  });
});
$('account-btn').addEventListener('click', () => openAccount());
$('allow-chip') && $('allow-chip').addEventListener('click', () => { openSettings(); showSettingsCat('familj'); });
$('kn-logout') && $('kn-logout').addEventListener('click', () => { doLogout(); renderKonto(); try { closeSettings(); } catch {} openLogin(); });
$('kn-login') && $('kn-login').addEventListener('click', () => openLogin());
(function kontoLageInst() {
  const t = $('kl-toggle'); if (!t || !window.kontoLage) return;
  let l; try { l = window.kontoLage.hamta(); } catch { return; }
  const rita = (sparat) => {
    t.checked = !!sparat;
    $('kl-omstart').style.display = (!!sparat !== !!l.perFonster) ? 'flex' : 'none';
    const last = !!(account && account.isChild) || famLocked();   // barnet får inte ändra hur konton fungerar
    t.disabled = last; $('kl-rad').style.opacity = last ? '.55' : '';
  };
  rita(l.sparat);
  t.addEventListener('change', async () => { let r; try { r = await window.kontoLage.satt(t.checked); } catch { r = null; } rita(r ? r.perFonster : !t.checked); });
  $('kl-omstart-btn').addEventListener('click', () => { try { window.kontoLage.omstart(); } catch {} });
  window.__ritaKontoLage = () => { try { rita(window.kontoLage.hamta().sparat); } catch {} };
})();
$('kn-delete') && $('kn-delete').addEventListener('click', showConfirmDelete);
$('kn-avatar') && $('kn-avatar').addEventListener('click', () => { const f = $('kn-avatar-file'); if (f) f.click(); });
$('kn-avatar-file') && $('kn-avatar-file').addEventListener('change', knHandleAvatar);
$('login-close').addEventListener('click', () => { pendingKryptoAfterLogin = false; closeLogin(); });
$('qr-copy').addEventListener('click', () => { try { navigator.clipboard.writeText($('qr-url').textContent); } catch {} $('qr-copy').textContent = tn('Kopierad!'); });
$('qr-close').addEventListener('click', () => { if (active) active.overlay = null; $('qr').classList.add('hidden'); showActiveTab(); });
$('login-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') goPw(); });
$('login-next').addEventListener('click', goPw);
$('pw-change').addEventListener('click', () => { setLoginView('login'); setTimeout(() => $('login-email').focus(), 20); });
$('login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('login-submit').addEventListener('click', doLogin);
$('login-google').addEventListener('click', () => doGoogle('start-error', 'login-google'));
$('to-signup').addEventListener('click', () => {
  const email = $('login-email').value.trim().toLowerCase();
  $('signup-email').value = email; $('signup-email-shown').textContent = email;
  $('signup-name').value = ''; $('signup-pw').value = ''; $('name-error').style.display = 'none'; $('signup-error').style.display = 'none';
  setLoginView('signup'); setTimeout(() => $('signup-name').focus(), 20);
});
$('to-login').addEventListener('click', () => { setLoginView('pw'); setTimeout(() => $('login-pw').focus(), 20); });
function goSignupPw() {
  if (!$('signup-name').value.trim()) { $('name-error').textContent = 'Fyll i ditt namn.'; $('name-error').style.display = 'block'; return; }
  $('name-error').style.display = 'none';
  setLoginView('signuppw'); setTimeout(() => $('signup-pw').focus(), 20);
}
$('signup-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') goSignupPw(); });
$('signup-next').addEventListener('click', goSignupPw);
$('signup-pw-back').addEventListener('click', () => { setLoginView('signup'); setTimeout(() => $('signup-name').focus(), 20); });
$('signup-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignup(); });
$('signup-submit').addEventListener('click', doSignup);
$('login-code-input').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
$('login-code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerifyCode(); });
$('code-submit').addEventListener('click', doVerifyCode);
$('code-resend').addEventListener('click', doResendCode);
$('code-back').addEventListener('click', () => { setLoginView(pendingSubmit && pendingSubmit.type === 'signup' ? 'signuppw' : 'pw'); });
$('to-reset').addEventListener('click', () => { $('reset-email').value = $('login-email').value || ''; $('reset-error').style.display = 'none'; setLoginView('reset'); setTimeout(() => $('reset-email').focus(), 20); });
$('reset-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') doResetRequest(); });
$('reset-send').addEventListener('click', doResetRequest);
$('reset-back').addEventListener('click', () => { setLoginView('pw'); setTimeout(() => $('login-pw').focus(), 20); });
$('reset-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
function goResetPw() {
  if ($('reset-code').value.replace(/\D/g, '').length !== 6) { $('reset-code-error').textContent = 'Koden är 6 siffror.'; $('reset-code-error').style.display = 'block'; return; }
  $('reset-code-error').style.display = 'none'; $('reset-confirm-error').style.display = 'none';
  setLoginView('resetpw'); setTimeout(() => $('reset-pw').focus(), 20);
}
$('reset-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') goResetPw(); });
$('reset-code-next').addEventListener('click', goResetPw);
$('reset-pw-back').addEventListener('click', () => { setLoginView('resetconfirm'); setTimeout(() => $('reset-code').focus(), 20); });
$('reset-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doResetConfirm(); });
$('reset-confirm-submit').addEventListener('click', doResetConfirm);
$('reset-confirm-back').addEventListener('click', () => setLoginView('reset'));
$('reset-resend').addEventListener('click', doResetResend);
$('logout-btn').addEventListener('click', () => doLogout());
$('prof-hantera').addEventListener('click', () => { profilHantera = !profilHantera; $('prof-error').style.display = 'none'; ritaProfiler(); });
$('to-profiles').addEventListener('click', () => { if (profilLista.length) visaProfiler(); });
$('to-child').addEventListener('click', () => { childPendingCode = null; $('child-code-input').value = ''; setLoginView('child'); showChildStep(1); });
$('child-back').addEventListener('click', () => {
  if (childPendingCode) { childPendingCode = null; showChildStep(1); return; }
  setLoginView('login'); visaTillbakaTillProfiler(); setTimeout(() => $('login-email').focus(), 20);
});
$('child-resend').addEventListener('click', doChildResend);
$('child-submit').addEventListener('click', doChildLogin);
$('child-code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doChildLogin(); });
$('child-approval-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doChildLogin(); });
updateAccountBtn();
// (session-återställningen flyttad till filens SLUT — se nedan)

/* ── Startsida ── */
function tickClock() { $('nt-clock').textContent = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }
// Liten personlig hälsning på startsidan – läser användarnamnet + tiden.
function greet() {
  const el = $('nt-greet'); if (!el) return;
  let name = (account && account.name) ? account.name.split(' ')[0]
    : ((account && account.email) ? (account.email.split('@')[0].match(/^[a-zA-ZåäöÅÄÖ]+/) || [''])[0] : '');
  if (name) name = name[0].toUpperCase() + name.slice(1);   // snyggare i hälsningen
  const h = new Date().getHours();
  let b;
  if (h >= 5 && h < 10) b = ['God morgon', 'Morgonpigg', 'Ny dag väntar'];
  else if (h >= 10 && h < 12) b = ['God förmiddag', 'Härlig förmiddag'];
  else if (h >= 12 && h < 14) b = ['Lunchdags snart?', 'Mitt på dagen', 'God middag'];
  else if (h >= 14 && h < 18) b = ['God eftermiddag', 'Trevlig eftermiddag'];
  else if (h >= 18 && h < 22) b = ['God kväll', 'Skön kväll'];
  else if (h >= 22 || h < 3) b = ['Lite sent', 'Uppe sent', 'Nattsurfning'];
  else b = ['Mitt i natten', 'Dags att sova snart?', 'Sena timmar']; // 03–05
  const key = name + '|' + h + '|' + ((window.i18n && window.i18n.lang) || 'sv');                          // stabil inom samma timme + namn
  if (_greetCache.key !== key) {
    const g0 = b[Math.floor(Math.random() * b.length)], g = (typeof window.t === 'function') ? window.t(g0) : g0;
    _greetCache = { key, text: name ? g + ', ' + name : g };
  }
  el.textContent = _greetCache.text;
}
async function loadDailyImage() {
  try {
    const { url, credit } = await window.skoll.dailyImage();
    if (url) { const img = new Image(); img.onload = () => { $('nt-bg').style.backgroundImage = `url("${url}")`; }; img.src = url; if (credit) $('nt-credit').textContent = credit; }
  } catch {}
}
const DEFAULT_SHORTCUTS = [
  { label: 'Google', url: 'https://www.google.com' }, { label: 'YouTube', url: 'https://www.youtube.com' },
  { label: 'Wikipedia', url: 'https://sv.wikipedia.org' },
  { label: 'SVT', url: 'https://www.svt.se' }, { label: 'Blocket', url: 'https://www.blocket.se' },
  { label: 'Aftonbladet', url: 'https://www.aftonbladet.se' },
];
function getShortcuts() { try { const s = JSON.parse(localStorage.getItem('skoll-shortcuts')); if (Array.isArray(s)) return s; } catch {} return DEFAULT_SHORTCUTS.slice(); }
function saveShortcuts(l) { localStorage.setItem('skoll-shortcuts', JSON.stringify(l)); }
// Sätt defaults BARA om det saknas genvägar helt — skriv ALDRIG över användarens egna.
// Engångs: ta bort den gamla förvalda Säkerkoll-genvägen (ärvd från Vaka).
try {
  if (!localStorage.getItem('skoll-shortcuts')) localStorage.setItem('skoll-shortcuts', JSON.stringify(DEFAULT_SHORTCUTS));
  if (!localStorage.getItem('adraze-utan-skoll')) {
    saveShortcuts(getShortcuts().filter((s) => !/xn--skerkoll-0za\.se/.test(s.url || '')));
    localStorage.setItem('adraze-utan-skoll', '1');
  }
} catch {}
let addingShortcut = false;

function topSites() {
  return getHistory().slice().sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 8).map((e) => {
    let label = e.url; try { label = new URL(e.url).hostname.replace(/^www\./, ''); } catch {}
    return { label, url: e.url };
  });
}
function renderShortcuts() {
  const host = $('shortcuts'); host.innerHTML = '';
  const freq = topSitesMode === 'frequent';
  (freq ? topSites() : getShortcuts()).forEach((sc, idx) => {
    const el = document.createElement('div'); el.className = 'sc';
    let hostn = ''; let letter = '•';
    try { hostn = new URL(normalizeUrl(sc.url)).hostname.replace(/^www\./, ''); letter = (hostn[0] || '•').toUpperCase(); } catch {}
    const removeBtn = freq ? '' : `<button class="sc-remove" title="Ta bort"><svg class="ic" style="width:12px;height:12px;stroke-width:2.4"><use href="#i-close" /></svg></button>`;
    el.innerHTML = `
      <div class="sc-tilewrap">
        <div class="sc-tile"><span class="sc-letter">${escapeHtml(letter)}</span></div>
        ${removeBtn}
      </div>
      <div class="sc-label">${escapeHtml(sc.label)}</div>`;
    const tile = el.querySelector('.sc-tile');
    const letterEl = el.querySelector('.sc-letter');
    if (hostn) {
      const img = document.createElement('img'); img.className = 'sc-fav'; img.alt = '';
      img.addEventListener('load', () => { letterEl.style.display = 'none'; });
      img.addEventListener('error', () => { img.remove(); });
      img.src = `https://icons.duckduckgo.com/ip3/${hostn}.ico`;
      tile.appendChild(img);
    }
    tile.addEventListener('click', () => { if (active) guardedNavigate(active, sc.url); });
    if (!freq) el.querySelector('.sc-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const n = getShortcuts(); n.splice(idx, 1); saveShortcuts(n); renderShortcuts();
    });
    host.appendChild(el);
  });

  if (freq) return;
  if (addingShortcut) {
    const bar = document.createElement('div'); bar.className = 'sc-addbar';
    bar.innerHTML = `<input type="text" placeholder="https://hemsida.com" spellcheck="false" />`;
    const input = bar.querySelector('input');
    const commit = () => {
      const val = input.value.trim();
      if (val) {
        const url = normalizeUrl(val);
        let label = url; try { label = new URL(url).hostname.replace(/^www\./, ''); } catch {}
        const n = getShortcuts(); n.push({ label, url }); saveShortcuts(n);
      }
      addingShortcut = false; renderShortcuts();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { addingShortcut = false; renderShortcuts(); }
    });
    input.addEventListener('blur', () => { if (addingShortcut) { addingShortcut = false; renderShortcuts(); } });
    host.appendChild(bar);
    setTimeout(() => input.focus(), 20);
  } else {
    const add = document.createElement('div'); add.className = 'sc sc-add';
    add.innerHTML = `<div class="sc-tilewrap"><div class="sc-tile"><svg class="ic"><use href="#i-plus" /></svg></div></div><div class="sc-label">Lägg till</div>`;
    add.addEventListener('click', () => { addingShortcut = true; renderShortcuts(); });
    host.appendChild(add);
  }
}
// Startsidans statistikremsa ligger fast längst ned. I ett lågt fönster eller med många genvägar
// hamnade den ovanpå genvägarna → göm den när den skulle krocka (räknas om vid storleksändring).
function fitNtStats() {
  const st = newtabpage.querySelector('.nt-stats'), sc = $('shortcuts');
  if (!st || !sc || newtabpage.classList.contains('hidden')) return;
  st.style.visibility = sc.getBoundingClientRect().bottom + 12 > st.getBoundingClientRect().top ? 'hidden' : '';
}
try { const ro = new ResizeObserver(() => fitNtStats()); ro.observe(newtabpage); ro.observe($('shortcuts')); } catch {}
$('incog-search').addEventListener('keydown', (e) => { if (e.key === 'Enter' && active) guardedNavigate(active, $('incog-search').value); });

/* ── Adressfält-autocomplete (från historiken) ── */
const suggestEl = $('omni-suggest');
const sug = { items: [], sel: -1, input: null, anchor: null, open: false, comp: null };
function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
function bestCompletion(q) {
  q = (q || '').trim().toLowerCase();
  if (!q || /[\s/]/.test(q) || (active && active.incognito)) return null;
  const items = getHistory().slice().sort((a, b) => (b.n || 0) - (a.n || 0));
  for (const e of items) { const host = domainOf(e.url); if (host.startsWith(q) && host.length > q.length) return { host, url: 'https://' + host }; }
  return null;
}
function positionSug() {
  if (!sug.anchor) return;
  const r = sug.anchor.getBoundingClientRect();
  suggestEl.style.left = r.left + 'px'; suggestEl.style.top = (r.bottom + 5) + 'px'; suggestEl.style.width = r.width + 'px';
  try { if (window.AnpassaVerktyg) window.AnpassaVerktyg.forslag(suggestEl, r, sug.anchor); } catch {}   // Anpassa › verktyg: adressfältet längst ner → listan öppnas uppåt
}
// Brave-stil: en rad per förslag. Sökningar: det du skrivit normalt, resten fett.
// Sidor: "Titel - adress" med adressen i blått och dina ord feta.
function boldRest(text, typed) {
  const t = (typed || '').toLowerCase();
  if (t && text.toLowerCase().startsWith(t) && text.length > t.length) return escapeHtml(text.slice(0, t.length)) + '<b>' + escapeHtml(text.slice(t.length)) + '</b>';
  return escapeHtml(text);
}
function boldWords(text, typed) {
  const ord = (typed || '').toLowerCase().split(/\s+/).filter((w) => w.length > 0).sort((x, y) => y.length - x.length);
  if (!ord.length) return escapeHtml(text);
  const lc = text.toLowerCase(); const mark = new Array(text.length).fill(false);
  for (const w of ord) for (const i of wordStarts(lc, w)) for (let k = i; k < i + w.length; k++) mark[k] = true;
  let out = '', on = false;
  for (let i = 0; i < text.length; i++) { if (mark[i] !== on) { out += mark[i] ? '<b>' : '</b>'; on = mark[i]; } out += escapeHtml(text[i]); }
  return out + (on ? '</b>' : '');
}
// Var i texten ordet börjar som ett eget ord (som Brave: "y" matchar "YouTube", inte "mycket")
function wordStarts(lc, w) {
  const ut = []; let i = lc.indexOf(w);
  while (i >= 0) { if (i === 0 || !/[\p{L}\p{N}]/u.test(lc[i - 1])) ut.push(i); i = lc.indexOf(w, i + 1); }
  return ut;
}
function sugIcon(it) {
  if (it.kind === 'past') return '<svg class="ic ic-sm"><use href="#i-history"/></svg>';
  if (it.search) return '<svg class="ic ic-sm"><use href="#i-search"/></svg>';
  return it.favicon ? `<img src="${escapeHtml(it.favicon)}" data-glob="sm" alt="">` : '<svg class="ic ic-sm"><use href="#i-fav"/></svg>';
}
function renderSug() {
  suggestEl.innerHTML = '';
  const typed = sug.typed || '';
  sug.items.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'sug' + ((i === sug.sel || (sug.sel < 0 && i === 0)) ? ' sel' : '') + (it.search ? ' ssearch' : '');
    let txt;
    if (it.kind === 'snabbord' && window.AnpassaSok) txt = window.AnpassaSok.rad(it);   // Anpassa: "Sök på YouTube: katter"
    else if (it.kind === 'typed') txt = `<span class="stext">${escapeHtml(it.q)}</span><span class="sdim"> - ${escapeHtml(sug.engineLabel || '')} ${escapeHtml(t('Sök'))}</span>`;
    else if (it.search) txt = `<span class="stext">${boldRest(it.q, typed)}</span>`;
    else {
      const adr = pretty(it.url).replace(/^www\./, '');
      const titel = it.title && it.title !== it.url && it.title !== it.host ? it.title : '';
      txt = titel ? `<span class="stext">${boldWords(titel, typed)}</span><span class="sdim"> - </span><span class="slink">${boldWords(adr, typed)}</span>`
                  : `<span class="stext">${boldWords(adr, typed)}</span>`;
    }
    el.innerHTML = `<span class="sfav">${sugIcon(it)}</span><span class="sline">${txt}</span>`;
    el.addEventListener('mousedown', (ev) => { ev.preventDefault(); pickSug(it); });
    suggestEl.appendChild(el);
  });
}
// Vad du sökt på förut: frågan ur sökmotorernas adresser i historiken
const SOK_PARAM = [[/(^|\.)google\.[a-z.]+$/, '/search', 'q'], [/^search\.brave\.com$/, '/search', 'q'], [/^search\.adraze\.app$/, '', 'q'],
  [/^(html\.)?duckduckgo\.com$/, '', 'q'], [/^bing\.com$/, '/search', 'q'], [/^youtube\.com$/, '/results', 'search_query']];
function searchQueryOf(url) {
  try {
    const u = new URL(url); const host = u.hostname.replace(/^www\./, '');
    for (const [re, vag, param] of SOK_PARAM) if (re.test(host) && (!vag || u.pathname.startsWith(vag))) { const q = (u.searchParams.get(param) || '').trim(); return q || null; }
  } catch {}
  return null;
}
function localSug(query, comp) {
  const q = query.toLowerCase(), ord = q.split(/\s+/).filter(Boolean);
  const out = [];
  if (comp) {
    const h = getHistory().find((e) => domainOf(e.url) === comp.host) || {};
    out.push({ url: comp.url, host: comp.host, title: h.title || comp.host, favicon: h.favicon });
  }
  if (/^[a-z]+:\/\//i.test(query) || /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(query)) { if (!comp) out.push({ url: /^[a-z]+:\/\//i.test(query) ? query : 'https://' + query, host: domainOf('https://' + query.replace(/^[a-z]+:\/\//i, '')), title: '' }); }
  else out.push((window.AnpassaSok && window.AnpassaSok.forslag(query)) || { search: true, kind: 'typed', q: query });   // Anpassa: snabbord
  if (active && active.incognito) return out;                  // ingen historik i inkognito
  const hist = getHistory();
  const past = [], seenQ = new Set([q]);
  for (const e of hist) {
    const sq = searchQueryOf(e.url); if (!sq) continue;
    const l = sq.toLowerCase(); if (seenQ.has(l) || !l.startsWith(q)) continue;
    seenQ.add(l); past.push({ search: true, kind: 'past', q: sq }); if (past.length >= 3) break;
  }
  const sidor = [], seenU = new Set(comp ? [comp.host] : []);
  for (const e of hist.slice().sort((x, y) => (y.n || 0) - (x.n || 0))) {
    if (searchQueryOf(e.url)) continue;
    const hay = ((e.title || '') + ' ' + pretty(e.url)).toLowerCase();
    if (!ord.every((w) => wordStarts(hay, w).length)) continue;
    const key = e.url.replace(/[#?].*$/, '').replace(/\/$/, '');
    if (seenU.has(key) || (comp && domainOf(e.url) === comp.host && /^https?:\/\/[^/]+\/?$/i.test(e.url))) continue;   // sajten står redan överst
    seenU.add(key); sidor.push({ url: e.url, host: domainOf(e.url), title: e.title, favicon: e.favicon }); if (sidor.length >= 3) break;
  }
  sug.pastQ = seenQ;
  return out.concat(past, sidor);
}
function openSug() { if (!sug.open) { sug.open = true; window.view.hide(); } positionSug(); suggestEl.classList.add('on'); }
function closeSug(restore) { suggestEl.classList.remove('on'); sug.items = []; sug.sel = -1; if (sug.open) { sug.open = false; if (restore !== false) showActiveTab(); } }
function topSitesForSug() {
  if (active && active.incognito) return [];                     // ingen historik i inkognito
  const seen = new Set(); const out = [];
  for (const e of getHistory().slice().sort((a, b) => (b.n || 0) - (a.n || 0))) {
    const host = domainOf(e.url); if (!host || seen.has(host)) continue;
    seen.add(host); out.push({ url: e.url, host, title: e.title || host, favicon: e.favicon, n: e.n || 0 });
    if (out.length >= 8) break;
  }
  return out;
}
let sugSeq = 0, sugTimer = null;
function updateSug(q) {
  const inp = sug.input; if (!inp) return;
  const query = (q || '').trim();
  sug.typed = query;
  sug.engineLabel = (active && active.incognito) ? INCOG_ENGINE.label : motorEtikett();
  const lokala = query ? localSug(query, sug.comp) : topSitesForSug();   // tomt fält → dina mest besökta sajter
  sug.items = lokala;
  if (sug.items.length && document.activeElement === inp) { renderSug(); openSug(); } else closeSug();
  // Förslag från sökmotorn läggs sist. Inte för adresser.
  clearTimeout(sugTimer);
  const incog = !!(active && active.incognito);
  if (!query || /^[a-z]+:\/\//i.test(query) || /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(query)) return;
  const motor = window.AnpassaSok ? window.AnpassaSok.forslagsMotor(query, searchEngine) : searchEngine;   // Anpassa: null = inga förslag (snabbord)
  if (!motor) return;
  const seq = ++sugSeq;
  sugTimer = setTimeout(async () => {
    let list = [];
    if (!incog) { try { list = await window.view.suggest(query, motor); } catch { list = []; } }   // inkognito: inga förslag hämtas – det du skriver lämnar inte datorn förrän du söker
    if (seq !== sugSeq || document.activeElement !== inp || inp.value.slice(0, query.length).trim() !== query) return;   // gammalt svar → släng
    const seen = sug.pastQ || new Set([query.toLowerCase()]);
    const extra = list.filter((t) => t && !seen.has(t.toLowerCase())).slice(0, Math.max(0, 9 - lokala.length)).map((t) => ({ search: true, q: t }));
    sug.items = lokala.concat(extra);
    if (sug.items.length) { renderSug(); openSug(); }
  }, 120);
}
function pickSug(it) { closeSug(false); if (!active) return; if (it.search) { sug.input && (sug.input.value = it.q); guardedNavigate(active, it.q); } else guardedNavigate(active, it.url); }
function attachAutocomplete(inp, anchor) {
  inp.addEventListener('focus', () => {
    sug.input = inp; sug.anchor = anchor; sug.sel = -1;
    if (!inp.value.trim()) updateSug('');                        // klick i tomt sökfält → visa mest besökta
  });
  inp.addEventListener('input', (e) => {
    const typed = inp.value;                                // vad användaren faktiskt skrivit (t.ex. "ver")
    sug.input = inp; sug.anchor = anchor; sug.sel = -1;
    const forward = e.inputType && e.inputType.indexOf('insert') === 0;
    if (forward) {
      const c = bestCompletion(typed);
      if (c) { inp.value = typed + c.host.slice(typed.length); inp.setSelectionRange(typed.length, inp.value.length); sug.comp = c; }
      else sug.comp = null;
    } else sug.comp = null;
    updateSug(typed);
  });
  inp.addEventListener('keydown', (e) => {
    const openList = suggestEl.classList.contains('on') && sug.items.length;
    if (openList && e.key === 'ArrowDown') { e.preventDefault(); sug.sel = (sug.sel + 1) % sug.items.length; renderSug(); return; }
    if (openList && e.key === 'ArrowUp') { e.preventDefault(); sug.sel = (sug.sel - 1 + sug.items.length) % sug.items.length; renderSug(); return; }
    if (openList && e.key === 'Escape') { e.preventDefault(); closeSug(); inp.value = (active && active.url) ? pretty(active.url) : ''; return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (openList && sug.sel >= 0) { pickSug(sug.items[sug.sel]); return; }
      if (openList && sug.items[0] && !sug.items[0].search && sug.comp && inp.value.toLowerCase() === sug.comp.host) { pickSug(sug.items[0]); return; }
      if (sug.comp && inp.value.toLowerCase() === sug.comp.host) { closeSug(false); if (active) guardedNavigate(active, sug.comp.url); return; }
      closeSug(false); if (active) guardedNavigate(active, inp.value);
    }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) closeSug(); }, 120));
}
attachAutocomplete(addressInput, $('omnibox'));
attachAutocomplete($('nt-search'), $('nt-search'));
window.addEventListener('resize', () => { if (sug.open) positionSug(); });

/* ── Bakgrundsval ── */
const CURATED_BG = [10, 1018, 1039, 1043, 1015, 1057, 1061, 1069, 29, 164, 180, 225]
  .map((id) => ({ thumb: `https://picsum.photos/id/${id}/320/200`, full: `https://picsum.photos/id/${id}/1920/1080` }));
// 'slump' = ny Pexels-bild för varje ny flik (standard). Listan byggs av tools/hamta-bakgrunder.py
// och bilderna laddas direkt från images.pexels.com – ingen API-nyckel i appen.
try { if (!localStorage.getItem('adraze-bg-slump-v1')) { localStorage.setItem('skoll-bg', 'slump'); localStorage.setItem('adraze-bg-slump-v1', '1'); } } catch {}
function bgMode() { let bg = null; try { bg = localStorage.getItem('skoll-bg'); } catch {} return bg || 'slump'; }
let bgLista = null, bgLaddar = null, bgNasta = null;
function laddaBgLista() {
  if (bgLista) return Promise.resolve(bgLista);
  if (!bgLaddar) bgLaddar = fetch('bakgrunder.json').then((r) => r.json()).then((l) => (bgLista = Array.isArray(l) ? l : [])).catch(() => (bgLista = []));
  return bgLaddar;
}
function bgUrl(p) {
  const w = Math.min(3840, Math.round((screen.width || 1920) * (window.devicePixelRatio || 1) / 160) * 160);
  return 'https://images.pexels.com/photos/' + p[0] + '/' + p[1] + '?auto=compress&cs=tinysrgb&w=' + w;
}
// Slumpa en bild som inte visats nyligen och förladda den, så nästa nya flik får den direkt.
function slumpaBg() {
  if (!bgLista || !bgLista.length) return null;
  let sett = []; try { sett = JSON.parse(localStorage.getItem('adraze-bg-sett') || '[]'); } catch {}
  let p = null;
  for (let i = 0; i < 20; i++) { p = bgLista[Math.floor(Math.random() * bgLista.length)]; if (!sett.includes(p[0])) break; }
  sett.push(p[0]); if (sett.length > 500) sett = sett.slice(-500);
  try { localStorage.setItem('adraze-bg-sett', JSON.stringify(sett)); } catch {}
  const bg = { url: bgUrl(p), credit: 'Foto: ' + p[2] + ' · Pexels', farg: p[3] };
  const img = new Image(); img.onload = () => { bg.klar = true; }; img.src = bg.url;
  return bg;
}
function visaBg(bg) {
  const el = $('nt-bg');
  el.style.backgroundColor = bg.farg || '';
  const satt = () => { if (active && active.bg === bg) { el.style.backgroundImage = `url("${bg.url}")`; $('nt-credit').textContent = bg.credit; } };
  if (bg.klar) { satt(); return; }
  el.style.backgroundImage = 'none'; $('nt-credit').textContent = '';
  const img = new Image(); img.onload = () => { bg.klar = true; satt(); }; img.src = bg.url;
}
// Anropas när en flik visar startsidan: fliken behåller sin bild, en ny flik får en ny.
async function tabBg(tab) {
  if (!tab || tab.incognito || bgMode() !== 'slump') return;
  try { if (window.AnpassaStartsida && window.AnpassaStartsida.utanBild()) return; } catch {}   // Anpassa/startsida: bilden är avslagen → hämta ingen
  if (!tab.bg) {
    await laddaBgLista();
    if (tab.bg || active !== tab) return;
    tab.bg = bgNasta || slumpaBg(); bgNasta = slumpaBg();
    if (!tab.bg) return;
  }
  if (active === tab) visaBg(tab.bg);
}
function applyStoredBg() {
  try { if (window.AnpassaStartsida && window.AnpassaStartsida.utanBild()) return; } catch {}   // Anpassa/startsida: bilden är avslagen → hämta ingen
  const bg = bgMode();
  if (bg === 'slump') { tabBg(active); return; }
  $('nt-bg').style.backgroundColor = '';
  if (bg === 'daily') { loadDailyImage(); return; }
  $('nt-bg').style.backgroundImage = `url("${bg}")`;
  $('nt-credit').textContent = '';
}
function setBg(val) {
  try { localStorage.setItem('skoll-bg', val); } catch {}
  $('nt-credit').textContent = '';
  applyStoredBg();
}
function renderBgGrid() {
  const g = $('bg-grid'); g.innerHTML = '';
  CURATED_BG.forEach((b) => {
    const el = document.createElement('button'); el.className = 'bg-thumb';
    el.style.backgroundImage = `url("${b.thumb}")`;
    el.addEventListener('click', () => { setBg(b.full); closeBgPick(); });
    g.appendChild(el);
  });
}
function openBgPick() { renderBgGrid(); $('bgpick').classList.remove('hidden'); }
function closeBgPick() { $('bgpick').classList.add('hidden'); }
$('settings-bg-btn').addEventListener('click', openBgPick);
$('bgpick-close').addEventListener('click', closeBgPick);
$('bg-daily').addEventListener('click', () => { setBg('daily'); closeBgPick(); });
$('bg-slump').addEventListener('click', () => { if (active) active.bg = null; setBg('slump'); closeBgPick(); });
$('bg-upload-btn').addEventListener('click', () => $('bg-file').click());
$('bg-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 1920; let w = img.width, h = img.height;
      if (w > max) { h = Math.round(h * max / w); w = max; }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try { setBg(c.toDataURL('image/jpeg', 0.85)); } catch {}
      closeBgPick();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
});

/* ── Huvudmeny + toast ── */
let toastTimer = null;
function showToast(msg) {
  const el = $('apptoast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}
$('menu-btn').addEventListener('click', () => window.view.openMenu());
window.view.onToast((m) => showToast(m));
window.view.onUpdateReady((v) => { showUpdateBanner(v); refreshUpdatePanel(false); });
// ── Webbinställningar: Vid start, bokmärkesfält, teckenstorlek, endast HTTPS, säker DNS, rensa data, behörigheter, nedladdningar ──
const tw = (k) => (typeof window.t === 'function') ? window.t(k) : k;
const PERM_LABEL = { camera: 'Kamera', microphone: 'Mikrofon', geolocation: 'Plats', notifications: 'Notiser', 'clipboard-read': 'Läsa urklipp', midi: 'MIDI-enheter', external: 'Öppna ett annat program' };
let webbPrefs = null;
async function refreshWebbPanel() {
  try { webbPrefs = await window.view.webbGet(); } catch { webbPrefs = null; }
  // Vid start
  document.querySelectorAll('#start-opts .engine-opt').forEach((b) => b.classList.toggle('on', b.dataset.start === startMode));
  $('start-url-wrap').hidden = startMode !== 'sida'; $('start-url').value = startUrl;
  $('tgl-bmbar').checked = bmbarOn;
  if (!webbPrefs) return;
  $('sel-font').value = String(webbPrefs.fontSize);
  if (!$('sel-font').value) $('sel-font').value = '16';
  $('tgl-https').checked = !!webbPrefs.httpsOnly;
  if ($('tgl-falksida')) $('tgl-falksida').checked = webbPrefs.falkSida !== false;
  if ($('tgl-falksamtycke')) $('tgl-falksamtycke').checked = !!webbPrefs.falkSamtycke;
  $('sel-dns').value = webbPrefs.dns;
  $('dl-dir').textContent = webbPrefs.downloadDir; $('dl-dir-reset').hidden = !webbPrefs.downloadDirCustom;
  $('tgl-askdl').checked = !!webbPrefs.askDownload;
  renderPerms();
}
function seg(opts, val, on) {
  const w = document.createElement('div'); w.className = 'seg flex-none';
  for (const [v, l] of opts) { const b = document.createElement('button'); b.className = 'seg-btn' + (v === val ? ' on' : ''); b.textContent = tw(l); b.addEventListener('click', () => { w.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x === b)); on(v); }); w.appendChild(b); }
  return w;
}
function renderPerms() {
  const d = $('perm-defaults'); d.innerHTML = '';
  for (const k of ['camera', 'microphone', 'geolocation', 'notifications']) {
    const row = document.createElement('div'); row.className = 'set-row';
    row.innerHTML = '<div class="set-txt"><div class="set-title">' + escapeHtml(tw(PERM_LABEL[k])) + '</div></div>';
    row.appendChild(seg([['ask', 'Fråga först'], ['block', 'Blockera']], webbPrefs.permDefaults[k] === 'block' ? 'block' : 'ask', (v) => window.view.webbSet('permDefault', { kind: k, value: v })));
    d.appendChild(row);
  }
  const list = $('perm-sites'); list.innerHTML = '';
  const sites = Object.keys(webbPrefs.perms || {}).sort();
  if (!sites.length) { list.innerHTML = '<p class="perm-none">' + escapeHtml(tw('Inga sajter har frågat än. När du tillåter eller blockerar något hamnar det här.')) + '</p>'; return; }
  for (const o of sites) {
    const box = document.createElement('div'); box.className = 'perm-site';
    const host = o.replace(/^https?:\/\//, '');
    box.innerHTML = '<div class="perm-head"><b>' + escapeHtml(host) + '</b><button type="button">' + escapeHtml(tw('Glöm sajten')) + '</button></div>';
    box.querySelector('.perm-head button').addEventListener('click', async () => { await window.view.webbSet('permForget', o); refreshWebbPanel(); });
    for (const [k, v] of Object.entries(webbPrefs.perms[o])) {
      const line = document.createElement('div'); line.className = 'perm-line';
      line.innerHTML = '<span>' + escapeHtml(tw(PERM_LABEL[k] || k)) + '</span>';
      line.appendChild(seg([['allow', 'Tillåt'], ['block', 'Blockera']], v, (nv) => window.view.webbSet('perm', { origin: o, kind: k, value: nv })));
      box.appendChild(line);
    }
    list.appendChild(box);
  }
}
document.querySelectorAll('#start-opts .engine-opt').forEach((b) => b.addEventListener('click', () => {
  startMode = b.dataset.start; try { localStorage.setItem('adraze-start', startMode); } catch {}
  refreshWebbPanel(); if (startMode === 'sida') $('start-url').focus();
}));
$('start-url').addEventListener('change', () => { startUrl = $('start-url').value.trim(); try { localStorage.setItem('adraze-start-url', startUrl); } catch {} });
$('start-url-cur').addEventListener('click', () => {
  const t = tabs.slice().reverse().find((x) => x.url && /^https?:/i.test(x.url) && !x.incognito);
  if (!t) { showToast(tw('Öppna sidan i en flik först.')); return; }
  startUrl = t.url; $('start-url').value = startUrl; try { localStorage.setItem('adraze-start-url', startUrl); } catch {}
});
$('tgl-bmbar').addEventListener('change', (e) => { bmbarOn = e.target.checked; try { localStorage.setItem('adraze-bmbar', bmbarOn ? '1' : '0'); } catch {} renderBookmarkBar(); });
$('sel-font').addEventListener('change', (e) => { window.view.webbSet('fontSize', e.target.value); showToast(tw('Ny teckenstorlek gäller flikar du öppnar från och med nu.')); });
$('tgl-https').addEventListener('change', (e) => window.view.webbSet('httpsOnly', e.target.checked));
$('tgl-falksida').addEventListener('change', (e) => window.view.webbSet('falkSida', e.target.checked));
$('tgl-falksamtycke').addEventListener('change', (e) => window.view.webbSet('falkSamtycke', e.target.checked));
$('sel-dns').addEventListener('change', (e) => window.view.webbSet('dns', e.target.value));
$('tgl-askdl').addEventListener('change', (e) => window.view.webbSet('askDownload', e.target.checked));
$('dl-dir-btn').addEventListener('click', async () => { const d = await window.view.webbPickDir(); if (d) refreshWebbPanel(); });
$('dl-dir-reset').addEventListener('click', async () => { await window.view.webbSet('downloadDir', ''); refreshWebbPanel(); });
// Rensa webbdata
function openClearBox() { $('clear-box').hidden = false; $('clear-hist').disabled = historyLocked(); if (historyLocked()) $('clear-hist').checked = false; $('clear-box').scrollIntoView({ block: 'nearest' }); }
$('clear-open').addEventListener('click', () => { if ($('clear-box').hidden) openClearBox(); else $('clear-box').hidden = true; });
$('clear-cancel').addEventListener('click', () => { $('clear-box').hidden = true; });
$('clear-go').addEventListener('click', async () => {
  const hist = $('clear-hist').checked && !historyLocked(), cookies = $('clear-cookies').checked, cache = $('clear-cache').checked;
  if (!hist && !cookies && !cache) return;
  const btn = $('clear-go'); btn.disabled = true;
  if (hist) {
    const ms = parseInt($('clear-range').value, 10) || 0;
    if (!ms) clearHistory(); else { const cut = Date.now() - ms; saveHistory(getHistory().filter((e) => (e.t || 0) < cut)); }
    if (typeof historyOpen !== 'undefined' && historyOpen) renderHistory();
  }
  if (cookies || cache) {
    // Skalets egna inställningar ligger i samma lagring som webbsidornas: spara undan och lägg tillbaka
    const keep = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); keep[k] = localStorage.getItem(k); } } catch {}
    try { await window.view.webbClear({ cookies, cache }); } catch {}
    try { for (const k of Object.keys(keep)) if (localStorage.getItem(k) !== keep[k]) localStorage.setItem(k, keep[k]); } catch {}
  }
  btn.disabled = false; $('clear-box').hidden = true;
  showToast(tw('Webbdata rensad.'));
});
// Behörighetsfrågan: visas för fliken som frågade, köas om den inte är aktiv
const permQ = [];
let permCur = null;
function permText(q) {
  const host = q.origin.replace(/^https?:\/\//, '');
  if (q.kinds.length === 1 && q.kinds[0] === 'external') return host + ' ' + tw('vill öppna ett annat program på datorn');
  const names = q.kinds.map((k) => tw(PERM_LABEL[k] || k).toLowerCase());
  const what = names.length > 1 ? names.slice(0, -1).join(', ') + ' ' + tw('och') + ' ' + names[names.length - 1] : names[0];
  return host + ' ' + tw('vill använda') + ' ' + what;
}
function permNext() {
  if (permCur) return;
  const i = permQ.findIndex((q) => active && q.tabId === active.id);
  if (i < 0) return;
  permCur = permQ.splice(i, 1)[0];
  $('permbar-text').textContent = permText(permCur);
  $('permbar-remember').checked = true;
  $('permbar').style.display = 'flex'; window.view.insetTop(56);
}
// Byter man flik läggs frågan tillbaka i kön och den nya flikens fråga (om någon) visas
function permSwitched() {
  if (permCur && (!active || permCur.tabId !== active.id)) { permQ.unshift(permCur); permCur = null; $('permbar').style.display = 'none'; window.view.insetTop(0); }
  permNext();
}
function permAnswer(allow) {
  if (!permCur) return;
  window.view.permAnswer(permCur.id, allow, $('permbar-remember').checked);
  permCur = null; $('permbar').style.display = 'none'; window.view.insetTop(0); permNext();
}
$('permbar-allow').addEventListener('click', () => permAnswer(true));
$('permbar-block').addEventListener('click', () => permAnswer(false));
window.view.onPermAsk((q) => { permQ.push(q); permNext(); });
window.view.onPermCancel((id) => {
  const i = permQ.findIndex((q) => q.id === id); if (i >= 0) permQ.splice(i, 1);
  if (permCur && permCur.id === id) { permCur = null; $('permbar').style.display = 'none'; window.view.insetTop(0); permNext(); }
});
// Endast HTTPS: sajten saknar säker anslutning → samma skärm som farliga sidor, men med vår egen text
window.view.onHttpsFailed((id, url) => {
  const t = byId(id); if (!t) return;
  let host = ''; try { host = new URL(url).hostname; } catch {}
  t.url = url; if (t === active) addressInput.value = pretty(url);
  showDanger(t, url, { status: 'warn', title: tw('Sidan har ingen säker anslutning'), sub: tw('Sidan går bara att öppna utan kryptering.'), reasons: [
    tw('Du har Endast HTTPS på, men') + ' ' + host + ' ' + tw('svarar inte säkert.'),
    tw('Det du skickar till sidan, till exempel lösenord, kan läsas av andra på nätverket.')] });
  pending.httpHost = host;
});

// ── Läsläge: bokikonen i adressfältet syns när sidan har en artikel ──
function updateReaderBtn() { const b = $('reader-btn'); if (!b) return; b.hidden = !(active && active.url && (active.readerable || active.readerOn)); b.classList.toggle('on', !!(active && active.readerOn)); b.title = (active && active.readerOn) ? tw('Avsluta läsläget') : tw('Läsläge'); }
window.view.onReader((id, ok, on) => { const t = byId(id); if (!t) return; t.readerable = ok; t.readerOn = !!on; if (t === active) updateReaderBtn(); });
function updatePipBtn() { const b = $('pip-btn'); if (!b) return; b.hidden = !(active && active.url && (active.pipHas || active.pipOn)); b.classList.toggle('on', !!(active && active.pipOn)); b.title = (active && active.pipOn) ? tw('Ta tillbaka videon') : tw('Bild-i-bild') + ' (Ctrl+Shift+P)'; }
window.view.onPip((id, has, on) => { const t = byId(id); if (!t) return; t.pipHas = has; t.pipOn = on; if (t === active) updatePipBtn(); });
$('pip-btn').addEventListener('click', () => { if (active) window.view.pip(active.id); });
function updateFalkGranskar() { const b = $('falk-granskar'); if (b) b.hidden = !(active && active.falkGranskar); }
window.view.onFalkGranskar((id, on) => { const t = byId(id); if (!t) return; t.falkGranskar = on; if (t === active) updateFalkGranskar(); });
$('reader-btn').addEventListener('click', () => { if (active) window.view.reader(active.id, document.documentElement.dataset.theme || 'light'); });

// ── Fäst flik och ljud av ──
function setPinned(tab, on) {
  if (!tab) return;
  tab.pinned = !!on;
  const i = tabs.indexOf(tab); if (i < 0) return;
  tabs.splice(i, 1);
  const lastPin = tabs.reduce((n, t, j) => (t.pinned ? j + 1 : n), 0);   // fästa flikar ligger först
  tabs.splice(on ? lastPin : lastPin, 0, tab);
  renderTabs(); saveOpenTabs();
}
function setMuted(tab, on) { if (!tab) return; tab.muted = !!on; window.view.mute(tab.id, tab.muted); renderTabs(); }
function tabMenu(tab) {
  window.view.tabMenu({ id: tab.id, pinned: !!tab.pinned, muted: !!tab.muted, hasUrl: !!tab.url, count: tabs.length, canReopen: closedTabs.length > 0,
    ...(window.AnpFlikar ? AnpFlikar.menyInfo(tab) : {}) });   // Anpassa: flikens grupp + fönstrets grupper till menyn
}
window.view.onTabAudio((id, audible) => { const t = byId(id); if (t && t.audible !== audible) { t.audible = audible; renderTabs(); } });
window.view.onTabAction((action, id) => {
  const t = byId(id); if (!t && action !== 'reopen') return;
  if (action === 'pin') setPinned(t, !t.pinned);
  else if (action === 'mute') setMuted(t, !t.muted);
  else if (action === 'close') closeTab(t);
  else if (action === 'close-others') tabs.filter((x) => x !== t && !x.pinned).forEach((x) => closeTab(x));
  else if (action === 'close-right') tabs.slice(tabs.indexOf(t) + 1).filter((x) => !x.pinned).forEach((x) => closeTab(x));
  else if (action === 'duplicate') { if (t.url) { const n = createTab(t.url); switchTab(n); } }
  else if (action === 'reload') { switchTab(t); window.view.reload && window.view.reload(t.id); }
  else if (action === 'reopen') reopenClosedTab();
});

// ── Kortkommandon som huvudprocessen skickar hit ──
window.view.onShortcut((name, arg) => {
  if (name === 'reopen-tab') reopenClosedTab();
  else if (name === 'switch-tab') {
    if (tabs.length < 2 || !active) return;
    const i = tabs.indexOf(active);
    switchTab(tabs[(i + arg + tabs.length) % tabs.length]);
  } else if (name === 'tab-index') {
    const t = arg < 0 ? tabs[tabs.length - 1] : tabs[arg];
    if (t) switchTab(t);
  } else if (name === 'bookmark') {
    if (active && active.url) $('bm-star').click();
  } else if (name === 'toggle-bmbar') {
    bmbarOn = !bmbarOn; try { localStorage.setItem('adraze-bmbar', bmbarOn ? '1' : '0'); } catch {}
    renderBookmarkBar(); if ($('tgl-bmbar')) $('tgl-bmbar').checked = bmbarOn;
  }
});
function reopenClosedTab() {
  const c = closedTabs.pop(); if (!c) return;
  const t = createTab(c.url);
  const i = tabs.indexOf(t);
  if (i >= 0 && c.index < tabs.length - 1) { tabs.splice(i, 1); tabs.splice(Math.min(c.index, tabs.length), 0, t); }
  if (c.pinned) setPinned(t, true);
  switchTab(t); saveOpenTabs();
}

// Inställningar → Programuppdatering
let updState = null, updWhen = 0, updSenare = '';
async function refreshUpdatePanel(force) {
  if (!window.view.updateStatus) return;
  const tt = (k) => (typeof window.t === 'function') ? window.t(k) : k;
  const card = $('upd-card'); if (!card) return;
  if (force) { card.dataset.state = 'checking'; $('upd-title').textContent = tt('Söker efter uppdateringar…'); $('upd-desc').textContent = ''; $('upd-check').disabled = true; }
  let st; try { st = await window.view.updateStatus(force); } catch { st = null; }
  $('upd-check').disabled = false;
  if (!st) { card.dataset.state = 'error'; $('upd-title').textContent = tt('Kunde inte söka efter uppdateringar'); $('upd-desc').textContent = tt('Kolla internetanslutningen och försök igen.'); return; }
  updState = st; updWhen = Date.now();
  // Hämtad men notisen missad (t.ex. hämtningen blev klar innan fönstret laddat) → visa den nu
  if (st.ready && st.readyVersion !== updSenare && !document.getElementById('update-banner')) showUpdateBanner(st.readyVersion);
  $('upd-cur').textContent = st.current; $('upd-latest').textContent = st.latest;
  $('upd-when').textContent = tt('Just nu');
  const om = $('om-version'); if (om) om.textContent = tt('Version') + ' ' + st.current;
  $('upd-dot').hidden = !st.available;
  const notes = $('upd-notes');
  $('upd-install').hidden = true; $('upd-download').hidden = true;
  if (st.available) {
    card.dataset.state = 'new';
    $('upd-title').textContent = tt('En ny version finns') + ': AdRaze ' + st.latest;
    if (st.ready) { $('upd-desc').textContent = tt('Den är redan hämtad. Starta om så är du klar.'); $('upd-install').hidden = false; }
    else if (st.auto) { $('upd-desc').textContent = tt('Den hämtas i bakgrunden. Starta om när den är klar.'); $('upd-install').hidden = false; }
    else { $('upd-desc').textContent = tt('Ladda ner den nya versionen och ersätt den du har.'); $('upd-download').hidden = false; }
    if (st.notes) { notes.hidden = false; notes.innerHTML = '<b>' + escapeHtml(tt('Nytt i') + ' ' + st.latest) + '</b>' + escapeHtml(st.notes); } else notes.hidden = true;
  } else {
    card.dataset.state = 'ok';
    $('upd-title').textContent = tt('AdRaze är uppdaterad');
    $('upd-desc').textContent = tt('Du har den senaste versionen') + ' (' + st.current + ').';
    notes.hidden = true;
  }
}
$('upd-download')?.addEventListener('click', () => { try { closeSettings(); } catch {} createTab('https://github.com/northcrafto/adraze-dl/releases/latest'); });
$('upd-check')?.addEventListener('click', () => refreshUpdatePanel(true));
$('upd-install')?.addEventListener('click', () => { const b = $('upd-install'); b.disabled = true; b.textContent = (typeof window.t === 'function' ? window.t('Startar om…') : 'Startar om…'); window.view.installUpdate(); });
setInterval(() => { if (updWhen && $('upd-when')) { const m = Math.round((Date.now() - updWhen) / 60000); const tt = (k) => (typeof window.t === 'function') ? window.t(k) : k; $('upd-when').textContent = m < 1 ? tt('Just nu') : (m + ' ' + tt('min sedan')); } }, 30000);
setTimeout(() => refreshUpdatePanel(false), 7000);
setInterval(() => refreshUpdatePanel(false), 30 * 60 * 1000);
/* Gemensamt notiskort längst ner. Returnerar elementet; .stang() tar bort det med en liten animation. */
function visaNotis({ id, ikon, titel, under, knapp, sek, onKnapp, onSek, onStang }) {
  const gammal = document.getElementById(id); if (gammal) gammal.remove();
  const el = document.createElement('div'); el.id = id; el.className = 'notis'; el.setAttribute('role', 'status');
  el.innerHTML = '<div class="notis-titel"></div>' + (under ? '<p class="notis-under"></p>' : '')
    + '<div class="notis-rad">' + (sek ? '<button class="notis-sek"></button>' : '') + '<button class="notis-knapp"></button></div>';
  el.querySelector('.notis-titel').textContent = titel;
  if (under) el.querySelector('.notis-under').textContent = under;
  const kn = el.querySelector('.notis-knapp');
  if (ikon) { const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use'); sv.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#' + ikon); sv.appendChild(u); kn.appendChild(sv); }
  const kt = document.createElement('span'); kt.className = 'notis-kt'; kt.textContent = knapp; kn.appendChild(kt);
  if (sek) el.querySelector('.notis-sek').textContent = sek;
  el.stang = () => { if (!el.isConnected) return; el.classList.add('ut'); setTimeout(() => el.remove(), 260); };
  el.querySelector('.notis-knapp').addEventListener('click', () => onKnapp && onKnapp(el));
  if (sek) el.querySelector('.notis-sek').addEventListener('click', () => { if (onSek) onSek(el); el.stang(); });
  document.body.appendChild(el);
  return el;
}
function showUpdateBanner(version) {
  // Fanns redan en banner (äldre version hämtad)? Bygg om den med den nya versionen,
  // och behåll "Startar om…" om användaren redan tryckt.
  const prev = document.getElementById('update-banner');
  const busy = !!(prev && prev.dataset.busy);
  const tt = (k) => (typeof window.t === 'function') ? window.t(k) : k;
  const starta = (el) => { el.dataset.busy = '1'; const b = el.querySelector('.notis-knapp'); (b.querySelector('.notis-kt') || b).textContent = tt('Startar om…'); b.disabled = true; };
  const bar = visaNotis({
    id: 'update-banner', ikon: 'i-update',
    titel: tt('Uppdatera AdRaze?'),
    under: tt('Version') + (version ? ' ' + version : '') + ' ' + tt('är klar. Starta om, så kommer dina flikar tillbaka.'),
    knapp: tt('Starta om'), sek: tt('Senare'),
    onKnapp: (el) => { starta(el); try { window.view.installUpdate(); } catch {} },
    onSek: () => { updSenare = version || ''; },
  });
  if (busy) starta(bar);
}
// Nudge: om AdRaze inte är standardwebbläsare, visa en banner (som uppdateringsnotisen).
async function maybeShowDefaultBanner() {
  try {
    if (windowIncognito) return;
    const intro = $('hxintro');   // första start: vänta tills introt är borta, annars hamnar notisen ovanpå det
    if (intro && intro.style.display === 'flex') { setTimeout(maybeShowDefaultBanner, 2500); return; }
    if (document.getElementById('flytt-banner')) { setTimeout(maybeShowDefaultBanner, 4000); return; }   // flytt-erbjudandet först
    const st = await window.defaultBrowser.state();
    if (st && st.default) return;                                   // redan standard → visa inte
    const snooze = parseInt(localStorage.getItem('skoll-defbrowser-snooze') || '0', 10);
    if (Date.now() < snooze) return;                                // nyligen "Senare"
    showDefaultBrowserBanner();
  } catch {}
}
function showDefaultBrowserBanner() {
  if (document.getElementById('defbrowser-banner')) return;
  visaNotis({
    id: 'defbrowser-banner', ikon: 'i-shield-check',
    titel: tw('Gör AdRaze till din huvudwebbläsare?'),
    under: tw('Då öppnas länkar från andra program utan reklam.'),
    knapp: tw('Ja, gör det'), sek: tw('Senare'),
    onKnapp: async (el) => {
      const b = el.querySelector('.notis-knapp'); b.textContent = tw('Sätter…'); b.disabled = true;
      let r; try { r = await window.defaultBrowser.set(); } catch { r = null; }
      if (r && r.ok) { showToast(tw('AdRaze är nu din huvudwebbläsare')); el.stang(); }
      else if (r && r.manual) { showToast(tw('Välj AdRaze i systeminställningarna som öppnades.')); el.stang(); }
      else { b.textContent = tw('Ja, gör det'); b.disabled = false; showToast(tw('Kunde inte sätta AdRaze som standard.')); }
    },
    onSek: () => { try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 7 * 24 * 3600 * 1000)); } catch {} },
  });
}
window.view.onOpenSettings((cat) => { openSettings(); if (cat === 'rensa') { showSettingsCat('integritet'); openClearBox(); } else if (cat) showSettingsCat(cat); });
window.view.onMenuZoom((dir) => { if (active && active.url) window.view.zoom(active.id, dir); });
window.view.onMenuPrint(() => { if (active && active.url) window.view.print(active.id); });
window.view.onCloseTab(() => { if (active) closeTab(active); });
window.view.onCloseTabId((id) => { const t = tabs.find((x) => x.id === id); if (t) closeTab(t); });
window.view.onFocusAddress(() => { addressInput.focus(); addressInput.select(); });
// Klick/fokus i adressfältet → visa HELA URL:en (https://…), markerad så den är lätt att ändra.
addressInput.addEventListener('focus', () => {
  if (active && active.url) { addressInput.value = active.url; setTimeout(() => { try { addressInput.select(); } catch {} }, 0); }
});
// Lämnar man fältet utan att navigera → tillbaka till den snygga versionen (utan https://).
addressInput.addEventListener('blur', () => {
  if (active) addressInput.value = active.url ? pretty(active.url) : '';
});
window.view.onClearData(() => { const kept = !clearHistory(); if (typeof historyOpen !== 'undefined' && historyOpen) renderHistory(); showToast(kept ? 'Surfdata rensad – historiken sparas åt dina föräldrar.' : 'Surfdata rensad.'); });

/* ── Historik ── */
/* Historiken är PER KONTO (som cookies): 'skoll-history' = utloggad, 'skoll-history:<konto>' = inloggad.
   Byter man konto utan att stänga webbläsaren ska förra kontots historik inte hänga kvar. */
function histKey() { try { const k = (typeof account !== 'undefined' && account) ? accountKey(account) : null; return k ? 'skoll-history:' + k : 'skoll-history'; } catch { return 'skoll-history'; } }
function getHistory() { try { const h = JSON.parse(localStorage.getItem(histKey())); return Array.isArray(h) ? h : []; } catch { return []; } }
function saveHistory(h) { try { localStorage.setItem(histKey(), JSON.stringify(h)); } catch {} }
/* Engångsflytt: den gamla globala historiken tillhör kontot som är inloggat vid första start efter uppdateringen. */
function migrateHistoryToAccount() {
  try {
    if (localStorage.getItem('skoll-hist-per-account') === '1') return;
    if (typeof account === 'undefined' || !account) return;
    const k = histKey(); if (k === 'skoll-history') return;
    const old = localStorage.getItem('skoll-history');
    if (old && !localStorage.getItem(k)) { localStorage.setItem(k, old); localStorage.removeItem('skoll-history'); }
    localStorage.setItem('skoll-hist-per-account', '1');
  } catch {}
}
/* Barn får INTE radera sin historik — bara föräldern. Låset sitter kvar även om barnet
   loggar ut (flagga i localStorage) och släpps först när ett vuxenkonto loggar in. */
function historyLocked() {
  try { if (typeof account !== 'undefined' && account && account.isChild) return true; } catch {}
  try { return localStorage.getItem('skoll-hist-lock') === '1'; } catch { return false; }
}
function lockHistoryForChild() { try { localStorage.setItem('skoll-hist-lock', '1'); } catch {} }
function unlockHistoryForParent() { try { localStorage.removeItem('skoll-hist-lock'); } catch {} }
function removeHistory(url) { if (historyLocked()) return false; saveHistory(getHistory().filter((e) => e.url !== url)); return true; }   // ta bort EN sida ur historiken
function clearHistory() { if (historyLocked()) return false; try { localStorage.removeItem(histKey()); } catch {} return true; }   // ta bort allt
function pushHistory(url, title, favicon) {
  if (!/^https?:/i.test(url)) return;
  const all = getHistory();
  const prev = all.find((e) => e.url === url);
  const n = ((prev && prev.n) || 0) + 1;
  let h = all.filter((e) => e.url !== url);
  h.unshift({ url, title: title || (prev && prev.title) || url, favicon: favicon || (prev && prev.favicon) || null, t: Date.now(), n });
  if (h.length > 500) h = h.slice(0, 500);
  saveHistory(h);
  // Öppen insyn: barnets besök skickas till servern så föräldern kan se historiken
  if (account && account.isChild && account.token) { try { window.family.historyAdd(account.token, url, title || ''); } catch {} }
}
let historyOpen = false;
function renderHistory() {
  const list = $('history-list'); list.innerHTML = '';
  const h = getHistory();
  const locked = historyLocked();
  const clearBtn = $('history-clear'); if (clearBtn) clearBtn.style.display = (h.length && !locked) ? 'flex' : 'none';
  resetHistoryClear();
  if (!h.length) { list.innerHTML = '<div style="padding:16px;color:#8ba3bf;font-size:13px">Ingen historik än.</div>'; return; }
  if (locked) list.innerHTML = '<div style="display:flex;gap:8px;padding:11px 14px;background:rgba(47,143,212,.07);border-bottom:1px solid #eef2f7;color:var(--color-navy-700);font-size:12px;line-height:1.45"><span>Din historik sparas åt dina föräldrar och kan inte tas bort här.</span></div>';
  h.forEach((e) => {
    const row = document.createElement('div'); row.className = 'hist-row';
    const fav = e.favicon
      ? `<img class="hist-fav" src="${escapeHtml(e.favicon)}" data-glob="hist" alt="">`
      : `<span class="hist-fav" style="display:grid;place-items:center;color:#8ba3bf"><svg class="ic" style="width:13px;height:13px"><use href="#i-fav" /></svg></span>`;
    row.innerHTML = `${fav}<div class="hist-txt"><div class="hist-title">${escapeHtml(e.title)}</div><div class="hist-url">${escapeHtml(e.url.replace(/^https?:\/\/(www\.)?/, ''))}</div></div>` + (locked ? '' : `<button class="row-btn" title="Ta bort från historiken"><svg class="ic ic-sm"><use href="#i-trash" /></svg></button>`);
    row.addEventListener('click', () => { closeHistory(); if (active) guardedNavigate(active, e.url); });
    if (!locked) row.querySelector('.row-btn').addEventListener('click', (ev) => { ev.stopPropagation(); removeHistory(e.url); renderHistory(); });
    list.appendChild(row);
  });
}
/* "Rensa allt" i två steg — ett felklick ska inte radera hela historiken. */
let histClearArmed = 0;
function resetHistoryClear() {
  histClearArmed = 0;
  const t = $('history-clear-txt'); if (t) t.textContent = 'Rensa allt';
  const b = $('history-clear'); if (b) { b.style.color = 'var(--color-navy-700)'; b.style.borderColor = 'var(--color-line)'; }
}
function openHistory() { openSettings(); showSettingsCat('historik'); }
function closeHistory() { $('history').classList.add('hidden'); window.view.insetLeft(0); historyOpen = false; resetHistoryClear(); }
window.view.onOpenHistory(() => openHistory());
$('history-close').addEventListener('click', closeHistory);
$('history-clear').addEventListener('click', () => {
  if (!histClearArmed) {
    histClearArmed = 1;
    const t = $('history-clear-txt'); if (t) t.textContent = 'Rensa allt?';
    const b = $('history-clear'); if (b) { b.style.color = 'var(--color-danger)'; b.style.borderColor = 'var(--color-danger)'; }
    setTimeout(() => { if (histClearArmed) resetHistoryClear(); }, 4000);
    return;
  }
  if (clearHistory()) { renderHistory(); showToast('Historiken är rensad.'); }
  else { resetHistoryClear(); showToast('Bara föräldern kan rensa historiken.'); }
});

/* ── Historik som egen inställningsflik (hela historiken, sök, besök, ta bort) ── */
let histFilter = '';
function histFmtDate(t) {
  if (!t) return '';
  const d = new Date(t), nu = new Date();
  const sammaDag = d.toDateString() === nu.toDateString();
  const igar = new Date(nu); igar.setDate(nu.getDate() - 1);
  const klock = d.toLocaleTimeString(document.documentElement.lang || 'sv', { hour: '2-digit', minute: '2-digit' });
  if (sammaDag) return (window.t ? window.t('I dag') : 'I dag') + ' ' + klock;
  if (d.toDateString() === igar.toDateString()) return (window.t ? window.t('I går') : 'I går') + ' ' + klock;
  return d.toLocaleDateString(document.documentElement.lang || 'sv', { day: 'numeric', month: 'short' }) + ' ' + klock;
}
function renderHistPanel() {
  const list = $('hist-list'); if (!list) return;
  list.innerHTML = '';
  const locked = historyLocked();
  const clr = $('hist-clear'); if (clr) clr.style.display = locked ? 'none' : '';
  let h = getHistory();
  if (histFilter) {
    const q = histFilter.toLowerCase();
    h = h.filter((e) => (e.title || '').toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q));
  }
  if (locked) {
    list.innerHTML = '<div style="display:flex;gap:8px;padding:12px 14px;background:rgba(47,143,212,.07);color:var(--color-navy-700);font-size:12.5px;line-height:1.45"><span>Din historik sparas åt dina föräldrar och kan inte tas bort här.</span></div>';
  }
  if (!h.length) {
    list.insertAdjacentHTML('beforeend', '<div style="padding:16px;color:#8ba3bf;font-size:13px">' + (histFilter ? 'Inget i historiken matchar.' : 'Ingen historik än.') + '</div>');
    return;
  }
  h.forEach((e) => {
    const row = document.createElement('div'); row.className = 'hist-row';
    const fav = e.favicon
      ? `<img class="hist-fav" src="${escapeHtml(e.favicon)}" data-glob="hist" alt="">`
      : `<span class="hist-fav" style="display:grid;place-items:center;color:#8ba3bf"><svg class="ic" style="width:13px;height:13px"><use href="#i-fav" /></svg></span>`;
    row.innerHTML = fav
      + `<div class="hist-txt"><div class="hist-title">${escapeHtml(e.title || e.url)}</div><div class="hist-url">${escapeHtml(e.url.replace(/^https?:\/\/(www\.)?/, ''))}</div></div>`
      + `<span style="flex:none;font-size:11.5px;color:#8ba3bf;margin-right:4px;white-space:nowrap">${escapeHtml(histFmtDate(e.t))}</span>`
      + (locked ? '' : `<button class="row-btn" title="Ta bort från historiken"><svg class="ic ic-sm"><use href="#i-trash" /></svg></button>`);
    row.addEventListener('click', () => {   // besök sidan igen
      closeSettings();
      if (active) guardedNavigate(active, e.url); else { const t = createTab(e.url); switchTab(t); }
    });
    if (!locked) row.querySelector('.row-btn').addEventListener('click', (ev) => { ev.stopPropagation(); removeHistory(e.url); renderHistPanel(); });
    list.appendChild(row);
  });
}
if ($('hist-search')) $('hist-search').addEventListener('input', (e) => { histFilter = e.target.value.trim(); renderHistPanel(); });
let histPanelArmed = 0;
if ($('hist-clear')) $('hist-clear').addEventListener('click', () => {
  const b = $('hist-clear'), t = $('hist-clear-txt');
  if (!histPanelArmed) {
    histPanelArmed = 1; if (t) t.textContent = (window.t ? window.t('Rensa allt?') : 'Rensa allt?'); b.classList.add('armed');
    setTimeout(() => { if (histPanelArmed) { histPanelArmed = 0; if (t) t.textContent = (window.t ? window.t('Rensa allt') : 'Rensa allt'); b.classList.remove('armed'); } }, 4000);
    return;
  }
  histPanelArmed = 0; if (t) t.textContent = (window.t ? window.t('Rensa allt') : 'Rensa allt'); b.classList.remove('armed');
  if (clearHistory()) { renderHistPanel(); showToast('Historiken är rensad.'); }
  else showToast('Bara föräldern kan rensa historiken.');
});

/* ── Bokmärken ── */
function getBookmarks() { try { const b = JSON.parse(localStorage.getItem('skoll-bookmarks')); return Array.isArray(b) ? b : []; } catch { return []; } }
function saveBookmarks(l) { try { localStorage.setItem('skoll-bookmarks', JSON.stringify(l)); } catch {} }
function isBookmarked(url) { return getBookmarks().some((b) => b.url === url); }
function updateStar() { $('bm-star').classList.toggle('on', !!(active && active.url && isBookmarked(active.url))); }
// Lägg till / ta bort bokmärke via dessa så synk och gravstenar hålls i takt
function addBookmark(e) {
  const l = getBookmarks();
  if (l.some((b) => b.url === e.url)) return;
  l.unshift({ url: e.url, title: e.title || e.url, favicon: e.favicon || null, _t: Date.now() });
  bmTombForget(e.url); saveBookmarks(l); synkaBokmarken();
}
function removeBookmark(url) {
  saveBookmarks(getBookmarks().filter((b) => b.url !== url));
  bmTombAdd(url); synkaBokmarken();
}
$('bm-star').addEventListener('click', () => {
  if (!active || !active.url) return;
  if (isBookmarked(active.url)) removeBookmark(active.url);
  else addBookmark({ url: active.url, title: active.title || active.url, favicon: active.favicon || null });
  updateStar(); renderBookmarkBar();
});

/* ── Synk mellan enheter (bokmärken) ── */
// Gravstenar: url -> tidpunkt, så borttagningar sprids till andra enheter
function bmTombs() { try { const o = JSON.parse(localStorage.getItem('skoll-bm-tomb')); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function bmTombSave(o) { try { localStorage.setItem('skoll-bm-tomb', JSON.stringify(o)); } catch {} }
function bmTombAdd(url) { const o = bmTombs(); o[url] = Date.now(); bmTombSave(o); }
function bmTombForget(url) { const o = bmTombs(); if (o[url]) { delete o[url]; bmTombSave(o); } }
function synkPa() {
  if (!account || !account.token || account.isChild) return false;
  try { return localStorage.getItem('adraze-synk') !== '0'; } catch { return true; }
}
let synkTimer = null, synkPagar = false;
function synkaBokmarken(direkt) {
  if (!synkPa()) return;
  clearTimeout(synkTimer);
  synkTimer = setTimeout(() => doSynkBokmarken(), direkt ? 0 : 1200);
}
async function doSynkBokmarken() {
  if (!synkPa() || synkPagar) return;
  synkPagar = true;
  try {
    const bm = getBookmarks();
    const poster = bm.map((b) => ({ url: b.url, title: b.title || b.url, favicon: b.favicon || null, _t: b._t || Date.now() }));
    const tomb = bmTombs(); const borttagna = Object.keys(tomb).map((url) => ({ url, _t: tomb[url] }));
    const r = await window.view.synkPush(account.token, 'bokmarken', poster, borttagna).catch(() => null);
    if (r && r.ok && Array.isArray(r.poster)) slaIhopBokmarken(r.poster);
  } finally { synkPagar = false; }
}
// Ersätt lokala listan med serverns sammanfogade sanning (behåll lokal favicon om servern saknar)
function slaIhopBokmarken(serverPoster) {
  const lokal = new Map(getBookmarks().map((b) => [b.url, b]));
  const ny = serverPoster.map((p) => ({ url: p.url, title: p.title || p.url, favicon: p.favicon || (lokal.get(p.url) || {}).favicon || null, _t: p._t || Date.now() }));
  ny.sort((a, b) => (b._t || 0) - (a._t || 0));
  saveBookmarks(ny);
  // gravstenar som servern redan känner till kan glömmas lokalt
  const urls = new Set(ny.map((b) => b.url)); const o = bmTombs();
  for (const u of Object.keys(o)) if (!urls.has(u)) {} // behåll tills 90 dygn gått på servern
  renderBookmarkBar(); updateStar();
}
// Vid inloggning / start: hämta serverns lista och väv ihop med lokala ändringar
async function synkaInit() {
  if (!synkPa()) return;
  // Tryck upp lokala först (så en ny enhets tomma lista inte raderar allt), servern svarar med unionen
  await doSynkBokmarken();
}
(function wireSynkToggle() {
  const t = document.getElementById('synk-toggle'); if (!t) return;
  t.addEventListener('change', () => {
    try { localStorage.setItem('adraze-synk', t.checked ? '1' : '0'); } catch {}
    if (t.checked) synkaInit();
  });
})();
function bmShort(e) {
  let t = e.title || '';
  try { if (!t || t === e.url) t = new URL(e.url).hostname.replace(/^www\./, ''); } catch {}
  return t.length > 22 ? t.slice(0, 21) + '…' : t;
}
let bmbarOn = true;
try { bmbarOn = localStorage.getItem('adraze-bmbar') !== '0'; } catch {}
// Bokmärkesfältet: sparade sidor som klickbara chips under adressfältet (à la Brave).
function renderBookmarkBar() {
  const bar = $('bmbar'); if (!bar) return;
  const list = getBookmarks();
  const tb = $('toolbar');
  if (!list.length || !bmbarOn) { bar.style.display = 'none'; bar.innerHTML = ''; if (tb) tb.classList.remove('has-bmbar'); sendBounds(); return; }
  bar.style.display = 'flex';
  if (tb) tb.classList.add('has-bmbar');
  bar.innerHTML = list.map((e) => {
    const fav = e.favicon
      ? '<img src="' + escapeHtml(e.favicon) + '" data-glob="bm" alt="">'
      : '<span class="bmglobe"><svg class="ic"><use href="#i-fav" /></svg></span>';
    return '<div class="bmchip" data-url="' + escapeHtml(e.url) + '" title="' + escapeHtml(e.title || e.url) + '">'
      + fav + '<span>' + escapeHtml(bmShort(e)) + '</span></div>';
  }).join('');
  bar.querySelectorAll('.bmchip').forEach((c) => {
    const url = c.dataset.url;
    c.addEventListener('click', () => {
      try { if (typeof closeSettings === 'function' && !$('settings').classList.contains('hidden')) closeSettings(); } catch {}
      try { if (typeof closeBookmarks === 'function' && !$('bookmarks').classList.contains('hidden')) closeBookmarks(); } catch {}
      if (active) guardedNavigate(active, url); else { const t = createTab(url); switchTab(t); }
    });
    c.addEventListener('auxclick', (ev) => { if (ev.button === 1) { ev.preventDefault(); createTab(url); } });  // mittenklick = ny flik
    c.addEventListener('contextmenu', (ev) => {   // högerklick = ta bort från fältet (som Brave, fast utan meny)
      ev.preventDefault();
      removeBookmark(url); renderBookmarkBar(); updateStar();
      try { showToast('Bokmärket togs bort'); } catch {}
    });
  });
  sendBounds();   // fältet ändrar höjd → flytta native-webbvyn så den inte täcker fältet
}
function rowFav(favicon) {
  return favicon ? `<img class="hist-fav" src="${escapeHtml(favicon)}" data-glob="hist" alt="">` : `<span class="hist-fav" style="display:grid;place-items:center;color:#8ba3bf"><svg class="ic" style="width:13px;height:13px"><use href="#i-fav" /></svg></span>`;
}
function openBookmarks() {
  window.view.hide();
  const list = $('bookmarks-list'); list.innerHTML = '';
  const b = getBookmarks();
  if (!b.length) list.innerHTML = '<div style="padding:16px;color:#8ba3bf;font-size:13px">Inga bokmärken än.</div>';
  b.forEach((e) => {
    const row = document.createElement('div'); row.className = 'hist-row';
    row.innerHTML = `${rowFav(e.favicon)}<div class="hist-txt"><div class="hist-title">${escapeHtml(e.title)}</div><div class="hist-url">${escapeHtml(e.url.replace(/^https?:\/\/(www\.)?/, ''))}</div></div><button class="row-btn" title="Ta bort"><svg class="ic ic-sm"><use href="#i-trash" /></svg></button>`;
    row.addEventListener('click', () => { closeBookmarks(); if (active) guardedNavigate(active, e.url); });
    row.querySelector('.row-btn').addEventListener('click', (ev) => { ev.stopPropagation(); removeBookmark(e.url); openBookmarks(); updateStar(); renderBookmarkBar(); });
    list.appendChild(row);
  });
  hideOverlayElements();
  if (active) active.overlay = 'bookmarks';
  $('bookmarks').classList.remove('hidden');
}
function closeBookmarks() { if (active) active.overlay = null; $('bookmarks').classList.add('hidden'); showActiveTab(); }
$('bookmarks-close').addEventListener('click', closeBookmarks);
window.view.onOpenBookmarks(() => openBookmarks());

/* ── Nedladdningar ── */
/* Översättning med platshållare: svenska nyckeln innehåller {n} (namn/tal). */
function tn(sv, n) { const s = (typeof window.t === 'function') ? window.t(sv) : sv; return s.split('{n}').join(String(n)); }
const dlMap = new Map();
function fmtBytes(n) { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return n.toFixed(i ? 1 : 0) + ' ' + u[i]; }
function renderDownloads() {
  const list = $('downloads-list'); list.innerHTML = '';
  const items = [...dlMap.values()];
  if (!items.length) { list.innerHTML = '<div style="padding:16px;color:#8ba3bf;font-size:13px">Inga nedladdningar än.</div>'; return; }
  items.forEach((d) => {
    const row = document.createElement('div'); row.className = 'hist-row'; row.style.cursor = 'default';
    const done = d.state === 'completed';
    const scanning = d.state === 'scanning', infected = d.state === 'infected', removed = d.state === 'deleted';
    let status, col = '#8ba3bf';
    const paused = d.state === 'paused', prog = d.state === 'progressing' || paused;
    if (prog) status = (paused ? (window.t ? window.t('Pausad') : 'Pausad') + ' · ' : '') + `${fmtBytes(d.received)} / ${fmtBytes(d.total)}`;
    else if (scanning) { status = 'Skannar efter virus…'; col = 'var(--color-terra)'; }
    else if (infected) { status = 'Blockerad — ' + (d.threat || 'hot'); col = 'var(--color-danger)'; }
    else if (removed) { status = 'Borttagen (virus)'; col = 'var(--color-danger)'; }
    else if (done) { status = d.scan === 'overridden' ? 'Klar (behållen trots varning)' : (d.scan === 'clean' ? 'Säker' : 'Klar'); col = 'var(--color-safe)'; }
    else { status = d.state === 'cancelled' ? 'Avbruten' : 'Misslyckades'; }
    const useIco = infected || removed ? 'i-shield-x' : (scanning ? 'i-shield' : 'i-download');
    row.innerHTML = `<span class="hist-fav" style="display:grid;place-items:center;color:${col}"><svg class="ic ic-sm"><use href="#${useIco}" /></svg></span><div class="hist-txt"><div class="hist-title">${escapeHtml(d.filename)}</div><div class="hist-url" style="color:${infected || removed ? 'var(--color-danger)' : ''}">${escapeHtml(status)}</div></div>` + (done ? `<button class="row-btn" title="Visa i mapp"><svg class="ic ic-sm"><use href="#i-folder" /></svg></button>` : '')
      + (prog ? `<button class="row-btn dl-toggle" title="${paused ? 'Fortsätt' : 'Pausa'}"><svg class="ic ic-sm" viewBox="0 0 24 24">${paused ? '<path d="M8 5v14l11-7z"/>' : '<path d="M9 5v14M15 5v14"/>'}</svg></button><button class="row-btn dl-cancel" title="Avbryt"><svg class="ic ic-sm" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : '');
    if (done) { const b = row.querySelector('.row-btn'); if (b) b.addEventListener('click', () => window.dl.folder(d.id)); }
    const tb = row.querySelector('.dl-toggle'); if (tb) tb.addEventListener('click', () => paused ? window.dl.resume(d.id) : window.dl.pause(d.id));
    const cb = row.querySelector('.dl-cancel'); if (cb) cb.addEventListener('click', () => window.dl.cancel(d.id));
    list.appendChild(row);
  });
}
window.dl.onUpdate((r) => { dlMap.set(r.id, r); if ($('downloads-list')) renderDownloads(); updateDlButton(); });
function updateDlButton() {
  const btn = $('dl-btn'); if (!btn) return;
  const items = [...dlMap.values()];
  if (items.length) btn.style.display = '';
  const active = items.filter((d) => d.state === 'progressing' || d.state === 'paused' || d.state === 'scanning').length;
  const badge = $('dl-badge');
  if (badge) {
    if (active > 0) { badge.textContent = String(active); badge.style.display = ''; btn.classList.add('dl-busy'); }
    else { badge.style.display = 'none'; btn.classList.remove('dl-busy'); }
  }
}
{ const b = $('dl-btn'); if (b) b.addEventListener('click', () => window.dl.popupToggle()); }
/* Farlig nedladdning stoppad → varningsbar */
let threatId = null;
window.dl.onThreat((t) => {
  threatId = t.id;
  $('dlthreat-msg').innerHTML = '<b>' + escapeHtml(t.filename) + '</b> kan innehålla <b>' + escapeHtml(t.threat) + '</b>. Vi flyttade den åt sidan så den inte kan skada din dator. Är du säker på att filen är trygg kan du behålla den ändå.';
  $('dlthreat').style.display = 'block';
  showToast('Farlig nedladdning stoppad');
});
function hideThreat() { $('dlthreat').style.display = 'none'; threatId = null; }
$('dlthreat-remove').addEventListener('click', () => { if (threatId) window.dl.removeThreat(threatId); hideThreat(); showToast('Filen togs bort.'); });
$('dlthreat-keep').addEventListener('click', () => { if (threatId) window.dl.keepAnyway(threatId); hideThreat(); showToast('Filen behölls i Nedladdningar.'); });
$('dlthreat-close').addEventListener('click', hideThreat);
// Hämtar nedladdningarna från huvudprocessen och ritar listan (körs både från knappen och fliken)
async function loadDownloads() {
  const server = await window.dl.list().catch(() => []);
  (server || []).forEach((d) => dlMap.set(d.id, d));
  renderDownloads();
}
function openDownloads() { openSettings(); showSettingsCat('nedladdningar'); }
window.view.onOpenDownloads(() => openDownloads());

/* ── Lösenord ── */
async function renderPasswords() {
  const list = $('passwords-list'); list.innerHTML = '';
  const items = await window.pw.list().catch(() => []);
  if (!items.length) { list.innerHTML = '<div style="padding:16px;color:#8ba3bf;font-size:13px">Inga sparade lösenord än.</div>'; return; }
  items.forEach((p) => {
    const row = document.createElement('div'); row.className = 'hist-row'; row.style.cursor = 'default';
    let host = p.origin; try { host = new URL(p.origin).hostname.replace(/^www\./, ''); } catch {}
    row.innerHTML = `<span class="hist-fav" style="display:grid;place-items:center;color:#8ba3bf"><svg class="ic ic-sm"><use href="#i-key" /></svg></span><div class="hist-txt"><div class="hist-title">${escapeHtml(host)} · ${escapeHtml(p.username || '')}</div><div class="hist-url"><span class="pw-dots">••••••••</span></div></div><button class="row-btn" data-a="eye" title="Visa"><svg class="ic ic-sm"><use href="#i-eye" /></svg></button><button class="row-btn" data-a="del" title="Ta bort"><svg class="ic ic-sm"><use href="#i-trash" /></svg></button>`;
    const dots = row.querySelector('.pw-dots');
    row.querySelector('[data-a=eye]').addEventListener('click', () => { dots.textContent = dots.textContent.startsWith('•') ? p.password : '••••••••'; });
    row.querySelector('[data-a=del]').addEventListener('click', async () => { await window.pw.del(p.id); renderPasswords(); });
    list.appendChild(row);
  });
}
function openPasswords() { openSettings(); showSettingsCat('losenord'); renderPasswords(); initImport(); }
window.view.onOpenPasswords(() => openPasswords());

/* ── Importera från en annan webbläsare ── */
let impVal = null;        // { typ, id, profil, namn }
let impLaddad = false;
function impSettMsg(text, err) {
  const m = $('imp-msg'); if (!m) return;
  if (!text) { m.hidden = true; return; }
  m.hidden = false; m.textContent = text; m.classList.toggle('err', !!err && err !== 'ok'); m.classList.toggle('ok', err === 'ok');
}
async function initImport() {
  const wrap = $('imp-src'); if (!wrap || impLaddad) return;
  impLaddad = true;
  let lista = []; try { lista = await window.view.importKallor(); } catch {}
  wrap.innerHTML = '';
  if (!Array.isArray(lista) || !lista.length) {
    wrap.innerHTML = '<span class="imp-none">Hittade ingen annan webbläsare på datorn. Du kan ändå importera lösenord från en CSV-fil nedan.</span>';
    return;
  }
  // En knapp per källa+profil (flera profiler visas med profilnamnet)
  for (const k of lista) {
    for (const p of k.profiler) {
      const flera = k.profiler.length > 1;
      const b = document.createElement('button');
      b.className = 'imp-b';
      b.textContent = k.namn + (flera ? ' · ' + p.namn : '');
      b.addEventListener('click', () => {
        impVal = { typ: k.typ, id: k.id, profil: p.id, namn: b.textContent };
        wrap.querySelectorAll('.imp-b').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        $('imp-go').disabled = false;
        impSettMsg('');
        impVisaLista([], []); impUppdateraVal();
      });
      wrap.appendChild(b);
    }
  }
}
function mergeBokmarken(nya) {
  const bm = getBookmarks(); const sedda = new Set(bm.map((b) => b.url));
  let n = 0;
  for (const x of nya) { if (x.url && !sedda.has(x.url)) { bm.push({ url: x.url, title: x.title || x.url, favicon: '', _t: Date.now() }); sedda.add(x.url); n++; } }
  if (n) { saveBookmarks(bm); try { renderBookmarkBar(); } catch {} synkaBokmarken(); }
  return n;
}
function mergeHistorik(nya) {
  const h = getHistory(); const vid = new Map(h.map((e, i) => [e.url, i]));
  let n = 0;
  for (const x of nya) {
    if (!x.url) continue;
    const i = vid.get(x.url);
    if (i == null) { h.push({ url: x.url, title: x.title || x.url, favicon: '', t: x.t || Date.now(), n: x.n || 1 }); vid.set(x.url, h.length - 1); n++; }
    else if ((x.t || 0) > (h[i].t || 0)) { h[i].t = x.t; if (x.title) h[i].title = x.title; }
  }
  if (n) { h.sort((a, b) => (b.t || 0) - (a.t || 0)); saveHistory(h.slice(0, 500)); }
  return n;
}
// Utseende: tema, bokmärkesfält, sidzoom, teckenstorlek
async function tillampaUtseende(x, rad) {
  if (x.tema) { valjTema(x.tema); rad(tw(x.tema === 'dark' ? 'Mörkt tema' : 'Ljust tema')); }
  if (typeof x.bmbar === 'boolean') {
    bmbarOn = x.bmbar; try { localStorage.setItem('adraze-bmbar', bmbarOn ? '1' : '0'); } catch {}
    try { renderBookmarkBar(); } catch {} if ($('tgl-bmbar')) $('tgl-bmbar').checked = bmbarOn;
    rad(tw(bmbarOn ? 'Bokmärkesfältet visas' : 'Bokmärkesfältet är dolt'));
  }
  if (x.zoom && [90, 100, 110, 125].includes(x.zoom)) {
    defaultZoom = x.zoom; try { localStorage.setItem('skoll-zoom', String(x.zoom)); } catch {}
    try { window.view.defaultZoom(x.zoom / 100); applyZoomSeg(); } catch {}
    rad(tw('Sidzoom') + ' ' + x.zoom + ' %');
  }
  if (x.fontSize) {
    const f = [9, 12, 16, 20, 24].reduce((a, b) => (Math.abs(b - x.fontSize) < Math.abs(a - x.fontSize) ? b : a));
    await window.view.webbSet('fontSize', f);
    const opt = $('sel-font') && [...$('sel-font').options].find((o) => o.value === String(f));
    rad(tw('Teckenstorlek') + (opt ? ': ' + opt.textContent : ''));
  }
}
// Inställningar: sökmotor, vid start, nedladdningar, säkerhet, webbplatsbehörigheter
async function tillampaInstallningar(x, rad, miss) {
  if (x.motor && setEngine(x.motor)) rad(tw('Sökmotor') + ': ' + ENGINES[x.motor].label);
  else if (x.motorNamn) miss(tw('Sökmotorn') + ' ' + x.motorNamn + ' ' + tw('finns inte i AdRaze — välj en under Sökmotor.'));
  if (x.start && (x.start.mode !== 'sida' || x.start.url)) {
    startMode = x.start.mode; try { localStorage.setItem('adraze-start', startMode); } catch {}
    if (x.start.url) { startUrl = x.start.url; try { localStorage.setItem('adraze-start-url', startUrl); } catch {} }
    rad(tw('Vid start') + ': ' + (startMode === 'tidigare' ? tw('fortsätt där du var') : startMode === 'ny' ? tw('ny flik') : startUrl));
  }
  if (x.nedladdning) {
    if (x.nedladdning.dir && await window.view.webbSet('downloadDirPath', x.nedladdning.dir)) rad(tw('Nedladdningsmapp') + ': ' + x.nedladdning.dir);
    if (typeof x.nedladdning.fraga === 'boolean') { await window.view.webbSet('askDownload', x.nedladdning.fraga); if (x.nedladdning.fraga) rad(tw('Fråga var filer ska sparas')); }
  }
  if (typeof x.httpsOnly === 'boolean') { await window.view.webbSet('httpsOnly', x.httpsOnly); if (x.httpsOnly) rad(tw('Endast HTTPS')); }
  if (x.dns) { await window.view.webbSet('dns', x.dns); rad(tw('Säker DNS')); }
  // Behörigheter: bara där du inte redan har gjort ett val i AdRaze
  let nu = null; try { nu = await window.view.webbGet(); } catch {}
  const finns = (nu && nu.perms) || {}, std = (nu && nu.permDefaults) || {};
  let np = 0;
  for (const [o, kinds] of Object.entries(x.perms || {})) {
    for (const [kind, v] of Object.entries(kinds)) {
      if (finns[o] && finns[o][kind]) continue;
      if (await window.view.webbSet('perm', { origin: o, kind, value: v })) np++;
    }
  }
  if (np) rad(np + ' ' + tw(np === 1 ? 'webbplatsbehörighet' : 'webbplatsbehörigheter'));
  for (const [kind, v] of Object.entries(x.permDefaults || {})) {
    if (std[kind] || v !== 'block') continue;
    await window.view.webbSet('permDefault', { kind, value: 'block' });
    rad(tw('Blockeras på alla sajter') + ': ' + tw(PERM_LABEL[kind] || kind));
  }
}
function impVisaLista(ok, missar) {
  const ul = $('imp-lista'); if (!ul) return;
  ul.innerHTML = '';
  for (const t of ok) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
  for (const t of missar) { const li = document.createElement('li'); li.className = 'miss'; li.textContent = t; ul.appendChild(li); }
  if ($('imp-res')) $('imp-res').hidden = !ul.children.length;
}
function impUppdateraVal() {
  const ff = impVal && impVal.typ === 'firefox';
  const w = $('imp-ext-wrap'); if (w) w.title = ff ? tw('Firefox-tillägg fungerar inte i AdRaze') : '';
  if ($('imp-ext')) $('imp-ext').disabled = !!ff;
}
if ($('imp-go')) $('imp-go').addEventListener('click', async () => {
  if (!impVal) return;
  const bokmarken = $('imp-bm').checked, historik = $('imp-hist').checked;
  const inst = $('imp-inst').checked, utse = $('imp-utse').checked;
  const ext = $('imp-ext').checked && !$('imp-ext').disabled;
  const flikar = $('imp-flikar').checked, kakor = $('imp-kakor').checked;
  if (!bokmarken && !historik && !inst && !utse && !ext && !flikar && !kakor) { impSettMsg(tw('Välj minst en sak att ta med.'), true); return; }
  const btn = $('imp-go'); btn.disabled = true; impSettMsg(tw('Importerar…')); impVisaLista([], []);
  let r; try { r = await window.view.importLas({ ...impVal, bokmarken, historik, installningar: inst || utse || ext, flikar, kakor }); } catch (e) { r = { ok: false, fel: String(e) }; }
  if (!r || !r.ok) { btn.disabled = false; impSettMsg(r && r.fel ? r.fel : tw('Kunde inte läsa webbläsaren.'), true); return; }
  const ok = [], missar = [];
  const rad = (t) => ok.push(t), miss = (t) => missar.push(t);
  if (bokmarken) { const n = mergeBokmarken(r.bokmarken || []); if (n) rad(n + ' ' + tw('bokmärken')); else miss(tw('Inga nya bokmärken')); }
  if (historik) { const n = mergeHistorik(r.historik || []); if (n) rad(n + ' ' + tw('sidor i historiken')); else miss(tw('Ingen ny historik')); }
  // Inloggningarna är redan satta av huvudprocessen (kakorna lämnar den aldrig) — före flikarna, så att de öppnas inloggade
  if (kakor && r.kakor) {
    if (r.kakor.antal) rad(tw('Inloggad på') + ' ' + r.kakor.sajter + ' ' + tw(r.kakor.sajter === 1 ? 'sajt' : 'sajter'));
    else if (!r.kakor.last) miss(tw('Inga inloggningar att ta med'));
    if (r.kakor.last) miss(r.kakor.last + ' ' + tw('inloggningar gick inte att låsa upp'));
  }
  if (flikar) {
    const redan = new Set(tabs.map((t) => t.url).filter(Boolean));
    const nya = (r.flikar || []).filter((t) => !redan.has(t.url));
    if (nya.length) {
      const tillbaka = active;
      for (const t of nya) { const nt = createTab(t.url); if (t.pinned) try { setPinned(nt, true); } catch {} }
      try { if (tillbaka) switchTab(tillbaka); } catch {}
      rad(nya.length + ' ' + tw(nya.length === 1 ? 'flik öppnad' : 'flikar öppnade'));
    } else miss(tw('Inga öppna flikar att ta med'));
  }
  const x = r.installningar;
  try {
    if (x && utse) await tillampaUtseende(x, rad);
    if (x && inst) await tillampaInstallningar(x, rad, miss);
  } catch (e) { miss(String(e && e.message || e)); }
  try { refreshWebbPanel(); } catch {}
  if (x && ext) {
    const lista = x.tillagg || [];
    if (!lista.length) miss(tw('Inga tillägg att ta med'));
    else {
      impSettMsg(tw('Installerar tillägg…') + ' (' + lista.length + ')');
      let t = null; try { t = await window.view.importTillagg(lista.map((e) => e.id)); } catch {}
      const klara = new Set((t && t.klara) || []);
      const namn = (id) => (lista.find((e) => e.id === id) || {}).namn || id;
      if (klara.size) rad(tw('Tillägg') + ': ' + [...klara].map(namn).join(', '));
      for (const f of (t && t.fel) || []) miss(namn(f.id) + ' — ' + tw('gick inte att installera'));
      try { renderExt(); } catch {}
    }
  }
  btn.disabled = false;
  impSettMsg(tw('Klart! Det här togs med från') + ' ' + impVal.namn + ':', 'ok');
  impVisaLista(ok, missar);
});
if ($('imp-csv')) $('imp-csv').addEventListener('click', async () => {
  const btn = $('imp-csv'); btn.disabled = true; impSettMsg('Läser filen…');
  let r; try { r = await window.view.importLosenCsv(); } catch (e) { r = { ok: false, fel: String(e) }; }
  btn.disabled = false;
  if (!r || (!r.ok && r.avbruten)) { impSettMsg(''); return; }
  if (!r.ok) { impSettMsg(r.fel || 'Kunde inte importera lösenorden.', true); return; }
  impSettMsg('Klart — ' + r.antal + ' lösenord importerade.');
  renderPasswords();
});
$('pw-add-btn').addEventListener('click', async () => {
  const origin = $('pw-add-origin').value.trim(); const username = $('pw-add-user').value.trim(); const password = $('pw-add-pass').value;
  if (!origin || !password) return;
  let o = origin; try { o = new URL(normalizeUrl(origin)).origin; } catch {}
  await window.pw.save({ origin: o, username, password });
  $('pw-add-origin').value = ''; $('pw-add-user').value = ''; $('pw-add-pass').value = '';
  renderPasswords();
});

/* ── Chrome-tillägg ── */
function extMsg(text, sort) {
  const m = $('ext-msg'); if (!m) return;
  if (!text) { m.hidden = true; return; }
  m.hidden = false; m.textContent = text; m.className = 'ext-msg ' + (sort || '');
}
async function renderExt() {
  const wrap = $('ext-list'); if (!wrap) return;
  let lista = []; try { lista = await window.view.extList(); } catch {}
  wrap.innerHTML = '';
  for (const e of lista) {
    const row = document.createElement('div'); row.className = 'ext-item';
    row.innerHTML = `<span class="ext-ico"><svg class="ic ic-sm"><use href="#i-settings" /></svg></span>`
      + `<div style="flex:1;min-width:0;"><div class="ext-nm">${escapeHtml(e.namn)}</div>`
      + `<div class="ext-sub">${e.version ? 'v' + escapeHtml(e.version) + ' · ' : ''}${e.aktiv ? (e.kor ? 'På' : 'På (läses in vid omstart)') : 'Av'}</div></div>`
      + `<label class="switch" style="flex:none;"><input type="checkbox" ${e.aktiv ? 'checked' : ''}><span class="track"></span></label>`
      + `<button class="ext-del" title="Ta bort"><svg class="ic ic-sm"><use href="#i-trash" /></svg></button>`;
    row.querySelector('input').addEventListener('change', async (ev) => {
      const r = await window.view.extToggle(e.id, ev.target.checked).catch(() => null);
      if (!r || !r.ok) { extMsg((r && r.fel) || 'Kunde inte ändra tillägget.', 'err'); }
      renderExt();
    });
    row.querySelector('.ext-del').addEventListener('click', async () => {
      await window.view.extRemove(e.id).catch(() => {});
      renderExt();
    });
    wrap.appendChild(row);
  }
}
if ($('ext-add-btn')) {
  const add = async () => {
    const inp = $('ext-url'); const text = inp.value.trim();
    if (!text) return;
    const btn = $('ext-add-btn'); btn.disabled = true; extMsg('Laddar ner…');
    let r; try { r = await window.view.extAdd(text); } catch (e) { r = { ok: false, fel: String(e) }; }
    btn.disabled = false;
    if (!r || !r.ok) { extMsg((r && r.fel) || 'Kunde inte lägga till tillägget.', 'err'); return; }
    inp.value = ''; extMsg('Klart — ' + r.tillagg.namn + ' installerat.', 'ok');
    renderExt();
  };
  $('ext-add-btn').addEventListener('click', add);
  $('ext-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
}

/* ── Spara lösenord: flytande notis uppe till höger (ui/pwpopup.html), vit i ljust läge, mörk i mörkt ── */
window.pw.onOffer((c) => { try { window.pw.openPopup({ cred: c, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }); } catch {} });

/* ── AdRaze Wallet ── */
function fmtNum(s) { return (s || '').replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim(); }
function fmtExp(s) { const d = (s || '').replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }
let wlEditing = null; // kort-id under redigering, 'new', eller null
async function renderWallet() {
  const wrap = $('wallet-list'); if (!wrap) return;
  const bt = $('wl-buy-toggle'); if (bt) bt.checked = kbuyAllowed();
  const cards = await window.wallet.list().catch(() => []);
  wrap.innerHTML = '';
  if (wlEditing === 'new') wrap.appendChild(walletEditForm(null));
  if (!cards.length && wlEditing !== 'new') {
    wrap.innerHTML = '<div style="padding:14px;color:var(--color-navy-700);font-size:13px;opacity:.7">Inga sparade kort än. Lägg till ett här eller spara vid din nästa betalning.</div>';
    return;
  }
  cards.forEach((c) => {
    if (wlEditing === c.id) { wrap.appendChild(walletEditCard(c)); return; }
    const el = document.createElement('div'); el.className = 'wl-card';
    el.innerHTML = `<div class="wl-card-face"><span class="wl-chip"></span><div class="wl-card-info"><div class="wl-card-num">•••• •••• •••• ${escapeHtml(c.last4 || '••••')}</div><div class="wl-card-meta"><span>${escapeHtml(c.holder || 'Kortinnehavare')}</span><span>${escapeHtml(c.exp || 'MM/ÅÅ')}</span></div></div><span class="wl-brand">${escapeHtml(c.brand || 'Kort')}</span></div>
      <div class="wl-card-actions"><button class="wl-btn" data-a="edit"><svg class="ic ic-sm"><use href="#i-settings" /></svg>Ändra</button><button class="wl-btn wl-del" data-a="del"><svg class="ic ic-sm"><use href="#i-trash" /></svg>Ta bort</button></div>`;
    el.querySelector('[data-a=edit]').addEventListener('click', () => { wlEditing = c.id; renderWallet(); });
    el.querySelector('[data-a=del]').addEventListener('click', async () => { await window.wallet.del(c.id); if (wlEditing === c.id) wlEditing = null; renderWallet(); });
    wrap.appendChild(el);
  });
}
function walletEditCard(pub) {
  const el = document.createElement('div'); el.className = 'wl-card';
  el.innerHTML = `<div class="wl-card-face"><span class="wl-chip"></span><div class="wl-card-info"><div class="wl-card-num">•••• •••• •••• ${escapeHtml(pub.last4 || '••••')}</div><div class="wl-card-meta"><span>Ändra kortuppgifter</span></div></div><span class="wl-brand">${escapeHtml(pub.brand || 'Kort')}</span></div>`;
  el.appendChild(walletEditForm(pub.id));
  return el;
}
function walletEditForm(id) {
  const form = document.createElement('div'); form.className = 'wl-edit';
  form.innerHTML = `
    <div class="wl-full"><label class="wl-lbl">Kortinnehavare</label><input class="wl-in" data-f="holder" placeholder="Namn på kortet" /></div>
    <div class="wl-full"><label class="wl-lbl">Kortnummer</label><input class="wl-in" data-f="number" inputmode="numeric" placeholder="1234 5678 9012 3456" /></div>
    <div><label class="wl-lbl">Giltig t.o.m.</label><input class="wl-in" data-f="exp" inputmode="numeric" placeholder="MM/ÅÅ" maxlength="5" /></div>
    <div><label class="wl-lbl">CVC</label><input class="wl-in" data-f="cvc" inputmode="numeric" placeholder="123" maxlength="4" /></div>
    <div class="wl-save"><button class="btn btn-safe" data-a="save" style="height:40px;padding:0 18px;">Spara kort</button><button class="wl-btn" data-a="cancel" style="height:40px">Avbryt</button></div>`;
  const g = (f) => form.querySelector(`[data-f=${f}]`);
  g('number').addEventListener('input', (e) => { const p = e.target.selectionStart; e.target.value = fmtNum(e.target.value); });
  g('exp').addEventListener('input', (e) => { e.target.value = fmtExp(e.target.value); });
  if (id) window.wallet.get(id).then((c) => { if (!c) return; g('holder').value = c.holder || ''; g('number').value = fmtNum(c.number); g('exp').value = c.exp || ''; g('cvc').value = c.cvc || ''; });
  form.querySelector('[data-a=cancel]').addEventListener('click', () => { wlEditing = null; renderWallet(); });
  form.querySelector('[data-a=save]').addEventListener('click', async () => {
    const num = g('number').value.replace(/\D/g, '');
    if (num.length < 12) { g('number').style.borderColor = '#c25340'; return; }
    await window.wallet.save({ id: id || undefined, holder: g('holder').value, number: num, exp: g('exp').value, cvc: g('cvc').value });
    wlEditing = null; renderWallet(); showToast('Kort sparat – krypterat på din dator.');
  });
  return form;
}
function openWallet() { openSettings(); showSettingsCat('wallet'); renderWallet(); }
$('wallet-add-btn') && $('wallet-add-btn').addEventListener('click', () => { wlEditing = 'new'; renderWallet(); setTimeout(() => { const f = document.querySelector('#wallet-list .wl-in[data-f=number]'); if (f) f.focus(); }, 0); });
$('wl-buy-toggle') && $('wl-buy-toggle').addEventListener('change', (e) => { try { localStorage.setItem('adraze-krypto-buy', e.target.checked ? '1' : '0'); } catch {} showToast(e.target.checked ? 'Falk får nu handla åt dig – du godkänner varje köp.' : 'Falk handlar inte längre åt dig.'); });

/* ── Falk handlar åt användaren (tillstånd + säkerhetskoll + bekräftelse) ── */
function kbuyAllowed() { try { return localStorage.getItem('adraze-krypto-buy') === '1'; } catch { return false; } }
function cardLabel(c) { return (c.brand || 'Kort') + ' •• ' + (c.last4 || '····'); }
function kbuyOverlay(inner) {
  const ov = document.createElement('div'); ov.id = 'kbuy-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:210;background:rgba(5,12,22,.55);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
  ov.innerHTML = '<div style="width:min(430px,95vw);background:#fff;border-radius:20px;padding:24px;box-shadow:0 30px 80px rgba(8,20,35,.45)">' + inner + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  return ov;
}
function startKryptoPurchase(val) {
  if (document.getElementById('kbuy-modal')) return;
  const p = ('' + val).split('|').map((s) => s.trim());
  const order = { desc: p[0] || 'Köp', merchant: p[1] || 'Butik', amount: p[2] || '' };
  if (!kbuyAllowed()) return showBuyConsent(order);
  showBuyConfirm(order);
}
function showBuyConsent(order) {
  const ov = kbuyOverlay(
    ''
    + '<div style="font-size:18px;font-weight:800;text-align:center;color:var(--color-navy-900);margin-bottom:8px">Låta Falk handla åt dig?</div>'
    + '<p style="font-size:13.5px;color:rgb(28 43 58 / .62);text-align:center;line-height:1.55;margin-bottom:18px">Falk vill kunna köpa saker åt dig med dina sparade kort. Du får alltid <b>godkänna varje köp</b> innan betalning – och kan stänga av det när som helst i AdRaze Wallet.</p>'
    + '<div style="display:flex;gap:9px"><button id="kbuy-no" class="btn btn-ghost" style="flex:1;height:44px">Nej tack</button><button id="kbuy-yes" class="btn btn-safe" style="flex:1;height:44px">Tillåt</button></div>');
  ov.querySelector('#kbuy-no').addEventListener('click', () => { ov.remove(); showToast('Falk handlar inte utan ditt tillstånd.'); });
  ov.querySelector('#kbuy-yes').addEventListener('click', () => { try { localStorage.setItem('adraze-krypto-buy', '1'); } catch {} const t = $('wl-buy-toggle'); if (t) t.checked = true; ov.remove(); showBuyConfirm(order); });
}
async function showBuyConfirm(order) {
  let cards = []; try { cards = await window.wallet.list(); } catch {}
  if (!cards || !cards.length) {
    const ov = kbuyOverlay(
      ''
      + '<div style="font-size:17px;font-weight:800;text-align:center;color:var(--color-navy-900);margin-bottom:8px">Inget kort sparat</div>'
      + '<p style="font-size:13.5px;color:rgb(28 43 58 / .62);text-align:center;margin-bottom:18px">Lägg till ett kort i AdRaze Wallet så kan Falk betala åt dig.</p>'
      + '<div style="display:flex;gap:9px"><button id="kbuy-cancel" class="btn btn-ghost" style="flex:1;height:44px">Avbryt</button><button id="kbuy-wallet" class="btn btn-safe" style="flex:1;height:44px">Öppna Wallet</button></div>');
    ov.querySelector('#kbuy-cancel').addEventListener('click', () => ov.remove());
    ov.querySelector('#kbuy-wallet').addEventListener('click', () => { ov.remove(); openWallet(); });
    return;
  }
  const opts = cards.map((c, i) => '<option value="' + i + '">' + escapeHtml(cardLabel(c)) + '</option>').join('');
  const ov = kbuyOverlay(
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><div style="font-size:16px;font-weight:800;color:var(--color-navy-900)">Falk vill göra ett köp åt dig</div></div>'
    + '<div style="background:var(--color-paper);border:1px solid var(--color-line);border-radius:14px;padding:14px 16px;margin-bottom:14px">'
    +   '<div style="font-size:15px;font-weight:700;color:var(--color-navy-900)">' + escapeHtml(order.desc) + '</div>'
    +   '<div style="font-size:13px;color:rgb(28 43 58 / .6);margin-top:2px">från ' + escapeHtml(order.merchant) + '</div>'
    +   (order.amount ? '<div style="font-size:22px;font-weight:800;color:var(--color-navy-900);margin-top:8px">' + escapeHtml(order.amount) + '</div>' : '')
    + '</div>'
    + '<label style="display:block;font-size:12px;font-weight:700;color:rgb(28 43 58 / .7);margin-bottom:6px">Betala med</label>'
    + '<select id="kbuy-card" style="width:100%;height:42px;border:1px solid var(--color-line);border-radius:11px;padding:0 12px;font-size:14px;color:var(--color-navy-900);background:#fff;margin-bottom:14px">' + opts + '</select>'
    + '<div id="kbuy-scan" style="border:1px solid rgba(23,138,90,.25);background:rgba(23,138,90,.05);border-radius:13px;padding:12px 14px;font-size:12.5px;color:var(--color-navy-900);line-height:1.7"></div>'
    + '<p style="font-size:13px;font-weight:700;color:var(--color-navy-900);text-align:center;margin:14px 0">Är du säker på att detta är rätt?</p>'
    + '<div style="display:flex;gap:9px"><button id="kbuy-cancel" class="btn btn-ghost" style="flex:1;height:46px">Avbryt</button><button id="kbuy-go" class="btn btn-safe" style="flex:1;height:46px">Ja, godkänn köp</button></div>'
    + '<div style="font-size:11px;color:rgb(28 43 58 / .4);text-align:center;margin-top:12px">Demoläge – ingen riktig betalning genomförs.</div>');
  const scan = ov.querySelector('#kbuy-scan');
  const renderScan = () => {
    const c = cards[+ov.querySelector('#kbuy-card').value] || cards[0];
    scan.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Falks koll innan betalning</div>'
      + 'Betalar med ' + escapeHtml(cardLabel(c)) + '<br>'
      + 'Mottagare: ' + escapeHtml(order.merchant) + '<br>'
      + 'Dubbelkolla: rätt vara (<b>' + escapeHtml(order.desc) + '</b>)' + (order.amount ? ' och rätt summa (<b>' + escapeHtml(order.amount) + '</b>)' : '') + '?';
  };
  renderScan();
  ov.querySelector('#kbuy-card').addEventListener('change', renderScan);
  ov.querySelector('#kbuy-cancel').addEventListener('click', () => { ov.remove(); showToast('Köpet avbröts.'); });
  ov.querySelector('#kbuy-go').addEventListener('click', () => {
    const c = cards[+ov.querySelector('#kbuy-card').value] || cards[0];
    const btn = ov.querySelector('#kbuy-go'); btn.disabled = true; btn.textContent = 'Betalar…';
    setTimeout(() => {
      ov.firstElementChild.innerHTML = '<div style="text-align:center;padding:8px 4px">'
        + ''
        + '<div style="font-size:18px;font-weight:800;color:var(--color-navy-900);margin-bottom:6px">Beställning lagd!</div>'
        + '<p style="font-size:13.5px;color:rgb(28 43 58 / .62);line-height:1.55;margin-bottom:6px">' + escapeHtml(order.desc) + ' från <b>' + escapeHtml(order.merchant) + '</b>' + (order.amount ? ' – ' + escapeHtml(order.amount) : '') + ' betalt med ' + escapeHtml(cardLabel(c)) + '.</p>'
        + '<p style="font-size:12px;color:rgb(28 43 58 / .45);margin-bottom:16px">Demo – ingen riktig betalning gjordes.</p>'
        + '<button id="kbuy-done" class="btn btn-safe" style="height:44px;padding:0 26px">Klar</button></div>';
      ov.querySelector('#kbuy-done').addEventListener('click', () => ov.remove());
    }, 900);
  });
}

/* ── Wallet-notiser (spara vid köp / fyll i) ── */
function hideBar(id) { $(id).style.display = 'none'; const open = ['infobar', 'wsavebar', 'wfillbar'].some((b) => $(b) && $(b).style.display === 'flex'); if (!open) window.view.insetTop(0); }
function showBar(id) { ['infobar', 'wsavebar', 'wfillbar'].forEach((b) => { if (b !== id && $(b)) $(b).style.display = 'none'; }); $(id).style.display = 'flex'; window.view.insetTop(56); }
let wlSaveOffer = null;
window.wallet.onOffer((c) => {
  wlSaveOffer = c;
  $('wsavebar-sub').textContent = `${c.brand || 'Kort'} •••• ${c.last4} · sparas krypterat på din dator`;
  showBar('wsavebar');
});
$('wsavebar-save').addEventListener('click', async () => { if (wlSaveOffer) await window.wallet.save(wlSaveOffer); wlSaveOffer = null; hideBar('wsavebar'); showToast('Kort sparat i AdRaze Wallet.'); });
$('wsavebar-no').addEventListener('click', () => { wlSaveOffer = null; hideBar('wsavebar'); });
let wlFillId = null;
window.wallet.onFillOffer((cards) => {
  if (!cards || !cards.length) return;
  const c = cards[0]; wlFillId = c.id;
  $('wfillbar-sub').textContent = `${c.brand || 'Kort'} •••• ${c.last4}${c.holder ? ' · ' + c.holder : ''}`;
  showBar('wfillbar');
});
$('wfillbar-fill').addEventListener('click', () => { if (wlFillId) window.wallet.fillNow(wlFillId); hideBar('wfillbar'); });
$('wfillbar-no').addEventListener('click', () => { wlFillId = null; hideBar('wfillbar'); });

/* ── Toppsajter-läge (mina genvägar / mest besökta) ── */
let topSitesMode = 'favorites';
try { if (localStorage.getItem('skoll-topsites') === 'frequent') topSitesMode = 'frequent'; } catch {}
function applyTopSitesMode() {
  $('seg-fav').classList.toggle('on', topSitesMode === 'favorites');
  $('seg-freq').classList.toggle('on', topSitesMode === 'frequent');
  renderShortcuts();
}
$('seg-fav').addEventListener('click', () => { topSitesMode = 'favorites'; try { localStorage.setItem('skoll-topsites', 'favorites'); } catch {} applyTopSitesMode(); });
$('seg-freq').addEventListener('click', () => { topSitesMode = 'frequent'; try { localStorage.setItem('skoll-topsites', 'frequent'); } catch {} applyTopSitesMode(); });

/* ── Start ── */
tickClock(); setInterval(tickClock, 15000);
greet(); setInterval(greet, 60000); // uppdatera hälsningen om timmen rullar över
applyStoredBg(); applyTopSitesMode(); initAdblock();
sendBounds();
restoreTabs();
renderBookmarkBar();
setTimeout(maybeShowDefaultBanner, 2500);
setTimeout(sendBounds, 300);

/* ── Hacker-intro (enkel välkomst, första gången) ── */
function runHackerIntro(force) {
  try { if (!force && localStorage.getItem('adraze-hacker-intro-v3')) return; } catch {}
  const ov = $('hxintro'); if (!ov) return;
  ov.style.display = 'flex'; void ov.offsetWidth; ov.classList.remove('gone');
  let done = false;
  function finish() {
    if (done) return; done = true;
    try { localStorage.setItem('adraze-hacker-intro-v3', '1'); } catch {}
    ov.classList.add('gone');
    setTimeout(() => { ov.style.display = 'none'; }, 550);
    const s = $('nt-search'); if (s) try { s.focus(); } catch {}
  }
  ov.addEventListener('click', finish);
  document.addEventListener('keydown', (e) => { if (ov.style.display !== 'none' && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) finish(); });
}

window.__hackerIntro = () => runHackerIntro(true);
runHackerIntro(false);

/* ── Byter du från en annan webbläsare? Erbjud flytten en gång, efter introt ── */
async function maybeShowFlyttBanner() {
  try {
    if (windowIncognito) return;
    if (localStorage.getItem('adraze-flytt-erbjuden')) return;
    const intro = $('hxintro');
    if (intro && intro.style.display === 'flex') { setTimeout(maybeShowFlyttBanner, 1000); return; }
    if (document.getElementById('defbrowser-banner')) { setTimeout(maybeShowFlyttBanner, 3000); return; }   // inte två notiser på varandra
    let lista = []; try { lista = await window.view.importKallor(); } catch {}
    if (!Array.isArray(lista) || !lista.length) return;
    localStorage.setItem('adraze-flytt-erbjuden', '1');
    const forsta = lista[0];
    const namn = lista.length === 1 ? forsta.namn : '';
    visaNotis({
      id: 'flytt-banner', ikon: 'i-flytt',
      titel: namn ? tw('Kommer du från') + ' ' + namn + '?' : tw('Kommer du från en annan webbläsare?'),
      under: tw('Ta med flikar, inloggningar, bokmärken och inställningar.'),
      knapp: tw('Ta med allt'), sek: tw('Nej tack'),
      onKnapp: async (el) => {
        el.stang(); openPasswords();
        // Välj webbläsaren direkt så att det bara är att trycka på Importera
        for (let i = 0; i < 20 && !document.querySelector('#imp-src .imp-b'); i++) await new Promise((r) => setTimeout(r, 100));
        const b = document.querySelector('#imp-src .imp-b'); if (b) b.click();
        const kort = document.querySelector('.imp-del'); if (kort) try { kort.scrollIntoView({ block: 'start' }); } catch {}
      },
    });
  } catch {}
}
setTimeout(maybeShowFlyttBanner, 1200);

/* ── Familj: föräldrapanel, barn-blocklistor, öppen insyn ── */
// (FAM_KEY, famLoad, famSave och `let fam` ligger högst upp vid kontot – se "Familj + barnläge")
function famHost(u) {
  // Ett ord utan punkt ("facebook") är ingen adress: normalizeUrl gör det till en sökning, och då spärrades sökmotorn
  const r = String(u || '').trim(); if (!r || (!r.includes('.') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(r))) return '';
  try { return famNorm(new URL(normalizeUrl(u)).hostname); } catch { return famNorm(String(u || '').replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]); } }
function famChildById(id) { return fam.children.find((c) => c.id === id); }
function famActive() { return fam.activeChild ? famChildById(fam.activeChild) : null; }
function famBlocked(url) {
  if (famLocked()) {
    let u; try { u = new URL(normalizeUrl(url)); } catch { return false; }
    if (u.protocol === 'https:' && famNorm(u.hostname) === 'adraze.app' && u.pathname === '/app-google') return false;   // "Fortsätt med Google"
    return /^https?:$/.test(u.protocol) && !famLasOk(famNorm(u.hostname));
  }
  // Spärrarna gäller på barnets konto och när föräldern valt "Aktivera här" för ett barn, annars inte
  const c = famActive();
  if (!c && !(account && account.isChild)) return false;
  const h = famHost(url); if (!h) return false;
  const traff = (b) => { b = famNorm(b); return !!b && (h === b || h.endsWith('.' + b)); };
  if (FAM_ALLTID.some(traff)) return true;
  if (!c) return false;
  if (!(c.blocklist || []).some(traff)) return false;
  const now = Date.now();
  const allowed = (c.allows || []).some((a) => a && a.until > now && traff(a.host));  // tillfälligt tillåten?
  return !allowed;
}
// Kolla aktiv flik – om en tillfällig tillåtelse gått ut och barnet är kvar på sidan → blockera igen
function enforceActiveTab() {
  if (!account || !account.isChild || !active || !active.url) return;
  if (famBlocked(active.url)) showBlockScreen(active.url);
}
let _childSyncTimer = null, _allowTicker = null, _prevAllowHosts = '';
function startChildSync() {
  stopChildSync();
  if (!account || !account.isChild) return;
  _childSyncTimer = setInterval(() => { syncChild(); }, 12000);   // hämta nya/ändrade tillåtelser (utan omstart)
  setTimeout(ensureAllowTicker, 0);   // OBS: deferra — vid boot körs startChildSync INNAN `let fam` initierats (TDZ)
}
function ensureAllowTicker() {   // 1s-nedräknaren körs BARA när det finns en aktiv tillåtelse
  const c = famActive(); const now = Date.now();
  const hasActive = ((c && c.allows) || []).some((a) => a && a.until > now);
  if (hasActive && !_allowTicker) _allowTicker = setInterval(updateAllowTimer, 1000);
  updateAllowTimer();
}
function stopChildSync() {
  if (_childSyncTimer) { clearInterval(_childSyncTimer); _childSyncTimer = null; }
  if (_allowTicker) { clearInterval(_allowTicker); _allowTicker = null; }
  const chip = $('allow-chip'); if (chip) chip.style.display = 'none'; _prevAllowHosts = '';
}
function updateAllowTimer() {
  const chip = $('allow-chip');
  if (!account || !account.isChild) { if (chip) chip.style.display = 'none'; if (_allowTicker) { clearInterval(_allowTicker); _allowTicker = null; } return; }
  const c = famActive(); const now = Date.now();
  const acts = ((c && c.allows) || []).filter((a) => a && a.until > now).sort((x, y) => x.until - y.until);
  const hostsKey = acts.map((a) => a.host).sort().join(',');
  if (_prevAllowHosts && hostsKey !== _prevAllowHosts && typeof enforceActiveTab === 'function') enforceActiveTab();  // något gick ut → återblock aktiv flik
  _prevAllowHosts = hostsKey;
  // står barnet på blockeringssidan och sidan just blivit tillåten → gå in automatiskt (ingen omstart)
  const kb = $('kidblock');
  if (kb && kb.style.display !== 'none' && !kb.classList.contains('kb-ja') && !_kbVantar && kb.dataset.url && typeof famBlocked === 'function' && !famBlocked(kb.dataset.url)) {
    const u = kb.dataset.url; kb.style.display = 'none';
    try { if (typeof guardedNavigate === 'function' && active) guardedNavigate(active, u); } catch {}
  }
  if (!chip) return;
  if (!acts.length) { chip.style.display = 'none'; if (_allowTicker) { clearInterval(_allowTicker); _allowTicker = null; } return; }  // inga tillåtelser → stoppa 1s-tickern
  const a = acts[0]; const s = Math.max(0, Math.floor((a.until - now) / 1000)); const mm = Math.floor(s / 60), ss = s % 60;
  const txt = $('allow-chip-txt');
  if (txt) txt.textContent = a.host.replace(/^www\./, '').slice(0, 16) + ' ' + mm + ':' + ('0' + ss).slice(-2) + (acts.length > 1 ? ' +' + (acts.length - 1) : '');
  chip.style.display = 'inline-flex';
}
// Barnet med exakt det namnet – aldrig en gissning (Falk kan ha fått namnet från en sida den läst)
function famBarnMedNamn(namn) { const n = String(namn || '').trim().toLowerCase(); return n ? (fam.children.find((x) => String(x.name || '').toLowerCase() === n) || null) : null; }
// Exponera för Falk-agenten ("blockera X för barnet")
window.famBlockFor = function (childName, hosts) {
  if (account && account.isChild) return 0;   // bara föräldern styr spärrar
  const c = famBarnMedNamn(childName);   // okänt namn → inget händer (förr: "första barnet" som reserv)
  if (!c) return 0; let n = 0;
  (Array.isArray(hosts) ? hosts : [hosts]).forEach((raw) => { const h = famHost(raw); if (h && !c.blocklist.includes(h)) { c.blocklist.push(h); n++; } });
  if (n) { famSave(); famPushBlocklist(c); renderFam(); }
  return n;
};
// Tillåt (avblockera) igen — förälder säger ja
window.famUnblockFor = function (childName, hosts) {
  if (account && account.isChild) return 0;   // barn kan inte av-blockera
  const c = famBarnMedNamn(childName);   // okänt namn → inget händer (förr: "första barnet" som reserv)
  if (!c) return 0; let n = 0;
  (Array.isArray(hosts) ? hosts : [hosts]).forEach((raw) => { const h = famHost(raw); const i = (c.blocklist || []).indexOf(h); if (i >= 0) { c.blocklist.splice(i, 1); n++; } });
  if (n) { famSave(); famPushBlocklist(c); renderFam(); }
  return n;
};
// Förälder tillåter en sida tillfälligt (minuter) för ett barn
async function famAllowFor(childName, host, minutes) {
  if (!account || !account.token || account.isChild) return false;
  const c = famBarnMedNamn(childName);   // okänt namn → inget händer (förr: "första barnet" som reserv)
  if (!c) return false;
  const r = await window.family.allow(account.token, c.id, famHost(host), minutes).catch(() => ({ ok: false }));
  return !!(r && r.ok);
}
function allowLabel(minutes) { return minutes >= 60 ? (minutes % 60 === 0 ? (minutes / 60) + ' h' : (minutes / 60).toFixed(1) + ' h') : minutes + ' min'; }
async function doAllow(host, childName, minutes) {
  if (typeof famSyncParent === 'function') await famSyncParent();
  const ok = await famAllowFor(childName, host, minutes);
  if (ok) { if (typeof showToast === 'function') showToast('Tillät ' + host + ' i ' + allowLabel(minutes)); }
  else if (typeof showToast === 'function') showToast('Kunde inte tillåta.');
}
async function doAllowAlways(host, childName) {
  if (typeof famSyncParent === 'function') await famSyncParent();
  if (typeof window.famUnblockFor === 'function') window.famUnblockFor(childName, [host]);
  if (typeof showToast === 'function') showToast('Tillät ' + host + ' för alltid');
}
function allowMenu(host, childName, anchorEl) {
  if (typeof closeMsgMenu === 'function') closeMsgMenu();
  const menu = document.createElement('div'); menu.id = 'fr-msgmenu';
  menu.style.cssText = 'position:fixed;z-index:250;background:#fff;border:1px solid var(--color-line);border-radius:12px;box-shadow:0 12px 34px rgba(8,20,35,.22);padding:5px;min-width:186px;';
  const head = document.createElement('div'); head.textContent = 'Tillåt ' + host + '…'; head.style.cssText = 'padding:8px 12px 6px;font-size:11.5px;font-weight:700;color:rgb(28 43 58 / .55);'; menu.appendChild(head);
  const item = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'display:block;width:100%;text-align:left;padding:9px 12px;border:0;background:none;border-radius:8px;font-size:13px;cursor:pointer;color:var(--color-navy-900);'; b.addEventListener('mouseenter', () => (b.style.background = 'var(--color-paper)')); b.addEventListener('mouseleave', () => (b.style.background = 'none')); b.addEventListener('click', (e) => { e.stopPropagation(); if (typeof closeMsgMenu === 'function') closeMsgMenu(); fn(); }); menu.appendChild(b); };
  item('i 15 minuter', () => doAllow(host, childName, 15));
  item('i 1 timme', () => doAllow(host, childName, 60));
  item('i 3 timmar', () => doAllow(host, childName, 180));
  item('Alltid', () => doAllowAlways(host, childName));
  document.body.appendChild(menu);
  const r = anchorEl.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', closeMsgMenu, { once: true }), 0);
}
// Punycode → läsbart namn (xn--skerkoll-0za.se → säkerkoll.se), RFC 3492
function visaDoman(host) {
  return String(host || '').split('.').map((l) => {
    if (!/^xn--/i.test(l)) return l;
    try {
      const s = l.slice(4).toLowerCase(); const d = s.lastIndexOf('-'); const ut = d > 0 ? [...s.slice(0, d)] : [];
      let n = 128, bias = 72, i = 0, p = d > 0 ? d + 1 : 0;
      const dig = (c) => { const k = c.charCodeAt(0); return k - 48 < 10 ? k - 22 : k - 97 < 26 ? k - 97 : 36; };
      while (p < s.length) {
        const oi = i; let w = 1;
        for (let k = 36; ; k += 36) { const v = dig(s[p++]); if (v >= 36) throw 0; i += v * w; const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias; if (v < t) break; w *= 36 - t; }
        const len = ut.length + 1; let delta = oi === 0 ? Math.floor((i - oi) / 700) : (i - oi) >> 1; delta += Math.floor(delta / len); let k = 0;
        while (delta > 455) { delta = Math.floor(delta / 35); k += 36; } bias = k + Math.floor(36 * delta / (delta + 38));
        n += Math.floor(i / len); i %= len; ut.splice(i++, 0, String.fromCodePoint(n));
      }
      return ut.join('');
    } catch { return l; }
  }).join('.');
}
// Vilken sida barnet ska fråga om: spärrlistans post som träffade (så ett ja gäller hela sajten), annars värdnamnet
function kbFragaHost(url) {
  const h = famHost(url); if (!h) return '';
  if (FAM_ALLTID.some((b) => { b = famNorm(b); return h === b || h.endsWith('.' + b); })) return '';   // går aldrig att tillåta
  const c = famActive(); const tr = ((c && c.blocklist) || []).map(famNorm).find((b) => b && (h === b || h.endsWith('.' + b)));
  return tr || h;
}
var _kbVantar = null;   // { id, host, url } medan barnet väntar på svar
function kbStang(hem) {
  const ov = $('kidblock'); if (!ov) return;
  ov.style.display = 'none'; ov.classList.remove('kb-ja');
  if (_kbVantar && _kbVantar.poll) clearInterval(_kbVantar.poll);
  _kbVantar = null;
  if (hem && active && active.url && famBlocked(active.url)) { active.url = ''; if (addressInput) addressInput.value = ''; }
  if (typeof showActiveTab === 'function') showActiveTab();
}
function kbRita(ov, { tecken, dom, rubrik, text, inne }) {
  ov.innerHTML = '<div class="kb-jatte">' + escapeHtml(tecken) + '</div><div class="kb-text">'
    + (dom ? '<div class="kb-dom">' + escapeHtml(dom) + '</div>' : '')
    + '<h1>' + escapeHtml(rubrik) + '</h1>' + (text ? '<p>' + text + '</p>' : '') + (inne || '') + '</div>';
}
// Helskärms-spärrsida för barnet: stängd → fråga om lov → väntar → ja/nej
function showBlockScreen(url, lage) {
  let host; try { host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, ''); } catch { host = String(url || ''); }
  try { window.view.hide(); } catch {}   // dölj webbvyn så rutan täcker sidan
  let ov = $('kidblock');
  if (!ov) { ov = document.createElement('div'); ov.id = 'kidblock'; document.body.appendChild(ov); }
  ov.dataset.url = url;   // så nedräknaren kan öppna sidan automatiskt när den blir tillåten
  ov.classList.remove('kb-ja');
  ov.style.display = 'block';
  const dom = visaDoman(host);
  const q = (s) => ov.querySelector(s);
  if (famLocked()) {   // barnet är utloggat → låst tills en förälder (eller barnet med sin kod) loggar in
    kbRita(ov, { tecken: ':(', dom, rubrik: 'AdRaze är låst.', text: 'Barnkontot är utloggat. Be en förälder logga in, eller logga in igen med din barnkod.',
      inne: '<div class="kb-knappar"><button class="liq" id="kidblock-login">Logga in</button><button class="liq-ghost" id="kidblock-back">Tillbaka</button></div>' });
    q('#kidblock-login').onclick = () => { kbStang(true); try { openLogin(); } catch {} };
    q('#kidblock-back').onclick = () => kbStang(true);
    return;
  }
  const fh = kbFragaHost(url);
  const kanFraga = !!(fh && account && account.isChild && account.token);
  if (_kbVantar && _kbVantar.host === fh && !lage) lage = 'vantar';
  if (lage === 'fraga') {
    kbRita(ov, { tecken: ':/', dom, rubrik: 'Varför vill du dit?',
      inne: '<div class="kb-in"><label for="kb-varfor">Skriv några ord till din förälder (om du vill)</label><input id="kb-varfor" maxlength="200" placeholder="Jag behöver den till skolan" autocomplete="off"></div>'
        + '<div class="kb-knappar"><button class="liq" id="kb-skicka">Skicka frågan</button><button class="liq-ghost" id="kb-avbryt">Avbryt</button></div><div class="kb-fel" id="kb-fel"></div>' });
    const inp = q('#kb-varfor'); setTimeout(() => { try { inp.focus(); } catch {} }, 30);
    const skicka = async () => {
      const b = q('#kb-skicka'); b.disabled = true; q('#kb-fel').textContent = '';
      const r = await window.family.ask(account.token, fh, inp.value).catch(() => null);
      if (r && r.ok && r.id) { _kbVantar = { id: r.id, host: fh, url }; showBlockScreen(url, 'vantar'); return; }
      b.disabled = false; q('#kb-fel').textContent = (r && r.message) || 'Frågan gick inte iväg. Kolla internet och försök igen.';
    };
    q('#kb-skicka').onclick = skicka;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') skicka(); });
    q('#kb-avbryt').onclick = () => showBlockScreen(url, 'stangd');
    return;
  }
  if (lage === 'vantar' && _kbVantar) {
    kbRita(ov, { tecken: ':|', dom, rubrik: 'Frågan är skickad.', text: 'Din förälder får frågan i sin AdRaze. Säger hen ja öppnas sidan av sig själv.',
      inne: '<div class="kb-vantar"><i></i>Väntar på svar …</div><div class="kb-knappar"><button class="liq-ghost" id="kidblock-back">Tillbaka</button></div>' });
    q('#kidblock-back').onclick = () => kbStang(true);
    if (!_kbVantar.poll) _kbVantar.poll = setInterval(() => { try { syncChild(); } catch {} }, 4000);   // tätare koll medan barnet väntar
    return;
  }
  if (lage === 'nej') {
    kbRita(ov, { tecken: ':(', dom, rubrik: 'Svaret blev nej.', text: 'Din förälder vill inte att du går in på ' + escapeHtml(dom) + ' just nu. Prata gärna med hen om det.',
      inne: '<div class="kb-knappar"><button class="liq" id="kidblock-back">Tillbaka</button></div>' });
    q('#kidblock-back').onclick = () => kbStang(true);
    return;
  }
  kbRita(ov, { tecken: ':(', dom, rubrik: 'Den här är stängd.',
    text: kanFraga ? 'Din familj har spärrat sidan i AdRaze. Tycker du att du behöver den? Fråga, så svarar de direkt.' : 'Din familj har spärrat sidan i AdRaze.',
    inne: '<div class="kb-knappar">' + (kanFraga ? '<button class="liq" id="kb-fraga">Fråga om lov</button><button class="liq-ghost" id="kidblock-back">Tillbaka</button>' : '<button class="liq" id="kidblock-back">Tillbaka</button>') + '</div>' });
  if (kanFraga) q('#kb-fraga').onclick = () => showBlockScreen(url, 'fraga');
  q('#kidblock-back').onclick = () => kbStang(true);
}
// Barnets svar från servern (syncChild): nej → visa nej, ja sköts av nedräknaren som öppnar sidan
function kbSvar(fragor) {
  if (!_kbVantar || !Array.isArray(fragor)) return;
  const f = fragor.find((x) => x && x.id === _kbVantar.id); if (!f || !f.svar) return;
  const ov = $('kidblock'); const u = _kbVantar.url;
  if (_kbVantar.poll) clearInterval(_kbVantar.poll);
  _kbVantar = null;
  if (!ov || ov.style.display === 'none') return;
  if (f.svar === 'nej') { showBlockScreen(u, 'nej'); return; }
  // ja: kort ":)" innan sidan öppnas (blocklistan/tillåtelsen är redan uppdaterad i fam)
  ov.classList.add('kb-ja');
  kbRita(ov, { tecken: ':)', dom: visaDoman(famHost(u)), rubrik: 'Du fick lov!', text: f.minuter ? 'Du får vara där i ' + escapeHtml(allowLabel(f.minuter)) + '.' : 'Sidan är öppen för dig nu.' });
  setTimeout(() => { if (ov.style.display === 'none') return; ov.style.display = 'none'; ov.classList.remove('kb-ja'); try { if (active) guardedNavigate(active, u); } catch {} }, 1400);
}
function renderFam() {
  const host = $('fam-body'); if (!host) return;
  if (!account) {
    const _fa = $('fam-add'); if (_fa) _fa.style.display = 'none';
    const _lead = document.querySelector('.set-panel[data-cat="familj"] .set-lead');
    if (_lead) _lead.textContent = 'Skydda dina barn på nätet — logga in för att börja.';
    host.innerHTML = '<div class="fam-create"><p>Logga in för att skapa din familj och skydda dina barn.</p><button id="fam-login" class="btn btn-safe" style="height:42px;padding:0 18px;">Logga in</button></div>';
    const _lb = document.getElementById('fam-login'); if (_lb) _lb.addEventListener('click', () => openLogin());
    return;
  }
  const isKid = !!(account && account.isChild);
  const lead = document.querySelector('.set-panel[data-cat="familj"] .set-lead');
  if (lead) lead.textContent = isKid ? 'Här är reglerna dina föräldrar satt upp.' : 'Skydda dina barn på nätet — öppet och tillsammans.';
  const openNote = document.querySelector('.set-panel[data-cat="familj"] .fam-open span');
  if (openNote) openNote.textContent = isKid ? 'Dina föräldrar kan se din historik — det är okej och tryggt.' : 'Öppet, inte spionage. Barnet ser alltid att du kan se historiken — det bygger förtroende.';
  if (isKid) { const fa = $('fam-add'); if (fa) fa.style.display = 'none'; renderFamChild(host); return; }  // barn = skrivskyddad vy
  if (!fam.children.length) {
    host.innerHTML = '<div class="fam-create"><p>Skapa din familj och lägg till dina barn. Du bestämmer vad de får se — och de vet att du kan se historiken.</p><button id="fam-first" class="btn btn-safe" style="height:42px;padding:0 18px;">Lägg till ditt första barn</button></div>';
    const fa = $('fam-add'); if (fa) fa.style.display = 'none';
    const fb = document.getElementById('fam-first'); if (fb) fb.addEventListener('click', famAddChild);
    return;
  }
  const fa = $('fam-add'); if (fa) fa.style.display = '';
  host.innerHTML = fam.children.map(famChildCard).join('');
  fam.children.forEach((c) => {
    const el = host.querySelector('[data-child="' + c.id + '"]'); if (!el) return;
    el.querySelector('[data-a=active]').addEventListener('click', () => { fam.activeChild = (fam.activeChild === c.id ? null : c.id); famSave(); renderFam(); applyKidIndicator(); });
    el.querySelector('[data-a=del]').addEventListener('click', async () => {
      // Barnet tas bort på servern också, annars kommer det tillbaka vid nästa synk
      if (!c.local && account && account.token) {
        const r = await window.family.removeChild(account.token, c.id).catch(() => ({ ok: false }));
        if (!r || !r.ok) { showToast((r && r.message) || 'Kunde inte ta bort barnet just nu.'); return; }
      }
      fam.children = fam.children.filter((x) => x.id !== c.id); if (fam.activeChild === c.id) fam.activeChild = null; famSave(); renderFam(); applyKidIndicator();
    });
    const cp = el.querySelector('[data-a=copy]'); if (cp) cp.addEventListener('click', () => { try { navigator.clipboard.writeText(c.code); } catch {} showToast(tn('Kod kopierad — ge den till {n}', c.name)); });
    const hb = el.querySelector('[data-a=hist]'); if (hb) hb.addEventListener('click', () => famShowHistory(c.id, c.name));
    el.querySelectorAll('.fam-fraga button[data-svar]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.fam-fraga button').forEach((x) => (x.disabled = true));
      famSvara(c, Number(b.closest('.fam-fraga').dataset.fraga), b.dataset.svar, Number(b.dataset.min || 0));
    }));
    const ro = el.querySelector('[data-a=rotate]');
    if (ro) ro.addEventListener('click', async () => {
      const ok = await famConfirm(tn('Byt kod för {n}?', c.name), tn('Den gamla koden slutar fungera direkt, och om {n} är inloggad loggas hän ut. Du får en ny kod att ge {n}.', c.name), 'Byt kod');
      if (!ok) return;
      const r = await window.family.rotateCode(account.token, c.id).catch(() => ({ ok: false }));
      if (r && r.ok && r.code) { c.code = r.code; c.sessions = 0; famSave(); renderFam(); showChildCode(c.name, r.code); return; }
      if (r && r.error === 'no_session') { showToast('Din inloggning har g\u00e5tt ut \u2014 logga in igen f\u00f6r att styra barnens konton.'); try { openLogin(); } catch {} return; }
      if (r && r.error === 'not_your_child') { showToast('Barnet finns inte l\u00e4ngre \u2014 uppdaterar listan.'); if (typeof famSyncParent === 'function') { try { await famSyncParent(); } catch {} } return; }
      showToast((r && r.message) || 'Kunde inte byta kod just nu. Kontrollera din uppkoppling.');
    });
    const se = el.querySelector('[data-a=sessions]');
    if (se) se.addEventListener('click', () => famShowSessions(c.id, c.name));
    el.querySelectorAll('.fam-tag button[data-host]').forEach((b) => b.addEventListener('click', () => { const x = famChildById(c.id) || c; x.blocklist = (x.blocklist || []).filter((h) => h !== b.dataset.host); famSave(); famPushBlocklist(x); renderFam(); }));
    el.querySelectorAll('.fam-tag button[data-t]').forEach((b) => b.addEventListener('click', () => allowMenu(b.dataset.t, c.name, b)));  // tillåt tillfälligt
    const inp = el.querySelector('.fam-addsite input');
    // Barnet slås upp på nytt: synken byter ut objekten medan föräldern skriver
    const addSite = () => { const x = famChildById(c.id) || c; const h = famHost(inp.value); if (!h) { if (inp.value.trim()) showToast('Skriv hela adressen, till exempel facebook.com'); return; } if (!x.blocklist.includes(h)) { x.blocklist.push(h); famSave(); famPushBlocklist(x); renderFam(); } };
    el.querySelector('.fam-addsite button').addEventListener('click', addSite);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSite(); });
  });
}
// Barnets egen vy: ser reglerna men kan INTE ändra/ta bort dem
function renderFamChild(host) {
  const c = famActive() || (fam.children && fam.children[0]);
  const bl = (c && c.blocklist) || [];
  let html = '<div class="fam-child">';
  html += '<div class="fam-sub">Sidor dina föräldrar blockerat</div>';
  if (bl.length) html += '<div class="fam-bl">' + bl.map((h) => '<span class="fam-tag" style="padding-right:12px;">' + escapeHtml(h) + '</span>').join('') + '</div>';
  else html += '<div class="fam-none">Inga blockerade sidor just nu.</div>';
  const now = Date.now();
  const al = ((c && c.allows) || []).filter((a) => a && a.until > now);
  if (al.length) html += '<div class="fam-sub">Öppet en stund till</div><div class="fam-bl">' + al.map((a) => '<span class="fam-tag" style="background:rgba(23,138,90,.08);border-color:rgba(23,138,90,.25);padding-right:12px;">' + escapeHtml(a.host) + ' <span style="opacity:.6">till ' + fmtTime(a.until) + '</span></span>').join('') + '</div>';
  html += '<div class="fam-krypto">Vill du besöka en blockerad sida? Fråga dina föräldrar, så kan de tillåta den i <b>AdRaze Familj</b>.</div>';
  html += '</div>';
  host.innerHTML = html;
}
function fmtTime(ts) { const d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function fmtHistTime(ts) {
  const d = new Date(ts), now = new Date();
  const hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  if (d.toDateString() === now.toDateString()) return 'idag ' + hh;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'igår ' + hh;
  return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + hh;
}
// Förälder ser barnets historik (öppen insyn)
async function famShowHistory(childId, childName) {
  if (document.getElementById('fam-histmodal')) return;
  const ov = document.createElement('div'); ov.id = 'fam-histmodal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(5,12,22,.5);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
  ov.innerHTML = '<div style="width:min(480px,95vw);max-height:80vh;display:flex;flex-direction:column;background:#fff;border-radius:18px;padding:22px;box-shadow:0 30px 70px rgba(8,20,35,.4)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><div style="font-size:17px;font-weight:800;color:var(--color-navy-900)">' + escapeHtml(tn('Historik för {n}', childName)) + '</div><button id="fh-close" style="border:0;background:none;font-size:22px;cursor:pointer;color:var(--color-navy-600);line-height:1">×</button></div>'
    + '<p style="font-size:12.5px;color:rgb(28 43 58 / .55);margin-bottom:14px">' + escapeHtml(tn('Öppen insyn — {n} vet att du kan se det här.', childName)) + '</p>'
    + '<div id="fh-list" style="overflow-y:auto;flex:1;margin:0 -6px"><div class="fam-none" style="padding:8px 10px">Hämtar…</div></div></div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#fh-close').addEventListener('click', close);
  if (typeof famSyncParent === 'function') { try { await famSyncParent(); } catch {} }   // färska server-id
  const cur = (fam.children || []).find((c) => c.name && c.name.toLowerCase() === String(childName || '').toLowerCase());
  const cid = (cur && cur.id) || childId;
  let r; try { r = await window.family.history(account.token, cid); } catch { r = { ok: false }; }
  const list = ov.querySelector('#fh-list');
  if (!r || !r.ok) {
    const msg = (r && r.error === 'not_your_child') ? escapeHtml(tn('Öppna det här från ditt förälder-konto för att se historik för {n}.', childName)).replace('förälder-konto', '<b>förälder-konto</b>') : 'Kunde inte hämta historiken just nu. Kontrollera din uppkoppling.';
    list.innerHTML = '<div class="fam-none" style="padding:10px;line-height:1.5">' + msg + '</div>'; return;
  }
  const items = r.history || [];
  if (!items.length) { list.innerHTML = '<div class="fam-none" style="padding:8px 10px">Ingen historik än — ' + escapeHtml(childName) + ' har inte surfat något (eller inte loggat in i appen).</div>'; return; }
  list.innerHTML = items.map((e) => {
    let host = e.url; try { host = new URL(e.url).hostname.replace(/^www\./, ''); } catch {}
    return '<div style="display:flex;flex-direction:column;gap:1px;padding:9px 10px;border-bottom:1px solid var(--color-line)">'
      + '<span style="font-size:13.5px;font-weight:600;color:var(--color-navy-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(e.title || host) + '</span>'
      + '<span style="font-size:11.5px;color:rgb(28 43 58 / .5)">' + escapeHtml(host) + ' · ' + fmtHistTime(e.ts) + '</span></div>';
  }).join('');
}
function famFlag(cc) {
  return cc && cc.length === 2 ? cc.toUpperCase() : '';
}
function famRelTime(ts) {
  const s = Math.max(0, Date.now() - (ts || 0)) / 1000;
  if (s < 90) return 'nyss';
  const m = s / 60; if (m < 90) return Math.round(m) + ' min sedan';
  const h = m / 60; if (h < 36) return Math.round(h) + ' tim sedan';
  return Math.round(h / 24) + ' dagar sedan';
}
// Hur länge en enhet varit inloggad (varaktighet sedan inloggning).
function famDuration(ts) {
  let s = Math.max(0, Date.now() - (ts || 0)) / 1000;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return d + ' ' + (d === 1 ? 'dag' : 'dagar') + (h ? ' ' + h + ' tim' : '');
  if (h > 0) return h + ' tim' + (m ? ' ' + m + ' min' : '');
  if (m > 0) return m + ' min';
  return 'mindre än en minut';
}
// Karta + lista över ett barns aktiva inloggningar (IP -> plats), med per-enhet-utloggning.
async function famShowSessions(childId, childName) {
  if (document.getElementById('fam-sessmodal')) return;
  const ov = document.createElement('div'); ov.id = 'fam-sessmodal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:220;background:rgba(5,12,22,.55);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px);';
  ov.innerHTML = '<div style="width:min(700px,96vw);max-height:90vh;display:flex;flex-direction:column;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px rgba(8,20,35,.45)">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px 12px;gap:12px">'
      + '<div><div style="font-size:17px;font-weight:800;color:var(--color-navy-900)">Var är ' + escapeHtml(childName) + ' inloggad?</div>'
      + '<div style="font-size:12.5px;color:rgb(28 43 58 / .55);margin-top:2px">Varje pin är en enhet som är inloggad just nu. Logga ut den du inte känner igen.</div></div>'
      + '<button id="fs-close" style="border:0;background:none;font-size:24px;cursor:pointer;color:var(--color-navy-600);line-height:1;flex:none">×</button></div>'
    + '<div id="fs-map" style="margin:0 20px;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,#dcecfb,#c9e0f4);border:1px solid var(--color-line);min-height:120px"></div>'
    + '<div id="fs-list" style="overflow-y:auto;padding:14px 20px 4px;flex:1"><div style="text-align:center;color:rgb(28 43 58 / .5);padding:28px">Hämtar inloggningar…</div></div>'
    + '<div id="fs-foot" style="padding:12px 20px 18px;border-top:1px solid var(--color-line);display:flex;justify-content:space-between;align-items:center;gap:10px"></div>'
    + '</div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#fs-close').addEventListener('click', close);
  const mapEl = ov.querySelector('#fs-map'), listEl = ov.querySelector('#fs-list'), footEl = ov.querySelector('#fs-foot');

  let r; try { r = await window.family.sessions(account.token, childId); } catch { r = { ok: false }; }
  if (!r || !r.ok) {
    if (r && r.error === 'no_session') { close(); showToast('Din inloggning har gått ut — logga in igen.'); try { openLogin(); } catch {} return; }
    if (r && r.error === 'not_your_child') { close(); showToast('Barnet finns inte längre — uppdaterar listan.'); if (typeof famSyncParent === 'function') { try { await famSyncParent(); } catch {} } return; }
    listEl.innerHTML = '<div style="text-align:center;color:var(--color-danger);padding:28px;line-height:1.5">Kunde inte hämta inloggningarna.<br>Kontrollera din uppkoppling.</div>';
    mapEl.style.display = 'none'; return;
  }
  let sessions = r.sessions || [];
  function syncCard() { const c = (fam.children || []).find((x) => x.id === childId); if (c) { c.sessions = sessions.length; famSave(); renderFam(); } }
  function render() {
    const items = sessions.map((x, i) => Object.assign({}, x, { _n: i + 1 }));
    const pins = items.filter((x) => x.geo && typeof x.geo.lat === 'number').map((x) => {
      const px = (x.geo.lon + 180) * 2, py = (90 - x.geo.lat) * 2;
      return '<g class="fs-pin" data-sid="' + escapeHtml(x.sid) + '" style="cursor:pointer">'
        + '<circle cx="' + px + '" cy="' + py + '" r="10" fill="#2f8fd4"><animate attributeName="r" values="7;16;7" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite"/></circle>'
        + '<circle cx="' + px + '" cy="' + py + '" r="8.5" fill="#e0492f" stroke="#fff" stroke-width="1.6"/>'
        + '<text x="' + px + '" y="' + (py + 3.2) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">' + x._n + '</text></g>';
    }).join('');
    mapEl.style.display = pins ? 'block' : 'none';
    mapEl.innerHTML = '<svg viewBox="0 0 720 360" style="display:block;width:100%;height:auto" preserveAspectRatio="xMidYMid meet">'
      + '<path d="' + (window.__WORLD_PATH || '') + '" fill="#a9c9e8" stroke="#8bb2d8" stroke-width="0.4"/>' + pins + '</svg>';
    if (!sessions.length) { listEl.innerHTML = '<div style="text-align:center;color:rgb(28 43 58 / .5);padding:28px">Ingen är inloggad just nu.</div>'; }
    else listEl.innerHTML = items.map((x) => {
      const place = x.geo ? ((x.geo.city ? x.geo.city + ', ' : '') + (x.geo.country || '')) : 'Okänd plats';
      const flag = x.geo ? famFlag(x.geo.cc) : '';
      const country = x.geo ? (x.geo.country || 'Okänt land') : 'Okänd plats';
      return '<div class="fs-row" data-sid="' + escapeHtml(x.sid) + '" style="border:1px solid var(--color-line);border-radius:13px;margin-bottom:10px;overflow:hidden">'
        + '<div class="fs-head" style="display:flex;align-items:center;gap:12px;padding:12px 13px;cursor:pointer">'
          + '<div style="position:relative;width:34px;flex:none;text-align:center"><span style="font-size:25px">' + flag + '</span>'
            + '<span style="position:absolute;top:-5px;right:-3px;background:#e0492f;color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center">' + x._n + '</span></div>'
          + '<div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700;color:var(--color-navy-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(place) + '</div>'
          + '<div style="font-size:12px;color:rgb(28 43 58 / .55)">inloggad ' + famRelTime(x.created_at) + '</div></div>'
          + '<button class="fs-logout" data-sid="' + escapeHtml(x.sid) + '" style="flex:none;font-size:12.5px;font-weight:700;color:#fff;background:#e0492f;border:0;border-radius:9px;padding:9px 15px;cursor:pointer">Logga ut</button>'
          + '<span class="fs-arrow" style="flex:none;font-size:14px;color:var(--color-navy-600);transition:transform .2s;width:16px;text-align:center">▾</span></div>'
        + '<div class="fs-detail" style="display:none;padding:2px 15px 14px 59px;font-size:13px">'
          + '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--color-line)"><span style="color:rgb(28 43 58 / .55)">Land</span><span style="font-weight:600;color:var(--color-navy-900);text-align:right">' + escapeHtml(country) + '</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--color-line)"><span style="color:rgb(28 43 58 / .55)">Inloggad i</span><span style="font-weight:600;color:var(--color-navy-900);text-align:right">' + famDuration(x.created_at) + '</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--color-line)"><span style="color:rgb(28 43 58 / .55)">IP-adress</span><span style="font-family:ui-monospace,monospace;font-weight:600;color:var(--color-navy-900)">' + escapeHtml(x.ip || 'okänd') + '</span></div>'
        + '</div></div>';
    }).join('');
    footEl.innerHTML = '<span style="font-size:12.5px;color:rgb(28 43 58 / .55)">' + sessions.length + ' aktiva ' + (sessions.length === 1 ? 'inloggning' : 'inloggningar') + '</span>'
      + (sessions.length ? '<button id="fs-all" class="btn btn-ghost" style="height:40px;padding:0 16px;color:#e0492f">Logga ut alla</button>' : '');
    function openRow(sid, scroll) {
      let target = null;
      listEl.querySelectorAll('.fs-row').forEach((row) => { if (row.dataset.sid === sid) target = row; });
      if (!target) return;
      const detail = target.querySelector('.fs-detail'), arrow = target.querySelector('.fs-arrow');
      detail.style.display = 'block'; if (arrow) arrow.style.transform = 'rotate(180deg)';
      if (scroll) { try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {} }
      target.style.transition = 'background .3s'; target.style.background = 'rgba(47,143,212,.15)';
      setTimeout(() => { target.style.background = ''; }, 1000);
    }
    listEl.querySelectorAll('.fs-row').forEach((row) => {
      const head = row.querySelector('.fs-head'), detail = row.querySelector('.fs-detail'), arrow = row.querySelector('.fs-arrow');
      head.addEventListener('click', (e) => {
        if (e.target.closest('.fs-logout')) return;
        const open = detail.style.display === 'block';
        detail.style.display = open ? 'none' : 'block';
        if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
      });
    });
    mapEl.querySelectorAll('.fs-pin').forEach((p) => p.addEventListener('click', () => openRow(p.dataset.sid, true)));
    listEl.querySelectorAll('.fs-logout').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sid = b.dataset.sid; b.disabled = true; b.textContent = '…';
      const rr = await window.family.logoutSession(account.token, childId, sid).catch(() => ({ ok: false }));
      if (rr && rr.ok) { sessions = sessions.filter((y) => y.sid !== sid); showToast('Enheten loggades ut.'); render(); syncCard(); }
      else { b.disabled = false; b.textContent = 'Logga ut'; showToast((rr && rr.message) || 'Kunde inte logga ut den enheten.'); }
    }));
    const all = ov.querySelector('#fs-all');
    if (all) all.addEventListener('click', async () => {
      all.disabled = true; all.textContent = '…';
      const rr = await window.family.logoutChild(account.token, childId).catch(() => ({ ok: false }));
      if (rr && rr.ok) { sessions = []; showToast(childName + ' loggades ut på alla enheter.'); render(); syncCard(); }
      else { all.disabled = false; all.textContent = 'Logga ut alla'; showToast('Kunde inte logga ut alla just nu.'); }
    });
  }
  render();
}
function famConfirm(title, msg, okLabel) {
  return new Promise((resolve) => {
    if (document.getElementById('fam-confirm')) return resolve(false);
    const ov = document.createElement('div'); ov.id = 'fam-confirm';
    ov.style.cssText = 'position:fixed;inset:0;z-index:210;background:rgba(5,12,22,.5);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
    ov.innerHTML = '<div style="width:min(420px,94vw);background:#fff;border-radius:18px;padding:24px;box-shadow:0 30px 70px rgba(8,20,35,.4)">'
      + '<div style="font-size:34px;text-align:center;margin-bottom:8px">\ud83d\udd11</div>'
      + '<div style="font-size:18px;font-weight:800;color:var(--color-navy-900);text-align:center;margin-bottom:8px">' + escapeHtml(title) + '</div>'
      + '<p style="font-size:13.5px;color:rgb(28 43 58 / .6);text-align:center;margin-bottom:18px;line-height:1.5">' + escapeHtml(msg) + '</p>'
      + '<div style="display:flex;gap:9px"><button id="fam-c-no" class="btn btn-ghost" style="flex:1;height:44px">Avbryt</button><button id="fam-c-yes" class="btn btn-safe" style="flex:1;height:44px">' + escapeHtml(okLabel || 'OK') + '</button></div></div>';
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); resolve(v); };
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
    ov.querySelector('#fam-c-no').addEventListener('click', () => done(false));
    ov.querySelector('#fam-c-yes').addEventListener('click', () => done(true));
  });
}
// Barnets frågor om lov: föräldern svarar direkt i kortet
function famFragorHtml(c) {
  const f = (c.requests || []); if (!f.length) return '';
  return '<div class="fam-sub">' + escapeHtml(tn('{n} frågar om lov', c.name)) + '</div><div class="fam-fragor">' + f.map((x) => '<div class="fam-fraga" data-fraga="' + Number(x.id) + '">'
    + '<div class="ff-text"><b>' + escapeHtml(visaDoman(x.host)) + '</b>' + (x.text ? ' – ”' + escapeHtml(x.text) + '”' : '') + '<small>' + escapeHtml(fmtTime(x.skapad)) + '</small></div>'
    + '<button data-svar="ja" data-min="30">Ja, 30 min</button><button data-svar="ja" data-min="60">1 h</button><button data-svar="ja" data-min="0">Alltid</button><button data-svar="nej">Nej</button></div>').join('') + '</div>';
}
async function famSvara(c, id, svar, min) {
  if (!account || !account.token) return;
  const r = await window.family.answer(account.token, id, svar, min).catch(() => null);
  if (!r || !r.ok) { showToast((r && r.message) || 'Kunde inte svara just nu.'); return; }
  c.requests = (c.requests || []).filter((x) => x.id !== id);
  showToast(svar === 'nej' ? tn('Du sa nej till {n}', c.name) : tn('{n} fick lov', c.name));
  try { await famSyncParent(); } catch {}
  renderFam();
}
// Ny fråga från ett barn → notis till föräldern (en gång per fråga)
try { window.family.onOppna(() => { try { openSettings(); showSettingsCat('familj'); } catch {} }); } catch {}
var _famSettaFragor = new Set(JSON.parse(sessionStorage.getItem('adraze-fam-fragor') || '[]'));
function famNyaFragor() {
  let ny = false;
  for (const c of fam.children) for (const f of (c.requests || [])) {
    if (_famSettaFragor.has(f.id)) continue;
    _famSettaFragor.add(f.id); ny = true;
    const titel = tn('{n} frågar om lov', c.name), text = visaDoman(f.host) + (f.text ? ' – ”' + f.text + '”' : '');
    try { window.family.notis(titel, text); } catch {}
    showToast(titel + ': ' + visaDoman(f.host));
  }
  if (ny) try { sessionStorage.setItem('adraze-fam-fragor', JSON.stringify([..._famSettaFragor].slice(-200))); } catch {}
}
function famChildCard(c) {
  const active = fam.activeChild === c.id;
  const tags = (c.blocklist && c.blocklist.length)
    ? '<div class="fam-bl">' + c.blocklist.map((h) => '<span class="fam-tag">' + escapeHtml(h) + '<button data-t="' + escapeHtml(h) + '" title="Tillåt tillfälligt" style="background:rgba(47,143,212,.14);color:#2f8fd4;"><svg class="ic ic-sm"><use href="#i-history"/></svg></button><button data-host="' + escapeHtml(h) + '" title="Ta bort">×</button></span>').join('') + '</div>'
    : '<div class="fam-none">Inga blockerade sidor än.</div>';
  const now = Date.now();
  const aca = (c.allows || []).filter((a) => a && a.until > now);
  const allowsHtml = aca.length ? '<div class="fam-sub">Tillfälligt tillåtet nu</div><div class="fam-bl">' + aca.map((a) => '<span class="fam-tag" style="background:rgba(23,138,90,.08);border-color:rgba(23,138,90,.25);padding-right:12px;">' + escapeHtml(a.host) + ' <span style="opacity:.6">till ' + fmtTime(a.until) + '</span></span>').join('') + '</div>' : '';
  return '<div class="fam-child" data-child="' + c.id + '">'
    + '<div class="fam-child-head"><span class="fam-avatar">' + escapeHtml((c.name[0] || '?').toUpperCase()) + '</span>'
    + '<div class="grow"><div class="fam-name">' + escapeHtml(c.name) + '</div><div class="fam-age">' + escapeHtml(tn('{n} år', c.age)) + '</div></div>'
    + '<button class="fam-active' + (active ? ' on' : '') + '" data-a="active">' + (active ? 'Aktiv på denna enhet' : 'Aktivera här') + '</button></div>'
    + (c.code ? '<div class="fam-code"><span class="code">' + escapeHtml(c.code) + '</span><span style="font-size:11.5px;color:var(--color-navy-600)">inloggningskod</span><button data-a="copy">Kopiera</button></div>' : '')
    + (c.code ? '<div class="fam-loginrow" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 6px;">' + '<span style="font-size:12.5px;color:var(--color-navy-600);">' + escapeHtml(c.sessions ? tn('Inloggad nu', '') : tn('Inte inloggad', '')) + '</span>' + '<button data-a="rotate" style="font-size:12px;font-weight:700;color:#2f8fd4;background:rgba(47,143,212,.1);border:1px solid rgba(47,143,212,.25);border-radius:8px;padding:5px 11px;cursor:pointer;">Byt kod</button>' + (c.sessions ? '<button data-a="sessions" style="font-size:12px;font-weight:700;color:#2f8fd4;background:rgba(47,143,212,.12);border:1px solid rgba(47,143,212,.3);border-radius:8px;padding:5px 11px;cursor:pointer;">' + escapeHtml(tn('Visa enheter', '')) + '</button>' : '') + '</div>' : '')
    + famFragorHtml(c)
    + '<div class="fam-sub">Blockerade sidor</div>' + tags + allowsHtml
    + '<div class="fam-addsite"><input class="fam-in" placeholder="t.ex. exempel.se" spellcheck="false" /><button class="btn btn-safe flex-none" style="height:40px;padding:0 14px;">Blockera</button></div>'
    + '<div class="fam-krypto">' + escapeHtml(tn('Säg till Falk: "blockera de här sidorna för {n}" — eller "tillåt X för {n} i en timme".', c.name)).replace('Falk', '<b>Falk</b>') + '</div>'
    + '<button class="fam-histbtn" data-a="hist" style="display:block;font-size:12.5px;font-weight:700;color:#2f8fd4;background:rgba(47,143,212,.08);border:1px solid rgba(47,143,212,.25);border-radius:9px;padding:8px 12px;cursor:pointer;margin-top:10px;">' + escapeHtml(tn('Se historik för {n}', c.name)) + '</button>'
    + '<button class="fam-del" data-a="del">' + escapeHtml(tn('Ta bort {n} ur familjen', c.name)) + '</button></div>';
}
function famAddChild() {
  if (document.getElementById('fam-modal')) return;
  const ov = document.createElement('div'); ov.id = 'fam-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(5,12,22,.5);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
  ov.innerHTML = '<div style="width:min(420px,94vw);background:#fff;border-radius:18px;padding:22px;box-shadow:0 30px 70px rgba(8,20,35,.4)">'
    + '<div style="font-size:17px;font-weight:800;color:var(--color-navy-900);margin-bottom:14px">Lägg till barn</div>'
    + '<label style="display:block;font-size:12px;font-weight:600;color:rgb(28 43 58 / .6);margin-bottom:5px">Namn</label>'
    + '<input id="fam-f-name" class="fam-in" style="width:100%;margin-bottom:12px" placeholder="t.ex. Emma" spellcheck="false" />'
    + '<label style="display:block;font-size:12px;font-weight:600;color:rgb(28 43 58 / .6);margin-bottom:5px">Ålder</label>'
    + '<input id="fam-f-age" class="fam-in" style="width:100%" inputmode="numeric" placeholder="t.ex. 10" maxlength="2" />'
    + '<div style="display:flex;gap:9px;margin-top:18px"><button id="fam-f-save" class="btn btn-safe" style="flex:1;height:42px">Lägg till</button><button id="fam-f-cancel" class="btn btn-ghost" style="height:42px;padding:0 16px">Avbryt</button></div></div>';
  document.body.appendChild(ov);
  const name = ov.querySelector('#fam-f-name'), age = ov.querySelector('#fam-f-age');
  setTimeout(() => { try { name.focus(); } catch {} }, 0);
  function close() { ov.remove(); }
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#fam-f-cancel').addEventListener('click', close);
  const saveChild = async () => {
    const nm = name.value.trim(); const a = parseInt(age.value, 10);
    if (!nm) { name.style.borderColor = '#c25340'; return; }
    if (!a || a < 1 || a > 20) { age.style.borderColor = '#c25340'; return; }
    if (account && account.token && !account.isChild) {
      busyBtn('fam-f-save', true, 'Skapar…', 'Lägg till');
      let r; try { r = await window.family.createChild(account.token, nm, a); } catch { r = { ok: false }; }
      busyBtn('fam-f-save', false, 'Skapar…', 'Lägg till');
      if (!r || !r.ok || !r.child) { showToast((r && r.message) || 'Kunde inte skapa barnkontot.'); return; }
      fam.children.push({ id: r.child.id, name: r.child.name, age: r.child.age, blocklist: [], code: r.code });
      famSave(); close(); renderFam(); showChildCode(r.child.name, r.code);
    } else {
      fam.children.push({ id: 'ch' + Date.now() + Math.floor(Math.random() * 1000), name: nm, age: a, blocklist: [], local: true });
      famSave(); close(); renderFam();
      showToast('Logga in som förälder för att ge barnet en inloggningskod.');
    }
  };
  ov.querySelector('#fam-f-save').addEventListener('click', saveChild);
  age.addEventListener('keydown', (e) => { if (e.key === 'Enter') ov.querySelector('#fam-f-save').click(); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') age.focus(); });
}
function openFamily() { openSettings(); showSettingsCat('familj'); renderFam(); }
if ($('fam-add')) $('fam-add').addEventListener('click', famAddChild);
let _kidHideTimer = null;
function applyKidIndicator() {
  let bar = $('kid-indicator');
  const isKid = !!(account && account.isChild);            // BARA på barnets konto
  if (!isKid) { if (bar) bar.remove(); return; }
  if (window.__kidShown) return;                            // visa BARA en gång per session
  window.__kidShown = true;
  const nm = (account && account.name) || 'Du';
  if (!bar) { bar = document.createElement('div'); bar.id = 'kid-indicator'; document.body.appendChild(bar); }
  bar.textContent = nm + ' – dina föräldrar kan se din historik';
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:90;text-align:center;font-size:12.5px;font-weight:600;padding:7px 10px;background:#2f8fd4;color:#fff;transition:opacity .5s ease;opacity:1;';
  if (_kidHideTimer) clearTimeout(_kidHideTimer);
  _kidHideTimer = setTimeout(() => {
    const b = $('kid-indicator'); if (!b) return;
    b.style.opacity = '0';
    setTimeout(() => { if (b && b.style.opacity === '0') b.style.display = 'none'; }, 550);
  }, 6000);
}
// Skicka barnets blocklista till servern (så den syns på barnets enhet). Best-effort.
let _famPushar = 0;   // pågående sparningar: en synk som hann starta före får inte skriva över ändringen
async function famPushBlocklist(c) {
  if (!c || c.self || c.local) return;
  if (!account || !account.token || account.isChild) return;
  _famPushar++;
  let r; try { r = await window.family.setBlocklist(account.token, c.id, c.blocklist || []); } catch { r = { ok: false }; }
  _famPushar--;
  if (r && r.ok) return;
  if (r && r.error === 'no_session') { showToast('Din inloggning har g\u00e5tt ut \u2014 logga in igen f\u00f6r att spara sp\u00e4rren.'); try { openLogin(); } catch {} return; }
  showToast((r && r.message) || 'Sp\u00e4rren kunde inte sparas. Kontrollera din uppkoppling och f\u00f6rs\u00f6k igen.');
}
// Förälder: hämta barnen från servern (koder + blocklistor) när panelen öppnas.
let _parentSyncTimer = null;
// Löpande förälder-synk: hämtar barnens inloggnings-status så nya inloggningar (t.ex. på Emmas konto) syns LIVE utan omstart.
function startParentSync() {
  stopParentSync();
  if (!account || account.isChild || !account.token) return;
  _parentSyncTimer = setInterval(() => { try { famSyncParent(); } catch {} }, 12000);
}
function stopParentSync() { if (_parentSyncTimer) { clearInterval(_parentSyncTimer); _parentSyncTimer = null; } }
// Växlar man tillbaka till AdRaze-fönstret -> synka direkt (som en refresh).
window.addEventListener('focus', () => { if (account && account.token && !account.isChild) { try { famSyncParent(); } catch {} } });
async function famSyncParent() {
  if (!account || !account.token || account.isChild) return;
  if (_famPushar) return;
  let r; try { r = await window.family.children(account.token); } catch { return; }
  if (_famPushar) return;   // föräldern ändrade något under tiden: svaret är gammalt
  if (r && r.ok && Array.isArray(r.children)) {
    const prevActive = fam.activeChild;
    fam.children = r.children.map((c) => ({ id: c.id, name: c.name, age: c.age, blocklist: Array.isArray(c.blocklist) ? c.blocklist : [], allows: Array.isArray(c.allows) ? c.allows : [], code: c.code, sessions: c.sessions || 0, last_seen: c.last_seen || 0, requests: Array.isArray(c.requests) ? c.requests : [] }));
    famNyaFragor();
    fam.activeChild = fam.children.find((c) => c.id === prevActive) ? prevActive : fam.activeChild;
    famSave();
    const _typing = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('fam-in');
    if (!_typing) renderFam();   // uppdatera 'Inloggad nu'-status live utan att avbryta om föräldern skriver
  }
}
// Visa den nya barnkodens popup så föräldern kan ge den till barnet.
function showChildCode(name, code) {
  if (document.getElementById('fam-codemodal')) return;
  const ov = document.createElement('div'); ov.id = 'fam-codemodal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(5,12,22,.5);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
  ov.innerHTML = '<div style="width:min(420px,94vw);background:#fff;border-radius:18px;padding:24px;text-align:center;box-shadow:0 30px 70px rgba(8,20,35,.4)">'
    + ''
    + '<div style="font-size:18px;font-weight:800;color:var(--color-navy-900);margin-bottom:6px">' + escapeHtml(name) + ' är tillagd!</div>'
    + '<p style="font-size:13.5px;color:rgb(28 43 58 / .6);margin-bottom:16px">Ge den här koden till ' + escapeHtml(name) + '. På barnets dator: <b>Logga in → "Logga in med din kod"</b>.</p>'
    + '<p style="font-size:12.5px;color:rgb(28 43 58 / .55);margin:-6px 0 16px">Varje gång ' + escapeHtml(name) + ' loggar in får du en sexsiffrig kod på mejlen som ' + escapeHtml(name) + ' måste skriva in. Barnkoden ensam räcker inte.</p>'
    + '<div style="font-family:ui-monospace,monospace;font-size:26px;font-weight:800;letter-spacing:.14em;color:#1f6ea8;background:rgba(47,143,212,.08);border:1px solid rgba(47,143,212,.28);border-radius:12px;padding:14px">' + escapeHtml(code) + '</div>'
    + '<div style="display:flex;gap:9px;margin-top:18px"><button id="fam-code-copy" class="btn btn-safe" style="flex:1;height:42px">Kopiera kod</button><button id="fam-code-done" class="btn btn-ghost" style="height:42px;padding:0 16px">Klar</button></div></div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#fam-code-done').addEventListener('click', close);
  ov.querySelector('#fam-code-copy').addEventListener('click', () => { try { navigator.clipboard.writeText(code); } catch {} showToast('Kod kopierad'); });
}
applyKidIndicator();

// ── Session-återställning vid uppstart — MÅSTE köras SIST, efter att all state (fam, timers, konto) är deklarerad, annars TDZ-krasch som dödar hela boot ──
// Rensa ALDRIG webbsessionen vid start: cookies (Google-inlogg m.m.) ska överleva att man stänger browsern.
if (account && account.token) { try { window.session.setkey(accountKey(account)); } catch {} if (account.isChild) { syncChild(); startChildSync(); } else { refreshPro(); startParentSync(); try { synkaInit(); } catch {} } try { loadSocMe().then(() => { updateAccountBtn(); sparaProfil(); }); } catch {} sparaProfil(); }   // hämta profilbild → visa i kontoknappen; kontot blir en profil
hamtaProfiler();
// Ett annat fönster bytte konto: följ med, annars loggar det här fönstrets gamla konto senare ut det nya
window.addEventListener('storage', (e) => {
  if (e.key !== 'skoll-account') return;
  if (PER_FONSTER) return;   // eget konto i varje fönster: ett byte i ett annat fönster rör inte det här
  let a = null; try { a = JSON.parse(e.newValue); } catch {}
  account = a && a.token ? a : null; fam = famLoad(); socMe = null;
  try { stopChildSync(); stopParentSync(); if (account) { if (account.isChild) startChildSync(); else startParentSync(); } } catch {}
  try { updateAccountBtn(); applyKidIndicator(); famSkickaTillMain(); } catch {}
});
// Föll inloggningen bort ur localStorage men finns krypterad i nyckelringen? Återställ (efter servervalidering).
if (!account || !account.token) {
  try { window.session.setkey(null); } catch {}   // utloggad → inget lösenordsvalv
  // Eget konto per fönster: ett utloggat fönster är utloggat med flit – logga inte in det med det senaste kontot
  if (!PER_FONSTER) (async () => {
    let r; try { r = await window.auth.recall(); } catch { return; }
    if (!r || !r.ok || !r.account || !r.account.token) return;
    const acc = r.account; let ok = false;
    if (acc.isChild) { try { const m = await window.family.me(acc.token); ok = !!(m && m.ok && m.isChild); } catch {} }
    else { try { const s = await window.auth.session(acc.token); ok = !!(s && s.ok); } catch { ok = true; } }   // nätverkshicka: behåll ändå
    if (!ok) return;
    account = acc;
    if (account.isChild) satBarnlage(true);
    sparaKontoLokalt();
    try { updateAccountBtn(); } catch {}
    try { window.session.setkey(accountKey(account)); } catch {}
    try { loadSocMe().then(() => updateAccountBtn()); } catch {}   // hämta profilbild → visa i kontoknappen
    if (account.isChild) { syncChild(); startChildSync(); } else { refreshPro(); startParentSync(); }
    try { applyKidIndicator(); } catch {}
  })();
}

