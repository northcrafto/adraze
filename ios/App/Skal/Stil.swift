import SwiftUI
import UIKit

// MARK: - Rörelser

/// Datorns kurvor (`ui/shell.css`, signaturkitet) som SwiftUI-animationer. Allt i skalet animerar bara
/// förflyttning, skala och opacitet; med Reduce Motion blir allt en kort toning (`Rorelse.val`).
///
/// Ägare: Skal.
@MainActor
enum Rorelse {
    /// `--ease`: cubic-bezier(.2,.75,.25,1).
    static let mjuk = Animation.timingCurve(0.2, 0.75, 0.25, 1, duration: 0.42)
    /// `--ease-ut`: cubic-bezier(.16,1,.3,1), för saker som glider in.
    static let ut = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.6)
    /// `ccpop`: små rutor och notiser som poppar fram (0,16 s, 8 px).
    static let pop = Animation.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.16)
    /// Vätskefyllningen: 0,95 s, `--ease`.
    static let vatska = Animation.timingCurve(0.2, 0.75, 0.25, 1, duration: 0.95)
    /// Menyns cirkel: cubic-bezier(.76,0,.24,1), 0,6 s.
    static let cirkel = Animation.timingCurve(0.76, 0, 0.24, 1, duration: 0.6)
    /// Hamburgerns streck: cubic-bezier(.6,.05,.2,1), 0,45 s.
    static let streck = Animation.timingCurve(0.6, 0.05, 0.2, 1, duration: 0.45)
    /// Raden som krymper och växer, flikväxlarens zoom.
    static let fjader = Animation.spring(response: 0.42, dampingFraction: 0.88)
    static let snabbFjader = Animation.spring(response: 0.3, dampingFraction: 0.86)

    /// Animationen, eller en kort toning med Reduce Motion.
    static func val(_ a: Animation, _ reduce: Bool? = nil) -> Animation {
        (reduce ?? UIAccessibility.isReduceMotionEnabled) ? .easeInOut(duration: 0.2) : a
    }

    static var minskad: Bool { UIAccessibility.isReduceMotionEnabled }
}

/// `withAnimation` som följer Reduce Motion.
@MainActor
func medRorelse(_ a: Animation, _ f: () -> Void) {
    withAnimation(Rorelse.val(a), f)
}

/// Kör `f` på huvudtråden efter `sekunder`.
@MainActor
func efter(_ sekunder: Double, _ f: @escaping @MainActor () -> Void) {
    Task { @MainActor in
        if sekunder > 0 { try? await Task.sleep(nanoseconds: UInt64(sekunder * 1_000_000_000)) }
        f()
    }
}

/// Ändringar utan animation (även om något runtomkring animerar).
@MainActor
func utanRorelse(_ f: () -> Void) {
    var t = Transaction()
    t.disablesAnimations = true
    withTransaction(t, f)
}

// MARK: - Haptik

/// Haptik på rätt ställen och bara där: flikbyte och stängning (lätt), tröskeln när man drar för att ladda om
/// (val), långt tryck (medel), fel som sidan ger (fel), bokmärke sparat (klart). Räknas för självtestet.
///
/// Ägare: Skal.
@MainActor
enum Haptik {
    private(set) static var antal: [String: Int] = [:]
    private static let lattGen = UIImpactFeedbackGenerator(style: .light)
    private static let medelGen = UIImpactFeedbackGenerator(style: .medium)
    private static let valGen = UISelectionFeedbackGenerator()
    private static let notisGen = UINotificationFeedbackGenerator()

    static func latt() { lattGen.impactOccurred(); rakna("latt") }
    static func medel() { medelGen.impactOccurred(); rakna("medel") }
    static func val() { valGen.selectionChanged(); rakna("val") }
    static func fel() { notisGen.notificationOccurred(.error); rakna("fel") }
    static func klart() { notisGen.notificationOccurred(.success); rakna("klart") }
    static func forbered() { lattGen.prepare(); valGen.prepare() }

    static var totalt: Int { antal.values.reduce(0, +) }

    private static func rakna(_ s: String) { antal[s, default: 0] += 1 }
}

// MARK: - Färger

/// Skalets färger. Vanliga flikar följer temat (`Tema`, accenten och ljust/mörkt). Privata flikar har datorns
/// inkognitofärger (`ui/shell.css`, `.incog`): mörkt lila i mörkt läge och en ljus lavendelvariant i ljust läge,
/// så att statusraden alltid går att läsa.
///
/// Ägare: Skal.
struct Skalfarger {
    let rad: Color
    let falt: Color
    let faltlinje: Color
    let text: Color
    let dampad: Color
    let svag: Color
    let ikon: Color
    let accent: Color
    let accentText: Color
    let accentMjuk: Color
    let paAccent: Color
    let linje: Color
    let sida: Color
    let fyllnadFran: Color
    let fyllnadTill: Color
    let privat: Bool

    @MainActor
    init(_ tema: Tema, privat: Bool) {
        self.privat = privat
        if privat {
            rad = .dynamisk("#efe9f8", "#150c28")
            falt = .dynamisk("#ffffff", "#1a1030")
            faltlinje = .dynamisk("#d9ccef", "#3b2a5c")
            text = .dynamisk("#24123f", "#efe9fb")
            dampad = .dynamisk("#6e5a91", "#a08cc4")
            svag = .dynamisk("#9a88bb", "#7a6a9c")
            ikon = .dynamisk("#3b2466", "#cbbde6")
            accent = .dynamisk("#7c3aed", "#a855f7")
            accentText = .dynamisk("#6d28d9", "#c084fc")
            accentMjuk = .dynamisk("#7c3aed", "#a855f7", alfaLjus: 0.11, alfaMork: 0.2)
            paAccent = .white
            linje = .dynamisk("#e0d6f1", "#2a1b47")
            sida = .dynamisk("#f6f2fc", "#120a22")
            fyllnadFran = .dynamisk("#2a1148", "#efe9fb")
            fyllnadTill = .dynamisk("#170b2c", "#d9ccef")
        } else {
            rad = tema[.verktygsrad]
            falt = tema[.falt]
            faltlinje = tema[.faltlinje]
            text = tema[.text]
            dampad = tema[.dampad]
            svag = tema[.svag]
            ikon = tema[.text]
            accent = tema[.accent]
            accentText = tema[.accentText]
            accentMjuk = tema[.accentMjuk]
            paAccent = tema[.paAccent]
            linje = tema[.linje]
            sida = tema[.bakgrund]
            fyllnadFran = tema[.fyllnadFran]
            fyllnadTill = tema[.fyllnadTill]
        }
    }
}

extension Color {
    /// En färg som är `ljus` i ljust läge och `mork` i mörkt.
    static func dynamisk(_ ljus: String, _ mork: String, alfaLjus: CGFloat = 1, alfaMork: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { t in
            t.userInterfaceStyle == .dark ? UIColor(hex: mork, alfa: alfaMork) : UIColor(hex: ljus, alfa: alfaLjus)
        })
    }

    static func hex(_ s: String, _ alfa: CGFloat = 1) -> Color { Color(uiColor: UIColor(hex: s, alfa: alfa)) }

    /// Menyns tusch (nästan svart, datorns navy-900) och papper.
    static let tusch = Color.hex("#141311")
    static let papper = Color.hex("#f2f1ec")
}

/// Ett monogram för en sajt: första bokstaven i domänen på en ton som räknas ur domänen (samma domän får
/// alltid samma ton). Används där en favicon skulle sitta, tills Flikar ger oss riktiga ikoner.
struct Monogram: View {
    let doman: String
    var storlek: CGFloat = 22
    @Environment(\.colorScheme) private var schema

    private static let toner: [String] = ["#ff4b1f", "#d6336c", "#7354d6", "#3b6fe0", "#0b8a8f", "#2f9e67", "#e8a317", "#5f6b7a"]

    var body: some View {
        let ren = doman.hasPrefix("www.") ? String(doman.dropFirst(4)) : doman
        let bokstav = ren.first.map { String($0).uppercased() } ?? "·"
        let i = Int(ren.unicodeScalars.reduce(UInt32(7)) { ($0 &* 31) &+ $1.value } % UInt32(Self.toner.count))
        let ton = Color.hex(Self.toner[i])
        RoundedRectangle(cornerRadius: storlek * 0.3, style: .continuous)
            .fill(ton.opacity(schema == .dark ? 0.24 : 0.13))
            .overlay(
                Text(bokstav)
                    .font(Font(Typsnitt.familjen(storlek * 0.56, vikt: 700)))
                    .foregroundStyle(ton)
            )
            .frame(width: storlek, height: storlek)
            .accessibilityHidden(true)
    }
}

/// Sajtens ikon (favikonen från Flikar) i en rundad ruta, eller monogrammet medan den saknas.
struct Sajtikon: View {
    let bild: UIImage?
    let doman: String
    var storlek: CGFloat = 22
    @Environment(\.colorScheme) private var schema

    var body: some View {
        if let bild {
            let inre = storlek >= 28 ? storlek * 0.62 : storlek
            Image(uiImage: bild)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: inre, height: inre)
                .clipShape(RoundedRectangle(cornerRadius: inre * 0.22, style: .continuous))
                .frame(width: storlek, height: storlek)
                .background {
                    if storlek >= 28 {
                        RoundedRectangle(cornerRadius: storlek * 0.3, style: .continuous)
                            .fill(schema == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.045))
                    }
                }
                .accessibilityHidden(true)
        } else {
            Monogram(doman: doman, storlek: storlek)
        }
    }
}

/// Domänen utan `www.` för en adress.
func domanFor(_ url: URL?) -> String {
    guard let v = url?.host(percentEncoded: false), !v.isEmpty else { return "" }
    return v.hasPrefix("www.") ? String(v.dropFirst(4)) : v
}

/// Adressen som adressfältet visar: sidans, eller den som inte gick att öppna (då har sidan ingen egen
/// adress än, men fältet ska visa vart man försökte gå).
@MainActor
func visadAdress(_ flik: (any Flik)?) -> URL? {
    guard let flik else { return nil }
    if let u = flik.url { return u }
    if let fel = flik.fel, !fel.avbruten { return fel.url }
    return nil
}

/// Sant för adresser som räknas som en tom flik (ingen sida, `about:blank`).
func arTomAdress(_ url: URL?) -> Bool {
    guard let url else { return true }
    return url.absoluteString == "about:blank" || url.absoluteString.isEmpty
}
