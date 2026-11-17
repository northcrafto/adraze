import Foundation
import UIKit

/// Falk, AdRazes AI-assistent, i appen: datorns Falk-panel (`krypto.html`, yta `falk`) som ark eller helskärm, med
/// datorns kanaler (`krypto:*`, `anpassa-falk:*`, `falk-inst:*`) gjorda native och öppna bara för yta `falk`.
///
/// Frågorna går till AdRazes server med kontots token (`FalkKlient`), aldrig direkt till en AI-tjänst. Text som
/// strömmar kommer till sidan bit för bit (`falk:strom`). Utan konto visar sidan en inloggningsvy (`falk:ios`,
/// `falk:lage`) och inloggningen går genom kontot (`konto:visa`).
///
/// Kanaler utöver datorns (bara yta `falk`):
/// - `falk:logga-in` – visar inloggningen (Konto).
/// - `falk:installningar` – Anpassa öppen på Falk.
/// - startdatan `falk:ios` – `{ lage: ok|utloggad|avstangd, last, barn, sprak, ordlista, fraga? }`.
/// - händelserna `falk:strom { d }`, `falk:lage { lage, last }` och `falk:toast { text }`.
///
/// Ägare: Falk.
@MainActor
final class Falk {
    private(set) static var delad: Falk?

    unowned let app: AppMiljo
    private var prenumerationer: [Prenumeration] = []
    /// Frågan som ska ställas när sidan har laddat (`visa(fraga:)`).
    private var vantandeFraga: String?
    private let logg = Logg("Falk")

    init(app: AppMiljo) {
        self.app = app
        Falk.delad = self
    }

    /// Gemener utan å, ä, ö och é (som datorns `fold` i anpassa-falk.js).
    nonisolated static func fold(_ s: String) -> String {
        s.lowercased().replacingOccurrences(of: "å", with: "a").replacingOccurrences(of: "ä", with: "a")
            .replacingOccurrences(of: "ö", with: "o").replacingOccurrences(of: "é", with: "e")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Visa och stäng

    /// Visar Falk (ark eller helskärm). `fraga` ställs direkt när sidan är klar.
    func visa(som lage: Sidlage = .ark, fraga: String? = nil) {
        if let fraga, !fraga.isEmpty {
            if FalkSida.falkVy() != nil {
                app.brygga.skicka("krypto-prefill", .text(fraga), till: .yta("falk"))
            } else {
                vantandeFraga = fraga
            }
        }
        if !app.sidor.visa("falk", fragment: nil, som: lage) {
            logg.varning("Falk gick inte att visa (saknas Brygga?)")
            vantandeFraga = nil
        }
    }

    func stang() { app.sidor.stang("falk") }

    /// En kort notis längst ner i Falk.
    func toast(_ text: String) {
        app.brygga.skicka("falk:toast", ["text": .text(text)], till: .yta("falk"))
    }

    // MARK: - Läget

    /// `ok`, `utloggad` eller `avstangd` (Falk av i Inställningar).
    func lage() -> String {
        if FalkFlik.falkAv(app) { return "avstangd" }
        return app.konto.arInloggad ? "ok" : "utloggad"
    }

    func skickaLage() {
        app.brygga.skicka("falk:lage", ["lage": .text(lage()), "last": .bool(app.installningar.arLast("falk.av"))], till: .yta("falk"))
    }

    /// Startdatan `falk:ios`.
    func iosData() -> JSONVarde {
        var o: [String: JSONVarde] = [
            "lage": .text(lage()),
            "last": .bool(app.installningar.arLast("falk.av")),
            "barn": .bool(app.installningar.arBarnlage()),
            "sprak": .text(Sprak.delad.kod),
            "ordlista": FalkSprak.ordlistaJSON,
            // Det Falk kan öppna i appen just nu (moduler som finns i bygget)
            "har": ["losenord": .bool(app.brygga.kanaler["pw:list"] != nil), "nedladdningar": .bool(app.brygga.kanaler["dl:list"] != nil)],
        ]
        if let f = vantandeFraga {
            o["fraga"] = .text(f)
            vantandeFraga = nil
        }
        return .objekt(o)
    }

    /// Det panelen behöver av Inställningar › Falk (datorns `falk-inst.js` `varden()`).
    func varden() -> JSONVarde {
        let inst = app.installningar
        func v(_ n: String) -> JSONVarde { inst.hamta("falk." + n) ?? .null }
        func en(_ x: JSONVarde, _ lista: [String], _ std: String) -> JSONVarde {
            if let s = x.text, lista.contains(s) { return .text(s) }
            return .text(std)
        }
        var farg = (v("accent").text ?? "").lowercased()
        if farg.range(of: "^#[0-9a-f]{6}$", options: .regularExpression) == nil { farg = "#ff4b1f" }
        return ["av": .bool(FalkFlik.falkAv(app)), "accent": .text(farg),
                "text": en(v("text"), ["liten", "normal", "stor"], "normal"),
                "svar": en(v("svar"), ["kort", "normal", "utforlig"], "normal"),
                "halsning": .bool(v("halsning").bool != false), "tankord": .bool(v("tankord").bool != false)]
    }

    // MARK: - Kanalerna

    func registrera() {
        let b = app.brygga
        let falk: Set<String> = ["falk"]

        b.startdata("falk-inst:alla") { [unowned self] _ in self.varden() }
        b.startdata("falk:ios") { [unowned self] kalla in
            guard kalla.yta == "falk" else { return .null }
            FalkSida.forbered(kalla)
            return self.iosData()
        }

        b.hantera("krypto:chat", ytor: falk) { [unowned self] anrop in
            FalkSida.sakerstall(anrop.kalla)
            return await self.chatta(anrop)
        }
        b.hantera("krypto:kvot", ytor: falk) { [unowned self] anrop in
            FalkSida.sakerstall(anrop.kalla)
            return await self.kvot()
        }
        b.hantera("krypto:me", ytor: falk) { [unowned self] anrop in
            FalkSida.sakerstall(anrop.kalla)
            return await self.jag()
        }
        b.hantera("krypto:samtycke", ytor: falk) { [unowned self] anrop in
            if let v = anrop.arg(0).bool { self.app.installningar.satt("webb.falkSamtycke", .bool(v)) }
            return .bool(FalkFlik.samtycke(self.app))
        }
        b.hantera("krypto:tab", ytor: falk) { [unowned self] anrop in
            FalkSida.sakerstall(anrop.kalla)
            return FalkFlik.tab(self.app)
        }
        b.hantera("krypto:page", ytor: falk) { [unowned self] _ in await FalkFlik.sida(self.app) }
        b.hantera("krypto:act", ytor: falk) { [unowned self] anrop in await FalkFlik.gor(self.app, anrop.arg(0)) }
        b.hantera("krypto:action", ytor: falk) { [unowned self] anrop in
            await FalkHandlingar.gor(self.app, anrop.arg(0))
            return .null
        }
        b.hantera("anpassa-falk:lista", ytor: falk) { [unowned self] _ in FalkAnpassa.lista(self.app) }
        b.hantera("anpassa-falk:gor", ytor: falk) { [unowned self] anrop in await FalkAnpassa.gor(self.app, anrop.arg(0)) }
        b.hantera("falk:logga-in", ytor: falk) { [unowned self] _ in await self.loggaIn() }
        b.hantera("falk:installningar", ytor: falk) { [unowned self] _ in
            self.app.sidor.visa("anpassa", fragment: "krypto", som: .ark)
            return .null
        }

        prenumerationer.append(app.handelser.lyssna(InstallningAndrad.self) { [unowned self] h in
            guard h.nyckel.hasPrefix("falk.") else { return }
            self.app.brygga.skicka("falk-inst:andrad", self.varden(), till: .yta("falk"))
            if h.nyckel == "falk.av" { self.skickaLage() }
        })
        prenumerationer.append(app.handelser.lyssna(KontoAndrades.self) { [unowned self] _ in self.skickaLage() })
        prenumerationer.append(app.handelser.lyssna(AppFasAndrad.self) { [unowned self] h in
            guard h.fas != .inaktiv else { return }
            self.app.brygga.skicka("krypto-synlig", .bool(h.fas == .aktiv), till: .yta("falk"))
        })
    }

    // MARK: - Frågan

    /// `krypto:chat`, som datorns `ipcMain.handle('krypto:chat')`, med strömmande text till sidan.
    func chatta(_ anrop: BryggAnrop) async -> JSONVarde {
        if FalkFlik.falkAv(app) { return ["ok": false, "message": "Falk är avstängd. Slå på den under Inställningar › Falk."] }
        if !FalkFlik.samtycke(app) {
            return ["ok": false, "samtycke": true, "message": "Godkänn först att Falk får skicka till AI-tjänsten."]
        }
        guard let token = await app.konto.token() else {
            return ["ok": false, "needLogin": true, "message": "Logga in för att använda Falk."]
        }
        let opts = anrop.arg(1)
        var payload: [String: JSONVarde] = ["messages": .lista(Array((anrop.arg(0).lista ?? []).suffix(16)))]
        if opts["flik"].bool == true { payload["flik"] = true }
        if let m = opts["modell"].text, m == "qwen" || m == "deepseek" { payload["modell"] = .text(m) }
        let strom = FalkStrom(app: app, mal: anrop.kalla.webbvy.map { BryggMal.webbvy($0) } ?? .yta("falk"))

        for forsok in 1...2 {
            do {
                let (status, j) = try await FalkKlient.chatta(.objekt(payload), app: app, token: token) { strom.lagg($0) }
                strom.tom()
                if status == 401 { return ["ok": false, "needLogin": true, "message": "Logga in igen för att använda Falk."] }
                guard (200..<300).contains(status), j["ok"].bool == true else {
                    logg.info("krypto:chat status \(status) \(j["error"].text ?? "")")
                    var ut: [String: JSONVarde] = ["ok": false, "error": j["error"],
                                                   "message": .text(j["message"].text ?? j["error"].text ?? "Något gick fel. Försök igen om en stund.")]
                    if j["kvot"].objekt != nil { ut["kvot"] = j["kvot"] }
                    return .objekt(ut)
                }
                var ut: [String: JSONVarde] = [
                    "ok": true, "reply": .text(j["reply"].text ?? ""),
                    "sources": .lista(Array((j["sources"].lista ?? []).prefix(6))),
                    "actions": .lista(Array((j["actions"].lista ?? []).prefix(3))),
                ]
                if j["kvot"].objekt != nil { ut["kvot"] = j["kvot"] }
                if let m = j["modell"].text { ut["modell"] = .text(m) }
                if let u = j["uppgradera"].text { ut["uppgradera"] = .text(u) }
                return .objekt(ut)
            } catch {
                strom.tom()
                logg.info("krypto:chat försök \(forsok): \(error.localizedDescription)")
                // En gång till efter en kort paus, men bara om inget hunnit strömma till sidan
                if forsok == 2 || strom.harSkickat { break }
                try? await Task.sleep(nanoseconds: 800_000_000)
            }
        }
        return ["ok": false, "message": "Kunde inte nå Falk just nu. Kontrollera din uppkoppling och försök igen."]
    }

    /// `krypto:kvot`: gratis 50 000 tokens och 2 webbsökningar per 14 dagar, Pro mer. `null` utan konto.
    func kvot() async -> JSONVarde {
        guard !FalkFlik.falkAv(app), let token = await app.konto.token(),
              let svar = try? await FalkKlient.hamta("falk/kvot", app: app, token: token, tid: 10),
              (200..<300).contains(svar.0), svar.1["kvot"].objekt != nil else { return .null }
        return svar.1["kvot"]
    }

    /// `krypto:me`: namnet i hälsningen.
    func jag() async -> JSONVarde {
        guard let token = await app.konto.token() else { return ["name": ""] }
        if let svar = try? await FalkKlient.hamta("me", app: app, token: token, tid: 10), svar.1["ok"].bool == true,
           let n = svar.1["me"]["namn"].text, !n.isEmpty {
            return ["name": .text(n)]
        }
        // Servern svarade inte: förnamnet från kontot
        let namn = app.konto.konto?.namn?.split(separator: " ").first.map(String.init) ?? ""
        return ["name": .text(namn)]
    }

    /// `falk:logga-in`: kontots inloggning (Konto), annars Anpassa › Konto.
    func loggaIn() async -> JSONVarde {
        let b = app.brygga
        if b.kanaler["konto:visa"] != nil {
            do {
                _ = try await b.anropa("konto:visa", [], fran: BryggKalla(yta: "falk"))
                return ["ok": true]
            } catch {
                logg.varning("konto:visa: \(error.localizedDescription)")
            }
        }
        if b.kanaler["auth:session"] != nil, app.sidor.visa("anpassa", fragment: "konto", som: .ark) { return ["ok": true] }
        return ["ok": false, "message": .text(ft("Inloggningen finns inte i appen än."))]
    }
}

/// Text som strömmar från servern, till sidan i bitar ungefär var 40:e ms (inte ett anrop per ord).
@MainActor
final class FalkStrom {
    private let app: AppMiljo
    private let mal: BryggMal
    private var buffert = ""
    private var vantar = false
    private(set) var harSkickat = false

    init(app: AppMiljo, mal: BryggMal) {
        self.app = app
        self.mal = mal
    }

    func lagg(_ t: String) {
        buffert += t
        guard !vantar else { return }
        vantar = true
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 40_000_000)
            self?.tom()
        }
    }

    func tom() {
        vantar = false
        guard !buffert.isEmpty else { return }
        app.brygga.skicka("falk:strom", ["d": .text(buffert)], till: mal)
        buffert = ""
        harSkickat = true
    }
}
