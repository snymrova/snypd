#!/usr/bin/env bash
# V2's browser half (docs/15 §3.3): the same post in every look the shelf carries, three seconds each,
# cut together — the fold, then one screen down, so it is the look that changes and not the page. `looks.sh <site-root> <route> <out.mp4>` — builds each look from the site's `main` into
# a scratch copy, so a recording that is still changing the site's own theme is not disturbed.
set -euo pipefail
site=$1 route=$2 out=$3
here=$(cd "$(dirname "$0")" && pwd); repo=$(cd "$here/../../.." && pwd)
work=$repo/.scratch/readme-looks; rm -rf "$work"; mkdir -p "$work/site"
git -C "$site" archive main | tar -x -C "$work/site"
list=$work/list.txt; : > "$list"
for look in "editorial paper" "editorial ink" "editorial broadsheet" "base" "technical graphite" "technical phosphor"; do
  set -- $look; theme=$1; var=${2:-}; slug=$theme${var:+-$var}
  bun "$here/build-look.ts" --root="$work/site" --theme="$theme" ${var:+--variation=$var} --out="$work/dist-$slug"
  scheme=light; case "$var" in ink|phosphor) scheme=dark;; esac
  bun "$here/scroll.ts" --dist="$work/dist-$slug" --route="$route" --out="$work/$slug.mp4" --seconds=2.4 --hold=1.2 --max=760 --scheme=$scheme
  printf "file '%s'\n" "$work/$slug.mp4" >> "$list"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c copy "$out"
echo "$out  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | cut -c1-5) s"
