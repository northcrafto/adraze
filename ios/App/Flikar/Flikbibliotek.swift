import Foundation
import Observation
import UIKit

/// `Bibliotekstjanst` (Gemensamt/Bibliotek.swift): Flikars historik, bokmärken, nedladdningar och adressförslag
/// för skalet. Samma data som webbsidorna når med `historik:*`, `bokmarken:*` och `dl:*`.
///
/// Ägare: Flikar.
@MainActor
@Observable
final class Flikbibliotek: Bibliotekstjanst {
    @ObservationIgnored private unowned let motor: Flikmotor

    init(motor: Flikmotor) { self.motor = motor }

    private static func tid(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }

    var historik: [Sidpost] {
        motor.historik.rader.map { Sidpost(url: $0.url, titel: $0.title, favikon: $0.favicon, senast: Self.tid($0.t), antal: $0.n) }
    }

    var bokmarken: [Sidpost] {
        motor.bokmarken.poster.map { Sidpost(url: $0.url, titel: $0.title, favikon: $0.favicon, senast: Self.tid($0._t), antal: 0) }
    }

    var nedladdningar: [Nedladdningspost] {
        motor.nedladdare.poster.map { p in
            let lage: Nedladdningspost.Lage
            switch p.state {
            case "progressing": lage = .pagar
            case "paused": lage = .pausad
            case "completed": lage = .klar
            case "cancelled": lage = .avbruten
            default: lage = .misslyckad
            }
            return Nedladdningspost(id: p.id, filnamn: p.filename, url: p.url, fil: p.path.isEmpty ? nil : URL(fileURLWithPath: p.path),
                                    totalt: p.total, mottaget: p.received, lage: lage, privat: p.privat,
                                    startad: Self.tid(p.startad), fel: p.fel)
        }
        .sorted { $0.startad > $1.startad }
    }

    var kanRensaHistorik: Bool { !motor.historik.last }

    func arBokmarkt(_ url: URL?) -> Bool {
        guard let url else { return false }
        return motor.bokmarken.finns(url.absoluteString)
    }

    @discardableResult
    func vaxlaBokmarke(_ url: URL, titel: String) -> Bool {
        let s = url.absoluteString
        let favikon = motor.alla.first { $0.url == url }?.favikonAdress ?? motor.historik.rader.first { $0.url == s }?.favicon
        return motor.bokmarken.vaxla(s, titel: titel, favikon: favikon)
    }

    func taBortBokmarke(_ url: String) { _ = motor.bokmarken.taBort(url) }
    func taBortHistorik(_ url: String) { _ = motor.historik.taBort(url) }
    func rensaHistorik() { _ = motor.historik.rensa() }

    func komplettering(_ text: String, privat: Bool) -> String? {
        motor.forslag.komplettering(text, privat: privat)?.vard
    }

    func lokalaForslag(_ text: String, privat: Bool) -> [Adressforslagspost] {
        motor.forslag.lokala(text, privat: privat).compactMap { r in
            switch r.slag {
            case .tidigare:
                return r.fraga.map { Adressforslagspost(slag: .tidigare, titel: $0, mal: $0, favikon: nil) }
            case .sida, .bokmarke:
                guard let u = r.url else { return nil }
                return Adressforslagspost(slag: r.slag == .bokmarke ? .bokmarke : .sida, titel: r.titel ?? "", mal: u, favikon: r.favikon)
            default:
                return nil
            }
        }
    }

    func toppsajter(max: Int) -> [Sidpost] {
        motor.forslag.toppsajter(privat: false, max: max).compactMap { r in
            guard let u = r.url else { return nil }
            let rad = motor.historik.rader.first { $0.url == u }
            return Sidpost(url: u, titel: r.titel ?? "", favikon: r.favikon, senast: rad.map { Self.tid($0.t) } ?? Date(), antal: rad?.n ?? 0)
        }
    }

    func favikon(_ adress: String?) -> UIImage? {
        guard let adress, !adress.isEmpty else { return nil }
        return motor.favikoner.cachad(adress)
    }

    func oppnaNedladdning(_ id: String) { motor.nedladdare.oppna(id) }
    func delaNedladdning(_ id: String) { motor.nedladdare.dela(id) }
    func pausaNedladdning(_ id: String) { motor.nedladdare.pausa(id) }
    func fortsattNedladdning(_ id: String) { motor.nedladdare.fortsatt(id, reserv: motor.aktivFlik?.vy) }
    func avbrytNedladdning(_ id: String) { motor.nedladdare.avbryt(id) }
    func taBortNedladdning(_ id: String) { motor.nedladdare.taBort(id) }
}
