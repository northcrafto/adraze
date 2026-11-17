import Foundation
import UIKit
import WebKit

/// Falks sida i appen: datorns `krypto.html` (yta `falk`) med Falks iPhone-anpassning ovanpå, `Bunt/falk-ios.css`
/// och `Bunt/falk-ios.js`. Datorns fil ändras inte. Skripten registreras med `app.brygga.skript(yta: "falk", …)`
/// (se `Falk.registrera`), och Brygga lägger in dem vid varje navigering: stilen som `#falk-ios-css`, skriptet vid
/// dokumentslut före `ios.js`. Här finns bara vägen till Falks webbvy och översta kontrollern.
///
/// Ägare: Falk.
@MainActor
enum FalkSida {
    private final class Svag {
        weak var vy: WKWebView?
        init(_ v: WKWebView) { vy = v }
    }

    private static var kanda: [ObjectIdentifier: Svag] = [:]

    // MARK: - Hitta webbvyerna

    /// Webbvyn med den identiteten (från `BryggKalla.webbvy`), om den finns i appens fönster eller dess modaler.
    static func webbvy(_ id: ObjectIdentifier) -> WKWebView? {
        if let v = kanda[id]?.vy { return v }
        kanda = kanda.filter { $0.value.vy != nil }
        for v in allaWebbvyer() where ObjectIdentifier(v) == id {
            kanda[id] = Svag(v)
            return v
        }
        return nil
    }

    /// Falks webbvy om Falk visas (eller håller på att visas).
    static func falkVy() -> WKWebView? {
        allaWebbvyer().first { $0.url?.scheme == "adraze-app" && $0.url?.path == "/falk.html" }
    }

    /// Alla webbvyer i appens fönster och i kontrollerna som visas ovanpå (även de som inte hunnit in i fönstret).
    static func allaWebbvyer() -> [WKWebView] {
        var ut: [WKWebView] = []
        var sedda = Set<ObjectIdentifier>()
        func sok(_ v: UIView) {
            if let w = v as? WKWebView {
                if sedda.insert(ObjectIdentifier(w)).inserted { ut.append(w) }
                return
            }
            for s in v.subviews { sok(s) }
        }
        for f in fonster() {
            var k = f.rootViewController
            while let x = k {
                if let v = x.viewIfLoaded { sok(v) }
                k = x.presentedViewController
            }
            sok(f)
        }
        return ut
    }

    static func fonster() -> [UIWindow] {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
    }

    /// Översta kontrollern (för Falks frågerutor).
    static func toppkontroller() -> UIViewController? {
        let alla = fonster()
        var k = (alla.first(where: \.isKeyWindow) ?? alla.first)?.rootViewController
        while let p = k?.presentedViewController, !p.isBeingDismissed { k = p }
        return k
    }
}
