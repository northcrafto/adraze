#!/bin/sh
# Installerar Prowl på Linux (bara för din användare; sudo bara om du själv väljer
# att slå på sandlådan på Ubuntu 24.04+):
#   curl -fsSL https://download.adraze.app/prowl/install.sh | sh
# Lägger AppImagen i ~/Applications, kommandot "prowl" i ~/.local/bin och Prowl i programmenyn.
# Ny version: kör samma rad igen. Ta bort: curl -fsSL https://download.adraze.app/prowl/install.sh | sh -s -- --ta-bort
set -eu

APP="$HOME/Applications/Prowl.AppImage"
BIN="$HOME/.local/bin/prowl"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP="$DATA/applications/prowl.desktop"
IKON="$DATA/icons/prowl/prowl.png"
URL="https://download.adraze.app/prowl/Prowl.AppImage"

if [ "${1:-}" = "--ta-bort" ] || [ "${1:-}" = "--uninstall" ]; then
  rm -f "$APP" "$BIN" "$DESKTOP" "$IKON"
  [ -e /etc/apparmor.d/prowl ] && echo "The sandbox rule /etc/apparmor.d/prowl is still there; remove it with: sudo rm /etc/apparmor.d/prowl"
  echo "Prowl removed. Your settings are still in ~/.config/Prowl-ny."
  exit 0
fi

[ "$(uname -s)" = "Linux" ] || { echo "This script is for Linux." >&2; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) ;;
  *) echo "Prowl is only available for 64-bit x86 (x86_64) for now." >&2; exit 1 ;;
esac
command -v curl >/dev/null || { echo "curl is missing." >&2; exit 1; }

echo "Downloading Prowl …"
mkdir -p "$(dirname "$APP")" "$(dirname "$BIN")" "$(dirname "$DESKTOP")" "$(dirname "$IKON")"
curl -fL --progress-bar -o "$APP.ny" "$URL"
# Kontrollsumman ligger bredvid filen: en trasig eller avbruten hämtning installeras aldrig
SUMMA="$(curl -fsSL "$URL.sha256" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null && [ -n "$SUMMA" ]; then
  FICK="$(sha256sum "$APP.ny" | cut -d' ' -f1)"
  if [ "$SUMMA" != "$FICK" ]; then
    rm -f "$APP.ny"
    echo "The download does not match its checksum. Nothing was installed, try again." >&2
    exit 1
  fi
  echo "Checksum OK."
fi
chmod +x "$APP.ny"
mv -f "$APP.ny" "$APP"
curl -fsSL -o "$IKON" "https://download.adraze.app/prowl/prowl-icon.png" || true

# Startfilen kör Prowl i Chromiums sandlåda (som Chrome/Brave) när systemet tillåter den.
# Samma kontroll som sandladeFlagga() i browser/main.js.
cat > "$BIN" <<EOF
#!/bin/sh
# Prowl i Chromiums sandlåda när systemet tillåter den (annars utan)
unset CHROME_DESKTOP   # ärvd från andra Electron-appar får castlabs-Electron att krascha vid start
FLAGGA=""
if [ "\$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)" = "0" ] || [ "\$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 1)" = "0" ]; then FLAGGA="--no-sandbox"
elif [ "\$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = "1" ] && [ ! -e /etc/apparmor.d/prowl ]; then FLAGGA="--no-sandbox"; fi
exec "$APP" \$FLAGGA "\$@"
EOF
chmod +x "$BIN"

# Ubuntu 24.04+ stänger av sandlådan för program utan en AppArmor-regel. Chrome och Brave
# installerar en sådan; Prowl erbjuder samma (kräver sudo en gång).
APPARMOR_REGEL='abi <abi/4.0>,
include <tunables/global>

# Prowl (AppImage): tillåt user namespaces så att Chromiums sandlåda fungerar
profile prowl /tmp/.mount_Prowl*/prowl-browser flags=(unconfined) {
  userns,
  include if exists <local/prowl>
}'
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = "1" ] && [ ! -e /etc/apparmor.d/prowl ]; then
  svar=n
  if [ -r /dev/tty ] && command -v sudo >/dev/null; then
    printf '\nYour system turns off the browser sandbox for apps without an AppArmor rule.\nAdd the rule now so Prowl runs sandboxed like Chrome and Brave? (needs sudo) [Y/n] '
    read -r svar < /dev/tty || svar=n
    [ -z "$svar" ] && svar=y
  fi
  case "$svar" in
    y|Y|j|J|yes|ja)
      if printf '%s\n' "$APPARMOR_REGEL" | sudo tee /etc/apparmor.d/prowl >/dev/null && sudo apparmor_parser -r /etc/apparmor.d/prowl; then
        echo "Sandbox enabled."
      else
        sudo rm -f /etc/apparmor.d/prowl 2>/dev/null || true
        echo "Could not add the rule. Prowl will run without the sandbox."
      fi ;;
    *) echo "Prowl will run without the sandbox. Run the installer again to turn it on." ;;
  esac
fi

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Name=Prowl
GenericName=Web Browser
Comment=The browser for developers and security testers
Exec=$BIN %U
Icon=$IKON
Terminal=false
Type=Application
Categories=Network;WebBrowser;
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
StartupWMClass=Prowl
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
echo "Done! Start Prowl from your app menu or with the command: prowl"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "(~/.local/bin is not in your PATH, so use the app menu or $BIN)";; esac
