#!/bin/bash
# Bygger AdRaze för Windows (NSIS-installation + automatiska uppdateringar) här på Linux.
#   tools/win/release.sh                 bygg dist-installer/AdRaze-Setup.exe för versionen i package.json
#   tools/win/release.sh --publicera     bygg och lägg till filerna i släppet v<version> på northcrafto/adraze-dl
# Publicering kräver kodsignering (~/.config/adraze/winsign.json, se build/signera-win.js) – annars vägrar skriptet.
# Nödläge/test: ADRAZE_WIN_OSIGNERAD=1 publicerar osignerat.
set -e
cd "$(dirname "$0")/../.."
V=$(node -p "require('./package.json').version")
SPEC=$(node -p "const p=require('./package.json'); (p.dependencies||{}).electron||(p.devDependencies||{}).electron||''")
VILL=${SPEC##*#v}
EL="$HOME/.cache/adraze-win/electron-$VILL"
# castlabs Electron för Windows (samma version som Linux/Mac)
if [ "$(cat "$EL/version" 2>/dev/null)" != "$VILL" ]; then
  echo "[win] hämtar castlabs Electron $VILL för Windows"
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  for i in 1 2 3 4; do gh release download "v$VILL" -R castlabs/electron-releases -p "electron-v$VILL-win32-x64.zip" -D "$T" && break; sleep 20; done
  rm -rf "$EL" && mkdir -p "$EL" && unzip -q "$T/electron-v$VILL-win32-x64.zip" -d "$EL"
  [ "$(cat "$EL/version")" = "$VILL" ] || { echo "[win] fel Electron-version i zippen"; exit 1; }
fi
tools/win/bygg-native.sh
rm -rf dist-installer/win-unpacked dist-installer/AdRaze-Setup.exe dist-installer/AdRaze-Setup.exe.blockmap dist-installer/latest.yml
npx electron-builder --win nsis --x64 --publish never -c.electronDist="$EL"
grep -q "^version: $V$" dist-installer/latest.yml || { echo "[win] latest.yml har fel version"; exit 1; }
[ -f dist-installer/win-unpacked/resources/app.asar.unpacked/native/adblock/build/win32-x64/adblock_core.node ] || echo "[win] OBS: ingen Windows-adblockmotor i paketet (JS-matchning används)"
[ -f dist-installer/win-unpacked/AdRaze.exe.sig ] || echo "[win] OBS: ingen VMP-signatur (Widevine/Netflix fungerar inte)"
SIGNERAD=0
node tools/win/har-signatur.js dist-installer/AdRaze-Setup.exe && node tools/win/har-signatur.js dist-installer/win-unpacked/AdRaze.exe && SIGNERAD=1 || true
echo "[win] klart: dist-installer/AdRaze-Setup.exe ($V, $(stat -c%s dist-installer/AdRaze-Setup.exe) byte, $([ $SIGNERAD = 1 ] && echo signerad || echo OSIGNERAD))"
[ "$1" = "--publicera" ] || exit 0
if [ $SIGNERAD != 1 ] && [ -z "$ADRAZE_WIN_OSIGNERAD" ]; then echo "[win] släpper inte osignerat (ADRAZE_WIN_OSIGNERAD=1 för att ändå göra det)"; exit 2; fi
gh release upload "v$V" -R northcrafto/adraze-dl --clobber dist-installer/AdRaze-Setup.exe dist-installer/AdRaze-Setup.exe.blockmap dist-installer/latest.yml
echo "[win] publicerad i v$V"
