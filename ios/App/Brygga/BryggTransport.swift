import Foundation
import UIKit
import WebKit

/// Transporten mellan Swift och AdRaze-UI:t i webbvyerna (del 3, 3.4). Moduler registrerar bara kanaler i
/// `app.brygga` (Gemensamt/Brygga.swift); det här är vägen dit och tillbaka:
///
/// - **Schemat** `adraze-app://localhost` (`AdrazeSchema`) och **meddelandehanteraren** `adraze`
///   (`WKScriptMessageHandlerWithReply`) finns bara i webbvyer som skapas här (`konfiguration()`), aldrig i flikarna.
/// - Före varje navigering i huvudramen byggs sidans användarskript om (`forbered`): startdatan
///   (`window.__adrazeBoot`, datorns sendSync), `ios/preload-ios.js`, datorns preload (oförändrad, med en låtsad
///   `require('electron')`) och `ios/ios.js` vid dokumentslut.
/// - Varje anrop kontrolleras: huvudramen, ursprunget `adraze-app://localhost` och att webbvyn är vår.
///   Ytan (`anpassa`, `startsida` …) tas från huvudramens adress, och `BryggRegister.anropa` nekar kanaler
///   som inte är öppna för den ytan.
/// - Händelser till sidorna (`app.brygga.skicka`) går med `callAsyncJavaScript` till `window.adraze._emit`.
///
/// Ägare: Brygga och webb-UI.
@MainActor
final class BryggTransport: NSObject {
    static private(set) var delad: BryggTransport?

    unowned let app: AppMiljo
    let schema: AdrazeSchema
    /// AdRaze-UI:ts eget beständiga datalager (iOS 17+). Flikarnas "Rensa webbdata" når det aldrig.
    let datalager: WKWebsiteDataStore
    static let datalagerID = UUID(uuidString: "03C7F960-3C28-41EA-A031-D3EC3E85686A")!

    /// Vilken datorpreload varje yta kör (filer i Webb/ui/_preload/).
    static let preloads: [String: [String]] = [
        "anpassa": ["preload.js"],
        "startsida": ["preload.js"],
        "falk": ["krypto-preload.js"],
        "chatt": ["chatt-preload.js"],
    ]

    private struct Vypost {
        weak var vy: WKWebView?
        weak var sida: AdrazeSida?
    }
    private var vyer: [ObjectIdentifier: Vypost] = [:]
    private var skriptminne: [String: String] = [:]
    private var mottagare: Mottagare!
    private var prenumerationer: [Prenumeration] = []
    private let logg = Logg("Brygga")

    /// Räknare för självtestet.
    private(set) var antalAnrop = 0
    private(set) var antalNekade = 0
    private(set) var antalHandelser = 0
    private(set) var senasteNekade: String?

    init(app: AppMiljo) {
        self.app = app
        schema = AdrazeSchema()
        datalager = WKWebsiteDataStore(forIdentifier: Self.datalagerID)
        super.init()
        mottagare = Mottagare(self)
        BryggTransport.delad = self
        app.brygga.sandare = { [weak self] kanal, data, till in self?.skicka(kanal, data, till: till) }
        prenumerationer.append(app.handelser.lyssna(InstallningAndrad.self) { [weak self] h in self?.installningAndrad(h) })
    }

    // MARK: - Webbvyer

    /// Konfigurationen för en AdRaze-webbvy: eget datalager, schemat och bryggan. Används bara av `AdrazeSida`.
    func konfiguration() -> WKWebViewConfiguration {
        let k = WKWebViewConfiguration()
        k.websiteDataStore = datalager
        k.setURLSchemeHandler(schema, forURLScheme: AdrazeSchema.schema)
        let innehall = WKUserContentController()
        innehall.addScriptMessageHandler(mottagare, contentWorld: .page, name: "adraze")
        k.userContentController = innehall
        k.allowsInlineMediaPlayback = true
        k.mediaTypesRequiringUserActionForPlayback = []
        k.dataDetectorTypes = []
        k.suppressesIncrementalRendering = false
        k.preferences.javaScriptCanOpenWindowsAutomatically = false
        k.preferences.isTextInteractionEnabled = true
        k.defaultWebpagePreferences.preferredContentMode = .mobile
        k.defaultWebpagePreferences.allowsContentJavaScript = true
        Anvandaragent.anvand(pa: k)
        return k
    }

    func registrera(_ vy: WKWebView, sida: AdrazeSida) {
        vyer[ObjectIdentifier(vy)] = Vypost(vy: vy, sida: sida)
    }

    func avregistrera(_ vy: WKWebView) {
        vyer.removeValue(forKey: ObjectIdentifier(vy))
    }

    /// Sidan för en webbvy (från `BryggKalla.webbvy`).
    func sida(_ id: ObjectIdentifier?) -> AdrazeSida? {
        guard let id else { return nil }
        return vyer[id]?.sida
    }

    /// Alla AdRaze-sidor som är öppna nu.
    var oppna: [AdrazeSida] {
        vyer = vyer.filter { $0.value.vy != nil }
        return vyer.values.compactMap(\.sida)
    }

    /// Lägger in sidans användarskript inför en navigering i huvudramen till `url`.
    func forbered(_ vy: WKWebView, url: URL) {
        let yta = AdrazeSchema.yta(for: url)
        let innehall = vy.configuration.userContentController
        innehall.removeAllUserScripts()
        let kalla = BryggKalla(yta: yta, url: url, webbvy: ObjectIdentifier(vy))
        let start = app.brygga.byggStartdata(for: kalla)
        innehall.addUserScript(WKUserScript(source: "window.__adrazeBoot = \(start.jsonText);", injectionTime: .atDocumentStart,
                                            forMainFrameOnly: true, in: .page))
        if let s = skript("ios/preload-ios.js") {
            innehall.addUserScript(WKUserScript(source: s, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        }
        for fil in Self.preloads[yta] ?? [] {
            if let s = datorpreload(fil) {
                innehall.addUserScript(WKUserScript(source: s, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
            }
        }
        // Modulernas egen stil och JS för ytan (app.brygga.skript): stilen vid start, JS efter datorns skript, före ios.js
        for m in app.brygga.skript(for: yta) {
            if let css = m.css {
                innehall.addUserScript(WKUserScript(source: Self.stilskript(css, id: m.namn + "-css"), injectionTime: .atDocumentStart,
                                                    forMainFrameOnly: true, in: .page))
                innehall.addUserScript(WKUserScript(source: Self.flyttaStil(id: m.namn + "-css"), injectionTime: .atDocumentEnd,
                                                    forMainFrameOnly: true, in: .page))
            }
            if let js = m.js {
                innehall.addUserScript(WKUserScript(source: js + "\n//# sourceURL=\(AdrazeSchema.ursprung)/\(m.namn).js\n",
                                                    injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .page))
            }
        }
        if let s = skript("ios/ios.js") {
            innehall.addUserScript(WKUserScript(source: s, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .page))
        }
    }

    /// En moduls stil som `<style id>` i dokumentet redan vid start (en gång per dokument).
    static func stilskript(_ css: String, id: String) -> String {
        """
        (function () { if (document.getElementById(\(JSONVarde.text(id).jsonText))) return;
          var s = document.createElement('style'); s.id = \(JSONVarde.text(id).jsonText); s.textContent = \(JSONVarde.text(css).jsonText);
          (document.head || document.documentElement).appendChild(s); })();
        """
    }

    /// Flyttar modulens stil sist i `<head>` när dokumentet är tolkat (efter datorns stilmallar).
    static func flyttaStil(id: String) -> String {
        "(function () { var s = document.getElementById(\(JSONVarde.text(id).jsonText)); if (s && document.head) document.head.appendChild(s); })();"
    }

    private func skript(_ fil: String) -> String? {
        if let s = skriptminne[fil] { return s }
        guard let d = Bunt.data("Webb", fil), let s = String(data: d, encoding: .utf8) else {
            logg.fel("saknar Webb/\(fil) i appen (kör verktyg/kopiera-ui.sh före bygget)")
            return nil
        }
        let ut = s + "\n//# sourceURL=\(AdrazeSchema.ursprung)/\(fil)\n"
        skriptminne[fil] = ut
        return ut
    }

    /// Datorns preload, oförändrad: körs med `require` och `process` från preload-ios.js.
    private func datorpreload(_ fil: String) -> String? {
        let nyckel = "_preload/" + fil
        if let s = skriptminne[nyckel] { return s }
        guard let d = Bunt.data("Webb", "ui/_preload/\(fil)"), let kod = String(data: d, encoding: .utf8) else {
            logg.fel("saknar Webb/ui/_preload/\(fil) (kör verktyg/kopiera-ui.sh före bygget)")
            return nil
        }
        let ut = "(function (require, process) {\n\(kod)\n})(window.__adrazeKrav, window.__adrazeProcess);\n//# sourceURL=\(AdrazeSchema.ursprung)/_preload/\(fil)\n"
        skriptminne[nyckel] = ut
        return ut
    }

    // MARK: - Anrop från sidorna

    fileprivate func taEmot(_ m: WKScriptMessage, svar: @escaping @MainActor (Any?, String?) -> Void) {
        let ram = m.frameInfo
        let ursprung = ram.securityOrigin
        guard let vy = m.webView, vyer[ObjectIdentifier(vy)]?.vy != nil else {
            neka("okänd webbvy", svar)
            return
        }
        guard ram.isMainFrame else {
            neka("bara huvudramen får anropa", svar)
            return
        }
        guard ursprung.protocol == AdrazeSchema.schema, ursprung.host == AdrazeSchema.varden, ursprung.port == 0 else {
            neka("fel ursprung \(ursprung.protocol)://\(ursprung.host)", svar)
            return
        }
        guard let kropp = m.body as? [String: Any], let kanal = kropp["k"] as? String, !kanal.isEmpty, kanal.count <= 120 else {
            svar(nil, BryggFel.ogiltigt("meddelandet saknar kanal").localizedDescription)
            return
        }
        let argument = (kropp["a"] as? [Any] ?? []).map { JSONVarde(foundation: $0) }
        let url = ram.request.url ?? vy.url
        let kalla = BryggKalla(yta: AdrazeSchema.yta(for: url), url: url, webbvy: ObjectIdentifier(vy))
        antalAnrop += 1
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let resultat = try await self.app.brygga.anropa(kanal, argument, fran: kalla)
                svar(resultat.foundation, nil)
            } catch {
                if case BryggFel.nekad = error {
                    self.antalNekade += 1
                    self.senasteNekade = "\(kanal) från \(kalla.yta)"
                }
                svar(nil, (error as? LocalizedError)?.errorDescription ?? String(describing: error))
            }
        }
    }

    private func neka(_ varfor: String, _ svar: @escaping @MainActor (Any?, String?) -> Void) {
        antalNekade += 1
        senasteNekade = varfor
        logg.varning("bryggan nekade ett anrop: \(varfor)")
        svar(nil, BryggFel.nekad(varfor).localizedDescription)
    }

    // MARK: - Händelser till sidorna

    func skicka(_ kanal: String, _ data: JSONVarde, till mal: BryggMal) {
        for (id, post) in vyer {
            guard let vy = post.vy else { vyer.removeValue(forKey: id); continue }
            guard let url = vy.url, url.scheme == AdrazeSchema.schema, url.host == AdrazeSchema.varden else { continue }
            switch mal {
            case .alla: break
            case .yta(let y): if AdrazeSchema.yta(for: url) != y { continue }
            case .webbvy(let w): if w != id { continue }
            }
            antalHandelser += 1
            vy.callAsyncJavaScript("if (window.adraze && window.adraze._emit) window.adraze._emit(k, d);",
                                   arguments: ["k": kanal, "d": data.foundation], in: nil, in: .page) { [logg] r in
                if case .failure(let fel) = r { logg.felsok("\(kanal) kom inte fram: \(fel.localizedDescription)") }
            }
        }
    }

    private func installningAndrad(_ h: InstallningAndrad) {
        // Som datorns anpassa:andrad: det SPARADE värdet (null = standard gäller). webb.*, block.* och sprak.*
        // ligger inte i sidornas Anpassa-kopia (datorn har dem i egna filer).
        if !BryggKanaler.skyddad(h.nyckel) {
            skicka("anpassa:andrad", ["nyckel": .text(h.nyckel), "varde": h.sparat ?? .null], till: .alla)
        }
        if h.nyckel == Nycklar.sprakVal.namn {
            skicka("sprak:andrat", ["kod": .text(BryggSprak.aktivt(app.installningar))], till: .alla)
        }
        if h.nyckel.hasPrefix("tema.") {
            for w in oppna { w.temaAndrat() }
        }
    }
}

/// Meddelandehanteraren `adraze`. Egen klass med svag referens: WKUserContentController håller sina hanterare
/// starkt, och transporten ska inte hållas vid liv av webbvyerna.
@MainActor
private final class Mottagare: NSObject, WKScriptMessageHandlerWithReply {
    weak var transport: BryggTransport?

    init(_ transport: BryggTransport) {
        self.transport = transport
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor (Any?, String?) -> Void) {
        guard let transport else {
            replyHandler(nil, "bryggan finns inte längre")
            return
        }
        transport.taEmot(message, svar: replyHandler)
    }
}
