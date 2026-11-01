#!/bin/bash
# Kör ett kommando i Macens skrivbordssession (där nyckelringen är upplåst), osynligt via launchd.
# Användning: kor.sh <loggfil> <kommando...>
LOG="$1"; shift
ID="app.adraze.kor.$$"; P="/tmp/$ID.plist"; S="/tmp/$ID.sh"
printf "#!/bin/bash\nexport PATH=\$HOME/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin\ncd \"%s\"\n%s\necho __SLUT__ \$?\n" "$PWD" "$*" > "$S"; chmod +x "$S"
cat > "$P" <<P2
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>$ID</string><key>ProgramArguments</key><array><string>$S</string></array>
<key>StandardOutPath</key><string>$LOG</string><key>StandardErrorPath</key><string>$LOG</string><key>RunAtLoad</key><true/></dict></plist>
P2
: > "$LOG"
launchctl bootstrap gui/$(id -u) "$P" || exit 1
until grep -q "^__SLUT__" "$LOG" 2>/dev/null; do sleep 2; done
launchctl bootout gui/$(id -u)/$ID 2>/dev/null; rm -f "$P" "$S"
cat "$LOG"; tail -1 "$LOG" | grep -q "__SLUT__ 0"
