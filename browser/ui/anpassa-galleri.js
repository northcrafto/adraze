// Anpassa: temagalleriet i fönstret. Ritar i #anp-galleri (Inställningar → Anpassa) och visar raden
// "Du provar …" ovanför webbsidan medan ett tema provas – i alla fönster, även med Inställningar stängda.
// Huvudprocessen: ../anpassa-galleri.js (anrop till adraze-api, Prova/Behåll/Ångra). Laddas före shell.js,
// så skalets funktioner (account, showToast, sendBounds, showSettingsCat) används först när något händer.
// All text från servern sätts med textContent, och färger används bara om de är hex-färger.
(function () {
  'use strict';
  const G = window.anpassaGalleri, A = window.Anpassa;
  if (!G || !A) return;

  const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const FLIKAR = [['populara', 'Populära'], ['nya', 'Nya'], ['vecka', 'Topplistan'], ['mina', 'Mina']];
  const UNDER = { populara: 'De mest gillade och använda temana.', nya: 'Senast publicerade först.', vecka: 'Veckans mest gillade teman.', mina: '' };
  const TOMT = { populara: 'Inga teman än.', nya: 'Inga teman än.', vecka: 'Inga röster den här veckan än.', mina: 'Du har inte publicerat något tema än.' };
  const IKON = {
    hjarta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-6.6-4.3-8.5-8.4C2.1 8.5 4 5 7.4 5c1.9 0 3.4 1 4.6 2.6C13.2 6 14.7 5 16.6 5 20 5 21.9 8.5 20.5 11.6 18.6 15.7 12 20 12 20z"/></svg>',
    tumme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 15H5.8a2 2 0 0 1-1.9-2.6L6 5.5A2 2 0 0 1 7.9 4H16v10.5l-3.6 5.8a1.6 1.6 0 0 1-2.9-1.1z"/><path d="M16 4h3.5v10.5H16"/></svg>',
    flagga: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 21V4"/><path d="M5.5 4.5H17l-2.2 4.25L17 13H5.5"/></svg>',
    soptunna: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9.5 7V5h5v2M6.5 7l.9 12h9.2l.9-12"/></svg>',
  };

  const st = { flik: 'populara', sida: 0, teman: [], mer: false, laddar: false, fel: '', nr: 0, pub: false, kvar: null, prov: null, barn: false };

  // ---------- hjälpare ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function knapp(cls, text, g) { const b = el('button', cls, text); b.type = 'button'; if (g) b.dataset.g = g; return b; }
  function ikonknapp(cls, ikon, etikett, g) { const b = knapp('gal-ikon ' + cls, null, g); b.innerHTML = IKON[ikon]; b.title = etikett; b.setAttribute('aria-label', etikett); return b; }
  function konto() { try { return (typeof account !== 'undefined' && account && account.token) ? account : null; } catch { return null; } }
  const token = () => (konto() || {}).token || null;
  function arBarn() { try { if (A.barnlage()) return true; } catch {} const k = konto(); return !!(k && k.isChild); }
  const vuxen = () => { const k = konto(); return !!(k && !k.isChild) && !st.barn; };
  function toast(t) { try { if (typeof showToast === 'function') showToast(t); } catch {} }
  const tal = (n) => Number(n || 0).toLocaleString('sv-SE');
  function sedan(ts) {
    const d = Math.floor((Date.now() - Number(ts || 0)) / 86_400_000);
    return d <= 0 ? 'i dag' : d === 1 ? 'i går' : d < 7 ? d + ' dagar sedan' : d < 14 ? 'förra veckan' : new Date(ts).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  }

  // ---------- färger och förhandsvisning ----------
  // Rollerna i den lilla webbläsaren gissas ur nyckelnamnen (tema.accent, tema.bakgrund …); läget ger grundfärgerna.
  const LJUS = { ram: '#e7edf4', verktyg: '#f1f5f9', flik: '#ffffff', sida: '#eef3f9', text: '#0e2a47', accent: '#ff4b1f' };
  const MORK = { ram: '#111113', verktyg: '#1b1b1e', flik: '#2a2a2f', sida: '#0e0e10', text: '#f2f2f4', accent: '#ff4b1f' };
  const ROLLER = [
    ['accent', /accent|primar|huvudfarg|markering|knapp/i],
    ['sida', /bakgrund|^bg|sida|start/i],
    ['ram', /ram|flikrad|flikfalt|chrome|titel|kant/i],
    ['verktyg', /verktyg|yta|panel|toolbar|adress|meny/i],
    ['flik', /flik|kort/i],
    ['text', /text|skrift|ink|forgrund|rubrik/i],
  ];
  function ljushet(hex) {
    const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex.slice(0, 7);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function palett(v) {
    v = v && typeof v === 'object' ? v : {};
    const p = { ...(['mork', 'morkt', 'dark'].includes(v['tema.lage']) ? MORK : LJUS) };
    const satt = new Set();
    for (const [roll, re] of ROLLER) {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'string' && HEX_RE.test(x) && re.test(k.slice(5))) { p[roll] = x; satt.add(roll); break; }
      }
    }
    // Text som syns mot sidan om temat inte säger något om texten
    if (!satt.has('text')) p.text = ljushet(p.sida) < 0.22 ? '#f2f2f4' : '#0e2a47';
    p.accentText = ljushet(p.accent) > 0.45 ? '#141416' : '#ffffff';
    return p;
  }
  const fargerAv = (v) => [...new Set(Object.values(v || {}).filter((x) => typeof x === 'string' && HEX_RE.test(x)).map((x) => x.toLowerCase()))];
  function forhand(varden, plats) {
    const p = palett(varden);
    const f = el('div', 'gp');
    f.setAttribute('aria-hidden', 'true');
    for (const [k, x] of Object.entries(p)) f.style.setProperty('--gp-' + k, x);
    const ram = el('div', 'gp-ram'); ram.append(el('i', 'gp-flik pa'), el('i', 'gp-flik'), el('i', 'gp-flik'));
    const verktyg = el('div', 'gp-verktyg'); verktyg.append(el('i', 'gp-pil'), el('i', 'gp-adress'), el('i', 'gp-knapp'));
    const sida = el('div', 'gp-sida'); sida.append(el('i', 'gp-rubrik'), el('i', 'gp-rad'), el('i', 'gp-rad kort'), el('i', 'gp-cta'));
    const prickar = el('div', 'gp-farger');
    for (const c of fargerAv(varden).slice(0, 5)) { const i = el('i'); i.style.background = c; prickar.append(i); }
    sida.append(prickar);
    f.append(ram, verktyg, sida);
    if (plats) f.append(el('span', 'gal-plats' + (plats <= 3 ? ' topp' : ''), plats));
    return f;
  }

  // ---------- kort ----------
  function roster(kort, t) {
    const g = kort.querySelector('.gal-gilla'), o = kort.querySelector('.gal-ogilla');
    if (g) {
      g.classList.toggle('pa', t.min_rost === 1); g.setAttribute('aria-pressed', String(t.min_rost === 1));
      g.title = t.min_rost === 1 ? 'Du gillar det här' : 'Gilla'; g.setAttribute('aria-label', g.title + ' (' + tal(t.gillar) + ')');
      g.querySelector('.gal-antal').textContent = tal(t.gillar);
    }
    if (o) { o.classList.toggle('pa', t.min_rost === -1); o.setAttribute('aria-pressed', String(t.min_rost === -1)); }
  }
  function kort(t) {
    const a = el('article', 'gal-kort');
    a.dataset.id = t.id;
    const provas = !!(st.prov && st.prov.id === t.id);
    a.classList.toggle('provas', provas);
    a.append(forhand(t.varden, t.plats));
    const info = el('div', 'gal-info');
    const rub = el('div', 'gal-rubrik');
    rub.append(el('span', 'gal-namn', t.namn));
    if (t.dold) rub.append(el('span', 'gal-chip dold', 'Dolt'));
    else if (t.egen) rub.append(el('span', 'gal-chip', 'Ditt'));
    info.append(rub);
    const av = ['av ' + (t.skapare || 'Anonym')];
    if (st.flik === 'nya' || st.flik === 'mina') av.push(sedan(t.skapad));
    if (t.nedladdningar > 0) av.push(tal(t.nedladdningar) + ' använder');
    info.append(el('div', 'gal-av', av.join(' · ')));
    if (t.beskrivning) info.append(el('p', 'gal-besk', t.beskrivning));
    if (t.dold) info.append(el('p', 'gal-besk gal-dold-text', 'Dolt efter anmälningar. Bara du ser det.'));
    a.append(info);
    const fot = el('div', 'gal-fot');
    const prova = knapp('set-btn gal-prova', provas ? 'Provas' : 'Prova', 'prova');
    prova.disabled = provas || !!t.dold;
    fot.append(prova);
    if (!t.egen) {
      const g = ikonknapp('gal-gilla', 'hjarta', 'Gilla', 'gilla'); g.append(el('span', 'gal-antal', tal(t.gillar)));
      fot.append(g, ikonknapp('gal-ogilla', 'tumme', 'Gillar inte', 'ogilla'), ikonknapp('gal-anmal', 'flagga', 'Anmäl', 'anmal'));
    } else {
      const g = el('span', 'gal-ikon gal-gilla-egen'); g.innerHTML = IKON.hjarta; g.append(el('span', 'gal-antal', tal(t.gillar)));
      g.title = tal(t.gillar) + ' gillar ditt tema';
      fot.append(g, ikonknapp('gal-bort', 'soptunna', 'Ta bort ditt tema', 'bort'));
    }
    a.append(fot);
    roster(a, t);
    return a;
  }
  // Fråga i kortets fot (anmäl / ta bort) i stället för en ruta över allt
  function fraga(a, text, val) {
    const fot = a.querySelector('.gal-fot');
    const ny = el('div', 'gal-fot gal-fraga');
    ny.append(el('span', 'gal-fraga-text', text));
    const tillbaka = () => { if (!ny.isConnected) return; ny.replaceWith(fot); const f = fot.querySelector('[data-g]:not(:disabled)'); if (f) f.focus(); };
    for (const [etikett, fn, cls] of val) { const b = knapp(cls || 'pill', etikett); b.addEventListener('click', () => fn(tillbaka)); ny.append(b); }
    const x = knapp('gal-ikon gal-x', '×'); x.title = 'Avbryt'; x.setAttribute('aria-label', 'Avbryt'); x.addEventListener('click', tillbaka); ny.append(x);
    fot.replaceWith(ny);
    const forsta = ny.querySelector('button:not(.gal-farlig)'); if (forsta) forsta.focus();   // aldrig direkt på "Ta bort"
  }

  // ---------- lista ----------
  function ritaLista() {
    const grid = document.getElementById('gal-grid'); if (!grid) return;
    const tom = document.getElementById('gal-tom'), fler = document.getElementById('gal-fler');
    grid.textContent = ''; tom.textContent = ''; tom.hidden = true;
    grid.setAttribute('aria-busy', String(!!st.laddar));
    if (st.laddar && !st.teman.length) {
      for (let i = 0; i < 6; i++) { const p = el('div', 'gal-kort gal-platshallare'); p.append(el('div', 'gp'), el('i', 'gph-rad'), el('i', 'gph-rad kort')); grid.append(p); }
    } else if (st.fel && !st.teman.length) {
      tom.hidden = false; tom.append(el('span', null, st.fel + ' '), knapp('gal-lank', 'Försök igen', 'igen'));
    } else if (!st.teman.length) {
      tom.hidden = false; tom.textContent = TOMT[st.flik] + (st.flik !== 'vecka' && st.flik !== 'mina' && vuxen() ? ' Bli först att dela ditt!' : '');
    } else {
      for (const t of st.teman) grid.append(kort(t));
    }
    fler.hidden = !st.mer || !st.teman.length;
    fler.disabled = !!st.laddar;
  }
  async function ladda(nollstall) {
    if (nollstall) st.sida = 0;
    const nr = ++st.nr;
    st.laddar = true; st.fel = '';
    ritaLista();
    let r;
    try { r = st.flik === 'mina' ? await G.mina({ token: token() }) : await G.lista({ sort: st.flik, sida: st.sida, token: token() }); } catch { r = null; }
    if (nr !== st.nr) return;   // en nyare förfrågan har tagit över
    st.laddar = false;
    if (!r || !r.ok) {
      if (r && r.error === 'av') { rita(); return; }
      st.fel = (r && r.message) || 'Kunde inte hämta teman.';
      if (nollstall) st.teman = [];
      if (!nollstall) st.sida = Math.max(0, st.sida - 1);
      ritaLista();
      if (!nollstall) toast(st.fel);
      return;
    }
    const nya = Array.isArray(r.teman) ? r.teman.filter((t) => t && /^t[0-9a-f]{20}$/.test(t.id)) : [];
    if (st.flik === 'mina') { st.teman = nya; st.mer = false; if (typeof r.kvarIdag === 'number') { st.kvar = r.kvarIdag; ritaPub(); } }
    else { st.teman = nollstall ? nya : st.teman.concat(nya.filter((t) => !st.teman.some((x) => x.id === t.id))); st.mer = !!r.mer; }
    ritaLista();
  }
  function bytFlik(flik) {
    if (flik === st.flik) return;
    st.flik = flik; st.teman = []; st.mer = false;
    document.querySelectorAll('#anp-galleri .gal-flikar .seg-btn').forEach((b) => { const pa = b.dataset.flik === flik; b.classList.toggle('on', pa); b.setAttribute('aria-selected', String(pa)); b.tabIndex = pa ? 0 : -1; });
    const u = document.getElementById('gal-under'); if (u) { u.textContent = UNDER[flik]; u.hidden = !UNDER[flik]; }
    ladda(true);
  }

  // ---------- publicera ----------
  function ritaPub() {
    const box = document.getElementById('gal-pub'); if (!box) return;
    box.textContent = '';
    if (st.barn) return;   // barn kan bläddra och prova, men inte publicera
    const rad = el('div', 'set-row gal-pubrad');
    const txt = el('div', 'set-txt');
    if (!vuxen()) {
      txt.append(el('div', 'set-title', 'Dela ditt tema'), el('div', 'set-desc', 'Logga in för att publicera ditt tema i galleriet.'));
      rad.append(txt, knapp('pill flex-none', 'Logga in', 'logga-in'));
      box.append(rad);
      return;
    }
    const slut = st.kvar === 0;
    txt.append(el('div', 'set-title', 'Publicera mitt tema'),
      el('div', 'set-desc', slut ? 'Du har publicerat fem teman det senaste dygnet. Försök igen i morgon.' : 'Dela dina färger och val under Tema med alla som använder AdRaze.'));
    const b = knapp('set-btn flex-none', st.pub ? 'Stäng' : 'Publicera…', 'pub');
    b.setAttribute('aria-expanded', String(st.pub));
    b.disabled = slut && !st.pub;
    rad.append(txt, b);
    box.append(rad);
    if (st.pub) box.append(pubForm());
  }
  function pubForm() {
    const f = el('form', 'gal-form'); f.noValidate = true;
    const vy = el('div', 'gal-form-vy');
    const falt = el('div', 'gal-form-falt');
    const namn = el('input', 'gal-in'); namn.type = 'text'; namn.maxLength = 40; namn.placeholder = 't.ex. Midnatt'; namn.autocomplete = 'off'; namn.spellcheck = false; namn.id = 'gal-namn';
    const besk = el('textarea', 'gal-in'); besk.maxLength = 140; besk.rows = 2; besk.placeholder = 'Vad gör temat speciellt? (valfritt)'; besk.id = 'gal-besk';
    const raknare = (inp, max) => { const r = el('span', 'gal-rakna', '0/' + max); inp.addEventListener('input', () => { r.textContent = [...inp.value].length + '/' + max; kolla(); }); return r; };
    const lbl = (text, inp, max) => { const l = el('label', 'gal-lbl'); const h = el('span', 'gal-lbl-rad'); h.append(el('span', null, text), raknare(inp, max)); l.append(h, inp); l.htmlFor = inp.id; return l; };
    const visa = el('label', 'gal-visanamn');
    const sw = el('span', 'switch'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = A.get('galleri.visaNamn', true) !== false; sw.append(cb, el('span', 'track'));
    const vt = el('span', 'gal-visanamn-txt'); vt.append(el('b', null, 'Visa mitt användarnamn'), el('small', null, 'Ditt namn i chatten. Av, eller inget namn: Anonym.'));
    visa.append(vt, sw);
    cb.addEventListener('change', () => { A.set('galleri.visaNamn', cb.checked, 'Visa mitt användarnamn i galleriet'); });
    const felrad = el('p', 'gal-fel'); felrad.hidden = true; felrad.setAttribute('role', 'alert');
    const not = el('p', 'gal-not', 'Bara färger och val under Tema delas. Inga länkar.');
    const knappar = el('div', 'gal-knappar');
    const avbryt = knapp('pill', 'Avbryt', 'pub');
    const skicka = el('button', 'set-btn', 'Publicera'); skicka.type = 'submit';
    knappar.append(avbryt, skicka);
    falt.append(lbl('Namn', namn, 40), lbl('Beskrivning', besk, 140), visa, not, felrad, knappar);
    f.append(vy, falt);
    let mitt = null;
    const kolla = () => { skicka.disabled = !mitt || !mitt.antal || mitt.provar || [...namn.value.trim()].length < 2; };
    const visaFel = (t) => { felrad.textContent = t || ''; felrad.hidden = !t; };
    kolla();
    // Förhandsvisning av mitt tema (det som faktiskt delas)
    G.mitt().then((m) => {
      mitt = m && m.ok ? m : null;
      vy.textContent = '';
      vy.append(forhand(mitt ? mitt.varden : {}));
      const om = el('p', 'gal-form-om');
      if (!mitt || !mitt.schema) om.textContent = 'Kunde inte nå galleriet just nu.';
      else if (mitt.provar) om.textContent = 'Du provar ett tema. Välj Behåll eller Ångra först.';
      else if (!mitt.antal) om.textContent = 'Ditt tema är som standardtemat. Ändra något under Tema först.';
      else om.textContent = (mitt.antal === 1 ? '1 inställning delas' : mitt.antal + ' inställningar delas') + (mitt.utanfor ? ', ' + mitt.utanfor + ' kan inte delas (t.ex. bilder).' : '.');
      vy.append(om);
      kolla();
    }).catch(() => {});
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (skicka.disabled) return;
      visaFel(''); skicka.disabled = true; skicka.textContent = 'Publicerar…';
      const r = await G.publicera({ token: token(), namn: namn.value, beskrivning: besk.value, anonym: !cb.checked }).catch(() => null);
      skicka.textContent = 'Publicera'; kolla();
      if (!r || !r.ok) { visaFel((r && r.message) || 'Det gick inte att publicera. Försök igen.'); return; }
      st.pub = false; if (typeof r.kvarIdag === 'number') st.kvar = r.kvarIdag;
      ritaPub();
      toast('Ditt tema är publicerat.');
      if (st.flik === 'nya') ladda(true); else bytFlik('nya');
    });
    setTimeout(() => { try { namn.focus(); } catch {} }, 0);
    return f;
  }

  // ---------- hela delen ----------
  function rita() {
    const rot = document.getElementById('anp-galleri'); if (!rot) return;
    st.barn = arBarn();
    if (st.flik === 'mina' && !vuxen()) { st.flik = 'populara'; st.teman = []; }
    rot.textContent = '';
    rot.append(el('h3', 'set-h3', 'Temagalleri'));
    const pa = A.get('galleri.visa', true) !== false;
    if (!pa) {
      rot.append(el('p', 'set-lead', st.barn ? 'Temagalleriet är avstängt.' : 'Temagalleriet är avstängt. Slå på det för att se teman som andra har delat.'));
      if (!st.barn) rot.append(visaRad(false));
      return;
    }
    rot.append(el('p', 'set-lead', 'Teman som andra har delat. Prova ett och behåll det om du gillar det.'));
    const pub = el('div', 'gal-pub'); pub.id = 'gal-pub'; rot.append(pub);
    const top = el('div', 'gal-top');
    const seg = el('div', 'seg gal-flikar'); seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', 'Visa teman');
    for (const [k, text] of FLIKAR) {
      if (k === 'mina' && !vuxen()) continue;
      const b = knapp('seg-btn' + (st.flik === k ? ' on' : ''), text);
      b.dataset.flik = k; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(st.flik === k)); b.tabIndex = st.flik === k ? 0 : -1;
      seg.append(b);
    }
    top.append(seg);
    const under = el('p', 'gal-under', UNDER[st.flik]); under.id = 'gal-under'; under.hidden = !UNDER[st.flik];
    rot.append(top, under);
    const grid = el('div', 'gal-grid'); grid.id = 'gal-grid';
    const tom = el('p', 'gal-tom'); tom.id = 'gal-tom'; tom.hidden = true; tom.setAttribute('role', 'status');
    const fler = knapp('pill gal-fler', 'Visa fler', 'fler'); fler.id = 'gal-fler'; fler.hidden = true;
    rot.append(grid, tom, fler);
    if (!st.barn) rot.append(visaRad(true));
    ritaPub();
    ritaLista();
  }
  function visaRad(pa) {
    const rad = el('div', 'set-row gal-visarad');
    const txt = el('div', 'set-txt');
    txt.append(el('div', 'set-title', 'Visa temagalleriet'), el('div', 'set-desc', 'Av: galleriet döljs, även i barnläge.'));
    const sw = el('label', 'switch'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = pa; cb.setAttribute('aria-label', 'Visa temagalleriet');
    sw.append(cb, el('span', 'track'));
    cb.addEventListener('change', async () => {
      const r = await A.set('galleri.visa', cb.checked, cb.checked ? 'Visa temagalleriet' : 'Dölj temagalleriet');
      if (r && r.ok === false) { cb.checked = !cb.checked; toast('Det går inte att ändra i barnläge.'); }
    });
    rad.append(txt, sw);
    return rad;
  }
  function visaDel() { rita(); if (A.get('galleri.visa', true) !== false) ladda(true); }

  // ---------- händelser i delen ----------
  const rot0 = document.getElementById('anp-galleri');
  if (rot0) {
    rot0.addEventListener('click', async (e) => {
      const flik = e.target.closest('.gal-flikar [data-flik]');
      if (flik) { bytFlik(flik.dataset.flik); return; }
      const b = e.target.closest('[data-g]'); if (!b || b.disabled) return;
      const g = b.dataset.g;
      if (g === 'fler') { st.sida++; ladda(false); return; }
      if (g === 'igen') { ladda(true); return; }
      if (g === 'pub') { st.pub = !st.pub; ritaPub(); return; }
      if (g === 'logga-in') { try { showSettingsCat('konto'); } catch {} return; }
      const a = b.closest('.gal-kort'); if (!a) return;
      const t = st.teman.find((x) => x.id === a.dataset.id); if (!t) return;
      if (g === 'prova') {
        b.disabled = true; b.textContent = 'Hämtar…';
        const r = await G.prova({ id: t.id, token: token() }).catch(() => null);
        if (!r || !r.ok) {
          b.disabled = false; b.textContent = 'Prova';
          toast((r && r.message) || 'Temat gick inte att prova.');
          if (r && r.status === 404) { st.teman = st.teman.filter((x) => x !== t); ritaLista(); }
        }
        return;   // raden överst och kortet uppdateras av galleri:prov
      }
      if (g === 'gilla' || g === 'ogilla') {
        if (!token()) { toast('Logga in för att gilla teman.'); return; }
        const fore = { min: t.min_rost, gillar: t.gillar };
        const rost = g === 'gilla' ? 1 : -1, ny = t.min_rost === rost ? 0 : rost;
        t.gillar += (ny === 1 ? 1 : 0) - (fore.min === 1 ? 1 : 0); t.min_rost = ny; roster(a, t);   // direkt i kortet
        const r = await G.rosta({ id: t.id, rost: ny, token: token() }).catch(() => null);
        if (!r || !r.ok) { t.min_rost = fore.min; t.gillar = fore.gillar; roster(a, t); toast((r && r.message) || 'Det gick inte att rösta.'); return; }
        t.gillar = Number(r.gillar) || 0; t.min_rost = r.min_rost; roster(a, t);
        return;
      }
      if (g === 'anmal') {
        if (!token()) { toast('Logga in för att anmäla ett tema.'); return; }
        const skicka = (orsak) => async (tillbaka) => {
          const r = await G.anmal({ id: t.id, orsak, token: token() }).catch(() => null);
          if (!r || !r.ok) { tillbaka(); toast((r && r.message) || 'Det gick inte att anmäla.'); return; }
          st.teman = st.teman.filter((x) => x !== t); ritaLista();
          toast('Tack. Temat är anmält och visas inte för dig.');
        };
        fraga(a, 'Varför?', [['Olämpligt', skicka('olampligt')], ['Spam', skicka('spam')], ['Annat', skicka('annat')]]);
        return;
      }
      if (g === 'bort') {
        fraga(a, 'Ta bort temat?', [['Ta bort', async (tillbaka) => {
          const r = await G.taBort({ id: t.id, token: token() }).catch(() => null);
          if (!r || !r.ok) { tillbaka(); toast((r && r.message) || 'Det gick inte att ta bort.'); return; }
          st.teman = st.teman.filter((x) => x !== t); ritaLista();
          if (typeof st.kvar === 'number') ritaPub();
          toast('Temat är borttaget.');
        }, 'set-btn gal-farlig']]);
      }
    });
    // Piltangenter mellan flikarna (som en vanlig flikrad)
    rot0.addEventListener('keydown', (e) => {
      const b = e.target.closest && e.target.closest('.gal-flikar .seg-btn'); if (!b || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const alla = [...b.parentNode.querySelectorAll('.seg-btn')]; let i = alla.indexOf(b);
      i = e.key === 'Home' ? 0 : e.key === 'End' ? alla.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + alla.length) % alla.length;
      e.preventDefault(); alla[i].focus(); bytFlik(alla[i].dataset.flik);
    });
  }
  document.addEventListener('anpassa:visa', visaDel);
  A.on('galleri.visa', () => { if (document.getElementById('gal-grid') || document.querySelector('#anp-galleri .gal-visarad')) visaDel(); });

  // ---------- "Du provar …" ovanför webbsidan ----------
  // Raden ligger i skalets flöde före #views (som bokmärkesfältet), så webbvyn flyttas ned och raden syns över sidor.
  const rad = el('div'); rad.id = 'gal-provbar'; rad.hidden = true; rad.setAttribute('role', 'status');
  const radFarger = el('span', 'gpb-farger'), radText = el('span', 'gpb-text');
  const radAngra = knapp('gpb-angra', 'Ångra'), radBehall = knapp('gpb-behall', 'Behåll');
  radAngra.title = 'Tillbaka till temat du hade'; radBehall.title = 'Behåll det här temat';
  rad.append(radFarger, radText, radAngra, radBehall);
  const views = document.getElementById('views');
  if (views && views.parentNode) views.parentNode.insertBefore(rad, views);
  function visaProv(p) {
    st.prov = p && typeof p === 'object' ? p : null;
    if (st.prov) {
      radFarger.textContent = '';
      for (const c of fargerAv(st.prov.varden).slice(0, 4)) { const i = el('i'); i.style.background = c; radFarger.append(i); }
      radText.textContent = '';
      radText.append('Du provar ', el('b', null, st.prov.namn || 'ett tema'), st.prov.skapare ? ' av ' + st.prov.skapare : '');
    }
    const syns = !!st.prov;
    if (rad.hidden === syns) { rad.hidden = !syns; try { if (typeof sendBounds === 'function') sendBounds(); } catch {} }
    radAngra.disabled = radBehall.disabled = false;
    document.querySelectorAll('#anp-galleri .gal-kort').forEach((a) => {
      const pa = !!(st.prov && st.prov.id === a.dataset.id);
      a.classList.toggle('provas', pa);
      const b = a.querySelector('.gal-prova');
      const t = st.teman.find((x) => x.id === a.dataset.id);
      if (b) { b.textContent = pa ? 'Provas' : 'Prova'; b.disabled = pa || !!(t && t.dold); }
    });
  }
  radAngra.addEventListener('click', async () => {
    radAngra.disabled = radBehall.disabled = true;
    await G.angra().catch(() => {});
    toast('Ditt tidigare tema är tillbaka.');
  });
  radBehall.addEventListener('click', async () => {
    const namn = st.prov && st.prov.namn;
    radAngra.disabled = radBehall.disabled = true;
    const r = await G.behall({ token: token() }).catch(() => null);
    if (!r || !r.ok) { radAngra.disabled = radBehall.disabled = false; toast((r && r.message) || 'Det gick inte att spara temat.'); return; }
    toast(namn ? 'Nu har du temat ' + namn + '.' : 'Temat är sparat.');
  });
  G.onProv(visaProv);
  G.prov().then(visaProv).catch(() => {});
})();
