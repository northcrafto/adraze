import CoreText
import SwiftUI
import UIKit

/// AdRazes egna typsnitt, samma som på datorn:
///  - **Fraunces** (rubriker; "AdRaze Display" på datorn), variabelt typsnitt med axlarna `opsz` 9–144 och
///    `wght` 100–900. SOFT och WONK är låsta som datorns webbversion.
///  - **Familjen Grotesk** (introt), variabelt med `wght` 400–700.
///
/// Filerna ligger i `App/Tillgangar/Bunt/Typsnitt/` med sina OFL-licenser (måste följa med appen) och registreras
/// för appen när den startar (`registrera()`, anropas av AppMiljo). Fraunces standardläge i filen är "9pt Black",
/// så ange alltid vikt: använd funktionerna här i stället för `UIFont(name:)` eller `Font.custom`.
///
///     Text("Välkommen").font(Typsnitt.rubrik(28))
///     label.font = Typsnitt.fraunces(22, vikt: 600)
///
/// Ägare: Grund (Gemensamt).
enum Typsnitt {
    /// Axlarnas id i CoreText (de fyra bokstäverna som ett tal).
    static let wght: UInt32 = 0x7767_6874
    static let opsz: UInt32 = 0x6F70_737A

    static let frauncesFamilj = "Fraunces"
    static let familjenFamilj = "Familjen Grotesk"

    /// Familjenamn → PostScript-namn för det som registrerades.
    @MainActor private(set) static var registrerade: [String: String] = [:]
    /// Fel vid registreringen (filnamn → text). Tomt = allt gick bra.
    @MainActor private(set) static var fel: [String: String] = [:]

    /// Registrerar alla .ttf och .otf i bunten (Tillgangar/Typsnitt) för den här appen. Går att anropa flera gånger.
    @MainActor static func registrera() {
        guard registrerade.isEmpty else { return }
        let logg = Logg("Typsnitt")
        let filer = Bunt.filer("Tillgangar", "Typsnitt").filter { ["ttf", "otf"].contains($0.pathExtension.lowercased()) }
        if filer.isEmpty { logg.fel("inga typsnitt i bunten (Tillgangar/Typsnitt)") }
        for url in filer {
            var cfFel: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &cfFel) {
                let e = cfFel?.takeRetainedValue()
                // Kod 105 = redan registrerad (till exempel efter en omstart av scenen): inget fel.
                if let e, CFErrorGetCode(e) != 105 {
                    fel[url.lastPathComponent] = CFErrorCopyDescription(e) as String
                    logg.fel("\(url.lastPathComponent): \(fel[url.lastPathComponent] ?? "")")
                    continue
                }
            }
            let beskrivningar = (CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor]) ?? []
            for d in beskrivningar {
                let familj = CTFontDescriptorCopyAttribute(d, kCTFontFamilyNameAttribute) as? String
                let ps = CTFontDescriptorCopyAttribute(d, kCTFontNameAttribute) as? String
                if let familj, let ps, registrerade[familj] == nil { registrerade[familj] = ps }
            }
        }
        logg.info("typsnitt: " + registrerade.map { "\($0.key) (\($0.value))" }.sorted().joined(separator: ", "))
    }

    /// Ett variabelt typsnitt med valda axlar. Saknas typsnittet blir det systemtypsnittet i samma storlek.
    @MainActor static func variabel(_ familj: String, _ storlek: CGFloat, axlar: [UInt32: CGFloat]) -> UIFont {
        guard let ps = registrerade[familj] else { return .systemFont(ofSize: storlek) }
        let varianter = Dictionary(uniqueKeysWithValues: axlar.map { (NSNumber(value: $0.key), NSNumber(value: Double($0.value))) })
        let d = UIFontDescriptor(fontAttributes: [
            .name: ps,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): varianter,
        ])
        return UIFont(descriptor: d, size: storlek)
    }

    /// Fraunces. `vikt` 100–900. `opsz` (optisk storlek, 9–144) följer storleken om den inte anges, som
    /// `font-optical-sizing: auto` i webbläsaren.
    @MainActor static func fraunces(_ storlek: CGFloat, vikt: CGFloat = 600, opsz optisk: CGFloat? = nil) -> UIFont {
        variabel(frauncesFamilj, storlek, axlar: [wght: min(900, max(100, vikt)), opsz: min(144, max(9, optisk ?? storlek))])
    }

    /// Familjen Grotesk. `vikt` 400–700.
    @MainActor static func familjen(_ storlek: CGFloat, vikt: CGFloat = 400) -> UIFont {
        variabel(familjenFamilj, storlek, axlar: [wght: min(700, max(400, vikt))])
    }

    /// Fraunces för SwiftUI, skalad med Dynamic Type (som `stil`) när vyn ritas.
    @MainActor static func rubrik(_ storlek: CGFloat, vikt: CGFloat = 600, relativTill stil: UIFont.TextStyle = .title1) -> Font {
        let skalad = UIFontMetrics(forTextStyle: stil).scaledValue(for: storlek)
        return Font(fraunces(skalad, vikt: vikt, opsz: skalad))
    }

    /// Familjen Grotesk för SwiftUI, skalad med Dynamic Type (som `stil`) när vyn ritas.
    @MainActor static func grotesk(_ storlek: CGFloat, vikt: CGFloat = 400, relativTill stil: UIFont.TextStyle = .body) -> Font {
        Font(familjen(UIFontMetrics(forTextStyle: stil).scaledValue(for: storlek), vikt: vikt))
    }
}
