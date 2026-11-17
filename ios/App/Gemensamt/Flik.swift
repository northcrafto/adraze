import Foundation
import Observation
import UIKit
import WebKit

/// En flik med en vanlig webbsida. Kontraktet mellan Flikar (som gör flikarna) och Skal (som visar dem).
///
/// Klasser som uppfyller protokollet ska vara `@Observable`, så att skalet ritas om när adress, titel eller
/// laddning ändras. Allt körs på huvudtråden.
///
/// Regler (del 3, 3.4): en flik med en vanlig webbsida får aldrig bryggan (`adraze`) eller schemat `adraze-app:`.
/// Skyddet läggs på med `app.skydd.forbered(_:privat:)` innan första laddningen.
///
/// Ägare: Grund (Gemensamt). Riktig implementation: Flikar (`App/Flikar/`). Enkel ersättning tills dess:
/// `EnkelFlik` i `Gemensamt/Stubbar/`.
@MainActor
protocol Flik: AnyObject, Observable {
    var id: UUID { get }
    /// Privat flik: eget datalager som inte sparas, ingen historik.
    var privat: Bool { get }
    /// Adressen som huvudramen har bekräftat (didCommit). `nil` = ny tom flik.
    var url: URL? { get }
    var titel: String { get }
    var laddar: Bool { get }
    /// 0–1 medan sidan laddas.
    var framsteg: Double { get }
    var kanGaBakat: Bool { get }
    var kanGaFramat: Bool { get }
    /// Sant när allt på sidan kom över https (`hasOnlySecureContent`).
    var sakerAnslutning: Bool { get }
    /// Senaste felet när en sida inte gick att ladda. Nollställs vid nästa lyckade laddning.
    var fel: Sidfel? { get }
    /// Webbvyn. Får skapas först när den behövs och släppas när fliken sover (`flikar.sova`).
    var webbvy: WKWebView { get }

    /// Fliken som öppnade den här (länk med target=_blank, window.open), annars `nil`.
    var oppnadAv: UUID? { get }
    /// Fliken har släppt sin webbvy för att spara minne. `webbvy` väcker den.
    var sover: Bool { get }
    /// Fliken visar Flikars felsida (eller skyddets stoppsida) i webbvyn. Skalet lägger då inget eget ovanpå.
    var visarFelsida: Bool { get }
    /// Sajtens ikon (hämtad av fliken), eller `nil` medan den saknas.
    var favikon: UIImage? { get }
    /// Den senaste bilden av sidan, för flikväxlaren (tas när fliken lämnas och efter laddning).
    var miniatyr: UIImage? { get }
    /// Sidans `theme-color`, för skalets rader.
    var temafarg: UIColor? { get }
    /// Sidzoomen (0,5–3), sparad per sajt.
    var zoom: Double { get }
    /// Skrivbordsversionen av sajten (datorns användaragent och `preferredContentMode = .desktop`).
    var skrivbordslage: Bool { get }
    /// Sidan visar en video eller ett element i helskärm.
    var helskarm: Bool { get }

    func ladda(_ url: URL)
    /// Det användaren skrev i adressfältet: en adress eller en sökning (`Webbadress.tolka`).
    func ladda(text: String)
    func bakat()
    func framat()
    func laddaOm()
    func stoppa()

    func sattZoom(_ z: Double)
    /// Ett zoomsteg in eller ut.
    func zooma(inat: Bool)
    /// Byter mellan mobil- och skrivbordsversion och laddar om sidan.
    func sattSkrivbordslage(_ pa: Bool)
    /// Söker på sidan och ger antalet träffar (markerar den första).
    func hitta(_ text: String) async -> Int
    /// Visar systemets sökfält ("Hitta på sidan"), med `text` ifylld om den finns.
    func visaSokfalt(_ text: String?)
}

/// Alla flikar. Kontraktet mellan Flikar och Skal (och Labb, som öppnar sidor i självtesterna).
///
/// Ägare: Grund (Gemensamt). Riktig implementation: Flikar. Ersättning tills dess: `EnkelFlikHanterare`.
@MainActor
protocol FlikHanterare: AnyObject, Observable {
    /// I visningsordning.
    var flikar: [any Flik] { get }
    var aktiv: (any Flik)? { get }

    /// Öppnar en ny flik (`url == nil` = tom ny flik/startsidan). `aktivera` = visa den direkt.
    @discardableResult
    func nyFlik(_ url: URL?, privat: Bool, aktivera: Bool) -> any Flik
    func aktivera(_ id: UUID)
    func stang(_ id: UUID)

    /// Det finns en stängd flik att öppna igen.
    var kanAngraStang: Bool { get }
    /// Öppnar den senast stängda fliken igen (med bakåt/framåt-listan) och gör den aktiv.
    @discardableResult
    func angraStang() -> (any Flik)?
    /// Flyttar en flik till en ny plats i ordningen.
    func flytta(_ id: UUID, till plats: Int)
    /// Stänger alla privata (eller alla vanliga) flikar.
    func stangAlla(privata: Bool)
}

extension FlikHanterare {
    func flik(_ id: UUID) -> (any Flik)? { flikar.first { $0.id == id } }
    var aktivId: UUID? { aktiv?.id }

    @discardableResult
    func nyFlik(_ url: URL? = nil) -> any Flik { nyFlik(url, privat: false, aktivera: true) }
}

/// Varför en sida inte laddades.
struct Sidfel: Sendable, Hashable {
    let url: URL?
    let doman: String
    let kod: Int
    let text: String

    /// Skyddet stoppade hela sidan (WebKit-fel 104, "Frame load interrupted by content blocker").
    var blockeradAvSkyddet: Bool { doman == "WebKitErrorDomain" && kod == 104 }
    /// Användaren eller en ny navigering avbröt (inte ett riktigt fel).
    var avbruten: Bool { doman == NSURLErrorDomain && kod == NSURLErrorCancelled }

    init(url: URL?, doman: String, kod: Int, text: String) {
        self.url = url
        self.doman = doman
        self.kod = kod
        self.text = text
    }

    init(_ fel: Error, url: URL?) {
        let ns = fel as NSError
        self.url = url ?? (ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
        doman = ns.domain
        kod = ns.code
        text = ns.localizedDescription
    }
}

// MARK: - Användaragenten

/// Användaragenten för flikarna. WKWebView skickar som standard utan Safaris slut
/// (`… (KHTML, like Gecko) Mobile/15E148`), så en del sajter tror inte att det är en riktig webbläsare.
/// Med `applicationNameForUserAgent` blir slutet som Safaris:
///
///     Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)
///     Version/26.1 Mobile/15E148 Safari/604.1
///
/// `iPhone OS 18_x` är fryst av WebKit och står även på iOS 26 (testat i del 3, 1.8). `Version/` följer
/// iOS-versionen som i Safari (för iOS 26 är det overifierat om Safari skriver 26.0 eller 26.1).
@MainActor
enum Anvandaragent {
    static var applikationsnamn: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "Version/\(v.majorVersion).\(v.minorVersion) Mobile/15E148 Safari/604.1"
    }

    /// Sätter Safaris slut på en konfiguration. Anropas innan webbvyn skapas.
    static func anvand(pa konfiguration: WKWebViewConfiguration) {
        konfiguration.applicationNameForUserAgent = applikationsnamn
    }
}

// MARK: - Adressfältet

/// Det användaren skriver i adressfältet blir en adress eller en sökning, på samma sätt som datorns
/// `normalizeUrl` och `searchUrl` (`ui/shell.js` 64–86) med snabbord och egen standardsökmotor
/// (`ui/anpassa-sokmotorer.js`). Används av både Skal och Flikar.
@MainActor
enum Webbadress {
    /// `nil` = tom text.
    static func tolka(_ text: String, privat: Bool = false, installningar: Installningar) -> URL? {
        let s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        let lagre = s.lowercased()
        // Bara http(s), about: och AdRazes egna sidor släpps in som adresser. file:, javascript: och andra
        // scheman blir en sökning (på datorn: file: delar ursprung med skalet).
        if lagre.hasPrefix("http://") || lagre.hasPrefix("https://") || lagre.hasPrefix("about:") || lagre.hasPrefix("adraze:") {
            if let u = URL(string: s) { return u }
        }
        if s.range(of: #"^[a-z][a-z0-9+.-]*://"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return sok(s, privat: privat, installningar: installningar)
        }
        if !s.contains(" "), s.range(of: #"^[^\s]+\.[^\s]{2,}(/.*)?$"#, options: .regularExpression) != nil,
           let u = URL(string: "https://" + s) {
            return u
        }
        return sok(s, privat: privat, installningar: installningar)
    }

    /// Adressen för en sökning: snabbord ("yt katter"), egen standardsökmotor, annars vald inbyggd motor.
    /// Privata flikar söker med AdRaze Search. I barnläge används bara den inbyggda motorn.
    static func sok(_ q: String, privat: Bool = false, installningar: Installningar) -> URL? {
        let barn = installningar.arBarnlage()
        if !barn {
            if let t = snabbord(q, installningar: installningar) { return t }
            if !privat, let id = installningar[.sokStandard], let m = egnaMotorer(installningar).first(where: { $0.id == id }) {
                return URL(string: m.url.replacingOccurrences(of: "%s", with: kodad(q)))
            }
        }
        let motor = privat ? Sokmotorer.privat : Sokmotorer.motor(installningar[.sokMotor])
        return URL(string: motor.bas + kodad(q))
    }

    /// Som `encodeURIComponent` i JavaScript.
    static func kodad(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: tillatna) ?? s
    }

    private static let tillatna = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

    struct EgenMotor: Sendable, Hashable {
        let id: String
        let namn: String
        let url: String
        let snabbord: String
    }

    /// `sok.egna`, rensat som på datorn (giltig adress med %s, unika snabbord, högst 60).
    static func egnaMotorer(_ installningar: Installningar) -> [EgenMotor] {
        var ut: [EgenMotor] = []
        var ord = Set<String>()
        for m in installningar[.sokEgna].lista ?? [] {
            let url = (m["url"].text ?? "").trimmingCharacters(in: .whitespaces)
            let namn = String((m["namn"].text ?? "").trimmingCharacters(in: .whitespaces).prefix(40))
            guard !namn.isEmpty, url.range(of: #"^https?://[^\s/?#]+[^\s]*$"#, options: [.regularExpression, .caseInsensitive]) != nil,
                  url.contains("%s"), url.count <= 2000 else { continue }
            var sb = (m["snabbord"].text ?? "").trimmingCharacters(in: .whitespaces).lowercased()
            if !sb.isEmpty, sb.range(of: #"^[\p{L}\p{N}@._+-]{1,20}$"#, options: .regularExpression) == nil || ord.contains(sb) { sb = "" }
            if !sb.isEmpty { ord.insert(sb) }
            ut.append(EgenMotor(id: m["id"].text ?? namn, namn: namn, url: url, snabbord: sb))
            if ut.count >= 60 { break }
        }
        return ut
    }

    /// "yt katter" ger YouTubes sökning efter "katter". Snabbordet måste vara första ordet och följas av mer text.
    static func snabbord(_ text: String, installningar: Installningar) -> URL? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let mellan = t.firstIndex(where: { $0.isWhitespace }) else { return nil }
        let ord = t[..<mellan].lowercased()
        let rest = t[mellan...].trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rest.isEmpty, let m = egnaMotorer(installningar).first(where: { !$0.snabbord.isEmpty && $0.snabbord == ord }) else { return nil }
        return URL(string: m.url.replacingOccurrences(of: "%s", with: kodad(rest)))
    }

    /// Hur adressen visas i adressfältet (`verktyg.adress` och `verktyg.doljSchema`).
    static func visning(_ url: URL?, installningar: Installningar) -> String {
        guard let url else { return "" }
        guard let vard = url.host(percentEncoded: false), !vard.isEmpty else { return url.absoluteString }
        let utanWww = vard.hasPrefix("www.") ? String(vard.dropFirst(4)) : vard
        if installningar[.verktygAdress] == .doman { return utanWww }
        var s = url.absoluteString
        if installningar[.verktygDoljSchema] {
            for p in ["https://www.", "http://www.", "https://", "http://"] where s.hasPrefix(p) {
                s = String(s.dropFirst(p.count))
                break
            }
            if s.hasSuffix("/") && s.filter({ $0 == "/" }).count == 1 { s.removeLast() }
        }
        return s
    }
}
