#!/usr/bin/env node
// Klistrar in uBlock-listans dellistor (!#include) i den medskickade ubo-filters.txt, från ../tools/lists/ubo-filters.d
// (som tools/build.js --fetch hämtar). Körs av sync-adraze.sh. Användning: node tools/klistra-in-listor.js <lista> <delmapp>
'use strict';
const fs = require('fs');
const path = require('path');
const { klistraIn } = require('../listuppdatering');
const [fil, mapp] = process.argv.slice(2);
(async () => {
  const text = fs.readFileSync(fil, 'utf8');
  const ut = await klistraIn(text, 'https://x.invalid/filters/', async (_u, namn) => { const p = path.join(mapp, namn); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; });
  fs.writeFileSync(fil, ut);
  console.log('  ubo-filters.txt: dellistorna inklistrade (' + Math.round(text.length / 1024) + ' → ' + Math.round(ut.length / 1024) + ' kB)');
})().catch((e) => { console.error('  klistra-in-listor:', e.message); process.exit(1); });
