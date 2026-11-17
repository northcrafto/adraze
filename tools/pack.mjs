// Packar extension/ till dist/adraze-<version>.zip för Chrome Web Store.
// Utesluter _metadata/ (skapas av Chrome vid okomprimerad laddning) och skräpfiler.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ext = resolve(rot, "extension");
const manifest = JSON.parse(readFileSync(resolve(ext, "manifest.json"), "utf8"));
const v = manifest.version;
if (!/^\d+(\.\d+){0,3}$/.test(v)) throw new Error(`ogiltig version: ${v}`);

const anvanda = new Set(["declarativeNetRequest", "declarativeNetRequestFeedback", "storage", "webNavigation", "scripting", "alarms"]);
for (const p of manifest.permissions) if (!anvanda.has(p)) throw new Error(`behörighet utan motivering i butiken: ${p}`);

mkdirSync(resolve(rot, "dist"), { recursive: true });
const UTESLUT = ["-x", "_metadata/*", "*.DS_Store", "*~"];
function kontroll(ut) {
  const lista = execFileSync("unzip", ["-Z1", ut], { encoding: "utf8" });
  if (/(^|\/)_(?!locales\/)/m.test(lista)) throw new Error("zip:en innehåller filer som börjar med _ (bara _locales/ är tillåten)");
  console.log(`${ut} (${lista.trim().split("\n").length} filer)`);
}

// Chrome Web Store. Samma zip tas emot av Edge Add-ons och Opera Addons (Chromium, MV3).
const ut = resolve(rot, "dist", `adraze-${v}.zip`);
if (existsSync(ut)) rmSync(ut);
execFileSync("zip", ["-qr9", "-X", ut, ".", ...UTESLUT], { cwd: ext, stdio: "inherit" });
kontroll(ut);

// Firefox (addons.mozilla.org): `node pack.mjs firefox`. Samma kod, eget manifest:
// bakgrundssida i stället för service worker, eget tilläggs-id och inga Chrome-nycklar.
if (process.argv.includes("firefox")) {
  const tmp = resolve(rot, "dist", "firefox");
  rmSync(tmp, { recursive: true, force: true });
  cpSync(ext, tmp, { recursive: true, filter: (f) => !/(^|\/)_metadata(\/|$)/.test(f) });
  const m = structuredClone(manifest);
  m.background = { scripts: ["background.js"], type: "module" };
  delete m.minimum_chrome_version;
  for (const r of m.web_accessible_resources) delete r.use_dynamic_url;
  m.browser_specific_settings = { gecko: { id: "adraze@adraze.app", strict_min_version: "128.0" } };
  writeFileSync(resolve(tmp, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  const ff = resolve(rot, "dist", `adraze-${v}-firefox.zip`);
  if (existsSync(ff)) rmSync(ff);
  execFileSync("zip", ["-qr9", "-X", ff, ".", ...UTESLUT], { cwd: tmp, stdio: "inherit" });
  kontroll(ff);
}
