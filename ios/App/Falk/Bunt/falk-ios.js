/* falk-ios.js – Falk-panelen (datorns krypto.html) som iPhone-sida. Läggs in av Brygga (app.brygga.skript i Falk.swift)
 * vid dokumentslut, efter datorns skript och före ios.js. Datorns fil ändras inte: här flyttas några element,
 * några av datorns funktioner byts ut (de är globala i sidan) och det som bara finns i appen läggs till:
 *
 *   - huvudet med Falk i mitten, nytt samtal och stäng; raden med modellen och sidan ovanför skrivfältet
 *   - svaret strömmar in medan Falk skriver (falk:strom från Swift), ord för ord med datorns fram-tonade ord
 *   - välkomsten med förslag om sidan i den aktiva fliken, samtycket med iPhone-text (Qwen och DeepSeek)
 *   - utloggat och avstängt läge (falk:ios, falk:lage), notiser (falk:toast), tangentbordet (visualViewport)
 *
 * Ägare: Falk (App/Falk/Bunt/).
 */
(function () {
  'use strict';
  const A = window.adraze;
  if (!A || !A.__ios || A.yta !== 'falk' || window.__falkIos) return;
  if (typeof log === 'undefined' || typeof inp === 'undefined' || !window.krypto) return;
  const stat = { klar: false, version: 1 };
  window.__falkIos = stat;
  // Ett fel här ska synas i självtestet (stat.fel), inte bara lämna en halvfärdig panel
  try {
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const K = window.krypto;
  const IOS = A.sync('falk:ios') || {};
  const HAR = IOS.har || {};

  /* ── Texterna: Falks egna ord (Bunt/sprak) först, sedan datorns ordlista ── */
  const ORD = IOS.ordlista && typeof IOS.ordlista === 'object' ? IOS.ordlista : {};
  const egen = (s) => Object.prototype.hasOwnProperty.call(ORD, s) && !!ORD[s];
  const fyll = (s, v) => (v ? String(s).replace(/\{([a-z]\w*)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m)) : String(s));
  const orgT = window.t;
  if (typeof orgT === 'function') {
    window.t = function (s, v) { return egen(s) ? fyll(ORD[s], v) : orgT.apply(this, arguments); };
  }
  const ft = (s, v) => (egen(s) ? fyll(ORD[s], v) : (typeof window.t === 'function' ? window.t(s, v) : fyll(s, v)));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const telefon = () => html.classList.contains('ios-telefon');
  const MORK = matchMedia('(prefers-color-scheme: dark)');
  const LUGN = matchMedia('(prefers-reduced-motion: reduce)');

  // Stilen sist i <head>, efter datorns
  const stil = $('falk-ios-css');
  if (stil && document.head) document.head.appendChild(stil);

  const svg = (d, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const IK = {
    sida: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    lank: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
    mejl: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>'),
    prat: svg('<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z"/>'),
    skold: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
    klocka: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    gnista: svg('<path d="M12 3c.4 4 2.1 6.1 8 8-5.9 1.9-7.6 4-8 8-.4-4-2.1-6.1-8-8 5.9-1.9 7.6-4 8-8Z"/>'),
    kugge: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    kryss: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.2),
    skriv: svg('<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8l-3.6.9.9-3.6Z"/>'),
  };

  /* ── Skrivfältet: ny rad med returtangenten på telefonen (skicka med knappen), stavning och bara textfiler ── */
  inp.spellcheck = true;
  inp.setAttribute('autocapitalize', 'sentences');
  inp.setAttribute('autocorrect', 'on');
  document.addEventListener('keydown', (e) => {
    if (e.target !== inp || e.key !== 'Enter' || e.shiftKey || e.isComposing || !telefon()) return;
    try { if (cmdVisible()) return; } catch {}
    e.stopImmediatePropagation();   // datorns Enter skickar; här blir det en ny rad
  }, true);
  const TEXTFILER = '.txt,.md,.markdown,.csv,.tsv,.json,.log,.xml,.html,.htm,.css,.js,.mjs,.ts,.tsx,.jsx,.py,.swift,.java,.kt,.c,.h,.cpp,.hpp,.cs,.go,.rs,.rb,.php,.sql,.yml,.yaml,.toml,.ini,.cfg,.conf,.sh,.eml,.srt,.vtt,text/*';
  for (const id of ['f-files', 'pf-files']) { const f = $(id); if (f) f.setAttribute('accept', TEXTFILER); }
  // Tangentbordet öppnas bara när du själv trycker (inte när ett svar är klart eller panelen öppnas)
  const fokus = HTMLTextAreaElement.prototype.focus;
  inp.focus = function (o) { const ua = navigator.userActivation; if (ua && !ua.isActive) return; return fokus.call(this, o); };
  sendBtn.addEventListener('click', () => { if (telefon()) setTimeout(() => inp.blur(), 0); });
  function tomKnapp() { sendBtn.classList.toggle('fi-tom', !inp.value.trim() && !(typeof pending !== 'undefined' && pending.length)); }
  inp.addEventListener('input', tomKnapp);
  const _autosize = window.autosize;
  window.autosize = function () { const r = _autosize.apply(this, arguments); tomKnapp(); return r; };
  const _renderPending = window.renderPending;
  window.renderPending = function () { const r = _renderPending.apply(this, arguments); tomKnapp(); return r; };

  /* ── Huvudet: meny | Falk | nytt samtal, stäng ── */
  const huvud = document.querySelector('#main > header');
  const tEl = huvud && huvud.querySelector('.t');
  if (huvud && tEl) {
    const titel = document.createElement('div');
    titel.id = 'fi-titel';
    const dot = $('hdr-dot');
    if (dot) titel.appendChild(dot);
    titel.appendChild(tEl);
    huvud.appendChild(titel);
    const ny = $('newchat');
    if (ny) ny.innerHTML = IK.skriv;
    const st = document.createElement('button');
    st.type = 'button'; st.className = 'hbtn'; st.id = 'fi-stang';
    st.setAttribute('aria-label', ft('Stäng'));
    st.innerHTML = IK.kryss;
    st.addEventListener('click', () => { A.invoke('sida:stang').catch(() => {}); });
    huvud.appendChild(st);
  }
  log.addEventListener('scroll', () => document.body.classList.toggle('fi-rullad', log.scrollTop > 4), { passive: true });

  /* ── Ovanför skrivfältet: modellen och sidan Falk läser, på en rad ── */
  const fot = document.querySelector('#main > footer');
  const chiprad = document.createElement('div');
  chiprad.id = 'fi-chiprad';
  for (const id of ['fkmodell', 'pagechip']) { const el = $(id); if (el) chiprad.appendChild(el); }
  const fore = $('attnote') || (fot && fot.querySelector('.inwrap-hold'));
  if (fot && fore) fot.insertBefore(chiprad, fore);

  /* ── Notisen ── */
  const toastEl = document.createElement('div');
  toastEl.id = 'fi-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('translate', 'no');
  document.body.appendChild(toastEl);
  let toastTid = 0;
  function toast(text) {
    if (!text) return;
    const r = fot && !document.body.classList.contains('fi-last') && !document.querySelector('.panel.on') ? fot.getBoundingClientRect() : null;
    toastEl.style.bottom = r ? Math.max(16, Math.round(window.innerHeight - r.top + 12)) + 'px' : '';
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTid);
    toastTid = setTimeout(() => toastEl.classList.remove('on'), 3400);
  }
  A.on('falk:toast', (d) => toast(d && d.text));

  /* ── Sidomenyn: Inställningar för Falk längst ner ── */
  const side = $('side');
  if (side) {
    const sf = document.createElement('div');
    sf.id = 'fi-sidfot';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 's-item';
    b.innerHTML = IK.kugge + '<span></span>';
    b.querySelector('span').textContent = ft('Inställningar för Falk');
    b.addEventListener('click', () => { try { closeSide(); } catch {} A.invoke('falk:installningar').catch(() => {}); });
    sf.appendChild(b);
    side.appendChild(sf);
  }

  /* ── Färgen: länkar och markerad text i en mörkare ton på ljus botten ── */
  function ljusAccent() {
    if (MORK.matches) return;
    const m = /^#([0-9a-f]{6})$/i.exec((typeof FALK_INST === 'object' && FALK_INST.accent) || '');
    const hex = m ? m[1].toLowerCase() : 'ff4b1f';
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    html.style.setProperty('--accent-ink', hex === 'ff4b1f' ? '#c2360e' : 'rgb(' + rgb.map((c) => Math.round(c * 0.74)).join(' ') + ')');
  }
  const _falkUtseende = window.falkUtseende;
  if (typeof _falkUtseende === 'function') {
    window.falkUtseende = function () { const r = _falkUtseende.apply(this, arguments); ljusAccent(); return r; };
    MORK.addEventListener('change', () => { try { _falkUtseende(); } catch {} ljusAccent(); });
  }
  ljusAccent();

  /* ── Välkomsten: hälsningen och förslagen, med sidan i fliken när det finns en ── */
  function sidanNu() {
    const p = pageTab;
    if (!p || !p.url || (p.av && !p.utanSamtycke) || (sidaBortUrl && p.url === sidaBortUrl)) return null;
    let host = '';
    try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch {}
    return { titel: p.titel || host || p.url, host: host || p.url };
  }
  let heroNyckel = null, heroUtanIn = false;
  window.welcome = function () {
    const el = document.createElement('div');
    el.className = 'hero';
    el.setAttribute('translate', 'no');
    if (heroUtanIn) { el.style.animation = 'none'; heroUtanIn = false; }
    const hej = FALK_INST.halsning === false ? '' : (myName ? tx('Hej, {n}.', { n: myName }) : tx('Hej!'));
    const s = sidanNu();
    heroNyckel = s ? s.titel + '|' + s.host : '';
    const rader = [];
    if (s) {
      rader.push({ ik: IK.sida, t: ft('Sammanfatta sidan'), u: s.titel, skicka: ft('Sammanfatta sidan jag har öppen.') });
      rader.push({ ik: IK.skold, t: ft('Är den här sidan säker?'), u: s.host, skicka: ft('Är sidan jag har öppen säker?') });
    }
    rader.push({ ik: IK.lank, t: ft('Granska en länk'), u: ft('Klistra in länken så kollar Falk den'), fyll: tx('Är den här länken en bluff?') });
    rader.push({ ik: IK.mejl, t: ft('Kolla ett mejl eller sms'), u: ft('Äkta, eller ett försök att lura dig?'), fyll: tx('Kolla om det här mejlet är äkta') });
    if (!s) rader.push({ ik: IK.prat, t: tx('Vad kan du hjälpa mig med?'), u: ft('Allt Falk kan göra åt dig'), skicka: tx('Vad kan du hjälpa mig med?') });
    el.innerHTML = '<span class="big">' + OWL_BIG + '</span><h1' + (hej ? '' : ' class="utan"') + '>' + esc(hej) + '<em>' + esc(tx('Vad kan jag hjälpa dig med?')) + '</em></h1>'
      + '<p>' + esc(tx('Klistra in en misstänkt länk, ett mejl eller ett sms så säger jag om det är en bluff.')) + '</p>'
      + '<div class="fi-grupp">' + rader.map((r, i) => '<button type="button" class="fi-rad" data-i="' + i + '"><span class="fi-ik">' + r.ik + '</span><span class="fi-tx"><b>'
        + esc(r.t) + '</b>' + (r.u ? '<small>' + esc(r.u) + '</small>' : '') + '</span><span class="fi-pil"></span></button>').join('') + '</div>';
    el.querySelectorAll('.fi-rad').forEach((b) => b.addEventListener('click', () => {
      const r = rader[+b.dataset.i];
      if (!r || busy) return;
      if (r.skicka) { inp.value = r.skicka; autosize(); send(); return; }
      inp.value = r.fyll + (/[?.!]$/.test(r.fyll) ? '\n' : ':\n');
      autosize(); inp.focus(); inp.dispatchEvent(new Event('input'));
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch {}
    }));
    log.appendChild(el);
    log.scrollTop = 0;
  };
  // Bara välkomsten i loggen: den visas från toppen, inte rullad till botten (då hamnar falken under huvudet)
  const _scrollBottom = window.scrollBottom;
  window.scrollBottom = function () {
    if (!history.length && log.children.length === 1 && log.firstElementChild.classList.contains('hero')) { log.scrollTop = 0; return; }
    return _scrollBottom.apply(this, arguments);
  };
  // Byter du flik medan välkomsten visas byts förslagen om sidan
  const _renderPageChip = window.renderPageChip;
  window.renderPageChip = function () {
    const r = _renderPageChip.apply(this, arguments);
    const s = sidanNu(), k = s ? s.titel + '|' + s.host : '';
    if (heroNyckel !== null && k !== heroNyckel && !history.length && !busy && log.querySelector('.hero')) { heroUtanIn = true; render(); }
    return r;
  };

  /* ── Samtycket: iPhone-texten (rätt AI-tjänster, privata flikar) och vätskefyllning på Godkänn ── */
  const _askMedSamtycke = window.askMedSamtycke;
  window.askMedSamtycke = async function () {
    const r = await _askMedSamtycke.apply(this, arguments);
    const el = [...log.querySelectorAll('.samtycke')].pop();
    if (el && !el.dataset.fi) {
      el.dataset.fi = '1';
      const p1 = el.querySelector('.p1'), p2 = el.querySelector('.p2'), ja = el.querySelector('.ja');
      if (p1) p1.textContent = ft('Falk är en AI. Det du skriver, filer du bifogar och det Falk har sparat om dig (minnen och projekt) skickas till AdRazes server och vidare via OpenRouter till AI-tjänsten Qwen, eller DeepSeek om du har Falk Pro, för att ta fram ett svar. Vi sparar inte samtalen på servern.');
      if (p2) p2.textContent = ft('Är Granska sidan på skickas också adressen och texten på sidan du har öppen, och det som står ifyllt i fält (aldrig lösenord eller kortuppgifter). Privata flikar läses aldrig.');
      if (ja) ja.classList.add('liq');
      requestAnimationFrame(() => {
        const topp = el.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop;
        if (el.offsetHeight > log.clientHeight - 24) log.scrollTop = Math.max(0, topp - 12);
        else log.scrollTop = log.scrollHeight;
      });
    }
    return r;
  };
  // Efter ja: Falk ser sidan direkt (inte först vid nästa koll av fliken)
  const _samtycke = K.samtycke;
  K.samtycke = async function (v) {
    const r = await _samtycke.call(K, v);
    if (v === true) { try { await pollTab(); } catch {} }
    return r;
  };
  new MutationObserver(() => {
    log.querySelectorAll('.samtycke .ja:not(.liq), .fk-ok .ja:not(.liq)').forEach((b) => b.classList.add('liq'));
  }).observe(log, { childList: true });

  /* ── Kvoten slut: ett lugnt besked, inget köp i appen ── */
  window.proKort = function (orsak, k) {
    const el = document.createElement('div');
    el.className = 'msg krypto';
    const datum = k && k.fyllsPa ? KVOT_DATUM(k.fyllsPa) : '';
    const rub = orsak === 'modell' ? tx('DeepSeek ingår i Falk Pro') : orsak === 'sok' ? tx('Webbsökningarna är slut för den här gången') : tx('Gratiskvoten är slut för den här gången');
    const text = orsak === 'modell' ? ft('Utan Pro svarar Falk med Qwen 3.7 Flash.')
      : orsak === 'sok' ? (datum ? ft('Falk svarar som vanligt, men utan att söka på webben. Sökningarna fylls på {datum}.', { datum }) : ft('Falk svarar som vanligt, men utan att söka på webben tills sökningarna fylls på.'))
      : (datum ? ft('Kvoten fylls på {datum}. Dina samtal ligger kvar tills dess.', { datum }) : ft('Kvoten fylls på igen om några dagar. Dina samtal ligger kvar tills dess.'));
    el.innerHTML = '<div class="fk-pro" translate="no"><span class="fi-pro-ik">' + (orsak === 'modell' ? IK.gnista : IK.klocka) + '</span><b></b><p></p></div>';
    el.querySelector('b').textContent = rub;
    el.querySelector('p').textContent = text;
    log.appendChild(el);
    scrollBottom();
  };

  /* ── Dina frågor: ett tryck på frågan visar dess knappar (försök igen, redigera, kopiera), ett till döljer dem ── */
  log.addEventListener('click', (e) => {
    const m = e.target.closest && e.target.closest('.msg.user');
    if (!m || e.target.closest('.acts') || !telefon()) return;
    if (String((window.getSelection && window.getSelection()) || '')) return;   // markerar du text ska knapparna inte hoppa fram
    const pa = !m.classList.contains('fi-acts');
    log.querySelectorAll('.msg.user.fi-acts').forEach((x) => x.classList.remove('fi-acts'));
    if (pa) m.classList.add('fi-acts');
  });

  /* ── Modellknappen: bara modellens namn på telefonen (hela namnet står i menyn) ── */
  function kortModell() {
    const n = document.querySelector('#fkmodell-knapp .namn');
    if (n && telefon() && /\s/.test(n.textContent.trim())) n.textContent = n.textContent.trim().split(/\s+/)[0];
  }
  const _visaModell = window.visaModell;
  if (typeof _visaModell === 'function') {
    window.visaModell = function () { const r = _visaModell.apply(this, arguments); kortModell(); return r; };
  }
  kortModell();

  /* ── Det Falk kan göra på iPhone ── */
  const _buildPriming = window.buildPriming;
  window.buildPriming = function () {
    const p = _buildPriming.apply(this, arguments);
    const kan = ['sökmotorn (användaren godkänner bytet i en ruta)', 'privat flik ([[gör:inkognito]])', 'Falks inställningar'];
    if (HAR.losenord) kan.push('lösenord'); if (HAR.nedladdningar) kan.push('nedladdningar');
    const inte = ['annonsblockeraren', 'realtidsskyddet', 'minska rörelse', 'familjeskyddet (blockera eller tillåta sidor för barn)', 'Wallet'];
    if (!HAR.losenord) inte.push('lösenord'); if (!HAR.nedladdningar) inte.push('nedladdningar');
    // i18n-hoppa-start: instruktioner till AI-modellen, inte UI-text
    if (p && p[0]) p[0].content += '\n\nPÅ IPHONE: Användaren har AdRaze på iPhone. Där finns flikar men inga fönster, så inkognito heter privat flik. '
      + 'Från Falk går det att ändra ' + kan.join(', ') + ' och utseendet i Anpassa. Det går INTE att styra ' + inte.join(', ') + ' från Falk på iPhone än: '
      + 'lägg ingen sådan tagg, säg kort att det inte går härifrån och att användaren hittar det i AdRaze-appens inställningar. '
      + 'Kortkommandon, tillägg, sidopanelen och fönster finns inte på iPhone.';
    // i18n-hoppa-slut
    return p;
  };
  const EJ_HAR = { adblock: 'Annonsblockeraren', annonsblockerare: 'Annonsblockeraren', realtidsskydd: 'Realtidsskyddet', skydd: 'Realtidsskyddet',
    minska_rorelse: 'Minska rörelse', blockera: 'Familjeskyddet', tillat: 'Familjeskyddet', avblockera: 'Familjeskyddet', unblock: 'Familjeskyddet', wallet: 'Wallet' };
  const _actionStep = window.actionStep;
  window.actionStep = function (a) {
    const n = (a && a.name) || '';
    if (n === 'inkognito' || n === 'incognito') return [OPEN, ft('Öppnade en privat flik'), ''];
    if (n === 'losenord' && !HAR.losenord) return [OPEN, ft('Lösenord'), ft('finns inte i appen än'), 'fi-ej'];
    if (n === 'nedladdningar' && !HAR.nedladdningar) return [OPEN, ft('Nedladdningar'), ft('finns inte i appen än'), 'fi-ej'];
    if (EJ_HAR[n]) return [SHIELD, ft(EJ_HAR[n]), ft('går inte att ändra från Falk på iPhone än'), 'fi-ej'];
    return _actionStep.apply(this, arguments);
  };
  // Bara sökmotorn frågar först på iPhone (resten av det som sänker skyddet görs inte alls härifrån)
  window.sankerSkydd = function (a) { return !!a && (a.name === 'sokmotor' || a.name === 'sok'); };

  /* ── Strömmande svar: texten kommer bit för bit medan Falk skriver ── */
  const S = { text: '', el: null, aktiv: false, fodd: [], slut: 0, strommat: false, raf: 0 };
  function nollstallStrom() {
    if (S.raf) cancelAnimationFrame(S.raf);
    S.text = ''; S.el = null; S.fodd = []; S.raf = 0; S.strommat = false;
  }
  const _chat = K.chat;
  K.chat = async function () {
    nollstallStrom();
    S.aktiv = true;
    let res;
    try { res = await _chat.apply(K, arguments); } finally { S.aktiv = false; S.slut = performance.now(); }
    S.strommat = !!(S.el && S.text);
    if (res && res.needLogin) visaLage('utloggad');
    return res;
  };
  A.on('falk:strom', (d) => {
    if (!S.aktiv || !d || typeof d.d !== 'string') return;
    S.text += d.d;
    if (!S.raf) S.raf = requestAnimationFrame(rita);
  });
  // Taggarna ([[minne+ …]], [[gör:…]]) visas aldrig, inte heller halvfärdiga
  const rensa = (t) => String(t).replace(/\[\[[\s\S]*?\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/\[$/, '').replace(/\n{3,}/g, '\n\n');
  // Halvfärdig fetstil syns inte som stjärnor medan svaret strömmar ("1. **Det" blev "**Det" tills ordet var klart).
  // Datorns md() tar ** bara inom en rad, så det gäller sista raden: ett öppet ** stängs, stjärnor som inget ord följt
  // än ("1. **") och ett halvt slut-** ("**Det.*") visas inte. Kod lämnas som den är. Bara visningen: S.text är orörd.
  function halvfardig(t) {
    if ((t.match(/^\s*```/gm) || []).length % 2) return t;
    const n = t.lastIndexOf('\n') + 1;
    let rad = t.slice(n);
    if (rad.includes('`')) return t;
    const par = (s) => (s.match(/\*\*/g) || []).length;
    const m = rad.match(/\*+$/);
    if (m) {
      const fore = rad.slice(0, m.index);
      if (!fore || /\s$/.test(fore) || (m[0].length === 1 && par(fore) % 2)) rad = fore;
    }
    if (par(rad) % 2) rad += '**';
    return t.slice(0, n) + rad;
  }
  function rita() {
    S.raf = 0;
    const typing = [...log.querySelectorAll('.msg.typing')].pop();
    if (!typing || !S.aktiv) return;
    const ren = halvfardig(rensa(S.text).trim());
    if (!ren.trim()) return;
    if (S.el !== typing) {
      S.el = typing; S.fodd = [];
      typing.classList.add('fi-strom');
      const sp = document.createElement('span');
      sp.className = 'writing-owl';
      sp.innerHTML = SPARK_SVG('writing-spark');
      typing.appendChild(sp);
      setStatus(ft('Skriver') + '…');
    }
    const b = typing.querySelector('.bubble');
    if (!b) return;
    b.innerHTML = md(ren);
    ordIn(b);
    if (follow) log.scrollTop = log.scrollHeight + 9999;
  }
  // Varje ord får sin födelsetid första gången det syns, så att en ny ritning fortsätter animationen där den var
  function ordIn(b) {
    if (LUGN.matches) return;
    const nu = performance.now();
    let i = 0, nya = 0;
    const vandra = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 3) {
          if (!c.textContent.trim()) continue;
          const f = document.createDocumentFragment();
          for (const del of c.textContent.split(/(\s+)/)) {
            if (!del) continue;
            if (/^\s+$/.test(del)) { f.appendChild(document.createTextNode(del)); continue; }
            if (S.fodd[i] === undefined) { S.fodd[i] = nu + Math.min(260, nya * 22); nya++; }
            const alder = nu - S.fodd[i++];
            if (alder >= 380) { f.appendChild(document.createTextNode(del)); continue; }
            const sp = document.createElement('span');
            sp.className = 'fi-w';
            sp.textContent = del;
            sp.style.animationDelay = Math.round(-alder) + 'ms';
            f.appendChild(sp);
          }
          c.replaceWith(f);
        } else if (c.nodeType === 1 && !c.matches('.cb, .tbl, .chart')) vandra(c);
      }
    };
    vandra(b);
  }
  // Svaret som redan strömmat in skrivs inte fram en gång till
  const _writeOut = window.writeOut;
  window.writeOut = function (el) {
    const direkt = S.strommat && performance.now() - S.slut < 160;
    S.strommat = false;
    if (direkt && el) { el.classList.add('fi-fran-strom'); return Promise.resolve(); }
    return _writeOut.apply(this, arguments);
  };

  /* ── Nytt samtal-knappen syns när det finns ett samtal ── */
  function samtalKlass() {
    let c = null;
    try { c = activeConvo(); } catch {}
    document.body.classList.toggle('fi-samtal', !!(c && c.messages && c.messages.length));
  }
  const _updateConvTitle = window.updateConvTitle;
  window.updateConvTitle = function () { const r = _updateConvTitle.apply(this, arguments); samtalKlass(); return r; };
  const _render = window.render;
  window.render = function () { const r = _render.apply(this, arguments); samtalKlass(); return r; };

  /* ── Utloggad och avstängd ── */
  const las = document.createElement('div');
  las.id = 'fi-las'; las.className = 'fi-las'; las.setAttribute('translate', 'no'); las.setAttribute('role', 'dialog'); las.setAttribute('aria-modal', 'true');
  document.body.appendChild(las);
  let lage = IOS.lage || 'ok';
  function knapp(text, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }
  const stang = () => { A.invoke('sida:stang').catch(() => {}); };
  function ritaLas() {
    const ut = lage === 'utloggad';
    const last = !!IOS.last;
    const rader = ut ? [
      [IK.lank, ft('Granska länkar, mejl och sms'), ft('Klistra in det misstänkta så säger Falk om det är en bluff.')],
      [IK.sida, ft('Fråga om sidan du har öppen'), ft('Sammanfatta, förklara eller kolla om den är säker.')],
      [IK.gnista, ft('Ändra AdRaze med ord'), ft('Be om mörkt läge eller en annan sökmotor, så fixar Falk det.')],
    ] : [];
    las.innerHTML = '<button type="button" class="fi-las-stang">' + IK.kryss + '</button><div class="fi-las-inne"><div class="fi-las-topp">'
      + '<img class="fi-las-falk" src="krypto-owl.png" alt=""><h1></h1><p class="fi-lead"></p></div>'
      + (rader.length ? '<div class="fi-grupp">' + rader.map((r) => '<div class="fi-rad"><span class="fi-ik">' + r[0] + '</span><span class="fi-tx"><b>' + esc(r[1]) + '</b><small>' + esc(r[2]) + '</small></span></div>').join('') + '</div>' : '')
      + '<div class="fi-las-knappar"></div>' + (ut ? '<div class="fi-las-not"></div>' : '') + '</div>';
    const x = las.querySelector('.fi-las-stang');
    x.setAttribute('aria-label', ft('Stäng'));
    x.addEventListener('click', stang);
    las.querySelector('h1').textContent = ut ? ft('Logga in för att använda Falk') : ft('Falk är avstängd');
    las.querySelector('.fi-lead').textContent = ut ? ft('Falk är AdRazes AI-assistent. Logga in med ditt AdRaze-konto, så granskar Falk länkar, mejl och sidor åt dig.')
      : (last ? ft('Falk går inte att slå på i barnläge.') : ft('Slå på Falk i Inställningar för att fråga och granska igen. Samtalen ligger kvar.'));
    const k = las.querySelector('.fi-las-knappar');
    if (ut) {
      k.appendChild(knapp(ft('Logga in'), 'liq fi-logga-in', () => {
        A.invoke('falk:logga-in').then((r) => { if (r && r.ok === false && r.message) toast(r.message); }).catch(() => toast(ft('Inloggningen gick inte att öppna just nu.')));
      }));
      k.appendChild(knapp(ft('Inte nu'), 'fi-sekundar', stang));
      las.querySelector('.fi-las-not').textContent = ft('Samma konto som i AdRaze på datorn.');
    } else {
      if (!last) k.appendChild(knapp(ft('Öppna inställningar'), 'liq fi-oppna-inst', () => { A.invoke('falk:installningar').catch(() => {}); }));
      k.appendChild(knapp(ft('Stäng'), last ? 'liq' : 'fi-sekundar', stang));
    }
  }
  function visaLage(ny, last) {
    if (ny) lage = ny;
    if (typeof last === 'boolean') IOS.last = last;
    if (lage === 'ok') {
      document.body.classList.remove('fi-last');
      las.innerHTML = '';
      return;
    }
    ritaLas();
    document.body.classList.add('fi-last');
    try { closeSide(); closePanels(); } catch {}
    try { inp.blur(); } catch {}
  }
  A.on('falk:lage', (d) => {
    const forut = lage;
    visaLage(d && d.lage, d && d.last);
    if (lage === 'ok' && forut !== 'ok') {
      try { K.me().then((r) => { myName = (r && r.name) || ''; if (!history.length && !busy) { heroUtanIn = true; render(); } }).catch(() => {}); } catch {}
      try { K.kvot().then((q) => { visaKvot(q); visaModell(q); }).catch(() => {}); } catch {}
    }
  });
  visaLage(lage);

  /* ── Tangentbordet: skrivfältet ligger precis ovanför, huvudet står kvar ── */
  const vv = window.visualViewport;
  if (vv) {
    let forra = -1;
    const anpassa = () => {
      const h = Math.round(vv.height);
      const oppen = window.innerHeight - h > 120 && document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
      if (oppen) html.style.setProperty('--fi-vh', h + 'px'); else html.style.removeProperty('--fi-vh');
      document.body.classList.toggle('fi-tangentbord', !!oppen);
      if (oppen) {
        if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
        if (h !== forra && follow) log.scrollTop = log.scrollHeight + 9999;
      }
      forra = oppen ? h : -1;
    };
    vv.addEventListener('resize', anpassa);
    vv.addEventListener('scroll', anpassa);
    document.addEventListener('focusin', () => setTimeout(anpassa, 60));
    document.addEventListener('focusout', () => setTimeout(anpassa, 60));
  }

  /* ── En fråga från appen (Falk öppnades med en fråga) ── */
  if (IOS.fraga && lage === 'ok') setTimeout(() => { try { A._emit('krypto-prefill', IOS.fraga); } catch {} }, 350);

  /* ── För självtestet ── */
  stat.lage = () => lage;
  stat.fraga = (text) => { inp.value = String(text || ''); autosize(); send(); return true; };
  stat.upptagen = () => !!busy;
  stat.antal = () => history.length;
  stat.strommar = () => !!(S.aktiv && S.el);
  stat.stromtext = () => S.text;
  stat.halvfardig = halvfardig;
  stat.nollstall = () => {
    for (const k of ['krypto-memories', 'krypto-convos', 'krypto-chat-history', 'krypto-projects', 'krypto-senast', 'krypto-mode', 'falk-modell', 'falk-modell-gomd']) {
      try { localStorage.removeItem(k); } catch {}
    }
    convos = []; activeId = null; history = []; projects = [];
    loadConvos(); render(); renderSide(); updateBadge(); updateConvTitle();
    inp.value = ''; autosize();
    return true;
  };

  samtalKlass();
  tomKnapp();
  // Välkomsten ritas om med iPhone-versionen (sidan ritade sin egen innan det här skriptet kom)
  if (!history.length) { heroUtanIn = true; render(); }
  stat.klar = true;
  } catch (e) {
    stat.fel = String((e && e.stack) || e);
    try { console.error('[falk-ios]', e); } catch {}
  }
})();
