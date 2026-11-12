// Gemensamt för chattens tester: en egen kopia av adraze-api (tom temp-databas, mejl bara loggade) och
// dolda AdRaze-instanser som loggas in med testkonton. Rör aldrig produktionsdatabasen eller riktiga konton.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const H = require('./hjalp');

// adraze-api ligger bredvid adraze-repot (~/adraze-api); ADRAZE_API_REPO pekar om
function apiRepo(rot) {
  const kand = [process.env.ADRAZE_API_REPO, path.resolve(rot, '..', '..', 'adraze-api'), path.join(os.homedir(), 'adraze-api')].filter(Boolean);
  return kand.find((d) => fs.existsSync(path.join(d, 'chatt.js')));
}

async function startaServer(rot) {
  const repo = apiRepo(rot);
  if (!repo) throw new Error('hittar inte adraze-api (sätt ADRAZE_API_REPO)');
  const port = await H.ledigPort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adraze-chatt-api-'));
  for (const f of fs.readdirSync(repo)) if (f.endsWith('.js')) fs.copyFileSync(path.join(repo, f), path.join(tmp, f));
  let logg = '';
  const srv = spawn(process.execPath, ['--no-warnings', path.join(tmp, 'server.js')], {
    cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), KOLLA_PORT: String(await H.ledigPort()), MAIL_LOGG: '1', CHATT_HOTLISTOR: '0', BREVO_API_KEY: '', CLAMD_PORT: '1', CHATT_NYCKEL: crypto.randomBytes(32).toString('hex') },
  });
  srv.stdout.on('data', (d) => { logg += d; });
  srv.stderr.on('data', (d) => { logg += d; });
  for (let i = 0; i < 200 && !logg.includes('adraze-api på'); i++) await H.sov(50);
  if (!logg.includes('adraze-api på')) { try { srv.kill(); } catch {} throw new Error('adraze-api startade inte: ' + logg.slice(-800)); }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(tmp, 'adraze.db'));
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const bas = 'http://127.0.0.1:' + port;
  return {
    bas, db, logg: () => logg,
    // Ett verifierat AdRaze-konto med en inloggad session (som webbläsaren får efter inloggning)
    nyAnvandare(email, namn) {
      const id = Number(db.prepare('INSERT INTO users(email,verified,created_at,namn) VALUES(?,1,?,?)').run(email, Date.now(), namn || null).lastInsertRowid);
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(sha(token), id, Date.now() + 86_400_000);
      return { id, token, email, namn };
    },
    async api(vem, metod, p, kropp) {
      const r = await fetch(bas + p, { method: metod, headers: { authorization: 'Bearer ' + vem.token, ...(kropp ? { 'content-type': 'application/json' } : {}) }, body: kropp ? JSON.stringify(kropp) : undefined });
      let j = null; try { j = await r.json(); } catch {}
      return { s: r.status, j };
    },
    stang() { try { db.close(); } catch {} try { srv.kill(); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} },
  };
}

// En dold AdRaze med egen profil och CDP-port. extraArgs: t.ex. låtsas-mikrofon.
async function startaInstans(rot, x, namn, apiBas, extraArgs = [], cdpPort) {
  const profil = H.tempDir('chatt-' + namn);
  const logg = path.join(profil, 'logg.txt');
  const cdp = cdpPort || await H.ledigPort();
  const electron = path.join(rot, 'node_modules', 'electron', 'dist', 'electron');
  const p = H.starta(electron, [rot, '--remote-debugging-port=' + cdp, ...extraArgs], H.testMiljo(x.display, profil, { ADRAZE_API: apiBas }), logg);
  await H.vantaPaPort(cdp);
  const skalT = await H.mal(cdp, (t) => t.url.includes('shell.html'), 20000);
  if (!skalT) throw new Error(namn + ': skalet startade inte');
  const s = await H.anslut(skalT.webSocketDebuggerUrl); await s.skicka('Runtime.enable');
  await H.sov(2500);
  const inst = { namn, p, cdp, profil, logg, s, K: (e) => s.kor(e), c: null };
  // Logga in skalet med kontots token och öppna chatten
  inst.loggaIn = async (konto) => {
    await inst.K(`account = { email: ${JSON.stringify(konto.email)}, token: ${JSON.stringify(konto.token)}, name: ${JSON.stringify(konto.namn || '')}, pro: false }; openChatt(true); 1`);
    const t = await H.mal(cdp, (t) => t.url.includes('/ui/chatt.html'), 15000);
    if (!t) throw new Error(namn + ': chattpanelen öppnades inte');
    inst.c = await H.anslut(t.webSocketDebuggerUrl); await inst.c.skicka('Runtime.enable'); await inst.c.skicka('Page.enable');
    inst.C = (e) => inst.c.kor(e);
    inst.J = async (e) => JSON.parse(await inst.C(`JSON.stringify(${e})`));
    return inst;
  };
  inst.vanta = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await inst.C(`!!(${expr})`) === true) return true; await H.sov(200); } return false; };
  inst.bild = async (fil, clip) => {
    const r = await inst.c.skicka('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    if (r.result && r.result.data) fs.writeFileSync(fil, Buffer.from(r.result.data, 'base64'));
    return fil;
  };
  // Skärmbild av hela fönstret (skalet + flikar + chatten): skalets target räcker inte, flikarna är egna vyer
  inst.helBild = async (fil) => {
    const r = await inst.s.skicka('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) fs.writeFileSync(fil, Buffer.from(r.result.data, 'base64'));
    return fil;
  };
  inst.fel = () => (inst.c ? inst.c.handelser : []).filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
  inst.stang = async () => { try { if (inst.c) inst.c.stang(); s.stang(); } catch {} await H.stang(p); try { fs.rmSync(profil, { recursive: true, force: true }); } catch {} };
  return inst;
}

// Välj användarnamn i chatten (första gången) och vänta tills appen syns
async function skapaProfil(inst, anvnamn) {
  if (!(await inst.vanta(`!document.getElementById('view-create').hidden || !document.getElementById('view-app').hidden`))) throw new Error(inst.namn + ': chatten kom aldrig igång');
  if (await inst.C(`!document.getElementById('view-create').hidden`)) {
    await inst.C(`document.getElementById('create-username').value = ${JSON.stringify(anvnamn)}; document.getElementById('btn-create').click(); 1`);
  }
  if (!(await inst.vanta(`!document.getElementById('view-app').hidden && state && myPriv`))) throw new Error(inst.namn + ': profilen skapades inte');
}

module.exports = { startaServer, startaInstans, skapaProfil, apiRepo };
