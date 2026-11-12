"""Musik och ljudeffekter till sajtvideon "hungrig" (32,0 s, 105 slag per minut med sving, F-dur, 14 takter).
Allt syntas här med numpy och scipy: inget lånat ljud. Effekterna ligger på samma bildrutor som rörelserna i index.html.
Musiken går runt: sista takten vänder tillbaka till första, och efterklangen som går förbi slutet viks in över början.

  /home/mint/adraze-reels/venv/bin/python audio/score.py      (skriver assets/score.wav)
"""
import numpy as np, wave
from scipy.signal import butter, sosfilt, lfilter, fftconvolve

SR = 48000; DUR = 32.0; N = int(SR * DUR); TAIL = 3.0; NT = int(SR * (DUR + TAIL))
BPM = 105.0; B = 60 / BPM; SW = 0.64                       # svingad åttondel ligger 64 % in i slaget
rng = np.random.default_rng(11)
L = np.zeros(NT); R = np.zeros(NT)

def bt(k): return k * B                                    # slag → sekunder
def fr(n): return n / 30.0                                 # bildruta → sekunder
def add(sig, start, pan=0.0, gain=1.0):
    if start < 0: start += DUR                             # hör till förra varvet: läggs i slutet och viks in över början, så att skarven inte klickar
    i = int(round(start * SR))
    if i >= NT or i + len(sig) <= 0: return
    if i < 0: sig = sig[-i:]; i = 0
    j = min(NT, i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def noise(n): return rng.standard_normal(n)
def hp(x, f): return sosfilt(butter(2, f, "hp", fs=SR, output="sos"), x)
def lp(x, f): return sosfilt(butter(2, f, "lp", fs=SR, output="sos"), x)
def bp(x, a, b): return sosfilt(butter(2, [a, b], "bp", fs=SR, output="sos"), x)
def sweepbp(x, fc, q=4.0, blk=128):                        # bandpass med svepande mittfrekvens (wah), block för block
    out = np.zeros(len(x)); zi = np.zeros(2)
    for i in range(0, len(x), blk):
        f = float(np.clip(fc[min(i, len(fc) - 1)], 60, 16000)); w0 = 2 * np.pi * f / SR; al = np.sin(w0) / (2 * q)
        b = np.array([al, 0.0, -al]) / (1 + al); a = np.array([1.0, -2 * np.cos(w0) / (1 + al), (1 - al) / (1 + al)])
        out[i:i + blk], zi = lfilter(b, a, x[i:i + blk], zi=zi)
    return out

# ---------------------------------------------------------------- bandet
def bass(m, d, v=1.0, pizz=False):                         # kontrabas: sinus med övertoner, knäpp i ansatsen
    t = tt(d); ph = 2 * np.pi * mtof(m) * t + 0.5 * np.exp(-t * 45)
    s = 0.75 * np.sin(ph) + 0.62 * np.sin(2 * ph) * np.exp(-t * 2.6) + 0.4 * np.sin(3 * ph) * np.exp(-t * 4) + 0.24 * np.sin(4 * ph) * np.exp(-t * 6) + 0.13 * np.sin(5 * ph) * np.exp(-t * 8) + 0.07 * np.sin(6 * ph) * np.exp(-t * 10)   # övertonerna bär basen i små högtalare
    e = (1 - np.exp(-t * 450)) * np.exp(-t * (9.0 if pizz else 2.4)) * np.minimum(1, (d - t) / 0.04)
    return (s * e + lp(noise(len(t)), 1100) * np.exp(-t * 140) * 0.35) * v
def swish(d=0.3, v=1.0):                                   # visp som dras över skinnet
    t = tt(d); return bp(noise(len(t)), 1700, 7500) * np.sin(np.pi * np.minimum(1, t / d)) ** 1.6 * v
def tap(v=1.0):                                            # vispslag
    t = tt(0.17); return (bp(noise(len(t)), 900, 5200) * np.exp(-t * 36) + 0.45 * np.sin(2 * np.pi * 188 * t) * np.exp(-t * 48)) * v
def ride(v=1.0):
    t = tt(0.55); s = sum(a * np.sin(2 * np.pi * f * t + p) for f, a, p in ((3140, 1, 0), (4370, .8, 1), (5630, .7, 2), (7110, .6, 3), (8930, .45, 4), (10210, .3, 5)))
    return (s * np.exp(-t * 6.5) * 0.22 + hp(noise(len(t)), 6500) * np.exp(-t * 34) * 0.5) * (1 - np.exp(-t * 2500)) * v
def hatfoot(v=1.0):
    t = tt(0.07); return hp(noise(len(t)), 7000) * np.exp(-t * 75) * v
def kick(v=1.0):
    t = tt(0.3); return np.sin(2 * np.pi * np.cumsum(50 + 70 * np.exp(-t * 36)) / SR) * np.exp(-t * 11) * v
def rhodes(m, d, v=1.0):                                   # mjukt elpiano (FM)
    t = tt(d); f = mtof(m); mod = np.sin(2 * np.pi * f * t) * (1.5 * np.exp(-t * 7) + 0.22)
    s = np.sin(2 * np.pi * f * t + mod) + 0.22 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t * 50)
    return s * (1 - np.exp(-t * 380)) * np.exp(-t * 2.3) * np.minimum(1, (d - t) / 0.05) * v
def chord(ms, start, d, v=1.0, pan=0.0):
    for k, m in enumerate(ms): add(rhodes(m, d, v / len(ms) ** .5), start + k * 0.006, pan + (k - 1.5) * .12)
def saw(f):                                                # sågtand med begränsad bandbredd
    ph = 2 * np.pi * np.cumsum(f) / SR; s = np.zeros(len(ph)); k = 1
    while k * float(np.max(f)) < 9000: s += np.sin(k * ph) / k; k += 1
    return s
def trumpet(m, d, v=1.0, bend=0.0, wah=(550, 1700, 900), vib=0.0):   # dämpad trumpet som säger wah
    t = tt(d); p = t / d
    f = mtof(m) * 2 ** (bend * p ** 1.6 / 12) * (1 + vib * 0.012 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - .12) / .2, 0, 1))
    x = saw(f); fc = np.where(p < .35, wah[0] + (wah[1] - wah[0]) * (p / .35), wah[1] + (wah[2] - wah[1]) * ((p - .35) / .65))
    y = sweepbp(x, fc, 4.2) * 2.4 + 0.22 * bp(x, 1500, 3300)
    return y * (1 - np.exp(-t * 110)) * np.minimum(1, (d - t) / 0.05) * (0.78 + 0.22 * np.exp(-t * 6)) * v
def pluck(m, d=0.3, v=1.0):                                # träig knäpp (nyp, tass)
    t = tt(d); f = mtof(m)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 34) + 0.15 * np.sin(2 * np.pi * 9.2 * f * t) * np.exp(-t * 70)) * (1 - np.exp(-t * 900)) * np.exp(-t * 11) * v

# ---------------------------------------------------------------- effekter
def pop(v=1.0, f0=520):
    t = tt(0.12); return np.sin(2 * np.pi * np.cumsum(f0 * (1 + 1.6 * np.exp(-t * 60))) / SR) * np.exp(-t * 35) * v
def thud(v=1.0, f=72):
    t = tt(0.4); return (np.sin(2 * np.pi * np.cumsum(f * (1 + 1.3 * np.exp(-t * 38))) / SR) * np.exp(-t * 11) + 0.4 * lp(noise(len(t)), 600) * np.exp(-t * 26)) * v
def boom(v=1.0):
    t = tt(0.9); return (np.sin(2 * np.pi * np.cumsum(40 + 62 * np.exp(-t * 14)) / SR) * np.exp(-t * 4.2) + 0.25 * lp(noise(len(t)), 650) * np.exp(-t * 9)) * v
def click(v=1.0):
    t = tt(0.035); return (np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 210) + 0.6 * hp(noise(len(t)), 3000) * np.exp(-t * 420)) * v
def tick(v=1.0, f=2600):
    t = tt(0.03); return np.sin(2 * np.pi * f * t) * np.exp(-t * 200) * v
def pip(v=1.0, f=1800):
    t = tt(0.09); return np.sin(2 * np.pi * np.cumsum(f * (1 + .25 * t / .09)) / SR) * np.exp(-t * 30) * (1 - np.exp(-t * 900)) * v
def crunch(v=1.0):                                         # knaprigt bett: korn av brus och en duns
    t = tt(0.24); x = np.zeros(len(t))
    for k in range(10):
        i0 = int((0.003 + k * 0.015 + rng.uniform(0, .006)) * SR); g = tt(0.022)
        x[i0:i0 + len(g)] += bp(noise(len(g)), 1100, 7200) * np.exp(-g * 240) * (1 - k / 12)
    return (x + 0.85 * np.sin(2 * np.pi * np.cumsum(105 * (1 + .9 * np.exp(-t * 48))) / SR) * np.exp(-t * 22)) * v
def slurp(d=0.2, v=1.0):
    t = tt(d); p = t / d
    return (sweepbp(noise(len(t)), 500 + 2700 * p ** 1.5, 3.5) * 3 + 0.3 * np.sin(2 * np.pi * np.cumsum(260 + 720 * p ** 2) / SR)) * np.sin(np.pi * np.minimum(1, p)) ** .7 * v
def gulp(v=1.0):                                           # svälj: tonen faller och studsar upp
    t = tt(0.26); f = np.maximum(np.where(t < .09, 330 - 2000 * t, 150 + 950 * (t - .09)), 85)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * (np.exp(-((t - .05) / .045) ** 2) + .85 * np.exp(-((t - .155) / .04) ** 2)) * v
def rumble(d=1.0, v=1.0):                                  # magkurr
    t = tt(d); am = 0.55 + 0.45 * np.sin(2 * np.pi * (9 + 6 * np.sin(2 * np.pi * 1.3 * t)) * t)
    tone = np.sin(2 * np.pi * np.cumsum(72 + 26 * np.sin(2 * np.pi * 3.1 * t) + 34 * t / d) / SR)
    return (hp(lp(noise(len(t)), 240), 45) * 4 * am + (0.7 * tone + 0.3 * np.sin(2 * np.pi * np.cumsum(150 + 50 * np.sin(2 * np.pi * 2.3 * t)) / SR)) * am) * np.sin(np.pi * np.minimum(1, t / d)) ** .8 * v
def whoosh(d=0.35, v=1.0, up=True, peak=0.5):              # svep. peak = var i tiden det är som starkast
    t = tt(d); p = t / d; fc = 400 + 4200 * (p if up else 1 - p)
    e = np.where(p < peak, (p / peak) ** 2, ((1 - p) / (1 - peak)) ** 2)
    return sweepbp(noise(len(t)), fc, 1.4) * 2.2 * e * v
def scratch(d, v=1.0):                                     # penna mot papper
    t = tt(d); return bp(noise(len(t)), 2500, 9000) * (0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 7 * t + 3 * np.sin(2 * np.pi * 1.3 * t)))) * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.05) * v
def paperroll(d, v=1.0):                                   # papper som rullas ihop
    t = tt(d); p = t / d
    return sweepbp(noise(len(t)), 900 + 2600 * p, 1.6) * 2 * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * (14 + 22 * p) * t))) * np.minimum(1, t / .03) * np.minimum(1, (d - t) / .04) * v
def rip(d, v=1.0):                                         # något klistrat som rivs loss
    t = tt(d); p = t / d
    return hp(noise(len(t)), 1400) * (0.35 + 0.65 * (np.sin(2 * np.pi * np.cumsum(95 - 55 * p) / SR) > 0)) * (0.3 + 0.7 * p) * np.minimum(1, t / .01) * np.minimum(1, (d - t) / .015) * v
def suck(d, v=1.0):                                        # insuget
    t = tt(d); p = t / d
    tone = sum(np.sin(2 * np.pi * np.cumsum(170 * k * 2 ** (2.3 * p)) / SR) / k for k in (1, 1.5, 2)) * 0.22
    return (sweepbp(noise(len(t)), 280 + 3400 * p ** 2, 2.0) * 3 + tone) * (0.12 + 0.88 * p ** 1.6) * np.minimum(1, t / .05) * np.minimum(1, (d - t) / .012) * v
def woodblock(v=1.0):
    t = tt(0.14); return (np.sin(2 * np.pi * 1150 * t) + 0.5 * np.sin(2 * np.pi * 1730 * t)) * np.exp(-t * 52) * (1 - np.exp(-t * 3000)) * v
def blip(f, d=0.07, v=1.0):                                # gäll liten fyrkantston: skräpets ljud
    t = tt(d); return hp(np.sign(np.sin(2 * np.pi * f * t)), 700) * np.exp(-t * 22) * (1 - np.exp(-t * 900)) * v
def hic(v=1.0):                                            # hicka i sömnen: kort tjut uppåt med ett klick i halsen
    t = tt(0.13); f = 380 + 900 * np.minimum(1, t / .05)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 36) * (1 - np.exp(-t * 2000)) + 0.5 * bp(noise(len(t)), 1500, 5000) * np.exp(-t * 160)) * v
def bell(f, d=0.5, v=1.0):
    t = tt(d); return np.sin(2 * np.pi * f * t + 2.2 * np.sin(2 * np.pi * f * 3.5 * t) * np.exp(-t * 9)) * np.exp(-t * 7) * (1 - np.exp(-t * 900)) * v

# ================================================================ musiken
F6, Dm7, Gm7, C7, D7 = [57, 60, 62, 67], [53, 57, 60, 64], [53, 58, 62, 65], [52, 58, 62, 69], [54, 60, 64, 66]
F7, Bb7, Fmaj, Csus = [51, 57, 62, 67], [56, 62, 65, 67], [57, 60, 64, 67], [53, 58, 60, 65]
#          takt: (ackord slag 1–2, ackord slag 3–4), baslinje (fyra fjärdedelar)
BARS = [((F6, Dm7), [41, 45, 38, 42]), ((Gm7, C7), [43, 46, 48, 40]), ((F6, D7), [41, 45, 50, 44]), ((Gm7, C7), None),
        ((F7, F7), [41, 45, 48, 51]), ((Bb7, Bb7), [46, 50, 53, 54]), ((F7, D7), [53, 51, 50, 54]), ((Gm7, C7), [55, 53, 52, 50]), ((Csus, C7), None),
        ((Fmaj, Dm7), [53, 48, 50, 45]), ((Gm7, C7), [43, 46, 48, 40]), ((C7, C7), None),
        ((F6, Dm7), [41, 45, 50, 44]), ((Gm7, C7), [43, 46, 48, 40])]
GHOST = {3: 42, 7: 40, 19: 47, 23: 54, 27: 54, 31: 49, 39: 44, 43: 40, 51: 44, 55: 40}      # svingad upptakt efter slaget
def band(k):                                               # hur mycket band som spelar på slag k (0 = bara bas)
    if k < 11: return 1.0
    if k < 16: return 0.0
    if k < 33: return 1.0
    if k < 36: return 0.0
    if k < 44: return 0.9
    if k < 48: return 0.0
    return 0.8 if k < 50 else 0.55

for bar, (chs, line) in enumerate(BARS):
    for q in range(4):
        k = bar * 4 + q; t0 = bt(k); g = band(k)
        if line is not None:
            add(bass(line[q], B * 0.92, 0.5), t0, -0.05)
            if k in GHOST: add(bass(GHOST[k], B * 0.3, 0.3), t0 + B * SW, -0.05)
        if g > 0:
            add(swish(0.3, 0.27 * g), t0 - 0.03, 0.35 if q % 2 else -0.35)
            add(ride(0.6 * g * (1.0 if q % 2 else 0.8)), t0, 0.3)
            if q % 2: add(ride(0.36 * g), t0 + B * SW, 0.3); add(tap(0.36 * g), t0, -0.15); add(hatfoot(0.2 * g), t0, 0.1)
            else: add(kick(0.22 * g), t0, 0)
            nxt = BARS[(bar + 1) % len(BARS)][0][0]
            if q == 0: chord(chs[0], t0, B * 1.25, 0.32 * g, -0.2)                       # på ettan
            if q == 1: chord(chs[1], t0 + B * SW, B * 0.95, 0.27 * g, -0.2)             # föregriper nästa ackord
            if q == 3 and band(k + 1) > 0: chord(nxt, t0 + B * SW, B * 0.5, 0.2 * g, -0.2)
# takt 4 (slag 11–15): bara bas, hängande toner, upptakt in i svänget
add(bass(43, B * 1.9, 0.6), bt(12), -0.05); add(bass(36, B * 1.0, 0.62), bt(14), -0.05); add(bass(48, B * .6, 0.5), bt(15), -0.05); add(bass(52, B * .34, 0.5), bt(15) + B * SW, -0.05)
# takt 9 (slag 32–35): två slag, sedan stiger basen under insuget, tystnad, svälj
add(bass(48, B * 0.9, 0.66), bt(32), -0.05); add(bass(48, B * 0.5, 0.6), bt(33), -0.05)
for i, m in enumerate([48, 49, 50, 51, 52, 53, 54, 55]): add(bass(m, 0.11, 0.3 + 0.045 * i, pizz=True), fr(570) + i * 0.105, -0.05)
add(bass(52, B * .34, 0.5), bt(35) + B * SW, -0.05)
# takt 12 (slag 44–47): lappen tassar, bara pizzicato
for i, (f, m) in enumerate([(754, 48), (763, 49), (771, 50), (780, 51)]):
    add(bass(m, 0.2, 0.55, pizz=True), fr(f), -0.05); add(pluck(m + 36, 0.12, 0.12), fr(f), 0.4)
add(bass(52, 0.14, 0.3, pizz=True), fr(789), -0.05)
def tremolo(m, d, v=1.0):                                  # stråke som darrar: håller andan utan att tystna
    t = tt(d); f = mtof(m); s = sum(np.sin(2 * np.pi * f * k * t) / k for k in (1, 2, 3, 4, 5))
    return s * (0.55 + 0.45 * np.sin(2 * np.pi * 11 * t)) * (0.25 + 0.75 * (t / d) ** 1.5) * np.minimum(1, t / .08) * np.minimum(1, (d - t) / .03) * v
add(tremolo(48, fr(806) - fr(781), 0.34), fr(781), 0.0); add(tremolo(55, fr(806) - fr(781), 0.2), fr(781), 0.2)
add(bass(41, B * .9, 0.6), bt(47), -0.05); add(bass(40, B * .3, 0.4), bt(47) + B * SW, -0.05)

# trumpeten
add(trumpet(72, 0.17, 0.3, 0, (500, 1500, 800)), fr(223), 0.15); add(trumpet(72, 0.5, 0.34, 3.0, (500, 1900, 1500), vib=1), fr(223) + 0.24, 0.15)    # 7,43: frågan
for f, m in ((291, 69), (309, 72), (326, 75)): add(trumpet(m, 0.16, 0.3, 0, (700, 2000, 1200)), fr(f), 0.2); add(trumpet(m - 12, 0.16, 0.2, 0, (400, 1200, 700)), fr(f), -0.2)   # blåsstötar på betten
add(trumpet(77, 0.3, 0.26, -1, (900, 1900, 700)), fr(339), 0.15)                                             # efter sväljet
add(trumpet(68, 0.5, 0.3, -3.0, (1500, 1100, 420), vib=1), fr(360), 0.15)                                    # 12,00: ser på oss utan min
add(trumpet(72, 0.22, 0.26, 1.5, (500, 1700, 1500)), fr(435), 0.15)                                          # 14,50
add(trumpet(70, 0.2, 0.15, 2.0, (480, 1300, 1150)), fr(108), -0.45)                                         # 3,60: gorillan kikar upp, hm?
add(trumpet(60, 0.36, 0.2, 0, (420, 900, 420)), fr(606), 0.1)                                                # 20,2: mätt
MEL = [(36, 69, 1.5), (37 + SW, 72, .36), (38, 74, 1.0), (39, 72, SW), (39 + SW, 69, .36), (40, 70, 1.5), (41 + SW, 69, .36), (42, 67, 1.0), (43, 72, .9)]
for k, m, d in MEL: add(trumpet(m, d * B * .96, 0.33, 0, (650, 1500, 1000), vib=1 if d >= 1 else 0), bt(k), 0.15)
for k, m, d in [(48, 77, .5), (48 + SW, 72, .36), (49, 74, SW), (49 + SW, 72, .36), (50, 69, 1.7)]: add(trumpet(m, d * B * .96, 0.28, 0, (650, 1600, 900), vib=1 if d > 1 else 0), bt(k), 0.15)
# slag på klippen
for k in (16, 20, 24, 28, 36, 48): add(kick(0.5), bt(k)); add(tap(0.34), bt(k), -0.1)

# ================================================================ skräpets slingor: börjar när skräpet landar, tystnar när det äts
def jgain(t):
    if t < fr(189): return 1.0                               # rörigt
    if t < fr(274): return 0.3                               # bara bas: slingorna ligger kvar svagt
    return 0.62
def loop(t0, t1, period, notes, v, pan, fn=blip, d=0.07):
    t = t0
    while t < t1:
        for i, f in enumerate(notes):
            tn = t + i * period / (len(notes) + 1.5)
            if tn < t1: add(fn(f, d, v * jgain(tn)), tn, pan)
        t += period
loop(fr(17), fr(336), 0.54, [1319, 1661, 1976, 1661], 0.05, -0.6)                # skyltarna (tills den sista är uppäten)
loop(fr(103), fr(464), 0.83, [1175, 880], 0.06, 0.55, fn=bell, d=0.3)             # förvideoreklamen (tystnar när duken slurpas)
loop(fr(137), fr(390), 0.71, [932, 932], 0.045, -0.3, d=0.05)                     # kakrutan
loop(fr(154), fr(597), 0.94, [1047, 1175, 1319], 0.045, 0.3)                      # nyhetsbrevet
loop(fr(555), fr(585), 0.2, [1568, 1760], 0.035, 0.6)                             # dess ungar
for i, (f1, per, hz) in enumerate([(514, .33, 2637), (523, .41, 2960), (531, .47, 3322)]): loop(fr(171 + i * 6), fr(f1), per, [hz], 0.03, 0.7 - i * .3, d=0.03)   # tre spårare

# ================================================================ effekter på bildrutan
add(thud(0.7), fr(17)); add(pop(0.5, 400), fr(17), 0.2)                           # SALE! smäller ner
add(click(0.5), fr(51), 0.2); add(pop(0.5, 480), fr(54), -0.4); add(pop(0.5, 620), fr(57), 0.5)   # krysset, två nya
add(boom(0.7), fr(103)); add(thud(0.5, 90), fr(103))                              # förvideoreklamen landar
add(click(0.4), fr(118), 0.2); add(blip(196, 0.09, 0.12), fr(119), 0.2); add(blip(175, 0.12, 0.12), fr(122), 0.2)   # pillen säger nej
add(pop(0.5, 540), fr(120), 0.5)                                                  # DOWNLOAD NOW
add(whoosh(0.2, 0.3, True, .8), fr(131)); add(thud(0.6, 80), fr(137))             # kakrutan
add(pop(0.55, 440), fr(154), 0.0)                                                 # nyhetsbrevet
for i in range(3): add(pip(0.3, 1700 + i * 260), fr(171 + i * 6), 0.5)            # tre spårare hoppar upp
add(rumble(1.0, 0.85), fr(206)); add(thud(0.3, 60), fr(206))                      # magkurr
add(thud(0.5, 85), fr(269)); add(whoosh(0.16, 0.25, True, .7), fr(264))           # stöter till rutan
# rätt 1
add(thud(0.6, 75), fr(279))
for i, f in enumerate((291, 309, 326)): add(crunch(0.75), fr(f), 0.1); add(slurp(0.17, 0.3), fr(f + 5), 0.0)
add(thud(0.3, 110), fr(306), 0.3); add(thud(0.3, 110), fr(324), 0.3); add(gulp(0.5), fr(339))
# rätt 2
add(thud(0.55, 75), fr(348), 0.4); add(pop(0.22, 700), fr(351), -0.4); add(pop(0.22, 760), fr(356), -0.4)
add(scratch(0.2, 0.3), fr(365), 0.3); add(click(0.6), fr(377), 0.3); add(pop(0.3, 1250), fr(377), 0.35)     # pip på nosen
add(thud(0.35, 80), fr(384), 0.4)                                                                          # studsar undan och landar
add(paperroll(0.3, 0.42), fr(386), -0.1); add(slurp(0.15, 0.5), fr(395), 0.4); add(gulp(0.5), fr(405), 0.3)   # rullas ihop, slurp, svälj
# rätt 3
add(whoosh(0.24, 0.3, False, .2), fr(411), 0.5); add(thud(0.4, 78), fr(419), 0.5); add(tick(0.5), fr(429), 0.1); add(pop(0.25, 900), fr(429), 0.1)   # skuttar in och landar
add(crunch(0.5), fr(446), 0.3); add(scratch(0.13, 0.25), fr(446), 0.3); add(rip(0.4, 0.5), fr(452), 0.2); add(whoosh(0.4, 0.3, True, .6), fr(452), 0.2)   # duken dras av
add(slurp(0.14, 0.4), fr(464), 0.4); add(pop(0.3, 600), fr(468), -0.1); add(gulp(0.5), fr(474), 0.4)
# rätt 4
for i in range(13): add(tick(0.12, 2100 + (i % 3) * 200), fr(480) + i * 0.066, 0.4)        # pekaren springer
add(whoosh(0.2, 0.22, True, .7), fr(506), 0.3)
for i, f in enumerate((514, 523, 531)): add(pluck(77 + i * 4, 0.25, 0.42), fr(f), 0.1); add(crunch(0.26), fr(f), 0.1)   # nyp
for f in (519, 527, 538): add(gulp(0.24), fr(f), 0.0)                                         # sväljer en i taget
add(thud(0.4, 76), fr(539), -0.3)                                                          # landar hemma
for i in range(6): add(tick(0.16, 1500 + i * 90), fr(541) + i * 0.045, 0.2)                # pekaren reser sig och ruskar på sig
add(pop(0.3, 700), fr(545), 0.2)
# rätt 5
for i in range(6): add(pop(0.34, 520 + i * 70), fr(555 + i), (i - 2.5) * .25)              # spricker i sex
add(whoosh(0.14, 0.3, False, .3), fr(565), -0.3)                                           # drar huvudet bakåt
add(suck(fr(597) - fr(569), 1.0), fr(569), 0.0)                                            # insuget: filmens största ljud
add(thud(0.75, 95), fr(597)); add(tap(0.4), fr(597))                                       # munnen slår igen. Sedan en åttondels tystnad.
add(gulp(0.95), fr(600)); add(thud(0.4, 60), fr(600))                                      # svälj
# den rena sidan, lappen, slutkortet
add(thud(0.4, 70), fr(621), -0.5); add(click(0.6), fr(669), -0.1); add(pop(0.3, 500), fr(671), -0.1)
add(pluck(84, 0.2, 0.2), fr(703), -0.1); add(pluck(88, 0.2, 0.17), fr(711), -0.1)          # pekaren skuttar av glädje
add(hic(0.32), fr(737), -0.5)                                                               # 24,57: gorillan hickar i sömnen
add(bell(1568, 0.5, 0.1), fr(777), -0.5)                                                    # ena ögat öppnas
add(pip(0.2, 2200), fr(789), 0.5)                                                           # lappen fryser
add(whoosh(0.3, 0.42, True, .85), fr(797), 0.0); add(woodblock(0.8), fr(806), 0.3); add(thud(0.5, 85), fr(806), 0.3)   # 26,87: fångad
add(whoosh(0.5, 0.36, False, .6), fr(807), 0.2)                                             # sidan glider ut
add(thud(0.55, 72), fr(823), -0.4)                                                          # landar på sin plats
for i in range(6): add(pop(0.34, 560 + i * 62), 27.5 + i * .05, -0.1 + i * .08)             # sex bokstäver
add(pop(0.42, 990), 28.0, 0.0); add(tick(0.25, 1900), 28.3, 0.1)                            # knappen, lilla raden
add(tick(0.2, 2400), fr(936), -0.3)                                                         # blicken far åt höger
add(whoosh(1.05, 0.5, True, 0.6 / 1.05), 31.4, 0.0)                                         # överlämningen: svepet fortsätter in i början

# ================================================================ master
mix = np.stack([L, R], 1)
ir = noise(int(0.9 * SR)) * np.exp(-np.arange(int(0.9 * SR)) / (0.17 * SR)) * 0.011
rev = fftconvolve(mix[:, 0] + mix[:, 1], ir)[:NT]
mix += rev[:, None] * 0.5
out = mix[:N].copy(); out[: NT - N] += mix[N:]              # det som klingar förbi slutet viks in över början
pre = np.abs(out); print(f"före begränsning: topp {pre.max():.2f}, 99,9 % under {np.quantile(pre, .999):.2f}, 99 % under {np.quantile(pre, .99):.2f}")
out = np.tanh(out * 0.62 * 1.35) / np.tanh(1.35)
out /= np.max(np.abs(out)) / 0.89
# 8 ms mjuk in- och uttoning i filens kanter: ljudkodaren (AAC) får inte börja eller sluta mitt i ett starkt svep,
# annars slår den över med flera dB i första bildrutan. Sajtens loop hoppar ändå några ms i skarven, så det hörs inte.
nf = int(0.008 * SR); rmp = 0.5 - 0.5 * np.cos(np.pi * np.arange(nf) / nf)
out[:nf] *= rmp[:, None]; out[-nf:] *= rmp[::-1][:, None]
with wave.open("assets/score.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
# nivå per sekund, så att hål syns direkt
rms = [20 * np.log10(np.sqrt(np.mean(out[i * SR:(i + 1) * SR] ** 2)) + 1e-9) for i in range(int(DUR))]
print("ok", DUR, "s. RMS per sekund (dB):"); print(" ".join(f"{v:.0f}" for v in rms))
