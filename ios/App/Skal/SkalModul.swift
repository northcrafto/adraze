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
        // Startsidan visas i varje tom flik: börja ladda den medan appen ritar sin första ruta (kallstarten).
        // -forladda 0 stänger av det (för att mäta skillnaden).
        if app.startargument.tal("forladda") != 0 { app.sidor.forbered("startsida") }

        prenumerationer = [
            app.handelser.lyssna(SidaLaddad.self) { h in skal.sidaLaddad(h) },
            app.handelser.lyssna(FlikNavigerade.self) { h in
                if h.flik == app.flikar.aktivId { skal.expandera() }
            },
            app.handelser.lyssna(SkalVisa.self) { h in skal.visa(h.yta) },
        ]

        app.labb.registrera("skal", beskrivning: "Skalet: lokal sida, flikväxlaren, menyn, adressfältet, accenter, mörkt läge, raden uppe, liggande, tyska och stor text") { k in
            try await SkalProv.kor(k, skal: skal)
        }
    }

    /// Visar första fliken datorns startsida (tom och inte privat): startbilden väntar tills den syns, så att
    /// gorillan öppnar sig direkt mot startsidan i stället för mot dess mörka platshållare.
    static func starta(i app: AppMiljo) async {
        let flik = app.flikar.aktiv
        if app.sidor.finns("startsida"), flik == nil || (flik?.url == nil && flik?.privat == false) {
            app.startbild.vanta("startsida")
        }
    }
}
