// Anpassa → inställningar per sajt, skalets del. Huvudprocessen: ../anpassa-sajt.js, panelen: sajtpanel.html.
//  • Skölden till vänster i adressfältet öppnar sajt-panelen för fliken du tittar på.
//  • En sajt med ljudet av visas som tystad på fliken.
//  • Inställningar → Anpassa (#anp-sajt): alla sajter med egna inställningar, med sök och ta bort.
// Laddas före shell.js; skalets funktioner (active, byId, renderTabs, openSettings …) används först när något händer.
(function () {
  const A = window.Anpassa, B = window.anpassaSajt;
  if (!A || !B) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tx = (x, v) => (typeof window.t === 'function' ? window.t(x, v) : (v ? String(x).replace(/\{([a-z]\w*)\}/g, (m, n) => (v[n] != null ? String(v[n]) : m)) : x));
  const aktiv = () => { try { return typeof active !== 'undefined' ? active : null; } catch { return null; } };
  const toast = (m) => { try { if (typeof showToast === 'function') showToast(m); } catch {} };

  /* ── 1. Skölden öppnar sajt-panelen ── */
  const sk = $('shield');
  function oppna() {
    const t = aktiv(); if (!t || !t.url || !/^https?:/i.test(t.url)) return;
    const r = sk.getBoundingClientRect(), o = ($('omnibox') || sk).getBoundingClientRect();
    B.oppna({ flik: t.id, x: Math.round(r.left), y: Math.round(o.bottom), tema: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      favicon: typeof t.favicon === 'string' ? t.favicon : '' });
  }
  if (sk) {
    // Startsidan har ingen sajt: då är skölden bara en ikon (skalet byter klass på den, se setShield)
    const synka = () => {
      const pa = !sk.classList.contains('shield-home');
      sk.tabIndex = pa ? 0 : -1;
      if (pa) { sk.setAttribute('role', 'button'); sk.title = tx('Inställningar för sajten'); sk.setAttribute('aria-label', tx('Inställningar för sajten')); }
      else { sk.removeAttribute('role'); sk.removeAttribute('title'); sk.removeAttribute('aria-label'); }
    };
    synka();
    new MutationObserver(synka).observe(sk, { attributes: true, attributeFilter: ['class'] });
    sk.addEventListener('click', oppna);
    sk.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); oppna(); } });
  }

  /* ── 2. Tystad sajt: fliken visar det (huvudprocessen skickar flikens verkliga läge) ── */
  B.onLjud((flik, tyst) => {
    try {
      const t = typeof byId === 'function' ? byId(flik) : null;
      if (t && !!t.muted !== tyst) { t.muted = tyst; if (typeof renderTabs === 'function') renderTabs(); }
    } catch {}
  });

  /* ── 3. "Alla sajter" i panelen: Inställningar → Anpassa, framrullat till listan ── */
  B.onVisaAlla(() => {
    try { openSettings(); showSettingsCat('anpassa'); } catch {}
    setTimeout(() => { const el = $('anp-sajt'); if (el) { el.scrollIntoView({ block: 'start' }); const f = el.querySelector('input'); if (f) f.focus({ preventScroll: true }); } }, 80);
  });

  /* ── 4. Listan i Inställningar → Anpassa ── */
  const host = $('anp-sajt');
  const arObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function poster() {
    const varden = A.alla(); const skydd = arObj(varden['sajt.skydd']) ? varden['sajt.skydd'] : {};
    const m = new Map();
    for (const [k, v] of Object.entries(varden)) {
      if (!k.startsWith('sajt.') || k === 'sajt.skydd' || !arObj(v)) continue;
      m.set(k.slice(5), { dom: k.slice(5), u: v, s: {} });
    }
    for (const [dom, s] of Object.entries(skydd)) { if (!arObj(s)) continue; const p = m.get(dom) || { dom, u: {}, s: {} }; p.s = s; m.set(dom, p); }
    return [...m.values()].map((p) => ({ ...p, delar: delar(p) })).filter((p) => p.delar.length).sort((a, b) => a.dom.localeCompare(b.dom, 'sv'));
  }
  // Vad sajten har ändrat, i läsbar form. last = barnlåst del.
  function delar(p) {
    const ut = []; const z = Number(p.u.zoom);
    if (z >= 0.25 && z <= 5) ut.push({ t: 'Zoom {n} %', v: { n: Math.round(z * 100) } });
    if (p.u.mork === true) ut.push({ t: 'Mörkt läge' });
    if (p.u.ljud === false) ut.push({ t: 'Ljud av' });
    if (p.s.reklam === false) ut.push({ t: 'Reklamblockering av', last: true });
    if (p.s.js === false) ut.push({ t: 'JavaScript av', last: true });
    if (p.s.popup === 'tillat') ut.push({ t: 'Popup-fönster tillåtna', last: true });
    if (p.s.popup === 'blockera') ut.push({ t: 'Popup-fönster blockerade', last: true });
    return ut;
  }
  let filter = '';
  async function taBort(dom) {
    const etikett = tx('Ta bort {x}', { x: dom });
    await A.set('sajt.' + dom, undefined, etikett);
    const sk2 = A.get('sajt.skydd');
    if (arObj(sk2) && sk2[dom]) {
      const ny = { ...sk2 }; delete ny[dom];
      const r = await A.set('sajt.skydd', Object.keys(ny).length ? ny : undefined, etikett);
      if (r && r.error === 'barnlast') toast(tx('Reklam, JavaScript och popup-fönster är låsta i barnläge.'));
    }
  }
  // Raderna ritas om vid varje sökning (dolda rader skulle bryta grupperingen av .set-row)
  function ritaRader(lista, barn) {
    const box = host.querySelector('.anps-lista'); if (!box) return;
    const f = filter.trim().toLowerCase();
    const syns = f ? lista.filter((p) => p.dom.includes(f)) : lista;
    box.innerHTML = '';
    for (const p of syns) {
      const rad = document.createElement('div'); rad.className = 'set-row anps-rad'; rad.dataset.dom = p.dom;
      const baraLast = barn && p.delar.every((x) => x.last);
      rad.innerHTML = '<span class="anps-ikon" aria-hidden="true">' + esc(p.dom.charAt(0)) + '</span>'
        + '<div class="set-txt"><div class="set-title" translate="no">' + esc(p.dom) + '</div><div class="set-desc">'
        + p.delar.map((x) => '<span class="anps-del' + (x.last && barn ? ' last' : '') + '"' + (x.last && barn ? ' title="' + esc(tx('Gäller inte i barnläge')) + '"' : '') + '>' + esc(tx(x.t, x.v)) + '</span>').join('') + '</div></div>'
        + '<button type="button" class="anps-bort"' + (baraLast ? ' disabled title="' + esc(tx('Låst i barnläge')) + '"' : '') + ' aria-label="' + esc(tx('Ta bort {x}', { x: p.dom })) + '">' + esc(tx('Ta bort')) + '</button>';
      rad.querySelector('.anps-bort').addEventListener('click', () => taBort(p.dom));
      box.appendChild(rad);
    }
    const inga = host.querySelector('.anps-ingen'); if (inga) inga.hidden = syns.length > 0;
  }
  function rita() {
    if (!host) return;
    const barn = A.barnlage();
    const lista = poster();
    const hadeFokus = document.activeElement && document.activeElement.id === 'anps-sok';
    host.innerHTML = '<h3 class="set-h3">' + esc(tx('Inställningar per sajt')) + '</h3>'
      + '<p class="set-lead">' + esc(tx('Zoom, mörkt läge, ljud, JavaScript, reklam och popup-fönster för en viss sajt. Ändra dem med skölden till vänster i adressfältet.')) + '</p>'
      + (barn ? '<p class="anp-not">' + esc(tx('Barnläge: reklam, JavaScript och popup-fönster per sajt är låsta och gäller inte just nu.')) + '</p>' : '')
      + (lista.length ? '<label class="anps-sok"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
        + '<input id="anps-sok" type="search" spellcheck="false" autocomplete="off" placeholder="' + esc(tx('Sök sajt')) + '" aria-label="' + esc(tx('Sök sajt')) + '"></label>' : '')
      + '<div class="anps-lista"></div>'
      + (lista.length ? '<p class="anps-tom anps-ingen" hidden>' + esc(tx('Ingen sajt matchar.')) + '</p>' : '<p class="anps-tom">' + esc(tx('Inga sajter har egna inställningar än.')) + '</p>');
    const s = $('anps-sok');
    if (s) { s.value = filter; s.addEventListener('input', () => { filter = s.value; ritaRader(lista, barn); }); if (hadeFokus) s.focus(); }
    ritaRader(lista, barn);
  }
  const synlig = () => !!(host && host.offsetParent);
  document.addEventListener('anpassa:visa', rita);
  A.on('sajt.', () => { if (synlig()) rita(); });
})();
