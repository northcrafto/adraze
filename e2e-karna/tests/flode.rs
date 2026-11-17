//! Hela flöden genom JSON-gränssnittet mot en låtsasserver i minnet som gör samma kontroller som
//! /chatt/v2 (exakt enhetslista → 409, fel enhetsnyckel → 410, engångsnycklar som tas bort när de lämnas ut).

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{json, Value};

const NU: u64 = 1_794_830_400_000;

fn anropa(v: Value) -> Value {
    serde_json::from_str(&adraze_e2e::anropa(&v.to_string())).unwrap()
}

fn ok(v: Value) -> Value {
    let r = anropa(v.clone());
    assert_eq!(r["ok"], true, "anropet {v} gav {r}");
    r
}

// ------------------------------------------------------------------------------------------------
// Låtsasservern
// ------------------------------------------------------------------------------------------------

#[derive(Default)]
struct SEnhet {
    cert: Value,
    cert_sig: Value,
    otk: Vec<Value>,
    reserv: Value,
}

#[derive(Default)]
struct SKonto {
    identitet: String,
    valv: String,
    valv_token_hash: String,
    enheter: BTreeMap<u32, SEnhet>,
    nasta: u32,
}

#[derive(Default)]
struct Server {
    konton: BTreeMap<String, SKonto>,
    ko: BTreeMap<(String, u32), Vec<Value>>,
    nasta_kuvert: u64,
    /// Allt som skickats till servern, för att leta klartext.
    logg: Vec<String>,
}

fn sha256_hex(b: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

impl Server {
    fn ny_enhet(&mut self, uuid: &str, e: &Value) -> u32 {
        self.logg.push(e.to_string());
        let k = self.konton.get_mut(uuid).unwrap();
        k.nasta += 1;
        let id = k.nasta;
        k.enheter.insert(
            id,
            SEnhet { cert: e["cert"].clone(), cert_sig: e["cert_sig"].clone(), otk: e["otk"].as_array().unwrap().clone(), reserv: e["reserv"].clone() },
        );
        id
    }

    fn konto(&mut self, reg: &Value) -> u32 {
        self.logg.push(reg.to_string());
        let uuid = reg["uuid"].as_str().unwrap().to_owned();
        self.konton.insert(
            uuid.clone(),
            SKonto {
                identitet: reg["identitet"].as_str().unwrap().into(),
                valv: reg["valv"].as_str().unwrap().into(),
                valv_token_hash: reg["valv_token_hash"].as_str().unwrap().into(),
                ..Default::default()
            },
        );
        self.ny_enhet(&uuid, &reg["enhet"])
    }

    fn enheter(&self, uuid: &str) -> Value {
        let k = &self.konton[uuid];
        let l: Vec<Value> = k.enheter.iter().map(|(id, e)| json!({ "id": id, "cert": e.cert, "cert_sig": e.cert_sig })).collect();
        json!({ "uuid": uuid, "identitet": k.identitet, "enheter": l })
    }

    fn nycklar(&mut self, uuid: &str, ids: &Value) -> Value {
        let k = self.konton.get_mut(uuid).unwrap();
        let mut l = Vec::new();
        for id in ids.as_array().unwrap() {
            let id = id.as_u64().unwrap() as u32;
            let Some(e) = k.enheter.get_mut(&id) else { continue };
            let otk = if e.otk.is_empty() { Value::Null } else { e.otk.remove(0) };
            let reserv = if otk.is_null() { e.reserv.clone() } else { Value::Null };
            l.push(json!({ "id": id, "cert": e.cert, "cert_sig": e.cert_sig, "otk": otk, "reserv": reserv }));
        }
        json!({ "uuid": uuid, "identitet": k.identitet, "enheter": l })
    }

    fn lagg_i_ko(&mut self, uuid: &str, id: u32, mut k: Value) {
        self.nasta_kuvert += 1;
        k["id"] = json!(self.nasta_kuvert);
        self.ko.entry((uuid.to_owned(), id)).or_default().push(k);
    }

    /// PUT /chatt/v2/meddelanden
    fn meddelanden(&mut self, fran: &str, fe: u32, b: &Value) -> Result<(), Value> {
        self.logg.push(b.to_string());
        for m in b["mottagare"].as_array().unwrap() {
            let u = m["uuid"].as_str().unwrap();
            let k = &self.konton[u];
            let aktiva: BTreeSet<u32> = k.enheter.keys().copied().filter(|id| !(u == fran && *id == fe)).collect();
            let listade: BTreeSet<u32> = m["enheter"].as_array().unwrap().iter().map(|e| e["id"].as_u64().unwrap() as u32).collect();
            if aktiva != listade {
                let saknas: Vec<u32> = aktiva.difference(&listade).copied().collect();
                let extra: Vec<u32> = listade.difference(&aktiva).copied().collect();
                return Err(json!({ "fel": "enheter_andrade", "uuid": u, "saknas": saknas, "extra": extra }));
            }
            let inaktuella: Vec<u32> = m["enheter"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|e| k.enheter[&(e["id"].as_u64().unwrap() as u32)].cert["curve"] != e["k"])
                .map(|e| e["id"].as_u64().unwrap() as u32)
                .collect();
            if !inaktuella.is_empty() {
                return Err(json!({ "fel": "enheter_inaktuella", "uuid": u, "inaktuella": inaktuella }));
            }
        }
        for m in b["mottagare"].as_array().unwrap() {
            let u = m["uuid"].as_str().unwrap().to_owned();
            for e in m["enheter"].as_array().unwrap() {
                let id = e["id"].as_u64().unwrap() as u32;
                self.lagg_i_ko(&u, id, json!({ "typ": "olm", "fran": fran, "fe": fe, "mt": e["mt"], "c": e["c"], "ts": NU }));
            }
        }
        Ok(())
    }

    /// POST /chatt/v2/grupper/meddelanden (medlemskontrollen görs av den riktiga servern)
    fn grupp(&mut self, fran: &str, fe: u32, b: &Value) {
        self.logg.push(b.to_string());
        for e in b["enheter"].as_array().unwrap() {
            let u = e["uuid"].as_str().unwrap();
            let id = e["id"].as_u64().unwrap() as u32;
            self.lagg_i_ko(u, id, json!({ "typ": "grupp", "fran": fran, "fe": fe, "grupp": b["grupp"], "sid": b["sid"], "c": b["c"], "ts": NU }));
        }
    }

    fn hamta(&mut self, uuid: &str, id: u32) -> Vec<Value> {
        self.ko.get(&(uuid.to_owned(), id)).cloned().unwrap_or_default()
    }

    fn kvittera(&mut self, uuid: &str, id: u32, ids: &Value) {
        let ids: BTreeSet<String> = ids.as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_owned()).collect();
        if let Some(l) = self.ko.get_mut(&(uuid.to_owned(), id)) {
            l.retain(|k| !ids.contains(&k["id"].to_string()));
        }
    }
}

// ------------------------------------------------------------------------------------------------
// En klientenhet (samma orkestrering som JS- och Swift-klienterna gör mot den riktiga servern)
// ------------------------------------------------------------------------------------------------

struct Enhet {
    h: u64,
    uuid: String,
    id: u32,
    nyckel: String,
}

impl Enhet {
    fn ny() -> Self {
        let nyckel = ok(json!({ "op": "ny_lagringsnyckel" }))["nyckel"].as_str().unwrap().to_owned();
        let h = ok(json!({ "op": "oppna", "lagringsnyckel": nyckel }))["h"].as_u64().unwrap();
        Enhet { h, uuid: String::new(), id: 0, nyckel }
    }

    fn op(&self, op: &str, mut a: Value) -> Value {
        a["op"] = json!(op);
        a["h"] = json!(self.h);
        if a.get("nu").is_none() {
            a["nu"] = json!(NU);
        }
        anropa(a)
    }

    fn okop(&self, op: &str, a: Value) -> Value {
        let r = self.op(op, a.clone());
        assert_eq!(r["ok"], true, "{op} {a} gav {r}");
        r
    }

    fn skapa(srv: &mut Server, namn: &str) -> (Self, String) {
        let mut e = Self::ny();
        let r = e.okop("identitet.skapa", json!({ "plattform": "test", "namn": namn }));
        let id = srv.konto(&r["registrering"]);
        e.okop("identitet.registrerad", json!({ "enhet_id": id }));
        e.uuid = r["registrering"]["uuid"].as_str().unwrap().into();
        e.id = id;
        (e, r["kod"].as_str().unwrap().into())
    }

    fn uppdatera_enheter(&self, srv: &Server, u: &str) -> Value {
        self.okop("kontakt.enheter", json!({ "uuid": u, "svar": srv.enheter(u) }))
    }

    /// Kör `skicka`/`grupp.skicka` tills begäran gått fram (eller något stoppar).
    fn skicka_op(&self, srv: &mut Server, op: &str, a: Value) -> Value {
        for _ in 0..8 {
            let r = self.op(op, a.clone());
            assert_eq!(r["ok"], true, "{op} gav {r}");
            if let Some(l) = r.get("behover_enheter").and_then(Value::as_array) {
                for u in l {
                    self.uppdatera_enheter(srv, u.as_str().unwrap());
                }
                continue;
            }
            if let Some(m) = r.get("behover_buntar").and_then(Value::as_object) {
                for (u, ids) in m {
                    let svar = srv.nycklar(u, ids);
                    self.okop("kontakt.buntar", json!({ "uuid": u, "svar": svar }));
                }
                continue;
            }
            if let Some(b) = r.get("begaran_dela") {
                srv.meddelanden(&self.uuid, self.id, b).unwrap();
                self.okop("grupp.delat", json!({ "grupp": r["grupp"], "dela": r["dela"] }));
                continue;
            }
            if let Some(b) = r.get("begaran") {
                if op == "grupp.skicka" {
                    srv.grupp(&self.uuid, self.id, b);
                    return r;
                }
                match srv.meddelanden(&self.uuid, self.id, b) {
                    Ok(()) => return r,
                    Err(svar) => {
                        self.okop("avvisad", json!({ "svar": svar }));
                        continue;
                    }
                }
            }
            return r;
        }
        panic!("{op} kom aldrig fram");
    }

    fn skicka(&self, srv: &mut Server, till: &[&str], text: &str) -> Value {
        let till: Vec<&str> = till.to_vec();
        self.skicka_op(srv, "skicka", json!({ "till": till, "konv": { "dm": till[0] }, "typ": "msg", "d": { "text": text } }))
    }

    fn hamta(&self, srv: &mut Server) -> Vec<Value> {
        let mut kuvert = srv.hamta(&self.uuid, self.id);
        let mut ut = Vec::new();
        for _ in 0..3 {
            if kuvert.is_empty() {
                break;
            }
            let r = self.okop("ta_emot", json!({ "kuvert": kuvert }));
            ut.extend(r["handelser"].as_array().unwrap().iter().filter(|h| h["intern"] != true).cloned());
            srv.kvittera(&self.uuid, self.id, &json!(r["kvittera"].as_array().unwrap().iter().map(|v| v.to_string().trim_matches('"').to_owned()).collect::<Vec<_>>()));
            let vanta: BTreeSet<String> = r["vanta"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_owned()).collect();
            for u in r["behover_enheter"].as_array().unwrap() {
                self.uppdatera_enheter(srv, u.as_str().unwrap());
            }
            kuvert = srv.hamta(&self.uuid, self.id).into_iter().filter(|k| vanta.contains(&k["id"].to_string())).collect();
        }
        ut
    }

    fn texter(&self, srv: &mut Server) -> Vec<String> {
        self.hamta(srv).iter().filter(|h| h["typ"] == "msg").map(|h| h["d"]["text"].as_str().unwrap().to_owned()).collect()
    }
}

/// Länkar en ny enhet till `befintlig` via HPKE-reläet (flöde A: den nya visar QR, den befintliga skannar).
fn lanka(srv: &mut Server, befintlig: &Enhet) -> Enhet {
    let mut ny = Enhet::ny();
    let lank_id = "lank-1";
    let qr = ny.okop("lank.visa", json!({}));
    let s1 = befintlig.okop("lank.skanna", json!({ "nyckel": qr["nyckel"], "lank_id": lank_id, "hej": "AdRaze iPhone" }));
    let s2 = ny.okop("lank.svara", json!({ "steg1": s1["steg1"], "lank_id": lank_id, "svar": "AdRaze dator" }));
    assert_eq!(s2["hej"], "AdRaze iPhone");
    let k = befintlig.okop("lank.kontroll", json!({ "steg2": s2["steg2"], "lank_id": lank_id }));
    assert_eq!(k["kod"], s2["kod"], "kontrollkoderna ska vara lika");
    assert_eq!(k["kod"].as_str().unwrap().len(), 2);
    let s3 = befintlig.okop("lank.skicka_hemligt", json!({ "lank_id": lank_id, "lankkod": "engangskod" }));
    let r = ny.okop("lank.ta_emot_hemligt", json!({ "steg3": s3["steg3"], "lank_id": lank_id, "plattform": "test" }));
    assert_eq!(r["registrering"]["lankkod"], "engangskod");
    let uuid = r["registrering"]["uuid"].as_str().unwrap().to_owned();
    assert_eq!(uuid, befintlig.uuid);
    let id = srv.ny_enhet(&uuid, &r["registrering"]["enhet"]);
    ny.okop("identitet.registrerad", json!({ "enhet_id": id }));
    ny.uuid = uuid;
    ny.id = id;
    ny
}

// ------------------------------------------------------------------------------------------------

#[test]
fn en_till_en_med_flera_enheter_och_synk() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva dator");
    let a2 = lanka(&mut srv, &a1);
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");

    // Alva → Bo: Bo får det, Alvas andra enhet får synkkopian.
    let r = a1.skicka(&mut srv, &[&b1.uuid], "hej Bo, hemligt-1");
    assert!(r["id"].as_str().unwrap().len() == 32);
    let hb = b1.hamta(&mut srv);
    assert_eq!(hb.len(), 1);
    assert_eq!(hb[0]["d"]["text"], "hej Bo, hemligt-1");
    assert_eq!(hb[0]["konv"]["dm"], a1.uuid);
    assert_eq!(hb[0]["fran"], a1.uuid);
    let ha2 = a2.hamta(&mut srv);
    assert_eq!(ha2.len(), 1, "synkkopia till Alvas andra enhet");
    assert_eq!(ha2[0]["konv"]["dm"], b1.uuid);
    assert_eq!(ha2[0]["d"]["text"], "hej Bo, hemligt-1");

    // Bo → Alva: båda Alvas enheter.
    b1.skicka(&mut srv, &[&a1.uuid], "hej Alva, hemligt-2");
    assert_eq!(a1.texter(&mut srv), vec!["hej Alva, hemligt-2"]);
    assert_eq!(a2.texter(&mut srv), vec!["hej Alva, hemligt-2"]);

    // Fler meddelanden åt båda håll (nu vanliga Olm-meddelanden, ny ratchet-nyckel).
    for i in 0..3 {
        a2.skicka(&mut srv, &[&b1.uuid], &format!("från telefonen {i}"));
        b1.skicka(&mut srv, &[&a1.uuid], &format!("svar {i}"));
    }
    assert_eq!(b1.texter(&mut srv), vec!["från telefonen 0", "från telefonen 1", "från telefonen 2"]);
    assert_eq!(a1.texter(&mut srv).len(), 6, "3 synkkopior från telefonen + 3 svar");
    assert_eq!(a2.texter(&mut srv), vec!["svar 0", "svar 1", "svar 2"]);

    // Servern har aldrig sett klartexten.
    for rad in &srv.logg {
        assert!(!rad.contains("hemligt") && !rad.contains("telefonen") && !rad.contains("svar 1"), "klartext hos servern: {rad}");
    }
}

#[test]
fn ny_enhet_hos_mottagaren_ger_409_och_omforsok() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    a1.skicka(&mut srv, &[&b1.uuid], "ett");
    assert_eq!(b1.texter(&mut srv), vec!["ett"]);
    // Bo länkar en telefon. Alva vet inte om den: servern svarar 409 och Alva hämtar listan igen.
    let b2 = lanka(&mut srv, &b1);
    a1.skicka(&mut srv, &[&b1.uuid], "två");
    assert_eq!(b1.texter(&mut srv), vec!["två"]);
    assert_eq!(b2.texter(&mut srv), vec!["två"]);
}

#[test]
fn tomda_engangsnycklar_ger_reservnyckeln() {
    let mut srv = Server::default();
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    srv.konton.get_mut(&b1.uuid).unwrap().enheter.get_mut(&1).unwrap().otk.clear();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    a1.skicka(&mut srv, &[&b1.uuid], "via reservnyckeln");
    assert_eq!(b1.texter(&mut srv), vec!["via reservnyckeln"]);
    // Påfyllning: servern har 0 kvar
    let f = b1.okop("nycklar.fyll", json!({ "pa_servern": 0, "reserv": true }));
    assert!(f["otk"].as_array().unwrap().len() >= 30);
}

#[test]
fn manipulerat_uppspelat_och_fel_enhet_avvisas() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    let (c1, _) = Enhet::skapa(&mut srv, "Cia");
    a1.skicka(&mut srv, &[&b1.uuid], "första");
    let original = srv.hamta(&b1.uuid, 1)[0].clone();
    b1.uppdatera_enheter(&srv, &a1.uuid);

    // Ändrad byte i chiffret
    let mut fel = original.clone();
    let mut c = fel["c"].as_str().unwrap().to_owned().into_bytes();
    let i = c.len() / 2;
    c[i] = if c[i] == b'A' { b'B' } else { b'A' };
    fel["c"] = json!(String::from_utf8(c).unwrap());
    let r = b1.okop("ta_emot", json!({ "kuvert": [fel] }));
    assert_eq!(r["handelser"][0]["typ"], "avvisat");
    assert_eq!(r["handelser"][0]["fel"], "manipulerat");

    // Rätt kuvert går fortfarande
    let r = b1.okop("ta_emot", json!({ "kuvert": [original.clone()] }));
    assert_eq!(r["handelser"][0]["d"]["text"], "första");

    // Samma kuvert igen (servern spelar upp det) och med nytt kuvert-id
    let mut igen = original.clone();
    igen["id"] = json!(999);
    let r = b1.okop("ta_emot", json!({ "kuvert": [igen] }));
    assert_eq!(r["handelser"][0]["fel"], "uppspelat");

    // Kuvertet levererat till fel konto/enhet: Cia kan inte läsa det
    c1.uppdatera_enheter(&srv, &a1.uuid);
    let r = c1.okop("ta_emot", json!({ "kuvert": [original.clone()] }));
    assert_eq!(r["handelser"][0]["typ"], "avvisat", "{r}");
    assert!(r["handelser"][0]["text"].as_str().unwrap().len() > 3);

    // Avsändare som servern ljuger om (Bo:s kuvert märkt som från Cia): avvisas
    a1.skicka(&mut srv, &[&b1.uuid], "andra");
    let mut fejk = srv.hamta(&b1.uuid, 1).last().unwrap().clone();
    fejk["fran"] = json!(c1.uuid);
    b1.uppdatera_enheter(&srv, &c1.uuid);
    let r = b1.okop("ta_emot", json!({ "kuvert": [fejk] }));
    assert_eq!(r["handelser"][0]["typ"], "avvisat");

    // Gammalt meddelande (mer än 30 dagar)
    let gammal = b1.op("ta_emot", json!({ "kuvert": [srv.hamta(&b1.uuid, 1).last().unwrap().clone()], "nu": NU + 31 * 86_400_000 }));
    assert_eq!(gammal["handelser"][0]["fel"], "for_gammalt");
}

#[test]
fn andrad_identitet_varnar_och_stoppar_verifierad_kontakt() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    a1.skicka(&mut srv, &[&b1.uuid], "hej");
    b1.hamta(&mut srv);

    // Säkerhetsnummer: samma hos båda, QR-koden verifierar.
    let sa = a1.okop("sakerhetsnummer", json!({ "uuid": b1.uuid }));
    let sb = b1.okop("sakerhetsnummer", json!({ "uuid": a1.uuid }));
    assert_eq!(sa["siffror"], sb["siffror"]);
    assert_eq!(sa["siffror"].as_str().unwrap().len(), 60);
    assert_eq!(a1.okop("verifiera", json!({ "uuid": b1.uuid, "qr": sb["qr"] }))["stammer"], true);
    assert_eq!(a1.okop("kontakt.status", json!({ "uuid": b1.uuid }))["verifierad"], true);
    // Fel QR verifierar inte: Bos egen kod, och en kod från någon med en annan identitet
    let r = b1.okop("verifiera", json!({ "uuid": a1.uuid, "qr": sb["qr"] }));
    assert_eq!(r["stammer"], false);
    let (x1, _) = Enhet::skapa(&mut srv, "Xena");
    x1.uppdatera_enheter(&srv, &b1.uuid);
    let qr_x = x1.okop("sakerhetsnummer", json!({ "uuid": b1.uuid }))["qr"].as_str().unwrap().replace(&x1.uuid, &a1.uuid);
    let r = b1.okop("verifiera", json!({ "uuid": a1.uuid, "qr": qr_x }));
    assert_eq!(r["stammer"], false);
    assert_eq!(b1.okop("kontakt.status", json!({ "uuid": a1.uuid }))["verifierad"], false);

    // Servern byter Bos identitet (till exempel ett angrepp, eller "börja om")
    let bo_id = srv.konton[&b1.uuid].identitet.clone();
    let (falsk, _) = Enhet::skapa(&mut srv, "falsk");
    let falsk_id = srv.konton[&falsk.uuid].identitet.clone();
    let falsk_enhet = srv.konton.get_mut(&falsk.uuid).unwrap().enheter.remove(&1).unwrap();
    let bo = srv.konton.get_mut(&b1.uuid).unwrap();
    bo.identitet = falsk_id;
    bo.enheter.insert(2, falsk_enhet);
    let r = a1.uppdatera_enheter(&srv, &b1.uuid);
    assert_eq!(r["andrad"], true);
    assert_eq!(r["blockerad"], true, "verifierad kontakt: sändningen stoppas");
    let r = a1.op("skicka", json!({ "till": [b1.uuid], "konv": { "dm": b1.uuid }, "typ": "msg", "d": { "text": "x" } }));
    assert_eq!(r["blockerad"][0], b1.uuid);
    let st = a1.okop("kontakt.status", json!({ "uuid": b1.uuid }));
    assert_eq!(st["vantar_godkannande"], true);

    // Servern visar Bos riktiga identitet igen: stoppet hävs, verifieringen gäller, varningen ligger kvar
    let bo = srv.konton.get_mut(&b1.uuid).unwrap();
    bo.identitet = bo_id.clone();
    let falsk_enhet = bo.enheter.remove(&2).unwrap();
    let r = a1.uppdatera_enheter(&srv, &b1.uuid);
    assert_eq!(r["blockerad"], false);
    assert_eq!(r["enheter"], 1);
    let st = a1.okop("kontakt.status", json!({ "uuid": b1.uuid }));
    assert_eq!(st["vantar_godkannande"], false);
    assert_eq!(st["verifierad"], true);
    assert_eq!(st["andrad"], true, "varningen om att numret ändrats finns kvar");
    a1.skicka(&mut srv, &[&b1.uuid], "igen");
    assert_eq!(b1.texter(&mut srv), vec!["igen"]);

    // Bytet igen, och användaren godkänner: den identitet som servern visar nu godtas, verifieringen tas bort
    let falsk_id = srv.konton[&falsk.uuid].identitet.clone();
    let bo = srv.konton.get_mut(&b1.uuid).unwrap();
    bo.identitet = falsk_id.clone();
    bo.enheter.insert(2, falsk_enhet);
    assert_eq!(a1.uppdatera_enheter(&srv, &b1.uuid)["blockerad"], true);
    a1.okop("kontakt.godkann", json!({ "uuid": b1.uuid }));
    let st = a1.okop("kontakt.status", json!({ "uuid": b1.uuid }));
    assert_eq!(st["verifierad"], false);
    assert_eq!(st["identitet"], json!(falsk_id));
    assert_ne!(st["identitet"], json!(bo_id));

    // En overifierad kontakt (Cia ser Bo för första gången efter bytet) varnas men stoppas inte
    let (c1, _) = Enhet::skapa(&mut srv, "Cia");
    c1.uppdatera_enheter(&srv, &a1.uuid);
    let (d1, _) = Enhet::skapa(&mut srv, "Dan");
    d1.uppdatera_enheter(&srv, &c1.uuid);
    let dan = srv.konton[&d1.uuid].identitet.clone();
    srv.konton.get_mut(&c1.uuid).unwrap().identitet = dan;
    let r = d1.uppdatera_enheter(&srv, &c1.uuid);
    assert_eq!(r["andrad"], true);
    assert_eq!(r["blockerad"], false);
    assert_eq!(r["enheter"], 0, "Cias enheter är inte signerade av den nya identiteten");
    assert_eq!(r["ogiltiga"], 1);
}

#[test]
fn enhet_som_servern_smyger_in_godtas_inte() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    // Servern lägger till en egen enhet hos Bo, signerad med en annan nyckel.
    let (falsk, _) = Enhet::skapa(&mut srv, "falsk");
    let mut fe = srv.konton.get_mut(&falsk.uuid).unwrap().enheter.remove(&1).unwrap();
    fe.cert["uuid"] = json!(b1.uuid);
    srv.konton.get_mut(&b1.uuid).unwrap().enheter.insert(5, fe);
    let r = a1.uppdatera_enheter(&srv, &b1.uuid);
    assert_eq!(r["enheter"], 1);
    assert_eq!(r["ogiltiga"], 1);
    a1.uppdatera_enheter(&srv, &a1.uuid);
    // Sändningen krypteras bara till Bos riktiga enhet; servern vill ha med enhet 5 och svarar 409 hela tiden.
    let r = a1.op("skicka", json!({ "till": [b1.uuid], "konv": { "dm": b1.uuid }, "typ": "msg", "d": { "text": "x" } }));
    let r = if r.get("behover_buntar").is_some() {
        let svar = srv.nycklar(&b1.uuid, &json!([1]));
        a1.okop("kontakt.buntar", json!({ "uuid": b1.uuid, "svar": svar }));
        a1.okop("skicka", json!({ "till": [b1.uuid], "konv": { "dm": b1.uuid }, "typ": "msg", "d": { "text": "x" } }))
    } else {
        r
    };
    let enheter = &r["begaran"]["mottagare"][0]["enheter"];
    assert_eq!(enheter.as_array().unwrap().len(), 1);
    assert_eq!(enheter[0]["id"], 1);
}

#[test]
fn grupp_med_byte_av_avsandarnyckel_nar_nagon_kickas() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let a2 = lanka(&mut srv, &a1);
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    let (c1, _) = Enhet::skapa(&mut srv, "Cia");
    let gid = "g-test-1";
    let medl = json!([b1.uuid, c1.uuid]);
    let inb = a1.okop("grupp.ny", json!({ "grupp": gid, "medlemmar": medl, "namn": "Fikagänget" }));
    let till: Vec<String> = vec![b1.uuid.clone(), c1.uuid.clone()];
    a1.skicka_op(&mut srv, "skicka", json!({ "till": till, "konv": { "grupp": gid }, "typ": "grupp.inbjudan", "d": inb["inbjudan"] }));
    for e in [&b1, &c1, &a2] {
        let h = e.hamta(&mut srv);
        assert_eq!(h[0]["typ"], "grupp.inbjudan", "{h:?}");
        assert_eq!(e.okop("grupp.info", json!({ "grupp": gid }))["namn"], "Fikagänget");
    }

    // Alva skickar i gruppen: nyckeln delas först, sedan ett Megolm-meddelande.
    a1.skicka_op(&mut srv, "grupp.skicka", json!({ "grupp": gid, "typ": "msg", "d": { "text": "gruppen-1" } }));
    for e in [&b1, &c1, &a2] {
        let h: Vec<Value> = e.hamta(&mut srv).into_iter().filter(|h| h["typ"] == "msg").collect();
        assert_eq!(h.len(), 1, "{}", e.uuid);
        assert_eq!(h[0]["d"]["text"], "gruppen-1");
        assert_eq!(h[0]["konv"]["grupp"], gid);
        assert_eq!(h[0]["kanal"], "grupp");
    }
    // Bo svarar
    b1.skicka_op(&mut srv, "grupp.skicka", json!({ "grupp": gid, "typ": "msg", "d": { "text": "gruppen-2" } }));
    for e in [&a1, &a2, &c1] {
        let t: Vec<Value> = e.hamta(&mut srv).into_iter().filter(|h| h["typ"] == "msg").collect();
        assert_eq!(t[0]["d"]["text"], "gruppen-2");
    }
    let sid_fore = a1.okop("grupp.info", json!({ "grupp": gid }))["sid"].clone();

    // Alva kickar Cia
    let andr = a1.okop("grupp.andra", json!({ "grupp": gid, "medlemmar": [a1.uuid, b1.uuid] }));
    assert_eq!(andr["borttagna"][0], c1.uuid);
    let till: Vec<String> = andr["till"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_owned()).collect();
    a1.skicka_op(&mut srv, "skicka", json!({ "till": till, "konv": { "grupp": gid }, "typ": "grupp.andring", "d": andr["andring"] }));
    for e in [&b1, &c1, &a2] {
        e.hamta(&mut srv);
    }
    assert_eq!(c1.okop("grupp.info", json!({ "grupp": gid }))["utanfor"], true);

    // Nästa meddelande har en ny session som Cia inte får
    let r = a1.skicka_op(&mut srv, "grupp.skicka", json!({ "grupp": gid, "typ": "msg", "d": { "text": "utan-cia" } }));
    assert_ne!(r["begaran"]["sid"], sid_fore, "ny avsändarnyckel efter att någon kickats");
    assert!(!r["begaran"]["enheter"].as_array().unwrap().iter().any(|e| e["uuid"] == c1.uuid.as_str()));
    let t: Vec<Value> = b1.hamta(&mut srv).into_iter().filter(|h| h["typ"] == "msg").collect();
    assert_eq!(t[0]["d"]["text"], "utan-cia");
    // Om servern ändå ger Cia chiffret kan hon inte läsa det
    let k = json!({ "id": 77, "typ": "grupp", "fran": a1.uuid, "fe": a1.id, "grupp": gid, "sid": r["begaran"]["sid"], "c": r["begaran"]["c"], "ts": NU - 200_000 });
    let rc = c1.okop("ta_emot", json!({ "kuvert": [k] }));
    assert_eq!(rc["handelser"][0]["typ"], "avvisat");
    assert_eq!(rc["handelser"][0]["fel"], "okand_session");

    // Bo byter också sin session när han fått ändringen
    let rb = b1.skicka_op(&mut srv, "grupp.skicka", json!({ "grupp": gid, "typ": "msg", "d": { "text": "bo-utan-cia" } }));
    assert!(!rb["begaran"]["enheter"].as_array().unwrap().iter().any(|e| e["uuid"] == c1.uuid.as_str()));

    // Uppspelat gruppmeddelande avvisas
    let kopia = srv.hamta(&a2.uuid, a2.id).into_iter().find(|k| k["typ"] == "grupp").unwrap();
    a2.hamta(&mut srv);
    let r = a2.okop("ta_emot", json!({ "kuvert": [kopia] }));
    assert_eq!(r["handelser"][0]["fel"], "uppspelat");
}

#[test]
fn spokmedlem_far_ingen_nyckel() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (b1, _) = Enhet::skapa(&mut srv, "Bo");
    let (m1, _) = Enhet::skapa(&mut srv, "Mallory");
    let gid = "g-spok";
    let inb = a1.okop("grupp.ny", json!({ "grupp": gid, "medlemmar": [b1.uuid] }));
    a1.skicka_op(&mut srv, "skicka", json!({ "till": [b1.uuid], "konv": { "grupp": gid }, "typ": "grupp.inbjudan", "d": inb["inbjudan"] }));
    b1.hamta(&mut srv);
    // Servern påstår att Mallory är med
    let r = a1.skicka_op(
        &mut srv,
        "grupp.skicka",
        json!({ "grupp": gid, "typ": "msg", "d": { "text": "hemlig" }, "server_medlemmar": [a1.uuid, b1.uuid, m1.uuid] }),
    );
    assert_eq!(r["spok"][0], m1.uuid);
    assert!(!r["begaran"]["enheter"].as_array().unwrap().iter().any(|e| e["uuid"] == m1.uuid.as_str()));
    assert!(srv.hamta(&m1.uuid, 1).is_empty());
    assert_eq!(b1.texter(&mut srv), vec!["hemlig"]);
    // Mallory kan inte heller bjuda in sig själv: en ändring från en icke-medlem avvisas
    m1.uppdatera_enheter(&srv, &b1.uuid);
    b1.uppdatera_enheter(&srv, &m1.uuid);
    let falsk = json!({ "grupp": gid, "medlemmar": [a1.uuid, b1.uuid, m1.uuid], "version": 9 });
    m1.skicka_op(&mut srv, "skicka", json!({ "till": [b1.uuid], "konv": { "grupp": gid }, "typ": "grupp.andring", "d": falsk }));
    let h = b1.hamta(&mut srv);
    assert_eq!(h[0]["typ"], "avvisat");
    assert_eq!(h[0]["fel"], "obehorig");
    // och ett vanligt meddelande till gruppen via 1:1 från henne godtas inte heller
    m1.skicka_op(&mut srv, "skicka", json!({ "till": [b1.uuid], "konv": { "grupp": gid }, "typ": "msg", "d": { "text": "jag är med" } }));
    let h = b1.hamta(&mut srv);
    assert_eq!(h[0]["fel"], "obehorig");
}

#[test]
fn aterstallning_med_koden_ger_samma_identitet() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (b1, kod) = Enhet::skapa(&mut srv, "Bo");
    a1.skicka(&mut srv, &[&b1.uuid], "före");
    b1.hamta(&mut srv);
    let sn_fore = a1.okop("sakerhetsnummer", json!({ "uuid": b1.uuid }))["siffror"].clone();

    // Bo tappar telefonen. Ny enhet: koden ger valv-token, valvet öppnas.
    let mut b2 = Enhet::ny();
    let fel = b2.op("aterstall.oppna", json!({ "kod": "fel".repeat(21) + "x", "valv": srv.konton[&b1.uuid].valv }));
    assert_eq!(fel["fel"], "fel_kod");
    let grupperad: String = kod.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap().to_uppercase()).collect::<Vec<_>>().join("-");
    let token = ok(json!({ "op": "aterstall.token", "kod": grupperad }))["valv_token"].as_str().unwrap().to_owned();
    use base64::Engine;
    let t = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(&token).unwrap();
    assert_eq!(sha256_hex(&t), srv.konton[&b1.uuid].valv_token_hash, "servern kan kontrollera valv-token");
    let r = b2.okop("aterstall.oppna", json!({ "kod": grupperad, "valv": srv.konton[&b1.uuid].valv, "identitet": srv.konton[&b1.uuid].identitet }));
    assert_eq!(r["registrering"]["uuid"], b1.uuid);
    // Den gamla enheten tas bort, den nya registreras
    srv.konton.get_mut(&b1.uuid).unwrap().enheter.clear();
    let id = srv.ny_enhet(&b1.uuid, &r["registrering"]["enhet"]);
    b2.okop("identitet.registrerad", json!({ "enhet_id": id }));
    b2.uuid = b1.uuid.clone();
    b2.id = id;

    // Alva märker ingen identitetsändring, och meddelandet når den nya enheten
    a1.skicka(&mut srv, &[&b2.uuid], "efter");
    assert_eq!(b2.texter(&mut srv), vec!["efter"]);
    let st = a1.okop("kontakt.status", json!({ "uuid": b2.uuid }));
    assert_eq!(st["andrad"], false);
    assert_eq!(a1.okop("sakerhetsnummer", json!({ "uuid": b1.uuid }))["siffror"], sn_fore);
    assert_eq!(b2.okop("aterstallningskod", json!({}))["kod"], kod);
}

#[test]
fn tillstandet_sparas_krypterat_och_overlever_omstart() {
    let mut srv = Server::default();
    let (a1, _) = Enhet::skapa(&mut srv, "Alva");
    let (mut b1, _) = Enhet::skapa(&mut srv, "Bo");
    a1.skicka(&mut srv, &[&b1.uuid], "ett");
    b1.hamta(&mut srv);
    let t = b1.okop("spara", json!({}))["tillstand"].as_str().unwrap().to_owned();
    // Inga nycklar eller texter i klartext i det sparade
    use base64::Engine;
    let blob = base64::engine::general_purpose::STANDARD.decode(&t).unwrap();
    let text = String::from_utf8_lossy(&blob);
    assert!(!text.contains("pickle") && !text.contains(&b1.uuid));
    b1.okop("stang", json!({}));
    // Fel nyckel öppnar inte
    let annan = ok(json!({ "op": "ny_lagringsnyckel" }))["nyckel"].clone();
    let r = anropa(json!({ "op": "oppna", "lagringsnyckel": annan, "tillstand": t }));
    assert_eq!(r["fel"], "manipulerat");
    // Rätt nyckel: sessionen fortsätter
    b1.h = ok(json!({ "op": "oppna", "lagringsnyckel": b1.nyckel, "tillstand": t }))["h"].as_u64().unwrap();
    b1.skicka(&mut srv, &[&a1.uuid], "efter omstart");
    a1.skicka(&mut srv, &[&b1.uuid], "två");
    assert_eq!(a1.texter(&mut srv), vec!["efter omstart"]);
    assert_eq!(b1.texter(&mut srv), vec!["två"]);
}

#[test]
fn bilaga_med_egen_nyckel() {
    use base64::Engine;
    let data: Vec<u8> = (0..100_000u32).map(|i| (i % 251) as u8).collect();
    let k = ok(json!({ "op": "bilaga.kryptera", "data": base64::engine::general_purpose::STANDARD.encode(&data) }));
    let ut = ok(json!({ "op": "bilaga.dekryptera", "nyckel": k["nyckel"], "digest": k["digest"], "chiffer": k["chiffer"] }));
    assert_eq!(base64::engine::general_purpose::STANDARD.decode(ut["data"].as_str().unwrap()).unwrap(), data);
    let mut c = base64::engine::general_purpose::STANDARD.decode(k["chiffer"].as_str().unwrap()).unwrap();
    c[500] ^= 1;
    let r = anropa(json!({ "op": "bilaga.dekryptera", "nyckel": k["nyckel"], "digest": k["digest"], "chiffer": base64::engine::general_purpose::STANDARD.encode(&c) }));
    assert_eq!(r["fel"], "manipulerat");
    let k2 = ok(json!({ "op": "bilaga.kryptera", "data": base64::engine::general_purpose::STANDARD.encode(&data) }));
    assert_ne!(k["nyckel"], k2["nyckel"], "ny nyckel per fil");
}
