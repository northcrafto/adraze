import Foundation
import Observation
import UIKit
import WebKit

/// Skyddet i flikarna (steg 1 och 3 i del 3, 3.7): WebKits regellistor översatta från tilläggets DNR-regler,
/// stoppsidan, paus per sajt, kosmetik, kakrutor, scriptlets, popupvakten och spårningsparametrar.
///
/// Per webbvy:
///  - Listorna läggs i vyns `userContentController` när de är klara och byts per huvudsida i `beslut(for:)`:
///    pausad sajt = bara "sidor" (stoppsidan för farliga sidor), "Fortsätt ändå" = allt utom "sidor",
///    nivå enkel = utan "kosmetik" (generiska dölj-regler). Inloggning och betalning får alla listor, men
///    listorna har själva undantag för de värdarna (som datorns `ADBLOCK_ALLOW`).
///  - Innehållsskripten byggs för huvudsidans värd (`Skriptbygge`) och byts innan sidan laddas. Andra modulers
///    skript i samma `userContentController` lämnas kvar.
///  - En annonsvärd som skickar fliken till en annan sajt: stopplistan (`Regellistor.stopp`) läggs i vyn för just
///    den navigeringen, WebKit stoppar adressen med fel 104 och Flikar visar stoppsidan med adressen.
///
/// Ägare: Skydd.
@MainActor
@Observable
final class Skydd: SkyddTjanst {
    private(set) var lage: Skyddslage = .av

    let app: AppMiljo
    let data: Regeldata
    let listor = Regellistor()
    let raknare = Raknare()
    /// Ökar när någon flik räknat något eller nollställts, så att skölden ritas om.
    private(set) var raknarversion = 0

    @ObservationIgnored private var vyer: [ObjectIdentifier: Vystatus] = [:]
    /// Värdar som fått "Fortsätt ändå" (resten av sessionen, som tilläggets session-regel).
    @ObservationIgnored private(set) var fortsatt: Set<String> = []
    @ObservationIgnored private var biljetter: [String: Biljett] = [:]
    @ObservationIgnored private var skriptcache: [String: [Skriptdel]] = [:]
    @ObservationIgnored private var skriptordning: [String] = []
    @ObservationIgnored private var version = 0
    @ObservationIgnored private var lyssnare: [Prenumeration] = []
    @ObservationIgnored private var laddning: Task<Void, Never>?
    @ObservationIgnored private let logg = Logg("Skydd")

    /// Mätvärden för självtestet: tid per beslut och per skriptbygge (ms).
    @ObservationIgnored private(set) var beslutMs: [Double] = []
    @ObservationIgnored private(set) var byggMs: [Double] = []
    /// De senaste besluten för huvudsidor (adress och vad som hände), för självtestet.
    @ObservationIgnored private(set) var beslutslogg: [(url: String, vad: String)] = []

    static let egenVard = "adraze.invalid"

    struct Biljett {
        enum Typ { case fortsatt, tillbaka }
        let typ: Typ
        let url: URL?
        let flik: UUID?
        /// Adresserna stoppsidan kan ha i historiken (Flikar kan visa den med den stoppade adressen).
        let stoppsidor: Set<String>
        let skapad: Date
    }

    init(app: AppMiljo) {
        self.app = app
        data = Regeldata()
        if let fel = data.fel { lage = .fel(fel) }
        lyssnare.append(app.handelser.lyssna(InstallningAndrad.self) { [weak self] h in
            guard let self else { return }
            if h.nyckel == Nycklar.skyddPausade.namn || h.nyckel == "sajt.skydd" || h.nyckel.hasPrefix("block.") {
                self.version += 1
                self.skriptcache.removeAll()
                self.skriptordning.removeAll()
            }
        })
        // Ny sida i fliken: räknaren börjar om (som datorns did-start-navigation)
        lyssnare.append(app.handelser.lyssna(FlikNavigerade.self) { [weak self] h in
            guard let self, let vy = self.app.flikar.flik(h.flik)?.webbvy, let st = self.status(vy) else { return }
            st.raknade = []
            guard st.antal != 0 else { return }
            st.antal = 0
            self.raknarversion += 1
        })
    }

    // MARK: - Listorna

    /// Startar uppslag eller kompilering i bakgrunden. Anropas av `SkyddModul.starta`.
    func borjaLadda() {
        guard laddning == nil, data.fel == nil else { return }
        let rensa = app.startargument.tal("skyddRensa") == 1
        lage = .laddar(andel: 0)
        let data = self.data
        let initiativ = Task { @MainActor in await data.laddaInitiativ() }
        Task { @MainActor in await data.laddaRaknare() }
        laddning = Task { @MainActor [weak self] in
            guard let self else { return }
            let fel = await self.listor.ladda(self.data, rensa: rensa, framsteg: { [weak self] a in
                self?.lage = .laddar(andel: a)
            }, klar: { [weak self] namn, _ in
                self?.listaKlar(namn)
            })
            // Annonsvärdarna (för omdirigeringar) läses parallellt med listorna; klart först när båda är inne
            await initiativ.value
            let regler = self.listor.klara.keys.reduce(0) { s, n in s + (self.data.listor.first { $0.namn == n }?.regler ?? 0) }
            Starttider.markera("skydd_klart")
            if fel.isEmpty {
                self.lage = .klart(regler: regler)
            } else {
                self.lage = .fel("Skyddet är inte helt laddat (\(fel.joined(separator: ", ")))")
            }
            self.logg.info("skyddet klart: \(regler) regler på \(Int(self.listor.totalMs)) ms"
                           + (fel.isEmpty ? "" : ", fel i \(fel.joined(separator: ", "))"))
        }
    }

    private func listaKlar(_ namn: String) {
        for st in levande() { synka(st, onskade: st.onskade) }
    }

    private var allaListor: Set<String> { Set(data.listor.map(\.namn)) }

    // MARK: - SkyddTjanst

    func forbered(_ webbvy: WKWebView, privat: Bool) {
        let st = Vystatus(vy: webbvy, privat: privat)
        vyer[ObjectIdentifier(webbvy)] = st
        rensaDoda()
        installeraRaknare(st)
        synka(st, onskade: nil)
    }

    func beslut(for handling: WKNavigationAction) -> Navigeringsbeslut {
        let t0 = CFAbsoluteTimeGetCurrent()
        defer {
            beslutMs.append((CFAbsoluteTimeGetCurrent() - t0) * 1000)
            if beslutMs.count > 500 { beslutMs.removeFirst(250) }
        }
        guard let url = handling.request.url else { return .tillat }
        let kalla = handling.value(forKey: "sourceFrame") as? WKFrameInfo
        guard let mal = handling.targetFrame else {
            return nyttFonster(url, kalla: kalla, typ: handling.navigationType)
        }
        guard let vy = mal.webView ?? kalla?.webView else { return .tillat }
        let st = status(vy) ?? registrera(vy)
        if !mal.isMainFrame {
            return st.javascript ? .tillat : Navigeringsbeslut(javascript: false)
        }
        // Stopplistan gäller bara navigeringen den lades i vyn för
        slappStopp(st)
        let schema = url.scheme?.lowercased() ?? ""
        if Vard.av(url) == Self.egenVard { return egenAdress(url, vy: vy, st: st) }
        guard schema == "http" || schema == "https" else {
            // about:blank (stoppsidan och felsidor), data:, blob:: inga sajtskript, JavaScript som vanligt
            if schema == "about" || schema == "data" || schema == "blob" { sattSkript([], nyckel: "-", st) }
            st.javascript = true
            return .tillat
        }
        st.senasteHuvudsida = url
        let l = sidlage(url)

        // Annonsvärd som skickar fliken till en annan sajt (tilläggets main_frame-regler med initiatorDomains)
        let kallvard = initiator(kalla, vy: vy, url: url, typ: handling.navigationType)
        if !l.tillat, !l.fortsatt, !l.pausad, let k = kallvard, data.arInitiativ(k), Vard.sajt(k) != Vard.sajt(l.vard) {
            guard let stopp = listor.stopp else {
                logga(url, "stoppad tyst (stopplistan är inte klar)")
                return .stoppa
            }
            // Navigeringen släpps till WebKit med stopplistan i vyn: adressen stoppas med fel 104 (listor som läggs
            // till i decidePolicyFor gäller redan för samma navigering, mätt på iOS 26.1), och Flikar visar
            // stoppsidan med den riktiga adressen i adressfältet.
            synka(st, onskade: onskadeListor(l))
            st.ucc.add(stopp)
            st.stopplista = true
            st.annonsstopp = url
            sattSkript([], nyckel: "-", st)
            logga(url, "stoppad: \(k) skickade fliken vidare")
            return Navigeringsbeslut(javascript: false)
        }
        // Spårningsparametrar i huvudsidans adress
        if !l.tillat, !l.pausad, let ren = data.utanParametrar(url, kalla: kallvard) {
            logga(url, "utan parametrar: \(ren.absoluteString)")
            return Navigeringsbeslut(nyAdress: ren)
        }
        synka(st, onskade: onskadeListor(l))
        byggSkript(l, st)
        st.javascript = l.javascript
        logga(url, l.pausad ? "pausad" : l.tillat ? "inloggning" : l.fortsatt ? "fortsätt" : "skyddad")
        return Navigeringsbeslut(javascript: l.javascript)
    }

    func blockeringssida(for url: URL, flik: UUID) -> String? {
        let vy = app.flikar.flik(flik)?.webbvy
        let st = vy.flatMap { status($0) }
        // Felets adress (NSURLErrorFailingURLErrorKey) är den stoppade. En flik som i stället skickar webbvyns
        // adress (den gamla sidan efter ett misslyckat försök) eller about:blank får det senaste beslutet för
        // huvudsidan.
        var stoppad = url
        if let s = st?.senasteHuvudsida, s != url, !Self.arWebb(url) || url == vy?.url { stoppad = s }
        let adress = stoppad
        // Stoppad av stopplistan (en annons skickade fliken) eller av listorna (farlig sida). Stopplistan tas bort
        // innan Flikar laddar stoppsidan med samma adress.
        let orsak: Stoppsida.Orsak = st?.annonsstopp == stoppad ? .annons : .farlig
        if let st { slappStopp(st) }
        rensaBiljetter()
        // Adressen stoppsidan får i historiken när fliken laddar den med felets adress (loadSimulatedRequest). Inte
        // `url`: en flik som skickade den gamla sidans adress har den sidan som historikens aktuella post.
        let stoppsidor: Set<String> = [adress.absoluteString]
        let tillbaka = nyBiljett(.tillbaka, url: nil, flik: flik, vag: "tillbaka", stoppsidor: stoppsidor)
        let barn = app.installningar.arBarnlage()
        let fortsattAdress = barn || !Self.arWebb(adress) ? nil : nyBiljett(.fortsatt, url: adress, flik: flik, vag: "fortsatt")
        app.handelser.skicka(HuvudsidaBlockerad(flik: flik, url: adress))
        logg.info("stoppsidan för \(adress.host() ?? "?") (\(orsak == .annons ? "annons" : "farlig"))")
        // Stoppsidan läggs ovanpå sidan som syntes före (historikens aktuella post). Finns ingen, stänger knappen
        // fliken.
        let kanGaTillbaka = vy?.backForwardList.currentItem != nil
        return Stoppsida.html(adress: adress, orsak: orsak, tillbaka: tillbaka, kanGaTillbaka: kanGaTillbaka,
                              fortsatt: fortsattAdress)
    }

    func arPausat(for vard: String) -> Bool {
        let v = Self.normal(vard)
        return !v.isEmpty && Vard.iMangd(v, Set(app.installningar[Nycklar.skyddPausade]))
    }

    func pausa(_ pausat: Bool, for vard: String) {
        let v = Self.normal(vard)
        guard !v.isEmpty else { return }
        var lista = app.installningar[Nycklar.skyddPausade].filter { !Vard.nivaer(v).contains($0) && $0 != v }
        if pausat { lista.append(v) }
        app.installningar[Nycklar.skyddPausade] = lista
    }

    /// Adresserna som räknades på sidan som visas i vyn (självtestet).
    func raknadeAdresser(i vy: WKWebView) -> [String] { status(vy)?.raknade ?? [] }

    func antalBlockerade(i flik: UUID) -> Int? {
        _ = raknarversion
        guard app.installningar[.blockRaknare], let vy = app.flikar.flik(flik)?.webbvy, let st = status(vy) else { return nil }
        return st.antal
    }

    var totaltBlockerade: Int? {
        _ = raknarversion
        return raknare.totalt
    }

    // MARK: - Räknaren (Raknare.swift)

    private func installeraRaknare(_ st: Vystatus) {
        raknare.installera(i: st.ucc) { [weak self] m in self?.raknat(m) }
    }

    private func raknat(_ m: WKScriptMessage) {
        guard let vy = m.webView, let st = status(vy), !data.raknarvardar.isEmpty else { return }
        // Bara när sidan har annons- eller spårlistan på sig (inte pausad, inte inloggning)
        guard st.listor.contains("ads") || st.listor.contains("privacy"),
              let sida = st.senasteHuvudsida, !sidlage(sida).tillat else { return }
        let traffar = Raknare.adresser(m).filter { u in
            let v = Vard.av(u)
            return data.arRaknarvard(v) && !data.arTillatVard(v)
        }
        let n = traffar.count
        guard n > 0 else { return }
        st.antal += n
        if st.raknade.count < 200 { st.raknade += traffar.prefix(200 - st.raknade.count).map(\.absoluteString) }
        raknare.lagg(till: n)
        raknarversion += 1
        // Startsidans siffror (datorns adblock:hit, en per stoppad sak)
        for _ in 0..<min(n, 100) { app.brygga.skicka("adblock:hit", .text("ad"), till: .yta("startsida")) }
    }

    // MARK: - Läget för en sida

    struct Sidlage {
        let vard: String
        /// Inloggning eller betalning: blockeras aldrig, inga innehållsskript.
        let tillat: Bool
        /// Pausad sajt eller reklam av för sajten (gäller inte i barnläge).
        let pausad: Bool
        let fortsatt: Bool
        let javascript: Bool
        let barn: Bool
    }

    func sidlage(_ url: URL) -> Sidlage {
        let vard = Vard.av(url)
        let barn = app.installningar.arBarnlage()
        let tillat = data.arTillat(url)
        let sajt = barn ? [:] : sajtSkydd(vard)
        let pausad = !barn && (arPausat(for: vard) || sajt["reklam"] == .bool(false))
        let fort = !barn && Vard.iMangd(vard, fortsatt)
        let js = tillat || !(app.installningar[.blockSkript] || sajt["js"] == .bool(false))
        return Sidlage(vard: vard, tillat: tillat, pausad: pausad, fortsatt: fort, javascript: js, barn: barn)
    }

    /// `sajt.skydd[domän]` (datorns anpassa-sajt.js): `{ reklam: false, js: false, popup: "tillat"|"blockera" }`.
    private func sajtSkydd(_ vard: String) -> [String: JSONVarde] {
        let dom = Vard.utanWww(vard)
        guard !dom.isEmpty, dom != "skydd" else { return [:] }
        return app.installningar.hamta("sajt.skydd")?[dom].objekt ?? [:]
    }

    func onskadeListor(_ l: Sidlage) -> Set<String> {
        var s = allaListor
        if l.pausad { s = s.intersection(["sidor"]) }
        if app.installningar[.blockNiva] == "enkel" { s.remove("kosmetik") }
        if l.fortsatt { s.remove("sidor") }
        return s
    }

    /// Värden för ramen som startade navigeringen (DNR:s initiator), eller `nil` när användaren (adressfältet,
    /// bakåt, ladda om) startade den.
    private func initiator(_ kalla: WKFrameInfo?, vy: WKWebView, url: URL, typ: WKNavigationType) -> String? {
        guard typ == .linkActivated || typ == .other || typ == .formSubmitted else { return nil }
        // En laddning från appen (webView.load) syns som väntande adress i webView.url. Från iOS 18.5 är
        // sourceFrame då huvudramen med den gamla sidan, inte nil (WebKit, SDKAlignedBehavior
        // NavigationActionSourceFrameNonNull).
        if vy.url == url { return nil }
        guard let kalla else { return nil }
        let h = kalla.securityOrigin.host.lowercased()
        if !h.isEmpty { return h }
        return kalla.request.url.map { Vard.av($0) }
    }

    /// target=_blank och liknande (WebKit frågar innan fönstret skapas). window.open stoppas av listan "popup"
    /// och vakten.
    private func nyttFonster(_ url: URL, kalla: WKFrameInfo?, typ: WKNavigationType) -> Navigeringsbeslut {
        let schema = url.scheme?.lowercased() ?? ""
        guard schema == "http" || schema == "https" else { return .tillat }
        let v = Vard.av(url)
        if data.arPopupBetrodd(v) { return .tillat }
        let barn = app.installningar.arBarnlage()
        let fran = kalla?.webView?.url.map { Vard.av($0) } ?? ""
        if !barn, !fran.isEmpty {
            if sajtSkydd(fran)["popup"] == .text("blockera"), typ != .linkActivated {
                logga(url, "nytt fönster stoppat (popup blockera på \(fran))")
                return .stoppa
            }
            if arPausat(for: fran) { return .tillat }
        }
        if data.arPopupvard(v) {
            logga(url, "nytt fönster till popup-värd stoppat")
            return .stoppa
        }
        return .tillat
    }

    // MARK: - adraze.invalid (stoppsidans knappar)

    private func egenAdress(_ url: URL, vy: WKWebView, st: Vystatus) -> Navigeringsbeslut {
        let q = Dictionary((URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") },
                           uniquingKeysWith: { a, _ in a })
        switch url.path {
        case "/fortsatt":
            guard !app.installningar.arBarnlage(), let u = q["u"].flatMap({ URL(string: $0) }), Self.arWebb(u) else {
                logga(url, "fortsätt nekas")
                return .stoppa
            }
            let v = Self.normal(Vard.av(u))
            if let t = q["t"], let b = biljetter[t], b.typ == .fortsatt, b.url == u {
                biljetter[t] = nil
                if !v.isEmpty { fortsatt.insert(v) }
            } else if !Vard.iMangd(v, fortsatt) {
                // En stoppsida ur historiken vars biljett redan är använd släpps bara igenom om sajten redan fått
                // "Fortsätt ändå".
                logga(url, "ogiltig fortsätt-biljett")
                return .stoppa
            }
            logga(url, "fortsätt till \(v)")
            return Navigeringsbeslut(nyAdress: u)
        case "/tillbaka":
            // Biljetten får användas igen: stoppsidan kan komma tillbaka ur historiken.
            guard let t = q["t"], let b = biljetter[t], b.typ == .tillbaka else {
                logga(url, "ogiltig tillbaka-biljett")
                return .stoppa
            }
            let flik = b.flik, stoppsidor = b.stoppsidor
            DispatchQueue.main.async { [weak self, weak vy] in
                guard let self, let vy else { return }
                if let nu = vy.backForwardList.currentItem, !stoppsidor.contains(nu.url.absoluteString) {
                    // Stoppsidan finns inte i historiken (loadHTMLString hamnar inte där): sidan före är historikens
                    // aktuella post och visas igen i samma post. Startar go(to:) ingen navigering laddas adressen
                    // om med location.replace (ingen dubblett i historiken).
                    let mal = nu.url
                    if vy.go(to: nu) == nil {
                        self.logg.info("tillbaka: go(to:) startade ingen navigering, location.replace")
                        vy.evaluateJavaScript("location.replace(\(Skriptbygge.json(mal.absoluteString)))") { _, fel in
                            if fel != nil { vy.load(URLRequest(url: mal)) }
                        }
                    }
                } else if vy.canGoBack {
                    vy.goBack()
                } else if let flik {
                    self.app.flikar.stang(flik)
                }
            }
            logga(url, "tillbaka")
            return .stoppa
        default:
            return .stoppa
        }
    }

    private func nyBiljett(_ typ: Biljett.Typ, url: URL?, flik: UUID, vag: String, stoppsidor: Set<String> = []) -> URL {
        let t = UUID().uuidString
        biljetter[t] = Biljett(typ: typ, url: url, flik: flik, stoppsidor: stoppsidor, skapad: Date())
        var c = URLComponents()
        c.scheme = "https"
        c.host = Self.egenVard
        c.path = "/" + vag
        var q: [URLQueryItem] = []
        if let url { q.append(URLQueryItem(name: "u", value: url.absoluteString)) }
        q.append(URLQueryItem(name: "t", value: t))
        c.queryItems = q
        return c.url!
    }

    private func rensaBiljetter() {
        let gans = Date().addingTimeInterval(-6 * 3600)
        biljetter = biljetter.filter { $0.value.skapad > gans }
    }

    // MARK: - Webbvyerna

    @MainActor
    final class Vystatus {
        weak var vy: WKWebView?
        /// Vyns userContentController (`vy.configuration` ger en ny kopia av konfigurationen varje gång).
        let ucc: WKUserContentController
        let privat: Bool
        /// Listorna som ligger i vyns userContentController.
        var listor: Set<String> = []
        /// Listorna vyn ska ha (nil = alla).
        var onskade: Set<String>?
        /// Vilka skript som ligger i (värd, version), "-" = inga.
        var skriptnyckel: String?
        var senasteHuvudsida: URL?
        var javascript = true
        /// Stopplistan ligger i vyn, för navigeringen till `annonsstopp`.
        var stopplista = false
        var annonsstopp: URL?
        /// Räknade stopp på sidan som visas (`Raknare`).
        var antal = 0
        /// Adresserna som räknades på sidan som visas (högst 200, för självtestet).
        var raknade: [String] = []

        init(vy: WKWebView, privat: Bool) {
            self.vy = vy
            ucc = vy.configuration.userContentController
            self.privat = privat
        }
    }

    func status(_ vy: WKWebView) -> Vystatus? {
        guard let st = vyer[ObjectIdentifier(vy)], st.vy === vy else { return nil }
        return st
    }

    /// En vy som inte förbereddes (till exempel ett fönster som en sida öppnade).
    private func registrera(_ vy: WKWebView) -> Vystatus {
        let st = Vystatus(vy: vy, privat: !vy.configuration.websiteDataStore.isPersistent)
        vyer[ObjectIdentifier(vy)] = st
        installeraRaknare(st)
        synka(st, onskade: nil)
        return st
    }

    private func levande() -> [Vystatus] { vyer.values.filter { $0.vy != nil } }

    private func rensaDoda() { vyer = vyer.filter { $0.value.vy != nil } }

    /// Lägger till och tar bort listor så att vyn har de önskade (av dem som är klara).
    private func synka(_ st: Vystatus, onskade: Set<String>?) {
        st.onskade = onskade
        guard st.vy != nil else { return }
        let ucc = st.ucc
        let mal = onskade ?? allaListor
        for (namn, lista) in listor.klara {
            let ska = mal.contains(namn)
            if ska, !st.listor.contains(namn) {
                ucc.add(lista)
                st.listor.insert(namn)
            } else if !ska, st.listor.contains(namn) {
                ucc.remove(lista)
                st.listor.remove(namn)
            }
        }
    }

    /// Tar bort stopplistan ur vyn (efter navigeringen den lades för).
    private func slappStopp(_ st: Vystatus) {
        if st.stopplista, let s = listor.stopp { st.ucc.remove(s) }
        st.stopplista = false
        st.annonsstopp = nil
    }

    private func byggSkript(_ l: Sidlage, _ st: Vystatus) {
        if l.tillat || l.pausad {
            sattSkript([], nyckel: "-", st)
            return
        }
        let nyckel = "\(l.vard)|\(version)"
        guard st.skriptnyckel != nyckel else { return }
        let delar: [Skriptdel]
        if let c = skriptcache[nyckel] {
            delar = c
        } else {
            let t0 = CFAbsoluteTimeGetCurrent()
            delar = Skriptbygge.delar(for: l.vard, data: data, element: app.installningar[.blockElement], egna: app.installningar[.blockEgna])
            byggMs.append((CFAbsoluteTimeGetCurrent() - t0) * 1000)
            if byggMs.count > 500 { byggMs.removeFirst(250) }
            skriptcache[nyckel] = delar
            skriptordning.append(nyckel)
            if skriptordning.count > 24 { skriptcache[skriptordning.removeFirst()] = nil }
        }
        sattSkript(delar, nyckel: nyckel, st)
    }

    /// Byter skyddets skript i vyn och lämnar andras kvar.
    private func sattSkript(_ delar: [Skriptdel], nyckel: String, _ st: Vystatus) {
        guard st.vy != nil, st.skriptnyckel != nyckel else { return }
        let ucc = st.ucc
        let andras = ucc.userScripts.filter { !$0.source.hasPrefix(Skriptdel.marke) }
        ucc.removeAllUserScripts()
        for s in andras { ucc.addUserScript(s) }
        for d in delar { ucc.addUserScript(d.skript()) }
        st.skriptnyckel = nyckel
    }

    // MARK: - Hjälp

    static func arWebb(_ url: URL) -> Bool {
        let s = url.scheme?.lowercased()
        return s == "http" || s == "https"
    }

    /// Värd i pauslistan och sajtnycklar: små bokstäver, utan www. och punkt sist.
    static func normal(_ vard: String) -> String {
        var v = vard.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        while v.hasSuffix(".") { v.removeLast() }
        return Vard.utanWww(v)
    }

    private func logga(_ url: URL, _ vad: String) {
        beslutslogg.append((url.absoluteString, vad))
        if beslutslogg.count > 200 { beslutslogg.removeFirst(100) }
        logg.felsok("\(vad): \(url.absoluteString.prefix(160))")
    }

    /// Om stopplistan ligger i en vy (för självtestet).
    func harStopplistan(_ vy: WKWebView) -> Bool { status(vy)?.stopplista ?? false }

    /// Antal skript skyddet har i en vy (för självtestet).
    func antalSkript(i vy: WKWebView) -> Int {
        (status(vy)?.ucc ?? vy.configuration.userContentController).userScripts.filter { $0.source.hasPrefix(Skriptdel.marke) }.count
    }
}
