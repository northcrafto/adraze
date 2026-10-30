#!/bin/bash
# Hämtar AdRaze-blockerarens regler, kosmetik och innehållsskript från tillägget (~/adraze/extension)
set -e
cd "$(dirname "$0")/.."
SRC="${1:-../extension}"   # tillägget ligger bredvid i samma repo
rm -rf adraze && mkdir -p adraze/rules adraze/data adraze/content adraze/lists
cp "$SRC"/rules/*.json adraze/rules/
cp "$SRC"/data/{cosmetic,kakor,popup-hosts}.json adraze/data/
cp "$SRC"/content/{cosmetic,kakor,guard,youtube}.js adraze/content/
# Rålistorna (EasyList m.fl.) som vår C++-motor äter — hämtade av tools/build.js till ../tools/lists
LISTS="${2:-../tools/lists}"
for f in easylist easyprivacy ubo-filters ubo-quick-fixes ubo-unbreak peterlowe frellwit badware adguard-popups adraze-natverk; do
  [ -f "$LISTS/$f.txt" ] && cp "$LISTS/$f.txt" adraze/lists/ || echo "  (saknar $f.txt — motorn hoppar den)"
done
grep -m1 '"version"' "$SRC/manifest.json" | sed 's/[^0-9.]//g' > adraze/VERSION
echo "AdRaze-blockeraren $(cat adraze/VERSION) synkad"
