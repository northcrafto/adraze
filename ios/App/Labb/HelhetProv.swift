import Foundation
import UIKit
import WebKit

/// `-mode helhet`: hela appen ihop, som någon som använder den. Bara via `app`, Gemensamt och bryggans kanaler, så
/// att testet berättar vad som saknas om en modul inte är med (då misslyckas de kontrollerna, testet kraschar inte,
/// och bygget går med `-x`).
///
///  1. Alla moduler är med och levererar sina tjänster; skyddet blir klart.
///  2. Startsidan (Brygga) i en ny flik, med ljus statusrad över bilden och utan egen sökruta (skalets
///     adressfält finns nertill). Varken startsidan eller Anpassa säger "datorn" eller Chromium.
///  3. Adressfältet (det skalet gör: `flik.ladda(text:)`) går till en lokal nyhetssida med annonser: skölden
///     räknar det stoppade och annonsplatserna döljs.
///  4. Tre flikar, flikväxlaren och menyn (Skal, öppnade med `SkalVisa`). Statusraden byter ljus/mörk efter
///     sidans färg.
///  5. Chatten från menyn, utloggad. Chattens "Logga in" (`app.konto.visaInloggning`) visar kontots ark ovanpå
///     chatten; efter inloggningen mot chattens testserver stängs arket och man är tillbaka i chatten, som låses upp
///     och visar inkorgen. En konversation öppnas, sedan tillbaka till listan.
///  6. Falk från menyn frågar om nyhetssidan (Falks testserver på 127.0.0.1, `falk:prov`): sidans text följer med
///     och svaret strömmar in.
///  7. Anpassa från menyn; accenten blå och mörkt läge med samma kanal som Anpassa-sidan. Allt följer med: skalet,
///     menyn, chatten, Falk (som tar appens accent) och startsidan, med skärmbilder av samma ytor i mörkt.
///  8. Utloggad i Falk: Falks egen Logga in-knapp visar kontots ark ovanpå Falk; efter inloggningen är Falk tillbaka.
///  9. En farlig sida ger stoppsidan (Skydd), ett sidfel felsidan (Flikar).
/// 10. Inställningarna återställs, kontot loggas ut och en ny flik visar startsidan igen.
///
/// Steg 5, 6 och 8 behöver chattens testserver (som `-mode chatt`), annars hoppas de över och det noteras:
///
///     ~/.cache/claude-arbete/adraze-chatt-server/nollstall.sh
///     ./fran-mint.sh -n helhet helhet ~/adraze-app/skarm -- -api http://100.122.13.91:18790 -testkod 246810
///
/// `-system`-bilderna är simulatorns egna (med statusraden, `Labbkorning.systembild`). Sidorna kommer från en
/// lokal server (`Labbserver`, `Labb/Bunt/helhet/`); bara annonsnätverken ligger på nätet, och dem stoppar skyddet
/// innan något hämtas. Falk frågar aldrig den riktiga AI-tjänsten.
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
        for m in ["Skal", "Flikar", "Skydd", "Brygga", "Konto", "Chatt", "Falk"] { k.kolla("modulen \(m) är med", moduler.contains(m)) }
        for (tjanst, modul) in [("huvudvy", "Skal"), ("flikar", "Flikar"), ("bibliotek", "Flikar"), ("skydd", "Skydd"),
                                ("sidor", "Brygga"), ("plats.anpassa", "Brygga"), ("konto", "Konto"), ("plats.chatt", "Chatt"),
                                ("plats.falk", "Falk")] {
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

        // 5. Chatten från menyn: utloggad, kontots ark ovanpå, inloggad, inkorgen, en konversation och tillbaka
        let labb = BryggKalla(yta: "labb")
        let medServer = app.startargument.text("api") != nil && app.startargument.text("testkod") != nil
        k.notera("med_testserver", .bool(medServer))
        if !medServer { k.notera("hoppat_over", .text("chatten, Falk och inloggningen (steg 5, 6, 8): -api och -testkod saknas")) }
        let samtyckeFore = inst.sparat("webb.falkSamtycke")
        defer {
            inst.satt("webb.falkSamtycke", samtyckeFore, utanHistorik: true)
            Task { @MainActor in
                _ = try? await app.brygga.anropa("falk:prov", [["stoppa": true]], fran: labb)
                if medServer, app.konto.arInloggad { await app.konto.loggaUt() }
            }
        }
        if medServer {
            if app.konto.arInloggad { await app.konto.loggaUt() }
            app.handelser.skicka(SkalVisa(yta: .inget))
            try await k.vanta(0.6)
            app.handelser.skicka(SkalVisa(yta: .plats(Platser.chatt)))
            k.kolla("Chatt öppnas från menyns plats", await vanta(6) { toppnamn() == "ChattKontroller" }, .text(toppnamn()))
            let utloggad = await chattLage(app, max: 6) { $0["fas"].text == "utloggad" }
            k.kolla("chatten visar utloggat läge", utloggad != nil, utloggad ?? .null)
            try await k.vanta(1.0)
            await k.skarmbild("06-chatt-utloggad")

            // Chattens Logga in-knapp gör just detta
            let svar = Svarslada()
            Task { @MainActor in svar.inne = await app.konto.visaInloggning(rubrik: tr("Logga in för att chatta"), underrubrik: nil) }
            k.kolla("Logga in visar kontots ark ovanpå chatten", await vanta(6) { toppnamn() == "KontoKontroller" }, .text(toppnamn()))
            try await k.vanta(1.0)
            await k.skarmbild("07-konto-fran-chatten")
            k.kolla("inloggad mot testservern", await loggaIn(k, epost: Self.noah))
            try await k.vanta(0.5)
            await k.skarmbild("08-konto-inloggad")
            k.kolla("arket stängs och visaInloggning svarar ja", await vanta(8) { svar.inne != nil } && svar.inne == true)
            k.kolla("tillbaka i chatten efter inloggningen", await vanta(4) { toppnamn() == "ChattKontroller" }, .text(toppnamn()))
            let inkorg = await chattLage(app, max: 30) { $0["fas"].text == "klar" && $0["listanLaddad"].bool == true }
            k.kolla("chatten låses upp och visar inkorgen", inkorg != nil, inkorg.map { ["fas": $0["fas"], "rader": .tal(Double($0["rader"].lista?.count ?? 0))] } ?? .null)
            try await k.vanta(1.2)
            await k.skarmbild("09-chatt-inkorg")

            let rader = inkorg?["rader"].lista ?? []
            if let rad = rader.first(where: { $0["namn"].text == "Mira" }) ?? rader.first, let konv = rad["konv"].text {
                let namn = rad["namn"].text ?? "?"
                _ = try await app.brygga.anropa("chatt:visa", [["konv": .text(konv)]], fran: labb)
                let oppen = await chattLage(app, max: 20) { $0["oppen"].text == konv && ($0["meddelanden"].tal ?? 0) > 0 }
                k.kolla("konversationen med \(namn) öppnas och laddas", oppen != nil, ["meddelanden": oppen?["meddelanden"] ?? .null])
                try await k.vanta(1.2)
                await k.skarmbild("10-chatt-konversation")
                _ = try await app.brygga.anropa("chatt:prov", [["tillbaka": true]], fran: labb)
                k.kolla("tillbaka till listan", await chattLage(app, max: 5) { $0["oppen"].arNull } != nil)
                try await k.vanta(0.9)
                await k.skarmbild("11-chatt-tillbaka")
            } else {
                k.kolla("inkorgen har en konversation att öppna", false)
            }
            await stangToppen("ChattKontroller")
            k.kolla("chatten stängdes", toppnamn() != "ChattKontroller", .text(toppnamn()))
        }

        // 6. Falk frågar om nyhetssidan (Falks testserver på 127.0.0.1, med kontots token)
        if medServer {
            let prov = try await app.brygga.anropa("falk:prov", [["starta": true]], fran: labb)
            k.kolla("Falks testserver startar", prov["igang"].bool == true, prov)
            inst.satt("webb.falkSamtycke", .bool(true), utanHistorik: true)
            app.flikar.aktivera(flik.id)
            try await k.vanta(0.6)
            app.handelser.skicka(SkalVisa(yta: .plats(Platser.falk)))
            if let falk = await vantaPaSida("falk", k, max: 15) {
                k.kolla("Falk är redo", await vantaJS(falk, max: 10, "!!(window.__falkIos && window.__falkIos.klar)"))
                _ = await Labbjs.kor(falk, "window.__falkIos.nollstall(); window.__falkIos.fraga('Vad står det på sidan jag har öppen?'); true")
                _ = await vantaJS(falk, max: 8, "!!document.querySelector('.msg.typing .bubble') && document.querySelector('.msg.typing .bubble').textContent.length > 20")
                await k.skarmbild("12-falk-fraga")
                let svarat = await vantaJS(falk, max: 25, """
                    (() => { if (window.__falkIos.upptagen()) return false;
                      const m = [...document.querySelectorAll('.msg.krypto:not(.typing)')].pop();
                      return !!m && m.querySelector('.bubble').textContent.includes('Stadsodlingen'); })()
                    """)
                let efter = try await app.brygga.anropa("falk:prov", [], fran: labb)
                k.kolla("Falk svarar om nyhetssidan, med sidan i frågan", svarat && efter["aktuellFlik"].bool == true, efter)
                try await k.vanta(0.6)
                await k.skarmbild("13-falk-svar")
                await k.systembild("13-falk-svar-system")
                app.sidor.stang(nil)
                _ = await vanta(4) { synligSida("falk") == nil }
            } else {
                k.kolla("Falk öppnas från menyns plats", false)
            }
        }

        // 7. Anpassa från menyn: blå accent och mörkt läge, och allt följer med
        app.handelser.skicka(SkalVisa(yta: .meny))
        try await k.vanta(0.9)
        app.handelser.skicka(SkalVisa(yta: .plats(Platser.anpassa)))
        let anpassa = await vantaPaSida("anpassa", k, max: 15)
        k.kolla("Anpassa öppnades från menyn", anpassa != nil)
        try await k.vanta(1.2)
        if let anpassa {
            let datorord = await Labbjs.kor(anpassa, Self.datorordJS) as? String
            k.lika("Anpassa säger inte datorn eller Chromium på iPhone", datorord ?? "-", "[]")
        }
        await k.skarmbild("14-anpassa")
        await k.systembild("14-anpassa-system")
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
        await k.skarmbild("15-anpassa-natt")
        // Inställningar › Falk visar färgen Falk har (appens accent, Falk har ingen egen), också när sidan laddas om,
        // och AdRaze-orange går att välja fast den är datorns standardfärg (datorns falk-inst.js tar bort den)
        if let anpassa {
            let falkFargJS = """
                (() => { const s = document.getElementById('falk-inst'); if (!s) return 'saknas';
                  const hex = s.querySelector('[data-hex]'), on = s.querySelector('[data-farg].on');
                  return (hex ? hex.value : '-') + ' ' + (on ? on.dataset.farg : 'egen'); })()
                """
            k.lika("Inställningar › Falk visar appens accent", await Labbjs.kor(anpassa, falkFargJS) as? String ?? "-", "#3b6fe0 #3b6fe0")
            _ = await Labbjs.kor(anpassa, "window.__laddasOm = true; setTimeout(() => location.reload(), 50); true")
            try await k.vanta(0.3)
            _ = await vantaJS(anpassa, max: 10, "!window.__laddasOm && !!(document.getElementById('falk-farger') && document.getElementById('falk-farger').dataset.ritad && document.documentElement.classList.contains('ios-redo'))")
            k.lika("Inställningar › Falk visar appens accent när sidan laddas om", await Labbjs.kor(anpassa, falkFargJS) as? String ?? "-", "#3b6fe0 #3b6fe0")
            _ = await Labbjs.kor(anpassa, "document.querySelector('#falk-inst [data-farg=\"#ff4b1f\"]').click(); true")
            let orange = await vanta(3) { inst.sparat("falk.accent")?.text == "#ff4b1f" }
            k.kolla("AdRaze-orange går att välja för Falk", orange, inst.sparat("falk.accent") ?? .null)
            _ = inst.satt("falk.accent", nil, utanHistorik: true)   // Falk följer appen igen i resten av testet
        }
        app.sidor.stang(nil)
        try await k.vanta(1.0)
        k.kolla("Anpassa stängdes", synligSida("anpassa") == nil)
        k.kolla("fönstret är mörkt (allt som visas ovanpå följer)", Labbkorning.fonster()?.traitCollection.userInterfaceStyle == .dark)
        await k.skarmbild("16-skalet-natt")
        app.handelser.skicka(SkalVisa(yta: .meny))
        try await k.vanta(1.0)
        await k.skarmbild("17-meny-natt")
        app.handelser.skicka(SkalVisa(yta: .inget))
        try await k.vanta(0.6)

        if medServer {
            app.handelser.skicka(SkalVisa(yta: .plats(Platser.chatt)))
            if await vanta(6, { toppnamn() == "ChattKontroller" }) {
                k.kolla("chatten är mörk", toppkontroller()?.traitCollection.userInterfaceStyle == .dark)
                _ = await chattLage(app, max: 20) { $0["listanLaddad"].bool == true }
                try await k.vanta(1.0)
                await k.skarmbild("18-chatt-natt")
                let rader = (await chattLage(app, max: 1) { _ in true })?["rader"].lista ?? []
                if let konv = (rader.first(where: { $0["namn"].text == "Mira" }) ?? rader.first)?["konv"].text {
                    _ = try await app.brygga.anropa("chatt:visa", [["konv": .text(konv)]], fran: labb)
                    _ = await chattLage(app, max: 15) { $0["oppen"].text == konv && ($0["meddelanden"].tal ?? 0) > 0 }
                    try await k.vanta(1.2)
                    await k.skarmbild("19-konversation-natt")
                    _ = try await app.brygga.anropa("chatt:prov", [["tillbaka": true]], fran: labb)
                    try await k.vanta(0.6)
                }
                await stangToppen("ChattKontroller")
            } else {
                k.kolla("chatten öppnas i mörkt", false, .text(toppnamn()))
            }

            app.handelser.skicka(SkalVisa(yta: .plats(Platser.falk)))
            if let falk = await vantaPaSida("falk", k, max: 15) {
                let falkLage = await vantaJS(falk, max: 6, """
                    matchMedia('(prefers-color-scheme: dark)').matches
                      && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase() === '#3b6fe0'
                    """)
                let accent = await Labbjs.kor(falk, "getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") as? String
                k.kolla("Falk är mörk och tar appens blå accent", falkLage, .text(accent ?? "-"))
                try await k.vanta(0.6)
                await k.skarmbild("20-falk-natt")
                await k.systembild("20-falk-natt-system")
                app.sidor.stang(nil)
                _ = await vanta(4) { synligSida("falk") == nil }
            } else {
                k.kolla("Falk öppnas i mörkt", false)
            }
        }

        _ = app.flikar.nyFlik(nil)
        if let startNatt = await vantaPaSida("startsida", k, max: 10) {
            let mork = await vantaJS(startNatt, max: 4, "matchMedia('(prefers-color-scheme: dark)').matches")
            k.kolla("startsidan i en ny flik är mörk", mork)
            try await k.vanta(1.2)
            await k.skarmbild("21-startsida-natt")
            await k.systembild("21-startsida-natt-system")
        } else {
            k.kolla("startsidan i en ny flik (mörkt)", false)
        }
        if let ny = app.flikar.aktiv, ny.url == nil, app.flikar.flikar.count > 1 { app.flikar.stang(ny.id) }
        app.flikar.aktivera(flik.id)
        try await k.vanta(0.6)

        // 8. Utloggad i Falk: Falks egen Logga in-knapp visar kontots ark, sedan tillbaka i Falk
        if medServer {
            await app.konto.loggaUt()
            app.handelser.skicka(SkalVisa(yta: .plats(Platser.falk)))
            if let falk = await vantaPaSida("falk", k, max: 15) {
                let las = await vantaJS(falk, max: 8, "document.body.classList.contains('fi-last') && !!document.querySelector('#fi-las .fi-logga-in')")
                k.kolla("utloggad: Falk visar Logga in", las)
                try await k.vanta(0.6)
                await k.skarmbild("22-falk-utloggad-natt")
                _ = await Labbjs.kor(falk, "document.querySelector('#fi-las .fi-logga-in').click(); true")
                k.kolla("Falks Logga in visar kontots ark ovanpå Falk", await vanta(6) { toppnamn() == "KontoKontroller" }, .text(toppnamn()))
                try await k.vanta(1.0)
                await k.skarmbild("23-konto-fran-falk-natt")
                await k.systembild("23-konto-fran-falk-natt-system")
                k.kolla("inloggad igen", await loggaIn(k, epost: Self.noah))
                k.kolla("kontots ark stängs efter inloggningen", await vanta(8) { toppnamn() != "KontoKontroller" }, .text(toppnamn()))
                let igen = await vantaJS(falk, max: 6, "!document.body.classList.contains('fi-last')")
                k.kolla("tillbaka i Falk, inloggad", igen)
                try await k.vanta(0.8)
                await k.skarmbild("24-falk-inloggad-natt")
                app.sidor.stang(nil)
                _ = await vanta(4) { synligSida("falk") == nil }
            } else {
                k.kolla("Falk öppnas utloggad", false)
            }
            try await k.vanta(0.6)
        }

        // 9. Stoppsidan och felsidan i den aktiva fliken
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
        await k.skarmbild("25-stoppsida")
        await k.systembild("25-stoppsida-system")

        aktiv.ladda(URL(string: bas + "/trasig")!)
        let felvisad = await vanta(15) { aktiv.fel != nil && aktiv.visarFelsida }
        k.kolla("sidfelet visar felsidan", felvisad, .text(aktiv.fel.map { "\($0.doman) \($0.kod) \($0.text)" } ?? "inget fel"))
        let feltext = await vantaPaText(aktiv.webbvy, max: 6) { t in t.contains("Försök igen") }
        k.kolla("felsidan har Försök igen", feltext.contains("Försök igen"), .text(String(feltext.prefix(200))))
        try await k.vanta(0.8)   // laddlinjen tonar ut efter laddningen
        await k.skarmbild("26-felsida")

        // 10. Tillbaka till standard och en ny flik
        if medServer {
            _ = try? await app.brygga.anropa("falk:prov", [["stoppa": true]], fran: labb)
            if app.konto.arInloggad { await app.konto.loggaUt() }
        }
        inst[.temaAccent] = fore.accent
        inst[.temaLage] = fore.lage
        inst[.verktygPlacering] = fore.placering
        _ = app.flikar.nyFlik(nil)
        let igen = await vantaPaSida("startsida", k, max: 10)
        k.kolla("startsidan i en ny flik igen", igen != nil)
        try await k.vanta(1.2)
        await k.skarmbild("27-ny-flik")
        await k.systembild("27-ny-flik-system")
        k.notera("minne_mb", .tal(Labbkorning.minneMB()))
        k.notera("flikar", .tal(Double(app.flikar.flikar.count)))
        inst[Nycklar.sprakVal] = fore.sprak
        _ = skyddKlart
    }

    // MARK: - Hjälp

    /// Testkontot med chattdata på chattens testserver (som `-mode chatt`).
    static let noah = "noah@adraze.test"
    static let losen = "Testlosen-2026"

    /// Loggar in som formuläret i kontots ark gör, via kontots kanaler för självtesterna (kod vid ny enhet).
    private static func loggaIn(_ k: Labbkorning, epost: String) async -> Bool {
        let app = k.app, labb = BryggKalla(yta: "labb")
        do {
            let steg = try await app.brygga.anropa("konto:logga-in", [["email": .text(epost), "password": .text(losen)]], fran: labb)
            if steg["steg"].text == "kod" {
                let kod = app.startargument.text("testkod") ?? ""
                _ = try await app.brygga.anropa("konto:kod", [["email": .text(epost), "code": .text(kod)]], fran: labb)
            }
        } catch {
            k.notera("inloggningsfel", .text(String(describing: error)))
            return false
        }
        return await vanta(5) { app.konto.arInloggad }
    }

    /// Chattens läge (`chatt:prov`) när villkoret gäller, högst `max` sekunder.
    private static func chattLage(_ app: AppMiljo, max: Double, _ villkor: (JSONVarde) -> Bool) async -> JSONVarde? {
        let t0 = Date()
        repeat {
            if let l = try? await app.brygga.anropa("chatt:prov", [], fran: BryggKalla(yta: "labb")), villkor(l) { return l }
            try? await Task.sleep(nanoseconds: 250_000_000)
        } while Date().timeIntervalSince(t0) < max
        return nil
    }

    /// Kör uttrycket i sidan tills det blir `true`, högst `max` sekunder.
    private static func vantaJS(_ vy: WKWebView, max: Double, _ js: String) async -> Bool {
        let t0 = Date()
        repeat {
            if (await Labbjs.kor(vy, js) as? Bool) == true { return true }
            try? await Task.sleep(nanoseconds: 150_000_000)
        } while Date().timeIntervalSince(t0) < max
        return false
    }

    /// Den översta kontrollern i appens fönster (det som visas ovanpå allt annat).
    private static func toppkontroller() -> UIViewController? {
        var k = Labbkorning.fonster()?.rootViewController
        while let p = k?.presentedViewController, !p.isBeingDismissed { k = p }
        return k
    }

    /// Klassnamnet på den översta kontrollern (`ChattKontroller`, `KontoKontroller` …), utan att Labb behöver modulerna.
    private static func toppnamn() -> String { toppkontroller().map { String(describing: type(of: $0)) } ?? "inget" }

    /// Stänger den översta kontrollern om den heter `namn`, som dess kryss gör, och väntar tills den är borta.
    private static func stangToppen(_ namn: String) async {
        guard let t = toppkontroller(), String(describing: type(of: t)) == namn else { return }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in t.dismiss(animated: true) { c.resume() } }
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

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

/// Svaret från något som körs vid sidan av testet (till exempel `visaInloggning` medan testet loggar in).
@MainActor
private final class Svarslada {
    var inne: Bool?
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
