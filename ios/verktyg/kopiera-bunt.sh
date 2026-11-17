#!/bin/bash
# kopiera-bunt.sh – kopierar modulernas filer in i appen. Körs av Xcode som skriptfasen
# "Kopiera buntfiler" (project.yml) vid varje bygge, efter kompileringen.
#
#   App/<Modul>/Bunt/**  ->  AdRaze.app/<Modul>/**     (Bunt.url("<Modul>", "fil") i Swift)
#   App/Webb/**          ->  AdRaze.app/Webb/**
#   App/Regler/**        ->  AdRaze.app/Regler/**
#
# Ägare: Grund. rsync --delete håller kopian lik källan, och en mapp som försvunnit tas bort ur appen.
set -euo pipefail
APP="${SRCROOT:?}/App"
MAL="${TARGET_BUILD_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}"
LISTA="${DERIVED_FILE_DIR:?}/buntfiler.txt"
nya=()

kopiera() {   # källmapp, namn i appen
  case "$2" in
    Resources|Frameworks|PlugIns|Extensions|Watch|_CodeSignature|SC_Info|Base|*.lproj|*.bundle|*.app|*.appex)
      echo "error: kopiera-bunt.sh: mappnamnet '$2' krockar med ett namn som iOS reserverar. Byt namn på modulens mapp." >&2
      exit 1 ;;
  esac
  mkdir -p "$MAL/$2"
  rsync -a --delete --exclude '.DS_Store' --exclude '.gitkeep' "$1/" "$MAL/$2/"
  nya+=("$2")
}

for b in "$APP"/*/Bunt; do
  [ -d "$b" ] || continue
  kopiera "$b" "$(basename "$(dirname "$b")")"
done
if [ -d "$APP/Webb" ]; then kopiera "$APP/Webb" Webb; fi
if [ -d "$APP/Regler" ]; then kopiera "$APP/Regler" Regler; fi

# Ta bort det som kopierades förra gången men inte finns längre (t.ex. en modul som byggs utan, -x)
if [ -f "$LISTA" ]; then
  while IFS= read -r gammal; do
    [ -n "$gammal" ] || continue
    kvar=0
    for n in "${nya[@]+"${nya[@]}"}"; do [ "$n" = "$gammal" ] && kvar=1; done
    if [ "$kvar" = 0 ]; then rm -rf "${MAL:?}/$gammal"; fi
  done < "$LISTA"
fi
mkdir -p "$(dirname "$LISTA")"
printf '%s\n' "${nya[@]+"${nya[@]}"}" > "$LISTA"
echo "kopiera-bunt.sh: ${nya[*]+"${nya[*]}"}"
