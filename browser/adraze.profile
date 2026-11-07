abi <abi/4.0>,
include <tunables/global>

# AdRaze (AppImage): tillåt user namespaces så att Chromiums sandlåda fungerar
profile adraze /tmp/.mount_AdRaze*/adraze-browser flags=(unconfined) {
  userns,
  include if exists <local/adraze>
}
