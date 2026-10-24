// Ett supportärende: tråden med teamet och en ruta för att svara.
// Länken från mejlet bär nyckeln efter # (skickas aldrig till servern i adressen); #nr=XXXX öppnar ett eget ärende via kontot.
(() => {
  const $ = (id) => document.getElementById(id);
  const sida = $('ar');
  const API = sida.dataset.api;
  const hash = decodeURIComponent(location.hash.slice(1));
  const viaKonto = hash.startsWith('nr=') ? hash.slice(3) : null;
  const nyckel = viaKonto ? null : hash;

  async function api(sokvag, kropp) {
    const r = await fetch(API + sokvag, { method: 'POST', credentials: viaKonto ? 'include' : 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kropp) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw Object.assign(new Error(sida.dataset.lang === 'sv' && j.error ? j.error : sida.dataset.fel), { status: r.status });  // serverns texter är på svenska
    return j;
  }
  const las = () => (viaKonto ? api('/support/mitt', { nr: viaKonto }) : api('/support/arende', { nyckel }));
  const svara = (text) => (viaKonto ? api('/support/mitt/svara', { nr: viaKonto, text }) : api('/support/svara', { nyckel, text }));

  const statusText = (s) => $('ar-statustext').content.querySelector(`[data-s="${s}"]`)?.textContent || s;
  const tid = new Intl.DateTimeFormat(document.documentElement.lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function rita(a) {
    $('ar-nr').textContent = `#${a.nr}`;
    $('ar-amne').textContent = a.amne;
    $('ar-status').textContent = statusText(a.status);
    $('ar-status').className = `ar-status sup-pill s-${a.status}`;
    $('ar-stangd').hidden = a.status !== 'stangd';
    $('ar-trad').replaceChildren(...a.meddelanden.map((m) => {
      const li = document.createElement('li');
      li.className = `ar-m ${m.fran === 'team' ? 'ar-team' : 'ar-du'}`;
      const vem = Object.assign(document.createElement('p'), { className: 'ar-vem' });
      if (m.fran === 'team') vem.append(Object.assign(document.createElement('img'), { src: '/logo-mark.svg', alt: '', width: 22, height: 22 }));
      vem.append(`${m.fran === 'team' ? `${m.namn || sida.dataset.team}, AdRaze` : sida.dataset.du} · ${tid.format(m.skapad)}`);
      const text = Object.assign(document.createElement('div'), { className: 'ar-text', textContent: m.text });
      li.append(vem, text);
      return li;
    }));
    document.title = `#${a.nr} ${a.amne}`;
  }

  (async () => {
    if (!hash || (!viaKonto && hash.length < 32)) { $('ar-laddar').hidden = true; $('ar-saknas').hidden = false; return; }
    try {
      rita((await las()).arende);
      $('ar-laddar').hidden = true; $('ar-vy').hidden = false;
    } catch {
      $('ar-laddar').hidden = true; $('ar-saknas').hidden = false;
    }
  })();

  const form = $('ar-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    $('ar-fel').hidden = true;
    if (!text) { form.text.setAttribute('aria-invalid', 'true'); form.text.focus(); return; }
    form.text.removeAttribute('aria-invalid');
    const knapp = $('ar-skicka'), etikett = knapp.querySelector('span'), forut = etikett.textContent;
    knapp.disabled = true; etikett.textContent = sida.dataset.skickar;
    try {
      rita((await svara(text)).arende);
      form.text.value = '';
      $('ar-trad').lastElementChild?.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      $('ar-fel').textContent = err.message; $('ar-fel').hidden = false;
    } finally {
      knapp.disabled = false; etikett.textContent = forut;
    }
  });
})();
