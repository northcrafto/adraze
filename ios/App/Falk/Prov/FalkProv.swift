import Foundation
import UIKit

/// Självtestet `-mode falk`: Falk mot en lokal testserver (`FalkProvserver`, bara 127.0.0.1) med ett låtsat konto.
/// Den riktiga AI-tjänsten anropas aldrig.
///
/// 1. En lokal testsida i en vanlig flik, Falk från menyns plats: välkomsten föreslår sidan.
/// 2. En fråga: samtyckesrutan (iPhone-texten med Qwen och DeepSeek), sedan strömmar svaret in (halvfärdig fetstil utan stjärnor).
/// 3. En fråga om sidan: sidans text följer med till servern och svaret bygger på den.
/// 4. Mörkt läge genom Falk (anpassa-falk:gor), sidomenyn, utloggat läge i mörkt och ljust, avstängt läge.
/// 5. Helskärm med en fråga från appen (`visa(fraga:)`), och att Falk aldrig läser en privat flik.
///
/// Skärmbilder: `NN-namn.png` (appens fönster med webbinnehållet) och `NN-namn-sys.png` (simulatorns egen bild).
///
/// Ägare: Falk.
@MainActor
enum FalkProv {
    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        guard let falk = Falk.delad else { k.kolla("Falk finns", false); return }
        let inst = app.installningar

        // Testservern och kontot
        let server = FalkProvserver()
        let port: UInt16
        do { port = try await server.starta() } catch {
            k.kolla("testservern startar", false, .text(error.localizedDescription))
            return
        }
        let bas = "http://127.0.0.1:\(port)"
        k.kolla("testservern startar på 127.0.0.1", port > 0, ["port": .tal(Double(port))])
        FalkKlient.basOverride = URL(string: bas)
        FalkKlient.session = FalkKlient.gorSession(protokoll: [LokalHTTP.self])
        let forraKonto = app.konto
        let konto = FalkProvkonto()
        app.ersatt(konto: konto)
        let nycklar = ["webb.falkSamtycke", "webb.falkSida", "tema.lage", "falk.av"]
        var forut: [String: JSONVarde] = [:]
        for n in nycklar { if let v = inst.sparat(n) { forut[n] = v } }
        var flikar: [UUID] = []
        defer {
            AdrazeSidor.stang("falk", animerat: false)
            for id in flikar { app.flikar.stang(id) }
            server.stoppa()
            FalkKlient.basOverride = nil
            FalkKlient.session = FalkKlient.gorSession()
            app.ersatt(konto: forraKonto)
            for n in nycklar { inst.satt(n, forut[n], utanHistorik: true) }
        }
        inst.satt("webb.falkSamtycke", nil, utanHistorik: true)   // inget samtycke än: rutan ska visas
        inst.satt("webb.falkSida", nil, utanHistorik: true)
        inst.satt("falk.av", nil, utanHistorik: true)
        inst.satt("tema.lage", .text("ljust"), utanHistorik: true)

        k.lika("krypto:chat hör till Falk", app.brygga.kanaler["krypto:chat"] ?? "", "Falk")
        k.lika("menyns plats Falk", app.platser[Platser.falk]?.titel ?? "", "Falk")

        // 1. Testsidan i en flik och Falk från menyn
        guard let sidUrl = URL(string: bas + "/sida") else { return }
        let flik = app.flikar.nyFlik(sidUrl, privat: false, aktivera: true)
        flikar.append(flik.id)
        await k.vantaPa("testsidan laddad i en vanlig flik", max: 25) { !flik.laddar && flik.url?.path == "/sida" }
        k.notera("flikens_titel", .text(flik.titel))

        app.handelser.skicka(SkalVisa(yta: .plats(Platser.falk)))
        let viaMenyn = await vanta(max: 5) { AdrazeSidor.visad("falk") != nil }
        k.kolla("Falk öppnas från menyns plats (SkalVisa)", viaMenyn)
        if !viaMenyn { falk.visa() }
        guard await k.vantaPa("Falk visas som ark", max: 8, { AdrazeSidor.visad("falk") != nil }), let w = AdrazeSidor.visad("falk") else { return }
        let klar = await w.vantaPaKlar(max: 15)
        k.kolla("Falks sida laddad och klar", klar, ["fel": w.senasteFel.map(JSONVarde.text) ?? .null])
        guard await vantaJS(k, "iPhone-anpassningen körs (falk-ios.js)", w, max: 8,
                            "const s = window.__falkIos; return s ? { klar: !!s.klar, fel: s.fel || null } : null;", { $0["klar"].bool == true }) != nil else { return }
        _ = try await w.kor("return window.__falkIos.nollstall();")
        let hero = await vantaJS(k, "välkomsten föreslår sidan i fliken", w, max: 8, """
            const r = [...document.querySelectorAll('.hero .fi-rad')].map((b) => b.textContent.trim());
            const cs = getComputedStyle(document.querySelector('.hero h1'));
            return { rader: r, rubrik: cs.fontFamily, text: getComputedStyle(document.body).fontFamily, stil: !!document.getElementById('falk-ios-css') };
            """) { ($0["rader"].lista?.count ?? 0) >= 4 && ($0["rader"][0].text ?? "").contains(FalkProvserver.sidtitel) }
        k.kolla("Fraunces i rubriken, Familjen Grotesk i texten", (hero?["rubrik"].text ?? "").contains("AdRaze Display")
                && (hero?["text"].text ?? "").contains("Familjen Grotesk"), hero ?? .null)
        await vantaJS(k, "modellknappen visar bara modellens namn", w, max: 5,
                      "const n = document.querySelector('#fkmodell-knapp .namn'); return n && !document.getElementById('fkmodell').hidden ? n.textContent : null;") { $0.text == "Qwen" }
        let falken = try await w.kor("const r = document.querySelector('.hero .big').getBoundingClientRect(), h = document.querySelector('#main > header').getBoundingClientRect(); return r.top >= h.bottom - 1;")
        k.kolla("välkomsten: falken syns under huvudet", falken.bool == true)
        try await k.vanta(0.5)
        await bild(k, "01-valkomst-ljus", system: true)

        // 2. En fråga: samtycket först, sedan strömmar svaret in
        _ = try await w.kor("return window.__falkIos.fraga('Hur ser jag att ett sms är en bluff?');")
        let ruta = await vantaJS(k, "samtyckesrutan visas och nämner Qwen och DeepSeek", w, max: 6, """
            const el = document.querySelector('.samtycke');
            return el ? { p1: el.querySelector('.p1').textContent, p2: el.querySelector('.p2').textContent, liq: el.querySelector('.ja').classList.contains('liq') } : null;
            """) { ($0["p1"].text ?? "").contains("Qwen") && ($0["p1"].text ?? "").contains("DeepSeek") }
        k.kolla("samtycket: Godkänn fylls som vätska, privata flikar nämns", ruta?["liq"].bool == true && (ruta?["p2"].text ?? "").contains("Privata flikar"))
        k.lika("inget skickat före samtycket", server.fragor.count, 0)
        try await k.vanta(0.3)
        await bild(k, "02-samtycke")
        _ = try await w.kor("document.querySelector('.samtycke .ja').click(); return true;")
        let mitt = await vantaJS(k, "svaret strömmar in medan Falk skriver", w, max: 12, """
            const b = document.querySelector('.msg.typing.fi-strom .bubble');
            return b ? { n: b.textContent.length, text: b.textContent, ord: b.querySelectorAll('.fi-w').length, status: document.getElementById('convtitle').textContent } : null;
            """) { ($0["n"].tal ?? 0) > 40 }
        await bild(k, "03-strommar", system: true)
        // Halvfärdig fetstil visas inte som stjärnor under strömningen (falk-ios.js `halvfardig`; bara visningen)
        let halv = try? await w.kor("""
            const f = window.__falkIos.halvfardig;
            return ['1. **Det', 'bluff:\\n\\n1. **', '**Det brådskar.*', 'x *kursiv*', '```\\nx = a**'].map(f).join('|');
            """)
        k.lika("halvfärdig fetstil stängs under strömningen, kursiv och kod orörda", halv?.text ?? "",
               "1. **Det**|bluff:\n\n1. |**Det brådskar.**|x *kursiv*|```\nx = a**")
        k.kolla("under strömningen syns inga stjärnor", !(mitt?["text"].text ?? "*").contains("*"), mitt ?? .null)
        let svar = await vantaJS(k, "svaret klart, kvar som ett vanligt svar", w, max: 25, """
            if (window.__falkIos.upptagen()) return null;
            const m = [...document.querySelectorAll('.msg.krypto:not(.typing)')].pop();
            return m ? { text: m.querySelector('.bubble').textContent, direkt: m.classList.contains('fi-fran-strom'), n: window.__falkIos.antal() } : null;
            """) { ($0["text"].text ?? "").contains("Det brådskar") }
        k.kolla("svaret skrivs inte fram en gång till efter strömningen", svar?["direkt"].bool == true, svar ?? .null)
        if let a = mitt?["n"].tal, let b = svar?["text"].text {
            k.kolla("texten under strömningen var början på svaret", Int(a) < b.count, ["mitt": .tal(a), "slut": .tal(Double(b.count))])
        }
        k.lika("en fråga till testservern", server.fragor.count, 1)
        let forsta = server.fragor.first ?? .null
        k.kolla("frågan har Falks instruktioner för iPhone", (forsta["messages"][0]["content"].text ?? "").contains("PÅ IPHONE"))
        k.lika("frågan skickas med token", konto.arInloggad, true)
        try await k.vanta(0.5)
        await bild(k, "04-svar-ljus", system: true)

        // 3. En fråga om sidan: sidans text följer med
        _ = try await w.kor("return window.__falkIos.fraga('Vad står det på sidan jag har öppen?');")
        let sidsvar = await vantaJS(k, "Falk svarar om testsidan", w, max: 25, """
            if (window.__falkIos.upptagen()) return null;
            const m = [...document.querySelectorAll('.msg.krypto:not(.typing)')].pop();
            return m ? m.querySelector('.bubble').textContent : null;
            """) { ($0.text ?? "").contains(FalkProvserver.markor) }
        let andra = server.fragor.last ?? .null
        k.kolla("sidans text följde med frågan (AKTUELL FLIK)", server.fragor.count == 2 && andra.jsonText.contains(FalkProvserver.markor)
                && andra.jsonText.contains("AKTUELL FLIK"), ["flik": andra["flik"], "svar": sidsvar ?? .null])
        k.lika("frågan skickades med flik: true", andra["flik"].bool, true)
        let chip = try await w.kor("const c = document.getElementById('pagechip'); return c && !c.hidden ? c.textContent : null;")
        k.kolla("raden ovanför fältet visar sidan som granskas", (chip.text ?? "").contains(FalkProvserver.sidtitel), chip)
        try await k.vanta(0.6)
        await bild(k, "05-fraga-om-sidan")

        // Knapparna: under ett äldre svar syns de, under din fråga visas de när du trycker på den (ingen hovring på telefonen)
        let knappar = try await w.kor("""
            const u = document.querySelector('#log .msg.user'), a = u && u.querySelector('.acts');
            const svar = document.querySelector('#log .msg.krypto:not(.last) .acts');
            if (!a || !svar) return null;
            const vanta = () => new Promise((r) => setTimeout(r, 450));
            const fore = a.getBoundingClientRect().height;
            u.querySelector('.bubble').click(); await vanta();
            const efter = a.getBoundingClientRect().height;
            u.querySelector('.bubble').click(); await vanta();
            return { fore, efter, igen: a.getBoundingClientRect().height, svar: Number(getComputedStyle(svar).opacity) };
            """)
        k.kolla("knapparna under ett äldre svar syns", (knappar["svar"].tal ?? 0) > 0.9, knappar)
        k.kolla("ett tryck på frågan visar dess knappar, ett till döljer dem",
                (knappar["fore"].tal ?? 1) < 1 && (knappar["efter"].tal ?? 0) > 30 && (knappar["igen"].tal ?? 1) < 1, knappar)

        // 4. Mörkt läge genom Falk (som när användaren ber om det)
        let mork = try await app.brygga.anropa("anpassa-falk:gor", [["name": "anpassa", "value": "tema.lage|morkt"]], fran: BryggKalla(yta: "falk"))
        k.kolla("Falk byter till mörkt läge (anpassa-falk:gor)", mork["ok"].bool == true && app.tema.lage == .morkt, mork)
        if app.tema.lage != .morkt { inst.satt("tema.lage", .text("morkt"), utanHistorik: true) }
        await vantaJS(k, "Falk blir mörk", w, max: 4, "return matchMedia('(prefers-color-scheme: dark)').matches;") { $0.bool == true }
        try await k.vanta(0.6)
        await bild(k, "06-svar-mork", system: true)
        _ = try await w.kor("document.getElementById('sidebtn').click(); return true;")
        try await k.vanta(0.8)
        await bild(k, "07-meny-mork")
        _ = try await w.kor("window.closeSide(); return true;")
        try await k.vanta(0.5)

        // Utloggat läge
        await konto.loggaUt()
        await vantaJS(k, "utloggad: inloggningsvyn visas", w, max: 4,
                      "return document.body.classList.contains('fi-last') && !!document.querySelector('#fi-las .fi-logga-in');") { $0.bool == true }
        let meddelanden: JSONVarde = [["role": "user", "content": "hej"]]
        let utan = try await app.brygga.anropa("krypto:chat", [meddelanden, .objekt([:])], fran: BryggKalla(yta: "falk"))
        k.kolla("utloggad: krypto:chat ber om inloggning", utan["needLogin"].bool == true, utan)
        k.kolla("falk:logga-in finns (inloggningen går genom kontot)", app.brygga.kanaler["falk:logga-in"] == "Falk",
                ["konto:visa": .text(app.brygga.kanaler["konto:visa"] ?? "saknas")])
        do {
            _ = try await app.brygga.anropa("krypto:chat", [meddelanden, .objekt([:])], fran: BryggKalla(yta: "anpassa"))
            k.kolla("krypto:chat nekas andra sidor än Falk", false)
        } catch {
            k.kolla("krypto:chat nekas andra sidor än Falk", true, .text(String(describing: error)))
        }
        try await k.vanta(0.5)
        await bild(k, "08-utloggad-mork", system: true)
        inst.satt("tema.lage", .text("ljust"), utanHistorik: true)
        await vantaJS(k, "tillbaka till ljust", w, max: 4, "return !matchMedia('(prefers-color-scheme: dark)').matches;") { $0.bool == true }
        try await k.vanta(0.6)
        await bild(k, "09-utloggad-ljus", system: true)
        konto.loggaIn()
        await vantaJS(k, "inloggad igen: Falk syns", w, max: 4, "return !document.body.classList.contains('fi-last');") { $0.bool == true }

        // Avstängt i Inställningar
        inst.satt("falk.av", .bool(true), utanHistorik: true)
        await vantaJS(k, "avstängd: Falk säger det och pekar på Inställningar", w, max: 4, """
            return document.body.classList.contains('fi-last') ? { h1: document.querySelector('#fi-las h1').textContent, knapp: !!document.querySelector('#fi-las .fi-oppna-inst') } : null;
            """) { ($0["h1"].text ?? "").contains("avstängd") && $0["knapp"].bool == true }
        let av = try await app.brygga.anropa("krypto:chat", [meddelanden, .objekt([:])], fran: BryggKalla(yta: "falk"))
        k.kolla("avstängd: krypto:chat svarar att Falk är av", av["ok"].bool == false && (av["message"].text ?? "").contains("avstängd"), av)
        try await k.vanta(0.5)
        await bild(k, "10-avstangd")
        inst.satt("falk.av", nil, utanHistorik: true)
        await vantaJS(k, "påslagen igen", w, max: 4, "return !document.body.classList.contains('fi-last');") { $0.bool == true }

        // 5. Helskärm med en fråga från appen
        AdrazeSidor.stang("falk", animerat: false)
        await k.vantaPa("Falk stängd", max: 5) { AdrazeSidor.visad("falk") == nil }
        try await k.vanta(0.6)
        let fore = server.fragor.count
        falk.visa(som: .helskarm, fraga: "Vad kan du hjälpa mig med?")
        guard await k.vantaPa("Falk i helskärm", max: 6, { AdrazeSidor.visad("falk") != nil }), let h = AdrazeSidor.visad("falk") else { return }
        _ = await h.vantaPaKlar(max: 15)
        await vantaJS(k, "frågan från appen ställs direkt och besvaras", h, max: 25, """
            if (!window.__falkIos || !window.__falkIos.klar || window.__falkIos.upptagen()) return null;
            const m = [...document.querySelectorAll('.msg.krypto:not(.typing)')].pop();
            return m ? m.querySelector('.bubble').textContent : null;
            """) { ($0.text ?? "").contains("Det brådskar") }
        k.lika("en fråga till efter visa(fraga:)", server.fragor.count, fore + 1)
        k.lika("frågan är den från appen", server.fragor.last?["messages"].lista?.last?["content"].text ?? "", "Vad kan du hjälpa mig med?")
        try await k.vanta(0.6)
        await bild(k, "11-helskarm-ljus", system: true)

        // Välkomsten i mörkt, i helskärm
        inst.satt("tema.lage", .text("morkt"), utanHistorik: true)
        await vantaJS(k, "helskärm: mörkt läge", h, max: 4, "return matchMedia('(prefers-color-scheme: dark)').matches;") { $0.bool == true }
        _ = try await h.kor("return window.__falkIos.nollstall();")
        try await k.vanta(0.9)
        await bild(k, "12-valkomst-mork", system: true)
        inst.satt("tema.lage", .text("ljust"), utanHistorik: true)

        // Privat flik: Falk läser den aldrig
        let privat = app.flikar.nyFlik(sidUrl, privat: true, aktivera: true)
        flikar.append(privat.id)
        await k.vantaPa("privat flik med testsidan", max: 20) { !privat.laddar && privat.url != nil }
        let tab = FalkFlik.tab(app)
        k.kolla("privat flik: Falk granskar inte sidan", tab["av"].bool == true, tab)
        let sidbild = await FalkFlik.sida(app)
        k.kolla("privat flik: ingen sidtext till Falk", sidbild.arNull)
        let styr = await FalkFlik.gor(app, ["name": "scrolla", "value": "ned"])
        k.kolla("privat flik: Falk styr den inte", styr["ok"].bool == false, styr)
        k.notera("fragor_till_testservern", .tal(Double(server.fragor.count)))
    }

    // MARK: - Hjälp

    static func bild(_ k: Labbkorning, _ namn: String, system: Bool = false) async {
        _ = await k.skarmbild(namn)
        if system { await k.systembild(namn + "-sys") }
    }

    /// Väntar utan att det blir en kontroll.
    static func vanta(max sekunder: Double, _ villkor: () -> Bool) async -> Bool {
        let t0 = Date()
        while !villkor() {
            if Date().timeIntervalSince(t0) > sekunder { return false }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return true
    }

    /// Frågar sidan var 150:e ms tills villkoret är sant. Blir en kontroll; ger svaret när det lyckades.
    @discardableResult
    static func vantaJS(_ k: Labbkorning, _ namn: String, _ w: AdrazeSida, max: Double, _ js: String,
                        _ villkor: (JSONVarde) -> Bool) async -> JSONVarde? {
        let t0 = Date()
        var senast: JSONVarde = .null
        var fel: String?
        while Date().timeIntervalSince(t0) < max {
            do {
                let v = try await w.kor(js)
                senast = v
                fel = nil
                if villkor(v) {
                    k.kolla(namn, true, ["s": .tal((Date().timeIntervalSince(t0) * 100).rounded() / 100), "svar": v])
                    return v
                }
            } catch {
                fel = error.localizedDescription
            }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        k.kolla(namn, false, ["senast": senast, "fel": fel.map(JSONVarde.text) ?? .null])
        return nil
    }
}
