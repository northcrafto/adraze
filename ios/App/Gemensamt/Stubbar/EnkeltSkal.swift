import SwiftUI
import UIKit
import WebKit

/// Enkel ersättning för Skal tills `App/Skal/` finns: den aktiva flikens webbvy och adressfältet nere med
/// verktygsraden under, i AdRazes färger och mått ur `Tema`. Visar hur skalet läser `app.flikar`, `app.skydd`
/// och temat. Skal byter den med `app.ersatt(huvudvy:)`.
///
/// Ägare: Grund.
struct EnkeltSkal: View {
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if let flik = app.flikar.aktiv, flik.url != nil || flik.laddar || flik.fel != nil {
                    Webbvaerd(webbvy: flik.webbvy)
                    if let fel = flik.fel, !flik.laddar { Felruta(fel: fel) { flik.laddaOm() } }
                } else {
                    TomFlik()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Adressrad()
        }
        .background(tema.bakgrund.ignoresSafeArea())
    }
}

/// Visar en WKWebView i SwiftUI. Behållaren byter webbvy när den aktiva fliken byts.
struct Webbvaerd: UIViewRepresentable {
    let webbvy: WKWebView

    func makeUIView(context: Context) -> UIView {
        let behallare = UIView()
        behallare.backgroundColor = .clear
        lagg(webbvy, i: behallare)
        return behallare
    }

    func updateUIView(_ behallare: UIView, context: Context) {
        if behallare.subviews.first !== webbvy { lagg(webbvy, i: behallare) }
    }

    private func lagg(_ v: WKWebView, i behallare: UIView) {
        behallare.subviews.forEach { $0.removeFromSuperview() }
        v.frame = behallare.bounds
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        behallare.addSubview(v)
    }
}

/// Ny tom flik (innan startsidan i webbvy finns).
private struct TomFlik: View {
    @Environment(Tema.self) private var tema

    var body: some View {
        VStack(spacing: 14) {
            Image("Gorilla")
                .resizable()
                .scaledToFit()
                .frame(width: 92, height: 92)
                .accessibilityHidden(true)
            Text("AdRaze")
                .font(tema.rubrik(40, vikt: 640))
                .foregroundStyle(tema.text)
            Text("Sök eller skriv en adress i fältet nedanför.")
                .font(tema.typsnitt(.callout))
                .foregroundStyle(tema.dampad)
                .multilineTextAlignment(.center)
        }
        .padding(32)
    }
}

/// När en sida inte gick att ladda.
private struct Felruta: View {
    @Environment(Tema.self) private var tema
    let fel: Sidfel
    let igen: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Sidan gick inte att öppna")
                .font(tema.rubrik(24))
                .foregroundStyle(tema.text)
            Text(fel.text)
                .font(tema.typsnitt(.callout))
                .foregroundStyle(tema.dampad)
                .multilineTextAlignment(.center)
            Button("Försök igen", action: igen)
                .font(tema.typsnitt(.body, vikt: .semibold))
                .foregroundStyle(tema[.paAccent])
                .padding(.horizontal, 20)
                .frame(minHeight: tema.matt.tryckyta)
                .background(Capsule().fill(tema.accent))
        }
        .padding(24)
        .frame(maxWidth: 340)
        .background(RoundedRectangle(cornerRadius: tema.radier.ruta, style: .continuous).fill(tema.yta))
        .overlay(RoundedRectangle(cornerRadius: tema.radier.ruta, style: .continuous).strokeBorder(tema.linje))
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(tema.bakgrund)
    }
}

/// Adressfältet och verktygsraden nere.
private struct Adressrad: View {
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @State private var redigerar = false
    @State private var text = ""
    @FocusState private var fokus: Bool

    var body: some View {
        let flik = app.flikar.aktiv
        VStack(spacing: 2) {
            HStack(spacing: 10) {
                falt(flik)
                if redigerar {
                    Button("Avbryt") { sluta() }
                        .font(tema.typsnitt(.body, vikt: .medium))
                        .foregroundStyle(tema[.accentText])
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            if !redigerar {
                verktyg(flik)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, redigerar ? 8 : 0)
        .background(tema[.verktygsrad].ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(tema.linje).frame(height: 0.5) }
        .animation(.snappy(duration: 0.25), value: redigerar)
        .onChange(of: fokus) { _, nu in if !nu { redigerar = false } }
    }

    private func falt(_ flik: (any Flik)?) -> some View {
        let radie = min(tema.radier.falt, tema.matt.adressfalt / 2)
        let form = RoundedRectangle(cornerRadius: radie, style: .continuous)
        return ZStack {
            form.fill(tema[.falt])
            form.strokeBorder(redigerar ? tema.accent : tema[.faltlinje], lineWidth: redigerar ? 1.5 : 1)
            if redigerar {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(tema[.svag])
                    TextField("Sök eller skriv en adress", text: $text)
                        .focused($fokus)
                        .keyboardType(.webSearch)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .font(tema.typsnitt(.body))
                        .foregroundStyle(tema.text)
                        .onSubmit { skicka(flik) }
                        .onAppear { fokus = true }
                    if !text.isEmpty {
                        Button { text = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(tema[.svag])
                        }
                        .accessibilityLabel("Töm fältet")
                    }
                }
                .padding(.horizontal, 12)
            } else {
                HStack(spacing: 6) {
                    skyddsikon
                        .frame(width: 28)
                    Spacer(minLength: 0)
                    if let flik, flik.url != nil, !flik.sakerAnslutning, !flik.laddar {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(tema[.varning])
                            .accessibilityLabel("Inte säker anslutning")
                    }
                    Text(visning(flik))
                        .font(tema.typsnitt(.body, vikt: .medium))
                        .foregroundStyle(flik?.url == nil ? tema[.svag] : tema.text)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 0)
                    laddaOm(flik)
                }
                .padding(.leading, 8)
                .contentShape(Rectangle())
                .onTapGesture {
                    text = flik?.url?.absoluteString ?? ""
                    redigerar = true
                }
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel("Adress: \(visning(flik))")
            }
        }
        .frame(height: tema.matt.adressfalt)
        .overlay(alignment: .bottom) { framsteg(flik, radie: radie) }
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }

    private var skyddsikon: some View {
        let lage = app.skydd.lage
        let pa: Bool = { if case .klart = lage { return true } else { return false } }()
        return Image(systemName: pa ? "shield.lefthalf.filled" : "shield")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(pa ? tema.accent : tema[.svag])
            .accessibilityLabel(lage.etikett)
    }

    private func laddaOm(_ flik: (any Flik)?) -> some View {
        // Tom flik: knappen syns inte men tar samma plats, så att texten i fältet står i mitten.
        let finns = flik?.url != nil || flik?.laddar == true
        return Button {
            if flik?.laddar == true { flik?.stoppa() } else { flik?.laddaOm() }
        } label: {
            Image(systemName: flik?.laddar == true ? "xmark" : "arrow.clockwise")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tema.text)
                .frame(width: tema.matt.tryckyta, height: tema.matt.adressfalt)
        }
        .disabled(!finns)
        .opacity(finns ? 1 : 0)
        .accessibilityHidden(!finns)
        .accessibilityLabel(flik?.laddar == true ? "Stoppa" : "Ladda om")
    }

    private func framsteg(_ flik: (any Flik)?, radie: CGFloat) -> some View {
        GeometryReader { g in
            Capsule()
                .fill(tema.accent)
                .frame(width: max(8, g.size.width * (flik?.framsteg ?? 0)), height: 2.5)
                .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .padding(.horizontal, min(radie, 14) / 2)
        .padding(.bottom, 1)
        .opacity(flik?.laddar == true ? 1 : 0)
        .animation(.easeOut(duration: 0.2), value: flik?.framsteg ?? 0)
        .allowsHitTesting(false)
    }

    private func verktyg(_ flik: (any Flik)?) -> some View {
        HStack(spacing: 0) {
            knapp("chevron.backward", "Bakåt", aktiv: flik?.kanGaBakat ?? false) { flik?.bakat() }
            knapp("chevron.forward", "Framåt", aktiv: flik?.kanGaFramat ?? false) { flik?.framat() }
            if let u = flik?.url {
                ShareLink(item: u) { ikon("square.and.arrow.up", aktiv: true) }
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("Dela")
            } else {
                knapp("square.and.arrow.up", "Dela", aktiv: false) {}
            }
            knapp("plus", "Ny flik", aktiv: true) {
                app.flikar.nyFlik(nil)
                text = ""
                redigerar = true
            }
            knapp("square.on.square", "Flikar: \(app.flikar.flikar.count)", aktiv: app.flikar.flikar.count > 1) {
                let alla = app.flikar.flikar
                guard let i = alla.firstIndex(where: { $0.id == app.flikar.aktivId }), !alla.isEmpty else { return }
                app.flikar.aktivera(alla[(i + 1) % alla.count].id)
            }
            .overlay {
                Text("\(app.flikar.flikar.count)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(app.flikar.flikar.count > 1 ? tema.text : tema[.svag])
                    .offset(x: 1.5, y: 1.5)
                    .allowsHitTesting(false)
            }
        }
        .frame(height: tema.matt.verktygsrad)
    }

    private func knapp(_ symbol: String, _ etikett: String, aktiv: Bool, _ gor: @escaping () -> Void) -> some View {
        Button(action: gor) { ikon(symbol, aktiv: aktiv) }
            .disabled(!aktiv)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(etikett)
    }

    private func ikon(_ symbol: String, aktiv: Bool) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 19, weight: .regular))
            .foregroundStyle(aktiv ? tema.text : tema[.svag])
            .frame(width: tema.matt.tryckyta, height: tema.matt.tryckyta)
            .contentShape(Rectangle())
    }

    private func visning(_ flik: (any Flik)?) -> String {
        guard let u = flik?.url else { return "Sök eller skriv en adress" }
        return Webbadress.visning(u, installningar: app.installningar)
    }

    private func skicka(_ flik: (any Flik)?) {
        let t = text
        sluta()
        guard !t.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        (flik ?? app.flikar.nyFlik(nil)).ladda(text: t)
    }

    private func sluta() {
        fokus = false
        redigerar = false
    }
}
