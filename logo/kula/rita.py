# Rivningskulan: platt, facetterad (som Braves lejon) – ljus från vänster upp, skuggor nere till höger
import math, re
W = 512
L = (-0.6, -0.8)            # ljusriktning (mot ljuset)
def mix(a, b, t):
    a = [int(a[i:i+2], 16) for i in (1, 3, 5)]; b = [int(b[i:i+2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(x + (y - x) * t) for x, y in zip(a, b))
LJUS, MID, MORK = '#ff8a4c', '#ff4b1f', '#b8240a'
def ton(cx, cy, pts):
    mx = sum(p[0] for p in pts) / len(pts) - cx; my = sum(p[1] for p in pts) / len(pts) - cy
    d = math.hypot(mx, my) or 1
    dot = (mx * L[0] + my * L[1]) / d                      # -1 skugga … 1 ljus
    near = 1 - min(1, d / 150)
    t = (dot + 1) / 2 * 0.75 + near * 0.25
    return mix(MORK, MID, min(1, t * 1.6)) if t < 0.62 else mix(MID, LJUS, (t - 0.62) / 0.38)
def poly(pts, fill, extra=''):
    return '<polygon points="%s" fill="%s"%s/>' % (' '.join('%.1f,%.1f' % p for p in pts), fill, extra)

cx, cy, R = 222, 300, 150
yttre = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a))) for a in range(-75, 285, 30)]   # 12 hörn
inre = [(cx - 18 + 86 * math.cos(math.radians(a)), cy - 22 + 86 * math.sin(math.radians(a))) for a in range(-60, 300, 60)]  # 6 hörn
mitt = (cx - 30, cy - 34)
delar = []
# yttre ringen: varje yttre kant + närmaste inre hörn, och mellanrummen
for i in range(12):
    a, b = yttre[i], yttre[(i + 1) % 12]
    j = (i // 2) % 6
    k = inre[(j + 1) % 6] if i % 2 else inre[j]
    delar.append([a, b, k])
    if i % 2:
        delar.append([b, inre[(j + 1) % 6], inre[j] if False else inre[(j + 1) % 6]])
for i in range(12):
    if i % 2 == 0:
        j = (i // 2) % 6
        delar.append([yttre[(i + 1) % 12], inre[j], inre[(j + 1) % 6]])
for j in range(6):
    delar.append([inre[j], inre[(j + 1) % 6], mitt])
svg = []
# kedja: länkar omväxlande rakt framifrån (ring) och från kanten (stav), snett upp åt vänster
ink = '#8e1a06'
fäste = (cx - 14, cy - R + 4)
vinkel = -112                                     # kedjans riktning (grader)
ux, uy = math.cos(math.radians(vinkel)), math.sin(math.radians(vinkel))
svg.append(poly([(fäste[0] - 26, fäste[1] + 8), (fäste[0] + 26, fäste[1] + 8), (fäste[0] + 16, fäste[1] - 16), (fäste[0] - 16, fäste[1] - 16)], ink))
extra_pts = []
for n in range(4):
    d = 40 + n * 46
    x, y = fäste[0] + ux * d, fäste[1] + uy * d
    rot = vinkel + 90
    if n % 2 == 0:
        svg.append('<ellipse cx="%.1f" cy="%.1f" rx="17" ry="29" transform="rotate(%d %.1f %.1f)" fill="none" stroke="%s" stroke-width="11"/>' % (x, y, rot, x, y, ink))
    else:
        svg.append('<rect x="%.1f" y="%.1f" width="12" height="62" rx="6" transform="rotate(%d %.1f %.1f)" fill="%s"/>' % (x - 6, y - 31, rot, x, y, '#b8240a'))
    extra_pts += [(x - 36, y - 36), (x + 36, y + 36)]
for p in delar:
    svg.append(poly(p, ton(cx, cy, p), ' stroke="%s" stroke-width="1.2" stroke-linejoin="round"' % ton(cx, cy, p)))
# smällen: splitter som flyger ut till höger (platta trianglar, mörkt + orange)
skarvor = [   # bitar av reklamrutan (ljusgrå) och kulans gnistor (orange)
    ([(384, 226), (456, 186), (428, 258)], '#d9d9de'),
    ([(398, 296), (484, 284), (430, 334)], '#a9a9b1'),
    ([(384, 352), (452, 392), (396, 406)], '#d9d9de'),
    ([(430, 134), (470, 112), (458, 158)], LJUS),
    ([(456, 352), (494, 344), (474, 378)], MID),
    ([(468, 228), (500, 222), (486, 250)], '#a9a9b1'),
]
for p, f in skarvor: svg.append(poly(p, f))
# reklamrutans trasiga hörn (mörkt), precis där kulan slår

# centrera allt i en kvadrat med luft runt
xs = [float(v) for v in re.findall(r'([0-9.]+),[0-9.]+', ' '.join(svg))] + [p[0] for p in extra_pts]; ys = [float(v) for v in re.findall(r'[0-9.]+,([0-9.]+)', ' '.join(svg))] + [p[1] for p in extra_pts]
x0, x1, y0, y1 = min(xs) - 6, max(xs) + 6, min(ys) - 6, max(ys) + 6
sida = max(x1 - x0, y1 - y0) + 24
vx, vy = (x0 + x1) / 2 - sida / 2, (y0 + y1) / 2 - sida / 2
out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%.0f %.0f %.0f %.0f">%s</svg>' % (vx, vy, sida, sida, ''.join(svg))
open('kula.svg', 'w').write(out)
