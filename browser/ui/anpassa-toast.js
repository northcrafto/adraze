// Anpassa › Ångra: toasten ovanpå webbsidan (se anpassa-toast.html). Huvudprocessen skickar texten; vyn mäter rutan och
// säger hur stor den blev (vyn görs exakt så stor) och var Ångra-knappen ligger, och säger till när tiden gått.
(function () {
  const ipc = window.adrazeIpc; if (!ipc) return;
  const $ = (id) => document.getElementById(id);
  const t = $('t'), txt = $('txt'), knapp = $('angra');
  let d = null, timer = 0;
  const slut = () => { clearTimeout(timer); if (d) ipc.send('anpassa-angra:toast-slut', d.id); };
  ipc.on('anpassa-angra:toast-visa', (_e, nytt) => {
    if (!nytt || typeof nytt !== 'object') return;
    d = nytt;
    document.documentElement.dataset.theme = d.tema === 'dark' ? 'dark' : 'light';
    txt.textContent = String(d.text || '');
    knapp.textContent = String(d.angra || '');
    t.classList.toggle('utan-angra', !d.angra);
    knapp.classList.remove('hov'); knapp.blur();   // ny toast: ingen hover eller fokus kvar från förra
    t.style.maxWidth = Math.max(140, d.max | 0) + 'px';
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    // Rutans storlek och var Ångra-knappen ligger (layoutens mått – inte inglidningens förskjutning)
    const r = document.body.getBoundingClientRect();
    const k = d.angra ? { x: knapp.offsetLeft, y: knapp.offsetTop, w: knapp.offsetWidth, h: knapp.offsetHeight } : null;
    ipc.send('anpassa-angra:toast-storlek', { id: d.id, w: Math.ceil(r.width), h: Math.ceil(r.height), knapp: k });
    clearTimeout(timer); timer = setTimeout(slut, d.ms || 5000);
  });
  // Musen på Ångra pausar tiden (resten av rutan släpper igenom musen till sidan, se anpassa-angra.js)
  knapp.addEventListener('mousemove', () => { if (knapp.classList.contains('hov')) return; knapp.classList.add('hov'); clearTimeout(timer); });
  knapp.addEventListener('mouseleave', () => { if (!knapp.classList.contains('hov')) return; knapp.classList.remove('hov'); clearTimeout(timer); if (d) timer = setTimeout(slut, 2500); });
  knapp.addEventListener('click', () => { clearTimeout(timer); if (d) ipc.send('anpassa-angra:toast-klick', d.id); d = null; });
})();
