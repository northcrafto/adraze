import Foundation
import UIKit
import WebKit

/// `-mode helhet`: hela appen ihop, som någon som använder den. Bara via `app` och Gemensamt, så att testet
/// berättar vad som saknas om en modul inte är med (då misslyckas de kontrollerna, testet kraschar inte).
///
///  1. Alla moduler är med och levererar sina tjänster; skyddet blir klart.
///  2. Startsidan (Brygga) i en ny flik, med ljus statusrad över bilden och utan egen sökruta (skalets
///     adressfält finns nertill). Varken startsidan eller Anpassa säger "datorn" eller Chromium.
///  3. Adressfältet (det skalet gör: `flik.ladda(text:)`) går till en lokal nyhetssida med annonser: skölden
///     räknar det stoppade och annonsplatserna döljs.
///  4. Tre flikar, flikväxlaren och menyn (Skal, öppnade med `SkalVisa`). Statusraden byter ljus/mörk efter
///     sidans färg.
///  5. Anpassa från menyn; temat Natt (blå accent, mörkt) sätts med samma kanal som Anpassa-sidan använder och
///     skalet byter färg.
///  6. En farlig sida ger stoppsidan (Skydd), ett sidfel felsidan (Flikar).
///  7. Inställningarna återställs och en ny flik visar startsidan igen.
///
/// `-system`-bilderna är simulatorns egna (med statusraden, `Labbkorning.systembild`). Sidorna kommer från en
/// lokal server (`Labbserver`, `Labb/Bunt/helhet/`); bara annonsnätverken ligger på nätet, och dem stoppar skyddet
/// innan något hämtas.
///
/// Ägare: Grund.
@MainActor
enum HelhetProv {
    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        let inst = app.installningar
        let fore = (sprak: inst[Nycklar.sprakVal], accent: inst[.temaAccent], lage: inst[.temaLage], placering: inst[.verktygPlacering])
        inst[Nycklar.sprakVal] = "sv"
        inst[.temaAccent] = "#ff4b1f"
        inst[.temaLage] = .ljust
        inst[.verktygPlacering] = .nere

        // 1. Modulerna och skyddet
        let moduler = Set(app.moduler.filter { !$0.utesluten }.map(\.namn))
        k.notera("moduler", .lista(app.moduler.map { .text($0.namn + ($0.utesluten ? " (utesluten)" : "")) }))
        k.notera("leverantorer", .objekt(app.leverantorer.mapValues { .text($0) }))
        for m in ["Skal", "Flikar", "Skydd", "Brygga"] { k.kolla("modulen \(m) är med", moduler.contains(m)) }
        for (tjanst, modul) in [("huvudvy", "Skal"), ("flikar", "Flikar"), ("bibliotek", "Flikar"), ("skydd", "Skydd"),
                                ("sidor", "Brygga"), ("plats.anpassa", "Brygga")] {
            k.lika("\(tjanst) kommer från \(modul)", app.leverantorer[tjanst] ?? "-", modul)
        }
        let skyddKlart = await k.vantaPa("skyddet är klart", max: 90) {
            if case .klart = app.skydd.lage { return true } else { return false }
        }
        if case .klart(let regler) = app.skydd.lage { k.notera("skydd_regler", .tal(Double(regler))) }

        let server = Labbserver(sidor: [
            "/": text("nyheter.html"), "/recept": text("recept.html"), "/vader": text("vader.html"),
        ])
        let port = try await server.starta()
        defer { server.stoppa() }
        let bas = "http://127.0.0.1:\(port)"

        // 2. Startsidan i en tom flik
        app.flikar.stangAlla(privata: true)
        app.flikar.stangAlla(privata: false)
        if app.flikar.aktiv == nil || app.flikar.aktiv?.url != nil { _ = app.flikar.nyFlik(nil) }
        try await k.vanta(0.3)
        let start = await vantaPaSida("startsida", k, max: 15)
        k.kolla("startsidan syns i den nya fliken", start != nil)
        try await k.vanta(1.0)
        k.lika("statusraden är ljus över startsidans bild", app.statusrad, .ljus)
        k.kolla("rotvyn ger UIKit ljus statusrad", Statusrad.aktuell == .lightContent,
                .text(Statusrad.aktuell.map { "\($0.rawValue)" } ?? "ingen"))
        await k.skarmbild("01-startsida")
        await k.systembild("01-startsida-system")

        // 3. Adressfältet på startsidan (skalets ga(_:) gör flik.ladda(text:)) -> nyhetssidan med annonser
        guard let flik = app.flikar.aktiv else {
            k.kolla("en aktiv flik finns", false)
            return
        }
        if let start {
            let sokruta = await Labbjs.kor(start, "(() => { const s = document.getElementById('nt-search'); return s ? getComputedStyle(s.parentElement).display : 'saknas'; })()") as? String
            k.lika("startsidans egen sökruta är dold i skalet (adressfältet finns nertill)", sokruta ?? "-", "none")
            let datorord = await Labbjs.kor(start, Self.datorordJS) as? String
            k.lika("startsidan säger inte datorn eller Chromium på iPhone", datorord ?? "-", "[]")
        }
        flik.ladda(text: bas + "/")
        let laddad = await vanta(12) { flik.url?.port == Int(port) && !flik.laddar }
        k.kolla("nyhetssidan laddades från adressfältet", laddad, .text(flik.url?.absoluteString ?? "ingen adress"))
        let raknat = await vanta(8) { (app.skydd.antalBlockerade(i: flik.id) ?? 0) >= 6 }
        let antal = app.skydd.antalBlockerade(i: flik.id)
        k.kolla("skölden räknar stoppade annonser och spårare (minst 6 av 9)", raknat, .tal(Double(antal ?? -1)))
        k.notera("blockerade_pa_sidan", .tal(Double(antal ?? -1)))
        k.notera("blockerade_totalt", .tal(Double(app.skydd.totaltBlockerade ?? -1)))
        let dolda = await Labbjs.kor(flik.webbvy, "[...document.querySelectorAll('.ad-slot')].map(e => getComputedStyle(e).display).join(',')") as? String
        k.lika("annonsplatserna är dolda", dolda ?? "-", "none,none")
        try await k.vanta(0.6)
        k.lika("statusraden: mörk text över sidans vita färg", app.statusrad, .mork)
        await k.skarmbild("02-sida-med-annonser")

        // 4. Tre flikar, flikväxlaren, menyn
        let recept = app.flikar.nyFlik(URL(string: bas + "/recept"))
        _ = await vanta(10) { !recept.laddar && recept.url != nil }
        let vader = app.flikar.nyFlik(URL(string: bas + "/vader"))
        _ = await vanta(10) { !vader.laddar && vader.url != nil }
        k.lika("tre vanliga flikar", app.flikar.flikar.filter { !$0.privat }.count, 3)
        try await k.vanta(1.5)
        k.lika("statusraden: ljus text över vädersidans blå theme-color", app.statusrad, .ljus)
        await k.skarmbild("03-tredje-fliken")
        await k.systembild("03-tredje-fliken-system")

        app.handelser.skicka(SkalVisa(yta: .flikvaxlare))
        try await k.vanta(1.4)
        await k.skarmbild("04-flikvaxlare")
        app.handelser.skicka(SkalVisa(yta: .inget))
        try await k.vanta(0.8)

        app.handelser.skicka(SkalVisa(yta: .meny))
        try await k.vanta(1.0)
        k.lika("statusraden: ljus text över menyn", app.statusrad, .ljus)
        await k.skarmbild("05-meny")
        await k.systembild("05-meny-system")

        // 5. Anpassa från menyn, temat Natt
        app.handelser.skicka(SkalVisa(yta: .plats(Platser.anpassa)))
        let anpassa = await vantaPaSida("anpassa", k, max: 15)
        k.kolla("Anpassa öppnades från menyn", anpassa != nil)
        try await k.vanta(1.2)
        if let anpassa {
            let datorord = await Labbjs.kor(anpassa, Self.datorordJS) as? String
            k.lika("Anpassa säger inte datorn eller Chromium på iPhone", datorord ?? "-", "[]")
        }
        await k.skarmbild("06-anpassa")
        await k.systembild("06-anpassa-system")
        let kalla = BryggKalla(yta: "anpassa")
        for (nyckel, varde) in [("tema.accent", JSONVarde.text("#3b6fe0")), ("tema.lage", .text("morkt"))] {
            do {
                let svar = try await app.brygga.anropa("anpassa:satt", [.objekt(["nyckel": .text(nyckel), "varde": varde])], fran: kalla)
                k.kolla("anpassa:satt \(nyckel)", svar["ok"].bool ?? false, svar)
            } catch {
                k.kolla("anpassa:satt \(nyckel)", false, .text("\(error)"))
            }
        }
        k.lika("accenten blev blå", inst[.temaAccent], "#3b6fe0")
        k.kolla("appen är mörk", app.tema.foredragetSchema == .dark)
        try await k.vanta(1.2)
        await k.skarmbild("07-anpassa-natt")
        app.sidor.stang(nil)
        try await k.vanta(1.0)
        k.kolla("Anpassa stängdes", synligSida("anpassa") == nil)
        await k.skarmbild("08-skalet-natt")

        // 6. Stoppsidan och felsidan i den aktiva fliken
        guard let aktiv = app.flikar.aktiv else { return }
        let farlig = farligVard()
        var stoppad: HuvudsidaBlockerad?
        let p = app.handelser.lyssna(HuvudsidaBlockerad.self) { h in if h.flik == aktiv.id { stoppad = h } }
        aktiv.ladda(URL(string: "https://\(farlig)/")!)
        _ = await vanta(20) { stoppad != nil }
        p.avsluta()
        k.kolla("den farliga sidan stoppades (\(farlig))", stoppad != nil)
        let stopptext = await vantaPaText(aktiv.webbvy, max: 8) { t in t.contains("Fortsätt ändå") }
        k.kolla("stoppsidan visar Gå tillbaka och Fortsätt ändå",
                stopptext.contains("Gå tillbaka") && stopptext.contains("Fortsätt ändå"), .text(String(stopptext.prefix(300))))
        try await k.vanta(0.6)
        k.lika("stoppsidans theme-color följer det mörka läget (bandet under statusraden)",
               aktiv.webbvy.themeColor.map { Self.hex($0, mork: true) } ?? "ingen", "#0c0c0e")
        k.lika("statusraden: ljus text över stoppsidan", app.statusrad.rawValue, "ljus")
        await k.skarmbild("09-stoppsida")
        await k.systembild("09-stoppsida-system")

        aktiv.ladda(URL(string: bas + "/trasig")!)
        let felvisad = await vanta(15) { aktiv.fel != nil && aktiv.visarFelsida }
        k.kolla("sidfelet visar felsidan", felvisad, .text(aktiv.fel.map { "\($0.doman) \($0.kod) \($0.text)" } ?? "inget fel"))
        let feltext = await vantaPaText(aktiv.webbvy, max: 6) { t in t.contains("Försök igen") }
        k.kolla("felsidan har Försök igen", feltext.contains("Försök igen"), .text(String(feltext.prefix(200))))
        try await k.vanta(0.8)   // laddlinjen tonar ut efter laddningen
        await k.skarmbild("10-felsida")

        // 7. Tillbaka till standard och en ny flik
        inst[.temaAccent] = fore.accent
        inst[.temaLage] = fore.lage
        inst[.verktygPlacering] = fore.placering
        _ = app.flikar.nyFlik(nil)
        let igen = await vantaPaSida("startsida", k, max: 10)
        k.kolla("startsidan i en ny flik igen", igen != nil)
        try await k.vanta(1.2)
        await k.skarmbild("11-ny-flik")
        await k.systembild("11-ny-flik-system")
        k.notera("minne_mb", .tal(Labbkorning.minneMB()))
        k.notera("flikar", .tal(Double(app.flikar.flikar.count)))
        inst[Nycklar.sprakVal] = fore.sprak
        _ = skyddKlart
    }

    // MARK: - Hjälp

    static func hex(_ c: UIColor, mork: Bool) -> String {
        let r = c.resolvedColor(with: UITraitCollection(userInterfaceStyle: mork ? .dark : .light))
        var rr: CGFloat = 0, gg: CGFloat = 0, bb: CGFloat = 0, aa: CGFloat = 0
        guard r.getRed(&rr, green: &gg, blue: &bb, alpha: &aa) else { return "?" }
        return Palett.hex([Double(rr) * 255, Double(gg) * 255, Double(bb) * 255])
    }

    /// Texter på sidan (utom skript, stil och användarens egna) som fortfarande säger dator eller Chromium, och
    /// synliga texter om "alla fönster" (dolda datorrader, som eget konto per fönster, får finnas kvar i sidan).
    static let datorordJS = """
    (() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) =>
        n.parentElement && n.parentElement.closest('script, style, [translate="no"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      const hitt = []; let n; while ((n = w.nextNode())) {
        const t = n.nodeValue, syns = n.parentElement.getClientRects().length > 0;
        if (/dator|Chromium/.test(t) || (syns && /alla fönster/.test(t))) hitt.push(t.trim().slice(0, 90)); }
      return JSON.stringify(hitt.slice(0, 6)); })()
    """

    private static func text(_ fil: String) -> String {
        Bunt.data("Labb", "helhet/\(fil)").flatMap { String(data: $0, encoding: .utf8) } ?? "<!doctype html><title>\(fil) saknas</title>"
    }

    /// Värden för en farlig sida ur skyddets testdata (`Regler/prov.json`).
    private static func farligVard() -> String {
        let url = Bundle.main.bundleURL.appendingPathComponent("Regler/prov.json")
        if let d = try? Data(contentsOf: url), let j = try? JSONVarde(json: d), let v = j["stoppsida"]["farlig"].text { return v }
        return "zykqk.com"
    }

    private static func vanta(_ sekunder: Double, _ villkor: @MainActor () -> Bool) async -> Bool {
        let t0 = Date()
        while !villkor() {
            if Date().timeIntervalSince(t0) > sekunder { return false }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return true
    }

    /// Väntar tills en AdRaze-sida (`startsida`, `anpassa` …) syns helt, och ger dess webbvy.
    private static func vantaPaSida(_ yta: String, _ k: Labbkorning, max: Double) async -> WKWebView? {
        var vy: WKWebView?
        _ = await vanta(max) { vy = synligSida(yta); return vy != nil }
        return vy
    }

    /// En synlig webbvy med `adraze-app://localhost/<yta>…` i appens fönster (också i ark och helskärm).
    static func synligSida(_ yta: String) -> WKWebView? {
        guard let f = Labbkorning.fonster() else { return nil }
        func leta(_ v: UIView) -> WKWebView? {
            if v.isHidden || v.alpha < 0.05 { return nil }
            if let w = v as? WKWebView {
                if w.url?.scheme == "adraze-app", w.url?.lastPathComponent.hasPrefix(yta) == true, synlig(w) { return w }
                return nil
            }
            for s in v.subviews.reversed() { if let w = leta(s) { return w } }
            return nil
        }
        return leta(f)
    }

    private static func synlig(_ v: UIView) -> Bool {
        var x: UIView? = v
        while let y = x {
            if y.isHidden || y.alpha < 0.95 || y.layer.opacity < 0.95 { return false }
            x = y.superview
        }
        return v.window != nil && v.bounds.width > 10
    }

    private static func vantaPaText(_ vy: WKWebView, max: Double, _ villkor: (String) -> Bool) async -> String {
        let t0 = Date()
        var t = ""
        while Date().timeIntervalSince(t0) < max {
            t = (await Labbjs.kor(vy, "document.body ? document.body.innerText : ''") as? String) ?? ""
            if villkor(t) { break }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        return t
    }
}

/// JavaScript i en webbvy från självtesten.
///
/// Ägare: Grund.
@MainActor
enum Labbjs {
    static func kor(_ vy: WKWebView, _ js: String) async -> Any? {
        await withCheckedContinuation { c in
            vy.evaluateJavaScript(js) { v, _ in c.resume(returning: v) }
        }
    }

    static func json(_ s: String) -> String {
        (try? String(data: JSONSerialization.data(withJSONObject: [s]), encoding: .utf8)).map { String($0.dropFirst().dropLast()) } ?? "\"\""
    }
}
