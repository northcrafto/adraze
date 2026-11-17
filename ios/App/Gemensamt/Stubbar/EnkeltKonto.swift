import Foundation
import Observation

/// Enkel ersättning för Konto tills `App/Konto/` finns: ingen inloggning, men läser en token och kontouppgifter
/// som redan ligger i Keychain (`konto.token`, `konto.uppgifter`), så att andra moduler kan provas mot ett konto.
/// Byts av Konto med `app.ersatt(konto:)`. Konto bör använda samma namn i Keychain.
///
/// Ägare: Grund.
@MainActor
@Observable
final class EnkeltKonto: KontoTjanst {
    /// Namnen i Keychain (`Nyckelring`).
    static let tokenNamn = "konto.token"
    static let uppgifterNamn = "konto.uppgifter"

    private(set) var konto: Kontouppgifter?
    private(set) var harToken = false
    /// Felet från Keychain när appen startade, om något (till exempel -34018 i osignerade byggen).
    private(set) var keychainfel: String?

    var arInloggad: Bool { harToken }

    init() {
        do {
            harToken = try Nyckelring.hamta(konto: Self.tokenNamn) != nil
            if let d = try Nyckelring.hamta(konto: Self.uppgifterNamn) {
                konto = try? JSONDecoder().decode(Kontouppgifter.self, from: d)
            }
        } catch {
            keychainfel = String(describing: error)
            Logg("Konto").varning("kunde inte läsa Keychain: \(error)")
        }
    }

    func token() async -> String? {
        guard let d = try? Nyckelring.hamta(konto: Self.tokenNamn) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    func loggaUt() async {
        try? Nyckelring.radera(konto: Self.tokenNamn)
        try? Nyckelring.radera(konto: Self.uppgifterNamn)
        konto = nil
        harToken = false
        AppMiljo.delad?.handelser.skicka(KontoAndrades(inloggad: false))
    }
}
