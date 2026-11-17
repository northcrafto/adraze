import SwiftUI
import UIKit

/// Datorns ikoner (`ui/shell.html`, symbolerna `#i-…`: 24 × 24, streck 1,75, runda ändar) ritade ur samma
/// SVG-vägar, så att telefonen har exakt samma ikoner som AdRaze på datorn i stället för SF Symbols.
/// Några få finns inte på datorn (skrivbordsversion, kopiera, klistra in, fyll i, flikar); de är ritade i samma
/// rutnät och strecktjocklek.
///
///     Ikonvy(.bakat, storlek: 22)
///
/// Ägare: Skal.
enum Ikon: String, CaseIterable, Sendable {
    case bakat, framat, laddaOm, stang, plus, sok, glob
    case skold, skoldKoll, skoldSok, skoldVarning, skoldAv
    case historik, privat, stjarna, bokmarke, nedladdning, dela
    case palett, gnista, chatt, las, oga, info
    case skrivbord, kopiera, klistra, fyllI, papperskorg, flikar

    /// Delarna, i datorns rutnät 24 × 24.
    var delar: [Ikondel] {
        let skold: Ikondel = .vag("M12 3l8 3v6c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9V6z")
        switch self {
        case .bakat: return [.vag("M15 6l-6 6 6 6")]
        case .framat: return [.vag("M9 6l6 6-6 6")]
        case .laddaOm: return [.vag("M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"), .vag("M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4")]
        case .stang: return [.vag("M6 6l12 12M18 6L6 18")]
        case .plus: return [.vag("M12 5v14M5 12h14")]
        case .sok: return [.cirkel(11, 11, 7), .vag("m20 20-3.5-3.5")]
        case .glob: return [.cirkel(12, 12, 9), .vag("M3 12h18"), .ellips(12, 12, 3.8, 9)]
        case .skold: return [skold]
        case .skoldKoll: return [skold, .vag("M9 11.5l2 2 4-4.5")]
        case .skoldSok: return [skold, .cirkel(12, 11, 2.3)]
        case .skoldVarning: return [skold, .vag("M12 8.5v3.5M12 14.6v.2")]
        case .skoldAv: return [skold, .vag("M4.5 4.5l15 15")]
        case .historik: return [.vag("M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 8"), .vag("M3 3.5V8h4.5"), .vag("M12 8v4.5l3 1.8")]
        case .privat:
            return [.vag("M6 10.5l1.4-4.2a2 2 0 0 1 1.9-1.3h5.4a2 2 0 0 1 1.9 1.3L18 10.5"), .vag("M3 11h18"),
                    .cirkel(7.5, 15, 2.5), .cirkel(16.5, 15, 2.5), .vag("M10 15c.6-.7 3.4-.7 4 0")]
        case .stjarna: return [.vag("M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z")]
        case .bokmarke: return [.vag("M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z")]
        case .nedladdning: return [.vag("M12 4v10M8 10l4 4 4-4"), .vag("M5 19h14")]
        case .dela: return [.vag("M12 15V4M8 8l4-4 4 4"), .vag("M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3")]
        case .palett:
            return [.vag("M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"),
                    .cirkel(7.5, 11.5, 1), .cirkel(10, 7.5, 1), .cirkel(14.5, 7.5, 1)]
        case .gnista: return [.vag("M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5-1.9-5.5-5.6-2 5.6-2z"), .vag("M19 3v3M17.5 4.5h3")]
        case .chatt: return [.vag("M4 6h16v10h-9l-4 3v-3H4z"), .vag("M8 10h8M8 13h5")]
        case .las: return [.rekt(5, 11, 14, 9, 2), .vag("M8 11V8a4 4 0 0 1 8 0v3")]
        case .oga: return [.vag("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"), .cirkel(12, 12, 3)]
        case .info: return [.cirkel(12, 12, 9), .vag("M12 11v5.5M12 7.6h.01")]
        case .skrivbord: return [.rekt(3, 4.5, 18, 12, 2), .vag("M8.5 20h7M12 16.5V20")]
        case .kopiera: return [.rekt(9, 9, 11, 11, 2), .vag("M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3")]
        case .klistra:
            return [.vag("M9 4.5h6a1 1 0 0 1 1 1V7H8V5.5a1 1 0 0 1 1-1z"),
                    .vag("M8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16")]
        case .fyllI: return [.vag("M7 17V7h10"), .vag("M7 7l10 10")]
        case .papperskorg: return [.vag("M4 7h16M9.5 7V5h5v2M6.5 7l.9 12h9.2l.9-12")]
        case .flikar: return [.rekt(4, 4, 16, 16, 4)]
        }
    }

    /// Vägen i rutnätet 24 × 24 (tolkad en gång och sparad; SwiftUI kan rita former utanför huvudtråden).
    var vag: Path {
        Ikonminne.delat.las.lock()
        defer { Ikonminne.delat.las.unlock() }
        if let p = Ikonminne.delat.vagar[self] { return p }
        var p = Path()
        for d in delar { p.addPath(d.path) }
        Ikonminne.delat.vagar[self] = p
        return p
    }
}

private final class Ikonminne: @unchecked Sendable {
    static let delat = Ikonminne()
    let las = NSLock()
    var vagar: [Ikon: Path] = [:]
}

/// En del av en ikon: en SVG-väg eller en enkel form.
enum Ikondel: Sendable {
    case vag(String)
    case cirkel(CGFloat, CGFloat, CGFloat)
    case ellips(CGFloat, CGFloat, CGFloat, CGFloat)
    case rekt(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)

    var path: Path {
        switch self {
        case .vag(let d): return SVGVag.tolka(d)
        case .cirkel(let x, let y, let r): return Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
        case .ellips(let x, let y, let rx, let ry): return Path(ellipseIn: CGRect(x: x - rx, y: y - ry, width: 2 * rx, height: 2 * ry))
        case .rekt(let x, let y, let b, let h, let r):
            return Path(roundedRect: CGRect(x: x, y: y, width: b, height: h), cornerRadius: r, style: .circular)
        }
    }
}

/// En ikon som form, skalad från 24 × 24 till sin ram.
struct Ikonform: Shape {
    let ikon: Ikon

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        let dx = rect.minX + (rect.width - 24 * s) / 2, dy = rect.minY + (rect.height - 24 * s) / 2
        return ikon.vag.applying(CGAffineTransform(a: s, b: 0, c: 0, d: s, tx: dx, ty: dy))
    }
}

/// En ikon med datorns streck (1,75 på 24, lite kraftigare på telefonens skärmar).
struct Ikonvy: View {
    let ikon: Ikon
    var storlek: CGFloat = 22
    /// Streck i rutnätet 24 × 24.
    var streck: CGFloat = 1.85

    init(_ ikon: Ikon, storlek: CGFloat = 22, streck: CGFloat = 1.85) {
        self.ikon = ikon
        self.storlek = storlek
        self.streck = streck
    }

    var body: some View {
        Ikonform(ikon: ikon)
            .stroke(style: StrokeStyle(lineWidth: streck * storlek / 24, lineCap: .round, lineJoin: .round))
            .frame(width: storlek, height: storlek)
            .accessibilityHidden(true)
    }
}

// MARK: - SVG-vägar

/// Tolkar SVG:s `d`-attribut (M L H V C S Q T A Z, stora och små bokstäver) till en `Path`.
/// Bågar (`A`) görs om till Bézierkurvor enligt SVG-specifikationens bilaga F.6.
enum SVGVag {
    static func tolka(_ d: String) -> Path {
        var p = Path()
        var l = Lasare(Array(d.utf8))
        var kommando: UInt8 = 0
        var nu = CGPoint.zero, start = CGPoint.zero
        var forraKontroll: CGPoint?
        var forraKommando: UInt8 = 0

        while true {
            l.hoppaOver()
            guard let c = l.titta() else { break }
            if Lasare.arBokstav(c) {
                kommando = c
                l.steg()
            } else if kommando == 0 {
                break
            }
            let relativ = kommando >= 97   // små bokstäver
            let k = relativ ? kommando - 32 : kommando
            func punkt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { relativ ? CGPoint(x: nu.x + x, y: nu.y + y) : CGPoint(x: x, y: y) }

            switch k {
            case 77: // M
                guard let x = l.tal(), let y = l.tal() else { return p }
                nu = punkt(x, y); start = nu
                p.move(to: nu)
                kommando = relativ ? 108 : 76   // fler par efter M är L
                forraKontroll = nil
            case 76: // L
                guard let x = l.tal(), let y = l.tal() else { return p }
                nu = punkt(x, y)
                p.addLine(to: nu)
                forraKontroll = nil
            case 72: // H
                guard let x = l.tal() else { return p }
                nu = CGPoint(x: relativ ? nu.x + x : x, y: nu.y)
                p.addLine(to: nu)
                forraKontroll = nil
            case 86: // V
                guard let y = l.tal() else { return p }
                nu = CGPoint(x: nu.x, y: relativ ? nu.y + y : y)
                p.addLine(to: nu)
                forraKontroll = nil
            case 67: // C
                guard let x1 = l.tal(), let y1 = l.tal(), let x2 = l.tal(), let y2 = l.tal(), let x = l.tal(), let y = l.tal() else { return p }
                let c1 = punkt(x1, y1), c2 = punkt(x2, y2), slut = punkt(x, y)
                p.addCurve(to: slut, control1: c1, control2: c2)
                forraKontroll = c2; nu = slut
            case 83: // S
                guard let x2 = l.tal(), let y2 = l.tal(), let x = l.tal(), let y = l.tal() else { return p }
                let c1: CGPoint
                if let f = forraKontroll, [67, 83].contains(forraKommando) { c1 = CGPoint(x: 2 * nu.x - f.x, y: 2 * nu.y - f.y) } else { c1 = nu }
                let c2 = punkt(x2, y2), slut = punkt(x, y)
                p.addCurve(to: slut, control1: c1, control2: c2)
                forraKontroll = c2; nu = slut
            case 81: // Q
                guard let x1 = l.tal(), let y1 = l.tal(), let x = l.tal(), let y = l.tal() else { return p }
                let c = punkt(x1, y1), slut = punkt(x, y)
                p.addQuadCurve(to: slut, control: c)
                forraKontroll = c; nu = slut
            case 84: // T
                guard let x = l.tal(), let y = l.tal() else { return p }
                let c: CGPoint
                if let f = forraKontroll, [81, 84].contains(forraKommando) { c = CGPoint(x: 2 * nu.x - f.x, y: 2 * nu.y - f.y) } else { c = nu }
                let slut = punkt(x, y)
                p.addQuadCurve(to: slut, control: c)
                forraKontroll = c; nu = slut
            case 65: // A
                guard let rx = l.tal(), let ry = l.tal(), let vinkel = l.tal(), let stor = l.flagga(), let svep = l.flagga(),
                      let x = l.tal(), let y = l.tal() else { return p }
                let slut = punkt(x, y)
                bage(&p, fran: nu, rx: rx, ry: ry, vinkel: vinkel, stor: stor, svep: svep, till: slut)
                nu = slut
                forraKontroll = nil
            case 90: // Z
                p.closeSubpath()
                nu = start
                forraKontroll = nil
            default:
                return p
            }
            forraKommando = k
        }
        return p
    }

    /// SVG-bågen som Bézierkurvor (SVG 1.1, bilaga F.6.5 och F.6.6).
    static func bage(_ p: inout Path, fran p0: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, vinkel: CGFloat, stor: Bool, svep: Bool, till p1: CGPoint) {
        if p0 == p1 { return }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { p.addLine(to: p1); return }
        let phi = vinkel * .pi / 180
        let cosP = cos(phi), sinP = sin(phi)
        let dx2 = (p0.x - p1.x) / 2, dy2 = (p0.y - p1.y) / 2
        let x1 = cosP * dx2 + sinP * dy2
        let y1 = -sinP * dx2 + cosP * dy2
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 { rx *= sqrt(lambda); ry *= sqrt(lambda) }
        let tal = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let namnare = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var faktor = namnare == 0 ? 0 : sqrt(max(0, tal / namnare))
        if stor == svep { faktor = -faktor }
        let cxp = faktor * rx * y1 / ry
        let cyp = -faktor * ry * x1 / rx
        let cx = cosP * cxp - sinP * cyp + (p0.x + p1.x) / 2
        let cy = sinP * cxp + cosP * cyp + (p0.y + p1.y) / 2

        func vinkelMellan(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        }
        let ux = (x1 - cxp) / rx, uy = (y1 - cyp) / ry
        let vx = (-x1 - cxp) / rx, vy = (-y1 - cyp) / ry
        let theta1 = vinkelMellan(1, 0, ux, uy)
        var delta = vinkelMellan(ux, uy, vx, vy)
        if !svep && delta > 0 { delta -= 2 * .pi }
        if svep && delta < 0 { delta += 2 * .pi }

        let antal = max(1, Int(ceil(abs(delta) / (.pi / 2) - 0.001)))
        let steg = delta / CGFloat(antal)
        let t = 4 / 3 * tan(steg / 4)
        func karta(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: cx + rx * x * cosP - ry * y * sinP, y: cy + rx * x * sinP + ry * y * cosP)
        }
        var theta = theta1
        for _ in 0..<antal {
            let c0 = cos(theta), s0 = sin(theta)
            let c1 = cos(theta + steg), s1 = sin(theta + steg)
            p.addCurve(to: karta(c1, s1), control1: karta(c0 - t * s0, s0 + t * c0), control2: karta(c1 + t * s1, s1 - t * c1))
            theta += steg
        }
    }

    /// Läser tal och flaggor ur en SVG-väg (även hopskrivna som `0-15.5-2` och `1.5.5`).
    struct Lasare {
        let b: [UInt8]
        var i = 0

        init(_ b: [UInt8]) { self.b = b }

        static func arBokstav(_ c: UInt8) -> Bool { (c >= 65 && c <= 90 || c >= 97 && c <= 122) && c != 101 && c != 69 }

        func titta() -> UInt8? { i < b.count ? b[i] : nil }
        mutating func steg() { i += 1 }

        mutating func hoppaOver() {
            while i < b.count, b[i] == 32 || b[i] == 44 || b[i] == 9 || b[i] == 10 || b[i] == 13 { i += 1 }
        }

        mutating func flagga() -> Bool? {
            hoppaOver()
            guard i < b.count, b[i] == 48 || b[i] == 49 else { return nil }
            defer { i += 1 }
            return b[i] == 49
        }

        mutating func tal() -> CGFloat? {
            hoppaOver()
            let start = i
            if i < b.count, b[i] == 43 || b[i] == 45 { i += 1 }
            var punkt = false, siffror = false
            while i < b.count {
                let c = b[i]
                if c >= 48 && c <= 57 { siffror = true; i += 1 }
                else if c == 46 && !punkt { punkt = true; i += 1 }
                else { break }
            }
            if i < b.count, b[i] == 101 || b[i] == 69 {
                var j = i + 1
                if j < b.count, b[j] == 43 || b[j] == 45 { j += 1 }
                if j < b.count, b[j] >= 48 && b[j] <= 57 {
                    i = j
                    while i < b.count, b[i] >= 48 && b[i] <= 57 { i += 1 }
                }
            }
            guard siffror, let s = String(bytes: b[start..<i], encoding: .ascii), let v = Double(s) else { i = start; return nil }
            return CGFloat(v)
        }
    }
}
