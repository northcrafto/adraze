// AdRaze Proxy: startar Scramjet + Wisp och visar sidorna i flikar med samma skal som AdRaze-webbläsaren
// (flikrad, verktygsrad med adressfält, sköld och räknare för det AdRaze stoppat, meny).
(() => {
  const rot = document.getElementById('proxy');
  if (!rot) return;
  const $ = (id) => document.getElementById(id);
  const form = $('px-form'), falt = $('px-url'), fel = $('px-fel');
  const surf = $('px-surf'), ram = $('px-ram'), barForm = $('px-bar-form'), barFalt = $('px-bar-url');
  const laddar = $('px-laddar'), antalEl = $('px-antal'), raknare = $('px-raknare'), lista = $('px-lista'), listaVardar = $('px-lista-vardar');
  const flikarEl = $('px-flikar'), nyfliksida = $('px-nyfliksida'), nyFalt = $('px-ny-url'), skold = $('px-skold');
  const menyKnapp = $('px-menyknapp'), meny = $('px-menyn');
  const t = rot.dataset, ts = surf.dataset;
  const startTitel = document.title;

  // ---------- texter (samma fraser som webbläsaren, svensk fras = nyckel) ----------
  let TEXT = {};
  try { TEXT = JSON.parse($('px-texter')?.textContent || '{}'); } catch {}
  const T = (s) => TEXT[s] || s;
  for (const el of surf.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t);
  for (const el of surf.querySelectorAll('[data-t-placeholder]')) el.placeholder = T(el.dataset.tPlaceholder);
  for (const el of surf.querySelectorAll('[data-t-title]')) { el.title = T(el.dataset.tTitle); el.setAttribute('aria-label', el.title); }

  // ---------- lagring (bara i den här webbläsaren) ----------
  const las = (k, std) => { try { const v = localStorage.getItem(k); return v == null ? std : JSON.parse(v); } catch { return std; } };
  const spara = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const NYCKLAR = ['adraze-proxy-inst', 'adraze-proxy-genvagar', 'adraze-proxy-historik', 'adraze-proxy-statistik', 'adraze-proxy-egenbild'];
  const STD_INST = { tema: 'light', bg: 'slump', topp: 'mina', klocka: true, statistik: true, motor: 'duckduckgo' };
  let inst = { ...STD_INST, ...las('adraze-proxy-inst', {}) };
  const sparaInst = () => spara('adraze-proxy-inst', inst);
  const MOTORER = {
    duckduckgo: { namn: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    adraze: { namn: 'AdRaze Search', url: 'https://search.adraze.app/search?q=' },
    brave: { namn: 'Brave Search', url: 'https://search.brave.com/search?q=' },
    startpage: { namn: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
    google: { namn: 'Google', url: 'https://www.google.com/search?q=' },
  };
  surf.dataset.tema = inst.tema;

  // ---------- adresser ----------
  // "aftonbladet.se" -> https://aftonbladet.se, "katter med hatt" -> sökning
  function tolka(text) {
    const s = text.trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) { try { return new URL(s).href; } catch { return null; } }
    if (!/\s/.test(s) && /^[^/]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) { try { return new URL('https://' + s).href; } catch { return null; } }
    return (MOTORER[inst.motor] || MOTORER.duckduckgo).url + encodeURIComponent(s);
  }
  const visa = (u) => { try { return new URL(u).href.replace(/^https:\/\//, '').replace(/\/$/, ''); } catch { return u || ''; } };
  const vardAv = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
  function visaFel(text) { fel.textContent = text; fel.hidden = !text; }
  const ikon = (namn, sm) => `<svg class="ic${sm ? ' ic-sm' : ''}" aria-hidden="true"><use href="#${namn}"/></svg>`;

  // ---------- motorn ----------
  let sj = null, klar = null;
  function starta() {
    if (klar) return klar;
    klar = (async () => {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error(t.eStod);
      const { ScramjetController } = $scramjetLoadController();
      sj = new ScramjetController({
        prefix: '/s/',
        files: { wasm: '/motor/scram/scramjet.wasm.wasm', all: '/motor/scram/scramjet.all.js', sync: '/motor/scram/scramjet.sync.js' },
      });
      await sj.init();
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        // Första besöket: vänta tills workern tagit över sidan, annars går ramens förfrågningar förbi den
        await new Promise((ok) => {
          navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true });
          setTimeout(ok, 3000);
        });
      }
      reg.update().catch(() => {});
      const anslutning = new BareMux.BareMuxConnection('/motor/baremux/worker.js');
      const wisp = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/wisp/';
      await anslutning.setTransport('/motor/libcurl/index.mjs', [{ wisp }]);
    })();
    klar.catch(() => { klar = null; });
    return klar;
  }

  // ---------- flikarna ----------
  let flikar = [], aktiv = null, nastaId = 1;

  function nyFlik(u) {
    const f = { id: nastaId++, url: null, titel: '', frame: null, laddar: false, antal: 0, perKat: { reklam: 0, sparare: 0, farlig: 0 }, perVard: new Map() };
    const el = document.createElement('div');
    el.className = 'px-flik';
    el.setAttribute('role', 'tab');
    el.tabIndex = 0;
    el.innerHTML = `<span class="fav">${ikon('i-globe', true)}</span><span class="ttl"></span>`
      + `<button type="button" class="tclose" aria-label="${ts.tTabclose}" title="${ts.tTabclose}">${ikon('i-close', true)}</button>`;
    el.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.target.closest('.tclose')) valj(f); });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); stangFlik(f); } });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); valj(f); } });
    el.querySelector('.tclose').addEventListener('click', (e) => { e.stopPropagation(); stangFlik(f); });
    f.el = el;
    flikar.push(f);
    flikarEl.append(el);
    ritaFlik(f);
    valj(f);
    if (u) ga(f, u); else { barFalt.value = ''; ritaNyFlik(f); setTimeout(() => nyFalt.focus(), 0); }
    el.scrollIntoView({ inline: 'nearest' });
    return f;
  }

  function ritaFlik(f) {
    const ttl = f.titel || (f.url ? vardAv(f.url) : ts.tNewtab);
    f.el.querySelector('.ttl').textContent = ttl;
    f.el.title = ttl;
    f.el.classList.toggle('laddar', f.laddar);
    const fav = f.el.querySelector('.fav');
    if (f.laddar) fav.innerHTML = ikon('i-reload', true);
    else if (f.url && sj) {
      const img = new Image(16, 16);
      img.alt = '';
      img.onerror = () => { fav.innerHTML = ikon('i-globe', true); };
      img.src = sj.encodeUrl(new URL('/favicon.ico', f.url).href);
      fav.replaceChildren(img);
    } else fav.innerHTML = ikon(f.url ? 'i-globe' : 'i-newtab', true);
  }

  function valj(f) {
    aktiv = f;
    for (const x of flikar) {
      x.el.setAttribute('aria-selected', String(x === f));
      if (x.frame) x.frame.frame.hidden = x !== f;
    }
    nyfliksida.hidden = !!f.url;
    if (!f.url) ritaNyFlik(f);
    barFalt.value = f.url ? visa(f.url) : '';
    laddar.classList.toggle('pa', f.laddar);
    skold.classList.toggle('ok', !!f.url);
    skold.innerHTML = ikon(f.url ? 'i-shield-check' : 'i-shield', true);
    visaAntal();
    if (!lista.hidden) ritaLista();
    document.title = (f.titel ? f.titel + ' · ' : '') + 'AdRaze Proxy';
    uppdateraAdress();
  }

  function stangFlik(f) {
    const i = flikar.indexOf(f);
    if (i < 0) return;
    if (f.frame) { f.frame.frame.src = 'about:blank'; f.frame.frame.remove(); }
    f.el.remove();
    flikar.splice(i, 1);
    if (!flikar.length) { stang(); return; }
    if (aktiv === f) valj(flikar[Math.min(i, flikar.length - 1)]);
  }

  async function ga(f, u) {
    visaInst(false); visaBgval(false);
    f.url = u; f.titel = ''; f.laddar = true;
    if (f === aktiv) { nyfliksida.hidden = true; barFalt.value = visa(u); laddar.classList.add('pa'); skold.classList.add('ok'); skold.innerHTML = ikon('i-shield-check', true); }
    ritaFlik(f);
    try { await starta(); } catch (e) {
      console.error('AdRaze Proxy:', e);
      stang(false);
      visaFel(e.message === t.eStod ? t.eStod : t.eStart);
      return;
    }
    if (!flikar.includes(f)) return;
    if (!f.frame) skapaRam(f);
    if (f === aktiv) uppdateraAdress();
    f.frame.go(u);
  }

  function skapaRam(f) {
    const fr = sj.createFrame();
    f.frame = fr;
    fr.frame.title = 'AdRaze Proxy';
    fr.frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture');
    fr.frame.allowFullscreen = true;
    fr.frame.hidden = f !== aktiv;
    ram.append(fr.frame);
    fr.addEventListener('urlchange', (e) => {
      const forraVard = vardAv(f.url);
      f.url = e.url;
      if (vardAv(e.url) !== forraVard) ritaFlik(f);
      if (f === aktiv) { if (document.activeElement !== barFalt) barFalt.value = visa(e.url); uppdateraAdress(); }
      setTimeout(() => lasTitel(f), 600);
      minnas(e.url);
    });
    fr.addEventListener('navigate', () => {
      f.laddar = true; ritaFlik(f);
      if (f === aktiv) laddar.classList.add('pa');
    });
    fr.frame.addEventListener('load', () => {
      f.laddar = false;
      lasTitel(f);
      ritaFlik(f);
      if (f === aktiv) laddar.classList.remove('pa');
    });
  }

  function lasTitel(f) {
    try {
      const titel = f.frame?.frame.contentDocument?.title?.trim();
      if (titel && titel !== f.titel) {
        f.titel = titel;
        f.el.querySelector('.ttl').textContent = titel;
        f.el.title = titel;
        if (f === aktiv) document.title = titel + ' · AdRaze Proxy';
      }
    } catch {}
  }
  // Ensidesappar (YouTube, TikTok) byter titel utan att ladda om
  setInterval(() => { if (!surf.hidden && aktiv?.frame) lasTitel(aktiv); }, 2000);

  function uppdateraAdress() {
    const u = aktiv?.url;
    const ny = new URL(location.href);
    ny.search = u ? '?u=' + encodeURIComponent(u) : '';
    if (!surf.hidden && ny.href !== location.href) history.replaceState({ u }, '', ny);
  }

  // ---------- ny flik-sidan (som webbläsarens startsida) ----------
  let totalt = Number(las('adraze-proxy-statistik', 0)) || 0;
  const STD_GENVAGAR = [
    { label: 'YouTube', url: 'https://www.youtube.com' }, { label: 'Wikipedia', url: 'https://sv.wikipedia.org' },
    { label: 'SVT', url: 'https://www.svt.se' }, { label: 'Aftonbladet', url: 'https://www.aftonbladet.se' },
    { label: 'DuckDuckGo', url: 'https://duckduckgo.com' }, { label: 'TikTok', url: 'https://www.tiktok.com' },
  ];
  const genvagar = () => { const g = las('adraze-proxy-genvagar', null); return Array.isArray(g) ? g : STD_GENVAGAR.slice(); };
  function minnas(u) {
    let v; try { v = new URL(u); } catch { return; }
    if (!/^https?:$/.test(v.protocol)) return;
    const h = las('adraze-proxy-historik', {});
    const k = v.hostname.replace(/^www\./, '');
    h[k] = { url: v.origin, n: (h[k]?.n || 0) + 1, t: Date.now() };
    const rader = Object.entries(h).sort((a, b) => b[1].t - a[1].t).slice(0, 200);
    spara('adraze-proxy-historik', Object.fromEntries(rader));
  }
  const mestBesokta = () => Object.entries(las('adraze-proxy-historik', {})).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => ({ label: k, url: v.url }));

  function halsning() {
    const h = new Date().getHours();
    const b = h >= 5 && h < 10 ? ['God morgon', 'Morgonpigg', 'Ny dag väntar'] : h < 12 && h >= 10 ? ['God förmiddag', 'Härlig förmiddag']
      : h >= 12 && h < 14 ? ['Lunchdags snart?', 'Mitt på dagen', 'God middag'] : h >= 14 && h < 18 ? ['God eftermiddag', 'Trevlig eftermiddag']
      : h >= 18 && h < 22 ? ['God kväll', 'Skön kväll'] : h >= 22 || h < 3 ? ['Lite sent', 'Uppe sent', 'Nattsurfning'] : ['Mitt i natten', 'Dags att sova snart?', 'Sena timmar'];
    return T(b[(h * 7 + new Date().getDate()) % b.length]);
  }
  function tick() {
    $('nt-clock').textContent = new Date().toLocaleTimeString(t.lang || 'sv', { hour: '2-digit', minute: '2-digit' });
    $('nt-greet').textContent = halsning();
  }
  setInterval(() => { if (!nyfliksida.hidden) tick(); }, 10000);

  function ritaStatistik() {
    const f = (n) => Math.round(n).toLocaleString(t.lang);
    // Samma uppskattning som webbläsaren (och Brave): ~30 kB och ~50 ms per stoppad annons/spårare
    const mb = totalt * 30 / 1024, sek = totalt * 0.05;
    const [bv, bu] = mb >= 1024 ? [(mb / 1024).toLocaleString(t.lang, { maximumFractionDigits: 1 }), 'GB'] : [f(mb), 'MB'];
    const [tv, tu] = sek >= 3600 ? [(sek / 3600).toLocaleString(t.lang, { maximumFractionDigits: 1 }), T('timmar')] : sek >= 60 ? [f(sek / 60), T('minuter')] : [f(sek), T('sekunder')];
    $('stat-blocked').textContent = f(totalt);
    $('stat-band').textContent = bv; $('stat-band-u').textContent = bu;
    $('stat-time').textContent = tv; $('stat-time-u').textContent = tu;
  }

  let laggerTill = false;
  function ritaGenvagar() {
    const ruta = $('shortcuts');
    const mest = inst.topp === 'mest';
    const lista = mest ? mestBesokta() : genvagar();
    ruta.replaceChildren();
    lista.forEach((g, i) => {
      let vard = ''; try { vard = new URL(g.url).hostname.replace(/^www\./, ''); } catch {}
      const el = document.createElement('div'); el.className = 'sc'; el.tabIndex = 0; el.setAttribute('role', 'link');
      el.innerHTML = `<div class="sc-tilewrap"><div class="sc-tile"><span class="sc-letter"></span></div>${mest ? '' : `<button type="button" class="sc-remove" title="${T('Ta bort')}" aria-label="${T('Ta bort')}">${ikon('i-close')}</button>`}</div><div class="sc-label"></div>`;
      el.querySelector('.sc-letter').textContent = (vard[0] || '•').toUpperCase();
      el.querySelector('.sc-label').textContent = g.label;
      if (vard) {
        const img = new Image(); img.className = 'sc-fav'; img.alt = '';
        img.onload = () => { el.querySelector('.sc-letter').style.display = 'none'; };
        img.onerror = () => img.remove();
        img.src = '/adraze/ikon/' + vard;
        el.querySelector('.sc-tile').append(img);
      }
      const oppnaG = () => { if (aktiv) ga(aktiv, g.url); };
      el.addEventListener('click', (e) => { if (!e.target.closest('.sc-remove')) oppnaG(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') oppnaG(); });
      el.querySelector('.sc-remove')?.addEventListener('click', (e) => { e.stopPropagation(); const n = genvagar(); n.splice(i, 1); spara('adraze-proxy-genvagar', n); ritaGenvagar(); });
      ruta.append(el);
    });
    if (mest) return;
    if (laggerTill) {
      const bar = document.createElement('div'); bar.className = 'sc-addbar';
      bar.innerHTML = '<input type="text" placeholder="https://hemsida.com" spellcheck="false" autocomplete="off">';
      const inp = bar.querySelector('input');
      const klar = (behall) => {
        const u = behall && tolka(inp.value);
        if (u && !u.startsWith((MOTORER[inst.motor] || MOTORER.duckduckgo).url)) {
          let label = u; try { label = new URL(u).hostname.replace(/^www\./, ''); } catch {}
          const n = genvagar(); n.push({ label, url: u }); spara('adraze-proxy-genvagar', n);
        }
        laggerTill = false; ritaGenvagar();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') klar(true); else if (e.key === 'Escape') klar(false); });
      inp.addEventListener('blur', () => { if (laggerTill) klar(false); });
      ruta.append(bar);
      setTimeout(() => inp.focus(), 20);
    } else {
      const add = document.createElement('button'); add.type = 'button'; add.className = 'sc sc-add';
      add.innerHTML = `<div class="sc-tilewrap"><div class="sc-tile">${ikon('i-plus')}</div></div><div class="sc-label"></div>`;
      add.querySelector('.sc-label').textContent = T('Lägg till');
      add.addEventListener('click', () => { laggerTill = true; ritaGenvagar(); });
      ruta.append(add);
    }
  }

  // Bakgrunder: samma foton som webbläsaren, hämtade via proxyns server (besökarens IP når aldrig Pexels)
  const bildUrl = (b, w) => `/adraze/bild/${b.id}/${b.fil}?w=${w}`;
  const bredd = () => { const w = (screen.width || 1920) * (devicePixelRatio || 1); return [1280, 1600, 1920, 2560, 3840].find((x) => x >= w) || 3840; };
  let nastaBg = null;
  async function hamtaBg(fraga = '') {
    const r = await fetch('/adraze/bakgrund' + fraga);
    if (!r.ok) throw new Error('bakgrund ' + r.status);
    const b = await r.json();
    b.url = bildUrl(b, bredd());
    b.credit = b.namn + ' · Pexels';
    await new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = b.url; });
    return b;
  }
  const forladda = () => { nastaBg = hamtaBg().catch(() => null); };
  async function bgForFlik(f) {
    if (inst.bg === 'egen') { const d = las('adraze-proxy-egenbild', null); return d ? { url: d, credit: '' } : null; }
    if (inst.bg === 'dag') return hamtaBg('?dag=' + new Date().toISOString().slice(0, 10)).catch(() => null);
    if (inst.bg && typeof inst.bg === 'object') return { ...inst.bg, url: bildUrl(inst.bg, bredd()), credit: inst.bg.namn + ' · Pexels' };
    if (!f.bg) { const b = await (nastaBg || hamtaBg().catch(() => null)); forladda(); return b; }
    return f.bg;
  }
  async function ritaNyFlik(f) {
    $('nt-klocka').hidden = !inst.klocka;
    $('nt-stats').hidden = !inst.statistik;
    tick(); ritaStatistik(); ritaGenvagar();
    const el = $('nt-bg');
    if (!f.bg || f.bgLage !== JSON.stringify(inst.bg)) {
      el.style.backgroundImage = ''; el.style.backgroundColor = ''; $('nt-credit').textContent = '';
      f.bgLage = JSON.stringify(inst.bg);
      f.bg = null;
      f.bg = await bgForFlik(f);
    }
    if (aktiv !== f || !f.bg) return;
    el.style.backgroundColor = f.bg.farg || '';
    el.style.backgroundImage = `url("${f.bg.url}")`;
    $('nt-credit').textContent = f.bg.credit || '';
  }

  // ---------- inställningar ----------
  const instEl = $('px-inst'), bgval = $('px-bgval');
  function visaInst(pa, kat) {
    instEl.hidden = !pa;
    if (pa) { visaMeny(false); visaLista(false); ritaInst(); if (kat) valjKat(kat); instEl.querySelector('.inst-tab.on')?.focus(); }
  }
  function valjKat(kat) {
    for (const b of instEl.querySelectorAll('.inst-tab')) b.classList.toggle('on', b.dataset.cat === kat);
    for (const p of instEl.querySelectorAll('.inst-panel')) p.hidden = p.dataset.cat !== kat;
  }
  function ritaInst() {
    for (const b of instEl.querySelectorAll('[data-tema]')) b.classList.toggle('on', b.dataset.tema === inst.tema);
    for (const b of instEl.querySelectorAll('[data-topp]')) b.classList.toggle('on', b.dataset.topp === inst.topp);
    $('inst-klocka').checked = !!inst.klocka;
    $('inst-statistik').checked = !!inst.statistik;
    $('inst-motorer').replaceChildren(...Object.entries(MOTORER).map(([k, m]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'inst-val' + (inst.motor === k ? ' on' : '');
      b.innerHTML = '<span class="inst-radio"></span><span></span>';
      b.lastChild.textContent = m.namn;
      b.addEventListener('click', () => { inst.motor = k; sparaInst(); ritaInst(); });
      return b;
    }));
    const sprak = [...document.querySelectorAll('.sprak-lista a[data-sprak]')];
    $('inst-sprak').replaceChildren(...sprak.map((a) => {
      const l = document.createElement('a'); l.className = 'inst-val' + (a.dataset.sprak === t.lang ? ' on' : '');
      l.href = a.getAttribute('href'); l.lang = a.dataset.sprak;
      l.innerHTML = '<span class="inst-radio"></span><span></span><small></small>';
      l.children[1].textContent = a.textContent; l.children[2].textContent = a.dataset.sprak.toUpperCase();
      return l;
    }));
  }
  instEl.querySelector('.inst-nav').addEventListener('click', (e) => { const b = e.target.closest('.inst-tab'); if (b) valjKat(b.dataset.cat); });
  for (const b of instEl.querySelectorAll('[data-tema]')) b.addEventListener('click', () => { inst.tema = b.dataset.tema; surf.dataset.tema = inst.tema; sparaInst(); ritaInst(); });
  for (const b of instEl.querySelectorAll('[data-topp]')) b.addEventListener('click', () => { inst.topp = b.dataset.topp; sparaInst(); ritaInst(); ritaGenvagar(); });
  $('inst-klocka').addEventListener('change', (e) => { inst.klocka = e.target.checked; sparaInst(); $('nt-klocka').hidden = !inst.klocka; });
  $('inst-statistik').addEventListener('change', (e) => { inst.statistik = e.target.checked; sparaInst(); $('nt-stats').hidden = !inst.statistik; });
  $('inst-rensa').addEventListener('click', async (e) => {
    for (const k of NYCKLAR) { try { localStorage.removeItem(k); } catch {} }
    try { await caches.delete('adraze-sidcache-v1'); } catch {}
    inst = { ...STD_INST }; totalt = 0; surf.dataset.tema = inst.tema;
    const knapp = e.currentTarget; knapp.textContent = T('Rensat'); knapp.classList.add('klar');
    setTimeout(() => { knapp.textContent = T('Rensa'); knapp.classList.remove('klar'); }, 2000);
    ritaInst(); if (aktiv && !aktiv.url) ritaNyFlik(aktiv);
  });
  $('px-inst-stang').addEventListener('click', () => visaInst(false));
  $('px-installningar-knapp').addEventListener('click', () => visaInst(instEl.hidden));
  $('px-meny-installningar').addEventListener('click', () => visaInst(true));

  // Bakgrundsväljaren
  async function visaBgval(pa) {
    bgval.hidden = !pa;
    $('bgval-fel').hidden = true;
    if (!pa) return;
    const grid = $('bgval-grid');
    if (grid.childElementCount) return;
    try {
      const lista = await (await fetch('/adraze/bakgrund?galleri')).json();
      grid.replaceChildren(...lista.map((b) => {
        const k = document.createElement('button'); k.type = 'button'; k.className = 'bg-thumb'; k.title = b.namn + ' · Pexels';
        k.style.backgroundImage = `url("${bildUrl(b, 320)}")`;
        k.addEventListener('click', () => valjBg(b));
        return k;
      }));
    } catch {}
  }
  function valjBg(v) {
    inst.bg = v; sparaInst(); visaBgval(false);
    for (const f of flikar) if (!f.url) f.bg = null;
    if (aktiv && !aktiv.url) ritaNyFlik(aktiv);
  }
  $('inst-bg').addEventListener('click', () => visaBgval(true));
  $('bgval-stang').addEventListener('click', () => visaBgval(false));
  $('bgval-slump').addEventListener('click', () => valjBg('slump'));
  $('bgval-dag').addEventListener('click', () => valjBg('dag'));
  $('bgval-ladda').addEventListener('click', () => $('bgval-fil').click());
  $('bgval-fil').addEventListener('change', (e) => {
    const fil = e.target.files?.[0]; e.target.value = '';
    if (!fil) return;
    // Skala ned till högst 1920 px och spara som JPEG, så att bilden ryms i webbläsarens lagring
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1920 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      if (!spara('adraze-proxy-egenbild', c.toDataURL('image/jpeg', 0.82))) { const fe = $('bgval-fel'); fe.textContent = T('Bilden är för stor.'); fe.hidden = false; return; }
      valjBg('egen');
    };
    img.onerror = () => { const fe = $('bgval-fel'); fe.textContent = T('Bilden är för stor.'); fe.hidden = false; };
    img.src = URL.createObjectURL(fil);
  });

  // ---------- räknaren ----------
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.adraze !== 'stoppade' || !flikar.length) return;
    const andrade = new Set();
    for (const p of e.data.lista) {
      // Förfrågan hör till fliken vars sida den kom från; huvudsidor (utan "sida") räknas på den aktiva
      const f = (p.sida && flikar.find((x) => vardAv(x.url) === p.sida)) || aktiv;
      if (!f) continue;
      f.antal++;
      f.perKat[p.kat] = (f.perKat[p.kat] || 0) + 1;
      const v = f.perVard.get(p.vard) || { kat: p.kat, n: 0 };
      v.n++; f.perVard.set(p.vard, v);
      andrade.add(f);
      totalt++;
    }
    spara('adraze-proxy-statistik', totalt);
    if (!nyfliksida.hidden) ritaStatistik();
    if (andrade.has(aktiv)) {
      visaAntal();
      raknare.classList.remove('puls'); void raknare.offsetWidth; raknare.classList.add('puls');
      if (!lista.hidden) ritaLista();
    }
  });
  function visaAntal() { antalEl.textContent = (aktiv?.antal || 0).toLocaleString(t.lang); }
  function ritaLista() {
    const f = aktiv;
    for (const b of lista.querySelectorAll('[data-kat]')) b.textContent = f?.perKat[b.dataset.kat] || 0;
    const rader = [...(f?.perVard || new Map()).entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 60);
    listaVardar.replaceChildren(...rader.map(([v, { kat, n }]) => {
      const li = document.createElement('li');
      const i = document.createElement('i'); i.className = 'k-' + kat;
      const s = document.createElement('span'); s.textContent = v;
      const b = document.createElement('b'); b.textContent = n;
      li.append(i, s, b);
      return li;
    }));
    $('px-lista-tom').hidden = rader.length > 0;
  }
  function visaLista(pa) {
    lista.hidden = !pa;
    raknare.setAttribute('aria-expanded', String(pa));
    if (!pa) return;
    visaMeny(false);
    ritaLista();
    // Rutan hänger under räknaren, som i webbläsaren
    const r = raknare.getBoundingClientRect();
    const bredd = lista.offsetWidth;
    lista.style.left = Math.max(10, Math.min(r.right - bredd, innerWidth - bredd - 10)) + 'px';
  }
  raknare.addEventListener('click', () => visaLista(lista.hidden));
  $('px-lista-stang').addEventListener('click', () => visaLista(false));

  // ---------- menyn ----------
  function visaMeny(pa) {
    meny.hidden = !pa;
    menyKnapp.setAttribute('aria-expanded', String(pa));
    if (pa) { visaLista(false); meny.querySelector('button, a')?.focus(); }
  }
  menyKnapp.addEventListener('click', () => visaMeny(meny.hidden));
  $('px-meny-nyflik').addEventListener('click', () => { visaMeny(false); nyFlik(); });
  $('px-stang').addEventListener('click', () => { visaMeny(false); stang(); });
  document.addEventListener('pointerdown', (e) => {
    if (!meny.hidden && !meny.contains(e.target) && !menyKnapp.contains(e.target)) visaMeny(false);
    if (!lista.hidden && !lista.contains(e.target) && !raknare.contains(e.target)) visaLista(false);
  });
  // Klick inne i en sida syns inte här, men fönstret tappar fokus till ramen
  window.addEventListener('blur', () => { visaMeny(false); visaLista(false); });

  // ---------- öppna och stänga ----------
  function oppna(u, ny = true) {
    visaFel('');
    const forsta = surf.hidden;
    document.body.classList.add('surfar');
    surf.hidden = false;
    if (forsta || !flikar.length) {
      if (ny) history.pushState({ u }, '', '?u=' + encodeURIComponent(u));
      nyFlik(u);
    } else ga(aktiv, u);
  }
  function stang(historik = true) {
    for (const f of flikar) { if (f.frame) { f.frame.frame.src = 'about:blank'; f.frame.frame.remove(); } f.el.remove(); }
    flikar = []; aktiv = null;
    document.body.classList.remove('surfar');
    surf.hidden = true;
    visaLista(false); visaMeny(false);
    laddar.classList.remove('pa');
    document.title = startTitel;
    if (historik && location.search) history.pushState({}, '', location.pathname);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = tolka(falt.value);
    if (!u) { visaFel(t.eAdress); falt.focus(); return; }
    oppna(u);
  });
  falt.addEventListener('input', () => visaFel(''));
  // Snabbknappar: på startsidan öppnar de proxyn, på ny flik-sidan laddas de i fliken
  for (const b of rot.querySelectorAll('[data-ga]')) b.addEventListener('click', () => {
    if (nyfliksida.contains(b) && aktiv) ga(aktiv, b.dataset.ga); else oppna(b.dataset.ga);
  });
  barForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = tolka(barFalt.value);
    if (u && aktiv) { barFalt.blur(); ga(aktiv, u); }
  });
  $('px-ny-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = tolka(nyFalt.value);
    if (u && aktiv) { nyFalt.value = ''; ga(aktiv, u); }
  });
  barFalt.addEventListener('focus', () => barFalt.select());
  barFalt.addEventListener('keydown', (e) => { if (e.key === 'Escape') { barFalt.value = aktiv?.url ? visa(aktiv.url) : ''; barFalt.blur(); } });
  $('px-nyflik').addEventListener('click', () => nyFlik());
  $('px-bak').addEventListener('click', () => aktiv?.frame?.back());
  $('px-fram').addEventListener('click', () => aktiv?.frame?.forward());
  $('px-om').addEventListener('click', () => { if (aktiv?.frame) { laddar.classList.add('pa'); aktiv.frame.reload(); } });

  document.addEventListener('keydown', (e) => {
    if (surf.hidden) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { if (!bgval.hidden) visaBgval(false); else if (!instEl.hidden) visaInst(false); visaLista(false); visaMeny(false); }
    if (mod && k === 'l') { e.preventDefault(); barFalt.focus(); }
    // Ctrl+T/W fångar webbläsaren själv; Alt+T/W fungerar alltid
    if ((mod || e.altKey) && k === 't') { e.preventDefault(); nyFlik(); }
    if ((mod || e.altKey) && k === 'w' && aktiv) { e.preventDefault(); stangFlik(aktiv); }
    if (e.ctrlKey && e.key === 'Tab' && flikar.length > 1) {
      e.preventDefault();
      const i = flikar.indexOf(aktiv);
      valj(flikar[(i + (e.shiftKey ? -1 : 1) + flikar.length) % flikar.length]);
    }
  });
  window.addEventListener('popstate', () => {
    const u = new URLSearchParams(location.search).get('u');
    if (u) { if (surf.hidden) oppna(u, false); } else if (!surf.hidden) stang(false);
  });

  // Länk som /?u=https://… öppnar sidan direkt
  const start = new URLSearchParams(location.search).get('u');
  if (start) { const u = tolka(start); if (u) oppna(u, false); }
  // Förvärm motorn direkt (service worker, regler, krypterad anslutning), så att första sidan inte väntar på den
  const forvarm = () => { starta().catch(() => {}); if (inst.bg === 'slump' && !nastaBg) forladda(); };
  if (!start) ('requestIdleCallback' in window ? requestIdleCallback(forvarm, { timeout: 1500 }) : setTimeout(forvarm, 300));
})();
