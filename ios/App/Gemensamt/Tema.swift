import Observation
import SwiftUI
import UIKit

/// Utseendet för allt native i appen, räknat ur inställningarna (`tema.*`) precis som datorns
/// `ui/anpassa-tema.js` gör det för webbsidorna. Ändras en inställning ritas allt som läser temat om.
///
/// Finns i SwiftUI-miljön (läggs dit av `AdRazeApp`):
///
///     @Environment(Tema.self) private var tema
///     Text("Hej").font(tema.typsnitt(.body)).foregroundStyle(tema.text)
///     RoundedRectangle(cornerRadius: tema.radier.falt).fill(tema[.falt])
///
/// Färgerna är dynamiska (ljus eller mörk variant väljs när de ritas), så de fungerar även i UIKit:
/// `vy.backgroundColor = tema.ui(.bakgrund)`. Ljust, mörkt eller "följ systemet" sätts av `AdRazeApp` med
/// `.preferredColorScheme(tema.foredragetSchema)`, och textstorleken (Liten/Normal/Stor) flyttar Dynamic Type
/// ett steg (`tema.dynamiskTextstorlek(_:)`).
///
/// Färgvärdena är datorns inställningstoken `--s-*` (del 1, 4.1). Med AdRazes egen orange används datorns
/// grundvärden; med en annan accent räknar palettmotorn (`Palett`) fram varianterna, som på datorn.
///
/// Ägare: Grund (Gemensamt). Skal får använda egna mått för skalets delar utifrån `densitet` och `horn`.
@MainActor
@Observable
final class Tema {
    @ObservationIgnored private let installningar: Installningar
    @ObservationIgnored private var palettminne: (hex: String, palett: Accentpalett)?

    init(installningar: Installningar) {
        self.installningar = installningar
    }

    // MARK: - Valen

    static let standardaccent = "#ff4b1f"

    /// Accentfärgen som `#rrggbb` (ogiltigt värde ger AdRazes orange).
    var accenthex: String { Palett.normFarg(installningar[.temaAccent]) ?? Self.standardaccent }
    var lage: Temalage { installningar[.temaLage] }
    var densitet: Densitet { installningar[.temaDensitet] }
    var horn: Horn { installningar[.temaHorn] }
    var typsnittsval: Typsnittsval { installningar[.temaTypsnitt] }
    var storlek: Textstorlek { installningar[.temaStorlek] }
    var ytpalett: Ytpalett { installningar[.temaPalett] }
    var arStandardaccent: Bool { accenthex == Self.standardaccent }

    /// Till `.preferredColorScheme(_:)`. `nil` = följ systemet.
    var foredragetSchema: ColorScheme? {
        switch lage {
        case .ljust: return .light
        case .morkt: return .dark
        case .system: return nil
        }
    }

    /// Till `window.overrideUserInterfaceStyle` (UIKit).
    var uiStil: UIUserInterfaceStyle {
        switch lage {
        case .ljust: return .light
        case .morkt: return .dark
        case .system: return .unspecified
        }
    }

    /// Palettmotorns utdata för accenten (datorns `palett(hex)`).
    var palett: Accentpalett {
        let hex = accenthex
        if let p = palettminne, p.hex == hex { return p.palett }
        let p = Palett.palett(hex)
        palettminne = (hex, p)
        return p
    }

    // MARK: - Färger

    /// En dynamisk färg för en roll.
    subscript(_ roll: Fargroll) -> Color { Color(uiColor: ui(roll)) }

    /// Samma färg för UIKit.
    func ui(_ roll: Fargroll) -> UIColor {
        let l = varde(roll, morkt: false), d = varde(roll, morkt: true)
        return UIColor { t in
            let v = t.userInterfaceStyle == .dark ? d : l
            return UIColor(hex: v.hex, alfa: v.alfa)
        }
    }

    /// Färgen för en roll i ljust eller mörkt läge.
    func varde(_ roll: Fargroll, morkt: Bool) -> Fargvarde {
        let jul = morkt && ytpalett == .jul
        if let fast = (jul ? Self.jul[roll] : nil) ?? (morkt ? Self.morka[roll] : Self.ljusa[roll]) {
            return Fargvarde(fast)
        }
        let std = arStandardaccent
        let p = std ? nil : palett
        switch roll {
        case .accent:
            return Fargvarde(p.map { morkt ? $0.d : $0.l } ?? Self.standardaccent)
        case .accentText:
            return Fargvarde(p.map { morkt ? $0.inkD : $0.inkL } ?? (morkt ? "#ff7a52" : "#c2360e"))
        case .accentMjuk:
            return Fargvarde(p.map { morkt ? $0.d : $0.l } ?? Self.standardaccent, alfa: morkt ? 0.14 : 0.09)
        case .paAccent:
            return Fargvarde(p.map { morkt ? $0.onD : $0.onL } ?? Palett.vit)
        default:
            return Fargvarde("#ff00ff")
        }
    }

    var bakgrund: Color { self[.bakgrund] }
    var yta: Color { self[.yta] }
    var text: Color { self[.text] }
    var dampad: Color { self[.dampad] }
    var linje: Color { self[.linje] }
    var accent: Color { self[.accent] }

    // Datorns --s-* (input.css 403–417), verktygsraden ur skalets "chrome". Accentrollerna räknas ovan.
    private static let ljusa: [Fargroll: String] = [
        .bakgrund: "#f6f5f1", .yta: "#ffffff", .yta2: "#f1f0eb", .text: "#1c1b19", .dampad: "#6b6962",
        .svag: "#9a978f", .linje: "#e5e3dc", .falt: "#ffffff", .faltlinje: "#d9d7cf", .verktygsrad: "#f6f5f0",
        .sakert: "#2f9e67", .varning: "#cf9128", .fara: "#d64b45", .fyllnadFran: "#2f2e2b", .fyllnadTill: "#1b1a18",
    ]
    private static let morka: [Fargroll: String] = [
        .bakgrund: "#191816", .yta: "#1f1e1c", .yta2: "#262523", .text: "#eeede8", .dampad: "#a2a097",
        .svag: "#77756d", .linje: "#2c2b28", .falt: "#232220", .faltlinje: "#3a3935", .verktygsrad: "#1f1e1c",
        .sakert: "#5fd08a", .varning: "#cf9128", .fara: "#d64b45", .fyllnadFran: "#eeede8", .fyllnadTill: "#d8d6cf",
    ]
    // tema.palett = jul i mörkt läge (ui/jul.css 19–33 och 126–127)
    private static let jul: [Fargroll: String] = [
        .bakgrund: "#0e251a", .yta: "#132e21", .yta2: "#173626", .text: "#f4ecd8", .dampad: "#a9b8a6",
        .svag: "#7f937f", .linje: "#1b3e2d", .falt: "#173626", .faltlinje: "#2b5a41", .verktygsrad: "#10291d",
    ]

    // MARK: - Mått och hörn

    /// Mått som följer `tema.densitet`. Normal är grundmåtten.
    var matt: Matt {
        switch densitet {
        case .kompakt: return Matt(adressfalt: 40, verktygsrad: 40, tryckyta: 44, radluft: 10)
        case .normal: return Matt(adressfalt: 46, verktygsrad: 44, tryckyta: 44, radluft: 14)
        case .luftig: return Matt(adressfalt: 52, verktygsrad: 50, tryckyta: 48, radluft: 18)
        }
    }

    /// Hörnradier som följer `tema.horn` (datorns `--anp-r-*`, input.css 949–950). 999 = kapsel.
    var radier: Radier {
        switch horn {
        case .kantig: return Radier(flik: 3, falt: 4, knapp: 4, inre: 2, rad: 2, kort: 6, ruta: 6)
        case .normal: return Radier(flik: 10, falt: 12, knapp: 8, inre: 6, rad: 7, kort: 12, ruta: 18)
        case .rund: return Radier(flik: 14, falt: 999, knapp: 999, inre: 999, rad: 10, kort: 18, ruta: 22)
        }
    }

    // MARK: - Text

    /// Flyttar Dynamic Type ett steg efter `tema.storlek` (Liten = ett steg mindre, Stor = ett steg större).
    func dynamiskTextstorlek(_ system: DynamicTypeSize) -> DynamicTypeSize {
        let alla = DynamicTypeSize.allCases
        guard let i = alla.firstIndex(of: system) else { return system }
        switch storlek {
        case .liten: return alla[max(alla.startIndex, i - 1)]
        case .normal: return system
        case .stor: return alla[min(alla.index(before: alla.endIndex), i + 1)]
        }
    }

    /// Brödtext och etiketter i det typsnitt användaren valt (`tema.typsnitt`). Följer Dynamic Type.
    func typsnitt(_ stil: Font.TextStyle = .body, vikt: Font.Weight = .regular) -> Font {
        switch typsnittsval {
        case .system: return .system(stil, design: .default, weight: vikt)
        case .mono: return .system(stil, design: .monospaced, weight: vikt)
        case .klassisk, .tydlig, .serif:
            if let namn = Self.installerat(typsnittsval) {
                return .custom(namn, size: Self.grundstorlek(stil), relativeTo: stil).weight(vikt)
            }
            return .system(stil, design: typsnittsval == .serif ? .serif : .default, weight: vikt)
        }
    }

    /// Rubrik i Fraunces (datorns "AdRaze Display").
    func rubrik(_ storlek: CGFloat = 28, vikt: CGFloat = 600) -> Font { Typsnitt.rubrik(storlek, vikt: vikt) }

    /// Första installerade familjen för ett typsnittsval (stackarna i datorns input.css 885–895).
    static func installerat(_ val: Typsnittsval) -> String? {
        let stack: [String]
        switch val {
        case .klassisk: stack = ["Helvetica Neue", "Helvetica", "Arial"]
        case .tydlig: stack = ["Verdana", "Tahoma"]
        case .serif: stack = ["Charter", "Iowan Old Style", "Georgia"]
        case .system, .mono: return nil
        }
        return stack.first { !UIFont.fontNames(forFamilyName: $0).isEmpty }
    }

    /// Apples standardstorlekar per textstil (Large, iOS).
    static func grundstorlek(_ stil: Font.TextStyle) -> CGFloat {
        switch stil {
        case .largeTitle: return 34
        case .title: return 28
        case .title2: return 22
        case .title3: return 20
        case .headline, .body: return 17
        case .callout: return 16
        case .subheadline: return 15
        case .footnote: return 13
        case .caption: return 12
        case .caption2: return 11
        default: return 17
        }
    }

    /// Det webbsidorna behöver för att se likadana ut (till bryggans startdata): valen, palett och läge.
    var somJSON: JSONVarde {
        ["accent": .text(accenthex), "lage": .text(lage.rawValue), "densitet": .text(densitet.rawValue),
         "horn": .text(horn.rawValue), "typsnitt": .text(typsnittsval.rawValue), "storlek": .text(storlek.rawValue),
         "palett": .text(ytpalett.rawValue), "accentpalett": arStandardaccent ? .null : palett.json]
    }
}

/// Färgroller. Samma namn i ljust och mörkt läge; temat väljer värdet.
enum Fargroll: String, CaseIterable, Sendable {
    /// Sidans botten (`--s-bg`).
    case bakgrund
    /// Kort, rutor och ark (`--s-surface`).
    case yta
    /// Ytor inuti ytor, till exempel valda rader (`--s-surface-2`).
    case yta2
    /// Vanlig text (`--s-ink`).
    case text
    /// Dämpad text (`--s-mut`).
    case dampad
    /// Svag text och platshållare (`--s-faint`).
    case svag
    /// Hårfina linjer (`--s-line`).
    case linje
    /// Inmatningsfält (`--s-field`).
    case falt
    /// Ramen runt fält (`--s-field-line`).
    case faltlinje
    /// Verktygsraden och adressfältets botten.
    case verktygsrad
    /// Accenten för ytor och ikoner.
    case accent
    /// Accentfärgad text (minst 4,5:1).
    case accentText
    /// Accenten svagt, för markeringar och fokusringar.
    case accentMjuk
    /// Text ovanpå accenten.
    case paAccent
    /// Grönt för säkert/klart.
    case sakert
    /// Varning.
    case varning
    /// Fara och riskknappar.
    case fara
    /// Vätskefyllningens början (signaturknappen, del 1 4.7).
    case fyllnadFran
    /// Vätskefyllningens slut.
    case fyllnadTill
}

/// En färg som hex och opacitet.
struct Fargvarde: Sendable, Hashable {
    let hex: String
    let alfa: CGFloat
    init(_ hex: String, alfa: CGFloat = 1) {
        self.hex = hex
        self.alfa = alfa
    }
}

/// Mått i punkter.
struct Matt: Sendable, Hashable {
    /// Adressfältets höjd.
    let adressfalt: CGFloat
    /// Verktygsradens höjd.
    let verktygsrad: CGFloat
    /// Minsta tryckyta för en knapp (Apple: 44 × 44).
    let tryckyta: CGFloat
    /// Luft över och under en rad i listor och inställningar.
    let radluft: CGFloat
}

/// Hörnradier i punkter (datorns ordning: flik, fält, knapp, inre, rad, kort och ruta).
/// `storKnapp` är för appens stora knappar (54 pt, Logga in, Lägg till vän) i alla moduler.
struct Radier: Sendable, Hashable {
    let flik: CGFloat
    let falt: CGFloat
    let knapp: CGFloat
    let inre: CGFloat
    let rad: CGFloat
    let kort: CGFloat
    let ruta: CGFloat

    /// Stora knappar (54 pt): knappens hörn plus 8, så att de är lika i konto, chatt och Falk. 999 = kapsel.
    var storKnapp: CGFloat { knapp == 999 ? 999 : knapp + 8 }
}
