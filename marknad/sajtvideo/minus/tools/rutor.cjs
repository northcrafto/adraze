// Tar bildrutor ur index.html med Playwright (dold Chromium), i full storlek.
// Kör alltid genom låset:
//   flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt node tools/rutor.cjs 0.9,6.5,10 [mapp]
const { chromium } = require('/home/mint/insta-mcp/node_modules/playwright-core');
const path = require('path'), fs = require('fs');
(async () => {
  const times = (process.argv[2] || '0').split(',').map(Number);
  const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'granska'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('KONSOL:', m.text()); });
  p.on('pageerror', (e) => console.log('FEL:', e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await p.waitForFunction(() => !!(window.__timelines && window.__timelines.main), null, { timeout: 30000, polling: 100 });
  await p.evaluate(() => document.fonts.ready);
  for (const t of times) {
    await p.evaluate((t) => { window.__timelines.main.time(t); window.__minus.render(t); }, t);
    await p.screenshot({ path: path.join(out, `ruta-${t.toFixed(2).padStart(5, '0')}.png`) });
  }
  console.log('klart', times.length, 'rutor i', out);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
