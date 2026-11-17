import CryptoKit
import Foundation
import UIKit

/// Självtestet `-mode e2e`: iPhonen (Alva) mot Node-klienter med datorns E2E-modul (`browser/e2e/`) genom en lokal
/// kopia av adraze-api med `/chatt/v2`. Motparten startar servern, testkontona och klienterna och har en liten
/// styryta som testet anropar (aldrig produktion, bara testdata):
///
///     node ~/adraze/browser/e2e/test/motpart.mjs          # server :18791, styrytan :18792 (tailnet-adressen)
///     ./fran-mint.sh -m 720 -n e2e e2e ~/adraze-app/skarm -- -api http://100.122.13.91:18791 -testkod 246810 \
///         -motpart http://100.122.13.91:18792 -maxtid 600
///
/// Alva har vännerna Bosse och Cia (E2E på datorn) och Dan (bara den äldre chatten), och en gammal chatt med Bosse
/// från före E2E. Testet går igenom: identiteten och Keychain, 1:1 åt båda hållen (text och bild), grupp åt båda
/// hållen, den äldre chatten, säkerhetsnummer och QR, manipulerat och uppspelat kuvert, ändrad identitet (verifierad
/// och overifierad), omstart, länkning åt båda håll, kuvert till fel enhet, återställningskoden, och till sist att
/// varken iPhonens filer eller serverns databas, WAL-fil och bilagor innehåller någon klartext.
@MainActor
enum E2EProv {
    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        guard let kontot = app.konto as? Kontot else { k.fel = "Konto levererar inte app.konto"; return }
        guard app.startargument.text("api") != nil, let testkod = app.startargument.text("testkod"),
              let m = E2EMotpart(app.startargument.text("motpart")) else {
            k.fel = "Testet behöver -api <lokal testserver>, -testkod och -motpart <styrytan> (kör aldrig mot produktion)"
            return
        }
        let lageFore = app.installningar.sparat("tema.lage")
        defer { _ = app.installningar.satt("tema.lage", lageFore, utanHistorik: true) }
        _ = app.installningar.satt("tema.lage", .text("ljust"), utanHistorik: true)
        let lage = ChattModul.delatLage(app)
        guard let v2 = lage.lager as? ChattV2 else { k.fel = "chatten går inte genom ChattV2 (E2E-modulen är inte inkopplad)"; return }
        k.notera("karna", .text(E2EKarna.version))

        let info = try await m.get("/info")
        let alva = E2EJSON.objekt(info["alva"]), bo = E2EJSON.objekt(info["bo"]), cia = E2EJSON.objekt(info["cia"])
        guard let alvaId = E2EJSON.text(alva["id"]), let boUuid = bo["uuid"] as? String, let ciaUuid = cia["uuid"] as? String else {
            k.fel = "motparten gav ingen testdata"; return
        }
        // Ren start: inga E2E-filer eller nycklar kvar från en tidigare körning i simulatorn
        E2ELagring(konto: alvaId).radera()
        E2EProvlage.kontroll = nil
        E2EProvlage.lankQr = nil
        var markorer: [String] = []
        var bildbitar: [String] = []

        // Hjälp
        func texter(_ konv: KonvId) -> [String] {
            (v2.e2e?.historik?.poster(konv.nyckel) ?? []).filter { $0.typ == "msg" && !$0.borta }
                .compactMap { (E2EJSON.avkodad($0.d) as? [String: Any])?["text"] as? String }
        }
        func avvisade() -> [String] { (v2.e2e?.avvisade ?? []).map(\.fel) }
        /// Väntar och hämtar E2E-kön under tiden (utan att vänta på chattens egen polling).
        func vantaE2E(_ namn: String, max: Double = 20, _ villkor: () -> Bool) async {
            let t0 = Date()
            while Date().timeIntervalSince(t0) < max {
                await v2.pumpa()
                if villkor() { k.kolla(namn, true, ["s": .tal((Date().timeIntervalSince(t0) * 10).rounded() / 10)]); return }
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
            k.kolla(namn, false, ["vantat_s": .tal(max)])
        }
        func motpartFar(_ vem: String, _ text: String, max: Int = 20) async throws -> [String: Any] {
            markorer.append(text)
            return try await m.post("/vanta", ["vem": vem, "text": text, "max": max])
        }
        func skicka(_ konv: KonvId, _ text: String, bild: ChattUtkast.Bilddata? = nil) async -> Bool {
            markorer.append(text)
            return await lage.skicka(konv, ChattUtkast(text: text, bild: bild, video: nil, svar: nil))
        }
        func oppna(_ konv: KonvId, _ namn: String) async -> Bool {
            lage.begard = konv
            return await k.vantaPa(namn, max: 20) { lage.oppen == konv }
        }
        func visaOversikt(_ steg: String?) async throws {
            E2EProvlage.oversiktSteg = steg
            lage.provSkarm = "inkorg"
            try await k.vanta(0.8)
            lage.provSkarm = "e2e"
            try await k.vanta(1.4)
        }
        func stangArk() async throws {
            lage.provSkarm = nil
            try await k.vanta(1.0)
        }
        func ar<T>(_ v: T?, _ f: (T) -> Bool) -> Bool { v.map(f) ?? false }
        func sha(_ d: Data) -> String { SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined() }

        // MARK: Identiteten
        try await ChattProv.loggaIn(k, kontot, alva["email"] as? String ?? "", testkod)
        ChattVisning.visa(app)
        guard await k.vantaPa("chatten upplåst", max: 25, { lage.fas == .klar }) else { return }
        guard await k.vantaPa("E2E startar: första enheten skapar kontots identitet", max: 30, { v2.lage == .aktiv }) else {
            k.notera("e2e_lage", .text(String(describing: v2.lage)))
            return
        }
        guard let jag = v2.e2e?.jag, let forstaEnhet = v2.e2e?.enhetId else { k.kolla("identitet och enhet", false); return }
        k.notera("alva_uuid", .text(jag))
        k.kolla("återställningskoden väntar på att sparas", v2.kodEjSparad)
        let kod = v2.e2e?.aterstallningskod() ?? ""
        k.lika("återställningskoden har 64 tecken", kod.count, 64)
        markorer.append(kod)
        if let skydd = v2.e2e?.lagring.nyckelskydd() {
            k.kolla("lagringsnyckeln i Keychain har AfterFirstUnlockThisDeviceOnly", skydd.efterForstaUpplasningBaraHar)
            k.kolla("lagringsnyckeln synkas inte med iCloud-nyckelringen", !skydd.synkas)
        } else { k.kolla("lagringsnyckeln finns i Keychain", false) }
        if let fs = v2.e2e?.lagring.filskydd() {
            k.kolla("E2E-filerna är undantagna från säkerhetskopian", fs.undantagenFranBackup)
            #if targetEnvironment(simulator)
            // Simulatorn har inget dataskydd (filerna får ingen skyddsklass): kontrolleras bara på en riktig iPhone
            k.notera("filskydd_simulatorn", .text(fs.skydd))
            #else
            k.lika("tillståndsfilens filskydd", fs.skydd, FileProtectionType.completeUntilFirstUserAuthentication.rawValue)
            #endif
        }

        guard await k.vantaPa("listan med Bosse, Cia och Dan", max: 25, {
            lage.listanLaddad && ["Bosse", "Cia", "Dan"].allSatisfy { n in lage.rader.contains { $0.namn == n } }
        }) else { return }
        func konv(_ namn: String) -> KonvId? { lage.rader.first { $0.namn == namn }?.konv }
        guard let boK = konv("Bosse"), let ciaK = konv("Cia"), let danK = konv("Dan") else { return }
        await k.vantaPa("Bosse och Cia har E2E-enheter", max: 15) { v2.uuid(for: boK.id) == boUuid && v2.uuid(for: ciaK.id) == ciaUuid }
        k.lika("Bosses chatt är E2E", v2.kryptering(boK), .e2e(aldreFore: nil))
        k.lika("Dans chatt har äldre kryptering (Dan har ingen E2E-enhet)", v2.kryptering(danK), .aldre(.kontaktenSaknar("Dan")))
        try await k.vanta(1.0)
        await ChattProv.bada(k, "inkorg")

        // Översikten och återställningskoden
        try await visaOversikt(nil)
        await ChattProv.bada(k, "oversikt")
        try await stangArk()
        E2EProvlage.visaKoden = true
        try await visaOversikt("kod")
        await ChattProv.bada(k, "kod")
        E2EProvlage.visaKoden = false
        v2.kodArSparad()
        try await stangArk()
        k.kolla("koden markerad som sparad", !v2.kodEjSparad)

        // MARK: 1:1 åt båda hållen
        guard await oppna(boK, "Bosses chatt öppnas") else { return }
        await k.vantaPa("den äldre historiken med Bosse syns (från före E2E)", max: 15) {
            (lage.meddelanden[boK] ?? []).contains { $0.text.hasPrefix("Hej Alva! Det här skrevs innan") }
        }
        let t1 = "MARKÖR-ios-1 Hej Bosse, det här är krypterat hela vägen"
        let ok1 = await skicka(boK, t1)
        let s1 = lage.meddelanden[boK]?.last
        k.kolla("iPhonen skickar till Bosse med E2E (kärnans id, inte serverns)",
                ok1 && s1?.text == t1 && ar(s1?.id) { $0.count == 32 && $0.allSatisfy(\.isHexDigit) }, ["id": .text(s1?.id ?? "")])
        let f1 = try await motpartFar("bo", t1)
        k.kolla("Bosses dator (Node, datorns E2E-modul) läser det", f1["hittad"] as? Bool == true && f1["fran"] as? String == jag, ["svar": .text(String(describing: f1))])
        let t2 = "MARKÖR-bo-1 Hej Alva! Från datorn"
        markorer.append(t2)
        _ = try await m.post("/skicka", ["fran": "bo", "text": t2])
        await k.vantaPa("iPhonen läser Bosses svar i chatten", max: 20) { (lage.meddelanden[boK] ?? []).contains { $0.text == t2 } }
        k.lika("Bosses meddelande har hans namn", lage.meddelanden[boK]?.last { $0.text == t2 }?.franNamn, "Bosse")
        k.kolla("raden överst säger nu att äldre meddelanden har den äldre krypteringen",
                ar(v2.kryptering(boK)) { if case .e2e(let fore) = $0 { return fore != nil } else { return false } })
        try await k.vanta(1.2)
        await ChattProv.bada(k, "dm")

        // Bild från Bosse (egen nyckel per fil, nyckeln i det krypterade meddelandet)
        let bb = try await m.post("/skicka", ["fran": "bo", "bild": true, "text": "MARKÖR-bo-bild"])
        markorer.append("MARKÖR-bo-bild")
        await k.vantaPa("iPhonen tar emot Bosses bild", max: 20) {
            (lage.meddelanden[boK] ?? []).contains { if case .bild(_, let t) = $0.innehall { return t == "MARKÖR-bo-bild" } else { return false } }
        }
        if let mb = lage.meddelanden[boK]?.last(where: { if case .bild = $0.innehall { return true } else { return false } }), case .bild(let bi, _) = mb.innehall {
            let data = await lage.bilagedata(bi.bilaga, i: boK)
            k.lika("bilden dekrypteras hel (samma SHA-256 som Bosse skickade)", data.map(sha), bb["sha256"] as? String)
            let ui = await lage.bild(bi.bilaga, i: boK)
            k.kolla("bilden visas", ui != nil, ["w": .tal(Double(ui?.size.width ?? 0))])
        } else { k.kolla("Bosses bild finns i chatten", false) }
        // Bild till Bosse
        if let bild = ChattMedia.bild(ChattProv.provbild()) {
            let ok = await skicka(boK, "MARKÖR-ios-bild", bild: bild)
            let f = try await motpartFar("bo", "MARKÖR-ios-bild")
            let bl = E2EJSON.objekt(f["bilaga"])
            k.kolla("Bosse får iPhonens bild, dekrypterad och hel", ok && bl["sha256"] as? String == sha(bild.data),
                    ["bytes": .tal(Double(bild.data.count)), "svar": .text(String(describing: bl))])
            for o in [300, 3000, bild.data.count / 2] where bild.data.count > o + 48 { bildbitar.append(bild.data.subdata(in: o..<(o + 48)).base64EncodedString()) }
        }

        // MARK: Säkerhetsnummer och QR
        let snBo = try await m.get("/sakerhetsnummer?vem=bo&med=\(jag)")
        let snCia = try await m.get("/sakerhetsnummer?vem=cia&med=\(jag)")
        let snHar = (try? v2.e2e?.sakerhetsnummer(boUuid)) ?? [:]
        k.lika("säkerhetsnumret är detsamma hos Bosse och på iPhonen", snHar["siffror"] as? String, snBo["siffror"] as? String)
        k.lika("säkerhetsnumret har 60 siffror", (snHar["siffror"] as? String)?.count, 60)
        lage.provSkarm = "e2e-nummer"
        try await k.vanta(1.6)
        await ChattProv.bada(k, "sakerhetsnummer")
        // Simulatorn har ingen kamera: vyns skanner får koden direkt (samma väg som kameran)
        E2EProvlage.skannadKod = snCia["qr"] as? String
        NotificationCenter.default.post(name: E2EProvlage.skanna, object: nil)
        try await k.vanta(3.0)
        k.kolla("fel QR-kod (Cias) verifierar inte Bosse", v2.e2e?.kontaktStatus(boUuid)["verifierad"] as? Bool == false)
        await ChattProv.bada(k, "fel-qr")
        E2EProvlage.skannadKod = snBo["qr"] as? String
        NotificationCenter.default.post(name: E2EProvlage.skanna, object: nil)
        await k.vantaPa("Bosses QR-kod skannas och Bosse blir verifierad", max: 10) { v2.e2e?.kontaktStatus(boUuid)["verifierad"] as? Bool == true }
        try await k.vanta(1.2)
        await ChattProv.bada(k, "verifierad")
        try await stangArk()

        // MARK: Grupp åt båda hållen
        guard let boP = lage.person(boK.id), let ciaP = lage.person(ciaK.id) else { return }
        let gnamn = "MARKÖR-gruppnamn Fjällresan"
        markorer.append(gnamn)
        guard let gK = await lage.skapaGrupp(gnamn, [boP, ciaP]) else { k.kolla("grupp skapad", false, ["notis": .text(lage.notis ?? "")]); return }
        k.kolla("gruppen blev en E2E-grupp (alla har E2E)", gK.id.hasPrefix(ChattV2.gruppPrefix), ["id": .text(gK.id)])
        let gid = String(gK.id.dropFirst(ChattV2.gruppPrefix.count))
        for vem in ["cia", "bo"] {
            let inb = try await m.post("/vanta", ["vem": vem, "typ": "grupp.inbjudan", "grupp": gid])
            k.kolla("\(vem == "bo" ? "Bosse" : "Cia") får inbjudan med gruppens namn (krypterat)", inb["hittad"] as? Bool == true && inb["namn"] as? String == gnamn)
        }
        guard await oppna(gK, "gruppchatten öppnas") else { return }
        let tg1 = "MARKÖR-g-ios Hej gruppen, från iPhonen"
        k.kolla("iPhonen skriver i gruppen", await skicka(gK, tg1))
        k.kolla("Cia läser gruppmeddelandet", try await motpartFar("cia", tg1)["hittad"] as? Bool == true)
        k.kolla("Bosse läser gruppmeddelandet", try await motpartFar("bo", tg1)["hittad"] as? Bool == true)
        let tg2 = "MARKÖR-g-cia Hej från Cias dator"
        markorer.append(tg2)
        _ = try await m.post("/grupp/skicka", ["fran": "cia", "grupp": gid, "text": tg2])
        await k.vantaPa("iPhonen läser Cias gruppmeddelande", max: 20) { (lage.meddelanden[gK] ?? []).contains { $0.text == tg2 } }
        k.lika("med Cias namn", lage.meddelanden[gK]?.last { $0.text == tg2 }?.franNamn, "Cia")
        k.lika("gruppens rad är E2E", v2.kryptering(gK), .e2e(aldreFore: nil))
        try await k.vanta(1.0)
        await ChattProv.bada(k, "grupp")
        lage.provSkarm = "e2e-nummer"
        try await k.vanta(1.6)
        await ChattProv.bada(k, "grupp-nummer")
        try await stangArk()

        // MARK: Den äldre chatten (Dan utan E2E)
        guard await oppna(danK, "Dans chatt öppnas") else { return }
        let okd = await lage.skicka(danK, ChattUtkast(text: "Hej Dan, den här chatten har den äldre krypteringen", bild: nil, video: nil, svar: nil))
        k.kolla("till Dan går det som förut (v1, serverns id)", okd && ar(lage.meddelanden[danK]?.last?.id) { $0.allSatisfy(\.isNumber) })
        try await k.vanta(1.0)
        await ChattProv.bada(k, "aldre")

        // MARK: Manipulerat och uppspelat (servern, eller någon med databasen, ändrar kön)
        guard await oppna(boK, "tillbaka i Bosses chatt") else { return }
        var fore = avvisade().count
        let mm = try await m.post("/manipulera", ["fran": "bo", "text": "MARKÖR-manipulerat", "enhet": forstaEnhet])
        markorer.append("MARKÖR-manipulerat")
        k.kolla("servern ändrade kuvertet till iPhonen", mm["ok"] as? Bool == true)
        await vantaE2E("manipulerat kuvert avvisas") { avvisade().count > fore }
        k.lika("orsaken", avvisade().first, "manipulerat")
        k.kolla("det manipulerade meddelandet syns inte", !texter(boK).contains("MARKÖR-manipulerat"))
        let sp = try await m.post("/spara", ["fran": "bo", "text": "MARKÖR-uppspelat", "enhet": forstaEnhet])
        markorer.append("MARKÖR-uppspelat")
        k.kolla("kuvertet sparat för uppspelning", sp["ok"] as? Bool == true)
        await vantaE2E("originalet tas emot") { texter(boK).contains("MARKÖR-uppspelat") }
        fore = avvisade().count
        _ = try await m.post("/uppspela")
        await vantaE2E("uppspelat kuvert avvisas") { avvisade().count > fore }
        k.lika("orsaken", avvisade().first, "uppspelat")
        k.lika("meddelandet finns bara en gång", texter(boK).filter { $0 == "MARKÖR-uppspelat" }.count, 1)

        // MARK: Ändrad identitet
        // Bosse är verifierad: servern visar en annan identitet för honom
        _ = try await m.post("/byt-identitet", ["vem": "bo", "annan": "cia"])
        await v2.kontrolleraKontakt(boUuid)
        k.lika("verifierad kontakt: varning och stopp", v2.kryptering(boK), .varning(uuid: boUuid, blockerad: true))
        try await k.vanta(1.2)
        await ChattProv.bada(k, "varning-stopp")
        let okx = await skicka(boK, "MARKÖR-stoppat")
        k.kolla("inget skickas medan numret inte är godkänt", !okx)
        k.kolla("Bosse fick inget", try await motpartFar("bo", "MARKÖR-stoppat", max: 4)["hittad"] as? Bool != true)
        lage.notis = nil
        // Servern visar Bosses riktiga identitet igen
        _ = try await m.post("/aterstall-identitet", ["vem": "bo"])
        await v2.kontrolleraKontakt(boUuid)
        k.lika("rätt identitet igen: stoppet hävs, varningen ligger kvar", v2.kryptering(boK), .varning(uuid: boUuid, blockerad: false))
        k.kolla("Bosse är fortfarande verifierad", v2.e2e?.kontaktStatus(boUuid)["verifierad"] as? Bool == true)
        try await k.vanta(1.2)
        await ChattProv.bada(k, "varning")
        v2.varningSedd(boUuid)
        k.kolla("varningen sedd: chatten är E2E igen", ar(v2.kryptering(boK)) { if case .e2e = $0 { return true } else { return false } })
        let t3 = "MARKÖR-ios-3 efter varningen"
        k.kolla("det går att skicka igen", await skicka(boK, t3))
        k.kolla("Bosse läser det", try await motpartFar("bo", t3)["hittad"] as? Bool == true)
        // Cia är inte verifierad: varning men inget stopp, och hennes enheter godtas inte med fel identitet
        _ = try await m.post("/byt-identitet", ["vem": "cia", "annan": "bo"])
        await v2.kontrolleraKontakt(ciaUuid)
        k.lika("overifierad kontakt: varning utan stopp", v2.kryptering(ciaK), .varning(uuid: ciaUuid, blockerad: false))
        k.lika("och inga av Cias enheter godtas (de är signerade av hennes riktiga identitet)", E2EJSON.tal(v2.e2e?.kontaktStatus(ciaUuid)["enheter"]), 0)
        _ = try await m.post("/aterstall-identitet", ["vem": "cia"])
        await v2.kontrolleraKontakt(ciaUuid)
        v2.varningSedd(ciaUuid)
        let tc = "MARKÖR-ios-cia efter bytet tillbaka"
        k.kolla("Cias riktiga identitet igen: det går att skicka till henne", await skicka(ciaK, tc))
        k.kolla("Cia läser det", try await motpartFar("cia", tc)["hittad"] as? Bool == true)

        // MARK: Omstart: allt läses från Keychain och de krypterade filerna
        let foreText = texter(boK)
        await v2.oppnaIgen()
        k.kolla("E2E öppnas igen med samma enhet", v2.lage == .aktiv && v2.e2e?.enhetId == forstaEnhet && v2.e2e?.jag == jag)
        k.lika("historiken läses från disk", texter(boK), foreText)
        await lage.uppdateraListan()
        let t4 = "MARKÖR-ios-4 efter omstart"
        k.kolla("sessionen fortsätter efter omstart", await skicka(boK, t4))
        k.kolla("Bosse läser det", try await motpartFar("bo", t4)["hittad"] as? Bool == true)
        let t4b = "MARKÖR-bo-4 till iPhonen efter omstart"
        markorer.append(t4b)
        _ = try await m.post("/skicka", ["fran": "bo", "text": t4b])
        await vantaE2E("iPhonen läser efter omstart") { texter(boK).contains(t4b) }
        // Filerna på iPhonen: ingen klartext (historiken och tillståndet är krypterade med nyckeln i Keychain)
        if let lagring = v2.e2e?.lagring {
            let filer = (FileManager.default.enumerator(at: lagring.mapp, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? [])
                .filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }
            let allt = filer.compactMap { try? Data(contentsOf: $0) }.reduce(Data(), +)
            let sok = markorer + [jag, boUuid, "Bosse"]
            let hittade = sok.filter { allt.range(of: Data($0.utf8)) != nil }
            k.kolla("iPhonens E2E-filer innehåller ingen klartext (\(filer.count) filer, \(allt.count) byte)", hittade.isEmpty && !filer.isEmpty && !allt.isEmpty,
                    ["hittade": .lista(hittade.map { .text(String($0.prefix(30))) })])
            k.kolla("men historiken går att läsa med nyckeln", foreText.contains(t1) && foreText.contains(t2))
        }

        // MARK: Länka Alvas dator (den nya visar QR-koden, iPhonen skannar)
        let ny = try await m.post("/lanka/ny")
        guard let lankQr = ny["qr"] as? String, lankQr.hasPrefix("adraze-lank:1:") else { k.kolla("Alvas dator visar en länk-QR", false); return }
        E2EProvlage.kontroll = nil
        E2EProvlage.skannadKod = lankQr
        try await visaOversikt("lanka")
        guard await k.vantaPa("kontrollkoden visas på iPhonen", max: 40, { E2EProvlage.kontroll != nil }) else { return }
        var ls = try await m.get("/lanka/status")
        k.lika("samma kontrollkod på iPhonen och Alvas dator", E2EProvlage.kontroll, ls["kod"] as? String)
        try await k.vanta(0.6)
        await ChattProv.bada(k, "lanka-kontroll")
        NotificationCenter.default.post(name: E2EProvlage.godkann, object: nil)
        for _ in 0..<60 {
            ls = try await m.get("/lanka/status")
            // "fel" är null (NSNull) tills något har gått fel
            if ls["klar"] as? Bool == true || ls["fel"] as? String != nil { break }
            try await k.vanta(0.5)
        }
        k.kolla("Alvas dator är länkad med samma identitet", ls["klar"] as? Bool == true && ls["uuid"] as? String == jag, ["status": .text(String(describing: ls))])
        try await k.vanta(1.0)
        await ChattProv.bada(k, "lanka-klar")
        try await stangArk()
        let datorEnhet = Int(E2EJSON.tal(ls["enhet"]) ?? 0)
        let t5 = "MARKÖR-bo-5 till båda Alvas enheter"
        markorer.append(t5)
        _ = try await m.post("/skicka", ["fran": "bo", "text": t5])
        k.kolla("Alvas dator läser Bosses meddelande", try await m.post("/vanta", ["vem": "alvadator", "text": t5])["hittad"] as? Bool == true)
        await vantaE2E("iPhonen läser samma meddelande") { texter(boK).contains(t5) }
        let t6 = "MARKÖR-ios-6 kommer även till Alvas dator"
        k.kolla("iPhonen skickar till Bosse", await skicka(boK, t6))
        let sync = try await m.post("/vanta", ["vem": "alvadator", "text": t6])
        k.kolla("kopian till Alvas egen dator kommer fram (samma konversation)", sync["hittad"] as? Bool == true && E2EJSON.objekt(sync["konv"])["dm"] as? String == boUuid)
        k.kolla("Bosse läser det", try await motpartFar("bo", t6)["hittad"] as? Bool == true)

        // MARK: Kuvert till fel enhet (servern lägger Alvas dators kuvert i iPhonens kö)
        fore = avvisade().count
        let fe = try await m.post("/fel-enhet", ["fran": "bo", "text": "MARKÖR-fel-enhet", "fran_enhet": datorEnhet, "till_enhet": forstaEnhet])
        markorer.append("MARKÖR-fel-enhet")
        k.kolla("servern kopierade kuvertet", fe["ok"] as? Bool == true)
        await vantaE2E("kuvertet till Alvas dator avvisas på iPhonen") { avvisade().count > fore }
        k.notera("fel_enhet_orsak", .text(avvisade().first ?? ""))
        await vantaE2E("iPhonens eget kuvert läses") { texter(boK).contains("MARKÖR-fel-enhet") }
        k.lika("och bara en gång", texter(boK).filter { $0 == "MARKÖR-fel-enhet" }.count, 1)

        // MARK: Återställningskoden (iPhonen har tappat allt)
        let snFore = try await m.get("/sakerhetsnummer?vem=bo&med=\(jag)")["siffror"] as? String
        try await v2.glomEnheten()
        k.lika("iPhonen borttagen: den behöver länkas eller återställas", v2.lage, .behoverLankas)
        k.lika("utan enhet: chatten med Bosse sägs ha den äldre krypteringen", v2.kryptering(boK), .aldre(.inteLankad))
        try await visaOversikt(nil)
        await ChattProv.bada(k, "ej-lankad")
        try await stangArk()
        do {
            try await v2.e2e?.aterstall(kod: String(repeating: "a", count: 64))
            k.kolla("fel återställningskod godtas inte", false)
        } catch let f as E2EFel { k.lika("fel återställningskod godtas inte", f.kod, "fel_kod") }
        do {
            try await v2.e2e?.aterstall(kod: kod)
            await v2.lankad()
        } catch { k.kolla("återställningen", false, ["fel": .text(error.localizedDescription)]) }
        k.kolla("återställd med koden: samma identitet, ny enhet", v2.lage == .aktiv && v2.e2e?.jag == jag && v2.e2e?.enhetId != forstaEnhet,
                ["enhet": .tal(Double(v2.e2e?.enhetId ?? 0))])
        let snEfter = try await m.get("/sakerhetsnummer?vem=bo&med=\(jag)")["siffror"] as? String
        k.lika("säkerhetsnumret med Bosse är oförändrat", snEfter, snFore)
        await lage.uppdateraListan()
        let t7 = "MARKÖR-bo-7 till den återställda iPhonen"
        markorer.append(t7)
        _ = try await m.post("/skicka", ["fran": "bo", "text": t7])
        await vantaE2E("den återställda iPhonen läser Bosses meddelande") { texter(boK).contains(t7) }

        // MARK: Länka iPhonen (iPhonen är ny och visar QR-koden, Alvas dator skannar)
        try await v2.glomEnheten()
        guard v2.lage == .behoverLankas else { k.lika("iPhonen borttagen igen", v2.lage, .behoverLankas); return }
        E2EProvlage.lankQr = nil
        E2EProvlage.kontroll = nil
        try await visaOversikt("visaqr")
        guard await k.vantaPa("iPhonen visar en QR-kod för länkning", max: 20, { E2EProvlage.lankQr != nil }) else { return }
        try await k.vanta(0.8)
        await ChattProv.bada(k, "lanka-iphone-qr")
        _ = try await m.post("/lanka/skanna", ["qr": E2EProvlage.lankQr ?? ""])
        guard await k.vantaPa("kontrollkoden visas på iPhonen", max: 40, { E2EProvlage.kontroll != nil }) else {
            k.notera("datorns_skanning", .text(String(describing: try await m.get("/lanka/skanning"))))
            return
        }
        try await k.vanta(0.6)
        await ChattProv.bada(k, "lanka-iphone-kod")
        let bk = try await m.post("/lanka/bekrafta", ["kod": E2EProvlage.kontroll ?? ""])
        k.kolla("Alvas dator ser samma kontrollkod och godkänner", bk["stammer"] as? Bool == true && bk["klar"] as? Bool == true, ["svar": .text(String(describing: bk))])
        await k.vantaPa("iPhonen är länkad", max: 30) { v2.lage == .aktiv }
        k.lika("med kontots identitet", v2.e2e?.jag, jag)
        try await k.vanta(1.0)
        await ChattProv.bada(k, "lanka-iphone-klar")
        try await stangArk()
        await lage.uppdateraListan()
        let t8 = "MARKÖR-bo-8 till den länkade iPhonen"
        markorer.append(t8)
        _ = try await m.post("/skicka", ["fran": "bo", "text": t8])
        await vantaE2E("den länkade iPhonen läser Bosses meddelande") { texter(boK).contains(t8) }
        let t9 = "MARKÖR-ios-9 från den länkade iPhonen"
        k.kolla("den länkade iPhonen skickar", await skicka(boK, t9))
        k.kolla("Bosse läser det", try await motpartFar("bo", t9)["hittad"] as? Bool == true)

        // MARK: Servern har bara chiffer
        let sk = try await m.post("/skanna", ["markorer": markorer, "binar": bildbitar])
        let hittade = (sk["hittade"] as? [String]) ?? ["?"]
        k.kolla("serverns databas, WAL-fil och bilagor innehåller ingen av \(markorer.count) klartexter (meddelanden, gruppnamn, återställningskoden)",
                hittade.isEmpty, ["hittade": .lista(hittade.map { .text(String($0.prefix(40))) }), "filer": .lista(((sk["filer"] as? [String]) ?? []).map { .text($0) })])
        k.kolla("och inga bitar av bilderna (råa byte eller base64)", E2EJSON.tal(sk["binarHittade"]) == 0 && (E2EJSON.tal(sk["binara"]) ?? 0) >= 3,
                ["sokta": .tal(Double(E2EJSON.tal(sk["binara"]) ?? 0))])
        k.kolla("kontroll: sökningen hittar det som faktiskt ligger i klartext (användarnamnet)", sk["kontroll"] as? Bool == true)

        await ChattVisning.stang()
        await kontot.loggaUt()
    }
}

/// Styrytan i `browser/e2e/test/motpart.mjs` (lokal HTTP på tailnet, bara självtestet).
@MainActor
final class E2EMotpart {
    private let bas: String
    private let session: URLSession

    init?(_ adress: String?) {
        guard let a = adress, let u = URL(string: a), u.scheme == "http", let h = u.host, LokalHTTP.arLokal(h) else { return nil }
        bas = a.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let k = URLSessionConfiguration.ephemeral
        k.protocolClasses = [LokalHTTP.self]
        k.timeoutIntervalForRequest = 200
        session = URLSession(configuration: k)
    }

    func get(_ sokvag: String) async throws -> [String: Any] { try await anropa("GET", sokvag, nil) }
    func post(_ sokvag: String, _ kropp: [String: Any] = [:]) async throws -> [String: Any] { try await anropa("POST", sokvag, kropp) }

    private func anropa(_ metod: String, _ sokvag: String, _ kropp: [String: Any]?) async throws -> [String: Any] {
        guard let url = URL(string: bas + sokvag) else { throw E2EFel(kod: "format", text: sokvag) }
        var r = URLRequest(url: url)
        r.httpMethod = metod
        r.timeoutInterval = 200
        if let kropp {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: kropp)
        }
        let (data, svar) = try await session.data(for: r)
        let status = (svar as? HTTPURLResponse)?.statusCode ?? 0
        let json = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        guard status == 200 else { throw E2EFel(kod: "motpart_\(status)", text: "\(metod) \(sokvag): \(json["fel"] as? String ?? "")") }
        return json
    }
}
