import SwiftUI
import UIKit
import WebKit

/// `-mode skal`: självtestet för skalet. Startar en lokal server, laddar provsidorna och går igenom skalet
/// som en användare gör: fäller ihop raderna, drar för att ladda om, byter flik, öppnar flikväxlaren (även
/// privat), menyn, bokmärken och historik, skriver i adressfältet, byter accent och mörkt läge, visar alla
/// tolv accenter, flyttar raden upp, vrider till liggande, byter till tyska och provar stor text.
/// Tar en skärmbild av varje läge och lämnar inställningarna och flikarna som de var.
///
/// Startargument: `-forslag av` stänger av sökmotorns förslag (annars hämtas de som vanligt).
///
/// Ägare: Skal.
@MainActor
enum SkalProv {
    /// Accenterna som temat ska klara: datorns åtta, julens guld och palettmotorns tre svåra (som Labbs facit).
    static let accenter: [(String, String)] = [
        ("#ff4b1f", "AdRaze"), ("#d6336c", "Hallon"), ("#7354d6", "Viol"), ("#3b6fe0", "Blå"),
        ("#0b8a8f", "Hav"), ("#2f9e67", "Skog"), ("#e8a317", "Bärnsten"), ("#5f6b7a", "Grafit"),
        ("#d9a441", "Jul"), ("#123456", "Marin"), ("#ffee00", "Gul"), ("#000000", "Svart"),
    ]

    static func kor(_ k: Labbkorning, skal: SkalLage) async throws {
        let app = k.app
        let inst = app.installningar
        let nycklar = ["tema.accent", "tema.lage", "verktyg.placering"]
        var fore: [String: JSONVarde?] = [:]
        for n in nycklar { fore[n] = inst.sparat(n) }
        let flikarFore = Set(app.flikar.flikar.map(\.id))
        let server = Provserver(sidor: Provsidor.alla)
        skal.forslag.hamtaFjarran = app.startargument.text("forslag") != "av"
        k.notera("minne_mb_start", .tal(Labbkorning.minneMB()))

        do {
            try await steg(k, skal: skal, server: server)
        } catch {
            k.kolla("testet gick igenom utan fel", false, .text(String(describing: error)))
        }

        // Tillbaka som innan: inställningar, språk, flikar, provläget.
        if skal.menyOppen { skal.stangMeny() }
        if skal.vaxlareOppen { skal.stangVaxlare() }
        skal.ark = nil
        skal.provVy = nil
        skal.provTextstorlek = nil
        skal.provBlockerade = nil
        Sprak.delad.byt(till: app.startargument.text("sprak") ?? Sprak.aktivt(inst))
        for n in nycklar { inst.satt(n, fore[n] ?? nil, utanHistorik: true) }
        for f in app.flikar.flikar where !flikarFore.contains(f.id) && f.id != app.flikar.aktivId {
            app.flikar.stang(f.id)
        }
        for n in nycklar {
            k.lika("inställningen \(n) är som innan", (inst.sparat(n) ?? .null).jsonText, ((fore[n] ?? nil) ?? .null).jsonText)
        }
        k.notera("haptik", .objekt(Haptik.antal.mapValues { .tal(Double($0)) }))
        k.notera("minne_mb_slut", .tal(Labbkorning.minneMB()))
        try? await k.vanta(0.6)
        server.stoppa()
        // Slutläget för simulatorns egen skärmbild (med statusraden och tangentbordet, som appens egna
        // skärmbilder inte får med): adressfältet i skrivläge.
        skal.borjaRedigera()
        try? await k.vanta(0.5)
        skal.skriv("fjäll")
    }

    private static func steg(_ k: Labbkorning, skal: SkalLage, server: Provserver) async throws {
        let app = k.app
        let inst = app.installningar

        // MARK: Grunderna (utan skärm)
        grunder(k)

        // MARK: Lokala provsidan
        let port = try await server.starta()
        k.kolla("provservern lyssnar på 127.0.0.1", port > 0, .tal(Double(port)))
        let bas = "http://127.0.0.1:\(port)"
        k.notera("provsida", .text(bas + "/"))
        inst.satt("verktyg.placering", nil, utanHistorik: true)
        inst.satt("tema.lage", .text("ljust"), utanHistorik: true)
        inst.satt("tema.accent", nil, utanHistorik: true)

        let forsta = app.flikar.aktiv ?? app.flikar.nyFlik(nil)
        if forsta.privat { app.flikar.nyFlik(nil, privat: false, aktivera: true) }
        let flik = app.flikar.aktiv ?? forsta
        try await k.vanta(0.5)
        await k.skarmbild("start")
        k.kolla("tom flik visar startsidan", arTomAdress(flik.url))

        flik.ladda(URL(string: bas + "/")!)
        let laddad = await k.vantaPa("provsidan laddad", max: 20) { flik.titel.hasPrefix("Fjällbladet") && !flik.laddar }
        guard laddad else { return }
        try await k.vanta(1.0)
        k.lika("adressfältet visar värden", domanFor(flik.url), "127.0.0.1")
        k.kolla("historiken fick sidan", skal.bibliotek.historik.contains { $0.titel.hasPrefix("Fjällbladet") })
        await k.skarmbild("sida")
        if let m = skal.miniatyrer[flik.id] {
            k.kolla("miniatyren visar sidan (inte en tom bild)", Self.harInnehall(m), .text("\(Int(m.size.width))×\(Int(m.size.height))"))
        } else {
            k.kolla("miniatyren togs efter laddningen", false)
        }

        // MARK: Ihopfällt och dra för att ladda om
        flik.webbvy.scrollView.setContentOffset(CGPoint(x: 0, y: 260), animated: false)
        skal.satt(kompakt: true)
        try await k.vanta(0.9)
        k.kolla("raderna fälldes ihop", skal.kompakt && skal.webbKompakt)
        await k.skarmbild("kompakt")
        skal.expandera()
        flik.webbvy.scrollView.setContentOffset(.zero, animated: false)
        try await k.vanta(0.8)
        k.kolla("raderna fälldes ut igen", !skal.kompakt && !skal.webbKompakt)
        skal.drag = Webbkoordinator.troskel + 6
        try await k.vanta(0.5)
        await k.skarmbild("dra-for-att-ladda")
        skal.drag = 0

        // MARK: Fler flikar, byte med svep
        let kaffe = app.flikar.nyFlik(URL(string: bas + "/kaffe")!, privat: false, aktivera: true)
        _ = await k.vantaPa("andra sidan laddad", max: 15) { kaffe.titel.hasPrefix("Kaffekartan") && !kaffe.laddar }
        try await k.vanta(0.9)
        let lang = app.flikar.nyFlik(URL(string: bas + "/lang")!, privat: false, aktivera: true)
        _ = await k.vantaPa("tredje sidan laddad", max: 15) { lang.titel.hasPrefix("Lång") && !lang.laddar }
        try await k.vanta(0.9)
        let haptikFore = Haptik.totalt
        k.kolla("svep åt höger byter till förra fliken", skal.bytFlik(-1) && app.flikar.aktivId == kaffe.id)
        k.kolla("flikbytet gav haptik", Haptik.totalt > haptikFore)
        try await k.vanta(0.9)
        _ = skal.bytFlik(-1)
        try await k.vanta(0.9)
        k.lika("tillbaka på första fliken", app.flikar.aktivId, flik.id)

        // MARK: Flikväxlaren
        skal.provBlockerade = 14
        skal.oppnaVaxlare()
        try await k.vanta(1.3)
        let vanliga = skal.flikar(privat: false).count
        k.kolla("flikväxlaren är öppen", skal.vaxlareOppen)
        k.kolla("ett kort per flik", skal.kortramar.count >= min(vanliga, 4), .text("\(skal.kortramar.count) kort, \(vanliga) flikar"))
        k.kolla("zoomen till kortet är klar", skal.hjalte == nil)
        await k.skarmbild("flikvaxlare")

        withAnimation { skal.vaxlarePrivat = true }
        try await k.vanta(0.8)
        await k.skarmbild("privat-tom")
        skal.nyFlik(privat: true)
        try await k.vanta(0.6)
        skal.avbrytRedigering()
        try await k.vanta(0.7)
        let privat = app.flikar.aktiv
        k.kolla("en privat flik öppnades", privat?.privat == true)
        await k.skarmbild("privat-start")
        if let privat {
            privat.ladda(URL(string: bas + "/kaffe")!)
            _ = await k.vantaPa("privata sidan laddad", max: 15) { privat.titel.hasPrefix("Kaffekartan") && !privat.laddar }
            try await k.vanta(1.0)
            await k.skarmbild("privat")
            k.kolla("privata sidor hamnar inte i historiken",
                    skal.bibliotek.historik.filter { $0.titel.hasPrefix("Kaffekartan") }.count <= 1)
            skal.stang(privat.id)
            try await k.vanta(0.4)
        }
        app.flikar.aktivera(flik.id)
        try await k.vanta(0.8)

        // MARK: Menyn, bokmärken, historik, skyddet
        skal.oppnaMeny()
        try await k.vanta(1.8)
        k.kolla("menyn är öppen", skal.menyOppen)
        await k.skarmbild("meny")
        skal.vaxlaBokmarke()
        try await k.vanta(0.6)
        k.kolla("sidan blev bokmärkt", skal.bibliotek.arBokmarkt(flik.url))
        await k.skarmbild("meny-bokmarkt")
        skal.stangMeny()
        try await k.vanta(0.4)
        skal.ark = .bokmarken
        try await k.vanta(1.0)
        await k.skarmbild("bokmarken")
        skal.ark = nil
        try await k.vanta(0.7)
        skal.ark = .historik
        try await k.vanta(1.0)
        await k.skarmbild("historik")
        skal.ark = nil
        try await k.vanta(0.7)
        skal.ark = .skydd
        try await k.vanta(1.0)
        await k.skarmbild("skydd")
        skal.ark = nil
        try await k.vanta(0.7)
        skal.ark = .nedladdningar
        try await k.vanta(1.0)
        await k.skarmbild("nedladdningar")
        skal.ark = nil
        try await k.vanta(0.7)

        // Långt tryck på flikknappen: snabbmenyn.
        skal.visaFlikval()
        try await k.vanta(0.6)
        k.kolla("snabbmenyn visas", skal.snabbmeny != nil)
        await k.skarmbild("snabbmeny")
        skal.snabbmeny = nil
        try await k.vanta(0.4)

        // MARK: Skriva i adressfältet
        skal.borjaRedigera()
        try await k.vanta(0.6)
        k.kolla("adressfältet öppnades för att skriva", skal.redigerar)
        skal.skriv("fjäll")
        try await k.vanta(1.6)
        k.kolla("förslag från historiken", skal.forslag.lokala.contains { $0.titel.hasPrefix("Fjällbladet") },
                .text(skal.forslag.lokala.map(\.titel).joined(separator: " | ")))
        k.notera("sokforslag", .text(skal.forslag.fjarran.map(\.titel).joined(separator: " | ")))
        await k.skarmbild("redigera")
        skal.skriv("127")
        try await k.vanta(0.4)
        k.lika("tyst komplettering av värden", skal.forslag.komplettering, ".0.0.1")
        skal.avbrytRedigering()
        try await k.vanta(0.6)

        // MARK: Accent och mörkt läge
        inst.satt("tema.accent", .text("#7354d6"), utanHistorik: true)
        inst.satt("tema.lage", .text("morkt"), utanHistorik: true)
        try await k.vanta(1.0)
        k.lika("accenten är Viol", app.tema.accenthex, "#7354d6")
        await k.skarmbild("morkt-viol")
        skal.oppnaVaxlare()
        try await k.vanta(1.3)
        await k.skarmbild("flikvaxlare-morkt")
        skal.stangVaxlare()
        try await k.vanta(0.8)
        skal.oppnaMeny()
        try await k.vanta(1.8)
        await k.skarmbild("meny-morkt")
        skal.stangMeny()
        try await k.vanta(0.4)

        // Alla tolv accenter, ljust och mörkt
        skal.provVy = AnyView(Accentkarta(accenter: accenter).environment(app).environment(app.tema))
        try await k.vanta(1.0)
        await k.skarmbild("accenter")
        skal.provVy = nil
        inst.satt("tema.accent", nil, utanHistorik: true)
        inst.satt("tema.lage", .text("ljust"), utanHistorik: true)
        try await k.vanta(0.6)

        // MARK: Raden uppe
        inst.satt("verktyg.placering", .text("uppe"), utanHistorik: true)
        try await k.vanta(1.0)
        k.lika("raden ligger uppe", inst[.verktygPlacering], .uppe)
        await k.skarmbild("uppe")
        flik.webbvy.scrollView.setContentOffset(CGPoint(x: 0, y: 220), animated: false)
        skal.satt(kompakt: true)
        try await k.vanta(0.9)
        await k.skarmbild("uppe-kompakt")
        skal.expandera()
        flik.webbvy.scrollView.setContentOffset(.zero, animated: false)
        try await k.vanta(0.6)
        inst.satt("verktyg.placering", nil, utanHistorik: true)
        try await k.vanta(0.6)

        // MARK: Felsidan
        let fel = app.flikar.nyFlik(URL(string: bas + "/trasig")!, privat: false, aktivera: true)
        let felKom = await k.vantaPa("felsidan visas", max: 15) { fel.fel != nil && fel.visarFelsida && !fel.laddar }
        if felKom {
            try await k.vanta(0.9)
            k.lika("adressfältet visar adressen som inte gick att öppna", visadAdress(fel)?.path, "/trasig")
            if let f = fel.fel {
                k.kolla("fliken visar sin egen felsida (skalet lägger ingen ovanpå)", fel.visarFelsida,
                        ["kod": .tal(Double(f.kod)), "text": .text(f.text)])
            }
            await k.skarmbild("fel")
        }
        skal.stang(fel.id)
        app.flikar.aktivera(flik.id)
        try await k.vanta(0.6)

        // MARK: Liggande
        if let scen = Labbkorning.fonster()?.windowScene {
            scen.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { e in
                Logg("Skal").varning("liggande gick inte: \(e.localizedDescription)")
            }
            try await k.vanta(1.8)
            let b = Labbkorning.fonster()?.bounds.size ?? .zero
            k.kolla("fönstret är liggande", b.width > b.height, .text("\(Int(b.width))×\(Int(b.height))"))
            await k.skarmbild("liggande")
            skal.oppnaVaxlare()
            try await k.vanta(1.3)
            await k.skarmbild("liggande-flikvaxlare")
            skal.stangVaxlare()
            try await k.vanta(0.6)
            scen.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { _ in }
            try await k.vanta(1.6)
        }

        // MARK: Tyska (långa ord) och stor text
        Sprak.delad.byt(till: "de")
        k.lika("tyska: Bokmärken", tr("Bokmärken"), "Lesezeichen")
        k.notera("tyska_ord", .tal(Double(Sprak.delad.antalOrd)))
        skal.oppnaMeny()
        try await k.vanta(1.8)
        await k.skarmbild("meny-tyska")
        skal.stangMeny()
        try await k.vanta(0.4)
        skal.oppnaVaxlare()
        try await k.vanta(1.3)
        await k.skarmbild("flikvaxlare-tyska")
        skal.stangVaxlare()
        try await k.vanta(0.6)
        Sprak.delad.byt(till: "sv")

        skal.provTextstorlek = .accessibility2
        try await k.vanta(1.0)
        await k.skarmbild("stor-text")
        skal.oppnaMeny()
        try await k.vanta(1.8)
        await k.skarmbild("stor-text-meny")
        skal.stangMeny()
        skal.provTextstorlek = nil
        skal.provBlockerade = nil
        try await k.vanta(0.8)

        // Stäng provflikarna och lämna provsidan framme.
        for f in [kaffe, lang] { skal.stang(f.id) }
        app.flikar.aktivera(flik.id)
        try await k.vanta(0.8)
        await k.skarmbild("slut")
    }

    /// Det som går att prova utan skärm: ikonerna, vätskan, texterna, figurerna.
    private static func grunder(_ k: Labbkorning) {
        var trasiga: [String] = []
        for i in Ikon.allCases {
            let r = i.vag.boundingRect
            if r.isEmpty || r.minX < -0.5 || r.minY < -0.5 || r.maxX > 24.5 || r.maxY > 24.5 { trasiga.append("\(i.rawValue) \(r)") }
        }
        k.kolla("alla \(Ikon.allCases.count) ikoner ritas inom 24 × 24", trasiga.isEmpty, .text(trasiga.joined(separator: ", ")))
        let bage = SVGVag.tolka("M20 11a8.1 8.1 0 0 0-15.5-2").boundingRect
        k.kolla("SVG-bågar tolkas", bage.width > 14 && bage.height > 3, .text("\(bage)"))
        let v = Vatskeform().path(in: CGRect(x: 0, y: 0, width: 100, height: 40)).boundingRect
        k.kolla("vätskan är 130 % bred och 170 % hög", abs(v.width - 130) < 0.5 && abs(v.height - 68) < 0.5, .text("\(v)"))
        var saknas: [String] = []
        for n in ["SkalGorilla", "SkalGorillaAd", "SkalFalk"] + ["Privat", "Fel", "Bokmarken", "Historik", "Nedladdningar"].flatMap({ ["SkalIllu\($0)", "SkalIllu\($0)Accent"] }) {
            if UIImage(named: n) == nil { saknas.append(n) }
        }
        k.kolla("bilderna finns i appen", saknas.isEmpty, .text(saknas.joined(separator: ", ")))
        k.lika("Webb-adressens del", Adresstext.dela("exempel.se/sida?x=1").0, "exempel.se")
        Sprak.delad.byt(till: "de")
        let de = (tr("Hitta på sidan"), tr("Ny privat flik"))
        Sprak.delad.byt(till: "sv")
        k.kolla("tyska finns för skalets egna texter", de.0 != "Hitta på sidan" && de.1 != "Ny privat flik", .text("\(de.0) · \(de.1)"))
        k.lika("svenska utan ordlista", tr("Bokmärken"), "Bokmärken")
    }

    /// Sant om bilden inte är enfärgad (stickprov).
    private static func harInnehall(_ bild: UIImage) -> Bool {
        guard let cg = bild.cgImage else { return false }
        let b = 24, h = 24
        var pixlar = [UInt8](repeating: 0, count: b * h * 4)
        guard let ctx = CGContext(data: &pixlar, width: b, height: h, bitsPerComponent: 8, bytesPerRow: b * 4,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: b, height: h))
        var olika = Set<UInt32>()
        for i in 0..<(b * h) {
            let p = (UInt32(pixlar[i * 4] >> 3) << 10) | (UInt32(pixlar[i * 4 + 1] >> 3) << 5) | UInt32(pixlar[i * 4 + 2] >> 3)
            olika.insert(p)
        }
        return olika.count > 6
    }
}

/// Självtestets karta över alla tolv accenter: skalets accentdelar i ljust och mörkt läge, sida vid sida.
struct Accentkarta: View {
    let accenter: [(String, String)]

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text("12 accenter")
                    .font(Font(Typsnitt.fraunces(24, vikt: 620, opsz: 24)))
                Spacer(minLength: 0)
            }
            .foregroundStyle(Color.hex("#1c1b19"))
            .padding(.bottom, 2)
            ForEach(accenter.indices, id: \.self) { i in
                Accentrad(hex: accenter[i].0, namn: accenter[i].1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.hex("#d8d6cf").ignoresSafeArea())
    }
}

private struct Accentrad: View {
    let hex: String
    let namn: String
    @State private var tema: Tema

    init(hex: String, namn: String) {
        self.hex = hex
        self.namn = namn
        let inst = Installningar(fil: nil)
        inst.satt("tema.accent", .text(hex), utanHistorik: true)
        _tema = State(initialValue: Tema(installningar: inst))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Circle().fill(Color.hex(hex)).frame(width: 9, height: 9)
                    .overlay(Circle().strokeBorder(Color.black.opacity(0.15), lineWidth: 0.5))
                Text(namn).font(Font(Typsnitt.familjen(11, vikt: 650)))
                Text(hex).font(Font(Typsnitt.familjen(10, vikt: 450)).monospacedDigit()).opacity(0.55)
            }
            .foregroundStyle(Color.hex("#1c1b19"))
            HStack(spacing: 8) {
                Accentprov().environment(\.colorScheme, .light)
                Accentprov().environment(\.colorScheme, .dark)
            }
        }
        .environment(tema)
    }
}

/// Skalets accentdelar i liten skala: räknaren, laddlinjen, hamburgaren, vätskan och en knapp.
private struct Accentprov: View {
    @Environment(Tema.self) private var tema

    var body: some View {
        let f = Skalfarger(tema, privat: false)
        HStack(spacing: 5) {
            HStack(spacing: 2) {
                Image("SkalGorilla").resizable().frame(width: 12, height: 12)
                Text("14").font(Font(Typsnitt.familjen(9.5, vikt: 700))).foregroundStyle(f.accentText)
            }
            .padding(.leading, 2).padding(.trailing, 4)
            .frame(height: 16)
            .background(Capsule().fill(f.accentMjuk))
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: 5).fill(f.falt)
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(f.faltlinje))
                Rectangle().fill(f.accent).frame(width: 16, height: 2)
            }
            .frame(width: 24, height: 16)
            .clipShape(RoundedRectangle(cornerRadius: 5))
            Hamburgare(oppen: false, accent: f.accent, farg: f.text)
                .scaleEffect(0.55)
                .frame(width: 14, height: 11)
            Spacer(minLength: 0)
            ZStack {
                RoundedRectangle(cornerRadius: 5).fill(f.falt)
                Vatskelager(niva: 0.62, fyllning: f.accent).clipShape(RoundedRectangle(cornerRadius: 5))
                Text("Gå").font(Font(Typsnitt.familjen(9, vikt: 700))).foregroundStyle(f.paAccent)
            }
            .frame(width: 26, height: 18)
            Text("Klar")
                .font(Font(Typsnitt.familjen(9, vikt: 700)))
                .foregroundStyle(f.paAccent)
                .frame(width: 30, height: 18)
                .background(RoundedRectangle(cornerRadius: 5).fill(f.accent))
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity)
        .frame(height: 28)
        .background(RoundedRectangle(cornerRadius: 8).fill(f.rad))
    }
}
