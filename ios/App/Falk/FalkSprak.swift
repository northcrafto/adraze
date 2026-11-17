import Foundation

/// Falks egna texter på andra språk än svenska: de som bara finns i appen (inloggningsrutan, iPhone-texterna i
/// samtyckesrutan, rutorna som frågar först …). Ordlistorna ligger i `Bunt/sprak/<kod>.json` och läses av `Sprak`
/// i Gemensamt (som `tr()` använder) tillsammans med datorns `Webb/ui/locales`. Språk utan egen fil får engelska för
/// det som datorns ordlista inte översätter.
///
/// Ägare: Falk.
@MainActor
enum FalkSprak {
    /// Falks ordlista för ett språk (tom för svenska, som är källtexten), se `Sprak.modulordlista`.
    static func ordlista(_ kod: String) -> [String: String] { Sprak.modulordlista("Falk", kod) }

    /// Ordlistan för språket som gäller nu, som JSON till sidan (`falk:ios`): falk-ios.js översätter sina egna
    /// texter med den och resten med datorns ordlista.
    static var ordlistaJSON: JSONVarde {
        .objekt(ordlista(Sprak.delad.kod).mapValues { .text($0) })
    }

    static func fyll(_ s: String, _ varden: [String: String]) -> String {
        var ut = s
        for (n, v) in varden { ut = ut.replacingOccurrences(of: "{\(n)}", with: v) }
        return ut
    }
}

/// En synlig text i Falk (bara `tr`; Falks ordlistor ingår i appens, se `Sprak`).
@MainActor
func ft(_ s: String, _ varden: [String: String] = [:]) -> String { tr(s, varden) }
