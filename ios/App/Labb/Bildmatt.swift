import CoreGraphics
import Foundation

/// Enkla mått på skärmbilder, för självtester som vill kontrollera att något faktiskt syns.
///
/// Ägare: Grund (Labb-ramverket).
enum Bildmatt {
    /// Kör `f` med bildens pixlar som RGBA, 8 bitar per kanal, översta raden först.
    static func medPixlar<T>(_ bild: CGImage, _ f: (_ data: UnsafeBufferPointer<UInt8>, _ bredd: Int, _ hojd: Int) -> T) -> T? {
        let w = bild.width, h = bild.height
        guard w > 0, h > 0 else { return nil }
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ritat: Bool = data.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(bild, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ritat else { return nil }
        return data.withUnsafeBufferPointer { f($0, w, h) }
    }

    /// Andelen pixlar (0–1) som är mörkare än mitten (medel av R, G och B under 128).
    static func morkAndel(_ bild: CGImage) -> Double {
        medPixlar(bild) { p, w, h in
            var n = 0
            for i in stride(from: 0, to: w * h * 4, by: 4) where (Int(p[i]) + Int(p[i + 1]) + Int(p[i + 2])) < 384 { n += 1 }
            return Double(n) / Double(w * h)
        } ?? -1
    }

    /// Andelen pixlar (0–1) i en rektangel (i punkter, fönstrets koordinater) som skiljer sig tydligt från
    /// rektangelns översta vänstra pixel. Nära 0 = tom yta.
    static func skiljerAndel(_ bild: CGImage, rekt: CGRect, skala: CGFloat) -> Double {
        medPixlar(bild) { p, w, h in
            let x0 = max(0, Int(rekt.minX * skala)), y0 = max(0, Int(rekt.minY * skala))
            let x1 = min(w, Int(rekt.maxX * skala)), y1 = min(h, Int(rekt.maxY * skala))
            guard x1 > x0, y1 > y0 else { return 0 }
            let r0 = Int(p[(y0 * w + x0) * 4]), g0 = Int(p[(y0 * w + x0) * 4 + 1]), b0 = Int(p[(y0 * w + x0) * 4 + 2])
            var n = 0
            for y in y0..<y1 {
                for x in x0..<x1 {
                    let i = (y * w + x) * 4
                    if abs(Int(p[i]) - r0) + abs(Int(p[i + 1]) - g0) + abs(Int(p[i + 2]) - b0) > 30 { n += 1 }
                }
            }
            return Double(n) / Double((x1 - x0) * (y1 - y0))
        } ?? -1
    }
}
