import Foundation
import UIKit
import WebKit

/// Självtestet `-mode brygga` (steg 4): schemat serverar sidorna, invoke fram och tillbaka, startdatan finns
/// synkront, en nekad kanal avvisas, en vanlig flik saknar bryggan, Anpassa öppnas och en accentfärg vald på
/// webbsidan ändrar `tema.accent` native (och tvärtom), mörkt läge, språkbyte och startsidan.
/// Skärmbilder: anpassa-lista, anpassa-ljus, anpassa-mork, startsida.
///
/// Ägare: Brygga och webb-UI.
@MainActor
enum BryggaProv {
    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        let inst = app.installningar
        guard let t = BryggTransport.delad else { k.kolla("transporten finns", false); return }
        k.kolla("transporten finns", true, ["kanaler": .tal(Double(app.brygga.kanaler.count))])

        // Känt utgångsläge; återställs sist
        let fore: [String: JSONVarde?] = ["tema.accent": inst.sparat("tema.accent"), "tema.lage": inst.sparat("tema.lage"),
                                         "sprak.val": inst.sparat("sprak.val")]
        inst.satt("tema.accent", nil)
        inst.satt("tema.lage", nil)
        inst[Nycklar.sprakVal] = "sv"
        defer { for (n, v) in fore { inst.satt(n, v) } }

        // 1. Schemat, utan WebKit
        let s = t.schema
        k.kolla("schemat: anpassa.html och startsida.html är shell.html",
                s.fil(for: "/anpassa.html")?.lastPathComponent == "shell.html" && s.fil(for: "/startsida.html")?.lastPathComponent == "shell.html")
        k.kolla("schemat: iOS-filerna finns", s.fil(for: "/ios/ios.css") != nil && s.fil(for: "/ios/preload-ios.js") != nil && s.fil(for: "/ios/ios.js") != nil)
        let utanfor = ["/../Info.plist", "/ios/../../Info.plist", "/ui/../../AdRaze", "/_preload/preload.js", "/.hemlig", "/locales", "/ios", "/",
                       "/ios/../ui/shell.html"]
        let slapptIgenom = utanfor.filter { s.fil(for: $0) != nil }
        k.kolla("schemat: inget utanför Webb/, inga mappar, dolda filer eller _preload", slapptIgenom.isEmpty, .lista(slapptIgenom.map(JSONVarde.text)))
        k.lika("schemat: rätt MIME för css", AdrazeSchema.mime("css"), "text/css; charset=utf-8")
        k.lika("språk från telefonen", [BryggSprak.franSystemet(["zh-Hant-TW"], koder: BryggSprak.koder), BryggSprak.franSystemet(["pt-PT"], koder: BryggSprak.koder),
                                        BryggSprak.franSystemet(["pt-BR"], koder: BryggSprak.koder), BryggSprak.franSystemet(["nb-NO"], koder: BryggSprak.koder),
                                        BryggSprak.franSystemet(["sv-SE", "en-US"], koder: BryggSprak.koder), BryggSprak.franSystemet(["xx-YY"], koder: BryggSprak.koder)],
               ["zh-TW", "pt-PT", "pt", "nb", "sv", "en"])

        // 2. Anpassa som ark, via den publika kanalen
        let t0 = Date()
        let visa = try await app.brygga.anropa("sida:visa", [["yta": "anpassa", "lage": "ark"]], fran: BryggKalla(yta: "labb"))
        k.kolla("sida:visa svarar", visa["ok"].bool == true, visa)
        guard let w = AdrazeSidor.visad("anpassa") else { k.kolla("Anpassa visas", false); return }
        let klar = await w.vantaPaKlar(max: 15)
        k.kolla("Anpassa laddad och klar", klar, ["ms": .tal((Date().timeIntervalSince(t0) * 1000).rounded()), "fel": w.senasteFel.map(JSONVarde.text) ?? .null])
        guard klar else { return }
        try await k.vanta(0.6)

        let lage = try await w.kor("""
            const s = document.getElementById('settings');
            return { start: window.__adrazeIosStart || null, url: location.href, titel: document.title,
                     settings: !!s && getComputedStyle(s).display !== 'none', vy: !!window.view, plattform: window.view && window.view.platform,
                     anpassa: !!window.Anpassa, accent: window.Anpassa ? window.Anpassa.get('tema.accent') : null,
                     placering: window.Anpassa ? window.Anpassa.get('verktyg.placering', 'uppe') : null,
                     bredd: innerWidth, css: !!document.getElementById('adraze-ios-css')?.sheet, ios: document.documentElement.className };
            """)
        k.notera("anpassa_sidan", lage)
        k.notera("anpassa_tider_ms", .objekt(w.tider.mapValues(JSONVarde.tal)))
        k.notera("anpassa_sidladdning", (try? await w.kor(prestandaJS)) ?? .null)
        k.notera("anpassa_diagnos", (try? await w.kor(diagnosJS)) ?? .null)
        // Startdatan som sidan fick (för felsökning och förhandsvisning utanför simulatorn)
        k.notera("startdata_anpassa", (try? await w.kor("return window.__adrazeBoot || null;")) ?? .null)
        k.kolla("startdatan fanns innan sidans skript körde", lage["start"]["boot"].bool == true && lage["start"]["anpassa"].bool == true, lage["start"])
        k.kolla("datorns preload kördes oförändrad (window.view, plattform ios)", lage["vy"].bool == true && lage["plattform"].text == "ios")
        k.lika("Anpassa läser tema.accent synkront", lage["accent"].text ?? "", "#ff4b1f")
        k.lika("iPhone-standard för verktyg.placering", lage["placering"].text ?? "", "nere")
        k.kolla("sidan har telefonbredd (viewport)", (lage["bredd"].tal ?? 0) > 300 && (lage["bredd"].tal ?? 0) < 500, lage["bredd"])
        k.kolla("iOS-CSS laddad", lage["css"].bool == true)
        k.kolla("inställningarna visas", lage["settings"].bool == true)

        // invoke fram och tillbaka, okänd kanal, synkron språkfil, filer genom schemat
        let rund = try await w.kor("""
            const e = await window.adraze.invoke('ios:eko', { x: 1, s: 'åäö' }, [true, null]);
            const tider = [];
            for (let i = 0; i < 50; i++) { const t = performance.now(); await window.adraze.invoke('ios:eko', i); tider.push(performance.now() - t); }
            tider.sort((a, b) => a - b);
            const okand = await window.adraze.invoke('finns:inte').then(() => 'svarade', (f) => 'avvisad: ' + f.message);
            const t1 = performance.now(); const de = window.adraze.sync('i18n:load', 'de'); const synkMs = performance.now() - t1;
            const css = await fetch('/ios/ios.css'); const saknas = await fetch('/finns-inte.js'); const pre = await fetch('/_preload/preload.js');
            const bild = await fetch('/adraze-mark.png');
            return { eko: e, median: tider[25], max: tider[49], okand, deAntal: de ? Object.keys(de).length : 0, synkMs,
                     css: css.status + ' ' + css.headers.get('content-type'), saknas: saknas.status, pre: pre.status,
                     bild: bild.status + ' ' + bild.headers.get('content-type') + ' ' + (await bild.arrayBuffer()).byteLength };
            """)
        k.notera("invoke", rund)
        k.kolla("invoke: svar med argumenten och ytan", rund["eko"]["argument"][0]["s"].text == "åäö" && rund["eko"]["argument"][1][0].bool == true
                && rund["eko"]["yta"].text == "anpassa", rund["eko"])
        k.notera("invoke_median_ms", rund["median"])
        k.kolla("okänd kanal avvisas", (rund["okand"].text ?? "").hasPrefix("avvisad: okänd kanal"), rund["okand"])
        k.kolla("synkron XHR mot schemat ger en annan språkfil (de)", (rund["deAntal"].tal ?? 0) > 500, ["nycklar": rund["deAntal"], "ms": rund["synkMs"]])
        k.lika("schemat: ios.css 200 och text/css", rund["css"].text ?? "", "200 text/css; charset=utf-8")
        k.kolla("schemat: 404 för saknad fil och för _preload", rund["saknas"].tal == 404 && rund["pre"].tal == 404, ["saknas": rund["saknas"], "pre": rund["pre"]])
        k.kolla("schemat: bild med rätt typ", (rund["bild"].text ?? "").hasPrefix("200 image/png"), rund["bild"])

        // Sidan syns på riktigt: mitt i vyn ligger inställningarna, inte en tom yta (datorns #views ligger i #sp-rad)
        let syns = try await w.kor("""
            const v = document.getElementById('views').getBoundingClientRect(), e = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
            return { b: Math.round(v.width), h: Math.round(v.height), iSettings: !!(e && e.closest('#settings')), rader: document.querySelectorAll('#settings-nav .ios-grupp .set-tab').length };
            """)
        k.kolla("Anpassa syns: inställningarna fyller vyn och listan har rader",
                (syns["b"].tal ?? 0) > 300 && (syns["h"].tal ?? 0) > 400 && syns["iSettings"].bool == true && (syns["rader"].tal ?? 0) >= 4, syns)
        await bild(k, "anpassa-lista", w)

        // 3. Anpassa-kategorin, accentfärgen från webbsidan till skalet
        _ = try await w.kor("document.querySelector('#settings-nav .set-tab[data-cat=\"anpassa\"]').click(); return true;")
        let kat = await vantaJS(k, "Anpassa-kategorin öppnas med temat ritat", w, max: 5, """
            const n = document.querySelectorAll('#anp-tema [data-accent]').length;
            return { detalj: document.documentElement.classList.contains('ios-detalj'), farger: n,
                     panel: !document.querySelector('.set-panel[data-cat="anpassa"]').classList.contains('hidden') };
            """) { $0["detalj"].bool == true && ($0["farger"].tal ?? 0) >= 8 && $0["panel"].bool == true }
        if kat == nil { return }
        try await k.vanta(0.9)
        await bild(k, "anpassa-ljus", w)

        _ = try await w.kor("document.querySelector('#anp-tema [data-accent=\"#3b6fe0\"]').click(); return true;")
        let blatt = await k.vantaPa("accent vald på webbsidan når skalet (tema.accent)", max: 3) { app.tema.accenthex == "#3b6fe0" }
        if blatt { k.lika("tema.accent sparat native", inst.sparat("tema.accent"), JSONVarde.text("#3b6fe0")) }
        k.notera("accent_native", .text(app.tema.accenthex))

        inst.satt("tema.accent", "#2f9e67", etikett: "Självtest")
        _ = await vantaJS(k, "accent ändrad native når webbsidan (anpassa:andrad)", w, max: 3,
                          "return document.documentElement.getAttribute('data-anp-accent');") { $0.text == "#2f9e67" }
        inst.satt("tema.accent", nil)

        // 4. Mörkt läge från webbsidan
        _ = try await w.kor("document.querySelector('#anp-tema [data-namn=\"lage\"][data-v=\"morkt\"]').click(); return true;")
        let mork = await k.vantaPa("mörkt läge valt på webbsidan når skalet (tema.lage)", max: 3) { app.tema.lage == .morkt }
        if mork {
            _ = await vantaJS(k, "sidan är mörk", w, max: 3, "return document.documentElement.dataset.theme;") { $0.text == "dark" }
            _ = try await w.kor("const m = document.querySelector('.set-main'); m.scrollTop = 0; return true;")
            try await k.vanta(0.8)
            await bild(k, "anpassa-mork", w)
        }
        inst.satt("tema.lage", nil)
        _ = await vantaJS(k, "tillbaka till ljust", w, max: 3, "return document.documentElement.dataset.theme;") { $0.text == "light" }

        // 5. Språk: välj engelska på sidan (laddas om med ny startdata), sedan tillbaka native
        _ = try await w.kor("window.i18n.set('en'); return true;")
        let en = await vantaJS(k, "språkbyte på sidan: ny ordlista efter omladdningen", w, max: 8, """
            const b = document.querySelector('.set-tab[data-cat="anpassa"]');
            return { lang: window.i18n && window.i18n.lang, boot: window.__adrazeBoot && window.__adrazeBoot['i18n:load'] && window.__adrazeBoot['i18n:load'].kod,
                     text: b ? b.textContent.trim() : null };
            """) { $0["lang"].text == "en" && $0["boot"].text == "en" }
        if let en {
            k.kolla("texten är översatt", (en["text"].text ?? "Anpassa") != "Anpassa", en["text"])
            k.lika("sprak.val sparat native", inst[Nycklar.sprakVal], "en")
        }
        inst[Nycklar.sprakVal] = "sv"
        _ = await vantaJS(k, "språk ändrat native laddar om sidan på svenska", w, max: 8, "return window.i18n && window.i18n.lang;") { $0.text == "sv" }

        // 5b. Anpassa › Startsidan › "Anpassa startsidan": startsidan i redigeringsläge ovanpå arket, Klar tar en tillbaka
        _ = try await w.kor("document.querySelector('#settings-nav .set-tab[data-cat=\"anpassa\"]').click(); return true;")
        _ = await vantaJS(k, "Anpassa-kategorin igen (startsidans rader ritade)", w, max: 4,
                          "return !!document.querySelector('#anp-startsida .set-row .set-btn');") { $0.bool == true }
        _ = try await w.kor("document.querySelector('#anp-startsida .set-row .set-btn').click(); return true;")
        if await k.vantaPa("knappen Anpassa startsidan öppnar startsidan", max: 6, { AdrazeSidor.visad("startsida") != nil }),
           let red = AdrazeSidor.visad("startsida") {
            _ = await red.vantaPaKlar(max: 10)
            let pa = await vantaJS(k, "startsidan står i redigeringsläge", red, max: 8, """
                const nt = document.getElementById('newtabpage');
                return { red: !!(window.AnpassaStartsida && window.AnpassaStartsida.redigerar()), lada: !!document.querySelector('#anp-st-lada:not([hidden])'),
                         ntDold: !nt || nt.classList.contains('hidden'), S: typeof window.AnpassaStartsida, adress: location.pathname + location.hash,
                         redo: document.documentElement.classList.contains('ios-redo') };
                """) { $0["red"].bool == true && $0["lada"].bool == true }
            if pa != nil {
                try await k.vanta(0.9)
                await bild(k, "startsida-redigera", red)
                _ = try? await red.kor("document.querySelector('#anp-st-lada .anp-lada-klar').click(); return true;")
                await k.vantaPa("Klar stänger startsidan och Anpassa ligger kvar", max: 5) {
                    AdrazeSidor.visad("startsida") == nil && AdrazeSidor.visad("anpassa") != nil
                }
            }
            AdrazeSidor.stang("startsida", animerat: false)
        }

        // 6. Krysset stänger arket
        _ = await w.vantaPaKlar(max: 5)
        try await k.vanta(0.5)
        _ = try? await w.kor("document.getElementById('settings-close').click(); return true;")
        await k.vantaPa("krysset stänger Anpassa", max: 4) { AdrazeSidor.visad("anpassa") == nil }
        try await k.vanta(0.8)

        // 6b. Som i exemplet för andra moduler: Anpassa direkt på en kategori (adressen får ett #fragment)
        _ = try await app.brygga.anropa("sida:visa", [["yta": "anpassa", "kategori": "sok", "lage": "ark"]], fran: BryggKalla(yta: "labb"))
        if let sok = AdrazeSidor.visad("anpassa") {
            k.kolla("Anpassa på en kategori laddad och klar", await sok.vantaPaKlar(max: 10))
            _ = await vantaJS(k, "kategorin sok visas direkt, med bryggan", sok, max: 5, """
                const p = document.querySelector('.set-panel[data-cat="sok"]');
                return { brygga: typeof window.adraze, detalj: document.documentElement.classList.contains('ios-detalj'), panel: !!p && !p.classList.contains('hidden'),
                         motorer: document.querySelectorAll('#engine-list .engine-opt').length };
                """) { $0["brygga"].text == "object" && $0["detalj"].bool == true && $0["panel"].bool == true && ($0["motorer"].tal ?? 0) >= 3 }
            k.notera("anpassa_andra_gangen_tider_ms", .objekt(sok.tider.mapValues(JSONVarde.tal)))
            try await k.vanta(0.8)
            await bild(k, "anpassa-sokmotor", sok)
            AdrazeSidor.stang("anpassa", animerat: false)
            try await k.vanta(0.6)
        } else { k.kolla("Anpassa på en kategori visas", false) }

        // 7. Startsidan i helskärm
        _ = try await app.brygga.anropa("sida:visa", [["yta": "startsida", "lage": "helskarm"]], fran: BryggKalla(yta: "labb"))
        guard let ss = AdrazeSidor.visad("startsida") else { k.kolla("startsidan visas", false); return }
        k.kolla("startsidan laddad och klar", await ss.vantaPaKlar(max: 15))
        let sida = await vantaJS(k, "startsidan har sökfält och genvägar", ss, max: 6, """
            const nt = document.getElementById('newtabpage');
            return { syns: !!nt && !nt.classList.contains('hidden') && getComputedStyle(nt).display !== 'none',
                     sok: !!document.getElementById('nt-search'), genvagar: document.querySelectorAll('#shortcuts .sc').length,
                     klocka: (document.getElementById('nt-clock') || {}).textContent || '' };
            """) { $0["syns"].bool == true && $0["sok"].bool == true && ($0["genvagar"].tal ?? 0) > 0 }
        k.notera("startsidan", sida ?? .null)
        let ssSyns = try await ss.kor("""
            const r = document.getElementById('newtabpage').getBoundingClientRect(), e = document.elementFromPoint(innerWidth / 2, innerHeight / 3);
            return { b: Math.round(r.width), h: Math.round(r.height), iNt: !!(e && e.closest('#newtabpage')) };
            """)
        k.kolla("startsidan syns: nya fliken fyller vyn", (ssSyns["b"].tal ?? 0) > 300 && (ssSyns["h"].tal ?? 0) > 600 && ssSyns["iNt"].bool == true, ssSyns)
        k.notera("startsidan_tider_ms", .objekt(ss.tider.mapValues(JSONVarde.tal)))
        k.notera("startsidan_sidladdning", (try? await ss.kor(prestandaJS)) ?? .null)
        k.notera("startsidan_diagnos", (try? await ss.kor(diagnosJS)) ?? .null)
        _ = await vantaJS(k, "bakgrundsbilden laddad", ss, max: 6, """
            const bg = getComputedStyle(document.getElementById('nt-bg')).backgroundImage;
            if (!bg || bg === 'none') return false;
            const u = bg.slice(5, -2); return await new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; });
            """) { $0.bool == true }
        try await k.vanta(0.8)
        await bild(k, "startsida", ss)

        // Nekad kanal: startsidan får inte rensa webbdata
        let fore_nekade = t.antalNekade
        let nekad = try await ss.kor("return await window.adraze.invoke('webb:clear', { cookies: true }).then(() => 'svarade', (f) => f.message);")
        k.kolla("kanal nekas för fel yta (webb:clear från startsidan)", (nekad.text ?? "").hasPrefix("nekad") && t.antalNekade == fore_nekade + 1, nekad)
        do {
            _ = try await app.brygga.anropa("webb:set", ["httpsOnly", true], fran: BryggKalla(yta: "startsida"))
            k.kolla("anropa nekar webb:set från startsidan", false)
        } catch let f as BryggFel {
            k.kolla("anropa nekar webb:set från startsidan", { if case .nekad = f { return true } else { return false } }(), .text(f.localizedDescription))
        }
        let skyddad = try await ss.kor("return await window.adraze.invoke('anpassa:satt', { nyckel: 'block.niva', varde: 'av' }).then(() => 'svarade', (f) => f.message);")
        k.kolla("anpassa:satt kan inte ändra block.* eller webb.*", (skyddad.text ?? "").hasPrefix("nekad"), skyddad)

        // Sök på startsidan: Swift navigerar fliken och startsidan stängs
        _ = try await ss.kor("""
            const i = document.getElementById('nt-search'); i.value = 'adraze ios';
            i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;
            """)
        let sokt = await k.vantaPa("sökning på startsidan går till en vanlig flik", max: 5) { BryggKanaler.senasteNavigering != nil }
        if sokt {
            k.kolla("sökadressen följer sok.motor", BryggKanaler.senasteNavigering?.host == "www.google.com" && (BryggKanaler.senasteNavigering?.query ?? "").contains("adraze"),
                    .text(BryggKanaler.senasteNavigering?.absoluteString ?? ""))
            await k.vantaPa("startsidan stängs efter sökningen", max: 4) { AdrazeSidor.visad("startsida") == nil }
        }
        AdrazeSidor.stang(nil, animerat: false)
        try await k.vanta(0.6)

        // 8. En vanlig flik har varken bryggan eller schemat
        let flik = app.flikar.nyFlik(URL(string: "https://example.com/"))
        let laddad = await k.vantaPa("vanlig flik laddad", max: 30) { !flik.laddar && flik.url?.host == "example.com" }
        k.kolla("vanlig flik: inget schema i konfigurationen", flik.webbvy.configuration.urlSchemeHandler(forURLScheme: AdrazeSchema.schema) == nil)
        if laddad {
            let v = try await flik.webbvy.callAsyncJavaScript("""
                const h = window.webkit && window.webkit.messageHandlers ? window.webkit.messageHandlers.adraze : undefined;
                const f = await fetch('adraze-app://localhost/anpassa.html').then(() => 'hämtade', () => 'fel');
                return [typeof window.adraze, typeof h, typeof window.__adrazeBoot, typeof window.anpassaBro, f];
                """, arguments: [:], contentWorld: .page)
            let svar = JSONVarde(foundation: v)
            k.lika("vanlig flik: window.adraze, handlern, startdatan och anpassaBro saknas och schemat går inte att hämta",
                   svar, ["undefined", "undefined", "undefined", "undefined", "fel"])
        }
        // Sist: Anpassa öppen, så att simulatorns egen skärmbild (bygg-sim.sh) visar den som den ser ut på skärmen
        _ = try? await app.brygga.anropa("sida:visa", [["yta": "anpassa", "lage": "ark"]], fran: BryggKalla(yta: "labb"))
        if let sist = AdrazeSidor.visad("anpassa") {
            _ = await sist.vantaPaKlar(max: 10)
            k.notera("sist_diagnos", (try? await sist.kor(diagnosJS)) ?? .null)
            try await k.vanta(1.0)
        }
        k.notera("brygga", ["anrop": .tal(Double(t.antalAnrop)), "nekade": .tal(Double(t.antalNekade)), "handelser": .tal(Double(t.antalHandelser)),
                            "schema": .objekt(Dictionary(uniqueKeysWithValues: t.schema.statistik.map { ("\($0.key)", JSONVarde.tal(Double($0.value))) }))])
        k.notera("minne_mb", .tal(Labbkorning.minneMB()))
    }

    /// Sidans egna tider (ms från navigeringens start): tolkad, DOMContentLoaded, load, antal filer och de långsammaste.
    static let prestandaJS = """
        const n = performance.getEntriesByType('navigation')[0] || {}, r = performance.getEntriesByType('resource');
        const topp = r.slice().sort((a, b) => b.duration - a.duration).slice(0, 6).map((e) => e.name.split('/').pop() + ' ' + Math.round(e.duration) + ' ms @' + Math.round(e.startTime));
        return { svar: Math.round(n.responseEnd || 0), tolkad: Math.round(n.domInteractive || 0), dcl: Math.round(n.domContentLoadedEventEnd || 0),
                 load: Math.round(n.loadEventEnd || 0), filer: r.length, summaFilerMs: Math.round(r.reduce((s, e) => s + e.duration, 0)), topp };
        """

    /// Vad som syns var på sidan: elementet mitt i bilden och dess förfäder, med det som kan dölja dem.
    static let diagnosJS = """
        const info = (e) => { if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
          const kl = typeof e.className === 'string' ? e.className.trim().split(/\\s+/).slice(0, 4).join('.') : '';
          return { el: e.tagName + (e.id ? '#' + e.id : '') + (kl ? '.' + kl : ''), d: cs.display, v: cs.visibility, o: cs.opacity, pos: cs.position,
            z: cs.zIndex, t: cs.transform, bg: cs.backgroundColor, c: cs.color, ov: cs.overflow, cv: cs.contentVisibility || '', f: cs.filter,
            r: [r.x, r.y, r.width, r.height].map(Math.round) }; };
        const kedja = []; for (let e = document.elementFromPoint(innerWidth / 2, 160); e; e = e.parentElement) kedja.push(info(e));
        return { kedja, views: info(document.getElementById('views')), settings: info(document.getElementById('settings')),
          rail: info(document.querySelector('.set-rail')), brand: info(document.querySelector('.set-brand')), nt: info(document.getElementById('newtabpage')),
          body: info(document.body), html: info(document.documentElement), klass: document.documentElement.className,
          ark: [...document.styleSheets].map((s) => (s.href || 'inline') + ':' + (() => { try { return s.cssRules.length; } catch { return 'x'; } })()),
          vy: [innerWidth, innerHeight, devicePixelRatio, document.visibilityState, document.hidden] };
        """

    /// Skärmbild med sidans innehåll. `k.skarmbild` (drawHierarchy) ritar inte webbvyns innehåll i ett ark
    /// (mätt 2026-11-17: arket blev tomt), så webbvyns egen ögonblicksbild (takeSnapshot) ritas ovanpå på samma plats.
    static func bild(_ k: Labbkorning, _ namn: String, _ sida: AdrazeSida) async {
        guard let bas = await k.skarmbild(namn), let fonster = Labbkorning.fonster() else { return }
        let konf = WKSnapshotConfiguration()
        konf.afterScreenUpdates = true
        let webb: UIImage? = await withCheckedContinuation { c in
            sida.webbvy.takeSnapshot(with: konf) { bild, _ in c.resume(returning: bild) }
        }
        guard let webb else {
            k.kolla("webbvyns ögonblicksbild \(namn)", false)
            return
        }
        let rekt = sida.webbvy.convert(sida.webbvy.bounds, to: fonster)
        let format = UIGraphicsImageRendererFormat(for: fonster.traitCollection)
        let bild = UIGraphicsImageRenderer(bounds: fonster.bounds, format: format).image { _ in
            bas.draw(in: fonster.bounds)
            // Arkets rundade hörn upptill (preferredCornerRadius 24); helskärm har inga
            let horn: CGFloat = rekt.minY > 1 ? 24 : 0
            UIBezierPath(roundedRect: rekt, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: horn, height: horn)).addClip()
            webb.draw(in: rekt)
        }
        do {
            try bild.pngData()?.write(to: k.mapp.appendingPathComponent("\(namn).png"), options: .atomic)
        } catch {
            k.kolla("skärmbild \(namn)", false, .text(error.localizedDescription))
        }
    }

    /// Frågar sidan var 100:e ms tills villkoret är sant. Blir en kontroll; ger det sista svaret när det lyckades.
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
                if villkor(v) {
                    k.kolla(namn, true, ["s": .tal((Date().timeIntervalSince(t0) * 100).rounded() / 100), "svar": v])
                    return v
                }
            } catch {
                fel = error.localizedDescription
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        k.kolla(namn, false, ["senast": senast, "fel": fel.map(JSONVarde.text) ?? .null])
        return nil
    }
}
