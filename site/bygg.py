#!/usr/bin/env python3
"""Bygger sajten på alla språk.
- {{ikon}} -> inline-SVG från ikoner/
- {{t:nyckel}} -> text från i18n/<språk>.json (saknas nyckeln: svenska)
- Svenska ligger i roten (/), övriga språk i /<kod>/ med hreflang-länkar mellan alla.
Kör: python3 bygg.py"""
import html, json, pathlib, re, shutil

rot = pathlib.Path(__file__).parent
SAJT = 'https://adraze.app'
# Kod, namn på språket självt (ordning = ordning i språkväljaren)
SPRAK = [
    ('sv', 'Svenska'), ('en', 'English'), ('nb', 'Norsk'), ('da', 'Dansk'), ('fi', 'Suomi'), ('is', 'Íslenska'),
    ('de', 'Deutsch'), ('nl', 'Nederlands'), ('fr', 'Français'), ('es', 'Español'), ('pt', 'Português'), ('it', 'Italiano'),
    ('pl', 'Polski'), ('cs', 'Čeština'), ('sk', 'Slovenčina'), ('hu', 'Magyar'), ('ro', 'Română'), ('bg', 'Български'),
    ('el', 'Ελληνικά'), ('hr', 'Hrvatski'), ('sl', 'Slovenščina'), ('et', 'Eesti'), ('lv', 'Latviešu'), ('lt', 'Lietuvių'),
    ('uk', 'Українська'), ('tr', 'Türkçe'),
]
SIDOR = {'index.src.html': '', 'integritet.src.html': 'integritet', 'konto.src.html': 'konto'}
UTAN_SITEMAP = {'konto'}  # inloggningen ska inte indexeras

def ikon(namn):
    svg = re.sub(r'<title>.*?</title>', '', (rot / 'ikoner' / f'{namn}.svg').read_text())
    return svg.replace('<svg ', '<svg class="ikon" aria-hidden="true" fill="currentColor" ', 1)

def url(kod, sida):
    bas = '' if kod == 'sv' else f'/{kod}'
    return f'{bas}/{sida}' if sida else f'{bas}/'

sv = json.loads((rot / 'i18n' / 'sv.json').read_text())
finns = [(k, n) for k, n in SPRAK if (rot / 'i18n' / f'{k}.json').exists()]
saknas = [k for k, _ in SPRAK if (k, dict(SPRAK)[k]) not in finns]
if saknas: print('saknar översättning (hoppas över):', ' '.join(saknas))

for k, _ in SPRAK:
    if k != 'sv' and (rot / k).is_dir(): shutil.rmtree(rot / k)

for kod, namn in finns:
    t = {**sv, **json.loads((rot / 'i18n' / f'{kod}.json').read_text())}
    for src, sida in SIDOR.items():
        mall = (rot / src).read_text()
        alternates = '\n'.join(f'<link rel="alternate" hreflang="{k}" href="{SAJT}{url(k, sida)}">' for k, _ in finns)
        alternates += f'\n<link rel="alternate" hreflang="x-default" href="{SAJT}{url("sv", sida)}">'
        alternates += f'\n<link rel="canonical" href="{SAJT}{url(kod, sida)}">'
        val = ''.join(
            f'<li><a href="{url(k, sida)}" hreflang="{k}" lang="{k}"{" aria-current=\"true\"" if k == kod else ""} data-sprak="{k}">{html.escape(n)}</a></li>'
            for k, n in finns)
        sprakval = (f'<details class="sprak"><summary aria-label="{html.escape(t["nav.language"])}">{ikon("globe")}<span>{kod.upper()}</span></summary>'
                    f'<ul class="sprak-lista">{val}</ul></details>')
        ut = mall.replace('{{alternates}}', alternates).replace('{{sprakval}}', sprakval)
        ut = ut.replace('{{lang}}', kod).replace('{{hem}}', url(kod, '')).replace('{{pre}}', '' if kod == 'sv' else f'/{kod}')
        ut = re.sub(r'\{\{t:([a-z0-9_.]+)\}\}', lambda m: t[m.group(1)], ut)
        ut = re.sub(r'\{\{([a-z-]+)\}\}', lambda m: ikon(m.group(1)), ut)
        assert '{{' not in ut, re.findall(r'\{\{.*?\}\}', ut)[:3]
        mal = rot / (kod if kod != 'sv' else '') / ((sida or 'index') + '.html')
        mal.parent.mkdir(parents=True, exist_ok=True)
        mal.write_text(ut)
print('byggde', len(finns), 'språk:', ' '.join(k for k, _ in finns))

# Sitemap med alla språkversioner
rader = []
for sida in SIDOR.values():
    if sida in UTAN_SITEMAP: continue
    for kod, _ in finns:
        alt = ''.join(f'<xhtml:link rel="alternate" hreflang="{k}" href="{SAJT}{url(k, sida)}"/>' for k, _ in finns)
        rader.append(f'<url><loc>{SAJT}{url(kod, sida)}</loc>{alt}</url>')
(rot / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + '\n'.join(rader) + '\n</urlset>\n')
(rot / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {SAJT}/sitemap.xml\n')
