// Anpassa: startsidan med widgetar (fönstret). Laddas efter anpassa.js och före shell.js.
//
// Startsidan (#newtabpage) ser ut som förut – klocka, hälsning, sökfält, genvägar, bakgrund och statistik – men
// under sökfältet ligger nu ett rutnät med widgetar. I redigeringsläget ("Anpassa" nere till vänster) läggs de till
// från en låda, tas bort, flyttas med dra och släpp (eller piltangenter) och görs små eller breda.
// Layouten sparas i Anpassa ('startsida.layout'), övrigt utseende i 'startsida.*' (registreras i ../anpassa-startsida.js).
// Personligt (anteckningen, väderorten) ligger i localStorage så att det inte följer med i en delningskod.
//
// Skalets funktioner (guardedNavigate, closedTabs, openKrypto …) finns först när shell.js har körts. De används bara
// inifrån funktioner som körs senare och alltid via skal.* (try/catch). Allt som öppnar en sida går via skalets
// vanliga navigering (guardedNavigate), så barnspärren och farokollen gäller precis som i adressfältet.
(function () {
  'use strict';
  const A = window.Anpassa;
  const nt = document.getElementById('newtabpage');
  const klockan = document.getElementById('nt-clock');
  if (!A || !nt || !klockan) return;
  const stat = { vaderAnrop: 0, falkFragor: 0 };   // för testerna

  /* ── Små hjälpare ── */
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Bygger DOM säkert: text sätts alltid som textContent. innerHTML används bara i ikon() med våra egna, fasta SVG-strängar.
  function h(tag, a, ...barn) {
    const el = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const b of barn.flat()) if (b !== null && b !== undefined && b !== false) el.append(b.nodeType ? b : document.createTextNode(String(b)));
    return el;
  }
  let ikonNr = 0;
  function ikon(inre, cls) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'anp-ik' + (cls ? ' ' + cls : ''));
    s.innerHTML = typeof inre === 'function' ? inre('anpm' + (++ikonNr)) : inre;
    return s;
  }
  const lsLas = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSkriv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const rorelse = () => !(document.body.classList.contains('reduce-motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const fyll = (x, v) => String(x).replace(/\{([a-z]\w*)\}/g, (m, n) => (v && v[n] != null ? String(v[n]) : m));
  const tx = (x, v) => (typeof window.t === 'function' ? window.t(x, v) : fyll(x, v));
  const sprak = () => (window.i18n && window.i18n.lang) || 'sv';   // för datum, tid och tal (dagNu nedan är en nyckel och står kvar på sv-SE)
  const fmt = (n) => (Number(n) || 0).toLocaleString(sprak());
  const versal = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const dagNu = () => new Date().toLocaleDateString('sv-SE');   // "2026-11-07", lokal tid

  /* ── Skalet (shell.js) ── */
  const skal = {
    aktiv() { try { return active || null; } catch { return null; } },
    // Vanliga navigeringen: barnspärr (famBlocked), farokoll och adressfältet uppdateras som vanligt
    ga(url) { try { if (active) guardedNavigate(active, url); } catch {} },
    stangda() { try { return Array.isArray(closedTabs) ? closedTabs : []; } catch { return []; } },
    historik() { try { const l = getHistory(); return Array.isArray(l) ? l : []; } catch { return []; } },
    konto() { try { return account || null; } catch { return null; } },
    kontoNyckel() { try { return account ? accountKey(account) : null; } catch { return null; } },
    falk(oppna) { try { openKrypto(oppna); return true; } catch { return false; } },
    toast(m) { try { showToast(m); } catch {} },
  };

  /* ── Ikoner (egna, 24×24, linjer i currentColor) ── */
  const IK = {
    grepp: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6.5" r="1.4"/><circle cx="15" cy="6.5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17.5" r="1.4"/><circle cx="15" cy="17.5" r="1.4"/></g>',
    kryss: '<path d="M7 7l10 10M17 7L7 17"/>',
    bred: '<rect x="3" y="7" width="18" height="10" rx="2.2"/>',
    liten: '<rect x="7" y="7" width="10" height="10" rx="2.2"/>',
    reglage: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    klocka: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    rutor: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    historik: '<use href="#i-history"/>',
    lapp: '<path d="M6.5 3.5H14l4 4v13H6.5z"/><path d="M13.5 3.5V8H18M9.5 12.5h5.5M9.5 16h3.5"/>',
    skold: '<use href="#i-shield-check"/>',
    falk: '<use href="#i-sparkle"/>',
    citat: '<path d="M10 7.5H6.2A1.2 1.2 0 0 0 5 8.7v3.6h4.4c0 2.4-1 3.9-3.2 4.7M19 7.5h-3.8a1.2 1.2 0 0 0-1.2 1.2v3.6h4.4c0 2.4-1 3.9-3.2 4.7"/>',
    pil: '<path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/>',
    angra: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5h10a5 5 0 0 1 0 10H11"/>',
  };
  // Väderikoner. Moln + sol/måne: solen maskas bort där molnet ligger, så ikonen fungerar på alla bakgrunder.
  const MOLN = 'M7 18.5h10.2a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.9 1.2A3.2 3.2 0 0 0 7 18.5Z';
  const MOLN_UPP = 'M7 15h10.2a3.8 3.8 0 0 0 .4-7.6 5.6 5.6 0 0 0-10.9 1.2A3.2 3.2 0 0 0 7 15Z';
  const LITET_MOLN = 'M4.3 20.5h8.4a3.1 3.1 0 0 0 .3-6.2 4.6 4.6 0 0 0-8.9 1A2.6 2.6 0 0 0 4.3 20.5Z';   // molnet i 82 %, nere till vänster
  const bakom = (id, fram) => '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="' + LITET_MOLN + '" fill="#000" stroke="#000" stroke-width="4"/></mask></defs><g mask="url(#' + id + ')">' + fram + '</g><path d="' + LITET_MOLN + '"/>';
  const VIK = {
    sol: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
    mane: '<path d="M13 3.2a6.4 6.4 0 0 0 7.8 7.8A8.6 8.6 0 1 1 13 3.2Z"/>',
    halv: (id) => bakom(id, '<circle cx="14.6" cy="8.8" r="3.5"/><path d="M14.6 2.6v1.4M20.8 8.8h-1.4M10.2 4.4l1 1M19 4.4l-1 1M19 13.2l-1-1"/>'),
    halvNatt: (id) => bakom(id, '<path d="M15.2 3.6a4.4 4.4 0 0 0 5.4 5.4 5.8 5.8 0 1 1-5.4-5.4Z"/>'),
    moln: '<path d="' + MOLN + '"/>',
    dimma: '<path d="M5 7.5h14M3.5 11.5h17M5 15.5h14M7.5 19.5h9"/>',
    dugg: '<path d="' + MOLN_UPP + '"/><path d="M8 18v1.4M12 19.6V21M16 18v1.4"/>',
    regn: '<path d="' + MOLN_UPP + '"/><path d="M8.7 17.6l-1.1 3.2M12.7 17.6l-1.1 3.2M16.7 17.6l-1.1 3.2"/>',
    sno: '<path d="' + MOLN_UPP + '"/><path class="anp-prick" d="M8 18.4v.01M12 18.4v.01M16 18.4v.01M10 21.4v.01M14 21.4v.01"/>',
    aska: '<path d="' + MOLN_UPP + '"/><path d="M12.8 15.4l-2.3 3.5h3l-2.3 3.5"/>',
  };
  // WMO-väderkoder (Open-Meteo) → svensk text + ikon
  const VADERKOD = {
    0: ['Klart', 'sol'], 1: ['Mest klart', 'sol'], 2: ['Halvklart', 'halv'], 3: ['Mulet', 'moln'],
    45: ['Dimma', 'dimma'], 48: ['Frostdimma', 'dimma'],
    51: ['Lätt duggregn', 'dugg'], 53: ['Duggregn', 'dugg'], 55: ['Tätt duggregn', 'dugg'], 56: ['Underkylt duggregn', 'dugg'], 57: ['Underkylt duggregn', 'dugg'],
    61: ['Lätt regn', 'regn'], 63: ['Regn', 'regn'], 65: ['Kraftigt regn', 'regn'], 66: ['Underkylt regn', 'regn'], 67: ['Underkylt regn', 'regn'],
    71: ['Lätt snöfall', 'sno'], 73: ['Snöfall', 'sno'], 75: ['Kraftigt snöfall', 'sno'], 77: ['Snökorn', 'sno'],
    80: ['Regnskurar', 'regn'], 81: ['Regnskurar', 'regn'], 82: ['Kraftiga skurar', 'regn'], 85: ['Snöbyar', 'sno'], 86: ['Kraftiga snöbyar', 'sno'],
    95: ['Åska', 'aska'], 96: ['Åska med hagel', 'aska'], 99: ['Åska med hagel', 'aska'],
  };
  function vaderInfo(kod, dag) {
    const t = VADERKOD[kod] || ['Okänt väder', 'moln'];
    let ik = t[1];
    if (!dag && ik === 'sol') ik = 'mane';
    if (!dag && ik === 'halv') ik = 'halvNatt';
    return [t[0], ik];
  }

  const ORDSPRAK = [
    'Borta bra men hemma bäst.', 'Bättre sent än aldrig.', 'Den som gräver en grop åt andra faller själv däri.', 'Den som spar, han har.',
    'Många bäckar små gör en stor å.', 'Det är ingen ko på isen.', 'Man ska inte sälja skinnet förrän björnen är skjuten.', 'Lagom är bäst.',
    'Bränt barn skyr elden.', 'Alla vägar bär till Rom.', 'Äpplet faller inte långt från trädet.', 'Tala är silver, tiga är guld.',
    'Övning ger färdighet.', 'Rom byggdes inte på en dag.', 'Gräset är alltid grönare på andra sidan.', 'Ju fler kockar, desto sämre soppa.',
    'Ingen rök utan eld.', 'Morgonstund har guld i mund.', 'Lika barn leka bäst.', 'Själv är bäste dräng.', 'Hellre fria än fälla.',
    'Man ska inte döma hunden efter håren.', 'Man ska smida medan järnet är varmt.', 'Det man inte har i huvudet får man ha i benen.',
    'Kärt barn har många namn.', 'Liten tuva stjälper ofta stort lass.', 'Gå inte över ån efter vatten.', 'Skomakare, bliv vid din läst.',
    'Tiden läker alla sår.', 'Bättre en fågel i handen än tio i skogen.', 'Allt är inte guld som glimmar.', 'Små grytor har också öron.',
    'Ingen är profet i sitt eget land.', 'Bättre fly än illa fäkta.', 'Lättare sagt än gjort.', 'Först till kvarn får först mala.',
    'Arga katter får rivet skinn.', 'Ensam är stark.', 'Ingen ros utan törnen.', 'Man lär så länge man lever.',
    'Ropa inte hej förrän du är över bäcken.', 'Den som gapar efter mycket mister ofta hela stycket.', 'När katten är borta dansar råttorna på bordet.',
    'Även en blind höna hittar ett korn ibland.', 'Inget ont som inte har något gott med sig.', 'Delad glädje är dubbel glädje, delad sorg är halv sorg.',
  ];
  const FALK_FORSLAG = ['Hur känner jag igen ett bluffmejl?', 'Hur gör jag ett starkt lösenord?', 'Vad är phishing?'];

  /* ── Värden (kontrolleras alltid: en delningskod kan innehålla vad som helst) ── */
  const KOL = 296, GAP = 16, KORT_MS = 30 * 60 * 1000;
  const STANDARD = [{ w: 'genvagar', s: 'bred' }];
  const BOOL = { sokfalt: true, logga: false, halsning: true, bakgrund: true, statistik: true, tom: false };
  const bool = (n) => { const v = A.get('startsida.' + n); return typeof v === 'boolean' ? v : BOOL[n]; };
  const stil = () => (A.get('startsida.stil') === 'solid' ? 'solid' : 'frostad');
  const klockStil = () => (A.get('startsida.klocka') === 'analog' ? 'analog' : 'digital');
  // Layout som skickats till butiken men inte kommit tillbaka än (så inget hoppar tillbaka under tiden)
  let lokal = null, vantar = 0;
  function layout() {
    if (lokal) return lokal.map((x) => ({ ...x }));
    const v = A.get('startsida.layout');
    if (!Array.isArray(v)) return STANDARD.map((x) => ({ ...x }));
    const sett = new Set(), ut = [];
    for (const x of v) {
      const w = x && typeof x.w === 'string' ? x.w : '';
      if (!TYPER[w] || sett.has(w)) continue;
      sett.add(w); ut.push({ w, s: x.s === 'bred' ? 'bred' : 'liten' });
    }
    return ut;
  }
  function sattLayout(l, etikett) {
    lokal = l.map(({ w, s }) => ({ w, s }));
    vantar++;
    ritaGrid();
    const klart = () => { if (--vantar === 0) { lokal = null; ritaGrid(); } };
    Promise.resolve(A.set('startsida.layout', lokal, etikett)).then((r) => {
      if (r && r.ok === false) skal.toast(r.error === 'barnlast' ? 'Det går inte att ändra i barnläge.' : 'Det gick inte att spara.');
      klart();
    }, klart);
  }

  /* ── Widgetarna ── */
  const TYP_ORDNING = ['klocka', 'vader', 'genvagar', 'stangda', 'anteckning', 'blockerat', 'falk', 'ordsprak'];
  const TYPER = {
    klocka: { namn: 'Klocka', beskr: 'Tiden och datumet, digital eller analog.', ikon: IK.klocka, s: 'liten', bygg: byggKlocka },
    vader: { namn: 'Väder', beskr: 'Vädret där du bor, från Open-Meteo.', ikon: VIK.halv, s: 'liten', bygg: byggVader },
    genvagar: { namn: 'Genvägar', beskr: 'Dina toppsajter, ett klick bort.', ikon: IK.rutor, s: 'bred', naken: true, bygg: byggGenvagar },
    stangda: { namn: 'Senast stängda', beskr: 'Flikar du nyss stängt. Öppna dem igen.', ikon: IK.historik, s: 'liten', bygg: byggStangda },
    anteckning: { namn: 'Anteckning', beskr: 'En lapp som sparas på den här datorn.', ikon: IK.lapp, s: 'liten', bygg: byggAnteckning },
    blockerat: { namn: 'Blockerat', beskr: 'Annonser och spårare som AdRaze stoppat.', ikon: IK.skold, s: 'liten', bygg: byggBlockerat },
    falk: { namn: 'Fråga Falk', beskr: 'Skriv en fråga till Falk, AdRazes AI-assistent.', ikon: IK.falk, s: 'liten', bygg: byggFalk },
    ordsprak: { namn: 'Dagens ordspråk', beskr: 'Ett nytt svenskt ordspråk varje dag.', ikon: IK.citat, s: 'liten', bygg: byggOrdsprak },
  };

  // Klocka: 24 h, digital eller analog (ingen sekundvisare – inget som rör sig i onödan)
  function veckonummer(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const v = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - v);
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  function byggKlocka(kropp) {
    const tid = h('div', { class: 'anp-klocka-tid' }), datum = h('div', { class: 'anp-klocka-datum' }), vecka = h('div', { class: 'anp-klocka-vecka' });
    const ana = document.createElementNS(SVGNS, 'svg');
    ana.setAttribute('viewBox', '0 0 100 100'); ana.setAttribute('class', 'anp-klocka-analog'); ana.setAttribute('aria-hidden', 'true');
    let streck = '';
    for (let k = 0; k < 12; k++) streck += '<line x1="50" y1="7.5" x2="50" y2="' + (k % 3 ? 12 : 15.5) + '" transform="rotate(' + k * 30 + ' 50 50)"' + (k % 3 ? '' : ' class="stor"') + '/>';
    ana.innerHTML = '<circle class="ansikte" cx="50" cy="50" r="46"/><g class="streck">' + streck + '</g><line class="tim" x1="50" y1="50" x2="50" y2="28"/><line class="min" x1="50" y1="50" x2="50" y2="14"/><circle class="mitt" cx="50" cy="50" r="3.4"/>';
    const tim = ana.querySelector('.tim'), min = ana.querySelector('.min');
    const box = h('div', { class: 'anp-klocka' }, tid, ana, h('div', { class: 'anp-klocka-text' }, datum, vecka));
    const val = segKnappar([['digital', 'Digital'], ['analog', 'Analog']], klockStil(), (v) => A.set('startsida.klocka', v, 'Klockans utseende'));
    kropp.append(box, h('div', { class: 'anp-w-redval' }, val.el));
    function rita() {
      const nu = new Date(), m = nu.getMinutes();
      box.classList.toggle('analog', klockStil() === 'analog'); val.satt(klockStil());
      tid.textContent = nu.toLocaleTimeString(sprak(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      datum.textContent = versal(nu.toLocaleDateString(sprak(), { weekday: 'long', day: 'numeric', month: 'long' }));
      vecka.textContent = tx('Vecka {n}', { n: veckonummer(nu) });
      min.setAttribute('transform', 'rotate(' + m * 6 + ' 50 50)');
      tim.setAttribute('transform', 'rotate(' + ((nu.getHours() % 12) * 30 + m * 0.5) + ' 50 50)');
    }
    rita();
    return { tick: rita, visas: rita, andrat: rita };
  }

  // Väder: ort väljs med sök (ingen platsåtkomst). Cachas 30 min här och i huvudprocessen; hämtas bara när widgeten syns.
  const ORT_LS = 'adraze-startsida-ort', VADER_LS = 'adraze-startsida-vader';
  function vaderOrt() {
    const o = lsLas(ORT_LS);
    return o && typeof o.namn === 'string' && Number.isFinite(o.lat) && Number.isFinite(o.lon) ? o : null;
  }
  const ortNyckel = (o) => o.lat.toFixed(2) + ',' + o.lon.toFixed(2);
  function vaderCache(o) {
    const c = lsLas(VADER_LS);
    return c && c.nyckel === ortNyckel(o) && c.data && typeof c.ts === 'number' && Array.isArray(c.data.dagar) ? c : null;
  }
  const grader = (t) => { if (typeof t !== 'number' || !Number.isFinite(t)) return '–'; const r = Math.round(t); return (r < 0 ? '−' + Math.abs(r) : String(r)) + '°'; };
  function byggVader(kropp, inst) {
    let sokar = false, sokNr = 0, sokTimer = null, hamtar = false, fel = false;
    function rita() {
      const o = vaderOrt();
      kropp.textContent = '';
      if (!o || sokar) { ritaSok(o); return; }
      const c = vaderCache(o);
      if (c) { ritaData(o, c.data); return; }
      kropp.append(h('div', { class: 'anp-w-rubrik', translate: 'no', text: o.namn }));
      if (fel) {
        kropp.append(h('div', { class: 'anp-tomt', text: 'Kunde inte hämta vädret just nu.' }),
          h('div', { class: 'anp-rad-knappar' }, h('button', { type: 'button', class: 'anp-lank', text: 'Försök igen', onclick: () => { fel = false; rita(); hamta(true); } }),
            h('button', { type: 'button', class: 'anp-lank', text: 'Byt ort', onclick: () => { sokar = true; rita(); } })));
      } else kropp.append(h('div', { class: 'anp-tomt', text: 'Hämtar vädret …' }));
    }
    function ritaData(o, d) {
      const [txt, ik] = vaderInfo(d.kod, d.dag);
      const nu = h('div', { class: 'anp-vader-nu' },
        h('div', { class: 'anp-vader-topp' },
          h('span', { class: 'anp-vader-ikon' }, ikon(VIK[ik])),
          h('div', { class: 'anp-vader-temp', text: grader(d.temp) }),
          h('div', { class: 'anp-vader-info' },
            h('button', { type: 'button', class: 'anp-vader-ort', title: 'Byt ort', onclick: () => { sokar = true; rita(); } }, h('span', { translate: 'no', text: o.namn })),
            h('div', { class: 'anp-vader-txt', text: txt }))),
        h('div', { class: 'anp-vader-extra', text: tx('Känns som {t}', { t: grader(d.kanns) }) + (typeof d.vind === 'number' ? ' · ' + tx('Vind {v} m/s', { v: Math.round(d.vind) }) : '') }));
      const dagar = h('div', { class: 'anp-vader-dagar' });
      for (const x of d.dagar.slice(1, inst.s === 'bred' ? 6 : 4)) {
        const dag = new Date(x.datum + 'T12:00:00').toLocaleDateString(sprak(), { weekday: 'short' }).replace('.', '');
        dagar.append(h('div', { class: 'anp-vader-dag', title: vaderInfo(x.kod, true)[0] },
          h('span', { class: 'd', text: versal(dag) }), ikon(VIK[vaderInfo(x.kod, true)[1]]),
          h('span', { class: 't' }, h('b', { text: grader(x.max) }), ' ', h('span', { text: grader(x.min) }))));
      }
      kropp.append(h('div', { class: 'anp-vader' }, nu, dagar),
        h('div', { class: 'anp-w-redval' }, h('button', { type: 'button', class: 'anp-red-knapp', text: 'Byt ort', onclick: () => { sokar = true; rita(); } })));
    }
    function ritaSok(o) {
      const inp = h('input', { class: 'anp-falt', type: 'text', placeholder: 'Sök ort, t.ex. Umeå', maxlength: 80, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Sök ort för vädret' });
      const lista = h('div', { class: 'anp-vader-traffar', role: 'listbox', 'aria-label': 'Orter' });
      kropp.append(
        h('div', { class: 'anp-w-rubrik-rad' }, h('div', { class: 'anp-w-rubrik', text: o ? 'Byt ort' : 'Väder' }),
          o ? h('button', { type: 'button', class: 'anp-lank', text: 'Avbryt', onclick: () => { sokar = false; rita(); } }) : null),
        o ? null : h('div', { class: 'anp-vader-hjalp', text: 'Skriv din ort så visas vädret här.' }),
        inp, lista);
      inp.addEventListener('input', () => { clearTimeout(sokTimer); sokTimer = setTimeout(() => sok(inp.value, lista), 280); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const f = lista.querySelector('button'); if (f) f.click(); else sok(inp.value, lista); }
        else if (e.key === 'Escape' && o) { e.preventDefault(); sokar = false; rita(); }
        else if (e.key === 'ArrowDown') { const f = lista.querySelector('button'); if (f) { e.preventDefault(); f.focus(); } }
      });
      lista.addEventListener('keydown', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (e.key === 'ArrowDown' && b.nextElementSibling) { e.preventDefault(); b.nextElementSibling.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (b.previousElementSibling || inp).focus(); }
      });
      if (sokar) setTimeout(() => { try { inp.focus(); } catch {} }, 0);
    }
    async function sok(q, lista) {
      q = String(q || '').trim(); const nr = ++sokNr;
      lista.textContent = '';
      if (q.length < 2) return;
      lista.append(h('div', { class: 'anp-vader-hjalp', text: 'Söker …' }));
      let r = null; try { r = await window.anpassaStartsida.ortSok(q); } catch {}
      if (nr !== sokNr) return;
      lista.textContent = '';
      if (!Array.isArray(r)) { lista.append(h('div', { class: 'anp-vader-hjalp', text: 'Kunde inte söka just nu.' })); return; }
      if (!r.length) { lista.append(h('div', { class: 'anp-vader-hjalp', text: 'Hittade ingen ort med det namnet.' })); return; }
      for (const x of r) {
        lista.append(h('button', { type: 'button', class: 'anp-vader-traff', role: 'option', onclick: () => valjOrt(x) },
          h('b', { translate: 'no', text: x.namn }), h('span', { translate: 'no', text: [x.region, x.land].filter(Boolean).join(', ') })));
      }
    }
    function valjOrt(x) {
      const lat = Number(x.lat), lon = Number(x.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      lsSkriv(ORT_LS, { namn: String(x.namn || '').slice(0, 80), region: String(x.region || '').slice(0, 80), land: String(x.land || '').slice(0, 60), lat, lon });
      sokar = false; fel = false; rita(); hamta(false);
    }
    async function hamta(tvinga) {
      const o = vaderOrt(); if (!o || hamtar || !window.anpassaStartsida) return;
      const c = vaderCache(o);
      if (!tvinga && c && Date.now() - c.ts < KORT_MS) return;   // färskt nog: inget nätanrop
      hamtar = true; stat.vaderAnrop++;
      let r = null; try { r = await window.anpassaStartsida.vader(o.lat, o.lon); } catch {}
      hamtar = false;
      const nu = vaderOrt(); if (!nu || ortNyckel(nu) !== ortNyckel(o)) return;   // orten byttes under tiden
      if (r && r.ok && r.data && Array.isArray(r.data.dagar)) { lsSkriv(VADER_LS, { nyckel: ortNyckel(o), ts: Number(r.ts) || Date.now(), data: r.data }); fel = false; }
      else if (!c) fel = true;   // gammal data finns → visa den hellre än ett fel
      if (!sokar) rita();
    }
    rita();
    // Utan ort står sökrutan redan där – rita inte om den (då försvinner det du håller på att skriva)
    const ritaOmData = () => { if (!sokar && vaderOrt()) rita(); };
    return {
      visas() { ritaOmData(); hamta(false); },
      tick() { hamta(false); },
      storlek: ritaOmData,
      lagring(k) { if ((k === ORT_LS || k === VADER_LS) && !sokar) rita(); },
    };
  }

  // Genvägar: skalets egna toppsajter (#shortcuts) flyttas in i widgeten – samma ruta, samma knappar som förut
  const forvar = h('div', { id: 'anp-st-forvar', hidden: true });
  function byggGenvagar(kropp) {
    const sc = document.getElementById('shortcuts');
    if (sc) kropp.append(sc);
    return { bort() { if (sc) forvar.append(sc); } };
  }

  // Senast stängda: skalets egen lista (Ctrl+Shift+T). Öppnas i den här fliken via vanliga navigeringen.
  function byggStangda(kropp, inst) {
    const lista = h('div', { class: 'anp-stangda' });
    kropp.append(h('div', { class: 'anp-w-rubrik', text: 'Senast stängda' }), lista);
    let ritad = '';
    const signatur = () => { const l = skal.stangda(); return l.length + '|' + (l.length ? l[l.length - 1].url : ''); };
    function rita() {
      lista.textContent = '';
      ritad = signatur();
      const urval = skal.stangda().slice(-4).reverse();
      if (!urval.length) { lista.append(h('div', { class: 'anp-tomt', text: 'Flikar du stänger visas här, så kan du öppna dem igen.' })); return; }
      const hist = new Map(skal.historik().map((e) => [e && e.url, e]));
      for (const c of urval) {
        if (!c || typeof c.url !== 'string') continue;
        const e = hist.get(c.url) || {};
        let vard = ''; try { vard = new URL(c.url).hostname.replace(/^www\./, ''); } catch {}
        const titel = typeof e.title === 'string' && e.title && e.title !== c.url ? e.title : (vard || c.url);
        // Ikonen: historikens favicon, annars DuckDuckGos. Går ingen att ladda byter skalet till jordgloben (data-glob).
        const ddg = vard ? 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(vard) + '.ico' : '';
        const egen = typeof e.favicon === 'string' && /^https:\/\//i.test(e.favicon) ? e.favicon : '';
        const fav = egen || ddg ? h('img', { class: 'anp-fav', alt: '', src: egen || ddg, 'data-fb': egen && ddg ? ddg : '', 'data-glob': 'sm' }) : ikon('<use href="#i-fav"/>', 'anp-fav');
        lista.append(h('button', { type: 'button', class: 'anp-stangd', title: c.url, onclick: () => oppnaStangd(c) },
          fav, h('span', { class: 'anp-stangd-titel', translate: 'no', text: titel }), inst.s === 'bred' && vard ? h('span', { class: 'anp-stangd-vard', text: vard }) : null));
      }
    }
    // flikar(): flikraden ändrades (en flik stängdes eller öppnades igen) → rita om bara om listan ändrats
    return { visas: rita, storlek: rita, flikar() { if (signatur() !== ritad) rita(); } };
  }
  function oppnaStangd(c) {
    const flik = skal.aktiv();
    skal.ga(c.url);
    // Ur listan bara om sidan faktiskt öppnades (inte spärrad av barnläget eller stoppad av farokollen)
    if (flik && flik.url) { try { const l = closedTabs; const k = l.lastIndexOf(c); if (k >= 0) l.splice(k, 1); } catch {} }
  }

  // Anteckning: sparas lokalt, en per konto (ett barn på samma dator ser inte förälderns lapp)
  const lappNyckel = () => { const k = skal.kontoNyckel(); return 'adraze-startsida-anteckning' + (k ? ':' + k : ''); };
  function byggAnteckning(kropp) {
    const ta = h('textarea', { class: 'anp-lapp', placeholder: 'Skriv något du vill komma ihåg …', maxlength: 5000, spellcheck: 'false', 'aria-label': 'Anteckning' });
    kropp.append(h('div', { class: 'anp-w-rubrik', text: 'Anteckning' }), ta);
    let nyckel = lappNyckel(), timer = null;
    const las = () => { nyckel = lappNyckel(); if (document.activeElement !== ta) { try { ta.value = localStorage.getItem(nyckel) || ''; } catch {} } };
    function spara() {
      clearTimeout(timer); timer = null;
      try { const v = ta.value.slice(0, 5000); if (v.trim()) localStorage.setItem(nyckel, v); else localStorage.removeItem(nyckel); } catch {}
    }
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(spara, 400); });
    ta.addEventListener('blur', spara);
    las();
    return { visas: las, lagring(k) { if (k === nyckel) las(); }, bort() { if (timer) spara(); } };
  }

  // Blockerat: totalen är skalets egen räknare (skoll-stats, ökas för varje stoppad annons/spårare).
  // "Idag" = totalen minus totalen när dagen började (sparas första gången räknaren läses en ny dag).
  const DAG_LS = 'adraze-startsida-dag';
  let senastDag = '';
  function blockSiffror() {
    const s = lsLas('skoll-stats') || {};
    const totalt = Math.max(0, (s.ads | 0) + (s.trackers | 0)), idag = dagNu();
    let d = lsLas(DAG_LS);
    if (!d || d.dag !== idag || typeof d.bas !== 'number' || d.bas > totalt) { d = { dag: idag, bas: totalt }; lsSkriv(DAG_LS, d); }
    senastDag = idag;
    return { idag: totalt - d.bas, totalt };
  }
  function tidText(sek) {
    if (sek >= 3600) return tx('{n} tim', { n: (sek / 3600).toLocaleString(sprak(), { maximumFractionDigits: 1 }) });
    if (sek >= 60) return tx('{n} min', { n: fmt(Math.round(sek / 60)) });
    return tx('{n} s', { n: fmt(Math.round(sek)) });
  }
  function byggBlockerat(kropp) {
    const idag = h('div', { class: 'anp-blk-n anp-blk-idag' }), totalt = h('div', { class: 'anp-blk-n' }), extra = h('div', { class: 'anp-blk-extra' });
    kropp.append(
      h('div', { class: 'anp-w-rubrik' }, h('img', { src: 'adraze-mark.png', alt: '', class: 'anp-blk-mark' }), 'Stoppat av AdRaze'),
      h('div', { class: 'anp-blk-rad' }, h('div', null, idag, h('div', { class: 'anp-blk-l', text: 'idag' })), h('div', null, totalt, h('div', { class: 'anp-blk-l', text: 'totalt' }))),
      h('div', { class: 'anp-blk-under' }, h('span', { text: 'annonser och spårare' }), extra));
    function rita() {
      const s = blockSiffror();
      idag.textContent = fmt(s.idag); totalt.textContent = fmt(s.totalt);
      const mb = (s.totalt * 30) / 1024;   // samma uppskattning som statistiken längst ned: ~30 kB och ~50 ms per stopp
      const data = mb >= 1024 ? (mb / 1024).toLocaleString(sprak(), { maximumFractionDigits: 1 }) + ' GB' : fmt(Math.round(mb)) + ' MB';
      extra.textContent = ' · ' + tx('≈ {data} mindre data, {tid} sparad tid', { data, tid: tidText(s.totalt * 0.05) });
    }
    rita();
    return { visas: rita, traff: rita };
  }

  // Fråga Falk: öppnar Falk-panelen som vanligt (kräver inloggning) och skickar frågan dit
  function byggFalk(kropp) {
    const inp = h('input', { class: 'anp-falt', type: 'text', maxlength: 500, placeholder: 'Fråga om en länk, ett mejl …', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Fråga till Falk' });
    const notis = h('div', { class: 'anp-falk-notis', role: 'status' });
    const form = h('form', { class: 'anp-falk-form', onsubmit: (e) => { e.preventDefault(); fraga(inp.value); } },
      inp, h('button', { type: 'submit', class: 'anp-falk-skicka', title: 'Fråga Falk', 'aria-label': 'Fråga Falk' }, ikon(IK.pil)));
    kropp.append(
      h('div', { class: 'anp-falk-topp' }, h('img', { src: 'krypto-owl.png', alt: '', class: 'anp-falk-bild' }),
        h('div', null, h('b', { text: 'Fråga Falk' }), h('span', { text: 'AdRazes AI-assistent' }))),
      form, h('div', { class: 'anp-falk-forslag' }, FALK_FORSLAG.map((f) => h('button', { type: 'button', text: tx(f), onclick: () => fraga(tx(f)) }))), notis);   // frågan går till Falk på ditt språk
    function fraga(q) {
      q = String(q || '').trim().slice(0, 500);
      if (!q) { inp.focus(); return; }
      const k = skal.konto();
      // Utloggad: skalet öppnar inloggningen (och Falk efteråt). Utan Pro: Falk visar Pro-rutan. Frågan ligger kvar.
      if (!k) { inp.value = q; notis.textContent = 'Logga in först. Frågan ligger kvar här.'; skal.falk(true); return; }
      if (!k.pro) { inp.value = q; notis.textContent = 'Falk ingår i AdRaze Pro.'; skal.falk(true); return; }
      notis.textContent = '';
      if (!skal.falk(true)) return;
      try { window.view.kryptoPrefill(q); } catch {}   // huvudprocessen väntar tills panelen laddat klart
      inp.value = ''; stat.falkFragor++;
    }
    return { visas() { notis.textContent = ''; } };
  }

  function byggOrdsprak(kropp) {
    const txt = h('div', { class: 'anp-ord' });
    kropp.append(h('div', { class: 'anp-w-rubrik', text: 'Dagens ordspråk' }), txt);
    const rita = () => { const d = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); txt.textContent = ORDSPRAK[((d % ORDSPRAK.length) + ORDSPRAK.length) % ORDSPRAK.length]; };
    rita();
    return { visas: rita };
  }

  function segKnappar(par, varde, nar) {
    const el = h('div', { class: 'anp-seg', role: 'group' });
    const knappar = par.map(([v, l]) => h('button', { type: 'button', 'data-v': v, text: l, onclick: (e) => { e.stopPropagation(); satt(v); nar(v); } }));
    const satt = (v) => knappar.forEach((b) => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', String(b.dataset.v === v)); });
    el.append(...knappar); satt(varde);
    return { el, satt };
  }

  /* ── Skelettet: startsidans befintliga delar får klasser, rutnätet hamnar där genvägarna låg ── */
  const inre = klockan.parentElement;   // innehållskolumnen (klocka, hälsning, sökfält, genvägar)
  inre.classList.add('anp-st-inre');
  const bg = document.getElementById('nt-bg');
  if (bg && bg.nextElementSibling) bg.nextElementSibling.classList.add('anp-st-tona');   // den mörka toningen över bilden
  const sokfalt = document.getElementById('nt-search');
  const sokRuta = sokfalt ? sokfalt.parentElement : null;
  if (sokRuta) sokRuta.classList.add('anp-st-sok');
  const logga = h('div', { id: 'anp-st-logga', 'aria-hidden': 'true' }, h('img', { src: 'adraze-mark.png', alt: '' }), h('span', { text: 'AdRaze' }));
  inre.insertBefore(logga, sokRuta || null);
  const grid = h('div', { id: 'anp-st-grid', role: 'list', 'aria-label': 'Widgetar', 'data-tom': 'Inga widgetar än. Lägg till från listan.' });   // data-tom: texten när rutnätet är tomt (CSS ::before, översätts av i18n.js)
  const genvagarna = document.getElementById('shortcuts');
  inre.insertBefore(grid, genvagarna || null);
  inre.append(forvar);
  if (genvagarna) forvar.append(genvagarna);
  // Statistikremsan och fotokrediten ligger kvar längst ned även när innehållet rullar
  const remsa = nt.querySelector('.nt-stats'), kredit = document.getElementById('nt-credit');
  if (remsa) nt.append(remsa);
  if (kredit) nt.append(kredit);
  const anpassaKnapp = h('button', { id: 'anp-st-anpassa', type: 'button', title: 'Anpassa startsidan', onclick: () => startaRedigering() }, ikon(IK.reglage), h('span', { text: 'Anpassa' }));
  const lada = h('aside', { id: 'anp-st-lada', hidden: true, 'aria-label': 'Anpassa startsidan' });
  nt.append(anpassaKnapp, lada);

  /* ── Rutnätet ── */
  const inst = new Map();   // typ → { w, el, kropp, api, s, storlekKnapp }
  let drag = null, ritaEfter = false;
  function skapa(w) {
    const T = TYPER[w];
    const el = h('section', { class: 'anp-w anp-w-' + w + (T.naken ? ' naken' : ''), 'data-w': w, role: 'listitem', 'aria-label': T.namn });
    const kropp = h('div', { class: 'anp-w-kropp' });
    const storlekKnapp = h('button', { type: 'button', class: 'anp-w-storlek', onclick: (e) => { e.stopPropagation(); vaxlaStorlek(w); } });
    el.append(kropp,
      h('div', { class: 'anp-w-flik', 'aria-hidden': 'true' }, ikon(IK.grepp), h('span', { text: T.namn })),
      h('div', { class: 'anp-w-knappar' }, storlekKnapp,
        h('button', { type: 'button', class: 'anp-w-bort', title: 'Ta bort', 'aria-label': tx('Ta bort {x}', { x: tx(T.namn) }), onclick: (e) => { e.stopPropagation(); taBort(w); } }, ikon(IK.kryss))));
    const i = { w, el, kropp, storlekKnapp, s: null, api: {} };
    try { i.api = T.bygg(kropp, i) || {}; } catch (e) { console.warn('[startsida]', w, e); }
    el.addEventListener('pointerdown', (e) => pekareNer(e, i));
    el.addEventListener('keydown', (e) => tangent(e, i));
    return i;
  }
  function ritaGrid() {
    if (drag) { ritaEfter = true; return; }
    const l = layout();
    const kvar = new Set(l.map((x) => x.w));
    for (const [w, i] of inst) if (!kvar.has(w)) { try { i.api.bort && i.api.bort(); } catch {} i.el.remove(); inst.delete(w); }
    let fore = null;
    for (const x of l) {
      let i = inst.get(x.w);
      const ny = !i;
      if (ny) { i = skapa(x.w); inst.set(x.w, i); }
      const bytt = i.s !== x.s; i.s = x.s;
      i.el.classList.toggle('bred', x.s === 'bred');
      const plats = fore ? fore.nextSibling : grid.firstChild;
      if (plats !== i.el) grid.insertBefore(i.el, plats);
      fore = i.el;
      const tillBred = x.s !== 'bred';
      i.storlekKnapp.replaceChildren(ikon(tillBred ? IK.bred : IK.liten));
      i.storlekKnapp.title = tillBred ? 'Gör bred' : 'Gör liten';
      i.storlekKnapp.setAttribute('aria-label', tillBred ? tx('Gör bred: {x}', { x: tx(TYPER[x.w].namn) }) : tx('Gör liten: {x}', { x: tx(TYPER[x.w].namn) }));
      i.el.tabIndex = redigerar ? 0 : -1;
      if (ny && synlig) { try { i.api.visas && i.api.visas(); } catch {} }
      else if (bytt && !ny) { try { i.api.storlek && i.api.storlek(); } catch {} }
    }
    nt.classList.toggle('anp-inga-widgetar', !l.length);
    if (redigerar) uppdateraLada();
    kolumnKoll(); passaSnart();
  }
  // Bred = två kolumner. Ryms bara en kolumn blir allt en kolumn brett (annars sticker rutnätet ut).
  function kolumnKoll() { const b = grid.clientWidth; grid.classList.toggle('anp-en-kolumn', b > 0 && b < 2 * KOL + GAP); }

  /* ── Utseende: sökfält, logga, hälsning, bild, statistik, stil, tom ── */
  let hadeBild = null;
  function tillampa() {
    const tom = bool('tom'), bild = bool('bakgrund') && !tom;
    nt.classList.toggle('anp-tom', tom);
    nt.classList.toggle('anp-utan-sok', !bool('sokfalt'));
    nt.classList.toggle('anp-med-logga', bool('logga'));
    nt.classList.toggle('anp-utan-halsning', !bool('halsning'));
    nt.classList.toggle('anp-utan-bild', !bild);
    nt.classList.toggle('anp-utan-stat', !bool('statistik'));
    nt.classList.toggle('anp-solid', stil() === 'solid');
    // Bilden slogs på igen: skalet hämtade ingen medan den var av (tabBg), så be det hämta nu
    if (hadeBild === false && bild) { try { applyStoredBg(); } catch {} }
    hadeBild = bild;
    passaSnart();
  }

  /* ── Statistikremsan: göms när den skulle hamna över widgetarna (som skalet redan gör med genvägarna) ── */
  let passaRaf = 0, remsaHojd = 0;
  const passaSnart = () => { if (!passaRaf) passaRaf = requestAnimationFrame(() => { passaRaf = 0; passaRemsa(); }); };
  function passaRemsa() {
    if (!remsa || !synlig) return;
    let dolj = inre.scrollHeight > inre.clientHeight + 1;   // innehållet rullar → remsan skulle ligga över något
    if (!dolj && inst.size && grid.offsetParent) {
      const g = grid.getBoundingClientRect(), topp = nt.getBoundingClientRect().bottom - 44 - (remsaHojd || 74);
      dolj = g.height > 0 && g.bottom + 12 > topp;
    }
    if (dolj !== remsa.classList.contains('anp-dold')) {
      remsa.classList.toggle('anp-dold', dolj);
      if (!dolj) { try { fitNtStats(); } catch {} }
    }
    if (!dolj && remsa.offsetHeight) remsaHojd = remsa.offsetHeight;
  }
  try { const ro = new ResizeObserver(() => { kolumnKoll(); passaSnart(); nt.classList.toggle('anp-smal', nt.clientWidth > 0 && nt.clientWidth < 860); }); ro.observe(nt); ro.observe(grid); ro.observe(inre); } catch {}

  /* ── Synlighet: widgetarna uppdateras när startsidan visas, klockan tickar bara då ── */
  let synlig = false, tickTimer = null;
  function kollaSynlig() {
    const nu = !nt.classList.contains('hidden');
    if (nu === synlig) return;
    synlig = nu;
    if (nu) {
      for (const i of inst.values()) { try { i.api.visas && i.api.visas(); } catch (e) { console.warn('[startsida]', i.w, e); } }
      clearInterval(tickTimer); tickTimer = setInterval(tick, 15000);
      kolumnKoll(); passaSnart();
    } else {
      clearInterval(tickTimer); tickTimer = null;
      if (redigerar) avslutaRedigering();
    }
  }
  function tick() { if (!synlig) return; for (const i of inst.values()) { try { i.api.tick && i.api.tick(); } catch {} } }
  new MutationObserver(kollaSynlig).observe(nt, { attributes: true, attributeFilter: ['class'] });

  // Varje stoppad annons: ny dag? (läses innan skalet räknar upp) + rita om Blockerat högst två gånger i sekunden
  let traffTimer = null;
  try {
    window.skoll.onAdblockHit(() => {
      if (dagNu() !== senastDag) blockSiffror();
      if (!synlig || !inst.has('blockerat') || traffTimer) return;
      traffTimer = setTimeout(() => { traffTimer = null; const i = inst.get('blockerat'); if (i && synlig) { try { i.api.traff(); } catch {} } }, 500);
    });
  } catch {}
  // Flikraden ritas om när en flik stängs eller öppnas igen → "Senast stängda" hänger med direkt
  const flikraden = document.getElementById('tabs');
  if (flikraden) new MutationObserver(() => { if (synlig) for (const i of inst.values()) { try { i.api.flikar && i.api.flikar(); } catch {} } }).observe(flikraden, { childList: true });
  // Andra fönster (samma localStorage): orten, vädret, anteckningen
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('adraze-startsida-')) return;
    for (const i of inst.values()) { try { i.api.lagring && i.api.lagring(e.key); } catch {} }
  });

  /* ── Redigeringsläget ── */
  let redigerar = false;
  function startaRedigering() {
    if (redigerar || !synlig) return;
    redigerar = true;
    nt.classList.add('anp-redigerar');
    byggLada(); lada.hidden = false;
    for (const i of inst.values()) i.el.tabIndex = 0;
    setTimeout(() => { try { const b = lada.querySelector('.anp-lada-klar'); if (b) b.focus({ preventScroll: true }); } catch {} }, 30);
    kolumnKoll(); passaSnart();
  }
  function avslutaRedigering() {
    if (!redigerar) return;
    if (drag) slappa(null);
    redigerar = false;
    nt.classList.remove('anp-redigerar');
    lada.hidden = true; lada.textContent = '';
    for (const i of inst.values()) i.el.tabIndex = -1;
    kolumnKoll(); passaSnart();
  }
  document.addEventListener('keydown', (e) => {
    if (!redigerar || e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    e.preventDefault(); avslutaRedigering();
  });
  // Widgetens namn mitt i en etikett ("La till klocka"): översatt, med liten bokstav – inte på tyska, där substantiv har stor
  function namnLiten(w) { const n = tx(TYPER[w].namn); return /^(de|lb)$/.test(sprak()) ? n : n.toLowerCase(); }
  function laggTill(w) {
    const l = layout(); if (!TYPER[w] || l.some((x) => x.w === w)) return;
    if (bool('tom')) A.set('startsida.tom', false, 'Tom startsida');   // annars syns inte det man lägger till
    sattLayout([...l, { w, s: TYPER[w].s }], tx('La till {x}', { x: namnLiten(w) }));
    const i = inst.get(w);
    if (i) {
      i.el.classList.remove('anp-ny'); void i.el.offsetWidth; i.el.classList.add('anp-ny');
      setTimeout(() => i.el.classList.remove('anp-ny'), 1300);
      try { i.el.scrollIntoView({ block: 'nearest', behavior: rorelse() ? 'smooth' : 'auto' }); } catch {}
    }
  }
  function taBort(w) {
    const l = layout(); if (!l.some((x) => x.w === w)) return;
    sattLayout(l.filter((x) => x.w !== w), tx('Tog bort {x}', { x: namnLiten(w) }));
  }
  function vaxlaStorlek(w) {
    sattLayout(layout().map((x) => (x.w === w ? { w, s: x.s === 'bred' ? 'liten' : 'bred' } : x)), tx('Ändrade storlek på {x}', { x: namnLiten(w) }));
  }
  function flytta(w, steg) {
    const l = layout(), k = l.findIndex((x) => x.w === w), ny = k + steg;
    if (k < 0 || ny < 0 || ny >= l.length) return false;
    const [x] = l.splice(k, 1); l.splice(ny, 0, x);
    sattLayout(l, tx('Flyttade {x}', { x: namnLiten(w) }));
    return true;
  }
  function tangent(e, i) {
    if (!redigerar || e.target !== i.el) return;
    let steg = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') steg = -1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') steg = 1;
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); taBort(i.w); return; }
    else return;
    e.preventDefault();
    if (flytta(i.w, steg)) requestAnimationFrame(() => { try { i.el.focus(); } catch {} });
  }

  // Lådan: alla widgetar, med Lägg till / Ta bort. Byggs när redigeringen börjar, uppdateras på plats sen.
  let ladaRader = new Map(), ladaAngra = null, ladaNotis = null;
  function byggLada() {
    lada.textContent = ''; ladaRader = new Map();
    const lista = h('div', { class: 'anp-lada-lista', role: 'list' });
    for (const w of TYP_ORDNING) {
      const T = TYPER[w];
      const knapp = h('button', { type: 'button', onclick: () => (layout().some((x) => x.w === w) ? taBort(w) : laggTill(w)) });
      const rad = h('div', { class: 'anp-lada-rad', role: 'listitem' },
        h('span', { class: 'anp-lada-ikon' }, ikon(T.ikon)),
        h('span', { class: 'anp-lada-txt' }, h('b', { text: T.namn }), h('small', { text: T.beskr })), knapp);
      ladaRader.set(w, { rad, knapp }); lista.append(rad);
    }
    ladaAngra = h('button', { type: 'button', class: 'anp-lada-angra', disabled: true, onclick: () => { Promise.resolve(A.angra()).catch(() => {}); } }, ikon(IK.angra), h('span', { text: 'Ångra' }));
    ladaNotis = h('div', { class: 'anp-lada-notis', hidden: true },
      h('p', { text: 'Tom startsida är på, så widgetarna syns inte.' }),
      h('button', { type: 'button', text: 'Visa startsidan igen', onclick: () => A.set('startsida.tom', false, 'Tom startsida') }));
    lada.append(
      h('div', { class: 'anp-lada-topp' },
        h('div', null, h('h2', { text: 'Anpassa startsidan' }), h('p', { text: 'Dra en widget för att flytta den. Med knapparna i hörnet gör du den bred eller tar bort den.' })),
        h('button', { type: 'button', class: 'anp-lada-x', title: 'Stäng', 'aria-label': 'Stäng', onclick: avslutaRedigering }, ikon(IK.kryss))),
      ladaNotis, h('div', { class: 'anp-lada-rubrik', text: 'Widgetar' }), lista,
      h('div', { class: 'anp-lada-fot' }, ladaAngra,
        h('button', { type: 'button', class: 'anp-lada-mer', text: 'Fler val', title: 'Sökfält, logga, bakgrund och stil', onclick: oppnaInstallningar }),
        h('button', { type: 'button', class: 'anp-liq anp-lada-klar', text: 'Klar', onclick: avslutaRedigering })));
    uppdateraLada();
  }
  function uppdateraLada() {
    if (!redigerar || !ladaAngra) return;
    const pa = new Set(layout().map((x) => x.w));
    for (const [w, { rad, knapp }] of ladaRader) {
      const har = pa.has(w);
      rad.classList.toggle('pa', har);
      knapp.className = har ? 'anp-lada-bort' : 'anp-lada-till';
      knapp.replaceChildren(har ? 'Ta bort' : 'Lägg till');
      knapp.setAttribute('aria-label', har ? tx('Ta bort {x}', { x: tx(TYPER[w].namn) }) : tx('Lägg till {x}', { x: tx(TYPER[w].namn) }));
    }
    ladaNotis.hidden = !bool('tom');
    kollaAngra();
  }
  // Ångra gäller bara om det senaste i historiken är en ändring av startsidan
  async function kollaAngra() {
    const b = ladaAngra; if (!b) return;
    let senaste = null; try { const hl = await A.historik(); senaste = Array.isArray(hl) ? hl[0] : null; } catch {}
    if (b !== ladaAngra) return;
    const ok = !!(senaste && typeof senaste.nyckel === 'string' && senaste.nyckel.startsWith('startsida.'));
    b.disabled = !ok; b.title = ok ? tx('Ångra: {x}', { x: tx(String(senaste.etikett || '')) }) : 'Inget att ångra';
  }
  function oppnaInstallningar() {
    avslutaRedigering();
    try { openSettings(); showSettingsCat('anpassa'); } catch {}
    setTimeout(() => { const s = document.getElementById('anp-startsida'); if (s) try { s.scrollIntoView({ block: 'start' }); } catch {} }, 60);
  }

  /* ── Dra och släpp (pekarhändelser: mus, pekskärm, penna) ── */
  function pekareNer(e, i) {
    if (!redigerar || e.button !== 0 || drag) return;
    if (e.target.closest('button, input, textarea, select, a, .anp-w-redval')) return;
    e.preventDefault();
    try { i.el.focus({ preventScroll: true }); } catch {}
    drag = { i, x0: e.clientX, y0: e.clientY, pid: e.pointerId, aktiv: false, plats: null };
    window.addEventListener('pointermove', pekareFlytt);
    window.addEventListener('pointerup', pekareUpp);
    window.addEventListener('pointercancel', pekareUpp);
    window.addEventListener('blur', avbrytDrag);
  }
  function pekareFlytt(e) {
    const d = drag; if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.aktiv) { if (Math.hypot(dx, dy) < 6) return; borjaDra(d); }
    d.i.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const r = inre.getBoundingClientRect();   // nära kanten → rulla innehållet
    if (e.clientY < r.top + 48) inre.scrollTop -= 14; else if (e.clientY > r.bottom - 48) inre.scrollTop += 14;
    placera(e.clientX, e.clientY);
  }
  function borjaDra(d) {
    d.aktiv = true;
    const el = d.i.el, r = el.getBoundingClientRect();
    d.plats = h('div', { class: 'anp-w-plats' + (d.i.s === 'bred' ? ' bred' : ''), 'aria-hidden': 'true' });
    d.plats.style.height = r.height + 'px';
    grid.style.minHeight = grid.offsetHeight + 'px';   // krymper inte under dragningen → sidan hoppar inte när den är nedrullad
    grid.insertBefore(d.plats, el);
    el.classList.add('anp-drar');
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    nt.classList.add('anp-drar-nu');
  }
  // Rektangel enligt layouten (utan pågående animationer), så målet inte fladdrar medan rutorna glider.
  // offsetLeft/Top räknas från närmaste positionerade förälder (innehållskolumnen), så rutnätets egen plats dras av.
  function layoutRekt(c) {
    const g = grid.getBoundingClientRect(), egen = c.offsetParent === grid;
    const l = g.left + c.offsetLeft - (egen ? 0 : grid.offsetLeft), t = g.top + c.offsetTop - (egen ? 0 : grid.offsetTop);
    return { l, t, r: l + c.offsetWidth, b: t + c.offsetHeight };
  }
  function placera(x, y) {
    const d = drag;
    const andra = [...grid.children].filter((c) => c !== d.i.el);
    let mal = null;
    for (const c of andra) { const r = layoutRekt(c); if (x >= r.l && x <= r.r && y >= r.t && y <= r.b) { mal = { c, r }; break; } }
    if (!mal) {   // nedanför allt → sist
      const lagst = andra.reduce((m, c) => Math.max(m, layoutRekt(c).b), -Infinity);
      if (andra.length && y > lagst && grid.lastElementChild !== d.plats) flyttaPlats(null);
      return;
    }
    if (mal.c === d.plats) return;
    const efter = x > (mal.r.l + mal.r.r) / 2;
    const ref = efter ? mal.c.nextSibling : mal.c;
    if (ref === d.plats || (efter ? mal.c.nextElementSibling === d.plats : mal.c.previousElementSibling === d.plats)) return;
    flyttaPlats(ref);
  }
  function flyttaPlats(ref) {
    const d = drag, anim = rorelse();
    const fore = anim ? new Map([...grid.children].filter((c) => c !== d.i.el).map((c) => [c, c.getBoundingClientRect()])) : null;
    grid.insertBefore(d.plats, ref);
    if (!anim) return;
    for (const [c, v] of fore) {
      const n = layoutRekt(c), dx = v.left - n.l, dy = v.top - n.t;
      if (!dx && !dy) continue;
      c.style.transition = 'none'; c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      void c.offsetWidth;
      c.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'; c.style.transform = '';
    }
  }
  function slapp() {
    window.removeEventListener('pointermove', pekareFlytt);
    window.removeEventListener('pointerup', pekareUpp);
    window.removeEventListener('pointercancel', pekareUpp);
    window.removeEventListener('blur', avbrytDrag);
  }
  function pekareUpp(e) { const d = drag; if (!d || (e && e.pointerId !== d.pid)) return; slappa(e); }
  function avbrytDrag() { if (drag) slappa(null); }
  function slappa() {
    const d = drag; slapp(); drag = null;
    const efter = ritaEfter; ritaEfter = false;
    if (!d || !d.aktiv) { if (efter) ritaGrid(); return; }   // ett vanligt klick
    const el = d.i.el, fran = el.getBoundingClientRect();
    el.classList.remove('anp-drar'); el.removeAttribute('style');
    grid.insertBefore(el, d.plats); d.plats.remove();
    grid.style.minHeight = '';
    nt.classList.remove('anp-drar-nu');
    for (const c of grid.children) { if (c !== el) { c.style.transition = ''; c.style.transform = ''; } }
    if (rorelse()) {   // glid från där du släppte till platsen
      const n = layoutRekt(el);
      el.style.transition = 'none'; el.style.transform = 'translate(' + (fran.left - n.l) + 'px,' + (fran.top - n.t) + 'px)';
      void el.offsetWidth;
      el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'; el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 260);
    }
    const storlek = new Map(layout().map((x) => [x.w, x.s]));
    const ny = [...grid.children].map((c) => c.dataset && c.dataset.w).filter((w) => TYPER[w]).map((w) => ({ w, s: storlek.get(w) || TYPER[w].s }));
    if (JSON.stringify(ny) !== JSON.stringify(layout())) sattLayout(ny, tx('Flyttade {x}', { x: namnLiten(d.i.w) }));
    else if (efter) ritaGrid();
  }

  /* ── Inställningar → Anpassa → Startsidan ── */
  function setRad(titel, beskr, ...kontroller) {
    return h('div', { class: 'set-row' },
      h('div', { class: 'set-txt' }, h('div', { class: 'set-title', text: titel }), beskr ? h('div', { class: 'set-desc', text: beskr }) : null),
      ...kontroller);
  }
  function brytare(namn, etikett) {
    const inp = h('input', { type: 'checkbox', 'aria-label': etikett, 'data-anp': 'startsida.' + namn });
    inp.checked = bool(namn);
    inp.addEventListener('change', () => A.set('startsida.' + namn, inp.checked, etikett));
    return h('label', { class: 'switch' }, inp, h('span', { class: 'track' }));
  }
  function setSeg(nyckel, par, varde, etikett) {
    const w = h('div', { class: 'seg flex-none', role: 'group', 'aria-label': etikett, 'data-anp': nyckel });
    for (const [v, l] of par) {
      const b = h('button', { type: 'button', class: 'seg-btn' + (v === varde ? ' on' : ''), text: l, 'aria-pressed': String(v === varde), 'data-v': v });
      b.addEventListener('click', () => { w.querySelectorAll('.seg-btn').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); A.set(nyckel, v, etikett); });
      w.append(b);
    }
    return w;
  }
  function ritaInstallningar() {
    const sek = document.getElementById('anp-startsida'); if (!sek) return;
    const tom = bool('tom');
    const dim = (el) => { el.setAttribute('data-dim', ''); el.classList.toggle('anp-dimmad', tom); return el; };
    sek.replaceChildren(
      h('h3', { class: 'set-h3', text: 'Startsidan' }),
      h('p', { class: 'set-lead', text: 'Det du ser när du öppnar en ny flik. Widgetarna lägger du till och flyttar direkt på startsidan.' }),
      dim(setRad('Widgetar', 'Klocka, väder, anteckning, Fråga Falk och mer.',
        h('button', { type: 'button', class: 'set-btn flex-none', text: 'Anpassa startsidan', onclick: redigeraFranInstallningar }))),
      dim(setRad('Widgetarnas stil', 'Frostade släpper igenom bakgrunden. Solida är lättast att läsa.',
        setSeg('startsida.stil', [['frostad', 'Frostad'], ['solid', 'Solid']], stil(), 'Widgetarnas stil'))),
      dim(setRad('Klockan', 'Hur klockwidgeten visar tiden. Alltid 24 timmar.',
        setSeg('startsida.klocka', [['digital', 'Digital'], ['analog', 'Analog']], klockStil(), 'Klockans utseende'))),
      h('div', { class: 'anp-st-delare' }),
      setRad('Tom startsida', 'Bara en tom sida: inget sökfält, ingen bild och inga widgetar.', brytare('tom', 'Tom startsida')),
      dim(setRad('Sökfält', 'Sökrutan mitt på startsidan.', brytare('sokfalt', 'Sökfält på startsidan'))),
      dim(setRad('Logga', 'AdRazes logga ovanför sökrutan.', brytare('logga', 'Logga på startsidan'))),
      dim(setRad('Klocka och hälsning', 'Den stora klockan och hälsningen överst.', brytare('halsning', 'Klocka och hälsning'))),
      dim(setRad('Bakgrundsbild', 'Av ger en lugn bakgrund i en färg som följer temat.',
        h('button', { type: 'button', class: 'pill flex-none', text: 'Byt bild', onclick: () => { const b = document.getElementById('settings-bg-btn'); if (b) b.click(); } }),
        brytare('bakgrund', 'Bakgrundsbild på startsidan'))),
      dim(setRad('Statistik längst ned', 'Hur mycket reklam AdRaze har stoppat.', brytare('statistik', 'Statistik längst ned'))),
      h('div', { class: 'anp-st-delare' }),
      setRad('Återställ startsidan', 'Widgetar och val som från början. Anteckningen och orten finns kvar.',
        h('button', { type: 'button', class: 'btn-ghost flex-none', text: 'Återställ', onclick: () => { Promise.resolve(A.aterstall('startsida.')).catch(() => {}); } })));
  }
  // Efter en ändring: uppdatera brytare och val på plats (byggs delen om tappar brytaren fokus)
  function synkaInstallningar() {
    const sek = document.getElementById('anp-startsida'); if (!sek) return;
    if (!sek.querySelector('.set-row')) { ritaInstallningar(); return; }
    for (const inp of sek.querySelectorAll('input[data-anp]')) inp.checked = bool(inp.getAttribute('data-anp').slice(10));
    for (const g of sek.querySelectorAll('.seg[data-anp]')) {
      const v = g.getAttribute('data-anp') === 'startsida.stil' ? stil() : klockStil();
      for (const b of g.querySelectorAll('.seg-btn')) { const pa = b.getAttribute('data-v') === v; b.classList.toggle('on', pa); b.setAttribute('aria-pressed', String(pa)); }
    }
    const tom = bool('tom');
    for (const el of sek.querySelectorAll('[data-dim]')) el.classList.toggle('anp-dimmad', tom);
  }
  function redigeraFranInstallningar() {
    try { closeSettings(); } catch {}
    try { const a = skal.aktiv(); if (!a || a.url || a.incognito) createTab(null); } catch {}
    setTimeout(() => startaRedigering(), 80);
  }
  document.addEventListener('anpassa:visa', ritaInstallningar);

  /* ── Ändringar i butiken (härifrån, inställningarna, ångra, import eller ett annat fönster) ── */
  A.on('startsida.', (nyckel) => {
    if (nyckel === 'startsida.layout') { if (!vantar) lokal = null; ritaGrid(); }
    else {
      tillampa();
      if (nyckel === 'startsida.klocka') { const i = inst.get('klocka'); if (i && i.api.andrat) i.api.andrat(); }
      if (redigerar) uppdateraLada();
    }
    synkaInstallningar();   // billigt, så alltid (delen kan synas via inställningssöket utan att anpassa:visa skickas)
  });

  /* ── Start ── */
  tillampa();
  blockSiffror();   // dagens utgångsläge sparas tidigt
  ritaGrid();
  ritaInstallningar();
  kollaSynlig();
  // Skalet laddat: anteckningen kan nu läsas för rätt konto, listorna fyllas
  document.addEventListener('DOMContentLoaded', () => { if (synlig) for (const i of inst.values()) { try { i.api.visas && i.api.visas(); } catch {} } });

  // utanBild(): skalet frågar innan det hämtar en bakgrundsbild (avslagen bild = inget nätanrop).
  // Resten är för testerna och felsökning (skalet är vår egen sida).
  window.AnpassaStartsida = {
    utanBild: () => !bool('bakgrund') || bool('tom'),
    redigera: startaRedigering, klar: avslutaRedigering, laggTill, taBort, vaxlaStorlek, flytta,
    layout: () => layout(), redigerar: () => redigerar, stat, blockSiffror,
  };
})();
