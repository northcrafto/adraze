#!/bin/bash
# fran-mint.sh – körs på mint: synkar ~/adraze/ios till Macen (mac:~/adraze-ios), bygger och kör ett självtest där
# med bygg-sim.sh, och hämtar hem resultatet, skärmbilderna och loggarna.
#
#   ./fran-mint.sh [flaggor] [NAMN [MAPP]] [-- argument till appen]
#
#   NAMN      självtestet som körs (-mode NAMN). Utan NAMN (eller "-"): bara bygget, ingen simulator.
#   MAPP      vart filerna hämtas (standard ./build-fran-mac):
#               MAPP/PREFIX.png             simulatorns skärmbild när testet är klart
#               MAPP/PREFIX-resultat.json   resultatet (Documents/resultat-NAMN.json)
#               MAPP/PREFIX-<bild>.png      appens egna skärmbilder (k.skarmbild("<bild>"))
#               MAPP/PREFIX-logg.txt        appens utskrifter (stdout och stderr)
#               MAPP/PREFIX-bygg.txt        sammanfattningen från bygg-sim.sh (kompileringsfel står här)
#   -n PREFIX början på filnamnen (standard NAMN, "bygg" utan NAMN)
#   -x MODUL  bygg utan App/MODUL (går att upprepa), t.ex. när en annan modul inte kompilerar just nu
#   -B -R -k -e -t -r -m -d   till bygg-sim.sh (bygg inte om, rent bygge, låt simulatorn vara igång, simulator,
#             enhetstyp, runtime, längsta väntan, väntan före skärmbild)
#
# Exempel:
#   ./fran-mint.sh rok ~/adraze-app/skarm                    # bygg, kör -mode rok, hämta till ~/adraze-app/skarm
#   ./fran-mint.sh -n steg1-skydd skydd ~/adraze-app/skarm
#   ./fran-mint.sh -x Chatt                                  # bara bygget, utan App/Chatt
#   ./fran-mint.sh rok /tmp/ut -- -url https://adraze.app/   # extra startargument till appen
#
# Bara ett bygge åt gången: skriptet väntar på /tmp/adraze-ios-fran-mint.lock på mint (släpps av sig självt om
# processen dör) och bygg-sim.sh på låset /tmp/adraze-ios-bygg.lock på Macen. Synken tar bort filer på Macen som
# inte finns här (utom build/, Genererat/ och AdRaze.xcodeproj som skapas där).
# Slutkod: 0 = klart (och testet ok), 1 = bygget eller körningen misslyckades, 4 = testet kördes men misslyckades.
# Miljö: MAC (standard mac), MAL (katalog på Macen, standard adraze-ios).
set -u
HIT="$(cd "$(dirname "$0")" && pwd)"
MAC="${MAC:-mac}"
MAL="${MAL:-adraze-ios}"
PREFIX=""
UTAN=()
VIDARE=()
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; break ;;
    -n) PREFIX="${2:?-n behöver ett prefix}"; shift 2 ;;
    -x) UTAN+=("${2:?-x behöver ett modulnamn}"); shift 2 ;;
    -B|-R|-k) VIDARE+=("$1"); shift ;;
    -e|-t|-r|-m|-d) VIDARE+=("$1" "${2:?$1 behöver ett värde}"); shift 2 ;;
    -h|--hjalp|--help) sed -n '2,31p' "$0"; exit 0 ;;
    -*) echo "okänd flagga: $1 (se ./fran-mint.sh -h)"; exit 2 ;;
    *) POS+=("$1"); shift ;;
  esac
done
APPARG=("$@")
NAMN="${POS[0]:--}"
UTMAPP="${POS[1]:-$HIT/build-fran-mac}"
[ "$NAMN" = "-" ] && NAMN=""
[ -z "$PREFIX" ] && PREFIX="${NAMN:-bygg}"
case "$NAMN" in *[!a-z0-9_-]*) echo "självtestets namn får bara ha a-z, 0-9, - och _: $NAMN"; exit 2 ;; esac
case "$MAL" in ""|*[!A-Za-z0-9._-]*|.*) echo "MAL måste vara ett enkelt katalognamn: $MAL"; exit 2 ;; esac
for m in "${UTAN[@]+"${UTAN[@]}"}"; do
  case "$m" in ""|*[!A-Za-z0-9_-]*) echo "-x vill ha ett modulnamn (mappen under App/): $m"; exit 2 ;; esac
  case "$m" in Gemensamt|Labb|Tillgangar) echo "-x $m går inte: appen behöver den"; exit 2 ;; esac
  [ -d "$HIT/App/$m" ] || echo "obs: App/$m finns inte"
done
mkdir -p "$UTMAPP" "$HIT/build-fran-mac" || exit 1
UTMAPP="$(cd "$UTMAPP" && pwd)"

# ---------- ett bygge åt gången från mint ----------
exec 9>/tmp/adraze-ios-fran-mint.lock
if ! flock -n 9; then
  echo "ett annat bygge pågår (/tmp/adraze-ios-fran-mint.lock) – väntar …"
  flock -w 3600 9 || { echo "gav upp efter en timmes väntan"; exit 3; }
fi

# ---------- det som skapas före bygget ----------
# Datorns UI (App/Webb/ui) och skyddets regler (App/Regler) checkas inte in; de skapas här ur ../browser och
# ../extension i samma repo, så att en ren klon bygger. Reglerna skapas bara om när källorna ändrats.
"$HIT/verktyg/kopiera-ui.sh" || { echo "kopiera-ui.sh misslyckades"; exit 1; }
if [ -x "$HOME/bin/latt" ]; then "$HOME/bin/latt" "$HIT/verktyg/regler.sh"; else "$HIT/verktyg/regler.sh"; fi \
  || { echo "regler.sh misslyckades"; exit 1; }

# ---------- synka ----------
# Macen har openrsync (protokoll 29): --delete fungerar, men --delete-excluded hänger sig och P-filter ger
# "zero-length pathname" ihop med det (testat 2026-11-17). Därför bara vanliga --exclude: det som skapas på
# Macen (build/, Genererat/, AdRaze.xcodeproj) är undantaget och tas då inte bort av --delete. Moduler som
# utesluts med -x tas bort på Macen efter synken och kommer tillbaka vid nästa synk utan -x.
FILTER=(--exclude='/build/' --exclude='/build-fran-mac/' --exclude='/Genererat/' --exclude='/AdRaze.xcodeproj/'
  --exclude='.DS_Store' --exclude='__pycache__/' --exclude='.git/')
for m in "${UTAN[@]+"${UTAN[@]}"}"; do FILTER+=(--exclude="/App/$m/"); done
echo "== synkar $HIT -> $MAC:$MAL${UTAN[*]+ (utan ${UTAN[*]})}"
rsync -a --delete "${FILTER[@]}" "$HIT/" "$MAC:$MAL/" || { echo "rsync misslyckades"; exit 1; }
if [ ${#UTAN[@]} -gt 0 ]; then
  ssh "$MAC" "cd ~/$MAL/App && rm -rf $(printf '%q ' "${UTAN[@]}")" || { echo "kunde inte ta bort ${UTAN[*]} på Macen"; exit 1; }
fi

# ---------- bygg och kör på Macen ----------
if [ -n "$NAMN" ]; then BYGGARG=(-l "$NAMN"); else BYGGARG=(-b); fi
BYGGARG+=("${VIDARE[@]+"${VIDARE[@]}"}")
[ ${#APPARG[@]} -gt 0 ] && BYGGARG+=(-- "${APPARG[@]}")
ssh "$MAC" "cd ~/$MAL && ./bygg-sim.sh $(printf '%q ' "${BYGGARG[@]}")"
RC=$?

# ---------- hämta ----------
TMP="$HIT/build-fran-mac/.hamtat"
rm -rf "$TMP"; mkdir -p "$TMP"
hamta() { mkdir -p "$2" && rsync -a "$MAC:$MAL/build/$1" "$2/" 2>/dev/null; }
for f in senaste-korning.txt xcodebuild.log app-stdout.log app-stderr.log; do hamta "$f" "$TMP"; done
if [ -n "$NAMN" ]; then
  hamta "$NAMN.png" "$TMP"
  hamta "resultat-$NAMN.json" "$TMP"
  hamta "labb/$NAMN/" "$TMP/labb/$NAMN"
fi
# Ta bort förra körningens filer med samma prefix (bara exakta namn, inga mönster), så att inget gammalt ser nytt ut.
GAMLA=("$PREFIX.png" "$PREFIX-resultat.json" "$PREFIX-logg.txt" "$PREFIX-bygg.txt")
if [ -f "$UTMAPP/$PREFIX-resultat.json" ]; then
  while IFS= read -r b; do [ -n "$b" ] && GAMLA+=("$PREFIX-$b"); done < <(python3 -c '
import json, os, sys
try:
    for p in json.load(open(sys.argv[1])).get("skarmbilder", []): print(os.path.basename(p))
except Exception: pass' "$UTMAPP/$PREFIX-resultat.json")
fi
for g in "${GAMLA[@]}"; do rm -f "$UTMAPP/$g"; done
HAMTAT=()
kopiera() { [ -f "$1" ] && cp "$1" "$UTMAPP/$2" && HAMTAT+=("$2"); }
cp "$TMP/xcodebuild.log" "$HIT/build-fran-mac/xcodebuild.log" 2>/dev/null
kopiera "$TMP/senaste-korning.txt" "$PREFIX-bygg.txt"
if [ -n "$NAMN" ]; then
  kopiera "$TMP/$NAMN.png" "$PREFIX.png"
  kopiera "$TMP/resultat-$NAMN.json" "$PREFIX-resultat.json"
  for b in "$TMP/labb/$NAMN/"*.png; do [ -f "$b" ] && kopiera "$b" "$PREFIX-$(basename "$b")"; done
  if [ -f "$TMP/app-stdout.log" ] || [ -f "$TMP/app-stderr.log" ]; then
    { echo "== stdout"; cat "$TMP/app-stdout.log" 2>/dev/null; echo "== stderr"; cat "$TMP/app-stderr.log" 2>/dev/null; } > "$UTMAPP/$PREFIX-logg.txt"
    HAMTAT+=("$PREFIX-logg.txt")
  fi
fi
echo "== hämtat till $UTMAPP:"
for f in "${HAMTAT[@]+"${HAMTAT[@]}"}"; do echo "   $f"; done
[ -f "$HIT/build-fran-mac/xcodebuild.log" ] && echo "   (hela byggloggen: $HIT/build-fran-mac/xcodebuild.log)"

if [ "$RC" = 0 ] && [ -n "$NAMN" ]; then
  if [ ! -f "$UTMAPP/$PREFIX-resultat.json" ]; then echo "inget resultat kom"; exit 1; fi
  python3 - "$UTMAPP/$PREFIX-resultat.json" <<'PY' || exit 4
import json, sys
d = json.load(open(sys.argv[1]))
fel = [k for k in d.get("kontroller", []) if not k.get("ok")]
for k in fel:
    print("   FEL:", k.get("namn"), json.dumps(k.get("detalj"), ensure_ascii=False)[:400])
if d.get("fel"):
    print("   FEL:", d["fel"])
print("== %s: %s (%d kontroller, %d misslyckade, %.1f s)" % (d.get("prov"), "ok" if d.get("ok") else "MISSLYCKADES",
      len(d.get("kontroller", [])), len(fel), d.get("tid_s", 0)))
sys.exit(0 if d.get("ok") else 1)
PY
fi
exit $RC
