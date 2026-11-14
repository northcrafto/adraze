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
