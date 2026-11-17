#!/bin/bash
# Bygger E2E-kärnan (Rust, vodozemac) för datorn och iPhone. Körs på mint (tungt: via ~/bin/latt).
#
#   ./bygg.sh            testerna, wasm och iPhone
#   ./bygg.sh test|wasm|ios
#
# wasm → ../browser/e2e/karna.wasm (laddas av ../browser/e2e/karna.js i Node/Electron)
# ios  → ../ios/App/E2E/Karna/AdrazeE2EKarna.xcframework (statiskt bibliotek: iPhone arm64, simulator arm64+x86_64)
set -euo pipefail
HIT="$(cd "$(dirname "$0")" && pwd)"
cd "$HIT"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/adraze-e2e-target}"
LATT=(); [ -x "$HOME/bin/latt" ] && LATT=("$HOME/bin/latt")
VAD="${1:-alla}"

if [[ $VAD == alla || $VAD == test ]]; then
  "${LATT[@]}" cargo test --release
fi

if [[ $VAD == alla || $VAD == wasm ]]; then
  "${LATT[@]}" cargo rustc --release --target wasm32-unknown-unknown --lib --crate-type cdylib
  install -m 644 "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/adraze_e2e.wasm" ../browser/e2e/karna.wasm
  echo "wasm: $(stat -c %s ../browser/e2e/karna.wasm) byte"
fi

if [[ $VAD == alla || $VAD == ios ]]; then
  export IPHONEOS_DEPLOYMENT_TARGET=17.0
  for t in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
    "${LATT[@]}" cargo rustc --release --target "$t" --lib --crate-type staticlib
  done
  # Felsökningsinfo från std följer annars med i de statiska biblioteken (halva storleken); rust-objcopy kommer med rustup
  SYSROOT="$(rustc --print sysroot)"
  OBJCOPY="$SYSROOT/lib/rustlib/$(rustc -vV | sed -n 's/^host: //p')/bin/rust-objcopy"
  for t in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
    a="$CARGO_TARGET_DIR/$t/release/libadraze_e2e.a"
    LD_LIBRARY_PATH="$SYSROOT/lib" "$OBJCOPY" --strip-debug "$a" "$a.tmp" && mv "$a.tmp" "$a"
  done
  python3 "$HIT/xcframework.py" "$CARGO_TARGET_DIR" "$HIT/include/adraze_e2e.h" ../ios/App/E2E/Karna/AdrazeE2EKarna.xcframework
fi
