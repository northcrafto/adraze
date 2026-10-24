// Supportpanelen: lista ärenden, läs tråden, svara (mejlas till kunden) och byt status
(() => {
  const $ = (id) => document.getElementById(id);
  const API = $('tm').dataset.api;
  let alla = [], filter = 'aktiva', valt = null;

  async function api(sokvag, kropp) {
    const r = await fetch(API + sokvag, {
      method: kropp ? 'POST' : 'GET', credentials: 'include',
      headers: kropp ? { 'content-type': 'application/json' } : {}, body: kropp ? JSON.stringify(kropp) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw Object.assign(new Error(j.error || 'Något gick fel.'), { status: r.status });
    return j;
  }

  const KAT = { tillagg: 'Tillägget', webblasare: 'Webbläsaren', konto: 'Konto', betalning: 'Betalning', annat: 'Annat' };
  const STATUS = { oppen: 'Väntar på oss', besvarad: 'Besvarad', stangd: 'Avslutad' };
  const tid = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  // "Att göra" = öppna ärenden där kunden skrev sist
  const passar = (a) => filter === 'alla' || (filter === 'aktiva' ? a.status === 'oppen' : a.status === filter);

  function ritaLista() {
    $('tm-n-aktiva').textContent = alla.filter((a) => a.status === 'oppen').length || '';
    const synliga = alla.filter(passar);
    $('tm-tom').hidden = synliga.length > 0;
    $('tm-lista').replaceChildren(...synliga.map((a) => {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'tm-rad bar-hover' });
      b.setAttribute('aria-current', String(a.nr === valt));
      const topp = Object.assign(document.createElement('span'), { className: 'tm-rad-topp' });
      topp.append(Object.assign(document.createElement('b'), { textContent: a.namn || a.email }), Object.assign(document.createElement('time'), { textContent: tid.format(a.uppdaterad) }));
      const amne = Object.assign(document.createElement('span'), { className: 'tm-rad-amne', textContent: a.amne });
      const snutt = Object.assign(document.createElement('span'), { className: 'tm-rad-snutt', textContent: `${a.senast_fran === 'team' ? 'Du: ' : ''}${a.senast_text}` });
      const etikett = Object.assign(document.createElement('span'), { className: `sup-pill s-${a.status}`, textContent: `${STATUS[a.status]} · ${KAT[a.kategori] || a.kategori}` });
      b.append(topp, amne, snutt, etikett);
      b.addEventListener('click', () => oppna(a.nr));
      li.append(b);
      return li;
    }));
  }

  function ritaArende(a) {
    valt = a.nr;
    history.replaceState(null, '', `#${a.nr}`);
    $('tm-valj').hidden = true; $('tm-vy').hidden = false;
    $('tm-nr').textContent = `#${a.nr} · ${KAT[a.kategori] || a.kategori} · ${a.sprak.toUpperCase()}`;
    $('tm-amne').textContent = a.amne;
    $('tm-fran').textContent = `${a.namn ? `${a.namn} · ` : ''}${a.email}${a.konto ? ' · har konto' : ''}`;
    for (const k of document.querySelectorAll('.tm-status button')) k.setAttribute('aria-pressed', String(k.dataset.s === a.status));
    $('tm-trad').replaceChildren(...a.meddelanden.map((m) => {
      const li = document.createElement('li');
      li.className = `ar-m ${m.fran === 'team' ? 'ar-du' : 'ar-team'}`; // i panelen är teamet "du" (höger)
      li.append(Object.assign(document.createElement('p'), { className: 'ar-vem', textContent: `${m.fran === 'team' ? `${m.namn || 'AdRaze'} (teamet)` : (a.namn || a.email)} · ${tid.format(m.skapad)}` }),
        Object.assign(document.createElement('div'), { className: 'ar-text', textContent: m.text }));
      return li;
    }));
    const i = alla.findIndex((x) => x.nr === a.nr);
    if (i >= 0) alla[i] = { ...alla[i], status: a.status, uppdaterad: a.uppdaterad };
    ritaLista();
  }

  async function oppna(nr) {
    try { ritaArende((await api('/support/team/arende', { nr })).arende); } catch (e) { alert(e.message); }
  }

  async function hamta() {
    const d = await api('/support/team/lista');
    alla = d.arenden;
    ritaLista();
  }

  (async () => {
    try { $('tm-jag').textContent = (await api('/me')).me.email; } catch {}
    try { await hamta(); }
    catch (e) {
      $('tm-info').hidden = true; $('tm-ut').hidden = false;
      if (e.status === 403) $('tm-ut-text').textContent = 'Kontot du är inloggad med är inte med i AdRaze-teamet.';
      return;
    }
    $('tm-info').hidden = true; $('tm-grid').hidden = false;
    const fran = location.hash.slice(1);
    if (/^[A-Z0-9]{6}$/.test(fran)) oppna(fran);
    // Nya ärenden dyker upp av sig själva
    setInterval(() => { if (!document.hidden) hamta().catch(() => {}); }, 30_000);
  })();

  for (const f of document.querySelectorAll('.tm-filter button')) f.addEventListener('click', () => {
    filter = f.dataset.f;
    for (const g of document.querySelectorAll('.tm-filter button')) g.setAttribute('aria-selected', String(g === f));
    ritaLista();
  });

  for (const k of document.querySelectorAll('.tm-status button')) k.addEventListener('click', async () => {
    if (!valt) return;
    try { ritaArende((await api('/support/team/status', { nr: valt, status: k.dataset.s })).arende); } catch (e) { alert(e.message); }
  });

  const form = $('tm-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    $('tm-fel').hidden = true;
    if (!text || !valt) return form.text.focus();
    const knapp = $('tm-skicka'), etikett = knapp.querySelector('span');
    knapp.disabled = true; etikett.textContent = 'Skickar …';
    try {
      const d = await api('/support/team/svara', { nr: valt, text });
      ritaArende(d.arende);
      form.text.value = '';
      if (!d.mejlat) { $('tm-fel').textContent = 'Svaret sparades men mejlet gick inte iväg (mejltaket eller Brevo). Kunden ser det på sin länk.'; $('tm-fel').hidden = false; }
    } catch (err) {
      $('tm-fel').textContent = err.message; $('tm-fel').hidden = false;
    } finally {
      knapp.disabled = false; etikett.textContent = 'Skicka svaret';
    }
  });
})();
