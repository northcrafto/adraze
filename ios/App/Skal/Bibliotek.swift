import Foundation
import Observation
import UIKit

/// Historik och bokmärken, tills det finns ett gemensamt bibliotek i `Gemensamt/` (önskemål i slutrapporten).
/// Historiken fylls av `SidaLaddad` från vanliga flikar (aldrig privata). Sparas i
/// `Application Support/AdRaze/Skal/bibliotek.json`; i självtestet bara i minnet (`fil: nil`).
///
/// Ägare: Skal.
@MainActor
@Observable
final class Bibliotek {
    struct Besok: Codable, Hashable, Identifiable {
        var id: String { url }
        let url: String
        var titel: String
        var senast: Date
        var antal: Int
    }

    struct Bokmarke: Codable, Hashable, Identifiable {
        let id: UUID
        let url: String
        var titel: String
        let skapad: Date
    }

    /// Senaste först, en post per adress.
    private(set) var historik: [Besok] = []
    /// Senaste först.
    private(set) var bokmarken: [Bokmarke] = []

    @ObservationIgnored private let fil: URL?
    @ObservationIgnored private var sparjobb: DispatchWorkItem?
    @ObservationIgnored private let logg = Logg("Skal")
    static let maxHistorik = 3000

    init(fil: URL?) {
        self.fil = fil
        las()
    }

    static var standardfil: URL {
        let bas = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return bas.appendingPathComponent("AdRaze/Skal/bibliotek.json")
    }

    /// Adressen som nyckel: bara http(s), utan #fragment.
    static func nyckel(_ url: URL) -> String? {
        guard let s = url.scheme?.lowercased(), s == "http" || s == "https" else { return nil }
        var k = URLComponents(url: url, resolvingAgainstBaseURL: false)
        k?.fragment = nil
        return k?.string ?? url.absoluteString
    }

    // MARK: - Historik

    /// Titeln på ett besök som redan finns (räknar inte ett nytt besök).
    func sattTitel(url: URL, titel: String) {
        guard !titel.isEmpty, let k = Self.nyckel(url), let i = historik.firstIndex(where: { $0.url == k }),
              historik[i].titel != titel else { return }
        historik[i].titel = titel
        sparaSnart()
    }

    func besok(url: URL, titel: String) {
        guard let k = Self.nyckel(url) else { return }
        if let i = historik.firstIndex(where: { $0.url == k }) {
            var b = historik.remove(at: i)
            b.senast = Date()
            b.antal += 1
            if !titel.isEmpty { b.titel = titel }
            historik.insert(b, at: 0)
        } else {
            historik.insert(Besok(url: k, titel: titel, senast: Date(), antal: 1), at: 0)
            if historik.count > Self.maxHistorik { historik.removeLast(historik.count - Self.maxHistorik) }
        }
        sparaSnart()
    }

    func taBort(_ b: Besok) {
        historik.removeAll { $0.url == b.url }
        sparaSnart()
    }

    func rensaHistorik() {
        historik = []
        sparaSnart()
    }

    /// De mest besökta sajterna (en per domän), för den tomma fliken.
    func toppsajter(_ antal: Int) -> [Besok] {
        var sett = Set<String>()
        var ut: [Besok] = []
        for b in historik.sorted(by: { ($0.antal, $0.senast) > ($1.antal, $1.senast) }) {
            let d = domanFor(URL(string: b.url))
            guard !d.isEmpty, !sett.contains(d) else { continue }
            sett.insert(d)
            ut.append(b)
            if ut.count >= antal { break }
        }
        return ut
    }

    // MARK: - Bokmärken

    func arBokmarkt(_ url: URL?) -> Bool {
        guard let url, let k = Self.nyckel(url) else { return false }
        return bokmarken.contains { $0.url == k }
    }

    /// Lägger till eller tar bort ett bokmärke. Sant om sidan är bokmärkt efteråt.
    @discardableResult
    func vaxlaBokmarke(url: URL, titel: String) -> Bool {
        guard let k = Self.nyckel(url) else { return false }
        if bokmarken.contains(where: { $0.url == k }) {
            bokmarken.removeAll { $0.url == k }
            sparaSnart()
            return false
        }
        bokmarken.insert(Bokmarke(id: UUID(), url: k, titel: titel.isEmpty ? domanFor(url) : titel, skapad: Date()), at: 0)
        sparaSnart()
        return true
    }

    func taBort(_ b: Bokmarke) {
        bokmarken.removeAll { $0.id == b.id }
        sparaSnart()
    }

    // MARK: - Sök

    struct Traff: Hashable {
        let url: String
        let titel: String
        let bokmarke: Bool
        let poang: Double
    }

    /// Historik och bokmärken som matchar `q` (domänens början, adressen eller ord i titeln).
    func sok(_ q: String, max: Int = 4) -> [Traff] {
        let s = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !s.isEmpty else { return [] }
        var basta: [String: Traff] = [:]
        let nu = Date()
        func poang(url: String, titel: String, antal: Int, senast: Date, bokmarke: Bool) -> Double? {
            let ren = Self.utanSchema(url)
            let t = titel.lowercased()
            var p: Double
            if ren.hasPrefix(s) { p = 100 }
            else if ren.contains("." + s) || ren.contains("/" + s) { p = 60 }
            else if t.hasPrefix(s) || t.contains(" " + s) { p = 50 }
            else if ren.contains(s) || t.contains(s) { p = 25 }
            else { return nil }
            let dagar = Swift.max(0, nu.timeIntervalSince(senast) / 86_400)
            p += min(30, Double(antal) * 3) + Swift.max(0, 20 - dagar) + (bokmarke ? 15 : 0)
            return p
        }
        for b in historik.prefix(1500) {
            if let p = poang(url: b.url, titel: b.titel, antal: b.antal, senast: b.senast, bokmarke: false) {
                basta[b.url] = Traff(url: b.url, titel: b.titel, bokmarke: false, poang: p)
            }
        }
        for b in bokmarken {
            if let p = poang(url: b.url, titel: b.titel, antal: 1, senast: b.skapad, bokmarke: true), p > (basta[b.url]?.poang ?? 0) {
                basta[b.url] = Traff(url: b.url, titel: b.titel, bokmarke: true, poang: p)
            }
        }
        return Array(basta.values.sorted { $0.poang > $1.poang }.prefix(max))
    }

    /// Resten av en domän eller adress som börjar med det man skrivit (Safaris tysta komplettering), t.ex.
    /// "exa" → "mple.com".
    func komplettering(_ q: String) -> String? {
        let s = q.lowercased()
        guard s.count >= 1, !s.contains(" "), !s.contains("://") else { return nil }
        var basta: (String, Int)?
        for b in historik.prefix(1500) {
            let ren = Self.utanSchema(b.url)
            // Hela värdnamnet först, sedan adressen fram till nästa /.
            guard let u = URL(string: b.url), let vard = u.host(percentEncoded: false)?.lowercased() else { continue }
            let utanWww = vard.hasPrefix("www.") ? String(vard.dropFirst(4)) : vard
            var kandidat: String?
            if utanWww.hasPrefix(s) { kandidat = utanWww }
            else if ren.hasPrefix(s) { kandidat = String(ren.prefix(while: { $0 != "?" })) }
            guard let k = kandidat, k.count > s.count else { continue }
            if basta == nil || b.antal > basta!.1 { basta = (k, b.antal) }
        }
        guard let (hel, _) = basta else { return nil }
        return String(hel.dropFirst(s.count))
    }

    static func utanSchema(_ url: String) -> String {
        var s = url.lowercased()
        for p in ["https://www.", "http://www.", "https://", "http://"] where s.hasPrefix(p) {
            s = String(s.dropFirst(p.count))
            break
        }
        if s.hasSuffix("/") { s.removeLast() }
        return s
    }

    // MARK: - Fil

    private struct Fil: Codable {
        var historik: [Besok]
        var bokmarken: [Bokmarke]
    }

    private func las() {
        guard let fil, let data = try? Data(contentsOf: fil) else { return }
        do {
            let f = try JSONDecoder().decode(Fil.self, from: data)
            historik = f.historik
            bokmarken = f.bokmarken
        } catch {
            logg.varning("biblioteket gick inte att läsa: \(error.localizedDescription)")
        }
    }

    private func sparaSnart() {
        guard let fil else { return }
        sparjobb?.cancel()
        let f = Fil(historik: historik, bokmarken: bokmarken)
        let jobb = DispatchWorkItem {
            do {
                try FileManager.default.createDirectory(at: fil.deletingLastPathComponent(), withIntermediateDirectories: true)
                let data = try JSONEncoder().encode(f)
                try data.write(to: fil, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            } catch {
                Logg("Skal").varning("biblioteket gick inte att spara: \(error.localizedDescription)")
            }
        }
        sparjobb = jobb
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.5, execute: jobb)
    }
}

// MARK: - Förslag

/// Förslagen under adressfältet: urklippet, historik och bokmärken direkt, och sökförslag från vald sökmotor
/// (som datorns `main.js`: samma adresser, högst 6, 1,5 s timeout, aldrig i privata flikar).
///
/// Ägare: Skal.
@MainActor
@Observable
final class Sokforslag {
    struct Rad: Identifiable, Hashable {
        enum Sort: Hashable { case historik, bokmarke, sok, adress }
        let id: String
        let sort: Sort
        let titel: String
        let detalj: String?
        /// Vad som laddas: en adress eller en sökning.
        let mal: String
    }

    /// Lokala träffar (historik och bokmärken).
    private(set) var lokala: [Rad] = []
    /// Sökförslag från sökmotorn.
    private(set) var fjarran: [Rad] = []
    /// Tyst komplettering av det man skriver.
    private(set) var komplettering: String?
    /// Urklippet har något som går att klistra in (utan att läsa det; då frågar iOS inte).
    private(set) var urklipp: Urklipp?
    /// Det som söktes senast.
    private(set) var fraga = ""

    enum Urklipp { case adress, text }

    @ObservationIgnored unowned let app: AppMiljo
    @ObservationIgnored let bibliotek: Bibliotek
    @ObservationIgnored private var uppgift: Task<Void, Never>?
    @ObservationIgnored private lazy var session: URLSession = {
        let k = URLSessionConfiguration.ephemeral
        k.timeoutIntervalForRequest = 1.5
        k.timeoutIntervalForResource = 2
        k.httpCookieAcceptPolicy = .never
        k.httpShouldSetCookies = false
        k.urlCache = nil
        return URLSession(configuration: k)
    }()
    /// Sant om sökmotorns förslag ska hämtas (självtestet kan stänga av det).
    @ObservationIgnored var hamtaFjarran = true

    init(app: AppMiljo, bibliotek: Bibliotek) {
        self.app = app
        self.bibliotek = bibliotek
    }

    /// Adresserna för sökförslag per motor (datorns `SUGGEST_URLS`).
    static func forslagsadress(motor: String, fraga: String, sprak: String) -> URL? {
        let q = Webbadress.kodad(fraga)
        let hl = Webbadress.kodad(sprak)
        switch motor {
        case "adraze": return URL(string: "https://search.adraze.app/api/suggest?q=\(q)")
        case "google": return URL(string: "https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&hl=\(hl)&q=\(q)")
        case "duckduckgo", "startpage": return URL(string: "https://duckduckgo.com/ac/?type=list&q=\(q)")
        case "brave": return URL(string: "https://search.brave.com/api/suggest?q=\(q)")
        default: return nil
        }
    }

    /// Tolkar `[fråga, [förslag | {phrase}]]`.
    nonisolated static func tolka(_ data: Data) -> [String] {
        var j = try? JSONSerialization.jsonObject(with: data)
        if j == nil, let s = String(data: data, encoding: .isoLatin1), let d = s.data(using: .utf8) {
            j = try? JSONSerialization.jsonObject(with: d)
        }
        guard let a = j as? [Any], a.count > 1, let lista = a[1] as? [Any] else { return [] }
        var ut: [String] = []
        for x in lista {
            let s = (x as? String) ?? ((x as? [String: Any])?["phrase"] as? String)
            if let s, !s.isEmpty, !ut.contains(s) { ut.append(s) }
            if ut.count >= 6 { break }
        }
        return ut
    }

    func rensa() {
        uppgift?.cancel()
        lokala = []
        fjarran = []
        komplettering = nil
        fraga = ""
    }

    /// Kollar om urklippet har en adress eller text, utan att läsa innehållet.
    func kollaUrklipp() {
        let pb = UIPasteboard.general
        guard pb.hasStrings || pb.hasURLs else { urklipp = nil; return }
        urklipp = pb.hasURLs ? .adress : .text
        let webbadress: PartialKeyPath<UIPasteboard.DetectedValues> = \UIPasteboard.DetectedValues.probableWebURL
        pb.detectPatterns(for: [webbadress]) { [weak self] svar in
            let arAdress = (try? svar.get())?.contains(webbadress)
            efter(0) {
                guard let self, self.urklipp != nil, let arAdress else { return }
                self.urklipp = arAdress ? .adress : .text
            }
        }
    }

    /// Nytt sökord: lokala träffar och kompletteringen direkt, sökmotorns förslag strax efter.
    func sok(_ text: String, privat: Bool) {
        uppgift?.cancel()
        fraga = text
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            lokala = []
            fjarran = []
            komplettering = nil
            return
        }
        komplettering = bibliotek.komplettering(q)
        lokala = bibliotek.sok(q, max: 4).map { t in
            let u = URL(string: t.url)
            return Rad(id: "l:" + t.url, sort: t.bokmarke ? .bokmarke : .historik,
                       titel: t.titel.isEmpty ? domanFor(u) : t.titel, detalj: Bibliotek.utanSchema(t.url), mal: t.url)
        }
        // Inga sökförslag i privata flikar (som datorn), och inte för något som redan är en adress.
        fjarran = fjarran.filter { $0.titel.lowercased().hasPrefix(q.lowercased()) }
        guard !privat, hamtaFjarran, !q.contains("://"),
              let url = Self.forslagsadress(motor: app.installningar[.sokMotor], fraga: q, sprak: Sprak.delad.kod) else {
            fjarran = []
            return
        }
        uppgift = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 120_000_000)
            guard !Task.isCancelled, let self else { return }
            var r = URLRequest(url: url)
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")
            guard let hamtat = try? await self.session.data(for: r) else { return }
            let (data, svar) = hamtat
            guard (svar as? HTTPURLResponse)?.statusCode == 200, !Task.isCancelled, self.fraga == text else { return }
            let lokalt = Set(self.lokala.map { $0.titel.lowercased() })
            self.fjarran = Self.tolka(data)
                .filter { $0.lowercased() != q.lowercased() && !lokalt.contains($0.lowercased()) }
                .prefix(6)
                .map { Rad(id: "s:" + $0, sort: .sok, titel: $0, detalj: nil, mal: $0) }
        }
    }
}
