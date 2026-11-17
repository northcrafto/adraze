import SwiftUI

/// AdRazes signaturknapp: en vätska med välvd yta som stiger upp underifrån och fyller hela knappen
/// (signaturkitet `cetto-signatur.md`, datorns `.anp-liq`). Formen är exakt receptet: 130 % bred, 170 % hög,
/// `border-radius: 46% 46% 0 0`, botten 2 pt under knappen, och den flyttas med `translateY(100% → 0)` på 0,95 s
/// (`cubic-bezier(.2,.75,.25,1)`). Bara förflyttning animeras.
///
/// På en pekskärm finns ingen hovring, så vätskan stiger när fingret trycker. Släpps knappen fort fyller
/// CTA-knapparna ändå hela vägen innan vätskan rinner ut (`.hel`); ikonknapparna i raderna gör ett kortare
/// skvalp (`.kort`). Med Reduce Motion: ingen välvning, bara en toning på 0,2 s.
///
///     Button("Försök igen") { … }.buttonStyle(Vatskeknapp(.primar))
///     Button { … } label: { Ikonvy(.bakat) }.buttonStyle(Vatskeknapp(.ikon))
///
/// Ägare: Skal.
struct Vatskeform: Shape {
    func path(in r: CGRect) -> Path {
        // Formen när den har stigit hela vägen (translateY 0). Förflyttningen görs med .offset.
        let w = r.width * 1.3, h = r.height * 1.7
        let x0 = r.minX - r.width * 0.15
        let botten = r.maxY + 2
        let topp = botten - h
        let rx = 0.46 * w, ry = 0.46 * h
        let k: CGFloat = 0.552_284_75
        var p = Path()
        p.move(to: CGPoint(x: x0, y: botten))
        p.addLine(to: CGPoint(x: x0, y: topp + ry))
        p.addCurve(to: CGPoint(x: x0 + rx, y: topp),
                   control1: CGPoint(x: x0, y: topp + ry - k * ry), control2: CGPoint(x: x0 + rx - k * rx, y: topp))
        p.addLine(to: CGPoint(x: x0 + w - rx, y: topp))
        p.addCurve(to: CGPoint(x: x0 + w, y: topp + ry),
                   control1: CGPoint(x: x0 + w - rx + k * rx, y: topp), control2: CGPoint(x: x0 + w, y: topp + ry - k * ry))
        p.addLine(to: CGPoint(x: x0 + w, y: botten))
        p.closeSubpath()
        return p
    }
}

/// Vätskan i en ram: `niva` 0 = under knappen, 1 = full. Platt yta med Reduce Motion.
struct Vatskelager<Fyllning: ShapeStyle>: View {
    let niva: CGFloat
    let fyllning: Fyllning
    var valvd = true

    var body: some View {
        GeometryReader { g in
            Group {
                if valvd {
                    Vatskeform().fill(fyllning)
                        .offset(y: (1 - niva) * (g.size.height * 1.7 + 2))
                } else {
                    Rectangle().fill(fyllning).opacity(niva)
                }
            }
            .frame(width: g.size.width, height: g.size.height)
        }
        .allowsHitTesting(false)
    }
}

enum Knappsort {
    /// Accentfärgad CTA; temats mörka (ljusa i mörkt läge) vätska stiger.
    case primar
    /// Ljus knapp med kant; accentfärgad vätska.
    case sekundar
    /// Text i accentfärg med tunn kant; accentfärgad vätska.
    case spok
    /// Text i accentfärg utan kant (Avbryt, Klar); accentfärgad vätska.
    case lank
    /// Ikon i en rad (verktygsraden, adressfältet); accentfärgad vätska i en rundad ruta, kort skvalp.
    case ikon
    /// Ikon på mörk yta (menyn); ljus vätska.
    case ikonMork
}

/// Knappstilen med vätskan. `form` är knappens kontur (standard: temats knapphörn).
struct Vatskeknapp: ButtonStyle {
    let sort: Knappsort
    var radie: CGFloat?
    var privat = false
    var hojd: CGFloat?

    init(_ sort: Knappsort, radie: CGFloat? = nil, privat: Bool = false, hojd: CGFloat? = nil) {
        self.sort = sort
        self.radie = radie
        self.privat = privat
        self.hojd = hojd
    }

    func makeBody(configuration: Configuration) -> some View {
        Vatskekropp(etikett: configuration.label, tryckt: configuration.isPressed, sort: sort, radie: radie, privat: privat, hojd: hojd)
    }
}

private struct Vatskekropp<Etikett: View>: View {
    let etikett: Etikett
    let tryckt: Bool
    let sort: Knappsort
    let radie: CGFloat?
    let privat: Bool
    let hojd: CGFloat?

    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.isEnabled) private var pa
    @Environment(\.dynamicTypeSize) private var typ
    @State private var niva: CGFloat = 0
    @State private var start: Date?
    @State private var omgang = 0

    private var hel: Bool { sort == .primar || sort == .sekundar || sort == .spok || sort == .lank }

    var body: some View {
        let f = Skalfarger(tema, privat: privat)
        let form = RoundedRectangle(cornerRadius: radie ?? standardradie, style: .continuous)
        // Etiketten två gånger: i vilande färg, och ovanpå i sin färg under vätskan (bara där vätskan når).
        // Bakgrund och vätska ligger bakom och får etikettens storlek.
        etikett
            .foregroundStyle(vilandeFarg(f))
            .frame(minHeight: hojd)
            .overlay {
                etikett
                    .foregroundStyle(nedsanktFarg(f))
                    .frame(minHeight: hojd)
                    .mask(Vatskelager(niva: niva, fyllning: Color.black, valvd: !minska))
                    .allowsHitTesting(false)
            }
            .background {
                ZStack {
                    bakgrund(f, form)
                    Vatskelager(niva: niva, fyllning: vatska(f), valvd: !minska)
                        .clipShape(form)
                }
            }
            .contentShape(form)
        .overlay {
            if sort == .sekundar || sort == .spok {
                form.strokeBorder(sort == .spok ? f.accent.opacity(0.45) : f.faltlinje, lineWidth: 1)
            }
        }
        .opacity(pa ? 1 : 0.32)
        .offset(y: tryckt && !minska ? 1 : 0)
        .onChange(of: tryckt) { _, nu in nu ? stig() : rinn() }
    }

    private var standardradie: CGFloat {
        switch sort {
        case .ikon, .ikonMork: return min(12, tema.radier.knapp + 4)
        default: return tema.radier.knapp == 999 ? 999 : tema.radier.knapp + 4
        }
    }

    @ViewBuilder private func bakgrund(_ f: Skalfarger, _ form: RoundedRectangle) -> some View {
        switch sort {
        case .primar: form.fill(f.accent)
        case .sekundar: form.fill(f.falt)
        case .spok, .lank, .ikon, .ikonMork: form.fill(Color.clear)
        }
    }

    private func vatska(_ f: Skalfarger) -> AnyShapeStyle {
        switch sort {
        case .primar: return AnyShapeStyle(LinearGradient(colors: [f.fyllnadFran, f.fyllnadTill], startPoint: .top, endPoint: .bottom))
        case .sekundar, .spok, .lank, .ikon: return AnyShapeStyle(f.accent)
        case .ikonMork: return AnyShapeStyle(Color.papper)
        }
    }

    private func vilandeFarg(_ f: Skalfarger) -> Color {
        switch sort {
        case .primar: return f.paAccent
        case .sekundar: return f.text
        case .spok, .lank: return f.accentText
        case .ikon: return f.ikon
        case .ikonMork: return .papper
        }
    }

    private func nedsanktFarg(_ f: Skalfarger) -> Color {
        switch sort {
        case .primar: return f.sida
        case .sekundar, .spok, .lank, .ikon: return f.paAccent
        case .ikonMork: return .tusch
        }
    }

    private func stig() {
        omgang += 1
        start = Date()
        if minska {
            withAnimation(.easeInOut(duration: 0.2)) { niva = 1 }
        } else {
            withAnimation(Rorelse.vatska) { niva = 1 }
        }
    }

    private func rinn() {
        let min: Double = hel ? 0.95 : 0.26
        let gatt = start.map { Date().timeIntervalSince($0) } ?? min
        let kvar = max(0, min - gatt) + (hel ? 0.1 : 0)
        let denna = omgang
        efter(kvar) {
            guard denna == omgang, !tryckt else { return }
            if minska {
                withAnimation(.easeInOut(duration: 0.2)) { niva = 0 }
            } else {
                withAnimation(.timingCurve(0.4, 0, 0.6, 1, duration: hel ? 0.6 : 0.45)) { niva = 0 }
            }
        }
    }
}

/// Tryck utan vätska för saker med egna färger (skölden med antalet, kort): krymper lite och tonar.
struct Tryckstil: ButtonStyle {
    var skala: CGFloat = 0.95
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? skala : 1)
            .opacity(configuration.isPressed ? 0.72 : 1)
            .animation(configuration.isPressed ? .easeOut(duration: 0.08) : Rorelse.snabbFjader, value: configuration.isPressed)
    }
}

/// En CTA med text (och valfri ikon) i signaturstilen.
struct Vatsketext: View {
    let text: String
    var ikon: Ikon?
    var vikt: CGFloat = 640

    var body: some View {
        HStack(spacing: 8) {
            if let ikon { Ikonvy(ikon, storlek: 18, streck: 2.1) }
            Text(text)
                .grotesk(16, vikt: vikt, stil: .body, tak: 26)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 13)
    }
}
