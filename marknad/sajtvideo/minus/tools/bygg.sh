#!/bin/bash
# Bygger hela videon: musik, kontroll, rendering, ljudnivå och granskningsark. Allt tungt går genom låset, ett steg i taget.
#   tools/bygg.sh            allt
#   tools/bygg.sh utan-musik hoppar över musiken (när bara bilden är ändrad)
set -e
cd "$(dirname "$0")/.."
LAS="flock /home/mint/.cache/claude-arbete/tung.lock"
LATT=/home/mint/bin/latt
QA=/home/mint/adraze-reels/verktyg/qa.py
if [ "$1" != "utan-musik" ]; then $LAS $LATT /home/mint/adraze-reels/venv/bin/python audio/score.py; fi
$LAS $LATT npx --yes hyperframes@0.8.140 check | grep -v '^$' | tail -25
$LAS env LATT_MEM=5000M $LATT npx --yes hyperframes@0.8.140 render -o renders/ut.mp4 2>&1 | tail -5
$LAS $LATT python3 $QA normalisera renders/ut.mp4 renders/norm.mp4
# qa.py lägger 0,1 s tystnad sist i ljudspåret. Klipp den (utan omkodning), så att filen är exakt 30,0 s och loopen inte hackar.
$LAS $LATT ffmpeg -y -v error -i renders/norm.mp4 -c copy -t 29.99 -movflags +faststart renders/final.mp4
rm -f renders/norm.mp4
$LAS $LATT python3 $QA kolla renders/final.mp4 || true
ffprobe -v error -show_entries stream=codec_type,duration,nb_frames -show_entries format=duration -of compact renders/final.mp4
