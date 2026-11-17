// E2E-klienten för datorn: pratar med /chatt/v2 och låter kärnan (karna.js, samma Rust-kärna som iPhone)
// sköta all kryptering. Ingenting här ser privata nycklar; kärnans tillstånd sparas krypterat via `lagring`.
//
// Inte inkopplad i datorns gränssnitt än (plan 4, etapp 2–3). Används av testerna i ./test och som motpart
// i iPhone-appens självtest.
//
//   const k = new E2EKlient({ api: 'https://api.adraze.app', token, lagring: new FilLagring(mapp, safeStorage) });
//   await k.oppna();
//   if (!(await k.status()).registrerad) { const { kod } = await k.skapaIdentitet(); visa(kod); }
//   await k.skickaText(uuid, 'Hej');
//   for (const h of await k.hamta({ vanta: 25 })) …
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { anropa } = require('./karna.js');

class E2EFel extends Error {
  constructor(kod, text, extra) { super(text || kod); this.kod = kod; Object.assign(this, extra || {}); }
}

// Kärnans tillstånd i minnet (testerna)
class MinnesLagring {
  constructor() { this.n = null; this.t = null; }
  async nyckel() { if (!this.n) this.n = anropa({ op: 'ny_lagringsnyckel' }).nyckel; return this.n; }
  async lasTillstand() { return this.t; }
  async sparaTillstand(t) { this.t = t; }
}

// Kärnans tillstånd på disk. Lagringsnyckeln skyddas av `skydd` (Electron: safeStorage), aldrig i klartext.
class FilLagring {
  constructor(mapp, skydd) {
    if (!skydd || typeof skydd.encryptString !== 'function') throw new E2EFel('ingen_nyckelring', 'Ingen nyckelring: E2E-nycklarna sparas inte okrypterat.');
    this.mapp = mapp; this.skydd = skydd;
    fs.mkdirSync(mapp, { recursive: true, mode: 0o700 });
  }
  async nyckel() {
    const f = path.join(this.mapp, 'e2e.nyckel');
    if (fs.existsSync(f)) return this.skydd.decryptString(fs.readFileSync(f));
    const n = anropa({ op: 'ny_lagringsnyckel' }).nyckel;
    skrivAtomiskt(f, this.skydd.encryptString(n));
    return n;
  }
  async lasTillstand() { const f = path.join(this.mapp, 'e2e.tillstand'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; }
  async sparaTillstand(t) { skrivAtomiskt(path.join(this.mapp, 'e2e.tillstand'), t); }
}
function skrivAtomiskt(fil, data) {
  const tmp = fil + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, fil);
}

class E2EKlient {
  constructor({ api, token, lagring, plattform = 'dator', namn = 'Dator', logg = () => {} }) {
    this.bas = String(api).replace(/\/$/, '');
    this.token = token;
    this.lagring = lagring;
    this.plattform = plattform;
    this.namn = namn;
    this.logg = logg;
    this.h = null;
    this.efter = 0;
    this.vantande = new Map();      // kuvert-id → kuvert som väntar på en gruppnyckel
    this.kedja = Promise.resolve(); // ett anrop i taget till kärnan och tillståndet
  }

  // ---------- grunder ----------
  k(op, a = {}) {
    const r = anropa({ ...a, op, h: this.h, nu: Date.now() });
    if (!r.ok) throw new E2EFel(r.fel, r.text);
    return r;
  }
  lasa(fn) {
    const p = this.kedja.then(fn, fn);
    this.kedja = p.catch(() => {});
    return p;
  }
  async spara() { await this.lagring.sparaTillstand(this.k('spara').tillstand); }

  async api(metod, sokvag, kropp, { enhet = true, huvud = {}, tillat = [] } = {}) {
    const h = { authorization: 'Bearer ' + this.token, ...huvud };
    if (enhet && this.auth) h['x-e2e-enhet'] = this.auth;
    if (metod === 'POST') h['content-type'] = 'application/json';
    const r = await fetch(this.bas + sokvag, { method: metod, headers: h, body: metod === 'POST' ? JSON.stringify(kropp || {}) : undefined });
    let j = {}; try { j = await r.json(); } catch {}
    if (r.status >= 400 && !tillat.includes(r.status)) throw new E2EFel(j.error || 'http_' + r.status, j.message || `HTTP ${r.status}`, { status: r.status, svar: j });
    return { s: r.status, j };
  }

  async oppna() {
    const tillstand = await this.lagring.lasTillstand();
    const r = anropa({ op: 'oppna', lagringsnyckel: await this.lagring.nyckel(), tillstand });
    if (!r.ok) throw new E2EFel(r.fel, r.text);
    this.h = r.h;
    this.uppdateraAuth();
    return this;
  }
  stang() { if (this.h) anropa({ op: 'stang', h: this.h }); this.h = null; }
  uppdateraAuth() {
    const s = this.k('status');
    this.jag = s.uuid || null;
    this.enhetId = s.enhet_id || null;
    this.auth = s.registrerad ? this.k('enhet.auth').huvud : null;
  }

  async status() {
    const lokal = this.k('status');
    const server = (await this.api('GET', '/chatt/v2/status', null, { enhet: false })).j;
    return { ...lokal, server, registrerad: !!lokal.registrerad && server.har_identitet && server.uuid === lokal.uuid };
  }

  async registrerad(enhet_id) {
    this.k('identitet.registrerad', { enhet_id });
    await this.spara();
    this.uppdateraAuth();
  }

  // Den allra första enheten: ny identitet och återställningskod (visas för användaren, finns inte hos AdRaze)
  skapaIdentitet() {
    return this.lasa(async () => {
      const r = this.k('identitet.skapa', { plattform: this.plattform, namn: this.namn });
      await this.spara();
      const svar = (await this.api('POST', '/chatt/v2/konto', r.registrering, { enhet: false })).j;
      await this.registrerad(svar.enhet_id);
      return { kod: r.kod, uuid: svar.uuid, enhet_id: svar.enhet_id };
    });
  }

  // Alla enheter borta: återställningskoden öppnar valvet, och identiteten (och säkerhetsnumret) är densamma
  aterstall(kod) {
    return this.lasa(async () => {
      const t = anropa({ op: 'aterstall.token', kod });
      if (!t.ok) throw new E2EFel(t.fel, t.text);
      const v = (await this.api('GET', '/chatt/v2/valv', null, { enhet: false, huvud: { 'x-e2e-valv': t.valv_token } })).j;
      const r = this.k('aterstall.oppna', { kod, valv: v.valv, identitet: v.identitet, plattform: this.plattform, namn: this.namn });
      await this.spara();
      const svar = (await this.api('POST', '/chatt/v2/enheter', { valv_token: r.registrering.valv_token, enhet: r.registrering.enhet }, { enhet: false })).j;
      await this.registrerad(svar.enhet_id);
      return { uuid: svar.uuid, enhet_id: svar.enhet_id };
    });
  }

  aterstallningskod() { return this.k('aterstallningskod').kod; }

  // ---------- länkning med QR-kod ----------
  // Den nya enheten (utan identitet) visar QR-koden och tar emot identiteten när den befintliga godkänt.
  async lankaNyEnhet({ visaQr, visaKod, tidMs = 5 * 60_000 }) {
    const n = this.k('lank.visa');
    const { lank_id } = (await this.api('POST', '/chatt/v2/lank', {}, { enhet: false })).j;
    await visaQr(`adraze-lank:1:${lank_id}:${n.nyckel}`);
    const s1 = await this.vantaLank(lank_id, 1, tidMs);
    const s2 = this.k('lank.svara', { steg1: s1, lank_id, svar: this.namn });
    await this.api('POST', '/chatt/v2/lank/steg', { lank_id, steg: 2, data: s2.steg2 }, { enhet: false });
    if (visaKod) await visaKod(s2.kod, s2.hej);
    const s3 = await this.vantaLank(lank_id, 3, tidMs);
    return this.lasa(async () => {
      const r = this.k('lank.ta_emot_hemligt', { steg3: s3, lank_id, plattform: this.plattform, namn: this.namn });
      await this.spara();
      const svar = (await this.api('POST', '/chatt/v2/enheter', { lankkod: r.registrering.lankkod, enhet: r.registrering.enhet }, { enhet: false })).j;
      await this.registrerad(svar.enhet_id);
      return { uuid: svar.uuid, enhet_id: svar.enhet_id };
    });
  }

  // Den befintliga enheten skannar QR-koden. `bekrafta(kod)` ska jämföra kontrollkoden med den nya enhetens.
  async lankaSkanna(qr, { bekrafta, tidMs = 5 * 60_000 }) {
    const m = /^adraze-lank:1:([A-Za-z0-9_-]{16,64}):([A-Za-z0-9+/=]{43,44})$/.exec(String(qr).trim());
    if (!m) throw new E2EFel('format', 'Det är inte en AdRaze-länkkod.');
    const [, lank_id, nyckel] = m;
    const s1 = this.k('lank.skanna', { nyckel, lank_id, hej: this.namn });
    await this.api('POST', '/chatt/v2/lank/steg', { lank_id, steg: 1, data: s1.steg1 }, { enhet: false });
    const s2 = await this.vantaLank(lank_id, 2, tidMs);
    const kontroll = this.k('lank.kontroll', { steg2: s2, lank_id });
    if (!(await bekrafta(kontroll.kod, kontroll.svar))) { this.k('lank.avbryt'); throw new E2EFel('avbruten', 'Kontrollkoden stämde inte. Länkningen avbröts.'); }
    const { lankkod } = (await this.api('POST', '/chatt/v2/enheter/lankkod', {})).j;
    const s3 = this.k('lank.skicka_hemligt', { lank_id, lankkod });
    await this.api('POST', '/chatt/v2/lank/steg', { lank_id, steg: 3, data: s3.steg3 }, { enhet: false });
    return { kod: kontroll.kod, namn: kontroll.svar };
  }

  async vantaLank(id, steg, tidMs) {
    const slut = Date.now() + tidMs;
    while (Date.now() < slut) {
      const r = (await this.api('GET', `/chatt/v2/lank?id=${encodeURIComponent(id)}&steg=${steg}&vanta=25`, null, { enhet: false })).j;
      if (r.data) return r.data;
    }
    throw new E2EFel('tidsgrans', 'Länkningen tog för lång tid.');
  }

  // ---------- kontakter ----------
  async uppdateraEnheter(uuid) {
    const svar = (await this.api('GET', `/chatt/v2/enheter?uuid=${uuid}`)).j;
    const r = this.k('kontakt.enheter', { uuid, svar });
    if (r.andrad) this.logg(`identiteten för ${uuid} har ändrats${r.blockerad ? ' (verifierad: väntar på godkännande)' : ''}`);
    return r;
  }
  async hamtaBuntar(buntar) {
    for (const [uuid, ids] of Object.entries(buntar)) {
      const svar = (await this.api('GET', `/chatt/v2/nycklar?uuid=${uuid}&enheter=${ids.join(',')}`)).j;
      this.k('kontakt.buntar', { uuid, svar });
    }
  }
  async personer(ids) { return (await this.api('GET', `/chatt/v2/personer?id=${ids.join(',')}`)).j.personer; }
  async person(uuid) { return (await this.api('GET', `/chatt/v2/personer?uuid=${uuid}`)).j.personer[0]; }
  kontaktStatus(uuid) { return this.k('kontakt.status', { uuid }); }
  sakerhetsnummer(uuid) { return this.k('sakerhetsnummer', { uuid }); }
  verifiera(uuid, qr) { return this.lasa(async () => { const r = this.k('verifiera', qr ? { uuid, qr } : { uuid, markera: true }); await this.spara(); return r; }); }
  godkannIdentitet(uuid) { return this.lasa(async () => { this.k('kontakt.godkann', { uuid }); await this.spara(); }); }

  // ---------- skicka ----------
  // Kör en sändning tills servern tagit emot den. Saknade enhetslistor och nyckelbuntar hämtas; 409/410
  // (enheter har lagts till eller bytts) ger ny lista och nytt försök, högst sex gånger.
  async korSandning(op, a) {
    for (let forsok = 0; forsok < 8; forsok++) {
      const r = this.k(op, a);
      if (r.behover_enheter) { for (const u of r.behover_enheter) await this.uppdateraEnheter(u); continue; }
      if (r.behover_buntar) { await this.hamtaBuntar(r.behover_buntar); continue; }
      if (r.blockerad) throw new E2EFel('identitet_andrad', 'Säkerhetsnumret har ändrats. Godkänn det nya numret innan du skickar.', { uuid: r.blockerad });
      if (r.ingen_e2e) throw new E2EFel('ingen_e2e', 'Mottagaren har ingen enhet med E2E.', { uuid: r.ingen_e2e });
      await this.spara();   // sessionerna har gått framåt: spara innan något går iväg
      if (r.begaran_dela) {
        const s = await this.api('POST', '/chatt/v2/meddelanden', r.begaran_dela, { tillat: [409, 410] });
        if (s.s >= 400) { for (const f of s.j.lista || [s.j]) this.k('avvisad', { svar: f }); continue; }
        this.k('grupp.delat', { grupp: r.grupp, dela: r.dela });
        await this.spara();
        continue;
      }
      const sokvag = op === 'grupp.skicka' ? '/chatt/v2/grupper/meddelanden' : '/chatt/v2/meddelanden';
      const s = await this.api('POST', sokvag, { ...r.begaran, urgent: a.urgent !== false }, { tillat: [409, 410] });
      if (s.s >= 400) { for (const f of s.j.lista || [s.j]) this.k('avvisad', { svar: f }); continue; }
      return { id: r.id, ts: r.ts, ids: s.j.ids, spok: r.spok || [] };
    }
    throw new E2EFel('gav_upp', 'Kunde inte skicka efter flera försök.');
  }

  skicka(till, konv, typ, d, extra = {}) { return this.lasa(() => this.korSandning('skicka', { till, konv, typ, d, ...extra })); }
  skickaText(uuid, text, extra = {}) { return this.skicka([uuid], { dm: uuid }, 'msg', { text, ...extra }); }

  // ---------- grupper ----------
  nyGrupp(medlemmar, namn) {
    return this.lasa(async () => {
      const { grupp } = (await this.api('POST', '/chatt/v2/grupper', { medlemmar })).j;
      const r = this.k('grupp.ny', { grupp, medlemmar, namn });
      await this.spara();
      await this.korSandning('skicka', { till: medlemmar, konv: { grupp }, typ: 'grupp.inbjudan', d: r.inbjudan });
      return grupp;
    });
  }
  andraGrupp(grupp, medlemmar, namn) {
    return this.lasa(async () => {
      await this.api('POST', '/chatt/v2/grupper/medlemmar', { grupp, medlemmar });
      const r = this.k('grupp.andra', { grupp, medlemmar, ...(namn ? { namn } : {}) });
      await this.spara();
      if (r.till.length) await this.korSandning('skicka', { till: r.till, konv: { grupp }, typ: 'grupp.andring', d: r.andring });
      return r;
    });
  }
  async lamnaGrupp(grupp) {
    const info = this.k('grupp.info', { grupp });
    await this.andraGrupp(grupp, info.medlemmar.filter((u) => u !== this.jag));
    await this.lasa(async () => { this.k('grupp.lamna', { grupp }); await this.spara(); });
  }
  gruppInfo(grupp) { return this.k('grupp.info', { grupp }); }
  skickaGrupp(grupp, typ, d) {
    return this.lasa(async () => {
      const server = (await this.api('GET', `/chatt/v2/grupper?grupp=${encodeURIComponent(grupp)}`)).j.medlemmar;
      const r = await this.korSandning('grupp.skicka', { grupp, typ, d, server_medlemmar: server });
      if (r.spok.length) this.logg(`servern visar medlemmar som ingen i gruppen lagt till: ${r.spok.join(', ')}`);
      return r;
    });
  }

  // ---------- ta emot ----------
  // Hämtar kön (väntar upp till `vanta` s), dekrypterar, sparar tillståndet och kvitterar först därefter.
  async hamta({ vanta = 0 } = {}) {
    const { kuvert } = (await this.api('GET', `/chatt/v2/ko?efter=${this.efter}&vanta=${vanta}`)).j;
    return this.lasa(() => this.behandla(kuvert));
  }
  async behandla(nya) {
    const ut = [];
    let kuvert = [...this.vantande.values(), ...nya];
    for (const k of nya) this.efter = Math.max(this.efter, Number(k.id));
    for (let varv = 0; varv < 3 && kuvert.length; varv++) {
      const r = this.k('ta_emot', { kuvert });
      ut.push(...r.handelser.filter((h) => !h.intern));
      await this.spara();
      if (r.kvittera.length) await this.api('POST', '/chatt/v2/ko/kvittera', { ids: r.kvittera });
      for (const id of r.kvittera) this.vantande.delete(String(id));
      const vanta = new Set(r.vanta.map(String));
      for (const u of r.behover_enheter) await this.uppdateraEnheter(u);
      kuvert = kuvert.filter((k) => vanta.has(String(k.id)));
      for (const k of kuvert) this.vantande.set(String(k.id), k);
      if (!r.behover_enheter.length) break;
    }
    if (ut.length) await this.fyllPaNycklar().catch((e) => this.logg('påfyllning: ' + e.message));
    return ut;
  }

  async fyllPaNycklar() {
    const st = (await this.api('GET', '/chatt/v2/nycklar/status')).j;
    const r = this.k('nycklar.fyll', { pa_servern: st.otk, reserv: st.reserv });
    if (!r.otk && !r.reserv) return 0;
    await this.spara();
    await this.api('POST', '/chatt/v2/nycklar', { otk: r.otk || [], reserv: r.reserv });
    this.k('nycklar.publicerade');
    await this.spara();
    return (r.otk || []).length;
  }

  // ---------- bilagor (en egen nyckel per fil; nyckel och digest skickas i meddelandet) ----------
  async laddaUpp(data) {
    const b = Buffer.from(data);
    const k = anropa({ op: 'bilaga.kryptera', data: b.toString('base64') });
    if (!k.ok) throw new E2EFel(k.fel, k.text);
    const chiffer = Buffer.from(k.chiffer, 'base64');
    const { id, del_storlek, delar } = (await this.api('POST', '/chatt/v2/bilagor', { storlek: chiffer.length })).j;
    for (let n = 0; n < delar; n++) await this.api('POST', '/chatt/v2/bilagor/del', { id, del: n, data: chiffer.subarray(n * del_storlek, (n + 1) * del_storlek).toString('base64') });
    await this.api('POST', '/chatt/v2/bilagor/klar', { id });
    return { id, nyckel: k.nyckel, digest: k.digest, storlek: b.length };
  }
  async laddaNed({ id, nyckel, digest }) {
    const delar = [];
    let n = 0, totalt = 1;
    while (n < totalt) { const r = (await this.api('GET', `/chatt/v2/bilagor?id=${id}&del=${n}`)).j; delar.push(Buffer.from(r.data, 'base64')); totalt = r.delar; n++; }
    const r = anropa({ op: 'bilaga.dekryptera', nyckel, digest, chiffer: Buffer.concat(delar).toString('base64') });
    if (!r.ok) throw new E2EFel(r.fel, r.text);
    return Buffer.from(r.data, 'base64');
  }
}

module.exports = { E2EKlient, E2EFel, MinnesLagring, FilLagring };
