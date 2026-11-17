import Foundation
import SwiftUI
import UIKit

/// AdRazes egna sidor i webbvy (datorns Anpassa, startsida, Falk och chatt, `adraze-app://localhost/<yta>.html`):
/// kontraktet mellan Brygga (som visar dem) och de som vill visa dem (Skal, Konto, Falk, Chatt).
/// Samma sak som kanalerna `sida:visa` och `sida:stang` som sidorna själva använder:
///
///     app.sidor.visa("anpassa", fragment: "tema", som: .ark)       // Anpassa öppen på Tema
///     app.sidor.visa("startsida", fragment: "redigera", som: .helskarm)
///     app.sidor.vy("startsida", nedre: 116) { url in … }           // startsidan i en SwiftUI-vy (ny flik)
///
/// Ägare: Grund (Gemensamt). Riktig implementation: Brygga (`Bryggsidor`). Ersättning från start: `IngaSidor`.
@MainActor
protocol SidTjanst: AnyObject {
    /// Det finns en sida för ytan (`anpassa`, `startsida`, `falk`, `chatt`).
    func finns(_ yta: String) -> Bool
    /// Visar ytan modalt som ark eller helskärm, eller tar fram den om den redan visas. `fragment` = kategorin i
    /// Anpassa (`tema`, `sekretess` …) eller `redigera` på startsidan. Ger `false` om den inte gick att visa.
    @discardableResult
    func visa(_ yta: String, fragment: String?, som lage: Sidlage) -> Bool
    /// Stänger en visad yta (`nil` = den översta).
    func stang(_ yta: String?)
    /// Ytan som SwiftUI-vy. `nedre` = punkter nertill som värdvyn täcker (skalets fält), `navigera` = sidan vill
    /// öppna en vanlig webbadress (`nil`: den aktiva tomma fliken, annars en ny flik). Vyn räknar med att värden
    /// har ett eget adressfält: startsidans sökruta döljs (`html.ios-i-skalet`), modalt (`visa`) syns den.
    func vy(_ yta: String, fragment: String?, nedre: CGFloat, navigera: (@MainActor (URL) -> Void)?) -> AnyView
    /// Börja ladda ytan redan nu (webbvyn, webbprocessen och sidan), så att nästa `vy(yta, fragment: nil, …)` får
    /// den färdig. Skal gör det med startsidan när appen startar. Används den aldrig ligger den kvar i minnet.
    func forbered(_ yta: String)
}

extension SidTjanst {
    @discardableResult
    func visa(_ yta: String, som lage: Sidlage = .ark) -> Bool { visa(yta, fragment: nil, som: lage) }
}

/// Hur en AdRaze-sida visas.
enum Sidlage: String, Sendable {
    /// Ark som täcker nästan hela skärmen (Anpassa, inställningar).
    case ark
    /// Hela skärmen (startsidan, introt).
    case helskarm
}

/// En plats i skalets meny (Anpassa, Falk, Chatt): antingen en SwiftUI-vy som skalet visar i ett ark, eller en
/// handling som modulen sköter själv (Brygga visar Anpassa som sitt eget ark). Läggs in med
/// `app.ersatt(plats:titel:vy:)` eller `app.ersatt(plats:titel:oppna:)` i en moduls `registrera(i:)`.
struct Plats {
    let id: String
    let titel: String
    let vy: (@MainActor () -> AnyView)?
    let oppna: (@MainActor () -> Void)?
}

/// Platserna som skalets meny känner till.
enum Platser {
    static let anpassa = "anpassa"
    static let falk = "falk"
    static let chatt = "chatt"
}

/// Ersättning tills Brygga finns (`-utan Brygga`): inga sidor.
///
/// Ägare: Grund.
@MainActor
final class IngaSidor: SidTjanst {
    func finns(_ yta: String) -> Bool { false }
    func visa(_ yta: String, fragment: String?, som lage: Sidlage) -> Bool { false }
    func stang(_ yta: String?) {}
    func vy(_ yta: String, fragment: String?, nedre: CGFloat, navigera: (@MainActor (URL) -> Void)?) -> AnyView { AnyView(EmptyView()) }
    func forbered(_ yta: String) {}
}
