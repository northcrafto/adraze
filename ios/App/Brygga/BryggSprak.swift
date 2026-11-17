import Foundation

/// Språket i AdRaze-UI:t. Datorns språkfiler (`Webb/ui/locales/<kod>.json`, svenska strängar som nycklar) används
/// oförändrade. Valet sparas i `sprak.val`; tomt = samma språk som telefonen (`Locale.preferredLanguages`),
/// mappat till datorns språkkoder (zh-Hans -> zh-CN, zh-Hant -> zh-TW, pt-PT, nb …). Finns inget av telefonens
/// språk blir det engelska.
///
/// Ägare: Brygga och webb-UI.
@MainActor
enum BryggSprak {
    private static var kodminne: [String]?
    private static var ordminne: (kod: String, ordlista: [String: JSONVarde])?

    /// Språken som finns: svenska (originalet) och ett per språkfil.
    static var koder: [String] {
        if let k = kodminne { return k }
        // Bara språkkoder (en, pt-PT, zh-CN); datorns arbetsfiler som _sv-base.json är inga språk
        let filer = Bunt.filer("Webb", "ui/locales", filandelse: "json").map { $0.deletingPathExtension().lastPathComponent }
            .filter { $0.range(of: #"^[a-z]{2,3}(-[A-Z]{2})?$"#, options: .regularExpression) != nil }
        let k = ["sv"] + filer.filter { $0 != "sv" }.sorted()
        kodminne = k
        return k
    }

    /// Språket som gäller nu.
    static func aktivt(_ installningar: Installningar) -> String {
        let val = installningar[Nycklar.sprakVal]
        if !val.isEmpty, koder.contains(val) { return val }
        return franSystemet(Locale.preferredLanguages, koder: koder)
    }

    /// Telefonens språk i prioritetsordning (`["sv-SE", "en-US"]`) -> datorns kod.
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

    /// Ordlistan för ett språk (tom för svenska). Den senaste hålls i minnet.
    static func ordlista(_ kod: String) -> [String: JSONVarde] {
        guard kod != "sv" else { return [:] }
        if let o = ordminne, o.kod == kod { return o.ordlista }
        guard koder.contains(kod), let data = Bunt.data("Webb", "ui/locales/\(kod).json"),
              let o = (try? JSONVarde(json: data))?.objekt else { return [:] }
        ordminne = (kod, o)
        return o
    }

    /// En svensk sträng på det aktiva språket (för native knappar i bryggans dialoger).
    static func ord(_ sv: String) -> String {
        guard let app = AppMiljo.delad else { return sv }
        return ordlista(aktivt(app.installningar))[sv]?.text ?? sv
    }
}
