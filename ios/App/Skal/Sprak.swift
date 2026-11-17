import Foundation
import Observation

/// Skalets texter på användarens språk, på samma sätt som datorns `ui/i18n.js`: de svenska strängarna ÄR nycklarna,
/// och en ordlista per språk (`{ "svensk sträng": "översättning" }`) översätter dem. `{namn}` i en sträng byts mot
/// ett värde efter översättningen:
///
///     Text(tr("Ny flik"))
///     tr("{n} flikar", ["n": "3"])
///
/// Ordlistorna läses i den här ordningen (den senare vinner):
///  1. datorns `Webb/ui/locales/<kod>.json` (kopieras in av Brygga), så att allt som redan är översatt på datorn
///     (54 språk) fungerar direkt,
///  2. skalets egna `Skal/Bunt/sprak/<kod>.json` för texter som bara finns på telefonen.
///
/// Svenska behöver ingen ordlista. Språket väljs med startargumentet `-sprak <kod>` (standard `sv`, som datorn).
/// Vyer som anropar `tr` ritas om när språket byts, eftersom `tr` läser `kod`.
///
/// Ägare: Skal.
@MainActor
@Observable
final class Sprak {
    static let delad = Sprak()

    /// Språkkoden som gäller, till exempel `sv`, `de` eller `zh-CN`.
    private(set) var kod = "sv"

    @ObservationIgnored private var ordlista: [String: String] = [:]

    /// Språk som skrivs från höger till vänster (som datorns `RTL`).
    static let hogerTillVanster: Set<String> = ["ar", "he", "fa", "ur"]

    var arHogerTillVanster: Bool { Self.hogerTillVanster.contains(kod) }

    /// Antal översättningar som lästes (för självtestet).
    var antalOrd: Int { ordlista.count }

    func byt(till ny: String) {
        let k = ny.replacingOccurrences(of: "[^A-Za-z-]", with: "", options: .regularExpression)
        var d: [String: String] = [:]
        if !k.isEmpty, k != "sv" {
            for data in [Bunt.data("Webb", "ui/locales/\(k).json"), Bunt.data("Skal", "sprak/\(k).json")] {
                guard let data, let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                for (nyckel, varde) in o { if let s = varde as? String, !s.isEmpty { d[nyckel] = s } }
            }
        }
        ordlista = d
        kod = k.isEmpty ? "sv" : k
    }

    /// Översätter en svensk sträng och fyller i `{namn}`.
    func t(_ s: String, _ varden: [String: String] = [:]) -> String {
        _ = kod   // beroendet: vyn ritas om när språket byts
        var ut = ordlista[s] ?? s
        for (n, v) in varden { ut = ut.replacingOccurrences(of: "{\(n)}", with: v) }
        return ut
    }
}

/// Kortform för `Sprak.delad.t(_:_:)`. All synlig text i skalet går genom den.
@MainActor
func tr(_ s: String, _ varden: [String: String] = [:]) -> String { Sprak.delad.t(s, varden) }

/// "1 flik" eller "3 flikar" (två nycklar, så att varje språk kan böja själv).
@MainActor
func trAntal(_ n: Int, en: String, flera: String) -> String {
    tr(n == 1 ? en : flera, ["n": n.formatted()])
}
