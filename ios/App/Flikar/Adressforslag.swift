import Foundation

/// Ett förslag under adressfältet, som posterna i datorns `sug.items`.
struct Forslagsrad: Sendable, Hashable {
    enum Slag: String, Sendable {
        /// Adressen som fylls i medan man skriver ("ver" → "verkstad.se").
        case komplettering
        /// Det man skrev ser ut som en adress.
        case adress
        /// Sök på det man skrev.
        case sok
        /// Något man sökt på förut (ur historiken).
        case tidigare
        /// En sida ur historiken.
        case sida
        /// Ett bokmärke.
        case bokmarke
        /// En mest besökt sajt (tomt fält).
        case topp
    }

    let slag: Slag
    /// Sökfrågan för `sok` och `tidigare`.
    var fraga: String?
    var url: String?
    var titel: String?
    var favikon: String?
    var vard: String?

    var json: JSONVarde {
        var o: [String: JSONVarde] = ["kind": .text(slag.rawValue)]
        if let fraga { o["q"] = .text(fraga) }
        if let url { o["url"] = .text(url) }
        if let titel { o["title"] = .text(titel) }
        if let favikon { o["favicon"] = .text(favikon) }
        if let vard { o["host"] = .text(vard) }
        o["search"] = .bool(slag == .sok || slag == .tidigare)
        return .objekt(o)
    }
}

/// Lokala förslag till adressfältet ur historiken och bokmärkena, med datorns regler (`ui/shell.js`
/// `bestCompletion`, `localSug`, `topSitesForSug`, `searchQueryOf`, `pretty`):
///  - kompletteringen är den mest besökta värden som börjar med det man skrivit (inga mellanslag eller /)
///  - först kompletteringen eller det man skrev (adress eller sökning), sedan högst 3 tidigare sökningar som
///    börjar med texten, högst 3 sidor där alla ord träffar ett ordbörjan, och (nytt på iPhone) högst 2 bokmärken
///  - privata flikar: bara det man skrev, ingen historik och inga bokmärken
///  - tomt fält: de 8 mest besökta sajterna
///
/// Förslag från sökmotorn (`omni:suggest`) hämtar Brygga; skalet lägger dem sist.
@MainActor
final class Adressforslag {
    private let historik: Sidhistorik
    private let bokmarken: Bokmarkesbok

    init(historik: Sidhistorik, bokmarken: Bokmarkesbok) {
        self.historik = historik
        self.bokmarken = bokmarken
    }

    /// Värden att fylla i medan man skriver, eller `nil`.
    func komplettering(_ text: String, privat: Bool) -> Forslagsrad? {
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty, !privat, !q.contains(" "), !q.contains("/") else { return nil }
        for r in historik.rader.sorted(by: { $0.n > $1.n }) {
            let vard = Self.doman(r.url)
            if vard.hasPrefix(q) && vard.count > q.count { return Forslagsrad(slag: .komplettering, url: "https://" + vard, vard: vard) }
        }
        return nil
    }

    func lokala(_ text: String, privat: Bool, komplettering: Forslagsrad? = nil) -> [Forslagsrad] {
        let fraga = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !fraga.isEmpty else { return toppsajter(privat: privat) }
        let q = fraga.lowercased()
        var ut: [Forslagsrad] = []
        if let k = komplettering, let vard = k.vard {
            let h = historik.rader.first { Self.doman($0.url) == vard }
            ut.append(Forslagsrad(slag: .komplettering, url: k.url, titel: h?.title ?? vard, favikon: h?.favicon, vard: vard))
        }
        if Self.arAdress(fraga) {
            if komplettering == nil {
                let u = fraga.range(of: #"^[a-z]+://"#, options: [.regularExpression, .caseInsensitive]) != nil ? fraga : "https://" + fraga
                ut.append(Forslagsrad(slag: .adress, url: u, titel: "", vard: Self.doman(u)))
            }
        } else {
            ut.append(Forslagsrad(slag: .sok, fraga: fraga))
        }
        if privat { return ut }

        var seddaQ: Set<String> = [q]
        var tidigare: [Forslagsrad] = []
        for r in historik.rader {
            guard let sq = Self.sokfraga(r.url) else { continue }
            let l = sq.lowercased()
            guard !seddaQ.contains(l), l.hasPrefix(q) else { continue }
            seddaQ.insert(l)
            tidigare.append(Forslagsrad(slag: .tidigare, fraga: sq))
            if tidigare.count >= 3 { break }
        }
        var seddaU = Set<String>(komplettering?.vard.map { [$0] } ?? [])
        var sidor: [Forslagsrad] = []
        for r in historik.sok(fraga, max: 12) {
            let nyckel = Self.nyckel(r.url)
            if seddaU.contains(nyckel) { continue }
            if let k = komplettering?.vard, Self.doman(r.url) == k,
               r.url.range(of: #"^https?://[^/]+/?$"#, options: [.regularExpression, .caseInsensitive]) != nil { continue }
            seddaU.insert(nyckel)
            sidor.append(Forslagsrad(slag: .sida, url: r.url, titel: r.title, favikon: r.favicon, vard: Self.doman(r.url)))
            if sidor.count >= 3 { break }
        }
        var bm: [Forslagsrad] = []
        for b in bokmarken.sok(fraga, max: 6) where !seddaU.contains(Self.nyckel(b.url)) {
            seddaU.insert(Self.nyckel(b.url))
            bm.append(Forslagsrad(slag: .bokmarke, url: b.url, titel: b.title, favikon: b.favicon, vard: Self.doman(b.url)))
            if bm.count >= 2 { break }
        }
        return ut + tidigare + sidor + bm
    }

    /// De mest besökta sajterna (en per värd), högst 8. Inga i privata flikar.
    func toppsajter(privat: Bool, max: Int = 8) -> [Forslagsrad] {
        guard !privat else { return [] }
        var sedda = Set<String>()
        var ut: [Forslagsrad] = []
        for r in historik.rader.sorted(by: { $0.n > $1.n }) {
            let vard = Self.doman(r.url)
            guard !vard.isEmpty, sedda.insert(vard).inserted else { continue }
            ut.append(Forslagsrad(slag: .topp, url: r.url, titel: r.title.isEmpty ? vard : r.title, favikon: r.favicon, vard: vard))
            if ut.count >= max { break }
        }
        return ut
    }

    // MARK: - Datorns hjälpfunktioner

    /// Värden utan www., små bokstäver (`domainOf`).
    static func doman(_ url: String) -> String {
        guard let h = URL(string: url)?.host(percentEncoded: false)?.lowercased() else { return "" }
        return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }

    /// Adressen utan schema och www., som datorn visar den (`pretty`).
    static func snygg(_ url: String) -> String {
        guard let u = URL(string: url), let h = u.host(percentEncoded: false) else { return url }
        let vard = h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
        let vag = u.path(percentEncoded: true)
        let fraga = u.query(percentEncoded: true).map { "?" + $0 } ?? ""
        return vard + (vag == "/" || vag.isEmpty ? "" : vag) + fraga
    }

    /// Adressen utan ?, # och avslutande / (för att inte visa samma sida två gånger).
    static func nyckel(_ url: String) -> String {
        var s = url
        if let i = s.firstIndex(where: { $0 == "#" || $0 == "?" }) { s = String(s[..<i]) }
        if s.hasSuffix("/") { s.removeLast() }
        return s
    }

    static func arAdress(_ text: String) -> Bool {
        text.range(of: #"^[a-z]+://"#, options: [.regularExpression, .caseInsensitive]) != nil
            || text.range(of: #"^[^\s]+\.[a-z]{2,}(/|$)"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Sökfrågan om adressen är en sökmotors resultatsida (datorns `SOK_PARAM`).
    static func sokfraga(_ url: String) -> String? {
        guard let u = URLComponents(string: url), let h0 = u.host?.lowercased() else { return nil }
        let vard = h0.hasPrefix("www.") ? String(h0.dropFirst(4)) : h0
        let regler: [(String, String, String)] = [
            (#"(^|\.)google\.[a-z.]+$"#, "/search", "q"), (#"^search\.brave\.com$"#, "/search", "q"),
            (#"^search\.adraze\.app$"#, "", "q"), (#"^(html\.)?duckduckgo\.com$"#, "", "q"),
            (#"^bing\.com$"#, "/search", "q"), (#"^youtube\.com$"#, "/results", "search_query"),
        ]
        for (monster, vag, param) in regler where vard.range(of: monster, options: .regularExpression) != nil {
            if !vag.isEmpty && !u.path.hasPrefix(vag) { continue }
            // Som URLSearchParams: + är mellanslag.
            let ra = u.percentEncodedQueryItems?.first { $0.name == param }?.value ?? ""
            let q = (ra.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? ra).trimmingCharacters(in: .whitespaces)
            return q.isEmpty ? nil : q
        }
        return nil
    }
}
