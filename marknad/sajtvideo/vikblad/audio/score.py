"""Musik och ljud till sajtvideon vikblad: pappershiphop, 36,0 s, 80 slag per minut, 12 takter. Allt syntas här.
Effekterna ligger på samma tider som rörelserna i index.html. Spåret loopar: det som klingar förbi slutet läggs över början.

  /home/mint/adraze-reels/venv/bin/python audio/score.py        (skriver assets/score.wav)
"""
import numpy as np, wave
from pathlib import Path
from scipy.signal import butter, sosfilt

SR = 48000; DUR = 36.0; N = int(SR * DUR)
BPM = 80; B = 60 / BPM                      # ett slag = 0,75 s
rng = np.random.default_rng(11)
mus = np.zeros((N, 2)); fx = np.zeros((N, 2))   # musiken för sig (den bromsas som ett band), effekterna för sig


def add(buss, sig, start, pan=0.0, gain=1.0):
    """Lägger in en ton. Det som går förbi slutet viks in över början (loopen)."""
    i = int(round(start * SR)) % N
    s = sig[: N] * gain
    lr = np.stack([s * np.sqrt(0.5 * (1 - pan)), s * np.sqrt(0.5 * (1 + pan))], 1)
    k = min(len(s), N - i)
    buss[i:i + k] += lr[:k]
    if k < len(s): buss[: len(s) - k] += lr[k:]


def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def hp(x, f): return sosfilt(butter(2, f, "hp", fs=SR, output="sos"), x)
def lp(x, f): return sosfilt(butter(2, f, "lp", fs=SR, output="sos"), x)
def bp(x, a, b): return sosfilt(butter(2, [a, b], "bp", fs=SR, output="sos"), x)


# ---------- instrument ----------
def elpiano(m, d, v=1.0):
    """Sinus med en klang i anslaget, lätt svaj och tremolo."""
    t = tt(d); f = mtof(m)
    fas = 2 * np.pi * f * t + 0.9 * np.sin(2 * np.pi * 0.7 * t + m)      # lätt svaj
    s = np.sin(fas + 1.1 * np.exp(-t * 5) * np.sin(2 * fas)) + 0.22 * np.sin(2 * fas) * np.exp(-t * 3.5) + 0.08 * np.sin(4 * fas) * np.exp(-t * 9)
    trem = 1 + 0.14 * np.sin(2 * np.pi * 4.4 * t + 0.6)
    env = (1 - np.exp(-t * 320)) * np.exp(-t * 1.25) * np.minimum(1, (d - t) / 0.1)
    return s * env * trem * v


def bas(m, d, v=1.0):
    t = tt(d); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6) + 0.1 * np.sin(6 * np.pi * f * t) * np.exp(-t * 10)
    return np.tanh(s * 1.3) * (1 - np.exp(-t * 180)) * np.exp(-t * 1.8) * np.minimum(1, (d - t) / 0.04) * v


def kagge(v=1.0):
    """Dammig baskagge: kort svep, lite dist, mjuk klick."""
    t = tt(0.32); f = 46 + 75 * np.exp(-t * 26)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    klick = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 160) * 0.35
    return np.tanh((s + klick) * 1.8) * 0.7 * v


def kantslag(v=1.0):
    t = tt(0.09)
    s = np.sin(2 * np.pi * 430 * t) * np.exp(-t * 70) + 0.6 * np.sin(2 * np.pi * 1750 * t) * np.exp(-t * 95)
    n = bp(rng.standard_normal(len(t)), 1400, 4200) * np.exp(-t * 60) * 0.7
    return (s + n) * (1 - np.exp(-t * 3000)) * v


def hatt(v=1.0, d=0.05):
    t = tt(d); return lp(hp(rng.standard_normal(len(t)), 5200), 9500) * np.exp(-t / 0.014) * v


# ---------- effekter ----------
def pop(v=1.0, f0=520):
    t = tt(0.16); f = f0 * (1 + 1.4 * np.exp(-t * 70))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26) * v


def svep(d=0.35, v=1.0, upp=True, lag=400, hog=4400):
    """Brus som sveper genom ett bandpass."""
    t = tt(d); x = rng.standard_normal(len(t) + 600); out = np.zeros(len(t)); seg = 1200
    for k in range(0, len(t), seg):
        p = k / len(t); fc = lag + (hog - lag) * (p if upp else 1 - p)
        out[k:k + seg] = bp(x[k:k + seg + 400], fc * 0.7, min(fc * 1.4, 20000))[: len(out[k:k + seg])]
    return out * np.sin(np.pi * np.minimum(1, t / d)) ** 2 * v


def flax(d=0.5, v=1.0, upp=True, fart=22):
    """Pappersflax: svepet fladdrar."""
    t = tt(d)
    return svep(d, v, upp, 500, 5200) * (0.55 + 0.45 * np.abs(np.sin(2 * np.pi * fart * t * (1 + t))))


def rasp(d, v=1.0):
    """Penna mot papper."""
    t = tt(d); x = bp(rng.standard_normal(len(t)), 2400, 8500)
    am = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 7 * t + 3 * np.sin(2 * np.pi * 1.3 * t)))
    return x * am * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.05) * v


def duns(v=1.0, d=0.6):
    t = tt(d); f = 40 + 55 * np.exp(-t * 16)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) + 0.22 * lp(rng.standard_normal(len(t)), 500) * np.exp(-t * 12)) * v


def knack(v=1.0):
    """Huvudet i ramens kant."""
    t = tt(0.12)
    return (np.sin(2 * np.pi * 190 * t) * np.exp(-t * 45) + 0.5 * np.sin(2 * np.pi * 510 * t) * np.exp(-t * 70) + 0.3 * bp(rng.standard_normal(len(t)), 700, 2600) * np.exp(-t * 90)) * v


def tick(v=1.0, f=2300):
    t = tt(0.035); return (np.sin(2 * np.pi * f * t) + 0.5 * hp(rng.standard_normal(len(t)), 3500)) * np.exp(-t * 180) * v


def flick(v=1.0):
    """Ett blad som fälls ner."""
    t = tt(0.11); return bp(rng.standard_normal(len(t)), 1200, 6500) * np.exp(-((t - 0.035) / 0.022) ** 2) * v


def fjader(v=1.0, d=0.42):
    """Ordet som knuffas undan och fjädrar tillbaka: en kort, dämpad svängning."""
    t = tt(d); f = 250 * (1 + 0.16 * np.sin(2 * np.pi * 12 * t) * np.exp(-t * 5))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8) * (1 - np.exp(-t * 900)) * v


def small(v=1.0):
    """Omslaget slår igen: pappersklatsch och duns."""
    t = tt(0.5)
    kl = bp(rng.standard_normal(len(t)), 350, 5200) * (np.exp(-t * 34) + 0.5 * np.exp(-((t - 0.018) % 0.013) * 260) * (t < 0.05))
    return (kl * 0.9 + duns(1.0, 0.5)[: len(t)] * 0.9) * v


# ---------- musiken ----------
#              ackord (elpiano)            bas
FA = ([53, 57, 60, 64, 67], 41)   # Fmaj9
E7 = ([52, 56, 62, 67], 40)       # E7#9
AM = ([57, 60, 64, 67, 71], 45)   # Am9
D9 = ([50, 54, 60, 64], 38)       # D9
TAKT_A, TAKT_B = (FA, E7), (AM, D9)
SVANG = 0.035                     # baktunga åttondelar


def ackord(ac, t0, d, v=1.0, upp=0, roll=0.018):
    toner, _ = ac
    for k, m in enumerate(toner):
        add(mus, elpiano(m + upp, d, 0.21 * v * (1.0 if k else 1.1)), t0 + k * roll, (k - len(toner) / 2) * 0.16)


def trumtakt(t0, slag=(0, 1, 2, 3), v=1.0, hattar=True):
    for b in slag:
        tb = t0 + b * B
        if b in (0, 2): add(mus, kagge(0.8 * v), tb)
        if b == 1: add(mus, kagge(0.5 * v), tb + B / 2 + SVANG)             # synkop
        if b in (1, 3): add(mus, kantslag(0.62 * v), tb + 0.008, 0.12)
        if hattar:
            add(mus, hatt(0.13 * v), tb, -0.3); add(mus, hatt(0.2 * v), tb + B / 2 + SVANG, 0.3)
            if b % 2: add(mus, hatt(0.07 * v, 0.03), tb + 3 * B / 4 + SVANG, -0.2)


def takt(nr, par, upp=0, v=1.0, slag=(0, 1, 2, 3), hattar=True):
    t0 = (nr - 1) * 4 * B
    trumtakt(t0, slag, v, hattar)
    for h, ac in enumerate(par):
        if not any(b in slag for b in (2 * h, 2 * h + 1)): continue
        ta = t0 + h * 2 * B
        ackord(ac, ta + 0.02, 2 * B + 0.5, v, upp)
        ackord(ac, ta + B + B / 2 + SVANG, 0.5, 0.45 * v, upp, 0.006)      # litet eko på och-slaget
        r = ac[1] + upp
        add(mus, bas(r, B * 1.25, 0.4 * v), ta); add(mus, bas(r, B * 0.4, 0.28 * v), ta + B + B / 2 + SVANG)
        add(mus, bas(r + (7 if h == 0 else 12), B * 0.3, 0.2 * v), ta + B + 3 * B / 4 + SVANG)


for nr in (1, 3, 5): takt(nr, TAKT_A)
for nr in (2, 4, 6): takt(nr, TAKT_B)
# takt 7: fönstret byter utseende på slag 27 (20,25 s). Där går musiken upp en ton, ett slag före takten.
t7 = 6 * 4 * B; t27 = 27 * B
trumtakt(t7, (0, 1, 2))
ackord(FA, t7 + 0.02, 2 * B + 0.5); ackord(FA, t7 + B + B / 2 + SVANG, 0.5, 0.45, 0, 0.006)
add(mus, bas(FA[1], B * 1.25, 0.5), t7); add(mus, bas(FA[1], B * 0.4, 0.34), t7 + B + B / 2 + SVANG)
ackord(E7, t7 + 2 * B + 0.02, B * 0.95); add(mus, bas(E7[1], B * 0.9, 0.5), t7 + 2 * B)
add(mus, kantslag(0.5), t27 + 0.008, 0.12); add(mus, hatt(0.13), t27, -0.3)
ackord(AM, t27, B + 2 * B + 0.5, 1.15, 2); add(mus, bas(AM[1] + 2, B * 1.1, 0.55), t27)
takt(8, TAKT_B, 2, slag=(0, 1, 2, 3))
takt(9, TAKT_A, 2)
takt(10, TAKT_B, 2)
# vispade pappersåttondelar hela vägen (brus som låter som papper)
for k in range(int(30.0 / (B / 2))):
    add(mus, bp(rng.standard_normal(int(0.09 * SR)), 1800, 5200) * np.exp(-tt(0.09) * 38) * 0.045, k * B / 2 + (SVANG if k % 2 else 0), 0.5 if k % 2 else -0.5)

# de fem utseendena: en ton högre varje gång (A C D E G), och elpianot spelar dem igen när de bläddras förbi
MEL = [69, 72, 74, 76, 79]
LK = [7.5, 9.0, 10.5, 12.0, 13.5]
for k, (t0, m) in enumerate(zip(LK, MEL)):
    add(mus, elpiano(m + 12, 1.3, 0.2), t0 + 0.01, 0.25); add(mus, elpiano(m, 1.0, 0.12), t0 + 0.01, -0.2)
BLADDRA = [(15.72, 1), (15.86, 2), (15.99, 4), (16.12, 3), (16.26, 5)]   # samma ordning som i index.html
for k, (t0, nr) in enumerate(BLADDRA):
    add(mus, elpiano(MEL[nr - 1] + 12, 0.7 if k < 4 else 1.4, 0.2 + 0.015 * k), t0, -0.3 + 0.15 * k)

# 29,25 till 30,65: musiken bromsar som ett band som stannar
n0, T = int(29.25 * SR), 1.4
nT = int(T * SR); tau = np.arange(nT) / SR
lage = n0 + np.cumsum((1 - tau / T) ** 1.5) * 1.0                       # var i originalet vi läser
bromsad = np.stack([np.interp(lage, np.arange(N), mus[:, c]) for c in (0, 1)], 1) * (np.minimum(1, (T - tau) / 0.25) ** 0.7)[:, None]
mus[n0:int(31.5 * SR)] = 0
mus[n0:n0 + nT] += bromsad

# 30,9 till 31,5: ny sats (ett svep uppåt och två mjuka slag), 31,5: gorillan landar, bandet spelar vidare i grundtonarten
add(mus, svep(0.62, 0.22, True, 300, 3000), 30.86)
add(mus, kagge(0.4), 31.5 - B / 2); add(mus, kagge(0.5), 31.5 - B / 4); add(mus, hatt(0.14), 31.5 - B / 8)
t42 = 42 * B                                                              # 31,5 s: slag 3 i takt 11
trumtakt(30.0, slag=(2, 3), v=0.8, hattar=False)
for h, ac in enumerate(TAKT_A):                                            # F och E7, ett slag var
    ta = t42 + h * B
    ackord(ac, ta + 0.02, B + 0.6, 1.05 if h == 0 else 0.85)
    add(mus, bas(ac[1], B * 0.9, 0.5), ta)
takt(12, TAKT_B, v=0.82, hattar=True)
for k in range(int(4.5 / (B / 2))):
    add(mus, bp(rng.standard_normal(int(0.09 * SR)), 1800, 5200) * np.exp(-tt(0.09) * 38) * 0.04, 31.5 + k * B / 2 + (SVANG if k % 2 else 0), 0.5 if k % 2 else -0.5)
for k, m in enumerate([76, 79, 84]): add(mus, elpiano(m, 1.6, 0.11), t42 + 0.02 + k * 0.07, 0.3)     # liten glans på slutkortet

# musiken görs dammig: svaj, mjuk topp, lite mättnad
fas = np.arange(N) + 26.0 * np.sin(2 * np.pi * (16 / DUR) * np.arange(N) / SR) + 5.0 * np.sin(2 * np.pi * (201 / DUR) * np.arange(N) / SR)   # hela varv på 36 s: ingen skarv
mus = np.stack([np.interp(fas, np.arange(N), mus[:, c], period=N) for c in (0, 1)], 1)
mus = np.stack([lp(mus[:, c], 7200) for c in (0, 1)], 1)
mus = np.tanh(mus * 1.25) / 1.25
# pappersbrus under allt (håller också slutkortet och pausen vid smällen vid liv)
brus = bp(rng.standard_normal(N + 2000), 900, 5200)[1000:1000 + N] * 0.0075
spr = (rng.random(N) > 0.99965) * rng.uniform(0.2, 1.0, N)                 # små knäpp
knapp = np.convolve(spr, np.exp(-np.arange(90) / 14.0), mode="same") * 0.05
for c in (0, 1): mus[:, c] += brus * (1.0 if c == 0 else 0.92) + np.roll(knapp, c * 180)

# ---------- effekter på animationens tider ----------
# 0: omslaget sveper upp (flaxet börjar 35,6 och går över skarven), gorillan landar 0,375
add(fx, knack(0.35), 35.6); add(fx, flax(0.62, 0.5, True), 35.6, -0.2)
add(fx, duns(0.5, 0.45), 0.375, 0.35)
# blad 1
add(fx, svep(0.6, 0.22, False, 500, 3200), 2.25)                       # kameran ner till räknaren
add(fx, rasp(0.55, 0.34), 3.0, -0.05)                                   # ringen runt 47
add(fx, pop(0.35, 660), 3.58, 0.35)                                     # ögonbrynen upp
add(fx, rasp(0.36, 0.3), 3.75, 0.25); add(fx, rasp(0.4, 0.26), 4.3, 0.1)   # handskriften och pilen
add(fx, svep(0.5, 0.18, True, 500, 3200), 6.0)
# vecken: knack i ramen, flax, duns när bladet ligger plant
for k, t0 in enumerate([6.75, 16.5, 24.0]):
    add(fx, svep(0.3, 0.12, True, 700, 3600), t0 - 0.3, 0.45); add(fx, fjader(0.16), t0 + 0.04, 0.3)
    add(fx, knack(0.55), t0, 0.4); add(fx, flax(0.5, 0.55, True, 20 + 3 * k), t0 + 0.02, 0.1 * (k - 1)); add(fx, duns(0.55, 0.5), t0 + 0.5, 0.2)
# blad 2: flick, pop och pennrasp för varje utseende
for k, t0 in enumerate(LK):
    if k: add(fx, flick(0.5), t0 - 0.01, (k % 2 - 0.5) * 0.5)
    add(fx, pop(0.36, mtof(MEL[k])), t0 + 0.01, (k % 2 - 0.5) * 0.4)
    add(fx, rasp(0.36, 0.2), t0 + 0.06, -0.2 + 0.1 * k)
add(fx, rasp(0.4, 0.3), 15.2, -0.3)
for k, (t0, nr) in enumerate(BLADDRA): add(fx, flick(0.34), t0 - 0.01, -0.4 + 0.2 * k)
# blad 3: Falk-remsan poppar in, ett tangenttick per ord, skickat, och dunsen när fönstret byter utseende
add(fx, flick(0.42), 17.6, -0.25); add(fx, pop(0.26, 620), 17.63, -0.25)
for k in range(7): add(fx, tick(0.2, 2100 + 130 * ((k * 3) % 5)), 18.0 + k * 0.2, -0.35 + 0.05 * k)
add(fx, svep(0.22, 0.26, True, 700, 4200), 19.5, -0.3); add(fx, pop(0.3, 780), 19.7, -0.3)
add(fx, duns(0.6, 0.5), 20.25, -0.1); add(fx, flick(0.4), 20.25)
add(fx, rasp(0.5, 0.32), 21.0, -0.1); add(fx, rasp(0.4, 0.28), 21.5, 0.2)
# blad 4
add(fx, svep(0.45, 0.18, False, 500, 3200), 25.0)
add(fx, rasp(0.6, 0.34), 25.5, -0.25)
add(fx, pop(0.3, 700), 26.12, 0.35)
add(fx, rasp(0.42, 0.3), 26.3, -0.1); add(fx, rasp(0.22, 0.26), 26.72, -0.3)   # strecken under they know you can see the och history.
add(fx, svep(0.5, 0.16, True, 500, 3200), 27.1)
# ihopvikningen: avstamp, fyra flax som går allt fortare, och smällen när omslaget slår igen
add(fx, knack(0.3), 29.25, 0.4)
for k, (t0, d) in enumerate([(29.25, 0.52), (29.77, 0.21), (29.98, 0.17), (30.15, 0.58)]):
    add(fx, flax(d, 0.5 + 0.06 * k, False, 22 + 6 * k), t0, 0.3 - 0.2 * k)
add(fx, small(0.95), 30.75)
# gorillan landar på omslaget
add(fx, svep(0.2, 0.2, False, 600, 3000), 31.3, -0.5); add(fx, duns(0.8, 0.7), 31.5, -0.4); add(fx, pop(0.25, 392), 31.52, -0.4)

# ---------- master ----------
mix = mus * 0.92 + fx
# kort rum, räknat runt hörnet så att efterklangen från slutet hamnar i början
ir = rng.standard_normal(int(0.7 * SR)) * np.exp(-np.arange(int(0.7 * SR)) / (0.15 * SR)) * 0.011
mono = mix[:, 0] + mix[:, 1]
rum = np.fft.irfft(np.fft.rfft(mono) * np.fft.rfft(ir, N), N)
mix += lp(rum, 4500)[:, None] * 0.5
mix = np.tanh(mix * 1.35) / np.tanh(1.35)
mix /= np.max(np.abs(mix)) / 0.89
ut = Path(__file__).resolve().parent.parent / "assets" / "score.wav"
with wave.open(str(ut), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("ok", DUR, "s", ut)
