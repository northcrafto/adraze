import SwiftUI
import UIKit

/// Chatten: native SwiftUI ovanpå meddelandelagret (`ChattLager`, i dag `ChattV1` mot `/chatt/*`).
///
/// Kanaler i bryggan:
/// - `chatt:visa` `{ konv?: "dm:<id>" | "grupp:<id>" }` – visar chatten i helskärm.
/// Menyns plats "Chatt" (`Platser.chatt`) registreras med `app.ersatt(plats:titel:oppna:)` och visar samma sak.
/// - `chatt:olasta` – antal olästa meddelanden (för en bricka i menyn).
/// - `chatt:prov` – bara yta `labb` (helhetstestet): chattens läge (fas, raderna, öppen konversation) och
///   `{ tillbaka: true }` som bakåtknappen.
///
/// Ägare: Konto och chatt.
final class ChattModul: NSObject, AppModul {
    static let namn = "Chatt"
    static let ordning = 60

    @MainActor static var lage: ChattLage?

    @MainActor static func registrera(i app: AppMiljo) {
        app.brygga.hantera("chatt:visa") { anrop in
            let konv = anrop.argument.first?["konv"].text.flatMap(KonvId.init(text:))
            ChattVisning.visa(app, konv: konv)
            return .null
        }
        app.brygga.hantera("chatt:olasta") { _ in .tal(Double(lage?.antalOlasta ?? 0)) }
        app.brygga.hantera("chatt:prov", ytor: ["labb"]) { anrop in
            let l = delatLage(app)
            if anrop.argument.first?["tillbaka"].bool == true {
                l.provSkarm = "inkorg"
                try? await Task.sleep(nanoseconds: 400_000_000)
                l.provSkarm = nil
            }
            let fas: String
            switch l.fas {
            case .utloggad: fas = "utloggad"
            case .laser: fas = "laser"
            case .behoverNamn: fas = "behoverNamn"
            case .klar: fas = "klar"
            case .fel: fas = "fel"
            }
            return .objekt([
                "fas": .text(fas), "listanLaddad": .bool(l.listanLaddad),
                "rader": .lista(l.rader.prefix(20).map { r -> JSONVarde in ["namn": .text(r.namn), "konv": .text(r.konv.nyckel)] }),
                "oppen": l.oppen.map { JSONVarde.text($0.nyckel) } ?? .null,
                "meddelanden": .tal(Double(l.oppen.flatMap { l.meddelanden[$0]?.count } ?? 0)),
            ])
        }
        // Menyns plats "Chatt" (skalets meny öppnar den via app.platser): den native chatten i helskärm.
        app.ersatt(plats: Platser.chatt, titel: ct("Chatt")) { ChattVisning.visa(app) }
        app.labb.registrera("chatt", beskrivning: "Chatten mot en lokal testserver (-api): upplåsning, listan, öppna, skicka, långtryck, reaktion, svar, bakgrund, chattinfo, grupp, samtalsskärmen, ljust och mörkt") { k in
            try await ChattProv.kor(k)
        }
    }

    @MainActor static func delatLage(_ app: AppMiljo) -> ChattLage {
        if let l = lage { return l }
        let l = ChattLage(app: app, lager: ChattV1(app: app))
        lage = l
        return l
    }
}

extension KonvId {
    init?(text: String) {
        let d = text.split(separator: ":", maxSplits: 1).map(String.init)
        guard d.count == 2, let s = KonvSort(rawValue: d[0]), !d[1].isEmpty else { return nil }
        self.init(sort: s, id: d[1])
    }
}

/// Visar chatten ovanpå appen (helskärm, som TikToks inkorg).
@MainActor
enum ChattVisning {
    static func topp() -> UIViewController? {
        let fonster = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        var k = (fonster.first(where: \.isKeyWindow) ?? fonster.first)?.rootViewController
        while let p = k?.presentedViewController, !p.isBeingDismissed { k = p }
        return k
    }

    static func visa(_ app: AppMiljo, konv: KonvId? = nil) {
        let lage = ChattModul.delatLage(app)
        if let k = konv { lage.begard = k }
        guard let topp = topp() else { return }
        var c: UIViewController? = topp
        while let v = c { if v is ChattKontroller { return }; c = v.presentingViewController }
        let k = ChattKontroller(rootView: AnyView(ChattRot(lage: lage).environment(app).environment(app.tema)))
        k.modalPresentationStyle = .fullScreen
        k.folj(app.tema)
        k.view.backgroundColor = app.tema.ui(.bakgrund)
        topp.present(k, animated: true)
    }

    static func stang() async {
        guard let k = topp() else { return }
        var c: UIViewController? = k
        while let v = c, !(v is ChattKontroller) { c = v.presentingViewController }
        guard let chatt = c else { return }
        await withCheckedContinuation { f in chatt.dismiss(animated: false) { f.resume() } }
    }
}

/// Värdkontrollern för chatten. Följer temat (ljust, mörkt, system) medan den visas.
final class ChattKontroller: UIHostingController<AnyView> {
    func folj(_ tema: Tema) {
        overrideUserInterfaceStyle = tema.uiStil
        withObservationTracking { _ = tema.uiStil } onChange: { [weak self] in
            Task { @MainActor [weak self] in self?.folj(tema) }
        }
    }
}
