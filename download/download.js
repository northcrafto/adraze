// Nedladdningssidan: kopiera terminalraden, visa senaste versionen och markera besökarens system
(() => {
  const $ = (id) => document.getElementById(id);

  const knapp = $('dl-kopiera');
  knapp.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('dl-kommando').textContent); } catch { return; }
    const text = knapp.querySelector('span'), forut = text.textContent;
    text.textContent = knapp.dataset.klar;
    setTimeout(() => { text.textContent = forut; }, 1600);
  });

  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|X11/.test(ua) && !/Android/.test(ua) ? 'linux' : null;
  if (os) document.querySelector(`[data-os="${os}"]`)?.classList.add('dl-ditt');

  fetch('https://api.github.com/repos/northcrafto/adraze-dl/releases/latest')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const v = j?.tag_name?.replace(/^v/, '');
      if (!v) return;
      $('dl-version').textContent = $('dl').dataset.version.replace('{v}', v);
      $('dl-version').hidden = false;
    })
    .catch(() => {});
})();
