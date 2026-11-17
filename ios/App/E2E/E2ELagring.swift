import CryptoKit
import Foundation
import Security

/// Var E2E-nycklarna och historiken ligger på iPhonen (plan 4, 3.13):
///
/// - **Lagringsnyckeln** (32 slumpbyte) ligger i Keychain med `AfterFirstUnlockThisDeviceOnly`. Den klassen följer
///   inte med i säkerhetskopior eller till en ny telefon och kan inte synkas med iCloud-nyckelringen.
/// - **Kärnans tillstånd** (identitet, enhetsnycklar, sessioner, gruppnycklar) och **historiken** ligger som filer i
///   `Application Support/E2E/<konto>/`, krypterade med lagringsnyckeln (AES-256-GCM i kärnan, etiketten som AAD),
///   med filskyddet `CompleteUntilFirstUserAuthentication` och undantagna från säkerhetskopian (`isExcludedFromBackup`).
/// - **En annan server** än AdRazes (en testserver) ger mappen `E2E/<värd>-<port>-<konto>/` och en egen nyckel: samma
///   konto-id på två servrar delar alltså aldrig nycklar eller historik (i simulatorn körs flera testservrar).
///
/// Efter en återställning från iCloud finns alltså varken nyckel eller tillstånd: telefonen länkas igen eller
/// använder återställningskoden.
///
/// Ägare: E2E.
@MainActor
final class E2ELagring {
    static let tjanst = "app.adraze.e2e"
    let konto: String
    let mapp: URL
    /// Kontot på servern: bara konto-id:t hos AdRazes server, med värd och port framför hos andra.
    private let id: String
    private var nyckelnamn: String { "e2e.lagringsnyckel.\(id)" }

    init(konto: String, server: URL) {
        self.konto = konto
        let tagg = Self.tagg(server)
        id = tagg.isEmpty ? konto : tagg + "-" + konto
        mapp = Self.rot.appendingPathComponent(id.filter { $0.isLetter || $0.isNumber || $0 == "-" }, isDirectory: true)
    }

    /// "" för AdRazes server, annars värd och port ("100-122-13-91-18791").
    static func tagg(_ server: URL) -> String {
        guard let vard = server.host, vard != "api.adraze.app" else { return "" }
        return (vard + (server.port.map { "-\($0)" } ?? "")).map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
    }

    static var rot: URL {
        (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory()))
            .appendingPathComponent("E2E", isDirectory: true)
    }

    func forbered() throws {
        let fm = FileManager.default
        try fm.createDirectory(at: mapp.appendingPathComponent("historik", isDirectory: true), withIntermediateDirectories: true,
                               attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        for url in [Self.rot, mapp] {
            var u = url
            var v = URLResourceValues()
            v.isExcludedFromBackup = true
            try u.setResourceValues(v)
        }
    }

    // MARK: Nyckeln i Keychain

    /// Lagringsnyckeln (base64). Skapas av kärnan första gången.
    func nyckel() throws -> String {
        if let d = try Nyckelring.hamta(konto: nyckelnamn, tjanst: Self.tjanst), let s = String(data: d, encoding: .utf8), !s.isEmpty {
            return s
        }
        guard let ny = try E2EKarna.krav(["op": "ny_lagringsnyckel"])["nyckel"] as? String else { throw E2EFel(kod: "karna", text: "ingen nyckel") }
        try Nyckelring.spara(Data(ny.utf8), konto: nyckelnamn, tjanst: Self.tjanst)
        return ny
    }

    /// Keychain-postens skydd, för självtestet: tillgänglighetsklassen och om posten synkas.
    func nyckelskydd() -> (efterForstaUpplasningBaraHar: Bool, synkas: Bool)? {
        let fraga: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.tjanst,
                                    kSecAttrAccount as String: nyckelnamn, kSecReturnAttributes as String: true,
                                    kSecAttrSynchronizable as String: kSecAttrSynchronizableAny, kSecMatchLimit as String: kSecMatchLimitOne]
        var ut: CFTypeRef?
        guard SecItemCopyMatching(fraga as CFDictionary, &ut) == errSecSuccess, let a = ut as? [String: Any] else { return nil }
        let klass = a[kSecAttrAccessible as String] as? String
        let synk = (a[kSecAttrSynchronizable as String] as? NSNumber)?.boolValue ?? false
        return (klass == (kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String), synk)
    }

    // MARK: Filer

    func fil(_ namn: String) -> URL { mapp.appendingPathComponent(namn) }

    func skriv(_ d: Data, till url: URL) throws {
        try d.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func lasTillstand() -> String? { try? String(contentsOf: fil("tillstand"), encoding: .utf8) }
    func sparaTillstand(_ t: String) throws { try skriv(Data(t.utf8), till: fil("tillstand")) }

    /// Allt E2E för kontot på den här telefonen (nyckeln och filerna). Används när identiteten byts och i självtestet.
    func radera() {
        try? Nyckelring.radera(konto: nyckelnamn, tjanst: Self.tjanst)
        try? FileManager.default.removeItem(at: mapp)
    }

    /// Filernas skydd, för självtestet.
    func filskydd() -> (undantagenFranBackup: Bool, skydd: String) {
        let v = try? mapp.resourceValues(forKeys: [.isExcludedFromBackupKey])
        let a = try? FileManager.default.attributesOfItem(atPath: fil("tillstand").path)
        return (v?.isExcludedFromBackup == true, (a?[.protectionKey] as? FileProtectionType)?.rawValue ?? "okänt")
    }
}

// MARK: - Historiken (krypterad i vila)

/// En post i den lokala historiken. Servern sparar inget efter leveransen, så historiken finns bara på enheterna.
struct E2EPost: Codable, Equatable, Sendable {
    /// Meddelandets id från kärnan (32 hex). Reaktioner: `rx-<uuid>-<mål>-<emoji>` (en per person, mål och emoji).
    var id: String
    /// Avsändarens uuid.
    var fran: String
    var mitt: Bool
    /// Avsändarens tid (ms).
    var ts: Int64
    /// När posten kom till den här telefonen (ms, ökar alltid). Det är `ChattMeddelande.ms`.
    var lokal: Int64
    /// `msg` eller `rx`.
    var typ: String
    /// Innehållet som JSON-text (`d` i protokollet).
    var d: String
    /// Raderad av avsändaren: innehållet är bortplockat.
    var borta: Bool = false
    /// När raderingen kom (lokal tid), så att den öppna chatten får ändringen.
    var andrad: Int64?
}

/// Historiken per konversation, varje konversation i en egen fil som kärnan krypterat (`lagring.forsegla`, etiketten
/// `historik:<konv>` som AAD så att filer inte kan bytas mellan konversationer). Ett index (också krypterat) håller
/// reda på konversationerna, vad som är läst och den lokala klockan.
@MainActor
final class E2EHistorik {
    struct Konv: Codable { var poster: [E2EPost] = []; var last: Int64 = 0 }
    struct Index: Codable { var konv: [String] = []; var klocka: Int64 = 0 }

    private let lagring: E2ELagring
    private let h: Int
    private var index = Index()
    private var minne: [String: Konv] = [:]

    init(lagring: E2ELagring, h: Int) {
        self.lagring = lagring
        self.h = h
        if let d = las("index", fil: "historik/index.bin"), let i = try? JSONDecoder().decode(Index.self, from: d) { index = i }
    }

    var konversationer: [String] { index.konv }

    func poster(_ konv: String) -> [E2EPost] { hamta(konv).poster }
    func last(_ konv: String) -> Int64 { hamta(konv).last }

    /// Nästa lokala tid: aldrig lägre än förra, så att `sedan` i ChattLage aldrig hoppar över något.
    func tick() -> Int64 {
        let nu = Int64(Date().timeIntervalSince1970 * 1000)
        index.klocka = max(index.klocka + 1, nu)
        return index.klocka
    }

    /// Lägger till eller ersätter (samma id) poster i en konversation och sparar.
    func lagg(_ nya: [E2EPost], i konv: String) {
        guard !nya.isEmpty else { return }
        var k = hamta(konv)
        for p in nya {
            if let i = k.poster.firstIndex(where: { $0.id == p.id && $0.fran == p.fran }) { k.poster[i] = p } else { k.poster.append(p) }
        }
        k.poster.sort { $0.lokal < $1.lokal }
        spara(konv, k)
    }

    /// Avsändaren raderade ett meddelande: innehållet tas bort här också. Bara avsändarens egna.
    @discardableResult
    func radera(_ id: String, av fran: String, i konv: String) -> E2EPost? {
        var k = hamta(konv)
        guard let i = k.poster.firstIndex(where: { $0.id == id && $0.fran == fran }) else { return nil }
        k.poster[i].borta = true
        k.poster[i].d = "{}"
        k.poster[i].andrad = tick()
        let p = k.poster[i]
        spara(konv, k)
        return p
    }

    /// Bara här: posten döljs (tas bort ur historiken på den här telefonen).
    func dolj(_ id: String, i konv: String) {
        var k = hamta(konv)
        k.poster.removeAll { $0.id == id }
        spara(konv, k)
    }

    func markeraLast(_ konv: String) {
        var k = hamta(konv)
        k.last = index.klocka
        spara(konv, k)
    }

    // MARK: Filerna

    private func filnamn(_ konv: String) -> String {
        "historik/" + SHA256.hash(data: Data(konv.utf8)).map { String(format: "%02x", $0) }.joined() + ".bin"
    }

    private func hamta(_ konv: String) -> Konv {
        if let k = minne[konv] { return k }
        let k = las("historik:" + konv, fil: filnamn(konv)).flatMap { try? JSONDecoder().decode(Konv.self, from: $0) } ?? Konv()
        minne[konv] = k
        return k
    }

    private func spara(_ konv: String, _ k: Konv) {
        minne[konv] = k
        if !index.konv.contains(konv) { index.konv.append(konv) }
        if let d = try? JSONEncoder().encode(k) { skriv("historik:" + konv, d, fil: filnamn(konv)) }
        if let d = try? JSONEncoder().encode(index) { skriv("index", d, fil: "historik/index.bin") }
    }

    private func las(_ etikett: String, fil: String) -> Data? {
        guard let rad = try? Data(contentsOf: lagring.fil(fil)) else { return nil }
        let r = E2EKarna.anropa(["op": "lagring.oppna", "h": h, "etikett": etikett, "data": rad.base64EncodedString()])
        return (r["data"] as? String).flatMap { Data(base64Encoded: $0) }
    }

    private func skriv(_ etikett: String, _ data: Data, fil: String) {
        let r = E2EKarna.anropa(["op": "lagring.forsegla", "h": h, "etikett": etikett, "data": data.base64EncodedString()])
        guard let s = r["data"] as? String, let d = Data(base64Encoded: s) else { return }
        try? lagring.skriv(d, till: lagring.fil(fil))
    }
}
