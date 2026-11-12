# Koncept: vikblad

**En mening:** Ett hopvikt blad med gorillan på omslaget vecklas ut blad för blad, och varje blad är en riktig skärmbild av AdRaze Browser som gorillan ringar in med bläck: reklamen som aldrig laddas, samma webbläsare i fem skepnader, Falk som byter utseendet på en mening, och Familj. Sedan viks allt ihop till omslaget igen.

**Varför någon stannar på sajten:**

- Det är den riktiga produkten. En besökare som undrar om det här finns på riktigt får svaret i bild, och handskriften säger det rakt ut: a real screenshot.
- Papper som vecklas ut har nyfikenheten inbyggd: vad ligger bakom nästa veck?
- Två saker andra webbläsare inte visar: fem helt olika utseenden av samma fönster i takt, och ett helt nytt utseende av en enda mening till Falk.
- Den slutar där den började. Omslaget är både slutkort och start, så loopen är fysisk.

**Grepp:** produkten som den är, i ritad ram. Formen är en enda pappersremsa som vecklas ut åt höger och viks ihop igen.

**Längd:** 36,0 s = 1080 bildrutor. **Puls:** 80 slag per minut. Slag k ligger på k x 0,75 s. 12 takter på 3,0 s.

**Skiss:** `skiss.png` i den här mappen (rutorna med kryss är platshållare för riktiga skärmbilder). **Stil:** `../STIL.md`.

## Premissens regler

1. Allt på bladen som ser ut som AdRaze ÄR AdRaze: riktiga, oretuscherade skärmbilder ur en egen dold instans.
2. Bläck och orange penna är vår kommentar. Det ritade härmar aldrig gränssnitt.
3. Det är ett enda papper. Varje nytt blad vecklas ut åt höger ur det förra. I slutet viks bladen ihop i omvänd ordning.
4. Gorillan orsakar varje veck: den stångar ramen, och då vecklas nästa blad ut.
5. Det är samma fönster hela vägen. Utseendet ändras bara av riktiga inställningar.

## Bladen

Varje blad är en hel bild på 1920 x 1080 i paper med korn.

- **Berättarraden** står överst på bladet: vänsterkant x = 150, baslinje y = 136, News 104 px.
- **Ramen** för skärmbilden: övre vänstra hörnet i (150, 190), 1620 x 836 px, bläckkontur enligt stilguiden. Skärmbilden kan förstoras inne i ramen (ramen klipper).
- **Gorillan** (220 px, med lapp) sitter på ramens övre högra hörn, ritrutans hörn i (1590, 40). Den ligger utanför bladen och sitter kvar när papperet rör sig under den.

| Blad | Innehåll |
|---|---|
| 0, omslaget | Slutkortet enligt stilguiden. Texten är tryckt på omslaget. Gorillan sitter på sin plats men hör inte till papperet. |
| 1 | Startsidan i AdRaze Browser (K1) och räknaren. |
| 2 | Samma fönster i fem utseenden (K1 till K5). |
| 3 | Fönstret till vänster (1140 px brett, hörn i (150, 314)) och Falk-panelen i en hög smal ram till höger (440 x 836 px, hörn i (1330, 190)). |
| 4 | Familj-panelen (K8). |

**Så viks det.** Bladen 1 till 4 ligger sida vid sida i en värld som glider åt vänster ett blad i taget. Nästa blad sitter i en led längs sin vänsterkant och svänger upp som en dörr, från kant mot oss (90 grader) till plant (0 grader), med perspektiv 2400 px, på 0,5 s (`power3.out`), medan världen glider 1920 px på 0,6 s (`power2.inOut`). Omslaget sitter i en led längs vänsterkanten på blad 1 och svänger upp mot oss och bort åt vänster. I slutet går allt baklänges och fortare. En skärmbild som visas ligger alltid plant.

## Skärmbilderna

Tas med Playwright (`playwright-core` i `/home/mint/insta-mcp/node_modules`, `chromium.connectOverCDP`) mot en egen dold instans enligt de gemensamma reglerna: Xvfb, `/home/mint/adraze/browser/node_modules/electron/dist/electron /home/mint/adraze/browser`, `--ozone-platform=x11`, egen `--user-data-dir`, `--remote-debugging-port=9571`, miljön från `testMiljo` i `/home/mint/adraze/browser/tools/test/hjalp.js`. Allt genom låset och i lätt läge. Aldrig port 9225, aldrig ett fönster på den riktiga skärmen. Skriv ett skript i den här mappen (`tagbilder.mjs`) så att bilderna kan tas om. Stäng instansen via dess PID när bilderna är tagna.

Förberedelser i skalet (målet vars adress innehåller `shell.html`):

- Engelska: `localStorage.setItem('adraze-lang', 'en')` och ladda om.
- Ingen introduktion: `localStorage.setItem('adraze-hacker-intro-v3', '1')`.
- Inga andra företags ikoner: `localStorage.setItem('skoll-shortcuts', JSON.stringify([{ label: 'AdRaze', url: 'https://adraze.app' }, { label: 'AdRaze Search', url: 'https://search.adraze.app' }, { label: 'Download', url: 'https://download.adraze.app' }]))`.
- Inget foto och därmed inget fotografnamn: `Anpassa.set('startsida.bakgrund', false, 'Bakgrundsbild på startsidan')`. Kontrollera i bilden att både fotot och raden med fotografens namn är borta.
- Fönstret i samma mått som ramen (1620 x 836 logiska px). Ta bilderna i dubbel skala, till exempel med `Emulation.setDeviceMetricsOverride` och `deviceScaleFactor: 2`, så att de tål förstoring.
- En riktig räknare: surfa till tre eller fyra riktiga nyhetssajter i instansen före K1, så att startsidans räknare visar det instansen faktiskt stoppat. De sajterna visas aldrig.

| Bild | Vy | Inställningar (nycklar i Anpassa) | Ska synas |
|---|---|---|---|
| K1 | Startsidan, hela fönstret | allt på standard: `tema.accent` #ff4b1f, `tema.lage` ljust, `flikar.lage` upptill | Klockan, sökfältet, räknaren med texten ads and trackers blocked och en siffra över noll |
| K2 | Samma | `tema.accent` #2f9e67, `tema.horn` rund, `tema.densitet` luftig, `flikar.lage` vertikal | Flikpanelen till vänster, grönt |
| K3 | Samma | `tema.accent` #3b6fe0, `tema.lage` morkt, `tema.horn` normal, `tema.densitet` normal, `flikar.lage` upptill | Mörkt, blått |
| K4 | Samma | `tema.accent` #e8a317, `tema.lage` ljust, `tema.horn` rund, `flikar.lage` dolda | Ingen flikrad, bärnsten |
| K5 | Samma | `tema.accent` #5f6b7a, `tema.lage` morkt, `tema.horn` kantig, `tema.densitet` kompakt, `flikar.lage` upptill, `verktyg.placering` nere | Adressfältet längst ner, kantigt, grafit |
| K6a | Falk-panelen ensam (målet `krypto.html`) | utseende som K1 | Falks hälsning och fältet Ask Falk |
| K6b1 till K6b5 | Samma | texten skrivs på riktigt i fältet, en bild efter varje ord | `make`, `make it`, `make it dark`, `make it dark and`, `make it dark and purple` |
| K6c | Samma, direkt efter skickat | | Bubblan med meningen och Falk is thinking |
| K7 | Startsidan, hela fönstret, Falk-panelen stängd | det Falk ändrade: `tema.lage` morkt, `tema.accent` #7354d6 | Samma fönster som K1, mörkt och lila |
| K8 | Inställningar, Familj: bara panelen, utan inställningarnas meny | utseende som K1 | Rubriken Family och raden som börjar Open, not spying. |

Värdena sätts med `Anpassa.set(nyckel, värde, etikett)` i skalet. Familj öppnas med `openFamily()`. Falk öppnas som i `tools/test/falk-inst.js`: kontot i skalet sätts till ett Pro-konto utan namn, och AI-tjänstens svar ersätts i huvudprocessen (via `--inspect` på en egen port, till exempel 9572), eftersom bygget inte har någon Pro-inloggning. Svaret ska vara det Falk verkligen svarar med i det här fallet: en kort bekräftelse och taggarna `[[gör:anpassa=tema.lage|morkt]] [[gör:anpassa=tema.accent|#7354d6]]`. Taggarna körs av den riktiga koden (`anpassa-falk.js`), och fönstret byter utseende på riktigt. K7 tas efter det.

Kontroll av varje bild, i full storlek, innan den används:

- Bara engelska. Kända svenska rester: ordet Anpassa i inställningarnas meny (därför beskärs K8), Visa bara ikoner längst ner i flikpanelen i K2 (gör panelen smal med `flikar.vertikalSmal` om texten syns, eller välj ett utsnitt som är lika för alla fem bilderna och ändå visar adressfältet längst ner i K5), och Falks rader om vad den ändrat (därför tas K6c före svaret och K7 med panelen stängd). Anpassa-panelen i inställningarna är till största delen oöversatt (av cirka 300 texter finns ett fyrtiotal på engelska): visa den aldrig, visa bara resultatet.
- Inga personnamn, inga andra företags ikoner, ingen sajtmeny, ingen proxy. Startsidan hälsar med kontots namn eller början av e-postadressen: ge Pro-kontot i Falk-steget ett tomt namn och en adress som börjar med en siffra, så skrivs inget namn ut.
- Hälsningen på startsidan byts varje timme. Ta K1 till K5 och K7 inom samma timme, så att bara utseendet skiljer bilderna åt.
- Ingenting ändras i bilden efteråt. Stämmer något inte: ta om bilden eller välj en annan vy.
- Skillnaden mellan K1 till K5 ska synas när bilden krympts till 360 px bredd. Syns den inte: låt startsidan vara tom på widgetar så att skalets egna ytor tar mer plats.

**Om Falk inte går att visa sant:** stopp 3 får bara finnas om meningen verkligen bytte utseendet i instansen genom Falks egen kod. Går det inte, stryks stopp 3 helt. Videon blir då 30,0 s (10 takter): stopp 4 börjar på 16,50 och får 1,5 s längre håll, ihopvikningen börjar på 23,25 och allt därefter ligger 6,0 s tidigare. Skriv det i rapporten.

## Bild för bild

| Tid (s) | Bild och rörelse | Text på skärmen | Ljud |
|---|---|---|---|
| 0,00 till 0,50 | Omslaget är på väg upp (fortsättning från slutet): det svänger mot oss och bort åt vänster och är borta 0,50. Under det ligger blad 1. Gorillan är i luften och landar på ramens övre högra hörn vid 0,375. | Omslagets text syns de första bildrutorna | Pappersflax. Mjuk duns när gorillan landar. Trummorna går redan. |
| 0,50 till 3,75 | **Stopp 1.** Blad 1 med K1 i ramen. Rad 1 står 0,90 till 3,60. Handskriften skrivs fram nere till höger i ramen med en pil mot fönstret (1,60 till 2,30) och går ut 3,60. Gorillan tittar ner i bilden. | Rad 1: `This is AdRaze Browser.` (kursiv: AdRaze Browser.) Handskrift: `a real screenshot` | Pennrasp. |
| 3,75 till 4,25 (slag 5) | Skärmbilden förstoras 1,5 gånger inne i ramen, mot räknaren längst ner på startsidan. Rad 2 står 3,90 till 6,50. | Rad 2: `Ads are stopped before they load.` (kursiv: before they load.) | Svep. |
| 4,50 till 5,05 (slag 6) | En orange ring ritas runt den riktiga räknaren. | I appen: siffran och `ads and trackers blocked` | Pennrasp. |
| 6,00 till 6,50 (slag 8) | Skärmbilden tillbaka till full vy. | | |
| 6,75 (slag 9) | Gorillan stångar ramens högerkant. Blad 2 svänger upp (till 7,25) och världen glider ett blad (till 7,35). Gorillan hoppar med och landar när bladet ligger plant. | | Pappersflax och duns. |
| 7,40 | **Stopp 2.** Blad 2 med K1, hela fönstret. Rad 3 kommer. Vid 7,50 (slag 10) skrivs första lappen fram med en pil mot flikraden. | Rad 3: `Same browser.` Handskrift: `1  tabs on top` | Pop. |
| 9,00 (slag 12) | Skärmbilden byts till K2: bilden fälls som ett kalenderblad på 4 bildrutor. Handskriften byts och pilen flyttar till flikpanelen. Gorillan nickar på slaget. | Handskrift: `2  tabs on the side` | Flick och pop, en ton högre. |
| 10,50 (slag 14) | K3. | Handskrift: `3  dark` | Flick och pop, en ton högre. |
| 12,00 (slag 16) | K4. Pilen pekar på tomrummet där flikraden låg. | Handskrift: `4  hidden tabs` | Flick och pop, en ton högre. |
| 13,50 (slag 18) | K5. Pilen pekar på adressfältet längst ner. | Handskrift: `5  bar at the bottom` | Flick och pop, en ton högre. |
| 15,00 (slag 20) | Handskriften går ut. Raden fylls på med två ord till, och ordet Five stryks under med orange penna (15,20 till 15,60). Håll till 16,50. | Rad 3 hel: `Same browser. Five looks.` (kursiv: Five looks.) | Pennrasp. De fem tonerna blev en liten melodi. |
| 16,50 (slag 22) | Stångning. Blad 3 svänger upp (till 17,00), världen glider (till 17,10). **Stopp 3.** Till vänster fönstret (K1), till höger Falk-panelen (K6a). Rad 4 står 17,20 till 19,40. | Rad 4: `Or just ask Falk.` (kursiv: ask Falk.) | Pappersflax och duns. |
| 18,00 till 19,20 | I Falk-panelen skrivs meningen, ett ord per steg: K6b1 till K6b5 byts i takt (18,00, 18,30, 18,60, 18,90, 19,20). | I appen: `make it dark and purple` | Ett tangenttick per ord. |
| 19,50 (slag 26) | Skickat: K6c. Bubblan sitter i panelen. | I appen: bubblan och `Falk is thinking` | Litet svep. |
| 20,25 (slag 27) | Fönstret till vänster byts till K7: samma fönster, mörkt och lila. Ramen studsar till (skala 1,03 och tillbaka). Gorillans ögonbryn far upp. | | Duns och ackordbyte uppåt. |
| 21,00 till 24,00 | Orange ring runt bubblan (21,00 till 21,50). Bläckpil från bubblan till fönstret (21,50 till 22,00). Gorillans blick går från bubblan till fönstret (22,50) och sedan till oss (23,25). Rad 5 står 21,00 till 24,00. | Rad 5: `One sentence. New look.` (kursiv: New look.) | Pennrasp två gånger. |
| 24,00 (slag 32) | Stångning. Blad 4 svänger upp (till 24,50). **Stopp 4.** K8, Familj-panelen. Bilden förstoras 1,4 gånger mot raden Open, not spying (24,50 till 25,00). Rad 6 står 24,70 till 28,50. | Rad 6: `Family: open, not spying.` (kursiv: open, not spying.) | Pappersflax och duns. |
| 25,50 till 26,10 (slag 34) | Orange penna stryker under den riktiga raden i appen. | I appen: raden som börjar `Open, not spying.` | Pennrasp. |
| 27,00 till 29,25 (slag 36) | Skärmbilden tillbaka till full vy (27,00 till 27,50), så att hela Familj-panelen syns. Gorillan tittar på oss (27,75) och blinkar (28,40). | | |
| 29,25 (slag 39) | Gorillan tar sats och hoppar rakt upp ur bild. Bladen viks ihop baklänges: blad 4 (29,25 till 29,60), blad 3 (till 29,90), blad 2 (till 30,15), och världen glider tillbaka i samma takt. Omslaget svänger in från vänster och slår igen (30,15 till 30,75). | | Fyra flax som går fortare och fortare. Musiken bromsar som ett band som stannar. Smäll på slag 41 (30,75). |
| 30,75 till 31,50 | Omslaget ligger still med sin tryckta text. Gorillans plats är tom. | `AdRaze`, `adraze.app`, `CHROME EXTENSION · BROWSER FOR MAC AND LINUX` | Musiken tar ny sats. |
| 31,50 (slag 42) | Gorillan faller ner uppifrån och landar på sin plats, 440 px, med tillplattning. Slutkortet är helt. | | Duns och slutackord. |
| 31,90 till 35,45 | Rent slutkort. Gorillan kokar och blinkar en gång (33,50). | | Trummor och elpiano fortsätter mjukt. |
| 35,45 till 36,00 | **Överlämning.** Gorillan hukar (35,45) och skjuter ifrån (35,60). Avstampet sparkar upp omslaget: högerkanten börjar lyfta i samma bildruta. Gorillan är i luften över skarven. Det är början på samma sväng och samma hopp som fortsätter 0,00 till 0,50. | | Avstamp och pappersflax som börjar. |

Sista rena slutkortsruta: 35,43 s. Där kan en version utan loop kapas. Förslag på stillbild för sajten: 10,5 s (det mörka utseendet med lappen 3 dark).

I den här videon byggs slutkortet i annan ordning än stilguidens normala: texten kommer med omslaget och gorillan landar sist. Måtten är desamma.

## All text i bild

Berättarrader, i ordning:

1. `This is AdRaze Browser.`
2. `Ads are stopped before they load.`
3. `Same browser. Five looks.`
4. `Or just ask Falk.`
5. `One sentence. New look.`
6. `Family: open, not spying.`

Handskrift: `a real screenshot`, `1  tabs on top`, `2  tabs on the side`, `3  dark`, `4  hidden tabs`, `5  bar at the bottom`.

Skrivet i appen av oss: `make it dark and purple`.

Slutkort: `AdRaze`, `adraze.app`, `CHROME EXTENSION · BROWSER FOR MAC AND LINUX`.

All annan text i bild är appens egen och visas som den är.

## Ljud

Pappershiphop i 80 slag per minut. Dammig baskagge och kantslag på två och fyra, ett elpiano med två ackord per takt (sinus med lätt svaj och tremolo), en mjuk bas, och ett svagt brus som låter som papper. Allt syntas med numpy.

- Varje veck: pappersflax (brus som sveper genom ett bandpass) och en duns när bladet ligger plant.
- Varje ring, pil och understrykning: pennrasp.
- De fem utseendena: ett flick och en pop per byte, en ton högre varje gång. De fem tonerna blir en melodi som elpianot tar över.
- Meningen till Falk: ett tangenttick per ord.
- När fönstret byter utseende byter musiken tonart ett steg upp. Det är det enda stället där musiken byter läge.
- Ihopvikningen: fyra flax som accelererar medan musiken bromsar som ett band, och en smäll när omslaget slår igen.
- Under slutkortet spelar trummor och elpiano vidare. Sista takten leder tillbaka till första.

## Loopen

Omslaget är slutkortet, och omslaget är det som öppnas i första bildrutan. Avstampet kommer 35,60, gorillan landar 0,375 och svängen är klar 0,50. Skriv omslagets vinkel och gorillans hopp som funktioner av u (u = t i början, u = t - 36 i slutet). Tillståndet vid 36,0 ska vara exakt det vid 0,0: omslaget halvvägs upp, gorillan mitt i hoppet.

## Playwright

Här är Playwright halva jobbet: alla skärmbilder tas med den (se Skärmbilderna). Använd den också för att titta på egna rutor i full storlek, särskilt varje bild där en riktig skärmbild har förstorats: appens text ska vara skarp och den orange ringen ska sitta på rätt sak.

## Logikkoll

1. **Reglerna** står överst.
2. **Scen för scen:**
   - Stopp 1: ringen sitter på en riktig siffra i en riktig bild. Rad 2 säger vad siffran betyder.
   - Stopp 2: raden säger fem, och fem utseenden visas och är numrerade 1 till 5 i handskriften. Tittaren kan räkna dem. K1 är utseende nummer 1, samma bild som på blad 1: därav Same browser.
   - Varje lapp pekar på det som faktiskt ändrats i just den bilden.
   - Stopp 3: orsaken syns före verkan. Meningen skrivs, skickas, och först därefter byter fönstret utseende. Fönstret till vänster är K1 fram till bytet, annars finns inget före att jämföra med.
   - Stopp 4: understrykningen sitter på appens egen rad, och rad 6 upprepar den i stor text för den som ser videon liten.
   - Ihopvikningen går i omvänd ordning: 4, 3, 2, omslag.
   - Gorillan orsakar varje veck (stångning) och är den sista biten som landar på slutkortet.
3. **Följer poängen?** Ja: det här är en riktig webbläsare som stoppar reklam, som går att göra till sin egen, som har en assistent och ett familjeläge.
4. **Bara bilden:** all poäng står som text, handskrift eller skärmbild. Inget hänger på ljudet.

## Sanningskoll

Sökvägarna utgår från `/home/mint/adraze`.

| Påstående i bild | Stämmer med |
|---|---|
| This is AdRaze Browser. | Sajten kallar den AdRaze Browser (`site/en/index.html`). Bilden är äkta. |
| Ads are stopped before they load. | `site/en/index.html`: The blocker is built in, so ads are stopped before the page even loads. |
| Räknaren i bild | Det instansen själv räknat. Appens text: ads and trackers blocked (`browser/ui/locales/en.json`). |
| tabs on top, tabs on the side, hidden tabs | `browser/anpassa-flikar.js`: `flikar.lage` upptill, vertikal, dolda |
| dark | `browser/anpassa-tema.js`: `tema.lage` morkt |
| bar at the bottom | `browser/anpassa-verktyg.js`: `verktyg.placering` nere |
| Same browser. Five looks. | Fem riktiga bilder av samma fönster. Five är antalet vi visar, inte ett antal teman. |
| Or just ask Falk. One sentence. New look. | `browser/anpassa-falk.js`: Falk ändrar Anpassa-inställningar med vanligt språk. Bytet sker på riktigt i instansen. |
| Family: open, not spying. | Appens egen rad i Familj-panelen (`browser/ui/shell.html`, `browser/ui/locales/en.json`) |
| CHROME EXTENSION · BROWSER FOR MAC AND LINUX | Chrome Web Store, `download/en/index.html` |

Falk hör till Pro. Därför står det ingenting om pris och inget free någonstans. Ingen proxy, inget Windows, inga andra företag, inga personnamn.

## Får förenklas, får inte förenklas

Får förenklas om tiden tryter:

- Skrivandet i Falk-panelen kan vara två bilder (tomt fält, hel mening) i stället för fem.
- Kalenderbladet vid varje byte av utseende kan vara ett hårt byte på slaget.
- Handskriften `a real screenshot` kan strykas om den inte får plats utan att täcka något.

Får inte förenklas:

- Att varje skärmbild är äkta och orörd.
- Att fem utseenden visas och numreras.
- Att meningen skickas före bytet i stopp 3.
- Att omslaget är slutkortet och att det öppnas i första bildrutan.
