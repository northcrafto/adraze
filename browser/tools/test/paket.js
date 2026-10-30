#!/usr/bin/env node
// Tester mot det färdiga AppImage-paketet (det användarna får), osynligt i Xvfb:
// startar trots ärvd CHROME_DESKTOP, sandlåda (seccomp i flikarna), säkringar, C++-motorn, Widevine,
// rätt Chromium, profil från förra versionen fungerar (kakorna kvar), snäll stängning, inga kärndumpar.
// Användning: node tools/test/paket.js <AdRaze.AppImage> [--forra <förra AdRaze.AppImage>] [--chrome <väntad version>]
const fs = require('fs');
const path = require('path');
const H = require('./hjalp');

async function startaApp(x, appimage, profil, extra = {}) {
  const port = await H.ledigPort();
  const logg = path.join(profil, 'logg-' + path.basename(appimage) + '-' + port + '.txt');
  // CHROME_DESKTOP ärvt från en annan Electron-app fick castlabs-Electron att krascha vid start
  const p = H.starta(appimage, ['--remote-debugging-port=' + port], H.testMiljo(x.display, profil, { CHROME_DESKTOP: 'discord.desktop', ...extra }), logg);
  const version = await H.vantaPaPort(port, 60000);
  const shellT = await H.mal(port, (t) => t.url.includes('shell.html'), 20000);
  return { p, port, logg, version, shellT };
}

async function kakor(port, satt) {
  const b = await H.anslut((await H.hamtaJson(port, '/json/version')).webSocketDebuggerUrl);
  if (satt) await b.skicka('Storage.setCookies', { cookies: [{ name: 'adraze_test', value: 'kvar', domain: '.example.com', path: '/', secure: true, expires: Math.floor(Date.now() / 1000) + 86400 }] });
  const r = await b.skicka('Storage.getCookies', {});
  b.stang();
  return ((r.result && r.result.cookies) || []).some((c) => c.name === 'adraze_test' && c.value === 'kvar');
}

// Flikprocesserna är inte barn till appen (Chromiums zygote dubbelforkar) – hitta dem via AppImage-monteringen
function seccompIFlikar(rotPid) {
  const ut = [];
  const mont = new Set(H.allaUnder(rotPid).map((b) => (H.kommando(b)[0] || '').match(/^\/tmp\/\.mount_[^/]+\//)).filter(Boolean).map((m) => m[0]));
  for (const b of fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
    const c = H.kommando(b);
    if (!c.includes('--type=renderer') || ![...mont].some((m) => (c[0] || '').startsWith(m))) continue;
    try { ut.push(/Seccomp:\s*(\d)/.exec(fs.readFileSync('/proc/' + b + '/status', 'utf8'))[1]); } catch {}
  }
  return ut;
}

async function kor(appimage, { forra, chrome, unpacked } = {}) {
  const R = H.resultat();
  const start = Date.now();
  const x = await H.startaXvfb();
  const profil = H.tempDir('paket');
  let a = null;
  try {
    // 1. Förra versionen skapar profilen (kakor krypteras med nyckelringen) …
    if (forra) {
      const f = await startaApp(x, forra, profil);
      R.ok('förra versionen startade', !!f.shellT);
      R.ok('kaka satt i förra versionen', await kakor(f.port, true));
      R.ok('förra versionen stängdes snällt', await H.stang(f.p));
    }
    // 2. … och den nya tar över samma profil
    a = await startaApp(x, appimage, profil);
    R.ok('nya versionen startade (med ärvd CHROME_DESKTOP)', !!a.shellT, a.version.Browser);
    if (chrome) R.ok('Chromium ' + chrome, a.version.Browser === 'Chrome/' + chrome, a.version.Browser);
    if (forra) R.ok('kakan från förra versionen finns kvar', await kakor(a.port, false));
    await H.sov(3000);
    const text = () => fs.readFileSync(a.logg, 'utf8');
    R.ok('sandlådan på', /\[sandlåda\] på/.test(text()), (text().match(/\[sandlåda\][^\n]*/) || [''])[0]);
    R.ok('C++-adblockmotorn laddad', /\[adblock\] C\+\+-motor/.test(text()));

    const shell = await H.anslut(a.shellT.webSocketDebuggerUrl);
    await shell.kor(`createTab('https://example.com/')`);
    const flikT = await H.mal(a.port, (t) => t.url.startsWith('https://example.com'), 20000);
    R.ok('flik laddad', !!flikT);
    if (flikT) {
      const flik = await H.anslut(flikT.webSocketDebuggerUrl);
      await H.sov(1500);
      const s = seccompIFlikar(a.p.pid);
      R.ok('flikarna i seccomp-sandlåda', s.length > 0 && s.every((v) => v === '2'), s);
      R.ok('ingen Node i sidan', (await flik.kor(`typeof require + '/' + typeof process`)) === 'undefined/undefined');
      const wv = await flik.kor(`navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }]).then((k) => k.keySystem, (e) => 'FEL ' + e.message)`);
      R.ok('Widevine (Netflix m.fl.) tillgängligt', wv === 'com.widevine.alpha', wv);
      await flik.kor(`fetch('https://192.168.1.1/', { mode: 'no-cors', signal: AbortSignal.timeout(6000) }).catch(() => 0).then(() => 1)`);
      await H.sov(500);
      R.ok('natskydd stoppar routern', text().includes('[natskydd] stoppade https://192.168.1.1/'));
      flik.stang();
      // Stäng fliken igen – med flera flikar frågar AdRaze "Stäng alla flikar?" vid avslut (väntat)
      await shell.kor(`closeTab(active); 1`);
      await H.sov(1000);
    }
    shell.stang();

    // 3. Säkringarna i binären
    if (unpacked) {
      const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
      const FuseState = { DISABLE: 48, ENABLE: 49 };   // tecknen '0'/'1' i binären (exporteras inte av @electron/fuses 1.x)
      const bin = ['adraze-browser.bin', 'adraze-browser'].map((n) => path.join(unpacked, n)).find((f) => fs.existsSync(f));
      const w = await getCurrentFuseWire(bin);
      const av = (o) => w[o] === FuseState.DISABLE;
      const pa = (o) => w[o] === FuseState.ENABLE;
      R.ok('säkringar: RunAsNode, NODE_OPTIONS, --inspect av', av(FuseV1Options.RunAsNode) && av(FuseV1Options.EnableNodeOptionsEnvironmentVariable) && av(FuseV1Options.EnableNodeCliInspectArguments));
      R.ok('säkringar: bara app.asar, krypterade kakor', pa(FuseV1Options.OnlyLoadAppFromAsar) && pa(FuseV1Options.EnableCookieEncryption));
      const skript = fs.readFileSync(path.join(unpacked, 'adraze-browser'), 'utf8');
      R.ok('startskriptet nollar CHROME_DESKTOP', /^unset CHROME_DESKTOP$/m.test(skript));
    }

    // 4. Snäll stängning och inga kraschar
    R.ok('stängdes snällt', await H.stang(a.p));
    a = null;
    await H.sov(1500);
    const d = H.karndumpar(start);
    R.ok('inga kärndumpar', d === 0 || d === null, d === null ? 'coredumpctl saknas' : d);
  } catch (e) {
    R.ok('testet kördes klart', false, String(e && e.stack || e));
  } finally {
    if (a) await H.stang(a.p);
    x.stoppa();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  return R;
}

module.exports = { kor };
if (require.main === module) {
  const arg = process.argv.slice(2);
  const val = (k) => { const i = arg.indexOf(k); return i >= 0 ? arg.splice(i, 2)[1] : undefined; };
  const forra = val('--forra'), chrome = val('--chrome'), unpacked = val('--unpacked');
  kor(path.resolve(arg[0] || path.join(__dirname, '..', '..', 'dist-installer', 'AdRaze.AppImage')), { forra, chrome, unpacked: unpacked || path.join(__dirname, '..', '..', 'dist-installer', 'linux-unpacked') })
    .then((R) => { console.log(R.text()); process.exit(R.fel.length ? 1 : 0); });
}
