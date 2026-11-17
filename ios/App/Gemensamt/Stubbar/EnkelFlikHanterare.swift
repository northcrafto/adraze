import Foundation
import Observation
import UIKit
import WebKit

/// Enkel ersättning för Flikar tills `App/Flikar/` finns: flikar med en WKWebView var, utan historik, sovande
/// flikar, nedladdningar eller kontextmeny. Visar hur kontraktet i `Flik.swift` är tänkt att användas
/// (användaragenten, skyddet före första laddningen, händelserna). Byts av Flikar med `app.ersatt(flikar:)`.
///
/// Ägare: Grund.
@MainActor
@Observable
final class EnkelFlikHanterare: FlikHanterare {
    private(set) var flikar: [any Flik] = []
    private(set) var aktivtId: UUID?

    @ObservationIgnored weak var app: AppMiljo?

    var aktiv: (any Flik)? {
        flikar.first { $0.id == aktivtId } ?? flikar.last
    }

    @discardableResult
    func nyFlik(_ url: URL?, privat: Bool, aktivera: Bool) -> any Flik {
        let f = EnkelFlik(privat: privat, app: app)
        flikar.append(f)
        if aktivera || aktivtId == nil { aktivtId = f.id }
        if let url { f.ladda(url) }
        return f
    }

    func aktivera(_ id: UUID) {
        if flikar.contains(where: { $0.id == id }) { aktivtId = id }
    }

    func stang(_ id: UUID) {
        flikar.removeAll { $0.id == id }
        if aktivtId == id { aktivtId = flikar.last?.id }
        if flikar.isEmpty { nyFlik(nil, privat: false, aktivera: true) }
    }
}

/// En flik i `EnkelFlikHanterare`.
@MainActor
@Observable
final class EnkelFlik: Flik {
    let id = UUID()
    let privat: Bool
    private(set) var url: URL?
    private(set) var titel = ""
    private(set) var laddar = false
    private(set) var framsteg = 0.0
    private(set) var kanGaBakat = false
    private(set) var kanGaFramat = false
    private(set) var sakerAnslutning = false
    private(set) var fel: Sidfel?

    @ObservationIgnored weak var app: AppMiljo?
    @ObservationIgnored private var vy: WKWebView?
    @ObservationIgnored private var delegat: EnkelFlikDelegat?
    @ObservationIgnored private var observationer: [NSKeyValueObservation] = []
    @ObservationIgnored private let logg = Logg("Flik")

    init(privat: Bool, app: AppMiljo?) {
        self.privat = privat
        self.app = app
    }

    var webbvy: WKWebView {
        if let vy { return vy }
        let v = skapaWebbvy()
        vy = v
        return v
    }

    private func skapaWebbvy() -> WKWebView {
        let k = WKWebViewConfiguration()
        k.websiteDataStore = privat ? .nonPersistent() : .default()
        Anvandaragent.anvand(pa: k)
        k.allowsInlineMediaPlayback = true
        k.mediaTypesRequiringUserActionForPlayback = .audio
        k.defaultWebpagePreferences.preferredContentMode = .mobile
        let v = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: k)
        v.allowsBackForwardNavigationGestures = true
        #if DEBUG
        v.isInspectable = true
        #endif
        let d = EnkelFlikDelegat()
        d.flik = self
        delegat = d
        v.navigationDelegate = d
        v.uiDelegate = d
        observationer = [
            v.observe(\.title, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.titel = wv.title ?? "" }
            },
            v.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.laddar = wv.isLoading }
            },
            v.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.framsteg = wv.estimatedProgress }
            },
            v.observe(\.canGoBack, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.kanGaBakat = wv.canGoBack }
            },
            v.observe(\.canGoForward, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.kanGaFramat = wv.canGoForward }
            },
            v.observe(\.hasOnlySecureContent, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.sakerAnslutning = wv.hasOnlySecureContent }
            },
        ]
        // Skyddet före första laddningen (kontraktet i Skydd.swift)
        app?.skydd.forbered(v, privat: privat)
        return v
    }

    func ladda(_ url: URL) {
        fel = nil
        webbvy.load(URLRequest(url: url))
    }

    func ladda(text: String) {
        guard let app, let u = Webbadress.tolka(text, privat: privat, installningar: app.installningar) else { return }
        ladda(u)
    }

    func bakat() { webbvy.goBack() }
    func framat() { webbvy.goForward() }
    func laddaOm() { if url == nil { return }; webbvy.reload() }
    func stoppa() { webbvy.stopLoading() }

    // MARK: - Från delegaten

    fileprivate func bekraftad(_ wv: WKWebView) {
        url = wv.url
        fel = nil
        if let u = wv.url { app?.handelser.skicka(FlikNavigerade(flik: id, url: u, privat: privat)) }
    }

    fileprivate func laddad(_ wv: WKWebView) {
        url = wv.url ?? url
        titel = wv.title ?? titel
        if let u = url { app?.handelser.skicka(SidaLaddad(flik: id, url: u, titel: titel, privat: privat)) }
    }

    fileprivate func misslyckades(_ error: Error, _ wv: WKWebView) {
        let f = Sidfel(error, url: wv.url ?? url)
        if f.avbruten { return }
        fel = f
        laddar = wv.isLoading
        logg.varning("\(f.url?.host() ?? "?"): \(f.doman) \(f.kod) \(f.text)")
        if f.blockeradAvSkyddet, let u = f.url, let app, let html = app.skydd.blockeringssida(for: u, flik: id) {
            wv.loadHTMLString(html, baseURL: nil)
        }
    }

    fileprivate func beslut(_ handling: WKNavigationAction, _ preferenser: WKWebpagePreferences) -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        // Bara webbadresser i en flik. adraze-app: (AdRaze-UI:t) och file: får aldrig laddas i en vanlig flik.
        let schema = handling.request.url?.scheme?.lowercased() ?? ""
        guard ["http", "https", "about", "blob", "data"].contains(schema) else {
            if let u = handling.request.url, ["mailto", "tel", "sms", "facetime", "maps", "itms-apps"].contains(schema) {
                UIApplication.shared.open(u)
            }
            return (.cancel, preferenser)
        }
        guard let app else { return (.allow, preferenser) }
        let b = app.skydd.beslut(for: handling)
        if !b.tillat { return (.cancel, preferenser) }
        if let ny = b.nyAdress, handling.targetFrame?.isMainFrame ?? true {
            webbvy.load(URLRequest(url: ny))
            return (.cancel, preferenser)
        }
        preferenser.allowsContentJavaScript = b.javascript
        return (.allow, preferenser)
    }
}

/// Delegaten för `EnkelFlik` (en egen NSObject så att fliken kan vara `@Observable`).
@MainActor
final class EnkelFlikDelegat: NSObject, WKNavigationDelegate, WKUIDelegate {
    weak var flik: EnkelFlik?

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences) async -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        guard let flik else { return (.allow, preferences) }
        return flik.beslut(navigationAction, preferences)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { flik?.bekraftad(webView) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { flik?.laddad(webView) }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        flik?.misslyckades(error, webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        flik?.misslyckades(error, webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Logg("Flik").varning("webbinnehållets process avslutades; laddar om")
        webView.reload()
    }

    /// Länkar som vill öppna ett nytt fönster (target=_blank, window.open) öppnas i samma flik.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let u = navigationAction.request.url { webView.load(URLRequest(url: u)) }
        return nil
    }
}
