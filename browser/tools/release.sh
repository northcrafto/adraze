#!/bin/bash
# Släpper en ny AdRaze-version till alla (in-app-uppdatering via northcrafto/adraze-dl).
# Användning: tools/release.sh ["vad som är nytt"]   — höjer patch-versionen själv.
# Exakt det byggda paketet testas (säkerhet + paket, osynligt i Xvfb) innan det släpps.
# Nödläge utan tester: ADRAZE_UTAN_TEST=1 tools/release.sh "…"   Bygg + testa utan att släppa: ADRAZE_TORR=1
set -e
cd "$(dirname "$0")/.."
NOTES="${1:-Uppdatering}"
# Electron-vakten kan ha släppt en version sedan sist – ta in den först
git pull -q --rebase=merges --autostash origin main
# node_modules måste ha precis den Electron som package.json säger (annars släpps fel Chromium)
SPEC=$(node -p "const p=require('./package.json'); (p.dependencies||{}).electron||(p.devDependencies||{}).electron||''")
VILL=${SPEC##*#v}
HAR=$(cat node_modules/electron/dist/version 2>/dev/null || echo "")
if [ "$VILL" != "$HAR" ]; then
  echo "Electron i node_modules ($HAR) ≠ package.json ($VILL) — installerar"
  # Uttryckligt: annars står låset (package-lock) kvar på den gamla git-commiten och fel motor byggs
  npm install --no-audit --no-fund --save-dev "electron@$SPEC"
  node node_modules/electron/install.js
  [ "$(cat node_modules/electron/dist/version)" = "$VILL" ] || { echo "fel Electron efter installation"; exit 1; }
fi
# Finns en nyare castlabs-motor (säkerhetsfixar) släpps INTE den gamla – uppdatera först
# (npm install -D "electron@github:castlabs/electron-releases#<tagg>"). Nödläge: ADRAZE_GAMMAL_MOTOR_OK=1
# (Ny huvudversion sköter vakten själv efter några dagar – den stoppar inte, men syns.)
KOLL=$(node tools/electron-vakt.js --koll 2>/dev/null | grep "uppdatera till" | tail -1 || true)
if [ -n "$KOLL" ]; then
  if echo "$KOLL" | grep -q "ny huvudversion"; then echo "OBS: $KOLL finns hos castlabs"
  elif [ -z "$ADRAZE_GAMMAL_MOTOR_OK" ]; then echo "STOPP: $KOLL finns hos castlabs – släpper inte gammal motor (ADRAZE_GAMMAL_MOTOR_OK=1 för nödläge)"; exit 1
  else echo "OBS: $KOLL finns hos castlabs (ADRAZE_GAMMAL_MOTOR_OK satt)"; fi
fi
V=$(npm version patch --no-git-tag-version | tr -d v)
rm -f dist-installer/latest-linux.yml dist-installer/AdRaze.AppImage dist-installer/AdRaze.dmg dist-installer/AdRaze-mac.zip dist-installer/AdRaze-mac.zip.blockmap dist-installer/latest-mac.yml
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
# Cetto får den nya versionen direkt (testad), utan att vänta på Mac-bygget eller GitHubs uppdateringsflöde.
# Byts med mv så att en AdRaze som körs behåller sin gamla fil tills den startas om. Andra användare uppdateras som vanligt.
if [ -z "$ADRAZE_TORR" ] && [ -f "$HOME/Applications/AdRaze.AppImage" ]; then
  cp dist-installer/AdRaze.AppImage "$HOME/Applications/.AdRaze.ny" && chmod +x "$HOME/Applications/.AdRaze.ny" \
    && mv -f "$HOME/Applications/.AdRaze.ny" "$HOME/Applications/AdRaze.AppImage" && echo "Installerad hos Cetto: $V"
  command -v notify-send >/dev/null && notify-send "AdRaze $V" "Installerad hos dig – starta om AdRaze för att få den" 2>/dev/null || true
fi
# Mac (universell dmg + zip för uppdateringar), byggd och notariserad på MacBooken. Går det inte –
# Mac:en avstängd eller bygget föll – följer förra versionens Mac-filer med, så att nedladdningslänken
# alltid fungerar (Mac-användarna får då ingen uppdatering just den här gången).
MAC_FILER="dist-installer/AdRaze.dmg dist-installer/AdRaze-mac.zip dist-installer/AdRaze-mac.zip.blockmap dist-installer/latest-mac.yml"
if [ -n "$ADRAZE_UTAN_MAC" ] || ! tools/release-mac.sh; then
  echo "OBS: ingen ny Mac-version i $V – tar med förra Mac-filerna"
  rm -f $MAC_FILER
  gh release download -R northcrafto/adraze-dl -D dist-installer -p AdRaze.dmg -p AdRaze-mac.zip -p AdRaze-mac.zip.blockmap -p latest-mac.yml 2>/dev/null || true
  command -v notify-send >/dev/null && notify-send "AdRaze $V" "Mac-bygget gjordes inte – förra Mac-versionen följer med" 2>/dev/null || true
fi
MAC_FILER=$(for f in $MAC_FILER; do [ -f "$f" ] && echo "$f"; done)
if [ -n "$ADRAZE_TORR" ]; then git checkout -q package.json package-lock.json; echo "Torrkörning: $V byggd och testad, släpps inte"; exit 0; fi
gh release create "v$V" -R northcrafto/adraze-dl --title "AdRaze $V" --notes "$NOTES" \
  dist-installer/AdRaze.AppImage dist-installer/latest-linux.yml $MAC_FILER
# Windows: byggs och läggs till i släppet först när kodsigneringen är inställd (build/signera-win.js).
# Misslyckas Windows-bygget släpps resten ändå – Windows-användarna får då ingen uppdatering just den här gången.
if node -e "process.exit(require('./build/signera-win.js').konfig() ? 0 : 1)" || [ -n "$ADRAZE_WIN_OSIGNERAD" ]; then
  tools/win/release.sh --publicera || echo "OBS: ingen Windows-version i $V (bygget eller signeringen föll)"
else
  echo "Windows: väntar på kodsigneringen (~/.config/adraze/winsign.json) – ingen Windows-fil i $V"
fi
git add package.json package-lock.json 2>/dev/null || git add package.json
git -c user.name=Cetto -c user.email=cetoari9@gmail.com commit -qm "AdRaze $V: $NOTES"
git push -q origin HEAD:main
echo "Släppt: $V"
