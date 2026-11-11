// Jultemat i fönstret: kärnan. Laddas efter anpassa-kortkommandon.js och före delarna (jul-pynt.js, jul-kalender.js)
// och shell.js. Huvudprocessens del är ../jul.js (säsong, låtsat datum, frågan, julfärger, räknare, luckor).
//
// Kärnan håller reda på vilka delar som är på och säger till dem:
//   Jul.del('sno', { pa() { … }, av() { … }, andrat(vad) { … } })
// pa() anropas när delen blir aktiv (även vid start, när sidan är laddad), av() när den slås av eller säsongen är slut:
// då ska allt delen lagt i sidan bort. pa och av kommer alltid i par. andrat('dag' | 'luckor' | 'lage') är valfri och
// anropas bara medan delen är på. En del som bara är CSS registreras med ett tomt objekt: Jul.del('flikar', {}).
//
// De aktiva delarnas namn står i data-jul på <html>, t.ex. data-jul="sno luva", och CSS:en i jul.css hänger på det:
//   :root[data-jul~="sno"] body:not(.incog) …
// Attributet saknas helt när inget är på. En del är aktiv när säsongen pågår (1 december–6 januari), Jultema är på
// (jul.pa), delens egen brytare inte är av (jul.<del>), delen är registrerad och fönstret inte är ett inkognitofönster.
// Julfärgerna är ingen del här: de är temat Jul (tema.palett) och sköts av huvudprocessen.
//
// Skalets funktioner (visaNotis, showToast, famLocked …) finns först när shell.js har körts och används bara inuti
// funktioner som körs senare.
(function () {
  'use strict';
  const A = window.Anpassa, bro = window.julBro;
  if (!A || !bro) return;
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const INKOGNITO = new URLSearchParams(location.search).has('incognito');
  const tx = (sv) => (typeof window.t === 'function' ? window.t(sv) : sv);
  const tn = (sv, n) => tx(sv).split('{n}').join(String(n));
  const forsok = (f, reserv) => { try { return f(); } catch { return reserv; } };

  /* ── Läget från huvudprocessen ── */
  // { offset, test, sasong, dag, fragad, svarad, luckor, bilder }: offset = låtsat datum minus riktig tid (0 utan
  // ADRAZE_DATUM), sasong = årtalet säsongen började eller null, fragad = ingen ny fråga ska visas (besvarad, redan
  // visad en gång, eller inte december), svarad = frågan har fått svar (då tas den bort där den står kvar).
  let lage = { offset: 0, test: false, sasong: null, dag: '', fragad: true, svarad: true, luckor: [], bilder: {} };
  const tolka = (l) => (l && typeof l === 'object' ? { ...lage, ...l, luckor: Array.isArray(l.luckor) ? l.luckor : [], bilder: l.bilder && typeof l.bilder === 'object' ? l.bilder : {} } : lage);
  lage = tolka(forsok(() => bro.lage(), null));

  const nu = () => new Date(Date.now() + (Number(lage.offset) || 0));
  const sasong = () => lage.sasong || null;
  const aktiv = () => !!sasong() && !INKOGNITO && A.get('jul.pa') === true;
  const barn = () => !!(forsok(() => A.barnlage()) || forsok(() => account && account.isChild) || forsok(() => famLocked()));

  /* ── Bilderna (ui/jul/) ── */
  // En <img> som fått sin bild bytt med CSS (content: url) till en fil som inte går att läsa visar en trasig bild som
  // sitter kvar. Därför räknas en bild som "finns" först när huvudprocessen ser filen OCH en provladdning har lyckats.
  // Bilderna hämtas bara när jultemat är på: resten av året, och hos den som tackat nej, laddas ingenting.
  const bildOk = {};   // namn → true/false när provladdningen är klar
  function provladda() {
    if (!aktiv()) return;
    for (const [namn, sokvag] of Object.entries(lage.bilder)) {
      if (!sokvag || namn in bildOk) continue;
      bildOk[namn] = null;
      const im = new Image();
      im.onload = () => { bildOk[namn] = im.naturalWidth > 0; synka(); };
      im.onerror = () => { bildOk[namn] = false; synka(); };
      im.src = sokvag;
    }
  }
  const bild = (namn) => (bildOk[namn] === true && lage.bilder[namn]) || null;
  const avgjord = (namn) => !lage.bilder[namn] || bildOk[namn] === true || bildOk[namn] === false;
  // Luvan slås på först när båda bilderna är provade. Utan märket ingen luva; utan den stora bilden bara de små ikonerna.
  const luvaKlar = () => !!bild('liten') && avgjord('stor');

  /* ── Delarna ── */
  const NAMN = ['sno', 'luva', 'kalender', 'stat', 'flikar'];
  const delar = new Map();   // namn → { krok, igang }
  let laddad = document.readyState !== 'loading';
  function pa(namn) {
    if (!aktiv() || !delar.has(namn) || A.get('jul.' + namn) === false) return false;
    if (namn === 'luva' && !luvaKlar()) return false;   // utan bild ingen luva (se ovan)
    return true;
  }
  function synka() {
    const aktiva = NAMN.filter(pa);
    const attr = aktiva.join(' ');
    if (!attr) root.removeAttribute('data-jul'); else if (root.getAttribute('data-jul') !== attr) root.setAttribute('data-jul', attr);
    if (!laddad) return;   // krokarna rör sidan: först när den är laddad
    for (const [namn, d] of delar) {
      const vill = aktiva.includes(namn);
      if (vill === d.igang) continue;
      d.igang = vill;
      const f = vill ? d.krok.pa : d.krok.av;
      if (typeof f === 'function') { try { f(); } catch (e) { console.warn('[jul]', namn, e); } }
    }
  }
  function del(namn, krok) {
    if (!NAMN.includes(namn) || delar.has(namn)) return;
    delar.set(namn, { krok: krok && typeof krok === 'object' ? krok : {}, igang: false });
    synka();
    ritaInstallningar();
  }
  function sagTill(vad) {
    for (const [namn, d] of delar) if (d.igang && typeof d.krok.andrat === 'function') { try { d.krok.andrat(vad); } catch (e) { console.warn('[jul]', namn, e); } }
  }

  /* ── Frågan "Vill du ha jultema?" ──
   * EN gång per jul, bara i december, och bara när nya fliken syns: skalets rutor ritas under webbsidan, så över en
   * sida syns den inte. Väntar på introt och på andra notiser (de ligger på samma plats). Inget slås på förrän man
   * svarat Ja tack.
   *
   * Frågan räknas som ställd när den har synts i åtta sekunder (nya fliken framme, fönstret i fokus): då säger
   * fönstret till huvudprocessen, och sedan visas den varken i fler fönster eller nästa gång AdRaze startas. Stänger
   * man AdRaze innan dess har man knappast hunnit se den, och då kommer den nästa gång. Ett fönster som redan visar
   * frågan behåller den tills den fått svar (i vilket fönster som helst). Den som låter den stå hittar Jultema under
   * Inställningar › Anpassa hela julen. */
  const START = Date.now(), SYNLIG_MS = 8000;
  let fragaEl = null, fragaTimer = 0, egenFraga = false, synligMs = 0, synligTimer = 0;
  const RUTOR = ['settings', 'login', 'bookmarks', 'bgpick', 'qr'];
  function skaFraga() {
    // egenFraga = det här fönstret visar redan frågan (eller lät en annan notis gå före): den är kvar tills den fått svar
    return !!sasong() && (egenFraga ? !lage.svarad : !lage.fragad) && !INKOGNITO && A.get('jul.pa') !== true && !forsok(() => famLocked(), false);
  }
  function nyaFlikenSyns() {
    const nt = $('newtabpage');
    if (!nt || nt.classList.contains('hidden') || document.visibilityState !== 'visible') return false;
    if (RUTOR.some((id) => { const el = $(id); return el && !el.classList.contains('hidden'); })) return false;
    const intro = $('hxintro');
    if (intro && intro.style.display === 'flex') return false;
    // Inget annat får ligga över startsidan heller (spärrsidan i barnläge, en varning, kommandopaletten …)
    const r = nt.getBoundingClientRect(), overst = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!overst && nt.contains(overst);
  }
  const annanNotis = () => !!document.querySelector('body > .notis:not(#jul-fraga)');
  function slutaMata() { clearInterval(synligTimer); synligTimer = 0; }
  // Räknar sekunderna frågan faktiskt syns. Efter åtta är den ställd (bro.visad), och då behövs ingen mätning mer.
  function mataSynlig() {
    if (synligTimer || synligMs >= SYNLIG_MS) return;
    synligTimer = setInterval(() => {
      if (!fragaEl || !fragaEl.isConnected || !nyaFlikenSyns() || !document.hasFocus()) return;
      synligMs += 1000;
      if (synligMs >= SYNLIG_MS) { slutaMata(); forsok(() => bro.visad()); }
    }, 1000);
  }
  function taBortFraga() { slutaMata(); if (fragaEl) { const el = fragaEl; fragaEl = null; if (el.isConnected) el.remove(); } }
  function svara(svar) {
    lage.fragad = lage.svarad = true; egenFraga = false; slutaMata();
    forsok(() => window.AnpassaAngra.tyst(1200));   // julfärgerna som slås på är inget man ska kunna "Ångra" i toasten
    Promise.resolve(forsok(() => bro.svara(svar))).catch(() => {});
    if (svar !== 'ja') return;
    // Skalets toast, men kvar lite längre än vanligt: det är hit man ska hitta när man vill stänga av
    forsok(() => { showToast(tx('Jultemat är på. Du stänger av det under Inställningar › Anpassa.')); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('apptoast').classList.add('hidden'), 5200); });
  }
  function fraga() {
    clearTimeout(fragaTimer); fragaTimer = 0;
    if (!skaFraga()) { egenFraga = false; taBortFraga(); return; }
    if (fragaEl && fragaEl.isConnected) {
      if (annanNotis()) taBortFraga(); else return;   // en annan notis kom: den får platsen, frågan kommer tillbaka
    }
    const kvar = 6000 - (Date.now() - START);   // tidigast 6 s efter start: introt och de andra notiserna hinner före
    fragaTimer = setTimeout(fraga, kvar > 0 ? kvar + 100 : 4000);   // försök igen så länge något står i vägen
    if (kvar > 0 || !nyaFlikenSyns() || annanNotis() || typeof window.visaNotis !== 'function') return;
    fragaEl = window.visaNotis({
      id: 'jul-fraga',
      titel: tx('Vill du ha jultema?'),
      under: tx('Julfärger, snö på nya fliken, gorillan i tomteluva och en julkalender. Det slutar av sig självt efter trettondagen.'),
      knapp: tx('Ja tack'), sek: tx('Nej tack'),
      onKnapp: (el) => { fragaEl = null; svara('ja'); el.stang(); },
      onSek: () => { fragaEl = null; svara('nej'); },
    });
    egenFraga = true;
    mataSynlig();
  }

  /* ── Inställningar › Anpassa › Jul (#anp-jul) ──
   * Ritas bara under säsongen (annars tom, så att sökningen i inställningarna inte hittar något). Är Jultema av
   * visas bara huvudbrytaren. Brytarna sparar i Anpassa som alla andra och går att ångra. */
  const RADER = [
    ['farger', 'Julfärger', 'Mörkgrönt, djuprött och guld i hela webbläsaren. Efteråt får du tillbaka temat du hade.'],
    ['sno', 'Snö på nya fliken', 'Lätt snöfall bakom sökrutan. Aldrig över sidorna du besöker.'],
    ['luva', 'Gorillan i tomteluva', 'På nya fliken och i blockerarknappen.'],
    ['kalender', 'Julkalender', 'En lucka om dagen på nya fliken, 1–24 december.'],
    ['stat', 'Statistik i julspråk', 'Hur mycket reklam du har sluppit i december.'],
    ['flikar', 'Snö på flikarna', 'Ett tunt snötäcke på den flik du har framme.'],
  ];
  function el(tag, a, ...barnen) {
    const e = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
    e.append(...barnen.filter(Boolean));
    return e;
  }
  function rad(nyckel, titel, beskr) {
    const inp = el('input', { type: 'checkbox', 'aria-label': titel, 'data-jul-nyckel': nyckel });
    const std = nyckel !== 'jul.pa';   // Jultema är av från början, delarna på. Standardvärdet sparas som "inget värde".
    inp.checked = std ? A.get(nyckel) !== false : A.get(nyckel) === true;
    inp.addEventListener('change', () => { Promise.resolve(A.set(nyckel, inp.checked === std ? undefined : inp.checked, titel)).catch(() => {}); });
    return el('div', { class: 'set-row' },
      el('div', { class: 'set-txt' }, el('div', { class: 'set-title', text: titel }), el('div', { class: 'set-desc', text: beskr })),
      el('label', { class: 'switch' }, inp, el('span', { class: 'track' })));
  }
  const finns = (namn) => namn === 'farger' || delar.has(namn);
  function ritaInstallningar() {
    const sek = $('anp-jul');
    if (!sek) return;
    if (!sasong()) { if (sek.firstChild) sek.replaceChildren(); return; }
    if (INKOGNITO) {
      if (!sek.querySelector('.jul-inst-inkognito')) sek.replaceChildren(
        el('h3', { class: 'set-h3', text: 'Jul' }),
        el('div', { class: 'set-row jul-inst-inkognito' }, el('div', { class: 'set-txt' }, el('div', { class: 'set-title', text: 'Jultemat visas inte i inkognitofönster.' }))));
      return;
    }
    // Huvudraden byggs en gång (byggs den om tappar brytaren fokus); resten läggs till eller tas bort under den
    let huvud = sek.querySelector('.jul-inst-huvud');
    if (!huvud) {
      huvud = rad('jul.pa', 'Jultema', 'Julfärger, snö, tomteluva och julkalender. Gäller 1 december–6 januari, sedan går allt tillbaka.');
      huvud.classList.add('jul-inst-huvud');
      sek.replaceChildren(
        el('h3', { class: 'set-h3', text: 'Jul' }),
        el('p', { class: 'set-lead', text: 'Finns bara under julen. Du väljer själv vad som ska vara på.' }),
        huvud);
    }
    const paNu = A.get('jul.pa') === true;
    const vill = paNu ? RADER.filter(([namn]) => finns(namn)).map(([namn]) => 'jul.' + namn) : [];
    const har = [...sek.querySelectorAll('.jul-inst-del input')].map((i) => i.getAttribute('data-jul-nyckel'));
    if (vill.join() !== har.join()) {
      sek.querySelectorAll('.jul-inst-del').forEach((r) => r.remove());
      for (const [namn, titel, beskr] of RADER) if (vill.includes('jul.' + namn)) { const r = rad('jul.' + namn, titel, beskr); r.classList.add('jul-inst-del'); sek.append(r); }
    }
    for (const inp of sek.querySelectorAll('input[data-jul-nyckel]')) {
      const k = inp.getAttribute('data-jul-nyckel');
      inp.checked = k === 'jul.pa' ? paNu : A.get(k) !== false;
    }
  }

  /* ── Ändringar ── */
  function allt() { provladda(); synka(); ritaInstallningar(); fraga(); }
  A.on('jul.', () => allt());
  forsok(() => bro.onAndrad((ny) => {
    const fore = lage;
    lage = tolka(ny);
    allt();
    if (fore.dag !== lage.dag || fore.sasong !== lage.sasong) sagTill('dag');
    if (fore.luckor.join() !== lage.luckor.join()) sagTill('luckor');
    sagTill('lage');
  }));
  forsok(() => bro.onTyst((ms) => forsok(() => window.AnpassaAngra.tyst(ms))));
  document.addEventListener('anpassa:visa', ritaInstallningar);

  /* ── Gränssnittet mot delarna (fryst) ── */
  window.Jul = Object.freeze({
    nu, sasong, aktiv, pa, barn, del, bild, tx, tn,
    luckor: () => [...lage.luckor],
    oppnaLucka: (n) => Promise.resolve(bro.lucka(n)).then((r) => { if (r && Array.isArray(r.luckor) && r.luckor.join() !== lage.luckor.join()) { lage = { ...lage, luckor: r.luckor }; sagTill('luckor'); } return r; }),
    stat: () => Promise.resolve(bro.stat()),
    sparaBild: (dataUrl) => Promise.resolve(bro.bild('spara', dataUrl)),
    kopieraBild: (dataUrl) => Promise.resolve(bro.bild('kopiera', dataUrl)),
    test: () => !!lage.test,   // datumet är låtsat (ADRAZE_DATUM)
  });

  /* ── Start ── */
  provladda();
  synka();   // data-jul sätts direkt; krokarna körs när sidan är laddad
  function start() {
    laddad = true;
    synka();
    ritaInstallningar();
    // Frågan: första försöket tidigast 6 s efter start, och direkt när nya fliken visas eller en annan notis kommer
    const nt = $('newtabpage');
    if (nt) new MutationObserver(() => { if (skaFraga()) fraga(); }).observe(nt, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => { if (fragaEl && annanNotis()) fraga(); }).observe(document.body, { childList: true });
    fraga();
  }
  if (laddad) start(); else document.addEventListener('DOMContentLoaded', start);
})();
