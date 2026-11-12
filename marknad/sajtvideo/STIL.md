# Stilguide: AdRaze sajtvideo i ritstilen

Tre videor byggs efter den här guiden: `hungrig`, `vikblad` och `minus`. De ska se ut att vara ritade av samma hand, på samma papper, med samma gorilla. Varje byggare läser hela guiden och sedan sitt eget `KONCEPT.md`. Där konceptet säger något annat än guiden gäller konceptet för just den videon.

Förebilden är `/home/mint/adraze-reels/exempel/ritvideo/` (`index.html`, `audio/score.py`, `renders/final.mp4`). Vi tar tekniken därifrån: papperet, bläcklinjen som kokar, kornet, den orange klicken, mönstermarkerna och gorillan. Vi tar inte dess scener eller repliker (se avsnitt 14).

Bilder att titta på innan du börjar:

- `/home/mint/adraze/marknad/sajtvideo/gorilla-poser.png`: gorillans poser, ritade med koden i avsnitt 16.
- `/home/mint/adraze/marknad/sajtvideo/slutkort-skiss.png`: det gemensamma slutkortet med rätt mått.
- `skiss.png` i varje konceptmapp: nyckelbilder som stillbilder. De visar placering, storlek och färg. Rörelse, kok och korn saknas.

## 1. Format

- 1920 x 1080, 30 bilder per sekund, h264 och aac.
- Längd: hungrig 32,0 s, vikblad 36,0 s, minus 30,0 s. Antalet bildrutor ska vara delbart med 3, så att koket går jämnt över skarven.
- Videon spelas tyst på sajten. Allt som ska förstås står i bild som teckning eller kort text. Ljudet är en bonus.
- Videon loopar. Slutet lämnar över till början (avsnitt 13).
- Första bildrutan är redan rörelse. Ingen tom bild, ingen bild som bara är logga.
- Marginaler: inget viktigt närmare kanten än 96 px i sidled och 54 px i höjdled.
- Räkna med mobilen. På en 360 px bred skärm blir 100 px text 19 px hög. Därför är måtten i avsnitt 3 stora.

## 2. Färger

| Namn | Hex | Roll |
|---|---|---|
| paper | `#ede5d6` | Marken. Hemmascenen i alla tre videorna. Alltid med korn. |
| paper2 | `#e3d9c6` | Andra papperstonen: baksidor, lugna plattor. |
| sheet | `#fbf7ef` | Vitt papper: lappar, ritade sidor, fönster. |
| ink | `#1b1916` | All linje och all lugn text. |
| night | `#151412` | Mörk mark. |
| light | `#f4efe6` | Text och linje på mörk mark. |
| or | `#ff4b1f` | AdRaze-orange. Ransoneras, se nedan. |
| blue | `#5d7fa3` | Färgad mark. |
| olive | `#5f6b45` | Färgad mark. |
| sun | `#ffd23e` | Skräpets färg: annonser, knappar. Också gorillans lapp. |
| rose | `#f2a7b8` | Skräpets färg. |
| mint | `#9fd3c7` | Skräpets färg. |
| lilac | `#c7b8f5` | Skräpets färg. |
| salmon | `#ff8e72` | Varning, bluff. |
| muted | `#8d8273` | Dämpad linje och dämpad text från 48 px. |
| dov | `#5a5146` | Små rader. |
| päls | `#3a332d` | Gorillan. |
| ansikte | `#c9b8a0` | Gorillan. |

Regler:

- Orange är gorillans färg. Den får finnas på klicken bakom gorillan, på adressknappen och på EN markering per bild (en ring, en understrykning eller ett minustecken). Aldrig som löpande text under 150 px: mot papper är kontrasten bara 2,7:1.
- Pastellerna (sun, rose, mint, lilac, salmon) hör till skräpet. Inget som är AdRaze får en pastell, utom lappen i gorillans mun.
- Inga övertoningar. Ingen genomskinlighet utom i mönstren och i tuschpennan (0,9).
- Uppmätt kontrast: ink på paper 14:1, light på night 16:1, ink på pastellerna 8 till 12:1, light på olive 5:1, light på blue 3,7:1 (bara text från 64 px), vit på orange 3,3:1 (bara adressknappen, 66 px fet), muted på paper 3:1 (bara från 48 px).

### Marker

| Mark | Färg | Mönster | Mönstrets färg |
|---|---|---|---|
| Papper | `#ede5d6` | inget, men korn | |
| Ljus mönstermark | `#e8dfcc` | net | `#cbbd9f` |
| Blå | `#5d7fa3` | dots | `rgba(244,239,230,.32)` |
| Oliv | `#5f6b45` | code | `rgba(244,239,230,.28)` |
| Natt | `#151412` | stars | `rgba(244,239,230,.55)` |

Mönstren ritas med `pattern()` i avsnitt 16. De ligger stilla och kokar som en grupp (högst 3 px, ingen rotation). Papper är hemma. En mönstermark betyder alltid en annan plats eller ett annat läge än hemma. Byte av mark sker hårt på ett taktslag eller genom att den orange klicken sveper över bilden. Aldrig övertoning mellan två marker. Aldrig korn på en mönstermark.

## 3. Typsnitt och storlekar

Filerna ligger i förebildens `assets/fonts/`. Kopiera dem och använd samma namn i `@font-face`: `News` (Newsreader.ttf, vikt 200 till 800), `NewsI` (Newsreader-Italic.ttf), `InterK` (InterDisplay-Black.otf, 900), `InterB` (Inter-Bold.otf, 700), `InterM` (Inter-Medium.otf, 500), `Caveat` (Caveat-700-latin.woff2, 700).

Tre röster, och de blandas aldrig:

- **Newsreader 500 är den lugna rösten.** Berättarraderna och det tittaren ville ha. Ord som betonas sätts i Newsreader Italic, samma vikt och samma färg.
- **Inter Display Black är det som skriker.** Annonser, skyltar, knappar. Samma typsnitt bär ordmärket AdRaze.
- **Caveat är pennan.** Våra anteckningar på riktiga skärmbilder, och bara där.

| Roll | Typsnitt | Storlek | Övrigt |
|---|---|---|---|
| Berättarrad | News 500, betoning NewsI | 104 px (lägst 88) | radavstånd 1,04, teckenavstånd -0,02em |
| Slagord, jättetext | InterK 900 eller News 500 | 150 till 330 px | InterK: teckenavstånd -0,035em |
| Skylt, annons, knapp | InterK 900 | 56 till 110 px | svart text i färgad ruta med bläckkontur |
| Handskrift | Caveat 700 | 96 px (lägst 72) | lutar 2 till 4 grader, kokar |
| Text i ritat gränssnitt | InterB 700 | 40 till 76 px | |
| Liten versalrad | InterM 500, versaler | 40 px (lägst 36) | teckenavstånd 0,14em, färg dov. Bär aldrig poängen. |
| Ordmärket | InterK 900 | 240 px på slutkortet | teckenavstånd -0,035em |
| Adressen | InterB 700 | 66 px | vit på orange knapp |

Regler för text:

- Engelska i bild. Berättarrader är hela meningar med punkt.
- Högst två rader och högst sex ord per rad. En berättarrad i taget.
- Text som har landat står stilla tills den går ut. Den kokar inte, driver inte, växer inte.
- Lästid: 0,5 s plus 0,3 s per ord. Sista raden i videon minst 2 s.
- Ingen text under 36 px. Blir det trångt: stryk ord, krymp aldrig. Enda undantaget är lilla `reject` i kakrutan, som är för liten med flit.
- Ligger texten över något rörigt läggs den på en lapp (avsnitt 9).
- Inga tankstreck och inga emojier i bild.

## 4. Linjen

- Bläcklinjen är 8 px (7 till 9) i `#1b1916` med runda ändar och runda hörn. Detaljer 5 till 6 px. Tunga drag 10 px och uppåt. Dämpade textrader på ritade sidor är 9 px i muted.
- Ingen linje är rak. Allt ritas som punkter genom `smooth()` och får darr av `jit()`. Rektanglar görs med `rectPts()`, annars rundar `smooth()` av hörnen till en ost.
- Fyllda former har alltid bläckkontur. Undantag: klicken och mönstren.
- Inga skuggor, ingen oskärpa, inget sken.
- En linje ritas fram med penndrag: `pathLength="1"`, `stroke-dasharray: 1 1`, och `strokeDashoffset` från 1 till 0. Håll linjen osynlig (opacity 0) tills draget börjar, annars syns den runda änden som en prick. Korta drag 0,2 till 0,3 s (`power3.in` för ett kryss), konturer 0,45 till 0,9 s (`power2.inOut`).
- Sätt aldrig `fill` i en CSS-klass för linjer. En CSS-regel vinner över attributet `fill=`, och då blir fyllda former genomskinliga. Sätt `fill="none"` på just de banor som ska vara tomma.

## 5. Koket (hw-boil)

Koket är det som gör att teckningen lever: konturen ritas om med ny darr var tredje bildruta, alltså 10 gånger i sekunden. Det är samma idé som komponenten `hw-boil` i HyperFrames-registret, och förebilden gör det med funktionerna `boil` och `shapeBoil`. Posen är en ren funktion av tidslinjens tid genom en hash med frö. Inget slumpas.

- Steget: `step(t) = floor(t * 30 / 3)`.
- Banor: `jit(punkter, frö, step(t), amp)`. Stora konturer (fönster, sidor) amp 3. Små former och linjer 2 till 2,5. Klickar 4 till 5.
- Grupper och bilder som kokar hela (shapeBoil): x och y högst 1,6 px, rotation högst 0,4 grader. Handskrift 1,2 px och 0,35 grader. Mönster 3 px utan rotation.
- Det här kokar aldrig: satt text, riktiga skärmbilder, adressknappen.
- Varje element har eget frö. Två saker som darrar i takt ser kopierade ut.
- Koket går så länge elementet syns. Även under pauser och på slutkortet. Det är det som håller en stillastående bild vid liv.
- Rörelser går i 30 bilder per sekund, koket i 10. Den skillnaden är stilen. Hacka inte rörelserna för att matcha koket.

Tekniska regler (samma som i hw-boil):

- Koket äger x, y och rotation på elementet det kokar. Ingångar och utgångar som flyttar eller skalar läggs på en wrapper runt det.
- Tidslinjen har en enda `onUpdate`. Allt som ritas per bildruta läggs i listan `R` och körs därifrån (avsnitt 16).
- Koka aldrig ett element som har ett eget SVG-transform. Lägg en ren grupp innanför och koka den.

## 6. Kornet

Papper och vitt papper har korn. Använd förebildens `.grain` oförändrad: ett stillastående brus som läggs över med multiply.

```css
.grain { position: absolute; inset: 0; opacity: .42; mix-blend-mode: multiply; pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .3  0 0 0 .55 0'/></filter><rect width='300' height='300' filter='url(%23n)'/></svg>"); }
```

- Kornet ligger överst i varje pappersscen, över teckningen men under ingenting.
- Kornet rör sig aldrig. Rörligt korn flimrar och kostar bitar i den färdiga filen.
- Inget korn på mönstermarker eller natt.

## 7. Klicken, pennan och mönstren

**Den orange klicken** är en ojämn cirkel: `blobPts(cx, cy, r, frö, 12 till 16 punkter, ojämnhet 0,06 till 0,1)` med kok 4 till 5. Den kommer in med `back.out(1.8)` på 0,5 s och andas sedan långsamt i radie (`sine.inOut`). Den har tre jobb och inga andra:

1. Den ligger alltid bakom gorillan.
2. Den äter: skräp som rör den försvinner.
3. Den sveper: växer över hela bilden på 0,55 s (`power3.in`) och lämnar nästa mark efter sig.

**Tuschpennan** är ett orange streck på 22 till 26 px (understrykning) eller 64 till 72 px (överstrykning), opacity 0,9, som ritas fram som ett penndrag. En per bild.

**Mönstren** står i avsnitt 2.

## 8. Gorillan

Gorillan är loggan: ett gorillahuvud med en gul AD-lapp i munnen, på en orange klick. Källorna:

- `/home/mint/adraze/logo/nya/gorilla.html`: ritkoden (funktionen `huvud` och varianten med lapp).
- `/home/mint/adraze/logo/gorilla/adraze-gorilla.svg`: den färdiga loggan. `adraze-gorilla-levande.svg` är samma logga med fyra kokande bildrutor.
- `/home/mint/adraze-reels/tillgangar/logga/adraze-gorilla-1024.png`: som bild.

Vi ritar den från lagren med funktionen `gorilla(pose)` i avsnitt 16. Den är prövad: neutral pose med steg 1 ger exakt samma banor som den officiella loggan (12 av 12). Använd den i alla tre videorna så att gorillan är densamma. Se `gorilla-poser.png`.

Posen har sju värden: `tag` (lapp i munnen eller vanlig mun), `look` (vart pupillerna tittar), `blink`, `brow` (-1 hungrig, 0 lugn, 1 glad), `jaw` (gap, bara utan lapp), `cheeks` (fulla kinder) och `blob` (klicken).

Så rör den sig:

1. Den är ett huvud på en klick. Den har aldrig kropp, armar eller ben. Rita inget sådant.
2. Alltid framifrån, alltid upprätt. Den får luta högst 12 grader.
3. Den förflyttar sig med skutt. Sats: huka i 3 bildrutor (höjd 0,9). Hopp upp 0,18 s (`power2.out`), ner 0,16 s (`power2.in`). Landning: bredd 1,12 och höjd 0,88 i 3 bildrutor, sedan fjädring tillbaka på 6 till 8 bildrutor (`back.out(2)`). Tillplattningen utgår från underkanten.
4. Blicken går först. Pupillerna flyttar sig 2 till 3 bildrutor innan huvudet rör sig, dit något ska hända.
5. Blinkning: 2 till 3 bildrutor, högst en var tredje sekund, aldrig mitt i något som ska läsas.
6. Humör byts genom en tagning: stanna 3 bildrutor, byt ögonbryn, fjädra. Aldrig ett tvärt byte.
7. Med lapp är den loggan. Utan lapp kan den gapa och tugga. I `hungrig` får den lappen först i slutet. I `vikblad` och `minus` har den lappen hela tiden och gapar aldrig.
8. Storlek som skådespelare: 200 till 460 px. På slutkortet 440 px. Linjerna skalar med storleken. Gör dem aldrig tunnare.
9. Klicken följer alltid med och kokar.
10. Den talar aldrig. Inga pratbubblor, inga tankebubblor.
11. På slutkortet står den i neutral pose med lapp. Då är den loggan, punkt för punkt.

## 9. Bildtext, lappar, handskrift och riktiga skärmbilder

**Berättarraden** står direkt på marken när ytan bakom är lugn. Orden kommer ett i taget: opacity 0 till 1 och y från 40 till 0 på 0,35 s med `back.out(2)`, 0,08 s mellan orden (förebildens `words()`). Ut går raden på 0,2 s eller med scenen.

**Lappen** används när raden ligger över något rörigt: vitt papper (`#fbf7ef`) med bläckkontur 6 px (`rectPts`, hörn 12, kok 2), luft 26 px över och under texten och 44 px i sidled, lutad 1,2 till 1,8 grader. Lappen poppar in som en skylt (skala 0,8 till 1, 0,3 s, `back.out(2.2)`) på en wrapper, och orden kommer sedan som vanligt.

**Handskriften** (Caveat) skrivs fram ord för ord och kokar. Den hör ihop med en pil eller en ring. Pilar är bläck 7 px med två korta streck som spets.

**Riktiga skärmbilder** (se `vikblad/KONCEPT.md` för hur de tas):

- De är äkta och oretuscherade, tagna i en egen dold instans av AdRaze. Ingen text, siffra eller färg i en skärmbild ändras i efterhand. Beskära och förstora är tillåtet.
- Ramen: bildens hörn klipps med radie 14, och en bläckkontur på 8 px (`rectPts`, hörn 16, kok 2,5) ritas runt. Bilden själv kokar inte.
- En skärmbild som ska läsas ligger plant. Den får vika sig i rymden medan den kommer in eller går ut, aldrig medan den visas.
- Allt ritat ovanpå (ringar, pilar, handskrift) är vår kommentar. Det får aldrig se ut som gränssnitt.
- En orange ring eller understrykning per bild.
- Bara engelska i bild. Syns ett svenskt ord: beskär eller välj en annan vy. Kända svenska rester i engelskt läge: Anpassa-panelen i inställningarna (av cirka 300 texter där finns ett fyrtiotal på engelska) och ordet Anpassa i inställningarnas meny, Visa bara ikoner under flikpanelen, och Falks rader om vad den ändrat.
- Inga personnamn i bild. Startsidans foto visar fotografens namn: stäng av fotot (`startsida.bakgrund` = false).
- Inga andra företags ikoner. Startsidans förvalda genvägar är andra sajter: byt dem mot AdRaze egna sidor eller ta bort dem.
- Aldrig sajtens meny i bild. Länken Proxy står kvar där och proxyn är nedlagd.
- Siffror i bild är de som instansen visade.

## 10. Rörelse och rytm

| Vad | Hur |
|---|---|
| Skylt eller lapp poppar in | skala 0 till 1, 0,28 s, `back.out(2.6)` |
| Skylt försvinner | skala till 0, vridning 30 till 60 grader, 0,16 till 0,2 s, `power3.in` |
| Ord i berättarrad | 0,35 s, `back.out(2)`, 0,08 s emellan |
| Bokstäver i ordmärket | y 60 till 0, 0,3 s, `back.out(2.4)`, 0,05 s emellan |
| Kameran (wrapper runt scenen) | 0,45 till 0,6 s, `power2.inOut` |
| Klicken in | 0,5 s, `back.out(1.8)` |
| Klicken sveper | 0,55 s, `power3.in` |
| Skak när något slår ner | 6 till 14 px, 4 till 8 bildrutor, ur hashen `H`, avtagande |
| Ankomster i övrigt | lång svans: `power3.out` eller `expo.out` |
| Utgångar i övrigt | korta: 40 till 50 procent av ingången, `power3.in` |

- Varje video har en egen puls (se konceptet). Det som slår ner, slår ner på ett taktslag. Räkna varje slag från sitt nummer (slag k = k x 60 / BPM) och avrunda till bildruta. Lägg aldrig ihop avrundade slag.
- Något nytt händer varannan till var fjärde sekund. Ingen bild står utan rörelse längre än 1,2 s, utom slutkortet (där kokar gorillan).
- En huvudrörelse per bild. Resten väntar eller rör sig mindre och 0,1 till 0,2 s senare.
- Stanna 0,3 till 0,7 s före det största ögonblicket. Det största ögonblicket spelas i normal fart.
- Övergångar har en orsak som syns: gorillan knuffar, klicken sveper, papper viks, en rad skjuter ut en annan. Hårda klipp bara inom en scen eller på ett taktslag med byte av mark. Aldrig övertoning mellan scener, aldrig svart bild.
- Tittaren är pekaren. Vi ritar inga människor.

## 11. Ljud

Ingen röst. Musiken syntas i Python med numpy och scipy som i `/home/mint/adraze-reels/exempel/ritvideo/audio/score.py` (48 kHz, stereo, mjuk begränsning med tanh, skrivs till `assets/score.wav`). De tre videorna får tre olika sorters musik (se varje koncept), men samma verktygslåda för effekter, så att de hör ihop:

| Effekt | När | Recept ur score.py |
|---|---|---|
| Pennraspet | en linje ritas fram | `scratch()` |
| Pop | en skylt eller lapp poppar in | `pop()`, stigande ton i en serie |
| Duns | något tungt landar | `boom()` eller `kick()` |
| Svep | klicken sveper, papper viks, kameran flyttar | `whoosh()` |
| Tick | text som skrivs, räknare | `tick()` |

- Varje effekt hör till något som syns, på samma bildruta eller en bildruta efter. Inga effekter utan orsak i bild.
- Samma effekt som upprepas byter tonhöjd eller panorering varje gång.
- Musiken spelar hela vägen, också under slutkortet. Mät nivån per sekund i `titta.py`-filen `.ljud.txt`: inget hål.
- Musiken ska också loopa. Längden är ett helt antal takter. Låt efterklangen från sista takten vikas in över första takten (lägg svansen som går förbi slutet ovanpå början), så hörs ingen skarv.
- Nivå: `python3 /home/mint/adraze-reels/verktyg/qa.py normalisera in.mp4 ut.mp4` ger -14 LUFS med topp -1 dB.
- Inga lånade ljud, ingen upphovsrättsskyddad musik.

## 12. Slutkortet

Slutkortet är detsamma i alla tre videorna. Mått (se `slutkort-skiss.png`):

| Del | Mått |
|---|---|
| Mark | paper med korn |
| Gorillan | 440 px, ritrutans övre vänstra hörn i (283, 204). Neutral pose med lapp. |
| AdRaze | InterK 900, 240 px, teckenavstånd -0,035em, ink. Vänsterkant x = 777, baslinje y = 511. |
| Adressknappen | orange pille 440 x 124 px, radie 62, övre vänstra hörnet i (781, 568). Texten `adraze.app` i InterB 66 px, vit, mitt i knappen. |
| Liten rad | `CHROME EXTENSION · BROWSER FOR MAC AND LINUX`, InterM 40 px, versaler, teckenavstånd 0,14em, färg dov, mitt på x = 960, baslinje y = 836. |

- Kortet byggs, det tonas inte in. Normalordningen: gorillan kommer först och av egen kraft (varje koncept säger hur), sedan bokstäverna i AdRaze en i taget, sedan knappen (skala 0,6 till 1, 0,35 s, `back.out(2.4)`), sist den lilla raden (upp 24 px och in på 0,35 s). Ett koncept får ha en annan ordning om den har en orsak i bild: i `vikblad` kommer texten med omslaget och gorillan landar sist.
- När allt har landat står kortet rent i minst 2,5 s. Gorillan kokar och blinkar en gång. Inget annat rör sig.
- Inget annat får stå på kortet: ingen slogan till, inga fler färger.

## 13. Loopen

- Tillståndet vid videons längd D (bildrutan som aldrig renderas) ska vara exakt samma som vid tiden 0. Då syns ingen skarv när sajten spelar om.
- Bygg överlämningen som EN rörelse som börjar strax före slutet och fortsätter strax efter början. Skriv den som en funktion av u, där u = t i början av videon och u = t - D i slutet. Samma funktion, samma element, samma frön.
- Skarven läggs där rörelsen är som snabbast, med samma riktning och fart på båda sidor.
- Överlämningen tar högst 0,8 s och kommer efter det rena slutkortet.
- Inget tonas mot svart eller vitt. Sajten kan också stanna på sista rena slutkortsrutan: varje koncept anger den tiden, så att en version utan loop kan kapas där.

## 14. Förbjudet

Sant och rätt:

- Proxyn. Den är nedlagd. Den nämns inte och syns inte.
- Windows. Webbläsaren finns för Mac och Linux.
- Pris och ordet free. Falk hör till Pro, så ingenting om vad något kostar.
- Påhittade siffror. Siffror kommer ur koden, sajten eller en riktig skärmbild.
- Riktiga personers namn, ansikten och användarnamn.
- Andra företags logotyper och namn. Skräpet i bild är påhittat och allmänt (SALE!, Skip in 5, We value your privacy).
- Påståenden som inte står i varje koncepts sanningskoll.

Utseende:

- Övertoningar, sken, skuggor, glas, oskärpa, partiklar.
- Raka datorlinjer och perfekta cirklar. Allt går genom `smooth()` och `jit()`. Undantag: satt text, riktiga skärmbilder, adressknappen.
- Ritade människor, ikonbibliotek, emojier.
- Text under 36 px, fler än två rader berättartext, text som rör sig medan den läses.
- Orange som löpande text. Pasteller på något som är AdRaze.
- Riktigt gränssnitt som lutar i rymden medan det visas.
- Loggan i ett hörn under filmen. Gorillan är med som figur, ordmärket kommer på slutkortet.

Rörelse och teknik:

- Övertoning mellan scener, svart bild, tom bild, stillastående bild.
- Samma ingång på allt. Allt som tonar in och glider upp.
- `Math.random`, `Date.now`, timers, CSS-animationer, `repeat: -1`. Allt i bild är en funktion av tidslinjens tid.
- CSS-transform på något som GSAP flyttar. Rörelse på `left`, `top`, `width` eller `height`.

Ur förebilden får vi inte ta:

- Replikerna: The internet, today. / Until now. / A browser that blocks the noise. / You browse. AdRaze blocks. / Same web. Less noise. / Made in Sweden. / Built for everyone. / The web, without the noise.
- Scenerna: kupolen över gubben vid datorn, de fyra funktionspanelerna, tuschsicksacken över sidan, Sverigekartan och jordgloben.
- Skyltarna YOU WON!, BUY NOW, 50% OFF, CLICK HERE, VIRUS FOUND!, FREE $$$, Subscribe?, LIMITED DEAL, Accept cookies, HOT OFFER. Skriv nya.

## 15. Bygge och granskning

Projektet ligger i `/home/mint/adraze/marknad/sajtvideo/<namn>/`. Kopiera förebildens stomme (`package.json`, `hyperframes.json`, `meta.json`, `assets/fonts/`), byt namnet i `package.json` och `meta.json`, och skriv en ny `index.html`. Läs `/home/mint/adraze-reels/.claude/skills/hyperframes/SKILL.md` och det den pekar på innan du skriver. Rör inget annat i `/home/mint/adraze`.

Stommen i `index.html`:

```html
<meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
...
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="32">
  <section id="s1" class="clip scene" data-start="0" data-duration="6.9" data-track-index="1"> ... </section>
  ...
  <audio id="score" src="assets/score.wav" data-start="0" data-duration="32" data-track-index="9"></audio>
</div>
```

Allt tungt körs ett i taget och i lätt läge, genom låset:

```sh
cd /home/mint/adraze/marknad/sajtvideo/<namn>
flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt npx --yes hyperframes@0.8.140 check
flock /home/mint/.cache/claude-arbete/tung.lock env LATT_MEM=5000M /home/mint/bin/latt npx --yes hyperframes@0.8.140 render -o renders/ut.mp4
flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt python3 /home/mint/adraze-reels/verktyg/qa.py normalisera renders/ut.mp4 renders/final.mp4
flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt python3 /home/mint/adraze-reels/verktyg/qa.py kolla renders/final.mp4
flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt /home/mint/whisper-venv/bin/python /home/mint/adraze-reels/verktyg/titta.py renders/final.mp4 0.5 --utan-text
```

Titta på nyckelbilder redan före rendering, så hittas fel medan de är billiga:

```sh
flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt npx --yes hyperframes@0.8.140 snapshot --at 5.8,12.5,19.4 --describe false
```

Bilderna hamnar i `snapshots/`. Skriv alltid `--describe false`, så att inga bilder skickas till någon bildtjänst utanför datorn. Med `--zoom '#id'` fås ett skarpt utsnitt av ett element.

Vänta på låset och gå aldrig runt det. Samma lås gäller när du syntar musiken, tar skärmbilder och plockar ut bildrutor med ffmpeg. Dödas renderingen av minnesgränsen syns det i utskriften: kör då om, inte parallellt med något annat.

Kända fällor:

- `qa.py kolla` är skriven för stående video och klagar på måtten 1920 x 1080. Det felet är väntat. Allt annat ska vara rätt: h264, aac, -16 till -12 LUFS, topp under -0,5 dB.
- `titta.py` gör rutnät för stående video, så våra liggande bilder blir bara 270 px breda. Läs alla rutnät, och ta dessutom ut bildrutor i full storlek vid varje text och varje nyckelbild: `ffmpeg -ss <tid> -i renders/final.mp4 -frames:v 1 ruta-<tid>.png`. Läs dem med Read.
- Ligger sista bildrutan exakt på videons slut blir sista rutnätet tomt. Kör då också `titta.py ... 0.49 --utan-text`. Det passet skriver över de första arken, så läs dem emellan.
- Titta särskilt på skarven: sista bildrutan och första bildrutan bredvid varandra.
- HTML-text tonas med `style.opacity`, inte med attributet opacity. SVG som skalas från en punkt behöver `svgOrigin`, inte `transformOrigin` i px.
- Något som INTE ska röra vid något annat behöver minst 18 px luft i full storlek.
- Ett stort element som lämnar bilden samtidigt som nästa landar blir rörigt: låt det gamla gå ut på 0,2 s och det nya vänta tills det är borta.
- Döda dina egna processer via deras PID när du är klar. Aldrig en processgrupp, aldrig något du inte själv startat.

Granska som en besökare på sajten: stäng av ljudet i tanken och fråga vid varje nyckelbild vad en främling förstår. Krympt till 360 px bredd ska varje berättarrad gå att läsa.

## 16. Kodbilaga: ritfunktionerna

Klistra in det här blocket oförändrat i `index.html` före scenkoden. Det är prövat: `gorilla({})` med steg 1 ger loggans banor, och lagren byts rätt mellan poserna.

```js
/* ===== Gemensamma ritfunktioner för sajtvideorna. Klistras in i index.html före scenkoden. ===== */
const FPS = 30, DROP = 3;                                   // koket: ny pose var tredje bildruta = 10 poser per sekund
const step = (t) => Math.floor((t * FPS) / DROP);
// seedad hash, -1..1. Aldrig Math.random.
const H = (n, s) => { const x = Math.sin(n * 127.1 + (s || 1) * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
// mjuk bana genom punkter (kvadratisk mittpunktskedja), öppen eller sluten
function smooth(p, closed) {
  const n = p.length, f = (v) => v.toFixed(1);
  if (!closed) {
    let d = `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 1; i < n - 1; i++) { const a = p[i], b = p[i + 1]; d += ` Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`; }
    return d + ` L${f(p[n - 1][0])} ${f(p[n - 1][1])}`;
  }
  let d = `M${f((p[0][0] + p[n - 1][0]) / 2)} ${f((p[0][1] + p[n - 1][1]) / 2)}`;
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; d += ` Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`; }
  return d + 'Z';
}
// darr: flyttar varje punkt lite, olika för varje steg st
const jit = (p, seed, st, amp) => p.map((q, i) => [q[0] + H(st * 7 + i * 13, seed) * amp, q[1] + H(st * 7 + i * 13 + 5, seed + 3) * amp]);
// rektangel som punkter: hörnen dubblade så att kanterna håller sig raka
function rectPts(x, y, w, h, r) {
  r = r || 10; const o = [], C = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const seg = (a, b, k) => { for (let i = 0; i < k; i++) o.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]); };
  const k = (len) => Math.max(2, Math.round(len / 90));
  for (let c = 0; c < 4; c++) { const a = C[c], b = C[(c + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    o.push([a[0] + ux * r * .3, a[1] + uy * r * .3]); seg([a[0] + ux * r, a[1] + uy * r], [b[0] - ux * r, b[1] - uy * r], k(len)); o.push([b[0] - ux * r * .3, b[1] - uy * r * .3]); }
  return o;
}
// klick: ojämn cirkel
const blobPts = (cx, cy, r, seed, n, irr) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, rr = r * (1 + H(i * 3 + 1, seed) * irr); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
const rot = (p, cx, cy, dg) => { const a = dg * Math.PI / 180, c = Math.cos(a), n = Math.sin(a); return p.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * n, cy + (x - cx) * n + (y - cy) * c]); };
// loggans egen rektangel (tre punkter per kant). Bara till AD-lappen, så att den blir exakt som i loggan.
function tagRect(x, y, w, h, r) { const o = [], C = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; for (let c = 0; c < 4; c++) { const a = C[c], b = C[(c + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; o.push([a[0] + ux * r * .3, a[1] + uy * r * .3]); for (let i = 0; i < 3; i++) { const t = i / 2; o.push([a[0] + ux * r + (b[0] - a[0] - 2 * ux * r) * t, a[1] + uy * r + (b[1] - a[1] - 2 * uy * r) * t]); } o.push([b[0] - ux * r * .3, b[1] - uy * r * .3]); } return o; }

/* ===== Gorillan: lager i en ruta på 200 x 200, samma punkter som loggan (logo/nya/gorilla.html) =====
   pose: tag    true = gul AD-lapp i munnen (loggan), false = vanlig mun
         look   [x, y], -1..1: vart pupillerna tittar
         blink  0 eller 1
         brow   -1 hungrig/bestämd, 0 neutral, 1 glad/förvånad
         jaw    0..1 gap (bara utan lapp)
         cheeks 0..1 fulla kinder
         blob   false = utan orange klick
   Neutral pose med st = 1 ger exakt loggans banor. */
function gorilla(pose) {
  const P = Object.assign({ tag: true, look: [0, 0], blink: 0, brow: 0, jaw: 0, cheeks: 0, blob: true }, pose || {});
  const F = '#3a332d', A = '#c9b8a0', I = '#1b1916', O = '#ff4b1f', Y = '#ffd23e';
  const j = P.tag ? 0 : P.jaw, k = P.cheeks, up = Math.max(0, P.brow), dn = Math.max(0, -P.brow);
  const ex = P.look[0] * 4, ey = P.look[1] * 3;
  const L = [];
  L.push({ id: 'blob', hide: !P.blob, p: blobPts(100, 104, 92, 9, 16, .06), c: 1, fill: O, amp: 2.2 });
  L.push({ id: 'earL', p: blobPts(40, 106, 13, 2, 8, .06), c: 1, fill: F, w: 7, amp: 1 });
  L.push({ id: 'earR', p: blobPts(160, 106, 13, 3, 8, .06), c: 1, fill: F, w: 7, amp: 1 });
  L.push({ id: 'head', p: [[100, 30], [128, 38], [150, 60], [160, 92], [157, 126], [146, 152 + 5 * j], [124, 168 + 9 * j], [100, 173 + 10 * j], [76, 168 + 9 * j], [54, 152 + 5 * j], [43, 126], [40, 92], [50, 60], [72, 38]], c: 1, fill: F, w: 8, amp: 1.6 });
  L.push({ id: 'face', p: [[100, 72], [120, 66], [138, 76], [142, 94], [136, 110], [148 + 5 * k, 128], [143 + 4 * k, 150 + 4 * j], [124, 162 + 9 * j], [100, 165 + 10 * j], [76, 162 + 9 * j], [57 - 4 * k, 150 + 4 * j], [52 - 5 * k, 128], [64, 110], [58, 94], [62, 76], [80, 66]], c: 1, fill: A, w: 6, amp: 1.4 });
  L.push({ id: 'brow', p: [[62, 92 - 4 * up - 3 * dn], [80, 82 - 6 * up + 5 * dn], [100, 90 - 5 * up + 6 * dn], [120, 82 - 6 * up + 5 * dn], [138, 92 - 4 * up - 3 * dn]], w: 10, amp: 1 });
  if (P.blink > .5) {
    L.push({ id: 'eyeL', p: [[76, 103], [82, 104.5], [88, 103]], w: 5, amp: .6 });
    L.push({ id: 'eyeR', p: [[112, 103], [118, 104.5], [124, 103]], w: 5, amp: .6 });
  } else {
    L.push({ id: 'eyeL', p: blobPts(82 + ex, 102 + ey, 6, 1, 8, .08), c: 1, fill: I, amp: .6 });
    L.push({ id: 'eyeR', p: blobPts(118 + ex, 102 + ey, 6, 2, 8, .08), c: 1, fill: I, amp: .6 });
  }
  L.push({ id: 'nose', p: [[85, 128], [90, 114], [100, 111], [110, 114], [115, 128]], w: 6, amp: .8 });
  L.push({ id: 'nosL', p: blobPts(93, 127, 3.5, 4, 8, .08), c: 1, fill: I, amp: .6 });
  L.push({ id: 'nosR', p: blobPts(107, 127, 3.5, 5, 8, .08), c: 1, fill: I, amp: .6 });
  if (P.tag) L.push({ id: 'tag', p: rot(tagRect(70, 138, 62, 26, 5), 101, 151, -8), c: 1, fill: Y, w: 5, amp: .9 });
  else if (j < .08) L.push({ id: 'mouth', p: [[78, 147], [100, 152], [122, 147]], w: 6, amp: .8 });
  else L.push({ id: 'gap', p: [[80, 143], [100, 140], [120, 143], [125, 148 + 7 * j], [112, 154 + 13 * j], [100, 156 + 14 * j], [88, 154 + 13 * j], [75, 148 + 7 * j]], c: 1, fill: I, w: 5, amp: .8 });
  return L;
}
// Sätter upp gorillan i en <g> och ger tillbaka draw(pose, st). Anropa draw från en R-funktion varje bildruta.
function mountGorilla(g) {
  const NS = 'http://www.w3.org/2000/svg', el = {}; let txt = null;
  return function draw(pose, st) {
    const seen = {};
    gorilla(pose).forEach((l, idx) => {
      let e = el[l.id];
      if (!e) { e = el[l.id] = document.createElementNS(NS, 'path'); e.style.strokeLinecap = 'round'; e.style.strokeLinejoin = 'round'; g.appendChild(e); }
      seen[l.id] = 1;
      e.style.display = l.hide ? 'none' : '';
      e.setAttribute('d', smooth(jit(l.p, idx * 17 + 3, st, l.amp || 1.5), l.c));
      e.style.fill = l.fill || 'none';                     // stil, inte attribut: en CSS-regel kan annars vinna
      e.style.stroke = l.w ? '#1b1916' : 'none';
      e.style.strokeWidth = l.w || 0;
    });
    for (const id in el) if (!seen[id]) el[id].style.display = 'none';
    if (!txt) { txt = document.createElementNS(NS, 'text'); txt.textContent = 'AD'; txt.setAttribute('x', 101); txt.setAttribute('y', 159); txt.setAttribute('transform', 'rotate(-8 101 159)'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('style', "font: 900 20px 'InterK', sans-serif; fill: #1b1916"); }
    if (seen.tag) g.appendChild(txt);                      // texten ska alltid ligga överst
    txt.style.display = seen.tag ? '' : 'none';
  };
}
/* ===== Mönster för färgade marker (1920 x 1080). Ger SVG-kod som läggs i en <g> med insertAdjacentHTML. =====
   kind: 'net' | 'dots' | 'code' | 'stars'.  col: mönstrets färg (se tabellen över marker i STIL.md). */
function pattern(kind, col) {
  let s = '';
  if (kind === 'dots') for (let k = 0; k < 90; k++) s += `<circle cx="${40 + ((k * 151) % 1840)}" cy="${30 + ((k * 337) % 1020)}" r="${8 + (k % 3) * 5}" fill="${col}"/>`;
  if (kind === 'net') { const n = []; for (let k = 0; k < 30; k++) n.push([60 + ((k * 263) % 1800), 60 + ((k * 409) % 960)]);
    n.forEach((a, k) => { const m = n[(k * 7 + 3) % n.length]; s += `<line x1="${a[0]}" y1="${a[1]}" x2="${m[0]}" y2="${m[1]}" stroke="${col}" stroke-width="6"/><circle cx="${a[0]}" cy="${a[1]}" r="16" fill="${col}"/>`; }); }
  if (kind === 'code') for (let k = 0; k < 70; k++) { const x = 30 + ((k * 173) % 1850), y = 30 + ((k * 311) % 1000), ty = k % 5;
    s += ty === 0 ? `<path d="M${x + 30} ${y} L${x} ${y + 26} L${x + 30} ${y + 52}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`
      : ty === 1 ? `<path d="M${x + 30} ${y} L${x + 6} ${y + 52}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`
      : ty === 2 ? `<circle cx="${x + 24}" cy="${y + 26}" r="22" fill="${col}"/>`
      : ty === 3 ? `<rect x="${x}" y="${y}" width="46" height="46" rx="6" fill="${col}"/>`
      : `<path d="M${x + 24} ${y} L${x + 50} ${y + 46} L${x} ${y + 46}Z" fill="${col}"/>`; }
  if (kind === 'stars') for (let k = 0; k < 110; k++) s += `<line x1="${(k * 211) % 1920}" y1="${(k * 433) % 1080}" x2="${((k * 211) % 1920) + 8}" y2="${((k * 433) % 1080) - 10}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
  return s;
}
if (typeof module !== 'undefined') module.exports = { FPS, DROP, step, H, smooth, jit, rectPts, blobPts, rot, tagRect, gorilla, mountGorilla, pattern };
```

Så hänger det ihop med tidslinjen (samma mönster som förebilden):

```js
const D = 32;                                              // videons längd i sekunder
const tl = gsap.timeline({ paused: true });
const R = [];                                              // allt som ritas per bildruta: rena funktioner av tiden
const $ = (s) => document.querySelector(s);

// en bana som kokar
const boil = (el, ptsFn, closed, seed, amp) => R.push((t) => el.setAttribute('d', smooth(jit(ptsFn(t), seed, step(t), amp), closed)));
// en grupp eller bild som kokar hel (lägg in- och utgångar på en wrapper runt)
const shapeBoil = (sel, seed, amp, rotAmp) => { const els = gsap.utils.toArray(sel); R.push((t) => { const st = step(t);
  els.forEach((e, i) => gsap.set(e, { x: H(st * 3 + i * 97, seed) * amp, y: H(st * 3 + 1 + i * 97, seed) * amp, rotation: H(st * 3 + 2 + i * 97, seed) * rotAmp })); }); };
// penndrag: banan har pathLength="1" och stroke-dasharray: 1 1
const draw = (el, at, dur, ease) => { tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .02, immediateRender: true }, at);
  tl.fromTo(el, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, ease: ease || 'power2.inOut' }, at); };
// berättarrad: varje ord i <span class="w">
const words = (sel, at, gap, from) => document.querySelectorAll(sel + ' .w').forEach((w, i) =>
  tl.fromTo(w, { opacity: 0, y: from || 40 }, { opacity: 1, y: 0, duration: .35, ease: 'back.out(2)' }, at + i * (gap || .08)));

// gorillan: en <g id="g-wrap"><g id="g-rig"></g></g> i en <svg class="full" viewBox="0 0 1920 1080">
const drawG = mountGorilla($('#g-rig'));
const G = { x: 283, y: 204, size: 440, sx: 1, sy: 1, rot: 0, tag: 1, lx: 0, ly: 0, blink: 0, brow: 0, jaw: 0, cheeks: 0 };   // GSAP tweenar de här talen
R.push((t) => {
  drawG({ tag: G.tag > .5, look: [G.lx, G.ly], blink: G.blink, brow: G.brow, jaw: G.jaw, cheeks: G.cheeks }, step(t));
  const k = G.size / 200;                                  // tillplattning och lutning utgår från underkanten (100, 196) i ritrutan
  $('#g-wrap').setAttribute('transform', `translate(${G.x + 100 * k} ${G.y + 196 * k}) rotate(${G.rot}) scale(${k * G.sx} ${k * G.sy}) translate(-100 -196)`);
});
// exempel: ett skutt som landar på 9,14 s
// tl.to(G, { sy: .9, duration: .1 }, 8.70).to(G, { y: '-=160', sy: 1.06, duration: .18, ease: 'power2.out' }, 8.80)
//   .to(G, { y: '+=160', duration: .16, ease: 'power2.in' }, 8.98).to(G, { sx: 1.12, sy: .88, duration: .05 }, 9.14)
//   .to(G, { sx: 1, sy: 1, duration: .25, ease: 'back.out(2)' }, 9.24);

// en enda uppdatering per bildruta, sist i skriptet
tl.eventCallback('onUpdate', () => { const t = tl.time(); for (const f of R) f(t); });
R.forEach((f) => f(0));
tl.set({}, {}, D);
window.__timelines = window.__timelines || {};
window.__timelines['main'] = tl;
```
