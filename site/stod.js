// Stödsidan: välj belopp, servern skapar en Stripe-kassa som bäddas in i kortet till höger
(() => {
  const sida = document.getElementById('stodsida');
  const API = sida.dataset.api;
  const $ = (id) => document.getElementById(id);
  const chips = [...document.querySelectorAll('.sd-chip')];
  const eget = $('sd-eget');
  let kassa = null;

  const visaFel = (text) => { $('sd-fel').textContent = text; $('sd-fel').hidden = !text; };
  // Stripes gränser i ören: minst 3 kr, högst 999 999,99 kr
  const MIN = 300, MAX = 99_999_999;
  const kr = (ore) => new Intl.NumberFormat(sida.dataset.lang, { minimumFractionDigits: ore % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(ore / 100);
  // Eget belopp tål både 12,50 och 12.50 samt mellanslag som tusentalsavgränsare
  const tolka = (text) => {
    const t = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
  };
  const valt = () => (eget.value.trim() ? tolka(eget.value) : Number(chips.find((c) => c.getAttribute('aria-checked') === 'true')?.dataset.belopp) * 100);

  for (const c of chips) {
    c.addEventListener('click', () => {
      for (const x of chips) x.setAttribute('aria-checked', String(x === c));
      eget.value = '';
      visaFel('');
    });
  }
  eget.addEventListener('input', () => {
    for (const x of chips) x.setAttribute('aria-checked', String(!eget.value && x.dataset.belopp === '49'));
    visaFel('');
  });

  async function oppna() {
    const ore = valt();
    if (!(ore >= MIN && ore <= MAX)) return visaFel(sida.dataset.gransfel.replace('{min}', kr(MIN)).replace('{max}', kr(MAX)));
    const knapp = $('sd-fortsatt');
    knapp.disabled = true;
    try {
      const r = await fetch(`${API}/stod/kassa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ belopp: ore / 100, sprak: sida.dataset.lang }) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      kassa?.destroy();
      kassa = await Stripe(d.publishableKey).createEmbeddedCheckoutPage({ fetchClientSecret: async () => d.clientSecret });
      $('sd-gubbe').hidden = true;
      $('sd-kassa').hidden = false;
      $('sd-andra').hidden = false;
      kassa.mount('#sd-kassa');
      if (matchMedia('(max-width: 900px)').matches) $('sd-kort').scrollIntoView({ block: 'start' });
    } catch {
      visaFel(sida.dataset.fel);
    } finally {
      knapp.disabled = false;
    }
  }
  $('sd-fortsatt').addEventListener('click', oppna);
  eget.addEventListener('keydown', (e) => { if (e.key === 'Enter') oppna(); });

  $('sd-andra').addEventListener('click', () => {
    kassa?.destroy();
    kassa = null;
    $('sd-kassa').hidden = true;
    $('sd-andra').hidden = true;
    $('sd-gubbe').hidden = false;
  });

  // Tillbaka från Stripe efter betalningen: ?klar=<kassans id>
  const klar = new URLSearchParams(location.search).get('klar');
  if (klar) {
    fetch(`${API}/stod/status?id=${encodeURIComponent(klar)}`).then((r) => r.json()).then((d) => {
      if (d.status !== 'complete') return;
      $('sd-val').hidden = true;
      $('sd-tack').hidden = false;
      $('sd-tack-text').textContent = sida.dataset.tack.replace('{belopp}', kr(Math.round(d.belopp * 100)));
      history.replaceState(null, '', location.pathname);
    }).catch(() => {});
  }
})();
