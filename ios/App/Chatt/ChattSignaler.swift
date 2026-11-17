import AVFoundation
import Foundation

/// Signaler per chatt. Ljuden räknas fram i appen (som datorns `playPling` i `chatt.js`, en triangelvåg
/// 880 → 660 Hz) och sparas som WAV i `Library/Sounds`, där `UNNotificationSound(named:)` hittar dem när
/// aviseringarna byggs (Notistillagg, senare steg). Här kan man redan välja och lyssna.
@MainActor
enum ChattSignaler {
    struct Signal: Identifiable, Hashable { let id: String; let namn: String }

    static var alla: [Signal] {
        [Signal(id: "standard", namn: ct("Pling")), Signal(id: "droppe", namn: ct("Droppe")),
         Signal(id: "klocka", namn: ct("Klocka")), Signal(id: "dubbel", namn: ct("Dubbelpling")),
         Signal(id: "ingen", namn: ct("Ingen"))]
    }

    static func namn(_ id: String) -> String { alla.first { $0.id == id }?.namn ?? ct("Pling") }

    private static var spelare: AVAudioPlayer?

    /// Spelar signalen en gång (förhandslyssning i chattinfo). Följer ljudlösa läget.
    static func spela(_ id: String) {
        guard id != "ingen", let u = fil(id) else { return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        spelare = try? AVAudioPlayer(contentsOf: u)
        spelare?.volume = 0.8
        spelare?.play()
    }

    /// Filen i `Library/Sounds` (skapas första gången).
    static func fil(_ id: String) -> URL? {
        guard let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return nil }
        let mapp = lib.appendingPathComponent("Sounds", isDirectory: true)
        let u = mapp.appendingPathComponent("adraze-chatt-\(id).wav")
        if FileManager.default.fileExists(atPath: u.path) { return u }
        try? FileManager.default.createDirectory(at: mapp, withIntermediateDirectories: true)
        guard let wav = rakna(id) else { return nil }
        return (try? wav.write(to: u, options: .atomic)) != nil ? u : nil
    }

    /// 16-bitars mono-WAV, 44,1 kHz.
    static func rakna(_ id: String) -> Data? {
        let fs = 44_100.0
        var prov: [Double] = []
        func ton(_ start: Double, _ langd: Double, _ f0: Double, _ f1: Double, _ styrka: Double, triangel: Bool, overton: Double = 0) {
            let n0 = Int(start * fs), n = Int(langd * fs)
            if prov.count < n0 + n { prov += Array(repeating: 0, count: n0 + n - prov.count) }
            var fas = 0.0
            for i in 0..<n {
                let t = Double(i) / fs
                let f = f0 * pow(f1 / f0, min(1, t / max(0.001, langd * 0.5)))
                fas += 2 * .pi * f / fs
                let v = triangel ? (2 / .pi) * asin(sin(fas)) : sin(fas) + overton * sin(fas * 1.5)
                let anslag = min(1, t / 0.012)
                let avklang = exp(-t * (4.2 / langd))
                prov[n0 + i] += v * styrka * anslag * avklang
            }
        }
        switch id {
        case "standard": ton(0, 0.38, 880, 660, 0.55, triangel: true)
        case "droppe": ton(0, 0.2, 1320, 520, 0.6, triangel: false)
        case "klocka": ton(0, 0.9, 1046.5, 1046.5, 0.35, triangel: false, overton: 0.45)
        case "dubbel": ton(0, 0.18, 988, 880, 0.5, triangel: true); ton(0.16, 0.3, 1175, 988, 0.5, triangel: true)
        default: return nil
        }
        var pcm = Data(capacity: prov.count * 2)
        for v in prov {
            var s = Int16(max(-1, min(1, v)) * 32_000).littleEndian
            withUnsafeBytes(of: &s) { pcm.append(contentsOf: $0) }
        }
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
        d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + pcm.count)); d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(44_100); u32(88_200); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(UInt32(pcm.count))
        d.append(pcm)
        return d
    }
}
