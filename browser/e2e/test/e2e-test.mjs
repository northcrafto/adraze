// E2E-klienterna (wasm-kärnan) mot en tillfällig kopia av adraze-api med /chatt/v2 (egen databas, port 18498).
// Kör: node browser/e2e/test/e2e-test.mjs   (servern tas från ADRAZE_API, standard ~/adraze-api-e2e)
//
// Kontrollerar hela kedjan med riktig kryptering och att servern aldrig har klartext: efter testet söks
// markörtexterna i hela serverns katalog (databas, WAL och bilagefiler).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { E2EKlient, MinnesLagring, FilLagring } = require('../klient.js');
const { anropa } = require('../karna.js');

const REPO = process.env.ADRAZE_API || path.join(os.homedir(), 'adraze-api-e2e');
const PORT = Number(process.env.TEST_PORT || 18498);
const BAS = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'adraze-e2e-klient-test-'));
for (const f of fs.readdirSync(REPO)) if (f.endsWith('.js')) fs.copyFileSync(path.join(REPO, f), path.join(tmp, f));
const srv = spawn(process.execPath, [path.join(tmp, 'server.js')], {
  cwd: tmp, env: { ...process.env, PORT: String(PORT), MAIL_LOGG: '1', CHATT_HOTLISTOR: '0', BREVO_API_KEY: '', CLAMD_PORT: '1', CHATT_NYCKEL: crypto.randomBytes(32).toString('hex') }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logg = '';
srv.stdout.on('data', (d) => { logg += d; });
srv.stderr.on('data', (d) => { logg += d; });
const stang = () => { try { srv.kill(); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on('exit', stang);
for (let i = 0; i < 100 && !logg.includes('adraze-api på'); i++) await new Promise((r) => setTimeout(r, 50));
if (!logg.includes('adraze-api på')) { console.error(logg); throw new Error('servern startade inte'); }

const db = new DatabaseSync(path.join(tmp, 'adraze.db'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
async function nyAnvandare(email, namn) {
  const id = Number(db.prepare('INSERT INTO users(email,verified,created_at) VALUES(?,1,?)').run(email, Date.now()).lastInsertRowid);
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(sha(token), id, Date.now() + 86_400_000);
  const r = await fetch(BAS + '/chatt/registrera', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + id + '.1' },
    body: JSON.stringify({ username: namn, login_hash: crypto.randomBytes(32).toString('base64'), public_key: 'PK', enc_priv: 'EP' }) });
  if (r.status !== 200) throw new Error('registrera ' + namn);
  return { id, token, namn };
}
async function kontakter(a, b) {
  const p = (u, sokvag, kropp) => fetch(BAS + sokvag, { method: 'POST', headers: { authorization: 'Bearer ' + u.token, 'content-type': 'application/json' }, body: JSON.stringify(kropp) });
  await p(a, '/chatt/contacts/request', { username: b.namn });
  await p(b, '/chatt/contacts/accept', { username: a.namn });
}
let ok = 0, fel = 0;
function koll(namn, villkor, info) {
  if (villkor) { ok++; console.log('  ok  ', namn); }
  else { fel++; console.log('  FEL ', namn, info !== undefined ? JSON.stringify(info, null, 0).slice(0, 500) : ''); }
}
async function kastar(fn) { try { await fn(); return null; } catch (e) { return e; } }
const klient = (anv, namn, lagring = new MinnesLagring()) => new E2EKlient({ api: BAS, token: anv.token, lagring, namn, plattform: 'test' });
const texter = (h) => h.filter((x) => x.typ === 'msg').map((x) => x.d.text);

const alva = await nyAnvandare('alva@e2e.test', 'Alva'), bo = await nyAnvandare('bo@e2e.test', 'Bosse'), cia = await nyAnvandare('cia@e2e.test', 'Cia');
await kontakter(alva, bo); await kontakter(alva, cia); await kontakter(bo, cia);

// Lagring på disk med en låtsasnyckelring (Electron: safeStorage), för att testa omstart
const ringNyckel = crypto.randomBytes(32);
const nyckelring = {
  encryptString(s) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', ringNyckel, iv); const d = Buffer.concat([c.update(s, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]); },
  decryptString(b) { const d = crypto.createDecipheriv('aes-256-gcm', ringNyckel, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); },
};
const boMapp = path.join(tmp, '..', path.basename(tmp) + '-bo-lagring');
process.on('exit', () => fs.rmSync(boMapp, { recursive: true, force: true }));

console.log('Identiteter');
const A1 = await klient(alva, 'Alvas dator').oppna();
const B1 = await klient(bo, 'Bos dator', new FilLagring(boMapp, nyckelring)).oppna();
const C1 = await klient(cia, 'Cias dator').oppna();
koll('ingen nyckelring → ingen lagring', (await kastar(() => new FilLagring(boMapp, null)))?.kod === 'ingen_nyckelring');
const { kod: alvasKod } = await A1.skapaIdentitet();
const { kod: bosKod } = await B1.skapaIdentitet();
await C1.skapaIdentitet();
koll('återställningskod: 64 tecken a–z0–9', /^[a-z0-9]{64}$/.test(alvasKod));
koll('registrerade', (await A1.status()).registrerad && (await B1.status()).registrerad && A1.enhetId === 1);

console.log('Länka Alvas telefon med QR-kod (relä, HPKE, kontrollkod)');
const A2 = await klient(alva, 'Alvas telefon').oppna();
let qr = null, nyKod = null;
const [ny, gammal] = await Promise.all([
  A2.lankaNyEnhet({ visaQr: (t) => { qr = t; }, visaKod: (k) => { nyKod = k; } }),
  (async () => { while (!qr) await new Promise((r) => setTimeout(r, 20)); return A1.lankaSkanna(qr, { bekrafta: async (k) => { while (!nyKod) await new Promise((r) => setTimeout(r, 20)); return k === nyKod; } }); })(),
]);
koll('QR-koden har reläets id och en nyckel', /^adraze-lank:1:[A-Za-z0-9_-]+:[A-Za-z0-9+/=]{43,44}$/.test(qr), qr);
koll('telefonen är länkad: samma uuid, enhet 2', ny.uuid === A1.jag && ny.enhet_id === 2, ny);
koll('kontrollkoden är två siffror och lika på båda', /^\d{2}$/.test(gammal.kod) && gammal.kod === nyKod, { gammal, nyKod });
koll('telefonen har samma återställningskod', A2.aterstallningskod() === alvasKod);
const A3 = await klient(alva, 'Fel dator').oppna();
let qr3 = null;
const fel3 = await Promise.all([
  kastar(() => A3.lankaNyEnhet({ visaQr: (t) => { qr3 = t; }, tidMs: 4000 })),
  (async () => { while (!qr3) await new Promise((r) => setTimeout(r, 20)); return kastar(() => A1.lankaSkanna(qr3, { bekrafta: async () => false })); })(),
]);
koll('fel kontrollkod: länkningen avbryts och den nya enheten får ingen identitet', fel3[1]?.kod === 'avbruten' && fel3[0]?.kod === 'tidsgrans' && !A3.jag, fel3.map((e) => e?.kod));

console.log('1:1 åt båda hållen, alla enheter');
await A1.skickaText(B1.jag, 'MARKÖR-ett hej Bo');
let hb = await B1.hamta();
koll('Bo får Alvas meddelande', texter(hb).join() === 'MARKÖR-ett hej Bo' && hb[0].fran === A1.jag && hb[0].konv.dm === A1.jag, hb);
let ha2 = await A2.hamta();
koll('Alvas telefon får synkkopian', texter(ha2).join() === 'MARKÖR-ett hej Bo' && ha2[0].konv.dm === B1.jag, ha2);
await B1.skickaText(A1.jag, 'MARKÖR-två hej Alva');
koll('Alvas dator får svaret', texter(await A1.hamta()).join() === 'MARKÖR-två hej Alva');
koll('Alvas telefon får svaret', texter(await A2.hamta()).join() === 'MARKÖR-två hej Alva');
for (let i = 0; i < 3; i++) { await A2.skickaText(B1.jag, 'MARKÖR-telefon ' + i); await B1.skickaText(A1.jag, 'MARKÖR-svar ' + i); }
koll('fler meddelanden i rätt ordning', texter(await B1.hamta()).join('|') === 'MARKÖR-telefon 0|MARKÖR-telefon 1|MARKÖR-telefon 2');
koll('Alvas dator: 3 synkkopior och 3 svar', texter(await A1.hamta()).length === 6);
await A2.hamta();
const vantar = B1.hamta({ vanta: 10 });
await new Promise((r) => setTimeout(r, 300));
await A1.skickaText(B1.jag, 'MARKÖR-direkt');
koll('long-poll: meddelandet kommer direkt', texter(await vantar).join() === 'MARKÖR-direkt');
await A2.hamta();

console.log('Säkerhetsnummer');
const snA = A1.sakerhetsnummer(B1.jag), snB = B1.sakerhetsnummer(A1.jag);
koll('samma 60 siffror hos båda', snA.siffror === snB.siffror && snA.siffror.length === 60 && snA.grupper.length === 12, [snA.siffror, snB.siffror]);
koll('QR-skanning verifierar', (await A1.verifiera(B1.jag, snB.qr)).stammer === true && A1.kontaktStatus(B1.jag).verifierad === true);
koll('fel QR verifierar inte', (await B1.verifiera(A1.jag, snB.qr)).stammer === false && B1.kontaktStatus(A1.jag).verifierad === false);

console.log('Grupp med tre personer (Megolm), kick och ny avsändarnyckel');
const gid = await A1.nyGrupp([B1.jag, C1.jag], 'MARKÖR-gruppnamn Fikagänget');
for (const k of [B1, C1, A2]) { const h = await k.hamta(); koll(`${k.namn} får inbjudan`, h.some((x) => x.typ === 'grupp.inbjudan') && k.gruppInfo(gid).namn === 'MARKÖR-gruppnamn Fikagänget', h); }
await A1.skickaGrupp(gid, 'msg', { text: 'MARKÖR-grupp ett' });
for (const k of [B1, C1, A2]) koll(`${k.namn} läser gruppmeddelandet`, texter(await k.hamta()).join() === 'MARKÖR-grupp ett');
await C1.skickaGrupp(gid, 'msg', { text: 'MARKÖR-grupp från Cia' });
for (const k of [A1, A2, B1]) koll(`${k.namn} läser Cias gruppmeddelande`, texter(await k.hamta()).join() === 'MARKÖR-grupp från Cia');
const sidFore = A1.gruppInfo(gid).sid;
const r = await A1.andraGrupp(gid, [A1.jag, B1.jag]);
koll('Cia kickas', r.borttagna.join() === C1.jag);
for (const k of [B1, C1, A2]) await k.hamta();
koll('Cia vet att hon inte är med', C1.gruppInfo(gid).utanfor === true);
await A1.skickaGrupp(gid, 'msg', { text: 'MARKÖR-grupp utan Cia' });
koll('ny avsändarnyckel efter kicken', A1.gruppInfo(gid).sid !== sidFore);
koll('Bo läser', texter(await B1.hamta()).join() === 'MARKÖR-grupp utan Cia');
koll('Cia får ingenting', (await C1.hamta()).length === 0);
const sista = db.prepare("SELECT c.data, k.sid, k.grupp FROM e2e_ko k JOIN e2e_chiffer c ON c.id=k.chiffer_id ORDER BY k.id DESC LIMIT 1").get()
  || db.prepare('SELECT data, 0 AS sid FROM e2e_chiffer ORDER BY id DESC LIMIT 1').get();
const cKuvert = { id: '999001', typ: 'grupp', fran: A1.jag, fe: 1, grupp: gid, sid: A1.gruppInfo(gid).sid, c: sista.data, ts: Date.now() - 300_000 };
let rc = anropa({ op: 'ta_emot', h: C1.h, kuvert: [cKuvert], nu: Date.now() });
koll('även med chiffret kan Cia inte läsa (ingen nyckel)', rc.handelser[0]?.typ === 'avvisat' && rc.handelser[0].fel === 'okand_session', rc);
await A2.hamta();

console.log('Bilagor med egen nyckel per fil');
const bild = Buffer.concat([Buffer.from('MARKÖR-BILD '), crypto.randomBytes(1_300_000)]);
const info = await A1.laddaUpp(bild);
await A1.skickaText(B1.jag, '', { bilaga: info });
const hBild = (await B1.hamta()).find((x) => x.typ === 'msg');
const nedladdad = await B1.laddaNed(hBild.d.bilaga);
koll('Bo laddar ned och öppnar bilagan', nedladdad.equals(bild));
await A2.hamta();
const delfil = path.join(tmp, 'e2e-bilagor', info.id.slice(0, 2), info.id + '.0');
const delar = fs.readFileSync(delfil); delar[100] ^= 1; fs.writeFileSync(delfil, delar);
koll('ändrad bilaga på servern upptäcks', (await kastar(() => B1.laddaNed(hBild.d.bilaga)))?.kod === 'manipulerat');

console.log('Negativa fall mot den riktiga servern');
await A1.skickaText(B1.jag, 'MARKÖR-ska ändras');
const rad = db.prepare('SELECT * FROM e2e_ko WHERE user_id=? ORDER BY id DESC LIMIT 1').get(bo.id);
const andrad = Buffer.from(rad.data, 'base64'); andrad[Math.floor(andrad.length / 2)] ^= 0x10;
db.prepare('UPDATE e2e_ko SET data=? WHERE id=?').run(andrad.toString('base64'), rad.id);
let h = await B1.hamta();
koll('manipulerat kuvert avvisas', h.length === 1 && h[0].typ === 'avvisat' && h[0].fel === 'manipulerat', h);
await A2.hamta();
await A1.skickaText(B1.jag, 'MARKÖR-uppspelas');
const orig = db.prepare('SELECT * FROM e2e_ko WHERE user_id=? ORDER BY id DESC LIMIT 1').get(bo.id);
koll('originalet tas emot', texter(await B1.hamta()).join() === 'MARKÖR-uppspelas');
db.prepare('INSERT INTO e2e_ko(user_id,enhet,typ,fran_user,fran_enhet,mt,data,ts,urgent,utgar) VALUES(?,?,?,?,?,?,?,?,1,?)').run(orig.user_id, orig.enhet, orig.typ, orig.fran_user, orig.fran_enhet, orig.mt, orig.data, Date.now(), Date.now() + 86_400_000);
h = await B1.hamta();
koll('uppspelat kuvert avvisas', h.length === 1 && h[0].fel === 'uppspelat', h);
await A2.hamta();
await B1.skickaText(A1.jag, 'MARKÖR-till datorn');
const tillDatorn = db.prepare('SELECT * FROM e2e_ko WHERE user_id=? AND enhet=1 ORDER BY id DESC LIMIT 1').get(alva.id);
db.prepare('INSERT INTO e2e_ko(user_id,enhet,typ,fran_user,fran_enhet,mt,data,ts,urgent,utgar) VALUES(?,2,?,?,?,?,?,?,1,?)').run(alva.id, tillDatorn.typ, tillDatorn.fran_user, tillDatorn.fran_enhet, tillDatorn.mt, tillDatorn.data, Date.now(), Date.now() + 86_400_000);
h = await A2.hamta();
const fran = h.filter((x) => x.typ === 'avvisat');
koll('fel enhet kan inte läsa ett kuvert till en annan enhet', fran.length === 1 && texter(h).join() === 'MARKÖR-till datorn', h);
koll('rätt enhet läser det', texter(await A1.hamta()).join() === 'MARKÖR-till datorn');

console.log('Ändrad identitet (servern byter Bos nyckel)');
const bosId = db.prepare('SELECT identitet FROM e2e_konton WHERE user_id=?').get(bo.id).identitet;
const ciasId = db.prepare('SELECT identitet FROM e2e_konton WHERE user_id=?').get(cia.id).identitet;
db.prepare('UPDATE e2e_konton SET identitet=? WHERE user_id=?').run(ciasId, bo.id);
const ae = await A1.uppdateraEnheter(B1.jag);
koll('verifierad kontakt: varning och stopp', ae.andrad === true && ae.blockerad === true, ae);
koll('sändningen stoppas', (await kastar(() => A1.skickaText(B1.jag, 'x')))?.kod === 'identitet_andrad');
const ce = await C1.uppdateraEnheter(B1.jag);
koll('overifierad kontakt (Cia): varning men inget stopp, och Bos enheter godtas inte med fel identitet', ce.andrad === true && ce.blockerad === false && ce.enheter === 0 && ce.ogiltiga >= 1, ce);
db.prepare('UPDATE e2e_konton SET identitet=? WHERE user_id=?').run(bosId, bo.id);
await A1.uppdateraEnheter(B1.jag);
koll('servern ångrar: fortfarande väntar godkännande', A1.kontaktStatus(B1.jag).vantar_godkannande === true);
await A1.godkannIdentitet(B1.jag);
await A1.skickaText(B1.jag, 'MARKÖR-efter godkännande');
koll('efter godkännande går det igen, och kontakten är inte längre verifierad', texter(await B1.hamta()).join() === 'MARKÖR-efter godkännande' && !A1.kontaktStatus(B1.jag).verifierad);
await A2.hamta();

console.log('Omstart och återställning');
B1.stang();
const B1igen = await klient(bo, 'Bos dator', new FilLagring(boMapp, nyckelring)).oppna();
await A1.skickaText(B1igen.jag, 'MARKÖR-efter omstart');
koll('Bos dator fortsätter efter omstart (tillståndet krypterat på disk)', texter(await B1igen.hamta()).join() === 'MARKÖR-efter omstart');
const tillstandFil = fs.readFileSync(path.join(boMapp, 'e2e.tillstand'), 'utf8');
koll('tillståndsfilen innehåller ingen klartext', !Buffer.from(tillstandFil, 'base64').includes('pickle') && !tillstandFil.includes(B1igen.jag));
await A2.hamta();
const snFore = A1.sakerhetsnummer(B1igen.jag).siffror;
const B2 = await klient(bo, 'Bos nya dator').oppna();
koll('fel återställningskod → fel_kod', (await kastar(() => B2.aterstall('a'.repeat(64))))?.kod === 'fel_kod');
const ater = await B2.aterstall(bosKod.toUpperCase().match(/.{4}/g).join(' '));
koll('återställd: samma uuid, ny enhet', ater.uuid === B1igen.jag && ater.enhet_id === 2, ater);
await A1.skickaText(B2.jag, 'MARKÖR-till båda Bos');
koll('båda Bos enheter får meddelandet', texter(await B2.hamta()).join() === 'MARKÖR-till båda Bos' && texter(await B1igen.hamta()).join() === 'MARKÖR-till båda Bos');
koll('säkerhetsnumret är oförändrat', A1.sakerhetsnummer(B2.jag).siffror === snFore && !A1.kontaktStatus(B2.jag).vantar_godkannande);
await A2.hamta();

console.log('Påfyllning av engångsnycklar');
const fore = (await A1.api('GET', '/chatt/v2/nycklar/status')).j.otk;
for (let i = 0; i < 3; i++) await fetch(`${BAS}/chatt/v2/nycklar?uuid=${A1.jag}&enheter=1`, { headers: { authorization: 'Bearer ' + bo.token } });
const efter = (await A1.api('GET', '/chatt/v2/nycklar/status')).j.otk;
db.prepare('DELETE FROM e2e_engangs WHERE user_id=? AND enhet=1').run(alva.id);
const lagt = await A1.fyllPaNycklar();
koll('engångsnycklarna fylls på när de tar slut', efter === fore - 3 && lagt >= 30 && (await A1.api('GET', '/chatt/v2/nycklar/status')).j.otk === lagt, { fore, efter, lagt });

console.log('Servern har aldrig sett klartext');
db.exec('PRAGMA wal_checkpoint(FULL)');
const filer = [];
(function samla(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? samla(p) : filer.push(p); } })(tmp);
const dataFiler = filer.filter((f) => !f.endsWith('.js'));
const allt = Buffer.concat(dataFiler.map((f) => fs.readFileSync(f)));
const sok = ['MARKÖR', 'MARK\\u00d6R', 'Fikagänget', 'hej Bo', 'gruppnamn', 'MARKÖR-BILD'];
koll('kontroll: sökningen hittar text som servern faktiskt har (användarnamnet)', allt.includes(Buffer.from('Bosse')));
koll('ingen markörtext i databasen, WAL eller bilagorna', sok.every((s) => !allt.includes(Buffer.from(s, 'utf8'))), { filer: dataFiler.map((f) => path.relative(tmp, f)) });
koll('ingen återställningskod hos servern', !allt.includes(Buffer.from(alvasKod)) && !allt.includes(Buffer.from(bosKod)));
koll('kön innehåller bara chiffer', db.prepare("SELECT COUNT(*) c FROM e2e_ko WHERE data LIKE '%MARK%'").get().c === 0);
console.log('  (sökte i ' + dataFiler.map((f) => path.relative(tmp, f) + ' ' + fs.statSync(f).size + ' B').join(', ') + ')');

console.log(`\n${ok} ok, ${fel} fel`);
for (const k of [A1, A2, A3, B1igen, B2, C1]) k.stang();
stang();
process.exit(fel ? 1 : 0);
