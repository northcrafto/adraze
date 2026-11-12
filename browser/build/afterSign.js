// Windows: castlabs VMP-signering (Widevine/Netflix) EFTER kodsigneringen – castlabs kräver den ordningen på Windows
// (på macOS tvärtom, se afterPack.js). electron-builder ändrar dessutom AdRaze.exe (ikon, versionsinfo) efter
// afterPack, så en VMP-signatur gjord där blir ogiltig. Övriga plattformar: inget här.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;
  const venv = path.join(os.homedir(), '.castlabs-evs-venv', 'bin', 'python');
  const py = fs.existsSync(venv) ? venv : (process.env.EVS_PYTHON || 'python3');
  if (!fs.existsSync(path.join(os.homedir(), '.config', 'evs', 'config.json')) && !process.env.EVS_FORCE) {
    console.warn('[VMP] ⚠  Inget castlabs EVS-konto — Widevine/Netflix fungerar INTE i detta Windows-bygge.');
    return;
  }
  console.log('[VMP] Signerar win32 efter kodsigneringen:', context.appOutDir);
  execFileSync(py, ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], { stdio: 'inherit' });
  console.log('[VMP] ✓ Klart — Widevine aktiverat i Windows-bygget.');
};
