#!/usr/bin/env node
// Electron-vakten: håller AdRaze på den senaste castlabs-Electron (= Chromiums säkerhetsfixar) utan att
// någon behöver komma ihåg det. Körs av en systemd-timer var 2:a timme:
//   1. jämför vår Electron med castlabs senaste stabila Widevine-bygge (och Electrons egna releaser)
//   2. finns en nyare: byter Electron i en egen git-worktree (rör inte pågående arbete) och kör
//      tools/release.sh, som bygger och testar exakt paketet (säkerhet mot dev + paketet, inklusive att
//      profilen från nuvarande release fungerar) innan det släpps
//   3. allt grönt → släppt (användarna får den via in-app-uppdateringen inom en halvtimme)
//      något rött → ingen release, notis med vad som föll
// Ny huvudversion (t.ex. 44 → 45) släpps också automatiskt, men först när castlabs bygge varit ute i
// VANTA_MAJOR_DAGAR dagar (de första .0-felen hinner rättas) – och bara om alla tester går igenom.
//
//   node tools/electron-vakt.js              kolla, bygg, testa, släpp
//   node tools/electron-vakt.js --koll       bara visa läget
//   node tools/electron-vakt.js --test       kör båda testsviterna mot den här utcheckningen
//   node tools/electron-vakt.js --torr       bygg + testa men släpp inte (--mal <castlabs-tagg> för att prova kedjan)
//   node tools/electron-vakt.js --installera installera systemd-timern
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const BROWSER = path.resolve(__dirname, '..');
const REPO = path.resolve(BROWSER, '..');
const STATE = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'adraze-vakt');
const WT = path.join(STATE, 'worktree');
const LOGG = path.join(STATE, 'logg.txt');
const STATUS = path.join(STATE, 'status.json');
const VANTA_MAJOR_DAGAR = 3;
const LAG_LARM_DAGAR = 4;          // Electron har säkerhetsfix ute så här länge utan castlabs-bygge → notis
const DL_REPO = 'northcrafto/adraze-dl';

fs.mkdirSync(STATE, { recursive: true });
const logg = (...a) => { const r = new Date().toLocaleString('sv-SE') + ' ' + a.join(' '); console.log(r); fs.appendFileSync(LOGG, r + '\n'); };
const lasStatus = () => { try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch { return {}; } };
const sparaStatus = (s) => fs.writeFileSync(STATUS, JSON.stringify(s, null, 2));

function notis(titel, text, bradskande) {
  logg('[notis]', titel, '—', text);
  try { execFileSync('notify-send', ['-a', 'AdRaze', '-i', 'security-high', ...(bradskande ? ['-u', 'critical'] : []), titel, text], { stdio: 'ignore', timeout: 5000 }); } catch {}
}

function kor(cmd, args, opts = {}) {
  logg('$', cmd, ...args);
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  const ut = (r.stdout || '') + (r.stderr || '');
  fs.appendFileSync(LOGG, ut.split('\n').slice(-80).join('\n') + '\n');
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} misslyckades (${r.status}): ${ut.trim().split('\n').slice(-3).join(' | ')}`);
  return ut;
}

// ---- versioner ----
const semver = (v) => String(v).replace(/^v/, '').replace(/\+.*$/, '').split(/[.-]/).slice(0, 3).map(Number);
const storre = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const major = (v) => semver(v)[0];
const dagarSedan = (d) => (Date.now() - new Date(d).getTime()) / 86400000;

function ghJson(api, jq) { return JSON.parse(execFileSync('gh', ['api', api, ...(jq ? ['--jq', jq] : [])], { encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024 })); }

async function hamtaLaget(egenSpec) {
  // castlabs: bara stabila Widevine-byggen (inte alpha/beta), med publiceringsdatum
  const castlabs = ghJson('repos/castlabs/electron-releases/releases?per_page=60', '[.[] | {tag_name, prerelease, draft, published_at}]')
    .filter((r) => !r.prerelease && !r.draft && /^v\d+\.\d+\.\d+\+wvcus$/.test(r.tag_name))
    .map((r) => ({ tag: r.tag_name, version: r.tag_name.slice(1).replace('+wvcus', ''), datum: r.published_at }));
  // Electrons egna releaser: Chromium-version och datum per version, och vilka huvudversioner som stöds
  const r = await fetch('https://releases.electronjs.org/releases.json', { signal: AbortSignal.timeout(30000) });
  const upstream = (await r.json()).filter((x) => /^\d+\.\d+\.\d+$/.test(x.version));
  const majors = [...new Set(upstream.map((x) => major(x.version)))].sort((a, b) => b - a);
  const stodda = majors.slice(0, 3);                                    // Electron stöder de tre senaste
  const nu = (egenSpec.match(/#v([\d.]+)\+wvcus/) || [])[1];
  if (!nu) throw new Error('package.json använder inte castlabs-Electron (' + egenSpec + ')');
  const basta = castlabs.reduce((b, x) => (!b || storre(x.version, b.version) ? x : b), null);
  const sammaMajor = castlabs.filter((x) => major(x.version) === major(nu)).reduce((b, x) => (!b || storre(x.version, b.version) ? x : b), null);
  const chromeFor = (v) => (upstream.find((x) => x.version === v) || {}).chrome || '';
  // Senaste Electron-releasen i vår huvudversion och i den nyaste – ligger castlabs efter?
  const upNyast = (m) => upstream.filter((x) => major(x.version) === m).reduce((b, x) => (!b || storre(x.version, b.version) ? x : b), null);
  return { nu, nuChrome: chromeFor(nu), basta, sammaMajor, stodda, upNyast, chromeFor };
}

// Välj vilken castlabs-version vi ska till, eller null
function valjMal(L) {
  if (!L.basta || !storre(L.basta.version, L.nu)) return null;
  if (major(L.basta.version) > major(L.nu)) {
    if (dagarSedan(L.basta.datum) >= VANTA_MAJOR_DAGAR) return { ...L.basta, nyMajor: true };
    logg(`ny huvudversion ${L.basta.version} är ${dagarSedan(L.basta.datum).toFixed(1)} dagar – väntar till ${VANTA_MAJOR_DAGAR}`);
    if (L.sammaMajor && storre(L.sammaMajor.version, L.nu)) return L.sammaMajor;
    return null;
  }
  return L.basta;
}

// Larm: castlabs ligger efter Electron, eller vår huvudversion håller på att tappa stödet
function larm(L, status) {
  status.larmat = status.larmat || {};
  const en = (nyckel, titel, text, brad) => { if (status.larmat[nyckel]) return; status.larmat[nyckel] = new Date().toISOString(); notis(titel, text, brad); };
  const m = major(L.nu);
  if (!L.stodda.includes(m)) en('eol-' + m, 'AdRaze: Electron ' + m + ' får inga säkerhetsfixar längre', `Electron stöder bara ${L.stodda.join(', ')}. castlabs nyaste stabila: ${L.basta && L.basta.version}.`, true);
  for (const mm of new Set([m, ...L.stodda])) {
    const up = L.upNyast(mm);
    if (!up || mm < m) continue;
    const harCastlabs = (L.basta && !storre(up.version, L.basta.version)) || (L.sammaMajor && mm === m && !storre(up.version, L.sammaMajor.version));
    if (!harCastlabs && storre(up.version, L.nu) && dagarSedan(up.date) >= LAG_LARM_DAGAR) {
      en('lag-' + up.version, 'AdRaze: castlabs ligger efter', `Electron ${up.version} (Chromium ${up.chrome}) kom för ${Math.floor(dagarSedan(up.date))} dagar sedan, men castlabs har inte släppt Widevine-bygget. Vi kör ${L.nu}.`);
    }
  }
}

// ---- bygg + test ----
async function testa(rot, appimage, forra, chrome) {
  const sak = await require(path.join(rot, 'tools', 'test', 'sakerhet.js')).kor(rot);
  logg('säkerhetstester (dev):\n' + sak.text());
  const pak = await require(path.join(rot, 'tools', 'test', 'paket.js')).kor(appimage, { forra, chrome, unpacked: path.join(rot, 'dist-installer', 'linux-unpacked') });
  logg('pakettester:\n' + pak.text());
  return [...sak.fel, ...pak.fel];
}

function forraRelease(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  kor('gh', ['release', 'download', '-R', DL_REPO, '-p', 'AdRaze.AppImage', '-D', dir]);
  const f = path.join(dir, 'AdRaze.AppImage');
  fs.chmodSync(f, 0o755);
  return f;
}

function nyWorktree() {
  kor('git', ['-C', REPO, 'fetch', '-q', 'origin', 'main']);
  try { kor('git', ['-C', REPO, 'worktree', 'remove', '--force', WT]); } catch {}
  fs.rmSync(WT, { recursive: true, force: true });
  kor('git', ['-C', REPO, 'worktree', 'prune']);
  kor('git', ['-C', REPO, 'worktree', 'add', '-q', '-B', 'electron-vakt', WT, 'origin/main']);
  // Filterlistorna (EasyList m.fl.) är inte incheckade – ta dem från huvudutcheckningen
  const listor = path.join(REPO, 'tools', 'lists');
  if (fs.existsSync(listor)) fs.cpSync(listor, path.join(WT, 'tools', 'lists'), { recursive: true });
  return path.join(WT, 'browser');
}

async function uppdatera({ torr, tvinga }) {
  const status = lasStatus();
  const egen = JSON.parse(execFileSync('git', ['-C', REPO, 'show', 'origin/main:browser/package.json'], { encoding: 'utf8' }));
  const L = await hamtaLaget(egen.dependencies.electron || egen.devDependencies.electron);
  status.senastKoll = new Date().toISOString();
  status.nu = { electron: L.nu, chromium: L.nuChrome };
  status.castlabsNyast = L.basta && L.basta.version;
  larm(L, status);
  const mal = tvinga ? { tag: tvinga, version: tvinga.slice(1).replace('+wvcus', '') } : valjMal(L);
  if (!mal) { logg(`aktuell: Electron ${L.nu} (Chromium ${L.nuChrome}), castlabs nyaste ${L.basta && L.basta.version}`); sparaStatus(status); return 0; }
  if (status.misslyckad && status.misslyckad.version === mal.version && !torr) {
    // Samma version föll förra gången – försök igen högst var 12:e timme (kan ha varit nätet)
    if (Date.now() - new Date(status.misslyckad.tid).getTime() < 12 * 3600000) { logg('väntar med', mal.version, '(föll', status.misslyckad.tid + ')'); sparaStatus(status); return 0; }
  }
  const chrome = L.chromeFor(mal.version);
  logg(`=== uppdaterar Electron ${L.nu} → ${mal.version} (Chromium ${L.nuChrome} → ${chrome})${mal.nyMajor ? ' NY HUVUDVERSION' : ''}`);
  try {
    const rot = nyWorktree();
    const pj = path.join(rot, 'package.json');
    const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
    const nyckel = p.dependencies.electron ? 'dependencies' : 'devDependencies';
    p[nyckel].electron = 'github:castlabs/electron-releases#' + mal.tag;
    fs.writeFileSync(pj, JSON.stringify(p, null, 2) + '\n');
    kor('npm', ['install', '--no-audit', '--no-fund'], { cwd: rot });
    kor('node', ['node_modules/electron/install.js'], { cwd: rot });    // npm hoppar ibland nedladdningen av binären
    const fick = fs.readFileSync(path.join(rot, 'node_modules', 'electron', 'dist', 'version'), 'utf8').trim();
    if (fick !== mal.version + '+wvcus') throw new Error('fel Electron installerad: ' + fick);
    const not = `Säkerhetsuppdatering: Chromium ${chrome} med de senaste säkerhetsfixarna (Electron ${mal.version})`;
    if (torr) {
      kor('npm', ['run', 'build:linux', '--', '--publish', 'never'], { cwd: rot });
      const fel = await testa(rot, path.join(rot, 'dist-installer', 'AdRaze.AppImage'), forraRelease(path.join(STATE, 'forra')), chrome);
      if (fel.length) throw new Error(fel.length + ' test föll: ' + fel.map((f) => f.namn).join(', '));
      logg('torrkörning: allt grönt, släpper inte');
      delete status.misslyckad;
      return 0;
    }
    kor('bash', ['tools/release.sh', not], { cwd: rot });          // bygger, testar exakt paketet, släpper
    const v = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
    status.senastSlappt = { version: v, electron: mal.version, chromium: chrome, tid: new Date().toISOString() };
    delete status.misslyckad;
    status.nu = { electron: mal.version, chromium: chrome };
    notis('AdRaze ' + v + ' släppt', `Electron ${mal.version} / Chromium ${chrome}. Alla säkerhetstester gröna.`);
    return 0;
  } catch (e) {
    status.misslyckad = { version: mal.version, tid: new Date().toISOString(), fel: String(e.message || e).slice(0, 500) };
    notis('AdRaze: Electron ' + mal.version + ' släpptes INTE', String(e.message || e).slice(0, 240) + ` — se ${LOGG}`, true);
    return 1;
  } finally {
    sparaStatus(status);
  }
}

// ---- systemd ----
function installera() {
  const dir = path.join(os.homedir(), '.config', 'systemd', 'user');
  fs.mkdirSync(dir, { recursive: true });
  const nodeBin = process.execPath;
  fs.writeFileSync(path.join(dir, 'adraze-electron-vakt.service'), `[Unit]
Description=AdRaze: håll Electron/Chromium uppdaterad (bygg, testa, släpp)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${BROWSER}
Environment=PATH=${path.dirname(nodeBin)}:/usr/local/bin:/usr/bin:/bin
# Testerna startar AdRaze i egen Xvfb – aldrig på den riktiga skärmen
UnsetEnvironment=WAYLAND_DISPLAY DISPLAY XDG_SESSION_TYPE
ExecStart=${nodeBin} ${path.join(BROWSER, 'tools', 'electron-vakt.js')}
Nice=10
TimeoutStartSec=90min
`);
  fs.writeFileSync(path.join(dir, 'adraze-electron-vakt.timer'), `[Unit]
Description=AdRaze Electron-vakt var 2:a timme

[Timer]
OnBootSec=10min
OnUnitActiveSec=2h
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
`);
  execFileSync('systemctl', ['--user', 'daemon-reload']);
  execFileSync('systemctl', ['--user', 'enable', '--now', 'adraze-electron-vakt.timer']);
  console.log(execFileSync('systemctl', ['--user', 'list-timers', 'adraze-electron-vakt.timer', '--no-pager'], { encoding: 'utf8' }));
}

// ---- lås: aldrig två körningar samtidigt ----
function las() {
  const f = path.join(STATE, 'las');
  try {
    const pid = Number(fs.readFileSync(f, 'utf8'));
    if (pid && pid !== process.pid) { try { process.kill(pid, 0); console.log('vakten kör redan (pid ' + pid + ')'); process.exit(0); } catch {} }
  } catch {}
  fs.writeFileSync(f, String(process.pid));
  process.on('exit', () => { try { if (Number(fs.readFileSync(f, 'utf8')) === process.pid) fs.unlinkSync(f); } catch {} });
}

(async () => {
  const a = process.argv.slice(2);
  if (a.includes('--installera')) return installera();
  if (a.includes('--koll')) {
    const p = JSON.parse(fs.readFileSync(path.join(BROWSER, 'package.json'), 'utf8'));
    const L = await hamtaLaget(p.dependencies.electron || p.devDependencies.electron);
    const mal = valjMal(L);
    console.log(`Vi: Electron ${L.nu} (Chromium ${L.nuChrome})\ncastlabs nyaste stabila: ${L.basta && L.basta.version} (${L.basta && L.basta.datum.slice(0, 10)})\nElectron stöder: ${L.stodda.join(', ')}\n` +
      L.stodda.map((m) => { const u = L.upNyast(m); return `  Electron ${m}: ${u.version} (Chromium ${u.chrome}, ${u.date})`; }).join('\n') +
      `\n→ ${mal ? 'uppdatera till ' + mal.version + (mal.nyMajor ? ' (ny huvudversion)' : '') : 'inget att göra'}`);
    const s = lasStatus(); if (s.misslyckad) console.log('senast misslyckad:', JSON.stringify(s.misslyckad));
    return;
  }
  las();
  if (a.includes('--test')) {
    const fel = await testa(BROWSER, path.join(BROWSER, 'dist-installer', 'AdRaze.AppImage'), a.includes('--utan-forra') ? null : forraRelease(path.join(STATE, 'forra')), '');
    process.exit(fel.length ? 1 : 0);
  }
  const tv = a.includes('--mal') ? a[a.indexOf('--mal') + 1] : null;   // t.ex. --torr --mal v44.9.3+wvcus: prova hela kedjan
  if (tv && !a.includes('--torr')) throw new Error('--mal bara tillsammans med --torr');
  process.exit(await uppdatera({ torr: a.includes('--torr'), tvinga: tv }));
})().catch((e) => { logg('VAKTFEL', String(e && e.stack || e)); notis('AdRaze Electron-vakt kraschade', String(e.message || e).slice(0, 200), true); process.exit(1); });
