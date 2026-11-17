import Foundation
import UIKit

/// Falks handlingar utanför sidan (`krypto:action`, datorns `ipcMain.on('krypto:action')` i `browser/main.js`):
/// privat flik, sökmotor, Falks inställningar, rapportera ett svar och de sidor som finns i appen.
///
/// Det som sänker skyddet eller byter sökmotor görs aldrig direkt på modellens ord: en ruta visar vad som ändras och
/// "Avbryt" är förvalt (svaret kan bygga på en sida, ett mejl eller en sökträff som Falk läst). Annonsblockeraren,
/// realtidsskyddet, minska rörelse, familjeskyddet och Wallet finns inte för Falk på iPhone än: sidan visar det.
///
/// Ägare: Falk.
@MainActor
enum FalkHandlingar {
    private static let logg = Logg("Falk")

    static func gor(_ app: AppMiljo, _ a: JSONVarde) async {
        guard let namnText = a["name"].text, !namnText.isEmpty else { return }
        let namn = Falk.fold(namnText)
        let v = (a["value"].text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        switch namn {
        case "inkognito", "incognito":
            _ = app.flikar.nyFlik(nil, privat: true, aktivera: true)

        case "nedladdningar", "downloads":
            if app.brygga.kanaler["dl:list"] != nil { app.sidor.visa("anpassa", fragment: "nedladdningar", som: .ark) }

        case "losenord", "autofyll", "autofill":
            if app.brygga.kanaler["pw:list"] != nil { app.sidor.visa("anpassa", fragment: "losenord", som: .ark) }

        case "falk_installningar":
            app.sidor.visa("anpassa", fragment: "krypto", som: .ark)

        case "rapportera_svar":
            // Store-policy 11.16: olämpliga AI-svar rapporteras till oss via supportsidan, förifyllt
            var k = URLComponents(string: "https://support.adraze.app/")!
            k.queryItems = [URLQueryItem(name: "kategori", value: "webblasare"),
                            URLQueryItem(name: "amne", value: String((a["amne"].text ?? "Rapport: Falk-svar").prefix(140))),
                            URLQueryItem(name: "text", value: String((a["text"].text ?? "").prefix(4000)))]
            guard let url = k.url else { return }
            _ = app.flikar.nyFlik(url, privat: false, aktivera: true)
            try? await Task.sleep(nanoseconds: 500_000_000)
            Falk.delad?.stang()

        case "sokmotor", "sok":
            guard let id = motor(v) else {
                Falk.delad?.toast(ft("Hittade ingen sådan sökmotor."))
                return
            }
            let m = Sokmotorer.motor(id)
            let ja = await fraga(ft("Falk vill byta sökmotor till \"{x}\".", ["x": String(m.namn.prefix(40))]), detalj: ft(FalkAnpassa.varning))
            guard ja else { return }
            if app.installningar.satt("sok.motor", .text(id), etikett: "Falk: Sökmotor").arOk {
                Falk.delad?.toast(ft("Sökmotor: {x}", ["x": m.namn]))
            } else {
                Falk.delad?.toast(ft("Går inte att ändra i barnläge."))
            }

        default:
            // adblock, realtidsskydd, minska_rorelse, blockera, tillat, wallet: inte på iPhone än (sidan visar det)
            logg.info("handlingen \(namn) finns inte på iPhone")
        }
    }

    /// Samma tolkning som skalets `matchEngine` på datorn.
    static func motor(_ v: String) -> String? {
        let s = v.lowercased()
        if s.contains("adraze") { return "adraze" }
        if s.contains("duck") || s.contains("ddg") { return "duckduckgo" }
        if s.contains("brave") { return "brave" }
        if s.range(of: "startpage|start ?page", options: .regularExpression) != nil { return "startpage" }
        if s.contains("google") { return "google" }
        return Sokmotorer.inbyggda.contains { $0.id == s } ? s : nil
    }

    // MARK: - Frågerutan

    /// "Avbryt" (förvalt) eller "Tillåt". Ger `false` om rutan inte gick att visa.
    static func fraga(_ text: String, detalj: String) async -> Bool {
        guard let topp = FalkSida.toppkontroller() else { return false }
        return await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            let ruta = UIAlertController(title: "Falk", message: text + "\n\n" + detalj, preferredStyle: .alert)
            let avbryt = UIAlertAction(title: ft("Avbryt"), style: .cancel) { _ in c.resume(returning: false) }
            ruta.addAction(avbryt)
            ruta.addAction(UIAlertAction(title: ft("Tillåt"), style: .default) { _ in c.resume(returning: true) })
            ruta.preferredAction = avbryt
            topp.present(ruta, animated: true)
        }
    }
}
