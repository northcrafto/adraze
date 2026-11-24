// Partner Center: Start update → packages → ladda upp MSIX → vänta på versionen → översikt → (Submit om SKICKA=1)
import { browser, flik } from '/home/mint/insta-mcp/lib.mjs';
const MSIX = '/home/mint/adraze/browser/dist-installer/AdRaze.msix', VER = process.argv[2];
const vila = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await browser(); const { p, stang } = await flik(b, 'https://partner.microsoft.com/dashboard/products/9NXWW5QDZV98/overview');
// Hittar och klickar ett element genom shadow DOM utifrån synlig text
const klick = (re) => p.evaluate((src) => { const re = new RegExp(src, 'i'); let hit = null; const ga = (rot) => { for (const e of rot.querySelectorAll('*')) { if (hit) return; if (e.shadowRoot) ga(e.shadowRoot); const t = e.tagName.toLowerCase(); if ((t === 'he-button' || t === 'button' || t === 'a') && re.test((e.innerText || e.textContent || '').trim()) && !e.disabled && e.getAttribute('aria-disabled') !== 'true') hit = e; } }; ga(document); if (hit) { hit.click(); return (hit.innerText || hit.textContent).trim().slice(0, 60); } return null; }, re.source);
const lankar = (re) => p.evaluate((src) => { const re = new RegExp(src); const ut = []; const ga = (rot) => { for (const e of rot.querySelectorAll('*')) { if (e.shadowRoot) ga(e.shadowRoot); if (e.tagName === 'A' && e.href && re.test(e.href)) ut.push(e.href); } }; ga(document); return [...new Set(ut)]; }, re.source);
const text = () => p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
try {
  await vila(14000);
  let pk = await lankar(/\/submissions\/\d+\/packages/);
  if (!pk.length) { console.log('klick:', await klick(/^Start update$/)); for (let i = 0; i < 20 && !pk.length; i++) { await vila(3000); pk = await lankar(/\/submissions\/\d+\/packages/); } }
  if (!pk.length) throw new Error('hittar ingen länk till paketsidan: ' + (await text()).slice(0, 500));
  console.log('paketsida:', pk[0]);
  await p.goto(pk[0], { waitUntil: 'domcontentloaded' }); await vila(12000);
  let t = await text();
  if (!t.includes('v' + VER) && !t.includes(VER)) {
    const cdp = await p.context().newCDPSession(p);
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input.fileuploader' });
    if (!nodeId) throw new Error('hittar inte filfältet (input.fileuploader)');
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [MSIX] });
    console.log('filen satt, väntar på uppladdning');
    for (let i = 0; i < 160; i++) { await vila(5000); t = await text(); if (t.includes(VER) && !/Uploading|Validating|%\s*\|/i.test(t.slice(t.indexOf(VER) - 200, t.indexOf(VER) + 300))) break; if (i % 12 === 11) console.log('  …', (t.match(/\d+\s?%/) || [''])[0]); }
  }
  const i = t.indexOf(VER); console.log('paket:', i >= 0 ? t.slice(Math.max(0, i - 250), i + 350) : 'VERSIONEN SYNS INTE');
  if (i < 0) throw new Error('versionen kom aldrig upp i listan');
  const fel = (t.match(/[^|]*(error|failed|couldn.t|invalid)[^|]*/gi) || []).slice(0, 5); if (fel.length) console.log('möjliga fel:', fel);
  await vila(4000);
  const sub = pk[0].replace(/\/packages.*$/, '');
  await p.goto(sub, { waitUntil: 'domcontentloaded' }).catch(() => {}); await vila(12000);
  console.log('översikt:', p.url(), '\n', (await text()).slice(0, 1200));
  if (process.env.SKICKA === '1') { console.log('klick:', await klick(/^Submit for certification$/)); await vila(15000); console.log('efter:', p.url(), '\n', (await text()).slice(0, 700)); }
} finally { await stang(); await b.close().catch(() => {}); }
process.exit();
