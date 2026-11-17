import Foundation

/// Filer som följer med appen. Allt under `App/<Modul>/Bunt/` kopieras in i appen som `<Modul>/` av skriptfasen
/// "Kopiera buntfiler" (`verktyg/kopiera-bunt.sh`), utan att någon behöver ändra `project.yml`:
///
///     App/Skydd/Bunt/listor/ads.json   ->   Bunt.url("Skydd", "listor/ads.json")
///     App/Webb/ui/chatt.html           ->   Bunt.url("Webb", "ui/chatt.html")
///
/// Ägare: Grund (Gemensamt).
enum Bunt {
    /// Appens resursmapp (`AdRaze.app/`).
    static var rot: URL { Bundle.main.resourceURL ?? Bundle.main.bundleURL }

    /// Mappen för en modul (`AdRaze.app/<Modul>/`). Finns inte om modulen saknar `Bunt/`.
    static func mapp(_ modul: String) -> URL { rot.appendingPathComponent(modul, isDirectory: true) }

    /// En fil i en moduls bunt, eller `nil` om den inte finns.
    static func url(_ modul: String, _ fil: String) -> URL? {
        let u = mapp(modul).appendingPathComponent(fil)
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
    }

    /// Filens innehåll, eller `nil` om den inte finns.
    static func data(_ modul: String, _ fil: String) -> Data? {
        url(modul, fil).flatMap { try? Data(contentsOf: $0) }
    }

    /// Filens innehåll som UTF-8-text, eller `nil` om den inte finns.
    static func text(_ modul: String, _ fil: String) -> String? {
        data(modul, fil).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Alla filer i en mapp i en moduls bunt (inte rekursivt), sorterade.
    static func filer(_ modul: String, _ mappnamn: String = "", filandelse: String? = nil) -> [URL] {
        let m = mappnamn.isEmpty ? mapp(modul) : mapp(modul).appendingPathComponent(mappnamn, isDirectory: true)
        let alla = (try? FileManager.default.contentsOfDirectory(at: m, includingPropertiesForKeys: nil)) ?? []
        return alla.filter { filandelse == nil || $0.pathExtension.lowercased() == filandelse!.lowercased() }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
}
