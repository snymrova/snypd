"""
The Product Hunt gallery (docs/16 §4, S27): five frames at 1270×760 and the 240×240 thumbnail, from the
README's own pictures — `python3 packages/bench/readme/gallery.py` → docs/launch/gallery/. Nothing
here is photographed; `shots.ts`, `strip.py`, `primitives.ts` and the `check-theme` tape made every
pixel, and this only crops and arranges. Two frames are the page itself, cut at the fold; three are
plates — the README's cream, the theme's serif for one line of caption, the pictures at their own
scale. Every frame is written twice as large and downsampled once, so the text and the shots share
one resampling. The thumbnail is the wordmark's full stop — the face's own glyph — on the accent.
"""
import io, os, sys, tempfile
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import oxipng

SRC = ".github/readme"
OUT = sys.argv[1] if len(sys.argv) > 1 else "docs/launch/gallery"
W, H = 1270, 760                          # what Product Hunt asks for
S = 2                                     # composed at 2×, like the shots
PAD, GAP = 96, 48                         # on the 2× plate
BG, INK, MUTED, ACCENT = (0xf7, 0xf3, 0xea), (0x1d, 0x1a, 0x17), (0x6b, 0x64, 0x5c), (0x8a, 0x33, 0x24)
FONT = "themes/editorial/fonts/source-serif-4-latin.woff2"

def face(size, weight=600):
    """The theme's variable webfont, instanced and handed to FreeType as a plain TTF (it does not read woff2)."""
    path = os.path.join(tempfile.gettempdir(), f"snypd-source-serif-4-{weight}.ttf")
    if not os.path.exists(path):
        f = TTFont(FONT)
        if "fvar" in f: f = instantiateVariableFont(f, {"wght": weight})
        f.flavor = None; f.save(path)
    return ImageFont.truetype(path, size)

def load(rel): return Image.open(os.path.join(SRC, rel)).convert("RGB")
def fit(im, w=None, h=None):
    r = min((w / im.width) if w else 9e9, (h / im.height) if h else 9e9)
    return im.resize((round(im.width * r), round(im.height * r)), Image.Resampling.LANCZOS)

def fold(im):
    """The page as the browser showed it, cut at PH's aspect: the top of the frame, nothing moved."""
    h = round(im.width * H / W)
    return im.crop((0, 0, im.width, h))

def plate(title, sub=None):
    p = Image.new("RGB", (W * S, H * S), BG)
    d = ImageDraw.Draw(p)
    d.text((PAD, PAD - 8), title, fill=INK, font=face(76))
    if sub: d.text((PAD, PAD + 84), sub, fill=MUTED, font=face(40, 400))
    return p, PAD + (176 if sub else 120)   # where content may start

def rounded(im, radius):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=radius, fill=255)
    return m

def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    if im.size != (W, H): im = im.resize((W, H), Image.Resampling.LANCZOS)
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    buf = io.BytesIO(); q.save(buf, "PNG", optimize=True)
    path = os.path.join(OUT, name)
    with open(path, "wb") as fh: fh.write(oxipng.optimize_from_memory(buf.getvalue(), level=4))
    print(f"{path}  {im.width}×{im.height}  {os.path.getsize(path) // 1024} KB")

# ── 1 · the page, editorial › paper, at the fold ─────────────────────────────
save(fold(load("looks/editorial-paper-light.png")), "01-editorial-paper.png")

# ── 2 · six looks: the phone strip on a plate ────────────────────────────────
p, top = plate("Three themes, six looks.", "The same post, photographed at 390 px in every look the shelf carries — 0 KB of JavaScript in each.")
strip = fit(load("phones/strip.png"), w=W * S - PAD * 2, h=H * S - top - PAD)
p.paste(strip, ((p.width - strip.width) // 2, top + (H * S - top - PAD - strip.height) // 2))
save(p, "02-six-looks.png")

# ── 3 · the primitives: two columns of the editorial theme's rendering ───────
p, top = plate("Thirteen typed primitives, rendered at build time.", "A chart is inline SVG; a flow is a laid-out graph; a stat without a source fails lint.")
cols = [["primitives/chart.png", "primitives/flow.png"], ["primitives/diagram.png", "primitives/steps.png", "primitives/callout.png"]]
cw = (W * S - PAD * 2 - GAP) // 2
avail = H * S - top - PAD
for i, col in enumerate(cols):
    ims = [fit(load(f), w=cw) for f in col]
    total = sum(im.height for im in ims) + GAP * (len(ims) - 1)
    if total > avail:                     # the column is scaled as one, so nothing in it lies to the eye
        r = avail / total
        ims = [im.resize((round(im.width * r), round(im.height * r)), Image.Resampling.LANCZOS) for im in ims]
    x, y = PAD + i * (cw + GAP), top
    for im in ims:
        p.paste(im, (x, y), rounded(im, 12)); y += im.height + GAP
save(p, "03-primitives.png")

# ── 4 · check theme: the terminal on a plate ─────────────────────────────────
p, top = plate("A theme is judged before it is listed.", "snypd check theme — seventeen named rules, the WCAG ratio of every colour pair on every look included.")
term = fit(load("terminal/check-theme.png"), w=W * S - PAD * 2 - 160, h=H * S - top - PAD)
p.paste(term, ((p.width - term.width) // 2, top + (H * S - top - PAD - term.height) // 2), rounded(term, 24))
save(p, "04-check-theme.png")

# ── 5 · the Desk at the fold ─────────────────────────────────────────────────
save(fold(load("desk/desk-light.png")), "05-desk.png")

# ── the thumbnail: the full stop, on the accent ──────────────────────────────
t = Image.new("RGB", (240 * S, 240 * S), ACCENT)
def ink(size):
    """The glyph's ink, not its box (the box carries the bearings): a mask, and where the ink sits in it."""
    m = Image.new("L", (size * 2, size * 2), 0)
    ImageDraw.Draw(m).text((size // 2, size + size // 2), ".", fill=255, font=face(size), anchor="ls")
    return m, m.getbbox()
m, (l, tt, r, b) = ink(1000)
m, (l, tt, r, b) = ink(round(1000 * (t.width * 0.4) / (r - l)))   # the dot two fifths of the tile
dot = m.crop((l, tt, r, b))
t.paste(Image.new("RGB", dot.size, (0xf4, 0xef, 0xe6)), ((t.width - dot.width) // 2, (t.height - dot.height) // 2), dot)
t = t.resize((240, 240), Image.Resampling.LANCZOS)
os.makedirs(OUT, exist_ok=True)
buf = io.BytesIO(); t.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(buf, "PNG", optimize=True)
with open(os.path.join(OUT, "thumbnail.png"), "wb") as fh: fh.write(oxipng.optimize_from_memory(buf.getvalue(), level=4))
print(f"{OUT}/thumbnail.png  240×240  {os.path.getsize(os.path.join(OUT, 'thumbnail.png')) // 1024} KB")
