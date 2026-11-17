#!/bin/bash
# kopiera-ui.sh – kopierar datorns UI in i iPhone-appen, så att Anpassa, startsidan, chatten och Falk är samma sidor
# som på datorn (del 3, 3.4). Kör före varje bygge (fran-mint.sh gör det inte själv än):
#
#   ./verktyg/kopiera-ui.sh && ./fran-mint.sh -n steg4-brygga brygga ~/adraze-app/skarm
#
#   ~/adraze/browser/ui/**           ->  App/Webb/ui/**            (adraze-app://localhost/<fil>)
#   ~/adraze/browser/*preload*.js    ->  App/Webb/ui/_preload/     (körs som WKUserScript, serveras aldrig)
#
# App/Webb/ui/ är en genererad kopia: redigeras aldrig och checkas inte in (.gitignore). iOS-skillnaderna ligger i
# App/Webb/ios/ (preload-ios.js, ios.js, ios.css) och läggs ovanpå av Brygga (App/Brygga/).
# Källan kan bytas med ADRAZE_BROWSER=/annan/browser. Ägare: Brygga och webb-UI.
set -euo pipefail
export LC_ALL=C
HIT="$(cd "$(dirname "$0")/.." && pwd)"
KALLA="${ADRAZE_BROWSER:-$HOME/adraze/browser}"
MAL="$HIT/App/Webb/ui"

[ -f "$KALLA/ui/shell.html" ] || { echo "kopiera-ui.sh: hittar inte $KALLA/ui/shell.html" >&2; exit 1; }
# Namn som Brygga använder för egna saker i adraze-app://localhost/ får inte finnas i datorns ui/
for reserverat in ios _preload anpassa.html startsida.html falk.html; do
  if [ -e "$KALLA/ui/$reserverat" ]; then echo "kopiera-ui.sh: $KALLA/ui/$reserverat krockar med Bryggans egna sökvägar" >&2; exit 1; fi
done

mkdir -p "$MAL"
# input.css är Tailwinds källa (sidorna laddar tailwind.css); kartfiler och systemskräp behövs inte i appen
rsync -a --delete --exclude '.DS_Store' --exclude '*.map' --exclude '/input.css' --exclude '/_preload/' "$KALLA/ui/" "$MAL/"

mkdir -p "$MAL/_preload"
rm -f "$MAL/_preload/"*.js
for f in preload.js content-preload.js krypto-preload.js chatt-preload.js popup-preload.js; do
  [ -f "$KALLA/$f" ] && cp "$KALLA/$f" "$MAL/_preload/$f"
done

antal=$(find "$MAL" -type f | wc -l | tr -d ' ')
storlek=$(du -sh "$MAL" | cut -f1)
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$KALLA/package.json" 2>/dev/null | head -1)
printf '{"version":"%s","kopierad":"%s","filer":%s}\n' "${version:-?}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$antal" > "$MAL/_preload/kalla.json"
echo "kopiera-ui.sh: $antal filer ($storlek) från $KALLA (AdRaze ${version:-?}) -> App/Webb/ui"
