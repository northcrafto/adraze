// Packar extension/ till dist/adraze-<version>.zip för Chrome Web Store.
// Utesluter _metadata/ (skapas av Chrome vid okomprimerad laddning) och skräpfiler.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
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
const ut = resolve(rot, "dist", `adraze-${v}.zip`);
if (existsSync(ut)) rmSync(ut);
execFileSync("zip", ["-qr9", "-X", ut, ".", "-x", "_metadata/*", "*.DS_Store", "*~"], { cwd: ext, stdio: "inherit" });
const lista = execFileSync("unzip", ["-Z1", ut], { encoding: "utf8" });
if (/(^|\/)_/m.test(lista)) throw new Error("zip:en innehåller filer som börjar med _");
console.log(`${ut} (${lista.trim().split("\n").length} filer)`);
