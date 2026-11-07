/* Inställningar → Anpassa → Avancerat. Ritar BARA i #anp-avancerat.
 *   Egen CSS för sajter  → avancerat.css      (huvudprocessen lägger in den i flikarna med insertCSS)
 *   Egen CSS för AdRaze  → avancerat.skalcss  (som Firefox userChrome.css; nödutgång Ctrl+Shift+Alt+R)
 *   Användarskript       → avancerat.skript   (körs isolerat i flikarna, se ../anpassa-avancerat.js)
 * Ingen användarkod körs i skalet. Skript kontrolleras genom att huvudprocessen kompilerar (inte kör) dem.
 * Andra delar kan öppna CSS-redigeraren för en sajt med window.AnpassaAvancerat.redigeraCss('example.com'). */
(function () {
  'use strict';
  const A = window.Anpassa;
  const bro = window.anpassaAvancerat || null;
  if (!A) return;
  const INKOGNITO = new URLSearchParams(location.search).has('incognito');
  const NYCKEL = { css: 'avancerat.css', skal: 'avancerat.skalcss', skript: 'avancerat.skript' };
  const MAX_CSS = 100000, MAX_KOD = 300000;
  const INDRAG = '  ';

  /* ── Hjälpare (all användartext går in som text, aldrig som HTML) ── */
  function el(tag, attr, ...barn) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attr || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const b of barn.flat()) if (b != null && b !== false) e.append(b);
    return e;
  }
  function ikon(namn) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('class', 'ic ic-sm'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(ns, 'use'); u.setAttribute('href', '#' + namn); s.append(u);
    return s;
  }
  const nyttId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const radAntal = (t) => (String(t || '').match(/\n/g) || []).length + 1;
  function normVard(s) {
    let h = String(s || '').trim().toLowerCase();
    if (h === '*') return '*';
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#\s]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '')
      .replace(/^\*\./, '').replace(/\.+$/, '').replace(/^www\./, '');
    if (!h || h.length > 253) return '';
    try { h = new URL('http://' + h).hostname; } catch { return ''; }
    return /^[a-z0-9.-]+$/.test(h) || /^\[[0-9a-f:.]+\]$/.test(h) ? h : '';
  }
  function strombrytare(pa, etikett, onChange) {
    const inp = el('input', { type: 'checkbox', 'aria-label': etikett });
    inp.checked = !!pa;
    inp.addEventListener('change', () => onChange(inp.checked, inp));
    return el('label', { class: 'switch' }, inp, el('span', { class: 'track' }));
  }
  function seg(varde, alternativ, onChange) {
    const s = el('div', { class: 'seg flex-none', role: 'group' });
    for (const [v, text] of alternativ) {
      const b = el('button', { type: 'button', class: 'seg-btn' + (v === varde ? ' on' : ''), 'aria-pressed': String(v === varde), 'data-v': v, text });
      b.addEventListener('click', () => {
        s.querySelectorAll('.seg-btn').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        onChange(v);
      });
      s.append(b);
    }
    return s;
  }
  // Knapp som kräver två klick (ta bort)
  function tvaSteg(text, fraga, gor) {
    const b = el('button', { type: 'button', class: 'anp-bort', text });
    let t = null;
    b.addEventListener('click', () => {
      if (!b.classList.contains('anp-sakert')) { b.classList.add('anp-sakert'); b.textContent = fraga; clearTimeout(t); t = setTimeout(() => { b.classList.remove('anp-sakert'); b.textContent = text; }, 3500); return; }
      clearTimeout(t); gor();
    });
    return b;
  }
  // Kort text under en lista ("Sparat …") som försvinner av sig själv
  function kvittens(nod, text, typ) {
    if (!nod) return;
    nod.textContent = text; nod.dataset.typ = typ || 'ok'; nod.hidden = false;
    clearTimeout(nod._t); nod._t = setTimeout(() => { nod.hidden = true; }, typ === 'fel' ? 7000 : 3200);
  }
  const felText = (r) => (r && r.error === 'barnlast' ? 'Går inte att ändra i barnläge.' : 'Det gick inte att spara. Försök igen.');

  /* ── Kodredigeraren: monospace, radnummer, Tab = två mellanslag, Shift+Tab drar ut, Enter behåller indraget.
   * Esc och sedan Tab flyttar fokus vidare (så tangentbordet aldrig fastnar). Ångra (Ctrl+Z) fungerar. ── */
  function kodRuta({ varde = '', etikett = 'Kod', rader = 14, platshallare = '' } = {}) {
    const nr = el('div', { class: 'anp-kod-nr', 'aria-hidden': 'true' });
    const felrad = el('div', { class: 'anp-kod-fel', hidden: true });
    const ta = el('textarea', { class: 'anp-kod-text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': etikett, placeholder: platshallare || null });
    const wrap = el('div', { class: 'anp-kod', translate: 'no', style: '--rader:' + rader }, nr, ta, felrad);
    let antal = 0, tabbFri = false, fel = 0;
    const flyttaFel = () => { if (fel) felrad.style.transform = 'translateY(' + ((fel - 1) * 20 + 12 - ta.scrollTop) + 'px)'; };
    const ritaNr = () => {
      const n = radAntal(ta.value);
      if (n !== antal) { antal = n; let s = ''; for (let i = 1; i <= n; i++) s += i + '\n'; nr.textContent = s; }
      nr.scrollTop = ta.scrollTop; flyttaFel();
    };
    ta.value = varde; ritaNr();
    ta.addEventListener('input', ritaNr);
    ta.addEventListener('scroll', () => { nr.scrollTop = ta.scrollTop; flyttaFel(); });
    // Byt ut text så att ångra-historiken lever kvar (execCommand), med reservväg
    const ersatt = (a, b, text, selA, selB) => {
      ta.setSelectionRange(a, b);
      let ok = false; try { ok = document.execCommand('insertText', false, text); } catch {}
      if (!ok) { ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      if (selA != null) ta.setSelectionRange(selA, selB);
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { tabbFri = true; e.stopPropagation(); return; }
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (tabbFri) { tabbFri = false; return; }
        e.preventDefault();
        const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
        const flera = v.slice(a, b).includes('\n');
        if (!flera && !e.shiftKey) { ersatt(a, b, INDRAG); return; }
        const start = v.lastIndexOf('\n', a - 1) + 1;
        const slutPos = b > a && v[b - 1] === '\n' ? b - 1 : b;
        const nl = v.indexOf('\n', slutPos); const slut = nl < 0 ? v.length : nl;
        const gamla = v.slice(start, slut).split('\n');
        const nya = gamla.map((r) => (e.shiftKey ? r.replace(/^( {1,2}|\t)/, '') : INDRAG + r));
        const text = nya.join('\n');
        if (flera) ersatt(start, slut, text, start, start + text.length);
        else { const d = nya[0].length - gamla[0].length; const p = Math.max(start, a + d); ersatt(start, slut, text, p, p); }
        return;
      }
      tabbFri = false;
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing) {
        const v = ta.value, a = ta.selectionStart;
        const start = v.lastIndexOf('\n', a - 1) + 1;
        const fore = v.slice(start, a);
        const indrag = (/^[ \t]*/.exec(fore) || [''])[0] + (/[{([]\s*$/.test(fore) ? INDRAG : '');
        e.preventDefault(); ersatt(a, ta.selectionEnd, '\n' + indrag);
        return;
      }
      if (e.key === '}' && ta.selectionStart === ta.selectionEnd) {   // stängande klammer på en tom rad drar ut ett steg
        const v = ta.value, a = ta.selectionStart, start = v.lastIndexOf('\n', a - 1) + 1, fore = v.slice(start, a);
        if (fore.length >= 2 && /^ +$/.test(fore)) { e.preventDefault(); ersatt(start, a, fore.slice(2) + '}'); }
      }
    });
    return {
      el: wrap, ta,
      get: () => ta.value,
      set: (v) => { ta.value = v; ritaNr(); },
      fokus: () => { try { ta.focus({ preventScroll: true }); } catch {} },
      // Markera en rad med fel (0 = ingen)
      markera: (rad) => { fel = rad > 0 ? rad : 0; felrad.hidden = !fel; flyttaFel(); },
      gaTillRad: (rad) => {
        const v = ta.value; let p = 0;
        for (let i = 1; i < rad && p >= 0; i++) p = v.indexOf('\n', p) + 1;
        if (p < 0) return;
        try { ta.focus({ preventScroll: true }); } catch {}
        ta.setSelectionRange(p, p); ta.scrollTop = Math.max(0, (rad - 4) * 20);
      },
    };
  }

  // CSS: går klamrarna jämnt ut? (strängar och kommentarer räknas inte)
  function klamrar(t) {
    let d = 0, rad = 1;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\n') { rad++; continue; }
      if (c === '/' && t[i + 1] === '*') {
        const e = t.indexOf('*/', i + 2);
        if (e < 0) return 'Kommentaren som börjar på rad ' + rad + ' tar aldrig slut (*/ saknas).';
        rad += radAntal(t.slice(i, e)) - 1; i = e + 1; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < t.length && t[j] !== c && t[j] !== '\n') j += t[j] === '\\' ? 2 : 1;
        i = t[j] === '\n' ? j - 1 : j; continue;
      }
      if (c === '{') d++;
      else if (c === '}' && --d < 0) return 'Rad ' + rad + ': en } för mycket.';
    }
    return d > 0 ? (d === 1 ? 'En { stängs aldrig med }. Reglerna efter den kan sluta gälla.' : d + ' st { stängs aldrig med }. Reglerna efter dem kan sluta gälla.') : '';
  }

  // // ==UserScript== … // ==/UserScript==  →  namn, sajter, när, ramar + varningar
  function lasHuvud(kod) {
    const m = /\/\/[ \t]*==UserScript==([\s\S]*?)\/\/[ \t]*==\/UserScript==/.exec(kod);
    if (!m) return null;
    const h = { text: m[0], namn: '', match: [], exclude: [], tid: 'document-end', ramar: true, saknas: [] };
    const STOD = new Set(['none', 'GM_info', 'GM.info', 'GM_addStyle', 'GM.addStyle', 'GM_log', 'unsafeWindow', 'window.close', 'window.focus', 'window.onurlchange']);
    for (const rad of m[1].split('\n')) {
      const r = /^\s*\/\/\s*@([\w:.-]+)(?:[ \t]+(.*?))?\s*$/.exec(rad);
      if (!r) continue;
      const k = r[1], v = (r[2] || '').trim();
      if (k === 'name' && !h.namn) h.namn = v;
      else if ((k === 'match' || k === 'include') && v) h.match.push(v);
      else if ((k === 'exclude' || k === 'exclude-match') && v) h.exclude.push(v);
      else if (k === 'run-at') h.tid = v === 'document-start' ? 'document-start' : 'document-end';
      else if (k === 'noframes') h.ramar = false;
      else if ((k === 'require' || k === 'resource') && !h.saknas.includes('@' + k)) h.saknas.push('@' + k);
      else if (k === 'grant' && v && !STOD.has(v) && !h.saknas.includes(v)) h.saknas.push(v);
    }
    return h;
  }

  /* ── Tillstånd ── */
  let rot = null;          // #anp-avancerat
  let byggd = null;        // 'barn' | 'vanlig' – vad som är ritat
  let delar = {};          // referenser till listor, platser m.m.
  let oppen = null;        // { typ: 'css' | 'skript', id, el, smutsig }
  let skalKod = null, skalSmutsig = false, skalBrytare = null;

  function rita() {
    rot = rot || document.getElementById('anp-avancerat');
    if (!rot) return;
    const barn = A.barnlage();
    if (barn) {
      if (byggd !== 'barn') {
        rot.replaceChildren(
          el('h3', { class: 'set-h3', text: 'Egen CSS och skript' }),
          el('div', { class: 'anp-last' }, ikon('i-lock'), el('span', { text: 'Avstängt i barnläge. Egen CSS och användarskript fungerar inte när familjens regler gäller.' })),
        );
        byggd = 'barn'; oppen = null; delar = {};
      }
      return;
    }
    if (byggd !== 'vanlig') bygg();
    ritaListor();
    ritaSkal();
  }

  function bygg() {
    byggd = 'vanlig'; oppen = null;
    delar = {
      cssLista: el('div', { class: 'anp-lista', 'data-lista': 'css' }),
      cssPlats: el('div', { class: 'anp-plats' }),
      cssStatus: el('p', { class: 'anp-status', role: 'status', hidden: true }),
      skriptLista: el('div', { class: 'anp-lista', 'data-lista': 'skript' }),
      skriptPlats: el('div', { class: 'anp-plats' }),
      skriptStatus: el('p', { class: 'anp-status', role: 'status', hidden: true }),
      skalStatus: el('p', { class: 'anp-status', role: 'status', hidden: true }),
    };
    skalKod = kodRuta({ etikett: 'CSS för AdRaze', rader: 10, platshallare: '/* Exempel: smalare flikar */\n.tab { max-width: 180px; }' });
    skalKod.ta.addEventListener('input', () => { skalSmutsig = true; });
    skalBrytare = strombrytare(false, 'Använd egen CSS för AdRaze', (pa) => sparaSkal(pa));
    const kbd = (t) => el('kbd', { text: t });
    rot.replaceChildren(...[   // (replaceChildren skriver ut null som text – därför filter)
      INKOGNITO ? el('p', { class: 'anp-not anp-not-topp' }, ikon('i-incognito'), el('span', { text: 'Det här är ett inkognitofönster. Egen CSS och skript gäller inte här, men du kan ändra dem.' })) : null,

      // Egen CSS för sajter
      el('h3', { class: 'set-h3', text: 'Egen CSS för sajter' }),
      el('p', { class: 'set-lead', text: 'Ändra hur en sajt ser ut. Gäller direkt i öppna flikar när du sparar.' }),
      delar.cssLista, delar.cssStatus, delar.cssPlats,
      el('button', { type: 'button', class: 'anp-ny', 'data-ny': 'css', onclick: () => oppnaCss(null) }, ikon('i-plus'), el('span', { text: 'Ny CSS-regel' })),

      // Egen CSS för AdRaze
      el('h3', { class: 'set-h3', text: 'Egen CSS för AdRaze' }),
      el('p', { class: 'set-lead', text: 'Ändra AdRazes eget utseende, som userChrome.css i Firefox.' }),
      el('div', { class: 'anp-varning', role: 'note' }, ikon('i-shield-alert'), el('div', null,
        el('b', { text: 'Det här kan göra AdRaze svåranvänt.' }), ' ',
        el('span', { text: 'Går något sönder: tryck ' }), kbd('Ctrl'), '+', kbd('Shift'), '+', kbd('Alt'), '+', kbd('R'),
        el('span', { text: ' eller starta AdRaze med ' }), el('code', { translate: 'no', text: '--utan-skal-css' }),
        el('span', { text: '. Då stängs din CSS för AdRaze av.' }))),
      el('div', { class: 'set-row' },
        el('div', { class: 'set-txt' }, el('div', { class: 'set-title', text: 'Använd egen CSS för AdRaze' }), el('div', { class: 'set-desc', text: 'Gäller i alla fönster utom inkognito.' })),
        skalBrytare),
      el('div', { class: 'anp-skal' }, skalKod.el,
        el('div', { class: 'anp-knappar' }, el('button', { type: 'button', class: 'set-btn anp-huvud', 'data-gor': 'spara-skal', text: 'Spara', onclick: () => sparaSkal(skalBrytare.querySelector('input').checked) }), delar.skalStatus)),

      // Användarskript
      el('h3', { class: 'set-h3', text: 'Användarskript' }),
      el('p', { class: 'set-lead', text: 'Egna skript på sajter du väljer, som Tampermonkey. Klistrar du in ett skript med // ==UserScript== fylls namn och sajter i. Lägg bara in skript du litar på: de ser allt på sajterna där de körs.' }),
      delar.skriptLista, delar.skriptStatus, delar.skriptPlats,
      el('button', { type: 'button', class: 'anp-ny', 'data-ny': 'skript', onclick: () => oppnaSkript(null) }, ikon('i-plus'), el('span', { text: 'Nytt skript' })),
      el('p', { class: 'anp-not' }, ikon('i-shield-check'), el('span', { text: 'Skripten körs isolerade: de ser sidans innehåll men inte sidans egna JavaScript, och de kommer inte åt AdRaze. Varken skript eller egen CSS körs på AdRazes egna sidor, inloggningar eller betalsidor, i inkognito eller i barnläge, och de följer aldrig med när du delar dina inställningar.' })),
    ].filter(Boolean));
  }

  /* ── Listor ── */
  function ritaListor() {
    if (byggd !== 'vanlig') return;
    const css = A.get(NYCKEL.css, []);
    const skript = A.get(NYCKEL.skript, []);
    delar.cssLista.replaceChildren(...(Array.isArray(css) ? css : []).map(cssRad));
    delar.skriptLista.replaceChildren(...(Array.isArray(skript) ? skript : []).map(skriptRad));
    if (!css.length) delar.cssLista.append(el('p', { class: 'anp-tom', text: 'Ingen egen CSS än.' }));
    if (!skript.length) delar.skriptLista.append(el('p', { class: 'anp-tom', text: 'Inga skript än.' }));
    // Den öppna regeln/skriptet togs bort någon annanstans (ångra, annat fönster): stäng redigeraren
    if (oppen && oppen.id && !(oppen.typ === 'css' ? css : skript).some((x) => x && x.id === oppen.id)) stangRedigerare();
  }
  function rad(typ, post, titel, beskrivning, vald, titelNamn) {
    const pa = post.pa !== false;
    return el('div', { class: 'set-row anp-rad' + (vald ? ' anp-vald' : '') + (pa ? '' : ' anp-av'), 'data-id': post.id },
      el('div', { class: 'set-txt' },
        el('div', { class: 'set-title', translate: titelNamn ? 'no' : null, text: titel }),
        el('div', { class: 'set-desc', translate: 'no', text: beskrivning })),
      el('button', { type: 'button', class: 'pill flex-none', 'data-gor': 'redigera', text: 'Redigera', onclick: () => (typ === 'css' ? oppnaCss(post) : oppnaSkript(post)) }),
      strombrytare(pa, (pa ? 'Stäng av ' : 'Slå på ') + titel, (nyPa, inp) => vaxla(typ, post.id, nyPa, inp, titel)));
  }
  function cssRad(r) {
    const n = radAntal(r.css);
    const omf = r.mal === '*' ? 'Varje sajt du besöker' : (r.under ? 'Med underdomäner' : 'Bara ' + r.mal);
    return rad('css', r, r.mal === '*' ? 'Alla sajter' : r.mal, omf + ' · ' + n + (n === 1 ? ' rad' : ' rader'), oppen && oppen.typ === 'css' && oppen.id === r.id, r.mal !== '*');
  }
  function skriptRad(s) {
    const m = Array.isArray(s.match) ? s.match : [];
    const sajter = m.length ? m[0] + (m.length > 1 ? ' och ' + (m.length - 1) + ' till' : '') : 'Inga sajter';
    return rad('skript', s, s.namn || 'Namnlöst skript', sajter + ' · ' + (s.tid === 'document-start' ? 'Tidigt' : 'När sidan har laddats'), oppen && oppen.typ === 'skript' && oppen.id === s.id, true);
  }
  async function vaxla(typ, id, pa, inp, titel) {
    const nyckel = typ === 'css' ? NYCKEL.css : NYCKEL.skript;
    const lista = A.get(nyckel, []).map((x) => (x && x.id === id ? { ...x, pa } : x));
    const r = await A.set(nyckel, lista, (typ === 'css' ? 'Egen CSS ' : 'Användarskript ') + (pa ? 'på: ' : 'av: ') + titel);
    if (!r || !r.ok) { inp.checked = !pa; kvittens(typ === 'css' ? delar.cssStatus : delar.skriptStatus, felText(r), 'fel'); return; }
    ritaListor();
  }

  /* ── Redigerarna ── */
  function stangRedigerare() {
    if (oppen && oppen.el) oppen.el.remove();
    oppen = null;
    if (byggd === 'vanlig') document.querySelectorAll('#anp-avancerat .anp-rad.anp-vald').forEach((r) => r.classList.remove('anp-vald'));
  }
  // Osparade ändringar kastas aldrig i tysthet: öppna inget annat förrän man sparat eller avbrutit
  function fortsatt() {
    if (!oppen || !oppen.smutsig) return true;
    visaMedd(oppen.medd, 'Spara eller avbryt ändringarna här först.', 'fel');
    try { oppen.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    return false;
  }
  // Avbryt/stäng: med osparade ändringar krävs ett andra klick
  function avbryt() {
    if (oppen && oppen.smutsig && !(oppen.slang > Date.now())) {
      oppen.slang = Date.now() + 4000;
      visaMedd(oppen.medd, 'Du har ändringar som inte är sparade. Klicka på Avbryt igen för att slänga dem.', 'varning');
      return;
    }
    stangRedigerare(); ritaListor();
  }
  function visaRedigerare(typ, id, nod, plats, medd) {
    stangRedigerare();
    oppen = { typ, id, el: nod, medd, smutsig: false };
    plats.append(nod);
    ritaListor();
    requestAnimationFrame(() => { try { nod.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {} });
  }
  // Samma post redan öppen: visa den i stället för att börja om
  function redanOppen(typ, post) {
    if (!post || !oppen || oppen.typ !== typ || oppen.id !== post.id) return false;
    try { oppen.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    return true;
  }
  function meddelande() { return el('p', { class: 'anp-medd', role: 'status', hidden: true }); }
  function visaMedd(nod, text, typ) { nod.textContent = text || ''; nod.dataset.typ = typ || 'info'; nod.hidden = !text; }

  // Egen CSS för en sajt (regel = null → ny; forslag = { mal } när man kom från en sajt)
  function oppnaCss(regel, forslag) {
    if (byggd !== 'vanlig' || redanOppen('css', regel) || !fortsatt()) return;
    const ny = !regel;
    const r = regel || { id: null, mal: (forslag && forslag.mal) || '', under: true, css: '', pa: true };
    let lage = r.mal === '*' ? 'alla' : 'sajt';
    const vard = el('input', { type: 'text', class: 'anp-in', placeholder: 'example.com', spellcheck: 'false', autocomplete: 'off', translate: 'no', 'aria-label': 'Sajt', value: r.mal === '*' ? '' : r.mal });
    const under = strombrytare(r.under !== false, 'Även underdomäner', () => {});
    const sajtFalt = el('div', { class: 'anp-falt anp-sajtfalt', hidden: lage === 'alla' },
      el('span', { class: 'anp-etikett', text: 'Sajt' }), vard,
      el('label', { class: 'anp-val' }, under, el('span', { text: 'Även underdomäner' })));
    const kod = kodRuta({ varde: r.css, etikett: 'CSS', rader: 14, platshallare: '/* Exempel */\nbody { font-size: 18px; }\n.annons { display: none !important; }' });
    const medd = meddelande();
    let t = null;
    const koll = () => { const f = klamrar(kod.get()); visaMedd(medd, f, f ? 'varning' : ''); };
    kod.ta.addEventListener('input', () => { oppen.smutsig = true; clearTimeout(t); t = setTimeout(koll, 350); });
    vard.addEventListener('input', () => { oppen.smutsig = true; });
    const spara = async () => {
      const alla = lage === 'alla';
      const mal = alla ? '*' : normVard(vard.value);
      if (!mal) { visaMedd(medd, 'Skriv en sajt, till exempel example.com.', 'fel'); vard.focus(); return; }
      const css = kod.get();
      if (css.length > MAX_CSS) { visaMedd(medd, 'CSS:en är för lång (högst 100 000 tecken).', 'fel'); return; }
      const lista = A.get(NYCKEL.css, []);
      if (lista.some((x) => x && x.id !== r.id && x.mal === mal)) { visaMedd(medd, mal === '*' ? 'Det finns redan CSS för alla sajter. Redigera den i listan.' : 'Det finns redan CSS för ' + mal + '. Redigera den i listan.', 'fel'); return; }
      const gammal = lista.find((x) => x && x.id === r.id);
      const post = { id: r.id || nyttId(), mal, under: alla ? true : under.querySelector('input').checked, css, pa: gammal ? gammal.pa !== false : true };
      const svar = await A.set(NYCKEL.css, gammal ? lista.map((x) => (x && x.id === r.id ? post : x)) : [...lista, post], 'Egen CSS: ' + (mal === '*' ? 'alla sajter' : mal));
      if (!svar || !svar.ok) { visaMedd(medd, felText(svar), 'fel'); return; }
      stangRedigerare(); ritaListor();
      kvittens(delar.cssStatus, 'Sparat. ' + (post.pa ? 'Gäller direkt i öppna flikar.' : 'Regeln är avstängd.'));
    };
    const nod = el('div', { class: 'anp-red', 'data-red': 'css', role: 'group', 'aria-label': ny ? 'Ny CSS-regel' : 'Redigera CSS' },
      el('div', { class: 'anp-red-topp' }, el('b', { text: ny ? 'Ny CSS-regel' : 'Redigera CSS' }),
        el('button', { type: 'button', class: 'anp-x', 'aria-label': 'Stäng', title: 'Stäng', onclick: avbryt }, ikon('i-close'))),
      el('div', { class: 'anp-falt' }, el('span', { class: 'anp-etikett', text: 'Gäller' }),
        seg(lage, [['sajt', 'En sajt'], ['alla', 'Alla sajter']], (v) => { lage = v; sajtFalt.hidden = v === 'alla'; oppen.smutsig = true; if (v === 'sajt') vard.focus(); })),
      sajtFalt, kod.el,
      // Sajtens egna regler vinner vid lika styrka; !important vinner alltid (huvudprocessen lägger in CSS:en även som användarens)
      el('p', { class: 'anp-hint', text: 'Vinner sajtens egen stil? Skriv !important efter värdet.' }),
      medd,
      el('div', { class: 'anp-knappar' },
        el('button', { type: 'button', class: 'set-btn anp-huvud', 'data-gor': 'spara', text: 'Spara', onclick: spara }),
        el('button', { type: 'button', class: 'set-btn', text: 'Avbryt', onclick: avbryt }),
        el('span', { class: 'anp-fyll' }),
        ny ? null : tvaSteg('Ta bort', 'Klicka igen för att ta bort', async () => {
          const svar = await A.set(NYCKEL.css, A.get(NYCKEL.css, []).filter((x) => x && x.id !== r.id), 'Tog bort egen CSS: ' + (r.mal === '*' ? 'alla sajter' : r.mal));
          if (!svar || !svar.ok) { visaMedd(medd, felText(svar), 'fel'); return; }
          stangRedigerare(); ritaListor(); kvittens(delar.cssStatus, 'Borttagen.');
        })));
    visaRedigerare('css', r.id, nod, delar.cssPlats, medd);
    koll();
    if (ny && !r.mal) vard.focus(); else kod.fokus();
  }

  // Ett användarskript (s = null → nytt)
  function oppnaSkript(s) {
    if (byggd !== 'vanlig' || redanOppen('skript', s) || !fortsatt()) return;
    const ny = !s;
    const p = s || { id: null, namn: '', match: [], exclude: [], tid: 'document-end', ramar: true, pa: true, kod: '' };
    let tid = p.tid === 'document-start' ? 'document-start' : 'document-end';
    let senasteHuvud = (lasHuvud(p.kod) || {}).text || '';
    const namn = el('input', { type: 'text', class: 'anp-in', placeholder: 'Mitt skript', spellcheck: 'false', autocomplete: 'off', translate: 'no', 'aria-label': 'Namn', value: p.namn || '', maxlength: '120' });
    const sajter = el('textarea', { class: 'anp-in anp-sajter', rows: '3', spellcheck: 'false', autocomplete: 'off', wrap: 'off', translate: 'no', 'aria-label': 'Sajter', placeholder: '*.example.com/*\n!*.example.com/konto/*' });
    sajter.value = [...(p.match || []), ...(p.exclude || []).map((x) => '!' + x)].join('\n');
    const tidSeg = seg(tid, [['document-end', 'När sidan har laddats'], ['document-start', 'Tidigt']], (v) => { tid = v; oppen.smutsig = true; });
    const ramar = strombrytare(p.ramar !== false, 'Även i inbäddade ramar', () => { oppen.smutsig = true; });
    const kod = kodRuta({ varde: p.kod, etikett: 'Skript', rader: 16, platshallare: '// ==UserScript==\n// @name   Mitt skript\n// @match  *.example.com/*\n// ==/UserScript==\n\ndocument.body.style.background = "papayawhip";' });
    const medd = meddelande(), varn = meddelande();
    const delaSajter = () => {
      const r = sajter.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      return { match: r.filter((x) => !x.startsWith('!')), exclude: r.filter((x) => x.startsWith('!')).map((x) => x.slice(1).trim()).filter(Boolean) };
    };
    // Huvudet styr fälten när det ändras (t.ex. när man klistrar in ett skript)
    const lasIn = () => {
      const h = lasHuvud(kod.get());
      visaMedd(varn, h && h.saknas.length ? 'Skriptet använder ' + h.saknas.join(', ') + ', som AdRaze inte har. Delar av det kanske inte fungerar.' : '', 'varning');
      if (!h || h.text === senasteHuvud) return;
      senasteHuvud = h.text;
      if (h.namn) namn.value = h.namn.slice(0, 120);
      if (h.match.length || h.exclude.length) sajter.value = [...h.match, ...h.exclude.map((x) => '!' + x)].join('\n');
      tid = h.tid; tidSeg.querySelectorAll('.seg-btn').forEach((b) => { b.classList.toggle('on', b.dataset.v === tid); b.setAttribute('aria-pressed', String(b.dataset.v === tid)); });
      ramar.querySelector('input').checked = h.ramar;
    };
    let tl = null, tk = null, kontrollNr = 0;
    const kontroll = async () => {
      if (!bro) return null;
      const nr = ++kontrollNr;
      const { match, exclude } = delaSajter();
      let k = null; try { k = await bro.kolla({ kod: kod.get(), match, exclude }); } catch {}
      if (nr !== kontrollNr || !k) return k;
      if (!k.ok) { visaMedd(medd, (k.rad ? 'Fel på rad ' + k.rad + ': ' : 'Fel: ') + k.fel, 'fel'); kod.markera(k.rad || 0); }
      else if (k.ogiltiga && k.ogiltiga.length) { visaMedd(medd, 'Det här mönstret går inte att använda: ' + k.ogiltiga.join(', '), 'fel'); kod.markera(0); }
      else { visaMedd(medd, ''); kod.markera(0); }
      return k;
    };
    kod.ta.addEventListener('input', () => {
      oppen.smutsig = true;
      clearTimeout(tl); tl = setTimeout(lasIn, 200);
      clearTimeout(tk); tk = setTimeout(kontroll, 700);
    });
    for (const f of [namn, sajter]) f.addEventListener('input', () => { oppen.smutsig = true; });
    sajter.addEventListener('input', () => { clearTimeout(tk); tk = setTimeout(kontroll, 700); });
    const spara = async () => {
      const { match, exclude } = delaSajter();
      const text = kod.get();
      if (!text.trim()) { visaMedd(medd, 'Skriptet är tomt.', 'fel'); kod.fokus(); return; }
      if (text.length > MAX_KOD) { visaMedd(medd, 'Skriptet är för långt (högst 300 000 tecken).', 'fel'); return; }
      if (!match.length) { visaMedd(medd, 'Skriv minst en sajt där skriptet ska köras, till exempel *.example.com/*', 'fel'); sajter.focus(); return; }
      const k = await kontroll();
      if (k && k.ogiltiga && k.ogiltiga.length) return;
      const lista = A.get(NYCKEL.skript, []);
      const gammal = lista.find((x) => x && x.id === p.id);
      const post = { id: p.id || nyttId(), namn: namn.value.trim().slice(0, 120) || 'Namnlöst skript', match: match.slice(0, 50), exclude: exclude.slice(0, 50), tid, ramar: ramar.querySelector('input').checked, pa: gammal ? gammal.pa !== false : true, kod: text };
      const svar = await A.set(NYCKEL.skript, gammal ? lista.map((x) => (x && x.id === p.id ? post : x)) : [...lista, post], 'Användarskript: ' + post.namn);
      if (!svar || !svar.ok) { visaMedd(medd, felText(svar), 'fel'); return; }
      if (k && !k.ok) {   // sparat men trasigt: låt redigeraren stå kvar så man ser felet
        p.id = post.id; oppen.id = post.id; oppen.smutsig = false; ritaListor();
        visaMedd(medd, 'Sparat, men ' + (k.rad ? 'rad ' + k.rad + ' har ett fel' : 'skriptet har ett fel') + ': ' + k.fel + ' Det körs inte förrän felet är rättat.', 'fel');
        if (k.rad) kod.gaTillRad(k.rad);
        return;
      }
      stangRedigerare(); ritaListor();
      kvittens(delar.skriptStatus, 'Sparat. ' + (post.pa ? 'Gäller från nästa gång sidan laddas.' : 'Skriptet är avstängt.'));
    };
    const nod = el('div', { class: 'anp-red', 'data-red': 'skript', role: 'group', 'aria-label': ny ? 'Nytt skript' : 'Redigera skript' },
      el('div', { class: 'anp-red-topp' }, el('b', { text: ny ? 'Nytt skript' : 'Redigera skript' }),
        el('button', { type: 'button', class: 'anp-x', 'aria-label': 'Stäng', title: 'Stäng', onclick: avbryt }, ikon('i-close'))),
      el('div', { class: 'anp-falt' }, el('span', { class: 'anp-etikett', text: 'Namn' }), namn),
      el('div', { class: 'anp-falt anp-falt-topp' }, el('span', { class: 'anp-etikett', text: 'Sajter' }),
        el('div', { class: 'anp-kol' }, sajter, el('span', { class: 'anp-hint', text: 'Ett mönster per rad. * betyder vad som helst. Börja raden med ! för att undanta sidor.' }))),
      el('div', { class: 'anp-falt' }, el('span', { class: 'anp-etikett', text: 'Körs' }), tidSeg,
        el('label', { class: 'anp-val' }, ramar, el('span', { text: 'Även i inbäddade ramar' }))),
      kod.el, varn, medd,
      el('div', { class: 'anp-knappar' },
        el('button', { type: 'button', class: 'set-btn anp-huvud', 'data-gor': 'spara', text: 'Spara', onclick: spara }),
        el('button', { type: 'button', class: 'set-btn', text: 'Avbryt', onclick: avbryt }),
        el('span', { class: 'anp-fyll' }),
        ny ? null : tvaSteg('Ta bort', 'Klicka igen för att ta bort', async () => {
          const svar = await A.set(NYCKEL.skript, A.get(NYCKEL.skript, []).filter((x) => x && x.id !== p.id), 'Tog bort användarskript: ' + (p.namn || 'skript'));
          if (!svar || !svar.ok) { visaMedd(medd, felText(svar), 'fel'); return; }
          stangRedigerare(); ritaListor(); kvittens(delar.skriptStatus, 'Borttaget.');
        })));
    visaRedigerare('skript', p.id, nod, delar.skriptPlats, medd);
    lasIn();
    if (!ny) kontroll();
    if (ny) kod.fokus(); else namn.focus({ preventScroll: true });
  }

  /* ── Egen CSS för AdRaze ── */
  function ritaSkal() {
    if (byggd !== 'vanlig') return;
    const v = A.get(NYCKEL.skal, { pa: false, css: '' }) || {};
    skalBrytare.querySelector('input').checked = !!v.pa;
    if (!skalSmutsig) skalKod.set(typeof v.css === 'string' ? v.css : '');
  }
  async function sparaSkal(pa) {
    const css = skalKod.get();
    if (css.length > MAX_CSS) { kvittens(delar.skalStatus, 'CSS:en är för lång (högst 100 000 tecken).', 'fel'); return; }
    const f = klamrar(css);
    const svar = await A.set(NYCKEL.skal, { pa: !!pa, css }, pa ? 'Egen CSS för AdRaze på' : 'Egen CSS för AdRaze av');
    if (!svar || !svar.ok) { skalBrytare.querySelector('input').checked = !pa; kvittens(delar.skalStatus, felText(svar), 'fel'); return; }
    skalSmutsig = false;
    kvittens(delar.skalStatus, f ? 'Sparat, men: ' + f : (pa ? 'Sparat och påslaget.' : 'Sparat. Din CSS för AdRaze är avstängd.'), f ? 'varning' : 'ok');
  }

  /* ── "Redigera CSS för den här sajten" (högerklicksmenyn på sidan, eller andra delar av skalet) ── */
  function redigeraCss(host) {
    if (A.barnlage()) return;
    const h = normVard(host);
    if (!h || h === '*') return;
    try { if (typeof openSettings === 'function') openSettings(); if (typeof showSettingsCat === 'function') showSettingsCat('anpassa'); } catch {}
    rita();
    if (byggd !== 'vanlig') return;
    if (!fortsatt()) return;   // osparade ändringar i en öppen redigerare går före
    const lista = A.get(NYCKEL.css, []);
    const finns = lista.find((r) => r && r.mal === h) || lista.find((r) => r && r.mal !== '*' && r.under !== false && h.endsWith('.' + r.mal));
    if (!redanOppen('css', finns)) { stangRedigerare(); oppnaCss(finns || null, finns ? null : { mal: h }); }
    requestAnimationFrame(() => { try { oppen && oppen.el.scrollIntoView({ block: 'center' }); } catch {} });
  }
  window.AnpassaAvancerat = Object.freeze({ redigeraCss });
  if (bro && bro.onRedigeraCss) bro.onRedigeraCss((host) => redigeraCss(host));

  document.addEventListener('anpassa:visa', rita);
  A.on('avancerat.', (nyckel) => {
    if (!rot || !byggd) return;
    if (nyckel === NYCKEL.skal) ritaSkal(); else ritaListor();
  });
})();
