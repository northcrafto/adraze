import Foundation
import Observation
import WebKit

/// Enkel ersättning för Skydd tills `App/Skydd/` finns: blockerar ingenting, men räknar besluten så att
/// självtestet ser att Flikar frågar skyddet. Byts av Skydd med `app.ersatt(skydd:)`.
///
/// Ägare: Grund.
@MainActor
@Observable
final class IngetSkydd: SkyddTjanst {
    private(set) var lage: Skyddslage = .av
    /// Hur många gånger `beslut(for:)` har anropats.
    @ObservationIgnored private(set) var antalBeslut = 0
    @ObservationIgnored private(set) var antalForberedda = 0
    @ObservationIgnored private var pausade: Set<String> = []

    func forbered(_ webbvy: WKWebView, privat: Bool) { antalForberedda += 1 }

    func beslut(for handling: WKNavigationAction) -> Navigeringsbeslut {
        antalBeslut += 1
        return .tillat
    }

    func blockeringssida(for url: URL, flik: UUID) -> String? { nil }

    func arPausat(for vard: String) -> Bool { pausade.contains(Self.rensa(vard)) }

    func pausa(_ pausat: Bool, for vard: String) {
        if pausat { pausade.insert(Self.rensa(vard)) } else { pausade.remove(Self.rensa(vard)) }
    }

    func antalBlockerade(i flik: UUID) -> Int? { nil }

    private static func rensa(_ vard: String) -> String {
        let v = vard.lowercased()
        return v.hasPrefix("www.") ? String(v.dropFirst(4)) : v
    }
}
