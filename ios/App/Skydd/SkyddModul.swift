import Foundation

/// Skyddet: regellistor, stoppsidan, paus per sajt, kosmetik, kakrutor, scriptlets, popupvakten och
/// spårningsparametrar. Byter `IngetSkydd` mot `Skydd`.
///
/// Ägare: Skydd.
final class SkyddModul: NSObject, AppModul {
    static let namn = "Skydd"
    static let ordning = 10

    static func registrera(i app: AppMiljo) {
        let skydd = Skydd(app: app)
        app.ersatt(skydd: skydd)
        app.installningar.registrera(Nycklar.skyddPausade)
        app.brygga.hantera("skydd:status") { _ in .text(skydd.lage.etikett) }
        // Startsidans siffror: datorns shell.js läser dem ur localStorage (skoll-stats), som preload-ios.js fyller
        // med det här innan sidan startar. Sedan kommer adblock:hit för varje stopp.
        app.brygga.startdata("skydd:statistik") { _ in
            .objekt(["annonser": .tal(Double(skydd.raknare.totalt)), "sparare": .tal(0), "farliga": .tal(0)])
        }
        app.brygga.hantera("skoll:adblock-state") { _ in
            .objekt(["on": .bool(true), "count": .tal(Double(skydd.raknare.session)),
                     "raknare": .bool(app.installningar[.blockRaknare])])
        }
        app.labb.registrera("skydd", beskrivning: "Listorna, blocktestet, inloggning, paus, kosmetik, scriptlets, vakten, parametrar och stoppsidan") { k in
            try await SkyddProv.kor(k)
        }
    }

    static func starta(i app: AppMiljo) async {
        (app.skydd as? Skydd)?.borjaLadda()
    }
}

extension Nycklar {
    /// Sajter där skyddet är pausat (värden utan www., gäller även underdomäner). Barnlåst, och gäller inte i
    /// barnläge. Stoppsidan för farliga sidor gäller även på en pausad sajt.
    static let skyddPausade = Nyckel<[String]>("skydd.pausade", standard: [], etikett: "Pausade sajter",
                                               barnlast: true, importbar: false)
}
