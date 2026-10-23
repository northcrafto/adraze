#!/bin/bash
# Bygger AdRaze.msix för Microsoft Store på Linux (makemsix från ~/src/msix-packaging).
# Microsoft signerar paketet själva efter granskningen, så vi skickar in det osignerat.
set -e
cd "$(dirname "$0")/.."
source build/store/identitet.env
MAKEMSIX=${MAKEMSIX:-$HOME/src/msix-packaging/.vs/bin/makemsix}
V=$(node -p "require('./package.json').version").0
npm run sync
npx electron-builder --win dir --x64 --publish never -c.electronDist=$HOME/.castlabs-electron-dist
S=dist-installer/msix-stage; rm -rf $S; cp -r dist-installer/win-unpacked $S; mkdir -p $S/Assets
python3 - "$S/Assets" <<'PY'
import sys; from PIL import Image
L=Image.open('../logo/falk/falk-ljus-1024.png'); d=sys.argv[1]
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
    <Description>Webbläsaren som stoppar reklamen innan den laddas</Description>
  </Properties>
  <Resources>
    <Resource Language="sv-SE"/><Resource Language="en-US"/>
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
      <uap:VisualElements DisplayName="AdRaze" Description="Webbläsaren som stoppar reklamen innan den laddas"
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
