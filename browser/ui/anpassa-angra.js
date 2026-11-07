// Anpassa › Ångra (högst upp i Anpassa): de senaste ändringarna som en läsbar lista, "Ångra senaste" (även Ctrl+Z när
// Anpassa är öppet och du inte skriver i ett fält), "Återställ allt" (med bekräftelse) och export/import av alla
// inställningar (kod eller fil). Efter varje ändring du gör visas en liten toast "Ändrat: X · Ångra".
// Ritar bara i #anp-angra och i toasten. Ångra tar hela gruppen: en återställning, en import eller det Falk gjorde
// i ett svar ångras på en gång (anpassa-angra.js i huvudprocessen).
(function () {
  const A = window.Anpassa;
  if (!A) return;
  const bro = window.anpassaAngra || {};
  const $id = (id) => document.getElementById(id);
  const tx = (x) => (typeof window.t === 'function' ? window.t(x) : x);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEX = /^#[0-9a-f]{6}$/i;
  const VISNING = { morkt: 'mörkt', doman: 'domän', stang: 'stäng', nyflik: 'ny flik', vanster: 'vänster', hoger: 'höger' };   // värden som sparas utan å/ä/ö men visas med

  /* ── Etiketter ur registret ("Accentfärg" i stället för "tema.accent") ── */
  let reg = {};
  function lasRegister() { try { const r = window.anpassaBro && window.anpassaBro.alla(); if (r && r.register) reg = r.register; } catch {} return reg; }
  const hitta = (nyckel) => reg[nyckel] || Object.entries(reg).find(([k]) => k.endsWith('.*') && String(nyckel).startsWith(k.slice(0, -1)))?.[1];
  function etikett(nyckel, reserv) {
    let r = hitta(nyckel);
    if (!r) { lasRegister(); r = hitta(nyckel); }   // registrerad efter start (t.ex. en del som laddas senare)
    let e = (r && r.etikett) || String(reserv || nyckel || '');
    if (e.startsWith('Falk:')) e = e.slice(5).trim();
    return e;
  }
  const lista = (l) => { l = [...new Set((l || []).filter(Boolean))]; return l.length > 3 ? l.length + ' ' + tx('inställningar') : l.join(', '); };

  /* ── Toast: "Ändrat: X · Ångra" ──
   * Längst ner i mitten av innehållsytan (#views) – aldrig över flikraden eller verktygsraden, var de än ligger
   * (flikarna på sidan eller dolda, verktygsraden längst ner). Rutan släpper igenom klick utom på Ångra-knappen.
   * En webbsida ritas ovanpå skalet: syns en sida lägger huvudprocessen toasten i en egen liten vy ovanpå sidan
   * (anpassa-angra.js + anpassa-toast.html), annars ritas den här. */
  let toastEl = null, toastT = 0, toastNr = 0;
  function gomDom() { clearTimeout(toastT); if (toastEl) toastEl.classList.remove('pa'); }
  function gomToast() { gomDom(); try { if (bro.gomToast) bro.gomToast(); } catch {} }
  function domToast() {
    if (toastEl && toastEl.isConnected) return toastEl;
    toastEl = document.createElement('div'); toastEl.id = 'anp-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
    toastEl.innerHTML = '<span class="anp-toast-txt"></span><span class="anp-toast-prick" aria-hidden="true">·</span><button type="button" class="anp-toast-angra"></button>';
    toastEl.querySelector('.anp-toast-angra').textContent = tx('Ångra');
    toastEl.querySelector('.anp-toast-angra').addEventListener('click', () => { gomToast(); angraSenaste(); });
    // Rutan tar inga klick (pointer-events), men musen över Ångra-knappen räknas också som över rutan
    toastEl.addEventListener('mouseenter', () => clearTimeout(toastT));
    toastEl.addEventListener('mouseleave', () => { clearTimeout(toastT); toastT = setTimeout(gomDom, 2500); });
    ($id('views') || document.body).appendChild(toastEl);
    return toastEl;
  }
  function visaIDom(text, medAngra, ms) {
    const el = domToast();
    el.querySelector('.anp-toast-txt').textContent = text;
    el.classList.toggle('utan-angra', !medAngra);
    void el.offsetWidth; el.classList.add('pa');
    clearTimeout(toastT); toastT = setTimeout(gomDom, ms);
  }
  function visaToast(text, medAngra) {
    const ms = medAngra ? 5000 : 2600, nr = ++toastNr;
    const har = () => { if (nr === toastNr) visaIDom(text, medAngra, ms); };
    if (!bro.toast) { har(); return; }
    const tema = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    Promise.resolve(bro.toast({ text, angra: !!medAngra, angraText: tx('Ångra'), ms, tema })).then((ovanpaSidan) => {
      if (nr !== toastNr) return;
      if (ovanpaSidan) gomDom(); else har();
    }, har);
  }
  if (bro.onToastAngra) bro.onToastAngra(() => { angraSenaste(); });   // Ångra i toasten ovanpå sidan
  // Toasten följer med när sidan göms (den fortsätter här) eller visas igen (den ligger då ovanpå sidan)
  if (bro.onToastISkalet) bro.onToastISkalet((d) => { if (d && typeof d === 'object') { ++toastNr; visaIDom(String(d.text || ''), !!d.angra, Math.max(1000, +d.ms || 2600)); } });
  if (bro.onToastOvanpa) bro.onToastOvanpa(() => gomDom());
  // Ändringar som DU gör i det här fönstret (inte de som kommer från ett annat fönster eller när AdRaze startar):
  // fönstret har fokus och du klickade, skrev eller ändrade något nyss.
  let senastAnvand = 0, tystTill = 0;
  for (const typ of ['pointerdown', 'keydown', 'input', 'change']) document.addEventListener(typ, (e) => { if (e.isTrusted) senastAnvand = Date.now(); }, true);
  let ko = [], koT = 0;
  function koaToast(etiketter) {
    ko.push(...etiketter); clearTimeout(koT);
    koT = setTimeout(() => { const l = ko; ko = []; if (l.length) visaToast(tx('Ändrat') + ': ' + lista(l), true); }, 160);
  }
  A.on('*', (nyckel) => {
    if (synlig()) ritaSnart();
    if (Date.now() < tystTill) return;
    if (!document.hasFocus() || Date.now() - senastAnvand > 4000) return;
    koaToast([etikett(nyckel)]);
  });
  // Falk ändrade något i det här fönstrets Falk-panel (anpassa-falk.js)
  if (bro.onFalk) bro.onFalk((d) => {
    if (!d) return;
    if (synlig()) ritaSnart();
    tystTill = Date.now() + 600;   // samma ändring kommer också som vanlig ändring – en toast räcker
    if (d.angrat) visaToast(tx('Ångrade') + ': ' + lista(d.etiketter), false);
    else if (d.aterstallt) visaToast(tx('Återställt') + ': ' + lista(d.etiketter), true);
    else koaToast(d.etiketter || []);
  });

  /* ── Ångra senaste (hela gruppen) ── */
  async function angraSenaste() {
    tystTill = Date.now() + 1500;
    let r = null;
    try { r = bro.angra ? await bro.angra() : await A.angra(); } catch {}
    if (r && r.ok) visaToast(tx('Ångrade') + ': ' + lista(r.etiketter || [etikett(r.nyckel, r.etikett)]), false);
    else visaToast(tx('Det finns inget att ångra.'), false);
    rita();
    return r;
  }
  function synlig() {
    const s = $id('settings'), p = document.querySelector('#settings .set-panel[data-cat="anpassa"]');
    return !!(s && p && !s.classList.contains('hidden') && !p.classList.contains('hidden'));
  }
  function arTextfalt(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    return !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(el.type || 'text');
  }
  // Ctrl+Z i Anpassa ångrar senaste ändringen (står du i ett textfält ångrar Ctrl+Z texten som vanligt)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== 'z') return;
    if (!synlig() || arTextfalt(e.target) || arTextfalt(document.activeElement)) return;
    const a = document.activeElement;
    if (a && a !== document.body && !a.closest('#settings')) return;   // fokus någon annanstans (t.ex. adressfältet)
    e.preventDefault(); angraSenaste();
  });

  /* ── Panelen ── */
  const tid = (ts) => {
    const d = new Date(ts), nu = new Date();
    const hm = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === nu.toDateString()) return hm;
    const ig = new Date(nu); ig.setDate(nu.getDate() - 1);
    if (d.toDateString() === ig.toDateString()) return tx('i går') + ' ' + hm;
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' ' + hm;
  };
  function vardeHtml(nyckel, v) {
    const r = hitta(nyckel);
    if (/^avancerat\./.test(nyckel) || (r && (r.importBar === false))) return '';   // egen kod visas inte i listan
    if (v === undefined || v === null) return '';
    if (typeof v === 'string' && HEX.test(v)) return '<span class="anp-h-farg" style="background:' + v + '" title="' + v + '"></span>';
    if (v === true || v === false) return '<span class="anp-h-varde">' + (v ? tx('på') : tx('av')) + '</span>';
    if ((typeof v === 'string' && v.length <= 18 && !/\n/.test(v)) || typeof v === 'number') return '<span class="anp-h-varde" translate="no">' + esc(VISNING[v] || v) + '</span>';
    return '';
  }
  function radHtml(h) {
    const e = String(h.etikett || '');
    const falk = e.startsWith('Falk:');
    const verb = e === 'Importerat' ? tx('importerades') : (e.startsWith('Återställ') || h.efter === undefined) ? tx('återställdes') : tx('ändrades');
    return '<li class="anp-h"><span class="anp-h-txt"><span class="anp-h-namn">' + esc(etikett(h.nyckel, e)) + '</span> ' + esc(verb) + '</span>' +
      vardeHtml(h.nyckel, h.efter) + (falk ? '<span class="anp-h-falk">Falk</span>' : '') + '<span class="anp-h-tid">· ' + esc(tid(h.ts)) + '</span></li>';
  }
  const SYNLIGA = 3;   // så många ändringar syns direkt – panelen ligger överst i Anpassa och ska inte skymma resten
  let visaAlla = false, ritT = 0;
  const ritaSnart = () => { clearTimeout(ritT); ritT = setTimeout(rita, 200); };

  function bygg(host) {
    host.innerHTML =
      '<h3 class="set-h3">' + esc(tx('Ångra och spara')) + '</h3>' +
      '<p class="set-lead">' + esc(tx('Allt du ändrar i Anpassa hamnar här och går att ångra.')) + '</p>' +
      '<div class="set-row anp-hist-topp"><div class="set-txt"><div class="set-title">' + esc(tx('Senaste ändringar')) + '</div><div class="set-desc">' + esc(tx('Ångra med knappen eller Ctrl+Z.')) + '</div></div>' +
        '<button type="button" class="set-btn" id="anp-angra-senaste">' + esc(tx('Ångra senaste')) + '</button></div>' +
      '<div class="set-row anp-hist-rad"><ol class="anp-hist" id="anp-hist"></ol><button type="button" class="anp-hist-mer" id="anp-hist-mer" hidden></button></div>' +
      '<div class="set-row anp-vik"><div class="set-txt"><div class="set-title">' + esc(tx('Exportera alla mina inställningar')) + '</div><div class="set-desc">' + esc(tx('Spara det du ändrat som en kod eller fil, eller importera en kod. Egen CSS och skript följer inte med.')) + '</div></div>' +
        '<div class="anp-par"><button type="button" class="set-btn" id="anp-exp-knapp" aria-expanded="false" aria-controls="anp-exp">' + esc(tx('Exportera')) + '</button>' +
        '<button type="button" class="set-btn" id="anp-imp-knapp" aria-expanded="false" aria-controls="anp-imp">' + esc(tx('Importera')) + '</button></div>' +
        '<div class="anp-ruta" id="anp-exp" hidden><textarea id="anp-exp-kod" readonly rows="3" spellcheck="false" translate="no" aria-label="' + esc(tx('Din kod')) + '"></textarea>' +
          '<div class="anp-knappar"><button type="button" class="set-btn" id="anp-exp-kopiera">' + esc(tx('Kopiera')) + '</button><button type="button" class="set-btn" id="anp-exp-fil">' + esc(tx('Spara som fil')) + '</button><span class="anp-not" id="anp-exp-not" role="status"></span></div></div>' +
        '<div class="anp-ruta" id="anp-imp" hidden><textarea id="anp-imp-kod" rows="3" spellcheck="false" placeholder="ADRZ1…" translate="no" aria-label="' + esc(tx('Kod att importera')) + '"></textarea>' +
          '<div class="anp-knappar"><button type="button" class="set-btn" id="anp-imp-kor">' + esc(tx('Importera koden')) + '</button><button type="button" class="set-btn" id="anp-imp-filknapp">' + esc(tx('Välj fil…')) + '</button>' +
          '<input type="file" id="anp-imp-fil" accept=".txt,text/plain" hidden><span class="anp-not" id="anp-imp-not" role="status"></span></div>' +
          '<p class="anp-liten">' + esc(tx('Egna skript och egen CSS följer aldrig med vid import, av säkerhetsskäl.')) + '</p></div></div>' +
      '<div class="set-row anp-vik"><div class="set-txt"><div class="set-title">' + esc(tx('Återställ allt')) + '</div><div class="set-desc">' + esc(tx('Allt i Anpassa går tillbaka till standard. Det går att ångra.')) + '</div></div>' +
        '<button type="button" class="set-btn anp-risk" id="anp-ater-knapp" aria-expanded="false">' + esc(tx('Återställ allt')) + '</button>' +
        '<div class="anp-ruta anp-bekrafta" id="anp-ater" hidden><span class="anp-bekrafta-txt">' + esc(tx('Vill du återställa allt i Anpassa?')) + '</span>' +
          '<div class="anp-knappar"><button type="button" class="set-btn" id="anp-ater-nej">' + esc(tx('Avbryt')) + '</button><button type="button" class="set-btn anp-risk" id="anp-ater-ja">' + esc(tx('Ja, återställ')) + '</button></div></div></div>';
    host.dataset.byggd = '1';

    const vik = (knapp, ruta) => { const r = $id(ruta), k = $id(knapp); const oppen = r.hidden; r.hidden = !oppen; k.setAttribute('aria-expanded', String(oppen)); return oppen; };
    const stang = (knapp, ruta) => { const r = $id(ruta); if (r && !r.hidden) vik(knapp, ruta); };   // export och import delar rad: en ruta i taget
    $id('anp-angra-senaste').addEventListener('click', angraSenaste);
    $id('anp-hist-mer').addEventListener('click', () => { visaAlla = !visaAlla; rita(); });
    // Exportera
    $id('anp-exp-knapp').addEventListener('click', async () => {
      stang('anp-imp-knapp', 'anp-imp');
      if (!vik('anp-exp-knapp', 'anp-exp')) return;
      let kod = ''; try { kod = await A.exportera(); } catch {}
      $id('anp-exp-kod').value = kod;
      const n = Object.keys(A.alla() || {}).length;
      $id('anp-exp-not').textContent = n ? n + ' ' + (n === 1 ? tx('inställning') : tx('inställningar')) : tx('Du har inte ändrat något än.');
    });
    $id('anp-exp-kopiera').addEventListener('click', async () => {
      const f = $id('anp-exp-kod'); let ok = false;
      try { await navigator.clipboard.writeText(f.value); ok = true; } catch { try { f.select(); ok = document.execCommand('copy'); } catch {} }
      $id('anp-exp-not').textContent = ok ? tx('Kopierad.') : tx('Markera koden och kopiera den.');
    });
    $id('anp-exp-fil').addEventListener('click', async () => {
      if (!bro.sparaFil) return;
      let r = null; try { r = await bro.sparaFil(); } catch {}
      if (r && r.ok) $id('anp-exp-not').textContent = tx('Sparad') + ': ' + (r.fil || '');
      else if (r && !r.avbrutet) $id('anp-exp-not').textContent = tx('Kunde inte spara filen.');
    });
    // Importera (kod eller fil)
    $id('anp-imp-knapp').addEventListener('click', () => { stang('anp-exp-knapp', 'anp-exp'); if (vik('anp-imp-knapp', 'anp-imp')) setTimeout(() => $id('anp-imp-kod').focus(), 30); });
    const importera = async (kod) => {
      const not = $id('anp-imp-not');
      kod = String(kod || '').trim();
      if (!kod) { not.textContent = tx('Klistra in en kod först.'); return; }
      tystTill = Date.now() + 2500;
      let r = null; try { r = await A.importera(kod); } catch {}
      if (!r || !r.ok) { not.textContent = tx('Koden ser inte rätt ut. Kolla att du fått med allt.'); return; }
      if (!r.antal) { not.textContent = tx('Inget nytt att importera.'); return; }
      not.textContent = tx('Klart!') + ' ' + r.antal + ' ' + (r.antal === 1 ? tx('inställning importerades.') : tx('inställningar importerades.'));
      $id('anp-imp-kod').value = '';
      visaToast(tx('Importerat') + ': ' + r.antal + ' ' + (r.antal === 1 ? tx('inställning') : tx('inställningar')), true);
      rita();
    };
    $id('anp-imp-kor').addEventListener('click', () => importera($id('anp-imp-kod').value));
    $id('anp-imp-filknapp').addEventListener('click', () => $id('anp-imp-fil').click());
    $id('anp-imp-fil').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { $id('anp-imp-not').textContent = tx('Filen är för stor.'); return; }
      let text = ''; try { text = await f.text(); } catch {}
      $id('anp-imp-kod').value = text.trim();
      importera(text);
    });
    // Återställ allt (med bekräftelse)
    $id('anp-ater-knapp').addEventListener('click', () => { if (vik('anp-ater-knapp', 'anp-ater')) $id('anp-ater-nej').focus(); });
    $id('anp-ater-nej').addEventListener('click', () => vik('anp-ater-knapp', 'anp-ater'));
    $id('anp-ater-ja').addEventListener('click', async () => {
      vik('anp-ater-knapp', 'anp-ater');
      tystTill = Date.now() + 2500;
      let r = null; try { r = await A.aterstall(); } catch {}
      if (r && r.antal) visaToast(tx('Allt återställt'), true); else visaToast(tx('Allt är redan som standard.'), false);
      rita();
    });
  }

  async function rita() {
    const host = $id('anp-angra'); if (!host) return;
    lasRegister();
    if (!host.dataset.byggd) bygg(host);
    let h = []; try { h = await A.historik(); } catch {}
    if (!Array.isArray(h)) h = [];
    const ol = $id('anp-hist'), mer = $id('anp-hist-mer');
    const visas = visaAlla ? h : h.slice(0, SYNLIGA);
    ol.innerHTML = visas.length ? visas.map(radHtml).join('') : '<li class="anp-h-tom">' + esc(tx('Inga ändringar än. Det du ändrar i Anpassa visas här.')) + '</li>';
    mer.hidden = h.length <= SYNLIGA;
    mer.textContent = visaAlla ? tx('Visa färre') : tx('Visa alla') + ' (' + h.length + ')';
    $id('anp-angra-senaste').disabled = !h.length;
  }
  document.addEventListener('anpassa:visa', rita);

  // För andra delar och test: ångra som Ångra-knappen, visa toasten
  window.AnpassaAngra = { angra: angraSenaste, toast: visaToast, rita };
})();
