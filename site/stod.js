// Stödsidan: välj belopp, servern skapar en Stripe-kassa som bäddas in i kortet till höger
(() => {
  const sida = document.getElementById('stodsida');
  const API = sida.dataset.api;
  const $ = (id) => document.getElementById(id);
  const chips = [...document.querySelectorAll('.sd-chip')];
  const eget = $('sd-eget');
  let kassa = null;

  const visaFel = (text) => { $('sd-fel').textContent = text; $('sd-fel').hidden = !text; };
  const valt = () => (eget.value ? Number(eget.value) : Number(chips.find((c) => c.getAttribute('aria-checked') === 'true')?.dataset.belopp));

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
    const belopp = Math.round(valt());
    if (!(belopp >= 20 && belopp <= 5000)) return visaFel(sida.dataset.gransfel);
    const knapp = $('sd-fortsatt');
    knapp.disabled = true;
    try {
      const r = await fetch(`${API}/stod/kassa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ belopp, sprak: sida.dataset.lang }) });
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
      $('sd-tack-text').textContent = sida.dataset.tack.replace('{belopp}', new Intl.NumberFormat(sida.dataset.lang).format(d.belopp));
      history.replaceState(null, '', location.pathname);
    }).catch(() => {});
  }
})();
