#!/usr/bin/env python3
"""Rutnät för liggande video (titta.py gör rutor för stående, där blir våra bilder 270 px breda).

  python3 verktyg/rutnat.py <video> <tider eller start:slut:steg> [kolumner=4] [rutbredd=640]

Skriver <video utan ändelse>.liggande-N.jpg med 12 rutor per ark (4 x 3) och tidsstämpel i varje ruta."""
import subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]).resolve()
spec = sys.argv[2]
kol = int(sys.argv[3]) if len(sys.argv) > 3 else 4
bredd = int(sys.argv[4]) if len(sys.argv) > 4 else 640
if ':' in spec:
    a, b, s = (float(x) for x in spec.split(':'))
    tider = [round(a + i * s, 3) for i in range(int(round((b - a) / s)) + 1)]
else:
    tider = [float(x) for x in spec.split(',')]
rader = 3
per = kol * rader
hojd = bredd * 9 // 16
namn = sys.argv[5] if len(sys.argv) > 5 else 'liggande'
for ark in range(0, len(tider), per):
    del_ = tider[ark:ark + per]
    inp, filt = [], []
    for j, t in enumerate(del_):
        inp += ['-ss', f'{t:.3f}', '-i', str(src)]
        filt.append(f"[{j}:v]scale={bredd}:{hojd},drawtext=text='{t:.2f}s':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.7[v{j}]")
    while len(filt) < per:
        j = len(filt); filt.append(f'color=black:s={bredd}x{hojd}:d=1[v{j}]')
    lay = '|'.join(f'{(k % kol) * bredd}_{(k // kol) * hojd}' for k in range(per))
    filt.append(''.join(f'[v{k}]' for k in range(per)) + f'xstack=inputs={per}:layout={lay}:fill=black[ut]')
    ut = f'{src.with_suffix("")}.{namn}-{ark // per + 1}.jpg'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *inp, '-filter_complex', ';'.join(filt), '-map', '[ut]', '-frames:v', '1', '-q:v', '3', ut], check=True)
    print(ut)
