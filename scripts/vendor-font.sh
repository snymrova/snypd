#!/usr/bin/env bash
# Vendor a theme's one webfont (B1, decision 118): download, pin the axes it does not need, subset to
# Latin, compress to WOFF2, and print the `font:` block for `theme.yaml` — including the fallback face's
# metric overrides, computed from both fonts rather than guessed.
#
# This is not part of the build. A theme ships the .woff2 as a file, the same way it ships theme.css, and
# decision 118's budget counts that file. What this script exists for is that the budget is only a claim
# if the file can be regenerated: run it, diff the bytes, and either the face in `themes/` is the one this
# script makes or it is not. **It is byte-reproducible**, which took two pins — the source commit and
# `SOURCE_DATE_EPOCH` — because neither was true of the obvious version: a `main` URL diffs against
# whatever upstream did last, and fontTools stamps `head.modified` with the clock, which put two runs a
# minute apart four bytes apart after brotli. Without both, "re-run it and diff" is a ritual.
#
# Machine dependencies, like Chrome for `snypd bench page`: fontTools (pyftsubset, `fonttools
# varLib.instancer`) with brotli, and fontconfig (fc-match) to find the fallback face on this box.
#
#   scripts/vendor-font.sh themes/editorial/fonts/source-serif-4-latin.woff2
#
set -euo pipefail

# ── what editorial ships ───────────────────────────────────────────────────────────────────────────────
# Source Serif 4 (Adobe, OFL 1.1), the Roman. A text face in the Charter/Palatino register the theme's
# stack already names, so a visitor who has none of them gets the face the theme was drawn for and one who
# has Georgia gets a fallback three per cent away from it.
# Pinned to a commit, not to `main`. A URL that tracks a branch makes "re-run it and diff the bytes"
# meaningless — the diff would be upstream's, and a theme's face would change under a site that never
# asked it to. Two pins and not one, because the two files were last touched four years apart and the
# font's commit predates the licence at that path: pinning both to the font's gave a 200 for the face and
# a 404 for the notice, which `curl -sSL` will write into a file and call a licence. Hence `--fail`, below.
SRC_REF="7b203a635ebe80801c80f29633d4fc467cd1214e"            # last touched the .ttf, 17 Nov 2021
LICENSE_REF="01aa15d05749e35be9167f3f44e6a243f00cd2fc"        # last touched OFL.txt, 9 Jan 2025
SRC_URL="https://raw.githubusercontent.com/google/fonts/$SRC_REF/ofl/sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf"
LICENSE_URL="https://raw.githubusercontent.com/google/fonts/$LICENSE_REF/ofl/sourceserif4/OFL.txt"
# fontTools stamps `head.modified` with the clock on every save, so two runs a minute apart compress to
# different bytes. `SOURCE_DATE_EPOCH` is the reproducible-builds lever fontTools already honours, and
# with it pinned beside the source commit this script is a function of its own text.
export SOURCE_DATE_EPOCH=1637145737
# `opsz` is pinned, not shipped: a second axis on a serif is ~16 KB of `gvar` for an effect at 16 px that
# is smaller than the difference between two screens. `wght` stays a range — 400 to 700 is body, heading
# and `strong` out of one file, which is the whole argument for a variable font at this budget.
INSTANCE=(opsz=16 wght=400:700)
# Google's `latin` unicode-range. Not the corpus this repo happens to contain: a theme is shipped to other
# people's sites, and subsetting to the text you can see is how a theme breaks on the first word of German.
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
# `kern,liga,clig,calt` and no figure sets. Oldstyle, tabular, lining and proportional figures are four
# more sets of digit outlines and 6 KB of a 40 KB budget — 15 % of everything this theme may spend, for a
# typographic nicety, on a face whose default figures are already right for prose.
FEATURES="kern,liga,clig,calt"
# The face whose metrics the fallback @font-face overrides. Georgia is in editorial's own stack, is on
# every Mac and every Windows, and is the closest of them to Source Serif in colour.
FALLBACK_LOCAL="Georgia"
# The weight the overrides are computed at: a variable font's advances move with `wght`, and the one that
# decides where a line breaks is the one the prose is set in.
MEASURE_WEIGHT=400

OUT="${1:-themes/editorial/fonts/source-serif-4-latin.woff2}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ $SRC_URL"
mkdir -p "$(dirname "$OUT")"
curl -sSL --fail -o "$WORK/src.ttf" "$SRC_URL"
fonttools varLib.instancer -q -o "$WORK/var.ttf" "$WORK/src.ttf" "${INSTANCE[@]}"
pyftsubset "$WORK/var.ttf" --output-file="$OUT" --flavor=woff2 \
  --unicodes="$UNICODES" --layout-features="$FEATURES" --no-hinting --desubroutinize
# The licence travels with the font, here and into `dist/`: the OFL requires it of anyone who
# redistributes the file, and a site built from this theme redistributes it on every page it serves.
curl -sSL --fail -o "$(dirname "$OUT")/OFL.txt" "$LICENSE_URL"

# The static instance the overrides are measured at — never shipped, only measured.
fonttools varLib.instancer -q -o "$WORK/measure.ttf" "$WORK/var.ttf" "wght=$MEASURE_WEIGHT"

python3 - "$OUT" "$WORK/measure.ttf" "$(fc-match -f '%{file}' "$FALLBACK_LOCAL:style=Regular")" "$FALLBACK_LOCAL" <<'PY'
import sys
from fontTools.ttLib import TTFont

out, measured, fallback_file, fallback_name = sys.argv[1:5]

# English letter frequency plus the space, because what a fallback has to match is where the line breaks,
# and a line breaks on spaces between the letters people actually type. An unweighted alphabet average
# would let `q`, `x` and `z` carry as much of the answer as `e`.
FREQ = {"e":127,"t":91,"a":82,"o":75,"i":70,"n":67,"s":63,"h":61,"r":60,"d":43,"l":40,"c":28,"u":28,
        "m":24,"w":24,"f":22,"g":20,"y":20,"p":19,"b":15,"v":10,"k":8,"j":2,"x":2,"q":1,"z":1}
FREQ[" "] = sum(FREQ.values()) // 5      # one space per ~5 characters of running English

def avg_width(path):
    f = TTFont(path, fontNumber=0)
    cmap, hmtx, upm = f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm
    num = den = 0
    for ch, w in FREQ.items():
        g = cmap.get(ord(ch))
        if g is None: continue
        num += hmtx[g][0] / upm * w
        den += w
    return num / den

def line_box(path):
    f = TTFont(path, fontNumber=0)
    o, h, upm = f["OS/2"], f["hhea"], f["head"].unitsPerEm
    # The bit a browser actually reads: USE_TYPO_METRICS says the sTypo* triple is authoritative, and
    # without it the line box comes from hhea. Reading the wrong one is how a "metric-matched" fallback
    # ends up a line taller than the face it stands in for.
    if o.fsSelection & (1 << 7):
        return o.sTypoAscender / upm, -o.sTypoDescender / upm, o.sTypoLineGap / upm
    return h.ascent / upm, -h.descent / upm, h.lineGap / upm

wf, fb = avg_width(measured), avg_width(fallback_file)
size_adjust = wf / fb
asc, desc, gap = line_box(measured)
pct = lambda x: f"{x * 100:.1f}%"

print(f"""
    font:
      family: {TTFont(measured, fontNumber=0)['name'].getDebugName(16) or TTFont(measured, fontNumber=0)['name'].getDebugName(1)}
      file: ./fonts/{out.split('/')[-1]}
      weight: 400 700
      kb: {-(-__import__('os').path.getsize(out) // 1024)}
      fallback:
        local: {fallback_name}
        size-adjust: {pct(size_adjust)}
        ascent-override: {pct(asc / size_adjust)}
        descent-override: {pct(desc / size_adjust)}
        line-gap-override: {pct(gap / size_adjust)}

    {out}: {__import__('os').path.getsize(out)} bytes
    weighted mean advance — webfont {wf:.4f} em, {fallback_name} {fb:.4f} em
""")
PY
