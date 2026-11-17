import Foundation
import WebKit

/// Serverar AdRaze-UI:t från appen under `adraze-app://localhost/` (del 3, 3.4). Bara AdRaze-sidornas egna
/// webbvyer har schemat (`BryggTransport.konfiguration()`); vanliga flikar har det aldrig.
///
///     adraze-app://localhost/anpassa.html     -> Webb/ui/shell.html   (yta "anpassa")
///     adraze-app://localhost/startsida.html   -> Webb/ui/shell.html   (yta "startsida")
///     adraze-app://localhost/falk.html        -> Webb/ui/krypto.html  (yta "falk")
///     adraze-app://localhost/chatt.html       -> Webb/ui/chatt.html   (yta "chatt")
///     adraze-app://localhost/ios/<fil>        -> Webb/ios/<fil>       (preload-ios.js, ios.css, ios.js)
///     adraze-app://localhost/<fil>            -> Webb/ui/<fil>        (datorns css, js, bilder, typsnitt, locales)
///
/// Allt annat ger 404: sökvägar utanför Webb/, `..`, dolda filer, mappar och `_preload/` (datorns preload körs
/// som WKUserScript och ska aldrig gå att hämta som fil). Bara GET och HEAD.
///
/// Ägare: Brygga och webb-UI.
@MainActor
final class AdrazeSchema: NSObject, WKURLSchemeHandler {
    static let schema = "adraze-app"
    static let varden = "localhost"
    static let ursprung = "adraze-app://localhost"

    /// Sidor som inte ligger som egna filer: yta -> fil i `Webb/ui/`.
    static let sidor: [String: String] = [
        "anpassa": "shell.html",
        "startsida": "shell.html",
        "falk": "krypto.html",
    ]

    /// Adressen till en yta, med valfri kategori/fragment (`anpassa` + `utseende` -> `…/anpassa.html#utseende`).
    static func adress(_ yta: String, fragment: String? = nil) -> URL {
        var k = URLComponents()
        k.scheme = schema
        k.host = varden
        k.path = "/\(yta).html"
        if let fragment, !fragment.isEmpty { k.fragment = fragment }
        return k.url!
    }

    /// Ytan för en adress: filnamnet utan `.html` (`…/startsida.html` -> `startsida`). Tom för allt annat.
    static func yta(for url: URL?) -> String {
        guard let url, url.scheme == schema, url.host == varden else { return "" }
        let namn = url.lastPathComponent
        guard namn.hasSuffix(".html"), url.pathComponents.count == 2 else { return "" }
        return String(namn.dropLast(5))
    }

    let ui: URL
    let ios: URL
    private let uiRot: String
    private let iosRot: String
    private let logg = Logg("Brygga")
    /// Antal svar per statuskod (självtestet).
    private(set) var statistik: [Int: Int] = [:]

    init(webb: URL = Bunt.mapp("Webb")) {
        ui = webb.appendingPathComponent("ui", isDirectory: true)
        ios = webb.appendingPathComponent("ios", isDirectory: true)
        uiRot = ui.standardizedFileURL.resolvingSymlinksInPath().path + "/"
        iosRot = ios.standardizedFileURL.resolvingSymlinksInPath().path + "/"
        super.init()
    }

    /// Filen för en sökväg i adressen, eller `nil` (404). Kontrollerar att filen ligger under Webb/ui eller Webb/ios.
    func fil(for sokvag: String) -> URL? {
        let delar = sokvag.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !delar.isEmpty, delar.count <= 12 else { return nil }
        guard !delar.contains(where: { $0.hasPrefix(".") || $0.contains("\\") || $0.contains("\0") }) else { return nil }
        if delar.count == 1, delar[0].hasSuffix(".html"), let sida = Self.sidor[String(delar[0].dropLast(5))] {
            return finns(ui.appendingPathComponent(sida), rot: uiRot)
        }
        if delar[0] == "_preload" { return nil }
        if delar[0] == "ios" {
            guard delar.count > 1 else { return nil }
            return finns(delar.dropFirst().reduce(ios) { $0.appendingPathComponent($1) }, rot: iosRot)
        }
        return finns(delar.reduce(ui) { $0.appendingPathComponent($1) }, rot: uiRot)
    }

    private func finns(_ u: URL, rot: String) -> URL? {
        let fil = u.standardizedFileURL.resolvingSymlinksInPath()
        guard fil.path.hasPrefix(rot) else { return nil }
        var mapp: ObjCBool = false
        guard FileManager.default.fileExists(atPath: fil.path, isDirectory: &mapp), !mapp.boolValue else { return nil }
        return fil
    }

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start uppgift: WKURLSchemeTask) {
        let fraga = uppgift.request
        guard let url = fraga.url, url.scheme == Self.schema, url.host == Self.varden else {
            svara(uppgift, fraga.url ?? URL(string: "\(Self.ursprung)/")!, 400, text: "fel adress")
            return
        }
        let metod = (fraga.httpMethod ?? "GET").uppercased()
        guard metod == "GET" || metod == "HEAD" else {
            svara(uppgift, url, 405, text: "bara GET")
            return
        }
        guard let fil = fil(for: url.path), let data = try? Data(contentsOf: fil, options: .mappedIfSafe) else {
            logg.felsok("404 \(url.path)")
            svara(uppgift, url, 404, text: "finns inte: \(url.path)")
            return
        }
        let typ = Self.mime(fil.pathExtension)
        var huvuden: [String: String] = [
            "Content-Type": typ,
            "Content-Length": "\(data.count)",
            "Cache-Control": Self.cache(fil.pathExtension),
            "X-Content-Type-Options": "nosniff",
        ]
        if typ.hasPrefix("text/html") { huvuden["Referrer-Policy"] = "no-referrer" }
        guard let svar = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: huvuden) else {
            uppgift.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        statistik[200, default: 0] += 1
        uppgift.didReceive(svar)
        if metod == "GET" { uppgift.didReceive(data) }
        uppgift.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Allt svaras synkront i start; inget pågår som kan avbrytas.
    }

    private func svara(_ uppgift: WKURLSchemeTask, _ url: URL, _ kod: Int, text: String) {
        statistik[kod, default: 0] += 1
        let data = Data(text.utf8)
        let svar = HTTPURLResponse(url: url, statusCode: kod, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "text/plain; charset=utf-8", "Content-Length": "\(data.count)", "Cache-Control": "no-store",
        ])!
        uppgift.didReceive(svar)
        uppgift.didReceive(data)
        uppgift.didFinish()
    }

    // MARK: - Typer och cache

    static func mime(_ andelse: String) -> String {
        switch andelse.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "txt", "md": return "text/plain; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "ico": return "image/x-icon"
        case "avif": return "image/avif"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "ogg", "oga": return "audio/ogg"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "m4a": return "audio/mp4"
        case "mp4": return "video/mp4"
        case "webm": return "video/webm"
        case "wasm": return "application/wasm"
        default: return "application/octet-stream"
        }
    }

    /// Text (html, js, css, json) kontrolleras varje gång, så att en ny appversion aldrig blandas med en gammal.
    /// Bilder, ljud och typsnitt ändras sällan och får ligga kvar i WebKits minne en dag.
    static func cache(_ andelse: String) -> String {
        switch andelse.lowercased() {
        case "png", "jpg", "jpeg", "webp", "gif", "ico", "avif", "svg", "woff2", "woff", "ttf", "otf", "ogg", "oga", "mp3", "wav", "m4a":
            return "max-age=86400"
        default:
            return "no-cache"
        }
    }
}
