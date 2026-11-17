import Foundation
import WebKit

/// Behörigheter per sajt, i datorns format och samma inställningar (`browser/webbinst.js`):
///  - `webb.perms` = `{ "<ursprung>": { "<slag>": "allow" | "block" } }`, ursprunget som `URL.origin`
///    ("https://example.com", "http://127.0.0.1:8080")
///  - `webb.permDefaults` = `{ "<slag>": "ask" | "block" }`
///  - privata flikar sparar bara i minnet och läser de vanliga svaren när de saknar egna (datorns `decision`)
///
/// Slagen är datorns (`camera`, `microphone`, `geolocation`, `notifications`, `clipboard-read`, `midi`,
/// `external`) plus `sensors` för iPhones rörelsesensorer (DeviceMotion och DeviceOrientation, finns inte på datorn).
///
/// Platsen frågar iOS själv om (WebKit har inget publikt delegatanrop för geolocation på iOS), så `geolocation`
/// används inte här än.
@MainActor
final class Flikbehorighet {
    private let installningar: Installningar
    weak var dialoger: Flikdialoger?
    /// Privata flikars svar: bara i minnet.
    private var privata: [String: [String: String]] = [:]

    static let slagen = ["camera", "microphone", "geolocation", "notifications", "clipboard-read", "midi", "external", "sensors"]

    init(installningar: Installningar) {
        self.installningar = installningar
    }

    // MARK: - Ursprung

    /// `URL.origin` som i JavaScript, bara för http(s). `nil` för allt annat.
    static func ursprung(_ url: URL?) -> String? {
        guard let url, let s = url.scheme?.lowercased(), s == "http" || s == "https",
              let vard = url.host(percentEncoded: false)?.lowercased(), !vard.isEmpty else { return nil }
        let standard = s == "https" ? 443 : 80
        let vardDel = vard.contains(":") ? "[\(vard)]" : vard
        if let p = url.port, p != standard { return "\(s)://\(vardDel):\(p)" }
        return "\(s)://\(vardDel)"
    }

    /// Ursprunget för en `WKSecurityOrigin` (port 0 = schemats standardport).
    static func ursprung(_ o: WKSecurityOrigin) -> String {
        let s = o.protocol.lowercased()
        let vard = o.host.lowercased()
        let vardDel = vard.contains(":") ? "[\(vard)]" : vard
        let standard = s == "https" ? 443 : (s == "http" ? 80 : 0)
        if o.port != 0 && o.port != standard { return "\(s)://\(vardDel):\(o.port)" }
        return "\(s)://\(vardDel)"
    }

    /// Värden som den visas i rutorna ("example.com", "127.0.0.1:8080").
    static func visning(_ o: WKSecurityOrigin) -> String {
        let u = ursprung(o)
        if let r = u.range(of: "://") { return String(u[r.upperBound...]) }
        return u
    }

    static func visning(ursprung: String) -> String {
        if let r = ursprung.range(of: "://") { return String(ursprung[r.upperBound...]) }
        return ursprung
    }

    // MARK: - Beslut

    /// `allow`, `block` eller `ask` (datorns `decision`).
    func beslut(_ ursprung: String, _ slag: String, privat: Bool) -> String {
        if privat, let s = privata[ursprung]?[slag] { return s }
        if let s = installningar[.webbPerms][ursprung][slag].text, s == "allow" || s == "block" { return s }
        return installningar[.webbPermDefaults][slag].text == "block" ? "block" : "ask"
    }

    /// Sparar ett svar (bara i minnet för privata flikar).
    func spara(_ ursprung: String, _ slag: [String], tillat: Bool, privat: Bool) {
        let v = tillat ? "allow" : "block"
        if privat {
            for k in slag { privata[ursprung, default: [:]][k] = v }
            return
        }
        var alla = installningar[.webbPerms].objekt ?? [:]
        var s = alla[ursprung]?.objekt ?? [:]
        for k in slag { s[k] = .text(v) }
        alla[ursprung] = .objekt(s)
        installningar[.webbPerms] = .objekt(alla)
    }

    /// Glömmer allt för ett ursprung (datorns `permForget`).
    func glom(_ ursprung: String) {
        privata[ursprung] = nil
        var alla = installningar[.webbPerms].objekt ?? [:]
        guard alla.removeValue(forKey: ursprung) != nil else { return }
        installningar[.webbPerms] = .objekt(alla)
    }

    /// Glömmer privata flikars svar (när den sista privata fliken stängs).
    func glomPrivata() { privata = [:] }

    // MARK: - Fråga

    /// Frågar (om inget sparat svar finns) och ger `true` för tillåt. Blockerat = nej utan fråga.
    func fraga(flik: Webbflik, ursprung: String, slag: [String]) async -> Bool {
        guard !ursprung.isEmpty, let dialoger else { return false }
        let b = slag.map { beslut(ursprung, $0, privat: flik.privat) }
        if b.contains("block") { return false }
        if b.allSatisfy({ $0 == "allow" }) { return true }
        let svar = await dialoger.fraga(flik: flik.id, ursprung: Self.visning(ursprung: ursprung), slag: .behorighet(slag))
        if svar.komIhag { spara(ursprung, slag, tillat: svar.ok, privat: flik.privat) }
        return svar.ok
    }

    /// En länk till en annan app (datorns slag `external`).
    func fragaExtern(flik: Webbflik, ursprung: String, url: URL) async -> Bool {
        guard let dialoger else { return false }
        if !ursprung.isEmpty {
            let b = beslut(ursprung, "external", privat: flik.privat)
            if b == "block" { return false }
            if b == "allow" { return true }
        }
        let svar = await dialoger.fraga(flik: flik.id, ursprung: Self.visning(ursprung: ursprung), slag: .externApp(url))
        if svar.komIhag, !ursprung.isEmpty { spara(ursprung, ["external"], tillat: svar.ok, privat: flik.privat) }
        return svar.ok
    }
}
