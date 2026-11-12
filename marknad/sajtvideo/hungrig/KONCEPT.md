# Koncept: hungrig

**En mening:** Du ville bara se en video, sidan kom med allt annat, och då vaknar något hungrigt: gorillan äter upp skräpet rätt för rätt, och den sista annonsen blir lappen i munnen på loggan.

**Varför någon stannar på sajten:**

- Första sekunden är något alla har varit med om: pekaren är på väg mot play och en ruta smäller ner framför den.
- Det är en figur med aptit. Varje tugga är ett nytt skämt (bita, nosa på reject, dra av videoreklamen, plocka spårare, suga in resten), så man väntar på nästa.
- Slutet förklarar loggan. Den som sett filmen vet varför gorillan har en AD-lapp i munnen. Det minns man.
- Den berättar samma sak som sajtens hjälte (gorillan som äter annonser), men som en historia med början och slut.

**Grepp:** en figur gör jobbet. Berättelsen utspelar sig på en ritad webbsida, med fem närbilder på färgad mönstermark.

**Längd:** 32,0 s = 960 bildrutor. **Puls:** 105 slag per minut med sving. Slag k ligger på k x 0,5714 s (slag 7 = 4,000 s, slag 14 = 8,000 s, slag 56 = 32,000 s). 14 takter.

**Skiss:** `skiss.png` i den här mappen (sex nyckelbilder). **Stil:** `../STIL.md`.

## Premissens regler

1. Pekaren är tittaren. Den vill en enda sak: trycka på play.
2. Skräpet är fysiskt. Det landar på sidan och ställer sig mellan pekaren och play. Stänger man en ruta kommer två nya.
3. Gorillan äter bara skräp. Sidan (rubriken, spelaren, textraderna) och pekaren rör den aldrig.
4. Det som är uppätet är borta. När sista rätten är slut finns inget skräp kvar i bild.
5. Gorillan har en vanlig mun genom hela filmen. Lappen får den först när den fångar den sista lilla annonsen. Då är den loggan.

## Rollerna

**Sidan** (helbild): ett fönster i vitt papper med bläckkontur, övre vänstra hörnet i (300, 70), 1380 x 930 px. Titelrad med tre prickar och ett adressfält (tomt, ingen adress skrivs ut). På sidan: ett tjockt rubrikstreck, en spelare (860 x 484 px, hörn i (360, 260)) med en playknapp mitt i (790, 502, radie 74), fyra små rutor med textstreck till höger och fyra textstreck under. Playknappen är svart på vitt, inte orange.

**Pekaren:** en ritad pil, vit med bläckkontur, cirka 70 px hög i helbild.

**Skräpet.** All text nedan står exakt så i bild. Skyltar är InterK, svart text på pastell, bläckkontur, ett litet kryss uppe till höger.

| Skräp | Text i bild | Utseende |
|---|---|---|
| Första skylten | `SALE!` | sun |
| Tre skyltar | `ONLY 2 LEFT`, `SPIN TO WIN`, `DOWNLOAD NOW` | rose, mint, lilac |
| Förvideoreklamen | `Ad` och `Skip in 5` (senare `Skip in 4`) | nattsvart ruta över hela spelaren, gul bricka, ljus pille, gul förloppslinje |
| Kakrutan | `We value your privacy`, `ACCEPT ALL`, `reject` | bred ruta i paper2 över fönstrets nederkant, stor gul knapp, pytteliten länk (20 px i helbild: skämtet är att den är liten) |
| Nyhetsbrevet | `WAIT! DON'T GO!`, `OK` | ljus ruta mitt på, ett tomt fält, svart knapp |
| Spårarna | ingen text | tre små ögon med två ben var. De sitter på pekaren och tittar på den. |
| Nyhetsbrevets ungar | `NO WAIT!`, `PLEASE!`, `LAST CHANCE`, `RATE US`, `ARE YOU SURE?`, `ALLOW NOTIFICATIONS?` | sun, rose, mint, lilac, salmon, light |
| Den sista | `AD` | en liten gul lapp med två bläckben, samma lapp som i loggan |

**Gorillan:** ritas med `gorilla(pose)` ur stilguiden, utan lapp (`tag: false`) fram till 26,86 s. 300 till 460 px som skådespelare.

**Kameran** är en wrapper runt helbilden. Tre lägen: tätt (skala 1,6 med playknappen flyttad till (1100, 600)), mellan (1,3) och helbild (1,0). Bildtextlappen ligger utanför kameran.

**Bildtextlappen** ligger uppe till vänster i alla bilder: övre vänstra hörnet i (96, 56), lutad 1,5 grader, News 104 px med sista orden i kursiv.

## Bild för bild

| Tid (s) | Bild och rörelse | Text på skärmen | Ljud |
|---|---|---|---|
| 0,00 till 0,57 | Tätt på spelaren. Bilden glider in från höger och bromsar (fortsättning på slutets panorering). Pekaren glider mot play. | | Bas och vispar går redan. Ett svep klingar av. |
| 0,57 (slag 1) | `SALE!` smäller ner över play precis innan pekaren når fram. Pekaren rycker bakåt och stannar 3 bildrutor. Lappen med rad 1 poppar in vid 0,70 och står till 2,90. | `SALE!` och rad 1: `You came for one video.` (kursiv: one video.) | Duns och pop. |
| 1,71 till 2,29 (slag 3 till 4) | Pekaren går till krysset på skylten och trycker. Skylten plattas till och spricker i två som far isär: `ONLY 2 LEFT` och `SPIN TO WIN`. Kameran backar till mellanläget (2,29 till 2,70). | `ONLY 2 LEFT`, `SPIN TO WIN` | Ett klick (pekaren trycker på riktigt), sedan två pop. |
| 3,43 (slag 6) | Förvideoreklamen faller ner över spelaren. Rad 2 kommer vid 3,10 och står till 6,40. | `Ad`, `Skip in 5` och rad 2: `It came with extras.` (kursiv: extras.) | Tung duns. En gäll liten reklamslinga läggs på musiken. |
| 4,00 (slag 7) | `DOWNLOAD NOW` poppar in. Kameran backar till helbild (4,00 till 4,50). | `DOWNLOAD NOW` | Pop. |
| 4,57 (slag 8) | Kakrutan skjuts upp underifrån och täcker fönstrets nederkant. | `We value your privacy`, `ACCEPT ALL`, `reject` | Duns. Ännu en slinga. |
| 5,14 (slag 9) | Nyhetsbrevet poppar in mitt på sidan. | `WAIT! DON'T GO!`, `OK` | Pop. |
| 5,71 till 6,10 (slag 10) | Tre spårare hoppar upp på pekaren, en i taget. De följer den med blicken. | | Tre små pip. |
| 6,29 (slag 11) | Pekaren är inklämd nere till höger och darrar. Allt annat står still i en halv sekund. | | Musiken tunnas ut till bara bas. |
| 6,86 (slag 12) | Allt skräp skakar 6 px. Den orange klicken stiger upp bakom skräpet nere till vänster som en soluppgång (till 7,60). | | Magkurr: ett lågt mullrande ljud. |
| 7,43 (slag 13) | Ögonbryn och ögon stiger upp över nyhetsbrevets överkant. Blicken går åt vänster (7,70), åt höger (8,00), ner mot rutan (8,30). Ögonbrynet sänks: hungrig. Rad 3 står 7,50 till 9,00. | Rad 3: `Someone's hungry.` (kursiv: hungry.) | En dämpad trumpet som frågar. |
| 9,14 (slag 16) | Hårt klipp. **Rätt 1**, blå mark med prickar. De tre skyltarna stora. Gorillan landar från vänster. Ett bett per slag (9,71, 10,29, 10,86): en tugga ur skylten (bettet är en klick i markens färg med kokande kant), kinderna fulla, resten av skylten krymper in i munnen. Rad 4 står 9,30 till 11,30. | Rad 4: `Banner ads: eaten.` (kursiv: eaten.) | Tre knapriga bett på slagen. Blåsstötar. Bandet svänger för fullt. |
| 11,43 (slag 20) | Hårt klipp. **Rätt 2**, olivgrön mark med kodformer. Kakrutan stor. Gorillan tittar på `ACCEPT ALL` (11,70), tittar på oss utan min (12,00), för nosen till lilla `reject` (12,57): knappen trycks in. Rutan rullar ihop sig från vänster till en rulle (12,60 till 13,00). Gorillan slurpar i sig rullen (13,14). Rad 5 står 11,60 till 13,60. | Rad 5: `Cookie banner: rejected.` (kursiv: rejected.) | Litet klick på reject, pappersrull, slurp. |
| 13,71 (slag 24) | Hårt klipp. **Rätt 3**, ljus mönstermark med nät. Spelaren med förvideoreklamen på. `Skip in 5` blir `Skip in 4` (14,29). Gorillan tittar på oss (14,50). Den biter tag i hörnet vid pillen och drar av hela reklamen som ett klistermärke (14,86 till 15,30) och sväljer (15,43). Play syns igen, orörd. Rad 6 står 13,90 till 15,90. | `Skip in 4` och rad 6: `Video ad: skipped.` (kursiv: skipped.) | Tick när siffran byts. Klisterljud (rivet svep). Svälj. |
| 16,00 (slag 28) | Hårt klipp. **Rätt 4**, papper med korn. Pekaren springer i en cirkel med de tre spårarna på ryggen, två varv (till 17,00). Gorillans pupiller följer varven. Nyp, nyp, nyp (17,14, 17,43, 17,71): en spårare i taget plockas av och äts. Pekaren ruskar på sig (17,90). Rad 7 står 16,20 till 18,20. | Rad 7: `Trackers: picked off.` (kursiv: picked off.) | Tre korta nyp i stigande ton. |
| 18,29 (slag 32) | Hårt klipp. **Rätt 5**, natt med stjärnor. Nyhetsbrevet skälver och spricker i sex ungar (18,50). Gorillan drar huvudet bakåt (18,86). Insuget (18,95 till 19,90): alla sju rutor sträcks ut och far i en spiral in i gapet. Kinderna buktar (19,90), svälj (20,00), nöjd blinkning (20,30). Rad 8 står 18,60 till 20,50. | De sex ungarnas text och rad 8: `Popups: gone.` (kursiv: gone.) | Stigande sug, en åttondels tystnad, svälj. Filmens största ljud. |
| 20,57 (slag 36) | Hårt klipp tillbaka till helbilden på papper. Samma sida som i början, hel och ren. Pekaren kryper fram ur hörnet och sträcker på sig (20,80), går till play (21,14 till 21,71) och trycker (22,29). Spelaren spelar: en sol stiger över två kullar och förloppslinjen ritas fram (till 25,10). Gorillan vilar nere till vänster med halvfulla kinder och slutna ögon. Rad 9 står 21,00 till 24,90. | Rad 9: `Same page. Minus the junk.` (kursiv: Minus the junk.) | Klick. Musiken blir varm: hela bandet och melodin. |
| 25,14 till 26,29 (slag 44 till 46) | En liten gul `AD`-lapp på två ben tassar in från högerkanten mot spelaren, ett steg per slag. Gorillans ena öga öppnas (25,90). Lappen fryser mitt i steget (26,29). | `AD` | Tassande pizzicato. Musiken håller andan. |
| 26,86 (slag 47) | Gorillan kastar sig åt höger och fångar lappen med tänderna. Den sväljer inte. Lappens ben sprattlar två gånger och dras in, och lappen sitter still i munnen. Nu är den loggan. Fönstret glider ut åt höger (26,90 till 27,40). | | Träblock. |
| 27,43 (slag 48) | **Slutkortet.** Gorillan landar på sin plats i 440 px (skuttet dit börjar 26,95, medan fönstret glider ut). `AdRaze` en bokstav i taget (27,50 till 27,85). Adressknappen (28,00, slag 49). Lilla raden (28,30 till 28,65). | `AdRaze`, `adraze.app`, `CHROME EXTENSION · BROWSER FOR MAC AND LINUX` | Sex pop i stigande ton. Musikens slutfras. |
| 28,65 till 31,20 | Rent slutkort. Gorillan kokar och blinkar en gång (30,00). | | Bas och vispar fortsätter mjukt. |
| 31,20 till 32,00 | **Överlämning.** Gorillans pupiller far åt höger (31,20). Kameran panorerar åt höger och accelererar (31,40 till 32,00): slutkortet glider ut åt vänster, och in från höger kommer spelaren i närbild med pekaren på väg mot play. | | Ett svep som fortsätter in i början. |

Sista rena slutkortsruta: 31,17 s. Där kan en version utan loop kapas. Förslag på stillbild för sajten: 19,4 s (insuget).

## All text i bild

Berättarrader, i ordning:

1. `You came for one video.`
2. `It came with extras.`
3. `Someone's hungry.`
4. `Banner ads: eaten.`
5. `Cookie banner: rejected.`
6. `Video ad: skipped.`
7. `Trackers: picked off.`
8. `Popups: gone.`
9. `Same page. Minus the junk.`

Skyltar och knappar: se tabellen under Rollerna. Slutkort: `AdRaze`, `adraze.app`, `CHROME EXTENSION · BROWSER FOR MAC AND LINUX`.

## Ljud

Matjazz i 105 slag per minut med sving. Kontrabas som går (sinus med övertoner), vispar på virvel (filtrerat brus), ridecymbal, och en dämpad trumpet som säger wah (sågtand genom svepande bandpass) på gorillans tagningar. Allt syntas med numpy.

- Slag 0 till 11: bandet spelar, men varje skräp som landar lägger till en egen gäll liten slinga. Ljudet blir lika rörigt som bilden.
- Slag 11 till 16: bara bas, sedan magkurr och trumpetens fråga.
- Slag 16 till 36: fullt sväng. Ett bett per slag. Varje gång något äts upp tystnar dess slinga.
- Slag 36 till 44: varmt, hela bandet, melodin.
- Slag 44 till 47: bara pizzicato. Slag 47: träblock.
- Slag 48 till 56: slutfras som fortsätter under slutkortet. Sista takten är en vändning som leder tillbaka till första takten, så att ljudet också går runt.

## Loopen

Slutkortet och öppningen ligger bredvid varandra på samma papper: slutkortet till vänster, spelaren i närbild till höger. Överlämningen är en enda panorering åt höger som börjar 31,40 och är färdig 0,45. Skriv den som en funktion av u (u = t i början, u = t - 32 i slutet), med skarven där farten är som högst. Pekarens glidning mot play börjar också före skarven. Tillståndet vid 32,0 ska vara exakt det vid 0,0.

## Playwright

Den här videon har inga riktiga skärmbilder. Världen är helt ritad. Playwright används bara för att titta på egna rutor före och efter rendering (till exempel nyckelbilderna 5,8, 10,0, 12,5, 19,4, 23,0 och 30,0 s i full storlek), i dold Chromium och genom låset.

## Logikkoll

1. **Reglerna** står överst.
2. **Scen för scen:**
   - Pekarens mål syns: den rör sig mot play och blir stoppad en hårsmån före. Utan den rörelsen finns inget mål, så den får inte kortas bort.
   - Hydran syns: pekaren trycker på krysset, och ur just den skylten kommer två nya.
   - Varje skräp går att känna igen på sin egen text och form innan det äts.
   - Gorillans hunger syns: blicken låser på en ruta och ögonbrynet sänks. Rad 3 säger det också.
   - I varje rätt äts bara det som raden nämner. Det som blir kvar under är orört: efter rätt 3 syns play igen.
   - Spårarna äts i rätt 4 och syns aldrig mer. Efter rätt 5 finns inget skräp kvar.
   - Den rena sidan har samma rubrik, spelare och textstreck på samma platser som i början. Annars stämmer inte Same page.
   - Pekaren når play och videon spelar. Det är utdelningen på regel 1.
   - Den sista lappen har en synlig avsikt: den tassar mot spelaren. Gorillan fångar den men sväljer inte, och munnen har inte haft någon lapp före det.
3. **Följer poängen?** Ja: skräpet försvinner, sidan är densamma, och namnet AdRaze kommer direkt efter.
4. **Bara bilden:** all poäng står som text eller teckning. Inget hänger på ljudet (magkurret har rad 3 som stöd).

Saker att räkna i den färdiga videon: tre skyltar äts i rätt 1, tre spårare i rätt 4, sju rutor i rätt 5.

## Sanningskoll

Sökvägarna utgår från `/home/mint/adraze`.

| Påstående i bild | Stämmer med |
|---|---|
| Banner ads: eaten. | `site/en/index.html`: Banners, video ads and sponsored boxes never load. |
| Cookie banner: rejected. | `README.md` (Cookie banners: AdRaze clicks Reject all), `extension/content/kakor.js`, `browser/adraze/content/kakor.js` |
| Video ad: skipped. | `CHANGELOG.md` 0.1.1 (pre-roll and mid-roll ads are muted, hidden and skipped), `extension/content/youtube.js` |
| Trackers: picked off. | `site/en/index.html`: Analytics scripts and ad networks that follow you from site to site are blocked with EasyPrivacy. |
| Popups: gone. | `site/en/index.html`: Ad windows that open wherever you click get stopped. Skrivet utan every, eftersom inloggnings- och betalfönster släpps igenom med flit. |
| Same page. Minus the junk. | Sajtens egen rubrik över jämförelsen. |
| CHROME EXTENSION · BROWSER FOR MAC AND LINUX | Chrome Web Store, `download/en/index.html` (built for Linux and Mac, ingen Windows-version) |

Inga andra företag nämns eller visas. Skräpets texter är påhittade och allmänna. Ingen proxy, inget pris och inga siffror om AdRaze.

## Får förenklas, får inte förenklas

Får förenklas om tiden tryter:

- Rullen i rätt 2 kan vara att rutan krymper mot gorillan med en spiral i änden.
- Solen och kullarna i spelaren kan vara en enda linje och en cirkel.
- Kamerans mellanläge kan strykas (tätt direkt till helbild).

Får inte förenklas:

- Pekarens väg mot play i första sekunden och trycket på play i slutet.
- Nosen på lilla reject. Det är så AdRaze faktiskt gör med kakrutor.
- Insuget i rätt 5. Det är filmens största ögonblick.
- Att lappen kommer först i slutet, och att gorillan står exakt som loggan på slutkortet.
