import Foundation
import WebKit

/// Räknaren i skölden och på startsidan (datorns `adblock:tab` och `adblock:hit`).
///
/// WebKit säger inte vad innehållsblockeraren stoppade: det finns inget publikt API (regelåtgärden `notify` går
/// bara till ett privat delegatanrop). Därför räknas så här, och det är vad siffran betyder:
///
///  - Ett skript i en egen JS-värld (sidan ser det inte) lyssnar på `error` för element som hämtar något: bild,
///    skript, stilmall, video, ljud, objekt. Adresserna skickas hit i klumpar.
///  - En adress räknas om dess värd (eller en överordnad domän) är en som annons- och spårlistorna stoppar på alla
///    sajter (`Regler/data/raknare.txt`, ~97 000 värdar från `dnr2wk.py`) och sidan har listorna på sig.
///  - Räknas inte: ramar (iframe ger ingen `error`), fetch, XMLHttpRequest och beacon, regler för en viss sökväg,
///    dold kosmetik och kakrutor. Siffran blir därför ofta lägre än datorns. Ett nätfel mot en annonsvärd räknas.
///
/// Per flik nollställs siffran när huvudramen byter sida (`FlikNavigerade`, som datorns did-start-navigation).
/// Totalen (startsidans "annonser och spårare stoppade") sparas i UserDefaults och räknar privata flikar också,
/// som datorn.
///
/// Ägare: Skydd.
@MainActor
final class Raknare {
    static let namn = "adrazeRaknare"
    static let varld = WKContentWorld.world(name: "AdRazeRaknare")
    private static let totalNyckel = "skydd.raknare.totalt"

    /// Totalt sedan appen installerades.
    private(set) var totalt: Int
    /// Sedan appen startade.
    private(set) var session = 0

    private let mottagare = Mottagare()

    init() {
        totalt = UserDefaults.standard.integer(forKey: Self.totalNyckel)
    }

    /// Lägger skriptet och mottagaren i vyns `userContentController` (en gång per controller).
    func installera(i ucc: WKUserContentController, _ handle: @escaping @MainActor (WKScriptMessage) -> Void) {
        mottagare.handle = handle
        ucc.removeScriptMessageHandler(forName: Self.namn, contentWorld: Self.varld)
        ucc.add(mottagare, contentWorld: Self.varld, name: Self.namn)
        if !ucc.userScripts.contains(where: { $0.source.hasPrefix(Self.skriptMarke) }) {
            ucc.addUserScript(WKUserScript(source: Self.skript, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: Self.varld))
        }
    }

    func lagg(till n: Int) {
        guard n > 0 else { return }
        totalt += n
        session += n
        UserDefaults.standard.set(totalt, forKey: Self.totalNyckel)
    }

    /// Adresserna i ett meddelande från skriptet.
    static func adresser(_ m: WKScriptMessage) -> [URL] {
        guard let d = m.body as? [String: Any], let u = d["u"] as? [String] else { return [] }
        return u.prefix(300).compactMap { URL(string: $0) }
    }

    private static let skriptMarke = "/* adraze-raknare */"

    /// Kör i alla ramar i en egen värld. Ett `error` från ett element (fångas på vägen ned) blir en adress i kön,
    /// som skickas efter 250 ms. Världens `window` är skild från sidans, så flaggan och lyssnaren syns inte där.
    private static let skript = skriptMarke + """
    (() => {
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(namn);
      if (!h || window.__adrazeRaknare) return;
      window.__adrazeRaknare = true;
      let ko = [], t = 0;
      const skicka = () => { t = 0; const u = ko; ko = []; if (u.length) { try { h.postMessage({ u }); } catch (e) {} } };
      addEventListener('error', (e) => {
        const el = e.target;
        if (!el || el === window || el.nodeType !== 1) return;
        let u = el.currentSrc || el.src || el.href || el.data || '';
        if (typeof u !== 'string' || !/^https?:/i.test(u)) return;
        if (ko.length < 300) ko.push(u.slice(0, 400));
        if (!t) t = setTimeout(skicka, 250);
      }, true);
    })();
    """

    @MainActor
    private final class Mottagare: NSObject, WKScriptMessageHandler {
        var handle: (@MainActor (WKScriptMessage) -> Void)?
        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            handle?(message)
        }
    }
}
