import Foundation

/// Falks väg till AdRazes server (`pro.js` på api.adraze.app): `/falk/chat`, `/falk/kvot` och `/me`, med kontots
/// token. Samma anrop som datorns `krypto:*` i `browser/main.js`.
///
/// Strömning: frågan skickas med `Accept: text/event-stream, application/json`. Svarar servern med
/// `text/event-stream` läses händelserna rad för rad:
///
///     event: delta
///     data: {"text":"Hej! "}
///
///     event: klar
///     data: {"ok":true,"reply":"Hej! …","sources":[],"kvot":{…},"modell":"qwen"}
///
///     event: fel
///     data: {"ok":false,"error":"kvot_slut","message":"…","kvot":{…}}
///
/// Annars är svaret ett vanligt JSON-objekt som i dag (`{ ok, reply, sources, kvot, modell, actions?, uppgradera? }`).
///
/// Ägare: Falk.
@MainActor
enum FalkKlient {
    /// Självtestet pekar om servern till en lokal testserver.
    static var basOverride: URL?
    /// Självtestet byter sessionen om ATS skulle stoppa http mot testservern.
    static var session: URLSession = gorSession()

    static func gorSession(protokoll: [AnyClass] = []) -> URLSession {
        let k = URLSessionConfiguration.ephemeral
        k.timeoutIntervalForRequest = 90
        k.timeoutIntervalForResource = 150
        k.httpCookieStorage = nil
        k.urlCache = nil
        k.requestCachePolicy = .reloadIgnoringLocalCacheData
        if !protokoll.isEmpty { k.protocolClasses = protokoll + (k.protocolClasses ?? []) }
        return URLSession(configuration: k)
    }

    /// Serverns adress: självtestets, `-api <adress>` vid start, annars api.adraze.app.
    static func bas(_ app: AppMiljo) -> URL {
        if let b = basOverride { return b }
        if let t = app.startargument.text("api"), let u = URL(string: t), u.scheme != nil, u.host != nil { return u }
        return URL(string: "https://api.adraze.app")!
    }

    /// GET som ger JSON: `(status, svaret)`. Kastar bara när servern inte gick att nå.
    static func hamta(_ vag: String, app: AppMiljo, token: String, tid: TimeInterval) async throws -> (Int, JSONVarde) {
        var r = URLRequest(url: bas(app).appendingPathComponent(vag))
        r.timeoutInterval = tid
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, svar) = try await session.data(for: r)
        let status = (svar as? HTTPURLResponse)?.statusCode ?? 0
        return (status, (try? JSONVarde(json: data)) ?? .objekt([:]))
    }

    /// POST `/falk/chat`. Text som strömmar kommer bit för bit till `delta`; svaret är det sista (hela) svaret.
    static func chatta(_ payload: JSONVarde, app: AppMiljo, token: String,
                       delta: @escaping @MainActor (String) -> Void) async throws -> (Int, JSONVarde) {
        var r = URLRequest(url: bas(app).appendingPathComponent("falk/chat"))
        r.httpMethod = "POST"
        r.timeoutInterval = 90
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("text/event-stream, application/json", forHTTPHeaderField: "Accept")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.httpBody = payload.jsonData()
        let (bytes, svar) = try await session.bytes(for: r)
        let http = svar as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        let typ = (http?.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()

        guard typ.contains("text/event-stream") else {
            var data = Data()
            for try await b in bytes { data.append(b) }
            return (status, (try? JSONVarde(json: data)) ?? .objekt([:]))
        }
        var namn = "message"
        var slut: JSONVarde?
        for try await rad in bytes.lines {
            if rad.hasPrefix(":") { continue }   // kommentar (håller förbindelsen vid liv)
            if rad.hasPrefix("event:") { namn = rad.dropFirst(6).trimmingCharacters(in: .whitespaces); continue }
            guard rad.hasPrefix("data:") else { continue }
            var d = String(rad.dropFirst(5))
            if d.hasPrefix(" ") { d.removeFirst() }
            let j = try? JSONVarde(jsonText: d)
            switch namn {
            case "delta":
                if let t = j?["text"].text, !t.isEmpty { delta(t) }
            case "klar", "fel":
                slut = j ?? ["ok": false]
            default:
                if let j, j["ok"].bool != nil { slut = j }   // ett helt svar utan händelsenamn
            }
            namn = "message"
            if slut != nil { break }
        }
        return (status, slut ?? ["ok": false, "error": "avbrutet", "message": "Kunde inte nå Falk just nu. Kontrollera din uppkoppling och försök igen."])
    }
}
