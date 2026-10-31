#!/usr/bin/env python3
"""Nya AdRaze-loggidéer (2026-10-31). Kör: python3 gor.py -> *.svg + ark.html"""
import math, pathlib
UT = pathlib.Path(__file__).parent
O, BG, V = '#ff4b1f', '#141414', '#ffffff'
bg = f'<rect width="200" height="200" rx="46" fill="{BG}"/>'

def svg(inner, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>{defs}</defs>{bg}{inner}</svg>'

def halvor(p1, p2):
    """Två clip-polygoner på var sin sida om linjen p1-p2 (förlängd)."""
    (x1, y1), (x2, y2) = p1, p2
    dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    a = (x1 - ux * 300, y1 - uy * 300); b = (x2 + ux * 300, y2 + uy * 300)
    nx, ny = uy, -ux  # normal
    f = lambda pts: ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    s1 = f([a, b, (b[0] + nx * 400, b[1] + ny * 400), (a[0] + nx * 400, a[1] + ny * 400)])
    s2 = f([a, b, (b[0] - nx * 400, b[1] - ny * 400), (a[0] - nx * 400, a[1] - ny * 400)])
    return s1, s2, (nx, ny)

# 1. KLYVET – annonsrutan klyvs itu av ett orange snitt
s1, s2, (nx, ny) = halvor((30, 160), (170, 40))
ruta = f'''<rect x="42" y="58" width="116" height="84" rx="12" fill="{V}"/>
<rect x="54" y="70" width="26" height="14" rx="4" fill="#d4d4d4"/>
<rect x="54" y="94" width="78" height="7" rx="3.5" fill="#e6e6e6"/><rect x="54" y="108" width="56" height="7" rx="3.5" fill="#e6e6e6"/>'''
d = 7
klyvet = svg(f'''<g clip-path="url(#h1)" transform="translate({nx*d:.1f},{ny*d:.1f})">{ruta}</g>
<g clip-path="url(#h2)" transform="translate({-nx*d:.1f},{-ny*d:.1f})">{ruta}</g>
<line x1="34" y1="157" x2="166" y2="43" stroke="{O}" stroke-width="5" stroke-linecap="round"/>''',
    f'<clipPath id="h1"><polygon points="{s1}"/></clipPath><clipPath id="h2"><polygon points="{s2}"/></clipPath>')

# 2. RAK-A – ett A som huggits av, nedre delen glider iväg
A = f'<polygon points="100,34 158,166 128,166 100,98 72,166 42,166" fill="{V}" stroke="{V}" stroke-width="6" stroke-linejoin="round"/>'
s1, s2, (nx, ny) = halvor((20, 150), (180, 92))
ux, uy = -ny, nx
raka = svg(f'''<g clip-path="url(#a1)">{A}</g>
<g clip-path="url(#a2)" transform="translate({ux*-9 + nx*-4:.1f},{uy*-9 + ny*-4:.1f})">{A}</g>
<line x1="22" y1="149" x2="178" y2="93" stroke="{O}" stroke-width="6" stroke-linecap="round"/>''',
    f'<clipPath id="a1"><polygon points="{s1}"/></clipPath><clipPath id="a2"><polygon points="{s2}"/></clipPath>')

# 3. FLAMMAN – raze = bränn ner; flamma med ett A i luften
flamma = svg(f'''<path d="M104,26 C112,58 150,78 152,124 C154,158 130,180 100,180 C70,180 46,160 48,128
 C50,100 68,88 72,62 C82,76 86,84 88,96 C96,78 104,56 104,26 Z" fill="url(#fg)"/>
<polygon points="100,98 128,168 112,168 100,136 88,168 72,168" fill="{BG}"/>''',
    f'<linearGradient id="fg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{O}"/><stop offset=".65" stop-color="#ff7a1f"/><stop offset="1" stop-color="#ffc23d"/></linearGradient>')

# 4. KLORNA – tre klösmärken river sönder annonsen
def klo(x1, y1, x2, y2, w):
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2; L = math.hypot(x2 - x1, y2 - y1)
    px, py = -(y2 - y1) / L * w, (x2 - x1) / L * w
    return f'M{x1},{y1} Q{mx+px:.1f},{my+py:.1f} {x2},{y2} Q{mx-px:.1f},{my-py:.1f} {x1},{y1} Z'
kl = ''.join(f'<path d="{klo(66+i*30, 40, 108+i*30, 164, 13)}" fill="{O}"/>' for i in range(3))
klorna = svg(f'''<rect x="38" y="56" width="124" height="88" rx="14" fill="{V}"/>
<g stroke="{BG}" stroke-width="9">{''.join(f'<path d="{klo(66+i*30, 40, 108+i*30, 164, 13)}" fill="none"/>' for i in range(3))}</g>{kl}''')

# 5. UPPLÖSNINGEN – rutan smular sönder till pixlar
px = []
for r in range(8):
    for c in range(8):
        h = (r * 7 + c * 13) % 10
        if c < 4 or (c == 4 and h < 8) or (c == 5 and h < 5) or (c == 6 and h < 2):
            dx = max(0, c - 3) * 4 + (h % 3) * max(0, c - 3) * 1.5
            dy = -max(0, c - 3) * (h % 4) * 1.5
            op = 1 if c < 4 else (0.85 if c == 4 else 0.6 if c == 5 else 0.35)
            px.append(f'<rect x="{40 + c*15 + dx:.1f}" y="{40 + r*15 + dy:.1f}" width="13" height="13" rx="2.5" fill="{O}" opacity="{op}"/>')
uppl = svg(''.join(px))

ideer = [('Klyvet', 'Annonsen klyvs mitt itu av ett orange snitt. Säger direkt vad appen gör.', klyvet),
         ('Rak-A', 'Ett A som huggits av – nedre halvan glider iväg längs snittet. Fet, enkel, funkar som 16 px-favicon.', raka),
         ('Flamman', 'Raze = bränna ner. En flamma med ett A i luften. Varm, aggressiv, gaming-känsla.', flamma),
         ('Klorna', 'Tre klösmärken river sönder annonsen. Djur-energi, känns farligt.', klorna),
         ('Upplösningen', 'Rutan smular sönder till pixlar åt höger – annonsen försvinner.', uppl)]
kort = ''
for i, (namn, txt, s) in enumerate(ideer, 1):
    (UT / f'{i}-{namn.lower().replace("ö","o").replace("ä","a")}.svg').write_text(s)
    kort += f'''<div class="k"><div class="stor">{s}</div>
<div class="sma"><div class="s64">{s}</div><div class="s32">{s}</div><div class="s16">{s}</div>
<div class="ord"><div class="m">{s}</div>AdRaze</div></div>
<h2>{i}. {namn}</h2><p>{txt}</p></div>'''
(UT / 'ark.html').write_text(f'''<!doctype html><meta charset="utf-8"><style>
body{{margin:0;background:#0b0b0b;color:#eee;font-family:Inter,sans-serif;padding:36px}}
.g{{display:grid;grid-template-columns:repeat(5,1fr);gap:22px}}
.k{{background:#1a1a1a;border-radius:20px;padding:22px}}
.stor svg{{width:100%;display:block}}
.sma{{display:flex;align-items:center;gap:12px;margin:18px 0 6px}}
.s64 svg{{width:64px}}.s32 svg{{width:32px}}.s16 svg{{width:16px}}
.ord{{display:flex;align-items:center;gap:8px;font:800 22px "Inter Display",Inter;letter-spacing:-.5px;margin-left:auto}}
.ord .m svg{{width:30px;display:block}}
h2{{margin:10px 0 4px;font-size:20px}}p{{margin:0;color:#aaa;font-size:14px;line-height:1.4}}
</style><div class="g">{kort}</div>''')
print('ok')
