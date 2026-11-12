#!/usr/bin/env python3
"""Lägger bildrutor på ett ark. python3 tools/ark.py <ut.jpg> <cellbredd> <kolumner> <ruta1.png> ..."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
ut, cw, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); files = sys.argv[4:]
ch = round(cw * 1080 / 1920); rows = (len(files) + cols - 1) // cols
ark = Image.new('RGB', (cols * cw, rows * (ch + 22)), (30, 28, 26))
d = ImageDraw.Draw(ark)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except Exception: font = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((cw, ch), Image.LANCZOS)
    x, y = (i % cols) * cw, (i // cols) * (ch + 22)
    ark.paste(im, (x, y + 22)); d.text((x + 6, y + 3), os.path.basename(f).replace('ruta-', '').replace('.png', ' s'), fill=(255, 210, 62), font=font)
ark.save(ut, quality=88); print(ut, ark.size)
