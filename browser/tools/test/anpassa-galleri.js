#!/usr/bin/env node
// Temagalleriet (Inställningar → Anpassa) mot en tillfällig kopia av adraze-api med egen temp-databas.
// Allt körs osynligt (egen Xvfb). Testar listor, gilla, Prova/Ångra/Behåll (exakt återställning, även efter
// omstart), raden "Du provar" i alla flik-, verktygsrads- och sidopanellägen (webbsidans riktiga vy flyttas),
// publicering (bara tema-områdets färg, läge, hörn och densitet; aldrig typsnitt eller textstorlek), Mina/ta bort,
// anmälan, avstängt galleri och barnläge.
// Användning: node tools/test/anpassa-galleri.js [webbläsarmapp]
//   ADRAZE_API_REPO = mappen med adraze-api (standard ~/adraze-api, måste ha galleri.js)
//   ADRAZE_TEST_BILDER = mapp att spara skärmdumpar i (valfritt)
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const H = require('./hjalp');

const BILDER = process.env.ADRAZE_TEST_BILDER || '';
const BREDD = 1280, HOJD = 900;
const kod = (o) => 'ADRZ1.' + Buffer.from(JSON.stringify(o)).toString('base64url');
// Samma värden (ordningen på nycklarna spelar ingen roll i Anpassa)
const sorterad = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
const lika = (a, b) => sorterad(a) === sorterad(b);
// Två rutor { x, y, r, b } som överlappar (mer än en halv pixel)
const overlappar = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

// En testsida med orange ram runt hela vyn: hamnar vyn fel syns det direkt på bilderna
function sidserver() {
  return new Promise((res) => {
    const s = http.createServer((req, ut) => {
      ut.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      ut.end('<!doctype html><meta charset="utf-8"><title>Testsida</title><style>html,body{margin:0;height:100%;font:600 26px system-ui;background:#dfe8f3;color:#0e2a47}'
        + '.r{position:fixed;inset:0;border:6px solid #ff4b1f;box-sizing:border-box;display:grid;place-items:center}</style><div class="r">Webbsidan</div>');
    });
    s.listen(0, '127.0.0.1', () => res({ url: 'http://127.0.0.1:' + s.address().port + '/', stang: () => s.close() }));
  });
}

async function startaApi(repo) {
  const tmp = H.tempDir('galleri-api');
  for (const f of fs.readdirSync(repo)) if (f.endsWith('.js')) fs.copyFileSync(path.join(repo, f), path.join(tmp, f));
  const port = await H.ledigPort();
  const srv = spawn(process.execPath, ['--no-warnings', path.join(tmp, 'server.js')], {
    cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), MAIL_LOGG: '1', CHATT_HOTLISTOR: '0', BREVO_API_KEY: '', CLAMD_PORT: '1', CHATT_NYCKEL: crypto.randomBytes(32).toString('hex') },
  });
  let logg = ''; srv.stdout.on('data', (d) => { logg += d; }); srv.stderr.on('data', (d) => { logg += d; });
  for (let i = 0; i < 100 && !logg.includes('adraze-api på'); i++) await H.sov(50);
  if (!logg.includes('adraze-api på')) throw new Error('adraze-api startade inte: ' + logg.slice(0, 400));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(tmp, 'adraze.db'));
  const bas = 'http://127.0.0.1:' + port;
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  let n = 0;
  const vuxen = (email) => {
    const id = Number(db.prepare('INSERT INTO users(email,verified,created_at) VALUES(?,1,?)').run(email, Date.now()).lastInsertRowid);
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(sha(token), id, Date.now() + 86_400_000);
    return { id, token, email, ip: `10.6.${++n}.1` };
  };
  const barn = (foralder, namn) => {
    const id = 'b' + crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO barn(id,foralder_id,namn,alder,kod,skapad) VALUES(?,?,?,?,?,?)').run(id, foralder.id, namn, 10, namn.toUpperCase() + '-' + crypto.randomBytes(4).toString('hex'), Date.now());
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO barn_sessioner(token,barn_id,skapad,expires) VALUES(?,?,?,?)').run(sha(token), id, Date.now(), Date.now() + 86_400_000);
    return { id, token, namn, ip: `10.6.${++n}.1` };
  };
  const api = async (vem, metod, p, kropp) => {
    const r = await fetch(bas + p, { method: metod, headers: { ...(vem && vem.token ? { authorization: 'Bearer ' + vem.token } : {}), 'cf-connecting-ip': (vem && vem.ip) || '10.6.0.9', ...(kropp ? { 'content-type': 'application/json' } : {}) }, body: kropp ? JSON.stringify(kropp) : undefined });
    return r.json().catch(() => ({}));
  };
  return { bas, db, vuxen, barn, api, stang: () => { try { srv.kill(); } catch {} try { db.close(); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } };
}

async function startaApp(R, x, namn, apiBas, profil) {
  profil = profil || H.tempDir('galleri-' + namn);
  const cdp = await H.ledigPort(), insp = await H.ledigPort();   // lediga portar för just den här körningen
  const p = H.starta(path.join(R, 'node_modules', 'electron', 'dist', 'electron'), ['--inspect=' + insp, R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil, { ADRAZE_API: apiBas }), path.join(profil, 'logg.txt'));
  await H.vantaPaPort(cdp);
  const t = await H.mal(cdp, (t) => t.url.includes('shell.html'));
  if (!t) throw new Error('skalet startade inte (' + namn + ')');
  let mj = null;
  for (let i = 0; i < 80 && !mj; i++) { try { mj = (await H.hamtaJson(insp, '/json'))[0]; } catch { await H.sov(250); } }
  if (!mj) throw new Error('huvudprocessen svarade inte (' + namn + ')');
  const huvud = await H.anslut(mj.webSocketDebuggerUrl);
  await huvud.skicka('Runtime.enable');
  // Huvudprocessen: fönstret och flikens riktiga vy (main.js sätter wc.__ctx på flikarnas webContents)
  const main = (js) => huvud.kor(`(async () => { const el = process.mainModule.require('electron'); const fonster = () => el.BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('shell.html') && !w.webContents.getURL().includes('incognito')); ${js} })()`);
  await H.sov(2500);
  const s = await H.anslut(t.webSocketDebuggerUrl);
  await s.skicka('Runtime.enable');
  // Riktig fönsterstorlek (ingen emulering), så att skalets mått och webbsidans vy stämmer med det som syns
  await main(`const w = fonster(); if (!w) return 0; if (w.isMaximized()) w.unmaximize(); w.setPosition(0, 0); w.setContentSize(${BREDD}, ${HOJD}); return 1`);
  await H.sov(800);
  // Introt bort, och inga notiser (huvudwebbläsare, flytt från Firefox …) över bilderna
  const stada = `document.querySelectorAll('#hxintro, .notis').forEach((e) => e.remove()); try { localStorage.setItem('skoll-defbrowser-snooze', String(Date.now() + 864e6)); } catch {} 1`;
  await s.kor(stada);
  const E = (js) => s.kor(`(async () => { ${js} })()`);
  const vanta = async (js, ms = 8000) => { for (let i = 0; i < ms / 150; i++) { const v = await E(js); if (v && !String(v).startsWith('FEL')) return v; await H.sov(150); } return E(js); };
  // Scrolla så att ett element syns precis under inställningarnas sökfält
  const visa = (sel) => E(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 0; e.scrollIntoView({ block: 'start' }); const m = e.closest('.set-main'); if (m) m.scrollBy(0, -96); return 1`);
  // Riktig mus över ett element (för att se vätskefyllningen på bilderna); null = flytta undan musen
  const hovra = async (sel) => {
    const r = sel ? JSON.parse(await E(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'null'; const b = e.getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 })`)) : { x: 140, y: 890 };
    if (r) await s.skicka('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await H.sov(1100);
  };
  const bild = async (fil) => {
    if (!BILDER) return;
    await s.kor(stada);
    await H.sov(450);   // vätskefyllning och tooltips hinner lägga sig
    const r = await s.skicka('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(BILDER, fil), Buffer.from(r.result.data, 'base64'));
  };
  // Hela fönstret från Xvfb, med webbsidans riktiga vy (Page.captureScreenshot ser bara skalet)
  const skarm = async (fil) => {
    if (!BILDER) return;
    await s.kor(stada);
    await H.sov(450);
    const b = JSON.parse(await main(`const w = fonster(); return JSON.stringify(w ? w.getContentBounds() : null)`) || 'null');
    if (!b) return;
    try {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', Math.min(b.width, 1600 - b.x) + 'x' + Math.min(b.height, 1000 - b.y),
        '-i', x.display + '+' + b.x + ',' + b.y, '-frames:v', '1', path.join(BILDER, fil)], { stdio: 'ignore' });
    } catch { await bild(fil); }   // utan ffmpeg: bara skalet
  };
  // #views i skalet och flikens vy i huvudprocessen
  const matt = async () => {
    const v = JSON.parse(await E(`const r = document.getElementById('views').getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })`));
    const b = JSON.parse(await main(`const c = [...new Set(el.webContents.getAllWebContents().filter((w) => !w.isDestroyed() && w.__ctx && w.__tabId != null).map((w) => w.__ctx))]
        .find((c) => c.win && !c.win.isDestroyed() && !c.win.webContents.getURL().includes('incognito'));
      const vy = c && c.visibleTab != null ? c.views.get(c.visibleTab) : null; return JSON.stringify(vy ? vy.getBounds() : null)`) || 'null');
    return { v, b };
  };
  const stammer = (m) => {
    if (!m || !m.v || !m.b) return false;
    const nara = (a, b) => Math.abs(a - b) <= 1;
    return nara(m.b.x, Math.round(m.v.x)) && nara(m.b.y, Math.round(m.v.y)) && nara(m.b.width, Math.round(m.v.w)) && nara(m.b.height, Math.round(m.v.h));
  };
  return { p, s, huvud, E, main, vanta, visa, hovra, bild, skarm, matt, stammer, profil };
}

async function kor(rot) {
  const R = H.resultat();
  const repo = process.env.ADRAZE_API_REPO || path.join(os.homedir(), 'adraze-api');
  if (!fs.existsSync(path.join(repo, 'galleri.js'))) { R.ok('adraze-api med galleri.js finns (' + repo + ')', false); return R; }
  if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
  const srv = await startaApi(repo);
  const x = await H.startaXvfb();
  const appar = [];
  try {
    // ── Galleriet fylls via API:t ──
    const A = srv.vuxen('anna@test.se'), B = srv.vuxen('bo@test.se'), C = srv.vuxen('cello@test.se'), D = srv.vuxen('dan@test.se'), F = srv.vuxen('fia@test.se');
    const K = srv.barn(A, 'Kalle');
    const hash = (u) => crypto.createHash('sha256').update(u).digest('base64');
    for (const [v, u] of [[A, 'Anna_A'], [C, 'Cello']]) await srv.api(v, 'POST', '/chatt/registrera', { username: u, login_hash: hash(u), public_key: 'PK' + u, enc_priv: 'EP' + u });
    const pub = async (v, namn, varden, beskrivning, anonym) => (await srv.api(v, 'POST', '/galleri/publicera', { namn, beskrivning, kod: kod(varden), anonym })).tema;
    const T = {};
    // Tema-områdets riktiga nycklar och värden (browser/anpassa-tema.js)
    T.midnatt = await pub(A, 'Midnatt', { 'tema.lage': 'morkt', 'tema.accent': '#ff4b1f', 'tema.horn': 'rund' }, 'Mörkt med orange accent och runda hörn.');
    T.skog = await pub(A, 'Skogsglänta', { 'tema.accent': '#2f9e67', 'tema.densitet': 'luftig', 'tema.horn': 'rund' }, 'Ljust och grönt, lugnt för ögonen.');
    T.persika = await pub(C, 'Persika', { 'tema.accent': '#ff7a52', 'tema.densitet': 'luftig' }, 'Varma toner hela dagen.');
    T.kontor = await pub(C, 'Kontorsgrå', { 'tema.accent': '#1d4a76', 'tema.horn': 'kantig', 'tema.densitet': 'kompakt' }, '', true);
    T.neon = await pub(D, 'Neonnatt', { 'tema.lage': 'morkt', 'tema.accent': '#5fd08a' }, 'Grönt som lyser i mörkret.');
    T.sand = await pub(D, 'Sand', { 'tema.accent': '#cf9128', 'tema.lage': 'system' }, '');
    T.spam = await pub(F, 'Anmält tema', { 'tema.accent': '#000000' }, 'Det här temat har anmälts.');
    R.ok('galleriet fylldes', Object.values(T).every((t) => t && t.id), Object.keys(T).filter((k) => !T[k]));
    for (const [v, t] of [[D, T.midnatt], [C, T.midnatt], [D, T.persika], [A, T.persika], [A, T.neon], [A, T.sand], [C, T.skog]]) await srv.api(v, 'POST', '/galleri/rosta', { id: t.id, rost: 1 });
    for (let i = 1; i <= 3; i++) await srv.api({ ip: '10.5.0.' + i }, 'POST', '/galleri/nedladdad', { id: T.midnatt.id });
    await srv.api(D, 'POST', '/galleri/anmal', { id: T.spam.id, orsak: 'spam' });

    // ── Vuxen (B) ──
    const W = await startaApp(rot, x, 'vuxen', srv.bas); appar.push(W);
    const { E, vanta, visa, hovra, bild } = W;
    await E(`account = { token: '${B.token}', email: '${B.email}', name: 'Bo' }; try { sparaKontoLokalt(); } catch {} return 1`);
    // Mitt tema innan galleriet: två delbara värden, och typsnitt + textstorlek som är personliga och aldrig får röras
    await E(`await Anpassa.set('tema.accent', '#123abc', 'Accent'); await Anpassa.set('tema.densitet', 'kompakt', 'Densitet'); await Anpassa.set('tema.typsnitt', 'klassisk', 'Typsnitt'); await Anpassa.set('tema.storlek', 'stor', 'Textstorlek'); return 1`);
    const fore = JSON.parse(await E(`return JSON.stringify(Object.fromEntries(Object.entries(Anpassa.alla()).filter(([k]) => k.startsWith('tema.'))))`));
    await E(`openSettings(); showSettingsCat('anpassa'); return 1`);
    const antal = await vanta(`const n = document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length; return n >= 6 ? n : 0`);
    R.ok('populära: korten visas', antal === 7, antal);
    const namn = JSON.parse(await E(`return JSON.stringify([...document.querySelectorAll('#anp-galleri .gal-kort')].map((k) => k.querySelector('.gal-namn').textContent))`));
    R.ok('populära: Midnatt först (mest gillat och använt)', namn[0] === 'Midnatt', namn);
    R.ok('skaparen visas med användarnamn', (await E(`return document.querySelector('#anp-galleri .gal-kort[data-id="${T.midnatt.id}"] .gal-av').textContent`)).startsWith('av Anna_A'));
    R.ok('anonymt tema visar Anonym', (await E(`return document.querySelector('#anp-galleri .gal-kort[data-id="${T.kontor.id}"] .gal-av').textContent`)).startsWith('av Anonym'));
    R.ok('antal gillar och användare', (await E(`const k = document.querySelector('#anp-galleri .gal-kort[data-id="${T.midnatt.id}"]'); return k.querySelector('.gal-gilla .gal-antal').textContent + '|' + k.querySelector('.gal-av').textContent`)) === '2|av Anna_A · 3 använder');
    const gp = (id) => E(`const g = document.querySelector('#anp-galleri .gal-kort[data-id="${id}"] .gp'); const s = (sel, p) => getComputedStyle(sel ? g.querySelector(sel) : g)[p];
      return [s(null, 'backgroundColor'), s('.gp-cta', 'backgroundColor'), s('.gp-flik', 'borderTopLeftRadius'), s('.gp-ram', 'height')].join('|')`);
    R.ok('förhandsvisningen: mörkt läge, accentfärgen och runda hörn (Midnatt)', (await gp(T.midnatt.id)) === 'rgb(14, 14, 16)|rgb(255, 75, 31)|6px|21px', await gp(T.midnatt.id));
    R.ok('förhandsvisningen: ljust, kantiga hörn och kompakt (Kontorsgrå)', (await gp(T.kontor.id)) === 'rgb(249, 251, 253)|rgb(29, 74, 118)|1px|17px', await gp(T.kontor.id));
    R.ok('publicera-raden finns för vuxna', !!(await E(`return document.querySelector('#anp-galleri .gal-pubrad [data-g="pub"]') ? 1 : 0`)));
    R.ok('fliken Mina finns för vuxna', !!(await E(`return document.querySelector('#anp-galleri [data-flik="mina"]') ? 1 : 0`)));
    await visa('#anp-galleri .gal-flikar');
    await bild('galleri-populara.png');

    // Gilla
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.persika.id}"] .gal-gilla').click(); return 1`);
    const gillat = await vanta(`const g = document.querySelector('#anp-galleri .gal-kort[data-id="${T.persika.id}"] .gal-gilla'); return g.classList.contains('pa') && g.querySelector('.gal-antal').textContent === '3' ? 'ja' : ''`);
    await H.sov(400);
    R.ok('gilla: hjärtat fylls och antalet ökar', gillat === 'ja', gillat);
    R.ok('gilla: rösten finns på servern', !!srv.db.prepare("SELECT 1 FROM galleri_roster WHERE tema_id=? AND vem=? AND rost=1").get(T.persika.id, 'u:' + B.id));
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.persika.id}"] .gal-gilla').click(); return 1`);
    await vanta(`return document.querySelector('#anp-galleri .gal-kort[data-id="${T.persika.id}"] .gal-gilla .gal-antal').textContent === '2' ? 1 : 0`);
    await H.sov(400);
    R.ok('gilla igen = ta bort rösten', !srv.db.prepare('SELECT 1 FROM galleri_roster WHERE tema_id=? AND vem=?').get(T.persika.id, 'u:' + B.id));
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.persika.id}"] .gal-gilla').click(); return 1`);
    await H.sov(600);

    // Topplistan och Nya
    await E(`document.querySelector('#anp-galleri [data-flik="vecka"]').click(); return 1`);
    const platser = await vanta(`const p = [...document.querySelectorAll('#anp-galleri .gal-plats')].map((x) => x.textContent); return p.length ? p.join(',') : ''`);
    R.ok('topplistan: platser 1, 2, 3 …', /^1,2,3/.test(platser), platser);
    R.ok('topplistan: Persika eller Midnatt etta', ['Persika', 'Midnatt'].includes(await E(`return document.querySelector('#anp-galleri .gal-kort .gal-namn').textContent`)));
    await visa('#anp-galleri .gal-flikar');
    await bild('galleri-topplistan.png');
    await E(`document.querySelector('#anp-galleri [data-flik="nya"]').click(); return 1`);
    const nya = await vanta(`const n = [...document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare) .gal-namn')].map((x) => x.textContent); return n.length ? n.join('|') : ''`);
    R.ok('nya: senast publicerade först', nya.startsWith('Anmält tema|Sand|Neonnatt'), nya);
    await E(`document.querySelector('#anp-galleri [data-flik="populara"]').click(); return 1`);
    await vanta(`return document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length >= 6 ? 1 : 0`);

    // Prova → raden överst; byt tema; Ångra = exakt som innan
    const tema = () => E(`return JSON.stringify(Object.fromEntries(Object.entries(Anpassa.alla()).filter(([k]) => k.startsWith('tema.'))))`).then(JSON.parse);
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.midnatt.id}"] .gal-prova').click(); return 1`);
    const raden = await vanta(`const r = document.getElementById('gal-provbar'); return r && !r.hidden ? r.textContent : ''`);
    R.ok('prova: raden "Du provar" visas', /Du provar Midnatt av Anna_A/.test(raden), raden);
    let t1 = await tema();
    R.ok('prova: temats värden läggs på (accent, mörkt, runda hörn)', t1['tema.accent'] === '#ff4b1f' && t1['tema.lage'] === 'morkt' && t1['tema.horn'] === 'rund', t1);
    R.ok('prova: min densitet går till temats (standard)', !('tema.densitet' in t1), t1);
    R.ok('prova: typsnitt och textstorlek (personliga) rörs inte', t1['tema.typsnitt'] === 'klassisk' && t1['tema.storlek'] === 'stor', t1);
    R.ok('prova: skalet blir mörkt', (await E(`return document.documentElement.dataset.theme`)) === 'dark');
    R.ok('prova: kortet markeras', (await E(`const k = document.querySelector('#anp-galleri .gal-kort[data-id="${T.midnatt.id}"]'); return k.classList.contains('provas') + '|' + k.querySelector('.gal-prova').textContent`)) === 'true|Provas');
    R.ok('prova: ingen historik medan man provar', !(await E(`const h = await Anpassa.historik(); return h.some((x) => /galleriet/.test(x.etikett)) ? 1 : 0`)));
    R.ok('prova: raden ligger i skalets kolumn, direkt före webbytan', (await E(`const r = document.getElementById('gal-provbar'); return r.parentElement === document.body && r.nextElementSibling && r.nextElementSibling.contains(document.getElementById('views')) ? 1 : 0`)) === 1);
    await visa('#anp-galleri .gal-flikar');
    await hovra('#gal-provbar .gpb-behall');
    await bild('galleri-provar.png');
    await hovra(null);
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.persika.id}"] .gal-prova').click(); return 1`);
    await vanta(`return /Persika/.test(document.getElementById('gal-provbar').textContent) ? 1 : 0`);
    t1 = await tema();
    R.ok('byt till ett annat tema: läge och hörn går tillbaka till standard', t1['tema.accent'] === '#ff7a52' && t1['tema.densitet'] === 'luftig' && !('tema.lage' in t1) && !('tema.horn' in t1) && t1['tema.typsnitt'] === 'klassisk', t1);

    // Raden och webbsidan i alla lägen: flikar upptill/på sidan/dolda × verktygsraden uppe/nere, sidopanelen
    // till vänster (standard), till höger och av. Webbsidan är en egen vy i huvudprocessen; den ska ligga exakt
    // över #views, och raden får inte täcka sidan, verktygsraden, bokmärkena eller flikpanelen.
    const sid = await sidserver();
    const satt = async (k, v) => { await E(`await Anpassa.set(${JSON.stringify(k)}, ${v === undefined ? 'undefined' : JSON.stringify(v)}, 'test'); return 1`); };
    await E(`closeSettings(); createTab(${JSON.stringify(sid.url)}); return 1`);
    await vanta(`return active && /127\\.0\\.0\\.1/.test(active.url || '') ? 1 : 0`, 10000);
    await H.sov(1500);
    const LAGEN = [
      ['upptill', 'uppe'], ['upptill', 'nere'], ['vertikal', 'uppe'], ['vertikal', 'nere'], ['dolda', 'uppe'], ['dolda', 'nere'],
      ['upptill', 'uppe', 'hoger'], ['vertikal', 'nere', 'hoger'], ['upptill', 'uppe', 'av'],
    ];
    for (const [fl, vp, sp] of LAGEN) {
      await satt('flikar.lage', fl === 'upptill' ? undefined : fl);
      await satt('verktyg.placering', vp === 'uppe' ? undefined : vp);
      await satt('sidopanel.sida', sp === 'hoger' ? 'hoger' : undefined);
      await satt('sidopanel.visa', sp === 'av' ? false : undefined);
      await H.sov(900);
      const namn = `flikar ${fl}, verktygsraden ${vp}` + (sp ? ', sidopanelen ' + (sp === 'av' ? 'av' : 'till höger') : '');
      const g = JSON.parse(await E(`const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { x: b.x, y: b.y, r: b.right, b: b.bottom, h: b.height } : null; };
        return JSON.stringify({ rad: r('gal-provbar'), views: r('views'), verktyg: r('toolbar'), flikar: r('tabstrip'), bm: r('bmbar'), lista: r('sp-list'), knappar: r('winctl'), h: innerHeight, w: innerWidth })`));
      const m = await W.matt();
      const nere = vp === 'nere';
      const lagd = !!g.rad && g.rad.h >= 40 && g.rad.y >= 0 && g.rad.b <= g.h + 0.5
        && !overlappar(g.rad, g.views) && !overlappar(g.rad, g.verktyg) && !overlappar(g.rad, g.bm) && !overlappar(g.rad, g.flikar) && !overlappar(g.rad, g.knappar)
        && Math.abs(nere ? g.rad.y - g.views.b : g.views.y - g.rad.b) <= 1   // direkt intill sidan
        && g.rad.x <= g.views.x + 1 && g.rad.r >= g.views.r - 1;            // minst lika bred som sidan
      R.ok(`prova (${namn}): raden ligger intill sidan och täcker inget`, lagd, g);
      R.ok(`prova (${namn}): webbsidan ligger exakt i webbytan`, W.stammer(m) && !!g.rad && Math.round(m.v.h) <= g.h - g.rad.h - (g.verktyg ? g.verktyg.h : 0) + 1, m);
      // Det runt omkring (andra Anpassa-delar) med raden synlig: flikpanelen, sidopanelens list och fönsterknapparna
      if (fl === 'vertikal') {
        const botten = nere ? Math.min(g.verktyg.y, g.bm ? g.bm.y : Infinity) : g.h;
        R.ok(`prova (${namn}): flikpanelen går från sidans topp ned till ${nere ? 'verktygsraden' : 'fönstrets botten'}`, !!g.flikar && Math.abs(g.flikar.y - g.views.y) <= 1 && Math.abs(g.flikar.b - botten) <= 1 && !overlappar(g.flikar, g.verktyg) && !overlappar(g.flikar, g.lista), { flikar: g.flikar, lista: g.lista, botten });
      }
      R.ok(`prova (${namn}): fönsterknapparna ligger inte under webbsidan`, !overlappar(g.knappar, g.views), g.knappar);
      if (fl === 'dolda') {   // de dolda flikarna tas fram (som med musen vid kanten eller kortkommandot)
        await E(`AnpFlikar._zen(true); return 1`);
        await H.sov(600);
        const z = JSON.parse(await E(`const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, h: b.height }; };
          return JSON.stringify({ flikar: r('tabstrip'), views: r('views'), rad: r('gal-provbar'), h: innerHeight })`));
        if (nere) await W.skarm('galleri-lage-dolda-nere-framtagna.png');
        await E(`AnpFlikar._zen(false); return 1`);
        await H.sov(500);
        R.ok(`prova (${namn}): framtagna flikar syns i fönstret, inte under webbsidan eller över raden`, z.flikar.h > 20 && z.flikar.y >= -0.5 && z.flikar.b <= z.h + 0.5 && !overlappar(z.flikar, z.views) && !overlappar(z.flikar, z.rad), z);
      }
      if (!sp || sp === 'hoger') await W.skarm(`galleri-lage-${fl}-${vp}${sp ? '-' + sp : ''}.png`);
    }
    for (const k of ['flikar.lage', 'verktyg.placering', 'sidopanel.sida', 'sidopanel.visa']) await satt(k, undefined);
    await H.sov(900);
    await E(`document.querySelector('#gal-provbar .gpb-angra').click(); return 1`);
    await vanta(`return document.getElementById('gal-provbar').hidden ? 1 : 0`);
    await H.sov(900);
    const utanRad = await W.matt();
    const ovanfor = await E(`const b = (id) => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return r && r.height ? r.bottom : 0; }; return Math.round(Math.max(b('toolbar'), b('bmbar')))`);
    R.ok('ångra: raden försvinner och webbsidan får tillbaka platsen', W.stammer(utanRad) && Math.round(utanRad.v.y) === ovanfor, { utanRad, ovanfor });
    sid.stang();
    const efterAngra = await tema();
    R.ok('ångra: exakt det tema man hade', lika(efterAngra, fore), { nu: efterAngra, fore });
    await E(`openSettings(); showSettingsCat('anpassa'); return 1`);
    await vanta(`return document.querySelector('#anp-galleri .gal-kort[data-id="${T.midnatt.id}"] .gal-prova') ? 1 : 0`);

    // Behåll → historik + nedladdning
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.midnatt.id}"] .gal-prova').click(); return 1`);
    await vanta(`const r = document.getElementById('gal-provbar'); return r && !r.hidden ? 1 : 0`);
    await E(`document.querySelector('#gal-provbar .gpb-behall').click(); return 1`);
    await vanta(`return document.getElementById('gal-provbar').hidden ? 1 : 0`);
    const behallet = await tema();
    R.ok('behåll: temat ligger kvar, typsnitt och textstorlek orörda', behallet['tema.accent'] === '#ff4b1f' && behallet['tema.lage'] === 'morkt' && behallet['tema.horn'] === 'rund' && !('tema.densitet' in behallet) && behallet['tema.typsnitt'] === 'klassisk' && behallet['tema.storlek'] === 'stor', behallet);
    const hist = JSON.parse(await E(`return JSON.stringify((await Anpassa.historik()).slice(0, 6).map((h) => [h.nyckel, h.etikett, h.fore]))`));
    R.ok('behåll: ändringen hamnar i historiken (går att ångra)', hist.filter((h) => h[1] === 'Tema från galleriet: Midnatt').length === 4 && hist.some((h) => h[0] === 'tema.accent' && h[2] === '#123abc'), hist);
    await H.sov(500);
    R.ok('behåll: räknas som nedladdning', !!srv.db.prepare('SELECT 1 FROM galleri_nedladdningar WHERE tema_id=? AND vem=?').get(T.midnatt.id, 'u:' + B.id));
    const angrat = await E(`const r = await Anpassa.angra(); return r.nyckel`);
    R.ok('Ångra under Anpassa backar temat en inställning i taget', typeof angrat === 'string' && angrat.startsWith('tema.'), angrat);

    // Publicera mitt tema: bara färg, läge, hörn och densitet följer med, länken försvinner ur beskrivningen
    await E(`await Anpassa.set('tema.accent', '#d6336c', 'Accent'); await Anpassa.set('tema.horn', 'rund', 'Hörn'); await Anpassa.set('tema.densitet', 'luftig', 'Densitet'); await Anpassa.set('tema.lage', undefined, 'Läge'); return 1`);
    await E(`document.querySelector('#anp-galleri .gal-pubrad [data-g="pub"]').click(); return 1`);
    const om = await vanta(`const o = document.querySelector('#anp-galleri .gal-form-om'); return o && o.textContent ? o.textContent : ''`);
    R.ok('publicera: formuläret visar vad som delas', om === 'Delas: egen accentfärg, runda hörn, luftigt.', om);
    R.ok('publicera: förhandsvisningen visar mitt tema', (await E(`const g = document.querySelector('#anp-galleri .gal-form .gp'); return getComputedStyle(g.querySelector('.gp-cta')).backgroundColor + '|' + getComputedStyle(g.querySelector('.gp-ram')).height`)) === 'rgb(214, 51, 108)|25px');
    R.ok('publicera: knappen väntar på ett namn', !!(await E(`return document.querySelector('#anp-galleri .gal-form [type=submit]').disabled ? 1 : 0`)));
    await E(`const n = document.getElementById('gal-namn'); n.value = 'Hallon'; n.dispatchEvent(new Event('input', { bubbles: true })); const b = document.getElementById('gal-besk'); b.value = 'Rosa och lugnt. https://spam.example/x'; b.dispatchEvent(new Event('input', { bubbles: true })); return 1`);
    await visa('#anp-galleri .gal-pubrad');
    await bild('galleri-publicera.png');
    await E(`document.querySelector('#anp-galleri .gal-form [type=submit]').click(); return 1`);
    const forst = await vanta(`const k = document.querySelector('#anp-galleri .gal-kort:not(.gal-platshallare)'); return !document.querySelector('#anp-galleri .gal-form') && document.querySelector('#anp-galleri [data-flik="nya"].on') && k ? k.querySelector('.gal-namn').textContent + '|' + (k.querySelector('.gal-chip') || {}).textContent : ''`, 10000);
    R.ok('publicera: temat ligger först under Nya, märkt Ditt', forst === 'Hallon|Ditt', forst);
    const rad = srv.db.prepare("SELECT * FROM galleri_teman WHERE namn='Hallon'").get();
    R.ok('publicera: bara färg, hörn och densitet skickades (inte typsnitt eller textstorlek)', rad && lika(JSON.parse(rad.varden), { 'tema.accent': '#d6336c', 'tema.densitet': 'luftig', 'tema.horn': 'rund' }), rad && rad.varden);
    R.ok('publicera: länken rensades ur beskrivningen', rad && rad.beskrivning === 'Rosa och lugnt.', rad && rad.beskrivning);
    R.ok('publicera: användarnamn saknas → Anonym', (await E(`return document.querySelector('#anp-galleri .gal-kort .gal-av').textContent`)).startsWith('av Anonym'));

    // Mina → ta bort
    await E(`document.querySelector('#anp-galleri [data-flik="mina"]').click(); return 1`);
    const mina = await vanta(`const n = [...document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare) .gal-namn')].map((x) => x.textContent); return n.join('|')`);
    R.ok('mina: mitt tema', mina === 'Hallon', mina);
    await E(`document.querySelector('#anp-galleri .gal-kort .gal-bort').click(); return 1`);
    R.ok('ta bort: frågar först', (await E(`return document.querySelector('#anp-galleri .gal-fraga-text').textContent`)) === 'Ta bort temat?');
    R.ok('ta bort: fokus på Avbryt, inte på Ta bort', (await E(`return document.activeElement && document.activeElement.classList.contains('gal-x') ? 1 : 0`)) === 1);
    await visa('#anp-galleri .gal-pubrad');
    await hovra('#anp-galleri .gal-fraga .gal-farlig');
    await bild('galleri-ta-bort.png');
    await hovra(null);
    await E(`[...document.querySelectorAll('#anp-galleri .gal-fraga button')].find((b) => b.textContent === 'Ta bort').click(); return 1`);
    const tomt = await vanta(`const t = document.getElementById('gal-tom'); return t && !t.hidden ? t.textContent : ''`);
    R.ok('ta bort: borta ur Mina', /inte publicerat/.test(tomt), tomt);
    R.ok('ta bort: borttaget på servern', srv.db.prepare("SELECT status FROM galleri_teman WHERE id=?").get(rad.id).status === 'borttagen');

    // Anmäl
    await E(`document.querySelector('#anp-galleri [data-flik="populara"]').click(); return 1`);
    await vanta(`return document.querySelector('#anp-galleri .gal-kort[data-id="${T.sand.id}"]') ? 1 : 0`);
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.sand.id}"] .gal-anmal').click(); return 1`);
    await E(`[...document.querySelectorAll('#anp-galleri .gal-fraga button')].find((b) => b.textContent === 'Spam').click(); return 1`);
    await vanta(`return document.querySelector('#anp-galleri .gal-kort[data-id="${T.sand.id}"]') ? 0 : 1`);
    R.ok('anmäl: temat försvinner och anmälan finns på servern', !!srv.db.prepare("SELECT 1 FROM galleri_anmalningar WHERE tema_id=? AND vem=? AND orsak='spam'").get(T.sand.id, 'u:' + B.id));

    // Mörkt läge (tema-områdets tema.lage) och ett mörkt tema som provas
    await E(`await Anpassa.set('tema.lage', 'morkt', 'Läge'); showSettingsCat('anpassa'); return 1`);
    await vanta(`return document.documentElement.dataset.theme === 'dark' && document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length >= 5 ? 1 : 0`);
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.neon.id}"] .gal-prova').click(); return 1`);
    await vanta(`const r = document.getElementById('gal-provbar'); return r && !r.hidden ? 1 : 0`);
    await visa('#anp-galleri .gal-flikar');
    await bild('galleri-mork.png');
    await E(`document.querySelector('#gal-provbar .gpb-angra').click(); return 1`);
    await vanta(`return document.getElementById('gal-provbar').hidden ? 1 : 0`);
    R.ok('mörkt: ångra behåller mitt mörka läge', (await tema())['tema.lage'] === 'morkt');
    await E(`await Anpassa.set('tema.lage', undefined, 'Läge'); return 1`);

    // Galleriet avstängt
    await E(`await Anpassa.set('galleri.visa', false, 'Dölj temagalleriet'); return 1`);
    const av = await vanta(`return document.querySelector('#anp-galleri .gal-visarad') && !document.getElementById('gal-grid') ? document.querySelector('#anp-galleri .set-lead').textContent : ''`);
    R.ok('avstängt: bara raden för att slå på', /avstängt/.test(av), av);
    R.ok('avstängt: huvudprocessen lämnar inte ut listan', (await E(`return (await anpassaGalleri.lista({ sort: 'nya' })).error`)) === 'av');
    await E(`document.querySelector('#anp-galleri .gal-visarad input').click(); return 1`);
    R.ok('slå på igen', !!(await vanta(`return document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length >= 5 ? 1 : 0`)));

    // Provning som avbryts av en omstart återställs vid start
    const innan = await tema();
    await E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.neon.id}"] .gal-prova').click(); return 1`);
    await vanta(`const r = document.getElementById('gal-provbar'); return r && !r.hidden ? 1 : 0`);
    R.ok('omstart: provningen är igång', (await tema())['tema.accent'] === '#5fd08a');
    const fel1 = W.s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    W.s.stang(); W.huvud.stang(); await H.sov(800); await H.stang(W.p); appar.splice(appar.indexOf(W), 1);
    const W2 = await startaApp(rot, x, 'vuxen2', srv.bas, W.profil); appar.push(W2);
    const efterOmstart = JSON.parse(await W2.E(`return JSON.stringify(Object.fromEntries(Object.entries(Anpassa.alla()).filter(([k]) => k.startsWith('tema.'))))`));
    R.ok('omstart: temat från före provningen är tillbaka', lika(efterOmstart, innan), { nu: efterOmstart, innan });
    R.ok('omstart: ingen "Du provar"-rad', !!(await W2.E(`await new Promise((r) => setTimeout(r, 500)); return document.getElementById('gal-provbar').hidden ? 1 : 0`)));
    const fel2 = W2.s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    W2.s.stang(); W2.huvud.stang(); await H.stang(W2.p); appar.splice(appar.indexOf(W2), 1);
    R.ok('inga JS-fel i skalet (vuxen)', !fel1.length && !fel2.length, fel1.concat(fel2));

    // ── Utloggad och barnläge ──
    const U = await startaApp(rot, x, 'barn', srv.bas); appar.push(U);
    await U.E(`openSettings(); showSettingsCat('anpassa'); return 1`);
    await U.vanta(`return document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length >= 5 ? 1 : 0`);
    R.ok('utloggad: "Logga in" i stället för Publicera', !!(await U.E(`return document.querySelector('#anp-galleri .gal-pubrad [data-g="logga-in"]') && !document.querySelector('#anp-galleri [data-flik="mina"]') ? 1 : 0`)));
    await U.E(`document.querySelector('#anp-galleri .gal-kort .gal-gilla').click(); return 1`);
    R.ok('utloggad: gilla ber om inloggning', (await U.vanta(`const t = document.getElementById('apptoast'); return t && !t.classList.contains('hidden') ? t.textContent : ''`)) === 'Logga in för att gilla teman.');
    await U.visa('#anp-galleri .gal-pubrad');
    await U.bild('galleri-utloggad.png');

    // Sidvis: 24 åt gången, "Visa fler" hämtar resten
    for (let i = 0; i < 4; i++) {
      const v = srv.vuxen(`fler${i}@test.se`);
      for (let j = 0; j < 5; j++) await pub(v, `Fler ${i}-${j}`, { 'tema.accent': '#' + (i * 5 + j + 16).toString(16) + '4b1f' }, '');
    }
    await U.E(`document.querySelector('#anp-galleri [data-flik="nya"]').click(); return 1`);
    const sida1 = await U.vanta(`const n = document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length; return n === 24 && !document.getElementById('gal-fler').hidden ? n : 0`);
    R.ok('sidvis: 24 teman och "Visa fler"', sida1 === 24, sida1);
    await U.E(`document.getElementById('gal-fler').click(); return 1`);
    const sida2 = await U.vanta(`const n = document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length; return n > 24 && document.getElementById('gal-fler').hidden ? n : 0`);
    R.ok('sidvis: "Visa fler" hämtar resten (27 synliga)', sida2 === 27, sida2);
    await U.E(`document.querySelector('#anp-galleri [data-flik="populara"]').click(); return 1`);
    await U.vanta(`return document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare)').length >= 24 ? 1 : 0`);
    await U.E(`closeSettings(); await enterChildMode('${K.token}', { id: '${K.id}', name: 'Kalle', age: 10 }); return 1`);
    await H.sov(1500);
    await U.E(`openSettings(); showSettingsCat('anpassa'); return 1`);
    const barnNamn = await U.vanta(`const n = [...document.querySelectorAll('#anp-galleri .gal-kort:not(.gal-platshallare) .gal-namn')].map((x) => x.textContent); return n.length >= 4 ? n.join('|') : ''`);
    R.ok('barn: kan bläddra', barnNamn.split('|').length >= 4, barnNamn);
    R.ok('barn: ser inga anmälda teman', !/Anmält tema|Sand/.test(barnNamn), barnNamn);
    R.ok('barn: ingen publicera-rad, ingen Mina, ingen av/på-rad', !!(await U.E(`return !document.querySelector('#anp-galleri .gal-pubrad') && !document.querySelector('#anp-galleri [data-flik="mina"]') && !document.querySelector('#anp-galleri .gal-visarad') ? 1 : 0`)));
    await U.E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.skog.id}"] .gal-prova').click(); return 1`);
    R.ok('barn: kan prova', /Skogsglänta/.test(await U.vanta(`const r = document.getElementById('gal-provbar'); return r && !r.hidden ? r.textContent : ''`)));
    await U.visa('#anp-galleri .set-h3');
    await U.bild('galleri-barn.png');
    await U.E(`document.querySelector('#gal-provbar .gpb-angra').click(); return 1`);
    await U.vanta(`return document.getElementById('gal-provbar').hidden ? 1 : 0`);
    await U.E(`document.querySelector('#anp-galleri .gal-kort[data-id="${T.skog.id}"] .gal-gilla').click(); return 1`);
    await H.sov(800);
    R.ok('barn: kan gilla (barnkontots röst)', !!srv.db.prepare('SELECT 1 FROM galleri_roster WHERE tema_id=? AND vem=?').get(T.skog.id, 'b:' + K.id));
    R.ok('barn: publicera nekas i huvudprocessen', (await U.E(`return (await anpassaGalleri.publicera({ token: '${A.token}', namn: 'Barnets tema' })).error`)) === 'barnlage');
    R.ok('barn: kan inte stänga av eller slå på galleriet', (await U.E(`return (await Anpassa.set('galleri.visa', false)).error`)) === 'barnlast');
    const fel3 = U.s.handelser.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
    R.ok('inga JS-fel i skalet (barn)', !fel3.length, fel3);
    const loggar = [W.profil, U.profil].map((p) => { try { return fs.readFileSync(path.join(p, 'logg.txt'), 'utf8'); } catch { return ''; } }).join('\n');
    R.ok('inga nekade IPC-kanaler', !/\[ipc\] nekad galleri/.test(loggar), loggar.split('\n').filter((r) => r.includes('[ipc] nekad')));
  } catch (e) {
    R.ok('testet kördes klart', false, String((e && e.stack) || e));
  } finally {
    for (const a of appar) { try { a.s.stang(); a.huvud.stang(); } catch {} await H.stang(a.p); }
    x.stoppa();
    srv.stang();
    for (const a of appar) { try { fs.rmSync(a.profil, { recursive: true, force: true }); } catch {} }
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  kor(path.resolve(process.argv[2] || path.join(__dirname, '..', '..'))).then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
}
