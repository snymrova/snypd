"""
F3 (docs/26 §5): full-page plates of the built sites, 1920 wide at a device scale of 2, light scheme, reduced motion
(so a count-up shows its real value and an autoplay shows its poster; the film draws its own motion).
python3 scripts/capture.py
"""
import functools, http.server, json, os, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, "assets", "captures"); OUT = os.path.join(CAP, "plates"); os.makedirs(OUT, exist_ok=True)
POST = "/posts/what-a-markdown-twin-actually-saves/"

def serve(d):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=d)
    
    s = socketserver.TCPServer(("127.0.0.1", 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f"http://127.0.0.1:{s.server_address[1]}"

jobs = [(os.path.join(CAP, "looks", l["slug"]), POST, f"look-{l['slug']}") for l in json.load(open(os.path.join(CAP, "looks", "looks.json")))]
jobs += [(os.path.join(CAP, "ferrule"), r, n) for r, n in (("/", "ferrule-home"), ("/work/", "ferrule-work"), ("/work/stem/", "ferrule-case"), ("/posts/", "ferrule-posts"))]
meta = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for d, route, name in jobs:
        s, url = serve(d)
        ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2, color_scheme="light", reduced_motion="reduce")
        pg = ctx.new_page(); pg.goto(url + route, wait_until="networkidle")
        pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager')"); pg.wait_for_timeout(300)
        for y in range(0, pg.evaluate('document.documentElement.scrollHeight'), 900): pg.evaluate(f'scrollTo(0,{y})'); pg.wait_for_timeout(120)  # a lazy image loads when it is scrolled to
        pg.evaluate('scrollTo(0,0)'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(400)
        h = pg.evaluate("document.documentElement.scrollHeight")
        marks = pg.evaluate("""() => Object.fromEntries([['chart','.snypd-chart'],['flow','.snypd-flow'],['stat','.snypd-stat-row'],['faq','.snypd-faq'],['h1','h1']]
            .map(([k,s]) => { const e = document.querySelector(s); if (!e) return [k,null]; const r = e.getBoundingClientRect(); return [k,{x:r.x,y:r.y+scrollY,w:r.width,h:r.height}] }))""")
        f = os.path.join(OUT, name + ".png"); pg.screenshot(path=f, full_page=True)
        meta[name] = {"route": route, "height": h, "marks": marks}; print(name, h, {k: v and round(v["y"]) for k, v in marks.items()}, flush=True)
        ctx.close(); s.shutdown()
    b.close()
json.dump(meta, open(os.path.join(OUT, "plates.json"), "w"), indent=1)
