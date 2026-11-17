import Foundation

/// Zoom per sajt, i datorns format (`browser/anpassa-sajt.js`): `sajt.<domän>` = `{ zoom, mork, ljud }`, där
/// domänen är värden utan `www.` och bara avvikelser sparas (nyckeln tas bort när objektet blir tomt).
/// Privata flikar läser de sparade värdena men sparar aldrig: deras zoom gäller bara i minnet tills den sista
/// privata fliken stängs.
@MainActor
final class Sajtminne {
    private let installningar: Installningar
    private var privataZoom: [String: Double] = [:]

    /// Datorns `ZOOM_STEG`.
    static let zoomsteg: [Double] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

    init(installningar: Installningar) {
        self.installningar = installningar
    }

    /// Domänen för en värd (datorns `domanAv`): små bokstäver, utan avslutande punkt och `www.`. Värden "skydd"
    /// ger "" (nyckeln `sajt.skydd` är upptagen).
    static func doman(_ vard: String) -> String {
        var d = vard.lowercased()
        while d.hasSuffix(".") { d.removeLast() }
        if d.hasPrefix("www.") { d = String(d.dropFirst(4)) }
        return d == "skydd" ? "" : d
    }

    /// 0,5–3, två decimaler.
    static func begransa(_ z: Double) -> Double {
        guard z.isFinite else { return 1 }
        return (min(3, max(0.5, z)) * 100).rounded() / 100
    }

    /// Nästa steg uppåt eller nedåt från `z`.
    static func steg(fran z: Double, inat: Bool) -> Double {
        if inat { return zoomsteg.first { $0 > z + 0.001 } ?? zoomsteg.last! }
        return zoomsteg.last { $0 < z - 0.001 } ?? zoomsteg.first!
    }

    /// Zoomen för en värd (1 om inget är sparat).
    func zoom(vard: String, privat: Bool) -> Double {
        let d = Self.doman(vard)
        guard !d.isEmpty else { return 1 }
        if privat, let z = privataZoom[d] { return z }
        let z = installningar.hamta("sajt." + d)?["zoom"].tal ?? 1
        return z >= 0.25 && z <= 5 ? (z * 100).rounded() / 100 : 1
    }

    /// Sparar zoomen för en värd (1 = ta bort). Privata flikar: bara i minnet.
    func sparaZoom(_ z: Double, vard: String, privat: Bool) {
        let d = Self.doman(vard)
        guard !d.isEmpty else { return }
        if privat {
            privataZoom[d] = z
            return
        }
        var o = installningar.hamta("sajt." + d)?.objekt ?? [:]
        if abs(z - 1) < 0.001 { o.removeValue(forKey: "zoom") } else { o["zoom"] = .tal(z) }
        let nytt: JSONVarde? = o.isEmpty ? nil : .objekt(o)
        guard nytt != installningar.sparat("sajt." + d) else { return }
        installningar.satt("sajt." + d, nytt, etikett: "Zoom på \(d)")
    }

    func glomPrivata() { privataZoom = [:] }
}
