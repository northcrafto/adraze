// Gemensam testmotor för AdRaze: öppna en sajt i Chromium med eller utan tillägget och samla bevis.
// Användning i ett eget skript:
//   const h = require('./tests/harness.cjs');
//   const s = await h.start({ ext: true, namn: 'mitt-test' });   // s.ctx, s.page, s.logg, s.extId, s.sw
//   await s.page.goto('https://...'); await h.godkannCookies(s.page);
//   await h.skarm(s.page, 'namn');   -> sökväg till png
//   console.log(h.sammanfatta(s)); await s.ctx.close();
// Kör alltid samma steg UTAN tillägget (ext:false) och jämför: bara skillnader är AdRaze-buggar.
const path = require('path');
// playwright-core från tools/ (npm install där), annars globalt installerat
let chromium;
try { ({ chromium } = require(path.join(__dirname, '..', 'tools', 'node_modules', 'playwright-core'))); }
catch { ({ chromium } = require('playwright-core')); }
const fs = require('fs');

const EXT = path.join(__dirname, '..', 'extension');
// Sökväg till en Chromium som klarar tillägg (inte headless-shell); tom = Playwrights egen
const CHROME = process.env.CHROMIUM_PATH || undefined;
const UT = path.join(__dirname, 'out');
fs.mkdirSync(UT, { recursive: true });
let n = 0;

async function start({ ext = true, namn = 'test', viewport = { width: 1366, height: 900 }, extraArgs = [] } = {}) {
  const prof = path.join(UT, 'prof', `${namn}-${ext ? 'med' : 'utan'}-${process.pid}-${n++}`);
  const args = ext ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : [];
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: CHROME, headless: true, viewport, locale: 'sv-SE',
    args: [...args, '--autoplay-policy=no-user-gesture-required', ...extraArgs],
  });
  let sw = null, extId = null;
  if (ext) {
    sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    extId = sw.url().split('/')[2];
    await new Promise((r) => setTimeout(r, 1500));
  }
  const logg = { fel: [], konsolfel: [], nyaFlikar: [], misslyckade: [], stoppsida: [] };
  ctx.on('page', (p) => {
    logg.nyaFlikar.push(p.url());
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) { if (f.url().includes('/blocked/blocked.html')) logg.stoppsida.push(f.url()); } });
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', (e) => logg.fel.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') logg.konsolfel.push(m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => logg.misslyckade.push(`${r.failure()?.errorText} ${r.resourceType()} ${r.url().slice(0, 150)}`));
  page.on('framenavigated', (f) => { if (f === page.mainFrame() && f.url().includes('/blocked/blocked.html')) logg.stoppsida.push(f.url()); });
  return { ctx, page, logg, sw, extId, ext };
}

// Klicka bort cookie-rutor (vanliga svenska och engelska knappar, även i iframes)
async function godkannCookies(page) {
  const re = /^(Godkänn alla|Acceptera alla|Godkänn alla cookies|Acceptera alla cookies|Jag godkänner|Godkänn|Acceptera|Accept all|Accept All|Accept all cookies|I agree|Agree|Allow all|Tillåt alla|OK)$/i;
  for (const f of [page, ...page.frames()]) {
    try { const b = f.getByRole('button', { name: re }).first(); if (await b.isVisible({ timeout: 700 })) { await b.click({ timeout: 2000 }); await page.waitForTimeout(1500); return true; } } catch {}
  }
  return false;
}

async function skarm(page, namn, full = false) {
  const fil = path.join(UT, `${namn.replace(/[^a-z0-9_-]/gi, '_')}.png`);
  await page.screenshot({ path: fil, fullPage: full }).catch(() => {});
  return fil;
}

function sammanfatta(s) {
  const l = s.logg;
  const blockerade = l.misslyckade.filter((x) => x.includes('ERR_BLOCKED_BY_CLIENT'));
  return {
    ext: s.ext, url: s.page.url(), sidfel: l.fel.slice(0, 10), konsolfel: l.konsolfel.slice(0, 10),
    nyaFlikar: l.nyaFlikar, stoppsida: l.stoppsida, blockeradeAntal: blockerade.length, blockeradeExempel: blockerade.slice(0, 15),
  };
}

module.exports = { start, godkannCookies, skarm, sammanfatta, EXT, UT };
