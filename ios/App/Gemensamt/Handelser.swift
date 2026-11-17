import Foundation

/// En händelse mellan modulerna: "något har hänt". Den som skickar vet inte vem som lyssnar.
///
/// Varje modul får definiera egna händelsetyper i sin egen mapp:
///
///     struct NedladdningKlar: AppHandelse { let fil: URL }
///
///     app.handelser.skicka(NedladdningKlar(fil: url))
///
///     // spara prenumerationen – släpps den slutar lyssnandet
///     prenumeration = app.handelser.lyssna(NedladdningKlar.self) { h in visa(h.fil) }
///
/// Händelser som flera moduler behöver finns längst ned i den här filen. Allt körs på huvudtråden.
///
/// Ägare: Grund (Gemensamt).
protocol AppHandelse: Sendable {}

/// Håller ett lyssnande vid liv. Släpps den, eller anropas `avsluta()`, slutar lyssnandet.
final class Prenumeration: @unchecked Sendable {
    private let las = NSLock()
    private var avslut: (@Sendable () -> Void)?

    init(_ avslut: @escaping @Sendable () -> Void) { self.avslut = avslut }

    func avsluta() {
        las.lock()
        let a = avslut
        avslut = nil
        las.unlock()
        a?()
    }

    deinit { avsluta() }
}

/// Händelsebussen. Finns som `app.handelser`.
@MainActor
final class Handelser {
    private var lyssnare: [ObjectIdentifier: [UUID: @MainActor (any AppHandelse) -> Void]] = [:]

    /// Skickar en händelse till alla som lyssnar på dess typ, direkt (synkront) på huvudtråden.
    func skicka<H: AppHandelse>(_ handelse: H) {
        guard let alla = lyssnare[ObjectIdentifier(H.self)] else { return }
        for f in alla.values { f(handelse) }
    }

    /// Lyssnar på en händelsetyp. Spara prenumerationen så länge du vill lyssna.
    func lyssna<H: AppHandelse>(_ typ: H.Type, _ f: @escaping @MainActor (H) -> Void) -> Prenumeration {
        let id = UUID()
        let nyckel = ObjectIdentifier(typ)
        lyssnare[nyckel, default: [:]][id] = { h in
            if let h = h as? H { f(h) }
        }
        return Prenumeration { [weak self] in
            Task { @MainActor in self?.lyssnare[nyckel]?[id] = nil }
        }
    }
}

// MARK: - Händelser som flera moduler använder

/// Appen bytte läge. Skickas av AppMiljo (från SwiftUI:s scenePhase).
struct AppFasAndrad: AppHandelse {
    enum Fas: String, Sendable { case aktiv, inaktiv, bakgrund }
    let fas: Fas
}

/// En inställning ändrades (av användaren, bryggan, en import eller ångra). Skickas av `Installningar`.
/// `varde` är det som gäller nu (med standard ifyllt), `sparat` det som ligger sparat (nil = standard),
/// vilket är det datorns `anpassa:andrad` skickar till webbsidorna.
struct InstallningAndrad: AppHandelse {
    let nyckel: String
    let varde: JSONVarde
    let sparat: JSONVarde?
}

/// En flik har bytt sida: huvudramen har bekräftat en ny adress (didCommit). Skickas av Flikar.
struct FlikNavigerade: AppHandelse {
    let flik: UUID
    let url: URL
    let privat: Bool
}

/// En sida har laddats klart i en flik (didFinish). Skickas av Flikar.
struct SidaLaddad: AppHandelse {
    let flik: UUID
    let url: URL
    let titel: String
    let privat: Bool
}

/// Skyddet stoppade en hel sida (WebKit-fel 104). Skickas av Skydd när Flikar anropar
/// `skydd.huvudsidaBlockerad(_:flik:)`.
struct HuvudsidaBlockerad: AppHandelse {
    let flik: UUID
    let url: URL
}

/// Inloggningen ändrades (in, ut, annat konto). Skickas av Konto.
struct KontoAndrades: AppHandelse {
    let inloggad: Bool
}
