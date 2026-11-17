//! AdRazes E2E-kärna. Ett smalt lager runt vodozemac (Apache-2.0, granskad av Least Authority 2022), samma
//! kod på iPhone (statiskt bibliotek med C-gränssnitt) och datorn (wasm i Node/Electron).
//!
//! Hela gränssnittet är en funktion: JSON in, JSON ut.
//!
//! ```text
//! {"op":"oppna","lagringsnyckel":"<32 byte base64>","tillstand":"<base64>"?}  → {"ok":true,"h":1}
//! {"op":"spara","h":1}                                                       → {"ok":true,"tillstand":"<base64>"}
//! {"op":"stang","h":1}
//! {"op":"<klientoperation>","h":1, …}                                        → {"ok":true, …} | {"ok":false,"fel":kod,"text":…}
//! {"op":"bilaga.kryptera","data":b64} / {"op":"bilaga.dekryptera","nyckel","digest","chiffer"}
//! {"op":"aterstall.token","kod":…}  {"op":"version"}
//! ```
//!
//! Byte vi biblioteket (till exempel mot libsignal om Signal ger tillstånd) är det bara den här lådan som
//! ändras; Swift och JS pratar bara JSON-operationerna nedan.
//!
//! ## Protokollet i korthet (version 1)
//!
//! **Identitet.** Kontot har en Ed25519-identitet (AIK). Varje enhet har ett vodozemac-`Account`. AIK signerar
//! `"AdRaze e2e enhet v1\n{uuid}\n{curve}\n{ed}"` (enhetscertifikatet); enheten signerar varje engångsnyckel
//! `"AdRaze e2e otk v1\n{id}\n{nyckel}"` och reservnyckeln (`reserv`). Klienten litar på en kontakts AIK första
//! gången (TOFU), varnar när den ändras och stoppar sändningen om kontakten var verifierad.
//!
//! **1:1.** Olm (3DH + Double Ratchet, vodozemac `SessionConfig::version_1`). Varje händelse krypteras till
//! varje mottagarenhet och till de egna andra enheterna (synk). Klartexten är JSON
//! `{v,fran,fe,till,tk,konv,id,ts,typ,d}` utfylld till block om 80 byte; mottagaren kontrollerar att `fran`,
//! `fe` (avsändarens enhetsnyckel), `till` och `tk` (den egna enhetsnyckeln) stämmer, och att `id` och
//! chiffret inte setts förut och att `ts` inte är äldre än 30 dagar.
//!
//! **Grupper.** Megolm: varje avsändarenhet har en utgående session per grupp, vars nyckel delas med typ
//! `gruppnyckel` i 1:1-sessionerna till medlemmarnas enheter (som Signals Sender Keys). Sessionen byts när
//! någon lämnar, efter 500 meddelanden eller en vecka. Medlemsbilden byggs av klienten själv ur
//! `grupp.inbjudan` och `grupp.andring` från medlemmar; nycklar delas bara med den bilden.
//!
//! **Länkning.** vodozemac HPKE (X25519, ChaCha20-Poly1305, MSC4388) med QR-kod och kontrollkod på två siffror.
//! **Återställning.** Återställningskod (64 tecken a–z0–9) → HKDF → valvnyckel och valv-token; valvet
//! (AES-256-GCM) innehåller AIK, kontonyckel och uuid.
//! **Bilagor.** En slumpad AES-256-GCM-nyckel per fil, SHA-256 av chiffret kontrolleras före öppning.
//! **Lagring.** Hela tillståndet krypteras med AES-256-GCM under en lagringsnyckel som plattformen har i
//! sitt nyckelförråd (iPhone: Keychain med `…ThisDeviceOnly`).
//!
//! Inget post-kvantskydd: vodozemac har ingen PQXDH eller ML-KEM.

mod fel;
mod klient;
mod krypto;
mod sakerhetsnummer;

use std::collections::BTreeMap;
use std::sync::Mutex;

use serde_json::{json, Value};
use zeroize::Zeroizing;

pub use fel::Fel;
pub use klient::Klient;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const PROTOKOLL: u32 = 1;

struct Register {
    nasta: u32,
    klienter: BTreeMap<u32, Klient>,
}

static REGISTER: Mutex<Register> = Mutex::new(Register { nasta: 1, klienter: BTreeMap::new() });

fn svar(r: Result<Value, Fel>) -> String {
    match r {
        Ok(mut v) => {
            if !v.is_object() {
                v = json!({ "varde": v });
            }
            v["ok"] = json!(true);
            v.to_string()
        }
        Err(f) => json!({ "ok": false, "fel": f.kod, "text": f.text }).to_string(),
    }
}

fn handtag(a: &Value) -> Result<u32, Fel> {
    a.get("h").and_then(Value::as_u64).map(|h| h as u32).ok_or_else(|| Fel::new("handtag", "handtag saknas"))
}

fn kor(a: &Value) -> Result<Value, Fel> {
    let op = a.get("op").and_then(Value::as_str).ok_or_else(|| Fel::new("format", "op saknas"))?;
    match op {
        "version" => Ok(json!({ "version": VERSION, "protokoll": PROTOKOLL, "bibliotek": "vodozemac 0.11.2" })),
        "oppna" => {
            let nyckel = Zeroizing::new(krypto::fran_b64(a.get("lagringsnyckel").and_then(Value::as_str).unwrap_or(""))?);
            let tillstand = match a.get("tillstand").and_then(Value::as_str) {
                Some(t) if !t.is_empty() => Some(krypto::fran_b64(t)?),
                _ => None,
            };
            let k = Klient::ny(&nyckel, tillstand.as_deref())?;
            let mut reg = REGISTER.lock().unwrap_or_else(|e| e.into_inner());
            let h = reg.nasta;
            reg.nasta = reg.nasta.wrapping_add(1).max(1);
            reg.klienter.insert(h, k);
            Ok(json!({ "h": h }))
        }
        "stang" => {
            let h = handtag(a)?;
            REGISTER.lock().unwrap_or_else(|e| e.into_inner()).klienter.remove(&h);
            Ok(json!({}))
        }
        "ny_lagringsnyckel" => Ok(json!({ "nyckel": krypto::b64(&krypto::slump32()) })),
        "aterstall.token" => {
            let kod = a.get("kod").and_then(Value::as_str).unwrap_or("");
            let (_, token) = klient::harled_kod(kod)?;
            Ok(json!({ "valv_token": krypto::b64url(&token) }))
        }
        "kod.giltig" => Ok(json!({ "giltig": krypto::normalisera_kod(a.get("kod").and_then(Value::as_str).unwrap_or("")).is_some() })),
        "bilaga.kryptera" => {
            let data = Zeroizing::new(krypto::fran_b64(a.get("data").and_then(Value::as_str).unwrap_or(""))?);
            klient::bilaga_kryptera(&data)
        }
        "bilaga.dekryptera" => {
            let f = |n: &str| a.get(n).and_then(Value::as_str).ok_or_else(|| Fel::new("format", format!("{n} saknas")));
            let chiffer = krypto::fran_b64(f("chiffer")?)?;
            klient::bilaga_dekryptera(f("nyckel")?, f("digest")?, &chiffer)
        }
        _ => {
            let h = handtag(a)?;
            let mut reg = REGISTER.lock().unwrap_or_else(|e| e.into_inner());
            let k = reg.klienter.get_mut(&h).ok_or_else(|| Fel::new("handtag", "okänt handtag"))?;
            if op == "spara" {
                return Ok(json!({ "tillstand": krypto::b64(&k.spara()?) }));
            }
            k.anropa(op, a)
        }
    }
}

/// JSON in, JSON ut. Kastar aldrig: fel blir `{"ok":false,…}`.
pub fn anropa(indata: &str) -> String {
    let a: Value = match serde_json::from_str(indata) {
        Ok(v) => v,
        Err(_) => return svar(Err(Fel::new("format", "indata är inte JSON"))),
    };
    #[cfg(not(target_arch = "wasm32"))]
    {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| kor(&a))) {
            Ok(r) => svar(r),
            Err(_) => svar(Err(Fel::new("intern", "internt fel i E2E-kärnan"))),
        }
    }
    #[cfg(target_arch = "wasm32")]
    {
        svar(kor(&a))
    }
}

// ---------------------------------------------------------------------------------------------------------
// C-gränssnitt (iPhone)
// ---------------------------------------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod c_abi {
    use std::ffi::{c_char, CStr, CString};
    use zeroize::Zeroize;

    /// `indata` är en NUL-avslutad UTF-8-sträng med JSON. Svaret frigörs med `adraze_e2e_frigor`.
    ///
    /// # Safety
    /// `indata` måste vara en giltig NUL-avslutad sträng.
    #[no_mangle]
    pub unsafe extern "C" fn adraze_e2e_anropa(indata: *const c_char) -> *mut c_char {
        let ut = if indata.is_null() {
            super::anropa("")
        } else {
            match CStr::from_ptr(indata).to_str() {
                Ok(s) => super::anropa(s),
                Err(_) => super::anropa(""),
            }
        };
        CString::new(ut).map(CString::into_raw).unwrap_or(std::ptr::null_mut())
    }

    /// Nollar och frigör ett svar från `adraze_e2e_anropa`.
    ///
    /// # Safety
    /// `p` måste komma från `adraze_e2e_anropa` och bara frigöras en gång.
    #[no_mangle]
    pub unsafe extern "C" fn adraze_e2e_frigor(p: *mut c_char) {
        if !p.is_null() {
            let mut b = CString::from_raw(p).into_bytes();
            b.zeroize();
        }
    }
}

// ---------------------------------------------------------------------------------------------------------
// wasm (datorn): rå export utan wasm-bindgen. Slumpen kommer från JS (crypto.getRandomValues).
// ---------------------------------------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
mod wasm_abi {
    use std::sync::Mutex;
    use zeroize::Zeroize;

    static RESULTAT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

    #[link(wasm_import_module = "adraze")]
    extern "C" {
        fn slump(ptr: *mut u8, len: usize);
    }

    /// getrandom 0.4 med `--cfg getrandom_backend="custom"` (se .cargo/config.toml).
    #[no_mangle]
    unsafe extern "Rust" fn __getrandom_v03_custom(dest: *mut u8, len: usize) -> Result<(), getrandom::Error> {
        slump(dest, len);
        Ok(())
    }

    fn layout(n: usize) -> std::alloc::Layout {
        std::alloc::Layout::array::<u8>(n.max(1)).expect("för stort")
    }

    #[no_mangle]
    pub extern "C" fn adraze_minne(n: usize) -> *mut u8 {
        unsafe { std::alloc::alloc(layout(n)) }
    }

    /// Nollar och frigör minne från `adraze_minne`.
    ///
    /// # Safety
    /// `p` och `n` måste komma från samma anrop till `adraze_minne`.
    #[no_mangle]
    pub unsafe extern "C" fn adraze_slapp(p: *mut u8, n: usize) {
        if !p.is_null() {
            std::slice::from_raw_parts_mut(p, n.max(1)).zeroize();
            std::alloc::dealloc(p, layout(n));
        }
    }

    /// Kör ett anrop. Svaret läses med `adraze_resultat` (pekare) och returnerad längd, och nollas sedan med
    /// `adraze_rensa`.
    ///
    /// # Safety
    /// `p` måste peka på `n` byte UTF-8.
    #[no_mangle]
    pub unsafe extern "C" fn adraze_anropa(p: *const u8, n: usize) -> usize {
        let indata = std::slice::from_raw_parts(p, n);
        let ut = match std::str::from_utf8(indata) {
            Ok(s) => super::anropa(s),
            Err(_) => super::anropa(""),
        };
        let mut r = RESULTAT.lock().unwrap_or_else(|e| e.into_inner());
        r.zeroize();
        *r = ut.into_bytes();
        r.len()
    }

    #[no_mangle]
    pub extern "C" fn adraze_resultat() -> *const u8 {
        RESULTAT.lock().unwrap_or_else(|e| e.into_inner()).as_ptr()
    }

    #[no_mangle]
    pub extern "C" fn adraze_rensa() {
        let mut r = RESULTAT.lock().unwrap_or_else(|e| e.into_inner());
        r.zeroize();
        r.clear();
    }
}
