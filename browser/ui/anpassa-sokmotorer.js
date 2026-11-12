// Anpassa → egna sökmotorer och snabbord, skalets del (nycklarna registreras i ../anpassa-sokmotorer.js).
//  • Snabbord: "yt katter" söker på YouTube. Gäller bara när snabbordet är FÖRSTA ordet, följt av mellanslag och
//    mer text – "yt", "ytkatter" och "katter yt" är vanliga sökningar som förut.
//  • En egen sökmotor kan vara standard i stället för den inbyggda (Inställningar → Sökmotor eller → Anpassa).
//  • Barnläge: inget av det här används. Barnet söker med den inbyggda sökmotorn precis som förut.
//  • Privata flikar: snabbord fungerar (du väljer själv sajten), men standard är alltid AdRaze Search.
// Skalet frågar via window.AnpassaSok (krokar i shell.js: searchUrl, motorEtikett, localSug, renderSug, updateSug,
// renderEngines). Laddas före shell.js; skalets tillstånd (famLocked, account …) läses först när någon söker.
(function () {
  const A = window.Anpassa; if (!A) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tx = (x, v) => (typeof window.t === 'function' ? window.t(x, v) : (v ? String(x).replace(/\{([a-z]\w*)\}/g, (m, n) => (v[n] != null ? String(v[n]) : m)) : x));
  const toast = (m) => { try { if (typeof showToast === 'function') showToast(m); } catch {} };
  const SNABB_RE = /^[\p{L}\p{N}@._+-]{1,20}$/u;
  const MAX = 60;

  /* ── Läsa (värdet kan komma från en äldre version eller vara trasigt: rensa alltid) ── */
  function giltigUrl(u) { return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(u) && u.includes('%s') && u.length <= 2000; }
  function motorer() {
    const v = A.get('sok.egna'); const ut = []; const ord = new Set();
    for (const m of Array.isArray(v) ? v : []) {
      if (!m || typeof m !== 'object') continue;
      const url = String(m.url || '').trim(), namn = String(m.namn || '').trim().slice(0, 40);
      if (!namn || !giltigUrl(url)) continue;
      let sb = String(m.snabbord || '').trim().toLowerCase();
      if (sb && (!SNABB_RE.test(sb) || ord.has(sb))) sb = '';
      if (sb) ord.add(sb);
      ut.push({ id: String(m.id || namn), namn, url, snabbord: sb });
      if (ut.length >= MAX) break;
    }
    return ut;
  }
  // Barnläge i det här fönstret (skalets tillstånd), eller i något annat fönster (huvudprocessen, högst var 3:e sekund)
  let barnTid = 0, barnSvar = false;
  function barn() {
    try { if (typeof famLocked === 'function' && famLocked()) return true; } catch {}
    try { if (typeof account !== 'undefined' && account && account.isChild) return true; } catch {}
    try { if (typeof famActive === 'function' && famActive()) return true; } catch {}
    const nu = Date.now();
    if (nu - barnTid > 3000) { barnTid = nu; try { barnSvar = !!A.barnlage(); } catch { barnSvar = false; } }
    return barnSvar;
  }
  function standardMotor() {
    if (barn()) return null;
    const id = A.get('sok.standard'); if (!id) return null;
    return motorer().find((m) => m.id === id) || null;
  }
  const sokUrl = (m, q) => m.url.split('%s').join(encodeURIComponent(q));
  // "yt katter" → { motor: YouTube, rest: "katter" }. Snabbordet måste vara första ordet och följas av mer text.
  function traff(text) {
    const m = /^(\S+)\s+(\S[\s\S]*)$/.exec(String(text || '').trim()); if (!m) return null;
    const ord = m[1].toLowerCase();
    const motor = motorer().find((x) => x.snabbord && x.snabbord === ord);
    return motor ? { motor, rest: m[2].trim() } : null;
  }
  const varden = (u) => { try { return new URL(u.replace(/%s/g, 'x')).hostname.replace(/^www\./, ''); } catch { return ''; } };
  // Tjänster som skalet kan hämta sökförslag från (SUGGEST_URLS i main.js)
  const LEVERANTOR = [[/(^|\.)duckduckgo\.com$/, 'duckduckgo'], [/^search\.brave\.com$/, 'brave'], [/(^|\.)startpage\.com$/, 'startpage'],
    [/^search\.adraze\.app$/, 'adraze'], [/(^|\.)google\.[a-z.]+$/, 'google']];

  /* ── Det skalet frågar efter ── */
  window.AnpassaSok = {
    // searchUrl(): adressen för ett snabbord eller den egna standardsökmotorn, annars null (= den inbyggda)
    url(q, privat) {
      if (barn()) return null;
      const t = traff(q); if (t) return sokUrl(t.motor, t.rest);
      if (privat) return null;
      const m = standardMotor(); return m ? sokUrl(m, String(q || '').trim()) : null;
    },
    // Namnet i adressfältet (null = den inbyggda)
    etikett(privat) { if (privat) return null; const m = standardMotor(); return m ? m.namn : null; },
    // Första förslaget när ett snabbord skrivs: "Sök på YouTube: katter"
    forslag(query) {
      if (barn()) return null;
      const t = traff(query); if (!t) return null;
      return { search: true, kind: 'snabbord', q: String(query || '').trim(), motor: t.motor.namn, sokord: t.rest };
    },
    rad(it) { return '<span class="sdim">' + esc(tx('Sök på {motor}:', { motor: it.motor })) + '</span> <span class="stext">' + esc(it.sokord) + '</span>'; },
    // Sökförslagen från nätet (null = inga): inga för snabbord, och med en egen standardsökmotor bara från
    // samma tjänst – det du skriver skickas aldrig till någon annan än den du valt att söka hos
    forslagsMotor(query, inbyggd) {
      if (barn()) return inbyggd;
      if (traff(query)) return null;
      const m = standardMotor(); if (!m) return inbyggd;
      const v = varden(m.url); const l = LEVERANTOR.find(([re]) => re.test(v));
      return l ? l[1] : null;
    },
    // Inställningar → Sökmotor: de egna sökmotorerna under de inbyggda (renderEngines anropar sist)
    motorlista: ritaMotorlista,
    // En inbyggd sökmotor valdes (listan, assistenten, Återställ): den egna slutar vara standard
    inbyggd() { if (A.get('sok.standard')) A.set('sok.standard', undefined, tx('Standardsökmotor')); },
  };

  /* ── Inställningar → Sökmotor (#engine-list) ── */
  function ritaMotorlista(lista) {
    if (!lista || barn()) return;
    const std = standardMotor();
    // Väljer du en inbyggd sökmotor slutar den egna vara standard
    lista.querySelectorAll('.engine-opt').forEach((el) => {
      if (std) el.classList.remove('on');
      el.addEventListener('click', () => window.AnpassaSok.inbyggd());
    });
    // Egna som bara upprepar en inbyggd (DuckDuckGo, Startpage, Brave Search bland förslagen) visas inte två gånger här
    let inbyggda = new Set();
    try { inbyggda = new Set(Object.values(ENGINES).map((e) => varden(e.url + 'x'))); } catch {}
    const ms = motorer().filter((m) => (std && std.id === m.id) || !inbyggda.has(varden(m.url)));
    if (!ms.length) return;
    const rubrik = document.createElement('div'); rubrik.className = 'anpk-motorrubrik'; rubrik.textContent = tx('Egna sökmotorer');
    lista.appendChild(rubrik);
    for (const m of ms) {
      const el = document.createElement('div'); el.className = 'engine-opt' + (std && std.id === m.id ? ' on' : '');
      el.innerHTML = '<span class="engine-radio"></span><span class="anpk-mnamn" translate="no">' + esc(m.namn) + '</span>' + (m.snabbord ? '<span class="anpk-chip" title="' + esc(tx('Snabbord')) + '">' + esc(m.snabbord) + '</span>' : '');
      el.addEventListener('click', () => valjStandard(m.id));
      lista.appendChild(el);
    }
  }
  async function valjStandard(id) {
    const r = await A.set('sok.standard', id || undefined, tx('Standardsökmotor'));
    if (r && r.error === 'barnlast') toast(tx('Låst i barnläge.'));
  }
  // Etiketten i adressfältet och listorna följer butiken (även ändringar från ett annat fönster)
  function efterAndring() {
    try { const t = typeof active !== 'undefined' ? active : null; const el = $('search-engine'); if (t && el && typeof motorEtikett === 'function') el.textContent = t.incognito ? INCOG_ENGINE.label : motorEtikett(); } catch {}
    try { const sp = document.querySelector('#settings .set-panel[data-cat="sok"]'); if (sp && !sp.classList.contains('hidden') && typeof renderEngines === 'function') renderEngines(); } catch {}
    if (host && host.offsetParent) rita();
  }
  A.on('sok.', efterAndring);

  /* ── Inställningar → Anpassa (#anp-sokmotorer) ── */
  const host = $('anp-sokmotorer');
  let forslagLista = null;
  function forslag() {   // förslagen = standardvärdet för sok.egna (en enda lista, i huvudprocessen)
    if (!forslagLista) { try { const r = window.anpassaBro.alla().register['sok.egna']; forslagLista = Array.isArray(r && r.standard) ? r.standard : []; } catch { forslagLista = []; } }
    return forslagLista;
  }
  async function spara(lista, etikett) {
    const r = await A.set('sok.egna', lista, etikett);
    if (r && r.error === 'barnlast') toast(tx('Låst i barnläge.'));
    return !!(r && r.ok);
  }
  function kollaSnabbord(ord, utomId) {
    if (!ord) return '';
    if (!SNABB_RE.test(ord)) return tx('Snabbordet får bara ha bokstäver, siffror och . _ - + @ (inga mellanslag).');
    const krock = motorer().find((m) => m.snabbord === ord && m.id !== utomId);
    return krock ? tx('Snabbordet används redan av {namn}.', { namn: krock.namn }) : '';
  }
  const nyttId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function rita() {
    if (!host) return;
    const last = barn();
    const ms = motorer(); const std = standardMotor();
    const finns = new Set(ms.map((m) => m.url));
    const saknas = forslag().filter((f) => !ms.some((m) => m.id === f.id) && !finns.has(f.url));
    host.innerHTML = '<h3 class="set-h3">' + esc(tx('Egna sökmotorer')) + '</h3>'
      + '<p class="set-lead" translate="no">' + esc(tx('Sök direkt på en sajt: skriv snabbordet först i adressfältet, till exempel {a} eller {b}.')).replace('{a}', '<b>yt katter</b>').replace('{b}', '<b>w Stockholm</b>') + '</p>'
      + (last ? '<p class="anp-not">' + esc(tx('Barnläge: egna sökmotorer och snabbord används inte. Sökningar går till den vanliga sökmotorn.')) + '</p>' : '')
      + '<div class="anpk-lista"></div>'
      + '<div class="anpk-ny"><div class="anpk-ny-t">' + esc(tx('Lägg till en sökmotor')) + '</div>'
      + '<div class="anpk-falt">'
      + '<label><span>' + esc(tx('Namn')) + '</span><input id="anpk-namn" type="text" maxlength="40" spellcheck="false" autocomplete="off" placeholder="' + esc(tx('t.ex. Tradera')) + '"></label>'
      + '<label class="anpk-url"><span>' + esc(tx('Adress, med %s där sökorden ska stå')) + '</span><input id="anpk-url" type="text" spellcheck="false" autocomplete="off" placeholder="https://www.tradera.com/search?q=%s"></label>'
      + '<label class="anpk-ordf"><span>' + esc(tx('Snabbord')) + '</span><input id="anpk-ord" type="text" maxlength="20" spellcheck="false" autocomplete="off" placeholder="tr"></label>'
      + '</div><div class="anpk-ny-fot"><p class="anpk-fel" id="anpk-fel" role="alert"></p><button type="button" class="set-btn" id="anpk-lagg">' + esc(tx('Lägg till')) + '</button></div></div>'
      + (saknas.length ? '<div class="anpk-forslag"><span>' + esc(tx('Förslag')) + '</span>' + saknas.map((f) => '<button type="button" class="anpk-fchip" data-id="' + esc(f.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' + esc(f.namn) + '</button>').join('') + '</div>' : '');
    const box = host.querySelector('.anpk-lista');
    if (!ms.length) box.innerHTML = '<p class="anps-tom">' + esc(tx('Inga egna sökmotorer. Lägg till en nedan.')) + '</p>';
    for (const m of ms) {
      const arStd = !!(std && std.id === m.id);
      const rad = document.createElement('div'); rad.className = 'set-row anpk-rad'; rad.dataset.id = m.id;
      rad.innerHTML = '<span class="anps-ikon" aria-hidden="true">' + esc(m.namn.charAt(0)) + '</span>'
        + '<div class="set-txt"><div class="set-title"><span translate="no">' + esc(m.namn) + '</span>' + (arStd ? ' <span class="set-chip">' + esc(tx('Standard')) + '</span>' : '') + '</div>'
        + '<div class="set-desc">' + esc(varden(m.url)) + '</div></div>'
        + '<label class="anpk-snabb" title="' + esc(tx('Snabbord: skriv det först i adressfältet')) + '"><span>' + esc(tx('Snabbord')) + '</span>'
        + '<input type="text" maxlength="20" spellcheck="false" autocomplete="off" value="' + esc(m.snabbord) + '" aria-label="' + esc(tx('Snabbord för {namn}', { namn: m.namn })) + '"></label>'
        + '<button type="button" class="anpk-std' + (arStd ? ' on' : '') + '" aria-pressed="' + arStd + '">' + esc(arStd ? tx('Standard') : tx('Gör till standard')) + '</button>'
        + '<button type="button" class="anpk-bort" title="' + esc(tx('Ta bort')) + '" aria-label="' + esc(tx('Ta bort {namn}', { namn: m.namn })) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
      const inp = rad.querySelector('.anpk-snabb input');
      inp.addEventListener('change', async () => {
        const ord = inp.value.trim().toLowerCase(); const fel = kollaSnabbord(ord, m.id);
        if (fel) { inp.classList.add('fel'); toast(fel); inp.value = m.snabbord; return; }
        inp.classList.remove('fel');
        await spara(motorer().map((x) => (x.id === m.id ? { ...x, snabbord: ord } : x)), tx('Snabbord för {namn}', { namn: m.namn }));
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      rad.querySelector('.anpk-std').addEventListener('click', () => valjStandard(arStd ? undefined : m.id));
      rad.querySelector('.anpk-bort').addEventListener('click', async () => {
        const ok = await spara(motorer().filter((x) => x.id !== m.id), tx('Ta bort {namn}', { namn: m.namn }));
        if (ok && A.get('sok.standard') === m.id) await A.set('sok.standard', undefined, tx('Standardsökmotor'));
      });
      box.appendChild(rad);
    }
    const fel = $('anpk-fel');
    $('anpk-lagg').addEventListener('click', async () => {
      const namn = $('anpk-namn').value.trim(), url = $('anpk-url').value.trim(), ord = $('anpk-ord').value.trim().toLowerCase();
      let f = '';
      if (!namn) f = tx('Skriv ett namn.');
      else if (!/^https?:\/\//i.test(url)) f = tx('Adressen ska börja med https://');
      else if (!url.includes('%s')) f = tx('Skriv %s där sökorden ska stå i adressen.');
      else if (!giltigUrl(url)) f = tx('Adressen ser inte rätt ut.');
      else f = kollaSnabbord(ord, null);
      if (!f && motorer().length >= MAX) f = tx('Du har redan många sökmotorer. Ta bort någon först.');
      fel.textContent = f;
      if (f) return;
      if (await spara([...motorer(), { id: nyttId(), namn, url, snabbord: ord }], tx('Lägg till {namn}', { namn }))) toast(tx('{namn} tillagd', { namn }));
    });
    host.querySelectorAll('.anpk-fchip').forEach((b) => b.addEventListener('click', async () => {
      const f = forslag().find((x) => x.id === b.dataset.id); if (!f) return;
      const ledigt = !kollaSnabbord(f.snabbord, null);
      await spara([...motorer(), { ...f, snabbord: ledigt ? f.snabbord : '' }], tx('Lägg till {namn}', { namn: f.namn }));
    }));
    if (last) host.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  }
  document.addEventListener('anpassa:visa', rita);
})();
