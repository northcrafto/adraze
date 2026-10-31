// Jordklotet (samma stil som nappis.se): ljus glob med exakta landkonturer, D3 orthographic på canvas.
// Länder där sajten finns på landets eget språk är tonade orange; hovra för att se språket, klicka för att byta.
// Snurrar långsamt, går att dra, pausas när det inte syns och står still vid "minska rörelser".
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoContains } from 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
import { feature, mesh } from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';

const canvas = document.getElementById('klot');
if (canvas) start();

async function start() {
  const ISO = {"242":"FJ","834":"TZ","732":"EH","124":"CA","840":"US","398":"KZ","860":"UZ","598":"PG","360":"ID","32":"AR","152":"CL","180":"CD","706":"SO","404":"KE","729":"SD","148":"TD","332":"HT","214":"DO","643":"RU","44":"BS","238":"FK","578":"NO","304":"GL","260":"TF","626":"TL","710":"ZA","426":"LS","484":"MX","858":"UY","76":"BR","68":"BO","604":"PE","170":"CO","591":"PA","188":"CR","558":"NI","340":"HN","222":"SV","320":"GT","84":"BZ","862":"VE","328":"GY","740":"SR","250":"FR","218":"EC","630":"PR","388":"JM","192":"CU","716":"ZW","72":"BW","516":"NA","686":"SN","466":"ML","478":"MR","204":"BJ","562":"NE","566":"NG","120":"CM","768":"TG","288":"GH","384":"CI","324":"GN","624":"GW","430":"LR","694":"SL","854":"BF","140":"CF","178":"CG","266":"GA","226":"GQ","894":"ZM","454":"MW","508":"MZ","748":"SZ","24":"AO","108":"BI","376":"IL","422":"LB","450":"MG","275":"PS","270":"GM","788":"TN","12":"DZ","400":"JO","784":"AE","634":"QA","414":"KW","368":"IQ","512":"OM","548":"VU","116":"KH","764":"TH","418":"LA","104":"MM","704":"VN","408":"KP","410":"KR","496":"MN","356":"IN","50":"BD","64":"BT","524":"NP","586":"PK","4":"AF","762":"TJ","417":"KG","795":"TM","364":"IR","760":"SY","51":"AM","752":"SE","112":"BY","804":"UA","616":"PL","40":"AT","348":"HU","498":"MD","642":"RO","440":"LT","428":"LV","233":"EE","276":"DE","100":"BG","300":"GR","792":"TR","8":"AL","191":"HR","756":"CH","442":"LU","56":"BE","528":"NL","620":"PT","724":"ES","372":"IE","540":"NC","90":"SB","554":"NZ","36":"AU","144":"LK","156":"CN","158":"TW","380":"IT","208":"DK","826":"GB","352":"IS","31":"AZ","268":"GE","608":"PH","458":"MY","96":"BN","705":"SI","246":"FI","703":"SK","203":"CZ","232":"ER","392":"JP","600":"PY","887":"YE","682":"SA","10":"AQ","196":"CY","504":"MA","818":"EG","434":"LY","231":"ET","262":"DJ","800":"UG","646":"RW","70":"BA","807":"MK","688":"RS","499":"ME","780":"TT","728":"SS"};
  // landnummer (ISO 3166 numeriskt) -> sajtens språk
  const SPRAK = { sv: [752], nb: [578], da: [208], fi: [246], is: [352], de: [276, 40, 756], nl: [528, 56], fr: [250],
    es: [724, 484, 32, 170, 152, 604, 862, 218, 68, 600, 858, 192, 320, 340, 222, 558, 188, 591, 214], pt: [620, 76, 24, 508],
    it: [380], pl: [616], cs: [203], sk: [703], hu: [348], ro: [642, 498], bg: [100], el: [300, 196], hr: [191], sl: [705],
    et: [233], lv: [428], lt: [440], uk: [804], tr: [792], en: [826, 840, 124, 36, 554, 372] };
  const LAND_SPRAK = {}; for (const k in SPRAK) for (const n of SPRAK[k]) LAND_SPRAK[n] = k;
  const sida = document.documentElement.lang || 'sv';
  const regionNamn = (() => { try { return new Intl.DisplayNames([sida], { type: 'region' }); } catch { return null; } })();
  const sprakNamn = (k) => { try { const n = new Intl.DisplayNames([k], { type: 'language' }).of(k); return n[0].toUpperCase() + n.slice(1); } catch { return k; } };

  const stage = canvas.parentNode;
  const ctx = canvas.getContext('2d');
  const proj = geoOrthographic().precision(0.5);
  const path = geoPath(proj, ctx);
  const grat = geoGraticule10();
  const HEM = [18.07, 59.33];
  const stilla = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rot = [-15, -48, 0], storlek = 0, dpr = 1, drag = null, rordes = false, hover = null, synlig = true, lander = [], granser = null, prickar = [];

  const tips = document.createElement('div'); tips.className = 'klot-tips'; tips.hidden = true; stage.appendChild(tips);

  function matt() {
    dpr = Math.min(devicePixelRatio || 1, 2); storlek = canvas.clientWidth;
    canvas.width = canvas.height = Math.round(storlek * dpr);
    proj.translate([storlek / 2, storlek / 2]).scale(storlek / 2 - 2); rita();
  }
  const syns = (p) => geoDistance(p, [-rot[0], -rot[1]]) < Math.PI / 2;

  function rita() {
    if (!storlek) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, storlek, storlek); proj.rotate(rot);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(17,17,19,.07)'; ctx.lineWidth = 0.6; ctx.stroke();
    if (lander.length) {
      ctx.beginPath(); lander.forEach((f) => path(f)); ctx.fillStyle = 'rgba(17,17,19,.05)'; ctx.fill();
      if (hover) { ctx.beginPath(); path(hover); ctx.fillStyle = 'rgba(255,75,31,.18)'; ctx.fill(); }
      ctx.beginPath(); path(granser); ctx.strokeStyle = 'rgba(17,17,19,.55)'; ctx.lineWidth = 0.9; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(17,17,19,.14)'; ctx.lineWidth = 1; ctx.stroke();
    // små orange prickar utspridda över hela världen (samma ställen varje gång)
    const pr = Math.max(storlek / 520, 1.15);
    ctx.beginPath();
    for (const p of prickar) { if (!syns(p)) continue; const [x, y] = proj(p); ctx.moveTo(x + pr, y); ctx.arc(x, y, pr, 0, 7); }
    ctx.fillStyle = 'rgba(255,75,31,.85)'; ctx.fill();
    if (syns(HEM)) {
      const [x, y] = proj(HEM), r = Math.max(storlek / 210, 2.6);
      ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fillStyle = 'rgba(255,75,31,.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#ff4b1f'; ctx.fill();
    }
  }

  function landVid(x, y) {
    const p = proj.invert([x, y]); if (!p || isNaN(p[0]) || !syns(p)) return null;
    return lander.find((f) => geoContains(f, p)) || null;
  }
  function visaTips(f, x, y) {
    const namn = (regionNamn && f.iso && regionNamn.of(f.iso)) || f.properties.name;
    tips.innerHTML = '<b></b><span></span>'; tips.firstChild.textContent = namn;
    tips.lastChild.textContent = 'AdRaze · ' + sprakNamn(f.sprak || 'en');
    tips.hidden = false;
    tips.style.left = Math.max(8, Math.min(x + 14, storlek - tips.offsetWidth - 8)) + 'px';
    tips.style.top = Math.max(8, y - tips.offsetHeight - 12) + 'px';
  }

  canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; rordes = false; tips.hidden = true; try { canvas.setPointerCapture(e.pointerId); } catch {} });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag) {
      const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY];
      if (Math.abs(dx) + Math.abs(dy) > 2) rordes = true;
      rot[0] += dx * 0.3; rot[1] = Math.max(-90, Math.min(90, rot[1] - dy * 0.3)); rita(); return;
    }
    if (e.pointerType !== 'mouse') return;
    const f = landVid(x, y);
    if (f !== hover) { hover = f; canvas.style.cursor = f && f.sprak ? 'pointer' : ''; rita(); }
    if (f) visaTips(f, x, y); else tips.hidden = true;
  });
  const slapp = () => { drag = null; };
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !rordes && e.pointerType === 'mouse' && hover && hover.sprak && hover.sprak !== sida)
      location.href = hover.sprak === 'sv' ? '/' : '/' + hover.sprak + '/';
    slapp();
  });
  canvas.addEventListener('pointercancel', slapp);
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; rita(); } tips.hidden = true; });
  new IntersectionObserver(([e]) => { synlig = e.isIntersecting; }, { threshold: 0.05 }).observe(canvas);
  new ResizeObserver(matt).observe(canvas); matt();

  try {
    const varld = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')).json();
    lander = feature(varld, varld.objects.countries).features;
    lander.forEach((f) => { const n = +f.id; f.iso = ISO[n]; f.sprak = LAND_SPRAK[n]; });
    granser = mesh(varld, varld.objects.countries);
    // ~230 prickar slumpade inuti land (seedat, så de ligger still mellan besök)
    let fro = 7; const slump = () => ((fro = (fro * 16807) % 2147483647) / 2147483647);
    const bebott = lander.filter((f) => f.id !== '010' && f.id !== '304');
    for (let forsok = 0; prickar.length < 230 && forsok < 40000; forsok++) {
      const p = [slump() * 360 - 180, Math.asin(slump() * 1.7 - 0.85) * 180 / Math.PI];
      if (bebott.some((f) => geoContains(f, p))) prickar.push(p);
    }
  } catch {}
  canvas.classList.add('klar'); rita();
  if (stilla) return;
  (function loop() {
    requestAnimationFrame(loop);
    if (drag || hover || !synlig || document.hidden) return;
    rot[0] += 0.12; rita();
  })();
}
