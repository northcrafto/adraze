// Prowl-nedladdning: OS-igenkänning + kopiera kontrollsumma (extern fil pga CSP script-src 'self').
(function () {
  var sha = document.getElementById('pw-sha').textContent.trim();
  var ua = navigator.userAgent;
  var os = /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : null;
  var rub = document.getElementById('pw-rubrik'), os_ = document.getElementById('pw-os'), ladda = document.getElementById('pw-ladda');
  if (os === 'windows' || os === 'mac') {
    os_.textContent = os === 'windows' ? 'Windows upptäckt' : 'Mac upptäckt';
    rub.textContent = (os === 'windows' ? 'Windows' : 'Mac') + '-versionen är på väg';
    ladda.textContent = 'Ladda ner för Linux ändå';
    ladda.className = 'btn liq-ghost';
  } else {
    os_.textContent = 'Linux upptäckt';
  }
  var k = document.getElementById('pw-kopiera');
  k.addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText(sha); k.textContent = 'Kopierad'; setTimeout(function () { k.textContent = 'Kopiera'; }, 1500); });
})();
