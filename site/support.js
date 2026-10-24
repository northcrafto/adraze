// Supportsidan: skicka ett ärende och, inloggad, se dina tidigare ärenden
(() => {
  const $ = (id) => document.getElementById(id);
  const sida = $('sup');
  const API = sida.dataset.api, LANG = sida.dataset.lang;
  const pre = LANG === 'sv' ? '' : `/${LANG}`;
  const form = $('sup-form');

  async function api(sokvag, kropp) {
    const r = await fetch(API + sokvag, {
      method: kropp ? 'POST' : 'GET', credentials: 'include',
      headers: kropp ? { 'content-type': 'application/json' } : {}, body: kropp ? JSON.stringify(kropp) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw Object.assign(new Error(LANG === 'sv' && j.error ? j.error : sida.dataset.fel), { status: r.status });  // serverns texter är på svenska
    return j;
  }
  const visaFel = (text) => { $('sup-fel').textContent = text || ''; $('sup-fel').hidden = !text; };

  // Inloggad: mejlet tas från kontot och dina ärenden visas under formuläret
  let inloggad = null;
  (async () => {
    if (!/(?:^|; )adraze-inloggad=1/.test(document.cookie)) return;  // utloggad: fråga inte API:t i onödan
    try { inloggad = (await api('/me')).me; } catch { return; }
    $('sup-mejl').hidden = true;
    form.email.required = false;
    $('sup-inne').textContent = sida.dataset.inloggad.replace('{email}', inloggad.email);
    $('sup-inne').hidden = false;
    if (inloggad.namn && !form.namn.value) form.namn.value = inloggad.namn;
    visaMina();
  })();

  const statusText = (s) => $('sup-status').content.querySelector(`[data-s="${s}"]`)?.textContent || s;
  const datum = new Intl.DateTimeFormat(document.documentElement.lang, { day: 'numeric', month: 'short' });
  async function visaMina() {
    let d;
    try { d = await api('/support/mina'); } catch { return; }
    if (!d.arenden.length) return;
    $('sup-lista').replaceChildren(...d.arenden.map((a) => {
      const li = document.createElement('li');
      const l = Object.assign(document.createElement('a'), { className: 'sup-rad bar-hover', href: `${pre}/arende#nr=${a.nr}` });
      const amne = Object.assign(document.createElement('b'), { textContent: a.amne });
      const nr = Object.assign(document.createElement('span'), { className: 'sup-rad-nr', textContent: `#${a.nr} · ${datum.format(a.uppdaterad)}` });
      const st = Object.assign(document.createElement('span'), { className: `sup-pill s-${a.status}`, textContent: statusText(a.status) });
      l.append(amne, nr, st);
      li.append(l);
      return li;
    }));
    $('sup-mina').hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    visaFel('');
    for (const f of form.querySelectorAll('input[required], textarea[required]')) f.removeAttribute('aria-invalid');
    const tomma = [...form.querySelectorAll('input[required], textarea[required]')].filter((f) => !f.closest('[hidden]') && !f.value.trim());
    if (tomma.length) { tomma.forEach((f) => f.setAttribute('aria-invalid', 'true')); tomma[0].focus(); return; }
    if (!form.email.closest('[hidden]') && !form.email.checkValidity()) { form.email.setAttribute('aria-invalid', 'true'); form.email.focus(); return; }
    const knapp = $('sup-skicka'), etikett = knapp.querySelector('span'), forut = etikett.textContent;
    knapp.disabled = true; etikett.textContent = sida.dataset.skickar;
    try {
      const d = await api('/support/nytt', {
        kategori: form.kategori.value, namn: form.namn.value, email: form.email.value, amne: form.amne.value,
        text: form.text.value, webbplats: form.webbplats.value, sprak: LANG,
      });
      $('sup-tack-text').textContent = sida.dataset.tack.replace('{nr}', d.nr);
      $('sup-oppna').href = `${pre}/arende#${d.nyckel}`;
      form.hidden = true; $('sup-tack').hidden = false;
      $('sup-tack').querySelector('h2').focus?.();
      if (inloggad) visaMina();
    } catch (err) {
      visaFel(err.message);
    } finally {
      knapp.disabled = false; etikett.textContent = forut;
    }
  });

  $('sup-ny').addEventListener('click', () => {
    form.amne.value = ''; form.text.value = '';
    $('sup-tack').hidden = true; form.hidden = false; form.amne.focus();
  });
})();
