import AVFoundation
import SwiftUI
import UIKit

/// Självtestet `-mode chatt` mot den lokala testservern (aldrig produktion):
///
///     ~/.cache/claude-arbete/adraze-chatt-server/nollstall.sh      # tom databas + testdata (seed.mjs)
///     ./fran-mint.sh -n steg5-chatt chatt ~/adraze-app/skarm -- -api http://100.122.13.91:18790 -testkod 246810
///
/// Del A: ett nytt konto utan chattprofil (Nora) väljer namn och får en tom inkorg.
/// Del B: Noah (testdata: fem vänner, två grupper, en väntande förfrågan) – listan, statusraderna, fäst, öppna en chatt,
/// bild, svar, reaktion, skicka text och bild, långtrycket, ångra, bakgrund, chattinfo, samtalsskärmen, grupp och gruppinfo,
/// skapa och lämna en grupp. Skärmbild av varje vy i ljust och mörkt.
@MainActor
enum ChattProv {
    static let nora = "ny@adraze.test"
    static let noah = "noah@adraze.test"
    static let losen = "Testlosen-2026"

    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        guard let kontot = app.konto as? Kontot else { k.fel = "Konto levererar inte app.konto"; return }
        guard app.startargument.text("api") != nil, let testkod = app.startargument.text("testkod") else {
            k.fel = "Testet behöver -api <lokal testserver> och -testkod (kör aldrig mot produktion)"
            return
        }
        let lageFore = app.installningar.sparat("tema.lage")
        defer { _ = app.installningar.satt("tema.lage", lageFore, utanHistorik: true) }
        _ = app.installningar.satt("tema.lage", .text("ljust"), utanHistorik: true)
        let lage = ChattModul.delatLage(app)

        // MARK: A. Nytt konto: välj användarnamn, tom inkorg
        try await loggaIn(k, kontot, nora, testkod)
        ChattVisning.visa(app)
        let namnsteg = await k.vantaPa("nytt konto: chatten ber om ett användarnamn", max: 20) {
            if case .behoverNamn = lage.fas { return true }
            return lage.fas == .klar
        }
        if namnsteg, case .behoverNamn = lage.fas {
            try await k.vanta(1.0)
            await bada(k, "namn")
            do {
                try await lage.skapaProfil("Nora")
                k.kolla("profilen skapad på telefonen", lage.fas == .klar && lage.jag?.anvandarnamn == "Nora")
            } catch { k.kolla("profilen skapad på telefonen", false, ["fel": .text(error.localizedDescription)]) }
        }
        k.notera("nora_id", .text(lage.jag?.id ?? ""))
        await k.vantaPa("tomma inkorgen laddad", max: 15) { lage.listanLaddad }
        k.kolla("nytt konto har inga chattar", lage.rader.isEmpty, ["rader": .tal(Double(lage.rader.count))])
        try await k.vanta(1.0)
        await bada(k, "tom")
        await ChattVisning.stang()
        await kontot.loggaUt()
        k.kolla("chatten utloggad med kontot", await k.vantaPa("fas utloggad", max: 5) { lage.fas == .utloggad })

        // MARK: B. Noah med testdata
        try await loggaIn(k, kontot, noah, testkod)
        // Samma väg som skalets meny: platsen "Chatt" i app.platser
        if let oppna = app.platser[Platser.chatt]?.oppna {
            k.kolla("menyns plats Chatt öppnar den native chatten", true)
            oppna()
        } else {
            k.kolla("menyns plats Chatt öppnar den native chatten", false)
            ChattVisning.visa(app)
        }
        guard await k.vantaPa("upplåst med kontots nyckel", max: 25, { lage.fas == .klar }) else { return }
        guard await k.vantaPa("listan laddad", max: 25, { lage.listanLaddad && lage.rader.count >= 7 }) else { return }
        let jag = lage.jag
        k.lika("inloggad som Noah", jag?.anvandarnamn, "Noah")
        // Vilken väg listan tog: den nya rutten GET /chatt/conversations eller dagens rutter (reserven)
        let rutt = (lage.lager as? ChattV1)?.harInkorgsrutt
        k.notera("inkorgsvag", .text(rutt == true ? "GET /chatt/conversations" : rutt == false ? "dagens rutter" : "okänd"))

        func rad(_ namn: String) -> ChattLage.Rad? { lage.rader.first { $0.namn == namn } }
        k.notera("ordning", .lista(lage.rader.map { .text($0.namn) }))
        k.lika("senaste chatten överst", lage.rader.first?.namn, "Mira")
        if let r = rad("Mira") {
            k.lika("Mira: två olästa", r.sammanfattning?.olasta, 2)
            k.lika("Mira: senaste meddelandet syns", ChattInkorgsrad.status(for: r).text, "Alva och Jonas hänger med 🙌")
            k.kolla("Mira: aktiv-pricken", r.online)
        } else { k.kolla("Mira finns i listan", false) }
        if let r = rad("Jonas") {
            let t = ChattInkorgsrad.status(for: r).text
            // Testdatan är från när servern fylldes: minuter eller timmar beroende på hur länge sedan det var
            let minuter = ct("Skickat för {n} min sedan", ["n": "#"]).components(separatedBy: "#")
            let timmar = ct("Skickat för {n} tim sedan", ["n": "#"]).components(separatedBy: "#")
            k.kolla("Jonas: \"Skickat för … sedan\"", (t.hasPrefix(minuter[0]) && t.hasSuffix(minuter.last ?? "")) || (t.hasPrefix(timmar[0]) && t.hasSuffix(timmar.last ?? "")), ["text": .text(t)])
        }
        if let r = rad("Alva") { k.lika("Alva: \"Sett\"", ChattInkorgsrad.status(for: r).text, ct("Sett")) }
        if let r = rad("Lördagsfika") {
            k.lika("grupp: tre olästa", r.sammanfattning?.olasta, 3)
            if let m = r.sammanfattning?.senaste {
                k.lika("grupp: avsändare i förhandsvisningen", ChattInkorgsrad.forhand(m, grupp: true), "Alva: 😍")
            } else { k.kolla("grupp: avsändare i förhandsvisningen", false) }
            // Skriver någon i gruppen just nu (testserverns liv) visar raden det i stället, som datorn
            if let vem = r.sammanfattning?.skriver.first, vem != "*" {
                k.lika("grupp: statusraden visar vem som skriver", ChattInkorgsrad.status(for: r).text, ct("{namn} skriver…", ["namn": vem]))
            } else {
                k.lika("grupp: statusraden visar senaste med avsändare", ChattInkorgsrad.status(for: r).text, "Alva: 😍")
            }
            k.lika("grupp: medlemmar i avatarklungan", Set(r.medlemmar), Set(["Mira", "Jonas", "Alva"]))
        } else { k.kolla("gruppen Lördagsfika finns", false) }
        k.kolla("datorns grupp Klätterbandet syns", rad("Klätterbandet") != nil)
        k.lika("väntande förfrågan från Omar", lage.inkommande.map(\.anvandarnamn), ["Omar"])
        if app.startargument.text("liv") != nil, let leo = rad("Leo") {
            await k.vantaPa("Leo: \"Skriver…\" i listan", max: 15) {
                lage.rader.first { $0.konv == leo.konv }.map { ChattInkorgsrad.status(for: $0).text == ct("Skriver…") } ?? false
            }
        }

        // Fäst överst
        guard let klatter = rad("Klätterbandet")?.konv, let miraK = rad("Mira")?.konv, let fikaK = rad("Lördagsfika")?.konv else { return }
        if !lage.installningar.arFast(klatter) { lage.installningar.vaxlaFast(klatter) }
        k.lika("fäst chatt hamnar överst", lage.rader.first?.konv, klatter)
        // Svep "Oläst" på en läst chatt: markeras på telefonen (punkt i listan) tills den öppnas
        if let jonasK = rad("Jonas")?.konv {
            await lage.vaxlaLast(jonasK)
            k.kolla("svep Oläst: Jonas markerad som oläst", rad("Jonas")?.markeradOlast == true)
        }
        try await k.vanta(1.2)
        await bada(k, "inkorg")

        // Svep "Läst" på gruppen med olästa: läst på servern, utan att chatten öppnas
        await lage.vaxlaLast(fikaK)
        await lage.uppdateraListan()
        k.lika("svep Läst: gruppens olästa nollas även på servern", rad("Lördagsfika")?.sammanfattning?.olasta, 0)

        // MARK: Öppna Miras chatt
        lage.begard = miraK
        guard await k.vantaPa("Miras chatt öppnas och laddas", max: 20, { lage.oppen == miraK && (lage.meddelanden[miraK]?.count ?? 0) >= 8 }) else { return }
        let lista = lage.meddelanden[miraK] ?? []
        k.notera("mira_meddelanden", .tal(Double(lista.count)))
        k.kolla("svar med citat tolkas", lista.contains { $0.svar?.text == "Ska jag boka bord till lördag?" && $0.text == "Ja gör det! Fyra personer" })
        k.lika("Miras meddelanden har hennes namn", lista.first { !$0.mitt }?.franNamn, "Mira")
        if let b = lista.first(where: { if case .bild = $0.innehall { return true } else { return false } }), case .bild(let info, let text) = b.innehall {
            k.lika("bildtexten", text, "Utsikten från jobbet idag")
            let ui = await lage.bild(info.bilaga, i: miraK)
            k.kolla("bilden hämtas och dekrypteras", ui != nil, ["w": .tal(Double(ui?.size.width ?? 0)), "h": .tal(Double(ui?.size.height ?? 0))])
        } else { k.kolla("Miras bild finns", false) }
        if let ljus = lista.first(where: { $0.text == "Vilket ljus!" }) {
            k.kolla("Miras reaktion ❤️ syns på mitt meddelande", lage.reaktioner(pa: ljus, i: miraK).contains { $0.emoji == "❤️" && !$0.mitt })
        }
        k.lika("olästa nollas när chatten öppnas", lage.sammanfattningar[miraK]?.olasta, 0)
        // Toningen under rubrikraden måste nå ner förbi knapparna (statusraden + rubrikraden är minst 90 pt)
        k.kolla("toningen under rubrikraden täcker rubrikraden", lage.provRubrikkant > 90, ["pt": .tal(Double(lage.provRubrikkant))])
        try await k.vanta(1.5)
        await bada(k, "konversation")

        // Skicka text
        let fore = lage.meddelanden[miraK]?.count ?? 0
        let ok = await lage.skicka(miraK, ChattUtkast(text: "Hej från telefonen 👋", bild: nil, video: nil, svar: nil))
        let skickat = lage.meddelanden[miraK]?.last
        k.kolla("text skickad", ok && skickat?.text == "Hej från telefonen 👋" && skickat?.id.hasPrefix("tmp-") == false && (lage.meddelanden[miraK]?.count ?? 0) == fore + 1)
        k.notera("skickat_text_id", .text(skickat?.id ?? ""))

        // Skicka bild (sajtens figur, ritad till JPEG)
        if let b = ChattMedia.bild(provbild()) {
            let ok = await lage.skicka(miraK, ChattUtkast(text: "", bild: b, video: nil, svar: nil))
            let m = lage.meddelanden[miraK]?.last
            if ok, let m, case .bild(let info, _) = m.innehall {
                k.kolla("bild skickad (krypterad bilaga)", !info.bilaga.isEmpty, ["bytes": .tal(Double(b.data.count)), "w": .tal(Double(b.bredd))])
                k.notera("skickad_bild_id", .text(m.id))
                k.notera("skickad_bilaga", .text(info.bilaga))
                lage.ramar[m.id] = nil
            } else { k.kolla("bild skickad (krypterad bilaga)", false) }
        }

        // Skicka video: en film gjord här (testbilden i två sekunder), omgjord till MP4 av samma kod som bildväljaren använder
        if let film = await provfilm() {
            do {
                let (v, tumme, kortad) = try await ChattMedia.video(film)
                k.kolla("videon blev MP4 med miniatyr", v.mime == "video/mp4" && v.bredd > 0 && v.langd > 1.5 && tumme != nil && !kortad,
                        ["bytes": .tal(Double(v.data.count)), "w": .tal(Double(v.bredd)), "h": .tal(Double(v.hojd)), "s": .tal(v.langd)])
                let ok = await lage.skicka(miraK, ChattUtkast(text: "", bild: nil, video: v, svar: nil))
                if ok, let m = lage.meddelanden[miraK]?.last, case .video(let info, _) = m.innehall {
                    k.kolla("video skickad (krypterad bilaga)", info.bilagor.first?.isEmpty == false)
                    k.notera("skickad_video_id", .text(m.id))
                    k.notera("skickad_videobilaga", .text(info.bilagor.first ?? ""))
                } else { k.kolla("video skickad (krypterad bilaga)", false) }
            } catch { k.kolla("videon blev MP4 med miniatyr", false, ["fel": .text(String(describing: error))]) }
            try? FileManager.default.removeItem(at: film)
        } else { k.kolla("testfilmen kunde skapas", false) }

        // Svara med citat
        if let fraga = lage.meddelanden[miraK]?.last(where: { $0.text == "Alva och Jonas hänger med 🙌" }) {
            let citat = ChattCitat(id: fraga.id, vem: fraga.franNamn, text: fraga.text, bild: false)
            let ok = await lage.skicka(miraK, ChattUtkast(text: "Perfekt, då bokar jag för fyra", bild: nil, video: nil, svar: citat))
            k.kolla("svar skickat med citat", ok && lage.meddelanden[miraK]?.last?.svar?.id == fraga.id)
            k.lika("citatet har Miras namn (som datorn visar)", lage.meddelanden[miraK]?.last?.svar?.vem, "Mira")
            k.notera("skickat_svar_id", .text(lage.meddelanden[miraK]?.last?.id ?? ""))
        }
        // Det senast skickade ska synas ovanför skrivfältet (listan rullar till slutet även efter en hög bild)
        try await k.vanta(1.2)
        let fonsterhojd = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.windows.first?.bounds.height ?? 852
        if let sista = lage.meddelanden[miraK]?.last, let ram = lage.ramar[sista.id] {
            k.kolla("senaste meddelandet syns ovanför skrivfältet", ram.minY > 60 && ram.maxY < fonsterhojd - 80,
                    ["minY": .tal(Double(ram.minY)), "maxY": .tal(Double(ram.maxY)), "fonster": .tal(Double(fonsterhojd))])
        } else {
            k.kolla("senaste meddelandet syns ovanför skrivfältet", false, ["ram": .text("okänd")])
        }
        try await k.vanta(1.5)

        // Långtrycket på Miras senaste meddelande (samma väg som fingret, via vyns egen funktion)
        guard let mal = lage.meddelanden[miraK]?.last(where: { !$0.mitt && $0.innehall.arMeddelande }) else { return }
        let haptikFore = ChattHaptik.antal["medel"] ?? 0
        lage.provLangtryck = mal.id
        await k.vantaPa("långtrycksmenyn öppnas", max: 5) { lage.langtryck != nil }
        try await k.vanta(0.8)
        k.kolla("haptik (medium) när menyn öppnas", (ChattHaptik.antal["medel"] ?? 0) > haptikFore)
        k.kolla("bubblans ram är känd", lage.ramar[mal.id] != nil)
        await bada(k, "langtryck")

        // Reaktion 😂 från menyn
        lage.langtryck?.gor(.reagera("😂"))
        await k.vantaPa("reaktionen 😂 sparas på servern", max: 10) {
            (lage.reaktioner[miraK] ?? [:]).contains { !$0.key.hasPrefix("tmp-") && $0.value.mal == mal.id && $0.value.emoji == "😂" && $0.value.mitt && $0.value.pa }
        }
        k.kolla("menyn stängs efter valet", lage.langtryck == nil)
        k.notera("reaktion_id", .text((lage.reaktioner[miraK] ?? [:]).first { $0.value.mal == mal.id && $0.value.emoji == "😂" }?.key ?? ""))
        try await k.vanta(1.2)
        await bada(k, "reaktion")

        // Svara från menyn: svarsraden ovanför skrivfältet
        lage.provLangtryck = mal.id
        await k.vantaPa("menyn öppnas igen", max: 5) { lage.langtryck != nil }
        try await k.vanta(0.6)
        lage.langtryck?.gor(.svara)
        try await k.vanta(1.0)
        k.kolla("svarsraden visas", lage.provSvarar == mal.id)
        // Tangentbordet ritas i ett eget fönster och kommer inte med på skärmbilden; fäll ner det så att ytan inte blir tom
        lage.provSkarm = "utan-tangentbord"
        try await k.vanta(0.8)
        lage.provSkarm = nil
        await bada(k, "svar")

        // Ångra sändning och ta bort för mig
        _ = await lage.skicka(miraK, ChattUtkast(text: "Fel chatt, förlåt", bild: nil, video: nil, svar: nil))
        if let fel = lage.meddelanden[miraK]?.last, fel.text == "Fel chatt, förlåt" {
            await lage.angra(fel, i: miraK)
            k.lika("ångra sändning", lage.meddelanden[miraK]?.first { $0.id == fel.id }?.innehall, .borttaget)
            await lage.dolj(fel, i: miraK)
            k.kolla("ta bort för mig", lage.meddelanden[miraK]?.contains { $0.id == fel.id } == false)
        }

        // Bakgrund: gorillamönstret och väljaren (utan svarsraden, så att mönstret syns)
        lage.provSkarm = "utan-svar"
        try await k.vanta(0.4)
        lage.provSkarm = nil
        lage.installningar.sattBakgrund(miraK, .init(forval: "gorilla"))
        try await k.vanta(1.0)
        await bada(k, "bakgrund")
        lage.provSkarm = "bakgrund"
        try await k.vanta(1.6)
        await bada(k, "bakgrundsval")
        lage.provSkarm = nil
        try await k.vanta(1.0)
        lage.installningar.sattBakgrund(miraK, .init(forval: "papper"))

        // Chattinfo för en vän
        lage.provSkarm = "info"
        try await k.vanta(1.4)
        await bada(k, "chattinfo")
        lage.provSkarm = nil
        try await k.vanta(1.0)

        // Samtalsskärmen (förberedelse, låtsas inte ringa)
        lage.provSkarm = "samtal"
        try await k.vanta(1.2)
        await bada(k, "samtal")
        lage.provSkarm = nil
        try await k.vanta(1.0)

        // MARK: Gruppen
        lage.begard = fikaK
        let gruppOppnad = await k.vantaPa("gruppchatten öppnas och dekrypteras", max: 20, {
            lage.oppen == fikaK && (lage.meddelanden[fikaK]?.contains { $0.text == "Tar med kakor" } ?? false)
        })
        if !gruppOppnad {
            k.logga("öppen: \(String(describing: lage.oppen)), poster i gruppen: \(lage.meddelanden[fikaK]?.count ?? -1), "
                    + "texter: \((lage.meddelanden[fikaK] ?? []).suffix(6).map(\.text))")
            await k.skarmbild("grupp-fel")
        }
        if gruppOppnad {
            try await k.vanta(1.5)
            await bada(k, "grupp")
            let medlemmar = (try? await lage.lager.medlemmar(fikaK.id)) ?? []
            k.lika("gruppens medlemmar", Set(medlemmar.map(\.anvandarnamn)), Set(["Mira", "Noah", "Jonas", "Alva"]))
            k.kolla("skaparen är admin", medlemmar.first { $0.anvandarnamn == "Mira" }?.admin == true)
            lage.provSkarm = "info"
            try await k.vanta(1.8)
            await bada(k, "gruppinfo")
            lage.provSkarm = nil
            try await k.vanta(1.0)
        }

        // Skapa en grupp på telefonen, skriv i den och lämna den
        let mira = lage.person(miraK.id), leo = lage.kontakter.first { $0.anvandarnamn == "Leo" }
        if let mira, let leo, let ny = await lage.skapaGrupp("Testgrupp iOS", [mira, leo]) {
            k.kolla("grupp skapad på telefonen", lage.grupp(ny.id) != nil)
            k.notera("ny_grupp", .text(ny.id))
            let ok = await lage.skicka(ny, ChattUtkast(text: "Hej gruppen, från telefonen", bild: nil, video: nil, svar: nil))
            k.kolla("meddelande i den nya gruppen", ok)
            k.lika("lämna gruppen", await lage.lamna(ny.id), true)
            k.kolla("gruppen borta ur listan", lage.grupp(ny.id) == nil)
        } else { k.kolla("grupp skapad på telefonen", false) }

        // Nytt meddelande-arket och vänförfrågan
        lage.provSkarm = "inkorg"
        try await k.vanta(1.0)
        lage.provSkarm = "ny"
        try await k.vanta(1.4)
        await bada(k, "ny")
        lage.provSkarm = nil
        try await k.vanta(0.8)
        if let omar = lage.inkommande.first(where: { $0.anvandarnamn == "Omar" }) {
            await lage.svaraForfragan(omar, ja: true)
            k.kolla("förfrågan accepterad: Omar är vän", lage.kontakter.contains { $0.anvandarnamn == "Omar" } && lage.inkommande.isEmpty)
        }
        let kanal = try await app.brygga.anropa("chatt:olasta", [], fran: BryggKalla(yta: "labb"))
        k.kolla("chatt:olasta svarar", kanal.tal != nil, kanal)

        // Städa: lossa, ta bort oläst-markeringen, stäng, logga ut
        if lage.installningar.arFast(klatter) { lage.installningar.vaxlaFast(klatter) }
        if let jonasK = rad("Jonas")?.konv, lage.installningar.arOlastMarkerad(jonasK) { lage.installningar.markeraOlast(jonasK, false) }
        await ChattVisning.stang()
        await kontot.loggaUt()
    }

    // MARK: Hjälp

    static func loggaIn(_ k: Labbkorning, _ kontot: Kontot, _ epost: String, _ kod: String) async throws {
        if kontot.arInloggad { await kontot.loggaUt() }
        let steg = try await kontot.loggaIn(epost: epost, losen: losen)
        if case .kod(let e, _) = steg { try await kontot.verifiera(epost: e, kod: kod) }
        k.kolla("inloggad som \(epost)", kontot.arInloggad && kontot.konto?.epost == epost)
    }

    /// Skärmbild i ljust och mörkt läge.
    static func bada(_ k: Labbkorning, _ namn: String) async {
        _ = k.app.installningar.satt("tema.lage", .text("ljust"), utanHistorik: true)
        try? await k.vanta(0.7)
        await k.skarmbild("\(namn)-ljust")
        _ = k.app.installningar.satt("tema.lage", .text("morkt"), utanHistorik: true)
        try? await k.vanta(0.7)
        await k.skarmbild("\(namn)-morkt")
        _ = k.app.installningar.satt("tema.lage", .text("ljust"), utanHistorik: true)
        // Låt bytet till ljust bli klart innan nästa steg öppnar eller stänger ett ark
        try? await k.vanta(0.6)
    }

    /// En testfilm: testbilden i två sekunder med en orange stapel som rör sig, H.264 1280 × 720 i 30 bilder/s.
    static func provfilm() async -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("chatt-prov-\(UUID().uuidString).mov")
        let bredd = 1280, hojd = 720, antal = 60
        guard let skrivare = try? AVAssetWriter(outputURL: url, fileType: .mov) else { return nil }
        let spar = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264,
                                                                          AVVideoWidthKey: bredd, AVVideoHeightKey: hojd])
        spar.expectsMediaDataInRealTime = false
        let adapter = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: spar, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: bredd, kCVPixelBufferHeightKey as String: hojd])
        guard skrivare.canAdd(spar) else { return nil }
        skrivare.add(spar)
        guard skrivare.startWriting() else { return nil }
        skrivare.startSession(atSourceTime: .zero)
        let bild = provbild().cgImage
        for i in 0..<antal {
            var vantat = 0
            while !spar.isReadyForMoreMediaData && vantat < 400 { try? await Task.sleep(nanoseconds: 5_000_000); vantat += 1 }
            guard let pool = adapter.pixelBufferPool else { return nil }
            var buffert: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffert)
            guard let buffert else { return nil }
            CVPixelBufferLockBaseAddress(buffert, [])
            if let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffert), width: bredd, height: hojd, bitsPerComponent: 8,
                                   bytesPerRow: CVPixelBufferGetBytesPerRow(buffert), space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) {
                ctx.setFillColor(UIColor(hex: "#f6efe7").cgColor)
                ctx.fill(CGRect(x: 0, y: 0, width: bredd, height: hojd))
                if let bild { ctx.draw(bild, in: CGRect(x: 160, y: 0, width: 960, height: 720)) }
                ctx.setFillColor(UIColor(hex: "#ff4b1f").cgColor)
                ctx.fill(CGRect(x: CGFloat(i) * CGFloat(bredd - 160) / CGFloat(antal - 1), y: 36, width: 160, height: 22))
            }
            CVPixelBufferUnlockBaseAddress(buffert, [])
            guard adapter.append(buffert, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 30)) else { return nil }
        }
        spar.markAsFinished()
        await skrivare.finishWriting()
        return skrivare.status == .completed ? url : nil
    }

    /// En testbild: sajtens figur "happy" på varm bakgrund, 1200 × 900.
    static func provbild() -> UIImage {
        let storlek = CGSize(width: 1200, height: 900)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: storlek, format: format).image { c in
            UIColor(hex: "#f6e3d6").setFill()
            c.fill(CGRect(origin: .zero, size: storlek))
            if let f = UIImage(named: "ChattFigurGlad") {
                let h: CGFloat = 700, w = h * f.size.width / max(f.size.height, 1)
                f.draw(in: CGRect(x: (storlek.width - w) / 2, y: 100, width: w, height: h))
            }
        }
    }
}
