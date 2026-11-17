import Foundation
import Observation
import Security

/// Inloggningen på AdRaze-kontot. Kontraktet mellan Konto (som loggar in) och alla som behöver veta vem
/// användaren är eller behöver en token mot `api.adraze.app` (Brygga, Chatt, Falk).
///
/// Klasser som uppfyller protokollet ska vara `@Observable`. När inloggningen ändras skickas `KontoAndrades`
/// på `app.handelser`. Token och nycklar sparas bara i Keychain (`Nyckelring`), aldrig i UserDefaults, filer
/// eller webbvyernas datalager.
///
/// Ägare: Grund (Gemensamt). Riktig implementation: Konto (`App/Konto/`). Ersättning tills dess: `EnkeltKonto`,
/// som bara läser en token som redan ligger i Keychain.
@MainActor
protocol KontoTjanst: AnyObject, Observable {
    var arInloggad: Bool { get }
    /// Uppgifterna om kontot, `nil` = inte inloggad.
    var konto: Kontouppgifter? { get }
    /// En giltig åtkomsttoken (förnyas av tjänsten vid behov), `nil` = inte inloggad.
    func token() async -> String?
    func loggaUt() async
}

/// Det appen vet om kontot. Inget hemligt här; token ligger i Keychain.
struct Kontouppgifter: Codable, Sendable, Hashable {
    let id: String
    var namn: String?
    var epost: String?
    /// Barnkonto (styr barnläget).
    var barn: Bool = false
}

// MARK: - Keychain

/// En enkel väg till Keychain för generiska lösenord. Allt sparas för den här enheten och bara när den är upplåst
/// minst en gång sedan omstart (`AfterFirstUnlockThisDeviceOnly`), så att det inte följer med i säkerhetskopior
/// till en annan telefon.
///
///     try Nyckelring.spara(Data(token.utf8), konto: "konto.token")
///     let data = try Nyckelring.hamta(konto: "konto.token")
///
/// Namnen (`konto`) delas av hela appen: använd modulens prefix (`konto.`, `chatt.`, `falk.`).
///
/// Ägare: Grund (Gemensamt).
enum Nyckelring {
    static let tjanst = "app.adraze.browser"

    struct Fel: Error, CustomStringConvertible {
        let status: OSStatus
        var description: String {
            let text = (SecCopyErrorMessageString(status, nil) as String?) ?? "okänt"
            return "Keychain \(status): \(text)"
        }
    }

    static func spara(_ data: Data, konto: String, tjanst: String = Nyckelring.tjanst) throws {
        let fraga: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: tjanst, kSecAttrAccount as String: konto]
        let andra: [String: Any] = [kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(fraga as CFDictionary, andra as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(fraga.merging(andra) { $1 } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw Fel(status: status) }
    }

    /// `nil` = finns inte.
    static func hamta(konto: String, tjanst: String = Nyckelring.tjanst) throws -> Data? {
        let fraga: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: tjanst, kSecAttrAccount as String: konto,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var ut: CFTypeRef?
        let status = SecItemCopyMatching(fraga as CFDictionary, &ut)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw Fel(status: status) }
        return ut as? Data
    }

    static func radera(konto: String, tjanst: String = Nyckelring.tjanst) throws {
        let fraga: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: tjanst, kSecAttrAccount as String: konto]
        let status = SecItemDelete(fraga as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Fel(status: status) }
    }
}
