#!/usr/bin/env bash
#
# Fails if raw capture/reverse-engineering artefacts are tracked by git.
#
# This repository is a non-commercial fan recreation of one game's menu screens, and
# it ships the UI assets it needs to actually look like them: the screen overlays, the
# panel sprites, the menu font and the menu audio, all under assets/. That is a
# deliberate change from the earlier arrangement, where they were kept in a workspace
# outside the tree and a hosted build showed nothing. See PROVENANCE.md.
#
# What still has no business being here is the raw material of the reverse engineering
# itself: frame captures, shader disassembly, texture dumps. Those are large, they are
# not needed to run the page, and they are the artefacts a rights holder would most
# reasonably object to. This runs in CI on every push and can be run by hand:
#
#   ./scripts/check-provenance.sh
#
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
report() { printf '  %s\n' "$1"; fail=1; }

echo "checking tracked filenames..."
while IFS= read -r f; do
  case "$f" in
    *.rdc)                 report "$f  (RenderDoc capture of the game)" ;;
    *_PS.txt|*_VS.txt)     report "$f  (game shader disassembly)" ;;
    *SwirlColorPalletes*)  report "$f  (raw game texture asset)" ;;
    *cmp_game*)            report "$f  (captured frame of the game)" ;;
    *res326*)              report "$f  (dump of a game texture)" ;;
    captures/*|dump/*|reference/*)
                           report "$f  (raw capture directory, keep it out of the tree)" ;;
  esac
done < <(git ls-files)

if [ "$fail" -ne 0 ]; then
  echo
  echo "FAIL: raw capture material is tracked. It belongs outside this"
  echo "      repository. See PROVENANCE.md."
  exit 1
fi

echo "OK: no raw capture material is tracked."
