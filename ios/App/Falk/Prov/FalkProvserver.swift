import Foundation
import Network
import Observation

/// Testserver för Falks självtest på 127.0.0.1 (bara loopback, inget nät): en låtsad AdRaze-server med
/// `POST /falk/chat` som strömmar svaret (`text/event-stream`, samma format som `FalkKlient` läser), `GET /falk/kvot`,
/// `GET /me` och testsidan `GET /sida`. Kräver token `falkprov`. Ingen riktig AI-tjänst anropas.
///
/// Ägare: Falk.
final class FalkProvserver: @unchecked Sendable {
    static let token = "falkprov"
    static let markor = "FALKPROV-7731"
    static let sidtitel = "Ljusa paket – Falkprov"

    private var lyssnare: NWListener?
    private let ko = DispatchQueue(label: "app.adraze.falk.provserver")
    private let las = NSLock()
    private var _fragor: [JSONVarde] = []
    /// Ord per sekund i svaren (lägre = långsammare strömning).
    var takt: Double = 9

    /// Kropparna i alla `POST /falk/chat`, i ordning.
    var fragor: [JSONVarde] {
        las.lock()
        defer { las.unlock() }
        return _fragor
    }

    func starta() async throws -> UInt16 {
        let p = NWParameters.tcp
        p.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        p.allowLocalEndpointReuse = true
        let l = try NWListener(using: p)
        l.newConnectionHandler = { [weak self] c in self?.ta(c) }
        lyssnare = l
        return try await withCheckedThrowingContinuation { (fort: CheckedContinuation<UInt16, Error>) in
            let klar = FalkEngangFlagga()
            l.stateUpdateHandler = { s in
                switch s {
                case .ready: if klar.forsta() { fort.resume(returning: l.port?.rawValue ?? 0) }
                case .failed(let e): if klar.forsta() { fort.resume(throwing: e) }
                case .cancelled: if klar.forsta() { fort.resume(throwing: CancellationError()) }
                default: break
                }
            }
            l.start(queue: ko)
        }
    }

    func stoppa() {
        lyssnare?.cancel()
        lyssnare = nil
    }

    // MARK: - Anslutningarna

    private func ta(_ c: NWConnection) {
        c.start(queue: ko)
        lasBegaran(c, Data())
    }

    /// Läser tills huvudet och hela kroppen (Content-Length) har kommit.
    private func lasBegaran(_ c: NWConnection, _ buf: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 262_144) { [weak self] data, _, klar, fel in
            guard let self else { c.cancel(); return }
            var b = buf
            if let data { b.append(data) }
            if let slut = b.range(of: Data("\r\n\r\n".utf8)) {
                let huvud = String(decoding: b[..<slut.lowerBound], as: UTF8.self)
                let langd = huvud.components(separatedBy: "\r\n").compactMap { rad -> Int? in
                    let d = rad.split(separator: ":", maxSplits: 1)
                    guard d.count == 2, d[0].trimmingCharacters(in: .whitespaces).lowercased() == "content-length" else { return nil }
                    return Int(d[1].trimmingCharacters(in: .whitespaces))
                }.first ?? 0
                let kropp = b[slut.upperBound...]
                if kropp.count >= langd {
                    self.svara(c, huvud: huvud, kropp: Data(kropp.prefix(langd)))
                    return
                }
            }
            if klar || fel != nil { c.cancel(); return }
            self.lasBegaran(c, b)
        }
    }

    private func svara(_ c: NWConnection, huvud: String, kropp: Data) {
        let rader = huvud.components(separatedBy: "\r\n")
        let forsta = (rader.first ?? "").split(separator: " ")
        let metod = forsta.first.map(String.init) ?? "GET"
        var vag = forsta.count > 1 ? String(forsta[1]) : "/"
        if let q = vag.firstIndex(of: "?") { vag = String(vag[..<q]) }
        let behorig = rader.contains { $0.lowercased().hasPrefix("authorization:") && $0.hasSuffix("Bearer \(Self.token)") }

        switch (metod, vag) {
        case ("GET", "/sida"):
            skicka(c, 200, "text/html; charset=utf-8", Data(Self.sida.utf8))
        case ("GET", "/me"):
            guard behorig else { return skicka(c, 401, "application/json", Data(#"{"ok":false,"error":"auth"}"#.utf8)) }
            skicka(c, 200, "application/json", Data(#"{"ok":true,"me":{"namn":"Alex"}}"#.utf8))
        case ("GET", "/falk/kvot"):
            guard behorig else { return skicka(c, 401, "application/json", Data(#"{"ok":false,"error":"auth"}"#.utf8)) }
            skicka(c, 200, "application/json", (["ok": true, "kvot": Self.kvot(anvant: 6200)] as JSONVarde).jsonData())
        case ("POST", "/falk/chat"):
            guard behorig else { return skicka(c, 401, "application/json", Data(#"{"ok":false,"error":"auth"}"#.utf8)) }
            let fraga = (try? JSONVarde(json: kropp)) ?? .null
            las.lock()
            _fragor.append(fraga)
            las.unlock()
            stromma(c, svar: Self.svar(pa: fraga))
        default:
            skicka(c, 404, "text/plain", Data("hittades inte".utf8))
        }
    }

    private func skicka(_ c: NWConnection, _ status: Int, _ typ: String, _ kropp: Data) {
        let text = status == 200 ? "OK" : status == 401 ? "Unauthorized" : "Not Found"
        var ut = Data(("HTTP/1.1 \(status) \(text)\r\nContent-Type: \(typ)\r\nContent-Length: \(kropp.count)\r\n"
            + "Cache-Control: no-store\r\nConnection: close\r\n\r\n").utf8)
        ut.append(kropp)
        c.send(content: ut, completion: .contentProcessed { _ in c.cancel() })
    }

    /// Svaret som händelser (`delta` ord för ord, sist `klar`), med paus mellan bitarna. Anslutningen stängs efteråt.
    private func stromma(_ c: NWConnection, svar: String) {
        let huvud = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-store\r\n"
            + "Connection: close\r\n\r\n"
        c.send(content: Data((huvud + ": " + String(repeating: "-", count: 1024) + "\n\n").utf8), completion: .contentProcessed { _ in })
        // Två eller tre ord per bit, som en riktig modell
        var bitar: [String] = []
        var nu = ""
        var ord = 0
        for del in svar.split(separator: " ", omittingEmptySubsequences: false) {
            nu += (nu.isEmpty && bitar.isEmpty ? "" : " ") + del
            ord += 1
            if ord % 2 == 0 { bitar.append(nu); nu = "" }
        }
        if !nu.isEmpty { bitar.append(nu) }
        let paus = 2.0 / max(1, takt)
        for (i, b) in bitar.enumerated() {
            let rad = "event: delta\ndata: " + (["text": .text(b)] as JSONVarde).jsonText + "\n\n"
            ko.asyncAfter(deadline: .now() + 0.25 + Double(i) * paus) {
                c.send(content: Data(rad.utf8), completion: .contentProcessed { _ in })
            }
        }
        let slut: JSONVarde = ["ok": true, "reply": .text(svar), "sources": [], "modell": "qwen", "kvot": Self.kvot(anvant: 7400)]
        ko.asyncAfter(deadline: .now() + 0.35 + Double(bitar.count) * paus) {
            c.send(content: Data(("event: klar\ndata: " + slut.jsonText + "\n\n").utf8), contentContext: .finalMessage, isComplete: true,
                   completion: .contentProcessed { _ in c.cancel() })
        }
    }

    // MARK: - Innehållet

    static func kvot(anvant: Double) -> JSONVarde {
        ["plan": "gratis", "modeller": ["qwen"], "anvant": .tal(anvant), "tak": 50000, "kvar": .tal(50000 - anvant), "sokKvar": 2,
         "fyllsPa": .tal((Date().timeIntervalSince1970 + 9 * 86400) * 1000)]
    }

    /// Frågar användaren om sidan (sista meddelandet nämner sidan) svarar servern utifrån sidans text, annars allmänt.
    static func svar(pa fraga: JSONVarde) -> String {
        let sista = fraga["messages"].lista?.last?["content"].text ?? ""
        if sista.lowercased().contains("sidan") {
            let harSidan = fraga.jsonText.contains(markor)
            return harSidan
                ? "Sidan heter **\(sidtitel)**. Den påstår att ett paket väntar på dig och ber dig betala en tullavgift på 49 kr via en knapp på sidan.\n\n"
                    + "## Det här talar emot den\n\n- Riktiga tullavgifter betalas inte via en okänd sajt.\n- Sidan skapar stress: \"betala i dag\".\n"
                    + "- Den ber om kortuppgifter direkt.\n\nBetala inte. Referenskoden på sidan är \(markor), men den bevisar ingenting."
                : "Jag ser ingen sida just nu. Öppna sidan i en flik och fråga igen."
        }
        return "Bra fråga! Här är tre tecken på att ett sms är en bluff:\n\n"
            + "1. **Det brådskar.** \"Ditt paket stoppas om du inte betalar i dag.\"\n"
            + "2. **Länken ser konstig ut.** Adressen liknar en känd sajt men stavas lite fel.\n"
            + "3. **De vill ha en kod eller ditt kort.** Riktiga företag ber aldrig om BankID-koder i ett sms.\n\n"
            + "Är du osäker: klicka inte. Gå direkt till företagets egen app eller sajt i stället."
    }

    static let sida = """
    <!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>\(sidtitel)</title><style>
    body{margin:0;font:17px/1.5 -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#fff}
    header{padding:22px 22px 8px;background:#ffd84d}h1{margin:0;font-size:30px}main{padding:18px 22px}
    .kort{border:1px solid #e3e3e3;border-radius:14px;padding:16px;margin:14px 0}
    button{font:600 17px system-ui;background:#0a7d32;color:#fff;border:0;border-radius:10px;padding:12px 18px}
    input{font-size:17px;padding:10px;border:1px solid #ccc;border-radius:8px;width:100%;box-sizing:border-box;margin:6px 0 12px}
    </style></head><body><header><h1>Ljusa paket</h1><p>Leveranser i hela Sverige</p></header><main>
    <p><b>Ditt paket väntar.</b> Betala tullavgiften på 49 kr i dag, annars skickas paketet tillbaka.</p>
    <div class="kort"><p>Referenskod: <b>\(markor)</b></p><form><label for="kort">Kortnummer</label>
    <input id="kort" name="kort" autocomplete="cc-number"><button type="submit">Betala 49 kr</button></form></div>
    </main></body></html>
    """
}

/// Bara självtestet: ATS stoppar okrypterad HTTP i URLSession, så anropen till testservern (`http://127.0.0.1`) går
/// via Network.framework, och svaret förs vidare bit för bit som det kommer (så att strömningen provas på riktigt).
/// Registreras bara i testets egen session (`FalkKlient.gorSession(protokoll:)`).
final class FalkLokalHTTP: URLProtocol, @unchecked Sendable {
    private var anslutning: NWConnection?
    private var huvudKlart = false
    private var buf = Data()
    private let ko = DispatchQueue(label: "app.adraze.falk.lokalhttp")

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.scheme == "http" && request.url?.host == "127.0.0.1"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let host = url.host, let port = NWEndpoint.Port(rawValue: UInt16(url.port ?? 80)) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        var sokvag = url.path.isEmpty ? "/" : url.path
        if let q = url.query { sokvag += "?" + q }
        var kropp = request.httpBody ?? Data()
        if kropp.isEmpty, let strom = request.httpBodyStream {
            strom.open()
            var b = [UInt8](repeating: 0, count: 65_536)
            while strom.hasBytesAvailable {
                let n = strom.read(&b, maxLength: b.count)
                if n <= 0 { break }
                kropp.append(b, count: n)
            }
            strom.close()
        }
        var huvud = "\(request.httpMethod ?? "GET") \(sokvag) HTTP/1.1\r\nHost: \(host):\(port.rawValue)\r\n"
        for (k, v) in request.allHTTPHeaderFields ?? [:] where k.lowercased() != "content-length" { huvud += "\(k): \(v)\r\n" }
        huvud += "Content-Length: \(kropp.count)\r\nConnection: close\r\n\r\n"
        let c = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        anslutning = c
        c.start(queue: ko)
        c.send(content: Data(huvud.utf8) + kropp, completion: .contentProcessed { _ in })
        lasSvar(c)
    }

    private func lasSvar(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, klar, fel in
            guard let self else { c.cancel(); return }
            if let data, !data.isEmpty { self.ta(data) }
            if let fel {
                self.client?.urlProtocol(self, didFailWithError: fel)
                c.cancel()
                return
            }
            if klar {
                if self.huvudKlart { self.client?.urlProtocolDidFinishLoading(self) } else {
                    self.client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                }
                c.cancel()
                return
            }
            self.lasSvar(c)
        }
    }

    private func ta(_ d: Data) {
        if huvudKlart {
            client?.urlProtocol(self, didLoad: d)
            return
        }
        buf.append(d)
        guard let r = buf.range(of: Data("\r\n\r\n".utf8)), let url = request.url else { return }
        let rader = String(decoding: buf[..<r.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
        let status = Int((rader.first ?? "").split(separator: " ").dropFirst().first ?? "") ?? 0
        var falt: [String: String] = [:]
        for rad in rader.dropFirst() {
            if let i = rad.firstIndex(of: ":") {
                falt[String(rad[..<i])] = rad[rad.index(after: i)...].trimmingCharacters(in: .whitespaces)
            }
        }
        let rest = Data(buf[r.upperBound...])
        buf = Data()
        huvudKlart = true
        if let svar = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: falt) {
            client?.urlProtocol(self, didReceive: svar, cacheStoragePolicy: .notAllowed)
        }
        if !rest.isEmpty { client?.urlProtocol(self, didLoad: rest) }
    }

    override func stopLoading() {
        anslutning?.cancel()
        anslutning = nil
    }
}

/// Ett låtsat konto för självtestet (token `falkprov`, som testservern godtar).
@MainActor
@Observable
final class FalkProvkonto: KontoTjanst {
    private(set) var konto: Kontouppgifter? = Kontouppgifter(id: "falkprov", namn: "Alex Lind", epost: "alex@example.com")

    var arInloggad: Bool { konto != nil }

    func token() async -> String? { konto == nil ? nil : FalkProvserver.token }

    func loggaUt() async {
        konto = nil
        AppMiljo.delad?.handelser.skicka(KontoAndrades(inloggad: false))
    }

    func loggaIn() {
        konto = Kontouppgifter(id: "falkprov", namn: "Alex Lind", epost: "alex@example.com")
        AppMiljo.delad?.handelser.skicka(KontoAndrades(inloggad: true))
    }
}

/// Sant första gången (för en continuation som kan avslutas från flera håll).
final class FalkEngangFlagga: @unchecked Sendable {
    private let las = NSLock()
    private var gjord = false

    func forsta() -> Bool {
        las.lock()
        defer { las.unlock() }
        if gjord { return false }
        gjord = true
        return true
    }
}
