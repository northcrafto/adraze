#!/bin/bash
# regler.sh – skapar skyddets regler i App/Regler/ ur tillägget (../extension) och datorns main.js (../browser)
# med verktyg/dnr2wk.py, men bara när något av det som de byggs av har ändrats. Körs av fran-mint.sh före
# varje bygge, och av bygg-sim.sh om App/Regler saknas.
#
#   ./verktyg/regler.sh            # skapa om när källorna ändrats (tar ~7 s, ~280 MB minne)
#   ./verktyg/regler.sh -f         # skapa om ändå
#
# App/Regler/ checkas inte in (.gitignore): utdata är ~30 MB och blir exakt samma av samma källor (sorterad,
# kontrollerat 2026-11-17 med diff -r mot den incheckade kopian). Kontrollsumman av källorna ligger i
# App/Regler/.kalla-sha256. Källorna kan bytas med ADRAZE_EXTENSION och ADRAZE_BROWSER.
# Ägare: Grund (verktyget dnr2wk.py: Skydd).
set -euo pipefail
export LC_ALL=C
HIT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="${ADRAZE_EXTENSION:-$HIT/../extension}"
BROWSER="${ADRAZE_BROWSER:-$HIT/../browser}"
UT="$HIT/App/Regler"
TVINGA=0
[ "${1:-}" = "-f" ] && TVINGA=1

[ -d "$EXT/rules" ] || { echo "regler.sh: hittar inte tillägget ($EXT/rules)" >&2; exit 1; }
[ -f "$BROWSER/main.js" ] || { echo "regler.sh: hittar inte $BROWSER/main.js" >&2; exit 1; }
command -v python3 >/dev/null || { echo "regler.sh: python3 saknas" >&2; exit 1; }

summa() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; }
# Allt dnr2wk.py läser: tilläggets regler, data, innehålls- och scriptletskript, background.js, datorns main.js
# och kopian i browser/adraze (jämförs), och verktyget själv.
KALLA="$(
  cd "$HIT/.." 2>/dev/null || exit 1
  {
    find "$EXT" "$BROWSER/adraze" -type f \( -name '*.json' -o -name '*.js' -o -name '*.txt' \) 2>/dev/null | sort
    echo "$BROWSER/main.js"; echo "$HIT/verktyg/dnr2wk.py"
  } | while IFS= read -r f; do printf '%s ' "${f#"$HIT/../"}"; summa < "$f"; done | summa | cut -d' ' -f1
)"

if [ "$TVINGA" = 0 ] && [ -f "$UT/listor/manifest.json" ] && [ "$(cat "$UT/.kalla-sha256" 2>/dev/null)" = "$KALLA" ]; then
  echo "regler.sh: App/Regler är aktuell"
  exit 0
fi
TMP="$HIT/build-fran-mac/.regler-ny"
rm -rf "$TMP"; mkdir -p "$TMP"
python3 "$HIT/verktyg/dnr2wk.py" "$EXT" "$BROWSER" "$TMP" | tail -2
echo "$KALLA" > "$TMP/.kalla-sha256"
rm -rf "$UT"; mv "$TMP" "$UT"
echo "regler.sh: App/Regler skapad ($(du -sh "$UT" | cut -f1))"
