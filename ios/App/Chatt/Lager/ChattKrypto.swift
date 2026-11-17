import CryptoKit
import Foundation

/// Version 1 av chattens krypto, byte för byte samma som datorns `ui/chatt.js` (WebCrypto) och Säkerkoll:
///
/// - Nyckelpar: ECDH P-256. Publika nyckeln skickas som base64 av den okomprimerade punkten (65 byte, `raw`).
///   Privata nyckeln sparas på servern som `enc_priv` = base64(iv‖AES-GCM(PKCS#8)) under en wrap-nyckel.
/// - Wrap-nyckeln och inloggningsbeviset kommer ur kontots hemlighet (`GET /chatt/nyckel`):
///   wrap = SHA-256("adraze-chatt-wrap-v1:" + hemlighet), login_hash = base64(SHA-256("adraze-chatt-auto-v1:" + hemlighet)).
/// - Nyckeln för en tvåpersonschatt är ECDH-hemligheten (x-koordinaten, 32 byte) direkt som AES-256-nyckel
///   (WebCrypto `deriveKey` till AES-GCM 256 gör just så, ingen KDF).
/// - Gruppnyckel: 32 slumpbyte, inslagen till varje medlem med parets nyckel (`key_envelope`).
/// - Chiffertext: base64(iv 12 byte ‖ chiffertext ‖ tagg 16 byte), samma som `AES.GCM.SealedBox.combined`.
///
/// I dag hämtas hemligheten via kontot, så servern skulle tekniskt kunna låsa upp nyckeln (plan 2). Version 2
/// (plan 4, libsignal) ersätter den här filen bakom `ChattLager`.
///
/// Ägare: Konto och chatt.
enum ChattKrypto {
    struct Fel: Error {}

    static func sha256(_ s: String) -> Data { Data(SHA256.hash(data: Data(s.utf8))) }
    static func wrapNyckel(_ hemlighet: String) -> SymmetricKey { SymmetricKey(data: sha256("adraze-chatt-wrap-v1:" + hemlighet)) }
    static func loginHash(_ hemlighet: String) -> String { sha256("adraze-chatt-auto-v1:" + hemlighet).base64EncodedString() }

    // MARK: AES-GCM

    static func oppna(_ nyckel: SymmetricKey, _ b64: String) throws -> Data {
        guard let blob = Data(base64Encoded: b64), blob.count >= 28 else { throw Fel() }
        return try AES.GCM.open(try AES.GCM.SealedBox(combined: blob), using: nyckel)
    }

    static func oppnaText(_ nyckel: SymmetricKey, _ b64: String) throws -> String {
        guard let s = String(data: try oppna(nyckel, b64), encoding: .utf8) else { throw Fel() }
        return s
    }

    static func forsegla(_ nyckel: SymmetricKey, _ data: Data) throws -> String {
        guard let c = try AES.GCM.seal(data, using: nyckel).combined else { throw Fel() }
        return c.base64EncodedString()
    }

    static func forseglaText(_ nyckel: SymmetricKey, _ text: String) throws -> String { try forsegla(nyckel, Data(text.utf8)) }

    // MARK: ECDH P-256

    static func publik(_ b64: String) throws -> P256.KeyAgreement.PublicKey {
        guard let d = Data(base64Encoded: b64) else { throw Fel() }
        return try P256.KeyAgreement.PublicKey(x963Representation: d)
    }

    static func pubB64(_ priv: P256.KeyAgreement.PrivateKey) -> String { priv.publicKey.x963Representation.base64EncodedString() }

    /// Parets AES-nyckel (samma som WebCrypto `deriveKey({name:'ECDH'}, …, {name:'AES-GCM', length:256})`).
    static func delad(_ priv: P256.KeyAgreement.PrivateKey, _ deras: String) throws -> SymmetricKey {
        let hemligt = try priv.sharedSecretFromKeyAgreement(with: try publik(deras))
        return SymmetricKey(data: hemligt.withUnsafeBytes { Data($0) })
    }

    /// PKCS#8 som WebCrypto exporterar (`exportKey('pkcs8')`). CryptoKit läser både PKCS#8 och SEC1; om det
    /// ändå misslyckas plockas den privata skalären (32 byte efter `02 01 01 04 20` i ECPrivateKey) ut.
    static func privat(pkcs8: Data) throws -> P256.KeyAgreement.PrivateKey {
        if let k = try? P256.KeyAgreement.PrivateKey(derRepresentation: pkcs8) { return k }
        let monster: [UInt8] = [0x02, 0x01, 0x01, 0x04, 0x20]
        let b = [UInt8](pkcs8)
        if b.count >= monster.count + 32 {
            for i in 0...(b.count - monster.count - 32) where Array(b[i..<(i + monster.count)]) == monster {
                return try P256.KeyAgreement.PrivateKey(rawRepresentation: Data(b[(i + monster.count)..<(i + monster.count + 32)]))
            }
        }
        throw Fel()
    }

    /// PKCS#8 till servern, läsbar för WebCrypto `importKey('pkcs8')` på datorn.
    static func pkcs8(_ priv: P256.KeyAgreement.PrivateKey) -> Data { priv.derRepresentation }

    // MARK: Grupper

    static func slaIn(_ gruppnyckel: SymmetricKey, _ priv: P256.KeyAgreement.PrivateKey, till deras: String) throws -> String {
        try forsegla(try delad(priv, deras), gruppnyckel.withUnsafeBytes { Data($0) })
    }

    static func packaUpp(_ kuvert: String, _ priv: P256.KeyAgreement.PrivateKey, fran deras: String) throws -> SymmetricKey {
        let ra = try oppna(try delad(priv, deras), kuvert)
        guard ra.count == 32 else { throw Fel() }
        return SymmetricKey(data: ra)
    }
}
