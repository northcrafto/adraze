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

// Före/efter-demon: slå på AdRaze och räkna upp det som stoppades
const demo = document.querySelector('.demo');
if (demo) {
  const knapp = document.getElementById('demo-knapp');
  const antal = document.getElementById('demo-antal');
  // Annonsrutor och popupen, plus de 12 spårarna som pillret visar
  const totalt = demo.querySelectorAll('.annons, .popup').length + 12;
  let raknare = null;
  knapp.addEventListener('click', () => {
    const pa = demo.dataset.pa !== 'true';
    demo.dataset.pa = String(pa);
    knapp.setAttribute('aria-pressed', String(pa));
    knapp.querySelector('span').textContent = pa ? knapp.dataset.avText : knapp.dataset.paText;
    clearInterval(raknare);
    if (!pa) { antal.textContent = '0'; return; }
    let n = 0;
    raknare = setInterval(() => { n += 1; antal.textContent = n; if (n >= totalt) clearInterval(raknare); }, 22);
  });
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
  if (valt) { if (valt !== 'sv') location.replace(`/${valt}/${location.hash}`); return; }
  const finns = [...document.querySelectorAll('[data-sprak]')].map((a) => a.dataset.sprak);
  for (const l of navigator.languages || [navigator.language]) {
    let kod = l.toLowerCase().split('-')[0];
    if (kod === 'no' || kod === 'nn') kod = 'nb';
    if (kod === 'sv') return;
    if (finns.includes(kod)) { location.replace(`/${kod}/${location.hash}`); return; }
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
