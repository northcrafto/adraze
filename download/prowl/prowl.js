// Prowl-nedladdning: kopiera terminalraden och kontrollsumman, OS-igenkänning (extern fil pga CSP script-src 'self').
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function kopiera(knapp, kalla, etikett) {
    knapp.addEventListener('click', function () {
      var text = kalla.textContent.trim();
      var klar = function () { var f = etikett.textContent; etikett.textContent = knapp.dataset.klar || 'Kopierad'; setTimeout(function () { etikett.textContent = f; }, 1600); };
      // utan urklipp: markera texten så den kan kopieras för hand
      var forHand = function () { getSelection().selectAllChildren(kalla); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(klar, forHand); else forHand();
    });
  }
  kopiera($('pw-kopiera-rad'), $('pw-kommando'), $('pw-kopiera-rad').querySelector('span'));
  kopiera($('pw-kopiera'), $('pw-sha'), $('pw-kopiera'));

  var ua = navigator.userAgent;
  var os = /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : null;
  if (os === 'windows' || os === 'mac') {
    $('pw-os').textContent = (os === 'windows' ? 'Windows' : 'Mac') + ' upptäckt. Den versionen är på väg, Linux finns nu';
  } else {
    $('pw-os').textContent = os === 'linux' ? 'Linux upptäckt' : 'För Linux';
  }
})();
