import SwiftUI
import UIKit

/// Flikväxlaren: ett rutnät med flikarnas miniatyrer. Sidan zoomar ner till sitt kort när växlaren öppnas och
/// upp igen när man väljer ett kort. Stäng med krysset eller genom att svepa kortet åt sidan. Flikar och
/// privata flikar växlas längst ner, där också en ny flik öppnas.
///
/// Ägare: Skal.
struct Flikvaxlare: View {
    let skal: SkalLage

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.verticalSizeClass) private var vsc
    @Environment(\.horizontalSizeClass) private var hsc
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.dynamicTypeSize) private var typ

    var body: some View {
        let privat = skal.vaxlarePrivat
        let f = Skalfarger(tema, privat: privat)
        let poster = skal.flikar(privat: privat).map { Flikpost(flik: $0) }
        VStack(spacing: 0) {
            huvud(f, antal: poster.count, privat: privat)
            if poster.isEmpty {
                tomt(f, privat: privat)
            } else {
                rutnat(poster, f)
            }
            botten(f)
        }
        .background { f.sida.ignoresSafeArea() }
        .animation(Rorelse.val(Rorelse.mjuk, minska), value: privat)
        .confirmationDialog(tr("Stäng alla flikar?"), isPresented: Binding(get: { skal.fragaStangAlla }, set: { skal.fragaStangAlla = $0 }),
                            titleVisibility: .visible) {
            Button(trAntal(poster.count, en: "Stäng {n} flik", flera: "Stäng {n} flikar"), role: .destructive) {
                withAnimation(Rorelse.val(Rorelse.fjader, minska)) { skal.stangAlla(privat: privat) }
            }
            Button(tr("Avbryt"), role: .cancel) {}
        }
    }

    // MARK: - Delarna

    private func huvud(_ f: Skalfarger, antal: Int, privat: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(privat ? tr("Privat") : tr("Flikar"))
                .rubrik(34, vikt: 620, tak: 46)
                .foregroundStyle(f.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if antal > 0 {
                Text(antal.formatted())
                    .font(Font(Typsnitt.familjen(Skrift.skalad(15, stil: .body, typ: typ, tak: 22), vikt: 650)).monospacedDigit())
                    .foregroundStyle(f.accentText)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(f.accentMjuk))
                    .contentTransition(.numericText(value: Double(antal)))
            }
            Spacer(minLength: 8)
            if antal > 0 {
                Button { skal.fragaStangAlla = true } label: {
                    Text(tr("Stäng alla"))
                        .grotesk(15, vikt: 600, tak: 22)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 36)
                }
                .buttonStyle(Vatskeknapp(.lank, radie: 10, privat: f.privat))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    private func kolumner(_ bredd: CGFloat) -> Int {
        if bredd > 1000 { return 5 }
        if bredd > 700 { return 4 }
        if bredd > 560 { return 3 }
        return typ.isAccessibilitySize ? 1 : 2
    }

    private func rutnat(_ poster: [Flikpost], _ f: Skalfarger) -> some View {
        GeometryReader { g in
            let n = kolumner(g.size.width)
            let luft: CGFloat = 14
            let bredd = (g.size.width - 32 - luft * CGFloat(n - 1)) / CGFloat(n)
            let forhallande = skal.webbram.width > 10 ? skal.webbram.height / skal.webbram.width : 1.6
            let hojd = (bredd * min(1.75, max(0.55, forhallande))).rounded()
            ScrollViewReader { rulla in
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: luft), count: n), spacing: 18) {
                        ForEach(poster) { p in
                            Flikkort(flik: p.flik, skal: skal, farger: f, hojd: hojd,
                                     aktiv: p.id == app.flikar.aktivId)
                                .id(p.id)
                                .transition(.scale(scale: 0.86).combined(with: .opacity))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 20)
                }
                .scrollIndicators(.hidden)
                .onAppear {
                    let id = app.flikar.aktivId
                    if let id { rulla.scrollTo(id, anchor: .center) }
                    // Zooma till kortet först när rutnätet har rullat dit (ramen före rullningen är fel).
                    efter(0.05) {
                        if let id, let r = skal.kortramar[id], r.width > 10 { skal.hjalteFramme(kort: r) } else { skal.hjalte = nil }
                    }
                }
            }
        }
    }

    private func tomt(_ f: Skalfarger, privat: Bool) -> some View {
        ScrollView {
            VStack(spacing: 14) {
                Illustration(namn: privat ? "Privat" : "Fel", accent: f.accent)
                    .frame(maxWidth: 230)
                    .padding(.top, 28)
                    .padding(.bottom, 6)
                Text(privat ? tr("Du surfar privat") : tr("Inga flikar"))
                    .rubrik(28, vikt: 600, tak: 40)
                    .foregroundStyle(f.text)
                    .multilineTextAlignment(.center)
                if privat {
                    Text(tr("Ingen ser vad du gör här. Ingen historik, inga kakor och inga spår när du stänger fliken — hur mycket någon än försöker kika."))
                        .grotesk(15.5, tak: 24)
                        .foregroundStyle(f.dampad)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .frame(maxWidth: 360)
                }
                Button { skal.nyFlik(privat: privat) } label: {
                    Vatsketext(text: privat ? tr("Ny privat flik") : tr("Ny flik"), ikon: privat ? .privat : .plus)
                }
                .buttonStyle(Vatskeknapp(.primar, privat: f.privat))
                .padding(.top, 10)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private func botten(_ f: Skalfarger) -> some View {
        HStack(spacing: 12) {
            Gruppvaljare(skal: skal, farger: f)
            Spacer(minLength: 4)
            Button { skal.nyFlik(privat: skal.vaxlarePrivat) } label: {
                Ikonvy(.plus, storlek: 24, streck: 2.2)
                    .frame(width: 52, height: 44)
            }
            .buttonStyle(Vatskeknapp(.primar, radie: 14, privat: f.privat))
            .accessibilityLabel(skal.vaxlarePrivat ? tr("Ny privat flik") : tr("Ny flik"))
            Button { skal.stangVaxlare() } label: {
                Text(tr("Klar"))
                    .grotesk(16, vikt: 650, tak: 24)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
            }
            .buttonStyle(Vatskeknapp(.lank, radie: 12, privat: f.privat))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background {
            f.rad.ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) { f.linje.frame(height: 0.5) }
        }
    }
}

/// En flik i en lista (Identifiable för ForEach).
struct Flikpost: Identifiable {
    let id: UUID
    let flik: any Flik

    @MainActor
    init(flik: any Flik) {
        self.flik = flik
        self.id = flik.id
    }
}

/// Växlaren mellan vanliga och privata flikar: en kapsel med en tumme som glider.
struct Gruppvaljare: View {
    let skal: SkalLage
    let farger: Skalfarger
    @Namespace private var ns
    @Environment(\.accessibilityReduceMotion) private var minska

    var body: some View {
        HStack(spacing: 2) {
            knapp(privat: false, text: tr("Flikar"), ikon: .flikar)
            knapp(privat: true, text: tr("Privat"), ikon: .privat)
        }
        .padding(3)
        .background(Capsule().fill(farger.dampad.opacity(0.13)))
    }

    private func knapp(privat: Bool, text: String, ikon: Ikon) -> some View {
        let vald = skal.vaxlarePrivat == privat
        let antal = skal.flikar(privat: privat).count
        return Button {
            guard !vald else { return }
            Haptik.val()
            withAnimation(Rorelse.val(Rorelse.snabbFjader, minska)) { skal.vaxlarePrivat = privat }
        } label: {
            HStack(spacing: 6) {
                Ikonvy(ikon, storlek: 16, streck: 2)
                Text(text)
                    .grotesk(14.5, vikt: 620, tak: 20)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if antal > 0 {
                    Text(antal.formatted())
                        .font(Font(Typsnitt.familjen(12, vikt: 700)).monospacedDigit())
                        .opacity(0.7)
                }
            }
            .foregroundStyle(vald ? farger.text : farger.dampad)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background {
                if vald {
                    Capsule().fill(farger.falt)
                        .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
                        .matchedGeometryEffect(id: "tumme", in: ns)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(vald ? .isSelected : [])
    }
}

/// Ett kort i flikväxlaren.
struct Flikkort: View {
    let flik: any Flik
    let skal: SkalLage
    let farger: Skalfarger
    let hojd: CGFloat
    let aktiv: Bool

    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var dx: CGFloat = 0
    @State private var riktning: Int = 0   // 0 = ingen, 1 = sidled, 2 = höjdled

    var body: some View {
        let radie: CGFloat = 16
        let form = RoundedRectangle(cornerRadius: radie, style: .continuous)
        let flygande = skal.hjalte?.flik == flik.id
        VStack(spacing: 0) {
            miniatyr
                .frame(height: hojd)
                .frame(maxWidth: .infinity)
                .clipped()
                .opacity(flygande ? 0 : 1)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
                    skal.kortramar[flik.id] = r
                }
            etikett
        }
        .background(farger.falt)
        .clipShape(form)
        .overlay {
            form.strokeBorder(aktiv ? farger.accent : farger.linje, lineWidth: aktiv ? 2.5 : 1)
        }
        .overlay(alignment: .topTrailing) { stangknapp }
        .shadow(color: .black.opacity(farger.privat ? 0.25 : 0.07), radius: 8, y: 3)
        .offset(x: dx)
        .opacity(1 - min(0.7, Double(abs(dx)) / 320))
        .contentShape(form)
        .onTapGesture { skal.stangVaxlare(valj: flik.id) }
        .simultaneousGesture(svep)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(titel)
        .accessibilityAddTraits(aktiv ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction(named: tr("Stäng flik")) { stang() }
    }

    private var titel: String {
        if arTomAdress(flik.url) { return tr("Ny flik") }
        return flik.titel.isEmpty ? domanFor(flik.url) : flik.titel
    }

    @ViewBuilder private var miniatyr: some View {
        if let bild = skal.miniatyrer[flik.id], !arTomAdress(flik.url) {
            // Bilden ligger i ett överlägg så att den aldrig gör kortet bredare (t.ex. liggande bilder).
            Color.clear
                .overlay(alignment: .topLeading) {
                    Image(uiImage: bild)
                        .resizable()
                        .scaledToFill()
                }
        } else {
            ZStack {
                farger.sida
                if arTomAdress(flik.url) {
                    Image("SkalGorilla").resizable().interpolation(.high)
                        .frame(width: 44, height: 44)
                        .opacity(0.9)
                } else {
                    VStack(spacing: 8) {
                        Monogram(doman: domanFor(flik.url), storlek: 40)
                        Text(domanFor(flik.url))
                            .grotesk(12, vikt: 560, tak: 16)
                            .foregroundStyle(farger.dampad)
                            .lineLimit(1)
                            .padding(.horizontal, 8)
                    }
                }
            }
        }
    }

    private var etikett: some View {
        HStack(spacing: 7) {
            if arTomAdress(flik.url) {
                Ikonvy(flik.privat ? .privat : .plus, storlek: 14, streck: 2).foregroundStyle(farger.dampad)
            } else {
                Monogram(doman: domanFor(flik.url), storlek: 16)
            }
            Text(titel)
                .grotesk(12.5, vikt: aktiv ? 650 : 560, tak: 18)
                .foregroundStyle(aktiv ? farger.accentText : farger.text)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 9)
        .frame(height: 32)
        .overlay(alignment: .top) { farger.linje.frame(height: 0.5) }
    }

    private var stangknapp: some View {
        Button { stang() } label: {
            ZStack {
                Circle().fill(Color.black.opacity(0.48))
                Ikonvy(.stang, storlek: 11, streck: 2.8).foregroundStyle(.white)
            }
            .frame(width: 24, height: 24)
            .frame(width: 40, height: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(Tryckstil(skala: 0.85))
        .accessibilityLabel(tr("Stäng flik"))
    }

    private var svep: some Gesture {
        DragGesture(minimumDistance: 16)
            .onChanged { g in
                if riktning == 0 { riktning = abs(g.translation.width) > abs(g.translation.height) * 1.3 ? 1 : 2 }
                guard riktning == 1 else { return }
                dx = g.translation.width
            }
            .onEnded { g in
                defer { riktning = 0 }
                guard riktning == 1 else { return }
                if abs(dx) > 110 || abs(g.predictedEndTranslation.width) > 280 {
                    let ut: CGFloat = dx < 0 ? -520 : 520
                    withAnimation(Rorelse.val(.easeIn(duration: 0.2), minska)) { dx = ut }
                    efter(0.18) { stang() }
                } else {
                    withAnimation(Rorelse.val(Rorelse.snabbFjader, minska)) { dx = 0 }
                }
            }
    }

    private func stang() {
        withAnimation(Rorelse.val(Rorelse.fjader, minska)) { skal.stang(flik.id) }
    }
}

/// Zoomen mellan sidan och kortet: bara skala och förflyttning av en bild av sidan.
struct Hjaltevy: View {
    let hjalte: Hjalte

    var body: some View {
        GeometryReader { g in
            let o = g.frame(in: .global).origin
            let a = hjalte.fran.offsetBy(dx: -o.x, dy: -o.y)
            let b = hjalte.till.offsetBy(dx: -o.x, dy: -o.y)
            let m = hjalte.framme ? b : a
            let sx = m.width / max(1, a.width), sy = m.height / max(1, a.height)
            let kortRadie: CGFloat = 16
            // Hörnet räknas före skalningen.
            let radie: CGFloat = {
                switch hjalte.mot {
                case .kort: return hjalte.framme ? kortRadie / max(0.05, sx) : 0
                case .sida: return hjalte.framme ? 0 : kortRadie
                }
            }()
            Image(uiImage: hjalte.bild)
                .resizable()
                .frame(width: a.width, height: a.height)
                .clipShape(RoundedRectangle(cornerRadius: radie, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 14 / max(0.2, sx), y: 4)
                .scaleEffect(x: sx, y: sy, anchor: .topLeading)
                .offset(x: m.minX - a.minX, y: m.minY - a.minY)
                .position(x: a.midX, y: a.midY)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// En av sajtens figurer: basen (ljus och mörk variant) och accentlagret färgat med temats accent.
struct Illustration: View {
    let namn: String
    let accent: Color

    var body: some View {
        ZStack {
            Image("SkalIllu\(namn)").resizable().scaledToFit()
            Image("SkalIllu\(namn)Accent").resizable().renderingMode(.template).scaledToFit()
                .foregroundStyle(accent)
        }
        .accessibilityHidden(true)
    }
}
