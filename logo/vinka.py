#!/usr/bin/env python3
"""Vinkande AdRaze-figur för mejlen (inloggning/verifiering).
Samma figur som i Märket (förslag E i rita.py): sitter på kanten av den orange rutan,
lyfter höger arm, vinkar några gånger och tar ner armen igen. Loopar sömlöst.
Kör: python3 vinka.py  -> ../site/mail/vinkar.gif + vinkar.png
Rastrering med librsvg via gi (ingen webbläsare)."""
import io
import math
import pathlib

import cairo
import gi
gi.require_version('Rsvg', '2.0')
from gi.repository import Rsvg
from PIL import Image

UT = pathlib.Path(__file__).resolve().parent.parent / 'site' / 'mail'
UT.mkdir(parents=True, exist_ok=True)

INK, ORANGE, HUD, HAR, VIT = '#2f2e41', '#ff4b1f', '#ffb6b6', '#2f2e41', '#ffffff'
BREDD = 400          # utbredd i px (2x för 200 px i mejlet)
VB = (30, 0, 175, 226)  # viewBox: som final/adraze-mark.svg men lite högre upp för handen
MS = 40              # ms per bildruta


# --- ritfunktioner, kopierade från rita.py (den skriver filer vid import) ---
def linje(pkt, farg, w):
    d = 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pkt)
    return f'<path d="{d}" fill="none" stroke="{farg}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'


def figur(huvud, hoft, axlar, armar, ben, troja=ORANGE, har='knut', skala=1):
    """huvud=(x,y) mitt, hoft=(x,y), axlar=((vx,vy),(hx,hy)), armar=[[axel,armbåge,hand],...], ben=[[höft,knä,fot],...]"""
    s = []
    for b in ben:  # ben bakom kroppen
        s.append(linje(b, INK, 13 * skala))
        fx, fy = b[-1]
        s.append(f'<ellipse cx="{fx + 5*skala}" cy="{fy + 2*skala}" rx="{10*skala}" ry="{5*skala}" fill="{INK}"/>')
    (vx, vy), (hx, hy) = axlar
    ox, oy = hoft
    s.append(f'<path d="M{vx},{vy} L{hx},{hy} L{ox + 13*skala},{oy} L{ox - 13*skala},{oy} Z" fill="{troja}" stroke="{troja}" stroke-width="{10*skala}" stroke-linejoin="round"/>')
    for a in armar:
        s.append(linje(a[:2], troja, 9 * skala))
        s.append(linje(a[1:], HUD, 7 * skala))
        s.append(f'<circle cx="{a[-1][0]:.2f}" cy="{a[-1][1]:.2f}" r="{5*skala}" fill="{HUD}"/>')
    x, y = huvud
    s.append(f'<rect x="{x - 5*skala}" y="{y + 8*skala}" width="{10*skala}" height="{12*skala}" fill="{HUD}"/>')
    s.append(f'<circle cx="{x}" cy="{y}" r="{15*skala}" fill="{HUD}"/>')
    if har == 'knut':
        s.append(f'<path d="M{x-16*skala},{y+2*skala} C{x-18*skala},{y-20*skala} {x+16*skala},{y-22*skala} {x+16*skala},{y-4*skala} C{x+6*skala},{y-10*skala} {x-6*skala},{y-8*skala} {x-16*skala},{y+2*skala} Z" fill="{HAR}"/>')
        s.append(f'<circle cx="{x+4*skala}" cy="{y-20*skala}" r="{8*skala}" fill="{HAR}"/>')
    else:  # kort
        s.append(f'<path d="M{x-16*skala},{y} C{x-18*skala},{y-22*skala} {x+18*skala},{y-22*skala} {x+16*skala},{y-2*skala} C{x+8*skala},{y-12*skala} {x-8*skala},{y-12*skala} {x-16*skala},{y} Z" fill="{HAR}"/>')
    return '\n'.join(s)


def forbud(cx, cy, r, w, farg=ORANGE):
    d = r * math.cos(math.pi / 4)
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{farg}" stroke-width="{w}"/>'
            f'<line x1="{cx-d}" y1="{cy+d}" x2="{cx+d}" y2="{cy-d}" stroke="{farg}" stroke-width="{w}" stroke-linecap="round"/>')


# --- vinkarmen ---
AXEL = (160, 48)
# vila = exakt som i Märket: armbåge (172,60), hand (176,68)
VILA_OVER, VILA_UNDER = -45.0, -63.4   # grader, 0 = höger, positivt = uppåt
VILA_LANGD = (math.hypot(12, 12), math.hypot(4, 8))
LYFT_OVER, LYFT_UNDER = 28.0, 95.0      # överarm snett upp, underarm rakt upp
LYFT_LANGD = (17.0, 14.0)
VINK = 32.0                              # utslag i grader för underarmen


def mjuk(t):  # ease-in-out
    return t * t * (3 - 2 * t)


def arm(over, under, l_over, l_under):
    ax, ay = AXEL
    ex = ax + l_over * math.cos(math.radians(over))
    ey = ay - l_over * math.sin(math.radians(over))
    hx = ex + l_under * math.cos(math.radians(under))
    hy = ey - l_under * math.sin(math.radians(under))
    return [AXEL, (ex, ey), (hx, hy)]


def tidslinje():
    """Ger (överarm, underarm, längder) per bildruta: lyft, 3 vinkar, sänk, vila."""
    rutor = []
    LYFT, VINKAR, PER_VINK, SANK, VILA = 8, 3, 10, 8, 12
    for i in range(LYFT):
        t = mjuk((i + 1) / LYFT)
        rutor.append((t, 0.0))
    n = VINKAR * PER_VINK
    for i in range(n):
        fas = (i + 1) / PER_VINK * 2 * math.pi
        # utslaget tonas in och ut så starten/slutet blir mjuka
        styrka = min(1.0, (i + 1) / 4, (n - i - 1) / 4 + 0.25)
        rutor.append((1.0, math.sin(fas) * styrka))
    for i in range(SANK):
        t = 1 - mjuk((i + 1) / SANK)
        rutor.append((t, 0.0))
    rutor += [(0.0, 0.0)] * VILA
    return rutor


def ruta(lyft, vink):
    over = VILA_OVER + (LYFT_OVER - VILA_OVER) * lyft + 4 * vink   # lite medföljande överarm
    under = VILA_UNDER + (LYFT_UNDER - VILA_UNDER) * lyft + VINK * vink
    lo = VILA_LANGD[0] + (LYFT_LANGD[0] - VILA_LANGD[0]) * lyft
    lu = VILA_LANGD[1] + (LYFT_LANGD[1] - VILA_LANGD[1]) * lyft
    s = [f'<rect x="40" y="70" width="150" height="150" rx="36" fill="{ORANGE}"/>', forbud(115, 145, 42, 13, VIT)]
    s.append(figur((150, 30), (150, 70), ((140, 46), (160, 46)),
                   [arm(over, under, lo, lu), [(140, 48), (132, 60), (130, 68)]],
                   [[(146, 70), (170, 74), (176, 100)], [(154, 70), (182, 72), (190, 96)]], skala=0.8))
    x, y, w, h = VB
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}"><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{VIT}"/>{"".join(s)}</svg>'


def rastrera(svgtext):
    x, y, w, h = VB
    hojd = round(BREDD * h / w)
    yta = cairo.ImageSurface(cairo.FORMAT_ARGB32, BREDD, hojd)
    ctx = cairo.Context(yta)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()
    handle = Rsvg.Handle.new_from_data(svgtext.encode())
    vp = Rsvg.Rectangle()
    vp.x, vp.y, vp.width, vp.height = 0, 0, BREDD, hojd
    handle.render_document(ctx, vp)
    buf = io.BytesIO()
    yta.write_to_png(buf)
    return Image.open(io.BytesIO(buf.getvalue())).convert('RGB')


def main():
    bilder = [rastrera(ruta(l, v)) for l, v in tidslinje()]
    # gemensam palett från alla rutor ihop
    w, h = bilder[0].size
    ark = Image.new('RGB', (w, h * len(bilder)), 'white')
    for i, b in enumerate(bilder):
        ark.paste(b, (0, i * h))
    palett = ark.quantize(colors=48, method=Image.Quantize.MEDIANCUT)
    rutor = [b.quantize(palette=palett, dither=Image.Dither.NONE) for b in bilder]
    rutor[0].save(UT / 'vinkar.gif', save_all=True, append_images=rutor[1:],
                  duration=MS, loop=0, optimize=True, disposal=1)
    bilder[0].save(UT / 'vinkar.png', optimize=True)
    print(f'{len(rutor)} rutor, {len(rutor) * MS} ms, {w}x{h} ->', UT / 'vinkar.gif')


if __name__ == '__main__':
    main()
