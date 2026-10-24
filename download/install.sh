#!/bin/sh
# Installerar AdRaze-webbläsaren på Linux (bara för din användare, inget sudo):
#   curl -fsSL https://download.adraze.app/install.sh | sh
# Lägger AppImagen i ~/Applications, kommandot "adraze" i ~/.local/bin och AdRaze i programmenyn.
# Uppdateringar sköter webbläsaren själv. Ta bort: curl -fsSL https://download.adraze.app/install.sh | sh -s -- --ta-bort
set -eu

APP="$HOME/Applications/AdRaze.AppImage"
BIN="$HOME/.local/bin/adraze"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP="$DATA/applications/adraze-browser.desktop"
IKON="$DATA/icons/adraze/adraze.png"
URL="https://github.com/northcrafto/adraze-dl/releases/latest/download/AdRaze.AppImage"

if [ "${1:-}" = "--ta-bort" ] || [ "${1:-}" = "--uninstall" ]; then
  rm -f "$APP" "$BIN" "$DESKTOP" "$IKON"
  echo "AdRaze removed. Your settings are still in ~/.config/AdRaze."
  exit 0
fi

[ "$(uname -s)" = "Linux" ] || { echo "This script is for Linux." >&2; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) ;;
  *) echo "AdRaze is only available for 64-bit x86 (x86_64) for now." >&2; exit 1 ;;
esac
command -v curl >/dev/null || { echo "curl is missing." >&2; exit 1; }

echo "Downloading AdRaze …"
mkdir -p "$(dirname "$APP")" "$(dirname "$BIN")" "$(dirname "$DESKTOP")" "$(dirname "$IKON")"
curl -fL --progress-bar -o "$APP.ny" "$URL"
chmod +x "$APP.ny"
mv -f "$APP.ny" "$APP"
curl -fsSL -o "$IKON" "https://download.adraze.app/adraze-512.png" || true

# --no-sandbox: nyare Ubuntu (AppArmor) stoppar Chromiums sandlåda i AppImages
cat > "$BIN" <<EOF
#!/bin/sh
exec "$APP" --no-sandbox "\$@"
EOF
chmod +x "$BIN"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Name=AdRaze
GenericName=Web Browser
Comment=The browser that stops ads before they load
Exec=$BIN %U
Icon=$IKON
Terminal=false
Type=Application
Categories=Network;WebBrowser;
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
StartupWMClass=AdRaze
EOF
command -v update-desktop-database >/dev/null && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true

# AppImages behöver FUSE 2
har_fuse2() {
  { /sbin/ldconfig -p 2>/dev/null || ldconfig -p 2>/dev/null; } | grep -q 'libfuse\.so\.2' && return 0
  for f in /usr/lib/libfuse.so.2 /usr/lib64/libfuse.so.2 /usr/lib/*/libfuse.so.2 /lib/*/libfuse.so.2; do [ -e "$f" ] && return 0; done
  return 1
}
if ! har_fuse2; then
  echo
  echo "Note: libfuse2 seems to be missing, and AppImages need it. Install it with for example:"
  echo "  sudo apt install libfuse2t64    (Ubuntu 24.04+, Mint 22+)"
  echo "  sudo apt install libfuse2       (older Ubuntu/Debian)"
  echo "  sudo dnf install fuse-libs      (Fedora)"
fi

echo
echo "Done! Start AdRaze from your app menu or with the command: adraze"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "(~/.local/bin is not in your PATH, so use the app menu or $BIN)";; esac
