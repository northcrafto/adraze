import Foundation
import SwiftUI

/// Skal-modulen: allt synligt runt webbsidan. Byter grundens enkla skal mot `SkalVy` och registrerar
/// självtestet `-mode skal`.
///
/// Språket följer `sprak.val` (Gemensamt/Sprak.swift); `-sprak <kod>` väljer ett annat vid start.
///
/// Ägare: Skal.
final class SkalModul: NSObject, AppModul {
    static let namn = "Skal"
    static let ordning = 50

    /// Skalets läge (en per app).
    private(set) static var lage: SkalLage?
    private static var prenumerationer: [Prenumeration] = []

    static func registrera(i app: AppMiljo) {
        let skal = SkalLage(app: app)
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
