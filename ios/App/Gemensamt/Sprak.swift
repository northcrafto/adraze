import Foundation
import Observation

extension Nycklar {
    /// Språket i appen och AdRaze-UI:t: en kod ur datorns språkfiler (`en`, `zh-TW` …) eller tomt = telefonens språk.
    /// På datorn ligger valet i fönstrets localStorage (`adraze-lang`); här i butiken, så att native delar och
    /// webbsidorna följer samma val.
    static let sprakVal = Nyckel<String>("sprak.val", standard: "", etikett: "Språk", importbar: false, historik: false)
}

/// Appens texter på användarens språk, på samma sätt som datorns `ui/i18n.js`: de svenska strängarna ÄR nycklarna,
/// och en ordlista per språk (`{ "svensk sträng": "översättning" }`) översätter dem. `{namn}` i en sträng byts mot
/// ett värde efter översättningen:
///
///     Text(tr("Ny flik"))
///     tr("{n} flikar", ["n": "3"])
///
/// Ordlistorna läses i den här ordningen (den senare vinner):
///  1. datorns `Webb/ui/locales/<kod>.json` (kopieras in av `verktyg/kopiera-ui.sh`), så att allt som redan är
///     översatt på datorn (54 språk) fungerar direkt,
///  2. skalets egna `Skal/Bunt/sprak/<kod>.json` för texter som bara finns på telefonen.
///
/// Språket följer `sprak.val` (Anpassa › Språk), tomt = telefonens språk mappat till datorns koder (`aktivt`).
/// Startargumentet `-sprak <kod>` väljer ett språk vid start (självtesterna). Svenska behöver ingen ordlista.
/// Vyer som anropar `tr` ritas om när språket byts, eftersom `tr` läser `kod`.
///
/// Ägare: Grund (Gemensamt).
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

    @ObservationIgnored private var prenumeration: Prenumeration?
    @ObservationIgnored private static var kodminne: [String]?

    /// Språken som finns: svenska (originalet) och ett per språkfil i `Webb/ui/locales/`.
    static var koder: [String] {
        if let k = kodminne { return k }
        // Bara språkkoder (en, pt-PT, zh-CN); datorns arbetsfiler som _sv-base.json är inga språk
        let filer = Bunt.filer("Webb", "ui/locales", filandelse: "json").map { $0.deletingPathExtension().lastPathComponent }
            .filter { $0.range(of: #"^[a-z]{2,3}(-[A-Z]{2})?$"#, options: .regularExpression) != nil }
        let k = ["sv"] + filer.filter { $0 != "sv" }.sorted()
        kodminne = k
        return k
    }

    /// Språket som gäller enligt `sprak.val` (tomt = telefonens språk; engelska om inget av dem finns).
    static func aktivt(_ installningar: Installningar) -> String {
        let val = installningar[Nycklar.sprakVal]
        if !val.isEmpty, koder.contains(val) { return val }
        return franSystemet(Locale.preferredLanguages, koder: koder)
    }

    /// Telefonens språk i prioritetsordning (`["sv-SE", "en-US"]`) -> datorns kod (zh-Hans -> zh-CN,
    /// zh-Hant -> zh-TW, pt-PT, nb …).
    nonisolated static func franSystemet(_ sprak: [String], koder: [String]) -> String {
        for s in sprak {
            let delar = s.replacingOccurrences(of: "_", with: "-").split(separator: "-").map(String.init)
            guard let forsta = delar.first?.lowercased(), !forsta.isEmpty else { continue }
            let resten = delar.dropFirst()
            let skrift = resten.first { $0.count == 4 }?.capitalized
            let region = resten.first { $0.count == 2 }?.uppercased()
            switch forsta {
            case "zh":
                let trad = skrift == "Hant" || (skrift == nil && ["TW", "HK", "MO"].contains(region ?? ""))
                if koder.contains(trad ? "zh-TW" : "zh-CN") { return trad ? "zh-TW" : "zh-CN" }
                continue
            case "pt":
                let k = region == "PT" ? "pt-PT" : "pt"
                if koder.contains(k) { return k }
                continue
            case "nb", "nn", "no":
                if koder.contains("nb") { return "nb" }
                if koder.contains("no") { return "no" }
                continue
            default:
                if let region, koder.contains("\(forsta)-\(region)") { return "\(forsta)-\(region)" }
                if koder.contains(forsta) { return forsta }
            }
        }
        return koder.contains("en") ? "en" : "sv"
    }

    /// Väljer språket ur `sprak.val` (eller `-sprak`) och byter när inställningen ändras. Anropas av AppMiljo.
    func folj(_ app: AppMiljo) {
        guard prenumeration == nil else { return }
        byt(till: app.startargument.text("sprak") ?? Self.aktivt(app.installningar))
        prenumeration = app.handelser.lyssna(InstallningAndrad.self) { [weak self, weak app] h in
            guard h.nyckel == Nycklar.sprakVal.namn, let app else { return }
            self?.byt(till: Self.aktivt(app.installningar))
        }
    }

    func byt(till ny: String) {
        guard ny != kod || ordlista.isEmpty else { return }
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

/// Kortform för `Sprak.delad.t(_:_:)`. All synlig native text går genom den.
@MainActor
func tr(_ s: String, _ varden: [String: String] = [:]) -> String { Sprak.delad.t(s, varden) }

/// "1 flik" eller "3 flikar" (två nycklar, så att varje språk kan böja själv).
@MainActor
func trAntal(_ n: Int, en: String, flera: String) -> String {
    tr(n == 1 ? en : flera, ["n": n.formatted()])
}
