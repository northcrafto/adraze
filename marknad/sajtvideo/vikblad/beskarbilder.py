#!/usr/bin/env python3
"""Beskär och skalar de riktiga skärmbilderna i ra/ till assets/skarm/. Inget annat görs med dem:
ingen text, siffra eller färg ändras. Körs efter tagbilder.mjs.

  /home/mint/adraze-reels/venv/bin/python beskarbilder.py

Varför beskära: i engelskt läge står tre saker kvar på svenska i fönstrets nedersta remsa (knappen Anpassa på
startsidan, Visa bara ikoner under flikpanelen och rutan Ändrat … Ångra efter Falks ändring). Därför visas fönstrets
översta 700 av 836 punkter, och räknaren visas i ett eget utsnitt där knappen inte ryms.
Måtten nedan är fönstrets logiska punkter (1620 x 836). Bilderna i ra/ är tagna i tredubbel skala."""
from pathlib import Path
from PIL import Image

HAR = Path(__file__).resolve().parent
RA, UT = HAR / 'ra', HAR / 'assets' / 'skarm'
UT.mkdir(parents=True, exist_ok=True)
K = 3                                   # skalan bilderna togs i
TOPP = 700                              # fönstrets översta 700 punkter (ramen i videon är 1620 x 700)


def las(namn):
    im = Image.open(RA / f'{namn}.png').convert('RGBA')
    return im


def spara(im, namn):
    f = UT / f'{namn}.png'
    im.save(f, optimize=True)
    print(f'{namn}.png  {im.size[0]}x{im.size[1]}  {f.stat().st_size // 1024} kB')


def utsnitt(im, x, y, w, h, till=None):
    """Rektangel i logiska punkter. till = (bredd, höjd) i bildpunkter efter omskalning (LANCZOS)."""
    r = im.crop((round(x * K), round(y * K), round((x + w) * K), round((y + h) * K)))
    return r.resize(till, Image.LANCZOS) if till else r


# K1 hel (stopp 1, kameran åker ner till räknaren). Hörnet nere till vänster skärs bort (där sitter knappen Anpassa):
# bilden blir ett L. Inga bildpunkter ändras, hörnet tas bara bort.
k1 = las('k1')
bort = Image.new('RGBA', (130 * K, k1.size[1] - 780 * K), (0, 0, 0, 0))
k1.paste(bort, (0, 780 * K))
spara(k1, 'k1')

# Översta 700 punkterna i dubbel skala: K1 till K4 och K7
for n in ('k1', 'k2', 'k3', 'k4', 'k7'):
    spara(utsnitt(las(n), 0, 0, 1620, TOPP, (3240, 1400)), n + 't')
spara(utsnitt(las('k1'), 0, 0, 1620, TOPP, (3240, 1400)), 'k1w')   # samma bild en gång till, till fönstret på blad 3 (HyperFrames vill ha en fil per bildnod)

# K5: verktygsraden ligger längst ner. Utsnittet går ner till fönstrets underkant och börjar 130 punkter in från vänster
# (till vänster om det sitter knappen Anpassa). Samma proportioner som de andra: 1490 x 644 punkter.
spara(utsnitt(las('k5'), 130, 836 - 1490 * TOPP / 1620, 1490, 1490 * TOPP / 1620, (3240, 1400)), 'k5b')

# Falk-panelen (400 x 742 punkter): remsan med skrivfältet längst ner och remsan överst med rubrik och bubbla.
# Raden under fältet och tidsangivelsen under bubblan ligger utanför remsorna.
NER, UPP, HOJD = 594, 0, 118
spara(utsnitt(las('k6a'), 0, NER, 400, HOJD), 'f0')
for i in range(1, 8):
    spara(utsnitt(las(f'k6b{i}'), 0, NER, 400, HOJD), f'f{i}')
spara(utsnitt(las('k6c'), 0, UPP, 400, HOJD), 'fc')      # skickat, Falk tänker
spara(utsnitt(las('k6d'), 0, UPP, 400, HOJD), 'fd')      # efter svaret: samtalet har fått meningen som rubrik

# K8: Familj-panelen utan inställningarnas meny och utan kontokortet ovanför. 760 x 328,4 punkter.
spara(utsnitt(las('k8'), 560.5, 282, 760, 760 * TOPP / 1620), 'k8')

# ── Andra omgången (tagbilder2.mjs, ra/rapport2.json): nya utseenden 4 och 5 som skiljer sig även i telefonstorlek.
# Klockan och hälsningen är avslagna där (startsida.halsning), så ingen tid syns som skiljer sig från bild 1 till 3.
# K4N: Sand, dolda flikar, loggan på startsidan. Samma utsnitt som K1 till K4.
spara(utsnitt(las('k4n'), 0, 0, 1620, TOPP, (3240, 1400)), 'k4n')
# K5N: färguppsättningen Jul (mörkgrön), verktygsraden nere, utan statistik. Samma utsnitt som K5 (knappen Anpassa utanför).
spara(utsnitt(las('k5n'), 130, 836 - 1490 * TOPP / 1620, 1490, 1490 * TOPP / 1620, (3240, 1400)), 'k5n')

# Falk-remsan på blad 3, tätare: 400 x 62 punkter, i bildernas egen upplösning (1200 x 186).
# Fältet ligger på 657 till 707 i panelen (raden under fältet börjar 718), bubblan på 72 till 113 (rubriken slutar 41,
# och tidsangivelsen nu under bubblan börjar 126,7). Uppmätt i ra/ med en radskanning.
FALT_Y, BUB_Y, RH = 651, 61.6, 62
spara(utsnitt(las('k6a'), 0, FALT_Y, 400, RH), 'fe0')
for i in range(1, 8):
    spara(utsnitt(las(f'k6b{i}'), 0, FALT_Y, 400, RH), f'fe{i}')
spara(utsnitt(las('k6c'), 0, BUB_Y, 400, RH), 'fb')      # skickat: meningen som bubbla överst i samtalet
