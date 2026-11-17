import Foundation
import Observation
import QuickLook
import UIKit
import WebKit

/// En nedladdning i datorns format (`browser/main.js` `trackDownloads`): `{id, filename, url, path, total,
/// received, state}`. `state` som på datorn: `progressing`, `paused`, `completed`, `cancelled`, `interrupted`.
struct FlikNedladdning: Codable, Sendable, Hashable, Identifiable {
    var id: String
    var filename: String
    var url: String
    var path: String
    var total: Int64
    var received: Int64
    var state: String
    var privat: Bool
    /// Millisekunder sedan 1970.
    var startad: Double
    var klar: Double?
    var fel: String?

    var json: JSONVarde {
        var o: [String: JSONVarde] = [
            "id": .text(id), "filename": .text(filename), "url": .text(url), "path": .text(path),
            "total": .tal(Double(total)), "received": .tal(Double(received)), "state": .text(state),
            "privat": .bool(privat), "startad": .tal(startad),
        ]
        if let klar { o["klar"] = .tal(klar) }
        if let fel { o["fel"] = .text(fel) }
        return .objekt(o)
    }
}

/// Nedladdningarna med `WKDownload` (iOS 14.5+). Filerna hamnar i `Documents/Nedladdningar/` (syns i appen Filer
/// med `UIFileSharingEnabled` och `LSSupportsOpeningDocumentsInPlace`) med unika namn ("fil (2).pdf").
/// Listan sparas för vanliga flikar; privata flikars nedladdningar syns bara tills appen startas om (filen ligger
/// kvar, som i Safari).
///
/// Paus: WKDownload kan inte pausas, så paus = avbryt med `resumeData` och fortsätt =
/// `resumeDownload(fromResumeData:)` i en webbvy med samma datalager.
@MainActor
@Observable
final class Nedladdare {
    private(set) var poster: [FlikNedladdning] = []

    @ObservationIgnored private let lagring: Fliklagring
    /// Sant för en motor som bara läser (självtestets omstart).
    @ObservationIgnored var skrivskydd = false
    @ObservationIgnored private weak var handelser: Handelser?
    @ObservationIgnored private weak var brygga: BryggRegister?
    @ObservationIgnored private lazy var ombud = NedladdningsOmbud(self)
    @ObservationIgnored private var aktiva: [ObjectIdentifier: (id: String, d: WKDownload)] = [:]
    @ObservationIgnored private var forlopp: [String: NSKeyValueObservation] = [:]
    @ObservationIgnored private var fortsattData: [String: Data] = [:]
    @ObservationIgnored private var webbvyFor: [String: WeakVy] = [:]
    @ObservationIgnored private var interna: [ObjectIdentifier: Intern] = [:]
    @ObservationIgnored private var forhandsvisning: Forhandsvisning?
    @ObservationIgnored private var sparjobb: Task<Void, Never>?
    @ObservationIgnored private let logg = Logg("Nedladdningar")

    private struct Intern {
        let d: WKDownload
        var fil: URL?
        let svar: (URL?) -> Void
    }

    private final class WeakVy {
        weak var vy: WKWebView?
        init(_ vy: WKWebView?) { self.vy = vy }
    }

    init(lagring: Fliklagring, handelser: Handelser?, brygga: BryggRegister?) {
        self.lagring = lagring
        self.handelser = handelser
        self.brygga = brygga
        var sparade = lagring.las([FlikNedladdning].self, fran: lagring.nedladdningsfil) ?? []
        // Det som pågick när appen stängdes gick förlorat.
        for i in sparade.indices where sparade[i].state == "progressing" || sparade[i].state == "paused" {
            sparade[i].state = "interrupted"
        }
        poster = sparade
    }

    func post(_ id: String) -> FlikNedladdning? { poster.first { $0.id == id } }

    // MARK: - Starta

    /// En navigering blev en nedladdning (`didBecome download`). Delegaten sätts direkt, före svaret.
    func borja(_ d: WKDownload, flik: Webbflik) {
        let id = "d\(Int(Date().flikMs))\(Int.random(in: 100...999))"
        let url = d.originalRequest?.url?.absoluteString ?? ""
        poster.insert(FlikNedladdning(id: id, filename: "", url: url, path: "", total: 0, received: 0, state: "progressing",
                                      privat: flik.privat, startad: Date().flikMs), at: 0)
        aktiva[ObjectIdentifier(d)] = (id, d)
        webbvyFor[id] = WeakVy(flik.vy)
        d.delegate = ombud
        bevaka(d, id: id)
        skickaUppdatering(id)
        logg.info("startar \(url)")
    }

    /// "Ladda ned länkad fil": hämtar adressen som en nedladdning med flikens kakor och datalager.
    func laddaNed(_ url: URL, fran flik: Webbflik) {
        flik.webbvy.startDownload(using: URLRequest(url: url)) { [weak self, weak flik] d in
            guard let self, let flik else {
                d.cancel(nil)
                return
            }
            self.borja(d, flik: flik)
        }
    }

    /// Hämtar en fil med webbvyns kakor (för kontextmenyns bilder) till en tillfällig fil. Syns inte i listan.
    func hamtaFil(_ url: URL, i webbvy: WKWebView) async -> URL? {
        if url.scheme?.lowercased() == "data" { return Self.dataAdress(url) }
        return await withCheckedContinuation { (c: CheckedContinuation<URL?, Never>) in
            webbvy.startDownload(using: URLRequest(url: url)) { [weak self] d in
                guard let self else {
                    c.resume(returning: nil)
                    return
                }
                self.interna[ObjectIdentifier(d)] = Intern(d: d, fil: nil, svar: { c.resume(returning: $0) })
                d.delegate = self.ombud
            }
        }
    }

    private static func dataAdress(_ url: URL) -> URL? {
        let s = url.absoluteString
        guard let komma = s.firstIndex(of: ",") else { return nil }
        let huvud = s[..<komma].lowercased()
        let kropp = String(s[s.index(after: komma)...])
        let data = huvud.hasSuffix(";base64") ? Data(base64Encoded: kropp.removingPercentEncoding ?? kropp)
                                               : kropp.removingPercentEncoding.map { Data($0.utf8) }
        guard let data else { return nil }
        let andelse = huvud.contains("png") ? "png" : huvud.contains("gif") ? "gif" : huvud.contains("webp") ? "webp" : "jpg"
        let fil = tillfalligMapp().appendingPathComponent("bild-\(UUID().uuidString.prefix(8)).\(andelse)")
        return (try? data.write(to: fil)) != nil ? fil : nil
    }

    static func tillfalligMapp() -> URL {
        let m = FileManager.default.temporaryDirectory.appendingPathComponent("AdRaze-Flikar-filer", isDirectory: true)
        try? FileManager.default.createDirectory(at: m, withIntermediateDirectories: true)
        return m
    }

    private func bevaka(_ d: WKDownload, id: String) {
        forlopp[id] = d.progress.observe(\.completedUnitCount, options: [.new]) { [weak self] p, _ in
            let mottaget = p.completedUnitCount
            let totalt = p.totalUnitCount
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.forloppAndrat(id, mottaget, totalt) }
            }
        }
    }

    private func forloppAndrat(_ id: String, _ mottaget: Int64, _ totalt: Int64) {
        guard let i = poster.firstIndex(where: { $0.id == id }), poster[i].state == "progressing" else { return }
        poster[i].received = max(0, mottaget)
        if totalt > 0 { poster[i].total = totalt }
    }

    // MARK: - Från delegaten

    fileprivate func destination(_ d: WKDownload, _ svar: URLResponse, _ forslag: String) -> URL? {
        let namn = Self.rensatNamn(forslag.isEmpty ? (svar.suggestedFilename ?? "") : forslag)
        if var intern = interna[ObjectIdentifier(d)] {
            let fil = Self.tillfalligMapp().appendingPathComponent("\(UUID().uuidString.prefix(8))-\(namn)")
            intern.fil = fil
            interna[ObjectIdentifier(d)] = intern
            return fil
        }
        guard let (id, _) = aktiva[ObjectIdentifier(d)], let i = poster.firstIndex(where: { $0.id == id }) else { return nil }
        let fil = Self.unikFil(namn, i: lagring.nedladdningar)
        poster[i].filename = fil.lastPathComponent
        poster[i].path = fil.path
        if svar.expectedContentLength > 0 { poster[i].total = svar.expectedContentLength }
        skickaUppdatering(id)
        return fil
    }

    fileprivate func klar(_ d: WKDownload) {
        let nyckel = ObjectIdentifier(d)
        if let intern = interna.removeValue(forKey: nyckel) {
            intern.svar(intern.fil)
            return
        }
        guard let (id, _) = aktiva.removeValue(forKey: nyckel), let i = poster.firstIndex(where: { $0.id == id }) else { return }
        forlopp[id] = nil
        let storlek = (try? FileManager.default.attributesOfItem(atPath: poster[i].path)[.size] as? NSNumber)?.int64Value
        poster[i].state = "completed"
        poster[i].klar = Date().flikMs
        if let storlek { poster[i].received = storlek; poster[i].total = max(poster[i].total, storlek) }
        logg.info("klar: \(poster[i].filename) (\(poster[i].received) byte)")
        handelser?.skicka(FlikNedladdningKlar(id: id, fil: URL(fileURLWithPath: poster[i].path), privat: poster[i].privat))
        skickaUppdatering(id)
        sparaSnart()
    }

    fileprivate func misslyckades(_ d: WKDownload, _ e: Error, _ resume: Data?) {
        let nyckel = ObjectIdentifier(d)
        if let intern = interna.removeValue(forKey: nyckel) {
            if let f = intern.fil { try? FileManager.default.removeItem(at: f) }
            intern.svar(nil)
            return
        }
        guard let (id, _) = aktiva.removeValue(forKey: nyckel), let i = poster.firstIndex(where: { $0.id == id }) else { return }
        forlopp[id] = nil
        if let resume { fortsattData[id] = resume }
        // En pausad nedladdning avbryts med flit och ska stå kvar som pausad.
        if poster[i].state != "paused" && poster[i].state != "cancelled" {
            poster[i].state = "interrupted"
            poster[i].fel = (e as NSError).localizedDescription
            handelser?.skicka(FlikNedladdningMisslyckades(id: id, text: poster[i].fel ?? ""))
            logg.varning("misslyckades: \(poster[i].url): \(poster[i].fel ?? "")")
        }
        skickaUppdatering(id)
        sparaSnart()
    }

    // MARK: - Styra

    func pausa(_ id: String) {
        guard let (nyckel, varde) = aktiva.first(where: { $0.value.id == id }),
              let i = poster.firstIndex(where: { $0.id == id }) else { return }
        poster[i].state = "paused"
        aktiva.removeValue(forKey: nyckel)
        forlopp[id] = nil
        varde.d.cancel { [weak self] data in
            MainActor.assumeIsolated {
                if let data { self?.fortsattData[id] = data }
            }
        }
        skickaUppdatering(id)
    }

    /// Fortsätter en pausad eller avbruten nedladdning. Behöver en webbvy med samma datalager (fliken som startade
    /// den, annars `reserv`).
    func fortsatt(_ id: String, reserv: WKWebView?) {
        guard let data = fortsattData[id], let i = poster.firstIndex(where: { $0.id == id }),
              let vy = webbvyFor[id]?.vy ?? reserv else { return }
        fortsattData[id] = nil
        poster[i].state = "progressing"
        poster[i].fel = nil
        vy.resumeDownload(fromResumeData: data) { [weak self] d in
            guard let self else { return }
            self.aktiva[ObjectIdentifier(d)] = (id, d)
            d.delegate = self.ombud
            self.bevaka(d, id: id)
        }
        skickaUppdatering(id)
    }

    func avbryt(_ id: String) {
        guard let i = poster.firstIndex(where: { $0.id == id }) else { return }
        poster[i].state = "cancelled"
        if let (nyckel, varde) = aktiva.first(where: { $0.value.id == id }) {
            aktiva.removeValue(forKey: nyckel)
            varde.d.cancel(nil)
        }
        forlopp[id] = nil
        fortsattData[id] = nil
        if !poster[i].path.isEmpty { try? FileManager.default.removeItem(atPath: poster[i].path) }
        skickaUppdatering(id)
        sparaSnart()
    }

    /// Tar bort posten och filen.
    func taBort(_ id: String) {
        guard let i = poster.firstIndex(where: { $0.id == id }) else { return }
        if poster[i].state == "progressing" { avbryt(id) }
        if !poster[i].path.isEmpty { try? FileManager.default.removeItem(atPath: poster[i].path) }
        poster.remove(at: i)
        sparaSnart()
    }

    /// Visar filen i appen (QuickLook).
    func oppna(_ id: String) {
        guard let p = post(id), p.state == "completed", FileManager.default.fileExists(atPath: p.path),
              let topp = Flikfonster.topp() else { return }
        let kalla = Forhandsvisning(URL(fileURLWithPath: p.path))
        forhandsvisning = kalla
        let ql = QLPreviewController()
        ql.dataSource = kalla
        topp.present(ql, animated: true)
    }

    /// Delningsbladet för filen.
    func dela(_ id: String) {
        guard let p = post(id), p.state == "completed", FileManager.default.fileExists(atPath: p.path) else { return }
        Flikfonster.dela([URL(fileURLWithPath: p.path)])
    }

    // MARK: - Hjälp

    static func rensatNamn(_ namn: String) -> String {
        let forbjudna = CharacterSet(charactersIn: "/\\:\0\n\r\t")
        var s = String(namn.unicodeScalars.map { forbjudna.contains($0) ? "_" : Character($0) })
        s = s.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".")))
        if s.isEmpty { s = "nedladdning" }
        return String(s.prefix(180))
    }

    /// "fil.pdf", "fil (2).pdf", "fil (3).pdf" …
    static func unikFil(_ namn: String, i mapp: URL) -> URL {
        let fm = FileManager.default
        try? fm.createDirectory(at: mapp, withIntermediateDirectories: true)
        var fil = mapp.appendingPathComponent(namn)
        guard fm.fileExists(atPath: fil.path) else { return fil }
        let bas = (namn as NSString).deletingPathExtension
        let andelse = (namn as NSString).pathExtension
        var n = 2
        repeat {
            fil = mapp.appendingPathComponent(andelse.isEmpty ? "\(bas) (\(n))" : "\(bas) (\(n)).\(andelse)")
            n += 1
        } while fm.fileExists(atPath: fil.path)
        return fil
    }

    private func skickaUppdatering(_ id: String) {
        guard let p = post(id) else { return }
        brygga?.skicka("download-update", p.json)
    }

    private func sparaSnart() {
        sparjobb?.cancel()
        sparjobb = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            self?.sparaNu()
        }
    }

    func sparaNu() {
        sparjobb?.cancel()
        sparjobb = nil
        guard !skrivskydd else { return }
        lagring.skriv(poster.filter { !$0.privat }, till: lagring.nedladdningsfil)
    }
}

/// WKDownloadDelegate för `Nedladdare` (ett eget NSObject så att Nedladdare kan vara `@Observable`).
@MainActor
final class NedladdningsOmbud: NSObject, WKDownloadDelegate {
    private weak var nedladdare: Nedladdare?

    init(_ nedladdare: Nedladdare) {
        self.nedladdare = nedladdare
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        nedladdare?.destination(download, response, suggestedFilename)
    }

    func downloadDidFinish(_ download: WKDownload) {
        nedladdare?.klar(download)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        nedladdare?.misslyckades(download, error, resumeData)
    }
}

/// Källan till QuickLook för en nedladdad fil.
final class Forhandsvisning: NSObject, QLPreviewControllerDataSource {
    let fil: URL

    init(_ fil: URL) {
        self.fil = fil
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { fil as NSURL }
}
