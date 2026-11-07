// Anpassa › Arbetsytor: namngivna uppsättningar flikar (Skola, Jobb, Spel …) med egen ikon och färg.
//  • Listan (namn, ikon, färg) ligger i Anpassa (arbetsytor.lista) och är gemensam för alla fönster.
//  • Flikarna hör till fönstret: varje fönster har sin aktiva arbetsyta och minns de andras flikar och vilken flik
//    som var vald. Byter du arbetsyta stängs den gamla ytans flikar (de sparas) och den nya ytans flikar läggs
//    vilande – bara den valda fliken laddas, resten när du klickar på dem. Flikar i en yta du inte står i tar inget minne.
//  • Sparas per konto (konto per fönster): ett fönster som startar med ett barnkonto får barnets arbetsytor, aldrig
//    förälderns flikar. Barnspärren gäller i alla ytor (skalets spärrsida och filtret i huvudprocessen, som för vanliga flikar).
//  • Väljaren ligger först i flikraden (i #brandbar, som flikradens bredd redan räknar med).
// Krok: saveOpenTabs() i shell.js anropar window.arbetsytorSparat(). Allt annat sker härifrån, när skalet startat.
(function () {
  const A = window.Anpassa;
  if (!A) return;
  const INKOGNITO = new URLSearchParams(location.search).has('incognito');
  const bro = window.anpassaArbetsytor || {};
  const LS = 'adraze-arbetsytor', SS = 'adraze-arbetsytor-fonster';
  const MAX_FLIKAR = 100, MAX_YTOR = 30;
  const $id = (id) => document.getElementById(id);
  const tx = (x) => (typeof window.t === 'function' ? window.t(x) : x);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const IKONER = {
    hem: ['Hem', '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>'],
    skola: ['Skola', '<path d="M2.5 5.5c2.6-1.4 6-1.4 9.5.7 3.5-2.1 6.9-2.1 9.5-.7v13c-2.6-1.4-6-1.4-9.5.7-3.5-2.1-6.9-2.1-9.5-.7Z"/><path d="M12 6.2v13"/>'],
    jobb: ['Jobb', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>'],
    spel: ['Spel', '<path d="M7 7.5h10a4.5 4.5 0 0 1 4.4 5.6l-.8 3.3a2.3 2.3 0 0 1-4 .9L15 15.5H9l-1.6 1.8a2.3 2.3 0 0 1-4-.9l-.8-3.3A4.5 4.5 0 0 1 7 7.5Z"/><path d="M8.5 10.3v3.4M6.8 12h3.4"/><path d="M15.5 11h.01M17.5 13h.01"/>'],
    kod: ['Kod', '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/>'],
    musik: ['Musik', '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'],
    handla: ['Handla', '<path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'],
    resa: ['Resor', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z"/>'],
    film: ['Film', '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3Z"/>'],
    nyheter: ['Nyheter', '<path d="M4 5h13v14H6a2 2 0 0 1-2-2Z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7.5 9h6M7.5 12.5h6M7.5 16h4"/>'],
    familj: ['Familj', '<circle cx="8.5" cy="7.5" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 19.5a5.5 5.5 0 0 1 11 0"/><path d="M14.5 15.2a4.5 4.5 0 0 1 6.5 4.3"/>'],
    stjarna: ['Favoriter', '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z"/>'],
  };
  const FARGER = [['#0e2a47', 'Marinblå'], ['#ff4b1f', 'Orange'], ['#2f9e67', 'Grön'], ['#1d6fd8', 'Blå'], ['#c98a12', 'Senap'], ['#0f8b8d', 'Petrol'], ['#c2415d', 'Hallon'], ['#5b6575', 'Grå']];
  const STANDARD = [{ id: 'hem', namn: 'Hem', ikon: 'hem', farg: '#0e2a47' }];
  // Ikon efter namnet: "Spel" får handkontrollen, "Jobb" portföljen osv. (ord i namnet, med eller utan å/ä/ö)
  const IKON_ORD = { hem: 'hem', skola: 'skola', plugg: 'skola', laxor: 'skola', studier: 'skola', kurs: 'skola', jobb: 'jobb', arbete: 'jobb', job: 'jobb', work: 'jobb', kontor: 'jobb',
    spel: 'spel', gaming: 'spel', games: 'spel', game: 'spel', kod: 'kod', code: 'kod', dev: 'kod', programmering: 'kod', musik: 'musik', music: 'musik', handla: 'handla', shopping: 'handla',
    resa: 'resa', resor: 'resa', semester: 'resa', film: 'film', serier: 'film', video: 'film', youtube: 'film', nyheter: 'nyheter', news: 'nyheter', familj: 'familj', favoriter: 'stjarna' };
  const ikonFor = (namn) => { for (const o of String(namn || '').toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').split(/[^a-z0-9]+/)) if (IKON_ORD[o]) return IKON_ORD[o]; return null; };
  const svg = (ikon, cls) => '<svg class="' + (cls || 'ws-ikon') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IKONER[ikon] || IKONER.stjarna)[1] + '</svg>';
  const chip = (y, cls) => '<span class="ws-chip' + (cls ? ' ' + cls : '') + '" style="--ws-farg:' + y.farg + '">' + svg(y.ikon) + '</span>';
  const PIL = '<svg class="ws-pil" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const BOCK = '<svg class="ws-bock" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const FLYTTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const PENNA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>';
  const SOPA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

  /* ── Listan ur Anpassa (alltid giltig, minst en arbetsyta) ── */
  function ytor() {
    let l = A.get('arbetsytor.lista'); if (!Array.isArray(l)) l = [];
    const sedda = new Set(), ut = [];
    for (const y of l) {
      if (!y || typeof y !== 'object') continue;
      const id = String(y.id || '').slice(0, 40); if (!id || sedda.has(id)) continue; sedda.add(id);
      ut.push({ id, namn: String(y.namn || '').trim().slice(0, 40) || tx('Arbetsyta'), ikon: IKONER[y.ikon] ? y.ikon : 'stjarna', farg: /^#[0-9a-f]{6}$/i.test(y.farg) ? String(y.farg).toLowerCase() : '#0e2a47' });
      if (ut.length >= MAX_YTOR) break;
    }
    return ut.length ? ut : STANDARD.map((y) => ({ ...y }));
  }
  const anvands = () => ytor().length > 1;

  /* ── Skalets flikar (shell.js laddas efter oss: läs bara när det körts) ── */
  const skalFlikar = () => { try { return Array.isArray(tabs) ? tabs : []; } catch { return []; } };
  const skalAktiv = () => { try { return active; } catch { return null; } };
  const favOk = (f) => (typeof f === 'string' && f.length < 2048 && /^(https?:|data:image\/)/i.test(f) ? f : null);
  const urlOk = (u) => typeof u === 'string' && u.length < 8192 && /^(https?:|adraze:|about:|view-source:https?:)/i.test(u);   // samma som flikUrlOk i main.js
  const sparbar = (t) => t && !t.incognito && !t._closing && !t.isSettings && urlOk(t.url);
  // Den aktiva arbetsytans flikar just nu (samma urval som skalets egen sparning). Står du i Inställningar räknas
  // fliken du var på innan som vald; en ny, tom flik som vald blir -1 (en ny flik igen när du kommer tillbaka).
  let senastVanlig = null;
  function fanga() {
    const keep = skalFlikar().filter(sparbar).slice(0, MAX_FLIKAR), a = skalAktiv();
    let ai = keep.indexOf(a);
    if (ai < 0 && a && a.isSettings && senastVanlig) ai = keep.indexOf(senastVanlig);
    return { flikar: keep.map((t) => ({ url: t.url, titel: String(t.title || '').slice(0, 200), fav: favOk(t.favicon), fast: !!t.pinned })), aktivFlik: ai };
  }

  /* ── Fönstrets läge: aktiv arbetsyta + de andra ytornas flikar ── */
  let st = { aktiv: STANDARD[0].id, ytor: {} };
  function giltigtLage(s) {
    if (!s || typeof s !== 'object' || typeof s.ytor !== 'object' || !s.ytor) return null;
    const ut = { k: typeof s.k === 'string' ? s.k : '', aktiv: String(s.aktiv || ''), ytor: {} };
    for (const [id, y] of Object.entries(s.ytor).slice(0, MAX_YTOR)) {
      if (!y || !Array.isArray(y.flikar)) continue;
      const flikar = y.flikar.filter((f) => f && urlOk(f.url)).slice(0, MAX_FLIKAR).map((f) => ({ url: f.url, titel: String(f.titel || '').slice(0, 200), fav: favOk(f.fav), fast: !!f.fast }));
      const a = Number.isInteger(y.aktivFlik) && y.aktivFlik < flikar.length ? y.aktivFlik : (flikar.length ? 0 : -1);
      ut.ytor[String(id).slice(0, 40)] = { flikar, aktivFlik: a };
    }
    return ut;
  }
  // Kontot i fönstret (samma regel som shell.js: konto per fönster → fönstrets konto, annars det senast inloggade)
  const nyckelAv = (a) => (a && a.token ? 'k:' + (a.email || a.childId || a.name || a.token || 'user') : null);
  function startNyckel() {
    let lokal = null; try { lokal = JSON.parse(localStorage.getItem('skoll-account')); } catch {}
    if (lokal && !lokal.token) lokal = null;
    try {
      const r = window.kontoLage && window.kontoLage.fonster();
      if (r && r.perFonster) {
        let s = null; try { s = JSON.parse(sessionStorage.getItem('adraze-fonster-konto')); } catch {}
        if (s && s.token) return nyckelAv(s);
        const key = r.key || null;
        return nyckelAv(key ? (r.account ? r.account : (lokal && nyckelAv(lokal) === key ? lokal : null)) : null) || 'lokal';
      }
    } catch {}
    return nyckelAv(lokal) || 'lokal';
  }
  function kontoNyckel() { let a; try { a = account; } catch { return startNyckel(); } return nyckelAv(a) || 'lokal'; }
  function lasLokalt(k) { try { const all = JSON.parse(localStorage.getItem(LS) || 'null'); return all && all.konton && all.konton[k] ? giltigtLage(all.konton[k]) : null; } catch { return null; } }

  // Kontots sparade läge (snap = null tar bort det). Högst 12 konton sparas.
  function skrivKonto(k, snap) {
    let all = null; try { all = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
    if (!all || typeof all !== 'object' || !all.konton || typeof all.konton !== 'object') all = { v: 1, konton: {} };
    if (snap) all.konton[k] = snap; else if (all.konton[k]) delete all.konton[k]; else return;
    const konton = Object.keys(all.konton);
    if (konton.length > 12) konton.sort((a, b) => (all.konton[a].ts || 0) - (all.konton[b].ts || 0)).slice(0, konton.length - 12).forEach((x) => delete all.konton[x]);
    try { localStorage.setItem(LS, JSON.stringify(all)); } catch {}
  }
  const bild = () => ({ k: minNyckel, aktiv: st.aktiv, ytor: { ...st.ytor, [st.aktiv]: fanga() }, ts: Date.now() });

  let startat = false, minNyckel = null;   // minNyckel: kontot som fönstrets arbetsytor hör till just nu
  // Bytte fönstret konto (in- eller utloggning)? Då sparas de dolda arbetsytornas flikar på det gamla kontot och det nya
  // kontots hämtas – ett barnkonto får aldrig förälderns dolda flikar. (Flikraden ligger kvar, som vid alla kontobyten.)
  function kollaKonto() {
    if (INKOGNITO || !startat) return;
    const k = kontoNyckel();
    if (!minNyckel) { minNyckel = k; return; }
    if (k === minNyckel) return;
    if (anvands() || Object.keys(st.ytor).length) skrivKonto(minNyckel, bild());
    const s = lasLokalt(k);
    st.ytor = s ? s.ytor : {};
    delete st.ytor[st.aktiv];
    papperskorg = null;
    minNyckel = k;
  }
  function spara() {
    if (INKOGNITO || !startat) return;
    const a = skalAktiv(); if (sparbar(a)) senastVanlig = a; else if (a && !a.isSettings) senastVanlig = null;
    kollaKonto();
    if (!anvands() && !Object.keys(st.ytor).length) {   // bara en arbetsyta: skalets vanliga sparning räcker – städa bort vårt
      try { sessionStorage.removeItem(SS); } catch {}
      skrivKonto(minNyckel, null);
      return;
    }
    const snap = bild();
    try { sessionStorage.setItem(SS, JSON.stringify(snap)); } catch {}
    skrivKonto(minNyckel, snap);
  }
  window.arbetsytorSparat = spara;   // kroken i saveOpenTabs (shell.js)

  // Vid start, INNAN shell.js återställer flikarna: läs fönstrets läge (samma fönster laddat om → sessionStorage,
  // annars kontots senast sparade) och lägg den aktiva ytans flikar där skalets återställning läser dem.
  if (!INKOGNITO && anvands()) {
    const k0 = startNyckel();
    let s = null; try { s = giltigtLage(JSON.parse(sessionStorage.getItem(SS) || 'null')); } catch {}
    if (s && s.k && s.k !== k0) s = null;   // fönstret har bytt konto sedan dess
    if (!s) s = lasLokalt(k0);
    if (s) {
      st = s;
      if (!ytor().some((y) => y.id === st.aktiv)) st.aktiv = ytor()[0].id;
      const egen = st.ytor[st.aktiv];
      if (egen) {
        try {
          localStorage.setItem('skoll-open-tabs', JSON.stringify(egen.flikar.map((f) => f.url)));
          localStorage.setItem('adraze-pinned-tabs', JSON.stringify(egen.flikar.filter((f) => f.fast).map((f) => f.url)));
          localStorage.setItem('adraze-active-tab', String(egen.aktivFlik));
        } catch {}
      }
      delete st.ytor[st.aktiv];   // den aktiva ytans flikar lever i skalets flikrad
    } else st.aktiv = ytor()[0].id;
  } else st.aktiv = ytor()[0].id;

  /* ── Flikar ── */
  // En flik som bara har adress, titel och ikon. Huvudprocessen minns adressen och laddar sidan först när fliken visas.
  // (Samma fält som createTab i shell.js skapar.)
  function vilandeFlik(f) {
    let id; try { id = ++seq; } catch { return null; }
    const tab = { id, url: f.url, title: f.titel || f.url, favicon: f.fav || null, cleared: new Set(), bypassed: new Set(), canBack: false, canForward: false,
      verdict: null, warning: null, toastDismissed: new Set(), entering: false, incognito: false, overlay: null, pinned: !!f.fast };
    skalFlikar().push(tab);
    try { if (bro.vilande) bro.vilande(id, f.url); } catch {}
    return tab;
  }
  // Byt arbetsyta i det här fönstret. opt.behallInst: stå kvar i inställningarna (fliken följer med).
  function vaxla(id, opt = {}) {
    if (INKOGNITO || !startat || typeof switchTab !== 'function' || typeof createTab !== 'function') return false;
    kollaKonto();
    const lista = opt.lista || ytor();
    if (!lista.some((y) => y.id === id) || id === st.aktiv) return false;
    const T = skalFlikar();
    st.ytor[st.aktiv] = fanga();
    const foljer = T.filter((t) => t.isSettings || t.incognito);   // inställningsfliken och inkognitoflikar följer med
    for (const t of T.slice()) if (!foljer.includes(t)) { try { window.view.destroy(t.id); } catch {} }
    T.splice(0, T.length, ...foljer);
    st.aktiv = id;
    const sparat = st.ytor[id]; delete st.ytor[id];
    let mal = null;
    if (sparat) sparat.flikar.forEach((f, i) => { const t = vilandeFlik(f); if (t && i === sparat.aktivFlik) mal = t; });
    const inst = foljer.find((t) => t.isSettings);
    if (opt.behallInst && inst) switchTab(inst);
    else if (mal) switchTab(mal);
    else if (sparat && sparat.flikar.length && sparat.aktivFlik >= 0) switchTab(T.find((t) => !t.isSettings && !t.incognito));
    else createTab(null);   // tom arbetsyta, eller startsidan var vald: en ny flik
    spara(); ritaVaxlare(); if (instSynlig()) ritaInst();
    return true;
  }
  // Flytta en flik till en annan arbetsyta (den blir vald där)
  function flytta(tab, id) {
    const T = skalFlikar(); const i = T.indexOf(tab);
    if (!startat || i < 0 || !sparbar(tab) || id === st.aktiv || !ytor().some((y) => y.id === id)) return false;
    kollaKonto();
    const mal = st.ytor[id] || (st.ytor[id] = { flikar: [], aktivFlik: -1 });
    mal.flikar.push({ url: tab.url, titel: String(tab.title || '').slice(0, 200), fav: favOk(tab.favicon), fast: !!tab.pinned });
    if (mal.flikar.length > MAX_FLIKAR) mal.flikar.splice(0, mal.flikar.length - MAX_FLIKAR);
    mal.aktivFlik = mal.flikar.length - 1;
    try { window.view.destroy(tab.id); } catch {}
    T.splice(i, 1);
    if (!T.length) createTab(null);
    else if (skalAktiv() === tab) switchTab(T[Math.max(0, i - 1)]);
    else renderTabs();
    spara(); ritaVaxlare();
    const y = ytor().find((x) => x.id === id);
    try { if (typeof showToast === 'function') showToast(tx('Fliken flyttades till') + ' ' + (y ? y.namn : '')); } catch {}
    return true;
  }
  // Listan ändrades (här, i ett annat fönster, ångrad eller återställd): ingen flik får försvinna.
  // Försvann den aktiva ytan blir den första aktiv; försvunna ytors flikar läggs in i den aktiva.
  let papperskorg = null;   // senast borttagna arbetsytans flikar: ångrar du borttagningen kommer de tillbaka
  function synka() {
    if (INKOGNITO || !startat) return;
    const lista = ytor(), ids = new Set(lista.map((y) => y.id));
    let andrat = false;
    const pk = papperskorg;
    if (pk && ids.has(pk.id) && pk.id !== st.aktiv && !st.ytor[pk.id]) { st.ytor[pk.id] = pk.data; papperskorg = null; andrat = true; }
    if (!ids.has(st.aktiv)) {
      st.aktiv = lista[0].id; andrat = true;
      const sparat = st.ytor[st.aktiv]; delete st.ytor[st.aktiv];
      if (sparat) sparat.flikar.forEach(vilandeFlik);
    }
    for (const id of Object.keys(st.ytor)) {
      if (ids.has(id)) continue;
      st.ytor[id].flikar.forEach(vilandeFlik); delete st.ytor[id]; andrat = true;
    }
    if (andrat) { try { renderTabs(); } catch {} spara(); }
  }

  /* ── Ny / ändra / ta bort ── */
  const nyttId = () => 'y' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function forslag(lista) {
    const ikoner = Object.keys(IKONER).filter((k) => k !== 'hem'), anv = new Set(lista.map((y) => y.ikon)), fanv = new Set(lista.map((y) => y.farg));
    return { ikon: ikoner.find((k) => !anv.has(k)) || 'stjarna', farg: (FARGER.find(([f]) => !fanv.has(f)) || FARGER[1])[0] };
  }
  async function skapa(namn, ikon, farg) {
    const lista = ytor(); if (lista.length >= MAX_YTOR) return null;
    const f = forslag(lista);
    const y = { id: nyttId(), namn: String(namn || '').trim().slice(0, 40) || tx('Arbetsyta') + ' ' + (lista.length + 1), ikon: IKONER[ikon] ? ikon : (ikonFor(namn) || f.ikon), farg: /^#[0-9a-f]{6}$/i.test(farg || '') ? farg : f.farg };
    const ny = lista.concat([y]);
    const r = await A.set('arbetsytor.lista', ny, tx('Arbetsytor'));
    return r && r.ok ? { y, lista: ny } : null;
  }
  async function andra(id, del) {
    const lista = ytor().map((y) => (y.id === id ? { ...y, ...del } : y));
    return A.set('arbetsytor.lista', lista, tx('Arbetsytor'));
  }
  async function taBort(id) {
    const lista = ytor(); if (lista.length < 2 || !lista.some((y) => y.id === id)) return false;
    const kvar = lista.filter((y) => y.id !== id);
    if (id === st.aktiv) vaxla(kvar[0].id, { lista, behallInst: instSynlig() });
    if (st.ytor[id]) papperskorg = { id, data: st.ytor[id] };
    delete st.ytor[id];   // flikarna i den stängs (de sparas tills vidare i papperskorgen, om du ångrar)
    const r = await A.set('arbetsytor.lista', kvar, tx('Arbetsytor'));
    spara(); ritaVaxlare(); if (instSynlig()) ritaInst();
    return !!(r && r.ok);
  }
  // Den öppna ytan: flikarna i flikraden (även nya, tomma flikar). De andra: det som är sparat.
  const antalFlikar = (id) => (id === st.aktiv ? skalFlikar().filter((t) => !t.isSettings && !t.incognito && !t._closing).length : ((st.ytor[id] && st.ytor[id].flikar.length) || 0));
  const flikText = (n) => (n === 0 ? tx('Inga flikar') : n === 1 ? tx('1 flik') : n + ' ' + tx('flikar'));

  /* ── Väljaren i flikraden ── */
  function ritaVaxlare() {
    if (INKOGNITO || !startat) return;
    try { if (bro.aktiv) bro.aktiv(st.aktiv); } catch {}   // huvudmenyns bock
    const host = $id('brandbar'); if (!host) return;
    let b = $id('ws-vaxlare');
    const lista = ytor(), visa = A.get('arbetsytor.vaxlare') !== false && lista.length > 1;
    if (!visa) { if (b) b.remove(); host.classList.add('hidden'); stangMeny(); try { layoutTabs(); } catch {} return; }
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.id = 'ws-vaxlare'; b.className = 'ws-vaxlare';
      b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', (e) => { e.stopPropagation(); if ($id('ws-meny')) stangMeny(); else oppnaMeny(); });
      host.appendChild(b);
    }
    const y = lista.find((x) => x.id === st.aktiv) || lista[0];
    b.innerHTML = chip(y) + '<span class="ws-namn" translate="no">' + esc(y.namn) + '</span>' + PIL;
    b.title = tx('Arbetsyta') + ': ' + y.namn;
    b.setAttribute('aria-label', tx('Arbetsyta') + ': ' + y.namn + '. ' + tx('Byt arbetsyta'));
    host.classList.remove('hidden');
    try { layoutTabs(); } catch {}
  }

  /* ── Menyn: byt, flytta fliken hit, ny, hantera ── */
  function stangMeny(behallVy) {
    const m = $id('ws-meny'); if (!m) return;
    m.remove();
    const b = $id('ws-vaxlare'); if (b) b.setAttribute('aria-expanded', 'false');
    if (!behallVy) { try { const a = skalAktiv(); if (a && !a.overlay) showActiveTab(); } catch {} }
  }
  function oppnaMeny() {
    const b = $id('ws-vaxlare'); if (!b) return;
    stangMeny(true); kollaKonto();
    const lista = ytor(), akt = skalAktiv(), kanFlytta = sparbar(akt);
    const m = document.createElement('div'); m.id = 'ws-meny'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', tx('Arbetsytor'));
    m.innerHTML = '<div class="ws-meny-rubrik">' + esc(tx('Arbetsytor')) + '</div>' +
      lista.map((y) => {
        const on = y.id === st.aktiv;
        return '<div class="ws-rad-wrap' + (on ? ' on' : '') + '"><button type="button" class="ws-rad" role="menuitemradio" aria-checked="' + on + '" data-id="' + esc(y.id) + '">' + chip(y) +
          '<span class="ws-rad-namn" translate="no">' + esc(y.namn) + '</span><span class="ws-rad-antal">' + esc(flikText(antalFlikar(y.id))) + '</span>' + (on ? BOCK : '') + '</button>' +
          (!on && kanFlytta ? '<button type="button" class="ws-flytta" data-flytta="' + esc(y.id) + '" title="' + esc(tx('Flytta fliken hit')) + '" aria-label="' + esc(tx('Flytta fliken till') + ' ' + y.namn) + '">' + FLYTTA + '</button>' : '') + '</div>';
      }).join('') +
      '<div class="ws-sep"></div>' +
      '<button type="button" class="ws-rad ws-ny" role="menuitem"><span class="ws-plus" aria-hidden="true">+</span><span class="ws-rad-namn">' + esc(tx('Ny arbetsyta')) + '</span></button>' +
      '<form class="ws-ny-form" hidden><input type="text" maxlength="40" placeholder="' + esc(tx('Namn, t.ex. Skola')) + '" aria-label="' + esc(tx('Namn på arbetsytan')) + '"><button type="submit" class="ws-ny-ok">' + esc(tx('Skapa')) + '</button></form>' +
      '<button type="button" class="ws-rad ws-hantera" role="menuitem"><span class="ws-plus" aria-hidden="true">' + PENNA + '</span><span class="ws-rad-namn">' + esc(tx('Hantera arbetsytor')) + '</span></button>';
    document.body.appendChild(m);
    const r = b.getBoundingClientRect();
    m.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))) + 'px';
    m.style.top = Math.round(r.bottom + 6) + 'px';
    b.setAttribute('aria-expanded', 'true');
    try { window.view.hide(); } catch {}   // webbsidan ritas ovanpå skalet – göm den medan menyn är öppen (som adressfältets förslag)
    m.addEventListener('click', async (e) => {
      const fl = e.target.closest('[data-flytta]');
      if (fl) { const a = skalAktiv(); stangMeny(); flytta(a, fl.dataset.flytta); return; }
      const rad = e.target.closest('.ws-rad[data-id]');
      if (rad) { const id = rad.dataset.id; stangMeny(id !== st.aktiv); vaxla(id); return; }
      if (e.target.closest('.ws-ny')) { m.querySelector('.ws-ny').hidden = true; const f = m.querySelector('.ws-ny-form'); f.hidden = false; f.querySelector('input').focus(); return; }
      if (e.target.closest('.ws-hantera')) { stangMeny(true); hantera(); }
    });
    m.querySelector('.ws-ny-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const namn = e.target.querySelector('input').value;
      const r2 = await skapa(namn);
      stangMeny(!!r2);
      if (r2) vaxla(r2.y.id, { lista: r2.lista });
    });
    m.addEventListener('keydown', (e) => {
      const knappar = [...m.querySelectorAll('.ws-rad:not([hidden])')];
      const i = knappar.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); stangMeny(); b.focus(); }
      else if (e.key === 'ArrowDown' && e.target.tagName !== 'INPUT') { e.preventDefault(); (knappar[i + 1] || knappar[0]).focus(); }
      else if (e.key === 'ArrowUp' && e.target.tagName !== 'INPUT') { e.preventDefault(); (knappar[i - 1] || knappar[knappar.length - 1]).focus(); }
    });
    (m.querySelector('.ws-rad-wrap.on .ws-rad') || m.querySelector('.ws-rad')).focus();
  }
  document.addEventListener('pointerdown', (e) => { if ($id('ws-meny') && !e.target.closest('#ws-meny, #ws-vaxlare')) stangMeny(); }, true);
  window.addEventListener('resize', () => stangMeny());
  window.addEventListener('blur', () => { if ($id('ws-meny') && !document.hasFocus()) stangMeny(); });
  function hantera() {
    try { openSettings(); showSettingsCat('anpassa'); } catch { return; }
    setTimeout(() => { const s = $id('anp-arbetsytor'); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }

  /* ── Inställningar › Anpassa › Arbetsytor ── */
  const instSynlig = () => { const s = $id('settings'), p = document.querySelector('#settings .set-panel[data-cat="anpassa"]'); return !!(s && p && !s.classList.contains('hidden') && !p.classList.contains('hidden')); };
  let redigerar = null, tarBort = null;   // id som redigeras ('ny' = ny arbetsyta) / id som väntar på bekräftelse
  function redigerare(y) {
    return '<div class="ws-red" data-red="' + esc(y.id || 'ny') + '">' +
      '<label class="ws-falt"><span>' + esc(tx('Namn')) + '</span><input type="text" class="ws-red-namn" maxlength="40" value="' + esc(y.namn || '') + '" placeholder="' + esc(tx('t.ex. Skola')) + '" translate="no"></label>' +
      '<div class="ws-val"><span class="ws-val-rubrik">' + esc(tx('Ikon')) + '</span><div class="ws-ikoner" role="radiogroup" aria-label="' + esc(tx('Ikon')) + '">' +
        Object.entries(IKONER).map(([k, [namn]]) => '<button type="button" class="ws-ikonval" role="radio" aria-checked="' + (k === y.ikon) + '" data-ikon="' + k + '" title="' + esc(tx(namn)) + '" aria-label="' + esc(tx(namn)) + '">' + svg(k) + '</button>').join('') + '</div></div>' +
      '<div class="ws-val"><span class="ws-val-rubrik">' + esc(tx('Färg')) + '</span><div class="ws-farger" role="radiogroup" aria-label="' + esc(tx('Färg')) + '">' +
        FARGER.map(([f, namn]) => '<button type="button" class="ws-fargval" role="radio" aria-checked="' + (f === y.farg) + '" data-farg="' + f + '" style="--ws-farg:' + f + '" title="' + esc(tx(namn)) + '" aria-label="' + esc(tx(namn)) + '"></button>').join('') + '</div></div>' +
      '<div class="ws-red-knappar"><button type="button" class="set-btn ws-red-avbryt">' + esc(tx('Avbryt')) + '</button><button type="button" class="set-btn ws-red-spara">' + esc(y.id ? tx('Spara') : tx('Skapa')) + '</button></div></div>';
  }
  function ritaInst() {
    const host = $id('anp-arbetsytor'); if (!host) return;
    if (INKOGNITO) { host.innerHTML = ''; return; }
    kollaKonto();
    const lista = ytor();
    if (redigerar && redigerar !== 'ny' && !lista.some((y) => y.id === redigerar)) redigerar = null;
    const nyY = { id: '', namn: '', ...forslag(lista) };
    host.innerHTML =
      '<h3 class="set-h3">' + esc(tx('Arbetsytor')) + '</h3>' +
      '<p class="set-lead">' + esc(tx('Samla flikar för olika saker, till exempel Skola, Jobb och Spel. Varje arbetsyta minns sina flikar. Flikar i arbetsytor du inte står i laddas inte, så de tar inget minne.')) + '</p>' +
      '<div class="set-row"><div class="set-txt"><div class="set-title">' + esc(tx('Visa väljaren bredvid flikarna')) + '</div><div class="set-desc">' + esc(tx('Syns när du har minst två arbetsytor.')) + '</div></div>' +
        '<label class="switch"><input type="checkbox" id="ws-tgl-vaxlare"' + (A.get('arbetsytor.vaxlare') !== false ? ' checked' : '') + '><span class="track"></span></label></div>' +
      lista.map((y) => {
        const on = y.id === st.aktiv, n = antalFlikar(y.id);
        const desc = flikText(n) + (on ? ' · ' + tx('öppen i det här fönstret') : '');
        let extra = '';
        if (redigerar === y.id) extra = redigerare(y);
        else if (tarBort === y.id) extra = '<div class="ws-bekrafta"><span>' + esc(tx('Ta bort') + ' ' + y.namn + '? ' + (n ? tx('Flikarna i den stängs.') : '')) + '</span><div class="ws-red-knappar"><button type="button" class="set-btn ws-tb-nej">' + esc(tx('Avbryt')) + '</button><button type="button" class="set-btn anp-risk ws-tb-ja">' + esc(tx('Ta bort')) + '</button></div></div>';
        return '<div class="set-row ws-inst-rad' + (on ? ' on' : '') + '" data-id="' + esc(y.id) + '">' + chip(y, 'ws-chip-stor') +
          '<div class="set-txt"><div class="set-title" translate="no">' + esc(y.namn) + '</div><div class="set-desc">' + esc(desc) + '</div></div>' +
          '<div class="ws-inst-knappar">' + (on ? '' : '<button type="button" class="set-btn ws-oppna">' + esc(tx('Öppna')) + '</button>') +
            '<button type="button" class="ws-ikonknapp ws-andra" title="' + esc(tx('Ändra')) + '" aria-label="' + esc(tx('Ändra') + ' ' + y.namn) + '">' + PENNA + '</button>' +
            '<button type="button" class="ws-ikonknapp ws-tabort" title="' + esc(tx('Ta bort')) + '" aria-label="' + esc(tx('Ta bort') + ' ' + y.namn) + '"' + (lista.length < 2 ? ' disabled' : '') + '>' + SOPA + '</button></div>' +
          extra + '</div>';
      }).join('') +
      (redigerar === 'ny'
        ? '<div class="set-row ws-inst-rad ws-inst-ny">' + chip(nyY, 'ws-chip-stor') + '<div class="set-txt"><div class="set-title">' + esc(tx('Ny arbetsyta')) + '</div><div class="set-desc">' + esc(tx('Välj namn, ikon och färg.')) + '</div></div>' + redigerare(nyY) + '</div>'
        : '<div class="set-row ws-inst-lagg"><div class="set-txt"><div class="set-title">' + esc(tx('Ny arbetsyta')) + '</div><div class="set-desc">' + esc(tx('Till exempel Skola, Jobb eller Spel.')) + '</div></div><button type="button" class="set-btn" id="ws-ny">' + esc(tx('Ny arbetsyta')) + '</button></div>');

    $id('ws-tgl-vaxlare').addEventListener('change', (e) => A.set('arbetsytor.vaxlare', !!e.target.checked, tx('Väljaren för arbetsytor')));
    const ny = $id('ws-ny'); if (ny) ny.addEventListener('click', () => { redigerar = 'ny'; tarBort = null; ritaInst(); fokusRed(); });
    host.querySelectorAll('.ws-inst-rad[data-id]').forEach((rad) => {
      const id = rad.dataset.id;
      const q = (s) => rad.querySelector(s);
      if (q('.ws-oppna')) q('.ws-oppna').addEventListener('click', () => vaxla(id));
      q('.ws-andra').addEventListener('click', () => { redigerar = redigerar === id ? null : id; tarBort = null; ritaInst(); fokusRed(); });
      q('.ws-tabort').addEventListener('click', () => { tarBort = tarBort === id ? null : id; redigerar = null; ritaInst(); const n = host.querySelector('.ws-tb-nej'); if (n) n.focus(); });
      if (q('.ws-tb-nej')) q('.ws-tb-nej').addEventListener('click', () => { tarBort = null; ritaInst(); });
      if (q('.ws-tb-ja')) q('.ws-tb-ja').addEventListener('click', async () => { tarBort = null; await taBort(id); ritaInst(); });
    });
    const red = host.querySelector('.ws-red');
    if (red) {
      const rad = red.closest('.set-row');
      const forhand = () => { const c = rad.querySelector('.ws-chip-stor'); const i = red.querySelector('.ws-ikonval[aria-checked="true"]'), f = red.querySelector('.ws-fargval[aria-checked="true"]');
        if (c && i && f) { c.style.setProperty('--ws-farg', f.dataset.farg); c.innerHTML = svg(i.dataset.ikon); } };
      const valjIkon = (ik) => { red.querySelectorAll('.ws-ikonval').forEach((x) => x.setAttribute('aria-checked', String(x === ik))); forhand(); };
      red.addEventListener('click', (e) => {
        const ik = e.target.closest('.ws-ikonval'), fa = e.target.closest('.ws-fargval');
        if (ik) { red.dataset.ikonVald = '1'; valjIkon(ik); }
        if (fa) { red.querySelectorAll('.ws-fargval').forEach((x) => x.setAttribute('aria-checked', String(x === fa))); forhand(); }
      });
      const spara2 = async () => {
        const namn = red.querySelector('.ws-red-namn').value.trim();
        const ikon = (red.querySelector('.ws-ikonval[aria-checked="true"]') || {}).dataset?.ikon;
        const farg = (red.querySelector('.ws-fargval[aria-checked="true"]') || {}).dataset?.farg;
        const vem = red.dataset.red; redigerar = null;
        if (vem === 'ny') await skapa(namn, ikon, farg);
        else await andra(vem, { ...(namn ? { namn: namn.slice(0, 40) } : {}), ...(ikon ? { ikon } : {}), ...(farg ? { farg } : {}) });
        ritaInst(); ritaVaxlare();
      };
      red.querySelector('.ws-red-spara').addEventListener('click', spara2);
      red.querySelector('.ws-red-namn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); spara2(); } else if (e.key === 'Escape') { e.preventDefault(); redigerar = null; ritaInst(); } });
      red.querySelector('.ws-red-avbryt').addEventListener('click', () => { redigerar = null; ritaInst(); });
      // Ny arbetsyta: ikonen följer namnet tills du själv väljer en
      if (red.dataset.red === 'ny') red.querySelector('.ws-red-namn').addEventListener('input', (e) => {
        const k = !red.dataset.ikonVald && ikonFor(e.target.value); const ik = k && red.querySelector('.ws-ikonval[data-ikon="' + k + '"]');
        if (ik) valjIkon(ik);
      });
    }
  }
  function fokusRed() { setTimeout(() => { const i = document.querySelector('#anp-arbetsytor .ws-red-namn'); if (i) { i.focus(); i.select(); } }, 20); }
  document.addEventListener('anpassa:visa', ritaInst);
  A.on('arbetsytor.', () => { synka(); ritaVaxlare(); if (instSynlig()) ritaInst(); });

  // Huvudmenyn (≡) › Arbetsytor
  if (bro.onByt) bro.onByt((v) => {
    if (INKOGNITO || !startat) return;
    if (typeof v === 'string') { stangMeny(); vaxla(v); return; }
    if (v && v.ny) { redigerar = 'ny'; tarBort = null; hantera(); fokusRed(); }
    else if (v && v.hantera) hantera();
  });

  /* ── Start: när shell.js har kört (flikarna är återställda) ── */
  function starta() {
    if (INKOGNITO || startat) return;
    startat = true; minNyckel = kontoNyckel();
    synka(); ritaVaxlare(); spara();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', starta); else setTimeout(starta, 0);
  window.addEventListener('pagehide', () => spara());

  // För andra delar och test
  window.Arbetsytor = {
    lista: ytor, aktiv: () => st.aktiv, vaxla, flytta, skapa, andra, taBort, oppnaMeny, stangMeny, nyckel: kontoNyckel,
    lage: () => JSON.parse(JSON.stringify({ aktiv: st.aktiv, ytor: st.ytor })),
  };
})();
