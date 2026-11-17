import CryptoKit
import Foundation

/// Meddelandelagret mot dagens server (`/chatt/*` i `adraze-api/chatt.js`, se `CHATT-API.md`): HTTPS och JSON,
/// samma rutter och samma krypto som datorns `ui/chatt.js`. Grupper och vänner från datorn syns här direkt.
///
/// Ägare: Konto och chatt.
@MainActor
final class ChattV1: ChattLager {
    private(set) var jag: ChattJag?
    private let natet: ChattAnrop
    private let logg = Logg("Chatt")
    private var priv: P256.KeyAgreement.PrivateKey?
    private var publika: [String: String] = [:]
    private var parnycklar: [String: SymmetricKey] = [:]
    private var gruppnycklar: [String: SymmetricKey] = [:]
    /// `GET /chatt/conversations` finns (ny rutt, väntar på deploy). `nil` = inte provat än.
    private(set) var harInkorgsrutt: Bool?
    /// Tvåpersonschattar: senaste posten vi sett, så att listan bara hämtar det nya.
    private var dmCache: [String: (sedan: Int64, senaste: ChattMeddelande?, lastTill: Date?)] = [:]
    private var grpCache: [String: (sedan: Int64, senaste: ChattMeddelande?)] = [:]
    /// Användarnamn per id (vänner och gruppmedlemmar), så att DM-poster och citat får avsändarens namn.
    private var namnPerId: [String: String] = [:]

    init(app: AppMiljo) { natet = ChattAnrop(app: app) }

    // MARK: Profil och nycklar

    func lasUpp() async throws -> ChattUpplasning {
        let r = try await natet.get("/jag")
        guard r["profil"] as? Bool == true else { return .behoverNamn(forslag: r["forslag"] as? String ?? "") }
        let id = ChattAnrop.idText(r["id"]), pub = r["public_key"] as? String ?? ""
        jag = ChattJag(id: id, anvandarnamn: r["username"] as? String ?? "", avatar: r["avatar"] as? String)
        publika[id] = pub
        let auto = r["auto"] as? Bool == true
        if auto, let sparad = laddaNyckel(id), ChattKrypto.pubB64(sparad) == pub {
            priv = sparad
            return .klar
        }
        let h = try await hemlighet()
        let wrap = ChattKrypto.wrapNyckel(h), bevis = ChattKrypto.loginHash(h)
        if !auto {
            // En profil från tiden med hemlig kod får nya nycklar kopplade till kontot (som datorn gör).
            let ny = P256.KeyAgreement.PrivateKey()
            let enc = try ChattKrypto.forsegla(wrap, ChattKrypto.pkcs8(ny))
            _ = try await natet.post("/users/ny-nyckel", ["public_key": ChattKrypto.pubB64(ny), "enc_priv": enc, "login_hash": bevis])
            priv = ny
            publika[id] = ChattKrypto.pubB64(ny)
        } else {
            let l = try await natet.post("/users/login", ["login_hash": bevis])
            priv = try ChattKrypto.privat(pkcs8: try ChattKrypto.oppna(wrap, l["enc_priv"] as? String ?? ""))
            if let a = l["avatar"] as? String { jag?.avatar = a }
            if let p = l["public_key"] as? String { publika[id] = p }
        }
        if let priv { sparaNyckel(id, priv) }
        return .klar
    }

    func skapaProfil(_ anvandarnamn: String) async throws {
        let h = try await hemlighet()
        let ny = P256.KeyAgreement.PrivateKey()
        let enc = try ChattKrypto.forsegla(ChattKrypto.wrapNyckel(h), ChattKrypto.pkcs8(ny))
        let r = try await natet.post("/registrera", ["username": anvandarnamn, "login_hash": ChattKrypto.loginHash(h),
                                                     "public_key": ChattKrypto.pubB64(ny), "enc_priv": enc])
        let id = ChattAnrop.idText(r["id"])
        jag = ChattJag(id: id, anvandarnamn: r["username"] as? String ?? anvandarnamn, avatar: nil)
        priv = ny
        publika[id] = ChattKrypto.pubB64(ny)
        sparaNyckel(id, ny)
    }

    private func hemlighet() async throws -> String {
        guard let s = try await natet.get("/nyckel")["secret"] as? String, !s.isEmpty else {
            throw ChattFel(kod: "unavailable", meddelande: ct("Chatten kan inte låsas upp just nu. Försök igen senare."), status: 503)
        }
        return s
    }

    private func laddaNyckel(_ id: String) -> P256.KeyAgreement.PrivateKey? {
        (try? Nyckelring.hamta(konto: "chatt.priv.\(id)")).flatMap { $0 }.flatMap { try? P256.KeyAgreement.PrivateKey(rawRepresentation: $0) }
    }

    private func sparaNyckel(_ id: String, _ k: P256.KeyAgreement.PrivateKey) {
        do { try Nyckelring.spara(k.rawRepresentation, konto: "chatt.priv.\(id)") } catch { logg.varning("kunde inte spara nyckeln: \(error)") }
    }

    private func publik(_ id: String) async throws -> String {
        if let p = publika[id] { return p }
        let r = try await natet.get("/users/key", ["id": id])
        guard let p = r["public_key"] as? String else { throw ChattKrypto.Fel() }
        publika[id] = p
        return p
    }

    private func nyckel(_ k: KonvId) async throws -> SymmetricKey {
        guard let priv else { throw ChattFel(kod: "locked", meddelande: ct("Chatten är låst."), status: 0) }
        switch k.sort {
        case .dm:
            if let n = parnycklar[k.id] { return n }
            let n = try ChattKrypto.delad(priv, try await publik(k.id))
            parnycklar[k.id] = n
            return n
        case .grupp:
            if let n = gruppnycklar[k.id] { return n }
            _ = try await grupper()
            guard let n = gruppnycklar[k.id] else { throw ChattKrypto.Fel() }
            return n
        }
    }

    // MARK: Kontakter och grupper

    func kontakter() async throws -> ChattKontaktlista {
        let r = try await natet.get("/contacts")
        func lista(_ n: String) -> [ChattPerson] {
            ((r[n] as? [[String: Any]]) ?? []).map { p in
                ChattPerson(id: ChattAnrop.idText(p["id"]), anvandarnamn: p["username"] as? String ?? "?", avatar: p["avatar"] as? String,
                       online: p["online"] as? Bool, senastSedd: ChattAnrop.tid(p["last_seen"]))
            }
        }
        let ut = ChattKontaktlista(kontakter: lista("contacts"), inkommande: lista("incoming"), utgaende: lista("outgoing"), blockerade: lista("blocked"))
        for p in ut.kontakter + ut.inkommande + ut.utgaende { namnPerId[p.id] = p.anvandarnamn }
        return ut
    }

    func grupper() async throws -> [ChattGrupp] {
        let r = try await natet.get("/groups")
        var ut: [ChattGrupp] = []
        for g in (r["groups"] as? [[String: Any]]) ?? [] {
            let gid = g["id"] as? String ?? ""
            var namn = ct("Grupp"), bild: String?
            do {
                let n: SymmetricKey
                if let finns = gruppnycklar[gid] { n = finns } else {
                    guard let priv else { throw ChattKrypto.Fel() }
                    n = try ChattKrypto.packaUpp(g["key_envelope"] as? String ?? "", priv, fran: try await publik(ChattAnrop.idText(g["wrapped_by"])))
                    gruppnycklar[gid] = n
                }
                namn = try ChattKrypto.oppnaText(n, g["name_enc"] as? String ?? "")
                if let a = g["avatar_enc"] as? String { bild = try? ChattKrypto.oppnaText(n, a) }
            } catch { logg.varning("gruppen \(gid) kunde inte låsas upp") }
            ut.append(ChattGrupp(id: gid, namn: namn, agare: ChattAnrop.idText(g["owner_id"]), antal: g["member_count"] as? Int ?? 0,
                            sista: ChattAnrop.tid(g["last_message_at"]), olasta: g["unread"] as? Int ?? 0, avatar: bild))
        }
        return ut
    }

    // MARK: Inkorgen

    func inkorg(_ kontakter: [ChattPerson], _ grupper: [ChattGrupp]) async throws -> [KonvId: ChattSammanfattning] {
        if harInkorgsrutt != false {
            do {
                let r = try await natet.get("/conversations")
                harInkorgsrutt = true
                return try await inkorgFranRutt(r)
            } catch let f as ChattFel where f.status == 404 {
                harInkorgsrutt = false
                logg.info("GET /chatt/conversations finns inte på servern; listan byggs ur de vanliga rutterna")
            }
        }
        var ut: [KonvId: ChattSammanfattning] = [:]
        let oversikt = ((try await natet.get("/messages/overview"))["unread"] as? [[String: Any]]) ?? []
        let olastaPer = Dictionary(oversikt.map { (ChattAnrop.idText($0["id"]), $0["n"] as? Int ?? 0) }, uniquingKeysWith: +)
        for p in kontakter {
            let k = KonvId(sort: .dm, id: p.id)
            if (olastaPer[p.id] ?? 0) > 0 {
                // Olästa: titta utan att markera dem som lästa
                let r = try await natet.get("/messages/unread", ["with": p.id])
                let poster = try await tolka(k, (r["messages"] as? [[String: Any]]) ?? [], avsandare: p)
                let riktiga = poster.filter { $0.innehall.arMeddelande }
                let gammal = dmCache[p.id]
                ut[k] = ChattSammanfattning(senaste: riktiga.last ?? gammal?.senaste, olasta: riktiga.count, lastTill: gammal?.lastTill, skriver: [])
            } else if let c = dmCache[p.id], !(c.senaste?.mitt == true && (c.lastTill ?? .distantPast) < (c.senaste?.tid ?? .distantPast)) {
                ut[k] = ChattSammanfattning(senaste: c.senaste, olasta: 0, lastTill: c.lastTill, skriver: [])
            } else {
                // Inget oläst: att hämta konversationen ändrar inget (det som markeras läst är redan läst)
                let h = try await hamta(k, sedan: dmCache[p.id]?.sedan ?? 0, andratSedan: 0, sida: 500)
                let senaste = h.meddelanden.last(where: { $0.innehall.arMeddelande }) ?? dmCache[p.id]?.senaste
                dmCache[p.id] = (h.meddelanden.last?.ms ?? dmCache[p.id]?.sedan ?? 0, senaste, h.lastTill)
                ut[k] = ChattSammanfattning(senaste: senaste, olasta: 0, lastTill: h.lastTill, skriver: h.skriver)
            }
        }
        for g in grupper {
            let k = KonvId(sort: .grupp, id: g.id)
            if g.olasta > 0 {
                let r = try await natet.get("/groups/messages/unread", ["id": g.id])
                let poster = try await tolka(k, (r["messages"] as? [[String: Any]]) ?? [], avsandare: nil)
                let riktiga = poster.filter { $0.innehall.arMeddelande }
                ut[k] = ChattSammanfattning(senaste: riktiga.last, olasta: riktiga.count, lastTill: nil, skriver: [])
            } else if let c = grpCache[g.id], let sista = g.sista, Int64(sista.timeIntervalSince1970 * 1000) <= c.sedan {
                ut[k] = ChattSammanfattning(senaste: c.senaste, olasta: 0, lastTill: nil, skriver: [])
            } else {
                let h = try await hamta(k, sedan: grpCache[g.id]?.sedan ?? 0, andratSedan: 0, sida: 500)
                let senaste = h.meddelanden.last(where: { $0.innehall.arMeddelande }) ?? grpCache[g.id]?.senaste
                grpCache[g.id] = (h.meddelanden.last?.ms ?? grpCache[g.id]?.sedan ?? 0, senaste)
                ut[k] = ChattSammanfattning(senaste: senaste, olasta: 0, lastTill: nil, skriver: h.skriver)
            }
        }
        return ut
    }

    private func inkorgFranRutt(_ r: [String: Any]) async throws -> [KonvId: ChattSammanfattning] {
        var ut: [KonvId: ChattSammanfattning] = [:]
        /// Olästa: rader som servern märkt olästa och som är riktiga meddelanden (inte reaktioner och andra
        /// kontrollposter). Olästa utanför de senaste raderna räknas som meddelanden.
        func olasta(_ rader: [[String: Any]], _ poster: [ChattMeddelande], totalt: Int) -> Int {
            let markerade = zip(rader, poster).filter { ($0.0["unread"] as? Bool) == true }
            return markerade.filter { $0.1.innehall.arMeddelande }.count + max(0, totalt - markerade.count)
        }
        for d in (r["dm"] as? [[String: Any]]) ?? [] {
            let k = KonvId(sort: .dm, id: ChattAnrop.idText(d["with"]))
            let rader = Array(((d["last"] as? [[String: Any]]) ?? []).reversed())
            let poster = try await tolka(k, rader, avsandare: nil)
            ut[k] = ChattSammanfattning(senaste: poster.last(where: { $0.innehall.arMeddelande }),
                                   olasta: olasta(rader, poster, totalt: d["unread"] as? Int ?? 0),
                                   lastTill: ChattAnrop.tid(d["peer_read_until"]),
                                   skriver: (d["typing"] as? Bool) == true ? ["*"] : [])
        }
        for g in (r["groups"] as? [[String: Any]]) ?? [] {
            let k = KonvId(sort: .grupp, id: g["id"] as? String ?? "")
            let rader = Array(((g["last"] as? [[String: Any]]) ?? []).reversed())
            let poster = try await tolka(k, rader, avsandare: nil)
            ut[k] = ChattSammanfattning(senaste: poster.last(where: { $0.innehall.arMeddelande }),
                                   olasta: olasta(rader, poster, totalt: g["unread"] as? Int ?? 0), lastTill: nil,
                                   skriver: (g["typing"] as? [String]) ?? [])
        }
        return ut
    }

    // MARK: Meddelanden

    func markeraLast(_ k: KonvId) async throws {
        // Telefonens klocka kan gå efter servern; servern tar ändå bara poster som finns (gruppen: högst nu).
        let tills = Int64(Date().timeIntervalSince1970 * 1000) + 600_000
        if k.sort == .dm {
            _ = try await natet.post("/messages/read", ["with": k.id, "until": tills])
        } else {
            _ = try await natet.post("/groups/read", ["id": k.id, "until": tills])
        }
    }

    func hamta(_ k: KonvId, sedan: Int64, andratSedan: Int64) async throws -> ChattHamtning {
        try await hamta(k, sedan: sedan, andratSedan: andratSedan, sida: 500)
    }

    /// Servern ger högst 500 poster per anrop (äldst först); finns fler hämtas nästa sida (högst 10).
    private func hamta(_ k: KonvId, sedan: Int64, andratSedan: Int64, sida: Int) async throws -> ChattHamtning {
        var ut = ChattHamtning(meddelanden: [], andringar: [], servertid: 0, lastTill: nil, lastAv: [:], skriver: [])
        var fran = sedan
        for varv in 0..<10 {
            var fraga = k.sort == .dm ? ["with": k.id] : ["id": k.id]
            fraga["since"] = String(fran)
            if varv == 0, andratSedan > 0 { fraga["changed_since"] = String(andratSedan) }
            let r = try await natet.get(k.sort == .dm ? "/messages" : "/groups/messages", fraga)
            let rader = (r["messages"] as? [[String: Any]]) ?? []
            ut.meddelanden += try await tolka(k, rader, avsandare: nil)
            if varv == 0 {
                ut.andringar = try await tolka(k, (r["changes"] as? [[String: Any]]) ?? [], avsandare: nil, andring: true)
                ut.lastTill = ChattAnrop.tid(r["peer_read_until"])
                ut.skriver = k.sort == .dm ? ((r["typing"] as? Bool) == true ? ["*"] : []) : ((r["typing"] as? [String]) ?? [])
                for l in (r["reads"] as? [[String: Any]]) ?? [] {
                    if let t = ChattAnrop.tid(l["read_at"]) { ut.lastAv[l["username"] as? String ?? ChattAnrop.idText(l["id"])] = t }
                }
            }
            ut.servertid = ChattAnrop.int64(r["server_time"])
            guard rader.count >= sida, let sista = ut.meddelanden.last?.ms, sista > fran else { break }
            fran = sista
        }
        if k.sort == .dm, let senaste = ut.meddelanden.last(where: { $0.innehall.arMeddelande }) ?? dmCache[k.id]?.senaste {
            dmCache[k.id] = (ut.meddelanden.last?.ms ?? dmCache[k.id]?.sedan ?? 0, senaste, ut.lastTill)
        }
        return ut
    }

    private func tolka<S: Sequence>(_ k: KonvId, _ rader: S, avsandare: ChattPerson?, andring: Bool = false) async throws -> [ChattMeddelande]
    where S.Element == [String: Any] {
        let n = try? await nyckel(k)
        let mittId = jag?.id ?? ""
        var ut: [ChattMeddelande] = []
        for r in rader {
            let id = ChattAnrop.idText(r["id"])
            let franId = r["sender_id"].map { ChattAnrop.idText($0) } ?? ((r["mine"] as? Bool) == true ? mittId : (avsandare?.id ?? k.id))
            let mitt = (r["mine"] as? Bool) ?? (franId == mittId)
            let ms = ChattAnrop.int64(r["created_at"])
            let ct = r["ciphertext"] as? String ?? ""
            var innehall: ChattInnehall = .olasbar, citat: ChattCitat?
            if (r["deleted"] as? Bool) == true || (andring && ct.isEmpty) {
                innehall = .borttaget
            } else if let n, let klar = try? ChattKrypto.oppnaText(n, ct) {
                (innehall, citat) = ChattFormat.tolka(klar)
            }
            ut.append(ChattMeddelande(id: id, fran: mitt ? mittId : franId,
                                 franNamn: mitt ? (jag?.anvandarnamn ?? "")
                                     : (r["sender_username"] as? String ?? avsandare?.anvandarnamn ?? namnPerId[franId] ?? ""),
                                 mitt: mitt, tid: Date(timeIntervalSince1970: Double(ms) / 1000), innehall: innehall, svar: citat,
                                 redigerad: (r["edited"] as? Bool) == true, ms: ms))
        }
        return ut
    }

    func skicka(_ k: KonvId, _ u: ChattUtkast) async throws -> ChattMeddelande {
        let n = try await nyckel(k)
        var klartext = u.text, bilaga: String?
        if let b = u.bild {
            bilaga = try await laddaUpp(k, n, b.data)
            klartext = ChattFormat.json([("sk", "img"), ("a", bilaga), ("m", b.mime), ("w", b.bredd), ("h", b.hojd),
                                         ("c", u.text.isEmpty ? nil : u.text), ("r", ChattFormat.citat(u.svar))])
        } else if let v = u.video {
            bilaga = try await laddaUpp(k, n, v.data)
            var tumme: String?
            if let t = v.tumnagel, t.count < 6_000 { tumme = "data:image/jpeg;base64," + t.base64EncodedString() }
            klartext = ChattFormat.json([("sk", "txt"), ("c", u.text.isEmpty ? "🎬 " + ct("Video") : u.text), ("r", ChattFormat.citat(u.svar)),
                                         ("vid", [("a", [bilaga ?? ""]), ("m", v.mime), ("w", v.bredd), ("h", v.hojd),
                                                  ("d", (v.langd * 10).rounded() / 10), ("t", tumme), ("c", u.text)] as [(String, Any?)])])
        } else if u.svar != nil {
            klartext = ChattFormat.json([("sk", "txt"), ("c", u.text), ("r", ChattFormat.citat(u.svar))])
        }
        let chiffer = try ChattKrypto.forseglaText(n, klartext)
        var kropp: [String: Any] = ["ciphertext": chiffer]
        if let bilaga { kropp["attachment_id"] = bilaga }
        if k.sort == .dm { kropp["to_id"] = k.id } else { kropp["id"] = k.id }
        let r = try await natet.post(k.sort == .dm ? "/messages/send" : "/groups/messages", kropp)
        let ms = ChattAnrop.int64(r["created_at"])
        let (innehall, citat) = ChattFormat.tolka(klartext)
        return ChattMeddelande(id: ChattAnrop.idText(r["id"]), fran: jag?.id ?? "", franNamn: jag?.anvandarnamn ?? "", mitt: true,
                          tid: Date(timeIntervalSince1970: Double(ms) / 1000), innehall: innehall, svar: citat, redigerad: false, ms: ms)
    }

    /// Bilagan krypteras med konversationens nyckel och laddas upp för sig (högst cirka 1,6 MB i dag).
    private func laddaUpp(_ k: KonvId, _ n: SymmetricKey, _ data: Data) async throws -> String {
        let chiffer = try ChattKrypto.forsegla(n, data)
        guard chiffer.count <= 2_200_000 else {
            throw ChattFel(kod: "too_large", meddelande: ct("Filen är för stor för chatten."), status: 413)
        }
        var kropp: [String: Any] = ["ciphertext": chiffer]
        if k.sort == .dm { kropp["to_id"] = k.id } else { kropp["group_id"] = k.id }
        return try await natet.post("/messages/attachment", kropp, langsam: true)["id"] as? String ?? ""
    }

    func reagera(_ k: KonvId, pa mal: ChattMeddelande, emoji: String, pa paslagen: Bool, befintlig: String?) async throws -> String {
        let n = try await nyckel(k)
        let citat = ChattCitat(id: mal.id, vem: mal.mitt ? (jag?.anvandarnamn ?? "") : mal.franNamn, text: String(mal.text.prefix(60)),
                          bild: { if case .bild = mal.innehall { return true } else { return false } }())
        let c = paslagen ? ct("Reagerade med {e}", ["e": emoji]) : ct("Tog bort reaktionen {e}", ["e": emoji])
        let klartext = ChattFormat.json([("sk", "txt"), ("c", c), ("r", ChattFormat.citat(citat)),
                                         ("ax", [("t", "rx"), ("m", mal.id), ("e", emoji), ("on", paslagen)] as [(String, Any?)])])
        let chiffer = try ChattKrypto.forseglaText(n, klartext)
        if let befintlig {
            if k.sort == .dm { _ = try await natet.post("/messages/edit", ["id": befintlig, "ciphertext": chiffer]) }
            else { _ = try await natet.post("/groups/messages/edit", ["gid": k.id, "id": befintlig, "ciphertext": chiffer]) }
            return befintlig
        }
        let r = try await natet.post(k.sort == .dm ? "/messages/send" : "/groups/messages",
                                     k.sort == .dm ? ["to_id": k.id, "ciphertext": chiffer] : ["id": k.id, "ciphertext": chiffer])
        return ChattAnrop.idText(r["id"])
    }

    func angra(_ k: KonvId, id: String) async throws {
        _ = try await natet.post(k.sort == .dm ? "/messages/delete" : "/groups/messages/delete", k.sort == .dm ? ["id": id] : ["gid": k.id, "id": id])
    }

    func dolj(_ k: KonvId, id: String) async throws {
        _ = try await natet.post(k.sort == .dm ? "/messages/hide" : "/groups/messages/hide", k.sort == .dm ? ["id": id] : ["gid": k.id, "id": id])
    }

    func bilaga(_ k: KonvId, id: String) async throws -> Data {
        let r = try await natet.get("/messages/attachment", ["id": id], langsam: true)
        return try ChattKrypto.oppna(try await nyckel(k), r["ciphertext"] as? String ?? "")
    }

    func skriver(_ k: KonvId) async {
        _ = try? await natet.post("/messages/typing", k.sort == .dm ? ["to_id": k.id] : ["group_id": k.id])
    }

    // MARK: Grupper

    func skapaGrupp(_ namn: String, medlemmar: [ChattPerson]) async throws -> String {
        guard let priv, let jag else { throw ChattKrypto.Fel() }
        let gk = SymmetricKey(size: .bits256)
        var lista: [[String: Any]] = [["user_id": jag.id, "key_envelope": try ChattKrypto.slaIn(gk, priv, till: ChattKrypto.pubB64(priv))]]
        for m in medlemmar where m.id != jag.id {
            lista.append(["user_id": m.id, "key_envelope": try ChattKrypto.slaIn(gk, priv, till: try await publik(m.id))])
        }
        let r = try await natet.post("/groups/create", ["name_enc": try ChattKrypto.forseglaText(gk, namn), "members": lista])
        let gid = r["id"] as? String ?? ""
        gruppnycklar[gid] = gk
        return gid
    }

    func medlemmar(_ gid: String) async throws -> [ChattMedlem] {
        let r = try await natet.get("/groups/members", ["id": gid])
        let agare = ChattAnrop.idText(r["owner_id"])
        return ((r["members"] as? [[String: Any]]) ?? []).map { m in
            let id = ChattAnrop.idText(m["id"])
            if let n = m["username"] as? String { namnPerId[id] = n }
            return ChattMedlem(id: id, anvandarnamn: m["username"] as? String ?? "?", avatar: m["avatar"] as? String,
                          admin: (m["is_admin"] as? Int ?? 0) == 1 || id == agare, online: m["online"] as? Bool,
                          senastSedd: ChattAnrop.tid(m["last_seen"]))
        }
    }

    func laggTill(_ gid: String, _ p: ChattPerson) async throws {
        guard let priv else { throw ChattKrypto.Fel() }
        let gk = try await nyckel(KonvId(sort: .grupp, id: gid))
        _ = try await natet.post("/groups/members", ["id": gid, "user_id": p.id,
                                                     "key_envelope": try ChattKrypto.slaIn(gk, priv, till: try await publik(p.id))])
    }

    func lamna(_ gid: String) async throws {
        _ = try await natet.post("/groups/leave", ["id": gid])
        gruppnycklar[gid] = nil
    }

    // MARK: Kontakter och rapporter

    func rapportera(anvandarnamn: String, orsak: String, detaljer: String, meddelande: ChattMeddelande?, i k: KonvId) async throws {
        var kropp: [String: Any] = ["reason": orsak, "username": anvandarnamn, "details": detaljer]
        if let m = meddelande {
            kropp["message_id"] = m.id
            kropp["message_kind"] = k.sort == .dm ? "dm" : "group"
            kropp["excerpt"] = String(m.text.prefix(500))
            if k.sort == .grupp { kropp["group_id"] = k.id }
        }
        _ = try await natet.post("/reports", kropp)
    }

    func forfragan(_ anvandarnamn: String) async throws -> String {
        try await natet.post("/contacts/request", ["username": anvandarnamn])["status"] as? String ?? "pending"
    }

    func acceptera(_ anvandarnamn: String) async throws { _ = try await natet.post("/contacts/accept", ["username": anvandarnamn]) }
    func taBortKontakt(_ anvandarnamn: String) async throws { _ = try await natet.post("/contacts/remove", ["username": anvandarnamn]) }
    func blockera(_ anvandarnamn: String) async throws { _ = try await natet.post("/contacts/block", ["username": anvandarnamn]) }
}

/// HTTP mot `<api>/chatt/*` med kontots token (som datorns `chatt:api` i main.js, rad 1225–1388).
@MainActor
final class ChattAnrop {
    private let app: AppMiljo
    let bas: URL
    private let session: URLSession

    init(app: AppMiljo) {
        self.app = app
        if let s = app.startargument.text("api"), let u = URL(string: s), u.scheme != nil { bas = u } else { bas = URL(string: "https://api.adraze.app")! }
        let k = URLSessionConfiguration.ephemeral
        k.httpCookieStorage = nil
        k.httpShouldSetCookies = false
        k.timeoutIntervalForRequest = 30
        if bas.scheme == "http" { k.protocolClasses = [LokalHTTP.self] }
        session = URLSession(configuration: k)
    }

    func get(_ sokvag: String, _ fraga: [String: String] = [:], langsam: Bool = false) async throws -> [String: Any] {
        var u = URLComponents(url: bas.appendingPathComponent("chatt" + sokvag), resolvingAgainstBaseURL: false)!
        if !fraga.isEmpty { u.queryItems = fraga.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var r = URLRequest(url: u.url!)
        r.timeoutInterval = langsam ? 90 : 30
        return try await skicka(r)
    }

    func post(_ sokvag: String, _ kropp: [String: Any], langsam: Bool = false) async throws -> [String: Any] {
        var r = URLRequest(url: bas.appendingPathComponent("chatt" + sokvag))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: kropp)
        r.timeoutInterval = langsam || (r.httpBody?.count ?? 0) > 100_000 ? 90 : 30
        return try await skicka(r)
    }

    private func skicka(_ forfragan: URLRequest) async throws -> [String: Any] {
        guard let token = await app.konto.token() else {
            throw ChattFel(kod: "unauthorized", meddelande: ct("Logga in för att använda chatten."), status: 401)
        }
        var r = forfragan
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let data: Data, svar: URLResponse
        do { (data, svar) = try await session.data(for: r) } catch {
            Logg("Chatt").varning("nätfel \((error as NSError).domain) \((error as NSError).code): \(error.localizedDescription)")
            throw ChattFel(kod: "network", meddelande: ct("Kunde inte nå chatten. Kontrollera din uppkoppling."), status: 0)
        }
        let status = (svar as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if (200..<300).contains(status), (json["ok"] as? Bool) != false { return json }
        let kod = json["error"] as? String ?? "error"
        let text = (json["message"] as? String) ?? (status == 404 ? kod : ct("Något gick fel. Försök igen."))
        throw ChattFel(kod: kod, meddelande: ct(text), status: status)
    }

    nonisolated static func idText(_ v: Any?) -> String {
        switch v {
        case let s as String: return s
        case let i as Int: return String(i)
        case let d as Double: return String(Int(d))
        case let n as NSNumber: return n.stringValue
        default: return ""
        }
    }

    nonisolated static func int64(_ v: Any?) -> Int64 {
        switch v {
        case let i as Int: return Int64(i)
        case let d as Double: return Int64(d)
        case let n as NSNumber: return n.int64Value
        case let s as String: return Int64(s) ?? 0
        default: return 0
        }
    }

    nonisolated static func tid(_ v: Any?) -> Date? {
        let ms = int64(v)
        return ms > 0 ? Date(timeIntervalSince1970: Double(ms) / 1000) : nil
    }
}
