import Foundation

/// E2E-klienten på iPhonen: pratar med `/chatt/v2` och låter kärnan sköta all kryptering. Samma flöde som datorns
/// `browser/e2e/klient.js` (sändning med 409/410 och omförsök, mottagning med kvittens först när tillståndet är
/// sparat, grupper, länkning, återställning, bilagor).
///
/// Ordningen: kärnans tillstånd sparas (krypterat) efter varje steg som ändrar sessionerna och innan något går
/// iväg till servern, så att en krasch aldrig lämnar en session som servern sett men telefonen glömt.
///
/// Ägare: E2E.
@MainActor
final class E2EKlient {
    let lagring: E2ELagring
    private let natet: E2ENat
    private let logg = Logg("E2E")
    private let tur = E2ETur()
    private(set) var h: Int?
    private(set) var jag: String?
    private(set) var enhetId: Int?
    private(set) var historik: E2EHistorik?
    private var auth: String?
    /// Kuvert som väntar på en gruppnyckel (Megolm-nyckeln kommer i ett eget Olm-meddelande).
    private var vantande: [String: [String: Any]] = [:]
    private var efter: Int64 = 0
    /// Avvisade kuvert (manipulerade, uppspelade, till fel enhet), senaste först. Visas inte som meddelanden.
    private(set) var avvisade: [(fel: String, fran: String?, tid: Date)] = []

    init(app: AppMiljo, konto: String) {
        lagring = E2ELagring(konto: konto)
        natet = E2ENat(app: app)
    }

    var plattform: String { "ios" }
    var namn: String { E2EKlient.enhetsnamn }
    static var enhetsnamn: String { UIDeviceNamn.namn }

    // MARK: Grunder

    /// Ett anrop till kärnan med den här klientens handtag.
    @discardableResult
    func k(_ op: String, _ a: [String: Any] = [:]) throws -> [String: Any] {
        guard let h else { throw E2EFel(kod: "stangd", text: "E2E är inte öppnad") }
        var f = a
        f["op"] = op
        f["h"] = h
        f["nu"] = Int64(Date().timeIntervalSince1970 * 1000)
        return try E2EKarna.krav(f)
    }

    func spara() throws { try lagring.sparaTillstand(try k("spara")["tillstand"] as? String ?? "") }

    func oppna() throws {
        if h != nil { return }
        try lagring.forbered()
        var f: [String: Any] = ["op": "oppna", "lagringsnyckel": try lagring.nyckel()]
        if let t = lagring.lasTillstand() { f["tillstand"] = t }
        let r = E2EKarna.anropa(f)
        if r["ok"] as? Bool != true {
            // Tillståndet går inte att öppna (fel nyckel efter en återställd telefon): börja om lokalt, aldrig tyst med fel nyckel
            logg.varning("tillståndet gick inte att öppna (\(r["fel"] as? String ?? "?")); E2E börjar om på den här telefonen")
            lagring.radera()
            try lagring.forbered()
            let ny = try E2EKarna.krav(["op": "oppna", "lagringsnyckel": try lagring.nyckel()])
            h = (ny["h"] as? NSNumber)?.intValue
        } else {
            h = (r["h"] as? NSNumber)?.intValue
        }
        if let h { historik = E2EHistorik(lagring: lagring, h: h) }
        uppdateraAuth()
    }

    func stang() {
        if let h { _ = E2EKarna.anropa(["op": "stang", "h": h]) }
        h = nil
        historik = nil
    }

    private func uppdateraAuth() {
        guard let s = try? k("status") else { return }
        jag = s["uuid"] as? String
        enhetId = (s["enhet_id"] as? NSNumber)?.intValue
        auth = (s["registrerad"] as? Bool == true) ? (try? k("enhet.auth"))?["huvud"] as? String : nil
    }

    var registrerad: Bool { auth != nil }

    func lokalStatus() -> [String: Any] { (try? k("status")) ?? [:] }

    func serverstatus() async throws -> [String: Any] { try await api("GET", "/chatt/v2/status", enhet: false).json }

    func api(_ metod: String, _ sokvag: String, _ kropp: [String: Any]? = nil, enhet: Bool = true, huvud: [String: String] = [:],
             tillat: Set<Int> = [], vanta: TimeInterval = 30) async throws -> (status: Int, json: [String: Any]) {
        var hv = huvud
        if enhet, let auth { hv["x-e2e-enhet"] = auth }
        return try await natet.anropa(metod, sokvag, kropp, huvud: hv, tillat: tillat, vanta: vanta)
    }

    private func registrerad(_ enhet: Int) throws {
        try k("identitet.registrerad", ["enhet_id": enhet])
        try spara()
        uppdateraAuth()
    }

    // MARK: Identitet

    /// Kontots första enhet: ny identitet och återställningskod. Koden visas för användaren och finns inte hos AdRaze.
    func skapaIdentitet() async throws -> String {
        try await tur.kor {
            let r = try self.k("identitet.skapa", ["plattform": self.plattform, "namn": self.namn])
            try self.spara()
            let svar = try await self.api("POST", "/chatt/v2/konto", E2EJSON.objekt(r["registrering"]), enhet: false).json
            try self.registrerad(Int(E2EJSON.tal(svar["enhet_id"]) ?? 0))
            await self.fyllPaNycklarUtanTur()
            return r["kod"] as? String ?? ""
        }
    }

    /// Alla enheter borta: koden öppnar valvet; identiteten och säkerhetsnumret är desamma som förut.
    func aterstall(kod: String) async throws {
        try await tur.kor {
            let t = try E2EKarna.krav(["op": "aterstall.token", "kod": kod])
            let v: [String: Any]
            do {
                v = try await self.api("GET", "/chatt/v2/valv", enhet: false, huvud: ["x-e2e-valv": t["valv_token"] as? String ?? ""]).json
            } catch let f as E2EFel where f.status == 403 || f.status == 404 {
                throw E2EFel(kod: "fel_kod", text: f.text, status: f.status)
            }
            let r = try self.k("aterstall.oppna", ["kod": kod, "valv": v["valv"] ?? "", "identitet": v["identitet"] ?? "",
                                                   "plattform": self.plattform, "namn": self.namn])
            try self.spara()
            let reg = E2EJSON.objekt(r["registrering"])
            let svar = try await self.api("POST", "/chatt/v2/enheter", ["valv_token": reg["valv_token"] ?? "", "enhet": reg["enhet"] ?? [:]], enhet: false).json
            try self.registrerad(Int(E2EJSON.tal(svar["enhet_id"]) ?? 0))
            await self.fyllPaNycklarUtanTur()
        }
    }

    func aterstallningskod() -> String? { (try? k("aterstallningskod"))?["kod"] as? String }

    // MARK: Länkning med QR-kod (plan 4, 3.10 A: den nya enheten visar koden, den med kamera skannar)

    /// Den nya enheten (utan identitet): öppnar reläet och ger QR-koden. Fortsätt med `lankaVantaPaSkanning`.
    func lankaBorja() async throws -> (qr: String, id: String) {
        let n = try k("lank.visa")
        let lid = try await api("POST", "/chatt/v2/lank", [:], enhet: false).json["lank_id"] as? String ?? ""
        return ("adraze-lank:1:\(lid):\(n["nyckel"] as? String ?? "")", lid)
    }

    /// Den nya enheten: väntar på att den andra skannar, och ger kontrollkoden som ska visas.
    func lankaVantaPaSkanning(_ lid: String, tid: TimeInterval = 300) async throws -> (kod: String, fran: String) {
        let s1 = try await vantaLank(lid, steg: 1, tid: tid)
        let s2 = try k("lank.svara", ["steg1": s1, "lank_id": lid, "svar": namn])
        _ = try await api("POST", "/chatt/v2/lank/steg", ["lank_id": lid, "steg": 2, "data": s2["steg2"] ?? ""], enhet: false)
        return (s2["kod"] as? String ?? "", s2["hej"] as? String ?? "")
    }

    /// Den nya enheten: tar emot identiteten när den andra godkänt, och registrerar sig.
    func lankaTaEmot(_ lid: String, tid: TimeInterval = 300) async throws {
        let s3 = try await vantaLank(lid, steg: 3, tid: tid)
        try await tur.kor {
            let r = try self.k("lank.ta_emot_hemligt", ["steg3": s3, "lank_id": lid, "plattform": self.plattform, "namn": self.namn])
            try self.spara()
            let reg = E2EJSON.objekt(r["registrering"])
            let svar = try await self.api("POST", "/chatt/v2/enheter", ["lankkod": reg["lankkod"] ?? "", "enhet": reg["enhet"] ?? [:]], enhet: false).json
            try self.registrerad(Int(E2EJSON.tal(svar["enhet_id"]) ?? 0))
            await self.fyllPaNycklarUtanTur()
        }
    }

    func lankaAvbryt() { _ = try? k("lank.avbryt") }

    /// Den befintliga enheten skannade QR-koden: ger kontrollkoden och den nya enhetens namn. Användaren jämför
    /// koden med den nya enhetens och anropar `lankaGodkann` (eller `lankaAvbryt`).
    func lankaSkannad(_ qr: String, tid: TimeInterval = 300) async throws -> (kod: String, namn: String, id: String) {
        let delar = qr.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ":", maxSplits: 3).map(String.init)
        guard delar.count == 4, delar[0] == "adraze-lank", delar[1] == "1",
              delar[2].range(of: "^[A-Za-z0-9_-]{16,64}$", options: .regularExpression) != nil,
              delar[3].range(of: "^[A-Za-z0-9+/=]{43,44}$", options: .regularExpression) != nil else {
            throw E2EFel(kod: "format", text: ct("Det är inte en AdRaze-kod för att länka en enhet."))
        }
        let lid = delar[2]
        let s1 = try k("lank.skanna", ["nyckel": delar[3], "lank_id": lid, "hej": namn])
        _ = try await api("POST", "/chatt/v2/lank/steg", ["lank_id": lid, "steg": 1, "data": s1["steg1"] ?? ""], enhet: false)
        let s2 = try await vantaLank(lid, steg: 2, tid: tid)
        let kontroll = try k("lank.kontroll", ["steg2": s2, "lank_id": lid])
        return (kontroll["kod"] as? String ?? "", kontroll["svar"] as? String ?? "", lid)
    }

    /// Kontrollkoden stämde: skicka identiteten (krypterad till den nya enhetens nyckel ur QR-koden).
    func lankaGodkann(_ lid: String) async throws {
        let lankkod = try await api("POST", "/chatt/v2/enheter/lankkod", [:]).json["lankkod"] as? String ?? ""
        let s3 = try k("lank.skicka_hemligt", ["lank_id": lid, "lankkod": lankkod])
        _ = try await api("POST", "/chatt/v2/lank/steg", ["lank_id": lid, "steg": 3, "data": s3["steg3"] ?? ""], enhet: false)
    }

    private func vantaLank(_ id: String, steg: Int, tid: TimeInterval) async throws -> String {
        let slut = Date().addingTimeInterval(tid)
        while Date() < slut {
            try Task.checkCancellation()
            let r = try await api("GET", "/chatt/v2/lank?id=\(id)&steg=\(steg)&vanta=25", enhet: false, vanta: 40).json
            if let d = r["data"] as? String { return d }
        }
        throw E2EFel(kod: "tidsgrans", text: ct("Länkningen tog för lång tid. Börja om."))
    }

    // MARK: Kontakter och säkerhetsnummer

    @discardableResult
    func uppdateraEnheter(_ uuid: String) async throws -> [String: Any] {
        let svar = try await api("GET", "/chatt/v2/enheter?uuid=\(uuid)").json
        let r = try k("kontakt.enheter", ["uuid": uuid, "svar": svar])
        if r["andrad"] as? Bool == true { logg.info("identiteten för en kontakt har ändrats\(r["blockerad"] as? Bool == true ? " (verifierad: väntar på godkännande)" : "")") }
        try spara()
        return r
    }

    private func hamtaBuntar(_ buntar: [String: Any]) async throws {
        for (uuid, ids) in buntar {
            let lista = ((ids as? [Any]) ?? []).compactMap { E2EJSON.text($0) }.joined(separator: ",")
            let svar = try await api("GET", "/chatt/v2/nycklar?uuid=\(uuid)&enheter=\(lista)").json
            try k("kontakt.buntar", ["uuid": uuid, "svar": svar])
        }
    }

    func kontaktStatus(_ uuid: String) -> [String: Any] { (try? k("kontakt.status", ["uuid": uuid])) ?? [:] }
    func sakerhetsnummer(_ uuid: String) throws -> [String: Any] { try k("sakerhetsnummer", ["uuid": uuid]) }

    /// Skannad QR-kod (`qr`) eller manuell markering (`qr == nil`). Ger om numren stämde.
    func verifiera(_ uuid: String, qr: String?) async throws -> Bool {
        try await tur.kor {
            let r = try self.k("verifiera", qr.map { ["uuid": uuid, "qr": $0] } ?? ["uuid": uuid, "markera": true])
            try self.spara()
            return r["stammer"] as? Bool ?? (qr == nil)
        }
    }

    func avverifiera(_ uuid: String) async throws {
        try await tur.kor { try self.k("verifiera", ["uuid": uuid, "avmarkera": true]); try self.spara() }
    }

    func godkannIdentitet(_ uuid: String) async throws {
        try await tur.kor { try self.k("kontakt.godkann", ["uuid": uuid]); try self.spara() }
    }

    // MARK: Skicka

    /// Kör en sändning tills servern tagit emot den: saknade enhetslistor och nyckelbuntar hämtas, 409/410
    /// (enheter tillagda eller bytta) ger ny lista och nytt försök, högst åtta varv.
    private func korSandning(_ op: String, _ a: [String: Any]) async throws -> (id: String, ts: Int64, spok: [String]) {
        for _ in 0..<8 {
            let r = try k(op, a)
            if let u = r["behover_enheter"] as? [String] { for x in u { try await uppdateraEnheter(x) }; continue }
            if let b = r["behover_buntar"] as? [String: Any] { try await hamtaBuntar(b); continue }
            if let u = r["blockerad"] as? String { throw E2EFel(kod: "identitet_andrad", text: "", uuid: u) }
            if let u = r["ingen_e2e"] as? String { throw E2EFel(kod: "ingen_e2e", text: ct("Mottagaren har ingen enhet med end-to-end-kryptering."), uuid: u) }
            try spara()   // sessionerna har gått framåt: spara innan något går iväg
            if let dela = r["begaran_dela"] as? [String: Any] {
                let s = try await api("POST", "/chatt/v2/meddelanden", dela, tillat: [409, 410])
                if s.status >= 400 { try avvisad(s.json); continue }
                try k("grupp.delat", ["grupp": r["grupp"] ?? "", "dela": r["dela"] ?? [:]])
                try spara()
                continue
            }
            var begaran = E2EJSON.objekt(r["begaran"])
            begaran["urgent"] = true
            let sokvag = op == "grupp.skicka" ? "/chatt/v2/grupper/meddelanden" : "/chatt/v2/meddelanden"
            let s = try await api("POST", sokvag, begaran, tillat: [409, 410])
            if s.status >= 400 { try avvisad(s.json); continue }
            return (r["id"] as? String ?? "", E2EJSON.tal(r["ts"]) ?? 0, (r["spok"] as? [String]) ?? [])
        }
        throw E2EFel(kod: "gav_upp", text: ct("Kunde inte skicka. Försök igen."))
    }

    private func avvisad(_ j: [String: Any]) throws {
        let lista = (j["lista"] as? [[String: Any]]) ?? [j]
        for f in lista { try k("avvisad", ["svar": f]) }
    }

    func skicka(till: [String], konv: [String: Any], typ: String, d: [String: Any]) async throws -> (id: String, ts: Int64) {
        try await tur.kor {
            let r = try await self.korSandning("skicka", ["till": till, "konv": konv, "typ": typ, "d": d])
            return (r.id, r.ts)
        }
    }

    // MARK: Grupper

    func nyGrupp(_ medlemmar: [String], namn: String) async throws -> String {
        try await tur.kor {
            let gid = try await self.api("POST", "/chatt/v2/grupper", ["medlemmar": medlemmar]).json["grupp"] as? String ?? ""
            let r = try self.k("grupp.ny", ["grupp": gid, "medlemmar": medlemmar, "namn": namn])
            try self.spara()
            _ = try await self.korSandning("skicka", ["till": medlemmar, "konv": ["grupp": gid], "typ": "grupp.inbjudan", "d": r["inbjudan"] ?? [:]])
            return gid
        }
    }

    func andraGrupp(_ gid: String, medlemmar: [String]) async throws {
        try await tur.kor {
            _ = try await self.api("POST", "/chatt/v2/grupper/medlemmar", ["grupp": gid, "medlemmar": medlemmar])
            let r = try self.k("grupp.andra", ["grupp": gid, "medlemmar": medlemmar])
            try self.spara()
            let till = (r["till"] as? [String]) ?? []
            if !till.isEmpty {
                _ = try await self.korSandning("skicka", ["till": till, "konv": ["grupp": gid], "typ": "grupp.andring", "d": r["andring"] ?? [:]])
            }
        }
    }

    func lamnaGrupp(_ gid: String) async throws {
        guard let jag, let info = gruppInfo(gid) else { return }
        try await andraGrupp(gid, medlemmar: info.medlemmar.filter { $0 != jag })
        try await tur.kor { try self.k("grupp.lamna", ["grupp": gid]); try self.spara() }
    }

    struct Gruppinfo { let namn: String; let medlemmar: [String]; let skapare: String; let utanfor: Bool; let sid: String? }

    func gruppInfo(_ gid: String) -> Gruppinfo? {
        guard let r = try? k("grupp.info", ["grupp": gid]) else { return nil }
        return Gruppinfo(namn: r["namn"] as? String ?? "", medlemmar: (r["medlemmar"] as? [String]) ?? [], skapare: r["skapare"] as? String ?? "",
                         utanfor: r["utanfor"] as? Bool ?? false, sid: r["sid"] as? String)
    }

    func gruppLista() async throws -> [String] {
        E2EJSON.lista(try await api("GET", "/chatt/v2/grupper/lista").json["grupper"]).compactMap { $0["grupp"] as? String }
    }

    func skickaGrupp(_ gid: String, typ: String, d: [String: Any]) async throws -> (id: String, ts: Int64) {
        try await tur.kor {
            let server = (try await self.api("GET", "/chatt/v2/grupper?grupp=\(gid)").json["medlemmar"] as? [String]) ?? []
            let r = try await self.korSandning("grupp.skicka", ["grupp": gid, "typ": typ, "d": d, "server_medlemmar": server])
            if !r.spok.isEmpty { self.logg.varning("servern visar \(r.spok.count) gruppmedlemmar som ingen i gruppen lagt till; de får ingen nyckel") }
            return (r.id, r.ts)
        }
    }

    // MARK: Ta emot

    /// Hämtar kön (väntar högst `vanta` sekunder), dekrypterar, sparar och kvitterar först därefter.
    func hamta(vanta: Int = 0) async throws -> [[String: Any]] {
        guard registrerad else { return [] }
        let kuvert = E2EJSON.lista(try await api("GET", "/chatt/v2/ko?efter=\(efter)&vanta=\(vanta)", vanta: TimeInterval(vanta + 15)).json["kuvert"])
        return try await tur.kor { try await self.behandla(kuvert) }
    }

    private func behandla(_ nya: [[String: Any]]) async throws -> [[String: Any]] {
        var ut: [[String: Any]] = []
        var kuvert = Array(vantande.values) + nya
        for k in nya { efter = max(efter, E2EJSON.tal(k["id"]) ?? 0) }
        var varv = 0
        while varv < 3 && !kuvert.isEmpty {
            varv += 1
            let r = try k("ta_emot", ["kuvert": kuvert])
            for hd in E2EJSON.lista(r["handelser"]) where hd["intern"] as? Bool != true {
                if hd["typ"] as? String == "avvisat" {
                    avvisade.insert((hd["fel"] as? String ?? "?", hd["fran"] as? String, Date()), at: 0)
                    logg.varning("ett kuvert avvisades: \(hd["fel"] as? String ?? "?")")
                }
                ut.append(hd)
            }
            try spara()
            let kvittera = E2EJSON.textlista(r["kvittera"])
            if !kvittera.isEmpty { _ = try await api("POST", "/chatt/v2/ko/kvittera", ["ids": kvittera]) }
            for id in kvittera { vantande[id] = nil }
            let vanta = Set(E2EJSON.textlista(r["vanta"]))
            let behover = (r["behover_enheter"] as? [String]) ?? []
            for u in behover { try await uppdateraEnheter(u) }
            kuvert = kuvert.filter { vanta.contains(E2EJSON.text($0["id"]) ?? "") }
            for k in kuvert { if let id = E2EJSON.text(k["id"]) { vantande[id] = k } }
            if behover.isEmpty { break }
        }
        if !ut.isEmpty { await fyllPaNycklarUtanTur() }
        return ut
    }

    /// Fyller på engångsnycklarna på servern när de börjar ta slut (och reservnyckeln om den saknas).
    private func fyllPaNycklarUtanTur() async {
        do {
            let st = try await api("GET", "/chatt/v2/nycklar/status").json
            let r = try k("nycklar.fyll", ["pa_servern": st["otk"] ?? 0, "reserv": st["reserv"] ?? false])
            guard r["otk"] != nil || r["reserv"] != nil else { return }
            try spara()
            var kropp: [String: Any] = ["otk": r["otk"] ?? []]
            if let reserv = r["reserv"] { kropp["reserv"] = reserv }
            _ = try await api("POST", "/chatt/v2/nycklar", kropp)
            try k("nycklar.publicerade")
            try spara()
        } catch { logg.varning("påfyllning av nycklar: \(error.localizedDescription)") }
    }

    // MARK: Bilagor (egen nyckel per fil; nyckel och kontrollsumma skickas i det krypterade meddelandet)

    struct Bilaga { let id: String; let nyckel: String; let digest: String; let storlek: Int }

    func laddaUpp(_ data: Data) async throws -> Bilaga {
        let r = try E2EKarna.krav(["op": "bilaga.kryptera", "data": data.base64EncodedString()])
        guard let chiffer = (r["chiffer"] as? String).flatMap({ Data(base64Encoded: $0) }) else { throw E2EFel(kod: "karna", text: "") }
        let b = try await api("POST", "/chatt/v2/bilagor", ["storlek": chiffer.count]).json
        let id = b["id"] as? String ?? "", del = Int(E2EJSON.tal(b["del_storlek"]) ?? 1_048_576), delar = Int(E2EJSON.tal(b["delar"]) ?? 1)
        for n in 0..<delar {
            let bit = chiffer.subdata(in: (n * del)..<min(chiffer.count, (n + 1) * del))
            _ = try await api("POST", "/chatt/v2/bilagor/del", ["id": id, "del": n, "data": bit.base64EncodedString()], vanta: 90)
        }
        _ = try await api("POST", "/chatt/v2/bilagor/klar", ["id": id])
        return Bilaga(id: id, nyckel: r["nyckel"] as? String ?? "", digest: r["digest"] as? String ?? "", storlek: data.count)
    }

    func laddaNed(id: String, nyckel: String, digest: String) async throws -> Data {
        var chiffer = Data()
        var n = 0, totalt = 1
        while n < totalt {
            let r = try await api("GET", "/chatt/v2/bilagor?id=\(id)&del=\(n)", vanta: 90).json
            chiffer.append(Data(base64Encoded: r["data"] as? String ?? "") ?? Data())
            totalt = Int(E2EJSON.tal(r["delar"]) ?? 1)
            n += 1
        }
        let r = try E2EKarna.krav(["op": "bilaga.dekryptera", "nyckel": nyckel, "digest": digest, "chiffer": chiffer.base64EncodedString()])
        return Data(base64Encoded: r["data"] as? String ?? "") ?? Data()
    }

    // MARK: Enheter

    func taBortEnhet(_ id: Int) async throws { _ = try await api("POST", "/chatt/v2/enheter/bort", ["id": id]) }
}

/// Ett i taget: kärnans tillstånd och kön ändras aldrig av två flöden samtidigt (som `lasa` i datorns klient.js).
@MainActor
final class E2ETur {
    private var upptagen = false
    private var ko: [CheckedContinuation<Void, Never>] = []

    func kor<T>(_ f: () async throws -> T) async throws -> T {
        if upptagen { await withCheckedContinuation { ko.append($0) } } else { upptagen = true }
        defer { if ko.isEmpty { upptagen = false } else { ko.removeFirst().resume() } }
        return try await f()
    }
}

/// HTTP mot `<api>/chatt/v2/*` med kontots token. Samma val av server som chatten (`-api` i självtesterna),
/// och samma väg till en lokal testserver (`LokalHTTP`).
@MainActor
final class E2ENat {
    private let app: AppMiljo
    let bas: URL
    private let session: URLSession

    init(app: AppMiljo) {
        self.app = app
        if let s = app.startargument.text("api"), let u = URL(string: s), u.scheme != nil { bas = u } else { bas = URL(string: "https://api.adraze.app")! }
        let k = URLSessionConfiguration.ephemeral
        k.httpCookieStorage = nil
        k.httpShouldSetCookies = false
        k.urlCache = nil
        if bas.scheme == "http" { k.protocolClasses = [LokalHTTP.self] }
        session = URLSession(configuration: k)
    }

    func anropa(_ metod: String, _ sokvag: String, _ kropp: [String: Any]?, huvud: [String: String], tillat: Set<Int>,
                vanta: TimeInterval) async throws -> (status: Int, json: [String: Any]) {
        guard let token = await app.konto.token() else { throw E2EFel(kod: "unauthorized", text: ct("Logga in för att använda chatten."), status: 401) }
        guard let url = URL(string: bas.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + sokvag) else {
            throw E2EFel(kod: "format", text: "ogiltig adress")
        }
        var r = URLRequest(url: url)
        r.httpMethod = metod
        r.timeoutInterval = vanta
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        for (k, v) in huvud { r.setValue(v, forHTTPHeaderField: k) }
        if metod == "POST" {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: kropp ?? [:])
        }
        let data: Data, svar: URLResponse
        do { (data, svar) = try await session.data(for: r) } catch {
            throw E2EFel(kod: "network", text: ct("Kunde inte nå chatten. Kontrollera din uppkoppling."))
        }
        let status = (svar as? HTTPURLResponse)?.statusCode ?? 0
        let json = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        if status >= 400 && !tillat.contains(status) {
            throw E2EFel(kod: json["error"] as? String ?? "http_\(status)", text: json["message"] as? String ?? "", status: status, svar: json,
                         uuid: json["uuid"] as? String)
        }
        return (status, json)
    }
}

/// Enhetens namn i listan "Dina enheter" (iOS ger bara "iPhone" utan särskild behörighet).
enum UIDeviceNamn {
    @MainActor static var namn: String {
        #if targetEnvironment(simulator)
        return "iPhone (simulator)"
        #else
        return "iPhone"
        #endif
    }
}
