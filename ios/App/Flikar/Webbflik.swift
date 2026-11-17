import Foundation
import Observation
import UIKit
import WebKit

/// En flik med en vanlig webbsida (`Flik`). Webbvyn skapas först när den behövs (`webbvy`, `vakna()`) och släpps
/// när fliken sover (`somna()`); då sparas `interactionState` (bakåt/framåt-listan, rullningen och formulären,
/// iOS 15+) och läggs tillbaka när fliken vaknar.
///
/// Varje webbvy får en egen konfiguration: Safaris användaragent (`Anvandaragent.anvand(pa:)`), ett eget
/// `WKUserContentController` och skyddet (`app.skydd.forbered`) före första laddningen. Varje navigering går
/// genom `app.skydd.beslut(for:)`. Privata flikar har motorns gemensamma `WKWebsiteDataStore.nonPersistent()`.
///
/// `url` följer huvudramens bekräftade adress (didCommit) och adressbyten inom samma dokument (pushState och
/// #-länkar), aldrig en adress som bara håller på att laddas. När en sida inte går att öppna visar fliken en
/// egen felsida i webbvyn (`visarFelsida`) med den adress som inte gick, och `fel` står kvar tills nästa sida
/// laddas.
@MainActor
@Observable
final class Webbflik: Flik {
    let id: UUID
    let privat: Bool
    /// Fliken som öppnade den här (target=_blank, window.open).
    let oppnadAv: UUID?
    let skapad: Date

    private(set) var url: URL?
    private(set) var titel = ""
    private(set) var laddar = false
    private(set) var framsteg = 0.0
    private(set) var kanGaBakat = false
    private(set) var kanGaFramat = false
    private(set) var sakerAnslutning = false
    private(set) var fel: Sidfel?
    /// Fliken visar Flikars felsida (eller skyddets blockeringssida) i webbvyn.
    private(set) var visarFelsida = false
    /// Fliken har ingen webbvy just nu.
    private(set) var sover = true
    private(set) var favikon: UIImage?
    private(set) var favikonAdress: String?
    /// Bild av sidan för flikväxlaren (tas när fliken lämnas och när sidan laddats klart).
    var miniatyr: UIImage?
    /// Sidans `<meta name="theme-color">`.
    private(set) var temafarg: UIColor?
    private(set) var zoom = 1.0
    private(set) var skrivbordslage = false
    private(set) var helskarm = false
    private(set) var kameraPa = false
    private(set) var mikrofonPa = false

    @ObservationIgnored var senastAktiv: Date
    @ObservationIgnored weak var motor: Flikmotor?
    @ObservationIgnored private(set) var vy: WKWebView?
    @ObservationIgnored private var ombud: WebbflikOmbud?
    @ObservationIgnored private var kvo: [NSKeyValueObservation] = []
    @ObservationIgnored var sparatTillstand: Data?
    @ObservationIgnored var tillstandAndrat = false
    @ObservationIgnored private var felsidaNavigering: WKNavigation?
    @ObservationIgnored private var vantarFelsida: URL?
    @ObservationIgnored private var senasteFelsida: String?
    @ObservationIgnored private var provisorisk = false
    /// Typen för huvudramens senaste navigering (för fel under bakåt/framåt).
    @ObservationIgnored private var vantandeTyp: WKNavigationType?
    /// Poster i bakåt/framåt-listan som är Flikars felsidor, med felet de visar.
    @ObservationIgnored private var felposter: [ObjectIdentifier: (post: WKBackForwardListItem, fel: Sidfel)] = [:]
    /// Appen har startat en navigering (`load`, `goBack` …) som ännu inte fått sitt beslut i `beslut`.
    @ObservationIgnored private var vantarBeslut = false
    /// `stoppa()` kom innan beslutet för navigeringen till den här adressen; beslutet avbryter den.
    @ObservationIgnored private var stoppadForeBeslut: URL?
    /// Sidan som laddats klart men vars `SidaLaddad` väntar på titeln (se `klar`).
    @ObservationIgnored private var laddadUtanTitel: URL?
    @ObservationIgnored private var kraschar: [Date] = []
    @ObservationIgnored private var behoverLaddasOm = false
    @ObservationIgnored private var dialogerPaSidan = 0
    @ObservationIgnored private var stoppaDialoger = false
    /// Endast HTTPS: huvudramen gick till https i stället för http (värden och den ursprungliga adressen).
    @ObservationIgnored private var httpsUppgradering: (vard: String, fran: URL)?
    @ObservationIgnored private let logg = Logg("Flik")

    init(motor: Flikmotor, privat: Bool, oppnadAv: UUID?) {
        id = UUID()
        self.privat = privat
        self.oppnadAv = oppnadAv
        skapad = Date()
        senastAktiv = Date()
        self.motor = motor
    }

    /// En flik från sessionen på disk (sover tills den behövs).
    init(motor: Flikmotor, sparad p: Sparflik) {
        id = p.id
        privat = false
        oppnadAv = p.oppnadAv
        skapad = Date(flikMs: p.skapad)
        senastAktiv = Date(flikMs: p.aktiv)
        self.motor = motor
        url = p.url.flatMap { URL(string: $0) }
        titel = p.titel
        kanGaBakat = p.bakat
        kanGaFramat = p.framat
        favikonAdress = p.favikon
        favikon = p.favikon.flatMap { motor.favikoner.cachad($0) }
        zoom = p.zoom ?? 1
        skrivbordslage = p.skrivbord ?? false
    }

    /// En stängd flik som öppnas igen.
    init(motor: Flikmotor, stangd s: StangdFlik) {
        id = UUID()
        privat = false
        oppnadAv = nil
        skapad = Date()
        senastAktiv = Date()
        self.motor = motor
        url = s.url
        titel = s.titel
        favikonAdress = s.favikon
        favikon = s.favikon.flatMap { motor.favikoner.cachad($0) }
        sparatTillstand = s.tillstand
        skrivbordslage = s.skrivbord
        zoom = s.zoom
    }

    /// Fliken har en sida att visa (eller ett sparat tillstånd), inte en tom ny flik.
    var harInnehall: Bool { url != nil || sparatTillstand != nil }

    // MARK: - Webbvyn

    var webbvy: WKWebView { vy ?? vakna() }

    /// Skapar webbvyn (om den saknas) och lägger tillbaka sidan. `konfiguration` = WebKits konfiguration för ett
    /// nytt fönster; då laddar WebKit själv sidan.
    @discardableResult
    func vakna(konfiguration: WKWebViewConfiguration? = nil) -> WKWebView {
        if let vy { return vy }
        let k = konfiguration ?? WKWebViewConfiguration()
        if konfiguration == nil {
            k.websiteDataStore = privat ? (motor?.privatLager() ?? .nonPersistent()) : .default()
        }
        // Eget WKUserContentController även för popupfönster: WebKits kopia delar annars öppnarens, och skyddets
        // listor och skript skulle läggas in två gånger där.
        k.userContentController = WKUserContentController()
        Anvandaragent.anvand(pa: k)
        k.allowsInlineMediaPlayback = true
        k.allowsPictureInPictureMediaPlayback = true
        k.allowsAirPlayForMediaPlayback = true
        k.mediaTypesRequiringUserActionForPlayback = .audio
        k.ignoresViewportScaleLimits = true
        k.preferences.isElementFullscreenEnabled = true
        k.preferences.javaScriptCanOpenWindowsAutomatically = false
        k.defaultWebpagePreferences.preferredContentMode = skrivbordslage ? .desktop : .mobile

        let v = WKWebView(frame: Flikfonster.ram(), configuration: k)
        v.allowsBackForwardNavigationGestures = true
        v.allowsLinkPreview = true
        v.isFindInteractionEnabled = true
        if skrivbordslage { v.customUserAgent = Self.skrivbordsagent }
        #if DEBUG
        v.isInspectable = true
        #endif
        let o = WebbflikOmbud(self)
        ombud = o
        v.navigationDelegate = o
        v.uiDelegate = o
        vy = v
        bevaka(v)
        Flikmeny.forbered(v)
        motor?.app.skydd.forbered(v, privat: privat)
        let z = verkligZoom(zoom)
        if z != 1 { v.pageZoom = z }
        sover = false
        if konfiguration == nil {
            if let d = sparatTillstand {
                appnavigering()
                v.interactionState = d
            } else if let u = url {
                appnavigering()
                v.load(URLRequest(url: u))
            }
        }
        motor?.app.handelser.skicka(FlikVaknade(flik: id))
        return v
    }

    private func bevaka(_ v: WKWebView) {
        kvo = [
            v.observe(\.title, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.titelAndrad(wv) }
            },
            v.observe(\.url, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.adressAndrad(wv) }
            },
            v.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated {
                    self?.laddar = wv.isLoading
                    if !wv.isLoading { self?.adressAndrad(wv) }
                }
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
                MainActor.assumeIsolated { self?.helskarmAndrad(wv) }
            },
            v.observe(\.cameraCaptureState, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.kameraPa = wv.cameraCaptureState != WKMediaCaptureState.none }
            },
            v.observe(\.microphoneCaptureState, options: [.new]) { [weak self] wv, _ in
                MainActor.assumeIsolated { self?.mikrofonPa = wv.microphoneCaptureState != WKMediaCaptureState.none }
            },
        ]
    }

    private func titelAndrad(_ wv: WKWebView) {
        titel = wv.title ?? ""
        if !privat, !visarFelsida, vantarFelsida == nil, let u = url, !titel.isEmpty { motor?.historik.titel(titel, for: u) }
        if let u = laddadUtanTitel, !titel.isEmpty, wv.url == u { skickaLaddad(u) }
    }

    /// Adressbyten inom samma dokument (pushState, #-länkar, bakåt inom sidan). Medan webbvyn laddar är
    /// `wv.url` adressen som är på väg (WebKit byter den direkt vid `load` och `goBack`, innan något har
    /// laddats), så då väntar vi: bekräftade sidor tas hand om i `bekraftad`, och byten inom sidan under
    /// laddningen kommer hit igen när `isLoading` blir falskt.
    private func adressAndrad(_ wv: WKWebView) {
        guard !wv.isLoading, vantarFelsida == nil, !visarFelsida, let ny = wv.url, ny != url else { return }
        url = ny
        tillstandAndrat = true
        if !privat { motor?.historik.besok(ny, titel: wv.title ?? "", favikon: favikonAdress) }
        motor?.sparaSnart()
    }

    private func helskarmAndrad(_ wv: WKWebView) {
        let ny = wv.fullscreenState == .inFullscreen || wv.fullscreenState == .enteringFullscreen
        guard ny != helskarm else { return }
        helskarm = ny
        motor?.app.handelser.skicka(FlikHelskarm(flik: id, helskarm: ny))
    }

    // MARK: - Flik

    func ladda(_ url: URL) {
        fel = nil
        visarFelsida = false
        let v = webbvy
        appnavigering()
        v.load(URLRequest(url: url))
    }

    func ladda(text: String) {
        guard let motor, let u = Webbadress.tolka(text, privat: privat, installningar: motor.app.installningar) else { return }
        ladda(u)
    }

    func bakat() {
        guard harInnehall else { return }
        let v = webbvy
        if v.canGoBack { appnavigering() }
        v.goBack()
    }

    func framat() {
        guard harInnehall else { return }
        let v = webbvy
        if v.canGoForward { appnavigering() }
        v.goForward()
    }

    func laddaOm() {
        if visarFelsida, let u = fel?.url {
            ladda(u)
            return
        }
        guard harInnehall else { return }
        let v = webbvy
        appnavigering()
        if v.url != nil { v.reload() } else if let u = url { v.load(URLRequest(url: u)) }
    }

    /// Stoppar laddningen. Kommer stoppet innan WebKit har frågat `beslut` om navigeringen glömmer WebKit att den
    /// avbröts: `isLoading` blir kvar som sant och varken fel eller klar kommer (uppmätt i självtestet, iOS 26.1;
    /// frågan om beslutet kommer ändå, strax efter stoppet). Då avbryter `beslut` navigeringen, vilket WebKit
    /// räknar som slutet på den.
    func stoppa() {
        guard let v = vy else { return }
        if vantarBeslut, v.isLoading, let u = v.url { stoppadForeBeslut = u }
        v.stopLoading()
    }

    /// Före varje navigering som appen startar (inte sidan själv), se `stoppa()`.
    private func appnavigering() {
        vantarBeslut = true
        stoppadForeBeslut = nil
    }

    // MARK: - Sova och vakna

    var kanSova: Bool {
        vy != nil && !helskarm && !kameraPa && !mikrofonPa && !(motor?.dialoger.harFraga(for: id) ?? false)
    }

    /// Söver fliken om den inte spelar media, filmar, är i helskärm eller väntar på en dialog.
    @discardableResult
    func somnaOmMojligt() async -> Bool {
        guard let v = vy, kanSova else { return false }
        let media = await Self.mediastatus(v)
        guard media != .playing, vy === v, motor?.aktivtId != id, kanSova else { return false }
        somna()
        return true
    }

    /// Spelar sidan media? En pausad webbinnehållsprocess svarar inte förrän den väcks, så efter en sekund utan
    /// svar räknas det som nej (en process som spelar upp pausas inte).
    static func mediastatus(_ v: WKWebView) async -> WKMediaPlaybackState {
        let svar = Engangsvarde<WKMediaPlaybackState>()
        return await withCheckedContinuation { (c: CheckedContinuation<WKMediaPlaybackState, Never>) in
            svar.vid { c.resume(returning: $0) }
            v.requestMediaPlaybackState(completionHandler: { svar.satt($0) })
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { svar.satt(WKMediaPlaybackState.none) }
        }
    }

    /// Släpper webbvyn. Tillståndet sparas och läggs tillbaka i `vakna()`.
    func somna() {
        guard let v = vy else { return }
        sparatTillstand = v.interactionState as? Data
        if !privat, let motor, !motor.sparaAvstangt {
            motor.lagring.skrivData(sparatTillstand, till: motor.lagring.tillstandsfil(id))
        }
        tillstandAndrat = false
        avvecklaVy()
        sover = true
        laddar = false
        framsteg = 0
        motor?.app.handelser.skicka(FlikSomnade(flik: id))
    }

    /// När fliken stängs.
    func avveckla() {
        avvecklaVy()
        sover = true
    }

    private func avvecklaVy() {
        guard let v = vy else { return }
        kvo.forEach { $0.invalidate() }
        kvo = []
        v.stopLoading()
        v.navigationDelegate = nil
        v.uiDelegate = nil
        v.removeFromSuperview()
        vy = nil
        ombud = nil
        felsidaNavigering = nil
        vantarFelsida = nil
        provisorisk = false
        vantandeTyp = nil
        felposter = [:]
        vantarBeslut = false
        stoppadForeBeslut = nil
        laddadUtanTitel = nil
    }

    /// Fliken blev aktiv: ladda om om webbinnehållets process dog medan den låg i bakgrunden.
    func blevAktiv() {
        guard behoverLaddasOm, let v = vy else { return }
        behoverLaddasOm = false
        appnavigering()
        if v.url != nil { v.reload() } else if let u = url { v.load(URLRequest(url: u)) }
    }

    // MARK: - Sparas mellan starterna

    func sparflik() -> Sparflik {
        Sparflik(id: id, url: url?.absoluteString, titel: titel, favikon: favikonAdress, bakat: kanGaBakat, framat: kanGaFramat,
                 zoom: zoom == 1 ? nil : zoom, skrivbord: skrivbordslage ? true : nil, skapad: skapad.flikMs,
                 aktiv: senastAktiv.flikMs, oppnadAv: oppnadAv)
    }

    func sparaTillstand() {
        guard !privat, let motor, !motor.sparaAvstangt else { return }
        if let v = vy { sparatTillstand = v.interactionState as? Data }
        motor.lagring.skrivData(sparatTillstand, till: motor.lagring.tillstandsfil(id))
        tillstandAndrat = false
    }

    func aktuelltTillstand() -> Data? { (vy?.interactionState as? Data) ?? sparatTillstand }

    // MARK: - Navigeringen (från WebbflikOmbud)

    static let webbscheman: Set<String> = ["http", "https", "about", "blob", "data"]

    func beslut(_ h: WKNavigationAction, _ p: WKWebpagePreferences) -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        guard let motor, let adress = h.request.url else { return (.allow, p) }
        let nyttFonster = h.targetFrame == nil
        let huvudram = h.targetFrame?.isMainFrame ?? false
        if huvudram, vantarBeslut {
            vantarBeslut = false
            let stoppad = stoppadForeBeslut
            stoppadForeBeslut = nil
            if let stoppad, adress == stoppad {
                logg.info("stoppad före beslutet: \(adress.host() ?? "?")\(adress.path)")
                return (.cancel, p)
            }
        }
        // Vår egen felsida (loadSimulatedRequest med adressen som inte gick).
        if huvudram, let f = vantarFelsida, adress == f {
            p.allowsContentJavaScript = true
            return (.allow, p)
        }
        // "Tillbaka" på vår felsida.
        if huvudram, visarFelsida, adress.fragment == Flikfelsida.tillbakaFragment, Self.sammaDokument(adress, vy?.url) {
            tillbakaFranFelsida()
            return (.cancel, p)
        }
        // "Fortsätt utan kryptering" på felsidan för Endast HTTPS: värden får http tills appen startas om.
        if huvudram, visarFelsida, adress.fragment == Flikfelsida.osakertFragment, Self.sammaDokument(adress, vy?.url),
           let u = fel?.url, let vard = u.host(percentEncoded: false)?.lowercased() {
            motor.httpTillatna.insert(vard)
            appnavigering()
            vy?.load(URLRequest(url: u))
            return (.cancel, p)
        }
        let schema = (adress.scheme ?? "").lowercased()
        if !Self.webbscheman.contains(schema) {
            // mailto:, tel:, appar. adraze-app: och file: öppnas aldrig (3.4).
            if huvudram || nyttFonster { motor.oppnaExternt(adress, fran: self, anvandarensTryck: h.navigationType == .linkActivated) }
            return (.cancel, p)
        }
        if h.shouldPerformDownload { return (.download, p) }
        let b = motor.app.skydd.beslut(for: h)
        guard b.tillat else { return (.cancel, p) }
        if let ny = b.nyAdress, ny != adress, huvudram {
            appnavigering()
            vy?.load(URLRequest(url: ny))
            return (.cancel, p)
        }
        // Endast HTTPS (webb.httpsOnly): huvudsidan hämtas med https; går det inte visas felsidan med "Fortsätt
        // utan kryptering" (som datorns webbinst.js upgradeUrl och httpsFailed).
        if huvudram, schema == "http", let https = motor.httpsAdress(for: adress) {
            httpsUppgradering = ((https.host(percentEncoded: false) ?? "").lowercased(), adress)
            appnavigering()
            vy?.load(URLRequest(url: https))
            return (.cancel, p)
        }
        p.allowsContentJavaScript = b.javascript
        p.preferredContentMode = skrivbordslage ? .desktop : .mobile
        if huvudram, !Self.sammaDokument(adress, vy?.url) { vantandeTyp = h.navigationType }
        return (.allow, p)
    }

    /// Fel som betyder att sajten inte har (fungerande) https (datorns `HTTPS_FAIL`).
    static let httpsFel: Set<Int> = [
        NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateUntrusted,
        NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid, NSURLErrorCannotConnectToHost,
        NSURLErrorTimedOut, NSURLErrorNetworkConnectionLost, NSURLErrorBadServerResponse,
    ]

    /// `a` och `b` är samma dokument med olika #-del (då laddas ingen ny sida).
    static func sammaDokument(_ a: URL, _ b: URL?) -> Bool {
        guard let b, a.fragment != nil || b.fragment != nil else { return false }
        func utan(_ u: URL) -> Substring { let s = u.absoluteString; return s[..<(s.firstIndex(of: "#") ?? s.endIndex)] }
        return utan(a) == utan(b)
    }

    func svarsbeslut(_ r: WKNavigationResponse) -> WKNavigationResponsePolicy {
        if let http = r.response as? HTTPURLResponse,
           (http.value(forHTTPHeaderField: "Content-Disposition") ?? "").lowercased().hasPrefix("attachment") {
            return r.isForMainFrame ? .download : .cancel
        }
        if !r.canShowMIMEType { return r.isForMainFrame ? .download : .cancel }
        return .allow
    }

    func borjade(_ v: WKWebView, _ n: WKNavigation?) {
        provisorisk = true
    }

    func bekraftad(_ v: WKWebView, _ n: WKNavigation?) {
        provisorisk = false
        vantandeTyp = nil
        if let u = laddadUtanTitel { skickaLaddad(u) }
        if let fn = felsidaNavigering, let n, fn === n {
            felsidaNavigering = nil
            vantarFelsida = nil
            visarFelsida = true
            url = fel?.url ?? v.url
            temafarg = nil
            if let post = v.backForwardList.currentItem, let fel {
                if felposter.count > 40 {
                    let kvar = Set((v.backForwardList.backList + v.backForwardList.forwardList).map(ObjectIdentifier.init))
                    felposter = felposter.filter { kvar.contains($0.key) }
                }
                felposter[ObjectIdentifier(post)] = (post, fel)
            }
            return
        }
        felsidaNavigering = nil
        vantarFelsida = nil
        // En felsida som kom tillbaka ur bakåt/framåt-cachen.
        if let post = v.backForwardList.currentItem, let fp = felposter[ObjectIdentifier(post)] {
            visarFelsida = true
            fel = fp.fel
            url = fp.fel.url ?? v.url
            temafarg = nil
            return
        }
        visarFelsida = false
        fel = nil
        if let upg = httpsUppgradering, v.url?.host(percentEncoded: false)?.lowercased() != upg.vard { httpsUppgradering = nil }
        let forra = url
        url = v.url
        if forra?.host() != v.url?.host() {
            favikon = nil
            favikonAdress = nil
        }
        dialogerPaSidan = 0
        stoppaDialoger = false
        tillstandAndrat = true
        tillampaZoom(v.url)
        guard let motor, let u = v.url else { return }
        motor.app.handelser.skicka(FlikNavigerade(flik: id, url: u, privat: privat))
        if !privat { motor.historik.besok(u, titel: v.title ?? "", favikon: favikonAdress) }
        motor.sparaSnart()
    }

    func klar(_ v: WKWebView, _ n: WKNavigation?) {
        laddar = v.isLoading
        guard !visarFelsida, let motor, let u = v.url else { return }
        titel = v.title ?? titel
        // WebKit kan ge titeln strax efter didFinish (uppmätt i självtestet: första sidan i en ny flik fick titeln
        // 5 ms efter), så `SidaLaddad` väntar på den en kort stund.
        laddadUtanTitel = u
        if titel.isEmpty {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                MainActor.assumeIsolated { self?.skickaLaddad(u) }
            }
        } else {
            skickaLaddad(u)
        }
        if !privat, !titel.isEmpty { motor.historik.titel(titel, for: u) }
        hamtaFavikon(v)
        if motor.aktivStrikt === self {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                MainActor.assumeIsolated {
                    guard let self, self.motor?.aktivStrikt === self else { return }
                    self.taMiniatyr()
                }
            }
        }
        tillstandAndrat = true
        motor.sparaSnart()
    }

    private func skickaLaddad(_ u: URL) {
        guard laddadUtanTitel == u else { return }
        laddadUtanTitel = nil
        motor?.app.handelser.skicka(SidaLaddad(flik: id, url: u, titel: titel, privat: privat))
    }

    func misslyckades(_ v: WKWebView, _ n: WKNavigation?, _ e: Error, provisoriskt: Bool) {
        let ns = e as NSError
        provisorisk = false
        laddar = v.isLoading
        // Felsidan själv gick inte att visa (till exempel stoppad av en regellista igen): enklare form utan adress.
        if let fn = felsidaNavigering, let n, fn === n {
            felsidaNavigering = nil
            vantarFelsida = nil
            if let html = senasteFelsida {
                senasteFelsida = nil
                felsidaNavigering = v.loadHTMLString(html, baseURL: nil)
            }
            return
        }
        let typ = vantandeTyp
        vantandeTyp = nil
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        // 102: navigeringen blev en nedladdning eller stoppades av ett beslut. 204: ett insticksprogram tog över.
        if ns.domain == "WebKitErrorDomain" && (ns.code == 102 || ns.code == 204) { return }
        let adress = (ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? v.url
        logg.varning("\(adress?.host() ?? "?"): \(ns.domain) \(ns.code) \(ns.localizedDescription)\(provisoriskt ? "" : " (efter bekräftelse)")")
        // Ett fel efter att sidan bekräftats (sidan syns redan, kanske halvt) ersätts inte med en felsida.
        guard provisoriskt else { return }
        // Endast HTTPS och sajten svarar inte säkert: felsidan för den ursprungliga http-adressen.
        if let upg = httpsUppgradering, let motor, ns.domain == NSURLErrorDomain, Self.httpsFel.contains(ns.code),
           adress?.host(percentEncoded: false)?.lowercased() == upg.vard {
            httpsUppgradering = nil
            let tom = Sidfel(url: upg.fran, doman: Flikfelsida.httpsdoman, kod: ns.code, text: "")
            let f = Sidfel(url: upg.fran, doman: Flikfelsida.httpsdoman, kod: ns.code, text: Flikfelsida.innehall(for: tom).text)
            fel = f
            visaFelsida(Flikfelsida.html(for: f, tema: motor.app.tema, kanGaBakat: harRiktigSidaBakom(v, upg.fran)), for: upg.fran, i: v)
            return
        }
        let f = Self.sidfel(e, url: adress)
        fel = f
        // Bakåt eller framåt till en sida som inte går att ladda: en ny felsida skulle hamna efter den här sidan i
        // listan (WebKit har inget publikt sätt att visa en felsida på postens plats). Fliken står kvar med `fel`
        // satt; var målet en av våra felsidor hoppar vi förbi den.
        if typ == .backForward {
            if let forbi = forbiFelpost(v, adress) {
                appnavigering()
                v.go(to: forbi)
            }
            return
        }
        guard let motor, let u = f.url else { return }
        var html: String?
        if f.blockeradAvSkyddet { html = motor.app.skydd.blockeringssida(for: u, flik: id) }
        visaFelsida(html ?? Flikfelsida.html(for: f, tema: motor.app.tema, kanGaBakat: harRiktigSidaBakom(v, u)), for: u, i: v)
    }

    /// Felet med felsidans svenska text i `text` (systemets text är på telefonens språk, och skalet visar `text`).
    static func sidfel(_ e: Error, url: URL?) -> Sidfel {
        let ns = e as NSError
        let ra = Sidfel(ns, url: url)
        guard !ra.avbruten else { return ra }
        var info = ns.userInfo
        info[NSLocalizedDescriptionKey] = Flikfelsida.innehall(for: ra).text
        if let u = ra.url { info[NSURLErrorFailingURLErrorKey] = u }
        return Sidfel(NSError(domain: ns.domain, code: ns.code, userInfo: info), url: ra.url)
    }

    /// Finns det en riktig sida (inte en av våra felsidor) att gå tillbaka till när felsidan för `u` visas?
    /// Felsidan för samma adress som den aktuella posten ersätter posten (WebKit laddar samma adress som en
    /// omladdning), annars hamnar den aktuella posten bakom felsidan.
    private func harRiktigSidaBakom(_ v: WKWebView, _ u: URL) -> Bool {
        let lista = v.backForwardList
        var bakom = lista.backList
        if let c = lista.currentItem, c.url != u { bakom.append(c) }
        return bakom.contains { felposter[ObjectIdentifier($0)] == nil }
    }

    /// Till närmaste post bakåt som inte är en felsida.
    func tillbakaFranFelsida() {
        guard let v = vy else { return }
        if let mal = v.backForwardList.backList.last(where: { felposter[ObjectIdentifier($0)] == nil }) {
            appnavigering()
            v.go(to: mal)
        } else if v.canGoBack {
            appnavigering()
            v.goBack()
        }
    }

    /// Posten bortom en av Flikars felsidor med adressen `adress`, i bakåt- eller framåtriktningen.
    private func forbiFelpost(_ v: WKWebView, _ adress: URL?) -> WKBackForwardListItem? {
        guard let adress else { return nil }
        let bakat = v.backForwardList.backList
        if let i = bakat.lastIndex(where: { $0.url == adress && felposter[ObjectIdentifier($0)] != nil }) {
            return i > 0 ? bakat[i - 1] : nil
        }
        let framat = v.backForwardList.forwardList
        if let i = framat.firstIndex(where: { $0.url == adress && felposter[ObjectIdentifier($0)] != nil }) {
            return i + 1 < framat.count ? framat[i + 1] : nil
        }
        return nil
    }

    private func visaFelsida(_ html: String, for u: URL, i v: WKWebView) {
        senasteFelsida = html
        vantarFelsida = u
        felsidaNavigering = v.loadSimulatedRequest(URLRequest(url: u), responseHTML: html)
    }

    func processenDog(_ v: WKWebView) {
        let nu = Date()
        kraschar = kraschar.filter { nu.timeIntervalSince($0) < 30 } + [nu]
        laddar = false
        logg.varning("webbinnehållets process avslutades (\(kraschar.count) gång(er) på 30 s)")
        guard v.window != nil else {
            behoverLaddasOm = true
            return
        }
        if kraschar.count >= 3, let u = url, let motor {
            let f = Self.sidfel(NSError(domain: Flikfelsida.kraschdoman, code: 1), url: u)
            fel = f
            visaFelsida(Flikfelsida.html(for: f, tema: motor.app.tema, kanGaBakat: v.canGoBack), for: u, i: v)
        } else if v.url != nil {
            appnavigering()
            v.reload()
        } else if let u = url {
            appnavigering()
            v.load(URLRequest(url: u))
        }
    }

    func blevNedladdning(_ d: WKDownload) {
        motor?.nedladdare.borja(d, flik: self)
    }

    // MARK: - Inloggning och dialoger

    func autentisering(_ c: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        let metod = c.protectionSpace.authenticationMethod
        let fragar = [NSURLAuthenticationMethodHTTPBasic, NSURLAuthenticationMethodHTTPDigest, NSURLAuthenticationMethodNTLM,
                      NSURLAuthenticationMethodDefault]
        guard fragar.contains(metod), let motor else { return (.performDefaultHandling, nil) }
        let ps = c.protectionSpace
        let vard = ps.port > 0 && ps.port != 80 && ps.port != 443 ? "\(ps.host):\(ps.port)" : ps.host
        let svar = await motor.dialoger.fraga(flik: id, ursprung: vard,
                                              slag: .inloggning(rike: ps.realm, saker: ps.receivesCredentialSecurely,
                                                                igen: c.previousFailureCount > 0))
        guard svar.ok, let anv = svar.anvandare, !anv.isEmpty else { return (.rejectProtectionSpace, nil) }
        return (.useCredential, URLCredential(user: anv, password: svar.losenord ?? "", persistence: .forSession))
    }

    /// alert, confirm och prompt. Efter två rutor på samma sida går det att stoppa fler (som i Chrome).
    func jsDialog(_ slag: Flikdialogslag, ram: WKFrameInfo) async -> Dialogsvar {
        guard let motor, !stoppaDialoger else { return Dialogsvar(ok: false) }
        dialogerPaSidan += 1
        let svar = await motor.dialoger.fraga(flik: id, ursprung: Flikbehorighet.visning(ram.securityOrigin), slag: slag,
                                              visaStoppa: dialogerPaSidan > 2)
        if svar.stoppaFler { stoppaDialoger = true }
        return svar
    }

    func mediabehorighet(_ origin: WKSecurityOrigin, typ: WKMediaCaptureType) async -> WKPermissionDecision {
        guard let motor else { return .deny }
        let slag: [String]
        switch typ {
        case .camera: slag = ["camera"]
        case .microphone: slag = ["microphone"]
        case .cameraAndMicrophone: slag = ["camera", "microphone"]
        @unknown default: slag = ["camera", "microphone"]
        }
        return await motor.behorighet.fraga(flik: self, ursprung: Flikbehorighet.ursprung(origin), slag: slag) ? .grant : .deny
    }

    func rorelsebehorighet(_ origin: WKSecurityOrigin) async -> WKPermissionDecision {
        guard let motor else { return .deny }
        return await motor.behorighet.fraga(flik: self, ursprung: Flikbehorighet.ursprung(origin), slag: ["sensors"]) ? .grant : .deny
    }

    func kontextmeny(_ info: WKContextMenuElementInfo) async -> UIContextMenuConfiguration? {
        guard let motor, let v = vy else { return nil }
        let element = await Flikmeny.element(i: v, vid: nil)
        return Flikmeny.konfiguration(for: self, motor: motor, lank: info.linkURL ?? element.lank, bild: element.bild)
    }

    // MARK: - Zoom, skrivbordsläge, sök

    /// Sidans zoom (0,5–3). Sparas per sajt i `sajt.<domän>` som på datorn, utom i privata flikar.
    func sattZoom(_ z: Double) {
        let z = Sajtminne.begransa(z)
        if zoom != z { zoom = z }
        vy?.pageZoom = verkligZoom(z)
        if let vard = url?.host(percentEncoded: false) { motor?.sajter.sparaZoom(z, vard: vard, privat: privat) }
    }

    /// Ett steg i datorns zoomsteg (`ZOOM_STEG`).
    func zooma(inat: Bool) { sattZoom(Sajtminne.steg(fran: zoom, inat: inat)) }

    private func tillampaZoom(_ u: URL?) {
        guard let motor else { return }
        let z = u?.host(percentEncoded: false).map { motor.sajter.zoom(vard: $0, privat: privat) } ?? 1
        if zoom != z { zoom = z }
        if let v = vy, abs(v.pageZoom - verkligZoom(z)) > 0.0001 { v.pageZoom = verkligZoom(z) }
    }

    /// Sajtens zoom gånger textstorleken i Anpassa (`webb.fontSize`, 16 = 100 %). iOS har inget publikt sätt att
    /// ändra webbsidornas standardtypsnitt som datorns `defaultFontSize`, så storleken blir sidzoom, som Safaris
    /// textstorlek (aA): sidan skalas och radbryts om.
    private func verkligZoom(_ z: Double) -> CGFloat {
        CGFloat(min(5, max(0.25, z * (motor?.textfaktor ?? 1))))
    }

    /// Textstorleken i Anpassa ändrades: samma sajtzoom med den nya faktorn.
    func textstorlekAndrad() {
        if let v = vy { v.pageZoom = verkligZoom(zoom) }
    }

    /// Begär skrivbordsversionen (som Safaris "Begär datorwebbplats"): datorns användaragent och
    /// `preferredContentMode = .desktop`, och sidan laddas om.
    func sattSkrivbordslage(_ pa: Bool) {
        guard pa != skrivbordslage else { return }
        skrivbordslage = pa
        motor?.sparaSnart()
        guard let v = vy else { return }
        v.customUserAgent = pa ? Self.skrivbordsagent : nil
        if v.url != nil { v.reload() }
    }

    /// Safari på Mac (versionen följer iOS, som `Anvandaragent`). `applicationNameForUserAgent` ger annars
    /// `Mobile/15E148` även i datorläget.
    static var skrivbordsagent: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
            + "Version/\(v.majorVersion).\(v.minorVersion) Safari/605.1.15"
    }

    /// Söker på sidan (markerar första träffen) och ger antalet träffar i sidans text.
    func hitta(_ text: String) async -> Int {
        guard let v = vy, !text.isEmpty else { return 0 }
        let k = WKFindConfiguration()
        k.caseSensitive = false
        k.wraps = true
        _ = try? await v.find(text, configuration: k)
        let n = try? await v.callAsyncJavaScript(Flikmeny.raknaJS, arguments: ["t": text], in: nil, contentWorld: Flikmeny.varld)
        return (n as? NSNumber)?.intValue ?? 0
    }

    /// Systemets sökfält för sidan (UIFindInteraction, iOS 16+).
    func visaSokfalt(_ text: String? = nil) {
        guard let v = vy else { return }
        v.isFindInteractionEnabled = true
        if let text { v.findInteraction?.searchText = text }
        v.findInteraction?.presentFindNavigator(showingReplace: false)
    }

    // MARK: - Favikon och miniatyr

    private func hamtaFavikon(_ v: WKWebView) {
        guard let motor else { return }
        let sidan = v.url
        let privat = privat
        Task { @MainActor [weak self] in
            let svar = try? await v.callAsyncJavaScript(Flikmeny.favikonJS, arguments: [:], in: nil, contentWorld: Flikmeny.varld)
            var kandidater = (svar as? [String]) ?? []
            if let s = sidan, let vard = s.host(), let schema = s.scheme {
                kandidater.append("\(schema)://\(vard)\(s.port.map { ":\($0)" } ?? "")/favicon.ico")
            }
            for adress in kandidater {
                guard let bild = await motor.favikoner.hamta(adress, privat: privat, sida: v) else { continue }
                guard let self, self.vy === v, v.url == sidan else { return }
                self.favikon = bild
                self.favikonAdress = adress
                if !privat, let s = sidan { motor.historik.favikon(adress, for: s) }
                return
            }
        }
    }

    /// Bild av sidan för flikväxlaren. Tas bara när webbvyn syns (en vy utanför fönstret ger en tom bild).
    func taMiniatyr() {
        guard let v = vy, v.window != nil, url != nil else { return }
        let k = WKSnapshotConfiguration()
        k.snapshotWidth = NSNumber(value: 300)
        v.takeSnapshot(with: k) { [weak self] bild, _ in
            guard let self, let bild else { return }
            self.miniatyr = bild
            if !self.privat, let m = self.motor, !m.sparaAvstangt { m.lagring.sparaMiniatyr(bild, id: self.id) }
        }
    }
}

/// Ett värde som sätts en gång (från vilken tråd som helst) och lämnas till den som väntar.
final class Engangsvarde<T>: @unchecked Sendable {
    private let las = NSLock()
    private var varde: T?
    private var mottagare: ((T) -> Void)?
    private var klar = false

    func vid(_ f: @escaping (T) -> Void) {
        las.lock()
        if let v = varde, !klar {
            klar = true
            las.unlock()
            f(v)
            return
        }
        mottagare = f
        las.unlock()
    }

    func satt(_ v: T) {
        las.lock()
        guard !klar, varde == nil else {
            las.unlock()
            return
        }
        varde = v
        if let m = mottagare {
            klar = true
            mottagare = nil
            las.unlock()
            m(v)
            return
        }
        las.unlock()
    }
}
