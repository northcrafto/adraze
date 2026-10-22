// Kontosidan: logga in / skapa konto / kod i mejlet / glömt lösenord, och statistiken från tillägget
const $ = (s, r = document) => r.querySelector(s);
const sida = $('#konto');
const API = sida.dataset.api;
const T = Object.fromEntries([...$('#texter').content.querySelectorAll('[data-k]')].map((e) => [e.dataset.k, e.textContent.trim()]));
const svenska = sida.dataset.lang === 'sv';
const tal = new Intl.NumberFormat(document.documentElement.lang || 'sv');

// ---------- API ----------
// Servern svarar på svenska; på andra språk visas våra egna översatta texter utifrån vad som gick fel
async function api(sokvag, kropp, felTexter = {}) {
  let r;
  try {
    r = await fetch(API + sokvag, {
      method: kropp ? 'POST' : 'GET', credentials: 'include',
      headers: kropp ? { 'content-type': 'application/json' } : {},
      body: kropp ? JSON.stringify(kropp) : undefined,
    });
  } catch { throw new Error(T.err_network); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    const e = new Error(svenska && j.error ? j.error : felTexter[r.status] || (r.status === 429 ? T.err_wait : T.err_generic));
    e.status = r.status;
    throw e;
  }
  return j;
}

// ---------- utloggad: steg ----------
const meddelande = $('#meddelande');
const visaMeddelande = (text, bra) => { meddelande.textContent = text || ''; meddelande.classList.toggle('bra', !!bra); };
const flikar = $('#flikar');
let lage = { email: '', syfte: '' }; // pågående kodsteg

function visaSteg(steg) {
  for (const f of document.querySelectorAll('.ut .steg')) f.hidden = f.dataset.steg !== steg;
  flikar.hidden = !(steg === 'in' || steg === 'skapa');
  $('#google-ruta').hidden = !(steg === 'in' || steg === 'skapa') || !googleKlar;
  if (steg === 'in' || steg === 'skapa') {
    flikar.dataset.vald = steg;
    for (const b of flikar.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.flik === steg));
  }
  visaMeddelande('');
  const forsta = $(`.steg[data-steg="${steg}"] input:not([type=hidden])`);
  if (forsta && matchMedia('(pointer:fine)').matches) forsta.focus();
}
flikar.addEventListener('click', (e) => { const b = e.target.closest('[data-flik]'); if (b) visaSteg(b.dataset.flik); });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ga]');
  if (!b) return;
  if (b.dataset.ga === 'glomt') { $('#f-glomt').email.value = $('#f-in').email.value; visaSteg('glomt'); }
  if (b.dataset.ga === 'tillbaka') visaSteg('in');
});

// Knappen låses medan ett anrop pågår
async function medKnapp(form, fn) {
  const knapp = form.querySelector('[type=submit]');
  knapp.disabled = true;
  visaMeddelande('');
  try { await fn(); } catch (e) { visaMeddelande(e.message); } finally { knapp.disabled = false; }
}
const giltigMejl = (s) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.trim());
function kontrollera(form, losenMin) {
  const email = form.email, pass = form.password;
  if (email && !giltigMejl(email.value)) { email.setAttribute('aria-invalid', 'true'); email.focus(); throw new Error(T.err_email); }
  email?.removeAttribute('aria-invalid');
  if (pass && pass.value.length < (losenMin || 1)) { pass.setAttribute('aria-invalid', 'true'); pass.focus(); throw new Error(T.err_password); }
  pass?.removeAttribute('aria-invalid');
}

function tillKod(svar) {
  lage = { email: svar.email, syfte: svar.syfte };
  $('#kod-till').textContent = svar.email;
  $('#nytt-losen').hidden = svar.syfte !== 'reset';
  $('#kod-knapp').textContent = svar.syfte === 'reset' ? T.reset_btn : T.code_btn;
  rensaKod();
  visaSteg('kod');
  kodrutor[0].focus();
}

$('#f-in').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  medKnapp(f, async () => {
    kontrollera(f);
    const svar = await api('/auth/login', { email: f.email.value, password: f.password.value }, { 401: T.err_login });
    svar.steg === 'kod' ? tillKod(svar) : inloggad();
  });
});
$('#f-skapa').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  medKnapp(f, async () => {
    kontrollera(f, 8);
    tillKod(await api('/auth/signup', { email: f.email.value, password: f.password.value }, { 409: T.err_exists, 400: T.err_password }));
  });
});
$('#f-glomt').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  medKnapp(f, async () => { kontrollera(f); tillKod(await api('/auth/forgot', { email: f.email.value })); });
});

// ---------- sex kodrutor: skriv, klistra in, backsteg, piltangenter ----------
const kodrutor = [...$('#kodrutor').querySelectorAll('input')];
const kodNu = () => kodrutor.map((i) => i.value).join('');
function rensaKod() { for (const i of kodrutor) { i.value = ''; i.classList.remove('fylld'); } }
function fyllKod(siffror, fran = 0) {
  [...siffror].slice(0, 6 - fran).forEach((s, n) => { kodrutor[fran + n].value = s; kodrutor[fran + n].classList.add('fylld'); });
  const nasta = Math.min(fran + siffror.length, 5);
  kodrutor[nasta].focus();
  if (kodNu().length === 6 && lage.syfte !== 'reset') $('#f-kod').requestSubmit();
}
kodrutor.forEach((ruta, n) => {
  ruta.addEventListener('input', () => {
    const siffror = ruta.value.replace(/\D/g, '');
    ruta.value = '';
    ruta.classList.remove('fylld');
    if (siffror) fyllKod(siffror, n);
  });
  ruta.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !ruta.value && n > 0) { kodrutor[n - 1].value = ''; kodrutor[n - 1].classList.remove('fylld'); kodrutor[n - 1].focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && n > 0) kodrutor[n - 1].focus();
    if (e.key === 'ArrowRight' && n < 5) kodrutor[n + 1].focus();
  });
  ruta.addEventListener('paste', (e) => {
    const siffror = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!siffror) return;
    e.preventDefault();
    fyllKod(siffror, siffror.length >= 6 ? 0 : n);
  });
  ruta.addEventListener('focus', () => ruta.select());
});
function skaka() { const r = $('#kodrutor'); r.classList.remove('skak'); void r.offsetWidth; r.classList.add('skak'); }

$('#f-kod').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  medKnapp(f, async () => {
    if (kodNu().length !== 6) { skaka(); throw new Error(T.err_code); }
    try {
      if (lage.syfte === 'reset') {
        if (f.password.value.length < 8) { f.password.focus(); throw new Error(T.err_password); }
        await api('/auth/reset', { email: lage.email, code: kodNu(), password: f.password.value }, { 400: T.err_code, 410: T.err_code });
      } else {
        await api('/auth/verify', { email: lage.email, code: kodNu() }, { 400: T.err_code, 410: T.err_code });
      }
    } catch (fel) {
      if (fel.status === 400 || fel.status === 410) { skaka(); rensaKod(); kodrutor[0].focus(); }
      throw fel;
    }
    inloggad();
  });
});
$('#ny-kod').addEventListener('click', async () => {
  try {
    await api('/auth/resend', { email: lage.email, syfte: lage.syfte });
    visaMeddelande(T.code_sent, true);
  } catch (e) { visaMeddelande(e.message); }
});

// ---------- Google ----------
let googleKlar = false;
async function startaGoogle(clientId) {
  if (!clientId) return;
  await new Promise((ok, fel) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = fel; document.head.append(s); });
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async ({ credential }) => {
      try { await api('/auth/google', { credential }); inloggad(); } catch (e) { visaMeddelande(e.message); }
    },
  });
  const ruta = $('#google-knapp');
  google.accounts.id.renderButton(ruta, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(ruta.clientWidth || 360, 400), locale: document.documentElement.lang });
  googleKlar = true;
  const steg = $('.ut .steg:not([hidden])')?.dataset.steg;
  $('#google-ruta').hidden = !(steg === 'in' || steg === 'skapa');
}

// ---------- tillägget (content/konto.js svarar via postMessage) ----------
const harTillagg = () => !!document.documentElement.dataset.adraze;
function fragaTillagg(typ, data = {}) {
  return new Promise((ok) => {
    if (!harTillagg()) return ok(null);
    const lyss = (e) => {
      if (e.source !== window || e.data?.adraze !== 'tillagg' || e.data.typ !== typ) return;
      removeEventListener('message', lyss);
      ok(e.data.svar);
    };
    addEventListener('message', lyss);
    postMessage({ adraze: 'sida', typ, ...data }, location.origin);
    setTimeout(() => { removeEventListener('message', lyss); ok(null); }, 2000);
  });
}
const minEnhet = () => { try { return Number(localStorage.getItem('adraze-enhet')) || 0; } catch { return 0; } };
// Flagga som startsidan läser för att visa "Mitt konto" i stället för "Logga in"
const markeraInloggad = (ja) => { try { ja ? localStorage.setItem('adraze-inloggad', '1') : localStorage.removeItem('adraze-inloggad'); } catch {} };
const sparaEnhet = (id) => { try { id ? localStorage.setItem('adraze-enhet', String(id)) : localStorage.removeItem('adraze-enhet'); } catch {} };

async function koppla(email) {
  const { token, id } = await api('/devices', {});
  await fragaTillagg('koppla', { token, email });
  sparaEnhet(id);
}

// ---------- inloggad ----------
let jag = null;
// Tillägget räknas som kopplat bara om det skickar statistik till kontot som är inloggat nu
const kopplatHit = (status) => !!status?.kopplad && status.email === jag?.email;
async function inloggad() {
  const data = await api('/me');
  jag = data.me;
  // Tillägget finns men är inte kopplat till det här kontot: koppla direkt, det är därför man loggar in
  const status = await fragaTillagg('status');
  if (status && !kopplatHit(status)) { try { await koppla(jag.email); } catch {} }
  await visaKonto(status ? await fragaTillagg('status') : null);
}

async function visaKonto(status) {
  const data = await api('/me');
  jag = data.me;
  markeraInloggad(true);
  $('#vy-ut').hidden = true;
  $('#vy-in').hidden = false;
  $('#min-mejl').textContent = jag.email;
  halsa(jag.namn);
  $('#radera-losen').hidden = !jag.losenord;
  const t = data.totalt;
  $('#s-reklam').textContent = tal.format(t.reklam);
  $('#s-sparare').textContent = tal.format(t.sparare);
  $('#s-farliga').textContent = tal.format(t.farliga);
  $('#s-popups').textContent = tal.format(t.popups + t.omdirigeringar);
  visaCitat(t.reklam);
  ritaDiagram(data.dagar);
  visaEnheter(data.enheter, status);
}

// ---------- Välkommen, <namn> ----------
// Varje bokstav blir en egen span som animeras in i tur och ordning (ord hålls ihop så att radbrytningen blir rätt)
const bokstaver = (text, start) => {
  const delar = [...new Intl.Segmenter(document.documentElement.lang, { granularity: 'grapheme' }).segment(text)].map((g) => g.segment);
  let i = start;
  const ut = [];
  let ord = null;
  for (const tecken of delar) {
    if (/\s/.test(tecken)) { ut.push(document.createTextNode(' ')); ord = null; continue; }
    if (!ord) { ord = Object.assign(document.createElement('span'), { className: 'hej-ord' }); ut.push(ord); }
    const b = Object.assign(document.createElement('span'), { className: 'hej-b', textContent: tecken });
    b.style.setProperty('--i', i++);
    ord.append(b);
  }
  return { noder: ut, antal: i - start };
};
let halsatMed = null;
function halsa(namn) {
  const form = $('#f-namn');
  form.hidden = !!namn;
  $('#byt-namn-rad').hidden = !namn;
  if (halsatMed === namn) return; // rita inte om (och animera inte igen) när bara statistiken uppdateras
  halsatMed = namn;
  const h = $('#hej');
  const text = namn ? T.welcome_name : T.welcome;
  h.setAttribute('aria-label', text.replace('{namn}', namn));
  const [fore, efter = ''] = text.split('{namn}');
  const a = bokstaver(fore, 0);
  const noder = [...a.noder];
  let antal = a.antal;
  if (namn) {
    const n = bokstaver(namn, antal);
    antal += n.antal;
    const ram = Object.assign(document.createElement('span'), { className: 'hej-namn' });
    ram.append(...n.noder);
    ram.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" vector-effect="non-scaling-stroke" d="M3 9C38 3 80 2 112 6s58 6 85-1"/></svg>');
    noder.push(ram);
    const b = bokstaver(efter, antal);
    antal += b.antal;
    noder.push(...b.noder);
  }
  for (const n of noder) if (n.nodeType === 1) n.setAttribute('aria-hidden', 'true');
  h.replaceChildren(...noder);
  // Linjen under namnet och raden under rubriken kommer när sista bokstaven landat
  $('#vy-in').style.setProperty('--efter', `${antal * 40 + 650}ms`);
}
// En ny rad vid varje inloggning: första gången alltid "Happy adblocking!", sedan slumpad men aldrig samma två gånger i rad
let citatVisat = false;
function visaCitat(reklam) {
  if (citatVisat) return;
  citatVisat = true;
  let forra = null;
  try { forra = localStorage.getItem('adraze-citat'); } catch {}
  const mojliga = Array.from({ length: 10 }, (_, i) => String(i + 1)).filter((n) => n !== forra && (n !== '5' || reklam > 0));
  const val = forra === null ? '1' : mojliga[Math.floor(Math.random() * mojliga.length)];
  try { localStorage.setItem('adraze-citat', val); } catch {}
  const text = T[`quote_${val}`].replace('{n}', tal.format(reklam));
  const p = $('#hej-citat');
  const ut = p.querySelector('span');
  p.setAttribute('aria-label', text);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ut.textContent = text; return; }
  const tecken = [...text];
  const start = parseInt(getComputedStyle($('#vy-in')).getPropertyValue('--efter'), 10) || 1000;
  let i = 0;
  setTimeout(function skriv() {
    p.classList.add('skriver');
    ut.textContent = tecken.slice(0, ++i).join('');
    if (i < tecken.length) setTimeout(skriv, 26 + Math.random() * 30);
    else p.classList.replace('skriver', 'klar');
  }, start + 350);
}

$('#byt-namn').addEventListener('click', () => {
  const form = $('#f-namn');
  form.hidden = false;
  form.namn.value = jag?.namn || '';
  form.namn.focus();
});
$('#f-namn').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const felRad = $('#namn-fel');
  const knapp = f.querySelector('[type=submit]');
  felRad.textContent = '';
  if (!f.namn.value.trim()) { f.namn.focus(); felRad.textContent = T.err_name; return; }
  knapp.disabled = true;
  api('/me/namn', { namn: f.namn.value }, { 400: T.err_name })
    .then(({ namn }) => { jag.namn = namn; halsa(namn); })
    .catch((fel) => { felRad.textContent = fel.message; })
    .finally(() => { knapp.disabled = false; });
});

function ritaDiagram(dagar) {
  const perDag = new Map(dagar.map((d) => [d.day, d.reklam + d.sparare + d.farliga + d.popups + d.omdirigeringar]));
  const lista = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const nyckel = d.toLocaleDateString('sv-SE');
    lista.push({ nyckel, etikett: d.toLocaleDateString(document.documentElement.lang, { day: 'numeric', month: 'short' }), n: perDag.get(nyckel) || 0 });
  }
  const max = Math.max(1, ...lista.map((d) => d.n));
  const summa = lista.reduce((s, d) => s + d.n, 0);
  $('#diagram').replaceChildren(...lista.map((d, i) => {
    const s = document.createElement('div');
    s.className = 'stapel' + (d.n ? '' : ' noll');
    s.dataset.tips = `${d.etikett}: ${tal.format(d.n)}`;
    const staplen = document.createElement('i');
    staplen.style.height = `${(d.n / max) * 100}%`;
    staplen.style.animationDelay = `${i * 18}ms`;
    s.append(staplen);
    return s;
  }));
  $('#diagram-summa').textContent = summa ? T.days_total.replace('{n}', tal.format(summa)) : '';
  $('#diagram-tom').hidden = summa > 0;
}

function visaEnheter(enheter, status) {
  const denHar = $('#den-har');
  const p = document.createElement('p');
  if (!harTillagg()) {
    p.textContent = T.ext_none;
    const a = Object.assign(document.createElement('a'), { className: 'btn liq', href: `${document.querySelector('.logo').getAttribute('href')}#installera`, textContent: T.ext_install });
    denHar.replaceChildren(p, a);
  } else if (kopplatHit(status)) {
    p.className = 'ok';
    p.textContent = T.ext_connected;
    denHar.replaceChildren(p);
  } else {
    const b =Object.assign(document.createElement('button'), { className: 'btn liq', type: 'button', textContent: T.ext_connect });
    b.addEventListener('click', async () => { b.disabled = true; try { await koppla(jag.email); await visaKonto(await fragaTillagg('status')); } catch { b.disabled = false; } });
    denHar.replaceChildren(b);
  }

  const mitt = minEnhet();
  const ul = $('#enheter');
  if (!enheter.length) { ul.replaceChildren(Object.assign(document.createElement('li'), { className: 'dov', textContent: T.ext_empty })); return; }
  ul.replaceChildren(...enheter.map((e) => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    const namn = document.createElement('b');
    namn.textContent = e.name;
    if (e.id === mitt && kopplatHit(status)) namn.append(Object.assign(document.createElement('span'), { className: 'mark', textContent: T.ext_this }));
    const tid = document.createElement('small');
    tid.textContent = `${T.ext_synced}: ${e.last_sync ? new Date(e.last_sync).toLocaleString(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' }) : T.ext_never}`;
    info.append(namn, tid);
    const ta = Object.assign(document.createElement('button'), { className: 'lank-knapp nav-link', type: 'button', textContent: T.ext_remove });
    ta.addEventListener('click', async () => {
      await api('/devices/remove', { id: e.id });
      if (e.id === mitt) { await fragaTillagg('koppla-bort'); sparaEnhet(0); }
      visaKonto(await fragaTillagg('status'));
    });
    li.append(info, ta);
    return li;
  }));
}

$('#logga-ut').addEventListener('click', async () => {
  try { await api('/auth/logout', {}); } catch {}
  markeraInloggad(false);
  location.reload();
});
$('#f-radera').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (!confirm(T.delete_confirm)) return;
  medKnapp(f, async () => {
    await api('/me/delete', { password: f.password.value }, { 401: T.err_login });
    await fragaTillagg('koppla-bort');
    sparaEnhet(0);
    markeraInloggad(false);
    location.reload();
  });
});

// ---------- start ----------
(async () => {
  try {
    const status = await fragaTillagg('status');
    await visaKonto(status);
  } catch (e) {
    if (e.status === 401) markeraInloggad(false);
    $('#vy-ut').hidden = false;
    visaSteg(new URLSearchParams(location.search).has('skapa') ? 'skapa' : 'in');
    if (e.status !== 401) visaMeddelande(e.message);
  } finally {
    sida.removeAttribute('aria-busy');
  }
  api('/auth/config').then((c) => startaGoogle(c.googleClientId)).catch(() => {});
})();
