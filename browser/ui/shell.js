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
  adraze: { label: 'AdRaze Search', url: 'https://search.adraze.app/search?q=' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  startpage: { label: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
};
/* Inkognito söker alltid via AdRaze Search (vår egen motor, loggar inget). */
const INCOG_ENGINE = { label: 'AdRaze Search', url: 'https://search.adraze.app/search?q=' };
let searchEngine = 'adraze';
try { const e = localStorage.getItem('skoll-engine'); if (e && ENGINES[e]) searchEngine = e; } catch {}
function searchUrl(q) {
  // Vanligt: vald sökmotor. Inkognito: alltid AdRaze Search (ingen logg).
  if (active && active.incognito) return INCOG_ENGINE.url + encodeURIComponent(q);
  return (ENGINES[searchEngine] || ENGINES.adraze).url + encodeURIComponent(q);
}
function normalizeUrl(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  if (/^(https?|file|about|adraze):/i.test(s)) return s;
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
  tabs.push(tab); switchTab(tab);
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
  } catch {}
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
  $('search-engine').textContent = tab.incognito ? INCOG_ENGINE.label : (ENGINES[searchEngine] || ENGINES.adraze).label;
  addressInput.value = tab.url ? pretty(tab.url) : '';
  setShield(tab.url ? (protectionOn ? (tab.verdict ? tab.verdict.status : 'ok') : 'off') : 'home');
  hideOverlayElements();
  hideDanger();
  if (tab.overlay) { window.view.hide(); const el = $(tab.overlay); if (el) el.classList.remove('hidden'); }
  else showActiveTab();
  renderTabs(); updateNavButtons(); updateStar();
  try { updateReaderBtn(); } catch {}
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
  if (!tabs.length) { window.view.doClose(); return; }   // sista fliken stängd → stäng browsern
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
  const host = $('tabs');
  const pinned = tabs.filter((t) => !t._closing && t.pinned).length;
  const n = Math.max(1, tabs.filter((t) => !t._closing && !t.pinned).length);
  const room = tabRoom() - pinned * (PIN_W + TAB_GAP);
  let w = tabWidthLock != null ? tabWidthLock : Math.floor((room - TAB_GAP * (n - 1)) / n);
  w = Math.max(TAB_MIN, Math.min(TAB_MAX, w));
  currentTabW = w;
  host.style.setProperty('--tab-w', w + 'px');
  host.style.maxWidth = room + 'px';
  host.classList.toggle('narrow', w < TAB_NARROW);
}
function renderTabs() {
  const host = $('tabs');
  const old = new Map([...host.children].map((el) => [el.dataset.tabid, el]));
  let prev = null;
  tabs.forEach((tab) => {
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
    const cls = 'tab' + (tab === active ? ' active' : '') + (tab.incognito ? ' incognito' : '') + (tab._closing ? ' closing' : '') + (tab.pinned ? ' pinned' : '');
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
window.view.onTitle((id, title) => { const t = byId(id); if (t) { t.title = title; renderTabs(); if (t.url && !t.incognito) pushHistory(t.url, title, t.favicon); } });
window.view.onFavicon((id, fav) => { const t = byId(id); if (t) { t.favicon = fav; renderTabs(); } });
// Ladda om ⇄ stoppa: byt SVG-ikonen (förr ersattes ikonen med tecknen ✕/⟳ i textform, som såg annorlunda ut än övriga knappar)
window.view.onLoading((id, loading) => {
  const t = byId(id); if (!t || t !== active) return;
  const b = $('reload'); b.dataset.loading = loading ? '1' : '';
  b.innerHTML = `<svg class="ic"><use href="#${loading ? 'i-close' : 'i-reload'}" /></svg>`;
});
window.view.onOpenNewTab((url) => createTab(url));
window.view.onNewIncognito(() => createTab(null, true));

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
  const sub = $('danger-sub');
  if (sub) { if (!sub.dataset.orig) sub.dataset.orig = sub.innerHTML; if (verdict.sub) sub.textContent = verdict.sub; else sub.innerHTML = sub.dataset.orig; }
  $('danger-target').textContent = url;
  const box = $('danger-reasons'); box.innerHTML = '';
  (verdict.reasons || []).forEach((r) => {
    const row = document.createElement('div'); row.className = 'danger-reason';
    row.innerHTML = `<svg class="ic ic-sm" style="color:var(--color-warn);flex:none;margin-top:1px"><use href="#i-shield-alert" /></svg><span>${escapeHtml(r)}</span>`;
    box.appendChild(row);
  });
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
function kryptoMode() { return account ? (account.pro ? 'pro' : 'nopro') : 'signedout'; }
let pendingKryptoAfterLogin = false;
// Falk och chatten visas en i taget. Öppnar du den ena göms den andra och kommer tillbaka när du stänger.
var parkedKrypto = false, parkedChatt = false;
function openKrypto(open, parking) {
  if (open && !account) { pendingKryptoAfterLogin = true; openLogin(); return; }
  if (open) { parkedKrypto = false; if (chattOpen) { parkedChatt = true; chattOpen = false; chattSync(); } }
  kryptoOpen = open;
  window.view.kryptoToggle(open, kryptoMode(), account ? account.token : null);
  $('krypto-btn').classList.toggle('off', !open);
  if (!open && !parking && parkedChatt) { parkedChatt = false; if (account && !account.isChild) { chattOpen = true; chattSync(); } }
  rememberPanel();
}
$('krypto-btn').addEventListener('click', () => openKrypto(!kryptoOpen));
async function refreshPro() {
  if (!account || !account.token) return;
  try {
    const r = await window.auth.session(account.token);
    if (r && r.ok) { account.pro = !!r.pro; if (r.name) account.name = r.name; localStorage.setItem('skoll-account', JSON.stringify(account)); try { window.auth.remember(account); } catch {} }
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
if ($('seg-light')) $('seg-light').addEventListener('click', () => setTheme('light'));
if ($('seg-dark')) $('seg-dark').addEventListener('click', () => setTheme('dark'));
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
  else if (name === 'kop' || name === 'buy' || name === 'bestall' || name === 'betala') {
    if (typeof startKryptoPurchase === 'function') startKryptoPurchase(val);
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
if (account && !account.token) account = null;  // gammalt kontonummer-format → nollställ
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
  const map = { login: 'login-form', signup: 'login-signup', code: 'login-code', reset: 'login-reset', resetconfirm: 'login-reset-confirm', account: 'login-account-view', child: 'login-child' };
  for (const k in map) { const el = $(map[k]); if (el) el.style.display = (k === name) ? 'block' : 'none'; }
}
function openLogin() {
  window.view.hide(); hideInfobar();
  if (account) {
    setLoginView('account');
    $('login-email-shown').textContent = (account.name ? account.name + ' · ' : '') + (account.email || '');
    $('login-pro-badge').style.display = account.pro ? 'inline-flex' : 'none';
  } else {
    $('login-email').value = ''; $('login-pw').value = ''; $('login-error').style.display = 'none';
    setLoginView('login');
    setTimeout(() => $('login-email').focus(), 30);
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
function accountKey(a) { a = a || account; if (!a) return null; return 'k:' + (a.email || a.childId || a.name || a.token || 'user'); }
function loginAs(token, email, pro, name) {
  account = { token, email: email || '', pro: !!pro, name: name || '' };
  socMe = null;   // förra kontots profil (bild m.m.) får inte hänga kvar
  unlockHistoryForParent();   // vuxenkonto → historiken går att rensa igen
  localStorage.setItem('skoll-account', JSON.stringify(account));
  try { window.auth.remember(account); } catch {}
  updateAccountBtn();
  try { loadSocMe().then(() => updateAccountBtn()); } catch {}   // hämta NYA kontots profilbild → kontoknappen
  try { window.session.login(accountKey(account)); } catch {}   // återställ kontots webbsession (Gmail m.m. tillbaka) + lås upp lösenord
  try { startParentSync(); } catch {}
  try { synkaInit(); } catch {}   // bokmärken mellan enheter
  if (pendingKryptoAfterLogin) { pendingKryptoAfterLogin = false; openKrypto(true); }
  else if (kryptoOpen) openKrypto(true);
  if (pendingChattAfterLogin) { pendingChattAfterLogin = false; openChatt(true); }
  setTimeout(() => { try { refreshPro(); } catch {} }, 400);   // Pro-status från servern (Google-inloggningen vet den inte)
}
function doLogout(reopenKrypto) {
  chattOpen = false; chattUnread = 0; parkedKrypto = false; parkedChatt = false;
  for (const x of tabs) { x.panel = null; x.parked = null; }
  const t = account && account.token;
  const sk = account ? accountKey(account) : null;
  account = null; socMe = null; localStorage.removeItem('skoll-account'); updateAccountBtn();
  try { window.auth.forget(); } catch {}
  if (sk) { try { window.session.logout(sk); } catch {} }   // spara + rensa webbsession (utloggad ur Gmail m.fl.) + lås lösenord
  window.__kidShown = false;
  if (typeof stopChildSync === 'function') stopChildSync();
  if (typeof stopParentSync === 'function') stopParentSync();
  try { if (fam && fam.children && fam.children.some((c) => c.self)) { fam = { children: [], activeChild: null }; famSave(); } } catch {}
  if (typeof applyKidIndicator === 'function') applyKidIndicator();
  if (t) { try { window.auth.logout(t); } catch {} }
  setLoginView('login');
  if (reopenKrypto !== false && kryptoOpen) openKrypto(true);  // lås Falk igen
}
function busyBtn(id, busy, busyText, text) {
  const b = $(id); if (!b) return; b.disabled = busy; b.style.opacity = busy ? '0.7' : '1'; b.textContent = busy ? busyText : text;
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
  $('reset-code').value = ''; $('reset-pw').value = ''; $('reset-confirm-error').style.display = 'none';
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
  account = { token, email: '', pro: false, name: child.name, isChild: true, childId: child.id };
  socMe = null;
  lockHistoryForChild();      // barnet kan inte radera sin historik — inte ens efter utloggning
  localStorage.setItem('skoll-account', JSON.stringify(account));
  try { window.auth.remember(account); } catch {}
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
  if (typeof startChildSync === 'function') startChildSync();
}
async function syncChild() {
  if (!account || !account.isChild || !account.token) return;
  let me; try { me = await window.family.me(account.token); } catch { return; }
  if (me && me.ok && me.isChild) {
    const id = account.childId || 'self';
    fam = { children: [{ id, name: me.name || account.name, age: me.age || 0, blocklist: Array.isArray(me.blocklist) ? me.blocklist : [], allows: Array.isArray(me.allows) ? me.allows : [], self: true }], activeChild: id };
    famSave(); applyKidIndicator();
    if (typeof enforceActiveTab === 'function') enforceActiveTab();
    if (typeof ensureAllowTicker === 'function') ensureAllowTicker();
  } else if (me && me.error === 'no_session') { doLogout(false); }
}
/* ── Kontosida (profil i Inställningar) + radera konto ── */
function openAccount() { if (account) { openSettings(); showSettingsCat('konto'); } else { openLogin(); } }
async function renderKonto() {
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
  const dz = $('kn-danger'); if (dz) dz.style.display = account.isChild ? 'none' : 'block';
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
    close(); doLogout(false); renderKonto(); showToast('Ditt konto är borttaget.');
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
function chattSync() { try { if (!account || account.isChild) chattOpen = false; window.view.chattToggle(chattOpen, chattOpts()); } catch {} renderChattBtn(); }
function openChatt(open) {
  if (open && !account) { pendingChattAfterLogin = true; openLogin(); return; }
  if (open && account.isChild) { showToast(t('Chatten finns inte för barnkonton. Prata med dina föräldrar i stället.')); return; }
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
  if (want === 'chatt' && account.isChild) return;
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
  if (bd) { bd.textContent = chattUnread > 99 ? '99+' : String(chattUnread); bd.style.display = (chattUnread > 0 && !chattOpen && account && !account.isChild) ? 'block' : 'none'; }
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
  if (account.isChild) { wrap.innerHTML = '<div class="fr-note">' + escapeHtml(t('Chatten finns inte för barnkonton. Prata med dina föräldrar i stället.')) + '</div>'; return; }
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
$('kn-logout') && $('kn-logout').addEventListener('click', () => { doLogout(); renderKonto(); });
$('kn-login') && $('kn-login').addEventListener('click', () => openLogin());
$('kn-delete') && $('kn-delete').addEventListener('click', showConfirmDelete);
$('kn-avatar') && $('kn-avatar').addEventListener('click', () => { const f = $('kn-avatar-file'); if (f) f.click(); });
$('kn-avatar-file') && $('kn-avatar-file').addEventListener('change', knHandleAvatar);
$('login-close').addEventListener('click', () => { pendingKryptoAfterLogin = false; closeLogin(); });
$('qr-close').addEventListener('click', () => { if (active) active.overlay = null; $('qr').classList.add('hidden'); showActiveTab(); });
$('login-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-pw').focus(); });
$('login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('login-submit').addEventListener('click', doLogin);
$('login-google').addEventListener('click', () => doGoogle('login-error', 'login-google'));
$('signup-google').addEventListener('click', () => doGoogle('signup-error', 'signup-google'));
$('to-signup').addEventListener('click', () => { $('signup-name').value = ''; $('signup-email').value = ''; $('signup-pw').value = ''; $('signup-error').style.display = 'none'; setLoginView('signup'); setTimeout(() => $('signup-name').focus(), 20); });
$('to-login').addEventListener('click', () => { setLoginView('login'); setTimeout(() => $('login-email').focus(), 20); });
$('signup-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('signup-email').focus(); });
$('signup-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('signup-pw').focus(); });
$('signup-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignup(); });
$('signup-submit').addEventListener('click', doSignup);
$('login-code-input').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
$('login-code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerifyCode(); });
$('code-submit').addEventListener('click', doVerifyCode);
$('code-resend').addEventListener('click', doResendCode);
$('code-back').addEventListener('click', () => { setLoginView(pendingSubmit && pendingSubmit.type === 'signup' ? 'signup' : 'login'); });
$('to-reset').addEventListener('click', () => { $('reset-email').value = $('login-email').value || ''; $('reset-error').style.display = 'none'; setLoginView('reset'); setTimeout(() => $('reset-email').focus(), 20); });
$('reset-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') doResetRequest(); });
$('reset-send').addEventListener('click', doResetRequest);
$('reset-back').addEventListener('click', () => { setLoginView('login'); setTimeout(() => $('login-email').focus(), 20); });
$('reset-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
$('reset-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doResetConfirm(); });
$('reset-confirm-submit').addEventListener('click', doResetConfirm);
$('reset-confirm-back').addEventListener('click', () => setLoginView('reset'));
$('reset-resend').addEventListener('click', doResetResend);
$('logout-btn').addEventListener('click', () => doLogout());
$('to-child').addEventListener('click', () => { childPendingCode = null; $('child-code-input').value = ''; setLoginView('child'); showChildStep(1); });
$('child-back').addEventListener('click', () => {
  if (childPendingCode) { childPendingCode = null; showChildStep(1); return; }
  setLoginView('login'); setTimeout(() => $('login-email').focus(), 20);
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
  const key = name + '|' + h;                          // stabil inom samma timme + namn
  if (_greetCache.key !== key) {
    const g = b[Math.floor(Math.random() * b.length)];
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
    if (it.kind === 'typed') txt = `<span class="stext">${escapeHtml(it.q)}</span><span class="sdim"> - ${escapeHtml(sug.engineLabel || '')} ${escapeHtml(t('Sök'))}</span>`;
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
  else out.push({ search: true, kind: 'typed', q: query });
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
  sug.engineLabel = (active && active.incognito) ? INCOG_ENGINE.label : (ENGINES[searchEngine] || ENGINES.adraze).label;
  const lokala = query ? localSug(query, sug.comp) : topSitesForSug();   // tomt fält → dina mest besökta sajter
  sug.items = lokala;
  if (sug.items.length && document.activeElement === inp) { renderSug(); openSug(); } else closeSug();
  // Förslag från sökmotorn läggs sist. Inte för adresser.
  clearTimeout(sugTimer);
  const incog = !!(active && active.incognito);
  if (!query || /^[a-z]+:\/\//i.test(query) || /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(query)) return;
  const seq = ++sugSeq;
  sugTimer = setTimeout(async () => {
    let list = [];
    try { list = await window.view.suggest(query, incog ? 'adraze' : searchEngine); } catch { list = []; }   // inkognito: förslag från AdRaze Search
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
  if (!tab.bg) {
    await laddaBgLista();
    if (tab.bg || active !== tab) return;
    tab.bg = bgNasta || slumpaBg(); bgNasta = slumpaBg();
    if (!tab.bg) return;
  }
  if (active === tab) visaBg(tab.bg);
}
function applyStoredBg() {
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
  window.view.tabMenu({ id: tab.id, pinned: !!tab.pinned, muted: !!tab.muted, hasUrl: !!tab.url, count: tabs.length, canReopen: closedTabs.length > 0 });
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
function showUpdateBanner(version) {
  // Fanns redan en banner (äldre version hämtad)? Bygg om den med den nya versionen,
  // och behåll "Startar om…" om användaren redan tryckt.
  const prev = document.getElementById('update-banner');
  const busy = !!(prev && prev.dataset.busy);
  if (prev) prev.remove();
  const bar = document.createElement('div'); bar.id = 'update-banner';
  bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:300;display:flex;align-items:center;gap:12px;background:var(--color-navy-900);color:#fff;padding:11px 14px 11px 18px;border-radius:14px;box-shadow:0 14px 40px rgba(8,20,35,.45);font-size:13.5px;max-width:92vw;';
  const tt = (k) => (typeof window.t === 'function') ? window.t(k) : k;
  bar.innerHTML = '<span>' + escapeHtml(tt('En ny version av')) + ' <b>AdRaze</b>' + (version ? ' (' + version + ')' : '') + ' ' + escapeHtml(tt('är klar.')) + '</span>'
    + '<button id="upd-now" style="background:#fff;color:var(--color-navy-900);border:0;border-radius:9px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">' + escapeHtml(tt('Starta om & uppdatera')) + '</button>'
    + '<button id="upd-later" style="background:none;border:0;color:rgba(255,255,255,.7);font-size:13px;cursor:pointer;">' + escapeHtml(tt('Senare')) + '</button>';
  document.body.appendChild(bar);
  bar.querySelector('#upd-now').addEventListener('click', () => { bar.dataset.busy = '1'; bar.querySelector('#upd-now').textContent = tt('Startar om…'); try { window.view.installUpdate(); } catch {} });
  bar.querySelector('#upd-later').addEventListener('click', () => { updSenare = version || ''; bar.remove(); });
  if (busy) { bar.dataset.busy = '1'; bar.querySelector('#upd-now').textContent = tt('Startar om…'); }
}
// Nudge: om AdRaze inte är standardwebbläsare, visa en banner (som uppdateringsnotisen).
async function maybeShowDefaultBanner() {
  try {
    if (windowIncognito) return;
    const intro = $('hxintro');   // första start: vänta tills introt är borta, annars hamnar notisen ovanpå det
    if (intro && intro.style.display === 'flex') { setTimeout(maybeShowDefaultBanner, 2500); return; }
    const st = await window.defaultBrowser.state();
    if (st && st.default) return;                                   // redan standard → visa inte
    const snooze = parseInt(localStorage.getItem('skoll-defbrowser-snooze') || '0', 10);
    if (Date.now() < snooze) return;                                // nyligen "Senare"
    showDefaultBrowserBanner();
  } catch {}
}
function showDefaultBrowserBanner() {
  if (document.getElementById('defbrowser-banner')) return;
  const bar = document.createElement('div'); bar.id = 'defbrowser-banner';
  bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:300;display:flex;align-items:center;gap:12px;background:var(--color-navy-900);color:#fff;padding:11px 14px 11px 18px;border-radius:14px;box-shadow:0 14px 40px rgba(8,20,35,.45);font-size:13.5px;max-width:92vw;';
  bar.innerHTML = '<span><b>AdRaze</b> är inte din huvudwebbläsare än.</span>'
    + '<button id="db-set" style="background:#fff;color:var(--color-navy-900);border:0;border-radius:9px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">Gör AdRaze till min main</button>'
    + '<button id="db-later" style="background:none;border:0;color:rgba(255,255,255,.7);font-size:13px;cursor:pointer;">Senare</button>';
  document.body.appendChild(bar);
  bar.querySelector('#db-set').addEventListener('click', async () => {
    const b = bar.querySelector('#db-set'); b.textContent = 'Sätter…'; b.disabled = true;
    let r; try { r = await window.defaultBrowser.set(); } catch { r = null; }
    if (r && r.ok) { showToast('AdRaze är nu din huvudwebbläsare'); bar.remove(); }
    else if (r && r.manual) { showToast('Välj AdRaze i systeminställningarna som öppnades.'); bar.remove(); }
    else { b.textContent = 'Gör AdRaze till min main'; b.disabled = false; showToast('Kunde inte sätta AdRaze som standard.'); }
  });
  bar.querySelector('#db-later').addEventListener('click', () => {
    try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 7 * 24 * 3600 * 1000)); } catch {}
    bar.remove();
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
      ? `<img class="hist-fav" src="${e.favicon}" data-glob="hist" alt="">`
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
  return favicon ? `<img class="hist-fav" src="${favicon}" data-glob="hist" alt="">` : `<span class="hist-fav" style="display:grid;place-items:center;color:#8ba3bf"><svg class="ic" style="width:13px;height:13px"><use href="#i-fav" /></svg></span>`;
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
  m.hidden = false; m.textContent = text; m.classList.toggle('err', !!err);
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
if ($('imp-go')) $('imp-go').addEventListener('click', async () => {
  if (!impVal) return;
  const bokmarken = $('imp-bm').checked, historik = $('imp-hist').checked;
  if (!bokmarken && !historik) { impSettMsg('Välj bokmärken eller historik.', true); return; }
  const btn = $('imp-go'); btn.disabled = true; impSettMsg('Importerar…');
  let r; try { r = await window.view.importLas({ ...impVal, bokmarken, historik }); } catch (e) { r = { ok: false, fel: String(e) }; }
  btn.disabled = false;
  if (!r || !r.ok) { impSettMsg(r && r.fel ? r.fel : 'Kunde inte läsa webbläsaren.', true); return; }
  const nb = bokmarken ? mergeBokmarken(r.bokmarken || []) : 0;
  const nh = historik ? mergeHistorik(r.historik || []) : 0;
  const delar = [];
  if (bokmarken) delar.push(nb + ' bokmärken');
  if (historik) delar.push(nh + ' sidor i historiken');
  impSettMsg('Klart — ' + delar.join(' och ') + ' från ' + impVal.namn + '.');
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

/* ── Familj: föräldrapanel, barn-blocklistor, öppen insyn ── */
const FAM_KEY = 'adraze-family';
function famLoad() { try { const f = JSON.parse(localStorage.getItem(FAM_KEY)); if (f && Array.isArray(f.children)) return f; } catch {} return { children: [], activeChild: null }; }
function famSave() { try { localStorage.setItem(FAM_KEY, JSON.stringify(fam)); } catch {} }
let fam = famLoad();
function famHost(u) { try { return new URL(normalizeUrl(u)).hostname.replace(/^www\./, ''); } catch { return String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; } }
function famChildById(id) { return fam.children.find((c) => c.id === id); }
function famActive() { return fam.activeChild ? famChildById(fam.activeChild) : null; }
function famBlocked(url) {
  if (!account || !account.isChild) return false;   // blockering gäller BARA på barnets konto
  const c = famActive(); if (!c) return false;
  const h = famHost(url);
  const blocked = (c.blocklist || []).some((b) => h === b || h.endsWith('.' + b));
  if (!blocked) return false;
  const now = Date.now();
  const allowed = (c.allows || []).some((a) => a && a.until > now && (h === a.host || h.endsWith('.' + a.host)));  // tillfälligt tillåten?
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
  if (kb && kb.style.display !== 'none' && kb.dataset.url && typeof famBlocked === 'function' && !famBlocked(kb.dataset.url)) {
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
// Exponera för Falk-agenten ("blockera X för barnet")
window.famBlockFor = function (childName, hosts) {
  if (account && account.isChild) return 0;   // bara föräldern styr spärrar
  const c = fam.children.find((x) => x.name.toLowerCase() === String(childName || '').toLowerCase()) || famActive() || fam.children[0];
  if (!c) return 0; let n = 0;
  (Array.isArray(hosts) ? hosts : [hosts]).forEach((raw) => { const h = famHost(raw); if (h && !c.blocklist.includes(h)) { c.blocklist.push(h); n++; } });
  if (n) { famSave(); famPushBlocklist(c); renderFam(); }
  return n;
};
// Tillåt (avblockera) igen — förälder säger ja
window.famUnblockFor = function (childName, hosts) {
  if (account && account.isChild) return 0;   // barn kan inte av-blockera
  const c = fam.children.find((x) => x.name.toLowerCase() === String(childName || '').toLowerCase()) || famActive() || fam.children[0];
  if (!c) return 0; let n = 0;
  (Array.isArray(hosts) ? hosts : [hosts]).forEach((raw) => { const h = famHost(raw); const i = (c.blocklist || []).indexOf(h); if (i >= 0) { c.blocklist.splice(i, 1); n++; } });
  if (n) { famSave(); famPushBlocklist(c); renderFam(); }
  return n;
};
// Förälder tillåter en sida tillfälligt (minuter) för ett barn
async function famAllowFor(childName, host, minutes) {
  if (!account || !account.token || account.isChild) return false;
  const c = fam.children.find((x) => x.name.toLowerCase() === String(childName || '').toLowerCase()) || famActive() || fam.children[0];
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
// Helskärms-blockeringssida för barnet (föräldern tillåter sidan i AdRaze Familj)
function showBlockScreen(url) {
  let host; try { host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, ''); } catch { host = String(url || ''); }
  try { window.view.hide(); } catch {}   // dölj webbvyn så rutan täcker sidan
  let ov = $('kidblock');
  if (!ov) { ov = document.createElement('div'); ov.id = 'kidblock'; document.body.appendChild(ov); }
  ov.dataset.url = url;   // så nedräknaren kan öppna sidan automatiskt när den blir tillåten
  ov.style.cssText = 'position:fixed;inset:0;z-index:120;background:linear-gradient(160deg,#2f8fd4,#1f6ea8);display:flex;align-items:center;justify-content:center;padding:24px;';
  ov.innerHTML = '<div style="width:min(460px,94vw);background:#fff;border-radius:22px;padding:30px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.35)">'
    + ''
    + '<div style="font-size:20px;font-weight:800;color:var(--color-navy-900);margin-bottom:6px">Den här sidan är blockerad</div>'
    + '<div style="font-size:14px;color:#2f8fd4;font-weight:700;margin-bottom:14px">' + escapeHtml(host) + '</div>'
    + '<p style="font-size:14px;color:rgb(28 43 58 / .65);line-height:1.6;margin-bottom:20px">Dina föräldrar kan se att du försökte gå hit — men ingen fara.<br>Vill du besöka sidan? Fråga dina föräldrar, så kan de tillåta den i <b>AdRaze Familj</b>.</p>'
    + '<div id="kidblock-msg" style="font-size:13px;color:var(--color-safe);font-weight:700;min-height:18px;margin-bottom:10px"></div>'
    + '<div style="display:flex;gap:10px"><button id="kidblock-back" class="btn btn-safe" style="flex:1;height:46px">Tillbaka</button></div>'
    + '</div>';
  ov.style.display = 'flex';
  ov.querySelector('#kidblock-back').onclick = () => {
    ov.style.display = 'none';
    if (active && active.url && famBlocked(active.url)) { active.url = ''; if (addressInput) addressInput.value = ''; }  // fortfarande blockerad → hem
    if (typeof showActiveTab === 'function') showActiveTab();
  };
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
    el.querySelector('[data-a=del]').addEventListener('click', () => { fam.children = fam.children.filter((x) => x.id !== c.id); if (fam.activeChild === c.id) fam.activeChild = null; famSave(); renderFam(); applyKidIndicator(); });
    const cp = el.querySelector('[data-a=copy]'); if (cp) cp.addEventListener('click', () => { try { navigator.clipboard.writeText(c.code); } catch {} showToast(tn('Kod kopierad — ge den till {n}', c.name)); });
    const hb = el.querySelector('[data-a=hist]'); if (hb) hb.addEventListener('click', () => famShowHistory(c.id, c.name));
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
    el.querySelectorAll('.fam-tag button[data-host]').forEach((b) => b.addEventListener('click', () => { c.blocklist = c.blocklist.filter((h) => h !== b.dataset.host); famSave(); famPushBlocklist(c); renderFam(); }));
    el.querySelectorAll('.fam-tag button[data-t]').forEach((b) => b.addEventListener('click', () => allowMenu(b.dataset.t, c.name, b)));  // tillåt tillfälligt
    const inp = el.querySelector('.fam-addsite input');
    const addSite = () => { const h = famHost(inp.value); if (h && !c.blocklist.includes(h)) { c.blocklist.push(h); famSave(); famPushBlocklist(c); renderFam(); } };
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
    + (c.code ? '<div class="fam-loginrow" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 6px;">' + (c.sessions ? '<span style="font-size:11.5px;font-weight:700;color:#178a5a;background:rgba(23,138,90,.1);border-radius:20px;padding:3px 10px;">\u25cf ' + escapeHtml(tn('Inloggad nu', '')) + '</span>' : '<span style="font-size:11.5px;color:var(--color-navy-600);background:rgba(28,43,58,.06);border-radius:20px;padding:3px 10px;">Inte inloggad</span>') + '<button data-a="rotate" style="font-size:12px;font-weight:700;color:#2f8fd4;background:rgba(47,143,212,.1);border:1px solid rgba(47,143,212,.25);border-radius:8px;padding:5px 11px;cursor:pointer;">Byt kod</button>' + (c.sessions ? '<button data-a="sessions" style="font-size:12px;font-weight:700;color:#2f8fd4;background:rgba(47,143,212,.12);border:1px solid rgba(47,143,212,.3);border-radius:8px;padding:5px 11px;cursor:pointer;">' + escapeHtml(tn('Visa enheter', '')) + '</button>' : '') + '</div>' : '')
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
function famPushBlocklist(c) {
  if (!c || c.self || c.local) return;
  if (!account || !account.token || account.isChild) return;
  try { window.family.setBlocklist(account.token, c.id, c.blocklist || []); } catch {}
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
  let r; try { r = await window.family.children(account.token); } catch { return; }
  if (r && r.ok && Array.isArray(r.children)) {
    const prevActive = fam.activeChild;
    fam.children = r.children.map((c) => ({ id: c.id, name: c.name, age: c.age, blocklist: Array.isArray(c.blocklist) ? c.blocklist : [], code: c.code, sessions: c.sessions || 0, last_seen: c.last_seen || 0 }));
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
if (account && account.token) { try { window.session.setkey(accountKey(account)); } catch {} if (account.isChild) { syncChild(); startChildSync(); } else { refreshPro(); startParentSync(); try { synkaInit(); } catch {} } try { loadSocMe().then(() => updateAccountBtn()); } catch {} }   // hämta profilbild → visa i kontoknappen
// Föll inloggningen bort ur localStorage men finns krypterad i nyckelringen? Återställ (efter servervalidering).
if (!account || !account.token) {
  try { window.session.setkey(null); } catch {}   // utloggad → inget lösenordsvalv
  (async () => {
    let r; try { r = await window.auth.recall(); } catch { return; }
    if (!r || !r.ok || !r.account || !r.account.token) return;
    const acc = r.account; let ok = false;
    if (acc.isChild) { try { const m = await window.family.me(acc.token); ok = !!(m && m.ok && m.isChild); } catch {} }
    else { try { const s = await window.auth.session(acc.token); ok = !!(s && s.ok); } catch { ok = true; } }   // nätverkshicka: behåll ändå
    if (!ok) return;
    account = acc;
    try { localStorage.setItem('skoll-account', JSON.stringify(account)); } catch {}
    try { updateAccountBtn(); } catch {}
    try { window.session.setkey(accountKey(account)); } catch {}
    try { loadSocMe().then(() => updateAccountBtn()); } catch {}   // hämta profilbild → visa i kontoknappen
    if (account.isChild) { syncChild(); startChildSync(); } else { refreshPro(); startParentSync(); }
    try { applyKidIndicator(); } catch {}
  })();
}

