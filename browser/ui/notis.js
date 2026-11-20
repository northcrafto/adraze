// Notisrutan (uppdatering, huvudwebbläsare, flytta hit): ritar korten som skalet skickar och rapporterar sin höjd tillbaka,
// så main.js kan göra den flytande vyn precis så stor som korten. Klick skickas till skalet via main.
(() => {
  'use strict';
  const stack = document.getElementById('stack');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Ikonerna som skalet kan be om (samma streck som i skalets sprite).
  const IKON = {
    'i-update': '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/><path d="M12 8v4.5l3 1.8"/>',
    'i-shield-check': '<path d="M12 3l8 3v6c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9V6z"/><path d="M9 11.5l2 2 4-4.5"/>',
    'i-flytt': '<path d="M4 8h12M12 4l4 4-4 4"/><path d="M20 16H8M12 12l-4 4 4 4"/>',
  };
  function rita(d) {
    const lista = (d && d.lista) || [];
    document.body.classList.toggle('mork', !!(d && d.mork));
    stack.innerHTML = lista.map((n) => {
      const ikon = IKON[n.ikon] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${IKON[n.ikon]}</svg>` : '';
      return `<div class="notis" data-id="${esc(n.id)}" role="status">
        <div class="rubrik">${ikon}<span>${esc(n.titel)}</span></div>
        ${n.under ? `<p class="under">${esc(n.under)}</p>` : ''}
        <div class="rad">${n.sek ? `<button class="sek" data-knapp="sek">${esc(n.sek)}</button>` : ''}<button class="knapp" data-knapp="knapp"${n.knappDisabled ? ' disabled' : ''}>${esc(n.knapp)}</button></div>
      </div>`;
    }).join('');
    rapportera();
  }
  stack.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const kort = b.closest('.notis'); if (!kort) return;
    window.notis.klick(kort.dataset.id, b.dataset.knapp);
  });
  let sisteH = -1;
  function rapportera() {
    const h = stack.getBoundingClientRect().height;
    const rund = Math.ceil(h) + 4;
    if (rund !== sisteH) { sisteH = rund; window.notis.hojd(rund); }
  }
  new ResizeObserver(rapportera).observe(stack);
  window.notis.on('data', rita);
  window.notis.redo();
})();
