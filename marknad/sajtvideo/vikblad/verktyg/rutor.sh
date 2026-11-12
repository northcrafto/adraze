#!/bin/bash
# Plockar ut bildrutor i full storlek ur renders/final.mp4 (eller en annan fil) till renders/rutor/.
#   flock /home/mint/.cache/claude-arbete/tung.lock /home/mint/bin/latt bash verktyg/rutor.sh "0 0.1 2.6 4.8" [video]
set -e
cd "$(dirname "$0")/.."
V="${2:-renders/final.mp4}"
mkdir -p renders/rutor
for t in $1; do
  ffmpeg -y -v error -ss "$t" -i "$V" -frames:v 1 "renders/rutor/ruta-$t.png"
  echo "renders/rutor/ruta-$t.png"
done
