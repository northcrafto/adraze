import Foundation
import Network

/// En liten HTTP-server på 127.0.0.1 för grundens självtester (bara den egna loopbacken, inget nät behövs).
/// `sidor` = sökväg -> HTML. `/trasig` stänger anslutningen utan svar (för felsidan), okänd sökväg ger 404.
///
/// Ägare: Grund.
final class Labbserver: @unchecked Sendable {
    private var lyssnare: NWListener?
    private let ko = DispatchQueue(label: "app.adraze.labb.server")
    private let sidor: [String: String]

    init(sidor: [String: String]) {
        self.sidor = sidor
    }

    /// Startar servern och ger porten.
    func starta() async throws -> UInt16 {
        let p = NWParameters.tcp
        p.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        p.allowLocalEndpointReuse = true
        let l = try NWListener(using: p)
        l.newConnectionHandler = { [weak self] c in self?.hantera(c) }
        lyssnare = l
        return try await withCheckedThrowingContinuation { (fort: CheckedContinuation<UInt16, Error>) in
            let klar = Engang()
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

    private func hantera(_ c: NWConnection) {
        c.start(queue: ko)
        c.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, _, _ in
            guard let self else { c.cancel(); return }
            let begaran = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let delar = (begaran.components(separatedBy: "\r\n").first ?? "").split(separator: " ")
            var vag = delar.count > 1 ? String(delar[1]) : "/"
            if let q = vag.firstIndex(of: "?") { vag = String(vag[..<q]) }
            if vag == "/trasig" { c.cancel(); return }
            let kropp = self.sidor[vag]
            let b = Data((kropp ?? "<!doctype html><title>Hittades inte</title><h1>404</h1>").utf8)
            let huvud = "HTTP/1.1 \(kropp == nil ? "404 Not Found" : "200 OK")\r\n"
                + "Content-Type: text/html; charset=utf-8\r\nContent-Length: \(b.count)\r\n"
                + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
            var ut = Data(huvud.utf8)
            ut.append(b)
            c.send(content: ut, completion: .contentProcessed { _ in c.cancel() })
        }
    }

    private final class Engang: @unchecked Sendable {
        private let las = NSLock()
        private var gjort = false
        func forsta() -> Bool {
            las.lock()
            defer { las.unlock() }
            if gjort { return false }
            gjort = true
            return true
        }
    }
}
