import SwiftUI
import UIKit

/// Skalets typsnitt: Fraunces i rubriker och Familjen Grotesk i text (AdRazes egna, se `Typsnitt`), skalade med
/// Dynamic Type efter vyns egen `dynamicTypeSize` (alltså även temats Liten/Stor och självtestets textstorlek).
///
/// Har användaren valt ett annat typsnitt i Anpassa (`tema.typsnitt`: klassisk, tydlig, serif, mono) gäller det för
/// texten. Rubrikerna är alltid Fraunces, som datorns "AdRaze Display".
///
///     Text("Flikar").rubrik(34)
///     Text(domän).grotesk(16, vikt: 560)
///
/// Ägare: Skal.
@MainActor
enum Skrift {
    /// Storleken skalad som en textstil vid en viss Dynamic Type-storlek.
    static func skalad(_ storlek: CGFloat, stil: UIFont.TextStyle, typ: DynamicTypeSize, tak: CGFloat? = nil) -> CGFloat {
        let drag = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(typ))
        let s = UIFontMetrics(forTextStyle: stil).scaledValue(for: storlek, compatibleWith: drag)
        if let tak { return min(s, tak) }
        return s
    }

    /// Faktorn för mått som ska växa med texten (1 vid standardstorlek).
    static func faktor(_ typ: DynamicTypeSize, stil: UIFont.TextStyle = .body, tak: CGFloat = 1.6) -> CGFloat {
        min(tak, skalad(100, stil: stil, typ: typ) / 100)
    }

    static func viktFont(_ v: CGFloat) -> Font.Weight {
        switch v {
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        default: return .heavy
        }
    }

    /// Texttypsnittet som UIFont (till UIKit-fält).
    static func textUI(_ storlek: CGFloat, vikt: CGFloat = 400, val: Typsnittsval) -> UIFont {
        switch val {
        case .system:
            return Typsnitt.familjen(storlek, vikt: vikt)
        case .mono:
            return .monospacedSystemFont(ofSize: storlek, weight: uiVikt(vikt))
        case .klassisk, .tydlig, .serif:
            if let namn = Tema.installerat(val), let f = UIFont(name: namn, size: storlek) {
                let d = f.fontDescriptor.addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: uiVikt(vikt)]])
                return UIFont(descriptor: d, size: storlek)
            }
            return .systemFont(ofSize: storlek, weight: uiVikt(vikt))
        }
    }

    static func uiVikt(_ v: CGFloat) -> UIFont.Weight {
        switch v {
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        default: return .heavy
        }
    }

    static func text(_ storlek: CGFloat, vikt: CGFloat, val: Typsnittsval) -> Font {
        switch val {
        case .system: return Font(Typsnitt.familjen(storlek, vikt: vikt))
        case .mono: return .system(size: storlek, weight: viktFont(vikt), design: .monospaced)
        case .klassisk, .tydlig, .serif: return Font(textUI(storlek, vikt: vikt, val: val))
        }
    }
}

/// Familjen Grotesk (eller användarens textval) med Dynamic Type.
struct GroteskModifierare: ViewModifier {
    @Environment(\.dynamicTypeSize) private var typ
    @Environment(Tema.self) private var tema
    let storlek: CGFloat
    let vikt: CGFloat
    let stil: UIFont.TextStyle
    let tak: CGFloat?

    func body(content: Content) -> some View {
        content.font(Skrift.text(Skrift.skalad(storlek, stil: stil, typ: typ, tak: tak), vikt: vikt, val: tema.typsnittsval))
    }
}

/// Fraunces med Dynamic Type.
struct RubrikModifierare: ViewModifier {
    @Environment(\.dynamicTypeSize) private var typ
    let storlek: CGFloat
    let vikt: CGFloat
    let tak: CGFloat?

    func body(content: Content) -> some View {
        let s = Skrift.skalad(storlek, stil: .title1, typ: typ, tak: tak)
        content.font(Font(Typsnitt.fraunces(s, vikt: vikt, opsz: s)))
    }
}

extension View {
    /// Brödtext och etiketter: Familjen Grotesk, `vikt` 400–700.
    func grotesk(_ storlek: CGFloat, vikt: CGFloat = 400, stil: UIFont.TextStyle = .body, tak: CGFloat? = nil) -> some View {
        modifier(GroteskModifierare(storlek: storlek, vikt: vikt, stil: stil, tak: tak))
    }

    /// Rubriker: Fraunces, `vikt` 100–900.
    func rubrik(_ storlek: CGFloat, vikt: CGFloat = 600, tak: CGFloat? = nil) -> some View {
        modifier(RubrikModifierare(storlek: storlek, vikt: vikt, tak: tak))
    }
}
