import Foundation
import Observation

/// AdRaze-kontot på telefonen: samma konto och samma API som datorns `main.js` (`auth:*`, rad 977–1068).
///
/// Inloggning: mejl + lösenord → `POST /auth/login` (`app: true`). Okänd enhet får en kod på mejlen →
/// `POST /auth/verify`. Svaret ger en sessionstoken och en enhetstoken (`enhet`) som gör att nästa inloggning
/// från samma telefon inte behöver någon kod (samma som datorn sparar). Båda ligger bara i Keychain.
/// Konto skapas med `POST /auth/signup` och glömt lösenord går via `/auth/forgot` + `/auth/reset`.
///
/// Google via `ASWebAuthenticationSession` väntar på en återhoppsadress från `accounts/app-google.js`
/// (se slutrapporten); knappen visas inte förrän den finns.
///
/// Ägare: Konto.
@MainActor
@Observable
final class Kontot: KontoTjanst {
    private(set) var konto: Kontouppgifter?
    private(set) var pro = false
    /// Profilbilden som data-URL (samma som `/me` ger datorn), `nil` = initialer.
    private(set) var avatar: String?
    /// Senaste kontrollen mot servern misslyckades för att nätet inte svarade (inloggningen finns kvar).
    private(set) var utanNat = false

    var arInloggad: Bool { konto != nil }

    @ObservationIgnored private let app: AppMiljo
    @ObservationIgnored private var sparadToken: String?
    @ObservationIgnored private let logg = Logg("Konto")
    @ObservationIgnored let server: KontoServer

    enum Nycklar {
        static let token = "konto.token"
        static let uppgifter = "konto.uppgifter"
        static let enhet = "konto.enhet"
    }

    init(app: AppMiljo) {
        self.app = app
        server = KontoServer(bas: KontoServer.bas(app))
        if let t = (try? Nyckelring.hamta(konto: Nycklar.token)).flatMap({ $0 }).flatMap({ String(data: $0, encoding: .utf8) }),
           !t.isEmpty {
            sparadToken = t
            konto = (try? Nyckelring.hamta(konto: Nycklar.uppgifter)).flatMap { $0 }
                .flatMap { try? JSONDecoder().decode(Kontouppgifter.self, from: $0) }
                ?? Kontouppgifter(id: "?", namn: nil, epost: nil)
        }
    }

    func token() async -> String? { sparadToken }

    // MARK: - In och ut

    enum Steg: Equatable {
        case klar
        /// En kod har skickats till mejlen. `syfte`: login, verify eller reset.
        case kod(epost: String, syfte: String)
    }

    /// Mejl och lösenord. Betrodd enhet: direkt inloggad. Annars `.kod`.
    func loggaIn(epost: String, losen: String) async throws -> Steg {
        var kropp: [String: Any] = ["email": epost, "password": losen, "app": true]
        if let e = enhetstoken { kropp["enhet"] = e }
        return try await svar(try await server.post("/auth/login", kropp), epost: epost)
    }

    func skapaKonto(namn: String, epost: String, losen: String) async throws -> Steg {
        try await svar(try await server.post("/auth/signup", ["email": epost, "password": losen, "namn": namn, "app": true]), epost: epost)
    }

    func verifiera(epost: String, kod: String) async throws {
        _ = try await svar(try await server.post("/auth/verify", ["email": epost, "code": kod, "app": true]), epost: epost)
    }

    func skickaNyKod(epost: String, syfte: String) async throws {
        _ = try await server.post("/auth/resend", ["email": epost, "syfte": syfte])
    }

    func glomtLosen(epost: String) async throws -> Steg {
        _ = try await server.post("/auth/forgot", ["email": epost])
        return .kod(epost: epost, syfte: "reset")
    }

    func nyttLosen(epost: String, kod: String, losen: String) async throws {
        _ = try await svar(try await server.post("/auth/reset", ["email": epost, "code": kod, "password": losen, "app": true]), epost: epost)
    }

    /// Hämtar `/me` (namn, mejl, Pro, bild). 401 = sessionen gäller inte längre: logga ut här.
    func uppdatera() async {
        guard let t = sparadToken else { return }
        do {
            let r = try await server.get("/me", token: t)
            utanNat = false
            if let me = r["me"] as? [String: Any] { tillampa(me) }
        } catch let f as KontoFel where f.status == 401 {
            logg.info("sessionen gäller inte längre, loggar ut på telefonen")
            await rensa()
        } catch {
            utanNat = true
            logg.varning("kunde inte hämta kontot: \(error.localizedDescription)")
        }
    }

    func loggaUt() async {
        // Som datorn: barnets session först (finns inte här än), sedan kontots. Felet spelar ingen roll.
        if let t = sparadToken { _ = try? await server.post("/auth/logout", [:], token: t) }
        await rensa()
    }

    // MARK: - Internt

    private var enhetstoken: String? {
        (try? Nyckelring.hamta(konto: Nycklar.enhet)).flatMap { $0 }.flatMap { String(data: $0, encoding: .utf8) }
    }

    private func svar(_ r: [String: Any], epost: String) async throws -> Steg {
        if (r["steg"] as? String) == "kod" {
            return .kod(epost: (r["email"] as? String) ?? epost, syfte: (r["syfte"] as? String) ?? "login")
        }
        guard let token = r["token"] as? String, !token.isEmpty else {
            throw KontoFel(meddelande: kt("Något gick fel. Försök igen."), status: 0)
        }
        if let e = r["enhet"] as? String, !e.isEmpty { try? Nyckelring.spara(Data(e.utf8), konto: Nycklar.enhet) }
        try Nyckelring.spara(Data(token.utf8), konto: Nycklar.token)
        sparadToken = token
        tillampa((r["me"] as? [String: Any]) ?? ["email": epost])
        logg.info("inloggad")
        app.handelser.skicka(KontoAndrades(inloggad: true))
        return .klar
    }

    private func tillampa(_ me: [String: Any]) {
        let epost = (me["email"] as? String) ?? konto?.epost
        let namn = (me["namn"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        // /me har inget id; mejlen är kontots nyckel på servern (unik), så den får vara id här.
        let ny = Kontouppgifter(id: (epost ?? konto?.id ?? "?").lowercased(), namn: namn, epost: epost, barn: false)
        if ny != konto { konto = ny }
        pro = (me["pro"] as? Bool) ?? pro
        if me.keys.contains("avatar") { avatar = me["avatar"] as? String }
        if let data = try? JSONEncoder().encode(ny) { try? Nyckelring.spara(data, konto: Nycklar.uppgifter) }
    }

    private func rensa() async {
        let var_inne = konto != nil
        sparadToken = nil
        konto = nil
        avatar = nil
        pro = false
        try? Nyckelring.radera(konto: Nycklar.token)
        try? Nyckelring.radera(konto: Nycklar.uppgifter)
        if var_inne {
            logg.info("utloggad")
            app.handelser.skicka(KontoAndrades(inloggad: false))
        }
    }
}

/// Ett fel från kontots API, med serverns text (svenska, översatt om ordlistan har den).
struct KontoFel: LocalizedError {
    let meddelande: String
    let status: Int
    var errorDescription: String? { meddelande }
}

/// HTTP mot `api.adraze.app` (eller `-api <adress>` i självtesterna mot en lokal testserver).
/// Inga kakor: allt går med `Authorization: Bearer`, som datorns huvudprocess. URLSession skickar ingen
/// `Origin`, så serverns ursprungsregel (POST med främmande Origin nekas) släpper igenom anropen.
@MainActor
final class KontoServer {
    let bas: URL
    private let session: URLSession

    static func bas(_ app: AppMiljo) -> URL {
        if let s = app.startargument.text("api"), let u = URL(string: s), u.scheme != nil { return u }
        return URL(string: "https://api.adraze.app")!
    }

    init(bas: URL) {
        self.bas = bas
        let k = URLSessionConfiguration.ephemeral
        k.httpCookieStorage = nil
        k.httpShouldSetCookies = false
        k.timeoutIntervalForRequest = 30
        k.waitsForConnectivity = false
        if bas.scheme == "http" { k.protocolClasses = [KontoLokalHTTP.self] }
        session = URLSession(configuration: k)
    }

    func post(_ sokvag: String, _ kropp: [String: Any], token: String? = nil) async throws -> [String: Any] {
        var r = URLRequest(url: bas.appendingPathComponent(String(sokvag.dropFirst())))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: kropp)
        return try await skicka(r, token: token)
    }

    func get(_ sokvag: String, token: String?) async throws -> [String: Any] {
        try await skicka(URLRequest(url: bas.appendingPathComponent(String(sokvag.dropFirst()))), token: token)
    }

    private func skicka(_ forfragan: URLRequest, token: String?) async throws -> [String: Any] {
        var r = forfragan
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let data: Data, svar: URLResponse
        do { (data, svar) = try await session.data(for: r) } catch {
            Logg("Konto").varning("nätfel \((error as NSError).domain) \((error as NSError).code): \(error.localizedDescription)")
            throw KontoFel(meddelande: kt("Kunde inte nå AdRaze. Kontrollera din uppkoppling och försök igen."), status: 0)
        }
        let status = (svar as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if status >= 200, status < 300, (json["ok"] as? Bool) != false { return json }
        let text = (json["message"] as? String) ?? (json["error"] as? String) ?? kt("Något gick fel. Försök igen.")
        throw KontoFel(meddelande: kt(text), status: status)
    }
}
