#!/usr/bin/env python3
"""Bygger sajten på alla språk.
- {{ikon}} -> inline-SVG från ikoner/
- {{t:nyckel}} -> text från i18n/<språk>.json (saknas nyckeln: svenska)
- Svenska ligger i roten (/), övriga språk i /<kod>/ med hreflang-länkar mellan alla.
- Tre sajter ur samma källor: adraze.app (site/), accounts.adraze.app (../accounts/) och
  download.adraze.app (../download/). Subdomänerna får kopior av filerna de behöver i TILLGANGAR.
Kör: python3 bygg.py"""
import html, json, pathlib, re, shutil

rot = pathlib.Path(__file__).parent
SAJT = 'https://adraze.app'
KONTO = 'https://accounts.adraze.app'
LADDA = 'https://download.adraze.app'
HJALP = 'https://support.adraze.app'
# Kod, namn på språket självt (ordning = ordning i språkväljaren)
SPRAK = [
    ('sv', 'Svenska'), ('en', 'English'), ('nb', 'Norsk'), ('da', 'Dansk'), ('fi', 'Suomi'), ('is', 'Íslenska'),
    ('de', 'Deutsch'), ('nl', 'Nederlands'), ('fr', 'Français'), ('es', 'Español'), ('pt', 'Português'), ('it', 'Italiano'),
    ('pl', 'Polski'), ('cs', 'Čeština'), ('sk', 'Slovenčina'), ('hu', 'Magyar'), ('ro', 'Română'), ('bg', 'Български'),
    ('el', 'Ελληνικά'), ('hr', 'Hrvatski'), ('sl', 'Slovenščina'), ('et', 'Eesti'), ('lv', 'Latviešu'), ('lt', 'Lietuvių'),
    ('uk', 'Українська'), ('tr', 'Türkçe'),
]
# Källa → (sajt, sökväg på sajten)
SIDOR = {'index.src.html': (SAJT, ''), 'integritet.src.html': (SAJT, 'integritet'), 'statistik.src.html': (SAJT, 'statistik'),
         'stod.src.html': (SAJT, 'stod'), 'kolla.src.html': (SAJT, 'kolla'),
         'konto.src.html': (KONTO, ''), 'download.src.html': (LADDA, ''),
         'support.src.html': (HJALP, ''), 'arende.src.html': (HJALP, 'arende'), 'team.src.html': (HJALP, 'team')}
MAPP = {SAJT: rot, KONTO: rot.parent / 'accounts', LADDA: rot.parent / 'download', HJALP: rot.parent / 'support'}
UTAN_SITEMAP = {(KONTO, ''), (HJALP, 'arende'), (HJALP, 'team')}  # inloggning, ärenden och teampanelen ska inte indexeras
BARA_SV = {'team.src.html'}  # teamets panel finns bara på svenska
# Filer som subdomänerna serverar själva (kopieras från site/ vid varje bygge)
TILLGANGAR = {
    KONTO: ['style.css', 'konto.css', 'konto.js', 'main.js', 'fonts', 'mail/vinkar.gif', 'logo-mark.svg', 'favicon.png',
            'app-google.html', 'app-google.css', 'app-google.js'],
    HJALP: ['style.css', 'support.css', 'support.js', 'arende.js', 'team.js', 'main.js', 'fonts', 'mail/vinkar.gif', 'logo-mark.svg', 'favicon.png'],
    LADDA: ['style.css', 'download.css', 'download.js', 'main.js', 'fonts', 'logo-mark.svg', 'favicon.png', 'install.sh', 'adraze-512.png', 'os',
            '4bbbc2d76725e865a25008fd19941943.txt'],  # IndexNow-nyckeln (måste ligga på samma värd)
}
# Sätt till butikslänken när Google har godkänt tillägget: knapparna går då direkt dit och zip-instruktionerna försvinner
# (Byt då även /chrome och /extension i ../download/vercel.json till butikslänken.)
BUTIK = None  # 'https://chromewebstore.google.com/detail/cgdjdjgdoklomdphknggkhfghlglcppd'

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

for mapp in MAPP.values():
    for k, _ in SPRAK:
        if k != 'sv' and (mapp / k).is_dir(): shutil.rmtree(mapp / k)
for sajt, filer in TILLGANGAR.items():
    for f in filer:
        fran, till = rot / f, MAPP[sajt] / f
        till.parent.mkdir(parents=True, exist_ok=True)
        if fran.is_dir(): shutil.rmtree(till, ignore_errors=True); shutil.copytree(fran, till)
        else: shutil.copy2(fran, till)

for kod, namn in finns:
    t = {**sv, **json.loads((rot / 'i18n' / f'{kod}.json').read_text())}
    for src, (sajt, sida) in SIDOR.items():
        if src in BARA_SV and kod != 'sv': continue
        # Länkar till huvudsajten blir fullständiga på subdomänerna
        hem = '' if sajt == SAJT else SAJT
        # Gemensam topp med hamburgarmeny för alla sidor (före ikonerna, {{topp}} ser ut som ett ikonnamn)
        mall = (rot / src).read_text().replace('{{topp}}', (rot / '_topp.html').read_text())
        alternates = '\n'.join(f'<link rel="alternate" hreflang="{k}" href="{sajt}{url(k, sida)}">' for k, _ in finns)
        alternates += f'\n<link rel="alternate" hreflang="x-default" href="{sajt}{url("sv", sida)}">'
        alternates += f'\n<link rel="canonical" href="{sajt}{url(kod, sida)}">'
        val = ''.join(
            f'<li><a href="{url(k, sida)}" hreflang="{k}" lang="{k}"{" aria-current=\"true\"" if k == kod else ""} data-sprak="{k}">{html.escape(n)}</a></li>'
            for k, n in finns)
        sprakval = (f'<details class="sprak"><summary aria-label="{html.escape(t["nav.language"])}">{ikon("globe")}<span>{kod.upper()}</span></summary>'
                    f'<ul class="sprak-lista">{val}</ul></details>')
        ut = mall.replace('{{alternates}}', alternates).replace('{{sprakval}}', sprakval)
        # <!--zip-->…<!--/zip--> visas tills butiken finns, <!--butik-->…<!--/butik--> efter
        bort = 'zip' if BUTIK else 'butik'
        ut = re.sub(rf'<!--{bort}-->.*?<!--/{bort}-->', '', ut, flags=re.S).replace('<!--zip-->', '').replace('<!--/zip-->', '').replace('<!--butik-->', '').replace('<!--/butik-->', '')
        ut = ut.replace('{{installera}}', BUTIK or hem + url(kod, '') + '#installera').replace('{{butik}}', BUTIK or '')
        ut = ut.replace('{{lang}}', kod).replace('{{hem}}', hem + url(kod, '')).replace('{{pre}}', hem + ('' if kod == 'sv' else f'/{kod}'))
        ut = ut.replace('{{konto}}', KONTO + url(kod, '')).replace('{{ladda}}', LADDA + url(kod, '')).replace('{{hjalp}}', HJALP + url(kod, ''))
        ut = re.sub(r'\{\{t:([a-z0-9_.]+)\}\}', lambda m: t[m.group(1)], ut)
        ut = re.sub(r'\{\{([a-z-]+)\}\}', lambda m: ikon(m.group(1)), ut)
        assert '{{' not in ut, re.findall(r'\{\{.*?\}\}', ut)[:3]
        mal = MAPP[sajt] / (kod if kod != 'sv' else '') / ((sida or 'index') + '.html')
        mal.parent.mkdir(parents=True, exist_ok=True)
        mal.write_text(ut)
print('byggde', len(finns), 'språk:', ' '.join(k for k, _ in finns))

# Sitemap med alla språkversioner, en per sajt
for sajt, mapp in MAPP.items():
    sidor = [v for s, v in SIDOR.values() if s == sajt and (s, v) not in UTAN_SITEMAP]
    if not sidor:
        (mapp / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
        continue
    rader = []
    for sida in sidor:
        for kod, _ in finns:
            alt = ''.join(f'<xhtml:link rel="alternate" hreflang="{k}" href="{sajt}{url(k, sida)}"/>' for k, _ in finns)
            rader.append(f'<url><loc>{sajt}{url(kod, sida)}</loc>{alt}</url>')
    (mapp / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + '\n'.join(rader) + '\n</urlset>\n')
    (mapp / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {sajt}/sitemap.xml\n')
