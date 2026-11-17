import SwiftUI
import UIKit

/// E2E:s ark (översikten, säkerhetsnumren, länkningen) visas med UIKit ovanpå det som syns, som `ChattVisning` visar
/// chatten, och inte med SwiftUI:s `.sheet` på en vy i chatten. Inkorgens knapp ligger i en rad i listan och
/// konversationens kort i en lat stack: när de byggdes om (till exempel när temat byttes) tappade arket sitt läge, så
/// att länkningen eller koden försvann mitt i. Arket följer dessutom temat själv; ark ovanpå chatten får annars sina
/// egenskaper från fönstret och inte från chatten.
///
///     E2EArk.visa(app, E2EOversikt(v2: v2))
///
/// Ägare: E2E.
@MainActor
enum E2EArk {
    private static let visade = NSHashTable<E2EArkkontroller>.weakObjects()

    /// Visar `vy` som ett helt ark (AdRazes hörn och handtag) ovanpå det som syns.
    static func visa<V: View>(_ app: AppMiljo, _ vy: V) {
        guard let topp = ChattVisning.topp() else { return }
        let k = E2EArkkontroller(rootView: AnyView(E2EArkrot(vy: vy).environment(app).environment(app.tema)))
        AdrazeArk.forbered(k)
        k.folj(app.tema)
        k.view.backgroundColor = app.tema.ui(.bakgrund)
        visade.add(k)
        topp.present(k, animated: true)
    }

    /// Ett E2E-ark är framme.
    static var visas: Bool { !framme.isEmpty }

    private static var framme: [E2EArkkontroller] {
        visade.allObjects.filter { $0.presentingViewController != nil && !$0.isBeingDismissed }
    }

    /// Stänger E2E-arken (och det som ligger ovanpå dem).
    static func stang() {
        guard let understa = framme.first(where: { !($0.presentingViewController is E2EArkkontroller) }) else { return }
        understa.presentingViewController?.dismiss(animated: true)
    }
}

/// Värdkontrollern för ett E2E-ark: följer temat (ljust, mörkt, system) medan det visas, som chattens.
final class E2EArkkontroller: UIHostingController<AnyView> {
    func folj(_ tema: Tema) {
        overrideUserInterfaceStyle = tema.uiStil
        withObservationTracking { _ = tema.uiStil } onChange: { [weak self] in
            Task { @MainActor [weak self] in self?.folj(tema) }
        }
    }
}

/// Arkets rot: accentfärgen som i resten av chatten.
private struct E2EArkrot<V: View>: View {
    let vy: V
    @Environment(Tema.self) private var tema

    var body: some View { vy.tint(tema.accent) }
}
