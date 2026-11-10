// Inställningar › Falk: stäng av Falk helt, och välj färg, panelbredd, textstorlek, svarslängd, hälsning och tänkord.
//
// Laddas efter anpassa.js och anpassa-tema.js, före shell.js. Värdena ligger i Anpassa-butiken (falk.*, registrerade i
// ../falk-inst.js) så att de går att ångra och syns direkt i alla fönster. Huvudprocessen skickar dem vidare till
// Falk-panelen (ui/krypto.html) och vägrar allt som rör Falk när falk.av är satt; här sköts det som syns i skalet:
// klassen falk-av på <html> gömmer knappen, "Falk granskar", startsidans Fråga Falk och raderna som bara gäller Falk.
(function () {
  'use strict';
  const A = window.Anpassa;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const STD = { av: false, accent: '#ff4b1f', bredd: 'normal', text: 'normal', svar: 'normal', halsning: true, tankord: true };
  const ETIKETT = { av: 'Använd Falk', accent: 'Falks färg', bredd: 'Falk-panelens bredd', text: 'Textstorlek i Falk', svar: 'Svarslängd', halsning: 'Falks hälsning', tankord: 'Tänkord' };
  const FARGER = [['#ff4b1f', 'AdRaze'], ['#d6336c', 'Hallon'], ['#7354d6', 'Viol'], ['#3b6fe0', 'Blå'], ['#0b8a8f', 'Hav'], ['#2f9e67', 'Skog'], ['#e8a317', 'Bärnsten'], ['#5f6b7a', 'Grafit']];
  const CHECK = '<svg class="anp-tema-bock" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  const PLUS = '<svg class="anp-tema-plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>';

  const varde = (n) => { const v = A ? A.get('falk.' + n) : undefined; return v === undefined || v === null ? STD[n] : v; };
  const av = () => varde('av') === true;
  window.FalkInst = { av, varde };
  if (!A) return;

  const normFarg = (v) => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v == null ? '' : v).trim()); if (!m) return null; const h = m[1].toLowerCase(); return '#' + (h.length === 3 ? h.replace(/./g, (c) => c + c) : h); };
  const textPa = (hex) => { try { return window.AnpassaTema.textPa(hex); } catch { return '#fff'; } };
  async function satt(n, v) {
    const r = await A.set('falk.' + n, v === STD[n] ? undefined : v, ETIKETT[n]);
    if (r && r.ok === false && r.error === 'barnlast') { try { showToast('Går inte att ändra i barnläge.'); } catch {} uppdatera(); }
  }

  // Av/på i skalet. Körs direkt (före första målningen) och varje gång värdet ändras i något fönster.
  function tillampaAv() {
    const a = av();
    root.classList.toggle('falk-av', a);
    if (a) { try { if (typeof falkStangAllt === 'function') falkStangAllt(); } catch {} }
  }

  function prov(hex, namn) {
    return '<button type="button" class="anp-tema-prov" data-farg="' + hex + '" style="--prov:' + hex + ';--prov-on:' + textPa(hex) + '" title="' + namn + '" aria-label="' + namn + '" aria-pressed="false">' + CHECK + '</button>';
  }
  function rita() {
    const g = $('falk-farger');
    if (!g || g.dataset.ritad) return;
    g.dataset.ritad = '1';
    g.innerHTML = FARGER.map(([h, n]) => prov(h, n)).join('') + '<span class="anp-tema-skilj" aria-hidden="true"></span>' +
      '<label class="anp-tema-prov anp-tema-egen" title="Egen färg">' + PLUS + CHECK + '<input type="color" data-egen aria-label="Egen färg"></label>' +
      '<input class="anp-tema-hex" data-hex type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Färgkod">';
  }
  function uppdatera() {
    const s = $('falk-inst'); if (!s) return;
    rita();
    const a = av(), farg = normFarg(varde('accent')) || STD.accent;
    const pa = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); };
    $('tgl-falk-pa').checked = !a;
    $('falk-inst-resten').hidden = a;
    $('falk-av-not').hidden = !a;
    s.querySelectorAll('[data-falk][data-v]').forEach((b) => pa(b, varde(b.dataset.falk) === b.dataset.v));
    s.querySelectorAll('[data-farg]').forEach((b) => pa(b, b.dataset.farg === farg));
    const egen = s.querySelector('.anp-tema-egen');
    if (egen) { egen.classList.toggle('on', !FARGER.some(([h]) => h === farg)); egen.style.setProperty('--prov', farg); egen.style.setProperty('--prov-on', textPa(farg)); }
    const inp = s.querySelector('[data-egen]'); if (inp) inp.value = farg;
    const hex = s.querySelector('[data-hex]'); if (hex && document.activeElement !== hex) hex.value = farg;
    $('tgl-falk-halsning').checked = varde('halsning') !== false;
    $('tgl-falk-tankord').checked = varde('tankord') !== false;
  }

  function koppla() {
    const s = $('falk-inst'); if (!s) return;
    rita();
    $('tgl-falk-pa').addEventListener('change', (e) => satt('av', !e.target.checked));
    $('tgl-falk-halsning').addEventListener('change', (e) => satt('halsning', e.target.checked));
    $('tgl-falk-tankord').addEventListener('change', (e) => satt('tankord', e.target.checked));
    s.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !s.contains(b)) return;
      if (b.dataset.falk && b.dataset.v) satt(b.dataset.falk, b.dataset.v);
      else if (b.dataset.farg) satt('accent', b.dataset.farg);
      else if (b.id === 'falk-aterstall') aterstall();
    });
    s.addEventListener('change', (e) => { if (e.target.matches('[data-egen]')) satt('accent', e.target.value); });
    const hex = s.querySelector('[data-hex]');
    const hexKlar = () => { const v = normFarg(hex.value); if (!v) { hex.value = normFarg(varde('accent')) || STD.accent; return; } hex.value = v; if (v !== varde('accent')) satt('accent', v); };
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hexKlar(); } });
    hex.addEventListener('blur', hexKlar);
    uppdatera();
  }
  // Utseendet och svaren tillbaka till standard. Av/på rörs inte – det är ett eget val.
  async function aterstall() {
    for (const n of ['accent', 'bredd', 'text', 'svar', 'halsning', 'tankord']) if (A.alla()['falk.' + n] !== undefined) await A.set('falk.' + n, undefined, 'Återställ Falks utseende');
    try { showToast('Falks utseende är återställt.'); } catch {}
  }

  root.classList.toggle('falk-av', av());   // före första målningen: knappen blinkar aldrig till
  A.on('falk.', (nyckel) => { if (nyckel === 'falk.av') tillampaAv(); uppdatera(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', koppla); else koppla();
  Object.assign(window.FalkInst, { satt, aterstall, uppdatera, STD });
})();
