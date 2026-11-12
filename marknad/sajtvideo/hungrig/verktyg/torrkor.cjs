// Torrkör index.html utan webbläsare: en låtsas-DOM, riktig GSAP. Hittar körfel, NaN i banor och spår som överlappar.
//   node verktyg/torrkor.cjs [bildruta ...]   (utan argument: alla 961 bildrutor)
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const gsapSrc = fs.readFileSync('/home/mint/hyperframes-src/skills/talking-head-recut/assets/vendor/gsap.min.js', 'utf8');

class El {
  constructor(tag) { this.tagName = tag; this.attrs = {}; this.style = {}; this.children = []; this.parentNode = null; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') ids[v] = this; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { if (c.parentNode) { const i = c.parentNode.children.indexOf(c); if (i >= 0) c.parentNode.children.splice(i, 1); } c.parentNode = this; this.children.push(c); return c; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  set textContent(v) { this._text = String(v); } get textContent() { return this._text; }
  set className(v) { this.attrs.class = v; } get className() { return this.attrs.class || ''; }
  insertAdjacentHTML(pos, s) { parseInto(this, s); }
  set innerHTML(s) { this.children = []; parseInto(this, s); }
  _all(out) { for (const c of this.children) { out.push(c); c._all(out); } return out; }
  querySelectorAll(sel) { return this._all([]).filter((e) => match(e, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const ids = {};
function match(e, sel) { sel = sel.trim(); if (sel[0] === '#') return e.attrs.id === sel.slice(1); if (sel[0] === '.') return (' ' + (e.attrs.class || '') + ' ').includes(' ' + sel.slice(1) + ' '); return e.tagName === sel; }
const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'rect', 'circle', 'line', 'path']);
function parseInto(root, s) {
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let cur = root, m;
  while ((m = re.exec(s))) {
    if (m[1]) { if (cur !== root && cur.tagName === m[1]) cur = cur.parentNode; else if (cur !== root) { let q = cur; while (q && q !== root && q.tagName !== m[1]) q = q.parentNode; if (q && q !== root) cur = q.parentNode; } }
    else if (m[2]) { const e = new El(m[2]); const ar = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a; while ((a = ar.exec(m[3] || ''))) e.setAttribute(a[1], a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '');
      cur.appendChild(e); if (!m[5] && !VOID.has(m[2])) cur = e; }
    else if (m[6] && m[6].trim()) cur._text += m[6];
  }
}
const body = new El('body');
const bodyHtml = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script>', html.indexOf('<body>')));
parseInto(body, bodyHtml);
const document = { querySelector: (s) => body.querySelector(s), createElementNS: (ns, t) => new El(t), createElement: (t) => new El(t) };
const errors = []; const console2 = { error: (...a) => errors.push(a.join(' ')), warn: (...a) => errors.push(a.join(' ')), log: console.log };
const window = {};
const gsap = (new Function('window', 'document', gsapSrc + '; return (typeof gsap !== "undefined" ? gsap : (window.gsap || this.gsap));')).call(window, window, undefined) || window.gsap || globalThis.gsap;
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
new Function('gsap', 'document', 'window', 'console', script)(gsap, document, window, console2);
const tl = window.__timelines.main;
console.log('tidslinje', tl.duration(), 'fel vid uppstart:', errors.length); errors.forEach((e) => console.log('  ', e));
const frames = process.argv.slice(2).map(Number); const list = frames.length ? frames : Array.from({ length: 961 }, (_, i) => i);
let bad = 0;
for (const f of list) {
  try { tl.totalTime(f / 30, false); } catch (e) { console.log('KÖRFEL bildruta', f, e.stack.split('\n').slice(0, 3).join(' | ')); bad++; if (bad > 5) break; continue; }
  for (const e of body._all([])) for (const k in e.attrs) if (/NaN|undefined|Infinity/.test(e.attrs[k])) { console.log('DÅLIGT VÄRDE bildruta', f, e.tagName, e.attrs.id || '', k, e.attrs[k].slice(0, 90)); bad++; break; }
  if (bad > 12) break;
}
console.log(bad ? 'FEL: ' + bad : 'ok: ' + list.length + ' bildrutor utan körfel');
if (process.env.DUMP) { const f = Number(process.env.DUMP); tl.totalTime(f / 30, false); const pick = (id) => { const e = ids[id]; return e ? (e.attrs.transform || '') + ' disp=' + (e.style.display || '') : 'saknas'; }; for (const id of ['h-cam', 'h-gor', 'home-in']) console.log(id, pick(id)); }
