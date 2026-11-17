import Foundation

/// Ett JSON-värde. Används överallt där data går mellan Swift och webben (bryggan) och i inställningarna,
/// så att samma värden kan skickas till AdRaze-UI:t, sparas på disk och synkas med datorn utan att typerna
/// tappas bort på vägen.
///
/// Tal är alltid `Double`, som i JavaScript. `JSONVarde(foundation:)` och `.foundation` översätter till och
/// från det som WebKit (`WKScriptMessage.body`, svar till JS) och `JSONSerialization` använder.
///
///     let v: JSONVarde = ["nyckel": "tema.accent", "varde": "#3b6fe0", "antal": 3, "pa": true]
///     v["nyckel"].text      // "tema.accent"
///     v["antal"].heltal     // 3
///     v["saknas"]           // .null
///
/// Ägare: Grund (Gemensamt). Ändringar: be Grund.
enum JSONVarde: Hashable, Sendable {
    case null
    case bool(Bool)
    case tal(Double)
    case text(String)
    case lista([JSONVarde])
    case objekt([String: JSONVarde])
}

// MARK: - Till och från Foundation och JSON-text

extension JSONVarde {
    /// Från WebKit eller `JSONSerialization`: `NSNull`, `NSNumber` (bool eller tal), `String`, `[Any]`,
    /// `[String: Any]`. `nil` blir `.null`, `Date` blir millisekunder sedan 1970 (som `Date.now()` i JS)
    /// och okända typer blir text.
    init(foundation v: Any?) {
        guard let v else { self = .null; return }
        switch v {
        case is NSNull:
            self = .null
        case let n as NSNumber:
            if CFGetTypeID(n) == CFBooleanGetTypeID() { self = .bool(n.boolValue) } else { self = .tal(n.doubleValue) }
        case let s as String:
            self = .text(s)
        case let a as [Any]:
            self = .lista(a.map { JSONVarde(foundation: $0) })
        case let d as [String: Any]:
            self = .objekt(d.mapValues { JSONVarde(foundation: $0) })
        case let d as Date:
            self = .tal(d.timeIntervalSince1970 * 1000)
        case let j as JSONVarde:
            self = j
        default:
            self = .text(String(describing: v))
        }
    }

    /// Det WebKit och `JSONSerialization` förstår: `NSNull`, `NSNumber`, `String`, `[Any]`, `[String: Any]`.
    var foundation: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let b): return NSNumber(value: b)
        case .tal(let d): return NSNumber(value: d)
        case .text(let s): return s
        case .lista(let a): return a.map(\.foundation)
        case .objekt(let o): return o.mapValues(\.foundation)
        }
    }

    /// Tolkar JSON. Kastar om datan inte är giltig JSON.
    init(json data: Data) throws {
        self.init(foundation: try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    /// Tolkar JSON-text. Kastar om texten inte är giltig JSON.
    init(jsonText: String) throws {
        try self.init(json: Data(jsonText.utf8))
    }

    /// Som JSON (nycklarna sorterade, så samma värde ger alltid samma text). `fin` = med radbrytningar.
    /// Värden som inte går att skriva (NaN, oändligt) ger `null`.
    func jsonData(fin: Bool = false) -> Data {
        var val: JSONSerialization.WritingOptions = [.fragmentsAllowed, .sortedKeys, .withoutEscapingSlashes]
        if fin { val.insert(.prettyPrinted) }
        return (try? JSONSerialization.data(withJSONObject: foundation, options: val)) ?? Data("null".utf8)
    }

    /// Som JSON-text på en rad.
    var jsonText: String { String(decoding: jsonData(), as: UTF8.self) }
}

// MARK: - Läsa

extension JSONVarde {
    var arNull: Bool { if case .null = self { return true } else { return false } }
    var bool: Bool? { if case .bool(let b) = self { return b } else { return nil } }
    var tal: Double? { if case .tal(let d) = self { return d } else { return nil } }
    var text: String? { if case .text(let s) = self { return s } else { return nil } }
    var lista: [JSONVarde]? { if case .lista(let a) = self { return a } else { return nil } }
    var objekt: [String: JSONVarde]? { if case .objekt(let o) = self { return o } else { return nil } }

    /// Talet som heltal, om det är ett helt tal som ryms.
    var heltal: Int? {
        guard case .tal(let d) = self, d.isFinite, d == d.rounded(), abs(d) < 9e15 else { return nil }
        return Int(d)
    }

    /// Värdet under en nyckel i ett objekt, `.null` om det saknas eller inte är ett objekt.
    subscript(_ nyckel: String) -> JSONVarde { objekt?[nyckel] ?? .null }

    /// Värdet på en plats i en lista, `.null` om det saknas eller inte är en lista.
    subscript(_ plats: Int) -> JSONVarde {
        guard let l = lista, l.indices.contains(plats) else { return .null }
        return l[plats]
    }
}

// MARK: - Codable

extension JSONVarde {
    /// Kodar ett `Encodable`-värde (via `JSONEncoder`).
    init<T: Encodable>(kodat v: T) throws {
        // Inslaget i en lista, så att även enkla värden ("text", 3) fungerar på alla iOS-versioner.
        self = try JSONVarde(json: JSONEncoder().encode([v]))[0]
    }

    /// Avkodar till en `Decodable`-typ (via `JSONDecoder`).
    func avkoda<T: Decodable>(_ typ: T.Type = T.self) throws -> T {
        try JSONDecoder().decode([T].self, from: JSONVarde.lista([self]).jsonData())[0]
    }
}

extension JSONVarde: Codable {
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let d = try? c.decode(Double.self) { self = .tal(d) }
        else if let s = try? c.decode(String.self) { self = .text(s) }
        else if let a = try? c.decode([JSONVarde].self) { self = .lista(a) }
        else { self = .objekt(try c.decode([String: JSONVarde].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .tal(let d): try c.encode(d)
        case .text(let s): try c.encode(s)
        case .lista(let a): try c.encode(a)
        case .objekt(let o): try c.encode(o)
        }
    }
}

// MARK: - Literaler: let v: JSONVarde = ["a": 1, "b": [true, "x"]]

extension JSONVarde: ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
    ExpressibleByStringLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral {
    init(booleanLiteral v: Bool) { self = .bool(v) }
    init(integerLiteral v: Int) { self = .tal(Double(v)) }
    init(floatLiteral v: Double) { self = .tal(v) }
    init(stringLiteral v: String) { self = .text(v) }
    init(arrayLiteral delar: JSONVarde...) { self = .lista(delar) }
    init(dictionaryLiteral par: (String, JSONVarde)...) {
        self = .objekt(Dictionary(par, uniquingKeysWith: { _, sist in sist }))
    }
}
