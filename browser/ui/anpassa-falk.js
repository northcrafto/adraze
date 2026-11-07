// Falk ändrar Anpassa-inställningar med vanligt språk. Laddas i Falk-panelen (krypto.html) och ger:
//   FalkAnpassa.instruktioner()  – hur Falk gör, med exempel (läggs i Falks instruktioner)
//   await FalkAnpassa.lista()     – nycklarna som finns just nu, med värden (läses vid varje fråga: alla områden som
//                                   registrerats syns, inget är hårdkodat)
//   FalkAnpassa.ar(a)            – är taggen en Anpassa-tagg?
//   await FalkAnpassa.steg(a)     – kör taggen och ger raden som visas i chatten
// Allt avgörs i huvudprocessen (anpassa-falk.js): bara registrerade nycklar, inget barnlåst i barnläge, och egna
// skript/CSS m.m. först när du godkänt i en ruta.
(function () {
  const bro = window.anpassaFalk;
  if (!bro) return;
  const tx = (x) => (typeof window.t === 'function' ? window.t(x) : x);
  // Text från inställningarna får aldrig innehålla körbara taggar (samma skydd som för webbsidor i krypto.html)
  const neutral = (s) => String(s == null ? '' : s).replace(/\[\[/g, '[⁠[').replace(/<\s*[|｜]\s*(DSML|tool▁calls)/gi, '‹$1').replace(/\s+/g, ' ');
  const IKON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="10.5" r="1.1"/><circle cx="11" cy="7" r="1.1"/><circle cx="15.5" cy="8" r="1.1"/></svg>';
  const liten = (s) => { s = String(s || ''); return s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s; };

  const INSTR =
    'Du kan också ANPASSA webbläsaren: färger, ljust/mörkt, densitet, hörn, flikarnas placering, verktygsfältet med mera. ' +
    'Inställningarna som finns, och vad de står på just nu, står i listan ANPASSA längre ner. Lägg taggar sist i svaret – här får du ' +
    'lägga flera (högst 4) om användaren ber om flera ändringar:\n' +
    '• Ändra: [[gör:anpassa=NYCKEL|VÄRDE]] – bara nycklar från listan, och värden av samma slag som där står. Färger som hex (#rrggbb), ' +
    'listor med komma emellan. VÄRDE "standard" återställer just den inställningen.\n' +
    '• Ångra senaste ändringen: [[gör:anpassa_angra]]\n' +
    '• Återställ ett område: [[gör:anpassa_aterstall=OMRÅDE]] (första delen av nyckeln, t.ex. tema, flikar, verktyg), eller allt: [[gör:anpassa_aterstall=allt]]\n' +
    'Exempel:\n' +
    '• "gör flikarna vertikala" → [[gör:anpassa=flikar.lage|vertikalt]]\n' +
    '• "mörkgrön accentfärg" → [[gör:anpassa=tema.accent|#1f6b3a]]\n' +
    '• "kompaktare" → [[gör:anpassa=tema.densitet|kompakt]]  ·  "luftigare" → [[gör:anpassa=tema.densitet|luftig]]\n' +
    '• "mörkt läge" → [[gör:anpassa=tema.lage|morkt]]  ·  "följ datorn" → [[gör:anpassa=tema.lage|system]]\n' +
    '• "dölj flikarna" → [[gör:anpassa=flikar.lage|dolda]]\n' +
    '• "mörkt och kompakt" → [[gör:anpassa=tema.lage|morkt]] [[gör:anpassa=tema.densitet|kompakt]]\n' +
    '• "ångra det" → [[gör:anpassa_angra]]\n' +
    '• "återställ utseendet" → [[gör:anpassa_aterstall=tema]]\n' +
    'Ändra bara det användaren ber om. Står det "frågar först" (t.ex. egna skript och egen CSS) får användaren godkänna i en ruta. ' +
    'Står det "låst i barnläge" går den inte att ändra nu – säg det i stället för att lägga taggen. Finns inställningen inte i listan ' +
    'finns den inte i AdRaze ännu: säg det och hitta aldrig på nycklar. Bekräfta kort vad du ändrade och att det går att ångra.\n';

  function delar(vad) { const s = String(vad || ''); const i = s.indexOf(': '); return i < 0 ? ['', s] : [s.slice(0, i), s.slice(i + 2)]; }
  function stegFor(a, r) {
    const n = String(a.name || '').toLowerCase();
    if (/angra|ångra/.test(n)) return r.ok ? [IKON, tx('Ångrade'), r.vad || ''] : [IKON, tx('Inget att ångra'), r.stoppad ? tx('Du stoppade det') : '', 'del'];
    if (/aterstall|återställ/.test(n)) {
      if (!r.ok) return [IKON, r.stoppad ? tx('Du stoppade återställningen') : tx('Gick inte att återställa'), r.stoppad ? '' : (r.fel || ''), 'del'];
      const vad = r.vad === 'allt' ? tx('allt') : r.vad;
      return [IKON, r.redan ? tx('Redan standard') : tx('Återställde'), vad];
    }
    if (r.ok) { const [, v] = delar(r.vad); return [IKON, (r.redan ? tx('Redan inställt') + ': ' : tx('Ändrade') + ' ') + liten(r.etikett || ''), v]; }
    if (r.stoppad) return [IKON, tx('Du stoppade ändringen'), r.etikett || '', 'del'];
    return [IKON, tx('Gick inte') + (r.etikett ? ': ' + liten(r.etikett) : ''), r.fel || '', 'del'];
  }

  window.FalkAnpassa = {
    ar: (a) => !!a && /^anpassa(_angra|_ångra|_aterstall|_återställ)?$/i.test(String(a.name || '').trim()),
    instruktioner: () => INSTR,
    async lista() {
      let l = []; try { l = await bro.lista(); } catch {}
      if (!Array.isArray(l) || !l.length) return '\n\nANPASSA: (inga inställningar finns ännu)';
      const rader = l.slice(0, 150).map((x) => [x.nyckel, x.etikett, x.nu ? 'nu ' + x.nu : '', x.val, x.fraga ? 'frågar först' : '', x.last ? 'låst i barnläge' : '']
        .filter(Boolean).map(neutral).join(' · '));
      return '\n\nANPASSA (det du kan ändra – nyckel · vad · värdet nu · tillåtna värden):\n' + rader.join('\n');
    },
    async steg(a) {
      let r; try { r = await bro.gor({ name: a && a.name, value: a && a.value }); } catch { r = null; }
      return stegFor(a || {}, r || { ok: false, fel: tx('Det gick inte.') });
    },
  };
})();
