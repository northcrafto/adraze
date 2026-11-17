import Foundation
import Observation
import UIKit

/// Förslagen under adressfältet: urklippet, historik och bokmärken direkt (ur `app.bibliotek`, Flikars historik
/// och bokmärken), och sökförslag från vald sökmotor (som datorns `main.js`: samma adresser, högst 6, 1,5 s
/// timeout, aldrig i privata flikar).
///
/// Ägare: Skal.
@MainActor
@Observable
final class Sokforslag {
    struct Rad: Identifiable, Hashable {
        enum Sort: Hashable { case historik, bokmarke, sok, adress, tidigare }
        let id: String
        let sort: Sort
        let titel: String
        let detalj: String?
        /// Vad som laddas: en adress eller en sökning.
        let mal: String
        /// Adressen till sajtens ikon (`app.bibliotek.favikon`).
        var favikon: String? = nil
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

    init(app: AppMiljo) {
        self.app = app
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
        // Kompletteringen är resten av värden ("ver" + "kstad.se"), som fältet visar markerad efter det man skrev.
        if let vard = app.bibliotek.komplettering(q, privat: privat), vard.lowercased().hasPrefix(q.lowercased()), vard.count > q.count {
            komplettering = String(vard.dropFirst(q.count))
        } else {
            komplettering = nil
        }
        lokala = app.bibliotek.lokalaForslag(q, privat: privat).prefix(5).map { p in
            switch p.slag {
            case .tidigare:
                return Rad(id: "t:" + p.mal, sort: .tidigare, titel: p.mal, detalj: nil, mal: p.mal, favikon: nil)
            case .sida, .bokmarke:
                let u = URL(string: p.mal)
                return Rad(id: "l:" + p.mal, sort: p.slag == .bokmarke ? .bokmarke : .historik,
                           titel: p.titel.isEmpty ? domanFor(u) : p.titel, detalj: utanSchema(p.mal), mal: p.mal, favikon: p.favikon)
            }
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

/// En adress utan `https://`, `www.` och avslutande snedstreck, i små bokstäver.
func utanSchema(_ url: String) -> String {
    var s = url.lowercased()
    for p in ["https://www.", "http://www.", "https://", "http://"] where s.hasPrefix(p) {
        s = String(s.dropFirst(p.count))
        break
    }
    if s.hasSuffix("/") { s.removeLast() }
    return s
}
