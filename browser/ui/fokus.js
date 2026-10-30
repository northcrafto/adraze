/* Fokusringen (orange ram) visas bara när du använder tangentbordet (Tab/piltangenter).
   Efter musklick, eller när en ruta stängs och fokus hoppar tillbaka till en knapp, syns ingen ram. */
(function () {
  const root = document.documentElement;
  const st = document.createElement('style');
  st.textContent = 'html:not([data-kbd]) :focus, html:not([data-kbd]) :focus-visible { outline: none !important; }'
    + ' html:not([data-kbd]) button:focus, html:not([data-kbd]) a:focus, html:not([data-kbd]) [role="button"]:focus, html:not([data-kbd]) .switch input:focus + .track { box-shadow: none; }';
  (document.head || root).appendChild(st);
  const NAV = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
  addEventListener('keydown', (e) => { if (NAV.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) root.setAttribute('data-kbd', ''); }, true);
  addEventListener('pointerdown', () => root.removeAttribute('data-kbd'), true);
})();
