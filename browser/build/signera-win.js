// Kodsignering (Authenticode) av Windows-filerna: AdRaze.exe, DLL:er, .node och installationsprogrammet.
// electron-builder anropar den här för varje fil (win.sign i package.json).
//
// Signeringen slås på med ~/.config/adraze/winsign.json, t.ex. (jsign kan Azure Artifact Signing och PKCS#11):
//   { "kommando": ["jsign", "--storetype", "TRUSTEDSIGNING", "--keystore", "weu.codesigning.azure.net",
//                  "--storepass", "{env:AZURE_TOKEN}", "--alias", "konto/profil", "--tsaurl", "http://timestamp.acs.microsoft.com",
//                  "--tsmode", "RFC3161", "--name", "AdRaze", "--url", "https://adraze.app", "{fil}"] }
// {fil} byts mot filen som ska signeras, {env:NAMN} mot miljövariabeln NAMN (så hemligheter inte ligger i filen).
// Utan filen signeras ingenting (bygget blir osignerat) – tools/win/release.sh vägrar då att släppa.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KONFIG = process.env.ADRAZE_WINSIGN || path.join(os.homedir(), '.config', 'adraze', 'winsign.json');

function konfig() {
  try { const k = JSON.parse(fs.readFileSync(KONFIG, 'utf8')); return Array.isArray(k.kommando) && k.kommando.length ? k : null; } catch { return null; }
}
exports.konfig = konfig;

exports.default = async function signera(c) {
  const k = konfig();
  if (!k) { console.log('[signering] ingen ' + KONFIG + ' — osignerad:', path.basename(c.path)); return; }
  const arg = k.kommando.map((a) => a.replace('{fil}', c.path).replace(/\{env:([A-Z0-9_]+)\}/g, (_, n) => {
    if (process.env[n] == null) throw new Error('[signering] miljövariabeln ' + n + ' saknas');
    return process.env[n];
  }));
  for (let i = 1; ; i++) {   // tidsstämpelservrar svarar ibland inte: några försök
    try { execFileSync(arg[0], arg.slice(1), { stdio: ['ignore', 'inherit', 'inherit'] }); break; }
    catch (e) { if (i >= 3) throw e; console.log('[signering] försök ' + i + ' misslyckades, provar igen'); await new Promise((r) => setTimeout(r, 5000 * i)); }
  }
  console.log('[signering] ✓', path.basename(c.path));
};
