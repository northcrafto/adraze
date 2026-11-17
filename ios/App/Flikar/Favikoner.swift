import CryptoKit
import Foundation
import UIKit
import WebKit

/// Sajternas ikoner. Hämtas en gång (högst 512 kB), skalas ned till högst 64 punkter och sparas som PNG i
/// `favikoner/` (inte för privata flikar), så att återställda flikar och historiken har sina ikoner direkt.
///
/// Ikoner på sidans eget ursprung hämtas inifrån sidan (`fetch` i Flikars egen skriptvärld, med sidans cache), så
/// att även http-sajter fungerar: appens App Transport Security gäller URLSession men inte webbinnehållet.
/// Ikoner på andra ursprung (CDN) hämtas med en egen URLSession utan kakor.
@MainActor
final class Favikoner {
    private let mapp: URL
    private var minne: [String: UIImage] = [:]
    private var misslyckade: Set<String> = []
    private var pagaende: [String: Task<UIImage?, Never>] = [:]
    private let session: URLSession = {
        let k = URLSessionConfiguration.ephemeral
        k.timeoutIntervalForRequest = 8
        k.timeoutIntervalForResource = 10
        k.httpCookieAcceptPolicy = .never
        k.httpShouldSetCookies = false
        k.urlCache = nil
        return URLSession(configuration: k)
    }()

    nonisolated static let maxBytes = 512 * 1024
    nonisolated static let maxPunkter: CGFloat = 64

    init(mapp: URL) {
        self.mapp = mapp
    }

    private func fil(_ adress: String) -> URL {
        let h = SHA256.hash(data: Data(adress.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
        return mapp.appendingPathComponent(h + ".png")
    }

    /// Från minnet eller disken, utan nätet.
    func cachad(_ adress: String) -> UIImage? {
        if let b = minne[adress] { return b }
        guard let d = try? Data(contentsOf: fil(adress)), let b = UIImage(data: d, scale: 3) else { return nil }
        minne[adress] = b
        return b
    }

    /// Hämtar ikonen (eller tar den ur cachen). `sida` = webbvyn som visar sidan (för ikoner på samma ursprung).
    /// `nil` om den inte gick att hämta eller inte är en bild (SVG stöds inte).
    func hamta(_ adress: String, privat: Bool, sida: WKWebView?) async -> UIImage? {
        if let b = cachad(adress) { return b }
        if misslyckade.contains(adress) { return nil }
        if let t = pagaende[adress] { return await t.value }
        let session = session
        let t = Task<UIImage?, Never> { @MainActor in
            var data: Data?
            if adress.lowercased().hasPrefix("data:image/") {
                data = Self.dataAdress(adress)
            } else if let u = URL(string: adress), let s = u.scheme?.lowercased(), s == "http" || s == "https" {
                if let v = sida, Self.sammaUrsprung(u, v.url) { data = await Self.hamtaISidan(u, v) }
                if data == nil { data = await Self.hamtaMedSession(u, session) }
            }
            guard let data else { return nil }
            return await Self.skala(data)
        }
        pagaende[adress] = t
        let bild = await t.value
        pagaende[adress] = nil
        guard let bild else {
            misslyckade.insert(adress)
            return nil
        }
        minne[adress] = bild
        if !privat, let png = bild.pngData() {
            try? FileManager.default.createDirectory(at: mapp, withIntermediateDirectories: true)
            try? png.write(to: fil(adress), options: .atomic)
        }
        return bild
    }

    static func sammaUrsprung(_ a: URL, _ b: URL?) -> Bool {
        guard let b else { return false }
        return a.scheme?.lowercased() == b.scheme?.lowercased() && a.host()?.lowercased() == b.host()?.lowercased() && a.port == b.port
    }

    private static let fetchJS = """
    const r = await fetch(u, { credentials: 'same-origin', cache: 'force-cache' });
    if (!r.ok) return null;
    const b = await r.arrayBuffer();
    if (b.byteLength > max) return null;
    const a = new Uint8Array(b); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
    """

    private static func hamtaISidan(_ u: URL, _ v: WKWebView) async -> Data? {
        let svar = try? await v.callAsyncJavaScript(fetchJS, arguments: ["u": u.absoluteString, "max": maxBytes], in: nil,
                                                     contentWorld: Flikmeny.varld)
        return (svar as? String).flatMap { Data(base64Encoded: $0) }
    }

    private nonisolated static func hamtaMedSession(_ u: URL, _ session: URLSession) async -> Data? {
        var r = URLRequest(url: u)
        r.setValue("image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5", forHTTPHeaderField: "Accept")
        guard let (d, svar) = try? await session.data(for: r), let http = svar as? HTTPURLResponse,
              (200..<300).contains(http.statusCode), d.count <= maxBytes else { return nil }
        return d
    }

    /// Avkodar och skalar ned (i bakgrunden). ICO, PNG, JPEG, GIF och WebP via ImageIO.
    nonisolated static func skala(_ data: Data) async -> UIImage? {
        await Task.detached(priority: .utility) {
            guard let b = UIImage(data: data), b.size.width >= 1, b.size.height >= 1 else { return nil }
            let sida = max(b.size.width, b.size.height)
            let mal = min(maxPunkter, sida)
            let storlek = CGSize(width: b.size.width * mal / sida, height: b.size.height * mal / sida)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 3
            format.opaque = false
            return UIGraphicsImageRenderer(size: storlek, format: format).image { _ in b.draw(in: CGRect(origin: .zero, size: storlek)) }
        }.value
    }

    nonisolated static func dataAdress(_ s: String) -> Data? {
        guard let komma = s.firstIndex(of: ","), s.count <= 700_000 else { return nil }
        let huvud = s[..<komma].lowercased()
        let kropp = String(s[s.index(after: komma)...])
        if huvud.hasSuffix(";base64") { return Data(base64Encoded: kropp.removingPercentEncoding ?? kropp) }
        return kropp.removingPercentEncoding.map { Data($0.utf8) }
    }
}
