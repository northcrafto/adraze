import CryptoKit
import Foundation
import WebKit

/// WebKits regellistor (`WKContentRuleList`): slås upp i `WKContentRuleListStore` om de redan är kompilerade,
/// annars kompileras de (i WebKits egen bakgrundskö). Identiteten är `adraze-<namn>-<sha256:12>` ur manifestet,
/// så en lista kompileras om bara när filen har ändrats. Gamla `adraze-`-listor tas bort efteråt.
///
/// Dessutom stopplistan (en regel som stoppar nästa huvudsida), som skyddet lägger i en vy bara för en enda
/// navigering: när en annonsvärd skickar fliken vidare stoppar WebKit då själva adressen med fel 104, och
/// Flikar visar stoppsidan med den riktiga adressen.
///
/// Ägare: Skydd.
@MainActor
final class Regellistor {
    struct Matning {
        let namn: String
        let id: String
        let regler: Int
        /// "uppslagen" (fanns redan) eller "kompilerad".
        let kalla: String
        let ms: Double
        let fel: String?

        var json: JSONVarde {
            var o: [String: JSONVarde] = ["namn": .text(namn), "id": .text(id), "regler": .tal(Double(regler)),
                                          "kalla": .text(kalla), "ms": .tal((ms * 10).rounded() / 10)]
            if let fel { o["fel"] = .text(fel) }
            return .objekt(o)
        }
    }

    /// Listorna som är klara, efter namn ("sidor", "security", "ads" …).
    private(set) var klara: [String: WKContentRuleList] = [:]
    private(set) var matningar: [Matning] = []
    private(set) var totalMs: Double = 0
    private(set) var borttagna: [String] = []
    /// Stopplistan, eller `nil` om den inte är klar (eller inte gick att kompilera).
    private(set) var stopp: WKContentRuleList?
    private(set) var stoppMatning: Matning?
    private let logg = Logg("Skydd")

    private var store: WKContentRuleListStore { WKContentRuleListStore.default() }

    static func identitet(_ post: Regeldata.Listpost) -> String { "adraze-\(post.namn)-\(post.sha256.prefix(12))" }

    /// Huvudsidan (dokument i översta ramen), vilken adress som helst.
    static let stoppjson = #"[{"trigger":{"url-filter":".*","resource-type":["document"],"load-context":["top-frame"]},"action":{"type":"block"}}]"#
    static let stoppid: String = {
        let h = SHA256.hash(data: Data(stoppjson.utf8)).map { String(format: "%02x", $0) }.joined()
        return "adraze-stopp-\(h.prefix(12))"
    }()

    /// Slår upp eller kompilerar alla listor i manifestets ordning (sidor och security först).
    /// `framsteg` får andelen klara regler (0–1), `klar` varje lista när den går att använda.
    func ladda(_ data: Regeldata, rensa: Bool, framsteg: @MainActor (Double) -> Void,
               klar: @MainActor (String, WKContentRuleList) -> Void) async -> [String] {
        let t0 = CFAbsoluteTimeGetCurrent()
        var fel: [String] = []
        var finns = Set(await tillgangliga())
        if rensa {
            for id in finns where id.hasPrefix("adraze-") {
                await taBort(id)
                borttagna.append(id)
            }
            finns = []
            logg.info("rensade de kompilerade listorna (-skyddRensa)")
        }
        // Stopplistan först (en regel, några millisekunder)
        let ts = CFAbsoluteTimeGetCurrent()
        var stoppkalla = "uppslagen"
        var stoppfel: String?
        if finns.contains(Self.stoppid) { stopp = await slaUpp(Self.stoppid) }
        if stopp == nil {
            stoppkalla = "kompilerad"
            (stopp, stoppfel) = await kompilera(Self.stoppid, Self.stoppjson)
        }
        let stoppms = (CFAbsoluteTimeGetCurrent() - ts) * 1000
        stoppMatning = Matning(namn: "stopp", id: Self.stoppid, regler: 1, kalla: stoppkalla, ms: stoppms, fel: stoppfel)
        if let stoppfel { logg.fel("stopplistan: \(stoppfel)") } else { logg.info("stopplistan \(stoppkalla) på \(Int(stoppms)) ms") }

        let totalt = max(1, data.listor.reduce(0) { $0 + $1.regler })
        var gjort = 0
        var aktuella: Set<String> = [Self.stoppid]
        for post in data.listor {
            let id = Self.identitet(post)
            aktuella.insert(id)
            let t1 = CFAbsoluteTimeGetCurrent()
            var lista: WKContentRuleList?
            var kalla = "uppslagen"
            var felet: String?
            if finns.contains(id) { lista = await slaUpp(id) }
            if lista == nil {
                kalla = "kompilerad"
                let fil = data.rot.appendingPathComponent(post.fil)
                let text = await Task.detached(priority: .userInitiated) { try? String(contentsOf: fil, encoding: .utf8) }.value
                if let text {
                    (lista, felet) = await kompilera(id, text)
                } else {
                    felet = "filen saknas: \(post.fil)"
                }
            }
            let ms = (CFAbsoluteTimeGetCurrent() - t1) * 1000
            matningar.append(Matning(namn: post.namn, id: id, regler: post.regler, kalla: kalla, ms: ms, fel: felet))
            if let lista {
                klara[post.namn] = lista
                klar(post.namn, lista)
                logg.info("\(post.namn): \(post.regler) regler \(kalla) på \(Int(ms)) ms")
            } else {
                fel.append(post.namn)
                logg.fel("\(post.namn): \(felet ?? "okänt fel")")
            }
            gjort += post.regler
            framsteg(Double(gjort) / Double(totalt))
        }
        for id in finns where id.hasPrefix("adraze-") && !aktuella.contains(id) {
            await taBort(id)
            borttagna.append(id)
        }
        totalMs = (CFAbsoluteTimeGetCurrent() - t0) * 1000
        return fel
    }

    // MARK: - WebKit

    private func tillgangliga() async -> [String] {
        await withCheckedContinuation { (k: CheckedContinuation<[String], Never>) in
            store.getAvailableContentRuleListIdentifiers { k.resume(returning: $0 ?? []) }
        }
    }

    private func slaUpp(_ id: String) async -> WKContentRuleList? {
        await withCheckedContinuation { (k: CheckedContinuation<WKContentRuleList?, Never>) in
            store.lookUpContentRuleList(forIdentifier: id) { lista, _ in k.resume(returning: lista) }
        }
    }

    private func kompilera(_ id: String, _ json: String) async -> (WKContentRuleList?, String?) {
        await withCheckedContinuation { (k: CheckedContinuation<(WKContentRuleList?, String?), Never>) in
            store.compileContentRuleList(forIdentifier: id, encodedContentRuleList: json) { lista, fel in
                if let fel {
                    let ns = fel as NSError
                    k.resume(returning: (nil, "\(ns.domain) \(ns.code): \(ns.localizedDescription)"))
                } else {
                    k.resume(returning: (lista, nil))
                }
            }
        }
    }

    private func taBort(_ id: String) async {
        await withCheckedContinuation { (k: CheckedContinuation<Void, Never>) in
            store.removeContentRuleList(forIdentifier: id) { _ in k.resume() }
        }
    }
}
