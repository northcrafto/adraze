// AdRaze Pro-sidan: köp Pro (prenumeration) och ge bort Pro (engångsgåva), inbäddad Stripe-kassa.
// Kontot bärs med inloggningskakan (credentials: include) mot api.adraze.app. Sidan ser aldrig Stripe-nyckeln eller kortet.
(() => {
  'use strict';
  const el = document.getElementById('propage');
  const API = el.dataset.api, LANG = el.dataset.lang || 'sv';
  const KONTO = el.dataset.konto, RETUR = el.dataset.retur;
  const T = JSON.parse(document.getElementById('pro-t').textContent);
  const $ = (id) => document.getElementById(id);
  const vis = (id, on) => { const e = $(id); if (e) e.hidden = !on; };
  const fmt = (ore, cur) => { try { return new Intl.NumberFormat(LANG, { style: 'currency', currency: (cur || 'sek').toUpperCase(), maximumFractionDigits: 0 }).format(ore / 100); } catch { return Math.round(ore / 100) + ' kr'; } };
  const fyll = (mall, v) => String(mall).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  const loginLank = KONTO + '?retur=' + encodeURIComponent(RETUR);
  $('pro-login-btn').href = loginLank; $('ge-login-btn').href = loginLank;

  async function api(sokvag, kropp) {
    let r;
    try {
      r = await fetch(API + sokvag, { method: kropp ? 'POST' : 'GET', credentials: 'include',
        headers: kropp ? { 'content-type': 'application/json' } : {}, body: kropp ? JSON.stringify(kropp) : undefined });
    } catch { return { ok: false, status: 0, d: {} }; }
    let d = null; try { d = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, d: d || {} };
  }

  let stripe = null;
  const APPEARANCE = { theme: 'stripe', variables: { colorPrimary: '#ff4b1f', borderRadius: '10px', fontFamily: 'Familjen Grotesk, system-ui, sans-serif' } };
  function getStripe(pk) { if (!stripe) { try { stripe = Stripe(pk); } catch { return null; } } return stripe; }
  // Monterar Payment Element för en client secret och returnerar { elements, klar(promise) }
  function montera(målId, pk, clientSecret, påKlar) {
    const s = getStripe(pk); if (!s) return null;
    const elements = s.elements({ clientSecret, appearance: APPEARANCE });
    const pe = elements.create('payment', { layout: 'tabs' });
    pe.mount('#' + målId);
    pe.on('ready', () => påKlar && påKlar());
    return { stripe: s, elements };
  }

  /* ---------------- Köp Pro ---------------- */
  let plan = 'pro_month', kop = null, köpPågår = false;
  function visaPriser() {
    document.querySelector('[data-pris-month]').innerHTML = T.month_price;
    document.querySelector('[data-pris-year]').innerHTML = T.year_price;
    document.querySelector('[data-bf]').hidden = !window.__bf;
  }
  async function förberedKöp() {
    $('pro-betala').disabled = true; felKöp('');
    $('pro-pay-element').innerHTML = '';
    const r = await api('/pro/intent', { plan });
    if (!r.ok) {
      if (r.d.error === 'already_pro') return visaHarPro(null);
      if (r.status === 401) return visaLogin();
      return felKöp(r.d.message || T.err_generic);
    }
    kop = r.d;
    const m = montera('pro-pay-element', r.d.publishable_key, r.d.client_secret, () => { $('pro-betala').disabled = false; });
    if (!m) return felKöp(T.err_generic);
    kop._stripe = m.stripe; kop._elements = m.elements;
    const belopp = plan === 'pro_month' && window.__bf ? r.d.amount : r.d.amount;
    $('pro-betala-text').textContent = fyll(T.pay_amount, { pris: fmt(r.d.amount, r.d.currency) });
  }
  const felKöp = (t) => { const e = $('pro-fel'); e.textContent = t; e.hidden = !t; };
  async function betala() {
    if (!kop || köpPågår) return; köpPågår = true;
    $('pro-betala').disabled = true; $('pro-betala-text').textContent = T.paying; felKöp('');
    const { error, paymentIntent } = await kop._stripe.confirmPayment({ elements: kop._elements, redirect: 'if_required' });
    if (error) { felKöp(error.message || T.err_generic); $('pro-betala').disabled = false; $('pro-betala-text').textContent = fyll(T.pay_amount, { pris: fmt(kop.amount, kop.currency) }); köpPågår = false; return; }
    if (paymentIntent && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') { felKöp(T.err_generic); $('pro-betala').disabled = false; köpPågår = false; return; }
    let c = await api('/pro/confirm', { subscription: kop.subscription });
    vis('pro-kop', false);
    $('pro-klar-titel').textContent = $('pro-klar-titel').textContent;
    $('pro-klar-text').textContent = (c.ok && c.d.pro) ? T.done_sub : T.done_slow;
    vis('pro-klar', true);
    köpPågår = false;
  }

  /* ---------------- Visa rätt tillstånd ---------------- */
  function visaLogin() { vis('pro-laddar', false); vis('pro-kop', false); vis('pro-har', false); vis('pro-login', true); vis('ge-sok', false); vis('ge-login', true); }
  function visaHarPro(until) {
    vis('pro-laddar', false); vis('pro-login', false); vis('pro-kop', false);
    $('pro-har-text').textContent = until ? fyll(T.have_until, { datum: new Date(until).toLocaleDateString(LANG) }) : T.have_forever;
    vis('pro-har', true);
  }
  function visaKöp() { vis('pro-laddar', false); vis('pro-login', false); vis('pro-har', false); vis('pro-kop', true); visaPriser(); förberedKöp(); }

  async function start() {
    // Black Friday-fönstret styr frontend-texten; backend avgör den faktiska rabatten.
    window.__bf = Date.now() < Date.parse('2026-12-03T00:00:00Z');
    const r = await api('/pro/status');
    if (r.status === 401 || r.status === 0) return visaLogin();
    vis('ge-login', false); vis('ge-sok', true);
    if (r.ok && r.d.pro) return visaHarPro(r.d.until);
    visaKöp();
  }

  document.querySelectorAll('.pro-plan').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.plan === plan) return;
    plan = b.dataset.plan;
    document.querySelectorAll('.pro-plan').forEach((x) => x.classList.toggle('on', x === b));
    förberedKöp();
  }));
  $('pro-betala').addEventListener('click', betala);

  /* ---------------- Ge bort Pro ---------------- */
  let geMan = 1, gåva = null, mottagare = null, gåvaPågår = false;
  const geFel = (t) => { const e = $('ge-fel'); e.textContent = t; e.hidden = !t; };
  const geBetalFel = (t) => { const e = $('ge-betal-fel'); e.textContent = t; e.hidden = !t; };
  document.querySelectorAll('[data-ge-pris="1"]').forEach((e) => e.textContent = T.gift_price_1);
  document.querySelectorAll('[data-ge-pris="12"]').forEach((e) => e.textContent = T.gift_price_12);

  async function kollaMottagare() {
    geFel('');
    const email = $('ge-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return geFel(T.err_generic);
    $('ge-kolla').disabled = true;
    const r = await api('/pro/gift/lookup', { email });
    $('ge-kolla').disabled = false;
    if (r.status === 401) return visaLogin();
    if (!r.ok || !r.d.found) return geFel(T.gift_notfound);
    mottagare = { email, namn: r.d.namn || '' };
    $('ge-namn').textContent = r.d.namn || email;
    $('ge-adress').textContent = email;
    vis('ge-sok', false); vis('ge-varning', true);
  }
  async function fortsattGåva() {
    vis('ge-varning', false);
    $('ge-till-namn').textContent = mottagare.namn || mottagare.email;
    vis('ge-kassa', true);
    geBetalFel(''); $('ge-betala').disabled = true; $('ge-pay-element').innerHTML = '';
    const r = await api('/pro/gift/intent', { email: mottagare.email, manader: geMan });
    if (!r.ok) { if (r.status === 401) return visaLogin(); vis('ge-kassa', false); vis('ge-varning', true); return geFel(r.d.message || T.err_generic); }
    gåva = r.d;
    const m = montera('ge-pay-element', r.d.publishable_key, r.d.client_secret, () => { $('ge-betala').disabled = false; });
    if (!m) return geBetalFel(T.err_generic);
    gåva._stripe = m.stripe; gåva._elements = m.elements;
    $('ge-betala-text').textContent = fyll(T.pay_amount, { pris: fmt(r.d.amount, r.d.currency) });
  }
  async function betalaGåva() {
    if (!gåva || gåvaPågår) return; gåvaPågår = true;
    $('ge-betala').disabled = true; $('ge-betala-text').textContent = T.paying; geBetalFel('');
    const { error, paymentIntent } = await gåva._stripe.confirmPayment({ elements: gåva._elements, redirect: 'if_required' });
    if (error) { geBetalFel(error.message || T.err_generic); $('ge-betala').disabled = false; $('ge-betala-text').textContent = fyll(T.pay_amount, { pris: fmt(gåva.amount, gåva.currency) }); gåvaPågår = false; return; }
    if (paymentIntent && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') { geBetalFel(T.err_generic); $('ge-betala').disabled = false; gåvaPågår = false; return; }
    const c = await api('/pro/gift/confirm', { payment_intent: (paymentIntent && paymentIntent.id) || gåva.client_secret.split('_secret')[0] });
    vis('ge-kassa', false);
    $('ge-klar-text').textContent = fyll(T.gift_done, { namn: mottagare.namn || mottagare.email });
    vis('ge-klar', true);
    gåvaPågår = false;
  }
  $('ge-kolla').addEventListener('click', kollaMottagare);
  $('ge-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); kollaMottagare(); } });
  $('ge-avbryt').addEventListener('click', () => { vis('ge-varning', false); vis('ge-sok', true); });
  document.querySelectorAll('.ge-p').forEach((b) => b.addEventListener('click', () => { geMan = Number(b.dataset.man); document.querySelectorAll('.ge-p').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('ge-fortsatt').addEventListener('click', fortsattGåva);
  $('ge-betala').addEventListener('click', betalaGåva);
  $('ge-igen').addEventListener('click', () => { vis('ge-klar', false); $('ge-email').value = ''; mottagare = null; gåva = null; geMan = 1; document.querySelectorAll('.ge-p').forEach((x, i) => x.classList.toggle('on', i === 0)); vis('ge-sok', true); });

  start();
})();
