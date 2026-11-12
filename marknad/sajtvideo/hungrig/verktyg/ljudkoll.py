"""Mäter ljudspåret utan att lyssna: energi per frekvensband och nivå per kvartssekund (hål syns direkt).
  /home/mint/adraze-reels/venv/bin/python verktyg/ljudkoll.py [assets/score.wav]"""
import sys, numpy as np, wave
from scipy.signal import butter, sosfilt
p = sys.argv[1] if len(sys.argv) > 1 else 'assets/score.wav'
w = wave.open(p); n = w.getnframes(); SR = w.getframerate(); x = np.frombuffer(w.readframes(n), np.int16).reshape(-1, 2).astype(float) / 32768; m = x.mean(1)
for lo, hi in [(30, 150), (150, 400), (400, 1200), (1200, 4000), (4000, 12000)]:
    y = sosfilt(butter(4, [lo, hi], 'bp', fs=SR, output='sos'), m); print(f'{lo:5d}-{hi:5d} Hz: {10 * np.log10(np.mean(y ** 2) + 1e-12):6.1f} dB')
q = SR // 4; r = [20 * np.log10(np.sqrt(np.mean(m[i:i + q] ** 2)) + 1e-9) for i in range(0, len(m) - q + 1, q)]
print(f'lägsta kvartssekund {min(r):.1f} dB vid {r.index(min(r)) * .25:.2f} s, högsta {max(r):.1f} dB vid {r.index(max(r)) * .25:.2f} s, topp {np.abs(x).max():.2f}')
print(' '.join(f'{v:.0f}' for v in r))
print('skarven: sista 10 ms', f'{20 * np.log10(np.sqrt(np.mean(m[-480:] ** 2)) + 1e-9):.1f} dB, första 10 ms {20 * np.log10(np.sqrt(np.mean(m[:480] ** 2)) + 1e-9):.1f} dB, hopp {abs(m[0] - m[-1]):.3f}')
