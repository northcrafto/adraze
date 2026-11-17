import Foundation

/// Konto: inloggningen på AdRaze-kontot (samma som datorn) och kontoarket.
///
/// Kanaler i bryggan (så att skalet, webbsidorna och chatten kan använda kontot utan att känna till klasserna):
/// - `konto:visa` – visar kontoarket (inloggning eller kontokortet).
/// - `konto:status` – `{ inloggad, namn, epost, pro }`.
/// - `konto:logga-ut` – loggar ut.
/// - `konto:logga-in` `{ email, password }` och `konto:kod` `{ email, code }` – bara för självtesterna (yta `labb`).
///
/// Ägare: Konto.
final class KontoModul: NSObject, AppModul {
    static let namn = "Konto"
    static let ordning = 20

    @MainActor static func registrera(i app: AppMiljo) {
        let kontot = Kontot(app: app)
        app.ersatt(konto: kontot)

        app.brygga.hantera("konto:visa") { anrop in
            let start = anrop.argument.first?["epost"].text
            await MainActor.run { _ = KontoArk.visa(app, epost: start ?? "") }
            return .null
        }
        app.brygga.hantera("konto:status") { _ in
            await MainActor.run {
                .objekt(["inloggad": .bool(kontot.arInloggad), "namn": kontot.konto?.namn.map(JSONVarde.text) ?? .null,
                         "epost": kontot.konto?.epost.map(JSONVarde.text) ?? .null, "pro": .bool(kontot.pro)])
            }
        }
        app.brygga.hantera("konto:logga-ut") { _ in
            await kontot.loggaUt()
            return .null
        }
        app.brygga.hantera("konto:logga-in", ytor: ["labb"]) { anrop in
            let a = anrop.argument.first ?? .null
            let steg = try await kontot.loggaIn(epost: a["email"].text ?? "", losen: a["password"].text ?? "")
            if case .kod(_, let syfte) = steg { return .objekt(["steg": .text("kod"), "syfte": .text(syfte)]) }
            return .objekt(["steg": .text("klar")])
        }
        app.brygga.hantera("konto:kod", ytor: ["labb"]) { anrop in
            let a = anrop.argument.first ?? .null
            try await kontot.verifiera(epost: a["email"].text ?? "", kod: a["code"].text ?? "")
            return .objekt(["steg": .text("klar")])
        }
        app.labb.registrera("konto", beskrivning: "Inloggning med mejl, lösenord och kod mot en lokal testserver (-api), fel kod, betrodd enhet, kontokortet och utloggning, ljust och mörkt") { k in
            try await KontoProv.kor(k)
        }
    }

    @MainActor static func starta(i app: AppMiljo) async {
        guard let kontot = app.konto as? Kontot, kontot.arInloggad else { return }
        Task { await kontot.uppdatera() }
    }
}
