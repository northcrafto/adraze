// Startar en EGEN dold AdRaze-instans (Xvfb, egen profil, CDP 9571, inspektör 9572) och kopplar Playwright till den.
// Används av tagbilder.mjs. Ingenting hamnar på den riktiga skärmen, och port 9225 (den riktiga webbläsaren) rörs aldrig.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
export const H = require('/home/mint/adraze/browser/tools/test/hjalp.js');   // testMiljo, starta, stang, anslut, mal …
const { chromium } = require('/home/mint/insta-mcp/node_modules/playwright-core');

export const ROT = '/home/mint/adraze/browser';
export const CDP = 9571, INSP = 9572;
export const sov = H.sov;
export const logg = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Egen X-server. Skärmen rymmer fönstret i vald skala (hjalp.js har 1600 x 1000: för smalt för 1620 x 836).
async function startaXvfb(w, h) {
  const p = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', `${w}x${h}x24`, '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'], detached: true });
  const n = await new Promise((klar) => {
    let buf = '', gjort = false;
    const svar = (v) => { if (gjort) return; gjort = true; clearTimeout(t); klar(v); };
    const t = setTimeout(() => svar(null), 10000);
    p.stdio[3].on('data', (d) => { buf += d; const m = /^(\d+)\s/.exec(buf); if (m) svar(+m[1]); });
    p.once('exit', () => svar(null)); p.once('error', () => svar(null));
  });
  try { p.stdio[3].destroy(); } catch {}
  if (n === null || !fs.existsSync('/tmp/.X11-unix/X' + n)) { try { process.kill(p.pid, 'SIGTERM'); } catch {} throw new Error('Xvfb startade inte'); }
  return { display: ':' + n, pid: p.pid, stoppa: () => { try { process.kill(p.pid, 'SIGTERM'); } catch {} } };
}

/* opt: { bredd, hojd (fönstrets logiska mått), skala (enhetens skalfaktor, 2 = dubbel upplösning som på en högupplöst skärm),
          profil (återanvänd en profil), behall (ta inte bort profilen vid stängning) }
   Ger { skal, sidor, hitta, M (kör i huvudprocessen), S (kör i skalet), bild, stang } */
export async function startaInstans(opt = {}) {
  const B = opt.bredd || 1620, HO = opt.hojd || 836, K = opt.skala || 2;
  const TMP = process.env.VIKBLAD_TMP || '/tmp/claude-1000/-home-mint/3593772e-5b2b-489b-8df0-10920ec3d26b/scratchpad';
  fs.mkdirSync(TMP, { recursive: true });
  const profil = opt.profil || fs.mkdtempSync(path.join(TMP, 'vikblad-profil-'));   // opt.profil: samma profil igen (räknaren ligger kvar)
  fs.chmodSync(profil, 0o700);
  const x = await startaXvfb(B * K + 80, HO * K + 80);
  const env = H.testMiljo(x.display, profil);
  delete env.CHROME_DESKTOP;                                                  // ärvd från andra Electron-appar: castlabs-Electron kraschar annars
  logg('Xvfb', x.display, 'profil', profil);
  // --force-device-scale-factor: allt ritas i K gånger upplösningen, precis som på en högupplöst skärm
  const app = H.starta(path.join(ROT, 'node_modules', 'electron', 'dist', 'electron'),
    ['--inspect=' + INSP, '--force-device-scale-factor=' + K, ROT, '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(profil, 'userdata')], env, path.join(profil, 'logg.txt'));
  logg('electron pid', app.pid);
  let browser = null, m = null;
  const stang = async () => {
    try { if (browser) await browser.close(); } catch {}                      // connectOverCDP: kopplar bara ifrån
    try { if (m) m.stang(); } catch {}
    try { await H.stang(app); } catch (e) { logg('stang:', e.message); }     // via PID, aldrig processgruppen
    x.stoppa();
    if (!opt.behall && !process.env.VIKBLAD_BEHALL) { try { fs.rmSync(profil, { recursive: true, force: true }); } catch {} }
  };
  try {
    await H.vantaPaPort(CDP, 60000);
    const mt = await H.mal(INSP, () => true, 20000);
    m = await H.anslut(mt.webSocketDebuggerUrl); await m.skicka('Runtime.enable');
    const M = (e) => m.kor(e);
    await sov(2500);
    // Riktig fönsterstorlek = ramen i videon. Ingen fönsterhanterare i Xvfb, så måtten gäller direkt.
    logg('fönster', await M(`(() => { const el = process.mainModule.require('electron'); const w = el.BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 0, y: 0, width: ${B}, height: ${HO} }); return JSON.stringify(w.getBounds()) + ' skala ' + el.screen.getPrimaryDisplay().scaleFactor + ' ' + el.app.getPath('userData'); })()`));
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + CDP);
    const sidor = () => browser.contexts().flatMap((c) => c.pages());
    const hitta = async (del, ms = 15000) => { for (let i = 0; i < ms / 250; i++) { const p = sidor().find((s) => s.url().includes(del)); if (p) return p; await sov(250); } return null; };
    const skal = await hitta('shell.html');
    if (!skal) throw new Error('hittade inte skalet');
    return { skal, sidor, hitta, M, profil, stang, B, HO, K };
  } catch (e) {
    try { console.error(fs.readFileSync(path.join(profil, 'logg.txt'), 'utf8').slice(-3000)); } catch {}
    await stang(); throw e;
  }
}
