import Foundation

/// Det `verktyg/dnr2wk.py` lägger i `App/Regler/` (i appen `AdRaze.app/Regler/`): WebKit-listorna, sajtdata i
/// 256 hinkar, annonsvärdarna som inte får skicka fliken vidare, popup-värdarna, spårningsparametrarna,
/// tillåtlistan för inloggning och betalning (datorns `ADBLOCK_ALLOW`) och innehållsskripten.
///
/// Ägare: Skydd.
@MainActor
final class Regeldata {
    struct Listpost: Decodable {
        let namn: String
        let fil: String
        let regler: Int
        let byte: Int
        let sha256: String
    }

    struct Parameterregel {
        let re: [NSRegularExpression]
        let typer: Set<String>
        let bort: Set<String>
        let prio: Int
        let ini: [String]?
        let uninit: [String]?
        let tredje: Bool?
        /// Domänen förfrågan går till (ur regexen), om regeln bara gäller en domän.
        let doman: String?
        /// Regeln som JSON till skriptet för fetch och XMLHttpRequest.
        let json: [String: Any]
    }

    let rot: URL
    private(set) var listor: [Listpost] = []
    private(set) var fel: String?

    // Datorns tillåtlistor (browser/main.js)
    private(set) var tillatVardar: Set<String> = []
    private(set) var vagVardar: Set<String> = []
    private(set) var vagar: [String] = []
    private(set) var popupBetrodda: Set<String> = []

    private(set) var popupvardar: Set<String> = []
    /// Annonsvärdar som inte får skicka hela fliken till en annan sajt. Laddas i bakgrunden (93 000 värdar).
    private(set) var initiativ: Set<String> = []
    private(set) var initiativLaddad = false
    /// Värdar som annons- och spårlistorna stoppar på alla sajter, för räknaren (`Raknare`, 97 000 värdar).
    private(set) var raknarvardar: Set<String> = []
    private(set) var parametrar: [Parameterregel] = []

    private(set) var kakUpplas = ""
    private(set) var kakDolj: [String: String] = [:]

    // Skripten (tilläggets content/ och scriptlets)
    private(set) var vakt = ""
    private(set) var youtube = ""
    private(set) var kakor = ""
    private(set) var scriptletMallar: [String] = []

    private var hinkar: [Int: [String: Any]] = [:]
    private var hinkordning: [Int] = []
    private let logg = Logg("Skydd")

    static let antalHinkar = 256
    static let maxHinkarIMinnet = 48

    init(rot: URL = Bunt.mapp("Regler")) {
        self.rot = rot
        las()
    }

    private func data(_ fil: String) -> Data? { try? Data(contentsOf: rot.appendingPathComponent(fil)) }
    private func text(_ fil: String) -> String? { data(fil).flatMap { String(data: $0, encoding: .utf8) } }
    private func json(_ fil: String) -> Any? { data(fil).flatMap { try? JSONSerialization.jsonObject(with: $0) } }

    private func las() {
        guard let d = data("listor/manifest.json") else {
            fel = "Regellistorna saknas i appen"
            logg.fel("hittar inte Regler/listor/manifest.json (kör verktyg/dnr2wk.py)")
            return
        }
        struct Manifest: Decodable { let version: Int; let listor: [Listpost] }
        do {
            listor = try JSONDecoder().decode(Manifest.self, from: d).listor
        } catch {
            fel = "Regellistorna går inte att läsa"
            logg.fel("manifest.json: \(error)")
        }
        if let i = json("data/inlogg.json") as? [String: Any] {
            tillatVardar = Set((i["tillat"] as? [String]) ?? [])
            vagVardar = Set((i["vagVardar"] as? [String]) ?? [])
            vagar = (i["vagar"] as? [String]) ?? []
            popupBetrodda = Set((i["popupBetrodda"] as? [String]) ?? [])
        }
        popupvardar = Set((text("data/popup.txt") ?? "").split(separator: "\n").map(String.init))
        if let k = json("data/kakor.json") as? [String: Any] {
            kakUpplas = (k["upplas"] as? String) ?? ""
            kakDolj = (k["dolj"] as? [String: String]) ?? [:]
        }
        parametrar = ((json("data/parametrar.json") as? [[String: Any]]) ?? []).compactMap(Self.parameterregel)
        vakt = text("skript/vakt.js") ?? ""
        youtube = text("skript/youtube.js") ?? ""
        kakor = text("skript/kakor.js") ?? ""
        let namn = (json("skript/scriptlets.json") as? [String]) ?? []
        scriptletMallar = namn.map { text("skript/scriptlets/\($0).js") ?? "" }
        if vakt.isEmpty || kakor.isEmpty || namn.isEmpty { logg.varning("innehållsskript saknas i Regler/skript") }
    }

    /// Läser annonsvärdarna i bakgrunden (knappt 2 MB text).
    func laddaInitiativ() async {
        guard !initiativLaddad else { return }
        let fil = rot.appendingPathComponent("data/initiativ.txt")
        let mangd = await Task.detached(priority: .utility) { () -> Set<String> in
            guard let t = try? String(contentsOf: fil, encoding: .utf8) else { return [] }
            var m = Set<String>(minimumCapacity: 100_000)
            for rad in t.split(separator: "\n") where !rad.isEmpty { m.insert(String(rad)) }
            return m
        }.value
        initiativ = mangd
        initiativLaddad = true
    }

    /// Läser räknarens värdar i bakgrunden (knappt 2 MB text).
    func laddaRaknare() async {
        guard raknarvardar.isEmpty else { return }
        let fil = rot.appendingPathComponent("data/raknare.txt")
        raknarvardar = await Task.detached(priority: .utility) { () -> Set<String> in
            guard let t = try? String(contentsOf: fil, encoding: .utf8) else { return [] }
            var m = Set<String>(minimumCapacity: 100_000)
            for rad in t.split(separator: "\n") where !rad.isEmpty { m.insert(String(rad)) }
            return m
        }.value
        if raknarvardar.isEmpty { logg.varning("Regler/data/raknare.txt saknas: skyddet räknar inget") }
    }

    func arRaknarvard(_ v: String) -> Bool { Vard.iMangd(v, raknarvardar) }

    private static func parameterregel(_ j: [String: Any]) -> Parameterregel? {
        let skift = (j["skiftlage"] as? Bool) ?? false
        let re = ((j["re"] as? [String]) ?? []).compactMap {
            try? NSRegularExpression(pattern: $0, options: skift ? [] : [.caseInsensitive])
        }
        guard !re.isEmpty, let bort = j["bort"] as? [String] else { return nil }
        return Parameterregel(re: re, typer: Set((j["typer"] as? [String]) ?? []), bort: Set(bort),
                              prio: (j["prio"] as? Int) ?? 1, ini: j["init"] as? [String], uninit: j["uninit"] as? [String],
                              tredje: j["tredje"] as? Bool, doman: j["doman"] as? String, json: j)
    }

    // MARK: - Frågor

    /// Inloggning och betalning (datorns `adblockAllowHost`): värden eller sökvägen på listan.
    func arTillat(_ url: URL) -> Bool {
        let v = Vard.av(url)
        if Vard.iMangd(v, tillatVardar) { return true }
        guard url.scheme?.lowercased() == "https" else { return false }
        let utan = Vard.utanWww(v)
        guard vagVardar.contains(utan) else { return false }
        let vag = url.path.lowercased()
        return vagar.contains { vag.hasPrefix("/" + $0.lowercased() + "/") }
    }

    func arTillatVard(_ v: String) -> Bool { Vard.iMangd(v, tillatVardar) }
    func arPopupBetrodd(_ v: String) -> Bool { Vard.iMangd(v, popupBetrodda) }
    func arPopupvard(_ v: String) -> Bool { Vard.iMangd(v, popupvardar) }
    func arInitiativ(_ v: String) -> Bool { Vard.iMangd(v, initiativ) }

    /// Sajtdata för en exakt nyckel (värd eller överordnad domän): `c`/`cx`/`cs` kosmetik, `k`/`kx`/`ks`
    /// kakrutor, `gh` utan generiska regler, `s` scriptlets.
    func sajtpost(_ nyckel: String) -> [String: Any]? {
        let i = Int(Self.fnv1a(nyckel) % UInt32(Self.antalHinkar))
        if hinkar[i] == nil {
            let fil = String(format: "data/sajter/%03d.json", i)
            hinkar[i] = (json(fil) as? [String: Any]) ?? [:]
            hinkordning.append(i)
            if hinkordning.count > Self.maxHinkarIMinnet { hinkar[hinkordning.removeFirst()] = nil }
        }
        return hinkar[i]?[nyckel] as? [String: Any]
    }

    var hinkarIMinnet: Int { hinkar.count }

    /// FNV-1a (32 bitar) över värdens UTF-8, samma som dnr2wk.py.
    nonisolated static func fnv1a(_ s: String) -> UInt32 {
        var h: UInt32 = 0x811c_9dc5
        for b in s.utf8 {
            h ^= UInt32(b)
            h = h &* 0x0100_0193
        }
        return h
    }

    /// Huvudsidans adress utan spårningsparametrar, eller `nil` om inget ska tas bort.
    /// `kalla` = värden för ramen som startade navigeringen (initiator), `nil` för adressfältet.
    func utanParametrar(_ url: URL, kalla: String?) -> URL? {
        guard let q = url.query, !q.isEmpty else { return nil }
        let v = Vard.av(url)
        let s = url.absoluteString
        let hela = NSRange(s.startIndex..., in: s)
        var basta: Parameterregel?
        for r in parametrar where r.typer.contains("main_frame") {
            if let ini = r.ini {
                guard let kalla, Vard.iLista(kalla, ini) else { continue }
            }
            if let un = r.uninit, let kalla, Vard.iLista(kalla, un) { continue }
            if let t = r.tredje {
                let tredje = kalla.map { Vard.sajt($0) != Vard.sajt(v) } ?? false
                if t != tredje { continue }
            }
            guard r.re.contains(where: { $0.firstMatch(in: s, range: hela) != nil }) else { continue }
            if basta == nil || r.prio > basta!.prio { basta = r }
        }
        guard let r = basta else { return nil }
        return Self.taBort(r.bort, fran: url)
    }

    /// Tar bort parametrarna ur adressen och lämnar resten som det var (som DNR:s removeParams).
    static func taBort(_ bort: Set<String>, fran url: URL) -> URL? {
        guard var c = URLComponents(url: url, resolvingAgainstBaseURL: false), let q = c.percentEncodedQuery else { return nil }
        let delar = q.split(separator: "&", omittingEmptySubsequences: false)
        let kvar = delar.filter { del in
            let namn = String(del.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
            return !bort.contains(namn.removingPercentEncoding ?? namn)
        }
        guard kvar.count != delar.count else { return nil }
        c.percentEncodedQuery = kvar.isEmpty ? nil : kvar.joined(separator: "&")
        return c.url
    }

    /// Regler för fetch och XMLHttpRequest som kan gälla på sajten: initiatorn är sajten, eller (utan initiator)
    /// förfrågan går till samma sajt. Andra sajters regler tas inte med (de flesta sidor får inget skript alls).
    func parameterreglerForSkript(vard: String) -> [[String: Any]] {
        let sajt = Vard.sajt(vard)
        return parametrar.filter { r in
            guard r.typer.contains("xmlhttprequest") else { return false }
            if let ini = r.ini { return Vard.iLista(vard, ini) }
            guard let d = r.doman else { return false }
            return Vard.sajt(d) == sajt
        }.map(\.json)
    }
}

/// Värdnamn: nivåer, listor och sajt (registrerbar domän).
enum Vard {
    /// Värden i en adress: små bokstäver, utan punkt sist.
    static func av(_ url: URL) -> String {
        var v = (url.host() ?? "").lowercased()
        while v.hasSuffix(".") { v.removeLast() }
        return v
    }

    static func utanWww(_ v: String) -> String { v.hasPrefix("www.") ? String(v.dropFirst(4)) : v }

    /// a.b.example.se -> [a.b.example.se, b.example.se, example.se], som tilläggets `suffix()` (toppdomänen ensam
    /// räknas inte).
    static func nivaer(_ v: String) -> [String] {
        let d = v.split(separator: ".", omittingEmptySubsequences: false)
        guard d.count >= 2 else { return v.isEmpty ? [] : [v] }
        return (0..<(d.count - 1)).map { d[$0...].joined(separator: ".") }
    }

    /// Finns värden eller en överordnad domän i mängden?
    static func iMangd(_ v: String, _ m: Set<String>) -> Bool {
        guard !v.isEmpty, !m.isEmpty else { return false }
        var s = Substring(v)
        while true {
            if m.contains(String(s)) { return true }
            guard let i = s.firstIndex(of: ".") else { return false }
            s = s[s.index(after: i)...]
        }
    }

    static func iLista(_ v: String, _ l: [String]) -> Bool { l.contains { v == $0 || v.hasSuffix("." + $0) } }

    /// Sajten (registrerbar domän, ungefär): shop.example.co.uk -> example.co.uk. Samma lista som vakten.
    static func sajt(_ v: String) -> String {
        let h = utanWww(v)
        if h.contains(":") || h.allSatisfy({ $0.isNumber || $0 == "." }) { return h }
        let d = h.split(separator: ".")
        guard d.count > 2 else { return h }
        let tva = d.suffix(2).joined(separator: ".")
        return flerled.contains(tva) ? d.suffix(3).joined(separator: ".") : tva
    }

    /// Flerledade publika suffix (en liten del av Public Suffix List), som `FLERLED` i tilläggets guard.js.
    static let flerled: Set<String> = Set((
        "co.uk org.uk ac.uk gov.uk me.uk net.uk ltd.uk plc.uk nhs.uk sch.uk police.uk " +
        "com.au net.au org.au edu.au gov.au asn.au id.au co.nz net.nz org.nz govt.nz ac.nz " +
        "co.jp ne.jp or.jp ac.jp go.jp gr.jp ed.jp lg.jp com.br net.br org.br gov.br edu.br " +
        "com.tr net.tr org.tr gen.tr biz.tr gov.tr edu.tr av.tr web.tr co.za org.za net.za gov.za ac.za web.za " +
        "com.mx org.mx net.mx gob.mx edu.mx com.ar net.ar org.ar gob.ar co.in net.in org.in gov.in ac.in firm.in gen.in ind.in " +
        "co.kr or.kr ne.kr go.kr ac.kr com.cn net.cn org.cn gov.cn edu.cn com.hk net.hk org.hk gov.hk edu.hk " +
        "com.sg net.sg org.sg gov.sg edu.sg com.tw net.tw org.tw gov.tw edu.tw com.my net.my org.my gov.my " +
        "co.id or.id web.id go.id ac.id co.th in.th or.th go.th ac.th com.ph net.ph org.ph gov.ph com.vn net.vn gov.vn " +
        "com.pk net.pk org.pk com.sa net.sa org.sa gov.sa com.eg org.eg gov.eg com.ng org.ng gov.ng co.ke or.ke go.ke " +
        "co.il org.il ac.il gov.il com.ua net.ua org.ua in.ua com.pl net.pl org.pl co.at or.at gv.at ac.at com.es org.es gob.es " +
        "com.co net.co org.co gov.co com.pe org.pe gob.pe com.ve co.ve com.uy com.ec com.bo com.py com.gt com.do com.pa com.sv " +
        "co.cr com.cu com.ru net.ru org.ru com.gr com.cy com.mt com.ro co.hu com.pt co.ma com.qa com.kw com.bh com.om " +
        "co.ae com.lb com.jo com.ge com.az com.kz co.uz com.bd com.np com.lk com.mm com.kh com.af com.gh com.et co.tz co.ug co.zm co.zw " +
        "github.io gitlab.io vercel.app netlify.app pages.dev workers.dev web.app firebaseapp.com appspot.com herokuapp.com " +
        "blogspot.com onrender.com glitch.me azurewebsites.net cloudfront.net fly.dev"
    ).split(separator: " ").map(String.init))
}
