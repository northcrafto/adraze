//! Klientens tillstånd och protokoll, utan nätverk ("sans-IO"): Swift och JS gör HTTP-anropen och lämnar
//! serverns svar hit, kärnan säger vad som ska skickas. Kryptot är vodozemac (Olm för 1:1 och nyckeldelning,
//! Megolm för grupper, HPKE för länkning). Flödena och formaten beskrivs i `lib.rs`.
//!
//! Identitet och enheter (Matrix-modellen med korssignering, plan 4 avsnitt 2.5):
//! - Kontot har en identitetsnyckel AIK (Ed25519) som bara användarens enheter har (länkning, återställning).
//! - Varje enhet har ett eget vodozemac-`Account` (Curve25519 + Ed25519). AIK signerar enhetens nycklar
//!   (enhetscertifikat), enheten signerar sina engångsnycklar. Servern kan därför inte smyga in en enhet.
//! - Kontakternas AIK sparas första gången (TOFU). En annan AIK senare ger en varning, och för en verifierad
//!   kontakt stoppas sändningen tills användaren godkänner.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use vodozemac::hpke::{
    DigitMode, EstablishedHpkeChannel, HpkeRecipientChannel, HpkeSenderChannel, InitialMessage, InitialResponse,
    Message as HpkeMessage, UnidirectionalSenderChannel,
};
use vodozemac::megolm::{
    GroupSession, GroupSessionPickle, InboundGroupSession, InboundGroupSessionPickle, MegolmMessage,
    SessionConfig as MegolmConfig, SessionKey,
};
use vodozemac::olm::{Account, AccountPickle, OlmMessage, Session, SessionConfig, SessionPickle};
use vodozemac::{Curve25519PublicKey, Ed25519PublicKey, Ed25519SecretKey, Ed25519Signature};
use zeroize::Zeroizing;

use crate::fel::{Fel, R};
use crate::krypto::{self, b64, b64url, fran_b64, fran_b64url, hex, sha256};
use crate::sakerhetsnummer;

const VERSION: u32 = 1;
const ANTAL_OTK: usize = 50;
const FYLL_PA_UNDER: usize = 20;
const SEDDA_MAX: usize = 8_000;
const KANDA_SESSIONER_MAX: usize = 50;
const GRUPP_INDEX_MAX: usize = 2_000;
/// Servern sparar kuvert i högst 30 dagar; äldre meddelanden än så kan bara vara uppspelade.
const MAX_ALDER_MS: u64 = 30 * 86_400_000;
const SEDDA_ALDER_MS: u64 = 35 * 86_400_000;
const GRUPP_MAX_MEDDELANDEN: u32 = 500;
const GRUPP_MAX_ALDER_MS: u64 = 7 * 86_400_000;
const VANTA_PA_GRUPPNYCKEL_MS: u64 = 120_000;
const LANK_INFO: &str = "AdRaze e2e lank v1";
const AAD_TILLSTAND: &[u8] = b"adraze-e2e-tillstand-v1";
const AAD_VALV: &[u8] = b"adraze-e2e-valv-v1";

// ---------------------------------------------------------------------------------------------------------
// Tillståndet (sparas krypterat av plattformen med `spara`)
// ---------------------------------------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Default)]
struct Tillstand {
    v: u32,
    jag: Option<Jag>,
    /// Enhetens vodozemac-`Account` (AccountPickle som JSON).
    konto: Option<Value>,
    /// Kontakter och de egna andra enheterna, per uuid.
    kontakter: BTreeMap<String, Kontakt>,
    /// Olm-sessioner per motpartens enhetsnyckel (curve25519), senast använd först.
    sessioner: BTreeMap<String, Vec<Value>>,
    /// Egen utgående Megolm-session per grupp.
    ut_grupp: BTreeMap<String, UtGrupp>,
    /// Inkommande Megolm-sessioner per sessions-id.
    in_grupp: BTreeMap<String, InGrupp>,
    /// Gruppernas medlemmar som klienten själv har byggt upp ur inbjudningar och ändringar.
    grupper: BTreeMap<String, Grupp>,
    /// Mottagna meddelanden (hash av chiffret och av avsändare:id, med tid) mot uppspelning.
    sedda: VecDeque<(String, u64)>,
    /// Olm-sessions-id som har startats av varje motpartsenhet (curve25519): ett förnyckelmeddelande för en
    /// session vi redan haft men slängt är en uppspelning.
    #[serde(default)]
    kanda_sessioner: BTreeMap<String, VecDeque<String>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Jag {
    uuid: String,
    /// Kontots identitetsnyckel (Ed25519, hemlig del i base64).
    aik: String,
    /// Kontonyckel KK (för arkiv och kontodata senare), base64.
    kk: String,
    /// Återställningskoden (64 tecken).
    kod: String,
    enhet_id: Option<u32>,
    /// Enhetens egen hemlighet mot servern (bara sha256 ligger där), base64url.
    enhet_token: String,
    plattform: String,
    namn: String,
    registrerad: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Kontakt {
    /// Den betrodda identitetsnyckeln (AIK, publik, base64).
    identitet: String,
    verifierad: bool,
    /// En ny identitet som väntar på godkännande (bara om kontakten var verifierad).
    andrad: Option<String>,
    /// Tid (ms) då identiteten senast byttes; visas som varning tills användaren godkänner.
    andrad_ts: Option<u64>,
    andringar: u32,
    enheter: BTreeMap<u32, Enhet>,
    /// 0 = enhetslistan behöver hämtas.
    hamtad: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct Enhet {
    curve: String,
    ed: String,
}

#[derive(Serialize, Deserialize)]
struct UtGrupp {
    pickle: Value,
    sid: String,
    skapad: u64,
    antal: u32,
    /// Enhetsnycklar som har fått sessionsnyckeln.
    delad: BTreeSet<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct InGrupp {
    grupp: String,
    fran: String,
    fe: String,
    pickle: Value,
    /// Megolm-index som redan tagits emot (Megolm själv kan dekryptera samma index flera gånger).
    #[serde(default)]
    index: BTreeSet<u32>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Grupp {
    namn: String,
    medlemmar: BTreeSet<String>,
    version: u64,
    skapare: String,
    /// Vi är inte längre med (kickad eller har lämnat).
    #[serde(default)]
    utanfor: bool,
}

enum Lank {
    VisarQr(HpkeRecipientChannel),
    Skannat(UnidirectionalSenderChannel),
    Etablerad(EstablishedHpkeChannel),
}

pub struct Klient {
    lagringsnyckel: Zeroizing<Vec<u8>>,
    t: Tillstand,
    konto: Option<Account>,
    lank: Option<Lank>,
    sedda_mangd: BTreeSet<String>,
    forsok: BTreeMap<String, u8>,
}

// ---------------------------------------------------------------------------------------------------------
// Hjälpare för indata
// ---------------------------------------------------------------------------------------------------------

fn s<'a>(a: &'a Value, falt: &str) -> R<&'a str> {
    a.get(falt).and_then(Value::as_str).ok_or_else(|| Fel::new("format", format!("fältet {falt} saknas")))
}

fn tal(a: &Value, falt: &str) -> R<u64> {
    match a.get(falt) {
        Some(Value::Number(n)) => n.as_u64().ok_or_else(|| Fel::new("format", format!("{falt} är inte ett heltal"))),
        Some(Value::String(t)) => t.parse().map_err(|_| Fel::new("format", format!("{falt} är inte ett heltal"))),
        _ => Err(Fel::new("format", format!("fältet {falt} saknas"))),
    }
}

fn nu(a: &Value) -> u64 {
    tal(a, "nu").unwrap_or(0)
}

fn uuid(a: &Value, falt: &str) -> R<String> {
    let u = s(a, falt)?;
    if !krypto::ar_uuid(u) {
        return Err(Fel::new("format", format!("{falt} är inte en uuid")));
    }
    Ok(u.to_owned())
}

fn uuider(a: &Value, falt: &str) -> R<Vec<String>> {
    let l = a.get(falt).and_then(Value::as_array).ok_or_else(|| Fel::new("format", format!("{falt} saknas")))?;
    let mut ut: Vec<String> = Vec::new();
    for v in l {
        let u = v.as_str().filter(|u| krypto::ar_uuid(u)).ok_or_else(|| Fel::new("format", "ogiltig uuid i listan"))?;
        if !ut.iter().any(|x| x == u) {
            ut.push(u.to_owned());
        }
    }
    Ok(ut)
}

fn grupp_id(a: &Value, falt: &str) -> R<String> {
    let g = s(a, falt)?;
    if g.is_empty() || g.len() > 64 || !g.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') {
        return Err(Fel::new("format", "ogiltigt grupp-id"));
    }
    Ok(g.to_owned())
}

fn kuvert_id(k: &Value) -> String {
    match k.get("id") {
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn curve(s: &str) -> R<Curve25519PublicKey> {
    Curve25519PublicKey::from_base64(s).map_err(|_| Fel::new("format", "ogiltig curve25519-nyckel"))
}

fn ed(s: &str) -> R<Ed25519PublicKey> {
    Ed25519PublicKey::from_base64(s).map_err(|_| Fel::new("format", "ogiltig ed25519-nyckel"))
}

fn sig(s: &str) -> R<Ed25519Signature> {
    Ed25519Signature::from_base64(s).map_err(|_| Fel::new("format", "ogiltig signatur"))
}

fn cert_byte(uuid: &str, curve: &str, ed: &str) -> String {
    format!("AdRaze e2e enhet v1\n{uuid}\n{curve}\n{ed}")
}

fn otk_byte(slag: &str, id: &str, k: &str) -> String {
    format!("AdRaze e2e {slag} v1\n{id}\n{k}")
}

fn session_ut(v: &Value) -> R<Session> {
    let p: SessionPickle = serde_json::from_value(v.clone()).map_err(|_| Fel::new("tillstand", "trasig session"))?;
    Ok(Session::from_pickle(p))
}

fn session_in(s: &Session) -> Value {
    serde_json::to_value(s.pickle()).expect("session till json")
}

fn konv_text(konv: &Value) -> R<Value> {
    if let Some(u) = konv.get("dm").and_then(Value::as_str) {
        if krypto::ar_uuid(u) {
            return Ok(json!({ "dm": u }));
        }
    }
    if let Some(g) = konv.get("grupp").and_then(Value::as_str) {
        if !g.is_empty() && g.len() <= 64 {
            return Ok(json!({ "grupp": g }));
        }
    }
    Err(Fel::new("format", "konv ska vara {dm: uuid} eller {grupp: id}"))
}

/// De händelsetyper en klient får skicka. Interna typer (gruppnyckel) skapas bara av kärnan själv.
fn tillaten_typ(t: &str) -> bool {
    matches!(t, "msg" | "rx" | "del" | "edit" | "kvitto" | "grupp.inbjudan" | "grupp.andring" | "sync" | "samtal" | "profil")
}

// ---------------------------------------------------------------------------------------------------------
// Klienten
// ---------------------------------------------------------------------------------------------------------

impl Klient {
    /// `lagringsnyckel`: 32 byte från plattformens nyckelförråd (iPhone: Keychain, datorn: safeStorage).
    pub fn ny(lagringsnyckel: &[u8], tillstand: Option<&[u8]>) -> R<Self> {
        if lagringsnyckel.len() != 32 {
            return Err(Fel::new("nyckel", "lagringsnyckeln ska vara 32 byte"));
        }
        let t: Tillstand = match tillstand {
            Some(blob) if !blob.is_empty() => {
                let ren = Zeroizing::new(krypto::oppna(lagringsnyckel, AAD_TILLSTAND, blob)?);
                serde_json::from_slice(&ren).map_err(|_| Fel::new("tillstand", "tillståndet gick inte att läsa"))?
            }
            _ => Tillstand { v: VERSION, ..Default::default() },
        };
        let konto = match &t.konto {
            Some(p) => {
                let p: AccountPickle = serde_json::from_value(p.clone()).map_err(|_| Fel::new("tillstand", "trasigt konto"))?;
                Some(Account::from_pickle(p))
            }
            None => None,
        };
        let sedda_mangd = t.sedda.iter().map(|(n, _)| n.clone()).collect();
        Ok(Self { lagringsnyckel: Zeroizing::new(lagringsnyckel.to_vec()), t, konto, lank: None, sedda_mangd, forsok: BTreeMap::new() })
    }

    /// Tillståndet krypterat med lagringsnyckeln (AES-256-GCM). Plattformen skriver det atomiskt till disk.
    pub fn spara(&mut self) -> R<Vec<u8>> {
        if let Some(k) = &self.konto {
            self.t.konto = Some(serde_json::to_value(k.pickle()).expect("konto till json"));
        }
        let ren = Zeroizing::new(serde_json::to_vec(&self.t).expect("tillstånd till json"));
        krypto::forsegla(&self.lagringsnyckel, AAD_TILLSTAND, &ren)
    }

    fn jag(&self) -> R<&Jag> {
        self.t.jag.as_ref().ok_or_else(|| Fel::new("ingen_identitet", "enheten har ingen E2E-identitet än"))
    }

    fn aik(&self) -> R<Ed25519SecretKey> {
        let j = self.jag()?;
        let b = Zeroizing::new(fran_b64(&j.aik)?);
        let arr: [u8; 32] = b.as_slice().try_into().map_err(|_| Fel::new("tillstand", "fel längd på identitetsnyckeln"))?;
        Ok(Ed25519SecretKey::from_slice(&arr))
    }

    fn min_curve(&self) -> R<String> {
        Ok(self.konto.as_ref().ok_or_else(|| Fel::new("ingen_identitet", "ingen enhet"))?.curve25519_key().to_base64())
    }

    fn min_enhet(&self) -> Option<u32> {
        self.t.jag.as_ref().and_then(|j| j.enhet_id)
    }

    fn ar_sedd(&self, nyckel: &str) -> bool {
        self.sedda_mangd.contains(&sedd_nyckel(nyckel))
    }

    fn markera_sedd(&mut self, nyckel: &str, nu: u64) {
        let n = sedd_nyckel(nyckel);
        if self.sedda_mangd.insert(n.clone()) {
            self.t.sedda.push_back((n, nu));
        }
        while let Some((g, ts)) = self.t.sedda.front().cloned() {
            if self.t.sedda.len() > SEDDA_MAX || (nu > SEDDA_ALDER_MS && ts < nu - SEDDA_ALDER_MS) {
                self.t.sedda.pop_front();
                self.sedda_mangd.remove(&g);
            } else {
                break;
            }
        }
    }

    pub fn anropa(&mut self, op: &str, a: &Value) -> R<Value> {
        match op {
            "status" => self.op_status(),
            "identitet.skapa" => self.op_identitet_skapa(a),
            "identitet.registrerad" => self.op_identitet_registrerad(a),
            "identitet.borja_om" => self.op_borja_om(a),
            "enhet.auth" => self.op_enhet_auth(),
            "nycklar.fyll" => self.op_nycklar_fyll(a),
            "nycklar.publicerade" => self.op_nycklar_publicerade(),
            "aterstallningskod" => Ok(json!({ "kod": self.jag()?.kod })),
            "aterstall.oppna" => self.op_aterstall_oppna(a),
            "lank.visa" => self.op_lank_visa(),
            "lank.skanna" => self.op_lank_skanna(a),
            "lank.svara" => self.op_lank_svara(a),
            "lank.kontroll" => self.op_lank_kontroll(a),
            "lank.skicka_hemligt" => self.op_lank_skicka_hemligt(a),
            "lank.ta_emot_hemligt" => self.op_lank_ta_emot_hemligt(a),
            "lank.avbryt" => {
                self.lank = None;
                Ok(json!({}))
            }
            "kontakt.enheter" => self.op_kontakt_enheter(a),
            "kontakt.buntar" => self.op_kontakt_buntar(a),
            "kontakt.status" => self.op_kontakt_status(a),
            "kontakt.godkann" => self.op_kontakt_godkann(a),
            "sakerhetsnummer" => self.op_sakerhetsnummer(a),
            "verifiera" => self.op_verifiera(a),
            "skicka" => self.op_skicka(a),
            "avvisad" => self.op_avvisad(a),
            "ta_emot" => self.op_ta_emot(a),
            "grupp.ny" => self.op_grupp_ny(a),
            "grupp.andra" => self.op_grupp_andra(a),
            "grupp.lamna" => self.op_grupp_lamna(a),
            "grupp.info" => self.op_grupp_info(a),
            "grupp.skicka" => self.op_grupp_skicka(a),
            "grupp.delat" => self.op_grupp_delat(a),
            "lagring.forsegla" => {
                let etikett = s(a, "etikett")?;
                let data = fran_b64(s(a, "data")?)?;
                let aad = format!("adraze-e2e-lagring-v1:{etikett}");
                Ok(json!({ "data": b64(&krypto::forsegla(&self.lagringsnyckel, aad.as_bytes(), &data)?) }))
            }
            "lagring.oppna" => {
                let etikett = s(a, "etikett")?;
                let data = fran_b64(s(a, "data")?)?;
                let aad = format!("adraze-e2e-lagring-v1:{etikett}");
                Ok(json!({ "data": b64(&krypto::oppna(&self.lagringsnyckel, aad.as_bytes(), &data)?) }))
            }
            _ => Err(Fel::new("okand_op", format!("okänd operation {op}"))),
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // Identitet och enheter
    // -----------------------------------------------------------------------------------------------------

    fn op_status(&self) -> R<Value> {
        let mut o = json!({ "har_identitet": self.t.jag.is_some(), "har_enhet": self.konto.is_some() });
        if let Some(j) = &self.t.jag {
            o["uuid"] = json!(j.uuid);
            o["enhet_id"] = json!(j.enhet_id);
            o["registrerad"] = json!(j.registrerad);
            o["identitet"] = json!(self.aik()?.public_key().to_base64());
        }
        if let Some(k) = &self.konto {
            o["curve"] = json!(k.curve25519_key().to_base64());
            o["ed"] = json!(k.ed25519_key().to_base64());
        }
        Ok(o)
    }

    fn ny_jag(uuid: String, aik: &Ed25519SecretKey, kk: &[u8], kod: String, a: &Value) -> Jag {
        Jag {
            uuid,
            aik: b64(aik.to_bytes().as_slice()),
            kk: b64(kk),
            kod,
            enhet_id: None,
            enhet_token: b64url(&krypto::slump32()),
            plattform: a.get("plattform").and_then(Value::as_str).unwrap_or("").chars().take(20).collect(),
            namn: a.get("namn").and_then(Value::as_str).unwrap_or("").chars().take(60).collect(),
            registrerad: false,
        }
    }

    /// Den allra första enheten: ny identitet, återställningskod, valv och enhet.
    fn op_identitet_skapa(&mut self, a: &Value) -> R<Value> {
        if self.t.jag.is_some() {
            return Err(Fel::new("finns", "enheten har redan en identitet"));
        }
        let aik = Ed25519SecretKey::new();
        let kk = Zeroizing::new(krypto::slump32());
        let kod = krypto::ny_aterstallningskod();
        let uuid = krypto::ny_uuid();
        self.t.jag = Some(Self::ny_jag(uuid.clone(), &aik, kk.as_slice(), kod.clone(), a));
        self.konto = Some(Account::new());
        let (valv, token) = self.valv()?;
        let enhet = self.enhet_registrering()?;
        Ok(json!({
            "registrering": {
                "uuid": uuid,
                "identitet": aik.public_key().to_base64(),
                "valv": valv,
                "valv_token_hash": hex(&sha256(&token)),
                "enhet": enhet,
            },
            "kod": kod,
        }))
    }

    /// "Börja om": allt lokalt raderas och en ny identitet skapas (kontakterna får ett nytt säkerhetsnummer).
    fn op_borja_om(&mut self, a: &Value) -> R<Value> {
        self.t = Tillstand { v: VERSION, ..Default::default() };
        self.konto = None;
        self.lank = None;
        self.sedda_mangd.clear();
        self.forsok.clear();
        self.op_identitet_skapa(a)
    }

    /// Valvet: identitet, kontonyckel och uuid krypterade med en nyckel ur återställningskoden.
    fn valv(&self) -> R<(String, Vec<u8>)> {
        let j = self.jag()?;
        let (nyckel, token) = harled_kod(&j.kod)?;
        let innehall = Zeroizing::new(serde_json::to_vec(&json!({ "v": 1, "uuid": j.uuid, "aik": j.aik, "kk": j.kk })).expect("json"));
        Ok((b64(&krypto::forsegla(&nyckel, AAD_VALV, &innehall)?), token.to_vec()))
    }

    fn enhet_registrering(&mut self) -> R<Value> {
        let j = self.jag()?.clone();
        let aik = self.aik()?;
        let konto = self.konto.as_mut().ok_or_else(|| Fel::new("ingen_identitet", "ingen enhet"))?;
        if konto.one_time_keys().is_empty() {
            konto.generate_one_time_keys(ANTAL_OTK);
        }
        if konto.fallback_key().is_empty() {
            konto.generate_fallback_key();
        }
        let ik = konto.identity_keys();
        let (c, e) = (ik.curve25519.to_base64(), ik.ed25519.to_base64());
        let cert_sig = aik.sign(cert_byte(&j.uuid, &c, &e).as_bytes()).to_base64();
        let otk = signera_nycklar(konto, "otk", konto.one_time_keys());
        let reserv = signera_nycklar(konto, "reserv", konto.fallback_key()).into_iter().next();
        let token = fran_b64url(&j.enhet_token)?;
        Ok(json!({
            "cert": { "uuid": j.uuid, "curve": c, "ed": e },
            "cert_sig": cert_sig,
            "plattform": j.plattform,
            "namn": j.namn,
            "token_hash": hex(&sha256(&token)),
            "otk": otk,
            "reserv": reserv,
        }))
    }

    fn op_identitet_registrerad(&mut self, a: &Value) -> R<Value> {
        let id = tal(a, "enhet_id")?;
        if !(1..=127).contains(&id) {
            return Err(Fel::new("format", "enhets-id ska vara 1–127"));
        }
        let j = self.t.jag.as_mut().ok_or_else(|| Fel::new("ingen_identitet", "ingen identitet"))?;
        j.enhet_id = Some(id as u32);
        j.registrerad = true;
        if let Some(k) = self.konto.as_mut() {
            k.mark_keys_as_published();
        }
        Ok(json!({}))
    }

    fn op_enhet_auth(&self) -> R<Value> {
        let j = self.jag()?;
        let id = j.enhet_id.ok_or_else(|| Fel::new("ingen_enhet", "enheten är inte registrerad"))?;
        Ok(json!({ "enhet": id, "token": j.enhet_token, "huvud": format!("{id}:{}", j.enhet_token) }))
    }

    fn op_nycklar_fyll(&mut self, a: &Value) -> R<Value> {
        let pa_servern = tal(a, "pa_servern")? as usize;
        let reserv_saknas = a.get("reserv").and_then(Value::as_bool) == Some(false);
        let konto = self.konto.as_mut().ok_or_else(|| Fel::new("ingen_identitet", "ingen enhet"))?;
        let mut ut = json!({});
        if pa_servern < FYLL_PA_UNDER && konto.one_time_keys().is_empty() {
            konto.generate_one_time_keys(ANTAL_OTK.saturating_sub(pa_servern));
        }
        let otk = konto.one_time_keys();
        if !otk.is_empty() {
            ut["otk"] = json!(signera_nycklar(konto, "otk", otk));
        }
        if reserv_saknas && konto.fallback_key().is_empty() {
            konto.generate_fallback_key();
        }
        let r = konto.fallback_key();
        if !r.is_empty() {
            ut["reserv"] = json!(signera_nycklar(konto, "reserv", r).into_iter().next());
        }
        Ok(ut)
    }

    fn op_nycklar_publicerade(&mut self) -> R<Value> {
        if let Some(k) = self.konto.as_mut() {
            k.mark_keys_as_published();
        }
        Ok(json!({}))
    }

    // -----------------------------------------------------------------------------------------------------
    // Återställning med koden
    // -----------------------------------------------------------------------------------------------------

    fn op_aterstall_oppna(&mut self, a: &Value) -> R<Value> {
        if self.t.jag.is_some() {
            return Err(Fel::new("finns", "enheten har redan en identitet"));
        }
        let kod = krypto::normalisera_kod(s(a, "kod")?).ok_or_else(|| Fel::new("fel_kod", "återställningskoden har fel format"))?;
        let (nyckel, token) = harled_kod(&kod)?;
        let ren = Zeroizing::new(
            krypto::oppna(&nyckel, AAD_VALV, &fran_b64(s(a, "valv")?)?).map_err(|_| Fel::new("fel_kod", "koden öppnar inte valvet"))?,
        );
        let v: Value = serde_json::from_slice(&ren).map_err(|_| Fel::new("format", "trasigt valv"))?;
        let u = uuid(&v, "uuid")?;
        let aik_b = Zeroizing::new(fran_b64(s(&v, "aik")?)?);
        let arr: [u8; 32] = aik_b.as_slice().try_into().map_err(|_| Fel::new("format", "trasigt valv"))?;
        let aik = Ed25519SecretKey::from_slice(&arr);
        if let Some(vantad) = a.get("identitet").and_then(Value::as_str) {
            if vantad != aik.public_key().to_base64() {
                return Err(Fel::new("fel_kod", "valvets identitet stämmer inte med kontots"));
            }
        }
        let kk = Zeroizing::new(fran_b64(s(&v, "kk")?)?);
        self.t.jag = Some(Self::ny_jag(u.clone(), &aik, &kk, kod, a));
        self.konto = Some(Account::new());
        let enhet = self.enhet_registrering()?;
        Ok(json!({ "registrering": { "uuid": u, "enhet": enhet, "valv_token": b64url(&token) } }))
    }

    // -----------------------------------------------------------------------------------------------------
    // Länkning med QR-kod (vodozemac HPKE: X25519 + ChaCha20-Poly1305, kontrollkod på två siffror)
    // -----------------------------------------------------------------------------------------------------

    /// Den som visar QR-koden. Koden innehåller nyckeln (och plattformens relä-id).
    fn op_lank_visa(&mut self) -> R<Value> {
        let r = HpkeRecipientChannel::with_info(LANK_INFO);
        let nyckel = r.public_key().to_base64();
        self.lank = Some(Lank::VisarQr(r));
        Ok(json!({ "nyckel": nyckel }))
    }

    /// Den som skannar: första meddelandet till QR-kodens nyckel.
    fn op_lank_skanna(&mut self, a: &Value) -> R<Value> {
        let pk = curve(s(a, "nyckel")?)?;
        let aad = s(a, "lank_id")?.as_bytes().to_vec();
        let hej = a.get("hej").and_then(Value::as_str).unwrap_or("");
        let r = HpkeSenderChannel::with_info(LANK_INFO)
            .establish_channel(pk, hej.as_bytes(), &aad)
            .map_err(|_| Fel::new("lank", "kunde inte öppna länkningen"))?;
        self.lank = Some(Lank::Skannat(r.channel));
        Ok(json!({ "steg1": r.message.encode() }))
    }

    /// QR-visaren svarar och får kontrollkoden.
    fn op_lank_svara(&mut self, a: &Value) -> R<Value> {
        let aad = s(a, "lank_id")?.as_bytes().to_vec();
        let Some(Lank::VisarQr(r)) = self.lank.take() else { return Err(Fel::new("lank", "ingen QR-kod visas")) };
        let m = InitialMessage::decode(s(a, "steg1")?).map_err(|_| Fel::new("format", "trasigt länkmeddelande"))?;
        let skapad = r.establish_channel(&m, &aad).map_err(|_| Fel::new("manipulerat", "länkmeddelandet gick inte att öppna"))?;
        let hej = String::from_utf8_lossy(&skapad.message).into_owned();
        let svar = a.get("svar").and_then(Value::as_str).unwrap_or("");
        let b = skapad.channel.establish_bidirectional_channel(svar.as_bytes(), &aad);
        let kod = format!("{:02}", b.channel.check_code().to_digit(DigitMode::NoLeadingZero));
        self.lank = Some(Lank::Etablerad(b.channel));
        Ok(json!({ "steg2": b.message.encode(), "kod": kod, "hej": hej }))
    }

    /// Skannaren tar emot svaret och får samma kontrollkod.
    fn op_lank_kontroll(&mut self, a: &Value) -> R<Value> {
        let aad = s(a, "lank_id")?.as_bytes().to_vec();
        let Some(Lank::Skannat(c)) = self.lank.take() else { return Err(Fel::new("lank", "ingen skannad kod")) };
        let m = InitialResponse::decode(s(a, "steg2")?).map_err(|_| Fel::new("format", "trasigt länksvar"))?;
        let b = c.establish_bidirectional_channel(&m, &aad).map_err(|_| Fel::new("manipulerat", "länksvaret gick inte att öppna"))?;
        let kod = format!("{:02}", b.channel.check_code().to_digit(DigitMode::NoLeadingZero));
        let svar = String::from_utf8_lossy(&b.message).into_owned();
        self.lank = Some(Lank::Etablerad(b.channel));
        Ok(json!({ "kod": kod, "svar": svar }))
    }

    /// Den befintliga enheten (efter att användaren sett att kontrollkoderna stämmer) skickar identiteten.
    fn op_lank_skicka_hemligt(&mut self, a: &Value) -> R<Value> {
        let aad = s(a, "lank_id")?.as_bytes().to_vec();
        let lankkod = s(a, "lankkod")?;
        let j = self.jag()?.clone();
        let Some(Lank::Etablerad(c)) = self.lank.as_mut() else { return Err(Fel::new("lank", "länkningen är inte klar")) };
        let innehall = Zeroizing::new(
            serde_json::to_vec(&json!({ "v": 1, "uuid": j.uuid, "aik": j.aik, "kk": j.kk, "kod": j.kod, "lankkod": lankkod })).expect("json"),
        );
        let m = c.seal(&innehall, &aad);
        self.lank = None;
        Ok(json!({ "steg3": m.encode() }))
    }

    /// Den nya enheten tar emot identiteten och skapar sin egen enhet.
    fn op_lank_ta_emot_hemligt(&mut self, a: &Value) -> R<Value> {
        if self.t.jag.is_some() {
            return Err(Fel::new("finns", "enheten har redan en identitet"));
        }
        let aad = s(a, "lank_id")?.as_bytes().to_vec();
        let Some(Lank::Etablerad(c)) = self.lank.as_mut() else { return Err(Fel::new("lank", "länkningen är inte klar")) };
        let m = HpkeMessage::decode(s(a, "steg3")?).map_err(|_| Fel::new("format", "trasigt länkmeddelande"))?;
        let ren = Zeroizing::new(c.open(&m, &aad).map_err(|_| Fel::new("manipulerat", "länkmeddelandet gick inte att öppna"))?);
        self.lank = None;
        let v: Value = serde_json::from_slice(&ren).map_err(|_| Fel::new("format", "trasigt länkmeddelande"))?;
        let u = uuid(&v, "uuid")?;
        let aik_b = Zeroizing::new(fran_b64(s(&v, "aik")?)?);
        let arr: [u8; 32] = aik_b.as_slice().try_into().map_err(|_| Fel::new("format", "trasig identitet"))?;
        let aik = Ed25519SecretKey::from_slice(&arr);
        let kk = Zeroizing::new(fran_b64(s(&v, "kk")?)?);
        let kod = s(&v, "kod")?.to_owned();
        let lankkod = s(&v, "lankkod")?.to_owned();
        self.t.jag = Some(Self::ny_jag(u.clone(), &aik, &kk, kod, a));
        self.konto = Some(Account::new());
        let enhet = self.enhet_registrering()?;
        Ok(json!({ "registrering": { "uuid": u, "identitet": aik.public_key().to_base64(), "enhet": enhet, "lankkod": lankkod } }))
    }

    // -----------------------------------------------------------------------------------------------------
    // Kontakter, enhetslistor och sessioner
    // -----------------------------------------------------------------------------------------------------

    /// Serverns enhetslista (`GET /chatt/v2/enheter?uuid=`): kontrollerar identiteten (TOFU) och varje enhets
    /// certifikat. Enheter som inte är signerade av identiteten tas inte med.
    fn op_kontakt_enheter(&mut self, a: &Value) -> R<Value> {
        let u = uuid(a, "uuid")?;
        let svar = a.get("svar").ok_or_else(|| Fel::new("format", "svar saknas"))?;
        let ny_id = s(svar, "identitet")?.to_owned();
        let ts = nu(a);
        let jag = self.jag()?.clone();
        let min_id = self.aik()?.public_key().to_base64();
        let mut andrad = false;
        let mut blockerad = false;
        let betrodd: String;
        if u == jag.uuid {
            if ny_id != min_id {
                return Err(Fel::new("identitet_andrad", "servern visar en annan identitet för det egna kontot"));
            }
            betrodd = min_id;
        } else {
            let k = self.t.kontakter.entry(u.clone()).or_default();
            if k.identitet.is_empty() {
                k.identitet = ny_id.clone();
            } else if k.identitet != ny_id {
                andrad = true;
                if k.verifierad {
                    // Verifierad kontakt: vänta på godkännande, skicka inget till de nya enheterna.
                    if k.andrad.as_deref() != Some(ny_id.as_str()) {
                        k.andrad = Some(ny_id.clone());
                        k.andrad_ts = Some(ts);
                        k.andringar += 1;
                    }
                    blockerad = true;
                } else {
                    k.identitet = ny_id.clone();
                    k.andrad_ts = Some(ts);
                    k.andringar += 1;
                }
            } else if k.andrad.is_some() {
                blockerad = true;
            }
            betrodd = k.identitet.clone();
        }
        if blockerad {
            return Ok(json!({ "andrad": true, "blockerad": true, "enheter": 0 }));
        }
        let idk = ed(&betrodd)?;
        let mut enheter = BTreeMap::new();
        let mut ogiltiga = 0;
        for e in svar.get("enheter").and_then(Value::as_array).cloned().unwrap_or_default() {
            match verifiera_enhet(&u, &idk, &e) {
                Ok((id, enh)) => {
                    if u == jag.uuid && Some(id) == jag.enhet_id {
                        continue;
                    }
                    enheter.insert(id, enh);
                }
                Err(_) => ogiltiga += 1,
            }
        }
        let n = enheter.len();
        let k = self.t.kontakter.entry(u.clone()).or_default();
        if k.identitet.is_empty() {
            k.identitet = betrodd;
        }
        // Sessioner med enheter som försvunnit eller fått ny nyckel slutar användas.
        let gamla: Vec<String> = k.enheter.values().map(|e| e.curve.clone()).filter(|c| !enheter.values().any(|n| &n.curve == c)).collect();
        k.enheter = enheter;
        k.hamtad = ts.max(1);
        for c in gamla {
            self.t.sessioner.remove(&c);
        }
        Ok(json!({ "andrad": andrad, "blockerad": false, "enheter": n, "ogiltiga": ogiltiga }))
    }

    /// Nyckelbuntar (`GET /chatt/v2/nycklar?uuid=&enheter=`): kontrollerar signaturerna och startar sessioner.
    fn op_kontakt_buntar(&mut self, a: &Value) -> R<Value> {
        let u = uuid(a, "uuid")?;
        let svar = a.get("svar").ok_or_else(|| Fel::new("format", "svar saknas"))?;
        let jag = self.jag()?.clone();
        let betrodd = if u == jag.uuid {
            self.aik()?.public_key().to_base64()
        } else {
            let k = self.t.kontakter.get(&u).ok_or_else(|| Fel::new("okand_kontakt", "hämta enhetslistan först"))?;
            if k.andrad.is_some() {
                return Err(Fel::new("identitet_andrad", "kontaktens identitet har ändrats och väntar på godkännande"));
            }
            k.identitet.clone()
        };
        if s(svar, "identitet")? != betrodd {
            return Err(Fel::new("identitet_andrad", "buntens identitet är inte den betrodda"));
        }
        let idk = ed(&betrodd)?;
        let konto = self.konto.as_ref().ok_or_else(|| Fel::new("ingen_identitet", "ingen enhet"))?;
        let mut nya = 0;
        let mut ogiltiga = 0;
        for e in svar.get("enheter").and_then(Value::as_array).cloned().unwrap_or_default() {
            let Ok((id, enh)) = verifiera_enhet(&u, &idk, &e) else {
                ogiltiga += 1;
                continue;
            };
            let edk = ed(&enh.ed)?;
            let nyckel = ["otk", "reserv"].iter().find_map(|slag| {
                let n = e.get(*slag).filter(|v| v.is_object())?;
                let (kid, k, sg) = (n.get("id")?.as_str()?, n.get("k")?.as_str()?, n.get("sig")?.as_str()?);
                edk.verify(otk_byte(slag, kid, k).as_bytes(), &sig(sg).ok()?).ok()?;
                curve(k).ok()
            });
            let Some(otk) = nyckel else {
                ogiltiga += 1;
                continue;
            };
            let session = konto
                .create_outbound_session(SessionConfig::version_1(), curve(&enh.curve)?, otk)
                .map_err(|_| Fel::new("krypto", "kunde inte starta sessionen"))?;
            self.t.sessioner.entry(enh.curve.clone()).or_default().insert(0, session_in(&session));
            if let Some(k) = self.t.kontakter.get_mut(&u) {
                k.enheter.insert(id, enh);
            }
            nya += 1;
        }
        Ok(json!({ "sessioner": nya, "ogiltiga": ogiltiga }))
    }

    fn op_kontakt_status(&self, a: &Value) -> R<Value> {
        let u = uuid(a, "uuid")?;
        Ok(match self.t.kontakter.get(&u) {
            Some(k) => json!({
                "kand": !k.identitet.is_empty(), "verifierad": k.verifierad, "vantar_godkannande": k.andrad.is_some(),
                "andrad": k.andrad_ts.is_some(), "andrad_ts": k.andrad_ts, "andringar": k.andringar,
                "enheter": k.enheter.len(), "identitet": k.identitet, "hamtad": k.hamtad,
            }),
            None => json!({ "kand": false, "verifierad": false, "vantar_godkannande": false, "andrad": false, "enheter": 0 }),
        })
    }

    /// Användaren har sett varningen: den nya identiteten godtas (och en verifiering tas bort).
    fn op_kontakt_godkann(&mut self, a: &Value) -> R<Value> {
        let u = uuid(a, "uuid")?;
        let k = self.t.kontakter.get_mut(&u).ok_or_else(|| Fel::new("okand_kontakt", "okänd kontakt"))?;
        if let Some(ny) = k.andrad.take() {
            k.identitet = ny;
            k.verifierad = false;
            k.enheter.clear();
            k.hamtad = 0;
        }
        k.andrad_ts = None;
        Ok(json!({}))
    }

    fn identitet_byte(&self, u: &str) -> R<[u8; 32]> {
        let id = if u == self.jag()?.uuid {
            self.aik()?.public_key()
        } else {
            let k = self.t.kontakter.get(u).filter(|k| !k.identitet.is_empty()).ok_or_else(|| Fel::new("okand_kontakt", "okänd kontakt"))?;
            ed(&k.identitet)?
        };
        Ok(*id.as_bytes())
    }

    fn op_sakerhetsnummer(&self, a: &Value) -> R<Value> {
        let u = uuid(a, "uuid")?;
        let jag = &self.jag()?.uuid;
        let sn = sakerhetsnummer::berakna(jag, &self.identitet_byte(jag)?, &u, &self.identitet_byte(&u)?)?;
        let grupper: Vec<String> = sn.siffror.as_bytes().chunks(5).map(|c| String::from_utf8_lossy(c).into_owned()).collect();
        let verifierad = self.t.kontakter.get(&u).map(|k| k.verifierad).unwrap_or(false);
        Ok(json!({ "siffror": sn.siffror, "grupper": grupper, "qr": sn.qr, "verifierad": verifierad }))
    }

    /// En skannad säkerhetskod. Stämmer den markeras kontakten som verifierad. `markera:true` utan qr = användaren
    /// har jämfört siffrorna själv.
    fn op_verifiera(&mut self, a: &Value) -> R<Value> {
        let u = uuid(a, "uuid")?;
        let jag = self.jag()?.uuid.clone();
        let ok = match a.get("qr").and_then(Value::as_str) {
            Some(qr) => sakerhetsnummer::stammer(qr, &jag, &self.identitet_byte(&jag)?, &u, &self.identitet_byte(&u)?)?,
            None => a.get("markera").and_then(Value::as_bool) == Some(true),
        };
        let mut verifierad = false;
        if let Some(k) = self.t.kontakter.get_mut(&u) {
            if ok && k.andrad.is_none() {
                k.verifierad = true;
                k.andrad_ts = None;
            }
            if a.get("avmarkera").and_then(Value::as_bool) == Some(true) {
                k.verifierad = false;
            }
            verifierad = k.verifierad;
        }
        Ok(json!({ "stammer": ok, "verifierad": verifierad }))
    }

    // -----------------------------------------------------------------------------------------------------
    // Skicka 1:1 (och synk till egna enheter)
    // -----------------------------------------------------------------------------------------------------

    /// Det som saknas innan något kan krypteras till de här kontona (inklusive de egna andra enheterna).
    fn behover(&self, konton: &[String], sessioner_for: Option<&BTreeSet<String>>) -> R<Option<Value>> {
        let jag = self.jag()?;
        let mut enheter = Vec::new();
        let mut blockerad = Vec::new();
        let mut ingen = Vec::new();
        for u in konton {
            match self.t.kontakter.get(u) {
                None => enheter.push(u.clone()),
                Some(k) if k.hamtad == 0 => enheter.push(u.clone()),
                Some(k) if k.andrad.is_some() => blockerad.push(u.clone()),
                Some(k) if *u != jag.uuid && k.enheter.is_empty() => ingen.push(u.clone()),
                _ => {}
            }
        }
        if !enheter.is_empty() {
            return Ok(Some(json!({ "behover_enheter": enheter })));
        }
        if !blockerad.is_empty() {
            return Ok(Some(json!({ "blockerad": blockerad })));
        }
        if !ingen.is_empty() {
            return Ok(Some(json!({ "ingen_e2e": ingen })));
        }
        let mut buntar = Map::new();
        for u in konton {
            if sessioner_for.map(|m| !m.contains(u)).unwrap_or(false) {
                continue;
            }
            let k = &self.t.kontakter[u];
            let saknas: Vec<u32> = k
                .enheter
                .iter()
                .filter(|(_, e)| self.t.sessioner.get(&e.curve).map(|l| l.is_empty()).unwrap_or(true))
                .map(|(id, _)| *id)
                .collect();
            if !saknas.is_empty() {
                buntar.insert(u.clone(), json!(saknas));
            }
        }
        if !buntar.is_empty() {
            return Ok(Some(json!({ "behover_buntar": buntar })));
        }
        Ok(None)
    }

    /// Krypterar samma händelse till varje enhet hos kontona, med den senast använda sessionen.
    fn kryptera_olm(&mut self, konton: &[String], konv: &Value, typ: &str, d: &Value, id: &str, ts: u64) -> R<Vec<Value>> {
        let jag = self.jag()?.clone();
        let min = self.min_curve()?;
        let mut mottagare = Vec::new();
        for u in konton {
            let enheter: Vec<(u32, Enhet)> = self.t.kontakter.get(u).map(|k| k.enheter.iter().map(|(i, e)| (*i, e.clone())).collect()).unwrap_or_default();
            let mut ut = Vec::new();
            for (eid, e) in enheter {
                if *u == jag.uuid && Some(eid) == jag.enhet_id {
                    continue;
                }
                let inre = json!({ "v": 1, "fran": jag.uuid, "fe": min, "till": u, "tk": e.curve, "konv": konv, "id": id, "ts": ts, "typ": typ, "d": d });
                let ren = Zeroizing::new(krypto::fyll_ut(&serde_json::to_vec(&inre).expect("json")));
                let lista = self.t.sessioner.get_mut(&e.curve).ok_or_else(|| Fel::new("ingen_session", "session saknas"))?;
                let mut sess = session_ut(lista.first().ok_or_else(|| Fel::new("ingen_session", "session saknas"))?)?;
                let m = sess.encrypt(ren.as_slice()).map_err(|_| Fel::new("krypto", "kunde inte kryptera"))?;
                lista[0] = session_in(&sess);
                let (mt, byte) = m.to_parts();
                ut.push(json!({ "id": eid, "k": e.curve, "mt": mt, "c": b64(&byte) }));
            }
            mottagare.push(json!({ "uuid": u, "enheter": ut }));
        }
        Ok(mottagare)
    }

    fn op_skicka(&mut self, a: &Value) -> R<Value> {
        let jag = self.jag()?.uuid.clone();
        self.min_enhet().ok_or_else(|| Fel::new("ingen_enhet", "enheten är inte registrerad"))?;
        let mut till = uuider(a, "till")?;
        till.retain(|u| *u != jag);
        let konv = konv_text(a.get("konv").ok_or_else(|| Fel::new("format", "konv saknas"))?)?;
        let typ = s(a, "typ")?;
        if !tillaten_typ(typ) {
            return Err(Fel::new("format", format!("typen {typ} får inte skickas")));
        }
        let d = a.get("d").cloned().unwrap_or(json!({}));
        if till.is_empty() && typ != "sync" {
            return Err(Fel::new("format", "ingen mottagare"));
        }
        let mut konton = till.clone();
        konton.push(jag.clone());
        if let Some(b) = self.behover(&konton, None)? {
            return Ok(b);
        }
        let id = hex(&krypto::slump(16));
        let ts = nu(a);
        let mottagare = self.kryptera_olm(&konton, &konv, typ, &d, &id, ts)?;
        Ok(json!({ "begaran": { "mottagare": mottagare }, "id": id, "ts": ts }))
    }

    /// Servern svarade 409 (enheter saknas eller finns inte) eller 410 (enheten har bytt nyckel): enhetslistan
    /// hämtas om innan nästa försök, och sessioner med enheter som inte längre finns slutar användas.
    fn op_avvisad(&mut self, a: &Value) -> R<Value> {
        let svar = a.get("svar").ok_or_else(|| Fel::new("format", "svar saknas"))?;
        let u = uuid(svar, "uuid")?;
        let bort: Vec<u64> = ["extra", "inaktuella"]
            .iter()
            .flat_map(|f| svar.get(*f).and_then(Value::as_array).cloned().unwrap_or_default())
            .filter_map(|v| v.as_u64())
            .collect();
        if let Some(k) = self.t.kontakter.get_mut(&u) {
            for id in bort {
                if let Some(e) = k.enheter.remove(&(id as u32)) {
                    self.t.sessioner.remove(&e.curve);
                }
            }
            k.hamtad = 0;
        }
        Ok(json!({}))
    }

    // -----------------------------------------------------------------------------------------------------
    // Ta emot
    // -----------------------------------------------------------------------------------------------------

    fn op_ta_emot(&mut self, a: &Value) -> R<Value> {
        let ts = nu(a);
        let kuvert = a.get("kuvert").and_then(Value::as_array).cloned().unwrap_or_default();
        let mut handelser = Vec::new();
        let mut kvittera = Vec::new();
        let mut vanta = Vec::new();
        let mut behover = BTreeSet::new();
        for k in &kuvert {
            let kid = kuvert_id(k);
            let fran = k.get("fran").and_then(Value::as_str).unwrap_or("").to_owned();
            let res = match k.get("typ").and_then(Value::as_str) {
                Some("olm") => self.ta_emot_olm(k, &kid, ts),
                Some("grupp") => self.ta_emot_grupp(k, &kid, ts),
                _ => Err(Fel::new("format", "okänd kuverttyp")),
            };
            match res {
                Ok(Utfall::Klar(h)) => {
                    self.forsok.remove(&kid);
                    handelser.extend(h);
                    kvittera.push(json!(kid));
                }
                Ok(Utfall::BehoverEnheter(u)) => {
                    behover.insert(u);
                    vanta.push(json!(kid));
                }
                Ok(Utfall::Vanta) => vanta.push(json!(kid)),
                Err(f) => {
                    self.forsok.remove(&kid);
                    handelser.push(json!({ "typ": "avvisat", "kuvert": kid, "fel": f.kod, "text": f.text, "fran": fran }));
                    kvittera.push(json!(kid));
                }
            }
        }
        Ok(json!({ "handelser": handelser, "kvittera": kvittera, "vanta": vanta, "behover_enheter": behover }))
    }

    /// Avsändarens enhet ska finnas i den kontrollerade listan. Annars hämtas listan (högst två gånger).
    fn avsandarenhet(&mut self, fran: &str, fe: u32, kid: &str) -> R<Result<Enhet, Utfall>> {
        if let Some(e) = self.t.kontakter.get(fran).and_then(|k| k.enheter.get(&fe)) {
            return Ok(Ok(e.clone()));
        }
        let n = self.forsok.entry(kid.to_owned()).or_insert(0);
        *n += 1;
        if *n > 2 {
            return Err(Fel::new("okand_enhet", "avsändarens enhet är inte signerad av avsändarens identitet"));
        }
        if let Some(k) = self.t.kontakter.get_mut(fran) {
            k.hamtad = 0;
        }
        Ok(Err(Utfall::BehoverEnheter(fran.to_owned())))
    }

    fn ta_emot_olm(&mut self, k: &Value, kid: &str, nu: u64) -> R<Utfall> {
        let jag = self.jag()?.clone();
        let fran = uuid(k, "fran")?;
        let fe = tal(k, "fe")? as u32;
        let byte = fran_b64(s(k, "c")?)?;
        let chiffer_nyckel = format!("c:{}", hex(&sha256(&byte)));
        if self.ar_sedd(&chiffer_nyckel) {
            return Err(Fel::new("uppspelat", "kuvertet har redan tagits emot"));
        }
        let enhet = match self.avsandarenhet(&fran, fe, kid)? {
            Ok(e) => e,
            Err(u) => return Ok(u),
        };
        let deras = curve(&enhet.curve)?;
        let m = OlmMessage::from_parts(tal(k, "mt")? as usize, &byte).map_err(|_| Fel::new("manipulerat", "trasigt Olm-meddelande"))?;
        let lista = self.t.sessioner.get(&enhet.curve).cloned().unwrap_or_default();
        // (klartext, ny session att lägga först, index för en befintlig som ändrats)
        let (ren, ny, index) = match &m {
            OlmMessage::PreKey(p) => {
                if p.identity_key() != deras {
                    return Err(Fel::new("okand_enhet", "förnyckelmeddelandet kommer från en annan enhetsnyckel"));
                }
                let sid = p.session_id();
                let mut hittad = None;
                for (i, v) in lista.iter().enumerate() {
                    let mut sess = session_ut(v)?;
                    if sess.session_id() == sid {
                        let ren = sess.decrypt(&m).map_err(|_| Fel::new("manipulerat", "meddelandet gick inte att dekryptera"))?;
                        hittad = Some((ren, Some(sess), Some(i)));
                        break;
                    }
                }
                match hittad {
                    Some(h) => h,
                    None if self.t.kanda_sessioner.get(&enhet.curve).map(|l| l.contains(&sid)).unwrap_or(false) => {
                        return Err(Fel::new("uppspelat", "förnyckelmeddelandet hör till en session som redan använts"));
                    }
                    None => {
                        let konto = self.konto.as_mut().ok_or_else(|| Fel::new("ingen_identitet", "ingen enhet"))?;
                        let r = konto
                            .create_inbound_session(SessionConfig::version_1(), deras, p)
                            .map_err(|e| Fel::new("manipulerat", format!("ny session gick inte att skapa: {e}")))?;
                        (r.plaintext, Some(r.session), None)
                    }
                }
            }
            OlmMessage::Normal(_) => {
                let mut hittad = None;
                for (i, v) in lista.iter().enumerate() {
                    let mut sess = session_ut(v)?;
                    if let Ok(ren) = sess.decrypt(&m) {
                        hittad = Some((ren, Some(sess), Some(i)));
                        break;
                    }
                }
                hittad.ok_or_else(|| Fel::new("manipulerat", "meddelandet gick inte att dekryptera med någon session"))?
            }
        };
        let ren = Zeroizing::new(ren);
        let inre: Value = serde_json::from_slice(krypto::ta_bort_utfyllnad(&ren)?).map_err(|_| Fel::new("format", "trasigt innehåll"))?;
        // Bindningen: avsändare, avsändarenhet, mottagare och mottagarenhet måste stämma med kuvertet och sessionen.
        let min = self.min_curve()?;
        if tal(&inre, "v")? != 1
            || s(&inre, "fran")? != fran
            || s(&inre, "fe")? != enhet.curve
            || s(&inre, "till")? != jag.uuid
            || s(&inre, "tk")? != min
        {
            return Err(Fel::new("fel_mottagare", "meddelandet var inte till den här enheten"));
        }
        let mid = s(&inre, "id")?.to_owned();
        let sedd = format!("{fran}:{mid}");
        if self.ar_sedd(&sedd) {
            return Err(Fel::new("uppspelat", "meddelandet har redan tagits emot"));
        }
        kontrollera_alder(&inre, nu)?;
        // Godkänt: spara sessionen (först i listan, så att svaret går med den) och markera meddelandet som sett.
        let sess = ny.ok_or_else(|| Fel::new("krypto", "ingen session"))?;
        if index.is_none() {
            let kanda = self.t.kanda_sessioner.entry(enhet.curve.clone()).or_default();
            kanda.push_back(sess.session_id());
            while kanda.len() > KANDA_SESSIONER_MAX {
                kanda.pop_front();
            }
        }
        let lista = self.t.sessioner.entry(enhet.curve.clone()).or_default();
        if let Some(i) = index {
            lista.remove(i);
        }
        lista.insert(0, session_in(&sess));
        lista.truncate(5);
        self.markera_sedd(&sedd, nu);
        self.markera_sedd(&chiffer_nyckel, nu);
        let mut h = self.olm_handelse(&inre, &fran, fe, &enhet)?;
        for x in h.iter_mut() {
            x["kuvert"] = json!(kid);
        }
        Ok(Utfall::Klar(h))
    }

    fn olm_handelse(&mut self, inre: &Value, fran: &str, fe: u32, enhet: &Enhet) -> R<Vec<Value>> {
        let jag = self.jag()?.uuid.clone();
        let typ = s(inre, "typ")?;
        let d = inre.get("d").cloned().unwrap_or(json!({}));
        let konv = konv_text(inre.get("konv").ok_or_else(|| Fel::new("format", "konv saknas"))?)?;
        let mut ut = Vec::new();
        match typ {
            "gruppnyckel" => {
                let gid = grupp_id(&d, "grupp")?;
                let nyckel = SessionKey::from_base64(s(&d, "nyckel")?).map_err(|_| Fel::new("format", "trasig gruppnyckel"))?;
                let igs = InboundGroupSession::new(&nyckel, MegolmConfig::version_1());
                let sid = igs.session_id();
                if s(&d, "sid")? != sid {
                    return Err(Fel::new("format", "gruppnyckelns id stämmer inte"));
                }
                // En sessionsnyckel hör alltid till den enhet som delade den; ersätts aldrig av någon annan.
                if !self.t.in_grupp.contains_key(&sid) {
                    self.t.in_grupp.insert(
                        sid.clone(),
                        InGrupp {
                            grupp: gid.clone(),
                            fran: fran.to_owned(),
                            fe: enhet.curve.clone(),
                            pickle: serde_json::to_value(igs.pickle()).expect("json"),
                            index: BTreeSet::new(),
                        },
                    );
                }
                ut.push(json!({ "typ": "gruppnyckel", "grupp": gid, "fran": fran, "fran_enhet": fe, "intern": true }));
            }
            "grupp.inbjudan" | "grupp.andring" => {
                let gid = grupp_id(&d, "grupp")?;
                let medlemmar: BTreeSet<String> = uuider(&d, "medlemmar")?.into_iter().collect();
                let version = tal(&d, "version").unwrap_or(1);
                let namn = d.get("namn").and_then(Value::as_str).map(|n| n.chars().take(100).collect::<String>());
                let finns = self.t.grupper.get(&gid).cloned();
                let godkand = match &finns {
                    // Ny grupp för oss: bara en inbjudan från en medlem som tar med oss.
                    None => medlemmar.contains(&jag) && medlemmar.contains(fran),
                    // Känd grupp: ändringen ska komma från en nuvarande medlem och vara nyare.
                    Some(g) => g.medlemmar.contains(fran) && version > g.version,
                };
                if godkand {
                    let borttagna: Vec<String> = finns.as_ref().map(|g| g.medlemmar.difference(&medlemmar).cloned().collect()).unwrap_or_default();
                    let utanfor = !medlemmar.contains(&jag);
                    let g = Grupp {
                        namn: namn.or_else(|| finns.as_ref().map(|g| g.namn.clone())).unwrap_or_default(),
                        medlemmar,
                        version,
                        skapare: finns.as_ref().map(|g| g.skapare.clone()).unwrap_or_else(|| fran.to_owned()),
                        utanfor,
                    };
                    if !borttagna.is_empty() || utanfor {
                        // Någon har lämnat: ny utgående session, så att den som lämnat inte kan läsa nya meddelanden.
                        self.t.ut_grupp.remove(&gid);
                    }
                    self.t.grupper.insert(gid.clone(), g);
                    ut.push(json!({ "typ": typ, "konv": { "grupp": gid }, "fran": fran, "fran_enhet": fe, "id": inre["id"], "ts": inre["ts"], "d": d, "borttagna": borttagna }));
                } else {
                    ut.push(json!({ "typ": "avvisat", "fel": "obehorig", "text": "gruppändringen kom inte från en medlem", "fran": fran }));
                }
            }
            _ => {
                // 1:1: från en kontakt till oss, eller en synkkopia från en egen enhet (då gäller konv.dm).
                let lokal = match konv.get("dm").and_then(Value::as_str) {
                    Some(dm) if fran == jag => json!({ "dm": dm }),
                    Some(dm) if dm == jag => json!({ "dm": fran }),
                    Some(_) => return Err(Fel::new("fel_mottagare", "konversationen stämmer inte")),
                    None => {
                        // En gruppkonversation via 1:1-sessionen godtas bara från en medlem enligt vår bild.
                        let gid = konv.get("grupp").and_then(Value::as_str).unwrap_or("");
                        let medlem = self.t.grupper.get(gid).map(|g| g.medlemmar.contains(fran)).unwrap_or(false);
                        if !medlem {
                            return Err(Fel::new("obehorig", "avsändaren är inte medlem i gruppen enligt vår bild"));
                        }
                        konv.clone()
                    }
                };
                ut.push(json!({ "typ": typ, "konv": lokal, "fran": fran, "fran_enhet": fe, "id": inre["id"], "ts": inre["ts"], "d": d, "kanal": "olm" }));
            }
        }
        Ok(ut)
    }

    fn ta_emot_grupp(&mut self, k: &Value, kid: &str, nu: u64) -> R<Utfall> {
        let jag = self.jag()?.uuid.clone();
        let fran = uuid(k, "fran")?;
        let fe = tal(k, "fe")? as u32;
        let gid = grupp_id(k, "grupp")?;
        let sid = s(k, "sid")?.to_owned();
        let enhet = match self.avsandarenhet(&fran, fe, kid)? {
            Ok(e) => e,
            Err(u) => return Ok(u),
        };
        let Some(ing) = self.t.in_grupp.get(&sid).cloned() else {
            // Nyckeln kommer i ett 1:1-kuvert som borde ha kommit före; vänta en stund innan vi ger upp.
            let skickat = tal(k, "ts").unwrap_or(nu);
            if nu.saturating_sub(skickat) < VANTA_PA_GRUPPNYCKEL_MS {
                return Ok(Utfall::Vanta);
            }
            return Err(Fel::new("okand_session", "gruppnyckeln har inte kommit"));
        };
        if ing.grupp != gid || ing.fran != fran || ing.fe != enhet.curve {
            return Err(Fel::new("fel_mottagare", "gruppsessionen hör till en annan grupp eller avsändare"));
        }
        let m = MegolmMessage::from_base64(s(k, "c")?).map_err(|_| Fel::new("manipulerat", "trasigt gruppmeddelande"))?;
        let p: InboundGroupSessionPickle = serde_json::from_value(ing.pickle.clone()).map_err(|_| Fel::new("tillstand", "trasig gruppsession"))?;
        let mut igs = InboundGroupSession::from_pickle(p);
        let dek = igs.decrypt(&m).map_err(|_| Fel::new("manipulerat", "gruppmeddelandet gick inte att dekryptera"))?;
        let ren = Zeroizing::new(dek.plaintext);
        let inre: Value = serde_json::from_slice(krypto::ta_bort_utfyllnad(&ren)?).map_err(|_| Fel::new("format", "trasigt innehåll"))?;
        if tal(&inre, "v")? != 1 || s(&inre, "fran")? != fran || s(&inre, "grupp")? != gid {
            return Err(Fel::new("fel_mottagare", "gruppmeddelandet stämmer inte med kuvertet"));
        }
        let mid = s(&inre, "id")?.to_owned();
        let sedd = format!("{fran}:{mid}");
        if ing.index.contains(&dek.message_index) || self.ar_sedd(&sedd) {
            return Err(Fel::new("uppspelat", "gruppmeddelandet har redan tagits emot"));
        }
        if ing.index.len() >= GRUPP_INDEX_MAX {
            return Err(Fel::new("for_manga", "gruppsessionen har använts för många gånger"));
        }
        kontrollera_alder(&inre, nu)?;
        let medlem = self.t.grupper.get(&gid).map(|g| g.medlemmar.contains(&fran) && g.medlemmar.contains(&jag)).unwrap_or(false);
        if !medlem {
            return Err(Fel::new("obehorig", "avsändaren är inte medlem i gruppen enligt vår bild"));
        }
        if let Some(i) = self.t.in_grupp.get_mut(&sid) {
            i.pickle = serde_json::to_value(igs.pickle()).expect("json");
            i.index.insert(dek.message_index);
        }
        self.markera_sedd(&sedd, nu);
        let typ = s(&inre, "typ")?;
        Ok(Utfall::Klar(vec![json!({
            "typ": typ, "konv": { "grupp": gid }, "fran": fran, "fran_enhet": fe, "id": mid, "ts": inre["ts"],
            "d": inre.get("d").cloned().unwrap_or(json!({})), "kanal": "grupp", "kuvert": kid,
        })]))
    }

    // -----------------------------------------------------------------------------------------------------
    // Grupper (Megolm: en avsändarnyckel per grupp och avsändarenhet, delad via 1:1-sessionerna)
    // -----------------------------------------------------------------------------------------------------

    fn op_grupp_ny(&mut self, a: &Value) -> R<Value> {
        let jag = self.jag()?.uuid.clone();
        let gid = grupp_id(a, "grupp")?;
        let mut medlemmar: BTreeSet<String> = uuider(a, "medlemmar")?.into_iter().collect();
        medlemmar.insert(jag.clone());
        let namn: String = a.get("namn").and_then(Value::as_str).unwrap_or("").chars().take(100).collect();
        self.t.grupper.insert(gid.clone(), Grupp { namn: namn.clone(), medlemmar: medlemmar.clone(), version: 1, skapare: jag, utanfor: false });
        let lista: Vec<&String> = medlemmar.iter().collect();
        Ok(json!({ "inbjudan": { "grupp": gid, "namn": namn, "medlemmar": lista, "version": 1 } }))
    }

    /// Ny medlemslista (lägga till, kicka, lämna). Tas någon bort byts den egna avsändarnyckeln.
    fn op_grupp_andra(&mut self, a: &Value) -> R<Value> {
        let gid = grupp_id(a, "grupp")?;
        let jag = self.jag()?.uuid.clone();
        let medlemmar: BTreeSet<String> = uuider(a, "medlemmar")?.into_iter().collect();
        let g = self.t.grupper.get_mut(&gid).ok_or_else(|| Fel::new("okand_grupp", "okänd grupp"))?;
        let borttagna: Vec<String> = g.medlemmar.difference(&medlemmar).cloned().collect();
        let mottagare: BTreeSet<String> = g.medlemmar.union(&medlemmar).cloned().collect();
        g.medlemmar = medlemmar.clone();
        g.version += 1;
        if let Some(n) = a.get("namn").and_then(Value::as_str) {
            g.namn = n.chars().take(100).collect();
        }
        g.utanfor = !medlemmar.contains(&jag);
        let (version, namn) = (g.version, g.namn.clone());
        if !borttagna.is_empty() || !medlemmar.contains(&jag) {
            self.t.ut_grupp.remove(&gid);
        }
        let till: Vec<&String> = mottagare.iter().filter(|u| **u != jag).collect();
        let lista: Vec<&String> = medlemmar.iter().collect();
        Ok(json!({ "andring": { "grupp": gid, "namn": namn, "medlemmar": lista, "version": version }, "till": till, "borttagna": borttagna }))
    }

    fn op_grupp_lamna(&mut self, a: &Value) -> R<Value> {
        let gid = grupp_id(a, "grupp")?;
        self.t.grupper.remove(&gid);
        self.t.ut_grupp.remove(&gid);
        self.t.in_grupp.retain(|_, i| i.grupp != gid);
        Ok(json!({}))
    }

    fn op_grupp_info(&self, a: &Value) -> R<Value> {
        let gid = grupp_id(a, "grupp")?;
        let g = self.t.grupper.get(&gid).ok_or_else(|| Fel::new("okand_grupp", "okänd grupp"))?;
        Ok(json!({ "namn": g.namn, "medlemmar": g.medlemmar, "version": g.version, "skapare": g.skapare, "utanfor": g.utanfor,
                   "sid": self.t.ut_grupp.get(&gid).map(|u| u.sid.clone()) }))
    }

    fn op_grupp_skicka(&mut self, a: &Value) -> R<Value> {
        let jag = self.jag()?.clone();
        let min_id = self.min_enhet().ok_or_else(|| Fel::new("ingen_enhet", "enheten är inte registrerad"))?;
        let gid = grupp_id(a, "grupp")?;
        let typ = s(a, "typ")?;
        if !tillaten_typ(typ) {
            return Err(Fel::new("format", format!("typen {typ} får inte skickas")));
        }
        let d = a.get("d").cloned().unwrap_or(json!({}));
        let ts = nu(a);
        let g = self.t.grupper.get(&gid).cloned().ok_or_else(|| Fel::new("okand_grupp", "okänd grupp"))?;
        if g.utanfor || !g.medlemmar.contains(&jag.uuid) {
            return Err(Fel::new("inte_medlem", "du är inte med i gruppen"));
        }
        let konton: Vec<String> = g.medlemmar.iter().cloned().collect();
        // Medlemmar som servern har men inte vår bild: får ingen nyckel ("spökmedlemmar").
        let spok: Vec<String> = a
            .get("server_medlemmar")
            .and_then(Value::as_array)
            .map(|l| l.iter().filter_map(Value::as_str).filter(|u| !g.medlemmar.contains(*u)).map(str::to_owned).collect())
            .unwrap_or_default();
        if let Some(b) = self.behover(&konton, Some(&BTreeSet::new()))? {
            if b.get("behover_buntar").is_none() {
                return Ok(b);
            }
        }
        // Utgående session: ny om den saknas, är gammal eller har skickat många meddelanden.
        let byt = match self.t.ut_grupp.get(&gid) {
            None => true,
            Some(u) => u.antal >= GRUPP_MAX_MEDDELANDEN || ts.saturating_sub(u.skapad) > GRUPP_MAX_ALDER_MS,
        };
        if byt {
            let gs = GroupSession::new(MegolmConfig::version_1());
            self.t.ut_grupp.insert(
                gid.clone(),
                UtGrupp { sid: gs.session_id(), pickle: serde_json::to_value(gs.pickle()).expect("json"), skapad: ts, antal: 0, delad: BTreeSet::new() },
            );
        }
        // Alla mottagarenheter: medlemmarnas och de egna andra.
        let mut enheter = Vec::new();
        for u in &konton {
            for (id, e) in &self.t.kontakter.get(u).map(|k| k.enheter.clone()).unwrap_or_default() {
                if *u == jag.uuid && *id == min_id {
                    continue;
                }
                enheter.push((u.clone(), *id, e.curve.clone()));
            }
        }
        let ut = &self.t.ut_grupp[&gid];
        let behover_dela: Vec<String> = konton
            .iter()
            .filter(|u| enheter.iter().any(|(eu, _, c)| eu == *u && !ut.delad.contains(c)))
            .cloned()
            .collect();
        if !behover_dela.is_empty() {
            if let Some(b) = self.behover(&behover_dela, None)? {
                return Ok(b);
            }
            let ut = &self.t.ut_grupp[&gid];
            let gs = GroupSession::from_pickle(serde_json::from_value::<GroupSessionPickle>(ut.pickle.clone()).map_err(|_| Fel::new("tillstand", "trasig gruppsession"))?);
            let nyckel = Zeroizing::new(gs.session_key().to_base64());
            let sid = ut.sid.clone();
            let mid = hex(&krypto::slump(16));
            let d = json!({ "grupp": gid, "sid": sid, "nyckel": nyckel.as_str() });
            let mottagare = self.kryptera_olm(&behover_dela, &json!({ "grupp": gid }), "gruppnyckel", &d, &mid, ts)?;
            let dela: Vec<String> = mottagare
                .iter()
                .flat_map(|m| m["enheter"].as_array().cloned().unwrap_or_default())
                .filter_map(|e| e["k"].as_str().map(str::to_owned))
                .collect();
            return Ok(json!({ "begaran_dela": { "mottagare": mottagare }, "dela": dela, "grupp": gid }));
        }
        let ut = self.t.ut_grupp.get_mut(&gid).expect("finns");
        let mut gs = GroupSession::from_pickle(serde_json::from_value::<GroupSessionPickle>(ut.pickle.clone()).map_err(|_| Fel::new("tillstand", "trasig gruppsession"))?);
        let mid = hex(&krypto::slump(16));
        let inre = json!({ "v": 1, "fran": jag.uuid, "grupp": gid, "id": mid, "ts": ts, "typ": typ, "d": d });
        let ren = Zeroizing::new(krypto::fyll_ut(&serde_json::to_vec(&inre).expect("json")));
        let m = gs.encrypt(ren.as_slice());
        ut.pickle = serde_json::to_value(gs.pickle()).expect("json");
        ut.antal += 1;
        let sid = ut.sid.clone();
        let lista: Vec<Value> = enheter.iter().map(|(u, id, c)| json!({ "uuid": u, "id": id, "k": c })).collect();
        Ok(json!({ "begaran": { "grupp": gid, "sid": sid, "c": m.to_base64(), "enheter": lista, "utesluter": spok }, "id": mid, "ts": ts, "spok": spok }))
    }

    fn op_grupp_delat(&mut self, a: &Value) -> R<Value> {
        let gid = grupp_id(a, "grupp")?;
        let dela: Vec<String> = a.get("dela").and_then(Value::as_array).map(|l| l.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect()).unwrap_or_default();
        if let Some(u) = self.t.ut_grupp.get_mut(&gid) {
            u.delad.extend(dela);
        }
        Ok(json!({}))
    }
}

fn sedd_nyckel(s: &str) -> String {
    hex(&sha256(s.as_bytes())[..12])
}

fn kontrollera_alder(inre: &Value, nu: u64) -> R<()> {
    let ts = tal(inre, "ts").unwrap_or(0);
    if nu > MAX_ALDER_MS && ts < nu - MAX_ALDER_MS {
        return Err(Fel::new("for_gammalt", "meddelandet är äldre än 30 dagar"));
    }
    Ok(())
}

enum Utfall {
    Klar(Vec<Value>),
    BehoverEnheter(String),
    Vanta,
}

fn signera_nycklar(konto: &Account, slag: &str, nycklar: std::collections::HashMap<vodozemac::KeyId, Curve25519PublicKey>) -> Vec<Value> {
    let mut l: Vec<(String, String)> = nycklar.into_iter().map(|(id, k)| (id.to_base64(), k.to_base64())).collect();
    l.sort();
    l.into_iter()
        .map(|(id, k)| {
            let sg = konto.sign(otk_byte(slag, &id, &k).as_bytes()).to_base64();
            json!({ "id": id, "k": k, "sig": sg })
        })
        .collect()
}

fn verifiera_enhet(uuid: &str, identitet: &Ed25519PublicKey, e: &Value) -> R<(u32, Enhet)> {
    let id = tal(e, "id")?;
    if !(1..=127).contains(&id) {
        return Err(Fel::new("format", "enhets-id utanför 1–127"));
    }
    let cert = e.get("cert").ok_or_else(|| Fel::new("format", "certifikat saknas"))?;
    let (cu, c, edk) = (s(cert, "uuid")?, s(cert, "curve")?, s(cert, "ed")?);
    if cu != uuid {
        return Err(Fel::new("okand_enhet", "certifikatet gäller ett annat konto"));
    }
    curve(c)?;
    ed(edk)?;
    identitet
        .verify(cert_byte(uuid, c, edk).as_bytes(), &sig(s(e, "cert_sig")?)?)
        .map_err(|_| Fel::new("okand_enhet", "enheten är inte signerad av kontots identitet"))?;
    Ok((id as u32, Enhet { curve: c.to_owned(), ed: edk.to_owned() }))
}

/// Valvnyckel och valv-token ur återställningskoden (HKDF-SHA256 med egna etiketter).
pub fn harled_kod(kod: &str) -> R<(Zeroizing<Vec<u8>>, Zeroizing<Vec<u8>>)> {
    let k = krypto::normalisera_kod(kod).ok_or_else(|| Fel::new("fel_kod", "återställningskoden har fel format"))?;
    let salt = b"AdRaze e2e v2 aterstallning";
    Ok((Zeroizing::new(krypto::hkdf(k.as_bytes(), salt, b"valvnyckel", 32)), Zeroizing::new(krypto::hkdf(k.as_bytes(), salt, b"valvtoken", 32))))
}

/// Bilagor: en egen slumpad nyckel per fil (AES-256-GCM) och SHA-256 av chiffret, som kontrolleras före öppning.
pub fn bilaga_kryptera(data: &[u8]) -> R<Value> {
    let nyckel = Zeroizing::new(krypto::slump32());
    let chiffer = krypto::forsegla(nyckel.as_slice(), b"adraze-e2e-bilaga-v1", data)?;
    Ok(json!({ "nyckel": b64(nyckel.as_slice()), "digest": b64(&sha256(&chiffer)), "chiffer": b64(&chiffer), "storlek": data.len() }))
}

pub fn bilaga_dekryptera(nyckel: &str, digest: &str, chiffer: &[u8]) -> R<Value> {
    let n = Zeroizing::new(fran_b64(nyckel)?);
    if !krypto::lika(&sha256(chiffer), &fran_b64(digest)?) {
        return Err(Fel::new("manipulerat", "bilagan har ändrats"));
    }
    Ok(json!({ "data": b64(&krypto::oppna(&n, b"adraze-e2e-bilaga-v1", chiffer)?) }))
}
