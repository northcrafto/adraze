// Jultemats pynt i fönstret: gorillan i tomteluva (del "luva"), snön på nya fliken (del "sno") och snötäcket på
// flikarna (del "flikar"). Laddas efter jul.js (kärnan, window.Jul) och före shell.js. Stilen står i jul.css,
// sektion 2, 3 och 4.
//
// Kärnan anropar pa() när en del blir aktiv och av() när den slås av eller julen är slut. Allt som läggs i sidan
// här tas bort igen i av(). Inget ritas i inkognito och inget över webbsidor: luvan och snöfallet ligger i
// #newtabpage, snötäcket i flikraden.
(function () {
  'use strict';
  const Jul = window.Jul;
  const nt = document.getElementById('newtabpage');
  if (!Jul || !nt) return;
  const $ = (id) => document.getElementById(id);
  const slump = (a, b) => a + Math.random() * (b - a);

  /* ── Gorillan i tomteluva ──
   * De små ikonerna (blockerarknappen, flikens ikon på en ny flik, statistikremsan, Blockerat-widgeten och loggan
   * ovanför sökrutan) byter bild med CSS så fort "luva" står i data-jul. Här läggs bara den stora gorillan in: den
   * sitter på sökrutans överkant på nya fliken. */
  let plats = null, vakter = [];
  // Hälsningen ovanför sökrutan får aldrig hamna under gorillan (långa namn, andra språk): flytta ut den, annars göm den
  function passa() {
    if (!plats) return;
    const bild = plats.firstChild, text = $('nt-greet');
    plats.classList.remove('jul-ute', 'jul-gomd');
    if (!text || !text.firstChild || !bild.offsetParent || !text.offsetParent || nt.classList.contains('anp-utan-sok')) return;
    const omr = document.createRange(); omr.selectNodeContents(text);
    const t = omr.getBoundingClientRect();
    const krockar = () => { const b = bild.getBoundingClientRect(); return t.width > 0 && t.right + 10 > b.left && t.left < b.right && t.bottom > b.top && t.top < b.bottom; };
    if (!krockar()) return;
    plats.classList.add('jul-ute');
    if (krockar()) { plats.classList.remove('jul-ute'); plats.classList.add('jul-gomd'); }
  }
  let passaRam = 0;
  const passaSnart = () => { if (!passaRam) passaRam = requestAnimationFrame(() => { passaRam = 0; passa(); }); };
  function luvaPa() {
    const sok = nt.querySelector('.anp-st-sok'), stor = Jul.bild('stor');
    if (plats || !sok || !stor) return;   // utan den stora bilden: bara de små ikonerna
    plats = document.createElement('div');
    plats.id = 'jul-gorilla-plats'; plats.setAttribute('aria-hidden', 'true');
    const bild = document.createElement('img');
    bild.id = 'jul-gorilla'; bild.alt = ''; bild.draggable = false; bild.src = stor;
    plats.append(bild);
    sok.parentElement.insertBefore(plats, sok);
    // Mät om när hälsningen byts, när startsidan visas eller ändrar utseende och när fönstret ändrar storlek
    const mo = new MutationObserver(passaSnart);
    const text = $('nt-greet');
    if (text) mo.observe(text, { childList: true, characterData: true, subtree: true });
    mo.observe(nt, { attributes: true, attributeFilter: ['class'] });
    const ro = new ResizeObserver(passaSnart);
    ro.observe(sok.parentElement);
    vakter = [mo, ro];
    passaSnart();
  }
  function luvaAv() {
    for (const v of vakter) v.disconnect();
    vakter = [];
    if (plats) { plats.remove(); plats = null; }
  }
  Jul.del('luva', { pa: luvaPa, av: luvaAv });

  /* ── Snö på nya fliken ──
   * Ett lager med 22–40 flingor (efter fönstrets yta) före innehållskolumnen i #newtabpage, alltså bakom klocka,
   * sökruta och widgetar. Varje flinga får sin plats, storlek, fart och svajning som CSS-variabler en gång; sedan
   * sköter CSS-animationerna allt. Lagret pausas när en ruta ligger över startsidan (inställningar, inloggning,
   * bokmärken, bakgrundsväljaren, QR) eller fönstret inte syns. Visas en webbsida är hela startsidan dold och
   * animationerna står still av sig själva. */
  const RUTOR = ['settings', 'login', 'bookmarks', 'bgpick', 'qr'];
  let sno = null, snoVakt = null;
  // Tre djup: små, långsamma och bleka långt bort; större och snabbare nära, de största är ritade flingor som snurrar sakta
  const DJUP = {
    fjarran: { storlek: [3, 5], syn: [0.4, 0.6], fall: [30, 44], svaj: [5, 9], takt: [5, 8], form: ['', 'jul-f2'] },
    mitt: { storlek: [5, 8], syn: [0.65, 0.85], fall: [21, 30], svaj: [9, 16], takt: [4, 7], form: ['', 'jul-f2'] },
    nara: { storlek: [11, 16], syn: [0.85, 0.95], fall: [15, 20], svaj: [14, 24], takt: [3.5, 6], form: ['jul-f3', 'jul-f4'] },
  };
  function flingor() {
    const yta = (nt.clientWidth || window.innerWidth) * (nt.clientHeight || window.innerHeight);
    const n = Math.max(22, Math.min(40, Math.round(yta / 29000)));   // 1280 × 726 ger 32
    // Jämnt utspridda i sidled: en flinga per spalt, spalterna i slumpad ordning
    const spalter = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spalter[i], spalter[j]] = [spalter[j], spalter[i]]; }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const d = DJUP[i % 5 === 0 ? 'nara' : i % 5 < 3 ? 'mitt' : 'fjarran'];
      const el = document.createElement('i');
      el.className = ('jul-flinga ' + d.form[Math.floor(Math.random() * d.form.length)]).trim();
      const fall = slump(...d.fall), takt = slump(...d.takt);
      // Negativ fördröjning = flingan är redan på väg när sidan visas. --y är platsen när snön står still (Minska rörelse).
      el.style.cssText = '--x:' + ((spalter[i] + Math.random()) / n * 100).toFixed(2) + '%;--s:' + slump(...d.storlek).toFixed(1) + 'px;--o:' + slump(...d.syn).toFixed(2) +
        ';--t:' + fall.toFixed(1) + 's;--d:-' + (Math.random() * fall).toFixed(1) + 's;--v:' + slump(...d.svaj).toFixed(1) + 'px;--tv:' + takt.toFixed(1) + 's;--dv:-' + (Math.random() * takt).toFixed(1) +
        's;--r:' + (d === DJUP.nara ? Math.round(slump(-160, 160)) : 0) + 'deg;--y:' + slump(2, 96).toFixed(1) + 'cqh';
      frag.append(el);
    }
    return frag;
  }
  function snoPaus() {
    if (sno) sno.classList.toggle('jul-paus', document.hidden || RUTOR.some((id) => { const el = $(id); return !!el && !el.classList.contains('hidden'); }));
  }
  function snoPa() {
    if (sno) return;
    sno = document.createElement('div');
    sno.id = 'jul-sno'; sno.setAttribute('aria-hidden', 'true');
    sno.append(flingor());
    nt.insertBefore(sno, nt.querySelector('.anp-st-inre'));
    snoVakt = new MutationObserver(snoPaus);
    for (const id of RUTOR) { const el = $(id); if (el) snoVakt.observe(el, { attributes: true, attributeFilter: ['class'] }); }
    document.addEventListener('visibilitychange', snoPaus);
    snoPaus();
  }
  function snoAv() {
    if (snoVakt) { snoVakt.disconnect(); snoVakt = null; }
    document.removeEventListener('visibilitychange', snoPaus);
    if (sno) { sno.remove(); sno = null; }
  }
  Jul.del('sno', { pa: snoPa, av: snoAv });

  /* ── Snö på flikarna ──
   * Bara CSS (jul.css, sektion 4): ett tunt snötäcke ovanpå den aktiva fliken och den man pekar på. Inget läggs i
   * sidan här; registreringen gör att "flikar" står i data-jul och att brytaren visas i inställningarna. */
  Jul.del('flikar', {});
})();
