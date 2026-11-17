import Foundation
import UIKit
import WebKit

/// Falks sida i appen: datorns `krypto.html` (yta `falk`) med Falks iPhone-anpassning ovanpå, `Bunt/falk-ios.css`
/// och `Bunt/falk-ios.js`. Datorns fil ändras inte.
///
/// Skripten läggs in som användarskript i Falks webbvy när Brygga förbereder en navigering (startdatan `falk:ios`
/// byggs då, se `Falk`). Hittas inte webbvyn just då sprutas de in med `callAsyncJavaScript` vid sidans första
/// anrop i stället (`sakerstall`); skriptet gör inget andra gången (`window.__falkIos`).
///
/// Ägare: Falk.
@MainActor
enum FalkSida {
    private final class Svag {
        weak var vy: WKWebView?
        init(_ v: WKWebView) { vy = v }
    }

    private static var kanda: [ObjectIdentifier: Svag] = [:]
    /// Webbvyer vars nuvarande dokument har (eller får) Falks skript.
    private static var klara: Set<ObjectIdentifier> = []
    private static var minne: (css: String, js: String)?
    private static let logg = Logg("Falk")

    // MARK: - Skripten

    static func kallkod() -> (css: String, js: String)? {
        if let m = minne { return m }
        guard let c = Bunt.data("Falk", "falk-ios.css").flatMap({ String(data: $0, encoding: .utf8) }),
              let j = Bunt.data("Falk", "falk-ios.js").flatMap({ String(data: $0, encoding: .utf8) }) else {
            logg.fel("saknar Falk/falk-ios.css eller falk-ios.js i appen")
            return nil
        }
        let m = (css: c, js: j + "\n//# sourceURL=adraze-app://localhost/falk-ios.js\n")
        minne = m
        return m
    }

    /// Lägger in stilen först i dokumentet (falk-ios.js flyttar den sist i `<head>`, efter datorns stil).
    static func cssSkript(_ css: String) -> String {
        """
        (function () { if (document.getElementById('falk-ios-css')) return;
          var s = document.createElement('style'); s.id = 'falk-ios-css'; s.textContent = \(JSONVarde.text(css).jsonText);
          (document.head || document.documentElement).appendChild(s); })();
        """
    }

    // MARK: - Inför en navigering

    /// Startdatan för Falks sida byggs: lägg in skripten i webbvyn (Brygga har just tömt dess användarskript).
    static func forbered(_ kalla: BryggKalla) {
        guard kalla.yta == "falk", let id = kalla.webbvy else { return }
        klara.remove(id)
        guard let vy = webbvy(id), let k = kallkod() else { return }
        let uc = vy.configuration.userContentController
        uc.addUserScript(WKUserScript(source: cssSkript(k.css), injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        uc.addUserScript(WKUserScript(source: k.js, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .page))
        klara.insert(id)
    }

    /// Sidan anropar Falk: har dokumentet inte fått skripten (webbvyn hittades inte när navigeringen förbereddes)
    /// sprutas de in nu.
    static func sakerstall(_ kalla: BryggKalla) {
        guard kalla.yta == "falk", let id = kalla.webbvy, !klara.contains(id), let vy = webbvy(id), let k = kallkod() else { return }
        klara.insert(id)
        logg.info("skripten sprutas in i efterhand")
        let js = cssSkript(k.css) + "\n" + k.js + "\nreturn true;"
        vy.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { r in
            if case .failure(let e) = r { Logg("Falk").varning("falk-ios.js: \(e.localizedDescription)") }
        }
        // Användarskripten finns kvar till nästa navigering i samma vy (omladdning, språkbyte)
        let uc = vy.configuration.userContentController
        uc.addUserScript(WKUserScript(source: cssSkript(k.css), injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        uc.addUserScript(WKUserScript(source: k.js, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .page))
    }

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
