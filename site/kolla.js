// Kolla en sajt: skickar länken till api.adraze.app/kolla, följer stegen och ritar upp resultatet.
// Resultatet får en egen adress (?id=…) så att det kan delas.
(() => {
  const sida = document.getElementById('kolla');
  const API = sida.dataset.api;
  const d = sida.dataset;
  const lang = d.lang || 'sv';
  const tal = new Intl.NumberFormat(lang);
  const dec = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const $ = (id) => document.getElementById(id);
  const fyll = (mall, varden) => mall.replace(/\{(\w+)\}/g, (_, k) => (k in varden ? varden[k] : ''));
  const ikon = (namn) => document.getElementById('ko-ikoner').content.querySelector(`[data-i="${namn}"]`)?.innerHTML || '';
  const form = $('ko-form'), falt = $('ko-url'), felRuta = $('ko-fel');
  let timer = null;

  // data-e-finns_inte blir dataset.eFinns_inte
  function felText(kod) { return d[`e${kod[0].toUpperCase()}${kod.slice(1)}`] || d.eOkant; }

  async function starta(adress) {
    felRuta.hidden = true;
    clearTimeout(timer);
    let svar;
    try {
      const r = await fetch(`${API}/kolla`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: adress }) });
      svar = await r.json();
    } catch { svar = { ok: false, fel: 'okant' }; }
    if (!svar.ok) { felRuta.textContent = felText(svar.fel || 'okant'); felRuta.hidden = false; return; }
    history.replaceState(null, '', `?id=${svar.id}`);
    folj(svar.id, true);
  }

  async function folj(id, rulla) {
    let j;
    try {
      const r = await fetch(`${API}/kolla/r/${encodeURIComponent(id)}`);
      j = await r.json();
    } catch { j = null; }
    if (!j || !j.ok) {
      $('ko-kor').hidden = true;
      felRuta.textContent = felText(j?.fel || 'okant'); felRuta.hidden = false;
      return;
    }
    if (j.status === 'klar') return visaResultat(j, rulla);
    if (j.status === 'fel') { $('ko-kor').hidden = true; felRuta.textContent = felText(j.fel || 'okant'); felRuta.hidden = false; return; }
    visaSteg(j);
    if (rulla) $('ko-kor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    timer = setTimeout(() => folj(id, false), 1500);
  }

  const ORDNING = ['listor', 'utan', 'med'];
  function visaSteg(j) {
    $('ko-res').hidden = true;
    $('ko-kor').hidden = false;
    $('ko-kor-vard').textContent = j.host;
    const nu = ORDNING.indexOf(j.steg);
    document.querySelectorAll('.ko-steg li').forEach((li, i) => {
      li.classList.toggle('klar', nu > i);
      li.classList.toggle('pa', nu === i);
    });
    $('ko-kor-not').textContent = j.status === 'ko' && j.plats > 0 ? fyll(d.tQueue, { n: j.plats }) : $('ko-kor-not').dataset.vanlig || $('ko-kor-not').textContent;
  }

  function cell(tr, i, html) { tr.querySelectorAll('td')[i].innerHTML = html; }
  function visaResultat(j, rulla) {
    $('ko-kor').hidden = true;
    $('ko-res').hidden = false;
    falt.value = j.host;
    const vard = j.slutadress ? new URL(j.slutadress).hostname : j.host;
    $('ko-vard').textContent = vard;

    // Motorerna
    const sak = j.motorer.filter((m) => m.typ === 'sakerhet');
    const rek = j.motorer.filter((m) => m.typ === 'reklam');
    const flaggade = sak.filter((m) => m.resultat === 'flaggad').length;
    const svarade = sak.filter((m) => m.resultat !== 'okand').length;
    const rita = (lista, ul) => {
      ul.innerHTML = '';
      for (const m of lista) {
        const li = document.createElement('li');
        li.className = m.resultat;
        const namn = document.createElement('span'); namn.textContent = m.namn;
        const b = document.createElement('b');
        b.innerHTML = (m.resultat === 'okand' ? '' : ikon(m.resultat)) + ({ ren: d.tClean, flaggad: d.tFlagged }[m.resultat] || d.tUnknown);
        li.append(namn, b);
        ul.append(li);
      }
    };
    rita(sak, $('ko-motorer-sakerhet'));
    rita(rek, $('ko-motorer-reklam'));
    const summa = $('ko-motor-summa');
    summa.textContent = flaggade ? fyll(d.tEngines, { n: flaggade, m: svarade }) : d.tEnginesClean;
    summa.classList.toggle('flaggad', flaggade > 0);

    // Farlig sida: inga bilder eller mätningar, den öppnades aldrig
    const farlig = !j.oppnad;
    $('ko-farlig').hidden = !farlig;
    $('ko-topp').hidden = farlig;
    $('ko-bilder').hidden = farlig;
    $('ko-siffror').hidden = farlig;
    if (farlig) {
      $('ko-farlig-text').textContent = fyll(d.tDanger, { n: flaggade, m: svarade });
    } else {
      const u = j.utan, m = j.med;
      const b = $('ko-betyg');
      b.dataset.b = j.betyg;
      $('ko-betyg-b').textContent = j.betyg;
      const n = u.reklam + u.sparare;
      $('ko-sammanfattning').textContent = n <= 2 ? d.tGradeClean : fyll(d.tGrade, { n: tal.format(n) });
      $('ko-godkande').hidden = !u.godkande;
      $('ko-bild-utan').src = `${API}/kolla/bild/${j.id}/utan.jpg`;
      const med = $('ko-bild-med');
      med.closest('figure').hidden = !m;
      if (m) med.src = `${API}/kolla/bild/${j.id}/med.jpg`;
      const MB = (x) => `${dec.format(x / 1e6)}<small>MB</small>`;
      const S = (x) => `${dec.format(x / 1000)}<small>s</small>`;
      const visa = { reklam: tal.format, sparare: tal.format, kakor: tal.format, tredjeparter: tal.format, forfragningar: tal.format, bytes: MB, laddtid: S };
      document.querySelectorAll('#ko-siffror tbody tr').forEach((tr) => {
        const k = tr.dataset.rad;
        cell(tr, 0, visa[k](u[k]));
        cell(tr, 1, m ? visa[k](m[k]) : '–');
      });
    }
    if (rulla) $('ko-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = falt.value.trim();
    if (!v) { falt.focus(); return; }
    starta(v);
  });
  document.querySelectorAll('[data-exempel]').forEach((b) => b.addEventListener('click', () => { falt.value = b.dataset.exempel; starta(b.dataset.exempel); }));
  $('ko-igen').addEventListener('click', () => {
    clearTimeout(timer);
    history.replaceState(null, '', location.pathname);
    $('ko-res').hidden = true;
    falt.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => falt.focus(), 400);
  });
  const dela = $('ko-dela');
  const delaText = dela.textContent;
  dela.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { return; }
    dela.textContent = d.tCopied;
    setTimeout(() => { dela.textContent = delaText; }, 1800);
  });

  $('ko-kor-not').dataset.vanlig = $('ko-kor-not').textContent;
  const id = new URLSearchParams(location.search).get('id');
  if (id && /^[a-z0-9]{6,12}$/.test(id)) folj(id, true);
})();
