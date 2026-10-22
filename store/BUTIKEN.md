# AdRaze i Chrome Web Store

Allt som behövs för att skicka in och uppdatera AdRaze. Konsol: https://chrome.google.com/webstore/devconsole

- **Objekt-ID:** `cgdjdjgdoklomdphknggkhfghlglcppd` (skickad för granskning 2026-10-22, version 0.2.0)
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
• Blockerar reklam och spårare med EasyList, EasyPrivacy, Frellwits svenska filter, uBlock Origins filter, AdGuard Popups och Peter Lowes lista.
• Döljer tomma annonsrutor så att sidan ser ren ut.
• Tystar och hoppar över reklam på YouTube.
• Avvisar onödiga kakor automatiskt i vanliga kakrutor. Rutor utan gratis nej döljs utan att något godkänns.
• Stoppar popunders och osynliga klickfällor. Inloggning och betalning (BankID, Klarna, Swish, Google, Apple m.fl.) öppnas alltid.
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
| declarativeNetRequest | Blocks ad, tracker and malicious requests with static rule sets compiled from public filter lists (EasyList, EasyPrivacy and others). |
| declarativeNetRequestFeedback | Counts how many requests were blocked on the current tab, shown in the toolbar menu. Only the matched rule set is read, never page content. |
| scripting | Injects CSS that hides empty ad slots and cookie banners, and registers the content scripts that stop popunders and skip YouTube ads. |
| storage | Saves the user's settings (sites where protection is paused) and local counters. |
| webNavigation | Detects new tabs opened by a page so popunders and ad-initiated redirects to malicious sites can be closed or stopped. |
| alarms | Refreshes the blocked counters periodically, and syncs daily totals to the user's AdRaze account only if the user has linked one. |
| Host permission `<all_urls>` | An ad blocker must work on every site the user visits: cosmetic filtering, popup protection and cookie banner handling run on all pages. |

**Fjärrkod (Remote code):** Nej, all JavaScript ligger i paketet.

**Datainsamling:** kryssa i *Personligt identifierbar information* (mejladress) och *Autentiseringsinformation* (kontots inloggningsnyckel), eftersom de används när någon frivilligt kopplar ett konto på adraze.app. Inget annat. Kryssa i alla tre försäkringarna (säljs inte, används bara för syftet, inte för kreditvärdighet).

**Integritetspolicy:** https://adraze.app/integritet

### Distribution

Offentlig, alla regioner.

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
