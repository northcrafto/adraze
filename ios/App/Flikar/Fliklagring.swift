import Foundation
import UIKit

/// Var Flikar sparar sina filer:
///
///     <mapp>/session.json            öppna flikar (inte privata), ordning och aktiv flik
///     <mapp>/tillstand/<id>.bin      varje fliks WKWebView.interactionState (bakåt/framåt-listan, rullning, formulär)
///     <mapp>/miniatyrer/<id>.jpg     flikväxlarens bilder
///     <mapp>/favikoner/<hash>.png    favikoner för historik och bokmärken
///     <mapp>/historik.json           historiken (historik-<konto>.json när någon är inloggad, som datorns per konto)
///     <mapp>/bokmarken.json          bokmärken och gravstenar
///     <mapp>/nedladdningar.json      nedladdningslistan
///
/// Vanligt läge: `Application Support/AdRaze/Flikar/`, och nedladdade filer i `Documents/Nedladdningar/` (syns i
/// appen Filer). Självtester: en egen tom mapp i `tmp/`.
///
/// Skrivningar går på en egen seriell kö, så att huvudtråden inte väntar på disken och den senaste skrivningen
/// alltid vinner.
struct Fliklagring: Sendable {
    let mapp: URL
    let nedladdningar: URL

    private static let ko = DispatchQueue(label: "app.adraze.flikar.lagring", qos: .utility)

    static func standard() -> Fliklagring {
        let fm = FileManager.default
        let bas = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AdRaze", isDirectory: true)
            .appendingPathComponent("Flikar", isDirectory: true)
        let dok = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Nedladdningar", isDirectory: true)
        return Fliklagring(mapp: bas, nedladdningar: dok).skapad()
    }

    /// En tom mapp för självtester (tas bort och skapas på nytt).
    static func forSjalvtest(_ namn: String = "AdRaze-Flikar-prov") -> Fliklagring {
        let bas = FileManager.default.temporaryDirectory.appendingPathComponent(namn, isDirectory: true)
        try? FileManager.default.removeItem(at: bas)
        return Fliklagring(mapp: bas, nedladdningar: bas.appendingPathComponent("Nedladdningar", isDirectory: true)).skapad()
    }

    private func skapad() -> Fliklagring {
        let fm = FileManager.default
        for m in [mapp, mapp.appendingPathComponent("tillstand"), mapp.appendingPathComponent("miniatyrer"),
                  favikonmapp, nedladdningar] {
            try? fm.createDirectory(at: m, withIntermediateDirectories: true)
        }
        return self
    }

    // MARK: - Filerna

    var sessionsfil: URL { mapp.appendingPathComponent("session.json") }
    var bokmarkesfil: URL { mapp.appendingPathComponent("bokmarken.json") }
    var nedladdningsfil: URL { mapp.appendingPathComponent("nedladdningar.json") }
    var favikonmapp: URL { mapp.appendingPathComponent("favikoner", isDirectory: true) }

    func tillstandsfil(_ id: UUID) -> URL { mapp.appendingPathComponent("tillstand/\(id.uuidString).bin") }
    func miniatyrfil(_ id: UUID) -> URL { mapp.appendingPathComponent("miniatyrer/\(id.uuidString).jpg") }

    /// Historiken per konto, som datorns `skoll-history` / `skoll-history:<konto>`.
    func historikfil(konto: String?) -> URL {
        guard let konto, !konto.isEmpty else { return mapp.appendingPathComponent("historik.json") }
        let rent = String(konto.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? Character($0) : "_" }.prefix(64))
        return mapp.appendingPathComponent("historik-\(rent).json")
    }

    // MARK: - Läsa och skriva

    func las<T: Decodable>(_ typ: T.Type, fran fil: URL) -> T? {
        guard let d = try? Data(contentsOf: fil) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }

    func lasData(_ fil: URL) -> Data? { try? Data(contentsOf: fil) }

    func skriv<T: Encodable>(_ varde: T, till fil: URL) {
        let kodare = JSONEncoder()
        kodare.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let d = try? kodare.encode(varde) else { return }
        skrivData(d, till: fil)
    }

    /// `nil` tar bort filen.
    func skrivData(_ data: Data?, till fil: URL) {
        Self.ko.async {
            if let data {
                try? data.write(to: fil, options: [.atomic])
            } else {
                try? FileManager.default.removeItem(at: fil)
            }
        }
    }

    /// Väntar tills alla skrivningar som redan lagts i kön är klara (för självtestet och när appen går i bakgrunden).
    func vantaPaSkrivningar() { Self.ko.sync {} }

    func sparaMiniatyr(_ bild: UIImage, id: UUID) {
        skrivData(bild.jpegData(compressionQuality: 0.62), till: miniatyrfil(id))
    }

    func lasMiniatyr(_ id: UUID) -> UIImage? { UIImage(contentsOfFile: miniatyrfil(id).path) }

    func taBortFlikfiler(_ id: UUID) {
        skrivData(nil, till: tillstandsfil(id))
        skrivData(nil, till: miniatyrfil(id))
    }
}

// MARK: - Sessionen

/// En flik som den sparas mellan starterna.
struct Sparflik: Codable, Sendable, Hashable {
    var id: UUID
    var url: String?
    var titel: String
    var favikon: String?
    var bakat: Bool
    var framat: Bool
    var zoom: Double?
    var skrivbord: Bool?
    /// Millisekunder sedan 1970, som datorns tidsstämplar.
    var skapad: Double
    var aktiv: Double
    var oppnadAv: UUID?
}

struct Sparsession: Codable, Sendable {
    var version = 1
    var aktiv: UUID?
    var flikar: [Sparflik]
    var sparad: Double
}

/// En stängd flik som går att öppna igen (datorns `closedTabs`, högst 25, bara vanliga flikar med en adress).
struct StangdFlik: Sendable {
    let url: URL
    let titel: String
    let favikon: String?
    let tillstand: Data?
    let index: Int
    let skrivbord: Bool
    let zoom: Double
}

extension Date {
    /// Millisekunder sedan 1970 (datorns `Date.now()`).
    var flikMs: Double { (timeIntervalSince1970 * 1000).rounded() }
    init(flikMs: Double) { self.init(timeIntervalSince1970: flikMs / 1000) }
}
