#!/usr/bin/env bash
# Cut a clip's two halves together (docs/15 §3.3): the terminal take vhs recorded, with its waits
# folded, then the browser half scroll.ts rendered. `compose.sh <terminal.mp4> <browser.mp4> <out.mp4> [gif]`
#
# The fold is `mpdecimate`, not a speed-up: a frame is dropped when under 1.5 % of its blocks changed —
# a spinner, a clock — and kept whenever text arrives, so typing and the model's own words play at the
# speed they happened and a forty-second wait is a beat. `max=29` keeps one frame in thirty of a wait,
# so a wait is visible as a wait. The caption in the README says the waits are folded; nothing else is.
set -euo pipefail
term=$1 site=$2 out=$3 gif=${4:-}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

ffmpeg -y -loglevel error -i "$term" \
  -vf "mpdecimate=max=29:hi=65535:lo=64:frac=0.015,setpts=N/30/TB,scale=1440:900:flags=lanczos,format=yuv420p" \
  -r 30 -c:v libx264 -crf 20 -preset slow "$tmp/term.mp4"
ffmpeg -y -loglevel error -i "$site" -vf "scale=1440:900:flags=lanczos,format=yuv420p" -r 30 -c:v libx264 -crf 20 -preset slow "$tmp/site.mp4"
printf "file '%s'\nfile '%s'\n" "$tmp/term.mp4" "$tmp/site.mp4" > "$tmp/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$tmp/list.txt" -c copy -movflags +faststart "$out"
echo "$out  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | cut -c1-5) s  $(du -k "$out" | cut -f1) KB"

if [ -n "$gif" ]; then
  # The committed fallback: 960 wide, 12 fps, a palette from the clip itself. Budget 4 MB (docs/15 §5 Q2).
  ffmpeg -y -loglevel error -i "$out" -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" "$gif"
  echo "$gif  $(du -k "$gif" | cut -f1) KB"
fi
