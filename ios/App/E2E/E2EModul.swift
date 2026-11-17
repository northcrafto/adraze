import SwiftUI

/// End-to-end-krypteringen i chatten (plan 4). Kopplar in sig i Chatt när appen startar, utan att Chatt beror på
/// den här mappen: `ChattModul.lagerFabrik` ger `ChattV2` i stället för `ChattV1`, och två små krokar visar raden
/// överst i varje konversation och hänglåset i inkorgen. Byggs appen utan App/E2E går chatten som förut (v1).
///
/// Självtestet `-mode e2e` (se `E2EProv`) kör iPhonen mot en Node-klient med datorns E2E-modul genom en lokal
/// testserver med `/chatt/v2`.
///
/// Ägare: E2E.
final class E2EModul: NSObject, AppModul {
    static let namn = "E2E"
    static let ordning = 59

    @MainActor static func registrera(i app: AppMiljo) {
        ChattModul.lagerFabrik = { ChattV2(app: $0) }
        ChattModul.konversationsrad = { lage, konv in AnyView(E2EKonversationsrad(lage: lage, konv: konv)) }
        ChattModul.konversationsfot = { lage, konv in AnyView(E2EKonversationsfot(lage: lage, konv: konv)) }
        ChattModul.inkorgsknapp = { lage in AnyView(E2EInkorgsknapp(lage: lage)) }
        app.labb.registrera("e2e", beskrivning: "E2E-chatten mot en Node-klient (datorns modul) genom en lokal testserver med /chatt/v2: 1:1 och grupp åt båda hållen, bilaga, säkerhetsnummer, länkning, återställning, ändrad identitet, manipulerat, uppspelat och fel enhet, och att servern bara har chiffer") { k in
            try await E2EProv.kor(k)
        }
        Logg("E2E").info("kärnan \(E2EKarna.version)")
    }
}
