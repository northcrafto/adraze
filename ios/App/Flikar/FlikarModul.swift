import Foundation
import UIKit

/// Flikar: flikarna med var sin WKWebView, navigering, privata flikar, sovande flikar, historik, bokmärken,
/// nedladdningar, kontextmeny, dialoger och felsidor. Byter `EnkelFlikHanterare` mot `Flikmotor` med
/// `app.ersatt(flikar:)`.
///
/// Andra moduler når allt genom `app.flikar` (protokollen i `Gemensamt/Flik.swift`) och bryggkanalerna i
/// `Flikkanaler` (historik, bokmärken, förslag, nedladdningar, zoom, skrivbordsläge, sök på sidan), aldrig
/// genom klasserna här.
///
/// Ägare: Flikar.
final class FlikarModul: NSObject, AppModul {
    static let namn = "Flikar"
    static let ordning = 20

    static func registrera(i app: AppMiljo) {
        // Självtester (alla -mode, även andras) får en egen tom lagring, så att varje test börjar med en tom flik
        // och aldrig rör de riktiga flikarna, historiken eller bokmärkena.
        let lagring = app.startargument.lage == nil ? Fliklagring.standard() : Fliklagring.forSjalvtest()
        let motor = Flikmotor(app: app, lagring: lagring)
        motor.aterstall()
        app.ersatt(flikar: motor)
        Flikkanaler.registrera(motor, i: app)
        app.labb.registrera("flikar", beskrivning: "Tre flikar mot lokala sidor, byte, bakåt/framåt, privat flik, nedladdning, "
                            + "historik, dialoger, felsida, zoom, sovande flikar och återställning efter omstart") { k in
            try await FlikarProv.kor(k)
        }
    }

    static func starta(i app: AppMiljo) async {
        (app.flikar as? Flikmotor)?.starta()
    }
}

// Flikars händelser (FlikOppnad, FlikStangd, FlikAktiverad …) ligger i Gemensamt/Handelser.swift.
