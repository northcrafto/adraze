#!/bin/bash
# Hämtar AdRaze-blockerarens regler, kosmetik och innehållsskript från tillägget (~/adraze/extension)
set -e
cd "$(dirname "$0")/.."
SRC="${1:-../extension}"   # tillägget ligger bredvid i samma repo
rm -rf adraze && mkdir -p adraze/rules adraze/data adraze/content
cp "$SRC"/rules/*.json adraze/rules/
cp "$SRC"/data/{cosmetic,kakor,popup-hosts}.json adraze/data/
cp "$SRC"/content/{cosmetic,kakor,guard,youtube}.js adraze/content/
grep -m1 '"version"' "$SRC/manifest.json" | sed 's/[^0-9.]//g' > adraze/VERSION
echo "AdRaze-blockeraren $(cat adraze/VERSION) synkad"
