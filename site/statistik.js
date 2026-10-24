// Statistiksidan: hämtar summan för alla användare, räknar upp till den och tickar vidare live
(() => {
  const sida = document.getElementById('statistik');
  const API = sida.dataset.api;
  const tal = new Intl.NumberFormat(sida.dataset.lang || 'sv');
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const visat = new Map();
  // Allt som stoppats: annonser, spårare, farliga sidor, popups och omdirigeringar
  const allt = (s) => s.reklam + s.sparare + s.farliga + s.popups + s.omdirigeringar;

  // Räkna upp från förra värdet till det nya (första gången från noll), snabbt i början och mjukt mot slutet
  function rakna(el, till, ms = 1600) {
    const fran = visat.get(el) ?? 0;
    visat.set(el, till);
    if (el.id === 'st-reklam') el.classList.toggle('lang', tal.format(till).length > 9);
    if (lugn || fran === till) { el.textContent = tal.format(till); return; }
    const start = performance.now();
    const steg = (t) => {
      const p = Math.min(1, (t - start) / ms);
      el.textContent = tal.format(Math.round(fran + (till - fran) * (1 - Math.pow(1 - p, 4))));
      if (p < 1) requestAnimationFrame(steg);
    };
    requestAnimationFrame(steg);
  }

  async function hamta() {
    const r = await fetch(`${API}/stats/global`);
    if (!r.ok) return;
    const { totalt, idag } = await r.json();
    const forst = !visat.size;
    const reklam = $('st-reklam');
    if (!forst && allt(totalt) > visat.get(reklam)) { reklam.classList.remove('tick'); void reklam.offsetWidth; reklam.classList.add('tick'); }
    const ms = forst ? 1600 : 900;
    rakna(reklam, allt(totalt), ms);
    rakna($('st-annonser'), totalt.reklam, ms);
    rakna($('st-sparare'), totalt.sparare, ms);
    rakna($('st-farliga'), totalt.farliga, ms);
    rakna($('st-popups'), totalt.popups + totalt.omdirigeringar, ms);
    rakna($('st-idag'), allt(idag), ms);
  }

  // Din egen siffra, om du är inloggad (flaggan sätts av kontosidan)
  async function egen() {
    if (!/(?:^|; )adraze-inloggad=1/.test(document.cookie)) return;
    const r = await fetch(`${API}/me`, { credentials: 'include' });
    if (!r.ok) return;
    const { totalt } = await r.json();
    $('egen-ut').hidden = true;
    $('egen-in').hidden = false;
    rakna($('egen-reklam'), allt(totalt));
  }

  hamta().catch(() => {});
  egen().catch(() => {});
  setInterval(() => { if (!document.hidden) hamta().catch(() => {}); }, 60_000);
})();
