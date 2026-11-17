// Mac-besökare får Mac-knappen först
if (/Macintosh/.test(navigator.userAgent)) document.documentElement.classList.add('ar-mac');
else if (/Windows/.test(navigator.userAgent)) document.documentElement.classList.add('ar-win');

// Hamburgarmenyn: cirkeln växer ut från knappens position
const btn = document.getElementById('menu-btn'), menu = document.getElementById('menu');
const satt = (open) => {
  const r = btn.getBoundingClientRect();
  menu.style.setProperty('--cx', `${r.left + r.width / 2}px`);
  menu.style.setProperty('--cy', `${r.top + r.height / 2}px`);
  btn.classList.toggle('open', open); menu.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open); menu.setAttribute('aria-hidden', !open);
  btn.setAttribute('aria-label', open ? btn.dataset.stang : btn.dataset.meny);
  document.body.style.overflow = open ? 'hidden' : '';
};
btn.addEventListener('click', () => satt(!menu.classList.contains('open')));
menu.addEventListener('click', (e) => e.target.closest('a') && satt(false));
addEventListener('keydown', (e) => e.key === 'Escape' && satt(false));

// Headern får en kantlinje när man scrollat förbi toppen
const header = document.querySelector('.top');
const hero = document.querySelector('.hero');
if (hero) new IntersectionObserver(([e]) => header.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
else header.classList.add('solid'); // undersidorna har ingen hjälte att scrolla förbi

// Före/efter: två riktiga inspelningar som spelas i takt när de syns
const jmf = [...document.querySelectorAll('.jmf-video')];
if (jmf.length) {
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [forsta, ...ovriga] = jmf;
  // Håll de andra videorna i takt med den första
  forsta.addEventListener('timeupdate', () => {
    for (const v of ovriga) if (Math.abs(v.currentTime - forsta.currentTime) > 0.15) v.currentTime = forsta.currentTime;
  });
  if (lugn) jmf.forEach((v) => { v.controls = true; });
  else new IntersectionObserver(([e]) => {
    jmf.forEach((v) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()));
  }, { threshold: 0.35 }).observe(forsta.closest('.jmf'));
}

// Språkväljaren: stäng när man klickar utanför eller trycker Escape, kom ihåg valet
const sprak = document.querySelector('.sprak');
if (sprak) {
  document.addEventListener('click', (e) => { if (!sprak.contains(e.target)) sprak.open = false; });
  addEventListener('keydown', (e) => e.key === 'Escape' && (sprak.open = false));
  sprak.addEventListener('click', (e) => {
    const a = e.target.closest('[data-sprak]');
    if (a) try { localStorage.setItem('adraze-sprak', a.dataset.sprak); } catch {}
  });
}

// Första besöket på den svenska startsidan: skicka vidare till besökarens eget språk om vi har det
(() => {
  if (location.pathname !== '/' || /bot|crawl|spider|lighthouse/i.test(navigator.userAgent)) return;
  let valt = null;
  try { valt = localStorage.getItem('adraze-sprak'); } catch {}
  if (valt) { if (valt !== 'sv') location.replace(`/${valt}/${location.search}${location.hash}`); return; }
  const finns = [...document.querySelectorAll('[data-sprak]')].map((a) => a.dataset.sprak);
  for (const l of navigator.languages || [navigator.language]) {
    let kod = l.toLowerCase().split('-')[0];
    if (kod === 'no' || kod === 'nn') kod = 'nb';
    if (kod === 'sv') return;
    if (finns.includes(kod)) { location.replace(`/${kod}/${location.search}${location.hash}`); return; }
  }
})();

// Inloggad (kontosidan har satt flaggan): visa "Mitt konto" i stället för "Logga in"
(() => {
  if (!/(?:^|; )adraze-inloggad=1/.test(document.cookie)) return;
  for (const a of document.querySelectorAll('[data-inloggad]')) {
    const text = [...a.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (text) text.textContent = a.dataset.inloggad;
  }
})();

// Staplarna i adblock-test-diagrammet växer fram när de syns
document.querySelectorAll('.sf-test').forEach((el) => new IntersectionObserver(([e], o) => {
  if (e.isIntersecting) { el.classList.add('syns'); o.disconnect(); }
}, { threshold: 0.4 }).observe(el));

// ---------- Rörelsefamiljen ----------
(() => {
  const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narSyns = (el, fn, troskel = 0.35) => new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); fn(el); } }, { threshold: troskel }).observe(el);

  // Namnet delas i bokstäver så att de kan dras isär och fyllas var för sig
  document.querySelectorAll('.logo').forEach((a) => {
    const tn = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tn) return;
    const ord = tn.textContent.trim();
    if (!a.hasAttribute('aria-label')) a.setAttribute('aria-label', ord);
    const s = document.createElement('span'); s.className = 'logo-ord'; s.setAttribute('aria-hidden', 'true');
    [...ord].forEach((b, i) => { const e = document.createElement('span'); e.className = 'lb'; e.style.setProperty('--i', i); e.dataset.b = b; e.textContent = b; s.append(e); });
    tn.replaceWith(s);
  });
  // En gång per besök visar namnet i toppen sig självt, så att även mobilen får se det
  const topplogga = document.querySelector('.top .logo');
  let sett = false; try { sett = sessionStorage.getItem('adraze-hej') === '1'; sessionStorage.setItem('adraze-hej', '1'); } catch {}
  if (topplogga && !sett && !lugn) setTimeout(() => { topplogga.classList.add('hej'); setTimeout(() => topplogga.classList.remove('hej'), 1700); }, 900);

  // Pennstreck under sista ordet i sektionsrubrikerna
  // Strecket ritas i pixlar efter ordets bredd, så att det når hela vägen och är lika tjockt överallt
  const streck = (span) => {
    const svg = span.querySelector('svg'), b = span.offsetWidth * 1.04, h = parseFloat(getComputedStyle(span).fontSize) * 0.2, y = (v) => (v / 12 * h).toFixed(1), x = (v) => (v / 200 * b).toFixed(1);
    svg.querySelector('path').setAttribute('d', `M${x(3)} ${y(8)} C ${x(28)} ${y(2.5)}, ${x(52)} ${y(10.5)}, ${x(84)} ${y(6.5)} S ${x(142)} ${y(2.5)}, ${x(168)} ${y(7)} S ${x(190)} ${y(9)}, ${x(197)} ${y(5)}`);
  };
  const pennor = [];
  document.querySelectorAll('.sektion-huvud h2, .sverige-text h2, .jord-text h2, .fragor-sida h2').forEach((h) => {
    const tn = [...h.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tn) return;
    const text = tn.textContent.replace(/\s+$/, '');
    const ord = text.split(/\s+/);
    const antal = ord[ord.length - 1].replace(/[^\p{L}\p{N}]/gu, '').length < 4 && ord.length > 2 ? 2 : 1;
    if (ord.length <= antal) return;
    const sist = ord.slice(-antal).join(' '), fore = text.slice(0, text.length - sist.length);
    const span = document.createElement('span'); span.className = 'penna'; span.textContent = sist;
    span.insertAdjacentHTML('beforeend', '<svg aria-hidden="true"><path pathLength="1"/></svg>');
    tn.replaceWith(document.createTextNode(fore), span);
    pennor.push(span); streck(span);
    narSyns(h, () => h.classList.add('syns'), 0.6);
  });
  if (pennor.length) { addEventListener('resize', () => pennor.forEach(streck)); document.fonts?.ready.then(() => pennor.forEach(streck)); }

  // Korten och stegen: gubben nickar till när de kommer in i bild
  document.querySelectorAll('.kort-grid, .steg-lista').forEach((grid) => [...grid.children].forEach((el, i) => {
    el.style.setProperty('--n', i % 3);
    narSyns(el, () => el.classList.add('syns'), 0.3);
  }));

  // Siffrorna räknar upp en gång
  const rakna = (nod, fran, till, skriv, ms = 1300) => {
    if (lugn) return;
    const t0 = performance.now();
    const steg = (nu) => {
      const p = Math.min(1, (nu - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      nod.textContent = skriv(Math.round(fran + (till - fran) * e));
      if (p < 1) requestAnimationFrame(steg);
    };
    nod.textContent = skriv(fran); requestAnimationFrame(steg);
  };
  const band = document.querySelector('.siffror');
  if (band) narSyns(band, () => {
    band.querySelectorAll('.sf-topp b, .sf-rad b, .sf-lista b').forEach((b) => {
      const tn = [...b.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.textContent));
      if (!tn) return;
      const text = tn.textContent;
      const pil = text.match(/^(\s*)(\d+)(\s*→\s*)(\d+)(\s*)$/);
      if (pil) return rakna(tn, +pil[2], +pil[4], (v) => `${pil[1]}${pil[2]}${pil[3]}${v}${pil[5]}`, 1500);
      const m = text.match(/^(\D*)(\d[\d\s .,]*\d|\d)(\D*)$/);
      if (!m) return;
      const mal = +m[2].replace(/\D/g, ''); if (!mal) return;
      const skilj = (m[2].match(/\D/) || [''])[0];
      rakna(tn, 0, mal, (v) => m[1] + String(v).replace(/\B(?=(\d{3})+$)/g, skilj) + m[3]);
    });
  }, 0.3);
})();
