#!/bin/bash
# Bygger AdRaze.msix för Microsoft Store på Linux (makemsix från ~/src/msix-packaging).
# Microsoft signerar paketet själva efter granskningen, så vi skickar in det osignerat.
set -e
cd "$(dirname "$0")/.."
source build/store/identitet.env
MAKEMSIX=${MAKEMSIX:-$HOME/src/msix-packaging/.vs/bin/makemsix}
V=$(node -p "require('./package.json').version").0
case "$STORE_PUBLISHER" in *00000000-0000*) echo "[msix] fyll i build/store/identitet.env från Partner Center (Produktidentitet) först"; exit 1;; esac
# castlabs Electron för Windows, samma som tools/win/release.sh
SPEC=$(node -p "const p=require('./package.json'); (p.dependencies||{}).electron||(p.devDependencies||{}).electron||''")
VILL=${SPEC##*#v}
EL="$HOME/.cache/adraze-win/electron-$VILL"
if [ "$(cat "$EL/version" 2>/dev/null)" != "$VILL" ]; then
  echo "[msix] hämtar castlabs Electron $VILL för Windows"
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  for i in 1 2 3 4; do gh release download "v$VILL" -R castlabs/electron-releases -p "electron-v$VILL-win32-x64.zip" -D "$T" && break; sleep 20; done
  rm -rf "$EL" && mkdir -p "$EL" && unzip -q "$T/electron-v$VILL-win32-x64.zip" -d "$EL"
  [ "$(cat "$EL/version")" = "$VILL" ] || { echo "[msix] fel Electron-version i zippen"; exit 1; }
fi
npm run sync
tools/win/bygg-native.sh
rm -rf dist-installer/win-unpacked
npx electron-builder --win dir --x64 --publish never -c.electronDist="$EL"
[ -f dist-installer/win-unpacked/resources/app.asar.unpacked/native/adblock/build/win32-x64/adblock_core.node ] || echo "[msix] OBS: ingen Windows-adblockmotor i paketet"
[ -f dist-installer/win-unpacked/AdRaze.exe.sig ] || echo "[msix] OBS: ingen VMP-signatur (Widevine/Netflix fungerar inte)"
S=dist-installer/msix-stage; rm -rf $S; cp -r dist-installer/win-unpacked $S; mkdir -p $S/Assets
python3 - "$S/Assets" <<'PY'
import sys; from PIL import Image
L=Image.open('../dela-bild/adraze-gorilla.png').convert('RGBA'); d=sys.argv[1]
def ut(namn,w,h,pad=0.0):
  c=Image.new('RGBA',(w,h),(0,0,0,0)); s=int(min(w,h)*(1-pad)); c.alpha_composite(L.resize((s,s),Image.LANCZOS),((w-s)//2,(h-s)//2)); c.save(f'{d}/{namn}')
ut('StoreLogo.png',50,50); ut('Square44x44Logo.png',44,44); ut('Square44x44Logo.targetsize-256.png',256,256)
ut('Square150x150Logo.png',150,150,0.2); ut('Wide310x150Logo.png',310,150,0.2); ut('Square310x310Logo.png',310,310,0.2)
PY
cat > $S/AppxManifest.xml <<XML
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="$STORE_NAME" Publisher="$STORE_PUBLISHER" Version="$V" ProcessorArchitecture="x64"/>
  <Properties>
    <DisplayName>AdRaze</DisplayName>
    <PublisherDisplayName>$STORE_PUBLISHER_NAME</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>The browser that stops ads before they load</Description>
  </Properties>
  <Resources>
    <Resource Language="en-US"/><Resource Language="sv-SE"/>
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0"/>
  </Dependencies>
  <Capabilities>
    <Capability Name="internetClient"/>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
  <Applications>
    <Application Id="AdRaze" Executable="AdRaze.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="AdRaze" Description="The browser that stops ads before they load"
        BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" Square310x310Logo="Assets\Square310x310Logo.png"/>
      </uap:VisualElements>
      <Extensions>
        <uap:Extension Category="windows.protocol"><uap:Protocol Name="http"><uap:DisplayName>AdRaze</uap:DisplayName></uap:Protocol></uap:Extension>
        <uap:Extension Category="windows.protocol"><uap:Protocol Name="https"><uap:DisplayName>AdRaze</uap:DisplayName></uap:Protocol></uap:Extension>
        <uap:Extension Category="windows.fileTypeAssociation">
          <uap:FileTypeAssociation Name="html"><uap:DisplayName>HTML</uap:DisplayName>
            <uap:SupportedFileTypes><uap:FileType>.html</uap:FileType><uap:FileType>.htm</uap:FileType><uap:FileType>.pdf</uap:FileType></uap:SupportedFileTypes>
          </uap:FileTypeAssociation>
        </uap:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
XML
rm -f dist-installer/AdRaze.msix
LD_LIBRARY_PATH=$(dirname $MAKEMSIX)/../lib $MAKEMSIX pack -d $S -p dist-installer/AdRaze.msix
ls -la dist-installer/AdRaze.msix
