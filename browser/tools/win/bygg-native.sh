#!/bin/bash
# Korskompilerar adblock-motorn (native/adblock) för Windows x64 med mingw, här på Linux.
# N-API-funktionerna importeras från AdRaze.exe (Electron exporterar dem från programfilen), så ingen node.lib behövs.
# Resultat: native/adblock/build/win32-x64/adblock_core.node. Misslyckas bygget används JS-matchningen på Windows.
set -e
cd "$(dirname "$0")/../.."
UT=native/adblock/build/win32-x64; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
command -v x86_64-w64-mingw32-g++ >/dev/null || { echo "[native-win] mingw saknas (apt install g++-mingw-w64-x86-64) — hoppar"; exit 0; }
INC=$(ls -d "$HOME"/.cache/node-gyp/*/include/node "$HOME"/.electron-gyp/*/include/node 2>/dev/null | sort -V | tail -1)
[ -f "$INC/node_api.h" ] || { echo "[native-win] hittar inga N-API-headers — hoppar"; exit 0; }
NAA=$(node -p "require('node-addon-api').include" | tr -d '"')
x86_64-w64-mingw32-g++ -std=c++17 -O3 -fexceptions -DNAPI_CPP_EXCEPTIONS -DNAPI_VERSION=9 -DBUILDING_NODE_EXTENSION \
  -I"$INC" -I"$NAA" -c native/adblock/adblock.cc -o "$TMP/adblock.o"
{ echo "LIBRARY AdRaze.exe"; echo EXPORTS
  x86_64-w64-mingw32-nm "$TMP/adblock.o" | awk '$1=="U" {print $2}' | grep -E '^__imp_(napi_|node_api_)' | sed 's/^__imp_//' | sort -u; } > "$TMP/node.def"
x86_64-w64-mingw32-dlltool -d "$TMP/node.def" -l "$TMP/libnode.a"
mkdir -p "$UT"
x86_64-w64-mingw32-g++ -shared -s -o "$UT/adblock_core.node" "$TMP/adblock.o" -L"$TMP" -lnode \
  -static-libgcc -static-libstdc++ -Wl,-Bstatic -lwinpthread -Wl,-Bdynamic
# Får bara bero på AdRaze.exe och Windows egna DLL:er
DLL=$(x86_64-w64-mingw32-objdump -p "$UT/adblock_core.node" | awk '/DLL Name/ {print $3}' | sort -u | tr '\n' ' ')
for d in $DLL; do case "$d" in AdRaze.exe|KERNEL32.dll|msvcrt.dll) ;; *) echo "[native-win] oväntat beroende $d — kasseras"; rm -f "$UT/adblock_core.node"; exit 0;; esac; done
echo "[native-win] klart: $(stat -c%s "$UT/adblock_core.node") byte ($DLL)"
