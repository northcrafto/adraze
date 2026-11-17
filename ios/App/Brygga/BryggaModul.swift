import Foundation
import UIKit

extension Nycklar {
    /// Språket i AdRaze-UI:t: en kod ur datorns språkfiler (`en`, `zh-TW` …) eller tomt = telefonens språk.
    /// På datorn ligger valet i fönstrets localStorage (`adraze-lang`); här i butiken, så att även native delar ser det.
    static let sprakVal = Nyckel<String>("sprak.val", standard: "", etikett: "Språk", importbar: false, historik: false)
}

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
        app.installningar.registrera(Nycklar.sprakVal)
        let transport = BryggTransport(app: app)
        BryggKanaler.registrera(i: app, transport: transport)
        app.labb.registrera("brygga", beskrivning: "Schemat, bryggan, startdatan, Anpassa och startsidan i webbvy") { k in
            try await BryggaProv.kor(k)
        }
    }
}
