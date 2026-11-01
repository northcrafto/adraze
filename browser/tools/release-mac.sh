#!/bin/bash
# Bygger Mac-versionen på MacBooken (ssh mac, Intel, Xcode + Developer ID-certifikatet i nyckelringen)
# från exakt samma källkod och version som Linux-bygget, och hämtar hem filerna till dist-installer/.
# Själva bygget: tools/mac/bygg.sh (körs i Mac:ens skrivbordssession via tools/mac/kor.sh).
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")

# MacBooken avstängd → bygg på GitHubs Mac-datorer i stället (.github/workflows/mac.yml)
github_bygge() {
  echo "MacBooken svarar inte – bygger Mac-versionen på GitHub"
  local R=northcrafto/adraze SHA
  git push -q origin HEAD:main
  SHA=$(git rev-parse HEAD)
  # Blockeringsdatan (rålistorna finns inte i git) följer med som ett paket i ett utkast-släpp
  gh release view mac-indata -R $R >/dev/null 2>&1 || gh release create mac-indata -R $R --draft --title "Indata till Mac-bygget" --notes "Används av Mac-bygget på GitHub. Inte en version av AdRaze."
  tar -czf "/tmp/adraze-data-$V.tar.gz" adraze
  gh release upload mac-indata -R $R --clobber "/tmp/adraze-data-$V.tar.gz"
  rm -f "/tmp/adraze-data-$V.tar.gz"
  local FORE; FORE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run mac.yml -R $R -f ref="$SHA" -f version="$V"
  local RUN=""
  for i in $(seq 1 30); do
    RUN=$(gh run list -R $R --workflow mac.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt -q "[.[] | select(.createdAt >= \"$FORE\")][0].databaseId")
    [ -n "$RUN" ] && break; sleep 4
  done
  [ -n "$RUN" ] || { echo "Mac-bygget på GitHub startade inte"; return 1; }
  echo "GitHub-körning: https://github.com/$R/actions/runs/$RUN"
  gh run watch "$RUN" -R $R --exit-status --interval 30 >/dev/null || { gh run view "$RUN" -R $R --log-failed | tail -30; echo "Mac-bygget på GitHub misslyckades"; return 1; }
  rm -rf /tmp/adraze-mac-$V && gh run download "$RUN" -R $R -n "adraze-mac-$V" -D /tmp/adraze-mac-$V
  for f in AdRaze.dmg AdRaze-mac.zip AdRaze-mac.zip.blockmap latest-mac.yml; do cp "/tmp/adraze-mac-$V/$f" dist-installer/; done
  rm -rf /tmp/adraze-mac-$V
  grep -q "^version: $V$" dist-installer/latest-mac.yml
  echo "Mac: $(ls -la dist-installer/AdRaze.dmg | awk '{print $5}') byte dmg, notariserad (GitHub)"
}
if [ -n "$ADRAZE_MAC_GITHUB" ] || ! ssh -o ConnectTimeout=8 -o BatchMode=yes mac true 2>/dev/null; then github_bygge; exit $?; fi
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
