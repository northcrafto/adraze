import Foundation

/// Falk, AdRazes AI-assistent (steg 6): datorns Falk-panel som ark eller helskärm, frågor med strömmande svar,
/// frågor om sidan i den aktiva fliken, samtalshistorik, Inställningar › Falk och textbilagor.
///
/// - Menyns plats "Falk" (`Platser.falk`) öppnar Falk.
/// - Kanalerna (`krypto:*`, `anpassa-falk:*`, `falk-inst:*`, `falk:*`) gäller bara yta `falk` (se `Falk`).
/// - Självtestet: `-mode falk` (mot en lokal testserver, aldrig den riktiga AI-tjänsten).
/// - `falk:prov` (bara yta `labb`, för helhetstestet): `{ starta: true }` startar testservern på 127.0.0.1 och låter
///   Falk fråga den med kontots token, `{ stoppa: true }` tar bort den. Svarar med antalet frågor och om den senaste
///   hade sidan med (`aktuellFlik`).
///
/// Ägare: Falk.
final class FalkModul: NSObject, AppModul {
    static let namn = "Falk"
    static let ordning = 70

    @MainActor private static var provserver: FalkProvserver?

    @MainActor static func registrera(i app: AppMiljo) {
        let falk = Falk(app: app)
        falk.registrera()
        app.ersatt(plats: Platser.falk, titel: "Falk") { falk.visa() }
        app.labb.registrera("falk", beskrivning: "Falk mot en lokal testserver med strömmande svar: fråga, svaret strömmar, "
            + "fråga om en lokal testsida (sidans text följer med), samtycket, utloggat läge, helskärm, ljust och mörkt") { k in
            try await FalkProv.kor(k)
        }
        app.brygga.hantera("falk:prov", ytor: ["labb"]) { anrop in
            let a = anrop.argument.first ?? .null
            if a["stoppa"].bool == true {
                provserver?.stoppa()
                provserver = nil
                FalkKlient.basOverride = nil
                FalkKlient.session = FalkKlient.gorSession()
            } else if a["starta"].bool == true, provserver == nil {
                let s = FalkProvserver()
                s.godtaAllaToken = true
                let port = try await s.starta()
                provserver = s
                FalkKlient.basOverride = URL(string: "http://127.0.0.1:\(port)")
                FalkKlient.session = FalkKlient.gorSession(protokoll: [LokalHTTP.self])
            }
            let fragor = provserver?.fragor ?? []
            return ["igang": .bool(provserver != nil), "fragor": .tal(Double(fragor.count)),
                    "aktuellFlik": .bool(fragor.last?.jsonText.contains("AKTUELL FLIK") ?? false)]
        }
    }

    @MainActor static func starta(i app: AppMiljo) async {}
}
