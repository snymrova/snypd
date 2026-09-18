"""
The wordmark (docs/15 §4 A): `python3 packages/bench/readme/wordmark.py` → .github/readme/wordmark-{light,dark}.svg

Typographic only — the word `snypd` set in the face `editorial` ships, Source Serif 4, at weight 600,
its outlines taken from the theme's own woff2 and written as paths so the SVG needs no font at all
(GitHub renders a README's images in an `<img>`, which loads no font, and a README is forked onto
machines that have none). One colour per file, because an `<img>` cannot read `currentColor`; the
README picks a file per scheme with `<picture>`. The full stop is the theme's accent. No mark, no
mascot: decision 145's instinct applies to the brand as much as to the product.
"""
import io, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONT = "themes/editorial/fonts/source-serif-4-latin.woff2"
OUT = sys.argv[1] if len(sys.argv) > 1 else ".github/readme"
WORD = "snypd"
WEIGHT = 600
SIZE = 96                    # px em
TRACK = -0.01                # em, a touch tighter than the face's own spacing at this size
INK = {"light": "#1d1a17", "dark": "#f4efe6"}
ACCENT = "#8a3324"

font = TTFont(FONT)
if "fvar" in font:
    font = instantiateVariableFont(font, {"wght": WEIGHT})
upem = font["head"].unitsPerEm
scale = SIZE / upem
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font["hmtx"]

# GPOS pair kerning, flattened: the face kerns `y` against `p` and `n` against `y`, and a wordmark set
# without it reads as typed rather than set.
def kern(a, b):
    if "GPOS" not in font: return 0
    for lookup in font["GPOS"].table.LookupList.Lookup:
        if lookup.LookupType != 2: continue
        for st in lookup.SubTable:
            if st.Format == 1:
                cov = st.Coverage.glyphs
                if a not in cov: continue
                for pr in st.PairSet[cov.index(a)].PairValueRecord:
                    if pr.SecondGlyph == b and pr.Value1 and pr.Value1.XAdvance: return pr.Value1.XAdvance
            elif st.Format == 2:
                if a not in st.Coverage.glyphs: continue
                c1 = st.ClassDef1.classDefs.get(a, 0); c2 = st.ClassDef2.classDefs.get(b, 0)
                v = st.Class1Record[c1].Class2Record[c2].Value1
                if v and v.XAdvance: return v.XAdvance
    return 0

names = [cmap[ord(ch)] for ch in WORD]
x = 0.0
paths = []
for i, g in enumerate(names):
    pen = SVGPathPen(glyphs)
    tpen = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
    glyphs[g].draw(tpen)
    paths.append(pen.getCommands())
    x += hmtx[g][0] * scale + TRACK * SIZE
    if i + 1 < len(names): x += kern(g, names[i + 1]) * scale

# The full stop: the face's own, in the accent, after the word.
dot = cmap[ord(".")]
pen = SVGPathPen(glyphs); TransformPen(pen, (scale, 0, 0, -scale, x, 0)); glyphs[dot].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
dot_path = pen.getCommands()
x += hmtx[dot][0] * scale

bp = BoundsPen(glyphs)
for g in names: glyphs[g].draw(TransformPen(bp, (scale, 0, 0, -scale, 0, 0)))
asc = font["hhea"].ascent * scale
desc = -font["hhea"].descent * scale
pad = 4
w = round(x + pad * 2); h = round(asc + desc + pad * 2)
baseline = pad + asc

os.makedirs(OUT, exist_ok=True)
for scheme, ink in INK.items():
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="snypd">\n'
           f'  <g transform="translate({pad} {baseline:.2f})">\n'
           + "".join(f'    <path fill="{ink}" d="{d}"/>\n' for d in paths)
           + f'    <path fill="{ACCENT}" d="{dot_path}"/>\n'
           f'  </g>\n</svg>\n')
    path = os.path.join(OUT, f"wordmark-{scheme}.svg")
    with open(path, "w") as f: f.write(svg)
    print(f"{path}  {w}×{h}  {len(svg.encode()) // 1024} KB")
