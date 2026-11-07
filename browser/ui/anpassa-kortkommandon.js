'use strict';
/* Anpassa › kortkommandon, kommandopalett och musgester – fönstrets del.
 *
 * Huvudprocessen (../anpassa-kortkommandon.js) fångar tangenterna och musgesterna och kör de flesta kommandona.
 * Här finns:
 *   • kommandon som hör till skalet (flytta flik, läsläge, Falk, chatten …)
 *   • kommandopaletten (Ctrl+K): sök bland kommandon, öppna flikar, bokmärken, historik och inställningar
 *   • inställningarna i Anpassa › Kortkommandon och Musgester (ritas i <section id="anp-kortkommandon">)
 *
 * Filen laddas före shell.js. Skalets funktioner och variabler (tabs, active, createTab, showActiveTab …) används
 * därför bara inuti funktioner som körs senare, aldrig när filen läses in.
 *
 * Andra delar av skalet kan lägga till egna kommandon:
 *   AnpassaKortkommandon.registrera({ id: 'skarmdump', namn: 'Ta en skärmdump', kategori: 'Sidan', standard: ['CmdOrCtrl+Shift+S'], kor() { … } })
 */
(function () {
  const bro = window.anpassaKortkommandon;
  const A = window.Anpassa;
  if (!bro || !A) return;

  let info = { mac: false, win: false, kategorier: ['Flikar', 'Fönster', 'Navigering', 'Sidan', 'AdRaze'], kommandon: [], gester: [] };
  try { info = bro.lista() || info; } catch {}
  const MAC = !!info.mac;
  const kommandon = new Map(info.kommandon.map((k) => [k.id, k]));
  const extraKor = new Map();          // id → funktion, för kommandon som registrerats här i fönstret

  const t = (s) => (typeof window.t === 'function' ? window.t(s) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (id) => document.getElementById(id);
  const tryck = (f) => { try { return f(); } catch { return undefined; } };
  const toast = (s) => tryck(() => showToast(t(s)));
  const barnLage = () => !!(tryck(() => A.barnlage()) || tryck(() => account && account.isChild) || tryck(() => famLocked()));

  /* ────────── Kombinationer: visning och lagring ────────── */
  const TANGENTNAMN = { Left: '←', Right: '→', Up: '↑', Down: '↓', PageUp: 'Page Up', PageDown: 'Page Down', Plus: '+', Esc: 'Esc', Space: 'Mellanslag', Backspace: 'Backsteg', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', Enter: 'Enter', Tab: 'Tab' };
  const MODNAMN = MAC ? { CmdOrCtrl: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' } : { CmdOrCtrl: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: info.win ? 'Win' : 'Super' };
  function delar(acc) {
    const p = String(acc || '').split('+'); const tangent = p.pop();
    return [...p.map((m) => MODNAMN[m] || m), t(TANGENTNAMN[tangent] || tangent)];
  }
  const visaText = (acc) => delar(acc).join(MAC ? '' : '+');
  const kbd = (acc, klass) => delar(acc).map((d) => '<kbd class="' + (klass || 'anp-kbd') + '">' + esc(d) + '</kbd>').join('');
  const giltig = (a) => typeof a === 'string' && a.length <= 40 && /^((CmdOrCtrl|Ctrl|Meta|Alt|Shift)\+)*[^+]+$/.test(a);

  function bindningar(id) {
    const k = kommandon.get(id); if (!k) return [];
    const v = A.get('kortkommandon.' + id, null);
    return Array.isArray(v) ? v.filter(giltig).slice(0, 4) : (k.std || []).slice();
  }
  const andrad = (id) => { const k = kommandon.get(id); return !!k && JSON.stringify(bindningar(id)) !== JSON.stringify(k.std || []); };
  function upptagen(acc, utom) {
    for (const k of kommandon.values()) if (k.id !== utom && bindningar(k.id).includes(acc)) return k;
    return null;
  }
  async function spara(id, lista) {
    const k = kommandon.get(id); if (!k) return false;
    const lika = JSON.stringify(lista) === JSON.stringify(k.std || []);
    let r; try { r = await A.set('kortkommandon.' + id, lika ? undefined : lista, 'Kortkommando: ' + k.namn); } catch {}
    if (r && r.ok === false) { toast(r.error === 'barnlast' ? 'Det här går inte att ändra i barnläge.' : 'Det gick inte att spara.'); return false; }
    return true;
  }

  /* ────────── Kommandon som körs i skalet ────────── */
  function flyttaFlik(steg) {
    if (!active) return;
    const i = tabs.indexOf(active), j = i + steg;
    if (i < 0 || j < 0 || j >= tabs.length || !!tabs[j].pinned !== !!active.pinned) return;   // fästa flikar ligger först
    tabs.splice(i, 1); tabs.splice(j, 0, active);
    renderTabs(); saveOpenTabs();
  }
  function visaKortInstallningar(del) {
    openSettings(); showSettingsCat('anpassa');
    const mal = el(del === 'gester' ? 'anp-kort-gester' : 'anp-kortkommandon');
    requestAnimationFrame(() => { if (mal) mal.scrollIntoView({ block: 'start' }); });
  }
  const LOKALA = {
    'flytta-vanster': () => flyttaFlik(-1),
    'flytta-hoger': () => flyttaFlik(1),
    'fast-flik': () => { if (active && !active.isSettings) setPinned(active, !active.pinned); },
    'tysta-flik': () => { if (active && active.url) setMuted(active, !active.muted); },
    'duplicera-flik': () => { if (active && active.url) createTab(active.url, !!active.incognito); },
    'lasvy': () => { const b = el('reader-btn'); if (b && !b.hidden && active && active.url) b.click(); else toast('Läsläge finns inte för den här sidan.'); },
    'palett': (_kalla, franSida) => vaxlaPalett(franSida),
    'falk': () => openKrypto(!kryptoOpen),
    'chatt': () => openChatt(!chattOpen),
    'anpassa-kort': () => visaKortInstallningar(),
    'meny': () => window.view.openMenu(),
  };
  bro.onKommando((id, kalla, franSida) => {
    const f = LOKALA[id] || extraKor.get(id);
    if (!f) return;
    try { f(kalla, !!franSida); } catch (e) { console.warn('[kortkommandon]', id, e); }
  });

  // F5 och Ctrl+R når bara skalet när huvudprocessen släppt dem (de har flyttats till något annat). Då ska
  // skalets gamla lyssnare (ladda om) inte köra dem heller.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) e.stopImmediatePropagation();
  }, true);

  /* ────────── Ikoner ────────── */
  const SPRITE = { plus: 'i-plus', stang: 'i-close', bak: 'i-back', fram: 'i-fwd', ladda: 'i-reload', glob: 'i-globe', sok: 'i-search', stjarna: 'i-star', ner: 'i-download', historik: 'i-history', bokmarke: 'i-bookmark', nyckel: 'i-key', chatt: 'i-chat', kugge: 'i-settings', meny: 'i-menu', papperskorg: 'i-trash', inkognito: 'i-incognito', oversatt: 'i-translate', falk: 'i-sparkle', flytt: 'i-flytt', av: 'i-power', fav: 'i-fav' };
  const EGNA = {
    igen: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/>',
    flik: '<path d="M3 20V8a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9"/><path d="M2 20h20"/>',
    nal: '<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
    ljud: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    kopia: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    fonster: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    helskarm: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
    skrivare: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    pip: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
    bok: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6M8 11h6"/>',
    zoomut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    kod: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
    tangentbord: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 15h10"/>',
    palett: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m8 10 3 2.5L8 15"/><path d="M13 15h3"/>',
    mus: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
    spar: '<circle cx="5" cy="19" r="1.8"/><path d="M6.5 17.5C9 11 13 15 15.5 9.5L18 5"/><path d="M14 5h4v4"/>',
  };
  function ikon(namn, klass) {
    const k = 'ic ' + (klass || 'ic-sm');
    if (SPRITE[namn]) return '<svg class="' + k + '" aria-hidden="true"><use href="#' + SPRITE[namn] + '"/></svg>';
    return '<svg class="' + k + '" viewBox="0 0 24 24" aria-hidden="true">' + (EGNA[namn] || EGNA.palett) + '</svg>';
  }
  const favImg = (url) => (url ? '<img src="' + esc(url) + '" data-glob="sm" alt="">' : ikon('fav'));

  /* ────────── Kommandopaletten ────────── */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function poang(q, text, sekvens) {
    if (!text) return 0;
    if (text.startsWith(q)) return 100 - Math.min(15, text.length / 12);
    const i = text.indexOf(q);
    if (i > 0) return /[\s\-_./:›(«]/.test(text[i - 1]) ? 80 : 60;
    const ord = q.split(/\s+/).filter(Boolean);
    if (ord.length > 1 && ord.every((o) => text.includes(o))) return 50;
    if (!sekvens || q.length < 2) return 0;
    let j = 0, start = -1, slut = 0;                            // bokstäverna i ordning, t.ex. "nf" → "ny flik"
    for (let k = 0; k < text.length && j < q.length; k++) if (text[k] === q[j]) { if (start < 0) start = k; j++; slut = k; }
    return j === q.length ? Math.max(4, 32 - (slut - start + 1 - q.length) * 2) : 0;
  }
  const GRUPPER = [['kommando', 'Kommandon', 8], ['flik', 'Flikar', 6], ['bokmarke', 'Bokmärken', 6], ['installning', 'Inställningar', 6], ['historik', 'Historik', 8], ['webb', 'Webben', 1]];
  const SENASTE = 'anpassa-palett-senaste';
  const STANDARDLISTA = ['ny-flik', 'sok-pa-sidan', 'historik', 'bokmarken', 'nedladdningar', 'installningar'];
  const senaste = () => { try { const v = JSON.parse(localStorage.getItem(SENASTE) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  const minnas = (id) => { try { localStorage.setItem(SENASTE, JSON.stringify([id, ...senaste().filter((x) => x !== id)].slice(0, 6))); } catch {} };

  let pal = null;      // DOM + tillstånd medan paletten är öppen
  let palNr = 0;

  function byggPalett() {
    if (pal) return pal;
    const rot = document.createElement('div');
    rot.id = 'anp-palett';
    rot.innerHTML =
      '<img class="anp-pal-bild" alt="">' +
      '<div class="anp-pal-dim"></div>' +
      '<div class="anp-pal-kort" role="dialog" aria-modal="true" aria-label="' + esc(t('Kommandopalett')) + '">' +
        '<div class="anp-pal-falt">' + ikon('sok', 'anp-pal-sokikon') +
          '<input id="anp-pal-in" type="text" role="combobox" aria-expanded="true" aria-controls="anp-pal-lista" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="' + esc(t('Sök kommandon, flikar, bokmärken …')) + '">' +
          '<kbd class="anp-kbd">Esc</kbd></div>' +
        '<div id="anp-pal-lista" class="anp-pal-lista" role="listbox" aria-label="' + esc(t('Resultat')) + '"></div>' +
        '<div class="anp-pal-fot"><span>' + kbd('Up') + kbd('Down') + ' ' + esc(t('Välj')) + '</span><span>' + kbd('Enter') + ' ' + esc(t('Öppna')) + '</span>' +
          '<span>' + kbd('CmdOrCtrl+Enter') + ' ' + esc(t('I ny flik')) + '</span><span class="anp-pal-fot-hoger">' + kbd('Esc') + ' ' + esc(t('Stäng')) + '</span></div>' +
      '</div>';
    document.body.appendChild(rot);
    pal = { rot, bild: rot.querySelector('.anp-pal-bild'), kort: rot.querySelector('.anp-pal-kort'), inp: rot.querySelector('#anp-pal-in'), lista: rot.querySelector('#anp-pal-lista'),
      oppen: false, poster: [], visade: [], val: 0, dold: false, flik: null, overlay: null, franSida: false, fokus: null, koll: 0 };
    pal.inp.addEventListener('input', () => sok());
    pal.inp.addEventListener('keydown', palTangent);
    rot.addEventListener('mousedown', (e) => { if (!pal.kort.contains(e.target)) { e.preventDefault(); stangPalett(true); } });
    pal.lista.addEventListener('mousemove', (e) => { const r = e.target.closest('.anp-pal-rad'); if (r) valj(Number(r.dataset.i), false); });
    pal.lista.addEventListener('mousedown', (e) => e.preventDefault());   // fokus stannar i sökrutan
    pal.lista.addEventListener('click', (e) => { const r = e.target.closest('.anp-pal-rad'); if (r) kor(pal.visade[Number(r.dataset.i)], e.ctrlKey || e.metaKey); });
    window.addEventListener('resize', () => { if (pal && pal.oppen) pal.bild.style.display = 'none'; });
    return pal;
  }

  // Barnspärren och introt täcker hela fönstret: då öppnas ingen palett över dem
  const tackt = () => ['kidblock', 'hxintro'].some((id) => { const e = el(id); return !!(e && e.isConnected && getComputedStyle(e).display !== 'none'); });
  async function vaxlaPalett(franSida) {
    if (pal && pal.oppen) { stangPalett(true); return; }
    if (tackt()) return;
    const nr = ++palNr;
    const p = byggPalett();
    tryck(() => { if (sug.open) closeSug(false); });             // adressfältets förslag (de gömmer också sidan)
    const flik = tryck(() => active) || null;
    p.oppen = true; p.flik = flik; p.overlay = flik ? flik.overlay : null; p.dold = false; p.franSida = !!franSida;
    p.fokus = franSida ? null : document.activeElement;
    p.poster = samlaPoster();
    p.bild.style.display = 'none'; p.bild.removeAttribute('src');
    p.rot.classList.add('syns'); p.rot.classList.remove('on');
    // Fokus direkt, och först därefter till skalet: då återställs inte fokus till adressfältet (som markerar sig
    // själv och tar tillbaka fokus) när skalet får fokus från sidan. Det man skriver hamnar i paletten.
    p.inp.value = ''; sok(); p.inp.focus();
    bro.fokusSkal();
    // Sidan ligger i en egen vy ovanpå skalet. Den göms medan paletten är öppen och en bild av den ligger kvar under.
    const sidaSyns = !!(flik && flik.url && !flik.overlay);
    let b = null;
    if (sidaSyns) { try { b = await bro.bild(); } catch {} }
    if (nr !== palNr || !p.oppen) return;
    if (b && b.data && flik && b.flik === flik.id) {
      Object.assign(p.bild.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', display: 'block' });
      p.bild.src = b.data;
      try { await p.bild.decode(); } catch {}
      if (nr !== palNr || !p.oppen) return;
    }
    p.rot.classList.add('on');
    if (document.activeElement !== p.inp) p.inp.focus();
    if (sidaSyns && b && flik && b.flik === flik.id) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (nr !== palNr || !p.oppen || tryck(() => active) !== flik) return;
      window.view.hide(); p.dold = true;
    }
    clearInterval(p.koll);
    p.koll = setInterval(() => {                                  // en annan flik eller ruta tog över: stäng utan att visa sidan
      if (!p.oppen) return clearInterval(p.koll);
      const a = tryck(() => active) || null;
      if (a !== p.flik || (a && a.overlay !== p.overlay) || tackt()) stangPalett(false);
    }, 150);
  }

  function stangPalett(aterstall, utanFokus) {
    if (!pal || !pal.oppen) return;
    const p = pal; palNr++;
    p.oppen = false; clearInterval(p.koll);
    p.rot.classList.remove('on', 'syns');
    p.bild.removeAttribute('src');
    p.lista.innerHTML = '';
    let visad = false;
    if (aterstall && p.dold && tryck(() => active) === p.flik && p.flik && !p.flik.overlay) { tryck(() => showActiveTab()); visad = true; }
    p.dold = false;
    if (utanFokus) { try { p.inp.blur(); } catch {} return visad; }
    if (p.franSida && (visad || !p.flik || !p.flik.overlay)) { try { p.inp.blur(); } catch {} bro.fokusSida(); }
    else if (p.fokus && p.fokus !== document.body && document.contains(p.fokus) && p.fokus.offsetParent !== null) { try { p.fokus.focus(); } catch {} }
    else { try { p.inp.blur(); } catch {} }
    return visad;
  }

  // Allt man kan hitta, samlat när paletten öppnas
  function samlaPoster() {
    const ut = [], barn = barnLage();
    const inkognito = !!(tryck(() => windowIncognito) || tryck(() => active && active.incognito));
    for (const k of kommandon.values()) {
      if (k.id === 'palett' || (barn && k.barn)) continue;
      const namn = t(k.namn);
      ut.push({ typ: 'kommando', id: k.id, namn, sub: t(k.kat), falt: [norm(namn), norm(k.namn)], extra: [norm(k.sok), norm(t(k.kat))], sekvens: true,
        ikon: ikon(k.ikon), hoger: () => { const b = bindningar(k.id)[0]; return b ? kbd(b) : ''; } });
    }
    for (const f of tryck(() => tabs) || []) {
      if (f === tryck(() => active) || f._closing) continue;
      const namn = f.isSettings ? t('Inställningar') : (f.title || tryck(() => pretty(f.url)) || t('Ny flik'));
      const sub = f.url ? tryck(() => pretty(f.url)) || f.url : (f.isSettings ? '' : t('Startsida'));
      ut.push({ typ: 'flik', flik: f, namn, sub, falt: [norm(namn)], extra: [norm(f.url || '')], anv: true, ikon: tryck(() => favHtml(f)) || ikon('flik'), hoger: () => '<span class="anp-pal-tagg">' + esc(t('Byt till')) + '</span>' });
    }
    for (const b of tryck(() => getBookmarks()) || []) {
      if (!b || !b.url) continue;
      ut.push({ typ: 'bokmarke', url: b.url, namn: b.title || b.url, sub: tryck(() => pretty(b.url)) || b.url, falt: [norm(b.title)], extra: [norm(b.url)], anv: true, ikon: favImg(b.favicon) });
    }
    if (!inkognito) {
      for (const h of (tryck(() => getHistory()) || []).slice(0, 500)) {
        if (!h || !h.url) continue;
        ut.push({ typ: 'historik', url: h.url, namn: h.title || h.url, sub: tryck(() => pretty(h.url)) || h.url, falt: [norm(h.title)], extra: [norm(h.url)], anv: true, ikon: favImg(h.favicon) });
      }
    }
    for (const s of installningsIndex()) ut.push(s);
    return ut;
  }

  // Inställningarna: kategorierna i sidomenyn och raderna i varje panel (som de ser ut just nu, översatta)
  function installningsIndex() {
    const ut = [], sett = new Set();
    const lagg = (d) => { const nyckel = d.cat + '|' + norm(d.namn); if (sett.has(nyckel)) return; sett.add(nyckel); ut.push(d); };
    const dold = (x, stopp) => { for (let n = x; n && n !== stopp; n = n.parentElement) { if (n.hidden || (n.style && n.style.display === 'none')) return true; } return false; };
    document.querySelectorAll('#settings-nav .set-tab').forEach((knapp) => {
      if (knapp.style.display === 'none') return;
      const cat = knapp.dataset.cat, katNamn = knapp.textContent.trim();
      if (!cat || !katNamn) return;
      lagg({ typ: 'installning', cat, namn: katNamn, sub: t('Inställningar'), falt: [norm(katNamn)], extra: [], sekvens: true, ikon: ikon('kugge') });
      const panel = document.querySelector('#settings .set-panel[data-cat="' + cat + '"]'); if (!panel) return;
      panel.querySelectorAll('.set-title, .set-h3').forEach((rubrik) => {
        if (dold(rubrik, panel) || rubrik.closest('#anp-kortkommandon')) return;
        const namn = rubrik.textContent.trim(); if (!namn || namn.length > 70) return;
        const rad = rubrik.closest('.set-row'); const beskr = rad && rad.querySelector('.set-desc');
        lagg({ typ: 'installning', cat, namn, sub: katNamn, rubrik: rubrik.classList.contains('set-h3'), falt: [norm(namn)], extra: [norm(beskr ? beskr.textContent : ''), norm(katNamn)], sekvens: true, ikon: ikon('kugge') });
      });
    });
    const anp = (tryck(() => document.querySelector('#settings-nav .set-tab[data-cat="anpassa"]').textContent.trim())) || 'Anpassa';
    lagg({ typ: 'installning', cat: 'anpassa', del: 'kort', namn: t('Kortkommandon'), sub: anp, falt: [norm(t('Kortkommandon'))], extra: [norm('tangenter tangentbord genvägar')], sekvens: true, ikon: ikon('tangentbord') });
    lagg({ typ: 'installning', cat: 'anpassa', del: 'gester', namn: t('Musgester'), sub: anp, falt: [norm(t('Musgester'))], extra: [norm('höger musknapp dra gest')], sekvens: true, ikon: ikon('mus') });
    return ut;
  }

  function sok() {
    const p = pal; const q = norm(p.inp.value.trim());
    const grupper = new Map(GRUPPER.map(([typ]) => [typ, []]));
    if (!q) {
      const ids = [...new Set([...senaste(), ...STANDARDLISTA])];
      const kommandoPost = new Map(p.poster.filter((x) => x.typ === 'kommando').map((x) => [x.id, x]));
      for (const id of ids) { const x = kommandoPost.get(id); if (x && grupper.get('kommando').length < 6) grupper.get('kommando').push({ x, s: 1 }); }
      for (const x of p.poster) if (x.typ === 'flik' && grupper.get('flik').length < 6) grupper.get('flik').push({ x, s: 1 });
    } else {
      for (const x of p.poster) {
        let s = 0;
        for (const f of x.falt) s = Math.max(s, poang(q, f, x.sekvens));
        for (const f of x.extra) s = Math.max(s, poang(q, f, false) * 0.7);
        if (s > 0) grupper.get(x.typ).push({ x, s });
      }
      const ra = p.inp.value.trim();
      if (ra.length <= 300) {
        const arAdress = /^\S+\.\S{2,}$/.test(ra) && !/\s/.test(ra);
        grupper.get('webb').push({ x: { typ: 'webb', text: ra, namn: arAdress ? t('Gå till') + ' ' + ra : t('Sök på webben efter') + ' ”' + ra + '”', sub: '', anv: true, ikon: ikon(arAdress ? 'glob' : 'sok') }, s: 0.5 });
      }
    }
    const ordning = GRUPPER.map(([typ, namn, max], i) => {
      const l = grupper.get(typ).sort((a, b) => b.s - a.s).slice(0, max);
      return { typ, namn, l, bast: l.length ? l[0].s : 0, i };
    }).filter((g) => g.l.length).sort((a, b) => (a.typ === 'webb') - (b.typ === 'webb') || b.bast - a.bast || a.i - b.i);
    p.visade = []; let html = '';
    for (const g of ordning) {
      html += '<div class="anp-pal-grupp" role="presentation">' + esc(t(g.namn)) + '</div>';
      for (const { x } of g.l) {
        const i = p.visade.length; p.visade.push(x);
        const anv = x.anv ? ' translate="no"' : '';
        html += '<div class="anp-pal-rad" role="option" id="anp-pal-r' + i + '" data-i="' + i + '" aria-selected="false">' +
          '<span class="anp-pal-ikon">' + x.ikon + '</span>' +
          '<span class="anp-pal-txt"><span class="anp-pal-namn"' + anv + '>' + markera(x.namn, q) + '</span>' + (x.sub ? '<span class="anp-pal-sub"' + anv + '>' + esc(x.sub) + '</span>' : '') + '</span>' +
          '<span class="anp-pal-hoger">' + (x.hoger ? x.hoger() : '') + '</span></div>';
      }
    }
    if (!p.visade.length) html = '<div class="anp-pal-tom">' + esc(t('Inget hittades.')) + '</div>';
    p.lista.innerHTML = html;
    p.lista.scrollTop = 0;
    valj(0, true);
  }
  // Det man sökt på blir fetstilt i namnet
  function markera(namn, q) {
    const s = String(namn || ''); if (!q) return esc(s);
    const i = norm(s).indexOf(q);
    if (i < 0 || norm(s).length !== s.length) return esc(s);
    return esc(s.slice(0, i)) + '<b>' + esc(s.slice(i, i + q.length)) + '</b>' + esc(s.slice(i + q.length));
  }
  function valj(i, rulla) {
    const p = pal; if (!p.visade.length) { p.inp.removeAttribute('aria-activedescendant'); return; }
    i = (i + p.visade.length) % p.visade.length;
    const gammal = p.lista.querySelector('.anp-pal-rad.val');
    if (gammal) { gammal.classList.remove('val'); gammal.setAttribute('aria-selected', 'false'); }
    const rad = p.lista.querySelector('#anp-pal-r' + i);
    p.val = i;
    if (!rad) return;
    rad.classList.add('val'); rad.setAttribute('aria-selected', 'true');
    p.inp.setAttribute('aria-activedescendant', rad.id);
    if (rulla) {
      if (i === 0) p.lista.scrollTop = 0;
      else rad.scrollIntoView({ block: 'nearest' });
    }
  }
  function palTangent(e) {
    const p = pal;
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); valj(p.val + 1, true); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); valj(p.val - 1, true); }
    else if (e.key === 'PageDown') { e.preventDefault(); valj(Math.min(p.val + 6, p.visade.length - 1), true); }
    else if (e.key === 'PageUp') { e.preventDefault(); valj(Math.max(p.val - 6, 0), true); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!e.isComposing) kor(p.visade[p.val], e.ctrlKey || e.metaKey); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stangPalett(true); }
  }

  // Öppna en adress: i fliken man står på, eller i en ny (Ctrl+Enter, eller när fliken är inställningar/startsida i en ruta)
  function oppnaAdress(url, nyFlik) {
    const a = tryck(() => active);
    if (nyFlik || !a || a.isSettings || a.overlay) createTab(url); else guardedNavigate(a, url);
  }
  async function kor(x, nyFlik) {
    if (!x || !pal || !pal.oppen) return;
    if (x.typ === 'kommando') {
      minnas(x.id);
      const k = kommandon.get(x.id) || {};
      if (k.lamnar) {                                             // byter flik/öppnar en ruta: sidan behöver inte visas först
        const flik = pal.flik, dold = pal.dold;
        stangPalett(false, true);
        try { await bro.kor(x.id); } catch {}                       // svaret kommer efter skalets egna meddelanden från kommandot
        if (dold && tryck(() => active) === flik && flik && !flik.overlay) tryck(() => showActiveTab());   // inget bytte flik: visa sidan igen
      } else {
        const visad = stangPalett(true, true);                      // sidan tillbaka först – kommandot gäller den
        if (visad || (pal.flik && pal.flik.url && !pal.flik.overlay)) bro.fokusSida();
        try { await bro.kor(x.id); } catch {}
      }
      return;
    }
    // Flik, bokmärke, historik, sökning: sidan som visas efteråt får fokus (som när man byter flik med musen och börjar scrolla)
    if (x.typ === 'flik') { stangPalett(false, true); if (x.flik === tryck(() => active)) tryck(() => showActiveTab()); else switchTab(x.flik); setTimeout(() => bro.fokusSida(), 30); return; }
    if (x.typ === 'bokmarke' || x.typ === 'historik') { stangPalett(true, true); oppnaAdress(x.url, nyFlik); setTimeout(() => bro.fokusSida(), 30); return; }
    if (x.typ === 'webb') { stangPalett(true, true); oppnaAdress(x.text, nyFlik); setTimeout(() => bro.fokusSida(), 30); return; }
    if (x.typ === 'installning') {
      stangPalett(false, true);
      if (x.del) { visaKortInstallningar(x.del === 'gester' ? 'gester' : ''); return; }
      openSettings(); showSettingsCat(x.cat);
      requestAnimationFrame(() => {                               // hitta raden igen (panelen kan ha ritats om) och visa den
        const panel = document.querySelector('#settings .set-panel[data-cat="' + x.cat + '"]'); if (!panel) return;
        const mal = [...panel.querySelectorAll(x.rubrik ? '.set-h3' : '.set-title')].find((r) => norm(r.textContent.trim()) === norm(x.namn));
        if (!mal) return;
        const rad = mal.closest('.set-row') || mal;
        rad.scrollIntoView({ block: 'center' });
        rad.classList.remove('anp-blink'); void rad.offsetWidth; rad.classList.add('anp-blink');
        setTimeout(() => rad.classList.remove('anp-blink'), 1600);
      });
    }
  }

  /* ────────── Inställningar: Anpassa › Kortkommandon och Musgester ────────── */
  let insp = null;        // pågående inspelning: { id, i (plats att byta, -1 = ny), forhand, fel, konflikt }
  let filter = '';
  let bekraftaAlla = false;
  const FEL = {
    mod: 'Använd Ctrl, Alt eller en F-tangent tillsammans med tangenten.',
    redigering: 'Den används för att kopiera, klistra in och ångra.',
    system: 'Den används av datorn.',
    form: 'Den kombinationen går inte att använda.',
  };
  const ordning = () => info.kategorier.filter((k) => [...kommandon.values()].some((c) => c.kat === k));
  const synligaKommandon = (barn) => [...kommandon.values()].filter((k) => !(barn && k.barn));

  function rita() {
    const rot = el('anp-kortkommandon'); if (!rot) return;
    const barn = barnLage();
    const palett = kommandon.get('palett');
    let html = '<h3 class="set-h3">' + esc(t('Kortkommandon')) + '</h3>' +
      '<p class="set-lead">' + esc(t('Klicka på ett kortkommando för att byta det. De fungerar också när du är inne på en webbsida.')) + '</p>';
    if (palett) {
      html += '<div class="set-row anp-kort-rad anp-kort-palett' + (insp && insp.id === 'palett' ? ' spelar' : '') + '" data-id="palett">' +
        '<span class="anp-kort-ikon">' + ikon('palett') + '</span>' +
        '<div class="set-txt"><div class="set-title">' + esc(t('Kommandopalett')) + '</div><div class="set-desc">' + esc(t('Sök bland kommandon, flikar, bokmärken, historik och inställningar.')) + '</div></div>' +
        radKombos('palett') + '</div>';
    }
    html += '<div class="anp-kort-topp">' +
      '<label class="anp-kort-filter">' + ikon('sok') + '<input type="search" id="anp-kort-filter" placeholder="' + esc(t('Sök kommando eller tangent')) + '" autocomplete="off" spellcheck="false" value="' + esc(filter) + '"></label>' +
      (bekraftaAlla
        ? '<span class="anp-kort-fraga">' + esc(t('Återställa alla kortkommandon?')) + '</span><button type="button" class="set-btn" data-gor="alla-ja">' + esc(t('Återställ')) + '</button><button type="button" class="pill" data-gor="alla-nej">' + esc(t('Avbryt')) + '</button>'
        : '<button type="button" class="pill" data-gor="alla">' + esc(t('Återställ alla')) + '</button>') +
      '</div><div id="anp-kort-lista">';
    for (const kat of ordning()) {
      const rader = synligaKommandon(barn).filter((k) => k.kat === kat && k.id !== 'palett');
      if (!rader.length) continue;
      html += '<div class="anp-kort-grupp" data-kat="' + esc(kat) + '"><div class="anp-kort-gruppnamn">' + esc(t(kat)) + '</div>';
      for (const k of rader) {
        html += '<div class="set-row anp-kort-rad' + (insp && insp.id === k.id ? ' spelar' : '') + '" data-id="' + esc(k.id) + '"><div class="set-txt"><div class="set-title">' + esc(t(k.namn)) + '</div></div>' + radKombos(k.id) + '</div>';
      }
      html += '</div>';
    }
    html += '<p class="anp-kort-inget" hidden>' + esc(t('Inget kommando matchar.')) + '</p></div>';
    html += ritaGester(barn);
    rot.innerHTML = html;
    filtrera();
    if (insp) { const f = rot.querySelector('.anp-kort-rad[data-id="' + insp.id + '"] .anp-kort-spela'); if (f) f.focus(); }
  }
  // Höger del av en rad: kombinationerna som knappar, eller inspelningen
  function radKombos(id) {
    const k = kommandon.get(id);
    if (insp && insp.id === id) {
      let h = '<div class="anp-kort-kombos">';
      if (insp.konflikt) {
        h += '<span class="anp-kort-kombo anp-kort-ny">' + kbd(insp.konflikt.acc) + '</span></div>' +
          '<div class="anp-kort-medd" role="alert"><span>' + esc(t('Används redan för')) + ' <b>' + esc(t(insp.konflikt.annan.namn)) + '</b>.</span>' +
          '<button type="button" class="set-btn" data-gor="byt-anda">' + esc(t('Byt ändå')) + '</button><button type="button" class="pill" data-gor="avbryt">' + esc(t('Avbryt')) + '</button></div>';
        return h;
      }
      h += '<button type="button" class="anp-kort-spela" data-gor="avbryt" aria-live="polite" aria-label="' + esc(t('Tryck på tangenterna. Esc avbryter.')) + '">' +
        (insp.forhand ? kbd(insp.forhand) + '<span class="anp-kort-plusstreck">+ …</span>' : esc(t('Tryck på tangenterna …'))) + '</button>' +
        '<button type="button" class="anp-kort-lank" data-gor="avbryt">' + esc(t('Avbryt')) + '</button></div>';
      if (insp.fel) h += '<div class="anp-kort-medd fel" role="alert"><span>' + esc(insp.fel) + '</span></div>';
      return h;
    }
    const b = bindningar(id);
    let h = '<div class="anp-kort-kombos">';
    if (!b.length) h += '<span class="anp-kort-tom">' + esc(t('Inget')) + '</span>';
    b.forEach((a, i) => {
      h += '<span class="anp-kort-kombo"><button type="button" class="anp-kort-chip" data-gor="byt" data-i="' + i + '" title="' + esc(t('Byt')) + '">' + kbd(a) + '</button>' +
        '<button type="button" class="anp-kort-x" data-gor="tabort" data-i="' + i + '" aria-label="' + esc(t('Ta bort') + ' ' + visaText(a)) + '" title="' + esc(t('Ta bort')) + '">' + ikon('stang') + '</button></span>';
    });
    if (b.length < 4) h += '<button type="button" class="anp-kort-plus" data-gor="ny" aria-label="' + esc(t('Lägg till kortkommando för') + ' ' + t(k ? k.namn : '')) + '" title="' + esc(t('Lägg till')) + '">' + ikon('plus') + '</button>';
    h += '</div>';
    if (andrad(id)) h += '<button type="button" class="anp-kort-lank anp-kort-std" data-gor="std" title="' + esc(t('Tillbaka till det som gällde från början')) + '">' + esc(t('Standard')) + '</button>';
    return h;
  }
  function ritaRad(id) {
    const rad = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"]'); if (!rad) return;
    const txt = rad.querySelector('.set-txt'), ik = rad.querySelector('.anp-kort-ikon');
    rad.innerHTML = (ik ? ik.outerHTML : '') + (txt ? txt.outerHTML : '') + radKombos(id);
    rad.classList.toggle('spelar', !!(insp && insp.id === id));
  }
  function filtrera() {
    const rot = el('anp-kortkommandon'); if (!rot) return;
    const q = norm(filter.trim()); let nagon = false;
    rot.querySelectorAll('#anp-kort-lista .anp-kort-grupp').forEach((g) => {
      let syns = false;
      g.querySelectorAll('.anp-kort-rad').forEach((rad) => {
        const k = kommandon.get(rad.dataset.id); if (!k) return;
        const text = norm([t(k.namn), k.namn, k.sok, t(k.kat), ...bindningar(k.id).map(visaText), ...bindningar(k.id)].join(' '));
        const traff = !q || text.includes(q) || q.split(/\s+/).every((o) => text.includes(o));
        rad.hidden = !traff; if (traff) syns = true;
      });
      g.hidden = !syns; if (syns) nagon = true;
    });
    const inget = rot.querySelector('.anp-kort-inget'); if (inget) inget.hidden = nagon;
  }

  function startaInspelning(id, i) {
    if (insp && insp.id !== id) { const gammal = insp.id; insp = null; ritaRad(gammal); }
    insp = { id, i, forhand: '', fel: '', konflikt: null };
    bro.spelaIn(true);
    ritaRad(id);
    const f = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"] .anp-kort-spela');
    if (f) f.focus();
  }
  function avslutaInspelning(fokusTillbaka) {
    if (!insp) return;
    const { id, i } = insp; insp = null;
    bro.spelaIn(false);
    ritaRad(id);
    if (fokusTillbaka) {
      const rad = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"]');
      const m = rad && (rad.querySelector('.anp-kort-chip[data-i="' + i + '"]') || rad.querySelector('.anp-kort-plus') || rad.querySelector('.anp-kort-chip'));
      if (m) m.focus();
    }
  }
  async function tilldela(id, i, acc, fran) {
    let l = bindningar(id);
    if (i >= 0 && i < l.length) l[i] = acc; else l.push(acc);
    l = l.filter((a, j) => l.indexOf(a) === j).slice(0, 4);
    if (fran) await spara(fran.id, bindningar(fran.id).filter((a) => a !== acc));
    await spara(id, l);
  }
  bro.onInspelning((d) => {
    if (!insp) { bro.spelaIn(false); return; }
    if (!d || typeof d !== 'object') return;
    if (d.forhand !== undefined) {
      insp.forhand = d.forhand; insp.fel = '';
      const f = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + insp.id + '"] .anp-kort-spela');
      if (f) f.innerHTML = insp.forhand ? kbd(insp.forhand) + '<span class="anp-kort-plusstreck">+ …</span>' : esc(t('Tryck på tangenterna …'));
      return;
    }
    if (d.avbryt) { avslutaInspelning(true); return; }
    if (d.taBort) {
      const { id, i } = insp;
      avslutaInspelning(true);
      if (i >= 0) spara(id, bindningar(id).filter((_a, j) => j !== i));
      return;
    }
    if (d.ogiltig) {
      insp.forhand = ''; insp.fel = t(FEL[d.fel] || FEL.form);
      if (d.fel === 'redigering' || d.fel === 'system') insp.fel = visaText(d.ogiltig) + ': ' + insp.fel;
      ritaRad(insp.id);
      const f = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + insp.id + '"] .anp-kort-spela'); if (f) f.focus();
      return;
    }
    if (d.acc && giltig(d.acc)) {
      const { id, i } = insp;
      if (bindningar(id).includes(d.acc)) { avslutaInspelning(true); return; }   // fanns redan här
      const annan = upptagen(d.acc, id);
      if (annan) {                                               // huvudprocessen har slutat spela in; frågan väntar på ett klick
        insp.konflikt = { acc: d.acc, annan }; insp.forhand = ''; insp.fel = '';
        ritaRad(id);
        const b = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"] [data-gor="byt-anda"]'); if (b) b.focus();
        return;
      }
      insp = null; bro.spelaIn(false);
      tilldela(id, i, d.acc).then(() => { ritaRad(id); fokusPaRad(id, d.acc); });
    }
  });
  function fokusPaRad(id, acc) {
    const rad = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"]'); if (!rad) return;
    const i = bindningar(id).indexOf(acc);
    const m = rad.querySelector('.anp-kort-chip[data-i="' + i + '"]') || rad.querySelector('.anp-kort-plus');
    if (m) m.focus();
  }

  // Klick i inställningarna (en lyssnare för hela delen)
  document.addEventListener('click', async (e) => {
    const knapp = e.target.closest && e.target.closest('#anp-kortkommandon [data-gor]'); if (!knapp) return;
    const gor = knapp.dataset.gor, rad = knapp.closest('.anp-kort-rad'), id = rad && rad.dataset.id;
    if (gor === 'alla') { bekraftaAlla = true; rita(); const b = document.querySelector('#anp-kortkommandon [data-gor="alla-ja"]'); if (b) b.focus(); return; }
    if (gor === 'alla-nej') { bekraftaAlla = false; rita(); return; }
    if (gor === 'alla-ja') {
      bekraftaAlla = false; if (insp) avslutaInspelning(false);
      let r; try { r = await A.aterstall('kortkommandon.'); } catch {}
      rita(); toast(r && r.ok ? 'Kortkommandona är som från början igen.' : 'Det gick inte att återställa.');
      return;
    }
    if (!id || !kommandon.has(id)) return;
    if (gor === 'byt') startaInspelning(id, Number(knapp.dataset.i));
    else if (gor === 'ny') startaInspelning(id, -1);
    else if (gor === 'avbryt') avslutaInspelning(true);
    else if (gor === 'tabort') { const i = Number(knapp.dataset.i); await spara(id, bindningar(id).filter((_a, j) => j !== i)); ritaRad(id); const m = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"] .anp-kort-plus'); if (m) m.focus(); }
    else if (gor === 'std') { if (insp) avslutaInspelning(false); await spara(id, (kommandon.get(id).std || []).slice()); ritaRad(id); }
    else if (gor === 'byt-anda' && insp && insp.konflikt) {
      const { i, konflikt } = insp; insp = null; bro.spelaIn(false);
      await tilldela(id, i, konflikt.acc, konflikt.annan);
      ritaRad(id); ritaRad(konflikt.annan.id); fokusPaRad(id, konflikt.acc);
    }
  });
  // Lämnar man raden (klick någon annanstans, Tab) avbryts inspelningen
  document.addEventListener('focusout', (e) => {
    if (!insp || !e.target.closest || !e.target.closest('#anp-kortkommandon .anp-kort-rad.spelar')) return;
    setTimeout(() => {
      if (!insp) return;
      const rad = document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + insp.id + '"]');
      if (rad && rad.contains(document.activeElement)) return;
      if (insp.konflikt) return;                                  // frågan står kvar tills man svarar
      avslutaInspelning(false);
    }, 0);
  });
  window.addEventListener('blur', () => { if (insp && !insp.konflikt) avslutaInspelning(false); });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'anp-kort-filter') { filter = e.target.value; filtrera(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'anp-kort-filter' && e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; filter = ''; filtrera(); }
  });

  /* Musgester */
  function gestFigur(m) {
    const steg = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
    let x = 0, y = 0; const p = [[0, 0]]; let forra = '';
    for (const r of m) {
      // Fram och tillbaka på samma linje ritas bredvid varandra, annars syns bara ett streck
      if (forra && steg[forra][0] === -steg[r][0] && steg[forra][1] === -steg[r][1]) { x += steg[r][1] !== 0 ? 0.5 : 0; y += steg[r][0] !== 0 ? 0.5 : 0; p.push([x, y]); }
      x += steg[r][0]; y += steg[r][1]; p.push([x, y]); forra = r;
    }
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
    const skala = 14 / Math.max(w, h, 1), ox = 12 - (w * skala) / 2, oy = 12 - (h * skala) / 2;
    const pt = p.map(([a, b]) => [ox + (a - minX) * skala, oy + (b - minY) * skala]);
    const [ex, ey] = pt[pt.length - 1], [fx, fy] = pt[pt.length - 2];
    const vx = Math.sign(ex - fx), vy = Math.sign(ey - fy);
    const spets = [[ex - vx * 4 + vy * 3.5, ey - vy * 4 + vx * 3.5], [ex, ey], [ex - vx * 4 - vy * 3.5, ey - vy * 4 - vx * 3.5]];
    const f = (l) => l.map(([a, b]) => a.toFixed(1) + ',' + b.toFixed(1)).join(' ');
    return '<svg class="anp-gest-figur" viewBox="0 0 24 24" aria-hidden="true"><circle cx="' + pt[0][0].toFixed(1) + '" cy="' + pt[0][1].toFixed(1) + '" r="1.9"/><polyline points="' + f(pt) + '"/><polyline points="' + f(spets) + '"/></svg>';
  }
  function ritaGester(barn) {
    const pa = A.get('gester.pa', false) === true, spar = A.get('gester.spar', true) !== false;
    const val = (m, nu) => {
      let h = '<option value="">' + esc(t('Ingen')) + '</option>';
      for (const kat of ordning()) {
        const l = synligaKommandon(barn).filter((k) => k.kat === kat);
        if (!l.length) continue;
        h += '<optgroup label="' + esc(t(kat)) + '">' + l.map((k) => '<option value="' + esc(k.id) + '"' + (k.id === nu ? ' selected' : '') + '>' + esc(t(k.namn)) + '</option>').join('') + '</optgroup>';
      }
      return h;
    };
    let h = '<div id="anp-kort-gester"><h3 class="set-h3">' + esc(t('Musgester')) + '</h3>' +
      '<p class="set-lead">' + esc(t('Håll ned höger musknapp på en webbsida och dra. Ett vanligt högerklick visar menyn som förut.')) + '</p>' +
      '<div class="set-row"><span class="anp-kort-ikon">' + ikon('mus') + '</span><div class="set-txt"><div class="set-title">' + esc(t('Musgester')) + '</div><div class="set-desc">' + esc(t('Till exempel dra åt vänster för att gå bakåt.')) + '</div></div>' +
        '<label class="switch"><input id="anp-gest-pa" type="checkbox"' + (pa ? ' checked' : '') + '><span class="track"></span></label></div>' +
      '<div class="set-row"><span class="anp-kort-ikon">' + ikon('spar') + '</span><div class="set-txt"><div class="set-title">' + esc(t('Visa spåret')) + '</div><div class="set-desc">' + esc(t('En tunn linje visar hur du drar och vad som händer när du släpper.')) + '</div></div>' +
        '<label class="switch"><input id="anp-gest-spar" type="checkbox"' + (spar ? ' checked' : '') + (pa ? '' : ' disabled') + '><span class="track"></span></label></div>' +
      '<div class="anp-gest-lista' + (pa ? '' : ' av') + '">';
    for (const g of info.gester) {
      const nu = A.get('gester.' + g.m, g.std);
      h += '<div class="set-row anp-gest-rad">' + gestFigur(g.m) + '<div class="set-txt"><div class="set-title">' + esc(t(g.namn)) + '</div></div>' +
        '<select class="set-select" data-gest="' + esc(g.m) + '" aria-label="' + esc(t('Musgest') + ': ' + t(g.namn)) + '">' + val(g.m, typeof nu === 'string' ? nu : '') + '</select></div>';
    }
    h += '</div></div>';
    return h;
  }
  document.addEventListener('change', async (e) => {
    const x = e.target; if (!x || !x.closest || !x.closest('#anp-kortkommandon')) return;
    let r;
    if (x.id === 'anp-gest-pa') r = await A.set('gester.pa', x.checked ? true : undefined, x.checked ? 'Musgester på' : 'Musgester av');
    else if (x.id === 'anp-gest-spar') r = await A.set('gester.spar', x.checked ? undefined : false, x.checked ? 'Visa spåret för musgester' : 'Dölj spåret för musgester');
    else if (x.dataset.gest) {
      const g = info.gester.find((q) => q.m === x.dataset.gest); if (!g) return;
      r = await A.set('gester.' + g.m, x.value === g.std ? undefined : x.value, 'Musgest: ' + g.namn);
    } else return;
    if (r && r.ok === false) { toast(r.error === 'barnlast' ? 'Det här går inte att ändra i barnläge.' : 'Det gick inte att spara.'); rita(); }
  });

  // Ritas när Anpassa-panelen visas, och om när något ändras (även från ett annat fönster eller via Ångra)
  const synlig = () => { const r = el('anp-kortkommandon'); return !!(r && r.offsetParent !== null); };
  document.addEventListener('anpassa:visa', () => { bekraftaAlla = false; rita(); });
  A.on('kortkommandon.', (nyckel) => {
    if (!synlig()) return;
    const id = String(nyckel).slice('kortkommandon.'.length);
    if (insp && insp.id === id) return;
    if (document.querySelector('#anp-kortkommandon .anp-kort-rad[data-id="' + id + '"]')) { ritaRad(id); filtrera(); } else rita();
  });
  A.on('gester.', () => {
    if (!synlig()) return;
    const g = el('anp-kort-gester'); if (!g) return;
    const fokus = document.activeElement && document.activeElement.id;
    const ny = document.createElement('div'); ny.innerHTML = ritaGester(barnLage());
    g.replaceWith(ny.firstElementChild);
    if (fokus && el(fokus)) el(fokus).focus();
  });

  /* ────────── För andra delar av skalet ────────── */
  window.AnpassaKortkommandon = {
    // Lägg till ett eget kommando: det får en rad i inställningarna, syns i paletten och kan få ett kortkommando.
    registrera(def) {
      if (!def || typeof def.kor !== 'function') return false;
      const id = String(def.id || '');
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || (kommandon.has(id) && !extraKor.has(id))) return false;
      const kat = info.kategorier.includes(def.kategori) ? def.kategori : 'AdRaze';
      const std = (Array.isArray(def.standard) ? def.standard : []).filter(giltig).slice(0, 2);
      kommandon.set(id, { id, namn: String(def.namn || id).slice(0, 60), kat, std, var: 'skal', ikon: String(def.ikon || ''), barn: !!def.barn, sok: String(def.sok || ''), extra: true, lamnar: !!def.lamnar });
      extraKor.set(id, def.kor);
      bro.extra([{ id, namn: String(def.namn || id).slice(0, 60), kat, std, ikon: String(def.ikon || ''), sok: String(def.sok || '') }]);
      if (synlig()) rita();
      return true;
    },
    oppnaPalett: () => { if (!(pal && pal.oppen)) vaxlaPalett(false); },
    kombinationer: (id) => bindningar(id).map(visaText),
  };
})();
