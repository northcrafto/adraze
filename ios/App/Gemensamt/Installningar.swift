import Foundation
import Observation

/// AdRazes inställningar: EN källa för allt användaren kan ändra, lagrad i Swift. Samma sorts butik som datorns
/// Anpassa (`browser/anpassa.js`, del 1 avsnitt 2.1), så att AdRaze-UI:t i webbvyerna (Anpassa, startsidan, Falk)
/// kan läsa och skriva den via bryggan precis som på datorn, och skalet läser samma värden native.
///
/// - Nycklarna heter `<område>.<namn>`, till exempel `tema.accent`. Saknas ett sparat värde gäller standardvärdet.
/// - `nil` eller `.null` betyder "tillbaka till standard" (som `undefined`/`null` på datorn).
/// - Varje ändring hamnar i ångra-historiken (max 200), utom nycklar med `historik: false` (webb.* och block.*).
/// - Barnlåsta nycklar kan inte ändras när `arBarnlage()` är sant.
/// - Filen skrivs 150 ms efter sista ändringen och direkt när appen går till bakgrunden (`sparaNu()`).
///   Formatet är datorns `{ varden, historik }`.
///
/// Typad läsning och skrivning (nycklarna finns i `Nycklar.swift`, egna läggs i den egna mappen):
///
///     let accent = app.installningar[.temaAccent]        // String
///     app.installningar[.temaLage] = .morkt              // Temalage
///
/// För bryggan finns samma anrop som på datorn: `hamta`, `satt`, `angra`, `aterstall`, `exportera`, `importera`,
/// `historik` och `somAnpassaAlla()` (svaret på `anpassa:alla`). Ändringar skickas som `InstallningAndrad`
/// på `app.handelser`, och klassen är `@Observable`, så SwiftUI-vyer som läser ett värde ritas om när det ändras.
///
/// Ägare: Grund (Gemensamt).
@MainActor
@Observable
final class Installningar {
    /// Det som är sparat, utan standardvärden.
    private(set) var varden: [String: JSONVarde] = [:]
    /// Ångra-historiken, äldst först.
    private(set) var historik: [Historikpost] = []
    /// Alla registrerade nycklar (och mönster som `sajt.*`).
    private(set) var registret: [String: Installningsdef] = [:]

    /// Sant när enheten är i barnläge. Sätts av den som äger familj och barnläge. Standard: aldrig.
    @ObservationIgnored var arBarnlage: @MainActor () -> Bool = { false }

    /// Filen värdena sparas i. `nil` = bara i minnet (används av självtester).
    @ObservationIgnored let fil: URL?
    @ObservationIgnored private weak var handelser: Handelser?
    @ObservationIgnored private var skrivning: Task<Void, Never>?
    @ObservationIgnored private let logg = Logg("Installningar")

    static let historikMax = 200

    /// Application Support/AdRaze/installningar.json
    nonisolated static var standardfil: URL {
        let bas = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return bas.appendingPathComponent("AdRaze", isDirectory: true).appendingPathComponent("installningar.json")
    }

    init(fil: URL? = Installningar.standardfil, handelser: Handelser? = nil) {
        self.fil = fil
        self.handelser = handelser
        las()
    }

    // MARK: - Registrering

    /// Registrerar en nyckel (eller ett mönster som slutar på `.*`). Samma nyckel två gånger: den sista gäller.
    func registrera(_ def: Installningsdef) {
        if let gammal = registret[def.nyckel], gammal != def {
            logg.varning("\(def.nyckel) registrerades igen med andra uppgifter")
        }
        registret[def.nyckel] = def
    }

    func registrera(_ nycklar: [Nycklar]) { for n in nycklar { registrera(n.def) } }
    func registrera(_ nyckel: Nycklar) { registrera(nyckel.def) }

    /// Registreringen som gäller för en nyckel: exakt träff, annars det längsta mönstret `område.*` som täcker den.
    func def(for nyckel: String) -> Installningsdef? {
        if let d = registret[nyckel] { return d }
        var basta: Installningsdef?
        for (k, d) in registret where k.hasSuffix(".*") && nyckel.hasPrefix(String(k.dropLast())) {
            if basta == nil || k.count > basta!.nyckel.count { basta = d }
        }
        return basta
    }

    /// Sant om nyckeln inte får ändras just nu (barnläge och barnlåst nyckel).
    func arLast(_ nyckel: String) -> Bool {
        guard arBarnlage() else { return false }
        return def(for: nyckel)?.barnlast ?? false
    }

    // MARK: - Läsa

    /// Typad läsning. Fel typ i det sparade värdet ger nyckelns standard.
    subscript<V: Installningsvarde>(_ nyckel: Nyckel<V>) -> V {
        get {
            if let s = varden[nyckel.namn], let v = V(installning: s) { return v }
            return nyckel.standard
        }
        set { satt(nyckel.namn, newValue.installning) }
    }

    /// Det som gäller för en nyckel: sparat värde, annars det registrerade standardvärdet. `nil` = inget alls.
    func hamta(_ nyckel: String) -> JSONVarde? { varden[nyckel] ?? registret[nyckel]?.standard }

    /// Bara det sparade värdet (`nil` = standard gäller). Det datorns `anpassa:andrad` skickar till webbsidorna.
    func sparat(_ nyckel: String) -> JSONVarde? { varden[nyckel] }

    /// Alla nycklar under ett prefix med det som gäller (sparat eller standard), utan prefixet.
    /// `samlat("webb.")` ger `["dns": "automatic", "httpsOnly": false, ...]`, som datorns `view.webbGet()`.
    func samlat(_ prefix: String) -> [String: JSONVarde] {
        var ut: [String: JSONVarde] = [:]
        for (k, d) in registret where k.hasPrefix(prefix) && !d.arMonster {
            if let v = hamta(k) { ut[String(k.dropFirst(prefix.count))] = v }
        }
        for (k, v) in varden where k.hasPrefix(prefix) { ut[String(k.dropFirst(prefix.count))] = v }
        return ut
    }

    /// Svaret på datorns `anpassa:alla`: `{ varden, register, barn }`.
    func somAnpassaAlla() -> JSONVarde {
        ["varden": .objekt(varden), "register": .objekt(registret.mapValues(\.json)), "barn": .bool(arBarnlage())]
    }

    // MARK: - Ändra

    /// Sätter ett värde. `nil` eller `.null` = tillbaka till standard. Samma värde som förut gör ingenting.
    @discardableResult
    func satt(_ nyckel: String, _ varde: JSONVarde?, etikett: String? = nil, utanHistorik: Bool = false) -> Sattsvar {
        let nyckel = String(nyckel.prefix(200))
        guard !nyckel.isEmpty else { return .nyckel }
        if arLast(nyckel) { return .barnlast }
        let nytt: JSONVarde? = (varde == nil || varde == .null) ? nil : varde
        let fore = varden[nyckel]
        if fore == nytt { return .ok }
        if let nytt { varden[nyckel] = nytt } else { varden.removeValue(forKey: nyckel) }
        let medHistorik = !utanHistorik && (def(for: nyckel)?.historik ?? true)
        if medHistorik {
            historik.append(Historikpost(nyckel: nyckel, fore: fore, efter: nytt,
                                         etikett: etikett ?? registret[nyckel]?.etikett ?? nyckel,
                                         ts: (Date().timeIntervalSince1970 * 1000).rounded()))
            if historik.count > Self.historikMax { historik.removeFirst(historik.count - Self.historikMax) }
        }
        sparaSnart()
        sandUt(nyckel)
        return .ok
    }

    /// Ångrar den senaste ändringen som inte är låst.
    @discardableResult
    func angra() -> Angrasvar {
        for i in historik.indices.reversed() {
            let h = historik[i]
            if arLast(h.nyckel) { continue }
            historik.remove(at: i)
            if let f = h.fore { varden[h.nyckel] = f } else { varden.removeValue(forKey: h.nyckel) }
            sparaSnart()
            sandUt(h.nyckel)
            return Angrasvar(ok: true, nyckel: h.nyckel, etikett: h.etikett)
        }
        return Angrasvar(ok: false, nyckel: nil, etikett: nil)
    }

    /// Återställer en nyckel, alla som börjar med ett prefix (`"tema."`), eller allt (`nil`). Ger antalet.
    @discardableResult
    func aterstall(_ prefix: String? = nil) -> Int {
        let p = prefix ?? ""
        let nycklar = varden.keys.filter { (p.isEmpty || $0 == p || $0.hasPrefix(p)) && !arLast($0) }.sorted()
        for k in nycklar { satt(k, nil, etikett: "Återställ \(p.isEmpty ? "allt" : p)") }
        return nycklar.count
    }

    // MARK: - Delningskoder (ADRZ1)

    /// En delningskod `ADRZ1.<base64url JSON>` med de sparade värdena under ett prefix. Nycklar med
    /// `importbar: false` följer aldrig med. Samma format som datorn, så koder går att flytta mellan dem.
    func exportera(_ prefix: String? = nil) -> String {
        var ut: [String: JSONVarde] = [:]
        for (k, v) in varden {
            if let prefix, !k.hasPrefix(prefix) { continue }
            if def(for: k)?.importbar == false { continue }
            ut[k] = v
        }
        return "ADRZ1." + Self.base64url(JSONVarde.objekt(ut).jsonData())
    }

    /// Läser en delningskod. Ger antalet värden som sattes, eller `.fel("kod")` om koden inte går att läsa.
    @discardableResult
    func importera(_ kod: String, prefix: String? = nil) -> Importsvar {
        let t = kod.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.hasPrefix("ADRZ1."), let data = Self.franBase64url(String(t.dropFirst(6))),
              let o = (try? JSONVarde(json: data))?.objekt else { return .fel("kod") }
        var n = 0
        for (k, v) in o.sorted(by: { $0.key < $1.key }) {
            if let prefix, !k.hasPrefix(prefix) { continue }
            if def(for: k)?.importbar == false { continue }
            if satt(k, v, etikett: "Importerat").arOk { n += 1 }
        }
        return .ok(antal: n)
    }

    // MARK: - Spara

    /// Skriver filen nu (annars 150 ms efter sista ändringen).
    func sparaNu() {
        skrivning?.cancel()
        skrivning = nil
        guard let fil else { return }
        let j: JSONVarde = ["varden": .objekt(varden), "historik": .lista(historik.map(\.json))]
        do {
            try FileManager.default.createDirectory(at: fil.deletingLastPathComponent(), withIntermediateDirectories: true)
            try j.jsonData().write(to: fil, options: [.atomic])
        } catch {
            logg.fel("kunde inte spara \(fil.lastPathComponent): \(error.localizedDescription)")
        }
    }

    private func sparaSnart() {
        skrivning?.cancel()
        skrivning = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            self?.sparaNu()
        }
    }

    private func las() {
        guard let fil, let data = try? Data(contentsOf: fil) else { return }
        guard let j = try? JSONVarde(json: data), let v = j["varden"].objekt else {
            // Trasig fil: lägg den åt sidan (i stället för att skriva över den) och börja om, som datorn gör.
            let sida = fil.deletingPathExtension().appendingPathExtension("trasig-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.moveItem(at: fil, to: sida)
            logg.fel("\(fil.lastPathComponent) gick inte att läsa; flyttad till \(sida.lastPathComponent)")
            return
        }
        varden = v
        historik = (j["historik"].lista ?? []).compactMap(Historikpost.init(json:))
    }

    private func sandUt(_ nyckel: String) {
        handelser?.skicka(InstallningAndrad(nyckel: nyckel, varde: hamta(nyckel) ?? .null, sparat: varden[nyckel]))
    }

    // MARK: - base64url (utan utfyllnad, som Buffer.toString('base64url') i Node)

    static func base64url(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func franBase64url(_ s: String) -> Data? {
        guard !s.isEmpty, s.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else { return nil }
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        return Data(base64Encoded: b)
    }
}

// MARK: - Typer som butiken använder

/// Vilka värden en inställning kan ha, som `val` i datorns `browser/anpassa.js`. Falk ändrar bara till sådana värden.
enum Installningsval: Sendable, Hashable {
    /// Ett av värdena i listan.
    case lista([JSONVarde])
    /// Ett tal i intervallet, gränserna inräknade.
    case intervall(min: Double, max: Double)
    /// Valfri text.
    case text

    /// Alla fall i en uppräkning med text som råvärde, i den ordning de står.
    static func av<E: CaseIterable & RawRepresentable>(_ typ: E.Type) -> Installningsval where E.RawValue == String {
        .lista(E.allCases.map { .text($0.rawValue) })
    }

    var json: JSONVarde {
        switch self {
        case .lista(let l): return .lista(l)
        case .intervall(let a, let b): return ["min": .tal(a), "max": .tal(b)]
        case .text: return "text"
        }
    }
}

/// En registrerad inställning: samma fält som `registrera({ nyckel, standard, barnLast, etikett, importBar, val })`
/// på datorn, plus `historik` (bara iOS): om ändringar hamnar i ångra-historiken.
struct Installningsdef: Sendable, Hashable {
    let nyckel: String
    /// `nil` = inget standardvärde (`undefined` på datorn).
    let standard: JSONVarde?
    let etikett: String
    let barnlast: Bool
    let importbar: Bool
    let val: Installningsval?
    let historik: Bool

    init(_ nyckel: String, standard: JSONVarde?, etikett: String, barnlast: Bool = false, importbar: Bool = true,
         val: Installningsval? = nil, historik: Bool = true) {
        self.nyckel = nyckel
        self.standard = standard
        self.etikett = etikett
        self.barnlast = barnlast
        self.importbar = importbar
        self.val = val
        self.historik = historik
    }

    /// Mönster som `sajt.*` täcker alla nycklar som börjar med `sajt.`.
    var arMonster: Bool { nyckel.hasSuffix(".*") }

    /// Som datorns post i `register` (`{ standard, barnLast, etikett, importBar, val? }`).
    var json: JSONVarde {
        var o: [String: JSONVarde] = ["etikett": .text(etikett), "barnLast": .bool(barnlast), "importBar": .bool(importbar)]
        if let standard { o["standard"] = standard }
        if let val { o["val"] = val.json }
        return .objekt(o)
    }
}

/// En post i ångra-historiken, som datorns `{ nyckel, fore, efter, etikett, ts }`.
struct Historikpost: Sendable, Hashable {
    let nyckel: String
    let fore: JSONVarde?
    let efter: JSONVarde?
    let etikett: String
    /// Millisekunder sedan 1970, som `Date.now()`.
    let ts: Double

    var json: JSONVarde {
        var o: [String: JSONVarde] = ["nyckel": .text(nyckel), "etikett": .text(etikett), "ts": .tal(ts)]
        if let fore { o["fore"] = fore }
        if let efter { o["efter"] = efter }
        return .objekt(o)
    }

    init(nyckel: String, fore: JSONVarde?, efter: JSONVarde?, etikett: String, ts: Double) {
        self.nyckel = nyckel
        self.fore = fore
        self.efter = efter
        self.etikett = etikett
        self.ts = ts
    }

    init?(json j: JSONVarde) {
        guard let n = j["nyckel"].text else { return nil }
        nyckel = n
        fore = j.objekt?["fore"]
        efter = j.objekt?["efter"]
        etikett = j["etikett"].text ?? n
        ts = j["ts"].tal ?? 0
    }
}

/// Svaret från `satt`, som datorns `{ ok }` eller `{ ok: false, error }`.
enum Sattsvar: Sendable, Equatable {
    case ok
    /// Nyckeln är låst i barnläge.
    case barnlast
    /// Tom nyckel.
    case nyckel

    var arOk: Bool { self == .ok }
    var json: JSONVarde {
        switch self {
        case .ok: return ["ok": true]
        case .barnlast: return ["ok": false, "error": "barnlast"]
        case .nyckel: return ["ok": false, "error": "nyckel"]
        }
    }
}

/// Svaret från `angra`, som datorns `{ ok, nyckel, etikett }` eller `{ ok: false, error: 'tomt' }`.
struct Angrasvar: Sendable, Equatable {
    let ok: Bool
    let nyckel: String?
    let etikett: String?

    var json: JSONVarde {
        guard ok, let nyckel else { return ["ok": false, "error": "tomt"] }
        return ["ok": true, "nyckel": .text(nyckel), "etikett": .text(etikett ?? nyckel)]
    }
}

/// Svaret från `importera`, som datorns `{ ok, antal }` eller `{ ok: false, error: 'kod' }`.
enum Importsvar: Sendable, Equatable {
    case ok(antal: Int)
    case fel(String)

    var json: JSONVarde {
        switch self {
        case .ok(let n): return ["ok": true, "antal": .tal(Double(n))]
        case .fel(let f): return ["ok": false, "error": .text(f)]
        }
    }
}

// MARK: - Typade nycklar

/// Ett värde som kan sparas i inställningarna. Finns för `String`, `Bool`, `Double`, `Int`, `JSONVarde`,
/// listor, ordböcker med text som nyckel, valfria värden och uppräkningar med text som råvärde:
///
///     enum Placering: String, CaseIterable, Installningsvarde { case uppe, nere }
protocol Installningsvarde: Sendable {
    /// Tolkar ett sparat värde. `nil` = fel typ (då gäller nyckelns standard).
    init?(installning: JSONVarde)
    /// Värdet som JSON. `nil` = inget värde (`undefined`).
    var installning: JSONVarde? { get }
}

extension Installningsvarde where Self: RawRepresentable, RawValue == String {
    init?(installning v: JSONVarde) {
        guard let s = v.text, let x = Self(rawValue: s) else { return nil }
        self = x
    }
    var installning: JSONVarde? { .text(rawValue) }
}

extension String: Installningsvarde {
    init?(installning v: JSONVarde) { guard let s = v.text else { return nil }; self = s }
    var installning: JSONVarde? { .text(self) }
}

extension Bool: Installningsvarde {
    init?(installning v: JSONVarde) { guard let b = v.bool else { return nil }; self = b }
    var installning: JSONVarde? { .bool(self) }
}

extension Double: Installningsvarde {
    init?(installning v: JSONVarde) { guard let d = v.tal, d.isFinite else { return nil }; self = d }
    var installning: JSONVarde? { .tal(self) }
}

extension Int: Installningsvarde {
    init?(installning v: JSONVarde) { guard let i = v.heltal else { return nil }; self = i }
    var installning: JSONVarde? { .tal(Double(self)) }
}

extension JSONVarde: Installningsvarde {
    init?(installning v: JSONVarde) { self = v }
    var installning: JSONVarde? { self }
}

extension Array: Installningsvarde where Element: Installningsvarde {
    init?(installning v: JSONVarde) {
        guard let l = v.lista else { return nil }
        var ut: [Element] = []
        for x in l {
            guard let e = Element(installning: x) else { return nil }
            ut.append(e)
        }
        self = ut
    }
    var installning: JSONVarde? { .lista(compactMap(\.installning)) }
}

extension Dictionary: Installningsvarde where Key == String, Value: Installningsvarde {
    init?(installning v: JSONVarde) {
        guard let o = v.objekt else { return nil }
        var ut: [String: Value] = [:]
        for (k, x) in o {
            guard let e = Value(installning: x) else { return nil }
            ut[k] = e
        }
        self = ut
    }
    var installning: JSONVarde? { .objekt(compactMapValues(\.installning)) }
}

extension Optional: Installningsvarde where Wrapped: Installningsvarde {
    init?(installning v: JSONVarde) {
        if v.arNull { self = .none; return }
        guard let w = Wrapped(installning: v) else { return nil }
        self = .some(w)
    }
    var installning: JSONVarde? { self?.installning ?? nil }
}

/// Basen för typade nycklar. Nycklarna läggs som `static let` i en `extension Nycklar`, så att de kan skrivas
/// med punkt: `app.installningar[.temaAccent]`. En modul lägger sina egna nycklar i sin egen mapp och registrerar
/// dem i sin `registrera(i:)`:
///
///     extension Nycklar {
///         static let skyddPausade = Nyckel<[String]>("skydd.pausade", standard: [], etikett: "Pausade sajter",
///                                                     barnlast: true, importbar: false)
///     }
///     app.installningar.registrera(Nycklar.skyddPausade)
class Nycklar: @unchecked Sendable {
    let namn: String
    let def: Installningsdef

    init(def: Installningsdef) {
        namn = def.nyckel
        self.def = def
    }
}

/// En typad nyckel. `standard` är det som gäller när inget är sparat (eller det sparade har fel typ).
final class Nyckel<Varde: Installningsvarde>: Nycklar, @unchecked Sendable {
    let standard: Varde

    init(_ namn: String, standard: Varde, etikett: String, barnlast: Bool = false, importbar: Bool = true,
         val: Installningsval? = nil, historik: Bool = true) {
        self.standard = standard
        super.init(def: Installningsdef(namn, standard: standard.installning, etikett: etikett, barnlast: barnlast,
                                        importbar: importbar, val: val, historik: historik))
    }
}
