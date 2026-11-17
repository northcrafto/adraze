import Foundation
import os

/// Loggning för hela appen. Skapa en per modul och använd den överallt i modulen:
///
///     private let logg = Logg("Skydd")
///     logg.info("listorna klara på \(sek) s")
///     logg.fel("kompileringen misslyckades: \(fel)")
///
/// Varje rad hamnar på tre ställen:
///  - systemloggen (`os.Logger`, subsystem `app.adraze.browser`, kategori = modulens namn), som syns med
///    `xcrun simctl spawn booted log stream --predicate 'subsystem == "app.adraze.browser"'`,
///  - standard ut, som `bygg-sim.sh` sparar och `fran-mint.sh` hämtar hem (`<namn>-logg.txt`),
///  - ett minne med de senaste 500 raderna, som självtesterna lägger i resultatfilen.
///
/// Logga aldrig lösenord, tokens, nycklar eller chattmeddelanden i klartext.
///
/// Ägare: Grund (Gemensamt).
struct Logg: Sendable {
    let kategori: String
    private let logger: Logger

    static let subsystem = "app.adraze.browser"

    init(_ kategori: String) {
        self.kategori = kategori
        logger = Logger(subsystem: Logg.subsystem, category: kategori)
    }

    func info(_ text: @autoclosure () -> String) { skriv("", text(), .info) }
    func varning(_ text: @autoclosure () -> String) { skriv("varning: ", text(), .default) }
    func fel(_ text: @autoclosure () -> String) { skriv("FEL: ", text(), .error) }

    /// Bara i Debug-bygget.
    func felsok(_ text: @autoclosure () -> String) {
        #if DEBUG
        skriv("felsök: ", text(), .debug)
        #endif
    }

    private func skriv(_ niva: String, _ text: String, _ typ: OSLogType) {
        logger.log(level: typ, "\(niva, privacy: .public)\(text, privacy: .public)")
        let rad = "\(Logg.tid()) [\(kategori)] \(niva)\(text)"
        Logg.minne.lagg(rad)
        print("ADRAZE \(rad)")
    }

    // MARK: - Gemensamt för alla

    /// De senaste raderna (högst 500), äldst först.
    static var senaste: [String] { minne.alla() }

    /// Gör standard ut radbuffrad så att raderna hamnar i filen även om appen avslutas tvärt.
    /// Anropas först av allt när appen startar (AppMiljo.starta).
    static func forbered() {
        setvbuf(stdout, nil, _IOLBF, 0)
        _ = start
    }

    private static let start = Date()
    private static let minne = Loggminne()
    private static func tid() -> String { String(format: "%7.3f", Date().timeIntervalSince(start)) }
}

/// Ringbuffert för de senaste loggraderna. Trådsäker.
private final class Loggminne: @unchecked Sendable {
    private let las = NSLock()
    private var rader: [String] = []

    func lagg(_ rad: String) {
        las.lock()
        rader.append(rad)
        if rader.count > 500 { rader.removeFirst(rader.count - 500) }
        las.unlock()
    }

    func alla() -> [String] {
        las.lock()
        defer { las.unlock() }
        return rader
    }
}
