import Foundation
import Observation
import WebKit

/// Skyddet: regellistor (WKContentRuleList), kosmetik, scriptlets, spårningsparametrar och paus per sajt.
/// Kontraktet mellan Skydd (som gör skyddet) och Flikar (som använder det i varje webbvy).
///
/// Så använder Flikar det, i den här ordningen:
///  1. `forbered(_:privat:)` direkt när en flikens webbvy har skapats, före första laddningen. Skyddet lägger in
///     listor och skript i webbvyns `userContentController` och får ha kvar en svag referens, så att det kan
///     lägga in listorna i efterhand när de är klara (första starten kompilerar i bakgrunden, se `lage`).
///  2. `beslut(for:)` i `decidePolicyFor navigationAction` för varje navigering.
///  3. `blockeringssida(for:flik:)` när huvudsidan stoppades (WebKit-fel 104, se `Sidfel.blockeradAvSkyddet`).
///
/// Klasser som uppfyller protokollet ska vara `@Observable` (skalet visar `lage`, till exempel "Skyddet laddas").
///
/// Ägare: Grund (Gemensamt). Riktig implementation: Skydd (`App/Skydd/`). Ersättning tills dess: `IngetSkydd`.
@MainActor
protocol SkyddTjanst: AnyObject, Observable {
    var lage: Skyddslage { get }

    /// Lägger in skyddet i en ny webbvy, före första laddningen. Bara för flikar med vanliga webbsidor.
    func forbered(_ webbvy: WKWebView, privat: Bool)

    /// Beslut för en navigering (huvudram eller ram), till exempel att ta bort spårningsparametrar.
    func beslut(for handling: WKNavigationAction) -> Navigeringsbeslut

    /// HTML för blockeringssidan när skyddet stoppade hela sidan, eller `nil` för Flikars vanliga felsida.
    /// Skyddet skickar också `HuvudsidaBlockerad` på `app.handelser`.
    func blockeringssida(for url: URL, flik: UUID) -> String?

    /// Pausat skydd för en värd (`www.` räknas bort). Ändringen gäller från nästa laddning.
    func arPausat(for vard: String) -> Bool
    func pausa(_ pausat: Bool, for vard: String)

    /// Antal stoppade anrop i en flik sedan sidan laddades, om skyddet kan räkna (del 1, 7.6). `nil` = vet inte.
    func antalBlockerade(i flik: UUID) -> Int?
}

/// Var skyddet står.
enum Skyddslage: Sendable, Hashable {
    /// Avstängt (av användaren eller för att listorna saknas).
    case av
    /// Listorna kompileras. `andel` 0–1 om den är känd.
    case laddar(andel: Double?)
    /// Klart, med antal regler.
    case klart(regler: Int)
    /// Något gick fel; texten visas för användaren.
    case fel(String)

    var etikett: String {
        switch self {
        case .av: return "Skyddet är av"
        case .laddar: return "Skyddet laddas"
        case .klart(let n): return "\(n.formatted()) regler"
        case .fel(let t): return t
        }
    }
}

/// Vad Flikar ska göra med en navigering.
struct Navigeringsbeslut: Sendable, Hashable {
    /// `false` = stoppa navigeringen.
    var tillat: Bool = true
    /// Ladda den här adressen i stället (till exempel utan spårningsparametrar, eller med https).
    var nyAdress: URL? = nil
    /// `false` = sidan får inte köra JavaScript (`WKWebpagePreferences.allowsContentJavaScript`).
    var javascript: Bool = true

    static let tillat = Navigeringsbeslut()
    static let stoppa = Navigeringsbeslut(tillat: false)
}
