import Foundation
import Observation
import UIKit

/// Historiken, bokmärkena, nedladdningarna och adressfältets lokala förslag: kontraktet mellan Flikar (som
/// sparar dem, i datorns format) och Skal (som visar dem). Webbsidorna når samma data med Flikars kanaler
/// (`historik:*`, `bokmarken:*`, `dl:*`, `forslag:*`).
///
/// Klasser som uppfyller protokollet ska vara `@Observable`, så att listorna ritas om när något ändras.
///
/// Ägare: Grund (Gemensamt). Riktig implementation: Flikar (`Flikbibliotek`). Ersättning från start:
/// `TomtBibliotek` (bara i minnet).
@MainActor
protocol Bibliotekstjanst: AnyObject, Observable {
    /// Historiken, senaste besöket först. Aldrig privata flikar.
    var historik: [Sidpost] { get }
    /// Bokmärkena, senaste först.
    var bokmarken: [Sidpost] { get }
    /// Nedladdningarna, senaste först.
    var nedladdningar: [Nedladdningspost] { get }
    /// Falskt för ett barnkonto (som på datorn får barnet inte radera sin historik).
    var kanRensaHistorik: Bool { get }

    func arBokmarkt(_ url: URL?) -> Bool
    /// Lägger till eller tar bort bokmärket. Ger `true` om sidan är bokmärkt efteråt.
    @discardableResult
    func vaxlaBokmarke(_ url: URL, titel: String) -> Bool
    func taBortBokmarke(_ url: String)
    func taBortHistorik(_ url: String)
    func rensaHistorik()

    /// Värden att fylla i medan man skriver ("ver" ger "verkstad.se"), eller `nil`. Aldrig i privata flikar.
    func komplettering(_ text: String, privat: Bool) -> String?
    /// Tidigare sökningar, sidor ur historiken och bokmärken som passar det man skrivit (tomt i privata flikar).
    func lokalaForslag(_ text: String, privat: Bool) -> [Adressforslagspost]
    /// De mest besökta sajterna, en per värd.
    func toppsajter(max: Int) -> [Sidpost]
    /// Favikonen för en adress ur cachen (utan nätet), eller `nil`.
    func favikon(_ adress: String?) -> UIImage?

    /// Öppnar en klar nedladdning (förhandsvisning).
    func oppnaNedladdning(_ id: String)
    func delaNedladdning(_ id: String)
    func pausaNedladdning(_ id: String)
    func fortsattNedladdning(_ id: String)
    func avbrytNedladdning(_ id: String)
    /// Tar bort posten och filen.
    func taBortNedladdning(_ id: String)
}

/// En sida i historiken eller ett bokmärke.
struct Sidpost: Identifiable, Hashable, Sendable {
    var id: String { url }
    let url: String
    let titel: String
    /// Adressen till favikonen (`Bibliotekstjanst.favikon` ger bilden).
    let favikon: String?
    /// Senaste besöket, eller när bokmärket sparades.
    let senast: Date
    /// Antal besök (0 för bokmärken).
    let antal: Int
}

/// En nedladdning.
struct Nedladdningspost: Identifiable, Hashable, Sendable {
    enum Lage: String, Sendable { case pagar, pausad, klar, avbruten, misslyckad }
    let id: String
    let filnamn: String
    let url: String
    /// Filen på telefonen (när den finns).
    let fil: URL?
    /// Bytes, 0 = okänt.
    let totalt: Int64
    let mottaget: Int64
    let lage: Lage
    let privat: Bool
    let startad: Date
    let fel: String?

    /// 0–1, eller `nil` när storleken är okänd.
    var andel: Double? { totalt > 0 ? min(1, Double(mottaget) / Double(totalt)) : nil }
}

/// Ett lokalt förslag under adressfältet.
struct Adressforslagspost: Identifiable, Hashable, Sendable {
    enum Slag: String, Sendable {
        /// Något man sökt på förut (`mal` är sökfrågan).
        case tidigare
        /// En sida ur historiken.
        case sida
        case bokmarke
    }
    var id: String { slag.rawValue + ":" + mal }
    let slag: Slag
    let titel: String
    /// Adressen (sida, bokmärke) eller sökfrågan (tidigare).
    let mal: String
    let favikon: String?
}
