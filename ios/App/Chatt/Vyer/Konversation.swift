import SwiftUI

/// En konversation: bakgrunden, bubblorna i grupper per avsändare och dag, läskvitton, skrivfältet,
/// rubriken med avatar och status, och knappar för samtal och chattinfo.
struct ChattKonversation: View {
    let lage: ChattLage
    let konv: KonvId

    @Environment(Tema.self) private var tema
    @Environment(AppMiljo.self) private var app
    @State private var svar: ChattMeddelande?
    @State private var info = false
    @State private var samtal = false
    @State private var vidare: ChattMeddelande?
    @State private var rapport: ChattMeddelande?
    @State private var emojiFor: ChattMeddelande?
    @State private var visad: Visad?
    @State private var spelas: Spelas?
    @State private var markerad: String?
    /// Om slutet av konversationen syns (ungefär: LazyVStack ritar raden "botten"). Nya meddelanden från andra
    /// rullar bara fram när man redan är längst ner, så att man inte rycks bort från det man läser.
    @State private var vidBotten = true

    struct Visad: Identifiable { let id = UUID(); let bild: UIImage }
    struct Spelas: Identifiable { let id = UUID(); let info: ChattVideoinfo }

    private var lista: [ChattMeddelande] { lage.meddelanden[konv] ?? [] }

    var body: some View {
        ZStack {
            ChattBakgrundsvy(konv: konv, lage: lage)
            meddelanden
            rubrikton
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if let fot = ChattModul.konversationsfot { fot(lage, konv) }
                ChattSkrivfalt(lage: lage, konv: konv, svar: $svar)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { fastBanner }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        // Rubrikraden har ingen egen yta: bakgrunden går upp bakom den och meddelandena tonar ut (`rubrikton`).
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) { rubrik }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { samtal = true } label: { Image(systemName: "phone").font(.system(size: 16, weight: .semibold)) }
                    .accessibilityLabel(ct("Ring"))
                Button { info = true } label: { Image(systemName: "ellipsis").font(.system(size: 16, weight: .bold)) }
                    .accessibilityLabel(ct("Chattinfo"))
                    .accessibilityIdentifier("chatt.info")
            }
        }
        .sheet(isPresented: $info) { ChattInfo(lage: lage, konv: konv) { samtal = true }.chattArk() }
        .fullScreenCover(isPresented: $samtal) { ChattSamtalsskarm(lage: lage, konv: konv) }
        .sheet(item: $vidare) { m in ChattVidarebefordra(lage: lage, m: m, fran: konv).chattArk() }
        .sheet(item: $rapport) { m in ChattRapportera(lage: lage, konv: konv, anvandarnamn: m.franNamn, meddelande: m).chattArk() }
        .sheet(item: $emojiFor) { m in ChattEmojivaljare { e in Task { await lage.reagera(m, e, i: konv) } }.chattArk() }
        .fullScreenCover(item: $visad) { v in ChattBildvisare(bild: v.bild) }
        .fullScreenCover(item: $spelas) { v in ChattVideospelare(info: v.info, konv: konv, lage: lage) }
        .onChange(of: lage.provSkarm) { _, skarm in
            // Självtestet: skärmbilden tar inte med tangentbordet (eget fönster), så det fälls ner före bilden
            if skarm == "utan-tangentbord" || skarm == "utan-svar" {
                if skarm == "utan-svar" { svar = nil }
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                return
            }
            info = skarm == "info" || skarm == "bakgrund"
            samtal = skarm == "samtal"
        }
        .onChange(of: lage.provLangtryck) { _, id in
            guard let id, let m = lista.first(where: { $0.id == id }) else { return }
            lage.provLangtryck = nil
            langtryck(m, lage.ramar[id] ?? CGRect(x: 12, y: 420, width: 240, height: 44))
        }
        .onAppear { lage.oppna(konv) }
        .onDisappear { lage.stang(konv) }
    }

    // MARK: Rubriken

    /// Meddelandena tonar ut i bakgrunden under rubrikraden: samma bakgrund ritas en gång till ovanpå, med en toning
    /// som mask. Rubriken och knapparna ligger då alltid på lugn yta, med vilken bakgrund som helst, och inga
    /// orange bubblor lyser igenom glaset (iOS 26). Höjden mäts: rubrikraden plus fästa meddelanden.
    private var rubrikton: some View {
        GeometryReader { g in
            // Rubrikradens nederkant räknat från skärmens överkant (statusraden, rubrikraden och fästa meddelanden)
            let h = g.safeAreaInsets.top + 26
            ChattBakgrundsvy(konv: konv, lage: lage)
                .mask(alignment: .top) {
                    LinearGradient(stops: [.init(color: .black, location: 0),
                                           .init(color: .black, location: max(0, (h - 36) / h)),
                                           .init(color: .clear, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: h)
                }
                .ignoresSafeArea()
                .onChange(of: g.safeAreaInsets.top, initial: true) { _, n in lage.provRubrikkant = n }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var rubrik: some View {
        Button { info = true } label: {
            HStack(spacing: 9) {
                if konv.sort == .grupp {
                    ChattGruppavatar(namn: lage.namn(konv), bild: lage.grupp(konv.id)?.avatar, medlemmar: lage.medlemsnamn[konv.id] ?? [], storlek: 36)
                } else {
                    ChattAvatarMedNarvaro(namn: lage.namn(konv), bild: lage.person(konv.id)?.avatar, storlek: 36,
                                          online: lage.person(konv.id)?.online == true)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(lage.namn(konv)).font(Typsnitt.grotesk(16, vikt: 650, relativTill: .headline)).foregroundStyle(tema.text).lineLimit(1)
                    if let s = undertext {
                        Text(s.text).font(Typsnitt.grotesk(12.5, vikt: s.accent ? 600 : 400, relativTill: .caption1))
                            .foregroundStyle(s.accent ? tema[.accentText] : tema.dampad).lineLimit(1)
                            .contentTransition(.opacity)
                    }
                }
            }
            .padding(.leading, 4).padding(.trailing, 16).padding(.vertical, 4)
            .modifier(ChattRubrikglas())
            .chattHogstBredd(240)
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.2), value: undertext?.text)
    }

    private var undertext: (text: String, accent: Bool)? {
        let skriver = lage.skriver[konv] ?? []
        if !skriver.isEmpty {
            if konv.sort == .grupp, let f = skriver.first, f != "*" { return (ct("{namn} skriver…", ["namn": f]), true) }
            return (ct("Skriver…"), true)
        }
        if konv.sort == .grupp {
            let n = lage.grupp(konv.id)?.antal ?? 0
            return (ct("{n} medlemmar", ["n": String(n)]), false)
        }
        guard let p = lage.person(konv.id) else { return nil }
        return ChattTid.aktiv(p.online, p.senastSedd).map { ($0, p.online == true) }
    }

    // MARK: Fäst meddelande

    @ViewBuilder private var fastBanner: some View {
        if let id = lage.installningar.fastMeddelande(konv), let m = lista.first(where: { $0.id == id }) {
            HStack(spacing: 10) {
                Image(systemName: "pin.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(tema[.accentText])
                    .rotationEffect(.degrees(40))
                VStack(alignment: .leading, spacing: 1) {
                    Text(ct("Fäst meddelande")).font(Typsnitt.grotesk(12, vikt: 650, relativTill: .caption1)).foregroundStyle(tema[.accentText])
                    Text(m.text.isEmpty ? "📷 " + ct("Bild") : m.text).font(Typsnitt.grotesk(14, relativTill: .footnote))
                        .foregroundStyle(tema.text).lineLimit(1)
                }
                Spacer()
                Button { withAnimation(ChattRorelse.snabb) { lage.installningar.fast(konv, meddelande: nil) } } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(tema.dampad).frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ct("Lossa"))
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(tema.yta.opacity(0.97))
            .overlay(alignment: .bottom) { Rectangle().fill(tema.linje).frame(height: 0.5) }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    // MARK: Meddelandena

    private struct Post: Identifiable {
        enum Sort { case dag(Date), bubbla(ChattMeddelande, forst: Bool, sist: Bool, namn: Bool), system(ChattMeddelande), sett(String) }
        let id: String
        let sort: Sort
    }

    private var poster: [Post] {
        var ut: [Post] = []
        let synliga = lista.filter { $0.innehall != .kontroll }
        for (i, m) in synliga.enumerated() {
            let fore = i > 0 ? synliga[i - 1] : nil, efter = i + 1 < synliga.count ? synliga[i + 1] : nil
            if fore == nil || !Calendar.current.isDate(fore!.tid, inSameDayAs: m.tid) { ut.append(Post(id: "dag-\(m.id)", sort: .dag(m.tid))) }
            if case .samtal = m.innehall { ut.append(Post(id: m.id, sort: .system(m))); continue }
            let sammaFore = fore.map { $0.fran == m.fran && m.tid.timeIntervalSince($0.tid) < 300 && Calendar.current.isDate($0.tid, inSameDayAs: m.tid) && !arSystem($0) } ?? false
            let sammaEfter = efter.map { $0.fran == m.fran && $0.tid.timeIntervalSince(m.tid) < 300 && Calendar.current.isDate($0.tid, inSameDayAs: m.tid) && !arSystem($0) } ?? false
            ut.append(Post(id: m.id, sort: .bubbla(m, forst: !sammaFore, sist: !sammaEfter, namn: konv.sort == .grupp && !m.mitt && !sammaFore)))
        }
        if let s = settText(synliga) { ut.append(Post(id: "sett", sort: .sett(s))) }
        return ut
    }

    private func arSystem(_ m: ChattMeddelande) -> Bool { if case .samtal = m.innehall { return true } else { return false } }

    /// "Sett" under mitt senaste meddelande (datorns "Öppnat"), i grupper "Sett av …".
    private func settText(_ l: [ChattMeddelande]) -> String? {
        guard let sista = l.last(where: { $0.innehall.arMeddelande }), sista.mitt, !sista.id.hasPrefix("tmp-") else { return nil }
        if konv.sort == .dm {
            if let t = lage.lastTill[konv], t >= sista.tid.addingTimeInterval(-1) { return ChattTid.sett(nil) }
            return ct("Skickat")
        }
        let lasare = (lage.lastAv[konv] ?? [:]).filter { $0.value >= sista.tid }.map(\.key).sorted()
        guard !lasare.isEmpty else { return ct("Skickat") }
        let ovriga = max(0, (lage.grupp(konv.id)?.antal ?? 0) - 1)
        if ovriga > 0, lasare.count >= ovriga { return ct("Sett av alla") }
        return ct("Sett av {namn}", ["namn": lasare.joined(separator: ", ")])
    }

    /// Rullar till slutet. LazyVStack gissar höjden på rader den inte har ritat (bilder, citat), så ett första
    /// hopp kan hamna en bit ovanför; det rättas utan animation när raderna har mätts.
    private func tillBotten(_ rull: ScrollViewProxy, animerat: Bool) {
        if animerat {
            withAnimation(.easeOut(duration: 0.25)) { rull.scrollTo("botten", anchor: .bottom) }
        } else {
            rull.scrollTo("botten", anchor: .bottom)
        }
        Task { @MainActor in
            for paus in [animerat ? 0.3 : 0.06, 0.25, 0.5] {
                try? await Task.sleep(nanoseconds: UInt64(paus * 1_000_000_000))
                rull.scrollTo("botten", anchor: .bottom)
            }
        }
    }

    private var meddelanden: some View {
        GeometryReader { g in
            let maxBredd = min(g.size.width * 0.76, 420)
            ScrollViewReader { rull in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if let rad = ChattModul.konversationsrad { rad(lage, konv) }
                        if lage.laddar.contains(konv) && lista.isEmpty {
                            ProgressView().padding(.top, 60)
                        } else if lista.isEmpty {
                            tomt
                        }
                        ForEach(poster) { p in rad(p, maxBredd: maxBredd).id(p.id) }
                        Color.clear.frame(height: 6).id("botten")
                            .onAppear { vidBotten = true }
                            .onDisappear { vidBotten = false }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: lista.last?.id) { forra, _ in
                    guard forra == nil || vidBotten || lista.last?.mitt == true else { return }
                    tillBotten(rull, animerat: forra != nil)
                }
                // Tangentbordet och svarsraden gör ytan lägre underifrån: står man längst ner ska det nyaste synas kvar.
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                    if vidBotten { tillBotten(rull, animerat: true) }
                }
                // Och tvärtom när tangentbordet fälls ner: inget tomrum under det sista meddelandet
                .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                    if vidBotten { tillBotten(rull, animerat: true) }
                }
                .onChange(of: svar?.id) { _, ny in
                    lage.provSvarar = ny
                    if ny != nil, vidBotten { tillBotten(rull, animerat: true) }
                }
                .onChange(of: lage.hopp) { _, id in
                    guard let id else { return }
                    lage.hopp = nil
                    withAnimation(.easeInOut(duration: 0.35)) { rull.scrollTo(id, anchor: .center) }
                    markerad = id
                    Task { try? await Task.sleep(nanoseconds: 1_600_000_000); withAnimation(.easeOut(duration: 0.4)) { markerad = nil } }
                }
            }
        }
    }

    @ViewBuilder private var tomt: some View {
        VStack(spacing: 12) {
            if konv.sort == .grupp {
                ChattGruppavatar(namn: lage.namn(konv), bild: lage.grupp(konv.id)?.avatar, medlemmar: lage.medlemsnamn[konv.id] ?? [], storlek: 88)
            } else {
                ChattAvatar(namn: lage.namn(konv), bild: lage.person(konv.id)?.avatar, storlek: 88)
            }
            Text(lage.namn(konv)).font(Typsnitt.rubrik(24, vikt: 600)).foregroundStyle(tema.text)
            Text(konv.sort == .grupp ? ct("Säg hej till gruppen") : ct("Ni är vänner på AdRaze. Säg hej!"))
                .font(Typsnitt.grotesk(15, relativTill: .subheadline)).foregroundStyle(tema.dampad)
        }
        .padding(.top, 70).padding(.bottom, 30)
    }

    @ViewBuilder private func rad(_ p: Post, maxBredd: CGFloat) -> some View {
        switch p.sort {
        case .dag(let d):
            HStack(spacing: 12) {
                Rectangle().fill(tema.linje).frame(height: 1)
                Text(ChattTid.dag(d)).font(Typsnitt.grotesk(11.5, vikt: 650, relativTill: .caption2)).textCase(.uppercase).tracking(1.1)
                    .foregroundStyle(tema.dampad).fixedSize()
                Rectangle().fill(tema.linje).frame(height: 1)
            }
            .padding(.horizontal, 8).padding(.top, 22).padding(.bottom, 8)
            .padding(.horizontal, 3)
            .background(Capsule().fill(tema.bakgrund.opacity(lage.installningar.bakgrund(konv).forval == "papper" ? 0 : 0.0)))
        case .system(let m):
            HStack(spacing: 6) {
                Image(systemName: "phone.arrow.down.left").font(.system(size: 12, weight: .semibold))
                Text(ct("Missat samtal") + " · " + ChattTid.klocka(m.tid)).font(Typsnitt.grotesk(13, vikt: 500, relativTill: .footnote))
            }
            .foregroundStyle(tema.dampad)
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(tema.yta.opacity(0.9)))
            .padding(.vertical, 10)
        case .sett(let t):
            Text(t).font(Typsnitt.grotesk(12, vikt: 500, relativTill: .caption1)).foregroundStyle(tema.dampad)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.trailing, 4).padding(.top, 4)
                .transition(.opacity)
        case .bubbla(let m, let forst, let sist, let namn):
            bubbelrad(m, forst: forst, sist: sist, namn: namn, maxBredd: maxBredd)
        }
    }

    private func bubbelrad(_ m: ChattMeddelande, forst: Bool, sist: Bool, namn: Bool, maxBredd: CGFloat) -> some View {
        let rx = lage.reaktioner(pa: m, i: konv)
        let grupp = konv.sort == .grupp && !m.mitt
        return VStack(alignment: m.mitt ? .trailing : .leading, spacing: 0) {
            if namn {
                Text(m.franNamn).font(Typsnitt.grotesk(12.5, vikt: 600, relativTill: .caption1))
                    .foregroundStyle(Color(uiColor: UIColor(hex: ChattAvatarton.black[ChattAvatarton.index(m.franNamn)], alfa: 1)))
                    .padding(.leading, grupp ? 50 : 12).padding(.bottom, 3)
            }
            HStack(alignment: .bottom, spacing: 8) {
                if m.mitt { Spacer(minLength: 40) }
                if grupp {
                    Group {
                        if sist { ChattAvatar(namn: m.franNamn, bild: nil, storlek: 30) } else { Color.clear.frame(width: 30, height: 1) }
                    }
                }
                ChattBubbla(m: m, konv: konv, lage: lage, forstIGrupp: forst, sistIGrupp: sist, maxBredd: maxBredd)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { lage.ramar[m.id] = $0 }
                    .overlay {
                        GeometryReader { g in
                            Color.clear.contentShape(Rectangle())
                                .onTapGesture { tryck(m) }
                                .onLongPressGesture(minimumDuration: 0.5) { langtryck(m, g.frame(in: .global)) }
                        }
                    }
                    .accessibilityAction(named: ct("Fler val")) { langtryck(m, .zero) }
                if !m.mitt { Spacer(minLength: 40) }
            }
            if !rx.isEmpty {
                ChattReaktionsrad(poster: rx, mitt: m.mitt) { e in Task { await lage.reagera(m, e, i: konv) } }
                    .padding(.top, -6).padding(m.mitt ? .trailing : .leading, grupp ? 48 : 10)
                    .zIndex(1)
            }
        }
        .padding(.top, forst ? 8 : 2)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tema.accent.opacity(markerad == m.id ? 0.14 : 0))
                .padding(.horizontal, -8).padding(.vertical, -3)
        }
        .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
    }

    private func tryck(_ m: ChattMeddelande) {
        switch m.innehall {
        case .bild(let info, _): if let b = lage.bildIMinnet(info.bilaga) ?? lage.bildIMinnet(m.id) { visad = Visad(bild: b) }
        case .video(let info, _): if !info.bilagor.isEmpty { spelas = Spelas(info: info) }
        default: break
        }
    }

    private func langtryck(_ m: ChattMeddelande, _ ram: CGRect) {
        guard !m.id.hasPrefix("tmp-") else { return }
        lage.langtryck = ChattLangtrycksval(m: m, konv: konv, ram: ram) { atgard in utfor(atgard, m) }
    }

    private func utfor(_ a: ChattLangtrycksatgard, _ m: ChattMeddelande) {
        lage.langtryck = nil
        switch a {
        case .svara: withAnimation(ChattRorelse.snabb) { svar = m }
        case .kopiera:
            UIPasteboard.general.string = m.text
            lage.notis = nil
            ChattHaptik.klart()
        case .vidarebefordra: vidare = m
        case .fast:
            let nu = lage.installningar.fastMeddelande(konv) == m.id
            withAnimation(ChattRorelse.snabb) { lage.installningar.fast(konv, meddelande: nu ? nil : m.id) }
        case .rapportera: rapport = m
        case .dolj: Task { await lage.dolj(m, i: konv) }
        case .angra: Task { await lage.angra(m, i: konv) }
        case .reagera(let e): Task { await lage.reagera(m, e, i: konv) }
        case .merEmoji: emojiFor = m
        }
    }
}

/// En bild i helskärm (tryck för att stänga).
struct ChattBildvisare: View {
    let bild: UIImage
    @Environment(\.dismiss) private var stang
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Image(uiImage: bild).resizable().scaledToFit()
        }
        .overlay(alignment: .topTrailing) {
            Button { stang() } label: {
                Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 42, height: 42).background(Circle().fill(.white.opacity(0.16)))
            }
            .padding(16)
        }
        .onTapGesture { stang() }
    }
}

/// iOS 26: rubriken får eget glas, som knapparna bredvid, så att namnet går att läsa när meddelandena rullar in
/// under raden. iOS 17–18 lägger sitt material bakom hela raden i stället.
private struct ChattRubrikglas: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular.interactive(), in: Capsule())
        } else {
            content
        }
    }
}

/// Högst så här bred, men aldrig bredare än innehållet (en vanlig `frame(maxWidth:)` växer till maxbredden):
/// glaset runt rubriken följer namnet och iOS kan centrera det.
private struct ChattHogstBreddLayout: Layout {
    let bredd: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let v = subviews.first else { return .zero }
        return v.sizeThatFits(ProposedViewSize(width: min(proposal.width ?? bredd, bredd), height: proposal.height))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }
}

private extension View {
    func chattHogstBredd(_ bredd: CGFloat) -> some View { ChattHogstBreddLayout(bredd: bredd) { self } }
}
