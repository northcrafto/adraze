import SwiftUI
import UIKit

/// AdRazes ark: samma storlek, hörn och handtag överallt (Anpassa och Falk från Brygga, kontot, skalets listor,
/// chattens ark), så att appen känns som en. UIKit-kontroller förbereds med `AdrazeArk.forbered(_:)`, SwiftUI-ark får
/// samma sak med `.adrazeArk()`.
///
/// Det som är lika i alla ark och helskärmar (native och webb, ios.css och falk-ios.css följer samma mått):
///  - krysset: `Stangknapp`, 40 pt rund, 16 pt från arkets kant uppe till höger (`marginal`);
///  - rubriken: Fraunces 32 pt, vikt 600 (`rubrikstorlek`, `rubrikvikt`); helskärmar som chattens inkorg och
///    flikväxlaren 34/620;
///  - stora knappar: 54 pt höga med `tema.radier.storKnapp` (16 pt med vanliga hörn), mindre 50 pt;
///  - innehållet 24 pt från sidorna i ark med en rubrik och ett formulär (Logga in, Falk utloggad).
///
///     let k = UIHostingController(rootView: …)
///     AdrazeArk.forbered(k)
///     topp.present(k, animated: true)
///
///     .sheet(isPresented: $visa) { MinVy().adrazeArk() }
///
/// Ägare: Grund (Gemensamt).
@MainActor
enum AdrazeArk {
    /// Arkens hörnradie upptill, i punkter.
    nonisolated static let horn: CGFloat = 28
    /// Rubriken i ett ark: Fraunces i den här storleken (punkter) och vikten.
    nonisolated static let rubrikstorlek: CGFloat = 32
    nonisolated static let rubrikvikt: CGFloat = 600
    /// Krysset sitter så här långt från arkets kant (den synliga cirkeln).
    nonisolated static let marginal: CGFloat = 16
    /// Innehållets avstånd från sidorna.
    nonisolated static let sidor: CGFloat = 24

    /// Helt ark (`.large`) med handtag och AdRazes hörn.
    static func forbered(_ k: UIViewController, detents: [UISheetPresentationController.Detent]? = nil) {
        k.modalPresentationStyle = .pageSheet
        guard let ark = k.sheetPresentationController else { return }
        ark.detents = detents ?? [.large()]
        ark.prefersGrabberVisible = true
        ark.preferredCornerRadius = horn
    }
}

/// Stängknappen uppe till höger i ark och helskärmar: en rund knapp (40 pt, tryckyta 44 pt) med ett kryss.
/// Samma mått som krysset i chatten, Anpassa och Falk (ios.css, falk-ios.css). Fylls med accenten underifrån medan
/// man trycker, som AdRazes andra knappar.
///
///     .overlay(alignment: .topTrailing) { Stangknapp { stang() }.padding(Stangknapp.inpassning) }
///
/// Ägare: Grund (Gemensamt).
struct Stangknapp: View {
    let gor: () -> Void
    @Environment(Tema.self) private var tema

    /// Diametern på den synliga knappen.
    static let storlek: CGFloat = 40
    /// Tryckytan runt den.
    static let tryckyta: CGFloat = 44
    /// Utfyllnaden runt knappen (med tryckytan) så att cirkeln hamnar `AdrazeArk.marginal` (16 pt) från kanten.
    static let inpassning: CGFloat = 14

    var body: some View {
        Button(action: gor) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .frame(width: Self.storlek, height: Self.storlek)
        }
        .buttonStyle(StangknappStil())
        .frame(width: Self.tryckyta, height: Self.tryckyta)
        .contentShape(Rectangle())
        .accessibilityLabel(tr("Stäng"))
    }
}

/// Krysset: textens färg på temats yta, accentens vätska stiger underifrån när man trycker.
private struct StangknappStil: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        StangknappKropp(etikett: configuration.label, tryckt: configuration.isPressed)
    }
}

private struct StangknappKropp<E: View>: View {
    let etikett: E
    let tryckt: Bool
    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska

    var body: some View {
        etikett
            .foregroundStyle(tryckt ? tema[.paAccent] : tema.text)
            .background {
                ZStack {
                    Circle().fill(tema[.yta2])
                    GeometryReader { g in
                        Circle().fill(tema.accent)
                            .frame(width: g.size.width * 1.5, height: g.size.width * 1.5)
                            .position(x: g.size.width / 2, y: g.size.height * (tryckt ? 0.5 : 1.95))
                    }
                    .clipShape(Circle())
                }
            }
            .scaleEffect(tryckt && !minska ? 0.94 : 1)
            .animation(minska ? .easeOut(duration: 0.15) : .timingCurve(0.2, 0.75, 0.25, 1, duration: tryckt ? 0.45 : 0.35), value: tryckt)
    }
}

extension View {
    /// Ett SwiftUI-ark med AdRazes hörn och handtag (samma som `AdrazeArk.forbered`).
    func adrazeArk() -> some View {
        presentationCornerRadius(AdrazeArk.horn)
            .presentationDragIndicator(.visible)
    }
}
