import Foundation

/// Det datorns huvudprocess hämtar åt skalet (sidornas CSP släpper inte ut fetch): sökförslag, väder och orter
/// (Open-Meteo, ingen nyckel) och dagens bild (Bing). Samma adresser, gränser och svar som på datorn
/// (`browser/main.js` omni:suggest och skoll:daily-image, `browser/anpassa-startsida.js`).
/// Inga kakor och ingen cache på disk (egen tillfällig session).
///
/// Ägare: Brygga och webb-UI.
@MainActor
enum BryggNatet {
    private static let session: URLSession = {
        let k = URLSessionConfiguration.ephemeral
        k.httpCookieAcceptPolicy = .never
        k.httpShouldSetCookies = false
        k.urlCache = nil
        k.timeoutIntervalForRequest = 8
        k.waitsForConnectivity = false
        return URLSession(configuration: k)
    }()

    private static func json(_ url: URL, tid: TimeInterval) async throws -> JSONVarde {
        var f = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: tid)
        f.setValue("application/json", forHTTPHeaderField: "Accept")
        f.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")
        let (data, svar) = try await session.data(for: f)
        guard let h = svar as? HTTPURLResponse, (200..<300).contains(h.statusCode) else { throw URLError(.badServerResponse) }
        return try JSONVarde(json: data)
    }

    private static func kodad(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.~"))) ?? ""
    }

    // MARK: - Sökförslag (omni:suggest)

    static func forslag(_ q: String, motor: String) async -> JSONVarde {
        let q = String(q.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        guard !q.isEmpty else { return [] }
        let k = kodad(q)
        let adress: String
        switch motor {
        case "adraze": adress = "https://search.adraze.app/api/suggest?q=\(k)"
        case "duckduckgo", "startpage": adress = "https://duckduckgo.com/ac/?type=list&q=\(k)"
        case "brave": adress = "https://search.brave.com/api/suggest?q=\(k)"
        default: adress = "https://suggestqueries.google.com/complete/search?client=firefox&hl=sv&q=\(k)"
        }
        guard let url = URL(string: adress), let j = try? await json(url, tid: 1.5), let lista = j[1].lista else { return [] }
        let ut = lista.compactMap { $0.text ?? $0["phrase"].text }.filter { !$0.isEmpty }.prefix(6)
        return .lista(ut.map(JSONVarde.text))
    }

    // MARK: - Väder och orter (startsida:vader, startsida:ort-sok)

    private static var vaderminne: [String: (ts: Double, data: JSONVarde)] = [:]

    static func vader(_ arg: JSONVarde) async -> JSONVarde {
        guard let lat = arg["lat"].tal, let lon = arg["lon"].tal, lat.isFinite, lon.isFinite, abs(lat) <= 90, abs(lon) <= 180 else {
            return ["ok": false, "error": "plats"]
        }
        let nyckel = String(format: "%.2f,%.2f", lat, lon)
        let nu = (Date().timeIntervalSince1970 * 1000).rounded()
        if let c = vaderminne[nyckel], nu - c.ts < 30 * 60 * 1000 { return ["ok": true, "ts": .tal(c.ts), "data": c.data] }
        let adress = String(format: "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f", lat, lon)
            + "&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m"
            + "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=6&wind_speed_unit=ms"
        guard let url = URL(string: adress), let j = try? await json(url, tid: 8) else { return ["ok": false, "error": "natet"] }
        let data = forenkla(j)
        guard !data["temp"].arNull else { return ["ok": false, "error": "svar"] }
        vaderminne[nyckel] = (nu, data)
        return ["ok": true, "ts": .tal(nu), "data": data]
    }

    private static func forenkla(_ j: JSONVarde) -> JSONVarde {
        let tal: (JSONVarde) -> JSONVarde = { v in
            guard let d = v.tal, d.isFinite else { return .null }
            return .tal((d * 10).rounded() / 10)
        }
        let kod: (JSONVarde) -> JSONVarde = { v in
            guard let n = v.heltal, n >= 0, n < 100 else { return .null }
            return .tal(Double(n))
        }
        let c = j["current"], d = j["daily"]
        var dagar: [JSONVarde] = []
        for (i, t) in (d["time"].lista ?? []).prefix(7).enumerated() {
            guard let datum = t.text, datum.count == 10 else { continue }
            dagar.append(["datum": .text(datum), "kod": kod(d["weather_code"][i]), "max": tal(d["temperature_2m_max"][i]), "min": tal(d["temperature_2m_min"][i])])
        }
        return ["temp": tal(c["temperature_2m"]), "kanns": tal(c["apparent_temperature"]), "kod": kod(c["weather_code"]),
                "dag": .bool(c["is_day"].tal != 0), "vind": tal(c["wind_speed_10m"]), "dagar": .lista(dagar)]
    }

    static func orter(_ q: String) async -> JSONVarde {
        let q = String(q.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(80))
        guard q.count >= 2 else { return [] }
        guard let url = URL(string: "https://geocoding-api.open-meteo.com/v1/search?name=\(kodad(q))&count=6&language=sv&format=json"),
              let j = try? await json(url, tid: 8) else { return .null }   // null = nätfel, [] = inga träffar (som datorn)
        let text: (JSONVarde, Int) -> String = { v, max in String((v.text ?? "").prefix(max)) }
        var ut: [JSONVarde] = []
        for r in j["results"].lista ?? [] {
            guard let lat = r["latitude"].tal, let lon = r["longitude"].tal, abs(lat) <= 90, abs(lon) <= 180 else { continue }
            let namn = text(r["name"], 80)
            guard !namn.isEmpty else { continue }
            ut.append(["namn": .text(namn), "region": .text(text(r["admin1"], 80)), "land": .text(text(r["country"], 60)), "lat": .tal(lat), "lon": .tal(lon)])
            if ut.count == 6 { break }
        }
        return .lista(ut)
    }

    // MARK: - Dagens bild (skoll:daily-image)

    private static let bingMarknad: [String: String] = [
        "sv": "sv-SE", "en": "en-US", "de": "de-DE", "fr": "fr-FR", "es": "es-ES", "it": "it-IT", "nl": "nl-NL", "pl": "pl-PL",
        "da": "da-DK", "fi": "fi-FI", "nb": "nb-NO", "no": "nb-NO", "pt": "pt-BR", "pt-PT": "pt-PT", "ja": "ja-JP",
        "zh-CN": "zh-CN", "zh-TW": "zh-TW", "ko": "ko-KR", "ru": "ru-RU", "tr": "tr-TR",
    ]

    static func dagensBild(sprak: String) async -> JSONVarde {
        let mkt = bingMarknad[sprak] ?? "en-US"
        guard let url = URL(string: "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=\(mkt)"),
              let j = try? await json(url, tid: 6), let u = j["images"][0]["url"].text, u.hasPrefix("/") else {
            return ["url": .null, "credit": ""]
        }
        return ["url": .text("https://www.bing.com" + u), "credit": .text(j["images"][0]["copyright"].text ?? "")]
    }
}
