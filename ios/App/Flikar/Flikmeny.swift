import Foundation
import Photos
import UIKit
import WebKit

/// Snabbmenyn för länkar och bilder (långt tryck) och Flikars små skript. Skripten körs i en egen värld
/// (`WKContentWorld` "AdRazeFlikar"), så sidan varken ser eller kan ändra dem.
///
/// `WKContextMenuElementInfo` har bara `linkURL`, så bilden under fingret tas från ett skript som minns var
/// senaste beröringen var (`touchstart`) och letar upp `<img>` och `<a href>` där.
@MainActor
enum Flikmeny {
    static let varld = WKContentWorld.world(name: "AdRazeFlikar")

    /// Lägger in skripten i en ny webbvy (före första laddningen).
    static func forbered(_ v: WKWebView) {
        v.configuration.userContentController.addUserScript(
            WKUserScript(source: sparJS, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: varld))
    }

    /// Minns senaste beröringen; `info(x, y)` ger länken och bilden vid en punkt (eller vid beröringen).
    static let sparJS = """
    (function(){
      if (window.__adrazeFlikar) return;
      var s = { x: 0, y: 0, t: 0, el: null };
      function upp(el) {
        var lank = null, bild = null, alt = null;
        for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
          var tag = (n.tagName || '').toUpperCase();
          if (!bild && tag === 'IMG') { bild = n.currentSrc || n.src || null; alt = n.alt || null; }
          if (!lank && (tag === 'A' || tag === 'AREA')) {
            var h = n.href; if (h && typeof h !== 'string') h = h.baseVal ? new URL(h.baseVal, document.baseURI).href : null;
            if (h) lank = h;
          }
          if (lank && bild) break;
        }
        return { lank: lank, bild: bild, alt: alt };
      }
      window.addEventListener('touchstart', function (e) {
        var p = e.touches && e.touches[0]; if (!p) return;
        s.x = p.clientX; s.y = p.clientY; s.t = Date.now(); s.el = e.target;
      }, { capture: true, passive: true });
      window.__adrazeFlikar = {
        info: function (x, y) {
          var el = null;
          if (typeof x === 'number' && typeof y === 'number') el = document.elementFromPoint(x, y);
          else if (s.el && Date.now() - s.t < 8000) el = s.el;
          return el ? upp(el) : null;
        }
      };
    })();
    """

    /// Sidans ikoner, bästa först (sizes nära 64, sedan apple-touch-icon, sedan övriga). SVG hoppas över.
    static let favikonJS = """
    var c = [];
    document.querySelectorAll('link[rel]').forEach(function (l) {
      var rel = (l.getAttribute('rel') || '').toLowerCase().split(/\\s+/);
      var href = l.href; if (!href) return;
      var typ = (l.getAttribute('type') || '').toLowerCase();
      if (typ.indexOf('svg') >= 0 || /\\.svg(\\?|#|$)/i.test(href)) return;
      var touch = rel.indexOf('apple-touch-icon') >= 0 || rel.indexOf('apple-touch-icon-precomposed') >= 0;
      if (!touch && rel.indexOf('icon') < 0) return;
      var p, m = /(\\d+)x(\\d+)/i.exec(l.getAttribute('sizes') || '');
      if (m) { var n = parseInt(m[1], 10); p = n >= 32 && n <= 256 ? 300 - Math.abs(n - 64) : 50; }
      else p = touch ? 200 : 100;
      c.push([p, href]);
    });
    c.sort(function (a, b) { return b[0] - a[0]; });
    return c.map(function (x) { return x[1]; }).slice(0, 4);
    """

    /// Antal träffar för `t` i sidans synliga text (utan hänsyn till versaler).
    static let raknaJS = """
    var txt = ((document.body && document.body.innerText) || '').toLowerCase();
    var q = String(t || '').toLowerCase(); if (!q) return 0;
    var n = 0, i = 0; while ((i = txt.indexOf(q, i)) >= 0) { n++; i += q.length; }
    return n;
    """

    struct Element: Sendable, Equatable {
        var lank: URL?
        var bild: URL?
        var alt: String?
    }

    /// Länken och bilden vid en punkt i sidan (CSS-pixlar), eller där senaste beröringen var (`punkt == nil`).
    static func element(i v: WKWebView, vid punkt: CGPoint?) async -> Element {
        let js: String
        var argument: [String: Any] = [:]
        if let punkt {
            js = "return window.__adrazeFlikar ? window.__adrazeFlikar.info(x, y) : null"
            argument = ["x": Double(punkt.x), "y": Double(punkt.y)]
        } else {
            js = "return window.__adrazeFlikar ? window.__adrazeFlikar.info() : null"
        }
        guard let svar = try? await v.callAsyncJavaScript(js, arguments: argument, in: nil, contentWorld: varld),
              let d = svar as? [String: Any] else { return Element() }
        func adress(_ k: String) -> URL? { (d[k] as? String).flatMap { URL(string: $0) } }
        return Element(lank: adress("lank"), bild: adress("bild"), alt: d["alt"] as? String)
    }

    // MARK: - Menyn

    static func konfiguration(for flik: Webbflik, motor: Flikmotor, lank: URL?, bild: URL?) -> UIContextMenuConfiguration? {
        guard let meny = meny(for: flik, motor: motor, lank: lank, bild: bild) else { return nil }
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in meny }
    }

    /// Menyn för en länk och/eller en bild. `nil` = ingen meny.
    static func meny(for flik: Webbflik, motor: Flikmotor, lank: URL?, bild: URL?) -> UIMenu? {
        var delar: [UIMenuElement] = []
        if let lank, ["http", "https"].contains(lank.scheme?.lowercased() ?? "") {
            var l: [UIMenuElement] = [
                UIAction(title: flik.privat ? "Öppna i ny privat flik" : "Öppna i ny flik", image: UIImage(systemName: "plus.square.on.square")) {
                    [weak flik, weak motor] _ in
                    guard let flik, let motor else { return }
                    oppna(lank, fran: flik, motor: motor, privat: flik.privat)
                },
            ]
            if !flik.privat {
                l.append(UIAction(title: "Öppna i privat flik", image: UIImage(systemName: "hand.raised")) { [weak flik, weak motor] _ in
                    guard let flik, let motor else { return }
                    oppna(lank, fran: flik, motor: motor, privat: true)
                })
            }
            l.append(UIAction(title: "Kopiera länk", image: UIImage(systemName: "doc.on.doc")) { _ in UIPasteboard.general.url = lank })
            l.append(UIAction(title: "Dela länk …", image: UIImage(systemName: "square.and.arrow.up")) { _ in Flikfonster.dela([lank]) })
            l.append(UIAction(title: "Ladda ned länkad fil", image: UIImage(systemName: "arrow.down.circle")) { [weak flik, weak motor] _ in
                guard let flik, let motor else { return }
                motor.nedladdare.laddaNed(lank, fran: flik)
            })
            delar.append(UIMenu(title: "", options: .displayInline, children: l))
        } else if let lank, lank.scheme != nil {
            delar.append(UIMenu(title: "", options: .displayInline, children: [
                UIAction(title: "Kopiera länk", image: UIImage(systemName: "doc.on.doc")) { _ in UIPasteboard.general.url = lank },
            ]))
        }
        if let bild, ["http", "https", "data", "blob"].contains(bild.scheme?.lowercased() ?? "") {
            var b: [UIMenuElement] = []
            if bild.scheme?.lowercased() != "data", bild.scheme?.lowercased() != "blob" {
                b.append(UIAction(title: "Öppna bild i ny flik", image: UIImage(systemName: "photo")) { [weak flik, weak motor] _ in
                    guard let flik, let motor else { return }
                    oppna(bild, fran: flik, motor: motor, privat: flik.privat)
                })
            }
            b.append(UIAction(title: "Spara i Bilder", image: UIImage(systemName: "square.and.arrow.down")) { [weak flik, weak motor] _ in
                guard let flik, let motor else { return }
                Task { _ = await sparaBild(bild, fran: flik, motor: motor) }
            })
            b.append(UIAction(title: "Kopiera bild", image: UIImage(systemName: "doc.on.clipboard")) { [weak flik, weak motor] _ in
                guard let flik, let motor else { return }
                Task { _ = await kopieraBild(bild, fran: flik, motor: motor) }
            })
            b.append(UIAction(title: "Dela bild …", image: UIImage(systemName: "square.and.arrow.up.on.square")) { [weak flik, weak motor] _ in
                guard let flik, let motor else { return }
                Task { await delaBild(bild, fran: flik, motor: motor) }
            })
            delar.append(UIMenu(title: "", options: .displayInline, children: b))
        }
        guard !delar.isEmpty else { return nil }
        let rubrik = lank.map { Adressforslag.snygg($0.absoluteString) } ?? ""
        return UIMenu(title: String(rubrik.prefix(80)), children: delar)
    }

    /// Öppnar en länk i en ny flik efter fliken (i bakgrunden, som Safari).
    @discardableResult
    static func oppna(_ url: URL, fran flik: Webbflik, motor: Flikmotor, privat: Bool) -> Webbflik {
        motor.skapaFlik(url: url, privat: privat, aktivera: false, oppnadAv: privat == flik.privat ? flik.id : nil,
                        placering: privat == flik.privat ? .efter(flik.id) : .sist)
    }

    // MARK: - Bilden

    /// Hämtar bilden med flikens kakor till en tillfällig fil.
    static func hamtaBild(_ url: URL, fran flik: Webbflik, motor: Flikmotor) async -> (bild: UIImage, fil: URL)? {
        guard let v = flik.vy, let fil = await motor.nedladdare.hamtaFil(url, i: v),
              let data = try? Data(contentsOf: fil), let bild = UIImage(data: data) else { return nil }
        return (bild, fil)
    }

    @discardableResult
    static func kopieraBild(_ url: URL, fran flik: Webbflik, motor: Flikmotor) async -> Bool {
        guard let (bild, fil) = await hamtaBild(url, fran: flik, motor: motor) else { return false }
        if let data = try? Data(contentsOf: fil), let typ = bildtyp(fil) {
            UIPasteboard.general.setItems([[typ: data]])
        } else {
            UIPasteboard.general.image = bild
        }
        try? FileManager.default.removeItem(at: fil)
        return true
    }

    /// Sparar i Bilder (iOS frågar om lov första gången; `NSPhotoLibraryAddUsageDescription`).
    @discardableResult
    static func sparaBild(_ url: URL, fran flik: Webbflik, motor: Flikmotor) async -> Bool {
        guard let (_, fil) = await hamtaBild(url, fran: flik, motor: motor) else { return false }
        defer { try? FileManager.default.removeItem(at: fil) }
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else { return false }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: fil, options: nil)
            }
            return true
        } catch {
            motor.logg.varning("kunde inte spara bilden: \(error.localizedDescription)")
            return false
        }
    }

    static func delaBild(_ url: URL, fran flik: Webbflik, motor: Flikmotor) async {
        guard let (_, fil) = await hamtaBild(url, fran: flik, motor: motor) else { return }
        Flikfonster.dela([fil])
    }

    private static func bildtyp(_ fil: URL) -> String? {
        switch fil.pathExtension.lowercased() {
        case "png": return "public.png"
        case "jpg", "jpeg": return "public.jpeg"
        case "gif": return "com.compuserve.gif"
        case "webp": return "org.webmproject.webp"
        case "heic": return "public.heic"
        default: return nil
        }
    }
}
