import Foundation
import UIKit

/// Meddelandelagret: allt som rör protokoll, nycklar och kryptering ligger bakom det här protokollet.
/// Vyerna och `ChattLage` ser bara klartext och modellerna nedan.
///
/// `ChattV1` pratar med dagens server (`/chatt/*`, ECDH P-256 + AES-GCM, nyckeln upplåst via kontot).
/// Plan 4 (E2E som Signal, libsignal) blir en `ChattV2` med samma gränssnitt, utan att vyerna ändras.
///
/// Ägare: Konto och chatt.
@MainActor
protocol ChattLager: AnyObject {
    var jag: ChattJag? { get }
    /// Öppnar chatten med kontots nyckel. `.behoverNamn` = kontot har ingen chattprofil än.
    func lasUpp() async throws -> ChattUpplasning
    func skapaProfil(_ anvandarnamn: String) async throws
    func kontakter() async throws -> ChattKontaktlista
    func grupper() async throws -> [ChattGrupp]
    /// Inkorgen: senaste posterna per konversation, olästa och läskvitton, utan att något markeras som läst.
    func inkorg(_ kontakter: [ChattPerson], _ grupper: [ChattGrupp]) async throws -> [KonvId: ChattSammanfattning]
    /// Nya poster och ändringar sedan `sedan` (servertid). Markerar konversationen som läst (den är öppen).
    func hamta(_ k: KonvId, sedan: Int64, andratSedan: Int64) async throws -> ChattHamtning
    /// Markerar allt i konversationen som läst utan att hämta det (svep i listan).
    func markeraLast(_ k: KonvId) async throws
    func skicka(_ k: KonvId, _ utkast: ChattUtkast) async throws -> ChattMeddelande
    /// Reaktion: en post per person, meddelande och emoji; finns den redan redigeras den (som datorn).
    func reagera(_ k: KonvId, pa mal: ChattMeddelande, emoji: String, pa paslagen: Bool, befintlig: String?) async throws -> String
    func angra(_ k: KonvId, id: String) async throws
    func dolj(_ k: KonvId, id: String) async throws
    func bilaga(_ k: KonvId, id: String) async throws -> Data
    func skriver(_ k: KonvId) async
    func skapaGrupp(_ namn: String, medlemmar: [ChattPerson]) async throws -> String
    func medlemmar(_ gid: String) async throws -> [ChattMedlem]
    func laggTill(_ gid: String, _ p: ChattPerson) async throws
    func lamna(_ gid: String) async throws
    func rapportera(anvandarnamn: String, orsak: String, detaljer: String, meddelande: ChattMeddelande?, i k: KonvId) async throws
    func forfragan(_ anvandarnamn: String) async throws -> String
    func acceptera(_ anvandarnamn: String) async throws
    func taBortKontakt(_ anvandarnamn: String) async throws
    func blockera(_ anvandarnamn: String) async throws
}

enum ChattUpplasning: Equatable { case klar, behoverNamn(forslag: String) }

enum KonvSort: String, Codable, Hashable, Sendable { case dm, grupp }

struct KonvId: Hashable, Codable, Sendable, Identifiable {
    let sort: KonvSort
    /// Användar-id (tvåpersonschatt) eller grupp-id.
    let id: String
    var nyckel: String { sort.rawValue + ":" + id }
}

struct ChattJag: Sendable, Equatable { let id: String; let anvandarnamn: String; var avatar: String? }

struct ChattPerson: Identifiable, Hashable, Sendable {
    let id: String
    var anvandarnamn: String
    var avatar: String?
    /// `nil` = personen visar inte sin status (eller vi visar inte vår).
    var online: Bool?
    var senastSedd: Date?
}

struct ChattKontaktlista: Sendable {
    var kontakter: [ChattPerson]
    var inkommande: [ChattPerson]
    var utgaende: [ChattPerson]
    var blockerade: [ChattPerson]
}

struct ChattGrupp: Identifiable, Hashable, Sendable {
    let id: String
    var namn: String
    var agare: String
    var antal: Int
    var sista: Date?
    var olasta: Int
    var avatar: String?
}

struct ChattMedlem: Identifiable, Hashable, Sendable {
    let id: String
    let anvandarnamn: String
    let avatar: String?
    let admin: Bool
    let online: Bool?
    let senastSedd: Date?
}

struct ChattCitat: Hashable, Sendable { let id: String; let vem: String; let text: String; let bild: Bool }

struct ChattBildinfo: Hashable, Sendable { let bilaga: String; let mime: String; let bredd: Int; let hojd: Int; let klistermarke: Bool }

struct ChattVideoinfo: Hashable, Sendable {
    let bilagor: [String]
    let mime: String
    let bredd: Int
    let hojd: Int
    let langd: Double
    /// Liten JPEG som visas innan videon hämtats.
    let tumnagel: Data?
}

enum ChattInnehall: Hashable, Sendable {
    case text(String)
    case bild(ChattBildinfo, text: String)
    case video(ChattVideoinfo, text: String)
    case reaktion(mal: String, emoji: String, pa: Bool)
    case samtal(missat: Bool)
    /// Samtalssignaler, skärmdelning och annat som inte visas som meddelande.
    case kontroll
    case olasbar
    case borttaget

    /// Vanliga meddelanden (räknas som olästa, visas i listan).
    var arMeddelande: Bool {
        switch self { case .text, .bild, .video, .olasbar: return true; default: return false }
    }
}

struct ChattMeddelande: Identifiable, Hashable, Sendable {
    let id: String
    let fran: String
    let franNamn: String
    let mitt: Bool
    let tid: Date
    var innehall: ChattInnehall
    var svar: ChattCitat?
    var redigerad: Bool
    /// Servertid i ms (för `sedan`).
    let ms: Int64

    var text: String {
        switch innehall {
        case .text(let t), .bild(_, let t), .video(_, let t): return t
        default: return ""
        }
    }
}

/// Det listan behöver om en konversation.
struct ChattSammanfattning: Sendable, Equatable {
    var senaste: ChattMeddelande?
    var olasta: Int
    /// Tvåpersonschatt: motparten har läst allt till och med den här tiden.
    var lastTill: Date?
    var skriver: [String]
}

struct ChattHamtning: Sendable {
    var meddelanden: [ChattMeddelande]
    var andringar: [ChattMeddelande]
    var servertid: Int64
    var lastTill: Date?
    var lastAv: [String: Date]
    var skriver: [String]
}

/// Det användaren skickar.
struct ChattUtkast: Sendable {
    var text: String
    var bild: Bilddata?
    var video: Videodata?
    var svar: ChattCitat?

    struct Bilddata: Sendable { let data: Data; let mime: String; let bredd: Int; let hojd: Int }
    struct Videodata: Sendable { let data: Data; let mime: String; let bredd: Int; let hojd: Int; let langd: Double; let tumnagel: Data? }
}

struct ChattFel: LocalizedError {
    let kod: String
    let meddelande: String
    let status: Int
    var errorDescription: String? { meddelande }
}

// MARK: - Klartextformatet (samma som datorn)

/// Klartexten i en post: vanlig text, `{"sk":"img",…}` (bild/klistermärke) eller `{"sk":"txt","c":text,"r":citat,…}`.
/// Kontrollposter har `"ax"` (reaktioner `{"t":"rx","m":id,"e":emoji,"on":bool}`, samtal `ring`, skärmdelning `sk`).
/// Video är nytt på telefonen och skickas som `{"sk":"txt","c":"🎬 Video","vid":{…}}`, så att datorn visar texten.
enum ChattFormat {
    static func tolka(_ klartext: String) -> (ChattInnehall, ChattCitat?) {
        guard klartext.first == "{" else { return (.text(klartext), nil) }
        let o = (try? JSONSerialization.jsonObject(with: Data(klartext.utf8))) as? [String: Any]
        let citat = (o?["r"] as? [String: Any]).flatMap(citatAv)
        if klartext.hasPrefix("{\"sk\":\"img\""), let o, o["sk"] as? String == "img",
           let a = o["a"] as? String, a.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil {
            let m = (o["m"] as? String).flatMap { $0.range(of: "^image/(jpeg|png|webp|gif)$", options: .regularExpression) != nil ? $0 : nil } ?? "image/jpeg"
            let info = ChattBildinfo(bilaga: a, mime: m, bredd: tal(o["w"]), hojd: tal(o["h"]), klistermarke: tal(o["st"]) == 1)
            return (.bild(info, text: o["c"] as? String ?? ""), citat)
        }
        guard klartext.hasPrefix("{\"sk\":\"txt\""), let o, o["sk"] as? String == "txt" else { return (.text(klartext), nil) }
        let c = o["c"] as? String ?? ""
        if let ax = o["ax"] as? [String: Any] {
            switch ax["t"] as? String {
            case "rx":
                let m = String(describing: ax["m"] ?? ""), e = ax["e"] as? String ?? ""
                guard m.range(of: "^\\d{1,15}$", options: .regularExpression) != nil, !e.isEmpty, e.count <= 16,
                      e.unicodeScalars.contains(where: { $0.properties.isEmoji && $0.value > 0xFF }) else { return (.kontroll, nil) }
                return (.reaktion(mal: m, emoji: e, pa: (ax["on"] as? Bool) != false), citat)
            case "ring":
                if ax["h"] as? String == "slut", ax["o"] as? String == "missat" { return (.samtal(missat: true), nil) }
                return (.kontroll, nil)
            default:
                return (.kontroll, nil)
            }
        }
        if let v = o["vid"] as? [String: Any], let a = v["a"] as? [String], !a.isEmpty,
           a.allSatisfy({ $0.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil }) {
            let info = ChattVideoinfo(bilagor: a, mime: v["m"] as? String ?? "video/mp4", bredd: tal(v["w"]), hojd: tal(v["h"]),
                                 langd: (v["d"] as? Double) ?? Double(tal(v["d"])),
                                 tumnagel: (v["t"] as? String).flatMap { s in s.split(separator: ",").last.flatMap { Data(base64Encoded: String($0)) } })
            return (.video(info, text: (v["c"] as? String) ?? ""), citat)
        }
        return (.text(c), citat)
    }

    private static func tal(_ v: Any?) -> Int { (v as? Int) ?? Int((v as? Double) ?? Double((v as? String) ?? "") ?? 0) }

    private static func citatAv(_ r: [String: Any]) -> ChattCitat? {
        guard let id = r["id"].map({ String(describing: $0).filter(\.isNumber) }), !id.isEmpty else { return nil }
        return ChattCitat(id: id, vem: String((r["u"] as? String ?? "").prefix(20)), text: String((r["t"] as? String ?? "").prefix(140)),
                     bild: (r["img"] as? Bool) == true)
    }

    // MARK: Skriva (nycklarna i datorns ordning: "sk" först, annars känner datorn inte igen posten)

    static func json(_ par: [(String, Any?)]) -> String {
        "{" + par.compactMap { k, v in v.map { "\(strang(k)):\(varde($0))" } }.joined(separator: ",") + "}"
    }

    private static func varde(_ v: Any) -> String {
        switch v {
        case let s as String: return strang(s)
        case let b as Bool: return b ? "true" : "false"
        case let i as Int: return String(i)
        case let d as Double: return d.isFinite ? (d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d)) : "0"
        case let p as [(String, Any?)]: return json(p)
        case let a as [String]: return "[" + a.map(strang).joined(separator: ",") + "]"
        default: return "null"
        }
    }

    static func strang(_ s: String) -> String {
        let d = (try? JSONSerialization.data(withJSONObject: s, options: [.fragmentsAllowed, .withoutEscapingSlashes])) ?? Data("\"\"".utf8)
        return String(data: d, encoding: .utf8) ?? "\"\""
    }

    static func citat(_ c: ChattCitat?) -> [(String, Any?)]? {
        guard let c else { return nil }
        return [("id", c.id), ("u", c.vem), ("t", String(c.text.prefix(140))), ("img", c.bild)]
    }
}
