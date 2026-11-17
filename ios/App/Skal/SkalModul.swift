import Foundation
import SwiftUI

/// Skal-modulen: allt synligt runt webbsidan. Byter grundens enkla skal mot `SkalVy` och registrerar
/// självtestet `-mode skal`.
///
/// Startargument: `-sprak <kod>` väljer språk för skalets texter (standard `sv`).
///
/// Ägare: Skal.
final class SkalModul: NSObject, AppModul {
    static let namn = "Skal"
    static let ordning = 50

    /// Skalets läge (en per app).
    private(set) static var lage: SkalLage?
    private static var prenumerationer: [Prenumeration] = []

    static func registrera(i app: AppMiljo) {
        if let kod = app.startargument.text("sprak") { Sprak.delad.byt(till: kod) }
        // I självtesterna hamnar historik och bokmärken bara i minnet.
        let bibliotek = Bibliotek(fil: app.startargument.lage == nil ? Bibliotek.standardfil : nil)
        let skal = SkalLage(app: app, bibliotek: bibliotek)
        lage = skal
        app.ersatt(huvudvy: "Skal") { SkalVy(skal: skal) }

        prenumerationer = [
            app.handelser.lyssna(SidaLaddad.self) { h in skal.sidaLaddad(h) },
            app.handelser.lyssna(FlikNavigerade.self) { h in
                if h.flik == app.flikar.aktivId { skal.expandera() }
            },
        ]

        app.labb.registrera("skal", beskrivning: "Skalet: lokal sida, flikväxlaren, menyn, adressfältet, accenter, mörkt läge, raden uppe, liggande, tyska och stor text") { k in
            try await SkalProv.kor(k, skal: skal)
        }
    }
}
