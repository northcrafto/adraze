// Anpassa › musgester: ritar spåret (se anpassa-gest.html). Huvudprocessen skickar punkterna i vyns koordinater.
(function () {
  const ipc = window.adrazeIpc; if (!ipc) return;
  const $ = (id) => document.getElementById(id);
  const kant = $('kant'), linje = $('linje'), start = $('start'), etikett = $('etikett'), pilar = $('pilar'), namn = $('namn');
  let punkter = [], ram = 0, sista = null;
  const MAX = 2000;
  function rita() {
    ram = 0;
    const p = punkter.map((q) => q[0] + ',' + q[1]).join(' ');
    kant.setAttribute('points', p); linje.setAttribute('points', p);
    if (!sista) return;
    const syns = !!(sista.pilar && sista.namn);
    etikett.classList.toggle('syns', syns);
    if (!syns) return;
    pilar.textContent = sista.pilar; namn.textContent = sista.namn;
    // Etiketten följer pekaren, snett nedanför till höger – eller åt andra hållet nära kanterna
    const w = etikett.offsetWidth, h = etikett.offsetHeight;
    let x = sista.x + 18, y = sista.y + 20;
    if (x + w > innerWidth - 8) x = sista.x - w - 14;
    if (y + h > innerHeight - 8) y = sista.y - h - 14;
    etikett.style.transform = 'translate(' + Math.max(6, Math.round(x)) + 'px,' + Math.max(6, Math.round(y)) + 'px)';
  }
  const begar = () => { if (!ram) ram = requestAnimationFrame(rita); };
  ipc.on('anpassa-gest:start', (_e, d) => {
    punkter = [[d.x, d.y]]; sista = null;
    start.setAttribute('cx', d.x); start.setAttribute('cy', d.y); start.setAttribute('r', '3.5');
    etikett.classList.remove('syns');
    begar();
  });
  ipc.on('anpassa-gest:punkt', (_e, d) => {
    if (punkter.length < MAX) punkter.push([d.x, d.y]); else punkter[punkter.length - 1] = [d.x, d.y];
    sista = d; begar();
  });
  ipc.on('anpassa-gest:slut', () => {
    punkter = []; sista = null;
    start.setAttribute('r', '0');
    etikett.classList.remove('syns');
    begar();
  });
})();
