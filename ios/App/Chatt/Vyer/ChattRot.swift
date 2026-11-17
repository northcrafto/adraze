import SwiftUI

/// Chattens rot: inloggning, upplåsning och val av användarnamn, sedan inkorgen och konversationerna.
struct ChattRot: View {
    let lage: ChattLage
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @State private var vag: [KonvId] = []

    var body: some View {
        NavigationStack(path: $vag) {
            ZStack {
                // Stackens rot ritar annars systemets vita/svarta bakgrund i stället för AdRazes varma.
                tema.bakgrund.ignoresSafeArea()
                switch lage.fas {
                case .utloggad: ChattUtloggad()
                case .laser: ChattOppnar()
                case .behoverNamn(let forslag): ChattValjNamn(lage: lage, forslag: forslag)
                case .fel(let text): ChattFelvy(text: text) { Task { await lage.start() } }
                case .klar: ChattInkorg(lage: lage) { vag.append($0) }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            // Egen identitet per konversation: när en chatt byts mot en annan på samma plats i stacken (chatt:visa,
            // "Skapa grupp med …") ska vyn byggas om och öppna den nya, inte återanvändas med gammalt tillstånd.
            .navigationDestination(for: KonvId.self) { k in ChattKonversation(lage: lage, konv: k).id(k) }
        }
        .tint(tema.accent)
        .background(tema.bakgrund.ignoresSafeArea())
        .overlay {
            if let v = lage.langtryck {
                ChattLangtryck(val: v, lage: lage) { withAnimation(.easeOut(duration: 0.15)) { lage.langtryck = nil } }
                    .id(v.id)
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .top) { ChattNotisruta(lage: lage) }
        .task {
            await lage.start()
            lage.borja()
        }
        .onChange(of: lage.fas) { _, ny in
            if ny == .klar, let k = lage.begard { lage.begard = nil; vag = [k] }
        }
        .onChange(of: lage.begard) { _, ny in
            if let k = ny, lage.fas == .klar { lage.begard = nil; vag = [k] }
        }
        .onChange(of: lage.provSkarm) { _, skarm in if skarm == "inkorg" { vag = [] } }
        .onDisappear { lage.stoppa() }
    }
}

/// Stäng-knappen uppe till höger på chattens egna skärmar.
struct ChattStang: View {
    @Environment(\.dismiss) private var stang
    var body: some View {
        Button { stang() } label: {
            Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).frame(width: 40, height: 40)
        }
        .buttonStyle(ChattKnapp(.ikon))
        .accessibilityLabel(ct("Stäng"))
    }
}

/// En tom skärm med en av sajtens figurer, rubrik, text och en knapp.
struct ChattFigurskarm: View {
    let figur: String
    let rubrik: String
    let text: String
    var knapp: String?
    var gor: (() -> Void)?
    @Environment(Tema.self) private var tema

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 20)
            ChattSajtfigur(namn: figur).frame(maxWidth: 260, maxHeight: 220).padding(.bottom, 30)
            Text(rubrik).font(Typsnitt.rubrik(28, vikt: 600)).foregroundStyle(tema.text).multilineTextAlignment(.center)
            Text(text).font(Typsnitt.grotesk(16, relativTill: .body)).foregroundStyle(tema.dampad)
                .multilineTextAlignment(.center).lineSpacing(3).padding(.top, 10).frame(maxWidth: 330)
                .fixedSize(horizontal: false, vertical: true)
            if let knapp, let gor {
                Button(action: gor) {
                    Text(knapp).font(Typsnitt.grotesk(17, vikt: 650, relativTill: .headline))
                        .frame(maxWidth: 300).frame(height: 54)
                }
                .buttonStyle(ChattKnapp(.primar))
                .padding(.top, 28)
            }
            Spacer(minLength: 40)
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct ChattUtloggad: View {
    @Environment(AppMiljo.self) private var app
    var body: some View {
        ChattFigurskarm(figur: "ChattFigurSurfa", rubrik: ct("Logga in för att chatta"),
                   text: ct("Samma konto som i AdRaze på datorn. Vänner, grupper och chattar följer med."),
                   knapp: ct("Logga in")) {
            Task { _ = try? await app.brygga.anropa("konto:visa", [], fran: BryggKalla(yta: "chatt")) }
        }
        .overlay(alignment: .topTrailing) { ChattStang().padding(.trailing, 16).padding(.top, 8) }
    }
}

struct ChattOppnar: View {
    @Environment(Tema.self) private var tema
    @State private var puls = false
    var body: some View {
        VStack(spacing: 18) {
            Image("Gorilla").resizable().scaledToFit().frame(width: 64, height: 64)
                .scaleEffect(puls ? 1.06 : 0.96).opacity(puls ? 1 : 0.7)
                .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: puls)
            Text(ct("Öppnar chatten…")).font(Typsnitt.grotesk(15, vikt: 500, relativTill: .subheadline)).foregroundStyle(tema.dampad)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { puls = true }
        .overlay(alignment: .topTrailing) { ChattStang().padding(.trailing, 16).padding(.top, 8) }
    }
}

struct ChattFelvy: View {
    let text: String
    let igen: () -> Void
    var body: some View {
        ChattFigurskarm(figur: "ChattFigurSkydd", rubrik: ct("Chatten gick inte att öppna"), text: text, knapp: ct("Försök igen"), gor: igen)
            .overlay(alignment: .topTrailing) { ChattStang().padding(.trailing, 16).padding(.top, 8) }
    }
}

/// Första gången: välj användarnamn (datorns "Välj ett användarnamn"). Nyckelparet skapas på telefonen.
struct ChattValjNamn: View {
    let lage: ChattLage
    @State var forslag: String
    @Environment(Tema.self) private var tema
    @State private var fel: String?
    @State private var arbetar = false
    @FocusState private var fokus: Bool

    init(lage: ChattLage, forslag: String) {
        self.lage = lage
        _forslag = State(initialValue: forslag)
    }

    private var giltigt: Bool { forslag.range(of: "^[A-Za-z0-9_]{3,20}$", options: .regularExpression) != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ChattSajtfigur(namn: "ChattFigurProfil").frame(height: 190).frame(maxWidth: .infinity).padding(.bottom, 28)
                Text(ct("Välj ett användarnamn")).font(Typsnitt.rubrik(30, vikt: 600)).foregroundStyle(tema.text)
                Text(ct("Så hittar dina vänner dig i chatten. 3–20 tecken: bokstäver, siffror och _."))
                    .font(Typsnitt.grotesk(16, relativTill: .body)).foregroundStyle(tema.dampad).lineSpacing(3)
                    .padding(.top, 10).padding(.bottom, 24).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(verbatim: "@").font(Typsnitt.grotesk(18, vikt: 600)).foregroundStyle(tema[.svag])
                    TextField("", text: $forslag)
                        .font(Typsnitt.grotesk(18, vikt: 500))
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($fokus).submitLabel(.go).onSubmit(skapa)
                        .accessibilityIdentifier("chatt.namn")
                }
                .padding(.horizontal, 16).frame(height: 54)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(tema[.falt]))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(fokus ? tema.accent : tema[.faltlinje], lineWidth: fokus ? 1.5 : 1))
                if let fel {
                    Text(fel).font(Typsnitt.grotesk(14.5, vikt: 500)).foregroundStyle(tema[.fara]).padding(.top, 12)
                }
                Button(action: skapa) {
                    HStack(spacing: 10) {
                        if arbetar { ProgressView().tint(tema[.paAccent]) }
                        Text(ct("Börja chatta"))
                    }
                    .font(Typsnitt.grotesk(17, vikt: 650, relativTill: .headline)).frame(maxWidth: .infinity).frame(height: 54)
                }
                .buttonStyle(ChattKnapp(.primar))
                .disabled(!giltigt)
                .allowsHitTesting(!arbetar)
                .padding(.top, 22)
            }
            .padding(.horizontal, 26).padding(.top, 70).padding(.bottom, 40)
        }
        .overlay(alignment: .topTrailing) { ChattStang().padding(.trailing, 16).padding(.top, 8) }
    }

    private func skapa() {
        guard giltigt, !arbetar else { return }
        arbetar = true
        fel = nil
        Task {
            defer { arbetar = false }
            do { try await lage.skapaProfil(forslag) } catch { fel = error.localizedDescription; ChattHaptik.fel() }
        }
    }
}

/// Kort ruta uppe när något gick fel.
struct ChattNotisruta: View {
    let lage: ChattLage
    @Environment(Tema.self) private var tema
    var body: some View {
        Group {
            if let t = lage.notis {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(tema[.fara])
                    Text(t).font(Typsnitt.grotesk(14.5, vikt: 500)).foregroundStyle(tema.text).lineLimit(3)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Capsule().fill(tema.yta).shadow(color: .black.opacity(0.14), radius: 18, y: 8))
                .overlay(Capsule().strokeBorder(tema.linje, lineWidth: 1))
                .padding(.top, 6).padding(.horizontal, 20)
                .transition(.move(edge: .top).combined(with: .opacity))
                .task(id: t) {
                    try? await Task.sleep(nanoseconds: 3_200_000_000)
                    withAnimation(.easeOut(duration: 0.25)) { lage.notis = nil }
                }
                .onTapGesture { lage.notis = nil }
            }
        }
        .animation(ChattRorelse.fjader, value: lage.notis)
    }
}
