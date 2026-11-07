// Anpassa: sidopanel med webbappar – skalets del.
// Listen med appikoner vid fönstrets kant, panelens ram (huvud, behörighetsfråga, plats för webbvyn,
// "Lägg till app" och draghandtaget) och sektionen i Inställningar › Anpassa. Själva webbsidorna är egna
// vyer i huvudprocessen (../anpassa-sidopanel.js) som ritas OVANPÅ skalet – därför skickas platshållarens
// mått dit så fort de ändras, och vyn döljs när något av skalet (sökförslag, rutor) hamnar över den.
// Värdena ligger i Anpassa-butiken (sidopanel.visa, sidopanel.sida, sidopanel.appar) och är barnlåsta.
(function () {
  'use strict';
  const bro = window.anpassaSidopanel, A = window.Anpassa;
  const rad = document.getElementById('sp-rad'), views = document.getElementById('views');
  if (!bro || !A || !rad || !views) return;
  const INKOGNITO = new URLSearchParams(location.search).has('incognito');
  const tt = (s) => (typeof window.t === 'function' ? window.t(s) : s);
  const MIN_B = 280, MAX_B = 960, WEBB_MIN = 360, MAX_APPAR = 24;
  const FORSLAG = [
    { namn: 'Spotify', url: 'https://open.spotify.com/' },
    { namn: 'WhatsApp', url: 'https://web.whatsapp.com/' },
    { namn: 'Messenger', url: 'https://www.messenger.com/' },
    { namn: 'Google Kalender', url: 'https://calendar.google.com/' },
    { namn: 'YouTube Music', url: 'https://music.youtube.com/' },
    { namn: 'ChatGPT', url: 'https://chatgpt.com/' },
  ];
  const BEHORIGHET = { camera: 'Kamera', microphone: 'Mikrofon', geolocation: 'Plats', notifications: 'Notiser', 'clipboard-read': 'Läsa urklipp', midi: 'MIDI-enheter', external: 'Öppna ett annat program' };
  const FARGER = ['#0e2a47', '#ff4b1f', '#2f9e67', '#1d4a76', '#cf9128', '#2a5c8f', '#d64b45', '#45454b'];

  const S = { tillaten: false, barn: false, ikoner: {}, laddade: {}, oppen: null, lagg: false, fragor: [], skymd: false, senYta: '', dragBredd: 0 };

  /* ── Hjälpare ── */
  const lista = () => { const l = A.get('sidopanel.appar', []); return Array.isArray(l) ? l.filter((a) => a && a.id && a.url) : []; };
  const appAv = (id) => (id ? lista().find((a) => a.id === id) || null : null);
  const visas = () => !INKOGNITO && S.tillaten && A.get('sidopanel.visa', true) !== false;
  const hoger = () => A.get('sidopanel.sida', 'vanster') === 'hoger';
  const mork = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const vard = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const namnAv = (a) => (a && (a.namn || vard(a.url))) || '';
  const nyttId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const farg = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return FARGER[h % FARGER.length]; };
  const toast = (m) => { try { if (typeof window.showToast === 'function') window.showToast(m); } catch {} };
  const svg = (id, kl) => '<svg class="ic ' + (kl || 'ic-sm') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  // Det användaren skrev → en http(s)-adress, eller tom (aldrig javascript:, file:, data: …)
  function normUrl(raw) {
    let s = String(raw || '').trim();
    if (!s || s.length > 2048 || /\s/.test(s)) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      if (/^(javascript|data|file|about|blob|mailto|tel|chrome|adraze|view-source|vbscript):/i.test(s)) return '';
      s = 'https://' + s;
    }
    try {
      const u = new URL(s);
      if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname || u.username || u.password) return '';
      if (!u.hostname.includes('.') && u.hostname !== 'localhost' && !u.hostname.startsWith('[')) return '';
      return u.href;
    } catch { return ''; }
  }
  // "open.spotify.com" → "Spotify" (förslag till namn när man inte skriver något)
  function namnForslag(url) { const d = vard(url).split('.'); const b = d.length > 1 ? d[d.length - 2] : d[0] || ''; return b ? b.charAt(0).toUpperCase() + b.slice(1) : ''; }
  function ikonEl(a) {
    const png = S.ikoner[a.id];
    if (png) { const i = document.createElement('img'); i.className = 'sp-bild'; i.alt = ''; i.draggable = false; i.src = png; return i; }
    const m = document.createElement('span'); m.className = 'sp-mono'; m.setAttribute('aria-hidden', 'true'); m.setAttribute('translate', 'no');
    m.textContent = ([...namnAv(a)][0] || '?').toUpperCase(); m.style.background = farg(vard(a.url) || a.id);
    return m;
  }

  /* ── Byggs direkt (listen syns först när tillståndet är hämtat) ── */
  document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true">'
    + '<symbol id="sp-i-ut" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></symbol>'
    + '<symbol id="sp-i-mer" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" style="fill:currentColor;stroke:none"/><circle cx="12" cy="12" r="1.4" style="fill:currentColor;stroke:none"/><circle cx="19" cy="12" r="1.4" style="fill:currentColor;stroke:none"/></symbol>'
    + '<symbol id="sp-i-ljud" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></symbol>'
    + '<symbol id="sp-i-tyst" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></symbol>'
    + '<symbol id="sp-i-upp" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></symbol>'
    + '<symbol id="sp-i-ned" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol></svg>');

  const list = document.createElement('nav');
  list.id = 'sp-list'; list.setAttribute('aria-label', 'Sidopanel');
  list.innerHTML = '<div class="sp-appar" role="toolbar" aria-orientation="vertical"></div>'
    + '<button type="button" class="sp-plus" title="Lägg till app" aria-label="Lägg till app">' + svg('i-plus', '') + '</button>';
  const panel = document.createElement('section');
  panel.id = 'sp-panel'; panel.setAttribute('aria-label', 'Webbapp');
  panel.innerHTML = '<div class="sp-kol">'
    + '<header class="sp-huvud"><span class="sp-h-ikon" aria-hidden="true"></span>'
    + '<div class="sp-h-txt"><b class="sp-h-namn" translate="no"></b><small class="sp-h-adr" translate="no"></small></div>'
    + '<button type="button" class="sp-hk" data-g="bakat" title="Tillbaka">' + svg('i-back') + '</button>'
    + '<button type="button" class="sp-hk" data-g="ladda-om" title="Läs in igen">' + svg('i-reload') + '</button>'
    + '<button type="button" class="sp-hk" data-g="flik" title="Öppna i ny flik">' + svg('sp-i-ut') + '</button>'
    + '<button type="button" class="sp-hk" data-g="meny" title="Fler val">' + svg('sp-i-mer') + '</button>'
    + '<button type="button" class="sp-hk" data-g="stang" title="Stäng panelen">' + svg('i-close') + '</button>'
    + '<i class="sp-laddar" aria-hidden="true"></i></header>'
    + '<div class="sp-fraga" role="alertdialog" hidden><div class="sp-f-txt"><b translate="no"></b><small></small></div>'
    + '<div class="sp-f-rad"><label class="sp-f-kom"><input type="checkbox"><span>Kom ihåg</span></label>'
    + '<button type="button" class="sp-f-nej">Neka</button><button type="button" class="sp-f-ja sp-liq">Tillåt</button></div></div>'
    + '<div id="sp-vy" class="sp-vy"></div>'
    + '<div class="sp-lagg-yta" hidden></div>'
    + '</div><div class="sp-drag" role="separator" aria-orientation="vertical" aria-label="Panelens bredd" tabindex="0"></div>';
  rad.insertBefore(panel, views);
  rad.insertBefore(list, panel);
  const apparEl = list.querySelector('.sp-appar');
  const vy = panel.querySelector('#sp-vy');
  const laggYta = panel.querySelector('.sp-lagg-yta');
  const fragaEl = panel.querySelector('.sp-fraga');
  const dragEl = panel.querySelector('.sp-drag');

  /* ── Bredd och placering ── */
  function bredd(a) {
    const max = Math.max(MIN_B, Math.min(MAX_B, innerWidth - list.offsetWidth - WEBB_MIN));
    const b = S.dragBredd || (a && a.bredd) || (a && a.mobil ? 380 : 440);
    return Math.max(MIN_B, Math.min(max, Math.round(b)));
  }
  let layoutRaf = 0;
  function layout() {
    const vis = visas();
    if (!vis) { S.oppen = null; S.lagg = false; }
    if (S.oppen && !appAv(S.oppen)) S.oppen = null;                    // appen togs bort
    rad.classList.toggle('sp-pa', vis);
    rad.classList.toggle('sp-hoger', hoger());
    const panelPa = vis && (!!S.oppen || S.lagg);
    rad.classList.toggle('sp-panel-pa', panelPa);
    panel.classList.toggle('sp-lagg-lage', S.lagg && !S.oppen);
    vy.hidden = !S.oppen; laggYta.hidden = !(S.lagg && !S.oppen);
    if (panelPa) panel.style.width = bredd(appAv(S.oppen)) + 'px';
    list.querySelector('.sp-plus').classList.toggle('oppen', S.lagg && !S.oppen);
    // Positionen kan ändras utan att storleken gör det (byte av sida) → skicka måtten efter layouten
    if (!layoutRaf) layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      const hb = vis && hoger() ? Math.max(0, Math.round(innerWidth - views.getBoundingClientRect().right)) : 0;
      document.documentElement.style.setProperty('--sp-hb', hb + 'px');           // notiserna uppe till höger flyttar in
      document.body.classList.toggle('sp-hoger-pa', hb > 0);
      try { if (typeof window.sendBounds === 'function') window.sendBounds(); } catch {}
      skickaYta(); kollaSkymd();
    });
  }
  const ytaNyckel = (r) => [r.x, r.y, r.width, r.height].map(Math.round).join(',');
  function skickaYta() {
    if (!S.oppen) return;
    const r = vy.getBoundingClientRect(); const k = ytaNyckel(r);
    if (k === S.senYta) return;
    S.senYta = k;
    bro.yta({ x: r.x, y: r.y, width: r.width, height: r.height });
  }
  // Webbytan (#views) krymper när panelen öppnas: flikens vy ska följa med. Platshållaren: panelens vy.
  try { new ResizeObserver(() => { try { if (typeof window.sendBounds === 'function') window.sendBounds(); } catch {} }).observe(views); } catch {}
  try { new ResizeObserver(() => skickaYta()).observe(vy); } catch {}
  window.addEventListener('resize', () => { if (S.oppen || S.lagg) layout(); });

  /* ── Skymd: skalets egna rutor ritas under webbvyerna – dölj panelens vy när en sådan hamnar över den ── */
  let skymdRaf = 0;
  const schemaSkymd = () => { if (!skymdRaf) skymdRaf = requestAnimationFrame(() => { skymdRaf = 0; kollaSkymd(); }); };
  function kollaSkymd() {
    let sk = false;
    if (S.oppen) {
      const v = vy.getBoundingClientRect();
      const kolla = (el) => {
        if (sk || !el || !el.isConnected) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.left < v.right && r.right > v.left && r.top < v.bottom && r.bottom > v.top) sk = true;
      };
      ['omni-suggest', 'closeconf', 'dlthreat', 'kidblock'].forEach((id) => kolla(document.getElementById(id)));
      document.querySelectorAll('body > .notis').forEach(kolla);
    }
    if (sk !== S.skymd) { S.skymd = sk; bro.skymd(sk); }
  }
  try {
    const mo = new MutationObserver(schemaSkymd);
    mo.observe(document.body, { childList: true });
    for (const id of ['omni-suggest', 'closeconf', 'dlthreat']) { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] }); }
  } catch {}

  /* ── Öppna / stäng ── */
  function oppna(id) {
    const a = appAv(id);
    if (!a || !visas()) return;
    S.oppen = id; S.lagg = false; S.dragBredd = 0;
    layout(); ritaHuvud(); ritaFraga(); ritaList();
    const r = vy.getBoundingClientRect();
    S.senYta = ytaNyckel(r);
    bro.oppna(id, { x: r.x, y: r.y, width: r.width, height: r.height }, mork() ? '#0e0e10' : '#ffffff');
  }
  function stang() {
    if (!S.oppen && !S.lagg) return;
    const var0 = S.oppen;
    S.oppen = null; S.lagg = false; S.dragBredd = 0; S.skymd = false;
    if (var0) bro.stang();
    layout(); ritaList();
  }
  function visaLagg() {
    if (!visas()) return;
    if (S.oppen) { bro.stang(); S.oppen = null; }
    S.lagg = true; S.dragBredd = 0;
    byggLagg(laggYta, true);
    layout(); ritaHuvud(); ritaList();
    setTimeout(() => { const i = laggYta.querySelector('input[name="url"]'); if (i) i.focus(); }, 30);
  }
  function visaInstallningar() {
    try { window.openSettings(); window.showSettingsCat('anpassa'); } catch { return; }
    setTimeout(() => { const s = document.getElementById('anp-sidopanel'); if (s) s.scrollIntoView({ block: 'start' }); }, 60);
  }

  /* ── Listen ── */
  const knappar = new Map();                         // id → knapp (återanvänds: ingen blinkning vid omritning)
  function ritaList() {
    const l = lista(); const sedda = new Set();
    l.forEach((a, i) => {
      let b = knappar.get(a.id);
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'sp-app'; b.dataset.id = a.id; b.setAttribute('translate', 'no'); knappar.set(a.id, b); }
      sedda.add(a.id);
      const inf = S.laddade[a.id] || null;
      const tyst = a.ljud === false, spelar = !!(inf && inf.spelar) && !tyst;
      const nyckel = [S.ikoner[a.id] ? S.ikoner[a.id].length + S.ikoner[a.id].slice(-24) : 'm', namnAv(a), a.url, tyst ? 't' : spelar ? 's' : ''].join('|');
      if (b._nyckel !== nyckel) {
        b._nyckel = nyckel; b.textContent = '';
        const pr = document.createElement('i'); pr.className = 'sp-prick';
        const lj = document.createElement('i'); lj.className = 'sp-ljud'; lj.innerHTML = '<svg aria-hidden="true"><use href="#' + (tyst ? 'sp-i-tyst' : 'sp-i-ljud') + '"/></svg>';
        b.append(ikonEl(a), pr, lj);
      }
      const n = inf ? inf.olasta || 0 : 0, fragar = S.fragor.some((q) => q.id === a.id);
      b.title = namnAv(a) + (n ? ' (' + n + ')' : '');
      b.setAttribute('aria-label', namnAv(a) + (n ? ', ' + n + ' ' + tt('olästa') : '') + (fragar ? ', ' + tt('väntar på svar') : ''));
      b.setAttribute('aria-pressed', S.oppen === a.id ? 'true' : 'false');
      b.classList.toggle('laddad', !!inf);
      b.classList.toggle('oppen', S.oppen === a.id);
      b.classList.toggle('olast', n > 0 || fragar);
      b.classList.toggle('spelar', spelar);
      b.classList.toggle('tyst', tyst);
      if (apparEl.children[i] !== b) apparEl.insertBefore(b, apparEl.children[i] || null);
    });
    for (const [id, b] of knappar) if (!sedda.has(id)) { b.remove(); knappar.delete(id); }
    list.querySelector('.sp-plus').hidden = l.length >= MAX_APPAR;
  }
  let hoppaKlick = false;
  apparEl.addEventListener('click', (e) => {
    const b = e.target.closest('.sp-app'); if (!b) return;
    if (hoppaKlick) { hoppaKlick = false; return; }          // klicket efter en dragning
    if (S.oppen === b.dataset.id) stang(); else oppna(b.dataset.id);
  });
  apparEl.addEventListener('auxclick', (e) => { const b = e.target.closest('.sp-app'); if (b && e.button === 1) { e.preventDefault(); bro.gor(b.dataset.id, 'flik'); } });   // mittenklick: ny flik
  list.addEventListener('contextmenu', (e) => { e.preventDefault(); const b = e.target.closest('.sp-app'); bro.meny(b ? b.dataset.id : null); });
  list.querySelector('.sp-plus').addEventListener('click', () => { if (S.lagg && !S.oppen) stang(); else visaLagg(); });
  // Tangentbord: pil upp/ned mellan ikonerna, Alt+pil flyttar appen
  apparEl.addEventListener('keydown', async (e) => {
    const b = e.target.closest('.sp-app'); if (!b || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const kn = [...apparEl.children], i = kn.indexOf(b), j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (e.altKey) {
      if (j < 0 || j >= kn.length) return;
      const l = lista(); const [x] = l.splice(i, 1); l.splice(j, 0, x);
      await A.set('sidopanel.appar', l, 'Ändrade ordningen i sidopanelen');
      const nb = knappar.get(b.dataset.id); if (nb) nb.focus();
    } else if (kn[j]) kn[j].focus();
    else if (j >= kn.length) list.querySelector('.sp-plus').focus();
  });
  // Dra en ikon upp/ned för att byta ordning
  let dra = null;
  apparEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.sp-app'); if (!b || e.button !== 0) return;
    dra = { b, y0: e.clientY, pid: e.pointerId, aktiv: false };
  });
  apparEl.addEventListener('pointermove', (e) => {
    if (!dra || e.pointerId !== dra.pid) return;
    const dy = e.clientY - dra.y0;
    if (!dra.aktiv) {
      if (Math.abs(dy) < 6) return;
      const kn = [...apparEl.children];
      dra.aktiv = true; dra.fran = kn.indexOf(dra.b); dra.till = dra.fran;
      dra.mitt = kn.map((k) => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; });
      dra.steg = kn.length > 1 ? dra.mitt[1] - dra.mitt[0] : dra.b.offsetHeight;
      try { dra.b.setPointerCapture(dra.pid); } catch {}
      apparEl.classList.add('sp-sorterar'); dra.b.classList.add('sp-drar');
    }
    const kn = [...apparEl.children], m = dra.mitt, f = dra.fran;
    const d = Math.max(m[0] - m[f], Math.min(m[m.length - 1] - m[f], dy));
    let t = 0; m.forEach((y, i) => { if (i !== f && y < m[f] + d) t++; });
    dra.till = t;
    kn.forEach((k, i) => {
      let s = 0;
      if (k === dra.b) s = d;
      else if (f < t && i > f && i <= t) s = -dra.steg;
      else if (t < f && i >= t && i < f) s = dra.steg;
      k.style.transform = s ? 'translateY(' + s + 'px)' : '';
    });
  });
  const slappDra = () => {
    const d = dra; dra = null;
    if (!d || !d.aktiv) return;
    hoppaKlick = true; setTimeout(() => { hoppaKlick = false; }, 0);
    apparEl.classList.remove('sp-sorterar'); d.b.classList.remove('sp-drar');
    for (const k of apparEl.children) k.style.transform = '';
    if (d.till !== d.fran) { const l = lista(); const [x] = l.splice(d.fran, 1); l.splice(d.till, 0, x); A.set('sidopanel.appar', l, 'Ändrade ordningen i sidopanelen'); }
  };
  apparEl.addEventListener('pointerup', slappDra);
  apparEl.addEventListener('pointercancel', slappDra);

  /* ── Panelens huvud ── */
  function ritaHuvud() {
    const ikon = panel.querySelector('.sp-h-ikon'), namn = panel.querySelector('.sp-h-namn'), adr = panel.querySelector('.sp-h-adr');
    ikon.textContent = '';
    if (S.lagg && !S.oppen) { namn.textContent = tt('Lägg till app'); adr.textContent = ''; panel.classList.remove('sp-laddar-nu'); return; }
    const a = appAv(S.oppen); if (!a) return;
    const inf = S.laddade[a.id] || {};
    ikon.appendChild(ikonEl(a));
    namn.textContent = namnAv(a);
    adr.textContent = vard(inf.url || a.url);
    panel.querySelector('[data-g="bakat"]').disabled = !inf.bakat;
    panel.classList.toggle('sp-laddar-nu', !!inf.laddar);
  }
  panel.querySelector('.sp-huvud').addEventListener('click', (e) => {
    const k = e.target.closest('.sp-hk'); if (!k) return;
    const g = k.dataset.g;
    if (g === 'stang') { stang(); return; }
    if (!S.oppen) return;
    if (g === 'meny') bro.meny(S.oppen); else bro.gor(S.oppen, g);
  });
  panel.querySelector('.sp-huvud').addEventListener('contextmenu', (e) => { e.preventDefault(); if (S.oppen) bro.meny(S.oppen); });

  /* ── Behörighetsfråga från appen (visas när appen är öppen; ett svar per fråga) ── */
  function ritaFraga() {
    const q = S.oppen ? S.fragor.find((x) => x.id === S.oppen) : null;
    fragaEl.hidden = !q;
    if (!q) return;
    fragaEl.dataset.qid = q.qid;
    fragaEl.querySelector('b').textContent = vard(q.origin) || q.origin;
    fragaEl.querySelector('small').textContent = tt('Vill använda') + ': ' + (q.kinds || []).map((k) => tt(BEHORIGHET[k] || k)).join(', ');
    fragaEl.querySelector('input').checked = false;
  }
  function svara(ja) {
    const qid = Number(fragaEl.dataset.qid); if (!qid) return;
    const kom = fragaEl.querySelector('input').checked;
    S.fragor = S.fragor.filter((x) => x.qid !== qid);
    bro.svar(qid, ja, kom);
    ritaFraga(); ritaList();
  }
  fragaEl.querySelector('.sp-f-ja').addEventListener('click', () => svara(true));
  fragaEl.querySelector('.sp-f-nej').addEventListener('click', () => svara(false));

  /* ── Bredden: dra i kanten (eller piltangenterna när kanten har fokus) ── */
  function sparaBredd() {
    const a = appAv(S.oppen);
    if (!a) { layout(); return; }                            // "Lägg till app": bredden gäller tills rutan stängs
    const b = bredd(a);
    S.dragBredd = 0;
    if (b !== a.bredd) A.set('sidopanel.appar', lista().map((x) => (x.id === a.id ? { ...x, bredd: b } : x)), 'Panelbredd');
    else layout();
  }
  dragEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { dragEl.setPointerCapture(e.pointerId); } catch {}
    const x0 = e.clientX, b0 = panel.getBoundingClientRect().width, dir = hoger() ? -1 : 1;
    rad.classList.add('sp-drar');
    let raf = 0, x = x0, flyttad = false;
    const satt = () => { S.dragBredd = Math.round(b0 + dir * (x - x0)); S.dragBredd = bredd(appAv(S.oppen)); };
    const flytt = (ev) => { x = ev.clientX; if (Math.abs(x - x0) > 2) flyttad = true; if (!raf) raf = requestAnimationFrame(() => { raf = 0; satt(); layout(); }); };
    const slapp = () => {
      dragEl.removeEventListener('pointermove', flytt); dragEl.removeEventListener('pointerup', slapp); dragEl.removeEventListener('pointercancel', slapp);
      rad.classList.remove('sp-drar');
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!flyttad) { if (!S.lagg) S.dragBredd = 0; layout(); return; }   // bara ett klick på kanten
      satt();
      sparaBredd();
    };
    dragEl.addEventListener('pointermove', flytt); dragEl.addEventListener('pointerup', slapp); dragEl.addEventListener('pointercancel', slapp);
  });
  let tangentTimer = null;
  dragEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const vanster = e.key === 'ArrowLeft';
    S.dragBredd = bredd(appAv(S.oppen)) + ((vanster ? -1 : 1) * (hoger() ? -1 : 1)) * 16;
    S.dragBredd = bredd(appAv(S.oppen));
    layout();
    clearTimeout(tangentTimer); tangentTimer = setTimeout(sparaBredd, 500);
  });

  /* ── "Lägg till app": i panelen och i inställningarna ── */
  async function laggTill(ny, iPanel, felEl) {
    const l = lista();
    if (l.length >= MAX_APPAR) { if (felEl) felEl.textContent = tt('Du kan ha högst 24 appar.'); return false; }
    const app = { id: nyttId(), namn: (ny.namn || namnForslag(ny.url)).slice(0, 60), url: ny.url, mobil: !!ny.mobil, ljud: true };
    const r = await A.set('sidopanel.appar', l.concat(app), 'La till ' + app.namn);
    if (!r || !r.ok) { if (felEl) felEl.textContent = r && r.error === 'barnlast' ? tt('Det går inte i barnläge.') : tt('Det gick inte att spara.'); return false; }
    if (iPanel) oppna(app.id); else toast(tt('Appen finns nu i sidopanelen.'));
    return true;
  }
  function byggLagg(rot, iPanel) {
    const knapp = iPanel ? 'sp-liq' : 'set-btn';
    rot.innerHTML = (iPanel ? '<p class="sp-form-lead">Valfri webbsida, alltid nära till hands.</p>' : '<h4>Lägg till app</h4>')
      + '<form class="sp-form" novalidate>'
      + '<label class="sp-falt sp-f-url"><span>Adress</span><input name="url" type="text" inputmode="url" placeholder="t.ex. web.whatsapp.com" autocomplete="off" spellcheck="false" maxlength="2048"></label>'
      + '<label class="sp-falt sp-f-namn"><span>Namn (valfritt)</span><input name="namn" type="text" autocomplete="off" spellcheck="false" maxlength="60"></label>'
      + '<label class="sp-kryss"><input name="mobil" type="checkbox"><span>Mobilvy</span><small>Sajtens mobilversion i en smal panel</small></label>'
      + '<div class="sp-fel" role="alert"></div>'
      + '<div class="sp-knappar"><button type="submit" class="' + knapp + '">Lägg till</button>' + (iPanel ? '<button type="button" class="sp-avbryt">Avbryt</button>' : '') + '</div>'
      + '</form><div class="sp-forslag-rubrik">Förslag</div><div class="sp-forslag"></div>';
    const form = rot.querySelector('form'), fel = rot.querySelector('.sp-fel');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = normUrl(form.elements.url.value);
      if (!url) { fel.textContent = tt('Skriv en webbadress, till exempel web.whatsapp.com.'); form.elements.url.focus(); return; }
      fel.textContent = '';
      if (await laggTill({ url, namn: form.elements.namn.value.trim(), mobil: form.elements.mobil.checked }, iPanel, fel)) form.reset();
    });
    form.elements.url.addEventListener('input', () => { fel.textContent = ''; });
    const avbryt = rot.querySelector('.sp-avbryt'); if (avbryt) avbryt.addEventListener('click', stang);
    ritaForslag(rot, iPanel);
  }
  function ritaForslag(rot, iPanel) {
    const box = rot.querySelector('.sp-forslag'); if (!box) return;
    const har = new Set(lista().map((a) => vard(a.url)));
    box.textContent = '';
    for (const f of FORSLAG) {
      if (har.has(vard(f.url))) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-chip'; b.setAttribute('translate', 'no');
      const m = document.createElement('span'); m.className = 'sp-mono'; m.setAttribute('aria-hidden', 'true'); m.textContent = f.namn[0]; m.style.background = farg(vard(f.url));
      const t = document.createElement('span'); t.textContent = f.namn;
      b.append(m, t);
      b.title = vard(f.url);
      b.addEventListener('click', () => laggTill({ namn: f.namn, url: f.url, mobil: false }, iPanel, rot.querySelector('.sp-fel')));
      box.appendChild(b);
    }
    const rub = rot.querySelector('.sp-forslag-rubrik'); if (rub) rub.hidden = !box.children.length;
  }

  /* ── Inställningar › Anpassa › Sidopanel ── */
  const inst = document.getElementById('anp-sidopanel');
  let instRitad = false;
  function ritaInst() {
    if (!inst) return;
    const a0 = document.activeElement;
    if (a0 && inst.contains(a0) && a0.matches('input[type="text"]')) { a0.addEventListener('blur', () => setTimeout(ritaInst, 0), { once: true }); return; }   // skriver: rita om efteråt
    instRitad = true;
    const barnlage = S.barn || A.barnlage();
    inst.innerHTML = '<h3 class="set-h3">Sidopanel</h3>'
      + '<p class="set-lead">Webbappar i en smal list vid fönstrets kant. Klicka på en ikon så öppnas appen bredvid sidan. Musik spelar vidare när du stänger panelen.</p>';
    if (barnlage) { inst.insertAdjacentHTML('beforeend', '<p class="sp-not">Sidopanelen är avstängd i barnläge.</p>'); return; }
    if (INKOGNITO) inst.insertAdjacentHTML('beforeend', '<p class="sp-not">Sidopanelen visas inte i inkognitofönster.</p>');
    inst.insertAdjacentHTML('beforeend',
      '<div class="set-row"><div class="set-txt"><div class="set-title">Visa sidopanelen</div><div class="set-desc">Listen med dina webbappar.</div></div>'
      + '<label class="switch flex-none"><input type="checkbox" data-sp="visa"><span class="track"></span></label></div>'
      + '<div class="set-row"><div class="set-txt"><div class="set-title">Placering</div><div class="set-desc">Vid vänster eller höger kant av fönstret.</div></div>'
      + '<div class="seg flex-none"><button type="button" class="seg-btn" data-sida="vanster">Vänster</button><button type="button" class="seg-btn" data-sida="hoger">Höger</button></div></div>'
      + '<div class="sp-inst-lista"></div><div class="sp-inst-lagg"></div>');
    const visaIn = inst.querySelector('[data-sp="visa"]');
    visaIn.checked = A.get('sidopanel.visa', true) !== false;
    visaIn.addEventListener('change', () => A.set('sidopanel.visa', visaIn.checked, visaIn.checked ? 'Visa sidopanelen' : 'Dölj sidopanelen'));
    inst.querySelectorAll('[data-sida]').forEach((b) => {
      b.classList.toggle('on', (b.dataset.sida === 'hoger') === hoger());
      b.addEventListener('click', () => A.set('sidopanel.sida', b.dataset.sida, 'Sidopanelens placering'));
    });
    ritaInstLista();
    byggLagg(inst.querySelector('.sp-inst-lagg'), false);
  }
  function ritaInstLista() {
    const box = inst && inst.querySelector('.sp-inst-lista'); if (!box) return;
    const l = lista();
    box.textContent = '';
    if (!l.length) { box.innerHTML = '<div class="sp-inst-tom">Inga appar än. Lägg till en här under eller välj ett förslag.</div>'; return; }
    const spara = (ny, etikett) => A.set('sidopanel.appar', ny, etikett);
    l.forEach((a, i) => {
      const r = document.createElement('div'); r.className = 'sp-irad'; r.dataset.id = a.id;
      r.innerHTML = '<span class="sp-irad-ikon"></span>'
        + '<div class="sp-irad-txt"><input class="sp-irad-namn" type="text" maxlength="60" aria-label="Namn" translate="no" spellcheck="false"><small translate="no"></small></div>'
        + '<label class="sp-mini"><input type="checkbox" data-f="mobil"><span>Mobilvy</span></label>'
        + '<label class="sp-mini"><input type="checkbox" data-f="ljud"><span>Ljud</span></label>'
        + '<button type="button" class="sp-ik" data-g="upp" title="Flytta upp">' + svg('sp-i-upp') + '</button>'
        + '<button type="button" class="sp-ik" data-g="ned" title="Flytta ned">' + svg('sp-i-ned') + '</button>'
        + '<button type="button" class="sp-ik sp-ik-bort" data-g="bort" title="Ta bort">' + svg('i-trash') + '</button>';
      r.querySelector('.sp-irad-ikon').appendChild(ikonEl(a));
      const nm = r.querySelector('.sp-irad-namn'); nm.value = namnAv(a);
      r.querySelector('small').textContent = a.url.replace(/^https:\/\//, '').replace(/\/$/, '');
      r.querySelector('[data-f="mobil"]').checked = !!a.mobil;
      r.querySelector('[data-f="ljud"]').checked = a.ljud !== false;
      r.querySelector('[data-g="upp"]').disabled = i === 0;
      r.querySelector('[data-g="ned"]').disabled = i === l.length - 1;
      nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); });
      nm.addEventListener('change', () => { const v = nm.value.trim().slice(0, 60); if (v && v !== a.namn) spara(lista().map((x) => (x.id === a.id ? { ...x, namn: v } : x)), 'Bytte namn på ' + namnAv(a)); else nm.value = namnAv(a); });
      r.querySelectorAll('[data-f]').forEach((c) => c.addEventListener('change', () => {
        const f = c.dataset.f;
        spara(lista().map((x) => (x.id === a.id ? { ...x, [f]: c.checked } : x)), (f === 'mobil' ? 'Mobilvy ' : 'Ljud ') + (c.checked ? 'på' : 'av'));
      }));
      r.querySelectorAll('[data-g]').forEach((k) => k.addEventListener('click', () => {
        const nu = lista(); const j = nu.findIndex((x) => x.id === a.id); if (j < 0) return;
        if (k.dataset.g === 'bort') { nu.splice(j, 1); spara(nu, 'Tog bort ' + namnAv(a)); return; }
        const t = j + (k.dataset.g === 'upp' ? -1 : 1); if (t < 0 || t >= nu.length) return;
        const [x] = nu.splice(j, 1); nu.splice(t, 0, x); spara(nu, 'Ändrade ordningen i sidopanelen');
      }));
      box.appendChild(r);
    });
  }
  document.addEventListener('anpassa:visa', ritaInst);

  /* ── Ikoner: huvudprocessen skickar sajtens råa bild, här ritas den om till en ren 64×64-PNG ── */
  function normalisera(id, data, kalla) {
    const klar = (png) => { try { bro.sparaIkon(id, png, kalla); } catch {} };
    if (typeof data !== 'string' || data.length > 300000 || !/^data:image\/(png|x-icon|gif|jpeg|webp|svg\+xml);base64,/.test(data)) { klar(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        const w = img.naturalWidth || 64, h = img.naturalHeight || 64, k = Math.min(64 / w, 64 / h);
        g.drawImage(img, (64 - w * k) / 2, (64 - h * k) / 2, w * k, h * k);
        const px = g.getImageData(0, 0, 64, 64).data; let syns = false;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 8) { syns = true; break; }
        klar(syns ? c.toDataURL('image/png') : null);           // helt genomskinlig bild = ingen ikon
      } catch { klar(null); }
    };
    img.onerror = () => klar(null);
    img.src = data;
  }

  /* ── Händelser från huvudprocessen ── */
  function allt() { layout(); ritaList(); ritaHuvud(); ritaFraga(); if (instRitad && inst && inst.isConnected) ritaInst(); }
  bro.on('tillstand', (d) => {
    if (!d) return;
    S.tillaten = !!d.tillaten; S.barn = !!d.barn;
    if (d.ikoner) S.ikoner = d.ikoner;
    if (d.laddade) S.laddade = d.laddade;
    if (!S.tillaten) { S.oppen = null; S.lagg = false; S.fragor = []; }
    allt();
  });
  bro.on('info', (id, patch) => {
    if (!patch || typeof patch !== 'object') return;
    if (patch.laddad === false) delete S.laddade[id]; else S.laddade[id] = Object.assign(S.laddade[id] || {}, patch);
    ritaList();
    if (id === S.oppen) ritaHuvud();
  });
  bro.on('ikon', (id, png) => {
    if (png) S.ikoner[id] = png; else delete S.ikoner[id];
    ritaList(); if (id === S.oppen) ritaHuvud();
    if (instRitad) ritaInstLista();
  });
  bro.on('ikon-ra', (id, data, kalla) => normalisera(id, data, kalla));
  bro.on('fraga', (q) => { if (!q || !q.qid) return; S.fragor.push(q); ritaFraga(); ritaList(); });
  bro.on('fraga-klar', (qid) => { S.fragor = S.fragor.filter((x) => x.qid !== qid); ritaFraga(); ritaList(); });
  bro.on('stangd', (id) => { if (S.oppen === id) { S.oppen = null; S.skymd = false; layout(); ritaList(); } });
  bro.on('atgard', (vad, id, namn) => {
    if (vad === 'oppna') oppna(id);
    else if (vad === 'stang') stang();
    else if (vad === 'lagg-till') visaLagg();
    else if (vad === 'installningar') visaInstallningar();
    else if (vad === 'dold') toast(tt('Sidopanelen är dold. Du får tillbaka den under Inställningar › Anpassa.'));
    else if (vad === 'borttagen') toast(tt('Appen togs bort. Ångra under Inställningar › Anpassa.'));
  });
  A.on('sidopanel.', () => {
    allt();
    if (S.lagg) ritaForslag(laggYta, true);
  });
  // Byte av ljust/mörkt läge: panelens huvud ritas om (ikonernas bakgrund följer med via CSS)
  try { new MutationObserver(() => ritaHuvud()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

  /* ── Start: när shell.js har kört (barnläget och temat är satta) ── */
  function start() {
    const d = bro.tillstand() || {};
    S.tillaten = !!d.tillaten; S.barn = !!d.barn;
    S.ikoner = d.ikoner || {}; S.laddade = d.laddade || {};
    if (d.oppen) bro.stang();                     // skalet laddades om: börja med stängd panel
    allt();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else setTimeout(start, 0);
})();
