# AdRaze i Chrome Web Store

Allt som behövs för att skicka in och uppdatera AdRaze. Konsol: https://chrome.google.com/webstore/devconsole

- **Objekt-ID:** `cgdjdjgdoklomdphknggkhfghlglcppd` (skickad 2026-10-22, version 0.2.0; avslagen 2026-10-23 för "sökordsspam" = uppräkning av filterlistornas namn i beskrivningen – nämn aldrig andra adblockers/listor vid namn i butikstexten)
- **Butikssida (när den är publicerad):** https://chromewebstore.google.com/detail/cgdjdjgdoklomdphknggkhfghlglcppd
- **Utgivare:** AdRaze, konto cetoari9@gmail.com (verifierad kontaktadress), icke-näringsidkare
- **Kategori:** Integritet och säkerhet

## Bygga paketet

```sh
cd tools
node build.js --fetch   # färska filterlistor
node pack.mjs           # → dist/adraze-<version>.zip (utan _metadata/)
```

Höj `version` i `extension/manifest.json` före varje uppladdning. Storen avvisar en zip med samma eller lägre version än den som redan är publicerad.

## Första inlämningen

1. Utvecklarkonto: engångsavgift 5 USD, verifiera mejl, fyll i kontaktuppgifter. Konto som "trader" (EU:s DSA) om AdRaze tar emot pengar (Stöd oss), annars "non-trader".
2. **Lägg till nytt objekt** → ladda upp `dist/adraze-<version>.zip`.
3. Fyll i flikarna nedan och klicka **Skicka in för granskning**. Tillägg med `<all_urls>` granskas ofta i flera dagar.

### Butiksinformation (Store listing)

- **Kategori:** Integritet och säkerhet
- **Språk:** svenska
- **Kort beskrivning** kommer från `description` i manifestet.
- **Bilder:** `store/skarmdump-1..3.png` (1280×800), `store/kampanj-liten-440x280.png`, `store/kampanj-stor-1400x560.png` (valfri). Ikon 128 px finns i paketet. Gör om bilderna med `node store/rendera.cjs`.
- **Webbplats:** https://adraze.app
- **Support:** https://github.com/northcrafto/adraze/issues

**Detaljerad beskrivning:**

```
AdRaze stoppar reklam, spårare, popups och omdirigeringar till farliga sidor. Gratis, för alltid, och utan "godkänd reklam".

Det här gör AdRaze:
• Blockerar reklam, spårare och popups med välkända öppna filterlistor – inklusive en lista gjord för svenska sajter.
• Döljer tomma annonsrutor så att sidan ser ren ut.
• Lagar sajter som försöker kringgå blockeringen: små inbyggda skript stänger av adblock-varningar och reklamskript, och sidor som väntar på ett reklamskript får en ofarlig ersättare så att de inte går sönder.
• Tar bort kända spårningsparametrar ur adresser.
• Tystar och hoppar över reklam på YouTube.
• Avvisar onödiga kakor automatiskt i vanliga kakrutor. Rutor utan gratis nej döljs utan att något godkänns.
• Stoppar popunders och osynliga klickfällor. Inloggnings- och betalfönster öppnas alltid som vanligt.
• Stoppar omdirigeringar till kända bluff- och skadeprogramssidor.
• Pausa skyddet eller kakrutorna per sajt med ett klick.

100 av 100 poäng på adblock-tester.com.

Integritet: utan konto skickar AdRaze ingenting någonstans. Allt sker lokalt i webbläsaren. Öppen källkod (GPL-3): github.com/northcrafto/adraze
```

### Sekretesspraxis (Privacy practices)

**Enskilt syfte (Single purpose):**

```
AdRaze blocks ads, trackers and other unwanted web content: ad and tracker requests, empty ad slots, video ads, cookie consent banners, popunders and redirects to malicious sites.
```

**Motiveringar per behörighet:**

| Behörighet | Motivering (klistra in) |
|---|---|
| declarativeNetRequest | Blocks ad, tracker and malicious requests with static rule sets compiled from public filter lists, replaces blocked ad scripts with harmless built-in stand-ins so pages keep working, and removes known tracking parameters from addresses. |
| declarativeNetRequestFeedback | Counts how many requests were blocked on the current tab, shown in the toolbar menu. Only the matched rule set is read, never page content. |
| scripting | Injects CSS that hides empty ad slots and cookie banners, and registers the content scripts that stop popunders, skip YouTube ads and run the small page fixes from the filter lists (packaged in the extension) on the sites they are written for, to switch off anti-adblock scripts. |
| storage | Saves the user's settings (sites where protection is paused) and local counters. |
| webNavigation | Detects new tabs opened by a page so popunders and ad-initiated redirects to malicious sites can be closed or stopped. |
| alarms | Refreshes the blocked counters periodically, and syncs daily totals to the user's AdRaze account only if the user has linked one. |
| Host permission `<all_urls>` | An ad blocker must work on every site the user visits: cosmetic filtering, popup protection and cookie banner handling run on all pages. |

**Fjärrkod (Remote code):** Nej, all JavaScript ligger i paketet.

**Datainsamling:** kryssa i *Personligt identifierbar information* (mejladress) och *Autentiseringsinformation* (kontots inloggningsnyckel), eftersom de används när någon frivilligt kopplar ett konto på adraze.app. Inget annat. Kryssa i alla tre försäkringarna (säljs inte, används bara för syftet, inte för kreditvärdighet).

**Integritetspolicy:** https://adraze.app/integritet

### Distribution

Offentlig, alla regioner.

## När Google har godkänt

1. `site/bygg.py`: sätt `BUTIK = 'https://chromewebstore.google.com/detail/cgdjdjgdoklomdphknggkhfghlglcppd'`.
2. `python3 bygg.py && vercel --prod` i `site/`. Alla "Lägg till i Chrome"-knappar (meny, hero, installera) går då direkt till butiken och zip-instruktionerna försvinner, på alla 26 språk.
3. README: byt "on its way to the Chrome Web Store" mot butikslänken.

## Uppdatera för de som redan har AdRaze

Chrome uppdaterar tillägg från butiken automatiskt. Vi behöver bara ladda upp en ny version:

1. Höj `version` i `extension/manifest.json` (t.ex. 0.2.0 → 0.2.1) och skriv in ändringen i `CHANGELOG.md`.
2. `node build.js --fetch && node pack.mjs` i `tools/`.
3. Devconsole → AdRaze → **Paket** → **Ladda upp ny paketversion** → välj zip:en → **Skicka in för granskning**.
4. När granskningen är klar publiceras versionen (eller direkt när vi klickar Publicera, om "publicera inte automatiskt" är valt). Chrome hämtar den hos användarna inom några timmar. Tilläggets ID och inställningar ändras inte.

Saker att veta:

- **Nya behörigheter** stänger av tillägget hos användarna tills de godkänner varningen. Lägg bara till behörigheter när det verkligen behövs.
- **Stegvis utrullning:** under Paket går det att släppa till en viss procent av användarna först (för tillägg med många användare).
- **Filterlistorna** finns inbakade i paketet, så färska listor kräver en ny version. Släpp gärna en version varannan vecka.
- **De som laddat ner zip:en från GitHub** ("Läs in okomprimerat") får aldrig automatiska uppdateringar. De behöver ta bort den och installera från butiken en gång.
- **Automatisering (senare):** Chrome Web Store API (`chromewebstore.googleapis.com`) kan ladda upp och publicera från GitHub Actions med OAuth-klient + refresh token, så att en ny tagg släpper en ny version.

## 0.2.4: översatt namn och beskrivning (2026-11-17)

Från 0.2.4 kommer namn och kort beskrivning ur `extension/_locales/<språk>/messages.json` (26 språk, engelska är standard). Namnet är "AdRaze – Ad Blocker" på engelska och "AdRaze – reklamblockerare" på svenska. Butiken söker i namnet, så det ska säga vad tillägget är. Använd aldrig en annan produkts namn i namn eller sökord.

När paketet har `_locales` vill butiken ha en detaljerad beskrivning per språk under **Butiksinformation**. Den svenska finns ovan. Engelska (standardspråk, visas för alla språk som saknar egen text):

```
AdRaze stops ads, trackers, popups and redirects to dangerous sites. Free, forever, and with no "acceptable ads".

What AdRaze does:
• Blocks ads, trackers and popups with well-known open filter lists, including one made for Swedish sites.
• Hides empty ad slots so the page looks clean.
• Fixes sites that try to get around the blocking: small built-in scripts switch off anti-adblock warnings and ad scripts, and pages that wait for an ad script get a harmless stand-in so they do not break.
• Removes known tracking parameters from addresses.
• Mutes and skips ads on YouTube.
• Rejects non-essential cookies automatically in common cookie banners. Banners with no free "no" are hidden without accepting anything.
• Stops popunders and invisible click traps. Login and payment windows always open as usual.
• Stops redirects to known scam and malware sites.
• Pause protection or cookie banner handling per site with one click.

100 out of 100 points on adblock-tester.com.

Privacy: without an account AdRaze sends nothing anywhere. Everything happens locally in your browser. Open source (GPL-3): github.com/northcrafto/adraze
```

Välkomstsidan (`adraze.app/valkommen?k=tillagg`) öppnas en gång vid installation. Det kräver ingen ny behörighet (`tabs.create` är fri). Stycket "Besök på adraze.app" i integritetspolicyn beskriver det.

## Fler butiker

Samma `dist/adraze-<version>.zip` går till Edge och Opera. Firefox får ett eget paket.

### Microsoft Edge Add-ons

1. Partner Center (samma konto som Windows-appen) → **Enroll in a program** → *Microsoft Edge* (gratis). Det är inte gjort än: `partner.microsoft.com/dashboard/microsoftedge/overview` skickar till startsidan.
2. **Create new extension** → ladda upp `dist/adraze-<version>.zip`.
3. Properties: kategori *Privacy & security*, integritetspolicy `https://adraze.app/integritet`, webbplats `https://adraze.app`, support `https://support.adraze.app`.
4. Store listings: lägg till engelska och svenska med beskrivningarna ovan och bilderna i `store/` (1280×800 går bra, liten kampanjbild 440×280).
5. Sökord: högst sju, och aldrig andra produkters namn (Microsoft underkände "adblock" för Windows-appen). Förslag: `ad blocker, block ads, tracker blocker, privacy, popup blocker, cookie banners, open source`.
6. Testing notes: "No account is needed. Install and open any news site; ads are blocked. The toolbar popup shows what was stopped."

### Opera Addons

1. Konto på `addons.opera.com/developer` (gratis), **Upload extension** → samma zip.
2. Kategori *Privacy & Security*, samma texter och bilder. Granskningen är manuell och kan ta veckor.

### Firefox (addons.mozilla.org)

```sh
cd tools && node pack.mjs firefox   # → dist/adraze-<version>-firefox.zip
```

Paketet har eget manifest (bakgrundssida i stället för service worker, id `adraze@adraze.app`, Firefox 128+). Provkört 2026-11-17 i Firefox 159 utan fönster: det läggs in, välkomstfliken öppnas och nätverksreglerna blockerar som i Chrome. `web-ext lint` ger 0 fel.

Kvar innan inlämning:

- **Räknarna.** Firefox saknar `declarativeNetRequest.getMatchedRules` och siffran på ikonen (`setExtensionActionOptions`). Blockeringen fungerar, men popupens "stoppat på den här sidan" och dagsstatistiken visar 0 för nätverksträffar.
- **Datadeklaration.** AMO kräver `browser_specific_settings.gecko.data_collection_permissions` för nya tillägg. Utan konto skickas inget, med kopplat konto skickas mejl, inloggningsnyckel och dagssummor. Bestäm hur det deklareras innan paketet laddas upp.
- **Inte provat i Firefox:** kosmetiska filter, scriptlets i sidans värld, popup-vakten, kakrutorna och YouTube-hanteringen.
- **Granskarna** kommer att fråga om `eval` i fyra scriptlets (`web-ext lint` varnar). Källkoden är öppen och koden ligger oförminskad i paketet, hänvisa dit.
