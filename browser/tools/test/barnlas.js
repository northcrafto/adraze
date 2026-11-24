#!/usr/bin/env node
// Barnlås, osynligt (egen Xvfb) mot en tillfällig kopia av adraze-api: föräldern låser webbläsaren till barnet,
// låset sitter kvar efter omstart, profilerna är dolda, fem fel lösenord ger paus, glömt lösenord ger en kod
// till föräldern, och rätt lösenord ger tillbaka de gamla kontona.
// Användning (från browser/): node tools/test/barnlas.js [--bilder <mapp>] [--api <mapp med adraze-api>]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const H = require('./hjalp');

const R = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(R, 'node_modules', 'electron', 'dist', 'electron');
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? path.resolve(argv[argv.indexOf(n) + 1]) : d);
const BILDER = arg('--bilder', H.tempDir('barnlas-bilder'));
const API = arg('--api', path.join(process.env.HOME, 'adraze-api'));
fs.mkdirSync(BILDER, { recursive: true });
const sov = H.sov;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function kor() {
  const T = H.resultat();
  const x = await H.startaXvfb();
  const profil = H.tempDir('barnlas');
  let p = null, skal = null, srv = null;
  try {
    // Servern: egen kopia, egen databas, mejl skrivs till loggen
    const apiTmp = H.tempDir('barnlas-api');
    for (const f of fs.readdirSync(API)) if (f.endsWith('.js')) fs.copyFileSync(path.join(API, f), path.join(apiTmp, f));
    const apiPort = await H.ledigPort();
    let logg = '';
    srv = spawn(process.execPath, [path.join(apiTmp, 'server.js')], { cwd: apiTmp, env: { ...process.env, PORT: String(apiPort), MAIL_LOGG: '1', CHATT_HOTLISTOR: '0', BREVO_API_KEY: '', CLAMD_PORT: '1', CHATT_NYCKEL: crypto.randomBytes(32).toString('hex') }, stdio: ['ignore', 'pipe', 'pipe'] });
    srv.stdout.on('data', (d) => { logg += d; }); srv.stderr.on('data', (d) => { logg += d; });
    for (let i = 0; i < 200 && !logg.includes('adraze-api på'); i++) await sov(50);
    if (!logg.includes('adraze-api på')) throw new Error('adraze-api startade inte: ' + logg.slice(0, 400));
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(apiTmp, 'adraze.db'));
    const uid = Number(db.prepare('INSERT INTO users(email,verified,namn,created_at) VALUES(?,1,?,?)').run('mamma@test.se', 'Mamma', Date.now()).lastInsertRowid);
    const fTok = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(sha(fTok), uid, Date.now() + 86_400_000);
    const barnId = 'b' + crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO barn(id,foralder_id,namn,alder,kod,skapad) VALUES(?,?,?,?,?,?)').run(barnId, uid, 'Alva', 9, 'ALVA-TEST1234', Date.now());
    const kodUrLogg = () => { const m = [...logg.matchAll(/\[mejl loggat\] (\S+) (\d{6}) /g)]; return m.length ? m[m.length - 1] : null; };

    let k, bild;
    const startaApp = async () => {
      const cdp = await H.ledigPort();
      p = H.starta(ELECTRON, [R, '--remote-debugging-port=' + cdp], H.testMiljo(x.display, profil, { ADRAZE_API: 'http://127.0.0.1:' + apiPort }), path.join(profil, 'logg.txt'));
      await H.vantaPaPort(cdp, 60000);
      const t = await H.mal(cdp, (t) => t.url.includes('shell.html') && !t.url.includes('incognito'), 30000);
      if (!t) throw new Error('skalet startade inte');
      skal = await H.anslut(t.webSocketDebuggerUrl);
      await skal.skicka('Runtime.enable');
      await sov(2500);
      k = (s) => skal.kor(s);
      bild = async (namn) => { const r = await skal.skicka('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(BILDER, namn + '.png'), Buffer.from(r.result.data, 'base64')); };
      await k(`(() => { const i = document.getElementById('hxintro'); if (i) i.remove(); try { localStorage.setItem('skoll-skip-close-confirm', '1'); skipCloseConfirm = true; } catch {} return 1; })()`);
    };
    const stangApp = async () => { try { if (skal) skal.stang(); } catch {} skal = null; if (p) await H.stang(p); p = null; };
    const syns = (id) => k(`(() => { const e = document.getElementById('${id}'); return !!(e && e.offsetParent); })()`);

    await startaApp();
    T.ok('inget lås från början', (await k(`lasPa()`)) === false);
    // Föräldern loggar in och öppnar Familj
    await k(`(() => { loginAs(${JSON.stringify(fTok)}, 'mamma@test.se', false, 'Mamma'); openSettings(); showSettingsCat('familj'); return 1; })()`);
    await sov(800);
    await k(`(async () => { try { await syncFamily(); } catch {} try { renderFam(); } catch {} return 1; })()`).catch(() => {});
    let finns = false;
    for (let i = 0; i < 30 && !finns; i++) { await sov(300); finns = await k(`!!document.querySelector('[data-child="${barnId}"] [data-a=las]')`); if (!finns && i % 5 === 4) await k(`(() => { try { renderFam(); } catch {} return 1; })()`); }
    T.ok('barnkortet har knappen "Lås webbläsaren till Alva"', finns && /Alva/.test(await k(`document.querySelector('[data-child="${barnId}"] [data-a=las]').textContent`)));
    await k(`document.querySelector('[data-child="${barnId}"] [data-a=las]').scrollIntoView({ block: 'center' })`);
    await bild('1-barnkortet');
    await k(`(() => { document.querySelector('[data-child="${barnId}"] [data-a=las]').click(); return 1; })()`);
    await sov(500);
    T.ok('varningen visas med barnets namn', (await syns('login-las')) && /Alva/.test(await k(`document.getElementById('las-rubrik').textContent + document.getElementById('las-lead').textContent`)));
    T.ok('varningen säger att låset gäller AdRaze, inte datorn', /inte andra program/.test(await k(`document.getElementById('login-las').textContent`)));
    T.ok('ingen emoji i låsrutan', !(await k(`/\\p{Extended_Pictographic}/u.test(document.getElementById('login-las').textContent)`)));
    await bild('2-varning');
    // För kort, sedan olika
    await k(`(() => { las_ = (a, b) => { document.getElementById('las-pw1').value = a; document.getElementById('las-pw2').value = b; document.getElementById('las-submit').click(); }; las_('abc', 'abc'); return 1; })()`);
    await sov(300);
    T.ok('för kort lösenord nekas', (await syns('las-error')) && (await k(`lasPa()`)) === false);
    await k(`(() => { las_('hemligt1', 'hemligt2'); return 1; })()`);
    await sov(300);
    T.ok('olika lösenord nekas', (await syns('las-error')) && (await k(`lasPa()`)) === false);
    await k(`(() => { las_('hemligt1', 'hemligt1'); return 1; })()`);
    let last = false;
    for (let i = 0; i < 40 && !last; i++) { await sov(300); last = await k(`lasPa() && !!(account && account.isChild)`); }
    T.ok('låst: fönstret är barnets konto', last && (await k(`account.childId`)) === barnId && (await k(`account.name`)) === 'Alva');
    await sov(1200);
    T.ok('inloggningsrutan stängd efter låsningen', await k(`document.getElementById('login').classList.contains('hidden')`));
    const fil = path.join(profil, 'config');
    const hittaFil = (rot, namn) => { for (const d of fs.readdirSync(rot, { withFileTypes: true })) { const f = path.join(rot, d.name); if (d.isDirectory()) { const r = hittaFil(f, namn); if (r) return r; } else if (d.name === namn) return f; } return null; };
    const lasfil = hittaFil(fil, 'adraze-barnlas.dat');
    T.ok('låsfilen finns och innehåller inte lösenordet i klartext', !!lasfil && !fs.readFileSync(lasfil).includes('hemligt1'));
    T.ok('profilerna är dolda: bara barnet lämnas ut', JSON.stringify(await k(`window.auth.profiler().then((l) => l.map((p) => p.isChild))`)) === '[true]');
    T.ok('förälderns profil går inte att hämta', (await k(`window.auth.hamtaProfil('k:mamma@test.se').then((r) => r.ok)`)) === false);
    await k(`(() => { loginAs('x', 'elak@test.se', false, 'Elak'); return 1; })()`);
    T.ok('vuxeninloggning nekas under lås', (await k(`!!(account && account.isChild)`)) === true);
    await k(`(() => { doLogout(); return 1; })()`);
    await sov(400);
    T.ok('logga ut går inte: upplåsningen visas i stället', (await k(`!!(account && account.isChild)`)) && (await syns('login-lasupp')));
    await bild('3-las-upp');
    await k(`(() => { stangLasUpp(); openLogin(); return 1; })()`);
    await sov(300);
    T.ok('kontovyn visar Lås upp, inte Logga ut', (await syns('las-upp-btn')) && !(await syns('logout-btn')));
    T.ok('profilväljaren går inte att öppna', await k(`(() => { visaProfiler(); return document.getElementById('login-profiles').style.display === 'none'; })()`));
    await k(`(() => { closeLogin(); return 1; })()`);

    // Omstart: låset sitter kvar
    await stangApp();
    await startaApp();
    T.ok('efter omstart: fortfarande låst till Alva', (await k(`lasPa() && !!(account && account.isChild) && account.childId === ${JSON.stringify(barnId)}`)) === true);
    T.ok('efter omstart: bara barnets profil', JSON.stringify(await k(`window.auth.profiler().then((l) => l.map((p) => p.isChild))`)) === '[true]');

    // Fem fel lösenord → paus, även rätt lösenord nekas
    await k(`(() => { oppnaLasUpp(); return 1; })()`);
    await sov(300);
    const forsok = async (pw) => { await k(`(() => { document.getElementById('lasupp-pw').value = ${JSON.stringify(pw)}; doLasUpp(); return 1; })()`); for (let i = 0; i < 30; i++) { await sov(200); if (await k(`document.getElementById('lasupp-submit').textContent === 'Lås upp'`)) break; } await sov(150); };
    await forsok('fel-1');
    T.ok('fel lösenord: fortfarande låst, visar försök kvar', (await k(`lasPa()`)) && /4/.test(await k(`document.getElementById('lasupp-error').textContent`)));
    for (const n of [2, 3, 4, 5]) await forsok('fel-' + n);
    T.ok('fem fel ger paus', (await k(`document.getElementById('lasupp-submit').disabled`)) === true && (await k(`window.barnlas.status().sparrTill > Date.now() + 200000`)));
    await bild('4-paus');
    T.ok('rätt lösenord nekas under pausen', (await k(`window.barnlas.lasUpp('hemligt1').then((r) => r.ok)`)) === false && (await k(`window.barnlas.status().last`)) === true);

    // Glömt lösenordet: kod till föräldern, nytt lösenord
    await k(`(() => { lasSkickaKod(true); return 1; })()`);
    let m = null; for (let i = 0; i < 40 && !m; i++) { await sov(250); m = kodUrLogg(); }
    T.ok('koden mejlas till föräldern', !!m && m[1] === 'mamma@test.se', m && m[0]);
    T.ok('vyn för nytt lösenord visas', await syns('login-lasglomt'));
    await bild('5-glomt');
    const nytt = async (kod, a, b) => { await k(`(() => { document.getElementById('lasglomt-kod').value = ${JSON.stringify(kod)}; document.getElementById('lasglomt-pw1').value = ${JSON.stringify(a)}; document.getElementById('lasglomt-pw2').value = ${JSON.stringify(b)}; doLasNytt(); return 1; })()`); await sov(1500); };
    await nytt(m[2] === '000000' ? '111111' : '000000', 'nyttlosen', 'nyttlosen');
    T.ok('fel kod: inget nytt lösenord', (await syns('login-lasglomt')) && (await syns('lasglomt-error')));
    await nytt(m[2], 'nyttlosen', 'nyttlosen');
    T.ok('rätt kod: tillbaka till upplåsningen, pausen borta', (await syns('login-lasupp')) && (await k(`window.barnlas.status().sparrTill`)) === 0 && (await k(`document.getElementById('lasupp-submit').disabled`)) === false);
    T.ok('gamla lösenordet gäller inte längre', (await k(`window.barnlas.lasUpp('hemligt1').then((r) => r.ok)`)) === false);

    // Lås upp med det nya
    await forsok('nyttlosen');
    let uppe = false; for (let i = 0; i < 30 && !uppe; i++) { await sov(300); uppe = await k(`!lasPa() && !account`); }
    T.ok('upplåst: barnet utloggat, låset borta', uppe && (await k(`window.barnlas.status().last`)) === false && !fs.existsSync(lasfil));
    let prof = []; for (let i = 0; i < 20; i++) { await sov(300); prof = await k(`window.auth.profiler().then((l) => l.map((p) => p.email || (p.isChild ? 'barn' : '')))`); if (prof.includes('mamma@test.se') && !prof.includes('barn')) break; }
    T.ok('förälderns profil är tillbaka, barnets är borta', prof.includes('mamma@test.se') && !prof.includes('barn'), prof);
    T.ok('profilväljaren visas', await syns('login-profiles'));
    T.ok('barnläget har släppt', (await k(`famLocked()`)) === false && (await k(`barnlageSatt()`)) === false);
    await bild('6-upplast');
    T.ok('låsets märkning är borttagen på servern', db.prepare('SELECT COUNT(*) AS n FROM barn_las').get().n === 0);
    // Föräldern väljer sin profil utan lösenord
    await k(`(() => { const b = [...document.querySelectorAll('#lg-profiler .lg-pf')].find((x) => /Mamma/.test(x.textContent)); if (b) b.click(); return 1; })()`);
    let inne = false; for (let i = 0; i < 30 && !inne; i++) { await sov(300); inne = await k(`!!(account && !account.isChild && account.email === 'mamma@test.se')`); }
    T.ok('föräldern är inne på sitt gamla konto igen', inne);

    // Omstart utan lås: startar utan låset
    await stangApp();
    await startaApp();
    T.ok('avstängd utan lås startar utan lås', (await k(`lasPa()`)) === false && (await k(`!!(account && !account.isChild)`)));
    const jsfel = (skal.handelser || []).filter((h) => h.method === 'Runtime.exceptionThrown').map((h) => h.params.exceptionDetails.exception && h.params.exceptionDetails.exception.description);
    T.ok('inga JS-fel', jsfel.length === 0, jsfel);
  } catch (e) {
    T.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    try { if (skal) skal.stang(); } catch {}
    if (p) await H.stang(p);
    try { if (srv) srv.kill(); } catch {}
    x.stoppa();
  }
  console.log(T.text());
  console.log('\nBilder: ' + BILDER);
  const fel = T.fel.length;
  console.log(fel ? `\n${fel} FEL av ${T.rader.length}` : `\nAlla ${T.rader.length} OK`);
  if (fel) console.log('Profil och logg finns kvar: ' + profil);
  else try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  process.exit(fel ? 1 : 0);
}

kor();
