import Foundation
import Network
import UIKit

/// En liten HTTP-server på 127.0.0.1 för Flikars självtest (Network.framework, bara GET, en förfrågan per
/// anslutning). Sidorna är egna, så testet inte beror på någon annans sajt eller på nätet.
///
///     /sida/1 … /sida/5     provsidor med egen färg, länk vidare och ikon (sida 2 har bilder)
///     /kaka/satt?v=X        sätter kakan provkaka=X
///     /kaka/visa            visar kakorna som kom med förfrågan
///     /fil/prov.txt         en nedladdning (Content-Disposition: attachment)
///     /inloggning           HTTP Basic (prov / hemligt)
///     /popup                länk med target=_blank
///     /sok                  text med tre "gorilla"
///     /langsam              svarar efter 4 s
///     /ikon.png, /bild.png  bilder
final class Flikprovserver: @unchecked Sendable {
    struct Forfragan: Sendable {
        let vag: String
        let fraga: String?
        let kaka: String?
        let agent: String?
        let inloggning: String?
    }

    private let ko = DispatchQueue(label: "app.adraze.flikar.provserver")
    private let las = NSLock()
    private var lyssnare: NWListener?
    private var _logg: [Forfragan] = []
    private var _port: UInt16 = 0
    private let ikon: Data
    private let bild: Data

    static let anvandare = "prov"
    static let losenord = "hemligt"
    static let filinnehall = "AdRaze nedladdningsprov 12345"
    static let farger = ["#ffe8df", "#e3eefc", "#e5f5e8", "#f3e8fb", "#fff6d6"]

    @MainActor
    init() {
        ikon = Self.png(CGSize(width: 32, height: 32)) { r, c in
            UIColor(red: 1, green: 0.294, blue: 0.122, alpha: 1).setFill()
            UIBezierPath(roundedRect: r, cornerRadius: 7).fill()
            UIColor.white.setFill()
            c.fill(CGRect(x: 9, y: 9, width: 14, height: 14))
        }
        bild = Self.png(CGSize(width: 160, height: 100)) { r, c in
            UIColor(red: 0.18, green: 0.18, blue: 0.17, alpha: 1).setFill()
            c.fill(r)
            UIColor(red: 1, green: 0.294, blue: 0.122, alpha: 1).setFill()
            for i in 0..<6 { c.fill(CGRect(x: CGFloat(i) * 30, y: 0, width: 14, height: 100)) }
        }
    }

    private func medLas<T>(_ f: () -> T) -> T {
        las.lock()
        defer { las.unlock() }
        return f()
    }

    var port: UInt16 { medLas { _port } }
    var bas: String { "http://127.0.0.1:\(port)" }
    func url(_ vag: String) -> URL { URL(string: bas + vag)! }

    /// Alla förfrågningar hittills, äldst först.
    var logg: [Forfragan] { medLas { _logg } }
    func senaste(_ vag: String) -> Forfragan? { logg.last { $0.vag == vag } }
    func antal(_ vag: String) -> Int { logg.filter { $0.vag == vag }.count }

    func starta() async throws {
        let p = NWParameters.tcp
        p.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let l = try NWListener(using: p)
        lyssnare = l
        l.newConnectionHandler = { [weak self] c in self?.ta(c) }
        let svar = Engangsvarde<Result<UInt16, Error>>()
        let port: UInt16 = try await withCheckedThrowingContinuation { (c: CheckedContinuation<UInt16, Error>) in
            svar.vid { r in c.resume(with: r) }
            l.stateUpdateHandler = { s in
                switch s {
                case .ready: svar.satt(.success(l.port?.rawValue ?? 0))
                case .failed(let e): svar.satt(.failure(e))
                case .cancelled: svar.satt(.failure(CancellationError()))
                default: break
                }
            }
            l.start(queue: ko)
        }
        medLas { _port = port }
    }

    func stoppa() {
        lyssnare?.cancel()
        lyssnare = nil
    }

    /// En port på 127.0.0.1 som ingen lyssnar på (för felsidan "kunde inte ansluta").
    static func ledigPort() async throws -> UInt16 {
        let p = NWParameters.tcp
        p.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let l = try NWListener(using: p)
        l.newConnectionHandler = { $0.cancel() }
        let svar = Engangsvarde<Result<UInt16, Error>>()
        let port: UInt16 = try await withCheckedThrowingContinuation { (c: CheckedContinuation<UInt16, Error>) in
            svar.vid { r in c.resume(with: r) }
            l.stateUpdateHandler = { s in
                switch s {
                case .ready: svar.satt(.success(l.port?.rawValue ?? 0))
                case .failed(let e): svar.satt(.failure(e))
                default: break
                }
            }
            l.start(queue: DispatchQueue(label: "app.adraze.flikar.ledigport"))
        }
        l.cancel()
        return port
    }

    // MARK: - Anslutningarna

    private func ta(_ c: NWConnection) {
        c.start(queue: ko)
        lasIn(c, Data())
    }

    private func lasIn(_ c: NWConnection, _ buffert: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, klar, fel in
            guard let self else {
                c.cancel()
                return
            }
            var b = buffert
            if let data { b.append(data) }
            if let slut = b.range(of: Data("\r\n\r\n".utf8)) {
                self.svara(c, String(decoding: b[..<slut.lowerBound], as: UTF8.self))
            } else if fel != nil || klar || b.count > 65_536 {
                c.cancel()
            } else {
                self.lasIn(c, b)
            }
        }
    }

    private func svara(_ c: NWConnection, _ huvud: String) {
        let rader = huvud.components(separatedBy: "\r\n")
        let delar = (rader.first ?? "").split(separator: " ")
        let mal = delar.count > 1 ? String(delar[1]) : "/"
        var rubriker: [String: String] = [:]
        for r in rader.dropFirst() {
            guard let i = r.firstIndex(of: ":") else { continue }
            rubriker[r[..<i].lowercased()] = r[r.index(after: i)...].trimmingCharacters(in: .whitespaces)
        }
        let komp = URLComponents(string: mal)
        let vag = komp?.path ?? mal
        let fraga = komp?.query
        medLas {
            _logg.append(Forfragan(vag: vag, fraga: fraga, kaka: rubriker["cookie"], agent: rubriker["user-agent"],
                                   inloggning: rubriker["authorization"]))
        }
        let q = Dictionary((komp?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { _, b in b })

        if vag.hasPrefix("/sida/"), let n = Int(vag.dropFirst(6)), (1...5).contains(n) {
            return skicka(c, html: Self.sida(n))
        }
        switch vag {
        case "/ikon.png":
            skicka(c, typ: "image/png", kropp: ikon, extra: ["Cache-Control": "max-age=300"])
        case "/bild.png":
            skicka(c, typ: "image/png", kropp: bild, extra: ["Cache-Control": "max-age=300"])
        case "/kaka/satt":
            let v = (q["v"] ?? "x").filter { $0.isLetter || $0.isNumber }
            skicka(c, html: Self.enkel("Kakan satt", "<p id=\"satt\">provkaka=\(v)</p>"),
                   extra: ["Set-Cookie": "provkaka=\(v); Path=/; Max-Age=3600"])
        case "/kaka/visa":
            let kakor = (rubriker["cookie"] ?? "").replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            skicka(c, html: Self.enkel("Kakorna", "<p>Kakor som kom med förfrågan:</p><pre id=\"kakor\">\(kakor)</pre>"))
        case "/fil/prov.txt":
            skicka(c, typ: "text/plain; charset=utf-8", kropp: Data(Self.filinnehall.utf8),
                   extra: ["Content-Disposition": "attachment; filename=\"prov-flikar.txt\""])
        case "/inloggning":
            let ratt = "Basic " + Data("\(Self.anvandare):\(Self.losenord)".utf8).base64EncodedString()
            if rubriker["authorization"] == ratt {
                skicka(c, html: Self.enkel("Inloggad", "<p id=\"inne\">Du är inloggad som prov.</p>"))
            } else {
                skicka(c, status: "401 Unauthorized", html: Self.enkel("Inte inloggad", "<p>Fel användarnamn eller lösenord.</p>"),
                       extra: ["WWW-Authenticate": "Basic realm=\"Flikprov\""])
            }
        case "/popup":
            skicka(c, html: Self.enkel("Popup", """
            <p><a id="ny" href="/sida/4" target="_blank">Öppna provsida 4 i en ny flik</a></p>
            <p><button id="oppna" onclick="window.open('/sida/5')">window.open</button></p>
            """))
        case "/sok":
            skicka(c, html: Self.enkel("Sök på sidan", """
            <p>En gorilla satt i trädet.</p><p>Den andra Gorilla åt en banan.</p>
            <p>Ingen visste vad den tredje GORILLA tänkte.</p>
            """))
        case "/dialog":
            skicka(c, html: Self.enkel("Dialoger", "<p>Den här sidan öppnar rutor när testet ber om det.</p>"))
        case "/media":
            skicka(c, html: Self.enkel("Mikrofon", "<p>Den här sidan ber om mikrofonen när testet ber om det.</p>"))
        case "/langsam":
            ko.asyncAfter(deadline: .now() + 4) { [weak self] in
                self?.skicka(c, html: Self.enkel("Långsam", "<p>Äntligen.</p>"))
            }
        default:
            skicka(c, status: "404 Not Found", html: Self.enkel("Finns inte", "<p>Sidan finns inte.</p>"))
        }
    }

    private func skicka(_ c: NWConnection, status: String = "200 OK", html: String, extra: [String: String] = [:]) {
        skicka(c, status: status, typ: "text/html; charset=utf-8", kropp: Data(html.utf8), extra: extra)
    }

    private func skicka(_ c: NWConnection, status: String = "200 OK", typ: String, kropp: Data, extra: [String: String] = [:]) {
        var h = "HTTP/1.1 \(status)\r\nContent-Type: \(typ)\r\nContent-Length: \(kropp.count)\r\nConnection: close\r\n"
        if extra["Cache-Control"] == nil { h += "Cache-Control: no-store\r\n" }
        for (k, v) in extra { h += "\(k): \(v)\r\n" }
        h += "\r\n"
        var d = Data(h.utf8)
        d.append(kropp)
        c.send(content: d, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in c.cancel() })
    }

    // MARK: - Sidorna

    static func sida(_ n: Int) -> String {
        let farg = farger[(n - 1) % farger.count]
        let nasta = n % 5 + 1
        var bilder = ""
        if n == 2 {
            bilder = """
            <p><img id="bild" src="/bild.png" alt="Provbild" width="160" height="100"></p>
            <p><a id="bildlank" href="/sida/3"><img id="bild2" src="/bild.png" alt="Länkad provbild" width="160" height="100"></a></p>
            """
        }
        return """
        <!doctype html><html lang="sv"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Provsida \(n)</title><link rel="icon" href="/ikon.png">
        <style>
        body{margin:0;font:17px/1.5 -apple-system,system-ui,sans-serif;background:\(farg);color:#1c1b19}
        main{padding:24px 22px 40px}
        .tal{font:800 132px/0.9 -apple-system,system-ui,sans-serif;letter-spacing:-.04em;color:rgba(28,27,25,.14);margin:8px 0 6px}
        h1{font-size:34px;line-height:1.1;margin:0 0 10px;letter-spacing:-.01em}
        p{margin:0 0 14px;max-width:34em}
        a{color:#c2360e;font-weight:600}
        </style></head>
        <body><main>
        <div class="tal">\(n)</div>
        <h1>Provsida \(n)</h1>
        <p>Lokal testsida för Flikar. Varje provsida har en egen färg, så att det syns vilken flik som visas.</p>
        <p><a id="nasta" href="/sida/\(nasta)">Till provsida \(nasta)</a></p>
        \(bilder)
        </main></body></html>
        """
    }

    static func enkel(_ titel: String, _ kropp: String) -> String {
        """
        <!doctype html><html lang="sv"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>\(titel)</title><link rel="icon" href="/ikon.png">
        <style>body{margin:0;font:17px/1.5 -apple-system,system-ui,sans-serif;background:#f6f5f1;color:#1c1b19}
        main{padding:28px 22px}h1{font-size:30px;margin:0 0 12px}pre{white-space:pre-wrap;background:#fff;padding:12px;border-radius:10px}
        a{color:#c2360e;font-weight:600}</style></head>
        <body><main><h1>\(titel)</h1>\(kropp)</main></body></html>
        """
    }

    @MainActor
    static func png(_ storlek: CGSize, _ rita: (CGRect, CGContext) -> Void) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: storlek, format: format).pngData { k in
            rita(CGRect(origin: .zero, size: storlek), k.cgContext)
        }
    }
}
