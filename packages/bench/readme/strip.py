"""
The phone strip (docs/15 §3.2): six looks at 390 px, side by side on one ground, rounded like a phone
would be — `python3 packages/bench/readme/strip.py` → .github/readme/phones/strip.png. Order is the
shelf's: editorial's three, base, technical's two. The frames are the ones `shots.ts` made; this only
arranges them.
"""
import io, os
from PIL import Image, ImageDraw
import oxipng

DIR = ".github/readme/phones"
ORDER = ["editorial-paper", "editorial-ink", "editorial-broadsheet", "base", "technical-graphite", "technical-phosphor"]
GAP, PAD, RADIUS, SCALE = 36, 40, 44, 0.5
BG = (0xf7, 0xf3, 0xea)

frames = [Image.open(os.path.join(DIR, f"{slug}.png")).convert("RGB") for slug in ORDER]
frames = [f.resize((round(f.width * SCALE), round(f.height * SCALE)), Image.Resampling.LANCZOS) for f in frames]
w = sum(f.width for f in frames) + GAP * (len(frames) - 1) + PAD * 2
h = max(f.height for f in frames) + PAD * 2
strip = Image.new("RGB", (w, h), BG)
x = PAD
for f in frames:
    mask = Image.new("L", f.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, f.width - 1, f.height - 1), radius=round(RADIUS * SCALE), fill=255)
    strip.paste(f, (x, PAD), mask)
    x += f.width + GAP
q = strip.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
buf = io.BytesIO(); q.save(buf, "PNG", optimize=True)
out = os.path.join(DIR, "strip.png")
with open(out, "wb") as fh: fh.write(oxipng.optimize_from_memory(buf.getvalue(), level=4))
print(f"{out}  {w}×{h}  {os.path.getsize(out) // 1024} KB")
