// Nedladdningssidan: kopiera terminalraden, visa senaste versionen och markera besökarens system
(() => {
  const $ = (id) => document.getElementById(id);

  const knapp = $('dl-kopiera');
  knapp.addEventListener('click', async () => {
    const rad = $('dl-kommando').textContent;
    try { await navigator.clipboard.writeText(rad); }
    catch { getSelection().selectAllChildren($('dl-kommando')); return; } // utan urklipp: markera raden så den kan kopieras för hand
    const text = knapp.querySelector('span'), forut = text.textContent;
    text.textContent = knapp.dataset.klar;
    setTimeout(() => { text.textContent = forut; }, 1600);
  });

  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : null;
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
