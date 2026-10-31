#!/usr/bin/env python3
"""f1..f4.raw.svg -> adraze-gorilla-levande.svg: fyra bildrutor som växlar (CSS, ~9 bilder/s, som reelens 'kokande' bläck).
Stannar på första bilden om besökaren valt minskade rörelser."""
import re, pathlib, importlib.util
UT = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('gor', UT / 'gor.py')
src = (UT / 'gor.py').read_text().split("for namn in")[0]  # bara textpath-delen
ns = {'__file__': str(UT / 'gor.py')}; exec(src, ns)
rutor = []
for k in range(1, 5):
    s = (UT / f'f{k}.raw.svg').read_text()
    s = re.sub(r'<text x="([\d.]+)" y="([\d.]+)" transform="rotate\((-?[\d.]+)[^"]*"[^>]*font:\S+ (\d+)px[^>]*>([^<]+)</text>',
               lambda m: ns['textpath'](m[5], float(m[1]), float(m[2]), float(m[3]), float(m[4])), s)
    s = s.replace('class="ink" ', '').replace('style="fill:', 'stroke-linecap="round" stroke-linejoin="round" style="fill:')
    inner = re.sub(r'^<svg[^>]*>|</svg>$', '', s)
    rutor.append(f'<g class="r r{k}">{inner}</g>')
    (UT / f'f{k}.raw.svg').unlink()
css = ('.r{opacity:0;animation:koka .44s steps(1) infinite}.r1{opacity:1}'
       '.r2{animation-delay:-.33s}.r3{animation-delay:-.22s}.r4{animation-delay:-.11s}'
       '@keyframes koka{0%{opacity:1}25%,100%{opacity:0}}'
       '@media (prefers-reduced-motion:reduce){.r{animation:none}}')
(UT / 'adraze-gorilla-levande.svg').write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 6 196 196"><style>{css}</style>{"".join(rutor)}</svg>')
print('ok', (UT / 'adraze-gorilla-levande.svg').stat().st_size, 'byte')
