import Foundation
import UIKit
import WebKit

/// Bryggans egna kanaler: datorns Anpassa-butik (`anpassa:*`), språket, startsidans hämtningar, webbinställningarna
/// och webbytorna. Namn och svar är datorns (`browser/preload.js`, `browser/anpassa.js`, `browser/webbinst.js`),
/// så att sidorna i `Webb/ui/` fungerar oförändrade. Kanaler som andra moduler äger (konto, skydd, Falk …)
/// registreras inte här; tills de finns svarar preload-ios.js med neutrala värden.
///
/// Ägare: Brygga och webb-UI.
@MainActor
enum BryggKanaler {
    /// Sidor som får läsa och ändra inställningarna.
    static let installningsytor: Set<String> = ["anpassa", "startsida", "falk"]
    /// Nycklar som bara ändras genom sina egna kanaler (webb:set, Skydds blockinst:*), aldrig via anpassa:satt,
    /// och som inte skickas till sidorna i anpassa:alla (på datorn ligger de i egna filer).
    static let skyddadePrefix = ["webb.", "block.", "sprak."]
    static func skyddad(_ nyckel: String) -> Bool { skyddadePrefix.contains { nyckel.hasPrefix($0) } }

    /// Nycklar där iPhone har ett annat standardvärde än datorn (Nycklar.swift). Sidornas `Anpassa.get(nyckel, std)`
    /// ska ge iPhone-värdet när inget är sparat.
    static let egnaStandarder = ["verktyg.placering"]

    /// Senaste adressen en sida bad om att öppna (`view:load`), för självtestet.
    private(set) static var senasteNavigering: URL?

    static func registrera(i app: AppMiljo, transport: BryggTransport) {
        let inst = app.installningar
        let b = app.brygga

        // MARK: Anpassa (browser/anpassa.js)
        b.startdata("anpassa:alla") { _ in
            let alla = inst.somAnpassaAlla()
            var varden = alla["varden"].objekt ?? [:], register = alla["register"].objekt ?? [:]
            varden = varden.filter { !skyddad($0.key) }
            register = register.filter { !skyddad($0.key) }
            return ["varden": .objekt(varden), "register": .objekt(register), "barn": alla["barn"]]
        }
        b.hantera("anpassa:satt", ytor: installningsytor) { anrop in
            let d = anrop.arg(0)
            let nyckel = d["nyckel"].text ?? ""
            guard !nyckel.isEmpty else { return Sattsvar.nyckel.json }   // som datorn: { ok: false, error: 'nyckel' }
            guard !skyddad(nyckel) else { throw BryggFel.nekad("\(nyckel) ändras inte via anpassa:satt") }
            return inst.satt(nyckel, d.objekt?["varde"], etikett: d["etikett"].text).json
        }
        b.hantera("anpassa:angra", ytor: installningsytor) { _ in inst.angra().json }
        b.hantera("anpassa:aterstall", ytor: installningsytor) { anrop in
            // Som datorn: Anpassas värden, inte webbinställningarna eller blockeringen (som har egna filer där)
            let p = anrop.arg(0).text ?? ""
            let nycklar = inst.varden.keys.filter { (p.isEmpty || $0 == p || $0.hasPrefix(p)) && !skyddad($0) && !inst.arLast($0) }.sorted()
            for k in nycklar { inst.satt(k, nil, etikett: "Återställ \(p.isEmpty ? "allt" : p)") }
            return ["ok": true, "antal": .tal(Double(nycklar.count))]
        }
        b.hantera("anpassa:historik", ytor: installningsytor) { _ in
            .lista(inst.historik.suffix(50).reversed().filter { !skyddad($0.nyckel) }.map(\.json))
        }
        b.hantera("anpassa:exportera", ytor: installningsytor) { anrop in .text(inst.exportera(anrop.arg(0).text)) }
        b.hantera("anpassa:importera", ytor: installningsytor) { anrop in
            let d = anrop.arg(0)
            return inst.importera(d["kod"].text ?? "", prefix: d["prefix"].text).json
        }

        // MARK: Språket (browser/ui/i18n.js, main.js i18n:load)
        b.startdata("i18n:load") { _ in
            let kod = BryggSprak.aktivt(inst)
            return ["kod": .text(kod), "ordlista": .objekt(BryggSprak.ordlista(kod))]
        }
        b.hantera("sprak:satt") { anrop in
            let kod = anrop.arg(0)["kod"].text ?? anrop.arg(0).text ?? ""
            guard kod.isEmpty || BryggSprak.koder.contains(kod) else { throw BryggFel.ogiltigt("okänt språk \(kod)") }
            inst[Nycklar.sprakVal] = kod
            return ["ok": true, "kod": .text(BryggSprak.aktivt(inst)), "val": .text(kod)]
        }

        // MARK: Sidans miljö (preload-ios.js läser den vid start)
        b.startdata("ios:miljo") { kalla in
            let info = Bundle.main.infoDictionary ?? [:]
            var m: [String: JSONVarde] = [
                "yta": .text(kalla.yta),
                "kanaler": .lista(b.kanaler.keys.sorted().map(JSONVarde.text)),
                "version": .text(info["CFBundleShortVersionString"] as? String ?? ""),
                "sprak": .text(BryggSprak.aktivt(inst)),
                "sprakval": .text(inst[Nycklar.sprakVal]),
                "sokmotor": .text(inst[Nycklar.sokMotor]),
                "css": "/ios/ios.css",
                "liten": .bool(UIDevice.current.userInterfaceIdiom == .phone),
                "egnaStandarder": .lista(egnaStandarder.map(JSONVarde.text)),
                "nedre": .tal(Double(transport.sida(kalla.webbvy)?.nedre ?? 0)),
            ]
            #if DEBUG
            m["felsok"] = true
            #endif
            return .objekt(m)
        }

        // MARK: Webbytorna
        b.hantera("sida:visa") { anrop in
            let d = anrop.arg(0)
            let yta = d["yta"].text ?? anrop.arg(0).text ?? ""
            guard BryggTransport.preloads[yta] != nil, transport.schema.fil(for: "/\(yta).html") != nil else {
                throw BryggFel.ogiltigt("ingen sida som heter \(yta)")
            }
            let lage = Sidlage(rawValue: d["lage"].text ?? "") ?? (yta == "startsida" ? .helskarm : .ark)
            guard AdrazeSidor.visa(yta, fragment: d["kategori"].text ?? d["fragment"].text, som: lage) != nil else {
                throw BryggFel.misslyckades("det finns inget fönster att visa \(yta) i")
            }
            return ["ok": true, "yta": .text(yta), "lage": .text(lage.rawValue)]
        }
        b.hantera("sida:stang") { anrop in
            if let yta = anrop.arg(0)["yta"].text { AdrazeSidor.stang(yta) }
            else if let w = transport.sida(anrop.kalla.webbvy), let stang = w.stang { stang() }
            else { AdrazeSidor.stang(nil) }
            return ["ok": true]
        }
        b.hantera("sida:klar") { anrop in
            transport.sida(anrop.kalla.webbvy)?.markeraKlar(sidansMs: anrop.arg(0)["ms"].tal)
            return ["ok": true]
        }

        // MARK: Navigering från sidorna (datorns view:load = ladda i en flik)
        b.hantera("view:load", ytor: ["startsida", "anpassa"]) { anrop in
            guard let text = anrop.arg(1).text ?? anrop.arg(0).text, let url = URL(string: text) else { throw BryggFel.ogiltigt("adress saknas") }
            let schema = url.scheme?.lowercased() ?? ""
            guard schema == "http" || schema == "https" else {
                Logg("Brygga").info("view:load till \(schema): öppnas inte i appen än")
                return false
            }
            senasteNavigering = url
            if let w = transport.sida(anrop.kalla.webbvy) { w.oppnaUtanfor(url) }
            else if let aktiv = app.flikar.aktiv, aktiv.url == nil { aktiv.ladda(url) }
            else { _ = app.flikar.nyFlik(url) }
            return true
        }

        // MARK: Startsidans hämtningar (huvudprocessen på datorn)
        b.hantera("omni:suggest", ytor: ["startsida", "anpassa"]) { anrop in
            let d = anrop.arg(0)
            return await BryggNatet.forslag(d["q"].text ?? "", motor: d["engine"].text ?? inst[Nycklar.sokMotor])
        }
        b.hantera("startsida:vader", ytor: ["startsida", "anpassa"]) { anrop in await BryggNatet.vader(anrop.arg(0)) }
        b.hantera("startsida:ort-sok", ytor: ["startsida", "anpassa"]) { anrop in await BryggNatet.orter(anrop.arg(0).text ?? "") }
        b.hantera("skoll:daily-image", ytor: ["startsida", "anpassa"]) { _ in await BryggNatet.dagensBild(sprak: BryggSprak.aktivt(inst)) }

        // MARK: Webbinställningarna (browser/webbinst.js). Bara Anpassa får ändra dem.
        b.hantera("webb:get", ytor: ["anpassa"]) { _ in
            var w = inst.samlat("webb.")
            w["downloadDirCustom"] = .bool(!(w["downloadDir"]?.text ?? "").isEmpty)
            return .objekt(w)
        }
        b.hantera("webb:set", ytor: ["anpassa"]) { anrop in .bool(webbSatt(anrop.arg(0).text ?? "", anrop.arg(1), inst)) }
        b.hantera("webb:clear", ytor: ["anpassa"]) { anrop in
            let d = anrop.arg(0)
            var typer = Set<String>()
            if d["cookies"].bool == true {
                typer.formUnion([WKWebsiteDataTypeCookies, WKWebsiteDataTypeLocalStorage, WKWebsiteDataTypeSessionStorage,
                                 WKWebsiteDataTypeIndexedDBDatabases, WKWebsiteDataTypeWebSQLDatabases,
                                 WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache])
            }
            if d["cache"].bool == true {
                typer.formUnion([WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeOfflineWebApplicationCache])
            }
            guard !typer.isEmpty else { return false }
            // Flikarnas lager. AdRaze-UI:ts eget (transport.datalager) rensas aldrig härifrån.
            await WKWebsiteDataStore.default().removeData(ofTypes: typer, modifiedSince: .distantPast)
            return true
        }

        // MARK: För självtestet: ekar argumenten och visar vem som anropade
        b.hantera("ios:eko") { anrop in
            ["argument": .lista(anrop.argument), "yta": .text(anrop.kalla.yta), "url": .text(anrop.kalla.url?.absoluteString ?? "")]
        }
    }

    // Samma regler som datorns webb:set
    private static let behorigheter = ["camera", "microphone", "geolocation", "notifications", "clipboard-read", "midi", "external"]

    private static func webbSatt(_ k: String, _ v: JSONVarde, _ inst: Installningar) -> Bool {
        if inst.arBarnlage(), k == "dns" || k == "httpsOnly" || k == "permDefault" || (k == "perm" && v["value"].text == "allow") { return false }
        switch k {
        case "dns":
            guard let s = v.text, ["off", "automatic", "cloudflare", "quad9", "google"].contains(s) else { return false }
            inst.satt("webb.dns", .text(s))
        case "httpsOnly", "askDownload", "falkSida", "falkSamtycke":
            inst.satt("webb.\(k)", .bool(v.bool ?? (v.tal.map { $0 != 0 } ?? false)))
        case "fontSize":
            guard let n = v.heltal ?? v.text.flatMap({ Int($0) }), (9...30).contains(n) else { return false }
            inst.satt("webb.fontSize", .tal(Double(n)))
        case "downloadDir":
            inst.satt("webb.downloadDir", "")
        case "permDefault":
            guard let typ = v["kind"].text, behorigheter.contains(typ) else { return false }
            var o = inst.hamta("webb.permDefaults")?.objekt ?? [:]
            o[typ] = v["value"].text == "block" ? "block" : "ask"
            inst.satt("webb.permDefaults", .objekt(o))
        case "perm":
            guard let ursprung = v["origin"].text, !ursprung.isEmpty, let typ = v["kind"].text else { return false }
            var alla = inst.hamta("webb.perms")?.objekt ?? [:]
            var s = alla[ursprung]?.objekt ?? [:]
            if let val = v["value"].text, val == "allow" || val == "block" { s[typ] = .text(val) } else { s.removeValue(forKey: typ) }
            if s.isEmpty { alla.removeValue(forKey: ursprung) } else { alla[ursprung] = .objekt(s) }
            inst.satt("webb.perms", .objekt(alla))
        case "permForget":
            guard let ursprung = v.text else { return false }
            var alla = inst.hamta("webb.perms")?.objekt ?? [:]
            alla.removeValue(forKey: ursprung)
            inst.satt("webb.perms", .objekt(alla))
        default:
            return false
        }
        return true
    }
}
