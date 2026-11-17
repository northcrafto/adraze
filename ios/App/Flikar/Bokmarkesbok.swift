import Foundation
import Observation

/// Ett bokmärke i datorns format (`ui/shell.js` `addBookmark`): `{url, title, favicon, _t}`.
struct Bokmarke: Codable, Sendable, Hashable {
    var url: String
    var title: String
    var favicon: String?
    /// När det lades till eller ändrades, millisekunder sedan 1970 (för synken mellan enheter).
    var _t: Double

    var json: JSONVarde {
        ["url": .text(url), "title": .text(title), "favicon": favicon.map(JSONVarde.text) ?? .null, "_t": .tal(_t)]
    }
}

/// Bokmärkena, senaste först, med gravstenar (`url → tid`) för borttagna så att synken kan sprida
/// borttagningar till andra enheter, som datorns `skoll-bookmarks` och `skoll-bm-tomb`.
@MainActor
@Observable
final class Bokmarkesbok {
    private(set) var poster: [Bokmarke] = []
    private(set) var gravstenar: [String: Double] = [:]

    @ObservationIgnored private let lagring: Fliklagring
    @ObservationIgnored private var sparjobb: Task<Void, Never>?
    @ObservationIgnored var andrad: (() -> Void)?
    /// Sant för en motor som bara läser (självtestets omstart).
    @ObservationIgnored var skrivskydd = false

    private struct Fil: Codable {
        var bokmarken: [Bokmarke]
        var gravstenar: [String: Double]
    }

    init(lagring: Fliklagring) {
        self.lagring = lagring
        if let f = lagring.las(Fil.self, fran: lagring.bokmarkesfil) {
            poster = f.bokmarken
            gravstenar = f.gravstenar
        }
    }

    func finns(_ url: String) -> Bool { poster.contains { $0.url == url } }

    /// Lägger till överst. Finns adressen redan händer ingenting (som datorn).
    @discardableResult
    func lagg(_ url: String, titel: String, favikon: String?) -> Bool {
        guard !url.isEmpty, !finns(url) else { return false }
        poster.insert(Bokmarke(url: url, title: titel.isEmpty ? url : titel, favicon: favikon, _t: Date().flikMs), at: 0)
        gravstenar.removeValue(forKey: url)
        sparaSnart()
        return true
    }

    @discardableResult
    func taBort(_ url: String) -> Bool {
        guard finns(url) else { return false }
        poster.removeAll { $0.url == url }
        gravstenar[url] = Date().flikMs
        sparaSnart()
        return true
    }

    /// Lägger till eller tar bort (stjärnan i adressfältet). Ger `true` om adressen är bokmärkt efteråt.
    @discardableResult
    func vaxla(_ url: String, titel: String, favikon: String?) -> Bool {
        if finns(url) { taBort(url); return false }
        lagg(url, titel: titel, favikon: favikon)
        return true
    }

    func byttNamn(_ url: String, titel: String) {
        guard let i = poster.firstIndex(where: { $0.url == url }) else { return }
        poster[i].title = titel
        poster[i]._t = Date().flikMs
        sparaSnart()
    }

    func flytta(_ url: String, till plats: Int) {
        guard let i = poster.firstIndex(where: { $0.url == url }) else { return }
        let b = poster.remove(at: i)
        poster.insert(b, at: min(max(0, plats), poster.count))
        sparaSnart()
    }

    /// Bokmärken där varje ord börjar ett ord i titeln eller adressen.
    func sok(_ text: String, max: Int = 3) -> [Bokmarke] {
        let ord = Sidhistorik.ord(text)
        guard !ord.isEmpty else { return [] }
        var ut: [Bokmarke] = []
        for b in poster {
            let hostack = (b.title + " " + Adressforslag.snygg(b.url)).lowercased()
            guard ord.allSatisfy({ !Sidhistorik.ordborjan(hostack, $0).isEmpty }) else { continue }
            ut.append(b)
            if ut.count >= max { break }
        }
        return ut
    }

    private func sparaSnart() {
        andrad?()
        sparjobb?.cancel()
        sparjobb = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            self?.sparaNu()
        }
    }

    func sparaNu() {
        sparjobb?.cancel()
        sparjobb = nil
        guard !skrivskydd else { return }
        lagring.skriv(Fil(bokmarken: poster, gravstenar: gravstenar), till: lagring.bokmarkesfil)
    }
}
