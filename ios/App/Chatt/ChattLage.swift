import Foundation
import Observation
import UIKit

/// Chattens tillstånd: listan, öppna konversationer, reaktioner och hämtningen (polling som datorn: listan var
/// 9:e sekund och den öppna chatten var 3,5:e, bara medan chatten syns). Pratar bara med `ChattLager`.
///
/// Ägare: Konto och chatt.
@MainActor
@Observable
final class ChattLage {
    enum Fas: Equatable { case utloggad, laser, behoverNamn(String), klar, fel(String) }

    struct Reaktionspost: Hashable { let mal: String; let emoji: String; var pa: Bool; let vem: String; let mitt: Bool }

    struct Rad: Identifiable, Equatable {
        let konv: KonvId
        let namn: String
        let bild: String?
        let online: Bool
        let sedd: Date?
        let medlemmar: [String]
        let sammanfattning: ChattSammanfattning?
        let fast: Bool
        let tyst: Bool
        let tid: Date?
        /// Markerad som oläst med svep (bara på den här telefonen, tills chatten öppnas).
        var markeradOlast = false
        var id: String { konv.nyckel }
    }

    private(set) var fas: Fas = .laser
    private(set) var jag: ChattJag?
    private(set) var kontakter: [ChattPerson] = []
    private(set) var inkommande: [ChattPerson] = []
    private(set) var utgaende: [ChattPerson] = []
    private(set) var grupper: [ChattGrupp] = []
    private(set) var sammanfattningar: [KonvId: ChattSammanfattning] = [:]
    private(set) var medlemsnamn: [String: [String]] = [:]
    private(set) var meddelanden: [KonvId: [ChattMeddelande]] = [:]
    private(set) var reaktioner: [KonvId: [String: Reaktionspost]] = [:]
    private(set) var lastTill: [KonvId: Date] = [:]
    private(set) var lastAv: [KonvId: [String: Date]] = [:]
    private(set) var skriver: [KonvId: [String]] = [:]
    private(set) var laddar: Set<KonvId> = []
    private(set) var listanLaddad = false
    var oppen: KonvId?
    /// En konversation som ska öppnas när listan visas (`chatt:visa` med `konv`).
    var begard: KonvId?
    /// Kort felruta ("Kunde inte skicka").
    var notis: String?
    /// Långtrycksmenyn som visas (ritas av `ChattRot` ovanpå allt).
    var langtryck: ChattLangtrycksval?
    /// Meddelandet som den öppna konversationen ska rulla till (från sök i chattinfo).
    var hopp: String?
    /// Självtestet öppnar skärmar med den här ("ny", "info", "bakgrund", "samtal", "inkorg"; "utan-tangentbord" och
    /// "utan-svar" fäller ner tangentbordet och tar bort svarsraden); `nil` stänger dem.
    var provSkarm: String?
    /// Självtestet: öppna långtrycksmenyn för det här meddelandet i den öppna konversationen (samma väg som fingret).
    var provLangtryck: String?
    /// Självtestet läser vilket meddelande svarsraden gäller (sätts av konversationen).
    @ObservationIgnored var provSvarar: String?
    /// Självtestet: var rubrikradens toning slutar (punkter från skärmens överkant), mätt av konversationen.
    @ObservationIgnored var provRubrikkant: CGFloat = 0
    /// Bubblornas ramar i fönstret (för långtrycket i självtestet). Ritar inte om något.
    @ObservationIgnored var ramar: [String: CGRect] = [:]

    let installningar = ChattInstallningar()
    @ObservationIgnored let lager: any ChattLager
    @ObservationIgnored private let app: AppMiljo
    @ObservationIgnored private var sedan: [KonvId: Int64] = [:]
    @ObservationIgnored private var andratSedan: [KonvId: Int64] = [:]
    @ObservationIgnored private var listuppgift: Task<Void, Never>?
    @ObservationIgnored private var konvuppgift: Task<Void, Never>?
    @ObservationIgnored private var senastSkriver: Date = .distantPast
    @ObservationIgnored private var bildminne = NSCache<NSString, UIImage>()
    @ObservationIgnored private var kontoLyssnare: Prenumeration?
    @ObservationIgnored private let logg = Logg("Chatt")

    init(app: AppMiljo, lager: any ChattLager) {
        self.app = app
        self.lager = lager
        kontoLyssnare = app.handelser.lyssna(KontoAndrades.self) { [weak self] h in
            guard let self else { return }
            self.nollstall()
            if h.inloggad { Task { await self.start() } } else { self.fas = .utloggad }
        }
    }

    // MARK: Start

    func start() async {
        guard app.konto.arInloggad else { fas = .utloggad; return }
        if fas == .klar { return }
        fas = .laser
        do {
            switch try await lager.lasUpp() {
            case .behoverNamn(let forslag): fas = .behoverNamn(forslag)
            case .klar:
                jag = lager.jag
                installningar.anvandare(jag?.id)
                fas = .klar
                await uppdateraListan()
            }
        } catch let f as ChattFel where f.status == 401 {
            fas = .utloggad
        } catch {
            fas = .fel(error.localizedDescription)
        }
    }

    func skapaProfil(_ namn: String) async throws {
        try await lager.skapaProfil(namn)
        jag = lager.jag
        installningar.anvandare(jag?.id)
        fas = .klar
        await uppdateraListan()
    }

    private func nollstall() {
        stoppa()
        jag = nil
        kontakter = []; inkommande = []; utgaende = []; grupper = []
        sammanfattningar = [:]; meddelanden = [:]; reaktioner = [:]; lastTill = [:]; lastAv = [:]; skriver = [:]
        sedan = [:]; andratSedan = [:]; oppen = nil; listanLaddad = false
        bildminne.removeAllObjects()
    }

    // MARK: Hämtning

    /// Startar hämtningen medan chatten syns.
    func borja() {
        guard listuppgift == nil else { return }
        listuppgift = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 9_000_000_000)
                guard let self, !Task.isCancelled else { return }
                if self.fas == .klar { await self.uppdateraListan() }
            }
        }
    }

    func stoppa() {
        listuppgift?.cancel(); listuppgift = nil
        konvuppgift?.cancel(); konvuppgift = nil
    }

    func uppdateraListan() async {
        guard fas == .klar else { return }
        do {
            let k = try await lager.kontakter()
            kontakter = k.kontakter; inkommande = k.inkommande; utgaende = k.utgaende
            grupper = try await lager.grupper()
            sammanfattningar = try await lager.inkorg(kontakter, grupper)
            for g in grupper where medlemsnamn[g.id] == nil {
                if let m = try? await lager.medlemmar(g.id) {
                    medlemsnamn[g.id] = m.filter { $0.id != jag?.id }.map(\.anvandarnamn)
                }
            }
            listanLaddad = true
        } catch {
            logg.varning("listan: \(error.localizedDescription)")
            if !listanLaddad { notis = error.localizedDescription }
        }
    }

    var rader: [Rad] {
        var ut: [Rad] = []
        for p in kontakter {
            let k = KonvId(sort: .dm, id: p.id)
            let s = sammanfattningar[k]
            ut.append(Rad(konv: k, namn: p.anvandarnamn, bild: p.avatar, online: p.online == true, sedd: p.senastSedd,
                          medlemmar: [], sammanfattning: s, fast: installningar.arFast(k), tyst: installningar.arTyst(k),
                          tid: s?.senaste?.tid, markeradOlast: installningar.arOlastMarkerad(k)))
        }
        for g in grupper {
            let k = KonvId(sort: .grupp, id: g.id)
            let s = sammanfattningar[k]
            ut.append(Rad(konv: k, namn: g.namn, bild: g.avatar, online: false, sedd: nil, medlemmar: medlemsnamn[g.id] ?? [],
                          sammanfattning: s, fast: installningar.arFast(k), tyst: installningar.arTyst(k), tid: s?.senaste?.tid ?? g.sista,
                          markeradOlast: installningar.arOlastMarkerad(k)))
        }
        return ut.sorted {
            if $0.fast != $1.fast { return $0.fast }
            return ($0.tid ?? .distantPast) > ($1.tid ?? .distantPast)
        }
    }

    var antalOlasta: Int { sammanfattningar.values.reduce(0) { $0 + $1.olasta } }

    func namn(_ k: KonvId) -> String {
        k.sort == .dm ? (kontakter.first { $0.id == k.id }?.anvandarnamn ?? "?") : (grupper.first { $0.id == k.id }?.namn ?? ct("Grupp"))
    }

    func person(_ id: String) -> ChattPerson? { kontakter.first { $0.id == id } }
    func grupp(_ id: String) -> ChattGrupp? { grupper.first { $0.id == id } }

    // MARK: En konversation

    func oppna(_ k: KonvId) {
        oppen = k
        if installningar.arOlastMarkerad(k) { installningar.markeraOlast(k, false) }
        konvuppgift?.cancel()
        konvuppgift = Task { [weak self] in
            guard let self else { return }
            await self.hamta(k)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_500_000_000)
                guard !Task.isCancelled, self.oppen == k else { return }
                await self.hamta(k)
            }
        }
    }

    /// Svep i listan: har chatten olästa markeras de som lästa på servern (som när man öppnar den); annars
    /// markeras den som oläst här på telefonen tills den öppnas.
    func vaxlaLast(_ k: KonvId) async {
        if (sammanfattningar[k]?.olasta ?? 0) > 0 {
            do {
                try await lager.markeraLast(k)
                if var s = sammanfattningar[k] { s.olasta = 0; sammanfattningar[k] = s }
            } catch {
                logg.varning("markera läst: \(error.localizedDescription)")
                notis = ct("Kunde inte nå chatten. Kontrollera din uppkoppling.")
            }
        } else {
            installningar.markeraOlast(k, !installningar.arOlastMarkerad(k))
        }
    }

    func stang(_ k: KonvId) {
        if oppen == k { oppen = nil; konvuppgift?.cancel(); konvuppgift = nil }
        if var s = sammanfattningar[k] { s.olasta = 0; sammanfattningar[k] = s }
    }

    func hamta(_ k: KonvId) async {
        let forsta = meddelanden[k] == nil
        if forsta { laddar.insert(k) }
        defer { laddar.remove(k) }
        do {
            let h = try await lager.hamta(k, sedan: sedan[k] ?? 0, andratSedan: andratSedan[k] ?? 0)
            var lista = meddelanden[k] ?? []
            var rx = reaktioner[k] ?? [:]
            for m in h.meddelanden + h.andringar {
                if case .reaktion(let mal, let e, let pa) = m.innehall {
                    rx[m.id] = Reaktionspost(mal: mal, emoji: e, pa: pa, vem: m.mitt ? (jag?.anvandarnamn ?? "") : m.franNamn, mitt: m.mitt)
                    continue
                }
                if m.innehall == .borttaget, rx[m.id] != nil { rx[m.id] = nil; continue }
                if let i = lista.firstIndex(where: { $0.id == m.id }) {
                    lista[i].innehall = m.innehall
                    lista[i].redigerad = m.redigerad
                } else if !h.andringar.contains(where: { $0.id == m.id }), m.innehall != .kontroll {
                    lista.append(m)
                }
            }
            lista.sort { $0.ms < $1.ms }
            meddelanden[k] = lista
            reaktioner[k] = rx
            if let sista = h.meddelanden.last?.ms { sedan[k] = max(sedan[k] ?? 0, sista) }
            if h.servertid > 0 { andratSedan[k] = h.servertid }
            if let l = h.lastTill { lastTill[k] = l }
            if !h.lastAv.isEmpty { lastAv[k] = h.lastAv }
            skriver[k] = h.skriver
            if var s = sammanfattningar[k] {
                s.olasta = 0
                s.senaste = lista.last(where: { $0.innehall.arMeddelande }) ?? s.senaste
                s.lastTill = h.lastTill ?? s.lastTill
                sammanfattningar[k] = s
            } else if let senaste = lista.last(where: { $0.innehall.arMeddelande }) {
                sammanfattningar[k] = ChattSammanfattning(senaste: senaste, olasta: 0, lastTill: h.lastTill, skriver: [])
            }
        } catch {
            logg.varning("hämtning: \(error.localizedDescription)")
            if forsta { notis = error.localizedDescription }
        }
    }

    /// Reaktionerna på ett meddelande: emoji → (antal, vem, min).
    func reaktioner(pa m: ChattMeddelande, i k: KonvId) -> [(emoji: String, vem: [String], mitt: Bool)] {
        var ordning: [String] = []
        var per: [String: (vem: [String], mitt: Bool)] = [:]
        for r in (reaktioner[k] ?? [:]).values.sorted(by: { $0.emoji < $1.emoji }) where r.mal == m.id && r.pa {
            if per[r.emoji] == nil { ordning.append(r.emoji); per[r.emoji] = ([], false) }
            if !per[r.emoji]!.vem.contains(r.vem) { per[r.emoji]!.vem.append(r.vem) }
            if r.mitt { per[r.emoji]!.mitt = true }
        }
        return ordning.map { ($0, per[$0]!.vem, per[$0]!.mitt) }
    }

    // MARK: Skicka och ändra

    func skicka(_ k: KonvId, _ u: ChattUtkast) async -> Bool {
        let tmp = ChattMeddelande(id: "tmp-\(UUID().uuidString)", fran: jag?.id ?? "", franNamn: jag?.anvandarnamn ?? "", mitt: true, tid: Date(),
                             innehall: u.bild.map { _ in .bild(ChattBildinfo(bilaga: "", mime: "", bredd: u.bild?.bredd ?? 1, hojd: u.bild?.hojd ?? 1, klistermarke: false), text: u.text) }
                                ?? u.video.map { v in .video(ChattVideoinfo(bilagor: [], mime: v.mime, bredd: v.bredd, hojd: v.hojd, langd: v.langd, tumnagel: v.tumnagel), text: u.text) }
                                ?? .text(u.text),
                             svar: u.svar, redigerad: false, ms: Int64(Date().timeIntervalSince1970 * 1000))
        if let b = u.bild, let ui = UIImage(data: b.data) { bildminne.setObject(ui, forKey: tmp.id as NSString) }
        meddelanden[k, default: []].append(tmp)
        do {
            let m = try await lager.skicka(k, u)
            if let b = u.bild, case .bild(let info, _) = m.innehall, let ui = UIImage(data: b.data) {
                bildminne.setObject(ui, forKey: info.bilaga as NSString)
            }
            if let i = meddelanden[k]?.firstIndex(where: { $0.id == tmp.id }) {
                if meddelanden[k]!.contains(where: { $0.id == m.id }) { meddelanden[k]!.remove(at: i) } else { meddelanden[k]![i] = m }
            }
            if var s = sammanfattningar[k] { s.senaste = m; sammanfattningar[k] = s } else {
                sammanfattningar[k] = ChattSammanfattning(senaste: m, olasta: 0, lastTill: nil, skriver: [])
            }
            return true
        } catch {
            meddelanden[k]?.removeAll { $0.id == tmp.id }
            ChattHaptik.fel()
            notis = error.localizedDescription
            return false
        }
    }

    func reagera(_ m: ChattMeddelande, _ emoji: String, i k: KonvId) async {
        var rx = reaktioner[k] ?? [:]
        let egen = rx.first { $0.value.mitt && $0.value.mal == m.id && $0.value.emoji == emoji }
        let pa = !(egen?.value.pa ?? false)
        let tmp = egen?.key ?? "tmp-\(UUID().uuidString)"
        rx[tmp] = Reaktionspost(mal: m.id, emoji: emoji, pa: pa, vem: jag?.anvandarnamn ?? "", mitt: true)
        reaktioner[k] = rx
        do {
            let id = try await lager.reagera(k, pa: m, emoji: emoji, pa: pa, befintlig: egen?.key)
            if id != tmp { reaktioner[k]?[tmp] = nil; reaktioner[k]?[id] = Reaktionspost(mal: m.id, emoji: emoji, pa: pa, vem: jag?.anvandarnamn ?? "", mitt: true) }
        } catch {
            if let egen { reaktioner[k]?[egen.key] = egen.value } else { reaktioner[k]?[tmp] = nil }
            ChattHaptik.fel()
            notis = error.localizedDescription
        }
    }

    func angra(_ m: ChattMeddelande, i k: KonvId) async {
        do {
            try await lager.angra(k, id: m.id)
            if let i = meddelanden[k]?.firstIndex(where: { $0.id == m.id }) { meddelanden[k]![i].innehall = .borttaget }
        } catch { notis = error.localizedDescription }
    }

    func dolj(_ m: ChattMeddelande, i k: KonvId) async {
        do {
            try await lager.dolj(k, id: m.id)
            meddelanden[k]?.removeAll { $0.id == m.id }
        } catch { notis = error.localizedDescription }
    }

    func vidarebefordra(_ m: ChattMeddelande, fran k: KonvId, till mal: [KonvId]) async -> Bool {
        var u = ChattUtkast(text: m.text, bild: nil, video: nil, svar: nil)
        if case .bild(let info, _) = m.innehall {
            guard let ui = await bild(info.bilaga, i: k), let data = ui.jpegData(compressionQuality: 0.85) else { return false }
            u.bild = .init(data: data, mime: "image/jpeg", bredd: info.bredd, hojd: info.hojd)
        }
        if case .video = m.innehall { u.text = m.text.isEmpty ? "🎬 " + ct("Video") : m.text }
        var ok = true
        for t in mal { ok = await skicka(t, u) && ok }
        return ok
    }

    func skriverNu(_ k: KonvId) {
        guard Date().timeIntervalSince(senastSkriver) > 3 else { return }
        senastSkriver = Date()
        Task { await lager.skriver(k) }
    }

    // MARK: Bilder

    func bildIMinnet(_ id: String) -> UIImage? { bildminne.object(forKey: id as NSString) }

    func bild(_ id: String, i k: KonvId) async -> UIImage? {
        if let b = bildminne.object(forKey: id as NSString) { return b }
        guard !id.isEmpty, !id.hasPrefix("tmp-"), let data = try? await lager.bilaga(k, id: id), let b = UIImage(data: data) else { return nil }
        bildminne.setObject(b, forKey: id as NSString)
        return b
    }

    func bilagedata(_ id: String, i k: KonvId) async -> Data? { try? await lager.bilaga(k, id: id) }

    // MARK: Grupper och kontakter

    func skapaGrupp(_ namn: String, _ med: [ChattPerson]) async -> KonvId? {
        do {
            let gid = try await lager.skapaGrupp(namn, medlemmar: med)
            await uppdateraListan()
            return KonvId(sort: .grupp, id: gid)
        } catch { notis = error.localizedDescription; return nil }
    }

    func lamna(_ gid: String) async -> Bool {
        do {
            try await lager.lamna(gid)
            let k = KonvId(sort: .grupp, id: gid)
            stang(k)
            grupper.removeAll { $0.id == gid }
            sammanfattningar[k] = nil
            return true
        } catch { notis = error.localizedDescription; return false }
    }

    func svaraForfragan(_ p: ChattPerson, ja: Bool) async {
        do {
            if ja { try await lager.acceptera(p.anvandarnamn) } else { try await lager.taBortKontakt(p.anvandarnamn) }
            await uppdateraListan()
        } catch { notis = error.localizedDescription }
    }

    func laggTillVan(_ namn: String) async -> String? {
        do {
            let status = try await lager.forfragan(namn)
            await uppdateraListan()
            return status == "accepted" ? ct("Ni är nu vänner.") : ct("Förfrågan skickad.")
        } catch { return error.localizedDescription }
    }
}

// MARK: - Inställningar per chatt (på telefonen)

/// Fäst, ljud av, signal, bakgrund och fästa meddelanden, per chattprofil. Ligger i appens egen mapp
/// (Application Support), inte i Keychain: inget hemligt. Synk till datorn kräver en ny serverrutt (se rapporten).
@MainActor
@Observable
final class ChattInstallningar {
    struct Bakgrund: Codable, Hashable {
        var forval: String
        var dampa: Double = 0.35
        var oskarpa: Bool = false
    }

    struct Data_: Codable {
        var fasta: [String] = []
        var tysta: [String: Double] = [:]
        var signal: [String: String] = [:]
        var bakgrund: [String: Bakgrund] = [:]
        var fastaMeddelanden: [String: String] = [:]
        /// Valfri, så att filer från före fältet fortfarande läses.
        var olastMarkerade: [String]?
    }

    private(set) var data = Data_()
    @ObservationIgnored private var fil: URL?

    func anvandare(_ id: String?) {
        guard let id else { fil = nil; data = Data_(); return }
        let mapp = (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory()))
            .appendingPathComponent("Chatt/\(id)", isDirectory: true)
        try? FileManager.default.createDirectory(at: mapp, withIntermediateDirectories: true)
        fil = mapp.appendingPathComponent("installningar.json")
        data = (try? Foundation.Data(contentsOf: fil!)).flatMap { try? JSONDecoder().decode(Data_.self, from: $0) } ?? Data_()
    }

    var mapp: URL? { fil?.deletingLastPathComponent() }

    private func spara() {
        guard let fil, let d = try? JSONEncoder().encode(data) else { return }
        try? d.write(to: fil, options: .atomic)
    }

    func arFast(_ k: KonvId) -> Bool { data.fasta.contains(k.nyckel) }
    func vaxlaFast(_ k: KonvId) {
        if let i = data.fasta.firstIndex(of: k.nyckel) { data.fasta.remove(at: i) } else { data.fasta.append(k.nyckel) }
        spara()
    }

    func arTyst(_ k: KonvId) -> Bool {
        guard let t = data.tysta[k.nyckel] else { return false }
        return t == 0 || Date(timeIntervalSince1970: t) > Date()
    }
    /// `nil` = ljudet på igen, `0` = tills vidare, annars sekunder.
    func tysta(_ k: KonvId, i sekunder: Double?) {
        if let s = sekunder { data.tysta[k.nyckel] = s == 0 ? 0 : Date().addingTimeInterval(s).timeIntervalSince1970 } else { data.tysta[k.nyckel] = nil }
        spara()
    }

    func signal(_ k: KonvId) -> String { data.signal[k.nyckel] ?? "standard" }
    func sattSignal(_ k: KonvId, _ s: String) { data.signal[k.nyckel] = s; spara() }

    func bakgrund(_ k: KonvId) -> Bakgrund { data.bakgrund[k.nyckel] ?? Bakgrund(forval: "papper") }
    func sattBakgrund(_ k: KonvId, _ b: Bakgrund) { data.bakgrund[k.nyckel] = b; spara() }

    func egenBild(_ k: KonvId) -> URL? { mapp?.appendingPathComponent("bakgrund-\(k.sort.rawValue)-\(k.id.filter { $0.isLetter || $0.isNumber }).jpg") }

    func arOlastMarkerad(_ k: KonvId) -> Bool { data.olastMarkerade?.contains(k.nyckel) == true }
    func markeraOlast(_ k: KonvId, _ pa: Bool) {
        var l = data.olastMarkerade ?? []
        l.removeAll { $0 == k.nyckel }
        if pa { l.append(k.nyckel) }
        data.olastMarkerade = l.isEmpty ? nil : l
        spara()
    }

    func fastMeddelande(_ k: KonvId) -> String? { data.fastaMeddelanden[k.nyckel] }
    func fast(_ k: KonvId, meddelande id: String?) { data.fastaMeddelanden[k.nyckel] = id; spara() }
}
