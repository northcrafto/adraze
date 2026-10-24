'use strict';
/* Läsläge: Mozillas Readability (samma som Firefox) plockar ut artikeln, och sidan byts mot en
 * lugn läsvy i AdRazes stil. Allt körs i en isolerad värld så sidans egna skript inte ser det. */
const fs = require('fs');
const path = require('path');

const RD = path.join(__dirname, 'node_modules', '@mozilla', 'readability');
let READABILITY = '', READERABLE = '';
try {
  READABILITY = fs.readFileSync(path.join(RD, 'Readability.js'), 'utf8');
  READERABLE = fs.readFileSync(path.join(RD, 'Readability-readerable.js'), 'utf8');
} catch (e) { console.warn('[läsläge]', String(e)); }
const WORLD = 991;

async function kanLasa(wc) {
  if (!READERABLE) return false;
  try {
    const url = wc.getURL();
    if (!/^https?:/i.test(url)) return false;
    const r = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: READERABLE + '\n;isProbablyReaderable(document, { minContentLength: 180, minScore: 30 })' }]);
    return !!r;
  } catch { return false; }
}

// Bygger läsvyn. theme = 'light' | 'dark', t = översatta etiketter
function visa(wc, theme, t) {
  const code = READABILITY + `
;(() => {
  const art = new Readability(document.cloneNode(true), { charThreshold: 200 }).parse();
  if (!art || !art.content) return false;
  const T = ${JSON.stringify(t || {})};
  const dark = ${JSON.stringify(theme === 'dark')};
  const ord = (art.textContent || '').trim().split(/\\s+/).length;
  const min = Math.max(1, Math.round(ord / 220));
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  try { window.stop(); } catch {}
  const html = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(art.title) + '</title></head><body></body>';
  document.documentElement.innerHTML = html;
  const css = document.createElement('style');
  css.textContent = \`
    :root { --bg:#f7f7f5; --ink:#1b1b1e; --mut:#6b6b72; --line:#e4e4e0; --accent:#ff4b1f; --link:#c2360e; --size:19px; }
    :root.dark { --bg:#121214; --ink:#e9e9ec; --mut:#9a9aa2; --line:#2a2a2f; --link:#ff8a65; }
    html { background: var(--bg); }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, -apple-system, "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    .bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: var(--bg); border-bottom: 1px solid var(--line); font-size: 13px; color: var(--mut); }
    .bar b { color: var(--ink); font-weight: 600; }
    .bar .sp { flex: 1; }
    .bar button { height: 30px; min-width: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .bar button:hover { border-color: var(--mut); }
    main { max-width: 680px; margin: 0 auto; padding: 44px 22px 120px; font-size: var(--size); line-height: 1.7; }
    .site { font-size: 13px; color: var(--mut); text-transform: none; margin-bottom: 10px; }
    h1.title { font-size: 2em; line-height: 1.15; letter-spacing: -.02em; margin: 0 0 12px; font-weight: 750; }
    .meta { font-size: 14px; color: var(--mut); padding-bottom: 26px; margin-bottom: 30px; border-bottom: 1px solid var(--line); }
    main img, main video, main figure { max-width: 100%; height: auto; border-radius: 10px; }
    main figure { margin: 28px 0; } main figcaption { font-size: 14px; color: var(--mut); margin-top: 8px; }
    main a { color: var(--link); text-underline-offset: 3px; }
    main h2, main h3 { line-height: 1.25; letter-spacing: -.01em; margin: 1.8em 0 .5em; }
    main blockquote { margin: 1.4em 0; padding-left: 18px; border-left: 3px solid var(--accent); color: var(--mut); }
    main pre { overflow: auto; padding: 14px; border-radius: 10px; background: rgb(127 127 127 / .1); font-size: 14px; line-height: 1.5; }
    main code { font-size: .88em; }
    main table { border-collapse: collapse; width: 100%; font-size: 15px; } main td, main th { border: 1px solid var(--line); padding: 6px 8px; }
  \`;
  document.head.appendChild(css);
  if (dark) document.documentElement.classList.add('dark');
  document.body.innerHTML = '<div class="bar"><b>' + esc(T.title) + '</b><span>· ' + min + ' ' + esc(T.min) + '</span><span class="sp"></span>'
    + '<button id="ar-minus" title="' + esc(T.smaller) + '">A−</button><button id="ar-plus" title="' + esc(T.bigger) + '">A+</button><button id="ar-exit">' + esc(T.exit) + '</button></div>'
    + '<main>' + (art.siteName ? '<div class="site">' + esc(art.siteName) + '</div>' : '') + '<h1 class="title">' + esc(art.title) + '</h1>'
    + (art.byline ? '<div class="meta">' + esc(art.byline) + '</div>' : '<div class="meta"></div>') + '<article id="ar-body"></article></main>';
  document.getElementById('ar-body').innerHTML = art.content;
  document.querySelectorAll('#ar-body script, #ar-body iframe:not([src*="youtube"]), #ar-body style').forEach((e) => e.remove());
  let size = 19;
  const setSize = (n) => { size = Math.max(14, Math.min(28, n)); document.documentElement.style.setProperty('--size', size + 'px'); };
  document.getElementById('ar-minus').addEventListener('click', () => setSize(size - 1));
  document.getElementById('ar-plus').addEventListener('click', () => setSize(size + 1));
  document.getElementById('ar-exit').addEventListener('click', () => location.reload());
  window.scrollTo(0, 0);
  return true;
})()`;
  return wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]).then((r) => !!r).catch(() => false);
}

module.exports = { kanLasa, visa };
