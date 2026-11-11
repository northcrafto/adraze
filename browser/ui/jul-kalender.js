// Julkalendern på nya fliken (del "kalender") och statistiken i julspråk (del "stat"), med julaftons sammanfattning
// och bilden som går att dela. Laddas efter jul-pynt.js och före shell.js. Stilen står i jul.css, sektion 5 och 6.
//
// Kalendern: en liten lucka med dagens datum bredvid sökrutan öppnar en panel vid högerkanten med alla 24 luckor.
// Dagens lucka och tidigare luckor går att öppna, kommande är stängda. Varje lucka har ett tips om något som finns i
// webbläsaren; den 6, 13 och 20 december visas också hur mycket reklam som stoppats, och lucka 24 är julaftons
// sammanfattning. Vilka luckor som öppnats sparas i huvudprocessen (Jul.oppnaLucka), aldrig i Anpassa: det är ingen
// inställning, och ska varken ge toasten "Ändrat · Ångra" eller hamna i ångra-historiken.
//
// Antalet stoppade annonser och spårare kommer från räknaren per dag i ../jul.js (Jul.stat) och är alltid uppräknat,
// aldrig påhittat: började räknaren efter 1 december står det från vilken dag siffran gäller, och finns inga siffror
// för en period visas ingenting om den. Sparad data och tid är samma uppskattning som skalets egen remsa gör.
// Bilden ritas här i fönstret på en canvas och lämnar datorn först när användaren själv sparar eller kopierar den.
// Ingenting skickas någonstans.
//
// Skalets funktioner (openSettings, createTab, showToast …) finns först när shell.js har körts och används bara inuti
// funktioner som körs senare.
(function () {
  'use strict';
  const Jul = window.Jul, A = window.Anpassa;
  const nt = document.getElementById('newtabpage');
  if (!Jul || !A || !nt) return;
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const forsok = (f, reserv) => { try { return f(); } catch { return reserv; } };
  const tx = Jul.tx, tn = Jul.tn;
  // Flera platshållare i samma sträng: fyll('Flest på en dag: {n} ({d}).', { n: '412', d: '13 december' })
  const fyll = (sv, v) => { let s = tx(sv); for (const [k, x] of Object.entries(v)) s = s.split('{' + k + '}').join(String(x)); return s; };
  const fmt = (n) => (Number(n) || 0).toLocaleString('sv-SE');
  const tal = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const toast = (sv) => forsok(() => showToast(tx(sv)));
  // Bygger DOM säkert: text sätts alltid som textContent
  function h(tag, a, ...barn) {
    const el = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const b of barn.flat(3)) if (b !== null && b !== undefined && b !== false) el.append(b.nodeType ? b : document.createTextNode(String(b)));
    return el;
  }

  /* ── Handritade former ──
   * Samma ritkod som gorillan (logo/gorilla): brus som är lika varje gång, en mjuk kurva genom punkterna och lite
   * darr på handen. Luckorna, strecken och bilden ritas med den, så att allt ser ritat ut med samma penna. */
  const brus = (n, s) => { const x = Math.sin(n * 127.1 + (s || 1) * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  function mjuk(p, sluten) {
    const n = p.length, f = (v) => v.toFixed(1);
    if (!sluten) {
      let d = 'M' + f(p[0][0]) + ' ' + f(p[0][1]);
      for (let i = 1; i < n - 1; i++) { const a = p[i], b = p[i + 1]; d += ' Q' + f(a[0]) + ' ' + f(a[1]) + ' ' + f((a[0] + b[0]) / 2) + ' ' + f((a[1] + b[1]) / 2); }
      return d + ' L' + f(p[n - 1][0]) + ' ' + f(p[n - 1][1]);
    }
    let d = 'M' + f((p[0][0] + p[n - 1][0]) / 2) + ' ' + f((p[0][1] + p[n - 1][1]) / 2);
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; d += ' Q' + f(a[0]) + ' ' + f(a[1]) + ' ' + f((a[0] + b[0]) / 2) + ' ' + f((a[1] + b[1]) / 2); }
    return d + 'Z';
  }
  const darr = (p, fro, a) => p.map((q, i) => [q[0] + brus(fro * 7 + i * 13, fro) * a, q[1] + brus(fro * 7 + i * 13 + 5, fro + 3) * a]);
  // En fyrhörning med rundade hörn: fem punkter per sida, alltid lika många (så att en form kan glida över i en annan)
  function fyrhorning(C, r) {
    const ut = [];
    for (let c = 0; c < 4; c++) {
      const a = C[c], b = C[(c + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      ut.push([a[0] + ux * r * 0.3, a[1] + uy * r * 0.3]);
      for (let i = 0; i < 3; i++) { const t = i / 2; ut.push([a[0] + ux * r + (b[0] - a[0] - 2 * ux * r) * t, a[1] + uy * r + (b[1] - a[1] - 2 * uy * r) * t]); }
      ut.push([b[0] - ux * r * 0.3, b[1] - uy * r * 0.3]);
    }
    return ut;
  }
  const klick = (cx, cy, r, fro, n, ojamn) => Array.from({ length: n }, (_, i) => { const v = i / n * Math.PI * 2, rr = r * (1 + brus(i * 3 + 1, fro) * ojamn); return [cx + Math.cos(v) * rr, cy + Math.sin(v) * rr]; });
  const streck = (x1, y1, x2, y2, bitar) => Array.from({ length: bitar + 1 }, (_, i) => [x1 + (x2 - x1) * i / bitar, y1 + (y2 - y1) * i / bitar]);
  function svg(vy, ...banor) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', vy); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    for (const d of banor) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); }
    return s;
  }

  /* ── Dagarna ── */
  // Sista luckan som går att öppna i dag: dagens datum 1–24 december, alla 24 därefter (till trettondagen)
  function sistaLucka() {
    if (!Jul.sasong()) return 0;
    const d = Jul.nu();
    return d.getMonth() === 11 ? Math.min(24, d.getDate()) : 24;
  }
  const julaftonVarit = () => { const d = Jul.nu(); return !!Jul.sasong() && (d.getMonth() === 0 || d.getDate() >= 24); };
  const januari = () => Jul.nu().getMonth() === 0;
  const datumText = (dag) => tn('{n} december', dag);

  /* ── Skalet: dit knapparna i tipsen leder ── */
  const delPa = { kalender: false, stat: false };
  const skal = {
    installning(id, reserv) {
      stangPanel();
      forsok(() => { openSettings(); showSettingsCat('anpassa'); });
      setTimeout(() => { const s = $(id) || $(reserv); if (s) forsok(() => s.scrollIntoView({ block: 'start' })); }, 80);
    },
    palett() { stangPanel(); forsok(() => window.AnpassaKortkommandon.oppnaPalett()); },
    widgetar() { stangPanel(); forsok(() => window.AnpassaStartsida.redigera()); },
    blockerare() { stangPanel(); forsok(() => createTab('adraze://adblock')); },
    inkognito() { forsok(() => window.anpassaKortkommandon.kor('inkognito')); },
    adress(text) {
      stangPanel();
      forsok(() => { const a = $('address'); a.focus(); a.value = text; a.setSelectionRange(text.length, text.length); a.dispatchEvent(new Event('input', { bubbles: true })); });
    },
    kombination: (id) => { const l = forsok(() => window.AnpassaKortkommandon.kombinationer(id), []); return Array.isArray(l) && l.length ? String(l[0]) : ''; },
    snabbord: () => forsok(() => /youtube\./.test(window.AnpassaSok.url('yt x')) && /wikipedia\./.test(window.AnpassaSok.url('w x')), false),
  };
  const INST = (id, reserv) => () => skal.installning(id, reserv);

  /* ── De 24 luckorna ──
   * Varje tips gäller något som finns (kontrollerat mot koden, se kommentaren på raden). k = kommandot vars
   * kortkommando sätts in där {k} står (det användaren själv har valt, och rätt tecken på Mac). Har kommandot inget
   * kortkommando används texten utanK. knapp = [etikett, vart den leder]. villkor = måste gälla för att tipset ska
   * stämma (inte i barnläge, snabborden kvar): annars visas reservtipset. */
  const RESERV = {
    sok: { titel: 'Sök på sidan', k: 'sok-pa-sidan',   // ../anpassa-kortkommandon.js (Ctrl+F)
      text: 'Letar du efter ett ord på en lång sida? Tryck {k} och skriv det.',
      utanK: 'Letar du efter ett ord på en lång sida? Skriv Sök på sidan i kommandopaletten.' },
    tysta: { titel: 'Tysta en flik',   // shell.js renderTabs: högtalaren (.tsound) på flikar som låter
      text: 'När en flik spelar ljud dyker en högtalare upp på den. Klicka på högtalaren så blir fliken tyst.' },
    bokmark: { titel: 'Bokmärk sidan', k: 'bokmark',   // ../anpassa-kortkommandon.js (Ctrl+D), #bm-star i verktygsraden
      text: 'Tryck {k} för att spara sidan du är på som bokmärke.',
      utanK: 'Klicka på bokmärket till vänster om adressfältet för att spara sidan du är på.' },
  };
  const vuxen = () => !Jul.barn();
  const TIPS = {
    1: { titel: 'Kommandopaletten', k: 'palett', knapp: ['Öppna paletten', skal.palett],   // anpassa-kortkommandon.js (Ctrl+K)
      text: 'Tryck {k} och skriv det du vill göra. Paletten hittar kommandon, flikar, bokmärken och inställningar.',
      utanK: 'Skriv det du vill göra, så hittar paletten kommandon, flikar, bokmärken och inställningar.' },
    2: { titel: 'Ångra en stängd flik', k: 'oppna-igen',   // shell.js closedTabs, flikens meny i ../main.js (tab:menu)
      text: 'Stängde du fel flik? {k} öppnar den igen.',
      utanK: 'Stängde du fel flik? Högerklicka på en flik och välj Öppna stängd flik igen.' },
    3: { titel: 'Flikgrupper',   // ../anpassa-flikar.js menyPoster och gruppens meny
      text: 'Högerklicka på en flik och välj Lägg i ny grupp. Skriv ett namn, och högerklicka på gruppen om du vill byta färg.' },
    4: { titel: 'Läsläge', k: 'lasvy',   // #reader-btn i adressfältet, ../lasvy.js (F9)
      text: 'På artiklar dyker en bok upp i adressfältet. Klicka på den, eller tryck {k}, så blir bara artikeln kvar.',
      utanK: 'På artiklar dyker en bok upp i adressfältet. Klicka på den, så blir bara artikeln kvar.' },
    5: { titel: 'Snabbord', villkor: () => vuxen() && skal.snabbord(), reserv: RESERV.sok, knapp: ['Prova i adressfältet', () => skal.adress('yt ')],   // ../anpassa-sokmotorer.js (yt, w)
      text: 'Skriv yt och ett sökord i adressfältet, så söker du direkt på YouTube. Med w hamnar du på Wikipedia.' },
    6: { titel: 'Blockera element',   // ../main.js buildContextMenu, ../blocksida.js blockeraElement
      text: 'Stör något på en sida? Högerklicka på sidan, välj Blockera element och klicka på det du vill dölja.' },
    7: { titel: 'Bild-i-bild', k: 'bild-i-bild',   // ../main.js bildIBild (Ctrl+Shift+P), #pip-btn i adressfältet
      text: 'Låt en video ligga kvar i ett eget litet fönster medan du gör annat. Tryck {k} när sidan har en video.',
      utanK: 'Låt en video ligga kvar i ett eget litet fönster medan du gör annat. Knappen dyker upp i adressfältet när sidan har en video.' },
    8: { titel: 'Fäst en flik',   // ../main.js tab:menu, shell.js setPinned och restoreTabs
      text: 'Högerklicka på en flik och välj Fäst flik. Den blir liten, hamnar först och finns kvar nästa gång du startar AdRaze.' },
    9: { titel: 'Skölden',   // anpassa-sajt.js, sajtpanel.html (zoom, mörkt läge, ljud)
      text: 'Klicka på skölden i adressfältet när du är på en sajt. Där ställer du in zoom, mörkt läge och ljud för just den sajten.' },
    10: { titel: 'Sovande flikar', knapp: ['Visa inställningen', INST('anp-flikar')],   // anpassa-flikar.js (flikar.sova)
      text: 'Flikar du inte rört på en stund kan släppa minnet och vakna igen när du klickar på dem. Tiden väljer du under Inställningar › Anpassa › Flikar.' },
    11: { titel: 'QR-kod till mobilen',   // ../main.js buildContextMenu, showQR
      text: 'Fortsätt läsa på mobilen: högerklicka på sidan och välj Skapa QR-kod för sidan.' },
    12: { titel: 'Flikarna på sidan', knapp: ['Visa inställningen', INST('anp-flikar')],   // anpassa-flikar.js (flikar.lage = vertikal)
      text: 'Många flikar? Lägg dem i en panel till vänster under Inställningar › Anpassa › Flikar › Placering.' },
    13: { titel: 'Widgetar på startsidan', knapp: ['Anpassa startsidan', skal.widgetar],   // anpassa-startsida.js (TYPER, #anp-st-anpassa)
      text: 'Tryck på Anpassa längst ner på startsidan och lägg till väder, en anteckning eller dagens ordspråk.' },
    14: { titel: 'Musgester', knapp: ['Visa inställningen', INST('anp-kort-gester', 'anp-kortkommandon')],   // ../anpassa-kortkommandon.js GESTER (av från början)
      text: 'Håll ned höger musknapp på en sida och dra åt vänster för att gå bakåt. Du slår på Musgester under Inställningar › Anpassa › Kortkommandon.' },
    15: { titel: 'Arbetsytor', knapp: ['Visa arbetsytor', INST('anp-arbetsytor')],   // anpassa-arbetsytor.js
      text: 'Håll isär skola, jobb och spel. Varje arbetsyta minns sina egna flikar. Du skapar dem under Inställningar › Anpassa › Arbetsytor.' },
    16: { titel: 'Sidopanelen', villkor: vuxen, reserv: RESERV.tysta,   // ../anpassa-sidopanel.js menyval (inte i barnläge)
      text: 'Ha musiken bredvid sidan du läser. Högerklicka på en sida och välj Lägg till i sidopanelen.' },
    17: { titel: 'Glöm mig', knapp: ['Öppna blockerarens inställningar', skal.blockerare],   // adblock.html (glom), ../blocksida.js
      text: 'I blockerarens inställningar finns Glöm mig när jag stänger den här webbplatsen. Då rensas sajtens kakor när du stänger den.' },
    18: { titel: 'Färg från bakgrunden', knapp: ['Visa under Tema', INST('anp-tema')],   // anpassa-tema.js (Hämta färg från bakgrunden)
      text: 'Låt bilden på startsidan bestämma färgen i hela webbläsaren: Inställningar › Anpassa › Tema › Hämta färg från bakgrunden.' },
    19: { titel: 'Översätt en sida',   // ../main.js buildContextMenu
      text: 'Sida på ett annat språk? Högerklicka på sidan och välj Översätt till svenska.' },
    20: { titel: 'Egna kortkommandon', knapp: ['Visa kortkommandon', INST('anp-kortkommandon')],   // anpassa-kortkommandon.js
      text: 'Byt vilket kortkommando som helst under Inställningar › Anpassa › Kortkommandon.' },
    21: { titel: 'Dolda flikar', knapp: ['Visa inställningen', INST('anp-flikar')],   // anpassa-flikar.js (flikar.lage = dolda)
      text: 'Vill du ge sidan hela fönstret? Välj Dolda under Inställningar › Anpassa › Flikar › Placering. Flikraden kommer fram när du för musen till överkanten.' },
    22: { titel: 'Dela ditt tema', knapp: ['Visa under Tema', INST('anp-tema')],   // anpassa-tema.js (Dela ditt tema, Använd en kod)
      text: 'Nöjd med färgerna? Under Inställningar › Anpassa › Tema kopierar du en kod som en kompis kan klistra in i sin AdRaze.' },
    23: { titel: 'Inkognito', k: 'inkognito', villkor: vuxen, reserv: RESERV.bokmark, knapp: ['Öppna ett inkognitofönster', skal.inkognito],   // ../anpassa-kortkommandon.js (Ctrl+Shift+N), huvudmenyn i ../main.js
      text: '{k} öppnar ett inkognitofönster. Ingen historik och inga kakor sparas när du stänger det.',
      utanK: 'Öppna menyn och välj Nytt inkognitofönster. Ingen historik och inga kakor sparas när du stänger det.' },
  };
  const STATDAGAR = [6, 13, 20];   // de här dagarna visar luckan också hur mycket som stoppats (24 = sammanfattningen)
  function tipsFor(n) {
    const t = TIPS[n];
    if (!t) return null;
    return t.villkor && !forsok(t.villkor, false) ? t.reserv : t;
  }

  /* ── Siffrorna ──
   * Jul.stat() ger det räknaren per dag har räknat: { ar, forsta, december: { a, s }, perDag: [{ dag, a, s }] }.
   * a = annonser, s = spårare. forsta = dagen räknaren började. Började den efter 1 december gäller siffrorna från
   * den dagen, och började den efter december finns inga siffror alls. */
  let stat = null, statLofte = null, statGammal = true;
  function tvatta(s) {
    if (!s || typeof s !== 'object') return null;
    const par = (o) => ({ a: tal(o && o.a), s: tal(o && o.s) });
    const perDag = (Array.isArray(s.perDag) ? s.perDag : []).filter((d) => d && /^\d{4}-12-\d{2}$/.test(d.dag)).map((d) => ({ dag: +d.dag.slice(8), a: tal(d.a), s: tal(d.s) }));
    return { ar: tal(s.ar), forsta: typeof s.forsta === 'string' ? s.forsta : '', december: par(s.december), perDag };
  }
  function hamtaStat() {
    if (!statLofte) {
      statLofte = Jul.stat().then((s) => { stat = tvatta(s); statGammal = false; }, () => {}).then(() => { statLofte = null; return stat; });
    }
    return statLofte;
  }
  // Från vilken dag i december siffrorna gäller (1 = hela månaden). null = inga siffror för den här julens december.
  function period(s) {
    if (!s || !s.ar || !/^\d{4}-\d{2}-\d{2}$/.test(s.forsta)) return null;
    if (s.forsta <= s.ar + '-12-01') return 1;
    if (s.forsta <= s.ar + '-12-31') return +s.forsta.slice(8);
    return null;
  }
  const summa = (o) => o.a + o.s;
  function bastaDag(s, tillDag) {
    let b = null;
    for (const d of s.perDag) { const n = d.a + d.s; if (d.dag <= tillDag && n > 0 && (!b || n > b.n)) b = { dag: d.dag, n }; }
    return b;
  }
  // Samma uppskattning som skalets egen remsa: ungefär 30 kB och 50 ms per stopp
  function dataDelar(n) {
    const kb = n * 30;
    if (kb < 1024) return [fmt(Math.round(kb)), 'kB'];
    const mb = kb / 1024;
    return mb >= 1024 ? [(mb / 1024).toLocaleString('sv-SE', { maximumFractionDigits: 1 }), 'GB'] : [fmt(Math.round(mb)), 'MB'];
  }
  function tidDelar(n) {
    const sek = n * 0.05;
    const [v, en, flera] = sek >= 3600 ? [(sek / 3600).toLocaleString('sv-SE', { maximumFractionDigits: 1 }), 'timme', 'timmar']
      : sek >= 60 ? [fmt(Math.round(sek / 60)), 'minut', 'minuter'] : [fmt(Math.round(sek)), 'sekund', 'sekunder'];
    return [v, tx(v === '1' ? en : flera)];
  }
  // December så här långt (remsan och statistikluckorna)
  function decemberSiffror(s) {
    const fran = period(s);
    if (!fran) return null;
    const n = summa(s.december), jan = januari();
    let mening;
    if (fran === 1) mening = jan ? tx('annonser och spårare stoppade AdRaze åt dig i december.') : tx('annonser och spårare har AdRaze stoppat åt dig hittills i december.');
    else mening = jan ? tn('annonser och spårare stoppade AdRaze åt dig {n} december.', fran + '–31') : tn('annonser och spårare har AdRaze stoppat åt dig sedan den {n} december.', fran);
    let etikett;
    if (fran === 1) etikett = jan ? tx('annonser och spårare slapp du i december') : tx('annonser och spårare har du sluppit i december');
    else etikett = jan ? tn('annonser och spårare slapp du {n} december', fran + '–31') : tn('annonser och spårare har du sluppit sedan den {n} december', fran);
    return { n, fran, mening, etikett, basta: bastaDag(s, 31) };
  }
  // Sammanfattningen (från julafton): december så här långt, samma summa som remsan visar. dagar = "1–24", "1–31" …
  function summeringSiffror(s) {
    const fran = period(s);
    if (!fran) return null;
    const d = Jul.nu(), till = Math.max(fran, d.getMonth() === 11 ? d.getDate() : 31);
    return { ar: s.ar, n: summa(s.december), dagar: fran === till ? String(till) : fran + '–' + till, basta: bastaDag(s, 31), luckor: Jul.luckor().length };
  }

  /* ── Luckan: en ritad dörr av papper ──
   * Tre former med lika många punkter: stängd, på glänt (när pekaren är över) och öppen. Bladets bana ligger som
   * CSS-variabler på knappen och jul.css väljer mellan dem, så att dörren glider upp av sig själv när klassen byts. */
  const DORR = { stangd: [[[3, 3], [43, 3], [43, 43], [3, 43]], 6], glant: [[[3, 3], [38.6, 1.4], [38.6, 44.6], [3, 43]], 5], oppen: [[[3, 3], [13.6, -1.4], [13.6, 47.4], [3, 43]], 2.6] };
  const dorrBana = (form, n) => mjuk(darr(fyrhorning(DORR[form][0], DORR[form][1]), n * 17 + 3, 0.7), true);
  function byggDorr(n) {
    const stangd = dorrBana('stangd', n);
    const b = h('button', { type: 'button', class: 'jul-dorr', 'data-n': n },
      h('span', { class: 'jul-dorr-inne' }, svg('0 0 46 46', stangd), h('b', { text: n })),
      h('span', { class: 'jul-dorr-blad' }, svg('0 0 46 46', stangd), h('b', { text: n })),
      h('i', { class: 'jul-dorr-ny' }, svg('0 0 46 46', mjuk(darr(klick(40.5, 5.5, 5.4, n + 2, 9, 0.1), n + 5, 0.3), true))),
      h('i', { class: 'jul-dorr-vald' }, svg('0 0 46 46', mjuk(darr(streck(6, 51, 40, 51, 4), n + 9, 0.7), false))));
    for (const form of ['stangd', 'glant', 'oppen']) b.style.setProperty('--jd-' + form, 'path("' + dorrBana(form, n) + '")');
    return b;
  }
  // läge: { oppnad, kommande, ny, vald }
  function sattDorr(b, n, l) {
    b.classList.toggle('oppnad', !!l.oppnad);
    b.classList.toggle('kommande', !!l.kommande);
    b.classList.toggle('ny', !!l.ny);
    b.classList.toggle('vald', !!l.vald);
    if (l.kommande) { b.setAttribute('aria-disabled', 'true'); b.title = tn('Öppnas den {n} december', n); } else { b.removeAttribute('aria-disabled'); b.removeAttribute('title'); }
    b.setAttribute('aria-label', tn(l.kommande ? 'Lucka {n}, öppnas den {n} december' : l.oppnad ? 'Lucka {n}, öppnad' : 'Lucka {n}, inte öppnad', n));
  }

  /* ── Luckan på nya fliken ──
   * Sitter till vänster om sökrutan, i en plats utan höjd (inget i kolumnen flyttar sig). Får den inte rum där, eller
   * är sökrutan avstängd, flyttar den ner bredvid Anpassa-knappen. */
  let plats = null, lucka = null, luckaNr = 0;
  function ritaLucka() {
    if (!plats) return;
    const n = sistaLucka();
    if (!n) { if (lucka) { lucka.remove(); lucka = null; luckaNr = 0; } return; }
    if (!lucka || luckaNr !== n) {
      const ny = byggDorr(n);
      ny.id = 'jul-lucka';
      ny.addEventListener('click', () => oppnaPanel('kalender', sistaLucka()));
      if (lucka) lucka.replaceWith(ny); else plats.append(ny);
      lucka = ny; luckaNr = n;
    }
    const oppnad = Jul.luckor().includes(n);
    sattDorr(lucka, n, { oppnad, ny: !oppnad });
    lucka.title = tx('Julkalender');
    lucka.setAttribute('aria-label', tn(oppnad ? 'Julkalender, lucka {n} är öppnad' : 'Julkalender, lucka {n} väntar', n));
    placeraLucka();
  }
  function placeraLucka() {
    if (!lucka || !plats || nt.classList.contains('hidden')) return;
    const sok = nt.querySelector('.anp-st-sok'), sida = nt.getBoundingClientRect();
    let nere = !sok || nt.classList.contains('anp-utan-sok');
    if (!nere) {
      const r = sok.getBoundingClientRect();
      const fritt = document.documentElement.dir === 'rtl' ? sida.right - r.right : r.left - sida.left;
      nere = r.width > 0 && fritt < 78;   // luckan (52) och luften runt den
    }
    if (nere) {
      const knapp = $('anp-st-anpassa');
      const fran = knapp && knapp.offsetWidth ? knapp.offsetLeft + knapp.offsetWidth + 8 : 16;
      if (lucka.parentElement !== nt) nt.append(lucka);
      lucka.classList.add('jul-nere');
      lucka.style.insetInlineStart = fran + 'px';
    } else {
      if (lucka.parentElement !== plats) plats.append(lucka);
      lucka.classList.remove('jul-nere');
      lucka.style.insetInlineStart = '';
    }
  }

  /* ── Panelen ──
   * Två lägen: "kalender" (alla 24 luckor och den valda luckans innehåll) och "summering" (julaftons sammanfattning
   * över hela panelen: dit kommer man från lucka 24 och från statistikremsan). Ligger på samma plats som lådan med
   * widgetar, men är bara så hög som innehållet kräver. */
  let panel = null, galler = null, blad = null, rubrik = null, bak = null, fot = null, dorrar = [], vald = 0, panelLage = '', aterFokus = null;
  const panelOppen = () => !!panel && !panel.hidden;
  const rorelse = () => !(document.body.classList.contains('reduce-motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const sov = (ms) => new Promise((klar) => setTimeout(klar, ms));
  const kryss = () => svg('0 0 24 24', mjuk(darr(streck(6.6, 6.8, 17.4, 17.2, 3), 4, 0.5), false), mjuk(darr(streck(17.3, 6.7, 6.7, 17.4, 3), 8, 0.5), false));
  const pilVanster = () => svg('0 0 24 24', mjuk(darr(streck(19.4, 12.2, 5.6, 11.8, 3), 6, 0.4), false), mjuk(darr([[10.8, 6.6], [5, 11.9], [10.6, 17.4]], 9, 0.4), false));
  function byggPanel() {
    if (panel) return;
    rubrik = h('h2');
    bak = h('button', { type: 'button', class: 'jul-kal-bak', hidden: true, onclick: () => visaKalender(0) }, pilVanster(), h('span', { text: 'Alla luckor' }));
    galler = h('div', { class: 'jul-kal-luckor', role: 'group', 'aria-label': 'Luckor' });
    dorrar = [];
    for (let n = 1; n <= 24; n++) { const d = byggDorr(n); d.addEventListener('click', () => valj(n)); dorrar.push(d); galler.append(d); }
    galler.addEventListener('keydown', pilar);
    blad = h('div', { class: 'jul-kal-blad', role: 'region', 'aria-live': 'polite', 'aria-label': 'Luckans innehåll' });
    fot = h('p', { class: 'jul-kal-fot' }, h('span'), h('span'));
    panel = h('aside', { id: 'jul-kalender', hidden: true, 'aria-label': 'Julkalender' },
      h('div', { class: 'jul-kal-topp' },
        h('div', null, rubrik, h('i', { class: 'jul-kal-penna' }, svg('0 0 120 8', mjuk(darr(streck(2, 4.4, 118, 3.6, 6), 21, 1.1), false))), bak),
        h('button', { type: 'button', class: 'jul-kal-x', title: 'Stäng', 'aria-label': 'Stäng', onclick: () => stangPanel(true) }, kryss())),
      galler, blad, fot);
    nt.append(panel);
  }
  function rivPanel() {
    stangPanel();
    if (panel) panel.remove();
    panel = galler = blad = rubrik = bak = fot = aterFokus = null; dorrar = []; vald = 0; panelLage = '';
  }
  // Raden längst ned: hur många som är öppnade, och luckor som väntar eller när nästa öppnas
  function harnast() {
    const sista = sistaLucka(), oppna = Jul.luckor(), d = Jul.nu();
    let kvar = 0;
    for (let n = 1; n <= sista; n++) if (!oppna.includes(n)) kvar++;
    if (kvar > 1) return tn('{n} luckor väntar', kvar);
    if (kvar === 1) return tx('En lucka väntar');
    if (d.getMonth() === 11 && d.getDate() < 24) return tn('Lucka {n} öppnas i morgon', d.getDate() + 1);
    return d.getMonth() === 11 && d.getDate() === 24 ? tx('Det var sista luckan. God jul!') : tx('Finns kvar till trettondagen');
  }
  // n = luckan som ska visas (öppnas om den inte redan är det), 0 = bara luckorna
  function oppnaPanel(lage, n) {
    if (lage === 'kalender' && !delPa.kalender) return;
    byggPanel();
    forsok(() => window.AnpassaStartsida.klar());   // lådan med widgetar ligger på samma plats
    if (panel.hidden) { aterFokus = document.activeElement; panel.hidden = false; document.addEventListener('keydown', escTangent); }
    if (lage === 'kalender') visaKalender(n); else visaSummering();
  }
  function sattLage(lage) {
    panelLage = lage; vald = 0; valNr++;
    panel.classList.toggle('jul-bara-summering', lage !== 'kalender');
    rubrik.textContent = tx(lage === 'kalender' ? 'Julkalender' : 'Din december');
    bak.hidden = lage === 'kalender' || !delPa.kalender;
  }
  function visaKalender(n) {
    if (!panelOppen() || !delPa.kalender) return;
    sattLage('kalender');
    ritaDorrar();
    if (n) { valj(n, true); return; }
    visa([h('p', { class: 'jul-kal-text', text: 'Välj en lucka för att läsa den igen.' })]);
    fokusera(dorrar[Math.max(1, sistaLucka()) - 1]);
  }
  function visaSummering() {
    if (!panelOppen()) return;
    sattLage('summering');
    const sum = h('div', { class: 'jul-sum' });
    visa([sum]);
    fyllSummering(sum);
    fokusera(bak.hidden ? panel.querySelector('.jul-kal-x') : bak);
  }
  function stangPanel(tillbaka) {
    if (!panelOppen()) return;
    panel.hidden = true; valNr++;
    document.removeEventListener('keydown', escTangent);
    if (blad) blad.replaceChildren();
    if (tillbaka && aterFokus && aterFokus.isConnected) fokusera(aterFokus);
    aterFokus = null;
  }
  const fokusera = (el) => { if (el) setTimeout(() => forsok(() => el.focus({ preventScroll: true })), 30); };
  function escTangent(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !panelOppen()) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    e.preventDefault(); stangPanel(true);
  }
  // Piltangenter mellan luckorna (bara en lucka i taget ligger i tabbordningen)
  function pilar(e) {
    const d = e.target.closest && e.target.closest('.jul-dorr'); if (!d) return;
    const i = dorrar.indexOf(d), steg = document.documentElement.dir === 'rtl' ? -1 : 1;
    const j = { ArrowRight: i + steg, ArrowLeft: i - steg, ArrowDown: i + 6, ArrowUp: i - 6, Home: 0, End: 23 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    if (j < 0 || j > 23) return;
    dorrar[i].tabIndex = -1; dorrar[j].tabIndex = 0; dorrar[j].focus();
  }
  function ritaDorrar() {
    if (!panel || panelLage !== 'kalender') return;
    const oppna = Jul.luckor(), sista = sistaLucka(), fokus = dorrar.indexOf(document.activeElement) + 1;
    const hem = fokus || vald || sista || 1;
    dorrar.forEach((d, i) => {
      const n = i + 1, oppnad = oppna.includes(n);
      sattDorr(d, n, { oppnad, kommande: n > sista, ny: n === sista && !oppnad, vald: n === vald });
      d.tabIndex = n === hem ? 0 : -1;
    });
    fot.firstChild.textContent = tn('{n} av 24 öppnade', oppna.length);
    fot.lastChild.textContent = harnast();
  }
  function visa(delar) { blad.replaceChildren(...delar.filter(Boolean)); blad.scrollTop = 0; }
  let valNr = 0;
  async function valj(n, vidOppning) {
    if (!panelOppen() || panelLage !== 'kalender') return;
    const nr = ++valNr;
    if (n > sistaLucka()) {   // en kommande lucka: säg när den öppnas
      vald = 0; ritaDorrar();
      visa([h('div', { class: 'jul-kal-datum', text: datumText(n) }), h('p', { class: 'jul-kal-text', text: tn('Lucka {n} öppnas den {n} december.', n) })]);
      return;
    }
    const ny = !Jul.luckor().includes(n);
    if (ny) {
      const r = await Promise.resolve(Jul.oppnaLucka(n)).catch(() => null);
      if (!r || !r.ok) { toast('Det gick inte att öppna luckan.'); return; }
      if (nr !== valNr || !panelOppen()) return;
    }
    vald = n;
    ritaDorrar(); ritaLucka();
    if (vidOppning) fokusera(dorrar[n - 1]);
    if (n !== 24) { visaLucka(n); return; }
    // Lucka 24 är julaftons sammanfattning och får hela panelen. Öppnas luckan just nu får dörren först gå upp.
    if (ny && rorelse()) {
      visa([h('div', { class: 'jul-kal-datum', text: tx('Julafton') })]);
      await sov(700);
      if (nr !== valNr || !panelOppen()) return;
    }
    visaSummering();
  }

  /* ── Luckans innehåll ── */
  const knapp = (etikett, nar, klass) => h('button', { type: 'button', class: 'jul-knapp' + (klass ? ' ' + klass : ''), onclick: nar }, h('span', { text: etikett }));
  // Tipsets text med kortkommandot som en tangent: "Tryck [Ctrl+K] och skriv …"
  function tipsText(t) {
    const kombo = t.k ? skal.kombination(t.k) : '';
    const p = h('p', { class: 'jul-kal-text' });
    tx(t.k && !kombo ? t.utanK : t.text).split('{k}').forEach((bit, i) => {
      if (i) p.append(h('kbd', { class: 'jul-kbd', translate: 'no', text: kombo }));
      if (bit) p.append(bit);
    });
    return p;
  }
  function visaLucka(n) {
    const datum = h('div', { class: 'jul-kal-datum', text: n === 13 ? tx('Lucia, 13 december') : datumText(n) });
    const t = tipsFor(n);
    const siffror = STATDAGAR.includes(n) ? h('div', { class: 'jul-kal-stat', 'data-jul-stat': '' }) : null;
    visa([datum, siffror, h('h3', { text: t.titel }), tipsText(t), t.knapp ? knapp(t.knapp[0], t.knapp[1]) : null]);
    if (siffror) fyllStat(siffror);
  }
  // Statistikluckan: decembers siffror ovanför tipset. Finns inga siffror visas bara tipset.
  async function fyllStat(el) {
    const s = await hamtaStat();
    if (el.isConnected) ritaStat(el, s);
  }
  function ritaStat(el, s) {
    const d = s ? decemberSiffror(s) : null;
    if (!d) { el.replaceChildren(); return; }
    if (!d.n) { el.replaceChildren(h('p', { class: 'jul-kal-text', text: januari() ? tx('Inget stoppades i december.') : tx('Inget stoppat än i december.') }), h('div', { class: 'jul-kal-etikett', text: 'Dagens tips' })); return; }
    el.replaceChildren(
      h('div', { class: 'jul-kal-tal', translate: 'no', text: fmt(d.n) }),
      h('p', { class: 'jul-kal-text', text: d.mening }),
      d.basta ? h('p', { class: 'jul-kal-liten', text: fyll('Flest på en dag: {n} ({d}).', { n: fmt(d.basta.n), d: datumText(d.basta.dag) }) }) : null,
      h('div', { class: 'jul-kal-etikett', text: 'Dagens tips' }));
  }

  /* ── Julaftons sammanfattning ──
   * December så här långt (på julafton 1–24 december, efter nyår hela månaden): summan, bästa dagen, ungefär sparad
   * data och tid, öppnade luckor och bilden som går att dela. Utan siffror för december (räknaren började först i
   * januari) eller med noll stoppade visas ingen bild. */
  async function fyllSummering(el) {
    const s = await hamtaStat();
    if (!el.isConnected) return;
    const d = s ? summeringSiffror(s) : null;
    if (!d || !d.n) {
      el.replaceChildren(
        h('p', { class: 'jul-kal-text', text: !d ? tx('Det finns inga siffror för december. AdRaze började räkna först efteråt.') : januari() ? tx('Inget stoppades i december.') : tx('Inget stoppat än i december.') }),
        delPa.kalender ? h('p', { class: 'jul-kal-liten', text: tn('Du har öppnat {n} av 24 luckor.', Jul.luckor().length) }) : null);
      return;
    }
    const [data, dataEnhet] = dataDelar(d.n), [tid, tidEnhet] = tidDelar(d.n);
    const fakta = [
      d.basta ? ['Flest på en dag', fmt(d.basta.n) + ' (' + datumText(d.basta.dag) + ')'] : null,
      ['Mindre data', tn('ungefär {n}', data + ' ' + dataEnhet)],
      tid !== '0' ? ['Sparad tid', tn('ungefär {n}', tid + ' ' + tidEnhet)] : null,   // "ungefär 0 sekunder" säger ingenting
      delPa.kalender ? ['Öppnade luckor', tn('{n} av 24', d.luckor)] : null,
    ].filter(Boolean);
    const duk = h('canvas', { class: 'jul-sum-bild', width: BILD.b, height: BILD.h, role: 'img', 'aria-label': 'Bilden som sparas eller kopieras' });
    const knappar = h('div', { class: 'jul-sum-knappar' });
    el.replaceChildren(
      h('div', { class: 'jul-kal-tal', translate: 'no', text: fmt(d.n) }),
      h('p', { class: 'jul-kal-text', text: tn('annonser och spårare stoppade AdRaze åt dig {n} december.', d.dagar) }),
      h('dl', { class: 'jul-sum-fakta' }, fakta.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      duk, knappar,
      h('p', { class: 'jul-kal-liten', text: 'Bilden ritas här på datorn och innehåller bara siffrorna ovan. Inget skickas någonstans.' }));
    const ok = await ritaBild(duk, d, fakta).then(() => true, () => false);
    if (!el.isConnected || !ok) return;
    // En åtgärd i taget: knapparna är låsta medan bilden sparas eller kopieras
    const gor = (atgard, klart, misslyckat) => async () => {
      if (knappar.classList.contains('jul-vantar')) return;
      knappar.classList.add('jul-vantar');
      let r = null;
      try { r = await atgard(duk.toDataURL('image/png')); } catch {}
      knappar.classList.remove('jul-vantar');
      if (r && r.ok) toast(klart); else if (!r || !r.avbrutet) toast(misslyckat);
    };
    knappar.append(
      knapp('Spara som bild', gor((b) => Jul.sparaBild(b), 'Bilden är sparad.', 'Det gick inte att spara bilden.')),
      knapp('Kopiera bilden', gor((b) => Jul.kopieraBild(b), 'Bilden är kopierad.', 'Det gick inte att kopiera bilden.'), 'jul-knapp-sek'));
  }

  /* ── Bilden som går att dela ──
   * 1200 × 630 på en canvas: beige papper, bläck, den orangea klicken, gorillan i luva och personens egna siffror.
   * Inget namn och inget konto. Samma färger och samma ritade linjer som loggan (logo/gorilla). */
  const BILD = { b: 1200, h: 630, papper: '#f4efe6', ink: '#1b1916', klick: '#ff4b1f', typsnitt: '"AdRaze Display", Charter, Georgia, serif' };
  const laddaBild = (src) => new Promise((klar) => { if (!src) { klar(null); return; } const im = new Image(); im.onload = () => klar(im.naturalWidth > 0 ? im : null); im.onerror = () => klar(null); im.src = src; });
  async function ritaBild(duk, d, fakta) {
    const g = duk.getContext('2d'), T = BILD.typsnitt, dov = 'rgb(27 25 22 / .64)';
    await Promise.all([500, 600].map((v) => Promise.resolve(forsok(() => document.fonts.load(v + ' 60px "AdRaze Display"'))).catch(() => {})));
    const gorilla = await laddaBild(Jul.bild('stor'));
    const penna = (bana, bredd, farg) => { g.lineWidth = bredd; g.strokeStyle = farg; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(new Path2D(bana)); };
    const typ = (vikt, px) => { g.font = vikt + ' ' + px + 'px ' + T; };
    // Största storleken (högst "storlek") där alla texterna får plats på bredden: samma storlek i hela raden
    const passa = (texter, vikt, storlek, bredd) => { let px = storlek; typ(vikt, px); while (px > 12 && texter.some((t) => g.measureText(t).width > bredd)) typ(vikt, --px); return px; };
    const text = (s, x, y, vikt, px, farg, hoger) => { typ(vikt, px); g.fillStyle = farg; g.textAlign = hoger ? 'right' : 'left'; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); };
    // Stor text ritas i liten grad och förstoras: då väljer typsnittet sin kraftigare teckning (som klockan på nya
    // fliken) i stället för rubrikgradens hårfina streck, som inte passar ihop med bläcklinjerna
    const stor = (s, x, y, vikt, storlek, grad, bredd, glesning) => {
      typ(vikt, grad); g.letterSpacing = glesning + 'px';
      const b = g.measureText(s).width, k = Math.min(storlek / grad, bredd / b);
      g.save(); g.translate(x, y); g.scale(k, k);
      g.fillStyle = BILD.ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(s, 0, 0);
      g.restore(); g.letterSpacing = '0px';
      return b * k;
    };
    g.fillStyle = BILD.papper; g.fillRect(0, 0, BILD.b, BILD.h);
    // Ramen: en ritad linje ett stycke in från kanten
    penna(mjuk(darr(fyrhorning([[30, 30], [1170, 30], [1170, 600], [30, 600]], 34), 5, 2.4), true), 6, BILD.ink);
    // Snöflingor i bläck runt gorillan (utanför ytan där talet kan stå, också när det är långt)
    for (const [x, y, r, fro] of [[744, 98, 13, 1], [1130, 112, 10, 2], [758, 262, 10, 3], [1136, 368, 13, 4], [668, 150, 8, 5], [1050, 420, 9, 6]]) {
      for (let i = 0; i < 3; i++) {
        const v = i * Math.PI / 3 + 0.5 + brus(fro, i + 1) * 0.18, dx = Math.cos(v) * r, dy = Math.sin(v) * r;
        penna(mjuk(darr(streck(x - dx, y - dy, x + dx, y + dy, 2), fro * 3 + i, 0.7), false), 3.4, 'rgb(27 25 22 / .5)');
      }
    }
    if (gorilla) g.drawImage(gorilla, 782, 60, 350, 350);
    else { g.fillStyle = BILD.klick; g.fill(new Path2D(mjuk(darr(klick(957, 235, 150, 4, 16, 0.06), 9, 2.2), true))); }
    // Perioden, det stora talet med en ritad understrykning, och meningen
    g.letterSpacing = '1px';
    const period = fyll('{n} december {d}', { n: d.dagar, d: d.ar });
    text(period, 86, 112, 500, passa([period], 500, 30, 640), dov);
    g.letterSpacing = '0px';
    const bredd = stor(fmt(d.n), 82, 312, 600, 208, 60, 650, -1.6);
    penna(mjuk(darr(streck(86, 346, 86 + Math.max(150, bredd - 8), 340, 5), 12, 3), false), 13, BILD.klick);
    stor(tx('annonser och spårare slapp jag'), 86, 412, 500, 43, 43, 660, 0);
    // Fakta under en tunn linje
    penna(mjuk(darr(streck(86, 454, 1114, 451, 9), 31, 1.6), false), 2.6, 'rgb(27 25 22 / .38)');
    const kolumn = (1114 - 86) / fakta.length, etiketter = fakta.map(([k]) => tx(k)), varden = fakta.map(([, v]) => v);
    const liten = passa(etiketter, 500, 22, kolumn - 26), fet = passa(varden, 600, 30, kolumn - 26);
    fakta.forEach((_, i) => {
      text(etiketter[i], 86 + i * kolumn, 496, 500, liten, dov);
      text(varden[i], 86 + i * kolumn, 535, 600, fet, BILD.ink);
    });
    text('adraze.app', 1114, 583, 600, 25, BILD.ink, true);
  }

  /* ── Statistiken i julspråk (remsan längst ned på nya fliken) ──
   * Skalets egna siffror (#stat-blocked m.fl.) rörs inte: de göms av jul.css medan remsan har klassen jul-stat-pa,
   * och julens egna element ligger bredvid. Utan siffror för december, eller innan något har stoppats i december,
   * visas remsan som vanligt (totalen säger mer än en nolla). */
  let remsa = null, re = null;
  function statPa() {
    remsa = nt.querySelector('.nt-stats');
    const n = $('stat-blocked'), band = $('stat-band-u'), tid = $('stat-time-u');
    const etikett = n && n.closest('.nt-st') ? n.closest('.nt-st').querySelector('.nt-st-l') : null;
    if (!remsa || !n || !band || !tid || !etikett) { remsa = null; return; }
    re = {
      n: h('span', { class: 'jul-st', translate: 'no' }), l: h('div', { class: 'nt-st-l jul-st' }),
      band: h('span', { class: 'jul-st', translate: 'no' }), bandU: h('small', { class: 'jul-st', translate: 'no' }),
      tid: h('span', { class: 'jul-st', translate: 'no' }), tidU: h('small', { class: 'jul-st' }),
      mer: h('button', { type: 'button', id: 'jul-st-mer', class: 'nt-st jul-st', onclick: () => oppnaPanel('summering') },
        h('span', { class: 'jul-st-mer-t' }, h('span', { text: 'Din december' }), svg('0 0 24 24', mjuk(darr(streck(4.5, 12.2, 18.6, 11.8, 3), 6, 0.4), false), mjuk(darr([[13.4, 6.6], [19.2, 11.9], [13.6, 17.4]], 9, 0.4), false))),
        h('span', { class: 'nt-st-l', text: 'Sammanfattning att dela' })),
    };
    n.after(re.n); etikett.after(re.l);
    band.after(re.band, re.bandU); tid.after(re.tid, re.tidU);
    remsa.append(re.mer);
    ritaRemsa();
    uppdatera();
  }
  function statAv() {
    if (re) for (const el of Object.values(re)) el.remove();
    if (remsa) remsa.classList.remove('jul-stat-pa', 'jul-stat-mer');
    remsa = re = null;
    forsok(() => fitNtStats());
  }
  function ritaRemsa() {
    if (!re) return;
    let d = stat ? decemberSiffror(stat) : null;
    if (d && !d.n) d = null;
    const jul = stat && julaftonVarit() ? summeringSiffror(stat) : null;
    const fore = remsa.className;
    remsa.classList.toggle('jul-stat-pa', !!d);
    remsa.classList.toggle('jul-stat-mer', !!(d && jul && jul.n > 0));
    if (d) {
      const [band, bandU] = dataDelar(d.n), [tid, tidU] = tidDelar(d.n);
      re.n.textContent = fmt(d.n); re.l.textContent = d.etikett;
      re.band.textContent = band; re.bandU.textContent = bandU;
      re.tid.textContent = tid; re.tidU.textContent = tidU;
    }
    if (remsa.className !== fore) forsok(() => fitNtStats());
  }

  /* ── Uppdatering ── */
  const synlig = () => !nt.classList.contains('hidden') && document.visibilityState === 'visible';
  async function uppdatera() {
    await hamtaStat();
    ritaRemsa();
    if (panelOppen()) for (const el of panel.querySelectorAll('[data-jul-stat]')) ritaStat(el, stat);
  }
  // Varje stoppad annons eller spårare: hämta om siffrorna, högst två gånger i sekunden och bara när nya fliken syns
  let traffTimer = 0;
  forsok(() => window.skoll.onAdblockHit((typ) => {
    if ((typ !== 'ad' && typ !== 'tracker') || !(delPa.kalender || delPa.stat)) return;
    statGammal = true;
    if (traffTimer || !synlig()) return;
    traffTimer = setTimeout(() => { traffTimer = 0; if (statGammal && synlig() && (delPa.stat || panelOppen())) uppdatera(); }, 500);
  }));
  // Nya fliken visas, ändrar utseende eller storlek: luckan på rätt plats, färska siffror. Göms den, eller läggs en
  // ruta över den (inställningar, inloggning, bokmärken, bakgrundsväljaren, QR), stängs panelen.
  const RUTOR = ['settings', 'login', 'bookmarks', 'bgpick', 'qr'];
  let vakter = null;
  function vid() {
    const dold = nt.classList.contains('hidden');
    if (dold || nt.classList.contains('anp-redigerar') || nt.classList.contains('anp-tom') || RUTOR.some((id) => { const el = $(id); return !!el && !el.classList.contains('hidden'); })) stangPanel();
    if (dold) return;
    placeraLucka();
    if (statGammal && delPa.stat) uppdatera();
  }
  let vidRam = 0;
  const vidSnart = () => { if (!vidRam) vidRam = requestAnimationFrame(() => { vidRam = 0; vid(); }); };
  function vaktPa() {
    if (vakter) return;
    const mo = new MutationObserver(vidSnart);
    mo.observe(nt, { attributes: true, attributeFilter: ['class'] });
    for (const id of RUTOR) { const el = $(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); }
    const ro = new ResizeObserver(vidSnart);
    ro.observe(nt);
    document.addEventListener('visibilitychange', vidSnart);
    vakter = [mo, ro];
  }
  function vaktAv() {
    if (!vakter || delPa.kalender || delPa.stat) return;
    for (const v of vakter) v.disconnect();
    document.removeEventListener('visibilitychange', vidSnart);
    vakter = null;
    rivPanel();
  }

  /* ── Delarna ── */
  Jul.del('kalender', {
    pa() {
      delPa.kalender = true;
      const sok = nt.querySelector('.anp-st-sok');
      plats = h('div', { id: 'jul-lucka-plats' });
      if (sok) sok.after(plats); else nt.append(plats);
      ritaLucka();
      vaktPa();
      if (panelOppen()) visaSummering();   // sammanfattningen är öppen: nu med vägen tillbaka till luckorna
    },
    av() {
      delPa.kalender = false;
      if (panelLage === 'kalender') rivPanel(); else if (panelOppen()) visaSummering();
      if (lucka) lucka.remove();
      if (plats) plats.remove();
      plats = lucka = null; luckaNr = 0;
      vaktAv();
    },
    andrat(vad) {
      if (vad === 'dag' || vad === 'luckor') { ritaLucka(); ritaDorrar(); }
      if (vad === 'dag') { statGammal = true; if (panelOppen()) uppdatera(); }   // en öppen statistiklucka får den nya dagens siffror
    },
  });
  Jul.del('stat', {
    pa() { delPa.stat = true; statGammal = true; statPa(); vaktPa(); },
    av() { delPa.stat = false; if (panelLage === 'summering') rivPanel(); statAv(); vaktAv(); },
    andrat(vad) { if (vad === 'dag') { statGammal = true; uppdatera(); } },
  });
})();
