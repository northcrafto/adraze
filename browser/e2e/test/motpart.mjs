// Motparten i iPhone-appens självtest `-mode e2e`. Startar en lokal kopia av adraze-api med /chatt/v2 (egen
// tillfällig databas) på tailnet-adressen, lägger in testkonton och kör Node-klienter med datorns E2E-modul:
// Bo och Cia (E2E på datorn), Dan (bara den äldre chatten) och senare "Alvas dator" (länkas med iPhonen).
// Appen styr testet över en liten HTTP-yta. Bara testdata; inget av detta går mot produktion.
//
//   node browser/e2e/test/motpart.mjs
//   cd ios && ./fran-mint.sh -n e2e e2e ~/adraze-app/skarm -- -api http://100.122.13.91:18791 -testkod 246810 -motpart http://100.122.13.91:18792
//
// Miljö: HOST (100.122.13.91), PORT (18791, servern), STYR (18792, styrytan), ADRAZE_API (~/adraze-api-e2e).
// Stoppas med SIGTERM (tar bort den tillfälliga katalogen och stoppar servern).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { E2EKlient, MinnesLagring } = require('../klient.js');

const HOST = process.env.HOST || '100.122.13.91';
const PORT = Number(process.env.PORT || 18791);
const STYR = Number(process.env.STYR || 18792);
const REPO = process.env.ADRAZE_API || path.join(os.homedir(), 'adraze-api-e2e');
const KOD = '246810', LOSEN = 'Testlosen-2026';
const BAS = `http://${HOST}:${PORT}`;
const logg = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- servern: en kopia med testpatchar (fast inloggningskod, inga gränser, tailnet-adressen) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adraze-e2e-motpart-'));
for (const f of fs.readdirSync(REPO)) if (f.endsWith('.js')) fs.copyFileSync(path.join(REPO, f), path.join(tmp, f));
{
  const p = path.join(tmp, 'server.js');
  let s = fs.readFileSync(p, 'utf8');
  const byt = (a, b) => { if (!s.includes(a)) throw new Error('patchen hittar inte: ' + a.slice(0, 60)); s = s.split(a).join(b); };
  byt("String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')", "(process.env.TESTKOD || String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'))");
  byt('function begransad(nyckel, max, fonsterMs) {\n', "function begransad(nyckel, max, fonsterMs) {\n  if (process.env.UTAN_GRANSER === '1') return false;\n");
  byt("server.listen(PORT, '127.0.0.1',", "server.listen(PORT, process.env.HOST || '127.0.0.1',");
  fs.writeFileSync(p, s);
}
const srv = spawn(process.execPath, ['--no-warnings', path.join(tmp, 'server.js')], {
  cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'],
  env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), HOST, MAIL_LOGG: '1', BREVO_API_KEY: '', CLAMD_PORT: '1',
    CHATT_HOTLISTOR: '0', CHATT_NYCKEL: crypto.randomBytes(32).toString('hex'), TESTKOD: KOD, UTAN_GRANSER: '1' },
});
let serverlogg = '';
srv.stdout.on('data', (d) => { serverlogg += d; });
srv.stderr.on('data', (d) => { serverlogg += d; process.stderr.write('[server] ' + d); });
let styr = null;
function stang() {
  try { srv.kill(); } catch {}
  try { styr?.close(); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
process.on('exit', stang);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { logg('stoppar'); stang(); process.exit(0); });
for (let i = 0; i < 100 && !serverlogg.includes('adraze-api på'); i++) await new Promise((r) => setTimeout(r, 50));
if (!serverlogg.includes('adraze-api på')) { console.error(serverlogg); throw new Error('servern startade inte'); }
const db = new DatabaseSync(path.join(tmp, 'adraze.db'));
db.exec('PRAGMA busy_timeout = 5000');

// ---------- konton och den äldre chatten (samma krypto som datorns ui/chatt.js, v1) ----------
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const b64 = (u) => Buffer.from(u).toString('base64');
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
async function api(metod, sokvag, kropp, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(BAS + sokvag, { method: metod, headers: h, body: metod === 'POST' ? JSON.stringify(kropp || {}) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(`${metod} ${sokvag}: ${r.status} ${j.message || j.error || ''}`);
  return j;
}
async function konto(email, namn) {
  let r = await api('POST', '/auth/signup', { email, password: LOSEN, namn, app: true });
  if (!r.token) r = await api('POST', '/auth/verify', { email, code: KOD, app: true });
  return r.token;
}
const sha256 = async (s) => new Uint8Array(await subtle.digest('SHA-256', enc.encode(s)));
async function aesEnc(key, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const blob = new Uint8Array(12 + ct.length); blob.set(iv, 0); blob.set(ct, 12); return b64(blob);
}
async function chattprofil(token, username) {
  const r0 = await api('GET', '/chatt/nyckel', null, token);
  const wrapKey = await subtle.importKey('raw', await sha256('adraze-chatt-wrap-v1:' + r0.secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const loginHash = b64(await sha256('adraze-chatt-auto-v1:' + r0.secret));
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const pub = b64(new Uint8Array(await subtle.exportKey('raw', kp.publicKey)));
  const encPriv = await aesEnc(wrapKey, new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey)));
  const r = await api('POST', '/chatt/registrera', { username, login_hash: loginHash, public_key: pub, enc_priv: encPriv }, token);
  return { id: String(r.id), username: r.username, pub, priv: kp.privateKey, token };
}
async function v1Text(fran, till, text) {
  const pub = await subtle.importKey('raw', fromB64(till.pub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await subtle.deriveKey({ name: 'ECDH', public: pub }, fran.priv, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await api('POST', '/chatt/messages/send', { to_id: till.id, ciphertext: await aesEnc(key, enc.encode(text)) }, fran.token);
}
async function vanner(a, b) {
  await api('POST', '/chatt/contacts/request', { username: b.username }, a.token);
  await api('POST', '/chatt/contacts/accept', { username: a.username }, b.token);
}

const folk = {};
for (const [n, namn] of [['alva', 'Alva'], ['bo', 'Bosse'], ['cia', 'Cia'], ['dan', 'Dan']]) folk[n] = await chattprofil(await konto(`${n}@e2e.test`, namn), namn);
await vanner(folk.alva, folk.bo); await vanner(folk.alva, folk.cia); await vanner(folk.alva, folk.dan); await vanner(folk.bo, folk.cia);
// Gammal historik från före E2E (den äldre krypteringen) i Alvas och Bos chatt
await v1Text(folk.bo, folk.alva, 'Hej Alva! Det här skrevs innan chatten blev end-to-end-krypterad.');

// ---------- E2E-klienterna (datorns modul, wasm-kärnan) ----------
const klienter = {};
function nyKlient(vem, anv, namn) {
  const k = new E2EKlient({ api: BAS, token: anv.token, lagring: new MinnesLagring(), namn, plattform: 'dator', logg: (t) => logg(vem + ':', t) });
  k.mottaget = [];
  k.vem = vem;
  klienter[vem] = k;
  return k;
}
for (const [vem, namn] of [['bo', 'Bos dator'], ['cia', 'Cias dator']]) {
  const k = await nyKlient(vem, folk[vem], namn).oppna();
  await k.skapaIdentitet();
}
let kor = true;
async function lyssna(k) {
  while (kor) {
    try {
      const h = await k.hamta({ vanta: 20 });
      for (const x of h) {
        k.mottaget.push(x);
        logg(`${k.vem} fick ${x.typ}${x.d?.text ? ' "' + x.d.text + '"' : ''}${x.fel ? ' (' + x.fel + ')' : ''}`);
      }
    } catch (e) { logg(k.vem, 'kön:', e.message); await new Promise((r) => setTimeout(r, 1000)); }
  }
}
lyssna(klienter.bo); lyssna(klienter.cia);

// ---------- styrytan ----------
const bild = (() => { try { return fs.readFileSync(path.join(os.homedir(), 'adraze/site/bilder/stockholm-900.webp')); } catch { return null; } })();
const hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const vantaPa = async (villkor, max) => { const slut = Date.now() + max * 1000; while (Date.now() < slut) { const v = await villkor(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } return null; };
const uuidFor = async (k, id) => (await k.personer([id]))[0]?.uuid;
let lank = null;       // länkning där Alvas dator är ny (visar QR)
let skanning = null;   // länkning där Alvas dator skannar iPhonens QR
const KOLUMNER = 'user_id,enhet,typ,fran_user,fran_enhet,grupp,sid,mt,data,chiffer_id,ts,urgent,utgar';
const egenIdentitet = {};

async function alvaUuid() { return uuidFor(klienter.bo, folk.alva.id); }
// De negativa fallen ändrar kuverten med en trigger i samma ögonblick som servern lägger dem i kön, så att ingen
// mottagare hinner hämta originalet först (Alvas dator lyssnar hela tiden).
db.exec(`CREATE TABLE IF NOT EXISTS prov_logg(typ TEXT, ko_id INTEGER); CREATE TABLE IF NOT EXISTS prov_sparat(${KOLUMNER});`);
async function medTrigger(namn, villkor, kropp, f) {
  db.exec(`DROP TRIGGER IF EXISTS ${namn}`);
  db.exec(`CREATE TRIGGER ${namn} AFTER INSERT ON e2e_ko WHEN ${villkor} BEGIN ${kropp}; INSERT INTO prov_logg VALUES('${namn}', NEW.id); END`);
  try { await f(); } finally { db.exec(`DROP TRIGGER IF EXISTS ${namn}`); }
  return db.prepare('SELECT COUNT(*) n FROM prov_logg WHERE typ=?').get(namn).n;
}
async function skickaTillAlva(fran, text) {
  const u = await alvaUuid();
  const fore = db.prepare('SELECT COALESCE(MAX(id),0) m FROM e2e_ko').get().m;
  const r = await klienter[fran].skickaText(u, text);
  return { ...r, fore };
}

const rutter = {
  'GET /info': async () => ({ alva: { id: folk.alva.id, email: 'alva@e2e.test', losen: LOSEN }, bo: { id: folk.bo.id, uuid: klienter.bo.jag, namn: 'Bosse' },
    cia: { id: folk.cia.id, uuid: klienter.cia.jag, namn: 'Cia' }, dan: { id: folk.dan.id, namn: 'Dan' } }),

  'POST /skicka': async (b) => {
    const k = klienter[b.fran];
    const u = await alvaUuid();
    if (b.bild) {
      const data = bild || crypto.randomBytes(5000);
      const info = await k.laddaUpp(data);
      const r = await k.skicka([u], { dm: u }, 'msg', { text: b.text || '', sort: 'bild', bilaga: { ...info, mime: bild ? 'image/webp' : 'application/octet-stream', w: 900, h: 600 } });
      return { id: r.id, sha256: hex(data) };
    }
    return { id: (await k.skickaText(u, b.text)).id };
  },

  'POST /grupp/skicka': async (b) => ({ id: (await klienter[b.fran].skickaGrupp(b.grupp, 'msg', { text: b.text })).id }),

  // Väntar på en händelse hos en klient: ett meddelande med texten, eller en typ (grupp.inbjudan, rx, avvisat)
  'POST /vanta': async (b) => {
    const k = klienter[b.vem];
    if (!k) return { hittad: false, fel: 'ingen sådan klient' };
    const h = await vantaPa(() => k.mottaget.find((x) => (b.text ? x.d?.text === b.text : true) && (b.typ ? x.typ === b.typ : x.typ === 'msg')
      && (b.grupp ? x.konv?.grupp === b.grupp : true)), b.max || 20);
    if (!h) return { hittad: false };
    const ut = { hittad: true, typ: h.typ, fran: h.fran, konv: h.konv, d: h.d, kanal: h.kanal, fel: h.fel };
    if (h.d?.bilaga) {
      try { const data = await k.laddaNed(h.d.bilaga); ut.bilaga = { sha256: hex(data), storlek: data.length }; } catch (e) { ut.bilaga = { fel: e.kod || e.message }; }
    }
    if (h.typ === 'grupp.inbjudan') ut.namn = k.gruppInfo(h.konv.grupp).namn;
    return ut;
  },

  'POST /grupp/info': async (b) => { try { return klienter[b.vem].gruppInfo(b.grupp); } catch (e) { return { fel: e.kod }; } },

  'GET /sakerhetsnummer': async (b) => {
    const k = klienter[b.vem];
    await k.uppdateraEnheter(b.med);
    return k.sakerhetsnummer(b.med);
  },

  // Alvas dator är ny och visar en QR-kod; iPhonen skannar den
  'POST /lanka/ny': async () => {
    const tok = (await api('POST', '/auth/login', { email: 'alva@e2e.test', password: LOSEN, app: true })).token
      || (await api('POST', '/auth/verify', { email: 'alva@e2e.test', code: KOD, app: true })).token;
    const k = await nyKlient('alvadator', { token: tok }, 'Alvas dator').oppna();
    lank = { qr: null, kod: null, klar: false, fel: null };
    k.lankaNyEnhet({ visaQr: (t) => { lank.qr = t; }, visaKod: (kod) => { lank.kod = kod; }, tidMs: 180_000 })
      .then((r) => { lank.klar = true; lank.enhet = r.enhet_id; lank.uuid = r.uuid; lyssna(k); })
      .catch((e) => { lank.fel = e.kod || e.message; });
    await vantaPa(() => lank.qr, 20);
    return { qr: lank.qr };
  },
  'GET /lanka/status': async () => lank || {},

  // iPhonen är ny (visar QR); Alvas dator skannar och godkänner om kontrollkoden är densamma som iPhonens
  'POST /lanka/skanna': async (b) => {
    skanning = { kod: null, appKod: null, klar: false, fel: null };
    klienter.alvadator.lankaSkanna(b.qr, { tidMs: 120_000, bekrafta: async (kod) => {
      skanning.kod = kod;
      await vantaPa(() => skanning.appKod, 90);
      return skanning.appKod === kod;
    } }).then(() => { skanning.klar = true; }).catch((e) => { skanning.fel = e.kod || e.message; });
    return { ok: true };
  },
  'POST /lanka/bekrafta': async (b) => {
    await vantaPa(() => skanning?.kod, 30);
    skanning.appKod = String(b.kod);
    await vantaPa(() => skanning.klar || skanning.fel, 30);
    return { stammer: skanning.kod === String(b.kod), klar: skanning.klar, fel: skanning.fel };
  },

  // Negativa fall: servern (eller någon med databasen) ändrar, spelar upp eller flyttar kuvert till iPhonen
  // Ett tecken mitt i chiffret byts (base64), i kuvertet till Alvas enhet `enhet`
  'POST /manipulera': async (b) => {
    const a = Number(folk.alva.id), e = Number(b.enhet);
    const n = await medTrigger('prov_manipulera', `NEW.user_id = ${a} AND NEW.enhet = ${e} AND length(NEW.data) > 40`,
      `UPDATE e2e_ko SET data = substr(NEW.data, 1, length(NEW.data) / 2)
         || (CASE substr(NEW.data, length(NEW.data) / 2 + 1, 1) WHEN 'A' THEN 'B' ELSE 'A' END)
         || substr(NEW.data, length(NEW.data) / 2 + 2) WHERE id = NEW.id`, () => skickaTillAlva(b.fran, b.text));
    return { ok: n === 1, antal: n };
  },
  // Kuvertet till Alvas enhet `enhet` sparas (som en angripare med databasen), och läggs i kön igen med /uppspela
  'POST /spara': async (b) => {
    const a = Number(folk.alva.id), e = Number(b.enhet);
    db.exec('DELETE FROM prov_sparat');
    const n = await medTrigger('prov_spara', `NEW.user_id = ${a} AND NEW.enhet = ${e}`,
      `INSERT INTO prov_sparat SELECT ${KOLUMNER} FROM e2e_ko WHERE id = NEW.id`, () => skickaTillAlva(b.fran, b.text));
    return { ok: n === 1, antal: n };
  },
  'POST /uppspela': async () => {
    const r = db.prepare(`INSERT INTO e2e_ko(${KOLUMNER}) SELECT user_id,enhet,typ,fran_user,fran_enhet,grupp,sid,mt,data,chiffer_id,?,1,? FROM prov_sparat`)
      .run(Date.now(), Date.now() + 86_400_000);
    return { ok: r.changes === 1 };
  },
  // Kuvertet till Alvas enhet `fran_enhet` läggs också i kön för enheten `till_enhet`
  'POST /fel-enhet': async (b) => {
    const a = Number(folk.alva.id), f = Number(b.fran_enhet), t = Number(b.till_enhet);
    const n = await medTrigger('prov_fel_enhet', `NEW.user_id = ${a} AND NEW.enhet = ${f}`,
      `INSERT INTO e2e_ko(${KOLUMNER}) VALUES(NEW.user_id, ${t}, NEW.typ, NEW.fran_user, NEW.fran_enhet, NEW.grupp, NEW.sid, NEW.mt, NEW.data, NEW.chiffer_id, NEW.ts, NEW.urgent, NEW.utgar)`,
      () => skickaTillAlva(b.fran, b.text));
    return { ok: n === 1, antal: n };
  },
  'POST /byt-identitet': async (b) => {
    const ann = db.prepare('SELECT identitet FROM e2e_konton WHERE user_id=?').get(Number(folk[b.annan || 'cia'].id)).identitet;
    const egen = db.prepare('SELECT identitet FROM e2e_konton WHERE user_id=?').get(Number(folk[b.vem].id)).identitet;
    egenIdentitet[b.vem] = egenIdentitet[b.vem] || egen;
    db.prepare('UPDATE e2e_konton SET identitet=? WHERE user_id=?').run(ann, Number(folk[b.vem].id));
    return { ok: true };
  },
  'POST /aterstall-identitet': async (b) => {
    db.prepare('UPDATE e2e_konton SET identitet=? WHERE user_id=?').run(egenIdentitet[b.vem], Number(folk[b.vem].id));
    return { ok: true };
  },

  // Letar markörerna i hela serverns katalog: databasen, WAL-filen och bilagorna
  'POST /skanna': async (b) => {
    db.exec('PRAGMA wal_checkpoint(PASSIVE)');
    const filer = [];
    (function samla(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? samla(p) : filer.push(p); } })(tmp);
    const data = filer.filter((f) => !f.endsWith('.js'));
    const allt = Buffer.concat(data.map((f) => fs.readFileSync(f)));
    const markorer = (b.markorer || []).filter((m) => typeof m === 'string' && m.length >= 6);
    // Bitar ur bilderna (Bos och appens): som råa byte och som base64 i alla tre lägen
    const bitar = (b.binar || []).map((x) => Buffer.from(x, 'base64'));
    if (bild) for (const o of [999, 9000, 20001]) if (bild.length > o + 48) bitar.push(bild.subarray(o, o + 48));
    const former = (x) => [x, ...[0, 1, 2].flatMap((j) => { const d = x.subarray(j, j + 3 * Math.floor((x.length - j) / 3)); return [Buffer.from(d.toString('base64')), Buffer.from(d.toString('base64url'))]; })];
    const binarHittade = bitar.filter((x) => x.length >= 24 && former(x).some((f) => allt.includes(f))).length;
    return { hittade: markorer.filter((m) => allt.includes(Buffer.from(m, 'utf8'))), kontroll: allt.includes(Buffer.from('Bosse')),
      sokta: markorer.length, binara: bitar.length, binarHittade, filer: data.map((f) => `${path.relative(tmp, f)} ${fs.statSync(f).size} B`) };
  },

  'GET /mottaget': async (b) => (klienter[b.vem]?.mottaget || []).map((x) => ({ typ: x.typ, fran: x.fran, text: x.d?.text, fel: x.fel })),
};

styr = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let kropp = {};
  if (req.method === 'POST') {
    let t = '';
    for await (const d of req) t += d;
    try { kropp = JSON.parse(t || '{}'); } catch {}
  } else kropp = Object.fromEntries(url.searchParams);
  const f = rutter[`${req.method} ${url.pathname}`];
  let status = 200, svar;
  try { svar = f ? await f(kropp) : (status = 404, { fel: 'okänd rutt' }); } catch (e) { status = 500; svar = { fel: e.kod || e.message }; logg('fel i', url.pathname, e); }
  logg(req.method, url.pathname, status);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(svar ?? {}));
});
styr.listen(STYR, HOST, () => logg(`MOTPART KLAR: servern ${BAS}, styrytan http://${HOST}:${STYR}, Alva = alva@e2e.test`));
