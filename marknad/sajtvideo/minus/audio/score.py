"""Musik och ljud till sajtvideon "minus": 30,0 s, 96 slag per minut, 12 takter. Allt syntas här, inget är lånat.

Kör från projektmappen (numpy + scipy finns i reels-miljön):
  /home/mint/adraze-reels/venv/bin/python audio/score.py

Ljudet berättar samma sak som bilden: stamp och klapp i botten, ett irriterande lager för varje band som
läggs till, och för varje landning en stamp där just det lagret tystnar tvärt. Sedan ett varmt durackord.
Tiderna för det som syns i bild räknas med samma avrundning som i index.html (bt), musiken går på exakt takt.
Spåret loopar: svansen efter 30,0 s viks in över början.
"""
import numpy as np, wave
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000; DUR = 30.0; N = int(SR * DUR); TAIL = int(SR * 3.0)
BPM = 96; B = 60 / BPM
rng = np.random.default_rng(96)
L = np.zeros(N + TAIL); R = np.zeros(N + TAIL)


def bt(k):                                     # slag k i bild, avrundat till bildruta (som i index.html)
    return np.floor(k * 18.75 + 0.49) / 30


def add(sig, start, pan=0.0, gain=1.0):
    i = int(round(start * SR))
    if i < 0: sig = sig[-i:]; i = 0
    if i >= len(L): return
    j = min(len(L), i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))


def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def hp(x, f): return sosfilt(butter(2, f, "hp", fs=SR, output="sos"), x)
def lp(x, f): return sosfilt(butter(2, f, "lp", fs=SR, output="sos"), x)
def bp(x, a, b): return sosfilt(butter(2, [a, b], "bp", fs=SR, output="sos"), x)


# ---------- grunden: stamp, klapp, skak ----------
def stomp(v=1.0):                              # fot i golvet: djup duns + en dov smäll som hörs i små högtalare
    t = tt(0.7); f = 40 + 70 * np.exp(-t * 16)
    low = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
    thud = bp(rng.standard_normal(len(t)), 120, 700) * np.exp(-t * 26) * 0.9
    knock = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 40) * 0.5
    return (low + thud + knock) * (1 - np.exp(-t * 1500)) * v


def clap(v=1.0):                               # handklapp: tre täta smällar + svans
    t = tt(0.3); x = rng.standard_normal(len(t))
    env = np.exp(-t * 20) * 0.7
    for d in (0.0, 0.011, 0.023): env += np.where(t >= d, np.exp(-(t - d) * 180), 0) * 0.6
    return bp(x, 800, 4800) * env * v


def shaker(v=1.0, d=0.06):
    t = tt(d); return hp(rng.standard_normal(len(t)), 6000) * np.sin(np.pi * np.minimum(1, t / d)) ** 2 * v


# ---------- verktygslådan (samma recept som förebildens score.py) ----------
def marimba(m, d=0.6, v=1.0):
    t = tt(d); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 30) + 0.15 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t * 60)
    return s * (1 - np.exp(-t * 900)) * np.exp(-t * 6) * v


def pad(ms, d, v=1.0, att=0.5, rel=0.6):
    t = tt(d); s = np.zeros(len(t))
    for m in ms:
        for det in (-0.08, 0.0, 0.07):
            s += np.sin(2 * np.pi * mtof(m + det) * t + rng.uniform(0, 6)) + 0.25 * np.sin(4 * np.pi * mtof(m + det) * t + rng.uniform(0, 6))
    return lp(s, 1700) * np.minimum(1, t / att) * np.minimum(1, (d - t) / rel) / (len(ms) * 3) * v


def bass(m, d, v=1.0):
    t = tt(d); f = mtof(m); s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return s * (1 - np.exp(-t * 200)) * np.exp(-t * 1.6) * np.minimum(1, (d - t) / 0.05) * v


def pop(v=1.0, f0=520):
    t = tt(0.12); f = f0 * (1 + 1.6 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35) * v


def whoosh(d=0.35, v=1.0, up=True):
    t = tt(d); x = rng.standard_normal(len(t) + 400); out = np.zeros(len(t)); seg = 1200
    for k in range(0, len(t), seg):
        p = k / len(t); fc = 400 + 4000 * (p if up else 1 - p)
        out[k:k + seg] = bp(x[k:k + seg + 400], fc * 0.7, min(fc * 1.4, 20000))[: len(out[k:k + seg])]
    return out * np.sin(np.pi * np.minimum(1, t / d)) ** 2 * v


def scratch(d, v=1.0):                         # penna mot papper
    t = tt(d); x = bp(rng.standard_normal(len(t)), 2500, 9000)
    am = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 7 * t + 3 * np.sin(2 * np.pi * 1.3 * t)))
    return x * am * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.05) * v


def boom(v=1.0):
    t = tt(0.9); f = 38 + 60 * np.exp(-t * 14)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4) + 0.25 * lp(rng.standard_normal(len(t)), 600) * np.exp(-t * 9)) * v


def tick(v=1.0, f=2600):
    t = tt(0.03); return np.sin(2 * np.pi * f * t) * np.exp(-t * 200) * v


def flap(v=1.0):                               # papper som fälls ihop
    t = tt(0.11); x = bp(rng.standard_normal(len(t)), 500, 3500)
    return x * (np.exp(-t * 45) + 0.5 * np.exp(-((t - 0.05) ** 2) / 0.0002)) * v


# ---------- de fem irriterande lagren ----------
def layer(sig, t0, t1, pan=0.0, gain=1.0, fade_in=0.0, cut=True, gaps=()):
    """Lägger ett lager mellan t0 och t1. Slutet klipps tvärt (4 ms), det är hela poängen. cut=False låter sista tonen klinga ut.
    gaps: tider (a, b) där lagret är tyst, också med tvära kanter."""
    n0, n1 = int(round(t0 * SR)), int(round(t1 * SR)); s = sig.copy()
    if cut: s = s[: n1 - n0]; k = int(0.004 * SR); s[-k:] *= np.linspace(1, 0, k)
    if fade_in > 0: m = int(fade_in * SR); s[:m] *= np.linspace(0, 1, m)
    for a, b in gaps:
        i, j = max(0, int(round((a - t0) * SR))), min(len(s), int(round((b - t0) * SR))); k = int(0.004 * SR)
        if j <= i: continue
        s[i:j] = 0; s[max(0, i - k):i] *= np.linspace(1, 0, i - max(0, i - k)); s[j:j + k] *= np.linspace(0, 1, len(s[j:j + k]))
    add(s, t0, pan, gain)


def blip(m, d=0.15):                           # liten gäll fyrkantston
    t = tt(d); f = mtof(m) * (1 + 0.006 * np.sin(2 * np.pi * 9 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return lp(np.sign(np.sin(ph)) * 0.6 + np.sin(ph), 5200) * (1 - np.exp(-t * 700)) * np.exp(-t * 15)


JING = [86, 90, 93, 90, 86, 90, 93, 98, 95, 93, 90, 93, 95, 93, 90, 0]      # reklamslingan: en fånig liten trudelutt i åttondelar


def jingle(b0, b1):
    """Slingan mellan slag b0 och b1 (plus utklang). Mönstret räknas från slag 0, så att den går runt i skarven."""
    out = np.zeros(int((b1 - b0) * B * SR) + SR)
    k = int(np.ceil(b0 * 2 - 1e-9))
    while k * B / 2 < b1 * B - 1e-9:
        m = JING[k % 16]
        if m:
            i = int(round((k * B / 2 - b0 * B) * SR)); s = blip(m); out[i:i + len(s)] += s
        k += 1
    return out


def sonar(b0, b1):                             # ekolodet: ett pip var 1,5 slag, med två ekon
    out = np.zeros(int((b1 - b0) * B * SR) + SR)
    t = tt(0.5); f = 1318.5 * (1 + 0.03 * np.exp(-t * 30)); ping = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * (1 - np.exp(-t * 900))
    b = b0
    while b < b1 - 1e-9:
        for dly, g in ((0, 1), (0.21, 0.38), (0.42, 0.15)):
            i = int(round(((b - b0) * B + dly) * SR)); out[i:i + len(ping)] += ping * g
        b += 1.5
    return out[: int(round((b1 - b0) * B * SR))]


def knock(b0, b1, fast_from):                  # knackningen på två toner: hög på slaget, låg emellan. Sist dubbelt så fort.
    out = np.zeros(int((b1 - b0) * B * SR) + SR)

    def wood(f):
        t = tt(0.09); return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t * 55) * (1 - np.exp(-t * 2000))
    b, n = b0, 0
    while b < b1 - 1e-9:
        i = int(round((b - b0) * B * SR)); s = wood(740 if n % 2 == 0 else 587); out[i:i + len(s)] += s
        b += 0.25 if b >= fast_from - 1e-9 else 0.5; n += 1
    return out[: int(round((b1 - b0) * B * SR))]


def siren(b0, b1):                             # sirenen: glider upp och ner, ett varv på två slag
    t = tt((b1 - b0) * B); f = 520 * 2 ** (0.3 * np.sin(2 * np.pi * (t / (2 * B)) - np.pi / 2))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.33 * np.sin(3 * ph) + 0.2 * np.sin(5 * ph)
    return lp(s, 2400) * (0.8 + 0.2 * np.sin(2 * np.pi * 6 * t))


# ================= musiken =================
SLAM = [1, 3, 5, 6, 7]                         # banden slår in
LAND = [12, 14, 16, 18, 20]                    # gorillan landar

# stamp och klapp hela vägen: stamp på jämna slag, klapp på udda, och en lätt upptakt före nästa stamp
for c in range(24):
    b = 2 * c
    g = 0.8 if b < 12 else 1.0 if b < 26 else 0.85 if b < 42 else 0.6
    if b not in LAND: add(stomp(0.75 * g), b * B, 0.0)
    add(clap(0.5 * g), (b + 1) * B, 0.08)
    add(stomp(0.32 * g), (b + 1.5) * B, 0.0)
    if c % 4 == 3: add(clap(0.26 * g), (b + 1.5) * B, -0.12)
for e in range(96):                            # skak i åttondelar, så att det aldrig blir ett hål (starkare där bara stamp och klapp är kvar)
    g = 1.9 if 40 <= e < 52 else 1.5 if e >= 84 else 1.0
    add(shaker((0.11 if e % 2 else 0.07) * g), e * B / 2, 0.3 if e % 2 else -0.3)
    if 40 <= e < 52 or e >= 84: add(shaker(0.05 * g, 0.04), (e + 0.5) * B / 2, 0.0)

# de fem lagren: börjar när bandet landar, slutar tvärt när gorillan landar på det.
# Tystnaden före första stampen: alla lager tystnar 0,3 s före slag 12 (gorillan faller in) och de fyra som är kvar kommer tillbaka på stampen.
HUSH = (bt(12) - 0.3, bt(12))
def hushed(t): return bt(12) - 0.45 < t < bt(12) + 0.62   # samma fönster som i bild: inget nytt poppar
layer(jingle(1, 12), 1 * B, bt(12), -0.45, 0.19, gaps=[HUSH])
layer(sonar(3, 14), 3 * B, bt(14), 0.55, 0.21, gaps=[HUSH])
layer(knock(6, 18, 16.5), 6 * B, bt(18), 0.3, 0.2, gaps=[HUSH])
layer(siren(7, 20), 7 * B, bt(20), -0.15, 0.085, gaps=[HUSH])
for q in range(11):                            # poppandet: en ruta per slag, på baktakten (samma tider som rutorna i bild)
    if hushed(bt(5.5 + q)): continue
    add(pop(0.3, 480 + 70 * ((q * 5) % 7)), bt(5.5 + q), 0.5 if q % 2 == 0 else -0.1)
# upptakt till nästa varv: slingan smyger in i sista takten och ligger kvar svagt fram till slag 1
layer(jingle(46, 48), 46 * B, 48 * B, -0.45, 0.19 * 0.4, fade_in=1.1, cut=False)
layer(jingle(0, 1), 0, 1 * B, -0.45, 0.19 * 0.4)

# banden: en duns var, lite mörkare för varje
for i, b in enumerate(SLAM): add(boom(0.5), bt(b), 0.0); add(stomp(0.55), bt(b), 0.0); add(whoosh(0.2, 0.22, True), bt(b) - 0.2, 0.0)
add(pop(0.3, 700), bt(7) + 0.13, 0.5)          # knappen ACCEPT ALL poppar in

# gorillan
add(pop(0.3, 330), bt(10), 0.55)               # tittar fram
add(whoosh(0.4, 0.45, True), bt(11), 0.4)      # hoppet
add(whoosh(0.2, 0.4, False), bt(12) - 0.2, -0.3)   # faller in i tystnaden före första stampen
for i, b in enumerate(LAND):
    T = bt(b)
    add(boom(0.95), T, 0.0); add(stomp(1.0), T, 0.0)                         # stamp: plus blir minus
    add(whoosh(0.24, 0.3, False), T + 0.35, -0.3)                            # bandet sjunker ihop
    add(marimba(69 + [0, 2, 4, 7, 9][i], 0.5, 0.2), T + 0.49, -0.2)          # Your page växer ett steg
for j in range(7): add(tick(0.1, 2200 + 90 * j), bt(13) + j * 0.08, 0.5)     # ordboksraden skrivs in (sju ord)
JD = 0.15                                                                    # skämten i banden kommer 0,15 s efter stampen, som i bild
add(pop(0.3, 620), bt(16) + JD, 0.5); add(pop(0.3, 500), bt(16) + JD + 0.07, -0.1)   # rutorna stängs
add(pop(0.4, 880), bt(18) + JD + 0.04, 0.5)                                  # reject växer
add(tick(0.3, 900), bt(20) + JD, 0.5); add(stomp(0.3), bt(20) + JD, 0.5)      # pilen tar stopp

# fotnoten och påståendet
add(whoosh(0.4, 0.45, True), bt(21), -0.5)                                   # upp ur bild
for k in range(5): add(tick(0.09, 1700 + 120 * k), bt(21) + 0.3 + 0.04 * k, -0.4 + 0.2 * k)
add(stomp(0.6), bt(22), 0.4)                                                 # landar på baslinjen
add(whoosh(0.2, 0.25, False), bt(24) - 0.17, -0.4); add(pop(0.55, 300), bt(24), -0.4); add(stomp(0.45), bt(24), -0.3)   # Same
add(tick(0.2, 1900), bt(24) + 0.3, 0.0)                                      # punkten
add(scratch(0.5, 0.3), bt(25) + 0.05, 0.0)                                   # minustecknen blir ett streck
for j in range(3): add(pop(0.3, 420 + 60 * j), bt(25) + 0.14 + j * 0.11, -0.3 + 0.3 * j)
add(stomp(0.4), bt(28), 0.4)                                                 # litet nöjt skutt

# det varma durackordet: kommer in vid påståendet och stannar (D-dur med rörelse i mellanstämman)
CH = [(15.625, 20.0, [50, 57, 62, 66, 69]), (20.0, 22.5, [50, 55, 62, 67, 71]), (22.5, 25.0, [50, 57, 62, 66, 73]),
      (25.0, 26.25, [52, 57, 61, 64, 69]), (26.25, 30.55, [50, 57, 62, 66, 69, 74])]
for a, z, ms in CH: add(pad(ms, z - a + 0.5, 1.0, att=0.45 if a > 16 else 0.9), a - 0.05, 0.0, 0.34)
for a, z, ms in CH[:-1]: add(bass(ms[0] - 12, min(2.4, z - a), 0.4), a + (0.0 if a > 16 else 0.6), 0.0)
add(bass(38, 2.6, 0.5), 26.25, 0.0)

# AdRaze och de fyra orange plusraderna
add(whoosh(0.3, 0.4, True), bt(30) - 0.42, 0.5); add(whoosh(0.34, 0.3, False), bt(30) - 0.34, -0.2)
add(boom(0.7), bt(30), -0.5); add(stomp(0.8), bt(30), -0.5)
for j in range(6): add(pop(0.34, 520 + 70 * j), bt(30) - 0.02 + j * 0.05, -0.4 + 0.1 * j)
ROW = [78, 81, 83, 86]                                                       # en marimbaton per rad, stigande, en rad vartannat slag
for i, m in enumerate(ROW):
    T, Lr = bt(31 + 2 * i), bt(32 + 2 * i)
    add(scratch(0.11, 0.3), T - 0.1, -0.5); add(marimba(m, 1.2, 0.5), T, -0.3); add(marimba(m - 12, 0.9, 0.22), T, -0.3)
    if i == 0: add(whoosh(0.3, 0.4, True), Lr - 0.4, -0.5); add(whoosh(0.2, 0.3, False), Lr - 0.18, 0.3)   # upp ur bild, ner i slutet av raden
    else: add(whoosh(0.28, 0.22, True), Lr - 0.34, 0.4)                                                   # ett skutt nedåt
    add(stomp(0.45), Lr, 0.35); add(pop(0.3, 600 + 90 * i), Lr + 0.03, 0.4); add(marimba(m + 12, 0.35, 0.14), Lr + 0.03, 0.4)   # landar: raden gungar och plustecknet sväller
add(marimba(90, 1.0, 0.22), bt(39), 0.0)

# slutkortet: gorillan tar sats från sista raden, fyra flax, knappen växer, gorillan landar på slag 41, slutackord
add(whoosh(0.34, 0.4, True), bt(40), 0.4)
for i in range(4):
    add(flap(0.5), 25.0 + 0.1 * i, -0.4 + 0.1 * i); add(pop(0.26, 400 + 90 * i), 25.32 + 0.1 * i, 0.1)
add(whoosh(0.2, 0.3, False), bt(41) - 0.18, -0.2); add(boom(0.55), bt(41), -0.3); add(stomp(0.7), bt(41), -0.3)
add(pop(0.5, 760), 25.67, 0.1)
for k, m in enumerate([62, 66, 69, 74, 78]): add(marimba(m, 1.6, 0.34), 26.25 + k * 0.07, (k - 2) * 0.25)
add(tick(0.1, 2000), 25.95, 0.0)
add(whoosh(0.7, 0.4, True), 29.375, 0.0)                                     # sidan rullar: Your page kommer underifrån

# ================= master =================
mix = np.stack([L, R], 1)
ir = rng.standard_normal(int(0.9 * SR)) * np.exp(-np.arange(int(0.9 * SR)) / (0.16 * SR)) * 0.012
rev = fftconvolve(mix[:, 0] + mix[:, 1], ir)[: len(mix)]
mix += rev[:, None] * 0.5
mix[:TAIL] += mix[N:N + TAIL]                   # loopen: svansen efter 30,0 s viks in över början
mix = mix[:N]
mix = np.tanh(mix * 1.35) / np.tanh(1.35)
mix /= np.max(np.abs(mix)) / 0.89
with wave.open("assets/score.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
rms = [20 * np.log10(np.sqrt(np.mean(mix[int(s * SR):int((s + 0.25) * SR)] ** 2)) + 1e-9) for s in np.arange(0, DUR, 0.25)]
print("ok", DUR, "s. nivå per kvarts sekund (dB), en rad per fem sekunder:")
for r in range(6): print(f"{r * 5:2d} s: " + " ".join(f"{v:.0f}" for v in rms[r * 20:(r + 1) * 20]))
print("lägst", round(min(rms), 1), "högst", round(max(rms), 1))
