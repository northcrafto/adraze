import SwiftUI
import UIKit
import WebKit

/// Ytan där den aktiva flikens webbvy sitter. Byter webbvy när fliken byts (bara den aktiva flikens
/// `webbvy` rörs, så att sovande flikar inte väcks), och lyssnar på sidans scrollning:
///  - scrollar man nedåt fälls raderna ihop, uppåt (eller i toppen och botten) fälls de ut,
///  - drar man sidan nedåt i toppen fylls en vätskeknapp, och släpper man förbi tröskeln laddas sidan om,
///  - sidans `theme-color` (eller bakgrund) färgar statusraden när den går att läsa där.
///
/// Scrollvyns delegat används inte (den kan tillhöra Flikar); i stället KVO på `contentOffset` och ett eget
/// mål på dess panoreringsgest.
///
/// Ägare: Skal.
struct Webbyta: UIViewRepresentable {
    let flik: (any Flik)?
    let skal: SkalLage
    let bakgrund: UIColor

    func makeCoordinator() -> Webbkoordinator { Webbkoordinator(skal: skal) }

    func makeUIView(context: Context) -> Webbhallare {
        let v = Webbhallare()
        v.koordinator = context.coordinator
        v.clipsToBounds = true
        return v
    }

    func updateUIView(_ v: Webbhallare, context: Context) {
        v.backgroundColor = bakgrund
        v.visa(flik?.webbvy)
    }

    static func dismantleUIView(_ v: Webbhallare, coordinator: Webbkoordinator) {
        coordinator.slapp()
    }
}

/// Behållaren för webbvyn.
final class Webbhallare: UIView {
    weak var koordinator: Webbkoordinator?
    private(set) weak var webbvy: WKWebView?
    private var forraStorlek: CGSize = .zero

    func visa(_ ny: WKWebView?) {
        guard ny !== webbvy else { return }
        if let gammal = webbvy, gammal.superview === self { gammal.removeFromSuperview() }
        koordinator?.slapp()
        webbvy = ny
        guard let ny else { return }
        ny.removeFromSuperview()
        ny.frame = bounds
        ny.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        ny.allowsBackForwardNavigationGestures = true
        ny.scrollView.alwaysBounceVertical = true
        ny.scrollView.keyboardDismissMode = .interactive
        addSubview(ny)
        koordinator?.folj(ny)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let w = webbvy else { return }
        if w.frame != bounds { w.frame = bounds }
        if bounds.size != forraStorlek {
            forraStorlek = bounds.size
            koordinator?.storlekAndrad()
        }
    }
}

/// Lyssnar på den aktiva webbvyn.
@MainActor
final class Webbkoordinator: NSObject {
    let skal: SkalLage
    private weak var webbvy: WKWebView?
    private var observationer: [NSKeyValueObservation] = []
    private var ignorera = false
    private var senasteY: CGFloat = 0
    private var riktning = 0
    private var riktningsstart: CGFloat = 0
    /// Hur långt man ska dra för att ladda om.
    static let troskel: CGFloat = 84

    init(skal: SkalLage) {
        self.skal = skal
    }

    func folj(_ w: WKWebView) {
        webbvy = w
        let sv = w.scrollView
        sv.panGestureRecognizer.addTarget(self, action: #selector(panorerar(_:)))
        senasteY = sv.contentOffset.y
        observationer = [
            sv.observe(\.contentOffset, options: [.new]) { [weak self] sv, _ in
                MainActor.assumeIsolated { self?.flyttad(sv) }
            },
            w.observe(\.themeColor, options: [.new]) { [weak self] w, _ in
                MainActor.assumeIsolated { self?.fargAndrad(w) }
            },
            w.observe(\.underPageBackgroundColor, options: [.new]) { [weak self] w, _ in
                MainActor.assumeIsolated { self?.fargAndrad(w) }
            },
        ]
        fargAndrad(w)
    }

    func slapp() {
        webbvy?.scrollView.panGestureRecognizer.removeTarget(self, action: #selector(panorerar(_:)))
        observationer.forEach { $0.invalidate() }
        observationer = []
        webbvy = nil
        if skal.drag != 0 { skal.drag = 0 }
    }

    /// Webbytan bytte storlek (raderna fälldes ihop eller ut): flytta innehållet lika mycket som toppen
    /// flyttades, så att sidan står still på skärmen.
    func storlekAndrad() {
        let d = skal.vantandeForskjutning
        guard d != 0, let sv = webbvy?.scrollView else { return }
        skal.vantandeForskjutning = 0
        let topp = -sv.adjustedContentInset.top
        // Högst upp ska sidan följa med raden ner, annars hamnar den rullad lika mycket som raden är hög.
        if d > 0, sv.contentOffset.y <= topp + 1 { return }
        let maxY = max(topp, sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom)
        var o = sv.contentOffset
        o.y = min(max(topp, o.y + d), maxY)
        ignorera = true
        sv.contentOffset = o
        senasteY = o.y
        ignorera = false
    }

    private func flyttad(_ sv: UIScrollView) {
        let y = sv.contentOffset.y
        guard !ignorera else { senasteY = y; return }
        let topp = -sv.adjustedContentInset.top

        // Dra för att ladda om: bara medan fingret drar.
        let over = topp - y
        if sv.isTracking, over > 0, !skal.redigerar {
            let fore = skal.drag
            if fore < Self.troskel, over >= Self.troskel { Haptik.val() }
            skal.drag = over
        }

        let dy = y - senasteY
        senasteY = y
        if y <= topp + 1 {
            riktning = 0
            if skal.kompakt { skal.expandera() }
            return
        }
        let botten = sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom
        if botten > 0, y >= botten - 1, skal.kompakt, sv.isDragging {
            skal.expandera()
            return
        }
        guard sv.isDragging || sv.isDecelerating, sv.contentSize.height > sv.bounds.height + 140 else { return }
        let r = dy > 0.5 ? 1 : (dy < -0.5 ? -1 : 0)
        guard r != 0 else { return }
        if r != riktning {
            riktning = r
            riktningsstart = y
        }
        if riktning == 1, y - riktningsstart > 32, y > topp + 56, !skal.kompakt, sv.isTracking || sv.isDragging {
            skal.satt(kompakt: true)
        } else if riktning == -1, riktningsstart - y > 56, skal.kompakt {
            skal.expandera()
        }
    }

    @objc private func panorerar(_ g: UIPanGestureRecognizer) {
        switch g.state {
        case .ended, .cancelled, .failed:
            let drag = skal.drag
            guard drag > 0 else { return }
            if drag >= Self.troskel, g.state == .ended, let f = skal.aktiv, !arTomAdress(f.url) {
                f.laddaOm()
            }
            withAnimation(Rorelse.val(.easeOut(duration: 0.3))) { skal.drag = 0 }
        default:
            break
        }
    }

    private func fargAndrad(_ w: WKWebView) {
        let farg = w.themeColor ?? w.underPageBackgroundColor
        skal.sattSidfarg(farg)
    }
}

/// Vätskeknappen som fylls när man drar sidan nedåt.
struct Dragindikator: View {
    let drag: CGFloat
    let farger: Skalfarger

    var body: some View {
        let andel = min(1, drag / Webbkoordinator.troskel)
        let full = andel >= 1
        ZStack {
            Circle().fill(farger.falt)
            Vatskelager(niva: andel, fyllning: farger.accent, valvd: true)
                .clipShape(Circle())
            Circle().strokeBorder(full ? farger.accent : farger.faltlinje, lineWidth: 1)
            Ikonvy(.laddaOm, storlek: 19, streck: 2)
                .foregroundStyle(full ? farger.paAccent : farger.dampad)
                .rotationEffect(.degrees(Double(andel) * 200))
        }
        .frame(width: 40, height: 40)
        .shadow(color: .black.opacity(0.1), radius: 6, y: 2)
        .scaleEffect(full ? 1.08 : 0.55 + 0.45 * andel)
        .animation(Rorelse.val(.spring(response: 0.25, dampingFraction: 0.6)), value: full)
        .opacity(Double(min(1, drag / 22)))
        .offset(y: min(drag, Webbkoordinator.troskel + 24) * 0.55 - 6)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
