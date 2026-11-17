import SwiftUI
import UIKit
import WebKit

/// En AdRaze-sida (Anpassa, startsidan, Falk, chatten …) i en egen webbvy med bryggan. Skapas bara av Brygga;
/// andra moduler visar sidor med kanalen `sida:visa` (som ark eller helskärm), se `BryggaModul`.
///
/// - Webbvyn har eget datalager, schemat `adraze-app` och bryggan, och navigerar aldrig till vanliga webbsidor:
///   en länk eller `view:load` till http(s) går till `navigera` (standard: den aktiva fliken om den är tom,
///   annars en ny flik) och arket stängs.
/// - Vyn tonar fram när sidan säger att den är klar (`sida:klar` från ios.js), så att datorns layout aldrig
///   blinkar förbi.
/// - Ramar från andra ursprung laddas inte.
///
/// Ägare: Brygga och webb-UI.
@MainActor
final class AdrazeSida: UIView, WKNavigationDelegate, WKUIDelegate {
    let yta: String
    let webbvy: WKWebView
    /// Sidan vill öppna en vanlig webbadress. `nil` = standard (aktiva tomma fliken, annars en ny flik).
    var navigera: (@MainActor (URL) -> Void)?
    /// Sidan vill stängas (krysset i Anpassa, `sida:stang`). Sätts av den som visar ytan.
    var stang: (@MainActor () -> Void)?
    /// Utrymme nertill som värdvyn täcker (skalets fält), i punkter. Sidan lägger sitt innehåll ovanför.
    var nedre: CGFloat = 0 { didSet { if nedre != oldValue { skickaNedre() } } }
    /// Sidan ligger i skalet (ny flik), där skalets adressfält syns: `html.ios-i-skalet` (startsidans egen sökruta
    /// döljs då, ios.css). Sätts av `AdrazeSidaVy`.
    var iSkalet = false { didSet { if iSkalet != oldValue { skickaNedre() } } }

    /// Kontrollern som visar ytan modalt (`AdrazeSidor.visa`), annars `nil`.
    weak var kontroller: UIViewController?

    private(set) var arKlar = false
    private(set) var klarEfterMs: Double?
    /// Tider i ms från att vyn skapades (navigering, commit, färdig, klar) och sidans egen `performance.now()` vid klar.
    private(set) var tider: [String: Double] = [:]
    private(set) var senasteFel: String?
    private let skapad = Date()
    /// Adressen till dokumentet som faktiskt är inläst (sätts vid commit; fragmentbyten ger ingen commit).
    private var inlastDokument: URL?
    private weak var transport: BryggTransport?
    private let logg = Logg("Brygga")

    init(yta: String, fragment: String? = nil) {
        guard let transport = BryggTransport.delad else { fatalError("AdrazeSida före BryggaModul.registrera") }
        Starttider.markera("\(yta)_skapad")
        self.yta = yta
        self.transport = transport
        webbvy = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: transport.konfiguration())
        Starttider.markera("\(yta)_webbvy")
        super.init(frame: .zero)
        webbvy.navigationDelegate = self
        webbvy.uiDelegate = self
        webbvy.isOpaque = false
        webbvy.allowsLinkPreview = false
        webbvy.allowsBackForwardNavigationGestures = yta == "anpassa"
        webbvy.scrollView.contentInsetAdjustmentBehavior = .never
        webbvy.scrollView.bounces = false
        webbvy.alpha = 0
        #if DEBUG
        webbvy.isInspectable = true
        #endif
        temaAndrat()
        addSubview(webbvy)
        webbvy.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webbvy.leadingAnchor.constraint(equalTo: leadingAnchor), webbvy.trailingAnchor.constraint(equalTo: trailingAnchor),
            webbvy.topAnchor.constraint(equalTo: topAnchor), webbvy.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        transport.registrera(webbvy, sida: self)
        webbvy.load(URLRequest(url: AdrazeSchema.adress(yta, fragment: fragment)))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) används inte") }

    /// Väntar tills sidan är klar, högst `max` sekunder. Ger `true` om den blev klar.
    @discardableResult
    func vantaPaKlar(max sekunder: Double = 10) async -> Bool {
        if arKlar { return true }
        let gräns = Date().addingTimeInterval(sekunder)
        while !arKlar && Date() < gräns { try? await Task.sleep(nanoseconds: 50_000_000) }
        return arKlar
    }

    /// Laddar om sidan med ny startdata (efter att något native har ändrats som sidan bara läser vid start).
    func laddaOm() { webbvy.reload() }

    /// Kör JavaScript i sidan (sidans egen värld) och ger svaret som JSON. För självtester och felsökning.
    func kor(_ js: String, _ argument: [String: Any] = [:]) async throws -> JSONVarde {
        let v = try await webbvy.callAsyncJavaScript(js, arguments: argument, contentWorld: .page)
        return JSONVarde(foundation: v)
    }

    // MARK: - Från bryggan

    func markeraKlar(sidansMs: Double? = nil) {
        if let sidansMs { tider["sidan_klar"] = sidansMs }
        // Ett nytt dokument i samma vy (omladdning vid språkbyte): måtten nertill gäller fortfarande.
        guard !arKlar else { skickaNedre(); return }
        notera("klar")
        AppMiljo.delad?.startbild.klar(yta)
        arKlar = true
        klarEfterMs = (Date().timeIntervalSince(skapad) * 1000).rounded()
        skickaNedre()
        let yta = yta
        UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut, .allowUserInteraction],
                       animations: { self.webbvy.alpha = 1 },
                       completion: { _ in Starttider.markera("\(yta)_synlig") })
    }

    func temaAndrat() {
        let farg: UIColor = yta == "startsida" ? UIColor(red: 0.078, green: 0.075, blue: 0.067, alpha: 1)
            : (AppMiljo.delad?.tema.ui(.bakgrund) ?? .systemBackground)
        backgroundColor = farg
        webbvy.backgroundColor = farg
        webbvy.scrollView.backgroundColor = farg
        if let stil = AppMiljo.delad?.tema.uiStil {
            webbvy.overrideUserInterfaceStyle = stil
            kontroller?.overrideUserInterfaceStyle = stil
        }
    }

    /// Byter kategori i en Anpassa som redan visas (`sida:visa` med `kategori`).
    func visaKategori(_ kategori: String) {
        transport?.skicka("sida:kategori", ["kat": .text(kategori)], till: .webbvy(ObjectIdentifier(webbvy)))
    }

    /// Värdvyn vill att sidan navigerar till en vanlig webbadress.
    func oppnaUtanfor(_ url: URL) {
        if let navigera {
            navigera(url)
        } else if let app = AppMiljo.delad {
            if let aktiv = app.flikar.aktiv, aktiv.url == nil { aktiv.ladda(url) } else { _ = app.flikar.nyFlik(url) }
        }
        stang?()
    }

    private func skickaNedre() {
        guard arKlar else { return }
        let js = "const h = document.documentElement; h.style.setProperty('--ios-nedre', n + 'px'); h.classList.toggle('ios-i-skalet', i);"
        webbvy.callAsyncJavaScript(js, arguments: ["n": Double(nedre), "i": iSkalet], in: nil, in: .page, completionHandler: nil)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences) async -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        guard let url = navigationAction.request.url else { return (.cancel, preferences) }
        let schema = url.scheme?.lowercased() ?? ""
        let huvudram = navigationAction.targetFrame?.isMainFrame ?? false
        if schema == AdrazeSchema.schema {
            guard url.host == AdrazeSchema.varden, navigationAction.targetFrame != nil else { return (.cancel, preferences) }
            // Ny sida (även omladdning): ny startdata. Bara fragmentet ändras: samma dokument, inget laddas om.
            // Jämförs mot det senast inlästa dokumentet, inte webView.url: den är redan den nya adressen när den
            // första laddningen frågar (mätt 2026-11-17: sida med #fragment fick då ingen brygga).
            if huvudram, navigationAction.navigationType == .reload || !arSammaDokument(url, inlastDokument) {
                notera("navigering")
                transport?.forbered(webView, url: url)
                notera("startdata")
            }
            return (.allow, preferences)
        }
        if !huvudram {
            // Ramar: bara tomma (about:blank, srcdoc) och våra egna
            if schema == "about" { return (.allow, preferences) }
            logg.info("\(yta): ram från \(url.host ?? schema) laddas inte")
            return (.cancel, preferences)
        }
        if schema == "http" || schema == "https" {
            oppnaUtanfor(url)
        } else if ["mailto", "tel", "sms", "facetime"].contains(schema) {
            _ = await UIApplication.shared.open(url, options: [:])
        } else {
            logg.info("\(yta): navigering till \(schema): stoppad")
        }
        return (.cancel, preferences)
    }

    private func arSammaDokument(_ a: URL, _ b: URL?) -> Bool {
        guard let b else { return false }
        var ka = URLComponents(url: a, resolvingAgainstBaseURL: false), kb = URLComponents(url: b, resolvingAgainstBaseURL: false)
        ka?.fragment = nil
        kb?.fragment = nil
        return ka?.url == kb?.url && a.fragment != nil
    }

    private func notera(_ namn: String) {
        if tider[namn] == nil { tider[namn] = (Date().timeIntervalSince(skapad) * 1000).rounded() }
        Starttider.markera("\(yta)_\(namn)")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        inlastDokument = webView.url
        notera("commit")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        notera("fardig")
        // Om ios.js aldrig hörde av sig (fel i sidan): visa ändå, lite senare
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard let self, !self.arKlar else { return }
            self.logg.varning("\(self.yta): sidan sa aldrig att den var klar; visas ändå")
            self.markeraKlar()
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        senasteFel = error.localizedDescription
        logg.fel("\(yta): \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        senasteFel = error.localizedDescription
        logg.fel("\(yta): \(error.localizedDescription)")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        logg.varning("\(yta): webbinnehållets process avslutades; laddar om")
        arKlar = false
        webView.alpha = 0
        webView.reload()
    }

    // MARK: - WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url, ["http", "https"].contains(u.scheme?.lowercased() ?? "") { oppnaUtanfor(u) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { (k: CheckedContinuation<Void, Never>) in
            Task { @MainActor in
                let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                a.addAction(UIAlertAction(title: BryggSprak.ord("OK"), style: .default) { _ in k.resume() })
                if !self.visa(a) { k.resume() }
            }
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { (k: CheckedContinuation<Bool, Never>) in
            Task { @MainActor in
                let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                a.addAction(UIAlertAction(title: BryggSprak.ord("Avbryt"), style: .cancel) { _ in k.resume(returning: false) })
                a.addAction(UIAlertAction(title: BryggSprak.ord("OK"), style: .default) { _ in k.resume(returning: true) })
                if !self.visa(a) { k.resume(returning: false) }
            }
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo) async -> String? {
        await withCheckedContinuation { (k: CheckedContinuation<String?, Never>) in
            Task { @MainActor in
                let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
                a.addTextField { $0.text = defaultText }
                a.addAction(UIAlertAction(title: BryggSprak.ord("Avbryt"), style: .cancel) { _ in k.resume(returning: nil) })
                a.addAction(UIAlertAction(title: BryggSprak.ord("OK"), style: .default) { [weak a] _ in k.resume(returning: a?.textFields?.first?.text ?? "") })
                if !self.visa(a) { k.resume(returning: nil) }
            }
        }
    }

    private func visa(_ kontroller: UIViewController) -> Bool {
        guard let topp = AdrazeSidor.toppkontroller(fran: window?.rootViewController) else { return false }
        topp.present(kontroller, animated: true)
        return true
    }
}

// MARK: - Visa som ark eller helskärm

// `Sidlage` (ark eller helskärm) ligger i Gemensamt/Sidor.swift.

/// Kontrollern som håller en AdRaze-sida när den visas modalt.
@MainActor
final class AdrazeSidaKontroller: UIViewController, UIAdaptivePresentationControllerDelegate {
    let sida: AdrazeSida
    var stangd: (@MainActor () -> Void)?
    /// Startsidan har en mörk bild bakom statusraden.
    var statusrad: UIStatusBarStyle = .default

    override var preferredStatusBarStyle: UIStatusBarStyle { statusrad }

    init(_ sida: AdrazeSida) {
        self.sida = sida
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) används inte") }

    override func loadView() { view = sida }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil { stangd?() }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { stangd?() }
}

/// Webbytorna som visas modalt just nu, en per yta.
@MainActor
enum AdrazeSidor {
    private static var visade: [String: AdrazeSidaKontroller] = [:]
    /// Sidor som laddas innan någon vy har bett om dem (`forladda`), och ytor som redan har hämtat sin.
    private static var forladdade: [String: AdrazeSida] = [:]
    private static var hamtade: Set<String> = []

    private static var vantande: Set<String> = []
    private static var startlyssnare: NSObjectProtocol?

    /// Skapar ytans sida (webbvyn börjar ladda) så tidigt det går, så att WebKits processer startar medan appen
    /// ritar sin första ruta. Nästa `AdrazeSidaVy` för ytan (utan fragment) tar den. Bara en gång.
    ///
    /// Modulerna registreras innan UIKit har startat (AppMiljo skapas med appen), och en webbvy ska inte skapas då.
    /// Sidan skapas därför när UIKit säger att appen har startat (`didFinishLaunchingNotification`), eller när
    /// huvudtråden först är ledig om det kommer först. Då har alla moduler också lagt in sin startdata.
    static func forladda(_ yta: String) {
        guard forladdade[yta] == nil, !hamtade.contains(yta) else { return }
        vantande.insert(yta)
        if startlyssnare == nil {
            startlyssnare = NotificationCenter.default.addObserver(forName: UIApplication.didFinishLaunchingNotification,
                                                                   object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { skapaVantande() }
            }
        }
        Task { @MainActor in skapaVantande() }
    }

    private static func skapaVantande() {
        let ytor = vantande
        vantande = []
        for yta in ytor where forladdade[yta] == nil && !hamtade.contains(yta) {
            forladdade[yta] = AdrazeSida(yta: yta)
        }
        if let l = startlyssnare {
            NotificationCenter.default.removeObserver(l)
            startlyssnare = nil
        }
    }

    /// Den förladdade sidan för ytan, en gång.
    static func taForladdad(_ yta: String) -> AdrazeSida? {
        hamtade.insert(yta)
        return forladdade.removeValue(forKey: yta)
    }

    /// Visar en yta som ark eller helskärm (eller tar fram den som redan visas). Ger sidan.
    @discardableResult
    static func visa(_ yta: String, fragment: String? = nil, som lage: Sidlage) -> AdrazeSida? {
        if let k = visade[yta], k.presentingViewController != nil, !k.isBeingDismissed {
            if let fragment, !fragment.isEmpty { k.sida.visaKategori(fragment) }
            return k.sida
        }
        guard let topp = toppkontroller(fran: nil) else { return nil }
        let w = AdrazeSida(yta: yta, fragment: fragment)
        let k = AdrazeSidaKontroller(w)
        w.kontroller = k
        k.overrideUserInterfaceStyle = AppMiljo.delad?.tema.uiStil ?? .unspecified
        switch lage {
        case .ark:
            AdrazeArk.forbered(k)
        case .helskarm:
            // overFullScreen: vyerna under ligger kvar i fönstret. Med fullScreen tas de bort, och SwiftUI avbryter
            // deras .task (appens start och självtesterna körs i en .task, mätt 2026-11-17).
            k.modalPresentationStyle = .overFullScreen
            k.modalPresentationCapturesStatusBarAppearance = true
            k.statusrad = yta == "startsida" ? .lightContent : .default
        }
        k.presentationController?.delegate = k
        // Via den som visar: stänger ytan även när den själv visar en dialog överst
        w.stang = { [weak k] in k?.presentingViewController?.dismiss(animated: true) }
        k.stangd = { [weak k] in if let k, visade[yta] === k { visade.removeValue(forKey: yta) } }
        visade[yta] = k
        topp.present(k, animated: true)
        return w
    }

    /// Stänger en visad yta (`nil` = den översta).
    static func stang(_ yta: String? = nil, animerat: Bool = true) {
        let k: AdrazeSidaKontroller?
        if let yta { k = visade[yta] } else { k = visade.values.first { $0.presentedViewController == nil } ?? visade.values.first }
        guard let k else { return }
        visade.removeValue(forKey: k.sida.yta)
        k.presentingViewController?.dismiss(animated: animerat)
    }

    static func visad(_ yta: String) -> AdrazeSida? { visade[yta]?.sida }

    /// Översta kontrollern i appens fönster.
    static func toppkontroller(fran rot: UIViewController?) -> UIViewController? {
        var k = rot ?? {
            let fonster = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
            return (fonster.first(where: \.isKeyWindow) ?? fonster.first)?.rootViewController
        }()
        while let p = k?.presentedViewController, !p.isBeingDismissed { k = p }
        return k
    }
}

// MARK: - SwiftUI

/// En AdRaze-sida i en SwiftUI-vy (`app.sidor.vy`, skalets startsida i en ny flik).
struct AdrazeSidaVy: UIViewRepresentable {
    let yta: String
    var fragment: String?
    var nedre: CGFloat = 0
    var navigera: (@MainActor (URL) -> Void)?

    func makeUIView(context: Context) -> AdrazeSida {
        let forladdad = fragment == nil ? AdrazeSidor.taForladdad(yta) : nil
        let s = forladdad ?? AdrazeSida(yta: yta, fragment: fragment)
        s.iSkalet = true
        return s
    }

    func updateUIView(_ vy: AdrazeSida, context: Context) {
        vy.nedre = nedre
        vy.navigera = navigera
    }
}

/// `SidTjanst` (Gemensamt/Sidor.swift): andra moduler visar AdRaze-sidorna härifrån.
@MainActor
final class Bryggsidor: SidTjanst {
    private let transport: BryggTransport

    init(transport: BryggTransport) { self.transport = transport }

    func finns(_ yta: String) -> Bool {
        BryggTransport.preloads[yta] != nil && transport.schema.fil(for: "/\(yta).html") != nil
    }

    @discardableResult
    func visa(_ yta: String, fragment: String?, som lage: Sidlage) -> Bool {
        guard finns(yta) else { return false }
        return AdrazeSidor.visa(yta, fragment: fragment, som: lage) != nil
    }

    func stang(_ yta: String?) { AdrazeSidor.stang(yta) }

    func vy(_ yta: String, fragment: String?, nedre: CGFloat, navigera: (@MainActor (URL) -> Void)?) -> AnyView {
        AnyView(AdrazeSidaVy(yta: yta, fragment: fragment, nedre: nedre, navigera: navigera))
    }

    func forbered(_ yta: String) {
        guard finns(yta) else { return }
        AdrazeSidor.forladda(yta)
    }
}
