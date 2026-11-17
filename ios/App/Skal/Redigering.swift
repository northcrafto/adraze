import SwiftUI
import UIKit

/// Läget när man skriver i adressfältet: fältet sitter vid tangentbordet (raden nere) eller överst (raden
/// uppe), och förslagen ligger mellan fältet och sidan. Tryck utanför för att avbryta.
///
/// Ägare: Skal.
struct Redigeringslager: View {
    let skal: SkalLage
    let farger: Skalfarger
    let uppe: Bool

    var body: some View {
        VStack(spacing: 0) {
            if uppe {
                faltrad
                Forslagslista(skal: skal, farger: farger, uppe: true)
            } else {
                Forslagslista(skal: skal, farger: farger, uppe: false)
                faltrad
            }
        }
        .background { farger.sida.ignoresSafeArea() }
    }

    private var faltrad: some View {
        Redigeringsfalt(skal: skal, farger: farger)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background {
                farger.rad
                    .ignoresSafeArea(edges: uppe ? .top : .bottom)
                    .overlay(alignment: uppe ? .bottom : .top) { farger.linje.frame(height: 0.5) }
            }
    }
}

/// Täcker statusraden medan man skriver (raden nere), så att förslagen inte rullar in under klockan: sidans
/// färg i statusraden och en kort toning nedanför. Ligger direkt i skalets lager, inom säkerhetsmarginalen.
struct Statusskydd: View {
    let farg: Color

    var body: some View {
        VStack(spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background { farg.ignoresSafeArea(edges: .top) }
            LinearGradient(colors: [farg, farg.opacity(0)], startPoint: .top, endPoint: .bottom)
                .frame(height: 18)
            Spacer(minLength: 0)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Förslagen: klistra in och gå, toppträffen (den tysta kompletteringen), historik och bokmärken, och
/// sökmotorns förslag. Fyll i-pilen lägger förslaget i fältet utan att gå dit.
struct Forslagslista: View {
    let skal: SkalLage
    let farger: Skalfarger
    let uppe: Bool

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.dynamicTypeSize) private var typ

    var body: some View {
        let fs = skal.forslag
        let q = skal.text.trimmingCharacters(in: .whitespaces)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let u = fs.urklipp {
                    rad(ikon: .klistra, titel: u == .adress ? tr("Klistra in och gå") : tr("Klistra in och sök"),
                        detalj: nil, fyllI: nil, framhavd: false) { skal.klistraInOchGa() }
                }
                if !skal.orord, !q.isEmpty {
                    if let k = fs.komplettering, !k.isEmpty {
                        rubrik(tr("Toppträff"))
                        rad(ikon: .glob, titel: q + k, detalj: nil, fyllI: nil, framhavd: true, fet: q) { skal.ga(q + k) }
                    }
                    if !fs.lokala.isEmpty {
                        rubrik(tr("Historik och bokmärken"))
                        ForEach(fs.lokala) { r in
                            rad(monogram: domanFor(URL(string: r.mal)), ikon: r.sort == .bokmarke ? .stjarna : .historik,
                                titel: r.titel, detalj: r.detalj, fyllI: r.detalj, framhavd: false, fet: q) {
                                if let u = URL(string: r.mal) { skal.ga(till: u) }
                            }
                        }
                    }
                    rubrik(tr("Sök med {x}", ["x": motornamn]))
                    rad(ikon: .sok, titel: q, detalj: nil, fyllI: nil, framhavd: fs.komplettering == nil) { skal.ga(q) }
                    ForEach(fs.fjarran) { r in
                        rad(ikon: .sok, titel: r.titel, detalj: nil, fyllI: r.titel, framhavd: false, fet: q, fetResten: true) {
                            skal.ga(r.mal)
                        }
                    }
                } else if fs.urklipp == nil {
                    Text(skal.arPrivat ? tr("Privata sökningar sparas inte.") : tr("Skriv en adress eller något att söka efter."))
                        .grotesk(14, tak: 20)
                        .foregroundStyle(farger.dampad)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 18)
                }
            }
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .defaultScrollAnchor(uppe ? .top : .bottom)
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
        .background {
            farger.sida
                .contentShape(Rectangle())
                .onTapGesture { skal.avbrytRedigering() }
        }
    }

    private var motornamn: String {
        skal.arPrivat ? Sokmotorer.privat.namn : Sokmotorer.motor(app.installningar[.sokMotor]).namn
    }

    private func rubrik(_ s: String) -> some View {
        Text(s)
            .grotesk(11.5, vikt: 650, tak: 16)
            .textCase(.uppercase)
            .tracking(0.7)
            .foregroundStyle(farger.dampad)
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 4)
    }

    private func rad(monogram: String? = nil, ikon: Ikon, titel: String, detalj: String?, fyllI: String?, framhavd: Bool,
                     fet: String? = nil, fetResten: Bool = false, gor: @escaping @MainActor () -> Void) -> some View {
        HStack(spacing: 0) {
            Button { gor() } label: {
                HStack(spacing: 12) {
                    ZStack {
                        if let monogram, !monogram.isEmpty {
                            Monogram(doman: monogram, storlek: 28)
                        } else {
                            Ikonvy(ikon, storlek: 18, streck: 2)
                                .foregroundStyle(framhavd ? farger.accentText : farger.dampad)
                        }
                    }
                    .frame(width: 30, height: 30)
                    VStack(alignment: .leading, spacing: 1) {
                        let st = Skrift.skalad(15.5, stil: .body, typ: typ, tak: 22)
                        Self.markera(titel, fet: fet, resten: fetResten,
                                     vanlig: Skrift.text(st, vikt: 420, val: tema.typsnittsval),
                                     stark: Skrift.text(st, vikt: 680, val: tema.typsnittsval))
                            .foregroundStyle(farger.text)
                            .lineLimit(1)
                        if let detalj, !detalj.isEmpty, detalj != titel {
                            Text(detalj)
                                .grotesk(12.5, tak: 18)
                                .foregroundStyle(farger.dampad)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.leading, 16)
                .frame(minHeight: 50)
                .contentShape(Rectangle())
            }
            .buttonStyle(Radtryck(farg: farger.accentMjuk.opacity(framhavd ? 0 : 1)))
            if let fyllI {
                Button { skal.skriv(fyllI) } label: {
                    Ikonvy(.fyllI, storlek: 16, streck: 2)
                        .foregroundStyle(farger.dampad)
                        .frame(width: 46, height: 50)
                        .contentShape(Rectangle())
                }
                .buttonStyle(Tryckstil(skala: 0.85))
                .accessibilityLabel(tr("Fyll i {x}", ["x": fyllI]))
            } else {
                Color.clear.frame(width: 12)
            }
        }
        .background {
            if framhavd {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(farger.accentMjuk)
                    .padding(.horizontal, 8)
            }
        }
    }

    /// Det man skrivit i fetstil (eller resten i fetstil, som sökmotorernas förslag).
    static func markera(_ s: String, fet: String?, resten: Bool, vanlig: Font, stark: Font) -> Text {
        guard let fet, !fet.isEmpty, let r = s.range(of: fet, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return Text(s).font(vanlig)
        }
        let fore = String(s[..<r.lowerBound]), mitt = String(s[r]), efter = String(s[r.upperBound...])
        if resten { return Text(fore + mitt).font(vanlig) + Text(efter).font(stark) }
        return Text(fore).font(vanlig) + Text(mitt).font(stark) + Text(efter).font(vanlig)
    }
}
