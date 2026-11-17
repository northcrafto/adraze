import Foundation

/// Falks egna texter på andra språk än svenska: de som bara finns i appen (inloggningsrutan, iPhone-texterna i
/// samtyckesrutan, rutorna som frågar först …). Datorns texter översätts som vanligt av `Webb/ui/locales` och
/// `tr()`. Ordlistorna ligger i `Bunt/sprak/<kod>.json`; språk utan egen fil får engelska.
///
/// Ägare: Falk.
@MainActor
enum FalkSprak {
    private static var minne: (kod: String, ord: [String: String])?

    /// Falks ordlista för ett språk (tom för svenska, som är källtexten). Ett språk utan egen fil får engelskan,
    /// men bara för texter som appens ordlista (datorns `locales`) inte redan översätter till språket.
    static func ordlista(_ kod: String) -> [String: String] {
        if kod == "sv" || kod.isEmpty { return [:] }
        if let m = minne, m.kod == kod { return m.ord }
        let bas = kod.split(separator: "-").first.map(String.init) ?? kod
        let las = { (d: Data?) in d.flatMap { try? JSONDecoder().decode([String: String].self, from: $0) } }
        var ord = las(Bunt.data("Falk", "sprak/\(kod).json")) ?? las(Bunt.data("Falk", "sprak/\(bas).json"))
        if ord == nil, var en = las(Bunt.data("Falk", "sprak/en.json")) {
            if Sprak.delad.kod == kod { en = en.filter { tr($0.key) == $0.key } }
            ord = en
        }
        minne = (kod, ord ?? [:])
        return ord ?? [:]
    }

    /// Ordlistan för språket som gäller nu, som JSON till sidan (`falk:ios`).
    static var ordlistaJSON: JSONVarde {
        .objekt(ordlista(Sprak.delad.kod).mapValues { .text($0) })
    }

    static func fyll(_ s: String, _ varden: [String: String]) -> String {
        var ut = s
        for (n, v) in varden { ut = ut.replacingOccurrences(of: "{\(n)}", with: v) }
        return ut
    }
}

/// En synlig text i Falk: Falks ordlista först, sedan appens (`tr`), annars den svenska källtexten.
@MainActor
func ft(_ s: String, _ varden: [String: String] = [:]) -> String {
    if let x = FalkSprak.ordlista(Sprak.delad.kod)[s], !x.isEmpty { return FalkSprak.fyll(x, varden) }
    return tr(s, varden)
}
