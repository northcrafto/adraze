//! Hjälpare runt vanliga, granskade primitiver (RustCrypto: AES-256-GCM, SHA-256/512, HKDF-SHA256) och
//! slump från operativsystemet (getrandom). Här finns ingen egen kryptografi, bara anrop och format.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use sha2::{Digest, Sha256};

use crate::fel::Fel;

/// Slumpbyte från operativsystemet (iOS: CCRandomGenerateBytes, Linux: getrandom, wasm: crypto.getRandomValues).
pub fn slump(n: usize) -> Vec<u8> {
    let mut v = vec![0u8; n];
    // Utan slump går ingenting säkert att göra; avbryt hellre än att fortsätta med nollor.
    getrandom::fill(&mut v).expect("ingen slump från systemet");
    v
}

pub fn slump32() -> [u8; 32] {
    let mut v = [0u8; 32];
    getrandom::fill(&mut v).expect("ingen slump från systemet");
    v
}

/// AES-256-GCM med slumpad 12-byte nonce. Utdata: nonce ‖ chiffer ‖ tagg.
pub fn forsegla(nyckel: &[u8], aad: &[u8], data: &[u8]) -> Result<Vec<u8>, Fel> {
    let c = Aes256Gcm::new_from_slice(nyckel).map_err(|_| Fel::new("nyckel", "fel nyckellängd"))?;
    let n = slump(12);
    let nonce = Nonce::try_from(&n[..]).map_err(|_| Fel::new("nonce", "fel nonce"))?;
    let ut = c.encrypt(&nonce, Payload { msg: data, aad }).map_err(|_| Fel::new("krypto", "kunde inte kryptera"))?;
    let mut blob = n;
    blob.extend_from_slice(&ut);
    Ok(blob)
}

/// Öppnar `forsegla`. Fel nyckel, ändrade byte eller fel AAD ger `manipulerat`.
pub fn oppna(nyckel: &[u8], aad: &[u8], blob: &[u8]) -> Result<Vec<u8>, Fel> {
    if blob.len() < 12 + 16 {
        return Err(Fel::new("manipulerat", "för kort chiffer"));
    }
    let c = Aes256Gcm::new_from_slice(nyckel).map_err(|_| Fel::new("nyckel", "fel nyckellängd"))?;
    let nonce = Nonce::try_from(&blob[..12]).map_err(|_| Fel::new("nonce", "fel nonce"))?;
    c.decrypt(&nonce, Payload { msg: &blob[12..], aad }).map_err(|_| Fel::new("manipulerat", "chiffret gick inte att öppna"))
}

pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

pub fn hex(data: &[u8]) -> String {
    const T: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(data.len() * 2);
    for b in data {
        s.push(T[(b >> 4) as usize] as char);
        s.push(T[(b & 15) as usize] as char);
    }
    s
}

/// HKDF-SHA256 (RFC 5869).
pub fn hkdf(ikm: &[u8], salt: &[u8], info: &[u8], langd: usize) -> Vec<u8> {
    let hk = hkdf::Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut ut = vec![0u8; langd];
    hk.expand(info, &mut ut).expect("hkdf-längd");
    ut
}

pub fn b64(data: &[u8]) -> String {
    STANDARD.encode(data)
}

pub fn fran_b64(s: &str) -> Result<Vec<u8>, Fel> {
    STANDARD.decode(s.trim()).map_err(|_| Fel::new("format", "ogiltig base64"))
}

pub fn b64url(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

pub fn fran_b64url(s: &str) -> Result<Vec<u8>, Fel> {
    URL_SAFE_NO_PAD.decode(s.trim()).map_err(|_| Fel::new("format", "ogiltig base64url"))
}

/// Jämförelse i konstant tid (för digest och liknande).
pub fn lika(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut d = 0u8;
    for (x, y) in a.iter().zip(b) {
        d |= x ^ y;
    }
    d == 0
}

/// Utfyllnad som Signal Desktop: klartext ‖ 0x80 ‖ nollor upp till en hel multipel av 80 byte, så att längden
/// bara syns i block om 80 byte.
pub fn fyll_ut(data: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(data.len() + 80);
    v.extend_from_slice(data);
    v.push(0x80);
    while v.len() % 80 != 0 {
        v.push(0);
    }
    v
}

pub fn ta_bort_utfyllnad(data: &[u8]) -> Result<&[u8], Fel> {
    let mut i = data.len();
    while i > 0 && data[i - 1] == 0 {
        i -= 1;
    }
    if i == 0 || data[i - 1] != 0x80 {
        return Err(Fel::new("format", "fel utfyllnad"));
    }
    Ok(&data[..i - 1])
}

/// En slumpad UUID (version 4) som text.
pub fn ny_uuid() -> String {
    let mut b = slump(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h = hex(&b);
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

pub fn ar_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_digit() || (b'a'..=b'f').contains(c),
        })
}

pub fn uuid_byte(s: &str) -> Result<[u8; 16], Fel> {
    if !ar_uuid(s) {
        return Err(Fel::new("format", "ogiltig uuid"));
    }
    let h: Vec<u8> = s.bytes().filter(|c| *c != b'-').collect();
    let mut ut = [0u8; 16];
    for i in 0..16 {
        let v = |c: u8| if c.is_ascii_digit() { c - b'0' } else { c - b'a' + 10 };
        ut[i] = (v(h[2 * i]) << 4) | v(h[2 * i + 1]);
    }
    Ok(ut)
}

/// Återställningskoden: 64 tecken a–z och 0–9 (som libsignals AccountEntropyPool), omkring 330 bitar.
pub const KOD_TECKEN: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";

pub fn ny_aterstallningskod() -> String {
    let mut s = String::with_capacity(64);
    while s.len() < 64 {
        for b in slump(96) {
            // 252 = 7 * 36: förkasta resten så att alla tecken blir lika troliga
            if b < 252 && s.len() < 64 {
                s.push(KOD_TECKEN[(b % 36) as usize] as char);
            }
        }
    }
    s
}

/// Tar bort mellanslag och bindestreck och gör om till gemener. `None` om koden inte har 64 giltiga tecken.
pub fn normalisera_kod(kod: &str) -> Option<String> {
    let s: String = kod.chars().filter(|c| !c.is_whitespace() && *c != '-').flat_map(|c| c.to_lowercase()).collect();
    (s.len() == 64 && s.bytes().all(|c| KOD_TECKEN.contains(&c))).then_some(s)
}

#[cfg(test)]
mod prov {
    use super::*;

    #[test]
    fn forsegla_och_oppna() {
        let k = slump32();
        let blob = forsegla(&k, b"aad", b"hej").unwrap();
        assert_eq!(oppna(&k, b"aad", &blob).unwrap(), b"hej");
        assert!(oppna(&k, b"annan", &blob).is_err());
        let mut fel = blob.clone();
        let sista = fel.len() - 1;
        fel[sista] ^= 1;
        assert_eq!(oppna(&k, b"aad", &fel).unwrap_err().kod, "manipulerat");
    }

    #[test]
    fn utfyllnad() {
        for n in [0usize, 1, 78, 79, 80, 81, 500] {
            let d = vec![7u8; n];
            let f = fyll_ut(&d);
            assert_eq!(f.len() % 80, 0);
            assert_eq!(ta_bort_utfyllnad(&f).unwrap(), &d[..]);
        }
    }

    #[test]
    fn kod_och_uuid() {
        let k = ny_aterstallningskod();
        assert_eq!(k.len(), 64);
        let grupperad: String = k.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap().to_uppercase()).collect::<Vec<_>>().join(" ");
        assert_eq!(normalisera_kod(&grupperad).unwrap(), k);
        let u = ny_uuid();
        assert!(ar_uuid(&u));
        assert_eq!(uuid_byte(&u).unwrap()[6] >> 4, 4);
    }
}
