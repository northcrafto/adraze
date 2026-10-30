// Gemensamt för de automatiska testerna: AdRaze startas ALLTID osynligt (egen Xvfb, inget Wayland),
// styrs via Chromes felsökningsport (CDP) och städas bort efteråt – även AppImage-monteringen.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const sov = (ms) => new Promise((r) => setTimeout(r, ms));

function ledigPort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

function tempDir(namn) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adraze-test-' + namn + '-'));
  fs.chmodSync(d, 0o700);
  return d;
}

// Egen X-server på en ledig skärm. Ingenting får hamna på användarens riktiga skärm.
async function startaXvfb() {
  let n = 90;
  while (fs.existsSync('/tmp/.X11-unix/X' + n) || fs.existsSync('/tmp/.X' + n + '-lock')) n++;   // upptagen (eller kvarlämnad) skärm
  const p = spawn('Xvfb', [':' + n, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 50 && !fs.existsSync('/tmp/.X11-unix/X' + n); i++) await sov(100);
  if (!fs.existsSync('/tmp/.X11-unix/X' + n)) throw new Error('Xvfb startade inte');
  return { display: ':' + n, stoppa: () => { try { process.kill(p.pid, 'SIGTERM'); } catch {} } };   // SIGTERM: Xvfb städar bort uttag och låsfil
}

// Miljön för en testinstans: Wayland bort (annars öppnas fönstret på riktiga skärmen trots Xvfb),
// egen XDG_RUNTIME_DIR utan wayland-uttag, egen profil, inga uppdateringar under testet.
function testMiljo(display, profil, extra = {}) {
  const env = { ...process.env };
  for (const k of ['WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'ELECTRON_OZONE_PLATFORM_HINT', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'APPIMAGE', 'APPDIR']) delete env[k];
  const rt = path.join(profil, 'xdgrt');
  fs.mkdirSync(rt, { recursive: true, mode: 0o700 });
  return { ...env, DISPLAY: display, XDG_RUNTIME_DIR: rt, XDG_CONFIG_HOME: path.join(profil, 'config'), ADRAZE_NO_UPDATES: '1', ...extra };
}

// Startar ett program (dev-electron eller AppImage) i en egen processgrupp och loggar till fil
function starta(prog, args, env, loggfil) {
  const ut = fs.openSync(loggfil, 'a');
  const p = spawn(prog, ['--ozone-platform=x11', ...args], { env, stdio: ['ignore', ut, ut], detached: true });
  fs.closeSync(ut);
  return p;
}

function barn(pid) {
  try { return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch { return []; }
}
function allaUnder(pid) { const ut = []; const ko = [pid]; while (ko.length) { const p = ko.shift(); for (const b of barn(p)) { ut.push(b); ko.push(b); } } return ut; }
function lever(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
// Chromium skriver om processtiteln så att alla argument hamnar i argv[0] – dela på mellanslag i stället
function kommando(pid) { try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').join(' ').trim().split(/\s+/).filter(Boolean); } catch { return []; } }

// Stänger snällt (SIGTERM = app.quit) och väntar; returnerar true om allt dog av sig självt.
// Sedan SIGKILL på hela gruppen och bort med en ev. kvarlämnad AppImage-montering.
async function stang(p, ms = 15000) {
  const monteringar = new Set();
  for (const b of [p.pid, ...allaUnder(p.pid)]) { const m = (kommando(b)[0] || '').match(/^(\/tmp\/\.mount_[^/]+)\//); if (m) monteringar.add(m[1]); }
  const huvud = [p.pid, ...allaUnder(p.pid)].find((b) => { const c = kommando(b); return c.length && !c.some((a) => a.startsWith('--type=')) && /adraze-browser(\.bin)?$|electron$/.test(c[0]); }) || p.pid;
  try { process.kill(huvud, 'SIGTERM'); } catch {}
  let snallt = false;
  for (let i = 0; i < ms / 100; i++) { if (!lever(p.pid) || kommando(p.pid).length === 0) { snallt = true; break; } await sov(100); }
  try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  await sov(300);
  for (const m of monteringar) { try { execFileSync('fusermount', ['-uz', m], { stdio: 'ignore' }); } catch {} }
  return snallt;
}

const hamtaJson = (port, vag) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port, path: vag, timeout: 3000 }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
async function vantaPaPort(port, ms = 40000) {
  for (let i = 0; i < ms / 250; i++) { try { return await hamtaJson(port, '/json/version'); } catch { await sov(250); } }
  throw new Error('felsökningsporten ' + port + ' svarade aldrig');
}

function anslut(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const vant = {}; const handelser = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && vant[m.id]) { vant[m.id](m); delete vant[m.id]; } else handelser.push(m); };
  const skicka = (method, params) => new Promise((res) => { const i = ++id; vant[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const kor = async (expr) => {
    const r = await skicka('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'FEL: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description);
    return r.result && r.result.result ? r.result.result.value : r;
  };
  return new Promise((res, rej) => { ws.onopen = () => res({ ws, skicka, kor, handelser, stang: () => { try { ws.close(); } catch {} } }); ws.onerror = () => rej(new Error('websocket ' + wsUrl)); });
}
async function mal(port, villkor, ms = 15000) {
  for (let i = 0; i < ms / 300; i++) { try { const t = (await hamtaJson(port, '/json')).find(villkor); if (t) return t; } catch {} await sov(300); }
  return null;
}

// Antal kärndumpar från AdRaze sedan en tidpunkt (null om coredumpctl saknas)
function karndumpar(sedan) {
  try {
    const ut = execFileSync('coredumpctl', ['list', '--no-legend', '--no-pager', '--since', '@' + Math.floor(sedan / 1000)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return ut.split('\n').filter((r) => /adraze|electron/i.test(r)).length;
  } catch (e) { return e.status === 1 ? 0 : null; }   // status 1 = inga dumpar
}

// Resultatsamling: varje test är ok/fel med valfri info
function resultat() {
  const rader = [];
  return {
    ok(namn, villkor, info) { rader.push({ namn, ok: !!villkor, info }); },
    rader,
    get fel() { return rader.filter((r) => !r.ok); },
    text() { return rader.map((r) => (r.ok ? 'OK   ' : 'FEL  ') + r.namn + (r.info !== undefined ? '  → ' + JSON.stringify(r.info).slice(0, 200) : '')).join('\n'); },
  };
}

module.exports = { sov, ledigPort, tempDir, startaXvfb, testMiljo, starta, stang, allaUnder, kommando, hamtaJson, vantaPaPort, anslut, mal, karndumpar, resultat };
