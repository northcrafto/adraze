// Anpassa → flikar (skalet). Värden i Anpassa-butiken (flikar.*), huvudprocessens del i ../anpassa-flikar.js.
//  1. Placering: upptill (som förut), på sidan (panel till vänster, hopfällbar till ikoner, dragbar bredd) eller dolda
//     (flikraden glider fram över verktygsraden när musen når överkanten, eller med Ctrl+Shift+A).
//     Webbsidan är en egen vy i huvudprocessen som läggs exakt över #views (shell.js sendBounds). Därför flyttas bara
//     skalets HTML med CSS ("Anpassa: flikar" i input.css) och sendBounds() skickar de nya måtten efteråt.
//  2. Flikgrupper: namn + färg (6), fäll ihop/ut, sparas (flikar.grupper) och följer med flikarna vid omstart
//     (vilken grupp varje flik har sparas bredvid adresserna, localStorage adraze-flikgrupper).
//  3. Fliklogik: var nya flikar hamnar, vad som händer när sista fliken stängs, stängknapp på alla flikar/bara aktiv.
//  4. Sovande flikar: huvudprocessen släpper minnet (main.js discardTab), här visas de blekare tills de laddas igen.
// Krokarna i shell.js (createTab, saveOpenTabs, finalizeClose, layoutTabs, renderTabs, tabMenu) anropar window.AnpFlikar.
(function () {
  'use strict';
  const A = window.Anpassa;
  const bro = window.anpassaFlikar || {};
  const $ = (id) => document.getElementById(id);
  const tt = (s) => (typeof window.t === 'function' ? window.t(s) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const INKOGNITO = new URLSearchParams(location.search).has('incognito');
  const TILLH_KEY = 'adraze-flikgrupper';
  const FARG_ORDNING = ['bla', 'gron', 'orange', 'rosa', 'gul', 'gra'];   // färgen nya grupper får, i tur och ordning
  const FARGNAMN = { gra: 'Grå', bla: 'Blå', gron: 'Grön', gul: 'Gul', orange: 'Orange', rosa: 'Rosa' };
  const BREDD_MIN = 170, BREDD_MAX = 420, BREDD_STD = 240, BREDD_SMAL = 56;
  const SOV = [[0, 'Av'], [15, 'Efter 15 minuter'], [30, 'Efter 30 minuter'], [60, 'Efter 1 timme'], [120, 'Efter 2 timmar']];

  const get = (k, d) => { try { const v = A ? A.get(k) : undefined; return v === undefined || v === null ? d : v; } catch { return d; } };
  const lage = () => { const v = get('flikar.lage', 'upptill'); return v === 'vertikal' || v === 'dolda' ? v : 'upptill'; };
  const bredd = () => Math.round(Math.min(BREDD_MAX, Math.max(BREDD_MIN, Number(get('flikar.vertikalBredd', BREDD_STD)) || BREDD_STD)));
  let tillfalligtBred = false;   // ikonpanelen öppnas en stund när en grupp får nytt namn
  const smal = () => lage() === 'vertikal' && get('flikar.vertikalSmal', false) === true && !tillfalligtBred;

  // Skalets flikar (shell.js laddas efter den här filen; tabs/active är globala let där)
  const allaFlikar = () => { try { return typeof tabs !== 'undefined' && Array.isArray(tabs) ? tabs : []; } catch { return []; } };
  const aktiv = () => { try { return typeof active !== 'undefined' ? active : null; } catch { return null; } };
  const flik = (id) => allaFlikar().find((t) => t.id === id) || null;
  function kor(namn, ...a) { try { const f = window[namn]; if (typeof f === 'function') return f(...a); } catch (e) { console.warn('[anpassa-flikar]', namn, e); } return undefined; }

  /* ── Grupper ── */
  let defs = INKOGNITO ? [] : lasDefs();   // [{ id, namn, farg, hopfalld }] – inkognitofönster: bara i minnet, sparas aldrig
  function lasDefs() { const g = get('flikar.grupper', []); return Array.isArray(g) ? g.filter((x) => x && typeof x.id === 'string' && FARGNAMN[x.farg]) : []; }
  const def = (id) => (id ? defs.find((g) => g.id === id) || null : null);
  const gruppAv = (t) => (t && !t.pinned && t.grupp ? def(t.grupp) : null);
  const egna = new Set();          // grupper som haft flikar i det här fönstret – bara de städas bort när de blir tomma
  const rubriker = new Map();      // grupp-id → rubrikens element (återanvänds mellan ritningar)
  let redigerar = null;            // grupp-id som får nytt namn just nu
  let ingenArvning = false;        // nästa nya flik ska inte ärva den aktiva flikens grupp
  let klar = false;                // flikarna återställda och grupperna utdelade

  // Spara gruppernas namn/färger. Med etikett = hamnar i Anpassas ångra-historik; utan = tyst (ihopfällning, städning).
  // Egna sparningar som ännu inte kommit tillbaka från butiken: ett äldre eko får inte skriva över en nyare ändring
  // (annars kunde en flik tappa en grupp som just skapats).
  const vantande = [];
  function sparaDefs(nya, etikett) {
    defs = nya;
    if (INKOGNITO) return;
    const rena = nya.map((g) => ({ id: g.id, namn: g.namn || '', farg: g.farg, hopfalld: !!g.hopfalld }));
    vantande.push(JSON.stringify(rena)); if (vantande.length > 20) vantande.shift();
    try {
      if (etikett && A) A.set('flikar.grupper', rena, etikett);
      else if (bro.grupperTyst) bro.grupperTyst(rena);
    } catch {}
  }
  function andraGrupp(id, andring, etikett) {
    if (!def(id)) return;
    sparaDefs(defs.map((g) => (g.id === id ? { ...g, ...andring } : g)), etikett);
    omrita();
  }
  // Gruppens flikar ligger alltid i följd (fästa flikar först, de har aldrig grupp)
  function ordna() {
    const lista = allaFlikar(); if (!lista.length) return false;
    const ut = []; const klara = new Set();
    for (const t of lista) {
      const g = gruppAv(t);
      if (!g) { ut.push(t); continue; }
      if (klara.has(g.id)) continue;
      klara.add(g.id);
      for (const u of lista) if (gruppAv(u) === g) ut.push(u);
    }
    if (ut.every((t, i) => t === lista[i])) return false;
    lista.splice(0, lista.length, ...ut);
    return true;
  }
  function omrita() { ordna(); kor('renderTabs'); }
  function sparaFlikar() { kor('saveOpenTabs'); }
  const grupperIFonstret = () => { const s = new Set(allaFlikar().map((t) => gruppAv(t)).filter(Boolean)); return defs.filter((g) => s.has(g)); };

  const kanGrupperas = (t) => !!t && !t.pinned && !(t.incognito && !INKOGNITO);   // fästa flikar och inkognitoflikar i vanliga fönster: nej
  function nyGrupp(t) {
    if (!kanGrupperas(t)) return;
    const anv = new Set(grupperIFonstret().map((g) => g.farg));
    const farg = FARG_ORDNING.find((f) => !anv.has(f)) || FARG_ORDNING[defs.length % FARG_ORDNING.length];
    const g = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), namn: '', farg, hopfalld: false };
    sparaDefs([...defs, g], tt('Ny flikgrupp'));
    t.grupp = g.id; egna.add(g.id);
    omrita(); sparaFlikar();
    bytNamn(g.id);
  }
  function laggIGrupp(t, id) {
    const g = def(id); if (!kanGrupperas(t) || !g) return;
    const lista = allaFlikar(); const i = lista.indexOf(t); if (i < 0) return;
    lista.splice(i, 1);
    let sist = -1; lista.forEach((u, j) => { if (gruppAv(u) === g) sist = j; });
    t.grupp = id; egna.add(id);
    lista.splice(sist >= 0 ? sist + 1 : Math.min(i, lista.length), 0, t);
    if (g.hopfalld && t === aktiv()) andraGrupp(id, { hopfalld: false });
    omrita(); sparaFlikar();
  }
  function urGrupp(t) {
    const g = gruppAv(t); if (!g) return;
    const lista = allaFlikar(); const i = lista.indexOf(t);
    let sist = i; lista.forEach((u, j) => { if (gruppAv(u) === g) sist = j; });
    delete t.grupp;
    lista.splice(i, 1); lista.splice(sist, 0, t);   // direkt efter gruppen
    omrita(); sparaFlikar();
  }
  function satHopfalld(id, pa) {
    const g = def(id); if (!g || !!g.hopfalld === !!pa) return;
    const a = aktiv();
    if (pa && a && gruppAv(a) === g) {
      // Den aktiva fliken ligger i gruppen: byt till närmaste flik utanför gruppen (som Chrome), annars en ny flik
      const lista = allaFlikar(); const i = lista.indexOf(a);
      const utanfor = (t) => gruppAv(t) !== g && !t._closing;
      const dit = lista.slice(i + 1).find(utanfor) || lista.slice(0, i).reverse().find(utanfor);
      // Byt flik FÖRST: ritas gruppen hopfälld medan dess flik är aktiv fälls den ut igen (oppnaSnart)
      if (dit) kor('switchTab', dit);
      else { ingenArvning = true; try { kor('createTab', null); } finally { ingenArvning = false; } }
      andraGrupp(id, { hopfalld: true });
      return;
    }
    andraGrupp(id, { hopfalld: !!pa });
  }
  const oppnas = new Set();
  function oppnaSnart(id) {   // den aktiva fliken får aldrig ligga i en hopfälld grupp
    if (oppnas.has(id)) return;
    oppnas.add(id);
    queueMicrotask(() => { oppnas.delete(id); const g = def(id); if (g && g.hopfalld) andraGrupp(id, { hopfalld: false }); });
  }
  function nyFlikIGrupp(id) {
    const g = def(id); if (!g) return;
    if (g.hopfalld) andraGrupp(id, { hopfalld: false });
    ingenArvning = true;
    let t; try { t = kor('createTab', null); } finally { ingenArvning = false; }
    if (t) laggIGrupp(t, id);
  }
  function delaUpp(id) {
    allaFlikar().forEach((t) => { if (t.grupp === id) delete t.grupp; });
    egna.delete(id); rubriker.delete(id);
    sparaDefs(defs.filter((g) => g.id !== id));
    omrita(); sparaFlikar();
  }
  function stangGrupp(id) {
    const g = def(id); if (!g) return;
    allaFlikar().filter((t) => gruppAv(t) === g).forEach((t) => kor('closeTab', t));
  }
  // Grupper vars sista flik stängts eller flyttats städas bort (tyst – en tom grupp finns inte att ångra)
  function stadaTomma() {
    const lista = allaFlikar();
    for (const t of lista) if (t.grupp && (t.pinned || !def(t.grupp))) delete t.grupp;   // gruppen ångrad/återställd, eller fliken fäst
    const anv = new Set(lista.map((t) => t.grupp).filter(Boolean));
    anv.forEach((id) => egna.add(id));
    const tomma = [...egna].filter((id) => !anv.has(id));
    if (!tomma.length) return;
    tomma.forEach((id) => { egna.delete(id); rubriker.delete(id); });
    const kvar = defs.filter((g) => !tomma.includes(g.id));
    if (kvar.length !== defs.length) sparaDefs(kvar);
  }

  /* ── Nytt namn direkt i rubriken ── */
  function bytNamn(id) {
    const g = def(id); if (!g) return;
    if (lage() === 'dolda') zenVisa(true, true);
    if (lage() === 'vertikal' && smal()) { tillfalligtBred = true; tillampa(true); }   // ikonpanelen har ingen plats för ett namn
    if (g.hopfalld) andraGrupp(id, { hopfalld: false }); else omrita();
    const el = rubriker.get(id); if (!el || !el.isConnected) return;
    redigerar = id; el.classList.add('anp-redigerar');
    const namnEl = el.querySelector('.anp-gnamn');
    const inp = document.createElement('input');
    inp.className = 'anp-gin'; inp.type = 'text'; inp.maxLength = 40; inp.spellcheck = false;
    inp.value = g.namn || ''; inp.placeholder = tt('Namn på gruppen'); inp.setAttribute('aria-label', tt('Namn på gruppen'));
    namnEl.hidden = true; el.insertBefore(inp, namnEl);
    let klart = false;
    const avsluta = (spara) => {
      if (klart) return; klart = true;
      const v = inp.value.trim().slice(0, 40);
      inp.remove(); namnEl.hidden = false; el.classList.remove('anp-redigerar'); redigerar = null;
      const gg = def(id);
      if (spara && gg && v !== (gg.namn || '')) andraGrupp(id, { namn: v }, tt('Flikgruppens namn'));
      else kor('renderTabs');
      if (tillfalligtBred) { tillfalligtBred = false; tillampa(); }
      if (lage() === 'dolda') { zenLast = false; if (!stripHover) zenGomSnart(700); }
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); avsluta(true); } else if (e.key === 'Escape') { e.preventDefault(); avsluta(false); }
    });
    inp.addEventListener('blur', () => avsluta(true));
    for (const ev of ['click', 'mousedown', 'dblclick', 'contextmenu']) inp.addEventListener(ev, (e) => e.stopPropagation());
    setTimeout(() => { try { inp.focus(); inp.select(); } catch {} }, 30);
  }

  /* ── Rubriken före gruppens första flik (renderTabs) ── */
  function skapaRubrik(id) {
    const el = document.createElement('div');
    el.className = 'anp-grupp';
    el.dataset.grupp = id;
    el.setAttribute('translate', 'no');   // gruppens namn är ditt eget
    el.setAttribute('role', 'button');
    el.innerHTML = '<span class="anp-gnamn"></span><span class="anp-gantal"></span>';
    el.addEventListener('click', (e) => { if (e.target.closest('input')) return; const g = def(id); if (g) satHopfalld(id, !g.hopfalld); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const g = def(id); if (!g || !bro.gruppMeny) return;
      zenMeny();
      bro.gruppMeny({ id: g.id, namn: g.namn, farg: g.farg, hopfalld: !!g.hopfalld });
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    return el;
  }
  function uppdateraRubrik(el, g) {
    if (el.classList.contains('anp-redigerar')) return;
    const antal = allaFlikar().filter((t) => gruppAv(t) === g && !t._closing).length;
    const namn = g.namn || '';
    const cls = 'anp-grupp anp-g-' + g.farg + (g.hopfalld ? ' hopfalld' : '') + (namn ? '' : ' tom');
    if (el.className !== cls) el.className = cls;
    const n = el.querySelector('.anp-gnamn'); if (n.textContent !== namn) n.textContent = namn;
    n.dataset.tom = tt('Namnlös grupp');   // visas i panelen när gruppen saknar namn (CSS attr())
    const a = el.querySelector('.anp-gantal'); if (a.textContent !== String(antal)) a.textContent = String(antal);
    el.title = (namn || tt('Namnlös grupp')) + ' · ' + (antal === 1 ? tt('1 flik') : antal + ' ' + tt('flikar')) + ' · ' + (g.hopfalld ? tt('klicka för att fälla ut') : tt('klicka för att fälla ihop'));
    el.setAttribute('aria-expanded', g.hopfalld ? 'false' : 'true');
  }
  function rubrik(t) {
    const g = gruppAv(t); if (!g) return null;
    const lista = allaFlikar(); const i = lista.indexOf(t);
    if (i > 0 && gruppAv(lista[i - 1]) === g) return null;   // inte gruppens första flik
    let el = rubriker.get(g.id);
    if (!el) { el = skapaRubrik(g.id); rubriker.set(g.id, el); }
    uppdateraRubrik(el, g);
    return el;
  }
  function klass(t) {
    const akt = t === aktiv();
    if (akt && t.sover) t.sover = false;          // visad flik laddas igen (main.js rehydrate)
    let c = '';
    const g = gruppAv(t);
    if (g) {
      c += ' anp-ig anp-g-' + g.farg;
      if (g.hopfalld) { if (akt) oppnaSnart(g.id); else c += ' anp-dold'; }
    }
    if (t.sover && !akt) c += ' anp-sover';
    return c;
  }

  /* ── Efter varje ritning (renderTabs) ── */
  let fastaJson = '', senastAktiv = null;
  function ritat() {
    const lista = allaFlikar();
    const fasta = lista.filter((t) => t.pinned).map((t) => t.id);   // fästa flikar sover aldrig
    const j = JSON.stringify(fasta);
    if (j !== fastaJson) { fastaJson = j; try { if (bro.fasta) bro.fasta(fasta); } catch {} }
    if (klar) stadaTomma();
    const a = aktiv();
    if (a !== senastAktiv) {
      // Adressfältets förslagslista hör till fliken du lämnade (t.ex. Ctrl+T och sedan Ctrl+W): stäng den. Annars ligger
      // den kvar under den nya flikens sida, och med flikarna på sidan syns dess vänstra kant ovanpå panelen.
      if (senastAktiv) kor('closeSug', false);
      if (lage() === 'vertikal') {   // aktiva fliken synlig i panelen
        const host = $('tabs'); const el = a && host && host.querySelector('[data-tabid="' + a.id + '"]');
        if (el && host.scrollHeight > host.clientHeight) setTimeout(() => { try { el.scrollIntoView({ block: 'nearest' }); } catch {} }, 200);
      }
      if (klar && senastAktiv && lage() === 'dolda') zenBlink();   // dolda flikar: visa raden en stund när fliken byts
      senastAktiv = a;
    }
  }
  // Horisontell rad (layoutTabs): grupprubrikerna tar plats, hopfällda gruppers flikar syns inte
  function layout() {
    const host = $('tabs');
    if (lage() === 'vertikal') {
      if (host) { host.classList.remove('narrow'); host.style.removeProperty('--tab-w'); host.style.maxWidth = ''; }
      return true;
    }
    let px = 0, dolda = 0;
    for (const el of rubriker.values()) if (el.isConnected && el.parentNode === host) px += el.offsetWidth + 4;   // + mellanrummet (TAB_GAP)
    for (const t of allaFlikar()) { const g = gruppAv(t); if (g && g.hopfalld && !t._closing && t !== aktiv()) dolda++; }
    return { px, dolda };
  }

  /* ── Fliklogik ── */
  function nyPlats(t) {
    if (!klar || get('flikar.nyFlik', 'sist') !== 'bredvid') return -1;
    const lista = allaFlikar(), a = aktiv();
    const i = a ? lista.indexOf(a) : -1; if (i < 0) return -1;
    let at = i + 1;
    const fasta = lista.reduce((n, u, j) => (u.pinned ? j + 1 : n), 0);
    if (at < fasta) at = fasta;                                   // aldrig bland de fästa flikarna
    const g = gruppAv(a);
    if (g && !ingenArvning && at === i + 1 && kanGrupperas(t)) t.grupp = g.id;   // öppnad från en flik i en grupp → samma grupp (som Chrome)
    else while (at > 0 && at < lista.length && gruppAv(lista[at]) && gruppAv(lista[at]) === gruppAv(lista[at - 1])) at++;   // inte mitt i en annan grupp
    return at;
  }
  function sistaStangd() {
    if (get('flikar.sistaFlik', 'stang') !== 'ny') return false;
    ingenArvning = true;
    try { kor('createTab', null); } finally { ingenArvning = false; }
    return allaFlikar().length > 0;
  }
  // saveOpenTabs: flikarnas grupp sparas i samma ordning som adresserna (skoll-open-tabs)
  function sparat(keep) {
    if (!klar || INKOGNITO || !Array.isArray(keep)) return;
    try { localStorage.setItem(TILLH_KEY, JSON.stringify(keep.map((t) => { const g = gruppAv(t); return g ? [t.url, g.id] : [t.url]; }))); } catch {}
  }
  function menyInfo(t) {
    // En inkognitoflik i ett vanligt fönster grupperas inte (gruppens namn sparas på disken). Inkognitofönster: bara i minnet.
    if (t && t.incognito && !INKOGNITO) return { grupp: null, grupper: null };
    const g = gruppAv(t);
    return { grupp: g ? g.id : null, grupper: grupperIFonstret().map((x) => ({ id: x.id, namn: x.namn || '', farg: x.farg })) };
  }

  /* ── Placering ── */
  const rot = document.documentElement;
  // Panelen på sidan är lika hög som webbytan: --vflik-top = webbytans överkant, --vflik-bunn = det som ligger under
  // den (0, eller verktygsraden + bokmärkesfältet när raden ligger längst ner, Anpassa › verktyg). true = något ändrades.
  let senastMatt = '';
  function uppdateraMatt() {
    const v = $('views'), tb = $('toolbar');
    let topp = 50, bunn = 0;
    if (v) { const r = v.getBoundingClientRect(); topp = Math.round(r.top); bunn = Math.max(0, Math.round(innerHeight - r.bottom)); }
    const h = tb && tb.offsetHeight ? tb.offsetHeight : 0;
    const nu = topp + '/' + bunn + '/' + h;
    if (nu === senastMatt) return false;
    senastMatt = nu;
    rot.style.setProperty('--vflik-top', topp + 'px');
    rot.style.setProperty('--vflik-bunn', bunn + 'px');
    if (h) rot.style.setProperty('--zen-h', h + 'px');
    return true;
  }
  function efterLayout() {
    requestAnimationFrame(() => {
      uppdateraMatt();
      kor('renderTabs');
      kor('sendBounds');    // webbsidan (egen vy i huvudprocessen) flyttas till #views nya plats
      kor('fitOmni');
    });
  }
  function tillampa(direkt) {
    const b = document.body; if (!b) return;
    const l = lage();
    b.classList.toggle('flik-vertikal', l === 'vertikal');
    b.classList.toggle('flik-dolda', l === 'dolda');
    b.classList.toggle('flik-smal', smal());
    b.classList.toggle('anp-stang-aktiv', get('flikar.stangKnapp', 'alla') === 'aktiv');
    rot.style.setProperty('--vflik-w', (smal() ? BREDD_SMAL : bredd()) + 'px');
    if (l !== 'dolda') zenVisa(false);
    const k = $('anp-vsmal');
    if (k) { const s = smal(); k.title = s ? tt('Visa flikarnas namn') : tt('Visa bara ikoner'); k.querySelector('span').textContent = tt('Visa bara ikoner'); k.setAttribute('aria-pressed', s ? 'true' : 'false'); }
    uppdateraMatt();
    if (direkt) { kor('renderTabs'); kor('sendBounds'); }
    efterLayout();
  }
  function satSmal(pa) { if (A) A.set('flikar.vertikalSmal', !!pa, pa ? tt('Flikpanelen: bara ikoner') : tt('Flikpanelen: med namn')); }

  /* ── Dolda flikar: raden glider fram över verktygsraden ── */
  let zenPa = false, zenLast = false, zenTimer = 0, stripHover = false, menyTid = 0;
  function zenVisa(pa, last) {
    clearTimeout(zenTimer);
    zenPa = !!pa; zenLast = !!(pa && last);
    if (document.body) document.body.classList.toggle('flik-zen-visad', zenPa);
    if (zenPa) kor('layoutTabs');
  }
  function zenGomSnart(ms) { clearTimeout(zenTimer); zenTimer = setTimeout(() => { if (!zenLast && !redigerar && !stripHover) zenVisa(false); }, ms == null ? 450 : ms); }
  function zenBlink() { if (zenPa) return; zenVisa(true); zenGomSnart(1400); }
  function zenMeny() {
    if (lage() !== 'dolda' || !zenPa) return;
    menyTid = Date.now(); zenLast = true; clearTimeout(zenTimer);
    zenTimer = setTimeout(() => { zenLast = false; if (!stripHover && !redigerar) zenVisa(false); }, 4000);
  }

  /* ── Panelens egna delar: "Ny flik"-text, fäll ihop-knapp, draghandtag, överkanten för dolda flikar ── */
  function byggDelar() {
    const strip = $('tabstrip'); if (!strip || $('anp-vfot')) return;
    const nb = $('newtab-btn');
    if (nb && !nb.querySelector('.anp-nyflik-txt')) { const s = document.createElement('span'); s.className = 'anp-nyflik-txt'; s.textContent = 'Ny flik'; nb.appendChild(s); }
    const fot = document.createElement('div'); fot.id = 'anp-vfot';
    fot.innerHTML = '<button id="anp-vsmal" class="anp-vknapp" type="button"><svg viewBox="0 0 24 24" class="ic ic-sm"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path d="m15.5 10-2 2 2 2"/></svg><span>Visa bara ikoner</span></button>';
    strip.appendChild(fot);
    $('anp-vsmal').addEventListener('click', () => satSmal(!smal()));
    // Draghandtaget i panelens högerkant (bredden sparas när du släpper; dubbelklick = standardbredd)
    const drag = document.createElement('div'); drag.id = 'anp-vdrag'; drag.title = 'Dra för att ändra bredden';
    strip.appendChild(drag);
    let start = null, ny = 0, raf = 0;
    drag.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || lage() !== 'vertikal' || smal()) return;
      e.preventDefault();
      try { drag.setPointerCapture(e.pointerId); } catch {}
      start = { x: e.clientX, w: bredd() }; ny = start.w;
      document.body.classList.add('anp-drar');
    });
    drag.addEventListener('pointermove', (e) => {
      if (!start) return;
      ny = Math.round(Math.min(BREDD_MAX, Math.max(BREDD_MIN, start.w + e.clientX - start.x)));
      rot.style.setProperty('--vflik-w', ny + 'px');
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; kor('sendBounds'); });
    });
    const slapp = () => {
      if (!start) return;
      start = null; document.body.classList.remove('anp-drar');
      kor('sendBounds');
      if (ny && ny !== bredd() && A) A.set('flikar.vertikalBredd', ny, tt('Flikpanelens bredd'));
    };
    drag.addEventListener('pointerup', slapp); drag.addEventListener('pointercancel', slapp); drag.addEventListener('lostpointercapture', slapp);
    drag.addEventListener('dblclick', () => { if (A && bredd() !== BREDD_STD) A.set('flikar.vertikalBredd', BREDD_STD, tt('Flikpanelens bredd')); });
    // Överkanten (dolda flikar): musen dit → flikraden glider fram; lämnar du raden glider den undan igen
    const kant = document.createElement('div'); kant.id = 'anp-zenkant'; kant.setAttribute('aria-hidden', 'true');
    document.body.appendChild(kant);
    kant.addEventListener('mouseenter', () => { if (lage() === 'dolda') zenVisa(true); });
    strip.addEventListener('mouseenter', () => { stripHover = true; if (lage() === 'dolda') clearTimeout(zenTimer); });
    strip.addEventListener('mouseleave', () => {
      stripHover = false;
      if (lage() === 'dolda' && zenPa && !redigerar && Date.now() - menyTid > 800) { zenLast = false; zenGomSnart(); }
    });
    // Högerklicksmenyn (flikens eller gruppens) ritas utanför raden: raden står kvar medan den är öppen.
    // Väljer du något döljs raden strax efter (onTabAction/onGruppVal); stängs menyn utan val döljs den efter en stund.
    strip.addEventListener('contextmenu', zenMeny);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && zenPa && !redigerar) zenVisa(false); });
  }

  /* ── Inställningar → Anpassa → Flikar ── */
  function ritaInstallningar() {
    const ruta = $('anp-flikar'); if (!ruta) return;
    const l = lage(), ny = get('flikar.nyFlik', 'sist'), sista = get('flikar.sistaFlik', 'stang'), knapp = get('flikar.stangKnapp', 'alla');
    const sova = Number(get('flikar.sova', 15));
    const seg = (nyckel, val, alt) => '<div class="seg flex-none" role="group">' + alt.map(([v, txt]) =>
      '<button type="button" class="seg-btn' + (String(v) === String(val) ? ' on' : '') + '" data-nyckel="' + nyckel + '" data-varde="' + esc(v) + '" aria-pressed="' + (String(v) === String(val)) + '">' + esc(tt(txt)) + '</button>').join('') + '</div>';
    const rad = (titel, text, kontroll) => '<div class="set-row"><div class="set-txt"><div class="set-title">' + esc(tt(titel)) + '</div><div class="set-desc">' + esc(tt(text)) + '</div></div>' + kontroll + '</div>';
    const placering = { upptill: 'Flikarna ligger i en rad överst.', vertikal: 'Flikarna ligger i en panel till vänster. Dra i panelens kant för att ändra bredden.', dolda: 'Flikraden visas när du för musen till överkanten eller trycker Ctrl+Shift+A.' }[l];
    const grupper = grupperIFonstret();
    const chips = grupper.length
      ? '<div class="anp-gchips" translate="no">' + grupper.map((g) => '<span class="anp-gchip anp-g-' + g.farg + (g.namn ? '' : ' tom') + '" title="' + esc(g.namn || tt('Namnlös grupp')) + '">' + esc(g.namn) + '</span>').join('') + '</div>'
      : '<span class="anp-ingen">' + esc(tt('Inga grupper än')) + '</span>';
    let h = '<h3 class="set-h3">' + esc(tt('Flikar')) + '</h3><p class="set-lead">' + esc(tt('Var flikarna ligger och hur de beter sig.')) + '</p>';
    h += '<div class="anp-fgrupp">';
    h += rad('Placering', placering, seg('flikar.lage', l, [['upptill', 'Upptill'], ['vertikal', 'På sidan'], ['dolda', 'Dolda']]));
    if (l === 'vertikal') h += rad('Bara ikoner', 'Panelen visar bara flikarnas ikoner. Du kan också trycka Ctrl+Shift+A.',
      '<label class="switch"><input type="checkbox" data-nyckel="flikar.vertikalSmal"' + (get('flikar.vertikalSmal', false) === true ? ' checked' : '') + '><span class="track"></span></label>');
    h += '</div><div class="anp-fgrupp">';
    h += rad('Nya flikar', 'Var en ny flik hamnar.', seg('flikar.nyFlik', ny, [['sist', 'Sist'], ['bredvid', 'Bredvid aktuell']]));
    h += rad('När sista fliken stängs', 'Stäng fönstret, eller öppna en ny flik så att fönstret blir kvar.', seg('flikar.sistaFlik', sista, [['stang', 'Stäng fönstret'], ['ny', 'Öppna ny flik']]));
    h += rad('Stängknapp', 'Krysset på flikarna. Mittenklick stänger alltid.', seg('flikar.stangKnapp', knapp, [['alla', 'På alla flikar'], ['aktiv', 'Bara aktiv flik']]));
    h += '</div><div class="anp-fgrupp">';
    h += rad('Sovande flikar', 'Flikar du inte använt på ett tag släpper minnet och laddas om när du klickar på dem. Flikar som spelar ljud och fästa flikar sover aldrig.',
      '<select class="set-select flex-none" data-nyckel="flikar.sova" aria-label="' + esc(tt('Sovande flikar')) + '">' + SOV.map(([v, txt]) => '<option value="' + v + '"' + (v === sova ? ' selected' : '') + '>' + esc(tt(txt)) + '</option>').join('') + '</select>');
    h += rad('Flikgrupper', 'Högerklicka på en flik och välj Lägg i ny grupp. Klicka på gruppens namn för att fälla ihop den.', chips);
    h += '</div>';
    ruta.innerHTML = h;
  }
  const ETIKETT = {
    'flikar.lage': { upptill: 'Flikar: upptill', vertikal: 'Flikar: på sidan', dolda: 'Flikar: dolda' },
    'flikar.nyFlik': { sist: 'Nya flikar: sist', bredvid: 'Nya flikar: bredvid aktuell' },
    'flikar.sistaFlik': { stang: 'Sista fliken: stäng fönstret', ny: 'Sista fliken: öppna ny flik' },
    'flikar.stangKnapp': { alla: 'Stängknapp på alla flikar', aktiv: 'Stängknapp bara på aktiv flik' },
  };
  function satt(nyckel, varde) {
    if (!A || !/^flikar\./.test(nyckel)) return;
    let etikett = (ETIKETT[nyckel] || {})[varde];
    if (nyckel === 'flikar.sova') { const s = SOV.find(([v]) => v === varde); etikett = 'Sovande flikar: ' + (s ? s[1].toLowerCase() : varde); }
    if (nyckel === 'flikar.vertikalSmal') etikett = varde ? 'Flikpanelen: bara ikoner' : 'Flikpanelen: med namn';
    Promise.resolve(A.set(nyckel, varde, tt(etikett || nyckel))).then((r) => { if (r && r.ok === false && r.error === 'barnlast') { try { showToast(tt('Det här går inte att ändra i barnläge.')); } catch {} ritaInstallningar(); } }).catch(() => {});
  }
  function kopplaInstallningar() {
    const ruta = $('anp-flikar'); if (!ruta) return;
    ruta.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-nyckel]'); if (!b) return;
      satt(b.dataset.nyckel, b.dataset.varde);
    });
    ruta.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('select[data-nyckel="flikar.sova"]')) satt('flikar.sova', Number(el.value));
      else if (el.matches('input[data-nyckel="flikar.vertikalSmal"]')) satt('flikar.vertikalSmal', !!el.checked);
    });
    document.addEventListener('anpassa:visa', ritaInstallningar);
  }
  const panelSynlig = () => { const p = $('anp-flikar'); return !!(p && p.offsetParent); };

  /* ── Start ── */
  // Vilken grupp flikarna hade förra gången. Läses NU, innan shell.js återställer flikarna och skriver över nyckeln.
  let sparadTillh = null;
  if (!INKOGNITO) { try { sparadTillh = JSON.parse(localStorage.getItem(TILLH_KEY) || 'null'); } catch {} }

  function init() {
    byggDelar();
    kopplaInstallningar();
    // Dela ut grupperna på de återställda flikarna (samma ordning som de sparades; adressen måste stämma)
    if (Array.isArray(sparadTillh)) {
      const keep = allaFlikar().filter((t) => !t.incognito && !t._closing && t.url);
      let j = 0;
      for (const rad of sparadTillh) {
        if (!Array.isArray(rad) || typeof rad[0] !== 'string') continue;
        let k = j; while (k < keep.length && keep[k].url !== rad[0]) k++;
        if (k >= keep.length) continue;
        if (rad[1] && def(rad[1]) && !keep[k].pinned) keep[k].grupp = rad[1];
        j = k + 1;
      }
    }
    allaFlikar().forEach((t) => { const g = gruppAv(t); if (g) egna.add(g.id); });
    // Grupper utan flikar (från förra gången) städas – bara när det här är enda fönstret, andra fönster kan ha egna grupper
    if (!INKOGNITO) {
      let n = 1; try { n = bro.antalFonster ? bro.antalFonster() : 1; } catch {}
      if (n <= 1) { const kvar = defs.filter((g) => egna.has(g.id)); if (kvar.length !== defs.length) sparaDefs(kvar); }
    }
    klar = true;
    senastAktiv = aktiv();
    ordna(); kor('renderTabs'); sparaFlikar();

    if (A) A.on('flikar.', (k, v) => {
      if (k === 'flikar.grupper') {
        if (!INKOGNITO) {
          const j = JSON.stringify(Array.isArray(v) ? v : []);
          const i = vantande.indexOf(j);
          if (i >= 0) { vantande.splice(0, i + 1); if (vantande.length) return; }   // eko av en egen sparning; en nyare är på väg
          else vantande.length = 0;                                               // ändrat utifrån (annat fönster, ångra, återställ)
          defs = Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && FARGNAMN[x.farg]) : [];
        }
        omrita();
      }
      else tillampa();
      if (panelSynlig()) ritaInstallningar();
    });
    if (window.view && window.view.onTabAction) window.view.onTabAction((a, id) => {
      if (lage() === 'dolda' && zenPa && !redigerar) { zenLast = false; if (!stripHover) zenGomSnart(900); }   // val i flikens meny → raden undan
      if (typeof a !== 'string' || !a.startsWith('grupp')) return;
      const t = flik(id); if (!t) return;
      if (a === 'grupp-ny') nyGrupp(t);
      else if (a === 'grupp-ur') urGrupp(t);
      else if (a.startsWith('grupp-in:')) laggIGrupp(t, a.slice(9));
    });
    if (bro.onGruppVal) bro.onGruppVal((a, id) => {
      const g = def(id); if (!g || typeof a !== 'string') return;
      if (a === 'namn') bytNamn(id);
      else if (a.startsWith('farg:')) { const f = a.slice(5); if (FARGNAMN[f]) andraGrupp(id, { farg: f }, tt('Flikgruppens färg')); }
      else if (a === 'ny-flik') nyFlikIGrupp(id);
      else if (a === 'fall') satHopfalld(id, !g.hopfalld);
      else if (a === 'dela') delaUpp(id);
      else if (a === 'stang') stangGrupp(id);
      if (lage() === 'dolda' && a !== 'namn') { zenLast = false; if (!stripHover) zenGomSnart(900); }
    });
    if (bro.onKortkommando) bro.onKortkommando(() => {
      const l = lage();
      if (l === 'dolda') zenVisa(!zenPa, true);
      else if (l === 'vertikal') satSmal(!smal());
    });
    // Flik som somnat (huvudprocessen släppte minnet): blekare tills den laddas igen
    if (bro.onSover) bro.onSover((id) => { const t = flik(id); if (t && t !== aktiv()) { t.sover = true; kor('renderTabs'); } });
    if (window.view && window.view.onLoading) window.view.onLoading((id, laddar) => { if (!laddar) return; const t = flik(id); if (t && t.sover) { t.sover = false; kor('renderTabs'); } });
    // Panelens över- och underkant följer verktygsraden/bokmärkesfältet; webbvyns mått räknas om när ytan ändras
    try {
      let r = 0;
      const ro = new ResizeObserver(() => {
        uppdateraMatt();
        if (!r) r = requestAnimationFrame(() => { r = 0; if (lage() !== 'upptill') kor('sendBounds'); });
      });
      for (const id of ['views', 'toolbar', 'bmbar']) { const el = $(id); if (el) ro.observe(el); }
      // Verktygsraden längst ner (Anpassa › verktyg växlar anp-vf-nere på <body>): webbytan flyttar utan att byta
      // storlek, så ResizeObserver märker inget. Mät om när <body>s klasser ändras (före nästa ritning, ingen blinkning).
      new MutationObserver(() => { if (uppdateraMatt() && lage() !== 'upptill') kor('sendBounds'); })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch {}
    // Verktygsraden uppe ↔ nere flyttar webbytan utan att storleken ändras (det märker inte ResizeObserver): mät om
    if (A) A.on('verktyg.placering', () => efterLayout());
    // Verktygsraden är titelrad i panel- och dolt läge: dubbelklick på en tom yta maximerar, som på flikraden
    const tb = $('toolbar');
    if (tb) tb.addEventListener('dblclick', (e) => {
      if (lage() === 'upptill' || !(e.target === tb || e.target.classList.contains('omni-center'))) return;
      try { if (window.view && window.view.winToggleMax) window.view.winToggleMax(); } catch {}
    });
    tillampa();
  }

  window.AnpFlikar = { nyPlats, sparat, sistaStangd, layout, rubrik, klass, ritat, menyInfo,
    // för testet och felsökning
    _lage: lage, _grupper: () => defs.slice(), _zen: (pa) => zenVisa(pa, true) };

  tillampa();   // placeringen sätts före första ritningen (ingen blinkning vid start)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else setTimeout(init, 0);
})();
