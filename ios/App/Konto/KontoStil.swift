import SwiftUI
import UIKit

// MARK: - Text

/// Kontots texter: svenska är nyckeln (som `tr` i Gemensamt). Först kontots egna ordlistor
/// (`Konto/Bunt/sprak/<kod>.json`, texter som bara finns på telefonen), sedan datorns 54 språk via `tr`.
@MainActor
func kt(_ s: String, _ varden: [String: String] = [:]) -> String {
    let kod = Sprak.delad.kod
    guard kod != "sv" else { return tr(s, varden) }
    let fyll: (String) -> String = { t in
        var ut = t
        for (n, v) in varden { ut = ut.replacingOccurrences(of: "{\(n)}", with: v) }
        return ut
    }
    if let egen = KontoOrd.ordlista(kod)[s] { return fyll(egen) }
    // Datorns ordlista för språket; saknas texten där blir det engelska i stället för svenska.
    let t = tr(s, varden)
    if t != fyll(s) || kod == "en" { return t }
    return KontoOrd.ordlista("en")[s].map(fyll) ?? t
}

@MainActor
enum KontoOrd {
    private static var minne: [String: [String: String]] = [:]
    static func ordlista(_ kod: String) -> [String: String] {
        if let m = minne[kod] { return m }
        var d: [String: String] = [:]
        if let data = Bunt.data("Konto", "sprak/\(kod).json"),
           let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for (k, v) in o { if let s = v as? String, !s.isEmpty { d[k] = s } }
        }
        minne[kod] = d
        return d
    }
}

// MARK: - Vätskeknappen

/// AdRazes vätskefyllning (samma recept som datorns `.anp-liq` och skalets knappar): en välvd vätska,
/// 130 % bred och 170 % hög med 46 % hörn, stiger underifrån på 0,95 s och rinner ut efter minst 0,95 s.
struct KontoVatskeform: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width * 1.3, h = r.height * 1.7
        let x0 = r.minX - r.width * 0.15, botten = r.maxY + 2, topp = botten - h
        let rx = 0.46 * w, ry = 0.46 * h, k: CGFloat = 0.552_284_75
        var p = Path()
        p.move(to: CGPoint(x: x0, y: botten))
        p.addLine(to: CGPoint(x: x0, y: topp + ry))
        p.addCurve(to: CGPoint(x: x0 + rx, y: topp), control1: CGPoint(x: x0, y: topp + ry - k * ry),
                   control2: CGPoint(x: x0 + rx - k * rx, y: topp))
        p.addLine(to: CGPoint(x: x0 + w - rx, y: topp))
        p.addCurve(to: CGPoint(x: x0 + w, y: topp + ry), control1: CGPoint(x: x0 + w - rx + k * rx, y: topp),
                   control2: CGPoint(x: x0 + w, y: topp + ry - k * ry))
        p.addLine(to: CGPoint(x: x0 + w, y: botten))
        p.closeSubpath()
        return p
    }
}

struct KontoVatskelager<F: ShapeStyle>: View {
    let niva: CGFloat
    let fyllning: F
    var valvd = true
    var body: some View {
        GeometryReader { g in
            Group {
                if valvd {
                    KontoVatskeform().fill(fyllning).offset(y: (1 - niva) * (g.size.height * 1.7 + 2))
                } else {
                    Rectangle().fill(fyllning).opacity(niva)
                }
            }
            .frame(width: g.size.width, height: g.size.height)
        }
        .allowsHitTesting(false)
    }
}

/// `.primar`: orange med temats mörka vätska (ljus i mörkt läge). `.lank`: accenttext, orange vätska.
/// `.fara`: röd text med tunn kant, röd vätska.
struct KontoKnapp: ButtonStyle {
    enum Sort { case primar, lank, fara }
    let sort: Sort
    init(_ sort: Sort) { self.sort = sort }
    func makeBody(configuration: Configuration) -> some View {
        KontoKnappkropp(etikett: configuration.label, tryckt: configuration.isPressed, sort: sort)
    }
}

private struct KontoKnappkropp<E: View>: View {
    let etikett: E
    let tryckt: Bool
    let sort: KontoKnapp.Sort
    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.isEnabled) private var pa
    @State private var niva: CGFloat = 0
    @State private var start: Date?
    @State private var omgang = 0
    /// Primärknappen fylls med orange när den blir användbar och töms när den inte är det.
    @State private var fylld: CGFloat = -1

    var body: some View {
        let form = RoundedRectangle(cornerRadius: tema.radier.knapp == 999 ? 999 : tema.radier.knapp + 6, style: .continuous)
        etikett
            .foregroundStyle(vilande)
            .overlay {
                etikett.foregroundStyle(nedsankt)
                    .mask(KontoVatskelager(niva: niva, fyllning: Color.black, valvd: !minska))
                    .allowsHitTesting(false)
            }
            .background {
                ZStack {
                    switch sort {
                    case .primar:
                        form.fill(tema[.yta2])
                        form.fill(tema.accent).mask(KontoVatskelager(niva: fylld < 0 ? (pa ? 1 : 0) : fylld, fyllning: Color.black, valvd: !minska))
                    case .lank, .fara: form.fill(Color.clear)
                    }
                    KontoVatskelager(niva: niva, fyllning: vatska, valvd: !minska).clipShape(form)
                }
            }
            .overlay { if sort == .fara { form.strokeBorder(tema[.fara].opacity(0.5), lineWidth: 1) } }
            .contentShape(form)
            .opacity(pa || sort == .primar ? 1 : 0.4)
            .offset(y: tryckt && !minska ? 1 : 0)
            .animation(.easeOut(duration: 0.3), value: pa)
            .onChange(of: tryckt) { _, nu in nu ? stig() : rinn() }
            .onChange(of: pa) { _, nu in
                if fylld < 0 { fylld = nu ? 0 : 1 }
                withAnimation(minska ? .easeInOut(duration: 0.2) : .timingCurve(0.2, 0.75, 0.25, 1, duration: nu ? 0.8 : 0.4)) { fylld = nu ? 1 : 0 }
            }
    }

    private var vilande: Color {
        switch sort { case .primar: return pa ? tema[.paAccent] : tema[.svag]; case .lank: return tema[.accentText]; case .fara: return tema[.fara] }
    }
    private var nedsankt: Color {
        switch sort { case .primar: return tema.bakgrund; case .lank: return tema[.paAccent]; case .fara: return .white }
    }
    private var vatska: AnyShapeStyle {
        switch sort {
        case .primar: return AnyShapeStyle(LinearGradient(colors: [tema[.fyllnadFran], tema[.fyllnadTill]], startPoint: .top, endPoint: .bottom))
        case .lank: return AnyShapeStyle(tema.accent)
        case .fara: return AnyShapeStyle(tema[.fara])
        }
    }
    private func stig() {
        omgang += 1
        start = Date()
        withAnimation(minska ? .easeInOut(duration: 0.2) : .timingCurve(0.2, 0.75, 0.25, 1, duration: 0.95)) { niva = 1 }
    }
    private func rinn() {
        let gatt = start.map { Date().timeIntervalSince($0) } ?? 0.95
        let kvar = max(0, 0.95 - gatt) + 0.1
        let denna = omgang
        DispatchQueue.main.asyncAfter(deadline: .now() + kvar) {
            guard denna == omgang, !tryckt else { return }
            withAnimation(minska ? .easeInOut(duration: 0.2) : .timingCurve(0.4, 0, 0.6, 1, duration: 0.6)) { niva = 0 }
        }
    }
}

// MARK: - Fält

/// Ett inmatningsfält i AdRazes stil: etikett ovanför, fältfärg, tunn kant som blir orange vid fokus.
struct KontoFalt<Innehallet: View>: View {
    let etikett: String
    let fokus: Bool
    @ViewBuilder let innehall: () -> Innehallet
    @Environment(Tema.self) private var tema
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(etikett)
                .font(Typsnitt.grotesk(13, vikt: 600, relativTill: .footnote))
                .foregroundStyle(tema.dampad)
            innehall()
                .font(Typsnitt.grotesk(17, relativTill: .body))
                .foregroundStyle(tema.text)
                .tint(tema.accent)
                .padding(.horizontal, 14)
                .frame(minHeight: 50)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tema[.falt]))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(fokus ? tema.accent : tema[.faltlinje], lineWidth: fokus ? 1.5 : 1))
                .animation(.easeOut(duration: 0.18), value: fokus)
        }
    }
}

// MARK: - Visa ovanpå appen

@MainActor
enum KontoArk {
    /// Kontrollern som ligger överst (den som får visa något nytt).
    static func topp() -> UIViewController? {
        let fonster = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        var k = (fonster.first(where: \.isKeyWindow) ?? fonster.first)?.rootViewController
        while let p = k?.presentedViewController, !p.isBeingDismissed { k = p }
        return k
    }

    /// Visar kontot (inloggning eller kontokortet) som ark. `start` öppnar inloggningen i ett visst läge.
    static func visa(_ app: AppMiljo, start: KontoInloggning.Lage = .logga, epost: String = "") {
        guard let kontot = app.konto as? Kontot, let topp = topp() else { return }
        if topp is KontoKontroller { return }
        let k = KontoKontroller(rootView: AnyView(
            KontoRot(kontot: kontot, start: start, epost: epost).environment(app).environment(app.tema)))
        k.folj(app.tema)
        k.view.backgroundColor = app.tema.ui(.bakgrund)
        if let ark = k.sheetPresentationController {
            ark.detents = [.large()]
            ark.prefersGrabberVisible = true
            ark.preferredCornerRadius = 28
        }
        topp.present(k, animated: true)
    }
}

/// Värdkontrollern för kontoarket. Följer temat (ljust, mörkt, system) medan den visas.
final class KontoKontroller: UIHostingController<AnyView> {
    func folj(_ tema: Tema) {
        overrideUserInterfaceStyle = tema.uiStil
        withObservationTracking { _ = tema.uiStil } onChange: { [weak self] in
            Task { @MainActor [weak self] in self?.folj(tema) }
        }
    }
}
