import SwiftUI
import UIKit

/// Menyn: signaturkitets cirkel-reveal. Hamburgaren blir ett kryss och en mörk yta växer ut som en cirkel från
/// knappen (0,6 s). Valen är numrerade (01, 02 …) i Fraunces och glider in från vänster ett i taget; ett
/// streck i accentfärg ritas under valet man trycker på. Längst ner sitter platserna som andra delar av appen
/// fyller (Anpassa, Falk och chatten).
///
/// Ägare: Skal.
struct Menyvy: View {
    let skal: SkalLage

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.dynamicTypeSize) private var typ
    @State private var visad = false

    var body: some View {
        let flik = skal.aktiv
        let f = Skalfarger(tema, privat: flik?.privat ?? false)
        let yta = f.privat ? Color.hex("#140b26") : Color.tusch
        let accent = f.privat ? Color.hex("#a855f7") : Self.ljusAccent(tema)
        // Säkerhetsmarginalerna läses i en yttre GeometryReader: inne i en vy med `.ignoresSafeArea()` är de 0
        // (då hamnade rubriken under klockan och Dynamic Island).
        GeometryReader { yttre in
            let saker = yttre.safeAreaInsets
            GeometryReader { g in
                let o = g.frame(in: .global).origin
                let c = CGPoint(x: skal.menyCentrum.x - o.x, y: skal.menyCentrum.y - o.y)
                let r = Self.radie(fran: c, i: g.size)
                ZStack(alignment: .topLeading) {
                    yta
                    innehall(flik, f, accent: accent, bredd: g.size.width, sakerTopp: saker.top, sakerBotten: saker.bottom)
                        .frame(width: g.size.width, height: g.size.height)
                }
                .mask {
                    Circle()
                        .frame(width: 2 * r, height: 2 * r)
                        .scaleEffect(visad || minska ? 1 : 0.001)
                        .opacity(minska && !visad ? 0 : 1)
                        .position(c)
                }
                .overlay {
                    // Krysset där hamburgaren satt.
                    Button { stang() } label: {
                        Hamburgare(oppen: visad, accent: accent, farg: .papper)
                            .frame(width: 48, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(Tryckstil(skala: 0.9))
                    .position(c)
                    .accessibilityLabel(tr("Stäng menyn"))
                }
            }
            .ignoresSafeArea()
        }
        .onAppear {
            Haptik.forbered()
            withAnimation(Rorelse.val(Rorelse.cirkel, minska)) { visad = true }
        }
        .accessibilityAddTraits(.isModal)
    }

    /// Accenten mot den mörka ytan (palettens mörka variant).
    static func ljusAccent(_ tema: Tema) -> Color {
        let v = tema.varde(.accent, morkt: true)
        return Color(uiColor: UIColor(hex: v.hex, alfa: v.alfa))
    }

    static func radie(fran c: CGPoint, i s: CGSize) -> CGFloat {
        let horn = [CGPoint.zero, CGPoint(x: s.width, y: 0), CGPoint(x: 0, y: s.height), CGPoint(x: s.width, y: s.height)]
        return horn.map { hypot($0.x - c.x, $0.y - c.y) }.max() ?? 1000
    }

    private func stang(sedan gor: (@MainActor () -> Void)? = nil) {
        withAnimation(Rorelse.val(Rorelse.cirkel, minska)) { visad = false }
        if let gor { gor() }
        efter((minska ? 0.2 : 0.5)) { skal.stangMeny() }
    }

    // MARK: - Innehållet

    private func innehall(_ flik: (any Flik)?, _ f: Skalfarger, accent: Color, bredd: CGFloat, sakerTopp: CGFloat, sakerBotten: CGFloat) -> some View {
        let tom = arTomAdress(flik?.url)
        let val = menyval(tom: tom)
        let storlek = Self.radstorlek(val, bredd: min(560, bredd) - 56 - 36, typ: typ)
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // AdRaze, gorillan
                HStack(spacing: 10) {
                    Image("SkalGorilla").resizable().interpolation(.high).frame(width: 30, height: 30)
                    Text("AdRaze")
                        .rubrik(22, vikt: 640, tak: 30)
                        .foregroundStyle(Color.papper)
                }
                .padding(.bottom, 22)
                .glidIn(visad, steg: 0, minska: minska)

                if !tom, let flik { sidkort(flik, accent: accent).padding(.bottom, 26).glidIn(visad, steg: 1, minska: minska) }

                ForEach(Array(val.enumerated()), id: \.offset) { i, v in
                    Menyrad(nummer: i + 1, titel: v.titel, tillagg: v.tillagg, storlek: storlek, accent: accent, pa: v.pa) {
                        v.gor()
                    }
                    .glidIn(visad, steg: i + 2, minska: minska)
                }

                platser(accent: accent)
                    .padding(.top, 30)
                    .glidIn(visad, steg: val.count + 2, minska: minska)
            }
            .padding(.horizontal, 28)
            .padding(.top, sakerTopp + 22)
            .padding(.bottom, sakerBotten + 96)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
    }

    /// Valens storlek: Fraunces 34 (med Dynamic Type), men alla val krymper lika mycket om det längsta inte får
    /// plats på en rad (långa tyska ord, stor text). Under 72 % bryts raden i stället.
    static func radstorlek(_ val: [Val], bredd: CGFloat, typ: DynamicTypeSize) -> CGFloat {
        let s = Skrift.skalad(34, stil: .title1, typ: typ, tak: 44)
        guard bredd > 0 else { return s }
        let pa = Typsnitt.familjen(Skrift.skalad(12, stil: .body, typ: typ, tak: 16), vikt: 700)
        func langst(_ storlek: CGFloat) -> CGFloat {
            let typsnitt = Typsnitt.fraunces(storlek, vikt: 560, opsz: storlek)
            return val.map { v -> CGFloat in
                var b = (v.titel as NSString).size(withAttributes: [.font: typsnitt]).width
                if let t = v.tillagg { b += 14 + 16 + (t as NSString).size(withAttributes: [.font: pa]).width }
                return ceil(b) + 4
            }.max() ?? 0
        }
        // Fraunces optiska storlek gör bokstäverna bredare i mindre grader: mät om tills det stämmer.
        var storlek = s
        for _ in 0..<4 {
            let b = langst(storlek)
            if b <= bredd { break }
            storlek = max(s * 0.72, storlek * bredd / b - 0.5)
            if storlek <= s * 0.72 { break }
        }
        return storlek
    }

    struct Val {
        let titel: String
        var tillagg: String?
        var pa = true
        let gor: @MainActor () -> Void
    }

    private func menyval(tom: Bool) -> [Val] {
        [
            Val(titel: tr("Bokmärken")) { stang { skal.ark = .bokmarken } },
            Val(titel: tr("Historik")) { stang { skal.ark = .historik } },
            Val(titel: tr("Nedladdningar")) { stang { skal.ark = .nedladdningar } },
            Val(titel: tr("Hitta på sidan"), pa: !tom) { stang { skal.hittaPaSidan() } },
            Val(titel: tr("Skrivbordsversion"), tillagg: skal.arSkrivbord ? tr("På") : nil, pa: !tom) { stang { skal.vaxlaSkrivbord() } },
            Val(titel: tr("Ny privat flik")) { skal.nyFlik(privat: true) },
        ]
    }

    private func sidkort(_ flik: any Flik, accent: Color) -> some View {
        let bokmarkt = skal.bibliotek.arBokmarkt(flik.url)
        let antal = skal.provBlockerade ?? app.skydd.antalBlockerade(i: flik.id)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Sajtikon(bild: flik.favikon, doman: domanFor(flik.url), storlek: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(flik.titel.isEmpty ? domanFor(flik.url) : flik.titel)
                        .grotesk(15.5, vikt: 620, tak: 22)
                        .foregroundStyle(Color.papper)
                        .lineLimit(1)
                    Text(domanFor(flik.url))
                        .grotesk(13, vikt: 450, tak: 19)
                        .foregroundStyle(Color.papper.opacity(0.55))
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                Button { skal.vaxlaBokmarke() } label: {
                    Ikonvy(.stjarna, storlek: 21, streck: 1.9)
                        .overlay {
                            if bokmarkt { Ikonform(ikon: .stjarna).fill(accent).frame(width: 21, height: 21) }
                        }
                        .frame(width: 42, height: 40)
                }
                .buttonStyle(Vatskeknapp(.ikonMork, radie: 12))
                .accessibilityLabel(bokmarkt ? tr("Ta bort bokmärke") : tr("Lägg till bokmärke"))
                Button { skal.kopieraLank() } label: {
                    Ikonvy(.kopiera, storlek: 20, streck: 1.9).frame(width: 42, height: 40)
                }
                .buttonStyle(Vatskeknapp(.ikonMork, radie: 12))
                .accessibilityLabel(tr("Kopiera länk"))
            }
            if let antal, antal > 0 {
                Button { stang { skal.ark = .skydd } } label: {
                    HStack(spacing: 8) {
                        Ikonvy(.skoldKoll, storlek: 17, streck: 2).foregroundStyle(accent)
                        Text(trAntal(antal, en: "{n} annons eller spårare stoppad", flera: "{n} annonser och spårare stoppade"))
                            .grotesk(13.5, vikt: 560, tak: 20)
                            .foregroundStyle(Color.papper.opacity(0.85))
                            .lineLimit(2)
                    }
                }
                .buttonStyle(Tryckstil())
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.08)))
    }

    private func platser(accent: Color) -> some View {
        let alla: [(String, String, Ikon?, String?)] = [
            (Platser.anpassa, tr("Anpassa"), .palett, nil),
            (Platser.falk, tr("Falk"), nil, "SkalFalk"),
            (Platser.chatt, tr("Chatt"), .chatt, nil),
        ]
        return HStack(spacing: 10) {
            ForEach(alla.indices, id: \.self) { i in
                let p = alla[i]
                Button { stang { skal.oppnaPlats(p.0) } } label: {
                    VStack(spacing: 8) {
                        if let bild = p.3 {
                            Image(bild).resizable().interpolation(.high).scaledToFit().frame(width: 26, height: 26)
                        } else if let ikon = p.2 {
                            Ikonvy(ikon, storlek: 24, streck: 1.85)
                        }
                        Text(p.1)
                            .grotesk(13, vikt: 600, tak: 18)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, minHeight: 74)
                    .padding(.horizontal, 6)
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
                }
                .buttonStyle(Vatskeknapp(.ikonMork, radie: 14))
            }
        }
    }
}

/// Ett numrerat val i menyn. Ett accentstreck ritas under texten medan man trycker.
struct Menyrad: View {
    let nummer: Int
    let titel: String
    var tillagg: String?
    /// Punktstorleken (redan skalad för Dynamic Type, se `Menyvy.radstorlek`).
    let storlek: CGFloat
    let accent: Color
    var pa = true
    let gor: @MainActor () -> Void

    var body: some View {
        Button { gor() } label: {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(String(format: "%02d", nummer))
                    .font(Font(Typsnitt.familjen(13, vikt: 700)).monospacedDigit())
                    .foregroundStyle(accent)
                    .frame(minWidth: 22, alignment: .leading)
                // Flera ord får brytas på två rader; ett enda långt ord krymper i stället för att delas.
                let ettOrd = !titel.contains(" ")
                Text(titel)
                    .font(Font(Typsnitt.fraunces(storlek, vikt: 560, opsz: storlek)))
                    .foregroundStyle(Color.papper)
                    .lineLimit(ettOrd ? 1 : 2)
                    .minimumScaleFactor(ettOrd ? 0.5 : 1)
                    .fixedSize(horizontal: false, vertical: !ettOrd)
                if let tillagg {
                    Text(tillagg)
                        .grotesk(12, vikt: 700, tak: 16)
                        .foregroundStyle(Color.tusch)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(accent))
                        .alignmentGuide(.firstTextBaseline) { d in d[.bottom] - 2 }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 7)
            .contentShape(Rectangle())
        }
        .buttonStyle(Strecktryck(accent: accent))
        .disabled(!pa)
        .opacity(pa ? 1 : 0.38)
    }
}

/// Signaturkitets streck: dras ut under valet (scaleX 0 → 1 på 0,3 s) medan man trycker.
struct Strecktryck: ButtonStyle {
    let accent: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(alignment: .bottomLeading) {
                Capsule().fill(accent)
                    .frame(height: 3)
                    .padding(.leading, 36)
                    .scaleEffect(x: configuration.isPressed ? 1 : 0, y: 1, anchor: .leading)
                    .animation(.timingCurve(0.2, 0.75, 0.25, 1, duration: 0.3), value: configuration.isPressed)
            }
    }
}

extension View {
    /// Menyvalens entré: glider in 28 pt från vänster och tonar in, ett i taget.
    func glidIn(_ visad: Bool, steg: Int, minska: Bool) -> some View {
        self
            .offset(x: visad || minska ? 0 : -28)
            .opacity(visad ? 1 : 0)
            .animation(minska ? .easeInOut(duration: 0.2)
                       : (visad ? Rorelse.ut.delay(0.18 + Double(steg) * 0.07) : .easeOut(duration: 0.15)), value: visad)
    }
}

// MARK: - Platser

/// Den äldre vägen till menyns platser, från innan `app.ersatt(plats:titel:vy:)` fanns i Gemensamt. Skickar
/// vidare dit, så att kod som redan använder den fortsätter att fungera.
///
/// Ägare: Skal.
@MainActor
final class Skalplatser {
    static let delad = Skalplatser()
    static let anpassa = Platser.anpassa
    static let falk = Platser.falk
    static let chatt = Platser.chatt

    func ersatt<V: View>(plats: String, titel: String, @ViewBuilder _ vy: @escaping @MainActor () -> V) {
        AppMiljo.delad?.ersatt(plats: plats, titel: titel, vy: vy)
    }
}
