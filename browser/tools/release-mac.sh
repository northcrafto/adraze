#!/bin/bash
# Bygger Mac-versionen på MacBooken (ssh mac, Intel, Xcode + Developer ID-certifikatet i nyckelringen)
# från exakt samma källkod och version som Linux-bygget, och hämtar hem filerna till dist-installer/.
# Själva bygget: tools/mac/bygg.sh (körs i Mac:ens skrivbordssession via tools/mac/kor.sh).
set -e
cd "$(dirname "$0")/.."
ssh -o ConnectTimeout=8 -o BatchMode=yes mac true
X=(--exclude node_modules --exclude .git --exclude dist --exclude dist-installer --exclude /adraze --exclude native/adblock/build)
rsync -az --delete "${X[@]}" ./ mac:adraze-src/browser/
rsync -az --delete ../extension/ mac:adraze-src/extension/
rsync -az --delete --exclude node_modules ../tools/ mac:adraze-src/tools/
# Beroenden bara när package-lock ändrats
ssh mac 'cd ~/adraze-src/browser && export PATH=$HOME/node/bin:$PATH && H=$(shasum package-lock.json | cut -c1-16) &&
  if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$H" ]; then npm install --no-audit --no-fund >/tmp/npm-mac.log 2>&1 && node node_modules/electron/install.js && echo "$H" > node_modules/.lock-hash; fi'
if ! ssh mac 'cd ~/adraze-src/browser && tools/mac/kor.sh /tmp/bygg-mac.log tools/mac/bygg.sh >/dev/null'; then
  ssh mac 'tail -25 /tmp/bygg-mac.log'; echo "Mac-bygget misslyckades"; exit 1
fi
for f in AdRaze.dmg AdRaze-mac.zip AdRaze-mac.zip.blockmap latest-mac.yml; do scp -q "mac:adraze-src/browser/dist-installer/$f" dist-installer/; done
grep -q "^version: $(node -p "require('./package.json').version")$" dist-installer/latest-mac.yml
echo "Mac: $(ls -la dist-installer/AdRaze.dmg | awk '{print $5}') byte dmg, notariserad"
