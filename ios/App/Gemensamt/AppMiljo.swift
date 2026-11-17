import Foundation
import Observation
import SwiftUI
import UIKit

/// Appens gemensamma delar, en instans för hela appen. Moduler får den i `registrera(i:)` och `starta(i:)`,
/// SwiftUI-vyer når den med `@Environment(AppMiljo.self) private var app`, och UIKit-kod som inte når miljön
/// använder `AppMiljo.delad`.
///
/// Tjänsterna börjar som enkla ersättningar ur `Gemensamt/Stubbar/` och byts av modulerna med `ersatt(...)`:
///
/// | Egenskap | Protokoll | Ersättning från start | Riktig från |
/// |---|---|---|---|
/// | `flikar` | `FlikHanterare` | `EnkelFlikHanterare` (flera flikar, inget sparas) | Flikar |
/// | `skydd` | `SkyddTjanst` | `IngetSkydd` | Skydd |
/// | `konto` | `KontoTjanst` | `EnkeltKonto` (läser token ur Keychain) | Konto |
/// | `huvudvy` | – | `EnkeltSkal` (en webbvy och adressfältet nere) | Skal |
/// | `bibliotek` | `Bibliotekstjanst` | `TomtBibliotek` (bara i minnet) | Flikar |
/// | `sidor` | `SidTjanst` | `IngaSidor` | Brygga |
///
/// `platser` (menyns Anpassa, Falk och Chatt) fylls av modulerna med `ersatt(plats:titel:vy:)`.
/// `installningar`, `tema`, `handelser`, `brygga` och `labb` är färdiga och byts inte.
///
/// Ägare: Grund (Gemensamt).
@MainActor
@Observable
final class AppMiljo {
    /// Den enda instansen.
    private(set) static var delad: AppMiljo!

    let handelser: Handelser
    let installningar: Installningar
    let tema: Tema
    let brygga: BryggRegister
    let labb: Labbregister
    let startargument: Startargument
    let starttid = Date()
    /// Gorillan över appen tills det första innehållet syns (`Startbild.swift`).
    let startbild = Startbild()

    private(set) var flikar: any FlikHanterare
    private(set) var skydd: any SkyddTjanst
    private(set) var konto: any KontoTjanst
    private(set) var huvudvy: Huvudvy
    private(set) var bibliotek: any Bibliotekstjanst
    private(set) var sidor: any SidTjanst
    /// Menyplatserna (`Platser.anpassa`, `.falk`, `.chatt`) som någon modul har fyllt.
    private(set) var platser: [String: Plats] = [:]

    /// Vilken modul som levererar varje tjänst, till exempel `["flikar": "Flikar", "skydd": "Grund"]`.
    private(set) var leverantorer: [String: String]
    /// Modulerna som hittades, i den ordning de registrerades.
    private(set) var moduler: [Modulinfo] = []
    /// Sant när alla moduler har startat.
    private(set) var arIgang = false
    /// Statusradens stil över huvudvyn (`Statusrad.swift`). Den modul som lägger något under statusraden
    /// sätter den och återställer `.auto`.
    var statusrad: Statusradsstil = .auto

    /// Modulen som registrerar eller startar just nu.
    @ObservationIgnored private(set) var aktuellModul = "Grund"
    @ObservationIgnored private var modultyper: [String: any AppModul.Type] = [:]
    @ObservationIgnored private var harStartat = false
    @ObservationIgnored private var startuppgift: Task<Void, Never>?
    @ObservationIgnored private let logg = Logg("App")

    init(argument: Startargument = Startargument()) {
        Starttider.markera("appmiljo")
        Starttider.vaktaHuvudtraden()
        Logg.forbered()
        startargument = argument
        Typsnitt.registrera()
        handelser = Handelser()
        installningar = Installningar(handelser: handelser)
        installningar.registrera(Nycklar.typade)
        for d in Installningsdef.franDatorn { installningar.registrera(d) }
        tema = Tema(installningar: installningar)
        brygga = BryggRegister()
        labb = Labbregister()
        let stubbflikar = EnkelFlikHanterare()
        flikar = stubbflikar
        skydd = IngetSkydd()
        konto = EnkeltKonto()
        huvudvy = Huvudvy(namn: "EnkeltSkal") { AnyView(EnkeltSkal()) }
        bibliotek = TomtBibliotek(handelser: handelser)
        sidor = IngaSidor()
        leverantorer = ["flikar": "Grund", "skydd": "Grund", "konto": "Grund", "huvudvy": "Grund", "bibliotek": "Grund", "sidor": "Grund"]
        stubbflikar.app = self
        AppMiljo.delad = self

        let info = Bundle.main.infoDictionary ?? [:]
        logg.info("AdRaze \(info["CFBundleShortVersionString"] ?? "?") (\(info["CFBundleVersion"] ?? "?")), iOS \(UIDevice.current.systemVersion)"
                  + (argument.lage.map { ", självtest \($0)" } ?? ""))
        Sprak.delad.folj(self)
        if argument.tal("startbild") == 0 { startbild.avstang() }
        registreraModuler()
        Starttider.markera("moduler_registrerade")
        if flikar === stubbflikar, stubbflikar.flikar.isEmpty { stubbflikar.nyFlik(nil, privat: false, aktivera: true) }
    }

    // MARK: - Byta tjänster (i en moduls registrera(i:))

    func ersatt(flikar ny: any FlikHanterare) {
        flikar = ny
        noteraLeverantor("flikar", ny)
    }

    func ersatt(skydd ny: any SkyddTjanst) {
        skydd = ny
        noteraLeverantor("skydd", ny)
    }

    func ersatt(konto ny: any KontoTjanst) {
        konto = ny
        noteraLeverantor("konto", ny)
    }

    func ersatt(bibliotek ny: any Bibliotekstjanst) {
        bibliotek = ny
        noteraLeverantor("bibliotek", ny)
    }

    func ersatt(sidor ny: any SidTjanst) {
        sidor = ny
        noteraLeverantor("sidor", ny)
    }

    /// En plats i skalets meny som visas som en SwiftUI-vy i ett ark (Falk, Chatt).
    func ersatt<V: View>(plats: String, titel: String, @ViewBuilder vy: @escaping @MainActor () -> V) {
        platser[plats] = Plats(id: plats, titel: titel, vy: { AnyView(vy()) }, oppna: nil)
        noteraLeverantor("plats." + plats, titel)
    }

    /// En plats i skalets meny som modulen visar själv (Brygga visar Anpassa som sitt eget ark).
    func ersatt(plats: String, titel: String, oppna: @escaping @MainActor () -> Void) {
        platser[plats] = Plats(id: plats, titel: titel, vy: nil, oppna: oppna)
        noteraLeverantor("plats." + plats, titel)
    }

    /// Byter hela vyn som appen visar (Skal gör det med sitt skal).
    func ersatt<V: View>(huvudvy namn: String, @ViewBuilder _ vy: @escaping @MainActor () -> V) {
        huvudvy = Huvudvy(namn: namn) { AnyView(vy()) }
        noteraLeverantor("huvudvy", namn)
    }

    private func noteraLeverantor(_ tjanst: String, _ vad: Any) {
        if let gammal = leverantorer[tjanst], gammal != "Grund", gammal != aktuellModul {
            logg.varning("\(tjanst) levererades av \(gammal) och byts nu av \(aktuellModul)")
        }
        leverantorer[tjanst] = aktuellModul
        logg.info("\(tjanst): \(aktuellModul) (\(vad is String ? vad as! String : String(describing: type(of: vad))))")
    }

    // MARK: - Start

    private func registreraModuler() {
        for m in Modulsokare.hitta() {
            var info = Modulinfo(namn: m.namn, klass: String(describing: m), ordning: m.ordning)
            if startargument.utan.contains(m.namn.lowercased()) {
                info.utesluten = true
                moduler.append(info)
                logg.info("hoppar över \(m.namn) (-utan)")
                continue
            }
            aktuellModul = m.namn
            brygga.registrerande = m.namn
            labb.registrerande = m.namn
            let t0 = CFAbsoluteTimeGetCurrent()
            m.registrera(i: self)
            info.registreraMs = ((CFAbsoluteTimeGetCurrent() - t0) * 100_000).rounded() / 100
            moduler.append(info)
            modultyper[m.namn] = m
        }
        aktuellModul = "Grund"
        brygga.registrerande = "Grund"
        labb.registrerande = "Grund"
        logg.info("moduler: " + moduler.map { $0.utesluten ? "(\($0.namn))" : $0.namn }.joined(separator: ", "))
    }

    /// Startar `korIgang()` i en egen uppgift som lever lika länge som appen (anropas av AdRazeApp, fler anrop gör
    /// ingenting). Inte i en vys `.task`: SwiftUI avbryter den uppgiften när vyn lämnar hierarkin, till exempel
    /// medan en `.fullScreen`-modal visas, och då avbröts modulernas start och självtesterna mitt i.
    func borjaKoraIgang() {
        guard startuppgift == nil else { return }
        startuppgift = Task { await korIgang() }
    }

    /// Startar modulerna och sedan självtestet om appen startades med `-mode <namn>`. Körs en gång.
    func korIgang() async {
        guard !harStartat else { return }
        harStartat = true
        for i in moduler.indices where !moduler[i].utesluten {
            guard let typ = modultyper[moduler[i].namn] else { continue }
            aktuellModul = typ.namn
            let t0 = CFAbsoluteTimeGetCurrent()
            await typ.starta(i: self)
            moduler[i].startaMs = ((CFAbsoluteTimeGetCurrent() - t0) * 100_000).rounded() / 100
        }
        aktuellModul = "Grund"
        arIgang = true
        Starttider.markera("moduler_startade")
        if let lage = startargument.lage { await labb.kor(lage, app: self) }
    }

    /// Från SwiftUI:s scenePhase.
    func fasAndrad(_ fas: ScenePhase) {
        let f: AppFasAndrad.Fas
        switch fas {
        case .active: f = .aktiv
        case .background: f = .bakgrund
        default: f = .inaktiv
        }
        if f == .bakgrund { installningar.sparaNu() }
        handelser.skicka(AppFasAndrad(fas: f))
    }
}

/// Vyn appen visar.
struct Huvudvy {
    let namn: String
    let vy: @MainActor () -> AnyView
}

/// Startargumenten (`simctl launch … app.adraze.browser -mode rok -utan Skydd,Flikar`). Alltid `-namn värde`.
///
/// - `-mode <namn>`: kör självtestet `<namn>` (se `Labbregister`).
/// - `-utan <Modul,Modul>`: registrera och starta inte de här modulerna.
/// - `-stanna <sek>`: så länge appen är kvar efter självtestet, för skärmbilden (standard 15).
/// - `-maxtid <sek>`: längsta tid för ett självtest (standard 240).
/// - Egna: `startargument.text("url")`.
struct Startargument: Sendable {
    let alla: [String: String]

    init(_ argv: [String] = ProcessInfo.processInfo.arguments) {
        var ut: [String: String] = [:]
        var i = 1
        while i < argv.count {
            let a = argv[i]
            if a.hasPrefix("-"), a.count > 1, !a.hasPrefix("--"), i + 1 < argv.count {
                ut[String(a.dropFirst())] = argv[i + 1]
                i += 2
            } else {
                i += 1
            }
        }
        alla = ut
    }

    func text(_ namn: String) -> String? { alla[namn] }
    func tal(_ namn: String) -> Double? { alla[namn].flatMap(Double.init) }

    var lage: String? { alla["mode"] }
    var utan: Set<String> {
        Set((alla["utan"] ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty })
    }
}
