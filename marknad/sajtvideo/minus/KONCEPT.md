# Koncept: minus

**En mening:** Hela bilden är ett räknestycke i jättetypografi: din sida, plus allt skräp som webben lägger till, tills gorillan studsar ner längs plustecknen och jämnar dem med marken så att varje plus blir ett minus.

**Varför någon stannar på sajten:**

- Den går att läsa i vilken sekund man än kommer in. Varje bildruta är en affisch med högst ett par ord i taget.
- Man känner trängseln i kroppen: raden Your page krymper för varje sak som läggs till, och växer tillbaka för varje stamp.
- Skämtet är typografiskt och förklarar namnet utan att förklara det: att raze är att jämna med marken, och ett plustecken vars stolpe jämnats med marken är ett minustecken.
- Det är den kortaste av de tre (30 s) och den som loopar bäst.

**Grepp:** typografin bär hela argumentet. En enda bild som bygger om sig på taktslagen. Gorillan är bollen som studsar längs raderna.

**Längd:** 30,0 s = 900 bildrutor. **Puls:** 96 slag per minut. Slag k ligger på k x 0,625 s. 12 takter på 2,5 s.

**Skiss:** `skiss.png` i den här mappen (sex nyckelbilder). **Stil:** `../STIL.md`.

## Premissens regler

1. Den översta remsan är din sida. Dess storlek är hur mycket av sidan du får.
2. Varje svart plustecken är något webben lägger till. Varje sådant tar plats från din sida: remsan krymper.
3. När gorillan landar på ett plustecken plattas stolpen till. Plus blir minus, och minuset blir orange. Den radens band sjunker ihop och din sida får tillbaka platsen.
4. Raderna jämnas uppifrån och ner, i läsordning.
5. Ett orange plustecken är något AdRaze lägger till. De kommer först när skräpet är borta, på en egen bild, och tar ingen plats från din sida.

## Byggstenarna

I tabeller och listor nedan betyder `[+]` ett ritat plustecken och `[-]` ett ritat minustecken. De är två bläckstreck med kok, inte tecken ur ett typsnitt, så att stolpen kan plattas till för sig.

**Remsan** överst är paper med korn. Raden `Your page` står i News 500 med vänsterkant x = 120.

**Banden** är färgade fält i full bredd som ligger kant i kant mot bildens nederkant. Varje band har ett plustecken och ett ord i InterK.

| Rad | Ord | Bandets färg och mönster | Ordets färg | Bandet lever så här |
|---|---|---|---|---|
| 1 | `ads` | sun med prickar (`#f0bf1f`) | ink | små stjärnformer poppar bredvid ordet |
| 2 | `trackers` | blue med nät | light | tre små ögon på bandet tittar upp mot Your page |
| 3 | `popups` | rose med prickar (`#e58fa3`) | ink | en liten ruta poppar upp ur bandet på varje slag och lägger sig över bandet ovanför |
| 4 | `cookie banners` | olive med kodformer | light | gul knapp `ACCEPT ALL` till höger som blinkar på slagen, och en pytteliten `reject` (20 px) under |
| 5 | `scam redirects` | night med stjärnor | salmon, plustecknet i light | bandet knuffar hela bilden 12 px i sidled på slagen |

Plustecknet: två streck, längd 0,8 gånger ordets storlek, tjocklek 0,17 gånger ordets storlek, vänsterkant x = 120. Ordet börjar 0,36 gånger sin storlek till höger om plustecknet.

**När högen växer** (banden delar på höjden, remsan får resten):

| Antal band | Remsans höjd | Bandens höjd | Your page | Ordens storlek |
|---|---|---|---|---|
| 0 | 1080 | | 250 px | |
| 1 | 700 | 380 | 250 px | 250 px |
| 2 | 480 | 300 | 190 px | 220 px |
| 3 | 330 | 250 | 140 px | 190 px |
| 4 | 220 | 215 | 100 px | 165 px |
| 5 | 110 | 194 | 72 px | 150 px |

**När högen jämnas.** Ett jämnat band blir en smal rad på papper, 70 px hög, direkt under remsan: orange minustecken (längd 56, tjocklek 14) och ordet i muted, InterK 56 px. Banden som är kvar står orörda mot nederkanten.

| Jämnade rader | Remsans höjd | Your page |
|---|---|---|
| 1 | 234 | 110 px |
| 2 | 358 | 145 px |
| 3 | 482 | 180 px |
| 4 | 606 | 215 px |
| 5 | 730 | 250 px |

Storleksbytena görs med skala och förflyttning på färdiga element, aldrig genom att ändra teckenstorlek eller höjd under rörelse.

**Gorillan** har lappen i munnen hela filmen och gapar aldrig. 200 px när den studsar, 230 px när den tittar fram, 250 px vid påståendet.

## Bild för bild

| Tid (s) | Bild och rörelse | Text på skärmen | Ljud |
|---|---|---|---|
| 0,00 till 0,35 | `Your page` i 250 px glider upp de sista 80 px till mitten av bilden och stannar (fortsättning från slutet). | `Your page` | Ett lugnt ackord. Stamp på slag 0. |
| 0,625 (slag 1) | Första bandet slår in underifrån, 380 px högt. Your page trycks uppåt. | `[+] ads` | Duns. En gäll liten reklamslinga börjar (ljudlager 1). |
| 1,875 (slag 3) | Andra bandet. Remsan 480 px, Your page 190 px. | `[+] trackers` | Duns. Ett pipande ekolod börjar (lager 2). |
| 3,125 (slag 5) | Tredje bandet. Remsan 330 px, Your page 140 px. | `[+] popups` | Duns. Poppande börjar (lager 3). |
| 3,75 (slag 6) | Fjärde bandet. Remsan 220 px, Your page 100 px. | `[+] cookie banners`, `ACCEPT ALL`, `reject` | Duns. En tjatig knackning på två toner börjar (lager 4). |
| 4,375 (slag 7) | Femte bandet. Remsan 110 px. Your page är nu 72 px och klämd mot överkanten. | `[+] scam redirects` | Duns. En glidande siren börjar (lager 5). |
| 5,00 till 7,50 (slag 8 till 12) | Hela högen lever i takt (se tabellen över banden). Vid 6,25 tittar gorillan fram över bildens överkant uppe till höger och ser ner på högen. Vid 6,875 hukar den och hoppar: en hög båge över bilden. | | Alla fem lagren på en gång. Rörigt med flit. |
| 7,50 (slag 12) | Gorillan landar mitt på första plustecknet. Stolpen plattas ner i det liggande strecket: plus blir minus, och minuset blir orange. Det gula bandet sjunker ihop till en smal rad. Your page växer till 110 px. Bilden skakar 10 px. | `[-] ads` | Stamp. Lager 1 tystnar tvärt. |
| 8,125 (slag 13) | Ordboksraden skrivs in uppe till höger (högerkant x = 1824, baslinje y = 104, News 64 px) och står till 13,10. | `raze: to level to the ground.` (kursiv: to level to the ground.) | |
| 8,75 (slag 14) | Studs till nästa plustecken. Your page 145 px. | `[-] trackers` | Stamp. Lager 2 bort. |
| 10,00 (slag 16) | Studs. Your page 180 px. | `[-] popups` | Stamp. Lager 3 bort. |
| 11,25 (slag 18) | Studs. Knappen ACCEPT ALL försvinner med bandet. Your page 215 px. | `[-] cookie banners` | Stamp. Lager 4 bort. |
| 12,50 (slag 20) | Studs. Hela bilden är papper igen. Your page 250 px. | `[-] scam redirects` | Stamp. Lager 5 bort. Bara stamp och klapp kvar. |
| 13,125 till 13,75 (slag 21 till 22) | De fem smala raderna glider ihop till en enda fotnotsrad längst ner (baslinje y = 1010, 48 px). Your page glider till vänsterkant x = 120, baslinje y = 470. Ordboksraden går ut. Gorillan skuttar till höger om raden och landar 13,75 (ritrutans hörn i (1500, 200)). | Fotnoten: `[-] ads  [-] trackers  [-] popups  [-] cookie banners  [-] scam redirects` | Klapp. |
| 15,00 (slag 24) | Ordet `Your` faller ut och `Same` poppar in på samma plats. En punkt sätts efter page. | `Same page.` | Pop. |
| 15,625 till 16,25 (slag 25 till 26) | Fotnotens ord faller ut. De fem orange minustecknen glider ihop till ett enda orange streck (från (124, 800) till (1560, 804), 26 px tjockt). Ovanför strecket poppar andra raden in ord för ord i kursiv 250 px, baslinje y = 740. | `Same page.` och `Minus the junk.` | Pennrasp. Ett varmt durackord kommer in. |
| 16,25 till 18,75 | Håll. Det orange strecket kokar. Gorillan gör ett litet nöjt skutt på takten (17,50) och blinkar (18,10). | | Stamp, klapp och ackordet. |
| 18,75 (slag 30) | Påståendet skjuts upp och ut av nästa bild. Gorillan skuttar till övre vänstra hörnet (220 px, ritrutans hörn i (100, 60)) och `AdRaze` landar bredvid, en bokstav i taget (InterK 150 px, vänsterkant x = 345, baslinje y = 222). | `AdRaze` | Sex pop i stigande ton. |
| 19,375, 20,00, 20,625 och 21,25 (slag 31 till 34) | Fyra rader, en per slag (News 104 px, vänsterkant x = 250, baslinjer y = 420, 570, 720, 870). Framför varje rad ställer sig ett orange plustecken upp: först ett liggande streck, sedan reser sig stolpen. | `[+] a browser for Mac and Linux`, `[+] Falk, your AI assistant`, `[+] themes`, `[+] Family` | En marimbaton per rad, stigande. |
| 21,25 till 25,00 | Håll. Gorillans blick går ner längs raderna, en rad per slag (21,875, 22,50, 23,125, 23,75), och leder läsningen. Sedan tittar den på oss (24,375). | | Stamp och klapp. |
| 25,00 till 26,25 (slag 40 till 42) | De fyra raderna fälls ihop uppåt en efter en och blir adressknappen. Gorillan och AdRaze växer och glider till slutkortets mått. Lilla raden kommer sist. | `AdRaze`, `adraze.app`, `CHROME EXTENSION · BROWSER FOR MAC AND LINUX` | Fyra flax, en pop, slutackord. |
| 26,25 till 29,375 | Rent slutkort. Gorillan kokar och blinkar en gång (27,80). | | Stamp och klapp mjukt. |
| 29,375 till 30,00 (slag 47) | **Överlämning.** `Your page` kommer upp underifrån och skjuter slutkortet upp ur bild. Vid 30,00 är slutkortet helt ute och Your page har 80 px kvar till sin plats. | `Your page` | Lager 1 smyger in som upptakt. |

Sista rena slutkortsruta: 29,33 s. Där kan en version utan loop kapas. Förslag på stillbild för sajten: 6,5 s (hela högen) eller 17 s (påståendet).

## All text i bild

1. `Your page`
2. `ads`, `trackers`, `popups`, `cookie banners`, `scam redirects` (först med svart plus, sedan med orange minus)
3. `ACCEPT ALL` och `reject` (i bandet cookie banners)
4. `raze: to level to the ground.`
5. `Same page.` och `Minus the junk.`
6. `AdRaze`
7. `a browser for Mac and Linux`, `Falk, your AI assistant`, `themes`, `Family` (med orange plus)
8. `adraze.app`
9. `CHROME EXTENSION · BROWSER FOR MAC AND LINUX`

## Ljud

Stamp och klapp i 96 slag per minut. Ljudet berättar samma sak som bilden: det blir rörigt, och sedan dras en sak i taget bort. Allt syntas med numpy.

- Grunden: en djup stamp (som `boom()` i score.py) och en handklapp. Ingen melodi i början.
- Varje band som läggs till får ett eget irriterande ljudlager som sedan ligger kvar: en gäll reklamslinga, ett pipande ekolod, poppande, en tjatig knackning på två toner, en glidande siren. Vid slag 8 låter alla fem samtidigt.
- Varje gång gorillan landar: en stamp, och just det bandets lager tystnar tvärt. Efter fem stamp är bara stamp och klapp kvar. Den som har ljudet på hör subtraktionen.
- Vid påståendet kommer ett varmt durackord in (en mjuk matta) och stannar.
- De fyra orange plusraderna får en stigande marimbaton var.
- Under slutkortet fortsätter stamp, klapp och ackord mjukt. I sista takten smyger lager 1 in som upptakt, så att ljudet också går runt.

## Loopen

Bilden rullar som en sida: nytt kommer underifrån och skjuter ut det gamla uppåt, samma rörelse som när banden slår in. Your page börjar röra sig 29,375 och står still 0,35. Skriv dess läge som en funktion av u (u = t i början, u = t - 30 i slutet). Vid skarven är slutkortet helt ute ur bild och Your page har 80 px kvar. Första bandet är redan på väg in under bildkanten och landar på slag 1.

## Playwright

Den här videon har inga riktiga skärmbilder. Playwright används för att titta på egna rutor i full storlek och i liten storlek: ta nyckelbilderna 0,9, 6,5, 10,0, 17,0, 23,0 och 28,0 s, och krymp dem till 360 px bredd. Varje ord ska gå att läsa även då. Kontrollera också att inget ord skärs av bildkanten i något av stegen (det bredaste är cookie banners).

## Logikkoll

1. **Reglerna** står överst.
2. **Scen för scen:**
   - Uppbyggnaden: varje nytt band gör remsan mindre i samma ögonblick som det landar. Orsak och verkan syns i samma bildruta.
   - Efter fem band är Your page liten men läsbar. Den får aldrig försvinna helt, då finns inget att rädda.
   - Gorillans avsikt syns: den tittar ner på högen, hukar, hoppar.
   - Varje landning träffar ett plustecken, och det är just det tecknets stolpe som plattas till. Kontakten ska synas.
   - Ordningen är uppifrån och ner. Raden som jämnas är alltid den översta som är kvar.
   - För varje jämnad rad växer Your page ett steg. Efter fem är bilden papper igen och raden lika stor som i början.
   - Påståendet växer ur det som redan finns: Your blir Same, och de fem minustecknen blir strecket under Minus the junk.
   - De orange plustecknen kommer på en egen bild under ordmärket AdRaze, i lugn text på papper, utan band. De kan inte förväxlas med skräpet.
3. **Följer poängen?** Ja: sidan minus skräpet är samma sida. Sedan vem som gör det och vad mer den har.
4. **Bara bilden:** allt är text och tecken. Inget hänger på ljudet.

Saker att räkna i den färdiga videon: fem band läggs till, fem stamp, fem minustecken i fotnoten, fyra orange plus.

## Sanningskoll

Sökvägarna utgår från `/home/mint/adraze`.

| Påstående i bild | Stämmer med |
|---|---|
| ads, trackers, popups med minus | `site/en/index.html`: AdRaze stops ads, trackers, popups and redirects to dangerous sites before they even load. |
| cookie banners med minus | `README.md`: AdRaze clicks Reject all in common consent banners. Banners without a free reject button are hidden. |
| scam redirects med minus | `site/en/index.html`: If an ad tries to send you to a scam site, you land on AdRaze's stop page instead. |
| raze: to level to the ground. | Sajtens egen fråga Why is it called AdRaze? |
| Same page. Minus the junk. | Sajtens egen rubrik över jämförelsen. |
| a browser for Mac and Linux | `download/en/index.html`: built for Linux and Mac, ingen Windows-version |
| Falk, your AI assistant | Appens egna ord (`browser/ui/locales/en.json`). Falk hör till Pro: därför inget om pris och inget free. |
| themes | `browser/anpassa-tema.js` (färdiga teman, accentfärg, ljust och mörkt), `browser/anpassa-galleri.js` |
| Family | Appens egen rubrik för familjeläget (`browser/ui/shell.html`, `browser/ui/locales/en.json`) |
| CHROME EXTENSION · BROWSER FOR MAC AND LINUX | Chrome Web Store, `download/en/index.html` |

Inga andra företag nämns eller visas. Inga siffror. Ingen proxy.

## Får förenklas, får inte förenklas

Får förenklas om tiden tryter:

- Bandens eget liv kan begränsas till två: knappen som blinkar och ögonen som tittar.
- Fotnotsraden kan hoppas över: de fem smala raderna kan bli strecket direkt.
- Gorillans båge över bilden vid 6,875 kan vara ett rakt fall uppifrån.

Får inte förenklas:

- Att Your page krymper och växer i takt med banden. Det är hela filmen.
- Att stolpen plattas till av gorillans landning, och att minuset blir orange.
- Att orden går att läsa i 360 px bredd.
- Att de orange plustecknen kommer först när allt skräp är borta.
