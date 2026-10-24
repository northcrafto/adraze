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
// Flagga som adraze.app läser för att visa "Mitt konto" i stället för "Logga in". Kontot bor på
// accounts.adraze.app, så flaggan är en kaka för hela adraze.app (localStorage delas inte mellan subdomäner).
const markeraInloggad = (ja) => {
  const dom = location.hostname.endsWith('adraze.app') ? '; domain=adraze.app' : '';
  document.cookie = `adraze-inloggad=${ja ? '1' : ''}; path=/${dom}; max-age=${ja ? 90 * 86400 : 0}; secure; samesite=lax`;
  try { localStorage.removeItem('adraze-inloggad'); } catch {}
};
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
  visaAvatar(jag.avatar);
  $('#radera-losen').hidden = !jag.losenord;
  const t = data.totalt;
  $('#s-reklam').textContent = tal.format(t.reklam);
  $('#s-sparare').textContent = tal.format(t.sparare);
  $('#s-farliga').textContent = tal.format(t.farliga);
  $('#s-popups').textContent = tal.format(t.popups + t.omdirigeringar);
  visaCitat();
  ritaDiagram(data.dagar);
  visaEnheter(data.enheter, status);
}

// ---------- Profilbild ----------
// Bilden väljs, placeras i en cirkel (dra för att flytta, zooma med reglaget/hjulet/nyp) och sparas som 256×256 JPEG.
// Det som syns i cirkeln är exakt det som sparas.
function visaAvatar(avatar) {
  const img = $('#min-avatar');
  img.hidden = !avatar;
  if (avatar) img.src = avatar; else img.removeAttribute('src');
  $('#avatar-knapp').classList.toggle('har-bild', !!avatar);
  const text = avatar ? T.avatar_change : T.avatar_add;
  $('#byt-avatar').textContent = text;
  $('#avatar-knapp').setAttribute('aria-label', text);
  $('#avatar-bort').hidden = !avatar;
}

const AV = { bild: null, zoom: 1, x: 0, y: 0, bas: 1 }; // x/y = bildens mitt relativt cirkelns mitt, i scenpixlar
const avDialog = $('#avatar-dialog');
const avScen = $('#avatar-scen');
const avImg = $('#avatar-bild');
const avZoom = $('#avatar-zoom');
const scenStorlek = () => avScen.clientWidth;

// Bilden får aldrig lämna tomrum i cirkeln
function avBegrans() {
  const s = scenStorlek(), skala = AV.bas * AV.zoom;
  const maxX = Math.max(0, (AV.bild.naturalWidth * skala - s) / 2);
  const maxY = Math.max(0, (AV.bild.naturalHeight * skala - s) / 2);
  AV.x = Math.min(maxX, Math.max(-maxX, AV.x));
  AV.y = Math.min(maxY, Math.max(-maxY, AV.y));
}
function avRita() {
  if (!AV.bild) return;
  avBegrans();
  const skala = AV.bas * AV.zoom;
  avImg.style.width = AV.bild.naturalWidth * skala + 'px';
  avImg.style.height = AV.bild.naturalHeight * skala + 'px';
  avImg.style.transform = `translate(calc(-50% + ${AV.x}px), calc(-50% + ${AV.y}px))`;
}
function avSattZoom(z, kring) {
  const ny = Math.min(4, Math.max(1, z));
  // Zooma kring pekaren/mitten så att punkten under fingret står still
  if (kring) { const f = ny / AV.zoom; AV.x = kring.x - (kring.x - AV.x) * f; AV.y = kring.y - (kring.y - AV.y) * f; }
  else { const f = ny / AV.zoom; AV.x *= f; AV.y *= f; }
  AV.zoom = ny;
  avZoom.value = String(ny);
  avRita();
}

function oppnaAvatarFil() { $('#avatar-fil').value = ''; $('#avatar-fil').click(); }
$('#avatar-knapp').addEventListener('click', oppnaAvatarFil);
$('#byt-avatar').addEventListener('click', oppnaAvatarFil);
$('#avatar-ny').addEventListener('click', oppnaAvatarFil);
$('#avatar-fil').addEventListener('change', async (e) => {
  const fil = e.target.files && e.target.files[0];
  if (!fil) return;
  $('#avatar-fel').textContent = '';
  const url = URL.createObjectURL(fil);
  const bild = new Image();
  try { bild.src = url; await bild.decode(); } catch { URL.revokeObjectURL(url); visaMeddelandeIn(T.avatar_bad); return; }
  if (AV.bild && AV.bild.src.startsWith('blob:')) URL.revokeObjectURL(AV.bild.src);
  AV.bild = bild; AV.zoom = 1; AV.x = 0; AV.y = 0;
  avImg.src = url;
  if (!avDialog.open) avDialog.showModal();
  AV.bas = scenStorlek() / Math.min(bild.naturalWidth, bild.naturalHeight); // kortaste sidan fyller cirkeln
  avZoom.value = '1';
  avRita();
});
function visaMeddelandeIn(text) { if (avDialog.open) $('#avatar-fel').textContent = text; else $('#namn-fel').textContent = text; }

// Dra (mus + finger) och nyp för att zooma
const pekare = new Map();
let nypStart = null;
avScen.addEventListener('pointerdown', (e) => {
  if (!AV.bild) return;
  avScen.setPointerCapture(e.pointerId);
  pekare.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pekare.size === 2) { const [a, b] = [...pekare.values()]; nypStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: AV.zoom }; }
  avScen.classList.add('drar');
});
avScen.addEventListener('pointermove', (e) => {
  const forra = pekare.get(e.pointerId);
  if (!forra) return;
  const nu = { x: e.clientX, y: e.clientY };
  pekare.set(e.pointerId, nu);
  if (pekare.size === 2 && nypStart) {
    const [a, b] = [...pekare.values()];
    avSattZoom(nypStart.zoom * Math.hypot(a.x - b.x, a.y - b.y) / nypStart.d);
  } else if (pekare.size === 1) {
    AV.x += nu.x - forra.x; AV.y += nu.y - forra.y;
    avRita();
  }
});
const slapp = (e) => { pekare.delete(e.pointerId); if (pekare.size < 2) nypStart = null; if (!pekare.size) avScen.classList.remove('drar'); };
avScen.addEventListener('pointerup', slapp);
avScen.addEventListener('pointercancel', slapp);
avScen.addEventListener('wheel', (e) => {
  if (!AV.bild) return;
  e.preventDefault();
  const r = avScen.getBoundingClientRect();
  avSattZoom(AV.zoom * Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 });
}, { passive: false });
avZoom.addEventListener('input', () => avSattZoom(Number(avZoom.value)));
avScen.addEventListener('keydown', (e) => {
  const steg = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[e.key];
  if (steg && AV.bild) { e.preventDefault(); AV.x += steg[0]; AV.y += steg[1]; avRita(); }
});

// Spara: rita exakt cirkelns innehåll på en 256×256-canvas
$('#avatar-spara').addEventListener('click', async () => {
  if (!AV.bild) return;
  const knapp = $('#avatar-spara');
  const UT = 256, s = scenStorlek(), skala = AV.bas * AV.zoom;
  const canvas = Object.assign(document.createElement('canvas'), { width: UT, height: UT });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, UT, UT);
  const k = UT / s;
  const w = AV.bild.naturalWidth * skala * k, h = AV.bild.naturalHeight * skala * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(AV.bild, UT / 2 + AV.x * k - w / 2, UT / 2 + AV.y * k - h / 2, w, h);
  let bild = canvas.toDataURL('image/jpeg', 0.88);
  if (bild.length > 115_000) bild = canvas.toDataURL('image/jpeg', 0.72);
  knapp.disabled = true;
  try {
    const r = await api('/me/avatar', { bild });
    visaAvatar(r.avatar);
    avDialog.close();
  } catch (e) { $('#avatar-fel').textContent = e.message; }
  finally { knapp.disabled = false; }
});
$('#avatar-bort').addEventListener('click', async () => {
  try { await api('/me/avatar', { bild: null }); visaAvatar(null); avDialog.close(); } catch (e) { $('#avatar-fel').textContent = e.message; }
});
window.addEventListener('resize', () => { if (avDialog.open && AV.bild) { const z = AV.zoom; AV.bas = scenStorlek() / Math.min(AV.bild.naturalWidth, AV.bild.naturalHeight); AV.zoom = z; avRita(); } });

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
// Dagens citat: samma för alla hela dagen och nytt vid midnatt
const ANTAL_CITAT = 20;
let citatVisat = false;
function visaCitat() {
  if (citatVisat) return;
  citatVisat = true;
  const idag = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);
  const nr = (idag % ANTAL_CITAT) + 1;
  const text = T[`quote_${nr}`];
  const p = $('#hej-citat');
  p.querySelector('cite').textContent = T[`quote_by_${nr}`];
  const ut = p.querySelector('blockquote span');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ut.textContent = text; p.classList.add('direkt'); return; }
  ut.setAttribute('aria-label', text);
  const tecken = [...text];
  const start = parseInt(getComputedStyle($('#vy-in')).getPropertyValue('--efter'), 10) || 1000;
  const fart = tecken.length > 70 ? 14 : 22; // långa citat skrivs snabbare så att det inte drar ut på tiden
  let i = 0;
  setTimeout(function skriv() {
    p.classList.add('skriver');
    ut.textContent = tecken.slice(0, ++i).join('');
    if (i < tecken.length) setTimeout(skriv, fart + Math.random() * fart);
    else p.classList.replace('skriver', 'klar');
  }, start + 350);
}

// Förslag på nya citat går till vår mejl via API:t
const forslag = $('#f-forslag');
$('#foresla').addEventListener('click', () => {
  forslag.hidden = !forslag.hidden;
  $('#forslag-svar').textContent = '';
  if (!forslag.hidden) forslag.citat.focus();
});
$('#forslag-stang').addEventListener('click', () => { forslag.hidden = true; });
forslag.addEventListener('submit', (e) => {
  e.preventDefault();
  const svar = $('#forslag-svar');
  const knapp = forslag.querySelector('[type=submit]');
  svar.classList.remove('bra');
  if (forslag.citat.value.trim().length < 3) { forslag.citat.focus(); svar.textContent = T.err_suggest; return; }
  knapp.disabled = true;
  api('/forslag', { citat: forslag.citat.value, vem: forslag.vem.value }, { 400: T.err_suggest })
    .then(() => { forslag.reset(); svar.textContent = T.suggest_thanks; svar.classList.add('bra'); })
    .catch((fel) => { svar.textContent = fel.message; })
    .finally(() => { knapp.disabled = false; });
});

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
