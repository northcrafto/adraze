import SwiftUI

/// Chattinställningarna (plan 3, 4.3): ett ark från chattens rubrik. Överst avatar, namn och status och en rad
/// runda vätskeknappar. Sedan bakgrund, aviseringar och signal, fäst överst, media, medlemmar (grupper) eller
/// "skapa grupp" (en vän), och sist i rött rapportera, blockera, lämna eller ta bort.
struct ChattInfo: View {
    let lage: ChattLage
    let konv: KonvId
    let ring: () -> Void

    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var medlemmar: [ChattMedlem] = []
    @State private var laggTill = false
    @State private var nyGrupp = false
    @State private var rapport = false
    @State private var sok = false
    @State private var fraga: Fraga?
    @State private var visaBakgrund = false

    enum Fraga: Identifiable { case lamna, blockera, taBort; var id: Int { hashValue } }

    private var person: ChattPerson? { konv.sort == .dm ? lage.person(konv.id) : nil }
    private var tyst: Bool { lage.installningar.arTyst(konv) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    huvud
                    knapprad.padding(.top, 24)
                    VStack(spacing: 22) {
                        ChattInfosektion(rubrik: ct("Utseende")) {
                            Button { visaBakgrund = true } label: {
                                ChattInforad(ikon: "photo.on.rectangle", text: ct("Bakgrund"),
                                        varde: (ChattBakgrundsforval(rawValue: lage.installningar.bakgrund(konv).forval) ?? .papper).namn, pil: true)
                            }
                            .buttonStyle(ChattRadknapp())
                            .accessibilityIdentifier("chatt.info.bakgrund")
                        }
                        aviseringar
                        ChattInfosektion(rubrik: nil) {
                            Toggle(isOn: Binding(get: { lage.installningar.arFast(konv) }, set: { _ in ChattHaptik.val(); lage.installningar.vaxlaFast(konv) })) {
                                ChattInforad(ikon: "pin", text: ct("Fäst överst i listan"))
                            }
                            .tint(tema.accent).padding(.trailing, 16)
                        }
                        media
                        if konv.sort == .grupp { medlemssektion } else {
                            ChattInfosektion(rubrik: nil) {
                                Button { nyGrupp = true } label: {
                                    ChattInforad(ikon: "person.2", text: ct("Skapa grupp med {namn}", ["namn": lage.namn(konv)]), pil: true)
                                }
                                .buttonStyle(ChattRadknapp())
                            }
                        }
                        farligt
                    }
                    .padding(.top, 28)
                }
                .padding(.horizontal, 18).padding(.bottom, 44)
            }
            .background(tema.bakgrund)
            .scrollContentBackground(.hidden)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { stang() } label: { Text(ct("Klar")).font(Typsnitt.grotesk(16, vikt: 650)) }
                        .accessibilityIdentifier("chatt.info.klar")
                }
            }
            .navigationDestination(isPresented: $visaBakgrund) { ChattBakgrundsval(konv: konv, lage: lage) }
            .onAppear { if lage.provSkarm == "bakgrund" { visaBakgrund = true } }
            .sheet(isPresented: $laggTill) {
                ChattLaggTillMedlem(lage: lage, gid: konv.id, redan: Set(medlemmar.map(\.id))) { Task { await laddaMedlemmar() } }
                    .chattArk()
            }
            .sheet(isPresented: $nyGrupp) {
                NavigationStack {
                    ChattNyGrupp(lage: lage, forval: person.map { [$0] } ?? []) { k in
                        nyGrupp = false
                        stang()
                        lage.begard = k
                    }
                }
                .chattArk()
            }
            .sheet(isPresented: $rapport) {
                ChattRapportera(lage: lage, konv: konv, anvandarnamn: person?.anvandarnamn, meddelande: nil,
                           medlemmar: medlemmar.filter { $0.id != lage.jag?.id }.map(\.anvandarnamn))
                    .chattArk()
            }
            .sheet(isPresented: $sok) { ChattSokning(lage: lage, konv: konv) { id in sok = false; stang(); lage.hopp = id }.chattArk() }
            .confirmationDialog(fragetext, isPresented: Binding(get: { fraga != nil }, set: { if !$0 { fraga = nil } }), titleVisibility: .visible) {
                switch fraga {
                case .lamna: Button(ct("Lämna gruppen"), role: .destructive) { Task { if await lage.lamna(konv.id) { stang() } } }
                case .blockera: Button(ct("Blockera"), role: .destructive) { Task { await blockera() } }
                case .taBort: Button(ct("Ta bort vän"), role: .destructive) { Task { await taBort() } }
                case nil: EmptyView()
                }
                Button(ct("Avbryt"), role: .cancel) {}
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .task { await laddaMedlemmar() }
    }

    private var fragetext: String {
        switch fraga {
        case .lamna: return ct("Lämna {namn}? Du ser inte gruppen längre.", ["namn": lage.namn(konv)])
        case .blockera: return ct("Blockera {namn}? Ni kan inte skriva till varandra.", ["namn": lage.namn(konv)])
        case .taBort: return ct("Ta bort {namn} som vän?", ["namn": lage.namn(konv)])
        case nil: return ""
        }
    }

    private func laddaMedlemmar() async {
        guard konv.sort == .grupp else { return }
        if let m = try? await lage.lager.medlemmar(konv.id) { medlemmar = m.sorted { ($0.admin ? 0 : 1, $0.anvandarnamn.lowercased()) < ($1.admin ? 0 : 1, $1.anvandarnamn.lowercased()) } }
    }

    private func blockera() async {
        guard let p = person else { return }
        do { try await lage.lager.blockera(p.anvandarnamn); await lage.uppdateraListan(); stang() } catch { lage.notis = error.localizedDescription }
    }

    private func taBort() async {
        guard let p = person else { return }
        do { try await lage.lager.taBortKontakt(p.anvandarnamn); await lage.uppdateraListan(); stang() } catch { lage.notis = error.localizedDescription }
    }

    // MARK: Huvudet

    private var huvud: some View {
        VStack(spacing: 10) {
            if konv.sort == .grupp {
                ChattGruppavatar(namn: lage.namn(konv), bild: lage.grupp(konv.id)?.avatar, medlemmar: lage.medlemsnamn[konv.id] ?? [], storlek: 96)
            } else {
                ChattAvatarMedNarvaro(namn: lage.namn(konv), bild: person?.avatar, storlek: 96, online: person?.online == true)
            }
            Text(lage.namn(konv)).font(Typsnitt.rubrik(30, vikt: 600)).foregroundStyle(tema.text)
                .multilineTextAlignment(.center).padding(.top, 6)
            Text(status).font(Typsnitt.grotesk(15, vikt: person?.online == true ? 600 : 400, relativTill: .subheadline))
                .foregroundStyle(person?.online == true ? tema[.accentText] : tema.dampad)
        }
        .padding(.top, 16)
    }

    private var status: String {
        if konv.sort == .grupp { return ct("{n} medlemmar", ["n": String(lage.grupp(konv.id)?.antal ?? medlemmar.count)]) }
        guard let p = person else { return "" }
        return ChattTid.aktiv(p.online, p.senastSedd) ?? "@" + p.anvandarnamn
    }

    private var knapprad: some View {
        HStack(spacing: 0) {
            ChattRundknapp(ikon: "phone.fill", text: ct("Ring")) { stang(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { ring() } }
            ChattRundknapp(ikon: "video.fill", text: ct("Video")) { stang(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { ring() } }
            ChattRundknapp(ikon: "magnifyingglass", text: ct("Sök")) { sok = true }
            ChattRundknapp(ikon: tyst ? "bell.slash.fill" : "bell.fill", text: tyst ? ct("Ljud på") : ct("Ljud av"), vald: tyst) {
                ChattHaptik.val()
                lage.installningar.tysta(konv, i: tyst ? nil : 0)
            }
        }
    }

    // MARK: Aviseringar

    private var aviseringar: some View {
        ChattInfosektion(rubrik: ct("Aviseringar"), fot: ct("Aviseringar på telefonen kommer i ett senare steg. Valen sparas redan nu.")) {
            Toggle(isOn: Binding(get: { !tyst }, set: { pa in ChattHaptik.val(); lage.installningar.tysta(konv, i: pa ? nil : 0) })) {
                ChattInforad(ikon: "bell", text: ct("Aviseringar"))
            }
            .tint(tema.accent).padding(.trailing, 16)
            .accessibilityIdentifier("chatt.info.aviseringar")
            ChattAvdelare()
            Menu {
                Button(ct("I 1 timme")) { lage.installningar.tysta(konv, i: 3600) }
                Button(ct("I 8 timmar")) { lage.installningar.tysta(konv, i: 8 * 3600) }
                Button(ct("I 1 vecka")) { lage.installningar.tysta(konv, i: 7 * 86_400) }
                Button(ct("Tills vidare")) { lage.installningar.tysta(konv, i: 0) }
                if tyst { Button(ct("Slå på ljudet")) { lage.installningar.tysta(konv, i: nil) } }
            } label: {
                ChattInforad(ikon: "moon", text: ct("Tysta chatten"), varde: tystText, pil: true)
            }
            .buttonStyle(ChattRadknapp())
            ChattAvdelare()
            Menu {
                ForEach(ChattSignaler.alla) { s in
                    Button {
                        lage.installningar.sattSignal(konv, s.id)
                        ChattSignaler.spela(s.id)
                    } label: {
                        if lage.installningar.signal(konv) == s.id { Label(s.namn, systemImage: "checkmark") } else { Text(s.namn) }
                    }
                }
            } label: {
                ChattInforad(ikon: "music.note", text: ct("Signal"), varde: ChattSignaler.namn(lage.installningar.signal(konv)), pil: true)
            }
            .buttonStyle(ChattRadknapp())
        }
    }

    private var tystText: String {
        guard tyst, let t = lage.installningar.data.tysta[konv.nyckel] else { return ct("Nej") }
        if t == 0 { return ct("Tills vidare") }
        return ct("Till {tid}", ["tid": Date(timeIntervalSince1970: t).formatted(Date.FormatStyle(locale: ChattTid.locale).weekday(.abbreviated).hour().minute())])
    }

    // MARK: Media

    @ViewBuilder private var media: some View {
        let bilder = (lage.meddelanden[konv] ?? []).reversed().compactMap { m -> (String, ChattBildinfo)? in
            if case .bild(let i, _) = m.innehall, !i.bilaga.isEmpty { return (m.id, i) } else { return nil }
        }.prefix(12)
        if !bilder.isEmpty {
            ChattInfosektion(rubrik: ct("Media")) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 3), spacing: 3) {
                    ForEach(Array(bilder), id: \.0) { _, info in
                        Color.clear.aspectRatio(1, contentMode: .fit)
                            .overlay { ChattBildladdare(id: info.bilaga, konv: konv, lage: lage) }
                            .clipped()
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(8)
            }
        }
    }

    // MARK: Medlemmar

    private var medlemssektion: some View {
        ChattInfosektion(rubrik: ct("{n} medlemmar", ["n": String(max(medlemmar.count, lage.grupp(konv.id)?.antal ?? 0))])) {
            Button { laggTill = true } label: { ChattInforad(ikon: "person.badge.plus", text: ct("Lägg till medlemmar"), accent: true) }
                .buttonStyle(ChattRadknapp())
            ForEach(medlemmar) { m in
                ChattAvdelare()
                HStack(spacing: 12) {
                    ChattAvatarMedNarvaro(namn: m.anvandarnamn, bild: m.avatar, storlek: 40, online: m.online == true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(m.id == lage.jag?.id ? ct("{namn} (du)", ["namn": m.anvandarnamn]) : m.anvandarnamn)
                            .font(Typsnitt.grotesk(16, vikt: 600, relativTill: .body)).foregroundStyle(tema.text)
                        if let a = ChattTid.aktiv(m.online, m.senastSedd) {
                            Text(a).font(Typsnitt.grotesk(13, relativTill: .footnote)).foregroundStyle(m.online == true ? tema[.accentText] : tema.dampad)
                        }
                    }
                    Spacer()
                    if m.admin {
                        Text(ct("Admin")).font(Typsnitt.grotesk(12, vikt: 650, relativTill: .caption1)).foregroundStyle(tema[.accentText])
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(Capsule().fill(tema[.accentMjuk]))
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
            }
        }
    }

    // MARK: Farligt

    private var farligt: some View {
        ChattInfosektion(rubrik: nil) {
            Button { rapport = true } label: { ChattInforad(ikon: "exclamationmark.bubble", text: ct("Rapportera"), fara: true) }
                .buttonStyle(ChattRadknapp())
            if konv.sort == .dm {
                ChattAvdelare()
                Button { fraga = .blockera } label: { ChattInforad(ikon: "hand.raised", text: ct("Blockera {namn}", ["namn": lage.namn(konv)]), fara: true) }
                    .buttonStyle(ChattRadknapp())
                ChattAvdelare()
                Button { fraga = .taBort } label: { ChattInforad(ikon: "person.badge.minus", text: ct("Ta bort vän"), fara: true) }
                    .buttonStyle(ChattRadknapp())
            } else {
                ChattAvdelare()
                Button { fraga = .lamna } label: { ChattInforad(ikon: "rectangle.portrait.and.arrow.right", text: ct("Lämna gruppen"), fara: true) }
                    .buttonStyle(ChattRadknapp())
                    .accessibilityIdentifier("chatt.info.lamna")
            }
        }
    }
}

// MARK: - Byggstenar

struct ChattInfosektion<Innehallet: View>: View {
    let rubrik: String?
    var fot: String?
    @ViewBuilder let innehall: Innehallet
    @Environment(Tema.self) private var tema

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let rubrik {
                Text(rubrik).font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote)).textCase(.uppercase).tracking(0.8)
                    .foregroundStyle(tema.dampad).padding(.leading, 16)
            }
            VStack(spacing: 0) { innehall }
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema.yta))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            if let fot {
                Text(fot).font(Typsnitt.grotesk(13, relativTill: .footnote)).foregroundStyle(tema.dampad)
                    .padding(.horizontal, 16).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ChattInforad: View {
    let ikon: String
    let text: String
    var varde: String?
    var pil = false
    var fara = false
    var accent = false
    @Environment(Tema.self) private var tema

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: ikon).font(.system(size: 16, weight: .medium))
                .foregroundStyle(fara ? tema[.fara] : tema[.accentText]).frame(width: 24)
            Text(text).font(Typsnitt.grotesk(16, vikt: 500, relativTill: .body))
                .foregroundStyle(fara ? tema[.fara] : accent ? tema[.accentText] : tema.text)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            if let varde { Text(varde).font(Typsnitt.grotesk(15, relativTill: .subheadline)).foregroundStyle(tema.dampad).lineLimit(1) }
            if pil { Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(tema[.svag]) }
        }
        .padding(.leading, 16).padding(.trailing, pil || varde != nil ? 16 : 0)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

struct ChattAvdelare: View {
    @Environment(Tema.self) private var tema
    var body: some View { Rectangle().fill(tema.linje).frame(height: 0.5).padding(.leading, 53) }
}

struct ChattRadknapp: ButtonStyle {
    @Environment(Tema.self) private var tema
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(tema[.yta2].opacity(configuration.isPressed ? 1 : 0))
    }
}

/// Runda vätskeknappar (56 pt) med text under.
struct ChattRundknapp: View {
    let ikon: String
    let text: String
    var vald = false
    let gor: () -> Void
    @Environment(Tema.self) private var tema
    var body: some View {
        VStack(spacing: 7) {
            Button(action: gor) {
                Image(systemName: ikon).font(.system(size: 20, weight: .semibold)).frame(width: 56, height: 56)
                    .foregroundStyle(vald ? tema[.accentText] : tema.text)
            }
            .buttonStyle(ChattKnapp(.rund))
            .overlay { if vald { Circle().strokeBorder(tema.accent.opacity(0.6), lineWidth: 1.5) } }
            Text(text).font(Typsnitt.grotesk(12.5, vikt: 500, relativTill: .caption1)).foregroundStyle(tema.dampad)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
    }
}

// MARK: - Lägg till medlemmar

struct ChattLaggTillMedlem: View {
    let lage: ChattLage
    let gid: String
    let redan: Set<String>
    let klar: () -> Void
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var valda: Set<String> = []
    @State private var arbetar = false

    private var kandidater: [ChattPerson] { lage.kontakter.filter { !redan.contains($0.id) } }

    var body: some View {
        NavigationStack {
            List {
                if kandidater.isEmpty {
                    Text(ct("Alla dina vänner är redan med.")).font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad)
                        .listRowBackground(tema.bakgrund)
                }
                ForEach(kandidater) { p in
                    ChattPersonval(person: p, vald: valda.contains(p.id)) {
                        if valda.contains(p.id) { valda.remove(p.id) } else { valda.insert(p.id) }
                    }
                    .listRowBackground(tema.bakgrund)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(tema.bakgrund)
            .navigationTitle(ct("Lägg till medlemmar"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(ct("Avbryt")) { stang() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(ct("Lägg till")) { Task { await laggTill() } }.disabled(valda.isEmpty || arbetar)
                }
            }
        }
    }

    private func laggTill() async {
        arbetar = true
        defer { arbetar = false }
        for p in kandidater where valda.contains(p.id) {
            do { try await lage.lager.laggTill(gid, p) } catch { lage.notis = error.localizedDescription }
        }
        await lage.uppdateraListan()
        klar()
        stang()
    }
}

/// En vän att välja, med en rund bock.
struct ChattPersonval: View {
    let person: ChattPerson
    let vald: Bool
    let vaxla: () -> Void
    @Environment(Tema.self) private var tema
    var body: some View {
        Button(action: { ChattHaptik.val(); vaxla() }) {
            HStack(spacing: 12) {
                ChattAvatarMedNarvaro(namn: person.anvandarnamn, bild: person.avatar, storlek: 44, online: person.online == true)
                Text(person.anvandarnamn).font(Typsnitt.grotesk(16, vikt: 600, relativTill: .body)).foregroundStyle(tema.text)
                Spacer()
                ZStack {
                    Circle().strokeBorder(vald ? tema.accent : tema[.faltlinje], lineWidth: 1.5)
                    if vald {
                        Circle().fill(tema.accent).padding(1)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(tema[.paAccent])
                    }
                }
                .frame(width: 24, height: 24)
                .animation(ChattRorelse.snabb, value: vald)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(vald ? .isSelected : [])
    }
}

// MARK: - Sök i chatten

struct ChattSokning: View {
    let lage: ChattLage
    let konv: KonvId
    let valj: (String) -> Void
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var sok = ""

    private var traffar: [ChattMeddelande] {
        let s = sok.trimmingCharacters(in: .whitespaces).lowercased()
        guard !s.isEmpty else { return [] }
        return (lage.meddelanden[konv] ?? []).filter { $0.innehall.arMeddelande && $0.text.lowercased().contains(s) }.reversed()
    }

    var body: some View {
        NavigationStack {
            List(traffar) { m in
                Button { valj(m.id) } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(m.mitt ? ct("Du") : m.franNamn).font(Typsnitt.grotesk(14, vikt: 650)).foregroundStyle(tema.text)
                            Spacer()
                            Text(ChattTid.kort(m.tid)).font(Typsnitt.grotesk(12.5)).foregroundStyle(tema.dampad)
                        }
                        Text(m.text).font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad).lineLimit(2)
                    }
                }
                .listRowBackground(tema.bakgrund)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(tema.bakgrund)
            .overlay {
                if !sok.isEmpty && traffar.isEmpty {
                    Text(ct("Inga träffar i den här chatten.")).font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad)
                }
            }
            .searchable(text: $sok, placement: .navigationBarDrawer(displayMode: .always), prompt: ct("Sök i chatten"))
            .navigationTitle(ct("Sök"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(ct("Stäng")) { stang() } } }
        }
    }
}

// MARK: - Rapportera

/// Samma orsaker som datorn (`chatt.js`, `rp-reasons`). Rapporten går till AdRazes moderering.
struct ChattRapportera: View {
    let lage: ChattLage
    let konv: KonvId
    let anvandarnamn: String?
    let meddelande: ChattMeddelande?
    var medlemmar: [String] = []

    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var orsak: String?
    @State private var vem: String?
    @State private var detaljer = ""
    @State private var arbetar = false
    @State private var klar = false

    static let orsaker: [(String, String)] = [
        ("spam", "Spam eller reklam"), ("scam", "Bedrägeri eller bluff"), ("harassment", "Trakasserier eller mobbning"),
        ("threat", "Hot eller våld"), ("hate", "Hatiskt innehåll"), ("sexual", "Sexuellt innehåll"),
        ("impersonation", "Utger sig för att vara någon annan"), ("doxxing", "Sprider privata uppgifter"),
        ("child", "Ett barn kan vara i fara"), ("other", "Annat"),
    ]

    private var mal: String? { anvandarnamn ?? vem }

    var body: some View {
        NavigationStack {
            Form {
                if anvandarnamn == nil {
                    Section(ct("Vem gäller det?")) {
                        Picker(ct("Medlem"), selection: $vem) {
                            Text(ct("Välj")).tag(String?.none)
                            ForEach(medlemmar, id: \.self) { Text($0).tag(String?.some($0)) }
                        }
                    }
                }
                Section(ct("Vad har hänt?")) {
                    ForEach(Self.orsaker, id: \.0) { k, text in
                        Button { orsak = k } label: {
                            HStack {
                                Text(ct(text)).foregroundStyle(tema.text)
                                Spacer()
                                if orsak == k { Image(systemName: "checkmark").foregroundStyle(tema.accent).fontWeight(.bold) }
                            }
                        }
                    }
                }
                Section(orsak == "other" ? ct("Beskriv kort vad det gäller") : ct("Berätta mer (frivilligt)")) {
                    TextField(ct("Vad hände?"), text: $detaljer, axis: .vertical).lineLimit(3...6)
                }
                if let meddelande, !meddelande.text.isEmpty {
                    Section {
                        Text(meddelande.text).foregroundStyle(tema.dampad).lineLimit(4)
                    } header: {
                        Text(ct("Meddelandet som skickas med"))
                    } footer: {
                        Text(ct("Meddelandet ovan skickas till AdRazes granskare så vi kan bedöma det. Inget annat från chatten delas. {u} får inte veta att du rapporterat.", ["u": mal ?? ""]))
                    }
                }
            }
            .font(Typsnitt.grotesk(16))
            .scrollContentBackground(.hidden)
            .background(tema.bakgrund)
            .navigationTitle(ct("Rapportera"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(ct("Avbryt")) { stang() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(ct("Skicka")) { Task { await skicka() } }
                        .disabled(orsak == nil || mal == nil || arbetar || (orsak == "other" && detaljer.trimmingCharacters(in: .whitespaces).count < 3))
                }
            }
            .overlay {
                if klar {
                    ChattFigurskarm(figur: "ChattFigurSkydd", rubrik: ct("Tack för att du säger till"),
                               text: ct("Vi granskar rapporten. {u} får inte veta vem som rapporterade.", ["u": mal ?? ""]), knapp: ct("Klar")) { stang() }
                        .background(tema.bakgrund)
                        .transition(.opacity)
                }
            }
        }
    }

    private func skicka() async {
        guard let orsak, let mal else { return }
        arbetar = true
        defer { arbetar = false }
        do {
            try await lage.lager.rapportera(anvandarnamn: mal, orsak: orsak, detaljer: detaljer, meddelande: meddelande, i: konv)
            ChattHaptik.klart()
            withAnimation(.easeOut(duration: 0.25)) { klar = true }
        } catch {
            ChattHaptik.fel()
            lage.notis = error.localizedDescription
        }
    }
}

// MARK: - Vidarebefordra

struct ChattVidarebefordra: View {
    let lage: ChattLage
    let m: ChattMeddelande
    let fran: KonvId
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var valda: [KonvId] = []
    @State private var arbetar = false

    var body: some View {
        NavigationStack {
            List(lage.rader) { r in
                Button {
                    ChattHaptik.val()
                    if let i = valda.firstIndex(of: r.konv) { valda.remove(at: i) } else { valda.append(r.konv) }
                } label: {
                    HStack(spacing: 12) {
                        if r.konv.sort == .grupp { ChattGruppavatar(namn: r.namn, bild: r.bild, medlemmar: r.medlemmar, storlek: 44) }
                        else { ChattAvatar(namn: r.namn, bild: r.bild, storlek: 44) }
                        Text(r.namn).font(Typsnitt.grotesk(16, vikt: 600)).foregroundStyle(tema.text)
                        Spacer()
                        let vald = valda.contains(r.konv)
                        ZStack {
                            Circle().strokeBorder(vald ? tema.accent : tema[.faltlinje], lineWidth: 1.5)
                            if vald {
                                Circle().fill(tema.accent).padding(1)
                                Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(tema[.paAccent])
                            }
                        }
                        .frame(width: 24, height: 24)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowBackground(tema.bakgrund)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(tema.bakgrund)
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task {
                        arbetar = true
                        let ok = await lage.vidarebefordra(m, fran: fran, till: valda)
                        arbetar = false
                        if ok { ChattHaptik.klart(); stang() }
                    }
                } label: {
                    HStack(spacing: 8) {
                        if arbetar { ProgressView().tint(tema[.paAccent]) }
                        Text(valda.isEmpty ? ct("Välj chattar") : ct("Skicka till {n}", ["n": String(valda.count)]))
                    }
                    .font(Typsnitt.grotesk(17, vikt: 650, relativTill: .headline)).frame(maxWidth: .infinity).frame(height: 54)
                }
                .buttonStyle(ChattKnapp(.primar))
                .disabled(valda.isEmpty)
                .allowsHitTesting(!arbetar)
                .padding(.horizontal, 20).padding(.vertical, 10)
                .background(.bar)
            }
            .navigationTitle(ct("Vidarebefordra"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(ct("Avbryt")) { stang() } } }
        }
    }
}
