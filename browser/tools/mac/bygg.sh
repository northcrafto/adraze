#!/bin/bash
# Körs PÅ Mac:en, i skrivbordssessionen (via kor.sh – där nyckelringen med Developer ID-certifikatet är upplåst).
# Bygger AdRaze.dmg + AdRaze-mac.zip (universell: Intel + Apple-chip), Widevine-signerad (castlabs VMP),
# kodsignerad med Developer ID, notariserad av Apple och med kvittot fasthäftat på dmg:n.
set -e
export PATH=$HOME/node/bin:$PATH
cd "$(dirname "$0")/../.."
ID="Developer ID Application: MIR BRUSC BATAK (TSW6WVMNJ8)"
export CSC_NAME="MIR BRUSC BATAK (TSW6WVMNJ8)"
# App Store Connect-nyckeln (samma som asc-mcp) används för notariseringen
# (På GitHub kommer nyckeln och utfärdar-id:t från hemligheterna i stället, se .github/workflows/mac.yml)
export APPLE_API_KEY=${APPLE_API_KEY:-$HOME/.appstoreconnect/private_keys/AuthKey_6D8DAB3LFW.p8} APPLE_API_KEY_ID=${APPLE_API_KEY_ID:-6D8DAB3LFW}
[ -n "$APPLE_API_ISSUER" ] || export APPLE_API_ISSUER=$(python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.config/asc-mcp/companies.json')));d=d if isinstance(d,list) else d['companies'];print(d[0]['issuer_id'])")

# castlabs Electron för båda arkitekturerna (node_modules har bara Mac:ens egen)
EV=$(node -p "require('./node_modules/electron/package.json').version")      # t.ex. 44.9.3+wvcus
ZIPS=$HOME/electron-zips; mkdir -p "$ZIPS"
for a in x64 arm64; do
  f="electron-v$EV-darwin-$a.zip"
  [ -s "$ZIPS/$f" ] || curl -fsSL -o "$ZIPS/$f" "https://github.com/castlabs/electron-releases/releases/download/v${EV/+/%2B}/$f"
  ln -sf "$f" "$ZIPS/electron-v${EV%+*}-darwin-$a.zip"
done

# C++-motorn som universell .node (byggs om bara när källan ändrats)
H=$(cat native/adblock/adblock.cc native/adblock/binding.gyp | shasum | cut -c1-16)
if [ "$(cat native/adblock/build/.mac-hash 2>/dev/null)" != "$H$EV" ]; then
  ( cd native/adblock
    for a in x64 arm64; do
      node-gyp rebuild --target="${EV%+*}" --dist-url=https://electronjs.org/headers --runtime=electron --arch=$a --devdir="$HOME/.electron-gyp" >/tmp/ng-$a.log 2>&1
      cp build/Release/adblock_core.node /tmp/adblock-$a.node
    done
    lipo -create /tmp/adblock-x64.node /tmp/adblock-arm64.node -output build/Release/adblock_core.node
    echo "$H$EV" > build/.mac-hash )
fi

rm -rf dist-installer
# På GitHub följer blockeringsdatan med färdigsynkad från Linux-bygget (rålistorna ligger inte i git)
[ -n "$ADRAZE_UTAN_SYNC" ] || npm run sync
node_modules/.bin/electron-builder --mac --publish never -c.electronDist="$ZIPS" -c.mac.notarize=false

# dmg:n signeras också, skickas till Apple och får kvittot fasthäftat
codesign --force --sign "$ID" --timestamp dist-installer/AdRaze.dmg
xcrun notarytool submit dist-installer/AdRaze.dmg --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait --timeout 40m | tee /tmp/notary.log
grep -q "status: Accepted" /tmp/notary.log
xcrun stapler staple dist-installer/AdRaze.dmg

# latest-mac.yml: dmg:n ändrades av signeringen/häftningen – räkna om dess sha512 och storlek
python3 - <<'PY'
import base64, hashlib, os, re
d = 'dist-installer'; y = open(f'{d}/latest-mac.yml').read()
b = open(f'{d}/AdRaze.dmg', 'rb').read()
sha = base64.b64encode(hashlib.sha512(b).digest()).decode()
y = re.sub(r'(- url: AdRaze\.dmg\n\s+sha512: )\S+(\n\s+size: )\d+', lambda m: m.group(1) + sha + m.group(2) + str(len(b)), y)
open(f'{d}/latest-mac.yml', 'w').write(y)
PY

# Kontroller: appen godkänd av Gatekeeper som notariserad, båda arkitekturerna, Widevine giltig
M=$(hdiutil attach -nobrowse -readonly dist-installer/AdRaze.dmg | tail -1 | sed 's/.*\t//')
trap 'hdiutil detach "$M" -quiet 2>/dev/null || true' EXIT
spctl -a -vv -t exec "$M/AdRaze.app" 2>&1 | grep -q "source=Notarized Developer ID"
lipo -info "$M/AdRaze.app/Contents/MacOS/AdRaze" | grep -q "x86_64 arm64"
$HOME/.castlabs-evs-venv/bin/python -m castlabs_evs.vmp verify-pkg "$M" 2>&1 | grep -q "Signature is valid"
spctl -a -vv -t open --context context:primary-signature dist-installer/AdRaze.dmg 2>&1 | grep -q accepted
echo "MAC-BYGGE OK: $(node -p "require('./package.json').version")"
