/* Egen kassa i Falk-panelen (Stripe Payment Element), samma upplägg som
 * Skribias /checkout. Huvudprocessen (window.billing) pratar med backend och
 * lägger på kontots token; den här sidan ser aldrig nyckeln eller kortet
 * (kortfälten är Stripes egna iframes). Bara kort – inga omdirigeringar. */
(function () {
  const $ = (id) => document.getElementById(id);
  const brand = document.querySelector('[data-brand]');
  const BRAND = (brand && brand.textContent.trim()) || 'AdRaze';
  const LANG = (window.i18n && window.i18n.lang) || 'sv';
  // tx('Betala {pris}', { pris }) – platshållarna fylls i efter översättningen (reserv om i18n.js saknas)
  const tx = (s, v) => (typeof window.t === 'function' ? window.t(s, v) : (v ? s.replace(/\{([a-z]\w*)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m)) : s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (amount, currency) => {
    try { return new Intl.NumberFormat(LANG, { style: 'currency', currency: (currency || 'sek').toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100); }
    catch { return Math.round(amount / 100) + ' kr'; }
  };
  // Stripes språk (kortfälten och felen därifrån): samma som AdRaze där Stripe har det, annars engelska
  const STRIPE_LOCALE = (() => {
    const map = { 'pt': 'pt-BR', 'pt-PT': 'pt', 'no': 'nb', 'zh-CN': 'zh', 'zh-TW': 'zh-TW' };
    const ok = ['ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'he', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh', 'zh-TW'];
    const l = map[LANG] || LANG;
    return ok.includes(l) ? l : 'en';
  })();
  // "79 kr / mån": "{pris} / mån" är en hel nyckel; det som står före/efter beloppet blir den mindre texten (<small>)
  function prisRad(el, pris, mall) {
    el.textContent = '';
    const i = mall.indexOf('{pris}');
    if (i < 0) { el.textContent = pris; return; }
    const fore = mall.slice(0, i).trim(), efter = mall.slice(i + 6).trim();
    const sm = (t) => { const s = document.createElement('small'); s.textContent = t; return s; };
    if (fore) el.append(sm(fore), ' ');
    el.append(pris);
    if (efter) el.append(' ', sm(efter));
    el.translate = false;   // redan översatt
  }
  document.querySelectorAll('[data-pris]').forEach((el) => {
    const pris = fmt(Number(el.dataset.pris), 'sek');
    prisRad(el, pris, el.dataset.per === 'ar' ? tx('{pris} / år') : tx('{pris} / mån'));
  });
  // Credits: hela meningen är en nyckel, antalet (fetstilt) sätts in efter att översättningen escapats
  (function () {
    const note = $('credits-note'); if (!note) return;
    let antal; try { antal = new Intl.NumberFormat(LANG).format(1000000); } catch { antal = '1 000 000'; }
    const b = '<b style="color:var(--ink)">' + esc(tx('{n} tokens', { n: antal })) + '</b>';
    note.innerHTML = esc(tx('Extra credits fyller på Falk med {antal} som gäller utöver månadstaket.')).split('{antal}').join(b);
  })();
  try { document.title = tx(document.title); } catch {}
  const APPEARANCE = {
    theme: 'night',
    variables: {
      colorPrimary: '#ff4b1f', colorBackground: '#1b1b1e', colorText: '#f2f2f4', colorTextSecondary: '#a1a1a8',
      colorTextPlaceholder: '#5f5f66', colorDanger: '#ff9a8a', fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, system-ui, sans-serif',
      fontSizeBase: '14px', borderRadius: '9px', spacingUnit: '4px',
    },
    rules: {
      '.Input': { border: '1px solid #34343a', boxShadow: 'none', padding: '11px 12px' },
      '.Input:focus': { border: '1px solid #f2f2f4', boxShadow: '0 0 0 3px rgba(255,75,31,.14)' },
      '.Input--invalid': { border: '1px solid #ff9a8a' },
      '.Label': { color: '#a1a1a8', fontSize: '12.5px', fontWeight: '500', marginBottom: '6px' },
      '.Tab': { border: '1px solid #34343a', backgroundColor: '#1b1b1e' },
      '.Tab--selected': { border: '1px solid #ff4b1f', boxShadow: 'inset 0 0 0 1px #ff4b1f', backgroundColor: '#1f1a18' },
      '.TabLabel': { color: '#a1a1a8', fontWeight: '600' }, '.TabIcon': { fill: '#a1a1a8' },
      '.TabLabel--selected': { color: '#f2f2f4' }, '.TabIcon--selected': { fill: '#ff4b1f' },
      '.Block': { border: '1px solid #26262a', backgroundColor: '#161618' },
    },
  };

  let plan = (location.hash || '').replace('#', '') || 'pro_month';
  if (!/^(pro_month|pro_year|credits)$/.test(plan)) plan = 'pro_month';
  let stripe = null, elements = null, current = null, seq = 0;

  function setError(msg) { const e = $('err'); if (!msg) { e.textContent = ''; e.classList.remove('on'); return; } e.textContent = msg; e.classList.add('on'); }
  function applyPlanUi() {
    document.querySelectorAll('.plan').forEach((b) => b.classList.toggle('on', b.dataset.plan === plan));
    const credits = plan === 'credits';
    $('plans').style.display = credits ? 'none' : '';
    $('credits-note').style.display = credits ? '' : 'none';
    const ss = $('secure-sub'); if (ss) ss.style.display = credits ? 'none' : '';
    $('title').textContent = credits ? tx('Köp extra credits') : tx('Skaffa {namn} Pro', { namn: BRAND });
    $('lead').textContent = credits ? tx('Betalas en gång. Fylls på direkt efter betalningen.') : tx('Falk och allt annat i Pro låses upp på ditt konto direkt efter betalningen.');
  }

  async function prepare() {
    const my = ++seq;
    setError(''); $('pay').disabled = true; $('loading').style.display = ''; $('sum').style.display = 'none';
    if (elements) { try { const pe = elements.getElement('payment'); pe && pe.unmount(); } catch {} elements = null; }
    let r;
    try { r = await window.billing.intent(plan); } catch { r = { ok: false, error: 'unreachable' }; }
    if (my !== seq) return;
    if (!r || !r.ok) {
      $('loading').style.display = 'none';
      if (r && r.error === 'already_pro') { setError(tx('Du har redan Pro på det här kontot. Tryck på tillbaka och sedan "Jag har redan Pro".')); return; }
      if (r && r.needLogin) { setError(tx('Logga in först (kontoknappen uppe till höger).')); return; }
      setError(tx((r && r.message) || 'Kunde inte förbereda betalningen. Kontrollera uppkopplingen och försök igen.'));
      return;
    }
    current = r;
    if (!stripe) { try { stripe = Stripe(r.publishable_key, { locale: STRIPE_LOCALE }); } catch { setError(tx('Stripe kunde inte laddas. Kontrollera uppkopplingen.')); $('loading').style.display = 'none'; return; } }
    elements = stripe.elements({ clientSecret: r.client_secret, appearance: APPEARANCE, locale: STRIPE_LOCALE });
    const pe = elements.create('payment', { layout: 'tabs', terms: { card: 'never' } });
    pe.mount('#payment-element');
    pe.on('ready', () => { if (my !== seq) return; $('loading').style.display = 'none'; $('pay').disabled = false; });
    pe.on('change', (ev) => { if (ev.error) setError(ev.error.message); else setError(''); });
    const amount = fmt(r.amount, r.currency);
    $('sum').style.display = '';
    $('sum-label').textContent = r.kind === 'subscription' ? (r.interval === 'year' ? tx('Att betala nu, sedan per år') : tx('Att betala nu, sedan per månad')) : tx('Att betala');
    $('sum-amount').textContent = amount;
    $('pay-label').textContent = tx('Betala {pris}', { pris: amount });
  }

  async function pay() {
    if (!stripe || !elements || !current) return;
    setError(''); $('pay').disabled = true; $('pay-label').textContent = tx('Betalar …');
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: 'https://adraze.app/' } });
    if (error) { setError(error.message || tx('Betalningen gick inte igenom.')); $('pay').disabled = false; $('pay-label').textContent = tx('Betala {pris}', { pris: fmt(current.amount, current.currency) }); return; }
    if (paymentIntent && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') { setError(tx('Betalningen är inte klar ({status}).', { status: paymentIntent.status })); $('pay').disabled = false; $('pay-label').textContent = tx('Försök igen'); return; }
    let c;
    try { c = await window.billing.confirm(current.kind === 'subscription' ? { subscription: current.subscription } : { payment_intent: current.payment_intent }); } catch { c = null; }
    if (current.kind === 'payment') {
      $('done-title').textContent = tx('Credits påfyllda');
      $('done-text').textContent = c && c.ok && c.credits != null ? tx('Tack! Du har nu {n} tokens i credits.', { n: c.credits.toLocaleString(LANG) }) : tx('Tack! Betalningen är genomförd. Dina credits fylls på inom kort.');
    } else if (!(c && c.ok && c.pro)) {
      $('done-text').textContent = tx('Betalningen är genomförd. Pro aktiveras på kontot inom någon minut – tryck "Jag har redan Pro" om det dröjer.');
    }
    document.body.classList.add('paid');
  }

  document.querySelectorAll('.plan').forEach((b) => b.addEventListener('click', () => { if (b.dataset.plan === plan) return; plan = b.dataset.plan; applyPlanUi(); prepare(); }));
  $('pay').addEventListener('click', pay);
  applyPlanUi();
  prepare();
})();
