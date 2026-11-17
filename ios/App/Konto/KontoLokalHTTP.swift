import Foundation
import Network

/// Bara för självtesterna mot en lokal testserver (`-api http://…`): ATS stoppar okrypterad HTTP i URLSession,
/// så de anropen går här via Network.framework (som inte omfattas av ATS) med enkel HTTP/1.0. Riktiga anrop
/// (`https://api.adraze.app`) går aldrig hit: klassen registreras bara när adressen börjar med `http://`.
final class KontoLokalHTTP: URLProtocol, @unchecked Sendable {
    private var anslutning: NWConnection?

    override class func canInit(with request: URLRequest) -> Bool { request.url?.scheme == "http" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let host = url.host, let port = NWEndpoint.Port(rawValue: UInt16(url.port ?? 80)) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        var sokvag = url.path.isEmpty ? "/" : url.path
        if let q = url.query { sokvag += "?" + q }
        var kropp = request.httpBody ?? Data()
        if kropp.isEmpty, let strom = request.httpBodyStream {
            strom.open()
            var buf = [UInt8](repeating: 0, count: 65_536)
            while strom.hasBytesAvailable { let n = strom.read(&buf, maxLength: buf.count); if n <= 0 { break }; kropp.append(buf, count: n) }
            strom.close()
        }
        var huvud = "\(request.httpMethod ?? "GET") \(sokvag) HTTP/1.0\r\nHost: \(host):\(port.rawValue)\r\n"
        for (k, v) in request.allHTTPHeaderFields ?? [:] where k.lowercased() != "content-length" { huvud += "\(k): \(v)\r\n" }
        if !kropp.isEmpty { huvud += "Content-Length: \(kropp.count)\r\n" }
        huvud += "Connection: close\r\n\r\n"
        let c = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        anslutning = c
        c.stateUpdateHandler = { [weak self] s in
            guard let self else { return }
            if case .failed(let e) = s { self.client?.urlProtocol(self, didFailWithError: e) }
        }
        c.start(queue: .global(qos: .userInitiated))
        c.send(content: Data(huvud.utf8) + kropp, completion: .contentProcessed { _ in })
        var svar = Data()
        func las() {
            c.receive(minimumIncompleteLength: 1, maximumLength: 262_144) { [weak self] data, _, klar, fel in
                guard let self else { return }
                if let data { svar.append(data) }
                if klar || fel != nil { self.leverera(svar, url); c.cancel() } else { las() }
            }
        }
        las()
    }

    private func leverera(_ svar: Data, _ url: URL) {
        guard let slut = svar.range(of: Data("\r\n\r\n".utf8)), let huvud = String(data: svar[..<slut.lowerBound], encoding: .utf8) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        let rader = huvud.components(separatedBy: "\r\n")
        let status = Int(rader.first?.split(separator: " ").dropFirst().first ?? "") ?? 0
        var falt: [String: String] = [:]
        for r in rader.dropFirst() { if let i = r.firstIndex(of: ":") { falt[String(r[..<i])] = r[r.index(after: i)...].trimmingCharacters(in: .whitespaces) } }
        let r = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.0", headerFields: falt)!
        client?.urlProtocol(self, didReceive: r, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: svar[slut.upperBound...])
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() { anslutning?.cancel() }
}
