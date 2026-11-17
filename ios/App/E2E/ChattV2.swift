import Foundation
import Observation

/// Meddelandelagret med end-to-end-kryptering (plan 4, fas 1–2): samma `ChattLager` som `ChattV1`, så vyerna och
/// `ChattLage` ändras inte.
///
/// - **Tvåpersonschatt där båda har E2E-enheter:** nya meddelanden, reaktioner och raderingar går som Olm-kuvert
///   till varje enhet (`/chatt/v2`). Äldre meddelanden från tiden före ligger kvar på servern med den äldre
///   krypteringen och visas som förut; de flyttas inte (migreringen, plan 5.2, är inte byggd).
/// - **Kontakt utan E2E:** chatten fortsätter med v1 och märks "Äldre kryptering" (plan 5.3).
/// - **Grupper:** nya grupper där alla har E2E blir v2-grupper (Megolm, `e2e-<id>`). Befintliga grupper är v1.
/// - **Allt annat** (profil, kontakter, rapporter, v1-grupper) går som förut genom `ChattV1`.
///
/// Historiken för E2E-meddelanden finns bara på enheterna (`E2EHistorik`, krypterad i vila).
///
/// Ägare: E2E.
@MainActor
@Observable
final class ChattV2: ChattLager {
    enum Lage: Equatable {
        case av, startar
        /// Den här iPhonen har en E2E-enhet.
        case aktiv
        /// Kontot har E2E på en annan enhet: den här måste länkas eller återställas med koden.
        case behoverLankas
        case fel(String)
    }

    /// Vad konversationsraden visar (sant i varje läge: "aldrig AdRaze kan läsa" bara när chatten är E2E).
    enum Kryptering: Equatable {
        /// E2E. `aldreFore`: konversationen har äldre meddelanden (v1) från före det här datumet.
        case e2e(aldreFore: Date?)
        /// Säkerhetsnumret har ändrats. `blockerad`: kontakten var verifierad och inget skickas förrän användaren godkänt.
        case varning(uuid: String, blockerad: Bool)
        case aldre(Orsak)

        enum Orsak: Equatable { case kontaktenSaknar(String), inteLankad, grupp, startar }
    }

    static let gruppPrefix = "e2e-"

    let v1: ChattV1
    private(set) var lage: Lage = .av
    /// Ökar när något som raderna visar har ändrats (status, varningar, nya E2E-kontakter).
    private(set) var version = 0
    /// Återställningskoden är ny och användaren har inte bekräftat att den är sparad.
    private(set) var kodEjSparad = false

    @ObservationIgnored private(set) var e2e: E2EKlient?
    @ObservationIgnored private let app: AppMiljo
    @ObservationIgnored private let logg = Logg("E2E")
    @ObservationIgnored private var uuidPerId: [String: String] = [:]
    @ObservationIgnored private var idPerUuid: [String: String] = [:]
    @ObservationIgnored private var namnPerId: [String: String] = [:]
    @ObservationIgnored private var v1Sedan: [KonvId: Int64] = [:]
    @ObservationIgnored private var e2eSedan: [KonvId: Int64] = [:]
    @ObservationIgnored private var forstaE2E: [KonvId: Date] = [:]
    @ObservationIgnored private var harV1: [KonvId: Bool] = [:]
    @ObservationIgnored private var bilagor: [String: (id: String, nyckel: String, digest: String)] = [:]
    @ObservationIgnored private var pumpar = false
    /// Självtestet: hämta inte E2E-kön (så att ett kuvert hinner ändras på servern innan det hämtas).
    @ObservationIgnored var pausad = false

    init(app: AppMiljo) {
        self.app = app
        v1 = ChattV1(app: app)
    }

    var jag: ChattJag? { v1.jag }

    // MARK: Start

    func lasUpp() async throws -> ChattUpplasning {
        let r = try await v1.lasUpp()
        if r == .klar { await startaE2E() }
        return r
    }

    func skapaProfil(_ anvandarnamn: String) async throws {
        try await v1.skapaProfil(anvandarnamn)
        await startaE2E()
    }

    private var kodnyckel: String { "e2e.kodSparad.\(v1.jag?.id ?? "")" }

    /// Öppnar E2E för kontot. Första enheten skapar identiteten (och visar återställningskoden); finns identiteten
    /// redan på en annan enhet måste den här länkas eller återställas.
    ///
    /// En start i taget: två samtidiga (chatten låses upp från två håll) skulle annars kunna skapa identiteten på
    /// servern i den ena och radera den lokalt i den andra.
    func startaE2E() async {
        if let pagar = startUppgift { await pagar.value; return }
        let t = Task { await starta() }
        startUppgift = t
        await t.value
        startUppgift = nil
    }

    @ObservationIgnored private var startUppgift: Task<Void, Never>?

    private func starta() async {
        guard let anv = v1.jag?.id else { return }
        if e2e?.lagring.konto != anv {
            e2e?.stang()
            e2e = E2EKlient(app: app, konto: anv)
            uuidPerId = [:]; idPerUuid = [:]; v1Sedan = [:]; e2eSedan = [:]; forstaE2E = [:]; harV1 = [:]
            // Bara när kontot byts (eller första gången): annars ligger läget kvar tills det nya är känt, så att ett
            // öppet ark (länkningen, återställningen) inte stängs mitt i
            lage = .startar
        }
        guard let e2e else { return }
        do {
            try e2e.oppna()
            let server = try await e2e.serverstatus()
            let harServer = server["har_identitet"] as? Bool == true
            let enheter = E2EJSON.lista(server["enheter"]).compactMap { E2EJSON.tal($0["id"]) }.map(Int.init)
            if e2e.registrerad, harServer, server["uuid"] as? String == e2e.jag, let m = e2e.enhetId, enheter.contains(m) {
                lage = .aktiv
            } else if !harServer {
                if e2e.lokalStatus()["har_identitet"] as? Bool == true { try borjaOmLokalt() }
                _ = try await self.e2e?.skapaIdentitet()
                UserDefaults.standard.set(false, forKey: kodnyckel)
                kodEjSparad = true
                lage = .aktiv
                logg.info("E2E: ny identitet skapad för kontot (första enheten)")
            } else {
                // Kontot har E2E på en annan enhet. Har den här iPhonen tagits bort (eller identiteten bytts) gäller
                // dess nycklar inte längre: börja om lokalt och länka igen.
                if e2e.registrerad || e2e.lokalStatus()["har_identitet"] as? Bool == true { try borjaOmLokalt() }
                lage = .behoverLankas
            }
            kodEjSparad = lage == .aktiv && UserDefaults.standard.object(forKey: kodnyckel) as? Bool == false
        } catch let f as E2EFel where f.status == 404 {
            // Servern har inte /chatt/v2 (före driftsättningen): chatten går som förut, märkt "Äldre kryptering"
            logg.info("E2E: servern har inte /chatt/v2; chatten går med den äldre krypteringen")
            lage = .av
        } catch {
            logg.varning("E2E kunde inte starta: \(error.localizedDescription)")
            lage = .fel(error.localizedDescription)
        }
        version += 1
    }

    private func borjaOmLokalt() throws {
        guard let gammal = e2e else { return }
        gammal.stang()
        gammal.lagring.radera()
        let ny = E2EKlient(app: app, konto: gammal.lagring.konto)
        try ny.oppna()
        e2e = ny
    }

    func kodArSparad() {
        UserDefaults.standard.set(true, forKey: kodnyckel)
        kodEjSparad = false
    }

    /// Efter länkning eller återställning: den här iPhonen har nu en enhet.
    func lankad() async {
        UserDefaults.standard.set(true, forKey: kodnyckel)
        await startaE2E()
    }

    // MARK: Kontakter och grupper

    func kontakter() async throws -> ChattKontaktlista {
        let l = try await v1.kontakter()
        for p in l.kontakter + l.inkommande + l.utgaende { namnPerId[p.id] = p.anvandarnamn }
        if lage == .aktiv { await uppdateraE2EKontakter(l.kontakter.map(\.id)) }
        return l
    }

    /// Vilka kontakter som har E2E (en identitet och minst en enhet).
    private func uppdateraE2EKontakter(_ ids: [String]) async {
        guard let e2e, !ids.isEmpty else { return }
        do {
            let fore = uuidPerId
            for bit in stride(from: 0, to: ids.count, by: 150) {
                let del = ids[bit..<min(ids.count, bit + 150)].filter { $0.allSatisfy(\.isNumber) }
                guard !del.isEmpty else { continue }
                let r = try await e2e.api("GET", "/chatt/v2/personer?id=" + del.joined(separator: ",")).json
                for p in E2EJSON.lista(r["personer"]) {
                    guard let id = E2EJSON.text(p["id"]) else { continue }
                    if let u = p["uuid"] as? String, (E2EJSON.tal(p["enheter"]) ?? 0) > 0 {
                        uuidPerId[id] = u
                        idPerUuid[u] = id
                    } else {
                        uuidPerId[id] = nil
                    }
                }
            }
            if fore != uuidPerId { version += 1 }
        } catch { logg.varning("E2E-kontakter: \(error.localizedDescription)") }
    }

    func grupper() async throws -> [ChattGrupp] {
        var ut = try await v1.grupper()
        guard lage == .aktiv, let e2e, let hist = e2e.historik else { return ut }
        await pumpa()
        for gid in (try? await e2e.gruppLista()) ?? [] {
            guard let info = e2e.gruppInfo(gid), !info.utanfor else { continue }
            let k = KonvId(sort: .grupp, id: Self.gruppPrefix + gid)
            let poster = hist.poster(k.nyckel).filter { $0.typ == "msg" }
            let olasta = poster.filter { !$0.mitt && !$0.borta && $0.lokal > hist.last(k.nyckel) }.count
            let agare = await anvandarId(info.skapare) ?? ""
            ut.append(ChattGrupp(id: k.id, namn: info.namn.isEmpty ? ct("Grupp") : info.namn, agare: agare,
                                 antal: info.medlemmar.count, sista: poster.last.map { Date(timeIntervalSince1970: Double($0.ts) / 1000) },
                                 olasta: olasta, avatar: nil))
        }
        return ut
    }

    // MARK: Inkorgen och hämtning

    func inkorg(_ kontakter: [ChattPerson], _ grupper: [ChattGrupp]) async throws -> [KonvId: ChattSammanfattning] {
        await pumpa()
        var ut = try await v1.inkorg(kontakter, grupper.filter { !$0.id.hasPrefix(Self.gruppPrefix) })
        for p in kontakter {
            let k = KonvId(sort: .dm, id: p.id)
            guard let s = sammanfattning(k) else { continue }
            if var v = ut[k] {
                if let e = s.senaste, (v.senaste?.tid ?? .distantPast) <= e.tid { v.senaste = e }
                v.olasta += s.olasta
                ut[k] = v
            } else {
                ut[k] = s
            }
        }
        for g in grupper where g.id.hasPrefix(Self.gruppPrefix) {
            let k = KonvId(sort: .grupp, id: g.id)
            ut[k] = sammanfattning(k) ?? ChattSammanfattning(senaste: nil, olasta: 0, lastTill: nil, skriver: [])
        }
        return ut
    }

    private func sammanfattning(_ k: KonvId) -> ChattSammanfattning? {
        guard let hist = e2e?.historik else { return nil }
        let poster = hist.poster(k.nyckel).filter { $0.typ == "msg" }
        guard let sista = poster.last else { return nil }
        let olasta = poster.filter { !$0.mitt && !$0.borta && $0.lokal > hist.last(k.nyckel) }.count
        return ChattSammanfattning(senaste: meddelande(sista, k), olasta: olasta, lastTill: nil, skriver: [])
    }

    func hamta(_ k: KonvId, sedan: Int64, andratSedan: Int64) async throws -> ChattHamtning {
        await pumpa()
        if sedan == 0 { v1Sedan[k] = 0; e2eSedan[k] = 0 }
        var ut: ChattHamtning
        if k.sort == .grupp && k.id.hasPrefix(Self.gruppPrefix) {
            ut = ChattHamtning(meddelanden: [], andringar: [], servertid: 0, lastTill: nil, lastAv: [:], skriver: [])
        } else {
            ut = try await v1.hamta(k, sedan: v1Sedan[k] ?? sedan, andratSedan: andratSedan)
            if let m = ut.meddelanden.last?.ms { v1Sedan[k] = max(v1Sedan[k] ?? 0, m) }
            if ut.meddelanden.contains(where: { $0.innehall.arMeddelande }) { harV1[k] = true }
        }
        if let hist = e2e?.historik {
            let fran = e2eSedan[k] ?? 0
            var hogst = fran
            for p in hist.poster(k.nyckel) {
                let andrad = p.borta ? (p.andrad ?? p.lokal) : p.lokal
                guard p.lokal > fran || andrad > fran else { continue }
                hogst = max(hogst, p.lokal, andrad)
                if p.lokal > fran { ut.meddelanden.append(meddelande(p, k)) } else { ut.andringar.append(meddelande(p, k)) }
            }
            e2eSedan[k] = hogst
            if forstaE2E[k] == nil, let f = hist.poster(k.nyckel).first(where: { $0.typ == "msg" }) {
                forstaE2E[k] = Date(timeIntervalSince1970: Double(f.ts) / 1000)
                version += 1
            }
            hist.markeraLast(k.nyckel)
            ut.meddelanden.sort { $0.ms < $1.ms }
        }
        return ut
    }

    func markeraLast(_ k: KonvId) async throws {
        e2e?.historik?.markeraLast(k.nyckel)
        if !(k.sort == .grupp && k.id.hasPrefix(Self.gruppPrefix)) { try await v1.markeraLast(k) }
    }

    /// Hämtar E2E-kön (utan att vänta) och lägger händelserna i historiken. Anropas av listan och den öppna chatten.
    func pumpa() async {
        guard lage == .aktiv, let e2e, let hist = e2e.historik, !pumpar, !pausad else { return }
        pumpar = true
        defer { pumpar = false }
        do {
            let fore = e2e.avvisade.count
            for hd in try await e2e.hamta(vanta: 0) { await ta(hd, hist) }
            if e2e.avvisade.count != fore { version += 1 }
        } catch { logg.varning("E2E-kön: \(error.localizedDescription)") }
    }

    private func ta(_ hd: [String: Any], _ hist: E2EHistorik) async {
        let typ = hd["typ"] as? String ?? ""
        guard ["msg", "rx", "del"].contains(typ), let e2e else {
            if typ.hasPrefix("grupp.") { version += 1 }
            return
        }
        let konv = E2EJSON.objekt(hd["konv"])
        let fran = hd["fran"] as? String ?? ""
        let mitt = fran == e2e.jag
        let k: KonvId
        if let g = konv["grupp"] as? String {
            k = KonvId(sort: .grupp, id: Self.gruppPrefix + g)
        } else if let u = konv["dm"] as? String, u != e2e.jag, let id = await anvandarId(u) {
            k = KonvId(sort: .dm, id: id)
        } else { return }
        let d = E2EJSON.objekt(hd["d"])
        let ts = E2EJSON.tal(hd["ts"]) ?? Int64(Date().timeIntervalSince1970 * 1000)
        switch typ {
        case "del":
            hist.radera(E2EJSON.text(d["m"]) ?? "", av: fran, i: k.nyckel)
        case "rx":
            let id = "rx-\(fran)-\(E2EJSON.text(d["m"]) ?? "")-\(d["e"] as? String ?? "")"
            hist.lagg([E2EPost(id: id, fran: fran, mitt: mitt, ts: ts, lokal: hist.tick(), typ: "rx", d: E2EJSON.kodad(d))], i: k.nyckel)
        default:
            hist.lagg([E2EPost(id: hd["id"] as? String ?? "", fran: fran, mitt: mitt, ts: ts, lokal: hist.tick(), typ: "msg", d: E2EJSON.kodad(d))], i: k.nyckel)
        }
    }

    /// En post i historiken som meddelande för vyerna.
    private func meddelande(_ p: E2EPost, _ k: KonvId) -> ChattMeddelande {
        let jagId = v1.jag?.id ?? ""
        let franId = p.mitt ? jagId : (idPerUuid[p.fran] ?? p.fran)
        let namn = p.mitt ? (v1.jag?.anvandarnamn ?? "") : (namnPerId[franId] ?? "?")
        var innehall: ChattInnehall = .olasbar
        var citat: ChattCitat?
        if p.borta {
            innehall = .borttaget
        } else if let d = E2EJSON.avkodad(p.d) as? [String: Any] {
            switch p.typ {
            case "rx":
                innehall = .reaktion(mal: E2EJSON.text(d["m"]) ?? "", emoji: d["e"] as? String ?? "", pa: d["on"] as? Bool ?? true)
            case "msg":
                let text = d["text"] as? String ?? ""
                if let r = d["r"] as? [String: Any] {
                    citat = ChattCitat(id: E2EJSON.text(r["id"]) ?? "", vem: String((r["u"] as? String ?? "").prefix(40)),
                                       text: String((r["t"] as? String ?? "").prefix(140)), bild: r["img"] as? Bool ?? false)
                }
                if let b = d["bilaga"] as? [String: Any], let id = b["id"] as? String, let n = b["nyckel"] as? String, let dg = b["digest"] as? String {
                    let ref = Self.gruppPrefix + id
                    bilagor[ref] = (id, n, dg)
                    let w = Int(E2EJSON.tal(b["w"]) ?? 1), h = Int(E2EJSON.tal(b["h"]) ?? 1)
                    if d["sort"] as? String == "video" {
                        innehall = .video(ChattVideoinfo(bilagor: [ref], mime: b["mime"] as? String ?? "video/mp4", bredd: w, hojd: h,
                                                         langd: (b["langd"] as? NSNumber)?.doubleValue ?? 0,
                                                         tumnagel: (b["tumnagel"] as? String).flatMap { Data(base64Encoded: $0) }), text: text)
                    } else {
                        innehall = .bild(ChattBildinfo(bilaga: ref, mime: b["mime"] as? String ?? "image/jpeg", bredd: w, hojd: h, klistermarke: false), text: text)
                    }
                } else {
                    innehall = .text(text)
                }
            default:
                innehall = .kontroll
            }
        }
        return ChattMeddelande(id: p.id, fran: franId, franNamn: namn, mitt: p.mitt, tid: Date(timeIntervalSince1970: Double(p.ts) / 1000),
                               innehall: innehall, svar: citat, redigerad: false, ms: p.lokal)
    }

    // MARK: Skicka och ändra

    private enum Mal { case dm(String), grupp(String) }

    /// Vart ett E2E-meddelande ska, eller `nil` om konversationen går med v1.
    private func mal(_ k: KonvId) -> Mal? {
        guard lage == .aktiv else { return nil }
        if k.sort == .grupp { return k.id.hasPrefix(Self.gruppPrefix) ? .grupp(String(k.id.dropFirst(Self.gruppPrefix.count))) : nil }
        return uuidPerId[k.id].map { .dm($0) }
    }

    private func skickaE2E(_ m: Mal, typ: String, d: [String: Any]) async throws -> (id: String, ts: Int64) {
        guard let e2e else { throw E2EFel(kod: "stangd", text: "") }
        do {
            switch m {
            case .dm(let uuid): return try await e2e.skicka(till: [uuid], konv: ["dm": uuid], typ: typ, d: d)
            case .grupp(let gid): return try await e2e.skickaGrupp(gid, typ: typ, d: d)
            }
        } catch let f as E2EFel where f.kod == "identitet_andrad" {
            version += 1
            throw f
        }
    }

    func skicka(_ k: KonvId, _ u: ChattUtkast) async throws -> ChattMeddelande {
        guard let m = mal(k) else { return try await v1.skicka(k, u) }
        guard let e2e, let hist = e2e.historik else { throw E2EFel(kod: "stangd", text: "") }
        var d: [String: Any] = ["text": u.text]
        if let c = u.svar { d["r"] = ["id": c.id, "u": c.vem, "t": String(c.text.prefix(140)), "img": c.bild] }
        if let b = u.bild {
            let bl = try await e2e.laddaUpp(b.data)
            d["sort"] = "bild"
            d["bilaga"] = ["id": bl.id, "nyckel": bl.nyckel, "digest": bl.digest, "storlek": bl.storlek, "mime": b.mime, "w": b.bredd, "h": b.hojd]
        } else if let v = u.video {
            let bl = try await e2e.laddaUpp(v.data)
            d["sort"] = "video"
            var b: [String: Any] = ["id": bl.id, "nyckel": bl.nyckel, "digest": bl.digest, "storlek": bl.storlek, "mime": v.mime,
                                    "w": v.bredd, "h": v.hojd, "langd": (v.langd * 10).rounded() / 10]
            if let t = v.tumnagel, t.count < 6_000 { b["tumnagel"] = t.base64EncodedString() }
            d["bilaga"] = b
        }
        let r = try await skickaE2E(m, typ: "msg", d: d)
        let p = E2EPost(id: r.id, fran: e2e.jag ?? "", mitt: true, ts: r.ts, lokal: hist.tick(), typ: "msg", d: E2EJSON.kodad(d))
        hist.lagg([p], i: k.nyckel)
        if forstaE2E[k] == nil { forstaE2E[k] = Date(timeIntervalSince1970: Double(r.ts) / 1000); version += 1 }
        return meddelande(p, k)
    }

    /// v1-meddelanden har id av siffror; E2E-meddelanden har kärnans id (hex).
    private func arV1(_ id: String) -> Bool { !id.isEmpty && id.allSatisfy(\.isNumber) }

    func reagera(_ k: KonvId, pa mal: ChattMeddelande, emoji: String, pa paslagen: Bool, befintlig: String?) async throws -> String {
        guard let m = self.mal(k), !arV1(mal.id), let e2e, let hist = e2e.historik else {
            return try await v1.reagera(k, pa: mal, emoji: emoji, pa: paslagen, befintlig: befintlig)
        }
        let d: [String: Any] = ["m": mal.id, "e": emoji, "on": paslagen]
        let r = try await skickaE2E(m, typ: "rx", d: d)
        let id = "rx-\(e2e.jag ?? "")-\(mal.id)-\(emoji)"
        hist.lagg([E2EPost(id: id, fran: e2e.jag ?? "", mitt: true, ts: r.ts, lokal: hist.tick(), typ: "rx", d: E2EJSON.kodad(d))], i: k.nyckel)
        return id
    }

    func angra(_ k: KonvId, id: String) async throws {
        guard let m = mal(k), !arV1(id), let e2e, let hist = e2e.historik else { return try await v1.angra(k, id: id) }
        _ = try await skickaE2E(m, typ: "del", d: ["m": id])
        hist.radera(id, av: e2e.jag ?? "", i: k.nyckel)
    }

    func dolj(_ k: KonvId, id: String) async throws {
        if !arV1(id), let hist = e2e?.historik { hist.dolj(id, i: k.nyckel); return }
        try await v1.dolj(k, id: id)
    }

    func bilaga(_ k: KonvId, id: String) async throws -> Data {
        guard id.hasPrefix(Self.gruppPrefix) else { return try await v1.bilaga(k, id: id) }
        guard let e2e, let b = bilagor[id] else { throw E2EFel(kod: "not_found", text: ct("Bilagan finns inte längre.")) }
        return try await e2e.laddaNed(id: b.id, nyckel: b.nyckel, digest: b.digest)
    }

    /// "Skriver…" går inte i E2E-chattar (det vore en okrypterad signal till servern); v1 som förut.
    func skriver(_ k: KonvId) async {
        if mal(k) == nil { await v1.skriver(k) }
    }

    // MARK: Grupper

    func skapaGrupp(_ namn: String, medlemmar: [ChattPerson]) async throws -> String {
        let uuids = medlemmar.compactMap { uuidPerId[$0.id] }
        if lage == .aktiv, let e2e, !medlemmar.isEmpty, uuids.count == medlemmar.count {
            let gid = try await e2e.nyGrupp(uuids, namn: namn)
            version += 1
            return Self.gruppPrefix + gid
        }
        return try await v1.skapaGrupp(namn, medlemmar: medlemmar)
    }

    func medlemmar(_ gid: String) async throws -> [ChattMedlem] {
        guard gid.hasPrefix(Self.gruppPrefix), let e2e else { return try await v1.medlemmar(gid) }
        guard let info = e2e.gruppInfo(String(gid.dropFirst(Self.gruppPrefix.count))) else { return [] }
        var ut: [ChattMedlem] = []
        for u in info.medlemmar {
            let id = await anvandarId(u) ?? u
            let namn = u == e2e.jag ? (v1.jag?.anvandarnamn ?? "") : (namnPerId[id] ?? "?")
            ut.append(ChattMedlem(id: id, anvandarnamn: namn, avatar: nil, admin: u == info.skapare, online: nil, senastSedd: nil))
        }
        return ut
    }

    func laggTill(_ gid: String, _ p: ChattPerson) async throws {
        guard gid.hasPrefix(Self.gruppPrefix), let e2e else { return try await v1.laggTill(gid, p) }
        let g = String(gid.dropFirst(Self.gruppPrefix.count))
        guard let u = uuidPerId[p.id] else {
            throw E2EFel(kod: "ingen_e2e", text: ct("{namn} har inte end-to-end-kryptering än och kan inte vara med i en krypterad grupp.", ["namn": p.anvandarnamn]))
        }
        guard let info = e2e.gruppInfo(g) else { throw E2EFel(kod: "okand_grupp", text: "") }
        try await e2e.andraGrupp(g, medlemmar: info.medlemmar + [u])
    }

    func lamna(_ gid: String) async throws {
        guard gid.hasPrefix(Self.gruppPrefix), let e2e else { return try await v1.lamna(gid) }
        try await e2e.lamnaGrupp(String(gid.dropFirst(Self.gruppPrefix.count)))
    }

    /// Tar bort en medlem ur en E2E-grupp (gruppens nyckel byts innan nästa meddelande).
    func taBort(_ p: ChattMedlem, ur gid: String) async throws {
        guard gid.hasPrefix(Self.gruppPrefix), let e2e, let u = uuidPerId[p.id] ?? idPerUuid.first(where: { $0.value == p.id })?.key else { return }
        let g = String(gid.dropFirst(Self.gruppPrefix.count))
        guard let info = e2e.gruppInfo(g) else { return }
        try await e2e.andraGrupp(g, medlemmar: info.medlemmar.filter { $0 != u })
    }

    // MARK: Kontakter och rapporter (som förut)

    func rapportera(anvandarnamn: String, orsak: String, detaljer: String, meddelande: ChattMeddelande?, i k: KonvId) async throws {
        try await v1.rapportera(anvandarnamn: anvandarnamn, orsak: orsak, detaljer: detaljer, meddelande: meddelande, i: k)
    }
    func forfragan(_ anvandarnamn: String) async throws -> String { try await v1.forfragan(anvandarnamn) }
    func acceptera(_ anvandarnamn: String) async throws { try await v1.acceptera(anvandarnamn) }
    func taBortKontakt(_ anvandarnamn: String) async throws { try await v1.taBortKontakt(anvandarnamn) }
    func blockera(_ anvandarnamn: String) async throws { try await v1.blockera(anvandarnamn) }

    // MARK: Det vyerna frågar

    /// AdRaze-kontots id för en E2E-uuid (vänner, gruppmedlemmar, egna).
    func anvandarId(_ u: String) async -> String? {
        if u == e2e?.jag { return v1.jag?.id }
        if let id = idPerUuid[u] { return id }
        guard let e2e, let r = try? await e2e.api("GET", "/chatt/v2/personer?uuid=\(u)").json,
              let p = E2EJSON.lista(r["personer"]).first, let id = E2EJSON.text(p["id"]) else { return nil }
        idPerUuid[u] = id
        if let n = p["username"] as? String { namnPerId[id] = n }
        return id
    }

    func uuid(for anvandare: String) -> String? { uuidPerId[anvandare] }
    func namn(for anvandare: String) -> String { namnPerId[anvandare] ?? "?" }

    func kryptering(_ k: KonvId) -> Kryptering {
        _ = version
        switch lage {
        case .aktiv: break
        case .behoverLankas: return .aldre(.inteLankad)
        case .av, .startar, .fel: return .aldre(.startar)
        }
        if k.sort == .grupp { return k.id.hasPrefix(Self.gruppPrefix) ? .e2e(aldreFore: nil) : .aldre(.grupp) }
        guard let u = uuidPerId[k.id] else { return .aldre(.kontaktenSaknar(namnPerId[k.id] ?? "?")) }
        if let s = e2e?.kontaktStatus(u) {
            if s["vantar_godkannande"] as? Bool == true { return .varning(uuid: u, blockerad: true) }
            if s["andrad"] as? Bool == true, let t = E2EJSON.tal(s["andrad_ts"]), t > (UserDefaults.standard.object(forKey: "e2e.sett.\(u)") as? NSNumber)?.int64Value ?? 0 {
                return .varning(uuid: u, blockerad: false)
            }
        }
        return .e2e(aldreFore: harV1[k] == true ? forstaE2E[k] : nil)
    }

    /// Varningen om ändrat säkerhetsnummer är sedd (overifierad kontakt: inget behöver godkännas).
    func varningSedd(_ uuid: String) {
        if let t = E2EJSON.tal(e2e?.kontaktStatus(uuid)["andrad_ts"]) { UserDefaults.standard.set(NSNumber(value: t), forKey: "e2e.sett.\(uuid)") }
        version += 1
    }

    func godkann(_ uuid: String) async throws {
        try await e2e?.godkannIdentitet(uuid)
        varningSedd(uuid)
    }

    func uppdatera() { version += 1 }

    /// Stänger E2E och öppnar igen från Keychain och filerna (som när appen startas om).
    func oppnaIgen() async {
        if let pagar = startUppgift { await pagar.value }
        e2e?.stang()
        e2e = nil
        await startaE2E()
    }

    /// Den här iPhonen tas bort som enhet (på servern och här), som när den ska länkas om. Historiken försvinner.
    func glomEnheten() async throws {
        if let pagar = startUppgift { await pagar.value }
        guard let e2e else { return }
        if let id = e2e.enhetId, e2e.registrerad { try await e2e.taBortEnhet(id) }
        e2e.stang()
        e2e.lagring.radera()
        self.e2e = nil
        await startaE2E()
    }

    /// Hämtar kontaktens enheter på nytt (och märker då om identiteten har ändrats).
    func kontrolleraKontakt(_ uuid: String) async {
        _ = try? await e2e?.uppdateraEnheter(uuid)
        version += 1
    }
}
