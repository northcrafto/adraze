import SwiftUI
import UIKit

/// Startbilden: gorillan mitt på startfärgen, precis som iOS startskärm (`UILaunchScreen` i project.yml:
/// `Startbakgrund` och `Startgorilla`). Den ligger över appen från första rutan tills det första riktiga innehållet
/// är klart, och öppnar sig då i en cirkel från gorillan mot det som ligger under, så att startskärmen, appen och
/// startsidan blir en enda rörelse i stället för en tom mörk ruta.
///
/// En modul som visar något som laddar ber startbilden vänta, och säger till när det syns:
///
///     app.startbild.vanta("startsida")    // Skal, när första fliken visar startsidan
///     app.startbild.klar("startsida")     // Brygga, när en AdRaze-sida är klar
///
/// Startbilden öppnar sig när modulerna har startat (`app.arIgang`) och ingen väntar längre, och senast efter
/// `langstaTid` sekunder. Med Minska rörelse tonar den bara bort. Självtesterna väntar på den innan de tar
/// skärmbilder (`borta`).
///
/// Ägare: Grund (Gemensamt).
@MainActor
@Observable
final class Startbild {
    /// Det som startbilden väntar på.
    private(set) var vantarPa: Set<String> = []
    /// Startbilden har börjat öppna sig.
    private(set) var oppnas = false
    /// Startbilden är helt borta.
    private(set) var borta = false

    /// Längsta tid startbilden ligger kvar, i sekunder från första rutan.
    static let langstaTid: Double = 4

    @ObservationIgnored private var klara: Set<String> = []

    /// Vänta på `namn` innan startbilden öppnar sig. Gör ingenting om det redan är klart eller om startbilden har
    /// börjat öppna sig.
    func vanta(_ namn: String) {
        guard !oppnas, !klara.contains(namn) else { return }
        vantarPa.insert(namn)
    }

    /// `namn` syns nu (ingen fara att säga det flera gånger, eller utan att någon väntar).
    func klar(_ namn: String) {
        klara.insert(namn)
        if vantarPa.contains(namn) { vantarPa.remove(namn) }
    }

    /// Ingen startbild (startargumentet `-startbild 0`, för att mäta kallstarten utan den).
    func avstang() {
        oppnas = true
        borta = true
        vantarPa = []
    }

    fileprivate func borjaOppna() {
        guard !oppnas else { return }
        oppnas = true
        vantarPa = []
        Starttider.markera("startbild_oppnas")
    }

    fileprivate func blevBorta() {
        borta = true
        Starttider.markera("startbild_borta")
    }
}

/// Startbilden som vy, ovanpå hela appen (`RotVy`). Följer telefonens ljusa eller mörka läge, inte appens tema,
/// eftersom iOS startskärm gör det.
struct StartbildVy: View {
    let startbild: Startbild
    @Environment(AppMiljo.self) private var app
    @Environment(\.accessibilityReduceMotion) private var minska
    @State private var oppning: CGFloat = 0
    @State private var fyllning: CGFloat = 0
    @State private var visaStreck = false

    /// Gorillans storlek i punkter, samma som `Startgorilla` på startskärmen (100 pt).
    static let gorilla: CGFloat = 100

    var body: some View {
        GeometryReader { g in
            let radie = (g.size.width * g.size.width + g.size.height * g.size.height).squareRoot() / 2 + 24
            ZStack {
                Color("Startbakgrund")
                Image("Startgorilla")
                    .resizable()
                    .interpolation(.high)
                    .frame(width: Self.gorilla, height: Self.gorilla)
                    .scaleEffect(minska ? 1 : 1 - 0.14 * oppning)
                    .opacity(Double(max(0, 1 - oppning * 2.2)))
                Startstreck(fyllning: fyllning)
                    .frame(width: 56, height: 4)
                    .offset(y: Self.gorilla / 2 + 34)
                    .opacity(visaStreck && oppning == 0 ? 1 : 0)
                    .animation(.easeOut(duration: 0.3), value: visaStreck)
            }
            .mask {
                if minska {
                    Rectangle().opacity(Double(1 - oppning))
                } else {
                    Halcirkel(radie: radie * oppning).fill(style: FillStyle(eoFill: true))
                }
            }
        }
        .ignoresSafeArea()
        .environment(\.colorScheme, Self.systemetsSchema)
        .allowsHitTesting(oppning < 0.4)
        .accessibilityHidden(true)
        .task { await vantaOchOppna() }
    }

    /// Telefonens eget läge (scenens egenskaper, som appens tema inte ändrar).
    private static var systemetsSchema: ColorScheme {
        let scen = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scen?.traitCollection.userInterfaceStyle == .dark ? .dark : .light
    }

    private func vantaOchOppna() async {
        Starttider.markera("startbild_visas")
        let start = Date()
        var streckStartat = false
        while !startbild.oppnas {
            let gatt = Date().timeIntervalSince(start)
            if app.arIgang, startbild.vantarPa.isEmpty { break }
            if gatt >= Startbild.langstaTid { break }
            // Tar det mer än en halv sekund: ett tunt streck som fylls som vätska (aldrig helt förrän det är klart)
            if gatt > 0.5, !streckStartat {
                streckStartat = true
                visaStreck = true
                withAnimation(.timingCurve(0.2, 0.75, 0.25, 1, duration: 2.6)) { fyllning = 0.86 }
            }
            try? await Task.sleep(nanoseconds: 16_000_000)
        }
        startbild.borjaOppna()
        if streckStartat {
            withAnimation(.easeOut(duration: 0.16)) { fyllning = 1 }
            try? await Task.sleep(nanoseconds: 170_000_000)
        }
        withAnimation(minska ? .easeOut(duration: 0.25) : .timingCurve(0.65, 0, 0.3, 1, duration: 0.62)) { oppning = 1 }
        try? await Task.sleep(nanoseconds: minska ? 260_000_000 : 640_000_000)
        startbild.blevBorta()
    }
}

/// Hela ytan utom en cirkel i mitten (jämn-udda fyllning): startbilden öppnar sig genom att cirkeln växer.
private struct Halcirkel: Shape {
    var radie: CGFloat
    var animatableData: CGFloat {
        get { radie }
        set { radie = newValue }
    }

    func path(in r: CGRect) -> Path {
        var p = Path(r.insetBy(dx: -2, dy: -2))
        if radie > 0.5 {
            p.addEllipse(in: CGRect(x: r.midX - radie, y: r.midY - radie, width: radie * 2, height: radie * 2))
        }
        return p
    }
}

/// Det tunna strecket under gorillan medan något laddar: AdRazes orange fyller det från vänster som vätska, med en
/// mjuk våg i framkanten.
private struct Startstreck: View {
    var fyllning: CGFloat

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.12))
                Capsule()
                    .fill(Color(red: 1, green: 0x4b / 255.0, blue: 0x1f / 255.0))
                    .frame(width: max(g.size.height, g.size.width * fyllning))
            }
        }
    }
}
