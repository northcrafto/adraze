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

exports.default = async function afterPack(context) {
  const plat = context.electronPlatformName; // 'linux' | 'darwin' | 'win32'
  await brannSakringar(context);
  if (plat === 'linux') {
    console.log('[VMP] Linux behöver ingen VMP-signering (Widevine L3 funkar utan) — hoppar över.');
    return;
  }
  const appOutDir = context.appOutDir;
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
