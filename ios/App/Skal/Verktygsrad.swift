import SwiftUI
import UIKit

/// Verktygsraden: bakåt, framåt, dela, ny flik, flikarna (med antalet) och menyn (hamburgaren som blir ett
/// kryss). Långt tryck på bakåt och framåt visar historiken, på flikknappen nya och stäng.
///
/// Ägare: Skal.
struct Verktygsrad: View {
    let flik: (any Flik)?
    let skal: SkalLage
    let farger: Skalfarger
    /// Bara knapparna, för raden i liggande läge där fältet sitter mellan dem.
    var delar: Set<Del> = Set(Del.allCases)

    enum Del: CaseIterable { case bakat, framat, dela, ny, flikar, meny }

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema

    var body: some View {
        HStack(spacing: 0) {
            if delar.contains(.bakat) { bakat; Spacer(minLength: 0) }
            if delar.contains(.framat) { framat; Spacer(minLength: 0) }
            if delar.contains(.dela) { dela; Spacer(minLength: 0) }
            if delar.contains(.ny) { ny; Spacer(minLength: 0) }
            if delar.contains(.flikar) { flikarKnapp; Spacer(minLength: 0) }
            if delar.contains(.meny) { meny }
        }
    }

    private var bakat: some View {
        Radknapp(ikon: .bakat, etikett: tr("Tillbaka"), farger: farger, pa: flik?.kanGaBakat ?? false,
                 langt: { skal.visaHistorik(bakat: true) }) { flik?.bakat() }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.bakatknapp = $0 }
    }

    private var framat: some View {
        Radknapp(ikon: .framat, etikett: tr("Framåt"), farger: farger, pa: flik?.kanGaFramat ?? false,
                 langt: { skal.visaHistorik(bakat: false) }) { flik?.framat() }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.framatknapp = $0 }
    }

    private var dela: some View {
        Radknapp(ikon: .dela, etikett: tr("Dela"), farger: farger, pa: !arTomAdress(flik?.url)) { skal.dela() }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.delaknapp = $0 }
    }

    private var ny: some View {
        Radknapp(ikon: .plus, etikett: tr("Ny flik"), farger: farger, pa: true,
                 langt: { skal.visaFlikval() }) { skal.nyFlik(privat: skal.arPrivat) }
    }

    private var flikarKnapp: some View {
        let antal = skal.flikar(privat: skal.arPrivat).count
        return Radknapp(innehall: AnyView(Flikantal(antal: antal)),
                        etikett: trAntal(antal, en: "{n} flik", flera: "{n} flikar"), farger: farger, pa: true,
                        langt: { skal.visaFlikval() }) { skal.oppnaVaxlare() }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.flikknapp = $0 }
            .accessibilityHint(tr("Visa alla flikar"))
    }

    private var meny: some View {
        Radknapp(innehall: AnyView(Hamburgare(oppen: false, accent: farger.accent)),
                 etikett: tr("Meny"), farger: farger, pa: true) { skal.oppnaMeny() }
            .opacity(skal.menyOppen ? 0 : 1)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.menyknapp = $0 }
    }
}

/// En knapp i verktygsraden: ikonen i en rundad ruta som fylls med accentfärgad vätska när man trycker.
struct Radknapp: View {
    var ikon: Ikon?
    var innehall: AnyView?
    let etikett: String
    let farger: Skalfarger
    let pa: Bool
    var langt: (@MainActor () -> Void)?
    let gor: @MainActor () -> Void

    @Environment(Tema.self) private var tema
    @Environment(\.dynamicTypeSize) private var typ
    @State private var langtTryck = false

    init(ikon: Ikon? = nil, innehall: AnyView? = nil, etikett: String, farger: Skalfarger, pa: Bool,
         langt: (@MainActor () -> Void)? = nil, gor: @escaping @MainActor () -> Void) {
        self.ikon = ikon
        self.innehall = innehall
        self.etikett = etikett
        self.farger = farger
        self.pa = pa
        self.langt = langt
        self.gor = gor
    }

    var body: some View {
        let s = Skrift.faktor(typ, tak: 1.3)
        Button {
            if langtTryck { langtTryck = false; return }
            gor()
        } label: {
            Group {
                if let ikon {
                    Ikonvy(ikon, storlek: 23 * s, streck: 1.85)
                        .flipsForRightToLeftLayoutDirection(ikon == .bakat || ikon == .framat)
                }
                else if let innehall { innehall }
            }
            .frame(width: 46 * s, height: 38 * s)
            .contentShape(Rectangle())
        }
        .buttonStyle(Vatskeknapp(.ikon, radie: 12, privat: farger.privat))
        .disabled(!pa)
        .frame(minWidth: tema.matt.tryckyta, minHeight: tema.matt.tryckyta)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in
            guard pa, let langt else { return }
            langtTryck = true
            langt()
            efter(1.2) { langtTryck = false }
        })
        .accessibilityLabel(etikett)
        .accessibilityShowsLargeContentViewer {
            if let ikon { Ikonvy(ikon, storlek: 30) }
            Text(etikett)
        }
    }
}

/// Flikknappen: en rundad ruta med antalet flikar.
struct Flikantal: View {
    let antal: Int
    @Environment(\.dynamicTypeSize) private var typ

    var body: some View {
        let s = Skrift.faktor(typ, tak: 1.3)
        ZStack {
            RoundedRectangle(cornerRadius: 6 * s, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.85 * s))
                .frame(width: 22 * s, height: 22 * s)
            Text(antal >= 100 ? "∞" : antal.formatted())
                .font(Font(Typsnitt.familjen((antal >= 10 ? 11 : 12.5) * s, vikt: 700)).monospacedDigit())
                .contentTransition(.numericText(value: Double(antal)))
                .animation(Rorelse.snabbFjader, value: antal)
        }
        .accessibilityHidden(true)
    }
}

/// Hamburgaren: tre streck där mittstrecket har accentfärgen. Öppen blir den ett kryss (övre och undre
/// strecket vrids ±45° in mot mitten, mittstrecket glider åt vänster, krymper och tonar bort).
struct Hamburgare: View {
    let oppen: Bool
    let accent: Color
    var farg: Color?
    @Environment(\.dynamicTypeSize) private var typ
    @Environment(\.accessibilityReduceMotion) private var minska

    var body: some View {
        let s = Skrift.faktor(typ, tak: 1.3)
        let b: CGFloat = 22 * s, h: CGFloat = 15 * s, t: CGFloat = 2.4 * s
        ZStack {
            streck(b, t).foregroundStyle(farg.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.foreground))
                .offset(y: oppen ? 0 : -(h - t) / 2)
                .rotationEffect(.degrees(oppen ? 45 : 0))
            streck(b, t).foregroundStyle(accent)
                .scaleEffect(x: oppen ? 0.35 : 1, y: 1, anchor: .leading)
                .offset(x: oppen ? -32 * s : 0)
                .opacity(oppen ? 0 : 1)
                .animation(Rorelse.val(.timingCurve(0.6, 0.05, 0.2, 1, duration: 0.35), minska), value: oppen)
            streck(b, t).foregroundStyle(farg.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.foreground))
                .offset(y: oppen ? 0 : (h - t) / 2)
                .rotationEffect(.degrees(oppen ? -45 : 0))
        }
        .frame(width: b, height: h)
        .animation(Rorelse.val(Rorelse.streck, minska), value: oppen)
        .accessibilityHidden(true)
    }

    private func streck(_ b: CGFloat, _ t: CGFloat) -> some View {
        Capsule().frame(width: b, height: t)
    }
}
