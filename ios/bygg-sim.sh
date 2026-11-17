#!/bin/bash
# bygg-sim.sh – bygg AdRaze för iOS-simulatorn och kör den huvudlöst. Körs PÅ Macen (fran-mint.sh gör det åt dig).
#
# Öppnar aldrig Xcode eller Simulator.app: allt går via xcodegen, xcodebuild och xcrun simctl. Ett bygge i taget
# (Macen har 8 GB) – skriptet tar låset /tmp/adraze-ios-bygg.lock och väntar om något annat bygger.
#
#   ./bygg-sim.sh [flaggor] [-- argument till appen ...]
#
#   -l NAMN     kör självtestet NAMN: väntar på Documents/resultat-NAMN.json, skärmbild build/NAMN.png,
#               appens egna skärmbilder till build/labb/NAMN/ (samma som -w resultat-NAMN.json -o build/NAMN.png -- -mode NAMN)
#   -b          bara bygget (ingen simulator)
#   -B          bygg inte, installera och kör senast byggda appen
#   -R          rent bygge (tömmer build/DD först)
#   -k          låt simulatorn vara igång efteråt (annars: simctl shutdown)
#   -e NAMN     simulatorns namn (standard "AdRaze iPhone 16 iOS26"; skapas om den saknas)
#   -t TYP      enhetstyp när den skapas (standard "iPhone 16")
#   -r RUNTIME  runtime-id, t.ex. com.apple.CoreSimulator.SimRuntime.iOS-26-1 (standard: senaste med SDK:ns huvudversion)
#   -o FIL      skärmbild (standard build/skarm.png)
#   -w FIL      vänta tills appen skrivit Documents/FIL
#   -m SEK      längsta väntan på resultatet (standard 300)
#   -d SEK      väntan efter resultatet innan skärmbilden (standard 3; appen stannar 15 s efter ett självtest)
#   -p KATALOG  projektkatalog med project.yml (standard: skriptets katalog)
#
# Miljö: DEVELOPER_DIR väljer Xcode (standard Xcode 26 om /Applications/Xcode-26.app finns, annars xcode-select).
#        XCODEGEN=/sökväg/xcodegen (standard ~/bin/xcodegen).
# Utfall i build/: xcodebuild.log, senaste-korning.txt, app-stdout.log, app-stderr.log, NAMN.png, resultat-NAMN.json, labb/NAMN/*.png
set -u
export LC_ALL=C

KATALOG="$(cd "$(dirname "$0")" && pwd)"
ENHET="AdRaze iPhone 16 iOS26"
ENHETSTYP="iPhone 16"
RUNTIME=""
UT=""
VANTA=""
LABB=""
MAXSEK=300
DROJ=3
BYGG=1
KOR=1
REN=0
BEHALL=0
while getopts "l:bBRke:t:r:o:w:m:d:p:" f; do
  case "$f" in
    l) LABB="$OPTARG" ;;
    b) KOR=0 ;;
    B) BYGG=0 ;;
    R) REN=1 ;;
    k) BEHALL=1 ;;
    e) ENHET="$OPTARG" ;;
    t) ENHETSTYP="$OPTARG" ;;
    r) RUNTIME="$OPTARG" ;;
    o) UT="$OPTARG" ;;
    w) VANTA="$OPTARG" ;;
    m) MAXSEK="$OPTARG" ;;
    d) DROJ="$OPTARG" ;;
    p) KATALOG="$(cd "$OPTARG" && pwd)" ;;
    *) sed -n '2,26p' "$0"; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[ "${1:-}" = "--" ] && shift
APPARG=("$@")
if [ -n "$LABB" ]; then
  [ -z "$VANTA" ] && VANTA="resultat-$LABB.json"
  [ -z "$UT" ] && UT="build/$LABB.png"
  APPARG=(-mode "$LABB" "${APPARG[@]+"${APPARG[@]}"}")
fi

if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode-26.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode-26.app/Contents/Developer
fi

cd "$KATALOG" || exit 1
mkdir -p build
BUILD="$KATALOG/build"
[ -z "$UT" ] && UT="$BUILD/skarm.png"
case "$UT" in /*) ;; *) UT="$KATALOG/$UT" ;; esac
SCHEMA="$(awk '/^name:/ {print $2; exit}' project.yml)"
XCODEGEN="${XCODEGEN:-$HOME/bin/xcodegen}"
SAMMAN="$BUILD/senaste-korning.txt"
: > "$SAMMAN"
rapport() { echo "$*"; echo "$*" >> "$SAMMAN"; }
tid() { date +%s; }
ledigt() { memory_pressure -Q 2>/dev/null | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}'; }

# ---------- lås: ett bygge/en simulator i taget på Macen (delas med prototypen) ----------
LAS=/tmp/adraze-ios-bygg.lock
vantat=0
while ! mkdir "$LAS" 2>/dev/null; do
  agare="$(cat "$LAS/pid" 2>/dev/null || true)"
  if [ -n "$agare" ] && ! kill -0 "$agare" 2>/dev/null; then
    echo "gammalt lås från PID $agare (finns inte längre) – tar över"
    rm -rf "$LAS"
    continue
  fi
  [ $((vantat % 30)) -eq 0 ] && echo "väntar på låset (PID ${agare:-?} bygger) …"
  sleep 5; vantat=$((vantat + 5))
  [ "$vantat" -gt 1800 ] && { echo "gav upp efter 30 min väntan på låset"; exit 3; }
done
echo $$ > "$LAS/pid"
PROVPID=""
stada() {
  [ -n "$PROVPID" ] && kill "$PROVPID" 2>/dev/null
  rm -rf "$LAS"
}
trap stada EXIT

rapport "== bygg-sim.sh $(date '+%Y-%m-%d %H:%M:%S') i $KATALOG"
# förra körningens utfall bort, så att inget gammalt hämtas som om det vore nytt
rm -f "$BUILD/app-stdout.log" "$BUILD/app-stderr.log" "$UT"
[ -n "$VANTA" ] && rm -f "$BUILD/$VANTA"
[ -n "$LABB" ] && rm -rf "$BUILD/labb/$LABB"
rapport "verktyg: $(xcodebuild -version 2>/dev/null | tr '\n' ' ')(${DEVELOPER_DIR:-$(xcode-select -p 2>/dev/null)})"
rapport "ledigt minne före: $(ledigt)%"

# ---------- simulatorn (finns den inte skapas den) ----------
if [ "$KOR" = 1 ] || [ "$BYGG" = 1 ]; then
  if [ -z "$RUNTIME" ]; then
    # nyaste iOS-runtime med samma huvudversion som Xcodes SDK (Xcode 16.4 -> iOS 18.x, Xcode 26 -> iOS 26.x)
    SDKMAJ="$(xcrun --sdk iphonesimulator --show-sdk-version | cut -d. -f1)"
    RUNTIME="$(xcrun simctl list runtimes available | awk -v m="$SDKMAJ" '/^iOS / { split($2, v, "."); if (v[1] == m) r = $NF } END { print r }')"
    [ -z "$RUNTIME" ] && { echo "ingen iOS $SDKMAJ-runtime installerad"; exit 1; }
  fi
  UDID="$(xcrun simctl list devices available | awk -v n="$ENHET" -v r="$RUNTIME" '
    BEGIN { ver = r; sub(/.*iOS-/, "", ver); gsub("-", ".", ver); pre = "    " n " (" }
    /^-- / { sekt = $0; next }
    index($0, pre) == 1 && index(sekt, "iOS " ver " ") { print substr($0, length(pre) + 1, 36); exit }')"
  if [ -z "$UDID" ]; then
    TYPID="$(xcrun simctl list devicetypes | awk -v t="$ENHETSTYP" 'index($0, t " (") == 1 { gsub(/.*\(|\)/, ""); print; exit }')"
    UDID="$(xcrun simctl create "$ENHET" "$TYPID" "$RUNTIME")" || { echo "kunde inte skapa simulatorn"; exit 1; }
    rapport "skapade simulatorn $ENHET ($TYPID, $RUNTIME): $UDID"
  fi
  rapport "simulator: $ENHET $UDID ($RUNTIME)"
fi

# ---------- bygge ----------
if [ "$BYGG" = 1 ]; then
  # Genererat som inte checkas in: skapas här om det saknas och källorna finns (en ren klon av hela repot).
  # fran-mint.sh skapar dem på mint och synkar hit, så där finns de redan.
  if [ ! -f App/Webb/ui/shell.html ]; then
    if [ -f ../browser/ui/shell.html ]; then ./verktyg/kopiera-ui.sh || { rapport "kopiera-ui.sh misslyckades"; exit 1; }
    else rapport "App/Webb/ui saknas och ../browser finns inte (kör verktyg/kopiera-ui.sh eller fran-mint.sh)"; exit 1; fi
  fi
  if [ ! -f App/Regler/listor/manifest.json ]; then
    if [ -d ../extension/rules ]; then ./verktyg/regler.sh || { rapport "regler.sh misslyckades"; exit 1; }
    else rapport "App/Regler saknas och ../extension finns inte (kör verktyg/regler.sh eller fran-mint.sh)"; exit 1; fi
  fi
  if [ ! -x "$XCODEGEN" ]; then
    if command -v xcodegen >/dev/null; then XCODEGEN="$(command -v xcodegen)"; else
      echo "xcodegen saknas – hämtar 2.46.0 till ~/bin (ingen sudo)"
      mkdir -p "$HOME/bin" "$BUILD/xg" && curl -sSL -o "$BUILD/xg/xg.zip" \
        https://github.com/yonaskolb/XcodeGen/releases/download/2.46.0/xcodegen.zip &&
        unzip -qo "$BUILD/xg/xg.zip" -d "$BUILD/xg" && cp "$BUILD/xg/xcodegen/bin/xcodegen" "$HOME/bin/" &&
        XCODEGEN="$HOME/bin/xcodegen" || { echo "kunde inte hämta xcodegen"; exit 1; }
    fi
  fi
  "$XCODEGEN" generate --quiet --spec project.yml || { rapport "xcodegen misslyckades"; exit 1; }
  [ "$REN" = 1 ] && rm -rf "$BUILD/DD"
  [ -d "$BUILD/DD" ] && SORT="inkrementellt" || SORT="rent"
  # minnesprov var 0,5 s: summa RSS för byggprocesserna + lägsta lediga minne
  (
    topp=0; lagst=100
    while :; do
      s=$(ps -axo rss=,comm= | awk '{n=$2; sub(".*/", "", n)} n ~ /^(xcodebuild|XCBBuildService|SWBBuildService|swift-frontend|swift-driver|swift-build|clang|ld|actool|ibtool|swiftc|xcrun|lipo|codesign)$/ {s+=$1} END {print s+0}')
      [ "$s" -gt "$topp" ] && topp=$s
      l=$(ledigt); [ -n "$l" ] && [ "$l" -lt "$lagst" ] && lagst=$l
      echo "$topp $lagst" > "$BUILD/.minnesprov"
      sleep 0.5
    done
  ) &
  PROVPID=$!
  T0=$(tid)
  # Simulatorbygget signeras ad hoc ("-", ingen Apple-identitet eller team) så att Keychain fungerar i appen.
  # ADRAZE_OSIGNERAT=1 bygger helt osignerat som prototypen (CODE_SIGNING_ALLOWED=NO).
  if [ "${ADRAZE_OSIGNERAT:-0}" = 1 ]; then SIGN=(CODE_SIGNING_ALLOWED=NO); else SIGN=(CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO); fi
  rapport "signering: ${SIGN[*]}"
  /usr/bin/time -l -o "$BUILD/time.txt" xcodebuild -project "$SCHEMA.xcodeproj" -scheme "$SCHEMA" \
    -configuration Debug -sdk iphonesimulator -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath "$BUILD/DD" "${SIGN[@]}" COMPILER_INDEX_STORE_ENABLE=NO build \
    > "$BUILD/xcodebuild.log" 2>&1
  RC=$?
  T1=$(tid)
  kill "$PROVPID" 2>/dev/null; wait "$PROVPID" 2>/dev/null; PROVPID=""
  read -r TOPPKB LAGST < "$BUILD/.minnesprov" 2>/dev/null || { TOPPKB=0; LAGST="?"; }
  MAXRSS=$(awk '/maximum resident set size/ {print int($1/1048576)}' "$BUILD/time.txt" 2>/dev/null)
  VARN=$(grep -c ": warning: " "$BUILD/xcodebuild.log")
  if [ "$RC" != 0 ] || ! grep -q "BUILD SUCCEEDED" "$BUILD/xcodebuild.log"; then
    rapport "BYGGET MISSLYCKADES ($((T1 - T0)) s) – fel ur $BUILD/xcodebuild.log:"
    grep -E ": error: |error: |BUILD FAILED|\*\* " "$BUILD/xcodebuild.log" | sort -u | head -60 | tee -a "$SAMMAN"
    exit 1
  fi
  rapport "bygge ($SORT): $((T1 - T0)) s, $VARN varningsrader, byggprocesser tillsammans max $((TOPPKB / 1024)) MB, största process $MAXRSS MB, lägsta lediga minne $LAGST%"
fi
APP="$(ls -d "$BUILD"/DD/Build/Products/Debug-iphonesimulator/*.app 2>/dev/null | head -1)"
[ -z "$APP" ] && { rapport "hittar ingen byggd .app i $BUILD/DD"; exit 1; }
BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
rapport "app: $APP ($BUNDLE, $(du -sh "$APP" | awk '{print $1}'))"
[ "$KOR" = 0 ] && { rapport "bara bygget (-b): klart"; exit 0; }

# ---------- starta simulatorn huvudlöst (Simulator.app öppnas inte) ----------
T0=$(tid)
xcrun simctl boot "$UDID" 2>/dev/null   # felar om den redan är igång – det är ok
xcrun simctl bootstatus "$UDID" -b > /dev/null 2>&1
T1=$(tid)
rapport "uppstart: $((T1 - T0)) s"

xcrun simctl install "$UDID" "$APP" || { rapport "installationen misslyckades"; exit 1; }
DATA="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data 2>/dev/null)"
[ -n "$VANTA" ] && rm -f "$DATA/Documents/$VANTA"
T0=$(tid)
xcrun simctl launch --terminate-running-process --stdout="$BUILD/app-stdout.log" --stderr="$BUILD/app-stderr.log" \
  "$UDID" "$BUNDLE" "${APPARG[@]+"${APPARG[@]}"}" > /dev/null || { rapport "appen startade inte"; exit 1; }
rapport "startade appen: ${APPARG[*]+"${APPARG[*]}"}"

# vänta på resultatfilen och mät minnet under tiden (top:s MEM per process; RSS dubbelräknar delat minne)
SIMTOPP=0; APPTOPP=0; LAGST=100
APPNAMN="$(basename "$APP" .app)"
LD=""
while :; do
  [ -z "$LD" ] && LD="$(ps -axo pid=,command= | awk -v u="$UDID" '/launchd_sim/ && index($0, u) {print $1; exit}')"
  if [ -n "$LD" ]; then
    TRAD="$(ps -axo pid=,ppid= | awk -v rot="$LD" '{p[NR]=$1; pp[NR]=$2; n=NR}
      END {in_[rot]=1; c=1; while (c) {c=0; for (i=1;i<=n;i++) if (!(p[i] in in_) && (pp[i] in in_)) {in_[p[i]]=1; c=1}}
           for (i=1;i<=n;i++) if (p[i] in in_) printf "%s,", p[i]}')"
    top -l 1 -stats pid,mem,command -n 4000 > "$BUILD/.top" 2>/dev/null
    set -- $(awk -v set="$TRAD" -v app="$APPNAMN" '
      function mb(v,  m) { sub(/[+-]$/, "", v); m = 1; if (v ~ /K$/) m = 1/1024; else if (v ~ /G$/) m = 1024; else if (v ~ /[0-9]B$/) m = 1/1048576; gsub(/[^0-9.]/, "", v); return v * m }
      BEGIN { n = split(set, a, ","); for (i = 1; i <= n; i++) if (a[i] != "") s[a[i]] = 1 }
      ($1 in s) { t += mb($2) }
      ($3 == app) { ap += mb($2) }
      END { printf "%d %d\n", t, ap }' "$BUILD/.top")
    [ "${1:-0}" -gt "$SIMTOPP" ] && SIMTOPP=$1
    [ "${2:-0}" -gt "$APPTOPP" ] && APPTOPP=$2
  fi
  l=$(ledigt); [ -n "$l" ] && [ "$l" -lt "$LAGST" ] && LAGST=$l
  # Labbkorning.systembild: appen ber om simulatorns egen skärmbild (med statusraden) och väntar på den
  if [ -n "$LABB" ]; then
    for v in "$DATA/Documents/Labb/$LABB/"*.vill; do
      [ -e "$v" ] || continue
      xcrun simctl io "$UDID" screenshot --type=png "${v%.vill}.png" > /dev/null 2>&1 || rapport "systembilden ${v##*/} misslyckades"
      rm -f "$v"
    done
  fi
  if [ -n "$VANTA" ]; then
    [ -s "$DATA/Documents/$VANTA" ] && break
  else
    [ $(( $(tid) - T0 )) -ge "$DROJ" ] && break
  fi
  [ $(( $(tid) - T0 )) -ge "$MAXSEK" ] && { rapport "VARNING: $VANTA kom inte inom $MAXSEK s"; break; }
  sleep 0.5
done
T1=$(tid)
[ -n "$VANTA" ] && sleep "$DROJ"
mkdir -p "$(dirname "$UT")"
xcrun simctl io "$UDID" screenshot --type=png "$UT" > /dev/null 2>&1 && rapport "skärmbild: $UT"
if [ -n "$VANTA" ] && [ -s "$DATA/Documents/$VANTA" ]; then
  cp "$DATA/Documents/$VANTA" "$BUILD/$VANTA"
  OK="$(/usr/bin/python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("ok" if d.get("ok") else "FEL (%s misslyckade%s)" % (d.get("misslyckade"), "; " + d["fel"] if d.get("fel") else ""))' "$BUILD/$VANTA" 2>/dev/null || echo "?")"
  rapport "resultat: $BUILD/$VANTA – $OK"
fi
if [ -n "$LABB" ] && [ -d "$DATA/Documents/Labb/$LABB" ]; then
  mkdir -p "$BUILD/labb/$LABB"
  cp "$DATA/Documents/Labb/$LABB/"*.png "$BUILD/labb/$LABB/" 2>/dev/null && rapport "appens skärmbilder: $(ls "$BUILD/labb/$LABB" | tr '\n' ' ')"
fi
rapport "appen: $((T1 - T0)) s till resultat; minne (top MEM): appen max $APPTOPP MB, simulatorns processer max $SIMTOPP MB, lägsta lediga minne $LAGST%"

if [ "$BEHALL" = 1 ]; then
  rapport "simulatorn får vara igång (-k)"
else
  # Ett självtest avslutar appen själv efter -stanna; vänta lite så att loggen hinner skrivas klart.
  [ -n "$LABB" ] && sleep 2
  xcrun simctl shutdown "$UDID" && rapport "simulatorn avstängd"
fi
rapport "ledigt minne efter: $(ledigt)%"
