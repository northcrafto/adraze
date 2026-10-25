#!/usr/bin/env python3
"""Bygger ui/bakgrunder.json: många fina liggande Pexels-foton till nya flikens bakgrund.
Appen laddar bilderna direkt från images.pexels.com (ingen API-nyckel i appen).
Kör: python3 tools/hamta-bakgrunder.py   (nyckel i ~/.config/scout/pexels.key)"""
import json, os, re, sys, time, urllib.request, urllib.parse

KEY = open(os.path.expanduser('~/.config/scout/pexels.key')).read().strip()
UT = os.path.join(os.path.dirname(__file__), '..', 'ui', 'bakgrunder.json')
SOK = [
    'mountain landscape', 'snow mountains', 'alps', 'mountain lake', 'fjord norway', 'iceland landscape',
    'northern lights', 'aurora borealis', 'milky way', 'starry night sky', 'galaxy night', 'ocean waves',
    'beach sunset', 'tropical beach aerial', 'coast cliffs', 'lighthouse', 'forest', 'misty forest',
    'autumn forest', 'autumn leaves road', 'waterfall', 'river valley', 'desert dunes', 'canyon',
    'lavender field', 'flower field', 'tulip field', 'green hills', 'rice terraces', 'volcano',
    'glacier', 'winter landscape', 'snowy forest', 'sunrise mountains', 'sunset sky clouds', 'clouds aerial',
    'city skyline night', 'tokyo night', 'new york skyline', 'city lights aerial', 'architecture minimal',
    'japan temple', 'kyoto', 'santorini', 'venice', 'paris', 'swiss village', 'cabin in the woods',
    'road trip landscape', 'aerial landscape', 'drone nature', 'lake reflection', 'calm sea', 'underwater',
    'coral reef', 'thunderstorm lightning', 'moon night', 'savanna', 'jungle', 'bamboo forest',
    'cherry blossom', 'scotland highlands', 'dolomites', 'patagonia', 'new zealand landscape', 'lofoten',
    'sweden nature', 'finland lake', 'abstract colorful', 'minimal landscape', 'dark moody landscape',
]
SIDOR = int(sys.argv[1]) if len(sys.argv) > 1 else 3

def hamta(url):
    req = urllib.request.Request(url, headers={'Authorization': KEY, 'User-Agent': 'AdRaze'})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r: return json.load(r)
        except Exception as e:
            print('  fel', e, file=sys.stderr); time.sleep(3)
    return {}

sedda, ut = set(), []
for q in SOK:
    n0 = len(ut)
    for sida in range(1, SIDOR + 1):
        j = hamta('https://api.pexels.com/v1/search?' + urllib.parse.urlencode(
            {'query': q, 'orientation': 'landscape', 'size': 'large', 'per_page': 80, 'page': sida}))
        for p in j.get('photos', []):
            w, h = p.get('width', 0), p.get('height', 0)
            if p['id'] in sedda or w < 3000 or not (1.3 <= w / max(h, 1) <= 2.1): continue
            m = re.match(r'https://images\.pexels\.com/photos/(\d+)/([^?]+)', p['src']['original'])
            if not m: continue
            sedda.add(p['id'])
            # [id, filnamn, fotograf, medelfärg]
            ut.append([p['id'], m.group(2), p.get('photographer', ''), p.get('avg_color') or '#222'])
        if not j.get('next_page'): break
    print(f'{q}: +{len(ut) - n0}  (totalt {len(ut)})')
json.dump(ut, open(UT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('Sparat', len(ut), 'bilder →', os.path.abspath(UT))
