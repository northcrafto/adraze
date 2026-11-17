import SwiftUI
import UIKit

/// Skalet: allt synligt runt webbsidan. Adressfältet och verktygsraden nere (eller uppe, `verktyg.placering`),
/// i liggande läge och på iPad en enda rad som på datorn. Ovanpå: skrivläget, flikväxlaren, menyn,
/// snabbmenyer och notiser.
///
/// Webbytan får sina mått av en reserverad yta som byts utan animation, medan raderna glider (se
/// `SkalLage.satt(kompakt:)`), så att sidan aldrig hoppar när raderna fälls ihop.
///
/// Ägare: Skal.
struct SkalVy: View {
    @Bindable var skal: SkalLage

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.verticalSizeClass) private var vsc
    @Environment(\.horizontalSizeClass) private var hsc
    @Environment(\.colorScheme) private var schema
    @Environment(\.dynamicTypeSize) private var typ
    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var matt = Panelmatt()

    /// Uppmätta höjder (utan säkerhetsmarginalerna).
    struct Panelmatt: Equatable {
        var full: CGFloat = 116
        var kompakt: CGFloat = 30
        var topp: CGFloat = 64
        var verktyg: CGFloat = 52
        var enRad: CGFloat = 62
    }

    var body: some View {
        let flik = app.flikar.aktiv
        let privat = flik?.privat ?? false
        let f = Skalfarger(tema, privat: privat)
        let uppe = app.installningar[.verktygPlacering] == .uppe
        let enRad = vsc == .compact || hsc == .regular
        ZStack {
            Group {
                if enRad {
                    enradslayout(flik, f, uppe: uppe)
                } else if uppe {
                    topplayout(flik, f)
                } else {
                    bottenlayout(flik, f)
                }
            }
            .ignoresSafeArea(.keyboard)

            if skal.redigerar {
                Redigeringslager(skal: skal, farger: f, uppe: uppe || enRad)
                    .transition(.opacity.animation(Rorelse.val(.easeOut(duration: 0.18), minska)))
                    .zIndex(2)
                if !(uppe || enRad) {
                    Statusskydd(farg: f.sida)
                        .transition(.opacity.animation(Rorelse.val(.easeOut(duration: 0.18), minska)))
                        .zIndex(2.1)
                }
            }
            if skal.vaxlareOppen {
                Flikvaxlare(skal: skal)
                    .transition(.opacity)
                    .zIndex(3)
            }
            if let h = skal.hjalte {
                Hjaltevy(hjalte: h).zIndex(4)
            }
            if skal.menyOppen {
                Menyvy(skal: skal).zIndex(5)
            }
            if let m = skal.snabbmeny {
                Snabbmenyvy(meny: m, farger: f) { skal.snabbmeny = nil }
                    .zIndex(6)
            }
            notislager(uppe: uppe, enRad: enRad)
                .zIndex(7)
            if let p = skal.provVy {
                p.zIndex(9)
            }
        }
        .background { statusfarg(flik, f, uppe: uppe || enRad).ignoresSafeArea() }
        .sheet(item: $skal.ark) { a in
            Arkvy(ark: a, skal: skal).environment(app).environment(tema)
        }
        .sheet(item: $skal.plats) { p in
            Platsvy(plats: p, skal: skal).environment(app).environment(tema)
        }
        .environment(\.layoutDirection, Sprak.delad.arHogerTillVanster ? .rightToLeft : .leftToRight)
        .dynamicTypeSize(skal.provTextstorlek ?? typ)
        .onChange(of: matt, initial: true) { _, m in uppdateraDelta(m, uppe: uppe, enRad: enRad) }
        .onChange(of: uppe) { _, u in uppdateraDelta(matt, uppe: u, enRad: enRad) }
        .onChange(of: enRad) { _, e in uppdateraDelta(matt, uppe: uppe, enRad: e) }
    }

    private func uppdateraDelta(_ m: Panelmatt, uppe: Bool, enRad: Bool) {
        if enRad { skal.toppDelta = uppe ? max(0, m.enRad - m.kompakt) : 0 }
        else { skal.toppDelta = uppe ? max(0, m.topp - m.kompakt) : 0 }
    }

    // MARK: - Webbytan

    private func visarStart(_ flik: (any Flik)?) -> Bool {
        guard let flik else { return true }
        return arTomAdress(flik.url) && !flik.laddar && flik.fel == nil
    }

    /// Den tomma fliken visar datorns startsida (Brygga), utom i privata flikar som har skalets egen.
    private func webbstart(_ flik: (any Flik)?) -> Bool {
        !(flik?.privat ?? false) && app.sidor.finns("startsida")
    }

    /// Datorns startsida i den tomma fliken. `nedre` = skalets rad som ligger ovanpå sidan nertill.
    private func startsida(nedre: CGFloat) -> some View {
        app.sidor.vy("startsida", fragment: nil, nedre: nedre) { [weak skal] url in skal?.ga(till: url) }
    }

    /// Webbytan. Felsidor (nätfel, skyddets stoppsida) visar fliken själv i webbvyn, så skalet lägger inget
    /// eget ovanpå. `startILager` = startsidan ritas av layouten (under raderna), inte här.
    private func webbflade(_ flik: (any Flik)?, _ f: Skalfarger, uppe: Bool, startILager: Bool = false) -> some View {
        ZStack(alignment: .top) {
            Webbyta(flik: flik, skal: skal, bakgrund: UIColor(f.sida))
            if visarStart(flik) {
                if !webbstart(flik) {
                    Startvy(skal: skal, privat: flik?.privat ?? false, uppe: uppe)
                        .transition(.opacity)
                } else if !startILager {
                    startsida(nedre: 0)
                        .transition(.opacity)
                }
            }
            Dragvisare(skal: skal, farger: f)
        }
        .ignoresSafeArea(edges: .horizontal)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.webbram = $0 }
    }

    /// Statusraden ovanför sidan: sidans egen färg när statusraden går att läsa på den, annars skalets.
    private func statusfarg(_ flik: (any Flik)?, _ f: Skalfarger, uppe: Bool) -> Color {
        if uppe { return f.rad }
        guard let flik, !visarStart(flik), flik.fel == nil, let c = skal.sidfarg else {
            if visarStart(flik), flik?.privat == true, schema == .dark { return Color.hex("#1d0d36") }
            return f.sida
        }
        let r = c.resolvedColor(with: UITraitCollection(userInterfaceStyle: schema == .dark ? .dark : .light))
        var rr: CGFloat = 0, gg: CGFloat = 0, bb: CGFloat = 0, aa: CGFloat = 0
        guard r.getRed(&rr, green: &gg, blue: &bb, alpha: &aa), aa > 0.9 else { return f.sida }
        let lum = 0.2126 * Palett.tillLin(Double(rr) * 255) + 0.7152 * Palett.tillLin(Double(gg) * 255) + 0.0722 * Palett.tillLin(Double(bb) * 255)
        let lasbar = schema == .dark ? lum < 0.18 : lum > 0.4
        return lasbar ? Color(uiColor: r) : f.sida
    }

    // MARK: - Raden nere (stående)

    private func bottenlayout(_ flik: (any Flik)?, _ f: Skalfarger) -> some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                webbflade(flik, f, uppe: false, startILager: true)
                Color.clear.frame(height: skal.webbKompakt ? matt.kompakt : matt.full)
            }
            // Startsidan går under statusraden och raden nere (bilden ända ut i kanterna); sidan lägger sitt
            // innehåll ovanför raden med --ios-nedre.
            if visarStart(flik), webbstart(flik) {
                startsida(nedre: skal.kompakt ? matt.kompakt : matt.full)
                    .ignoresSafeArea()
                    .transition(.opacity)
            }
            if skal.kompakt {
                kompaktremsa(flik, f, uppe: false)
                    .transition(.opacity.animation(Rorelse.val(.easeOut(duration: 0.2), minska)))
            } else {
                VStack(spacing: 4) {
                    Adressfalt(flik: flik, skal: skal, farger: f)
                        .padding(.horizontal, 12)
                        .padding(.top, 9)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.adressram = $0 }
                    Verktygsrad(flik: flik, skal: skal, farger: f)
                        .padding(.horizontal, 6)
                }
                .padding(.bottom, 2)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if h > 20 { matt.full = h } }
                .background { radbakgrund(f, kant: .top) }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Raden uppe (stående)

    private func topplayout(_ flik: (any Flik)?, _ f: Skalfarger) -> some View {
        ZStack {
            VStack(spacing: 0) {
                Color.clear.frame(height: skal.webbKompakt ? matt.kompakt : matt.topp)
                // Ihopfälld går sidan ända ner, under hemindikatorn.
                webbflade(flik, f, uppe: true)
                    .ignoresSafeArea(.container, edges: skal.webbKompakt ? .bottom : [])
                Color.clear.frame(height: skal.webbKompakt ? 0 : matt.verktyg)
            }
            VStack(spacing: 0) {
                if skal.kompakt {
                    kompaktremsa(flik, f, uppe: true)
                        .transition(.opacity.animation(Rorelse.val(.easeOut(duration: 0.2), minska)))
                } else {
                    Adressfalt(flik: flik, skal: skal, farger: f)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.adressram = $0 }
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if h > 20 { matt.topp = h } }
                        .background { radbakgrund(f, kant: .bottom) }
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer(minLength: 0)
                if !skal.kompakt {
                    Verktygsrad(flik: flik, skal: skal, farger: f)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if h > 20 { matt.verktyg = h } }
                        .background { radbakgrund(f, kant: .top) }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    // MARK: - En rad (liggande, iPad)

    private func enradslayout(_ flik: (any Flik)?, _ f: Skalfarger, uppe: Bool) -> some View {
        ZStack(alignment: uppe ? .top : .bottom) {
            VStack(spacing: 0) {
                if uppe { Color.clear.frame(height: skal.webbKompakt ? matt.kompakt : matt.enRad) }
                webbflade(flik, f, uppe: uppe)
                if !uppe { Color.clear.frame(height: skal.webbKompakt ? matt.kompakt : matt.enRad) }
            }
            if skal.kompakt {
                kompaktremsa(flik, f, uppe: uppe)
                    .transition(.opacity.animation(Rorelse.val(.easeOut(duration: 0.2), minska)))
            } else {
                HStack(spacing: 4) {
                    Verktygsrad(flik: flik, skal: skal, farger: f, delar: [.bakat, .framat])
                        .fixedSize()
                    Adressfalt(flik: flik, skal: skal, farger: f)
                        .frame(maxWidth: 760)
                        .padding(.horizontal, 6)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { skal.adressram = $0 }
                    Verktygsrad(flik: flik, skal: skal, farger: f, delar: [.dela, .ny, .flikar, .meny])
                        .fixedSize()
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if h > 20 { matt.enRad = h } }
                .background { radbakgrund(f, kant: uppe ? .bottom : .top) }
                .transition(.move(edge: uppe ? .top : .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Delar

    private func kompaktremsa(_ flik: (any Flik)?, _ f: Skalfarger, uppe: Bool) -> some View {
        KompaktAdress(flik: flik, skal: skal, farger: f)
            .padding(.vertical, 2)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { h in if h > 10 { matt.kompakt = h } }
            .background { radbakgrund(f, kant: uppe ? .bottom : .top) }
    }

    private func radbakgrund(_ f: Skalfarger, kant: Edge) -> some View {
        f.rad
            .ignoresSafeArea(edges: kant == .top ? [.bottom, .horizontal] : [.top, .horizontal])
            .overlay(alignment: kant == .top ? .top : .bottom) { f.linje.frame(height: 0.5) }
    }

    private func notislager(uppe: Bool, enRad: Bool) -> some View {
        let botten: CGFloat = {
            if enRad { return uppe ? 20 : matt.enRad + 14 }
            if uppe { return (skal.kompakt ? 0 : matt.verktyg) + 14 }
            return (skal.kompakt ? matt.kompakt : matt.full) + 14
        }()
        return VStack {
            Spacer()
            if let n = skal.notis {
                Notisvy(notis: n)
                    .padding(.horizontal, 24)
                    .padding(.bottom, botten)
                    .transition(.asymmetric(insertion: .offset(y: 8).combined(with: .opacity), removal: .opacity))
                    .id(n.id)
            }
        }
        .allowsHitTesting(false)
    }
}

/// Vätskeknappen när man drar sidan nedåt (egen vy så att bara den ritas om medan man drar).
struct Dragvisare: View {
    let skal: SkalLage
    let farger: Skalfarger

    var body: some View {
        if skal.drag > 0.5 {
            Dragindikator(drag: skal.drag, farger: farger)
                .padding(.top, 6)
        }
    }
}
