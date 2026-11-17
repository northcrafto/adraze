import SwiftUI
import UIKit

/// Arken som glider upp nerifrån: bokmärken, historik, nedladdningar och skyddet för sidan.
///
/// Ägare: Skal.
struct Arkvy: View {
    let ark: Ark
    let skal: SkalLage

    @Environment(Tema.self) private var tema

    var body: some View {
        let f = Skalfarger(tema, privat: skal.arPrivat)
        Group {
            switch ark {
            case .bokmarken: Bokmarkesark(skal: skal, farger: f)
            case .historik: Historikark(skal: skal, farger: f)
            case .nedladdningar: Nedladdningsark(skal: skal, farger: f)
            case .skydd: Skyddsark(skal: skal, farger: f)
            }
        }
        .presentationDetents(ark == .skydd ? [.medium] : [.medium, .large])
        .adrazeArk()
        .presentationBackground(f.sida)
    }
}

/// Rubriken överst i ett ark: Fraunces och ett kryss, i samma storlek och form som i appens andra ark
/// (`AdrazeArk`, `Stangknapp`), med skalets färger (också de privata).
struct Arkhuvud: View {
    let titel: String
    let farger: Skalfarger
    var hoger: AnyView?
    let stang: () -> Void
    @Environment(Tema.self) private var tema

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(titel)
                .rubrik(AdrazeArk.rubrikstorlek, vikt: AdrazeArk.rubrikvikt, tak: 44)
                .foregroundStyle(farger.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 8)
            if let hoger { hoger }
            Button { stang() } label: {
                Ikonvy(.stang, storlek: 16, streck: 2.2)
                    .frame(width: Stangknapp.storlek, height: Stangknapp.storlek)
                    .background(Circle().fill(farger.privat ? farger.text.opacity(0.08) : tema[.yta2]))
            }
            .buttonStyle(Vatskeknapp(.ikon, radie: Stangknapp.storlek / 2, privat: farger.privat))
            .accessibilityLabel(tr("Stäng"))
        }
        .padding(.leading, 20)
        .padding(.trailing, AdrazeArk.marginal)
        .padding(.top, 20)
        .padding(.bottom, 8)
    }
}

/// Tomt läge med en av sajtens figurer.
struct Tomvy: View {
    let illustration: String
    let titel: String
    let text: String
    let farger: Skalfarger

    var body: some View {
        VStack(spacing: 10) {
            Illustration(namn: illustration, accent: farger.accent)
                .frame(maxWidth: 220, maxHeight: 150)
                .padding(.bottom, 10)
            Text(titel)
                .rubrik(22, vikt: 600, tak: 32)
                .foregroundStyle(farger.text)
                .multilineTextAlignment(.center)
            Text(text)
                .grotesk(14.5, tak: 22)
                .foregroundStyle(farger.dampad)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
    }
}

/// En rad med en sajt: monogram, titel och adress.
struct Sajtrad: View {
    let url: String
    let titel: String
    var favikon: UIImage?
    var hoger: String?
    let farger: Skalfarger

    var body: some View {
        let u = URL(string: url)
        HStack(spacing: 12) {
            Sajtikon(bild: favikon, doman: domanFor(u), storlek: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(titel.isEmpty ? domanFor(u) : titel)
                    .grotesk(15, vikt: 580, tak: 22)
                    .foregroundStyle(farger.text)
                    .lineLimit(1)
                Text(utanSchema(url))
                    .grotesk(12.5, tak: 18)
                    .foregroundStyle(farger.dampad)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            if let hoger {
                Text(hoger)
                    .font(Font(Typsnitt.familjen(12, vikt: 500)).monospacedDigit())
                    .foregroundStyle(farger.svag)
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

struct Bokmarkesark: View {
    let skal: SkalLage
    let farger: Skalfarger

    var body: some View {
        VStack(spacing: 0) {
            Arkhuvud(titel: tr("Bokmärken"), farger: farger) { skal.ark = nil }
            if skal.bibliotek.bokmarken.isEmpty {
                ScrollView {
                    Tomvy(illustration: "Bokmarken", titel: tr("Inga bokmärken än"),
                          text: tr("Tryck på stjärnan i menyn för att spara sidan du är på."), farger: farger)
                }
                .scrollBounceBehavior(.basedOnSize)
            } else {
                List {
                    ForEach(skal.bibliotek.bokmarken) { b in
                        Button { if let u = URL(string: b.url) { skal.ga(till: u) } } label: {
                            Sajtrad(url: b.url, titel: b.titel, favikon: skal.bibliotek.favikon(b.favikon), farger: farger)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(farger.linje)
                        .swipeActions {
                            Button(role: .destructive) { skal.bibliotek.taBortBokmarke(b.url) } label: { Text(tr("Ta bort")) }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }
}

struct Historikark: View {
    let skal: SkalLage
    let farger: Skalfarger
    @State private var sok = ""
    @State private var fragaRensa = false

    var body: some View {
        let alla = skal.bibliotek.historik
        let q = sok.trimmingCharacters(in: .whitespaces).lowercased()
        let lista = q.isEmpty ? Array(alla.prefix(400)) : alla.filter { $0.url.lowercased().contains(q) || $0.titel.lowercased().contains(q) }
        let grupper = Self.gruppera(lista)
        VStack(spacing: 0) {
            Arkhuvud(titel: tr("Historik"), farger: farger,
                     hoger: alla.isEmpty || !skal.bibliotek.kanRensaHistorik ? nil : AnyView(rensaKnapp)) { skal.ark = nil }
            if alla.isEmpty {
                ScrollView {
                    Tomvy(illustration: "Historik", titel: tr("Ingen historik än"),
                          text: tr("Sidor du besöker i vanliga flikar hamnar här. Privata flikar sparas aldrig."), farger: farger)
                }
                .scrollBounceBehavior(.basedOnSize)
            } else {
                sokfalt
                List {
                    ForEach(grupper) { grupp in
                        Section {
                            ForEach(grupp.poster) { b in
                                Button { if let u = URL(string: b.url) { skal.ga(till: u) } } label: {
                                    Sajtrad(url: b.url, titel: b.titel, favikon: skal.bibliotek.favikon(b.favikon), hoger: b.senast.formatted(.dateTime.hour().minute().locale(Locale(identifier: Sprak.delad.kod))), farger: farger)
                                }
                                .buttonStyle(.plain)
                                .listRowBackground(Color.clear)
                                .listRowSeparatorTint(farger.linje)
                                .swipeActions {
                                    Button(role: .destructive) { skal.bibliotek.taBortHistorik(b.url) } label: { Text(tr("Ta bort")) }
                                }
                            }
                        } header: {
                            Text(grupp.id)
                                .grotesk(12, vikt: 650, tak: 17)
                                .textCase(.uppercase)
                                .tracking(0.7)
                                .foregroundStyle(farger.dampad)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .confirmationDialog(tr("Rensa historiken?"), isPresented: $fragaRensa, titleVisibility: .visible) {
            Button(tr("Rensa historik"), role: .destructive) { skal.bibliotek.rensaHistorik() }
            Button(tr("Avbryt"), role: .cancel) {}
        }
    }

    private var rensaKnapp: some View {
        Button { fragaRensa = true } label: {
            Text(tr("Rensa"))
                .grotesk(15, vikt: 600, tak: 22)
                .padding(.horizontal, 10)
                .frame(minHeight: 36)
        }
        .buttonStyle(Vatskeknapp(.lank, radie: 10, privat: farger.privat))
    }

    private var sokfalt: some View {
        HStack(spacing: 8) {
            Ikonvy(.sok, storlek: 17, streck: 2).foregroundStyle(farger.dampad)
            TextField(tr("Sök i historiken"), text: $sok)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .grotesk(16, tak: 24)
                .foregroundStyle(farger.text)
        }
        .padding(.horizontal, 12)
        .frame(height: 42)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(farger.falt))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(farger.faltlinje))
        .padding(.horizontal, 20)
        .padding(.bottom, 6)
    }

    struct Dagsgrupp: Identifiable {
        let id: String
        let poster: [Sidpost]
    }

    /// Idag, igår, sedan veckodag och datum.
    @MainActor
    static func gruppera(_ poster: [Sidpost]) -> [Dagsgrupp] {
        let kal = Calendar.current
        var ordning: [String] = []
        var grupper: [String: [Sidpost]] = [:]
        let sprak = Locale(identifier: Sprak.delad.kod)
        for b in poster {
            let namn: String
            if kal.isDateInToday(b.senast) { namn = tr("Idag") }
            else if kal.isDateInYesterday(b.senast) { namn = tr("Igår") }
            else { namn = b.senast.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(sprak)) }
            if grupper[namn] == nil { ordning.append(namn) }
            grupper[namn, default: []].append(b)
        }
        return ordning.map { Dagsgrupp(id: $0, poster: grupper[$0] ?? []) }
    }
}

struct Nedladdningsark: View {
    let skal: SkalLage
    let farger: Skalfarger

    var body: some View {
        let poster = skal.bibliotek.nedladdningar
        VStack(spacing: 0) {
            Arkhuvud(titel: tr("Nedladdningar"), farger: farger) { skal.ark = nil }
            if poster.isEmpty {
                ScrollView {
                    VStack(spacing: 4) {
                        Tomvy(illustration: "Nedladdningar", titel: tr("Inga nedladdningar än"),
                              text: tr("Filer du laddar ner hamnar här och i appen Filer."), farger: farger)
                        filknapp
                    }
                    .padding(.bottom, 30)
                }
                .scrollBounceBehavior(.basedOnSize)
            } else {
                List {
                    ForEach(poster) { p in
                        Nedladdningsrad(post: p, skal: skal, farger: farger)
                            .listRowBackground(Color.clear)
                            .listRowSeparatorTint(farger.linje)
                            .swipeActions {
                                Button(role: .destructive) { skal.bibliotek.taBortNedladdning(p.id) } label: { Text(tr("Ta bort")) }
                            }
                            .swipeActions(edge: .leading) {
                                if p.lage == .klar {
                                    Button { skal.bibliotek.delaNedladdning(p.id) } label: { Text(tr("Dela")) }
                                        .tint(farger.accent)
                                }
                            }
                    }
                    filknapp
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .padding(.top, 10)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var filknapp: some View {
        Button { Self.oppnaFiler() } label: {
            Vatsketext(text: tr("Visa i Filer"), ikon: .nedladdning, vikt: 600)
        }
        .buttonStyle(Vatskeknapp(.sekundar, privat: farger.privat))
    }

    /// Öppnar appens mapp i Filer (otestat i simulatorn).
    static func oppnaFiler() {
        let dok = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        guard let u = URL(string: "shareddocuments://" + dok.path) else { return }
        UIApplication.shared.open(u)
    }
}

/// En nedladdning: filnamnet, storleken eller förloppet, och en knapp för att pausa, fortsätta eller öppna.
struct Nedladdningsrad: View {
    let post: Nedladdningspost
    let skal: SkalLage
    let farger: Skalfarger

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(farger.accentMjuk)
                Ikonvy(.nedladdning, storlek: 17, streck: 2).foregroundStyle(farger.accentText)
            }
            .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 4) {
                Text(post.filnamn)
                    .grotesk(15, vikt: 580, tak: 22)
                    .foregroundStyle(farger.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if post.lage == .pagar {
                    GeometryReader { g in
                        Capsule().fill(farger.linje)
                            .overlay(alignment: .leading) {
                                Capsule().fill(farger.accent).frame(width: max(6, g.size.width * (post.andel ?? 0.08)))
                            }
                    }
                    .frame(height: 4)
                }
                Text(detalj)
                    .font(Font(Typsnitt.familjen(12.5, vikt: 480)).monospacedDigit())
                    .foregroundStyle(post.lage == .misslyckad ? Color.hex("#d64b45") : farger.dampad)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            knapp
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .onTapGesture { if post.lage == .klar { skal.bibliotek.oppnaNedladdning(post.id) } }
    }

    private var detalj: String {
        let f = ByteCountFormatter()
        f.countStyle = .file
        switch post.lage {
        case .pagar:
            let m = f.string(fromByteCount: post.mottaget)
            return post.totalt > 0 ? tr("{a} av {b}", ["a": m, "b": f.string(fromByteCount: post.totalt)]) : m
        case .pausad: return tr("Pausad")
        case .klar: return f.string(fromByteCount: max(post.mottaget, post.totalt))
        case .avbruten: return tr("Avbruten")
        case .misslyckad: return post.fel ?? tr("Misslyckades")
        }
    }

    @ViewBuilder private var knapp: some View {
        switch post.lage {
        case .pagar:
            Button { skal.bibliotek.avbrytNedladdning(post.id) } label: {
                Ikonvy(.stang, storlek: 15, streck: 2.2).frame(width: 36, height: 36)
            }
            .buttonStyle(Vatskeknapp(.lank, radie: 10, privat: farger.privat))
            .accessibilityLabel(tr("Avbryt"))
        case .pausad, .misslyckad:
            Button { skal.bibliotek.fortsattNedladdning(post.id) } label: {
                Ikonvy(.laddaOm, storlek: 16, streck: 2).frame(width: 36, height: 36)
            }
            .buttonStyle(Vatskeknapp(.lank, radie: 10, privat: farger.privat))
            .accessibilityLabel(tr("Fortsätt"))
        case .klar, .avbruten:
            EmptyView()
        }
    }
}

struct Skyddsark: View {
    let skal: SkalLage
    let farger: Skalfarger
    @Environment(AppMiljo.self) private var app

    var body: some View {
        let flik = skal.aktiv
        let vard = flik?.url?.host(percentEncoded: false) ?? ""
        let antal = skal.provBlockerade ?? flik.flatMap { app.skydd.antalBlockerade(i: $0.id) }
        let pausat = !vard.isEmpty && app.skydd.arPausat(for: vard)
        VStack(spacing: 0) {
            Arkhuvud(titel: tr("Skydd"), farger: farger) { skal.ark = nil }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .center, spacing: 16) {
                        Image("SkalGorilla").resizable().interpolation(.high).frame(width: 58, height: 58)
                        VStack(alignment: .leading, spacing: 2) {
                            Text((antal ?? 0).formatted())
                                .rubrik(44, vikt: 640, tak: 56)
                                .foregroundStyle(farger.text)
                                .contentTransition(.numericText())
                            Text(trAntal(antal ?? 0, en: "annons eller spårare stoppad", flera: "annonser och spårare stoppade"))
                                .grotesk(14.5, vikt: 560, tak: 22)
                                .foregroundStyle(farger.dampad)
                        }
                    }
                    if !vard.isEmpty {
                        Toggle(isOn: Binding(get: { !pausat }, set: { pa in
                            app.skydd.pausa(!pa, for: vard)
                            Haptik.val()
                            skal.aktiv?.laddaOm()
                        })) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tr("Skydda {x}", ["x": domanFor(flik?.url)]))
                                    .grotesk(15.5, vikt: 600, tak: 22)
                                    .foregroundStyle(farger.text)
                                Text(tr("Stäng av om sajten inte fungerar. Sidan laddas om."))
                                    .grotesk(13, tak: 19)
                                    .foregroundStyle(farger.dampad)
                            }
                        }
                        .tint(farger.accent)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(farger.falt))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(farger.linje))
                    }
                    HStack(spacing: 7) {
                        Ikonvy(.info, storlek: 15, streck: 2).foregroundStyle(farger.dampad)
                        Text(tr(app.skydd.lage.etikett))
                            .grotesk(13, tak: 19)
                            .foregroundStyle(farger.dampad)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 30)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

/// En plats som en annan modul har fyllt (Anpassa, Falk, chatten), som ark.
struct Platsvy: View {
    let plats: Platsark
    let skal: SkalLage
    @Environment(Tema.self) private var tema
    @Environment(AppMiljo.self) private var app

    var body: some View {
        let f = Skalfarger(tema, privat: false)
        Group {
            if let vy = app.platser[plats.id]?.vy {
                vy()
            } else {
                EmptyView()
            }
        }
        .presentationDetents([.large])
        .adrazeArk()
        .presentationBackground(f.sida)
    }
}
