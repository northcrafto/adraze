import Foundation
import WebKit

/// Räknaren i skölden och på startsidan (datorns `adblock:tab` och `adblock:hit`).
///
/// WebKit säger inte vad innehållsblockeraren stoppade: det finns inget publikt API (regelåtgärden `notify` går
/// bara till ett privat delegatanrop). Därför räknas bara det som sidan själv ser misslyckas, och det är vad
/// siffran betyder:
///
///  - Ett skript i en egen JS-värld (sidan ser det inte) lyssnar på `error` för element i dokumentet som hämtar
///    något: bild, skript, stilmall (även `preload`), video, ljud, objekt.
///  - Ett litet skript i sidans värld (`sidskript`, läggs bara på sidor där skyddet gäller) ser det som inte når
///    dokumentet: `fetch` som avvisas, `XMLHttpRequest` som ger `error`, `navigator.sendBeacon` som svarar
///    `false` (WebKit stoppar beacon redan när den skickas) och bilder, skript och ljud som skapas men aldrig
///    sätts in i dokumentet (`new Image()`). Det skickar adressen till den egna världen med en händelse vars namn
///    slumpas för varje körning, så att ingenting räknas två gånger.
///  - Ramar: WebKit ger ingen händelse när en ram stoppas (ingen `load`, mätt). Sidans `load` väntar på varje ram
///    som fortfarande laddar, så en `iframe` mot en räknarvärd som efter sidans `load` ännu har sitt tomma
///    startdokument (`about:blank`) fick aldrig sitt dokument och räknas. Ramar som sätts in efter sidans `load`
///    och lata ramar (`loading="lazy"`) räknas inte.
///  - En adress räknas om dess värd (eller en överordnad domän) är en som annons- och spårlistorna stoppar på alla
///    sajter (`Regler/data/raknare.txt`, ~97 000 värdar från `dnr2wk.py`) och sidan har listorna på sig.
///  - Räknas inte: regler för en viss sökväg, WebSocket, dold kosmetik och kakrutor. Ett nätfel mot en annonsvärd
///    räknas (det går inte att skilja från ett stopp). Mätt mot blocktestet i `SkyddProv` 2026-11-17: av 16
///    stoppade räknades 11 med bara element (fetch och bilden som aldrig sattes in saknades) och 14 nu; de två
///    andra är Facebook-adresser som en regel för en viss sökväg stoppar. Ram, XHR, beacon och bilden utanför
///    dokumentet provas på en egen sida i samma test (`raknaren_ramar_och_anrop`).
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
    /// Händelsen som sidans skript skickar adresserna med (slumpad för varje körning).
    static let kanal = "adraze-r-" + UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "").prefix(12)
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

    /// Kör i alla ramar i en egen värld. Ett `error` från ett element (fångas på vägen ned), en adress från
    /// sidans skript (`kanal`) eller en ram som var tom efter sidans `load` blir en adress i kön, som skickas efter
    /// 250 ms. Världens
    /// `window` är skild från sidans, så flaggan och lyssnarna syns inte där.
    private static let skript = skriptMarke + """
    (() => {
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(namn);
      if (!h || window.__adrazeRaknare) return;
      window.__adrazeRaknare = true;
      let ko = [], t = 0;
      const skicka = () => { t = 0; const u = ko; ko = []; if (u.length) { try { h.postMessage({ u }); } catch (e) {} } };
      const lagg = (u) => {
        if (typeof u !== 'string' || !/^https?:/i.test(u)) return;
        if (ko.length < 300) ko.push(u.slice(0, 400));
        if (!t) t = setTimeout(skicka, 250);
      };
      addEventListener('error', (e) => {
        const el = e.target;
        if (!el || el === window || el.nodeType !== 1) return;
        lagg(el.currentSrc || el.src || el.href || el.data || '');
      }, true);
      document.addEventListener('\(kanal)', (e) => { lagg(e.detail); }, true);
      // Ramar: WebKit ger ingen händelse när en ram stoppas (ingen load, mätt). Sidans load väntar på varje ram
      // som fortfarande laddar, så en ram som efter den ännu har sitt tomma startdokument fick aldrig sitt.
      // Lata ramar (loading=lazy) laddar först nära skärmen och hoppas över.
      const ramkoll = () => {
        document.querySelectorAll('iframe[src]').forEach((f) => {
          const u = f.src;
          if (typeof u !== 'string' || !/^https?:/i.test(u) || String(f.getAttribute('loading')).toLowerCase() === 'lazy') return;
          let tom = false;
          try { const d = f.contentDocument; tom = !!d && d.URL === 'about:blank'; } catch (e) {}
          if (tom) lagg(u);
        });
      };
      if (document.readyState !== 'complete') addEventListener('load', () => setTimeout(ramkoll, 0), { once: true });
    })();
    """

    /// I sidans värld (en `Skriptdel` från `Skriptbygge`, bara där skyddet gäller): det som misslyckas utan att nå
    /// dokumentet. Lindar med `Proxy` som skyddets andra skript, så att sidans anrop fungerar som förut.
    static var sidskript: String { """
    (() => {
      const E = '\(kanal)', doc = document, CE = CustomEvent, Req = window.Request;
      const skickaH = EventTarget.prototype.dispatchEvent, lyssna = EventTarget.prototype.addEventListener;
      const rapportera = (u) => {
        try {
          const s = (Req && u instanceof Req) ? u.url : String(u);
          const a = new URL(s, location.href).href;
          if (/^https?:/i.test(a)) skickaH.call(doc, new CE(E, { detail: a.slice(0, 400) }));
        } catch (e) {}
      };
      const f = window.fetch;
      if (typeof f === 'function') {
        window.fetch = new Proxy(f, { apply(t, self, a) {
          const p = Reflect.apply(t, self, a);
          try { const u = a[0]; p.then(null, () => rapportera(u)); } catch (e) {}
          return p;
        } });
      }
      const X = window.XMLHttpRequest;
      if (X && X.prototype) {
        const adr = new WeakMap();
        const vidFel = function () { const u = adr.get(this); if (u !== undefined) rapportera(u); };
        X.prototype.open = new Proxy(X.prototype.open, { apply(t, self, a) {
          try { if (a.length > 1) adr.set(self, String(a[1])); } catch (e) {}
          return Reflect.apply(t, self, a);
        } });
        X.prototype.send = new Proxy(X.prototype.send, { apply(t, self, a) {
          try { lyssna.call(self, 'error', vidFel); } catch (e) {}
          return Reflect.apply(t, self, a);
        } });
      }
      const N = window.Navigator && Navigator.prototype;
      if (N && typeof N.sendBeacon === 'function') {
        N.sendBeacon = new Proxy(N.sendBeacon, { apply(t, self, a) {
          const r = Reflect.apply(t, self, a);
          if (r === false && a.length) rapportera(a[0]);
          return r;
        } });
      }
      // Element som aldrig sätts in i dokumentet: deras error når inte den egna världens lyssnare
      const elFel = function (e) {
        const el = e.target;
        if (!el || el.isConnected) return;
        const u = el.currentSrc || el.src || el.href || '';
        if (u) rapportera(u);
      };
      const TAGG = /^(img|script|link|audio|video)$/i;
      const D = window.Document && Document.prototype;
      if (D && typeof D.createElement === 'function') {
        D.createElement = new Proxy(D.createElement, { apply(t, self, a) {
          const el = Reflect.apply(t, self, a);
          try { if (TAGG.test(String(a[0]))) lyssna.call(el, 'error', elFel); } catch (e) {}
          return el;
        } });
      }
      for (const namn of ['Image', 'Audio']) {
        const K = window[namn];
        if (typeof K !== 'function') continue;
        window[namn] = new Proxy(K, { construct(t, a, nt) {
          const el = Reflect.construct(t, a, nt);
          try { lyssna.call(el, 'error', elFel); } catch (e) {}
          return el;
        } });
      }
    })();
    """ }

    @MainActor
    private final class Mottagare: NSObject, WKScriptMessageHandler {
        var handle: (@MainActor (WKScriptMessage) -> Void)?
        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            handle?(message)
        }
    }
}
