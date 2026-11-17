import Foundation
import Observation
import UIKit
import WebKit

/// Alla flikar (`FlikHanterare`). Håller ordningen, den aktiva fliken, stängda flikar som går att öppna igen,
/// det privata datalagret, sessionen på disk och vilka flikar som sover.
///
/// Som på datorn (`ui/shell.js`):
///  - stängs den aktiva fliken blir fliken till vänster aktiv (`tabs[max(0, i - 1)]`)
///  - stängda vanliga flikar med en adress går att öppna igen, senaste först, högst 25
///  - nya flikar hamnar sist eller bredvid den aktiva (`flikar.nyFlik`); länkar som öppnar nytt fönster hamnar
///    direkt efter fliken som öppnade dem
///  - privata flikar delar ett eget datalager som inte sparas (datorns inkognito-partition). Det släpps när den
///    sista privata fliken stängs, så nästa privata flik börjar utan kakor.
///  - privata flikar sparas aldrig till disk
///
/// iPhone har ingen app att stänga, så när den sista fliken stängs öppnas en ny tom flik (båda värdena för
/// `flikar.sistaFlik`).
@MainActor
@Observable
final class Flikmotor: FlikHanterare {
    private(set) var alla: [Webbflik] = []
    private(set) var aktivtId: UUID?
    private(set) var stangda: [StangdFlik] = []

    // MARK: - FlikHanterare

    var flikar: [any Flik] { alla }
    var aktiv: (any Flik)? { aktivFlik }

    /// Den aktiva fliken (sista fliken om inget id är satt, som stubben).
    var aktivFlik: Webbflik? { alla.first { $0.id == aktivtId } ?? alla.last }

    @ObservationIgnored unowned let app: AppMiljo
    @ObservationIgnored let lagring: Fliklagring
    @ObservationIgnored let historik: Sidhistorik
    @ObservationIgnored let bokmarken: Bokmarkesbok
    @ObservationIgnored let nedladdare: Nedladdare
    @ObservationIgnored let dialoger: Flikdialoger
    @ObservationIgnored let behorighet: Flikbehorighet
    @ObservationIgnored let sajter: Sajtminne
    @ObservationIgnored let favikoner: Favikoner
    @ObservationIgnored let forslag: Adressforslag
    /// Sant för en motor som bara läser (självtestets omstart): sparar ingenting.
    @ObservationIgnored var sparaAvstangt = false {
        didSet {
            historik.skrivskydd = sparaAvstangt
            bokmarken.skrivskydd = sparaAvstangt
            nedladdare.skrivskydd = sparaAvstangt
        }
    }
    @ObservationIgnored private var privatLagret: WKWebsiteDataStore?
    @ObservationIgnored private var sparjobb: Task<Void, Never>?
    @ObservationIgnored private var sovtimer: Timer?
    @ObservationIgnored private var prenumerationer: [Prenumeration] = []
    @ObservationIgnored private var minnesvakt: NSObjectProtocol?
    @ObservationIgnored private var harStartat = false
    @ObservationIgnored let logg = Logg("Flikar")

    static let stangdaMax = 25
    /// Högst så här många vakna flikar i bakgrunden när `flikar.sova` är på; de äldsta somnar först.
    static let maxVaknaIBakgrunden = 5

    init(app: AppMiljo, lagring: Fliklagring) {
        self.app = app
        self.lagring = lagring
        historik = Sidhistorik(lagring: lagring)
        bokmarken = Bokmarkesbok(lagring: lagring)
        nedladdare = Nedladdare(lagring: lagring, handelser: app.handelser, brygga: app.brygga)
        dialoger = Flikdialoger()
        behorighet = Flikbehorighet(installningar: app.installningar)
        sajter = Sajtminne(installningar: app.installningar)
        favikoner = Favikoner(mapp: lagring.favikonmapp)
        forslag = Adressforslag(historik: historik, bokmarken: bokmarken)
        dialoger.motor = self
        behorighet.dialoger = dialoger
    }

    /// Den aktiva fliken bara om id:t stämmer (ingen reserv), för bytena.
    var aktivStrikt: Webbflik? { alla.first { $0.id == aktivtId } }

    func flik(med id: UUID) -> Webbflik? { alla.first { $0.id == id } }

    // MARK: - Start och återställning

    /// Läser sessionen från disk: flikarna skapas sovande (utan webbvy). Anropar inga andra moduler.
    func aterstall() {
        if let s = lagring.las(Sparsession.self, fran: lagring.sessionsfil) {
            for p in s.flikar {
                let f = Webbflik(motor: self, sparad: p)
                f.sparatTillstand = lagring.lasData(lagring.tillstandsfil(p.id))
                f.miniatyr = lagring.lasMiniatyr(p.id)
                alla.append(f)
            }
            if let a = s.aktiv, alla.contains(where: { $0.id == a }) { aktivtId = a } else { aktivtId = alla.last?.id }
            logg.info("återställde \(alla.count) flikar")
        }
        if alla.isEmpty { skapaFlik(url: nil, privat: false, aktivera: true, oppnadAv: nil, placering: .sist) }
    }

    /// Från `FlikarModul.starta`: lyssnare, sovtimern och den aktiva fliken.
    func starta() {
        guard !harStartat else { return }
        harStartat = true
        prenumerationer.append(app.handelser.lyssna(AppFasAndrad.self) { [weak self] h in self?.fasAndrad(h.fas) })
        prenumerationer.append(app.handelser.lyssna(KontoAndrades.self) { [weak self] _ in self?.kontoAndrat() })
        prenumerationer.append(app.handelser.lyssna(InstallningAndrad.self) { [weak self] h in
            if h.nyckel.hasPrefix("webb.") { self?.webbInstallning(h) }
        })
        kontoAndrat()
        minnesvakt = NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification,
                                                            object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.minnesvarning() }
        }
        sovtimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.sovKoll() }
        }
        if let a = aktivStrikt, a.sover, a.harInnehall { a.vakna() }
    }

    // MARK: - Webbinställningarna i Anpassa (webb.*)

    /// Värdar som fått öppnas utan kryptering trots Endast HTTPS (tills appen startas om, som datorns `httpOk`).
    var httpTillatna: Set<String> = []

    /// Textstorleken på webbsidor som zoomfaktor (`webb.fontSize` 9–30, 16 = 1).
    var textfaktor: Double { min(30, max(9, app.installningar[.webbFontSize])) / 16 }

    /// https-adressen som en http-adress ska bytas mot med Endast HTTPS, annars `nil` (av, lokal adress eller
    /// värden har tillåtits).
    func httpsAdress(for u: URL) -> URL? {
        guard app.installningar[.webbHttpsOnly], u.scheme?.lowercased() == "http",
              let vard = u.host(percentEncoded: false)?.lowercased(), !Self.lokal(vard), !httpTillatna.contains(vard),
              var c = URLComponents(url: u, resolvingAgainstBaseURL: false) else { return nil }
        c.scheme = "https"
        if c.port == 80 { c.port = nil }
        return c.url
    }

    /// Lokala adresser uppgraderas aldrig (datorns `lokal`).
    static func lokal(_ vard: String) -> Bool {
        if vard == "localhost" || vard.hasSuffix(".localhost") || vard.hasSuffix(".local") || vard == "::1" || vard == "[::1]" { return true }
        let d = vard.split(separator: ".").compactMap { Int($0) }
        guard d.count == 4 else { return false }
        return d[0] == 127 || d[0] == 10 || (d[0] == 192 && d[1] == 168) || (d[0] == 172 && (16...31).contains(d[1]))
            || (d[0] == 169 && d[1] == 254)
    }

    private func webbInstallning(_ h: InstallningAndrad) {
        switch h.nyckel {
        case Nycklar.webbFontSize.namn:
            for f in alla where !f.sover { f.textstorlekAndrad() }
        case Nycklar.webbHttpsOnly.namn:
            if !app.installningar[.webbHttpsOnly] { httpTillatna = [] }
        default:
            break
        }
    }

    /// Rensar webbdata i flikarnas datalager: vanliga flikar och de privata flikarnas (om några är öppna).
    /// AdRaze-UI:ts eget lager (Brygga) och nycklarna i Keychain rörs inte.
    func rensaWebbdata(_ typer: Set<String>) async {
        await WKWebsiteDataStore.default().removeData(ofTypes: typer, modifiedSince: .distantPast)
        if let p = privatLagret { await p.removeData(ofTypes: typer, modifiedSince: .distantPast) }
        if typer.contains(WKWebsiteDataTypeCookies) { behorighet.glomPrivata() }
    }

    private func kontoAndrat() {
        let k = app.konto.konto
        historik.byttKonto(k?.id, barn: k?.barn ?? false)
    }

    private func fasAndrad(_ fas: AppFasAndrad.Fas) {
        switch fas {
        case .bakgrund:
            sparaNu()
        case .aktiv:
            aktivStrikt?.blevAktiv()
        case .inaktiv:
            break
        }
    }

    // MARK: - Flikarna

    enum Placering {
        case sist
        case bredvidAktiv
        /// Efter fliken (och efter flikar den redan har öppnat), för länkar som öppnar nytt fönster.
        case efter(UUID)
    }

    @discardableResult
    func nyFlik(_ url: URL?, privat: Bool, aktivera: Bool) -> any Flik {
        let plats: Placering = app.installningar[.flikarNyFlik] == "bredvid" ? .bredvidAktiv : .sist
        return skapaFlik(url: url, privat: privat, aktivera: aktivera, oppnadAv: nil, placering: plats)
    }

    /// Skapar en flik. `konfiguration` = WebKits konfiguration för ett nytt fönster (popup): webbvyn skapas med
    /// den direkt och WebKit laddar själv sidan i den.
    @discardableResult
    func skapaFlik(url: URL?, privat: Bool, aktivera: Bool, oppnadAv: UUID?, placering: Placering,
                   konfiguration: WKWebViewConfiguration? = nil) -> Webbflik {
        let f = Webbflik(motor: self, privat: privat, oppnadAv: oppnadAv)
        lagg(f, placering)
        if let konfiguration { f.vakna(konfiguration: konfiguration) }
        if let url { f.ladda(url) }
        app.handelser.skicka(FlikOppnad(flik: f.id, privat: privat, oppnadAv: oppnadAv))
        if aktivera || aktivtId == nil { self.aktivera(f.id) }
        sparaSnart()
        return f
    }

    private func lagg(_ f: Webbflik, _ placering: Placering) {
        switch placering {
        case .sist:
            alla.append(f)
        case .bredvidAktiv:
            if let i = alla.firstIndex(where: { $0.id == aktivtId }) { alla.insert(f, at: i + 1) } else { alla.append(f) }
        case .efter(let id):
            guard var i = alla.firstIndex(where: { $0.id == id }) else { alla.append(f); return }
            while i + 1 < alla.count, alla[i + 1].oppnadAv == id { i += 1 }
            alla.insert(f, at: i + 1)
        }
    }

    func aktivera(_ id: UUID) {
        guard let ny = flik(med: id) else { return }
        if let gammal = aktivStrikt, gammal.id != id {
            gammal.taMiniatyr()
            gammal.senastAktiv = Date()
        }
        let bytt = aktivtId != id
        aktivtId = id
        ny.senastAktiv = Date()
        if ny.sover, ny.harInnehall { ny.vakna() }
        ny.blevAktiv()
        if bytt {
            dialoger.flikAktiverad(id)
            app.handelser.skicka(FlikAktiverad(flik: id))
            sparaSnart()
        }
    }

    func stang(_ id: UUID) {
        guard let i = alla.firstIndex(where: { $0.id == id }) else { return }
        let f = alla[i]
        if !f.privat, let u = f.url {
            stangda.append(StangdFlik(url: u, titel: f.titel, favikon: f.favikonAdress, tillstand: f.aktuelltTillstand(),
                                      index: i, skrivbord: f.skrivbordslage, zoom: f.zoom))
            if stangda.count > Self.stangdaMax { stangda.removeFirst(stangda.count - Self.stangdaMax) }
        }
        dialoger.avbryt(flik: id)
        f.avveckla()
        alla.remove(at: i)
        if !sparaAvstangt { lagring.taBortFlikfiler(id) }
        if f.privat, !alla.contains(where: \.privat) {
            // Sista privata fliken: nästa privata flik börjar utan kakor, behörigheter och zoom.
            privatLagret = nil
            behorighet.glomPrivata()
            sajter.glomPrivata()
        }
        if aktivtId == id {
            aktivtId = nil
            if !alla.isEmpty { aktivera(alla[max(0, i - 1)].id) }
        }
        app.handelser.skicka(FlikStangd(flik: id, privat: f.privat))
        if alla.isEmpty { skapaFlik(url: nil, privat: false, aktivera: true, oppnadAv: nil, placering: .sist) }
        sparaSnart()
    }

    /// Sidan stängde sitt eget fönster (`window.close()` i en popup). Fliken som öppnade den blir aktiv igen.
    func stangFranSidan(_ f: Webbflik) {
        let varAktiv = aktivtId == f.id
        let oppnare = f.oppnadAv
        stang(f.id)
        if varAktiv, let o = oppnare, flik(med: o) != nil { aktivera(o) }
    }

    /// Öppnar den senast stängda fliken igen, med bakåt/framåt-listan (datorns Ctrl+Shift+T).
    @discardableResult
    func angraStang() -> (any Flik)? { ateroppnaStangd() }

    /// Som `angraStang()`, men ger Flikars egen typ.
    @discardableResult
    func ateroppnaStangd() -> Webbflik? {
        guard let s = stangda.popLast() else { return nil }
        let f = Webbflik(motor: self, stangd: s)
        alla.insert(f, at: min(max(0, s.index), alla.count))
        app.handelser.skicka(FlikOppnad(flik: f.id, privat: false, oppnadAv: nil))
        aktivera(f.id)
        sparaSnart()
        return f
    }

    var kanAngraStang: Bool { !stangda.isEmpty }

    func flytta(_ id: UUID, till plats: Int) {
        guard let i = alla.firstIndex(where: { $0.id == id }) else { return }
        let f = alla.remove(at: i)
        alla.insert(f, at: min(max(0, plats), alla.count))
        sparaSnart()
    }

    /// Stänger alla privata (eller alla vanliga) flikar.
    func stangAlla(privata: Bool) {
        for f in alla where f.privat == privata { stang(f.id) }
    }

    // MARK: - Privata flikar

    /// Det gemensamma datalagret för privata flikar (skapas när den första privata fliken behöver det).
    func privatLager() -> WKWebsiteDataStore {
        if let p = privatLagret { return p }
        let p = WKWebsiteDataStore.nonPersistent()
        privatLagret = p
        return p
    }

    // MARK: - Popupfönster och andra appar

    /// `createWebViewWith` från en flik: länkar med target=_blank och `window.open`. Skyddet får säga nej
    /// (popupregler per sajt, del 1) eller ge en renare adress. Den nya fliken får WebKits konfiguration (samma
    /// datalager som öppnaren, så att `window.opener` fungerar) men en egen `WKUserContentController`, så att
    /// skyddet kan läggas in på nytt utan att dubbleras i öppnarens.
    func oppnaPopup(fran oppnare: Webbflik, konfiguration: WKWebViewConfiguration, handling: WKNavigationAction) -> WKWebView? {
        let b = app.skydd.beslut(for: handling)
        guard b.tillat else {
            logg.info("popup stoppad av skyddet: \(handling.request.url?.host() ?? "?")")
            return nil
        }
        if let ny = b.nyAdress {
            skapaFlik(url: ny, privat: oppnare.privat, aktivera: true, oppnadAv: oppnare.id, placering: .efter(oppnare.id))
            return nil
        }
        let f = skapaFlik(url: nil, privat: oppnare.privat, aktivera: true, oppnadAv: oppnare.id,
                          placering: .efter(oppnare.id), konfiguration: konfiguration)
        return f.vy
    }

    /// En länk till ett annat program (mailto:, tel:, appar). Användarens egna tryck på de vanliga schemana öppnas
    /// direkt (iOS frågar själv för samtal); allt annat frågar först, som datorns behörighet `external`.
    func oppnaExternt(_ url: URL, fran flik: Webbflik, anvandarensTryck: Bool) {
        let schema = (url.scheme ?? "").lowercased()
        let farliga: Set<String> = ["javascript", "file", "adraze-app", "vbscript", "data"]
        guard !farliga.contains(schema) else { return }
        let vanliga: Set<String> = ["mailto", "tel", "sms", "facetime", "facetime-audio", "maps", "itms-apps", "itms-appss"]
        if anvandarensTryck && vanliga.contains(schema) {
            UIApplication.shared.open(url)
            return
        }
        let ursprung = Flikbehorighet.ursprung(flik.url) ?? ""
        Task { @MainActor in
            let ok = await behorighet.fragaExtern(flik: flik, ursprung: ursprung, url: url)
            if ok { _ = await UIApplication.shared.open(url) }
        }
    }

    // MARK: - Sovande flikar

    private func sovKoll() {
        let minuter = app.installningar[.flikarSova]
        guard minuter > 0 else { return }
        let nu = Date()
        for f in alla where !f.sover && f.id != aktivtId && nu.timeIntervalSince(f.senastAktiv) > Double(minuter) * 60 {
            Task { _ = await f.somnaOmMojligt() }
        }
        let vakna = alla.filter { !$0.sover && $0.id != aktivtId }.sorted { $0.senastAktiv < $1.senastAktiv }
        if vakna.count > Self.maxVaknaIBakgrunden {
            for f in vakna.prefix(vakna.count - Self.maxVaknaIBakgrunden) { Task { _ = await f.somnaOmMojligt() } }
        }
    }

    private func minnesvarning() {
        logg.varning("minnesvarning: söver flikarna i bakgrunden")
        Task { _ = await sovAllaIBakgrunden() }
    }

    /// Söver alla flikar utom den aktiva (inte de som spelar media, filmar, är i helskärm eller väntar på en
    /// dialog). Ger antalet som somnade.
    @discardableResult
    func sovAllaIBakgrunden() async -> Int {
        var n = 0
        for f in alla where !f.sover && f.id != aktivtId {
            if await f.somnaOmMojligt() { n += 1 }
        }
        return n
    }

    var antalVakna: Int { alla.filter { !$0.sover }.count }

    // MARK: - Spara

    func sparaSnart() {
        guard !sparaAvstangt else { return }
        sparjobb?.cancel()
        sparjobb = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled, let self else { return }
            self.sparaAndrat()
        }
    }

    /// Skriver sessionen och tillståndet för flikar som har ändrats.
    private func sparaAndrat() {
        guard !sparaAvstangt else { return }
        for f in alla where !f.privat && f.tillstandAndrat { f.sparaTillstand() }
        sparaSession()
    }

    /// Skriver allt direkt (när appen går i bakgrunden och i självtestet).
    func sparaNu() {
        guard !sparaAvstangt else { return }
        sparjobb?.cancel()
        for f in alla where !f.privat { f.sparaTillstand() }
        sparaSession()
        historik.sparaNu()
        bokmarken.sparaNu()
        nedladdare.sparaNu()
    }

    private func sparaSession() {
        let vanliga = alla.filter { !$0.privat }
        var aktivId = aktivtId
        if let a = aktivStrikt, a.privat {
            // Privata flikar sparas inte: den närmaste vanliga fliken till vänster blir aktiv nästa gång.
            let i = alla.firstIndex { $0.id == a.id } ?? 0
            aktivId = alla[..<i].last(where: { !$0.privat })?.id ?? vanliga.first?.id
        }
        let s = Sparsession(aktiv: aktivId, flikar: vanliga.map { $0.sparflik() }, sparad: Date().flikMs)
        lagring.skriv(s, till: lagring.sessionsfil)
    }

    /// För självtestets omstart: släpper alla webbvyer utan att spara något.
    func avvecklaAllt() {
        sparaAvstangt = true
        sparjobb?.cancel()
        sovtimer?.invalidate()
        for f in alla { f.avveckla() }
    }
}
