import Foundation
import Network

/// Okrypterad HTTP till en lokal testserver, bara för självtesterna (`-api http://…` för Konto och Chatt, Falks
/// testserver på 127.0.0.1). ATS stoppar okrypterad HTTP i URLSession, så de anropen går här via Network.framework
/// (som inte omfattas av ATS). Svaret förs vidare bit för bit medan det kommer, så att strömmande svar
/// (`text/event-stream`, Falk) provas på riktigt.
///
/// Registreras bara i en egen session, aldrig globalt, och bara när adressen börjar med `http://`:
///
///     let k = URLSessionConfiguration.ephemeral
///     if bas.scheme == "http" { k.protocolClasses = [LokalHTTP.self] }
///
/// Tar bara adresser på den egna enheten och i lokala nät: `localhost`, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
/// 192.168.0.0/16 och 100.64.0.0/10 (Tailscale), så att inget okrypterat går ut på internet av misstag. Begäran
/// skickas som HTTP/1.0: servern svarar då utan chunked-kodning och stänger förbindelsen när svaret är klart.
/// Kommer svaret ändå chunked avkodas det.
///
/// Ersätter Kontos, Chattens och Falks egna kopior (2026-11-17). Ägare: Grund (Gemensamt).
final class LokalHTTP: URLProtocol, @unchecked Sendable {
    private var anslutning: NWConnection?
    private let ko = DispatchQueue(label: "app.adraze.lokalhttp")
    // Allt nedan används bara på `ko`.
    private var huvudKlart = false
    private var huvudbuf = Data()
    private var chunkad = false
    private var chunkbuf = Data()
    private var avslutad = false

    override class func canInit(with request: URLRequest) -> Bool {
        guard request.url?.scheme?.lowercased() == "http", let host = request.url?.host else { return false }
        return arLokal(host)
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    /// Den egna enheten eller ett lokalt nät (se ovan). Bara IPv4-adresser och `localhost`.
    static func arLokal(_ host: String) -> Bool {
        if host.lowercased() == "localhost" { return true }
        let d = host.split(separator: ".", omittingEmptySubsequences: false).map { Int($0) ?? -1 }
        guard d.count == 4, d.allSatisfy({ (0...255).contains($0) }) else { return false }
        switch (d[0], d[1]) {
        case (127, _), (10, _), (192, 168): return true
        case (172, 16...31): return true
        case (100, 64...127): return true
        default: return false
        }
    }

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
        let metod = request.httpMethod ?? "GET"
        var huvud = "\(metod) \(sokvag) HTTP/1.0\r\nHost: \(host):\(port.rawValue)\r\n"
        for (k, v) in request.allHTTPHeaderFields ?? [:] where !["content-length", "host", "connection"].contains(k.lowercased()) {
            huvud += "\(k): \(v)\r\n"
        }
        if !kropp.isEmpty || ["POST", "PUT", "PATCH"].contains(metod) { huvud += "Content-Length: \(kropp.count)\r\n" }
        huvud += "Connection: close\r\n\r\n"

        let c = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        anslutning = c
        c.stateUpdateHandler = { [weak self] s in
            guard let self else { return }
            if case .failed(let e) = s { self.misslyckas(e) }
        }
        c.start(queue: ko)
        c.send(content: Data(huvud.utf8) + kropp, completion: .contentProcessed { [weak self] fel in
            if let fel { self?.misslyckas(fel) }
        })
        las(c)
    }

    override func stopLoading() {
        ko.async { [weak self] in
            self?.avslutad = true
            self?.anslutning?.cancel()
            self?.anslutning = nil
        }
    }

    // MARK: - Svaret (på `ko`)

    private func las(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 262_144) { [weak self] data, _, klar, fel in
            guard let self, !self.avslutad else { c.cancel(); return }
            if let data, !data.isEmpty { self.ta(data) }
            if let fel {
                self.misslyckas(fel)
                c.cancel()
            } else if klar {
                self.slut()
                c.cancel()
            } else {
                self.las(c)
            }
        }
    }

    private func ta(_ d: Data) {
        guard huvudKlart else {
            huvudbuf.append(d)
            guard let r = huvudbuf.range(of: Data("\r\n\r\n".utf8)), let url = request.url else { return }
            let rader = String(decoding: huvudbuf[..<r.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
            let status = Int((rader.first ?? "").split(separator: " ").dropFirst().first ?? "") ?? 0
            var falt: [String: String] = [:]
            for rad in rader.dropFirst() {
                guard let i = rad.firstIndex(of: ":") else { continue }
                falt[String(rad[..<i])] = rad[rad.index(after: i)...].trimmingCharacters(in: .whitespaces)
            }
            if let te = falt.first(where: { $0.key.lowercased() == "transfer-encoding" }), te.value.lowercased().contains("chunked") {
                chunkad = true
                falt.removeValue(forKey: te.key)
            }
            let rest = Data(huvudbuf[r.upperBound...])
            huvudbuf = Data()
            huvudKlart = true
            if let svar = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: falt) {
                client?.urlProtocol(self, didReceive: svar, cacheStoragePolicy: .notAllowed)
            }
            if !rest.isEmpty { kropp(rest) }
            return
        }
        kropp(d)
    }

    private func kropp(_ d: Data) {
        guard chunkad else {
            client?.urlProtocol(self, didLoad: d)
            return
        }
        chunkbuf.append(d)
        // <storlek i hex>[;tillägg]\r\n<data>\r\n … 0\r\n\r\n
        while let radslut = chunkbuf.range(of: Data("\r\n".utf8)) {
            let rad = String(decoding: chunkbuf[..<radslut.lowerBound], as: UTF8.self)
            guard let storlek = Int(rad.split(separator: ";").first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? "", radix: 16) else {
                chunkbuf = Data()
                return
            }
            let start = radslut.upperBound
            if storlek == 0 {
                chunkbuf = Data()
                return
            }
            guard chunkbuf.distance(from: start, to: chunkbuf.endIndex) >= storlek + 2 else { return }
            let slutet = chunkbuf.index(start, offsetBy: storlek)
            client?.urlProtocol(self, didLoad: Data(chunkbuf[start..<slutet]))
            chunkbuf = Data(chunkbuf[chunkbuf.index(slutet, offsetBy: 2)...])
        }
    }

    private func slut() {
        guard !avslutad else { return }
        avslutad = true
        if huvudKlart {
            client?.urlProtocolDidFinishLoading(self)
        } else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
        }
    }

    private func misslyckas(_ fel: Error) {
        guard !avslutad else { return }
        avslutad = true
        client?.urlProtocol(self, didFailWithError: fel)
    }
}
