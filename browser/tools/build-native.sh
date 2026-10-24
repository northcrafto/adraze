#!/bin/bash
# Bygger vår C++-adblockmotor (native/adblock) mot Electrons headers. Körs före paketeringen
# (prebuild) och går att köra för hand under utveckling. Misslyckas bygget avbryts INTE releasen —
# webbläsaren faller tillbaka på JS-matchningen om .node saknas.
set -e
cd "$(dirname "$0")/.."
EV=$(node -p "require('electron/package.json').version.replace('+wvcus','')" 2>/dev/null || echo "")
[ -z "$EV" ] && { echo "[native] hittar inte electron-versionen — hoppar C++-motorn"; exit 0; }
echo "[native] bygger adblock-motorn mot Electron $EV"
cd native/adblock
node-gyp rebuild \
  --target="$EV" \
  --dist-url=https://electronjs.org/headers \
  --runtime=electron \
  --arch=x64 \
  --devdir="$HOME/.electron-gyp" || { echo "[native] bygget misslyckades — JS-matchning används"; exit 0; }
# Kontroll: .node får INTE länka systemets libnode (då kraschar den i Electron)
if readelf -d build/Release/adblock_core.node 2>/dev/null | grep -qi "libnode"; then
  echo "[native] VARNING: adblock_core.node länkar libnode — bygget kasseras"
  rm -f build/Release/adblock_core.node
  exit 0
fi
echo "[native] klart: $(ls -la build/Release/adblock_core.node | awk '{print $5}') byte"
