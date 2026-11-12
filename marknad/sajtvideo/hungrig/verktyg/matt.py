"""Mäter textbredder med de riktiga typsnitten (PIL + raqm), så att lappar och skyltar får rätt mått utan mätning i webbläsaren."""
from PIL import ImageFont
F = 'assets/fonts/'
def news(size, italic=False):
    f = ImageFont.truetype(F + ('Newsreader-Italic.ttf' if italic else 'Newsreader.ttf'), size)
    f.set_variation_by_axes([500, min(72, size)])
    return f
def w(font, text, size, ls):
    return font.getlength(text) + ls * size * len(text)
caps = [('You came for ', 'one video.'), ('It came with ', 'extras.'), ("Someone's ", 'hungry.'), ('Banner ads: ', 'eaten.'), ('Cookie banner: ', 'rejected.'),
        ('Video ad: ', 'skipped.'), ('Trackers: ', 'picked off.'), ('Popups: ', 'gone.'), ('Same page. ', 'Minus the junk.')]
for size in (104, 96):
    r, i = news(size), news(size, True)
    print('--- News', size)
    for a, b in caps:
        print(f'{w(r, a, size, -.02) + w(i, b, size, -.02):7.1f}  {a}{b}')
def inter(name, size): return ImageFont.truetype(F + name, size)
print('--- InterK')
for txt, size in [('SALE!', 104), ('ONLY 2 LEFT', 68), ('SPIN TO WIN', 68), ('DOWNLOAD NOW', 66), ('ACCEPT ALL', 62), ("WAIT! DON'T GO!", 60), ('OK', 44), ('Ad', 40),
                  ('NO WAIT!', 60), ('PLEASE!', 60), ('LAST CHANCE', 60), ('RATE US', 60), ('ARE YOU SURE?', 60), ('ALLOW NOTIFICATIONS?', 60), ('AD', 46), ('AdRaze', 240)]:
    f = inter('InterDisplay-Black.otf', size)
    print(f'{w(f, txt, size, -.03):7.1f} (ls -.03)  {w(f, txt, size, -.035):7.1f} (ls -.035) {w(f, txt, size, 0):7.1f} (ls 0)  {size}px  {txt}')
print('--- InterB')
for txt, size in [('We value your privacy', 52), ('Skip in 5', 40), ('reject', 20), ('reject', 30), ('adraze.app', 66)]:
    f = inter('Inter-Bold.otf', size)
    print(f'{w(f, txt, size, 0):7.1f}  {size}px  {txt}')
f = inter('Inter-Medium.otf', 40); t = 'CHROME EXTENSION · BROWSER FOR MAC AND LINUX'
print('--- InterM', w(f, t, 40, .14))
for fn in ('InterDisplay-Black.otf', 'Inter-Bold.otf', 'Newsreader.ttf'):
    ff = ImageFont.truetype(F + fn, 100); print(fn, 'ascent/descent@100', ff.getmetrics(), 'bbox H', ff.getbbox('H'), 'bbox x', ff.getbbox('x'))
