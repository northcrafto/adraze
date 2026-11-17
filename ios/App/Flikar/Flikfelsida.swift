import Foundation
import UIKit

/// Felsidan när en sida inte går att öppna. Visas i fliken med `loadSimulatedRequest(_:responseHTML:)` (iOS 15+),
/// så att adressfältet och bakåtlistan har den riktiga adressen och "Försök igen" bara laddar den igen.
///
/// Texterna är datorns (`browser/main.js` `felText`) så långt de passar en telefon. Utseendet följer temat:
/// rubrik i Fraunces, text i Familjen Grotesk (båda inbäddade, inga nätanrop), accenten och ytorna från `Tema`
/// i ljust och mörkt läge, en av sajtens figurer (`site/illu/`, omfärgade för mörkt läge och för en annan
/// accent) och knappar med vätskefyllning. Ingen slogan.
@MainActor
enum Flikfelsida {
    /// Feldomänen för en flik som kraschat flera gånger (ingen riktig NSError-domän).
    static let kraschdoman = "AdRazeFlikar"
    /// "Tillbaka" på felsidan är en länk till `#adraze-tillbaka`, som fliken fångar och går till närmaste sida
    /// bakåt som inte är en felsida (`Webbflik.tillbakaFranFelsida`).
    static let tillbakaFragment = "adraze-tillbaka"
    /// Feldomänen när Endast HTTPS är på och sajten inte svarar säkert (koden är NSURLError-koden).
    static let httpsdoman = "AdRazeHttps"
    /// "Fortsätt utan kryptering" på den felsidan (`Webbflik.beslut` släpper igenom värden med http).
    static let osakertFragment = "adraze-osakert"

    struct Innehall {
        let rubrik: String
        let text: String
        let tips: [String]
        let figur: String
    }

    static func innehall(for f: Sidfel) -> Innehall {
        let vard = f.url?.host(percentEncoded: false) ?? f.url?.absoluteString ?? "sidan"
        let stavning = "Kolla att adressen är rätt stavad"
        let dns = "Kolla dina DNS-inställningar"
        let nere = "Eller så är sidan bara fel eller nere just nu"
        if f.doman == kraschdoman {
            return Innehall(rubrik: "Sidan kraschade", text: "\(vard) kraschade flera gånger i rad, så AdRaze laddar den inte igen av sig själv.",
                            tips: ["Försök igen om en stund", "Stäng andra flikar om telefonen har ont om minne"], figur: "cancel")
        }
        if f.doman == httpsdoman {
            return Innehall(rubrik: "Sidan har ingen säker anslutning", text: "Du har Endast HTTPS på, men \(vard) svarar inte säkert.",
                            tips: ["Sidan går bara att öppna utan kryptering",
                                   "Det du skickar till sidan, till exempel lösenord, kan läsas av andra på nätverket"],
                            figur: "secure-server")
        }
        if f.blockeradAvSkyddet {
            return Innehall(rubrik: "AdRaze stoppade sidan", text: "Skyddet stoppade \(vard) innan den laddades.",
                            tips: ["Pausa skyddet för sajten om du litar på den"], figur: "blocked")
        }
        if f.doman == NSURLErrorDomain {
            switch f.kod {
            case NSURLErrorNotConnectedToInternet, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff, NSURLErrorCallIsActive:
                return Innehall(rubrik: "Du är inte ansluten till internet", text: "AdRaze kommer inte ut på nätet just nu.",
                                tips: ["Kolla wifi eller mobildata", "Stäng av flygplansläget", dns], figur: "relaxation")
            case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
                return Innehall(rubrik: "Sidan kan inte nås", text: "Det gick inte att hitta servern för \(vard).",
                                tips: [stavning, dns, nere], figur: "surveillance")
            case NSURLErrorTimedOut:
                return Innehall(rubrik: "Sidan kan inte nås", text: "\(vard) tog för lång tid att svara.",
                                tips: ["Försök igen om en stund", dns, nere], figur: "fast-loading")
            case NSURLErrorCannotConnectToHost:
                return Innehall(rubrik: "Sidan kan inte nås", text: "Det gick inte att ansluta till \(vard).",
                                tips: [stavning, "Försök igen om en stund", nere], figur: "cancel")
            case NSURLErrorNetworkConnectionLost:
                return Innehall(rubrik: "Anslutningen bröts", text: "Anslutningen till \(vard) bröts medan sidan laddades.",
                                tips: ["Kolla wifi eller mobildata", "Försök igen om en stund"], figur: "cancel")
            case NSURLErrorHTTPTooManyRedirects:
                return Innehall(rubrik: "Sidan kan inte nås", text: "\(vard) skickar vidare i en ring och sidan blir aldrig klar.",
                                tips: ["Försök igen om en stund", nere], figur: "fast-loading")
            case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateUntrusted,
                 NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid,
                 NSURLErrorClientCertificateRejected, NSURLErrorClientCertificateRequired:
                return Innehall(rubrik: "Anslutningen är inte säker",
                                text: "Certifikatet för \(vard) är ogiltigt. AdRaze stoppade sidan för att skydda dig.",
                                tips: ["Kolla att telefonens datum och tid stämmer", nere], figur: "secure-server")
            default:
                break
            }
        }
        return Innehall(rubrik: "Sidan kan inte nås", text: "Det gick inte att ladda \(vard).", tips: [stavning, dns, nere],
                        figur: "casual-browsing")
    }

    /// Hela sidan. `kanGaBakat` = visa "Tillbaka".
    static func html(for f: Sidfel, tema: Tema, kanGaBakat: Bool) -> String {
        let inn = innehall(for: f)
        let adress = f.url?.absoluteString ?? ""
        let kod = f.doman == kraschdoman || f.doman == httpsdoman ? "" : "\(f.doman) \(f.kod)"
        var rader: [String] = []
        rader.append("<!doctype html><html lang=\"sv\"><head><meta charset=\"utf-8\">")
        rader.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">")
        rader.append("<meta name=\"color-scheme\" content=\"light dark\">")
        rader.append("<title>\(esc(inn.rubrik))</title><style>\(typsnittCSS)\(stil(tema))</style></head>")
        rader.append("<body ontouchstart=\"\"><main>")
        rader.append(figur(inn.figur))
        rader.append("<h1>\(esc(inn.rubrik))</h1>")
        rader.append("<p class=\"t\">\(esc(inn.text))</p>")
        if !inn.tips.isEmpty {
            rader.append("<ul>" + inn.tips.map { "<li>\(esc($0))</li>" }.joined() + "</ul>")
        }
        if !kod.isEmpty { rader.append("<p class=\"kod\">Felkod: \(esc(kod))</p>") }
        rader.append("<div class=\"knappar\">")
        if f.doman == httpsdoman {
            rader.append("<a class=\"liq\" id=\"osakert\" href=\"#\(osakertFragment)\">Fortsätt utan kryptering</a>")
        } else if !adress.isEmpty, !f.blockeradAvSkyddet {
            rader.append("<a class=\"liq\" id=\"igen\" href=\"\(esc(adress))\">Försök igen</a>")
        }
        if kanGaBakat {
            rader.append("<a class=\"liq liq-ghost\" id=\"bakat\" href=\"#\(tillbakaFragment)\">Tillbaka</a>")
        }
        rader.append("</div></main><script>\(skript)</script></body></html>")
        return rader.joined(separator: "\n")
    }

    // MARK: - Utseendet

    private static func stil(_ tema: Tema) -> String {
        func v(_ r: Fargroll, _ morkt: Bool) -> String {
            let f = tema.varde(r, morkt: morkt)
            guard f.alfa < 1 else { return f.hex }
            let c = UIColor(hex: f.hex)
            var r = CGFloat(0), g = CGFloat(0), b = CGFloat(0), a = CGFloat(0)
            c.getRed(&r, green: &g, blue: &b, alpha: &a)
            return "rgba(\(Int(r * 255)),\(Int(g * 255)),\(Int(b * 255)),\(f.alfa))"
        }
        func varden(_ m: Bool) -> String {
            "--bg:\(v(.bakgrund, m));--yta:\(v(.yta, m));--yta2:\(v(.yta2, m));--text:\(v(.text, m));--dampad:\(v(.dampad, m));"
                + "--svag:\(v(.svag, m));--linje:\(v(.linje, m));--accent:\(v(.accent, m));--accent-text:\(v(.accentText, m));"
                + "--pa-accent:\(v(.paAccent, m));--fyll-fran:\(v(.fyllnadFran, m));--fyll-till:\(v(.fyllnadTill, m));"
        }
        let radie = tema.radier.storKnapp == 999 ? "999px" : "\(Int(tema.radier.storKnapp))px"   // som appens stora knappar
        return """
        :root{\(varden(false))--r:\(radie)}
        @media (prefers-color-scheme: dark){:root{\(varden(true))}
        .l1{fill:#2a2927}.l2{fill:#3a3936}.w{fill:#24231f}.n1{fill:#77758a}.n2{fill:#a9a6b6}}
        *{box-sizing:border-box}
        html{background:var(--bg);-webkit-text-size-adjust:100%}
        body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;background:var(--bg);color:var(--text);
        font:17px/1.5 "Familjen Grotesk",-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
        main{width:100%;max-width:460px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) 24px max(28px,env(safe-area-inset-bottom))}
        .figur{display:block;width:auto;height:clamp(120px,27dvh,200px);max-width:100%;margin:0 0 22px -4px}
        .figur .a{fill:var(--accent)}
        h1{font-family:"AdRaze Display",Charter,"Iowan Old Style",Georgia,serif;font-weight:600;font-size:32px;line-height:1.08;
        letter-spacing:-.02em;font-variation-settings:"opsz" 40;margin:0 0 12px;text-wrap:balance}
        .t{margin:0;color:var(--dampad);overflow-wrap:anywhere;text-wrap:pretty}
        ul{list-style:none;margin:22px 0 0;padding:0;border-top:1px solid var(--linje)}
        li{position:relative;padding:9px 0 9px 22px;border-bottom:1px solid var(--linje);font-size:16px;line-height:1.4}
        li::before{content:"";position:absolute;left:3px;top:1.05em;width:7px;height:7px;border-radius:50%;background:var(--accent)}
        .kod{margin:16px 0 0;font:13px/1.4 ui-monospace,Menlo,monospace;color:var(--svag)}
        .knappar{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
        .liq{position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;
        min-height:50px;padding:0 24px;border:0;border-radius:var(--r);background:var(--accent);color:var(--pa-accent);
        font:600 16px/1 "Familjen Grotesk",-apple-system,system-ui,sans-serif;text-decoration:none;
        -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;transition:color .6s ease}
        .liq::before{content:"";position:absolute;z-index:-1;left:-15%;bottom:-2px;width:130%;height:170%;
        border-radius:46% 46% 0 0;background:linear-gradient(var(--fyll-fran),var(--fyll-till));transform:translateY(100%);
        transition:transform .95s cubic-bezier(.2,.75,.25,1);pointer-events:none}
        .liq:active::before,.liq.fylld::before{transform:translateY(0)}
        .liq:active,.liq.fylld{color:var(--bg)}
        .liq-ghost{background:transparent;color:var(--accent-text);box-shadow:inset 0 0 0 1px var(--linje)}
        .liq-ghost::before{background:var(--accent)}
        .liq-ghost:active,.liq-ghost.fylld{color:var(--pa-accent)}
        @media (prefers-reduced-motion: reduce){.liq::before{border-radius:0;transform:none;opacity:0;transition:opacity .2s}
        .liq:active::before,.liq.fylld::before{opacity:1;transform:none}}
        """
    }

    /// Vätskan fyller hela knappen även vid ett snabbt tryck (som skalets knappar).
    private static let skript = """
    document.querySelectorAll('.liq').forEach(function(k){var t0=0;
    k.addEventListener('touchstart',function(){t0=Date.now();k.classList.add('fylld')},{passive:true});
    function slapp(){var kvar=Math.max(0,950-(Date.now()-t0))+100;setTimeout(function(){k.classList.remove('fylld')},kvar)}
    k.addEventListener('touchend',slapp);k.addEventListener('touchcancel',slapp)});
    """

    // MARK: - Typsnitt och figurer

    private static let typsnittCSS: String = {
        var css = ""
        if let d = Bunt.data("Flikar", "Typsnitt/fraunces.woff2") {
            css += "@font-face{font-family:\"AdRaze Display\";src:url(data:font/woff2;base64,\(d.base64EncodedString())) format(\"woff2\");"
                + "font-weight:100 900;font-style:normal;font-display:block}"
        }
        if let d = Bunt.data("Flikar", "Typsnitt/familjen.woff2") {
            css += "@font-face{font-family:\"Familjen Grotesk\";src:url(data:font/woff2;base64,\(d.base64EncodedString())) format(\"woff2\");"
                + "font-weight:400 700;font-style:normal;font-display:block}"
        }
        return css
    }()

    private static var figurer: [String: String] = [:]

    /// En av sajtens figurer, inbäddad. Färgerna får klasser så att mörkt läge och accenten kan byta dem:
    /// a = accenten, l1/l2 = ljusgrått, w = vitt, n1/n2 = mörkblått.
    static func figur(_ namn: String) -> String {
        if let f = figurer[namn] { return f }
        guard let data = Bunt.data("Flikar", "Illustrationer/\(namn).svg"), var s = String(data: data, encoding: .utf8) else { return "" }
        if let start = s.range(of: "<svg") { s = String(s[start.lowerBound...]) }
        // Bredd och höjd på roten bort (höjden sätts i CSS och bredden följer viewBox), figuren vänsterställd i rutan.
        if let slut = s.range(of: ">") {
            var rot = String(s[..<slut.lowerBound])
            rot = rot.replacingOccurrences(of: #"\s(width|height|preserveAspectRatio)="[^"]*""#, with: "", options: .regularExpression)
            rot = rot.replacingOccurrences(of: #"\s(id|data-name)="[^"]*""#, with: "", options: .regularExpression)
            s = rot + " class=\"figur\" preserveAspectRatio=\"xMinYMid meet\" role=\"img\" aria-hidden=\"true\" focusable=\"false\""
                + s[slut.lowerBound...]
        }
        let klasser: [String: String] = [
            "#ff4b1f": "a",
            "#e6e6e6": "l1", "#f2f2f2": "l1", "#f1f1f1": "l1", "#e4e4e4": "l1", "#e5e5e5": "l1",
            "#ccc": "l2", "#cccccc": "l2", "#cacaca": "l2", "#cbcbcb": "l2", "#b3b3b3": "l2", "#d0cde1": "l2",
            "#fff": "w", "#ffffff": "w",
            "#3f3d56": "n1", "#2f2e41": "n1", "#090814": "n2",
        ]
        let monster = try? NSRegularExpression(pattern: #"fill="(#[0-9a-fA-F]{3,6})""#)
        let ns = s as NSString
        var ut = ""
        var forra = 0
        for m in monster?.matches(in: s, range: NSRange(location: 0, length: ns.length)) ?? [] {
            let farg = ns.substring(with: m.range(at: 1)).lowercased()
            ut += ns.substring(with: NSRange(location: forra, length: m.range.location - forra))
            ut += ns.substring(with: m.range)
            if let k = klasser[farg] { ut += " class=\"\(k)\"" }
            forra = m.range.location + m.range.length
        }
        ut += ns.substring(from: forra)
        figurer[namn] = ut
        return ut
    }

    static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }
}
