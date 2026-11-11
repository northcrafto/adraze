#!/usr/bin/env python3
"""luva-a/-b.raw.svg (från luva.js) -> färdiga julbilder: texten "AD" blir konturer, stilar inline, egen viewBox.
Källan sparas här (adraze-gorilla-luva.svg = loggan med AD-lapp, -enkel.svg = den enkla) och webbläsarens filer
i browser/ui/jul: gorilla-luva-512.png för nya fliken och delningsbilden, mark-luva.png (256 px, som
ui/adraze-mark.png) för blockerarknappen och de andra små ikonerna. Bara de två filerna används av webbläsaren
(BILDER i browser/jul.js). PNG ritas av en osynlig Chrome/Brave som stänger sig själv."""
import os, re, sys, shutil, struct, pathlib, tempfile, subprocess
UT = pathlib.Path(__file__).parent
JUL = UT.parent.parent / 'browser/ui/jul'
ns = {'__file__': str(UT / 'gor.py')}; exec((UT / 'gor.py').read_text().split('for namn in')[0], ns)  # bara textpath-delen

def fardig(namn):
    raw = UT / f'luva-{namn}.raw.svg'; s = raw.read_text()
    s = re.sub(r'<text x="([\d.]+)" y="([\d.]+)" transform="rotate\((-?[\d.]+)[^"]*"[^>]*font:\S+ (\d+)px[^>]*>([^<]+)</text>',
               lambda m: ns['textpath'](m[5], float(m[1]), float(m[2]), float(m[3]), float(m[4])), s)
    s = s.replace('class="ink" ', '').replace('style="fill:', 'stroke-linecap="round" stroke-linejoin="round" style="fill:')
    s = re.sub(r'<svg viewBox="([^"]+)" width="">', r'<svg xmlns="http://www.w3.org/2000/svg" viewBox="\1">', s)
    raw.unlink()
    return s

def png(svg, ut, px):
    """Samma väg som loggans PNG: webbläsaren ritar svg:n i exakt px, genomskinlig botten."""
    chrome = os.environ.get('CHROME') or next((p for p in map(shutil.which, ('google-chrome', 'chromium', 'chromium-browser', 'brave-browser')) if p), None)
    if not chrome: sys.exit('Hittar ingen Chrome, Chromium eller Brave (sätt CHROME=/sökväg/till/webbläsaren).')
    # Chrome lägger en socket i TMPDIR och kraschar om sökvägen dit är för lång – låt den då använda /tmp.
    miljo = {k: v for k, v in os.environ.items() if not (k == 'TMPDIR' and len(v) > 60)}
    ut.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix='luva-') as tmp:   # egen profil: rör ingen webbläsare som redan är igång
        sida = pathlib.Path(tmp, 'sida.html')
        sida.write_text('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}'
                        f'img{{display:block;width:{px}px;height:{px}px}}</style><img src="{svg.resolve().as_uri()}">')
        try:
            subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--default-background-color=00000000',
                            '--force-device-scale-factor=1', f'--user-data-dir={tmp}/profil', f'--window-size={px},{px}', f'--screenshot={ut}', sida.as_uri()],
                           check=True, timeout=120, env=miljo, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as fel:
            sys.exit(f'Webbläsaren kunde inte rita {ut.name}: {fel}')
    matt = struct.unpack('>II', ut.read_bytes()[16:24]) if ut.exists() else None
    if matt != (px, px): sys.exit(f'{ut.name} blev {matt}, väntade {px}x{px}')

JUL.mkdir(parents=True, exist_ok=True)
hel, enkel = UT / 'adraze-gorilla-luva.svg', UT / 'adraze-gorilla-luva-enkel.svg'
hel.write_text(fardig('b')); enkel.write_text(fardig('a'))
png(hel, JUL / 'gorilla-luva-512.png', 512)
# Samma märke i ljust och mörkt läge: luvans bläcklinje syns inte mot mörk botten, men det röda och det vita bär den.
png(enkel, JUL / 'mark-luva.png', 256)
print('ok', *(f'{n} {(JUL / n).stat().st_size} byte' for n in ('gorilla-luva-512.png', 'mark-luva.png')), sep='\n  ')
