/* adraze://adblock – blockerarens inställningar. Pratar med huvudprocessen via window.adraze
 * (content-preload.js), som bara finns på adraze://-sidor. */
(function () {
  'use strict';
  const A = window.adraze;
  const $ = (id) => document.getElementById(id);
  const t = (s) => (window.t ? window.t(s) : s);
  if (!A) { document.body.textContent = 'Den här sidan fungerar bara i AdRaze.'; return; }

  const NIVA = {
    enkel: 'Blockerar reklam och spårare från andra sajter. Minst risk att någon sida går sönder.',
    medium: 'Rekommenderas. Blockerar reklam, spårare, popups och kakrutor med alla filterlistor.',
    aggressiv: 'Tar i hårdare: blockerar även inskjutna reklamskript, fler spårare och irritationsmoment, och stoppar sidor som försöker skicka dig vidare till en annan sajt utan att du klickat. Vissa sidor kan behöva lite hjälp.',
  };
  let st = null;

  function tema(x) {
    document.documentElement.dataset.theme = x === 'dark' ? 'dark' : 'light';
    $('mark').src = x === 'dark' ? 'adraze-mark-dark.png' : 'adraze-mark.png';
  }
  tema(A.boot().tema);
  A.onTema(tema);

  const tal = (n) => (n || 0).toLocaleString(document.documentElement.lang || 'sv');
  function sedan(ms) {
    if (!ms) return t('aldrig');
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return t('nyss');
    if (m < 60) return m + ' ' + t('min sedan');
    const h = Math.round(m / 60);
    if (h < 48) return h + ' ' + t('tim sedan');
    return Math.round(h / 24) + ' ' + t('dagar sedan');
  }
  function storlek(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB'; }

  function rita() {
    const p = st.prefs;
    document.body.classList.toggle('av', !st.pa);
    $('pa').checked = st.pa;
    $('status').textContent = st.pa
      ? tal(st.antal) + ' ' + t('filter aktiva') + ' · ' + t('listorna uppdaterade') + ' ' + sedan(st.senast)
      : t('AdRaze är avstängd. Ingenting blockeras.');
    for (const b of $('niva').children) { const on = b.dataset.v === p.niva; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
    $('niva-beskr').textContent = t(NIVA[p.niva] || '');
    for (const el of document.querySelectorAll('[data-k]')) {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!p[k]; else if (document.activeElement !== el) el.value = p[k];
    }
    // Aggressiv innehåller JS-injiceringsskyddet
    const inj = document.querySelector('[data-k="injektioner"]');
    inj.checked = p.injektioner || p.niva === 'aggressiv'; inj.disabled = p.niva === 'aggressiv';
    for (const el of document.querySelectorAll('[data-social]')) el.checked = p.social[el.dataset.social] !== false;
    $('https').checked = !!st.https;
    if (document.activeElement !== $('kontakt')) $('kontakt').value = p.kontakt || '';
    if (document.activeElement !== $('egna') && !$('egna').dataset.andrad) $('egna').value = p.egna || '';
    $('listor-status').textContent = t('Senast uppdaterad') + ' ' + sedan(st.senast);
    ritaListor(); ritaElement();
  }

  function ritaListor() {
    for (const g of ['bas', 'extra', 'region']) {
      const box = $('listor-' + g); box.textContent = '';
      for (const l of st.listor.filter((x) => x.grupp === g)) {
        const rad = document.createElement('label'); rad.className = 'rad';
        const txt = document.createElement('div'); txt.className = 'txt';
        const ti = document.createElement('div'); ti.className = 'titel'; ti.textContent = t(l.namn);
        if (l.viaAggressiv) { const s = document.createElement('span'); s.className = 'tagg'; s.textContent = t('Aggressiv'); ti.appendChild(s); }
        else if (l.pa && !l.finns) { const s = document.createElement('span'); s.className = 'tagg grå'; s.textContent = t('Hämtas…'); ti.appendChild(s); }
        const be = document.createElement('div'); be.className = 'beskr'; be.textContent = t(l.beskr) + (l.finns ? ' · ' + storlek(l.storlek) : '');
        txt.append(ti, be);
        const sw = document.createElement('span'); sw.className = 'switch';
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = l.pa;
        inp.addEventListener('change', () => A.satt('lista', { id: l.id, pa: inp.checked }).then(ladda));
        const tr = document.createElement('span'); tr.className = 'track';
        sw.append(inp, tr); rad.append(txt, sw); box.appendChild(rad);
      }
    }
  }

  function ritaElement() {
    const box = $('element'); box.textContent = '';
    const e = st.prefs.element || {};
    const rader = [];
    for (const [host, lista] of Object.entries(e)) for (const sel of lista) rader.push([host, sel]);
    if (!rader.length) {
      const d = document.createElement('div'); d.className = 'tom'; d.textContent = t('Inga än. Högerklicka på något på en sida och välj "Blockera element".');
      box.appendChild(d); box.style.display = 'block'; return;
    }
    for (const [host, sel] of rader) {
      const rad = document.createElement('div'); rad.className = 'rad';
      const txt = document.createElement('div'); txt.className = 'txt';
      const ti = document.createElement('div'); ti.className = 'titel'; ti.textContent = host;
      const s = document.createElement('div'); s.className = 'sel'; s.textContent = sel; s.title = sel;
      txt.append(ti, s);
      const x = document.createElement('button'); x.className = 'ta-bort'; x.textContent = '×'; x.title = t('Visa igen');
      x.addEventListener('click', () => A.taBortElement(host, sel).then(ladda));
      rad.append(txt, x); box.appendChild(rad);
    }
  }

  async function ladda() { st = await A.hamta(); if (st) rita(); }

  // ── Händelser ──
  $('pa').addEventListener('change', (e) => A.pa(e.target.checked).then(ladda));
  for (const b of $('niva').children) b.addEventListener('click', () => A.satt('niva', b.dataset.v).then(ladda));
  for (const el of document.querySelectorAll('[data-k]')) {
    el.addEventListener('change', () => A.satt(el.dataset.k, el.type === 'checkbox' ? el.checked : el.value).then(ladda));
  }
  for (const el of document.querySelectorAll('[data-social]')) {
    el.addEventListener('change', () => A.satt('social', { [el.dataset.social]: el.checked }).then(ladda));
  }
  $('https').addEventListener('change', (e) => A.https(e.target.checked).then(ladda));
  $('kontakt').addEventListener('change', () => A.satt('kontakt', $('kontakt').value).then(ladda));

  $('uppdatera').addEventListener('click', async () => {
    const b = $('uppdatera'); b.disabled = true; b.textContent = t('Uppdaterar…');
    try {
      const r = await A.uppdatera();
      if (r) { st = r; rita(); $('listor-status').textContent = r.nya ? r.nya + ' ' + t('listor hade nya filter') : t('Alla listor är redan senaste versionen'); }
    } finally { b.disabled = false; b.textContent = t('Uppdatera nu'); }
  });

  $('egna').addEventListener('input', () => { $('egna').dataset.andrad = '1'; $('egna-status').textContent = t('Inte sparat'); });
  $('egna-spara').addEventListener('click', async () => {
    await A.satt('egna', $('egna').value);
    delete $('egna').dataset.andrad;
    $('egna-status').textContent = t('Sparat. Gäller från nästa sidladdning.');
    ladda();
  });

  $('rapport-oppna').addEventListener('click', () => { $('rapport').hidden = false; $('rapport-url').focus(); });
  $('rapport-avbryt').addEventListener('click', () => { $('rapport').hidden = true; $('rapport-status').textContent = ''; });
  $('rapport-skicka').addEventListener('click', async () => {
    const b = $('rapport-skicka'); b.disabled = true; $('rapport-status').textContent = t('Skickar…');
    try {
      const r = await A.rapport({ url: $('rapport-url').value, text: $('rapport-text').value, mejl: $('kontakt').value });
      if (r && r.ok) { $('rapport-status').textContent = t('Tack! Ärende') + ' ' + (r.nr || '') + ' ' + t('skickat. Vi mejlar dig.'); $('rapport-text').value = ''; ladda(); }
      else $('rapport-status').textContent = t((r && r.fel) || 'Det gick inte att skicka just nu.');
    } finally { b.disabled = false; }
  });

  A.onAndrat(ladda);
  ladda();
  setInterval(() => { if (st) $('listor-status').textContent = t('Senast uppdaterad') + ' ' + sedan(st.senast); }, 60000);
})();
