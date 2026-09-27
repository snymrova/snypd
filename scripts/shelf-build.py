#!/usr/bin/env python3
"""
The font shelf (docs/29 §5, decision 227): build `packages/shelf/` — every face subset, licensed and
measured, from one pinned commit of google/fonts.

This is not part of the build, any more than `scripts/vendor-font.sh` is: the shelf ships its .woff2 files
as files, and `snypd theme seed --face` copies one into a theme. What this script is for is that every
number in `shelf.json` — the kilobytes a theme will be charged, the x-height the seed's leading is worked
out from, the four fallback overrides that keep `page.cls` at 0 — comes from the two fonts and not from
taste, and that the whole shelf can be regenerated and diffed.

It is `vendor-font.sh`'s recipe run over a list: the same unicode range, the same four layout features,
the same letter-frequency advance and the same USE_TYPO_METRICS rule. Byte-reproducible for the same
reason: the source is pinned to a commit (one for the whole shelf, so a face and its licence cannot be
four years apart) and `SOURCE_DATE_EPOCH` stops fontTools stamping `head.modified` with the clock.

Machine dependencies, like vendor-font.sh: fontTools with brotli, fontconfig's `fc-match`, and the
metric-compatible core fonts (Georgia, Arial, Courier New) installed — the fallback is measured against
the file a visitor's machine will actually have, and on Linux that means `ttf-mscorefonts-installer`.
A missing one is refused rather than silently measured against DejaVu.

    python3 scripts/shelf-build.py            # writes packages/shelf/{shelf.json,fonts/,licences/}
    python3 scripts/shelf-build.py --check    # rebuilds into a temp dir, exits 1 on any byte of drift
"""
from __future__ import annotations

import argparse
import filecmp
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SHELF = REPO / "packages" / "shelf"

# One commit for every face and every licence (google/fonts main, 18 Sep 2026).
REF = "f2bd09badbc763d8757951d52deec29da27e85fb"
os.environ["SOURCE_DATE_EPOCH"] = "1789767637"  # that commit's date, so a rebuild is a function of this file
RAW = f"https://raw.githubusercontent.com/google/fonts/{REF}/ofl"

# vendor-font.sh's range, verbatim: Google's `latin`. The features are where the shelf now parts from it
# (decision 281, docs/38 §1): kern/liga/clig/calt stripped every figure set and small caps, so a piece asking
# for `tabular-nums` got nothing and `small-caps` got the browser's fake. Every face keeps `tnum lnum`
# (measured ≈0–1 KB); text serifs keep `onum pnum smcp c2sc` too (4–12 KB). A face that never had a feature
# still does not — `features` in shelf.json is read back from the cut file, never copied from this list.
UNICODES = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
FEATURES = "kern,liga,clig,calt,tnum,lnum"
SERIF_TEXT_FEATURES = "onum,pnum,smcp,c2sc"
# The tags `features` reports: the ones a piece can ask for by name. kern/liga/… are in every face.
CRAFT = ("tnum", "lnum", "onum", "pnum", "smcp", "c2sc", "case", "zero")
MAX_KB = 48  # MAX_FONT_KB in packages/core/src/schema.ts, per file; the shelf test holds the two together

# The face whose metrics each category's fallback overrides — on every Mac and every Windows. `local()`
# needs an installed face's name, so mono falls back to Courier New, not to `ui-monospace`.
FALLBACK = {"serif": "Georgia", "slab": "Georgia", "sans": "Arial", "mono": "Courier New"}
FALLBACK_BOLD = {"serif": "Georgia Bold", "slab": "Georgia Bold", "sans": "Arial Bold", "mono": "Courier New Bold"}

# The system stack each category sits in front of, after the face and its fallback.
TAIL = {
    "serif": "Charter, Georgia, ui-serif, serif",
    "slab": "Rockwell, Charter, Georgia, ui-serif, serif",
    "sans": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
    "mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
}
SYS_SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
SYS_SERIF = "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, ui-serif, serif"
SYS_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

# Excluded by default (decision 227). The build refuses them, so an edit to the list below cannot slip one in.
EXCLUDED = {"Inter", "Roboto", "Geist", "Fraunces", "Space Grotesk", "Plus Jakarta Sans"}


def face(id, family, path, category, role, weight, *, instance=None, measure=400, italic=None, cuts=(), suits, pairs):
    """One recipe. `instance` pins axes (`{"opsz": 16, "wght": (400, 700)}`); None for a static file.

    `italic` is the upstream italic, cut with the same instance into `<id>-italic.woff2`. `cuts` are
    further static upright weights (`(600, "…-SemiBold.ttf")`), each its own file — Plex Serif is static
    upstream, so its 600 cannot ride in the roman. Both become `font.cuts` in a theme: same family, never
    preloaded, so a page pays for one only when it sets something in it (decision 281)."""
    return dict(id=id, family=family, path=path, category=category, role=role, weight=weight,
                instance=instance, measure=measure, italic=italic, cuts=cuts, suits=suits, pairs=pairs)


FACES = [
    # ── serifs for reading ────────────────────────────────────────────────────────────────────────────
    face("source-serif-4", "Source Serif 4", "sourceserif4/SourceSerif4[opsz,wght].ttf", "serif", "text", "400 700",
         instance={"opsz": 16, "wght": (400, 700)}, italic="sourceserif4/SourceSerif4-Italic[opsz,wght].ttf",
         suits="Long reading at text sizes; editorial's face. Charter/Palatino register, sturdy on low-DPI screens.",
         pairs=SYS_SANS),
    face("crimson-pro", "Crimson Pro", "crimsonpro/CrimsonPro[wght].ttf", "serif", "text", "400 700",
         instance={"wght": (400, 700)}, italic="crimsonpro/CrimsonPro-Italic[wght].ttf",
         suits="Book-like prose, old-style warmth; small x-height, so set it a size up.",
         pairs=SYS_SANS),
    face("lora", "Lora", "lora/Lora[wght].ttf", "serif", "text", "400 700",
         instance={"wght": (400, 700)}, italic="lora/Lora-Italic[wght].ttf",
         suits="Calligraphic serif for essays and personal writing; soft on screen at 17–19 px.",
         pairs=SYS_SANS),
    face("ibm-plex-serif", "IBM Plex Serif", "ibmplexserif/IBMPlexSerif-Regular.ttf", "serif", "text", "400",
         italic="ibmplexserif/IBMPlexSerif-Italic.ttf", cuts=((600, "ibmplexserif/IBMPlexSerif-SemiBold.ttf"),),
         suits="Engineered, neutral serif for documentation that should not feel academic.",
         pairs=SYS_MONO),
    # ── serifs for display ────────────────────────────────────────────────────────────────────────────
    face("instrument-serif", "Instrument Serif", "instrumentserif/InstrumentSerif-Regular.ttf", "serif", "display", "400",
         italic="instrumentserif/InstrumentSerif-Italic.ttf",
         suits="Condensed, high-contrast display serif for large titles; not for prose.",
         pairs=SYS_SANS),
    face("young-serif", "Young Serif", "youngserif/YoungSerif-Regular.ttf", "serif", "display", "400",
         suits="Heavy, friendly old-style headings; food, shops, small presses.",
         pairs=SYS_SANS),
    face("gloock", "Gloock", "gloock/Gloock-Regular.ttf", "serif", "display", "400",
         suits="Sharp high-contrast display serif; fashion and magazine mastheads at 48 px and up.",
         pairs=SYS_SANS),
    # ── slab ──────────────────────────────────────────────────────────────────────────────────────────
    face("bitter", "Bitter", "bitter/Bitter[wght].ttf", "slab", "text", "400 700",
         instance={"wght": (400, 700)}, italic="bitter/Bitter-Italic[wght].ttf",
         suits="Slab for screen reading and sturdy headings; newsletters, civic sites, recipes.",
         pairs=SYS_SANS),
    # ── sans for text ─────────────────────────────────────────────────────────────────────────────────
    face("instrument-sans", "Instrument Sans", "instrumentsans/InstrumentSans[wdth,wght].ttf", "sans", "text", "400 700",
         instance={"wdth": 100, "wght": (400, 700)}, italic="instrumentsans/InstrumentSans-Italic[wdth,wght].ttf",
         suits="Crisp neo-grotesque for product sites and UI-heavy pages; Instrument Serif's partner.",
         pairs=SYS_SERIF),
    face("work-sans", "Work Sans", "worksans/WorkSans[wght].ttf", "sans", "text", "400 700",
         instance={"wght": (400, 700)}, italic="worksans/WorkSans-Italic[wght].ttf",
         suits="Wide, open grotesque; friendly at mid sizes, good for studios and small businesses.",
         pairs=SYS_SERIF),
    face("ibm-plex-sans", "IBM Plex Sans", "ibmplexsans/IBMPlexSans[wdth,wght].ttf", "sans", "text", "400 700",
         instance={"wdth": 100, "wght": (400, 700)}, italic="ibmplexsans/IBMPlexSans-Italic[wdth,wght].ttf",
         suits="Technical grotesque with character; docs, changelogs, developer tools.",
         pairs=SYS_MONO),
    face("source-sans-3", "Source Sans 3", "sourcesans3/SourceSans3[wght].ttf", "sans", "text", "400 700",
         instance={"wght": (400, 700)}, italic="sourcesans3/SourceSans3-Italic[wght].ttf",
         suits="Humanist sans; calm and legible for long UI text and government-style sites.",
         pairs=SYS_SERIF),
    # ── sans for display ──────────────────────────────────────────────────────────────────────────────
    face("bricolage-grotesque", "Bricolage Grotesque", "bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf", "sans", "display", "400 800",
         instance={"opsz": 96, "wdth": 100, "wght": (400, 800)}, measure=700,
         suits="Quirky display grotesque for huge headlines; studio's face.",
         pairs=SYS_SANS),
    face("big-shoulders", "Big Shoulders", "bigshoulders/BigShoulders[opsz,wght].ttf", "sans", "display", "400 800",
         instance={"opsz": 72, "wght": (400, 800)}, measure=700,
         suits="Condensed, industrial display; posters, events, sport. Headings only.",
         pairs=SYS_SANS),
    face("barlow-condensed", "Barlow Condensed", "barlowcondensed/BarlowCondensed-SemiBold.ttf", "sans", "display", "600", measure=600,
         suits="Rounded condensed grotesque; signage and dashboards, labels and big numbers.",
         pairs=SYS_SANS),
    # ── mono ──────────────────────────────────────────────────────────────────────────────────────────
    face("ibm-plex-mono", "IBM Plex Mono", "ibmplexmono/IBMPlexMono-Regular.ttf", "mono", "text", "400",
         italic="ibmplexmono/IBMPlexMono-Italic.ttf",
         suits="Mono with a humanist hand; a technical site's whole voice, or code on a serif page.",
         pairs=SYS_SANS),
]

# Letter frequency plus the space — vendor-font.sh's weighting, so the two tools agree on a face.
FREQ = {"e": 127, "t": 91, "a": 82, "o": 75, "i": 70, "n": 67, "s": 63, "h": 61, "r": 60, "d": 43, "l": 40, "c": 28, "u": 28,
        "m": 24, "w": 24, "f": 22, "g": 20, "y": 20, "p": 19, "b": 15, "v": 10, "k": 8, "j": 2, "x": 2, "q": 1, "z": 1}
FREQ[" "] = sum(FREQ.values()) // 5


def cache_dir() -> Path:
    d = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "snypd-shelf" / REF
    d.mkdir(parents=True, exist_ok=True)
    return d


def fetch(rel: str) -> Path:
    out = cache_dir() / rel.replace("/", "__")
    if not out.exists():
        url = f"{RAW}/{urllib.request.quote(rel)}"
        with urllib.request.urlopen(url) as r:  # raises on 404 — never writes an error page into a licence
            data = r.read()
        out.write_bytes(data)
    return out


def licence_of(text: str) -> str | None:
    """Read, never assumed: the OFL's own title and version, or None."""
    t = text.upper()
    if "SIL OPEN FONT LICENSE" in t and "VERSION 1.1" in t:
        return "OFL-1.1"
    return None


def fallback_file(name: str) -> str:
    fam = name.removesuffix(" Bold")
    pattern = f"{fam}:bold" if fam != name else fam
    out = subprocess.run(["fc-match", "-f", "%{family}|%{file}", pattern], capture_output=True, text=True, check=True).stdout
    got, _, path = out.partition("|")
    if fam.lower() not in got.lower():
        sys.exit(f"fallback {name!r} is not installed (fc-match gave {got!r}); install the core fonts")
    return path


def avg_width(font) -> float:
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    num = den = 0
    for ch, w in FREQ.items():
        g = cmap.get(ord(ch))
        if g is None:
            continue
        num += hmtx[g][0] / upm * w
        den += w
    return num / den


def line_box(font):
    o, h, upm = font["OS/2"], font["hhea"], font["head"].unitsPerEm
    if o.fsSelection & (1 << 7):  # USE_TYPO_METRICS: the sTypo triple is what the browser reads
        return o.sTypoAscender / upm, -o.sTypoDescender / upm, o.sTypoLineGap / upm
    return h.ascent / upm, -h.descent / upm, h.lineGap / upm


def glyph_top(font, ch: str) -> float:
    from fontTools.pens.boundsPen import BoundsPen
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    pen = BoundsPen(gs)
    gs[name].draw(pen)
    return pen.bounds[3] / font["head"].unitsPerEm


def heights(font):
    o = font["OS/2"]
    upm = font["head"].unitsPerEm
    x = o.sxHeight / upm if getattr(o, "sxHeight", 0) else glyph_top(font, "x")
    cap = o.sCapHeight / upm if getattr(o, "sCapHeight", 0) else glyph_top(font, "H")
    return x, cap


def features_for(f: dict) -> list[str]:
    extra = SERIF_TEXT_FEATURES.split(",") if f["category"] in ("serif", "slab") and f["role"] == "text" else []
    return FEATURES.split(",") + extra


def cut(src: Path, instance, features: list[str], woff: Path):
    """Instance, subset and write one .woff2. Returns the instanced (unsubset) font bytes, for measuring,
    and the file's own record: its size, the craft features it really carries, the axes still live."""
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    font = TTFont(src)
    if instance:
        font = instancer.instantiateVariableFont(font, dict(instance))
    buf = io.BytesIO()
    font.save(buf)

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = features
    opts.hinting = False
    opts.desubroutinize = True
    sub = TTFont(io.BytesIO(buf.getvalue()))
    ss = subset.Subsetter(opts)
    ss.populate(unicodes=subset.parse_unicodes(UNICODES))
    ss.subset(sub)
    subset.save_font(sub, str(woff), opts)
    have = set()
    for tag in ("GSUB", "GPOS"):
        if tag in sub and sub[tag].table.FeatureList:
            have |= {r.FeatureTag for r in sub[tag].table.FeatureList.FeatureRecord}
    axes = [a.axisTag for a in sub["fvar"].axes] if "fvar" in sub else []
    # What the digits do with no feature on: Plex and Source Sans set tabular by default and so carry `pnum`
    # and no `tnum` — `features` alone would say they cannot align a column when they already do.
    cmap, hmtx = sub.getBestCmap(), sub["hmtx"]
    digits = "tabular" if len({hmtx[cmap[ord(d)]][0] for d in "0123456789"}) == 1 else "proportional"
    size = woff.stat().st_size
    return buf.getvalue(), {"bytes": size, "kb": math.ceil(size / 1024), "features": [t for t in CRAFT if t in have], "digits": digits, "axes": axes}


def build_face(f: dict, out: Path):
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    if f["family"] in EXCLUDED:
        sys.exit(f"{f['family']} is excluded from the shelf (decision 227)")
    src = fetch(f["path"])
    lic_src = fetch(f["path"].split("/")[0] + "/OFL.txt")
    lic_text = lic_src.read_text(encoding="utf-8")
    licence = licence_of(lic_text)
    if licence is None:
        return None, f"{f['id']}: licence at ofl/{f['path'].split('/')[0]}/OFL.txt is not the OFL 1.1 — dropped"

    feats = features_for(f)
    woff = out / "fonts" / f"{f['id']}.woff2"
    instanced, roman = cut(src, f["instance"], feats, woff)
    (out / "licences" / f"{f['id']}.OFL.txt").write_text(lic_text, encoding="utf-8")
    if roman["kb"] > MAX_KB:
        return None, f"{f['id']}: {roman['bytes']} bytes is over the {MAX_KB} KB lane — narrow its instance"

    # The cuts beside the roman (decision 281): the italic at the roman's instance, then static weights.
    cuts = []
    extra = ([("italic", f["weight"], f["italic"], f["instance"])] if f["italic"] else []) + \
            [("normal", str(w), path, None) for w, path in f["cuts"]]
    for style, weight, path, inst in extra:
        name = f"{f['id']}-italic" if style == "italic" else f"{f['id']}-{weight}"
        _, rec = cut(fetch(path), inst, feats, out / "fonts" / f"{name}.woff2")
        if rec["kb"] > MAX_KB:
            return None, f"{f['id']}: {name} is {rec['bytes']} bytes, over the {MAX_KB} KB lane"
        cuts.append({"file": f"fonts/{name}.woff2", "weight": weight, "style": style, "bytes": rec["bytes"], "kb": rec["kb"],
                     "features": rec["features"], "source": f"google/fonts@{REF[:12]}:ofl/{path}"})

    # Measured at the weight the face is set at, on a static instance that is never shipped.
    measure = TTFont(io.BytesIO(instanced))
    if "fvar" in measure:
        measure = instancer.instantiateVariableFont(measure, {"wght": f["measure"]})
    bold = f["measure"] >= 600
    fb_name = (FALLBACK_BOLD if bold else FALLBACK)[f["category"]]
    fb = TTFont(fallback_file(fb_name), fontNumber=0)
    size_adjust = avg_width(measure) / avg_width(fb)
    asc, desc, gap = line_box(measure)
    x, cap = heights(measure)
    pct = lambda v: f"{v * 100:.1f}%"
    lo, _, hi = f["weight"].partition(" ")
    weights = sorted({int(lo), int(hi or lo)} | {int(c["weight"].split()[0]) for c in cuts if c["style"] == "normal"})
    # Axes the source had that the instance pinned: the one value the face is set at, recorded so a piece
    # (and the seed) can know a text-pinned opsz face is not a display cut.
    pinned = {k: v for k, v in (f["instance"] or {}).items() if not isinstance(v, tuple)}
    return {
        "id": f["id"],
        "family": f["family"],
        "category": f["category"],
        "role": f["role"],
        "file": f"fonts/{f['id']}.woff2",
        "licence": f"licences/{f['id']}.OFL.txt",
        "licenceName": licence,
        "bytes": roman["bytes"],
        "kb": roman["kb"],
        "weight": f["weight"],
        "style": "normal",
        "weights": weights,
        "italic": any(c["style"] == "italic" for c in cuts),
        "features": roman["features"],
        "digits": roman["digits"],
        "axes": roman["axes"],
        "pinned": pinned,
        "cuts": cuts,
        "xHeight": round(x, 3),
        "capHeight": round(cap, 3),
        "avgWidth": round(avg_width(measure), 4),
        "fallback": {
            "local": fb_name,
            "size-adjust": pct(size_adjust),
            "ascent-override": pct(asc / size_adjust),
            "descent-override": pct(desc / size_adjust),
            "line-gap-override": pct(gap / size_adjust),
        },
        "tail": TAIL[f["category"]],
        "suits": f["suits"],
        "pairsWith": f["pairs"],
        "source": f"google/fonts@{REF[:12]}:ofl/{f['path']}",
    }, None


def build(out: Path) -> list[str]:
    for sub in ("fonts", "licences"):
        shutil.rmtree(out / sub, ignore_errors=True)
        (out / sub).mkdir(parents=True)
    faces, notes = [], []
    for f in FACES:
        entry, note = build_face(f, out)
        if note:
            notes.append(note)
            print("✗", note, file=sys.stderr)
            continue
        faces.append(entry)
        more = "  + " + ", ".join(f"{c['style'] if c['style'] == 'italic' else c['weight']} {c['kb']} KB" for c in entry["cuts"]) if entry["cuts"] else ""
        print(f"✓ {entry['id']:<22} {entry['bytes']:>6} B  {entry['kb']:>2} KB  x {entry['xHeight']}  {entry['fallback']['local']} {entry['fallback']['size-adjust']}  [{' '.join(entry['features'])}]{more}")
    manifest = {
        "$comment": "GENERATED by scripts/shelf-build.py — do not edit. Rebuild and diff with --check.",
        "source": {"repo": "google/fonts", "ref": REF},
        "unicodes": UNICODES,
        "features": FEATURES,
        "serifTextFeatures": SERIF_TEXT_FEATURES,
        "faces": faces,
    }
    (out / "shelf.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_files_gen(out, faces)
    return notes


def write_files_gen(out: Path, faces: list[dict]):
    """`src/files.gen.ts`: one `type: "file"` import per shipped file, so `bun build --compile` embeds the
    bytes and the shelf works from the release binary, where there is no `packages/shelf/` to read."""
    lines = ["// GENERATED by scripts/shelf-build.py — do not edit.",
             "// Shelf-relative path → a path Bun can read: on disk from a checkout, inside $bunfs from the binary."]
    names = []
    for i, e in enumerate(faces):
        rels = [("file", e["file"]), ("licence", e["licence"])] + [(f"cut{j}", c["file"]) for j, c in enumerate(e["cuts"])]
        for key, rel in rels:
            var = f"_{i}_{key}"
            lines.append(f'import {var} from "../{rel}" with {{ type: "file" }};')
            names.append((rel, var))
    lines += ["", "export const FILES: Readonly<Record<string, string>> = {"]
    lines += [f'  "{rel}": {var},' for rel, var in names]
    lines.append("};")
    (out / "src").mkdir(exist_ok=True)
    (out / "src" / "files.gen.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="rebuild into a temp dir and diff against packages/shelf")
    a = ap.parse_args()
    if not a.check:
        build(SHELF)
        return
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        build(t)
        drift = []
        for rel in ["shelf.json", "src/files.gen.ts"] + [f"{d}/{p.name}" for d in ("fonts", "licences") for p in sorted((t / d).iterdir())]:
            if not (SHELF / rel).exists() or not filecmp.cmp(t / rel, SHELF / rel, shallow=False):
                drift.append(rel)
        for d in ("fonts", "licences"):
            for p in (SHELF / d).iterdir():
                if not (t / d / p.name).exists():
                    drift.append(f"{d}/{p.name} (stale)")
        if drift:
            print("drift:", *drift, sep="\n  ", file=sys.stderr)
            sys.exit(1)
        print("shelf: no drift")


if __name__ == "__main__":
    main()
