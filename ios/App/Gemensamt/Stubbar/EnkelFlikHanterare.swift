import Foundation
import Observation
import UIKit
import WebKit

/// Enkel ersättning för Flikar (`-utan Flikar`): flera flikar med en WKWebView var, men utan sparade flikar,
/// historik, sovande flikar, nedladdningar, favikoner och kontextmeny. Visar hur kontraktet i `Flik.swift` är
/// tänkt att användas (användaragenten, skyddet före första laddningen, stoppsidan, händelserna). Byts av Flikar
/// med `app.ersatt(flikar:)`.
///
/// Ägare: Grund.
@MainActor
@Observable
final class EnkelFlikHanterare: FlikHanterare {
    private(set) var flikar: [any Flik] = []
    private(set) var aktivtId: UUID?
    /// Stängda flikars adresser, senaste sist (bara vanliga flikar).
    private var stangda: [(url: URL, plats: Int)] = []

    @ObservationIgnored weak var app: AppMiljo?

    var aktiv: (any Flik)? {
        flikar.first { $0.id == aktivtId } ?? flikar.last
    }

    @discardableResult
    func nyFlik(_ url: URL?, privat: Bool, aktivera: Bool) -> any Flik {
        oppna(url, privat: privat, aktivera: aktivera, oppnadAv: nil)
    }

    @discardableResult
    fileprivate func oppna(_ url: URL?, privat: Bool, aktivera: Bool, oppnadAv: UUID?, plats: Int? = nil) -> EnkelFlik {
        let f = EnkelFlik(privat: privat, app: app, oppnadAv: oppnadAv)
        f.hanterare = self
        if let plats { flikar.insert(f, at: min(max(0, plats), flikar.count)) } else { flikar.append(f) }
        app?.handelser.skicka(FlikOppnad(flik: f.id, privat: privat, oppnadAv: oppnadAv))
        if aktivera || aktivtId == nil { self.aktivera(f.id) }
        if let url { f.ladda(url) }
        return f
    }

    func aktivera(_ id: UUID) {
        guard flikar.contains(where: { $0.id == id }), aktivtId != id else { return }
        aktivtId = id
        app?.handelser.skicka(FlikAktiverad(flik: id))
    }

    func stang(_ id: UUID) {
        guard let i = flikar.firstIndex(where: { $0.id == id }) else { return }
        let f = flikar[i]
        if !f.privat, let u = f.url { stangda.append((u, i)) }
        flikar.remove(at: i)
        app?.handelser.skicka(FlikStangd(flik: id, privat: f.privat))
        if aktivtId == id {
            aktivtId = nil
            if !flikar.isEmpty { aktivera(flikar[max(0, i - 1)].id) }
        }
        if flikar.isEmpty { nyFlik(nil, privat: false, aktivera: true) }
    }

    var kanAngraStang: Bool { !stangda.isEmpty }

    @discardableResult
    func angraStang() -> (any Flik)? {
        guard let s = stangda.popLast() else { return nil }
        return oppna(s.url, privat: false, aktivera: true, oppnadAv: nil, plats: s.plats)
    }

    func flytta(_ id: UUID, till plats: Int) {
        guard let i = flikar.firstIndex(where: { $0.id == id }) else { return }
        let f = flikar.remove(at: i)
        flikar.insert(f, at: min(max(0, plats), flikar.count))
    }

    func stangAlla(privata: Bool) {
        for f in flikar where f.privat == privata { stang(f.id) }
    }

    /// Länkar som vill öppna ett nytt fönster (target=_blank, window.open efter ett tryck) blir en ny flik.
    fileprivate func oppnaFonster(_ u: URL, fran f: EnkelFlik) {
        oppna(u, privat: f.privat, aktivera: true, oppnadAv: f.id, plats: (flikar.firstIndex { $0.id == f.id } ?? flikar.count - 1) + 1)
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
    let oppnadAv: UUID?
    let sover = false
    private(set) var visarFelsida = false
    let favikon: UIImage? = nil
    private(set) var miniatyr: UIImage?
    private(set) var temafarg: UIColor?
    private(set) var zoom = 1.0
    private(set) var skrivbordslage = false
    private(set) var helskarm = false

    @ObservationIgnored weak var app: AppMiljo?
    @ObservationIgnored fileprivate weak var hanterare: EnkelFlikHanterare?
    @ObservationIgnored private var vy: WKWebView?
    @ObservationIgnored private var delegat: EnkelFlikDelegat?
    @ObservationIgnored private var observationer: [NSKeyValueObservation] = []
    @ObservationIgnored private let logg = Logg("Flik")

    init(privat: Bool, app: AppMiljo?, oppnadAv: UUID? = nil) {
        self.privat = privat
        self.app = app
        self.oppnadAv = oppnadAv
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
        k.allowsPictureInPictureMediaPlayback = true
        k.preferences.isElementFullscreenEnabled = true
        let v = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: k)
        v.allowsBackForwardNavigationGestures = true
        v.isFindInteractionEnabled = true
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
            v.observe(\.themeColor, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.temafarg = wv.themeColor }
            },
            v.observe(\.fullscreenState, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.helskarm = wv.fullscreenState == .inFullscreen }
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

    func sattZoom(_ z: Double) {
        zoom = min(3, max(0.5, z))
        webbvy.pageZoom = CGFloat(zoom)
    }

    func zooma(inat: Bool) { sattZoom(zoom + (inat ? 0.1 : -0.1)) }

    func sattSkrivbordslage(_ pa: Bool) {
        guard pa != skrivbordslage else { return }
        skrivbordslage = pa
        webbvy.customUserAgent = pa
            ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
            : nil
        laddaOm()
    }

    func hitta(_ text: String) async -> Int {
        guard !text.isEmpty, let r = try? await webbvy.find(text, configuration: WKFindConfiguration()) else { return 0 }
        return r.matchFound ? 1 : 0
    }

    func visaSokfalt(_ text: String?) {
        guard let s = webbvy.findInteraction else { return }
        if let text { s.searchText = text }
        s.presentFindNavigator(showingReplace: false)
    }

    // MARK: - Från delegaten

    fileprivate func bekraftad(_ wv: WKWebView) {
        url = wv.url
        if visarStoppsida { visarStoppsida = false; return }
        fel = nil
        visarFelsida = false
        if let u = wv.url { app?.handelser.skicka(FlikNavigerade(flik: id, url: u, privat: privat)) }
    }

    fileprivate func laddad(_ wv: WKWebView) {
        url = wv.url ?? url
        titel = wv.title ?? titel
        guard !visarFelsida else { return }
        if let u = url { app?.handelser.skicka(SidaLaddad(flik: id, url: u, titel: titel, privat: privat)) }
        let konf = WKSnapshotConfiguration()
        konf.snapshotWidth = 300
        wv.takeSnapshot(with: konf) { [weak self] bild, _ in
            MainActor.assumeIsolated { if let bild { self?.miniatyr = bild } }
        }
    }

    fileprivate func misslyckades(_ error: Error, _ wv: WKWebView) {
        let f = Sidfel(error, url: wv.url ?? url)
        if f.avbruten { return }
        fel = f
        laddar = wv.isLoading
        logg.varning("\(f.url?.host() ?? "?"): \(f.doman) \(f.kod) \(f.text)")
        // Skyddets stoppsida på den riktiga adressen (adressfältet och bakåtlistan ser sidan som stoppades).
        if f.blockeradAvSkyddet, let u = f.url, let app, let html = app.skydd.blockeringssida(for: u, flik: id) {
            visarFelsida = true
            visarStoppsida = true
            wv.loadSimulatedRequest(URLRequest(url: u), responseHTML: html)
        }
    }

    /// Stoppsidan är på väg in (dess didCommit ska inte nollställa felet).
    @ObservationIgnored private var visarStoppsida = false

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

    /// Länkar som vill öppna ett nytt fönster (target=_blank, window.open) öppnas i en ny flik (utan koppling
    /// till öppnaren: `window.opener` blir `null`).
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let u = navigationAction.request.url, let flik {
            flik.hanterare?.oppnaFonster(u, fran: flik)
        }
        return nil
    }
}
