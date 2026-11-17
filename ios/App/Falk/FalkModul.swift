import Foundation

/// Falk, AdRazes AI-assistent (steg 6): datorns Falk-panel som ark eller helskärm, frågor med strömmande svar,
/// frågor om sidan i den aktiva fliken, samtalshistorik, Inställningar › Falk och textbilagor.
///
/// - Menyns plats "Falk" (`Platser.falk`) öppnar Falk.
/// - Kanalerna (`krypto:*`, `anpassa-falk:*`, `falk-inst:*`, `falk:*`) gäller bara yta `falk` (se `Falk`).
/// - Självtestet: `-mode falk` (mot en lokal testserver, aldrig den riktiga AI-tjänsten).
///
/// Ägare: Falk.
final class FalkModul: NSObject, AppModul {
    static let namn = "Falk"
    static let ordning = 70

    @MainActor static func registrera(i app: AppMiljo) {
        let falk = Falk(app: app)
        falk.registrera()
        app.ersatt(plats: Platser.falk, titel: "Falk") { falk.visa() }
        app.labb.registrera("falk", beskrivning: "Falk mot en lokal testserver med strömmande svar: fråga, svaret strömmar, "
            + "fråga om en lokal testsida (sidans text följer med), samtycket, utloggat läge, helskärm, ljust och mörkt") { k in
            try await FalkProv.kor(k)
        }
    }

    @MainActor static func starta(i app: AppMiljo) async {}
}
