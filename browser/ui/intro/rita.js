/* Handritat bläck för introt.
   Samma ritkod som loggan (~/adraze/logo/nya/gorilla.html: H, smooth, jit, blob, rect, rot, dot och samma frön),
   så gorillan här är pixel för pixel samma som logo-mark.svg. Bildrutorna "kokar" med st = 3, 6, 9, 12 precis som
   lev.js. Nytt är bara två lägen för munnen (stängd och gapande) och reklamlapparnas ramar i samma streck. */
(function (rot) {
  'use strict';
  const H = (n, s) => { const x = Math.sin(n * 127.1 + (s || 1) * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  function smooth(p, c) {
    const n = p.length, f = (v) => v.toFixed(1);
    if (!c) {
      let d = `M${f(p[0][0])} ${f(p[0][1])}`;
      for (let i = 1; i < n - 1; i++) { const a = p[i], b = p[i + 1]; d += ` Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`; }
      return d + ` L${f(p[n - 1][0])} ${f(p[n - 1][1])}`;
    }
    let d = `M${f((p[0][0] + p[n - 1][0]) / 2)} ${f((p[0][1] + p[n - 1][1]) / 2)}`;
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; d += ` Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`; }
    return d + 'Z';
  }
  const jit = (p, s, st, a) => p.map((q, i) => [q[0] + H(st * 7 + i * 13, s) * a, q[1] + H(st * 7 + i * 13 + 5, s + 3) * a]);
  const blob = (cx, cy, r, s, n, irr) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, rr = r * (1 + H(i * 3 + 1, s) * irr); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
  function rect(x, y, w, h, r) {
    const o = [], C = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    for (let c = 0; c < 4; c++) {
      const a = C[c], b = C[(c + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      o.push([a[0] + ux * r * .3, a[1] + uy * r * .3]);
      for (let i = 0; i < 3; i++) { const t = i / 2; o.push([a[0] + ux * r + (b[0] - a[0] - 2 * ux * r) * t, a[1] + uy * r + (b[1] - a[1] - 2 * uy * r) * t]); }
      o.push([b[0] - ux * r * .3, b[1] - uy * r * .3]);
    }
    return o;
  }
  const vrid = (p, cx, cy, dg) => { const a = dg * Math.PI / 180, c = Math.cos(a), n = Math.sin(a); return p.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * n, cy + (x - cx) * n + (y - cy) * c]); };
  const O = '#ff4b1f', I = '#1b1916', Y = '#ffd23e', F = '#3a332d', ANS = '#c9b8a0';
  const dot = (x, y, r, s) => ({ p: blob(x, y, r, s, 8, .08), c: 1, fill: I, amp: .6 });
  const oval = (cx, cy, rx, ry, s, n) => blob(0, 0, 1, s, n, .07).map(([x, y]) => [cx + x * rx, cy + y * ry]);

  /* "AD" i lappen: samma konturer (Inter Display Black) som i loggan, ritas inte om. */
  const AD_TEXT = '<g transform="rotate(-8.0 101.0 159.0) translate(86.25 159.0) scale(0.00977 -0.00977)" fill="#1b1916"><path transform="translate(0 0)" d="M0 0H455L528 245H1026L1097 0H1565L1060 1490H500ZM624 565 628 578C682 758 732 932 781 1113C829 932 878 758 930 578L934 565Z"/><path transform="translate(1565 0)" d="M662 0C1121 0 1416 292 1416 744C1416 1197 1116 1490 656 1490H80V0ZM496 344V1146H630C881 1146 996 1017 996 744C996 473 885 344 642 344Z"/></g>';
  const AD_GLYFER = AD_TEXT.replace(/^<g[^>]*>|<\/g>$/g, '');

  /* Lager 0 = den orangea klicken, 1–10 = huvudet (exakt som loggan), 11+ = munnen i olika lägen.
     Lagrets plats i listan är fröet till darret, därför står de alltid i samma ordning. */
  /* Gapande mun: rak överläpp, rund underkant (som ett D på sidan) */
  function mun(cx, top, w, djup) {
    const p = [];
    for (const t of [-.5, -.25, 0, .25, .5]) p.push([cx + t * w, top + (.25 - t * t) * 8]);
    for (const a of [.12, .3, .5, .7, .88]) p.push([cx + Math.cos(a * Math.PI) * w / 2, top + Math.sin(a * Math.PI) * djup]);
    return p;
  }

  /* lage: 'stangd' (loggan utan lapp, ler), 'gap' (käken nere, kaxiga bryn), 'logo' (exakt loggan), 'blink' (loggan, ögonen stängda) */
  function gorillaLager(lage) {
    const gap = lage === 'gap';
    const k = gap ? 7 : 0;            // käken fälls ner
    const L = [
      { p: blob(100, 104, 92, 9, 16, .06), c: 1, fill: O, amp: 2.2 },
      { p: blob(40, 106, 13, 2, 8, .06), c: 1, fill: F, w: 7, amp: 1 },
      { p: blob(160, 106, 13, 3, 8, .06), c: 1, fill: F, w: 7, amp: 1 },
      { p: [[100, 30], [128, 38], [150, 60], [160, 92], [157, 126], [146, 152 + k * .6], [124, 168 + k], [100, 173 + k], [76, 168 + k], [54, 152 + k * .6], [43, 126], [40, 92], [50, 60], [72, 38]], c: 1, fill: F, w: 8, amp: 1.6 },
      { p: [[100, 72], [120, 66], [138, 76], [142, 94], [136, 110], [148, 128], [143, 150 + k * .7], [124, 162 + k], [100, 165 + k], [76, 162 + k], [57, 150 + k * .7], [52, 128], [64, 110], [58, 94], [62, 76], [80, 66]], c: 1, fill: ANS, w: 6, amp: 1.4 },
      gap ? { p: [[62, 87], [80, 85], [100, 95], [120, 85], [138, 87]], w: 10, amp: 1 }
          : { p: [[62, 92], [80, 82], [100, 90], [120, 82], [138, 92]], w: 10, amp: 1 },
      lage === 'blink' ? { p: [[75, 102], [82, 106], [89, 102]], w: 5, amp: .4 } : dot(82, 102, 6, 1),
      lage === 'blink' ? { p: [[111, 102], [118, 106], [125, 102]], w: 5, amp: .4 } : dot(118, 102, 6, 2),
      { p: [[85, 128], [90, 114], [100, 111], [110, 114], [115, 128]], w: 6, amp: .8 },
      dot(93, 127, 3.5, 4), dot(107, 127, 3.5, 5),
    ];
    if (lage === 'stangd') L.push({ p: [[78, 147], [100, 152], [122, 147]], w: 6, amp: .8 });
    if (gap) {
      L.push({ p: mun(100, 141, 50, 26), c: 1, fill: '#2a1714', w: 6, amp: .8 });
      L.push({ p: oval(100, 160, 13, 5.5, 7, 10), c: 1, fill: '#ff6a43', amp: .5 });
    }
    if (lage === 'logo' || lage === 'blink') L.push(adLapp());
    return L;
  }
  const adLapp = () => ({ p: vrid(rect(70, 138, 62, 26, 5), 101, 151, -8), c: 1, fill: Y, w: 5, amp: .9, ad: true });

  /* Ett lager -> <path>. Stilen skrivs som i loggans färdiga SVG:er. */
  function lagerPath(l, j, st) {
    const pts = jit(l.p, j * 17 + 3, st, l.amp || 1.5);
    const streck = l.w ? `stroke:${l.stroke || I};stroke-width:${l.w}` : 'stroke:none';
    return `<path d="${smooth(pts, l.c)}" stroke-linecap="round" stroke-linejoin="round" style="fill:${l.fill || 'none'};${streck}"/>` + (l.ad ? AD_TEXT : '');
  }

  /* Reklamlappens ram i pixlar: samma rect + darr, men med fler punkter på långa sidor så att strecket
     svajar lika mycket på en bred lapp som på loggans lilla AD-lapp. */
  function ramPunkter(x, y, w, h, r, steg) {
    const o = [], C = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    for (let c = 0; c < 4; c++) {
      const a = C[c], b = C[(c + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      const n = Math.max(2, Math.round((L - 2 * r) / steg));
      o.push([a[0] + ux * r * .3, a[1] + uy * r * .3]);
      for (let i = 0; i <= n; i++) { const t = i / n; o.push([a[0] + ux * r + (L - 2 * r) * ux * t, a[1] + uy * r + (L - 2 * r) * uy * t]); }
      o.push([b[0] - ux * r * .3, b[1] - uy * r * .3]);
    }
    return o;
  }

  /* Piller (knappar i lapparna): raka sidor, halvcirklar i ändarna */
  function piller(x, y, w, h, steg) {
    const r = h / 2, o = [], n = Math.max(1, Math.round((w - h) / steg));
    for (let i = 0; i <= n; i++) o.push([x + r + (w - h) * i / n, y]);
    for (let i = 1; i < 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI; o.push([x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]); }
    for (let i = 0; i <= n; i++) o.push([x + w - r - (w - h) * i / n, y + h]);
    for (let i = 1; i < 6; i++) { const a = Math.PI / 2 + i / 6 * Math.PI; o.push([x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]); }
    return o;
  }

  /* Stjärnsmäll (rea-lappen) */
  function stjarna(cx, cy, r1, r2, n) {
    const o = [];
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return o;
  }

  rot.IntroRita = { H, smooth, jit, blob, rect, vrid, oval, gorillaLager, adLapp, lagerPath, ramPunkter, piller, stjarna, AD_TEXT, AD_GLYFER, FARG: { O, I, Y, F, ANS } };
})(typeof window !== 'undefined' ? window : globalThis);
