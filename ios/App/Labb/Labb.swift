import Foundation
import SwiftUI
import UIKit
import WebKit

/// Självtesterna. Appen startad med `-mode <namn>` kör testet `<namn>`, skriver resultatet till
/// `Documents/resultat-<namn>.json`, stannar kvar en stund (`-stanna`, standard 15 s) så att `bygg-sim.sh` hinner ta
/// en skärmbild, och avslutar sig sedan själv.
///
/// Varje modul registrerar sina egna tester i sin `registrera(i:)`; testkoden ligger i modulens egen mapp:
///
///     app.labb.registrera("skydd", beskrivning: "Listorna kompileras och blocktestet") { k in
///         let flik = k.app.flikar.nyFlik(URL(string: "https://example.com")!)
///         let klar = await k.vantaPa("sidan laddad", max: 30) { !flik.laddar && flik.url != nil }
///         k.kolla("titel", !flik.titel.isEmpty, .text(flik.titel))
///         await k.skarmbild("sida")
///     }
///
/// Kör från mint: `./fran-mint.sh skydd ~/adraze-app/skarm` (se LASMIG.md).
/// Resultatfilen innehåller `ok`, alla kontroller, värden, skärmbilderna, appens moduler och de sista loggraderna.
/// Testet räknas som misslyckat om någon kontroll misslyckas, om testet kastar ett fel eller om tiden
/// (`-maxtid`, standard 240 s) tar slut.
///
/// Ägare: Grund (App/Labb är ramverket; testerna ligger hos modulerna).
@MainActor
final class Labbregister {
    typealias Prov = @MainActor (Labbkorning) async throws -> Void

    struct Post {
        let namn: String
        let beskrivning: String
        let modul: String
        let kor: Prov
    }

    private(set) var prov: [String: Post] = [:]
    /// Modulen som registrerar just nu (sätts av AppMiljo).
    var registrerande = "Grund"
    private let logg = Logg("Labb")
    private var avslutad = false

    /// Registrerar ett självtest. Namnet är det som står efter `-mode` (små bokstäver, inga mellanslag).
    func registrera(_ namn: String, beskrivning: String, _ kor: @escaping Prov) {
        if let gammal = prov[namn] { logg.varning("testet \(namn) fanns redan (från \(gammal.modul)); \(registrerande) ersätter det") }
        prov[namn] = Post(namn: namn, beskrivning: beskrivning, modul: registrerande, kor: kor)
    }

    var namn: [String] { prov.keys.sorted() }

    /// Kör ett test, skriver resultatet och avslutar appen. Anropas av AppMiljo när appen har startat.
    func kor(_ namn: String, app: AppMiljo) async {
        let k = Labbkorning(namn: namn, app: app)
        k.forbered()
        logg.info("LABB start \(namn)")
        let maxtid = app.startargument.tal("maxtid") ?? 240
        // Vakten skriver resultatet även om testet hänger sig.
        let vakt = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(maxtid * 1_000_000_000))
            guard !Task.isCancelled else { return }
            k.fel = "tiden tog slut efter \(Int(maxtid)) s"
            await self?.avsluta(k, app: app)
        }
        if let p = prov[namn] {
            do {
                try await p.kor(k)
            } catch is CancellationError {
                k.fel = k.fel ?? "avbrutet"
            } catch {
                k.fel = "testet kastade: \(error)"
            }
        } else {
            k.fel = "inget test som heter \(namn). Finns: \(self.namn.joined(separator: ", "))"
        }
        vakt.cancel()
        await avsluta(k, app: app)
    }

    private func avsluta(_ k: Labbkorning, app: AppMiljo) async {
        guard !avslutad else { return }
        avslutad = true
        let fil = k.skrivResultat(prov: prov)
        logg.info("LABB klart \(k.namn): \(k.ok ? "ok" : "FEL") (\(k.antalMisslyckade) av \(k.antalKontroller) kontroller misslyckades\(k.fel.map { "; \($0)" } ?? "")) -> \(fil.path)")
        let stanna = app.startargument.tal("stanna") ?? 15
        try? await Task.sleep(nanoseconds: UInt64(max(0, stanna) * 1_000_000_000))
        logg.info("LABB avslutar appen")
        exit(k.ok ? 0 : 1)
    }
}

/// En körning av ett självtest: samlar kontroller, värden och skärmbilder.
@MainActor
final class Labbkorning {
    let namn: String
    unowned let app: AppMiljo
    let start = Date()
    /// Satt när testet kastade ett fel eller tiden tog slut.
    var fel: String?

    private(set) var kontroller: [JSONVarde] = []
    private(set) var varden: [String: JSONVarde] = [:]
    private(set) var bilder: [String] = []
    private(set) var antalMisslyckade = 0
    private let logg: Logg

    var antalKontroller: Int { kontroller.count }
    var ok: Bool { antalMisslyckade == 0 && fel == nil && !kontroller.isEmpty }

    init(namn: String, app: AppMiljo) {
        self.namn = namn
        self.app = app
        logg = Logg("Labb:\(namn)")
    }

    /// `Documents/`
    static var dokument: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }
    /// `Documents/resultat-<namn>.json`
    var resultatfil: URL { Self.dokument.appendingPathComponent("resultat-\(namn).json") }
    /// `Documents/Labb/<namn>/` med testets skärmbilder.
    var mapp: URL { Self.dokument.appendingPathComponent("Labb", isDirectory: true).appendingPathComponent(namn, isDirectory: true) }

    fileprivate func forbered() {
        try? FileManager.default.removeItem(at: resultatfil)
        try? FileManager.default.removeItem(at: mapp)
        try? FileManager.default.createDirectory(at: mapp, withIntermediateDirectories: true)
    }

    // MARK: - Det testen använder

    /// En kontroll. Ger `ok` tillbaka så att testet kan välja att sluta.
    @discardableResult
    func kolla(_ namn: String, _ ok: Bool, _ detalj: JSONVarde = .null) -> Bool {
        var post: [String: JSONVarde] = ["namn": .text(namn), "ok": .bool(ok), "ms": .tal(sedanStart())]
        if !detalj.arNull { post["detalj"] = detalj }
        kontroller.append(.objekt(post))
        if !ok { antalMisslyckade += 1 }
        logg.info("\(ok ? "ok  " : "FEL ") \(namn)\(detalj.arNull ? "" : " " + String(detalj.jsonText.prefix(300)))")
        return ok
    }

    /// Kontroll av att två värden är lika. Båda hamnar i resultatet.
    @discardableResult
    func lika<T: Equatable>(_ namn: String, _ fatt: T, _ vantat: T) -> Bool {
        kolla(namn, fatt == vantat, ["fatt": .text(String(describing: fatt)), "vantat": .text(String(describing: vantat))])
    }

    /// Ett mätvärde eller annat som ska med i resultatet.
    func notera(_ nyckel: String, _ varde: JSONVarde) { varden[nyckel] = varde }

    func logga(_ text: String) { logg.info(text) }

    func vanta(_ sekunder: Double) async throws {
        try await Task.sleep(nanoseconds: UInt64(max(0, sekunder) * 1_000_000_000))
    }

    /// Väntar tills villkoret är sant (frågar var 100:e ms), högst `max` sekunder. Blir en kontroll i resultatet.
    @discardableResult
    func vantaPa(_ namn: String, max sekunder: Double, _ villkor: @MainActor () -> Bool) async -> Bool {
        let t0 = Date()
        while !villkor() {
            if Date().timeIntervalSince(t0) > sekunder || Task.isCancelled {
                return kolla(namn, false, ["vantat_s": .tal(sekunder)])
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return kolla(namn, true, ["s": .tal((Date().timeIntervalSince(t0) * 100).rounded() / 100)])
    }

    /// Tar en skärmbild av appens fönster (med webbvyernas innehåll) och sparar den som `Documents/Labb/<test>/<namn>.png`.
    /// `fran-mint.sh` hämtar hem den som `<prefix>-<namn>.png`.
    ///
    /// `drawHierarchy` ritar inte webbinnehållet i webbvyer som ligger i en modal (ark, helskärm), så de
    /// fotograferas var för sig med `takeSnapshot` och läggs på sin plats, klippta efter arkets rundade hörn.
    @discardableResult
    func skarmbild(_ namn: String) async -> UIImage? {
        try? await Task.sleep(nanoseconds: 400_000_000)
        guard let fonster = Self.fonster() else {
            kolla("skärmbild \(namn)", false, "inget fönster")
            return nil
        }
        let format = UIGraphicsImageRendererFormat(for: fonster.traitCollection)
        let bas = UIGraphicsImageRenderer(bounds: fonster.bounds, format: format).image { _ in
            _ = fonster.drawHierarchy(in: fonster.bounds, afterScreenUpdates: true)
        }
        var lager: [(bild: UIImage, rekt: CGRect, form: UIBezierPath)] = []
        for vy in Self.webbvyerIModaler(fonster) {
            let konf = WKSnapshotConfiguration()
            konf.afterScreenUpdates = true
            let webb: UIImage? = await withCheckedContinuation { c in
                vy.takeSnapshot(with: konf) { b, _ in c.resume(returning: b) }
            }
            guard let webb, vy.window != nil else { continue }
            let rekt = vy.convert(vy.bounds, to: fonster)
            lager.append((webb, rekt, Self.klippform(for: vy, rekt: rekt, i: fonster)))
        }
        let bild = lager.isEmpty ? bas : UIGraphicsImageRenderer(bounds: fonster.bounds, format: format).image { ctx in
            bas.draw(in: fonster.bounds)
            for l in lager {
                ctx.cgContext.saveGState()
                l.form.addClip()
                l.bild.draw(in: l.rekt)
                ctx.cgContext.restoreGState()
            }
        }
        let fil = mapp.appendingPathComponent("\(namn).png")
        do {
            try bild.pngData()?.write(to: fil, options: .atomic)
            bilder.append("\(namn).png")
            logg.info("skärmbild \(fil.lastPathComponent)")
        } catch {
            kolla("skärmbild \(namn)", false, .text(error.localizedDescription))
        }
        return bild
    }

    /// Synliga webbvyer i modaler (ark, helskärm), i den ordning de visas.
    static func webbvyerIModaler(_ fonster: UIWindow) -> [WKWebView] {
        var ut: [WKWebView] = []
        var k = fonster.rootViewController?.presentedViewController
        while let p = k {
            if !p.isBeingDismissed, let v = p.viewIfLoaded { ut += webbvyer(i: v) }
            k = p.presentedViewController
        }
        return ut
    }

    private static func webbvyer(i vy: UIView) -> [WKWebView] {
        if vy.isHidden || vy.alpha < 0.01 { return [] }
        if let w = vy as? WKWebView { return w.bounds.width > 1 && w.bounds.height > 1 ? [w] : [] }
        return vy.subviews.flatMap { webbvyer(i: $0) }
    }

    /// Formen som webbvyn syns i: närmaste förälder med rundade hörn (arkets behållare), annars hela rutan.
    private static func klippform(for vy: UIView, rekt: CGRect, i fonster: UIWindow) -> UIBezierPath {
        var v: UIView? = vy
        while let x = v, x !== fonster {
            if x.layer.cornerRadius > 0.5, x.layer.masksToBounds || x.clipsToBounds || x !== vy {
                let r = x.convert(x.bounds, to: fonster)
                return UIBezierPath(roundedRect: r.intersection(rekt).isNull ? rekt : r, cornerRadius: x.layer.cornerRadius)
            }
            v = x.superview
        }
        // Arken ritar sina hörn i en mask som inte syns som cornerRadius: 24 upptill (preferredCornerRadius i Brygga)
        let horn: CGFloat = rekt.minY > 1 ? 24 : 0
        return UIBezierPath(roundedRect: rekt, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: horn, height: horn))
    }

    /// Appens fönster.
    static func fonster() -> UIWindow? {
        let fonstren = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return fonstren.first(where: \.isKeyWindow) ?? fonstren.first
    }

    /// Appens fysiska minnesavtryck i MB (samma mått som Xcode visar), -1 om det inte gick att läsa.
    static func minneMB() -> Double {
        var info = task_vm_info_data_t()
        var antal = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(antal)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &antal)
            }
        }
        return kr == KERN_SUCCESS ? (Double(info.phys_footprint) / 104_857.6).rounded() / 10 : -1
    }

    private func sedanStart() -> Double { (Date().timeIntervalSince(start) * 1000).rounded() }

    // MARK: - Resultatet

    fileprivate func skrivResultat(prov: [String: Labbregister.Post]) -> URL {
        let info = Bundle.main.infoDictionary ?? [:]
        let miljo = ProcessInfo.processInfo.environment
        let version = "\(info["CFBundleShortVersionString"] as? String ?? "?") (\(info["CFBundleVersion"] as? String ?? "?"))"
        var appdel: [String: JSONVarde] = [:]
        appdel["bundle"] = .text(Bundle.main.bundleIdentifier ?? "?")
        appdel["version"] = .text(version)
        appdel["ios"] = .text(UIDevice.current.systemVersion)
        appdel["enhet"] = .text(miljo["SIMULATOR_MODEL_IDENTIFIER"] ?? UIDevice.current.model)
        appdel["simulator"] = miljo["SIMULATOR_DEVICE_NAME"].map(JSONVarde.text) ?? .null
        appdel["argument"] = .lista(ProcessInfo.processInfo.arguments.dropFirst().map(JSONVarde.text))
        appdel["moduler"] = .lista(app.moduler.map(\.json))
        appdel["leverantorer"] = .objekt(app.leverantorer.mapValues(JSONVarde.text))
        appdel["bryggkanaler"] = .objekt(app.brygga.kanaler.mapValues(JSONVarde.text))
        var tester: [String: JSONVarde] = [:]
        for (n, p) in prov { tester[n] = .objekt(["modul": .text(p.modul), "beskrivning": .text(p.beskrivning)]) }
        appdel["tester"] = .objekt(tester)
        appdel["minne_mb"] = .tal(Self.minneMB())
        appdel["sedan_appstart_s"] = .tal((Date().timeIntervalSince(app.starttid) * 100).rounded() / 100)

        var r: [String: JSONVarde] = [:]
        r["prov"] = .text(namn)
        r["ok"] = .bool(ok)
        r["fel"] = fel.map(JSONVarde.text) ?? .null
        r["start"] = .text(ISO8601DateFormatter().string(from: start))
        r["tid_s"] = .tal((Date().timeIntervalSince(start) * 100).rounded() / 100)
        r["kontroller"] = .lista(kontroller)
        r["misslyckade"] = .tal(Double(antalMisslyckade))
        r["varden"] = .objekt(varden)
        r["skarmbilder"] = .lista(bilder.map(JSONVarde.text))
        r["app"] = .objekt(appdel)
        r["logg"] = .lista(Logg.senaste.suffix(250).map(JSONVarde.text))
        let resultat = JSONVarde.objekt(r)
        do {
            try resultat.jsonData(fin: true).write(to: resultatfil, options: .atomic)
        } catch {
            logg.fel("kunde inte skriva \(resultatfil.path): \(error.localizedDescription)")
        }
        return resultatfil
    }
}
