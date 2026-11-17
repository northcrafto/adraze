import Foundation
import UIKit
import WebKit

/// Självtestet `-mode flikar`: tre flikar mot en lokal provserver, byten, bakåt och framåt, privat flik som inte
/// delar kakor, nedladdning, historik och förslag, nya fönster, dialoger, inloggning, behörighet, felsidor,
/// zoom per sajt, skrivbordsläge, sök på sidan, snabbmenyns val, favikoner, sovande flikar (minnet mäts) och
/// återställning efter en simulerad omstart.
///
/// Testet använder Flikars egen provlagring (en tillfällig mapp, se `Fliklagring.forSjalvtest`). Inställningar
/// som testet ändrar (zoom och behörighet för provserverns ursprung) tas bort efteråt.
@MainActor
enum FlikarProv {
    struct Varden {
        let k: Labbkorning
        let motor: Flikmotor
        let server: Flikprovserver
        var f1: Webbflik!
        var f2: Webbflik!
        var f3: Webbflik!
    }

    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        guard let motor = app.flikar as? Flikmotor else {
            k.kolla("Flikar levererar app.flikar", false, .text(String(describing: type(of: app.flikar))))
            return
        }
        k.lika("leverantör för flikar", app.leverantorer["flikar"] ?? "", "Flikar")
        let server = Flikprovserver()
        try await server.starta()
        defer { server.stoppa() }
        k.notera("provserver", .text(server.bas))
        await rensaKakor(WKWebsiteDataStore.default())
        k.notera("minne_mb_start", .tal(Labbkorning.minneMB()))

        var v = Varden(k: k, motor: motor, server: server)
        defer { stada(v) }
        try await treFlikar(&v)
        await bakatOchFramat(v)
        historikOchForslag(v)
        await privatFlik(v)
        await nedladdning(v)
        await nyaFonster(v)
        await dialoger(v)
        await inloggning(v)
        await behorighet(v)
        await stoppOchOmladdning(v)
        await felsidor(v)
        await zoom(v)
        await skrivbordslage(v)
        await hittaPaSidan(v)
        await snabbmeny(v)
        await favikonOchMiniatyr(v)
        await somnOchMinne(v)
        await stangOchAngra(v)
        await omstart(v)
        await visa(motor, v.f2)
        await k.skarmbild("klart")
    }

    // MARK: - Tre flikar och byten

    static func treFlikar(_ v: inout Varden) async throws {
        let (k, motor, s) = (v.k, v.motor, v.server)
        guard let forsta = motor.aktivFlik else { throw Provfel("ingen flik från start") }
        k.kolla("en tom flik från start", motor.alla.count == 1 && forsta.url == nil && !forsta.privat,
                ["antal": .tal(Double(motor.alla.count))])
        let laddade = Samlare()
        let pren = motor.app.handelser.lyssna(SidaLaddad.self) { h in
            if h.flik == forsta.id { laddade.lagg("\(h.url.path) \(h.titel)") }
        }
        forsta.ladda(s.url("/sida/1"))
        v.f1 = forsta
        await laddad(k, "flik 1 laddar provsida 1", v.f1, "/sida/1")
        let f1 = v.f1!
        await k.vantaPa("flik 1:s titel", max: 5) { f1.titel == "Provsida 1" }
        // WebKit kan ge titeln efter didFinish; händelsen väntar på den.
        await k.vantaPa("SidaLaddad för provsida 1", max: 2) { !laddade.alla.isEmpty }
        k.lika("SidaLaddad har titeln", laddade.alla, ["/sida/1 Provsida 1"])
        pren.avsluta()
        k.lika("framsteg 1 när sidan är klar", v.f1.framsteg, 1)
        k.kolla("http-sidan räknas inte som säker", !v.f1.sakerAnslutning)

        v.f2 = motor.nyFlik(s.url("/sida/2"), privat: false, aktivera: true) as? Webbflik
        await laddad(k, "flik 2 laddar provsida 2", v.f2, "/sida/2")
        v.f3 = motor.nyFlik(s.url("/sida/3"), privat: false, aktivera: true) as? Webbflik
        await laddad(k, "flik 3 laddar provsida 3", v.f3, "/sida/3")
        k.lika("tre flikar", motor.alla.count, 3)
        k.lika("i ordning", motor.alla.map(\.titel), ["Provsida 1", "Provsida 2", "Provsida 3"])
        k.lika("flik 3 är aktiv", motor.aktiv?.id, v.f3.id)
        k.kolla("var sin webbvy", Set([v.f1, v.f2, v.f3].compactMap { f in f.vy.map { ObjectIdentifier($0) } }).count == 3)
        let ua = await text(v.f3, "navigator.userAgent")
        k.kolla("Safaris användaragent", ua.contains("iPhone") && ua.contains("Mobile/15E148") && ua.contains("Safari/604.1"), .text(ua))
        k.notera("ua_mobil", .text(ua))
        await vantaIFonstret(v.f3)
        await k.skarmbild("tre-flikar")

        await visa(motor, v.f1)
        k.lika("aktiv efter byte", motor.aktiv?.id, v.f1.id)
        k.kolla("flik 1 visas i fönstret", v.f1.vy?.window != nil)
        await k.vantaPa("flik 3 lämnar fönstret", max: 3) { v.f3.vy?.window == nil }
        k.kolla("flik 1 har kvar sin sida", v.f1.url?.path == "/sida/1" && v.f1.titel == "Provsida 1")
        await k.skarmbild("byte-till-flik-1")
    }

    static func bakatOchFramat(_ v: Varden) async {
        let (k, f) = (v.k, v.f1!)
        await js(f, "document.getElementById('nasta').click(); return true;")
        await laddad(k, "länken öppnar provsida 2 i samma flik", f, "/sida/2")
        k.kolla("kan gå bakåt", f.kanGaBakat)
        f.bakat()
        await laddad(k, "bakåt till provsida 1", f, "/sida/1")
        k.kolla("kan gå framåt", f.kanGaFramat)
        f.framat()
        await laddad(k, "framåt till provsida 2", f, "/sida/2")
        // Adressbyte inom sidan (pushState) syns i fliken och historiken.
        await js(f, "history.pushState({}, '', '/sida/2?steg=2'); return true;")
        await k.vantaPa("pushState byter adressen", max: 5) { f.url?.query == "steg=2" }
        k.kolla("pushState hamnar i historiken", f.motor?.historik.rader.contains { $0.url.hasSuffix("/sida/2?steg=2") } == true)
        f.bakat()
        await k.vantaPa("bakåt inom sidan", max: 5) { f.url?.path == "/sida/2" && f.url?.query == nil }
        f.bakat()
        await laddad(k, "bakåt till provsida 1 igen", f, "/sida/1")
    }

    static func historikOchForslag(_ v: Varden) {
        let (k, motor) = (v.k, v.motor)
        let h = motor.historik.rader
        let vagar = Set(h.compactMap { URL(string: $0.url)?.path })
        k.kolla("historiken har provsidorna", ["/sida/1", "/sida/2", "/sida/3"].allSatisfy(vagar.contains), ["antal": .tal(Double(h.count))])
        let r1 = h.first { $0.url == v.server.url("/sida/1").absoluteString }
        k.lika("titel i historiken", r1?.title ?? "", "Provsida 1")
        k.kolla("besöken räknas", (r1?.n ?? 0) >= 2, ["n": .tal(Double(r1?.n ?? 0))])
        k.lika("senaste först", URL(string: h.first?.url ?? "")?.path ?? "", "/sida/1")
        let traff = motor.historik.sok("provsida 3")
        k.kolla("sök i historiken (ordbörjan)", traff.first.map { $0.url.hasSuffix("/sida/3") } ?? false,
                .lista(traff.map { .text($0.url) }))
        k.kolla("ingen träff mitt i ord", motor.historik.sok("rovsida").isEmpty)
        let lokala = motor.forslag.lokala("provsida", privat: false)
        k.kolla("förslag ur historiken", lokala.contains { $0.slag == .sida }, .lista(lokala.map(\.json)))
        k.kolla("förslaget börjar med en sökning", lokala.first?.slag == .sok)
        k.lika("komplettering av värden", motor.forslag.komplettering("127.0", privat: false)?.vard ?? "", "127.0.0.1")
        k.kolla("ingen komplettering i privat flik", motor.forslag.komplettering("127.0", privat: true) == nil)
        k.lika("toppsajt", motor.forslag.toppsajter(privat: false).first?.vard ?? "", "127.0.0.1")
        k.lika("bara sökningen i privat flik", motor.forslag.lokala("provsida", privat: true).count, 1)
        let u = v.server.url("/sida/1").absoluteString
        k.kolla("bokmärke läggs till", motor.bokmarken.lagg(u, titel: "Provsida 1", favikon: nil) && motor.bokmarken.finns(u))
        k.kolla("bokmärket hittas", motor.bokmarken.sok("provsida").first?.url == u)
        k.kolla("bokmärket tas bort med gravsten", motor.bokmarken.taBort(u) && !motor.bokmarken.finns(u) && motor.bokmarken.gravstenar[u] != nil)
        _ = motor.bokmarken.lagg(u, titel: "Provsida 1", favikon: nil)
    }

    // MARK: - Privat flik

    static func privatFlik(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        await visa(motor, v.f2)
        v.f2.ladda(s.url("/kaka/satt?v=vanlig"))
        await laddad(k, "vanlig flik sätter en kaka", v.f2, "/kaka/satt")
        let p = motor.nyFlik(s.url("/kaka/visa"), privat: true, aktivera: true) as! Webbflik
        await laddad(k, "privat flik laddar", p, "/kaka/visa")
        k.kolla("privat flik fick ingen vanlig kaka", !(s.senaste("/kaka/visa")?.kaka ?? "").contains("provkaka"),
                .text(s.senaste("/kaka/visa")?.kaka ?? "(ingen)"))
        k.kolla("privat flik har ett eget lager som inte sparas", p.vy?.configuration.websiteDataStore.isPersistent == false)
        k.kolla("vanlig flik har standardlagret", v.f2.vy?.configuration.websiteDataStore.isPersistent == true)
        p.ladda(s.url("/kaka/satt?v=privat"))
        await laddad(k, "privat flik sätter en kaka", p, "/kaka/satt")
        p.ladda(s.url("/kaka/visa"))
        await k.vantaPa("privat flik ser sin egen kaka", max: 10) {
            !p.laddar && p.url?.path == "/kaka/visa" && (s.senaste("/kaka/visa")?.kaka ?? "").contains("provkaka=privat")
        }
        await vantaIFonstret(p)
        await k.skarmbild("privat")
        let p2 = motor.nyFlik(s.url("/sida/4"), privat: true, aktivera: false) as! Webbflik
        k.kolla("privata flikar delar lager", p2.vy?.configuration.websiteDataStore === p.vy?.configuration.websiteDataStore)
        await laddad(k, "andra privata fliken laddar", p2, "/sida/4")
        k.kolla("privata sidor hamnar inte i historiken",
                !motor.historik.rader.contains { $0.url.contains("/kaka/visa") || $0.url.contains("v=privat") || $0.url.hasSuffix("/sida/4") })
        await visa(motor, v.f2)
        v.f2.ladda(s.url("/kaka/visa"))
        await laddad(k, "vanlig flik laddar kakorna", v.f2, "/kaka/visa")
        let kaka = s.senaste("/kaka/visa")?.kaka ?? ""
        k.kolla("vanlig flik ser bara sin kaka", kaka.contains("provkaka=vanlig") && !kaka.contains("privat"), .text(kaka))
        motor.stang(p.id)
        motor.stang(p2.id)
        k.lika("privata flikar stängda", motor.alla.filter(\.privat).count, 0)
        let ny = motor.nyFlik(s.url("/kaka/visa"), privat: true, aktivera: true) as! Webbflik
        await laddad(k, "ny privat flik efter att alla stängts", ny, "/kaka/visa")
        k.kolla("ny privat session börjar utan kakor", !(s.senaste("/kaka/visa")?.kaka ?? "").contains("provkaka"),
                .text(s.senaste("/kaka/visa")?.kaka ?? "(ingen)"))
        motor.stang(ny.id)
        await visa(motor, v.f2)
    }

    // MARK: - Nedladdning

    static func nedladdning(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        let handelser = Samlare()
        let pren = motor.app.handelser.lyssna(FlikNedladdningKlar.self) { h in handelser.lagg(h.fil.lastPathComponent) }
        defer { pren.avsluta() }
        let fore = v.f2.url
        v.f2.ladda(s.url("/fil/prov.txt"))
        await k.vantaPa("nedladdningen blir klar", max: 15) { motor.nedladdare.poster.first?.state == "completed" }
        let p = motor.nedladdare.poster.first
        k.lika("filnamnet från Content-Disposition", p?.filename ?? "", "prov-flikar.txt")
        let innehall = p.flatMap { try? String(contentsOfFile: $0.path, encoding: .utf8) }
        k.lika("filens innehåll", innehall ?? "", Flikprovserver.filinnehall)
        k.kolla("filen i nedladdningsmappen", p?.path.hasPrefix(motor.lagring.nedladdningar.path) ?? false, .text(p?.path ?? ""))
        k.lika("fliken står kvar på sidan", v.f2.url, fore)
        k.kolla("ingen felsida efter nedladdningen", !v.f2.visarFelsida && v.f2.fel == nil)
        k.lika("händelsen FlikNedladdningKlar", handelser.alla, ["prov-flikar.txt"])
        v.f2.ladda(s.url("/fil/prov.txt"))
        await k.vantaPa("andra nedladdningen blir klar", max: 15) {
            motor.nedladdare.poster.count >= 2 && motor.nedladdare.poster.first?.state == "completed"
        }
        k.lika("unikt namn för samma fil", motor.nedladdare.poster.first?.filename ?? "", "prov-flikar (2).txt")
        motor.nedladdare.sparaNu()
        motor.lagring.vantaPaSkrivningar()
        let sparade = motor.lagring.las([FlikNedladdning].self, fran: motor.lagring.nedladdningsfil) ?? []
        k.lika("listan sparas", sparade.count, 2)
        k.notera("nedladdningar", .lista(motor.nedladdare.poster.map(\.json)))
    }

    // MARK: - Nya fönster

    static func nyaFonster(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        let f2 = v.f2!
        await visa(motor, f2)
        f2.ladda(s.url("/popup"))
        await laddad(k, "popupsidan laddar", f2, "/popup")
        let fore = motor.alla.count
        await js(f2, "document.getElementById('ny').click(); return true;")
        await k.vantaPa("target=_blank öppnar en ny flik", max: 10) { motor.alla.count == fore + 1 }
        guard let ny = motor.alla.first(where: { $0.oppnadAv == f2.id }) else { return }
        await laddad(k, "nya fliken laddar provsida 4", ny, "/sida/4")
        k.lika("nya fliken direkt efter öppnaren", motor.alla.firstIndex { $0 === ny }, (motor.alla.firstIndex { $0 === f2 } ?? -9) + 1)
        k.lika("nya fliken är aktiv", motor.aktivtId, ny.id)
        k.kolla("nya fliken har en egen innehållskontroller",
                ny.vy?.configuration.userContentController !== f2.vy?.configuration.userContentController)
        k.kolla("Flikars skript finns i nya fliken",
                ny.vy?.configuration.userContentController.userScripts.contains { $0.source.contains("__adrazeFlikar") } == true)
        k.kolla("samma datalager som öppnaren", ny.vy?.configuration.websiteDataStore === f2.vy?.configuration.websiteDataStore)
        await visa(motor, f2)
        await js(f2, "window.open('/sida/5'); return true;")
        await k.vantaPa("window.open öppnar en ny flik", max: 10) { motor.alla.filter { $0.oppnadAv == f2.id }.count == 2 }
        guard let ny2 = motor.alla.first(where: { $0.oppnadAv == f2.id && $0 !== ny }) else { return }
        await laddad(k, "window.open laddar provsida 5", ny2, "/sida/5")
        k.lika("flikar från samma sida hamnar i ordning", motor.alla.firstIndex { $0 === ny2 }, (motor.alla.firstIndex { $0 === ny } ?? -9) + 1)
        await vantaIFonstret(ny2)
        let opener = await js(ny2, "return window.opener !== null;") as? Bool
        k.kolla("window.opener finns", opener == true, .text(String(describing: opener)))
        await js(ny2, "window.close(); return true;")
        await k.vantaPa("window.close stänger fliken", max: 5) { motor.flik(med: ny2.id) == nil }
        k.lika("öppnaren blir aktiv igen", motor.aktivtId, f2.id)
        motor.stang(ny.id)
        await visa(motor, f2)
    }

    // MARK: - Dialoger, inloggning och behörighet

    static func dialoger(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        let f = v.f2!
        let d = motor.dialoger
        f.ladda(s.url("/dialog"))
        await laddad(k, "dialogsidan laddar", f, "/dialog")
        await js(f, "setTimeout(function () { alert('Hej från provsidan'); document.title = 'alert klar'; }, 50); return true;")
        await k.vantaPa("alert visas", max: 5) { d.aktuell != nil }
        k.lika("alert-texten", d.aktuell?.slag, .meddelande("Hej från provsidan"))
        await k.skarmbild("dialog-alert")
        d.svara(Dialogsvar(ok: true))
        await k.vantaPa("sidan fortsätter efter alert", max: 5) { f.titel == "alert klar" }
        await js(f, "setTimeout(function () { document.title = 'confirm ' + confirm('Vill du fortsätta?'); }, 50); return true;")
        await k.vantaPa("confirm visas", max: 5) { d.aktuell != nil }
        d.svara(Dialogsvar(ok: true))
        await k.vantaPa("confirm ger true", max: 5) { f.titel == "confirm true" }
        await js(f, "setTimeout(function () { document.title = 'prompt ' + prompt('Vad heter du?', 'Kim'); }, 50); return true;")
        await k.vantaPa("prompt visas", max: 5) { d.aktuell != nil }
        k.lika("prompt med standardtext", d.aktuell?.slag, .textfraga("Vad heter du?", standard: "Kim"))
        k.kolla("tredje rutan kan stoppa fler", d.aktuell?.visaStoppa == true)
        try? await Task.sleep(nanoseconds: 500_000_000)
        await k.skarmbild("dialog-prompt")
        d.svara(Dialogsvar(ok: true, text: "Alva"))
        await k.vantaPa("prompt ger texten", max: 5) { f.titel == "prompt Alva" }

        // En ruta från en flik i bakgrunden väntar tills fliken blir aktiv. Sidan ber om rutan strax efter att
        // vi bytt flik (en webbvy utanför fönstret kör sina tidtagare långsammare, därför den långa väntan).
        let visadeFore = d.antalVisade
        await js(f, "setTimeout(function () { document.title = 'bakgrund ' + confirm('Från bakgrunden'); }, 300); return true;")
        await visa(motor, v.f3)
        await k.vantaPa("rutan från bakgrunden köas", max: 8) { d.harFraga(for: f.id) }
        k.kolla("rutan från bakgrunden visas inte över en annan flik", d.aktuell == nil && d.antalVisade == visadeFore,
                ["ko": .tal(Double(d.ko.count))])
        await visa(motor, f)
        await k.vantaPa("rutan visas när fliken blir aktiv", max: 5) { d.aktuell?.flik == f.id }
        d.svara(Dialogsvar(ok: false))
        await k.vantaPa("svaret kommer fram", max: 5) { f.titel == "bakgrund false" }
    }

    static func inloggning(_ v: Varden) async {
        let (k, s, d) = (v.k, v.server, v.motor.dialoger)
        let f = v.f2!
        f.ladda(s.url("/inloggning"))
        await k.vantaPa("inloggningsrutan visas", max: 10) {
            if case .inloggning = d.aktuell?.slag { return true } else { return false }
        }
        k.lika("rutan visar riket", d.aktuell?.slag, .inloggning(rike: "Flikprov", saker: false, igen: false))
        await k.skarmbild("inloggning")
        d.svara(Dialogsvar(ok: true, anvandare: Flikprovserver.anvandare, losenord: "fel"))
        await k.vantaPa("fel lösenord ger en ny ruta", max: 10) {
            d.aktuell?.slag == .inloggning(rike: "Flikprov", saker: false, igen: true)
        }
        d.svara(Dialogsvar(ok: true, anvandare: Flikprovserver.anvandare, losenord: Flikprovserver.losenord))
        await k.vantaPa("inloggad", max: 10) { f.titel == "Inloggad" && !f.laddar }
        k.kolla("rätt uppgifter kom fram", s.senaste("/inloggning")?.inloggning?.hasPrefix("Basic ") == true)
    }

    static func behorighet(_ v: Varden) async {
        let (k, motor, s, d) = (v.k, v.motor, v.server, v.motor.dialoger)
        let f = v.f2!
        f.ladda(s.url("/media"))
        await laddad(k, "mikrofonsidan laddar", f, "/media")
        let fraga = "try { navigator.mediaDevices.getUserMedia({ audio: true })"
            + ".then(function (m) { m.getTracks().forEach(function (t) { t.stop(); }); document.title = 'mic ok'; })"
            + ".catch(function (e) { document.title = 'mic ' + e.name; }); } catch (e) { document.title = 'mic ' + e.name; } return true;"
        await js(f, fraga)
        let t0 = Date()
        while d.aktuell == nil && !f.titel.hasPrefix("mic") && Date().timeIntervalSince(t0) < 8 {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        guard d.aktuell?.slag == .behorighet(["microphone"]) else {
            // Simulatorn kan sakna mikrofon: då svarar WebKit innan delegaten frågas.
            k.notera("behorighet_mikrofon", .text("ingen fråga från WebKit, sidan fick: \(f.titel)"))
            return
        }
        k.kolla("mikrofonfrågan visas", true)
        await k.skarmbild("behorighet")
        d.svara(Dialogsvar(ok: false, komIhag: true))
        await k.vantaPa("nej ger NotAllowedError", max: 5) { f.titel == "mic NotAllowedError" }
        let ursprung = s.bas
        k.lika("svaret sparas i webb.perms", motor.app.installningar[.webbPerms][ursprung]["microphone"].text ?? "", "block")
        await js(f, "document.title = 'igen'; " + fraga)
        try? await Task.sleep(nanoseconds: 800_000_000)
        k.kolla("sparat nej frågar inte igen", d.aktuell == nil && f.titel == "mic NotAllowedError", .text(f.titel))
    }

    // MARK: - Stopp, omladdning och felsidor

    static func stoppOchOmladdning(_ v: Varden) async {
        let (k, s) = (v.k, v.server)
        let f = v.f2!
        f.ladda(s.url("/sida/3"))
        await laddad(k, "provsida 3 i flik 2", f, "/sida/3")
        let n = s.antal("/sida/3")
        f.laddaOm()
        await k.vantaPa("laddaOm hämtar sidan igen", max: 10) { s.antal("/sida/3") == n + 1 && !f.laddar }
        // Stopp direkt, innan WebKit har frågat om navigeringen.
        let l0 = s.antal("/langsam")
        f.ladda(s.url("/langsam"))
        k.kolla("långsam sida laddar", f.laddar)
        f.stoppa()
        await k.vantaPa("stopp före beslutet avbryter", max: 5) { !f.laddar }
        try? await Task.sleep(nanoseconds: 300_000_000)
        k.kolla("stopp före beslutet ger ingen felsida", !f.laddar && !f.visarFelsida && f.fel == nil && f.url?.path == "/sida/3",
                .text(f.url?.absoluteString ?? ""))
        k.notera("langsam_forfragningar_efter_tidigt_stopp", .tal(Double(s.antal("/langsam") - l0)))
        // Stopp medan servern tänker på svaret.
        let l1 = s.antal("/langsam")
        f.ladda(s.url("/langsam"))
        await k.vantaPa("servern får den långsamma förfrågan", max: 5) { s.antal("/langsam") > l1 }
        k.kolla("laddar medan servern tänker", f.laddar)
        f.stoppa()
        await k.vantaPa("stopp under laddningen avbryter", max: 5) { !f.laddar }
        try? await Task.sleep(nanoseconds: 300_000_000)
        k.kolla("stopp under laddningen ger ingen felsida", !f.laddar && !f.visarFelsida && f.fel == nil && f.url?.path == "/sida/3",
                .text(f.url?.absoluteString ?? ""))
        // Fliken går att använda efter stoppen.
        f.ladda(s.url("/sida/4"))
        await laddad(k, "provsida 4 efter stoppen", f, "/sida/4")
        f.bakat()
        await laddad(k, "tillbaka till provsida 3", f, "/sida/3")
    }

    static func felsidor(_ v: Varden) async {
        let (k, motor) = (v.k, v.motor)
        let f = v.f2!
        await visa(motor, f)
        let historikFore = motor.historik.rader.count
        guard let port = try? await Flikprovserver.ledigPort() else {
            k.kolla("ledig port för felsidan", false)
            return
        }
        let stangd = URL(string: "http://127.0.0.1:\(port)/")!
        f.ladda(stangd)
        await k.vantaPa("felsida när servern inte svarar", max: 15) { f.visarFelsida && !f.laddar }
        k.lika("felkoden", f.fel?.kod ?? 0, NSURLErrorCannotConnectToHost)
        k.lika("felets text är felsidans svenska", f.fel?.text ?? "", "Det gick inte att ansluta till 127.0.0.1.")
        k.lika("adressen står kvar", f.url, stangd)
        k.kolla("kan gå tillbaka från felsidan", f.kanGaBakat)
        let rubrik = await text(f, "document.querySelector('h1').textContent")
        k.lika("felsidans rubrik", rubrik, "Sidan kan inte nås")
        k.lika("knapparna", await text(f, "Array.from(document.querySelectorAll('.knappar a')).map(function (a) { return a.textContent; }).join('|')"),
               "Försök igen|Tillbaka")
        try? await Task.sleep(nanoseconds: 400_000_000)
        let typsnitt = await text(f, "Array.from(document.fonts).map(function (x) { return x.family.replace(/\"/g, '') + ':' + x.status; }).join(',')")
        k.kolla("typsnitten laddade", typsnitt.contains("AdRaze Display:loaded") && typsnitt.contains("Familjen Grotesk:loaded"), .text(typsnitt))
        k.kolla("figuren finns", await text(f, "!!document.querySelector('svg.figur')") == "true")
        await vantaIFonstret(f)
        let matt = await text(f, """
            (function () { var r = document.querySelector('.knappar').getBoundingClientRect(),
              g = document.querySelector('svg.figur').getBoundingClientRect();
              return Math.round(r.bottom) + '/' + window.innerHeight + ' figur ' + Math.round(g.width) + 'x' + Math.round(g.height); })()
            """)
        k.notera("felsida_knappar_nederkant", .text(matt))
        let delar = matt.split(separator: " ")[0].split(separator: "/").compactMap { Double($0) }
        k.kolla("felsidans knappar syns utan att rulla", delar.count == 2 && delar[0] > 0 && delar[0] <= delar[1], .text(matt))
        await k.skarmbild("felsida")
        await sparaSnapshot(f, k, "felsida-webbvy")
        k.lika("felsidan hamnar inte i historiken", motor.historik.rader.count, historikFore)

        await js(f, "window.__provMarkor = 1; document.getElementById('igen').click(); return true;")
        var omladdad = false
        let t0 = Date()
        while !omladdad && Date().timeIntervalSince(t0) < 15 {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if f.visarFelsida && !f.laddar { omladdad = await text(f, "typeof window.__provMarkor") == "undefined" }
        }
        k.kolla("Försök igen laddar felsidan på nytt", omladdad && f.fel?.kod == NSURLErrorCannotConnectToHost && f.url == stangd)

        let okand = URL(string: "http://finnsinte.invalid/")!
        f.ladda(okand)
        await k.vantaPa("felsida för okänd värd", max: 20) { f.visarFelsida && !f.laddar && f.url == okand }
        k.lika("felkoden för okänd värd", f.fel?.kod ?? 0, NSURLErrorCannotFindHost)
        k.lika("rubriken för okänd värd", await text(f, "document.querySelector('.t').textContent"),
               "Det gick inte att hitta servern för finnsinte.invalid.")

        // Mörkt läge (temat följer tema.lage).
        let inst = motor.app.installningar
        let forraLaget = inst.sparat(Nycklar.temaLage.namn)
        inst.satt(Nycklar.temaLage.namn, .text(Temalage.morkt.rawValue), utanHistorik: true)
        var mork = false
        for _ in 0..<20 where !mork {
            mork = await text(f, "matchMedia('(prefers-color-scheme: dark)').matches") == "true"
            if !mork { try? await Task.sleep(nanoseconds: 100_000_000) }
        }
        k.kolla("sidan ser mörkt läge", mork)
        try? await Task.sleep(nanoseconds: 400_000_000)
        await k.skarmbild("felsida-mork")
        inst.satt(Nycklar.temaLage.namn, forraLaget, utanHistorik: true)

        await js(f, "document.getElementById('bakat').click(); return true;")
        await k.vantaPa("Tillbaka lämnar felsidan", max: 10) { !f.visarFelsida && !f.laddar && f.url?.host() == "127.0.0.1" && f.url?.port == Int(v.server.port) }
        k.kolla("felet nollställs och sidan bakom felsidorna visas", f.fel == nil && f.url?.path == "/sida/3", .text(f.url?.absoluteString ?? ""))
    }

    // MARK: - Zoom, skrivbordsläge, sök

    static func zoom(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        let f = v.f3!
        await visa(motor, f)
        let bredd = Double(await text(f, "window.innerWidth")) ?? 0
        f.sattZoom(1.25)
        k.lika("zoom 1,25", f.zoom, 1.25)
        k.lika("webbvyns pageZoom", Double(f.vy?.pageZoom ?? 0), 1.25)
        try? await Task.sleep(nanoseconds: 300_000_000)
        let bredd2 = Double(await text(f, "window.innerWidth")) ?? 0
        k.kolla("sidan blir smalare i CSS-pixlar", bredd2 > 0 && bredd2 < bredd - 1, ["fore": .tal(bredd), "efter": .tal(bredd2)])
        k.lika("sparas per sajt som på datorn", motor.app.installningar.hamta("sajt.127.0.0.1")?["zoom"].tal ?? 0, 1.25)
        let f4 = motor.nyFlik(s.url("/sida/4"), privat: false, aktivera: true) as! Webbflik
        await laddad(k, "ny flik på samma sajt", f4, "/sida/4")
        k.lika("ny flik får sajtens zoom", Double(f4.vy?.pageZoom ?? 0), 1.25)
        let p = motor.nyFlik(s.url("/sida/5"), privat: true, aktivera: true) as! Webbflik
        await laddad(k, "privat flik på samma sajt", p, "/sida/5")
        k.lika("privat flik läser sajtens zoom", p.zoom, 1.25)
        p.sattZoom(1.5)
        k.lika("privat zoom sparas inte", motor.app.installningar.hamta("sajt.127.0.0.1")?["zoom"].tal ?? 0, 1.25)
        motor.stang(p.id)
        motor.stang(f4.id)
        await visa(motor, f)
        f.zooma(inat: false)
        k.lika("ett steg ut (datorns zoomsteg)", f.zoom, 1.1)
        f.sattZoom(1)
        k.kolla("zoom 1 tar bort sajtens nyckel", motor.app.installningar.sparat("sajt.127.0.0.1") == nil)
    }

    static func skrivbordslage(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        let f = v.f3!
        f.ladda(s.url("/sida/1"))
        await laddad(k, "provsida 1 i flik 3", f, "/sida/1")
        let n = s.antal("/sida/1")
        f.sattSkrivbordslage(true)
        await k.vantaPa("skrivbordsläget laddar om", max: 10) { s.antal("/sida/1") > n && !f.laddar }
        let ua = await text(f, "navigator.userAgent")
        let serverUa = s.senaste("/sida/1")?.agent ?? ""
        k.kolla("datorns användaragent", ua.contains("Macintosh") && !ua.contains("Mobile") && serverUa.contains("Macintosh"), .text(ua))
        k.notera("ua_skrivbord", .text(ua))
        let bredd = Double(await text(f, "window.innerWidth")) ?? 0
        k.notera("skrivbord_innerWidth", .tal(bredd))
        f.sattSkrivbordslage(false)
        await k.vantaPa("tillbaka till mobilversionen", max: 10) { s.antal("/sida/1") > n + 1 && !f.laddar }
        k.kolla("mobilens användaragent igen", (s.senaste("/sida/1")?.agent ?? "").contains("iPhone"))
        _ = motor
    }

    static func hittaPaSidan(_ v: Varden) async {
        let (k, s) = (v.k, v.server)
        let f = v.f3!
        f.ladda(s.url("/sok"))
        await laddad(k, "söksidan laddar", f, "/sok")
        let n = await f.hitta("gorilla")
        k.lika("hitta på sidan (utan hänsyn till versaler)", n, 3)
        k.lika("inget för text som saknas", await f.hitta("schimpans"), 0)
    }

    // MARK: - Snabbmenyn, favikon och miniatyr

    static func snabbmeny(_ v: Varden) async {
        let (k, motor, s) = (v.k, v.motor, v.server)
        let f = v.f3!
        f.ladda(s.url("/sida/2"))
        await laddad(k, "sidan med bilder laddar", f, "/sida/2")
        let mitt = await js(f, "var b = document.getElementById('bild2'); b.scrollIntoView({ block: 'center' }); "
                            + "var r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];") as? [Double]
        guard let mitt, mitt.count == 2, let vy = f.vy else {
            k.kolla("bildens läge", false)
            return
        }
        let el = await Flikmeny.element(i: vy, vid: CGPoint(x: mitt[0], y: mitt[1]))
        k.kolla("bild och länk under fingret", el.bild?.path == "/bild.png" && el.lank?.path == "/sida/3",
                ["bild": .text(el.bild?.absoluteString ?? ""), "lank": .text(el.lank?.absoluteString ?? ""), "alt": .text(el.alt ?? "")])
        let meny = Flikmeny.meny(for: f, motor: motor, lank: el.lank, bild: el.bild)
        let titlar = (meny?.children ?? []).flatMap { ($0 as? UIMenu)?.children.map(\.title) ?? [$0.title] }
        k.lika("menyns val", titlar, ["Öppna i ny flik", "Öppna i privat flik", "Kopiera länk", "Dela länk …", "Ladda ned länkad fil",
                                      "Öppna bild i ny flik", "Spara i Bilder", "Kopiera bild", "Dela bild …"])
        let kopierad = await Flikmeny.kopieraBild(el.bild ?? s.url("/bild.png"), fran: f, motor: motor)
        k.kolla("bilden kopieras", kopierad && UIPasteboard.general.hasImages)
        let fore = motor.alla.count
        let ny = Flikmeny.oppna(el.lank ?? s.url("/sida/3"), fran: f, motor: motor, privat: false)
        k.kolla("länk i ny flik i bakgrunden", motor.alla.count == fore + 1 && motor.aktivtId == f.id && ny.oppnadAv == f.id)
        await laddad(k, "länken laddar i bakgrunden", ny, "/sida/3")
        motor.stang(ny.id)
        let bara = await Flikmeny.element(i: vy, vid: CGPoint(x: 5, y: 5))
        k.kolla("ingen länk eller bild i marginalen", bara.lank == nil && bara.bild == nil)
    }

    static func favikonOchMiniatyr(_ v: Varden) async {
        let (k, motor) = (v.k, v.motor)
        let f = v.f3!
        await k.vantaPa("favikonen hämtas", max: 10) { f.favikon != nil }
        k.kolla("favikonen är sidans ikon", f.favikonAdress?.hasSuffix("/ikon.png") == true, .text(f.favikonAdress ?? ""))
        k.kolla("favikonen sparas för historiken", motor.historik.rader.first { $0.url.hasSuffix("/sida/2") }?.favicon?.hasSuffix("/ikon.png") == true)
        k.kolla("flik 1 har en miniatyr", v.f1.miniatyr != nil)
        await k.vantaPa("aktiva flikens miniatyr", max: 5) { f.miniatyr != nil }
        k.notera("miniatyr_bredd", .tal(Double(f.miniatyr?.size.width ?? 0)))
    }

    // MARK: - Sovande flikar

    static func somnOchMinne(_ v: Varden) async {
        let (k, motor) = (v.k, v.motor)
        await visa(motor, v.f2)
        // Fler flikar, så att minnet syns.
        var extra: [Webbflik] = []
        for n in [4, 5, 1, 3] {
            let f = motor.skapaFlik(url: v.server.url("/sida/\(n)"), privat: false, aktivera: false, oppnadAv: nil, placering: .sist)
            extra.append(f)
        }
        for (n, f) in zip([4, 5, 1, 3], extra) { await laddad(k, "extra flik med provsida \(n) laddar", f, "/sida/\(n)") }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        let vakna = motor.antalVakna
        let fore = Labbkorning.minneMB()
        let somnade = await motor.sovAllaIBakgrunden()
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        let efter = Labbkorning.minneMB()
        k.kolla("flikarna i bakgrunden somnar", somnade == vakna - 1 && motor.antalVakna == 1,
                ["vakna_fore": .tal(Double(vakna)), "somnade": .tal(Double(somnade)), "vakna_efter": .tal(Double(motor.antalVakna))])
        k.kolla("sovande flikar har ingen webbvy", motor.alla.filter(\.sover).allSatisfy { $0.vy == nil })
        k.notera("minne_mb_fore_somn", .tal(fore))
        k.notera("minne_mb_efter_somn", .tal(efter))
        k.notera("flikar_vid_matning", .tal(Double(motor.alla.count)))
        k.kolla("flik 1 sparade sitt tillstånd", v.f1.sparatTillstand != nil)

        await visa(motor, v.f1)
        await k.vantaPa("flik 1 vaknar med sin sida", max: 10) {
            !v.f1.sover && v.f1.vy?.url?.path == "/sida/1" && !v.f1.laddar && v.f1.framsteg >= 1
        }
        k.kolla("framåt-listan kom tillbaka", v.f1.kanGaFramat)
        k.lika("titeln efter uppvaknandet", v.f1.titel, "Provsida 1")
        v.f1.framat()
        await laddad(k, "framåt efter uppvaknandet", v.f1, "/sida/2")
        v.f1.bakat()
        await laddad(k, "och bakåt igen", v.f1, "/sida/1")
        for f in extra { motor.stang(f.id) }
        k.notera("minne_mb_efter_stang", .tal(Labbkorning.minneMB()))
    }

    // MARK: - Stäng, ångra och omstart

    static func stangOchAngra(_ v: Varden) async {
        let (k, motor) = (v.k, v.motor)
        let antal = motor.alla.count
        let plats = motor.alla.firstIndex { $0 === v.f1 } ?? 0
        motor.stang(v.f1.id)
        k.lika("en flik färre", motor.alla.count, antal - 1)
        k.kolla("går att ångra", motor.kanAngraStang)
        guard let ater = motor.angraStang() else {
            k.kolla("ångra stäng", false)
            return
        }
        await laddad(k, "stängd flik öppnas igen", ater, "/sida/1")
        k.lika("på sin gamla plats", motor.alla.firstIndex { $0 === ater }, plats)
        k.kolla("med sin bakåt/framåt-lista", ater.kanGaFramat)
        k.lika("och blir aktiv", motor.aktivtId, ater.id)
    }

    static func omstart(_ v: Varden) async {
        let (k, motor) = (v.k, v.motor)
        // En flik med lång historik ska vara aktiv, och en privat flik som inte ska sparas.
        await visa(motor, v.f2)
        let p = motor.nyFlik(v.server.url("/sida/5"), privat: true, aktivera: false) as! Webbflik
        await laddad(k, "privat flik före omstarten", p, "/sida/5")
        motor.sparaNu()
        motor.lagring.vantaPaSkrivningar()
        let vanliga = motor.alla.filter { !$0.privat }
        let forvantat = vanliga.map { [$0.id.uuidString, $0.url?.absoluteString ?? "", $0.titel] }

        let motor2 = Flikmotor(app: motor.app, lagring: motor.lagring)
        motor2.sparaAvstangt = true
        motor2.aterstall()
        motor2.historik.byttKonto(motor.app.konto.konto?.id, barn: motor.app.konto.konto?.barn ?? false)
        let fatt = motor2.alla.map { [$0.id.uuidString, $0.url?.absoluteString ?? "", $0.titel] }
        k.lika("samma flikar efter omstart (id, adress, titel)", fatt, forvantat)
        k.lika("samma aktiva flik", motor2.aktivtId, motor.aktivtId)
        k.kolla("ingen privat flik sparades", !motor2.alla.contains(where: \.privat))
        k.kolla("alla sover efter omstart", motor2.alla.allSatisfy(\.sover))
        k.kolla("bakåtknappen syns innan fliken vaknat", motor2.flik(med: v.f2.id)?.kanGaBakat == true)
        k.lika("historiken finns kvar", motor2.historik.rader.count, motor.historik.rader.count)
        k.lika("bokmärkena finns kvar", motor2.bokmarken.poster.map(\.url), motor.bokmarken.poster.map(\.url))
        k.lika("nedladdningarna finns kvar", motor2.nedladdare.poster.map(\.id), motor.nedladdare.poster.filter { !$0.privat }.map(\.id))
        if let f = motor2.flik(med: v.f2.id) {
            k.kolla("tillståndet lästes från disk", f.sparatTillstand != nil)
            f.vakna()
            await k.vantaPa("återställd flik laddar sin sida", max: 15) {
                !f.laddar && f.url == v.f2.url && f.vy?.url == v.f2.url && f.framsteg >= 1
            }
            k.kolla("återställd flik kan gå bakåt", f.kanGaBakat)
            k.lika("återställd flik har sin titel", f.titel, v.f2.titel)
        }
        motor2.avvecklaAllt()
        motor.stang(p.id)
    }

    // MARK: - Hjälp

    /// Samlar händelser (lyssnarna är `@MainActor`-stängningar som inte får ändra en fångad `var`).
    final class Samlare {
        private(set) var alla: [String] = []
        func lagg(_ s: String) { alla.append(s) }
    }

    struct Provfel: Error, CustomStringConvertible {
        let description: String
        init(_ t: String) { description = t }
    }

    /// Väntar tills fliken visar sidan (`vag`) och har laddat klart.
    @discardableResult
    static func laddad(_ k: Labbkorning, _ namn: String, _ f: Webbflik, _ vag: String, max: Double = 15) async -> Bool {
        await k.vantaPa(namn, max: max) {
            f.url?.path == vag && f.vy?.url?.path == vag && !f.laddar && f.vy?.isLoading == false && !f.visarFelsida
        }
    }

    /// Gör fliken aktiv och väntar tills skalet har satt dess webbvy i fönstret (JavaScript körs inte i en
    /// webbvy utanför fönstret när WebKit har pausat den).
    static func visa(_ motor: Flikmotor, _ f: Webbflik) async {
        motor.aktivera(f.id)
        await vantaIFonstret(f)
    }

    static func vantaIFonstret(_ f: Webbflik) async {
        let t0 = Date()
        while f.vy?.window == nil && Date().timeIntervalSince(t0) < 3 {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    @discardableResult
    static func js(_ f: Webbflik, _ kod: String) async -> Any? {
        guard let v = f.vy else { return nil }
        do {
            return try await v.callAsyncJavaScript(kod, arguments: [:], in: nil, contentWorld: .page)
        } catch {
            Logg("Flikar").varning("provets JavaScript: \(error.localizedDescription)")
            return nil
        }
    }

    static func text(_ f: Webbflik, _ uttryck: String) async -> String {
        (await js(f, "return String(\(uttryck));") as? String) ?? ""
    }

    static func rensaKakor(_ lager: WKWebsiteDataStore) async {
        let typer = Set([WKWebsiteDataTypeCookies, WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache])
        let poster = await lager.dataRecords(ofTypes: typer)
        let lokala = poster.filter { $0.displayName.contains("127.0.0.1") || $0.displayName == "localhost" }
        if !lokala.isEmpty { await lager.removeData(ofTypes: typer, for: lokala) }
    }

    /// Webbvyns egen bild (utan skalet) i testets mapp.
    static func sparaSnapshot(_ f: Webbflik, _ k: Labbkorning, _ namn: String) async {
        guard let v = f.vy, let bild = try? await v.takeSnapshot(configuration: nil), let png = bild.pngData() else { return }
        try? png.write(to: k.mapp.appendingPathComponent("\(namn).png"), options: .atomic)
    }

    /// Tar bort det testet lämnat i inställningarna.
    static func stada(_ v: Varden) {
        let inst = v.motor.app.installningar
        if inst.sparat("sajt.127.0.0.1") != nil { inst.satt("sajt.127.0.0.1", nil, utanHistorik: true) }
        v.motor.behorighet.glom(v.server.bas)
    }
}
