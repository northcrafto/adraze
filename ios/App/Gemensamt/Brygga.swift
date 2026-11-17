import Foundation
import WebKit

/// Bryggans kanaler: hur Swift-moduler svarar på anrop från AdRaze-UI:t i webbvyerna och skickar händelser dit.
/// Motsvarar `ipcMain.handle` / `webContents.send` på datorn (del 3, 3.4).
///
/// Själva transporten (WKScriptMessageHandlerWithReply `adraze`, schemat `adraze-app://localhost`, preload-shimmen
/// och `window.adraze._emit`) gör Brygga (`App/Brygga/`). Den anropar `anropa(_:_:fran:)` för varje
/// `window.adraze.invoke(kanal, ...args)` och sätter `sandare` för händelser åt andra hållet. Modulerna
/// registrerar bara sina kanaler, i sin `registrera(i:)`:
///
///     app.brygga.hantera("anpassa:satt") { anrop in
///         let d = anrop.arg(0)
///         return app.installningar.satt(d["nyckel"].text ?? "", d.objekt?["varde"], etikett: d["etikett"].text).json
///     }
///     app.brygga.skicka("anpassa:andrad", ["nyckel": "tema.accent", "varde": "#3b6fe0"])
///
/// Kanalnamnen är datorns (`chatt:boot`, `anpassa:alla`, `falk-inst:alla` …), så att webbkoden inte behöver ändras.
/// Ett fel som kastas i en hanterare blir ett avvisat Promise i JS med felets text.
///
/// Säkerhet: bara AdRaze-UI:ts egna sidor (`adraze-app://localhost`, huvudramen) får anropa. Det kontrollerar
/// transporten innan `anropa` körs. Begränsa en känslig kanal till vissa sidor med `ytor:`.
///
/// Ägare: Grund (Gemensamt).
@MainActor
final class BryggRegister {
    typealias Hanterare = @MainActor (BryggAnrop) async throws -> JSONVarde

    private struct Post {
        let ytor: Set<String>?
        let modul: String
        let f: Hanterare
    }

    private var kanalerna: [String: Post] = [:]
    private var startdatan: [String: (modul: String, f: @MainActor (BryggKalla) -> JSONVarde)] = [:]
    private let logg = Logg("Brygga")

    /// Modulen som registrerar just nu (sätts av AppMiljo), för felmeddelanden om krockar.
    var registrerande = "Grund"

    /// Sätts av transporten: skickar en händelse till webbvyerna (`window.adraze._emit(kanal, data)`).
    var sandare: (@MainActor (_ kanal: String, _ data: JSONVarde, _ till: BryggMal) -> Void)?

    // MARK: - Registrera

    /// Registrerar en kanal. `ytor` = bara de här sidorna får anropa (`nil` = alla AdRaze-sidor).
    /// Samma kanal två gånger: den senaste gäller och en varning loggas.
    func hantera(_ kanal: String, ytor: Set<String>? = nil, _ f: @escaping Hanterare) {
        if let gammal = kanalerna[kanal] {
            logg.varning("kanalen \(kanal) registrerades av \(gammal.modul) och nu igen av \(registrerande); den senaste gäller")
        }
        kanalerna[kanal] = Post(ytor: ytor, modul: registrerande, f: f)
    }

    /// Data som sidan behöver synkront redan när den startar (datorns `sendSync`: `chatt:boot`, `i18n:load`,
    /// `anpassa:alla`, `falk-inst:alla`). Transporten lägger allt i `window.__adrazeBoot = {namn: data, …}`
    /// som ett WKUserScript innan sidan laddas.
    func startdata(_ namn: String, _ f: @escaping @MainActor (BryggKalla) -> JSONVarde) {
        if let gammal = startdatan[namn] {
            logg.varning("startdatan \(namn) registrerades av \(gammal.modul) och nu igen av \(registrerande)")
        }
        startdatan[namn] = (registrerande, f)
    }

    // MARK: - För transporten

    /// Kör hanteraren för en kanal. Kastar `BryggFel` om kanalen saknas eller sidan inte får anropa den.
    func anropa(_ kanal: String, _ argument: [JSONVarde], fran kalla: BryggKalla) async throws -> JSONVarde {
        guard let post = kanalerna[kanal] else { throw BryggFel.okandKanal(kanal) }
        if let ytor = post.ytor, !ytor.contains(kalla.yta) { throw BryggFel.nekad("\(kanal) från \(kalla.yta)") }
        do {
            return try await post.f(BryggAnrop(kanal: kanal, argument: argument, kalla: kalla))
        } catch let fel as BryggFel {
            throw fel
        } catch {
            logg.varning("\(kanal): \(error.localizedDescription)")
            throw BryggFel.misslyckades(error.localizedDescription)
        }
    }

    /// Startdatan för en sida, som ett objekt `{namn: data}`.
    func byggStartdata(for kalla: BryggKalla) -> JSONVarde {
        .objekt(startdatan.mapValues { $0.f(kalla) })
    }

    /// Alla registrerade kanaler och vem som registrerade dem (för felsökning och självtester).
    var kanaler: [String: String] { kanalerna.mapValues(\.modul) }
    var startdatanamn: [String] { startdatan.keys.sorted() }

    // MARK: - Händelser till webben

    /// Skickar en händelse till webbvyerna. Innan transporten finns (eller utan AdRaze-sidor öppna) händer inget.
    func skicka(_ kanal: String, _ data: JSONVarde = .null, till: BryggMal = .alla) {
        guard let sandare else {
            logg.felsok("\(kanal) skickades men ingen transport finns än")
            return
        }
        sandare(kanal, data, till)
    }
}

/// Ett anrop från en sida.
struct BryggAnrop: Sendable {
    let kanal: String
    let argument: [JSONVarde]
    let kalla: BryggKalla

    /// Argument nummer `i`, `.null` om det saknas.
    func arg(_ i: Int) -> JSONVarde { argument.indices.contains(i) ? argument[i] : .null }
}

/// Vilken sida ett anrop kom från. Fylls i av transporten.
struct BryggKalla: Sendable, Hashable {
    /// Vilken AdRaze-sida: `chatt`, `anpassa`, `startsida`, `falk`, `intro` … (filnamnet utan .html).
    let yta: String
    let url: URL?
    /// Webbvyn anropet kom från (för svar till just den), `nil` i självtester.
    let webbvy: ObjectIdentifier?

    init(yta: String, url: URL? = nil, webbvy: ObjectIdentifier? = nil) {
        self.yta = yta
        self.url = url
        self.webbvy = webbvy
    }
}

/// Vart en händelse ska.
enum BryggMal: Sendable, Hashable {
    case alla
    /// Alla webbvyer med en viss sida (`yta`).
    case yta(String)
    case webbvy(ObjectIdentifier)
}

/// Fel som går tillbaka till JS som ett avvisat Promise.
enum BryggFel: Error, LocalizedError, Sendable, Equatable {
    case okandKanal(String)
    case ogiltigt(String)
    case nekad(String)
    case misslyckades(String)

    var errorDescription: String? {
        switch self {
        case .okandKanal(let k): return "okänd kanal: \(k)"
        case .ogiltigt(let t): return "ogiltigt anrop: \(t)"
        case .nekad(let t): return "nekad: \(t)"
        case .misslyckades(let t): return t
        }
    }
}
