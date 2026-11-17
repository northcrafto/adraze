import SwiftUI
import UIKit

/// Den tomma fliken: gorillan som äter reklam, en hälsning i Fraunces, skyddets läge och de mest besökta
/// sajterna. I en privat flik datorns "Du surfar privat" med sajtens figur. (Brygga kan senare ersätta den
/// med AdRazes webbstartsida; önskemål i slutrapporten.)
///
/// Ägare: Skal.
struct Startvy: View {
    let skal: SkalLage
    let privat: Bool
    let uppe: Bool

    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.colorScheme) private var schema

    var body: some View {
        let f = Skalfarger(tema, privat: privat)
        let tomt = privat || skal.bibliotek.toppsajter(8).isEmpty
        GeometryReader { g in
            ScrollView {
                Group {
                    if privat { privatInnehall(f) } else { vanligt(f) }
                }
                .padding(.horizontal, 26)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                // Utan mest besökta står innehållet lite ovanför mitten i stället för högst upp.
                .frame(minHeight: tomt ? g.size.height * 0.86 : 0, alignment: .center)
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize)
        }
        .background { bakgrund(f).ignoresSafeArea() }
    }

    @ViewBuilder private func bakgrund(_ f: Skalfarger) -> some View {
        if privat && schema == .dark {
            RadialGradient(colors: [Color.hex("#2a1148"), Color.hex("#170b2c"), Color.hex("#0c0716")],
                           center: .init(x: 0.5, y: 0.18), startRadius: 0, endRadius: 620)
        } else {
            f.sida
        }
    }

    // MARK: - Vanlig flik

    private func vanligt(_ f: Skalfarger) -> some View {
        let sajter = skal.bibliotek.toppsajter(8)
        return VStack(spacing: 0) {
            Image("SkalGorillaAd")
                .resizable()
                .interpolation(.high)
                .frame(width: 112, height: 112)
                .padding(.top, 30)
                .accessibilityHidden(true)
            Text(Self.halsning())
                .rubrik(38, vikt: 600, tak: 52)
                .foregroundStyle(f.text)
                .multilineTextAlignment(.center)
                .padding(.top, 18)
            Skyddsrad(farger: f)
                .padding(.top, 12)
            Text(uppe ? tr("Sök eller skriv en adress i fältet ovanför.") : tr("Sök eller skriv en adress i fältet nedanför."))
                .grotesk(14.5, tak: 22)
                .foregroundStyle(f.dampad)
                .multilineTextAlignment(.center)
                .padding(.top, 14)
            if !sajter.isEmpty {
                Text(tr("Mest besökta"))
                    .grotesk(12, vikt: 650, tak: 17)
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(f.dampad)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 40)
                    .padding(.bottom, 12)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 16) {
                    ForEach(sajter) { b in
                        Button { if let u = URL(string: b.url) { skal.ga(till: u) } } label: {
                            VStack(spacing: 7) {
                                Monogram(doman: domanFor(URL(string: b.url)), storlek: 52)
                                Text(domanFor(URL(string: b.url)))
                                    .grotesk(11.5, vikt: 560, tak: 16)
                                    .foregroundStyle(f.text)
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(Tryckstil(skala: 0.92))
                    }
                }
            }
        }
        .padding(.bottom, 40)
    }

    /// God morgon, god eftermiddag eller god kväll (datorns hälsningar).
    static func halsning(_ d: Date = Date()) -> String {
        let h = Calendar.current.component(.hour, from: d)
        if h >= 5 && h < 10 { return tr("God morgon") }
        if h >= 10 && h < 18 { return tr("God eftermiddag") }
        return tr("God kväll")
    }

    // MARK: - Privat flik

    private func privatInnehall(_ f: Skalfarger) -> some View {
        VStack(spacing: 0) {
            Illustration(namn: "Privat", accent: f.accent)
                .frame(maxWidth: 210)
                .padding(.top, 24)
            Text(tr("Du surfar privat"))
                .rubrik(32, vikt: 620, tak: 46)
                .foregroundStyle(f.text)
                .multilineTextAlignment(.center)
                .padding(.top, 22)
            Text(tr("Ingen ser vad du gör här. Ingen historik, inga kakor och inga spår när du stänger fliken — hur mycket någon än försöker kika."))
                .grotesk(15.5, tak: 24)
                .foregroundStyle(f.dampad)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.top, 10)
            Flodeslayout(luft: 8) {
                chip(f, .historik, tr("Ingen historik"))
                chip(f, .las, tr("Inga kakor sparas"))
                chip(f, .oga, tr("Inga spår"))
            }
            .padding(.top, 26)
            Skyddsrad(farger: f)
                .padding(.top, 22)
        }
        .padding(.bottom, 40)
    }

    private func chip(_ f: Skalfarger, _ ikon: Ikon, _ text: String) -> some View {
        HStack(spacing: 6) {
            Ikonvy(ikon, storlek: 15, streck: 2).foregroundStyle(f.accentText)
            Text(text).grotesk(13, vikt: 600, tak: 18).foregroundStyle(f.text)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(f.accentMjuk))
        .overlay(Capsule().strokeBorder(f.accent.opacity(0.28)))
    }
}

/// Skyddets läge som en liten rad: "AdRaze skyddar dig" när skyddet är igång.
struct Skyddsrad: View {
    let farger: Skalfarger
    @Environment(AppMiljo.self) private var app

    var body: some View {
        let lage = app.skydd.lage
        let (ikon, text, pa): (Ikon, String, Bool) = {
            switch lage {
            case .klart: return (.skoldKoll, tr("AdRaze skyddar dig"), true)
            case .laddar: return (.skoldSok, tr("Skyddet laddas"), false)
            case .av: return (.skoldAv, tr("Skyddet är av"), false)
            case .fel(let t): return (.skoldVarning, tr(t), false)
            }
        }()
        HStack(spacing: 7) {
            Ikonvy(ikon, storlek: 16, streck: 2)
                .foregroundStyle(pa ? farger.accentText : farger.dampad)
            Text(text)
                .grotesk(13, vikt: 620, tak: 18)
                .foregroundStyle(pa ? farger.text : farger.dampad)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(pa ? farger.accentMjuk : farger.dampad.opacity(0.1)))
    }
}

/// Lägger barnen på rader som bryts när de inte får plats (för chippen; långa tyska ord ska få plats).
struct Flodeslayout: Layout {
    var luft: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let bredd = proposal.width ?? .infinity
        let allaRader = rader(subviews, bredd: bredd)
        let h = allaRader.map { $0.hojd }.reduce(0, +) + luft * CGFloat(max(0, allaRader.count - 1))
        let w = allaRader.map { $0.bredd }.max() ?? 0
        return CGSize(width: min(w, bredd), height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for rad in rader(subviews, bredd: bounds.width) {
            var x = bounds.minX + (bounds.width - rad.bredd) / 2
            for i in rad.index {
                let s = subviews[i].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                subviews[i].place(at: CGPoint(x: x, y: y + (rad.hojd - s.height) / 2), proposal: ProposedViewSize(s))
                x += s.width + luft
            }
            y += rad.hojd + luft
        }
    }

    private struct Rad { var index: [Int] = []; var bredd: CGFloat = 0; var hojd: CGFloat = 0 }

    private func rader(_ subviews: Subviews, bredd: CGFloat) -> [Rad] {
        var ut: [Rad] = []
        var nu = Rad()
        for (i, v) in subviews.enumerated() {
            let s = v.sizeThatFits(ProposedViewSize(width: bredd, height: nil))
            let ny = nu.index.isEmpty ? s.width : nu.bredd + luft + s.width
            if ny > bredd, !nu.index.isEmpty {
                ut.append(nu)
                nu = Rad()
            }
            nu.bredd = nu.index.isEmpty ? s.width : nu.bredd + luft + s.width
            nu.hojd = max(nu.hojd, s.height)
            nu.index.append(i)
        }
        if !nu.index.isEmpty { ut.append(nu) }
        return ut
    }
}

/// När sidan inte gick att öppna: sajtens figur, en rubrik, vad som hände och "Försök igen".
struct Felvy: View {
    let flik: any Flik
    let fel: Sidfel

    @Environment(Tema.self) private var tema

    var body: some View {
        let f = Skalfarger(tema, privat: flik.privat)
        let url = fel.url ?? flik.url
        ScrollView {
            VStack(spacing: 0) {
                Illustration(namn: "Fel", accent: f.accent)
                    .frame(maxWidth: 190)
                    .padding(.top, 48)
                Text(fel.blockeradAvSkyddet ? tr("AdRaze stoppade sidan") : tr("Sidan gick inte att öppna"))
                    .rubrik(30, vikt: 600, tak: 44)
                    .foregroundStyle(f.text)
                    .multilineTextAlignment(.center)
                    .padding(.top, 24)
                if !domanFor(url).isEmpty {
                    Text(domanFor(url))
                        .grotesk(15, vikt: 650, tak: 22)
                        .foregroundStyle(f.text)
                        .padding(.top, 10)
                }
                Text(Self.beskrivning(fel))
                    .grotesk(14.5, tak: 22)
                    .foregroundStyle(f.dampad)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .padding(.top, 6)
                Button {
                    if let url { flik.ladda(url) } else { flik.laddaOm() }
                } label: {
                    Vatsketext(text: tr("Försök igen"), ikon: .laddaOm)
                }
                .buttonStyle(Vatskeknapp(.primar, privat: f.privat))
                .padding(.top, 26)
            }
            .padding(.horizontal, 30)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 40)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background { f.sida.ignoresSafeArea() }
        .onAppear { Haptik.fel() }
    }

    /// Vad som hände, med appens egna ord för de vanliga felen (systemets text följer telefonens språk och
    /// inte appens). Annars systemets text.
    static func beskrivning(_ fel: Sidfel) -> String {
        if fel.blockeradAvSkyddet { return tr("Skyddet blockerar den här sidan.") }
        guard fel.doman == NSURLErrorDomain else { return fel.text }
        switch fel.kod {
        case NSURLErrorNotConnectedToInternet, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff:
            return tr("Du verkar inte vara ansluten till internet.")
        case NSURLErrorTimedOut:
            return tr("Sidan svarade inte i tid.")
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return tr("Det finns ingen sajt på den adressen.")
        case NSURLErrorCannotConnectToHost:
            return tr("Servern tog inte emot anslutningen.")
        case NSURLErrorNetworkConnectionLost:
            return tr("Anslutningen bröts.")
        case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid,
             NSURLErrorClientCertificateRejected, NSURLErrorClientCertificateRequired:
            return tr("Det gick inte att ansluta säkert till sajten.")
        case NSURLErrorAppTransportSecurityRequiresSecureConnection:
            return tr("Sajten saknar en säker anslutning.")
        case NSURLErrorBadURL, NSURLErrorUnsupportedURL:
            return tr("Adressen går inte att öppna.")
        default:
            return fel.text
        }
    }
}
