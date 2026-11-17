import Darwin
import Foundation

/// Var tiden går när appen startar: namngivna märken i ms från att processen startade (kärnans starttid för
/// processen, inte när Swift-koden började köra, så att även dyld och UIKit räknas). Varje namn sparas bara första
/// gången. Röktestet skriver ut alla märken (`kallstart_ms`).
///
///     Starttider.markera("startsida_klar")
///
/// `stopp` är de gånger huvudtråden var upptagen mer än 120 ms under starten (`vaktaHuvudtraden()`).
///
/// Märkena i appen: `appmiljo` (AppMiljo skapas), `moduler_registrerade`, `forsta_ritning` (RotVy syns),
/// `moduler_startade`, och för AdRaze-sidorna (Brygga) `<yta>_skapad`, `_webbvy`, `_navigering`, `_startdata`,
/// `_commit`, `_fardig`, `_klar` och `_synlig` (när framtoningen är klar).
///
/// Ägare: Grund (Gemensamt).
@MainActor
enum Starttider {
    /// När processen startade enligt kärnan (`sysctl` för den egna processen), annars när den här koden först kördes.
    nonisolated static let processStart: Date = {
        var info = kinfo_proc()
        var storlek = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, u_int(mib.count), &info, &storlek, nil, 0) == 0, storlek > 0 else { return Date() }
        let t = info.kp_proc.p_un.__p_starttime
        guard t.tv_sec > 0 else { return Date() }
        return Date(timeIntervalSince1970: Double(t.tv_sec) + Double(t.tv_usec) / 1_000_000)
    }()

    private(set) static var marken: [(namn: String, ms: Double)] = []

    /// Millisekunder sedan processen startade.
    static var nu: Double { (Date().timeIntervalSince(processStart) * 1000).rounded() }

    static func markera(_ namn: String) {
        guard !marken.contains(where: { $0.namn == namn }) else { return }
        marken.append((namn, nu))
    }

    static func ms(_ namn: String) -> Double? { marken.first { $0.namn == namn }?.ms }

    /// Huvudtrådens stopp under starten: när den var upptagen mer än 120 ms i sträck (från ms, längd ms).
    private(set) static var stopp: [(fran: Double, ms: Double)] = []

    /// Startar vakten (AppMiljo): en timer på huvudtråden var 20:e ms de första 10 sekunderna. Kommer den mer än
    /// 120 ms för sent var huvudtråden upptagen så länge, och då väntar också allt annat där (WebKits anrop,
    /// SwiftUI). Första gången räknas inte (tiden innan körslingan startade).
    static func vaktaHuvudtraden() {
        let t = Timer(timeInterval: 0.02, repeats: true) { timer in
            MainActor.assumeIsolated {
                let n = nu
                if let f = forraTick, n - f > 120 { stopp.append((f, n - f)) }
                forraTick = n
                if n > 10_000 { timer.invalidate() }
            }
        }
        RunLoop.main.add(t, forMode: .common)
    }

    private static var forraTick: Double?

    /// Alla märken i den ordning de kom, som JSON (`{"namn": ms}`) och som rader (`"  812 startsida_klar"`).
    static var json: JSONVarde { .objekt(Dictionary(marken.map { ($0.namn, JSONVarde.tal($0.ms)) }, uniquingKeysWith: { a, _ in a })) }
    static var rader: [String] { marken.map { String(format: "%6.0f %@", $0.ms, $0.namn) } }
}
