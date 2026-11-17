import Foundation
import UIKit
import WebKit

/// Självtestet `-mode skydd`: listorna (kompilerade eller uppslagna, tider, minne), blocktestet med kända
/// annons- och spårningsadresser på en egen testsida (även pausad och på en inloggningssida), kosmetik,
/// kakrutor, scriptlets, vakten, spårningsparametrar, stoppsidan (farlig sida, annons som skickar fliken
/// vidare, mörkt läge, Gå tillbaka, Stäng fliken, Fortsätt ändå) och tider för besluten.
///
/// Testdatan väljs av `verktyg/dnr2wk.py` ur de riktiga listorna (`Regler/prov.json`), så testet följer listorna.
///
/// Startargument: `-skyddRensa 1` tar bort de kompilerade listorna först (mäter kompileringen),
/// `-skyddUppslag 1` kräver att alla listor slogs upp (andra starten).
///
/// Ägare: Skydd.
@MainActor
enum SkyddProv {
    static let testvard = "blocktest.adraze.test"

    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        guard let skydd = app.skydd as? Skydd else {
            k.kolla("Skydd levererar skyddet", false, .text(app.leverantorer["skydd"] ?? "?"))
            return
        }
        k.lika("Skydd levererar skyddet", app.leverantorer["skydd"] ?? "?", "Skydd")
        k.notera("minne_mb_start", .tal(avrunda(Labbkorning.minneMB())))
        guard let prov = lasProv(skydd) else {
            k.kolla("Regler/prov.json går att läsa", false)
            return
        }

        try await listorna(k, skydd)
        guard case .klart = skydd.lage else { return }
        enhetsprov(k, skydd, prov)
        try await brygga(k, skydd)

        let flik = app.flikar.nyFlik(nil, privat: false, aktivera: true)
        try await blocktest(k, skydd, flik, prov)
        try await kosmetik(k, skydd, flik, prov)
        try await parameterNavigering(k, skydd, flik, prov)
        try await stoppsidan(k, skydd, flik, prov)
        try await initiativ(k, skydd, flik, prov)
        try await stangFliken(k, skydd, prov)

        let b = skydd.beslutMs
        let s = skydd.byggMs
        k.notera("beslut_ms", ["antal": .tal(Double(b.count)), "snitt": .tal(avrunda(snitt(b), 3)), "max": .tal(avrunda(b.max() ?? 0, 3))])
        k.notera("skriptbygge_ms", ["antal": .tal(Double(s.count)), "snitt": .tal(avrunda(snitt(s), 2)), "max": .tal(avrunda(s.max() ?? 0, 2))])
        k.notera("sajthinkar_i_minnet", .tal(Double(skydd.data.hinkarIMinnet)))
        k.notera("minne_mb_slut", .tal(avrunda(Labbkorning.minneMB())))
        await sammanfattning(k, flik)
    }

    // MARK: - Listorna

    static func listorna(_ k: Labbkorning, _ skydd: Skydd) async throws {
        let t0 = Date()
        let lageVidStart = skydd.lage
        let statusVidStart = (try? await k.app.brygga.anropa("skydd:status", [], fran: BryggKalla(yta: "labb")))?.text ?? "?"
        let klar = await k.vantaPa("listorna klara", max: 420) {
            switch skydd.lage {
            case .klart, .fel, .av: return true
            case .laddar: return false
            }
        }
        k.notera("lage", .text(skydd.lage.etikett))
        k.notera("listor", .lista(skydd.listor.matningar.map(\.json)))
        k.notera("listor_totalt_ms", .tal(avrunda(skydd.listor.totalMs)))
        if let m = skydd.listor.stoppMatning { k.notera("stopplistan", m.json) }
        k.notera("listor_vantat_s", .tal(avrunda(Date().timeIntervalSince(t0), 2)))
        k.notera("listor_borttagna", .lista(skydd.listor.borttagna.map(JSONVarde.text)))
        k.notera("minne_mb_efter_listor", .tal(avrunda(Labbkorning.minneMB())))
        guard klar else { return }
        let felen = skydd.listor.matningar.filter { $0.fel != nil }
        k.kolla("alla listor laddades", felen.isEmpty && skydd.listor.klara.count == skydd.data.listor.count,
                .lista(felen.map { .text("\($0.namn): \($0.fel ?? "")") }))
        k.kolla("stopplistan (annonser som skickar fliken vidare) är klar", skydd.listor.stopp != nil,
                skydd.listor.stoppMatning?.json ?? .null)
        let overGrans = skydd.data.listor.filter { $0.regler > 150_000 }
        k.kolla("varje lista under WebKits gräns (150 000 regler)", overGrans.isEmpty,
                .objekt(Dictionary(uniqueKeysWithValues: skydd.data.listor.map { ($0.namn, JSONVarde.tal(Double($0.regler))) })))
        let kallor = Set(skydd.listor.matningar.map(\.kalla))
        if k.app.startargument.tal("skyddRensa") == 1 {
            k.kolla("listorna kompilerades (-skyddRensa 1)", kallor == ["kompilerad"], .lista(kallor.sorted().map(JSONVarde.text)))
            var laddar = false
            if case .laddar = lageVidStart { laddar = true }
            k.kolla("\"Skyddet laddas\" under kompileringen (Skyddslage och skydd:status)", laddar && statusVidStart == "Skyddet laddas",
                    .text(statusVidStart))
        }
        if k.app.startargument.tal("skyddUppslag") == 1 {
            let langsamma = skydd.listor.matningar.filter { $0.ms > 250 }
            k.kolla("andra starten: alla listor slogs upp", kallor == ["uppslagen"], .lista(kallor.sorted().map(JSONVarde.text)))
            k.kolla("andra starten: varje uppslag under 250 ms", langsamma.isEmpty,
                    .lista(skydd.listor.matningar.map { .text("\($0.namn) \(Int($0.ms.rounded())) ms") }))
        }
    }

    // MARK: - Utan webbvy

    static func enhetsprov(_ k: Labbkorning, _ skydd: Skydd, _ prov: JSONVarde) {
        // Paus per sajt
        let fore = k.app.installningar[Nycklar.skyddPausade]
        skydd.pausa(true, for: "www.Exempel-Paus.se")
        let a = skydd.arPausat(for: "exempel-paus.se"), b = skydd.arPausat(for: "sub.exempel-paus.se"), c = skydd.arPausat(for: "annan.se")
        skydd.pausa(false, for: "sub.exempel-paus.se")
        let d = skydd.arPausat(for: "exempel-paus.se")
        k.app.installningar[Nycklar.skyddPausade] = fore
        k.kolla("paus per sajt: www. räknas bort, gäller underdomäner, går att slå av", a && b && !c && !d,
                ["pausad": .bool(a), "underdomän": .bool(b), "annan": .bool(c), "efter_av": .bool(d)])

        // Spårningsparametrar i huvudsidans adress
        let p = prov["parameter"]
        if let f = p["fore"].text, let e = p["efter"].text, let fu = URL(string: f) {
            let ren = skydd.data.utanParametrar(fu, kalla: nil)
            k.lika("spårningsparametern tas bort", ren?.absoluteString ?? "(oförändrad)", e)
            let utan = URL(string: e).flatMap { skydd.data.utanParametrar($0, kalla: nil) }
            k.kolla("adress utan parametern lämnas som den är", utan == nil)
        }
        k.lika("regel med initiator gäller inte från adressfältet",
               skydd.data.utanParametrar(URL(string: "https://htlb.casalemedia.com/x?r=1&a=2")!, kalla: nil)?.absoluteString ?? "(oförändrad)", "(oförändrad)")
        k.lika("regel med initiator gäller från sajten",
               skydd.data.utanParametrar(URL(string: "https://htlb.casalemedia.com/x?r=1&a=2")!, kalla: "aternos.org")?.absoluteString ?? "(oförändrad)",
               "https://htlb.casalemedia.com/x?a=2")

        // Tillåtlistan (datorns ADBLOCK_ALLOW och ADBLOCK_ALLOW_PATH)
        let tillat = ["https://accounts.google.com/", "https://checkout.stripe.com/pay", "https://www.google.com/signin/v2"]
            .allSatisfy { skydd.data.arTillat(URL(string: $0)!) }
        let inte = ["https://www.google.com/search?q=x", "https://example.com/"].allSatisfy { !skydd.data.arTillat(URL(string: $0)!) }
        k.kolla("inloggning och betalning känns igen (som datorn)", tillat && inte)

        // Skripten för en sajt
        if let sv = prov["scriptlet"]["vard"].text {
            let delar = Skriptbygge.delar(for: sv, data: skydd.data, element: .objekt([:]), egna: "")
            k.kolla("skript för \(sv): vakten, scriptlets, kosmetik och kakrutor", delar.count >= 4 && delar.contains { $0.kalla.contains("setConstant") },
                    ["antal": .tal(Double(delar.count)), "byte": .tal(Double(delar.reduce(0) { $0 + $1.kalla.utf8.count }))])
        }
        k.kolla("annonsvärdarna (initiativ) är laddade", skydd.data.initiativLaddad && !skydd.data.initiativ.isEmpty,
                .tal(Double(skydd.data.initiativ.count)))
    }

    static func brygga(_ k: Labbkorning, _ skydd: Skydd) async throws {
        let svar = try await k.app.brygga.anropa("skydd:status", [], fran: BryggKalla(yta: "labb"))
        k.lika("bryggkanalen skydd:status", svar, .text(skydd.lage.etikett))
    }

    // MARK: - Blocktestet

    struct Mal {
        let typ: String
        let satt: String
        let url: String
        let vantat: String
    }

    static func blocktest(_ k: Labbkorning, _ skydd: Skydd, _ flik: any Flik, _ prov: JSONVarde) async throws {
        let mal = (prov["blocktest"]["mal"].lista ?? []).compactMap { m -> Mal? in
            guard let t = m["typ"].text, let s = m["satt"].text, let u = m["url"].text, let v = m["vantat"].text else { return nil }
            return Mal(typ: t, satt: s, url: u, vantat: v)
        }
        guard !mal.isEmpty else {
            k.kolla("blocktestets mål finns", false)
            return
        }
        let bas = "https://\(testvard)/"

        // A: skyddad
        guard let a = await korBlocksida(k, flik, mal, bas: bas, rubrik: "Blocktest", allaNas: false) else { return }
        k.notera("blocktest_skript_i_vyn", .tal(Double(skydd.antalSkript(i: flik.webbvy))))
        await k.skarmbild("blocktest")

        // B: samma sida med sajten pausad (bara listan "sidor")
        let fore = k.app.installningar[Nycklar.skyddPausade]
        skydd.pausa(true, for: testvard)
        let b = await korBlocksida(k, flik, mal, bas: bas, rubrik: "Blocktest, sajten pausad", allaNas: true)
        let skriptPausad = skydd.antalSkript(i: flik.webbvy)
        k.app.installningar[Nycklar.skyddPausade] = fore
        guard let b else { return }

        // C: inloggningssida (datorns ADBLOCK_ALLOW): inget blockeras på sidan
        let inloggMal = mal.filter { $0.typ == "reklam" || $0.typ == "spårare" }
        let c = await korBlocksida(k, flik, inloggMal, bas: "https://accounts.google.com/", rubrik: "Blocktest på en inloggningssida",
                                   allaNas: true) ?? [:]

        var rader: [JSONVarde] = []
        var reklamBlockerad = 0, reklamNadd: [String] = [], kontrollNadd = 0, kontrollBlockerad: [String] = []
        var obestamda: [String] = [], pausSlapper = 0, inloggBlockerad: [String] = [], inloggNadd = 0
        for m in mal {
            let ra = a[m.url] ?? "?", rb = b[m.url] ?? "?"
            rader.append(["typ": .text(m.typ), "url": .text(m.url), "skyddad": .text(ra), "pausad": .text(rb), "vantat": .text(m.vantat)])
            guard rb == "nadd" else {
                obestamda.append(m.url)
                continue
            }
            let blockerad = ra != "nadd"
            if m.typ == "reklam" || m.typ == "spårare" {
                if blockerad { reklamBlockerad += 1; pausSlapper += 1 } else { reklamNadd.append(m.url) }
                if let rc = c[m.url] { if rc == "nadd" { inloggNadd += 1 } else { inloggBlockerad.append(m.url) } }
            } else {
                if blockerad { kontrollBlockerad.append(m.url) } else { kontrollNadd += 1 }
            }
        }
        k.notera("blocktest", .lista(rader))
        k.notera("blocktest_obestamda", .lista(obestamda.map(JSONVarde.text)))
        k.kolla("reklam och spårare blockeras (\(reklamBlockerad) av \(reklamBlockerad + reklamNadd.count))",
                reklamNadd.isEmpty && reklamBlockerad >= 6, .lista(reklamNadd.map(JSONVarde.text)))
        k.kolla("vanliga sidor och inloggningstjänster nås (\(kontrollNadd))", kontrollBlockerad.isEmpty && kontrollNadd >= 3,
                .lista(kontrollBlockerad.map(JSONVarde.text)))
        k.kolla("pausad sajt: det som annars blockeras släpps igenom, inga skript", pausSlapper == reklamBlockerad && pausSlapper > 0 && skriptPausad == 0,
                ["slapps": .tal(Double(pausSlapper)), "skript": .tal(Double(skriptPausad))])
        k.kolla("inloggningssida: reklamadresserna blockeras inte där (\(inloggNadd))", inloggBlockerad.isEmpty && inloggNadd > 0,
                .lista(inloggBlockerad.map(JSONVarde.text)))
        k.kolla("högst två mål gick inte att avgöra (nätet)", obestamda.count <= 2, .lista(obestamda.map(JSONVarde.text)))
    }

    /// Laddar testsidan och väntar på resultatet: url -> "nadd", "fel" eller "tidsgrans".
    static func korBlocksida(_ k: Labbkorning, _ flik: any Flik, _ mal: [Mal], bas: String, rubrik: String,
                             allaNas: Bool) async -> [String: String]? {
        guard await laddaHTML(k.app, flik, blocksida(mal, rubrik: rubrik, allaNas: allaNas), bas: bas) else {
            k.kolla("\(rubrik): sidan laddades", false)
            return nil
        }
        var res: [String: String]?
        let t0 = Date()
        while Date().timeIntervalSince(t0) < 40 {
            if let s = await js(flik.webbvy, "JSON.stringify(window.__prov || null)") as? String, s != "null",
               let d = try? JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: String] {
                res = d
                break
            }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        k.kolla("\(rubrik): alla mål svarade", res != nil)
        return res
    }

    /// Testsidan: laddar varje adress på sitt sätt och visar utfallet mot det väntade (grönt = som väntat).
    /// Svaret hamnar i `window.__prov` (url -> "nadd", "fel" eller "tidsgrans").
    static func blocksida(_ mal: [Mal], rubrik: String, allaNas: Bool) -> String {
        let lista = Skriptbygge.json(mal.map { ["url": $0.url, "satt": $0.satt, "typ": $0.typ,
                                                "v": allaNas ? "nadd" : ($0.vantat == "blockerad" ? "fel" : "nadd")] })
        return """
        <!doctype html><html lang="sv"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1"><title>\(rubrik)</title>
        <style>
        body{font:13px/1.3 -apple-system,system-ui,sans-serif;margin:0;padding:18px 14px;background:#f2f2ef;color:#111113}
        h1{font-size:21px;margin:0 0 4px;letter-spacing:-.01em}#sum{margin:0 0 10px;color:#5c5c63}
        ol{list-style:none;padding:0;margin:0}li{display:flex;gap:8px;align-items:baseline;padding:2px 0;border-bottom:1px solid #e3e3dd;white-space:nowrap}
        b{flex:none;width:58px;font-weight:650}i{flex:none;width:62px;font-style:normal;color:#5c5c63;font-size:11.5px}
        span{overflow:hidden;text-overflow:ellipsis}.ok b{color:#1a7f37}.fel b{color:#c4320a}.vantar b{color:#8b8b94}
        </style></head>
        <body><h1>\(rubrik)</h1><p id="sum">Laddar \(mal.count) adresser …</p><ol id="l"></ol>
        <script>
        (function () {
          var M = \(lista), res = {}, kvar = M.length, rader = [];
          window.__prov = null;
          var ol = document.getElementById("l");
          M.forEach(function (m, n) {
            var li = document.createElement("li");
            li.className = "vantar";
            li.innerHTML = "<b>…</b><i></i><span></span>";
            li.childNodes[1].textContent = m.typ;
            li.childNodes[2].textContent = m.url.replace(/^https:\\/\\//, "");
            ol.appendChild(li);
            rader[n] = li;
          });
          function klar(n, r) {
            var m = M[n];
            if (m.url in res) return;
            res[m.url] = r;
            var li = rader[n];
            li.className = r === m.v ? "ok" : "fel";
            li.firstChild.textContent = r === "nadd" ? "nådd" : r === "fel" ? "stoppad" : "tidsgräns";
            if (--kvar === 0) {
              var st = 0, na = 0, ok = 0;
              M.forEach(function (x) { if (res[x.url] === "fel") st++; else if (res[x.url] === "nadd") na++; if (res[x.url] === x.v) ok++; });
              document.getElementById("sum").textContent = st + " stoppade, " + na + " nådda, " + ok + " av " + M.length + " som väntat";
              window.__prov = res;
            }
          }
          M.forEach(function (m, n) {
            var t = setTimeout(function () { klar(n, "tidsgrans"); }, 15000);
            var f = function (r) { clearTimeout(t); klar(n, r); };
            try {
              if (m.satt === "skript") {
                var l = document.createElement("link");
                l.rel = "preload"; l.as = "script"; l.href = m.url;
                l.onload = function () { f("nadd"); }; l.onerror = function () { f("fel"); };
                document.head.appendChild(l);
              } else if (m.satt === "bild") {
                var i = new Image();
                i.onload = function () { f("nadd"); }; i.onerror = function () { f("fel"); };
                i.src = m.url;
              } else {
                fetch(m.url, { mode: "no-cors", cache: "no-store", credentials: "omit" }).then(function () { f("nadd"); }, function () { f("fel"); });
              }
            } catch (e) { f("fel"); }
          });
        })();
        </script></body></html>
        """
    }

    // MARK: - Kosmetik, kakrutor, scriptlets och vakten

    static func kosmetik(_ k: Labbkorning, _ skydd: Skydd, _ flik: any Flik, _ prov: JSONVarde) async throws {
        let ko = prov["kosmetik"]
        let generiska = ko["generiska"].lista?.compactMap(\.text) ?? []
        let kakor = ko["kakor"].lista?.compactMap(\.text) ?? []
        guard let sajt = ko["sajt"]["vard"].text, let gh = ko["utanGeneriska"].text else {
            k.kolla("kosmetikens testdata finns", false)
            return
        }
        let specifika = ko["sajt"]["selektorer"].lista?.compactMap(\.text) ?? []
        let kontroll = ".adraze-kontroll"

        // Sajt med egna regler: generiska och specifika döljs, kakrutor döljs, vakten fångar window.open
        let alla = generiska + specifika + kakor + [kontroll]
        let html = sida(alla, rubrik: "Kosmetik på \(sajt)", extra: """
        <script>
        window.__sl0 = typeof window.showAds;
        try { var w = window.open("https://example.org/adraze-vakt", "_blank");
          window.__vakt = w === null ? "null" : (w && w.closed === false ? "attrapp" : "annat:" + typeof w); }
        catch (e) { window.__vakt = "fel:" + e.message; }
        </script>
        """)
        guard await laddaHTML(k.app, flik, html, bas: "https://\(sajt)/") else {
            k.kolla("kosmetiksidan laddades", false)
            return
        }
        try? await k.vanta(0.4)
        let d = await display(flik, alla)
        let doldaGen = generiska.filter { d[$0] == "none" }
        let doldaSpec = specifika.filter { d[$0] == "none" }
        let doldaKak = kakor.filter { d[$0] == "none" }
        k.kolla("generiska dölj-regler (listan kosmetik): \(doldaGen.count) av \(generiska.count)", doldaGen.count == generiska.count && !generiska.isEmpty,
                .objekt(d.mapValues(JSONVarde.text)))
        k.kolla("sajtens egna dölj-regler (\(sajt)): \(doldaSpec.count) av \(specifika.count)", doldaSpec.count == specifika.count && !specifika.isEmpty)
        k.kolla("kakrutor döljs (listan kakor): \(doldaKak.count) av \(kakor.count)", doldaKak.count == kakor.count && !kakor.isEmpty)
        k.kolla("vanliga element syns", d[kontroll] == "block")
        let vakt = await js(flik.webbvy, "String(window.__vakt)") as? String
        k.lika("vakten ger ett attrapp-fönster för window.open utan klick", vakt ?? "?", "attrapp")
        let sl0 = await js(flik.webbvy, "String(window.__sl0)") as? String
        k.lika("ingen scriptlet på en sajt utan regler", sl0 ?? "?", "undefined")
        // Utfallet på sidan (testelementen som döljs syns inte, så de listas)
        var rader = ""
        for (sel, sort) in generiska.map({ ($0, "generisk") }) + specifika.map({ ($0, "sajtens") }) + kakor.map({ ($0, "kakruta") })
            + [(kontroll, "vanlig")] {
            let dold = d[sel] == "none"
            let ok = sel == kontroll ? !dold : dold
            rader += "<li class=\"\(ok ? "ok" : "fel")\"><b>\(dold ? "dold" : "syns")</b><i>\(sort)</i><span>\(Stoppsida.esc(sel))</span></li>"
        }
        rader += "<li class=\"\(vakt == "attrapp" ? "ok" : "fel")\"><b>\(Stoppsida.esc(vakt ?? "?"))</b><i>vakten</i><span>window.open utan klick</span></li>"
        _ = await js(flik.webbvy, "document.getElementById('utfall').innerHTML = \(Skriptbygge.json(rader)); true")
        await k.skarmbild("kosmetik")

        // Sajt med undantag för generiska regler (#@#-undantag för allt): generiska syns
        if let g0 = generiska.first {
            guard await laddaHTML(k.app, flik, sida([g0, kontroll]), bas: "https://\(gh)/") else { return }
            try? await k.vanta(0.3)
            let d2 = await display(flik, [g0])
            k.kolla("sajt utan generiska regler (\(gh)): \(g0) syns", d2[g0] == "block", .objekt(d2.mapValues(JSONVarde.text)))
        }

        // :style-regel
        let st = ko["stil"]
        if let sv = st["vard"].text, let sel = st["selektor"].text, let varde = st["varde"].text {
            guard await laddaHTML(k.app, flik, sida([sel], rubrik: "Stilregel på \(sv)", stil: "height:300px"), bas: "https://\(sv)/") else { return }
            try? await k.vanta(0.3)
            let h = await js(flik.webbvy, "(function(){ var e = document.querySelector(\(Skriptbygge.json(sel))); return e ? getComputedStyle(e).height : 'saknas'; })()") as? String
            k.lika("stilregel på \(sv) (\(sel))", h ?? "?", varde)
        }

        // Scriptlet (set-constant)
        let sc = prov["scriptlet"]
        if let sv = sc["vard"].text, let eg = sc["egenskap"].text, let v = sc["varde"].bool {
            let html = sida([], extra: "<script>window.__sl = typeof window[\(Skriptbygge.json(eg))] + ':' + String(window[\(Skriptbygge.json(eg))]);</script>")
            guard await laddaHTML(k.app, flik, html, bas: "https://\(sv)/") else { return }
            let r = await js(flik.webbvy, "String(window.__sl)") as? String
            k.lika("scriptlet set-constant på \(sv) (\(eg))", r ?? "?", "boolean:\(v)")
        }

        // YouTube-skriptet (bara på youtube.com) döljer videon medan en reklam spolas förbi. Att reklamen faktiskt
        // hoppas över går inte att prova här (planen: för hand).
        let spelare = "<div id=\"movie_player\" class=\"ad-showing\"><video id=\"v\" width=\"160\" height=\"90\"></video></div>"
        for (vard, vantat) in [("www.youtube.com", "0"), (testvard, "1")] {
            guard await laddaHTML(k.app, flik, sida([], rubrik: "YouTube-skriptet på \(vard)", extra: spelare), bas: "https://\(vard)/") else { return }
            try? await k.vanta(0.2)
            let o = await js(flik.webbvy, "getComputedStyle(document.getElementById('v')).opacity") as? String
            k.lika(vard == testvard ? "YouTube-skriptet körs inte på andra sajter" : "YouTube-skriptet döljer reklamvideon på youtube.com",
                   o ?? "?", vantat)
        }
    }

    /// En sida med ett element per selektor (`#id` eller `.klass`) och en lista för utfallet.
    static func sida(_ selektorer: [String], rubrik: String = "Kosmetik", stil: String = "", extra: String = "") -> String {
        var kropp = ""
        for s in selektorer {
            let namn = String(s.dropFirst())
            let attr = s.hasPrefix("#") ? "id=\"\(namn)\"" : "class=\"\(namn)\""
            kropp += "<div \(attr) style=\"\(stil)\">\(Stoppsida.esc(s))</div>\n"
        }
        return """
        <!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>\(Stoppsida.esc(rubrik))</title><style>
        body{font:13px/1.3 -apple-system,system-ui,sans-serif;margin:0;padding:18px 14px;background:#f2f2ef;color:#111113}
        h1{font-size:21px;margin:0 0 10px;letter-spacing:-.01em}
        #prov>div{border:1.5px dashed #c4320a;border-radius:8px;padding:8px 10px;margin:0 0 6px;background:#fff}
        #prov>div.adraze-kontroll{border:1.5px solid #1a7f37}
        ol{list-style:none;padding:0;margin:12px 0 0}li{display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid #e3e3dd;white-space:nowrap}
        b{flex:none;width:58px;font-weight:650}i{flex:none;width:68px;font-style:normal;color:#5c5c63;font-size:11.5px}
        span{overflow:hidden;text-overflow:ellipsis}.ok b{color:#1a7f37}.fel b{color:#c4320a}
        </style></head>
        <body><h1>\(Stoppsida.esc(rubrik))</h1>
        <div id="prov">
        \(kropp)</div><ol id="utfall"></ol>\(extra)
        </body></html>
        """
    }

    static func display(_ flik: any Flik, _ selektorer: [String]) async -> [String: String] {
        let kod = "(function(){ var s = {}; \(Skriptbygge.json(selektorer)).forEach(function (x) { var e = document.querySelector(x); s[x] = e ? getComputedStyle(e).display : 'saknas'; }); return JSON.stringify(s); })()"
        guard let t = await js(flik.webbvy, kod) as? String,
              let d = try? JSONSerialization.jsonObject(with: Data(t.utf8)) as? [String: String] else { return [:] }
        return d
    }

    // MARK: - Spårningsparametrar genom Flikar

    static func parameterNavigering(_ k: Labbkorning, _ skydd: Skydd, _ flik: any Flik, _ prov: JSONVarde) async throws {
        guard let f = prov["parameter"]["fore"].text, let e = prov["parameter"]["efter"].text, let fu = URL(string: f) else { return }
        let start = skydd.beslutslogg.count
        flik.ladda(fu)
        let ok = await vanta(15) { skydd.beslutslogg.dropFirst(start).contains { $0.url == e } }
        flik.stoppa()
        k.kolla("huvudsidan laddas om utan spårningsparametern", ok,
                .lista(skydd.beslutslogg.dropFirst(start).map { .text("\($0.vad): \($0.url)") }))
        try? await k.vanta(0.5)
    }

    // MARK: - Stoppsidan

    static func stoppsidan(_ k: Labbkorning, _ skydd: Skydd, _ flik: any Flik, _ prov: JSONVarde) async throws {
        guard let farlig = prov["stoppsida"]["farlig"].text, let snabb = prov["stoppsida"]["snabbkoll"].text else {
            k.kolla("stoppsidans testdata finns", false)
            return
        }
        // En vanlig sida först, så att fliken har historik (sidorna från loadHTMLString hamnar inte i WebKits
        // historik)
        let forsta = URL(string: "https://example.org/")!
        var laddad = false
        let pl = k.app.handelser.lyssna(SidaLaddad.self) { h in if h.flik == flik.id, h.url.host() == forsta.host() { laddad = true } }
        flik.ladda(forsta)
        _ = await vanta(25) { laddad }
        pl.avsluta()
        k.kolla("en vanlig sida laddades före stoppsidan (\(forsta.host() ?? ""))", laddad,
                ["historik": .tal(Double(flik.webbvy.backForwardList.backList.count + (flik.webbvy.backForwardList.currentItem == nil ? 0 : 1)))])
        let fore = flik.url
        // Farlig sida i en flik med historik
        let adress = URL(string: "https://\(farlig)/")!
        guard let h = await vantaPaStopp(k, flik, adress: adress, namn: "farlig sida (\(farlig))", { flik.ladda(adress) }) else { return }
        k.kolla("WebKit stoppade sidan (fel 104)", flik.fel?.blockeradAvSkyddet == true || h.url == adress)
        let rubrik = await js(flik.webbvy, "document.querySelector('h1') ? document.querySelector('h1').textContent : ''") as? String
        k.lika("stoppsidans rubrik", rubrik ?? "?", "AdRaze stoppade sidan")
        let visad = await js(flik.webbvy, "document.getElementById('url').textContent") as? String
        k.lika("stoppsidan visar adressen", visad ?? "?", adress.absoluteString)
        let knapp = await js(flik.webbvy, "document.getElementById('tillbaka').textContent") as? String
        k.lika("knappen säger Gå tillbaka (fliken har historik)", knapp ?? "?", "Gå tillbaka")
        let typsnitt = await js(flik.webbvy, "document.fonts.check('34px \"AdRaze Display\"') + ':' + document.fonts.check('17px \"Familjen Grotesk\"')") as? String
        k.lika("stoppsidans typsnitt laddade", typsnitt ?? "?", "true:true")
        try? await k.vanta(0.6)
        await k.skarmbild("stoppsida")

        // Mörkt läge (appens tema)
        let lage = k.app.installningar[.temaLage]
        k.app.installningar[.temaLage] = .morkt
        try? await k.vanta(1.2)
        let bg = await js(flik.webbvy, "getComputedStyle(document.body).backgroundColor") as? String
        k.lika("stoppsidan följer mörkt läge", bg ?? "?", "rgb(12, 12, 14)")
        await k.skarmbild("stoppsida-mork")
        k.app.installningar[.temaLage] = lage
        try? await k.vanta(0.6)

        // Gå tillbaka
        _ = await js(flik.webbvy, "document.getElementById('tillbaka').click(); true")
        let tillbaka = await vanta(10) { flik.url != nil && flik.url?.host() == fore?.host() && !flik.laddar }
        k.kolla("Gå tillbaka visar sidan före", tillbaka, .text(flik.url?.absoluteString ?? "nil"))

        // Fortsätt ändå: snabbkollens farliga värd släpps igenom, en annan farlig värd stoppas fortfarande
        let farlig2 = URL(string: "https://\(snabb)/")!
        guard await vantaPaStopp(k, flik, adress: farlig2, namn: "snabbkollens värd (\(snabb))", { flik.ladda(farlig2) }) != nil else { return }
        let start = skydd.beslutslogg.count
        var stoppadIgen = false
        let p = k.app.handelser.lyssna(HuvudsidaBlockerad.self) { h in if h.url.host() == farlig2.host() { stoppadIgen = true } }
        _ = await js(flik.webbvy, "document.getElementById('fortsatt').click(); true")
        let slapptes = await vanta(15) { skydd.beslutslogg.dropFirst(start).contains { $0.url == farlig2.absoluteString && $0.vad == "fortsätt" } }
        _ = await vanta(15) { !flik.laddar }
        try? await k.vanta(0.5)
        p.avsluta()
        k.kolla("Fortsätt ändå släpper igenom sajten (resten av sessionen)", slapptes && !stoppadIgen && skydd.fortsatt.contains(snabb),
                ["fel": .text(flik.fel.map { "\($0.doman) \($0.kod)" } ?? "inget"),
                 "beslut": .lista(skydd.beslutslogg.dropFirst(start).map { .text("\($0.vad): \($0.url)") })])
        let annan = prov["stoppsida"]["snabbkollAndra"].text ?? "bank-verifiering.se"
        if let u = URL(string: "https://\(annan)/") {
            let h3 = await vantaPaStopp(k, flik, adress: u, namn: "nästa farliga värd efter Fortsätt ändå (\(annan))", { flik.ladda(u) })
            k.kolla("listan sidor läggs tillbaka i tid för nästa sida", h3 != nil)
        }
    }

    /// Kör `gor` och väntar på att skyddet visar stoppsidan för `adress`.
    @discardableResult
    static func vantaPaStopp(_ k: Labbkorning, _ flik: any Flik, adress: URL, namn: String, _ gor: () -> Void) async -> HuvudsidaBlockerad? {
        var h: HuvudsidaBlockerad?
        let p = k.app.handelser.lyssna(HuvudsidaBlockerad.self) { x in if x.flik == flik.id { h = x } }
        gor()
        let stoppad = await vanta(20) { h != nil }
        p.avsluta()
        guard stoppad, let h else {
            k.kolla("stoppsidan: \(namn)", false, ["fel": .text(flik.fel.map { "\($0.doman) \($0.kod) \($0.text)" } ?? "inget")])
            return nil
        }
        let t0 = Date()
        var titel = ""
        while Date().timeIntervalSince(t0) < 10 {
            titel = (await js(flik.webbvy, "document.title") as? String) ?? ""
            if titel == "Stoppad av AdRaze" { break }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        k.kolla("stoppsidan: \(namn)", titel == "Stoppad av AdRaze" && h.url == adress,
                ["url": .text(h.url.absoluteString), "titel": .text(titel)])
        try? await Task.sleep(nanoseconds: 300_000_000)
        return h
    }

    // MARK: - Annonsvärd som skickar fliken vidare

    static func initiativ(_ k: Labbkorning, _ skydd: Skydd, _ flik: any Flik, _ prov: JSONVarde) async throws {
        guard let ini = prov["initiativ"].text else { return }
        let mal = URL(string: "https://example.org/adraze-landning")!
        let html = sida([], rubrik: "Annonssida på \(ini)", extra: "<script>setTimeout(function () { location.href = \(Skriptbygge.json(mal.absoluteString)); }, 150);</script>")
        let fore = skydd.beslutslogg.count
        let h = await vantaPaStopp(k, flik, adress: mal, namn: "annons på \(ini) skickar fliken till example.org", {
            flik.webbvy.loadHTMLString(html, baseURL: URL(string: "https://\(ini)/"))
        })
        guard h != nil else { return }
        let text = await js(flik.webbvy, "document.querySelector('p').textContent") as? String
        k.kolla("stoppsidan säger att en annons skickade fliken", text?.hasPrefix("En annons på sidan") == true, .text(text ?? ""))
        // WebKit stoppade själva adressen (stopplistan), så Flikar har den riktiga adressen (adressfältet och
        // felet). Stubbens flik nollar felet när stoppsidan visas; Flikars flik behåller det med felets adress.
        let besluten = skydd.beslutslogg.dropFirst(fore)
        let stoppad = besluten.contains { $0.url == mal.absoluteString && $0.vad.hasPrefix("stoppad:") }
        let omvag = besluten.contains { $0.url.contains(Skydd.egenVard) }
        let felAdress = flik.fel?.url
        k.kolla("stopplistan stoppade adressen själv (ingen omväg via \(Skydd.egenVard))",
                stoppad && !omvag && (felAdress == nil || felAdress == mal),
                ["beslut": .lista(besluten.map { .text("\($0.vad): \($0.url)") }), "fel_url": .text(felAdress?.absoluteString ?? "inget")])
        k.kolla("stopplistan togs bort ur fliken efter stoppet", !skydd.harStopplistan(flik.webbvy))
        await k.skarmbild("stoppsida-annons")
        // Samma navigering från en vanlig sida stoppas inte
        let start = skydd.beslutslogg.count
        let html2 = sida([], rubrik: "Vanlig sida", extra: "<script>setTimeout(function () { location.href = \(Skriptbygge.json(mal.absoluteString)); }, 150);</script>")
        flik.webbvy.loadHTMLString(html2, baseURL: URL(string: "https://\(testvard)/"))
        let ok = await vanta(15) { skydd.beslutslogg.dropFirst(start).contains { $0.url == mal.absoluteString } }
        flik.stoppa()
        let vad = skydd.beslutslogg.dropFirst(start).first { $0.url == mal.absoluteString }?.vad ?? "inget beslut"
        k.kolla("samma navigering från en vanlig sida släpps igenom", ok && vad == "skyddad", .text(vad))
    }

    /// Stoppsidan i en ny flik utan historik: knappen stänger fliken.
    static func stangFliken(_ k: Labbkorning, _ skydd: Skydd, _ prov: JSONVarde) async throws {
        guard let farlig = prov["stoppsida"]["farlig"].text else { return }
        let fore = k.app.flikar.flikar.count
        let ny = k.app.flikar.nyFlik(nil, privat: true, aktivera: true)
        let adress = URL(string: "https://\(farlig)/privat")!
        guard await vantaPaStopp(k, ny, adress: adress, namn: "farlig sida i en ny privat flik", { ny.ladda(adress) }) != nil else { return }
        let knapp = await js(ny.webbvy, "document.getElementById('tillbaka').textContent") as? String
        k.lika("knappen säger Stäng fliken (ingen historik)", knapp ?? "?", "Stäng fliken")
        let id = ny.id
        _ = await js(ny.webbvy, "document.getElementById('tillbaka').click(); true")
        let stangd = await vanta(8) { !k.app.flikar.flikar.contains { $0.id == id } }
        k.kolla("Stäng fliken stänger fliken", stangd, ["flikar_fore": .tal(Double(fore)), "flikar_nu": .tal(Double(k.app.flikar.flikar.count))])
    }

    // MARK: - Sammanfattning

    static func sammanfattning(_ k: Labbkorning, _ flik: any Flik) async {
        k.app.flikar.aktivera(flik.id)
        let fel = k.kontroller.filter { $0["ok"].bool != true }
        let ok = k.kontroller.filter { $0["ok"].bool == true }
        var rader = ""
        for kontroll in fel + ok {
            let bra = kontroll["ok"].bool == true
            rader += "<li class=\"\(bra ? "ok" : "fel")\"><b>\(bra ? "ok" : "FEL")</b><span>\(Stoppsida.esc(kontroll["namn"].text ?? ""))</span></li>\n"
        }
        let html = """
        <!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Skyddsprov</title><style>body{font:11.5px/1.25 -apple-system,system-ui,sans-serif;margin:0;padding:14px;background:#f2f2ef;color:#111113}
        h1{font-size:19px;margin:0 0 8px}ol{list-style:none;margin:0;padding:0}li{display:flex;gap:6px;padding:1.5px 0;white-space:nowrap}
        b{flex:none;width:26px}span{overflow:hidden;text-overflow:ellipsis}.ok b{color:#1a7f37}.fel b{color:#c4320a}.fel{font-weight:600}</style></head><body>
        <h1>Skydd: \(ok.count) av \(k.kontroller.count) ok</h1><ol>\(rader)</ol></body></html>
        """
        _ = await laddaHTML(k.app, flik, html, bas: "about:blank")
        await k.skarmbild("prov")
    }

    // MARK: - Hjälp

    static func lasProv(_ skydd: Skydd) -> JSONVarde? {
        guard let d = try? Data(contentsOf: skydd.data.rot.appendingPathComponent("prov.json")) else { return nil }
        return try? JSONVarde(json: d)
    }

    static func laddaHTML(_ app: AppMiljo, _ flik: any Flik, _ html: String, bas: String) async -> Bool {
        var klar = false
        let id = flik.id
        let p = app.handelser.lyssna(SidaLaddad.self) { h in if h.flik == id { klar = true } }
        flik.webbvy.loadHTMLString(html, baseURL: URL(string: bas))
        let ok = await vanta(30) { klar }
        p.avsluta()
        return ok
    }

    static func vanta(_ sekunder: Double, _ villkor: () -> Bool) async -> Bool {
        let t0 = Date()
        while !villkor() {
            if Date().timeIntervalSince(t0) > sekunder { return false }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return true
    }

    static func js(_ vy: WKWebView, _ kod: String) async -> Any? {
        await withCheckedContinuation { (c: CheckedContinuation<Any?, Never>) in
            vy.evaluateJavaScript(kod) { v, _ in c.resume(returning: v) }
        }
    }

    static func snitt(_ v: [Double]) -> Double { v.isEmpty ? 0 : v.reduce(0, +) / Double(v.count) }
    static func avrunda(_ v: Double, _ d: Int = 1) -> Double { let f = pow(10, Double(d)); return (v * f).rounded() / f }
}
