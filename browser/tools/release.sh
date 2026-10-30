#!/bin/bash
# Släpper en ny AdRaze-version till alla (in-app-uppdatering via northcrafto/adraze-dl).
# Användning: tools/release.sh ["vad som är nytt"]   — höjer patch-versionen själv.
# Exakt det byggda paketet testas (säkerhet + paket, osynligt i Xvfb) innan det släpps.
# Nödläge utan tester: ADRAZE_UTAN_TEST=1 tools/release.sh "…"   Bygg + testa utan att släppa: ADRAZE_TORR=1
set -e
cd "$(dirname "$0")/.."
NOTES="${1:-Uppdatering}"
# Electron-vakten kan ha släppt en version sedan sist – ta in den först
git pull -q --rebase --autostash origin main
# node_modules måste ha precis den Electron som package.json säger (annars släpps fel Chromium)
VILL=$(node -p "const p=require('./package.json'); ((p.dependencies||{}).electron||(p.devDependencies||{}).electron||'').replace(/.*#v/,'')")
HAR=$(cat node_modules/electron/dist/version 2>/dev/null || echo "")
if [ "$VILL" != "$HAR" ]; then
  echo "Electron i node_modules ($HAR) ≠ package.json ($VILL) — installerar"
  npm install --no-audit --no-fund
  node node_modules/electron/install.js
  [ "$(cat node_modules/electron/dist/version)" = "$VILL" ] || { echo "fel Electron efter installation"; exit 1; }
fi
node tools/electron-vakt.js --koll 2>/dev/null | tail -1 | grep -q "uppdatera till" && echo "OBS: $(node tools/electron-vakt.js --koll | tail -1) finns hos castlabs"
V=$(npm version patch --no-git-tag-version | tr -d v)
rm -f dist-installer/latest-linux.yml dist-installer/AdRaze.AppImage
npm run build:linux -- --publish never
grep -q "^version: $V$" dist-installer/latest-linux.yml || { echo "latest-linux.yml har fel version"; exit 1; }
if [ -z "$ADRAZE_UTAN_TEST" ]; then
  FORRA=$(mktemp -d)
  gh release download -R northcrafto/adraze-dl -p AdRaze.AppImage -D "$FORRA" && chmod +x "$FORRA/AdRaze.AppImage"
  CHROME=$(node -e "fetch('https://releases.electronjs.org/releases.json').then(r=>r.json()).then(j=>console.log((j.find(x=>x.version==='${VILL%+wvcus}')||{}).chrome||''))" 2>/dev/null || true)
  if ! node tools/test/sakerhet.js . || ! node tools/test/paket.js dist-installer/AdRaze.AppImage --forra "$FORRA/AdRaze.AppImage" ${CHROME:+--chrome "$CHROME"}; then
    rm -rf "$FORRA"
    git checkout -q package.json package-lock.json 2>/dev/null || true
    echo "Testerna föll — $V släpps INTE"; exit 1
  fi
  rm -rf "$FORRA"
fi
if [ -n "$ADRAZE_TORR" ]; then git checkout -q package.json package-lock.json; echo "Torrkörning: $V byggd och testad, släpps inte"; exit 0; fi
gh release create "v$V" -R northcrafto/adraze-dl --title "AdRaze $V" --notes "$NOTES" \
  dist-installer/AdRaze.AppImage dist-installer/latest-linux.yml
git add package.json package-lock.json 2>/dev/null || git add package.json
git -c user.name=Cetto -c user.email=cetoari9@gmail.com commit -qm "AdRaze $V: $NOTES"
git push -q origin HEAD:main
echo "Släppt: $V"
