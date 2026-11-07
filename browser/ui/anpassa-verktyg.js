// Anpassa › verktyg (fönstret): verktygsfältet och adressfältet. Huvudprocessens sida: ../anpassa-verktyg.js.
//  1. Knapparna (verktyg.knappar = { ordning: [id…], dolda: [id…] }, null = standard): dra och släpp i läget
//     "Anpassa verktygsfältet…" (högerklick på raden), en låda för borttagna knappar, och en lista med
//     på/av + ordning i Inställningar › Anpassa. Menyknappen och adressfältet kan aldrig tas bort.
//  2. Adressfältet: hela adressen eller bara domänen (verktyg.adress), dölj https:// och www. (verktyg.doljSchema).
//     När du klickar i fältet visas alltid hela adressen (shell.js).
//  3. Verktygsraden längst ner (verktyg.placering): webbytan mäts om och förslagslistan öppnas uppåt.
//  4. Bokmärkesfältet alltid / bara på ny flik / aldrig (verktyg.bokmarkesfalt), i synk med Utseende › Visa bokmärkesfältet.
// Laddas före shell.js: DOM:en finns redan (skripten ligger sist i <body>), men shell.js-funktioner som
// sendBounds, showActiveTab och openBookmarks används först när de finns (alltid via fn()/try).
(function () {
  'use strict';
  const A = window.Anpassa, bro = window.anpassaVerktyg;
  const $ = (id) => document.getElementById(id);
  const tb = $('toolbar');
  if (!A || !tb) return;
  const tr = (s) => (typeof window.t === 'function' ? window.t(s) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // shell.js: funktioner hamnar på window, let/const nås bara med namn (och först när shell.js har körts)
  const fn = (namn) => { try { const f = window[namn]; return typeof f === 'function' ? f : null; } catch { return null; } };
  const aktivFlik = () => { try { return active; } catch { return null; } };   // eslint-disable-line no-undef
  // Ändra bara om värdet faktiskt blir ett annat (annars blir det en tom post i ångra-historiken)
  const satt = (nyckel, v, etikett, nu) => (JSON.stringify(nu === undefined ? A.get(nyckel) : nu) === JSON.stringify(v) ? Promise.resolve({ ok: true }) : A.set(nyckel, v, etikett));

  // Tillstånd (deklareras först: registrera() kan anropas medan filen fortfarande körs)
  let vantar = null, vantarSkickat = '';   // ändring som skickats men inte kommit tillbaka från butiken än (så att släppet syns direkt)
  let anpassar = false, lage = null, ladaEl = null, markor = null, drag = null, flikVidStart = null;
  let kanter = null, igang = false;
  const BM = ['alltid', 'nyflik', 'aldrig'];

  /* ── Knapparna ── */
  const SVG = (inre) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + inre + '</svg>';
  const IKON = {
    hem: SVG('<path d="M4 11.2 12 4.8l8 6.4"/><path d="M6.4 9.6v10h11.2v-10"/><path d="M10 19.6v-5h4v5"/>'),
    lasvy: SVG('<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>'),
    bokmarken: '<svg class="ic" aria-hidden="true"><use href="#i-star" /></svg>',
    historik: '<svg class="ic" aria-hidden="true"><use href="#i-history" /></svg>',
    planbok: '<svg class="ic" aria-hidden="true"><use href="#i-card" /></svg>',
    tillagg: '<svg class="ic" aria-hidden="true"><use href="#i-puzzle" /></svg>',
    adressfalt: '<svg class="ic" aria-hidden="true"><use href="#i-search" /></svg>',
  };
  const installningar = (kat) => () => { const o = fn('openSettings'), s = fn('showSettingsCat'); if (o) o(); if (s) s(kat); };
  // Standardordningen. "dold" = ligger i lådan från början, "fast" = kan flyttas men aldrig tas bort.
  // Knappar utan sel skapas här (de fanns inte i verktygsraden förut).
  const reg = [
    { id: 'tillbaka', sel: '#back', namn: 'Tillbaka' },
    { id: 'framat', sel: '#forward', namn: 'Framåt' },
    { id: 'uppdatera', sel: '#reload', namn: 'Ladda om' },
    { id: 'hem', namn: 'Startsidan', dold: true, gor: hem },
    { id: 'adressfalt', sel: '.omni-center', namn: 'Adressfältet', fast: true },
    { id: 'lasvy', namn: 'Läsläge', dold: true, gor: () => { const b = $('reader-btn'); if (b && !b.hidden) b.click(); } },
    { id: 'falk', sel: '#krypto-btn', namn: 'Falk' },
    { id: 'chatt', sel: '#chatt-btn', namn: 'Chatt' },
    { id: 'bokmarken', namn: 'Bokmärken', dold: true, gor: () => { const f = fn('openBookmarks'); if (f) f(); } },
    { id: 'historik', namn: 'Historik', dold: true, gor: () => { const f = fn('openHistory'); if (f) f(); } },
    { id: 'nedladdningar', sel: '#dl-btn', namn: 'Nedladdningar' },
    { id: 'planbok', namn: 'Plånbok', dold: true, gor: installningar('wallet') },
    { id: 'tillagg', namn: 'Tillägg', dold: true, gor: installningar('tillagg') },
    { id: 'installningar', sel: '#settings-btn', namn: 'Inställningar' },
    { id: 'konto', sel: '#account-btn', namn: 'Konto' },
    { id: 'meny', sel: '#menu-btn', namn: 'Meny', fast: true },
  ];
  const karta = new Map();
  const foljare = new Map();   // knapp-id → element som inte är knappar men ska följa med den (t.ex. #allow-chip efter adressfältet)
  for (const k of reg) {
    k.el = k.sel ? tb.querySelector(':scope > ' + k.sel) : null;
    if (!k.el && !k.sel) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'icon-btn'; b.id = 'anp-vf-' + k.id; b.title = tr(k.namn); b.setAttribute('aria-label', tr(k.namn));
      b.innerHTML = IKON[k.id] || '';
      b.addEventListener('click', () => { if (!anpassar && k.gor) k.gor(); });
      b.classList.add('anp-dold');
      tb.appendChild(b); k.el = b;
    }
    if (k.el) { k.el.dataset.anpId = k.id; karta.set(k.id, k); }
  }
  const knappar = () => reg.filter((k) => k.el);

  // Andra delar av AdRaze kan lägga egna knappar i verktygsraden: en .icon-btn med id blir en knapp här också
  // (går att flytta och ta bort). Övriga element följer knappen före sig.
  function nyttBarn(el) {
    if (!(el instanceof HTMLElement) || el.dataset.anpId) return;
    if (el.matches('.icon-btn[id]')) { registrera({ id: '#' + el.id, el, namn: el.getAttribute('aria-label') || el.title || el.id }); return; }
    const fore = foregaende(el);
    if (!fore) return;   // före första knappen: får ligga kvar först
    if (!foljare.has(fore)) foljare.set(fore, []);
    if (!foljare.get(fore).includes(el)) foljare.get(fore).push(el);
  }
  function foregaende(el) { let p = el.previousElementSibling; while (p && !p.dataset.anpId) p = p.previousElementSibling; return p ? p.dataset.anpId : null; }
  function registrera(d) {
    if (!d || !d.id || karta.has(d.id) || !(d.el instanceof HTMLElement)) return false;
    const k = { id: String(d.id), el: d.el, namn: String(d.namn || d.id), ikon: d.ikon, dold: !!d.dold, fast: !!d.fast };
    // standardplats: efter knappen som står före i verktygsraden (annars före menyn)
    const fore = d.el.parentElement === tb ? foregaende(d.el) : null;
    const i = fore ? reg.findIndex((r) => r.id === fore) + 1 : reg.findIndex((r) => r.id === 'meny');
    reg.splice(i < 0 ? reg.length : i, 0, k);
    k.el.dataset.anpId = k.id;
    if (k.el.parentElement !== tb) tb.appendChild(k.el);
    karta.set(k.id, k);
    if (igang) rita();
    return true;
  }
  [...tb.children].forEach(nyttBarn);
  const mo = new MutationObserver((poster) => {   // knappar som läggs till senare (kopplas in vid DOMContentLoaded)
    let andrat = false;
    for (const p of poster) for (const n of p.addedNodes) if (n.nodeType === 1 && n.parentElement === tb && !n.dataset.anpId) { nyttBarn(n); andrat = true; }
    if (andrat) rita();
  });

  /* ── Sparat läge → effektivt läge ── */
  const falkGammaltAv = () => { try { return localStorage.getItem('skoll-krypto-btn') === '0'; } catch { return false; } };
  function las() {
    const v = vantar || A.get('verktyg.knappar');
    const giltig = !!(v && typeof v === 'object' && Array.isArray(v.ordning));
    const ordning = [], dolda = new Set();
    if (giltig) {
      for (const id of v.ordning) if (typeof id === 'string' && karta.has(id) && !ordning.includes(id)) ordning.push(id);
      if (Array.isArray(v.dolda)) for (const id of v.dolda) if (karta.has(id)) dolda.add(id);
    }
    // knappar som inte finns i det sparade (nya, eller standard) hamnar på sin standardplats
    const alla = knappar().map((k) => k.id);
    alla.forEach((id, i) => {
      if (ordning.includes(id)) return;
      let pos = 0;
      for (let j = i - 1; j >= 0; j--) { const p = ordning.indexOf(alla[j]); if (p >= 0) { pos = p + 1; break; } }
      ordning.splice(pos, 0, id);
      // Falk kunde döljas förut under Inställningar › Falk – det gäller tills verktygsfältet anpassas
      if (karta.get(id).dold || (!giltig && id === 'falk' && falkGammaltAv())) dolda.add(id);
    });
    for (const id of [...dolda]) if (karta.get(id).fast) dolda.delete(id);   // menyn och adressfältet finns alltid
    return { ordning, dolda };
  }
  function arStandard(ordning, dolda) {
    const alla = knappar();
    if (ordning.length !== alla.length || !alla.every((k, i) => k.id === ordning[i])) return false;
    return alla.every((k) => !!k.dold === dolda.has(k.id));
  }
  async function spara(ordning, dolda, etikett) {
    const v = arStandard(ordning, dolda) ? null : { ordning: [...ordning], dolda: ordning.filter((id) => dolda.has(id)) };
    const nu = A.alla()['verktyg.knappar'];
    if (JSON.stringify(v) === (vantar ? vantarSkickat : JSON.stringify(nu === undefined ? null : nu))) { rita(); return { ok: true }; }   // ingen ändring
    const mitt = vantar = v || { ordning: knappar().map((k) => k.id), dolda: knappar().filter((k) => k.dold).map((k) => k.id) };
    vantarSkickat = JSON.stringify(v);
    rita();
    let r = null;
    try { r = await A.set('verktyg.knappar', v, etikett); } catch {}
    if (vantar === mitt) { vantar = null; rita(); }   // (en snabbare ändring efter den här har sin egen väntan)
    return r;
  }
  const kanTasBort = (id) => { const k = karta.get(id); return !!k && !k.fast; };
  function taBort(id) {
    if (!kanTasBort(id)) return;
    const { ordning, dolda } = las(); if (dolda.has(id)) return;
    dolda.add(id);
    spara(ordning, dolda, tr('Tog bort') + ' ' + tr(karta.get(id).namn));
  }
  function laggTillbaka(id, foreId) {   // foreId: synlig knapp att hamna före, null = sist bland de synliga
    const { ordning, dolda } = las();
    if (!karta.has(id)) return;
    const ny = ordning.filter((x) => x !== id);
    let i = foreId ? ny.indexOf(foreId) : -1;
    if (i < 0) {
      if (foreId === undefined && !dolda.has(id)) return;   // klick på en knapp som redan syns
      if (foreId === undefined) i = ordning.indexOf(id);    // klick i lådan: tillbaka på sin gamla plats
      else { i = 0; ny.forEach((x, j) => { if (!dolda.has(x)) i = j + 1; }); }
    }
    ny.splice(Math.max(0, Math.min(i, ny.length)), 0, id);
    const varDold = dolda.delete(id);
    if (!varDold && ny.join() === ordning.join()) return;
    spara(ny, dolda, (varDold ? tr('La tillbaka') : tr('Flyttade')) + ' ' + tr(karta.get(id).namn));
  }
  function flytta(id, steg) {   // listan i Inställningar: ett steg upp/ner (bland alla knappar, även dolda)
    const { ordning, dolda } = las();
    const i = ordning.indexOf(id), j = i + steg;
    if (i < 0 || j < 0 || j >= ordning.length) return;
    [ordning[i], ordning[j]] = [ordning[j], ordning[i]];
    spara(ordning, dolda, tr('Flyttade') + ' ' + tr(karta.get(id).namn));
  }
  function vaxla(id, syns) {
    const { ordning, dolda } = las();
    if (!syns && !kanTasBort(id)) return;
    if (syns) dolda.delete(id); else dolda.add(id);
    spara(ordning, dolda, (syns ? tr('Visa') : tr('Dölj')) + ' ' + tr(karta.get(id).namn));
  }
  function aterstall() {
    try { localStorage.setItem('skoll-krypto-btn', '1'); } catch {}   // Falk syns i standardläget
    vantar = null;
    const r = A.alla()['verktyg.knappar'] === undefined ? Promise.resolve({ ok: true }) : A.set('verktyg.knappar', null, tr('Återställ verktygsfältet'));
    rita();
    return r;
  }

  /* ── Rita verktygsraden ── */
  function rita() {
    const { ordning, dolda } = las();
    for (const k of knappar()) k.el.classList.toggle('anp-dold', dolda.has(k.id));
    synkaFalk(!dolda.has('falk'));
    document.body.classList.toggle('anp-vf-lasvy', karta.has('lasvy') && !dolda.has('lasvy'));
    // ordningen: flytta bara om den ändrats (att flytta adressfältet tappar annars fokus i det)
    const onskad = [];
    // (en knapp som någon annan har tagit bort ur raden läggs inte tillbaka härifrån)
    for (const id of ordning) { const k = karta.get(id); if (k && k.el && k.el.parentElement === tb) onskad.push(k.el, ...(foljare.get(id) || []).filter((e) => e.parentElement === tb)); }
    const nu = [...tb.children].filter((e) => onskad.includes(e));
    if (nu.length !== onskad.length || nu.some((e, i) => e !== onskad[i])) {
      const fokus = document.activeElement, i0 = fokus && fokus.selectionStart, i1 = fokus && fokus.selectionEnd;
      for (const e of onskad) tb.appendChild(e);
      if (fokus && fokus !== document.activeElement && tb.contains(fokus)) { try { fokus.focus({ preventScroll: true }); if (typeof i0 === 'number') fokus.setSelectionRange(i0, i1); } catch {} }
    }
    mo.takeRecords();   // våra egna flyttar är inga nya knappar
    if (anpassar) ritaLada();
  }
  // Inställningar › Falk › "Visa Falk-knappen" och verktygsfältet är samma sak
  function synkaFalk(syns) {
    const b = $('krypto-btn'); if (!b) return;
    if (b.style.display !== (syns ? '' : 'none')) b.style.display = syns ? '' : 'none';
    try { if (localStorage.getItem('skoll-krypto-btn') !== (syns ? '1' : '0')) localStorage.setItem('skoll-krypto-btn', syns ? '1' : '0'); } catch {}
    const t = $('tgl-krypto'); if (t && t.checked !== syns) t.checked = syns;
  }
  // Läslägesknappen i verktygsraden följer bokikonen i adressfältet (som göms medan knappen syns)
  function synkaLasvy() {
    const k = karta.get('lasvy'), rb = $('reader-btn'); if (!k || !k.el || !rb) return;
    k.el.disabled = !!rb.hidden;
    k.el.classList.toggle('on', rb.classList.contains('on'));
    k.el.title = rb.hidden ? tr('Läsläge') + ' – ' + tr('finns inte för den här sidan') : (rb.title || tr('Läsläge'));
  }
  // Startsidan: din valda startsida (Vid start › Öppna en viss sida), annars den nya flikens sida i samma flik
  function hem() {
    const a = aktivFlik(); if (!a) return;
    let sm = null, su = '';
    try { sm = startMode; su = startUrl; } catch {}   // eslint-disable-line no-undef
    const sa = fn('startAddress'), gn = fn('guardedNavigate'), st = fn('switchTab');
    if (sm === 'sida' && sa && gn && sa(su)) { gn(a, sa(su)); return; }
    if (!a.url || !st || !window.view) return;
    try { window.view.destroy(a.id); if (a.incognito) window.view.markIncognito(a.id); } catch {}   // ny vy nästa gång (inkognito förblir inkognito)
    Object.assign(a, { url: null, title: a.incognito ? 'Inkognito' : 'Ny flik', favicon: null, canBack: false, canForward: false, verdict: null, warning: null,
      readerable: false, readerOn: false, pipHas: false, pipOn: false, falkGranskar: false, blocked: 0, audible: false });
    st(a);
  }

  /* ── Adressfältet: hela adressen eller bara domänen, med eller utan https:// och www. ── */
  // shell.js skriver alltid adressfältet som pretty(url) när du inte står i det. Värdet fångas här och
  // skrivs om enligt inställningen – bara när det är den visade flikens adress och fältet saknar fokus.
  function formatera(url, lage, dolj) {
    let u; try { u = new URL(url); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;   // adraze:// m.fl. visas som förut
    if (lage !== 'doman') return dolj ? null : url;
    const host = dolj ? u.hostname.replace(/^www\./, '') : u.hostname;
    return (dolj ? '' : u.protocol + '//') + host + (u.port ? ':' + u.port : '');
  }
  const adressLage = () => (A.get('verktyg.adress', 'hel') === 'doman' ? 'doman' : 'hel');
  // Står du i fältet? activeElement ligger kvar på fältet även när du klickat vidare in på sidan (en annan vy), därför hasFocus
  const skriver = (inp) => document.hasFocus() && document.activeElement === inp;
  const doljSchema = () => A.get('verktyg.doljSchema', true) !== false;
  (function adressfalt() {
    const inp = $('address');
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (!inp || !d || !d.get || !d.set) return;
    Object.defineProperty(inp, 'value', {
      configurable: true, enumerable: true,
      get() { return d.get.call(this); },
      set(v) {
        try {
          if (!skriver(this) && (adressLage() !== 'hel' || !doljSchema())) {
            const a = aktivFlik(), pr = fn('pretty');
            if (a && a.url && pr && String(v) === pr(a.url)) { const ny = formatera(a.url, adressLage(), doljSchema()); if (ny != null) v = ny; }
          }
        } catch {}
        d.set.call(this, v);
      },
    });
  })();
  function skrivAdress() {
    const inp = $('address'), a = aktivFlik(), pr = fn('pretty');
    if (!inp || skriver(inp) || !pr) return;
    inp.value = a && a.url ? pr(a.url) : '';
  }

  /* ── Verktygsraden längst ner ── */
  function rapporteraKanter() {   // huvudprocessen räknar webbytan direkt när fönstret ändrar storlek (inget hopp)
    const v = $('views'); if (!v || !bro) return;
    const r = v.getBoundingClientRect();
    const k = { under: Math.max(0, Math.round(innerHeight - r.bottom)), hoger: Math.max(0, Math.round(innerWidth - r.right)) };
    if (kanter && kanter.under === k.under && kanter.hoger === k.hoger) return;
    kanter = k; try { bro.kanter(k); } catch {}
  }
  function matOm() {   // webbytan har flyttat eller bytt storlek
    rapporteraKanter();
    const sb = fn('sendBounds'); if (sb) { try { sb(); } catch {} }
    const sug = $('omni-suggest'), ps = fn('positionSug');
    if (sug && sug.classList.contains('on') && ps) { try { ps(); } catch {} }
  }
  function placering() {
    const nere = A.get('verktyg.placering', 'uppe') === 'nere';
    if (document.body.classList.contains('anp-vf-nere') !== nere) { document.body.classList.toggle('anp-vf-nere', nere); matOm(); }
    else rapporteraKanter();
  }
  // Krok från shell.js (positionSug): med raden längst ner öppnas förslagslistan uppåt
  function forslag(el, r, ankare) {
    if (!el || !r) return;
    const upp = document.body.classList.contains('anp-vf-nere') && !!ankare && tb.contains(ankare);
    el.classList.toggle('anp-upp', upp);
    if (upp) { el.style.top = 'auto'; el.style.bottom = Math.round(innerHeight - r.top + 5) + 'px'; el.style.maxHeight = Math.max(120, Math.round(r.top - 12)) + 'px'; }
    else { el.style.bottom = ''; el.style.maxHeight = ''; }
  }

  /* ── Bokmärkesfältet: alltid / bara på ny flik / aldrig ── */
  function bmLage() {
    const v = A.alla()['verktyg.bokmarkesfalt'];
    if (BM.includes(v)) return v;
    let pa = true; try { pa = localStorage.getItem('adraze-bmbar') !== '0'; } catch {}   // äldre inställningen gäller tills läget väljs
    return pa ? 'alltid' : 'aldrig';
  }
  const bmbarPa = () => { try { return bmbarOn; } catch { return null; } };   // eslint-disable-line no-undef
  function bokmarken() {
    const lage = bmLage(), pa = lage !== 'aldrig', t = $('tgl-bmbar'), nu = bmbarPa();
    // av/på sköts av den befintliga knappen (Utseende › Visa bokmärkesfältet), så kortkommandot och allt annat följer med
    if (nu !== null && nu !== pa && t) { t.checked = pa; t.dispatchEvent(new Event('change')); }
    document.body.classList.toggle('anp-bm-nyflik', lage === 'nyflik');
    nyFlik();
  }
  function paNyFlik() {
    const syns = (id) => { const e = $(id); return !!e && !e.classList.contains('hidden'); };
    if (!syns('newtabpage') && !syns('incogpage')) return false;
    return !['settings', 'login', 'bookmarks', 'bgpick', 'qr'].some(syns);
  }
  function nyFlik() {
    const gomd = document.body.classList.contains('anp-bm-nyflik') && !paNyFlik();
    if (document.body.classList.contains('anp-bm-gomd') === gomd) return;
    document.body.classList.toggle('anp-bm-gomd', gomd);
    matOm();
  }
  // Den gamla knappen (eller Ctrl+Shift+B) ändrades → läget följer med
  function bmFranGammalt() {
    const pa = bmbarPa(); if (pa === null) return;
    const lage = bmLage();
    if (!pa && lage !== 'aldrig') A.set('verktyg.bokmarkesfalt', 'aldrig', tr('Bokmärkesfältet'));
    else if (pa && lage === 'aldrig') A.set('verktyg.bokmarkesfalt', 'alltid', tr('Bokmärkesfältet'));
  }

  /* ── Anpassa-läget: dra och släpp ── */
  const aktivFlikId = () => { const e = $('tabs') && $('tabs').querySelector('.tab.active'); return e ? e.dataset.tabid : null; };
  function ikonFor(k) {
    if (k.ikon) return k.ikon;
    if (IKON[k.id]) return IKON[k.id];
    const s = k.el && k.el.querySelector('svg, img'); if (!s) return '';
    const c = s.cloneNode(true); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    return c.outerHTML;
  }
  function anpassa() {
    if (anpassar) return;
    anpassar = true;
    try { if (document.activeElement && tb.contains(document.activeElement)) document.activeElement.blur(); } catch {}
    const cs = fn('closeSug'); if (cs) { try { cs(false); } catch {} }
    try { window.view.hide(); } catch {}   // webbsidan ritas annars ovanpå lådan
    document.body.classList.add('anp-vf-anpassar');
    flikVidStart = aktivFlikId();
    byggLage();
    rita();
  }
  function avsluta() {
    if (!anpassar) return;
    anpassar = false;
    stadaDrag();
    document.body.classList.remove('anp-vf-anpassar');
    if (lage) { lage.remove(); lage = null; ladaEl = null; }
    const a = aktivFlik();
    if (a && !a.overlay) { const s = fn('showActiveTab'); if (s) { try { s(); } catch {} } }   // tillbaka till sidan (inte om t.ex. inställningarna ligger över)
    rita();
  }
  function byggLage() {
    const host = $('views'); if (!host) return;
    lage = document.createElement('div');
    lage.id = 'anp-vf-lage';
    lage.setAttribute('role', 'dialog'); lage.setAttribute('aria-label', tr('Anpassa verktygsfältet'));
    lage.innerHTML = '<div class="anp-vf-kort">'
      + '<h2>' + esc(tr('Anpassa verktygsfältet')) + '</h2>'
      + '<p class="anp-vf-ingress">' + esc(tr('Dra knapparna i verktygsraden dit du vill ha dem. Dra en knapp hit för att ta bort den, och tillbaka till raden för att lägga till den igen.')) + '</p>'
      + '<div class="anp-vf-lada" aria-label="' + esc(tr('Knappar som inte syns')) + '"></div>'
      + '<p class="anp-vf-tips" aria-live="polite"></p>'
      + '<div class="anp-vf-fot">'
      +   '<div class="anp-vf-val">'
      +     '<span>' + esc(tr('Adressfältet')) + '</span><div class="anp-vf-seg" data-val="placering"><button type="button" data-v="uppe">' + esc(tr('Uppe')) + '</button><button type="button" data-v="nere">' + esc(tr('Nere')) + '</button></div>'
      +     '<span>' + esc(tr('Bokmärkesfältet')) + '</span><div class="anp-vf-seg" data-val="bokmarken"><button type="button" data-v="alltid">' + esc(tr('Alltid')) + '</button><button type="button" data-v="nyflik">' + esc(tr('På ny flik')) + '</button><button type="button" data-v="aldrig">' + esc(tr('Aldrig')) + '</button></div>'
      +   '</div>'
      +   '<div class="anp-vf-knappar"><button type="button" class="anp-vf-knapp anp-vf-sek" data-g="aterstall">' + esc(tr('Återställ standard')) + '</button><button type="button" class="anp-vf-knapp anp-vf-klar" data-g="klar">' + esc(tr('Klar')) + '</button></div>'
      + '</div></div>';
    ladaEl = lage.querySelector('.anp-vf-lada');
    lage.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'), s = e.target.closest('.anp-vf-seg button');
      if (g && g.dataset.g === 'klar') avsluta();
      else if (g && g.dataset.g === 'aterstall') { aterstall(); tips(''); }
      else if (s) {
        const val = s.parentElement.dataset.val;
        if (val === 'placering') satt('verktyg.placering', s.dataset.v, tr('Adressfältets placering'));
        if (val === 'bokmarken') satt('verktyg.bokmarkesfalt', s.dataset.v, tr('Bokmärkesfältet'), bmLage());
      }
    });
    ladaEl.addEventListener('keydown', (e) => {   // tangentbord: Enter/mellanslag på en knapp i lådan lägger tillbaka den
      const b = e.target.closest('.anp-vf-bit');
      if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); laggTillbaka(b.dataset.id); }
    });
    host.appendChild(lage);
    ritaLada();
  }
  function ritaLada() {
    if (!lage || !ladaEl) return;
    const { ordning, dolda } = las();
    const ids = ordning.filter((id) => dolda.has(id));
    ladaEl.innerHTML = ids.length ? ids.map((id) => { const k = karta.get(id); return '<button type="button" class="anp-vf-bit" data-id="' + esc(id) + '" title="' + esc(tr('Dra till verktygsraden, eller klicka för att lägga tillbaka')) + '">' + ikonFor(k) + '<span>' + esc(tr(k.namn)) + '</span></button>'; }).join('')
      : '<div class="anp-vf-tom">' + esc(tr('Lådan är tom. Dra hit knappar du inte använder.')) + '</div>';
    const pl = A.get('verktyg.placering', 'uppe') === 'nere' ? 'nere' : 'uppe', bm = bmLage();
    lage.querySelectorAll('.anp-vf-seg[data-val="placering"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === pl));
    lage.querySelectorAll('.anp-vf-seg[data-val="bokmarken"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === bm));
  }
  let tipsTimer = null;
  function tips(text) {
    const p = lage && lage.querySelector('.anp-vf-tips'); if (!p) return;
    p.textContent = text; clearTimeout(tipsTimer);
    if (text) tipsTimer = setTimeout(() => { p.textContent = ''; }, 3500);
  }
  const synligaKnappar = () => [...tb.children].filter((e) => e.dataset && e.dataset.anpId && !e.classList.contains('anp-dold') && e.getClientRects().length);

  function pekNer(e) {
    if (!anpassar || e.button !== 0 || drag) return;
    const bit = e.target.closest && e.target.closest('.anp-vf-bit');
    const el = !bit && e.target.closest && e.target.closest('#toolbar [data-anp-id]');
    const id = bit ? bit.dataset.id : el ? el.dataset.anpId : null;
    if (!id || !karta.has(id)) return;
    e.preventDefault();   // inget fokus i adressfältet, ingen markering
    drag = { id, fran: bit ? 'lada' : 'rad', kalla: bit || el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, aktiv: false, mal: null };
    try { drag.kalla.setPointerCapture(e.pointerId); } catch {}
  }
  function pekFlytt(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.aktiv) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return; borjaDra(); }
    e.preventDefault();
    const s = drag.spoke; s.style.transform = 'translate(' + Math.round(e.clientX - drag.dx) + 'px,' + Math.round(e.clientY - drag.dy) + 'px)';
    hittaMal(e.clientX, e.clientY);
  }
  function pekUpp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    stadaDrag();
    if (!d.aktiv) { if (d.fran === 'lada' && e.type === 'pointerup') laggTillbaka(d.id); return; }   // klick på en knapp i lådan
    if (e.type !== 'pointerup' || !d.mal) return;
    if (d.mal.typ === 'rad') laggTillbaka(d.id, d.mal.fore);
    else if (d.mal.typ === 'lada' && d.fran === 'rad') {
      if (kanTasBort(d.id)) taBort(d.id);
      else tips(d.id === 'meny' ? tr('Menyknappen finns alltid kvar, så att du alltid kommer åt menyn.') : tr('Adressfältet finns alltid kvar.'));
    }
  }
  function borjaDra() {
    const d = drag, k = karta.get(d.id);
    d.aktiv = true;
    const s = document.createElement('div');
    s.className = 'anp-vf-spoke' + (k.id === 'adressfalt' || d.fran === 'lada' ? ' bred' : '');
    s.innerHTML = ikonFor(k) + (s.classList.contains('bred') ? '<span>' + esc(tr(k.namn)) + '</span>' : '');
    document.body.appendChild(s);
    const r = s.getBoundingClientRect();
    d.dx = r.width / 2; d.dy = r.height / 2; d.spoke = s;
    d.kalla.classList.add('anp-vf-drar');
    document.body.classList.add('anp-vf-drag');
    if (!markor) { markor = document.createElement('div'); markor.id = 'anp-vf-markor'; markor.className = 'anp-vf-markor'; document.body.appendChild(markor); }
  }
  function hittaMal(x, y) {
    const d = drag, r = tb.getBoundingClientRect();
    const iRad = x >= r.left && x <= r.right && y >= r.top - 28 && y <= r.bottom + 28;
    const lr = ladaEl ? ladaEl.getBoundingClientRect() : null;
    const iLada = !!lr && x >= lr.left - 12 && x <= lr.right + 12 && y >= lr.top - 12 && y <= lr.bottom + 12;
    if (ladaEl) { ladaEl.classList.toggle('anp-vf-over', iLada && d.fran === 'rad' && kanTasBort(d.id)); ladaEl.classList.toggle('anp-vf-nej', iLada && d.fran === 'rad' && !kanTasBort(d.id)); }
    if (iRad) {
      const syns = synligaKnappar().filter((el) => el.dataset.anpId !== d.id);
      let fore = null;
      for (const el of syns) { const b = el.getBoundingClientRect(); if (x < b.left + b.width / 2) { fore = el; break; } }
      let mx;
      if (fore) { const b = fore.getBoundingClientRect(), i = syns.indexOf(fore), p = i > 0 ? syns[i - 1].getBoundingClientRect() : null; mx = p ? (p.right + b.left) / 2 : b.left - 3; }
      else { const l = syns[syns.length - 1]; mx = l ? l.getBoundingClientRect().right + 3 : r.left + 10; }
      markor.style.cssText = 'display:block;left:' + Math.round(mx - 1.5) + 'px;top:' + Math.round(r.top + 9) + 'px;height:' + Math.round(r.height - 18) + 'px;';
      d.mal = { typ: 'rad', fore: fore ? fore.dataset.anpId : null };
    } else {
      if (markor) markor.style.display = 'none';
      d.mal = iLada ? { typ: 'lada' } : null;
    }
  }
  function stadaDrag() {
    const d = drag; drag = null;
    if (d) {
      try { d.kalla.releasePointerCapture(d.pid); } catch {}
      if (d.kalla) d.kalla.classList.remove('anp-vf-drar');
      if (d.spoke) d.spoke.remove();
    }
    if (markor) markor.style.display = 'none';
    if (ladaEl) ladaEl.classList.remove('anp-vf-over', 'anp-vf-nej');
    document.body.classList.remove('anp-vf-drag');
  }
  document.addEventListener('pointerdown', pekNer, true);
  document.addEventListener('pointermove', pekFlytt, true);
  document.addEventListener('pointerup', pekUpp, true);
  document.addEventListener('pointercancel', pekUpp, true);
  // I anpassa-läget gör knapparna ingenting när man klickar (man drar dem)
  tb.addEventListener('click', (e) => { if (anpassar && e.target.closest('[data-anp-id]')) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('keydown', (e) => { if (anpassar && e.key === 'Escape') { e.preventDefault(); if (drag) stadaDrag(); else avsluta(); } }, true);

  /* ── Högerklick på verktygsraden och bokmärkesfältet ── */
  function meny(e, el) {
    e.preventDefault();
    const k = el && karta.get(el.dataset.anpId);
    try { bro.meny({ knapp: k ? k.id : null, namn: k ? tr(k.namn) : '', kanTasBort: !!(k && !k.fast), anpassar, bokmarken: bmLage(), andrat: A.get('verktyg.knappar') != null }); } catch {}
  }
  if (bro) {
    tb.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input, textarea, [contenteditable]')) return;   // i adressfältet: klipp ut/kopiera/klistra in som förut
      meny(e, e.target.closest('[data-anp-id]'));
    });
    const bm = $('bmbar');
    if (bm) bm.addEventListener('contextmenu', (e) => { if (!e.target.closest('.bmchip')) meny(e, null); });   // ett bokmärke: tas bort som förut
    bro.onVal((d) => {
      const a = d && d.atgard, v = d && d.varde;
      if (a === 'anpassa') anpassa();
      else if (a === 'klar') avsluta();
      else if (a === 'ta-bort') taBort(v);
      else if (a === 'aterstall') aterstall();
      else if (a === 'bokmarken' && BM.includes(v)) satt('verktyg.bokmarkesfalt', v, tr('Bokmärkesfältet'), bmLage());
      else if (a === 'placering' && (v === 'uppe' || v === 'nere')) satt('verktyg.placering', v, tr('Adressfältets placering'));
    });
  }

  /* ── Inställningar › Anpassa › Verktygsfältet ── */
  const PIL = (upp) => '<svg class="ic ic-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (upp ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6') + '"/></svg>';
  const seg = (val, lista, nu) => '<div class="seg flex-none" data-val="' + val + '">' + lista.map(([v, t]) => '<button type="button" class="seg-btn' + (v === nu ? ' on' : '') + '" data-v="' + v + '">' + esc(tr(t)) + '</button>').join('') + '</div>';
  const rad = (titel, desc, kontroll, extra) => '<div class="set-row' + (extra ? ' ' + extra : '') + '"><div class="set-txt"><div class="set-title">' + esc(tr(titel)) + '</div>' + (desc ? '<div class="set-desc">' + esc(tr(desc)) + '</div>' : '') + '</div>' + kontroll + '</div>';
  function ritaPanel() {
    const box = $('anp-verktyg'); if (!box) return;
    const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
    const fokus = f ? { id: f.closest('[data-id]') && f.closest('[data-id]').dataset.id, roll: f.dataset.roll || (f.closest('[data-val]') && 'v:' + f.closest('[data-val]').dataset.val + ':' + f.dataset.v) || f.id } : null;
    const { ordning, dolda } = las();
    const lista = ordning.map((id, i) => {
      const k = karta.get(id), pa = !dolda.has(id), namn = tr(k.namn);
      return '<div class="set-row anp-vf-rad' + (pa ? '' : ' av') + '" data-id="' + esc(id) + '">'
        + '<span class="anp-vf-ikon">' + ikonFor(k) + '</span>'
        + '<div class="set-txt"><div class="set-title">' + esc(namn) + '</div>' + (k.fast ? '<div class="set-desc">' + esc(tr('Finns alltid kvar')) + '</div>' : '') + '</div>'
        + '<div class="anp-vf-pilar"><button type="button" class="anp-vf-pil" data-roll="upp" title="' + esc(tr('Flytta upp')) + '" aria-label="' + esc(tr('Flytta upp') + ': ' + namn) + '"' + (i === 0 ? ' disabled' : '') + '>' + PIL(true) + '</button>'
        + '<button type="button" class="anp-vf-pil" data-roll="ner" title="' + esc(tr('Flytta ner')) + '" aria-label="' + esc(tr('Flytta ner') + ': ' + namn) + '"' + (i === ordning.length - 1 ? ' disabled' : '') + '>' + PIL(false) + '</button></div>'
        + '<label class="switch" title="' + esc(k.fast ? tr('Finns alltid kvar') : pa ? tr('Syns i verktygsraden') : tr('Ligger i lådan')) + '"><input type="checkbox" data-roll="vaxla" aria-label="' + esc(tr('Visa') + ': ' + namn) + '"' + (pa ? ' checked' : '') + (k.fast ? ' disabled' : '') + '><span class="track"></span></label>'
        + '</div>';
    }).join('');
    box.innerHTML = '<h3 class="set-h3">' + esc(tr('Verktygsfältet')) + '</h3>'
      + '<p class="set-lead">' + esc(tr('Välj vilka knappar som syns och i vilken ordning. Du kan också högerklicka på verktygsraden och dra knapparna dit du vill.')) + '</p>'
      + '<div class="anp-vf-lista">' + lista + '</div>'
      + '<div class="anp-vf-atgarder"><button type="button" class="set-btn" id="anp-vf-dra">' + esc(tr('Anpassa med dra och släpp')) + '</button>'
      + '<button type="button" class="pill" id="anp-vf-aterstall"' + (A.get('verktyg.knappar') == null ? ' disabled' : '') + '>' + esc(tr('Återställ standard')) + '</button></div>'
      + '<h3 class="set-h3">' + esc(tr('Adressfältet')) + '</h3>'
      + rad('Visa', 'Hela adressen syns alltid när du klickar i fältet.', seg('adress', [['hel', 'Hela adressen'], ['doman', 'Bara domänen']], adressLage()))
      + rad('Dölj https:// och www.', 'Gör adressen kortare och lättare att läsa.', '<label class="switch"><input type="checkbox" id="anp-vf-schema"' + (doljSchema() ? ' checked' : '') + '><span class="track"></span></label>')
      + rad('Placering', 'Lägg adressfältet och knapparna längst ner i fönstret.', seg('placering', [['uppe', 'Uppe'], ['nere', 'Nere']], A.get('verktyg.placering', 'uppe') === 'nere' ? 'nere' : 'uppe'))
      + '<h3 class="set-h3">' + esc(tr('Bokmärkesfältet')) + '</h3>'
      + rad('Visa bokmärkesfältet', 'Dina sparade sidor intill adressfältet. Syns när du har sparat minst ett bokmärke.', seg('bokmarken', [['alltid', 'Alltid'], ['nyflik', 'På ny flik'], ['aldrig', 'Aldrig']], bmLage()));
    if (fokus) {   // behåll tangentbordsfokus när listan ritas om
      let el = null;
      if (fokus.roll && fokus.roll.startsWith('v:')) { const [, val, v] = fokus.roll.split(':'); el = box.querySelector('[data-val="' + val + '"] [data-v="' + v + '"]'); }
      else if (fokus.id) el = box.querySelector('[data-id="' + CSS.escape(fokus.id) + '"] [data-roll="' + fokus.roll + '"]');
      else if (fokus.roll) el = $(fokus.roll);
      if (el && el.disabled && fokus.id) el = box.querySelector('[data-id="' + CSS.escape(fokus.id) + '"] .anp-vf-pil:not([disabled])');
      if (el) { try { el.focus({ preventScroll: true }); } catch {} }
    }
  }
  function panelSyns() { const b = $('anp-verktyg'), p = b && b.closest('.set-panel'), s = $('settings'); return !!(b && p && !p.classList.contains('hidden') && s && !s.classList.contains('hidden')); }
  (function panelHandelser() {
    const box = $('anp-verktyg'); if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const id = b.closest('[data-id]') && b.closest('[data-id]').dataset.id;
      const val = b.closest('[data-val]') && b.closest('[data-val]').dataset.val;
      if (b.dataset.roll === 'upp' && id) flytta(id, -1);
      else if (b.dataset.roll === 'ner' && id) flytta(id, 1);
      else if (b.id === 'anp-vf-dra') anpassa();
      else if (b.id === 'anp-vf-aterstall') aterstall();
      else if (val === 'adress') satt('verktyg.adress', b.dataset.v, tr('Adressfältet: visa'));
      else if (val === 'placering') satt('verktyg.placering', b.dataset.v, tr('Adressfältets placering'));
      else if (val === 'bokmarken') satt('verktyg.bokmarkesfalt', b.dataset.v, tr('Bokmärkesfältet'), bmLage());
    });
    box.addEventListener('change', (e) => {
      const i = e.target;
      if (i.dataset.roll === 'vaxla') { const id = i.closest('[data-id]') && i.closest('[data-id]').dataset.id; if (id) vaxla(id, i.checked); }
      else if (i.id === 'anp-vf-schema') satt('verktyg.doljSchema', i.checked, tr('Dölj https:// och www.'));
    });
  })();
  document.addEventListener('anpassa:visa', ritaPanel);

  /* ── Ändringar i butiken (från det här fönstret, ett annat fönster, ångra eller delningskod) ── */
  A.on('verktyg.', (nyckel, varde) => {
    if (nyckel === 'verktyg.knappar') {
      // vår egen väntande ändring kom tillbaka (eller ingen väntar) → butikens värde gäller
      if (!vantar || JSON.stringify(varde === undefined ? null : varde) === vantarSkickat) vantar = null;
      rita();
    }
    else if (nyckel === 'verktyg.placering') placering();
    else if (nyckel === 'verktyg.bokmarkesfalt') bokmarken();
    else if (nyckel === 'verktyg.adress' || nyckel === 'verktyg.doljSchema') skrivAdress();
    if (anpassar) ritaLada();
    if (panelSyns()) ritaPanel();
  });

  // Direkt (före shell.js): rätt ordning och placering redan när skalet mäter webbytan första gången
  igang = true;
  rita();
  placering();
  window.AnpassaVerktyg = { registrera, anpassa, avsluta, forslag, aterstall, get anpassar() { return anpassar; } };

  // Sedan (efter shell.js): kopplingar mot shell.js funktioner och de äldre inställningarna
  document.addEventListener('DOMContentLoaded', () => {
    mo.observe(tb, { childList: true });
    const tk = $('tgl-krypto');
    if (tk) tk.addEventListener('change', () => {   // Inställningar › Falk › Visa Falk-knappen (shell.js har redan sparat sitt)
      const { ordning, dolda } = las();
      if (tk.checked) dolda.delete('falk'); else dolda.add('falk');
      spara(ordning, dolda, tr(tk.checked ? 'Visa Falk-knappen' : 'Dölj Falk-knappen'));
    });
    const tbm = $('tgl-bmbar'); if (tbm) tbm.addEventListener('change', bmFranGammalt);
    try { window.view.onShortcut((namn) => { if (namn === 'toggle-bmbar') setTimeout(bmFranGammalt, 0); }); } catch {}
    const bm = $('bmbar'); if (bm) new MutationObserver(() => setTimeout(bmFranGammalt, 0)).observe(bm, { attributes: true, attributeFilter: ['style'] });
    const rb = $('reader-btn'); if (rb) { new MutationObserver(synkaLasvy).observe(rb, { attributes: true, attributeFilter: ['hidden', 'class', 'title'] }); synkaLasvy(); }
    // ny flik (för "bara på ny flik") och flikbyte (avslutar anpassa-läget)
    const sidor = ['newtabpage', 'incogpage', 'settings', 'login', 'bookmarks', 'bgpick', 'qr'].map($).filter(Boolean);
    const sidMo = new MutationObserver(nyFlik);
    sidor.forEach((e) => sidMo.observe(e, { attributes: true, attributeFilter: ['class'] }));
    const flikar = $('tabs');
    if (flikar) new MutationObserver(() => { if (anpassar && aktivFlikId() !== flikVidStart) avsluta(); }).observe(flikar, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
    const v = $('views'); if (v && window.ResizeObserver) new ResizeObserver(() => rapporteraKanter()).observe(v);
    bokmarken();
    rita();
    matOm();
  });
})();
