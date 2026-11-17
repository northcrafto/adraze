import ObjectiveC
import SwiftUI
import UIKit

/// Statusradens stil (klockan och batteriet) över huvudvyn. En modul som lägger något mörkt eller ljust under
/// statusraden sätter `app.statusrad` (Skal: startsidans bild går ända upp), och sätter tillbaka `.auto` när
/// det inte längre syns:
///
///     app.statusrad = visarStartsidan ? .ljus : .auto
///
/// `.auto` = systemets val efter ljust eller mörkt läge. Ark och helskärmar ovanpå (Bryggans `AdrazeSida`)
/// bestämmer själva som vanligt i UIKit.
///
/// Ägare: Grund (Gemensamt).
enum Statusradsstil: String, Sendable {
    case auto
    /// Ljus text, för mörkt innehåll under statusraden.
    case ljus
    /// Mörk text, för ljust innehåll under statusraden.
    case mork
}

/// Lägger `app.statusrad` på fönstrets rotvy. SwiftUI har ingen modifierare för statusradens stil (bara
/// `statusBarHidden` och `toolbarColorScheme`, som kräver en synlig navigeringsrad), och appens rotkontroller
/// skapas av SwiftUI. Därför byts `preferredStatusBarStyle` och `childForStatusBarStyle` ut på just den
/// kontrollerns klass; med `.auto` anropas SwiftUIs egna.
///
/// Ägare: Grund.
@MainActor
enum Statusrad {
    /// Läses av utbytesmetoderna, som UIKit anropar på huvudtråden.
    nonisolated(unsafe) private static var stil: Statusradsstil = .auto
    private static weak var fonster: UIWindow?
    private static var klasser = Set<ObjectIdentifier>()

    /// Fönstret som `RotVy` ligger i.
    static func folj(_ f: UIWindow) {
        fonster = f
        uppdatera()
    }

    static func satt(_ ny: Statusradsstil) {
        stil = ny
        uppdatera()
    }

    /// Stilen som rotvyn just nu ger UIKit (för självtesten).
    static var aktuell: UIStatusBarStyle? { fonster?.rootViewController?.preferredStatusBarStyle }

    private static func uppdatera() {
        guard let rot = fonster?.rootViewController else { return }
        if stil != .auto { installera(i: type(of: rot)) }
        rot.setNeedsStatusBarAppearanceUpdate()
    }

    private static func installera(i klass: AnyClass) {
        guard klasser.insert(ObjectIdentifier(klass)).inserted else { return }

        let stilSel = #selector(getter: UIViewController.preferredStatusBarStyle)
        if let m = class_getInstanceMethod(klass, stilSel) {
            typealias Original = @convention(c) (UIViewController, Selector) -> UIStatusBarStyle
            let original = unsafeBitCast(method_getImplementation(m), to: Original.self)
            let ny: @convention(block) (UIViewController) -> UIStatusBarStyle = { vc in
                switch Statusrad.stil {
                case .ljus: return .lightContent
                case .mork: return .darkContent
                case .auto: return original(vc, stilSel)
                }
            }
            class_replaceMethod(klass, stilSel, imp_implementationWithBlock(ny), method_getTypeEncoding(m))
        }

        let barnSel = #selector(getter: UIViewController.childForStatusBarStyle)
        if let m = class_getInstanceMethod(klass, barnSel) {
            typealias Original = @convention(c) (UIViewController, Selector) -> UIViewController?
            let original = unsafeBitCast(method_getImplementation(m), to: Original.self)
            let ny: @convention(block) (UIViewController) -> UIViewController? = { vc in
                Statusrad.stil == .auto ? original(vc, barnSel) : nil
            }
            class_replaceMethod(klass, barnSel, imp_implementationWithBlock(ny), method_getTypeEncoding(m))
        }
    }
}

/// Temats ljusa eller mörka läge på hela fönstret (`overrideUserInterfaceStyle`). Ark och helskärmar som visas
/// ovanpå (Anpassa, kontot, chatten, Falk, chattens egna ark) får sina egenskaper från fönstret, inte från vyn
/// som visar dem, så utan det här blev ett ark ljust ovanpå en mörk app. Byts läget medan appen syns tonas hela
/// fönstret över på 0,3 s (direkt med Minska rörelse). Sätts av `RotVy` (`tema.uiStil`).
///
/// Ägare: Grund.
@MainActor
enum Fonstertema {
    private static weak var fonster: UIWindow?
    private static var stil: UIUserInterfaceStyle = .unspecified

    static func folj(_ f: UIWindow) {
        fonster = f
        if f.overrideUserInterfaceStyle != stil { f.overrideUserInterfaceStyle = stil }
    }

    static func satt(_ ny: UIUserInterfaceStyle) {
        let fore = stil
        stil = ny
        guard let f = fonster, f.overrideUserInterfaceStyle != ny else { return }
        let fran = f.traitCollection.userInterfaceStyle
        let till = ny == .unspecified ? (f.windowScene?.traitCollection.userInterfaceStyle ?? fran) : ny
        if fore == ny || fran == till || UIAccessibility.isReduceMotionEnabled || f.isHidden || f.windowScene?.activationState != .foregroundActive {
            f.overrideUserInterfaceStyle = ny
        } else {
            UIView.transition(with: f, duration: 0.3, options: [.transitionCrossDissolve, .allowUserInteraction, .beginFromCurrentState]) {
                f.overrideUserInterfaceStyle = ny
            }
        }
    }

    /// Fönstrets läge just nu (för självtesten).
    static var aktuell: UIUserInterfaceStyle? { fonster?.overrideUserInterfaceStyle }
}

/// Hittar fönstret som en SwiftUI-vy ligger i (för `Statusrad`).
struct Fonstersond: UIViewRepresentable {
    let hittat: @MainActor (UIWindow) -> Void

    func makeUIView(context: Context) -> Sond {
        let v = Sond()
        v.hittat = hittat
        v.isUserInteractionEnabled = false
        v.isAccessibilityElement = false
        return v
    }

    func updateUIView(_ v: Sond, context: Context) { v.hittat = hittat }

    final class Sond: UIView {
        var hittat: (@MainActor (UIWindow) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window { hittat?(window) }
        }
    }
}
