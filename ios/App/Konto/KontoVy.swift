import SwiftUI

/// Kontoarket: inloggningen när ingen är inloggad, annars kontokortet med utloggning. `vantar`: någon väntar på
/// inloggningen (`KontoTjanst.visaInloggning`, Falk och Chatt): efter inloggningen visas en kort bekräftelse och
/// arket stänger sig självt (`KontoKontroller`).
struct KontoRot: View {
    let kontot: Kontot
    var start: KontoInloggning.Lage = .logga
    var epost = ""
    var rubrik: String?
    var underrubrik: String?
    var vantar = false
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang

    var body: some View {
        ZStack(alignment: .topTrailing) {
            tema.bakgrund.ignoresSafeArea()
            if kontot.arInloggad {
                if vantar {
                    KontoKlar(kontot: kontot)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                } else {
                    KontoKortvy(kontot: kontot)
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            } else {
                KontoInloggning(kontot: kontot, rubrik: rubrik, underrubrik: underrubrik, start: start, epost: epost)
                    .transition(.opacity)
            }
            if !(vantar && kontot.arInloggad) {
                Stangknapp { stang() }
                    .padding(.top, Stangknapp.inpassning).padding(.trailing, Stangknapp.inpassning)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.88), value: kontot.arInloggad)
    }
}

/// Bekräftelsen när någon har loggat in för att något annat väntade (Falk, Chatt): gorillan, en bock som ritas
/// och namnet. Arket stänger sig självt strax efter.
struct KontoKlar: View {
    let kontot: Kontot
    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var ritad: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 40)
            ZStack(alignment: .bottomTrailing) {
                Image("Gorilla").resizable().scaledToFit().frame(width: 88, height: 88)
                ZStack {
                    Circle().fill(tema.accent)
                    KontoBock().trim(from: 0, to: ritad)
                        .stroke(tema[.paAccent], style: StrokeStyle(lineWidth: 3.2, lineCap: .round, lineJoin: .round))
                        .frame(width: 16, height: 16)
                }
                .frame(width: 34, height: 34)
                .overlay(Circle().strokeBorder(tema.bakgrund, lineWidth: 3))
                .offset(x: 6, y: 4)
            }
            .padding(.bottom, 26)
            Text(kt("Du är inloggad"))
                .font(Typsnitt.rubrik(AdrazeArk.rubrikstorlek, vikt: AdrazeArk.rubrikvikt))
                .foregroundStyle(tema.text)
            Text(kontot.konto?.namn ?? kontot.konto?.epost ?? "")
                .font(Typsnitt.grotesk(16, relativTill: .body))
                .foregroundStyle(tema.dampad)
                .padding(.top, 8)
            Spacer(minLength: 80)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .onAppear {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            withAnimation(minska ? .easeOut(duration: 0.15) : .timingCurve(0.2, 0.75, 0.25, 1, duration: 0.5).delay(0.15)) { ritad = 1 }
        }
    }
}

/// Bocken i bekräftelsen.
struct KontoBock: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + r.width * 0.08, y: r.minY + r.height * 0.55))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.38, y: r.minY + r.height * 0.84))
        p.addLine(to: CGPoint(x: r.maxX - r.width * 0.04, y: r.minY + r.height * 0.18))
        return p
    }
}

// MARK: - Inloggning

struct KontoInloggning: View {
    let kontot: Kontot
    var rubrik: String?
    var underrubrik: String?

    enum Lage: Equatable { case logga, skapa, glomt, kod(epost: String, syfte: String) }

    init(kontot: Kontot, rubrik: String? = nil, underrubrik: String? = nil, start: Lage = .logga, epost: String = "") {
        self.kontot = kontot
        self.rubrik = rubrik
        self.underrubrik = underrubrik
        _lage = State(initialValue: start)
        _epost = State(initialValue: epost)
    }

    @Environment(Tema.self) private var tema
    @State private var lage: Lage
    @State private var namn = ""
    @State private var epost: String
    @State private var losen = ""
    @State private var kod = ""
    @State private var nyttLosen = ""
    @State private var fel: String?
    @State private var arbetar = false
    @State private var nedrakning = 0
    @FocusState private var fokus: Falt?

    enum Falt: Hashable { case namn, epost, losen, kod, nytt }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Image("Gorilla")
                    .resizable().scaledToFit()
                    .frame(width: 76, height: 76)
                    .padding(.bottom, 22)
                    .accessibilityHidden(true)
                Text(titel)
                    .font(Typsnitt.rubrik(AdrazeArk.rubrikstorlek, vikt: AdrazeArk.rubrikvikt))
                    .foregroundStyle(tema.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(undertext)
                    .font(Typsnitt.grotesk(16, relativTill: .body))
                    .foregroundStyle(tema.dampad)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .padding(.bottom, 28)
                falten
                if let fel {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                        Text(fel).fixedSize(horizontal: false, vertical: true)
                    }
                    .font(Typsnitt.grotesk(14.5, vikt: 500, relativTill: .callout))
                    .foregroundStyle(tema[.fara])
                    .padding(.top, 14)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                    .accessibilityIdentifier("konto.fel")
                }
                Button(action: skicka) {
                    HStack(spacing: 10) {
                        if arbetar { ProgressView().tint(tema[.paAccent]) }
                        Text(knapptext)
                    }
                    .font(Typsnitt.grotesk(17, vikt: 650, relativTill: .headline))
                    .frame(maxWidth: .infinity).frame(height: 54)
                }
                .buttonStyle(KontoKnapp(.primar))
                .disabled(!kanSkicka)
                .allowsHitTesting(!arbetar)
                .padding(.top, 24)
                .accessibilityIdentifier("konto.skicka")
                lankar.padding(.top, 18)
            }
            .padding(.horizontal, AdrazeArk.sidor)
            .padding(.top, 64)
            .padding(.bottom, 40)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .animation(.spring(response: 0.42, dampingFraction: 0.88), value: lage)
        .animation(.easeOut(duration: 0.2), value: fel)
        .task(id: nedrakning > 0) {
            while nedrakning > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                nedrakning -= 1
            }
        }
    }

    private var titel: String {
        switch lage {
        case .logga: return rubrik ?? kt("Logga in")
        case .skapa: return kt("Skapa ett konto")
        case .glomt: return kt("Glömt lösenord?")
        case .kod(_, let syfte): return syfte == "reset" ? kt("Välj ett nytt lösenord") : kt("Kolla din mejl")
        }
    }

    private var undertext: String {
        switch lage {
        case .logga: return underrubrik ?? kt("Samma konto som i AdRaze på datorn. Vänner, grupper och chattar följer med.")
        case .skapa: return kt("Ett konto för AdRaze på alla dina enheter.")
        case .glomt: return kt("Skriv din mejladress så skickar vi en kod.")
        case .kod(let e, _): return kt("Vi skickade en kod till {e}. Den gäller i 15 minuter.", ["e": e])
        }
    }

    private var knapptext: String {
        switch lage {
        case .logga: return kt("Logga in")
        case .skapa: return kt("Skapa konto")
        case .glomt: return kt("Skicka kod")
        case .kod(_, let syfte): return syfte == "reset" ? kt("Spara lösenordet") : kt("Fortsätt")
        }
    }

    private var kanSkicka: Bool {
        let e = epost.trimmingCharacters(in: .whitespaces)
        switch lage {
        case .logga: return e.contains("@") && !losen.isEmpty
        case .skapa: return e.contains("@") && losen.count >= 8
        case .glomt: return e.contains("@")
        case .kod(_, let syfte): return kod.count == 6 && (syfte != "reset" || nyttLosen.count >= 8)
        }
    }

    @ViewBuilder private var falten: some View {
        VStack(spacing: 16) {
            switch lage {
            case .logga, .skapa, .glomt:
                if lage == .skapa {
                    KontoFalt(etikett: kt("Namn"), fokus: fokus == .namn) {
                        TextField("", text: $namn, prompt: Text(kt("Vad ska vi kalla dig?")).foregroundColor(tema[.svag]))
                            .textContentType(.givenName)
                            .focused($fokus, equals: .namn)
                            .submitLabel(.next)
                            .onSubmit { fokus = .epost }
                    }
                }
                KontoFalt(etikett: kt("Mejladress"), fokus: fokus == .epost) {
                    TextField("", text: $epost, prompt: Text(verbatim: "namn@exempel.se").foregroundColor(tema[.svag]))
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($fokus, equals: .epost)
                        .submitLabel(lage == .glomt ? .send : .next)
                        .onSubmit { lage == .glomt ? skicka() : (fokus = .losen) }
                        .accessibilityIdentifier("konto.epost")
                }
                if lage != .glomt {
                    KontoFalt(etikett: kt("Lösenord"), fokus: fokus == .losen) {
                        SecureField("", text: $losen, prompt: Text(lage == .skapa ? kt("Minst 8 tecken") : "").foregroundColor(tema[.svag]))
                            .textContentType(lage == .skapa ? .newPassword : .password)
                            .focused($fokus, equals: .losen)
                            .submitLabel(.go)
                            .onSubmit(skicka)
                            .accessibilityIdentifier("konto.losen")
                    }
                }
            case .kod(_, let syfte):
                KontoKodrutor(kod: $kod, fokus: $fokus) { if syfte != "reset" { skicka() } }
                if syfte == "reset" {
                    KontoFalt(etikett: kt("Nytt lösenord"), fokus: fokus == .nytt) {
                        SecureField("", text: $nyttLosen, prompt: Text(kt("Minst 8 tecken")).foregroundColor(tema[.svag]))
                            .textContentType(.newPassword)
                            .focused($fokus, equals: .nytt)
                            .submitLabel(.go)
                            .onSubmit(skicka)
                    }
                }
            }
        }
    }

    @ViewBuilder private var lankar: some View {
        let stil = Typsnitt.grotesk(15, vikt: 600, relativTill: .subheadline)
        VStack(alignment: .leading, spacing: 6) {
            switch lage {
            case .logga:
                Button(kt("Glömt lösenord?")) { byt(.glomt) }
                    .font(stil).buttonStyle(KontoKnapp(.lank)).padding(.vertical, 4)
                HStack(spacing: 4) {
                    Text(kt("Ny här?")).foregroundStyle(tema.dampad)
                    Button(kt("Skapa konto")) { byt(.skapa) }.buttonStyle(KontoKnapp(.lank))
                }
                .font(stil).padding(.top, 8)
            case .skapa, .glomt:
                Button(kt("Jag har redan ett konto")) { byt(.logga) }
                    .font(stil).buttonStyle(KontoKnapp(.lank)).padding(.vertical, 4)
            case .kod(let e, let syfte):
                Button(nedrakning > 0 ? kt("Skicka ny kod ({n} s)", ["n": String(nedrakning)]) : kt("Skicka ny kod")) {
                    Task { await nyKod(e, syfte) }
                }
                .font(stil).buttonStyle(KontoKnapp(.lank)).disabled(nedrakning > 0).padding(.vertical, 4)
                Button(kt("Byt mejladress")) { byt(.logga) }
                    .font(stil).buttonStyle(KontoKnapp(.lank)).padding(.vertical, 4)
            }
        }
    }

    private func byt(_ nytt: Lage) {
        fel = nil
        kod = ""
        lage = nytt
    }

    private func skicka() {
        guard kanSkicka, !arbetar else { return }
        fel = nil
        arbetar = true
        let e = epost.trimmingCharacters(in: .whitespaces)
        Task { @MainActor in
            defer { arbetar = false }
            do {
                switch lage {
                case .logga: try await efter(kontot.loggaIn(epost: e, losen: losen))
                case .skapa: try await efter(kontot.skapaKonto(namn: namn.trimmingCharacters(in: .whitespaces), epost: e, losen: losen))
                case .glomt: try await efter(kontot.glomtLosen(epost: e))
                case .kod(let ep, let syfte):
                    if syfte == "reset" { try await kontot.nyttLosen(epost: ep, kod: kod, losen: nyttLosen) }
                    else { try await kontot.verifiera(epost: ep, kod: kod) }
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            } catch {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                fel = error.localizedDescription
                if case .kod = lage { kod = "" }
            }
        }
    }

    private func efter(_ steg: Kontot.Steg) {
        if case .kod(let e, let syfte) = steg {
            byt(.kod(epost: e, syfte: syfte))
            nedrakning = 30
            fokus = .kod
        }
    }

    private func nyKod(_ e: String, _ syfte: String) async {
        do {
            try await kontot.skickaNyKod(epost: e, syfte: syfte)
            nedrakning = 45
        } catch { fel = error.localizedDescription }
    }

}

/// Sex rutor för koden. Ett dolt fält tar emot siffrorna (och iOS förslag ur Mail/Meddelanden).
struct KontoKodrutor: View {
    @Binding var kod: String
    var fokus: FocusState<KontoInloggning.Falt?>.Binding
    let klar: () -> Void
    @Environment(Tema.self) private var tema

    var body: some View {
        ZStack {
            TextField("", text: $kod)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused(fokus, equals: .kod)
                .opacity(0.02)
                .accessibilityIdentifier("konto.kod")
                .onChange(of: kod) { _, ny in
                    let siffror = String(ny.filter(\.isNumber).prefix(6))
                    if siffror != ny { kod = siffror }
                    if siffror.count == 6 { klar() }
                }
            HStack(spacing: 9) {
                ForEach(0..<6, id: \.self) { i in
                    let tecken = Array(kod)
                    let aktiv = fokus.wrappedValue == .kod && i == min(tecken.count, 5)
                    Text(i < tecken.count ? String(tecken[i]) : "")
                        .font(Typsnitt.rubrik(28, vikt: 600))
                        .monospacedDigit()
                        .foregroundStyle(tema.text)
                        .frame(maxWidth: .infinity).frame(height: 62)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tema[.falt]))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(aktiv ? tema.accent : tema[.faltlinje], lineWidth: aktiv ? 1.6 : 1))
                        .scaleEffect(i < tecken.count ? 1 : 0.97)
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: tecken.count)
                }
            }
            .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        .onTapGesture { fokus.wrappedValue = .kod }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(kt("Kod"))
    }
}

// MARK: - Kontokortet

struct KontoKortvy: View {
    let kontot: Kontot
    @Environment(Tema.self) private var tema
    @Environment(AppMiljo.self) private var app
    @Environment(\.dismiss) private var stang
    @State private var loggarUt = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                KontoAvatar(namn: kontot.konto?.namn ?? kontot.konto?.epost ?? "?", dataUrl: kontot.avatar, storlek: 96)
                    .padding(.bottom, 18)
                Text(kontot.konto?.namn ?? kt("Ditt konto"))
                    .font(Typsnitt.rubrik(AdrazeArk.rubrikstorlek, vikt: AdrazeArk.rubrikvikt))
                    .foregroundStyle(tema.text)
                if let e = kontot.konto?.epost {
                    Text(e).font(Typsnitt.grotesk(16, relativTill: .body)).foregroundStyle(tema.dampad).padding(.top, 4)
                }
                if kontot.pro {
                    Text(verbatim: "PRO")
                        .font(Typsnitt.grotesk(12, vikt: 700, relativTill: .caption1)).tracking(1.2)
                        .foregroundStyle(tema[.paAccent])
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(tema.accent))
                        .padding(.top, 12)
                }
                VStack(alignment: .leading, spacing: 14) {
                    rad("person.2", kt("Samma konto som på datorn: vänner, grupper och chattar följer med."))
                    rad("lock", kt("Inloggningen sparas bara i telefonens nyckelring."))
                }
                .padding(18)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(tema.yta))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
                .padding(.top, 30)
                Button {
                    _ = app.flikar.nyFlik(URL(string: "https://accounts.adraze.app/"))
                    stang()
                } label: {
                    Text(kt("Hantera kontot")).font(Typsnitt.grotesk(16, vikt: 600, relativTill: .body))
                        .frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(KontoKnapp(.lank))
                .padding(.top, 22)
                Button {
                    loggarUt = true
                    Task { await kontot.loggaUt(); loggarUt = false }
                } label: {
                    HStack(spacing: 8) {
                        if loggarUt { ProgressView() }
                        Text(kt("Logga ut"))
                    }
                    .font(Typsnitt.grotesk(16, vikt: 600, relativTill: .body))
                    .frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(KontoKnapp(.fara))
                .disabled(loggarUt)
                .padding(.top, 8)
                .accessibilityIdentifier("konto.loggaut")
            }
            .padding(.horizontal, AdrazeArk.sidor)
            .padding(.top, 70)
            .padding(.bottom, 40)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .task { await kontot.uppdatera() }
    }

    private func rad(_ ikon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: ikon).font(.system(size: 15, weight: .semibold)).foregroundStyle(tema[.accentText])
                .frame(width: 22)
            Text(text).font(Typsnitt.grotesk(15, relativTill: .subheadline)).foregroundStyle(tema.dampad)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Profilbild ur en data-URL, annars initialen på en varm ton.
struct KontoAvatar: View {
    let namn: String
    let dataUrl: String?
    let storlek: CGFloat
    @Environment(Tema.self) private var tema

    var body: some View {
        Group {
            if let bild = KontoAvatar.bild(dataUrl) {
                Image(uiImage: bild).resizable().scaledToFill()
            } else {
                ZStack {
                    tema[.accentMjuk]
                    Text(String(namn.prefix(1)).uppercased())
                        .font(Typsnitt.rubrik(storlek * 0.42, vikt: 600))
                        .foregroundStyle(tema[.accentText])
                }
            }
        }
        .frame(width: storlek, height: storlek)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    static func bild(_ dataUrl: String?) -> UIImage? {
        guard let s = dataUrl, s.hasPrefix("data:image/"), let komma = s.firstIndex(of: ",") else { return nil }
        return Data(base64Encoded: String(s[s.index(after: komma)...])).flatMap(UIImage.init(data:))
    }
}
