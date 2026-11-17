import Foundation
import Observation

/// En sida i historiken, i datorns format (`ui/shell.js` `pushHistory`): `{url, title, favicon, t, n}`.
struct Historikrad: Codable, Sendable, Hashable {
    var url: String
    var title: String
    var favicon: String?
    /// Senaste besöket, millisekunder sedan 1970.
    var t: Double
    /// Antal besök.
    var n: Int

    var json: JSONVarde {
        ["url": .text(url), "title": .text(title), "favicon": favicon.map(JSONVarde.text) ?? .null, "t": .tal(t), "n": .tal(Double(n))]
    }
}

/// Historiken. Som på datorn: bara http(s), aldrig privata flikar, senaste först, högst 500 sidor, en per adress
/// (ett nytt besök flyttar den överst och räknar upp `n`), och per konto (`historik.json` utloggad,
/// `historik-<konto>.json` inloggad). Ett barnkonto får inte radera sin historik (`last`).
@MainActor
@Observable
final class Sidhistorik {
    private(set) var rader: [Historikrad] = []
    /// Barnkonto: historiken går inte att ta bort.
    private(set) var last = false

    @ObservationIgnored private let lagring: Fliklagring
    @ObservationIgnored private var fil: URL
    @ObservationIgnored private var sparjobb: Task<Void, Never>?
    @ObservationIgnored var andrad: (() -> Void)?
    /// Sant för en motor som bara läser (självtestets omstart): ändringar skrivs aldrig till disk.
    @ObservationIgnored var skrivskydd = false

    static let max = 500

    init(lagring: Fliklagring) {
        self.lagring = lagring
        fil = lagring.historikfil(konto: nil)
        rader = lagring.las([Historikrad].self, fran: fil) ?? []
    }

    func byttKonto(_ konto: String?, barn: Bool) {
        let ny = lagring.historikfil(konto: konto)
        last = barn
        guard ny != fil else { return }
        sparaNu()
        fil = ny
        rader = lagring.las([Historikrad].self, fran: ny) ?? []
        andrad?()
    }

    /// Ett besök (didCommit eller adressbyte inom sidan).
    func besok(_ url: URL, titel: String, favikon: String?) {
        guard Self.sparbar(url) else { return }
        let u = url.absoluteString
        let forra = rader.firstIndex { $0.url == u }.map { rader.remove(at: $0) }
        let t = titel.isEmpty ? (forra?.title ?? u) : titel
        rader.insert(Historikrad(url: u, title: t, favicon: favikon ?? forra?.favicon, t: Date().flikMs, n: (forra?.n ?? 0) + 1), at: 0)
        if rader.count > Self.max { rader.removeLast(rader.count - Self.max) }
        sparaSnart()
    }

    func titel(_ titel: String, for url: URL) {
        guard !titel.isEmpty, let i = rader.firstIndex(where: { $0.url == url.absoluteString }), rader[i].title != titel else { return }
        rader[i].title = titel
        sparaSnart()
    }

    func favikon(_ adress: String, for url: URL) {
        guard let i = rader.firstIndex(where: { $0.url == url.absoluteString }), rader[i].favicon != adress else { return }
        rader[i].favicon = adress
        sparaSnart()
    }

    /// `false` om historiken är låst (barnkonto).
    @discardableResult
    func taBort(_ url: String) -> Bool {
        guard !last else { return false }
        rader.removeAll { $0.url == url }
        sparaSnart()
        return true
    }

    @discardableResult
    func rensa() -> Bool {
        guard !last else { return false }
        rader = []
        sparaSnart()
        return true
    }

    /// Sidor där varje ord i `text` börjar ett ord i titeln eller adressen (datorns `localSug`, "y" träffar
    /// "YouTube" men inte "mycket"), flest besök först. Sökmotorernas resultatsidor räknas inte.
    func sok(_ text: String, max: Int = 3) -> [Historikrad] {
        let ord = Self.ord(text)
        guard !ord.isEmpty else { return [] }
        var sedda = Set<String>()
        var ut: [Historikrad] = []
        for r in rader.sorted(by: { $0.n > $1.n }) {
            if Adressforslag.sokfraga(r.url) != nil { continue }
            let hostack = (r.title + " " + Adressforslag.snygg(r.url)).lowercased()
            guard ord.allSatisfy({ !Self.ordborjan(hostack, $0).isEmpty }) else { continue }
            let nyckel = Adressforslag.nyckel(r.url)
            guard sedda.insert(nyckel).inserted else { continue }
            ut.append(r)
            if ut.count >= max { break }
        }
        return ut
    }

    static func ord(_ text: String) -> [String] {
        text.lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { !$0.isEmpty }
    }

    /// Var i texten ordet börjar som ett eget ord (datorns `wordStarts`).
    static func ordborjan(_ text: String, _ ord: String) -> [String.Index] {
        var ut: [String.Index] = []
        var fran = text.startIndex
        while let r = text.range(of: ord, range: fran..<text.endIndex) {
            if r.lowerBound == text.startIndex {
                ut.append(r.lowerBound)
            } else {
                let fore = text[text.index(before: r.lowerBound)]
                if !(fore.isLetter || fore.isNumber) { ut.append(r.lowerBound) }
            }
            fran = text.index(after: r.lowerBound)
        }
        return ut
    }

    static func sparbar(_ url: URL) -> Bool {
        let s = (url.scheme ?? "").lowercased()
        return s == "http" || s == "https"
    }

    // MARK: - Spara

    private func sparaSnart() {
        andrad?()
        sparjobb?.cancel()
        sparjobb = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            self?.sparaNu()
        }
    }

    func sparaNu() {
        sparjobb?.cancel()
        sparjobb = nil
        guard !skrivskydd else { return }
        lagring.skriv(rader, till: fil)
    }
}
