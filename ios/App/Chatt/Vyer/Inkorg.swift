import SwiftUI

/// Inkorgen (som TikToks): stora avatarer, namn, statusrad ("Skickat för 55 min sedan", "Sett", "Skriver…",
/// "Aktiv nu"), orange bricka för olästa, fästa chattar överst, svep för fäst, ljud av och ta bort.
struct ChattInkorg: View {
    let lage: ChattLage
    let oppna: (KonvId) -> Void
    @Environment(Tema.self) private var tema
    @State private var sok = ""
    @State private var ny = false
    @State private var bekrafta: ChattLage.Rad?
    @FocusState private var sokfokus: Bool

    private var rader: [ChattLage.Rad] {
        let alla = lage.rader
        let s = sok.trimmingCharacters(in: .whitespaces).lowercased()
        return s.isEmpty ? alla : alla.filter { $0.namn.lowercased().contains(s) }
    }

    var body: some View {
        List {
            Section {
                rubrik.listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 4, trailing: 14))
                sokfalt.listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 10, trailing: 20))
                if !lage.inkommande.isEmpty && sok.isEmpty {
                    ChattForfragningar(lage: lage).listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 12, trailing: 20))
                }
                let aktiva = lage.kontakter.filter { $0.online == true }
                if !aktiva.isEmpty && sok.isEmpty {
                    ChattAktivaNu(personer: aktiva) { oppna(KonvId(sort: .dm, id: $0.id)) }
                        .listRowInsets(EdgeInsets(top: 2, leading: 0, bottom: 8, trailing: 0))
                }
            }
            .listRowBackground(tema.bakgrund)
            .listRowSeparator(.hidden)

            if lage.listanLaddad && rader.isEmpty && sok.isEmpty {
                ChattFigurskarm(figur: "ChattFigurVila", rubrik: ct("Inga chattar än"),
                           text: ct("Lägg till en vän med användarnamnet, eller starta en grupp."),
                           knapp: ct("Lägg till vän")) { ny = true }
                    .frame(minHeight: 460)
                    .listRowBackground(tema.bakgrund).listRowSeparator(.hidden)
            } else if !lage.listanLaddad {
                ForEach(0..<6, id: \.self) { i in ChattSkelettrad().opacity(1 - Double(i) * 0.14) }
                    .listRowBackground(tema.bakgrund).listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
            }

            ForEach(rader) { rad in
                Button { oppna(rad.konv) } label: { ChattInkorgsrad(rad: rad, lage: lage) }
                    .buttonStyle(ChattRadtryck())
                    .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                    .listRowBackground(tema.bakgrund)
                    .listRowSeparator(.hidden)
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        let olast = (rad.sammanfattning?.olasta ?? 0) > 0 || rad.markeradOlast
                        Button { ChattHaptik.val(); Task { await lage.vaxlaLast(rad.konv) } } label: {
                            Label(olast ? ct("Läst") : ct("Oläst"), systemImage: olast ? "envelope.open.fill" : "envelope.badge.fill")
                        }
                        .tint(Color(uiColor: UIColor(hex: "#3d6f8f", alfa: 1)))
                        Button { ChattHaptik.val(); lage.installningar.vaxlaFast(rad.konv) } label: {
                            Label(rad.fast ? ct("Lossa") : ct("Fäst"), systemImage: rad.fast ? "pin.slash.fill" : "pin.fill")
                        }
                        .tint(tema.accent)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) { bekrafta = rad } label: {
                            Label(rad.konv.sort == .grupp ? ct("Lämna") : ct("Ta bort"), systemImage: rad.konv.sort == .grupp ? "rectangle.portrait.and.arrow.right" : "trash")
                        }
                        .tint(tema[.fara])
                        Button { ChattHaptik.val(); lage.installningar.tysta(rad.konv, i: rad.tyst ? nil : 0) } label: {
                            Label(rad.tyst ? ct("Ljud på") : ct("Ljud av"), systemImage: rad.tyst ? "bell.fill" : "bell.slash.fill")
                        }
                        .tint(Color(uiColor: UIColor(hex: "#6b6962", alfa: 1)))
                    }
                    .accessibilityIdentifier("chatt.rad.\(rad.namn)")
            }
            Color.clear.frame(height: 30).listRowBackground(tema.bakgrund).listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(tema.bakgrund)
        .environment(\.defaultMinListRowHeight, 1)
        .refreshable { await lage.uppdateraListan() }
        .onChange(of: lage.provSkarm) { _, skarm in ny = skarm == "ny" }
        .sheet(isPresented: $ny) { NyChatt(lage: lage) { k in ny = false; oppna(k) }.chattArk() }
        .confirmationDialog(bekraftaRubrik, isPresented: Binding(get: { bekrafta != nil }, set: { if !$0 { bekrafta = nil } }), titleVisibility: .visible) {
            if let rad = bekrafta {
                Button(rad.konv.sort == .grupp ? ct("Lämna gruppen") : ct("Ta bort vän"), role: .destructive) {
                    Task {
                        if rad.konv.sort == .grupp { _ = await lage.lamna(rad.konv.id) }
                        else if let p = lage.person(rad.konv.id) {
                            try? await lage.lager.taBortKontakt(p.anvandarnamn)
                            await lage.uppdateraListan()
                        }
                    }
                }
                Button(ct("Avbryt"), role: .cancel) {}
            }
        }
    }

    private var bekraftaRubrik: String {
        guard let r = bekrafta else { return "" }
        return r.konv.sort == .grupp ? ct("Lämna {namn}?", ["namn": r.namn]) : ct("Ta bort {namn} som vän?", ["namn": r.namn])
    }

    private var rubrik: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(ct("Chatt")).font(Typsnitt.rubrik(34, vikt: 620)).foregroundStyle(tema.text)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button { ny = true } label: {
                Image(systemName: "square.and.pencil").font(.system(size: 17, weight: .semibold)).frame(width: 40, height: 40)
            }
            .buttonStyle(ChattKnapp(.ikon))
            .accessibilityLabel(ct("Nytt meddelande"))
            ChattStang()
        }
    }

    private var sokfalt: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(tema[.svag])
            TextField("", text: $sok, prompt: Text(ct("Sök")).foregroundColor(tema[.svag]))
                .font(Typsnitt.grotesk(16.5, relativTill: .body))
                .focused($sokfokus)
                .submitLabel(.search)
            if !sok.isEmpty {
                Button { sok = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(tema[.svag]) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).frame(height: 42)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(tema[.yta2]))
    }
}

/// En rad: avatar 60 pt, namn, statusrad, tid och bricka. Cirka 76 pt hög.
struct ChattInkorgsrad: View {
    let rad: ChattLage.Rad
    let lage: ChattLage
    @Environment(Tema.self) private var tema

    private var olasta: Int { rad.sammanfattning?.olasta ?? 0 }
    /// Olästa eller markerad som oläst: fet text och orange tid.
    private var framhavd: Bool { olasta > 0 || rad.markeradOlast }

    var body: some View {
        HStack(spacing: 14) {
            if rad.konv.sort == .grupp {
                ChattGruppavatar(namn: rad.namn, bild: rad.bild, medlemmar: rad.medlemmar, storlek: 60)
            } else {
                ChattAvatarMedNarvaro(namn: rad.namn, bild: rad.bild, storlek: 60, online: rad.online)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(rad.namn).font(Typsnitt.grotesk(16.5, vikt: framhavd ? 700 : 600, relativTill: .headline))
                        .foregroundStyle(tema.text).lineLimit(1)
                    if rad.tyst {
                        Image(systemName: "bell.slash.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(tema[.svag])
                    }
                    Spacer(minLength: 6)
                    if let t = rad.tid {
                        Text(ChattTid.kort(t)).font(Typsnitt.grotesk(13, vikt: framhavd ? 600 : 400, relativTill: .footnote))
                            .monospacedDigit()
                            .foregroundStyle(framhavd ? tema[.accentText] : tema[.svag])
                    }
                }
                HStack(spacing: 8) {
                    status.lineLimit(1)
                    Spacer(minLength: 4)
                    if rad.fast {
                        Image(systemName: "pin.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(tema[.svag])
                            .rotationEffect(.degrees(40))
                    }
                    if olasta > 0 {
                        Text(olasta > 99 ? "99+" : String(olasta))
                            .font(Typsnitt.grotesk(12.5, vikt: 700, relativTill: .caption1)).monospacedDigit()
                            .foregroundStyle(tema[.paAccent])
                            .padding(.horizontal, 6.5).frame(minWidth: 21, minHeight: 21)
                            .background(Capsule().fill(tema.accent))
                            .transition(.scale.combined(with: .opacity))
                    } else if rad.markeradOlast {
                        Circle().fill(tema.accent).frame(width: 12, height: 12)
                            .transition(.scale.combined(with: .opacity))
                            .accessibilityLabel(ct("Oläst"))
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 76)
        .contentShape(Rectangle())
        .animation(ChattRorelse.snabb, value: olasta)
        .animation(ChattRorelse.snabb, value: rad.markeradOlast)
    }

    private var status: some View {
        let st = Self.status(for: rad)
        return HStack(spacing: 5) {
            if st.oga { Image(systemName: "eye").font(.system(size: 11, weight: .semibold)) }
            Text(st.text)
        }
        .font(Typsnitt.grotesk(14.5, vikt: st.ton == .dampad ? 400 : 600, relativTill: .subheadline))
        .foregroundStyle(st.ton == .accent ? tema[.accentText] : st.ton == .stark ? tema.text : tema.dampad)
    }

    /// Statusraden som text, så att självtestet kan kontrollera den.
    struct Radstatus: Equatable {
        enum Ton { case accent, stark, dampad }
        let text: String
        let ton: Ton
        var oga = false
    }

    static func status(for rad: ChattLage.Rad, nu: Date = Date()) -> Radstatus {
        let s = rad.sammanfattning
        let olasta = s?.olasta ?? 0
        let grupp = rad.konv.sort == .grupp
        if let skriver = s?.skriver, !skriver.isEmpty {
            return Radstatus(text: grupp && skriver[0] != "*" ? ct("{namn} skriver…", ["namn": skriver[0]]) : ct("Skriver…"), ton: .accent)
        }
        if let m = s?.senaste, olasta > 0 { return Radstatus(text: forhand(m, grupp: grupp), ton: .stark) }
        if let m = s?.senaste, m.mitt {
            if !grupp, let l = s?.lastTill, l >= m.tid.addingTimeInterval(-1) { return Radstatus(text: ct("Sett"), ton: .dampad, oga: true) }
            return Radstatus(text: ChattTid.skickat(m.tid, nu: nu), ton: .dampad)
        }
        if rad.online { return Radstatus(text: ct("Aktiv nu"), ton: .accent) }
        if let m = s?.senaste { return Radstatus(text: forhand(m, grupp: grupp), ton: .dampad) }
        if let a = ChattTid.aktiv(nil, rad.sedd, nu: nu) { return Radstatus(text: a, ton: .dampad) }
        return Radstatus(text: grupp ? ct("Säg hej till gruppen") : ct("Säg hej 👋"), ton: .dampad)
    }

    static func forhand(_ m: ChattMeddelande, grupp: Bool) -> String {
        var t: String
        switch m.innehall {
        case .bild(let i, let text): t = text.isEmpty ? (i.klistermarke ? ct("Klistermärke") : "📷 " + ct("Bild")) : "📷 " + text
        case .video(_, let text): t = text.isEmpty ? "🎬 " + ct("Video") : "🎬 " + text
        case .olasbar: t = ct("Kunde inte läsa meddelandet")
        default: t = m.text
        }
        t = t.replacingOccurrences(of: "\n", with: " ")
        if m.mitt { return ct("Du: {text}", ["text": t]) }
        return grupp ? "\(m.franNamn): \(t)" : t
    }
}

/// Tryck på en rad: en svag yta bakom, som iOS-listor.
struct ChattRadtryck: ButtonStyle {
    @Environment(Tema.self) private var tema
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(tema[.yta2]).padding(.horizontal, -10)
                .opacity(configuration.isPressed ? 1 : 0))
            .animation(.easeOut(duration: configuration.isPressed ? 0.05 : 0.25), value: configuration.isPressed)
    }
}

struct ChattSkelettrad: View {
    @Environment(Tema.self) private var tema
    var body: some View {
        HStack(spacing: 14) {
            Circle().fill(tema[.yta2]).frame(width: 60, height: 60)
            VStack(alignment: .leading, spacing: 9) {
                Capsule().fill(tema[.yta2]).frame(width: 120, height: 13)
                Capsule().fill(tema[.yta2]).frame(width: 190, height: 11)
            }
            Spacer()
        }
        .frame(height: 76)
    }
}

/// Vänner som är aktiva just nu, i en vågrät rad överst.
struct ChattAktivaNu: View {
    let personer: [ChattPerson]
    let valj: (ChattPerson) -> Void
    @Environment(Tema.self) private var tema
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(personer) { p in
                    Button { valj(p) } label: {
                        VStack(spacing: 6) {
                            ChattAvatarMedNarvaro(namn: p.anvandarnamn, bild: p.avatar, storlek: 58, online: true)
                            Text(p.anvandarnamn).font(Typsnitt.grotesk(12.5, vikt: 500, relativTill: .caption1))
                                .foregroundStyle(tema.dampad).lineLimit(1).frame(maxWidth: 66)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

/// Vänförfrågningar som väntar på svar.
struct ChattForfragningar: View {
    let lage: ChattLage
    @Environment(Tema.self) private var tema
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(ct("Vänförfrågningar")).font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote))
                .textCase(.uppercase).tracking(0.8).foregroundStyle(tema.dampad)
            ForEach(lage.inkommande) { p in
                HStack(spacing: 10) {
                    ChattAvatar(namn: p.anvandarnamn, bild: p.avatar, storlek: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.anvandarnamn).font(Typsnitt.grotesk(15.5, vikt: 600, relativTill: .headline)).foregroundStyle(tema.text)
                        Text(ct("Vill bli din vän")).font(Typsnitt.grotesk(13.5, relativTill: .footnote)).foregroundStyle(tema.dampad)
                    }
                    .lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 4)
                    Button { Task { await lage.svaraForfragan(p, ja: false) } } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).frame(width: 34, height: 34)
                    }
                    .buttonStyle(ChattKnapp(.ikon))
                    .accessibilityLabel(ct("Avböj"))
                    Button { Task { await lage.svaraForfragan(p, ja: true) } } label: {
                        Text(ct("Acceptera")).font(Typsnitt.grotesk(14.5, vikt: 650, relativTill: .subheadline))
                            .lineLimit(1).fixedSize()
                            .padding(.horizontal, 13).frame(height: 36)
                    }
                    .buttonStyle(ChattKnapp(.primar))
                    .layoutPriority(1)
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema.yta))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
    }
}
