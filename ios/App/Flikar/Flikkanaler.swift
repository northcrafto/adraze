import Foundation

/// Bryggkanaler för AdRaze-sidorna (startsidan och Anpassa): historik, bokmärken, lokala förslag, nedladdningar
/// och stängda flikar. Nedladdningarnas namn är datorns (`dl:list`, `dl:open`, `dl:pause`, `dl:resume`,
/// `dl:cancel`, händelsen `download-update`); resten är nya för iPhone (datorns skal läser localStorage).
/// Förslag från sökmotorn (`omni:suggest`) har Brygga.
@MainActor
enum Flikkanaler {
    static let ytor: Set<String> = ["startsida", "anpassa"]

    private static func text(_ s: String?) -> JSONVarde { s.map { .text($0) } ?? .null }

    static func registrera(_ motor: Flikmotor, i app: AppMiljo) {
        let b = app.brygga

        // MARK: Flikar
        b.hantera("flikar:lista", ytor: ytor) { [weak motor] _ in
            guard let motor else { return [] }
            return .lista(motor.alla.map { f -> JSONVarde in
                let o: [String: JSONVarde] = [
                    "id": .text(f.id.uuidString), "url": text(f.url?.absoluteString), "title": .text(f.titel),
                    "privat": .bool(f.privat), "aktiv": .bool(f.id == motor.aktivtId), "sover": .bool(f.sover),
                    "favicon": text(f.favikonAdress),
                ]
                return .objekt(o)
            })
        }
        b.hantera("flikar:stangda", ytor: ytor) { [weak motor] _ in
            guard let motor else { return [] }
            return .lista(motor.stangda.reversed().map { s -> JSONVarde in
                .objekt(["url": .text(s.url.absoluteString), "title": .text(s.titel), "favicon": text(s.favikon)])
            })
        }
        b.hantera("flikar:angra", ytor: ytor) { [weak motor] _ in
            guard let f = motor?.angraStang() else { return .null }
            return .text(f.id.uuidString)
        }

        // MARK: Historik
        b.hantera("historik:lista", ytor: ytor) { [weak motor] anrop in
            guard let motor else { return [] }
            let max = anrop.arg(0)["max"].heltal ?? Sidhistorik.max
            return .lista(motor.historik.rader.prefix(max).map(\.json))
        }
        b.hantera("historik:sok", ytor: ytor) { [weak motor] anrop in
            guard let motor else { return [] }
            return .lista(motor.historik.sok(anrop.arg(0)["q"].text ?? "", max: anrop.arg(0)["max"].heltal ?? 8).map(\.json))
        }
        b.hantera("historik:taBort", ytor: ytor) { [weak motor] anrop in
            .bool(motor?.historik.taBort(anrop.arg(0).text ?? "") ?? false)
        }
        b.hantera("historik:rensa", ytor: ytor) { [weak motor] _ in
            .bool(motor?.historik.rensa() ?? false)
        }

        // MARK: Bokmärken
        b.hantera("bokmarken:lista", ytor: ytor) { [weak motor] _ in
            .lista(motor?.bokmarken.poster.map(\.json) ?? [])
        }
        b.hantera("bokmarken:lagg", ytor: ytor) { [weak motor] anrop in
            let d = anrop.arg(0)
            guard let url = d["url"].text else { throw BryggFel.ogiltigt("url saknas") }
            return .bool(motor?.bokmarken.lagg(url, titel: d["title"].text ?? "", favikon: d["favicon"].text) ?? false)
        }
        b.hantera("bokmarken:taBort", ytor: ytor) { [weak motor] anrop in
            .bool(motor?.bokmarken.taBort(anrop.arg(0).text ?? "") ?? false)
        }
        b.hantera("bokmarken:finns", ytor: ytor) { [weak motor] anrop in
            .bool(motor?.bokmarken.finns(anrop.arg(0).text ?? "") ?? false)
        }

        // MARK: Förslag (lokala)
        b.hantera("forslag:lokala", ytor: ytor) { [weak motor] anrop in
            guard let motor else { return [] }
            let q = anrop.arg(0)["q"].text ?? ""
            let privat = anrop.arg(0)["privat"].bool ?? false
            let k = motor.forslag.komplettering(q, privat: privat)
            return .lista(motor.forslag.lokala(q, privat: privat, komplettering: k).map(\.json))
        }
        b.hantera("forslag:toppsajter", ytor: ytor) { [weak motor] _ in
            .lista(motor?.forslag.toppsajter(privat: false).map(\.json) ?? [])
        }

        // MARK: Nedladdningar (datorns dl:*)
        b.hantera("dl:list", ytor: ytor) { [weak motor] _ in
            .lista(motor?.nedladdare.poster.map(\.json) ?? [])
        }
        b.hantera("dl:open", ytor: ytor) { [weak motor] anrop in
            motor?.nedladdare.oppna(anrop.arg(0).text ?? "")
            return true
        }
        b.hantera("dl:share", ytor: ytor) { [weak motor] anrop in
            motor?.nedladdare.dela(anrop.arg(0).text ?? "")
            return true
        }
        b.hantera("dl:pause", ytor: ytor) { [weak motor] anrop in
            motor?.nedladdare.pausa(anrop.arg(0).text ?? "")
            return true
        }
        b.hantera("dl:resume", ytor: ytor) { [weak motor] anrop in
            guard let motor else { return false }
            motor.nedladdare.fortsatt(anrop.arg(0).text ?? "", reserv: motor.aktivFlik?.vy)
            return true
        }
        b.hantera("dl:cancel", ytor: ytor) { [weak motor] anrop in
            motor?.nedladdare.avbryt(anrop.arg(0).text ?? "")
            return true
        }
        b.hantera("dl:remove", ytor: ytor) { [weak motor] anrop in
            motor?.nedladdare.taBort(anrop.arg(0).text ?? "")
            return true
        }
    }
}
