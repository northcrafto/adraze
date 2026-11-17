import Foundation
import ObjectiveC

/// En del av appen (Skydd, Flikar, Skal, Brygga, Konto, Chatt, Falk, Labb …). Varje mapp under `App/` har en klass
/// som uppfyller protokollet. Appen hittar den själv när den startar, så ingen behöver ändra `AdRazeApp.swift`,
/// `Gemensamt/` eller `project.yml` för att lägga till en modul:
///
///     final class SkyddModul: NSObject, AppModul {
///         static let namn = "Skydd"
///         static let ordning = 10
///         static func registrera(i app: AppMiljo) {
///             let skydd = Skydd(app: app)
///             app.ersatt(skydd: skydd)
///             app.brygga.hantera("skydd:status") { _ in .text(skydd.lage.etikett) }
///             app.labb.registrera("skydd", beskrivning: "Listorna och blocktestet") { k in try await SkyddProv.kor(k) }
///         }
///         static func starta(i app: AppMiljo) async { (app.skydd as? Skydd)?.borjaKompilera() }
///     }
///
/// Regler:
///  - Klassen måste ärva `NSObject` (appen hittar den via Objective-C-körtiden).
///  - `registrera(i:)` körs för alla moduler först, i `ordning` (lägst först, sedan namn). Där sätts tjänster,
///    bryggkanaler, inställningsnycklar och självtester. Anropa inte andra moduler där.
///  - `starta(i:)` körs efter att alla registrerat sig. Returnera snabbt; långa jobb i en egen `Task`.
///  - En modul använder andra moduler bara via `app` och protokollen i `Gemensamt/`, aldrig deras klasser direkt.
///    Då går appen att bygga utan en trasig modul (`fran-mint.sh -x Modul`) och med `-utan Modul` vid start.
///
/// Ägare: Grund (Gemensamt).
@MainActor
protocol AppModul: NSObject {
    /// Mappens namn, till exempel "Skydd".
    static var namn: String { get }
    /// Lägst registreras först. Standard 100.
    static var ordning: Int { get }
    static func registrera(i app: AppMiljo)
    static func starta(i app: AppMiljo) async
}

extension AppModul {
    static var ordning: Int { 100 }
    static func starta(i app: AppMiljo) async {}
}

/// Hittar alla `AppModul`-klasser i appens egen kod.
enum Modulsokare {
    /// Sorterade efter `ordning` och sedan namn.
    @MainActor
    static func hitta() -> [any AppModul.Type] {
        // Debugbyggen lägger koden i AdRaze.debug.dylib i stället för i själva programfilen, så vi letar i den
        // fil där en känd klass från Gemensamt ligger, inte i Bundle.main.executablePath.
        guard let bild = class_getImageName(ModulAnkare.self) else { return [] }
        var antal: UInt32 = 0
        guard let namn = objc_copyClassNamesForImage(bild, &antal) else { return [] }
        defer { free(namn) }
        var ut: [any AppModul.Type] = []
        for i in 0..<Int(antal) {
            guard let klass = objc_lookUpClass(namn[i]) else { continue }
            if let m = klass as? any AppModul.Type { ut.append(m) }
        }
        return ut.sorted { ($0.ordning, $0.namn) < ($1.ordning, $1.namn) }
    }
}

/// Bara en känd klass i appens kod, så att `Modulsokare` vet vilken fil den ska leta i.
final class ModulAnkare: NSObject {}

/// Vad som hände med en modul när appen startade.
struct Modulinfo: Sendable, Hashable {
    let namn: String
    let klass: String
    let ordning: Int
    /// Hoppades över med startargumentet `-utan`.
    var utesluten: Bool = false
    /// Millisekunder i `registrera` och `starta`.
    var registreraMs: Double = 0
    var startaMs: Double = 0

    var json: JSONVarde {
        ["namn": .text(namn), "klass": .text(klass), "ordning": .tal(Double(ordning)), "utesluten": .bool(utesluten),
         "registrera_ms": .tal(registreraMs), "starta_ms": .tal(startaMs)]
    }
}
