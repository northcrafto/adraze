import Observation
import SwiftUI
import UIKit

/// Vad en ruta frågar.
enum Flikdialogslag: Equatable, Sendable {
    /// `alert()`
    case meddelande(String)
    /// `confirm()`
    case fraga(String)
    /// `prompt()`
    case textfraga(String, standard: String?)
    /// HTTP-inloggning (Basic, Digest, NTLM). `saker` = lösenordet skickas krypterat. `igen` = förra försöket nekades.
    case inloggning(rike: String?, saker: Bool, igen: Bool)
    /// Behörighet (datorns slag: `camera`, `microphone`, `sensors` …).
    case behorighet([String])
    /// En länk som öppnar en annan app.
    case externApp(URL)
}

/// Svaret på en ruta.
struct Dialogsvar: Sendable, Equatable {
    var ok: Bool
    var text: String?
    var anvandare: String?
    var losenord: String?
    /// "Kom ihåg för den här webbplatsen" (behörigheter och andra appar).
    var komIhag = true
    /// "Stoppa fler rutor från sidan" (efter två rutor på samma sida).
    var stoppaFler = false

    init(ok: Bool, text: String? = nil, anvandare: String? = nil, losenord: String? = nil, komIhag: Bool = true, stoppaFler: Bool = false) {
        self.ok = ok
        self.text = text
        self.anvandare = anvandare
        self.losenord = losenord
        self.komIhag = komIhag
        self.stoppaFler = stoppaFler
    }
}

/// Rutorna som sidorna öppnar: JavaScript-dialoger, inloggning, behörigheter och andra appar. Som på datorn
/// (`permQ` i `ui/shell.js`) visas en ruta bara för den aktiva fliken; frågar en flik i bakgrunden väntar rutan
/// tills fliken blir aktiv, och byter man flik läggs den visade rutan tillbaka i kön.
///
/// Rutan är en egen SwiftUI-vy i AdRazes stil (inte `UIAlertController`), presenterad över skalet.
/// Behörighetsfrågor som ingen svarar på blir nej efter 90 sekunder.
@MainActor
@Observable
final class Flikdialoger {
    struct Fraga: Identifiable {
        let id = UUID()
        let flik: UUID
        /// Värden som visas ("example.com", "127.0.0.1:8080").
        let ursprung: String
        let slag: Flikdialogslag
        let visaStoppa: Bool
        fileprivate let svar: Engangssvar
    }

    /// Rutan som visas just nu.
    private(set) var aktuell: Fraga?
    /// Rutor som väntar (flikar i bakgrunden, eller bakom den som visas).
    private(set) var ko: [Fraga] = []
    /// Antal rutor som visats sedan start (för självtestet).
    private(set) var antalVisade = 0

    @ObservationIgnored weak var motor: Flikmotor?
    @ObservationIgnored private var visad: UIViewController?
    @ObservationIgnored private var stanger = false

    static let behorighetMaxtid: Double = 90

    func harFraga(for flik: UUID) -> Bool { aktuell?.flik == flik || ko.contains { $0.flik == flik } }

    /// Ställer en fråga och väntar på svaret.
    func fraga(flik: UUID, ursprung: String, slag: Flikdialogslag, visaStoppa: Bool = false) async -> Dialogsvar {
        await withCheckedContinuation { (c: CheckedContinuation<Dialogsvar, Never>) in
            let f = Fraga(flik: flik, ursprung: ursprung, slag: slag, visaStoppa: visaStoppa, svar: Engangssvar { c.resume(returning: $0) })
            ko.append(f)
            if case .behorighet = slag { tidsgrans(f) } else if case .externApp = slag { tidsgrans(f) }
            visaNasta()
        }
    }

    private func tidsgrans(_ f: Fraga) {
        let id = f.id
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.behorighetMaxtid * 1_000_000_000))
            self?.svara(Dialogsvar(ok: false, komIhag: false), pa: id)
        }
    }

    /// Svarar på rutan som visas.
    func svara(_ s: Dialogsvar) {
        guard let a = aktuell else { return }
        svara(s, pa: a.id)
    }

    /// Svarar på en viss fråga (visad eller i kön).
    func svara(_ s: Dialogsvar, pa id: UUID) {
        if let a = aktuell, a.id == id {
            aktuell = nil
            a.svar.ge(s)
            stangVisad { [weak self] in self?.visaNasta() }
        } else if let i = ko.firstIndex(where: { $0.id == id }) {
            let f = ko.remove(at: i)
            f.svar.ge(s)
        }
    }

    /// Fliken stängdes eller somnade: alla dess frågor får nej.
    func avbryt(flik: UUID) {
        for f in ko where f.flik == flik { f.svar.ge(Dialogsvar(ok: false, komIhag: false)) }
        ko.removeAll { $0.flik == flik }
        if let a = aktuell, a.flik == flik { svara(Dialogsvar(ok: false, komIhag: false), pa: a.id) }
    }

    /// En annan flik blev aktiv: den visade rutan går tillbaka i kön och den nya flikens ruta visas.
    func flikAktiverad(_ id: UUID) {
        if let a = aktuell, a.flik != id {
            aktuell = nil
            ko.insert(a, at: 0)
            stangVisad { [weak self] in self?.visaNasta() }
        } else {
            visaNasta()
        }
    }

    private func visaNasta() {
        guard aktuell == nil, visad == nil, !stanger, let motor, let i = ko.firstIndex(where: { $0.flik == motor.aktivtId }) else { return }
        let f = ko.remove(at: i)
        aktuell = f
        antalVisade += 1
        presentera(f, motor: motor)
    }

    private func presentera(_ f: Fraga, motor: Flikmotor) {
        guard let topp = Flikfonster.topp() else { return }
        let id = f.id
        let vy = FlikdialogVy(fraga: f) { [weak self] s in self?.svara(s, pa: id) }
            .environment(motor.app.tema)
            .environment(motor.app)
        let vc = UIHostingController(rootView: AnyView(vy))
        vc.modalPresentationStyle = .overFullScreen
        vc.modalTransitionStyle = .crossDissolve
        vc.view.backgroundColor = .clear
        vc.overrideUserInterfaceStyle = motor.app.tema.uiStil
        visad = vc
        topp.present(vc, animated: true)
    }

    private func stangVisad(_ sedan: @escaping @MainActor () -> Void) {
        guard let vc = visad else {
            sedan()
            return
        }
        visad = nil
        stanger = true
        let klart: @MainActor () -> Void = { [weak self] in
            self?.stanger = false
            sedan()
        }
        if vc.presentingViewController != nil {
            vc.dismiss(animated: true) { MainActor.assumeIsolated { klart() } }
        } else {
            klart()
        }
    }
}

/// Ett svar som bara kan ges en gång (continuation får bara återupptas en gång).
final class Engangssvar: @unchecked Sendable {
    private let las = NSLock()
    private var f: ((Dialogsvar) -> Void)?

    init(_ f: @escaping (Dialogsvar) -> Void) { self.f = f }

    func ge(_ s: Dialogsvar) {
        las.lock()
        let g = f
        f = nil
        las.unlock()
        g?(s)
    }

    deinit { ge(Dialogsvar(ok: false, komIhag: false)) }
}

// MARK: - Rutan

/// Själva rutan: ett kort mitt på skärmen över en mörkare bakgrund.
struct FlikdialogVy: View {
    let fraga: Flikdialoger.Fraga
    let svara: (Dialogsvar) -> Void

    @Environment(Tema.self) private var tema
    @State private var text = ""
    @State private var anvandare = ""
    @State private var losenord = ""
    @State private var komIhag = true
    @State private var stoppa = false
    @State private var syns = false
    @FocusState private var fokus: Falt?

    private enum Falt { case text, anvandare, losenord }

    var body: some View {
        ZStack {
            Color.black.opacity(syns ? 0.34 : 0)
                .ignoresSafeArea()
                .accessibilityHidden(true)
            kort
                .frame(maxWidth: 340)
                .padding(.horizontal, 22)
                .scaleEffect(syns ? 1 : 0.96)
                .opacity(syns ? 1 : 0)
        }
        .onAppear {
            if case .textfraga(_, let standard) = fraga.slag { text = standard ?? "" }
            withAnimation(.timingCurve(0.2, 0.75, 0.25, 1, duration: 0.35)) { syns = true }
            switch fraga.slag {
            case .textfraga: fokus = .text
            case .inloggning: fokus = .anvandare
            default: break
            }
        }
        .accessibilityAddTraits(.isModal)
    }

    private var kort: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let etikett { Text(etikett).font(Typsnitt.grotesk(13, vikt: 500, relativTill: .footnote)).foregroundStyle(tema.dampad).padding(.bottom, 6) }
            Text(rubrik)
                .font(Typsnitt.rubrik(rubrikstorlek, vikt: 540, relativTill: .title2))
                .foregroundStyle(tema.text)
                .fixedSize(horizontal: false, vertical: true)
            if let brod {
                ScrollView {
                    Text(brod)
                        .font(Typsnitt.grotesk(16, relativTill: .body))
                        .foregroundStyle(tema.dampad)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .scrollBounceBehavior(.basedOnSize)
                .frame(maxHeight: 260)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
            }
            falt
            val
            knappar.padding(.top, 20)
        }
        .padding(22)
        // Skuggan bara från kortets form: på hela kortet kastar varje text och knapp en egen skugga på kortet.
        .background(RoundedRectangle(cornerRadius: tema.radier.ruta, style: .continuous).fill(tema.yta)
            .shadow(color: .black.opacity(0.18), radius: 30, y: 14))
        .overlay(RoundedRectangle(cornerRadius: tema.radier.ruta, style: .continuous).strokeBorder(tema.linje, lineWidth: 1))
    }

    // MARK: Texterna

    private var vard: String { fraga.ursprung.isEmpty ? "Sidan" : fraga.ursprung }

    private var etikett: String? {
        switch fraga.slag {
        case .meddelande, .fraga, .textfraga: return vard
        case .inloggning: return nil
        case .behorighet, .externApp: return nil
        }
    }

    private var rubrik: String {
        switch fraga.slag {
        case .meddelande(let t), .fraga(let t), .textfraga(let t, _):
            return t.count <= 140 ? t : "Sidan säger"
        case .inloggning:
            return "Logga in på \(vard)"
        case .behorighet(let slag):
            return "\(vard) vill använda \(Self.vad(slag))"
        case .externApp:
            return "\(vard) vill öppna en annan app"
        }
    }

    private var rubrikstorlek: CGFloat {
        switch fraga.slag {
        case .meddelande(let t), .fraga(let t), .textfraga(let t, _): return t.count > 70 ? 19 : 22
        default: return 22
        }
    }

    private var brod: String? {
        switch fraga.slag {
        case .meddelande(let t), .fraga(let t), .textfraga(let t, _):
            return t.count > 140 ? t : nil
        case .inloggning(let rike, let saker, let igen):
            var delar: [String] = []
            if igen { delar.append("Fel användarnamn eller lösenord. Försök igen.") }
            if let rike, !rike.isEmpty { delar.append("Sajten säger: \u{201D}\(rike)\u{201D}") }
            if !saker { delar.append("Anslutningen är inte krypterad, så lösenordet kan läsas av andra på nätverket.") }
            return delar.isEmpty ? nil : delar.joined(separator: "\n")
        case .behorighet:
            return nil
        case .externApp(let u):
            return Self.appbeskrivning(u)
        }
    }

    /// "kameran", "mikrofonen", "kameran och mikrofonen" (datorns PERM_LABEL med bestämd form).
    static func vad(_ slag: [String]) -> String {
        let namn: [String: String] = [
            "camera": "kameran", "microphone": "mikrofonen", "geolocation": "din plats", "notifications": "notiser",
            "clipboard-read": "urklippet", "midi": "MIDI-enheter", "sensors": "rörelsesensorerna", "external": "en annan app",
        ]
        let ord = slag.map { namn[$0] ?? $0 }
        guard ord.count > 1 else { return ord.first ?? "" }
        return ord.dropLast().joined(separator: ", ") + " och " + ord.last!
    }

    static func appbeskrivning(_ u: URL) -> String {
        let schema = (u.scheme ?? "").lowercased()
        let rest = u.absoluteString.dropFirst(schema.count + 1).removingPercentEncoding ?? ""
        switch schema {
        case "mailto": return "Mejl till \(rest.split(separator: "?").first.map(String.init) ?? rest)"
        case "tel": return "Ring \(rest)"
        case "sms": return "Sms till \(rest)"
        case "facetime", "facetime-audio": return "FaceTime med \(rest)"
        case "maps": return "Kartor"
        case "itms-apps", "itms-appss": return "App Store"
        default: return String(u.absoluteString.prefix(120))
        }
    }

    // MARK: Fält och val

    @ViewBuilder private var falt: some View {
        switch fraga.slag {
        case .textfraga:
            textfalt("", text: $text, sakert: false, falt: .text)
                .padding(.top, 16)
                .onSubmit { svara(Dialogsvar(ok: true, text: text, stoppaFler: stoppa)) }
        case .inloggning:
            VStack(spacing: 10) {
                textfalt("Användarnamn", text: $anvandare, sakert: false, falt: .anvandare)
                    .textContentType(.username)
                    .onSubmit { fokus = .losenord }
                textfalt("Lösenord", text: $losenord, sakert: true, falt: .losenord)
                    .textContentType(.password)
                    .onSubmit { loggaIn() }
            }
            .padding(.top, 16)
        default:
            EmptyView()
        }
    }

    private func textfalt(_ etikett: String, text: Binding<String>, sakert: Bool, falt: Falt) -> some View {
        Group {
            if sakert { SecureField(etikett, text: text) } else { TextField(etikett, text: text) }
        }
        .font(Typsnitt.grotesk(16, relativTill: .body))
        .foregroundStyle(tema.text)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($fokus, equals: falt)
        .padding(.horizontal, 14)
        .frame(minHeight: 46)
        .background(RoundedRectangle(cornerRadius: min(tema.radier.falt, 14), style: .continuous).fill(tema[.falt]))
        .overlay(RoundedRectangle(cornerRadius: min(tema.radier.falt, 14), style: .continuous)
            .strokeBorder(fokus == falt ? tema.accent : tema[.faltlinje], lineWidth: fokus == falt ? 1.5 : 1))
    }

    @ViewBuilder private var val: some View {
        switch fraga.slag {
        case .behorighet, .externApp:
            vaxel("Kom ihåg för den här webbplatsen", $komIhag).padding(.top, 16)
        default:
            if fraga.visaStoppa { vaxel("Stoppa fler rutor från sidan", $stoppa).padding(.top, 16) }
        }
    }

    private func vaxel(_ text: String, _ varde: Binding<Bool>) -> some View {
        Toggle(isOn: varde) {
            Text(text).font(Typsnitt.grotesk(15, relativTill: .subheadline)).foregroundStyle(tema.text)
        }
        .tint(tema.accent)
    }

    // MARK: Knapparna

    @ViewBuilder private var knappar: some View {
        switch fraga.slag {
        case .meddelande:
            knapp("OK", .primar) { svara(Dialogsvar(ok: true, stoppaFler: stoppa)) }
        case .fraga:
            HStack(spacing: 10) {
                knapp("Avbryt", .sekundar) { svara(Dialogsvar(ok: false, stoppaFler: stoppa)) }
                knapp("OK", .primar) { svara(Dialogsvar(ok: true, stoppaFler: stoppa)) }
            }
        case .textfraga:
            HStack(spacing: 10) {
                knapp("Avbryt", .sekundar) { svara(Dialogsvar(ok: false, stoppaFler: stoppa)) }
                knapp("OK", .primar) { svara(Dialogsvar(ok: true, text: text, stoppaFler: stoppa)) }
            }
        case .inloggning:
            HStack(spacing: 10) {
                knapp("Avbryt", .sekundar) { svara(Dialogsvar(ok: false)) }
                knapp("Logga in", .primar) { loggaIn() }
            }
        case .behorighet:
            HStack(spacing: 10) {
                knapp("Blockera", .sekundar) { svara(Dialogsvar(ok: false, komIhag: komIhag)) }
                knapp("Tillåt", .primar) { svara(Dialogsvar(ok: true, komIhag: komIhag)) }
            }
        case .externApp:
            HStack(spacing: 10) {
                knapp("Avbryt", .sekundar) { svara(Dialogsvar(ok: false, komIhag: komIhag)) }
                knapp("Öppna", .primar) { svara(Dialogsvar(ok: true, komIhag: komIhag)) }
            }
        }
    }

    private func loggaIn() {
        svara(Dialogsvar(ok: true, anvandare: anvandare, losenord: losenord))
    }

    private func knapp(_ text: String, _ sort: FlikVatskeknapp.Sort, _ gor: @escaping () -> Void) -> some View {
        Button(action: gor) {
            Text(text)
                .font(Typsnitt.grotesk(16, vikt: 620, relativTill: .body))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 50)
                .padding(.horizontal, 12)
        }
        .buttonStyle(FlikVatskeknapp(sort))
    }
}

// MARK: - Vätskeknappen

/// Vätskans form när den stigit hela vägen (signaturkitets recept: 130 % bred, 170 % hög,
/// `border-radius: 46% 46% 0 0`, botten 2 pt under knappen). Förflyttningen görs med `.offset`.
struct FlikVatskeform: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width * 1.3, h = r.height * 1.7
        let x0 = r.minX - r.width * 0.15
        let botten = r.maxY + 2
        let topp = botten - h
        let rx = 0.46 * w, ry = 0.46 * h
        let k: CGFloat = 0.552_284_75
        var p = Path()
        p.move(to: CGPoint(x: x0, y: botten))
        p.addLine(to: CGPoint(x: x0, y: topp + ry))
        p.addCurve(to: CGPoint(x: x0 + rx, y: topp),
                   control1: CGPoint(x: x0, y: topp + ry - k * ry), control2: CGPoint(x: x0 + rx - k * rx, y: topp))
        p.addLine(to: CGPoint(x: x0 + w - rx, y: topp))
        p.addCurve(to: CGPoint(x: x0 + w, y: topp + ry),
                   control1: CGPoint(x: x0 + w - rx + k * rx, y: topp), control2: CGPoint(x: x0 + w, y: topp + ry - k * ry))
        p.addLine(to: CGPoint(x: x0 + w, y: botten))
        p.closeSubpath()
        return p
    }
}

/// Knappstilen för Flikars rutor: vätskan stiger när fingret trycker (`translateY(100% → 0)` på 0,95 s,
/// `cubic-bezier(.2,.75,.25,1)`) och fyller hela knappen även vid ett snabbt tryck. Med Reduce Motion: en toning.
struct FlikVatskeknapp: ButtonStyle {
    enum Sort {
        /// Accentfärgad; temats mörka (ljusa i mörkt läge) vätska stiger och texten byter till sidans färg.
        case primar
        /// Genomskinlig med tunn kant; accentfärgad vätska.
        case sekundar
    }

    let sort: Sort

    init(_ sort: Sort) { self.sort = sort }

    func makeBody(configuration: Configuration) -> some View {
        FlikVatskekropp(etikett: configuration.label, tryckt: configuration.isPressed, sort: sort)
    }
}

private struct FlikVatskekropp<Etikett: View>: View {
    let etikett: Etikett
    let tryckt: Bool
    let sort: FlikVatskeknapp.Sort

    @Environment(Tema.self) private var tema
    @Environment(\.accessibilityReduceMotion) private var minska
    @Environment(\.isEnabled) private var pa
    @State private var niva: CGFloat = 0
    @State private var start: Date?
    @State private var omgang = 0

    var body: some View {
        // Samma hörn som appens andra stora knappar (konto, chatt, Falk)
        let form = RoundedRectangle(cornerRadius: tema.radier.storKnapp, style: .continuous)
        etikett
            .foregroundStyle(sort == .primar ? tema[.paAccent] : tema[.accentText])
            .overlay {
                etikett
                    .foregroundStyle(sort == .primar ? tema.bakgrund : tema[.paAccent])
                    .mask(lager(Color.black))
                    .allowsHitTesting(false)
            }
            .background {
                ZStack {
                    if sort == .primar { form.fill(tema.accent) }
                    lager(sort == .primar
                          ? AnyShapeStyle(LinearGradient(colors: [tema[.fyllnadFran], tema[.fyllnadTill]], startPoint: .top, endPoint: .bottom))
                          : AnyShapeStyle(tema.accent))
                        .clipShape(form)
                }
            }
            .overlay {
                if sort == .sekundar { form.strokeBorder(tema.linje, lineWidth: 1) }
            }
            .contentShape(form)
            .opacity(pa ? 1 : 0.35)
            .onChange(of: tryckt) { _, nu in nu ? stig() : rinn() }
    }

    private func lager<S: ShapeStyle>(_ fyllning: S) -> some View {
        GeometryReader { g in
            Group {
                if minska {
                    Rectangle().fill(fyllning).opacity(niva)
                } else {
                    FlikVatskeform().fill(fyllning).offset(y: (1 - niva) * (g.size.height * 1.7 + 2))
                }
            }
            .frame(width: g.size.width, height: g.size.height)
        }
        .allowsHitTesting(false)
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

// MARK: - Fönstret

/// Det Flikar behöver av appens fönster.
@MainActor
enum Flikfonster {
    static func fonster() -> UIWindow? {
        let alla = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return alla.first(where: \.isKeyWindow) ?? alla.first
    }

    /// Ramen för en ny webbvy (fönstrets storlek, så att sidan inte laddas i en annan bredd än den visas i).
    static func ram() -> CGRect {
        if let f = fonster(), f.bounds.width > 0 { return f.bounds }
        return CGRect(x: 0, y: 0, width: 390, height: 844)
    }

    /// Den översta vykontrollern.
    static func topp() -> UIViewController? {
        var vc = fonster()?.rootViewController
        while let p = vc?.presentedViewController, !p.isBeingDismissed { vc = p }
        return vc
    }

    /// Delningsbladet.
    static func dela(_ saker: [Any]) {
        guard let topp = topp() else { return }
        let vc = UIActivityViewController(activityItems: saker, applicationActivities: nil)
        if let p = vc.popoverPresentationController {
            p.sourceView = topp.view
            p.sourceRect = CGRect(x: topp.view.bounds.midX, y: topp.view.bounds.maxY - 80, width: 1, height: 1)
        }
        topp.present(vc, animated: true)
    }
}
