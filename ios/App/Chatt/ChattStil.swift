import SwiftUI
import UIKit

// MARK: - Text

/// Chattens texter. Chattens egna ordlistor (`Chatt/Bunt/sprak/<kod>.json`) läses av `Sprak` i Gemensamt
/// tillsammans med datorns 54 språk (datorns chatt har redan många av strängarna), så det här är bara `tr`.
@MainActor
func ct(_ s: String, _ varden: [String: String] = [:]) -> String { tr(s, varden) }

// MARK: - Tid

@MainActor
enum ChattTid {
    static var kalender: Calendar { Calendar.current }
    static var locale: Locale { Locale(identifier: Sprak.delad.kod) }

    /// Tiden i listan: 14:02 i dag, "I går", veckodag inom en vecka, annars datum.
    static func kort(_ d: Date, nu: Date = Date()) -> String {
        if kalender.isDateInToday(d) { return klocka(d) }
        if kalender.isDateInYesterday(d) { return ct("I går") }
        if let dagar = kalender.dateComponents([.day], from: d, to: nu).day, dagar < 7 {
            return d.formatted(Date.FormatStyle(locale: locale).weekday(.abbreviated))
        }
        return d.formatted(Date.FormatStyle(locale: locale).day().month(.abbreviated))
    }

    static func klocka(_ d: Date) -> String { d.formatted(Date.FormatStyle(locale: locale).hour().minute()) }

    /// "för 55 min sedan"-delen, som en hel mening per fall så att varje språk kan böja själv.
    static func skickat(_ d: Date, nu: Date = Date()) -> String {
        let s = max(0, nu.timeIntervalSince(d))
        if s < 60 { return ct("Skickat nyss") }
        if s < 3600 { return ct("Skickat för {n} min sedan", ["n": String(Int(s / 60))]) }
        if s < 86_400 { return ct("Skickat för {n} tim sedan", ["n": String(Int(s / 3600))]) }
        if kalender.isDateInYesterday(d) { return ct("Skickat i går") }
        return ct("Skickat {datum}", ["datum": kort(d, nu: nu)])
    }

    static func sett(_ d: Date?, nu: Date = Date()) -> String {
        guard let d else { return ct("Sett") }
        if kalender.isDateInToday(d) { return ct("Sett {tid}", ["tid": klocka(d)]) }
        return ct("Sett")
    }

    /// Närvaron (datorns strängar: "Aktiv för {n} min sedan" …).
    static func aktiv(_ online: Bool?, _ sedd: Date?, nu: Date = Date()) -> String? {
        if online == true { return ct("Aktiv nu") }
        guard let sedd else { return nil }
        let s = max(0, nu.timeIntervalSince(sedd))
        if s < 3600 { return ct("Aktiv för {n} min sedan", ["n": String(max(1, Int(s / 60)))]) }
        if s < 86_400 { return ct("Aktiv för {n} tim sedan", ["n": String(Int(s / 3600))]) }
        if kalender.isDateInYesterday(sedd) { return ct("Aktiv i går") }
        let dagar = Int(s / 86_400)
        return dagar <= 7 ? ct("Aktiv för {n} dagar sedan", ["n": String(dagar)]) : nil
    }

    static func dag(_ d: Date) -> String {
        if kalender.isDateInToday(d) { return ct("I dag") }
        if kalender.isDateInYesterday(d) { return ct("I går") }
        return d.formatted(Date.FormatStyle(locale: locale).weekday(.wide).day().month(.wide))
    }
}

// MARK: - Rörelser och haptik (plan 3, 4.7)

enum ChattRorelse {
    static let fjader = Animation.spring(response: 0.4, dampingFraction: 0.82)
    static let snabb = Animation.spring(response: 0.3, dampingFraction: 0.86)
    static let ut = Animation.timingCurve(0.2, 0.75, 0.25, 1, duration: 0.45)
}

@MainActor
enum ChattHaptik {
    private static let medelGen = UIImpactFeedbackGenerator(style: .medium)
    private static let mjukGen = UIImpactFeedbackGenerator(style: .soft)
    private static let valGen = UISelectionFeedbackGenerator()
    private static let notisGen = UINotificationFeedbackGenerator()
    private(set) static var antal: [String: Int] = [:]
    static func medel() { medelGen.impactOccurred(); antal["medel", default: 0] += 1 }
    static func mjuk() { mjukGen.impactOccurred(); antal["mjuk", default: 0] += 1 }
    static func val() { valGen.selectionChanged(); antal["val", default: 0] += 1 }
    static func fel() { notisGen.notificationOccurred(.error); antal["fel", default: 0] += 1 }
    static func klart() { notisGen.notificationOccurred(.success); antal["klart", default: 0] += 1 }
}

// MARK: - Färger

extension Tema {
    /// Mina bubblor: accenten en aning djupare (datorns `--me-bg`: accent 90 % mot svart).
    var bubblaMin: Color {
        let a = ui(.accent)
        return Color(uiColor: UIColor { t in
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, al: CGFloat = 0
            a.resolvedColor(with: t).getRed(&r, green: &g, blue: &b, alpha: &al)
            let f: CGFloat = t.userInterfaceStyle == .dark ? 0.86 : 0.92
            return UIColor(red: r * f, green: g * f, blue: b * f, alpha: 1)
        })
    }
    /// Andras bubblor (datorns `--them`).
    var bubblaDeras: Color { Color(uiColor: UIColor { t in UIColor(hex: t.userInterfaceStyle == .dark ? "#272523" : "#f1efe9", alfa: 1) }) }
}

/// Varma toner för initialavatarer (AdRazes papper och bläck, inga neonfärger). Samma namn ger samma ton.
enum ChattAvatarton {
    static let ljusa = ["#f3d9cc", "#efe1c2", "#d9e4d3", "#d6dfe8", "#e6d7e4", "#e9dccd", "#d3e3df", "#f0d6d6"]
    static let morka = ["#5a3527", "#56482a", "#33452f", "#2f3d4b", "#4a3346", "#4c3e30", "#2c4641", "#523034"]
    static let black = ["#8a3a1c", "#7a5a12", "#3f6237", "#355374", "#6d3e66", "#6c5232", "#2f655b", "#8a3e46"]
    static let blackMork = ["#ffb79a", "#f0cf7e", "#b5d6a6", "#a9c6e4", "#e2b3db", "#e6c9a6", "#a1d6c9", "#f4b0b4"]

    static func index(_ namn: String) -> Int {
        var h: UInt32 = 2166136261
        for b in namn.lowercased().utf8 { h = (h ^ UInt32(b)) &* 16777619 }
        return Int(h % UInt32(ljusa.count))
    }
}

// MARK: - Avatarer

struct ChattAvatar: View {
    let namn: String
    let bild: String?
    let storlek: CGFloat
    @Environment(\.colorScheme) private var schema

    var body: some View {
        Group {
            if let b = ChattAvatar.uibild(bild) {
                Image(uiImage: b).resizable().scaledToFill()
            } else {
                let i = ChattAvatarton.index(namn)
                ZStack {
                    Color(uiColor: UIColor(hex: schema == .dark ? ChattAvatarton.morka[i] : ChattAvatarton.ljusa[i], alfa: 1))
                    Text(String(namn.prefix(1)).uppercased())
                        .font(Typsnitt.rubrik(storlek * 0.42, vikt: 560))
                        .foregroundStyle(Color(uiColor: UIColor(hex: schema == .dark ? ChattAvatarton.blackMork[i] : ChattAvatarton.black[i], alfa: 1)))
                        .offset(y: storlek * 0.01)
                }
            }
        }
        .frame(width: storlek, height: storlek)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private static var cache: [String: UIImage] = [:]
    static func uibild(_ dataUrl: String?) -> UIImage? {
        guard let s = dataUrl, s.hasPrefix("data:image/"), let komma = s.firstIndex(of: ",") else { return nil }
        let nyckel = String(s.suffix(64)) + String(s.count)
        if let c = cache[nyckel] { return c }
        guard let d = Data(base64Encoded: String(s[s.index(after: komma)...])), let b = UIImage(data: d) else { return nil }
        cache[nyckel] = b
        return b
    }
}

/// Avatar med orange prick för "aktiv nu" (inte grön, plan 3 4.1).
struct ChattAvatarMedNarvaro: View {
    let namn: String
    let bild: String?
    let storlek: CGFloat
    let online: Bool
    @Environment(Tema.self) private var tema
    var body: some View {
        ChattAvatar(namn: namn, bild: bild, storlek: storlek)
            .overlay(alignment: .bottomTrailing) {
                if online {
                    Circle().fill(tema.accent)
                        .frame(width: storlek * 0.24, height: storlek * 0.24)
                        .overlay(Circle().strokeBorder(tema.bakgrund, lineWidth: max(2.5, storlek * 0.05)))
                        .offset(x: -storlek * 0.01, y: -storlek * 0.01)
                        .transition(.scale.combined(with: .opacity))
                }
            }
    }
}

/// Gruppens bild: egen bild om gruppen har en, annars två eller tre medlemmar i en klunga.
struct ChattGruppavatar: View {
    let namn: String
    let bild: String?
    let medlemmar: [String]
    let storlek: CGFloat
    @Environment(Tema.self) private var tema

    var body: some View {
        if bild != nil || medlemmar.count < 2 {
            ChattAvatar(namn: namn, bild: bild, storlek: storlek)
        } else {
            let liten = storlek * 0.66
            ZStack(alignment: .topLeading) {
                Color.clear.frame(width: storlek, height: storlek)
                ChattAvatar(namn: medlemmar[0], bild: nil, storlek: liten)
                ChattAvatar(namn: medlemmar[1], bild: nil, storlek: liten)
                    .overlay(Circle().strokeBorder(tema.bakgrund, lineWidth: 2.5))
                    .offset(x: storlek - liten, y: storlek - liten)
            }
            .frame(width: storlek, height: storlek)
        }
    }
}

// MARK: - Vätskeknappen

/// AdRazes vätskefyllning (datorns `.anp-liq`, signaturkitet): välvd vätska som stiger på 0,95 s.
struct ChattVatskeform: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width * 1.3, h = r.height * 1.7
        let x0 = r.minX - r.width * 0.15, botten = r.maxY + 2, topp = botten - h
        let rx = 0.46 * w, ry = 0.46 * h, k: CGFloat = 0.552_284_75
        var p = Path()
        p.move(to: CGPoint(x: x0, y: botten))
        p.addLine(to: CGPoint(x: x0, y: topp + ry))
        p.addCurve(to: CGPoint(x: x0 + rx, y: topp), control1: CGPoint(x: x0, y: topp + ry - k * ry),
                   control2: CGPoint(x: x0 + rx - k * rx, y: topp))
        p.addLine(to: CGPoint(x: x0 + w - rx, y: topp))
        p.addCurve(to: CGPoint(x: x0 + w, y: topp + ry), control1: CGPoint(x: x0 + w - rx + k * rx, y: topp),
                   control2: CGPoint(x: x0 + w, y: topp + ry - k * ry))
        p.addLine(to: CGPoint(x: x0 + w, y: botten))
        p.closeSubpath()
        return p
    }
}

struct ChattVatskelager<F: ShapeStyle>: View {
    let niva: CGFloat
    let fyllning: F
    var valvd = true
    var body: some View {
        GeometryReader { g in
            Group {
                if valvd {
                    ChattVatskeform().fill(fyllning).offset(y: (1 - niva) * (g.size.height * 1.7 + 2))
                } else {
                    Rectangle().fill(fyllning).opacity(niva)
                }
            }
            .frame(width: g.size.width, height: g.size.height)
        }
        .allowsHitTesting(false)
    }
}

/// Knappar med vätska. `.primar`: orange, mörk vätska. `.rund`: rund ikonknapp (56 pt i chattinfo), orange vätska.
/// `.ikon`: liten rund knapp i rubriken. `.lank`: text i accent. `.fara`: röd text, röd vätska. `.sekundar`: yta med kant.
/// `.skicka`: rund orange knapp (skicka i skrivfältet), mörk vätska.
struct ChattKnapp: ButtonStyle {
    enum Sort { case primar, rund, ikon, lank, fara, sekundar, skicka }
    let sort: Sort
    init(_ sort: Sort) { self.sort = sort }
    func makeBody(configuration: Configuration) -> some View {
        ChattKnappkropp(etikett: configuration.label, tryckt: configuration.isPressed, sort: sort)
    }
}

private struct ChattKnappkropp<E: View>: View {
    let etikett: E
    let tryckt: Bool
    let sort: ChattKnapp.Sort
    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.isEnabled) private var pa
    @State private var niva: CGFloat = 0
    @State private var start: Date?
    @State private var omgang = 0
    /// Orange knappar fylls när de blir användbara och töms när de inte är det.
    @State private var fylld: CGFloat = -1

    private var hel: Bool { sort != .ikon }
    private var orange: Bool { sort == .primar || sort == .skicka }

    var body: some View {
        let form = RoundedRectangle(cornerRadius: (sort == .rund || sort == .ikon || sort == .skicka) ? 999 : tema.radier.storKnapp, style: .continuous)
        etikett
            .foregroundStyle(vilande)
            .overlay {
                etikett.foregroundStyle(nedsankt)
                    .mask(ChattVatskelager(niva: niva, fyllning: Color.black, valvd: !minska))
                    .allowsHitTesting(false)
            }
            .background {
                ZStack {
                    switch sort {
                    case .primar, .skicka:
                        form.fill(tema[.yta2])
                        form.fill(tema.accent).mask(ChattVatskelager(niva: fylld < 0 ? (pa ? 1 : 0) : fylld, fyllning: Color.black, valvd: !minska))
                    case .rund, .ikon: form.fill(tema[.yta2])
                    case .sekundar: form.fill(tema.yta)
                    case .lank, .fara: form.fill(Color.clear)
                    }
                    ChattVatskelager(niva: niva, fyllning: vatska, valvd: !minska).clipShape(form)
                }
            }
            .overlay {
                if sort == .sekundar { form.strokeBorder(tema.linje, lineWidth: 1) }
                if sort == .fara { form.strokeBorder(tema[.fara].opacity(0.45), lineWidth: 1) }
            }
            .contentShape(form)
            .opacity(pa || orange ? 1 : 0.4)
            .animation(.easeOut(duration: 0.3), value: pa)
            .onChange(of: pa) { _, nu in
                guard orange else { return }
                if fylld < 0 { fylld = nu ? 0 : 1 }
                withAnimation(minska ? .easeInOut(duration: 0.2) : .timingCurve(0.2, 0.75, 0.25, 1, duration: nu ? 0.8 : 0.4)) { fylld = nu ? 1 : 0 }
            }
            .scaleEffect(tryckt && !minska && (sort == .rund || sort == .ikon || sort == .skicka) ? 0.94 : 1)
            .animation(ChattRorelse.snabb, value: tryckt)
            .onChange(of: tryckt) { _, nu in nu ? stig() : rinn() }
    }

    private var vilande: Color {
        switch sort {
        case .primar, .skicka: return pa ? tema[.paAccent] : tema[.svag]
        case .rund, .ikon, .sekundar: return tema.text
        case .lank: return tema[.accentText]
        case .fara: return tema[.fara]
        }
    }
    private var nedsankt: Color {
        switch sort {
        case .primar, .skicka: return tema.bakgrund
        case .fara: return .white
        default: return tema[.paAccent]
        }
    }
    private var vatska: AnyShapeStyle {
        switch sort {
        case .primar, .skicka: return AnyShapeStyle(LinearGradient(colors: [tema[.fyllnadFran], tema[.fyllnadTill]], startPoint: .top, endPoint: .bottom))
        case .fara: return AnyShapeStyle(tema[.fara])
        default: return AnyShapeStyle(tema.accent)
        }
    }
    private func stig() {
        omgang += 1
        start = Date()
        withAnimation(minska ? .easeInOut(duration: 0.2) : .timingCurve(0.2, 0.75, 0.25, 1, duration: 0.95)) { niva = 1 }
    }
    private func rinn() {
        let min: Double = hel ? 0.95 : 0.26
        let gatt = start.map { Date().timeIntervalSince($0) } ?? min
        let kvar = max(0, min - gatt) + (hel ? 0.1 : 0)
        let denna = omgang
        DispatchQueue.main.asyncAfter(deadline: .now() + kvar) {
            guard denna == omgang, !tryckt else { return }
            withAnimation(minska ? .easeInOut(duration: 0.2) : .timingCurve(0.4, 0, 0.6, 1, duration: hel ? 0.6 : 0.45)) { niva = 0 }
        }
    }
}

/// En av sajtens figurer (`site/illu`, samma som på adraze.app) ur `Chatt.xcassets`, med en mörk variant
/// där de ljusgrå ytorna blir varma mörka toner.
struct ChattSajtfigur: View {
    let namn: String
    var body: some View { Image(namn).resizable().scaledToFit().accessibilityHidden(true) }
}

/// Ark i chatten. Ljust och mörkt sätts numera på hela fönstret (`Fonstertema` i Gemensamt), så ark följer AdRazes val
/// av sig själva och det här gör ingenting. Finns kvar så att anropen inte behöver ändras.
extension View {
    func chattArk() -> some View { self }
}
