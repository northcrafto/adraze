import SwiftUI

/// AdRaze för iPhone. Allt gemensamt finns i `AppMiljo` (Gemensamt/); modulerna under `App/` hittas och startas
/// av den, så den här filen behöver inte ändras när en modul läggs till.
///
/// Startargument: `-mode <namn>` kör ett självtest (Labb), `-utan <Modul,…>` startar utan vissa moduler.
///
/// Ägare: Grund.
@main
struct AdRazeApp: App {
    @State private var app = AppMiljo()
    @Environment(\.scenePhase) private var fas

    var body: some Scene {
        WindowGroup {
            RotVy()
                .environment(app)
                .environment(app.tema)
                // Inte `.task`: SwiftUI avbryter den när vyn lämnar hierarkin (en `.fullScreen`-modal gör det),
                // och då skulle starten och självtestet avbrytas mitt i. AppMiljo håller en egen uppgift.
                .onAppear { app.borjaKoraIgang() }
        }
        .onChange(of: fas) { _, ny in app.fasAndrad(ny) }
    }
}

/// Visar den vy som modulerna har valt (`app.huvudvy`) med temats läge, accent och textstorlek.
struct RotVy: View {
    @Environment(AppMiljo.self) private var app
    @Environment(Tema.self) private var tema
    @Environment(\.dynamicTypeSize) private var systemetsTextstorlek

    var body: some View {
        app.huvudvy.vy()
            .tint(tema.accent)
            .preferredColorScheme(tema.foredragetSchema)
            .dynamicTypeSize(tema.dynamiskTextstorlek(systemetsTextstorlek))
            .background { Fonstersond { Statusrad.folj($0) }.accessibilityHidden(true) }
            .onChange(of: app.statusrad, initial: true) { _, stil in Statusrad.satt(stil) }
    }
}
