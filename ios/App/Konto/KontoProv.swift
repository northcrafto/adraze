import UIKit

/// Självtestet `-mode konto` mot en lokal testserver:
///
///     ./fran-mint.sh -n steg5-konto konto ~/adraze-app/skarm -- -api http://100.122.13.91:18790 -testkod 246810
///
/// Testservern är en kopia av `~/adraze-api` med fast kod för testkonton (aldrig produktion, inga riktiga mejl).
/// Kontot `ny@adraze.test` (lösenord `Testlosen-2026`) läggs in av testskriptet.
@MainActor
enum KontoProv {
    static let epost = "ny@adraze.test"
    static let losen = "Testlosen-2026"

    static func kor(_ k: Labbkorning) async throws {
        let app = k.app
        guard let kontot = app.konto as? Kontot else { k.fel = "Konto levererar inte app.konto"; return }
        guard app.startargument.text("api") != nil, let testkod = app.startargument.text("testkod") else {
            k.fel = "Testet behöver -api <lokal testserver> och -testkod (kör aldrig mot produktion)"
            return
        }
        k.notera("api", .text(kontot.server.bas.absoluteString))
        let lageFore = app.installningar.sparat("tema.lage")
        defer { _ = app.installningar.satt("tema.lage", lageFore, utanHistorik: true) }

        // Ingen inloggning och ingen betrodd enhet från förra körningen
        if kontot.arInloggad { await kontot.loggaUt() }
        try? Nyckelring.radera(konto: Kontot.Nycklar.enhet)
        let fore = await kontot.token()
        k.kolla("utloggad från början", !kontot.arInloggad && fore == nil)

        // Inloggningen, ljust och mörkt
        KontoArk.visa(app)
        try await k.vanta(1.2)
        await bada(k, "inloggning")

        // Fel lösenord ger serverns fel
        do {
            _ = try await kontot.loggaIn(epost: epost, losen: "fel-losenord")
            k.kolla("fel lösenord nekas", false)
        } catch let f as KontoFel {
            k.kolla("fel lösenord nekas", f.status == 401, ["text": .text(f.meddelande)])
        }

        // Rätt lösenord på en ny enhet: koden
        let steg = try await kontot.loggaIn(epost: epost, losen: losen)
        k.lika("ny enhet får en kod", steg, .kod(epost: epost, syfte: "login"))
        await stang()
        KontoArk.visa(app, start: .kod(epost: epost, syfte: "login"), epost: epost)
        try await k.vanta(1.2)
        await bada(k, "kod")

        // Fel kod
        do {
            try await kontot.verifiera(epost: epost, kod: "000000")
            k.kolla("fel kod nekas", false)
        } catch let f as KontoFel {
            k.kolla("fel kod nekas", f.status == 400, ["text": .text(f.meddelande)])
        }

        // Rätt kod: inloggad, token i Keychain, kontokortet visas
        let t0 = Date()
        try await kontot.verifiera(epost: epost, kod: testkod)
        k.notera("verifiera_ms", .tal((Date().timeIntervalSince(t0) * 1000).rounded()))
        k.kolla("inloggad efter koden", kontot.arInloggad)
        let token = await kontot.token()
        k.kolla("token finns", (token?.count ?? 0) >= 20)
        let iNyckelring = (try? Nyckelring.hamta(konto: Kontot.Nycklar.token)).flatMap { $0 }.flatMap { String(data: $0, encoding: .utf8) }
        k.kolla("token ligger i Keychain", iNyckelring == token)
        k.kolla("enhetstoken sparad", ((try? Nyckelring.hamta(konto: Kontot.Nycklar.enhet)).flatMap { $0 }?.count ?? 0) > 10)
        await kontot.uppdatera()
        k.lika("namnet från /me", kontot.konto?.namn, "Nora")
        k.lika("mejlen från /me", kontot.konto?.epost, epost)
        try await k.vanta(1.5)
        await bada(k, "kontokort")

        // Kanalen för andra moduler
        let status = try await app.brygga.anropa("konto:status", [], fran: BryggKalla(yta: "labb"))
        k.lika("konto:status inloggad", status["inloggad"].bool, true)

        // Utloggning: servern glömmer sessionen, telefonen tömmer Keychain
        await kontot.loggaUt()
        let efter = await kontot.token()
        k.kolla("utloggad", !kontot.arInloggad && efter == nil)
        k.kolla("token borta ur Keychain", ((try? Nyckelring.hamta(konto: Kontot.Nycklar.token)).flatMap { $0 }) == nil)
        do {
            _ = try await kontot.server.get("/me", token: token)
            k.kolla("gamla sessionen gäller inte", false)
        } catch let f as KontoFel {
            k.kolla("gamla sessionen gäller inte", f.status == 401)
        }

        // Betrodd enhet: nästa inloggning behöver ingen kod
        let igen = try await kontot.loggaIn(epost: epost, losen: losen)
        k.lika("betrodd enhet loggar in direkt", igen, .klar)
        await kontot.loggaUt()
        await stang()
    }

    /// Skärmbild i ljust och mörkt läge.
    static func bada(_ k: Labbkorning, _ namn: String) async {
        _ = k.app.installningar.satt("tema.lage", .text("ljust"), utanHistorik: true)
        try? await k.vanta(0.6)
        await k.skarmbild("\(namn)-ljust")
        _ = k.app.installningar.satt("tema.lage", .text("morkt"), utanHistorik: true)
        try? await k.vanta(0.6)
        await k.skarmbild("\(namn)-morkt")
    }

    static func stang() async {
        guard let k = KontoArk.topp(), k is KontoKontroller else { return }
        await withCheckedContinuation { c in k.dismiss(animated: false) { c.resume() } }
    }
}
