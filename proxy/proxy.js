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

  // ---------- adresser ----------
  // "aftonbladet.se" -> https://aftonbladet.se, "katter med hatt" -> sökning
  function tolka(text) {
    const s = text.trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) { try { return new URL(s).href; } catch { return null; } }
    if (!/\s/.test(s) && /^[^/]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) { try { return new URL('https://' + s).href; } catch { return null; } }
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
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
    if (u) ga(f, u); else { barFalt.value = ''; setTimeout(() => nyFalt.focus(), 0); }
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
    }
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
    if (e.key === 'Escape') { visaLista(false); visaMeny(false); }
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
  const forvarm = () => starta().catch(() => {});
  if (!start) ('requestIdleCallback' in window ? requestIdleCallback(forvarm, { timeout: 1500 }) : setTimeout(forvarm, 300));
})();
