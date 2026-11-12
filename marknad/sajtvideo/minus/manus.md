# Manus: minus

AdRaze sajtvideo i ritstilen, konceptet minus. 1920 x 1080, 30 bilder per sekund, 30,0 s (900 bildrutor), 96 slag per minut (12 takter på 2,5 s). Ingen röst. Videon ska förstås utan ljud och den loopar.

En mening: din sida, plus allt skräp som webben lägger till, tills gorillan stampar ner plustecknens stolpar så att varje plus blir ett minus.

Källor: `KONCEPT.md` (planen), `../STIL.md` (stilen), `skiss.png`. Allt i bild ritas av `index.html`. Musiken syntas av `audio/score.py`.

## Tider

Slag k ligger på k x 0,625 s. I bild avrundas varje slag till närmaste bildruta, och halva rutor avrundas nedåt så att bilden kommer före ljudet och aldrig efter. Tiderna nedan är bildens tider.

| Slag | Tid (s) | Slag | Tid (s) |
|---|---|---|---|
| 1 | 0,633 | 21 | 13,133 |
| 3 | 1,867 | 22 | 13,733 |
| 5 | 3,133 | 24 | 15,000 |
| 6 | 3,733 | 25 | 15,633 |
| 7 | 4,367 | 28 | 17,500 |
| 10 | 6,233 | 30 | 18,733 |
| 11 | 6,867 | 31 till 34 | 19,367 / 20,000 / 20,633 / 21,233 |
| 12 | 7,500 | 35 till 38 | 21,867 / 22,500 / 23,133 / 23,733 |
| 14 | 8,733 | 39 | 24,367 |
| 16 | 10,000 | 40 | 25,000 |
| 18 | 11,233 | 42 | 26,233 |
| 20 | 12,500 | 47 | 29,375 (överlämningen, räknas utan avrundning) |

## Bild för bild

| Tid (s) | Bild och rörelse | Text på skärmen |
|---|---|---|
| 0,00 till 0,35 | `Your page` i 250 px glider upp de sista 80 px till mitten av bilden. Det är fortsättningen på slutets rörelse. | `Your page` |
| 0,43 till 0,63 | Första bandet (gult med prickar) slår in underifrån och landar på slag 1. Remsan krymper till 700 px, Your page trycks uppåt och plattas till ett ögonblick av smällen. Bilden skakar 7 px. | `[+] ads` |
| 0,93 | En stjärna med utropstecken poppar bredvid ordet. Fler följer, en ny var tredje halvsekund. | `!` |
| 1,87 | Andra bandet (blått med nät). Remsan 480 px, Your page 190 px. Tre ögon öppnas i bandet och tittar upp mot Your page. | `[+] trackers` |
| 3,13 | Tredje bandet (rosa med prickar). Remsan 330 px, Your page 140 px. Från 3,43 poppar en liten ruta upp på varje slag och lägger sig över bandet ovanför. | `[+] popups` |
| 3,73 | Fjärde bandet (olivgrönt med kodformer). Remsan 220 px, Your page 100 px. | `[+] cookie banners` |
| 4,37 | Femte bandet (nattsvart med stjärnor, ordet i laxrosa). Remsan 110 px, Your page 72 px och klämd mot överkanten. En pil ritas fram i bandet. 4,50: den gula knappen poppar in i kakbandet, med en pytteliten reject under. | `[+] scam redirects`, `ACCEPT ALL`, `reject` |
| 5,00 till 6,87 | Högen lever i takt: knappen blinkar vitt på varje slag, stjärnor och rutor poppar, ögonen flackar, pilen rycker till och hela bilden knuffas 12 px åt höger på slag 8 till 11. | |
| 6,23 | Gorillan (230 px) tittar ner över bildens överkant uppe till höger och ser på högen. Ögonen i trackerbandet vänder sig genast mot den. 6,65: ögonbrynen dras ihop. | |
| 6,77 till 6,87 | Gorillan hukar och hoppar rakt upp ur bild. Trackerögonen följer den osynliga bågen åt vänster. Det är pausen före det största ögonblicket. | |
| 7,00 till 7,45 | Kameran går in till 1,25 gånger, förankrad i vänsterkanten och 100 px ner, så att gorillans huvud håller marginalen. Från 7,05 tystnar skräpet: inga nya stjärnor eller rutor, inget blink och inget pilryck förrän 8,12. Bara gorillan rör sig. | |
| 7,33 till 7,50 | Gorillan (200 px) faller in uppifrån till vänster och träffar toppen av första plustecknets stolpe på slag 12. | |
| 7,50 till 7,60 | Stolpen pressas ner i det liggande strecket under gorillans tyngd. Plus har blivit minus, och minuset blir orange och sväller till av smällen. Bilden skakar 11 px. | `[-] ads` |
| 7,60 till 7,80 | Gorillan står på det orange minuset och fjädrar tillbaka. Det stora minuset ska hinna läsas. Första gången studsar den 36 px (de andra gångerna 58 px), så att huvudet stannar i bild medan kameran är inne. 7,66 till 8,12: kameran går ut igen. | |
| 7,85 till 8,07 | Det gula bandet plattas till mot bandet under (mönster och stjärnor trycks ihop). Minuset och ordet krymper till en grå rad på papperet och gorillan faller ner på nästa plustecken. Bandens egna skämt efter varje stamp (ögon som spärras upp, knappen som blinkar) kommer 0,15 s efter stampen, när blicken hunnit dit. | `[-] ads` (64 px, grått) |
| 7,97 till 8,33 | Your page växer till 110 px. Gorillan ser upp på den och blir glad i ögonbrynen. | |
| 8,13 | Ordboksraden skrivs in ord för ord uppe till höger, på två rader (88 px, högerkant x = 1824, baslinjer y = 118 och 210), och står till 13,1. Namnet står först, så att AdRaze syns redan här. | `Ad·Raze: to level ads to the ground.` |
| 8,73 / 10,00 / 11,23 / 12,50 | Samma sak fyra gånger till, en landning vartannat slag: blicken ner, huk, skutt rakt upp, stamp. Your page blir 145, 180, 215 och 250 px. Trackerögonen spärras upp innan de plattas till. Knappen ACCEPT ALL blinkar dubbelt så fort sista slagen före sin landning. Pilen i sista bandet rycker bilden i sidled på mellanslagen 13, 15, 17 och 19 tills gorillan landar på den. | `[-] trackers`, `[-] popups`, `[-] cookie banners`, `[-] scam redirects` |
| 12,50 till 13,13 | Hela bilden är papper igen. Fem grå rader med orange minus under Your page i full storlek. Gorillan står nere till vänster och ser upp på raden. | `Your page` och de fem raderna |
| 13,13 | Gorillan hoppar rakt upp ur bild längs vänsterkanten. Ordboksraden går ut. | |
| 13,18 till 13,85 | De fem raderna glider ihop till en fotnotsrad längst ner (54 px, baslinje y = 1010). Your page glider till vänsterkant x = 120, baslinje y = 470. | `[-] ads [-] trackers [-] popups [-] cookie banners [-] scam redirects` |
| 13,73 | Gorillan (250 px) landar på radens baslinje till höger om Your page, som ett sista tecken i raden. Raden gungar till av landningen. | |
| 14,83 till 15,00 | Rullverk: `Your` rullar ut nedåt och `Same` rullar in uppifrån på samma varv och landar på slag 24. `page` knuffas 83 px åt höger. 15,30: punkten sätts. | `Same page.` |
| 15,63 | Fotnotens ord faller ut. De fem orange minustecknen flyger upp, sträcker ut sig och blir ett enda orange streck (från x = 124 till 1690, y = 805 till 809, 26 px). | |
| 15,77 till 16,34 | Andra raden poppar in ord för ord i kursiv 250 px, baslinje y = 740. Strecket är helt 16,20. | `Minus the junk.` |
| 16,34 till 18,33 | Påståendet står. Strecket kokar. Gorillan tittar på oss, gör ett litet nöjt skutt som landar på 17,50 och blinkar 17,90. | `Same page.` och `Minus the junk.` |
| 18,21 till 18,31 | Gorillan hukar och tar sats från baslinjen, rakt upp ur bild. | |
| 18,37 till 18,71 | Av avstampet faller hela påståendet ut nedåt som ett block. Det syns ända tills AdRaze börjar landa, så ingen bildruta är tom. | |
| 18,57 till 18,73 | Gorillan (220 px) faller in uppe till vänster och landar på slag 30 (ritrutans hörn i (100, 60)). | |
| 18,71 till 19,26 | `AdRaze` landar bredvid, en bokstav i taget (InterK 150 px, vänsterkant x = 345, baslinje y = 222). | `AdRaze` |
| 19,37 / 20,63 / 21,87 / 23,13 | Fyra rader, en vartannat slag (News 104 px, vänsterkant x = 250, baslinjer y = 420, 570, 720, 870). Framför varje rad ritas först ett liggande orange streck, sedan reser sig stolpen: minus blir plus. Texten skrivs fram från tecknet åt höger. | `a Chrome extension`, `a browser for Mac and Linux`, `layout and colors your way`, `Family to protect your kids` |
| 20,00 / 21,23 / 22,50 / 23,73 | På slaget efter varje rad landar gorillan i slutet av den, på radens baslinje, som ett sista tecken. Raden gungar 8 px och radens orange plus sväller: en bock i listan. Första gången står AdRaze i vägen, så gorillan hoppar upp ur bild och faller ner på raden. Sedan skuttar den i en båge från rad till rad, alltid till höger om både sin rad och raden ovanför, så att den aldrig skymmer text. 24,37: den tittar på oss och blinkar. | |
| 25,00 till 25,30 | Gorillan tar sats från sista raden och hoppar upp ur bild. Raderna fälls ihop uppåt, nerifrån och upp, en var tionde sekund. Varje plus tappar stolpen och strecket flyger i en båge till knappens plats. | |
| 25,15 till 25,65 | AdRaze glider till slutkortets mått. 25,46 till 25,63: gorillan (440 px) faller in uppifrån och landar på slutkortet på slag 41. | `AdRaze` |
| 25,32 till 25,84 | De fyra strecken blir adressknappen: den växer ett steg för varje streck som kommer fram (ett tjockt orange streck med runda ändar är en knapp). 25,67: adressen poppar in. 25,90 till 26,22: lilla raden. | `adraze.app`, `CHROME EXTENSION · BROWSER FOR MAC AND LINUX` |
| 26,25 till 29,37 | Rent slutkort. Gorillan kokar och blinkar en gång (27,80). | |
| 29,375 till 30,00 | Överlämning. Sidan rullar: slutkortet skjuts upp ur bild och `Your page` kommer upp underifrån. Vid 30,00 är slutkortet helt ute och Your page har 80 px kvar till sin plats, vilket är första bildrutan. | `Your page` |

Sista rena slutkortsruta: 29,33 s (bildruta 880). Där kan en version utan loop kapas. Stillbild för sajten: `renders/omslag.jpg` (17,0 s, påståendet).

## All text i bild

1. `Your page`
2. `ads`, `trackers`, `popups`, `cookie banners`, `scam redirects` (först med plus i bandet, sedan grå med orange minus)
3. `!` (i annonsstjärnorna), `ACCEPT ALL` och `reject` (i kakbandet)
4. `Ad·Raze: to level ads to the ground.`
5. `Same page.` och `Minus the junk.`
6. `AdRaze`
7. `a Chrome extension`, `a browser for Mac and Linux`, `layout and colors your way`, `Family to protect your kids` (med orange plus)
8. `adraze.app`
9. `CHROME EXTENSION · BROWSER FOR MAC AND LINUX`
10. `AD` (lappen i gorillans mun, som i loggan)

## Ändringar mot KONCEPT.md, och varför

Idén är orörd. Det här är ändrat för att planen ska hålla i bild:

1. **Hängande tecken.** Your page och alla ord står i samma textspalt (vänsterkant x = 305 i fullt läge) och plustecknen hänger i marginalen till vänster (x = 110 till 230). Planen hade Your page på x = 120, rakt ovanför plustecknen. Då hade en 200 px gorilla som studsar längs plustecknen täckt Your page vid varje landning, och den raden får aldrig försvinna. Nu har gorillan en egen fil till vänster och texten en egen spalt. Det är dessutom så ett räknestycke ställs upp.
2. **Minus i textspalten.** De jämnade raderna har sitt orange minus först i textspalten, inte i marginalen. Annars hade gorillan dolt de två senaste minustecknen medan den står på nästa plus.
3. **Gorillan står på nästa plus.** Efter varje stamp faller den ner på toppen av nästa plustecken, ser Your page växa, tittar ner, hukar, skuttar rakt upp och stampar. Ett skutt på 0,34 s i stället för en svävande studs på 1,25 s.
4. **Bågarna går över bildkanten.** Remsan är bara 110 px hög när gorillan kommer, så en hög båge ryms inte i bild. Gorillan hoppar upp ur bild och slår ner på ett nytt ställe, tre gånger i filmen (6,87, 13,13 och 18,33). Första gången följer trackerögonen den osynliga bågen, så att man förstår vart den tog vägen.
5. **Gorillan landar på baslinjen** vid påståendet (ritrutans hörn i (1500, 225) i stället för (1500, 200)), så att den står på raden som ett tecken.
6. **Större småtext.** Ordboksraden är 88 px på två rader (planen 64 px på en), de jämnade raderna 64 px och fotnoten 54 px (planen 48). Fotnoten kan inte bli större: hela raden är cirka 31,3 gånger teckenstorleken bred, så 54 px går från x = 120 till 1808, och 56 px hade gått utanför marginalen vid 1824.
7. **Rullverk.** Your byts mot Same som i ett rullverk i stället för att falla ut och poppa in, så att bytet syns som ett byte av just det ordet.
8. **Påståendet faller ut.** Planen lät nästa bild skjuta påståendet uppåt, men nästa bild börjar tom. Nu är orsaken gorillans avstamp från raden: den tar sats, raden ger vika och allt faller ut.
9. **Strecken blir knappen.** De fyra plustecknen tappar stolpen och flyger till knappens plats, och adressknappen växer fram ur dem. Det orange bläcket går hela vägen: fem minus blir ett streck, fyra streck reser sig till plus, fyra plus blir knappen.
10. **Knappen ACCEPT ALL kommer 0,13 s efter femte bandet.** Innan dess är ordet cookie banners för brett för att knappen ska få plats.
11. **Knuffarna i sidled** ligger på slag 8 till 11 och sedan på mellanslagen 13, 15, 17 och 19, så att de inte grumlar gorillans stamp på de jämna slagen.
12. **Första stampen får en paus.** Kameran går in till 1,25 gånger kring första stampen och skräpet tystnar 0,45 s före slaget, så att stampen står ensam. Studsen efter är 36 px i stället för 58, så att huvudet håller marginalen medan kameran är inne.
13. **Bollen längs raderna.** Gorillan landar i slutet av varje orange rad på slaget efter att raden skrivits, som ett sista tecken, och raden gungar. Planens lutande huvud och nickar syntes inte på 220 px och är borta.
14. **Andra raderna.** `a Chrome extension` står först, så att tillägget syns tidigt i andra halvan. `layout and colors your way` ersätter `themes` och `Family to protect your kids` ersätter `Family`, så att raderna säger vad det är. `Falk, your AI assistant` är borta: Falk ingår i Pro, och sajten säger att AdRaze är gratis utan premium.
15. **Ordboksraden säger Ad·Raze.** Namnet står först, så att AdRaze syns vid 8,1 s och inte först vid 18,7 s.

## Ljud

Se `audio/score.py`. Stamp på jämna slag, klapp på udda, en lätt upptakt före nästa stamp och skak i åttondelar. Varje band får en duns och ett eget lager som ligger kvar: reklamslinga (fyrkantston, åttondelar), ekolod (pip var 1,5 slag med eko), poppande (ett pop per ruta som poppar i bild), knackning på två toner (dubbelt så fort sista slagen), siren (glider upp och ner, ett varv på två slag). Varje landning är en stamp, och just det lagret klipps tvärt. Efter fem stamp är bara stamp, klapp och skak kvar. Vid påståendet kommer ett varmt D-durackord in och stannar till slutet. Före första stampen tystnar lagren (reklamslinga, ekolod, knackning, siren) i 0,3 s och ett fallande sus leder in i smällen; bandens skämt hörs 0,15 s efter stampen, som i bild. En stigande marimbaton per orange plusrad (F#, A, B, D) när raden skrivs, och när gorillan landar i slutet av raden en stamp, ett pop och samma ton en oktav upp. Sus för varje skutt. Fyra flax när raderna fälls, ett sus och en duns när gorillan landar på slutkortet (slag 41), slutackord på slag 42. I sista takten smyger reklamslingan in svagt, och efterklangen viks in över början, så att ljudet går runt.

## Logikkoll

Premissens regler:

1. Den översta remsan är din sida. Dess storlek är hur mycket av sidan du får.
2. Varje plustecken i ett färgat band är något webben lägger till, och det tar plats från din sida.
3. När gorillan stampar på ett plustecken plattas stolpen till. Plus blir minus, minuset blir orange, bandet plattas till och din sida får tillbaka platsen.
4. Raderna jämnas uppifrån och ner.
5. Ett orange plustecken är något AdRaze lägger till. De kommer först när skräpet är borta, på papper, och tar ingen plats från din sida.

Scen för scen:

- Varje band gör remsan mindre i samma bildruta som det slår in (remsans höjd och bandets läge är samma funktion). Your page blir 72 px men försvinner aldrig.
- Gorillans avsikt syns: den tittar ner på högen, drar ihop ögonbrynen, hukar och hoppar. Trackerögonen följer den.
- Varje landning träffar toppen av just det plustecknets stolpe. Stolpens topp och gorillans underkant är samma tal under pressen, så kontakten är exakt.
- Att gorillan kan stå på nästa plus utan att det plattas till strider inte mot regel 3: det är stampen efter ett skutt som jämnar, inte att den står stilla. Skillnaden syns (blick, huk, skutt, stamp).
- Raden som jämnas är alltid den översta som är kvar. För varje jämnad rad växer Your page ett steg, och efter fem är den lika stor som i början.
- Påståendet växer ur det som finns i bild: Your rullar till Same, de fem minustecknen blir strecket under Minus the junk.
- De orange plustecknen kommer på tomt papper under ordmärket AdRaze, i lugn text utan band. Remsan finns inte i den bilden, så de tar ingen plats från din sida.
- Slutkortets knapp växer ur de fyra orange strecken.

Följer poängen? Ja: sidan minus skräpet är samma sida. Sedan vem som gör det och vad mer den har.

Bara bilden: allt är text och tecken. Inget hänger på ljudet.

Att räkna i färdig video: fem band, fem stamp, fem minus, fyra orange plus.

## Sanningskoll

Kollat mot koden och sajten i `/home/mint/adraze` den 12 november 2026 (och kollat igen samma dag efter att byggaren bytts: raderna nedan stämmer fortfarande, `download/en/index.html` säger No Windows version. On purpose. AdRaze is built for Linux and Mac.):

| Påstående i bild | Stämmer med |
|---|---|
| ads, trackers, popups med minus | `site/en/index.html` rad 85: AdRaze stops ads, trackers, popups and redirects to dangerous sites before they even load. |
| cookie banners med minus | `README.md` rad 39: AdRaze clicks "Reject all" in common consent banners. Banners without a free reject button are hidden. |
| scam redirects med minus | `site/en/index.html` rad 188: If an ad tries to send you to a scam site, you land on AdRaze's stop page instead. |
| Ad·Raze: to level ads to the ground. | `site/en/index.html` rad 309: To "raze" something means to level it to the ground. That's exactly what it does to ads. |
| Same page. Minus the junk. | `site/en/index.html` rad 124, sajtens egen rubrik. |
| a Chrome extension | `site/en/index.html` rad 320: Free in the Chrome Web Store. Works in Chrome, Brave, Edge, Opera and Vivaldi. |
| a browser for Mac and Linux | `download/en/index.html` rad 124: No Windows version. AdRaze is built for Linux and Mac. |
| layout and colors your way | `browser/anpassa-flikar.js` (flikarna upptill, på sidan eller dolda), `browser/anpassa-verktyg.js` (verktygsraden), `browser/anpassa-tema.js` (accentfärg, ljust, mörkt eller som systemet) |
| Family to protect your kids | `browser/ui/locales/en.json`: Log in to create your Family and protect your kids. |
| CHROME EXTENSION · BROWSER FOR MAC AND LINUX | `README.md` rad 60 (Chrome Web Store), `download/en/index.html` |

Inga andra företag, inga siffror, inget pris, ingen proxy, ingen Windows. Skräpet i bild är påhittat och allmänt (en stjärna med utropstecken, tomma rutor med kryss, ACCEPT ALL, reject).

## Riktiga skärmbilder

Inga. Konceptet är rent typografiskt och vinner inte på en skärmbild: varje bildruta ska vara en affisch med ett par ord. Playwright används för att granska egna rutor (`tools/rutor.cjs`) i full storlek och krympta till 360 px bredd.

## Bygge

`tools/bygg.sh` gör allt i tur och ordning genom låset: musiken (`audio/score.py`), `hyperframes check`, rendering till `renders/ut.mp4`, ljudnivå till -14 LUFS, kapning till exakt 30,0 s och `qa.py kolla`, och skriver `renders/final.mp4`. `tools/bygg.sh utan-musik` hoppar över musiken. `tools/rutor.cjs` tar bildrutor ur `index.html` med Playwright (dold Chromium) och `tools/remsa.sh` lägger varje bildruta i ett avsnitt av den färdiga videon på ett ark.

Kornet ligger i SVG:n som en grupp `#grain` (opacity 0,42 och multiply) med en rektangel inuti som klipps vid papperets kant. Klipp och multiply får inte sitta på samma element: då ritar Chrome med GPU, som renderingen använder, inte kornet alls i de bildrutor där klippet är en kurva (bara i mjukvara). Mätt i färdig video: korn i alla 900 bildrutor, och inget slätt papper någonstans i bild.

## Leverans

- `renders/final.mp4`: 1920 x 1080, 30 bilder per sekund, h264 och aac, 30,0 s, -13,8 LUFS. Kopierad till `../minus.mp4`.
- `renders/webb.mp4`: samma bild utan ljud, h264 yuv420p, faststart, cirka 1,4 Mbit/s (5,4 MB).
- `renders/omslag.jpg`: stillbild 17,0 s (påståendet), 1920 x 1080.
