// Gorillan i tomteluva (julvarianten av loggan). Luvan ritas med samma penna som gorillan – ritkoden i
// ../nya/gorilla.html: ojämn bläcklinje, platta färger – och gorillan själv är oförändrad (samma darr som loggan).
//   node luva.js && python3 luva.py
// B = loggan med AD-lapp (nya fliken). A = den enkla gorillan (blockerarknappen) med knubbigare luva som håller i 18 px.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../nya/gorilla.html', 'utf8');
const js = html.split('<script>')[1].split('const g=document')[0];
const { IDEER, smooth, jit, blob } = new Function(js + 'return {IDEER, smooth, jit, blob};')();
const INK = '#1b1916', ROD = '#c21c2b', VIT = '#f4efe6';   // bläck, luvans röda, papper (pälskant och tofs)

// Luvan ritas i sin egen ram: origo mitt i pälskanten, x längs kanten, y nedåt. stall() sätter den på huvudet:
// lite på sned (vinkel), så kanten sitter lägre över ena ögonbrynet och struten lutar åt samma håll.
const stall = ({ x, y, vinkel }) => { const a = vinkel * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
  return (p) => p.map(([u, v]) => [x + u * c - v * n, y + u * n + v * c]); };

// Pälskanten: ett band som följer hjässan (ändarna hänger `bage` lägre än mitten), ojämna bulor (`bul` = hur
// mycket) och runda ändar som sticker ut utanför huvudet på båda sidor.
function kant(W, T, bage, bul) {
  const yc = (x) => bage * (x / W) * (x / W), h = T / 2, e = yc(W);
  const upp = [[-1, .6], [-.66, 3.2], [-.36, -1.2], [-.02, 3.6], [.32, -.9], [.66, 2.8], [1, .6]].map(([k, b]) => [k * W, yc(k * W) - h - b * bul]);
  const ned = [[1, .6], [.7, 2.1], [.4, -1], [.06, 2.5], [-.3, -.7], [-.64, 1.9], [-1, .6]].map(([k, b]) => [k * W, yc(k * W) + h + b * bul]);
  const anda = (k) => [[k * (W + .575 * h), e - h], [k * (W + 1.08 * h), e - .39 * h], [k * (W + 1.08 * h), e + .39 * h], [k * (W + .575 * h), e + h]];
  return [...upp, ...anda(1), ...ned, ...anda(-1).reverse()];
}
// Tofsen: en boll som inte är riktigt rund – samma ojämna cirkel som gorillans öron och ögon.
const tofs = (cx, cy, r) => blob(cx, cy, r * 1.06, 8, 9, .06);

// Struten: lång sned vänstersida upp till toppen som lutar åt höger; toppen viker av och hänger ned mot tofsen,
// med en glipa luft mellan topp och strut. Punkterna går medsols från vänster fot; foten (y > 0) göms av kanten.
const LUVA = {
  // nya fliken: hög strut, smäckrare och bulligare kant, ett veck där toppen viker
  fin: { plats: { x: 103, y: 46, vinkel: 9 }, W: 45, T: 25, bage: 6, bul: 1.7, luft: 3,
    strut: [[-43, 8], [-44, -6], [-35, -28], [-15, -51], [14, -70], [40, -74], [62, -66], [79, -50], [89, -30],
      [80, -21], [69, -30], [55, -39], [44, -40], [36, -32], [38, -18], [41, -7], [43, 8]],
    veck: [[29, -53], [36, -48], [39, -40]], tofs: [90, -12, 16] },
  // blockerarknappen: lägre strut, tjock kant och stor tofs, inget veck – det är det vita som syns i 18 px
  enkel: { plats: { x: 103, y: 48, vinkel: 9 }, W: 45, T: 30, bage: 6, bul: 1.3, luft: 1,
    strut: [[-43, 8], [-44, -8], [-36, -28], [-17, -48], [12, -65], [38, -69], [60, -62], [78, -48], [89, -30],
      [80, -21], [68, -29], [54, -37], [43, -38], [36, -31], [38, -19], [41, -9], [43, 8]],
    tofs: [90, -12, 19] },
};
// Lagren bakifrån: strut, veck, pälskant (framför strutens fot), tofs (framför toppens spets). Allt ligger framför
// huvudet, så hjässan försvinner in i luvan och huvudets linje kommer fram igen under kantens ändar.
function luva(d) { const t = stall(d.plats), L = [{ p: t(d.strut), c: 1, fill: ROD, w: 7, amp: 1.3, s: 301 }];
  if (d.veck) L.push({ p: t(d.veck), w: 5, amp: .6, s: 305 });
  L.push({ p: t(kant(d.W, d.T, d.bage, d.bul)), c: 1, fill: VIT, w: 7, amp: 1.1, s: 311 });
  L.push({ p: t(tofs(...d.tofs)), c: 1, fill: VIT, w: 7, amp: .8, s: 317 });
  return L; }

// Gorillans lager får samma darr-frö som i ritaSVG (lagrets plats * 17 + 3), så huvudet blir exakt loggans.
const gorilla = (i) => IDEER[i].lager().map((l, j) => ({ ...l, s: j * 17 + 3 }));
const punkter = (l) => jit(l.p, l.s, 1, l.amp || 1.5);
// Kvadratisk ruta runt allt. Styrpunkterna ligger utanför kurvorna, så en smal marginal blir det även med luft 0.
function ruta(L, luft) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  L.forEach((l) => punkter(l).forEach(([x, y]) => { const h = (l.w || 0) / 2; x0 = Math.min(x0, x - h); y0 = Math.min(y0, y - h); x1 = Math.max(x1, x + h); y1 = Math.max(y1, y + h); }));
  const s = Math.max(x1 - x0, y1 - y0) + 2 * luft; return [(x0 + x1 - s) / 2, (y0 + y1 - s) / 2, s, s].map((v) => +v.toFixed(1)); }
function rita(L, luft) { let s = `<svg viewBox="${ruta(L, luft).join(' ')}" width="">`;
  L.forEach((l) => { const st = l.w ? `stroke:${INK};stroke-width:${l.w}` : 'stroke:none';
    s += `<path class="ink" d="${smooth(punkter(l), l.c)}" style="fill:${l.fill || 'none'};${st}"/>`;
    if (l.txt) { const [t, x, y, rot, , fs2] = l.txt; s += `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" style="font:900 ${fs2 || 26}px InterK;fill:${INK}">${t}</text>`; } });
  return s + '</svg>'; }

fs.writeFileSync(__dirname + '/luva-b.raw.svg', rita([...gorilla(1), ...luva(LUVA.fin)], LUVA.fin.luft));
fs.writeFileSync(__dirname + '/luva-a.raw.svg', rita([...gorilla(0), ...luva(LUVA.enkel)], LUVA.enkel.luft));
