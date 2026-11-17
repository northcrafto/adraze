import Foundation
import UIKit

/// Brygga och webb-UI (steg 4, del 3 avsnitt 3.4): schemat `adraze-app://localhost`, bryggan `adraze`,
/// preload-shimmen, startdatan och datorns Anpassa och startsida i webbvyer.
///
/// Andra moduler visar en AdRaze-sida utan att känna till klasserna här, med bryggkanalen `sida:visa`
/// (från Swift eller från en annan AdRaze-sida):
///
///     _ = try? await app.brygga.anropa("sida:visa", [["yta": "anpassa", "kategori": "utseende", "lage": "ark"]],
///                                      fran: BryggKalla(yta: "skal"))
///     _ = try? await app.brygga.anropa("sida:stang", [["yta": "anpassa"]], fran: BryggKalla(yta: "skal"))
///
/// Ytor: `anpassa` (inställningarna; `kategori` = utseende, anpassa, sok, sprak, integritet, om …), `startsida`
/// (ny flik), `falk` (krypto.html), `chatt` (chatt.html). Läge: `ark` (standard) eller `helskarm`.
///
/// Ägare: Brygga och webb-UI.
final class BryggaModul: NSObject, AppModul {
    static let namn = "Brygga"
    static let ordning = 20

    static func registrera(i app: AppMiljo) {
        let transport = BryggTransport(app: app)
        BryggKanaler.registrera(i: app, transport: transport)
        app.ersatt(sidor: Bryggsidor(transport: transport))
        // Menyns Anpassa: datorns inställningar som ark
        app.ersatt(plats: Platser.anpassa, titel: "Anpassa") { AdrazeSidor.visa("anpassa", som: .ark) }
        app.labb.registrera("brygga", beskrivning: "Schemat, bryggan, startdatan, Anpassa och startsidan i webbvy") { k in
            try await BryggaProv.kor(k)
        }
    }
}
