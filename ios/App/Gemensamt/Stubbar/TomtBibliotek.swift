import Foundation
import Observation
import UIKit

/// Ersättning för Flikars bibliotek (`-utan Flikar`): historik ur `SidaLaddad` och bokmärken, bara i minnet.
/// Inga nedladdningar och inga favikoner.
///
/// Ägare: Grund.
@MainActor
@Observable
final class TomtBibliotek: Bibliotekstjanst {
    private(set) var historik: [Sidpost] = []
    private(set) var bokmarken: [Sidpost] = []
    let nedladdningar: [Nedladdningspost] = []
    let kanRensaHistorik = true
    @ObservationIgnored private var prenumeration: Prenumeration?

    init(handelser: Handelser) {
        prenumeration = handelser.lyssna(SidaLaddad.self) { [weak self] h in
            guard let self, !h.privat, ["http", "https"].contains(h.url.scheme ?? "") else { return }
            let gammal = historik.first { $0.url == h.url.absoluteString }
            historik.removeAll { $0.url == h.url.absoluteString }
            historik.insert(Sidpost(url: h.url.absoluteString, titel: h.titel, favikon: nil, senast: Date(),
                                    antal: (gammal?.antal ?? 0) + 1), at: 0)
            if historik.count > 500 { historik.removeLast(historik.count - 500) }
        }
    }

    func arBokmarkt(_ url: URL?) -> Bool { url.map { u in bokmarken.contains { $0.url == u.absoluteString } } ?? false }

    @discardableResult
    func vaxlaBokmarke(_ url: URL, titel: String) -> Bool {
        if arBokmarkt(url) { taBortBokmarke(url.absoluteString); return false }
        bokmarken.insert(Sidpost(url: url.absoluteString, titel: titel, favikon: nil, senast: Date(), antal: 0), at: 0)
        return true
    }

    func taBortBokmarke(_ url: String) { bokmarken.removeAll { $0.url == url } }
    func taBortHistorik(_ url: String) { historik.removeAll { $0.url == url } }
    func rensaHistorik() { historik = [] }

    func komplettering(_ text: String, privat: Bool) -> String? {
        let q = text.lowercased()
        guard !privat, !q.isEmpty, !q.contains(" "), !q.contains("/") else { return nil }
        return historik.sorted { $0.antal > $1.antal }.compactMap { URL(string: $0.url)?.host() }
            .map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 }
            .first { $0.hasPrefix(q) && $0.count > q.count }
    }

    func lokalaForslag(_ text: String, privat: Bool) -> [Adressforslagspost] {
        let q = text.lowercased().trimmingCharacters(in: .whitespaces)
        guard !privat, !q.isEmpty else { return [] }
        let sidor = historik.filter { $0.url.lowercased().contains(q) || $0.titel.lowercased().contains(q) }.prefix(3)
            .map { Adressforslagspost(slag: .sida, titel: $0.titel, mal: $0.url, favikon: nil) }
        let bm = bokmarken.filter { $0.url.lowercased().contains(q) || $0.titel.lowercased().contains(q) }.prefix(2)
            .map { Adressforslagspost(slag: .bokmarke, titel: $0.titel, mal: $0.url, favikon: nil) }
        return Array(sidor) + Array(bm)
    }

    func toppsajter(max: Int) -> [Sidpost] {
        var sedda = Set<String>()
        return Array(historik.sorted { $0.antal > $1.antal }.filter { sedda.insert(URL(string: $0.url)?.host() ?? $0.url).inserted }.prefix(max))
    }

    func favikon(_ adress: String?) -> UIImage? { nil }
    func oppnaNedladdning(_ id: String) {}
    func delaNedladdning(_ id: String) {}
    func pausaNedladdning(_ id: String) {}
    func fortsattNedladdning(_ id: String) {}
    func avbrytNedladdning(_ id: String) {}
    func taBortNedladdning(_ id: String) {}
}
