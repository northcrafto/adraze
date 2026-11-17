import Foundation

/// Labb-modulen: registrerar grundens egna självtester.
///  - `-mode rok`: röktestet (se `RokProv`).
///  - `-mode helhet`: hela appen ihop med alla moduler (se `HelhetProv`).
///  - `-mode lista`: listar alla självtester som finns i bygget.
///
/// Ägare: Grund.
final class LabbModul: NSObject, AppModul {
    static let namn = "Labb"
    static let ordning = 1000

    static func registrera(i app: AppMiljo) {
        app.labb.registrera("rok", beskrivning: "Grunden: moduler, typsnitt, inställningar, tema, palett, brygga, Keychain och en laddad sida") { k in
            try await RokProv.kor(k)
        }
        app.labb.registrera("helhet", beskrivning: "Hela appen ihop: startsidan, en sida med annonser, tre flikar, flikväxlaren, menyn, Anpassa, temat Natt, stoppsidan och felsidan") { k in
            try await HelhetProv.kor(k)
        }
        app.labb.registrera("lista", beskrivning: "Listar alla självtester i bygget") { k in
            var alla: [String: JSONVarde] = [:]
            for (namn, p) in k.app.labb.prov {
                alla[namn] = .objekt(["modul": .text(p.modul), "beskrivning": .text(p.beskrivning)])
            }
            k.notera("tester", .objekt(alla))
            k.kolla("tester finns", !alla.isEmpty, .tal(Double(alla.count)))
        }
    }
}
