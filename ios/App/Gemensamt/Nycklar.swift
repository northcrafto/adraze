import Foundation

// Alla inställningar som finns från start, med samma namn, standardvärden, barnlås och delbarhet som på datorn
// (del 1, avsnitt 2.1–2.3). Källorna på datorn står vid varje grupp. Registreras av AppMiljo innan modulerna
// startar, så att `anpassa:alla` ger webbsidorna rätt standardvärden från början.
//
// Skillnader mot datorn (iOS):
//  - verktyg.placering har standard "nere" (adressfältet nere på iPhone).
//  - sok.motor är ny: datorns skal sparar vald sökmotor i localStorage (skoll-engine, del 1 avsnitt 2.4).
//  - webb.* och block.* ligger i samma butik (datorn har adraze-webb.json och adraze-block.json). De går inte till
//    ångra-historiken och följer aldrig med i delningskoder.
//  - kortkommandon.* och gester.* registreras bara som mönster (iPhone har inga). iPad kan registrera dem en och en.
//
// Ägare: Grund (Gemensamt). Nya nycklar för en modul läggs i modulens egen mapp (se Nycklar i Installningar.swift).

// MARK: - Värdena för tema.* och verktyg.*

/// tema.lage
enum Temalage: String, CaseIterable, Installningsvarde { case ljust, morkt, system }
/// tema.densitet
enum Densitet: String, CaseIterable, Installningsvarde { case kompakt, normal, luftig }
/// tema.horn
enum Horn: String, CaseIterable, Installningsvarde { case kantig, normal, rund }
/// tema.typsnitt
enum Typsnittsval: String, CaseIterable, Installningsvarde { case system, klassisk, tydlig, serif, mono }
/// tema.storlek
enum Textstorlek: String, CaseIterable, Installningsvarde { case liten, normal, stor }
/// tema.palett: färgerna på själva ytorna. `jul` = mörkgrönt och djuprött, gäller i mörkt läge.
enum Ytpalett: String, CaseIterable, Installningsvarde { case standard, jul }
/// verktyg.adress: hela adressen eller bara domänen i adressfältet.
enum Adressvisning: String, CaseIterable, Installningsvarde { case hel, doman }
/// verktyg.placering
enum Placering: String, CaseIterable, Installningsvarde { case uppe, nere }

// MARK: - Typade nycklar

extension Nycklar {
    // tema.* (browser/anpassa-tema.js): rena utseendeval, inte barnlåsta, delbara
    static let temaAccent = Nyckel<String>("tema.accent", standard: "#ff4b1f", etikett: "Accentfärg")
    static let temaLage = Nyckel<Temalage>("tema.lage", standard: .ljust, etikett: "Ljust eller mörkt", val: .av(Temalage.self))
    static let temaDensitet = Nyckel<Densitet>("tema.densitet", standard: .normal, etikett: "Densitet", val: .av(Densitet.self))
    static let temaHorn = Nyckel<Horn>("tema.horn", standard: .normal, etikett: "Hörn", val: .av(Horn.self))
    static let temaTypsnitt = Nyckel<Typsnittsval>("tema.typsnitt", standard: .system, etikett: "Typsnitt", val: .av(Typsnittsval.self))
    static let temaStorlek = Nyckel<Textstorlek>("tema.storlek", standard: .normal, etikett: "Textstorlek", val: .av(Textstorlek.self))
    static let temaPalett = Nyckel<Ytpalett>("tema.palett", standard: .standard, etikett: "Färguppsättning", val: .av(Ytpalett.self))

    // verktyg.* (browser/anpassa-verktyg.js)
    static let verktygKnappar = Nyckel<JSONVarde>("verktyg.knappar", standard: .null, etikett: "Verktygsfältets knappar")
    static let verktygAdress = Nyckel<Adressvisning>("verktyg.adress", standard: .hel, etikett: "Adressfältet: hela adressen eller domänen", val: .av(Adressvisning.self))
    static let verktygDoljSchema = Nyckel<Bool>("verktyg.doljSchema", standard: true, etikett: "Dölj https:// och www.")
    static let verktygPlacering = Nyckel<Placering>("verktyg.placering", standard: .nere, etikett: "Adressfältets placering", val: .av(Placering.self))
    static let verktygBokmarkesfalt = Nyckel<String>("verktyg.bokmarkesfalt", standard: "alltid", etikett: "Bokmärkesfältet", val: .lista(["alltid", "nyflik", "aldrig"]))

    // flikar.* (browser/anpassa-flikar.js)
    static let flikarLage = Nyckel<String>("flikar.lage", standard: "upptill", etikett: "Flikarnas placering", val: .lista(["upptill", "vertikal", "dolda"]))
    static let flikarVertikalBredd = Nyckel<Double>("flikar.vertikalBredd", standard: 240, etikett: "Flikpanelens bredd", val: .intervall(min: 170, max: 420))
    static let flikarVertikalSmal = Nyckel<Bool>("flikar.vertikalSmal", standard: false, etikett: "Flikpanelen bara ikoner")
    static let flikarGrupper = Nyckel<JSONVarde>("flikar.grupper", standard: [], etikett: "Flikgrupper", importbar: false)
    static let flikarNyFlik = Nyckel<String>("flikar.nyFlik", standard: "sist", etikett: "Var nya flikar öppnas", val: .lista(["sist", "bredvid"]))
    static let flikarSistaFlik = Nyckel<String>("flikar.sistaFlik", standard: "stang", etikett: "När sista fliken stängs", val: .lista(["stang", "ny"]))
    static let flikarStangKnapp = Nyckel<String>("flikar.stangKnapp", standard: "alla", etikett: "Stängknapp på flikarna", val: .lista(["alla", "aktiv"]))
    static let flikarSova = Nyckel<Int>("flikar.sova", standard: 15, etikett: "Sovande flikar", val: .lista([0, 15, 30, 60, 120]))

    // sok.* (browser/anpassa-sokmotorer.js). sok.motor är iOS (datorn: localStorage skoll-engine).
    static let sokEgna = Nyckel<JSONVarde>("sok.egna", standard: Sokmotorer.forslag, etikett: "Egna sökmotorer", barnlast: true, importbar: false)
    static let sokStandard = Nyckel<String?>("sok.standard", standard: nil, etikett: "Standardsökmotor", barnlast: true, importbar: false)
    static let sokMotor = Nyckel<String>("sok.motor", standard: "google", etikett: "Sökmotor", importbar: false,
                                         val: .lista(Sokmotorer.inbyggda.map { .text($0.id) }))

    // webb.* (browser/webbinst.js, adraze-webb.json på datorn)
    static let webbDns = Nyckel<String>("webb.dns", standard: "automatic", etikett: "Säker DNS", importbar: false,
                                        val: .lista(["off", "automatic", "cloudflare", "quad9", "google"]), historik: false)
    static let webbHttpsOnly = Nyckel<Bool>("webb.httpsOnly", standard: false, etikett: "Endast HTTPS", importbar: false, historik: false)
    static let webbFontSize = Nyckel<Double>("webb.fontSize", standard: 16, etikett: "Teckenstorlek på webbsidor", importbar: false,
                                             val: .intervall(min: 9, max: 30), historik: false)
    static let webbDownloadDir = Nyckel<String>("webb.downloadDir", standard: "", etikett: "Mapp för nedladdningar", importbar: false, historik: false)
    static let webbAskDownload = Nyckel<Bool>("webb.askDownload", standard: false, etikett: "Fråga var filer ska sparas", importbar: false, historik: false)
    static let webbPermDefaults = Nyckel<JSONVarde>("webb.permDefaults", standard: [:], etikett: "Behörigheter: standard", importbar: false, historik: false)
    static let webbPerms = Nyckel<JSONVarde>("webb.perms", standard: [:], etikett: "Behörigheter per sajt", importbar: false, historik: false)
    static let webbFalkSamtycke = Nyckel<Bool>("webb.falkSamtycke", standard: false, etikett: "Samtycke till Falk", importbar: false, historik: false)
    static let webbFalkSida = Nyckel<Bool>("webb.falkSida", standard: true, etikett: "Falk får läsa och styra sidan", importbar: false, historik: false)

    // block.* (browser/blockinst.js, adraze-block.json på datorn)
    static let blockNiva = Nyckel<String>("block.niva", standard: "medium", etikett: "Blockeringsnivå", importbar: false,
                                          val: .lista(["enkel", "medium", "aggressiv"]), historik: false)
    static let blockRaknare = Nyckel<Bool>("block.raknare", standard: true, etikett: "Räkna blockeringar", importbar: false, historik: false)
    static let blockSkript = Nyckel<Bool>("block.skript", standard: false, etikett: "Blockera all JavaScript", importbar: false, historik: false)
    static let blockInjektioner = Nyckel<Bool>("block.injektioner", standard: false, etikett: "Stoppa injicerade skript", importbar: false, historik: false)
    static let blockFingeravtryck = Nyckel<Bool>("block.fingeravtryck", standard: true, etikett: "Skydd mot fingeravtryck", importbar: false, historik: false)
    static let blockNatskydd = Nyckel<Bool>("block.natskydd", standard: true, etikett: "Skydda det lokala nätverket", importbar: false, historik: false)
    static let blockKakor = Nyckel<String>("block.kakor", standard: "tredje", etikett: "Blockera kakor", importbar: false,
                                           val: .lista(["av", "tredje", "alla"]), historik: false)
    static let blockGlom = Nyckel<Bool>("block.glom", standard: false, etikett: "Glöm sajten när den stängs", importbar: false, historik: false)
    static let blockKontakt = Nyckel<String>("block.kontakt", standard: "", etikett: "Mejladress för rapporter", importbar: false, historik: false)
    static let blockElementPrivat = Nyckel<Bool>("block.elementPrivat", standard: false, etikett: "Blockerade element är privata", importbar: false, historik: false)
    static let blockSocial = Nyckel<[String: Bool]>("block.social", standard: ["facebook": true, "x": true, "linkedin": true],
                                                    etikett: "Blockera sociala knappar", importbar: false, historik: false)
    static let blockListor = Nyckel<[String: Bool]>("block.listor", standard: [:], etikett: "Blocklistor", importbar: false, historik: false)
    static let blockEgna = Nyckel<String>("block.egna", standard: "", etikett: "Egna filter", importbar: false, historik: false)
    static let blockElement = Nyckel<JSONVarde>("block.element", standard: [:], etikett: "Blockerade element", importbar: false, historik: false)

    /// Alla nycklar ovan.
    static let typade: [Nycklar] = [
        temaAccent, temaLage, temaDensitet, temaHorn, temaTypsnitt, temaStorlek, temaPalett,
        verktygKnappar, verktygAdress, verktygDoljSchema, verktygPlacering, verktygBokmarkesfalt,
        flikarLage, flikarVertikalBredd, flikarVertikalSmal, flikarGrupper, flikarNyFlik, flikarSistaFlik, flikarStangKnapp, flikarSova,
        sokEgna, sokStandard, sokMotor,
        webbDns, webbHttpsOnly, webbFontSize, webbDownloadDir, webbAskDownload, webbPermDefaults, webbPerms, webbFalkSamtycke, webbFalkSida,
        blockNiva, blockRaknare, blockSkript, blockInjektioner, blockFingeravtryck, blockNatskydd, blockKakor, blockGlom, blockKontakt,
        blockElementPrivat, blockSocial, blockListor, blockEgna, blockElement,
    ]
}

// MARK: - Resten av datorns nycklar (används av AdRaze-UI:t i webbvyerna)

extension Installningsdef {
    /// Nycklar som ingen native del läser än, men som webbsidorna (Anpassa, startsidan, Falk) behöver i registret.
    static let franDatorn: [Installningsdef] = [
        // startsida.* (browser/anpassa-startsida.js)
        .init("startsida.layout", standard: [["w": "genvagar", "s": "bred"]], etikett: "Startsidans widgetar"),
        .init("startsida.sokfalt", standard: true, etikett: "Sökfält på startsidan"),
        .init("startsida.logga", standard: false, etikett: "Logga på startsidan"),
        .init("startsida.halsning", standard: true, etikett: "Klocka och hälsning"),
        .init("startsida.bakgrund", standard: true, etikett: "Bakgrundsbild på startsidan"),
        .init("startsida.statistik", standard: true, etikett: "Statistik längst ned"),
        .init("startsida.stil", standard: "frostad", etikett: "Widgetarnas stil"),
        .init("startsida.klocka", standard: "digital", etikett: "Klockans utseende"),
        .init("startsida.tom", standard: false, etikett: "Tom startsida"),
        // arbetsytor.* (browser/anpassa-arbetsytor.js)
        .init("arbetsytor.lista", standard: [["id": "hem", "namn": "Hem", "ikon": "hem", "farg": "#0e2a47"]], etikett: "Arbetsytor"),
        .init("arbetsytor.vaxlare", standard: true, etikett: "Väljaren för arbetsytor"),
        // falk.* (browser/falk-inst.js)
        .init("falk.av", standard: false, etikett: "Stäng av Falk helt", barnlast: true),
        .init("falk.accent", standard: "#ff4b1f", etikett: "Falks färg"),
        .init("falk.bredd", standard: "normal", etikett: "Falk-panelens bredd", val: .lista(["smal", "normal", "bred"])),
        .init("falk.text", standard: "normal", etikett: "Textstorlek i Falk", val: .lista(["liten", "normal", "stor"])),
        .init("falk.svar", standard: "normal", etikett: "Hur långa svar Falk ger", val: .lista(["kort", "normal", "utforlig"])),
        .init("falk.halsning", standard: true, etikett: "Falks hälsning"),
        .init("falk.tankord", standard: true, etikett: "Tänkord medan Falk tänker"),
        // sidopanel.* (browser/anpassa-sidopanel.js); finns inte på iPhone
        .init("sidopanel.visa", standard: false, etikett: "Visa sidopanelen", barnlast: true),
        .init("sidopanel.sida", standard: "vanster", etikett: "Sidopanelens placering", barnlast: true),
        .init("sidopanel.appar", standard: [], etikett: "Appar i sidopanelen", barnlast: true, importbar: false),
        // galleri.* (browser/anpassa-galleri.js)
        .init("galleri.visa", standard: true, etikett: "Visa temagalleriet", barnlast: true),
        .init("galleri.visaNamn", standard: true, etikett: "Visa mitt användarnamn i galleriet"),
        // jul.* (browser/jul.js)
        .init("jul.pa", standard: false, etikett: "Jultema"),
        .init("jul.farger", standard: true, etikett: "Julfärger"),
        .init("jul.sno", standard: true, etikett: "Snö på nya fliken"),
        .init("jul.luva", standard: true, etikett: "Gorillan i tomteluva"),
        .init("jul.kalender", standard: true, etikett: "Julkalender"),
        .init("jul.stat", standard: true, etikett: "Statistik i julspråk"),
        .init("jul.flikar", standard: true, etikett: "Snö på flikarna"),
        // sajt.* (browser/anpassa-sajt.js)
        .init("sajt.*", standard: nil, etikett: "Inställningar för en sajt"),
        .init("sajt.skydd", standard: nil, etikett: "Reklam, JavaScript och popup-fönster per sajt", barnlast: true, importbar: false),
        // avancerat.* (browser/anpassa-avancerat.js)
        .init("avancerat.css", standard: [], etikett: "Egen CSS för sajter", barnlast: true, importbar: false),
        .init("avancerat.skalcss", standard: ["pa": false, "css": ""], etikett: "Egen CSS för AdRaze", barnlast: true, importbar: false),
        .init("avancerat.skript", standard: [], etikett: "Användarskript", barnlast: true, importbar: false),
        // kortkommandon och musgester (browser/anpassa-kortkommandon.js); bara mönster på iOS
        .init("kortkommandon.*", standard: nil, etikett: "Kortkommando"),
        .init("gester.pa", standard: false, etikett: "Musgester"),
        .init("gester.spar", standard: true, etikett: "Musgester: visa spåret"),
        .init("gester.*", standard: nil, etikett: "Musgest"),
    ]
}

// MARK: - Sökmotorer

/// De inbyggda sökmotorerna (datorns `ENGINES`, `ui/shell.js` 57–63) och förslagen i `sok.egna`.
enum Sokmotorer {
    struct Motor: Sendable, Hashable {
        let id: String
        let namn: String
        /// Adressen som sökorden läggs efter (kodade som `encodeURIComponent`).
        let bas: String
    }

    static let inbyggda: [Motor] = [
        Motor(id: "google", namn: "Google", bas: "https://www.google.com/search?q="),
        Motor(id: "adraze", namn: "AdRaze Search", bas: "https://search.adraze.app/search?q="),
        Motor(id: "duckduckgo", namn: "DuckDuckGo", bas: "https://duckduckgo.com/?q="),
        Motor(id: "brave", namn: "Brave Search", bas: "https://search.brave.com/search?q="),
        Motor(id: "startpage", namn: "Startpage", bas: "https://www.startpage.com/sp/search?query="),
    ]

    /// Privata flikar söker alltid med AdRaze Search (loggar inget), som på datorn.
    static let privat = inbyggda[1]

    static func motor(_ id: String) -> Motor { inbyggda.first { $0.id == id } ?? inbyggda[0] }

    /// Förslagen i `sok.egna` från start (browser/anpassa-sokmotorer.js, FORSLAG).
    static let forslag: JSONVarde = [
        ["id": "f-ddg", "namn": "DuckDuckGo", "url": "https://duckduckgo.com/?q=%s", "snabbord": "ddg"],
        ["id": "f-sp", "namn": "Startpage", "url": "https://www.startpage.com/sp/search?query=%s", "snabbord": "sp"],
        ["id": "f-bs", "namn": "Brave Search", "url": "https://search.brave.com/search?q=%s", "snabbord": "bs"],
        ["id": "f-eco", "namn": "Ecosia", "url": "https://www.ecosia.org/search?q=%s", "snabbord": "eco"],
        ["id": "f-w", "namn": "Wikipedia", "url": "https://sv.wikipedia.org/w/index.php?search=%s", "snabbord": "w"],
        ["id": "f-yt", "namn": "YouTube", "url": "https://www.youtube.com/results?search_query=%s", "snabbord": "yt"],
        ["id": "f-gh", "namn": "GitHub", "url": "https://github.com/search?q=%s", "snabbord": "gh"],
        ["id": "f-pj", "namn": "Prisjakt", "url": "https://www.prisjakt.nu/search?search=%s", "snabbord": "pj"],
        ["id": "f-bl", "namn": "Blocket", "url": "https://www.blocket.se/recommerce/forsale/search?q=%s", "snabbord": "bl"],
    ]
}
