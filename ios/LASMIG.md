# AdRaze för iPhone – läs mig först

Grunden för iOS-appen (steg 0 i `~/adraze-app/plan/3-ios.md`, 3.7). Den här filen gäller alla agenter som bygger
vidare: Skydd, Flikar, Skal, Brygga och webb-UI, Konto och chatt, Falk.

Det som finns: ett XcodeGen-projekt (`project.yml`), byggskripten, kontrakten i `App/Gemensamt/` med enkla
ersättningar (en flik, inget skydd, adressfältet nere), självtestramverket i `App/Labb/` och röktestet `-mode rok`.
Bundle-id `app.adraze.browser`, iOS 17.0 och senare, byggs med Xcode 26.1.1. iPhone först, iPad följer med.

## 1. Bygga och testa från mint

Allt körs från mint. Macen (`ssh mac`) bygger och kör simulatorn utan fönster.

```
cd ~/adraze/ios
./fran-mint.sh                                   # bara bygget (ingen simulator)
./fran-mint.sh rok ~/adraze-app/skarm            # bygg, kör -mode rok, hämta resultat och skärmbilder
./fran-mint.sh -n steg1-skydd skydd ~/adraze-app/skarm     # eget prefix på filerna
./fran-mint.sh -B -k skydd ~/adraze-app/skarm    # -B bygg inte om, -k låt simulatorn vara igång
./fran-mint.sh -x Chatt rok /tmp/ut              # bygg utan App/Chatt (om den inte kompilerar just nu)
./fran-mint.sh rok /tmp/ut -- -url https://adraze.app/ -stanna 5    # extra startargument till appen
./fran-mint.sh -h                                # alla flaggor
```

Vad som händer: `rsync --delete` av `~/adraze/ios` till `mac:~/adraze-ios/`, sedan `bygg-sim.sh` på Macen
(xcodegen, xcodebuild, `simctl boot/install/launch`, väntar på resultatfilen, `simctl io screenshot`,
`simctl shutdown`). Sist hämtas filerna till mappen du gav (standard `./build-fran-mac/`):

| Fil | Innehåll |
|---|---|
| `PREFIX.png` | Simulatorns skärmbild när testet är klart |
| `PREFIX-resultat.json` | Resultatet: `ok`, `kontroller`, `varden`, `fel`, appens logg, moduler, bryggkanaler, minne |
| `PREFIX-<bild>.png` | Appens egna skärmbilder (`k.skarmbild("<bild>")`) |
| `PREFIX-logg.txt` | Appens stdout och stderr |
| `PREFIX-bygg.txt` | Sammanfattning från Macen. Kompileringsfel står här |
| `build-fran-mac/xcodebuild.log` | Hela byggloggen |

`PREFIX` är testets namn om du inte ger `-n`. Slutkod: 0 = klart och testet ok, 1 = bygget eller körningen
misslyckades, 4 = testet kördes men misslyckades (de misslyckade kontrollerna skrivs ut).

Titta alltid på skärmbilderna (med Read). Ett test räknas inte som klart förrän det har körts i simulatorn och
någon har tittat på bilden (3.6).

Tider 2026-11-17: inkrementellt bygge 8–14 s, simulatorn startar på 33–46 s, `rok` tar 7–10 s. Hela
`./fran-mint.sh rok` cirka 2 minuter.

Simulatorer: standard är `AdRaze iPhone 16 iOS26` (iOS 26.1, UDID `97A89E3E-24A0-4D70-8D19-72A78E6F0791`).
iOS 18.6: `-e "AdRaze iPhone 16"`. Någon iOS 17-simulator finns inte. Har du kört med `-k` stänger du den själv
efteråt: `ssh mac xcrun simctl shutdown 97A89E3E-24A0-4D70-8D19-72A78E6F0791`. Stäng aldrig alla simulatorer
och rör inte andra program på Macen.

Direkt på Macen (om det behövs): `ssh mac 'cd ~/adraze-ios && ./bygg-sim.sh -l rok'`. Se kommentaren överst i
`bygg-sim.sh` för alla flaggor. Öppna aldrig Xcode eller Simulator.app.

**Ett bygge i taget.** Macen har 8 GB. `fran-mint.sh` väntar på låset `/tmp/adraze-ios-fran-mint.lock` på mint
(släpps av sig självt om processen dör) och `bygg-sim.sh` på `/tmp/adraze-ios-bygg.lock` på Macen. Avbryt inte
någon annans bygge.

## 2. Vem äger vad (3.6)

| Agent | Äger | Levererar |
|---|---|---|
| Grund | `project.yml`, `bygg-sim.sh`, `fran-mint.sh`, `verktyg/kopiera-bunt.sh`, `LASMIG.md`, `.gitignore`, `App/AdRazeApp.swift`, `App/Gemensamt/`, `App/Labb/` (ramverket), `App/Tillgangar/` | Projektet, kontrakten, byggskripten, ikon och typsnitt |
| Skal | `App/Skal/` | Adressfält, verktygsrad, flikväxlare, gester, haptik |
| Flikar | `App/Flikar/` | Flikar, navigering, historik, nedladdningar, kontextmeny |
| Skydd | `App/Skydd/`, `App/Regler/`, `verktyg/dnr2wk.py` | Listor, kosmetik, scriptlets, parametrar, blockeringssida |
| Brygga och webb-UI | `App/Brygga/`, `App/Webb/ios/`, `verktyg/kopiera-ui.sh` | Schemat, bryggan, preload-shimmen, Anpassa och startsidan i webbvy |
| Konto och chatt | `App/Konto/`, `App/Chatt/`, `Notistillagg/` | Inloggning, Keychain, chatten i webbvy, notiser |
| Falk | `App/Falk/` | Falk-panelen |

## 3. Regler för samarbetet

- Ändra bara i din egen mapp. `Gemensamt/`, `project.yml`, `AdRazeApp.swift` och `Labb/`-ramverket ändras bara
  av Grund. Behöver du något där: skriv vad och varför i din rapport. Du ska inte behöva det för vanligt arbete.
- Nya filer plockas upp av sig själva, ingen rör `project.yml`:
  - `App/**/*.swift` kompileras (utom under `Bunt/`, `Webb/` och `Regler/`).
  - `App/**/*.xcassets` kompileras. Namnen måste vara unika i hela appen (`AppIcon`, `AccentColor`, `Gorilla`
    och `Startbakgrund` är tagna).
  - `App/<Modul>/Bunt/**` kopieras till `AdRaze.app/<Modul>/**`. Läs med `Bunt.url("<Modul>", "fil")`,
    `Bunt.data(...)` eller `Bunt.filer(...)`.
  - `App/Webb/**` hamnar i `AdRaze.app/Webb/` och `App/Regler/**` i `AdRaze.app/Regler/`.
  - `App/Webb/ui/` är en genererad kopia av datorns UI och checkas inte in (`.gitignore`).
- Använd andra moduler bara via `app` och protokollen i `Gemensamt/`, aldrig deras klasser. Då går appen att
  bygga utan en trasig modul (`fran-mint.sh -x Modul`) och starta utan den (`-- -utan Modul`).
- Bryter en annan modul bygget: bygg med `-x Modul` och säg till ägaren. Laga inte i deras mapp.
- Varje agent skriver ett eget självtest (avsnitt 5) och kör det innan något kallas klart.
- Commit: lägg bara till dina egna filer (`git add ios/App/Skydd`, inte `git add .`). I repot ligger andras
  ocommittade ändringar. Inga Co-Authored-rader. Inga hemligheter i repot.

## 4. Lägga till en modul

En fil i din mapp, till exempel `App/Skydd/SkyddModul.swift`:

```swift
final class SkyddModul: NSObject, AppModul {
    static let namn = "Skydd"          // samma som mappen; används av -x och -utan
    static let ordning = 10             // lägst registreras först, standard 100

    static func registrera(i app: AppMiljo) {
        let skydd = Skydd(app: app)     // din klass, uppfyller SkyddTjanst
        app.ersatt(skydd: skydd)        // byter IngetSkydd mot det riktiga
        app.installningar.registrera(Nycklar.skyddPausade)
        app.brygga.hantera("skydd:status") { _ in .text(skydd.lage.etikett) }
        app.labb.registrera("skydd", beskrivning: "Listorna och blocktestet") { k in try await SkyddProv.kor(k) }
    }

    static func starta(i app: AppMiljo) async {   // valfri; körs när alla har registrerat sig
        (app.skydd as? Skydd)?.borjaKompilera()
    }
}
```

- Klassen måste ärva `NSObject`. Appen hittar den via Objective-C-körtiden (testat med `final class` på toppnivå).
- `registrera(i:)` körs för alla moduler först. Där sätts tjänster, kanaler, nycklar och tester. Anropa inte
  andra moduler där. `starta(i:)` ska gå fort; långa jobb i en egen `Task`.
- Tjänsterna byts med `app.ersatt(flikar:)`, `ersatt(skydd:)`, `ersatt(konto:)` och
  `ersatt(huvudvy: "Skal") { MinVy() }`. Appen loggar vem som levererar vad (`leverantorer` i resultatfilen).
- SwiftUI: `@Environment(AppMiljo.self) private var app` och `@Environment(Tema.self) private var tema`.
  UIKit-kod utan miljön: `AppMiljo.delad`.

## 5. Lägga till ett självtest

Registrera testet i din moduls `registrera(i:)` (se ovan) och lägg koden i din mapp:

```swift
@MainActor
enum SkyddProv {
    static func kor(_ k: Labbkorning) async throws {
        let flik = k.app.flikar.nyFlik(URL(string: "https://example.com/"))
        let laddad = await k.vantaPa("sidan laddad", max: 30) { !flik.laddar && flik.url != nil }
        k.kolla("sidan laddades", laddad)                      // en kontroll, med valfri detalj (JSONVarde)
        k.lika("titeln", flik.titel, "Example Domain")         // jämför två värden
        k.notera("antal_regler", .tal(42))                     // ett mätvärde till resultatfilen
        await k.skarmbild("sida")                              // appens egen bild -> PREFIX-sida.png
        try await k.vanta(0.5)
    }
}
```

Kör med `./fran-mint.sh skydd ~/adraze-app/skarm`. Appen startas med `-mode skydd`, kör testet, skriver
`Documents/resultat-skydd.json`, väntar `-stanna` sekunder (standard 15, så att skärmbilden hinner tas) och
avslutar sig själv med slutkod 0 eller 1. Testet är ok när minst en kontroll finns och ingen misslyckats.
Ett test som hänger avbryts efter `-maxtid` sekunder (standard 240). Okänt namn ger ett fel som listar alla tester.
`./fran-mint.sh lista` skriver alla tester i bygget till resultatfilen (`varden.tester`).

Övrigt i `Labbkorning`: `k.app`, `k.logga(text)`, `k.fel = "…"` (hela testet misslyckas),
`Labbkorning.minneMB()` (appens `phys_footprint`), `Labbkorning.fonster()`. Pixelmått: `Bildmatt` i `Labb/`.
Startargument läses med `k.app.startargument.text("url")` och `.tal("namn")`.

## 6. Kontrakten i `App/Gemensamt/`

| Namn | Fil | Vad |
|---|---|---|
| `AppMiljo`, `Huvudvy`, `Startargument` | `AppMiljo.swift` | Appens gemensamma delar och tjänsterna som byts |
| `AppModul`, `Modulsokare`, `Modulinfo` | `AppModul.swift` | Moduler som hittas av sig själva |
| `Flik`, `FlikHanterare`, `Sidfel` | `Flik.swift` | Flikarna (Flikar gör dem, Skal visar dem) |
| `Webbadress`, `Anvandaragent` | `Flik.swift` | Adress eller sökning (som datorns `normalizeUrl`), Safaris slut på användaragenten |
| `SkyddTjanst`, `Skyddslage`, `Navigeringsbeslut` | `Skydd.swift` | Skyddet: förbered en webbvy, beslut per navigering, blockeringssida, pausa per sajt |
| `KontoTjanst`, `Kontouppgifter`, `Nyckelring` | `Konto.swift` | Inloggad?, token, Keychain |
| `Installningar`, `Nyckel<V>`, `Installningsdef` | `Installningar.swift` | En enda butik för alla inställningar, som datorns Anpassa |
| `Nycklar.*`, `Sokmotorer` | `Nycklar.swift` | Typade nycklar (`tema.*`, `verktyg.*`, `flikar.*`, `sok.*`, `webb.*`, `block.*`) och datorns övriga |
| `Tema`, `Fargroll`, `Matt`, `Radier` | `Tema.swift` | Färger, mått, hörn och typsnitt ur inställningarna |
| `Palett`, `Accentpalett` | `Palett.swift` | Datorns palettmotor (WCAG, APCA, OKLCH), samma färger som datorn |
| `Typsnitt` | `Typsnitt.swift` | Fraunces och Familjen Grotesk med vikt och optisk storlek |
| `BryggRegister`, `BryggAnrop`, `BryggKalla`, `BryggFel` | `Brygga.swift` | Bryggans kanaler (avsnitt 7) |
| `Handelser`, `AppHandelse` | `Handelser.swift` | Händelser mellan moduler (`SidaLaddad`, `InstallningAndrad` …) |
| `Logg` | `Logg.swift` | `Logg("Skydd").info(...)` till os_log, stdout och resultatfilen |
| `Bunt` | `Bunt.swift` | Filer ur `App/<Modul>/Bunt/` |
| `JSONVarde` | `JSONVarde.swift` | JSON-värden för bryggan, inställningarna och resultatfilerna |
| `EnkelFlikHanterare`, `IngetSkydd`, `EnkeltKonto`, `EnkeltSkal` | `Stubbar/` | Ersättningarna tills de riktiga modulerna finns |

Inställningar, kort:

```swift
let accent = app.installningar[.temaAccent]                  // typad läsning
app.installningar[.verktygPlacering] = .uppe                  // typad skrivning (ångra-historik, sparas efter 150 ms)
app.installningar.satt("sajt.example.com", ["zoom": 1.25])    // otypad, som datorns anpassa.set
extension Nycklar {                                           // egen nyckel, registreras i din registrera(i:)
    static let skyddPausade = Nyckel<[String]>("skydd.pausade", standard: [], etikett: "Pausade sajter",
                                               barnlast: true, importbar: false)
}
```

Händelser: `let p = app.handelser.lyssna(SidaLaddad.self) { h in … }` (behåll `p`, annars slutar lyssnandet),
`app.handelser.skicka(MinHandelse(...))` med en egen `struct MinHandelse: AppHandelse`.

Tema i SwiftUI: `tema[.bakgrund]`, `tema.accent`, `tema[.accentText]`, `tema.typsnitt(.body)`, `tema.rubrik(28)`,
`tema.matt.adressfalt`, `tema.radier.falt`. Roten sätter redan ljust/mörkt, accent (`tint`) och textstorlek.

## 7. Bryggkanaler

Transporten (`WKScriptMessageHandlerWithReply` som heter `adraze`, schemat `adraze-app://localhost`,
preload-shimmen och `window.adraze._emit`) gör Brygga. Alla andra registrerar bara kanaler i sin `registrera(i:)`:

```swift
// window.adraze.invoke("anpassa:satt", {nyckel, varde}) -> Promise
app.brygga.hantera("anpassa:satt") { anrop in
    let d = anrop.arg(0)                                  // JSONVarde, .null om argumentet saknas
    guard let nyckel = d["nyckel"].text else { throw BryggFel.ogiltigt("nyckel saknas") }
    return app.installningar.satt(nyckel, d.objekt?["varde"]).json
}
// bara chattsidan får anropa
app.brygga.hantera("konto:token", ytor: ["chatt"]) { _ in
    if let t = await app.konto.token() { return .text(t) } else { return .null }
}
// data sidan behöver synkront vid start (datorns sendSync), läggs i window.__adrazeBoot
app.brygga.startdata("anpassa:alla") { _ in app.installningar.somAnpassaAlla() }
// händelse från Swift till sidorna
app.brygga.skicka("anpassa:andrad", ["nyckel": "tema.accent"], till: .alla)
```

- Kanalnamnen är datorns (`chatt:boot`, `anpassa:alla`, `falk-inst:alla` …), så att webbkoden inte ändras.
- Ett kastat fel blir ett avvisat Promise i JS. Okänd kanal ger `BryggFel.okandKanal`, fel sida `BryggFel.nekad`.
- Samma kanal två gånger: den senaste gäller och en varning loggas med båda modulernas namn.
- Flikar med vanliga webbsidor får aldrig bryggan eller schemat (3.4).
- Prova en kanal i ett självtest utan transporten:
  `try await k.app.brygga.anropa("anpassa:satt", [["nyckel": "tema.accent", "varde": "#3b6fe0"]], fran: BryggKalla(yta: "labb"))`.
  `rok` provar registret med egna kanaler; resultatfilen listar alla registrerade kanaler (`app.bryggkanaler`).

## 8. Fallgropar

Från prototypen (del 3, 1.10):

- `Info.plist` genereras på Macen (`Genererat/Info.plist` ur `info:` i `project.yml`). Nya nycklar
  (bakgrundslägen, URL-scheman, behörighetstexter): be Grund.
- En mapp i bunten får inte heta `Resources` (då säger `simctl install` "Missing bundle ID"). `kopiera-bunt.sh`
  stoppar bygget om en modulmapp heter något som iOS reserverar.
- En nyskapad simulator tar närmare två minuter första gången. Med `-k` får den vara igång mellan proven.
- macOS har bash 3.2 och svensk region ger decimalkomma; skripten kör med `LC_ALL=C`.
- Keychain gav fel -34018 i osignerade simulatorbyggen i ett tidigare projekt. Här signeras simulatorbygget ad hoc
  (`CODE_SIGN_IDENTITY=-`), och Keychain fungerar (testat i `rok` på iOS 26.1, 2026-11-17).
  `ADRAZE_OSIGNERAT=1` ger prototypens osignerade bygge (Keychain otestat då).

Nya, från grunden (2026-11-17):

- Macen har openrsync (protokoll 29): `--delete-excluded` hänger sig och `P`-filter ger "zero-length pathname".
  `fran-mint.sh` använder bara `--delete` och `--exclude`. `-x Modul` tar bort `App/Modul` på Macen efter
  synken; nästa synk utan `-x` lägger tillbaka den.
- Xcode 26 väljs med `DEVELOPER_DIR` i `bygg-sim.sh`. `xcode-select` pekar på 16.4; ändra inte det.
- Swift 5-läge med `SWIFT_STRICT_CONCURRENCY=minimal`. Ett standardargument räknas inte till huvudtråden, så en
  `@MainActor`-egenskap kan inte vara standardvärde (`nonisolated static var` hjälper).
- Appen avslutar sig själv efter ett självtest. Kör du med `-k` och vill använda appen igen: starta om den.
- Fraunces är ett variabelt typsnitt och dess standardinstans är fel för rubriker. Använd `Typsnitt.fraunces`,
  `Typsnitt.rubrik` eller `tema.rubrik`, aldrig `UIFont(name: "Fraunces", …)` eller `.custom("Fraunces", …)`.
  `Font(UIFont)` behåller vikten (testat).
- `top` på Macen visar 400–440 MB för appen även när den gör nästan inget. Appens egen siffra
  (`phys_footprint`, `minne_mb` i resultatfilen) var 44 MB efter en laddad sida. Lita på den.
- example.com har ändrat utseende (flera språk). Bygg inte pixeltest på dess text.

## 9. Användaragenten

`EnkelFlik` sätter `applicationNameForUserAgent` till `Version/<iOS major.minor> Mobile/15E148 Safari/604.1`
(`Anvandaragent` i `Flik.swift`). Uppmätt i `rok` på iOS 26.1:

```
Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1
```

- Utan inställningen saknar WKWebView `Version/… Safari/…` (testat i prototypen, del 3, 1.8).
- iOS-versionen i strängen är fryst: Safari på iOS 26 skriver `iPhone OS 18_6` i stället för 26, medan
  `Version/26.0` följer Safaris version. Källor: nielsleenheer.com,
  https://nielsleenheer.com/articles/2025/the-user-agent-string-of-safari-on-ios-26-and-macos-26/, och 51Degrees,
  https://51degrees.com/blog/apple-ios26-safari26-user-agent-string-device-detection.
- Om Safari på iOS 26.1 skriver `Version/26.1` eller `26.0` är overifierat. Vi följer iOS major.minor.
- Flikarna (Flikar) ska använda `Anvandaragent.anvand(pa:)` på sin `WKWebViewConfiguration`.
