// AdRaze Proxy: startar Scramjet + Wisp, visar sidan i en ram med adressfält och räknare för det AdRaze stoppat
(() => {
  const rot = document.getElementById('proxy');
  if (!rot) return;
  const $ = (id) => document.getElementById(id);
  const form = $('px-form'), falt = $('px-url'), fel = $('px-fel');
  const surf = $('px-surf'), ram = $('px-ram'), barForm = $('px-bar-form'), barFalt = $('px-bar-url');
  const laddar = $('px-laddar'), antalEl = $('px-antal'), raknare = $('px-raknare'), lista = $('px-lista'), listaVardar = $('px-lista-vardar');
  const t = rot.dataset;

  // ---------- adresser ----------
  // "aftonbladet.se" -> https://aftonbladet.se, "katter med hatt" -> sökning
  function tolka(text) {
    const s = text.trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) { try { return new URL(s).href; } catch { return null; } }
    if (!/\s/.test(s) && /^[^/]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) { try { return new URL('https://' + s).href; } catch { return null; } }
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
  }
  const visa = (u) => { try { const x = new URL(u); return x.href.replace(/^https:\/\//, '').replace(/\/$/, ''); } catch { return u; } };

  function visaFel(text) { fel.textContent = text; fel.hidden = !text; }

  // ---------- motorn ----------
  let sj = null, frame = null, klar = null;
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
      frame = sj.createFrame();
      frame.frame.title = 'AdRaze Proxy';
      frame.frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture');
      frame.frame.allowFullscreen = true;
      ram.append(frame.frame);
      frame.addEventListener('urlchange', (e) => byttAdress(e.url));
      frame.addEventListener('navigate', () => laddar.classList.add('pa'));
      frame.frame.addEventListener('load', () => {
        laddar.classList.remove('pa');
        try { const titel = frame.frame.contentDocument?.title; if (titel) document.title = titel + ' · AdRaze Proxy'; } catch {}
      });
    })();
    klar.catch(() => { klar = null; });
    return klar;
  }

  // ---------- räknaren ----------
  let antal = 0;
  const perKat = { reklam: 0, sparare: 0, farlig: 0 };
  const perVard = new Map();
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.adraze !== 'stoppade') return;
    for (const p of e.data.lista) {
      antal++;
      perKat[p.kat] = (perKat[p.kat] || 0) + 1;
      const v = perVard.get(p.vard) || { kat: p.kat, n: 0 };
      v.n++; perVard.set(p.vard, v);
    }
    antalEl.textContent = antal.toLocaleString(t.lang);
    raknare.classList.remove('puls'); void raknare.offsetWidth; raknare.classList.add('puls');
    if (!lista.hidden) ritaLista();
  });
  function ritaLista() {
    for (const b of lista.querySelectorAll('[data-kat]')) b.textContent = perKat[b.dataset.kat] || 0;
    const rader = [...perVard.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 60);
    listaVardar.replaceChildren(...rader.map(([v, { kat, n }]) => {
      const li = document.createElement('li');
      const i = document.createElement('i'); i.className = 'k-' + kat;
      const s = document.createElement('span'); s.textContent = v;
      const b = document.createElement('b'); b.textContent = n;
      li.append(i, s, b);
      return li;
    }));
  }
  raknare.addEventListener('click', () => { lista.hidden = !lista.hidden; if (!lista.hidden) ritaLista(); });
  $('px-lista-stang').addEventListener('click', () => { lista.hidden = true; });

  // ---------- surfa ----------
  function byttAdress(u) {
    barFalt.value = visa(u);
    const ny = new URL(location.href);
    ny.search = '?u=' + encodeURIComponent(u);
    if (ny.href !== location.href) history.replaceState({ u }, '', ny);
  }
  async function surfa(u, ny = true) {
    visaFel('');
    document.body.classList.add('surfar');
    surf.hidden = false;
    barFalt.value = visa(u);
    laddar.classList.add('pa');
    try { await starta(); } catch (e) {
      console.error('AdRaze Proxy:', e);
      stang(false);
      visaFel(e.message === t.eStod ? t.eStod : t.eStart);
      return;
    }
    if (ny) history.pushState({ u }, '', '?u=' + encodeURIComponent(u));
    frame.go(u);
  }
  function stang(historik = true) {
    document.body.classList.remove('surfar');
    surf.hidden = true;
    lista.hidden = true;
    laddar.classList.remove('pa');
    document.title = document.querySelector('meta[property="og:title"]')?.content || startTitel;
    if (historik && location.search) history.pushState({}, '', location.pathname);
    // Töm ramen så att sidan slutar spela ljud o.d.
    if (frame) frame.frame.src = 'about:blank';
  }
  const startTitel = document.title;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = tolka(falt.value);
    if (!u) { visaFel(t.eAdress); falt.focus(); return; }
    surfa(u);
  });
  falt.addEventListener('input', () => visaFel(''));
  for (const b of rot.querySelectorAll('[data-ga]')) b.addEventListener('click', () => surfa(b.dataset.ga));
  barForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = tolka(barFalt.value);
    if (u) { barFalt.blur(); surfa(u); }
  });
  barFalt.addEventListener('focus', () => barFalt.select());
  $('px-bak').addEventListener('click', () => frame?.back());
  $('px-fram').addEventListener('click', () => frame?.forward());
  $('px-om').addEventListener('click', () => { laddar.classList.add('pa'); frame?.reload(); });
  $('px-stang').addEventListener('click', () => stang());
  $('px-hem').addEventListener('click', (e) => { e.preventDefault(); stang(); });
  document.addEventListener('keydown', (e) => {
    if (surf.hidden) return;
    if (e.key === 'Escape' && !lista.hidden) lista.hidden = true;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); barFalt.focus(); }
  });
  window.addEventListener('popstate', () => {
    const u = new URLSearchParams(location.search).get('u');
    if (u) surfa(u, false); else if (!surf.hidden) stang(false);
  });

  // Länk som /?u=https://… öppnar sidan direkt
  const start = new URLSearchParams(location.search).get('u');
  if (start) { const u = tolka(start); if (u) surfa(u, false); }
  // Förvärm motorn direkt (service worker, regler, krypterad anslutning), så att första sidan inte väntar på den
  const forvarm = () => starta().catch(() => {});
  if (!start) ('requestIdleCallback' in window ? requestIdleCallback(forvarm, { timeout: 1500 }) : setTimeout(forvarm, 300));
})();
