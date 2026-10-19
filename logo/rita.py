#!/usr/bin/env python3
"""Ritar AdRaze-loggförslag i platt illustrationsstil (egna figurer, inga lånade unDraw-delar).
Kör: python3 rita.py  -> skriver svg/*.svg och index.html"""
import pathlib
UT = pathlib.Path(__file__).parent
(UT / 'svg').mkdir(exist_ok=True)

INK, ORANGE, HUD, HAR, GRA, LJUS, VIT = '#2f2e41', '#ff4b1f', '#ffb6b6', '#2f2e41', '#e6e6e6', '#f2f2f2', '#ffffff'

def linje(pkt, farg, w):
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in pkt)
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
        s.append(f'<circle cx="{a[-1][0]}" cy="{a[-1][1]}" r="{5*skala}" fill="{HUD}"/>')
    x, y = huvud
    s.append(f'<rect x="{x - 5*skala}" y="{y + 8*skala}" width="{10*skala}" height="{12*skala}" fill="{HUD}"/>')
    s.append(f'<circle cx="{x}" cy="{y}" r="{15*skala}" fill="{HUD}"/>')
    if har == 'knut':
        s.append(f'<path d="M{x-16*skala},{y+2*skala} C{x-18*skala},{y-20*skala} {x+16*skala},{y-22*skala} {x+16*skala},{y-4*skala} C{x+6*skala},{y-10*skala} {x-6*skala},{y-8*skala} {x-16*skala},{y+2*skala} Z" fill="{HAR}"/>')
        s.append(f'<circle cx="{x+4*skala}" cy="{y-20*skala}" r="{8*skala}" fill="{HAR}"/>')
    else:  # kort
        s.append(f'<path d="M{x-16*skala},{y} C{x-18*skala},{y-22*skala} {x+18*skala},{y-22*skala} {x+16*skala},{y-2*skala} C{x+8*skala},{y-12*skala} {x-8*skala},{y-12*skala} {x-16*skala},{y} Z" fill="{HAR}"/>')
    return '\n'.join(s)

def svg(inne, vb='0 0 240 240', bg=None):
    b = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{b}{inne}</svg>'

def forbud(cx, cy, r, w, farg=ORANGE):
    """Förbudsskylt: ring + snedstreck"""
    import math
    d = r * math.cos(math.pi / 4)
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{farg}" stroke-width="{w}"/>'
            f'<line x1="{cx-d}" y1="{cy+d}" x2="{cx+d}" y2="{cy-d}" stroke="{farg}" stroke-width="{w}" stroke-linecap="round"/>')

def ad_kort(x, y, w, h, rot=0, farg=GRA, text=INK):
    return (f'<g transform="rotate({rot} {x+w/2} {y+h/2})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h*0.18}" fill="{farg}"/>'
            f'<text x="{x+w/2}" y="{y+h*0.66}" text-anchor="middle" font-family="Familjen Grotesk, Arial Black, sans-serif" font-weight="700" font-size="{h*0.5}" fill="{text}">AD</text></g>')

forslag = {}

# A: Sköldbäraren – figuren håller fram en stor orange sköld med förbudstecken
a = []
a.append(f'<path d="M120,40 L176,60 C176,120 160,160 120,190 C80,160 64,120 64,60 Z" fill="{ORANGE}"/>')
a.append(f'<path d="M120,40 L176,60 C176,120 160,160 120,190 Z" fill="#000" opacity=".12"/>')
a.append(forbud(120, 108, 30, 9, VIT))
a.append(figur((52, 92), (56, 168), ((44, 112), (66, 112)), [[(66, 114), (80, 128), (92, 118)], [(46, 114), (40, 140), (52, 150)]], [[(52, 168), (46, 196), (40, 222)], [(60, 168), (66, 196), (70, 222)]]))
a.append(f'<line x1="20" y1="226" x2="220" y2="226" stroke="{GRA}" stroke-width="3" stroke-linecap="round"/>')
forslag['A'] = ('Sköldbäraren', 'Figuren håller fram en orange sköld med förbudstecken. Skydd, lugnt och tryggt.', '\n'.join(a))

# B: Kicken – figuren sparkar iväg en AD-ruta som flyger ut ur bilden
b = []
b.append(ad_kort(150, 40, 64, 40, 18))
b.append(f'<path d="M126,118 C140,100 150,92 162,86" fill="none" stroke="{ORANGE}" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9"/>')
b.append(figur((86, 80), (84, 150), ((74, 100), (98, 100)), [[(98, 102), (116, 96), (128, 82)], [(76, 102), (60, 118), (56, 136)]], [[(80, 150), (74, 184), (72, 220)], [(90, 150), (114, 140), (134, 120)]], har='kort'))
b.append(f'<line x1="20" y1="224" x2="220" y2="224" stroke="{GRA}" stroke-width="3" stroke-linecap="round"/>')
forslag['B'] = ('Kicken', 'Figuren sparkar iväg en reklamruta. Mest energi och humor, passar "raze".', '\n'.join(b))

# C: Förbudsskylten – stor orange förbudsring, figuren lutar sig avslappnat mot den
c = []
c.append(f'<circle cx="138" cy="112" r="74" fill="{ORANGE}"/>')
c.append(f'<circle cx="138" cy="112" r="50" fill="{VIT}"/>')
c.append(f'<line x1="102" y1="148" x2="174" y2="76" stroke="{ORANGE}" stroke-width="22" stroke-linecap="round"/>')
c.append(ad_kort(116, 98, 44, 28, 0, GRA))
c.append(f'<line x1="102" y1="148" x2="174" y2="76" stroke="{ORANGE}" stroke-width="16" stroke-linecap="round"/>')
c.append(figur((54, 118), (58, 186), ((46, 138), (68, 138)), [[(68, 140), (78, 126), (72, 110)], [(48, 140), (46, 162), (58, 172)]], [[(54, 186), (58, 206), (48, 224)], [(62, 186), (78, 204), (86, 224)]]))
c.append(f'<line x1="20" y1="228" x2="220" y2="228" stroke="{GRA}" stroke-width="3" stroke-linecap="round"/>')
forslag['C'] = ('Förbudsskylten', 'Stort förbudstecken över en AD-ruta, figuren lutar sig mot det. Tydligast på långt håll.', '\n'.join(c))

# D: Fönstret – webbläsarfönster, figuren drar ut AD-rutan och slänger den
d = []
d.append(f'<rect x="40" y="44" width="160" height="120" rx="12" fill="{VIT}" stroke="{INK}" stroke-width="6"/>')
d.append(f'<line x1="40" y1="70" x2="200" y2="70" stroke="{INK}" stroke-width="6"/>')
for i, x in enumerate((56, 70, 84)): d.append(f'<circle cx="{x}" cy="57" r="4" fill="{ORANGE if i == 0 else GRA}"/>')
d.append(f'<rect x="56" y="86" width="80" height="10" rx="5" fill="{GRA}"/><rect x="56" y="104" width="60" height="10" rx="5" fill="{GRA}"/><rect x="56" y="122" width="70" height="10" rx="5" fill="{GRA}"/>')
d.append(ad_kort(150, 96, 60, 38, -14, ORANGE, VIT))
d.append(figur((196, 120), (200, 190), ((190, 140), (210, 140)), [[(190, 142), (176, 128), (172, 114)], [(208, 142), (214, 162), (206, 174)]], [[(196, 190), (192, 210), (186, 226)], [(204, 190), (212, 208), (220, 226)]]))
forslag['D'] = ('Fönstret', 'En webbläsare där figuren drar ut reklamen. Visar exakt vad produkten gör.', '\n'.join(d))

# E: Märket – orange rundad ruta med vitt förbudstecken, en liten figur sitter på kanten
e = []
e.append(f'<rect x="40" y="70" width="150" height="150" rx="36" fill="{ORANGE}"/>')
e.append(forbud(115, 145, 42, 13, VIT))
e.append(figur((150, 30), (150, 70), ((140, 46), (160, 46)), [[(160, 48), (172, 60), (176, 68)], [(140, 48), (132, 60), (130, 68)]], [[(146, 70), (170, 74), (176, 100)], [(154, 70), (182, 72), (190, 96)]], skala=0.8))
forslag['E'] = ('Märket', 'Appikon: orange ruta med förbudstecken och en liten figur som sitter på kanten. Funkar som ikon i Chrome.', '\n'.join(e))

for k, (namn, _, inne) in forslag.items():
    (UT / 'svg' / f'{k}.svg').write_text(svg(inne))

kort = ''.join(f'''
<article>
  <div class="ytor"><div class="yta ljus">{svg(inne)}</div><div class="yta mork">{svg(inne)}</div></div>
  <div class="lockup">{svg(inne)}<span>adraze</span></div>
  <div class="sma"><span>{svg(inne)}</span><span>{svg(inne)}</span><span>{svg(inne)}</span></div>
  <h2>{k}. {namn}</h2><p>{text}</p>
</article>''' for k, (namn, text, inne) in forslag.items())

(UT / 'index.html').write_text(f'''<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AdRaze loggförslag</title>
<style>
@font-face {{ font-family: "Familjen Grotesk"; src: url("../site/fonts/familjen.woff2") format("woff2"); font-weight: 400 700; }}
:root {{ --bg:#f2f2ef; --ink:#111113; --dov:#5c5c63; --linje:#dadad4; }}
* {{ box-sizing:border-box; margin:0 }}
body {{ background:var(--bg); color:var(--ink); font:16px/1.5 "Familjen Grotesk",system-ui,sans-serif; padding:48px 16px 96px }}
main {{ max-width:1240px; margin:auto }}
h1 {{ font-size:clamp(40px,6vw,72px); letter-spacing:-.05em; line-height:1 }}
.ingress {{ color:var(--dov); margin:16px 0 48px; max-width:60ch; font-size:18px }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:20px }}
article {{ background:#fff; border:1px solid var(--linje); border-radius:22px; padding:20px }}
.ytor {{ display:grid; grid-template-columns:1fr 1fr; gap:10px }}
.yta {{ border-radius:14px; aspect-ratio:1; display:grid; place-items:center; padding:10px }}
.yta svg {{ width:100%; height:100% }}
.ljus {{ background:var(--bg) }} .mork {{ background:#111113 }}
.lockup {{ display:flex; align-items:center; gap:4px; margin:18px 0 6px; font-weight:700; font-size:40px; letter-spacing:-.05em }}
.lockup svg {{ width:64px; height:64px }}
.sma {{ display:flex; align-items:end; gap:14px; margin:8px 0 16px }}
.sma span:nth-child(1) svg {{ width:48px; height:48px }} .sma span:nth-child(2) svg {{ width:32px; height:32px }} .sma span:nth-child(3) svg {{ width:16px; height:16px }}
h2 {{ font-size:24px; letter-spacing:-.03em }} article p {{ color:var(--dov); margin-top:6px }}
</style></head><body><main>
<h1>Loggförslag för AdRaze</h1>
<p class="ingress">Platt illustrationsstil som gubbarna på sajten, men egna figurer. Varje förslag visas på ljus och mörk bakgrund, ihop med namnet och i små storlekar (48, 32 och 16 px) så man ser hur den funkar som ikon.</p>
<div class="grid">{kort}</div></main></body></html>''')
print('klart:', ', '.join(forslag))
