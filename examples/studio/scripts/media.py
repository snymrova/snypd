#!/usr/bin/env python3
"""Fetch, credit and convert the specimen's media.

Every photograph and clip on this site is a CC0 or CC BY file from Wikimedia Commons, named in
`sources.json` beside this script. This script asks Commons for each file's author and licence, writes
`content/media/credits.json` (what the credits page is built from), downloads the original into a cache,
and converts it to what the site ships: WebP at a width a 1280-px column can use, or a short muted
H.264 clip with a WebP poster. Processed files are committed; the originals are not.

    python3 scripts/media.py [--cache DIR] [--only NAME,...]
"""
import argparse, json, os, re, subprocess, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UA = {"User-Agent": "snypd-studio-specimen/0.1 (https://snypd.rocks; media credits script)"}
API = "https://commons.wikimedia.org/w/api.php"


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def author_name(artist):
    """Commons' Unsplash imports write the artist as "Name Surname handle"; the handle is not a credit."""
    words = strip_tags(artist).split(" ")
    if len(words) >= 2 and re.fullmatch(r"[a-z0-9_.]+", words[-1]):
        words = words[:-1]
    return " ".join(words) or "Unknown"


def fetch_meta(titles):
    """Author, licence and original url for each Commons file title, in one request per 50."""
    out = {}
    for i in range(0, len(titles), 50):
        d = api({"action": "query", "format": "json", "prop": "imageinfo", "titles": "|".join(titles[i:i + 50]),
                 "iiprop": "url|size|extmetadata|mime"})
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                sys.exit(f"not on Commons: {p.get('title')}")
            ii = p["imageinfo"][0]
            em = ii.get("extmetadata", {})
            out[p["title"]] = {
                "title": p["title"][5:].rsplit(".", 1)[0].replace(" (Unsplash)", ""),
                "author": author_name(em.get("Artist", {}).get("value", "")),
                "license": em.get("LicenseShortName", {}).get("value", "?"),
                "licenseUrl": em.get("LicenseUrl", {}).get("value", ""),
                "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_")),
                "url": ii["url"], "width": ii.get("width"), "height": ii.get("height"),
            }
    return out


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def run(cmd):
    subprocess.run(cmd, check=True)


def convert_image(src, out, width, aspect=None, quality=80):
    """Downscale (never up), strip metadata, optional centre crop to `aspect` = "3:2"."""
    cmd = ["convert", src, "-auto-orient", "-strip", "-colorspace", "sRGB"]
    if aspect:
        w, h = (int(x) for x in aspect.split(":"))
        height = round(width * h / w)
        cmd += ["-resize", f"{width}x{height}^", "-gravity", "center", "-extent", f"{width}x{height}"]
    else:
        cmd += ["-resize", f"{width}x>"]
    cmd += ["-quality", str(quality), "-define", "webp:method=6", out]
    run(cmd)


def convert_clip(src, out, poster, start, seconds, width=1280, crf=27):
    """A muted, looping-friendly H.264 clip and its first frame as the poster."""
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(start), "-t", str(seconds), "-i", src,
         "-vf", f"scale={width}:-2:flags=lanczos", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", out])
    tmp = poster + ".png"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", out, "-frames:v", "1", tmp])
    run(["convert", tmp, "-strip", "-quality", "78", poster])
    os.remove(tmp)


def write_credits_page(credits):
    """content/pages/credits.md: the same list as a page, one row per file, regenerated with the media."""
    rows = "\n".join(
        f"| [{c['title']}]({c['page']}) | {c['author']} | [{c['license']}]({c['licenseUrl']}) | {c['used']} |"
        if c["licenseUrl"] else f"| [{c['title']}]({c['page']}) | {c['author']} | {c['license']} | {c['used']} |"
        for c in credits)
    page = f"""---
title: Credits
status: published
description: Every photograph and clip on this site is a CC0 or CC BY file from Wikimedia Commons. Who made them, and where each one is used.
---

Ferrule is a fictional studio: a specimen site for the snypd `studio` theme. The people, clients and
numbers are invented. The photographs and clips are not — they are the work of the people below, published
under licences that allow this use, and fetched from Wikimedia Commons by `scripts/media.py`, which also
wrote this page.

The client wordmarks on the front page are set in faces this machine had and converted to outlines by
`scripts/wordmarks.py`; the clients do not exist.

| Work | Author | Licence | Used |
| --- | --- | --- | --- |
{rows}

Every CC BY file is credited here as its licence asks; every CC0 file is credited because it is polite.
"""
    open(os.path.join(ROOT, "content", "pages", "credits.md"), "w").write(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache"))
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    media = os.path.join(ROOT, "content", "media")
    sources = json.load(open(os.path.join(HERE, "sources.json")))
    only = set(filter(None, args.only.split(",")))
    meta = fetch_meta(sorted({s["commons"] for s in sources}))
    credits = []
    for s in sources:
        m = meta[s["commons"]]
        entry = {"file": s["out"], "used": s.get("used", ""), **{k: m[k] for k in ("title", "author", "license", "licenseUrl", "page")}}
        credits.append(entry)
        if only and s["out"].split(".")[0] not in only:
            continue
        cached = os.path.join(args.cache, re.sub(r"[^A-Za-z0-9_.-]+", "_", s["commons"][5:]))
        download(m["url"], cached)
        out = os.path.join(media, s["out"])
        if s.get("clip"):
            poster = os.path.join(media, s["poster"])
            convert_clip(cached, out, poster, s["clip"]["start"], s["clip"]["seconds"], s.get("width", 1280))
            print(f"clip  {s['out']:28} {os.path.getsize(out) / 1e3:7.0f} KB   poster {os.path.getsize(poster) / 1e3:5.0f} KB")
        else:
            convert_image(cached, out, s.get("width", 1600), s.get("aspect"), s.get("quality", 80))
            print(f"image {s['out']:28} {os.path.getsize(out) / 1e3:7.0f} KB   {m['license']:9} {m['author']}")
    json.dump(credits, open(os.path.join(media, "credits.json"), "w"), indent=1, ensure_ascii=False)
    write_credits_page(credits)
    total = sum(os.path.getsize(os.path.join(media, f)) for f in os.listdir(media))
    print(f"content/media: {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
