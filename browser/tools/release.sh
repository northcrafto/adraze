#!/bin/bash
# Släpper en ny AdRaze-version till alla (in-app-uppdatering via northcrafto/adraze-dl).
# Användning: tools/release.sh ["vad som är nytt"]   — höjer patch-versionen själv.
set -e
cd "$(dirname "$0")/.."
NOTES="${1:-Uppdatering}"
V=$(npm version patch --no-git-tag-version | tr -d v)
rm -f dist-installer/latest-linux.yml dist-installer/AdRaze.AppImage
npm run build:linux -- --publish never
grep -q "^version: $V$" dist-installer/latest-linux.yml || { echo "latest-linux.yml har fel version"; exit 1; }
gh release create "v$V" -R northcrafto/adraze-dl --title "AdRaze $V" --notes "$NOTES" \
  dist-installer/AdRaze.AppImage dist-installer/latest-linux.yml
git add package.json package-lock.json 2>/dev/null || git add package.json
git -c user.name=Cetto -c user.email=cetoari9@gmail.com commit -qm "AdRaze $V: $NOTES"
git push -q
echo "Släppt: $V"
