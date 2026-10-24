'use strict';
/* Sök på sidan utan att förlita sig på Electrons findInPage/found-in-page (som inte alltid når fram
 * när sökrutan är en egen vy). Vi markerar träffarna direkt i sidan med CSS Custom Highlight API i en
 * isolerad värld, räknar dem och hoppar mellan dem. Returnerar { total, active }. */
const WORLD = 992;

// Körs i sidan. q = sökord, dir = 0 (bara markera om), 1 (nästa), -1 (föregående). reset = börja om.
const KOD = `(() => {
  const ARG = __ARG__;
  const q = ARG.q || '';
  const root = document.body;
  const S = (window.__adrazeSok = window.__adrazeSok || { q: '', i: -1, ranges: [] });
  const CSS_OK = !!(window.CSS && CSS.highlights && window.Highlight);
  function styla() {
    if (document.getElementById('__adraze_sok_css')) return;
    const s = document.createElement('style'); s.id = '__adraze_sok_css';
    s.textContent = '::highlight(adraze-sok){background:#ffd54a;color:#111}::highlight(adraze-sok-akt){background:#ff8a3d;color:#111}';
    (document.head || document.documentElement).appendChild(s);
  }
  function rensa() {
    if (CSS_OK) { CSS.highlights.delete('adraze-sok'); CSS.highlights.delete('adraze-sok-akt'); }
    S.ranges = []; S.i = -1; S.q = '';
  }
  if (!q) { rensa(); return { total: 0, active: 0 }; }
  // Bygg om träfflistan bara när sökordet ändras
  if (q !== S.q || !S.ranges.length) {
    S.q = q; S.ranges = []; S.i = -1;
    const nedre = q.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || p.closest('#__adraze_sok_css')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.nodeValue.toLowerCase();
      let from = 0, idx;
      while ((idx = txt.indexOf(nedre, from)) !== -1) {
        try { const r = document.createRange(); r.setStart(node, idx); r.setEnd(node, idx + q.length); S.ranges.push(r); } catch (e) {}
        from = idx + q.length;
        if (S.ranges.length > 5000) break;
      }
      if (S.ranges.length > 5000) break;
    }
  }
  const total = S.ranges.length;
  if (!total) { rensa(); S.q = q; return { total: 0, active: 0 }; }
  // Flytta aktiv träff
  const dir = ARG.dir | 0;
  if (S.i < 0) S.i = 0;
  else if (dir) S.i = (S.i + dir + total) % total;
  styla();
  if (CSS_OK) {
    const alla = new Highlight(...S.ranges);
    const akt = new Highlight(S.ranges[S.i]);
    CSS.highlights.set('adraze-sok', alla);
    CSS.highlights.set('adraze-sok-akt', akt);
  }
  try {
    const r = S.ranges[S.i]; const el = r.startContainer.parentElement;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch (e) {}
  return { total, active: S.i + 1 };
})()`;

const RENSA = `(() => { try { const S = window.__adrazeSok; if (S) { if (window.CSS && CSS.highlights) { CSS.highlights.delete('adraze-sok'); CSS.highlights.delete('adraze-sok-akt'); } S.ranges = []; S.i = -1; S.q = ''; } } catch (e) {} return true; })()`;

async function sok(wc, q, dir) {
  if (!wc || wc.isDestroyed()) return { total: 0, active: 0 };
  const code = KOD.replace('__ARG__', JSON.stringify({ q: String(q || ''), dir: dir | 0 }));
  try { return await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]) || { total: 0, active: 0 }; }
  catch { return { total: 0, active: 0 }; }
}
function rensa(wc) {
  if (!wc || wc.isDestroyed()) return;
  try { wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: RENSA }]); } catch {}
}

module.exports = { sok, rensa };
