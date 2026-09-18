"""
Shrink the README's PNGs (docs/15 §3.2): `python3 packages/bench/readme/optimise.py <file>...`

A screenshot of a page with two type faces and five colours does not need sixteen million of them.
Each frame is quantised to a 256-colour palette without dither (flat UI stays flat; text edges keep
their antialiasing because the palette is built from the frame) and then run through oxipng. On a
2560×1600 frame that is ~290 KB → ~35 KB. `shots.ts` calls this when python3 and the two modules
are on the machine, and says so when they are not — the frames are still correct, only heavier.
"""
import io, os, sys
from PIL import Image
import oxipng

for path in sys.argv[1:]:
    before = os.path.getsize(path)
    im = Image.open(path)
    q = im.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    buf = io.BytesIO(); q.save(buf, "PNG", optimize=True)
    out = oxipng.optimize_from_memory(buf.getvalue(), level=4)
    with open(path, "wb") as f: f.write(out)
    print(f"{path}  {before // 1024} → {len(out) // 1024} KB")
