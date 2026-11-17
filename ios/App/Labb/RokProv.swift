import Foundation
import SwiftUI
import UIKit
import WebKit

/// `-mode rok`: röktestet för grunden. Kör allt som de andra modulerna bygger på och laddar en riktig sida
/// (`https://example.com/`, eller `-url <adress>`) i den aktiva fliken. Tar skärmbilderna `start` (tom flik)
/// och `sida` (den laddade sidan) inne i appen.
///
/// Ägare: Grund.
@MainActor
enum RokProv {
    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        k.notera("minne_mb_start", .tal(Labbkorning.minneMB()))
        moduler(k, app)
        typsnitt(k)
        installningar(k)
        tema(k)
        palett(k)
        try await brygga(k)
        nyckelring(k)
        try await sida(k, app)
        k.notera("minne_mb_slut", .tal(Labbkorning.minneMB()))
    }

    // MARK: - Moduler

    static func moduler(_ k: Labbkorning, _ app: AppMiljo) {
        let namn = app.moduler.map(\.namn)
        k.kolla("modulerna hittas av appen själv", namn.contains("Labb"), .lista(namn.map(JSONVarde.text)))
        k.lika("rok registrerades av Labb", app.labb.prov["rok"]?.modul, "Labb")
        k.notera("leverantorer", .objekt(app.leverantorer.mapValues(JSONVarde.text)))
        k.notera("applikationsnamn_i_anvandaragenten", .text(Anvandaragent.applikationsnamn))
    }

    // MARK: - Typsnitt

    static func typsnitt(_ k: Labbkorning) {
        let reg = Typsnitt.registrerade
        k.kolla("Fraunces registrerat", reg[Typsnitt.frauncesFamilj] != nil, .objekt(reg.mapValues(JSONVarde.text)))
        k.kolla("Familjen Grotesk registrerat", reg[Typsnitt.familjenFamilj] != nil)
        k.kolla("typsnitten utan fel", Typsnitt.fel.isEmpty, .objekt(Typsnitt.fel.mapValues(JSONVarde.text)))

        let prov = "AdRaze gorillan"
        func bredd(_ f: UIFont) -> Double { Double((prov as NSString).size(withAttributes: [.font: f]).width).rounded() }
        let tunn = bredd(Typsnitt.fraunces(40, vikt: 100)), fet = bredd(Typsnitt.fraunces(40, vikt: 900))
        k.kolla("Fraunces: vikten går att välja", fet > tunn * 1.02, ["wght100": .tal(tunn), "wght900": .tal(fet)])
        let liten = bredd(Typsnitt.fraunces(40, vikt: 400, opsz: 9)), stor = bredd(Typsnitt.fraunces(40, vikt: 400, opsz: 144))
        k.kolla("Fraunces: optisk storlek går att välja", abs(liten - stor) >= 2, ["opsz9": .tal(liten), "opsz144": .tal(stor)])
        let g4 = bredd(Typsnitt.familjen(40, vikt: 400)), g7 = bredd(Typsnitt.familjen(40, vikt: 700))
        k.kolla("Familjen Grotesk: vikten går att välja", g7 > g4 * 1.01, ["wght400": .tal(g4), "wght700": .tal(g7)])

        // SwiftUI: behåller Font(UIFont) vikten? Mät bläcket i en bild ritad med ImageRenderer.
        let blackTunn = blackAndel(Text(prov).font(Font(Typsnitt.fraunces(40, vikt: 100))))
        let blackFet = blackAndel(Text(prov).font(Font(Typsnitt.fraunces(40, vikt: 900))))
        k.kolla("Fraunces: vikten följer med till SwiftUI", blackFet > blackTunn * 1.4,
                ["wght100": .tal((blackTunn * 1000).rounded() / 1000), "wght900": .tal((blackFet * 1000).rounded() / 1000)])

        // Vilka systemfamiljer finns för tema.typsnitt (del 1, 4.5: overifierat om Verdana och Charter finns på iOS)
        var familjer: [String: JSONVarde] = [:]
        for f in ["Helvetica Neue", "Verdana", "Tahoma", "Charter", "Iowan Old Style", "Georgia"] {
            familjer[f] = .bool(!UIFont.fontNames(forFamilyName: f).isEmpty)
        }
        k.notera("systemtypsnitt", .objekt(familjer))
        var val: [String: JSONVarde] = [:]
        for v in [Typsnittsval.klassisk, .tydlig, .serif] { val[v.rawValue] = Tema.installerat(v).map(JSONVarde.text) ?? .null }
        k.notera("tema_typsnitt", .objekt(val))
    }

    /// Andelen mörka pixlar när vyn ritas svart på vitt.
    static func blackAndel<V: View>(_ vy: V) -> Double {
        let r = ImageRenderer(content: vy.foregroundStyle(.black).padding(4).background(Color.white))
        r.scale = 2
        guard let cg = r.cgImage else { return -1 }
        return Bildmatt.morkAndel(cg)
    }

    // MARK: - Inställningar

    static func installningar(_ k: Labbkorning) {
        let fil = FileManager.default.temporaryDirectory.appendingPathComponent("labb-installningar-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: fil) }
        let h = Handelser()
        var andrade: [String] = []
        let prenumeration = h.lyssna(InstallningAndrad.self) { andrade.append($0.nyckel) }
        defer { prenumeration.avsluta() }

        let a = Installningar(fil: fil, handelser: h)
        a.registrera(Nycklar.typade)
        for d in Installningsdef.franDatorn { a.registrera(d) }
        k.lika("standardvärde tema.accent", a[.temaAccent], "#ff4b1f")
        k.lika("standardvärde verktyg.placering på iPhone", a[.verktygPlacering], .nere)
        k.lika("standardvärde block.social", a[.blockSocial], ["facebook": true, "x": true, "linkedin": true])
        k.lika("standardvärde sok.standard saknas", a.hamta("sok.standard"), nil)

        a[.temaAccent] = "#3b6fe0"
        a[.temaLage] = .morkt
        k.lika("typad skrivning och läsning", a[.temaLage], .morkt)
        k.lika("händelser för ändringarna", andrade, ["tema.accent", "tema.lage"])
        k.lika("ändringarna i historiken", a.historik.count, 2)
        a[.webbHttpsOnly] = true
        k.lika("webb.* hamnar inte i historiken", a.historik.count, 2)

        let angrat = a.angra()
        k.kolla("ångra", angrat.ok && angrat.nyckel == "tema.lage" && a[.temaLage] == .ljust && a.sparat("tema.lage") == nil, angrat.json)

        a.arBarnlage = { true }
        k.lika("barnlåst nyckel går inte att ändra i barnläge", a.satt("falk.av", true), .barnlast)
        k.lika("vanlig nyckel går att ändra i barnläge", a.satt("tema.horn", "rund"), .ok)
        a.arBarnlage = { false }

        k.lika("mönstret sajt.* täcker sajt.example.com", a.def(for: "sajt.example.com")?.nyckel, "sajt.*")
        a.satt("sajt.example.com", ["zoom": 1.25])
        k.lika("samlat(\"webb.\") som datorns webbGet", a.samlat("webb.")["httpsOnly"], .bool(true))

        a.satt("sok.standard", "f-yt")
        k.lika("delningskoden är som datorns", a.exportera("tema.accent"), "ADRZ1.eyJ0ZW1hLmFjY2VudCI6IiMzYjZmZTAifQ")
        let allt = a.exportera()
        let avkodat = Installningar.franBase64url(String(allt.dropFirst(6))).flatMap { try? JSONVarde(json: $0) } ?? .null
        k.kolla("delningskoden saknar nycklar som inte är delbara",
                avkodat["sok.standard"].arNull && avkodat["webb.httpsOnly"].arNull && avkodat["tema.accent"] == "#3b6fe0", avkodat)

        let b = Installningar(fil: nil)
        b.registrera(Nycklar.typade)
        for d in Installningsdef.franDatorn { b.registrera(d) }
        // Skapad med Node: Buffer.from(JSON.stringify({...})).toString('base64url'), som datorns exportera()
        let datornsKod = "ADRZ1.eyJ0ZW1hLmFjY2VudCI6IiMyZjllNjciLCJ0ZW1hLmhvcm4iOiJydW5kIiwidGVtYS5kZW5zaXRldCI6Imx1ZnRpZyIsImF2YW5jZXJhdC5za3JpcHQiOlsieCJdLCJzb2suc3RhbmRhcmQiOiJmLXl0In0"
        let importerat = b.importera(datornsKod)
        k.kolla("datorns delningskod går att läsa",
                importerat == .ok(antal: 3) && b[.temaHorn] == .rund && b[.temaDensitet] == .luftig && b[.temaAccent] == "#2f9e67"
                    && b.sparat("avancerat.skript") == nil && b.sparat("sok.standard") == nil, importerat.json)
        k.lika("trasig delningskod avvisas", b.importera("ADRZ1.!!"), .fel("kod"))

        a.sparaNu()
        let c = Installningar(fil: fil)
        c.registrera(Nycklar.typade)
        k.kolla("sparat på disk och läst igen",
                c[.temaAccent] == "#3b6fe0" && c.historik.count == a.historik.count && c.sparat("sajt.example.com") == ["zoom": 1.25],
                ["varden": .objekt(c.varden), "historik": .tal(Double(c.historik.count))])

        k.kolla("appens butik har datorns nycklar", k.app.installningar.registret.count >= 80,
                .tal(Double(k.app.installningar.registret.count)))
    }

    // MARK: - Tema

    static func tema(_ k: Labbkorning) {
        let a = Installningar(fil: nil)
        a.registrera(Nycklar.typade)
        let t = Tema(installningar: a)
        k.lika("accent ljust med AdRazes orange", t.varde(.accent, morkt: false).hex, "#ff4b1f")
        k.lika("accenttext ljust (datorns grundvärde)", t.varde(.accentText, morkt: false).hex, "#c2360e")
        k.lika("accenttext mörkt (datorns grundvärde)", t.varde(.accentText, morkt: true).hex, "#ff7a52")
        a[.temaAccent] = "#e8a317"
        k.lika("Bärnsten mörkas i ljust läge", t.varde(.accent, morkt: false).hex, "#bc8200")
        k.lika("svart text på Bärnsten i mörkt läge", t.varde(.paAccent, morkt: true).hex, "#111113")
        a[.temaPalett] = .jul
        k.lika("julfärgerna i mörkt läge", t.varde(.bakgrund, morkt: true).hex, "#0e251a")
        k.lika("julfärgerna gäller inte i ljust läge", t.varde(.bakgrund, morkt: false).hex, "#f6f5f1")
        a[.temaLage] = .system
        k.kolla("system följer iOS", t.foredragetSchema == nil)
        a[.temaHorn] = .rund
        k.lika("runda hörn ger kapselformade fält", t.radier.falt, 999)
        a[.temaDensitet] = .luftig
        k.lika("luftig densitet", t.matt.adressfalt, 52)
        k.notera("appens_tema", k.app.tema.somJSON)
    }

    // MARK: - Palett

    static func palett(_ k: Labbkorning) {
        guard let d = Bunt.data("Labb", "palett-facit.json"), let facit = (try? JSONVarde(json: d))?.objekt else {
            k.kolla("palett-facit.json finns i bunten", false)
            return
        }
        k.kolla("palett-facit.json finns i bunten", true, .tal(Double(facit.count)))
        var fel: [String: JSONVarde] = [:]
        for (hex, datorn) in facit {
            let swift = Palett.palett(hex).json
            if swift != datorn { fel[hex] = ["swift": swift, "datorn": datorn] }
        }
        k.kolla("palettmotorn ger samma färger som datorns JS (\(facit.count) accenter)", fel.isEmpty, .objekt(fel))
    }

    // MARK: - Bryggan

    static func brygga(_ k: Labbkorning) async throws {
        let r = BryggRegister()
        r.hantera("labb:eko") { a in .lista(a.argument) }
        r.hantera("labb:bara-chatt", ytor: ["chatt"]) { _ in true }
        r.hantera("labb:kastar") { _ in throw BryggFel.ogiltigt("prov") }
        r.startdata("labb") { kalla in ["yta": .text(kalla.yta)] }
        var skickat: [String] = []
        r.sandare = { kanal, _, _ in skickat.append(kanal) }
        let kalla = BryggKalla(yta: "labb")

        let svar = try await r.anropa("labb:eko", ["hej", 3], fran: kalla)
        k.lika("bryggan svarar", svar, ["hej", 3])
        let okand = await felet { try await r.anropa("labb:saknas", [], fran: kalla) }
        k.lika("okänd kanal ger fel", okand, .okandKanal("labb:saknas"))
        let nekad = await felet { try await r.anropa("labb:bara-chatt", [], fran: kalla) }
        k.lika("kanal bara för chatten nekas andra sidor", nekad, .nekad("labb:bara-chatt från labb"))
        let kastat = await felet { try await r.anropa("labb:kastar", [], fran: kalla) }
        k.lika("fel i hanteraren går tillbaka", kastat, .ogiltigt("prov"))
        k.lika("startdata", r.byggStartdata(for: kalla), ["labb": ["yta": "labb"]])
        r.skicka("labb:handelse", "x")
        k.lika("händelse går till transporten", skickat, ["labb:handelse"])
        k.notera("appens_bryggkanaler", .objekt(k.app.brygga.kanaler.mapValues(JSONVarde.text)))
    }

    private static func felet(_ f: () async throws -> JSONVarde) async -> BryggFel? {
        do {
            _ = try await f()
            return nil
        } catch let e as BryggFel {
            return e
        } catch {
            return .misslyckades(String(describing: error))
        }
    }

    // MARK: - Keychain

    static func nyckelring(_ k: Labbkorning) {
        let namn = "labb.prov"
        do {
            try Nyckelring.spara(Data("prov \(Date().timeIntervalSince1970)".utf8), konto: namn)
            let last = try Nyckelring.hamta(konto: namn)
            try Nyckelring.radera(konto: namn)
            let efter = try Nyckelring.hamta(konto: namn)
            k.kolla("Keychain: spara, läsa och radera", last != nil && efter == nil)
        } catch {
            k.kolla("Keychain: spara, läsa och radera", false, .text(String(describing: error)))
        }
        if let konto = k.app.konto as? EnkeltKonto {
            k.notera("konto", ["inloggad": .bool(konto.arInloggad), "keychainfel": konto.keychainfel.map(JSONVarde.text) ?? .null])
        }
    }

    // MARK: - En riktig sida

    static func sida(_ k: Labbkorning, _ app: AppMiljo) async throws {
        let adress = app.startargument.text("url") ?? "https://example.com/"
        guard let url = URL(string: adress) else {
            k.kolla("adressen går att läsa", false, .text(adress))
            return
        }
        let flik = app.flikar.aktiv ?? app.flikar.nyFlik(nil)
        await k.skarmbild("start")

        var laddad = false
        let prenumeration = app.handelser.lyssna(SidaLaddad.self) { h in if h.flik == flik.id { laddad = true } }
        flik.ladda(url)
        let klar = await k.vantaPa("sidan laddad (\(url.host() ?? adress))", max: 60) { laddad || flik.fel != nil }
        prenumeration.avsluta()
        k.kolla("inget fel från sidan", flik.fel == nil, flik.fel.map { JSONVarde.text("\($0.doman) \($0.kod): \($0.text)") } ?? .null)
        k.notera("sida", ["url": .text(flik.url?.absoluteString ?? ""), "titel": .text(flik.titel), "saker": .bool(flik.sakerAnslutning)])
        guard klar, flik.fel == nil else { return }

        k.kolla("sidan har en titel", !flik.titel.isEmpty, .text(flik.titel))
        let ua = (try? await flik.webbvy.callAsyncJavaScript("return navigator.userAgent", arguments: [:], contentWorld: .defaultClient)) as? String ?? ""
        k.kolla("användaragenten slutar som Safaris", ua.hasSuffix(" Safari/604.1") && ua.contains(" Version/") && ua.contains("iPhone"), .text(ua))
        if let skydd = app.skydd as? IngetSkydd {
            k.kolla("fliken frågar skyddet (förbered och beslut)", skydd.antalForberedda > 0 && skydd.antalBeslut > 0,
                    ["forberedda": .tal(Double(skydd.antalForberedda)), "beslut": .tal(Double(skydd.antalBeslut))])
        }

        try await k.vanta(1.5)
        if let bild = await k.skarmbild("sida"), let cg = bild.cgImage {
            let rekt = flik.webbvy.convert(flik.webbvy.bounds, to: nil)
            let andel = Bildmatt.skiljerAndel(cg, rekt: rekt, skala: bild.scale)
            k.kolla("appens egen skärmbild visar webbsidans innehåll", andel > 0.003,
                    ["andel": .tal((andel * 10000).rounded() / 10000), "rekt": .text("\(rekt)")])
        }
    }
}
