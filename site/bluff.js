// Bluffkollen: skickar texten till api.adraze.app/kolla/bluff och ritar upp domen, skälen och råden.
// Ingenting sparas, varken här eller på servern, så resultatet har ingen egen adress.
(() => {
  const sida = document.getElementById('bluff');
  const API = sida.dataset.api, lang = sida.dataset.lang || 'sv';
  const T = JSON.parse(document.getElementById('bl-t').textContent);
  const $ = (id) => document.getElementById(id);
  const form = $('bl-form'), falt = $('bl-text'), fel = $('bl-fel'), res = $('bl-res');
  const tal = new Intl.NumberFormat(lang);
  const ren = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // {adress} och liknande fylls i och fetmarkeras; allt som kommer från servern körs genom ren() först
  const fyll = (mall, data = {}) => ren(mall).replace(/\{(\w+)\}/g, (_, k) => (k in data ? `<b>${ren(typeof data[k] === 'number' ? tal.format(data[k]) : data[k])}</b>` : ''));
  const alder = (d) => (d == null ? T.okand : d < 730 ? T.dagar.replace('{n}', tal.format(d)) : T.ar.replace('{n}', tal.format(Math.floor(d / 365))));

  function visa(r) {
    res.dataset.dom = r.dom;
    $('bl-dom').textContent = T[`dom_${r.dom}`];
    $('bl-dom-text').textContent = T[`text_${r.dom}`];
    const skal = r.skal.filter((s) => T[`s_${s.kod}`]);
    $('bl-skal').innerHTML = skal.length
      ? skal.map((s) => `<li data-niva="${ren(s.niva)}"><span>${fyll(T[`s_${s.kod}`], s.data)}</span></li>`).join('')
      : `<li data-niva="info"><span>${ren(T.inga_skal)}</span></li>`;
    $('bl-rad').innerHTML = r.rad.filter((k) => T[`r_${k}`]).map((k) => `<li><span>${ren(T[`r_${k}`])}</span></li>`).join('');
    $('bl-lankar-del').hidden = !r.lankar.length;
    $('bl-lankar').innerHTML = r.lankar.map((l) => {
      const lista = l.listor && l.listor.av ? `<span class="${l.listor.flaggad ? 'varn' : ''}">${ren(T.listor.replace('{n}', tal.format(l.listor.flaggad)).replace('{av}', tal.format(l.listor.av)))}</span>` : ren(T.okand);
      return `<tr><td>${ren(l.adress)}${l.via ? `<small>${ren(T.via.replace('{via}', l.via))}</small>` : ''}${l.officiell ? `<small>${ren(l.officiell)}</small>` : ''}</td><td>${ren(l.ip ? T.okand : alder(l.alder))}</td><td>${lista}</td></tr>`;
    }).join('');
    res.hidden = false;
    $('bl-dom').focus({ preventScroll: true });
    res.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  async function kolla(text) {
    fel.hidden = true;
    text = text.trim();
    if (!text) { fel.textContent = T.e_tom; fel.hidden = false; return; }
    const knapp = $('bl-knapp'), fore = knapp.innerHTML;
    form.classList.add('vantar'); knapp.firstChild.textContent = T.vantar;
    let svar;
    try {
      const r = await fetch(`${API}/kolla/bluff`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      svar = await r.json();
    } catch { svar = { ok: false, fel: 'okant' }; }
    form.classList.remove('vantar'); knapp.innerHTML = fore;
    if (!svar.ok) { fel.textContent = T[`e_${svar.fel}`] || T.e_okant; fel.hidden = false; return; }
    visa(svar);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); kolla(falt.value); });
  falt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); kolla(falt.value); } });
  document.querySelectorAll('[data-exempel]').forEach((b) => b.addEventListener('click', () => { falt.value = T[`ex_${b.dataset.exempel}`]; kolla(falt.value); }));
  $('bl-ny').addEventListener('click', () => { falt.value = ''; res.hidden = true; scrollTo({ top: 0, behavior: 'smooth' }); falt.focus(); });
})();
