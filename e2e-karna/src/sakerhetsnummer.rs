//! Säkerhetsnummer och QR-kod för att verifiera en kontakt, efter Signals modell (libsignal `fingerprint.rs`,
//! Signal Desktop `ITERATION_COUNT = 5200`): itererad SHA-512 över version, publik identitetsnyckel och
//! identifierare; 30 siffror per person, 60 siffror sorterade så att båda ser samma nummer.
//!
//! Skillnader mot Signal: nyckeln är kontots Ed25519-identitet (32 byte) och identifieraren chattens uuid
//! (16 byte). Numret går alltså inte att jämföra med Signals, bara mellan AdRaze-klienter.

use sha2::{Digest, Sha512};

use crate::fel::{Fel, R};
use crate::krypto::{hex, uuid_byte};

const VARV: usize = 5200;
const VERSION: [u8; 2] = [0, 2];

/// 32 byte fingeravtryck för en person.
pub fn fingeravtryck(uuid: &str, nyckel: &[u8; 32]) -> R<[u8; 32]> {
    let id = uuid_byte(uuid)?;
    let mut h = Sha512::new();
    h.update(VERSION);
    h.update(nyckel);
    h.update(id);
    let mut buf = h.finalize();
    for _ in 1..VARV {
        let mut h = Sha512::new();
        h.update(buf);
        h.update(nyckel);
        buf = h.finalize();
    }
    let mut ut = [0u8; 32];
    ut.copy_from_slice(&buf[..32]);
    Ok(ut)
}

/// 30 siffror: sex delar om fem byte, var och en som tal modulo 100 000.
pub fn siffror(fa: &[u8; 32]) -> String {
    let mut s = String::with_capacity(30);
    for i in 0..6 {
        let mut v: u64 = 0;
        for b in &fa[i * 5..i * 5 + 5] {
            v = (v << 8) | *b as u64;
        }
        s.push_str(&format!("{:05}", v % 100_000));
    }
    s
}

pub struct Sakerhetsnummer {
    pub siffror: String,
    pub qr: String,
}

/// Numret är detsamma hos båda; QR-koden innehåller båda fingeravtrycken sett från den som visar den.
pub fn berakna(min_uuid: &str, min_nyckel: &[u8; 32], deras_uuid: &str, deras_nyckel: &[u8; 32]) -> R<Sakerhetsnummer> {
    let mitt = fingeravtryck(min_uuid, min_nyckel)?;
    let deras = fingeravtryck(deras_uuid, deras_nyckel)?;
    let (a, b) = (siffror(&mitt), siffror(&deras));
    let siffror = if a <= b { a + &b } else { b + &a };
    let qr = format!("adraze-sn:1:{}:{}:{}:{}", min_uuid, deras_uuid, hex(&mitt), hex(&deras));
    Ok(Sakerhetsnummer { siffror, qr })
}

/// Kontrollerar en skannad QR-kod: den som visade den (deras) ska ha samma bild av båda nycklarna som vi.
pub fn stammer(qr: &str, min_uuid: &str, min_nyckel: &[u8; 32], deras_uuid: &str, deras_nyckel: &[u8; 32]) -> R<bool> {
    let d: Vec<&str> = qr.trim().split(':').collect();
    if d.len() != 6 || d[0] != "adraze-sn" || d[1] != "1" {
        return Err(Fel::new("format", "inte en AdRaze-säkerhetskod"));
    }
    // I deras QR-kod är de själva "min" och vi "deras".
    if d[2] != deras_uuid || d[3] != min_uuid {
        return Ok(false);
    }
    let mitt = hex(&fingeravtryck(min_uuid, min_nyckel)?);
    let deras = hex(&fingeravtryck(deras_uuid, deras_nyckel)?);
    Ok(crate::krypto::lika(d[4].as_bytes(), deras.as_bytes()) && crate::krypto::lika(d[5].as_bytes(), mitt.as_bytes()))
}

#[cfg(test)]
mod prov {
    use super::*;

    #[test]
    fn samma_nummer_hos_bada() {
        let (ua, ub) = ("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
        let (ka, kb) = ([1u8; 32], [2u8; 32]);
        let a = berakna(ua, &ka, ub, &kb).unwrap();
        let b = berakna(ub, &kb, ua, &ka).unwrap();
        assert_eq!(a.siffror, b.siffror);
        assert_eq!(a.siffror.len(), 60);
        assert!(stammer(&b.qr, ua, &ka, ub, &kb).unwrap());
        assert!(stammer(&a.qr, ub, &kb, ua, &ka).unwrap());
        // Bytt nyckel hos b: koden stämmer inte längre
        assert!(!stammer(&b.qr, ua, &ka, ub, &[3u8; 32]).unwrap());
    }
}
