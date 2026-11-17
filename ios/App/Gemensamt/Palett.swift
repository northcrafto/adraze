import Foundation
import UIKit

/// Datorns palettmotor (`ui/anpassa-tema.js` 48–119) i Swift, med samma tal: sRGB, WCAG-kontrast, APCA och OKLab.
/// Allt som räknas ut ur en accentfärg, så att skalet och webbsidorna får exakt samma färger som datorn.
/// `-mode rok` jämför resultatet med datorns egen JS-utdata (`Labb/Bunt/palett-facit.json`).
///
/// Ägare: Grund (Gemensamt).
enum Palett {
    static let vit = "#ffffff"
    static let svart = "#111113"

    /// `"#ABC"`, `"abc"` och `"#aabbcc"` blir `"#aabbcc"`. Annat ger `nil`.
    static func normFarg(_ v: String?) -> String? {
        guard let v else { return nil }
        var h = v.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 3 || h.count == 6, h.allSatisfy({ $0.isHexDigit && $0.isASCII }) else { return nil }
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        return "#" + h
    }

    /// `"#rrggbb"` till [r, g, b] i 0–255. Förutsätter en normaliserad färg.
    static func rgb(_ hex: String) -> [Double] {
        let h = Array(hex.dropFirst())
        return stride(from: 0, to: 6, by: 2).map { Double(Int(String(h[$0...($0 + 1)]), radix: 16) ?? 0) }
    }

    static func hex(_ rgb: [Double]) -> String {
        "#" + rgb.map { String(format: "%02x", Int(max(0, min(255, floor($0 + 0.5))))) }.joined()
    }

    static func tillLin(_ c: Double) -> Double {
        let c = c / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    static func franLin(_ x: Double) -> Double { 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1 / 2.4) - 0.055) }

    /// WCAG 2: relativ luminans.
    static func luminans(_ rgb: [Double]) -> Double {
        let l = rgb.map(tillLin)
        return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
    }

    /// WCAG 2: kontrastkvot 1–21.
    static func kontrast(_ a: [Double], _ b: [Double]) -> Double {
        let x = luminans(a), y = luminans(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    /// APCA (läsbarhetsmåttet i WCAG 3-utkastet), Lc-värdet.
    static func apca(_ text: [Double], _ bg: [Double]) -> Double {
        func y(_ rgb: [Double]) -> Double {
            let c = rgb.map { pow($0 / 255, 2.4) }
            let v = 0.2126729 * c[0] + 0.7151522 * c[1] + 0.0721750 * c[2]
            return v > 0.022 ? v : v + pow(0.022 - v, 1.414)
        }
        let t = y(text), b = y(bg)
        if abs(b - t) < 0.0005 { return 0 }
        if b > t {
            let s = (pow(b, 0.56) - pow(t, 0.57)) * 1.14
            return s < 0.1 ? 0 : (s - 0.027) * 100
        }
        let s = (pow(b, 0.65) - pow(t, 0.62)) * 1.14
        return s > -0.1 ? 0 : (s + 0.027) * 100
    }

    /// Vit eller svart text ovanpå en färg. Vit bara om APCA föredrar den och den klarar 3:1.
    static func textPa(_ hex: String) -> String {
        let bg = rgb(hex), v = rgb(vit)
        return abs(apca(v, bg)) >= abs(apca(rgb(svart), bg)) && kontrast(v, bg) >= 3 ? vit : svart
    }

    static func rgbTillOklab(_ rgb: [Double]) -> [Double] {
        let c = rgb.map(tillLin)
        let r = c[0], g = c[1], b = c[2]
        let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s]
    }

    static func oklabTillLin(_ L: Double, _ a: Double, _ b: Double) -> [Double] {
        let l = pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(L - 0.0894841775 * a - 1.2914855480 * b, 3)
        return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    }

    /// OKLCH till sRGB. Utanför sRGB sänks mättnaden (samma ljushet och kulör) tills färgen får plats.
    static func lchTillRgb(_ L: Double, _ C: Double, _ h: Double) -> [Double] {
        func prov(_ c: Double) -> [Double]? {
            let v = oklabTillLin(L, c * cos(h), c * sin(h))
            return v.allSatisfy { $0 >= -0.0005 && $0 <= 1.0005 } ? v : nil
        }
        var lin = prov(C)
        if lin == nil {
            var lo = 0.0, hi = C
            lin = prov(0) ?? [L, L, L]
            for _ in 0..<20 {
                let mid = (lo + hi) / 2
                if let v = prov(mid) { lo = mid; lin = v } else { hi = mid }
            }
        }
        return lin!.map { franLin(max(0, min(1, $0))) }
    }

    /// Mörkar (mot ljus bakgrund) eller ljusar (mot mörk) en färg tills kontrasten mot bakgrunden når målet.
    static func justera(_ hex: String, _ bg: String, _ mal: Double) -> String {
        let bgRgb = rgb(bg)
        if kontrast(rgb(hex), bgRgb) >= mal { return hex }
        let lab = rgbTillOklab(rgb(hex))
        let L = lab[0], C = hypot(lab[1], lab[2]), h = atan2(lab[2], lab[1])
        let uppat = luminans(bgRgb) < 0.18
        for i in 1...60 {
            let di = Double(i)
            let ny = Palett.hex(lchTillRgb(uppat ? L + (1 - L) * di / 60 : L * (1 - di / 60), C, h))
            if kontrast(rgb(ny), bgRgb) >= mal { return ny }
        }
        return uppat ? vit : svart
    }

    /// Allt som räknas ut ur en accentfärg (datorns `palett(hex)`).
    static func palett(_ hex: String) -> Accentpalett {
        let l = justera(hex, "#f1f5f9", 3), d = justera(hex, "#171718", 3)
        return Accentpalett(l: l, d: d, onL: textPa(l), onD: textPa(d),
                            inkL: justera(hex, "#ffffff", 4.5), inkD: justera(hex, "#161618", 4.5))
    }
}

/// Färgerna ur en accent. `l`/`d` = ytor och ikoner i ljust/mörkt läge (minst 3:1 mot verktygsraden),
/// `inkL`/`inkD` = accentfärgad text (minst 4,5:1), `onL`/`onD` = svart eller vit text ovanpå accenten.
struct Accentpalett: Sendable, Hashable {
    let l: String
    let d: String
    let onL: String
    let onD: String
    let inkL: String
    let inkD: String

    var json: JSONVarde {
        ["l": .text(l), "d": .text(d), "onL": .text(onL), "onD": .text(onD), "inkL": .text(inkL), "inkD": .text(inkD)]
    }
}

extension UIColor {
    /// `"#rrggbb"` (eller `"#rgb"`) i sRGB. Ogiltig färg ger magenta, så att felet syns.
    convenience init(hex: String, alfa: CGFloat = 1) {
        guard let h = Palett.normFarg(hex) else {
            self.init(red: 1, green: 0, blue: 1, alpha: 1)
            return
        }
        let c = Palett.rgb(h)
        self.init(red: c[0] / 255, green: c[1] / 255, blue: c[2] / 255, alpha: alfa)
    }
}
