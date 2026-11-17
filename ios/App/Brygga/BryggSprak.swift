import Foundation

/// Språket i AdRaze-UI:t (valet och koderna ligger i `Sprak`, Gemensamt/Sprak.swift). Datorns språkfiler (`Webb/ui/locales/<kod>.json`, svenska strängar som nycklar) används
/// oförändrade. Valet sparas i `sprak.val`; tomt = samma språk som telefonen (`Locale.preferredLanguages`),
/// mappat till datorns språkkoder (zh-Hans -> zh-CN, zh-Hant -> zh-TW, pt-PT, nb …). Finns inget av telefonens
/// språk blir det engelska.
///
/// Ägare: Brygga och webb-UI.
@MainActor
enum BryggSprak {
    private static var ordminne: (kod: String, ordlista: [String: JSONVarde])?

    /// Språken som finns (`Sprak.koder` i Gemensamt).
    static var koder: [String] { Sprak.koder }

    /// Språket som gäller nu (`Sprak.aktivt` i Gemensamt).
    static func aktivt(_ installningar: Installningar) -> String { Sprak.aktivt(installningar) }

    nonisolated static func franSystemet(_ sprak: [String], koder: [String]) -> String {
        Sprak.franSystemet(sprak, koder: koder)
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
