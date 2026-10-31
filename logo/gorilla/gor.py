#!/usr/bin/env python3
"""raw-SVG -> färdiga SVG:er: texten "AD" blir konturer, stilar inline, egen viewBox."""
import re, pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
UT = pathlib.Path(__file__).parent
f = TTFont(UT.parent / 'nya/fonts/InterDisplay-Black.otf'); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
def textpath(t, x, y, rot, size):
    adv, d = 0, ''
    for ch in t:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs); gs[g].draw(pen)
        d += f'<path transform="translate({adv} 0)" d="{pen.getCommands()}"/>'; adv += gs[g].width
    s = size / upm
    return f'<g transform="rotate({rot} {x} {y}) translate({x - adv*s/2:.2f} {y}) scale({s:.5f} {-s:.5f})" fill="#1b1916">{d}</g>'
for namn in ('a', 'b'):
    s = (UT / f'{namn}.raw.svg').read_text()
    s = re.sub(r'<text x="([\d.]+)" y="([\d.]+)" transform="rotate\((-?[\d.]+)[^"]*"[^>]*font:\S+ (\d+)px[^>]*>([^<]+)</text>',
               lambda m: textpath(m[5], float(m[1]), float(m[2]), float(m[3]), float(m[4])), s)
    s = s.replace('class="ink" ', '').replace('style="fill:', 'stroke-linecap="round" stroke-linejoin="round" style="fill:')
    s = s.replace('<svg viewBox="0 0 200 200" width="">', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 6 196 196">')
    (UT / f'adraze-gorilla{"" if namn == "b" else "-enkel"}.svg').write_text(s)
    (UT / f'{namn}.raw.svg').unlink()
print('ok')
