#!/usr/bin/env python3
"""dnr2wk.py – AdRazes regler och innehållsskript från datorn -> iOS-appens App/Regler/.

Användning (från ~/adraze/ios):
    python3 verktyg/dnr2wk.py                       # ~/adraze/extension + ~/adraze/browser -> App/Regler
    python3 verktyg/dnr2wk.py EXT BROWSER UT        # egna sökvägar

Källan är tillägget (~/adraze/extension: rules/*.json, data/*.json, content/*.js, scriptlets/*.js). Datorns
webbläsare använder en kopia av samma filer (browser/adraze/, "npm run sync"), så de jämförs och en skillnad
skrivs ut som varning. Tillåtlistorna för inloggning och betalning läses ur browser/main.js (ADBLOCK_ALLOW,
ADBLOCK_ALLOW_PATH, POPUP_TRUSTED) så att de alltid är desamma som på datorn.

Det som skrivs (allt under UT):
    listor/<namn>.json      WebKit-listor (WKContentRuleList), högst 150 000 regler var
    listor/manifest.json    namn, fil, sha256, antal regler per lista (appen kompilerar om när sha256 ändras)
    data/sajter/NNN.json    per värd: sajtens dölj-regler, stilregler, kakrute-regler och scriptlet-data,
                            uppdelat i 256 hinkar (FNV-1a av värden), så att appen bara läser det den behöver
    data/initiativ.txt      annonsvärdar som inte får skicka hela fliken till en annan sajt (görs native)
    data/popup.txt          popup-nätverkens värdar (native koll av nya fönster)
    data/parametrar.json    spårningsparametrar som tas bort (native för sidor, JS för fetch/XHR)
    data/inlogg.json        datorns tillåtlistor (inloggning, betalning, betrodda popup-fönster)
    data/kakor.json         KAK_UPPLAS och KAK_DOLJ ur tilläggets background.js
    skript/                 vakt.js (guard.js), kakor.js, youtube.js och scriptlet-mallar
    prov.json               testdata för självtestet (-mode skydd)
    konvertering.json       statistik: vad som översattes, närmades och tappades, och varför

WebKit-fakta som översättningen bygger på (verifierat i WebKits källkod 2026-11-17, WebCore/contentextensions/
ContentExtensionParser.cpp och loader/ResourceLoadInfo.cpp, och i prototypen på iOS 18.6 och 26.1):
  - maxRuleCount = 150000 per lista. 150 001 regler ger WKErrorDomain 6 (testat i prototypen).
  - En ogiltig regel (fel nyckel, ogiltig regex) får HELA listan att fallera; en ogiltig CSS-selektor hoppas
    bara över. Därför valideras varje url-filter mot WebKits regex-delmängd innan den skrivs.
  - ignore-previous-rules gäller bara inom samma lista. Tillåtlistan läggs därför sist i varje lista.
  - if-domain/unless-domain/if-top-url är villkor; två villkor i samma regel går inte.
  - top-document/child-document finns först i nyare WebKit (mars 2025), inte i iOS 17. Huvudsidan uttrycks
    därför som resource-type document + load-context top-frame (load-context finns sedan WebKit r275078, 2021).
  - En huvudsidas laddning räknas alltid som first-party (mainDocumentURL = den nya adressen), så load-type
    third-party på huvudsidan träffar aldrig. initiatorDomains på huvudsidan går inte att uttrycka -> native.
  - if-frame-url/unless-frame-url används inte: unless-frame-url lades till först i Safari 26 enligt Apples
    release notes, och iOS 17 är otestat.
"""
import base64
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

HEM = os.path.expanduser('~')
EXT = os.path.join(HEM, 'adraze', 'extension')
BROWSER = os.path.join(HEM, 'adraze', 'browser')
UT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'App', 'Regler')

DOMAIN_ANCHOR = '^[^:]+://+([^:/]+\\.)?'    # WebKits DNR-översättning (_regexURLFilterForChromeURLFilter)
SEP = '[^a-zA-Z0-9_.%-]'                     # DNR-separatorn "^"
ESC = set('?+[(){}$|\\.')                    # tecknen WebKit escapar i urlFilter
MAX_PER_LIST = 150000                        # WebKit: ContentExtensionParser maxRuleCount
HINKAR = 256                                 # antal hinkfiler för per-värd-datan (samma tal i Swift)

# DNR-resurstyp -> WebKit-resurstyp som finns i iOS 17 (None = saknas, typen tappas).
# main_frame hanteras för sig (listan "sidor"). object: <object>/<embed> laddas som "other" i WebKit.
RT = {
    'sub_frame': 'document', 'stylesheet': 'style-sheet', 'script': 'script', 'image': 'image',
    'font': 'font', 'object': 'other', 'xmlhttprequest': 'fetch', 'ping': 'ping', 'csp_report': 'csp-report',
    'media': 'media', 'websocket': 'websocket', 'other': 'other', 'webtransport': None, 'webbundle': None,
}
ALL_RT = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest',
          'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other']

HUVUDSIDA = {'resource-type': ['document'], 'load-context': ['top-frame']}
SPARR_HUVUDSIDA = {'trigger': {'url-filter': '.*', **HUVUDSIDA}, 'action': {'type': 'ignore-previous-rules'}}

# Adress som appen själv skickar till när en annonsvärd försöker skicka hela fliken vidare (Skydd.beslut):
# listan "sidor" stoppar den, WebKit ger fel 104 och Flikar visar stoppsidan.
STOPP_VARD = 'adraze.invalid'

# Datorns snabbkoll (browser/main.js instantDangerMain, ui/shell.js instantDanger): testdomäner som alltid
# ger stoppsidan. Nyckelordsdelen (/phish|malware|bluff|scam/ i värden) tas inte med: den träffar riktiga
# sajter som malwarebytes.com.
SNABBKOLL = ['farlig.exempel.se', 'bank-verifiering.se', 'testsafebrowsing.appspot.com']


class Fel(Exception):
    pass


# ---------------------------------------------------------------- url-filter

def esc_text(s):
    return ''.join('\\' + c if c in ESC else c for c in s)


def esc_domain(d):
    return ''.join('\\' + c if c in ESC or c in '*^' else c for c in d.lower())


def urlfilter_to_regex(f):
    """DNR urlFilter -> WebKit-regex (samma algoritm som WebKits egen översättning)."""
    if not f:
        return None
    dom = f.startswith('||')
    if dom:
        f = f[2:]
    start = (not dom) and f.startswith('|')
    if start:
        f = f[1:]
    end = f.endswith('|')
    if end:
        f = f[:-1]
    out = []
    for ch in f:
        if ch in ESC:
            out.append('\\' + ch)
        elif ch == '*':
            out.append('.*')
        elif ch == '^':
            out.append(SEP)
        else:
            out.append(ch)
    r = ''.join(out)
    while r.startswith('.*') and not dom and not start:   # inledande .* är onödigt och dyrt i DFA:n
        r = r[2:]
    if dom:
        r = DOMAIN_ANCHOR + r
    if start:
        r = '^' + r
    if end:
        r = r + '$'
    return r or None


# ------------------------------------------------- regexFilter (RE2) -> WebKit

def _tokens(p):
    i, n, out = 0, len(p), []
    while i < n:
        c = p[i]
        if c == '\\':
            if i + 1 >= n:
                raise Fel('avslutande \\')
            e = p[i + 1]
            if e == 'd':
                out.append(('atom', '[0-9]'))
            elif e == 'w':
                out.append(('atom', '[a-zA-Z0-9_]'))
            elif e in 'DWsSbBpPQEAzZ' or e.isdigit():
                raise Fel('\\' + e + ' stöds inte')
            else:
                out.append(('atom', '\\' + e))
            i += 2
        elif c == '[':
            j = i + 1
            if j < n and p[j] == '^':
                j += 1
            buf = []
            if j < n and p[j] == ']':
                buf.append('\\]')
                j += 1
            while j < n and p[j] != ']':
                if p[j] == '\\' and j + 1 < n:
                    e = p[j + 1]
                    if e == 'd':
                        buf.append('0-9')
                    elif e == 'w':
                        buf.append('a-zA-Z0-9_')
                    elif e in 'DWsSbBpP':
                        raise Fel('\\' + e + ' i klass stöds inte')
                    else:
                        buf.append('\\' + e)
                    j += 2
                elif p[j] == '[':
                    raise Fel('nästlad klass')
                else:
                    buf.append(p[j])
                    j += 1
            if j >= n:
                raise Fel('oavslutad klass')
            head = p[i:i + 1 + (1 if p[i + 1:i + 2] == '^' else 0)]
            out.append(('atom', head + ''.join(buf) + ']'))
            i = j + 1
        elif c == '(':
            if p.startswith('(?:', i):
                out.append(('(', '('))
                i += 3
            elif p.startswith('(?', i):
                raise Fel('(? stöds inte')
            else:
                out.append(('(', '('))
                i += 1
        elif c == ')':
            out.append((')', ')'))
            i += 1
        elif c in '*+?':
            i += 1
            if i < n and p[i] == '?':
                i += 1
            out.append(('q', c))
        elif c == '{':
            m = re.match(r'\{(\d+)(,(\d*))?\}', p[i:])
            if not m:
                out.append(('atom', '\\{'))
                i += 1
                continue
            lo = int(m.group(1))
            hi = lo if m.group(2) is None else (None if m.group(3) == '' else int(m.group(3)))
            out.append(('rep', (lo, hi)))
            i += len(m.group(0))
            if i < n and p[i] == '?':
                i += 1
        elif c == '|':
            out.append(('|', '|'))
            i += 1
        elif c == '^':
            out.append(('^', '^'))
            i += 1
        elif c == '$':
            out.append(('$', '$'))
            i += 1
        elif c == '.':
            out.append(('atom', '.'))
            i += 1
        else:
            if ord(c) > 127:
                raise Fel('icke-ASCII')
            out.append(('atom', c))
            i += 1
    return out


def _expand_reps(tokens):
    out = []
    for t in tokens:
        if t[0] != 'rep':
            out.append(t)
            continue
        lo, hi = t[1]
        if not out:
            raise Fel('{} utan atom')
        if out[-1][0] == 'atom':
            unit = [out.pop()]
        elif out[-1][0] == ')':
            depth, k = 0, len(out) - 1
            while k >= 0:
                if out[k][0] == ')':
                    depth += 1
                elif out[k][0] == '(':
                    depth -= 1
                    if depth == 0:
                        break
                k -= 1
            if k < 0:
                raise Fel('obalanserad grupp')
            unit = out[k:]
            del out[k:]
        else:
            raise Fel('{} efter ' + out[-1][0])
        if lo > 48 or (hi is not None and hi > 48):
            raise Fel('för stor upprepning')
        for _ in range(lo):
            out.extend(unit)
        if hi is None:
            if lo == 0:
                out.extend(unit)
                out.append(('q', '*'))
            else:
                out.append(('q', '+'))
        else:
            for _ in range(hi - lo):
                out.extend(unit)
                out.append(('q', '?'))
    return out


def _expand_alternatives(tokens, cap=16):
    """WebKit saknar |: a|b och (x|y)z skrivs ut som separata mönster."""
    def parse(i):
        alts = [[]]
        while i < len(tokens):
            t = tokens[i]
            if t[0] == '(':
                sub, i = parse(i + 1)
                alts[-1].append(('group', sub))
                continue
            if t[0] == ')':
                return alts, i + 1
            if t[0] == '|':
                alts.append([])
                i += 1
                continue
            alts[-1].append(t)
            i += 1
        return alts, i

    def expand_seq(seq):
        results = [[]]
        k = 0
        while k < len(seq):
            item = seq[k]
            q = seq[k + 1][1] if k + 1 < len(seq) and seq[k + 1][0] == 'q' else None
            if item[0] == 'group':
                subs = []
                for alt in item[1]:
                    subs.extend(expand_seq(alt))
                if len(subs) == 1:
                    opts = [[('(', '(')] + subs[0] + [(')', ')')] + ([('q', q)] if q else [])]
                else:
                    if q in ('*', '+'):
                        raise Fel('kvantifierad disjunktion')
                    opts = [[('(', '(')] + s + [(')', ')')] for s in subs]
                    if q == '?':
                        opts.append([])
                results = [r + o for r in results for o in opts]
                if len(results) > cap:
                    raise Fel('för många alternativ')
                k += 2 if q else 1
            else:
                results = [r + [item] for r in results]
                k += 1
        return results

    tree, _ = parse(0)
    out = []
    for alt in tree:
        out.extend(expand_seq(alt))
        if len(out) > cap:
            raise Fel('för många alternativ')
    return out


def webkit_regex_ok(r):
    """Grov kopia av WebKits URLFilterParser: bara ASCII, ingen |, inga {n,m}, inga \\d \\w \\s \\b,
    inga (?-grupper, ^ bara först, $ bara sist, kvantifierare bara efter en atom."""
    if not r or any(ord(c) > 127 for c in r):
        return False
    i, n, depth, prev = 0, len(r), 0, None
    while i < n:
        c = r[i]
        if c == '\\':
            if i + 1 >= n or r[i + 1] in 'dDwWsSbBpP0123456789':
                return False
            i += 2
            prev = 'atom'
            continue
        if c == '[':
            j = i + 1
            if j < n and r[j] == '^':
                j += 1
            if j < n and r[j] == ']':
                j += 1
            while j < n and r[j] != ']':
                if r[j] == '\\':
                    if j + 1 < n and r[j + 1] in 'dDwWsSbBpP':
                        return False
                    j += 2
                else:
                    if r[j] == '[':
                        return False
                    j += 1
            if j >= n:
                return False
            i = j + 1
            prev = 'atom'
            continue
        if c in '|{}':
            return False
        if c == '(':
            if r.startswith('(?', i):
                return False
            depth += 1
            prev = '('
        elif c == ')':
            depth -= 1
            if depth < 0 or prev == '(':
                return False
            prev = 'atom'
        elif c == '^':
            if i != 0:
                return False
            prev = '^'
        elif c == '$':
            if i != n - 1:
                return False
            prev = '$'
        elif c in '*+?':
            if prev != 'atom':
                return False
            prev = 'q'
        else:
            prev = 'atom'
        i += 1
    return depth == 0


def regexfilter_to_webkit(p):
    toks = _expand_reps(_tokens(p))
    alts = _expand_alternatives(toks)
    out = []
    for a in alts:
        s = ''.join(t[1] for t in a)
        if not webkit_regex_ok(s):
            raise Fel('ogiltig efter omskrivning')
        out.append(s)
    return out


# ------------------------------------------------------------- domäner

def ren_vard(d):
    """Värd -> gemener och punycode, eller None."""
    d = (d or '').strip().lower().rstrip('.')
    if not d:
        return None
    try:
        d.encode('ascii')
    except UnicodeEncodeError:
        try:
            d = d.encode('idna').decode('ascii')
        except Exception:
            return None
    if not re.fullmatch(r'[a-z0-9.\-_\[\]:]+', d):
        return None
    return d


def wk_domain(d):
    d = ren_vard(d)
    return '*' + d if d else None


def domains(lst):
    out = []
    for d in lst or []:
        w = wk_domain(d)
        if w and w not in out:
            out.append(w)
    return out


def vard_regex(d):
    return DOMAIN_ANCHOR + esc_domain(d) + SEP


# ------------------------------------------------------------- DNR-regel

def typer_for(c):
    """DNR-villkorets resurstyper (lista med DNR-namn). Utan typer = allt utom main_frame."""
    inc = c.get('resourceTypes')
    exc = c.get('excludedResourceTypes')
    if inc:
        return list(dict.fromkeys(inc)), True
    if exc:
        return [t for t in ALL_RT if t not in exc], True
    return [t for t in ALL_RT if t != 'main_frame'], False


def wk_typer(dnr_typer, s, explicit=True):
    out = []
    for t in dnr_typer:
        if t == 'main_frame':
            continue
        w = RT.get(t)
        if w is None:
            if explicit:
                s['typ_utan_motsvarighet_' + t] += 1
            continue
        if w not in out:
            out.append(w)
    return out


def kombinera(d, uf, s):
    """requestDomains + urlFilter -> regex (sällsynt: bygget slår ihop domänlistor utan urlFilter)."""
    base = DOMAIN_ANCHOR + esc_domain(d)
    if uf.startswith('||'):
        vard = re.split(r'[\^/*|?]', uf[2:], 1)[0].lower()
        if vard == d or vard.endswith('.' + d):
            return urlfilter_to_regex(uf)
        s['tappad_requestDomains_och_annan_vard'] += 1
        return None
    rest = urlfilter_to_regex(uf.lstrip('|'))
    if rest is None:
        return base + SEP
    rest = rest.lstrip('^')
    if rest.startswith('/'):
        rest = rest[1:]
    s['närmad_requestDomains_plus_urlFilter'] += 1
    return base + '[:/]' + ('.*' if rest else '') + rest


def filter_for(c, s):
    """Villkorets url-filter (lista av WebKit-regex), [] = tappad."""
    if 'regexFilter' in c:
        try:
            f = regexfilter_to_webkit(c['regexFilter'])
        except Fel as e:
            s['tappad_regex: ' + str(e)] += 1
            return []
        if len(f) > 1:
            s['regex_delad_i_flera'] += 1
        rds = c.get('requestDomains')
        if rds:
            s['närmad_regex_utan_requestDomains'] += 1
        return f
    uf = c.get('urlFilter')
    rds = c.get('requestDomains')
    if rds:
        out = []
        for d in rds:
            d = ren_vard(d)
            if not d:
                s['tappad_ogiltig_domän'] += 1
                continue
            if uf:
                r = kombinera(d, uf, s)
                if r:
                    out.append(r)
            else:
                out.append(vard_regex(d))
        return out
    if uf:
        r = urlfilter_to_regex(uf)
        return [r] if r else []
    return ['.*']


class Regel:
    """En WebKit-regel med DNR-prioritet, om den är ett undantag (ignore-previous-rules) och om undantaget
    bara hör till en viss regel (lokalt: excludedRequestDomains och excludedInitiatorDomains)."""
    __slots__ = ('prio', 'undantag', 'json', 'kalla', 'lokal')

    def __init__(self, prio, undantag, json_, kalla, lokal=False):
        self.prio, self.undantag, self.json, self.kalla, self.lokal = prio, undantag, json_, kalla, lokal


def convert_rule(r, kalla, s, native):
    """En DNR-regel -> (nätregler, sidregler). Nätregler gäller allt utom huvudsidan, sidregler huvudsidan."""
    a = r['action']['type']
    c = r['condition']
    prio = r.get('priority', 1)
    if a == 'modifyHeaders':
        s['tappad_modifyHeaders'] += 1
        return [], []
    if a == 'block':
        act = {'type': 'block'}
    elif a == 'upgradeScheme':
        act = {'type': 'make-https'}
    elif a == 'redirect':
        ep = r['action'].get('redirect', {}).get('extensionPath', '')
        if ep.startswith('/stubbar/'):
            act = {'type': 'block'}
            s['närmad_omdirigering_till_stubbe_som_block'] += 1
        elif ep == '/blocked/blocked.html':
            act = {'type': 'block'}
            s['stoppsida'] += 1
        else:
            s['tappad_omdirigering_transform_eller_url'] += 1
            return [], []
    elif a in ('allow', 'allowAllRequests'):
        act = {'type': 'ignore-previous-rules'}
    else:
        s['tappad_okänd_åtgärd_' + a] += 1
        return [], []
    undantag = act['type'] == 'ignore-previous-rules'

    dnr_typer, explicit = typer_for(c)
    huvud = 'main_frame' in dnr_typer
    inc = domains(c.get('initiatorDomains'))
    exc = domains(c.get('excludedInitiatorDomains'))
    dt = c.get('domainType')

    # Huvudsidan med initiatorDomains går inte att uttrycka i WebKit (där är toppadressen den nya adressen).
    # "Annonsvärd skickar hela fliken till en annan sajt" görs i stället native (Skydd.beslut).
    if huvud and c.get('initiatorDomains'):
        if dnr_typer == ['main_frame'] and a == 'redirect' and dt == 'thirdParty' and not c.get('urlFilter') \
                and not c.get('regexFilter') and not c.get('requestDomains'):
            for d in c['initiatorDomains']:
                d = ren_vard(d)
                if d:
                    native['initiativ'].add(d)
            s['native_annonsvärd_skickar_fliken_vidare'] += 1
            return [], []
        s['tappad_huvudsidedel_med_initiatorDomains'] += 1
        huvud = False
        dnr_typer = [t for t in dnr_typer if t != 'main_frame']
        if not dnr_typer:
            return [], []
    if huvud and c.get('excludedInitiatorDomains'):
        s['närmad_huvudsida_utan_excludedInitiatorDomains'] += 1
    if huvud and dt == 'thirdParty' and a != 'allowAllRequests':
        s['tappad_huvudsidedel_tredjepart_(alltid_förstapart_i_webkit)'] += 1
        huvud = False
        dnr_typer = [t for t in dnr_typer if t != 'main_frame']
        if not dnr_typer:
            return [], []

    filters = filter_for(c, s)
    bra = [f for f in filters if f == '.*' or webkit_regex_ok(f)]
    if len(bra) < len(filters):
        s['tappad_ogiltigt_filter'] += len(filters) - len(bra)
    if not bra:
        s['tappad_utan_filter'] += 1
        return [], []

    bas = {}
    if c.get('isUrlFilterCaseSensitive'):
        bas['url-filter-is-case-sensitive'] = True
    if inc or exc:
        s['närmad_initiator_som_toppdomän'] += 1

    nat, sid = [], []

    if a == 'allowAllRequests':
        # Hela sidor undantas: url-filter .* med if-top-url = sidans adress (nätlistorna), och sidan själv (sidor).
        # Ramar (sub_frame) går inte utan if-frame-url, som vi inte använder.
        if 'sub_frame' in dnr_typer:
            s['tappad_allowAllRequests_ramdel'] += 1
        if not huvud:
            return [], []
        for f in bra:
            if f == '.*':
                s['tappad_allowAllRequests_utan_filter'] += 1
                continue
            nat.append(Regel(prio, True, {'trigger': {'url-filter': '.*', 'if-top-url': [f]},
                                          'action': {'type': 'ignore-previous-rules'}}, kalla))
            t = {'url-filter': f}
            t.update(HUVUDSIDA)
            sid.append(Regel(prio, True, {'trigger': t, 'action': {'type': 'ignore-previous-rules'}}, kalla))
        s['närmad_allowAllRequests_som_if_top_url'] += 1
        return nat, sid

    # ---- huvudsidan (listan "sidor")
    if huvud:
        for f in bra:
            t = dict(bas)
            t['url-filter'] = f
            t.update(HUVUDSIDA)
            sid.append(Regel(prio, undantag, {'trigger': t, 'action': dict(act)}, kalla))
            if undantag:
                continue
            for xd in c.get('excludedRequestDomains', []) or []:
                x = ren_vard(xd)
                if x:
                    t3 = dict(bas)
                    t3['url-filter'] = vard_regex(x)
                    t3.update(HUVUDSIDA)
                    sid.append(Regel(prio, True, {'trigger': t3, 'action': {'type': 'ignore-previous-rules'}},
                                     kalla, lokal=True))

    # ---- allt utom huvudsidan (nätlistorna)
    ovriga = [t for t in dnr_typer if t != 'main_frame']
    if ovriga:
        wt = wk_typer(ovriga, s, explicit)
        if not wt:
            s['tappad_inga_resurstyper_kvar'] += 1
        else:
            t_bas = dict(bas)
            if dt:
                t_bas['load-type'] = ['third-party' if dt == 'thirdParty' else 'first-party']
            if explicit:
                t_bas['resource-type'] = wt
            for f in bra:
                t = dict(t_bas)
                t['url-filter'] = f
                if inc:
                    t['if-domain'] = inc
                elif exc:
                    t['unless-domain'] = exc
                nat.append(Regel(prio, undantag, {'trigger': t, 'action': dict(act)}, kalla))
                if undantag:
                    continue
                if inc and exc:
                    t2 = dict(t_bas)
                    t2['url-filter'] = f
                    t2['if-domain'] = exc
                    nat.append(Regel(prio, True, {'trigger': t2, 'action': {'type': 'ignore-previous-rules'}},
                                     kalla, lokal=True))
                for xd in c.get('excludedRequestDomains', []) or []:
                    x = ren_vard(xd)
                    if not x:
                        continue
                    t3 = dict(t_bas)
                    t3['url-filter'] = vard_regex(x)
                    if inc:
                        t3['if-domain'] = inc
                    nat.append(Regel(prio, True, {'trigger': t3, 'action': {'type': 'ignore-previous-rules'}},
                                     kalla, lokal=True))
                    s['närmad_excludedRequestDomains'] += 1
    return nat, sid


def ordna(regler):
    """DNR: högre prioritet vinner, undantag vinner vid samma prioritet. WebKit: ordningen avgör och
    ignore-previous-rules släcker TIDIGARE träffar. -> stigande prioritet, undantagen sist inom varje."""
    return sorted(regler, key=lambda r: (r.prio, 1 if r.undantag else 0))


# ------------------------------------------------- tillåtlistor (datorn)

def las_main_js(browser):
    src = open(os.path.join(browser, 'main.js'), encoding='utf-8').read()

    def lista(namn):
        m = re.search(r'const ' + namn + r' = /\(\^\|\\\.\)\(([^)]*)\)\$/i;', src)
        if not m:
            raise SystemExit(f'dnr2wk: hittar inte {namn} i main.js (har formatet ändrats?)')
        return [h.replace('\\.', '.').lower() for h in m.group(1).split('|')]

    tillat = lista('ADBLOCK_ALLOW')
    popup = lista('POPUP_TRUSTED')
    m = re.search(r'const ADBLOCK_ALLOW_PATH = /\^https:\\/\\/\(www\\\.\)\?\(([^)]*)\)\\/\(([^)]*)\)\\//i;', src)
    if not m:
        raise SystemExit('dnr2wk: hittar inte ADBLOCK_ALLOW_PATH i main.js (har formatet ändrats?)')
    vag_vardar = [h.replace('\\.', '.') for h in m.group(1).split('|')]
    vagar = m.group(2).split('|')
    return {'tillat': tillat, 'vagVardar': vag_vardar, 'vagar': vagar, 'popupBetrodda': popup}


def tillatregler(inlogg, med_sidor):
    """Datorns adblockAllowHost: förfrågningar TILL och sidor PÅ inloggnings- och betalvärdar blockeras aldrig."""
    out = []
    for h in inlogg['tillat']:
        t = {'url-filter': vard_regex(h)}
        out.append({'trigger': t, 'action': {'type': 'ignore-previous-rules'}})
    for h in inlogg['vagVardar']:
        for v in inlogg['vagar']:
            t = {'url-filter': '^https://(www\\.)?' + esc_domain(h) + '/' + esc_text(v) + '/'}
            out.append({'trigger': t, 'action': {'type': 'ignore-previous-rules'}})
    if med_sidor:
        out.append({'trigger': {'url-filter': '.*', 'if-domain': ['*' + h for h in inlogg['tillat']]},
                    'action': {'type': 'ignore-previous-rules'}})
    return out


def sidtillat(inlogg):
    """Sidor på tillåtna värdar i kosmetik- och kakrutelistorna (datorn kör ingen kosmetik där)."""
    return [{'trigger': {'url-filter': '.*', 'if-domain': ['*' + h for h in inlogg['tillat']]},
             'action': {'type': 'ignore-previous-rules'}}]


# -------------------------------------------------------------- kosmetik

def selektor_ok(sel):
    return bool(sel) and all(ord(ch) < 128 for ch in sel) and '\n' not in sel


def convert_generic(cos, s, name):
    exc_by_sel = defaultdict(set)
    for dom, sels in cos.get('exceptions', {}).items():
        w = wk_domain(dom)
        if not w:
            continue
        for sel in sels:
            exc_by_sel[sel].add(w)
    out = []
    for sel in cos.get('generic', []):
        if not selektor_ok(sel):
            s[name + '_tappad_selektor'] += 1
            continue
        t = {'url-filter': '.*'}
        if sel in exc_by_sel:
            t['unless-domain'] = sorted(exc_by_sel[sel])
            s[name + '_selektor_med_undantag'] += 1
        out.append({'trigger': t, 'action': {'type': 'css-display-none', 'selector': sel}})
    ghe = domains(cos.get('genericHideExceptions', []))
    if ghe:
        out.append({'trigger': {'url-filter': '.*', 'if-domain': ghe}, 'action': {'type': 'ignore-previous-rules'}})
    return out


def fnv1a(s):
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return h


# -------------------------------------------------------------- skript

D_RAD = re.compile(r'^  var D = (.*);$', re.M)
D_PLATS = '__ADRAZE_D__'


def las_scriptlets(ext):
    lista = json.load(open(os.path.join(ext, 'data', 'scriptlets.json')))
    ut = []
    for post in lista:
        fil = os.path.join(ext, post['js'])
        text = open(fil, encoding='utf-8').read()
        m = D_RAD.search(text)
        if not m:
            raise SystemExit(f'dnr2wk: hittar inte "var D = ..." i {fil}')
        D = json.loads(m.group(1))
        mall = text[:m.start(1)] + D_PLATS + text[m.end(1):]
        if mall.count(D_PLATS) != 1:
            raise SystemExit(f'dnr2wk: platshållaren finns redan i {fil}')
        namn = os.path.splitext(os.path.basename(post['js']))[0]
        ut.append({'namn': namn, 'id': post['id'], 'mall': mall, 'D': D, 'vardar': post['vardar']})
    return ut


def las_mall(text, namn):
    m = re.search(r'const ' + namn + r' = `([^`]*)`;', text)
    if not m:
        raise SystemExit(f'dnr2wk: hittar inte {namn} i background.js')
    return m.group(1).replace('\\n', '\n')


def las_kak_dolj(text):
    m = re.search(r'const KAK_DOLJ = \{(.*?)\n\};', text, re.S)
    if not m:
        raise SystemExit('dnr2wk: hittar inte KAK_DOLJ i background.js')
    ut = {}
    for nm, css in re.findall(r'(\w+): `([^`]*)`', m.group(1)):
        ut[nm] = css
    if not ut:
        raise SystemExit('dnr2wk: KAK_DOLJ är tom')
    return ut


# -------------------------------------------------------------- parametrar

def convert_parametrar(rules, s):
    out = []
    for r in rules:
        c = r['condition']
        red = r['action'].get('redirect', {})
        q = red.get('transform', {}).get('queryTransform', {})
        bort = q.get('removeParams')
        if not bort or set(red) != {'transform'} or set(red['transform']) != {'queryTransform'} or set(q) != {'removeParams'}:
            s['parametrar_tappad_annan_omvandling'] += 1
            continue
        if 'regexFilter' in c:
            try:
                fs = regexfilter_to_webkit(c['regexFilter'])
            except Fel:
                s['parametrar_tappad_regex'] += 1
                continue
        else:
            f = filter_for(c, s)
            fs = [x for x in f if x == '.*' or webkit_regex_ok(x)]
        if not fs:
            s['parametrar_tappad_filter'] += 1
            continue
        typer, _ = typer_for(c)
        post = {'re': fs, 'typer': [t for t in typer if t in ('main_frame', 'sub_frame', 'xmlhttprequest')],
                'bort': bort, 'prio': r.get('priority', 1)}
        # Domänen förfrågan går till, om alla filter börjar med ||domän (appen väljer regler per sajt med den)
        dom = set()
        for f in fs:
            m = re.match(re.escape(DOMAIN_ANCHOR) + r'((?:[a-z0-9-]|\\\.)+)', f)
            dom.add(m.group(1).replace('\\.', '.') if m else None)
        if len(dom) == 1 and None not in dom:
            post['doman'] = dom.pop()
        if not post['typer']:
            s['parametrar_tappad_typ'] += 1
            continue
        if c.get('initiatorDomains'):
            post['init'] = [ren_vard(d) for d in c['initiatorDomains'] if ren_vard(d)]
        if c.get('excludedInitiatorDomains'):
            post['uninit'] = [ren_vard(d) for d in c['excludedInitiatorDomains'] if ren_vard(d)]
        if c.get('domainType'):
            post['tredje'] = c['domainType'] == 'thirdParty'
        if c.get('isUrlFilterCaseSensitive'):
            post['skiftlage'] = True
        out.append(post)
        s['parametrar_ok'] += 1
    return out


# -------------------------------------------------------------- huvudprogram

def skriv_json(sok, data, kompakt=True):
    os.makedirs(os.path.dirname(sok), exist_ok=True)
    with open(sok, 'w', encoding='utf-8') as fh:
        if kompakt:
            json.dump(data, fh, ensure_ascii=True, separators=(',', ':'))
        else:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.write('\n')


def sha256(sok):
    h = hashlib.sha256()
    with open(sok, 'rb') as fh:
        for bit in iter(lambda: fh.read(1 << 20), b''):
            h.update(bit)
    return h.hexdigest()


def main():
    ext = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 else EXT
    browser = os.path.expanduser(sys.argv[2]) if len(sys.argv) > 2 else BROWSER
    dst = os.path.abspath(os.path.expanduser(sys.argv[3]) if len(sys.argv) > 3 else UT)
    os.makedirs(dst, exist_ok=True)
    rapport = {'källa': ext, 'max_per_lista': MAX_PER_LIST, 'listor': {}, 'statistik': {}, 'varningar': []}

    # Datorns kopia ska vara densamma
    kopia = os.path.join(browser, 'adraze')
    for rel in ['rules/ads.json', 'rules/privacy.json', 'rules/security.json', 'rules/parametrar.json',
                'data/cosmetic.json', 'data/kakor.json', 'data/popup-hosts.json',
                'content/guard.js', 'content/kakor.js', 'content/youtube.js']:
        a, b = os.path.join(ext, rel), os.path.join(kopia, rel)
        if os.path.exists(b) and open(a, 'rb').read() != open(b, 'rb').read():
            v = f'{rel} skiljer sig mellan tillägget och browser/adraze (kör npm run sync på datorn?)'
            rapport['varningar'].append(v)
            print('varning:', v)

    inlogg = las_main_js(browser)
    bg = open(os.path.join(ext, 'background.js'), encoding='utf-8').read()
    if '||youtube.com/pagead/adview' not in bg:
        raise SystemExit('dnr2wk: YouTubes adview-undantag finns inte längre i background.js, kolla synken')

    # ---- nätlistor och sidlistan
    s = Counter()
    native = {'initiativ': set()}
    block = {}
    lokala = {}
    undantag_alla = []   # DNR:s allow-regler gäller över alla regelpaket (som i tillägget och på datorn)
    sid_alla = []
    for namn in ('ads', 'privacy', 'security'):
        rules = json.load(open(os.path.join(ext, 'rules', namn + '.json')))
        s['dnr_regler_in_' + namn] += len(rules)
        block[namn] = []
        lokala[namn] = []
        for r in rules:
            nat, sid = convert_rule(r, namn, s, native)
            for x in nat:
                if not x.undantag:
                    block[namn].append(x)
                elif x.lokal:
                    lokala[namn].append(x)
                else:
                    undantag_alla.append(x)
            sid_alla.extend(sid)

    # YouTube: släpp igenom kvittot på att reklamen visats (som tilläggets dynamiska regel 2 i background.js)
    youtube_adview = {'trigger': {'url-filter': DOMAIN_ANCHOR + 'youtube\\.com/pagead/adview'},
                      'action': {'type': 'ignore-previous-rules'}}
    slut_nat = tillatregler(inlogg, True) + [youtube_adview, SPARR_HUVUDSIDA]
    listor = {}
    for namn in ('ads', 'privacy', 'security'):
        egna = block[namn]
        plats = MAX_PER_LIST - len(undantag_alla) - len(lokala[namn]) - len(slut_nat)
        if plats <= 0:
            raise SystemExit('dnr2wk: undantagen ensamma är fler än 150 000')
        delar = [egna[i:i + plats] for i in range(0, len(egna), plats)] or [[]]
        for k, del_ in enumerate(delar):
            ln = namn if len(delar) == 1 else f'{namn}-{k + 1}'
            regler = [x.json for x in ordna(del_ + lokala[namn] + undantag_alla)] + slut_nat
            listor[ln] = regler
    s['undantag_i_varje_nätlista'] = len(undantag_alla)

    # Sidlistan: huvudsidor som ger stoppsidan
    sidor = [x.json for x in ordna(sid_alla)]
    for d in SNABBKOLL:
        sidor.append({'trigger': {'url-filter': vard_regex(d), **HUVUDSIDA}, 'action': {'type': 'block'}})
    sidor.append({'trigger': {'url-filter': '^https://' + esc_domain(STOPP_VARD) + '/stopp', **HUVUDSIDA},
                  'action': {'type': 'block'}})
    for t in tillatregler(inlogg, False):
        t['trigger'].update(HUVUDSIDA)
        sidor.append(t)
    listor['sidor'] = sidor

    # Kosmetik och kakrutor (generiska dölj-regler, WebKits globala stilmall)
    cos = json.load(open(os.path.join(ext, 'data', 'cosmetic.json')))
    kak = json.load(open(os.path.join(ext, 'data', 'kakor.json')))
    listor['kosmetik'] = convert_generic(cos, s, 'kosmetik') + sidtillat(inlogg)
    listor['kakor'] = convert_generic(kak, s, 'kakor') + sidtillat(inlogg)

    # Popup-fönster till popup-nätverken (window.open)
    popup_hosts = [h for h in (ren_vard(x) for x in json.load(open(os.path.join(ext, 'data', 'popup-hosts.json')))) if h]
    listor['popup'] = [{'trigger': {'url-filter': vard_regex(h), 'resource-type': ['popup']}, 'action': {'type': 'block'}}
                       for h in popup_hosts]

    # ---- skriv listorna
    ordning = ['sidor', 'security'] + [n for n in listor if n.startswith('security-')] + \
              [n for n in listor if n == 'ads' or n.startswith('ads-')] + \
              [n for n in listor if n == 'privacy' or n.startswith('privacy-')] + ['kosmetik', 'kakor', 'popup']
    listdir = os.path.join(dst, 'listor')
    os.makedirs(listdir, exist_ok=True)
    for f in os.listdir(listdir):
        if f.endswith('.json'):
            os.remove(os.path.join(listdir, f))
    manifest = []
    for namn in ordning:
        regler = listor[namn]
        if len(regler) > MAX_PER_LIST:
            raise SystemExit(f'dnr2wk: {namn} har {len(regler)} regler (> {MAX_PER_LIST})')
        for r in regler:
            uf = r['trigger']['url-filter']
            if uf != '.*' and not webkit_regex_ok(uf):
                raise SystemExit(f'dnr2wk: ogiltigt url-filter i {namn}: {uf}')
        fil = namn + '.json'
        sok = os.path.join(listdir, fil)
        skriv_json(sok, regler)
        post = {'namn': namn, 'fil': 'listor/' + fil, 'regler': len(regler), 'byte': os.path.getsize(sok),
                'sha256': sha256(sok)}
        manifest.append(post)
        rapport['listor'][namn] = {k: post[k] for k in ('regler', 'byte')}
        print(f'{namn:12} {len(regler):7d} WebKit-regler  {post["byte"] / 1e6:6.2f} MB')
    skriv_json(os.path.join(listdir, 'manifest.json'), {'version': 1, 'listor': manifest}, kompakt=False)

    # ---- per-värd-data i hinkar
    scriptlets = las_scriptlets(ext)
    hinkar = [defaultdict(dict) for _ in range(HINKAR)]

    def post_for(vard):
        v = ren_vard(vard)
        if not v:
            return None
        return hinkar[fnv1a(v) % HINKAR][v]

    for kalla, pre in ((cos, 'c'), (kak, 'k')):
        for vard, sels in kalla.get('specific', {}).items():
            p = post_for(vard)
            sels = [x for x in sels if selektor_ok(x)]
            if p is not None and sels:
                p[pre] = sels
        for vard, sels in kalla.get('exceptions', {}).items():
            p = post_for(vard)
            if p is not None and sels:
                p[pre + 'x'] = sels
        for vard, st in kalla.get('styles', {}).items():
            p = post_for(vard)
            st = [x for x in st if len(x) == 2 and selektor_ok(x[0]) and '}' not in x[1] and '{' not in x[1]]
            if p is not None and st:
                p[pre + 's'] = st
    for vard in cos.get('genericHideExceptions', []):
        p = post_for(vard)
        if p is not None:
            p['gh'] = 1
    for i, sl in enumerate(scriptlets):
        D = sl['D']
        alla = set(D['v']) | set(D.get('u', {}))
        for vard in alla:
            p = post_for(vard)
            if p is None:
                s['scriptlet_ogiltig_värd'] += 1
                continue
            e = {}
            if D['v'].get(vard):
                e['v'] = [D['a'][j] for j in D['v'][vard]]
            if D.get('u', {}).get(vard):
                e['u'] = [-1 if j == -1 else D['a'][j] for j in D['u'][vard]]
            if e:
                p.setdefault('s', {})[str(i)] = e
    hinkdir = os.path.join(dst, 'data', 'sajter')
    os.makedirs(hinkdir, exist_ok=True)
    for f in os.listdir(hinkdir):
        os.remove(os.path.join(hinkdir, f))
    vardar = 0
    for i, h in enumerate(hinkar):
        vardar += len(h)
        skriv_json(os.path.join(hinkdir, f'{i:03d}.json'), h)
    s['sajtdata_värdar'] = vardar

    # ---- native data
    initiativ = sorted(native['initiativ'])
    with open(os.path.join(dst, 'data', 'initiativ.txt'), 'w') as fh:
        fh.write('\n'.join(initiativ) + '\n')
    with open(os.path.join(dst, 'data', 'popup.txt'), 'w') as fh:
        fh.write('\n'.join(popup_hosts) + '\n')
    s['native_initiativvärdar'] = len(initiativ)
    s['native_popupvärdar'] = len(popup_hosts)
    par = convert_parametrar(json.load(open(os.path.join(ext, 'rules', 'parametrar.json'))), s)
    skriv_json(os.path.join(dst, 'data', 'parametrar.json'), par)
    skriv_json(os.path.join(dst, 'data', 'inlogg.json'), inlogg, kompakt=False)
    skriv_json(os.path.join(dst, 'data', 'kakor.json'),
               {'upplas': las_mall(bg, 'KAK_UPPLAS'), 'dolj': las_kak_dolj(bg)}, kompakt=False)

    # ---- skript
    skriptdir = os.path.join(dst, 'skript')
    os.makedirs(os.path.join(skriptdir, 'scriptlets'), exist_ok=True)
    for f in os.listdir(os.path.join(skriptdir, 'scriptlets')):
        os.remove(os.path.join(skriptdir, 'scriptlets', f))
    for kalla, mal in (('guard.js', 'vakt.js'), ('kakor.js', 'kakor.js'), ('youtube.js', 'youtube.js')):
        with open(os.path.join(ext, 'content', kalla), encoding='utf-8') as fh:
            text = fh.read()
        with open(os.path.join(skriptdir, mal), 'w', encoding='utf-8') as fh:
            fh.write(text)
    for sl in scriptlets:
        with open(os.path.join(skriptdir, 'scriptlets', sl['namn'] + '.js'), 'w', encoding='utf-8') as fh:
            fh.write(sl['mall'])
    skriv_json(os.path.join(skriptdir, 'scriptlets.json'), [sl['namn'] for sl in scriptlets], kompakt=False)

    # ---- testdata till självtestet
    prov = valj_prov(cos, kak, scriptlets, listor, inlogg, initiativ, popup_hosts, par, s)
    skriv_json(os.path.join(dst, 'prov.json'), prov, kompakt=False)

    rapport['statistik'] = dict(sorted(s.items()))
    rapport['totalt_webkit_regler'] = sum(len(v) for v in listor.values())
    skriv_json(os.path.join(dst, 'konvertering.json'), rapport, kompakt=False)
    print(f'totalt {rapport["totalt_webkit_regler"]} WebKit-regler, {vardar} värdar med sajtdata, '
          f'{len(initiativ)} initiativvärdar, {len(par)} parameterregler')


# -------------------------------------------------------------- testdata

def bas_doman(h):
    d = h.split('.')
    return '.'.join(d[-3:]) if len(d) > 2 and d[-2] in ('co', 'com', 'org', 'net', 'gov', 'ac', 'edu') and len(d[-1]) == 2 \
        else '.'.join(d[-2:])


class Matchare:
    """Grov efterapning av WebKit för att välja testadresser: regler i ordning, block sätter, ignore-previous-rules
    släcker. Förfiltrerar på den längsta bokstavsföljden i regexen så att 150 000 regler går fort."""

    def __init__(self, lista):
        self.regler = []
        for r in lista:
            uf = r['trigger']['url-filter']
            enkel = re.sub(r'\[[^\]]*\]', ' ', uf.replace('\\.', '.')).lower()
            nal = max(re.findall(r'[a-z0-9]{3,}', enkel), key=len, default='')
            self.regler.append((nal, r))

    def blockerad(self, url, typ, topp, huvudsida=False):
        lurl = url.lower()
        vard = re.match(r'^[a-z]+://([^/:?#]+)', lurl).group(1)
        tredje = bas_doman(vard) != bas_doman(topp)
        blockad = False
        for nal, r in self.regler:
            if nal and nal not in lurl:
                continue
            t = r['trigger']
            rt = t.get('resource-type')
            if huvudsida:
                if t.get('load-context') == ['child-frame'] or (rt and 'document' not in rt):
                    continue
            else:
                if t.get('load-context') == ['top-frame'] and rt == ['document']:
                    continue
                if rt and typ not in rt:
                    continue
            if 'if-domain' in t and not any(topp == d[1:] or topp.endswith('.' + d[1:]) for d in t['if-domain']):
                continue
            if 'unless-domain' in t and any(topp == d[1:] or topp.endswith('.' + d[1:]) for d in t['unless-domain']):
                continue
            if 'if-top-url' in t:
                continue
            lt = t.get('load-type')
            if lt and (lt == ['third-party']) != tredje:
                continue
            if not re.search(t['url-filter'], url, 0 if t.get('url-filter-is-case-sensitive') else re.I):
                continue
            typ_ = r['action']['type']
            if typ_ == 'block':
                blockad = True
            elif typ_ == 'ignore-previous-rules':
                blockad = False
        return blockad


def valj_prov(cos, kak, scriptlets, listor, inlogg, initiativ, popup_hosts, par, s):
    # Blocktestets mål. satt = hur sidan laddar adressen: "skript" (<link rel=preload as=script>, körs inte),
    # "bild" (<img>) eller "fetch" (fetch no-cors). WebKit-typen avgör vilka regler som gäller. Adresser som inte
    # svarar med en bild (spårpixlar, 404) laddas med fetch, som lyckas för alla HTTP-svar.
    mal = [
        ('reklam', 'skript', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'),
        ('reklam', 'skript', 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'),
        ('reklam', 'skript', 'https://cdn.taboola.com/libtrc/loader.js'),
        ('reklam', 'skript', 'https://c.amazon-adsystem.com/aax2/apstag.js'),
        ('reklam', 'skript', 'https://static.criteo.net/js/ld/publishertag.js'),
        ('reklam', 'skript', 'https://widgets.outbrain.com/outbrain.js'),
        ('reklam', 'bild', 'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123/?random=1'),
        ('reklam', 'fetch', 'https://ib.adnxs.com/ut/v3/prebid'),
        ('spårare', 'skript', 'https://www.google-analytics.com/analytics.js'),
        ('spårare', 'skript', 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123'),
        ('spårare', 'skript', 'https://connect.facebook.net/en_US/fbevents.js'),
        ('spårare', 'skript', 'https://static.hotjar.com/c/hotjar-123.js?sv=6'),
        ('spårare', 'skript', 'https://bat.bing.com/bat.js'),
        ('spårare', 'skript', 'https://sb.scorecardresearch.com/beacon.js'),
        ('spårare', 'fetch', 'https://www.facebook.com/tr?id=123&ev=PageView&noscript=1'),
        ('spårare', 'fetch', 'https://region1.google-analytics.com/g/collect?v=2&tid=G-ABC'),
        ('kontroll', 'bild', 'https://www.wikipedia.org/static/favicon/wikipedia.ico'),
        ('kontroll', 'bild', 'https://www.apple.com/favicon.ico'),
        ('kontroll', 'bild', 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png'),
        ('kontroll', 'skript', 'https://code.jquery.com/jquery-3.7.1.min.js'),
        ('inloggning', 'skript', 'https://www.google.com/recaptcha/api.js'),
        ('inloggning', 'skript', 'https://js.stripe.com/v3/'),
        ('inloggning', 'skript', 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'),
        ('inloggning', 'skript', 'https://www.paypalobjects.com/api/checkout.js'),
        ('inloggning', 'fetch', 'https://collector.github.com/github/collect'),
        ('inloggning', 'fetch', 'https://i.paypal.com/x.gif'),
    ]
    wk_typ = {'skript': 'script', 'bild': 'image', 'fetch': 'fetch'}
    nat_namn = [n for n in listor if n.split('-')[0] in ('ads', 'privacy', 'security')]
    nat = Matchare([r for n in nat_namn for r in listor[n]])
    antal_tillat = len(tillatregler(inlogg, True)) + 2
    utan = Matchare([r for n in nat_namn for r in listor[n][:-antal_tillat]])
    topp = 'blocktest.adraze.test'
    block = []
    for typ, satt, url in mal:
        v = nat.blockerad(url, wk_typ[satt], topp)
        post = {'typ': typ, 'satt': satt, 'url': url, 'vantat': 'blockerad' if v else 'nådd'}
        if typ == 'inloggning':
            post['utanTillatlistan'] = 'blockerad' if utan.blockerad(url, wk_typ[satt], topp) else 'nådd'
        block.append(post)
        if typ in ('reklam', 'spårare') and not v:
            s['prov_varning_mål_utan_regel'] += 1
            print('varning: testadressen matchar ingen regel:', url)
        if typ in ('kontroll', 'inloggning') and v:
            print('varning: kontrolladressen blockeras:', url)

    # Generisk selektor: enkel klass eller id utan undantag
    undantagna = {sel for sels in cos.get('exceptions', {}).values() for sel in sels}
    enkla = [x for x in cos['generic'] if re.fullmatch(r'[.#][A-Za-z][A-Za-z0-9_-]{4,30}', x) and x not in undantagna]
    generiska = [x for x in enkla if x[0] == '#'][:2] + [x for x in enkla if x[0] == '.' and 'ad' in x.lower()][:3]
    # Sajtspecifik: en värd med bara enkla selektorer som INTE är generiska
    gen = set(cos['generic'])
    sajt = None
    for vard, sels in sorted(cos['specific'].items()):
        if not re.fullmatch(r'[a-z0-9-]+\.(com|se|net|org)', vard) or vard in cos.get('exceptions', {}):
            continue
        ok = [x for x in sels if re.fullmatch(r'[.#][A-Za-z][A-Za-z0-9_-]{4,30}', x) and x not in gen]
        if len(ok) >= 2 and vard not in cos.get('genericHideExceptions', []):
            sajt = {'vard': vard, 'selektorer': ok[:3]}
            break
    # Värd där generiska regler är avstängda
    gh = next(v for v in sorted(cos.get('genericHideExceptions', [])) if re.fullmatch(r'[a-z0-9-]+\.(com|se|net|org)', v))
    # Stilregel
    stil = None
    for vard, st in sorted(cos.get('styles', {}).items()):
        if re.fullmatch(r'[a-z0-9-]+\.(com|se|net|org)', vard):
            for sel, decl in st:
                m = re.fullmatch(r'\s*height\s*:\s*(\d+)px\s*!important\s*', decl)
                if m and re.fullmatch(r'[.#][A-Za-z][A-Za-z0-9_-]{2,30}', sel) and sel not in gen:
                    stil = {'vard': vard, 'selektor': sel, 'egenskap': 'height', 'varde': m.group(1) + 'px'}
                    break
        if stil:
            break
    # Kakruta (generisk)
    kakor = [x for x in kak['generic'] if re.fullmatch(r'#[A-Za-z][A-Za-z0-9_-]{4,30}', x)][:2]
    # Scriptlet: set-constant med "true"/"false" på en enkel värd
    sc = None
    idx = next(i for i, x in enumerate(scriptlets) if x['namn'] == 'set-constant')
    D = scriptlets[idx]['D']
    for vard in sorted(D['v']):
        if not re.fullmatch(r'[a-z0-9-]+\.(com|se|net|org)', vard) or D.get('u', {}).get(vard):
            continue
        for j in D['v'][vard]:
            e = D['a'][j]
            if len(e) == 3 and e[2] in ('true', 'false') and re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]{3,40}', e[1]):
                sc = {'vard': vard, 'egenskap': e[1], 'varde': e[2] == 'true'}
                break
        if sc:
            break
    # Stoppsidan: en farlig värd ur säkerhetslistans domänregler, som listan "sidor" verkligen stoppar
    sidor = listor['sidor']
    sidmatch = Matchare(sidor)
    farlig = None
    for r in reversed(sidor):
        uf = r['trigger']['url-filter']
        m = re.fullmatch(re.escape(DOMAIN_ANCHOR) + r'([a-z0-9\\.-]+)' + re.escape(SEP), uf)
        if m and r['action']['type'] == 'block':
            d = m.group(1).replace('\\.', '.')
            if re.fullmatch(r'[a-z0-9-]+\.(com|net)', d) and d not in SNABBKOLL and \
                    sidmatch.blockerad('https://' + d + '/', 'document', d, huvudsida=True):
                farlig = d
                break
    # Annonsvärd som inte får skicka fliken vidare (och som själv går att öppna)
    ini = next(v for v in initiativ if re.fullmatch(r'[a-z0-9-]+\.(com|net)', v) and v not in popup_hosts
               and not sidmatch.blockerad('https://' + v + '/', 'document', v, huvudsida=True))
    # Spårningsparameter på en huvudsida (helst YouTube, annars första regeln utan initiator med en domän)
    kand = [x for x in par if 'main_frame' in x['typer'] and not x.get('init') and not x.get('tredje') is True
            and x.get('doman') and len(x['re']) == 1]
    p = next((x for x in kand if x['doman'] == 'youtube.com'), kand[0] if kand else None)
    if p:
        vag = '/@adraze' if p['doman'] == 'youtube.com' else '/'
        fore = 'https://www.' + p['doman'] + vag + '?' + p['bort'][0] + '=1&adraze=prov'
        if not any(re.search(rx, fore, 0 if p.get('skiftlage') else re.I) for rx in p['re']):
            fore = 'https://' + p['doman'] + vag + '?' + p['bort'][0] + '=1&adraze=prov'
        p = {'regel': p, 'fore': fore, 'efter': fore.replace(p['bort'][0] + '=1&', '')}
    return {
        'blocktest': {'topp': 'blocktest.adraze.test', 'mal': block},
        'kosmetik': {'generiska': generiska, 'sajt': sajt, 'utanGeneriska': gh, 'stil': stil, 'kakor': kakor},
        'scriptlet': sc,
        'stoppsida': {'farlig': farlig, 'snabbkoll': SNABBKOLL[0], 'snabbkollAndra': SNABBKOLL[1]},
        'initiativ': ini,
        'parameter': p,
        'inlogg': {'vard': 'accounts.google.com'},
    }


if __name__ == '__main__':
    main()
