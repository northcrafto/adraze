// VMP-signerar Windows/macOS-paket så Widevine (Netflix m.fl.) funkar i den
// distribuerade appen. LINUX behöver INGEN VMP-signering (Widevine L3 funkar utan)
// och castlabs sign-pkg stödjer inte Linux — hoppas därför över.
// Kräver ett castlabs EVS-konto EN gång (~/.castlabs-evs-venv/bin/python -m castlabs_evs.account signup).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function evsPython() {
  const venv = path.join(os.homedir(), '.castlabs-evs-venv', 'bin', 'python');
  return fs.existsSync(venv) ? venv : (process.env.EVS_PYTHON || 'python3');
}

// Electron-säkringar: bränns in i programfilen så att ingen kan köra AdRaze som ett vanligt
// Node-program (ELECTRON_RUN_AS_NODE), smyga in kod via NODE_OPTIONS, koppla på en debugger
// med --inspect eller ladda en app utanför app.asar. Kakorna krypteras på disken (nyckelringen),
// som i Chrome/Brave. Görs före VMP-signeringen (signaturen måste täcka den ändrade filen).
async function brannSakringar(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  const namn = context.packager.appInfo.productFilename;
  const plat = context.electronPlatformName;
  const exe = plat === 'darwin' ? path.join(context.appOutDir, namn + '.app')
    : plat === 'win32' ? path.join(context.appOutDir, namn + '.exe')
    : path.join(context.appOutDir, context.packager.executableName);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: plat === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
  });
  console.log('[säkringar] inbrända i', exe);
}

/* Linux: programfilen blir ett litet startskript runt den riktiga binären (som google-chrome).
 * castlabs-Electron kraschar direkt vid start om miljövariabeln CHROME_DESKTOP finns
 * (FATAL zygote_host_impl_linux.cc:221 "Check failed: . : Invalid argument", även med
 * --no-sandbox; vanlig Electron gör det inte). Den ärvs från alla Electron-appar: den gamla
 * AdRaze när uppdateringen startar om, Discord/VS Code när man klickar på en länk … */
function startskript(context) {
  const namn = context.packager.executableName;
  const bin = path.join(context.appOutDir, namn);
  fs.renameSync(bin, bin + '.bin');
  fs.writeFileSync(bin, [
    '#!/bin/sh',
    '# AdRaze: castlabs-Electron kraschar om CHROME_DESKTOP ärvs från en annan Electron-app (se build/afterPack.js)',
    'unset CHROME_DESKTOP',
    `exec "$(dirname "$(readlink -f "$0")")/${namn}.bin" "$@"`,
    '',
  ].join('\n'), { mode: 0o755 });
  console.log('[startskript]', bin, '→', namn + '.bin');
}

exports.default = async function afterPack(context) {
  const plat = context.electronPlatformName; // 'linux' | 'darwin' | 'win32'
  // macOS: castlabs VMP-signerar bara en oförändrad Electron Framework (säkringarna ligger i den),
  // och säkringar efter VMP gör signaturen ogiltig – testat 2026-11-01 ("Binary signature denied" /
  // "InvalidSignature"). Netflix/Widevine valdes före säkringarna på Mac. Windows: samma krock ("Binary signature
  // denied", testat 2026-11-12) – samma val. Linux (ingen VMP): säkringar som förut.
  if (plat === 'linux') await brannSakringar(context);
  else console.log('[säkringar] hoppas över på ' + plat + ' (krockar med castlabs VMP-signering)');
  if (plat === 'linux') startskript(context);
  if (plat === 'linux') {
    console.log('[VMP] Linux behöver ingen VMP-signering (Widevine L3 funkar utan) — hoppar över.');
    return;
  }
  if (plat === 'win32') { console.log('[VMP] Windows signeras i afterSign.js (efter kodsigneringen)'); return; }
  const appOutDir = context.appOutDir;
  // macOS universal: x64- och arm64-delarna (…-x64-temp/…-arm64-temp) slås ihop efteråt och VMP-signaturen
  // (Electron Framework.sig) skiljer sig per del → sammanslagningen vägrar. Signera bara den färdiga universella appen.
  if (plat === 'darwin' && /-(x64|arm64)-temp$/.test(appOutDir)) {
    // castlabs-paketen har redan en utvecklar-.sig per arkitektur – ta bort den, annars är delarna olika
    const fw = path.join(appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources');
    for (const f of fs.existsSync(fw) ? fs.readdirSync(fw) : []) if (f.endsWith('.sig')) fs.rmSync(path.join(fw, f));
    console.log('[VMP] universell del – signeras efter sammanslagningen');
    return;
  }
  const py = evsPython();
  const evsCfg = path.join(os.homedir(), '.config', 'evs', 'config.json');
  if (!fs.existsSync(evsCfg) && !process.env.EVS_FORCE) {
    console.warn('\n[VMP] ⚠  Inget castlabs EVS-konto (~/.config/evs/config.json saknas).');
    console.warn('[VMP] ⚠  Hoppar över signering — Widevine/Netflix funkar INTE i detta win/mac-bygge.\n');
    return;
  }
  console.log('[VMP] Signerar', plat, 'paket:', appOutDir);
  execFileSync(py, ['-m', 'castlabs_evs.vmp', 'sign-pkg', appOutDir], { stdio: 'inherit' });
  console.log('[VMP] ✓ Klart — Widevine aktiverat i bygget.');
};
