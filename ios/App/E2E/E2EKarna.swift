import AdrazeE2EKarna
import Foundation

/// E2E-kärnan: Rust ovanpå vodozemac 0.11.2 (Apache-2.0, granskad av Least Authority 2022), byggd som statiskt
/// bibliotek i `Karna/AdrazeE2EKarna.xcframework` av `~/adraze/e2e-karna/bygg.sh ios`. Samma kärna (som wasm) finns
/// i datorns `browser/e2e/`, så protokollet är detsamma på båda.
///
/// Allt kryptografiskt sker i kärnan: Olm (3DH + Double Ratchet) för 1:1 och nyckeldelning, Megolm för grupper,
/// HPKE för länkning, säkerhetsnummer, återställningskod och valv. Swift-sidan sköter Keychain, filer, nätet och
/// gränssnittet och ser aldrig privata nycklar (bara kärnans krypterade tillstånd).
///
/// Gränssnittet är ett enda anrop: JSON in (`{"op": …}`), JSON ut (`{"ok": true, …}` eller `{"ok": false, "fel", "text"}`).
/// Det smala gränssnittet gör att vodozemac går att byta (till exempel mot libsignal) utan att resten ändras.
///
/// Ägare: E2E.
enum E2EKarna {
    /// Ett anrop till kärnan. Kärnan är trådsäker (ett lås runt allt).
    static func anropa(_ fraga: [String: Any]) -> [String: Any] {
        guard let data = try? JSONSerialization.data(withJSONObject: fraga),
              let text = String(data: data, encoding: .utf8) else {
            return ["ok": false, "fel": "format", "text": "kunde inte koda frågan"]
        }
        return text.withCString { p -> [String: Any] in
            guard let svar = adraze_e2e_anropa(p) else { return ["ok": false, "fel": "karna", "text": "inget svar"] }
            // Svaret kan innehålla återställningskoden: kärnan nollar det när det frigörs
            defer { adraze_e2e_frigor(svar) }
            let d = Data(bytes: svar, count: strlen(svar))
            return ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? ["ok": false, "fel": "format", "text": "ogiltigt svar"]
        }
    }

    /// Som `anropa`, men ett fel från kärnan kastas.
    static func krav(_ fraga: [String: Any]) throws -> [String: Any] {
        let r = anropa(fraga)
        guard r["ok"] as? Bool == true else { throw E2EFel(kod: r["fel"] as? String ?? "fel", text: r["text"] as? String ?? "") }
        return r
    }

    static var version: String {
        let r = anropa(["op": "version"])
        return "\(r["version"] as? String ?? "?") (\(r["bibliotek"] as? String ?? "?"), protokoll \(r["protokoll"] as? Int ?? 0))"
    }
}

/// Fel från kärnan, servern eller flödet. `kod` är maskinläsbar (`manipulerat`, `identitet_andrad`, `fel_kod` …).
struct E2EFel: LocalizedError {
    let kod: String
    let text: String
    var status: Int = 0
    var svar: [String: Any] = [:]
    var uuid: String?

    /// Översätts på huvudtråden (där vyerna frågar); någon annanstans blir det koden eller serverns text.
    var errorDescription: String? {
        let (kod, text) = (self.kod, self.text)
        guard Thread.isMainThread else { return text.isEmpty ? kod : text }
        return MainActor.assumeIsolated {
            switch kod {
            case "identitet_andrad": return ct("Säkerhetsnumret har ändrats. Godkänn det nya numret innan du skickar.")
            case "fel_kod": return ct("Återställningskoden stämmer inte.")
            case "network": return ct("Kunde inte nå chatten. Kontrollera din uppkoppling.")
            default: return text.isEmpty ? ct("Något gick fel. Försök igen.") : text
            }
        }
    }
}

// MARK: - Små hjälpare för JSON från kärnan och servern

enum E2EJSON {
    static func text(_ v: Any?) -> String? {
        switch v {
        case let s as String: return s
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }

    static func tal(_ v: Any?) -> Int64? {
        switch v {
        case let n as NSNumber: return n.int64Value
        case let s as String: return Int64(s)
        default: return nil
        }
    }

    static func objekt(_ v: Any?) -> [String: Any] { (v as? [String: Any]) ?? [:] }
    static func lista(_ v: Any?) -> [[String: Any]] { (v as? [[String: Any]]) ?? [] }
    static func textlista(_ v: Any?) -> [String] { ((v as? [Any]) ?? []).compactMap { text($0) } }

    static func kodad(_ v: Any) -> String {
        guard JSONSerialization.isValidJSONObject(v), let d = try? JSONSerialization.data(withJSONObject: v, options: [.sortedKeys]) else { return "null" }
        return String(data: d, encoding: .utf8) ?? "null"
    }

    static func avkodad(_ s: String) -> Any? { try? JSONSerialization.jsonObject(with: Data(s.utf8), options: [.fragmentsAllowed]) }
}
