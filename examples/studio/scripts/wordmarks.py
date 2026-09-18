#!/usr/bin/env python3
"""The client wordmarks on the logo wall, as SVG paths.

The clients are fictional, so their marks are: a word set in a face this machine has (the studio's
own Bricolage Grotesque for two of them), converted to outlines so the SVG needs no font, filled in
one mid grey that reads on the dark band and the light one alike. Re-run to regenerate; nothing
downloads.

    python3 scripts/wordmarks.py
"""
import html, os, subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MEDIA = os.path.join(ROOT, "content", "media")
BRICOLAGE = os.path.join(ROOT, "..", "..", "themes", "studio", "fonts", "bricolage-grotesque-latin.woff2")
FILL = "#8a8a86"


def fc(pattern):
    return subprocess.run(["fc-match", "-f", "%{file}", pattern], check=True, capture_output=True, text=True).stdout


# name, file, text, letter-spacing (em), optional variation
MARKS = [
    ("mares",    BRICOLAGE,                    "Marés",       -0.02, {"wght": 800}),
    ("ondular",  fc("Cantarell:extrabold"),    "ondular",     -0.01, None),
    ("tarnvale", fc("C059:bold"),              "Tarn & Vale",  0.00, None),
    ("lumo",     BRICOLAGE,                    "LUMO",         0.12, {"wght": 500}),
    ("bitacora", fc("DejaVu Serif:bold"),      "Bitácora",    -0.01, None),
    ("sextant",  fc("FreeSans:bold"),          "SEXTANT",      0.08, None),
    ("kavel",    fc("Andale Mono"),            "kavel_",       0.00, None),
    ("pele",     fc("Cantarell:extrabold"),    "Pele.",       -0.03, None),
]


def outline(font, text, tracking):
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    x, paths = 0, []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit(f"{font!r} has no glyph for {ch!r}")
        g = glyphset[name]
        pen = SVGPathPen(glyphset)
        g.draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        d = pen.getCommands()
        if d:
            paths.append(d)
        x += g.width + tracking * upm
    asc, desc = font["hhea"].ascent, font["hhea"].descent
    return paths, x, upm, asc, desc


def main():
    for name, file, text, tracking, variation in MARKS:
        font = TTFont(file)
        if variation and "fvar" in font:
            from fontTools.varLib.instancer import instantiateVariableFont
            font = instantiateVariableFont(font, variation)
        paths, width, upm, asc, desc = outline(font, text, tracking)
        # Tight box: cap height plus a little under the baseline, so every mark sits at the same height.
        cap = getattr(font["OS/2"], "sCapHeight", 0) if "OS/2" in font else 0
        cap = cap or asc * 0.7
        top, bottom = -cap * 1.08, cap * 0.28
        h = bottom - top
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top:.0f} {width:.0f} {h:.0f}" '
               f'width="{width / h * 40:.1f}" height="40" role="img" aria-label="{html.escape(text)}">'
               f'<path fill="{FILL}" d="{" ".join(paths)}"/></svg>')
        out = os.path.join(MEDIA, f"logo-{name}.svg")
        open(out, "w").write(svg)
        print(f"{out.split('/')[-1]:22} {len(svg) / 1e3:5.1f} KB  {text}")


if __name__ == "__main__":
    main()
