"""Gör kontaktark av ögonblicksbilder: python3 verktyg/ark.py <mapp> [kolumner=3] [bredd=640]
Läser frame-*.png (hyperframes snapshot) eller ruta-*.png, sorterar på tid och skriver ark-N.jpg i samma mapp."""
import sys, re, glob, os
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 3; w = int(sys.argv[3]) if len(sys.argv) > 3 else 640
files = glob.glob(os.path.join(d, '*.png'))
def tid(f):
    m = re.search(r'at-([\d.]+)s', f) or re.search(r'ruta-([\d.]+)', f); return float(m.group(1)) if m else 0
files.sort(key=tid)
h = round(w * 9 / 16); per = cols * cols
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
for n in range(0, len(files), per):
    sheet = Image.new('RGB', (cols * w, cols * h), (20, 20, 20))
    for k, f in enumerate(files[n:n + per]):
        im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS); x, y = (k % cols) * w, (k // cols) * h
        sheet.paste(im, (x, y)); dr = ImageDraw.Draw(sheet); dr.rectangle([x, y, x + 96, y + 28], fill=(0, 0, 0)); dr.text((x + 5, y + 2), f'{tid(f):.2f}', fill=(255, 220, 0), font=font)
    out = os.path.join(d, f'ark-{n // per + 1}.jpg'); sheet.save(out, quality=86); print(out)
