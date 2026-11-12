#!/bin/bash
# Ark med varje bildruta i ett avsnitt av den färdiga videon: tools/remsa.sh <video> <start> <antal rutor> <ut.jpg> [kolumner] [cellbredd]
# Körs genom låset.
V=$1; S=$2; N=$3; UT=$4; K=${5:-5}; W=${6:-384}
R=$(( (N + K - 1) / K ))
ffmpeg -y -v error -ss "$S" -i "$V" -frames:v 1 -vf "fps=30,scale=$W:-1,drawtext=text='%{eif\:n+round($S*30)\:d}':x=6:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=${K}x${R}:nb_frames=$N" -q:v 3 "$UT" && echo "$UT"
