import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

// MARK: - Raden överst i en konversation

/// Överst i varje konversation: vilken kryptering chatten har, sagt så att det stämmer (plan 4, 5.4).
/// "aldrig AdRaze kan läsa" står bara i chattar som faktiskt är end-to-end-krypterade och utan varning.
struct E2EKonversationsrad: View {
    let lage: ChattLage
    let konv: KonvId
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema

    var body: some View {
        if let v2 = lage.lager as? ChattV2 {
            innehall(v2, v2.kryptering(konv))
                .padding(.top, 10).padding(.bottom, 6)
        }
    }

    private var namn: String { lage.namn(konv) }

    @ViewBuilder private func innehall(_ v2: ChattV2, _ k: ChattV2.Kryptering) -> some View {
        switch k {
        case .e2e(let aldreFore):
            Button {
                if konv.sort == .dm, let u = v2.uuid(for: konv.id) { E2EArk.visa(app, E2ESakerhetsnummerVy(v2: v2, uuid: u, namn: namn)) }
                else { E2EArk.visa(app, E2EGruppensNummer(v2: v2, lage: lage, konv: konv)) }
            } label: {
                E2EKort(ikon: "lock.fill", ton: .e2e, rubrik: ct("End-to-end-krypterat"),
                        text: (konv.sort == .grupp
                               ? ct("Bara gruppmedlemmarnas enheter har nycklarna – aldrig AdRaze kan läsa det ni skriver här.")
                               : ct("Bara era enheter har nycklarna – aldrig AdRaze kan läsa det ni skriver här."))
                            + (aldreFore.map { " " + ct("Meddelanden som skickades före {tid} har den äldre krypteringen.", ["tid": Self.tidpunkt($0)]) } ?? ""),
                        knapp: konv.sort == .grupp ? ct("Säkerhetsnummer för medlemmarna") : ct("Säkerhetsnummer"))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("e2e.rad.e2e")
        case .varning(let uuid, let blockerad):
            // Valen finns i rutan nederst (E2EKonversationsfot), som syns var man än är i chatten
            Button { E2EArk.visa(app, E2ESakerhetsnummerVy(v2: v2, uuid: uuid, namn: namn)) } label: {
                E2EKort(ikon: "exclamationmark.shield.fill", ton: .varning, rubrik: ct("Säkerhetsnumret med {namn} har ändrats", ["namn": namn]),
                        text: E2EKonversationsfot.forklaring(namn, blockerad: blockerad), knapp: ct("Visa numret"))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("e2e.rad.varning")
        case .aldre(let orsak):
            if orsak == .inteLankad {
                Button { E2EArk.visa(app, E2EOversikt(v2: v2)) } label: {
                    E2EKort(ikon: "lock.open", ton: .aldre, rubrik: ct("Äldre kryptering"), text: aldreText(orsak), knapp: ct("Länka den här iPhonen"))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("e2e.rad.aldre")
            } else {
                E2EKort(ikon: "lock.open", ton: .aldre, rubrik: ct("Äldre kryptering"), text: aldreText(orsak))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("e2e.rad.aldre")
            }
        }
    }

    /// "i dag kl. 14:06", "i går kl. 09:12", "måndag 16 november kl. 20:30"
    static func tidpunkt(_ d: Date) -> String {
        ct("{dag} kl. {klocka}", ["dag": ChattTid.dag(d).lowercased(), "klocka": ChattTid.klocka(d)])
    }

    private func aldreText(_ o: ChattV2.Kryptering.Orsak) -> String {
        switch o {
        case .kontaktenSaknar(let u):
            return ct("AdRazes server kan låsa upp nycklarna. När {u} uppdaterar AdRaze krypteras chatten end-to-end.", ["u": u == "?" ? namn : u])
        case .grupp:
            return ct("AdRazes server kan låsa upp gruppens nyckel. Grupper som skapas när alla har uppdaterat AdRaze krypteras end-to-end.")
        case .inteLankad:
            return ct("AdRazes server kan låsa upp nycklarna. Den här iPhonen är inte länkad till din end-to-end-krypterade chatt än.")
        case .startar:
            return ct("AdRazes server kan låsa upp nycklarna.")
        }
    }
}

/// Kortet i konversationen (krypteringen, varningen).
struct E2EKort: View {
    enum Ton { case e2e, varning, aldre }
    let ikon: String
    let ton: Ton
    let rubrik: String
    let text: String
    var knapp: String?
    @Environment(Tema.self) private var tema

    var body: some View {
        let farg: Color = ton == .e2e ? tema[.accentText] : ton == .varning ? tema[.varning] : tema.dampad
        VStack(spacing: 6) {
            HStack(spacing: 7) {
                Image(systemName: ikon).font(.system(size: 12.5, weight: .bold)).foregroundStyle(farg)
                Text(rubrik).font(Typsnitt.grotesk(13.5, vikt: 700, relativTill: .footnote)).foregroundStyle(ton == .aldre ? tema.text : farg)
                    .multilineTextAlignment(.center)
            }
            Text(text).font(Typsnitt.grotesk(13, relativTill: .footnote)).foregroundStyle(tema.dampad)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            if let knapp {
                Text(knapp).font(Typsnitt.grotesk(13, vikt: 650, relativTill: .footnote)).foregroundStyle(tema[.accentText]).padding(.top, 1)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: 340)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(ton == .e2e ? tema[.accentMjuk] : tema.yta.opacity(0.94)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(ton == .varning ? tema[.varning].opacity(0.55) : tema.linje, lineWidth: 1))
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Rutan ovanför skrivfältet

/// Ovanför skrivfältet när säkerhetsnumret har ändrats: syns var man än är i chatten, med valen. För en verifierad
/// kontakt skickas inget förrän numret är godkänt (kärnan stoppar sändningen, inte bara vyn).
struct E2EKonversationsfot: View {
    let lage: ChattLage
    let konv: KonvId
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema

    static func forklaring(_ namn: String, blockerad: Bool) -> String {
        blockerad
            ? ct("Du hade verifierat {namn}. Inget skickas förrän du har jämfört det nya numret och godkänt det.", ["namn": namn])
            : ct("Det händer när {namn} börjar om chatten utan återställningskoden, eller om någon försöker komma emellan. Jämför numret om du vill vara säker.", ["namn": namn])
    }

    var body: some View {
        if let v2 = lage.lager as? ChattV2 {
            VStack(spacing: 0) {
                if case .varning(let uuid, let blockerad) = v2.kryptering(konv) { ruta(v2, uuid, blockerad) }
            }
            .frame(maxWidth: .infinity, minHeight: 0.5)
            .onChange(of: lage.provSkarm) { _, s in
                // Självtestet: säkerhetsnumret (tvåpersonschatt) eller medlemmarnas nummer (grupp)
                if s == "e2e-nummer", !E2EArk.visas {
                    if konv.sort == .dm, let u = v2.uuid(for: konv.id) { E2EArk.visa(app, E2ESakerhetsnummerVy(v2: v2, uuid: u, namn: lage.namn(konv))) }
                    else { E2EArk.visa(app, E2EGruppensNummer(v2: v2, lage: lage, konv: konv)) }
                } else if s == nil { E2EArk.stang() }
            }
        }
    }

    private func ruta(_ v2: ChattV2, _ uuid: String, _ blockerad: Bool) -> some View {
        let namn = lage.namn(konv)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.shield.fill").font(.system(size: 18, weight: .semibold)).foregroundStyle(tema[.varning])
                VStack(alignment: .leading, spacing: 3) {
                    Text(ct("Säkerhetsnumret med {namn} har ändrats", ["namn": namn])).font(Typsnitt.grotesk(15, vikt: 700, relativTill: .subheadline))
                        .foregroundStyle(tema.text)
                    Text(blockerad ? ct("Inget skickas förrän du har jämfört och godkänt det nya numret.")
                                   : ct("Jämför numret med {namn} om du vill vara säker.", ["namn": namn]))
                        .font(Typsnitt.grotesk(13.5, relativTill: .footnote)).foregroundStyle(tema.dampad).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(spacing: 10) {
                Button { E2EArk.visa(app, E2ESakerhetsnummerVy(v2: v2, uuid: uuid, namn: namn)) } label: {
                    Text(ct("Visa numret")).font(Typsnitt.grotesk(14.5, vikt: 650)).frame(maxWidth: .infinity).frame(height: 40)
                }
                .buttonStyle(ChattKnapp(.sekundar))
                Button {
                    ChattHaptik.val()
                    Task { if blockerad { try? await v2.godkann(uuid) } else { v2.varningSedd(uuid) } }
                } label: {
                    Text(blockerad ? ct("Godkänn") : ct("OK")).font(Typsnitt.grotesk(14.5, vikt: 650)).frame(maxWidth: .infinity).frame(height: 40)
                }
                .buttonStyle(ChattKnapp(.primar))
                .accessibilityIdentifier("e2e.varning.ok")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema.yta))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(tema[.varning].opacity(0.6), lineWidth: 1))
        .padding(.horizontal, 12).padding(.bottom, 6)
        .accessibilityIdentifier("e2e.fot.varning")
    }
}

// MARK: - Knappen i inkorgen

/// Hänglåset bredvid "Nytt meddelande": krypteringen för den här iPhonen. En orange prick när något behöver göras
/// (återställningskoden är inte sparad, eller iPhonen är inte länkad).
struct E2EInkorgsknapp: View {
    let lage: ChattLage
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema

    var body: some View {
        // Bara när servern har E2E (inte före driftsättningen, och inte medan det startar)
        if let v2 = lage.lager as? ChattV2, v2.lage != .av, v2.lage != .startar {
            Button { E2EArk.visa(app, E2EOversikt(v2: v2)) } label: {
                Image(systemName: v2.lage == .aktiv ? "lock.shield" : "lock.open")
                    .font(.system(size: 17, weight: .semibold)).frame(width: 40, height: 40)
                    .overlay(alignment: .topTrailing) {
                        if v2.kodEjSparad || v2.lage == .behoverLankas {
                            Circle().fill(tema.accent).frame(width: 9, height: 9).offset(x: -6, y: 6)
                        }
                    }
            }
            .buttonStyle(ChattKnapp(.ikon))
            .accessibilityLabel(ct("Kryptering"))
            .accessibilityIdentifier("e2e.knapp")
            .onChange(of: lage.provSkarm) { _, s in
                // Självtestet: översikten öppnas och stängs härifrån
                if s == "e2e", !E2EArk.visas { E2EArk.visa(app, E2EOversikt(v2: v2)) } else if s == nil { E2EArk.stang() }
            }
        }
    }
}

// MARK: - Översikten

/// Kryptering för den här iPhonen: status, återställningskoden, egna enheter, länka en ny enhet och (om iPhonen
/// inte är länkad) länka den eller återställa med koden.
struct E2EOversikt: View {
    let v2: ChattV2
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var enheter: [[String: Any]] = []
    @State private var visaKod = false
    @State private var skanna = false
    @State private var visaQr = false
    @State private var aterstall = false
    @State private var fel: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    huvud
                    switch v2.lage {
                    case .aktiv: aktiv
                    case .behoverLankas: ejLankad
                    case .av, .startar: ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
                    case .fel(let t):
                        Text(t).font(Typsnitt.grotesk(15)).foregroundStyle(tema[.fara])
                        Button { Task { await v2.startaE2E() } } label: { Text(ct("Försök igen")).frame(maxWidth: .infinity).frame(height: 48) }
                            .buttonStyle(ChattKnapp(.primar))
                    }
                    ChattInfosektion(rubrik: ct("Det här ser AdRaze")) {
                        Text(ct("Vem du chattar med och när, hur stora meddelandena är och vilka enheter du har. Inte vad som skrivs, inte bilderna och inte gruppernas namn."))
                            .font(Typsnitt.grotesk(14.5, relativTill: .subheadline)).foregroundStyle(tema.text)
                            .padding(16).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 40)
            }
            .background(tema.bakgrund)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Krysset till höger, som i appens andra ark
                ToolbarItem(placement: .topBarTrailing) {
                    Button { stang() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .bold)) }
                        .tint(tema.text)   // som Stangknapp: textfärgen, inte accenten
                        .accessibilityLabel(ct("Stäng"))
                }
            }
            .navigationDestination(isPresented: $visaKod) { E2EKodVy(v2: v2) }
            .navigationDestination(isPresented: $skanna) { E2ELankaNyEnhet(v2: v2) }
            .navigationDestination(isPresented: $visaQr) { E2ELankaDennaIphone(v2: v2) }
            .navigationDestination(isPresented: $aterstall) { E2EAterstallVy(v2: v2) }
        }
        .task { await laddaEnheter() }
        .onChange(of: v2.lage) { _, _ in Task { await laddaEnheter() } }
        .onAppear {
            switch E2EProvlage.oversiktSteg {
            case "kod": visaKod = true
            case "lanka": skanna = true
            case "visaqr": visaQr = true
            case "aterstall": aterstall = true
            default: break
            }
            E2EProvlage.oversiktSteg = nil
        }
    }

    private var huvud: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                Circle().fill(tema[.accentMjuk]).frame(width: 64, height: 64)
                Image(systemName: v2.lage == .aktiv ? "lock.shield.fill" : "lock.open").font(.system(size: 27, weight: .semibold))
                    .foregroundStyle(tema[.accentText])
            }
            Text(ct("Kryptering")).font(Typsnitt.rubrik(30, vikt: 620)).foregroundStyle(tema.text)
            Text(v2.lage == .aktiv
                 ? ct("Nya chattar krypteras på dina enheter. Bara du och de du chattar med kan läsa dem, inte AdRaze. Äldre meddelanden ligger kvar med den äldre krypteringen.")
                 : ct("Den här iPhonen har inga nycklar för end-to-end-krypteringen än. Tills den är länkad går chattarna med den äldre krypteringen, som AdRazes server kan låsa upp."))
                .font(Typsnitt.grotesk(15.5, relativTill: .body)).foregroundStyle(tema.dampad).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 6)
    }

    @ViewBuilder private var aktiv: some View {
        if v2.kodEjSparad {
            Button { visaKod = true } label: {
                HStack(spacing: 12) {
                    Image(systemName: "key.fill").font(.system(size: 18, weight: .semibold)).foregroundStyle(tema[.paAccent])
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ct("Spara din återställningskod")).font(Typsnitt.grotesk(16, vikt: 700)).foregroundStyle(tema[.paAccent])
                        Text(ct("Tappar du alla enheter är koden enda sättet att behålla ditt säkerhetsnummer.")).font(Typsnitt.grotesk(13.5))
                            .foregroundStyle(tema[.paAccent].opacity(0.9)).multilineTextAlignment(.leading)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(tema[.paAccent])
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema.accent))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("e2e.sparakod")
        }
        ChattInfosektion(rubrik: ct("Dina enheter"), fot: ct("Varje enhet har egna nycklar. Ta bort en enhet du inte känner igen.")) {
            ForEach(Array(enheter.enumerated()), id: \.offset) { i, e in
                if i > 0 { ChattAvdelare() }
                let id = Int(E2EJSON.tal(e["id"]) ?? 0)
                let denna = id == v2.e2e?.enhetId
                HStack(spacing: 13) {
                    Image(systemName: (e["plattform"] as? String) == "ios" ? "iphone" : "desktopcomputer").font(.system(size: 17, weight: .medium))
                        .foregroundStyle(tema[.accentText]).frame(width: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text((e["namn"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? ct("Enhet {n}", ["n": String(id)]))
                            .font(Typsnitt.grotesk(16, vikt: 500)).foregroundStyle(tema.text)
                        Text(denna ? ct("Den här iPhonen") : ct("Länkad {datum}", ["datum": ChattTid.dag(Date(timeIntervalSince1970: Double(E2EJSON.tal(e["skapad"]) ?? 0) / 1000)).lowercased()]))
                            .font(Typsnitt.grotesk(13)).foregroundStyle(tema.dampad)
                    }
                    Spacer()
                    if !denna {
                        Button(role: .destructive) { Task { try? await v2.e2e?.taBortEnhet(id); await laddaEnheter() } } label: {
                            Text(ct("Ta bort")).font(Typsnitt.grotesk(14, vikt: 600)).foregroundStyle(tema[.fara])
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16).frame(minHeight: 58)
            }
        }
        ChattInfosektion(rubrik: nil) {
            Button { skanna = true } label: { ChattInforad(ikon: "qrcode.viewfinder", text: ct("Länka en ny enhet"), pil: true) }
                .buttonStyle(ChattRadknapp())
                .accessibilityIdentifier("e2e.lanka")
            ChattAvdelare()
            Button { visaKod = true } label: { ChattInforad(ikon: "key", text: ct("Återställningskod"), pil: true) }
                .buttonStyle(ChattRadknapp())
        }
    }

    @ViewBuilder private var ejLankad: some View {
        ChattInfosektion(rubrik: ct("Länka den här iPhonen"),
                         fot: ct("Din chatt har redan end-to-end-kryptering på en annan enhet. Visa en QR-kod här och skanna den med AdRaze på en enhet som har kamera, eller skriv återställningskoden.")) {
            Button { visaQr = true } label: { ChattInforad(ikon: "qrcode", text: ct("Visa QR-kod"), pil: true) }
                .buttonStyle(ChattRadknapp())
                .accessibilityIdentifier("e2e.visaqr")
            ChattAvdelare()
            Button { aterstall = true } label: { ChattInforad(ikon: "key", text: ct("Skriv återställningskoden"), pil: true) }
                .buttonStyle(ChattRadknapp())
        }
    }

    private func laddaEnheter() async {
        guard v2.lage == .aktiv, let s = try? await v2.e2e?.serverstatus() else { enheter = []; return }
        enheter = E2EJSON.lista(s["enheter"])
    }
}

// MARK: - Säkerhetsnummer

/// 60 siffror i 12 grupper och en QR-kod (samma uppbyggnad som Signals säkerhetsnummer). Skanna den andras kod
/// med kameran, eller jämför siffrorna, så vet ni att ingen sitter emellan – inte heller AdRaze.
struct E2ESakerhetsnummerVy: View {
    let v2: ChattV2
    let uuid: String
    let namn: String
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var grupper: [String] = []
    @State private var qr = ""
    @State private var verifierad = false
    @State private var skannar = false
    @State private var utfall: (ok: Bool, text: String)?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Text(ct("Du och {namn}", ["namn": namn])).font(Typsnitt.rubrik(26, vikt: 620)).foregroundStyle(tema.text)
                    if verifierad {
                        Label(ct("Verifierad"), systemImage: "checkmark.seal.fill").font(Typsnitt.grotesk(14.5, vikt: 650))
                            .foregroundStyle(tema[.sakert])
                            .accessibilityIdentifier("e2e.nummer.verifierad")
                    }
                    if let bild = E2EQR.bild(qr) {
                        Image(uiImage: bild).interpolation(.none).resizable().scaledToFit()
                            .frame(width: 200, height: 200).padding(14)
                            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.white))
                            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
                            .accessibilityLabel(ct("QR-kod med säkerhetsnumret"))
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 10) {
                        ForEach(Array(grupper.enumerated()), id: \.offset) { _, g in
                            Text(g).font(.system(size: 19, weight: .medium, design: .monospaced)).foregroundStyle(tema.text)
                        }
                    }
                    .padding(.horizontal, 6)
                    .accessibilityIdentifier("e2e.nummer.siffror")
                    Text(ct("Jämför siffrorna med {namn}, eller skanna {namn}s kod med kameran. Stämmer de vet ni att ingen sitter emellan – inte heller AdRaze.", ["namn": namn]))
                        .font(Typsnitt.grotesk(14.5, relativTill: .subheadline)).foregroundStyle(tema.dampad)
                        .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                    if let u = utfall {
                        Label(u.text, systemImage: u.ok ? "checkmark.circle.fill" : "xmark.octagon.fill")
                            .font(Typsnitt.grotesk(14.5, vikt: 600)).foregroundStyle(u.ok ? tema[.sakert] : tema[.fara])
                    }
                    VStack(spacing: 10) {
                        Button { skannar = true } label: {
                            Label(ct("Skanna koden"), systemImage: "qrcode.viewfinder").font(Typsnitt.grotesk(16, vikt: 650))
                                .frame(maxWidth: .infinity).frame(height: 50)
                        }
                        .buttonStyle(ChattKnapp(.primar))
                        Button {
                            Task {
                                if verifierad { try? await v2.e2e?.avverifiera(uuid) } else { _ = try? await v2.e2e?.verifiera(uuid, qr: nil) }
                                ladda()
                            }
                        } label: {
                            Text(verifierad ? ct("Ta bort verifieringen") : ct("Markera som verifierad")).font(Typsnitt.grotesk(15.5, vikt: 600))
                                .frame(maxWidth: .infinity).frame(height: 46)
                        }
                        .buttonStyle(ChattKnapp(.sekundar))
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 22).padding(.top, 10).padding(.bottom, 40)
            }
            .background(tema.bakgrund)
            .navigationTitle(ct("Säkerhetsnummer"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Krysset till höger, som i appens andra ark
                ToolbarItem(placement: .topBarTrailing) {
                    Button { stang() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .bold)) }
                        .tint(tema.text)   // som Stangknapp: textfärgen, inte accenten
                        .accessibilityLabel(ct("Stäng"))
                }
            }
            .navigationDestination(isPresented: $skannar) {
                E2ESkanna(rubrik: ct("Skanna {namn}s kod", ["namn": namn]), text: ct("Be {namn} öppna säkerhetsnumret för er chatt och rikta kameran mot koden.", ["namn": namn])) { kod in
                    skannar = false
                    Task { await kontrollera(kod) }
                }
            }
        }
        .onAppear { ladda() }
        .onReceive(NotificationCenter.default.publisher(for: E2EProvlage.skanna)) { _ in skannar = true }
    }

    private func ladda() {
        guard let r = try? v2.e2e?.sakerhetsnummer(uuid) else { return }
        grupper = (r["grupper"] as? [String]) ?? []
        qr = r["qr"] as? String ?? ""
        verifierad = r["verifierad"] as? Bool ?? false
        v2.uppdatera()
    }

    private func kontrollera(_ kod: String) async {
        do {
            let ok = try await v2.e2e?.verifiera(uuid, qr: kod) ?? false
            utfall = ok ? (true, ct("Numren stämmer. {namn} är verifierad.", ["namn": namn]))
                        : (false, ct("Numren stämmer inte. Skanna koden igen, eller jämför siffrorna."))
            ok ? ChattHaptik.klart() : ChattHaptik.fel()
        } catch { utfall = (false, error.localizedDescription) }
        ladda()
    }
}

/// Säkerhetsnumren för medlemmarna i en E2E-grupp.
struct E2EGruppensNummer: View {
    let v2: ChattV2
    let lage: ChattLage
    let konv: KonvId
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var stang
    @State private var medlemmar: [ChattMedlem] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(ct("Gruppens meddelanden krypteras med en nyckel som bara medlemmarnas enheter har. Den byts när någon lämnar gruppen. Jämför säkerhetsnumret med var och en för att veta att ingen sitter emellan."))
                        .font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad).fixedSize(horizontal: false, vertical: true)
                    ChattInfosektion(rubrik: ct("Medlemmar")) {
                        ForEach(Array(medlemmar.filter { $0.id != lage.jag?.id }.enumerated()), id: \.offset) { i, m in
                            if i > 0 { ChattAvdelare() }
                            Button {
                                if let u = v2.uuid(for: m.id) { E2EArk.visa(app, E2ESakerhetsnummerVy(v2: v2, uuid: u, namn: m.anvandarnamn)) }
                            } label: { ChattInforad(ikon: "person.badge.shield.checkmark", text: m.anvandarnamn, varde: ct("Säkerhetsnummer"), pil: true) }
                            .buttonStyle(ChattRadknapp())
                        }
                    }
                }
                .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 40)
            }
            .background(tema.bakgrund)
            .navigationTitle(ct("End-to-end-krypterat"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Krysset till höger, som i appens andra ark
                ToolbarItem(placement: .topBarTrailing) {
                    Button { stang() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .bold)) }
                        .tint(tema.text)   // som Stangknapp: textfärgen, inte accenten
                        .accessibilityLabel(ct("Stäng"))
                }
            }
        }
        .task { medlemmar = (try? await lage.lager.medlemmar(konv.id)) ?? [] }
    }
}

// MARK: - Återställningskoden

struct E2EKodVy: View {
    let v2: ChattV2
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var tillbaka
    @State private var visa = false

    private var grupper: [String] {
        let k = Array(v2.e2e?.aterstallningskod() ?? "")
        return stride(from: 0, to: k.count, by: 4).map { String(k[$0..<min(k.count, $0 + 4)]) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(ct("Återställningskod")).font(Typsnitt.rubrik(28, vikt: 620)).foregroundStyle(tema.text)
                Text(ct("Det här är din återställningskod. Tappar du alla enheter får en ny enhet med koden samma identitet, så att säkerhetsnumret med dina kontakter inte ändras. Meddelandena som fanns på enheterna kommer inte tillbaka: de sparas inte på servern. AdRaze har inte koden och kan inte hjälpa dig om den försvinner."))
                    .font(Typsnitt.grotesk(15.5)).foregroundStyle(tema.dampad).fixedSize(horizontal: false, vertical: true)
                ZStack {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 10) {
                        ForEach(Array(grupper.enumerated()), id: \.offset) { _, g in
                            Text(g).font(.system(size: 18, weight: .semibold, design: .monospaced)).foregroundStyle(tema.text)
                        }
                    }
                    .padding(18)
                    .blur(radius: visa ? 0 : 9)
                    .accessibilityIdentifier("e2e.kod")
                    if !visa {
                        Button { visa = true } label: {
                            Label(ct("Visa koden"), systemImage: "eye").font(Typsnitt.grotesk(15.5, vikt: 650)).padding(.horizontal, 18).frame(height: 44)
                        }
                        .buttonStyle(ChattKnapp(.sekundar))
                    }
                }
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(tema.yta))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
                Text(ct("Skriv ner den eller spara den i en lösenordshanterare. Visa den aldrig för någon som säger att den jobbar på AdRaze."))
                    .font(Typsnitt.grotesk(14)).foregroundStyle(tema.dampad).fixedSize(horizontal: false, vertical: true)
                if v2.kodEjSparad {
                    Button { v2.kodArSparad(); tillbaka() } label: {
                        Text(ct("Jag har sparat koden")).font(Typsnitt.grotesk(16, vikt: 650)).frame(maxWidth: .infinity).frame(height: 50)
                    }
                    .buttonStyle(ChattKnapp(.primar))
                    .disabled(!visa)
                }
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(tema.bakgrund.ignoresSafeArea())
        .onAppear { if E2EProvlage.visaKoden { visa = true } }
    }
}

/// Självtestet: vyerna visar det som annars kräver ett tryck (koden, länkningens kontrollkod).
@MainActor
enum E2EProvlage {
    static var visaKoden = false
    /// Översikten öppnar det här steget direkt ("kod", "lanka", "visaqr", "aterstall").
    static var oversiktSteg: String?
    /// Kontrollkoden som visas när en enhet länkas (självtestet jämför den med den andra enhetens).
    static var kontroll: String?
    /// QR-koden som den här iPhonen visar när den ska länkas (självtestet ger den till motparten).
    static var lankQr: String?
    /// Länka en ny enhet: tryck "Ja, länka". Säkerhetsnumret: tryck "Skanna koden".
    static let godkann = Notification.Name("e2e.prov.godkann")
    static let skanna = Notification.Name("e2e.prov.skanna")
    /// En QR-kod som "skannas" direkt (simulatorn har ingen kamera).
    static var skannadKod: String?
}

struct E2EAterstallVy: View {
    let v2: ChattV2
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var tillbaka
    @State private var kod = ""
    @State private var arbetar = false
    @State private var fel: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(ct("Skriv återställningskoden")).font(Typsnitt.rubrik(28, vikt: 620)).foregroundStyle(tema.text)
                Text(ct("64 tecken, bokstäver och siffror. Mellanslag och bindestreck spelar ingen roll. Med koden får den här iPhonen samma identitet som förut, så säkerhetsnumren ändras inte. Gamla meddelanden och grupper kommer inte med."))
                    .font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad).fixedSize(horizontal: false, vertical: true)
                TextField("", text: $kod, axis: .vertical)
                    .font(.system(size: 17, weight: .medium, design: .monospaced))
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .lineLimit(3...5)
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(tema[.falt]))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(tema[.faltlinje], lineWidth: 1))
                if let fel { Text(fel).font(Typsnitt.grotesk(14.5, vikt: 600)).foregroundStyle(tema[.fara]) }
                Button {
                    arbetar = true
                    fel = nil
                    Task {
                        do {
                            try await v2.e2e?.aterstall(kod: kod)
                            await v2.lankad()
                            tillbaka()
                        } catch { fel = error.localizedDescription }
                        arbetar = false
                    }
                } label: {
                    Group { if arbetar { ProgressView() } else { Text(ct("Återställ")) } }
                        .font(Typsnitt.grotesk(16, vikt: 650)).frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(ChattKnapp(.primar))
                .disabled(arbetar || kod.filter { $0.isLetter || $0.isNumber }.count != 64)
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(tema.bakgrund.ignoresSafeArea())
    }
}

// MARK: - Länka

/// Den här iPhonen har E2E: skanna QR-koden som den nya enheten visar, jämför kontrollkoden och godkänn.
struct E2ELankaNyEnhet: View {
    let v2: ChattV2
    @Environment(Tema.self) private var tema
    @State private var steg: Steg = .skanna
    @State private var lid = ""

    enum Steg: Equatable { case skanna, ansluter, kontroll(kod: String, namn: String), klar(String), fel(String) }

    var body: some View {
        Group {
            switch steg {
            case .skanna:
                E2ESkanna(rubrik: ct("Länka en ny enhet"),
                          text: ct("Öppna AdRaze på den nya enheten, välj Kryptering › Länka den här enheten och rikta kameran mot QR-koden.")) { kod in
                    Task { await skannad(kod) }
                }
            case .ansluter:
                VStack(spacing: 14) { ProgressView(); Text(ct("Ansluter …")).font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .kontroll(let kod, let namn):
                VStack(spacing: 18) {
                    Text(ct("Står samma kod på {namn}?", ["namn": namn.isEmpty ? ct("den nya enheten") : namn]))
                        .font(Typsnitt.rubrik(24, vikt: 620)).foregroundStyle(tema.text).multilineTextAlignment(.center)
                    Text(kod).font(.system(size: 64, weight: .bold, design: .rounded)).foregroundStyle(tema[.accentText])
                        .accessibilityIdentifier("e2e.lanka.kontrollkod")
                    Text(ct("Länka bara om koden stämmer. Den nya enheten får din identitet och kan läsa nya meddelanden."))
                        .font(Typsnitt.grotesk(14.5)).foregroundStyle(tema.dampad).multilineTextAlignment(.center)
                    HStack(spacing: 10) {
                        Button { v2.e2e?.lankaAvbryt(); steg = .fel(ct("Länkningen avbröts.")) } label: {
                            Text(ct("Nej")).font(Typsnitt.grotesk(16, vikt: 650)).frame(maxWidth: .infinity).frame(height: 50)
                        }
                        .buttonStyle(ChattKnapp(.sekundar))
                        Button { Task { await godkann(namn) } } label: {
                            Text(ct("Ja, länka")).font(Typsnitt.grotesk(16, vikt: 650)).frame(maxWidth: .infinity).frame(height: 50)
                        }
                        .buttonStyle(ChattKnapp(.primar))
                        .accessibilityIdentifier("e2e.lanka.ja")
                    }
                }
                .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .klar(let namn):
                VStack(spacing: 14) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 54)).foregroundStyle(tema[.sakert])
                    Text(ct("{namn} är länkad", ["namn": namn.isEmpty ? ct("Enheten") : namn])).font(Typsnitt.rubrik(24, vikt: 620)).foregroundStyle(tema.text)
                    Text(ct("Nya meddelanden krypteras nu även till den. Äldre E2E-meddelanden finns bara på dina andra enheter."))
                        .font(Typsnitt.grotesk(14.5)).foregroundStyle(tema.dampad).multilineTextAlignment(.center)
                }
                .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .fel(let t):
                VStack(spacing: 14) {
                    Image(systemName: "xmark.octagon").font(.system(size: 44)).foregroundStyle(tema[.fara])
                    Text(t).font(Typsnitt.grotesk(15.5)).foregroundStyle(tema.text).multilineTextAlignment(.center)
                    Button { steg = .skanna } label: { Text(ct("Försök igen")).frame(maxWidth: .infinity).frame(height: 48) }
                        .buttonStyle(ChattKnapp(.primar))
                }
                .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(tema.bakgrund)
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(NotificationCenter.default.publisher(for: E2EProvlage.godkann)) { _ in
            if case .kontroll(_, let namn) = steg { Task { await godkann(namn) } }
        }
    }

    private func skannad(_ qr: String) async {
        steg = .ansluter
        do {
            guard let r = try await v2.e2e?.lankaSkannad(qr) else { return }
            lid = r.id
            steg = .kontroll(kod: r.kod, namn: r.namn)
            E2EProvlage.kontroll = r.kod
        } catch { steg = .fel(error.localizedDescription) }
    }

    private func godkann(_ namn: String) async {
        do {
            try await v2.e2e?.lankaGodkann(lid)
            steg = .klar(namn)
            ChattHaptik.klart()
        } catch { steg = .fel(error.localizedDescription) }
    }
}

/// Den här iPhonen saknar nycklar: visa en QR-kod som en länkad enhet med kamera skannar (plan 4, 3.10 A).
struct E2ELankaDennaIphone: View {
    let v2: ChattV2
    @Environment(Tema.self) private var tema
    @Environment(\.dismiss) private var tillbaka
    @State private var qr = ""
    @State private var kod: String?
    @State private var fel: String?
    @State private var klar = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text(ct("Länka den här iPhonen")).font(Typsnitt.rubrik(26, vikt: 620)).foregroundStyle(tema.text)
                if let kod {
                    Text(ct("Kontrollkod")).font(Typsnitt.grotesk(14, vikt: 650)).textCase(.uppercase).tracking(0.8).foregroundStyle(tema.dampad)
                    Text(kod).font(.system(size: 64, weight: .bold, design: .rounded)).foregroundStyle(tema[.accentText])
                    Text(ct("Godkänn på den andra enheten om den visar samma kod.")).font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad)
                        .multilineTextAlignment(.center)
                    if !klar { ProgressView() }
                } else if let bild = E2EQR.bild(qr) {
                    Image(uiImage: bild).interpolation(.none).resizable().scaledToFit().frame(width: 230, height: 230).padding(16)
                        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(.white))
                    Text(ct("Öppna AdRaze på din andra enhet, välj Kryptering › Länka en ny enhet och skanna koden."))
                        .font(Typsnitt.grotesk(15)).foregroundStyle(tema.dampad).multilineTextAlignment(.center)
                } else if fel == nil {
                    ProgressView().padding(40)
                }
                if klar {
                    Label(ct("Klart. Den här iPhonen är länkad."), systemImage: "checkmark.circle.fill").font(Typsnitt.grotesk(16, vikt: 650))
                        .foregroundStyle(tema[.sakert])
                }
                if let fel { Text(fel).font(Typsnitt.grotesk(15, vikt: 600)).foregroundStyle(tema[.fara]).multilineTextAlignment(.center) }
            }
            .padding(.horizontal, 22).padding(.top, 10).padding(.bottom, 40)
            .frame(maxWidth: .infinity)
        }
        .background(tema.bakgrund.ignoresSafeArea())
        .task { await kor() }
    }

    private func kor() async {
        guard let e2e = v2.e2e else { return }
        do {
            let b = try await e2e.lankaBorja()
            qr = b.qr
            E2EProvlage.lankQr = b.qr
            let k = try await e2e.lankaVantaPaSkanning(b.id)
            kod = k.kod
            E2EProvlage.kontroll = k.kod
            try await e2e.lankaTaEmot(b.id)
            klar = true
            await v2.lankad()
            ChattHaptik.klart()
        } catch is CancellationError {
            e2e.lankaAvbryt()
        } catch { fel = error.localizedDescription }
    }
}

// MARK: - Skanna QR-koder

/// Kameran läser en QR-kod. Utan kamera (simulatorn) går koden att klistra in.
struct E2ESkanna: View {
    let rubrik: String
    let text: String
    let hittad: (String) -> Void
    @Environment(Tema.self) private var tema
    @State private var inklistrad = ""
    @State private var klar = false

    var body: some View {
        VStack(spacing: 16) {
            Text(rubrik).font(Typsnitt.rubrik(24, vikt: 620)).foregroundStyle(tema.text).multilineTextAlignment(.center)
            Text(text).font(Typsnitt.grotesk(14.5)).foregroundStyle(tema.dampad).multilineTextAlignment(.center)
            if E2EKamera.finns {
                E2EKamera { kod in if !klar { klar = true; hittad(kod) } }
                    .frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "camera.metering.unknown").font(.system(size: 34)).foregroundStyle(tema.dampad)
                    Text(ct("Ingen kamera. Klistra in koden i stället.")).font(Typsnitt.grotesk(14.5)).foregroundStyle(tema.dampad)
                    TextField(ct("Koden"), text: $inklistrad).font(.system(size: 14, design: .monospaced))
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(12).background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tema[.falt]))
                    Button { if !klar { klar = true; hittad(inklistrad) } } label: {
                        Text(ct("Använd koden")).frame(maxWidth: .infinity).frame(height: 46)
                    }
                    .buttonStyle(ChattKnapp(.primar))
                    .disabled(inklistrad.isEmpty)
                }
                .padding(18)
                .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(tema.yta))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22).padding(.top, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(tema.bakgrund.ignoresSafeArea())
        .task {
            // Självtestet: simulatorn har ingen kamera, så koden "skannas" härifrån
            if let k = E2EProvlage.skannadKod {
                E2EProvlage.skannadKod = nil
                inklistrad = k
                try? await Task.sleep(nanoseconds: 900_000_000)
                if !klar { klar = true; hittad(k) }
            }
        }
    }
}

struct E2EKamera: UIViewControllerRepresentable {
    let hittad: (String) -> Void
    static var finns: Bool { AVCaptureDevice.default(for: .video) != nil }
    func makeUIViewController(context: Context) -> E2EKamerakontroller {
        let k = E2EKamerakontroller()
        k.hittad = hittad
        return k
    }
    func updateUIViewController(_ k: E2EKamerakontroller, context: Context) {}
}

final class E2EKamerakontroller: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var hittad: ((String) -> Void)?
    private let session = AVCaptureSession()
    private var forhand: AVCaptureVideoPreviewLayer?
    private var klar = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let enhet = AVCaptureDevice.default(for: .video), let ind = try? AVCaptureDeviceInput(device: enhet), session.canAddInput(ind) else { return }
        session.addInput(ind)
        let ut = AVCaptureMetadataOutput()
        guard session.canAddOutput(ut) else { return }
        session.addOutput(ut)
        ut.setMetadataObjectsDelegate(self, queue: .main)
        ut.metadataObjectTypes = [.qr]
        let l = AVCaptureVideoPreviewLayer(session: session)
        l.videoGravity = .resizeAspectFill
        view.layer.addSublayer(l)
        forhand = l
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { s.startRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        forhand?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { s.stopRunning() }
    }

    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objekt: [AVMetadataObject], from connection: AVCaptureConnection) {
        let text = (objekt.first as? AVMetadataMachineReadableCodeObject)?.stringValue
        MainActor.assumeIsolated {
            guard !self.klar, let text else { return }
            self.klar = true
            self.hittad?(text)
        }
    }
}

// MARK: - QR-koder

enum E2EQR {
    static func bild(_ text: String) -> UIImage? {
        guard !text.isEmpty else { return nil }
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(text.utf8)
        f.correctionLevel = "M"
        guard let ut = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(ut, from: ut.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
