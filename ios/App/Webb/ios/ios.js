/* ios.js – datorns sidor som iPhone-sidor. Körs när dokumentet är tolkat (WKUserScript vid dokumentslut),
 * efter datorns skript. Ändrar inget i datorns filer: lägger till klasser, flyttar några element och kopplar
 * om det som är skrivbordsspecifikt (fönsterknappar, flikar, hovring).
 *
 *   anpassa.html     Inställningarna som en lista → detaljvy (som Inställningar i iOS), Anpassa öppen direkt
 *                    med #<kategori>. Krysset stänger arket. Kategorier som inte finns på iPhone döljs, och
 *                    sådana vars kanaler ingen modul har registrerat än (konto, Falk, lösenord …) likaså.
 *   startsida.html   Bara nya fliken: klocka, sökfält, genvägar, widgetar och bakgrund i telefonformat.
 *
 * Ägare: Brygga och webb-UI (App/Webb/ios/).
 */
(function () {
  'use strict';
  const A = window.adraze;
  if (!A || !A.__ios || window.__adrazeIosKlar) return;
  window.__adrazeIosKlar = true;
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const yta = A.yta;
  const tx = (s, v) => (typeof window.t === 'function' ? window.t(s, v) : s);

  /* ── Gemensamt ── */
  const vp = $('adraze-ios-viewport');
  if (vp && document.head && vp.parentNode !== document.head) document.head.prepend(vp);

  // Språk: Swift sparar valet (sprak.val) innan sidan laddas om, så att den nya sidan får rätt ordlista direkt
  let byterSprak = false;
  if (window.i18n) {
    window.i18n.set = async function (kod) {
      byterSprak = true;
      try { await A.invoke('sprak:satt', { kod: String(kod || '') }); } catch {}
      location.reload();
    };
  }
  A.on('sprak:andrat', (d) => { if (!byterSprak && d && d.kod && window.i18n && d.kod !== window.i18n.lang) location.reload(); });
  /* Datorns ord på iPhone: "den här datorn" → "den här iPhonen", "Chromium (Electron)" → "WebKit". Datorns texter
     (och språkfilernas översättningar av dem) ändras inte; här byts orden i det som visas, på svenska och engelska.
     Andra språk behåller sin översättning, utom motorns namn. Först hela sidan, sedan det som läggs till eller
     ändras. Användarens egna texter (translate="no") och fält rörs inte. */
  (function iphoneOrd() {
    const pad = (A.sync('ios:miljo') || {}).liten === false;
    const enhet = pad ? ['iPad', 'iPaden', 'iPadens'] : ['iPhone', 'iPhonen', 'iPhonens'];
    const ORD = {
      sv: [
        ['Den används av datorn.', 'Den används av systemet.'],
        ['AdRaze kör Chromium, så de flesta tillägg fungerar. Enstaka som kräver Googles egna funktioner kanske inte gör det fullt ut.',
          'Tillägg finns inte i AdRaze för ' + enhet[0] + ' än.'],
        ['knappen, panelen och kortkommandot försvinner', 'knappen och panelen försvinner'],
        ['alla datorer', 'alla enheter'], ['alla dina datorer', 'alla dina enheter'],
        ['resten av datorn', 'resten av skärmen'],
        ['Den här datorn', 'Den här ' + enhet[1]], ['den här datorn', 'den här ' + enhet[1]],
        ['Din dator', 'Din ' + enhet[0]], ['din dator', 'din ' + enhet[0]],
        ['datorns', enhet[2]], ['datorn', enhet[1]], ['datorer', 'enheter'],
        // Datorns fönster: en iPhone har bara appen och dess flikar
        ['Syns direkt i alla fönster.', 'Syns direkt i hela appen.'],
        ['Gäller i alla fönster utom inkognito.', 'Gäller överallt utom i privata flikar.'],
      ],
      en: [
        ['the button, panel, and keyboard shortcut disappear', 'the button and panel disappear'],
        ["AdRaze runs Chromium, so most extensions work. A few that require Google's own features may not work fully.",
          'Extensions are not available in AdRaze for ' + enhet[0] + ' yet.'],
        ['all your computers', 'all your devices'], ['the rest of your computer', 'the rest of your screen'],
        ['This computer', 'This ' + enhet[0]], ['this computer', 'this ' + enhet[0]],
        ['Your computer', 'Your ' + enhet[0]], ['your computer', 'your ' + enhet[0]],
        ["the child's computer", "the child's " + enhet[0]], ['computers', 'devices'], ['computer', enhet[0]],
        ['Applies right away in all windows.', 'Applies right away across the app.'],
        ['Applies in all windows except incognito.', 'Applies everywhere except private tabs.'],
      ],
    };
    const lang = () => String((window.i18n && window.i18n.lang) || html.lang || 'sv').split('-')[0];
    const lista = () => [['Chromium (Electron)', 'WebKit'], ...(ORD[lang()] || [])];
    const RE = /dator|computer|Chromium|alla fönster|all windows/;
    const ATTR = ['placeholder', 'title', 'aria-label'];
    const byt = (t) => { let u = t; for (const [a, b] of lista()) if (u.indexOf(a) >= 0) u = u.split(a).join(b); return u; };
    const egen = (el) => !!(el && el.closest && el.closest('[translate="no"], input, textarea, [contenteditable="true"], script, style'));
    function text(n) {
      const v = n.nodeValue;
      if (!v || !RE.test(v) || egen(n.parentElement)) return;
      const u = byt(v);
      if (u !== v) n.nodeValue = u;
    }
    function attr(el) {
      if (egen(el)) return;
      for (const a of ATTR) { const v = el.getAttribute && el.getAttribute(a); if (v && RE.test(v)) { const u = byt(v); if (u !== v) el.setAttribute(a, u); } }
    }
    function trad(rot) {
      if (!rot) return;
      if (rot.nodeType === 3) { text(rot); return; }
      if (rot.nodeType !== 1) return;
      attr(rot);
      const w = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT, null);
      let n; while ((n = w.nextNode())) text(n);
      if (rot.querySelectorAll) rot.querySelectorAll('[placeholder], [title], [aria-label]').forEach(attr);
    }
    trad(document.body);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') text(m.target);
        else if (m.type === 'attributes') attr(m.target);
        else m.addedNodes.forEach(trad);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  })();

  // Sökmotorn kan ändras native (skalet): startsidans sökfält ska använda samma
  A.on('anpassa:andrad', (d) => {
    if (d && d.nyckel === 'sok.motor') { try { if (typeof ENGINES === 'object' && ENGINES[d.varde]) searchEngine = d.varde; } catch {} }
  });

  // Vätskefyllningen vid tryck (datorn fyller vid hovring, som inte finns på en pekskärm)
  const VATSKA = '.btn, .set-btn, .pill:not(.pill-accent), .btn-ghost, .btn-safe, .liq, .anp-liq, .notis button, .anp-toast-angra';
  const fyllda = new Set();
  const tom = (el) => { setTimeout(() => { el.classList.remove('ios-fyll'); fyllda.delete(el); }, 520); };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest(VATSKA);
    if (!b || b.disabled) return;
    b.classList.add('ios-fyll'); fyllda.add(b);
  }, { passive: true, capture: true });
  const slapp = () => { for (const b of fyllda) tom(b); };
  document.addEventListener('pointerup', slapp, { passive: true, capture: true });
  document.addEventListener('pointercancel', slapp, { passive: true, capture: true });

  // Klar: visa webbvyn när iOS-CSS:en är laddad och första rutan är ritad
  let klar = false;
  function signaleraKlar() {
    if (klar) return; klar = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      html.classList.add('ios-redo');
      A.invoke('sida:klar', { yta, ms: Math.round(performance.now()) }).catch(() => {});
    }));
  }
  function narCssKlar(fn) {
    const l = $('adraze-ios-css');
    if (!l || l.sheet) { fn(); return; }
    l.addEventListener('load', fn, { once: true });
    l.addEventListener('error', fn, { once: true });
    setTimeout(fn, 1500);
  }

  /* ── Anpassa och inställningarna ── */
  // Finns inte på iPhone (eller sköts av iOS: uppdateringar, standardwebbläsare, tillägg)
  const DOLDA_KATEGORIER = ['tillagg', 'uppdatering', 'start', 'historik', 'wallet'];
  // Visas först när en modul har registrerat kanalen som kategorin behöver
  const KRAVER = { konto: 'auth:session', vanner: 'auth:session', familj: 'family:me', nedladdningar: 'dl:list', losenord: 'pw:list', krypto: 'krypto:chat' };
  // Rader som bara gäller datorn, eller vars kanal ingen har än
  // (standardwebbläsaren väljs i iOS egna inställningar, inte av appen)
  // (eget konto i varje fönster: en iPhone har inga fönster)
  // (Falk: panelens bredd och Falk-knappen i verktygsraden finns bara på datorn; Falk öppnas från menyn)
  const DOLDA_RADER = ['tgl-bmbar', 'sel-dns', 'zoom-100', 'defbrowser-btn', 'kl-toggle', 'tgl-krypto'];
  // Kategorier som en native modul visar själv: raden finns kvar i listan och öppnar modulens egen vy
  // (kontots ark, chatten) i stället för datorns panel, som behöver datorns huvudprocess (auth:*, friends:*)
  const NATIVA = { konto: { kanal: 'konto:visa', arg: [] }, vanner: { kanal: 'chatt:visa', arg: [{}] } };
  const nativ = (k) => (NATIVA[k] && A.har(NATIVA[k].kanal)) ? NATIVA[k] : null;
  const RAD_KRAVER = { 'chat-rules-btn': 'auth:session', 'tgl-protection': 'skoll:check-url', 'tgl-adblock': 'skoll:adblock-toggle', 'adblock-more': 'blockinst:get', 'seg-freq': 'historik:lista', 'settings-bg-btn': null };

  function setUppAnpassa() {
    const s = $('settings'), nav = $('settings-nav'), main = s && s.querySelector('.set-main'), rail = s && s.querySelector('.set-rail');
    if (!s || !nav || !main || !rail) return;
    try { if (typeof openSettings === 'function') openSettings(); } catch (e) { console.error('[ios] openSettings', e); }
    s.classList.remove('opening');

    // Dolda kategorier flyttas ut ur listan (skalets kod hittar dem fortfarande), gruppetiketter utan flikar likaså
    const gom = document.createElement('div'); gom.id = 'ios-dolda'; gom.hidden = true; s.appendChild(gom);
    for (const b of [...nav.querySelectorAll('.set-tab')]) {
      const k = b.dataset.cat;
      const bort = DOLDA_KATEGORIER.includes(k) || (KRAVER[k] && !A.har(KRAVER[k]) && !nativ(k));
      if (bort) gom.appendChild(b);
    }
    // Grupper: etikett + kort med raderna (som grupperade listor i iOS)
    let grupp = null;
    for (const el of [...nav.children]) {
      if (el.classList.contains('set-glbl')) { grupp = document.createElement('div'); grupp.className = 'ios-grupp'; el.after(grupp); continue; }
      if (el.classList.contains('set-tab')) { if (!grupp) { grupp = document.createElement('div'); grupp.className = 'ios-grupp'; el.before(grupp); } grupp.appendChild(el); }
    }
    for (const g of [...nav.querySelectorAll('.ios-grupp')]) {
      if (!g.querySelector('.set-tab')) { const l = g.previousElementSibling; if (l && l.classList.contains('set-glbl')) gom.appendChild(l); g.remove(); }
    }
    // Pil till höger på varje rad
    for (const b of nav.querySelectorAll('.set-tab')) { const p = document.createElement('span'); p.className = 'ios-pil'; p.setAttribute('aria-hidden', 'true'); b.appendChild(p); }
    for (const id of DOLDA_RADER) { const el = $(id); const r = el && el.closest('.set-row'); if (r) r.classList.add('ios-dold'); }
    const falkBredd = document.querySelector('#falk-inst [data-falk="bredd"]'); if (falkBredd && falkBredd.closest('.set-row')) falkBredd.closest('.set-row').classList.add('ios-dold');
    // "Öppna Falk": datorns openKrypto öppnar sidopanelen; här visas Falk som ark ovanpå
    const oppnaFalk = $('open-krypto-btn');
    if (oppnaFalk) oppnaFalk.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); A.invoke('sida:visa', { yta: 'falk' }).catch(() => {}); }, true);
    for (const [id, kanal] of Object.entries(RAD_KRAVER)) {
      if (kanal === null) continue;
      const el = $(id); if (!el || A.har(kanal)) continue;
      if (id === 'seg-freq') { el.classList.add('ios-dold'); continue; }
      const r = el.closest('.set-row'); if (r) r.classList.add('ios-dold');
    }
    // Ett segmentreglage med ett enda val kvar säger ingenting: då göms hela raden
    for (const seg of main.querySelectorAll('.set-row > .seg')) {
      const kvar = [...seg.querySelectorAll('.seg-btn')].filter((b) => !b.classList.contains('ios-dold'));
      if (kvar.length < 2) seg.closest('.set-row').classList.add('ios-dold');
    }
    const hero = $('set-hero'); if (hero && !A.har('auth:session')) hero.classList.add('ios-dold');
    // Dolda rader flyttas ut ur korten, så att hörnen och avdelarna räknas på de rader som syns
    for (const r of main.querySelectorAll('.set-row.ios-dold')) gom.appendChild(r);
    // Om: appens version och motorn (datorn skriver "byggd på Chromium (Electron)"; iphoneOrd tar resten)
    const omRad = $('om-version') && $('om-version').parentElement;
    if (omRad) omRad.textContent = tx('Version {v}', { v: (A.sync('ios:miljo') || {}).version || '' }) + ' · WebKit';
    // Temagalleriet hämtar från servern via huvudprocessen; utan kanalen blir det bara ett felmeddelande
    const galleri = $('anp-galleri'); if (galleri && !A.har('galleri:lista')) galleri.classList.add('ios-dold');
    // Anpassa › Startsidan › "Anpassa startsidan": datorn byter till en ny flik. Här öppnas startsidan i
    // redigeringsläge ovanpå arket, och Klar tar dig tillbaka hit.
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('#anp-startsida .set-btn'), sek = $('anp-startsida');
      if (!b || !sek || b.closest('.set-row') !== sek.querySelector('.set-row')) return;
      e.stopImmediatePropagation(); e.preventDefault();
      A.invoke('sida:visa', { yta: 'startsida', lage: 'helskarm', fragment: 'redigera' }).catch(() => {});
    }, true);
    // Sökfältet under rubriken i listan, som i Inställningar på iPhone
    const sokfalt = s.querySelector('.set-search'), brand = rail.querySelector('.set-brand');
    if (sokfalt && brand) brand.after(sokfalt);

    // Huvudet i detaljvyn: tillbaka till listan + kategorins namn (syns när rubriken scrollats bort)
    const huvud = document.createElement('div'); huvud.className = 'ios-huvud';
    huvud.innerHTML = '<button type="button" class="ios-tillbaka" aria-label="Tillbaka"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span></span></button><div class="ios-huvud-titel"></div>';
    huvud.querySelector('.ios-tillbaka span').textContent = tx('Inställningar');
    main.prepend(huvud);
    const titel = huvud.querySelector('.ios-huvud-titel');
    main.addEventListener('scroll', () => {
      const h = main.querySelector('.set-panel:not(.hidden) .set-h');
      const forbi = h ? h.getBoundingClientRect().bottom < huvud.getBoundingClientRect().bottom + 4 : main.scrollTop > 40;
      huvud.classList.toggle('ios-skuggad', main.scrollTop > 2);
      huvud.classList.toggle('ios-titel-syns', forbi);
    }, { passive: true });

    const katFinns = (k) => { try { return nav.querySelector('.set-tab[data-cat="' + CSS.escape(String(k)) + '"]'); } catch { return null; } };
    // Lista ↔ detalj. Historiken gör att kantsvepet bakåt (och goBack i Swift) tar dig till listan.
    function visaKat(kat, push) {
      try { showSettingsCat(kat); } catch (e) { console.error('[ios] showSettingsCat', e); }
      const b = katFinns(kat);
      titel.textContent = b ? b.textContent.trim() : '';
      main.scrollTop = 0;
      huvud.classList.remove('ios-skuggad', 'ios-titel-syns');
      html.classList.add('ios-detalj');
      if (push) history.pushState({ kat }, '', '#' + kat);
    }
    function visaLista() { html.classList.remove('ios-detalj'); }
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('.set-tab'); if (!b) return;
      e.stopImmediatePropagation();
      const n = nativ(b.dataset.cat);
      if (n) { e.preventDefault(); A.invoke(n.kanal, ...n.arg).catch(() => {}); return; }
      visaKat(b.dataset.cat, true);
    }, true);
    huvud.querySelector('.ios-tillbaka').addEventListener('click', () => { if (history.state && history.state.kat) history.back(); else visaLista(); });
    window.addEventListener('popstate', (e) => { const k = e.state && e.state.kat; if (k) visaKat(k, false); else visaLista(); });
    // Swift: en annan modul visar Anpassa på en viss kategori medan arket redan är öppet
    A.on('sida:kategori', (d) => { const k = d && d.kat; if (k && katFinns(k)) visaKat(k, true); });
    // Sök: skalets sökning väljer kategorier; etiketter utan träffar döljs
    const sok = $('set-search');
    if (sok) sok.addEventListener('input', () => {
      for (const g of nav.querySelectorAll('.ios-grupp')) {
        const syns = [...g.querySelectorAll('.set-tab')].some((b) => !b.classList.contains('sok-dold'));
        g.classList.toggle('sok-dold', !syns);
        const l = g.previousElementSibling; if (l && l.classList.contains('set-glbl')) l.classList.toggle('sok-dold', !syns);
      }
      if (html.classList.contains('ios-detalj') && sok.value) visaLista();
    });
    // Krysset: stäng arket (skalets closeSettings gäller datorns flikar)
    const kryss = $('settings-close');
    if (kryss) kryss.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); A.invoke('sida:stang', {}).catch(() => {}); }, true);
    // Ingen tangentbordsgenväg att visa på en telefon (Ångra-listan ritas om, så tipset göms med en observatör)
    const utanTangenter = () => {
      document.querySelectorAll('#settings kbd, #settings .set-kbd').forEach((k) => k.classList.add('ios-dold'));
      document.querySelectorAll('#anp-angra .anp-hist-topp .set-desc').forEach((d) => { if (/Ctrl|⌘/.test(d.textContent)) d.classList.add('ios-dold'); });
    };
    utanTangenter();
    const angra = $('anp-angra'); if (angra) new MutationObserver(utanTangenter).observe(angra, { childList: true, subtree: true });

    // Språklistan: "Följ systemet" överst
    if (typeof window.renderLangs === 'function') {
      const orig = window.renderLangs;
      window.renderLangs = function () {
        orig.apply(this, arguments);
        const list = $('lang-list'); if (!list) return;
        const m = (A.sync('ios:miljo') || {}).sprakval || '';
        const el = document.createElement('div');
        el.className = 'engine-opt ios-sprak-system' + (m === '' ? ' on' : '');
        el.innerHTML = '<span class="engine-radio"></span><span></span>';
        el.lastChild.textContent = tx('Samma som telefonen');
        if (m === '') list.querySelectorAll('.engine-opt.on').forEach((x) => { if (x !== el) x.classList.remove('on'); });
        el.addEventListener('click', async () => { byterSprak = true; try { await A.invoke('sprak:satt', { kod: '' }); } catch {} location.reload(); });
        list.prepend(el);
      };
      try { window.renderLangs(); } catch {}
    }

    // Startläge: #kategori öppnar den direkt, med listan bakom (tillbaka = listan)
    const start = decodeURIComponent((location.hash || '').slice(1));
    history.replaceState({}, '', location.pathname);
    if (start && katFinns(start)) visaKat(start, true);
    else visaLista();
  }

  /* ── Startsidan ── */
  function setUppStartsida() {
    const nt = $('newtabpage');
    if (!nt) return;
    // Efter en sökning eller ett klick på en genväg navigerar Swift den riktiga fliken. Sidan här blir tom igen,
    // så att den är redo nästa gång en ny flik öppnas.
    window.addEventListener('adraze:navigerade', () => {
      setTimeout(() => {
        try { if (typeof active !== 'undefined' && active) { active.url = null; showActiveTab(); } } catch {}
        const s = $('nt-search'); if (s) { s.value = ''; s.blur(); }
        try { const lista = $('omni-suggest'); if (lista) lista.innerHTML = ''; } catch {}
      }, 450);
    });
    // Bara vanliga flikar har en sida att visa; startsidan själv är alltid "tom"
    try { if (typeof active !== 'undefined' && active && active.url) { active.url = null; showActiveTab(); } } catch {}

    // Redigeringsläget direkt (#redigera eller händelsen sida:kategori från Anpassa). Klar stänger då startsidan,
    // så att man kommer tillbaka till inställningarna man kom ifrån.
    // Redigeringen kan bara börja när nya fliken syns (skalet visar den först när flikarna är upplagda).
    let franInstallningar = false, harRedigerat = false;
    const redigera = () => {
      franInstallningar = true;
      const forsok = () => {
        const S = window.AnpassaStartsida;
        if (!S || nt.classList.contains('hidden')) return false;
        try { if (!S.redigerar()) S.redigera(); } catch (e) { console.error('[ios] redigera', e); }
        return S.redigerar();
      };
      if (forsok()) return;
      const mo = new MutationObserver(() => { if (forsok()) { mo.disconnect(); clearInterval(t); } });
      mo.observe(nt, { attributes: true, attributeFilter: ['class'] });
      let varv = 0;
      const t = setInterval(() => { if (forsok() || ++varv > 60) { clearInterval(t); mo.disconnect(); } }, 250);
    };
    new MutationObserver(() => {
      const nu = nt.classList.contains('anp-redigerar');
      if (nu) harRedigerat = true;
      else if (harRedigerat && franInstallningar) { harRedigerat = franInstallningar = false; A.invoke('sida:stang', { yta: 'startsida' }).catch(() => {}); }
    }).observe(nt, { attributes: true, attributeFilter: ['class'] });
    A.on('sida:kategori', (d) => { if (d && d.kat === 'redigera') redigera(); });

    // Statistiken skriver alltid plural ("1 sekunder"): ental när talet är 1 (svenska och engelska)
    const ENTAL = { sekunder: 'sekund', minuter: 'minut', timmar: 'timme', seconds: 'second', minutes: 'minute', hours: 'hour' };
    const tal = $('stat-time'), enhetEl = $('stat-time-u');
    if (tal && enhetEl) {
      let plural = enhetEl.textContent;
      const ratta = () => {
        const u = enhetEl.textContent.trim();
        if (ENTAL[u]) plural = u;
        const ett = /^1([.,]0)?$/.test(tal.textContent.trim());
        const ska = ett && ENTAL[plural] ? ENTAL[plural] : plural;
        if (u !== ska) enhetEl.textContent = ska;
      };
      ratta();
      const mo = new MutationObserver(ratta);
      mo.observe(tal, { childList: true, characterData: true, subtree: true });
      mo.observe(enhetEl, { childList: true, characterData: true, subtree: true });
    }
    if (decodeURIComponent((location.hash || '').slice(1)) === 'redigera') {
      history.replaceState(null, '', location.pathname);
      redigera();
    }
  }

  function start() {
    if (yta === 'anpassa') setUppAnpassa();
    else if (yta === 'startsida') setUppStartsida();
    narCssKlar(signaleraKlar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
