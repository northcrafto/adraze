// Mäter textbredder och bläckrutor i samma Chromium som granskningen använder.
// Kör: flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt node tools/matt.cjs
const { chromium } = require('/home/mint/insta-mcp/node_modules/playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + path.join(__dirname, 'matt.html'));
  const K = { f: 'InterK', w: 900, ls: -0.035 }, N = { f: 'News', w: 500, ls: -0.02 }, NI = { f: 'NewsI', w: 500, ls: -0.02 };
  const jobs = [
    { ...N, px: 250, t: 'Your page', pos: 1 }, { ...N, px: 250, t: 'Same page.', pos: 1 }, { ...N, px: 250, t: 'Your' }, { ...N, px: 250, t: 'Same' }, { ...N, px: 250, t: 'page' }, { ...N, px: 250, t: 'page.' }, { ...N, px: 250, t: ' ' },
    { ...NI, px: 250, t: 'Minus the junk.', pos: 1 }, { ...NI, px: 250, t: 'Minus' }, { ...NI, px: 250, t: 'the' }, { ...NI, px: 250, t: 'junk.' }, { ...NI, px: 250, t: ' ' },
    ...['ads', 'trackers', 'popups', 'cookie banners', 'scam redirects'].map((t) => ({ ...K, px: 150, t })),
    { ...K, px: 150, t: 'AdRaze', pos: 1 }, { ...K, px: 240, t: 'AdRaze', pos: 1 },
    { ...K, px: 56, t: 'ACCEPT ALL' }, { ...K, px: 64, t: 'ACCEPT ALL' },
    ...['a browser for Mac and Linux', 'Falk, your AI assistant', 'themes', 'Family'].map((t) => ({ ...N, px: 104, t })),
    { ...N, px: 64, t: 'raze:' }, { ...NI, px: 64, t: 'to level to the ground.' }, { ...N, px: 64, t: ' ' },
    { ...N, px: 72, t: 'raze:' }, { ...NI, px: 72, t: 'to level to the ground.' },
    { f: 'InterM', w: 500, ls: 0.14, px: 40, t: 'CHROME EXTENSION · BROWSER FOR MAC AND LINUX' },
    { f: 'InterB', w: 700, ls: 0, px: 66, t: 'adraze.app' },
    { f: 'InterM', w: 500, ls: 0, px: 20, t: 'reject' }, { f: 'InterM', w: 500, ls: 0, px: 24, t: 'reject' },
    ...['ads', 'trackers', 'popups', 'cookie banners', 'scam redirects'].map((t) => ({ ...K, px: 56, t })),
    ...['ads', 'trackers', 'popups', 'cookie banners', 'scam redirects'].map((t) => ({ ...K, px: 48, t })),
    { ...N, px: 250, t: 'Yxpg' }, { ...K, px: 150, t: 'xdpk' }, { ...N, px: 250, t: 'x' }, { ...N, px: 250, t: 'Y' }, { ...N, px: 250, t: 'p' }, { ...K, px: 150, t: 'x' }, { ...K, px: 150, t: 'd' }, { ...K, px: 150, t: 'p' }, { ...K, px: 150, t: 'A' },
  ];
  const r = await p.evaluate((j) => window.matt(j), jobs);
  for (const x of r) console.log(JSON.stringify(x));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
