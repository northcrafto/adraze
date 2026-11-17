import Observation
import SwiftUI
import UIKit
import WebKit

/// Arken som glider upp nerifrån.
enum Ark: String, Identifiable {
    case bokmarken, historik, nedladdningar, skydd
    var id: String { rawValue }
}

/// En kort notis längst ner (datorns `toast`: mörk, 13 pt halvfet, 2,2 s).
struct Notis: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let ikon: Ikon?
}

/// Ett val i en snabbmeny (långt tryck på bakåt, framåt och flikknappen).
struct Snabbval: Identifiable {
    let id = UUID()
    let titel: String
    var undertitel: String?
    var ikon: Ikon?
    var monogram: String?
    var farlig = false
    let gor: @MainActor () -> Void
}

/// En snabbmeny som poppar upp vid en knapp.
struct Snabbmeny: Identifiable {
    let id = UUID()
    var rubrik: String?
    let val: [Snabbval]
    /// Knappens ram i fönstret.
    let ankare: CGRect
}

/// En plats i menyn som visas som ark (Anpassa, Falk, chatten).
struct Platsark: Identifiable {
    let id: String
}

/// Zoomen mellan sidan och flikens kort i flikväxlaren.
struct Hjalte: Equatable {
    let id = UUID()
    let flik: UUID
    let bild: UIImage
    var fran: CGRect
    var till: CGRect
    /// Mot kortet (öppnar) eller mot sidan (stänger).
    let mot: Riktning
    var framme = false

    enum Riktning { case kort, sida }
}

/// Allt skalet håller i: vad som är öppet, vad som skrivs, miniatyrer och läget för raderna.
/// Vyerna läser och ändrar det här, och självtestet styr skalet genom samma metoder som knapparna.
///
/// Ägare: Skal.
@MainActor
@Observable
final class SkalLage {
    @ObservationIgnored unowned let app: AppMiljo
    let forslag: Sokforslag
    @ObservationIgnored private let logg = Logg("Skal")

    init(app: AppMiljo) {
        self.app = app
        self.forslag = Sokforslag(app: app)
    }

    /// Historiken, bokmärkena och nedladdningarna (Flikars, `app.bibliotek`).
    var bibliotek: any Bibliotekstjanst { app.bibliotek }

    // MARK: - Läget

    /// Adressfältet är öppet för att skriva.
    private(set) var redigerar = false
    /// Det som står i fältet medan man skriver (ändras med `skriv(_:)`, som också hämtar förslag).
    private(set) var text = ""
    /// Fältet visar fortfarande sidans adress, orörd (inga förslag än).
    private(set) var orord = true
    /// Flikväxlaren är öppen.
    private(set) var vaxlareOppen = false
    /// Flikväxlaren visar privata flikar.
    var vaxlarePrivat = false
    /// Zoomen till eller från flikväxlaren.
    var hjalte: Hjalte?
    /// Menyn är öppen.
    private(set) var menyOppen = false
    /// Mitten av menyknappen när menyn öppnades (cirkelns medelpunkt).
    private(set) var menyCentrum: CGPoint = .zero
    /// Raderna är ihopfällda (man scrollar nedåt på sidan).
    private(set) var kompakt = false
    /// Webbytan har kompakta mått (byts utan animation, se `satt(kompakt:)`).
    private(set) var webbKompakt = false
    /// Hur långt man drar sidan nedåt i toppen (pt), för att ladda om.
    var drag: CGFloat = 0
    /// Ett ark som visas.
    var ark: Ark?
    /// Notisen som visas.
    private(set) var notis: Notis?
    /// Snabbmenyn som visas.
    var snabbmeny: Snabbmeny?
    /// Flikbyte med svep på adressfältet: hur långt fältet har flyttats.
    var faltSvep: CGFloat = 0
    /// Bekräftelse innan alla flikar stängs.
    var fragaStangAlla = false
    /// En plats (Anpassa, Falk, chatten) som visas.
    var plats: Platsark?

    /// Sidans egen färg (`theme-color`, annars bakgrunden) för statusraden.
    private(set) var sidfarg: UIColor?

    func sattSidfarg(_ f: UIColor?) {
        if f != sidfarg { sidfarg = f }
    }

    /// Bilder av den aktiva flikens sida, tagna precis när flikväxlaren öppnas (färskare än flikens egen
    /// miniatyr, som Flikar tar när fliken lämnas och efter laddning). Övriga flikar visar `flik.miniatyr`.
    private(set) var miniatyrer: [UUID: UIImage] = [:]

    /// Bilden som flikväxlaren visar för en flik.
    func miniatyr(_ f: any Flik) -> UIImage? {
        if f.id == app.flikar.aktivId, let b = miniatyrer[f.id] { return b }
        return f.miniatyr ?? miniatyrer[f.id]
    }

    // Ramar i fönstret (rapporteras av vyerna, läses bara när något öppnas).
    @ObservationIgnored var webbram: CGRect = .zero
    @ObservationIgnored var menyknapp: CGRect = .zero
    @ObservationIgnored var flikknapp: CGRect = .zero
    @ObservationIgnored var delaknapp: CGRect = .zero
    @ObservationIgnored var kortramar: [UUID: CGRect] = [:]
    @ObservationIgnored var bakatknapp: CGRect = .zero
    @ObservationIgnored var framatknapp: CGRect = .zero
    /// Webbytans förskjutning när den kompakta raden byter mått i toppen (läses av Webbyta när måtten bytts).
    @ObservationIgnored var vantandeForskjutning: CGFloat = 0
    @ObservationIgnored private var forskjutningsomgang = 0
    /// Hur mycket webbytans topp flyttas när raderna fälls ihop (bara med raden uppe; sätts av SkalVy).
    @ObservationIgnored var toppDelta: CGFloat = 0
    @ObservationIgnored private var notisuppgift: Task<Void, Never>?

    @ObservationIgnored var adressram: CGRect = .zero

    // Självtestet
    /// Antal stoppade som visas i skölden i stället för skyddets (självtestet visar räknaren innan Skydd finns).
    var provBlockerade: Int?
    /// Textstorlek som tvingas på skalet (självtestet visar stor text).
    var provTextstorlek: DynamicTypeSize?
    /// En vy som visas över allt (självtestets accentkarta).
    var provVy: AnyView?

    // MARK: - Flikarna

    var aktiv: (any Flik)? { app.flikar.aktiv }
    var arPrivat: Bool { aktiv?.privat ?? false }

    /// Flikarna i samma grupp som `privat`, i hanterarens ordning.
    func flikar(privat: Bool) -> [any Flik] { app.flikar.flikar.filter { $0.privat == privat } }

    /// Byter till grannfliken i samma grupp (svep på adressfältet). Förbi sista fliken öppnas en ny.
    @discardableResult
    func bytFlik(_ steg: Int) -> Bool {
        guard let nu = aktiv else { return false }
        let grupp = flikar(privat: nu.privat)
        guard let i = grupp.firstIndex(where: { $0.id == nu.id }) else { return false }
        let j = i + steg
        if j >= grupp.count {
            if arTomAdress(nu.url) { return false }
            fotografera()
            Haptik.latt()
            app.flikar.nyFlik(nil, privat: nu.privat, aktivera: true)
            borjaRedigera()
            return true
        }
        guard j >= 0 else { return false }
        fotografera()
        Haptik.latt()
        app.flikar.aktivera(grupp[j].id)
        expandera()
        return true
    }

    /// En ny flik (tom), med adressfältet öppet för att skriva.
    func nyFlik(privat: Bool) {
        fotografera()
        app.flikar.nyFlik(nil, privat: privat, aktivera: true)
        if vaxlareOppen { vaxlareOppen = false; hjalte = nil }
        stangMeny()
        borjaRedigera()
    }

    func stang(_ id: UUID) {
        Haptik.latt()
        let varAktiv = app.flikar.aktivId == id
        let privat = app.flikar.flik(id)?.privat ?? false
        app.flikar.stang(id)
        miniatyrer[id] = nil
        // Stängdes den aktiva fliken: välj en annan i samma grupp om det finns.
        if varAktiv, let annan = flikar(privat: privat).last, app.flikar.aktivId != annan.id {
            app.flikar.aktivera(annan.id)
        }
    }

    func stangAlla(privat: Bool) {
        Haptik.medel()
        for f in flikar(privat: privat) { stang(f.id) }
        fragaStangAlla = false
        if !privat, flikar(privat: false).isEmpty { app.flikar.nyFlik(nil, privat: false, aktivera: true) }
    }

    // MARK: - Adressfältet

    /// Det man skriver i fältet.
    func skriv(_ ny: String) {
        guard ny != text else { return }
        text = ny
        orord = false
        forslag.sok(ny, privat: arPrivat)
    }

    func borjaRedigera() {
        stangMeny()
        snabbmeny = nil
        let u = aktiv?.url
        text = arTomAdress(u) ? "" : (u?.absoluteString ?? "")
        orord = true
        forslag.rensa()
        forslag.kollaUrklipp()
        medRorelse(Rorelse.fjader) {
            kompakt = false
            redigerar = true
        }
        utanRorelse { webbKompakt = false }
    }

    func avbrytRedigering() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        medRorelse(Rorelse.fjader) { redigerar = false }
        forslag.rensa()
    }

    /// Går till det som står i fältet (eller ett förslag).
    func ga(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { avbrytRedigering(); return }
        if let f = aktiv {
            f.ladda(text: t)
        } else if let u = Webbadress.tolka(t, installningar: app.installningar) {
            app.flikar.nyFlik(u, privat: false, aktivera: true)
        }
        avbrytRedigering()
    }

    func ga(till url: URL) {
        if let f = aktiv { f.ladda(url) } else { app.flikar.nyFlik(url, privat: false, aktivera: true) }
        avbrytRedigering()
        ark = nil
    }

    /// Klistrar in och går (förslaget överst när urklippet har text).
    func klistraInOchGa() {
        guard let s = UIPasteboard.general.string, !s.isEmpty else { return }
        ga(s)
    }

    // MARK: - Raderna

    /// Fäller ihop eller fäller ut raderna. Webbytan byter mått utan animation så att sidan inte hoppar:
    /// när raderna fälls ihop blir den större direkt (raderna glider undan ovanpå), när de fälls ut blir den
    /// mindre först när raderna är på plats.
    func satt(kompakt ny: Bool) {
        guard ny != kompakt else { return }
        if ny && (redigerar || vaxlareOppen || menyOppen) { return }
        if ny {
            forskjut(-toppDelta)
            utanRorelse { webbKompakt = true }
            medRorelse(Rorelse.fjader) { kompakt = true }
        } else {
            medRorelse(Rorelse.fjader) { kompakt = false }
            efter(0.36) { [weak self] in
                guard let self, !self.kompakt, self.webbKompakt else { return }
                self.forskjut(self.toppDelta)
                utanRorelse { self.webbKompakt = false }
            }
        }
    }

    /// Förskjutningen gäller bara måttbytet som kommer direkt efter; blir det inget får den inte ligga kvar
    /// till ett senare byte (t.ex. när telefonen vrids).
    private func forskjut(_ d: CGFloat) {
        vantandeForskjutning = d
        forskjutningsomgang += 1
        let omgang = forskjutningsomgang
        efter(0.5) { [weak self] in
            if let self, self.forskjutningsomgang == omgang { self.vantandeForskjutning = 0 }
        }
    }

    func expandera() { satt(kompakt: false) }

    // MARK: - Flikväxlaren

    func oppnaVaxlare() {
        guard !vaxlareOppen else { return }
        stangMeny()
        snabbmeny = nil
        if redigerar { avbrytRedigering() }
        let id = aktiv?.id
        let bild = fotografera(skala: 2)
        vaxlarePrivat = arPrivat
        kortramar = [:]
        if let id, let bild, !Rorelse.minskad, webbram.width > 10 {
            let h = Hjalte(flik: id, bild: bild, fran: webbram, till: webbram, mot: .kort)
            hjalte = h
            // Om kortet aldrig mäts upp (t.ex. tom grupp) får bilden inte bli kvar.
            efter(0.6) { [weak self] in
                if let self, self.hjalte?.id == h.id, self.hjalte?.framme == false { self.hjalte = nil }
            }
        } else {
            hjalte = nil
        }
        medRorelse(Rorelse.mjuk) { vaxlareOppen = true }
    }

    /// Kortet har mätts upp: zooma dit.
    func hjalteFramme(kort: CGRect) {
        guard var h = hjalte, h.mot == .kort, !h.framme else { return }
        guard Self.sammaForm(h.fran, kort) else { hjalte = nil; return }
        h.till = kort
        hjalte = h
        withAnimation(Rorelse.fjader) { hjalte?.framme = true }
        let id = h.id
        efter(0.42) { [weak self] in
            if self?.hjalte?.id == id { self?.hjalte = nil }
        }
    }

    /// Sant när två rutor har nästan samma form (zoomen skalar bara, så bilden får inte bli skev).
    static func sammaForm(_ a: CGRect, _ b: CGRect) -> Bool {
        guard a.height > 1, b.height > 1, a.width > 1, b.width > 1 else { return false }
        return abs((a.width / a.height) / (b.width / b.height) - 1) < 0.12
    }

    /// Stänger flikväxlaren, och byter till `id` om den anges. Zoomar från kortet till sidan.
    func stangVaxlare(valj id: UUID? = nil) {
        guard vaxlareOppen else { return }
        if let id, id != app.flikar.aktivId { Haptik.latt(); app.flikar.aktivera(id) }
        let mal = id ?? app.flikar.aktivId
        if let mal, let kort = kortramar[mal], let f = app.flikar.flik(mal), let bild = miniatyr(f), !Rorelse.minskad, webbram.width > 10,
           Self.sammaForm(kort, webbram) {
            hjalte = Hjalte(flik: mal, bild: bild, fran: kort, till: webbram, mot: .sida)
            withAnimation(Rorelse.fjader) { hjalte?.framme = true }
            let hid = hjalte?.id
            efter(0.4) { [weak self] in
                if self?.hjalte?.id == hid { self?.hjalte = nil }
            }
        } else {
            hjalte = nil
        }
        medRorelse(Rorelse.mjuk) { vaxlareOppen = false }
        expandera()
    }

    // MARK: - Menyn

    func oppnaMeny() {
        guard !menyOppen else { return }
        if redigerar { avbrytRedigering() }
        snabbmeny = nil
        menyCentrum = CGPoint(x: menyknapp.midX, y: menyknapp.midY)
        menyOppen = true
    }

    func stangMeny() {
        guard menyOppen else { return }
        menyOppen = false
    }

    /// Öppnar en plats som en annan del av appen har fyllt, annars en notis om att den kommer.
    /// En plats ur menyn (Anpassa, Falk, Chatt): modulen visar den själv, eller skalet visar dess vy i ett ark.
    func oppnaPlats(_ namn: String) {
        guard let p = app.platser[namn] else {
            notis(tr("Kommer snart"), ikon: .gnista)
            return
        }
        if let oppna = p.oppna {
            // Menyn stängs först, så att arket inte visas ovanpå cirkeln.
            let varOppen = menyOppen
            if varOppen { stangMeny() }
            efter(varOppen ? 0.3 : 0) { oppna() }
        } else {
            plats = Platsark(id: namn)
        }
    }

    /// `SkalVisa` från en annan modul (självtest, genvägar).
    func visa(_ yta: SkalVisa.Yta) {
        switch yta {
        case .flikvaxlare: oppnaVaxlare()
        case .meny: oppnaMeny()
        case .plats(let namn): oppnaPlats(namn)
        case .inget:
            stangMeny()
            stangVaxlare()
            snabbmeny = nil
            ark = nil
            plats = nil
        }
    }

    // MARK: - Notiser

    func notis(_ text: String, ikon: Ikon? = nil) {
        notisuppgift?.cancel()
        medRorelse(Rorelse.pop) { notis = Notis(text: text, ikon: ikon) }
        notisuppgift = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            guard !Task.isCancelled else { return }
            medRorelse(.easeOut(duration: 0.25)) { self?.notis = nil }
        }
    }

    // MARK: - Miniatyrer

    /// Fotograferar den aktiva flikens sida (synkront, ur det som redan visas) och sparar miniatyren.
    @discardableResult
    func fotografera(skala: CGFloat = 1.5) -> UIImage? {
        guard let f = aktiv, !arTomAdress(f.url) else { return nil }
        let vy = f.webbvy
        guard vy.window != nil, vy.bounds.width > 10, vy.bounds.height > 10 else { return miniatyrer[f.id] }
        let format = UIGraphicsImageRendererFormat()
        format.scale = skala
        format.opaque = true
        let bild = UIGraphicsImageRenderer(bounds: vy.bounds, format: format).image { _ in
            _ = vy.drawHierarchy(in: vy.bounds, afterScreenUpdates: false)
        }
        miniatyrer[f.id] = bild
        if miniatyrer.count > 30 {
            let levande = Set(app.flikar.flikar.map(\.id))
            miniatyrer = miniatyrer.filter { levande.contains($0.key) }
        }
        return bild
    }

    // MARK: - Sidan

    var arSkrivbord: Bool { aktiv?.skrivbordslage ?? false }

    /// Skrivbordsversion av sidan (Flikar byter användaragent och innehållsläge och laddar om).
    func vaxlaSkrivbord() {
        guard let f = aktiv else { return }
        let pa = !f.skrivbordslage
        f.sattSkrivbordslage(pa)
        stangMeny()
        notis(pa ? tr("Skrivbordsversion") : tr("Mobilversion"), ikon: .skrivbord)
    }

    func hittaPaSidan() {
        guard let f = aktiv, !arTomAdress(f.url) else { return }
        stangMeny()
        efter(0.35) { f.visaSokfalt(nil) }
    }

    func vaxlaBokmarke() {
        guard let f = aktiv, let u = f.url, !arTomAdress(u) else { return }
        let nu = bibliotek.vaxlaBokmarke(u, titel: f.titel)
        if nu { Haptik.klart() }
        notis(nu ? tr("Bokmärke sparat") : tr("Bokmärket borttaget"), ikon: .stjarna)
    }

    func dela() {
        guard let f = aktiv, let u = f.url, !arTomAdress(u) else { return }
        let vc = UIActivityViewController(activityItems: [u], applicationActivities: nil)
        guard let topp = Self.toppvy() else { return }
        if let p = vc.popoverPresentationController {
            p.sourceView = topp.view
            p.sourceRect = delaknapp == .zero ? CGRect(x: topp.view.bounds.midX, y: topp.view.bounds.maxY - 60, width: 1, height: 1) : delaknapp
        }
        topp.present(vc, animated: true)
    }

    func kopieraLank() {
        guard let u = aktiv?.url, !arTomAdress(u) else { return }
        UIPasteboard.general.url = u
        notis(tr("Länken kopierad"), ikon: .kopiera)
    }

    /// Den översta vykontrollern i appens fönster.
    static func toppvy() -> UIViewController? {
        let fonster = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        var vc = (fonster.first(where: \.isKeyWindow) ?? fonster.first)?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }

    // MARK: - Snabbmenyer

    func visaHistorik(bakat: Bool) {
        guard let f = aktiv else { return }
        let lista = f.webbvy.backForwardList
        let poster = bakat ? Array(lista.backList.reversed().prefix(12)) : Array(lista.forwardList.prefix(12))
        guard !poster.isEmpty else { return }
        Haptik.medel()
        let vy = f.webbvy
        snabbmeny = Snabbmeny(
            rubrik: bakat ? tr("Tillbaka") : tr("Framåt"),
            val: poster.map { p in
                let t = p.title ?? ""
                let titel = t.isEmpty ? domanFor(p.url) : t
                return Snabbval(titel: titel, undertitel: domanFor(p.url), monogram: domanFor(p.url)) { [weak vy] in _ = vy?.go(to: p) }
            },
            ankare: bakat ? bakatknapp : framatknapp)
    }

    func visaFlikval() {
        Haptik.medel()
        var val: [Snabbval] = [
            Snabbval(titel: tr("Ny flik"), ikon: .plus) { [weak self] in self?.nyFlik(privat: false) },
            Snabbval(titel: tr("Ny privat flik"), ikon: .privat) { [weak self] in self?.nyFlik(privat: true) },
        ]
        if let f = aktiv {
            val.append(Snabbval(titel: tr("Stäng flik"), ikon: .stang, farlig: true) { [weak self] in self?.stang(f.id) })
        }
        snabbmeny = Snabbmeny(rubrik: nil, val: val, ankare: flikknapp)
    }

    // MARK: - Händelser

    /// En sida laddades: en färsk bild för flikväxlaren (historiken sköter Flikar).
    func sidaLaddad(_ h: SidaLaddad) {
        guard h.flik == app.flikar.aktivId else { return }
        efter(0.6) { [weak self] in
            guard let self, self.app.flikar.aktivId == h.flik, !self.vaxlareOppen else { return }
            self.fotografera()
        }
    }
}
